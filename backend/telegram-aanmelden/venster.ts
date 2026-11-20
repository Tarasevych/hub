// TELEGRAM-002 — het beveiligde Telegram-venster (Mini App; dezelfde pagina opent ook in de browser via de ondertekende verwijzing).
// Wat het doet: toont WIE (account), WAT (aanmelden of de handeling), WAARVANDAAN (officiële logo's van browser en systeem,
// vlag + plaats) en WANNEER; de gebruiker kiest uit 4 tegels HETZELFDE pictogram dat de vragende browser toont (één poging) en
// vult daarna — als hij een geheime code heeft — die code hier in. Nooit in de chat.
//
// Toegang tot de API: de ondertekende verwijzing (venster-sleutel.ts) en, in Telegram zelf, de ondertekende initData van Telegram
// (HMAC met de bot-sleutel, ≤ 5 min oud, gebruiker = de Telegram van de verwijzing). Zonder initData (browser) alleen de
// verwijzing — die stond uitsluitend in de chat van deze gebruiker. Het juiste pictogram staat NOOIT in deze pagina.
//
// Pagina zonder React en zonder scripts van derden: html van de server, één eigen script (/api/telegram/venster.js), smalle CSP;
// mag alleen in Telegram Web (web.telegram.org) als frame worden getoond.
import type { RouterContext, RouterResponse } from '../../server/platform/router';
import { accountBeeld, telegramBeeld } from './account-foto';
import { koppelingenVanTelegram } from './opslag';
import { plaatsTekst } from '../../shared/telegram-aanmelden/plaatsnamen';
import { vergelijkPlaats, type GeoStand, type Punt } from '../../shared/telegram-aanmelden/plaats-vergelijking';
import { json } from '../../server/platform';
import { initDataControle } from './cryptografie';
import { botSleutel } from './sleutels';
import { vensterTokenLezen, type VensterToken } from './venster-sleutel';
import { inlogVensterCode, inlogVensterKiezen, inlogVoorVenster, inlogWeigeren, vensterAccounts } from './inloggen';
import { bevestigingSymbool, bevestigingVanBot, bevestigingVensterCode, bevestigingVoorVenster } from './bevestigen';
import { soortVan } from './beleid-poort';
import { audit, tijdTekst } from './meldingen';
import { SITE_BASIS } from './berichten';
import { browserSleutel, merkLogo, systeemSleutel, vlag } from './venster-merk';
import { pictogramSvg, pictogramTegel, stijlTekst, tegelStijlen } from '../../shared/apparaat-bevestiging/symbolen';
import { categorieSvg, categorieVoorActie } from '../../shared/bevestig-categorie';
import { tekstIn } from '../../shared/telegram-aanmelden/model';
import { fotoBijwerken } from './fotos';

type Taal = 'uk' | 'nl';
const tr = (taal: Taal, uk: string, nl: string): string => (taal === 'nl' ? nl : uk);
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const VENSTER_CSP = ["default-src 'none'", "script-src 'self'", "connect-src 'self'", "img-src data: https://*.googleusercontent.com", "style-src 'unsafe-inline'",
  "base-uri 'none'", "form-action 'none'", 'frame-ancestors https://web.telegram.org'].join('; ');
const KOPPEN = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': VENSTER_CSP,
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': '' /* leeg = weglaten (server/start.ts): frame-ancestors beslist */ };

// ------------------------------------------------------------------------------------------------ toegang
type Toegang = { tok: VensterToken; bron: 'telegram' | 'browser' };
async function toegang(d: Record<string, unknown>): Promise<Toegang | null> {
  const tok = await vensterTokenLezen(d.t);
  if (!tok) return null;
  const init = typeof d.initData === 'string' ? d.initData.slice(0, 4096) : '';
  if (!init) return { tok, bron: 'browser' };
  const c = initDataControle(init, await botSleutel());
  if (!c.ok || !c.vers || String((c.gebruiker as { id?: unknown } | null)?.id ?? '') !== tok.tg) {
    // Reden in het serverlogboek (geen gegevens van de mens): zo is een geweigerd venster later te verklaren. · Причина — у журналі сервера.
    console.warn(`[telegram-venster] initData geweigerd: ${c.reden || 'ANDERE_TELEGRAM'}`);
    return null;
  }
  return { tok, bron: 'telegram' };
}

