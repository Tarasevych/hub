// Punt 16 van de eigenaarslijst (19.10.2026), vertaalpaneel van de mail. Klachten:
//   a. «немає альтернативних рушіїв перекладу (Google, Microsoft, інші) і зручної кнопки інтеграції»;
//   b. «переклад вставляє маркери “[Переклад → УКР]” замість чистого тексту»;
//   c. «немає режиму “оригінал і переклад поруч”»;
//   d. «є незрозуміла кнопка “ШІ”».
// Plus de harde regel van de eigenaar: «нічого не імітувати: якщо рушій не підключено — так і написати, не малювати
// фальшивого перекладу».
//
// Elke check reproduceert eerst het oude gedrag en bewijst dan dat het weg is. De kern van (b): in
// backend/ai-vertaling-routes.ts stond `deterministicTranslateText()`, die bij een leeg antwoord van het model
// `[Переклад → УКР] <origineel>` in de BRIEFTEKST zette — een namaakvertaling. Die functie is weg; een onvertaald fragment
// blijft het origineel en wordt geteld (`onvertaald`), en komt er niets terug dan volgt een eerlijke weigering.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  extractLayoutPreservingSegments, motorenMetStand, normaliseerVertaalWeergave, renderLayoutPreservingTranslation,
  VERTAAL_MOTOREN, VERTAAL_MOTOR_STAAT_TEKST, vertaalMotorVan, vertaaldDoorZin,
  type AiVertalingAgentInfo, type AiVertalingRunResponse,
} from '../../shared/ai-vertaling';
import { clearAiVertalingCache, executeAiVertalingRun, setAiVertalingDeps } from '../../backend/ai-vertaling-routes';
import { checker } from './hulp/nep-google';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const ORIGIN = 'https://mail.tarasevych.com';

