// Elk lezen van een bestand dat de GEBRUIKER koos, op één plek.
//
// Waarom (eigenaar 20.10.2026): het uploaden van een pakket eindigde met «Причина невідома … Сервер повернув NotReadableError».
// Die code kwam niet van de server, maar van de File API van de browser: `File.slice().arrayBuffer()`, `Blob.arrayBuffer()`,
// `Blob.stream()` en `FileReader` werpen een DOMException zodra het gekozen bestand niet meer te lezen is (verplaatst,
// hernoemd, overschreven, «op aanvraag» in OneDrive/Google Drive, netwerkschijf, virusscanner). Zulke fouten mogen NOOIT rauw
// bij de gebruiker komen: ze reizen als `BESTAND_LEZEN|<naam>` en shared/foutuitleg.ts geeft er oorzaak + handeling bij.
//
// Regel: wie van een File/Blob van de gebruiker leest, gebruikt een functie uit dit bestand. Zuiver genoeg voor de tests
// (alleen de web-standaarden Blob, DOMException en FileReader, geen DOM en geen globals van de site).
import { bestandLeesfoutCode, isBestandLeesfout } from './foutuitleg';

/** Een leesfout van een bestand met de code `BESTAND_LEZEN|<naam>` als `message` (foutCode leest die) en de echte oorzaak erbij. */
export class BestandLeesfout extends Error {
  /** Naam van de DOMException van de browser, bv. 'NotReadableError'. */
  readonly bestandsnaamFout: string = '';
  /** Naam van het bestand dat niet gelezen kon worden (leeg = onbekend). */
  readonly bestand: string = '';
  /** De fout die de browser zelf wierp. */
  readonly oorzaak: unknown = null;
  constructor(oorzaak: unknown, bestand?: { name?: string }) {
    super(bestandLeesfoutCode(oorzaak));
    this.name = 'BestandLeesfout';
    this.bestandsnaamFout = String((oorzaak as { name?: unknown } | null)?.name || '');
    this.bestand = String(bestand?.name || '');
    this.oorzaak = oorzaak;
  }
}

/** Zet welke fout dan ook om in een BestandLeesfout (een bestaande blijft zoals hij is). */
export const bestandLeesfout = (oorzaak: unknown, bestand?: { name?: string }): BestandLeesfout =>
  oorzaak instanceof BestandLeesfout ? oorzaak : new BestandLeesfout(oorzaak, bestand);
/** true = deze fout komt van het lezen van een bestand (en niet van de server). */
export const isLeesfout = (oorzaak: unknown): boolean =>
  oorzaak instanceof BestandLeesfout || isBestandLeesfout(String((oorzaak as { message?: unknown } | null)?.message || ''));

/** Elke leesbewerking door één poort: wat de browser werpt, komt eruit als BestandLeesfout. */
export async function metLeesfout<T>(bestand: Blob | File | null | undefined, lees: () => Promise<T>): Promise<T> {
  try { return await lees(); }
  catch (e) { throw bestandLeesfout(e, (bestand as { name?: string } | null) || undefined); }
}

/** Een stuk van een bestand als bytes (van..tot, zoals Blob.slice). */
export const leesDeel = (bestand: Blob, van = 0, tot?: number): Promise<Uint8Array> =>
  metLeesfout(bestand, async () => new Uint8Array(await bestand.slice(van, typeof tot === 'number' ? tot : bestand.size).arrayBuffer()));

/** De eerste bytes van een bestand (standaard 512): ook de goedkoopste controle «is dit bestand nog leesbaar?». */
export const leesKop = (bestand: Blob, bytes = 512): Promise<Uint8Array> => leesDeel(bestand, 0, Math.min(bestand.size, bytes));

/** Het hele bestand als bytes. */
export const leesAlles = (bestand: Blob): Promise<Uint8Array> =>
  metLeesfout(bestand, async () => new Uint8Array(await bestand.arrayBuffer()));

/** sha256 (hex) van een bestand; een leesfout komt eruit als BestandLeesfout, nooit als «sha komt niet overeen». */
export const leesSha256 = (bestand: Blob): Promise<string> =>
  metLeesfout(bestand, async () => {
    const h = await crypto.subtle.digest('SHA-256', await bestand.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  });

/** De stroom van een bestand; de fout komt pas bij het lezen, dus wie deze stroom leest, doet dat binnen `metLeesfout`. */
export const leesStroom = (bestand: Blob): ReadableStream<Uint8Array> => bestand.stream() as ReadableStream<Uint8Array>;

/** base64 van de inhoud (zonder «data:…,»-kop), via FileReader: ook `reader.error` is een DOMException van de File API. */
export const leesBase64 = (bestand: Blob): Promise<string> =>
  metLeesfout(bestand, () => new Promise<string>((klaar, mis) => {
    const lezer = new FileReader();
    lezer.onload = () => klaar(String(lezer.result || '').replace(/^data:[^,]*,/, ''));
    lezer.onerror = () => mis(lezer.error || new Error('NotReadableError'));
    lezer.onabort = () => mis(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    lezer.readAsDataURL(bestand);
  }));

/** De volledige data-URL van de inhoud («data:<type>;base64,…»). */
export const leesDataUrl = (bestand: Blob): Promise<string> =>
  metLeesfout(bestand, () => new Promise<string>((klaar, mis) => {
    const lezer = new FileReader();
    lezer.onload = () => klaar(String(lezer.result || ''));
    lezer.onerror = () => mis(lezer.error || new Error('NotReadableError'));
    lezer.onabort = () => mis(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    lezer.readAsDataURL(bestand);
  }));

/** De tekst van een bestand. */
export const leesTekst = (bestand: Blob): Promise<string> => metLeesfout(bestand, () => bestand.text());
