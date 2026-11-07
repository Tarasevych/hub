#!/usr/bin/env node
// ORCH-001 · CLI координації ШІ-агентів. Gebruik: node scripts/orch.mjs <opdracht> [opties]
//   controleer                  beleid.json, lock, адаптери, задачі, черга — повна перевірка (вихід 1 при помилці)
//   vergrendel                  оновити orchestratie/regels.lock.json (після зміни правил + вищої regelsVersie)
//   context                     згенерувати orchestratie/CONTEXT-COMPACT.md для агентів без GitHub/MCP
//   taak-start --id X --agent a --basis <sha40> --tak <гілка>   зареєструвати задачу (orchestratie/taken/X.json)
//   taak-staat --id X --staat <staat>                           змінити статус задачі
//   taak-herlees --id X                                         «я перечитав правила»: оновити regelsVersie/regelsHash задачі до чинних
//   versheid --taak X --fase start|overdracht                   звірити правила й базу з git (HEAD, інтеграційна гілка)
//   onderteken-bericht          рядок для підпису власника (ssh-keygen -Y sign -n mijn-ruimte-regels)
//   bevestig <bericht.sig>      перевірити підпис власника та записати його в lock
//   inleveren --bron <zip|tar.gz|patch|map|git-ref> [--kanaal k] [--overdracht pad.json] [--taak X] [--tests "cmd"]… [--standaardtests] [--zonder-tests "reden"] [--push]
//                               прийняти результат агента з будь-якого каналу: гілка від бази, зміни, конфлікти, перевірка правил, запис, черга.
//                               Завжди лише довірений controleer (без коду з пакета). --tests / --standaardtests (beleid.inlevering.standaardTests)
//                               ВИКОНУЮТЬ КОД ІЗ ПАКЕТА АГЕНТА на цій машині — лише для перевірених пакетів, в ізольованому середовищі.
//   wachtrij toon|volgende|klaar|terugtrekken   послідовна черга інтеграції (klaar: --taak X --uitkomst integrated|afgewezen [--hoofd sha])
//   status                      огляд задач: in_progress / integrated / released / installed (installed — лише з orchestratie/geinstalleerd.json)
//   werkruimte --taak X [--pad P]   ізольоване робоче дерево (git worktree) для задачі
//   staat-commit [--bericht "…"]    закомітити лише файли стану координації (taken, inleveringen, wachtrij, geinstalleerd)
//   pakket --taak X --auteur "Імʼя" [--versie V] [--uit map] [--manifest m.json] [--testresultaten t.json] [--sig p.sig] [--samenvatting-uk …] [--samenvatting-nl …] [--niet-gedaan …]
//                               зібрати mijn-ruimte-<V>.tar.gz (сумісний, через maak-voorstelpakket.sh, з UITROL-BASIS) + mijn-ruimte-<V>-<agent>-overdracht.zip
//   pakket-controleer --bron <zip>  перевірити пакет передачі без встановлення (цілісність, метадані, база, правила)
// Усі тексти uk+nl, усі перевірки — чисті функції в scripts/orch/kern.mjs (тести: tests/eenheid/orch-*.test.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTEXT_PAD, SHA40, compacteContext, controleerAdapter, controleerLock, eigenaarStatus, kritiekBericht, normaliseer, statusAfleiden, valideerBeleid, valideerTaak,
  vergrendel, verifieerSshsig, versheid, wachtrijKlaar, wachtrijTerugtrekken, wachtrijVolgende, REGELS_NAMESPACE, TAAK_STATEN,
} from './orch/kern.mjs';
import { inleveren, registreerInlevering } from './orch/inleveren.mjs';
import { basisVoorPakket, controleerOverdrachtPakket, maakOverdrachtPakket } from './orch/pakket.mjs';

