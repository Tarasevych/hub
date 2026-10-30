// «ПІДТВЕРДЖЕННЯ НА САЙТІ» — één gedeelde wachtrij voor acties die een AI-agent VOORSTELT en die pas gebeuren nadat de mens ze
// op de site bevestigde (migratie 0098, backend/ai-bevestiging.ts, routes in backend/ai-bevestiging-routes.ts, scherm
// src/ai-bevestiging/BevestigingenPaneel.tsx). Besluit van de eigenaar (21.10.2026): «дозволи, які ще у розробці … включити в
// розробку». Mail verzenden en bestanden delen bestaan alleen MET deze bevestiging; andere hulpmiddelen gebruiken haar als de
// mens (of het ondertekende AI-beleid) «питати щоразу» koos.
//
// De regels, één keer opgeschreven (de server dwingt ze af; dit bestand is puur zodat browser, server en tests hetzelfde zeggen):
//   1. Een verzoek hoort bij ÉÉN mens en ÉÉN ruimte (prive | technisch). Bevestigen kan alleen die mens, vanuit een tabblad dat NU
//      in diezelfde ruimte is. Een ander account, of hetzelfde account vanuit de andere ruimte → weigering, en in het journaal.
//   2. De parameters zijn na het aanmaken ONVERANDERLIJK: de server bewaart ze versleuteld (DEK van de sleutelkluis als die aan
//      staat, anders de serversleutel) met een SHA-256-hash over {soort, ruimte, mens, parameters}. Bij «Підтвердити» stuurt het
//      scherm de hash mee die het liet zien; de server vergelijkt die én rekent de hash opnieuw uit de ontsleutelde parameters.
//      Wijkt één van beide af → BEVESTIGING_PARAMETERS_GEWIJZIGD, er gebeurt niets.
//   3. Elk verzoek verloopt na 30 minuten (BEVESTIG_TERMIJN_MS). Daarna is het 'verlopen' en niet meer te bevestigen.
//   4. Hoog en kritiek risico vragen een VERSE sterke bevestiging (passkey, app-code of herstelcode; Google opnieuw telt niet) van
//      DEZE sessie, die daarna verbruikt is: elke volgende bevestiging vraagt opnieuw.
//   5. Pas NA de bevestiging voert de server de actie uit (één keer: de overgang wacht → bezig is atomair). Het resultaat gaat terug
//      naar de agent (de aanroep wacht tot ~50 s, of de agent vraagt later de stand op met `bevestiging_id`). Alles staat in het
//      journaal (owner.ai.bevestiging.*), nooit met de inhoud van de parameters.
//   6. Sommige soorten vragen bij het bevestigen een EIGEN keuze van de mens (bv. «voor iedereen met de link» bij delen, of de
//      foto's die hij zelf kiest). Die keuze is geen wijziging van de parameters: zij staat apart en wordt per soort gecontroleerd.
// Puur (geen React/DOM/Node).

export type BevestigRuimte = 'prive' | 'technisch';
export type BevestigRisico = 'laag' | 'midden' | 'hoog' | 'kritiek';
export type BevestigStatus = 'wacht' | 'bezig' | 'uitgevoerd' | 'mislukt' | 'geweigerd' | 'verlopen' | 'ingetrokken';
export type Tweetalig = Readonly<{ uk: string; nl: string }>;

export const BEVESTIG_STATUSSEN: readonly BevestigStatus[] = Object.freeze(['wacht', 'bezig', 'uitgevoerd', 'mislukt', 'geweigerd', 'verlopen', 'ingetrokken']);
export const BEVESTIG_RISICOS: readonly BevestigRisico[] = Object.freeze(['laag', 'midden', 'hoog', 'kritiek']);
/** Hoe lang een verzoek open blijft. */
export const BEVESTIG_TERMIJN_MS = 30 * 60 * 1000;
/** Hoeveel open verzoeken één mens hoogstens heeft (meer kan niemand overzien). */
export const BEVESTIG_MAX_OPEN = 20;
/** Hoe lang de aanroep van de AI op het besluit wacht voordat zij «wacht nog» teruggeeft (Cloudflare breekt na 100 s af). */
export const BEVESTIG_WACHT_MS = 50_000;
/** Soortnaam: 'mail.verzenden', 'drive.delen', … */
export const SOORT_RE = /^[a-z][a-z0-9-]{1,30}\.[a-z][a-z0-9.-]{1,40}$/;
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HASH_RE = /^[0-9a-f]{64}$/;

