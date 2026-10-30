// Ontgrendeling van de browserextensie (extensie 0.5 → 0.6, 19.10.2026: twee profielen = twee sloten).
//
// Eén bron voor server (backend/extensie-ontgrendeling.ts), site (src/extensie/*) en tests. De extensie heeft een eigen kopie van
// ontgrendelTekst() in extension/shared.js (geen bundler in de extensie); tests/eenheid/extensie-ontgrendeling-crypto.test.ts houdt
// beide gelijk met een vaste testvector.
//
// Regels:
//  - Standaard is de extensie VERGRENDELD: zonder geldige ontgrendeling voert ze geen enkele opdracht van een AI uit en verzamelt ze
//    niets (geen console, netwerk of DOM).
//  - Twee sloten per browser (= twee koppelingen, elk een eigen agent met een eigen ruimte, shared/ai-ruimte.ts):
//      'prive'     — de gebruiker geeft zijn EIGEN AI toegang tot zijn eigen diensten (PRIVE_HOSTS, nooit admin.*). Ontgrendelen =
//                    ingelogd + verse step-up van DEZE sessie (passkey, TOTP of Google-herbevestiging); caps = actieve AI-toestemmingen
//                    (ai-grants) van die browser ∩ beleid; ≤ 30 dagen.
//      'technisch' — beheer: lopende technische activering + verse assertie (UV) van een EIGEN passkey; caps = rollen; ≤ 8 uur.
//  - De server ondertekent de ontgrendeling met de opdrachtsleutel van de koppeling (HMAC-SHA256); alleen de server en deze extensie
//    kennen die sleutel. De site (JavaScript op de pagina) ziet hem nooit en kan dus geen ontgrendeling vervalsen.
//  - Beleid per gebruiker (app.extensie_beleid, migratie 0073; eigenaar of 'users.manage') kapt elke ontgrendeling.
//  - Een ontgrendeling eindigt bij: einde van de gekozen duur, einde van de technische activering, intrekken (site, beheer, pop-up,
//    zijpaneel, opties), strenger beleid, noodstop, uitloggen, herstart van de browser (chrome.storage.session).
import type { AiRuimte } from './ai-ruimte';

/** 0.6: ontgrendeling v2 (met ruimte). Een extensie onder deze versie kan v2 niet controleren en krijgt geen ontgrendeling. */
export const MIN_EXTENSIE_VERSIE = '0.6.2';
/** Versie van het ondertekende formaat. */
export const ONTGRENDELING_VERSIE = 2 as const;

// ---------------------------------------------------------------- 0.6.1: debuggerrecht (punt 7 eigenaar 19.10.2026)
/**
 * Stand van het Chrome-recht `debugger` (diepe diagnose via CDP). Eén bron voor de extensie (extension/shared.js + ui.js),
 * de site (src/extensie/extensie-live.ts) en de tests.
 *  'ja'              — het recht is er NU (pakket «діагностика»: `debugger` staat in manifest.permissions).
 *  'nee'             — geen recht en nooit aangevraagd/geweigerd door de gebruiker.
 *  'geweigerd'       — de gebruiker klikte «нет» in het venster van Chrome.
 *  'ingetrokken'     — de gebruiker had diepe diagnose aangezet, maar het recht is er niet (meer) (permissions.onRemoved).
 *  'niet-aanvraagbaar' — Chrome staat `debugger` niet toe als optioneel recht: permissions.request faalt altijd met
 *                      «Only permissions specified in the manifest may be requested». Enige weg: het pakket «діагностика».
 */
export const DIAG_RECHT_STANDEN = ['ja', 'nee', 'geweigerd', 'ingetrokken', 'niet-aanvraagbaar'] as const;
export type DiagRechtStand = typeof DIAG_RECHT_STANDEN[number];
export const isDiagRechtStand = (v: unknown): v is DiagRechtStand => typeof v === 'string' && (DIAG_RECHT_STANDEN as readonly string[]).includes(v);
/** Pakket waarin `debugger` vast in het manifest staat (bouw-extensie.mjs schrijft het naar /downloads). */
export const DIAG_PAKKET = 'mijn-ruimte-extension-diagnose.zip';
/** Diepe diagnose (chrome.debugger) mag ALLEEN in deze ruimte. */
export const DIAG_RUIMTE: AiRuimte = 'technisch';
/** Welke mogelijkheid een ontgrendeling moet geven voordat de debugger mag aanhaken. */
export const DIAG_CAP = 'browser.debug';

