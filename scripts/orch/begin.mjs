// BIJDRAGE-001 · Команди CLI для обліку авторства, досьє функцій, навичок і старту агента.
// Opdrachten: begin, bijdrage, bijdragen, onderwerp, behoud, vaardigheden-spiegel. Logica in ./bijdragen.mjs (pure functies).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  BIJDRAGEN_MAP, ONDERWERPEN_MAP, SOORTEN, behoudVergelijk, bijdragenTijdlijn, kiesOnderwerpen, maakBijdrage, valideerBijdrage, valideerOnderwerp,
} from './bijdragen.mjs';

const CATALOGUS = 'scripts/vaardigheden/catalogus.json';
export const SPIEGEL_MERK = '.gespiegeld.json';

export function maakGit(wortel) {
  return (...a) => { try { return execFileSync('git', a, { cwd: wortel, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim(); } catch { return null; } };
}

/** Усі записи обліку з робочого дерева: Map<pad, {tekst, obj|null}>. */
export function leesBijdragen(wortel) {
  const uit = new Map(); const map = join(wortel, BIJDRAGEN_MAP);
  if (!existsSync(map)) return uit;
  for (const taak of readdirSync(map).sort()) {
    const tm = join(map, taak); if (!statSync(tm).isDirectory()) continue;
    for (const f of readdirSync(tm).sort()) if (f.endsWith('.json')) {
      const pad = `${BIJDRAGEN_MAP}/${taak}/${f}`; const tekst = readFileSync(join(wortel, pad), 'utf8');
      let obj = null; try { obj = JSON.parse(tekst); } catch { obj = null; }
      uit.set(pad, { tekst, obj });
    }
  }
  return uit;
}

export function leesOnderwerpen(wortel) {
  const uit = new Map(); const map = join(wortel, ONDERWERPEN_MAP);
  if (!existsSync(map)) return uit;
  for (const f of readdirSync(map).sort()) if (f.endsWith('.json')) {
    const pad = `${ONDERWERPEN_MAP}/${f}`; let obj = null;
    try { obj = JSON.parse(readFileSync(join(wortel, pad), 'utf8')); } catch { obj = null; }
    uit.set(f.slice(0, -5), { pad, obj });
  }
  return uit;
}

/** Перевірка всіх записів і досьє (частина `orch controleer`). */
export function controleerBijdragenEnOnderwerpen(wortel) {
  const z = []; const b = leesBijdragen(wortel);
  const ids = new Set([...b.values()].map((x) => x.obj?.id).filter(Boolean));
  for (const [pad, { obj }] of b) {
    if (!obj) { z.push({ code: 'BIJDRAGE_JSON', ernst: 'fout', uk: `${pad}: недійсний JSON`, nl: `${pad}: ongeldige JSON` }); continue; }
    z.push(...valideerBijdrage(obj, { pad, bekendeIds: ids }));
  }
  for (const [, { pad, obj }] of leesOnderwerpen(wortel)) {
    if (!obj) { z.push({ code: 'ONDERWERP_JSON', ernst: 'fout', uk: `${pad}: недійсний JSON`, nl: `${pad}: ongeldige JSON` }); continue; }
    z.push(...valideerOnderwerp(obj, { pad }));
  }
  return z;
}

/** Стан з будь-якої фіксації змін (для behoud). */
function staatOp(git, ref) {
  const bijdragen = new Map(); const onderwerpen = new Map(); let catalogus = null;
  const lijst = (git('ls-tree', '-r', '--name-only', ref, '--', BIJDRAGEN_MAP, ONDERWERPEN_MAP) || '').split('\n').filter(Boolean);
  for (const pad of lijst) {
    const t = git('show', `${ref}:${pad}`); if (t === null) continue;
    if (pad.startsWith(`${BIJDRAGEN_MAP}/`)) bijdragen.set(pad, t);
    else if (pad.endsWith('.json')) { try { onderwerpen.set(pad.split('/').pop().slice(0, -5), JSON.parse(t)); } catch { /* ongeldig: controleer meldt het */ } }
  }
  const c = git('show', `${ref}:${CATALOGUS}`); if (c) { try { catalogus = JSON.parse(c); } catch { catalogus = null; } }
  return { bijdragen, onderwerpen, catalogus };
}

/** Порівняння бази з робочим деревом: нічого з обліку, досьє й навичок не зникло. */
export function behoudTegen(wortel, ref) {
  const git = maakGit(wortel);
  if (!git('rev-parse', '--verify', '-q', `${ref}^{commit}`)) return [{ code: 'BEHOUD_BASIS_ONBEKEND', ernst: 'waarschuwing', uk: `базу ${ref} не знайдено локально — перевірку збереження пропущено (git fetch)`, nl: `basis ${ref} lokaal onbekend — behoudcontrole overgeslagen` }];
  const oud = staatOp(git, ref);
  const nieuw = {
    bijdragen: new Map([...leesBijdragen(wortel)].map(([p, x]) => [p, x.tekst])),
    onderwerpen: new Map([...leesOnderwerpen(wortel)].filter(([, x]) => x.obj).map(([n, x]) => [n, x.obj])),
    catalogus: existsSync(join(wortel, CATALOGUS)) ? JSON.parse(readFileSync(join(wortel, CATALOGUS), 'utf8')) : null,
  };
  return behoudVergelijk(oud, nieuw);
}

const hash = (t) => createHash('sha256').update(t).digest('hex');
function mapHash(map) {
  const h = createHash('sha256');
  const loop = (m, rel) => { for (const n of readdirSync(m).sort()) { if (n === SPIEGEL_MERK) continue; const v = join(m, n); const r = `${rel}${n}`; if (statSync(v).isDirectory()) loop(v, `${r}/`); else { h.update(r); h.update('\0'); h.update(readFileSync(v)); h.update('\0'); } } };
  loop(map, ''); return h.digest('hex');
}

/**
 * Дзеркало навичок у теку агента (наприклад .claude/skills), щоб агент завантажував їх сам.
 * Канонічне джерело — лише .agents/skills/; дзеркало позначене .gespiegeld.json і не потрапляє в git (.gitignore).
 * Власні теки агента без позначки не чіпаємо. Map zonder merkteken blijft onaangeroerd.
 */
export function spiegelVaardigheden(wortel, doelMap) {
  const cat = JSON.parse(readFileSync(join(wortel, CATALOGUS), 'utf8'));
  const uit = { bijgewerkt: [], ongewijzigd: [], overgeslagen: [] };
  mkdirSync(join(wortel, doelMap), { recursive: true });
  for (const v of cat.vaardigheden) {
    const bron = join(wortel, '.agents/skills', v.naam); if (!existsSync(bron)) continue;
    const doel = join(wortel, doelMap, v.naam); const merk = join(doel, SPIEGEL_MERK); const h = mapHash(bron);
    if (existsSync(doel) && !existsSync(merk)) { uit.overgeslagen.push(v.naam); continue; }
    if (existsSync(merk)) { try { if (JSON.parse(readFileSync(merk, 'utf8')).sha256 === h) { uit.ongewijzigd.push(v.naam); continue; } } catch { /* opnieuw */ } rmSync(doel, { recursive: true, force: true }); }
    cpSync(bron, doel, { recursive: true });
    writeFileSync(merk, `${JSON.stringify({ schema: 1, bron: `.agents/skills/${v.naam}`, versie: v.versie, sha256: h, opmerking: 'Згенероване дзеркало. Не редагуйте тут — редагуйте .agents/skills/. Gegenereerde kopie.' }, null, 2)}\n`);
    uit.bijgewerkt.push(v.naam);
  }
  return uit;
}

const optieVan = (args) => (naam, standaard) => { const i = args.indexOf(`--${naam}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : standaard; };
const alleVan = (args) => (naam) => args.flatMap((a, i) => (a === `--${naam}` && args[i + 1] !== undefined ? [args[i + 1]] : []));
const toon = (lijst) => { for (const z of lijst) console.log(`${z.ernst === 'fout' ? 'FOUT' : 'LET OP'} ${z.code}: ${z.uk}\n     nl: ${z.nl}`); return lijst.some((z) => z.ernst === 'fout') ? 1 : 0; };

/** `orch bijdrage` — записати внесок. */
export function cliBijdrage({ wortel, args }) {
  const o = optieVan(args); const alle = alleVan(args); const git = maakGit(wortel);
  const taakId = o('taak', ''); const taakPad = join(wortel, 'orchestratie/taken', `${taakId}.json`);
  const taak = existsSync(taakPad) ? JSON.parse(readFileSync(taakPad, 'utf8')) : null;
  const basis = o('sinds', taak?.basisCommit ?? null);
  const commits = args.includes('--zonder-commits') ? [] : (basis ? (git('rev-list', '--no-merges', '--max-count=200', `${basis}..HEAD`) || '').split('\n').filter(Boolean) : []);
  const ids = new Set([...leesBijdragen(wortel).values()].map((x) => x.obj?.id).filter(Boolean));
  const tijd = o('tijd', null);
  if (tijd && Number.isNaN(Date.parse(tijd))) { console.log('FOUT BIJDRAGE_TIJD: --tijd — дата й час ISO 8601 (для роботи, зробленої раніше)'); return 1; }
  const r = maakBijdrage({
    tijd: tijd ? new Date(tijd).toISOString() : undefined, vastgelegd: tijd ? new Date().toISOString() : undefined,
    taakId, agent: o('agent', null), platform: o('platform', null), tool: o('tool', null), modelId: o('model', null), modelBron: o('model-bron', 'omgeving'),
    mens: o('mens', null), opdrachtgever: o('opdrachtgever', null), soort: o('soort', ''), watUk: o('wat', ''), watNl: o('wat-nl', null),
    waaromUk: o('waarom', null), waaromNl: o('waarom-nl', null),
    bouwtVoortOp: [...alle('bouwt-voort-op'), ...alle('voorganger').map((t) => ({ beschrijving: t }))],
    tak: o('tak', git('branch', '--show-current') || taak?.tak || null), pr: o('pr', null) ? Number(o('pr', '')) : null,
    commits, onderwerpen: alle('onderwerp'), parallel: alle('parallel').map((t) => ({ beschrijving: t })), bekendeIds: ids,
  });
  if (toon(r.zaken)) { console.log('ORCH bijdrage: НЕ записано · niet vastgelegd'); return 1; }
  const vol = join(wortel, r.pad);
  if (existsSync(vol)) { console.log(`FOUT BIJDRAGE_BESTAAT: ${r.pad} уже є — записи не перезаписують; зачекайте секунду й повторіть`); return 1; }
  mkdirSync(join(wortel, BIJDRAGEN_MAP, taakId), { recursive: true });
  writeFileSync(vol, `${JSON.stringify(r.bijdrage, null, 2)}\n`);
  console.log(`ORCH bijdrage: записано · vastgelegd ${r.pad}\n  id ${r.bijdrage.id} — додайте файл до фіксації змін разом із роботою`);
  return 0;
}

/** `orch bijdragen [--taak X] [--onderwerp Y]` — хто що робив. */
export function cliBijdragen({ wortel, args }) {
  const o = optieVan(args); const taak = o('taak', null); const ond = o('onderwerp', null);
  const alle = [...leesBijdragen(wortel).values()].map((x) => x.obj).filter(Boolean)
    .filter((b) => (!taak || b.taakId === taak) && (!ond || (b.onderwerpen ?? []).includes(ond)));
  if (args.includes('--json')) { console.log(JSON.stringify(bijdragenTijdlijn(alle), null, 2)); return 0; }
  if (!alle.length) { console.log('Записів обліку немає · geen registraties'); return 0; }
  for (const r of bijdragenTijdlijn(alle)) {
    console.log(`${r.tijd.slice(0, 16).replace('T', ' ')}  ${r.taakId}  ${r.wie} — ${r.soortUk}${r.opdrachtgever ? ` (доручив: ${r.opdrachtgever})` : ''}\n    що: ${r.wat}${r.waarom ? `\n    чому: ${r.waarom}` : ''}${r.bouwtVoortOp.length ? `\n    будує на: ${r.bouwtVoortOp.map((v) => (typeof v === 'string' ? v : v.beschrijving)).join('; ')}` : ''}${r.tak ? `\n    гілка: ${r.tak}${r.pr ? ` · запит на злиття #${r.pr}` : ''}` : ''}`);
  }
  return 0;
}

function toonOnderwerp(d, kort) {
  const act = (d.mogelijkheden ?? []).filter((m) => m.staat === 'actief' || m.staat === 'in-ontwikkeling');
  const weg = (d.mogelijkheden ?? []).filter((m) => m.staat === 'verloren');
  console.log(`\n▣ Досьє «${d.titel?.uk}» (${ONDERWERPEN_MAP}/${d.naam}.json)\n  ${d.samenvatting?.uk}`);
  console.log(`  Робота: ${(d.werk ?? []).length} записів · можливості: ${act.length} чинних, ${weg.length} утрачених (повернути!) · зауваження власника: ${(d.opmerkingenEigenaar ?? []).length}`);
  if (kort) return;
  for (const w of d.werk ?? []) console.log(`   – ${w.taakId ?? ''} ${w.tak ? `[${w.tak}]` : ''}${w.pr ? ` #${w.pr}` : ''} ${w.agent ? `(${w.agent}${w.model ? ` · ${w.model}` : ''})` : ''}: ${w.uk}`);
  for (const m of weg) console.log(`   ! утрачено «${m.id}»: ${m.uk} — ${m.reden}`);
  for (const r of d.opmerkingenEigenaar ?? []) console.log(`   ✎ ${r.datum ?? ''} про «${r.betreft}»: ${r.uk}${r.behouden?.length ? ` · лишається: ${r.behouden.join(', ')}` : ''}`);
  for (const q of d.open ?? []) console.log(`   ? ${q.uk ?? q}`);
}

/** `orch onderwerp [naam] [--zoek "слова"]`. */
export function cliOnderwerp({ wortel, args }) {
  const o = optieVan(args); const naam = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const alle = [...leesOnderwerpen(wortel).values()].map((x) => x.obj).filter(Boolean);
  if (naam) { const d = alle.find((x) => x.naam === naam); if (!d) { console.log(`FOUT ONDERWERP_ONBEKEND: ${naam} — є: ${alle.map((x) => x.naam).join(', ')}`); return 1; } toonOnderwerp(d, false); return 0; }
  const zoek = o('zoek', null);
  const lijst = zoek ? kiesOnderwerpen(alle, { tekst: zoek }).map((k) => alle.find((x) => x.naam === k.naam)) : alle;
  for (const d of lijst) toonOnderwerp(d, true);
  if (!lijst.length) console.log('Досьє не знайдено · geen dossier gevonden');
  return 0;
}

/** `orch behoud [--tegen <ref>]`. */
export function cliBehoud({ wortel, args, beleid }) {
  const ref = optieVan(args)('tegen', `origin/${beleid.integratie.tak}`);
  const z = behoudTegen(wortel, ref); const code = toon(z);
  console.log(code ? `\nORCH behoud: щось зникло відносно ${ref} · er is iets verloren` : `\nORCH behoud: нічого не втрачено відносно ${ref} · niets verloren`);
  return code;
}

/** `orch vaardigheden-spiegel --agent claude`. */
export function cliSpiegel({ wortel, args, beleid }) {
  const agent = optieVan(args)('agent', 'claude');
  const s = (beleid.vaardigheden?.spiegels ?? []).find((x) => x.agent === agent);
  if (!s) { console.log(`Агент ${agent} читає навички прямо з .agents/skills/ — дзеркало не потрібне · leest .agents/skills/ direct`); return 0; }
  const r = spiegelVaardigheden(wortel, s.map);
  console.log(`навички → ${s.map}: оновлено ${r.bijgewerkt.length}, без змін ${r.ongewijzigd.length}${r.overgeslagen.length ? `, власні теки агента не чіпано: ${r.overgeslagen.join(', ')}` : ''}`);
  return 0;
}

/**
 * `orch begin` — єдина точка входу для будь-якого агента на старті сеансу.
 * Сама: перевіряє правила, показує досьє потрібної функції, хто над нею працював і хто працює паралельно,
 * перелік навичок і (для агентів із власною текою) завантажує навички. Нічого в git не змінює.
 * --kort: для автоматичного запуску на старті сеансу (SessionStart), завжди код 0.
 */
export function cliBegin({ wortel, args, beleid, controleer }) {
  const o = optieVan(args); const alle = alleVan(args); const kort = args.includes('--kort'); const git = maakGit(wortel);
  const agent = o('agent', null); const taakId = o('taak', null);
  console.log(`ПОЧАТОК РОБОТИ · START — Mijn Ruimte, правила ${beleid.regelsVersie}`);
  console.log('Правила: AGENTS.md (канон) · orchestratie/beleid.json · orchestratie/BESLUITEN.md. Мова: українська й нідерландська.');
  let ok = 0;
  if (controleer) { const stil = console.log; const regels = []; console.log = (...a) => regels.push(a.join(' ')); try { ok = controleer(); } finally { console.log = stil; } console.log(ok ? `✗ orch controleer: є помилки (${regels.filter((r) => r.startsWith('FOUT')).length}) — запустіть node scripts/orch.mjs controleer` : '✓ orch controleer: правила чинні'); }
  // 1) Навички.
  let cat = null; try { cat = JSON.parse(readFileSync(join(wortel, CATALOGUS), 'utf8')); } catch { cat = null; }
  if (cat) {
    console.log(`\n▣ Навички (${cat.vaardigheden.length}, джерело .agents/skills/, каталог ${CATALOGUS}). Перед роботою добери: node scripts/vaardigheden/kies.mjs "<завдання>"`);
    for (const v of cat.vaardigheden) console.log(`   – ${v.naam} ${v.versie}: ${v.samenvatting?.uk}`);
    const s = agent ? (beleid.vaardigheden?.spiegels ?? []).find((x) => x.agent === agent) : null;
    if (s) { try { const r = spiegelVaardigheden(wortel, s.map); console.log(`   ↳ завантажено у ${s.map}: нових/оновлених ${r.bijgewerkt.length}, без змін ${r.ongewijzigd.length}`); } catch (e) { console.log(`   ↳ не вдалося завантажити у ${s.map}: ${e.message}`); } }
    console.log('   Нова навичка → .agents/skills/<назва>/SKILL.md + запис у каталозі (з mogelijkheden). Можливості не видаляються; непідтримувану кимось опцію позначають у agenten.');
  }
  // 2) Досьє функцій.
  const onderwerpen = [...leesOnderwerpen(wortel).values()].map((x) => x.obj).filter(Boolean);
  const taakPad = taakId ? join(wortel, 'orchestratie/taken', `${taakId}.json`) : null;
  const taak = taakPad && existsSync(taakPad) ? JSON.parse(readFileSync(taakPad, 'utf8')) : null;
  const eigen = taak?.basisCommit ? (git('diff', '--name-only', `${taak.basisCommit}...HEAD`) || '').split('\n').filter(Boolean) : [];
  const gekozen = new Set([...alle('onderwerp'), ...(taak?.onderwerpen ?? []), ...kiesOnderwerpen(onderwerpen, { tekst: [o('tekst', ''), taak?.omschrijving ?? ''].join(' '), bestanden: eigen }).map((k) => k.naam)]);
  if (onderwerpen.length) {
    console.log(`\n▣ Досьє функцій (${ONDERWERPEN_MAP}/): ${onderwerpen.map((d) => d.naam).join(', ')}. Перед зміною функції прочитайте її досьє: node scripts/orch.mjs onderwerp <назва>`);
    for (const d of onderwerpen.filter((x) => gekozen.has(x.naam))) toonOnderwerp(d, kort);
  }
  // 3) Хто працював і хто працює паралельно.
  const bijdragen = [...leesBijdragen(wortel).values()].map((x) => x.obj).filter(Boolean);
  if (taak) {
    const eigenB = bijdragen.filter((b) => b.taakId === taak.id);
    console.log(`\n▣ Задача ${taak.id}: ${eigenB.length} записів обліку${eigenB.length ? '' : ' — запишіть перший: node scripts/orch.mjs bijdrage --taak ' + taak.id + ' --soort begin …'}`);
    for (const r of bijdragenTijdlijn(eigenB).slice(-(kort ? 3 : 50))) console.log(`   – ${r.tijd.slice(0, 16)} ${r.wie}: ${r.soortUk} — ${r.wat}`);
  }
  const takenMap = join(wortel, 'orchestratie/taken'); const actief = [];
  if (existsSync(takenMap)) for (const f of readdirSync(takenMap).filter((n) => n.endsWith('.json'))) {
    try { const t = JSON.parse(readFileSync(join(takenMap, f), 'utf8')); if (['in_progress', 'ter_integratie'].includes(t.staat) && t.id !== taakId) actief.push(t); } catch { /* controleer meldt */ }
  }
  actief.sort((x, y) => String(y.bijgewerkt ?? y.gestart ?? '').localeCompare(String(x.bijgewerkt ?? x.gestart ?? '')));
  const raakt = actief.filter((t) => !gekozen.size || (t.onderwerpen ?? []).some((n) => gekozen.has(n)) || bijdragen.some((b) => b.taakId === t.id && (b.onderwerpen ?? []).some((n) => gekozen.has(n))));
  console.log(`\n▣ Паралельна робота: ${actief.length} незавершених задач${gekozen.size ? `, з них стосуються тієї ж функції: ${raakt.length}` : ''}`);
  for (const t of (gekozen.size ? raakt : actief).slice(0, kort ? 5 : 40)) console.log(`   – ${t.id} (${t.agent}) ${t.tak}: ${String(t.omschrijving ?? '').slice(0, 140)}`);
  console.log(`\nДалі: зареєструйте задачу (taak-start), запишіть внесок (node scripts/orch.mjs bijdrage --taak <ID> --agent <id> --platform "<платформа>" --model <модель> --opdrachtgever "<людина>" --soort begin|nieuw|herwerkt|afgerond|overname|herstel --wat "…" [--waarom "…"] [--bouwt-voort-op <id>]).`);
  console.log('Зауваження власника стосується конкретної речі — покращуйте її, решту зберігайте. Нічого не видаляйте під час злиття; утрачене позначайте в досьє й повертайте.');
  console.log(`Види внеску: ${Object.entries(SOORTEN).map(([k, v]) => `${k} (${v.uk})`).join(', ')}.`);
  return kort ? 0 : ok;
}
