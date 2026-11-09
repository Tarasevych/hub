// Een uitrolpakket (.tar.gz) in de browser lezen, vóór het uploaden (Admin → «Оновлення» → «Розгорнути архів з цього пристрою»).
// Alleen de koppen worden gelezen (de inhoud van bestanden wordt overgeslagen), behalve UITROL-VERSIE en BRON-COMMIT bovenin.
// Dezelfde regels als root (deploy/uitrol/mijn-ruimte-uitrol.sh): precies één bovenmap of de bestanden direct in de wortel,
// UITROL-VERSIE = JJJJMMDD-UUMMSS, alleen gewone bestanden en mappen, geen paden buiten de map. Root controleert alles opnieuw;
// dit is alleen een snelle, duidelijke melding vóór een upload van megabytes.

import { bronCommit } from '../../shared/bron-commit';
import { MANIFEST_BESTAND, MANIFEST_MAX, TESTRESULTATEN_MAX, leesTestresultaten, manifestVerplicht, valideerManifest, type Manifest, type ManifestFout, type TestUitslag } from '../../shared/uitrol-manifest';
// Elk lezen van de schijf gaat door shared/bestand-lezen.ts: een DOMException van de File API (NotReadableError…) mag nooit
// rauw naar de gebruiker (en mag ook niet als «архів пошкоджений» worden gelezen) — eigenaar 20.10.2026.
import { MIGRATIE_NAAM } from '../../shared/uitrol-vereisten';
import { ONTWIKKELARCHIEF_MAX } from '../../shared/ontwikkelarchief';
import { isLeesfout, leesDeel, leesSha256, leesStroom, metLeesfout } from '../../shared/bestand-lezen';
export type PakketInfo = {
  versie: string; commit: string; bovenmap: string; bestanden: number; installer: boolean;
  /** Metadata uit het pakket zelf (zelfde regels als root): wie, via welke agent, en WAT er verandert. */
  auteur: string; agent: string; samenvatting: string;
  /** Testuitslag van de voorbereider uit TESTRESULTATEN in het pakket (JSON {geslaagd, mislukt, samenvatting}); null als het
   *  bestand ontbreekt of onleesbaar is. De wizard stuurt dit mee naar het voorstel, zodat de voorcontrole «tests» kan tonen. */
  tests: TestUitslag | null;
  /** UI-010: tweetalige metadata + deelnemers (UITROL-MANIFEST.json); null = ontbreekt of ongeldig (zie manifestFouten). */
  manifest: Manifest | null; manifestFouten: ManifestFout[];
  /** UITROL-001: UITROL-BASIS (versie=/commit=) — op welke geïnstalleerde versie het pakket gebouwd is; null = ontbreekt. */
  basis: { versie: string; commit: string } | null;
  /** UITROL-001: ruwe ONTWIKKELARCHIEF.json (≤ 8 KB) voor de vereistencontrole; null = ontbreekt. */
  ontwikkelArchief: string | null;
  /** UITROL-001: alle migrations/NNNN_naam.sql met grootte. De SQL-tekst zelf staat in migratieSql (alleen in het geheugen van de
   *  browser; alleen de NIEUWE migraties gaan naar de server voor de proef op een wegwerpkopie). */
  migraties: Array<{ naam: string; bytes: number }>;
  migratieSql: Map<string, string>;
  problemen: string[]; // codes: GEEN_VERSIE, VERSIE_ONGELDIG, MEER_MAPPEN, ONVEILIG_PAD, GEEN_GEWOON_BESTAND, GEEN_INSTALLER, GEEN_GZIP, TAR_ONGELDIG,
  //                      GEEN_AUTEUR, AUTEUR_KORT, GEEN_AGENT, AGENT_ONGELDIG, GEEN_SAMENVATTING, SAMENVATTING_KORT, GEEN_BRON_COMMIT
};
const LEEG: PakketInfo = { versie: '', commit: '', bovenmap: '', bestanden: 0, installer: false, auteur: '', agent: '', samenvatting: '', tests: null, manifest: null, manifestFouten: [], basis: null, ontwikkelArchief: null, migraties: [], migratieSql: new Map(), problemen: [] };
/** Bestanden die we uit het pakket lezen, met hun maximale grootte (root leest ze met dezelfde grenzen). */
const METABESTANDEN: Record<string, number> = { 'UITROL-VERSIE': 200, 'BRON-COMMIT': 200, AUTEUR: 200, AGENT: 40, SAMENVATTING: 8000, TESTRESULTATEN: TESTRESULTATEN_MAX, [MANIFEST_BESTAND]: MANIFEST_MAX, 'UITROL-BASIS': 1000, 'ONTWIKKELARCHIEF.json': ONTWIKKELARCHIEF_MAX };
/** Grens per migratiebestand dat we in het geheugen lezen (groter: alleen naam + grootte; de server meldt het dan). */
const MIGRATIE_MAX = 512 * 1024;
const schoon = (t: string) => t.replace(/\0/g, '').replace(/\r/g, '').trim();