/**
 * Kleur van de markering per profiel van het tabblad (punt 8 eigenaar 19.10.2026): dunne rand op de pagina + badge op het
 * pictogram. Gebruikersprofiel groen, technisch profiel oranje — dezelfde waarden in extension/shared.js en in de extensie-UI.
 */
export const MARKERING_KLEUREN: Readonly<Record<AiRuimte, string>> = Object.freeze({ prive: '#1a7f37', technisch: '#b45309' });
/** Badge-tekst op het pictogram per ruimte (chrome.action.setBadgeText). */
export const MARKERING_BADGE: Readonly<Record<AiRuimte, string>> = Object.freeze({ prive: 'ON', technisch: 'TECH' });

/**
 * 0.7.0 (zone E, 22.10.2026): twee mogelijkheden erbij — 'browser.console' (console + netwerk van het tabblad; tot 0.6.2 zat dat
 * onder 'browser.read') en 'browser.script' (evaluate_script via de Chrome-debugger, alleen technisch slot + pakket «diagnose»,
 * nooit zonder uitdrukkelijk vinkje in de matrix «Браузер і агенти»). Een extensie < 0.7.0 kent ze niet: de server haalt ze
 * uit de ontgrendeling voor zo'n extensie (capsVoorVersie) en weigert de bijbehorende opdrachten zelf.
 */
export const BROWSER_CAPS = ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'] as const;
export type BrowserCap = typeof BROWSER_CAPS[number];
/** Mogelijkheden die een extensie vóór 0.7.0 kent (extension/shared.js 0.6.2: BROWSER_CAPS met vijf waarden). */
export const BROWSER_CAPS_OUD: readonly BrowserCap[] = Object.freeze(['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug']);
/** Vanaf deze versie kent de extensie de zeven mogelijkheden én termijnen tot een jaar (shared/extensie-matrix.ts). */
export const EXTENSIE_VERSIE_MATRIX = '0.7.0';
export const isBrowserCap = (v: unknown): v is BrowserCap => typeof v === 'string' && (BROWSER_CAPS as readonly string[]).includes(v);

/** Mogelijkheden per technische rol (shared/tech-rollen.ts). Unie over alle rollen van de activering. */
export const CAPS_PER_ROL: Readonly<Record<string, readonly BrowserCap[]>> = Object.freeze({
  ondersteuning: ['browser.read', 'browser.screenshot', 'browser.console'],
  auditor: ['browser.read', 'browser.console'],
  tester: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console'],
  ontwikkelaar: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'],
  beheerder: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'],
  eigenaar: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'],
});
export function capsVoorRollen(rollen: readonly string[]): BrowserCap[] {
  const s = new Set<BrowserCap>();
  for (const r of rollen) for (const c of CAPS_PER_ROL[r] ?? []) s.add(c);
  return BROWSER_CAPS.filter((c) => s.has(c));
}

/** Lokale agent (Native Messaging) mag nooit meer dan lezen. */
export const LOKAAL_CAPS: readonly BrowserCap[] = Object.freeze(['browser.read']);

/** Administratieve pagina's waar de extensie in het TECHNISCHE slot verzamelt en bedient (standaard). */
export const ADMIN_HOSTS_STANDAARD = Object.freeze(['admin.tarasevych.com', 'mcp.tarasevych.com']);
/** Alle hosts die bij een TECHNISCHE ontgrendeling gekozen mogen worden (eigen diensten). */
export const ADMIN_HOSTS_TOEGESTAAN = Object.freeze([
  'admin.tarasevych.com', 'mcp.tarasevych.com', 'hub.tarasevych.com', 'id.tarasevych.com', 'ai.tarasevych.com',
  'mail.tarasevych.com', 'cloud.tarasevych.com', 'github.tarasevych.com', 'huis.tarasevych.com', 'api.tarasevych.com',
]);
export const isToegestaneHost = (h: unknown): h is string => typeof h === 'string' && ADMIN_HOSTS_TOEGESTAAN.includes(h);

