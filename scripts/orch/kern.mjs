// ORCH-001 · Kern van de coördinatie van AI-agenten (zuivere functies, geen afhankelijkheden).
// Ядро координації ШІ-агентів: чисті функції без залежностей. CLI: scripts/orch.mjs. Тести: tests/eenheid/orch-*.test.ts.
// Єдине джерело правил — AGENTS.md + orchestratie/beleid.json + orchestratie/BESLUITEN.md; їхній відбиток — orchestratie/regels.lock.json.
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

export const SCHEMA = 1;
/** Статуси роботи · statussen van werk (ORCH-001 етап 1.6). Порядок важливий: так зміна рухається до встановлення. */
export const STATUSSEN = Object.freeze(['in_progress', 'integrated', 'released', 'installed']);
/** Стани задачі · staten van een taak. */
export const TAAK_STATEN = Object.freeze(['in_progress', 'bevroren', 'ter_integratie', 'integrated', 'released', 'installed', 'geannuleerd']);
export const TAAK_ID = /^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/;
export const SHA40 = /^[0-9a-f]{40}$/;
export const VERSIE = /^\d{8}-\d{6}$/;
export const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const AGENT_ID = /^[a-z][a-z0-9-]{1,31}$/;
/** Простір імен SSH-підпису для правил (окремо від mijn-ruimte-uitrol, щоб підпис випуску не був підписом правил). */
export const REGELS_NAMESPACE = 'mijn-ruimte-regels';

export const sha256 = (tekst) => createHash('sha256').update(tekst).digest('hex');
/**
 * Нормалізація: LF, без BOM і без кінцевих пробілів у рядках — щоб Windows (CRLF) і Linux давали однаковий відбиток.
 * Кінець рядка — лише перед \n або в кінці тексту: `$` з прапорцем m у JS спрацьовує ще й перед U+2028/U+2029, а Python re.M
 * (PYREGELS у mijn-ruimte-uitrol.sh, PYMODUS у gitops-ophalen.sh) — ні; тоді lock від orch відхиляв би root/GitOps.
 * Regeleinde = alleen vóór \n of aan het einde (zoals Python re.M), niet vóór U+2028/U+2029.
 */
export const normaliseer = (tekst) => String(tekst).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+(?=\n|$)/g, '');

/** Стабільна серіалізація JSON (відсортовані ключі) — для відбитка критичних політик. */
export function stabielJson(w) {
  if (Array.isArray(w)) return `[${w.map(stabielJson).join(',')}]`;
  if (w && typeof w === 'object') return `{${Object.keys(w).sort().map((k) => `${JSON.stringify(k)}:${stabielJson(w[k])}`).join(',')}}`;
  return JSON.stringify(w);
}

export function vergelijkSemver(a, b) {
  const x = SEMVER.exec(a); const y = SEMVER.exec(b);
  if (!x || !y) return NaN;
  for (let i = 1; i <= 3; i++) { const d = Number(x[i]) - Number(y[i]); if (d) return Math.sign(d); }
  return 0;
}

const fout = (code, uk, nl, extra = {}) => ({ code, ernst: 'fout', uk, nl, ...extra });
const waarsch = (code, uk, nl, extra = {}) => ({ code, ernst: 'waarschuwing', uk, nl, ...extra });

/** Перевіряє orchestratie/beleid.json. Повертає список зауважень (порожній — усе гаразд). */
export function valideerBeleid(b) {
  const z = [];
  if (!b || typeof b !== 'object' || Array.isArray(b)) return [fout('BELEID_ONGELDIG', 'beleid.json має бути JSON-обʼєктом', 'beleid.json moet een JSON-object zijn')];
  if (b.schema !== SCHEMA) z.push(fout('BELEID_SCHEMA', `schema має бути ${SCHEMA}`, `schema moet ${SCHEMA} zijn`));
  if (!SEMVER.test(String(b.regelsVersie || ''))) z.push(fout('BELEID_VERSIE', 'regelsVersie у форматі X.Y.Z', 'regelsVersie in de vorm X.Y.Z'));
  if (!Array.isArray(b.regelBestanden) || !b.regelBestanden.includes('AGENTS.md') || !b.regelBestanden.includes('orchestratie/beleid.json'))
    z.push(fout('BELEID_BESTANDEN', 'regelBestanden мають містити AGENTS.md і orchestratie/beleid.json', 'regelBestanden moet AGENTS.md en orchestratie/beleid.json bevatten'));
  const basis = b.basis || {};
  if (!VERSIE.test(String(basis.versie || ''))) z.push(fout('BASIS_VERSIE', 'basis.versie у форматі РРРРММДД-ГГХХСС', 'basis.versie in de vorm JJJJMMDD-UUMMSS'));
  if (!SHA40.test(String(basis.bronCommit || ''))) z.push(fout('BASIS_COMMIT', 'basis.bronCommit — повний SHA (40 hex)', 'basis.bronCommit — volledige SHA (40 hex)'));
  if (!['opgave_eigenaar', 'geverifieerd_productie'].includes(basis.verificatie)) z.push(fout('BASIS_VERIFICATIE', 'basis.verificatie: opgave_eigenaar або geverifieerd_productie', 'basis.verificatie: opgave_eigenaar of geverifieerd_productie'));
  if (!b.kritiek || typeof b.kritiek !== 'object') z.push(fout('KRITIEK_ONTBREEKT', 'бракує розділу kritiek (критичні політики)', 'sectie kritiek (kritieke beleidsregels) ontbreekt'));
  else {
    const m = b.kritiek.installatieModi || {};
    if (!Array.isArray(m.toegestaan) || !m.toegestaan.every((x) => ['handmatig', 'na_bevestiging', 'automatisch_beperkt'].includes(x)))
      z.push(fout('MODI_ONGELDIG', 'installatieModi.toegestaan: handmatig / na_bevestiging / automatisch_beperkt', 'installatieModi.toegestaan: handmatig / na_bevestiging / automatisch_beperkt'));
    if (m.standaard && !m.toegestaan?.includes(m.standaard)) z.push(fout('MODI_STANDAARD', 'installatieModi.standaard має бути серед дозволених', 'installatieModi.standaard moet toegestaan zijn'));
    if (b.kritiek.privesleutelsNaarAgenten !== false) z.push(fout('SLEUTELS', 'privesleutelsNaarAgenten має бути false — приватні ключі власника агентам не передаються', 'privesleutelsNaarAgenten moet false zijn — privésleutels van de eigenaar gaan nooit naar agenten'));
  }
  // compactContext.bestand: orch ПИШЕ цей файл (context, voorstelToepassen) — лише orchestratie/<назва>.md, не файл правил і не lock.
  // Інакше пропозиція правил могла б перезаписати AGENTS.md, README чи щось поза деревом («../»). Alleen orchestratie/<naam>.md.
  const cc = b.compactContext || {};
  if (!CONTEXT_PAD.test(String(cc.bestand || '')) || (Array.isArray(b.regelBestanden) && b.regelBestanden.includes(cc.bestand)))
    z.push(fout('CONTEXT_PAD', 'compactContext.bestand — лише orchestratie/<назва>.md і не файл правил', 'compactContext.bestand — alleen orchestratie/<naam>.md en geen regelbestand'));
  if (!Number.isInteger(cc.maxBytes) || cc.maxBytes < 1000 || cc.maxBytes > 200_000) z.push(fout('CONTEXT_MAX', 'compactContext.maxBytes — ціле 1000…200000', 'compactContext.maxBytes — geheel getal 1000…200000'));
  const a = b.adapters || {};
  if (!Number.isInteger(a.maxRegels) || a.maxRegels < 5 || a.maxRegels > 60) z.push(fout('ADAPTER_MAX', 'adapters.maxRegels — ціле 5…60', 'adapters.maxRegels — geheel getal 5…60'));
  if (!Array.isArray(a.bestanden) || a.bestanden.length === 0) z.push(fout('ADAPTER_LIJST', 'adapters.bestanden порожній', 'adapters.bestanden is leeg'));
  if (!Array.isArray(b.agenten) || b.agenten.length === 0) z.push(fout('AGENTEN_LEEG', 'список agenten порожній', 'lijst agenten is leeg'));
  else for (const [i, ag] of b.agenten.entries()) {
    if (!AGENT_ID.test(String(ag?.id || ''))) z.push(fout('AGENT_ID', `agenten[${i}].id: малі латинські літери, цифри, «-»`, `agenten[${i}].id: kleine letters, cijfers, «-»`));
    if (!Array.isArray(ag?.kanalen) || ag.kanalen.length === 0) z.push(fout('AGENT_KANALEN', `agenten[${i}].kanalen порожній`, `agenten[${i}].kanalen is leeg`));
  }
  return z;
}

