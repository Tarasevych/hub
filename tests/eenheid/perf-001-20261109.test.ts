// PERF-001 (09.11.2026): sneller laden zonder functieverlies.
//  - client: gelijktijdige identieke LEES-verzoeken → één netwerkverzoek (eigen kopie per aanroeper; signaal stopt alleen eigen wachten);
//    schrijvende acties nooit samengevoegd; losse OFREP-vlagverzoeken → één POST /api/flags met hetzelfde antwoord per vlag.
//  - server: statische tekstbestanden brotli/gzip (server/platform/statisch-comprimeren.ts) + koppen in server/start.ts.
//  - startbundel: zware onderdelen lui geladen (opstelvenster/ProseMirror, GitHub/API, agenda, notities, recent, afstemming).
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { checker } from './hulp/nep-google';

type Oproep = { url: string; method: string; body: unknown };

export async function main(): Promise<number> {
  const { check, einde } = checker('perf-001-20261109');

  // ------------------------------------------------------------------ nep-browser + nep-fetch
  const g = globalThis as unknown as Record<string, unknown>;
  const oproepen: Oproep[] = [];
  let antwoord: (o: Oproep) => { status: number; body: unknown; vertraging?: number } = () => ({ status: 200, body: { ok: true } });
  g.window = globalThis;
  g.CustomEvent ??= class extends Event { detail: unknown; constructor(t: string, i?: { detail?: unknown }) { super(t); this.detail = i?.detail; } };
  g.fetch = async (url: string, init: RequestInit) => {
    const o: Oproep = { url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined };
    oproepen.push(o);
    const a = antwoord(o);
    await new Promise((r) => setTimeout(r, a.vertraging ?? 15));
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } });
  };
  const { api, magSamenvoegen, ApiError } = await import('../../src/platform/client');
  const tel = (deel: string) => oproepen.filter((o) => o.url.includes(deel)).length;
  const leeg = () => { oproepen.length = 0; };

  // ------------------------------------------------------------------ 1. samenvoegen van lezen
  antwoord = () => ({ status: 200, body: { lijst: [{ id: 1, naam: 'a' }] } });
  const ctx = { service: 'identity', tabContext: 't1', sourceOrigin: 'https://id.tarasevych.com' };
  const drie = await Promise.all([1, 2, 3].map(() => api.post('/api/owner/access/passkeys/lijst', ctx)));
  check('lezen: 3 gelijktijdige identieke verzoeken → 1 netwerkverzoek', tel('passkeys/lijst') === 1);
  check('lezen: elke aanroeper krijgt dezelfde inhoud', drie.every((r) => JSON.stringify(r.data) === JSON.stringify({ lijst: [{ id: 1, naam: 'a' }] })));
  check('lezen: elke aanroeper krijgt een EIGEN kopie (wijzigen raakt de andere niet)', drie[0].data !== drie[1].data && drie[0].data.lijst !== drie[2].data.lijst);
  drie[0].data.lijst[0].naam = 'gewijzigd';
  check('lezen: kopie echt los', drie[1].data.lijst[0].naam === 'a');
  leeg();
  await api.post('/api/owner/access/passkeys/lijst', ctx); await api.post('/api/owner/access/passkeys/lijst', ctx);
  check('lezen: na elkaar → telkens vers (niets bewaard)', tel('passkeys/lijst') === 2);
  leeg();
  await Promise.all([api.post('/api/owner/access/passkeys/lijst', ctx), api.post('/api/owner/access/passkeys/lijst', { ...ctx, tabContext: 't2' })]);
  check('lezen: ander lichaam → apart verzoek', tel('passkeys/lijst') === 2);
  leeg();
  await Promise.all([1, 2, 3].map(() => api.post('/api/owner/sleutelkluis/stand', ctx)));
  check('lezen: sleutelkluis/stand (zuiver lezen) samengevoegd', tel('sleutelkluis/stand') === 1);

  // ------------------------------------------------------------------ 2. nooit schrijven samenvoegen
  leeg();
  await Promise.all([1, 2].map(() => api.post('/api/owner/access/notities/opslaan', { ...ctx, tekst: 'x' })));
  check('schrijven: 2 gelijktijdige identieke opslaan-verzoeken → 2 netwerkverzoeken', tel('notities/opslaan') === 2);
  check('schrijven: beheer/flags/stand (schrijft!) nooit samengevoegd', !magSamenvoegen('POST', '/api/beheer/flags/stand', false));
  check('schrijven: sessieroutes nooit samengevoegd', !magSamenvoegen('POST', '/api/owner/session/accounts', false));
  check('schrijven: PUT/PATCH/DELETE nooit samengevoegd', !magSamenvoegen('PUT', '/api/owner/x/lijst', false) && !magSamenvoegen('DELETE', '/api/owner/x/lijst', false));
  check('herhaling na step-up nooit samengevoegd', !magSamenvoegen('POST', '/api/owner/access/passkeys/lijst', true));
  check('leesroutes: lijst/laden/overzicht/status herkend', ['/api/owner/hub/werkblad/laden', '/api/owner/access/recovery/overzicht', '/api/owner/tech/status', '/api/workspace/load'].every((p) => magSamenvoegen('POST', p, false)));

  // ------------------------------------------------------------------ 3. eigen signaal
  leeg();
  const ac = new AbortController();
  const a1 = api.post('/api/owner/access/toegangscodes/lijst', ctx, { signal: ac.signal });
  const a2 = api.post('/api/owner/access/toegangscodes/lijst', ctx);
  ac.abort();
  const [r1, r2] = await Promise.allSettled([a1, a2]);
  check('signaal: afgebroken aanroeper krijgt ABORTED', r1.status === 'rejected' && (r1.reason as Error).message === 'ABORTED');
  check('signaal: de andere wachtende krijgt gewoon het antwoord', r2.status === 'fulfilled');
  check('signaal: één netwerkverzoek', tel('toegangscodes/lijst') === 1);

  // ------------------------------------------------------------------ 4. fouten gedeeld, maar niet bewaard
  leeg();
  antwoord = () => ({ status: 500, body: { error: 'KAPOT' } });
  const fout = await Promise.allSettled([1, 2].map(() => api.post('/api/owner/agents/activity', ctx)));
  check('fout: beide aanroepers krijgen de fout (ApiError 500)', fout.every((f) => f.status === 'rejected' && (f.reason as InstanceType<typeof ApiError>).status === 500));
  antwoord = () => ({ status: 200, body: { ok: 1 } });
  const daarna = await api.post('/api/owner/agents/activity', ctx);
  check('fout: volgende verzoek gaat weer naar de server', daarna.data.ok === 1 && tel('agents/activity') === 2);

  // ------------------------------------------------------------------ 5. vlaggen bundelen
  leeg();
  const vlagBody = { service: 'hub', tabContext: 't1' };
  antwoord = (o) => o.url === '/api/flags'
    ? { status: 200, body: { vlaggen: [
      { key: 'meldingen-v2', value: true, variant: 'aan', reason: 'STATIC', metadata: {} },
      { key: 'foto-dienst', value: false, variant: 'uit', reason: 'DISABLED' },
      { key: 'bestaat-niet', value: false, variant: 'uit', reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND' },
    ] } }
    : { status: 200, body: { key: 'los', value: true } };
  const vl = await Promise.allSettled(['meldingen-v2', 'foto-dienst', 'bestaat-niet', 'meldingen-v2'].map((k) => api.post(`/api/ofrep/v1/evaluate/flags/${k}`, vlagBody)));
  check('vlaggen: 4 aanvragen → 1 netwerkverzoek /api/flags', oproepen.length === 1 && oproepen[0].url === '/api/flags');
  check('vlaggen: bundel vraagt precies de unieke sleutels met hetzelfde lichaam', JSON.stringify((oproepen[0].body as { sleutels: string[] }).sleutels) === JSON.stringify(['meldingen-v2', 'foto-dienst', 'bestaat-niet']) && (oproepen[0].body as { service: string }).service === 'hub');
  const v0 = vl[0].status === 'fulfilled' ? vl[0].value.data : null;
  check('vlaggen: OFREP-vorm zoals het losse verzoek', !!v0 && v0.key === 'meldingen-v2' && v0.value === true && v0.variant === 'aan' && v0.reason === 'STATIC' && typeof v0.metadata === 'object');
  check('vlaggen: uit blijft uit', vl[1].status === 'fulfilled' && vl[1].value.data.value === false && JSON.stringify(vl[1].value.data.metadata) === '{}');
  check('vlaggen: onbekende vlag → 404 met errorCode zoals de losse route', vl[2].status === 'rejected' && (vl[2].reason as InstanceType<typeof ApiError>).status === 404 && (vl[2].reason as InstanceType<typeof ApiError>).response.data.errorCode === 'FLAG_NOT_FOUND');
  check('vlaggen: dubbele aanvraag krijgt ook antwoord', vl[3].status === 'fulfilled' && vl[3].value.data.value === true);
  leeg();
  antwoord = () => ({ status: 200, body: { key: 'x', value: true, variant: 'aan', reason: 'STATIC', metadata: {} } });
  await Promise.all([1, 2, 3].map(() => api.post('/api/ofrep/v1/evaluate/flags/aanmeldmethoden-vnext', vlagBody)));
  check('vlaggen: dezelfde vlag 3× tegelijk → 1 los verzoek', oproepen.length === 1 && oproepen[0].url.endsWith('/aanmeldmethoden-vnext'));
  leeg();
  antwoord = (o) => o.url === '/api/flags' ? { status: 500, body: { error: 'VLAG_SERVERFOUT' } } : { status: 200, body: { key: o.url.split('/').pop(), value: true } };
  const terug = await Promise.all(['a-een', 'b-twee'].map((k) => api.post(`/api/ofrep/v1/evaluate/flags/${k}`, vlagBody)));
  check('vlaggen: bundel faalt → elke vlag los (terugval)', tel('/api/flags') === 1 && tel('/flags/a-een') === 1 && tel('/flags/b-twee') === 1 && terug.every((r) => r.data.value === true));
  leeg();
  antwoord = (o) => o.url === '/api/flags' ? { status: 401, body: { error: 'SESSION_REQUIRED' } } : { status: 200, body: {} };
  const geweigerd = await Promise.allSettled(['a-een', 'b-twee'].map((k) => api.post(`/api/ofrep/v1/evaluate/flags/${k}`, vlagBody)));
  check('vlaggen: 401 op de bundel → direct doorgegeven, geen extra verzoeken', geweigerd.every((r) => r.status === 'rejected') && oproepen.length === 1);

  // ------------------------------------------------------------------ 6. compressie
  const { kiesCodering, gecomprimeerd, compressieCacheLegen, MIN_BYTES } = await import('../../server/platform/statisch-comprimeren');
  check('codering: br heeft voorrang', kiesCodering('gzip, deflate, br, zstd') === 'br');
  check('codering: alleen gzip', kiesCodering('gzip, deflate') === 'gzip');
  check('codering: br;q=0 → gzip', kiesCodering('br;q=0, gzip') === 'gzip');
  check('codering: niets / identity → geen', kiesCodering(undefined) === null && kiesCodering('identity') === null);
  const map = mkdtempSync(join(tmpdir(), 'perf001-'));
  try {
    const js = join(map, 'a.js'); const tekst = 'export const x = "' + 'Мій простір '.repeat(4000) + '";\n';
    writeFileSync(js, tekst);
    compressieCacheLegen();
    const br = await gecomprimeerd(js, '.js', Buffer.byteLength(tekst), 'v1', 'br');
    check('compressie: brotli kleiner en terug te lezen', !!br && br.length < Buffer.byteLength(tekst) / 4 && brotliDecompressSync(br!).toString() === tekst);
    const gz = await gecomprimeerd(js, '.js', Buffer.byteLength(tekst), 'v1', 'gzip');
    check('compressie: gzip terug te lezen', !!gz && gunzipSync(gz!).toString() === tekst);
    const nogmaals = await gecomprimeerd(js, '.js', Buffer.byteLength(tekst), 'v1', 'br');
    check('compressie: tweede keer uit het geheugen (zelfde buffer)', nogmaals === br);
    const klein = join(map, 'k.js'); writeFileSync(klein, 'x');
    check('compressie: kleiner dan MIN_BYTES → niet', (await gecomprimeerd(klein, '.js', 1, 'v1', 'br')) === null && MIN_BYTES === 1024);
    check('compressie: afbeeldingen niet', (await gecomprimeerd(js, '.png', Buffer.byteLength(tekst), 'v1', 'br')) === null);
  } finally { rmSync(map, { recursive: true, force: true }); }
  const start = readFileSync('server/start.ts', 'utf8');
  check('server: Vary: Accept-Encoding en eigen ETag per codering', /Vary = headers\.Vary \? `\$\{headers\.Vary\}, Accept-Encoding` : 'Accept-Encoding'/.test(start) && /-\$\{codering === 'br' \? 'br' : 'gz'\}"/.test(start) && /headers\['Content-Encoding'\] = codering/.test(start));

  // ------------------------------------------------------------------ 7. startbundel: lui geladen
  const app = readFileSync('src/App.tsx', 'utf8'), dienst = readFileSync('src/VerenigdDienstApp.tsx', 'utf8'), zwevend = readFileSync('src/MailOpstelZwevend.tsx', 'utf8');
  check('lui: agenda, notities, recent niet statisch in App.tsx', !/import Agenda from/.test(app) && !/import HubNotes from/.test(app) && !/import HubRecent from/.test(app) && /lazyZoek\(\(\)=>import\('\.\/agenda\/Agenda'\)\)/.test(app));
  check('lui: GitHub/API/afstemming niet statisch in VerenigdDienstApp', !/from '\.\/DienstWeergaven'/.test(dienst) && !/import AfstemmingWissel from/.test(dienst) && /lazy\(\(\)=>import\('\.\/AfstemmingWissel'\)\)/.test(dienst));
  check('lui: opstelvenster (ProseMirror) lui, maar wel direct gemonteerd met Suspense', /lazy\(\(\) => import\('\.\/MailNieuwBerichtDialoog'\)\)/.test(zwevend) && /<Suspense fallback=\{null\}><MailNewMessageDialog/.test(zwevend));
  return einde();
}