/** Hosts van de eigen diensten van de gebruiker (slot 'prive'). NOOIT admin.* of api.*; standaard alle. */
export const PRIVE_HOSTS = Object.freeze([
  'hub.tarasevych.com', 'mail.tarasevych.com', 'cloud.tarasevych.com', 'ai.tarasevych.com', 'id.tarasevych.com',
  'github.tarasevych.com', 'huis.tarasevych.com', 'mcp.tarasevych.com',
]);
export const isPriveHost = (h: unknown): h is string => typeof h === 'string' && PRIVE_HOSTS.includes(h);
/** Welke hosts mogen in een ontgrendeling van deze ruimte staan. */
export const hostsVoorRuimte = (ruimte: AiRuimte): readonly string[] => (ruimte === 'prive' ? PRIVE_HOSTS : ADMIN_HOSTS_TOEGESTAAN);

// ---------------------------------------------------------------- duur
/** Technisch: minuten (korte keuzes; de lange termijnen staan in shared/extensie-matrix.ts ONTGRENDEL_TERMIJNEN). */
export const DUUR_KEUZES = Object.freeze([15, 30, 60, 120, 240]);
export const STANDAARD_MINUTEN = 60;
/**
 * 0.7.0 (zone E): de eigenaar kiest zelf hoe lang een ontgrendeling leeft — tot een jaar, in beide ruimtes (klacht 2 van
 * 22.10.2026: «кожні чотири години мушу вмикати дозвіл»). MAX_MINUTEN_OUD is de grens die een extensie < 0.7.0 nog afdwingt
 * (8 uur technisch, 30 dagen privé): een langere ontgrendeling gaat alleen naar een extensie die hem kan controleren.
 */
export const MAX_MINUTEN_OUD = 480;
export const PRIVE_MAX_DAGEN_OUD = 30;
export const MAX_DAGEN = 366;
export const MAX_MINUTEN = MAX_DAGEN * 24 * 60;
/** Privé: dagen (korte keuzes; de volledige lijst — tot een jaar, tot uitloggen, tot intrekken — in shared/extensie-matrix.ts). */
export const PRIVE_DAGEN_KEUZES = Object.freeze([1, 7, 30, 182, 365] as const);
export type PriveDagen = typeof PRIVE_DAGEN_KEUZES[number];
export const PRIVE_STANDAARD_DAGEN: PriveDagen = 1;
export const PRIVE_MAX_DAGEN = MAX_DAGEN;
/** Speling voor klokverschil tussen server en browser. */
export const KLOK_SPELING_MS = 60_000;
/** Hoogste duur (ms) van één ontgrendeling per ruimte (zelfde grens als de CHECK in 0073 en de controle in de extensie). */
export const MAX_DUUR_MS: Readonly<Record<AiRuimte, number>> = Object.freeze({ technisch: MAX_MINUTEN * 60_000, prive: PRIVE_MAX_DAGEN * 86_400_000 });

/** Wat de server ondertekent en de extensie controleert (v2, 0.6). */
/**
 * Hoe een ontgrendeling eindigt (0110, zone E): 'duur' = op exp; 'tech-einde' = met de technische activering (zoals 0.5/0.6);
 * 'uitloggen' = bij uitloggen van dit account (exp is dan een achtervang van een jaar); 'handmatig' = alleen door intrekken
 * (zelfde achtervang); 'browser' (0111) = tot de browser sluit: de extensie ≥ 0.7.0 meldt bij elke verbinding een
 * browsersessie-id (chrome.storage.session), een andere id = de browser is herstart → de server trekt in. Uitloggen sluit ELKE
 * soort (backend/extensie-ontgrendeling.ts naUitloggen). Niet ondertekend: de extensie kent alleen exp; de server trekt in en duwt 'vergrendel'.
 */