/** Відбиток правил: sha256 кожного файла правил і загальний (по відсортованих шляхах). */
export function regelsAfdruk(bestanden /* {pad: tekst} */) {
  const per = {};
  for (const p of Object.keys(bestanden).sort()) per[p] = sha256(normaliseer(bestanden[p]));
  const totaal = sha256(Object.entries(per).map(([p, h]) => `${h}  ${p}\n`).join(''));
  return { hash: totaal, bestanden: per };
}
/** Відбиток лише критичних політик: зміна саме цього вимагає незалежного підтвердження власника. */
export const kritiekAfdruk = (beleid) => sha256(stabielJson(beleid?.kritiek ?? null));

/**
 * Новий lock-файл. Якщо правила змінилися, а regelsVersie — ні або менша, відмова: інший агент не помітить зміну.
 * Попередній підпис власника зберігається, лише поки критичний відбиток той самий.
 */
export function vergrendel(beleid, bestanden, vorige) {
  const { hash, bestanden: per } = regelsAfdruk(bestanden);
  const kritiekHash = kritiekAfdruk(beleid);
  if (vorige && vorige.hash !== hash) {
    const c = vergelijkSemver(beleid.regelsVersie, vorige.regelsVersie);
    if (!(c > 0)) return { fout: fout('VERSIE_NIET_VERHOOGD', `Правила змінено, але regelsVersie (${beleid.regelsVersie}) не більша за ${vorige.regelsVersie}. Підвищте версію й додайте запис у BESLUITEN.md.`, `Regels gewijzigd maar regelsVersie (${beleid.regelsVersie}) is niet hoger dan ${vorige.regelsVersie}. Verhoog de versie en voeg een besluit toe in BESLUITEN.md.`) };
  }
  const bevestigd = vorige?.eigenaar && vorige.eigenaar.kritiekHash === kritiekHash ? vorige.eigenaar : null;
  return { lock: { schema: SCHEMA, regelsVersie: beleid.regelsVersie, hash, kritiekHash, bestanden: per, eigenaar: bevestigd } };
}

/** Звіряє фактичні файли з lock-файлом. */
export function controleerLock(beleid, bestanden, lock) {
  const z = [];
  if (!lock) return [fout('GEEN_LOCK', 'Немає orchestratie/regels.lock.json — виконайте node scripts/orch.mjs vergrendel', 'Geen orchestratie/regels.lock.json — voer node scripts/orch.mjs vergrendel uit')];
  const { hash, bestanden: per } = regelsAfdruk(bestanden);
  if (lock.regelsVersie !== beleid.regelsVersie) z.push(fout('LOCK_VERSIE', `lock має версію ${lock.regelsVersie}, beleid.json — ${beleid.regelsVersie}`, `lock heeft versie ${lock.regelsVersie}, beleid.json ${beleid.regelsVersie}`));
  if (lock.hash !== hash) {
    const anders = Object.keys({ ...per, ...lock.bestanden }).filter((p) => per[p] !== lock.bestanden?.[p]);
    z.push(fout('REGELS_NIET_VERGRENDELD', `Правила змінено без оновлення lock: ${anders.join(', ')}. Підвищте regelsVersie і виконайте vergrendel.`, `Regels gewijzigd zonder lock bij te werken: ${anders.join(', ')}. Verhoog regelsVersie en voer vergrendel uit.`, { bestanden: anders }));
  }
  if (lock.kritiekHash !== kritiekAfdruk(beleid)) z.push(fout('KRITIEK_LOCK', 'Критичні політики не збігаються з lock', 'Kritieke beleidsregels wijken af van de lock'));
  return z;
}

/**
 * Чи підтверджено поточні критичні політики власником (не агентом). Два способи підтвердження (lock.eigenaar):
 *   - SSH-підпис (`handtekening`, ssh-keygen -Y sign, namespace mijn-ruimte-regels) — перевіряється тут же (verifieerUitslag);
 *   - passkey (`soort: 'passkey'`, етап 3): рішення власника на сайті; підпис зберігає й перевіряє ROOT (orch-regels-bevestigd.jsonl),
 *     у репозиторії лишається лише запис про рішення (besluit, passkey, voorstel) — GitOps звіряє його з root-файлом перед установкою.
 */
