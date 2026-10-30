// Punt 4 (audit 19.10.2026): STRIKTE scheiding van de twee webruimtes (profielen).
//  • Wie in het technische deel zit, kan niet met het gebruikersdeel werken en omgekeerd; de enige overgang is bewust van profiel
//    of account wisselen.
//  • Menu, kleuren, volgorde en snelle toegang zijn per profiel apart (en per account — zie menu-per-account-20261019).
//  • Het technisch profiel kan ELK deel van de site voor zichzelf aanzetten; een gewoon profiel alleen wat iedere gebruiker heeft
//    (dezelfde regel als altijd: account-rechten.ts → dienstToegestaan).
//  • Dit geldt óók voor beheerders en de EIGENAAR.
//  • En de SERVER stelt het vast, niet alleen de browser: de technische indeling is alleen te lezen en te schrijven met een
//    LOPENDE technische activering in DIT tabblad (backend/tech-profiel.ts).
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import * as tp from '../../backend/tech-profiel';
import { isBeheerPagina, paginaZichtbaar } from '../../shared/beheer-paginas';
import { menuWeergave } from '../../shared/menu-indeling';
import { normaliseerZijbalk } from '../../shared/menu-model';
import { accountRechten, dienstToegestaan } from '../../src/account-rechten';
import { TECH_MENU, isSiteBeheer, menuVoorOppervlak, defaultMenuPreferences, menuPreferencesForRole } from '../../src/menu-voorkeuren';

const ORIGIN = 'https://hub.tarasevych.com';
const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
type Verzoek = { url: string; body: Record<string, unknown> };