export const EINDE_SOORTEN = ['duur', 'tech-einde', 'uitloggen', 'handmatig', 'browser'] as const;
export type EindeSoort = typeof EINDE_SOORTEN[number];
export const isEindeSoort = (v: unknown): v is EindeSoort => typeof v === 'string' && (EINDE_SOORTEN as readonly string[]).includes(v);

export type Ontgrendeling = {
  v: 2;
  gid: string;          // uuid van de rij in app.extensie_ontgrendelingen
  agentId: string;
  userId: string;
  ruimte: AiRuimte;     // moet gelijk zijn aan het slot dat hem ontvangt
  caps: BrowserCap[];
  domeinen: string[];   // hostnamen (exact), ⊂ hostsVoorRuimte(ruimte), niet leeg
  lokaal: boolean;      // lokale agent via Native Messaging toegestaan (alleen LOKAAL_CAPS)
  iat: number;          // ms
  exp: number;          // ms, ≤ iat + MAX_DUUR_MS[ruimte]
  nonce: string;        // base64url, 16 bytes
};
/** Alleen weergave (niet ondertekend). */
export type OntgrendelingInfo = { rollen: string[]; passkey: string; activatieTot: number | null };

/**
 * Canonieke tekst v2 (zelfde als extension/shared.js ontgrendelTekst). Lijsten gesorteerd, komma-gescheiden, regels met \n:
 * mr-ontgrendeling-v2, gid, agentId, userId, ruimte, caps, domeinen, lokaal (1/0), iat, exp, nonce.
 */
export function ontgrendelTekst(g: Ontgrendeling): string {
  const lijst = (a: readonly string[]) => [...a].map(String).sort().join(',');
  return ['mr-ontgrendeling-v2', g.gid, g.agentId, g.userId, g.ruimte, lijst(g.caps), lijst(g.domeinen), g.lokaal ? '1' : '0', String(g.iat), String(g.exp), g.nonce].join('\n');
}

/** Staat van de extensie zoals de extensie hem meldt (WS {t:'status'}) en de site hem toont. */
export type ExtensieStaat = 'niet-gekoppeld' | 'vergrendeld' | 'ontgrendeld' | 'agent';
export const STAAT_TEKST: Readonly<Record<ExtensieStaat, readonly [uk: string, nl: string]>> = Object.freeze({
  'niet-gekoppeld': ['Не підключено до сайту', 'Niet gekoppeld'],
  vergrendeld: ['Очікування підтвердження', 'Wacht op bevestiging'],
  ontgrendeld: ['Доступ відкрито', 'Toegang open'],
  agent: ['ШІ-агент підключено', 'AI-agent verbonden'],
});

/** 'beleid' = strenger beleid (0073) trok in; 'beheer' = eigenaar/users.manage trok in via «Усі користувачі». */
export type VergrendelReden = 'ingetrokken' | 'verlopen' | 'tech-einde' | 'popup' | 'zijpaneel' | 'opties' | 'site' | 'noodstop' | 'uitgelogd' | 'nieuw' | 'ontkoppeld' | 'beleid' | 'beheer' | 'browser-gesloten' | 'site-sessie-weg';

