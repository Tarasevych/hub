// S3-compatibele opslag (AWS S3, MinIO, Wasabi, Backblaze B2 S3, …): ListObjectsV2 met AWS Signature Version 4, path-style.
// Alleen lezen. De handtekening wordt getest met de officiële AWS-voorbeeldwaarden (tests/eenheid/verbinding-adapters-20261029.test.ts).
import { createHash, createHmac } from 'node:crypto';
import { alleenHttps, httpFout, type Haal, type Uitslag } from './gemeen';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s, 'utf8').digest();
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type S3Sleutel = { toegangsId: string; geheim: string; regio: string };
/** Ondertekent een GET-verzoek (SigV4, payload leeg). Geeft de headers terug. `nu` is injecteerbaar voor tests. */
export function s3Onderteken(url: URL, sleutel: S3Sleutel, nu = new Date(), dienst = 's3'): Record<string, string> {
  const amzDatum = nu.toISOString().replace(/[:-]|\.\d{3}/g, ''), datum = amzDatum.slice(0, 8);
  const leeg = sha('');
  const query = [...url.searchParams.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': leeg, 'x-amz-date': amzDatum };
  const namen = Object.keys(headers).sort();
  const pad = url.pathname.split('/').map((d) => rfc3986(decodeURIComponent(d))).join('/') || '/';
  const canoniek = `GET\n${pad}\n${query}\n${namen.map((n) => `${n}:${headers[n].trim()}\n`).join('')}\n${namen.join(';')}\n${leeg}`;
  const bereik = `${datum}/${sleutel.regio}/${dienst}/aws4_request`;
  const teTekenen = ['AWS4-HMAC-SHA256', amzDatum, bereik, sha(canoniek)].join('\n');
  const k = hmac(hmac(hmac(hmac(`AWS4${sleutel.geheim}`, datum), sleutel.regio), dienst), 'aws4_request');
  const handtekening = createHmac('sha256', k).update(teTekenen, 'utf8').digest('hex');
  return { 'x-amz-content-sha256': leeg, 'x-amz-date': amzDatum, Authorization: `AWS4-HMAC-SHA256 Credential=${sleutel.toegangsId}/${bereik}, SignedHeaders=${namen.join(';')}, Signature=${handtekening}` };
}

export type S3Object = { sleutel: string; grootte: number; gewijzigd: string };
export async function s3Lijst(haal: Haal, eindpunt: string, emmer: string, sleutel: S3Sleutel, opties: { toestaanHttp?: boolean; max?: number; nu?: Date } = {}): Promise<Uitslag<{ objecten: S3Object[]; afgekapt: boolean }>> {
  const basis = alleenHttps(eindpunt, opties.toestaanHttp);
  if (!basis) return { ok: false, fout: 'S3_ADRES_ONGELDIG' };
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(emmer)) return { ok: false, fout: 'S3_EMMER_ONGELDIG' };
  if (!sleutel.toegangsId || !sleutel.geheim) return { ok: false, fout: 'S3_GEGEVENS_ONTBREKEN' };
  const u = new URL(`/${emmer}`, basis); u.searchParams.set('list-type', '2'); u.searchParams.set('max-keys', String(Math.min(opties.max ?? 50, 1000)));
  let r: Response;
  try { r = await haal(u.toString(), { method: 'GET', headers: s3Onderteken(u, { ...sleutel, regio: sleutel.regio || 'us-east-1' }, opties.nu) }); }
  catch (e) { return { ok: false, fout: 'S3_ONBEREIKBAAR', detail: String((e as Error).message || '').slice(0, 120) }; }
  const tekst = await r.text();
  if (r.status !== 200) { const code = /<Code>([^<]+)<\/Code>/.exec(tekst)?.[1]; return { ok: false, fout: code === 'NoSuchBucket' ? 'S3_EMMER_NIET_GEVONDEN' : code === 'SignatureDoesNotMatch' || code === 'InvalidAccessKeyId' ? 'S3_TOEGANG_GEWEIGERD' : httpFout('S3', r.status), detail: code }; }
  if (!/<ListBucketResult/.test(tekst)) return { ok: false, fout: 'S3_ANTWOORD_ONGELDIG' };
  const objecten = (tekst.match(/<Contents>[\s\S]*?<\/Contents>/g) || []).map((b) => ({ sleutel: /<Key>([^<]*)<\/Key>/.exec(b)?.[1] || '', grootte: Number(/<Size>(\d+)<\/Size>/.exec(b)?.[1] || 0), gewijzigd: /<LastModified>([^<]*)</.exec(b)?.[1] || '' }));
  return { ok: true, waarde: { objecten, afgekapt: /<IsTruncated>true<\/IsTruncated>/.test(tekst) } };
}
