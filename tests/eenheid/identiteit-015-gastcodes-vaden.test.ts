// IDENTITEIT-015 (лінія e2, gastcodes): модульні перевірки двох вад, знайдених приймальним e2e gast-toegang / gastcodes.
//  1. Потік /api/owner/stroom: server/start.ts обслуговує його лише поза mcp.*; клієнт на mcp.* відкривав EventSource → 404 щоразу.
//     Тепер stroomOpHost('mcp.…') = false і abonneer() на mcp не створює EventSource (працює повільне опитування).
//  2. Прапорці: сторінка гостя /toegang без відомої сесії питала POST /api/flags → 401 у кожного гостя. Тепер geenSessieVerwacht.
// Twee gebreken uit de acceptatie-e2e: geen stroom op mcp.*, geen vlaggen op de gastpagina zonder bekende sessie.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-gastcodes-vaden');

  // ---------------------------------------------------------------- 1. stroom op mcp.*
  const start = readFileSync('server/start.ts', 'utf8');
  check('сервер: потік /api/owner/stroom свідомо не обслуговується на mcp.* (передумова)', /url\.pathname === '\/api\/owner\/stroom'[^\n]*host !== SERVICE_HOSTS\.mcp/.test(start));
  const { stroomOpHost, abonneer } = await import('../../src/apparaat-bevestiging/stroom');
  check('stroomOpHost: id/hub/mail/admin — так; mcp.* (будь-який регістр) — ні',
    stroomOpHost('id.tarasevych.com') && stroomOpHost('hub.tarasevych.com') && stroomOpHost('admin.tarasevych.com') && !stroomOpHost('mcp.tarasevych.com') && !stroomOpHost('MCP.tarasevych.com'));
  const g = globalThis as unknown as Record<string, unknown>;
  const vorig = { window: g.window, EventSource: g.EventSource, location: g.location };
  const geopend: string[] = [];
  class NepBron { onopen: unknown = null; onerror: unknown = null; constructor(public url: string) { geopend.push(url); } addEventListener() { /* niets */ } close() { /* niets */ } }
  try {
    g.window = { setTimeout: () => 0, clearTimeout: () => undefined };
    g.EventSource = NepBron;
    g.location = { hostname: 'mcp.tarasevych.com' };
    const af = abonneer({ service: 'mcp', tabContext: 'tab-mcp' }, () => undefined); af();
    check('mcp.*: abonneer() не відкриває EventSource (жодного 404), повертає функцію відписки', geopend.length === 0 && typeof af === 'function', geopend.join(','));
    g.location = { hostname: 'id.tarasevych.com' };
    const af2 = abonneer({ service: 'identity', tabContext: 'tab-id' }, () => undefined);
    check('id.*: abonneer() і далі відкриває потік /api/owner/stroom', geopend.length === 1 && geopend[0].startsWith('/api/owner/stroom?service=identity'), geopend.join(','));
    af2();
  } finally {
    for (const [k, v] of Object.entries(vorig)) { if (v === undefined) delete g[k]; else g[k] = v; }
  }

  // ---------------------------------------------------------------- 2. vlaggen op de gastpagina
  const { geenSessieVerwacht } = await import('../../src/vlaggen/sessie-verwacht');
  check('гість на /toegang без відомої сесії → прапорці не питати', geenSessieVerwacht('/toegang', undefined) && geenSessieVerwacht('/toegang/', undefined) && geenSessieVerwacht('/toegang', 'out'));
  check('власник на /toegang з відомою сесією → прапорці питати', !geenSessieVerwacht('/toegang', 'known'));
  check('інші сторінки: як раніше — не питати лише після виходу', !geenSessieVerwacht('/methods', undefined) && !geenSessieVerwacht('/', undefined) && geenSessieVerwacht('/methods', 'out') && !geenSessieVerwacht('/toegangscodes', undefined));
  const lezen = readFileSync('src/functievlag-lezen.ts', 'utf8');
  check('laadVlaggen використовує geenSessieVerwacht (а не лише «out»)', /gebruikerId === undefined && typeof window !== 'undefined' && geenSessieVerwacht\(location\.pathname, ecosystemSessionHint\(\)\)/.test(lezen));

  // ---------------------------------------------------------------- 2b. vlaggen wachten op de sessie-hint (bezoeker zonder sessie op /methods)
  const client = readFileSync('src/platform/client.ts', 'utf8');
  check('client: запит прапорців спершу чекає wachtOpSessieHint; «out» → локальна відмова 401 без мережі', /vlagVerzoek\(url\) && \(await \(await import\('\.\.\/tab-context'\)\)\.wachtOpSessieHint\(\)\) === 'out'\) \{\n\s*const weiger = \{ error: 'OWNER_SESSION_REQUIRED' \};\n\s*throw new ApiError\(401/.test(client)
    && client.indexOf('.wachtOpSessieHint()') < client.indexOf('if (vlag) return await vlagInBundel'));
  check('vlagVerzoek: /api/flags, OFREP (усі й один ключ)', client.includes("export const vlagVerzoek = (url: string): boolean => url === '/api/flags' || url === '/api/ofrep/v1/evaluate/flags' || VLAG_PAD.test(url);"));
  const tcBron = readFileSync('src/tab-context.ts', 'utf8');
  check('tab-context: wachtOpSessieHint — відома підказка без очікування, інакше до setEcosystemSessionLikely або до часу очікування',
    /export const wachtOpSessieHint=\(ms=4000\)[^\n]*if\(nu==='known'\|\|nu==='out'\)return Promise\.resolve\(nu\);[^\n]*setTimeout\(\(\)=>af\(ecosystemSessionHint\(\)\),ms\)/.test(tcBron)
    && /export const setEcosystemSessionLikely=[^\n]*for\(const af of \[\.\.\.sessieWachters\]\)af\(active\?'known':'out'\)/.test(tcBron));

  // ---------------------------------------------------------------- 3. e2e gast-toegang: bel zoekt de juiste melding
  const gt = readFileSync('tests/e2e/gast-toegang.e2e.ts', 'utf8');
  check('e2e gast-toegang: рядок дзвіночка шукається саме за «використано вперше» (а не першим рядком із назвою коду)', /\.cnc-row', \{ hasText: \/«Для Олени» використано вперше\/ \}/.test(gt));

  // ---------------------------------------------------------------- 4. terugkeer van Google: geen tech-ruimtes-v2-verzoek (401 OWNER_TAB_SIGNED_OUT)
  const { markeerOauthTerug, oauthTerugBezig } = await import('../../src/google-terug-markering');
  const w = globalThis as unknown as Record<string, unknown>;
  const vorigWindow = w.window;
  try {
    w.window = {};
    const voor = oauthTerugBezig();
    markeerOauthTerug();
    check('позначка повернення з Google: без неї — false, після markeerOauthTerug — true', voor === false && oauthTerugBezig() === true);
  } finally { if (vorigWindow === undefined) delete w.window; else w.window = vorigWindow; }
  const app = readFileSync('src/App.tsx', 'utf8'), rv = readFileSync('src/tech/ruimtes/ruimtes-vlag.ts', 'utf8');
  check('App: сторінка повернення з Google ставить позначку до рендеру', /const customCallback=googleReturn;if\(customCallback\)markeerOauthTerug\(\);/.test(app));
  check('tech-ruimtes-v2: під час повернення з Google запит не надсилається (і результат не запам’ятовується)', /if \(oauthTerugBezig\(\)\) return Promise\.resolve\(waarde === true\);\n  bezig = api\.post/.test(rv));
  // ---------------------------------------------------------------- 5. uitleg in de doos zonder binnenmarge
  const css = readFileSync('src/toegangslaag.css', 'utf8');
  check('стилі: пояснення й кнопки прямо в .access-plane-box мають відступ (як рядок)', /\.access-plane-box>\.access-plane-hint-line,\.access-plane-box>\.access-plane-actions\{margin:0;padding:12px 15px\}/.test(css));
  return einde();
}