// ------------------------------------------------------------------------------------------------ API
export async function vensterKiezen(d: Record<string, unknown>): Promise<{ uitkomst: string }> {
  const a = await toegang(d);
  if (!a) return { uitkomst: 'verlopen' };
  const pos = Number(d.pos);
  if (a.tok.soort === 'i') return { uitkomst: await inlogVensterKiezen(a.tok.id, a.tok.tg, String(d.koppeling || '').slice(0, 40), pos, a.bron) };
  const b = await bevestigingVoorVenster(a.tok.id, a.tok.tg);
  if (!b || b.stand !== 'wacht' || b.symboolOk) return { uitkomst: 'verlopen' };
  const r = await bevestigingSymbool(`${a.tok.id}:${b.koppelingId}:${Number.isInteger(pos) ? pos : -1}`, a.tok.tg, { venster: true });
  return { uitkomst: r === 'bevestigd' ? 'ok' : r };
}
export async function vensterCode(d: Record<string, unknown>): Promise<{ ok: boolean; uitkomst: string }> {
  const a = await toegang(d);
  if (!a) return { ok: false, uitkomst: 'verlopen' };
  const code = typeof d.code === 'string' ? d.code : '';
  return a.tok.soort === 'i' ? inlogVensterCode(a.tok.id, a.tok.tg, code) : bevestigingVensterCode(a.tok.id, a.tok.tg, code);
}
export async function vensterWeigeren(d: Record<string, unknown>): Promise<{ uitkomst: string }> {
  const a = await toegang(d);
  if (!a) return { uitkomst: 'verlopen' };
  if (a.tok.soort === 'i') return { uitkomst: (await inlogWeigeren(a.tok.id, a.tok.tg)) ? 'geweigerd' : 'verlopen' };
  const b = await bevestigingVoorVenster(a.tok.id, a.tok.tg);
  if (!b) return { uitkomst: 'verlopen' };
  return { uitkomst: await bevestigingVanBot(`${a.tok.id}:${b.koppelingId}`, a.tok.tg, false) };
}

// ------------------------------------------------------------------------------------------------ pagina
type Weergave = {
  soort: 'i' | 'b'; actieCode?: string; titel: string; wat: string; accounts: Array<{ koppelingId: string; naam: string; email?: string; foto?: string; letter?: string }>; toestel: string; apparaat: string; plaats: string; land: string;
  /** TELEGRAM-004: punt volgens het IP-adres en volgens het toestel (alleen bij aanmelden; bij een bevestiging is er geen geolocatie gevraagd). */
  ipPunt?: Punt | null; geoPunt?: Punt | null; geoStand?: GeoStand;
  /** TELEGRAM-002: de Telegram-account die dit venster opent (naam, @naam, foto) — visueel kenmerk naast het site-account. */
  telegram?: { naam: string; gebruikersnaam: string; foto: string; letter: string } | null;
  kandidaten: number[]; verlooptOp: string; stap: 'kiezen' | 'code' | 'klaar' | 'verlopen' | 'geweigerd';
};

async function tgBeeld(tg: string): Promise<Weergave['telegram']> {
  const [k] = await koppelingenVanTelegram(tg).catch(() => []);
  return k ? telegramBeeld(k) : null;
}

