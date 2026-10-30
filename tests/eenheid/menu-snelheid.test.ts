// Menu v2 fase B1: snelheid en concepten. Voorkeuren (risicovolle delen standaard UIT), veilige URL's voor vooruitladen,
// Speculation-Rules-bestand, service worker v10 (ingangsbestanden vooraf), API-teller + afbreken, SWR-cache (alleen geheugen,
// per account, afbreken stil), app start pas na activering bij prerender, concept-velden nooit op wachtwoord-/codevelden.
import { readFileSync, readdirSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { normaliseerSnelheid, standaardSnelheid } from '../../shared/menu-snelheid';
import { allesTerugzetten, normaliseerZijbalk, standaardZijbalk } from '../../shared/menu-model';

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-snelheid');
  // ---------------------------------------------------------------- voorkeuren
  const s = standaardSnelheid();
  check('standaard: balk, overgangen en vooruitladen aan; prerender en concepten UIT', s.voortgang && s.overgangen && s.vooruitladen && !s.prerender && !s.concepten);
  check('rommel → standaard', JSON.stringify(normaliseerSnelheid('x')) === JSON.stringify(s) && JSON.stringify(normaliseerSnelheid({ prerender: 'ja', concepten: 1 })) === JSON.stringify(s));
  const n = normaliseerSnelheid({ voortgang: false, prerender: true, concepten: true, extra: true });
  check('geldige booleans blijven, onbekende velden weg, idempotent', !n.voortgang && n.prerender && n.concepten && !('extra' in n) && JSON.stringify(normaliseerSnelheid(n)) === JSON.stringify(n));
  const z = normaliseerZijbalk({ snelheid: { concepten: true } });
  check('zijbalk: snelheid genormaliseerd, in standaard, «alles terugzetten» bewaart', z.snelheid.concepten && JSON.stringify(standaardZijbalk().snelheid) === JSON.stringify(s) && allesTerugzetten(z).snelheid.concepten && JSON.stringify(normaliseerZijbalk(z)) === JSON.stringify(z));

  // ---------------------------------------------------------------- vooruitladen: alleen eigen https-hosts, geen gevoelige parameters
  (globalThis as unknown as { location: URL }).location = new URL('https://hub.tarasevych.com/overview');
  const { vooruitUrl, dienstVanUrl } = await import('../../src/navigatie-urls');
  check('dienstVanUrl: host → onderdeel', dienstVanUrl('https://mail.tarasevych.com/inbox') === 'mail' && dienstVanUrl('https://id.tarasevych.com/menu') === 'identity' && dienstVanUrl('https://evil.example/') === '' && dienstVanUrl('https://tarasevych.com.evil.example/') === '');
  check('vooruitUrl: ander eigen onderdeel → URL zonder hash', vooruitUrl('https://mail.tarasevych.com/inbox?lang=uk#x') === 'https://mail.tarasevych.com/inbox?lang=uk');
  check('vooruitUrl: weigert eigen origin, vreemde hosts, http, inlog-/token-parameters en gebruikersnaam',
    ['https://hub.tarasevych.com/recent', 'https://evil.example/', 'http://mail.tarasevych.com/', 'https://id.tarasevych.com/?code=1&state=2', 'https://mail.tarasevych.com/?token=x', 'https://id.tarasevych.com/?consent=abc', 'https://u:p@mail.tarasevych.com/', 'javascript:alert(1)'].every((u) => vooruitUrl(u) === ''));

  // ---------------------------------------------------------------- Speculation Rules + server
  const regels = JSON.parse(readFileSync('public/speculatie.json', 'utf8'));
  const alle = [...(regels.prefetch || []), ...(regels.prerender || [])];
  check('speculatie.json: alleen document-regels op a[data-tsv-vooruit…], prerender alleen bij de waarde «prerender»', alle.length === 2 && alle.every((r: { source: string; where?: { selector_matches?: string } }) => r.source === 'document' && /^a\[data-tsv-vooruit/.test(String(r.where?.selector_matches))) && regels.prerender[0].where.selector_matches === "a[data-tsv-vooruit='prerender']" && !JSON.stringify(regels).includes('href_matches'));
  const start = readFileSync('server/start.ts', 'utf8');
  const html = /if \(ext === '\.html'\) \{([\s\S]*?)\n  \}/.exec(start)?.[1] || '';
  check('server: Speculation-Rules + credentialed-prerender alleen op HTML; regels als application/speculationrules+json', /Speculation-Rules'\] = '"\/speculatie\.json"'/.test(html) && /Supports-Loading-Mode'\] = 'credentialed-prerender'/.test(html) && /speculatie\.json'\) headers\['Content-Type'\] = 'application\/speculationrules\+json'/.test(start));
  check("CSP ongewijzigd: script-src 'self' 'wasm-unsafe-eval' (geen inline speculation rules nodig)", start.includes(`"script-src 'self' 'wasm-unsafe-eval'"`) && !start.includes('inline-speculation-rules'));

  // ---------------------------------------------------------------- service worker v10
  const sw = readFileSync('public/service-worker.js', 'utf8');
  const fn = /const entryAssets=(.*?);self\.addEventListener\('install'/.exec(sw)?.[1] || '';
  // eslint-disable-next-line no-new-func
  const entryAssets = new Function('ROOT', `return (${fn})`)('https://mail.tarasevych.com/') as (h: string) => string[];
  const voorbeeld = '<script type="module" crossorigin src="./assets/index-CLmK5GlK.js"></script><link rel="stylesheet" href="./assets/index-BuXY03g_.css"><script src="https://evil.example/assets/x-12345678.js"></script><link rel="modulepreload" href="/assets/vendor-AbCdEf12.js"><script src="./canonical-boot.js"></script>';
  const gevonden = entryAssets(voorbeeld);
  check("service worker: VERSION='v10' (oude caches worden opgeruimd)", sw.includes("VERSION='v10'") && sw.includes('!KEEP.includes(key)'));
  check('service worker: ingangsbestanden alleen eigen /assets/*.js|css', JSON.stringify(gevonden) === JSON.stringify(['https://mail.tarasevych.com/assets/index-CLmK5GlK.js', 'https://mail.tarasevych.com/assets/index-BuXY03g_.css', 'https://mail.tarasevych.com/assets/vendor-AbCdEf12.js']), JSON.stringify(gevonden));
  check('service worker: /api/ en inlog-URL’s blijven buiten de cache', sw.includes("url.pathname.startsWith('/api/')") && sw.includes('authRequest(url)'));

  // ---------------------------------------------------------------- API-teller, afbreken, SWR-cache
  const echteFetch = globalThis.fetch;
  let verzoeken = 0, vertraag = 0;
  globalThis.fetch = (async (_u: string, init: RequestInit = {}) => {
    verzoeken++;
    if (vertraag) await new Promise<void>((ok, fout) => { const t = setTimeout(ok, vertraag); init.signal?.addEventListener('abort', () => { clearTimeout(t); fout(new DOMException('weg', 'AbortError')); }); });
    return new Response(JSON.stringify({ n: verzoeken }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const { api, apiLopend, isAfgebroken } = await import('../../src/platform/client');
    const { swrPost, leesCacheAccount, leesBewaard, __leesCacheGrootte } = await import('../../src/lees-cache');
    vertraag = 30;
    const p = api.post('/api/owner/x', {});
    check('apiLopend telt lopende verzoeken', apiLopend() === 1);
    await p;
    check('apiLopend weer 0', apiLopend() === 0);
    const a = new AbortController();
    const q = api.post('/api/owner/x', {}, { signal: a.signal }); a.abort();
    let fout: unknown; try { await q; } catch (e) { fout = e; }
    check('afbreken: ApiError ABORTED (geen NETWORK_ERROR), teller terug naar 0', isAfgebroken(fout) && apiLopend() === 0, String((fout as Error)?.message));
    vertraag = 0;
    const zien: Array<[number, boolean]> = [];
    leesCacheAccount('');
    await swrPost<{ n: number }>('/api/owner/lijst', { a: 1 }, (d, v) => zien.push([d.n, v]));
    await swrPost<{ n: number }>('/api/owner/lijst', { a: 1 }, (d, v) => zien.push([d.n, v]));
    check('zonder account: niets bewaard (alleen vers)', zien.length === 2 && zien.every(([, v]) => v) && __leesCacheGrootte() === 0);
    zien.length = 0; leesCacheAccount('u1');
    await swrPost<{ n: number }>('/api/owner/lijst', { a: 1, tabContext: 't1' }, (d, v) => zien.push([d.n, v]));
    await swrPost<{ n: number }>('/api/owner/lijst', { a: 1, tabContext: 't2' }, (d, v) => zien.push([d.n, v]));
    check('met account: eerst bewaarde versie (ook in ander tabblad), dan vers', zien.length === 3 && zien[1][1] === false && zien[1][0] === zien[0][0] && zien[2][1] === true, JSON.stringify(zien));
    zien.length = 0;
    await swrPost<{ n: number }>('/api/owner/lijst', { a: 1 }, (d, v) => zien.push([d.n, v]), { alleenVers: true });
    check('alleenVers (na een schrijfactie): geen oude versie', zien.length === 1 && zien[0][1]);
    check('andere body = andere sleutel', leesBewaard('/api/owner/lijst', { a: 2 }) === undefined && leesBewaard('/api/owner/lijst', { a: 1 }) !== undefined);
    leesCacheAccount('u2');
    check('ander account: cache leeg', __leesCacheGrootte() === 0 && leesBewaard('/api/owner/lijst', { a: 1 }) === undefined);
    vertraag = 40; zien.length = 0;
    const b = new AbortController();
    const r = swrPost<{ n: number }>('/api/owner/lijst', { a: 1 }, (d, v) => zien.push([d.n, v]), { signal: b.signal }); b.abort();
    let fout2: unknown = null; try { await r; } catch (e) { fout2 = e; }
    check('afgebroken lezen (pagina weg): stil, geen data, geen fout', fout2 === null && zien.length === 0);
    let fout3 = ''; try { await swrPost('https://evil.example/x', {}, () => undefined); } catch (e) { fout3 = (e as Error).message; }
    check('SWR alleen voor /api/owner/…', fout3 === 'SWR_PAD_ONGELDIG');
  } finally { globalThis.fetch = echteFetch; }

  // ---------------------------------------------------------------- prerender: app start pas na activering
  const main = readFileSync('src/main.tsx', 'utf8');
  check('main.tsx: createRoot pas na activering (prerenderingchange)', /prerenderingchange/.test(main) && /naActivering\(\(\) => \{[\s\S]*createRoot\(document\.getElementById\('root'\)!\)\.render\(<App \/>\)[\s\S]*\}\);/.test(main) && (main.match(/createRoot\(/g) || []).length === 5);
  // Derde root = laag van het technisch profiel (13.10.2026): ook binnen naActivering, na de app.
  // Vierde root = melding «оновлення розширення» (audit 18.10.2026, punt 9): ook binnen naActivering, na de app.
  check('main.tsx: update-melding van de extensie start pas na activering en na de app', /naActivering\(\(\) => \{[\s\S]*render\(<App \/>\)[\s\S]*import\('\.\/ExtensieUpdateBand'\)[\s\S]*\}\);/.test(main));
  // Vijfde root = «Сайт оновлено» (18.10.2026, src/platform/nieuwe-versie.ts): ook binnen naActivering, na de app.
  check('main.tsx: melding «Сайт оновлено» start pas na activering en na de app', /naActivering\(\(\) => \{[\s\S]*render\(<App \/>\)[\s\S]*import\('\.\/platform\/NieuweVersieBand'\)[\s\S]*\}\);/.test(main));
  check('main.tsx: technische laag start pas na activering en na de app', /naActivering\(\(\) => \{[\s\S]*render\(<App \/>\)[\s\S]*import\('\.\/tech\/TechLaag'\)[\s\S]*\}\);/.test(main));

  // ---------------------------------------------------------------- concept-velden: nooit op wachtwoord/code/geheim
  const bestanden = readdirSync('src').filter((f) => f.endsWith('.tsx'));
  const plekken: string[] = []; const slecht: string[] = [];
  for (const f of bestanden) {
    const t = readFileSync(`src/${f}`, 'utf8');
    for (const m of t.matchAll(/<(textarea|input)\b([^>]*?)data-concept=["']([^"']+)["']([^>]*)>/g)) {
      plekken.push(`${f}:${m[3]}`);
      const attrs = m[2] + m[4];
      if (m[1] !== 'textarea' && /type=["'{]?(password|hidden|number)|one-time-code|autoComplete=["'](new|current)-password/.test(attrs)) slecht.push(`${f}:${m[3]}`);
      if (/wachtwoord|password|secret|token|code(?!s-notitie)|sleutel/i.test(m[3]) && m[3] !== 'toegangscode-notitie') slecht.push(`${f}:${m[3]}`);
    }
  }
  check('concepten: 5 gemarkeerde velden, geen enkel wachtwoord-/code-/geheimveld', plekken.length === 5 && slecht.length === 0, `${plekken.join(', ')} | ${slecht.join(', ')}`);
  const concept = readFileSync('src/concepten.ts', 'utf8');
  check('concepten: AES-GCM, niet-exporteerbare sleutel, account-gebonden AAD, 7 dagen, uit → alles wissen', /name: 'AES-GCM', length: 256 }, false,/.test(concept) && /additionalData/.test(concept) && /7 \* 24 \* 3600_000/.test(concept) && /alleConceptenWissen/.test(concept) && /deleteDatabase/.test(concept) && !/localStorage/.test(concept));
  return einde();
}