const VERSIE = /^[0-9]{8}-[0-9]{6}$/;
const tekst = (b: Uint8Array) => new TextDecoder().decode(b);
const cstr = (b: Uint8Array) => { const i = b.indexOf(0); return tekst(i < 0 ? b : b.subarray(0, i)); };
const octaal = (b: Uint8Array) => { const s = cstr(b).trim(); return s ? parseInt(s, 8) : 0; };

/** pax-records "len key=value\n" → map. */
function pax(b: Uint8Array): Record<string, string> {
  const uit: Record<string, string> = {}; const s = tekst(b); let i = 0;
  while (i < s.length) {
    const sp = s.indexOf(' ', i); if (sp < 0) break;
    const len = Number(s.slice(i, sp)); if (!Number.isFinite(len) || len <= 0) break;
    const rec = s.slice(sp + 1, i + len - 1); const eq = rec.indexOf('=');
    if (eq > 0) uit[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return uit;
}

/** Leest de tar-stroom (na gunzip) in stukken; bewaart alleen wat nodig is. */
export async function leesTar(stroom: ReadableStream<Uint8Array>): Promise<PakketInfo> {
  const info: PakketInfo = { ...LEEG, manifestFouten: [], migraties: [], migratieSql: new Map(), problemen: [] };
  const toppen = new Set<string>(); let wortelBestanden = false;
  const lezer = stroom.getReader();
  let buf = new Uint8Array(0);
  let overslaan = 0; // bytes inhoud die we niet nodig hebben
  let nodig: null | { naam: string; grootte: number; soort: 'bestand' | 'pax' | 'gpax' | 'lang' | 'migratie' } = null;
  let volgendeNaam = '';
  const versies: Record<string, string> = {};
  let klaar = false;
  const voeg = (n: Uint8Array) => { const t = new Uint8Array(buf.length + n.length); t.set(buf); t.set(n, buf.length); buf = t; };
  const probleem = (c: string) => { if (!info.problemen.includes(c)) info.problemen.push(c); };

  while (!klaar) {
    const { value, done } = await lezer.read();
    if (value) voeg(value);
    for (;;) {
      if (overslaan) { const n = Math.min(overslaan, buf.length); buf = buf.subarray(n); overslaan -= n; if (overslaan) break; }
      if (nodig) {
        const blok = Math.ceil(nodig.grootte / 512) * 512;
        if (buf.length < blok) break;
        const inhoud = buf.subarray(0, nodig.grootte);
        if (nodig.soort === 'lang') volgendeNaam = cstr(inhoud);
        else if (nodig.soort === 'pax') { const p = pax(inhoud); if (p.path) volgendeNaam = p.path; }
        else if (nodig.soort === 'gpax') { const p = pax(inhoud); if (/^[0-9a-f]{40,64}$/.test(p.comment || '')) info.commit = info.commit || p.comment; }
        else if (nodig.soort === 'migratie') info.migratieSql.set(nodig.naam, new TextDecoder().decode(inhoud));
        else versies[nodig.naam] = nodig.naam === 'UITROL-BASIS' || nodig.naam === 'ONTWIKKELARCHIEF.json' || nodig.naam === 'SAMENVATTING' || nodig.naam === 'AUTEUR' || nodig.naam === 'AGENT' || nodig.naam === 'BRON-COMMIT' || nodig.naam === 'TESTRESULTATEN' || nodig.naam === MANIFEST_BESTAND ? schoon(tekst(inhoud)) : tekst(inhoud).replace(/\s+/g, '');
        buf = buf.subarray(blok); nodig = null; continue;
      }
      if (buf.length < 512) break;
      const kop = buf.subarray(0, 512);
      if (kop.every((x) => x === 0)) { klaar = true; break; }
      const som = kop.reduce((a, x, i) => a + (i >= 148 && i < 156 ? 32 : x), 0);
      if (som !== octaal(kop.subarray(148, 156))) { probleem('TAR_ONGELDIG'); klaar = true; break; }
      const type = String.fromCharCode(kop[156] || 48);
      const grootte = octaal(kop.subarray(124, 136));
      const prefix = cstr(kop.subarray(345, 500));
      let naam = volgendeNaam || (prefix ? `${prefix}/${cstr(kop.subarray(0, 100))}` : cstr(kop.subarray(0, 100)));
      volgendeNaam = '';
      buf = buf.subarray(512);
      if (type === 'L') { nodig = { naam: '', grootte, soort: 'lang' }; continue; }
      if (type === 'x') { nodig = { naam: '', grootte, soort: 'pax' }; continue; }
      if (type === 'g') { nodig = { naam: '', grootte, soort: 'gpax' }; continue; }
      naam = naam.replace(/^\.\//, '');
      const delen = naam.split('/').filter((d) => d && d !== '.');
      if (naam.startsWith('/') || delen.includes('..') || naam.includes('\\')) probleem('ONVEILIG_PAD');
      if (!(type === '0' || type === '\0' || type === '5')) probleem('GEEN_GEWOON_BESTAND');
      if (delen.length) {
        if (delen.length === 1 && type !== '5') wortelBestanden = true; else toppen.add(delen[0]);
      }
      if (type !== '5') info.bestanden++;
      const kort = delen.length === 2 ? delen[1] : delen.length === 1 ? delen[0] : '';
      const pad = delen.join('/');
      if (/(^|\/)deploy\/installeer-app\.sh$/.test(pad) && delen.length <= 3) info.installer = true;
      const blok = Math.ceil(grootte / 512) * 512;
      // migrations/NNNN_naam.sql direct onder de bovenmap (of de wortel): naam + grootte altijd, inhoud tot MIGRATIE_MAX.
      const mi = delen.length - 2;
      if (type !== '5' && mi >= 0 && mi <= 1 && delen[mi] === 'migrations' && delen[mi + 1].endsWith('.sql') && MIGRATIE_NAAM.test(delen[mi + 1].slice(0, -4))) {
        const mnaam = delen[mi + 1].slice(0, -4);
        info.migraties.push({ naam: mnaam, bytes: grootte });
        if (grootte <= MIGRATIE_MAX) { nodig = { naam: mnaam, grootte, soort: 'migratie' }; continue; }
      }
      if (Object.prototype.hasOwnProperty.call(METABESTANDEN, kort) && delen.length <= 2 && grootte <= METABESTANDEN[kort]) { nodig = { naam: kort, grootte, soort: 'bestand' }; continue; }
      overslaan = blok;
    }
    if (done) break;
  }
  try { await lezer.cancel(); } catch { /* al klaar */ }
  if (toppen.size > 1 || (toppen.size === 1 && wortelBestanden)) probleem('MEER_MAPPEN');
  info.bovenmap = toppen.size === 1 && !wortelBestanden ? [...toppen][0] : '';
  info.versie = versies['UITROL-VERSIE'] || '';
  // Regel 3 (shared/bron-commit.ts): 40 hex of «zonder-git:<reden>»; anders GEEN_BRON_COMMIT (root en de voorcontrole weigeren dat ook).
  // Zonder geldig bestand blijft de commit uit de pax-kop van git ter informatie staan, maar het probleem blijft.
  { const bc = bronCommit(versies['BRON-COMMIT']); if (bc.waarde) info.commit = bc.waarde; else probleem('GEEN_BRON_COMMIT'); }
  if (!info.versie) probleem('GEEN_VERSIE'); else if (!VERSIE.test(info.versie)) probleem('VERSIE_ONGELDIG');
  if (!info.installer) probleem('GEEN_INSTALLER');
  info.auteur = versies.AUTEUR || ''; info.agent = versies.AGENT || ''; info.samenvatting = versies.SAMENVATTING || '';
  { // UITROL-BASIS: regels «versie=…» en «commit=…» (zelfde lezing als root, mijn-ruimte-uitrol.sh).
    const b = versies['UITROL-BASIS'];
    if (b != null) { const veld = (k: string) => (new RegExp(`^${k}=(.*)$`, 'm').exec(b)?.[1] || '').replace(/\s+/g, ''); info.basis = { versie: veld('versie'), commit: veld('commit') }; }
  }
  info.ontwikkelArchief = versies['ONTWIKKELARCHIEF.json'] ?? null;
  info.migraties.sort((x, y) => x.naam.localeCompare(y.naam));
  if (!info.auteur) probleem('GEEN_AUTEUR'); else if (info.auteur.length < 3) probleem('AUTEUR_KORT');
  if (!info.agent) probleem('GEEN_AGENT'); else if (!/^[a-z][a-z0-9-]{1,31}$/.test(info.agent)) probleem('AGENT_ONGELDIG');
  if (!info.samenvatting) probleem('GEEN_SAMENVATTING'); else if (info.samenvatting.replace(/\s+/g, ' ').length < 20) probleem('SAMENVATTING_KORT');
  // TESTRESULTATEN is vrijwillig: geen probleemcode als het ontbreekt — de voorcontrole van de server toont dan de
  // gewone waarschuwing «geen testresultaten gemeld».
  info.tests = leesTestresultaten(versies.TESTRESULTATEN);
  // UI-010: UITROL-MANIFEST.json. Aanwezig → altijd valideren; afwezig → alleen fout voor nieuwe versies (beleid oude formaten).
  if (versies[MANIFEST_BESTAND] != null) {
    const r = valideerManifest(versies[MANIFEST_BESTAND], info.versie); info.manifest = r.manifest; info.manifestFouten = r.fouten;
    if (r.fouten.length) probleem('MANIFEST_ONGELDIG');
  } else if (manifestVerplicht(info.versie)) { info.manifestFouten = [{ veld: MANIFEST_BESTAND, uk: 'файл відсутній', nl: 'bestand ontbreekt' }]; probleem('GEEN_MANIFEST'); }
  return info;
}

/** Bestand (Blob) → PakketInfo + sha256 (hex). Gebruikt DecompressionStream (Chrome, Safari 16.4+, Firefox 113+). */
export async function leesPakket(bestand: Blob): Promise<{ info: PakketInfo; sha256: string }> {
  // Alle drie de leesbewerkingen (kop, sha256, stroom) kunnen een DOMException geven als het bestand van de schijf verdween of
  // «op aanvraag» in de cloud staat. Die fout komt als BestandLeesfout naar buiten; de aanroeper legt hem uit (één bron).
  const kop = await leesDeel(bestand, 0, 2);
  const shaP = leesSha256(bestand);
  if (kop[0] !== 0x1f || kop[1] !== 0x8b) return { info: { ...LEEG, problemen: ['GEEN_GZIP'] }, sha256: await shaP };
  let info: PakketInfo;
  try { info = await metLeesfout(bestand, () => leesTar((leesStroom(bestand) as ReadableStream).pipeThrough(new DecompressionStream('gzip')) as ReadableStream<Uint8Array>)); }
  catch (e) {
    // Een LEESfout is geen kapot archief: dan zou de melding liegen («архів пошкоджений»). Die gaat ongewijzigd door.
    if (isLeesfout(e)) { void shaP.catch(() => undefined); throw e; }
    info = { ...LEEG, problemen: ['TAR_ONGELDIG'] };
  }
  return { info, sha256: await shaP };
}

/** Uint8Array → base64 (in stukken, geen stack-overloop). */
export function naarBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