/** Weigeringen bij ontgrendelen en beheer: code → uitleg + wat de gebruiker kan doen. */
export type Weigercode =
  | 'NIET_INGELOGD' | 'ACCOUNT_GEBLOKKEERD' | 'GEEN_TECH_PROFIEL' | 'TECH_NIET_ACTIEF' | 'GEEN_BROWSER_RECHTEN' | 'GEEN_PASSKEY'
  | 'AGENT_ONBEKEND' | 'GEEN_BROWSER_AGENT' | 'GEEN_OPDRACHTSLEUTEL' | 'EXTENSIE_TE_OUD' | 'DOMEIN_ONGELDIG' | 'DUUR_ONGELDIG'
  | 'UITDAGING_ONGELDIG' | 'PASSKEY_ONGELDIG' | 'TE_VEEL_POGINGEN'
  // 0.6
  | 'STEP_UP_REQUIRED' | 'BELEID_UIT' | 'VERKEERDE_RUIMTE' | 'GEEN_BEHEERRECHT' | 'GEBRUIKER_ONBEKEND' | 'EIGENAAR_ONAANTASTBAAR'
  | 'NIET_AAN_JEZELF' | 'BUITEN_BELEID' | 'ONTGRENDELING_ONBEKEND' | 'ONGELDIG'
  // 20.10.2026: het technische SLOT is ondergeschikt aan de stand van de dienst «Підключення ШІ» in de technische
  // gegevensruimte (app.ruimte_dienst_stand, shared/ruimte-scheiding.ts). Staat die op «Вимкнено» of is zij bevroren, dan
  // bestaat er geen technische kant om te ontgrendelen. Dit maakt de zes voorwaarden niet losser: het is er een zevende bij.
  | 'RUIMTE_DIENST_UIT'
  // 0110 (zone E): een termijn langer dan 8 u (technisch) / 30 d (privé) kan alleen een extensie ≥ 0.7.0 controleren.
  | 'TERMIJN_VEREIST_UPDATE';
