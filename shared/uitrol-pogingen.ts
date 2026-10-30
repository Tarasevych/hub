// Pogingen om een update uit te rollen die NIET tot een installatie kwamen — één gedeelde, pure bron (migratie 0081).
//
// Waarom (eigenaar 20.10.2026): «Чому сервіс в історії останніх розгортань не відмітив невдалу спробу встановлення, навіть якщо
// була помилка завантаження?» Het antwoord was: de afbreking gebeurde in de BROWSER (NotReadableError van de File API), vóór of
// tijdens het versturen van de stukken, dus de server hoorde er nooit van. Nu meldt de browser elke afbreking en bewaart de
// server ook zijn eigen vaststellingen (een upload die stil viel). Dit bestand bepaalt de vorm daarvan en — belangrijk — de
// REGEL dat de reden uit de bestaande enige bron komt:
//   * shared/foutuitleg.ts  voor codes die de site echt kent (BESTAND_LEZEN|NotReadableError, HTTP_502, NETWORK_ERROR, …);
//   * shared/uitrol-codes.ts voor de codes van de uitrolketen (ZONDER_REDEN, UPLOAD_NIET_VOLTOOID, VOORCONTROLE_MISLUKT, …).
// Hier staat dus GEEN tweede tabel met foutteksten; alleen de namen van de etappes (die bestonden nergens) en het samenvoegen.
//
// Zuiver: geen DOM, geen fetch, geen database. Getest in tests/eenheid/uitrol-pogingen-20261020.test.ts.
import { kiesTaal, onbekendeOorzaak, regelTekst, type Lang } from './foutuitleg';
import { UITROL_CODES, uitrolCodeDoen, uitrolCodeTitel } from './uitrol-codes';

/** De acht etappes van de keten, in de volgorde waarin de eigenaar ze op het scherm doorloopt. */
export const POGING_ETAPPES = ['kiezen', 'lezen', 'voorcontrole', 'begin', 'uploaden', 'klaar', 'goedkeuren', 'installeren'] as const;
export type PogingEtappe = (typeof POGING_ETAPPES)[number];
export const isEtappe = (v: unknown): v is PogingEtappe => (POGING_ETAPPES as readonly string[]).includes(String(v || ''));

/** Wie de afbreking meldde. «browser» = door het tabblad gemeld (nooit verwarren met wat de server zelf zag). */
export const POGING_MELDERS = ['browser', 'server'] as const;
export type PogingMelder = (typeof POGING_MELDERS)[number];
export const isMelder = (v: unknown): v is PogingMelder => (POGING_MELDERS as readonly string[]).includes(String(v || ''));

/** Code voor «de site weet de oorzaak niet, en zegt dat ook»: het tabblad werd gesloten of het netwerk verdween. */
export const ZONDER_REDEN = 'ZONDER_REDEN';
/** Code die de SERVER zelf zet als een upload nooit werd afgemaakt. */
export const NIET_VOLTOOID = 'UPLOAD_NIET_VOLTOOID';

/** Grenzen: wat een client mag sturen en hoe lang de regels blijven (gelijk aan de buurtabellen: 30 dagen, zoals app.cron_runs). */
export const POGING_LIMIETEN = Object.freeze({
  /** Hoeveel meldingen één voorbereider per uur mag doen (daarboven: RATE_LIMITED). */
  perUur: 60,
  maxCode: 120,
  maxBestand: 160,
  maxPoging: 999,
  /** Maximum bewaarde regels per account (de oudste vallen eraf). */
  maxPerAccount: 200,
  bewaarDagen: 30,
  /** Zoveel minuten zonder nieuw stuk ⇒ de server verklaart de upload zelf dood (backend/uitrol-goedkeuring.ts). */
  stilMinuten: 30,
});

