// SEC-002 (12.11.2026), groep g06: regressie- en verificatiesuite voor drie bevindingen.
//  - server-uitrol-10: deploy/archief-herstellen.sh — downloads met SHA-256 vóór gebruik, geen vaste namen in /tmp, paden nooit in de
//    opdrachttekst (bash -c) geplakt, cloudflared nooit stil als «latest» zonder controlesom;
//  - aanmelden-07: «Вийти» in het venster van het codewoord meldt het ACCOUNT in deze browser af (niet alleen het tabblad);
//  - extensie-05: «Усі користувачі» — verlengen en ruimer beleid alleen met een verse bevestiging van DEZE sessie (technisch: sterk),
//    gegeven NA het openen van de toegang, één keer te gebruiken; verlengen door een ander → melding aan de gebruiker.
// Draaien: node scripts/eenheidstests.mjs sec-002-g06-20261112.test.ts (wegwerp-PG; alleen verzonnen geheimen).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as grants from '../../backend/ai-toestemmingen';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import * as store from '../../backend/connectors-opslag';
import * as beheer from '../../backend/extensie-beheer';
import { leesBeleid } from '../../backend/extensie-beleid';
import * as eo from '../../backend/extensie-ontgrendeling';
import { extensieOntgrendelingRoutes } from '../../backend/extensie-ontgrendeling-routes';
import { registreerMelder } from '../../backend/melder';
import { onthoudVastleggen, stapOpVoorSessieVastleggen, totpStapOpVastleggen } from '../../backend/stap-op';
import * as tp from '../../backend/tech-profiel';
import { registreerMethodenBron } from '../../backend/toegang-context';
import { closePool, getPool } from '../../server/platform/pg';
import { POORT_AFMELD_ROUTE, poortAfmelden } from '../../src/geheim/poort-afmelden';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { checker, nepGoogle } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g06-20261112');
  delete process.env.STAP_OP_UIT;

  // ================================================================ server-uitrol-10: deploy/archief-herstellen.sh
  {
    const script = resolve('deploy/archief-herstellen.sh');
    const bron = readFileSync(script, 'utf8');
    const werk = mkdtempSync(join(tmpdir(), 'sec002-g06-herstel-'));
    try {
      check('server-uitrol-10: het script is geldige bash (bash -n)', spawnSync('bash', ['-n', script]).status === 0);
      check('server-uitrol-10: geen vaste namen in /tmp (node.tar.xz, cf.deb, pg_restore.log)', !/\/tmp\/(node\.tar\.xz|cf\.deb|pg_restore\.log)/.test(bron));
      check('server-uitrol-10: geen opdrachttekst met ingeplakte paden (doe_sh krijgt een vaste tekst; paden gaan als $1, $2 … mee)',
        !/^\s*doe_sh\s+"/m.test(bron) && !/bash -c "\$1"\s*;/.test(bron) && /bash -c "\$tekst" herstel "\$@"/.test(bron));
      check('server-uitrol-10: «latest» van cloudflared alleen achter de uitdrukkelijke keuze --tunnel-ongecontroleerd; Node met SHASUMS256',
        bron.includes('--tunnel-ongecontroleerd') && bron.includes('SHASUMS256.txt') && !/releases\/latest\/download\/cloudflared-linux-\$\{DEB_ARCH\}\.deb -o \/tmp/.test(bron));

      // Nagebootste downloadbron (file://): Node 24.9.9 x64 en cloudflared 2026.10.0 amd64 + een «latest».
      const nodeMap = join(werk, 'bron', 'node', 'v24.9.9'), cfVast = join(werk, 'bron', 'cloudflared', 'download', '2026.10.0'), cfLaatst = join(werk, 'bron', 'cloudflared', 'latest', 'download');
      for (const m of [nodeMap, cfVast, cfLaatst, join(werk, 'w')]) mkdirSync(m, { recursive: true });
      const nodeBytes = randomBytes(2048), debBytes = randomBytes(1024);
      writeFileSync(join(nodeMap, 'node-v24.9.9-linux-x64.tar.xz'), nodeBytes);
      writeFileSync(join(nodeMap, 'SHASUMS256.txt'), `${hex('iets anders')}  node-v24.9.9-linux-arm64.tar.xz\n${hex(nodeBytes)}  node-v24.9.9-linux-x64.tar.xz\n`);
      writeFileSync(join(cfVast, 'cloudflared-linux-amd64.deb'), debBytes);
      writeFileSync(join(cfLaatst, 'cloudflared-linux-amd64.deb'), randomBytes(512));
      const W = join(werk, 'w');
      // Het script «sourcen» geeft alleen de functies (niets wordt uitgevoerd); daarna de instellingen van de test en de functie zelf.
      const functie = (instellingen: string, ...args: string[]) => {
        for (const f of ['node.tar.xz', 'cloudflared.deb', 'SHASUMS256.txt']) rmSync(join(W, f), { force: true });
        // (eerst de argumenten wegzetten: een gesourcet script ziet anders de argumenten van de aanroeper als zijn eigen opties)
        const r = spawnSync('bash', ['-c', 'S="$1"; W="$2"; I="$3"; shift 3; A=("$@"); set --; source "$S"; WERK="$W"; NODE_VERSIE=24.9.9; NODE_ARCH=x64; DEB_ARCH=amd64; eval "$I"; "${A[@]}"', 'harnas', script, W, instellingen, ...args],
          { encoding: 'utf8', env: { ...process.env, HERSTEL_TEST_BRON: `file://${join(werk, 'bron')}` }, timeout: 30_000, cwd: werk });
        return { status: r.status, uit: `${r.stdout || ''}${r.stderr || ''}` };
      };
      const n1 = functie(':', 'node_ophalen');
      check('server-uitrol-10: Node-archief met de som uit SHASUMS256.txt → opgehaald en gecontroleerd', n1.status === 0 && existsSync(join(W, 'node.tar.xz')) && hex(readFileSync(join(W, 'node.tar.xz'))) === hex(nodeBytes), `${n1.status} ${n1.uit.slice(0, 200)}`);
      writeFileSync(join(nodeMap, 'node-v24.9.9-linux-x64.tar.xz'), Buffer.concat([nodeBytes, Buffer.from('gewijzigd')]));
      const n2 = functie(':', 'node_ophalen');
      check('server-uitrol-10: gewijzigd Node-archief → geweigerd (SHA-256 klopt niet), niets blijft liggen', n2.status !== 0 && /SHA-256 KLOPT NIET/.test(n2.uit) && !existsSync(join(W, 'node.tar.xz')), `${n2.status} ${n2.uit.slice(0, 200)}`);
      writeFileSync(join(nodeMap, 'node-v24.9.9-linux-x64.tar.xz'), nodeBytes);
      const n3 = functie(`NODE_SHA256=${hex('een andere uitgave')}`, 'node_ophalen');
      const n3Leeg = !existsSync(join(W, 'node.tar.xz'));
      const n4 = functie(`NODE_SHA256=${hex(nodeBytes)}`, 'node_ophalen');
      check('server-uitrol-10: vastgezette --node-sha256 wint: verkeerde som → geweigerd, juiste som → goed', n3.status !== 0 && n3Leeg && n4.status === 0 && existsSync(join(W, 'node.tar.xz')), `${n3.status} ${n4.status} ${n4.uit.slice(0, 200)}`);
      const n5 = functie('NODE_ARCH=riscv64', 'node_ophalen');
      check('server-uitrol-10: geen regel in SHASUMS256.txt voor dit archief → geweigerd', n5.status !== 0 && !existsSync(join(W, 'node.tar.xz')), `${n5.status} ${n5.uit.slice(0, 160)}`);

      const c1 = functie(':', 'cloudflared_ophalen');
      check('server-uitrol-10: cloudflared zonder vastgezette versie → NIETS opgehaald (uitkomst 3), ook al bestaat er een «latest»', c1.status === 3 && !existsSync(join(W, 'cloudflared.deb')), `${c1.status} ${c1.uit.slice(0, 160)}`);
      const c2 = functie(`CF_VERSIE=2026.10.0; CF_SHA256=${hex(debBytes)}`, 'cloudflared_ophalen');
      check('server-uitrol-10: cloudflared met vastgezette versie en juiste SHA-256 → opgehaald', c2.status === 0 && hex(readFileSync(join(W, 'cloudflared.deb'))) === hex(debBytes), `${c2.status} ${c2.uit.slice(0, 160)}`);
      const c3 = functie(`CF_VERSIE=2026.10.0; CF_SHA256=${hex('vervalst')}`, 'cloudflared_ophalen');
      check('server-uitrol-10: cloudflared met verkeerde SHA-256 → geweigerd, niets blijft liggen', c3.status !== 0 && c3.status !== 3 && !existsSync(join(W, 'cloudflared.deb')), `${c3.status} ${c3.uit.slice(0, 160)}`);
      const c4 = functie('TUNNEL_ONGECONTROLEERD=1', 'cloudflared_ophalen');
      check('server-uitrol-10: alleen met --tunnel-ongecontroleerd komt «latest» binnen, met een waarschuwing «!»', c4.status === 0 && existsSync(join(W, 'cloudflared.deb')) && /!\s*LET OP/.test(c4.uit), `${c4.status} ${c4.uit.slice(0, 160)}`);

      // Een pad met een aanhalingsteken en $(…) is gewoon een pad: het komt als argument aan en wordt nooit uitgevoerd.
      const kwaad = `x'; touch '${join(werk, 'GEKRAAKT')}'; echo '$(touch ${join(werk, 'GEKRAAKT2')})`;
      const d1 = functie('PROEF=0', 'doe_sh', 'printf %s "$1" > "$2"', kwaad, join(werk, 'uit.txt'));
      check('server-uitrol-10: doe_sh geeft paden als losse argumenten door (aanhalingsteken en $(…) worden niet uitgevoerd)',
        d1.status === 0 && existsSync(join(werk, 'uit.txt')) && readFileSync(join(werk, 'uit.txt'), 'utf8') === kwaad && !existsSync(join(werk, 'GEKRAAKT')) && !existsSync(join(werk, 'GEKRAAKT2')), `${d1.status} ${d1.uit.slice(0, 200)}`);

      // Proefrun van het hele script in een nagebootste archiefmap; de sleutel staat in een map met een aanhalingsteken in de naam.
      if (spawnSync('bash', ['-c', 'command -v apt-get']).status === 0) {
        // (geen «/» in de mapnaam: de markering zou in de werkmap van het script komen — dat is hieronder `werk`)
        const archief = join(werk, 'archief'), sleutelMap = join(werk, "sleutel's $(touch GEKRAAKT3)");
        mkdirSync(archief); mkdirSync(sleutelMap);
        copyFileSync(script, join(archief, 'vidnovyty.sh'));
        writeFileSync(join(archief, 'manifest.json'), '{"stempel":"test","node":"v24.9.9"}\n');
        writeFileSync(join(archief, 'SHA256SUMS'), `${hex(readFileSync(join(archief, 'manifest.json')))}  manifest.json\n`);
        writeFileSync(join(sleutelMap, 'sleutel.txt'), '# verzonnen testsleutel\nAGE-SECRET-KEY-TESTTESTTEST\n');
        const p = spawnSync('bash', [join(archief, 'vidnovyty.sh'), '--sleutel', join(sleutelMap, 'sleutel.txt'), '--proefrun'], { encoding: 'utf8', timeout: 60_000, cwd: werk });
        const uit =`${p.stdout || ''}${p.stderr || ''}`;
        check('server-uitrol-10: --proefrun loopt alle tien stappen door zonder iets uit te voeren (ook met een aanhalingsteken in het pad)',
          p.status === 0 && /10\/10/.test(uit) && /KLAAR/.test(uit) && !existsSync(join(werk, 'GEKRAAKT3')) && !/\/tmp\/(node\.tar\.xz|cf\.deb)/.test(uit), `${p.status} ${uit.slice(-300)}`);
        // Afwerking C (12.11.2026): het script draagt nu zelf een vastgezette cloudflared (versie + SHA-256 per architectuur). De proefrun
        // noemt die versie en de controle; het oude gedrag («zonder vastgezette versie NIET installeren») wordt op een kopie met lege waarden bewezen.
        // Завершальний крок C: скрипт має закріплену версію cloudflared; поведінку без неї перевіряємо на копії з порожніми значеннями.
        const vast = /^CF_VERSIE_VAST="([^"]*)"/m.exec(bron)?.[1] ?? '';
        check('server-uitrol-10 (afwerking C): --proefrun met de meegeleverde vastgezette versie → «cloudflared <versie> … SHA-256 controleren»', !!vast && new RegExp(`cloudflared ${vast.replace(/\./g, '\\.')} \\([a-z0-9]+\\) ophalen, SHA-256 controleren`).test(uit), uit.slice(-400));
        const leegScript = join(archief, 'vidnovyty-leeg.sh');
        writeFileSync(leegScript, bron.replace(/^CF_VERSIE_VAST="[^"]*"$/m, 'CF_VERSIE_VAST=""').replace(/^CF_SHA256_AMD64_VAST="[^"]*"$/m, 'CF_SHA256_AMD64_VAST=""').replace(/^CF_SHA256_ARM64_VAST="[^"]*"$/m, 'CF_SHA256_ARM64_VAST=""'));
        const pl = spawnSync('bash', [leegScript, '--sleutel', join(sleutelMap, 'sleutel.txt'), '--proefrun'], { encoding: 'utf8', timeout: 60_000, cwd: werk });
        check('server-uitrol-10: --proefrun zegt eerlijk dat cloudflared zonder vastgezette versie NIET wordt geïnstalleerd', /cloudflared[^\n]*NIET/.test(`${pl.stdout || ''}${pl.stderr || ''}`), `${pl.stdout || ''}`.slice(-400));
        const fouteSom = spawnSync('bash', [join(archief, 'vidnovyty.sh'), '--sleutel', join(sleutelMap, 'sleutel.txt'), '--proefrun', '--cloudflared-versie', '2026.10.0', '--cloudflared-sha256', 'geen-hex'], { encoding: 'utf8', timeout: 60_000, cwd: werk });
        const zonderSom = spawnSync('bash', [join(archief, 'vidnovyty.sh'), '--sleutel', join(sleutelMap, 'sleutel.txt'), '--proefrun', '--cloudflared-versie', 'latest'], { encoding: 'utf8', timeout: 60_000, cwd: werk });
        check('server-uitrol-10: --cloudflared-versie zonder geldige SHA-256, of «latest» als versie → geweigerd vóór de eerste stap', fouteSom.status === 2 && zonderSom.status === 2 && !/1\/10/.test(`${fouteSom.stdout}${zonderSom.stdout}`), `${fouteSom.status} ${zonderSom.status}`);
        const hulp = spawnSync('bash', [join(archief, 'vidnovyty.sh'), '--help'], { encoding: 'utf8' });
        check('server-uitrol-10: --help noemt de nieuwe opties en het risico', hulp.status === 0 && /--tunnel-ongecontroleerd/.test(hulp.stdout) && /--cloudflared-sha256/.test(hulp.stdout) && /--node-sha256/.test(hulp.stdout) && !/^set -euo/m.test(hulp.stdout), hulp.stdout.slice(-200));
      } else console.log('OVERGESLAGEN sec-002-g06: proefrun van archief-herstellen.sh (geen apt-get op deze machine)');
    } catch (e) {
      check('server-uitrol-10: onverwachte fout', false, String((e as Error)?.stack || e));
    } finally { rmSync(werk, { recursive: true, force: true }); }
  }

  // ================================================================ aanmelden-07: «Вийти» in het codewoordvenster
  {
    const bron = readFileSync('src/geheim/CodewoordPoort.tsx', 'utf8');
    check('aanmelden-07: CodewoordPoort meldt het ACCOUNT in deze browser af (poortAfmelden → logout-account-browser) en roept nergens meer logout-current aan',
      /await poortAfmelden\(/.test(bron) && !bron.includes('/api/owner/session/logout-current') && POORT_AFMELD_ROUTE === '/api/owner/session/logout-account-browser');
    const aanroepen: Array<{ url: string; data: unknown }> = [];
    const lichaam = { service: 'hub', tabContext: 'x'.repeat(48), sourceOrigin: 'https://hub.tarasevych.com' };
    const goed = await poortAfmelden(async (url, data) => { aanroepen.push({ url, data }); return { data: { ok: true } }; }, lichaam);
    check('aanmelden-07: «Вийти» stuurt precies één verzoek, naar logout-account-browser, met de sessievelden', goed === 'klaar' && aanroepen.length === 1
      && aanroepen[0].url === '/api/owner/session/logout-account-browser' && JSON.stringify(aanroepen[0].data) === JSON.stringify(lichaam), `${goed} ${JSON.stringify(aanroepen).slice(0, 160)}`);
    const weg = await poortAfmelden(async () => { throw Object.assign(new Error('OWNER_SESSION_REQUIRED'), { status: 401 }); }, lichaam);
    const stuk = await poortAfmelden(async () => { throw Object.assign(new Error('OWNER_ACCOUNT_BROWSER_LOGOUT_FAILED'), { status: 500 }); }, lichaam);
    const net = await poortAfmelden(async () => { throw Object.assign(new Error('NETWORK_ERROR'), { status: 0 }); }, lichaam);
    check('aanmelden-07: geen sessie meer (401) = klaar; serverfout of geen netwerk = NIET doen alsof er is afgemeld', weg === 'klaar' && stuk === 'mislukt' && net === 'mislukt', `${weg} ${stuk} ${net}`);
    check('aanmelden-07: bij «mislukt» blijft het venster staan met een uitleg (geen herladen)', /=== 'mislukt'\)\s*\{[\s\S]{0,400}setFout\([\s\S]{0,400}return;/.test(bron));

    // De server: in de poort (Google gelukt, codewoord nog niet) is logout-account-browser toegestaan en beëindigt het de sessie van de browser.
    const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
    const eigenaar = `s2g6-eig-${T}@example.test`;
    const vorigeEigenaar = process.env.OWNER_EMAIL;
    const G = await nepGoogle({ ownerEmail: eigenaar });
    const pool = getPool('systeem');
    let oId = '';
    try {
      const B = G.browser();
      await B.aanmelden(`sub-o-${T}`, eigenaar, { intent: 'login', remember: false });
      oId = String((await pool.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1", [eigenaar])).rows[0]?.id || '');
      const { codewoordZetten } = await import('../../backend/codewoord');
      await codewoordZetten(oId, `verzonnen woord ${T}`, eigenaar);
      const b1 = await B.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', B.ctxBody('hub'));
      check('aanmelden-07 (server): na Google staat de sessie voor de codewoord-poort', b1.status === 200 && b1.data.codewoordPoort === true, `${b1.status} poort=${b1.data.codewoordPoort}`);
      const uit = await B.verzoek('hub.tarasevych.com', '/api/owner/session/logout-account-browser', { ...B.ctxBody('hub'), sourceOrigin: 'https://hub.tarasevych.com' });
      const cookieWeg = ![...B.jar.keys()].some((k) => k.includes('tsv_ecosystem'));
      const b2 = await B.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: randomBytes(24).toString('hex') });
      const wie = await B.verzoek('hub.tarasevych.com', '/api/owner/session/who', {}, { methode: 'GET' });
      const levend = Number((await pool.query("SELECT count(*)::int AS n FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1 AND COALESCE((data->>'revokedAt')::numeric, 0) = 0", [oId])).rows[0].n);
      check('aanmelden-07 (server): logout-account-browser werkt IN de poort: cookie weg, ankersessie ingetrokken, een nieuw tabblad is niet meer aangemeld',
        uit.status === 200 && uit.data.ok === true && cookieWeg && levend === 0 && b2.data.user?.email !== eigenaar && b2.data.codewoordPoort !== true && wie.status !== 200,
        `uit=${uit.status} cookieWeg=${cookieWeg} levend=${levend} bootstrap=${b2.status}/${b2.data.state ?? ''} who=${wie.status}`);
    } catch (e) {
      check('aanmelden-07: onverwachte fout', false, String((e as Error)?.stack || e));
    } finally {
      G.herstel();
      if (oId) {
        await pool.query("DELETE FROM app.records WHERE tbl <> 'users' AND data->>'userId' = $1", [oId]).catch(() => undefined);
        await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [oId]).catch(() => undefined);
      }
      if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
    }
  }

  // ================================================================ extensie-05: «Усі користувачі» — verlengen en ruimer beleid
  {
    const sys = getPool('systeem');
    const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
    const E = `s2g6-e-${T}`, B = `s2g6-b-${T}`, O = `s2g6-o-${T}`, X = `s2g6-x-${T}`;
    const ALLE = [E, B, O, X];
    const vorigeEigenaar = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = `s2g6-eigenaar-${T}@test.invalid`;
    const mail = (id: string) => (id === E ? String(process.env.OWNER_EMAIL) : `${id}@example.test`);
    const meldingen: Array<{ userId: string; kind: string; title: string; message: string }> = [];
    registreerMelder(async (userId, _e, kind, title, message) => { meldingen.push({ userId, kind, title, message }); });
    // De eigenaar heeft een passkey (sterke manier); de beheerder niet (dan is een gewone bevestiging de sterkste die er is).
    registreerMethodenBron(async (userId) => ({ passkey: userId === E, totp: false, herstelcode: false }));
    const verplaatst = (await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner-tijdelijk\"') WHERE tbl = 'users' AND data->>'role' = 'owner' RETURNING id")).rows.map((r: { id: string }) => r.id);
    try {
      for (const id of ALLE) await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', id, { email: mail(id), role: id === E ? 'owner' : 'user', status: 'approved', name: id }]);
      const g = (id: string) => ({ id, email: mail(id), role: id === E ? 'owner' : 'user', status: 'approved' });
      await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['beheerder'], 60, 'test'), ($3, $4, ARRAY['ontwikkelaar'], 240, 'test')`,
        [B, `tech-${randomBytes(6).toString('hex')}`, O, `tech-${randomBytes(6).toString('hex')}`]);
      for (const id of ALLE) await aiDienstAan(id);
      const sessie = (id: string) => ({ user: g(id), service: 'mcp', tabContext: randomBytes(24).toString('hex'), session: { id: randomUUID(), createdAt: Date.now() - 1000 }, tabSession: null }) as eo.Aanroep;
      const aE = sessie(E), aB = sessie(B), aO = sessie(O), aX = sessie(X);
      const sv = (a: eo.Aanroep) => ({ id: a.session!.id, createdAt: a.session!.createdAt });
      const su = (a: eo.Aanroep) => ({ user: { id: a.user.id }, session: sv(a), tabSession: null });
      await tp.activeren(g(B), aB.tabContext, 60, 'test sec-002 g06 extensie-05', sv(aB));
      const actO = await tp.activeren(g(O), aO.tabContext, 60, 'test sec-002 g06 extensie-05', sv(aO));

      // De echte routes, met een sessie naar keuze (zoals ownerRequireSession haar teruggeeft).
      let huidig: unknown = null;
      const routes = extensieOntgrendelingRoutes(async () => huidig as never);
      const roep = async (a: eo.Aanroep, route: string, body: Record<string, unknown> = {}) => {
        huidig = { user: a.user, service: a.service, session: a.session, tabSession: null };
        const r = await routes[route][0]({ event: { headers: {} }, body: { service: a.service, tabContext: a.tabContext, ...body }, query: {} } as never) as { statusCode: number; body?: string };
        return { status: r.statusCode, body: JSON.parse(String(r.body || '{}')) as Record<string, any> };
      };
      const VERLENG = 'POST /api/owner/agents/extensie-beheer/verlengen', BELEID = 'POST /api/owner/agents/extensie-beheer/beleid', INTREK = 'POST /api/owner/agents/extensie-beheer/intrekken';
      const eindVan = async (gid: string) => new Date((await sys.query('SELECT eind_op FROM app.extensie_ontgrendelingen WHERE id = $1', [gid])).rows[0].eind_op).getTime();
      const audits = async (actie: string, uid: string, reden?: string) => Number((await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = $2 AND ($3::text IS NULL OR details->>'reden' = $3)`, [uid, actie, reden ?? null])).rows[0].n);
      const browser = async (uid: string, ruimte: 'prive' | 'technisch') => {
        const tok = randomToken(32);
        return store.createAgent(uid, `Chrome ${uid.slice(5, 6)} (${T})`, 'browser', sha256(tok), {}, undefined, { commandKeyEnc: sealCommandKey(newCommandKey(), uid, sha256(tok)), version: '0.6.2', ruimte });
      };
      const EP = await browser(E, 'prive'), XP = await browser(X, 'prive'), OT = await browser(O, 'technisch');
      for (const [uid, ag] of [[E, EP.id], [X, XP.id]] as const) await grants.addGrants(uid, uid, [{ agentId: ag, capability: 'browser.read', minutes: 3 * 24 * 60 }], { steppedUp: false });

      // ---------------------------------------------------------------- (а) de eigenaar (of een AI in zijn tabblad) verlengt de EIGEN toegang
      const gidE = await ontgrendelVoorTest(EP.id, E, { caps: ['browser.read'], minuten: 15 });
      const e0 = await eindVan(gidE);
      const v1 = await roep(aE, VERLENG, { gid: gidE, dagen: 1 });
      check('extensie-05 (а): eigenaar verlengt zijn eigen privé-toegang ZONDER verse bevestiging → 403 STEP_UP_REQUIRED (met reasonCode voor het venster), einde ongewijzigd',
        v1.status === 403 && v1.body.error === 'STEP_UP_REQUIRED' && v1.body.reasonCode === 'STEP_UP_REQUIRED' && !!v1.body.uitleg?.uk && (await eindVan(gidE)) === e0, `${v1.status} ${JSON.stringify(v1.body).slice(0, 160)}`);
      check('extensie-05: de weigering staat in app.audit (owner.extensie.beheer.geweigerd, reden STEP_UP_REQUIRED)', (await audits('owner.extensie.beheer.geweigerd', E, 'STEP_UP_REQUIRED')) === 1);
      await onthoudVastleggen(su(aE));
      const v1b = await roep(aE, VERLENG, { gid: gidE, dagen: 1 });
      check('extensie-05: een «onthouden browser» telt niet als bevestiging voor verlengen', v1b.status === 403 && v1b.body.error === 'STEP_UP_REQUIRED' && (await eindVan(gidE)) === e0, `${v1b.status}`);
      // De bevestiging waarmee de toegang net is geopend (stap-op vóór begin_op) verlengt haar niet ook.
      await totpStapOpVastleggen(su(aE));
      await wacht(40);
      const EP2 = await browser(E, 'prive');
      await grants.addGrants(E, E, [{ agentId: EP2.id, capability: 'browser.read', minutes: 3 * 24 * 60 }], { steppedUp: false });
      const gidE2 = await ontgrendelVoorTest(EP2.id, E, { caps: ['browser.read'], minuten: 15 });
      const e2 = await eindVan(gidE2);
      const v2 = await roep(aE, VERLENG, { gid: gidE2, dagen: 1 });
      check('extensie-05 (а): een bevestiging van VÓÓR het openen van de toegang (dezelfde die haar opende) verlengt niet → 403, einde ongewijzigd',
        v2.status === 403 && v2.body.error === 'STEP_UP_REQUIRED' && (await eindVan(gidE2)) === e2, `${v2.status} ${v2.body.error}`);
      await wacht(40);
      await totpStapOpVastleggen(su(aE));
      const v3 = await roep(aE, VERLENG, { gid: gidE2, dagen: 1 });
      check('extensie-05: met een verse bevestiging NA het openen → 200, einde later; de eigenaar krijgt geen melding over zichzelf',
        v3.status === 200 && v3.body.ok === true && (await eindVan(gidE2)) > e2 + 3_600_000 && !meldingen.some((m) => m.userId === E), `${v3.status} ${JSON.stringify(v3.body).slice(0, 160)}`);
      const e3 = await eindVan(gidE2);
      const v4 = await roep(aE, VERLENG, { gid: gidE2, dagen: 1 });
      check('extensie-05 (а): de bevestiging is VERBRUIKT: meteen nog eens verlengen (zoals een AI die doorklikt) → 403, einde ongewijzigd',
        v4.status === 403 && v4.body.error === 'STEP_UP_REQUIRED' && (await eindVan(gidE2)) === e3, `${v4.status} ${v4.body.error}`);

      // ---------------------------------------------------------------- (в) de beheerder (users.manage) verlengt de toegang van een ander
      const gidX = await ontgrendelVoorTest(XP.id, X, { caps: ['browser.read'], minuten: 60 });
      const x0 = await eindVan(gidX);
      const geen = await roep(aX, VERLENG, { gid: gidX, dagen: 1 });
      check('extensie-05: zonder beheerrecht blijft het GEEN_BEHEERRECHT (geen venster voor iets dat toch geweigerd wordt)', geen.status === 403 && geen.body.error === 'GEEN_BEHEERRECHT', `${geen.status} ${geen.body.error}`);
      const w1 = await roep(aB, VERLENG, { gid: gidX, dagen: 1 });
      check('extensie-05 (в): beheerder verlengt andermans privé-toegang zonder bevestiging → 403 STEP_UP_REQUIRED, einde ongewijzigd', w1.status === 403 && w1.body.error === 'STEP_UP_REQUIRED' && (await eindVan(gidX)) === x0, `${w1.status} ${w1.body.error}`);
      // Een bevestiging op een ANDERE sessie van de beheerder telt niet.
      await totpStapOpVastleggen({ user: { id: B }, session: { id: randomUUID(), createdAt: Date.now() }, tabSession: null });
      const w2 = await roep(aB, VERLENG, { gid: gidX, dagen: 1 });
      check('extensie-05: een bevestiging op een andere sessie telt niet', w2.status === 403 && w2.body.error === 'STEP_UP_REQUIRED', `${w2.status}`);
      await stapOpVoorSessieVastleggen(B, aB.session!.id, 'telegram');
      const voorMeld = meldingen.length;
      const w3 = await roep(aB, VERLENG, { gid: gidX, dagen: 1 });
      const meldX = meldingen.slice(voorMeld).find((m) => m.userId === X);
      check('extensie-05 (в): met bevestiging → 200, en de gebruiker krijgt een melding (soort security) dat een ander zijn toegang verlengde, met de beheerder erin',
        w3.status === 200 && (await eindVan(gidX)) > x0 + 3_600_000 && meldX?.kind === 'security' && /продовж/i.test(`${meldX.title} ${meldX.message}`) && /verlengd/i.test(`${meldX.title} ${meldX.message}`) && meldX.message.includes(mail(B)),
        `${w3.status} ${JSON.stringify(meldX ?? null).slice(0, 220)}`);
      check('extensie-05: verlengen staat in app.audit bij de gebruiker en bij de beheerder', (await audits('owner.extensie.verlengd', X)) === 1 && (await audits('owner.extensie.verlengd', B)) === 1);

      // ---------------------------------------------------------------- (б) technisch slot: sterk
      const gidO = await ontgrendelVoorTest(OT.id, O, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 20, activatieId: actO.id });
      const o0 = await eindVan(gidO);
      const t1 = await roep(aE, VERLENG, { gid: gidO, minuten: 10 });
      check('extensie-05 (б): technische toegang verlengen zonder bevestiging → 403 (STEP_UP_STRONG_REQUIRED voor wie een passkey heeft), einde ongewijzigd',
        t1.status === 403 && t1.body.error === 'STEP_UP_STRONG_REQUIRED' && (await eindVan(gidO)) === o0, `${t1.status} ${t1.body.error}`);
      await stapOpVoorSessieVastleggen(E, aE.session!.id, 'telegram');
      const t2 = await roep(aE, VERLENG, { gid: gidO, minuten: 10 });
      check('extensie-05 (б): een gewone (niet-sterke) bevestiging is voor het technische slot niet genoeg → 403 STEP_UP_STRONG_REQUIRED', t2.status === 403 && t2.body.error === 'STEP_UP_STRONG_REQUIRED' && (await eindVan(gidO)) === o0, `${t2.status} ${t2.body.error}`);
      check('extensie-05: ook die weigering staat in app.audit', (await audits('owner.extensie.beheer.geweigerd', E, 'STEP_UP_STRONG_REQUIRED')) === 2);
      await sys.query("UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = 'test' WHERE id = $1", [gidE]);
      const gidE3 = await ontgrendelVoorTest(EP.id, E, { caps: ['browser.read'], minuten: 15 });
      await sys.query("UPDATE app.extensie_ontgrendelingen SET begin_op = now() - interval '1 minute' WHERE id = $1", [gidE3]);
      const t3 = await roep(aE, VERLENG, { gid: gidE3, dagen: 1 });
      check('extensie-05: dezelfde gewone bevestiging is voor het privé-slot wél genoeg (zoals bij het openen ervan)', t3.status === 200, `${t3.status} ${t3.body.error ?? ''}`);
      await totpStapOpVastleggen(su(aE));
      const t4 = await roep(aE, VERLENG, { gid: gidO, minuten: 480 });
      check('extensie-05 (б): met een sterke bevestiging → 200, en nog steeds nooit voorbij de activering', t4.status === 200 && t4.body.gekapt === true && Math.abs((await eindVan(gidO)) - actO.eind) < 2000, `${t4.status} ${JSON.stringify(t4.body).slice(0, 160)}`);

      // ---------------------------------------------------------------- beleid: strenger mag altijd, ruimer alleen met bevestiging
      const p1 = await roep(aE, BELEID, { userId: X, priveCaps: ['browser.read'], priveMaxDagen: 30, lokaalAan: false, notitie: 'stagiair' });
      check('extensie-05: STRENGER beleid (en een notitie) blijft zonder bevestiging werken (veilige richting)', p1.status === 200 && p1.body.beleid?.priveCaps?.join() === 'browser.read' && p1.body.beleid.priveMaxDagen === 30 && p1.body.beleid.lokaalAan === false, `${p1.status} ${p1.body.error ?? ''}`);
      const ruimer: Array<[string, Record<string, unknown>]> = [['caps null', { priveCaps: null }], ['meer caps', { priveCaps: ['browser.read', 'browser.interact'] }], ['langer', { priveMaxDagen: 60 }], ['lokaal aan', { lokaalAan: true }]];
      const uitkomsten: string[] = [];
      for (const [naam, veld] of ruimer) { const r = await roep(aE, BELEID, { userId: X, ...veld }); uitkomsten.push(`${naam}:${r.status}:${r.body.error ?? ''}`); }
      const naWeigeren = await leesBeleid(X);
      // (de lokale agent geldt ook voor het technische slot: daar vraagt de eigenaar-met-passkey de sterke bevestiging)
      check('extensie-05: RUIMER beleid (alle caps, meer caps, langere duur, lokaal aan) zonder bevestiging → 403 STEP_UP_REQUIRED (lokaal: STEP_UP_STRONG_REQUIRED) en niets opgeslagen',
        uitkomsten.slice(0, 3).every((u) => u.endsWith(':403:STEP_UP_REQUIRED')) && uitkomsten[3].endsWith(':403:STEP_UP_STRONG_REQUIRED') && naWeigeren.priveCaps?.join() === 'browser.read' && naWeigeren.priveMaxDagen === 30 && naWeigeren.lokaalAan === false, uitkomsten.join(' | '));
      await roep(aE, BELEID, { userId: X, priveAan: false });
      const p2 = await roep(aE, BELEID, { userId: X, priveAan: true });
      check('extensie-05: een uitgezet slot weer AANzetten is ruimer → 403 zonder bevestiging', p2.status === 403 && p2.body.error === 'STEP_UP_REQUIRED' && (await leesBeleid(X)).priveAan === false, `${p2.status} ${p2.body.error}`);
      await stapOpVoorSessieVastleggen(E, aE.session!.id, 'telegram');
      const p3 = await roep(aE, BELEID, { userId: X, priveAan: true, priveCaps: null });
      const p4 = await roep(aE, BELEID, { userId: X, priveMaxDagen: 60 });
      check('extensie-05: met bevestiging → 200; de bevestiging is daarna verbruikt (de volgende verruiming vraagt opnieuw)',
        p3.status === 200 && p3.body.beleid?.priveAan === true && p3.body.beleid.priveCaps === null && p4.status === 403 && p4.body.error === 'STEP_UP_REQUIRED', `${p3.status} ${p4.status} ${p4.body.error ?? ''}`);
      await roep(aE, BELEID, { userId: O, technischMaxMinuten: 30, technischCaps: ['browser.read'] });
      await stapOpVoorSessieVastleggen(E, aE.session!.id, 'telegram');
      const p5 = await roep(aE, BELEID, { userId: O, technischMaxMinuten: 60 });
      const p6 = await roep(aE, BELEID, { userId: O, technischCaps: null });
      check('extensie-05: ruimer TECHNISCH beleid vraagt een sterke bevestiging (gewone is niet genoeg) → 403 STEP_UP_STRONG_REQUIRED, niets opgeslagen',
        p5.status === 403 && p5.body.error === 'STEP_UP_STRONG_REQUIRED' && p6.status === 403 && p6.body.error === 'STEP_UP_STRONG_REQUIRED' && (await leesBeleid(O)).technischMaxMinuten === 30, `${p5.status} ${p5.body.error} ${p6.status} ${p6.body.error}`);
      await totpStapOpVastleggen(su(aE));
      const p7 = await roep(aE, BELEID, { userId: O, technischMaxMinuten: 60, technischCaps: null });
      check('extensie-05: ruimer technisch beleid met een sterke bevestiging → 200', p7.status === 200 && p7.body.beleid?.technischMaxMinuten === 60 && p7.body.beleid.technischCaps === null, `${p7.status} ${p7.body.error ?? ''}`);
      const b1 = await roep(aB, BELEID, { userId: X, priveMaxDagen: 90 });
      check('extensie-05 (в): ook de beheerder verruimt het beleid van een ander niet zonder bevestiging', b1.status === 403 && b1.body.error === 'STEP_UP_REQUIRED', `${b1.status} ${b1.body.error}`);

      // ---------------------------------------------------------------- na de controle (g06-1, g06-2)
      // g06-1: technisch slot — een STERKE bevestiging van vóór het openen + een gewone erna is samen nog steeds niet genoeg.
      await sys.query("UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = 'test' WHERE user_id = $1 AND ingetrokken_op IS NULL", [O]);
      await totpStapOpVastleggen(su(aE));
      await wacht(40);
      const gidO2 = await ontgrendelVoorTest(OT.id, O, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 10, activatieId: actO.id });
      const o2 = await eindVan(gidO2);
      await wacht(40);
      await stapOpVoorSessieVastleggen(E, aE.session!.id, 'telegram');
      const k1 = await roep(aE, VERLENG, { gid: gidO2, minuten: 10 });
      check('extensie-05 (g06-1): sterke bevestiging VÓÓR het openen + gewone bevestiging erna → nog steeds 403 STEP_UP_STRONG_REQUIRED, einde ongewijzigd',
        k1.status === 403 && k1.body.error === 'STEP_UP_STRONG_REQUIRED' && (await eindVan(gidO2)) === o2, `${k1.status} ${k1.body.error ?? 'ok'}`);
      await wacht(40);
      await totpStapOpVastleggen(su(aE));
      const k2 = await roep(aE, VERLENG, { gid: gidO2, minuten: 10 });
      check('extensie-05 (g06-1): een sterke bevestiging NA het openen → 200', k2.status === 200 && (await eindVan(gidO2)) > o2, `${k2.status} ${k2.body.error ?? ''}`);
      // g06-2: één bevestiging = één verruiming, ook als de verzoeken TEGELIJK binnenkomen.
      await roep(aE, BELEID, { userId: X, priveMaxDagen: 10, priveCaps: ['browser.read'], lokaalAan: false });
      // (ook B eerst strenger, met beperkte caps: anders is «priveCaps: null» voor B geen verruiming — standaard is null = alle.)
      await roep(aE, BELEID, { userId: B, priveMaxDagen: 10, priveCaps: ['browser.read'] });
      await stapOpVoorSessieVastleggen(E, aE.session!.id, 'telegram');
      const tegelijk = await Promise.all([
        roep(aE, BELEID, { userId: X, priveMaxDagen: 20 }), roep(aE, BELEID, { userId: B, priveMaxDagen: 20 }),
        roep(aE, BELEID, { userId: X, priveCaps: ['browser.read', 'browser.navigate'] }), roep(aE, BELEID, { userId: B, priveCaps: null }),
      ]);
      const statussen = tegelijk.map((r) => r.status).sort().join();
      check('extensie-05 (g06-2): vier verruimingen tegelijk op één bevestiging → precies één 200, de rest 403 STEP_UP_REQUIRED',
        statussen === '200,403,403,403' && tegelijk.filter((r) => r.status === 403).every((r) => r.body.error === 'STEP_UP_REQUIRED'), statussen);
      const rijen4: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        const ag = await browser(X, 'prive');
        await grants.addGrants(X, X, [{ agentId: ag.id, capability: 'browser.read', minutes: 3 * 24 * 60 }], { steppedUp: false });
        rijen4.push(await ontgrendelVoorTest(ag.id, X, { caps: ['browser.read'], minuten: 30 }));
      }
      await wacht(40);
      await stapOpVoorSessieVastleggen(E, aE.session!.id, 'telegram');
      const tegelijk2 = await Promise.all(rijen4.map((gid) => roep(aE, VERLENG, { gid, dagen: 1 })));
      const statussen2 = tegelijk2.map((r) => r.status).sort().join();
      check('extensie-05 (g06-2): vier keer «Продовжити» tegelijk op één bevestiging → precies één verlenging', statussen2 === '200,403,403,403', statussen2);
      // g06-3: hetzelfde DETERMINISTISCH (de routes hierboven hangen af van hoe de verzoeken toevallig door elkaar lopen). Een
      // test-poort met een «slagboom»: `eis` leest «al verbruikt» bij binnenkomst (zoals de echte eis de database leest) en wacht dan
      // tot alle vier aanroepen in `eis` zijn (hoogstens 1,5 s). Zonder ondeelbare eis+verbruik lezen alle vier dus «niet verbruikt»
      // vóór het eerste `verbruik` (elke keer 4×ok); met — komt er telkens maar één binnen, wacht die de 1,5 s uit, verbruikt, en
      // lezen de volgende «verbruikt».
      const trage = (): beheer.Bevestiging => {
        let verbruikt = false, binnen = 0;
        return {
          eis: async () => {
            const gelezen = verbruikt;
            binnen += 1;
            for (let t = 0; binnen < 4 && t < 1500; t += 25) await wacht(25);
            return gelezen ? 'STEP_UP_REQUIRED' : '';
          },
          verbruik: async () => { verbruikt = true; },
        };
      };
      const uitkomst = async (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => String((e as { code?: string })?.code || e));
      const poortV = trage();
      const direct1 = await Promise.all(rijen4.map((gid) => uitkomst(beheer.verlengen(aE, { gid, dagen: 2 }, poortV))));
      check('extensie-05 (g06-3): verlengen direct, vier tegelijk met een trage poort → precies één geslaagd (deterministisch)',
        direct1.filter((u) => u === 'ok').length === 1 && direct1.filter((u) => u === 'STEP_UP_REQUIRED').length === 3, direct1.join());
      await roep(aE, BELEID, { userId: X, priveMaxDagen: 10, priveCaps: ['browser.read'] });
      await roep(aE, BELEID, { userId: B, priveMaxDagen: 10, priveCaps: ['browser.read'] });
      const poortB = trage();
      const direct2 = await Promise.all([
        uitkomst(beheer.beleidZetten(aE, { userId: X, priveMaxDagen: 20 }, poortB)), uitkomst(beheer.beleidZetten(aE, { userId: B, priveMaxDagen: 20 }, poortB)),
        uitkomst(beheer.beleidZetten(aE, { userId: X, priveCaps: ['browser.read', 'browser.navigate'] }, poortB)), uitkomst(beheer.beleidZetten(aE, { userId: B, priveCaps: null }, poortB)),
      ]);
      check('extensie-05 (g06-3): beleid verruimen direct, vier tegelijk met een trage poort → precies één geslaagd (deterministisch)',
        direct2.filter((u) => u === 'ok').length === 1 && direct2.filter((u) => u === 'STEP_UP_REQUIRED').length === 3, direct2.join());

      // ---------------------------------------------------------------- intrekken blijft de veilige richting
      await sys.query("UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = 'test' WHERE user_id = $1 AND ingetrokken_op IS NULL", [X]);
      await ontgrendelVoorTest(XP.id, X, { caps: ['browser.read'], minuten: 60 });
      const i1 = await roep(aB, INTREK, { userId: X });
      check('extensie-05: intrekken door beheer vraagt GEEN bevestiging (veilige richting, altijd direct)', i1.status === 200 && i1.body.ingetrokken === 1, `${i1.status} ${JSON.stringify(i1.body).slice(0, 120)}`);
    } catch (e) {
      check('extensie-05: onverwachte fout', false, String((e as Error)?.stack || e));
    } finally {
      await aiDienstOpruimen(ALLE);
      eo._testReset();
      for (const tabel of ['extensie_ontgrendelingen', 'extensie_beleid', 'ai_grants', 'agents', 'tech_activaties', 'tech_profielen']) await sys.query(`DELETE FROM app.${tabel} WHERE user_id = ANY($1)`, [ALLE]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = ANY($1)", [ALLE]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [ALLE]).catch(() => undefined);
      if (verplaatst.length) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl = 'users' AND id = ANY($1)", [verplaatst]).catch(() => undefined);
      if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
    }
  }

  await closePool().catch(() => undefined);
  return einde();
}
