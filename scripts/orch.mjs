#!/usr/bin/env node
// ORCH-001 · CLI координації ШІ-агентів. Gebruik: node scripts/orch.mjs <opdracht> [opties]
//   controleer                  beleid.json, lock, адаптери, задачі, черга — повна перевірка (вихід 1 при помилці)
//   vergrendel                  оновити orchestratie/regels.lock.json (після зміни правил + вищої regelsVersie)
//   context                     згенерувати orchestratie/CONTEXT-COMPACT.md для агентів без GitHub/MCP
//   taak-start --id X --agent a --basis <sha40> --tak <гілка>   зареєструвати задачу (orchestratie/taken/X.json)
//   taak-staat --id X --staat <staat>                           змінити статус задачі
//   versheid --taak X --fase start|overdracht                   звірити правила й базу з git (HEAD, інтеграційна гілка)
//   onderteken-bericht          рядок для підпису власника (ssh-keygen -Y sign -n mijn-ruimte-regels)
//   bevestig <bericht.sig>      перевірити підпис власника та записати його в lock
// Усі тексти uk+nl, усі перевірки — чисті функції в scripts/orch/kern.mjs (тести: tests/eenheid/orch-*.test.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHA40, compacteContext, controleerAdapter, controleerLock, eigenaarStatus, kritiekBericht, valideerBeleid, valideerTaak,
  vergrendel, verifieerSshsig, versheid, REGELS_NAMESPACE, TAAK_STATEN,
} from './orch/kern.mjs';

const wortel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => join(wortel, p);
const lees = (p) => readFileSync(P(p), 'utf8');
const leesJson = (p) => JSON.parse(lees(p));
const schrijfJson = (p, w) => writeFileSync(P(p), `${JSON.stringify(w, null, 2)}\n`);
const LOCK = 'orchestratie/regels.lock.json';
const TAKEN = 'orchestratie/taken';

