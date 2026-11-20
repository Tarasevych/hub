// Ланцюг постачання (SEC-002, завершальний крок C) · Toeleveringsketen.
// Перевіряє перед випуском:
//   1) npm audit --audit-level=high: зупинка при вразливостях рівня «високий» або «критичний», а також тоді, коли аудит не вдався
//      (немає мережі, немає JSON, npm повернув помилку) — без відповіді аудиту випуск не йде далі (fail closed);
//   2) package-lock.json: кожен пакет завантажується лише з https://registry.npmjs.org/ за точною адресою
//      «<назва>/-/<коротка назва>-<версія>.tgz», яка відповідає шляху в node_modules і полю version, з контрольною сумою sha512;
//      жодних git-, file-, http-джерел чи інших хостів, крім явно перелічених винятків (UITZONDERINGEN) з точною адресою й сумою;
//   3) package.json: специфікатори залежностей — лише діапазони версій реєстру npm (або npm:-аліаси), не git/github/file/URL,
//      крім тих самих винятків.
// Controleert vóór een uitgave: npm audit (hoog/kritiek of een mislukte audit = stoppen), de herkomst en integriteit van elk pakket
// in package-lock.json (alleen registry.npmjs.org, exacte tarball-URL, sha512) en de specificaties in package.json.
// Gebruik: node scripts/keten-controle.mjs [--zonder-audit] [--streng] [--map <map met package.json en package-lock.json>]
//   --zonder-audit  alleen de lock en package.json (zonder netwerk) · лише lock-файл і package.json (без мережі)
//   --streng        geen enkele uitzondering toestaan · жодних винятків
// Afsluitcode 0 = in orde, 1 = bezwaren, 2 = verkeerd gebruik.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REGISTER = 'https://registry.npmjs.org/';

/**
 * Bewust toegestane uitzonderingen — alleen met EXACT deze versie, URL en integriteit. Een nieuwe versie vraagt eerst een besluit
 * van de eigenaar (en een aanpassing hier). Виняток діє лише для точно цієї версії, адреси й контрольної суми.
 * xlsx: SheetJS publiceert sinds 0.19 niet meer op npm; de npm-versie 0.18.5 heeft bekende kwetsbaarheden (prototype pollution,
 * ReDoS). Тому xlsx береться з cdn.sheetjs.com — рішення власника, чи лишати цей виняток.
 */
export const UITZONDERINGEN = [
  {
    pad: 'node_modules/xlsx',
    naam: 'xlsx',
    version: '0.20.3',
    resolved: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
    integrity: 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==',
    spec: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
  },
];

const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/;
const SECTIES = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** Naam van het pakket uit het pad in de lock («node_modules/a/node_modules/@s/b» → «@s/b»). */
export function naamUitPad(pad) {
  const i = pad.lastIndexOf('node_modules/');
  return i < 0 ? '' : pad.slice(i + 'node_modules/'.length);
}

/** Verwachte tarball-URL in het npm-register voor naam@versie. */
export function registerUrl(naam, versie) {
  const kort = naam.startsWith('@') ? naam.split('/')[1] : naam;
  return `${REGISTER}${naam}/-/${kort}-${versie}.tgz`;
}

/**
 * Controleert lock en package.json. Geeft een lijst bezwaren (tweetalig) terug; leeg = in orde.
 * @param {{ packages?: Record<string, any>, lockfileVersion?: number }} lock
 * @param {Record<string, any>} pkg
 * @param {{ streng?: boolean }} [opties]
 */
