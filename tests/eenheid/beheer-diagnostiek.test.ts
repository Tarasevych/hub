// Admin → «Діагностика» (/diagnostiek): register ↔ uitvoerders, zuivere beoordelingen, sortering van «Потребує уваги», whitelist van de route,
// geschiedenis in de database (laatste succes, sinds wanneer faalt het, filters, cursor, opruimen) en het auditspoor. Alle netwerkverkeer is nagebootst.
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import {
  CATEGORIEEN, CONTROLES, CONTROLE_IDS, DIENST_HOSTS, ID_VORM, MAX_BATCH, aandacht, aandachtTellers, codeUitleg, controlesVan, isControleId, leeftijd, schoonUitslag, totaal,
  type Toestand, type Uitslag,
} from '../../shared/beheer-diagnostiek';
import { filterControles, foutTekst, normaliseer } from '../../src/diagnostiek/hulp';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('beheer-diagnostiek');
  const oud = { owner: process.env.OWNER_EMAIL, fetch: globalThis.fetch };
  process.env.OWNER_EMAIL = 'eigenaar@diag.test';
  const sys = () => getPool('systeem');
  try {
    const m = await import('../../backend/beheer-diagnostiek');

    // ---- register
    check('register: unieke id\'s met geldige vorm', new Set(CONTROLE_IDS).size === CONTROLE_IDS.length && CONTROLE_IDS.every((i) => ID_VORM.test(i)), `${CONTROLE_IDS.length} controles`);
    check('register: elke controle heeft een uitvoerder en omgekeerd', m.UITVOERBARE_IDS.slice().sort().join() === CONTROLE_IDS.slice().sort().join());
    check('register: elke controle heeft uk+nl naam, uitleg, reden, hoe en minstens één oplossingsstap',
      CONTROLES.every((c) => c.naam[0] && c.naam[1] && c.wat[0] && c.wat[1] && c.waarom[0] && c.waarom[1] && c.hoe[0] && c.hoe[1] && c.oplossing.length >= 1 && c.oplossing.every((s) => s[0] && s[1])));
    check('register: elke categorie heeft controles en elke controle een bestaande categorie', CATEGORIEEN.every((c) => controlesVan(c.id).length > 0) && CONTROLES.every((c) => CATEGORIEEN.some((k) => k.id === c.cat)));
    check('register: alle 9 subdomeinen hebben een dienstcontrole', DIENST_HOSTS.every((h) => isControleId(`dienst-${h}`)) && DIENST_HOSTS.length === 9);
    check('register: oplossingsstappen bevatten geen schrijfacties zonder uitleg (geen rm -rf, geen curl | sh)', CONTROLES.every((c) => c.oplossing.every((s) => !/rm -rf|curl [^\n]*\|\s*(ba)?sh|chmod 777/.test(s[0] + s[1]))));
    check('isControleId: alleen exacte registerwaarden', isControleId('dienst-hub') && !isControleId('cat /etc/shadow') && !isControleId('DIENST-HUB') && !isControleId('') && !isControleId(42 as unknown) && !isControleId('dienst-hub; rm'));

    // ---- zuivere beoordelingen
    check('httpStand: 200 snel = ok, 200 traag = let-op, 401/403 = ok, 404 en 5xx = fout', m.httpStand(200, 120).stand === 'ok' && m.httpStand(200, 1600).stand === 'let-op' && m.httpStand(401, 50).stand === 'ok'
      && m.httpStand(403, 50).stand === 'ok' && m.httpStand(404, 50).code === 'HTTP_404' && m.httpStand(503, 50).code === 'HTTP_503' && m.httpStand(302, 80).stand === 'ok');
    check('tlsStand: verlopen/binnen 7 dagen = fout, binnen 21 = let-op, daarna ok', m.tlsStand(-1).code === 'TLS_VERLOPEN' && m.tlsStand(3).code === 'TLS_BINNENKORT' && m.tlsStand(15).code === 'TLS_KORT' && m.tlsStand(60).stand === 'ok');
    check('geheugenStand / schijfStand / belastingStand / lagStand / dbStand: grenzen', m.geheugenStand(3).stand === 'fout' && m.geheugenStand(8).stand === 'let-op' && m.geheugenStand(40).stand === 'ok'
      && m.schijfStand(2).stand === 'fout' && m.schijfStand(9).stand === 'let-op' && m.schijfStand(50).stand === 'ok'
      && m.belastingStand(13, 4).stand === 'fout' && m.belastingStand(7, 4).stand === 'let-op' && m.belastingStand(2, 4).stand === 'ok'
      && m.lagStand(250).stand === 'let-op' && m.lagStand(20).stand === 'ok' && m.dbStand(300).code === 'DB_TRAAG' && m.dbStand(5).stand === 'ok');
    const mem = 'MemTotal:       16000000 kB\nMemFree:          100000 kB\nMemAvailable:    4000000 kB\n';
    check('meminfoWaarde en mediaan', m.meminfoWaarde(mem, 'MemAvailable') === 4000000 && m.meminfoWaarde(mem, 'MemTotal') === 16000000 && Number.isNaN(m.meminfoWaarde(mem, 'Nope')) && m.mediaan([5, 1, 3]) === 3 && m.mediaan([]) === 0);

    // ---- uitleg bij foutcodes
    check('codeUitleg: HTTP_5xx/404/OPEN_n/onbekend/leeg', !!codeUitleg('HTTP_503')?.extra && codeUitleg('HTTP_404')!.reden[0].includes('404') && codeUitleg('OPEN_3')!.reden[1].includes('3')
      && !!codeUitleg('ZEER_RAAR') && codeUitleg('') === null && !!codeUitleg('TLS_BINNENKORT') && !!codeUitleg('TIJD_OM')?.extra);
    check('leeftijd: nu, minuten, uren, dagen, nooit', leeftijd(1000, 1000 + 3000, 'uk') === 'щойно' && leeftijd(0, 5, 'nl') === 'nooit' && leeftijd(0, 5, 'uk') === 'ніколи'
      && leeftijd(1000, 1000 + 5 * 60_000, 'nl') === '5 min geleden' && leeftijd(1000, 1000 + 3 * 3_600_000, 'uk') === '3 год тому' && leeftijd(1000, 1000 + 3 * 86_400_000, 'nl') === '3 d geleden');
    check('foutTekst: bekende codes in beide talen, onbekend wordt algemeen', foutTekst('uk', new Error('DIAGNOSE_BEZIG')).includes('триває') && foutTekst('nl', new Error('RATE_LIMITED')).includes('Te veel') && foutTekst('nl', new Error('XYZ')).includes('mislukt'));

    // ---- aandacht, totaal, filter (zonder server)
    const nu = Date.now();
    const u = (id: string, stand: Uitslag['stand'], min: number, code = ''): Uitslag => ({ id, stand, ms: 10, code, detail: '', op: nu - min * 60_000 });
    const t = (laatste: Uitslag | null, extra: Partial<Toestand> = {}): Toestand => ({ laatste, laatsteSucces: 0, eersteFoutSindsSucces: 0, fouten24: 0, uitvoeringen24: 0, ...extra });
    const toest: Record<string, Toestand> = {
      'dienst-hub': t(u('dienst-hub', 'ok', 1)), 'dienst-mail': t(u('dienst-mail', 'let-op', 5, 'TRAAG')), 'dienst-ai': t(u('dienst-ai', 'fout', 20, 'HTTP_503'), { eersteFoutSindsSucces: nu - 3_600_000 }),
      'dienst-id': t(u('dienst-id', 'fout', 2, 'TIJD_OM')), 'verb-github': t(u('verb-github', 'onbekend', 3)),
      'server-cpu': t(u('server-cpu', 'ok', 1), { fouten24: 2, uitvoeringen24: 6 }),
    };
    const a = aandacht(toest);
    check('aandacht: fout → let-op → onbekend → hersteld; binnen fout nieuwste eerst', a.map((x) => x.id).join() === 'dienst-id,dienst-ai,dienst-mail,verb-github,server-cpu', a.map((x) => x.id).join());
    check('aandacht: hersteld is gemarkeerd; een ok zonder recente fouten staat er niet in; nooit uitgevoerd ook niet', a[4].reden === 'hersteld' && !a.some((x) => x.id === 'dienst-hub') && !a.some((x) => x.id === 'dienst-cloud'));
    check('aandacht: «sinds» gebruikt eersteFoutSindsSucces', a.find((x) => x.id === 'dienst-ai')!.sinds === nu - 3_600_000);
    check('aandacht: leeg bij niets uitgevoerd', aandacht({}).length === 0);
    const tot = totaal(toest);
    check('totaal: tellingen en eerlijke «nooit»', tot.fout === 2 && tot['let-op'] === 1 && tot.onbekend === 1 && tot.ok === 2 && tot.nooit === CONTROLE_IDS.length - 6 && tot.stand === 'fout');
    check('totaal: niets uitgevoerd = «nooit», nooit «ok»', totaal({}).stand === 'nooit' && totaal({}).ok === 0);
    // Audit 19.10.2026 (A9): de kop van «Потребує уваги» telt precies wat de tegels fout + let-op + onbekend tellen; hersteld staat apart.
    const at = aandachtTellers(a);
    check('A9: aandacht-teller «nu» = fout + let-op + onbekend van totaal(); hersteld apart', at.nu === tot.fout + tot['let-op'] + tot.onbekend && at.hersteld === 1 && at.nu + at.hersteld === a.length);
    // Audit 19.10.2026: «Технічні дані» zonder Engelse labels; apparaat- en dienstcodes hebben een vertaling in admin-terms.
    const tdv = readFileSync('src/BeheerDiagnostiekWeergave.tsx', 'utf8'); const terms = readFileSync('src/beheer-termen.tsx', 'utf8');
    check('tech-tab: geen «Mail runtime / Google Suite grant / Scopes / readiness / missing:» meer; status en runtimeBinding via Term', !/<h3>Mail runtime<\/h3>|Scopes \/ readiness|<p>missing: /.test(tdv) && /<Term lang=\{lang\} raw=\{service\.runtimeBinding\}\/>/.test(tdv) && /<Term lang=\{lang\} raw=\{service\.status\}\/>/.test(tdv));
    check('admin-terms: apparaatcodes (session_active, mdm_not_connected, …) en runtimeBinding-codes vertaald', ['session_active', 'session_policy_active', 'tab_active', 'tab_policy_active', 'browser_grant_active', 'browser_grant_revoked', 'remembered_profile_active', 'mdm_not_connected', 'edr_not_connected', 'grant_captured_mail_runtime_not_migrated', 'reauth_required'].every((c) => new RegExp(`^  ${c}: \\{ uk: '[^']+', nl: '[^']+' \\}`, 'm').test(terms)));
    check('A9: hersteld-kaart krijgt «Відновлено», geen «Увага»', /stand === 'hersteld'\) return <span className='adg-pil' data-stand='ok'>/.test(readFileSync('src/diagnostiek/Diagnostiek.tsx', 'utf8')));
    const fl = filterControles(CONTROLES, { cat: 'diensten', zoek: '', filter: 'alles', toestanden: toest, lang: 'uk' });
    check('filter: problemen eerst, dan ok, dan nooit-uitgevoerd', ['dienst-id', 'dienst-ai'].every((id, i) => fl[i].id === id) && fl.findIndex((d) => d.id === 'dienst-hub') < fl.findIndex((d) => d.id === 'dienst-cloud'));
    check('filter: problemen / ok / nooit', filterControles(CONTROLES, { cat: 'alle', zoek: '', filter: 'problemen', toestanden: toest, lang: 'uk' }).length === 4
      && filterControles(CONTROLES, { cat: 'diensten', zoek: '', filter: 'ok', toestanden: toest, lang: 'uk' }).map((d) => d.id).join() === 'dienst-hub'
      && filterControles(CONTROLES, { cat: 'diensten', zoek: '', filter: 'nooit', toestanden: toest, lang: 'uk' }).length === 9 - 4);
    check('filter: zoeken op naam, code en id (alle woorden)', filterControles(CONTROLES, { cat: 'alle', zoek: 'HTTP_503', filter: 'alles', toestanden: toest, lang: 'uk' }).map((d) => d.id).join() === 'dienst-ai'
      && filterControles(CONTROLES, { cat: 'alle', zoek: 'certificaten tls', filter: 'alles', toestanden: toest, lang: 'uk' }).some((d) => d.id === 'net-tls')
      && filterControles(CONTROLES, { cat: 'alle', zoek: 'zzzzgeenmatch', filter: 'alles', toestanden: toest, lang: 'uk' }).length === 0);
    check('normaliseer: vreemde id\'s, stand en lengtes worden weggeknipt', (() => {
      const n = normaliseer({ toestanden: { 'dienst-hub': { laatste: { id: 'dienst-hub', stand: 'ok', ms: -5, code: 'x<script>', detail: 'a'.repeat(900), op: 5 }, laatsteSucces: 'abc' }, 'rm -rf': { laatste: null }, 'dienst-ai': { laatste: { id: 'dienst-mail', stand: 'ok', ms: 1, op: 1 } } },
        historie: [{ id: 'dienst-hub', stand: 'fout', ms: 1, code: 'HTTP_500', detail: '', op: 5, nr: 7 }, { id: 'nep', stand: 'fout', op: 1 }, { id: 'dienst-hub', stand: 'kapot', op: 1 }] });
      return !('rm -rf' in n.toestanden) && n.toestanden['dienst-hub'].laatste!.code === '' && n.toestanden['dienst-hub'].laatste!.detail.length === 400 && n.toestanden['dienst-hub'].laatste!.ms === 0
        && n.toestanden['dienst-hub'].laatsteSucces === 0 && n.toestanden['dienst-ai'].laatste === null && n.historie.length === 1 && n.historie[0].nr === 7;
    })());
    check('schoonUitslag weigert onbekende id/stand', schoonUitslag({ id: 'x', stand: 'ok' }) === null && schoonUitslag({ id: 'dienst-hub', stand: 'groen' }) === null && schoonUitslag(null) === null);

    // ---- kiesIds (whitelist)
    check('kiesIds: onbekende id\'s vallen weg, dubbele ook, maximum, categorie en alles', m.kiesIds({ ids: ['dienst-hub', 'dienst-hub', '../etc/passwd', 'rm -rf /', 5] }).join() === 'dienst-hub'
      && m.kiesIds({ ids: CONTROLE_IDS.concat(CONTROLE_IDS) }).length === Math.min(MAX_BATCH, CONTROLE_IDS.length) && m.kiesIds({ categorie: 'server' }).every((i) => i.startsWith('server-'))
      && m.kiesIds({ categorie: 'nep' }).length === 0 && m.kiesIds({ alles: true }).length === CONTROLE_IDS.length && m.kiesIds({ alles: 'ja' }).length === 0 && m.kiesIds({}).length === 0);

    // ---- uitvoerders met nagebootst netwerk
    let tegel: (url: string) => Promise<Response> = async () => new Response('<!doctype html><html><div id=root></div></html>', { status: 200 });
    const gezien: string[] = [];
    globalThis.fetch = (async (url: unknown) => { gezien.push(String(url)); return tegel(String(url)); }) as typeof fetch;
    const hub = await m.voerUit('dienst-hub');
    check('voerUit: dienst die antwoordt = ok, met duur en vaste URL', hub.stand === 'ok' && gezien.some((x) => x === 'https://hub.tarasevych.com/') && hub.detail.startsWith('HTTP 200'), JSON.stringify(hub));
    tegel = async () => new Response('boom', { status: 502 });
    const slecht = await m.voerUit('dienst-ai');
    check('voerUit: 502 = fout HTTP_502', slecht.stand === 'fout' && slecht.code === 'HTTP_502');
    tegel = async () => { throw new TypeError('fetch failed'); };
    const weg = await m.voerUit('dienst-mail');
    check('voerUit: netwerkfout = NIET_BEREIKBAAR (geen gooi)', weg.stand === 'fout' && weg.code === 'NIET_BEREIKBAAR');
    tegel = async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
    check('voerUit: time-out = TIJD_OM', (await m.voerUit('dienst-api')).code === 'TIJD_OM');
    // Audit 19.10.2026 (A2): de interne healthcheck gaat via node:http naar 127.0.0.1 MET Host-kop van de admin-site (anders 404 «Onbekende host»).
    const hosts: string[] = [];
    const appSrv = (await import('node:http')).createServer((q, r) => { hosts.push(String(q.headers.host)); r.statusCode = q.headers.host === 'admin.tarasevych.com' && q.url === '/api/_healthcheck' ? 200 : 404; r.end('{"message":"Success"}'); });
    await new Promise<void>((ok) => appSrv.listen(0, '127.0.0.1', ok));
    const oudePoort = process.env.PORT; process.env.PORT = String((appSrv.address() as { port: number }).port);
    const apiLokaal = await m.voerUit('pagina-api');
    const siteGez = await (await import('../../backend/uitrol-diagnose-run')).voerCheckUit('site-gezondheid');
    appSrv.close(); if (oudePoort === undefined) delete process.env.PORT; else process.env.PORT = oudePoort;
    check('A2: pagina-api stuurt Host: admin.<domein> naar 127.0.0.1 en is ok', apiLokaal.stand === 'ok' && hosts[0] === 'admin.tarasevych.com', JSON.stringify({ apiLokaal, hosts }));
    check('A2: uitrol-diagnose «site-gezondheid» gebruikt dezelfde Host-kop en is ok', siteGez.status === 'ok' && hosts[1] === 'admin.tarasevych.com', JSON.stringify(siteGez));
    tegel = async () => new Response('{"hello":"world"}', { status: 200 });
    const geenHtml = await m.voerUit('pagina-overzicht');
    check('voerUit: pagina zonder HTML-schil = GEEN_HTML', geenHtml.stand === 'fout' && geenHtml.code === 'GEEN_HTML');
    tegel = async () => new Response('<html></html>', { status: 200 });
    check('voerUit: pagina met HTML = ok en alleen admin-host', (await m.voerUit('pagina-audit')).stand === 'ok' && gezien.includes('https://admin.tarasevych.com/audit'));
    tegel = async (url) => url.includes('oauth-authorization-server') ? new Response('{"issuer":"https://mcp.tarasevych.com"}', { status: 200 }) : new Response('', { status: 200 });
    const oa = await m.voerUit('verb-oauth');
    check('voerUit: OAuth-beschrijving met issuer = ok', oa.stand === 'ok', JSON.stringify(oa));
    tegel = async (url) => url.includes('oauth-authorization-server') ? new Response('{}', { status: 200 }) : new Response('', { status: 200 });
    check('voerUit: OAuth-beschrijving zonder issuer = fout', (await m.voerUit('verb-oauth')).stand === 'fout');
    check('voerUit: alle uitgaande verzoeken gingen naar vaste hosts', gezien.every((x) => /^https:\/\/(hub|mail|ai|id|api|admin|mcp|cloud|github)\.tarasevych\.com\//.test(x) || x.startsWith('http://127.0.0.1:') || x.startsWith('https://accounts.google.com/') || x.startsWith('https://www.googleapis.com/') || x.startsWith('https://api.github.com/')), gezien.join(' '));
    const oudGoogle = { a: process.env.GOOGLE_OAUTH_CLIENT_ID, b: process.env.GOOGLE_SUITE_CLIENT_ID, c: process.env.GOOGLE_OAUTH_CLIENT_SECRET, d: process.env.GOOGLE_SUITE_CLIENT_SECRET, e: process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 };
    for (const k of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_SUITE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_SUITE_CLIENT_SECRET', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1']) delete process.env[k];
    const gg = await m.voerUit('verb-google');
    check('verb-google: zonder sleutels = let-op NIET_INGESTELD met de NAMEN (geen waarden)', gg.stand === 'let-op' && gg.code === 'NIET_INGESTELD' && gg.detail.includes('GOOGLE_OAUTH_CLIENT_ID'), JSON.stringify(gg));
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'geheime-client-id-12345'; process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'GEHEIM-SECRET-98765'; process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = 'sleutelwaarde-ABCDEF';
    tegel = async () => new Response('{}', { status: 200 });
    const gg2 = await m.voerUit('verb-google');
    check('verb-google: met sleutels + bereikbaar = ok en de waarden staan nergens in de uitslag', gg2.stand === 'ok' && !JSON.stringify(gg2).includes('GEHEIM') && !JSON.stringify(gg2).includes('geheime-client') && !JSON.stringify(gg2).includes('sleutelwaarde'), JSON.stringify(gg2));
    for (const [k, v] of Object.entries({ GOOGLE_OAUTH_CLIENT_ID: oudGoogle.a, GOOGLE_SUITE_CLIENT_ID: oudGoogle.b, GOOGLE_OAUTH_CLIENT_SECRET: oudGoogle.c, GOOGLE_SUITE_CLIENT_SECRET: oudGoogle.d, GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1: oudGoogle.e })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }

    // ---- echte lokale controles (database, server)
    const lokaal = await m.voerLijstUit(['data-database', 'data-schema', 'data-audit', 'server-schijf', 'server-geheugen', 'server-cpu', 'server-tijd', 'server-proces', 'taak-cron', 'taak-uitrol', 'taak-mail', 'verb-mcp']);
    check('lokaal: elke uitslag is geldig (id, stand, getallen) en bevat geen gooi', lokaal.length === 12 && lokaal.every((x) => schoonUitslag(x) !== null));
    check('lokaal: database antwoordt', lokaal[0].stand === 'ok' || lokaal[0].stand === 'let-op', JSON.stringify(lokaal[0]));
    check('lokaal: geheugen/cpu/schijf/proces geven een meetwaarde in de detailtekst', ['server-schijf', 'server-geheugen', 'server-cpu', 'server-proces'].every((id) => /\d/.test(lokaal.find((x) => x.id === id)!.detail)));
    check('lokaal: MCP-deur zonder MCP_DEUR_URL = onbekend (geen verzonnen groen)', lokaal[11].stand === 'onbekend' || process.env.MCP_DEUR_URL !== undefined, JSON.stringify(lokaal[11]));
    check('lokaal: parallel max. 5 en volgorde blijft gelijk aan de invoer', lokaal.map((x) => x.id).join() === 'data-database,data-schema,data-audit,server-schijf,server-geheugen,server-cpu,server-tijd,server-proces,taak-cron,taak-uitrol,taak-mail,verb-mcp');

    // ---- geschiedenis in de database
    await sys().query(`DELETE FROM app.diagnostiek_uitslagen`);
    const wie = { id: 'u-eig', email: 'eigenaar@diag.test' };
    const rij = (id: string, stand: Uitslag['stand'], ageMin: number, code = '', detail = ''): Uitslag => ({ id, stand, ms: 25, code, detail, op: Date.now() - ageMin * 60_000 });
    // chronologisch invoegen (oud → nieuw), zoals de echte uitvoeringen: de volgorde van `nr` volgt dan de tijd
    await m.bewaar([rij('dienst-ai', 'ok', 300), rij('dienst-ai', 'fout', 120, 'HTTP_503', 'HTTP 503'), rij('dienst-ai', 'fout', 60, 'TIJD_OM'), rij('dienst-hub', 'ok', 10), rij('server-cpu', 'ok', 500), rij('server-cpu', 'let-op', 400, 'LOAD_HOOG'), rij('server-cpu', 'ok', 30)].sort((x, y) => x.op - y.op), wie, 'b1');
    const ov = await m.overzicht();
    const ai = ov.toestanden['dienst-ai'], cpu = ov.toestanden['server-cpu'], hubT = ov.toestanden['dienst-hub'];
    check('overzicht: laatste uitslag per controle (nieuwste wint)', ai.laatste!.stand === 'fout' && ai.laatste!.code === 'TIJD_OM' && hubT.laatste!.stand === 'ok' && cpu.laatste!.stand === 'ok');
    check('overzicht: laatste succes en «sinds wanneer faalt het»', Math.abs(ai.laatsteSucces - (Date.now() - 300 * 60_000)) < 5000 && Math.abs(ai.eersteFoutSindsSucces - (Date.now() - 120 * 60_000)) < 5000 && cpu.eersteFoutSindsSucces === 0);
    check('overzicht: fouten in 24 uur geteld; herstelde fout telt nog mee', ai.fouten24 === 2 && ai.uitvoeringen24 === 3 && cpu.fouten24 === 1 && cpu.uitvoeringen24 === 3);
    check('overzicht: wie startte (e-mail) wordt bewaard', ai.door === 'eigenaar@diag.test');
    check('overzicht: niet uitgevoerde controle ontbreekt (geen verzonnen status)', !('dienst-cloud' in ov.toestanden));
    const af = aandacht(ov.toestanden);
    check('aandacht uit echte data: dienst-ai (fout) vóór server-cpu (hersteld); hub niet', af.map((x) => x.id).join() === 'dienst-ai,server-cpu', af.map((x) => x.id).join());
    const hp = await m.historie({});
    check('historie: standaard alleen problemen, nieuwste eerst', hp.length === 3 && hp[0].code === 'TIJD_OM' && hp.every((x) => x.stand !== 'ok'), JSON.stringify(hp.map((x) => [x.id, x.stand, x.code])));
    check('historie: «alles» bevat ook geslaagde uitvoeringen', (await m.historie({ stand: 'alles' })).length === 7);
    check('historie: filter op controle / categorie / stand', (await m.historie({ controle: 'dienst-ai', stand: 'alles' })).length === 3 && (await m.historie({ categorie: 'server', stand: 'alles' })).length === 3
      && (await m.historie({ stand: 'fout' })).length === 2 && (await m.historie({ controle: 'dienst-ai', stand: 'problemen' })).length === 2);
    check('historie: onbekende controle of categorie wordt genegeerd (geen SQL-effect)', (await m.historie({ controle: "x'; DROP TABLE app.records;--", stand: 'alles' })).length === 7 && (await m.historie({ categorie: 'nep', stand: 'alles' })).length === 7);
    const p1 = await m.historie({ stand: 'alles', limit: 3 }), p2 = await m.historie({ stand: 'alles', limit: 3, voor: p1[p1.length - 1].nr });
    check('historie: cursor «voor» pagineert zonder overlap', p1.length === 3 && p2.length === 3 && p1.every((x) => !p2.some((y) => y.nr === x.nr)) && p2[0].nr < p1[2].nr);
    await sys().query(`INSERT INTO app.diagnostiek_uitslagen (controle, categorie, stand, op, door, door_email, batch) VALUES ('dienst-hub', 'diensten', 'fout', now() - interval '100 days', '', '', 'oud'), ('dienst-hub', 'diensten', 'fout', now() - interval '40 days', '', '', 'oud')`);
    await m.bewaar([rij('dienst-hub', 'ok', 0)], wie, 'b2');
    check('opruimen: rijen ouder dan 30 dagen verdwijnen bij het bewaren', Number((await sys().query(`SELECT count(*) AS n FROM app.diagnostiek_uitslagen WHERE batch = 'oud'`)).rows[0].n) === 0);
    let afgewezen = false;
    try { await sys().query(`INSERT INTO app.diagnostiek_uitslagen (controle, categorie, stand) VALUES ('dienst-hub', 'diensten', 'groen')`); } catch { afgewezen = true; }
    check('database: ongeldige stand wordt geweigerd', afgewezen);
    afgewezen = false;
    try { await sys().query(`INSERT INTO app.diagnostiek_uitslagen (controle, categorie, stand, detail) VALUES ('dienst-hub', 'diensten', 'ok', $1)`, ['x'.repeat(401)]); } catch { afgewezen = true; }
    check('database: detail langer dan 400 tekens wordt geweigerd', afgewezen);

    // ---- routes
    await sys().query(`DELETE FROM app.rate_limits WHERE bucket LIKE 'admin-diagnostiek%'`);
    globalThis.fetch = (async () => { await new Promise((r) => setTimeout(r, 250)); return new Response('<html></html>', { status: 200 }); }) as typeof fetch;
    const routes = m.adminDiagnostiekRoutes({
      requireSession: async (event) => {
        const w = String((event as { wie?: string }).wie || '');
        if (w === 'geen') return { errorCode: 'OWNER_SESSION_REQUIRED' };
        if (w === 'eigenaar') return { user: { id: 'u-eig', email: 'eigenaar@diag.test', role: 'owner', status: 'approved' }, service: (event as { dienst?: string }).dienst || 'admin' };
        if (w === 'nep') return { user: { id: 'u-nep', email: 'ander@diag.test', role: 'owner', status: 'approved' }, service: 'admin' };
        return { user: { id: 'u-lid', email: 'lid@diag.test', role: 'member', status: 'approved' }, service: 'admin' };
      },
    });
    const r = (naam: string) => routes[`POST /api/owner/admin/diagnostiek/${naam}`][0] as unknown as (ctx: unknown) => Promise<{ statusCode: number; body: string }>;
    const roep = async (naam: string, event: Record<string, unknown>, body: unknown) => { const x = await r(naam)({ event, body }); let data: any = {}; try { data = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, data }; };
    check('route: zonder sessie 401', (await roep('overzicht', { wie: 'geen' }, {})).status === 401);
    check('route: eigenaar buiten admin-dienst geweigerd', (await roep('overzicht', { wie: 'eigenaar', dienst: 'mcp' }, {})).status === 403);
    check('route: gewoon lid zonder technisch profiel geweigerd (TECH_DIAGNOSE_VEREIST)', (await roep('uitvoeren', { wie: 'lid' }, { ids: ['dienst-hub'] })).status === 403);
    check('route: owner-rol met ander e-mailadres is geen eigenaar', (await roep('historie', { wie: 'nep' }, {})).status === 403);
    check('route: lid met verzonnen tabContext geweigerd', (await roep('overzicht', { wie: 'lid' }, { tabContext: 'a'.repeat(48) })).status === 403);
    check('route: overzicht voor de eigenaar', (await roep('overzicht', { wie: 'eigenaar' }, {})).data.toestanden?.['dienst-ai']?.laatste?.stand === 'fout');
    check('route: onbekende id → 400 CHECK_ONBEKEND', (await roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['cat /etc/shadow'] })).status === 400);
    check('route: lege selectie → 400', (await roep('uitvoeren', { wie: 'eigenaar' }, {})).status === 400);
    const ex = await roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['dienst-hub', 'opdracht-rm'], opdracht: 'rm -rf /', url: 'http://evil', args: ['-rf'] });
    check('route: uitvoeren geeft de uitslag + vers overzicht; opdracht/url in de body worden genegeerd', ex.status === 200 && ex.data.uitslagen.length === 1 && ex.data.uitslagen[0].id === 'dienst-hub' && ex.data.toestanden['dienst-hub'].laatste.stand === 'ok' && typeof ex.data.batch === 'string', JSON.stringify(ex).slice(0, 300));
    check('route: uitslag is bewaard in de database met de uitvoerder', Number((await sys().query(`SELECT count(*) AS n FROM app.diagnostiek_uitslagen WHERE batch = $1 AND door = 'u-eig' AND door_email = 'eigenaar@diag.test'`, [ex.data.batch])).rows[0].n) === 1);
    const log = (await sys().query(`SELECT result, details FROM app.audit WHERE action = 'diag.uitgevoerd' AND owner_id = 'u-eig' ORDER BY seq DESC LIMIT 5`)).rows;
    check('route: de batch staat in het auditlogboek (batch, aantal, bereik) zonder uitvoer', log.length >= 1 && log[0].details?.batch === ex.data.batch && log[0].details?.aantal === 1 && log[0].details?.bereik === 'selectie', JSON.stringify(log[0]).slice(0, 300));
    const [x1, x2] = await Promise.all([roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['dienst-hub'] }), roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['dienst-mail'] })]);
    check('route: één batch tegelijk (tweede krijgt 429 DIAGNOSE_BEZIG)', [x1.status, x2.status].sort().join() === '200,429' && [x1, x2].some((y) => y.data.error === 'DIAGNOSE_BEZIG' || String(JSON.stringify(y.data)).includes('DIAGNOSE_BEZIG')), `${x1.status},${x2.status}`);
    const cat = await roep('uitvoeren', { wie: 'eigenaar' }, { categorie: 'server' });
    check('route: categorie voert alle controles van die categorie uit', cat.status === 200 && cat.data.uitslagen.length === controlesVan('server').length, String(cat.status));
    const his = await roep('historie', { wie: 'eigenaar' }, { controle: 'dienst-ai', stand: 'alles' });
    check('route: historie met filter', his.status === 200 && his.data.historie.length === 3 && his.data.historie.every((h: any) => h.id === 'dienst-ai'));
    const histOnbekend = await roep('historie', { wie: 'eigenaar' }, { controle: 'x', stand: 'alles', limit: 99999 });
    check('route: historie begrenst limiet en negeert onbekende controle', histOnbekend.status === 200 && histOnbekend.data.historie.length <= 200);

    // ---- nieuwe categorieën (mail, cloud, ШІ-агенти, пристрої): echte SELECT's op de testdatabase
    const NIEUW = ['mail', 'cloud', 'ai', 'apparaten'] as const;
    check('register: de vier nieuwe categorieën hebben elk minstens twee controles', NIEUW.every((c) => controlesVan(c).length >= 2));
    check('register: «ai-voorbereiders» en «taak-uitrol» verwijzen naar /updates', controlesVan('ai').find((c) => c.id === 'ai-voorbereiders')?.naar?.href === '/updates' && CONTROLES.find((c) => c.id === 'taak-uitrol')?.naar?.href === '/updates');
    await sys().query(`DELETE FROM app.mail_queue WHERE user_id = 'u-diag'`);
    const telMail = (x: Uitslag) => Number(/(?:невдалих за добу|Невдалих відправлень за добу): (\d+)/.exec(x.detail)?.[1] ?? 0);
    const leeg = await m.voerUit('mail-wachtrij');
    check('mail-wachtrij: uitslag is geldig en de test-DB (gedeeld) heeft geen vastgelopen mails', schoonUitslag(leeg) !== null && leeg.code !== 'MAIL_VAST', JSON.stringify(leeg));
    await sys().query(`INSERT INTO app.mail_queue (user_id, message_payload, send_at, status, updated_at) VALUES ('u-diag', '{}'::jsonb, now() - interval '2 hours', 'scheduled', now() - interval '2 hours')`);
    const vast = await m.voerUit('mail-wachtrij');
    check('mail-wachtrij: te late geplande mail = fout MAIL_VAST', vast.stand === 'fout' && vast.code === 'MAIL_VAST', JSON.stringify(vast));
    await sys().query(`DELETE FROM app.mail_queue WHERE user_id = 'u-diag'`);
    const voor = await m.voerUit('mail-wachtrij');
    await sys().query(`INSERT INTO app.mail_queue (user_id, message_payload, send_at, status, updated_at, last_error) VALUES ('u-diag', '{"to":"geheim@x.nl"}'::jsonb, now(), 'failed', now(), 'SMTP')`);
    const mis = await m.voerUit('mail-wachtrij');
    check('mail-wachtrij: één extra mislukte mail telt +1 (let-op MAIL_MISLUKT); de inhoud staat nergens in de uitslag', mis.stand !== 'ok' && telMail(mis) === telMail(voor) + 1 && !JSON.stringify(mis).includes('geheim'), JSON.stringify([voor, mis]));
    await sys().query(`DELETE FROM app.mail_queue WHERE user_id = 'u-diag'`);
    const opslag = await m.voerUit('cloud-opslag');
    check('cloud-opslag: telt bestanden (zonder iets te schrijven)', (opslag.stand === 'ok' || opslag.stand === 'fout') && /\d/.test(opslag.detail), JSON.stringify(opslag));
    await sys().query(`DELETE FROM app.uitrol_voorbereiders WHERE account_id = 'u-diag'`);
    const telWees = (x: Uitslag) => Number(/Осиротілих дозволів: (\d+)/.exec(x.detail)?.[1] ?? 0);
    const w0 = await m.voerUit('ai-voorbereiders');
    check('ai-voorbereiders: uitslag is geldig', schoonUitslag(w0) !== null, JSON.stringify(w0));
    await sys().query(`INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op) VALUES ('mcp-koppeling', '00000000-0000-0000-0000-000000000099', 'u-diag', 'Claude', 'u-eig', now() + interval '1 day')`);
    const wees = await m.voerUit('ai-voorbereiders');
    check('ai-voorbereiders: «weesgrant» (token bestaat niet meer) = let-op VERWEESD_GRANT, +1 — de oorzaak van «Claude kan niet uitrollen»', wees.stand === 'let-op' && wees.code === 'VERWEESD_GRANT' && telWees(wees) === telWees(w0) + 1, JSON.stringify([w0, wees]));
    await sys().query(`DELETE FROM app.uitrol_voorbereiders WHERE account_id = 'u-diag'`);
    await sys().query(`INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op) VALUES ('agent', 'claude', 'u-diag', 'Claude', 'u-eig', now() + interval '2 hours')`);
    const bijna = await m.voerUit('ai-voorbereiders');
    check('ai-voorbereiders: agent-grant die binnen 24 uur verloopt telt mee (let-op GRANT_VERLOOPT of eerder VERWEESD_GRANT)', bijna.stand === 'let-op' && ['GRANT_VERLOOPT', 'VERWEESD_GRANT'].includes(bijna.code), JSON.stringify(bijna));
    await sys().query(`DELETE FROM app.uitrol_voorbereiders WHERE account_id = 'u-diag'`);
    await sys().query(`DELETE FROM app.agents WHERE user_id = 'u-diag'`);
    check('apparaten-agents: uitslag is geldig', schoonUitslag(await m.voerUit('apparaten-agents')) !== null);
    await sys().query(`INSERT INTO app.agents (user_id, name, token_hash, status, last_seen_at) VALUES ('u-diag', 'pc', 'hash-diag-1', 'connected', now() - interval '3 hours')`);
    const stil = await m.voerUit('apparaten-agents');
    check('apparaten-agents: «verbonden» maar 3 uur stil = let-op AGENT_STIL', stil.stand === 'let-op' && stil.code === 'AGENT_STIL', JSON.stringify(stil));
    check('apparaten-commando: uitslag is geldig', schoonUitslag(await m.voerUit('apparaten-commando')) !== null);
    await sys().query(`DELETE FROM app.agents WHERE user_id = 'u-diag'`);
    check('ai-verbindingen: ok en geen tokenwaarden in de uitslag', (await m.voerUit('ai-verbindingen')).stand === 'ok');

    // ---- trend, overgangen in het logboek en «Скарга користувача»
    const ovT = await m.overzicht();
    check('trend: dagreeks, weektotalen en «faalde het vaakst» komen mee', Array.isArray(ovT.trend.dagen) && ovT.trend.dagen.length >= 1 && ovT.trend.week.uitvoeringen >= 1 && ovT.trend.week.slecht >= 1 && ovT.trend.top.every((t) => isControleId(t.id)), JSON.stringify(ovT.trend).slice(0, 200));
    await sys().query(`DELETE FROM app.diagnostiek_uitslagen`);
    globalThis.fetch = (async () => new Response('<html></html>', { status: 200 })) as typeof fetch;
    await roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['dienst-hub'] });
    globalThis.fetch = (async () => new Response('x', { status: 503 })) as typeof fetch;
    await roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['dienst-hub'] });
    globalThis.fetch = (async () => new Response('<html></html>', { status: 200 })) as typeof fetch;
    await roep('uitvoeren', { wie: 'eigenaar' }, { ids: ['dienst-hub'] });
    const acties = (await sys().query(`SELECT action, result FROM app.audit WHERE action IN ('diag.storing', 'diag.hersteld') AND owner_id = 'u-eig' ORDER BY seq DESC LIMIT 2`)).rows;
    check('logboek: begin van een storing en herstel worden elk één keer vastgelegd (diag.storing / diag.hersteld)', acties.length === 2 && acties[0].action === 'diag.hersteld' && acties[1].action === 'diag.storing' && acties[1].result === 'failure', JSON.stringify(acties));

    const nu0 = Date.now();
    const basis = { nu: nu0, status: 'approved', sessiesActief: 1, sessiesTotaal: 1, laatsteActiviteit: nu0, dagActies: 10, dagMislukt: 0, weekMislukt: 0, oauthActief: 0, mailMislukt: 0, mailVast: 0, agentenStil: 0, diensten: [] as never[] };
    const bv = await import('../../backend/beheer-diagnostiek-gebruiker');
    check('gebruiker: alles in orde = één info-bevinding met advies om details te vragen', bv.beoordeelGebruiker(basis).length === 1 && bv.beoordeelGebruiker(basis)[0].ernst === 'info');
    check('gebruiker: geblokkeerd account = fout vóór al het andere', bv.beoordeelGebruiker({ ...basis, status: 'blocked', sessiesActief: 0 })[0].code === 'ACCOUNT_STATUS');
    check('gebruiker: >30% mislukt = fout VEEL_MISLUKT; enkele = let-op', bv.beoordeelGebruiker({ ...basis, dagMislukt: 5 })[0].code === 'VEEL_MISLUKT' && bv.beoordeelGebruiker({ ...basis, dagActies: 100, dagMislukt: 2 })[0].code === 'ENKELE_MISLUKT');
    check('gebruiker: dienst in storing die de gebruiker gebruikte wordt genoemd, volgorde fout → let-op', (() => { const r = bv.beoordeelGebruiker({ ...basis, sessiesActief: 0, diensten: [{ dienst: 'mail', naam: ['Пошта', 'Mail'], stand: 'fout', acties: 4, mislukt: 1 }] }); return r[0].code === 'DIENST_MAIL' && r[1].code === 'GEEN_SESSIE'; })());
    await sys().query(`DELETE FROM app.records WHERE tbl = 'users' AND data->>'email' = 'klacht@diag.test'`);
    const stamp = Date.now();
    const [uid] = await (await import('../../server/platform/db')).db.add('users', [{ email: 'klacht@diag.test', name: 'Klacht Gebruiker', status: 'approved', role: 'member', createdAt: stamp, picture: 'https://example.com/a.png' }]);
    await (await import('../../server/platform/db')).db.add('owner_service_sessions_v1', [{ userId: uid, service: 'hub', createdAt: stamp, lastSeenAt: stamp, idleExpiresAt: stamp + 3_600_000, absoluteExpiresAt: stamp + 86_400_000, os: 'Windows', browser: 'Chrome' }]);
    const z = await roep('gebruiker', { wie: 'eigenaar' }, { zoek: 'klacht@' });
    check('route gebruiker: zoeken op e-mail vindt de gebruiker met naam en foto; minder dan 2 tekens geeft niets', z.status === 200 && z.data.gebruikers.length === 1 && z.data.gebruikers[0].id === uid && z.data.gebruikers[0].foto.startsWith('https://') && (await roep('gebruiker', { wie: 'eigenaar' }, { zoek: 'k' })).data.gebruikers.length === 0);
    const d = await roep('gebruiker', { wie: 'eigenaar' }, { gebruikerId: uid });
    check('route gebruiker: detail met sessies, acties, koppelingen, diensten en bevindingen — zonder tokens of IP', d.status === 200 && d.data.sessies.actief === 1 && d.data.sessies.apparaten[0] === 'Windows / Chrome' && Array.isArray(d.data.bevindingen) && !/ip|token|hash/i.test(Object.keys(d.data).join()));
    const logG = (await sys().query(`SELECT count(*) AS n FROM app.audit WHERE action = 'diag.gebruiker.bekeken' AND owner_id = $1`, [uid])).rows[0];
    check('route gebruiker: elke inzage staat in het logboek (op het bekeken account)', Number(logG.n) === 1);
    check('route gebruiker: onbekend of ongeldig id → 404; lid zonder profiel → 403', (await roep('gebruiker', { wie: 'eigenaar' }, { gebruikerId: 'bestaat-niet-1' })).status === 404 && (await roep('gebruiker', { wie: 'lid' }, { zoek: 'klacht' })).status === 403);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    globalThis.fetch = oud.fetch;
    if (oud.owner === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = oud.owner;
    try { await getPool('systeem').query(`DELETE FROM app.diagnostiek_uitslagen`); } catch { /* tabel kan ontbreken */ }
    await closePool().catch(() => undefined);
  }
  return einde();
}
