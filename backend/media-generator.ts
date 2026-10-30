// «Створювати зображення» — de adapter naar de LOKALE generator van de eigenaar (regels en teksten: shared/media-generator.ts).
//
// Wat hier gebeurt, en wat nooit:
//   • de instelling (adres, soort, model, grenzen) staat in app.ai_media_generator (migratie 0099); alleen de EIGENAAR zet haar,
//     met een verse passkey (backend/dev-rechten-routes.ts). Een AI kan het adres NOOIT kiezen of veranderen: zij geeft alleen
//     een beschrijving van het beeld;
//   • elk verzoek: het adres opnieuw controleren, de naam opzoeken in DNS, ELK antwoord toetsen (loopback / privénetwerk), en dan
//     verbinden met PRECIES dat gecontroleerde IP (geen tweede DNS-opzoeking door de HTTP-laag: geen DNS-rebinding). Geen
//     omleidingen volgen. Harde grenzen op tijd en grootte;
//   • het resultaat moet echt een PNG/JPEG/WebP zijn (eerste bytes), hoogstens 6 MB, en gaat naar de HMARA van de mens die de AI
//     gebruikt (backend/cloud-platform.ts → cloudAiBestandOpslaan) — niet naar een externe opslag;
//   • een opdracht loopt op de achtergrond door: de aanroep van de AI wacht ~45 s en geeft anders een `job_id` terug waarmee zij
//     het resultaat later ophaalt (Cloudflare breekt een HTTP-verzoek na 100 s af).
import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import {
  GENERATOR_SOORT_TEKST, STANDAARD_GENERATOR, adresToegestaan, beeldSoort, leesGeneratorUrl,
  type GeneratorInstelling, type GeneratorSoort,
} from '../shared/media-generator';

const sys = () => getPool('systeem');
export const MAX_BEELD_BYTES = 6 * 1024 * 1024;
const MAX_ANTWOORD_BYTES = 24 * 1024 * 1024;

export class GeneratorFout extends Error { constructor(public code: string, public detail = '') { super(code); } }

// ------------------------------------------------------------------------------------------------ instelling (0099)
type Rij = { aan: boolean; url: string; soort: string; model: string; timeout_s: number; max_zijde: number; stappen: number; bijgewerkt_door: string; bijgewerkt_op: Date | string };
export async function leesGeneratorInstelling(): Promise<GeneratorInstelling & { bijgewerktOp: number; bijgewerktDoor: string }> {
  try {
    const { rows } = await sys().query('SELECT * FROM app.ai_media_generator WHERE id = 1');
    const r = rows[0] as Rij | undefined;
    if (!r) return { ...STANDAARD_GENERATOR, bijgewerktOp: 0, bijgewerktDoor: '' };
    return { aan: r.aan, url: r.url, soort: r.soort === 'openai' ? 'openai' : 'a1111', model: r.model, timeoutS: r.timeout_s, maxZijde: r.max_zijde, stappen: r.stappen, bijgewerktOp: new Date(r.bijgewerkt_op).getTime(), bijgewerktDoor: r.bijgewerkt_door };
  } catch { return { ...STANDAARD_GENERATOR, bijgewerktOp: 0, bijgewerktDoor: '' }; }
}
export async function zetGeneratorInstelling(i: GeneratorInstelling, door: string): Promise<void> {
  await sys().query(`INSERT INTO app.ai_media_generator (id, aan, url, soort, model, timeout_s, max_zijde, stappen, bijgewerkt_door, bijgewerkt_op)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (id) DO UPDATE SET aan = EXCLUDED.aan, url = EXCLUDED.url, soort = EXCLUDED.soort, model = EXCLUDED.model, timeout_s = EXCLUDED.timeout_s,
      max_zijde = EXCLUDED.max_zijde, stappen = EXCLUDED.stappen, bijgewerkt_door = EXCLUDED.bijgewerkt_door, bijgewerkt_op = now()`,
  [i.aan, i.url, i.soort, i.model, i.timeoutS, i.maxZijde, i.stappen, door.slice(0, 120)]);
}

// ------------------------------------------------------------------------------------------------ bewaakte verbinding
type Opzoeker = (host: string) => Promise<Array<{ address: string; family: number }>>;
let opzoeker: Opzoeker = (host) => dnsLookup(host, { all: true, verbatim: true });
/** Alleen voor tests: een nagebootste DNS (bv. «kwaad.test» → 169.254.169.254). */
export const zetGeneratorOpzoeker = (f: Opzoeker | null) => { opzoeker = f ?? ((host) => dnsLookup(host, { all: true, verbatim: true })); };