async function weergave(tok: VensterToken, taal: Taal): Promise<Weergave | null> {
  if (tok.soort === 'i') {
    const r = await inlogVoorVenster(tok.id, tok.tg);
    if (!r) return null;
    const ruw = r.stand === 'wacht' ? (await vensterAccounts(tok.id, tok.tg)) ?? [] : [];
    const accounts = await Promise.all(ruw.map(async (a) => { const beeld = await accountBeeld(a.userId); return { koppelingId: a.koppelingId, naam: a.naam, email: beeld.email, foto: beeld.foto, letter: beeld.letter }; }));
    const stap = r.stand === 'wacht' ? 'kiezen' : r.stand === 'goedgekeurd' && r.codeNodig && !r.codeOk ? 'code' : r.stand === 'goedgekeurd' || r.stand === 'ingewisseld' ? 'klaar' : r.stand === 'verlopen' ? 'verlopen' : 'geweigerd';
    return { soort: 'i', actieCode: 'inloggen', titel: tr(taal, 'Запит на вхід', 'Aanmeldverzoek'), wat: tr(taal, 'вхід на сайт «Мій простір»', 'aanmelden op «Mijn Ruimte»'), accounts,
      toestel: r.toestel, apparaat: r.apparaat, plaats: r.plaats, land: r.land, ipPunt: r.ipPunt, geoPunt: r.geoPunt, geoStand: r.geoStand, kandidaten: r.kandidaten, verlooptOp: r.verlooptOp, stap, telegram: await tgBeeld(tok.tg) };
  }
  const b = await bevestigingVoorVenster(tok.id, tok.tg);
  if (!b) return null;
  const s = await soortVan(b.actie);
  const ab = await accountBeeld(b.userId);
  const stap = b.stand === 'wacht' ? (b.symboolOk ? 'code' : 'kiezen') : b.stand === 'bevestigd' || b.stand === 'gebruikt' ? 'klaar' : b.stand === 'verlopen' ? 'verlopen' : 'geweigerd';
  return { soort: 'b', actieCode: b.actie, titel: tr(taal, 'Підтвердження дії', 'Bevestiging van een handeling'), wat: s ? tekstIn(s.naam, taal) : b.actie,
    accounts: [{ koppelingId: b.koppelingId, naam: b.account, email: ab.email, foto: ab.foto, letter: ab.letter }], toestel: b.toestel, apparaat: '', plaats: b.plaats, land: b.land, kandidaten: b.kandidaten, verlooptOp: b.verlooptOp, stap,
    telegram: await tgBeeld(tok.tg) };
}

const SCHILD = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>';

const CSS = `:root{color-scheme:light dark;--bg:#f4f7fb;--kaart:#fff;--tekst:#17212b;--zacht:#4b5966;--rand:#d9e1ea;--accent:#1d77b5;--gevaar:#b3261e;--ok:#1b6b3a}
@media (prefers-color-scheme:dark){:root{--bg:#0e1621;--kaart:#17212b;--tekst:#f2f5f8;--zacht:#a9b6c3;--rand:#2b3946;--accent:#5eb5f7;--gevaar:#ff8a80;--ok:#7fd99a}}
*{box-sizing:border-box}html,body{margin:0}body{font:15px/1.38 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--tekst);padding:10px 12px 16px}
main{max-width:440px;margin:0 auto;display:grid;gap:9px}
.kop{display:flex;align-items:center;justify-content:space-between;gap:8px}.kop-links{display:flex;align-items:center;gap:7px}.kop b{font-size:.95rem}.kop small{color:var(--zacht);font-size:.76rem}
.kaart{background:var(--kaart);border:1px solid var(--rand);border-radius:15px;padding:11px 13px;display:grid;gap:7px}
.actie-kop{display:flex;align-items:center;gap:10px}
.actie-icoon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:#fff;flex:none;box-shadow:0 3px 10px color-mix(in srgb,var(--cat-kleur,#1d77b5) 30%,transparent)}
.actie-tekst{min-width:0;flex:1}
.actie-badge{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:999px;color:#fff;margin-bottom:2px}
h1{font-size:1rem;line-height:1.25;margin:0;overflow-wrap:anywhere}h2{font-size:.98rem;margin:0;text-align:center}.zacht{color:var(--zacht);font-size:.82rem;margin:0}
.meta-strook{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:6px;border-top:1px solid var(--rand)}
.meta-chips{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:.79rem;color:var(--zacht)}
.meta-chips img{width:16px;height:16px;border-radius:3px;vertical-align:middle}.meta-chips img.vlag{width:20px;height:14px;border-radius:2px;box-shadow:0 0 0 1px var(--rand)}
.meer-details{border-top:1px solid var(--rand);padding-top:6px;font-size:.83rem}
.meer-details summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:.8rem;list-style:none;display:flex;align-items:center;justify-content:space-between}
.meer-details summary::-webkit-details-marker{display:none}
.meer-details[open] summary{margin-bottom:6px}
.meer-inhoud{display:grid;gap:6px}
.rij{display:flex;align-items:center;gap:7px}.rij>span:last-child{min-width:0;overflow-wrap:anywhere}.rij img{width:18px;height:18px;border-radius:4px;flex:none}.rij small.bron{display:block;color:var(--zacht);font-size:.76rem}.rij img.vlag{width:22px;height:15px;border-radius:2px;box-shadow:0 0 0 1px var(--rand)}
.label{color:var(--zacht);min-width:5.2em;font-size:.8rem}
.wie{display:grid;gap:4px}.persoon{display:flex;align-items:center;gap:8px;min-width:0}.persoon b{display:block;font-size:.88rem;overflow-wrap:anywhere}.persoon small{display:block;color:var(--zacht);font-size:.78rem;overflow-wrap:anywhere}
.rond{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 0 0 2px var(--rand)}.rond.leeg{display:grid;place-items:center;background:var(--accent);color:#fff;font-weight:700;font-size:.95rem}
.accounts .rond{width:30px;height:30px;font-size:.85rem}
.raster{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.keuze{appearance:none;border:0;padding:0;background:none;border-radius:20px;cursor:pointer;display:block;width:100%}
.keuze:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.keuze[disabled]{cursor:not-allowed;opacity:.45}
.keuze.gekozen{outline:3px solid var(--accent);outline-offset:2px}
.accounts{display:grid;gap:5px}.accounts label{display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid var(--rand);border-radius:11px;cursor:pointer}
.waarschuwing{border-left:3px solid var(--gevaar);padding:6px 9px;background:color-mix(in srgb,var(--gevaar) 8%,transparent);border-radius:7px;font-size:.79rem;margin:0;line-height:1.32}
.knop{appearance:none;border:1px solid var(--rand);background:var(--kaart);color:var(--tekst);border-radius:999px;min-height:42px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;width:100%}
.knop.hoofd{background:var(--accent);border-color:var(--accent);color:#fff}.knop.nee{color:var(--gevaar);background:color-mix(in srgb,var(--gevaar) 6%,var(--kaart))}
input[type=password],input[type=text]{width:100%;min-height:44px;font:inherit;font-size:1.15rem;letter-spacing:.15em;padding:7px 10px;border-radius:11px;border:1px solid var(--rand);background:var(--bg);color:var(--tekst);text-align:center}
.uitkomst{font-weight:600;text-align:center;margin:0;font-size:.9rem}.uitkomst.goed{color:var(--ok)}.uitkomst.slecht{color:var(--gevaar)}[hidden]{display:none!important}
@media (max-width:360px){body{padding:8px 8px 14px}.kaart{padding:9px 10px}.raster{gap:6px}.label{min-width:4.4em}}`;

