// Punt 15 van de eigenaarslijst (19.10.2026). De eigenaar startte «Перевірка всіх адрес» over ≈19 731 berichten; bij 5 050 stopte
// ze met «Не вдалося (HTTP_502)». Klachten: geen keuze «продовжити / пропустити» (alleen «Продовжити» en «Відкрити»), het venster
// kwam steeds terug en moest ≈101 keer met de hand bevestigd worden (5 050 / 50 berichten per pagina = 101 pagina's), geen
// «запам'ятати мій вибір», en het venster was niet te verplaatsen of in te klappen en lag onder het zijmenu.
//
// Deze test bewijst per klacht eerst de oorzaak en dan de oplossing:
//  1. HTTP_502 kwam niet van de controle maar van src/platform/client.ts (`HTTP_<status>` als een antwoord geen foutcode heeft):
//     de aanvraag naar de eigen server kreeg 502 van de proxy. Zo'n code stond niet in de herhaallijst van de backend (die kende
//     alleen RATE_LIMITED ≤ 3 en PROVIDER_UNAVAILABLE ≤ 2) → meteen «fout». Nu: één ladder voor élke tijdelijke fout.
//  2. Backoff met een groeiende pauze, op de server én in de browser, uit dezelfde pure module.
//  3. De bewaarde keuze (automatisch / overslaan / vragen) per gebruiker, migratie 0075.
//  4. Hervatten is echt: de server bewaart het paginatoken in dezelfde transactie als de contactrijen; na een onderbreking gaat
//     de controle verder vanaf dat token, zonder iets dubbel te tellen.
//  5. Het venster: de bestaande vensterbeheer (src/platform/vensters.tsx) — slepen, «Згорнути» naar het dok, laag 100 000 boven
//     de zijbalklade (260) en de scrim (250), waar de oude 240 juist onder lag.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { zetDnsBron, type DnsBron, type ScanBron, type ScanKop } from '../../backend/mail-afzender-bronnen';
import {
  contactenScanBeleid, contactenScanBeleidZetten, contactenScanStand, contactenScanWachten, mailAfzenderRoutes, zetScanBron, zetScanPauze,
} from '../../backend/mail-afzenders';
import {
  isTijdelijkeScanFout, SCAN_BACKOFF_MAX_MS, SCAN_BELEIDEN, SCAN_MAX_POGINGEN, scanBackoffMs, scanHerhaalPlan, scanHerhaalZin,
  normaliseerScanBeleid, STANDAARD_SCAN_BELEID,
} from '../../shared/mail-scan-beleid';
import { checker } from './hulp/nep-google';
import { runInNewContext } from 'node:vm';
import { _zonderPoortIsPrive } from '../../backend/mail-ruimte';

