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
/** Нормалізація: LF, без BOM і без кінцевих пробілів у рядках — щоб Windows (CRLF) і Linux давали однаковий відбиток. */
export const normaliseer = (tekst) => String(tekst).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');

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

/** Чи підтверджено поточні критичні політики власником (не агентом). */
export function eigenaarStatus(lock, verifieerUitslag) {
  if (!lock?.eigenaar) return waarsch('KRITIEK_NIET_BEVESTIGD', 'Критичні політики ще не підтверджені підписом власника — діють як «пропозиція». Встановлення в автоматичному режимі заборонене.', 'Kritieke beleidsregels zijn nog niet door de eigenaar ondertekend — ze gelden als «voorstel». Automatische installatie is verboden.');
  if (lock.eigenaar.kritiekHash !== lock.kritiekHash) return fout('KRITIEK_GEWIJZIGD', 'Критичні політики змінено після підпису власника — потрібен новий підпис.', 'Kritieke beleidsregels gewijzigd na de handtekening van de eigenaar — nieuwe handtekening nodig.');
  if (verifieerUitslag && !verifieerUitslag.ok) return fout('HANDTEKENING_ONGELDIG', `Підпис власника недійсний: ${verifieerUitslag.reden}`, `Handtekening van de eigenaar ongeldig: ${verifieerUitslag.reden}`);
  return null;
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
    `- kritiekHash: \`${lock?.kritiekHash ?? '—'}\` (${lock?.eigenaar ? 'підтверджено власником · door eigenaar bevestigd' : 'НЕ підтверджено власником · NIET bevestigd door eigenaar'})`,
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
function leesString(buf, pos) { const n = buf.readUInt32BE(pos); return [buf.subarray(pos + 4, pos + 4 + n), pos + 4 + n]; }
const sshString = (b) => { const l = Buffer.alloc(4); l.writeUInt32BE(b.length); return Buffer.concat([l, b]); };
export function sshsigGegevens(namespace, bericht) {
  const h = createHash('sha512').update(bericht).digest();
  return Buffer.concat([Buffer.from('SSHSIG'), sshString(Buffer.from(namespace)), sshString(Buffer.alloc(0)), sshString(Buffer.from('sha512')), sshString(h)]);
}
/** Перевіряє армований SSH SIGNATURE (ed25519) для повідомлення проти allowed_signers (рядки «principal ssh-ed25519 AAAA…»). */
export function verifieerSshsig({ handtekening, bericht, namespace, toegestaan, principal }) {
  try {
    const b64 = String(handtekening).replace(/-----(BEGIN|END) SSH SIGNATURE-----/g, '').replace(/\s+/g, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.subarray(0, 6).toString() !== 'SSHSIG') return { ok: false, reden: 'geen SSHSIG' };
    let p = 10; let pub, ns, hashAlg, sig;
    [pub, p] = leesString(buf, p); [ns, p] = leesString(buf, p); [, p] = leesString(buf, p); [hashAlg, p] = leesString(buf, p); [sig] = leesString(buf, p);
    if (ns.toString() !== namespace) return { ok: false, reden: `namespace ${ns} ≠ ${namespace}` };
    if (hashAlg.toString() !== 'sha512') return { ok: false, reden: 'hash moet sha512 zijn' };
    const [type, p2] = leesString(pub, 0); const [raw] = leesString(pub, p2);
    if (type.toString() !== 'ssh-ed25519' || raw.length !== 32) return { ok: false, reden: 'alleen ssh-ed25519' };
    const pubB64 = pub.toString('base64');
    const regel = String(toegestaan).split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith('#'))
      .find((r) => { const d = r.split(/\s+/); return d.includes('ssh-ed25519') && d[d.indexOf('ssh-ed25519') + 1] === pubB64 && (!principal || d[0].split(',').includes(principal)); });
    if (!regel) return { ok: false, reden: 'sleutel staat niet in de lijst van ondertekenaars' };
    const [, p3] = leesString(sig, 0); const [ruw] = leesString(sig, p3);
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
    const ok = cryptoVerify(null, sshsigGegevens(namespace, Buffer.from(bericht)), key, ruw);
    return ok ? { ok: true, sleutel: `SHA256:${createHash('sha256').update(pub).digest('base64').replace(/=+$/, '')}` } : { ok: false, reden: 'handtekening klopt niet' };
  } catch (e) { return { ok: false, reden: `onleesbaar: ${e.message}` }; }
}
/** Що саме підписує власник: однозначний рядок з версією й відбитком критичних політик. */
export const kritiekBericht = (lock) => `mijn-ruimte-regels\nregelsVersie=${lock.regelsVersie}\nkritiekHash=${lock.kritiekHash}\n`;