const args = process.argv.slice(2);
const opdracht = args[0];
const optie = (naam, standaard) => { const i = args.indexOf(`--${naam}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : standaard; };

const wortel = optie('wortel', null) ? resolve(optie('wortel', '')) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => join(wortel, p);
const lees = (p) => readFileSync(P(p), 'utf8');
const leesJson = (p) => JSON.parse(lees(p));
const schrijfJson = (p, w) => writeFileSync(P(p), `${JSON.stringify(w, null, 2)}\n`);
const LOCK = 'orchestratie/regels.lock.json';
const TAKEN = 'orchestratie/taken';

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
    if (normaliseer(lees(ctx)) !== normaliseer(verwacht)) z.push({ code: 'CONTEXT_VEROUDERD', ernst: 'fout', uk: `${ctx} застарів — виконайте node scripts/orch.mjs context`, nl: `${ctx} is verouderd — voer node scripts/orch.mjs context uit` });
    if (Buffer.byteLength(verwacht) > beleid.compactContext.maxBytes) z.push({ code: 'CONTEXT_TE_GROOT', ernst: 'fout', uk: `${ctx} більший за ${beleid.compactContext.maxBytes} байтів — скоротіть compact-блоки AGENTS.md`, nl: `${ctx} groter dan ${beleid.compactContext.maxBytes} bytes — kort de compact-blokken in AGENTS.md in` });
  } else z.push({ code: 'CONTEXT_ONTBREEKT', ernst: 'fout', uk: `${ctx} відсутній — node scripts/orch.mjs context`, nl: `${ctx} ontbreekt — node scripts/orch.mjs context` });
  // Етап 3: підтвердження passkey (lock.eigenaar.soort = 'passkey') перевіряє root на сервері; тут лише SSH-підпис звіряється локально.
  const e = lock ? eigenaarStatus(lock, lock.eigenaar?.handtekening ? verifieerEigenaar(lock) : null) : null;
  if (e) z.push(e);
  if (lock?.eigenaar?.soort === 'passkey' && !e) console.log(`eigenaar: підтверджено passkey ${lock.eigenaar.passkey} (рішення ${lock.eigenaar.besluit}, ${lock.eigenaar.op}) · звірку з root-журналом робить GitOps/інсталятор`);
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
  if (!CONTEXT_PAD.test(String(beleid.compactContext?.bestand || ''))) { console.log('FOUT CONTEXT_PAD: compactContext.bestand — лише orchestratie/<назва>.md · nl: alleen orchestratie/<naam>.md'); return 1; }
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

function taakHerlees() {
  const beleid = laadBeleid(); const lock = laadLock(); const pad = `${TAKEN}/${optie('id', '')}.json`;
  if (!existsSync(P(pad))) { console.log(`FOUT TAAK_ONBEKEND: ${pad}`); return 1; }
  const t = leesJson(pad); const van = t.regelsVersie; t.regelsVersie = beleid.regelsVersie; t.regelsHash = lock?.hash ?? null; t.bijgewerkt = new Date().toISOString();
  t.regelsHerlezen = [...(t.regelsHerlezen ?? []), { van, naar: beleid.regelsVersie, op: t.bijgewerkt }];
  schrijfJson(pad, t); console.log(`${t.id}: regels ${van} → ${beleid.regelsVersie} (${lock?.hash.slice(0, 12)}…)`); return 0;
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
      const voor = (git('rev-list', '--reverse', `${feiten.headIsAfstammeling ? 'HEAD' : taak.basisCommit}..${integratie}`) || '').split('\n').filter(Boolean);
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

const optiesAlle = (naam) => args.flatMap((a, i) => (a === `--${naam}` && args[i + 1] !== undefined ? [args[i + 1]] : []));

function doeInleveren() {
  const beleid = laadBeleid(); const lock = laadLock();
  const bron = optie('bron', ''); if (!bron) { console.log('gebruik: inleveren --bron <zip|tar.gz|patch|map|git-ref> [--kanaal k] [--overdracht pad.json] [--taak X]'); return 2; }
  const tests = optiesAlle('tests');
  const standaardTests = args.includes('--standaardtests');
  const shell = [...tests, ...(standaardTests && !tests.length ? beleid.inlevering?.standaardTests ?? [] : [])].filter((c) => String(c).trim() !== 'node scripts/orch.mjs controleer');
  if (shell.length && !optie('zonder-tests', null)) console.log(`LET OP: виконую КОД ІЗ ПАКЕТА АГЕНТА на цій машині (${shell.join(' ; ')}) — середовище очищене від секретів, але з вашим HOME. Лише для пакетів, яким ви довіряєте.\n     nl: code UIT HET PAKKET van de agent wordt op deze machine uitgevoerd (${shell.join(' ; ')}) — env zonder geheimen, maar met uw HOME. Alleen voor pakketten die u vertrouwt.`);
  const record = inleveren({ wortel, beleid, lock, bron, kanaal: optie('kanaal', null), overdrachtPad: optie('overdracht', null), taakId: optie('taak', null), tests: tests.length ? tests : undefined, standaardTests, zonderTests: optie('zonder-tests', null), integratieRef: optie('integratie', null) });
  const uit = registreerInlevering(wortel, record);
  for (const z of record.zaken) console.log(`${z.ernst === 'fout' ? 'FOUT' : 'LET OP'} ${z.code}: ${z.uk}\n     nl: ${z.nl}`);
  console.log(`\nORCH inleveren: ${record.uitkomst === 'aanvaard' ? 'ПРИЙНЯТО · aanvaard' : 'ВІДХИЛЕНО · geweigerd'} · kanaal ${record.kanaal ?? '—'} · taak ${record.taakId ?? '—'} · tak ${record.tak ?? '—'} · commit ${record.commit?.slice(0, 12) ?? '—'} · bestanden ${record.bestanden.length} · tests ${record.tests ? `${record.tests.geslaagd} ok / ${record.tests.mislukt} mis${record.tests.overgeslagen ? ` · agenttests overgeslagen (${record.tests.reden})` : ''}` : '—'}`);
  console.log(`record: ${uit.recordPad}${uit.taakBijgewerkt ? ' · taak ter_integratie' : ''}${uit.wachtrij ? ` · wachtrij: ${typeof uit.wachtrij === 'string' ? uit.wachtrij : uit.wachtrij.code}` : ''}`);
  if (record.uitkomst === 'aanvaard' && args.includes('--push')) {
    const p = git('push', '-u', 'origin', record.tak);
    console.log(p === null ? 'LET OP PUSH_MISLUKT: гілку не вдалося відправити — зробіть git push -u origin ' + record.tak : `gepusht: origin/${record.tak}`);
    const remote = git('remote', 'get-url', 'origin') || ''; const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(remote);
    if (m) console.log(`PR (draft) проти ${beleid.integratie.tak}: https://github.com/${m[1]}/compare/${encodeURIComponent(beleid.integratie.tak)}...${encodeURIComponent(record.tak)}?expand=1`);
  }
  return record.uitkomst === 'aanvaard' ? 0 : 1;
}

