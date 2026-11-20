// SEC-002 · groep g09 (12.11.2026): regressietests voor
//   server-uitrol-02  root schrijft archief + .sha256 in de app-schrijfbare map pakketten (symlinks); proef-inbox: controle-dan-gebruik
//   server-uitrol-04  migratieproef: willekeurige SQL met de gedeelde migratierol, zonder step-up; schijf vol
//   server-uitrol-05  migrations/rechten.sql (later als postgres via psql) kwam uit de releasemap die de build kon wijzigen
//   keten-config-06   build draaide als de dienstgebruiker, met installatiescripts van afhankelijkheden, zonder afscherming
//   server-uitrol-08  signaal na het overschakelen: nieuwe release bleef ongecontroleerd actief, status zei «vorige blijft actief»
// SEC-002 · група g09: регресійні тести. Усі «секрети» тут — вигадані.
//
// Zelfde test vóór de patch: node <scratch>/g09/maak-oud.mjs en daarna SEC002_G09_OUD=<map> node scripts/eenheidstests.mjs sec-002-g09-20261112.test.ts
// (de map bevat de shellscripts en gebundelde TS-modules van basis 11e0aad8).
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// Eigen checker (zelfde uitvoer als tests/eenheid/hulp/nep-google.ts): die helper trekt via een dynamische import heel backend/index
// mee, zodat een tijdelijke syntaxfout van een collega elders deze test niet laat bouwen.
function checker(groep: string) {
  const res: boolean[] = [];
  const check = (naam: string, ok: boolean, info = '') => { res.push(ok); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
  const einde = () => { const mis = res.filter((x) => !x).length; console.log(`\n${res.length - mis}/${res.length} geslaagd (${groep})`); return mis ? 1 : 0; };
  return { check, einde };
}

const OUD = process.env.SEC002_G09_OUD || '';
const W = process.cwd();
const BRON: Record<string, string> = {
  installeer: OUD ? join(OUD, 'installeer-app.sh') : join(W, 'deploy/installeer-app.sh'),
  uitrol: OUD ? join(OUD, 'mijn-ruimte-uitrol.sh') : join(W, 'deploy/uitrol/mijn-ruimte-uitrol.sh'),
  proef: OUD ? join(OUD, 'mijn-ruimte-migratie-proef.sh') : join(W, 'deploy/uitrol/mijn-ruimte-migratie-proef.sh'),
};
const tekst = (k: keyof typeof BRON | string) => readFileSync(BRON[k], 'utf8');

/** Een bash-functie uit een script: van «naam() {» tot de eerste regel «}» (of één regel «naam() { …; }»). Leeg als ze niet bestaat. */
function functie(k: string, naam: string): string {
  const r = tekst(k).split('\n');
  const van = r.findIndex((x) => x.startsWith(`${naam}() {`) || x.startsWith(`${naam} () {`));
  if (van < 0) return '';
  if (/\}\s*$/.test(r[van]) && r[van].includes('; }')) return r[van];
  const tot = r.findIndex((x, i) => i > van && x === '}');
  return r.slice(van, tot + 1).join('\n');
}
/** Regels van «begin» (exacte regel of prefix) t/m de eerste regel die aan «eind» voldoet. */
function stuk(k: string, begin: (x: string) => boolean, eind: (x: string) => boolean): string {
  const r = tekst(k).split('\n');
  const van = r.findIndex(begin);
  if (van < 0) return '';
  const tot = r.findIndex((x, i) => i >= van && eind(x));
  return tot < 0 ? '' : r.slice(van, tot + 1).join('\n');
}
const regel = (k: string, prefix: string) => tekst(k).split('\n').find((x) => x.startsWith(prefix)) || '';
function bash(script: string, args: string[] = [], env: Record<string, string> = {}, timeout = 60_000) {
  const r = spawnSync('bash', ['-c', script, 'g09', ...args], { encoding: 'utf8', timeout, env: { ...process.env, ...env } });
  return { status: r.status, uit: r.stdout || '', fout: r.stderr || '', signaal: r.signal };
}
const groep = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();
/** Gebundelde modules importeren kale pakketnamen (pg…): ze moeten binnen de repository staan om node_modules te vinden. */
const repoTmp = () => { mkdirSync(join(W, 'rapporten'), { recursive: true }); return mkdtempSync(join(W, 'rapporten', 'g09-')); };
const opgeruimd: string[] = [];
async function laadOud(naam: string): Promise<any> {
  const d = repoTmp(); opgeruimd.push(d);
  copyFileSync(join(OUD, naam), join(d, naam));
  return import(pathToFileURL(join(d, naam)).href);
}

