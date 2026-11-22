// Модульне випробування для scripts/e2e-tls-maak.mjs та scripts/e2e-lokaal.mjs (звернення №164, CONSOL-001, 22.11.2026).
// Перевіряє створення чинної пари ca.crt + srv.crt на 30 діб у тимчасовій теці з подальшим видаленням,
// повторостійкість другого виклику (aangemaakt === false), відхилення шляху всередині кореня сховища,
// а також завершення e2e-lokaal.mjs із кодом 2 та двомовною підказкою при відсутньому або простроченому E2E_TLS без E2E_TLS_AUTO=1.
// Eenheidstest voor scripts/e2e-tls-maak.mjs en scripts/e2e-lokaal.mjs (melding nr. 164, CONSOL-001).
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';

interface TlsModule {
  STANDAARD_E2E_TLS_MAP: string;
  controleerE2eTls: (map: string, minRestMs?: number) => { geldig: boolean; reden: string; geldigTot: string | null };
  zorgVoorE2eTls: (opties?: { map?: string; dagen?: number; vernieuw?: boolean; nss?: boolean }) => {
    map: string;
    aangemaakt: boolean;
    geldigTot: string | null;
  };
}

function maakVerlopenCertificaat(doelMap: string): void {
  mkdirSync(doelMap, { recursive: true, mode: 0o700 });
  const werk = mkdtempSync(join(tmpdir(), 'mr-verlopen-ca-'));
  try {
    const run = (args: string[]) => {
      const r = spawnSync('openssl', args, { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    };
    run([
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-nodes', '-days', '30', '-subj', '/CN=Mijn Ruimte Proef-CA Verlopen',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-keyout', join(doelMap, 'ca.key'),
      '-out', join(doelMap, 'ca.crt'),
    ]);
    run([
      'req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-nodes', '-subj', '/CN=*.tarasevych.com',
      '-keyout', join(doelMap, 'srv.key'),
      '-out', join(werk, 'srv.csr'),
    ]);
    writeFileSync(join(werk, 'index.txt'), '', 'utf8');
    writeFileSync(join(werk, 'serial'), '01\n', 'utf8');
    writeFileSync(
      join(werk, 'ca.cnf'),
      [
        '[ca]',
        'default_ca = c',
        '[c]',
        `dir = ${werk}`,
        `database = ${join(werk, 'index.txt')}`,
        `new_certs_dir = ${werk}`,
        `certificate = ${join(doelMap, 'ca.crt')}`,
        `private_key = ${join(doelMap, 'ca.key')}`,
        `serial = ${join(werk, 'serial')}`,
        'default_md = sha256',
        'policy = p',
        '[p]',
        'commonName = supplied',
        '',
      ].join('\n'),
      'utf8',
    );
    run([
      'ca', '-batch', '-config', join(werk, 'ca.cnf'),
      '-startdate', '20240101000000Z', '-enddate', '20240102000000Z',
      '-notext', '-in', join(werk, 'srv.csr'), '-out', join(doelMap, 'srv.crt'),
    ]);
  } finally {
    rmSync(werk, { recursive: true, force: true });
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e-tls-maak-20261122');

  const scriptPad = resolve('scripts/e2e-tls-maak.mjs');
  const lokaalPad = resolve('scripts/e2e-lokaal.mjs');
  const mod = (await import(pathToFileURL(scriptPad).href)) as TlsModule;

  const basis = mkdtempSync(join(tmpdir(), 'e2e-tls-test-'));
  try {
    // 1. Створення чинної пари ca.crt + srv.crt на 30 діб у тимчасовій теці поза сховищем
    const tlsMap = join(basis, 'vers-tls');
    const eerste = mod.zorgVoorE2eTls({ map: tlsMap, dagen: 30 });
    check('1. перший виклик створює свіжу пару сертифікатів (aangemaakt === true)', eerste.aangemaakt === true && eerste.map === tlsMap);
    check(
      '1а. усі 4 файли (ca.key, ca.crt, srv.key, srv.crt) присутні, закриті ключі мають режим 0600',
      ['ca.key', 'ca.crt', 'srv.key', 'srv.crt'].every((n) => existsSync(join(tlsMap, n)))
        && (statSync(join(tlsMap, 'ca.key')).mode & 0o777) === 0o600
        && (statSync(join(tlsMap, 'srv.key')).mode & 0o777) === 0o600,
    );

    const caCert = new X509Certificate(readFileSync(join(tlsMap, 'ca.crt')));
    const srvCert = new X509Certificate(readFileSync(join(tlsMap, 'srv.crt')));
    const restDagen = (Date.parse(srvCert.validTo) - Date.now()) / (24 * 60 * 60 * 1000);
    check(
      '1б. srv.crt підписаний ca.crt, містить *.tarasevych.com і localhost та чинний близько 30 діб',
      srvCert.checkIssued(caCert)
        && Boolean(srvCert.subjectAltName?.includes('DNS:*.tarasevych.com'))
        && Boolean(srvCert.subjectAltName?.includes('DNS:localhost'))
        && restDagen > 28 && restDagen <= 31,
      `restDagen=${restDagen.toFixed(2)} san=${srvCert.subjectAltName}`,
    );

    // 2. Повторостійкість другого виклику (ідемпотентність)
    const serieVoor = srvCert.serialNumber;
    const tweede = mod.zorgVoorE2eTls({ map: tlsMap, dagen: 30 });
    const srvNaTweede = new X509Certificate(readFileSync(join(tlsMap, 'srv.crt')));
    check(
      '2. повторний виклик без --vernieuw не перезаписує чинний сертифікат (aangemaakt === false)',
      tweede.aangemaakt === false && srvNaTweede.serialNumber === serieVoor,
    );

    // 3. Відхилення шляхів усередині кореня сховища
    let wortelGeweigerd = false;
    try {
      mod.zorgVoorE2eTls({ map: resolve('.') });
    } catch {
      wortelGeweigerd = true;
    }
    const verbodenSubmap = resolve('scripts/__verboden_e2e_tls_proef__');
    let submapGeweigerd = false;
    let foutTekstSubmap = '';
    try {
      mod.zorgVoorE2eTls({ map: verbodenSubmap });
    } catch (fout) {
      submapGeweigerd = true;
      foutTekstSubmap = String((fout as Error)?.message || fout);
    }
    check(
      '3. відхиляє корінь сховища та підтеку всередині дерева коду без створення файлів',
      wortelGeweigerd
        && submapGeweigerd
        && !existsSync(verbodenSubmap)
        && foutTekstSubmap.includes('Відхилено шлях E2E_TLS')
        && foutTekstSubmap.includes('geweigerd'),
      foutTekstSubmap.slice(0, 200),
    );

    // 4. Відмова e2e-lokaal.mjs з кодом 2 та двомовною підказкою при відсутньому сертифікаті в E2E_TLS без E2E_TLS_AUTO=1
    const ontbrekendMap = join(basis, 'leeg-tls');
    const runOntbreekt = spawnSync(process.execPath, [lokaalPad, '__geen_enkele_e2e_test__'], {
      encoding: 'utf8',
      env: { ...process.env, E2E_TLS: ontbrekendMap, E2E_TLS_AUTO: '' },
    });
    const errOntbreekt = `${runOntbreekt.stderr || ''}${runOntbreekt.stdout || ''}`;
    check(
      '4а. відсутній E2E_TLS без E2E_TLS_AUTO=1 завершує e2e-lokaal.mjs із кодом 2 і двомовною підказкою',
      runOntbreekt.status === 2
        && errOntbreekt.includes('ontbreekt')
        && errOntbreekt.includes('Створіть свіжий локальний сертифікат')
        && errOntbreekt.includes('Maak een vers lokaal certificaat')
        && errOntbreekt.includes('node scripts/e2e-tls-maak.mjs'),
      `${runOntbreekt.status} ${errOntbreekt.slice(0, 240)}`,
    );

    // 5. Відмова e2e-lokaal.mjs з кодом 2 та двомовною підказкою при простроченому сертифікаті в E2E_TLS без E2E_TLS_AUTO=1
    const verlopenMap = join(basis, 'verlopen-tls');
    maakVerlopenCertificaat(verlopenMap);
    const staatVerlopen = mod.controleerE2eTls(verlopenMap, 60_000);
    check('4б. штучно прострочений X.509 сертифікат розпізнається як verlopen', !staatVerlopen.geldig && staatVerlopen.reden === 'verlopen');

    const runVerlopen = spawnSync(process.execPath, [lokaalPad, '__geen_enkele_e2e_test__'], {
      encoding: 'utf8',
      env: { ...process.env, E2E_TLS: verlopenMap, E2E_TLS_AUTO: '' },
    });
    const errVerlopen = `${runVerlopen.stderr || ''}${runVerlopen.stdout || ''}`;
    check(
      '4в. прострочений E2E_TLS без E2E_TLS_AUTO=1 завершує e2e-lokaal.mjs із кодом 2 і двомовною підказкою',
      runVerlopen.status === 2
        && errVerlopen.includes('verlopen')
        && errVerlopen.includes('Створіть свіжий локальний сертифікат')
        && errVerlopen.includes('Maak een vers lokaal certificaat'),
      `${runVerlopen.status} ${errVerlopen.slice(0, 240)}`,
    );

    // 6. Автоматичне оновлення при E2E_TLS_AUTO=1
    const runAuto = spawnSync(process.execPath, [lokaalPad, '__geen_enkele_e2e_test__'], {
      encoding: 'utf8',
      env: { ...process.env, E2E_TLS: verlopenMap, E2E_TLS_AUTO: '1' },
    });
    const staatNaAuto = mod.controleerE2eTls(verlopenMap, 60_000);
    check(
      '5. із E2E_TLS_AUTO=1 прострочений сертифікат автоматично оновлюється й стає чинним (код 0)',
      runAuto.status === 0 && staatNaAuto.geldig === true,
      `${runAuto.status} ${runAuto.stderr || ''}`,
    );
  } finally {
    rmSync(basis, { recursive: true, force: true });
  }
  check('6. тимчасова тека випробування повністю прибрана з tmpdir()', !existsSync(basis));

  return einde();
}
