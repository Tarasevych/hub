// SITE-001 (пункт 18): сторож захисту від спаму та підбору без мережі.
// Кожен публічний POST (server/platform/auth-poort.ts → PUBLIEKE_ROUTES, без сеансу) мусить мати одне з двох:
//  1) суворе обмеження частоти на IP у server/start.ts → STRIKTE_LIMIETEN (і «закрите» при збої бази — failClosed);
//  2) власний захист, записаний тут із міткою в коді, яку сторож знаходить (лічильник спроб, підпис, маркер доступу тощо).
// Новий публічний маршрут без жодного з них — тест падає: спершу треба вирішити, як його захистити від спаму й підбору.
// Окремо: множник ×20 для місцевих перевірок вмикається лише змінною E2E_LOKALE_LIMIETEN=1 (у deploy/ її немає).
// nl: bewaking tegen spam en raden — elke openbare POST heeft een strikte limiet of een vastgelegde eigen bescherming.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

type Bescherming = { waarom: string; bestand: string; merk: RegExp };
/** Публічні POST без суворого обмеження: чому це безпечно і де в коді це видно. */
const EIGEN: Record<string, Bescherming> = {
  '/api/owner/access/catalog': { waarom: 'лише читання переліку способів входу; загальна межа 600/хв', bestand: 'server/start.ts', merk: /geheugenLimiet\(`api:\$\{ip\}`/ },
  '/api/owner/google-suite/callback': { waarom: 'одноразовий state + прив’язка до оглядача', bestand: 'server/platform/auth-poort.ts', merk: /google-suite\/callback': 'OAuth-terugkeer Google Suite \(state \+ browserbindingscookie\)/ },
  '/api/aanmelden/kluis': { waarom: 'одноразовий маркер одразу після входу', bestand: 'backend/aanmelden-methoden.ts', merk: /'POST \/api\/aanmelden\/kluis'/ },
  '/api/aanmelden/telegram/status': { waarom: 'id + таємниця цього оглядача, лише стеження', bestand: 'server/platform/auth-poort.ts', merk: /telegram\/status': 'Telegram-aanmelding volgen \(id \+ geheim/ },
  '/api/aanmelden/telegram/plaats': { waarom: 'id + таємниця цього оглядача', bestand: 'server/platform/auth-poort.ts', merk: /telegram\/plaats': 'plaats van het toestel/ },
  '/api/telegram/webhook': { waarom: 'таємний заголовок Telegram', bestand: 'server/platform/auth-poort.ts', merk: /X-Telegram-Bot-Api-Secret-To/ },
  '/api/telegram/venster/kies': { waarom: 'підписане посилання + initData', bestand: 'server/platform/auth-poort.ts', merk: /venster\/kies': 'pictogram kiezen in het Telegram-venster \(ondertekende verwijzing/ },
  '/api/telegram/venster/code': { waarom: 'лічильник невдалих спроб, пауза й вимкнення коду (резервування спроби до перевірки)', bestand: 'backend/telegram-aanmelden/code.ts', merk: /pauzeNa[\s\S]*uitNa/ },
  '/api/telegram/venster/weigeren': { waarom: 'підписане посилання + initData', bestand: 'server/platform/auth-poort.ts', merk: /venster\/weigeren': '«Це не я» in het Telegram-venster \(ondertekende verwijzing/ },
  '/api/owner/session/logout-current': { waarom: 'вихід без наслідків для інших (ідемпотентно)', bestand: 'server/platform/auth-poort.ts', merk: /logout-current': 'afmelden is altijd toegestaan \(idempotent\)/ },
  '/api/owner/session/logout-browser-all': { waarom: 'вихід лише в цьому оглядачі (ідемпотентно)', bestand: 'server/platform/auth-poort.ts', merk: /logout-browser-all': 'alles in deze browser afmelden \(idempotent/ },
  '/api/owner/session/bootstrap': { waarom: 'лише стан сеансу; без сеансу — порожня відповідь', bestand: 'server/platform/auth-poort.ts', merk: /session\/bootstrap': 'sessiestatus; zonder sessie alleen/ },
  '/api/owner/session/accounts': { waarom: 'лише перелік цього оглядача; без сеансу — порожній', bestand: 'server/platform/auth-poort.ts', merk: /session\/accounts': '[^']*zonder sessie lege lijst/ },
  '/api/owner/browser/accounts': { waarom: 'лише перелік цього оглядача; без сеансу — порожній', bestand: 'server/platform/auth-poort.ts', merk: /browser\/accounts': '[^']*zonder sessie lege lijst/ },
  '/api/mcp-connector/rpc': { waarom: 'обов’язковий маркер доступу OAuth + межа на маркер', bestand: 'backend/mcp-connector.ts', merk: /rateLimit\(`mcp-rpc:/ },
  '/api/connector-v2/:agent/rpc': { waarom: 'обов’язковий маркер доступу цього агента + межа на маркер', bestand: 'backend/connector-v2.ts', merk: /rateLimit\(`mcp-rpc:/ },
  '/api/mcp/deur/token-check': { waarom: 'лише місцевий міст MCP зі своїм ключем', bestand: 'server/platform/auth-poort.ts', merk: /token-check': 'intern: alleen de MCP-deur op loopback/ },
  '/api/owner/agents/self': { waarom: 'маркер розширення (пошук за відбитком)', bestand: 'server/platform/auth-poort.ts', merk: /agents\/self': ?'browserextensie vraagt met haar eigen token/ },
  '/api/owner/agents/overdracht': { waarom: 'маркер агента в заголовку Authorization', bestand: 'server/platform/auth-poort.ts', merk: /agents\/overdracht': ?'agent haalt met zijn eigen token/ },
  '/api/owner/agents/ontgrendeling/intrekken-extensie': { waarom: 'маркер розширення в заголовку Authorization', bestand: 'server/platform/auth-poort.ts', merk: /intrekken-extensie': ?'browserextensie trekt met haar eigen token/ },
  '/api/owner/agents/extensie/chat': { waarom: 'маркер розширення', bestand: 'server/platform/auth-poort.ts', merk: /extensie\/chat': ?'zijpaneel van de extensie/ },
  '/api/owner/agents/diagnostics/archive': { waarom: 'маркер розширення в заголовку Authorization', bestand: 'server/platform/auth-poort.ts', merk: /diagnostics\/archive': ?'browserextensie levert met haar eigen token/ },
  '/api/owner/mail/microsoft/webhook': { waarom: 'перевірка clientState', bestand: 'server/platform/auth-poort.ts', merk: /microsoft\/webhook': 'Microsoft Graph-webhook \(clientState-controle\)/ },
  '/api/owner/mail/google/pubsub/push': { waarom: 'маркер OIDC від Google', bestand: 'server/platform/auth-poort.ts', merk: /pubsub\/push': 'Google Pub\/Sub-push \(OIDC-token/ },
  '/api/github/webhook/:sleutel': { waarom: 'обов’язковий підпис HMAC-SHA256', bestand: 'server/platform/auth-poort.ts', merk: /github\/webhook\/:sleutel': 'inkomende GitHub-webhook \(verplichte HMAC-SHA256/ },
  '/api/uitrol/github/webhook': { waarom: 'обов’язковий підпис HMAC', bestand: 'server/platform/auth-poort.ts', merk: /uitrol\/github\/webhook': 'inkomende GitHub-release-webhook voor uitrolvoorstellen \(verplichte HM/ },
  '/api/uitrol/telegram/webhook': { waarom: 'таємний заголовок + власна межа 180/хв', bestand: 'backend/uitrol-telegram.ts', merk: /rateLimit\('uitrol-tg-webhook', 180, 60/ },
  '/api/gast/uitloggen': { waarom: 'завершення гостьового сеансу (ідемпотентно)', bestand: 'server/platform/auth-poort.ts', merk: /gast\/uitloggen': 'gastsessie beëindigen \(idempotent/ },
  '/api/cloud/gedeeld/info': { waarom: 'код 192 біти + власна межа 120/хв на IP і 10 спроб пароля за 5 хв', bestand: 'backend/bestanden-delen.ts', merk: /rateLimit\(`cloud-gedeeld:\$\{ipBucket\}`, 120, 60\)[\s\S]*cloud-gedeeld-ww:/ },
  '/api/cloud/gedeeld/inhoud': { waarom: 'той самий захист, що й info', bestand: 'backend/bestanden-delen.ts', merk: /rateLimit\(`cloud-gedeeld:\$\{ipBucket\}`/ },
  '/api/cloud/gedeeld/download': { waarom: 'той самий захист, що й info', bestand: 'backend/bestanden-delen.ts', merk: /rateLimit\(`cloud-gedeeld:\$\{ipBucket\}`/ },
  '/api/owner/access/webauthn/options': { waarom: 'можливість вимкнено (503)', bestand: 'server/platform/auth-poort.ts', merk: /webauthn\/options': 'passkey-opties \(uitgeschakeld: 503\)/ },
  '/api/owner/access/webauthn/register': { waarom: 'можливість вимкнено (503)', bestand: 'server/platform/auth-poort.ts', merk: /webauthn\/register': 'passkey registreren \(uitgeschakeld: 503\)/ },
};
/** Маршрути з таємницею, яку можна підбирати: їм потрібне саме суворе обмеження (власного захисту замало). */
const RADEN = ['/api/owner/access/password/login', '/api/owner/auth/password/login', '/api/aanmelden/wachtwoord/voltooien', '/api/gast/inwisselen', '/api/owner/agents/pair', '/api/aanmelden/telegram/code', '/api/owner/session/handoff/redeem', '/api/mcp-connector/register', '/api/mcp-connector/token'];

async function deployBestanden(map: string): Promise<string[]> {
  const uit: string[] = [];
  for (const e of await readdir(map, { withFileTypes: true })) {
    const p = join(map, e.name);
    if (e.isDirectory()) uit.push(...(await deployBestanden(p)));
    else if (e.name.endsWith('.service') || e.name.endsWith('.env') || e.name.endsWith('.sh')) uit.push(p);
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-spam');
  const root = process.cwd();
  try {
    const start = await readFile(join(root, 'server/start.ts'), 'utf8');
    const blokS = start.slice(start.indexOf('const STRIKTE_LIMIETEN'), start.indexOf('];', start.indexOf('const STRIKTE_LIMIETEN')));
    const strikt = [...blokS.matchAll(/^\s*\[\/(.+)\/, '([^']+)', (\d+), (true|false)\]/gm)].map((m) => ({ re: new RegExp(m[1]), naam: m[2], max: Number(m[3]), dicht: m[4] === 'true' }));
    check('суворі обмеження прочитано', strikt.length >= 15, String(strikt.length));
    check('усі суворі обмеження «закриті» при збої бази (failClosed)', strikt.every((s) => s.dicht), strikt.filter((s) => !s.dicht).map((s) => s.naam).join(', '));

    const poort = await readFile(join(root, 'server/platform/auth-poort.ts'), 'utf8');
    const blok = poort.slice(poort.indexOf('PUBLIEKE_ROUTES'), poort.indexOf('};', poort.indexOf('PUBLIEKE_ROUTES')));
    const routes = [...blok.matchAll(/'POST (\/[^']+)'/g)].map((m) => m[1]);
    check('публічні POST прочитано', routes.length >= 40, String(routes.length));

    const zonder: string[] = [];
    const bronnen = new Map<string, string>();
    for (const r of routes) {
      const pad = r.replace(/:[a-zA-Z]+/g, 'x');
      if (strikt.some((s) => s.re.test(pad))) continue;
      const e = EIGEN[r];
      if (!e) { zonder.push(r); continue; }
      if (!bronnen.has(e.bestand)) bronnen.set(e.bestand, await readFile(join(root, e.bestand), 'utf8'));
      check(`власний захист видно в коді: ${r} (${e.waarom})`, e.merk.test(bronnen.get(e.bestand)!), e.bestand);
    }
    check('кожен публічний POST має суворе обмеження або записаний власний захист', zonder.length === 0, zonder.join(', '));
    check('у переліку власного захисту немає застарілих маршрутів', Object.keys(EIGEN).every((r) => routes.includes(r)), Object.keys(EIGEN).filter((r) => !routes.includes(r)).join(', '));
    for (const r of RADEN) {
      const s = strikt.find((x) => x.re.test(r));
      check(`підбір таємниці обмежено суворо: ${r}`, !!s && s.max <= 120, s ? `${s.naam}/${s.max}` : 'немає');
    }

    // Множник лише для місцевих перевірок і ніколи в розгортанні.
    check('множник ×20 вмикається лише значенням «1»', /process\.env\.E2E_LOKALE_LIMIETEN !== '1'\) return 1/.test(start));
    const deploy = await deployBestanden(join(root, 'deploy'));
    const metFactor: string[] = [];
    for (const f of deploy) if ((await readFile(f, 'utf8')).includes('E2E_LOKALE_LIMIETEN')) metFactor.push(f);
    check('у deploy/ немає E2E_LOKALE_LIMIETEN', metFactor.length === 0, metFactor.join(', '));

    // Людина бачить зрозуміле пояснення замість голого 429.
    const weigering = await readFile(join(root, 'src/weigeringen.ts'), 'utf8');
    check('для 429 є людське пояснення (uk + nl)', /RATE_LIMITED[\s\S]{0,200}Забагато спроб[\s\S]{0,200}Te veel pogingen/.test(weigering));
  } catch (e) {
    check('сторож виконано без винятків', false, String(e));
  }
  return einde();
}
