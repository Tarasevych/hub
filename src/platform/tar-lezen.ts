// Een uitrolpakket (.tar.gz) in de browser lezen, vóór het uploaden (Admin → «Оновлення» → «Розгорнути архів з цього пристрою»).
// Alleen de koppen worden gelezen (de inhoud van bestanden wordt overgeslagen), behalve UITROL-VERSIE en BRON-COMMIT bovenin.
// Dezelfde regels als root (deploy/uitrol/mijn-ruimte-uitrol.sh): precies één bovenmap of de bestanden direct in de wortel,
// UITROL-VERSIE = JJJJMMDD-UUMMSS, alleen gewone bestanden en mappen, geen paden buiten de map. Root controleert alles opnieuw;
// dit is alleen een snelle, duidelijke melding vóór een upload van megabytes.

export type PakketInfo = {
  versie: string; commit: string; bovenmap: string; bestanden: number; installer: boolean;
  problemen: string[]; // codes: GEEN_VERSIE, VERSIE_ONGELDIG, MEER_MAPPEN, ONVEILIG_PAD, GEEN_GEWOON_BESTAND, GEEN_INSTALLER, GEEN_GZIP, TAR_ONGELDIG
};

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
  const info: PakketInfo = { versie: '', commit: '', bovenmap: '', bestanden: 0, installer: false, problemen: [] };
  const toppen = new Set<string>(); let wortelBestanden = false;
  const lezer = stroom.getReader();
  let buf = new Uint8Array(0);
  let overslaan = 0; // bytes inhoud die we niet nodig hebben
  let nodig: null | { naam: string; grootte: number; soort: 'bestand' | 'pax' | 'gpax' | 'lang' } = null;
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
        else versies[nodig.naam] = tekst(inhoud).replace(/\s+/g, '');
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
      if ((kort === 'UITROL-VERSIE' || kort === 'BRON-COMMIT') && delen.length <= 2 && grootte <= 200) { nodig = { naam: kort, grootte, soort: 'bestand' }; continue; }
      overslaan = blok;
    }
    if (done) break;
  }
  try { await lezer.cancel(); } catch { /* al klaar */ }
  if (toppen.size > 1 || (toppen.size === 1 && wortelBestanden)) probleem('MEER_MAPPEN');
  info.bovenmap = toppen.size === 1 && !wortelBestanden ? [...toppen][0] : '';
  info.versie = versies['UITROL-VERSIE'] || '';
  if (/^[0-9a-f]{7,64}$/.test(versies['BRON-COMMIT'] || '')) info.commit = versies['BRON-COMMIT'];
  if (!info.versie) probleem('GEEN_VERSIE'); else if (!VERSIE.test(info.versie)) probleem('VERSIE_ONGELDIG');
  if (!info.installer) probleem('GEEN_INSTALLER');
  return info;
}

/** Bestand (Blob) → PakketInfo + sha256 (hex). Gebruikt DecompressionStream (Chrome, Safari 16.4+, Firefox 113+). */
export async function leesPakket(bestand: Blob): Promise<{ info: PakketInfo; sha256: string }> {
  const kop = new Uint8Array(await bestand.slice(0, 2).arrayBuffer());
  const shaP = bestand.arrayBuffer().then((b) => crypto.subtle.digest('SHA-256', b)).then((h) => [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''));
  if (kop[0] !== 0x1f || kop[1] !== 0x8b) return { info: { versie: '', commit: '', bovenmap: '', bestanden: 0, installer: false, problemen: ['GEEN_GZIP'] }, sha256: await shaP };
  let info: PakketInfo;
  try { info = await leesTar(bestand.stream().pipeThrough(new DecompressionStream('gzip')) as ReadableStream<Uint8Array>); }
  catch { info = { versie: '', commit: '', bovenmap: '', bestanden: 0, installer: false, problemen: ['TAR_ONGELDIG'] }; }
  return { info, sha256: await shaP };
}

/** Uint8Array → base64 (in stukken, geen stack-overloop). */
export function naarBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