export function controleerKeten(lock, pkg, opties = {}) {
  const uitz = opties.streng ? [] : UITZONDERINGEN;
  const bezwaren = [];
  const b = (uk, nl) => bezwaren.push(`${uk} · ${nl}`);
  if (!lock || typeof lock !== 'object' || !lock.packages || typeof lock.packages !== 'object' || (lock.lockfileVersion ?? 0) < 2) {
    b('package-lock.json не має розділу packages (потрібна версія lock-файла 2 або 3)', 'package-lock.json heeft geen sectie packages (lockfileVersion 2 of 3 nodig)');
    return bezwaren;
  }
  let gecontroleerd = 0;
  for (const [pad, v] of Object.entries(lock.packages)) {
    if (pad === '') continue;
    if (!v || typeof v !== 'object') { b(`${pad}: запис не є об'єктом`, `${pad}: post is geen object`); continue; }
    // Gebundeld in de tarball van de ouder: valt onder diens integriteit. · Вкладений у пакет батька — під його контрольною сумою.
    if (v.inBundle === true) continue;
    if (v.link === true) {
      const r = String(v.resolved ?? '');
      if (!r || r.startsWith('/') || r.split('/').includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(r)) b(`${pad}: посилання поза сховищем (${r || 'без адреси'})`, `${pad}: koppeling buiten de repository (${r || 'zonder adres'})`);
      continue;
    }
    gecontroleerd++;
    const naam = typeof v.name === 'string' && v.name ? v.name : naamUitPad(pad);
    const versie = String(v.version ?? '');
    const resolved = typeof v.resolved === 'string' ? v.resolved : '';
    const integriteit = typeof v.integrity === 'string' ? v.integrity : '';
    const u = uitz.find((x) => x.pad === pad);
    if (u) {
      if (u.naam !== naam || u.version !== versie || u.resolved !== resolved || u.integrity !== integriteit) {
        b(`${pad}: виняток ${u.naam} дозволено лише для ${u.version} з ${u.resolved} і тією самою контрольною сумою — нова версія потребує рішення власника`,
          `${pad}: uitzondering ${u.naam} geldt alleen voor ${u.version} van ${u.resolved} met dezelfde integriteit — een nieuwe versie vraagt een besluit van de eigenaar`);
      }
      continue;
    }
    if (!naam || !versie) { b(`${pad}: немає назви або версії`, `${pad}: geen naam of versie`); continue; }
    if (!resolved) { b(`${naam}@${versie}: немає джерела (resolved)`, `${naam}@${versie}: geen herkomst (resolved)`); continue; }
    let host = '';
    try { const url = new URL(resolved); host = `${url.protocol}//${url.host}/`; } catch { /* hieronder gemeld */ }
    if (host !== REGISTER) {
      b(`${naam}@${versie}: джерело поза ${REGISTER} (${resolved.slice(0, 120)})`, `${naam}@${versie}: herkomst buiten ${REGISTER} (${resolved.slice(0, 120)})`);
      continue;
    }
    const verwacht = registerUrl(naam, versie);
    if (resolved !== verwacht) {
      b(`${naam}@${versie}: адреса пакета не відповідає назві й версії (${resolved.slice(0, 120)}, очікувано ${verwacht})`,
        `${naam}@${versie}: tarball-URL past niet bij naam en versie (${resolved.slice(0, 120)}, verwacht ${verwacht})`);
    }
    const delen = integriteit.split(/\s+/).filter(Boolean);
    if (!delen.length || !delen.every((d) => SHA512.test(d))) {
      b(`${naam}@${versie}: немає контрольної суми sha512 (integrity)`, `${naam}@${versie}: geen sha512-integriteit`);
    }
  }
  if (!gecontroleerd) b('package-lock.json не містить жодного пакета', 'package-lock.json bevat geen enkel pakket');

  // package.json: alleen bereiken uit het register (of npm:-aliassen); git/github/file/URL alleen als exacte uitzondering.
  const specOk = (naam, spec) => {
    if (typeof spec !== 'string') return false;
    const u = uitz.find((x) => x.naam === naam && x.spec === spec);
    if (u) return true;
    const bereikOk = (s) => /^[\w.^~<>=*|\s+-]*$/.test(s);
    if (spec.startsWith('npm:')) {
      // «npm:<naam>[@<bereik>]» — alias naar een ander pakket uit hetzelfde register. · Аліас на пакет із того самого реєстру.
      const m = /^(@[\w.-]+\/)?[\w.-]+(?:@(.*))?$/.exec(spec.slice(4));
      return !!m && bereikOk(m[2] ?? '');
    }
    return bereikOk(spec);
  };
  for (const sectie of SECTIES) {
    for (const [naam, spec] of Object.entries(pkg?.[sectie] ?? {})) {
      if (!specOk(naam, spec)) b(`package.json ${sectie}.${naam}: джерело «${String(spec).slice(0, 80)}» поза реєстром npm`, `package.json ${sectie}.${naam}: bron «${String(spec).slice(0, 80)}» buiten het npm-register`);
    }
  }
  const loopOverrides = (o, prefix) => {
    for (const [k, w] of Object.entries(o ?? {})) {
      const naam = k.replace(/@[^@]*$/, '') || k;
      if (w && typeof w === 'object') loopOverrides(w, `${prefix}${k}.`);
      else if (!(typeof w === 'string' && (w.startsWith('$') || specOk(naam, w) || specOk(k === '.' ? prefix.slice(0, -1) : k, w)))) {
        b(`package.json overrides.${prefix}${k}: джерело «${String(w).slice(0, 80)}» поза реєстром npm`, `package.json overrides.${prefix}${k}: bron «${String(w).slice(0, 80)}» buiten het npm-register`);
      }
    }
  };
  loopOverrides(pkg?.overrides, '');
  return bezwaren;
}