type Uitleg = { uk: string; nl: string; actie?: { uk: string; nl: string; url: string } };
const HUB_EXTENSIE = 'https://mcp.tarasevych.com/agents#extensie';
export const WEIGER_UITLEG: Readonly<Record<Weigercode, Uitleg>> = Object.freeze({
  NIET_INGELOGD: { uk: 'Спочатку увійдіть на сайт.', nl: 'Log eerst in op de site.', actie: { uk: 'Увійти', nl: 'Inloggen', url: 'https://id.tarasevych.com/' } },
  ACCOUNT_GEBLOKKEERD: { uk: 'Доступ ШІ для цього облікового запису заблоковано. Розблокувати може лише власник.', nl: 'AI-toegang voor dit account is geblokkeerd. Alleen de eigenaar kan dat opheffen.' },
  GEEN_TECH_PROFIEL: { uk: 'У вашого облікового запису немає технічного профілю. Технічний доступ розширення відкривається лише з технічними правами — попросіть власника призначити профіль. Доступ «як користувач» працює і без нього.', nl: 'Uw account heeft geen technisch profiel. Technische toegang via de extensie gaat alleen open met technische rechten — vraag de eigenaar om een profiel. Toegang «als gebruiker» werkt ook zonder.' },
  TECH_NIET_ACTIEF: { uk: 'Технічний профіль не активний у цій вкладці. Активуйте його (смуга «Технічний профіль») і повторіть.', nl: 'Het technische profiel is in dit tabblad niet actief. Activeer het en probeer opnieuw.', actie: { uk: 'Активувати технічний профіль', nl: 'Technisch profiel activeren', url: 'https://admin.tarasevych.com/?tech=activeren' } },
  GEEN_BROWSER_RECHTEN: { uk: 'Ваші технічні ролі не дають жодного права керувати браузером.', nl: 'Uw technische rollen geven geen browserrechten.' },
  GEEN_PASSKEY: { uk: 'Для розблокування потрібен ваш власний passkey. Додайте його в «Способи входу».', nl: 'Voor ontgrendelen is een eigen passkey nodig. Voeg er een toe bij «Aanmeldmethoden».', actie: { uk: 'Додати passkey', nl: 'Passkey toevoegen', url: 'https://id.tarasevych.com/methods' } },
  AGENT_ONBEKEND: { uk: 'Цей браузер не підключено до вашого облікового запису. Підключіть розширення ще раз.', nl: 'Deze browser is niet aan uw account gekoppeld. Koppel de extensie opnieuw.' },
  GEEN_BROWSER_AGENT: { uk: 'Обраний пристрій — не браузерне розширення.', nl: 'Het gekozen apparaat is geen browserextensie.' },
  GEEN_OPDRACHTSLEUTEL: { uk: 'Підключення старе й не має ключа підпису. Підключіть розширення ще раз.', nl: 'De koppeling is oud en heeft geen ondertekensleutel. Koppel opnieuw.' },
  EXTENSIE_TE_OUD: {
    uk: `Потрібне розширення ${MIN_EXTENSIE_VERSIE} або новіше. Це розширення старіше, тому підписане розблокування воно не зможе перевірити. Оновіть розширення — смуга «Доступне оновлення розширення» вгорі сторінки проведе крок за кроком; нічого не зникає, підключення залишається.`,
    nl: `Extensie ${MIN_EXTENSIE_VERSIE} of nieuwer is nodig. Deze extensie is ouder en kan de ondertekende ontgrendeling niet controleren. Werk de extensie bij — de balk «Update van de extensie» bovenaan loopt de stappen door; de koppeling blijft staan.`,
    actie: { uk: 'Як оновити розширення', nl: 'Extensie bijwerken', url: 'https://mcp.tarasevych.com/agents?extension=update#extensie' },
  },
  DOMEIN_ONGELDIG: { uk: 'Можна обрати лише сторінки власного сайту.', nl: 'Alleen pagina’s van de eigen site.' },
  DUUR_ONGELDIG: { uk: 'Недопустима тривалість.', nl: 'Ongeldige duur.' },
  UITDAGING_ONGELDIG: { uk: 'Запит підтвердження застарів. Спробуйте ще раз.', nl: 'De bevestiging is verlopen. Probeer opnieuw.' },
  PASSKEY_ONGELDIG: { uk: 'Passkey не підтверджено. Нічого не відкрито.', nl: 'Passkey niet bevestigd. Er is niets geopend.' },
  TE_VEEL_POGINGEN: { uk: 'Забагато спроб. Зачекайте хвилину.', nl: 'Te veel pogingen. Wacht een minuut.' },
  STEP_UP_REQUIRED: { uk: 'Підтвердіть доступ (passkey, код з додатка або повторний вхід через Google) і повторіть.', nl: 'Bevestig de toegang (passkey, code uit de app of opnieuw aanmelden bij Google) en probeer opnieuw.' },
  BELEID_UIT: { uk: 'Власник або адміністратор вимкнув цей доступ розширення для вашого облікового запису.', nl: 'De eigenaar of een beheerder heeft deze extensietoegang voor uw account uitgezet.' },
  VERKEERDE_RUIMTE: { uk: 'Це підключення розширення належить до іншого профілю (користувач / технічний). Оберіть правильний слот.', nl: 'Deze koppeling hoort bij het andere profiel (gebruiker / technisch). Kies het juiste slot.' },
  GEEN_BEHEERRECHT: { uk: 'Керувати доступами інших може лише власник або технічний профіль із правом «керування користувачами».', nl: 'Alleen de eigenaar of een technisch profiel met «gebruikers beheren» kan de toegang van anderen beheren.', actie: { uk: 'Активувати технічний профіль', nl: 'Technisch profiel activeren', url: 'https://admin.tarasevych.com/?tech=activeren' } },
  GEBRUIKER_ONBEKEND: { uk: 'Користувача не знайдено.', nl: 'Gebruiker niet gevonden.' },
  EIGENAAR_ONAANTASTBAAR: { uk: 'Доступи власника може змінювати лише сам власник.', nl: 'Alleen de eigenaar zelf kan zijn toegang wijzigen.' },
  NIET_AAN_JEZELF: { uk: 'Власні обмеження може змінити лише інший адміністратор або власник.', nl: 'Uw eigen beperkingen kan alleen een andere beheerder of de eigenaar wijzigen.' },
  BUITEN_BELEID: { uk: 'Це виходить за межі дозволеного правилами доступу.', nl: 'Dit valt buiten het toegangsbeleid.' },
  ONTGRENDELING_ONBEKEND: { uk: 'Цей доступ уже закінчився або відкликаний.', nl: 'Deze toegang is al voorbij of ingetrokken.' },
  ONGELDIG: { uk: 'Недійсний запит.', nl: 'Ongeldig verzoek.' },
  RUIMTE_DIENST_UIT: {
    uk: 'У технічному просторі служба «Підключення ШІ» вимкнена або заморожена, тому технічного слоту розширення немає. Під’єднайте цю службу в технічному просторі — з підтвердженням — або скористайтеся слотом «як користувач».',
    nl: 'In de technische ruimte staat de dienst «AI-verbindingen» uit of is zij bevroren, dus er is geen technisch slot van de extensie. Verbind die dienst in de technische ruimte — met een bevestiging — of gebruik het slot «als gebruiker».',
    actie: { uk: 'Простори даних', nl: 'Gegevensruimtes', url: 'https://mcp.tarasevych.com/agents#ruimte' },
  },
  TERMIJN_VEREIST_UPDATE: {
    uk: `Такий довгий строк може перевірити лише розширення ${EXTENSIE_VERSIE_MATRIX} або новіше; у цьому браузері стоїть старіше. Оновіть розширення або оберіть строк до 4 годин (технічний) чи до 30 днів (приватний).`,
    nl: `Zo’n lange termijn kan alleen extensie ${EXTENSIE_VERSIE_MATRIX} of nieuwer controleren; in deze browser staat een oudere. Werk de extensie bij of kies een termijn tot 4 uur (technisch) of 30 dagen (privé).`,
    actie: { uk: 'Як оновити розширення', nl: 'Extensie bijwerken', url: 'https://mcp.tarasevych.com/agents?extension=update#extensie' },
  },
});
/** Andere uitleg voor het slot 'prive' (zelfde code, andere oorzaak). */
export const WEIGER_UITLEG_PRIVE: Readonly<Partial<Record<Weigercode, Uitleg>>> = Object.freeze({
  GEEN_BROWSER_RECHTEN: {
    uk: 'Спершу дозвольте ШІ щось у вкладці „Розширення браузера → Що може ШІ“.',
    nl: 'Sta de AI eerst iets toe in het tabblad „Browserextensie → Wat mag de AI“.',
    actie: { uk: 'Що може ШІ', nl: 'Wat mag de AI', url: HUB_EXTENSIE },
  },
});
export function weigerUitleg(code: Weigercode, ruimte?: AiRuimte | null): Uitleg {
  return (ruimte === 'prive' ? WEIGER_UITLEG_PRIVE[code] : undefined) ?? WEIGER_UITLEG[code];
}
export const isWeigercode = (v: unknown): v is Weigercode => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEIGER_UITLEG, v);