export const isBevestigStatus = (v: unknown): v is BevestigStatus => typeof v === 'string' && (BEVESTIG_STATUSSEN as readonly string[]).includes(v);
export const isBevestigRisico = (v: unknown): v is BevestigRisico => typeof v === 'string' && (BEVESTIG_RISICOS as readonly string[]).includes(v);
export const ruimteVan = (v: unknown): BevestigRuimte => (v === 'technisch' ? 'technisch' : 'prive');
/** Hoog en kritiek: een verse sterke bevestiging (passkey/app-code/herstelcode) van deze sessie, daarna verbruikt. */
export const stapOpNodig = (r: BevestigRisico): boolean => r === 'hoog' || r === 'kritiek';
/** Na deze standen verandert er niets meer. */
export const isEindStatus = (s: BevestigStatus): boolean => s !== 'wacht' && s !== 'bezig';
/** Strengste van twee risico's (een soort kan het risico per verzoek verhogen, nooit verlagen). */
export const hoogste = (a: BevestigRisico, b: BevestigRisico): BevestigRisico => (BEVESTIG_RISICOS.indexOf(a) >= BEVESTIG_RISICOS.indexOf(b) ? a : b);

/**
 * Canonieke JSON: sleutels gesorteerd, geen spaties, `undefined` valt weg. Dezelfde invoer geeft altijd dezelfde tekst, dus dezelfde
 * hash (de server rekent hem uit met SHA-256; zie backend/ai-bevestiging.ts → parameterHash).
 */