export async function main(): Promise<number> {
  const { check, einde } = checker(`sec-002-g09-20261112${OUD ? ' (OUD: vóór de patch)' : ''}`);
  const basis = mkdtempSync(join(tmpdir(), 'sec002-g09-'));
  if (OUD) console.log(`LET OP: draait tegen de versies vóór de patch uit ${OUD}`);

  // ================================================================ server-uitrol-02 · map pakketten (mijn-ruimte-uitrol.sh)
  {
    const V = '20991231-235959', NAAM = `mijn-ruimte-${V}.tar.gz`;
    const opzet = (n: string) => {
      const b = join(basis, `u02-${n}`); const pk = join(b, 'pakketten'), werk = join(b, 'werk'), klaar = join(b, 'klaar');
      mkdirSync(pk, { recursive: true }); mkdirSync(werk, { recursive: true });
      writeFileSync(join(werk, 'pakket.tar.gz'), 'inhoud van het pakket\n');
      const slachtoffer = join(b, 'root-bestand.txt'); writeFileSync(slachtoffer, 'ORIGINEEL ROOT-BESTAND\n', { mode: 0o600 }); chmodSync(slachtoffer, 0o600);
      return { b, pk, werk, klaar, slachtoffer };
    };
    const ongemoeid = (p: string) => readFileSync(p, 'utf8') === 'ORIGINEEL ROOT-BESTAND\n' && (statSync(p).mode & 0o777) === 0o600;
    const uitrolFn = `${functie('uitrol', 'pakketten_map_veilig')}\n${functie('uitrol', 'pakket_bewaren')}`;
    const draaiUitrol = (o: ReturnType<typeof opzet>) => bash(`set -uo pipefail; umask 077; log() { printf 'log: %s\\n' "$*" >&2; }
PAKKETTEN_DIR="$1"; WERK="$2"; VERSIE="$3"; GROEP="$4"; PAKKET_PAD=""; PAKKET_SHA256=""; PAKKET_BYTES=""
${uitrolFn}
pakket_bewaren; echo "rc=$? pad=$PAKKET_PAD"`, [o.pk, o.werk, V, groep]);

    let o = opzet('a'); symlinkSync(o.slachtoffer, join(o.pk, `${NAAM}.sha256`));
    let r = draaiUitrol(o);
    check('uitrol-02: vooraf geplaatste symlink «<archief>.sha256» → root-bestand NIET overschreven en rechten ongewijzigd (600)', ongemoeid(o.slachtoffer),
      `${r.uit.trim()} | slachtoffer: ${JSON.stringify(readFileSync(o.slachtoffer, 'utf8').slice(0, 40))} ${(statSync(o.slachtoffer).mode & 0o777).toString(8)}`);
    check('uitrol-02: .sha256 is daarna een gewoon bestand met de juiste regel (archief toch bewaard)',
      !lstatSync(join(o.pk, `${NAAM}.sha256`)).isSymbolicLink() && readFileSync(join(o.pk, `${NAAM}.sha256`), 'utf8') === `${createHash('sha256').update('inhoud van het pakket\n').digest('hex')}  ${NAAM}\n`
      && (statSync(join(o.pk, NAAM)).mode & 0o777) === 0o640, r.fout.trim().slice(0, 200));

    o = opzet('b'); symlinkSync(o.slachtoffer, join(o.pk, NAAM));
    r = draaiUitrol(o);
    check('uitrol-02: symlink op de naam van het archief zelf → root-bestand ongemoeid; archief is een gewoon bestand', ongemoeid(o.slachtoffer) && !lstatSync(join(o.pk, NAAM)).isSymbolicLink(), r.uit.trim());

    o = opzet('c'); const vreemd = join(o.b, 'vreemde-map'); mkdirSync(vreemd, { mode: 0o700 }); chmodSync(vreemd, 0o700); rmSync(o.pk, { recursive: true }); symlinkSync(vreemd, o.pk);
    r = draaiUitrol(o);
    check('uitrol-02: map pakketten is zelf een symlink → niets geschreven, rechten van het doel ongewijzigd', readdirSync(vreemd).length === 0 && (statSync(vreemd).mode & 0o777) === 0o700, `${r.uit.trim()} ${r.fout.trim().slice(0, 160)}`);

    o = opzet('d');
    r = draaiUitrol(o);
    check('uitrol-02: gewone situatie → archief + .sha256 bewaard (0640), geen tijdelijke bestanden in de gedeelde map', r.uit.includes(`pad=${join(o.pk, NAAM)}`)
      && readdirSync(o.pk).sort().join(',') === `${NAAM},${NAAM}.sha256` && (statSync(join(o.pk, `${NAAM}.sha256`)).mode & 0o777) === 0o640, `${r.uit.trim()} | ${readdirSync(o.pk).join(',')}`);
  }

  // ================================================================ server-uitrol-02 · pakket_bewaren_ssh (installeer-app.sh)
  {
    const V = '20991231-235958', NAAM = `mijn-ruimte-${V}.tar.gz`;
    const sshFn = `${functie('installeer', 'pakketten_map_veilig')}\n${functie('installeer', 'pakket_bewaren_ssh')}`;
    const opzet = (n: string) => {
      const b = join(basis, `ssh-${n}`); const pk = join(b, 'pakketten'), klaar = join(b, 'klaar-root'), bron = join(b, `mijn-ruimte-${V}`);
      mkdirSync(pk, { recursive: true }); mkdirSync(bron, { recursive: true }); writeFileSync(join(bron, 'UITROL-VERSIE'), `${V}\n`);
      const slachtoffer = join(b, 'root-bestand.txt'); writeFileSync(slachtoffer, 'ORIGINEEL ROOT-BESTAND\n'); chmodSync(slachtoffer, 0o600);
      return { b, pk, klaar, bron, slachtoffer };
    };
    const ongemoeid = (p: string) => readFileSync(p, 'utf8') === 'ORIGINEEL ROOT-BESTAND\n' && (statSync(p).mode & 0o777) === 0o600;
    const draai = (o: ReturnType<typeof opzet>) => bash(`set -uo pipefail; umask 077
waarschuwing() { printf 'waarschuwing: %s\\n' "$*" >&2; }; melding() { printf 'melding: %s\\n' "$*" >&2; }
GEBRUIKER="$4"; PAKKETTEN_DIR="$1"; PAKKET_KLAAR_ROOT="$5"
${sshFn}
pakket_bewaren_ssh "$2" "$3"; echo "rc=$?"`, [o.pk, o.bron, V, groep, o.klaar], { MIJN_RUIMTE_UITROL_MODUS: 'ssh' });
    let o = opzet('a'); symlinkSync(o.slachtoffer, join(o.pk, `${NAAM}.sha256`)); symlinkSync(o.slachtoffer, join(o.pk, NAAM));
    let r = draai(o);
    check('uitrol-02 (ssh): symlinks op archief én .sha256 → root-bestand ongemoeid, beide nu gewone bestanden', ongemoeid(o.slachtoffer)
      && !lstatSync(join(o.pk, NAAM)).isSymbolicLink() && !lstatSync(join(o.pk, `${NAAM}.sha256`)).isSymbolicLink(),
      `${JSON.stringify(readFileSync(o.slachtoffer, 'utf8').slice(0, 50))} ${(statSync(o.slachtoffer).mode & 0o777).toString(8)} ${r.fout.trim().split('\n').slice(-1)[0]}`);
    check('uitrol-02 (ssh): geen tijdelijke «.pakket.*» meer in de gedeelde map', !readdirSync(o.pk).some((n) => n.startsWith('.pakket.')), readdirSync(o.pk).join(','));
    o = opzet('b'); const vreemd = join(o.b, 'vreemd'); mkdirSync(vreemd); chmodSync(vreemd, 0o700); rmSync(o.pk, { recursive: true }); symlinkSync(vreemd, o.pk);
    r = draai(o);
    check('uitrol-02 (ssh): map pakketten is een symlink → niets geschreven, rechten van het doel ongewijzigd', readdirSync(vreemd).length === 0 && (statSync(vreemd).mode & 0o777) === 0o700, r.fout.trim().split('\n').slice(-1)[0]);
    check('uitrol-02 (installeren): «install -d» van de map pakketten gebeurt niet door een symlink heen',
      /if \[ -L "\$PAKKETTEN_DIR" \]; then waarschuwing[^\n]*\n\s*else install -d -o root -g "\$GEBRUIKER" -m 0770 "\$PAKKETTEN_DIR"; fi/.test(functie('installeer', 'installeren')));
  }

  // ================================================================ server-uitrol-02 · proef-inbox (mijn-ruimte-migratie-proef.sh)
  {
    const fn = functie('proef', 'begrensd_overnemen');
    const b = join(basis, 'inbox'); mkdirSync(b);
    const neem = (bron: string, doel: string, max = 4096) => bash(`${fn}\nbegrensd_overnemen "$1" "$2" "$3"; echo "rc=$?"`, [bron, doel, String(max)], {}, 10_000);
    // g09-toets-3: alleen «rc=1» telt als weigering (127 = functie bestaat niet = geen bewijs).
    const geweigerd = (r: { uit: string; fout: string }) => r.uit.includes('rc=1') && !/command not found/.test(r.fout);
    const slachtoffer = join(b, 'passwd-kopie'); writeFileSync(slachtoffer, 'root:x:0:0\n'); chmodSync(slachtoffer, 0o644);
    symlinkSync(slachtoffer, join(b, 'proef-link.json'));
    let r = neem(join(b, 'proef-link.json'), join(b, 'uit-link.json'));
    check('uitrol-02 (proef): verzoek dat een symlink is → geweigerd, doel van de link NIET op 0600 gezet en niet gekopieerd',
      geweigerd(r) && (statSync(slachtoffer).mode & 0o777) === 0o644 && !existsSync(join(b, 'uit-link.json')), `${r.uit.trim()} ${(statSync(slachtoffer).mode & 0o777).toString(8)}`);
    spawnSync('mkfifo', [join(b, 'proef-fifo.json')]);
    const t0 = Date.now(); r = neem(join(b, 'proef-fifo.json'), join(b, 'uit-fifo.json'));
    check('uitrol-02 (proef): FIFO als verzoek → meteen geweigerd (blokkeert root niet)', geweigerd(r) && Date.now() - t0 < 5000 && r.signaal === null, `${r.uit.trim()} ${Date.now() - t0} ms`);
    writeFileSync(join(b, 'echt.json'), '{"id":"x"}'); linkSync(join(b, 'echt.json'), join(b, 'proef-hard.json'));
    r = neem(join(b, 'proef-hard.json'), join(b, 'uit-hard.json'));
    check('uitrol-02 (proef): harde link (twee namen) → geweigerd', geweigerd(r) && !existsSync(join(b, 'uit-hard.json')), r.uit.trim());
    writeFileSync(join(b, 'proef-groot.json'), 'x'.repeat(5000));
    r = neem(join(b, 'proef-groot.json'), join(b, 'uit-groot.json'), 4096);
    check('uitrol-02 (proef): groter dan de grens → geweigerd', geweigerd(r) && !existsSync(join(b, 'uit-groot.json')), r.uit.trim());
    writeFileSync(join(b, 'proef-goed.json'), '{"id":"abc","migraties":[]}');
    r = neem(join(b, 'proef-goed.json'), join(b, 'uit-goed.json'));
    check('uitrol-02 (proef): gewoon verzoek → kopie met dezelfde inhoud, 0600', r.uit.includes('rc=0') && existsSync(join(b, 'uit-goed.json'))
      && readFileSync(join(b, 'uit-goed.json'), 'utf8') === '{"id":"abc","migraties":[]}' && (statSync(join(b, 'uit-goed.json')).mode & 0o777) === 0o600, r.uit.trim() + r.fout.trim().slice(0, 100));
    symlinkSync(slachtoffer, join(b, 'uit-bestaat.json'));
    r = neem(join(b, 'proef-goed.json'), join(b, 'uit-bestaat.json'));
    check('uitrol-02 (proef): bestaand doel (ook een symlink) wordt nooit overschreven (O_EXCL|O_NOFOLLOW)', geweigerd(r) && readFileSync(slachtoffer, 'utf8') === 'root:x:0:0\n', r.uit.trim());
    // g09-toets-3: de echte inbox-lus (uit het script) met een «aanvaller» die het verzoek NA de controle door een symlink vervangt.
    // Vroeger: `[ -L ] … stat …` en daarna `cp --no-dereference` + `chmod 0600` op naam → chmod volgde de link (slachtoffer 0600).
    // Het haakje zit op `stat` (een bash-functie gaat vóór het programma): daar viel het venster tussen controle en gebruik.
    {
      const lus = stuk('proef', (x) => x.startsWith('for verzoek in "$INBOX"/proef-*.json; do'), (x) => x.trim() === 'mkdir -m 0750 "$W/mig"');
      const inbox = join(b, 'lus-inbox'), werkRoot = join(b, 'lus-werk'); mkdirSync(inbox); mkdirSync(werkRoot);
      const slacht2 = join(b, 'passwd-2'); writeFileSync(slacht2, 'root:x:0:0\n'); chmodSync(slacht2, 0o644);
      writeFileSync(join(inbox, 'proef-0123abcd-0000.json'), '{"id":"0123abcd-0000","migraties":[]}');
      const r2 = bash(`set -uo pipefail; shopt -s nullglob
zeg() { printf 'zeg: %s\\n' "$*" >&2; }
INBOX="$1"; WERK_ROOT="$2"; GEBRUIKER="$3"; MAX_VERZOEK=4096; SLACHTOFFER="$4"
stat() { command stat "$@"; ln -sfn "$SLACHTOFFER" "$INBOX/proef-0123abcd-0000.json"; }
${fn}
${lus}
echo "W=$W"; done`, [inbox, werkRoot, groep, slacht2], {}, 15_000);
      const wMap = /W=(\S+)/.exec(r2.uit)?.[1] || '';
      const kopie = wMap ? join(wMap, 'verzoek.json') : '';
      check('toets-3: inbox-lus met verwisseling na de controle → slachtoffer NIET op 0600, kopie is het oorspronkelijke verzoek (geen link)',
        !!lus && (statSync(slacht2).mode & 0o777) === 0o644 && !!kopie && existsSync(kopie) && !lstatSync(kopie).isSymbolicLink() && readFileSync(kopie, 'utf8').includes('0123abcd'),
        `slachtoffer=${(statSync(slacht2).mode & 0o777).toString(8)} ${r2.uit.trim()} ${r2.fout.trim().slice(0, 160)}`);
    }
    check('uitrol-02 (proef): de inbox-lus gebruikt begrensd_overnemen (geen «cp --no-dereference» + chmod op naam meer)',
      /if ! begrensd_overnemen "\$verzoek" "\$W\/verzoek\.json"/.test(tekst('proef')) && !/cp --no-dereference -- "\$verzoek"/.test(tekst('proef')));
  }

  // ================================================================ server-uitrol-04 · step-up op /vereisten/proef + audit
  {
    process.env.OWNER_EMAIL ||= 'eigenaar@example.invalid';
    const eigen = process.env.OWNER_EMAIL;
    // De routemodule trekt een groot deel van backend/ mee. Bundelen gebeurt hier (niet bij het bouwen van de test), zodat een tijdelijke
    // syntaxfout van een collega in een ander bestand alleen deze controle raakt — dan valt ze terug op de brontekst en zegt dat.
    let routes: Record<string, Array<(x: unknown) => Promise<{ statusCode: number; body: string }>>> | null = null; let bundelFout = '';
    try {
      const { build } = await import('esbuild');
      const rd = repoTmp(); opgeruimd.push(rd); const uit = join(rd, 'routes.mjs');
      const oudBron = OUD ? spawnSync('git', ['show', '11e0aad8b641b62412d2efcf1382d117339d251f:backend/uitrol-goedkeuring.ts'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout : '';
      await build({ ...(OUD ? { stdin: { contents: oudBron, resolveDir: join(W, 'backend'), sourcefile: 'backend/uitrol-goedkeuring.ts', loader: 'ts' as const } } : { entryPoints: [join(W, 'backend/uitrol-goedkeuring.ts')] }),
        outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'silent', absWorkingDir: W,
        // Letterlijke tekens 0x2028/0x2029 in een regex-literal (komt voor in bestanden van anderen) zijn voor esbuild een regeleinde;
        // als escape-reeks betekenen ze hetzelfde. Alleen in deze testbundel; de bestanden zelf blijven ongewijzigd.
        plugins: [{ name: 'ls-ps', setup(bd) { bd.onLoad({ filter: /\.tsx?$/ }, (a) => ({ contents: readFileSync(a.path, 'utf8').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029'), loader: a.path.endsWith('x') ? 'tsx' : 'ts' })); } }] });
      const m = await import(pathToFileURL(uit).href);
      let stapOp = false;
      routes = m.uitrolGoedkeuringRoutes({ requireSession: async () => ({ user: { id: 'g09-eigenaar', role: 'owner', status: 'approved', email: eigen }, service: 'admin' }),
        stepUp: async () => (stapOp ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) }) });
      const roep = async (route: string, b: Record<string, unknown>) => { const res = await routes![route][0]({ event: { headers: {} }, body: b }); let d: any = null; try { d = JSON.parse(res.body); } catch { d = null; } return { status: res.statusCode, fout: String(d?.error || '') }; };
      const zonder = await roep('POST /api/owner/uitrol/vereisten/proef', { id: 'onbekend', migraties: [{ naam: '9999_x', sql: 'SELECT 1' }] });
      check('uitrol-04: /vereisten/proef zonder recente herbevestiging → STEP_UP_REQUIRED (403), niets naar root', zonder.status === 403 && zonder.fout === 'STEP_UP_REQUIRED', JSON.stringify(zonder));
      stapOp = true;
      const met = await roep('POST /api/owner/uitrol/vereisten/proef', { id: 'onbekend', migraties: [] });
      check('uitrol-04: met herbevestiging gaat het verzoek door naar de gewone controle (geen STEP_UP meer)', met.fout !== 'STEP_UP_REQUIRED', JSON.stringify(met));
      stapOp = false;
      const stand = await roep('POST /api/owner/uitrol/vereisten/stand', { id: 'onbekend' });
      check('uitrol-04: alleen-lezen stand (/vereisten/stand) vraagt geen herbevestiging (geen extra vensters bij het pollen)', stand.fout !== 'STEP_UP_REQUIRED', JSON.stringify(stand));
    } catch (e) { bundelFout = String((e as Error).message || e).split('\n').slice(0, 3).join(' '); }
    if (!routes) {
      const bron = OUD ? spawnSync('git', ['show', '11e0aad8b641b62412d2efcf1382d117339d251f:backend/uitrol-goedkeuring.ts'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout : readFileSync(join(W, 'backend/uitrol-goedkeuring.ts'), 'utf8');
      check(`uitrol-04: /vereisten/proef vraagt step-up (STATISCH: routemodule niet te bundelen — ${bundelFout.slice(0, 160)})`, /'POST \/api\/owner\/uitrol\/vereisten\/proef': \[eigenaar\(\{ stepUp: true \}/.test(bron));
    }
    try {
      const v: any = OUD ? await laadOud('uitrol-vereisten.mjs') : await import('../../backend/uitrol-vereisten');
      const sql = "CREATE TABLE app.g09 (x int); -- geheime opmerking VERZONNEN-7c1";
      const vg = v.proefSqlVingerafdrukken?.([{ naam: '9999_g09', sql }]);
      check('uitrol-04: audit-vingerafdruk per migratie = naam, grootte en SHA-256 — nooit de SQL zelf',
        Array.isArray(vg) && vg[0]?.sha256 === createHash('sha256').update(sql).digest('hex') && vg[0]?.bytes === Buffer.byteLength(sql) && !JSON.stringify(vg).includes('VERZONNEN-7c1'), JSON.stringify(vg));
      const pa = String(v.proefAanvragen || '');
      check('uitrol-04: proefAanvragen schrijft de audit vóór het verzoek naar root (proef-<id>.json)', pa.indexOf('uitrol_migratieproef_aangevraagd') > 0 && pa.indexOf('uitrol_migratieproef_aangevraagd') < pa.indexOf('proefInbox()'));
    } catch (e) { check('uitrol-04: uitrol-vereisten laadbaar', false, String((e as Error).message).slice(0, 200)); }
  }

  // ================================================================ server-uitrol-04 · eenmalige rol (server/migratie-proef.ts)
  {
    let mp: any = null;
    try { mp = OUD ? await laadOud('migratie-proef.mjs') : await import('../../server/migratie-proef'); } catch (e) { console.log(String(e)); }
    const R = 'mijnruimte_proef_20991231000000_42';
    const gooit = (f: () => unknown, code: string) => { try { f(); return false; } catch (e) { return String((e as Error).message).startsWith(code); } };
    check('uitrol-04: zonder PROEF_DATABASE_URL weigert de proef (ook als DATABASE_URL_MIGRATIE er is)',
      typeof mp?.proefVerbinding === 'function' && gooit(() => mp.proefVerbinding({ DATABASE_URL_MIGRATIE: 'postgresql://mijnruimte_migrator:VERZONNEN@127.0.0.1:5432/mijnruimte' }, R), 'PROEF_ROL_NIET_EENMALIG'));
    check('uitrol-04: proef-URL met de migratierol of een andere database → geweigerd',
      typeof mp?.proefVerbinding === 'function' && gooit(() => mp.proefVerbinding({ PROEF_DATABASE_URL: `postgresql://mijnruimte_migrator:x@127.0.0.1/${R}` }, R), 'PROEF_ROL_NIET_EENMALIG')
      && gooit(() => mp.proefVerbinding({ PROEF_DATABASE_URL: `postgresql://${R}:x@127.0.0.1/mijnruimte` }, R), 'PROEF_DB_NIET_OMGEBOGEN'));
    check('uitrol-04: proef-URL van de eenmalige rol op de eigen wegwerpdatabase → aanvaard',
      typeof mp?.proefVerbinding === 'function' && new URL(mp.proefVerbinding({ PROEF_DATABASE_URL: `postgresql://${R}:x@127.0.0.1:5432/${R}` }, R)).username === R);
    const goed = { rol: R, db: R, superuser: false, createrole: false, createdb: false, bypassrls: false, replicatie: false, lidVan: 0 };
    check('uitrol-04: eenmaligeRolReden: alleen een kale rol met de naam van de wegwerpdatabase is goed',
      typeof mp?.eenmaligeRolReden === 'function' && mp.eenmaligeRolReden(goed) === null && !!mp.eenmaligeRolReden({ ...goed, rol: 'mijnruimte_migrator' })
      && !!mp.eenmaligeRolReden({ ...goed, superuser: true }) && !!mp.eenmaligeRolReden({ ...goed, lidVan: 1 }) && !!mp.eenmaligeRolReden({ ...goed, db: 'mijnruimte' }) && !!mp.eenmaligeRolReden({ ...goed, createrole: true }));

    // ---- live (lokale PostgreSQL): de gedeelde rol wordt geweigerd; de keten van het root-script werkt met een echte eenmalige rol
    const url = process.env.DATABASE_URL;
    if (!url || !mp?.proefUitvoeren) {
      check('uitrol-04 (live): DATABASE_URL en proefUitvoeren beschikbaar', false, 'geen DATABASE_URL — live-deel overgeslagen');
    } else {
      const u = new URL(url); const stempel = randomBytes(4).toString('hex');
      const adminUrl = (db: string) => { const x = new URL(url); x.pathname = `/${db}`; return x.toString(); };
      const admin = new pg.Client({ connectionString: adminUrl('postgres') }); await admin.connect();
      const id = (n: string) => `"${n.replace(/"/g, '')}"`;
      const gedeeld = `g09_gedeeld_${stempel}`, dbA = `mijnruimte_proef_g09a_${stempel}`, R2 = `mijnruimte_proef_g09b_${stempel}`;
      const pw = randomBytes(12).toString('hex'); // verzonnen, alleen voor deze test
      const kaart = (naam: string, sql: string) => { const m = mkdtempSync(join(basis, 'mig-')); writeFileSync(join(m, `${naam}.sql`), sql); return m; };
      try {
        // (a) gedeelde rol (zoals mijnruimte_migrator): SQL zou de rol clusterbreed omzetten — nu draait er niets
        await admin.query(`CREATE ROLE ${id(gedeeld)} LOGIN NOSUPERUSER PASSWORD '${pw}'`);
        await admin.query(`CREATE DATABASE ${id(dbA)} OWNER ${id(gedeeld)}`);
        const gu = new URL(adminUrl(dbA)); gu.username = gedeeld; gu.password = pw;
        let uitA: any = null, foutA = '';
        try { uitA = await mp.proefUitvoeren({ url: gu.toString(), map: kaart('9001_g09_rol', 'ALTER ROLE CURRENT_USER SET default_transaction_read_only = on; CREATE TABLE g09_merk (x int);'), tijdslimietMs: 20_000 }); }
        catch (e) { foutA = String((e as Error).message); }
        const instelling = (await admin.query('SELECT count(*)::int AS n FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole WHERE r.rolname = $1', [gedeeld])).rows[0].n;
        check('uitrol-04 (live): proef met een gedeelde rol → geweigerd vóór de SQL; «ALTER ROLE … SET» bereikte de rol NIET',
          foutA.startsWith('PROEF_ROL_NIET_EENMALIG') && instelling === 0, `fout=${foutA.slice(0, 120)} uitslag=${JSON.stringify(uitA)?.slice(0, 120)} rolinstellingen=${instelling}`);

        // (b) de keten van het root-script: proef_rol_env → CREATE ROLE met SCRAM-verifier → database → schema --no-owner onder die rol
        const fnEnv = functie('proef', 'proef_rol_env');
        const mEnv = join(basis, 'migratie.env'); writeFileSync(mEnv, `DATABASE_URL_MIGRATIE=postgresql://mijnruimte_migrator:VERZONNEN-migratiewachtwoord@${u.hostname}:${u.port || 5432}/mijnruimte\n`, { mode: 0o600 });
        const envBestand = join(basis, 'proef.env');
        const rEnv = bash(`MIGRATIE_ENV="$3"; GEHEIMEN=/bestaat/niet\n${fnEnv}\nproef_rol_env "$1" "$2"`, [envBestand, R2, mEnv]);
        const verifier = rEnv.uit.trim();
        const scram = /^SCRAM-SHA-256\$4096:([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/.exec(verifier);
        const envTekst = existsSync(envBestand) ? readFileSync(envBestand, 'utf8') : '';
        const proefUrl = /^PROEF_DATABASE_URL='([^']+)'$/m.exec(envTekst)?.[1] || '';
        let klopt = false;
        if (scram && proefUrl) {
          const ww = decodeURIComponent(new URL(proefUrl).password);
          const gez = pbkdf2Sync(ww, Buffer.from(scram[1], 'base64'), 4096, 32, 'sha256');
          klopt = createHash('sha256').update(createHmac('sha256', gez).update('Client Key').digest()).digest('base64') === scram[2]
            && createHmac('sha256', gez).update('Server Key').digest('base64') === scram[3];
        }
        check('uitrol-04 (live): proef_rol_env → URL van de eenmalige rol (rol = database), 0600, zonder het migratiewachtwoord; alleen een geldige SCRAM-verifier op stdout',
          !!scram && klopt && !!proefUrl && new URL(proefUrl).username === R2 && new URL(proefUrl).pathname === `/${R2}` && !envTekst.includes('VERZONNEN-migratiewachtwoord')
          && (statSync(envBestand).mode & 0o777) === 0o600 && !rEnv.uit.includes(new URL(proefUrl || 'x://a').password || '§'), `${rEnv.status} ${rEnv.fout.slice(0, 120)}`);
        if (scram && proefUrl) {
          const tot = new Date(Date.now() + 20 * 60_000).toISOString().replace('T', ' ').slice(0, 19) + '+00';
          await admin.query(`CREATE ROLE ${id(R2)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 1 PASSWORD '${verifier}' VALID UNTIL '${tot}'`);
          await admin.query(`CREATE DATABASE ${id(R2)} OWNER ${id(R2)}`);
          await admin.query(`ALTER ROLE ${id(R2)} IN DATABASE ${id(R2)} SET temp_file_limit = '64MB'`);
          await admin.query(`REVOKE ALL ON DATABASE ${id(R2)} FROM PUBLIC`);
          // Schema van «productie» (hier: de eigen testdatabase) zonder eigenaars, teruggezet onder de eenmalige rol — zoals het root-script.
          const herstel = bash('{ pg_dump --schema-only --no-owner "$1" && pg_dump --data-only --table=app.schema_migrations "$1"; } 2>/dev/null | PGOPTIONS="-c role=$3" psql -X -q -d "$2" >/dev/null 2>"$4"; echo "rc=$?"',
            [url, adminUrl(R2), R2, join(basis, 'restore.err')], {}, 180_000);
          const doelUrl = mp.proefVerbinding({ PROEF_DATABASE_URL: proefUrl }, R2);
          const b1 = await mp.proefUitvoeren({ url: doelUrl, map: kaart('9001_g09_eigenaar', 'ALTER TABLE app.records ADD COLUMN g09_proef int;'), tijdslimietMs: 20_000 });
          const fouten = readFileSync(join(basis, 'restore.err'), 'utf8').split('\n').filter((x) => x.includes('ERROR') && !x.includes('default privileges'));
          check('uitrol-04 (live): echte migratie (ALTER TABLE app.records) slaagt met de eenmalige rol op het teruggezette schema (rol is eigenaar)',
            b1.ok === true && b1.migraties[0]?.ok === true, `${herstel.uit.trim()} uitslag=${JSON.stringify(b1.migraties).slice(0, 200)} restore-fouten=${fouten.slice(0, 3).join(' | ').slice(0, 300)}`);
          const b2 = await mp.proefUitvoeren({ url: doelUrl, map: kaart('9002_g09_temp', "SET temp_file_limit = -1; SELECT 1;"), tijdslimietMs: 20_000 });
          check('uitrol-04 (live): de eenmalige rol kan de schijfgrens (temp_file_limit, door postgres gezet) niet ophogen', b2.ok === false && b2.migraties[0]?.fout?.code === '42501', JSON.stringify(b2.migraties[0]?.fout || {}).slice(0, 160));
          const wie = (await admin.query('SELECT rolsuper, rolcreaterole, rolcreatedb, rolconnlimit, rolvaliduntil IS NOT NULL AS geldig FROM pg_roles WHERE rolname = $1', [R2])).rows[0];
          check('uitrol-04 (live): eenmalige rol zonder bijzondere rechten, één verbinding, wachtwoord met vervaldatum', !wie.rolsuper && !wie.rolcreaterole && !wie.rolcreatedb && wie.rolconnlimit === 1 && wie.geldig, JSON.stringify(wie));
        }
      } finally {
        for (const d of [dbA, R2]) await admin.query(`DROP DATABASE IF EXISTS ${id(d)} WITH (FORCE)`).catch(() => undefined);
        for (const r of [gedeeld, R2]) await admin.query(`DROP ROLE IF EXISTS ${id(r)}`).catch(() => undefined);
        await admin.end().catch(() => undefined);
      }
    }
    // Statisch: het root-script geeft de unit alleen proef.env (geen geheimen.env/migratie.env), ruimt de rol op en bewaakt de schijf.
    const p = functie('proef', 'proef');
    check('uitrol-04: root-script: de proef-unit krijgt alleen de eenmalige URL (geen EnvironmentFile=$GEHEIMEN/$MIGRATIE_ENV)',
      p.includes('-p EnvironmentFile="$werk/proef.env"') && !/systemd-run[^\n]*\n[^\n]*EnvironmentFile="\$GEHEIMEN"/.test(p));
    check('uitrol-04: root-script: eenmalige rol en database worden na de proef verwijderd; achtergebleven rollen eerst opgeruimd; schijfbewaker actief',
      p.includes('proef_rol_weg "$db"') && /SELECT rolname FROM pg_roles WHERE rolname LIKE 'mijnruimte\\\\_proef\\\\_%'/.test(p) && p.includes('pg_terminate_backend') && p.includes('PROEF_SCHIJFGRENS'));
  }

  // ================================================================ server-uitrol-05 · migrations/ opnieuw uit de bron (deploy_herstellen)
  {
    const fn = `${regel('installeer', 'git_bron() {')}\n${functie('installeer', 'deploy_herstellen')}`;
    const b = join(basis, 'u05'); const bron = join(b, 'bron'), doel = join(b, 'release');
    for (const d of [join(bron, 'deploy'), join(bron, 'migrations'), join(doel, 'deploy'), join(doel, 'migrations')]) mkdirSync(d, { recursive: true });
    const RECHTEN = 'GRANT USAGE ON SCHEMA app TO mijnruimte_app;\n';
    writeFileSync(join(bron, 'deploy/x.sh'), '#!/bin/bash\necho bron\n'); writeFileSync(join(bron, 'migrations/rechten.sql'), RECHTEN); writeFileSync(join(bron, 'migrations/0001_a.sql'), 'SELECT 1;\n');
    const g = (...a: string[]) => spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', `safe.directory=${bron}`, '-C', bron, ...a], { encoding: 'utf8' });
    g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'bron');
    const vervuil = () => {
      rmSync(join(doel, 'migrations'), { recursive: true, force: true }); mkdirSync(join(doel, 'migrations'));
      writeFileSync(join(doel, 'deploy/x.sh'), '#!/bin/bash\necho KWAAD\n');
      writeFileSync(join(doel, 'migrations/rechten.sql'), `${RECHTEN}\\! id > /tmp/g09-kwaad\nCOPY (SELECT 1) TO PROGRAM 'id';\n`);
      writeFileSync(join(doel, 'migrations/0999_kwaad.sql'), 'ALTER ROLE mijnruimte_app SUPERUSER;\n');
      symlinkSync('/etc/passwd', join(doel, 'migrations/0998_link.sql'));
    };
    vervuil();
    const r = bash(`set -euo pipefail\nfout() { echo "FOUT: $*" >&2; exit 1; }\nGEBRUIKER="$3"\n${fn}\ndeploy_herstellen "$1" "$2"; echo klaar`, [bron, doel, groep]);
    const lijst = existsSync(join(doel, 'migrations')) ? readdirSync(join(doel, 'migrations')).sort().join(',') : '';
    check('uitrol-05: door de build gewijzigde migrations/rechten.sql wordt na het bouwen uit de ongewijzigde bron hersteld (git)',
      r.uit.includes('klaar') && existsSync(join(doel, 'migrations/rechten.sql')) && readFileSync(join(doel, 'migrations/rechten.sql'), 'utf8') === RECHTEN, `${r.fout.trim().slice(0, 200)} | ${existsSync(join(doel, 'migrations/rechten.sql')) ? JSON.stringify(readFileSync(join(doel, 'migrations/rechten.sql'), 'utf8').slice(0, 80)) : '-'}`);
    check('uitrol-05: toegevoegde migratie en symlink uit de build zijn weg; alleen de bronbestanden staan er', lijst === '0001_a.sql,rechten.sql', lijst);
    check('uitrol-05: migrations/ daarna root-eigendom, niet schrijfbaar voor de groep (g=rX)', existsSync(join(doel, 'migrations')) && (statSync(join(doel, 'migrations/rechten.sql')).mode & 0o777) === 0o640 && statSync(join(doel, 'migrations/rechten.sql')).uid === 0,
      existsSync(join(doel, 'migrations/rechten.sql')) ? (statSync(join(doel, 'migrations/rechten.sql')).mode & 0o777).toString(8) : '-');
    check('uitrol-05: deploy/ blijft zoals vroeger hersteld (script uit de bron, 0750)', readFileSync(join(doel, 'deploy/x.sh'), 'utf8').includes('echo bron') && (statSync(join(doel, 'deploy/x.sh')).mode & 0o777) === 0o750);
    check('uitrol-05: in de volgorde van installeren komt deploy_herstellen ná bouwen en vóór migreren/hulpscripts',
      /bouwen "\$doel"\n\s*deploy_herstellen "\$bron" "\$doel"\n\s*migreren "\$doel"/.test(functie('installeer', 'installeren')));
  }

  // ================================================================ keten-config-06 · afgeschermde build als eigen gebruiker
  {
    const vars = ['BOUW_GEBRUIKER=', 'BOUW_CACHE=', 'BOUW_THUIS=', 'BOUW_AFSCHERMING_UIT=', 'BOUW_OPDRACHT='].map((p) => regel('installeer', p)).join('\n');
    const r = bash(`APP_ROOT=/srv/mijn-ruimte; GEBRUIKER=mijnruimte\n${vars}\n${functie('installeer', 'bouw_afscherming')}\nbouw_afscherming /srv/mijn-ruimte/releases/20991231-235959; printf 'OPDRACHT=%s\\n' "\${BOUW_OPDRACHT:-}"`);
    const props = r.uit.split('\n').filter((x) => x && !x.startsWith('OPDRACHT='));
    const opdracht = r.uit.split('\n').find((x) => x.startsWith('OPDRACHT=')) || '';
    const heeft = (x: string) => props.includes(x);
    check('keten-06: build draait als eigen gebruiker mijnruimte-bouw, niet als de dienstgebruiker, zonder groep mijnruimte',
      heeft('User=mijnruimte-bouw') && heeft('Group=mijnruimte-bouw') && !props.some((x) => /^(User|Group)=mijnruimte$/.test(x)) && !props.some((x) => x.startsWith('SupplementaryGroups=')), props.slice(0, 4).join(' '));
    check('keten-06: afscherming: ProtectSystem=strict, ProtectHome, PrivateDevices, ProtectProc=invisible, NoNewPrivileges',
      ['ProtectSystem=strict', 'ProtectHome=yes', 'PrivateDevices=yes', 'ProtectProc=invisible', 'NoNewPrivileges=yes', 'PrivateTmp=yes'].every(heeft));
    check('keten-06: van /srv/mijn-ruimte ziet de build alleen de eigen releasemap (lege alleen-lezen tmpfs + bind)',
      heeft('TemporaryFileSystem=/srv/mijn-ruimte:ro') && heeft('BindPaths=/srv/mijn-ruimte/releases/20991231-235959'));
    check('keten-06: gegevens, geheimen en status zijn voor de build onzichtbaar (InaccessiblePaths)',
      ['/srv/data', '/etc/mijn-ruimte', '/var/lib/mijn-ruimte', '/var/lib/mijn-ruimte-uitrol-status', '/srv/backups'].every((p) => heeft(`InaccessiblePaths=-${p}`)));
    check('keten-06: npm ci --ignore-scripts; alleen esbuild krijgt zijn installatiescript (npm rebuild esbuild)',
      /npm ci --ignore-scripts/.test(opdracht) && /npm rebuild esbuild/.test(opdracht) && !/npm ci --no-audit/.test(opdracht), opdracht.slice(0, 160));
    const lock = JSON.parse(readFileSync(join(W, 'package-lock.json'), 'utf8')) as { packages: Record<string, { hasInstallScript?: boolean }> };
    const metScript = Object.entries(lock.packages).filter(([, v]) => v.hasInstallScript).map(([k]) => k.replace(/^node_modules\//, '')).sort();
    check('keten-06: lockfile: pakketten met installatiescript ⊆ {esbuild, fsevents (macOS), tesseract.js (alleen een melding)} — anders moet de build herzien',
      metScript.every((n) => ['esbuild', 'fsevents', 'tesseract.js'].includes(n)), metScript.join(','));
    const sa = spawnSync('bash', ['-c', 'command -v systemd-analyze'], { encoding: 'utf8' });
    if (sa.status === 0 && props.length) {
      const unit = join(basis, 'g09-bouw-test.service');
      writeFileSync(unit, `[Service]\nExecStart=/bin/true\n${props.join('\n')}\n`);
      const v = spawnSync('systemd-analyze', ['verify', '--man=no', unit], { encoding: 'utf8' });
      const klachten = `${v.stdout}\n${v.stderr}`.split('\n').filter((x) => x.includes('g09-bouw-test.service') && /Unknown|Failed|ignoring|Invalid/i.test(x));
      check('keten-06: systemd-analyze verify kent alle eigenschappen van de bouw-unit (systemd 255)', klachten.length === 0, klachten.join(' | ').slice(0, 300));
    }
    const bouw = functie('installeer', 'bouwen');
    check('keten-06: noodrem (bouw-afscherming.uit) staat los van de standaardweg en waarschuwt met «!»', bouw.includes('[ -e "$BOUW_AFSCHERMING_UIT" ]') && bouw.includes('waarschuwing "! bouwen ZONDER afscherming'));
  }

  // ================================================================ server-uitrol-08 · signaal na het overschakelen
  {
    const segment = stuk('installeer', (x) => x === 'HUIDIG_ONDERDEEL=""', (x) => /^trap .* TERM INT HUP$/.test(x));
    const b = join(basis, 'u08'); mkdirSync(join(b, 'vorige'), { recursive: true }); mkdirSync(join(b, 'nieuw'), { recursive: true });
    const draai = (van: string, naar: string, omzettenFaalt = false) => {
      const log = join(b, `log-${randomBytes(3).toString('hex')}`); writeFileSync(log, '');
      const r = bash(`LOG="$1"; DIENST=mijn-ruimte
omzetten() { printf 'omzetten %s\\n' "$1" >> "$LOG"; ${omzettenFaalt ? 'return 1;' : ''} }
systemctl() { printf 'systemctl %s\\n' "$*" >> "$LOG"; }
${segment}
HUIDIG_ONDERDEEL=nabewaken; OVERGESCHAKELD_VAN="$2"; OVERGESCHAKELD_NAAR="$3"
kill -TERM $$
sleep 2; echo NIET-GESTOPT`, [log, van, naar], {}, 15_000);
      return { ...r, log: readFileSync(log, 'utf8') };
    };
    let r = draai(join(b, 'vorige'), join(b, 'nieuw'));
    check('uitrol-08: SIGTERM ná het overschakelen (nog niet bevestigd) → vorige release teruggezet en dienst herstart',
      r.status === 143 && r.log.includes(`omzetten ${join(b, 'vorige')}`) && r.log.includes('systemctl restart mijn-ruimte'), `status=${r.status} log=${JSON.stringify(r.log)}`);
    check('uitrol-08: … en het logboek zegt de waarheid (teruggezet), niet «de vorige release blijft actief» zonder meer', /teruggezet/.test(r.fout) && !/de vorige release blijft actief/.test(r.fout), r.fout.trim().slice(0, 200));
    r = draai(join(b, 'vorige'), join(b, 'nieuw'), true);
    check('uitrol-08: terugzetten mislukt → logboek zegt eerlijk dat de nieuwe release mogelijk NIET gecontroleerd actief is', r.status === 143 && /MISLUKTE/.test(r.fout) && /NIET gecontroleerd/.test(r.fout), r.fout.trim().slice(0, 200));
    r = draai(join(b, 'vorige'), '');
    check('uitrol-08: signaal vóór het overschakelen → niets omgezet, «vorige release blijft actief»', r.status === 143 && r.log === '' && /vorige release blijft actief/.test(r.fout), `${r.status} ${JSON.stringify(r.log)} ${r.fout.trim().slice(0, 120)}`);
    const act = functie('installeer', 'activeren');
    const iZet = act.indexOf('OVERGESCHAKELD_VAN="$vorige"; OVERGESCHAKELD_NAAR="$doel"'), iOm = act.indexOf('omzetten "$doel"');
    const iBev = act.indexOf('OVERGESCHAKELD_NAAR=""; OVERGESCHAKELD_BEVESTIGD="$doel"   # bevestigd'), iActief = act.indexOf('melding "actief: $doel"');
    check('uitrol-08: activeren zet de markering vóór het omzetten en wist ze pas na de bevestiging (vlak vóór «actief»)', iZet > 0 && iZet < iOm && iBev > iOm && iBev < iActief, `${iZet}/${iOm}/${iBev}/${iActief}`);

    // mijn-ruimte-uitrol.sh: op het installatiescript wachten; daarna weten wat écht actief is
    const seg2 = stuk('uitrol', (x) => x.startsWith('AFGEROND=0; ONDERBROKEN=0'), (x) => /^trap .* TERM INT HUP$/.test(x));
    const log2 = join(b, 'kind.log'); writeFileSync(log2, '');
    const r2 = bash(`set -uo pipefail
${seg2}
( trap 'sleep 1; echo teruggezet >> "$1"; exit 143' TERM; while :; do sleep 0.1; done ) >/dev/null 2>&1 &
INSTALL_PID=$!
sleep 0.3; kill -TERM $$; sleep 5; echo NIET-GESTOPT`, [log2], {}, 40_000);
    check('uitrol-08: uitrol-script wacht na het doorgeven van het signaal op het installatiescript (dat zelf terugzet) vóór de eindstatus',
      r2.status === 143 && readFileSync(log2, 'utf8').includes('teruggezet'), `status=${r2.status} kind=${JSON.stringify(readFileSync(log2, 'utf8'))}`);
    const fns = `${regel('uitrol', 'ACTIEF_LINK=')}\n${functie('uitrol', 'nieuwe_release_actief')}\n${functie('uitrol', 'log_pct')}`;
    const rel = join(b, 'release-x'); mkdirSync(rel); writeFileSync(join(rel, 'UITROL-VERSIE'), '20991231-235959\n'); symlinkSync(rel, join(b, 'current'));
    const werk = join(b, 'werk'); mkdirSync(werk);
    writeFileSync(join(werk, 'installeer.log'), '[installeer] stap: bouwen (70%) npm run build\nruis 99%\n[installeer] stap: activeren (90%) overschakelen\n');
    const r3 = bash(`${fns}\nVERSIE=20991231-235959; nieuwe_release_actief && echo NIEUW-ACTIEF; VERSIE=20991231-000000; nieuwe_release_actief || echo VORIGE-ACTIEF; WERK="$2"; echo "pct=$(log_pct)"`,
      [], { UITROL_ACTIEF_LINK: join(b, 'current') });
    const r3b = bash(`${fns}\nWERK="$1"; VERSIE=x; echo "pct=$(log_pct)"`, [werk]);
    check('uitrol-08: uitrol-script leest de werkelijk actieve versie (current/UITROL-VERSIE) en het percentage uit het logboek',
      r3.uit.includes('NIEUW-ACTIEF') && r3.uit.includes('VORIGE-ACTIEF') && r3b.uit.includes('pct=90'), `${r3.uit.trim()} | ${r3b.uit.trim()} ${r3.fout.trim().slice(0, 100)}`);
    const afs = functie('uitrol', 'afsluiten');
    check('uitrol-08: eindstatus na onderbreking noemt een actieve nieuwe release eerlijk (met «!»), ook bij GESTOPT en INSTALLATIE_MISLUKT',
      /ONDERBROKEN" -eq 1 \] && nieuwe_release_actief/.test(afs) && (tekst('uitrol').match(/if nieuwe_release_actief; then/g) || []).length >= 2 && tekst('uitrol').includes('pct="$(log_pct)"'));
  }

  // ================================================================ na toetsing: g09-toets-1 (RELEASE-COMMIT e.d. via symlink na het bouwen)
  {
    const b = join(basis, 't1'); const doel = join(b, 'release'); mkdirSync(doel, { recursive: true });
    const geheim = join(b, 'root-geheim.env'); writeFileSync(geheim, 'GITOPS_DEPLOY_KEY_VAN_ROOT=VERZONNEN-nepgeheim-0123\n'); chmodSync(geheim, 0o600);
    const hexGeheim = join(b, 'machine-id'); writeFileSync(hexGeheim, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n'); chmodSync(hexGeheim, 0o600);
    const klaarRegel = (functie('installeer', 'installeren').split('\n').find((x) => x.includes('melding "klaar: release $datum')) || '').trim();
    const lijstRegel = (tekst('installeer').split('\n').find((x) => x.includes('echo "$(basename "$r")  commit')) || '').trim();
    const draai = () => bash(`set -uo pipefail\nmelding() { echo "[installeer] $*"; }\n${functie('installeer', 'commit_van')}\ndoel="$1"; r="$1"; datum=20991231-000000; label=""\n${klaarRegel}\n${lijstRegel}`, [doel], {}, 8000);
    symlinkSync(geheim, join(doel, 'RELEASE-COMMIT'));
    let r = draai();
    check('toets-1: RELEASE-COMMIT als symlink naar een root-bestand → inhoud komt NIET in het logboek («klaar» en «lijst»)', !r.uit.includes('VERZONNEN-nepgeheim') && r.signaal === null && !!klaarRegel && !!lijstRegel, r.uit.trim().slice(0, 200));
    rmSync(join(doel, 'RELEASE-COMMIT')); symlinkSync(hexGeheim, join(doel, 'RELEASE-COMMIT'));
    r = draai();
    check('toets-1: ook een hex-geheim achter een symlink wordt niet gevolgd', !r.uit.includes('deadbeef'), r.uit.trim().slice(0, 200));
    rmSync(join(doel, 'RELEASE-COMMIT')); spawnSync('mkfifo', [join(doel, 'RELEASE-COMMIT')]);
    const t0 = Date.now(); r = draai();
    check('toets-1: RELEASE-COMMIT als FIFO → root blijft niet hangen', r.signaal === null && Date.now() - t0 < 5000, `${r.signaal} ${Date.now() - t0} ms`);
    rmSync(join(doel, 'RELEASE-COMMIT')); writeFileSync(join(doel, 'RELEASE-COMMIT'), `${'a1b2c3d'.padEnd(40, '0')}\n`);
    r = draai();
    check('toets-1: gewone RELEASE-COMMIT → commit staat in «klaar» en «lijst»', (r.uit.match(/a1b2c3d0{33}/g) || []).length === 2, r.uit.trim().slice(0, 200));
    // Na het bouwen: niets anders dan gewone bestanden en mappen in de wortel van de release (AUTEUR, AGENT, … leest root later ook).
    const wortel = (n: string) => { const d = join(b, `w-${n}`); mkdirSync(join(d, 'dist'), { recursive: true }); writeFileSync(join(d, 'AUTEUR'), 'Iemand\n'); return d; };
    const controle = (d: string) => bash(`fout() { echo "FOUT: $*" >&2; exit 1; }\n${functie('installeer', 'release_wortel_controleren')}\nrelease_wortel_controleren "$1"; echo "rc=$?"`, [d]);
    const w1 = wortel('goed'); const w2 = wortel('link'); rmSync(join(w2, 'AUTEUR')); symlinkSync(geheim, join(w2, 'AUTEUR'));
    const w3 = wortel('fifo'); spawnSync('mkfifo', [join(w3, 'AGENT')]);
    const w4 = wortel('maplink'); symlinkSync('/etc', join(w4, 'deploy'));
    const c1 = controle(w1), c2 = controle(w2), c3 = controle(w3), c4 = controle(w4);
    check('toets-1: release_wortel_controleren: gewone release in orde; symlink (bestand of map) of FIFO in de wortel → installatie stopt vóór activeren',
      c1.uit.includes('rc=0') && !c2.uit.includes('rc=0') && /FOUT/.test(c2.fout) && !c3.uit.includes('rc=0') && !c4.uit.includes('rc=0'), `${c1.uit.trim()}|${c2.fout.trim().slice(0, 80)}|${c3.fout.trim().slice(0, 60)}|${c4.fout.trim().slice(0, 60)}`);
    check('toets-1: bouwen roept release_wortel_controleren aan na chown/chmod', /chmod -R u=rwX,g=rX,o= "\$doel"\n[^\n]*\n?\s*release_wortel_controleren "\$doel"/.test(functie('installeer', 'bouwen')));
  }

  // ================================================================ na toetsing: g09-toets-2 (rook-controle.json uit een app-schrijfbare map)
  {
    const b = join(basis, 't2'); const werk = join(b, 'werk'); mkdirSync(werk, { recursive: true });
    const geheim = join(b, 'shadow'); writeFileSync(geheim, 'root:$6$VERZONNEN-hash:20000::::::\n'); chmodSync(geheim, 0o600);
    // Het blok tussen «# rook-uitslag: begin/eind» in rook_controleren, met daarna dezelfde voorwaarde als het script (`[ -s "$uit" ]`).
    // Vóór de patch is het blok leeg: dan werkte root rechtstreeks met `$werk/rook-controle.json` (symlink/FIFO).
    const rookFn = functie('installeer', 'rook_controleren');
    const blok = stuk('installeer', (x) => x.trim() === '# rook-uitslag: begin', (x) => x.trim() === '# rook-uitslag: eind');
    const lees = (bron: string) => bash(`uit="$1"\n${blok}\nif [ -s "$uit" ]; then echo "rc=0 kopie=$uit"; else echo "rc=1"; fi`, [bron], {}, 8000);
    const kopieVan = (r: { uit: string }) => /kopie=(\S+)/.exec(r.uit)?.[1] || '';
    symlinkSync(geheim, join(werk, 'link.json'));
    let r = lees(join(werk, 'link.json'));
    check('toets-2: rook-controle.json als symlink → root gebruikt/kopieert het doel NIET', r.uit.includes('rc=1') && !r.fout.includes('VERZONNEN-hash'), `${r.uit.trim()} ${r.fout.trim().slice(0, 80)}`);
    spawnSync('mkfifo', [join(werk, 'fifo.json')]);
    const t0 = Date.now(); r = lees(join(werk, 'fifo.json'));
    check('toets-2: rook-controle.json als FIFO → meteen geweigerd', r.uit.includes('rc=1') && r.signaal === null && Date.now() - t0 < 5000, `${r.uit.trim()} ${Date.now() - t0} ms`);
    writeFileSync(join(werk, 'groot.json'), 'x'.repeat(5 * 1024 * 1024));
    r = lees(join(werk, 'groot.json'));
    check('toets-2: te grote uitslag (> 4 MB) → geweigerd', r.uit.includes('rc=1'), r.uit.trim());
    const json = JSON.stringify({ ok: true, samenvatting: { uk: 'усе гаразд', nl: 'alles in orde' } });
    writeFileSync(join(werk, 'goed.json'), json);
    r = lees(join(werk, 'goed.json')); const k = kopieVan(r);
    check('toets-2: gewone uitslag → eigen root-kopie (0600, buiten de app-map) met dezelfde inhoud',
      r.uit.includes('rc=0') && !!k && !k.startsWith(werk) && readFileSync(k, 'utf8') === json && (statSync(k).mode & 0o777) === 0o600, r.uit.trim() + r.fout.slice(0, 100));
    if (k) rmSync(join(k, '..'), { recursive: true, force: true });
    check('toets-2: rook_controleren leest de uitslag veilig vóór elk gebruik (install, samenvatting) en ruimt de kopie op',
      !!blok && rookFn.indexOf('# rook-uitslag: begin') > rookFn.indexOf('--uit') && rookFn.indexOf('# rook-uitslag: eind') < rookFn.indexOf('install -m 0640') && rookFn.includes('rm -rf "$werk" "$kopie"'));
  }

  // ================================================================ na toetsing: g09-toets-4 (signaal NA de bevestiging)
  {
    const segment = stuk('installeer', (x) => x === 'HUIDIG_ONDERDEEL=""', (x) => /^trap .* TERM INT HUP$/.test(x));
    const b = join(basis, 't4'); mkdirSync(join(b, 'vorige'), { recursive: true }); mkdirSync(join(b, 'nieuw'), { recursive: true });
    const log = join(b, 'log'); writeFileSync(log, '');
    const r = bash(`LOG="$1"; DIENST=mijn-ruimte
omzetten() { printf 'omzetten %s\\n' "$1" >> "$LOG"; }
systemctl() { printf 'systemctl %s\\n' "$*" >> "$LOG"; }
${segment}
HUIDIG_ONDERDEEL=nazorg; OVERGESCHAKELD_VAN="$2"; OVERGESCHAKELD_NAAR=""; OVERGESCHAKELD_BEVESTIGD="$3"
kill -TERM $$
sleep 2; echo NIET-GESTOPT`, [log, join(b, 'vorige'), join(b, 'nieuw')], {}, 15_000);
    check('toets-4: signaal NA de bevestiging → niets teruggezet, en het logboek zegt dat de NIEUWE (gecontroleerde) release actief is — niet «vorige blijft actief»',
      r.status === 143 && readFileSync(log, 'utf8') === '' && !/vorige release blijft actief/.test(r.fout) && /nieuw/.test(r.fout) && /gecontroleerd/.test(r.fout), `${r.status} ${JSON.stringify(readFileSync(log, 'utf8'))} ${r.fout.trim().slice(0, 220)}`);
    const act = functie('installeer', 'activeren');
    check('toets-4: activeren zet OVERGESCHAKELD_BEVESTIGD bij de bevestiging', /OVERGESCHAKELD_NAAR=""; OVERGESCHAKELD_BEVESTIGD="\$doel"/.test(act));
    // uitrol-script: «actief» in het logboek van het installatiescript = de nieuwe release is gecontroleerd
    const fns = `${regel('uitrol', 'ACTIEF_LINK=')}\n${functie('uitrol', 'nieuwe_release_bevestigd')}`;
    const werk = join(b, 'werk'); mkdirSync(werk);
    writeFileSync(join(werk, 'installeer.log'), '[installeer] stap: activeren (90%) x\n[installeer] actief: /srv/mijn-ruimte/releases/20991231-000000\n');
    const werk2 = join(b, 'werk2'); mkdirSync(werk2); writeFileSync(join(werk2, 'installeer.log'), '[installeer] stap: activeren (90%) x\nruis [installeer] actief: nep\n');
    const r2 = bash(`${fns}\nWERK="$1"; nieuwe_release_bevestigd && echo JA1; WERK="$2"; nieuwe_release_bevestigd || echo NEE2`, [werk, werk2]);
    check('toets-4: uitrol-script herkent «actief:» van het installatiescript (alleen aan het begin van een regel)', r2.uit.includes('JA1') && r2.uit.includes('NEE2'), r2.uit.trim() + r2.fout.slice(0, 100));
    check('toets-4: eindstatus bij een onderbreking na de bevestiging zegt «gecontroleerd», niet «без завершеної перевірки»',
      /if \[ "\$ONDERBROKEN" -eq 1 \] && nieuwe_release_actief && nieuwe_release_bevestigd; then/.test(functie('uitrol', 'afsluiten')));
  }

  // ================================================================ na toetsing: g09-toets-5 (blijvende thuismap van de build)
  {
    const bouw = functie('installeer', 'bouwen');
    const standaard = bouw.slice(bouw.indexOf('bouw_gebruiker_inrichten'));
    const vars = ['BOUW_GEBRUIKER=', 'BOUW_CACHE=', 'BOUW_THUIS=', 'BOUW_AFSCHERMING_UIT=', 'BOUW_OPDRACHT='].map((p) => regel('installeer', p)).join('\n');
    const r = bash(`APP_ROOT=/srv/mijn-ruimte; GEBRUIKER=mijnruimte\n${vars}\n${functie('installeer', 'bouw_afscherming')}\nbouw_afscherming /srv/mijn-ruimte/releases/x`);
    const rw = r.uit.split('\n').filter((x) => x.startsWith('ReadWritePaths='));
    check('toets-5: afgeschermde build: HOME in de eigen lege /tmp van de unit, npm-gebruikersconfig = /dev/null (geen blijvende ~/.npmrc)',
      /-E HOME=\/tmp /.test(standaard) && /-E npm_config_userconfig=\/dev\/null/.test(standaard) && !/-E HOME="\$BOUW_THUIS"/.test(standaard), standaard.slice(0, 120));
    check('toets-5: geen blijvende schrijfbare thuismap meer in de unit (alleen de npm-cache)', rw.length === 1 && rw[0] === 'ReadWritePaths=/var/cache/mijn-ruimte-bouw', rw.join(' | '));
  }

  rmSync(basis, { recursive: true, force: true });
  for (const d of opgeruimd) rmSync(d, { recursive: true, force: true });
  return einde();
}
