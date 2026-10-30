// LOKALE KOPIE VAN HET CONCEPT («Новий лист»), 21.10.2026.
//
// De klacht van de eigenaar (telefoon): «введений текст пропадає, якщо покинути сторінку або браузер перезавантажить вкладку».
// Een mobiele browser gooit een tabblad op de achtergrond weg; bij terugkeer laadt de pagina opnieuw. Wat er toen gebeurde:
//   • de tekst stond wél in localStorage (mail-draft-<id>), maar het venster ging dicht, en wie daarna op «Написати» of op de
//     plashka tikte, kreeg een LEEG venster: de opening telde als «nieuw bericht» en zette het oude concept opzij (alleen nog in
//     «Чернетки» op de server). Voor de mens: de tekst was weg;
//   • de sleutel hing niet aan account of ruimte: een tweede account in dezelfde browser kon het concept van het eerste zien;
//   • op `visibilitychange` werd niets weggeschreven (alleen `pagehide`, dat bij het weggooien van een tabblad vaak niet komt).
//
// HOE HET NU WERKT. Per ACCOUNT en per RUIMTE (dezelfde scope als het uiterlijk en de vensterlade: vensterScope) één «actief»
// concept met: de velden, of het venster OPEN stond, en wanneer de server het laatst bevestigde. Na het herladen zet het venster
// zich in dezelfde stand terug (open → open met dezelfde tekst; geminimaliseerd → in de stapel «Згорнуті»).
//
// WAT ER NOOIT IN KOMT: bijlagen (die zijn base64 van bestanden — groot én mogelijk gevoelig), wachtwoorden, tokens. Alleen
// Кому/Cc/Bcc/Тема/tekst. Zonder opslag (privévenster, geblokkeerd, quota vol) doet alles stil niets: de server blijft de kopie.
// Waarom niet in de versleutelde vensterlade (venster_stand, sleutelkluis)? Dat model kent alleen de soort «mail-koppelen» en
// gooit elk onbekend veld weg (normaliseerVenster); de inhoud van een brief is daar niet voorzien. De servercopie van de inhoud
// is de bestaande concepttabel (app.mail_drafts, per gebruiker en ruimte); deze module is alleen de snelle kopie op het apparaat.
import { vensterScope } from '../shared/vensters-onthouden-model';

export type ConceptVelden = { to: string; cc: string; bcc: string; subject: string; body: string };
export type LokaalConcept = ConceptVelden & {
  id: string;
  /** Stond het venster open toen de pagina wegging? Dan opent het na het herladen vanzelf. */
  open: boolean;
  /** Laatst lokaal geschreven (ms). */
  op: number;
  /** Laatst door de server bevestigd (ms), 0 = nog nooit. */
  serverOp: number;
};
export type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { key?: (i: number) => string | null; readonly length?: number };

export const CONCEPT_PREFIX = 'mijn-ruimte-mail-concept-v2:';
/** Ouder dan dit = vergeten (de server heeft het in «Чернетки»). */
export const CONCEPT_MAX_LEEFTIJD = 30 * 24 * 3600_000;
/** Groter dan dit (vooral ingevoegde afbeeldingen als data-URL) schrijven we lokaal niet: quota is ±5 MB voor het hele domein. */
export const CONCEPT_MAX_TEKENS = 1_500_000;

const veilig = (): Opslag | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const tekst = (v: unknown, max: number) => String(v ?? '').slice(0, max);

/** account|ruimte — exact de scope van de vensterlade (shared/vensters-onthouden-model.ts). */
export const conceptScope = (account: unknown, ruimte: unknown) => vensterScope(account, ruimte);
export const conceptSleutel = (scope: string) => `${CONCEPT_PREFIX}${scope}`;

export const heeftInhoud = (v: Partial<ConceptVelden> | null | undefined) =>
  Boolean(v && (String(v.to ?? '').trim() || String(v.cc ?? '').trim() || String(v.bcc ?? '').trim() || String(v.subject ?? '').trim() || String(v.body ?? '').replace(/<[^>]*>/g, '').trim()));