// ---------------------------------------------------------------- beleid (0073)
/** Beleid per gebruiker; ontbreekt de rij, dan geldt STANDAARD_BELEID. caps null = alle. */
export type ExtensieBeleid = {
  priveAan: boolean; technischAan: boolean;
  priveCaps: BrowserCap[] | null; technischCaps: BrowserCap[] | null;
  priveMaxDagen: number; technischMaxMinuten: number; lokaalAan: boolean;
  notitie: string; gewijzigdDoor: string | null; gewijzigdOp: number | null;
};
export const STANDAARD_BELEID: Readonly<ExtensieBeleid> = Object.freeze({
  priveAan: true, technischAan: true, priveCaps: null, technischCaps: null, priveMaxDagen: PRIVE_MAX_DAGEN, technischMaxMinuten: MAX_MINUTEN,
  lokaalAan: true, notitie: '', gewijzigdDoor: null, gewijzigdOp: null,
});
/** Velden die POST …/extensie-beheer/beleid accepteert (alle optioneel; ontbrekend = ongewijzigd). */
export type ExtensieBeleidInvoer = Partial<Pick<ExtensieBeleid, 'priveAan' | 'technischAan' | 'priveCaps' | 'technischCaps' | 'priveMaxDagen' | 'technischMaxMinuten' | 'lokaalAan' | 'notitie'>>;

