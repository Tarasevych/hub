// Створює свіжий локальний перевірковий центр сертифікації (ca.crt, ca.key) і серверний сертифікат (srv.crt, srv.key)
// для *.tarasevych.com та localhost на 30 діб поза деревом сховища (звернення №164). Ключі ніколи не потрапляють у Git.
// Maakt een verse lokale proef-CA (ca.crt, ca.key) en een servercertificaat (srv.crt, srv.key) voor *.tarasevych.com
// en localhost met een geldigheid van 30 dagen buiten de opslagplaats (melding nr. 164). Sleutels komen nooit in Git.
//
// Використання / Gebruik:
//   node scripts/e2e-tls-maak.mjs [--map <шлях>] [--dagen 30] [--vernieuw] [--nss]
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WERKELIJKE_WORTEL = (() => {
  try { return realpathSync(WORTEL); } catch { return WORTEL; }
})();
export const STANDAARD_E2E_TLS_MAP = join(homedir(), '.local', 'share', 'mijn-ruimte-e2e-tls');
const MIN_REST_MS = 7 * 24 * 60 * 60 * 1000;

function leesArg(args, vlag, terugval) {
  const idx = args.indexOf(vlag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : terugval;
}

/** Перевіряє чинність наявної пари ca.crt + srv.crt + srv.key. */
export function controleerE2eTls(map, minRestMs = 60_000) {
  const paden = { caCrt: join(map, 'ca.crt'), srvCrt: join(map, 'srv.crt'), srvKey: join(map, 'srv.key') };
  if (!existsSync(paden.caCrt) || !existsSync(paden.srvCrt) || !existsSync(paden.srvKey)) {
    return { geldig: false, reden: 'ontbreekt', geldigTot: null };
  }
  try {
    const ca = new X509Certificate(readFileSync(paden.caCrt));
    const srv = new X509Certificate(readFileSync(paden.srvCrt));
    const nu = Date.now();
    const totMs = Math.min(Date.parse(ca.validTo), Date.parse(srv.validTo));
    const vanafMs = Math.max(Date.parse(ca.validFrom), Date.parse(srv.validFrom));
    if (!Number.isFinite(totMs) || !Number.isFinite(vanafMs)) {
      return { geldig: false, reden: 'ongeldig-formaat', geldigTot: srv.validTo || null };
    }
    if (nu < vanafMs - 5 * 60_000) {
      return { geldig: false, reden: 'nog-niet-geldig', geldigTot: new Date(totMs).toISOString() };
    }
    if (totMs - nu <= minRestMs) {
      return { geldig: false, reden: totMs <= nu ? 'verlopen' : 'bijna-verlopen', geldigTot: new Date(totMs).toISOString() };
    }
    if (!srv.checkIssued(ca)) {
      return { geldig: false, reden: 'keten-ongeldig', geldigTot: new Date(totMs).toISOString() };
    }
    return { geldig: true, reden: 'actueel', geldigTot: new Date(totMs).toISOString() };
  } catch {
    return { geldig: false, reden: 'onleesbaar', geldigTot: null };
  }
}

function ontvouwenPad(doelPad, diepte = 0) {
  const abs = resolve(doelPad);
  if (diepte > 32) return abs;
  const staart = [];
  let huidig = abs;
  while (true) {
    try {
      const echt = realpathSync(huidig);
      return staart.length > 0 ? resolve(echt, ...staart) : echt;
    } catch {
      try {
        const st = lstatSync(huidig);
        if (st.isSymbolicLink()) {
          const doel = resolve(dirname(huidig), readlinkSync(huidig));
          const vervolg = staart.length > 0 ? resolve(doel, ...staart) : doel;
          return ontvouwenPad(vervolg, diepte + 1);
        }
      } catch {
        // Проміжний сегмент іще не створено — перевіряємо найближчий батьківський каталог.
      }
      const ouder = dirname(huidig);
      if (ouder === huidig) return abs;
      staart.unshift(basename(huidig));
      huidig = ouder;
    }
  }
}

function controleerTegenWortel(kandidaatAbs, wortelAbs, oorspronkelijk) {
  const rel = relative(wortelAbs, kandidaatAbs).replace(/\\/g, '/');
  if (kandidaatAbs === wortelAbs || rel === '') {
    throw new Error('Відхилено корінь сховища як каталог E2E_TLS. / Wortel van de opslagplaats geweigerd als E2E_TLS-map.');
  }
  if (!rel.startsWith('..') && !rel.startsWith('rapporten/')) {
    throw new Error(
      `Відхилено шлях E2E_TLS усередині сховища (${oorspronkelijk}): ключі перевіркового центру не можна зберігати у дереві коду. ` +
      `Вкажіть зовнішній каталог (наприклад, ${STANDAARD_E2E_TLS_MAP}) або rapporten/. / ` +
      `Pad voor E2E_TLS binnen de opslagplaats geweigerd (${oorspronkelijk}): proefsleutels horen buiten de bronboom ` +
      `(bijv. ${STANDAARD_E2E_TLS_MAP} of onder rapporten/).`,
    );
  }
}

function weigerPadBinnenRepo(doelMap) {
  const abs = resolve(doelMap);
  controleerTegenWortel(abs, WORTEL, abs);
  const ontvouwen = ontvouwenPad(abs);
  controleerTegenWortel(ontvouwen, WERKELIJKE_WORTEL, abs);
}

function draaiOpenssl(argumenten) {
  const r = spawnSync('openssl', argumenten, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`Помилка openssl / openssl-fout: ${(r.stderr || r.stdout || '').trim().slice(-300)}`);
  }
}