/** Het gecontroleerde doel: elk adres van de naam moet toegestaan zijn; daarna verbinden we met het eerste. */
export async function doelVan(url: string): Promise<{ protocol: 'http:' | 'https:'; host: string; ip: string; family: 4 | 6; poort: number; pad: string }> {
  const o = leesGeneratorUrl(url);
  if (!o.ok) throw new GeneratorFout(o.code);
  if (o.isIp) return { protocol: o.protocol, host: o.host, ip: o.host, family: o.host.includes(':') ? 6 : 4, poort: o.poort, pad: o.pad };
  let adressen: Array<{ address: string; family: number }>;
  try { adressen = await opzoeker(o.host); } catch { throw new GeneratorFout('MEDIA_GENERATOR_DNS'); }
  if (!adressen.length) throw new GeneratorFout('MEDIA_GENERATOR_DNS');
  // ALLE antwoorden toetsen: één publiek of link-local adres tussen de lokale = weigeren (anders kiest de HTTP-laag misschien dat).
  if (adressen.some((a) => !adresToegestaan(a.address))) throw new GeneratorFout('MEDIA_GENERATOR_ADRES_VERBODEN');
  return { protocol: o.protocol, host: o.host, ip: adressen[0].address, family: adressen[0].family === 6 ? 6 : 4, poort: o.poort, pad: o.pad };
}

/** Eén HTTP-verzoek naar de generator: vast pad, vast IP, geen omleidingen, harde grenzen. */
export async function generatorVerzoek(url: string, pad: string, opties: { methode: 'GET' | 'POST'; body?: unknown; timeoutMs: number; maxBytes?: number }): Promise<{ status: number; type: string; bytes: Buffer }> {
  const doel = await doelVan(url);
  const lijf = opties.body === undefined ? undefined : Buffer.from(JSON.stringify(opties.body), 'utf8');
  const mod = doel.protocol === 'https:' ? https : http;
  const max = opties.maxBytes ?? MAX_ANTWOORD_BYTES;
  return await new Promise((ja, nee) => {
    const req = mod.request({
      host: doel.host, port: doel.poort, path: `${doel.pad}${pad}`, method: opties.methode, family: doel.family,
      // DNS-vastpinnen: de HTTP-laag krijgt het gecontroleerde IP, nooit een nieuwe opzoeking.
      lookup: ((_h: string, o: { all?: boolean }, cb: (e: Error | null, a: string | Array<{ address: string; family: number }>, f?: number) => void) => (o && o.all ? cb(null, [{ address: doel.ip, family: doel.family }]) : cb(null, doel.ip, doel.family))) as never,
      headers: { 'User-Agent': 'mijn-ruimte-media', Accept: 'application/json', ...(lijf ? { 'Content-Type': 'application/json', 'Content-Length': String(lijf.length) } : {}) },
      timeout: opties.timeoutMs,
      ...(doel.protocol === 'https:' ? { servername: doel.host } : {}),
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400) { res.resume(); nee(new GeneratorFout('MEDIA_GENERATOR_OMLEIDING')); return; }
      const delen: Buffer[] = []; let n = 0;
      res.on('data', (d: Buffer) => { n += d.length; if (n > max) { req.destroy(new GeneratorFout('MEDIA_GENERATOR_TE_GROOT')); return; } delen.push(d); });
      res.on('end', () => ja({ status, type: String(res.headers['content-type'] || ''), bytes: Buffer.concat(delen) }));
      res.on('error', (e) => nee(e instanceof GeneratorFout ? e : new GeneratorFout('MEDIA_GENERATOR_ONBEREIKBAAR')));
    });
    req.on('timeout', () => req.destroy(new GeneratorFout('MEDIA_GENERATOR_TIJD')));
    req.on('error', (e) => nee(e instanceof GeneratorFout ? e : new GeneratorFout('MEDIA_GENERATOR_ONBEREIKBAAR', String((e as { code?: string }).code || '').slice(0, 30))));
    if (lijf) req.write(lijf);
    req.end();
  });
}

// ------------------------------------------------------------------------------------------------ genereren
export type BeeldVraag = { prompt: string; negative?: string; width: number; height: number; seed?: number; steps?: number };
export type Beeld = { bytes: Buffer; mime: 'image/png' | 'image/jpeg' | 'image/webp'; seed: number | null; model: string };