function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/all`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', innerWidth: 1280, innerHeight: 800, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

const agent = (over: Partial<AiVertalingAgentInfo> = {}): AiVertalingAgentInfo => ({
  id: 'agent-prive-ok', name: 'Claude Приватний', platform: 'mcp-oauth', source: 'oauth', ruimte: 'prive',
  scopes: ['mail.read', 'files.read'], allowedMailRead: true, allowedFilesRead: true, statusUk: 'Активний (приватний простір)', ...over,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('vertaalpaneel-20261019');
  const balk = lees('src/mail/AiVertalingBalk.tsx');
  const balkCss = lees('src/mail/ai-vertaling-balk.css');
  const lichaam = lees('src/MailBerichtTekst.tsx');
  const lichaamCss = lees('src/mail-bericht-tekst.css');
  const draad = lees('src/MailGesprekInhoud.tsx');
  const routes = lees('backend/ai-vertaling-routes.ts');
  // Voor de «is het echt weg»-checks: alleen de CODE, zonder het commentaar dat juist uitlegt wat er wég is.
  const routesCode = routes.split('\n').filter((r) => !r.trim().startsWith('//') && !r.trim().startsWith('*')).join('\n');

  // ================================================================ a. каталог рушіїв з чесним станом
  {
    check('16a reproductie: er was geen enkele motorcatalogus — de balk kende alleen «ШІ-агент» en een taal',
      !/VERTAAL_MOTOREN/.test(lees('backend/mail-afzenders.ts')) && VERTAAL_MOTOREN.length >= 5);
    check('16a drie eerlijke standen en niets ertussen: «Працює зараз» / «Треба підключити» / «Ще немає»',
      VERTAAL_MOTOR_STAAT_TEKST.werkt[0] === 'Працює зараз' && VERTAAL_MOTOR_STAAT_TEKST.aansluiten[0] === 'Треба підключити' && VERTAAL_MOTOR_STAAT_TEKST['nog-niet'][0] === 'Ще немає'
      && VERTAAL_MOTOREN.every((m) => ['werkt', 'aansluiten', 'nog-niet'].includes(m.staat)));
    check('16a de catalogus noemt de gevraagde alternatieven (Google, Microsoft, DeepL) en een zelf gehoste (LibreTranslate)',
      ['google-vertaling', 'microsoft-vertaling', 'deepl', 'libretranslate', 'eigen-agent'].every((id) => VERTAAL_MOTOREN.some((m) => m.id === id)),
      VERTAAL_MOTOREN.map((m) => m.id).join(','));
    const zonder = motorenMetStand([]);
    const met = motorenMetStand([agent()]);
    check('16a zonder gekoppelde agent werkt NIETS: de eigen agent staat op «треба підключити», met agent op «працює»',
      zonder.find((m) => m.id === 'eigen-agent')?.staat === 'aansluiten' && met.find((m) => m.id === 'eigen-agent')?.staat === 'werkt');
    check('16a een agent zonder mail.read maakt de motor niet «werkt» (geen valse groene pastille)',
      motorenMetStand([agent({ allowedMailRead: false, scopes: ['files.read'] })]).find((m) => m.id === 'eigen-agent')?.staat === 'aansluiten');
    check('16a niets imiteren: een externe dienst zonder koppeling is en blijft «ще немає», en heeft GEEN knop',
      met.filter((m) => m.id !== 'eigen-agent').every((m) => m.staat === 'nog-niet' && m.aansluitenHref === '')
      && VERTAAL_MOTOREN.filter((m) => m.staat === 'nog-niet').every((m) => m.aansluitenHref === '')
      && zonder.filter((m) => m.staat === 'aansluiten').every((m) => m.aansluitenHref !== ''),
      met.map((m) => `${m.id}=${m.staat}${m.aansluitenHref ? '+knop' : ''}`).join(','));
    check('16a de knop «Підключити» wijst naar «Доступ ШІ», net als de andere integratiekaarten',
      met.find((m) => m.id === 'eigen-agent')?.aansluitenHref === '/ai' || zonder.find((m) => m.id === 'eigen-agent')?.aansluitenHref === '/ai');
    check('16a de SERVER bepaalt de stand (de balk kan «працює» niet zelf verzinnen): /state stuurt `motoren` mee',
      /motoren: motorenMetStand\(priveAgents\)/.test(routes));
    check('16a de balk toont de kaarten met pastille, uitleg en één knop; bij «ще немає» staat er expliciet dat er niets is',
      /data-testid="ai-vb-motoren"/.test(balk) && /data-motor-staat=\{motor\.staat\}/.test(balk)
      && /motor\.staat === 'aansluiten' && motor\.aansluitenHref \?/.test(balk) && balk.includes('Підключення ще не написано')
      && /\.ai-vb-motor-kaart\[data-motor-staat='werkt'\]/.test(balkCss));
  }

  // ================================================================ b. чистий переклад без маркерів
  {
    check('16b reproductie weg: deterministicTranslateText en de woordenlijstjes bestaan niet meer (geen code, alleen uitleg)',
      !/deterministicTranslateText|PHRASE_DICTIONARY_TO_/.test(routesCode) && !/function deterministicTranslateText/.test(routes));
    check('16b reproductie weg: geen enkele markering meer in de CODE van de server',
      !routesCode.includes('[Переклад') && !routesCode.includes('[Translated') && !routesCode.includes('[Vertaling')
      && !/return `\[\$\{taalLabelUk\(targetLang\)\}\]/.test(routes));
    check('16b de uitleg staat erbij, zodat niemand de namaakvertaling terugzet', /Punt 16 \(19\.10\.2026\): hier stond `deterministicTranslateText/.test(routes));
    check('16b de markering is nu een PLAAT boven de tekst, nooit in de brief', /vertaaldDoorZin/.test(lichaam) && /data-mail-vertaal-plaat/.test(lichaam)
      && vertaaldDoorZin('uk', 'en', 'Ваш приватний ШІ-агент', 'uk') === 'Перекладено з Англійська на Українська рушієм Ваш приватний ШІ-агент'
      && vertaaldDoorZin('nl', 'en', 'X') === 'Vertaald uit English door X');
    check('16b de plaat heeft «Показати оригінал» en wordt zelf nooit meevertaald (data-mail-translation-skip)',
      /Показати оригінал/.test(lichaam) && /data-mail-translation-skip='true' data-mail-vertaal-plaat/.test(lichaam));
    check('16b de motor die het maakte staat in het antwoord (voor de plaat)', /motorId: motor\.id/.test(routes) && /motorNaam: `\$\{motor\.naam\}/.test(routes) && vertaalMotorVan('eigen-agent').id === 'eigen-agent');

    // Echte uitvoering: het model vertaalt maar één van de twee fragmenten.
    const segState = extractLayoutPreservingSegments('<p>Hello team!</p><p>Please pay invoice 4821.</p>', 'seg');
    let llmCalls = 0;
    let leegAntwoord = false;
    setAiVertalingDeps({
      fetch: (async () => {
        llmCalls += 1;
        const translations = leegAntwoord ? {} : { 'seg:0': 'Привіт, командо!' };
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ detectedSourceLang: 'en', translations }) }] }), { status: 200 });
      }) as unknown as typeof fetch,
      getApiKey: async () => 'sk-test-vertaalpaneel',
      loadAgents: async () => [agent()],
      loadPolicyCeiling: async () => 'always',
      loadUserAiBlocked: async () => false,
    } as never);
    clearAiVertalingCache('user-16');
    const half = await executeAiVertalingRun({ userId: 'user-16', messageId: 'm-16a', mode: 'translate', targetLang: 'uk', agentId: 'agent-prive-ok', bodyText: 'Hello team!', segments: segState.segments });
    const body = half.body as AiVertalingRunResponse;
    check('16b een fragment dat de motor niet vertaalde komt NIET terug als «[Переклад → УКР] …» — het staat er simpelweg niet in',
      half.status === 200 && Object.keys(body.translations || {}).length === 1 && !JSON.stringify(body.translations).includes('[Переклад')
      && !JSON.stringify(body.translations).includes('[Vertaling') && !JSON.stringify(body.translations).includes('['),
      JSON.stringify(body.translations));
    check('16b in plaats daarvan wordt eerlijk geteld hoeveel onvertaald bleef (`onvertaald`)', body.onvertaald === segState.segments.length - 1, String(body.onvertaald));
    const gerenderd = renderLayoutPreservingTranslation(segState, body.translations || {}, true);
    check('16b de brief zelf blijft schoon: vertaald fragment vertaald, onvertaald fragment letterlijk het origineel',
      gerenderd === '<p>Привіт, командо!</p><p>Please pay invoice 4821.</p>', gerenderd);
    leegAntwoord = true;
    clearAiVertalingCache('user-16');
    const leeg = await executeAiVertalingRun({ userId: 'user-16', messageId: 'm-16b', mode: 'translate', targetLang: 'uk', agentId: 'agent-prive-ok', bodyText: 'Hello team!', segments: segState.segments });
    check('16b niets vertaald = eerlijke weigering (503 VERTAALMOTOR_GEEN_ANTWOORD), nooit een verzonnen vertaling',
      leeg.status === 503 && (leeg.body as Record<string, unknown>).error === 'VERTAALMOTOR_GEEN_ANTWOORD'
      && String((leeg.body as Record<string, unknown>).messageUk).includes('не повернув перекладу') && llmCalls === 2,
      JSON.stringify(leeg.body).slice(0, 180));
  }

  // ================================================================ c. режим «поруч»
  {
    check('16c reproductie weg: er is nu een echte weergavekeuze (inline / naast), met een knop in de balk',
      normaliseerVertaalWeergave('naast') === 'naast' && normaliseerVertaalWeergave('rommel') === 'inline'
      && /data-testid="ai-vb-btn-naast"/.test(balk) && balk.includes('Оригінал і переклад поруч'));
    check('16c de brief rendert twee kolommen: origineel links, vertaling rechts, elk met een kopje',
      /data-mail-vertaal-weergave='naast'/.test(lichaam) && /data-mail-vertaal-kolom='origineel'/.test(lichaam) && /data-mail-vertaal-kolom='vertaling'/.test(lichaam));
    check('16c alleen de vertaalkolom meldt de fragmenten (één bron van segmenten, geen dubbele registratie)',
      /<Lichaam \{\.\.\.props\} translation=\{undefined\} onTranslationSegments=\{undefined\}\/>/.test(lichaam));
    check('16c twee kolommen op een breed scherm, ONDER ELKAAR op een telefoon',
      /\.mail-vertaal-naast\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/.test(lichaamCss)
      && /@media\(max-width:860px\)\{\.mail-vertaal-naast\{grid-template-columns:minmax\(0,1fr\)\}\}/.test(lichaamCss)
      && /html body \.mail-vertaal-naast\{grid-template-columns:minmax\(0,1fr\)\}/.test(lees('src/mail-mobiel-passend.css')));
    check('16c de brief krijgt de keuze en de motor door van de draad (geen losse, tweede waarheid)',
      /weergave=\{translationWeergave\} onWeergave=/.test(draad) && /weergave:translationWeergave/.test(draad) && /motor:translationResult\?\.motorNaam/.test(draad) && /onOrigineel:\(\)=>\{setLocalTranslationActive\(false\)/.test(draad));
  }

  // ================================================================ d. de knop «ШІ» uitgelegd
  {
    check('16d reproductie weg: «ШІ» heeft nu een uitleg met icoon (InfoTip) die zegt dat het géén tweede rушій is',
      /import \{ InfoTip \} from '\.\.\/InfoTip'/.test(balk) && /<InfoTip className="ai-vb-uitleg" label=(?:"Що таке «ШІ» в цій панелі"|\{t\('Що таке «ШІ» в цій панелі', 'Wat «AI» in dit paneel betekent'\)\})>/.test(balk) /* 21.10 (рецензія UX): label uk + nl */
      && balk.includes('Це не окремий рушій і не кнопка.'));
    check('16d de echte motorkeuze staat op een eigen, benoemde plek («Рушії перекладу»), dus de twee zijn niet meer te verwarren',
      /data-testid="ai-vb-btn-motoren"/.test(balk) && balk.includes('Рушії перекладу'));
    check('16d ook de «ШІ»-balk van de lezer (punt 14) heeft uitleg + icoon, zodat beide knoppen te begrijpen zijn',
      /data-tooltip=\{uitleg\}/.test(lees('src/MailLezerAi.tsx')) && /<Sparkles aria-hidden="true" \/>/.test(lees('src/MailLezerAi.tsx')));
  }

  // ================================================================ e. uitvoer (react-dom/server)
  {
    nepBrowser();
    const { default: MailMessageBody } = await import('../../src/MailBerichtTekst');
    const basis = {
      lang: 'uk' as const,
      context: { service: 'mail', tabContext: 'test', sourceOrigin: ORIGIN },
      accountId: 'acc-1', cacheAccountId: 'acc-1', messageId: 'm-16',
      renderBody: { kind: 'text' as const, html: '', text: 'Please pay invoice 4821.', inlineResources: [] },
      fallbackText: 'Please pay invoice 4821.',
    };
    const inline = renderToString(createElement(MailMessageBody, {
      ...basis,
      translation: { active: true, values: { 'body:0': 'Сплатіть рахунок 4821.' }, bron: 'en', doel: 'uk', motor: 'Ваш приватний ШІ-агент · Claude Приватний', onvertaald: 0, onOrigineel: () => undefined },
    }));
    check('16e uitvoer: boven de brief staat de plaat «Перекладено з … рушієм …» met «Показати оригінал»',
      /data-mail-vertaal-plaat/.test(inline) && inline.includes('Перекладено з Англійська на Українська рушієм Ваш приватний ШІ-агент') && inline.includes('Показати оригінал'), (/<p class="mail-vertaal-plaat[^]*?<\/p>/.exec(inline) || [''])[0].slice(0, 220));
    check('16e uitvoer: in de brieftekst staat GEEN markering (geen «[Переклад», geen «[Vertaling»)',
      !inline.includes('[Переклад') && !inline.includes('[Vertaling') && !inline.includes('[Translated'));
    const metOnvertaald = renderToString(createElement(MailMessageBody, {
      ...basis,
      translation: { active: true, values: {}, bron: 'en', doel: 'uk', motor: 'X', onvertaald: 3 },
    }));
    check('16e uitvoer: onvertaalde fragmenten worden eerlijk gemeld in de plaat, niet nagedaan in de tekst',
      metOnvertaald.includes('3 фрагментів рушій не переклав'), (/<small>[^<]*<\/small>/.exec(metOnvertaald) || [''])[0]);
    const naast = renderToString(createElement(MailMessageBody, {
      ...basis,
      translation: { active: true, values: { 'body:0': 'Сплатіть рахунок 4821.' }, weergave: 'naast' as const, bron: 'en', doel: 'uk', motor: 'X' },
    }));
    check('16e uitvoer: «поруч» geeft twee kolommen (Оригінал / Переклад) met de plaat erboven',
      /data-mail-vertaal-weergave="naast"/.test(naast) && /data-mail-vertaal-kolom="origineel"/.test(naast) && /data-mail-vertaal-kolom="vertaling"/.test(naast)
      && naast.includes('>Оригінал<') && naast.includes('>Переклад<'));
    check('16e uitvoer: zonder vertaling verandert er niets aan de brief (geen plaat, geen kolommen)',
      (() => { const uit = renderToString(createElement(MailMessageBody, basis)); return !uit.includes('mail-vertaal-plaat') && !uit.includes('mail-vertaal-naast'); })());
    check('16e uitvoer: geen «undefined»/«NaN», nl-variant werkt ook', !/undefined|NaN/.test(inline)
      && renderToString(createElement(MailMessageBody, { ...basis, lang: 'nl' as const, translation: { active: true, values: {}, weergave: 'naast' as const, bron: 'en', doel: 'nl', motor: 'X' } })).includes('>Origineel<'));
  }

  return einde();
}