/** Ідемпотентно створює або оновлює перевірковий центр і сертифікат сервера. */
export function zorgVoorE2eTls(opties = {}) {
  const doelMap = resolve(opties.map || process.env.E2E_TLS || STANDAARD_E2E_TLS_MAP);
  const dagen = Math.max(1, Math.min(397, Number(opties.dagen || 30)));
  const vernieuw = Boolean(opties.vernieuw);
  weigerPadBinnenRepo(doelMap);

  const huidig = controleerE2eTls(doelMap, MIN_REST_MS);
  if (!vernieuw && huidig.geldig) {
    return { map: doelMap, aangemaakt: false, geldigTot: huidig.geldigTot };
  }

  mkdirSync(doelMap, { recursive: true, mode: 0o700 });
  const werk = mkdtempSync(join(tmpdir(), 'mr-e2e-tls-'));
  try {
    draaiOpenssl([
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-nodes', '-days', String(dagen),
      '-subj', '/CN=Mijn Ruimte Lokaal Proef-CA',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-keyout', join(werk, 'ca.key'),
      '-out', join(werk, 'ca.crt'),
    ]);
    draaiOpenssl([
      'req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-nodes', '-subj', '/CN=*.tarasevych.com',
      '-keyout', join(werk, 'srv.key'),
      '-out', join(werk, 'srv.csr'),
    ]);
    writeFileSync(
      join(werk, 'srv.ext'),
      [
        'basicConstraints = critical, CA:FALSE',
        'keyUsage = critical, digitalSignature, keyEncipherment',
        'extendedKeyUsage = serverAuth',
        'subjectAltName = DNS:*.tarasevych.com,DNS:tarasevych.com,DNS:localhost,IP:127.0.0.1,IP:::1',
        '',
      ].join('\n'),
      'utf8',
    );
    draaiOpenssl([
      'x509', '-req', '-in', join(werk, 'srv.csr'),
      '-CA', join(werk, 'ca.crt'), '-CAkey', join(werk, 'ca.key'), '-CAcreateserial',
      '-out', join(werk, 'srv.crt'), '-days', String(dagen), '-sha256',
      '-extfile', join(werk, 'srv.ext'),
    ]);

    for (const geheimBestand of ['ca.key', 'srv.key']) chmodSync(join(werk, geheimBestand), 0o600);
    for (const openbaarBestand of ['ca.crt', 'srv.crt']) chmodSync(join(werk, openbaarBestand), 0o644);
    for (const naam of ['ca.key', 'ca.crt', 'srv.key', 'srv.crt']) {
      const bron = join(werk, naam);
      const doel = join(doelMap, naam);
      try {
        renameSync(bron, doel);
      } catch {
        writeFileSync(doel, readFileSync(bron), { mode: naam.endsWith('.key') ? 0o600 : 0o644 });
      }
    }

    if (opties.nss) {
      const nssMap = join(homedir(), '.pki', 'nssdb');
      mkdirSync(nssMap, { recursive: true, mode: 0o700 });
      spawnSync('certutil', ['-d', `sql:${nssMap}`, '-D', '-n', 'Mijn Ruimte Lokaal Proef-CA'], { stdio: 'ignore' });
      spawnSync('certutil', ['-d', `sql:${nssMap}`, '-A', '-t', 'C,,', '-n', 'Mijn Ruimte Lokaal Proef-CA', '-i', join(doelMap, 'ca.crt')], { stdio: 'ignore' });
    }
  } finally {
    rmSync(werk, { recursive: true, force: true });
  }

  const na = controleerE2eTls(doelMap, 60_000);
  if (!na.geldig) {
    throw new Error(`Створений сертифікат не пройшов самоперевірку (${na.reden}). / Aangemaakt certificaat kwam niet door de zelfcontrole (${na.reden}).`);
  }
  return { map: doelMap, aangemaakt: true, geldigTot: na.geldigTot };
}

const isHoofd = (() => {
  try { return Boolean(process.argv[1]) && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]); } catch { return false; }
})();

if (isHoofd) {
  const args = process.argv.slice(2);
  const resultaat = zorgVoorE2eTls({
    map: leesArg(args, '--map', ''),
    dagen: Number(leesArg(args, '--dagen', '30')),
    vernieuw: args.includes('--vernieuw'),
    nss: args.includes('--nss'),
  });
  const actieUk = resultaat.aangemaakt ? 'створено новий сертифікат' : 'наявний сертифікат чинний';
  const actieNl = resultaat.aangemaakt ? 'nieuw certificaat aangemaakt' : 'bestaand certificaat is geldig';
  console.log(`[e2e-tls] ${actieUk} / ${actieNl}: ${resultaat.map} (до / tot ${resultaat.geldigTot})`);
}