/** Wat de AI vraagt → binnen de grenzen van de instelling (veelvouden van 64, niet groter dan maxZijde). */
export function beeldVraag(a: Record<string, unknown>, i: GeneratorInstelling): { ok: true; vraag: BeeldVraag } | { ok: false; fout: string } {
  const prompt = typeof a.prompt === 'string' ? a.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 2000) return { ok: false, fout: 'Invalid "prompt": 3-2000 characters describing the image.' };
  if (a.negative_prompt !== undefined && (typeof a.negative_prompt !== 'string' || a.negative_prompt.length > 1000)) return { ok: false, fout: 'Invalid "negative_prompt": at most 1000 characters.' };
  const zijde = (v: unknown, std: number) => { const n = Number(v ?? std); return Number.isFinite(n) ? Math.max(256, Math.min(i.maxZijde, Math.round(n / 64) * 64)) : std; };
  const std = Math.min(1024, i.maxZijde);
  const width = zijde(a.width, std), height = zijde(a.height, std);
  if (a.seed !== undefined && !(Number.isInteger(a.seed) && (a.seed as number) >= 0 && (a.seed as number) <= 4_294_967_295)) return { ok: false, fout: 'Invalid "seed": a whole number 0-4294967295.' };
  const steps = a.steps === undefined ? i.stappen : Math.max(1, Math.min(150, Math.floor(Number(a.steps) || i.stappen)));
  return { ok: true, vraag: { prompt, negative: typeof a.negative_prompt === 'string' ? a.negative_prompt : '', width, height, seed: a.seed as number | undefined, steps } };
}

const b64 = (s: unknown): Buffer | null => {
  if (typeof s !== 'string') return null;
  const kaal = s.replace(/^data:image\/[a-z]+;base64,/, '');
  return /^[A-Za-z0-9+/\s]+={0,2}$/.test(kaal.slice(0, 4096)) ? Buffer.from(kaal, 'base64') : null;
};
const jsonVan = (b: Buffer): any => { try { return JSON.parse(b.toString('utf8')); } catch { return null; } };

/** Eén beeld bij de lokale generator. Gooit GeneratorFout met een code uit GENERATOR_CODES. */
export async function genereer(i: GeneratorInstelling, v: BeeldVraag): Promise<Beeld> {
  if (!i.url) throw new GeneratorFout('MEDIA_GENERATOR_NIET_INGESTELD');
  if (!i.aan) throw new GeneratorFout('MEDIA_GENERATOR_UIT');
  const timeoutMs = Math.max(10, Math.min(900, i.timeoutS)) * 1000;
  let res: { status: number; type: string; bytes: Buffer };
  if (i.soort === 'a1111') {
    res = await generatorVerzoek(i.url, GENERATOR_SOORT_TEKST.a1111.pad, { methode: 'POST', timeoutMs, body: {
      prompt: v.prompt, negative_prompt: v.negative || '', width: v.width, height: v.height, steps: v.steps ?? i.stappen, seed: v.seed ?? -1, n_iter: 1, batch_size: 1,
      ...(i.model ? { override_settings: { sd_model_checkpoint: i.model }, override_settings_restore_afterwards: true } : {}),
    } });
  } else {
    res = await generatorVerzoek(i.url, GENERATOR_SOORT_TEKST.openai.pad, { methode: 'POST', timeoutMs, body: {
      prompt: v.negative ? `${v.prompt}\nAvoid: ${v.negative}` : v.prompt, n: 1, size: `${v.width}x${v.height}`, response_format: 'b64_json', ...(i.model ? { model: i.model } : {}),
    } });
  }
  if (res.status < 200 || res.status >= 300) throw new GeneratorFout('MEDIA_GENERATOR_FOUT', `HTTP ${res.status}`);
  const data = jsonVan(res.bytes);
  const ruw = i.soort === 'a1111' ? b64(data?.images?.[0]) : b64(data?.data?.[0]?.b64_json);
  if (!ruw || !ruw.length) throw new GeneratorFout('MEDIA_GENERATOR_ANTWOORD');
  if (ruw.length > MAX_BEELD_BYTES) throw new GeneratorFout('MEDIA_GENERATOR_TE_GROOT');
  const mime = beeldSoort(ruw);
  if (!mime) throw new GeneratorFout('MEDIA_GENERATOR_ANTWOORD');
  let seed: number | null = null;
  if (i.soort === 'a1111') { const info = typeof data?.info === 'string' ? jsonVan(Buffer.from(data.info)) : data?.info; seed = Number.isFinite(Number(info?.seed)) ? Number(info.seed) : null; }
  return { bytes: ruw, mime, seed, model: i.model };
}