const args = process.argv.slice(2);
const opdracht = args[0];
const optie = (naam, standaard) => { const i = args.indexOf(`--${naam}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : standaard; };

const toon = (lijst) => {
  for (const z of lijst) console.log(`${z.ernst === 'fout' ? 'FOUT' : 'LET OP'} ${z.code}: ${z.uk}\n     nl: ${z.nl}`);
  return lijst.some((z) => z.ernst === 'fout') ? 1 : 0;
};
function git(...a) { try { return execFileSync('git', a, { cwd: wortel, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } }

function laadBeleid() {
  const beleid = leesJson('orchestratie/beleid.json');
  const z = valideerBeleid(beleid);
  if (z.length) { toon(z); throw new Error('beleid.json ongeldig'); }
  return beleid;
}
const regelBestanden = (beleid) => Object.fromEntries(beleid.regelBestanden.map((p) => [p, lees(p)]));
const laadLock = () => (existsSync(P(LOCK)) ? leesJson(LOCK) : null);

function controleer() {
  const beleid = leesJson('orchestratie/beleid.json');
  let z = valideerBeleid(beleid);
  if (z.length) return toon(z);
  const lock = laadLock();
  z = z.concat(controleerLock(beleid, regelBestanden(beleid), lock));
  for (const pad of beleid.adapters.bestanden) if (existsSync(P(pad))) z = z.concat(controleerAdapter(pad, lees(pad), beleid.adapters.maxRegels));
  // Кожен зареєстрований агент має адаптер; відсутній — лише попередження (агент може ще не під'єднуватись).
  for (const ag of beleid.agenten) if (ag.adapter && !existsSync(P(ag.adapter))) z.push({ code: 'ADAPTER_ONTBREEKT', ernst: 'waarschuwing', uk: `адаптер ${ag.adapter} для агента ${ag.id} ще не створено`, nl: `adapter ${ag.adapter} voor agent ${ag.id} bestaat nog niet` });
  if (existsSync(P(TAKEN))) for (const f of readdirSync(P(TAKEN)).filter((n) => n.endsWith('.json'))) {
    const t = leesJson(`${TAKEN}/${f}`);
    z = z.concat(valideerTaak(t, beleid));
    if (t.id && f !== `${t.id}.json`) z.push({ code: 'TAAK_BESTANDSNAAM', ernst: 'fout', uk: `${f}: назва файла має бути ${t.id}.json`, nl: `${f}: bestandsnaam moet ${t.id}.json zijn` });
  }
  if (existsSync(P(beleid.integratie.wachtrij))) {
    const w = leesJson(beleid.integratie.wachtrij);
    if (!Array.isArray(w.wachtrij)) z.push({ code: 'WACHTRIJ_ONGELDIG', ernst: 'fout', uk: 'wachtrij.json: поле wachtrij має бути масивом', nl: 'wachtrij.json: veld wachtrij moet een lijst zijn' });
    else for (const r of w.wachtrij) if (!existsSync(P(`${TAKEN}/${r.taakId}.json`))) z.push({ code: 'WACHTRIJ_TAAK', ernst: 'fout', uk: `у черзі задача ${r.taakId} без запису в ${TAKEN}`, nl: `wachtrij verwijst naar taak ${r.taakId} zonder bestand in ${TAKEN}` });
  }
  const ctx = beleid.compactContext.bestand;
  if (existsSync(P(ctx))) {
    const verwacht = compacteContext(lees('AGENTS.md'), beleid, lock);
    if (lees(ctx) !== verwacht) z.push({ code: 'CONTEXT_VEROUDERD', ernst: 'fout', uk: `${ctx} застарів — виконайте node scripts/orch.mjs context`, nl: `${ctx} is verouderd — voer node scripts/orch.mjs context uit` });
    if (Buffer.byteLength(verwacht) > beleid.compactContext.maxBytes) z.push({ code: 'CONTEXT_TE_GROOT', ernst: 'fout', uk: `${ctx} більший за ${beleid.compactContext.maxBytes} байтів — скоротіть compact-блоки AGENTS.md`, nl: `${ctx} groter dan ${beleid.compactContext.maxBytes} bytes — kort de compact-blokken in AGENTS.md in` });
  } else z.push({ code: 'CONTEXT_ONTBREEKT', ernst: 'fout', uk: `${ctx} відсутній — node scripts/orch.mjs context`, nl: `${ctx} ontbreekt — node scripts/orch.mjs context` });
  const e = lock ? eigenaarStatus(lock, lock.eigenaar ? verifieerEigenaar(lock) : null) : null;
  if (e) z.push(e);
  const code = toon(z);
  console.log(code ? '\nORCH: перевірку НЕ пройдено · controle NIET geslaagd' : `\nORCH: усе гаразд · alles in orde (regelsVersie ${beleid.regelsVersie}, hash ${lock?.hash.slice(0, 12)}…)`);
  return code;
}

function verifieerEigenaar(lock) {
  const toegestaan = existsSync(P('orchestratie/eigenaar-ondertekenaars')) ? lees('orchestratie/eigenaar-ondertekenaars') : '';
  return verifieerSshsig({ handtekening: lock.eigenaar.handtekening, bericht: kritiekBericht(lock), namespace: REGELS_NAMESPACE, toegestaan });
}

function doeVergrendel() {
  const beleid = laadBeleid();
  const r = vergrendel(beleid, regelBestanden(beleid), laadLock());
  if (r.fout) return toon([r.fout]);
  schrijfJson(LOCK, r.lock);
  console.log(`vergrendeld: ${LOCK} (regelsVersie ${r.lock.regelsVersie}, hash ${r.lock.hash})`);
  return 0;
}

function doeContext() {
  const beleid = laadBeleid();
  const tekst = compacteContext(lees('AGENTS.md'), beleid, laadLock());
  writeFileSync(P(beleid.compactContext.bestand), tekst);
  console.log(`geschreven: ${beleid.compactContext.bestand} (${Buffer.byteLength(tekst)} bytes)`);
  return 0;
}

function taakStart() {
  const beleid = laadBeleid(); const lock = laadLock();
  const t = {
    schema: 1, id: optie('id', ''), agent: optie('agent', ''), tak: optie('tak', ''), basisCommit: optie('basis', ''),
    basisVersie: beleid.basis.versie, regelsVersie: beleid.regelsVersie, regelsHash: lock?.hash ?? null,
    staat: 'in_progress', gestart: new Date().toISOString(), bijgewerkt: new Date().toISOString(),
    omschrijving: optie('omschrijving', ''), kanaal: optie('kanaal', 'github_pr'), overdrachten: [],
  };
  const z = valideerTaak(t, beleid);
  if (toon(z)) return 1;
  mkdirSync(P(TAKEN), { recursive: true });
  const pad = `${TAKEN}/${t.id}.json`;
  if (existsSync(P(pad))) { console.log(`FOUT TAAK_BESTAAT: ${pad} уже існує — використайте taak-staat або інший id`); return 1; }
  schrijfJson(pad, t); console.log(`taak geregistreerd: ${pad}`); return 0;
}

function taakStaat() {
  const pad = `${TAKEN}/${optie('id', '')}.json`; const staat = optie('staat', '');
  if (!existsSync(P(pad))) { console.log(`FOUT TAAK_ONBEKEND: ${pad}`); return 1; }
  if (!TAAK_STATEN.includes(staat)) { console.log(`FOUT TAAK_STAAT: ${staat} — одне з ${TAAK_STATEN.join(', ')}`); return 1; }
  if (staat === 'installed') { console.log('FOUT INSTALLED_ALLEEN_INSTALLER: статус installed ставить лише інсталятор на сервері (overdracht-import), не агент'); return 1; }
  const t = leesJson(pad); t.staat = staat; t.bijgewerkt = new Date().toISOString(); schrijfJson(pad, t); console.log(`${t.id}: ${staat}`); return 0;
}

function doeVersheid() {
  const beleid = laadBeleid(); const lock = laadLock();
  const pad = `${TAKEN}/${optie('taak', '')}.json`;
  if (!existsSync(P(pad))) { console.log(`FOUT TAAK_ONBEKEND: ${pad}`); return 1; }
  const taak = leesJson(pad); const fase = optie('fase', 'start');
  const head = git('rev-parse', 'HEAD');
  const feiten = { taak, fase, regelsVersie: beleid.regelsVersie, regelsHash: lock?.hash ?? null, headIsAfstammeling: null, integratieVoorsprong: [], eigenBestanden: [], schoon: null };
  if (head) {
    feiten.headIsAfstammeling = git('merge-base', '--is-ancestor', taak.basisCommit, 'HEAD') !== null;
    feiten.schoon = git('status', '--porcelain', '--untracked-files=no') === '';
    const integratie = ['origin/' + beleid.integratie.tak, beleid.integratie.tak, 'origin/' + beleid.integratie.basisTak].find((r) => git('rev-parse', '--verify', '-q', r));
    if (integratie) {
      const voor = (git('rev-list', '--reverse', `${taak.basisCommit}..${integratie}`) || '').split('\n').filter(Boolean);
      feiten.integratieVoorsprong = voor.map((sha) => ({ sha, bestanden: (git('diff-tree', '--no-commit-id', '--name-only', '-r', sha) || '').split('\n').filter(Boolean) }));
      feiten.eigenBestanden = (git('diff', '--name-only', `${taak.basisCommit}...HEAD`) || '').split('\n').filter(Boolean);
    }
    console.log(`HEAD ${head.slice(0, 12)} · basis ${taak.basisCommit.slice(0, 12)} · integratie ${integratie ?? '— (niet gevonden)'} · eigen bestanden ${feiten.eigenBestanden.length}`);
  } else console.log('LET OP: geen git — alleen regels gecontroleerd, basis niet');
  const z = versheid(feiten);
  const code = toon(z);
  console.log(code ? `\nORCH versheid (${fase}): NIET vers` : `\nORCH versheid (${fase}): vers · свіжо`);
  return code;
}

function ondertekenBericht() {
  const lock = laadLock(); if (!lock) { console.log('FOUT GEEN_LOCK: eerst vergrendel'); return 1; }
  process.stdout.write(kritiekBericht(lock));
  console.error(`\n# Власник на своєму ПК: ssh-keygen -Y sign -f <приватний ключ> -n ${REGELS_NAMESPACE} bericht.txt → bericht.txt.sig; потім node scripts/orch.mjs bevestig bericht.txt.sig`);
  return 0;
}

function bevestig() {
  const lock = laadLock(); const sigPad = args[1];
  if (!lock || !sigPad) { console.log('gebruik: bevestig <bericht.sig>'); return 1; }
  const handtekening = readFileSync(resolve(sigPad), 'utf8');
  const r = verifieerSshsig({ handtekening, bericht: kritiekBericht(lock), namespace: REGELS_NAMESPACE, toegestaan: lees('orchestratie/eigenaar-ondertekenaars') });
  if (!r.ok) { console.log(`FOUT HANDTEKENING_ONGELDIG: ${r.reden}`); return 1; }
  lock.eigenaar = { kritiekHash: lock.kritiekHash, regelsVersie: lock.regelsVersie, sleutel: r.sleutel, handtekening: handtekening.trim(), op: new Date().toISOString() };
  schrijfJson(LOCK, lock); console.log(`bevestigd door eigenaar (sleutel ${r.sleutel}) voor kritiekHash ${lock.kritiekHash}`); return 0;
}

const tabel = { controleer, vergrendel: doeVergrendel, context: doeContext, 'taak-start': taakStart, 'taak-staat': taakStaat, versheid: doeVersheid, 'onderteken-bericht': ondertekenBericht, bevestig };
if (!tabel[opdracht]) { console.log(`gebruik: node scripts/orch.mjs <${Object.keys(tabel).join('|')}>`); process.exit(2); }
try { process.exit(tabel[opdracht]()); } catch (e) { console.log(`FOUT: ${e.message}`); process.exit(1); }