/** Ruwe waarde → concept, of null (onbruikbaar, leeg of te oud). */
export function normaliseerConcept(ruw: unknown, nu = Date.now()): LokaalConcept | null {
  if (!ruw || typeof ruw !== 'object') return null;
  const r = ruw as Record<string, unknown>;
  const id = tekst(r.id, 120);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return null;
  const c: LokaalConcept = {
    id, to: tekst(r.to, 4000), cc: tekst(r.cc, 4000), bcc: tekst(r.bcc, 4000), subject: tekst(r.subject, 998), body: tekst(r.body, CONCEPT_MAX_TEKENS),
    open: r.open === true, op: Number(r.op) > 0 ? Math.floor(Number(r.op)) : 0, serverOp: Number(r.serverOp) > 0 ? Math.floor(Number(r.serverOp)) : 0,
  };
  if (!heeftInhoud(c)) return null;
  if (c.op && nu - c.op > CONCEPT_MAX_LEEFTIJD) return null;
  return c;
}

/** Het actieve concept van deze scope (of null). Migreert één keer het oude, niet-gescoopte formaat (mail-draft-active-id). */
export function leesConcept(scope: string, opslag: Opslag | null = veilig(), nu = Date.now()): LokaalConcept | null {
  if (!opslag) return null;
  try {
    const raw = opslag.getItem(conceptSleutel(scope));
    if (raw) {
      const c = normaliseerConcept(JSON.parse(raw), nu);
      if (!c) opslag.removeItem(conceptSleutel(scope));
      return c;
    }
    // Oud formaat (tot 21.10.2026): één concept voor de hele browser. Het hoort bij wie het nu opent — en daarna nooit meer.
    const oudId = opslag.getItem('mail-draft-active-id');
    if (!oudId) return null;
    const oud = opslag.getItem(`mail-draft-${oudId}`);
    opslag.removeItem('mail-draft-active-id');
    opslag.removeItem(`mail-draft-${oudId}`);
    if (!oud) return null;
    const o = JSON.parse(oud) as Record<string, unknown>;
    const c = normaliseerConcept({ ...o, id: oudId, op: Number(o.savedAt) || nu, open: false, serverOp: 0 }, nu);
    if (c) schrijfConcept(scope, c, opslag);
    return c;
  } catch { return null; }
}

/** true = lokaal bewaard; false = geen opslag / quota / te groot (stil: de server blijft de kopie). */
export function schrijfConcept(scope: string, c: LokaalConcept, opslag: Opslag | null = veilig()): boolean {
  if (!opslag) return false;
  try {
    if (!heeftInhoud(c)) { opslag.removeItem(conceptSleutel(scope)); return true; }
    const uit = JSON.stringify({ id: c.id, to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, body: c.body, open: c.open, op: c.op, serverOp: c.serverOp });
    if (uit.length > CONCEPT_MAX_TEKENS) return false;
    opslag.setItem(conceptSleutel(scope), uit);
    return true;
  } catch { return false; }
}

/** Na verzenden, plannen of «Видалити чернетку»: weg van dit apparaat (alleen als het nog DIT concept is). */
export function wisConcept(scope: string, id?: string, opslag: Opslag | null = veilig()): void {
  if (!opslag) return;
  try {
    if (id) {
      const raw = opslag.getItem(conceptSleutel(scope));
      const nu = raw ? (JSON.parse(raw) as { id?: string }).id : '';
      if (nu && nu !== id) return;
    }
    opslag.removeItem(conceptSleutel(scope));
    opslag.removeItem('mail-draft-active-id');
    if (id) opslag.removeItem(`mail-draft-${id}`);
  } catch { /* geen opslag */ }
}