function doeWachtrij() {
  const beleid = laadBeleid(); const pad = beleid.integratie.wachtrij; const w = existsSync(P(pad)) ? leesJson(pad) : { schema: 1, integratieTak: beleid.integratie.tak, integratieHoofd: null, bezig: null, wachtrij: [] };
  const sub = args[1] || 'toon';
  if (sub === 'toon') {
    console.log(`integratie: ${w.integratieTak} @ ${w.integratieHoofd ?? '—'} · bezig: ${w.bezig ?? '—'} · wacht: ${w.wachtrij.filter((r) => r.staat === 'wacht').length}`);
    for (const r of w.wachtrij) console.log(`  [${r.staat}] ${r.taakId} (${r.agent}) ${r.tak} basis ${r.basisCommit?.slice(0, 12)} via ${r.kanaal} · ${r.ingediend}`);
    return 0;
  }
  let r;
  if (sub === 'volgende') {
    r = wachtrijVolgende(w);
    if (!r.fout) {
      const i = r.item; const zRef = git('rev-parse', '--verify', '-q', `origin/${w.integratieTak}`) ? `origin/${w.integratieTak}` : w.integratieTak;
      // Стан координації (orchestratie/taken, wachtrij, inleveringen, geinstalleerd) при злитті лишається з integratie: .gitattributes merge=orch-staat,
      // драйвер «true» = залишити нашу версію. Локальна конфігурація репозиторію, нічого поза ним.
      git('config', 'merge.orch-staat.driver', 'true');
      console.log(`наступна · volgende: ${i.taakId} (${i.agent}) tak ${i.tak}\n  1) git fetch origin && git checkout ${w.integratieTak} && git merge --no-ff ${i.tak}   (без force; стан координації лишається з integratie (merge=orch-staat); інші конфлікти → wachtrij klaar --uitkomst afgewezen)\n  2) тести на integratie\n  3) node scripts/orch.mjs wachtrij klaar --taak ${i.taakId} --uitkomst integrated --hoofd $(git rev-parse ${w.integratieTak})`);
      if (zRef && git('merge-base', '--is-ancestor', i.basisCommit, zRef) === null) console.log(`LET OP BASIS_NIET_IN_INTEGRATIE: база ${i.basisCommit.slice(0, 12)} не є предком ${zRef}`);
    }
  } else if (sub === 'klaar') {
    r = wachtrijKlaar(w, optie('taak', ''), optie('uitkomst', ''), optie('hoofd', ''));
    if (!r.fout) {
      const tp = `${TAKEN}/${r.item.taakId}.json`;
      if (existsSync(P(tp))) { const t = leesJson(tp); if (r.item.staat === 'integrated') { t.staat = 'integrated'; t.integratieCommit = r.item.integratieHoofd; } else t.staat = 'in_progress'; t.bijgewerkt = new Date().toISOString(); schrijfJson(tp, t); }
      console.log(`${r.item.taakId}: ${r.item.staat}${r.item.integratieHoofd ? ` @ ${r.item.integratieHoofd.slice(0, 12)}` : ''}`);
    }
  } else if (sub === 'terugtrekken') {
    r = wachtrijTerugtrekken(w, optie('taak', ''), optie('reden', ''));
    if (!r.fout) { const tp = `${TAKEN}/${optie('taak', '')}.json`; if (existsSync(P(tp))) { const t = leesJson(tp); t.staat = 'in_progress'; t.bijgewerkt = new Date().toISOString(); schrijfJson(tp, t); } console.log(`${optie('taak', '')}: teruggetrokken`); }
  } else { console.log('gebruik: wachtrij toon|volgende|klaar|terugtrekken'); return 2; }
  if (r.fout) return toon([r.fout]);
  schrijfJson(pad, r.w); return 0;
}

