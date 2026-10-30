// «Підключити <ШІ>» — ÉÉN recept per AI-client, actueel (oktober 2026), eerlijk over wat er wel en niet in één klik kan.
//
// Klacht van de eigenaar (20.10.2026): «інтерфейс для підключення всіх ШІ-агентів пропав, немає можливості інтегрувати повноцінне
// підключення з сайтами виробників». De pagina van één agent toonde zijn adres en de rechtenkiezer, maar geen grote knop en geen
// stappen voor juist DIE client. Hier staat per client:
//   • de knop die het meest «in één klik» is dat de maker ECHT aanbiedt (deeplink van Cursor en VS Code, kopieerbare opdracht
//     van Claude Code, de instellingenpagina van claude.ai en ChatGPT);
//   • de stappen daarna, in gewone woorden;
//   • een eerlijke grens waar de maker geen eigen MCP-server toelaat (consumenten-Gemini, Grok) — dan geen verzonnen knop.
// Het adres komt ALTIJD uit agentUrl(slug) (shared/connector-v2/agenten.ts): nooit /mcp, nooit /ai/<agent>, nooit een token
// plakken waar OAuth bestaat (de site registreert clients zelf: Dynamic Client Registration, RFC 7591).
// Puur: geen React, geen DOM (btoa/encodeURIComponent bestaan in de browser én in node ≥ 16) — de test leest dit ook.
import { agentUrl, type AgentSlug } from '../../shared/connector-v2/agenten';

export type Tweetalig = readonly [uk: string, nl: string];
export type KnopSoort = 'deeplink' | 'web' | 'opdracht' | 'config';
export type ReceptKnop = {
  soort: KnopSoort;
  /** Wat er op de grote knop staat. */
  label: Tweetalig;
  /** deeplink/web: het adres dat de knop opent (nieuw tabblad voor web). */
  href?: string;
  /** opdracht/config: de tekst die de knop op het klembord zet. */
  kopieer?: string;
  /** Korte toelichting onder de knop. */
  uitleg?: Tweetalig;
};
export type Recept = {
  slug: AgentSlug;
  /** De naam van de MCP-server zoals de client hem toont. */
  serverNaam: string;
  /** Grote knop(pen): de eerste is de hoofdknop. Leeg = de maker heeft geen weg (zie `grens`). */
  knoppen: ReceptKnop[];
  /** De stappen na de knop, voor een mens. */
  stappen: Tweetalig[];
  /** Eerlijke grens: wat deze client (nog) niet kan. */
  grens?: Tweetalig;
  /** Wat de maker vraagt (abonnement, rol), zodat niemand vergeefs probeert. */
  vereist?: Tweetalig;
};

export const SERVER_NAAM = 'mijn-ruimte';