export async function vensterPagina(rc: RouterContext): Promise<RouterResponse> {
  const taal: Taal = rc.query.taal === 'nl' ? 'nl' : 'uk';
  const tok = await vensterTokenLezen(rc.query.t);
  const w = tok ? await weergave(tok, taal) : null;
  if (tok && w) {
    await audit(null, 'venster.geopend', 'pending', { soort: tok.soort, stap: w.stap }).catch(() => undefined);
    void fotoBijwerken(tok.tg).catch(() => undefined); // TELEGRAM-002: foto bij elke interactie bijwerken
  }
  return { statusCode: 200, headers: { ...KOPPEN }, body: paginaHtml(w, taal) };
}

export function paginaHtml(w: Weergave | null, taal: Taal): string {
  const kop = `<header class="kop"><div class="kop-links">${SCHILD}<b>${esc(tr(taal, 'Мій простір', 'Mijn Ruimte'))}</b></div><small>${esc(tr(taal, 'захищене вікно', 'beveiligd venster'))} · ${esc(SITE_BASIS().replace(/^https?:\/\//, ''))}</small></header>`;
  const t = (uk: string, nl: string) => esc(tr(taal, uk, nl));
  if (!w) return document(taal, `${kop}<section class="kaart"><h1>${t('Запит недійсний або застарів', 'Verzoek ongeldig of verlopen')}</h1><p class="zacht">${t('Почніть знову на сайті. Якщо ви нічого не робили — просто закрийте це вікно.', 'Begin opnieuw op de site. Deed u niets, sluit dan gewoon dit venster.')}</p></section>`);
  const cat = categorieVoorActie(w.actieCode || (w.soort === 'i' ? 'inloggen' : ''), '', `${w.titel} ${w.wat}`);
  const b = browserSleutel(w.toestel || (w.apparaat || '').split('/')[0] || ''), s = systeemSleutel((w.toestel || '').split('·')[1] || (w.apparaat || '').split('/')[1] || '');
  const logo = (uri: string, alt: string, klasse = '') => (uri ? `<img src="${uri}" alt="${esc(alt)}"${klasse ? ` class="${klasse}"` : ''}>` : '');
  const toestel = w.toestel || w.apparaat || tr(taal, 'невідомо', 'onbekend');
  const plaats = plaatsTekst(w.plaats, w.land, taal) || tr(taal, 'місце невідоме', 'plaats onbekend');
  const tijd = tijdTekst(taal);
  // TELEGRAM-002 + UPD-011: компактний аватар облікового запису в основній картці; додаткові реквізити й Telegram у розгортуваному блоці.
  const rond = (foto: string | undefined, letter: string | undefined, alt: string) => (foto
    ? `<img class="rond" src="${esc(foto)}" alt="${esc(alt)}" referrerpolicy="no-referrer">`
    : `<span class="rond leeg" aria-hidden="true">${esc(letter || '?')}</span>`);
  const persoon = (foto: string | undefined, letter: string | undefined, naam: string, onder: string, alt: string) =>
    `<div class="persoon">${rond(foto, letter, alt)}<div><b>${esc(naam)}</b>${onder ? `<small>${esc(onder)}</small>` : ''}</div></div>`;
  const hoofdAccount = w.accounts[0];
  const hoofdWie = hoofdAccount
    ? persoon(hoofdAccount.foto, hoofdAccount.letter, hoofdAccount.naam, hoofdAccount.email || '', tr(taal, 'Фото облікового запису сайту', 'Foto van het site-account'))
    : `<span>—</span>`;
  const wieDetail = `<div class="wie"><span class="label">${t('Обліковий запис сайту', 'Account op de site')}</span>${w.accounts.length
    ? w.accounts.map((a) => persoon(a.foto, a.letter, a.naam, a.email || '', tr(taal, 'Фото облікового запису сайту', 'Foto van het site-account'))).join('')
    : `<span>—</span>`}</div>${w.telegram ? `<div class="wie"><span class="label">${t('Ваш Telegram', 'Uw Telegram')}</span>${persoon(w.telegram.foto, w.telegram.letter, w.telegram.naam, w.telegram.gebruikersnaam ? `@${w.telegram.gebruikersnaam}` : '', tr(taal, 'Фото профілю Telegram', 'Telegram-profielfoto'))}</div>` : ''}`;
  const accounts = w.accounts.length > 1
    ? `<fieldset class="accounts" style="border:0;padding:0;margin:0"><legend class="zacht">${t('До якого облікового запису увійти?', 'Bij welk account aanmelden?')}</legend>${w.accounts.map((a) => `<label><input type="radio" name="account" value="${esc(a.koppelingId)}">${rond(a.foto, a.letter, '')}<span>${esc(a.naam)}</span></label>`).join('')}</fieldset>`
    : `<input type="hidden" name="account" value="${esc(w.accounts[0]?.koppelingId ?? '')}">`;
  const tegels = w.kandidaten.map((index, pos) => {
    const tg = pictogramTegel(index, taal);
    if (!tg) return '';
    const st = tegelStijlen(tg.kleur);
    return `<button type="button" class="keuze" data-pos="${pos}" aria-label="${esc(tg.naam)}"><span style="${esc(stijlTekst(st.tegel))}">${pictogramSvg(index, stijlTekst(st.vorm))}<b style="${esc(stijlTekst(st.naam))}">${esc(tg.naam)}</b></span></button>`;
  }).join('');
  // TELEGRAM-004: plaats volgens het TOESTEL naast die volgens het IP-adres.
  const vg = vergelijkPlaats(w.geoPunt ?? null, { punt: w.ipPunt ?? null, plaats: w.plaats }, taal);
  const afstand = vg.km === null ? '' : vg.km < 1 ? tr(taal, 'менше ніж 1 км від місця за IP', 'minder dan 1 km van de plaats volgens het IP') : tr(taal, `≈ ${vg.km} км від місця за IP`, `≈ ${vg.km} km van de plaats volgens het IP`);
  const geoBron = tr(taal, 'За дозволом браузера — місце пристрою, приблизно', 'Met toestemming van de browser — plaats van het apparaat, bij benadering');
  const geoInhoud = w.geoPunt
    ? `${esc([vg.geoTekst || tr(taal, 'місце пристрою отримано', 'plaats van het apparaat ontvangen'), afstand].filter(Boolean).join(' · '))}<small class="bron">${esc(geoBron)}</small>`
    : `${esc(w.geoStand === 'geweigerd' ? tr(taal, 'дозвіл не надано', 'geen toestemming gegeven') : w.geoStand === 'mislukt' ? tr(taal, 'пристрій не зміг визначити місце', 'het apparaat kon de plaats niet bepalen') : tr(taal, 'не надано', 'niet gedeeld'))}<small class="bron">${t('За дозволом браузера — лише якщо його надано на сайті', 'Met toestemming van de browser — alleen als die op de site is gegeven')}</small>`;
  const geoWaarschuwing = vg.oordeel === 'afwijkend'
    ? `<p class="waarschuwing geo-let" role="alert">${t(`Місце пристрою й місце за IP-адресою не збігаються (≈ ${vg.km} км). Так буває через VPN. Якщо ви ним не користуєтеся й не починали вхід — це може бути шахрайство: натисніть «Це не я».`, `De plaats van het apparaat en de plaats volgens het IP-adres komen niet overeen (≈ ${vg.km} km). Dat kan door een VPN komen. Gebruikt u die niet en begon u niet met aanmelden, dan kan dit oplichting zijn: tik «Dit ben ik niet».`)}</p>`
    : vg.oordeel === 'gelijk' ? `<p class="zacht geo-ok">${t('Місце пристрою узгоджується з місцем за IP-адресою. Це не доказ: звіряйте також пристрій і час.', 'De plaats van het apparaat past bij de plaats volgens het IP-adres. Dit is geen bewijs: controleer ook het apparaat en de tijd.')}</p>` : '';
  const geoRij = w.soort === 'i' ? `<div class="rij"><span class="label">${t('Пристрій каже', 'Apparaat meldt')}</span><span>${geoInhoud}</span></div>${vg.oordeel === 'gelijk' ? geoWaarschuwing : ''}` : '';

  const info = `<section class="kaart" aria-labelledby="titel" data-categorie="${esc(cat.id)}" style="--cat-kleur:${esc(cat.kleur)}">
<div class="actie-kop">
  <div class="actie-icoon" style="background:${esc(cat.kleur)}">${categorieSvg(cat, 22)}</div>
  <div class="actie-tekst">
    <span class="actie-badge" style="background:${esc(cat.kleur)}">${esc(taal === 'nl' ? cat.badgeNl : cat.badgeUk)}</span>
    <h1 id="titel">${esc(w.wat || w.titel)}</h1>
  </div>
</div>
<div class="meta-strook">${hoofdWie}</div>
<div class="meta-chips">${logo(merkLogo(b), b)}${logo(merkLogo(s, true), s)}<span>${esc(toestel)}</span><span>·</span>${logo(vlag(w.land), w.land, 'vlag')}<span>${esc(plaats)}</span><span>·</span><span>${esc(tijd)}</span></div>
${w.soort === 'i' && vg.oordeel === 'afwijkend' ? geoWaarschuwing : ''}
<details class="meer-details"><summary>${t('Деталі запиту й Telegram', 'Details van verzoek en Telegram')} <span>▾</span></summary><div class="meer-inhoud">
${wieDetail}
<div class="rij"><span class="label">${t('Що', 'Wat')}</span><span>${esc(w.titel)}: ${esc(w.wat)}</span></div>
<div class="rij"><span class="label">${t('Пристрій', 'Apparaat')}</span>${logo(merkLogo(b), b)}${logo(merkLogo(s, true), s)}<span>${esc(toestel)}</span></div>
<div class="rij"><span class="label">${t('Звідки', 'Vanwaar')}</span>${logo(vlag(w.land), w.land, 'vlag')}<span>${esc(plaats)}${w.plaats || w.land ? `<small class="bron">${t('Визначено за IP-адресою — приблизно', 'Bepaald via het IP-adres — bij benadering')}</small>` : ''}</span></div>
${geoRij}<div class="rij"><span class="label">${t('Коли', 'Wanneer')}</span><span>${esc(tijd)}</span></div>
</div></details></section>`;
  const kiezen = `<section class="kaart" id="stap-kiezen"${w.stap === 'kiezen' ? '' : ' hidden'}><h2>${t('Яку піктограму показує сайт?', 'Welk pictogram toont de site?')}</h2>
${accounts}<div class="raster">${tegels}</div>
<p class="zacht" style="text-align:center">${t('Одна спроба · якщо хтось підказує піктограму — це шахрайство.', 'Eén poging · zegt iemand welk pictogram u moet kiezen, dan is het oplichting.')}</p></section>`;
  const code = `<section class="kaart" id="stap-code"${w.stap === 'code' ? '' : ' hidden'}><h2>${t('Ваш таємний код', 'Uw geheime code')}</h2>
<p class="zacht">${t('Введіть таємний код тут — ніколи не в чаті.', 'Vul uw geheime code hier in — nooit in de chat.')}</p>
<form id="code-form" autocomplete="off"><input type="password" id="code" maxlength="64" minlength="4" required aria-label="${t('Таємний код', 'Geheime code')}" autocomplete="off"><p style="margin:6px 0 0"></p><button class="knop hoofd" type="submit">${t('Підтвердити', 'Bevestigen')}</button></form></section>`;
  const meldingen: Array<[string, string, string, boolean]> = [
    ['ok', 'Готово. Поверніться на сайт — він продовжить сам.', 'Klaar. Ga terug naar de site — die gaat vanzelf verder.', true],
    ['klaar', 'Уже підтверджено. Поверніться на сайт.', 'Al bevestigd. Ga terug naar de site.', true],
    ['fout-symbool', 'Це інша піктограма. Запит скасовано, вас повідомлено на сайті. Якщо це були ви — почніть знову на сайті.', 'Dat is een ander pictogram. Het verzoek is geannuleerd en u bent op de site gewaarschuwd. Was u het wel, begin dan opnieuw op de site.', false],
    ['passkey-nodig', 'Піктограму підтверджено, але для цього пристрою ваші налаштування вимагають ще ключ доступу. Увійдіть на сайті іншим способом.', 'Pictogram bevestigd, maar voor dit apparaat vragen uw instellingen ook een toegangssleutel. Meld u op de site op een andere manier aan.', false],
    ['geweigerd', 'Запит відхилено. Пристрій заблоковано для входу через Telegram.', 'Verzoek geweigerd. Het apparaat is geblokkeerd voor aanmelden met Telegram.', false],
    ['verlopen', 'Запит застарів або вже оброблений. Почніть знову на сайті.', 'Het verzoek is verlopen of al afgehandeld. Begin opnieuw op de site.', false],
    ['fout', 'Код не підходить. Спробуйте ще раз (кількість спроб обмежена).', 'De code klopt niet. Probeer opnieuw (het aantal pogingen is beperkt).', false],
    ['pauze', 'Забагато невдалих спроб — код призупинено. Запит скасовано.', 'Te veel mislukte pogingen — de code is gepauzeerd. Het verzoek is geannuleerd.', false],
    ['uit', 'Код вимкнено після забагатьох помилок. Відновіть його на сайті ключем доступу.', 'De code is uitgeschakeld na te veel fouten. Herstel hem op de site met uw toegangssleutel.', false],
    ['netwerk', 'Немає зв’язку із сайтом. Спробуйте ще раз.', 'Geen verbinding met de site. Probeer opnieuw.', false],
    ['plaats-nodig', 'Цей обліковий запис вимагає місце пристрою. Поверніться на сайт, дозвольте браузеру доступ до місця й оберіть піктограму ще раз. Спроба не втрачена.', 'Dit account eist de plaats van het apparaat. Ga terug naar de site, geef de browser toegang tot de locatie en kies het pictogram opnieuw. De poging is niet verbruikt.', false],
    ['account', 'Спершу оберіть обліковий запис.', 'Kies eerst een account.', false],
  ];
  const beginStap = w.stap === 'klaar' ? 'klaar' : w.stap === 'verlopen' ? 'verlopen' : w.stap === 'geweigerd' ? 'geweigerd' : '';
  const uitkomsten = meldingen.map(([id, uk, nl, goed]) => `<p class="uitkomst ${goed ? 'goed' : 'slecht'}" id="m-${id}"${beginStap === id ? '' : ' hidden'} role="status">${esc(tr(taal, uk, nl))}</p>`).join('');
  const nee = `<button type="button" class="knop nee" id="nee"${w.stap === 'kiezen' || w.stap === 'code' ? '' : ' hidden'}>⛔ ${t('Це не я', 'Dit ben ik niet')}</button>`;
  return document(taal, `${kop}${info}${kiezen}${code}<section class="kaart" aria-live="polite">${uitkomsten}${nee}</section>`);
}