const ORIGIN = 'https://mail.tarasevych.com';
/** Minimale browser voor react-dom/server (zelfde aanpak als mail-contacten.test.ts). */
function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/contacts`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', innerWidth: 1280, innerHeight: 800, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
type Res = { statusCode: number; body: string };
const uit = (r: unknown) => { const x = r as Res; let b: any = {}; try { b = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, b }; };
const T0 = Date.parse('2026-09-01T00:00:00Z');
const geenDns: DnsBron = { mx: async () => { throw Object.assign(new Error('x'), { code: 'ENODATA' }); }, txt: async () => { throw Object.assign(new Error('x'), { code: 'ENODATA' }); } };

export async function main(): Promise<number> {
  // Deze test meet de POSTLAAG zelf en roept haar rechtstreeks aan, zonder route en dus zonder de ruimtepoort ervoor
  // (backend/mail-ruimte.ts, migratie 0083). «Geen lade» betekent hier dus: de persoonlijke lade — precies wat deze test
  // altijd bedoelde. De scheiding zelf wordt in tests/eenheid/ruimte-mail-20261020.test.ts bewezen, met de poort erbij.
  _zonderPoortIsPrive(true);
  const { check, einde } = checker('contacten-hervatten-20261019');

  // ================================================================ 1. welke fout is tijdelijk (puur)
  check('15/1 reproductie: HTTP_502 is de code die de browser zelf maakt als een antwoord geen foutcode heeft',
    /super\(code \|\| `HTTP_\$\{status\}`\)/.test(lees('src/platform/client.ts')));
  check('15/1 opgelost: HTTP_429/500/502/503/504 én de Gmail-codes gelden als tijdelijk (opnieuw proberen kan slagen)',
    ['HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504', 'HTTP_599', 'GOOGLE_MAIL_RATE_LIMITED', 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE', 'GOOGLE_MAIL_REQUEST_FAILED', 'SCAN_MISLUKT', 'NETWORK_ERROR'].every((c) => isTijdelijkeScanFout(c)));
  check('15/1 blijvende fouten worden NOOIT automatisch herhaald (de gebruiker moet iets doen)',
    ['GOOGLE_MAIL_REAUTH_REQUIRED', 'GOOGLE_MAIL_SCOPE_REQUIRED', 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED', 'HTTP_401', 'HTTP_403', 'HTTP_404', ''].every((c) => !isTijdelijkeScanFout(c)));
  check('15/1 de backend gebruikt diezelfde ene definitie (geen tweede lijst die kan gaan afwijken)',
    lees('backend/mail-afzenders.ts').includes("from '../shared/mail-scan-beleid'")
    && !/fouten <= 3|fouten <= 2/.test(lees('backend/mail-afzenders.ts')));

  // ================================================================ 2. backoff (puur)
  const ladder = [1, 2, 3, 4, 5, 6, 7, 8].map((p) => scanBackoffMs(p));
  check('15/2 groeiende pauze 2 s, 4 s, 8 s, 16 s, 32 s, 64 s en dan begrensd op 120 s',
    ladder.slice(0, 6).join(',') === '2000,4000,8000,16000,32000,64000' && ladder[6] === SCAN_BACKOFF_MAX_MS && ladder[7] === SCAN_BACKOFF_MAX_MS, ladder.join(','));
  const totaalWacht = Array.from({ length: SCAN_MAX_POGINGEN }, (_, i) => scanBackoffMs(i + 1)).reduce((a, b) => a + b, 0);
  check('15/2 nooit een oneindige lus: hoogstens 12 pogingen, samen ongeveer een kwartier (lang genoeg voor een herstart of een quotum)',
    SCAN_MAX_POGINGEN === 12 && totaalWacht > 10 * 60_000 && totaalWacht < 15 * 60_000, `${Math.round(totaalWacht / 1000)} s`);
  check('15/2 «Повторюю через N с · спроба X з Y» (uk) en «Opnieuw over N s · poging X van Y» (nl)',
    scanHerhaalZin('uk', 7.2, 3) === 'Повторюю через 8 с · спроба 3 з 12' && scanHerhaalZin('nl', 0, 1).startsWith('Opnieuw over 0 s · poging 1 van 12'), scanHerhaalZin('uk', 7.2, 3));

  // ================================================================ 3. het bewaarde beleid (puur)
  check('15/3 drie keuzes, standaard «продовжувати автоматично» (niemand hoeft te klikken)',
    SCAN_BELEIDEN.join(',') === 'automatisch,overslaan,vragen' && STANDAARD_SCAN_BELEID === 'automatisch' && normaliseerScanBeleid('rommel') === 'automatisch' && normaliseerScanBeleid('vragen') === 'vragen');
  check('15/3 automatisch: tijdelijke fout → herhalen; na alle pogingen pas naar de gebruiker',
    scanHerhaalPlan('HTTP_502', 1, 'automatisch').soort === 'herhaal' && scanHerhaalPlan('HTTP_502', SCAN_MAX_POGINGEN, 'automatisch').soort === 'herhaal' && scanHerhaalPlan('HTTP_502', SCAN_MAX_POGINGEN + 1, 'automatisch').soort === 'vragen');
  check('15/3 overslaan: herhalen en daarna de problematische mailbox overslaan (nooit wachten op een klik)',
    scanHerhaalPlan('HTTP_502', 1, 'overslaan').soort === 'herhaal' && scanHerhaalPlan('HTTP_502', SCAN_MAX_POGINGEN + 1, 'overslaan').soort === 'overslaan');
  check('15/3 vragen: het oude gedrag — meteen naar de gebruiker, geen enkele poging',
    scanHerhaalPlan('HTTP_502', 1, 'vragen').soort === 'vragen' && scanHerhaalPlan('GOOGLE_MAIL_RATE_LIMITED', 1, 'vragen').soort === 'vragen');
  check('15/3 een blijvende fout gaat bij élk beleid naar de gebruiker', SCAN_BELEIDEN.every((b) => scanHerhaalPlan('GOOGLE_MAIL_SCOPE_REQUIRED', 1, b).soort === 'vragen'));
  check('15/3 migratie 0075: kolommen poging/wacht_tot, staat «overgeslagen», tabel met het bewaarde beleid onder RLS',
    /ADD COLUMN IF NOT EXISTS poging/.test(lees('migrations/0075_mail_scan_herhalen.sql')) && /ADD COLUMN IF NOT EXISTS wacht_tot/.test(lees('migrations/0075_mail_scan_herhalen.sql'))
    && /'overgeslagen'/.test(lees('migrations/0075_mail_scan_herhalen.sql')) && /CREATE TABLE IF NOT EXISTS app\.mail_contacten_scan_beleid/.test(lees('migrations/0075_mail_scan_herhalen.sql'))
    && /ENABLE ROW LEVEL SECURITY/.test(lees('migrations/0075_mail_scan_herhalen.sql')) && /mail_contacten_scan_beleid TO mijnruimte_app/.test(lees('migrations/rechten.sql')));

  // ================================================================ 4. de echte controle (nep-Gmail, eigen database)
  const sys = getPool('systeem');
  const A = `hv-a-${randomUUID()}`;
  const sessie = async () => ({ user: { id: A, status: 'approved', role: 'member' }, service: 'mail' });
  const R = mailAfzenderRoutes({ requireSession: sessie as never });
  const roep = async (pad: string, body: Record<string, unknown> = {}) => uit(await (R[`POST /api/owner/mail/${pad}`][0] as (c: unknown) => Promise<unknown>)({ event: {}, body }));
  const box: Record<string, Array<{ id: string; kop: ScanKop }>> = { 'acc-1': [], 'acc-2': [] };
  const zet = (acc: string, i: number) => box[acc].push({
    id: `${acc}-${i}`,
    kop: { from: `Afzender ${i % 7} <a${i % 7}@firma${acc === 'acc-1' ? 1 : 2}.example>`, to: 'ik@eigen.example', cc: '', bcc: '', auth: [], tijd: T0 + i * 60_000, labels: ['INBOX'] },
  });
  for (let i = 0; i < 130; i++) zet('acc-1', i);
  for (let i = 0; i < 40; i++) zet('acc-2', i);
  let lijstFout: ((acc: string, tok: string) => string | null) | null = null;
  const nepScan: ScanBron = {
    async accounts() { return [{ id: 'acc-1', email: 'ik@eigen.example' }, { id: 'acc-2', email: 'ik@werk.example' }]; },
    async profiel(_u, acc) { return { email: acc === 'acc-1' ? 'ik@eigen.example' : 'ik@werk.example', totaal: box[acc].length }; },
    async lijst(_u, acc, tok, max) {
      const f = lijstFout?.(acc, tok);
      if (f) throw new Error(f);
      const alle = [...box[acc]].sort((x, y) => y.kop.tijd - x.kop.tijd);
      const start = tok ? Number(tok.slice(1)) : 0;
      return { ids: alle.slice(start, start + max).map((m) => m.id), next: start + max < alle.length ? `p${start + max}` : '' };
    },
    async kop(_u, acc, id) { return box[acc].find((m) => m.id === id)?.kop || null; },
    async huidig() { return 'acc-1'; },
  };
  zetScanBron(nepScan); zetScanPauze(0); zetDnsBron(geenDns);
  const scanRijen = async () => (await sys.query('SELECT account_id, staat, page_token, verwerkt, fout, poging, wacht_tot FROM app.mail_contacten_scan WHERE user_id = $1 ORDER BY account_id', [A])).rows;

  try {
    check('15/4 standaard beleid uit de database: «automatisch» (ook zonder rij)', await contactenScanBeleid(A) === 'automatisch');
    for (const accountId of ['acc-1', 'acc-2']) {
      const antwoord = await roep('contacten/scan/voorkeur', { accountId, voorkeur: { aan: true, werkwijze: 'handmatig' } });
      check(`MAILSCAN-002: згода лише для ${accountId}`, antwoord.status === 200 && antwoord.b.scan?.gekoppeld?.find((x: any) => x.accountId === accountId)?.voorkeur.aan);
    }

    // 4a. Dezelfde situatie als bij de eigenaar: pagina 2 van mailbox 1 geeft drie keer HTTP_502 en lukt dan.
    let keer = 0;
    lijstFout = (acc, tok) => (acc === 'acc-1' && tok === 'p50' && keer++ < 3 ? 'HTTP_502' : null);
    await roep('contacten/scan/start');
    await contactenScanWachten(A);
    const na502 = await contactenScanStand(A);
    check('15/4a HTTP_502 wordt nu zelf herhaald: de controle loopt zonder één klik door tot 170 berichten',
      na502.staat === 'klaar' && na502.verwerkt === 170 && keer === 4, `${na502.staat} ${na502.verwerkt} pogingen=${keer}`);
    const acc1 = (await scanRijen()).find((r) => r.account_id === 'acc-1');
    check('15/4a na succes is de herhaalstand gewist (poging 0, geen wachttijd, geen fout) — de melding toont niets meer',
      Number(acc1?.poging) === 0 && !acc1?.wacht_tot && acc1?.fout === '', JSON.stringify(acc1));
    const totaalRijen = Number((await sys.query('SELECT count(*)::int AS n FROM app.mail_afzenders WHERE user_id = $1', [A])).rows[0].n);
    const dubbel = Number((await sys.query('SELECT coalesce(sum(aantal),0)::int AS n FROM app.mail_afzenders WHERE user_id = $1', [A])).rows[0].n);
    check('15/4a niets dubbel geteld over de herhaalde pagina heen (7 + 7 adressen, samen precies 170 berichten)',
      totaalRijen === 14 && dubbel === 170, `${totaalRijen} adressen / ${dubbel} berichten`);

    // 4b. «Повторюю через N с, спроба X» moet ook een herlaadbeurt overleven: de stand staat in de database, niet in de browser.
    await sys.query('DELETE FROM app.mail_contacten_scan WHERE user_id = $1', [A]);
    await sys.query('DELETE FROM app.mail_afzenders WHERE user_id = $1', [A]);
    lijstFout = (acc, tok) => (acc === 'acc-1' && tok === 'p50' ? 'HTTP_502' : null);
    const gezien: Array<{ poging: number; wacht: boolean }> = [];
    const kijk = setInterval(() => {
      void sys.query('SELECT poging, wacht_tot FROM app.mail_contacten_scan WHERE user_id = $1 AND account_id = $2', [A, 'acc-1'])
        .then((r) => { if (r.rows[0] && Number(r.rows[0].poging) > 0) gezien.push({ poging: Number(r.rows[0].poging), wacht: !!r.rows[0].wacht_tot }); })
        .catch(() => undefined);
    }, 2);
    await roep('contacten/scan/start');
    await contactenScanWachten(A);
    clearInterval(kijk);
    const vast = await scanRijen();
    const r1 = vast.find((r) => r.account_id === 'acc-1'), r2 = vast.find((r) => r.account_id === 'acc-2');
    check('15/4b de herhaalstand staat in de DATABASE (poging + wacht_tot), dus «повторюю через N с, спроба X» overleeft F5',
      gezien.some((g) => g.wacht && g.poging >= 1) && Math.max(...gezien.map((g) => g.poging)) > 1, JSON.stringify(gezien.slice(0, 5)));
    check('15/4b na alle pogingen (beleid «automatisch») wacht de controle op de gebruiker: mailbox 1 «fout» met HTTP_502',
      r1?.staat === 'fout' && r1?.fout === 'HTTP_502' && Number(r1?.poging) === SCAN_MAX_POGINGEN + 1, JSON.stringify(r1));
    check('15/4b de andere mailbox is wél afgerond — één weigerende mailbox houdt de rest niet tegen', r2?.staat === 'klaar' && Number(r2?.verwerkt) === 40, JSON.stringify(r2));
    check('15/4b hervatten is ECHT: het paginatoken van mailbox 1 staat opgeslagen bij 50 verwerkte berichten («з місця зупинки»)',
      r1?.page_token === 'p50' && Number(r1?.verwerkt) === 50, `${r1?.page_token} / ${r1?.verwerkt}`);
    check('15/4b de voortgang wordt in DEZELFDE transactie als de contactrijen geschreven (nooit een pagina dubbel)',
      /await inLade\(userId, async \(q, lade\) => \{[\s\S]{0,4000}?SET page_token = \$3, verwerkt = verwerkt \+ \$4/.test(lees('backend/mail-afzenders.ts'))
      && /for \(const r of rijen\.values\(\)\) await schrijfRij/.test(lees('backend/mail-afzenders.ts')));

    // 4c. «Продовжити» hervat vanaf p50 en telt niets dubbel.
    lijstFout = null;
    await roep('contacten/scan/start');
    await contactenScanWachten(A);
    const hervat = await contactenScanStand(A);
    const som = Number((await sys.query('SELECT coalesce(sum(aantal),0)::int AS n FROM app.mail_afzenders WHERE user_id = $1', [A])).rows[0].n);
    check('15/4c verdergaan vanaf het bewaarde token: klaar met 170 berichten, niets dubbel geteld', hervat.staat === 'klaar' && hervat.verwerkt === 170 && som === 170, `${hervat.verwerkt} / ${som}`);

    // 4d. «Пропускати проблемні»: de weigerende mailbox wordt overgeslagen en niemand hoeft iets te bevestigen.
    await sys.query('DELETE FROM app.mail_contacten_scan WHERE user_id = $1', [A]);
    await sys.query('DELETE FROM app.mail_afzenders WHERE user_id = $1', [A]);
    const bel = await roep('contacten/scan/beleid', { beleid: 'overslaan' });
    check('15/4d «запам’ятати вибір» bewaard op de server (route + database), dus ook op een ander toestel hetzelfde',
      bel.status === 200 && bel.b.beleid === 'overslaan' && await contactenScanBeleid(A) === 'overslaan' && (await roep('contacten/scan/beleid')).b.beleid === 'overslaan');
    lijstFout = (acc, tok) => (acc === 'acc-1' && tok === 'p50' ? 'HTTP_502' : null);
    await roep('contacten/scan/start');
    await contactenScanWachten(A);
    const over = await scanRijen(), o1 = over.find((r) => r.account_id === 'acc-1');
    const standOver = await contactenScanStand(A);
    check('15/4d de weigerende mailbox krijgt staat «overgeslagen» (geen openstaande vraag) en de controle is klaar',
      o1?.staat === 'overgeslagen' && o1?.fout === 'HTTP_502' && standOver.staat === 'klaar' && standOver.beleid === 'overslaan', `${o1?.staat} / ${standOver.staat}`);
    check('15/4d het bewaarde token blijft staan, zodat een latere ronde alsnog vanaf p50 verdergaat', o1?.page_token === 'p50');

    // 4e. «Питати щоразу»: het oude gedrag blijft mogelijk, maar dan zonder enige poging.
    await sys.query('DELETE FROM app.mail_contacten_scan WHERE user_id = $1', [A]);
    await contactenScanBeleidZetten(A, 'vragen');
    await roep('contacten/scan/start');
    await contactenScanWachten(A);
    const vraag = (await scanRijen()).find((r) => r.account_id === 'acc-1');
    check('15/4e «питати щоразу»: meteen «fout» na de eerste fout, poging 1, en de stand meldt het beleid',
      vraag?.staat === 'fout' && Number(vraag?.poging) === 1 && (await contactenScanStand(A)).beleid === 'vragen', JSON.stringify(vraag));

    // ================================================================ 5. het venster en de browserkant
    const melding = lees('src/afzenders/ContactenScanMelding.tsx');
    const paneel = lees('src/afzenders/ScanPaneel.tsx');
    const css = lees('src/afzenders/contacten.css');
    check('MAILSCAN-002: жодного великого вікна перевірки', !melding.includes('<Venster') && melding.includes('ctv-scan-korte-melding'));
    check('15/5 reproductie: de zijbalklade staat op z-index 260 met een scrim op 250 — daar lag de oude melding (240) onder',
      /\.canonical-chrome\.sidebar-drawer-mode\.sidebar-drawer \.canonical-sidebar\{z-index:260/.test(lees('src/canoniek-omlijsting.css'))
      && /\.canonical-chrome\.sidebar-drawer-mode \.canonical-sidebar-scrim\.drawer\{z-index:250\}/.test(lees('src/canoniek-omlijsting.css')));
    check('MAILSCAN-002: коротке повідомлення не перекриває дії та зникає за дві секунди',
      /\.ctv-scan-korte-melding/.test(css) && /pointer-events:\s*none/.test(css) && /setTimeout\(\(\) => zetKort\(''\), 2000\)/.test(melding));
    check('MAILSCAN-002: сповіщення зберігається в центрі', melding.includes('alleenPaneel: true') && melding.includes('emitCanonicalNotice'));
    check('15/5 de browser herhaalt zelf (geen 101 klikken): useScanActies plant een nieuwe poging met scanHerhaalPlan + setTimeout',
      /scanHerhaalPlan\(code, poging \+ 1, beleidRef\.current\)/.test(paneel) && /timer\.current = window\.setTimeout\(\(\) => \{ if \(levend\.current\) void doe\(f, plan\.poging\)/.test(paneel));
    check('MAILSCAN-002: відновлення не обходить налаштувань конкретної скриньки',
      !/useAutoHervatten\(magHerhalen/.test(paneel) && !/useAutoHervatten\(/.test(melding));
    check('15/5 «повторюю через N с, спроба X» komt uit de browser of uit de bewaarde serverstand',
      /export function ScanHerhaalRegel/.test(paneel) && /a\.herhaalZin \|\| scanServerHerhaal\(lang, s\)/.test(paneel) && /data-scan-herhaal/.test(paneel));

    nepBrowser();
    const { default: ScanPaneel } = await import('../../src/afzenders/ScanPaneel');
    const stand = await contactenScanStand(A);
    const html = renderToString(createElement(ScanPaneel, { lang: 'uk', s: { ...stand, staat: 'fout' as const, loopt: false, beleid: 'automatisch' as const } }));
    check('MAILSCAN-002: для кожної скриньки є власна згода та ручний запуск',
      html.includes('Перевірку дозволено') && html.includes('Перевірити цю скриньку зараз') && html.includes('ik@werk.example'), html.slice(0, 160));
    check('15/5 uitvoer: de drie bewaarde keuzes staan er, en precies één (de bewaarde) is aangevinkt',
      /data-scan-beleid="automatisch"/.test(html) && html.includes('Продовжувати автоматично') && html.includes('Пропускати проблемні') && html.includes('Питати щоразу')
      && (html.match(/type="radio"/g) || []).length === 3 && (html.match(/checked=""/g) || []).length === 1,
      (/<input type="radio"[^>]*>/.exec(html) || [''])[0]);
    const bezigHtml = renderToString(createElement(ScanPaneel, {
      lang: 'uk',
      s: { ...stand, staat: 'bezig' as const, loopt: true, beleid: 'automatisch' as const, maxPogingen: SCAN_MAX_POGINGEN, accounts: stand.accounts.map((x, i) => (i === 0 ? { ...x, poging: 3, wachtTot: new Date(Date.now() + 8000).toISOString() } : x)) },
    }));
    check('15/5 uitvoer: terwijl de server wacht, staat er «Повторюю через … с · спроба 3 з 12» (geen foutmelding, geen knop die wacht)',
      /data-scan-herhaal/.test(bezigHtml) && /Повторюю через \d+ с · спроба 3 з 12/.test(bezigHtml), (/Повторюю[^<]*/.exec(bezigHtml) || [''])[0]);
    check('MAILSCAN-002: geen «undefined»/«NaN», nl-variant heeft instellingen per mailbox',
      !/undefined|NaN/.test(html) && renderToString(createElement(ScanPaneel, { lang: 'nl', s: { ...stand, staat: 'fout' as const, loopt: false } })).includes('Deze mailbox nu controleren'));
  } finally {
    zetScanBron(null); zetScanPauze(250); zetDnsBron(null);
    for (const tbl of ['mail_afzenders', 'mail_domein_dns', 'mail_contacten_scan', 'mail_contacten_scan_beleid']) await sys.query(`DELETE FROM app.${tbl} WHERE user_id = $1`, [A]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
