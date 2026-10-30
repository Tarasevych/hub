// Cloud vNext — OVERDRACHTEN (29.10.2026): het gedeelde contract voor stevige, hervattbare, achtergrond-overdrachten.
// Eén waarheid voor server (backend/cloud-vnext-bestanden.ts, backend/cloud-vnext-taken.ts), client
// (src/cloud-vnext/overdracht-beheer.ts) en tests. Regels die hier vastliggen:
//   • een grens op grootte/type komt ALTIJD van een echte bron (de dienst zelf, onze verpakking of de schijf) en de UI
//     noemt die bron; er is geen tweede, verzonnen plafond;
//   • een afgebroken upload is geen fout maar een toestand: de sessie leeft op de SCHIJF van de server en gaat verder
//     vanaf precies de ontbrekende stukken (netwerkbreuk, tabblad dicht, serverherstart);
//   • stukken mogen in WILLEKEURIGE volgorde en parallel aankomen (de client stuurt er PARALLEL_STUKKEN tegelijk);
//   • werk dat de mens niet hoeft te zien gebeurt op de achtergrond: een overdracht tussen diensten is een taak op de
//     server met eerlijke voortgang — de pagina blijft bruikbaar.
import { CLOUD_VNEXT_LIMIETEN, type Tweetalig } from './cloud-vnext-model';

export const PARALLEL_STUKKEN = 3;        // gelijktijdige stukken per upload (meer paden = sneller én stabieler)
export const SESSIE_UREN_MAX = 48;        // een uploadsessie op de serverschijf leeft maximaal zo lang
export const HERVAT_POGINGEN = 8;         // client: zachte herhalingen met oplopende pauze vóór de toestand «wacht op netwerk»
export const HERVAT_PAUZE_MS = [500, 1000, 2000, 4000, 8000] as const; // daarna steeds de laatste waarde

// ---------------------------------------------------------------- upload/download-API (uitbreiding op het bestaande contract)
//   /api/owner/cloud/vnext/upload   { actie:'begin', naam, mime, bytes, mapId? } → { id, stukMax, ontvangen:0 }
//                                   { actie:'stuk', id, offset, data(b64) } → { ontvangen }        offset = n × stukMax, elke volgorde
//                                   { actie:'status', id } → { id, naam, bytes, stukMax, ontvangen, ontbreekt:number[] (stuk-indexen, max 64) }
//                                   { actie:'zoek', naam, bytes, mapId? } → { sessie: {id,ontvangen}|null }   hervatten na herladen
//                                   { actie:'klaar', id, sha256 } → { bestand }   (sha wordt STROMEND gecontroleerd, nooit heel in RAM)
//                                   { actie:'afbreken', id } → { ok }
//   /api/owner/cloud/vnext/download { id, versie?, offset?, lengte? } → zonder offset: heel bestand (≤ downloadMaxBytes, anders TE_GROOT
//                                   mét het eerlijke advies om in delen te halen); met offset: { naam,mime,bytes,sha256,offset,data(b64) }
//                                   waarbij lengte ≤ downloadDeelBytes — de client haalt grote bestanden in delen met herhaling.
// Nieuwe foutcodes: SCHIJF_VOL (eigen schijf is de echte grens), SESSIE_VERLOPEN, DEEL_BUITEN_BEREIK.

// ---------------------------------------------------------------- taken (achtergrond-overdrachten tussen diensten)
//   /api/owner/cloud/vnext/taken  { actie:'nieuw', soort, bron, doel } → { taak } | { error, grens? }
//                                 { actie:'lijst' } → { taken: CloudTaak[] }    (jongste eerst, max 50)
//                                 { actie:'annuleer'|'opnieuw'|'opruimen', id? } → { taak? , ok? }
// De server voert taken één voor één per account uit (eigen proces), werkt voortgang bij in het record en overleeft een
// herstart (stand 'bezig' zonder hartslag → terug naar 'wacht'). Niets heet klaar vóór de bytes echt staan.
export type CloudTaakSoort = 'kopie' | 'verplaats';
export type CloudTaakStand = 'wacht' | 'bezig' | 'klaar' | 'fout' | 'geannuleerd';
export type CloudTaakPunt =
  | { dienst: 'eigen'; id?: string; mapId?: string | null; naam?: string }
  | { dienst: 'google-drive'; account: string; id?: string; mapId?: string; naam?: string };
