// AANMELDMETHODEN vNEXT — UI-kern (30.10.2026, uitvoerder F1). Twee soorten controles:
//   A. FUNCTIONEEL op de pure mapper snapshotNaarKaarten (géén DOM, géén client-import — het bestand is bewust
//      window-vrij): elke kaartstaat komt bewijsbaar uit de snapshot, niets wordt verzonnen (dossier §1.1, §5);
//   B. BRONGERICHT op de onderdelen (zelfde stijl als afstemming-ui): de bestaande beveiligingscomponenten en -routes
//      ONGEWIJZIGD in de details, geheimen alleen dáár, de koppelknop alleen bij klaarVoorKoppeling, ankers, css-poorten.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { AANMELD_AANBIEDERS, AANMELD_ANKERS, STAAT_LABEL, aanmeldTekst } from '../../shared/aanmeld-vnext-model';
import { eersteInTeStellen, groepenVan, snapshotNaarKaarten, zoekFilter, type SnapshotLike } from '../../src/aanmeld-vnext/snapshotNaarKaarten';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
/** Broncontroles op CODE, niet op toelichting: commentaarregels weglaten vóór tekst-heuristieken. */
const zonderCommentaar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((r) => r.replace(/^\s*\/\/.*$/, '')).join('\n');

/** Basis-snapshot zoals de controller hem uit /api/owner/access/snapshot houdt; per test aangepast. */
const basis = (): SnapshotLike => ({
  methods: [
    { id: 'google', enabled: true, configured: true, bound: true, status: 'active' },
    { id: 'password', enabled: true, configured: false, bound: false, status: 'not_configured' },
  ],
  factors: [
    { id: 'passkey', enabled: true, enrolled: true, status: 'active', count: 2 },
    { id: 'totp', enabled: true, enrolled: false, status: 'not_enrolled' },
    { id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 7 },
  ],
  bindings: [{ id: 'b1', method: 'google', email: 'eigenaar@voorbeeld.nl', status: 'active' }],
  lockout: { protected: false, reason: '' },
  password: { configured: false, mustChange: false },
  totp: { enrolled: false },
});

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmeld-ui-20261030');

  // ================================================================ A. functioneel — pure mapper
  const k0 = snapshotNaarKaarten(basis());
  const vind = (lijst: ReturnType<typeof snapshotNaarKaarten>, id: string) => lijst.find((k) => k.id === id);

  check('google gebonden → active + manage + accountLabel uit de binding (niets verzonnen)',
    vind(k0, 'google')?.staat === 'active' && vind(k0, 'google')?.hoofdActie === 'manage' && vind(k0, 'google')?.accountLabel === 'eigenaar@voorbeeld.nl');
  const zonderBinding = basis(); zonderBinding.bindings = []; zonderBinding.methods[0].bound = false;
  check('google geconfigureerd zonder binding → ready, zonder accountLabel',
    vind(snapshotNaarKaarten(zonderBinding), 'google')?.staat === 'ready' && vind(snapshotNaarKaarten(zonderBinding), 'google')?.accountLabel === undefined);
  const laadt = basis(); laadt.methods[0].status = 'loading'; laadt.methods[0].bound = false; laadt.bindings = [];
  check('google status loading → staat loading', vind(snapshotNaarKaarten(laadt), 'google')?.staat === 'loading');
  const vreemd = basis(); vreemd.methods[0].status = 'zzz-onbekend'; vreemd.methods[0].bound = false; vreemd.bindings = []; vreemd.methods[0].configured = false;
  check('onbekende serverstatus → EERLIJK unknown («Не вдалося перевірити») met hoofdactie retry',
    vind(snapshotNaarKaarten(vreemd), 'google')?.staat === 'unknown' && vind(snapshotNaarKaarten(vreemd), 'google')?.hoofdActie === 'retry'
    && aanmeldTekst(STAAT_LABEL.unknown, 'uk') === 'Не вдалося перевірити');

  const slot = basis(); slot.lockout = { protected: true, reason: 'LAST_METHOD' };
  const kSlot = snapshotNaarKaarten(slot);
  check('lockout.protected → google beschermd + reden als TEKST (geen tooltip-geheim)',
    vind(kSlot, 'google')?.beschermd === true && aanmeldTekst(vind(kSlot, 'google')!.staatReden!, 'uk').includes('захищено від вимкнення'));
  check('lockout.protected → passkey wordt step-up (bevestigt, logt nog niet in), anders sign-in',
    vind(kSlot, 'passkey')?.vermogen === 'step-up' && vind(k0, 'passkey')?.vermogen === 'sign-in');

  check('wachtwoordkaart BESTAAT NIET zonder configured/bound (dossier §1.1 — niets “aanbieden” dat er niet is)',
    vind(k0, 'password') === undefined);
  const metWw = basis(); metWw.password.configured = true; metWw.methods[1].status = 'active';
  check('wachtwoord geconfigureerd → kaart active/manage', vind(snapshotNaarKaarten(metWw), 'password')?.staat === 'active' && vind(snapshotNaarKaarten(metWw), 'password')?.hoofdActie === 'manage');
  const moet = basis(); moet.password.configured = true; moet.password.mustChange = true; moet.methods[1].status = 'active';
  const kMoet = vind(snapshotNaarKaarten(moet), 'password');
  check('mustChange → attention + waarschuwingscode PASSWORD_MUST_CHANGE + reden', kMoet?.staat === 'attention' && kMoet?.waarschuwingCode === 'PASSWORD_MUST_CHANGE' && !!kMoet?.staatReden);

  check('passkey: teller = exact het API-getal, nooit een eigen telling', vind(k0, 'passkey')?.teller === 2);
  const geenPk = basis(); geenPk.factors[0] = { id: 'passkey', enabled: true, enrolled: false, status: 'not_enrolled' };
  const kGeenPk = vind(snapshotNaarKaarten(geenPk), 'passkey');
  check('passkey niet ingeschreven → not-configured + setup, ZONDER teller', kGeenPk?.staat === 'not-configured' && kGeenPk?.hoofdActie === 'setup' && kGeenPk?.teller === undefined);
  const pkVreemd = basis(); pkVreemd.factors[0].status = 'raar';
  check('passkey onbekende status → unknown + retry', vind(snapshotNaarKaarten(pkVreemd), 'passkey')?.staat === 'unknown' && vind(snapshotNaarKaarten(pkVreemd), 'passkey')?.hoofdActie === 'retry');

  const totpAan = basis(); totpAan.factors[1] = { id: 'totp', enabled: true, enrolled: true, status: 'active' }; totpAan.totp.enrolled = true;
  check('totp: niet ingeschreven → setup; ingeschreven → active/manage',
    vind(k0, 'totp')?.hoofdActie === 'setup' && vind(snapshotNaarKaarten(totpAan), 'totp')?.staat === 'active' && vind(snapshotNaarKaarten(totpAan), 'totp')?.hoofdActie === 'manage');

  check('herstelcodes: teller = remaining uit de API', vind(k0, 'recovery')?.teller === 7);
  const leeg = basis(); leeg.factors[2] = { id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 0 };
  const kLeeg = vind(snapshotNaarKaarten(leeg), 'recovery');
  check('herstelcodes op (remaining 0) → attention + RECOVERY_EMPTY + teller 0 blijft eerlijk zichtbaar',
    kLeeg?.staat === 'attention' && kLeeg?.waarschuwingCode === 'RECOVERY_EMPTY' && kLeeg?.teller === 0);
  const geenHc = basis(); geenHc.factors[2] = { id: 'recovery', enabled: true, enrolled: false, status: 'not_enrolled' };
  check('herstelcodes niet aangemaakt → setup zonder teller', vind(snapshotNaarKaarten(geenHc), 'recovery')?.hoofdActie === 'setup' && vind(snapshotNaarKaarten(geenHc), 'recovery')?.teller === undefined);

  check('kluis + toegangscodes: staat EERLIJK unknown met reden «стан у деталях» (eigen levende secties, geen verzonnen badge)',
    vind(k0, 'vault')?.staat === 'unknown' && vind(k0, 'guest-code')?.staat === 'unknown'
    && aanmeldTekst(vind(k0, 'vault')!.staatReden!, 'uk').includes('деталях') && vind(k0, 'vault')?.hoofdActie === 'details' && vind(k0, 'guest-code')?.hoofdActie === 'details');
  check('geen verzonnen datums: laatstGecontroleerd ontbreekt zolang de server niets gaf', k0.every((k) => k.laatstGecontroleerd === undefined));
  check('volgorde: google eerst, kluis en gastcodes achteraan', k0[0]?.id === 'google' && k0[k0.length - 2]?.id === 'vault' && k0[k0.length - 1]?.id === 'guest-code');

  check('groepen: google→inloggen, passkey→passkey, recovery/kluis→bescherming, gastcodes→delegatie, alles overal',
    groepenVan(vind(k0, 'google')!).includes('inloggen') && groepenVan(vind(k0, 'passkey')!).includes('passkey')
    && groepenVan(vind(k0, 'recovery')!).includes('bescherming') && groepenVan(vind(k0, 'vault')!).includes('bescherming')
    && groepenVan(vind(k0, 'guest-code')!).includes('delegatie') && k0.every((k) => groepenVan(k).includes('alles')));
  const kWw = snapshotNaarKaarten(metWw);
  check('zoeken (uk): «ПАРОЛЬ» vindt de wachtwoordkaart hoofdletterongevoelig', zoekFilter(kWw, 'uk', 'ПАРОЛЬ', 'alles').some((k) => k.id === 'password'));
  check('zoeken (nl): «wachtwoord» vindt dezelfde kaart in de andere taal', zoekFilter(kWw, 'nl', 'wachtwoord', 'alles').some((k) => k.id === 'password'));
  check('zoeken: leeg zoekwoord = alle kaarten; filter verandert nooit een staat', zoekFilter(k0, 'uk', '   ', 'alles').length === k0.length && zoekFilter(k0, 'uk', '', 'alles').every((k, i) => k.staat === k0[i].staat));
  check('groepsfilter delegatie → alleen de gastcodes', zoekFilter(k0, 'uk', '', 'delegatie').map((k) => k.id).join() === 'guest-code');
  check('hero-CTA-doel: eerste niet-ingestelde van passkey/totp/recovery; alles ingesteld → null',
    eersteInTeStellen(k0)?.id === 'totp' && eersteInTeStellen(snapshotNaarKaarten(totpAan).map((k) => (k.id === 'recovery' ? k : { ...k, staat: k.staat === 'not-configured' ? 'active' as const : k.staat }))) === null);

  // ================================================================ B. brongericht
  const MIJN = [
    'src/aanmeld-vnext/AanmeldVnextPanelen.tsx', 'src/aanmeld-vnext/Laag.tsx', 'src/aanmeld-vnext/snapshotNaarKaarten.ts',
    'src/aanmeld-vnext/onderdelen/Hero.tsx', 'src/aanmeld-vnext/onderdelen/MethodeKaart.tsx',
    'src/aanmeld-vnext/onderdelen/MethodeFilter.tsx', 'src/aanmeld-vnext/onderdelen/MethodeDetail.tsx',
    'src/aanmeld-vnext/onderdelen/AanbiederCatalogus.tsx',
  ];
  const inhoud = new Map(MIJN.map((f) => [f, lees(f)]));
  for (const [f, t] of inhoud) check(`${f}: geen window.prompt/confirm/alert`, !/\b(?:window\s*\.\s*)?(?:prompt|confirm|alert)\s*\(/.test(t));

  const mapper = inhoud.get('src/aanmeld-vnext/snapshotNaarKaarten.ts') || '';
  check('mapper is puur: geen react/client/dom-import (window-veilig voor deze test zelf)',
    !mapper.includes("from 'react'") && !mapper.includes('platform/client') && !/\bdocument\.|\bwindow\./.test(mapper));

  const paneel = inhoud.get('src/aanmeld-vnext/AanmeldVnextPanelen.tsx') || '';
  check('paneel: «Це були ви?» blijft — ToegangWijziging + wijzigingUitUrl ongewijzigd aangesloten',
    paneel.includes('wijzigingUitUrl') && paneel.includes('<ToegangWijziging') && paneel.includes('id={wijziging}'));
  check('paneel: alle vijf bestaande ankers staan in de ANKER-kaartkoppeling (deep-links blijven werken)',
    AANMELD_ANKERS.every((a) => paneel.includes(`'${a}'`)));
  check('paneel: hash opent het bijbehorende detail (ankercompatibiliteit met «Безпека»/«Відновлення»)',
    paneel.includes('location.hash') && paneel.includes('setDetail(k)'));
  check('paneel: géén oude dubbele 60/450ms-sprong; hooguit één scrollIntoView',
    (paneel.match(/scrollIntoView/g) || []).length <= 1 && !/setTimeout\([^)]*,\s*(?:60|450)\)/.test(paneel));
  check('paneel: lopende TOTP-setup (p.otpauth) en verse herstelcodes (p.recovery) openen hun detail vanzelf — één-keer-geheimen gaan nooit verloren',
    paneel.includes('p.otpauth && !data.totp.enrolled') && paneel.includes('p.recovery.length'));
  check('paneel: sessies = LINK naar het bestaande tabblad (geen gedupliceerde sessie-UI)',
    paneel.includes('data-amv-sessies') && paneel.includes('/sessies?lang=') && !paneel.includes('device') && !paneel.includes('apparaatlijst'));
  check('paneel: drie secties + eerlijke lege staat', paneel.includes('Основні способи') && paneel.includes('Додатковий захист') && paneel.includes('Доступ іншим') && paneel.includes('data-amv-leeg'));
  check('paneel: hero-CTA opent de eerste in te stellen methode (nooit auto-enable)', paneel.includes('eersteInTeStellen(') && !paneel.includes('/enable'));
  check('paneel: tijdelijk wachtwoord van de controller blijft zichtbaar als melding', paneel.includes('p.tempPassword') && paneel.includes('amv-geheim'));
  check('paneel: detail krijgt altijd de VERSE kaart uit de jongste snapshot', paneel.includes('kaarten.find((k) => k.id === detail.id) || detail'));

  const hero = inhoud.get('src/aanmeld-vnext/onderdelen/Hero.tsx') || '';
  const heroCode = zonderCommentaar(hero);
  check('hero: GEEN cijfers of percentages in de teksten (dossier §3.2 — geen «100% захист»)',
    !/tr\(lang[^)]*\d/.test(heroCode) && !heroCode.includes('%') && !heroCode.includes('100'));
  check('hero: beeld alleen op tokenkleuren en aria-hidden (decoratief)', !/#[0-9a-fA-F]{3,8}\b/.test(hero) && hero.includes("aria-hidden='true'") && hero.includes('var(--accent)'));
  check('hero: CTA met data-amv-hero-cta', hero.includes('data-amv-hero-cta'));

  const kaart = inhoud.get('src/aanmeld-vnext/onderdelen/MethodeKaart.tsx') || '';
  check('kaart: hele kaart klikbaar + toetsenbord (Enter/spatie) + chevron data-amv-detail-open',
    kaart.includes('onClick={() => onOpen(k)}') && kaart.includes("e.key === 'Enter' || e.key === ' '") && kaart.includes('data-amv-detail-open'));
  check('kaart: staat als TEKST uit STAAT_LABEL + stip — kleur nooit de enige drager', kaart.includes('STAAT_LABEL[k.staat]') && kaart.includes("amv-staat is-${k.staat}"));
  check('kaart: teller alleen als het een getal uit de API is', kaart.includes("typeof k.teller === 'number'"));
  check('kaart: hoofdactie retry → onRetry (herladen), nooit een nepactie', kaart.includes("actie === 'retry'") && kaart.includes('onRetry()'));
  check('kaart: beschermd-reden zichtbaar als tekst met data-amv-beschermd', kaart.includes('data-amv-beschermd') && kaart.includes('k.staatReden'));
  check('kaart: anker-id op de kaart zelf (deep-link landt op de kaart)', kaart.includes('id: anker') || kaart.includes('{ id: anker }'));
  check('kaart: Google = merkmonogram, geen getekend vreemd logo of extern beeld', kaart.includes("amv-brand' aria-hidden='true'>G<") && !kaart.includes('img src'));

  const filter = inhoud.get('src/aanmeld-vnext/onderdelen/MethodeFilter.tsx') || '';
  check('filter: zoeken debouncet ≥250 ms en is zuiver client-side (geen fetch/api)', /setTimeout\([\s\S]*?,\s*(2[5-9]\d|[3-9]\d\d)\)/.test(filter) && !filter.includes('api.') && !filter.includes('fetch('));
  check('filter: chips per groep met aria-pressed + data-amv-groep', filter.includes('aria-pressed={groep === g}') && filter.includes('data-amv-groep'));

  const detail = inhoud.get('src/aanmeld-vnext/onderdelen/MethodeDetail.tsx') || '';
  check('detail: de BESTAANDE componenten 1:1 — PasskeysSection/HerstelcodesSectie/SleutelkluisSectie/Toegangscodes',
    detail.includes('<PasskeysSection lang={lang} context={p.context}') && detail.includes('<SleutelkluisSectie lang={lang} context={p.context}')
    && detail.includes('<Toegangscodes lang={lang} context={p.context}') && detail.includes('<HerstelcodesSectie'));
  check('detail: herstelcodes met de volledige controllerprops (codes/nieuweHerstelcodes/recoverySaved) — het één-keer-venster blijft het bestaande',
    detail.includes('codes={p.recovery}') && detail.includes('nieuweHerstelcodes={p.nieuweHerstelcodes}') && detail.includes('recoverySaved={p.recoverySaved}'));
  check('detail: TOTP via dezelfde echte routes start→secret→6 cijfers→confirm',
    detail.includes("write('/api/owner/access/totp/start')") && detail.includes("write('/api/owner/access/totp/confirm', { code: p.code })")
    && detail.includes("replace(/\\D+/g, '')") && detail.includes('maxLength={6}'));
  check('detail: TOTP-geheim alleen hier, in amv-geheim, met «показано один раз»; uitschakelen via p.totpUitschakelen',
    detail.includes('{p.secret}') && detail.includes('Ключ показано один раз') && detail.includes('p.totpUitschakelen()'));
  // IDENTITEIT-013: de tweede stap is nu de gedeelde bevestigingsdialoog (gevaarlijk), niet meer een inline knop is-gevaar.
  check('detail: wachtwoord via dezelfde routes set/remove; verwijderen in twee stappen (BevestigDialoog gevaarlijk) en geblokkeerd bij lockout.protected',
    detail.includes("write('/api/owner/access/password/set', { password: p.password })") && detail.includes("write('/api/owner/access/password/remove')")
    && detail.includes('<BevestigDialoog open={wachtwoordWeg}') && detail.includes('gevaarlijk') && detail.includes('busy || data.lockout.protected'));
  check('detail: google — extern beheer bij Google + eerlijke enige-weg-melding (data-google-enige), geen verzonnen «laatste login»',
    detail.includes('https://myaccount.google.com/security') && detail.includes('data-google-enige') && !/laatste login|востаннє|last.login/i.test(detail));
  check('geheimen NOOIT buiten het detail: kaart/overzicht/filter/hero raken p.secret, otpauth, p.recovery of nieuweHerstelcodes niet aan',
    [kaart, filter, hero].every((t) => !t.includes('secret') && !t.includes('otpauth') && !t.includes('p.recovery') && !t.includes('nieuweHerstelcodes'))
    && !paneel.includes('p.secret') && !paneel.includes('{p.recovery')); /* het paneel kijkt alleen naar p.recovery.length om het detail te openen */

  const laag = inhoud.get('src/aanmeld-vnext/Laag.tsx') || '';
  check('laag: role=dialog + aria-modal, Escape sluit, Tab blijft binnen, focus keert terug',
    laag.includes("role='dialog'") && laag.includes("aria-modal='true'") && laag.includes("'Escape'") && laag.includes("e.key !== 'Tab'") && laag.includes('terug.current?.focus'));
  check('laag: smal = volledig scherm, breed = zijpaneel (is-scherm/is-paneel)', laag.includes('is-${soort}') && detail.includes("smal ? 'scherm' : 'paneel'"));

  const cat = inhoud.get('src/aanmeld-vnext/onderdelen/AanbiederCatalogus.tsx') || '';
  check('catalogus: levende stand via POST /api/owner/aanmeld/vnext/aanbieders met context', cat.includes("api.post('/api/owner/aanmeld/vnext/aanbieders', context)"));
  check('catalogus: koppelknop BESTAAT alleen bij klaarVoorKoppeling===true van de server (nu dus nooit)',
    cat.includes('Boolean(live?.klaarVoorKoppeling)') && /\{klaar \? <button[^>]*data-amv-koppelknop/.test(cat) && (cat.match(/data-amv-koppelknop/g) || []).length === 1);
  check('catalogus: sleutelchecklist toont alleen NAMEN (code{naam}), nooit waarden', cat.includes('<code>{naam}</code>') && !/waarde|value=|\.secret/.test(zonderCommentaar(cat)));
  check('catalogus: fout → «Стан не вдалося перевірити» + Повторити (data-amv-catalogus-opnieuw)', cat.includes('Стан не вдалося перевірити') && cat.includes('data-amv-catalogus-opnieuw'));
  check('catalogus: zelftest eerlijk drieledig (пройдено/не пройдено/ще не виконувався)', cat.includes('пройдено') && cat.includes('не пройдено') && cat.includes('ще не виконувався'));
  check('catalogus: uitleg + omweg uit het gedeelde contract worden getoond', cat.includes('aanmeldTekst(a.uitleg, lang)') && cat.includes('aanmeldTekst(a.omweg, lang)'));
  check('gedeeld contract eerlijk: whatsapp niet-mogelijk, sms gepland, 4 aanbieders met sleutellijsten',
    AANMELD_AANBIEDERS.find((a) => a.id === 'whatsapp')?.stand === 'niet-mogelijk' && AANMELD_AANBIEDERS.find((a) => a.id === 'sms')?.stand === 'gepland'
    && AANMELD_AANBIEDERS.filter((a) => a.stand === 'sleutels-nodig').every((a) => (a.vereist?.length || 0) >= 2));

  // ---- css-poorten
  const css = lees('src/aanmeld-vnext/aanmeld-vnext.css');
  const f1 = css.slice(css.indexOf('F1:'));
  check('css: het F1-blok is aangeplakt onder de basis en gebruikt alleen tokens (geen hex)', f1.length > 400 && !/#[0-9a-fA-F]{3,8}\b/.test(f1) && f1.includes('var(--accent'));
  check('css (F1): geen nieuwe position:fixed; het geheel heeft precies de ene geregistreerde .amv-laag',
    !/position\s*:\s*fixed/.test(f1) && (css.match(/position\s*:\s*fixed/g) || []).length === 1);
  check('css: alle vier breekpunten + ≥1920-kap aanwezig', ['max-width: 599px', 'min-width: 600px', 'min-width: 860px', 'min-width: 1200px', 'min-width: 1920px'].every((m) => f1.includes(m)));
  check('css: ≥1200 drie kaarten per rij, hero 220–280, container ±1160–1220', f1.includes('repeat(3, minmax(0, 1fr))') && f1.includes('min-height: 220px') && f1.includes('max-height: 280px') && f1.includes('max-width: 1160px') && f1.includes('max-width: 1220px'));
  check('css: tikdoelen via var(--tik-hoogte)/-mobiel (44px op aanraak), reduced-motion gerespecteerd',
    f1.includes('var(--tik-hoogte)') && f1.includes('var(--tik-hoogte-mobiel)') && f1.includes('prefers-reduced-motion'));
  check('css: mobiel = rijkaarten (1 kolom basis) en 2-koloms catalogustegels', f1.includes('grid-template-columns: 1fr') && /max-width: 599px[\s\S]*?amv-tegels \{ grid-template-columns: repeat\(2/.test(f1));

  // ---- de afgesproken data-amv-haken (e2e-contract) + integratie
  const alles = [...inhoud.values()].join('\n');
  for (const h of ['data-amv-pagina', 'data-amv-hero', 'data-amv-hero-cta', 'data-amv-zoek', 'data-amv-groep', 'data-amv-kaart', 'data-amv-staat',
    'data-amv-actie', 'data-amv-detail-open', 'data-amv-detail', 'data-amv-beschermd', 'data-amv-leeg', 'data-amv-sessies',
    'data-amv-catalogus', 'data-amv-catalogus-opnieuw', 'data-amv-aanbieder', 'data-amv-sleutel', 'data-amv-aanwezig', 'data-amv-koppelknop'])
    check(`haak ${h} bestaat`, alles.includes(h));
  for (const [f, t] of inhoud) if (f.endsWith('.tsx')) check(`${f}: teksten via tr(/aanmeldTekst (uk+nl)`, /\btr\(/.test(t) || t.includes('aanmeldTekst('));
  const controller = lees('src/ToegangslaagWeergave.tsx');
  check('controller (NIET door F1 aangeraakt): wissel rendert AanmeldVnextPanelen alleen op methods+vlag+identity, oude panelen als fallback',
    controller.includes("tab==='methods'&&aanmeldVnext&&mode==='identity'") && controller.includes('<AanmeldVnextPanelen') && controller.includes('Suspense fallback={panelen}'));

  return einde();
}