// ---------------------------------------------------------------- status (site)
/** Ontgrendeling zoals de site hem ziet (niet ondertekend). */
export type OntgrendelingWeergave = Pick<Ontgrendeling, 'gid' | 'caps' | 'domeinen' | 'lokaal' | 'ruimte'> & { begin: number; eind: number; rollen: string[]; bevestigdMet: string | null;
  /** 0.7.0: hoe de ontgrendeling eindigt en of ze de technische activering overleeft (zie EINDE_SOORTEN). Oude rijen: 'duur'/'tech-einde'. */
  eindeSoort?: EindeSoort; overleeftActivatie?: boolean };

/** Status van één gekoppeld slot (= één agent) zoals GET /api/owner/agents/extensie-status hem geeft. */
export type ExtensieAgentStatus = {
  agentId: string; naam: string; ruimte: AiRuimte;
  /** Groepeert de sloten van dezelfde browserinstallatie (afgeleid van pairingId; nooit de pairingId zelf). */
  browserId: string;
  online: boolean; versie: string;
  staat: ExtensieStaat | 'onbekend';           // laatste melding van de extensie zelf
  ontgrendeling: OntgrendelingWeergave | null;
  ai: { verbonden: boolean; agenten: Array<{ naam: string; laatst: number }> };
  lokaal: { verbonden: boolean };
  laatstGezien: number | null;
  /** Alleen voor 'prive': welke browser-caps de actieve AI-toestemmingen van DEZE browser nu geven (∩ beleid) en tot wanneer. */
  toestemming?: { caps: BrowserCap[]; tot: number | null };
};
export type ExtensieBrowser = { browserId: string; naam: string; prive: ExtensieAgentStatus | null; technisch: ExtensieAgentStatus | null };

export type RechtPrive = {
  mag: boolean; code?: Weigercode;
  /** Unie over de privé-browsers van wat hun toestemmingen geven, ∩ beleid (per browser: ExtensieAgentStatus.toestemming). */
  caps: BrowserCap[]; maxDagen: number; domeinen: string[]; lokaal: boolean;
  /** Is de step-up van deze sessie nu geldig (dan vraagt ontgrendelen niets extra's)? */
  stapOpGeldig: boolean;
};
export type RechtTechnisch = { mag: boolean; code?: Weigercode; rollen: string[]; caps: BrowserCap[]; activatieTot: number | null; passkeys: number; maxMinuten: number };
/** Oud (0.5) = technisch; blijft voor bestaande schermen. */
export type RechtOud = { magOntgrendelen: boolean; code?: Weigercode; rollen: string[]; caps: BrowserCap[]; activatieTot: number | null; passkeys: number };

export type ExtensieStatusAntwoord = {
  agenten: ExtensieAgentStatus[];
  browsers: ExtensieBrowser[];
  /** technisch = null als het account geen (niet ingetrokken) technisch profiel heeft. */
  recht: RechtOud & { prive: RechtPrive; technisch: RechtTechnisch | null };
  /** Het eigen beleid (alleen lezen voor de gebruiker zelf). */
  beleid: ExtensieBeleid;
  /** Mag deze sessie «Усі користувачі» (extensie-beheer) openen? */
  beheer: boolean;
  nu: number;
};

// ---------------------------------------------------------------- beheer (eigenaar / users.manage)
export type ExtensieBeheerBrowser = { agentId: string; naam: string; ruimte: AiRuimte; browserId: string; online: boolean; versie: string; ontgrendeling: OntgrendelingWeergave | null };
export type ExtensieBeheerGebruiker = {
  userId: string; email: string; naam: string; techProfiel: boolean; eigenaar: boolean;
  /** false voor de eigenaar (behalve voor de eigenaar zelf) en voor jezelf als je niet de eigenaar bent. */
  bewerkbaar: boolean;
  beleid: ExtensieBeleid; browsers: ExtensieBeheerBrowser[];
};
export type ExtensieBeheerAntwoord = { gebruikers: ExtensieBeheerGebruiker[]; door: 'eigenaar' | 'users.manage'; nu: number };

/** Hoe lang "AI-agent verbonden" blijft staan na de laatste opdracht van een AI. */
export const AI_ACTIEF_MS = 120_000;
