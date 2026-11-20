// STROOK-001 (15.11.2026). Павло: «у вікні перегляду листів є дві опції блоки перегляд та блок з відображенням про зображення, в яких
// немає кнопки сховати, типу закрити хрестиком». De vertaalstrook («Мова листа: … Оригінал / Переклад / Порівняти») en de
// veiligheidsstrook («N зовнішні зображення приховано») krijgen een ✕. Sluiten verbergt ALLEEN de strook, voor DEZE brief:
// het gedrag blijft (beelden blijven verborgen, de brief blijft in de gekozen taalweergave). Terugzetten kan altijd met een
// knopje in de kop van de brief (naast ↩ en ⓘ), zodat vertalen en beelden tonen nooit onbereikbaar worden.
// Bewust in het geheugen van dit tabblad (geen opslag): na herladen staan de stroken er weer — er gaat niets ongemerkt verloren.
// STROOK-002 (16.11.2026): blijvende regels (taal, afzender, overal) staan in src/mail/strook-regels.ts; hier blijft wat per brief
// en per tabblad geldt: ✕ voor één brief, «toch tonen» ondanks een regel (knop in de kop), en de smalle keuzeregel na ✕ (StrookNazorg).
// Één bron van waarheid voor beide componenten (MailGesprekInhoud = kop + vertaalstrook, MailBerichtTekst = beeldenstrook).
import { useSyncExternalStore } from 'react';
import { regelVoor, telSluiten, type BriefKenmerken, type Regels, type StrookRegel, type StrookSoort } from './strook-regels';
import './stroken-sluiten.css';

export type { StrookSoort };
type Vlag = 'gesloten' | 'getoond' | 'nazorg';

type Staat = {
  /** messageId → stroken met ✕ voor deze brief gesloten */
  gesloten: ReadonlyMap<string, ReadonlySet<StrookSoort>>;
  /** messageId → stroken die een regel verbergt maar die hier toch getoond worden (knop in de kop) */
  getoond: ReadonlyMap<string, ReadonlySet<StrookSoort>>;
  /** messageId → stroken waarvoor nu de keuzeregel na ✕ staat («Ховати й надалі: …») */
  nazorg: ReadonlyMap<string, ReadonlySet<StrookSoort>>;
  /** messageId → aantal verborgen externe beelden waarvoor de beeldenstrook nu zou verschijnen (0 = geen strook) */
  beelden: ReadonlyMap<string, number>;
};

const nieuw = (): Staat => ({ gesloten: new Map(), getoond: new Map(), nazorg: new Map(), beelden: new Map() });
let staat: Staat = nieuw();
const luisteraars = new Set<() => void>();
const zet = (volgende: Staat) => { staat = volgende; luisteraars.forEach((f) => f()); };
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
const lees = () => staat;

const heeft = (s: Staat, vlag: Vlag, messageId: string, soort: StrookSoort) => !!s[vlag].get(messageId)?.has(soort);
function zetVlag(vlag: Vlag, messageId: string, soort: StrookSoort, aan: boolean): void {
  if (!messageId || heeft(staat, vlag, messageId, soort) === aan) return;
  const kaart = new Map(staat[vlag]);
  const set = new Set(kaart.get(messageId) || []);
  if (aan) set.add(soort); else set.delete(soort);
  if (set.size) kaart.set(messageId, set); else kaart.delete(messageId);
  zet({ ...staat, [vlag]: kaart });
}

export const isGesloten = (s: Staat, messageId: string, soort: StrookSoort) => heeft(s, 'gesloten', messageId, soort);
export const isGetoond = (s: Staat, messageId: string, soort: StrookSoort) => heeft(s, 'getoond', messageId, soort);
export const isNazorg = (s: Staat, messageId: string, soort: StrookSoort) => heeft(s, 'nazorg', messageId, soort);

/** Sluit (✕) of zet terug (knop in de kop) — alleen voor deze brief. */
export function zetStrookGesloten(messageId: string, soort: StrookSoort, dicht: boolean): void { zetVlag('gesloten', messageId, soort, dicht); }
/** Toch tonen ondanks een regel — alleen voor deze brief (knop in de kop). */
export function zetStrookGetoond(messageId: string, soort: StrookSoort, aan: boolean): void { zetVlag('getoond', messageId, soort, aan); }
/** De keuzeregel na ✕ tonen of weghalen. */
export function zetStrookNazorg(messageId: string, soort: StrookSoort, aan: boolean): void { zetVlag('nazorg', messageId, soort, aan); }

/**
 * Is deze strook voor deze brief verborgen, en waardoor? `regel` = de blijvende regel die hem verbergt (null als het de ✕ voor
 * deze brief is). Een regel geldt niet als de strook hier «toch getoond» wordt.
 */
export function strookStaat(s: Staat, regels: Regels, messageId: string, soort: StrookSoort, k: BriefKenmerken): { verborgen: boolean; regel: StrookRegel | null; getoond: boolean } {
  const regel = regelVoor(regels, soort, k);
  const getoond = isGetoond(s, messageId, soort);
  if (isGesloten(s, messageId, soort)) return { verborgen: true, regel: null, getoond };
  return { verborgen: !!regel && !getoond, regel, getoond };
}

/** Terugknop in de kop: haalt de strook voor deze brief terug, ook als een regel hem verbergt. */
export function toonStrookWeer(messageId: string, soort: StrookSoort): void {
  zetStrookGesloten(messageId, soort, false);
  zetStrookNazorg(messageId, soort, false);
  zetStrookGetoond(messageId, soort, true);
}

/** MailBerichtTekst meldt of de beeldenstrook er nu zou staan (en voor hoeveel beelden), zodat de kop het terugknopje kan tonen. */
export function meldBeeldenStrook(messageId: string, aantal: number): void {
  if (!messageId || (staat.beelden.get(messageId) || 0) === aantal) return;
  const beelden = new Map(staat.beelden);
  if (aantal > 0) beelden.set(messageId, aantal); else beelden.delete(messageId);
  zet({ ...staat, beelden });
}

export function useStroken(): Staat {
  return useSyncExternalStore(abonneer, lees, lees);
}

/** Alleen voor tests. */
export function herstelStrokenVoorTest(): void {
  zet(nieuw());
}

/**
 * ✕ op een strook: sluiten voor deze brief, meetellen voor voorstellen (src/mail/strook-regels.ts), en — als er nog geen regel voor
 * deze brief geldt — de keuzeregel «Ховати й надалі: …» tonen.
 */
export function sluitStrook(messageId: string, soort: StrookSoort, bereik: string, k: BriefKenmerken, regels: Regels): void {
  if (!messageId) return;
  const hadRegel = !!regelVoor(regels, soort, k);
  zetStrookGetoond(messageId, soort, false);
  zetStrookGesloten(messageId, soort, true);
  if (hadRegel) return;
  telSluiten(bereik, soort, k);
  zetStrookNazorg(messageId, soort, true);
}