export function eigenaarStatus(lock, verifieerUitslag) {
  if (!lock?.eigenaar) return waarsch('KRITIEK_NIET_BEVESTIGD', 'Критичні політики ще не підтверджені підписом власника — діють як «пропозиція». Встановлення в автоматичному режимі заборонене.', 'Kritieke beleidsregels zijn nog niet door de eigenaar ondertekend — ze gelden als «voorstel». Automatische installatie is verboden.');
  if (lock.eigenaar.kritiekHash !== lock.kritiekHash) return fout('KRITIEK_GEWIJZIGD', 'Критичні політики змінено після підпису власника — потрібен новий підпис.', 'Kritieke beleidsregels gewijzigd na de handtekening van de eigenaar — nieuwe handtekening nodig.');
  if (lock.eigenaar.soort === 'passkey') {
    if (!PASSKEY_VINGERAFDRUK.test(String(lock.eigenaar.passkey || '')) || !UUID.test(String(lock.eigenaar.besluit || ''))) return fout('BEVESTIGING_ONGELDIG', 'Запис про підтвердження passkey неповний (немає відбитка passkey або id рішення).', 'De passkey-bevestiging is onvolledig (geen vingerafdruk van de passkey of id van het besluit).');
    return null;
  }
  if (verifieerUitslag && !verifieerUitslag.ok) return fout('HANDTEKENING_ONGELDIG', `Підпис власника недійсний: ${verifieerUitslag.reden}`, `Handtekening van de eigenaar ongeldig: ${verifieerUitslag.reden}`);
  return null;
}
const PASSKEY_VINGERAFDRUK = /^[0-9a-f]{8,16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const VOORSTEL_ID = /^[0-9a-f]{16,32}$/;
/** Дозволений шлях компактного контексту (пише orch): orchestratie/<назва>.md, без підтек. */
export const CONTEXT_PAD = /^orchestratie\/[A-Za-z0-9._-]+\.md$/;

/**
 * Етап 3: підтвердження критичних політик рішенням власника з passkey (сайт → root). Чисто: звіряє, що рішення стосується САМЕ цього
 * lock (regelsVersie, hash, kritiekHash, id пропозиції) і повертає новий lock з eigenaar.soort = 'passkey'. Інакше — fout.
 * b: { regelsVersie, hash, kritiekHash, voorstel, passkey (відбиток 8–16 hex), besluit (uuid рядка app.eigenaar_besluiten), op }
 */
export function bevestigMetPasskey(lock, b) {
  if (!lock || !b) return { fout: fout('GEEN_LOCK', 'Немає lock або рішення для підтвердження', 'Geen lock of besluit om te bevestigen') };
  if (b.regelsVersie !== lock.regelsVersie || b.hash !== lock.hash || b.kritiekHash !== lock.kritiekHash) return { fout: fout('BESLUIT_PAST_NIET', `Рішення власника стосується інших правил (версія ${b.regelsVersie}, відбиток ${String(b.hash).slice(0, 12)}…), а не ${lock.regelsVersie} / ${lock.hash.slice(0, 12)}…`, `Het besluit van de eigenaar hoort bij andere regels (versie ${b.regelsVersie}, afdruk ${String(b.hash).slice(0, 12)}…), niet bij ${lock.regelsVersie} / ${lock.hash.slice(0, 12)}…`) };
  if (!VOORSTEL_ID.test(String(b.voorstel || '')) || !PASSKEY_VINGERAFDRUK.test(String(b.passkey || '')) || !UUID.test(String(b.besluit || ''))) return { fout: fout('BEVESTIGING_ONGELDIG', 'Підтвердження неповне: потрібні id пропозиції, відбиток passkey і id рішення.', 'Bevestiging onvolledig: id van het voorstel, vingerafdruk van de passkey en id van het besluit zijn nodig.') };
  return { lock: { ...lock, eigenaar: { soort: 'passkey', kritiekHash: lock.kritiekHash, regelsVersie: lock.regelsVersie, hash: lock.hash, voorstel: b.voorstel, besluit: b.besluit, passkey: b.passkey, op: b.op || new Date().toISOString() } } };
}

/** Різниця двох текстів у рядках (без LCS: мультимножини рядків) — достатньо для огляду пропозиції власником. */
export function regelVerschil(oud, nieuw) {
  const tel = (t) => { const m = new Map(); for (const r of normaliseer(t ?? '').split('\n')) m.set(r, (m.get(r) || 0) + 1); return m; };
  const a = tel(oud), b = tel(nieuw);
  let toegevoegd = 0, verwijderd = 0;
  for (const [r, n] of b) toegevoegd += Math.max(0, n - (a.get(r) || 0));
  for (const [r, n] of a) verwijderd += Math.max(0, n - (b.get(r) || 0));
  return { toegevoegd, verwijderd, gewijzigd: normaliseer(oud ?? '') !== normaliseer(nieuw ?? '') };
}

/**
 * Етап 3: оцінити пропозицію нових правил (власник редагує AGENTS.md / beleid.json / BESLUITEN.md на сайті) — ЧИСТО, без запису.
 * huidig: { beleid, bestanden: {pad: tekst}, lock }; nieuw: { bestanden: {pad: tekst} } (лише змінені файли, решта береться з huidig).
 * Повертає { zaken, regelsVersie, hash, kritiekHash, kritiekGewijzigd, verschil: {pad: {toegevoegd, verwijderd, gewijzigd}}, beleid, bestanden, lock }.
 * Правила: лише файли з beleid.regelBestanden; beleid.json валідний; хоч одна зміна; regelsVersie вища за чинну; у BESLUITEN.md є запис
 * «· <regelsVersie> ·» (рішення зафіксоване, не лише текст); lock обчислюється тим самим vergrendel, що й у CLI.
 */
export function beoordeelVoorstel(huidig, nieuw) {
  const z = [];
  const toegestaan = new Set(huidig.beleid.regelBestanden);
  const paden = Object.keys(nieuw?.bestanden || {});
  if (!paden.length) z.push(fout('VOORSTEL_LEEG', 'Пропозиція не містить жодного файла правил', 'Het voorstel bevat geen enkel regelbestand'));
  for (const p of paden) if (!toegestaan.has(p)) z.push(fout('VOORSTEL_PAD', `${p} не є файлом правил (дозволено: ${[...toegestaan].join(', ')})`, `${p} is geen regelbestand (toegestaan: ${[...toegestaan].join(', ')})`));
  if (z.length) return { zaken: z };
  const bestanden = { ...huidig.bestanden, ...nieuw.bestanden };
  let beleid = huidig.beleid;
  if (nieuw.bestanden['orchestratie/beleid.json'] !== undefined) {
    try { beleid = JSON.parse(nieuw.bestanden['orchestratie/beleid.json']); } catch (e) { return { zaken: [fout('BELEID_JSON', `orchestratie/beleid.json не є коректним JSON: ${e.message}`, `orchestratie/beleid.json is geen geldige JSON: ${e.message}`)] }; }
    const vb = valideerBeleid(beleid); if (vb.length) return { zaken: vb };
    if (JSON.stringify([...beleid.regelBestanden].sort()) !== JSON.stringify([...huidig.beleid.regelBestanden].sort())) z.push(fout('REGELBESTANDEN_GEWIJZIGD', 'Перелік файлів правил (regelBestanden) через сайт змінювати не можна — лише через git', 'De lijst regelBestanden is via de site niet te wijzigen — alleen via git'));
  }
  const verschil = Object.fromEntries(Object.keys(bestanden).map((p) => [p, regelVerschil(huidig.bestanden[p], bestanden[p])]));
  if (!Object.values(verschil).some((v) => v.gewijzigd)) z.push(fout('GEEN_WIJZIGING', 'Жоден файл правил не змінився — підписувати нічого', 'Geen enkel regelbestand is veranderd — er is niets te ondertekenen'));
  if (!(vergelijkSemver(beleid.regelsVersie, huidig.beleid.regelsVersie) > 0)) z.push(fout('VERSIE_NIET_VERHOOGD', `regelsVersie (${beleid.regelsVersie}) має бути вищою за чинну ${huidig.beleid.regelsVersie}`, `regelsVersie (${beleid.regelsVersie}) moet hoger zijn dan de geldende ${huidig.beleid.regelsVersie}`));
  const besluiten = bestanden['orchestratie/BESLUITEN.md'] ?? '';
  if (!new RegExp(`^## B-\\d{3} · \\d{4}-\\d{2}-\\d{2} · ${beleid.regelsVersie.replace(/\./g, '\\.')} · `, 'm').test(normaliseer(besluiten))) z.push(fout('BESLUIT_ONTBREEKT', `У orchestratie/BESLUITEN.md немає запису «## B-xxx · дата · ${beleid.regelsVersie} · …» — рішення має бути зафіксоване`, `orchestratie/BESLUITEN.md mist een regel «## B-xxx · datum · ${beleid.regelsVersie} · …» — het besluit moet vastgelegd zijn`));
  if (z.length) return { zaken: z };
  const r = vergrendel(beleid, bestanden, huidig.lock);
  if (r.fout) return { zaken: [r.fout] };
  const kritiekGewijzigd = r.lock.kritiekHash !== (huidig.lock?.kritiekHash ?? kritiekAfdruk(huidig.beleid));
  return { zaken: z, regelsVersie: beleid.regelsVersie, hash: r.lock.hash, kritiekHash: r.lock.kritiekHash, kritiekGewijzigd, verschil, beleid, bestanden, lock: r.lock };
}

/** Адаптер (CLAUDE.md, GEMINI.md…) — лише вказівник на AGENTS.md, не окреме джерело правил. */
export function controleerAdapter(pad, tekst, maxRegels) {
  const z = []; const t = normaliseer(tekst); const regels = t.split('\n').filter((r) => r.trim()).length;
  if (!t.includes('orch-adapter')) z.push(fout('ADAPTER_MARKER', `${pad}: бракує маркера <!-- orch-adapter -->`, `${pad}: marker <!-- orch-adapter --> ontbreekt`));
  if (!t.includes('AGENTS.md')) z.push(fout('ADAPTER_VERWIJZING', `${pad}: немає посилання на AGENTS.md`, `${pad}: geen verwijzing naar AGENTS.md`));
  if (regels > maxRegels) z.push(fout('ADAPTER_TE_LANG', `${pad}: ${regels} непорожніх рядків (макс. ${maxRegels}) — адаптер не може бути окремим зводом правил`, `${pad}: ${regels} niet-lege regels (max. ${maxRegels}) — een adapter mag geen eigen regelset zijn`));
  // Адаптер не повинен дублювати нумеровані правила з AGENTS.md (ознака «незалежного джерела»).
  if (/^#{1,3}\s*(Правило|Regel)\s+\d/m.test(t)) z.push(fout('ADAPTER_REGELS', `${pad}: містить власні «Правило N» — перенесіть їх у AGENTS.md`, `${pad}: bevat eigen «Regel N» — verplaats ze naar AGENTS.md`));
  return z;
}

/** Компактний контекст для агентів без GitHub/MCP: блоки AGENTS.md між маркерами compact + стан бази й версія правил. */
export function compacteContext(agentsMd, beleid, lock) {
  const blokken = [...normaliseer(agentsMd).matchAll(/<!-- compact:begin -->\n([\s\S]*?)<!-- compact:einde -->/g)].map((m) => m[1].trim());
  const kop = [
    '<!-- GEGENEREERD door node scripts/orch.mjs context — niet met de hand wijzigen · ЗГЕНЕРОВАНО, не редагувати вручну -->',
    `# Mijn Ruimte — компактний контекст агента · compacte agentcontext`,
    '',
    `- regelsVersie: \`${beleid.regelsVersie}\``,
    `- regelsHash: \`${lock?.hash ?? '—'}\``,
    `- kritiekHash: \`${lock?.kritiekHash ?? '—'}\` (${lock?.eigenaar ? `підтверджено власником · door eigenaar bevestigd (${lock.eigenaar.soort === 'passkey' ? 'passkey' : 'SSH'})` : 'НЕ підтверджено власником · NIET bevestigd door eigenaar'})`,
    `- база · basis: \`${beleid.basis.versie}\` @ \`${beleid.basis.bronCommit}\` (${beleid.basis.verificatie})`,
    `- інтеграційна гілка · integratietak: \`${beleid.integratie?.tak ?? '—'}\``,
    '',
    'Вставте цей файл повністю на початку роботи. У відповіді-передачі вкажіть regelsHash і базовий commit, від якого ви працювали —',
    'інакше результат буде позначено як «застаріла база/правила» й не потрапить у чергу без повторної перевірки.',
    '',
  ];
  return `${kop.join('\n')}\n${blokken.join('\n\n')}\n`;
}

/** Перевірка запису задачі orchestratie/taken/<ID>.json. */
export function valideerTaak(t, beleid) {
  const z = []; const id = String(t?.id || '');
  if (!TAAK_ID.test(id)) z.push(fout('TAAK_ID', `id «${id}»: формат ABC-001`, `id «${id}»: vorm ABC-001`));
  if (!AGENT_ID.test(String(t?.agent || ''))) z.push(fout('TAAK_AGENT', `${id}: agent — малі латинські літери`, `${id}: agent — kleine letters`));
  else if (beleid && !beleid.agenten?.some((a) => a.id === t.agent)) z.push(waarsch('TAAK_AGENT_ONBEKEND', `${id}: агент «${t.agent}» не зареєстрований у beleid.json`, `${id}: agent «${t.agent}» staat niet in beleid.json`));
  if (!SHA40.test(String(t?.basisCommit || ''))) z.push(fout('TAAK_BASIS', `${id}: basisCommit — повний SHA`, `${id}: basisCommit — volledige SHA`));
  if (!TAAK_STATEN.includes(t?.staat)) z.push(fout('TAAK_STAAT', `${id}: staat — одне з ${TAAK_STATEN.join(', ')}`, `${id}: staat — een van ${TAAK_STATEN.join(', ')}`));
  const patroon = beleid?.takPatroon ? new RegExp(beleid.takPatroon) : null;
  if (!t?.tak || (patroon && !patroon.test(t.tak))) z.push(fout('TAAK_TAK', `${id}: гілка «${t?.tak ?? ''}» не відповідає ${beleid?.takPatroon}`, `${id}: tak «${t?.tak ?? ''}» past niet bij ${beleid?.takPatroon}`));
  if (!SEMVER.test(String(t?.regelsVersie || ''))) z.push(fout('TAAK_REGELS', `${id}: regelsVersie X.Y.Z`, `${id}: regelsVersie X.Y.Z`));
  return z;
}

/**
 * Перевірка свіжості перед початком роботи і перед передаванням (ORCH-001 етап 0.4).
 * feiten: { regelsVersie, regelsHash (поточні), taak, headIsAfstammeling (basis ⊂ HEAD), integratieVoorsprong: [{sha, bestanden[]}],
 *           eigenBestanden: [] (змінені задачею), schoon (робоче дерево чисте), fase: 'start' | 'overdracht' }
 */
export function versheid(feiten) {
  const z = []; const t = feiten.taak;
  if (t.regelsVersie !== feiten.regelsVersie) z.push(fout('REGELS_VEROUDERD', `Задачу почато за правилами ${t.regelsVersie}, чинні — ${feiten.regelsVersie}. Перечитайте AGENTS.md (або CONTEXT-COMPACT.md) і оновіть regelsVersie задачі.`, `Taak gestart onder regels ${t.regelsVersie}, geldend is ${feiten.regelsVersie}. Lees AGENTS.md (of CONTEXT-COMPACT.md) opnieuw en werk regelsVersie van de taak bij.`));
  if (t.regelsHash && feiten.regelsHash && t.regelsHash !== feiten.regelsHash) z.push(fout('REGELS_HASH', 'Відбиток правил задачі не збігається з чинним', 'Afdruk van de regels in de taak wijkt af van de geldende'));
  if (feiten.headIsAfstammeling === false) z.push(fout('BASIS_NIET_IN_HEAD', `Базовий commit ${t.basisCommit.slice(0, 12)} не є предком HEAD — роботу зроблено не від заявленої бази.`, `Basiscommit ${t.basisCommit.slice(0, 12)} is geen voorouder van HEAD — het werk komt niet van de opgegeven basis.`));
  const voor = feiten.integratieVoorsprong || [];
  if (voor.length) {
    const eigen = new Set(feiten.eigenBestanden || []);
    const overlap = [...new Set(voor.flatMap((c) => c.bestanden).filter((p) => eigen.has(p)))].sort();
    const maak = overlap.length ? fout : waarsch;
    z.push(maak(overlap.length ? 'BASIS_VEROUDERD_OVERLAP' : 'BASIS_VEROUDERD', `Інтеграційна гілка пішла вперед на ${voor.length} commit(ів)${overlap.length ? `; ті самі файли змінено: ${overlap.join(', ')} — перебазуйтесь і розвʼяжіть конфлікти, нічого не перезаписуючи` : ' (без перетину файлів) — перебазування бажане'}.`,
      `De integratietak is ${voor.length} commit(s) verder${overlap.length ? `; dezelfde bestanden gewijzigd: ${overlap.join(', ')} — rebase en los conflicten op zonder iets te overschrijven` : ' (geen overlappende bestanden) — rebase aanbevolen'}.`, { overlap }));
  }
  if (feiten.fase === 'overdracht' && feiten.schoon === false) z.push(fout('NIET_GECOMMIT', 'Є незакомічені зміни — передавати можна лише закомічений результат.', 'Er zijn niet-gecommitte wijzigingen — alleen gecommit werk kan worden overgedragen.'));
  if (feiten.fase === 'overdracht' && t.staat === 'bevroren') z.push(fout('TAAK_BEVROREN', 'Задача заморожена — спершу «start» для відновлення.', 'Taak is bevroren — eerst «start» om te hervatten.'));
  return z;
}

// ——— SSH-підпис (SSHSIG, ed25519) без ssh-keygen: перевіряємо підпис власника навіть там, де OpenSSH немає ———
function leesString(buf, pos) {
  if (pos < 0 || pos + 4 > buf.length) throw new Error('afgekapt veld');
  const n = buf.readUInt32BE(pos);
  if (pos + 4 + n > buf.length) throw new Error('afgekapt veld');
  return [buf.subarray(pos + 4, pos + 4 + n), pos + 4 + n];
}
const sshString = (b) => { const l = Buffer.alloc(4); l.writeUInt32BE(b.length); return Buffer.concat([l, b]); };
const sshGlobRe = (pat) => new RegExp(`^${String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
function sshPatroonLijstPast(lijst, waarde) {
  let positief = false;
  for (const deel of String(lijst).split(',').map((s) => s.trim()).filter(Boolean)) {
    if (deel.startsWith('!')) { if (sshGlobRe(deel.slice(1)).test(waarde)) return false; }
    else if (sshGlobRe(deel).test(waarde)) positief = true;
  }
  return positief;
}
function ondertekenaarRegelPast(regel, pubB64, namespace, principal) {
  const d = String(regel).match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!d || d.length < 3) return false;
  const zonderOpties = d[1] === 'ssh-ed25519';
  const metOpties = !zonderOpties && d[2] === 'ssh-ed25519';
  if (!zonderOpties && !metOpties) return false;
  const sleutelB64 = zonderOpties ? d[2] : d[3];
  if (sleutelB64 !== pubB64) return false;
  if (principal && !sshPatroonLijstPast(d[0], principal)) return false;
  if (metOpties) {
    const opties = d[1].match(/(?:[^,"]+|"[^"]*")+/g) ?? [];
    for (const opt of opties) {
      const o = opt.trim();
      if (/^cert-authority$/i.test(o)) return false;
      const m = /^namespaces=(?:"([^"]*)"|(.*))$/i.exec(o);
      if (m && !sshPatroonLijstPast(m[1] ?? m[2] ?? '', namespace)) return false;
    }
  }
  return true;
}
export function sshsigGegevens(namespace, bericht) {
  const h = createHash('sha512').update(bericht).digest();
  return Buffer.concat([Buffer.from('SSHSIG'), sshString(Buffer.from(namespace)), sshString(Buffer.alloc(0)), sshString(Buffer.from('sha512')), sshString(h)]);
}
/** Перевіряє армований SSH SIGNATURE (ed25519) для повідомлення проти allowed_signers (рядки «principal [options] ssh-ed25519 AAAA…»). */
export function verifieerSshsig({ handtekening, bericht, namespace, toegestaan, principal }) {
  try {
    const b64 = String(handtekening).replace(/-----(BEGIN|END) SSH SIGNATURE-----/g, '').replace(/\s+/g, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 10 || buf.subarray(0, 6).toString() !== 'SSHSIG') return { ok: false, reden: 'geen SSHSIG' };
    if (buf.readUInt32BE(6) !== 1) return { ok: false, reden: 'alleen SSHSIG versie 1' };
    let p = 10; let pub, ns, hashAlg, sig;
    [pub, p] = leesString(buf, p); [ns, p] = leesString(buf, p); [, p] = leesString(buf, p); [hashAlg, p] = leesString(buf, p); [sig, p] = leesString(buf, p);
    if (p !== buf.length) return { ok: false, reden: 'extra bytes in SSHSIG' };
    if (ns.toString() !== namespace) return { ok: false, reden: `namespace ${ns} ≠ ${namespace}` };
    if (hashAlg.toString() !== 'sha512') return { ok: false, reden: 'hash moet sha512 zijn' };
    const [type, p2] = leesString(pub, 0); const [raw, pPub] = leesString(pub, p2);
    if (type.toString() !== 'ssh-ed25519' || raw.length !== 32 || pPub !== pub.length) return { ok: false, reden: 'alleen ssh-ed25519' };
    const pubB64 = pub.toString('base64');
    const regel = String(toegestaan).split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith('#'))
      .find((r) => ondertekenaarRegelPast(r, pubB64, namespace, principal));
    if (!regel) return { ok: false, reden: 'sleutel staat niet in de lijst van ondertekenaars' };
    const [sigType, p3] = leesString(sig, 0); const [ruw, pSig] = leesString(sig, p3);
    if (sigType.toString() !== 'ssh-ed25519' || ruw.length !== 64 || pSig !== sig.length) return { ok: false, reden: 'ongeldige ed25519-handtekening' };
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
    const ok = cryptoVerify(null, sshsigGegevens(namespace, Buffer.from(bericht)), key, ruw);
    return ok ? { ok: true, sleutel: `SHA256:${createHash('sha256').update(pub).digest('base64').replace(/=+$/, '')}` } : { ok: false, reden: 'handtekening klopt niet' };
  } catch (e) { return { ok: false, reden: `onleesbaar: ${e.message}` }; }
}
/** Що саме підписує власник: однозначний рядок з версією й відбитком критичних політик. */
export const kritiekBericht = (lock) => `mijn-ruimte-regels\nregelsVersie=${lock.regelsVersie}\nkritiekHash=${lock.kritiekHash}\n`;

// ——— Етап 1: передача результатів, черга інтеграції, статуси ———
export const KANALEN = Object.freeze(['github_pr', 'mcp', 'http_api', 'lokaal_bestand', 'zip', 'tar_gz', 'git_patch', 'web_upload']);
export const INLEVERING_UITKOMSTEN = Object.freeze(['aanvaard', 'geweigerd']);
export const WACHTRIJ_STATEN = Object.freeze(['wacht', 'bezig', 'integrated', 'afgewezen', 'teruggetrokken']);

/** Перевірка ORCH-OVERDRACHT.json (шаблон: orchestratie/sjablonen/ORCH-OVERDRACHT.json). */
export function valideerOverdracht(o, beleid) {
  const z = [];
  if (!o || typeof o !== 'object') return [fout('OVERDRACHT_ONGELDIG', 'ORCH-OVERDRACHT.json має бути JSON-обʼєктом', 'ORCH-OVERDRACHT.json moet een JSON-object zijn')];
  for (const veld of beleid?.inlevering?.verplichteVelden ?? []) {
    const w = o[veld];
    const leeg = w === undefined || w === null || w === '' || (typeof w === 'object' && !Array.isArray(w) && !Object.values(w).some((x) => typeof x === 'string' && x.trim()));
    if (leeg) z.push(fout('OVERDRACHT_VELD', `бракує обовʼязкового поля «${veld}»`, `verplicht veld «${veld}» ontbreekt`, { veld }));
  }
  if (o.taakId && !TAAK_ID.test(String(o.taakId))) z.push(fout('TAAK_ID', `taakId «${o.taakId}»: формат ABC-001`, `taakId «${o.taakId}»: vorm ABC-001`));
  if (o.agent && !AGENT_ID.test(String(o.agent))) z.push(fout('TAAK_AGENT', 'agent — малі латинські літери', 'agent — kleine letters'));
  if (o.basisCommit && !SHA40.test(String(o.basisCommit))) z.push(fout('TAAK_BASIS', 'basisCommit — повний SHA (40 hex)', 'basisCommit — volledige SHA (40 hex)'));
  if (o.regelsVersie && !SEMVER.test(String(o.regelsVersie))) z.push(fout('TAAK_REGELS', 'regelsVersie X.Y.Z', 'regelsVersie X.Y.Z'));
  if (o.regelsHash && !/^[0-9a-f]{64}$/.test(String(o.regelsHash)) && !String(o.regelsHash).startsWith('<')) z.push(fout('OVERDRACHT_HASH', 'regelsHash — sha256 (64 hex) з CONTEXT-COMPACT.md', 'regelsHash — sha256 (64 hex) uit CONTEXT-COMPACT.md'));
  else if (String(o.regelsHash ?? '').startsWith('<')) z.push(fout('OVERDRACHT_SJABLOON', 'regelsHash ще зі шаблону — підставте справжній відбиток', 'regelsHash is nog de sjabloonwaarde — vul de echte afdruk in'));
  if (o.kanaal && !KANALEN.includes(o.kanaal)) z.push(fout('KANAAL_ONBEKEND', `kanaal «${o.kanaal}» невідомий (${KANALEN.join(', ')})`, `kanaal «${o.kanaal}» onbekend`));
  const sam = o.samenvatting; const samUk = typeof sam === 'string' ? sam : sam?.uk;
  if (samUk !== undefined && String(samUk).trim().length < 20) z.push(fout('SAMENVATTING_TE_KORT', 'samenvatting.uk — мінімум 20 символів', 'samenvatting.uk — minstens 20 tekens'));
  if (o.zonderGit && String(o.zonderGit).trim().length < 5) z.push(fout('ZONDER_GIT_REDEN', 'zonderGit потребує причини ≥ 5 символів', 'zonderGit vraagt een reden van ≥ 5 tekens'));
  return z;
}

/** Порівнює заявлені агентом файли з фактично зміненими (git diff): розбіжність — попередження, не блокер. */
export function vergelijkBestanden(opgegeven, feitelijk) {
  const o = new Set([...(opgegeven?.gewijzigd ?? []), ...(opgegeven?.toegevoegd ?? []), ...(opgegeven?.verwijderd ?? [])]);
  if (o.size === 0) return [];
  const f = new Set(feitelijk);
  const nietOpgegeven = [...f].filter((p) => !o.has(p)).sort(); const nietGewijzigd = [...o].filter((p) => !f.has(p)).sort();
  if (!nietOpgegeven.length && !nietGewijzigd.length) return [];
  return [waarsch('BESTANDEN_AFWIJKEND', `Перелік файлів у ORCH-OVERDRACHT не збігається з фактичним diff${nietOpgegeven.length ? `; не заявлено: ${nietOpgegeven.join(', ')}` : ''}${nietGewijzigd.length ? `; заявлено, але не змінено: ${nietGewijzigd.join(', ')}` : ''}.`,
    `Bestandenlijst in ORCH-OVERDRACHT wijkt af van de echte diff${nietOpgegeven.length ? `; niet opgegeven: ${nietOpgegeven.join(', ')}` : ''}${nietGewijzigd.length ? `; opgegeven maar ongewijzigd: ${nietGewijzigd.join(', ')}` : ''}.`, { nietOpgegeven, nietGewijzigd })];
}

/** Файли, які ніколи не переносяться з архіву в робоче дерево. */
export const UITGESLOTEN_PADEN = /^(\.git|node_modules|dist|dist-server|rapporten|harness|harness-[^/]*|ORCH-OVERDRACHT\.json|UITROL-VERSIE|UITROL-BASIS|AUTEUR|AGENT|SAMENVATTING|BRON-COMMIT|TESTRESULTATEN|UITROL-MANIFEST\.json)(\/|$)/;
export const padVeilig = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/[\\:\0]/.test(p)
  && !p.split('/').some((d) => !d || d === '.' || d === '..' || d === '.git') && !UITGESLOTEN_PADEN.test(p);

/** Канал за джерелом: розширення/тип. Явний --kanaal (mcp, http_api, web_upload) переважає — ці канали доставляють файл. */
export function herkenKanaal(bron, isMap, expliciet) {
  if (expliciet) return KANALEN.includes(expliciet) ? expliciet : null;
  const b = String(bron);
  if (isMap) return 'lokaal_bestand';
  if (/\.zip$/i.test(b)) return 'zip';
  if (/\.(tar\.gz|tgz)$/i.test(b)) return 'tar_gz';
  if (/\.(patch|diff|mbox)$/i.test(b)) return 'git_patch';
  if (/^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(b) || /^(origin\/|refs\/|pr\/\d+$)/.test(b) || /^[a-z]+\/[a-z0-9-]+-\d{8}-\d{6}$/.test(b)) return 'github_pr';
  return null;
}

// — черга інтеграції (чисті операції над orchestratie/wachtrij.json) —
export function wachtrijVoegToe(w, item) {
  const lijst = Array.isArray(w?.wachtrij) ? w.wachtrij : [];
  if (lijst.some((r) => r.taakId === item.taakId)) return { fout: fout('WACHTRIJ_DUBBEL', `задача ${item.taakId} уже в черзі — нова передача замінює стару лише через «wachtrij terugtrekken»`, `taak ${item.taakId} staat al in de wachtrij — eerst «wachtrij terugtrekken»`) };
  return { w: { ...w, wachtrij: [...lijst, { ...item, staat: 'wacht' }] } };
}
export function wachtrijVolgende(w, nu = new Date().toISOString()) {
  if (w.bezig) return { fout: fout('WACHTRIJ_BEZIG', `черга послідовна: ${w.bezig} ще інтегрується — спершу «wachtrij klaar» або «wachtrij terugtrekken»`, `wachtrij is serieel: ${w.bezig} wordt nog geïntegreerd — eerst «wachtrij klaar» of «terugtrekken»`) };
  const i = (w.wachtrij ?? []).findIndex((r) => r.staat === 'wacht');
  if (i < 0) return { fout: waarsch('WACHTRIJ_LEEG', 'черга порожня', 'wachtrij is leeg') };
  const lijst = w.wachtrij.map((r, j) => (j === i ? { ...r, staat: 'bezig', begonnen: nu } : r));
  return { w: { ...w, wachtrij: lijst, bezig: lijst[i].taakId }, item: lijst[i] };
}
export function wachtrijKlaar(w, taakId, uitkomst, integratieHoofd, nu = new Date().toISOString()) {
  if (w.bezig !== taakId) return { fout: fout('WACHTRIJ_NIET_BEZIG', `${taakId} не є поточною задачею в інтеграції (bezig: ${w.bezig ?? '—'})`, `${taakId} is niet de taak die nu geïntegreerd wordt (bezig: ${w.bezig ?? '—'})`) };
  if (!['integrated', 'afgewezen'].includes(uitkomst)) return { fout: fout('WACHTRIJ_UITKOMST', 'uitkomst: integrated або afgewezen', 'uitkomst: integrated of afgewezen') };
  if (uitkomst === 'integrated' && !SHA40.test(String(integratieHoofd || ''))) return { fout: fout('WACHTRIJ_HOOFD', 'для integrated потрібен SHA нового вершка integratie', 'voor integrated is de SHA van het nieuwe integratiehoofd nodig') };
  const item = w.wachtrij.find((r) => r.taakId === taakId);
  const klaar = { ...item, staat: uitkomst, afgerond: nu, integratieHoofd: uitkomst === 'integrated' ? integratieHoofd : null };
  return { w: { ...w, bezig: null, integratieHoofd: uitkomst === 'integrated' ? integratieHoofd : w.integratieHoofd, wachtrij: w.wachtrij.filter((r) => r.taakId !== taakId), geschiedenis: [...(w.geschiedenis ?? []), klaar] }, item: klaar };
}
export function wachtrijTerugtrekken(w, taakId, reden, nu = new Date().toISOString()) {
  const item = (w.wachtrij ?? []).find((r) => r.taakId === taakId);
  if (!item) return { fout: fout('WACHTRIJ_ONBEKEND', `${taakId} немає в черзі`, `${taakId} staat niet in de wachtrij`) };
  return { w: { ...w, bezig: w.bezig === taakId ? null : w.bezig, wachtrij: w.wachtrij.filter((r) => r.taakId !== taakId), geschiedenis: [...(w.geschiedenis ?? []), { ...item, staat: 'teruggetrokken', afgerond: nu, reden: String(reden || '') }] } };
}

/**
 * Статус задачі, виведений з фактів (ORCH-001 етап 1.6): in_progress → integrated → released → installed.
 * «installed» ставить лише факт установки (geinstalleerd.bronCommit містить integratieCommit), не агент.
 */
export function statusAfleiden(taak, geinstalleerd, isVoorouder) {
  if (['geannuleerd', 'bevroren'].includes(taak.staat)) return { status: taak.staat, bron: 'taak' };
  if (taak.integratieCommit && geinstalleerd?.bronCommit && isVoorouder(taak.integratieCommit, geinstalleerd.bronCommit)) return { status: 'installed', bron: `geïnstalleerd ${geinstalleerd.versie ?? ''} @ ${geinstalleerd.bronCommit.slice(0, 12)}` };
  if (taak.releaseVersie) return { status: 'released', bron: `pakket ${taak.releaseVersie}` };
  if (taak.integratieCommit) return { status: 'integrated', bron: `integratie @ ${taak.integratieCommit.slice(0, 12)}` };
  return { status: taak.staat === 'ter_integratie' ? 'in_progress' : 'in_progress', bron: taak.staat === 'ter_integratie' ? 'передано, чекає в черзі · ingeleverd, wacht' : 'в роботі · in bewerking' };
}

// ——— Етап 2: універсальні випуски — UITROL-BASIS, пакет передачі ———
/** Назва пакета передачі: mijn-ruimte-<versie>-<agent>-overdracht.zip (AGENT з ТЗ = ідентифікатор агента, як у файлі AGENT). */
export const overdrachtZipNaam = (versie, agent) => `mijn-ruimte-${versie}-${agent}-overdracht.zip`;
export const OVERDRACHT_ZIP = /^mijn-ruimte-(\d{8}-\d{6})-([a-z][a-z0-9-]{1,31})-overdracht\.zip$/;
export const TAR_NAAM = /^mijn-ruimte-(\d{8}-\d{6})\.tar\.gz$/;
export const BASIS_VERPLICHT_VANAF = '20261201-000000';

/** Читає UITROL-BASIS (versie=…, commit=…, regelsVersie=…, regelsHash=…). Null — файл відсутній/порожній. */
export function leesBasisBestand(tekst) {
  if (tekst === null || tekst === undefined) return null;
  const uit = {};
  for (const r of String(tekst).split(/\r?\n/)) { const m = /^([a-zA-Z]+)=(.*)$/.exec(r.trim()); if (m) uit[m[1]] = m[2].trim(); }
  return Object.keys(uit).length ? uit : null;
}
/** Те саме, що робить root (mijn-ruimte-uitrol.sh): чи можна ставити пакет із цією базою на сервер із цим станом. */
export function controleerBasis(basis, geinstalleerd, pakketVersie) {
  const z = [];
  if (!basis) {
    if (pakketVersie && pakketVersie >= BASIS_VERPLICHT_VANAF) z.push(fout('GEEN_BASIS', `у пакеті немає UITROL-BASIS — обовʼязковий для випусків від ${BASIS_VERPLICHT_VANAF}`, `UITROL-BASIS ontbreekt — verplicht vanaf ${BASIS_VERPLICHT_VANAF}`));
    else z.push(waarsch('GEEN_BASIS', 'пакет без UITROL-BASIS (старий формат) — базу не перевірено', 'pakket zonder UITROL-BASIS (oud formaat) — basis niet gecontroleerd'));
    return z;
  }
  if (!VERSIE.test(basis.versie || '') || !SHA40.test(basis.commit || '')) { z.push(fout('BASIS_ONGELDIG', 'UITROL-BASIS: потрібні versie=РРРРММДД-ГГХХСС і commit=<40 hex>', 'UITROL-BASIS: versie=JJJJMMDD-UUMMSS en commit=<40 hex> nodig')); return z; }
  const lv = geinstalleerd?.versie; const lc = geinstalleerd?.bronCommit;
  if (lv && VERSIE.test(lv) && lv > basis.versie) z.push(fout('BASIS_VEROUDERD', `пакет зібрано на базі ${basis.versie}, а встановлено новішу ${lv} — перебазуйтесь і зберіть знову`, `pakket gebouwd op basis ${basis.versie}, geïnstalleerd is de nieuwere ${lv} — rebase en bouw opnieuw`));
  if (lc && SHA40.test(lc) && lc !== basis.commit) z.push(fout('BASIS_COMMIT_VERSCHILT', `базовий commit ${basis.commit.slice(0, 12)} ≠ встановлений ${lc.slice(0, 12)}`, `basiscommit ${basis.commit.slice(0, 12)} ≠ geïnstalleerd ${lc.slice(0, 12)}`));
  return z;
}
/** Текст UITROL-BASIS для пакета. */
export const basisBestandTekst = (versie, commit, lock) => `versie=${versie}\ncommit=${commit}\n${lock ? `regelsVersie=${lock.regelsVersie}\nregelsHash=${lock.hash}\n` : ''}`;

/** Звіт передачі (RAPPORT.md), uk+nl, з того, що справді відомо — без вигадок. */
export function maakRapport(r) {
  const lijst = (xs) => (xs?.length ? xs.map((x) => `- ${x}`).join('\n') : '- —');
  return `# Передача випуску ${r.versie} · Overdracht van release ${r.versie}

| | |
|---|---|
| Task ID | \`${r.taakId}\` |
| Агент · agent | \`${r.agent}\` (${r.agentPlatform ?? '—'}; model: ${r.model?.id ?? 'onbekend'}, bron ${r.model?.bron ?? 'onbekend'}) |
| Автор · auteur | ${r.auteur} |
| Пакет · pakket | \`mijn-ruimte-${r.versie}.tar.gz\` · ${r.bytes} bytes · sha256 \`${r.sha256}\` |
| BRON-COMMIT | \`${r.commit}\` |
| Встановлена база · geïnstalleerde basis (UITROL-BASIS) | \`${r.basisVersie}\` @ \`${r.basisCommit}\` (${r.basisBron})${r.sindsInstallatie ? ` · від установки ${r.sindsInstallatie.commits} комітів, ${r.sindsInstallatie.bestanden} файлів` : ''} |
| База гілки · basis van de tak | \`${r.takBasis ?? '—'}\`${r.tak ? ` (${r.tak})` : ''} |
| Правила · regels | ${r.regelsVersie} · \`${r.regelsHash ?? '—'}\` · ${r.kritiekBevestigd ? 'критичні політики підтверджено власником' : 'критичні політики НЕ підтверджені власником (пропозиція)'} |
| Режим встановлення · modus | ${r.modus} |
| Підпис · handtekening | ${r.handtekening ? 'є (.sig власника)' : 'немає — установка після підтвердження власника (passkey) або вручну'} |

## Що змінено · Wat is gewijzigd
${r.samenvatting.uk}

${r.samenvatting.nl}

## Коміти гілки задачі · Commits van de taak-tak (${r.commits.length})
${lijst(r.commits.map((c) => `\`${c.sha.slice(0, 12)}\` ${c.onderwerp} (${c.auteur})`))}

