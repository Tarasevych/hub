// STROOK-001 (15.11.2026). Павло: «у вікні перегляду листів є дві опції блоки перегляд та блок з відображенням про зображення, в яких
// немає кнопки сховати, типу закрити хрестиком». De vertaalstrook («Мова листа: … Оригінал / Переклад / Порівняти») en de
// veiligheidsstrook («N зовнішні зображення приховано») krijgen een ✕. Sluiten verbergt ALLEEN de strook, voor DEZE brief:
// het gedrag blijft (beelden blijven verborgen, de brief blijft in de gekozen taalweergave). Terugzetten kan altijd met een
// knopje in de kop van de brief (naast ↩ en ⓘ), zodat vertalen en beelden tonen nooit onbereikbaar worden.
// Bewust in het geheugen van dit tabblad (geen opslag): na herladen staan de stroken er weer — er gaat niets ongemerkt verloren.
// Één bron van waarheid voor beide componenten (MailGesprekInhoud = kop + vertaalstrook, MailBerichtTekst = beeldenstrook).
import { useSyncExternalStore } from 'react';
import './stroken-sluiten.css';

export type StrookSoort = 'taal' | 'beelden';

type Staat = {
  /** messageId → gesloten stroken */
  gesloten: ReadonlyMap<string, ReadonlySet<StrookSoort>>;
  /** messageId → aantal verborgen externe beelden waarvoor de beeldenstrook nu zou verschijnen (0 = geen strook) */
  beelden: ReadonlyMap<string, number>;
};

let staat: Staat = { gesloten: new Map(), beelden: new Map() };
const luisteraars = new Set<() => void>();
const zet = (volgende: Staat) => { staat = volgende; luisteraars.forEach((f) => f()); };
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
const lees = () => staat;

export function isGesloten(s: Staat, messageId: string, soort: StrookSoort): boolean {
  return !!s.gesloten.get(messageId)?.has(soort);
}

/** Sluit (✕) of zet terug (knop in de kop) — alleen voor deze brief. */
export function zetStrookGesloten(messageId: string, soort: StrookSoort, dicht: boolean): void {
  if (!messageId || isGesloten(staat, messageId, soort) === dicht) return;
  const gesloten = new Map(staat.gesloten);
  const set = new Set(gesloten.get(messageId) || []);
  if (dicht) set.add(soort); else set.delete(soort);
  if (set.size) gesloten.set(messageId, set); else gesloten.delete(messageId);
  zet({ ...staat, gesloten });
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
  zet({ gesloten: new Map(), beelden: new Map() });
}