function doeStatus() {
  const beleid = laadBeleid();
  const gi = existsSync(P(beleid.geinstalleerd.bestand)) ? leesJson(beleid.geinstalleerd.bestand) : null;
  const isVoorouder = (a, b) => git('merge-base', '--is-ancestor', a, b) !== null;
  console.log(`basis: ${beleid.basis.versie} @ ${beleid.basis.bronCommit.slice(0, 12)} (${beleid.basis.verificatie}) · geïnstalleerd: ${gi ? `${gi.versie} @ ${gi.bronCommit.slice(0, 12)} (${gi.bron})` : 'onbekend — orchestratie/geinstalleerd.json ontbreekt'}`);
  if (!existsSync(P(TAKEN))) return 0;
  for (const f of readdirSync(P(TAKEN)).filter((n) => n.endsWith('.json'))) {
    const t = leesJson(`${TAKEN}/${f}`); const s = statusAfleiden(t, gi, isVoorouder);
    console.log(`  ${t.id.padEnd(10)} ${s.status.padEnd(12)} ${t.agent.padEnd(12)} ${t.tak}  — ${s.bron}`);
  }
  return 0;
}

function doeWerkruimte() {
  const beleid = laadBeleid(); const id = optie('taak', ''); const tp = `${TAKEN}/${id}.json`;
  if (!existsSync(P(tp))) { console.log(`FOUT TAAK_ONBEKEND: ${tp}`); return 1; }
  const t = leesJson(tp); const pad = resolve(wortel, optie('pad', join(beleid.werkruimte.map, id)));
  const bestaat = git('rev-parse', '--verify', '-q', t.tak) !== null;
  const r = bestaat ? git('worktree', 'add', pad, t.tak) : git('worktree', 'add', '-b', t.tak, pad, t.basisCommit);
  if (r === null) { console.log(`FOUT WERKRUIMTE_MISLUKT: git worktree add ${pad}`); return 1; }
  console.log(`werkruimte: ${pad} (tak ${t.tak}${bestaat ? '' : ` nieuw vanaf ${t.basisCommit.slice(0, 12)}`})`); return 0;
}