function nepBrowser(verzoeken: Verzoek[]) {
  const g = globalThis as Record<string, unknown>;
  const u = new URL(`${ORIGIN}/overview`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: '', hash: '', protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.localStorage = opslag(); g.sessionStorage = opslag();
  g.window = Object.assign(g, { name: '', innerWidth: 1280, innerHeight: 800, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, setTimeout, clearTimeout, setInterval, clearInterval, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, head: { appendChild: () => undefined }, createElement: () => ({ setAttribute: () => undefined, getAttribute: () => null, dataset: {} }), documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  g.fetch = async (url: unknown, init?: { body?: string }) => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>; } catch { /* geen json */ }
    verzoeken.push({ url: String(url), body });
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => JSON.stringify({ ok: true, sidebar: body.sidebar ?? null }) } as unknown as Response;
  };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('profiel-isolatie-20261019');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const eigenaar = `pi-eig-${T}@example.test`, gewoon = `pi-gew-${T}@example.test`;

  // ================================================================ 1. de regel zelf (puur, browser én server delen hem)
  const eigenaarRechten = accountRechten({ role: 'owner', entitlements: [] });
  check('gewoon profiel: geen beheer, ook niet voor de eigenaar — alleen wat iedere gebruiker heeft',
    !dienstToegestaan('admin', eigenaarRechten, false) && !dienstToegestaan('api', eigenaarRechten, false) && dienstToegestaan('hub', eigenaarRechten, false) && dienstToegestaan('mail', eigenaarRechten, false));
  check('technisch profiel: elk deel van de site is voor zichzelf aan te zetten',
    ['admin', 'api', 'mcp', 'hub', 'mail', 'cloud'].every((d) => dienstToegestaan(d, eigenaarRechten, true)));
  check('«міст ШІ → сайт» (mcp) vraagt het recht api-platform of een technisch profiel',
    !dienstToegestaan('mcp', accountRechten({ role: 'user' }), false) && dienstToegestaan('mcp', accountRechten({ role: 'user', entitlements: ['api-platform'] }), false) && dienstToegestaan('mcp', accountRechten({ role: 'user' }), true));
  const alles = menuPreferencesForRole(defaultMenuPreferences().map((i) => ({ ...i, visible: true })), 'owner');
  const accountMenu = menuVoorOppervlak(alles, 'account'), techMenu = menuVoorOppervlak(alles, 'technisch');
  check('menu van het gebruikersdeel bevat nooit beheer (ook niet als de eigenaar het aanzet)', !accountMenu.some((i) => isSiteBeheer(i.id) || i.id === 'mcp'));
  check('menu van het technische deel bevat alleen beheer, nooit gebruikersdiensten', techMenu.map((i) => i.id).join() === TECH_MENU.join() && !techMenu.some((i) => ['hub', 'mail', 'cloud', 'github', 'identity'].includes(i.id)));

  // ---- snelle toegang en kopieën steken nooit over
  const voorkeur = normaliseerZijbalk({
    kopieen: [
      { id: 'k-beh00001', item: 'pg:admin/updates', plaats: 'snelbalk', volgorde: 0, kleur: 'rood' },
      { id: 'k-geb00001', item: 'pg:mail/inbox', plaats: 'snelbalk', volgorde: 1, kleur: 'blauw' },
      { id: 'k-mcp00001', item: 'pg:mcp/dashboard', plaats: 'snelbalk', volgorde: 2 },
    ],
  });
  const gebBasis = { diensten: accountMenu.filter((i) => i.visible).map((i) => i.id), toegestaan: accountMenu.map((i) => i.id) };
  const techBasis = { diensten: techMenu.map((i) => i.id), toegestaan: techMenu.map((i) => i.id) };
  const gebSnel = menuWeergave(voorkeur, gebBasis).snelbalk.filter((r) => !r.pagina || paginaZichtbaar(r.dienst, r.pagina, false));
  const techSnel = menuWeergave(voorkeur, techBasis).snelbalk.filter((r) => isSiteBeheer(r.dienst) || (!!r.pagina && isBeheerPagina(r.dienst, r.pagina)));
  check('gebruikersdeel: geen enkele beheerknop in de snelle toegang (ook niet als kopie, ook niet met eigen kleur)',
    !gebSnel.some((r) => isSiteBeheer(r.dienst) || (!!r.pagina && isBeheerPagina(r.dienst, r.pagina))) && gebSnel.some((r) => r.item === 'pg:mail/inbox'), gebSnel.map((r) => r.item).join(','));
  check('technisch deel: geen enkele gebruikersknop in de snelle toegang',
    !techSnel.some((r) => r.item === 'pg:mail/inbox') && techSnel.some((r) => r.item === 'pg:admin/updates'), techSnel.map((r) => r.item).join(','));
  check('eigen kleuren gaan mee met hun eigen ruimte (rood bij beheer, blauw bij post)',
    techSnel.find((r) => r.item === 'pg:admin/updates')?.accent === 'rood' && gebSnel.find((r) => r.item === 'pg:mail/inbox')?.accent === 'blauw');

  // ================================================================ 2. de SERVER stelt het vast
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  type B = ReturnType<typeof G.browser>;
  const opslaan = (b: B, sidebar: unknown, ruimte?: string) => b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar, ...(ruimte === undefined ? {} : { ruimte }) }));
  const lezen = (b: B, ruimte?: string) => b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar', b.ctxBody('identity', ruimte === undefined ? {} : { ruimte }));
  const bootstrapZijbalk = async (b: B) => (await b.verzoek('id.tarasevych.com', '/api/owner/ui/preferences', b.ctxBody('identity'))).data.sidebar;
  try {
    const b = G.browser();
    await b.aanmelden(`sub-pi-eig-${T}`, eigenaar, { service: 'identity', intent: 'login' });
    const eigRij = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0];
    const eigUser = { id: String(eigRij?.id || ''), email: eigenaar, role: 'owner', status: 'approved' };

    // ---- zonder lopend technisch profiel: de technische indeling bestaat niet voor dit verzoek
    const weigerSchrijf = await opslaan(b, { modus: 'dicht' }, 'technisch');
    check('eigenaar ZONDER lopend technisch profiel: technische indeling opslaan → 403 TECH_PROFIEL_VEREIST',
      weigerSchrijf.status === 403 && JSON.stringify(weigerSchrijf.data).includes('TECH_PROFIEL_VEREIST'), `${weigerSchrijf.status} ${weigerSchrijf.body.slice(0, 120)}`);
    const weigerLees = await lezen(b, 'technisch');
    check('eigenaar ZONDER lopend technisch profiel: technische indeling lezen → 403 (de ene ruimte leest de andere niet uit)',
      weigerLees.status === 403 && JSON.stringify(weigerLees.data).includes('TECH_PROFIEL_VEREIST'), `${weigerLees.status} ${weigerLees.body.slice(0, 120)}`);
    const rommel = await opslaan(b, { modus: 'open' }, 'eigenaar');
    check('onbekende ruimte → 403 (geen stille val terug naar een andere ruimte)', rommel.status === 403, `${rommel.status} ${rommel.body.slice(0, 120)}`);

    // ---- gebruikersruimte: gewoon toegestaan, ook zonder technisch profiel
    const gebOk = await opslaan(b, { modus: 'dicht', icoonStijl: 'kleur', items: { 'pg:mail/inbox': { plaats: 'snelbalk', volgorde: 0, kleur: 'blauw' } } });
    check('gebruikersruimte opslaan (standaard, zonder veld «ruimte»): 200 en ruimte «gebruiker»',
      gebOk.status === 200 && gebOk.data.ruimte === 'gebruiker' && gebOk.data.sidebar?.modus === 'dicht' && gebOk.data.sidebar?.items?.['pg:mail/inbox']?.kleur === 'blauw', `${gebOk.status} ${gebOk.body.slice(0, 180)}`);
    check('bootstrap (/ui/preferences) geeft de GEBRUIKERSruimte', (await bootstrapZijbalk(b))?.modus === 'dicht');
    check('gebruikersruimte lezen via /ui/sidebar: dezelfde indeling', (await lezen(b)).data.sidebar?.modus === 'dicht');

    // ---- met een LOPENDE activering in DIT tabblad: eigen technische indeling
    await tp.activeren(eigUser, b.tab, 60, 'eenheidstest profielscheiding');
    const techOk = await opslaan(b, { modus: 'open', icoonStijl: 'klassiek', items: { 'pg:admin/updates': { plaats: 'snelbalk', volgorde: 0, kleur: 'rood' } } }, 'technisch');
    check('met lopend technisch profiel: technische indeling opslaan 200, ruimte «technisch»',
      techOk.status === 200 && techOk.data.ruimte === 'technisch' && techOk.data.sidebar?.modus === 'open' && techOk.data.sidebar?.items?.['pg:admin/updates']?.kleur === 'rood', `${techOk.status} ${techOk.body.slice(0, 180)}`);
    const techGelezen = await lezen(b, 'technisch');
    check('technische indeling lezen: alleen de technische stand', techGelezen.status === 200 && techGelezen.data.sidebar?.modus === 'open' && !techGelezen.data.sidebar?.items?.['pg:mail/inbox']);
    check('de gebruikersruimte is NIET veranderd door het opslaan van het technische profiel',
      (await bootstrapZijbalk(b))?.modus === 'dicht' && (await bootstrapZijbalk(b))?.items?.['pg:mail/inbox']?.kleur === 'blauw');
    const gebNa = await opslaan(b, { modus: 'auto' });
    check('en omgekeerd: de gebruikersruimte opslaan laat de technische indeling staan',
      gebNa.status === 200 && gebNa.data.sidebar?.modus === 'auto' && (await lezen(b, 'technisch')).data.sidebar?.modus === 'open');
    check('de bootstrap bevat nooit de technische indeling (geen enkel beheerpunt)', !JSON.stringify(await bootstrapZijbalk(b)).includes('admin'));

    // ---- de activering is aan DIT tabblad gebonden: een ander tabblad van hetzelfde account krijgt niets technisch
    const b2 = G.browser();
    b2.jar.clear(); for (const [k, v] of b.jar) b2.jar.set(k, v); // zelfde browser/sessie, ander tabblad
    const anderTab = await lezen(b2, 'technisch');
    check('ander tabblad zonder eigen activering: technische indeling geweigerd (ook voor de eigenaar)', anderTab.status === 403, `${anderTab.status} ${anderTab.body.slice(0, 120)}`);

    // ---- een gewoon (goedgekeurd) account heeft geen technisch profiel en ziet niets van de eigenaar
    const b3 = G.browser();
    await b3.aanmelden(`sub-pi-gew-${T}`, gewoon, { service: 'identity', intent: 'login' });
    const gewId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [gewoon])).rows[0]?.id as string | undefined;
    if (gewId) await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where id=$1", [gewId]);
    const gewTech = await lezen(b3, 'technisch');
    check('gewoon account: technische indeling geweigerd', gewTech.status === 403 || gewTech.status === 401, `${gewTech.status} ${gewTech.body.slice(0, 120)}`);
    const gewGeb = await lezen(b3);
    check('gewoon account: eigen (lege) gebruikersruimte, nooit die van de eigenaar',
      gewGeb.status === 200 && gewGeb.data.sidebar?.modus === 'auto' && !gewGeb.data.sidebar?.items?.['pg:mail/inbox'], `${gewGeb.status} ${gewGeb.body.slice(0, 160)}`);
    const rijen = (await pool.query("select data->'sidebar' as s from app.records where tbl='owner_ui_preferences_v1' and data->>'userId'=$1", [eigUser.id])).rows[0]?.s as { versie?: number; gebruiker?: unknown; technisch?: unknown } | undefined;
    check('database: één veld «sidebar» met BEIDE ruimtes apart (versie 2)', rijen?.versie === 2 && !!rijen?.gebruiker && !!rijen?.technisch, JSON.stringify(rijen).slice(0, 120));
  } catch (e) {
    check('onverwachte fout (server)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar, gewoon]])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await getPool('systeem').query('delete from app.tech_activaties where user_id = any($1)', [ids]).catch(() => undefined);
      await getPool('systeem').query('delete from app.tech_profielen where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    }
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }

  // ================================================================ 3. de BROWSER houdt de twee ruimtes gescheiden
  const verzoeken: Verzoek[] = [];
  nepBrowser(verzoeken);
  const z = await import('../../src/zijbalk-voorkeuren');
  z.zijbalkVanServer({ modus: 'dicht', items: { 'pg:mail/inbox': { plaats: 'snelbalk', volgorde: 0, kleur: 'blauw' } } }, { service: 'hub', scope: 'eigenaar-1' });
  check('start in de gebruikersruimte', z.zijbalkHuidigeRuimte() === 'gebruiker' && z.zijbalkVoorkeuren().modus === 'dicht');
  z.zijbalkRuimte('technisch');
  await wacht(50); // de technische indeling wordt apart bij de server gehaald (/api/owner/ui/sidebar, ruimte «technisch»)
  const techLezen = verzoeken.filter((r) => r.url.includes('/api/owner/ui/sidebar') && !r.url.includes('/save'));
  check('de technische indeling wordt APART bij de server gehaald (nooit via de bootstrap)', techLezen.length === 1 && techLezen[0].body.ruimte === 'technisch', verzoeken.map((r) => r.url).join(', '));
  check('naar het technische profiel: eigen, lege indeling — niets van de gebruikersruimte',
    z.zijbalkHuidigeRuimte() === 'technisch' && z.zijbalkVoorkeuren().modus === 'auto' && !z.zijbalkVoorkeuren().items['pg:mail/inbox']);
  verzoeken.length = 0;
  z.zetZijbalk({ modus: 'open', icoonStijl: 'kleur' });
  await wacht(600);
  const techOpslag = verzoeken.filter((r) => r.url.includes('/api/owner/ui/sidebar/save'));
  check('een wijziging in het technische profiel wordt als ruimte «technisch» opgeslagen', techOpslag.length === 1 && techOpslag[0].body.ruimte === 'technisch' && (techOpslag[0].body.sidebar as { modus?: string }).modus === 'open');
  z.zijbalkRuimte('gebruiker');
  check('terug in de gebruikersruimte: de oude indeling staat er nog, ongemoeid door het technische profiel',
    z.zijbalkVoorkeuren().modus === 'dicht' && z.zijbalkVoorkeuren().items['pg:mail/inbox']?.kleur === 'blauw' && z.zijbalkVoorkeuren().icoonStijl === 'klassiek');
  check('beide ruimtes staan apart in dezelfde cache van dít account', z.zijbalkRuimtes().technisch.modus === 'open' && z.zijbalkRuimtes().gebruiker.modus === 'dicht' && z.zijbalkRuimtes().versie === 2);
  verzoeken.length = 0;
  z.zetZijbalk({ modus: 'auto' });
  await wacht(600);
  const gebOpslag = verzoeken.filter((r) => r.url.includes('/api/owner/ui/sidebar/save'));
  check('een wijziging in de gebruikersruimte wordt als ruimte «gebruiker» opgeslagen en raakt het technische profiel niet',
    gebOpslag.length === 1 && gebOpslag[0].body.ruimte === 'gebruiker' && z.zijbalkRuimtes().technisch.modus === 'open');

  // ---- de bron: de server bepaalt de ruimte, niet de browser
  const srv = readFileSync('backend/index.ts', 'utf8');
  check('server: ownerMenuRuimte laat «technisch» alleen toe met een lopende activering in dit tabblad',
    /const ownerMenuRuimte=async\(/.test(srv) && /techActieveActivatie\(auth\.user\.id,String\(b\.tabContext\|\|''\),sessie\)\)\?'technisch':null/.test(srv));
  // 20.10.2026: naast de twee menuroutes gaan ook de twee routes van het uiterlijk door deze poort. Daarom niet meer op een vast
  // aantal controleren, maar op de regel zelf: ELKE route die een ruimte kiest, weigert zonder profiel met 403.
  const poorten = (srv.match(/const ruimte=await ownerMenuRuimte\(auth,ctx\.body\)/g) || []).length;
  const met403 = (srv.match(/const ruimte=await ownerMenuRuimte\(auth,ctx\.body\);if\(!ruimte\)return error\('TECH_PROFIEL_VEREIST',403\)/g) || []).length;
  check('server: elke route die een ruimte kiest (menu én uiterlijk) gaat door die poort, met 403 TECH_PROFIEL_VEREIST',
    poorten >= 2 && poorten === met403, `${met403}/${poorten}`);
  check('server: opslaan vervangt ALLEEN de gevraagde ruimte (metRuimte), lezen geeft alleen die ruimte (ruimteVoorkeuren)',
    /const sidebar=metRuimte\(current\?\.sidebar,ruimte,value\)/.test(srv) && /return ruimteVoorkeuren\(row\?\.sidebar,ruimte\)/.test(srv) && /sidebar:row\?\.sidebar\?ruimteVoorkeuren\(row\.sidebar,'gebruiker'\)/.test(srv));

  await closePool();
  return einde();
}