export function canoniek(v: unknown): string {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(Number.isFinite(v as number) || typeof v !== 'number' ? v : null);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canoniek(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const delen = Object.keys(v as Record<string, unknown>).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canoniek((v as Record<string, unknown>)[k])}`);
    return `{${delen.join(',')}}`;
  }
  return 'null';
}
/** Wat er gehasht wordt: de soort, de ruimte en de mens horen erbij, zodat een rij nooit naar een ander account of andere ruimte kan. */
export const hashInvoer = (v: { soort: string; ruimte: BevestigRuimte; userId: string; params: unknown }) =>
  canoniek({ v: 1, soort: v.soort, ruimte: v.ruimte, userId: v.userId, params: v.params });

// ------------------------------------------------------------------------------------------------ wat de mens ziet
export type BevestigDetail = { label: Tweetalig; waarde: string; nadruk?: boolean };
/** Een keuze die alleen de MENS bij het bevestigen maakt (geen parameter van de agent). */
export type BevestigKeuze = {
  id: string;
  soort: 'vinkje' | 'fotos';
  label: Tweetalig;
  uitleg?: Tweetalig;
  /** Zonder deze keuze kan er niet bevestigd worden (de server controleert dat opnieuw). */
  verplicht?: boolean;
};
export type BevestigBeschrijving = {
  titel: Tweetalig;
  samenvatting: Tweetalig;
  details: BevestigDetail[];
  waarschuwing?: Tweetalig;
  keuzes?: BevestigKeuze[];
};
/** Eén verzoek zoals het scherm het krijgt (src/ai-bevestiging/BevestigingenPaneel.tsx). */
export type BevestigingWeergave = {
  id: string; soort: string; tool: string; agent: string; klant: string; ruimte: BevestigRuimte; risico: BevestigRisico; stapOp: boolean;
  status: BevestigStatus; aangemaaktOp: number; verlooptOp: number; beslotenOp: number | null; hash: string;
  /** null = de sleutel van deze ruimte is gesloten: de inhoud is niet te tonen en er kan pas na ontgrendelen bevestigd worden. */
  beschrijving: BevestigBeschrijving | null;
  gesloten: boolean;
  fout: string;
  /** Korte, menselijke uitkomst na het uitvoeren (bv. «Лист надіслано»), zonder geheimen. */
  uitkomst: BevestigDetail[];
};
/** Wat de agent terugkrijgt (tool-resultaat, JSON). Nooit de beschrijving voor de mens; wel de stand en het resultaat. */
export type AgentUitslag = {
  status: BevestigStatus; bevestiging_id: string; verloopt_op: string;
  resultaat?: unknown; fout?: string;
  /** Wat de agent nu moet doen, in het Engels zoals alle instructies aan het model (geen UI-tekst). */
  next: string;
};

export const STATUS_TEKST: Readonly<Record<BevestigStatus, Tweetalig>> = Object.freeze({
  wacht: { uk: 'Чекає на ваше рішення', nl: 'Wacht op uw besluit' },
  bezig: { uk: 'Виконується', nl: 'Wordt uitgevoerd' },
  uitgevoerd: { uk: 'Виконано', nl: 'Uitgevoerd' },
  mislukt: { uk: 'Не вдалося', nl: 'Mislukt' },
  geweigerd: { uk: 'Відхилено', nl: 'Geweigerd' },
  verlopen: { uk: 'Строк минув', nl: 'Verlopen' },
  ingetrokken: { uk: 'Скасовано', nl: 'Ingetrokken' },
});
export const RISICO_TEKST: Readonly<Record<BevestigRisico, Tweetalig>> = Object.freeze({
  laag: { uk: 'Низький ризик', nl: 'Laag risico' },
  midden: { uk: 'Середній ризик', nl: 'Middelmatig risico' },
  hoog: { uk: 'Високий ризик — з passkey', nl: 'Hoog risico — met passkey' },
  kritiek: { uk: 'Критичний — з passkey', nl: 'Kritiek — met passkey' },
});

/** Foutcodes van het mechanisme, met een menselijke uitleg in beide talen (het scherm en de AI-tekst gebruiken dezelfde codes). */
export const BEVESTIG_FOUT: Readonly<Record<string, Tweetalig>> = Object.freeze({
  BEVESTIGING_ONBEKEND: { uk: 'Такого запиту немає (або він не ваш).', nl: 'Dit verzoek bestaat niet (of is niet van u).' },
  BEVESTIGING_NIET_OPEN: { uk: 'Запит уже вирішено.', nl: 'Over dit verzoek is al beslist.' },
  BEVESTIGING_VERLOPEN: { uk: 'Строк запиту (30 хв) минув. Попросіть ШІ створити новий.', nl: 'Het verzoek (30 min) is verlopen. Vraag de AI een nieuw te maken.' },
  BEVESTIGING_ANDERE_RUIMTE: { uk: 'Цей запит належить до іншого простору. Відкрийте його у правильному просторі.', nl: 'Dit verzoek hoort bij de andere ruimte. Open het in de juiste ruimte.' },
  BEVESTIGING_PARAMETERS_GEWIJZIGD: { uk: 'Параметри запиту змінилися після створення — підтвердження заблоковано.', nl: 'De parameters veranderden na het aanmaken — bevestigen is geblokkeerd.' },
  BEVESTIGING_KEUZE_VEREIST: { uk: 'Спершу зробіть вибір у вікні запиту.', nl: 'Maak eerst de keuze in het venster van het verzoek.' },
  BEVESTIGING_KEUZE_ONGELDIG: { uk: 'Цей вибір не підходить до запиту.', nl: 'Deze keuze past niet bij het verzoek.' },
  BEVESTIGING_TE_VEEL_OPEN: { uk: 'Забагато запитів чекають на рішення. Спершу вирішіть наявні.', nl: 'Er wachten te veel verzoeken. Beslis eerst over de bestaande.' },
  BEVESTIGING_SOORT_ONBEKEND: { uk: 'Невідомий тип запиту.', nl: 'Onbekende soort verzoek.' },
  BEVESTIGING_RUIMTE_NIET_TOEGESTAAN: { uk: 'Такий запит неможливий у цьому просторі.', nl: 'Zo’n verzoek kan niet in deze ruimte.' },
  BEVESTIGING_ANDERE_AGENT: { uk: 'Цей запит створив інший ШІ.', nl: 'Dit verzoek is door een andere AI gemaakt.' },
  BEVESTIGING_PARAMETERS_ONGELDIG: { uk: 'ШІ передав неправильні параметри.', nl: 'De AI gaf ongeldige parameters.' },
  BEVESTIGING_UITVOEREN_MISLUKT: { uk: 'Виконати не вдалося.', nl: 'Uitvoeren mislukt.' },
  STEP_UP_STRONG_REQUIRED: { uk: 'Потрібне свіже підтвердження passkey, кодом із застосунку або кодом відновлення.', nl: 'Een verse bevestiging met passkey, app-code of herstelcode is nodig.' },
  SLEUTELKLUIS_GESLOTEN: { uk: 'Ключ даних цього простору закритий — розблокуйте його, щоб побачити й підтвердити запит.', nl: 'De gegevenssleutel van deze ruimte is gesloten — ontgrendel hem om het verzoek te zien en te bevestigen.' },
});
export const foutUitleg = (code: string, taal: 'uk' | 'nl'): string => (BEVESTIG_FOUT[code] ?? BEVESTIG_FOUT.BEVESTIGING_UITVOEREN_MISLUKT)[taal];

/** Het adres waar de mens het verzoek ziet: de plek van die AI in de hub (#agent/<slug>), anders het overzicht. */
export const bevestigLink = (mcpHost: string, id: string, agent: string): string =>
  `https://${mcpHost}/agents#${/^[a-z][a-z0-9-]{1,20}$/.test(agent) ? `agent/${agent}` : 'overzicht'}?bevestiging=${id}`;

/**
 * Welke hulpmiddelen (interne naam, shared/connector-v2/catalogus.ts → intern) langs deze wachtrij gaan — voor de allocatie van de
 * badge in het toestemmingsvenster (src/connector-v2/RechtenKiezer.tsx). 'altijd' = elke aanroep, wat de modus ook zegt;
 * 'standaard' = standaard wel (modus «питати»), tenzij de mens het hulpmiddel zelf op «завжди» zet. Andere families voegen hun
 * hulpmiddelen hier toe (één lijst, één badge).
 */
export const MET_BEVESTIGING: Readonly<Record<string, 'altijd' | 'standaard'>> = Object.freeze({
  mail_send: 'altijd', drive_share_file: 'altijd', photos_picked_media: 'altijd', drive_create_file: 'standaard', drive_upload_file: 'standaard',
  users_manage: 'altijd', flags_manage: 'altijd',
});
export const BEVESTIGING_BADGE: Readonly<Record<'altijd' | 'standaard', Tweetalig>> = Object.freeze({
  altijd: { uk: 'кожна дія — з вашим підтвердженням на сайті', nl: 'elke actie — met uw bevestiging op de site' },
  standaard: { uk: 'типово кожна дія — з вашим підтвердженням на сайті', nl: 'standaard elke actie met uw bevestiging op de site' },
});

/** Engelse instructie voor het model per stand (zelfde stijl als de andere weigeringen: melden, niet herhalen). */
export function volgendeStap(s: BevestigStatus): string {
  switch (s) {
    case 'wacht': return 'Waiting for the user\'s confirmation on the Mijn Ruimte website (AI connections → this AI → «Запити ШІ на підтвердження»). Tell the user; do NOT create the request again. Check later by calling this same tool with only "bevestiging_id".';
    case 'bezig': return 'The user confirmed; the server is executing it right now. Check again in a few seconds with "bevestiging_id"; do not repeat the action.';
    case 'uitgevoerd': return 'Done: the user confirmed and the server executed it. Report the result to the user.';
    case 'mislukt': return 'The user confirmed, but executing it failed (see "fout"). Tell the user; only retry if they ask.';
    case 'geweigerd': return 'The user rejected this request. Do not retry; ask the user what they want instead.';
    case 'verlopen': return 'The request expired after 30 minutes without a decision. Only make a new request if the user asks for it.';
    case 'ingetrokken': return 'The request was withdrawn. Do not retry unless the user asks.';
    default: return 'Unknown state.';
  }
}