// ---------------------------------------------------------------------------------------------- afmelden (beveiligingsreview 21.10.2026)
// Het concept staat in PLATTE tekst in localStorage. Zonder deze twee bleef het na «Вийти» op het apparaat staan — ook na een
// aanmelding zonder «Зберегти цей акаунт» (een gedeelde computer), waar de rest van de privé-post (src/mail-bijlage-cache.ts)
// juist wél gewist wordt. Nu volgt het concept dezelfde regel als die cache: wie de privé-post van een account van dit apparaat
// wist, wist ook zijn concepten (de servercopie in «Чернетки» blijft). Het oude, niet-gescoopte formaat en de 'anon'-lade gaan
// mee: zij hebben geen eigenaar en zouden anders bij de VOLGENDE aanmelding — misschien iemand anders — terechtkomen.
const alleSleutels = (opslag: Opslag): string[] => {
  const uit: string[] = [];
  const n = Number(opslag.length ?? 0);
  for (let i = n - 1; i >= 0; i -= 1) { const k = opslag.key?.(i); if (k) uit.push(k); }
  return uit;
};
const isOudFormaat = (k: string) => k === 'mail-draft-active-id' || /^mail-draft-[A-Za-z0-9_-]{1,80}$/.test(k);
/** Alle lokale concepten van ÉÉN account ('u-xxxxxxxx', beide ruimtes) + de eigenaarloze ('anon', oud formaat). Geeft het aantal. */
export function wisConceptenVanAccount(accountSleutel: unknown, opslag: Opslag | null = veilig()): number {
  if (!opslag) return 0;
  const account = String(accountSleutel ?? '').trim().toLowerCase();
  let n = 0;
  try {
    for (const k of alleSleutels(opslag)) {
      const eigen = k.startsWith(CONCEPT_PREFIX) && (k.startsWith(`${CONCEPT_PREFIX}anon|`) || (!!account && account !== 'anon' && k.startsWith(`${CONCEPT_PREFIX}${account}|`)));
      if (eigen || isOudFormaat(k)) { opslag.removeItem(k); n++; }
    }
  } catch { /* geen opslag */ }
  return n;
}
/** Alle lokale concepten van dit apparaat (elk account, elke ruimte, oud formaat) — bij «alle accounts afmelden». */
export function wisAlleConcepten(opslag: Opslag | null = veilig()): number {
  if (!opslag) return 0;
  let n = 0;
  try { for (const k of alleSleutels(opslag)) if (k.startsWith(CONCEPT_PREFIX) || isOudFormaat(k)) { opslag.removeItem(k); n++; } } catch { /* geen opslag */ }
  return n;
}

export const nieuwConceptId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/** «Збережено локально · на сервері о 07:12» — de tekst van de statusregel onderaan (uk/nl). */
export function conceptStatusTekst(lang: 'uk' | 'nl', s: { lokaal: 'ja' | 'nee' | 'uit'; server: 'idle' | 'bezig' | 'ok' | 'fout'; serverOp: number }): string {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const tijd = s.serverOp ? new Date(s.serverOp).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit' }) : '';
  const lok = s.lokaal === 'ja' ? t('Збережено локально', 'Lokaal bewaard') : s.lokaal === 'uit' ? t('Локальна копія вимкнена', 'Lokale kopie uit') : '';
  // Tijdens het typen blijft de tekst staan («на сервері о 07:12»); alleen het pictogram draait. Zo springt de regel niet.
  const srv = (s.server === 'ok' || s.server === 'bezig') && tijd ? t(`на сервері о ${tijd}`, `op de server om ${tijd}`)
    : s.server === 'bezig' ? t('надсилаємо на сервер…', 'naar de server…')
    : s.server === 'fout' ? (tijd ? t(`на сервері о ${tijd}; зміни — повторимо`, `op de server om ${tijd}; wijzigingen — opnieuw`) : t('сервер недоступний — повторимо', 'server onbereikbaar — opnieuw'))
    : '';
  if (!lok && !srv) return t('Чернетка', 'Concept');
  if (!lok) return srv.charAt(0).toUpperCase() + srv.slice(1);
  return srv ? `${lok} · ${srv}` : lok;
}