function document(taal: Taal, inhoud: string): string {
  return `<!doctype html><html lang="${taal}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">
<title>${esc(tr(taal, 'Захищене вікно — Мій простір', 'Beveiligd venster — Mijn Ruimte'))}</title><style>${CSS}</style></head><body><main>${inhoud}</main><script src="/api/telegram/venster.js"></script></body></html>`;
}

// Het ene script van het venster: geen teksten (die staan al in de html), geen geheimen.
export const VENSTER_JS = `(()=>{'use strict';
const q=new URLSearchParams(location.search),t=q.get('t')||'';
let init='';try{init=new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')||''}catch(e){}
const tgGebeurtenis=(ev,data)=>{try{const p=JSON.stringify(data||{});if(window.TelegramWebviewProxy&&window.TelegramWebviewProxy.postEvent)window.TelegramWebviewProxy.postEvent(ev,p);else if(window.external&&'notify'in window.external)window.external.notify(JSON.stringify({eventType:ev,eventData:data||{}}));else if(window.parent!==window)window.parent.postMessage(JSON.stringify({eventType:ev,eventData:data||{}}),'https://web.telegram.org')}catch(e){}};
tgGebeurtenis('web_app_ready');tgGebeurtenis('web_app_expand');
const $=(id)=>document.getElementById(id);
const toon=(id)=>{document.querySelectorAll('.uitkomst').forEach(e=>{e.hidden=e.id!=='m-'+id});};
const api=async(pad,body)=>{try{const r=await fetch('/api/telegram/venster/'+pad,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({t:t,initData:init},body))});return await r.json()}catch(e){return{uitkomst:'netwerk'}}};
const einde=(id,sluiten)=>{toon(id);$('stap-kiezen').hidden=true;$('stap-code').hidden=true;$('nee').hidden=true;if(sluiten)setTimeout(()=>tgGebeurtenis('web_app_close'),2500);};
let bezig=false;
document.querySelectorAll('.keuze').forEach(k=>k.addEventListener('click',async()=>{
  if(bezig)return;const acc=document.querySelector('input[name=account]:checked')||document.querySelector('input[type=hidden][name=account]');
  if(!acc||!acc.value){toon('account');return}
  bezig=true;document.querySelectorAll('.keuze').forEach(x=>{x.disabled=true});k.classList.add('gekozen');
  const r=await api('kies',{pos:Number(k.dataset.pos),koppeling:acc.value});bezig=false;
  if(r.uitkomst==='code'){$('stap-kiezen').hidden=true;$('stap-code').hidden=false;toon('');$('code').focus();tgGebeurtenis('web_app_setup_closing_behavior',{need_confirmation:true});return}
  if(r.uitkomst==='ok'){einde('ok',true);return}
  if(r.uitkomst==='netwerk'||r.uitkomst==='plaats-nodig'){document.querySelectorAll('.keuze').forEach(x=>{x.disabled=false});k.classList.remove('gekozen');toon(r.uitkomst);return}
  einde(r.uitkomst||'verlopen',false);
}));
const f=$('code-form'),fb=f?f.querySelector('button[type=submit]'):null;if(f)f.addEventListener('submit',async(e)=>{e.preventDefault();if(bezig)return;bezig=true;if(fb)fb.disabled=true;const v=$('code').value;
  const r=await api('code',{code:v});bezig=false;if(fb)fb.disabled=false;$('code').value='';
  if(r.ok){einde('ok',true);return}
  if(r.uitkomst==='fout'||r.uitkomst==='netwerk'){toon(r.uitkomst);$('code').focus();return}
  einde(r.uitkomst||'verlopen',false);});
const n=$('nee');if(n)n.addEventListener('click',async()=>{if(bezig)return;bezig=true;const r=await api('weigeren',{});bezig=false;einde(r.uitkomst==='geweigerd'?'geweigerd':'verlopen',true);});
})();`;

/** Routes van het venster (openbaar: eigen sleutel = de ondertekende verwijzing + initData). */
export function vensterRoutes(openbaar: (run: (rc: RouterContext) => Promise<RouterResponse>) => unknown): Record<string, unknown> {
  const lichaam = (rc: RouterContext): Record<string, unknown> => (rc.body && typeof rc.body === 'object' ? rc.body as Record<string, unknown> : {});
  return {
    'GET /api/telegram/venster': openbaar((rc) => vensterPagina(rc)),
    'GET /api/telegram/venster.js': openbaar(async () => ({ statusCode: 200, headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }, body: VENSTER_JS })),
    'POST /api/telegram/venster/kies': openbaar(async (rc) => json(await vensterKiezen(lichaam(rc)))),
    'POST /api/telegram/venster/code': openbaar(async (rc) => json(await vensterCode(lichaam(rc)))),
    'POST /api/telegram/venster/weigeren': openbaar(async (rc) => json(await vensterWeigeren(lichaam(rc)))),
  };
}