export type CloudTaak = {
  id: string; soort: CloudTaakSoort; stand: CloudTaakStand;
  bron: CloudTaakPunt; doel: CloudTaakPunt;
  naam: string; totaalBytes: number; voortgangBytes: number;
  fout?: { code: string; uitleg: Tweetalig; suggestie?: Tweetalig };
  aangemaaktOp: string; bijgewerktOp: string;
};

// ---------------------------------------------------------------- grenzen per dienst — met de BRON van elke grens
// maxBytes: null = geen grens vanuit de dienst (dan geldt alleen de echte schijf/het echte abonnement van de mens).
export type OverdrachtGrens = {
  uploadMaxBytes: number | null;        // wat wij naar deze dienst kunnen schrijven, per bestand
  downloadMaxBytes: number | null;      // wat wij uit deze dienst kunnen lezen, per bestand
  bron: Tweetalig;                      // WIE deze grens stelt (de dienst, onze verpakking, de schijf) — eerlijk benoemd
  suggestie?: Tweetalig;                // wat de mens kan doen als een bestand er niet doorheen past
};
export const OVERDRACHT_GRENZEN: Readonly<Record<string, OverdrachtGrens>> = Object.freeze({
  eigen: {
    uploadMaxBytes: null, downloadMaxBytes: null,
    bron: ['Ваш власний сервер: єдина реальна межа — вільне місце на диску (сервер перевіряє перед початком).', 'Uw eigen server: de enige echte grens is de vrije schijfruimte (de server controleert vooraf).'],
    suggestie: ['Якщо диск повний — звільніть місце або додайте диск; сайт покаже SCHIJF_VOL із цифрами.', 'Is de schijf vol: maak ruimte vrij of breid uit; de site toont SCHIJF_VOL met de cijfers.'],
  },
  'google-drive': {
    uploadMaxBytes: 5 * 1024 * 1024, downloadMaxBytes: 32 * 1024 * 1024,
    bron: ['Межа нашої серверної упаковки Google Drive API (не Google): завантаження одним запитом до 5 МБ, читання до 32 МБ. Google сам приймає файли до 5 ТБ — більші межі заплановано через resumable-API.', 'Grens van onze serververpakking van de Google Drive API (niet van Google): upload in één verzoek tot 5 MB, lezen tot 32 MB. Google zelf accepteert tot 5 TB — ruimere grenzen staan gepland via de resumable-API.'],
    suggestie: ['Більший файл: стисніть/розбийте його, або збережіть у власну хмару (без межі) й зачекайте на resumable-оновлення.', 'Groter bestand: comprimeer/splits het, of bewaar het in de eigen cloud (zonder grens) tot de resumable-update er is.'],
  },
});
export const overdrachtGrens = (dienst: string): OverdrachtGrens | null => OVERDRACHT_GRENZEN[dienst] ?? null;

// ---------------------------------------------------------------- stuk-wiskunde, gedeeld door client, server en tests
export const stukTotaal = (bytes: number, stukMax = CLOUD_VNEXT_LIMIETEN.stukMaxBytes): number => Math.max(1, Math.ceil(bytes / stukMax));
/** Welke stuk-indexen ontbreken, gegeven de ontvangen indexen. Begrensd (standaard 64) zodat het antwoord klein blijft. */
export function ontbrekendeStukken(bytes: number, ontvangen: ReadonlySet<number>, kap = 64, stukMax = CLOUD_VNEXT_LIMIETEN.stukMaxBytes): number[] {
  const uit: number[] = [];
  const n = stukTotaal(bytes, stukMax);
  for (let i = 0; i < n && uit.length < kap; i++) if (!ontvangen.has(i)) uit.push(i);
  return uit;
}
/** Geldig stuk-offset: een veelvoud van stukMax binnen het bestand. */
export const geldigStukOffset = (offset: number, bytes: number, stukMax = CLOUD_VNEXT_LIMIETEN.stukMaxBytes): boolean =>
  Number.isInteger(offset) && offset >= 0 && offset < Math.max(bytes, 1) && offset % stukMax === 0;