/** Base64-url van een UTF-8-tekst, zoals de deeplink van Cursor hem verwacht (gewone base64, geen url-variant). */
export function base64(tekst: string): string {
  const bytes = new TextEncoder().encode(tekst);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Cursor: cursor://anysphere.cursor-deeplink/mcp/install?name=<naam>&config=<base64 van {"url": …}> (officiële «Add to Cursor»-knop). */
export const cursorDeeplink = (slug: AgentSlug) => `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(SERVER_NAAM)}&config=${encodeURIComponent(base64(JSON.stringify({ url: agentUrl(slug) })))}`;
/** VS Code (Copilot): vscode:mcp/install?<url-gecodeerde JSON {name,type:'http',url}> (officiële «Install in VS Code»-knop). */
export const vscodeDeeplink = (slug: AgentSlug, insiders = false) => `${insiders ? 'vscode-insiders' : 'vscode'}:mcp/install?${encodeURIComponent(JSON.stringify({ name: SERVER_NAAM, type: 'http', url: agentUrl(slug) }))}`;
/** Claude Code: één opdracht in de terminal; OAuth gebeurt in de browser bij het eerste gebruik (/mcp in Claude Code). */
export const claudeCodeOpdracht = (slug: AgentSlug) => `claude mcp add --transport http ${SERVER_NAAM} ${agentUrl(slug)}`;
/** Gemini CLI: ~/.gemini/settings.json → mcpServers.<naam>.httpUrl (OAuth wordt automatisch ontdekt, RFC 9728). */
export const geminiCliConfig = (slug: AgentSlug) => JSON.stringify({ mcpServers: { [SERVER_NAAM]: { httpUrl: agentUrl(slug) } } }, null, 2);
/** Gewone mcp.json (Cursor, Windsurf en andere clients die een bestand lezen). */
export const mcpJsonConfig = (slug: AgentSlug) => JSON.stringify({ mcpServers: { [SERVER_NAAM]: { url: agentUrl(slug) } } }, null, 2);

export const CLAUDE_CONNECTORS_URL = 'https://claude.ai/settings/connectors';
// ChatGPT (25.10.2026, nagekeken in developers.openai.com/api/docs/guides/developer-mode): het menu heet nu «Settings → Apps»,
// maar de handleiding van OpenAI zelf linkt «Settings → Apps» nog naar #settings/Connectors en «Advanced settings → Developer
// mode» naar #settings/Connectors/Advanced. Dus deze twee adressen, geen verzonnen nieuwe.
export const CHATGPT_CONNECTORS_URL = 'https://chatgpt.com/#settings/Connectors';
export const CHATGPT_GEAVANCEERD_URL = 'https://chatgpt.com/#settings/Connectors/Advanced';

const PLAK = (naam: string): Tweetalig => [`Вставте адресу конектора (вона скопійована кнопкою вище) у ${naam}.`, `Plak het connectoradres (de knop hierboven kopieert het) in ${naam}.`];
const DOZVIL: Tweetalig = ['Клієнт відкриє цей сайт у вікні «Дозволити»: ви вже ввійшли — перевірте дозволи й натисніть «Дозволити». Жодного client id чи токена вводити не треба: сайт реєструє клієнта сам.', 'De client opent deze site in het venster «Toestaan»: u bent al aangemeld — controleer de rechten en klik «Toestaan». Geen client-id of token nodig: de site registreert de client zelf.'];
const KLAAR: Tweetalig = ['Готово: підключення з’явиться вгорі цієї сторінки зі станом і датою; відкликати можна будь-коли.', 'Klaar: de koppeling verschijnt bovenaan deze pagina met stand en datum; intrekken kan altijd.'];

export function recept(slug: AgentSlug): Recept {
  const url = agentUrl(slug);
  switch (slug) {
    case 'claude': return {
      slug, serverNaam: SERVER_NAAM,
      knoppen: [
        { soort: 'web', label: ['Відкрити Claude → Connectors', 'Claude → Connectors openen'], href: CLAUDE_CONNECTORS_URL, uitleg: ['claude.ai і Claude Desktop: Settings → Connectors → «Add custom connector».', 'claude.ai en Claude Desktop: Settings → Connectors → «Add custom connector».'] },
        { soort: 'opdracht', label: ['Скопіювати команду для Claude Code', 'Opdracht voor Claude Code kopiëren'], kopieer: claudeCodeOpdracht(slug), uitleg: ['Термінал: одна команда; при першому зверненні Claude Code відкриє браузер для входу.', 'Terminal: één opdracht; bij het eerste gebruik opent Claude Code de browser om aan te melden.'] },
      ],
      stappen: [
        [`У Claude: Settings → Connectors → «Add custom connector» → Name: будь-яка, Remote MCP server URL: ${url}. Поля OAuth client id / secret лишіть порожніми.`, `In Claude: Settings → Connectors → «Add custom connector» → Name: naar keuze, Remote MCP server URL: ${url}. OAuth client-id / secret leeg laten.`],
        ['Натисніть «Add», потім «Connect» біля нового конектора.', 'Klik «Add» en daarna «Connect» bij de nieuwe connector.'],
        DOZVIL, KLAAR,
      ],
      vereist: ['Власні конектори в claude.ai доступні на платних планах (Pro/Max/Team/Enterprise); Claude Code — на будь-якому плані з Claude Code.', 'Eigen connectors in claude.ai bestaan op de betaalde plannen (Pro/Max/Team/Enterprise); Claude Code op elk plan met Claude Code.'],
    };
    // 25.10.2026 — volgens OpenAI (developer mode-handleiding + help-artikel 12584461, oktober 2026): «Connectors» heet nu «Apps»;
    // eerst Developer mode aan onder Settings → Apps → Advanced settings, dan «Create app» naast Advanced settings (die knop bestaat
    // alleen in Developer mode); OAuth met dynamic client registration (geen client-id/secret); in een nieuw gesprek de app kiezen in
    // het menu met hulpmiddelen of hem noemen. Alleen ChatGPT op het web; volledige MCP met schrijven is bèta voor Business/Enterprise/Edu.
    case 'gpt': return {
      slug, serverNaam: SERVER_NAAM,
      knoppen: [
        { soort: 'web', label: ['Відкрити ChatGPT → Settings → Apps', 'ChatGPT → Settings → Apps openen'], href: CHATGPT_CONNECTORS_URL, uitleg: ['Лише ChatGPT у браузері (chatgpt.com): Settings → Apps. У мобільних застосунках ChatGPT власних застосунків (MCP) немає.', 'Alleen ChatGPT in de browser (chatgpt.com): Settings → Apps. In de mobiele ChatGPT-apps bestaan eigen apps (MCP) niet.'] },
      ],
      stappen: [
        // Eén grote knop (Settings → Apps); de directe weg naar de schakelaar staat als adres in de stap (geen tweede, kleine knop).
        [`Увімкніть режим розробника: Settings → Apps → Advanced settings → «Developer mode» (пряма адреса з довідки OpenAI: ${CHATGPT_GEAVANCEERD_URL}).`, `Zet de ontwikkelaarsmodus aan: Settings → Apps → Advanced settings → «Developer mode» (direct adres uit de handleiding van OpenAI: ${CHATGPT_GEAVANCEERD_URL}).`],
        [`Натисніть «Create app» поруч із Advanced settings (кнопка є лише в режимі розробника): Name — будь-яка, адреса MCP-сервера — ${url}, Authentication — OAuth. Client id / secret не потрібні: ChatGPT реєструється на сайті сам (dynamic client registration).`, `Klik «Create app» naast Advanced settings (die knop is er alleen in de ontwikkelaarsmodus): Name naar keuze, adres van de MCP-server ${url}, Authentication OAuth. Geen client-id / secret nodig: ChatGPT registreert zich zelf bij de site (dynamic client registration).`],
        DOZVIL,
        ['У новій розмові виберіть цей застосунок у меню інструментів («+» → Developer mode) або прямо назвіть його в запиті — інакше ChatGPT його не викликатиме.', 'Kies de app in een nieuw gesprek in het menu met hulpmiddelen («+» → Developer mode) of noem hem gewoon in uw vraag — anders roept ChatGPT hem niet aan.'],
        KLAAR,
      ],
      // 8.3: eerlijk over de plannen (OpenAI, oktober 2026). Op Plus/Pro kunnen schrijvende hulpmiddelen uitvallen; lezen werkt.
      vereist: [
        'Лише ChatGPT у браузері, плани Pro, Plus, Business, Enterprise або Education; у мобільних застосунках ChatGPT і в безкоштовному плані цього немає. За даними OpenAI (жовтень 2026), повний MCP із діями запису та змін — бета лише для Business і Enterprise/Edu (у Business режим розробника вмикає адміністратор, в Enterprise/Edu адміністратор надає доступ), а Pro підключає MCP лише з правами читання. Тож на Plus/Pro інструменти, що пишуть або змінюють (лист, файл, команда), у ChatGPT можуть не працювати; читання працює.',
        'Alleen ChatGPT in de browser, met Pro, Plus, Business, Enterprise of Education; in de mobiele ChatGPT-apps en in het gratis plan bestaat dit niet. Volgens OpenAI (oktober 2026) is volledige MCP met schrijf- en wijzigacties een bèta voor alleen Business en Enterprise/Edu (in Business zet een beheerder de ontwikkelaarsmodus aan, in Enterprise/Edu geeft een beheerder toegang), en Pro koppelt MCP alleen met leesrechten. Op Plus/Pro werken hulpmiddelen die schrijven of wijzigen (mail, bestand, opdracht) in ChatGPT dus mogelijk niet; lezen werkt wel.',
      ],
    };
    case 'cursor': return {
      slug, serverNaam: SERVER_NAAM,
      knoppen: [
        { soort: 'deeplink', label: ['Додати в Cursor (один клік)', 'Toevoegen aan Cursor (één klik)'], href: cursorDeeplink(slug), uitleg: ['Офіційне посилання «Add to Cursor»: Cursor відкриється й запропонує встановити сервер.', 'De officiële «Add to Cursor»-link: Cursor opent en stelt voor de server te installeren.'] },
        { soort: 'config', label: ['Скопіювати mcp.json', 'mcp.json kopiëren'], kopieer: mcpJsonConfig(slug), uitleg: ['Запасний шлях: Settings → Tools & MCP → «New MCP server» → вставте цей JSON у mcp.json.', 'Reserveweg: Settings → Tools & MCP → «New MCP server» → plak deze JSON in mcp.json.'] },
      ],
      stappen: [
        ['Натисніть кнопку: Cursor спитає, чи встановити MCP-сервер «mijn-ruimte». Підтвердьте.', 'Klik op de knop: Cursor vraagt of hij de MCP-server «mijn-ruimte» mag installeren. Bevestig.'],
        ['У списку MCP біля сервера з’явиться «Needs login» → натисніть, Cursor відкриє браузер.', 'In de MCP-lijst staat bij de server «Needs login» → klik, Cursor opent de browser.'],
        DOZVIL, KLAAR,
      ],
    };
    case 'copilot': return {
      slug, serverNaam: SERVER_NAAM,
      knoppen: [
        { soort: 'deeplink', label: ['Встановити у VS Code (один клік)', 'Installeren in VS Code (één klik)'], href: vscodeDeeplink(slug), uitleg: ['Офіційне посилання «Install in VS Code» для Copilot (agent mode).', 'De officiële «Install in VS Code»-link voor Copilot (agent mode).'] },
        { soort: 'deeplink', label: ['VS Code Insiders', 'VS Code Insiders'], href: vscodeDeeplink(slug, true) },
      ],
      stappen: [
        ['VS Code відкриється й спитає, чи додати MCP-сервер «mijn-ruimte» (HTTP). Підтвердьте — він потрапить у mcp.json.', 'VS Code opent en vraagt of hij de MCP-server «mijn-ruimte» (HTTP) mag toevoegen. Bevestig — hij komt in mcp.json.'],
        ['Запустіть сервер (Start) — VS Code запропонує «Allow» для входу через браузер.', 'Start de server (Start) — VS Code stelt «Allow» voor om via de browser aan te melden.'],
        DOZVIL,
        ['Copilot у github.com (coding agent): Repository → Settings → Copilot → Coding agent → MCP configuration — той самий JSON з полем "url".', 'Copilot op github.com (coding agent): Repository → Settings → Copilot → Coding agent → MCP configuration — dezelfde JSON met het veld "url".'],
        KLAAR,
      ],
    };
    case 'gemini': return {
      slug, serverNaam: SERVER_NAAM,
      knoppen: [
        { soort: 'config', label: ['Скопіювати settings.json для Gemini CLI', 'settings.json voor Gemini CLI kopiëren'], kopieer: geminiCliConfig(slug), uitleg: ['Gemini CLI (термінал): ~/.gemini/settings.json → mcpServers. Вхід OAuth CLI знаходить сам.', 'Gemini CLI (terminal): ~/.gemini/settings.json → mcpServers. De OAuth-aanmelding vindt de CLI zelf.'] },
      ],
      stappen: [
        ['Вставте JSON у ~/.gemini/settings.json (або об’єднайте з наявним mcpServers) і перезапустіть gemini.', 'Plak de JSON in ~/.gemini/settings.json (of voeg hem bij de bestaande mcpServers) en start gemini opnieuw.'],
        ['У CLI: /mcp auth mijn-ruimte — відкриється браузер.', 'In de CLI: /mcp auth mijn-ruimte — de browser opent.'],
        DOZVIL, KLAAR,
      ],
      grens: ['Чесно: споживчий застосунок Gemini (gemini.google.com, мобільний Gemini) станом на жовтень 2026 не дає додати власний MCP-сервер — кнопки «відкрити Gemini» тут нема, бо вона нічого б не підключила. Працює Gemini CLI (і Code Assist у VS Code через той самий settings.json).', 'Eerlijk: de consumenten-app Gemini (gemini.google.com, mobiele Gemini) laat in oktober 2026 geen eigen MCP-server toe — er staat hier geen knop «Gemini openen», want die zou niets koppelen. Gemini CLI werkt wel (en Code Assist in VS Code via hetzelfde settings.json).'],
    };
    case 'grok': return {
      slug, serverNaam: SERVER_NAAM,
      knoppen: [
        { soort: 'config', label: ['Скопіювати mcp.json', 'mcp.json kopiëren'], kopieer: mcpJsonConfig(slug), uitleg: ['Для клієнтів і агентів на моделях xAI, що читають mcp.json (наприклад, Grok CLI, редактори з підтримкою MCP).', 'Voor clients en agents op xAI-modellen die mcp.json lezen (bijvoorbeeld Grok CLI, editors met MCP-ondersteuning).'] },
      ],
      stappen: [
        ['Якщо у вашій версії Grok є поле «Custom MCP server / Add connector» — вставте адресу вище; клієнт сам пройде вхід OAuth.', 'Heeft uw versie van Grok een veld «Custom MCP server / Add connector» — plak dan het adres hierboven; de client doorloopt zelf de OAuth-aanmelding.'],
        DOZVIL, KLAAR,
      ],
      grens: ['Чесно: у споживчому Grok (grok.com, застосунок X) станом на жовтень 2026 немає поля для власного MCP-сервера з OAuth — тут нема кнопки «відкрити Grok», бо вона нічого б не підключила. Якщо клієнт на моделі Grok приймає лише заголовок Authorization, випустіть токен у розділі «Токени» нижче.', 'Eerlijk: consumenten-Grok (grok.com, de X-app) heeft in oktober 2026 geen veld voor een eigen MCP-server met OAuth — er staat hier geen knop «Grok openen», want die zou niets koppelen. Neemt een client op een Grok-model alleen een Authorization-kop aan, geef dan hieronder bij «Tokens» een token uit.'],
    };
  }
  // Onbereikbaar (alle slugs staan hierboven), maar TypeScript wil een pad: zonder knop, met het kale adres.
  return { slug, serverNaam: SERVER_NAAM, knoppen: [{ soort: 'config', label: ['Скопіювати mcp.json', 'mcp.json kopiëren'], kopieer: mcpJsonConfig(slug) }], stappen: [PLAK(url), DOZVIL, KLAAR] };
}

/** Heeft deze client een echte «één klik» van de maker (deeplink of een opdracht die alles doet)? */
export const heeftEenKlik = (slug: AgentSlug): boolean => recept(slug).knoppen.some((k) => k.soort === 'deeplink' || k.soort === 'opdracht');
