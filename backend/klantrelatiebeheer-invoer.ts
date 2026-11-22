import { FASEN, KANALEN, type Klantbewerking } from '../shared/klantrelatiebeheer';

export class Klantfout extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const kenmerk = (waarde: unknown) => {
  if (typeof waarde !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(waarde)) {
    throw new Klantfout('KLANT_SLEUTEL_ONGELDIG');
  }
  return waarde.toLowerCase();
};
function tekst(waarde: unknown, lengte: number, verplicht = false) {
  if (waarde == null && !verplicht) return '';
  if (typeof waarde !== 'string' || waarde.length > lengte || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(waarde)) throw new Klantfout('KLANT_TEKST_ONGELDIG');
  const schoon = waarde.trim();
  if (verplicht && !schoon) throw new Klantfout('KLANT_VELD_VEREIST');
  return schoon;
}
function geheel(waarde: unknown, hoogste: number) {
  if (typeof waarde !== 'number' || !Number.isSafeInteger(waarde) || waarde < 0 || waarde > hoogste) throw new Klantfout('KLANT_GETAL_ONGELDIG');
  return waarde;
}
function keuze<T extends string>(waarde: unknown, waarden: readonly T[]): T {
  if (!waarden.includes(waarde as T)) throw new Klantfout('KLANT_KEUZE_ONGELDIG');
  return waarde as T;
}
function dag(waarde: unknown) {
  const datum = tekst(waarde, 10);
  if (!datum) return '';
  const tijd = Date.parse(datum);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(tijd) || new Date(tijd).toISOString().slice(0, 10) !== datum) throw new Klantfout('KLANT_DATUM_ONGELDIG');
  return datum;
}
function persoon(velden: Record<string, unknown>) {
  const mail = tekst(velden.mail, 254);
  if (mail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail)) throw new Klantfout('KLANT_POSTADRES_ONGELDIG');
  return { naam: tekst(velden.naam, 180, true), organisatie: tekst(velden.organisatie, 200), mail, telefoon: tekst(velden.telefoon, 80) };
}
function verband(velden: Record<string, unknown>) {
  return { klantId: kenmerk(velden.klantId), kansId: velden.kansId === '' || velden.kansId == null ? '' : kenmerk(velden.kansId) };
}
function afspraak(waarde: unknown) {
  const id = tekst(waarde, 1100);
  if (!id) return {};
  if (!/^google:[^\s:/]+:[^\s:/]+$/.test(id)) throw new Klantfout('KLANT_AFSPRAAK_ONGELDIG');
  return { afspraakId: id };
}
export function klantopdracht(soort: Klantbewerking, velden: Record<string, unknown>) {
  const sleutel = kenmerk(velden.sleutel);
  switch (soort) {
    case 'klant': return { soort, sleutel, persoon: persoon(velden) };
    case 'wijzig': return { soort, sleutel, klantId: kenmerk(velden.klantId), versie: geheel(velden.versie, 2147483647), persoon: persoon(velden) };
    case 'wissen': return { soort, sleutel, klantId: kenmerk(velden.klantId), versie: geheel(velden.versie, 2147483647) };
    case 'aanvraag': return { soort, sleutel, persoon: persoon(velden), kanaal: keuze(velden.kanaal ?? 'formulier', KANALEN),
      tekst: tekst(velden.tekst, 8000, true), titel: tekst(velden.titel, 240, true), datum: dag(velden.datum) };
    case 'kans': return { soort, sleutel, klantId: kenmerk(velden.klantId), titel: tekst(velden.titel, 240, true), centen: geheel(velden.centen, 999999999999), fase: keuze(velden.fase ?? 'aanvraag', FASEN) };
    case 'fase': return { soort, sleutel, kansId: kenmerk(velden.kansId), fase: keuze(velden.fase, FASEN), vorigeFase: keuze(velden.vorigeFase, FASEN) };
    case 'contact': return { soort, sleutel, ...verband(velden), kanaal: keuze(velden.kanaal, KANALEN), tekst: tekst(velden.tekst, 8000, true),
      minuten: geheel(velden.minuten ?? 0, 1440 * 31), richting: keuze(velden.richting ?? 'intern', ['in', 'uit', 'intern'] as const), ...afspraak(velden.afspraakId) };
    case 'taak': return { soort, sleutel, ...verband(velden), titel: tekst(velden.titel, 240, true), datum: dag(velden.datum) };
    case 'afronden': return { soort, sleutel, taakId: kenmerk(velden.taakId) };
    default: throw new Klantfout('KLANT_OPDRACHT_ONGELDIG');
  }
}