function staatCommit() {
  const paden = ['orchestratie/taken', 'orchestratie/inleveringen', 'orchestratie/wachtrij.json', 'orchestratie/geinstalleerd.json'].filter((p) => existsSync(P(p)));
  if (git('add', '--', ...paden) === null) { console.log('FOUT STAAT_ADD: git add мислукт'); return 1; }
  const gestaged = git('diff', '--cached', '--name-only', '--', ...paden) || '';
  if (!gestaged) { console.log('niets te committen: стан координації не змінився'); return 0; }
  const buiten = (git('diff', '--cached', '--name-only') || '').split('\n').filter((p) => p && !paden.some((q) => p === q || p.startsWith(`${q}/`)));
  if (buiten.length) { console.log(`FOUT STAAT_GEMENGD: у stage є інші файли (${buiten.join(', ')}) — закомітьте їх окремо`); return 1; }
  const r = git('commit', '-q', '-m', optie('bericht', `orch: стан координації · coördinatiestaat (${gestaged.split('\n').length} bestanden)`), '--', ...paden);
  console.log(r === null ? 'FOUT STAAT_COMMIT' : `gecommit: ${gestaged.split('\n').join(', ')}`); return r === null ? 1 : 0;
}

function doePakket() {
  const beleid = laadBeleid(); const lock = laadLock();
  const modelId = optie('model-id', null);
  const r = maakOverdrachtPakket({ wortel, beleid, lock, taakId: optie('taak', ''), auteur: optie('auteur', ''), agent: optie('agent', undefined), versie: optie('versie', undefined), uit: optie('uit', join(wortel, 'uitvoer')),
    manifestPad: optie('manifest', undefined), testresultatenPad: optie('testresultaten', undefined), sigPad: optie('sig', undefined), agentPlatform: optie('platform', undefined), agentTool: optie('tool', undefined),
    model: modelId ? { id: modelId, versie: optie('model-versie', null), bron: optie('model-bron', 'omgeving') } : undefined,
    samenvatting: optie('samenvatting-uk', null) ? { uk: optie('samenvatting-uk', ''), nl: optie('samenvatting-nl', optie('samenvatting-uk', '')) } : undefined,
    nietGedaan: optie('niet-gedaan', null) ? { uk: optie('niet-gedaan', ''), nl: optie('niet-gedaan', '') } : undefined });
  const code = toon(r.zaken);
  if (code || !r.zipPad) { console.log('ORCH pakket: НЕ зібрано · niet gebouwd'); return 1; }
  console.log(`ORCH pakket: ${r.zipPad}\n  tar: ${r.tarPad} (${r.bytes} bytes, sha256 ${r.sha256})\n  versie ${r.versie} · basis ${r.basis.versie} @ ${r.basis.commit.slice(0, 12)} (${r.basis.bron}) · commits ${r.commits} · bestanden ${r.bestanden} · handtekening ${r.handtekening ? 'ja' : 'nee'}\n  задача ${optie('taak', '')}: releaseVersie ${r.versie} (status released)`);
  return 0;
}
function doePakketControleer() {
  const beleid = laadBeleid(); const lock = laadLock(); const bron = optie('bron', '');
  if (!bron || !existsSync(resolve(bron))) { console.log('gebruik: pakket-controleer --bron <mijn-ruimte-…-overdracht.zip>'); return 2; }
  const gi = existsSync(P(beleid.geinstalleerd.bestand)) ? leesJson(beleid.geinstalleerd.bestand) : null;
  const r = controleerOverdrachtPakket(resolve(bron), { beleid, lock, geinstalleerd: gi ?? { versie: beleid.basis.versie, bronCommit: beleid.basis.bronCommit } });
  toon(r.zaken);
  console.log(`\nORCH pakket-controleer: ${r.geslaagd ? 'ГАРАЗД · in orde' : 'ВІДХИЛЕНО · geweigerd'}${r.versie ? ` · versie ${r.versie}` : ''}${r.basis ? ` · basis ${r.basis.versie} @ ${r.basis.commit?.slice(0, 12)}` : ''}`);
  return r.geslaagd ? 0 : 1;
}

const tabel = { inleveren: doeInleveren, 'staat-commit': staatCommit, pakket: doePakket, 'pakket-controleer': doePakketControleer, wachtrij: doeWachtrij, status: doeStatus, werkruimte: doeWerkruimte, controleer, vergrendel: doeVergrendel, context: doeContext, 'taak-start': taakStart, 'taak-staat': taakStaat, 'taak-herlees': taakHerlees, versheid: doeVersheid, 'onderteken-bericht': ondertekenBericht, bevestig };
if (!tabel[opdracht]) { console.log(`gebruik: node scripts/orch.mjs <${Object.keys(tabel).join('|')}>`); process.exit(2); }
try { process.exit(tabel[opdracht]()); } catch (e) { console.log(`FOUT: ${e.message}`); process.exit(1); }