/**
 * Beoordeelt de uitvoer van «npm audit --audit-level=high --json». Fail closed: zonder bruikbaar antwoord geen doorgang.
 * @param {string} json  stdout van npm audit
 * @param {number} code  afsluitcode van npm audit
 * @returns {{ ok: boolean, reden: string, telling?: Record<string, number> }}
 */
export function beoordeelAudit(json, code) {
  let a;
  try { a = JSON.parse(String(json || '')); } catch { a = null; }
  if (!a || typeof a !== 'object') return { ok: false, reden: 'аудит npm не повернув відповіді (мережа?) — випуск зупинено · npm audit gaf geen antwoord (netwerk?) — uitgave gestopt' };
  if (a.error) return { ok: false, reden: `аудит npm не вдався (${String(a.error.code ?? a.error.summary ?? 'fout').slice(0, 60)}) · npm audit mislukt` };
  const t = a.metadata?.vulnerabilities;
  if (!t || typeof t !== 'object') return { ok: false, reden: 'у відповіді аудиту немає підсумку вразливостей · het antwoord van npm audit heeft geen telling' };
  const telling = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const k of Object.keys(telling)) telling[k] = Number(t[k] ?? 0) || 0;
  if (telling.high + telling.critical > 0) {
    const namen = Object.entries(a.vulnerabilities ?? {}).filter(([, v]) => v && (v.severity === 'high' || v.severity === 'critical')).map(([n]) => n);
    return { ok: false, telling, reden: `вразливості високого/критичного рівня: ${telling.high}/${telling.critical} (${namen.join(', ').slice(0, 200)}) · kwetsbaarheden hoog/kritiek` };
  }
  if (code !== 0) return { ok: false, telling, reden: `npm audit завершився з кодом ${code} · npm audit eindigde met code ${code}` };
  return { ok: true, telling, reden: 'вразливостей високого чи критичного рівня немає · geen kwetsbaarheden hoog of kritiek' };
}

function hoofd(argv) {
  const zonderAudit = argv.includes('--zonder-audit');
  const streng = argv.includes('--streng');
  const iMap = argv.indexOf('--map');
  if (iMap >= 0 && !argv[iMap + 1]) { console.error('--map вимагає теки · --map vraagt een map'); return 2; }
  const map = resolve(iMap >= 0 ? argv[iMap + 1] : process.cwd());
  let lock, pkg;
  try {
    lock = JSON.parse(readFileSync(join(map, 'package-lock.json'), 'utf8'));
    pkg = JSON.parse(readFileSync(join(map, 'package.json'), 'utf8'));
  } catch (e) {
    console.error(`Не вдалося прочитати package.json або package-lock.json · package.json of package-lock.json onleesbaar: ${String(e?.message ?? e).slice(0, 160)}`);
    return 1;
  }
  let fout = false;
  const bezwaren = controleerKeten(lock, pkg, { streng });
  const aantal = Object.keys(lock.packages ?? {}).length - 1;
  if (bezwaren.length) {
    fout = true;
    console.error(`Походження пакетів: ${bezwaren.length} зауважень · Herkomst van pakketten: ${bezwaren.length} bezwaren`);
    for (const x of bezwaren) console.error(`  - ${x}`);
  } else {
    const u = streng ? 0 : UITZONDERINGEN.filter((x) => lock.packages?.[x.pad]).length;
    console.log(`Походження пакетів у порядку: ${aantal} записів, лише ${REGISTER} (винятків: ${u}) · Herkomst van pakketten in orde: ${aantal} posten, alleen ${REGISTER} (uitzonderingen: ${u})`);
  }
  if (!zonderAudit) {
    const r = spawnSync('npm', ['audit', '--audit-level=high', '--json'], { cwd: map, encoding: 'utf8', timeout: 180_000, maxBuffer: 64 << 20 });
    const oordeel = beoordeelAudit(r.stdout, r.status ?? 1);
    const t = oordeel.telling ? Object.entries(oordeel.telling).map(([k, v]) => `${k}=${v}`).join(' ') : '';
    if (oordeel.ok) console.log(`Аудит npm: ${oordeel.reden}${t ? ` (${t})` : ''}`);
    else { fout = true; console.error(`Аудит npm: ${oordeel.reden}${t ? ` (${t})` : ''}`); }
  } else {
    console.log('Аудит npm пропущено (--zonder-audit) · npm audit overgeslagen (--zonder-audit)');
  }
  return fout ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(hoofd(process.argv.slice(2)));