## Файли гілки задачі · Bestanden van de taak-tak (${r.bestanden.length})
${lijst(r.bestanden)}

## Тести · Tests
${r.tests ? `${r.tests.geslaagd ?? '?'} ok / ${r.tests.mislukt ?? '?'} mis${r.tests.uitleg?.uk ? ` — ${r.tests.uitleg.uk}` : ''}` : 'результати тестів не додано · geen testresultaten meegegeven'}

## Учасники · Deelnemers
${lijst(r.deelnemers.map((d) => `${d.soort}: ${d.naam}${d.platform ? ` (${d.platform})` : ''} — ${d.rollen.join(', ')}`))}

## Свідомо не зроблено · Bewust niet gedaan
${r.nietGedaan?.uk ?? '—'}

## Як встановити · Installeren
1. Перевірити: \`node scripts/orch.mjs pakket-controleer --bron ${overdrachtZipNaam(r.versie, r.agent)}\`
2. Завантажити \`mijn-ruimte-${r.versie}.tar.gz\` через майстер «Нове оновлення» (попередня перевірка сайту) і підтвердити passkey власника,
   або покласти підписаний пакет (.sig) в inbox root-скрипта. Інсталятор перевіряє версію, базу (UITROL-BASIS), цілісність, правила (regels.lock.json).
3. Імпорт без git: \`node scripts/orch.mjs inleveren --bron ${overdrachtZipNaam(r.versie, r.agent)}\`
`;
}