const ETAPPE_LABEL: Readonly<Record<PogingEtappe, [string, string]>> = Object.freeze({
  kiezen: ['Вибір файлу', 'Bestand kiezen'],
  lezen: ['Читання файлу з диска', 'Bestand van de schijf lezen'],
  voorcontrole: ['Перевірка вмісту пакета', 'Inhoud van het pakket controleren'],
  begin: ['Початок завантаження на сервер', 'Upload naar de server beginnen'],
  uploaden: ['Завантаження на сервер', 'Uploaden naar de server'],
  klaar: ['Завершення й перевірка на сервері', 'Afronden en controle op de server'],
  goedkeuren: ['Схвалення passkey', 'Goedkeuren met passkey'],
  installeren: ['Встановлення', 'Installeren'],
});
/** Etappe in mensentaal; een onbekende naam blijft zichtbaar als naam (nooit leeg). */
export const etappeTekst = (lang: Lang, etappe: string): string => {
  const t = ETAPPE_LABEL[etappe as PogingEtappe];
  return t ? kiesTaal(lang, t[0], t[1]) : String(etappe || kiesTaal(lang, 'невідомий етап', 'onbekende etappe'));
};

/** Eén regel van de geschiedenis: een poging die niet tot een installatie kwam (backend/uitrol-pogingen.ts → UI). */
export type PogingUit = {
  id: string;
  voorstelId: string;
  versie: string;
  sha256: string;
  bytes: number;
  etappe: PogingEtappe | string;
  verstuurd: number;
  procent: number;
  code: string;
  /** false = «обірвано без причини»: eerlijk onbekend, niet te verwarren met een bekende oorzaak. */
  redenBekend: boolean;
  poging: number;
  bestand: string;
  gemeldDoor: PogingMelder | string;
  voorbereider: string;
  /** Tijd volgens de browser (informatief) en de servertijd van de regel. */
  gemeldOp: string;
  tijd: string;
  /** Het voorstel staat nog op «uploaden» met ontvangen bytes ⇒ verder gaan waar het stopte is echt mogelijk. */
  hervatbaar: boolean;
  ontvangen: number;
  voorstelStatus: string;
};
export type PogingenAntwoord = { pogingen: PogingUit[]; totaal: number };

/** `UPLOAD_ONDERBROKEN|<code>|<procent>` (src/uitrol/Upload.tsx) → de echte code erbinnen; anders de code zelf. */
export function pogingKernCode(code: string): string {
  const c = String(code || '').trim();
  const m = /^UPLOAD_ONDERBROKEN\|([^|]*)/.exec(c);
  return m ? (m[1] || ZONDER_REDEN) : c;
}

/**
 * Oorzaak + «wat nu» van één poging, uit de ENIGE bron. Rangorde zoals in shared/foutuitleg.ts: een eigen regel voor deze code,
 * dan de uitleg van de uitrolketen (shared/uitrol-codes.ts), en anders eerlijk «причина невідома» met de rauwe code.
 * `zeker = false` betekent: de site weet het niet en zegt dat ook (ook bij ZONDER_REDEN).
 */
export function pogingOorzaak(lang: Lang, code: string, redenBekend = true): { waarom: string; doen: string; zeker: boolean } {
  const kern = pogingKernCode(code) || ZONDER_REDEN;
  if (!redenBekend || kern === ZONDER_REDEN) {
    const t = UITROL_CODES[ZONDER_REDEN];
    return { waarom: t ? uitrolCodeTitel(lang, ZONDER_REDEN) : onbekendeOorzaak(lang, ZONDER_REDEN), doen: uitrolCodeDoen(lang, ZONDER_REDEN), zeker: false };
  }
  const regel = regelTekst(lang, kern);
  if (regel) return { ...regel, zeker: true };
  if (UITROL_CODES[kern]) return { waarom: uitrolCodeTitel(lang, kern), doen: uitrolCodeDoen(lang, kern), zeker: true };
  return { waarom: onbekendeOorzaak(lang, kern), doen: '', zeker: false };
}

/** Wat de eigenaar met deze poging kan doen: verder gaan waar het stopte, of helemaal opnieuw. */
export type PogingActie = 'hervatten' | 'opnieuw';
export const pogingActie = (p: Pick<PogingUit, 'hervatbaar' | 'ontvangen'>): PogingActie => (p.hervatbaar && p.ontvangen > 0 ? 'hervatten' : 'opnieuw');
