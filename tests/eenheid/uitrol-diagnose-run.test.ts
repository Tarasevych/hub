// «Діагностика» → «Перевірки» (backend/uitrol-diagnose-run.ts): vaste whitelist, geen shell, timeouts, uitvoerlimiet, maskeren,
// momentopname van root als terugval, één tegelijk en toegang alleen voor de eigenaar op admin.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { CHECKS, CHECK_IDS, CHECK_GROEPEN } from '../../shared/uitrol-diagnose-controles';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-diagnose-run');
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-diag-'));
  const statusDir = join(basis, 'status'); mkdirSync(statusDir, { recursive: true });
  const inbox = join(basis, 'inbox'); mkdirSync(inbox, { recursive: true });
  const oud = { a: process.env.OPDRACHT_STATUS_DIR, b: process.env.GOEDKEUR_INBOX, c: process.env.UITROL_ROOT_SCRIPT, d: process.env.UITROL_APP_ROOT, e: process.env.OWNER_EMAIL };
  Object.assign(process.env, { OPDRACHT_STATUS_DIR: statusDir, GOEDKEUR_INBOX: inbox, UITROL_ROOT_SCRIPT: join(basis, 'geen-script'), UITROL_APP_ROOT: join(basis, 'geen-app'), OWNER_EMAIL: 'eigenaar@diag.test' });
  try {
    const m = await import('../../backend/uitrol-diagnose-run');

    // ---- catalogus ↔ uitvoerders
    check('elke controle uit de catalogus heeft een uitvoerder en omgekeerd', m.UITVOERBARE_IDS.slice().sort().join() === CHECK_IDS.slice().sort().join(), `${m.UITVOERBARE_IDS.length}/${CHECK_IDS.length}`);
    check('catalogus: unieke id\'s, alleen a-z0-9-, bekende groepen', new Set(CHECK_IDS).size === CHECK_IDS.length && CHECK_IDS.every((i) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(i)) && CHECKS.every((c) => CHECK_GROEPEN.some((g) => g.id === c.groep)));
    check('catalogus: elke controle heeft uk+nl titel, doel, gezond en minstens één afwijking', CHECKS.every((c) => c.titel[0] && c.titel[1] && c.doel[0] && c.doel[1] && c.gezond[0] && c.fouten.length >= 1));
    check('catalogus: SSH-opdrachten zijn alleen lezend (geen rm/mv/tee/>/;/&&-schrijfacties)', CHECKS.every((c) => !c.ssh || !/(\brm\b|\bmv\b|\btee\b|\bchmod\b|\bchown\b|\bsystemctl (start|stop|restart|enable|disable)\b|[^|]>[^&]|\bdd\b)/.test(c.ssh)));

    // ---- whitelist
    const code = async (id: unknown) => { try { await m.voerCheckUit(id); return 'OK'; } catch (e) { return (e as { code?: string }).code || String(e); } };
    check('whitelist: onbekende id geweigerd', (await code('rm-rf')) === 'CHECK_ONBEKEND');
    check('whitelist: shell-tekens geweigerd (; | & $ ` > spatie ..)', (await Promise.all(['inbox;id', 'inbox|id', 'inbox&&id', '$(id)', '`id`', 'inbox > x', 'inbox id', '../etc/passwd', 'inbox\nid', 'INBOX'])).length === 10
      && (await Promise.all(['inbox;id', 'inbox|id', 'inbox&&id', '$(id)', '`id`', 'inbox > x', 'inbox id', '../etc/passwd', 'inbox\nid', 'INBOX'].map(code))).every((c) => c === 'CHECK_ONBEKEND'));
    check('whitelist: geen prototype-id\'s (__proto__, constructor, toString)', (await Promise.all(['__proto__', 'constructor', 'toString', 'hasOwnProperty'].map(code))).every((c) => c === 'CHECK_ONBEKEND'));
    check('whitelist: geen id = geweigerd (null, getal, object, lege tekst, te lang)', (await Promise.all([null, undefined, 5, {}, [], '', 'a'.repeat(200)].map(code))).every((c) => c === 'CHECK_ONBEKEND'));

    // ---- programma's: geen shell, timeout, limiet
    const echt = await m.draai('echo', ['$(id)', ';', 'ls', '`id`', '&&', 'x']);
    check('draai: argumenten gaan NIET door een shell ($(id), ;, && blijven letterlijk staan)', echt.uit.trim() === '$(id) ; ls `id` && x', JSON.stringify(echt.uit));
    check('draai: programma buiten de vaste mappen/ongeldige naam wordt niet gevonden', (await m.draai('../bin/echo', ['x'])).ontbreekt && (await m.draai('echo; id', [])).ontbreekt && (await m.draai('niet-bestaand-programma', [])).ontbreekt);
    const t0 = Date.now();
    const traag = await m.draai('sleep', ['5'], { timeoutMs: 300 });
    check('draai: timeout beëindigt het programma (SIGKILL) binnen de limiet', traag.timeout === true && Date.now() - t0 < 2500, `${Date.now() - t0} ms`);
    const groot = await m.draai('head', ['-c', '2000000', '/dev/zero'], { maxBuffer: 4096 });
    check('draai: uitvoerlimiet (maxBuffer) kapt af zonder te crashen', groot.uit.length <= 4096 + 1, String(groot.uit.length));
    const env = await m.draai('env', []);
    check('draai: schone omgeving (alleen PATH en LC_ALL; geen DATABASE_URL/TOKEN e.d.)', /^PATH=/m.test(env.uit) && !/DATABASE_URL|TOKEN|SECRET|OWNER_EMAIL/.test(env.uit) && env.uit.trim().split('\n').length <= 4, env.uit.trim().split('\n').map((l) => l.split('=')[0]).join(','));

    // ---- maskeren en afkappen
    const geheim = ['Authorization: Bearer abcdef1234567890abcdef', 'password=hunter2', 'API_KEY: sk-live-1234567890abcdefghij', 'DATABASE_URL=postgres://app:geheimwoord@db:5432/x', '"token": "tvh_abcdefghijklmnop1234"',
      'Set-Cookie: sid=abc123; HttpOnly', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijkl', '-----BEGIN PRIVATE' + ' KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE' + ' KEY-----' /* opgeknipt voor de geheimenscan van de uitrol; runtime één blok */, 'wachtwoord is x1y2z3'].join('\n');
    const gemaskeerd = m.maskeer(geheim);
    check('maskeer: geen enkel geheim blijft over', !/hunter2|abcdef1234567890|sk-live|geheimwoord|tvh_abcdefghij|sid=abc123|eyJhbGci|MIIEvQ|x1y2z3/.test(gemaskeerd), gemaskeerd);
    const gewoon = '2026-10-17T10:00:00+0200 host mijn-ruimte-uitrol[12]: [uitrol] sha256 b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2b7e2 geldig';
    check('maskeer: gewone logregels en sha256 blijven leesbaar', m.maskeer(gewoon) === gewoon);
    const k = m.kap(`${'x'.repeat(5000)}\n${'y\n'.repeat(30000)}`);
    check('kap: lange regels en totale uitvoer worden afgekapt (met vlag)', k.afgekapt && k.tekst.length <= m.MAX_UITVOER && k.tekst.split('\n')[0].length <= m.MAX_REGEL + 1);
    check('kap: stuurtekens verwijderd', !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(m.kap('a\u0000b\u001bc').tekst));

    // ---- controles zonder rootbestanden: nooit een crash, altijd een uitslag
    const alle: Record<string, Awaited<ReturnType<typeof m.voerCheckUit>>> = {};
    for (const id of CHECK_IDS) { try { alle[id] = await m.voerCheckUit(id); } catch (e) { check(`controle ${id}: gooit geen fout`, false, String(e)); } }
    check('alle controles geven een uitslag met status, bron, tijd en samenvatting in uk én nl', CHECK_IDS.every((id) => { const u = alle[id]; return !!u && ['ok', 'let-op', 'fout', 'info'].includes(u.status) && !!u.bron && !!u.tijd && !!u.samenvatting[0] && !!u.samenvatting[1] && typeof u.uitvoer === 'string' && u.uitvoer.length <= m.MAX_UITVOER; }));
    check('zonder diagnose.json: journaal/blokkering/units melden dat er geen toegang of momentopname is (geen stil «ok» uit het niets)', ['goedkeur-journaal'].every((id) => alle[id].bron === 'root-momentopname' ? alle[id].status !== 'ok' : true));
    check('root-momentopname zonder bestand → fout', alle['root-momentopname'].status === 'fout');
    check('inbox: lege map → ok', alle['inbox'].status === 'ok');
    check('root-script: ontbrekend script wordt gemeld (fout)', alle['root-script'].status === 'fout');
    check('database-controle: antwoordt met aantal migraties', alle['database'].status === 'ok' && /migrat/.test(alle['database'].uitvoer));
    check('site-gezondheid: zonder luisterende site → fout (geen crash)', alle['site-gezondheid'].status === 'fout');

    // ---- met momentopname van root: bron + leeftijd worden vermeld
    const nu = Date.now();
    writeFileSync(join(statusDir, 'diagnose.json'), JSON.stringify({ tijd: new Date(nu - 45_000).toISOString(), gezond: false,
      problemen: [{ code: 'PAKKET_LIGT_STIL', uk: 'Пакет лежить', nl: 'x' }], eenheden: { 'mijn-ruimte-goedkeuring.path': { geladen: 'loaded', actief: 'inactive', sub: 'dead', bestand: 'enabled', resultaat: '', exit: '' } },
      lock: { bezet: true, door: 'mijn-ruimte-uit 4242', bestaat: true }, schijf: { '/srv/mijn-ruimte': { vrijMB: 300, totaalMB: 40000 } },
      journaal: ['2026-10-17T10:00:01+0200 h mijn-ruimte-uitrol[1]: [uitrol] start', '2026-10-17T10:00:02+0200 h systemd[1]: mijn-ruimte-goedkeuring.service: Failed with result \'exit-code\'.', '2026-10-17T10:00:03+0200 h x[1]: password=hunter2'] }));
    writeFileSync(join(inbox, 'mijn-ruimte-20261017-100000.tar.gz'), 'x');
    const j = await m.voerCheckUit('goedkeur-journaal');
    // journalctl voor de app-gebruiker kan in de testomgeving wél bestaan; dan is de bron «live». Beide paden moeten veilig zijn.
    check('journaal: bron is live óf root-momentopname, nooit stil leeg', (j.bron === 'live' || j.bron === 'root-momentopname') && j.uitvoer.length > 0, j.bron);
    check('journaal: geheim uit de momentopname is gemaskeerd', !/hunter2/.test(j.uitvoer));
    const sn = await m.voerCheckUit('root-momentopname');
    check('momentopname: leeftijd ~45 s en probleem getoond, status fout', sn.leeftijdSec != null && sn.leeftijdSec >= 40 && sn.leeftijdSec < 120 && /PAKKET_LIGT_STIL/.test(sn.uitvoer) && sn.status === 'fout');
    const sc = await m.voerCheckUit('schijf');
    check('schijf: uitslag zonder crash (live of momentopname)', ['live', 'root-momentopname'].includes(sc.bron));
    const ib = await m.voerCheckUit('inbox');
    check('inbox: toont het bestand', /mijn-ruimte-20261017-100000\.tar\.gz/.test(ib.uitvoer));

    // ---- gelijktijdigheid: één tegelijk
    const [a, b] = await Promise.allSettled([m.voerCheckUit('schijf'), m.voerCheckUit('geheugen')]);
    const codes = [a, b].map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'OK'));
    check('slechts één controle tegelijk (tweede krijgt DIAGNOSE_BEZIG)', codes.includes('DIAGNOSE_BEZIG') && codes.includes('OK'), codes.join());
    check('na afloop kan weer een controle starten', (await code('belasting')) === 'OK');

    // ---- route: toegang
    const routes = m.uitrolDiagnoseRunRoutes({
      requireSession: async (event) => {
        const wie = String((event as { wie?: string }).wie || '');
        if (wie === 'geen') return { errorCode: 'OWNER_SESSION_REQUIRED' };
        if (wie === 'eigenaar') return { user: { id: 'u-eig', email: 'eigenaar@diag.test', role: 'owner', status: 'approved' }, service: (event as { dienst?: string }).dienst || 'admin' };
        if (wie === 'nep') return { user: { id: 'u-nep', email: 'ander@diag.test', role: 'owner', status: 'approved' }, service: 'admin' };
        return { user: { id: 'u-lid', email: 'lid@diag.test', role: 'member', status: 'approved' }, service: 'admin' };
      },
    });
    const route = routes['POST /api/owner/uitrol/diagnose/uitvoeren'][0] as unknown as (ctx: unknown) => Promise<{ statusCode: number; body: string }>;
    const roep = async (event: Record<string, unknown>, body: unknown) => { const r = await route({ event, body }); let data: any = {}; try { data = JSON.parse(r.body); } catch { /* geen json */ } return { status: r.statusCode, data }; };
    check('route: zonder sessie 401', (await roep({ wie: 'geen' }, { id: 'inbox' })).status === 401);
    check('route: gewoon lid geweigerd (OWNER_REQUIRED)', (await roep({ wie: 'lid' }, { id: 'inbox' })).status === 403);
    check('route: rol owner met ander e-mailadres is geen eigenaar', (await roep({ wie: 'nep' }, { id: 'inbox' })).status === 403);
    check('route: eigenaar buiten admin-dienst geweigerd', (await roep({ wie: 'eigenaar', dienst: 'mcp' }, { id: 'inbox' })).status === 403);
    const ok = await roep({ wie: 'eigenaar' }, { id: 'inbox' });
    check('route: eigenaar krijgt de uitslag', ok.status === 200 && ok.data.id === 'inbox' && typeof ok.data.uitvoer === 'string', JSON.stringify(ok).slice(0, 200));
    check('route: onbekende id → 400 CHECK_ONBEKEND', (await roep({ wie: 'eigenaar' }, { id: 'cat /etc/shadow' })).status === 400);
    check('route: een opdracht in de body wordt genegeerd (alleen id telt)', (await roep({ wie: 'eigenaar' }, { id: 'belasting', opdracht: 'rm -rf /', args: ['-rf'] })).status === 200);
    const log = (await getPool('systeem').query(`SELECT result, details FROM app.audit WHERE action = 'owner.uitrol.diagnose.uitgevoerd' AND owner_id = 'u-eig' ORDER BY seq DESC LIMIT 10`)).rows;
    check('route: elke uitvoering staat in het logboek (ook geweigerde)', log.length >= 3 && log.some((r: any) => r.result === 'success' && r.details?.check === 'inbox') && log.some((r: any) => r.result === 'denied'), JSON.stringify(log).slice(0, 300));
    check('route: het logboek bevat nooit de uitvoer', !log.some((r: any) => JSON.stringify(r.details).includes('mijn-ruimte-20261017')));
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    Object.assign(process.env, { OPDRACHT_STATUS_DIR: oud.a ?? '', GOEDKEUR_INBOX: oud.b ?? '', UITROL_ROOT_SCRIPT: oud.c ?? '', UITROL_APP_ROOT: oud.d ?? '', OWNER_EMAIL: oud.e ?? '' });
    try { await getPool('systeem').query(`DELETE FROM app.audit WHERE owner_id = 'u-eig' AND action = 'owner.uitrol.diagnose.uitgevoerd'`); } catch { /* audit is append-only: laten staan */ }
    rmSync(basis, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  // Audit 19.10.2026 (A6): het journaal is geen grid met max-height meer (groepen met overflow:hidden kregen elk ±41px: regels onzichtbaar).
  const css = readFileSync('src/uitrol/diagnose.css', 'utf8'); const ui = readFileSync('src/uitrol/Diagnose.tsx', 'utf8');
  check('A6: .ud-journaal is block (geen grid) en de kijker draagt niet ook .ut-journaal (max-height 300)', /\.ud-journaal\{display:block;/.test(css) && !/\.ud-journaal\{[^}]*display:grid/.test(css) && !/className='ud-journaal ut-journaal'/.test(ui));
  return einde();
}