/** «Перевірити» in het instellingenscherm: een lees-verzoek op het vaste pad van de soort (geen beeld, geen prompt). */
export async function controleerGenerator(i: Pick<GeneratorInstelling, 'url' | 'soort'>): Promise<{ ok: true; code: 'MEDIA_GENERATOR_OK'; modellen: string[] } | { ok: false; code: string; detail: string }> {
  const pad: Record<GeneratorSoort, string> = { a1111: '/sdapi/v1/sd-models', openai: '/v1/models' };
  try {
    const r = await generatorVerzoek(i.url, pad[i.soort], { methode: 'GET', timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 });
    if (r.status < 200 || r.status >= 300) return { ok: false, code: 'MEDIA_GENERATOR_FOUT', detail: `HTTP ${r.status}` };
    const d = jsonVan(r.bytes);
    const lijst = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    const modellen = lijst.slice(0, 20).map((m: any) => String(m?.model_name || m?.title || m?.id || '').slice(0, 120)).filter(Boolean);
    return { ok: true, code: 'MEDIA_GENERATOR_OK', modellen };
  } catch (e) { return { ok: false, code: e instanceof GeneratorFout ? e.code : 'MEDIA_GENERATOR_ONBEREIKBAAR', detail: e instanceof GeneratorFout ? e.detail : '' }; }
}

// ------------------------------------------------------------------------------------------------ opdrachten op de achtergrond
export type Opdracht = { id: string; userId: string; status: 'bezig' | 'klaar' | 'fout'; gestart: number; klaar?: number; resultaat?: Record<string, unknown>; fout?: string; detail?: string };
const OPDRACHTEN = new Map<string, Opdracht>();
const MAX_PER_MENS = 2, MAX_TOTAAL = 4, BEWAAR_MS = 60 * 60 * 1000;
const opruimen = () => { const nu = Date.now(); for (const [k, o] of OPDRACHTEN) if (o.status !== 'bezig' && nu - (o.klaar ?? o.gestart) > BEWAAR_MS) OPDRACHTEN.delete(k); };
const zichtbaar = (o: Opdracht) => ({ job_id: o.id, status: o.status === 'bezig' ? 'running' : o.status === 'klaar' ? 'done' : 'failed', startedAt: new Date(o.gestart).toISOString(), ...(o.resultaat ? { result: o.resultaat } : {}), ...(o.fout ? { error: o.fout, detail: o.detail || undefined } : {}) });

/**
 * Start een opdracht (genereren + bewaren via `bewaar`) en wacht hoogstens `wachtMs`. Daarna loopt zij door; het antwoord is dan
 * «running» met een job_id. Grenzen: 2 tegelijk per mens, 4 tegelijk op de server.
 */
export async function startOpdracht(userId: string, werk: () => Promise<Record<string, unknown>>, wachtMs = 45_000): Promise<ReturnType<typeof zichtbaar> | { error: string }> {
  opruimen();
  const bezig = [...OPDRACHTEN.values()].filter((o) => o.status === 'bezig');
  if (bezig.filter((o) => o.userId === userId).length >= MAX_PER_MENS || bezig.length >= MAX_TOTAAL) return { error: 'MEDIA_GENERATOR_DRUK' };
  const o: Opdracht = { id: randomUUID(), userId, status: 'bezig', gestart: Date.now() };
  OPDRACHTEN.set(o.id, o);
  const klaar = werk().then((r) => { o.status = 'klaar'; o.resultaat = r; o.klaar = Date.now(); }, (e) => { o.status = 'fout'; o.fout = e instanceof GeneratorFout ? e.code : 'MEDIA_GENERATOR_FOUT'; o.detail = e instanceof GeneratorFout ? e.detail : String((e as Error)?.message || '').slice(0, 80); o.klaar = Date.now(); });
  await Promise.race([klaar, new Promise((r) => setTimeout(r, wachtMs))]);
  return zichtbaar(o);
}
/** De stand van een opdracht van DEZE mens (een ander id → onbekend; nooit de opdracht van een ander). */
export function opdrachtStand(userId: string, id: string): ReturnType<typeof zichtbaar> | { error: string } {
  const o = OPDRACHTEN.get(id);
  return o && o.userId === userId ? zichtbaar(o) : { error: 'MEDIA_OPDRACHT_ONBEKEND' };
}
