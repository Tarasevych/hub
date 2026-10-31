// «Подивитися як користувач» (impersonatie, 0068): gedeelde regels voor server (backend/impersonatie.ts) en browser (src/impersonatie).
// De SERVER beslist; de browser gebruikt dezelfde functies alleen om knoppen vooraf uit te leggen.
//
// Drie hekken voor «alleen lezen»:
//   1. vóór de in-process aanroep: routeOordeel() op het concrete pad (backend/impersonatie.ts);
//   2. in ownerRequireSession (backend/index.ts) op het routepatroon, voor élke sessiecontrole binnen de aanroep;
//   3. db.ts weigert elke schrijfquery op app.records zolang de context «alleen lezen» is (server/platform/context.ts).
import type { HelpLagen } from './tech-rollen';

export const IMPERSONATIE_MIN = 5;
export const IMPERSONATIE_MAX = 60;
export const IMPERSONATIE_STANDAARD = 15;
/** Zo lang mag een verzoek op het antwoord van de gebruiker wachten. */
export const IMPERSONATIE_ANTWOORD_MIN = 15;

/** Diensten waarvan de beheerder de interface mag zien (nooit admin, api of mcp: dat is beheer, niet «de site van de gebruiker»). */
export const IMPERSONATIE_DIENSTEN = ['hub', 'mail', 'cloud', 'ai', 'github', 'huis', 'identity'] as const;
export type ImpersonatieDienst = typeof IMPERSONATIE_DIENSTEN[number];
export const isImpersonatieDienst = (v: unknown): v is ImpersonatieDienst => typeof v === 'string' && (IMPERSONATIE_DIENSTEN as readonly string[]).includes(v);

/**
 * NOOIT, ook niet «з правом дій»: beveiliging van het account, aanmeldmethoden, passkeys, account verwijderen, geheimen, export,
 * rollen en beheer, betalingen, uitloggen (dat zou de sessie van de gebruiker raken), en alles rond toegang/impersonatie zelf.
 */
export const IMPERSONATIE_ALTIJD_VERBODEN: readonly RegExp[] = Object.freeze([
  /^[A-Z]+ \/api\/owner\/identity\//,                   // account, beveiliging, sessies, «це був не я», verwijderen
  /^[A-Z]+ \/api\/owner\/access\//,                     // aanmeldmethoden, passkeys, TOTP, herstelcodes, rollen, beleid
  /^[A-Z]+ \/api\/(owner\/)?admin\//,                   // beheer en rollen
  /^[A-Z]+ \/api\/([^ ]*\/)?(admin|beheer|security)(\/|$)/, // ook /api/service/admin, /api/beheer, /journaal/beheer, /api/security
  /^[A-Z]+ \/api\/owner\/(tech|tech-ruimtes|uitrol|orch|agent-namens|ai-beleid|geheimen|sleutelkluis|google-contour|connector-v2|mcp-connector|agents|apps|aanmeld|besluit|codewoord)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/api-platform\//,               // sleutels en kluis
  /^[A-Z]+ \/api\/owner\/audit\/beheer(\/|$)/,
  /^[A-Z]+ \/api\/owner\/agents\/[^/]+\/(policy|revoke)(\/|$)/,
  /^[A-Z]+ \/api\/mcp\/(console|server|consent)(\/|$)/,
  /^[A-Z]+ \/api\/(impersonatie|ondersteuning)\//,
  /^[A-Z]+ \/api\/(aanmeld|huis\/vertrouwde-toestellen)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/stap-op(\/|$)/,
  /^[A-Z]+ \/api\/[^ ]*\/(passkeys?|webauthn|totp|recovery|herstelcodes?)(\/|$)/,
  /^[A-Z]+ \/api\/[^ ]*\/(export|takeout|download-all)(\/|$)/,
  /^[A-Z]+ \/api\/[^ ]*\/(secrets?|vault|reveal|tokens?|api-keys?)(\/|$)/,
  /^[A-Z]+ \/api\/[^ ]*\/(billing|payments?|betalingen?|abonnement|checkout)(\/|$)/,
  /^[A-Z]+ \/api\/[^ ]*\/(logout(-[a-z0-9-]+)?|sign-?out|uitloggen|afmelden|revoke-all|revoke-others)(\/|$)/,
  /^[A-Z]+ \/api\/[^ ]*\/(account\/delete|delete-account|forget)(\/|$)/,
]);

/** Laatste padsegmenten die bij POST alleen LEZEN (al het andere telt als schrijven, sturen of instellen). */
// Bewust NIET: 'read' (/notifications/read markeert als gelezen = schrijven), 'data', 'settings', 'instellingen', 'rpc'.
const LEES = new Set([
  'status', 'list', 'lijst', 'overzicht', 'overview', 'stand', 'load', 'bootstrap', 'accounts', 'search', 'zoeken', 'global-search',
  'preview', 'flags', 'messages', 'message', 'labels', 'threads', 'thread', 'live', 'health', 'historie', 'history', 'activity', 'capabilities',
  'version', 'verbindingen', 'calendars', 'events', 'browse', 'file', 'repos', 'repo', 'issues', 'commits', 'actions', 'readme', 'projects',
  'hub', 'stats', 'services', 'service', 'weergave', 'platform-status', 'traffic', 'backups', 'who', 'voor-mij', 'details', 'info', 'get',
]);
/** Woorden die in ELK segment op schrijven/sturen wijzen, ook als het laatste segment «leest» (bv. /send/status blijft lezen, /send niet). */
const SCHRIJF = /^(send|reply|forward|compose|draft|save|create|add|toevoegen|update|wijzig|zet|zetten|set|modify|delete|verwijderen|remove|trash|archive|move|rename|upload|import|restore|revoke|intrekken|approve|reject|toestaan|weigeren|confirm|submit|run|uitvoeren|start|stop|reset|cancel|link|unlink|disconnect|connect|subscribe|unsubscribe|mark|star|label-add)$/;

export type RouteOordeel = '' | 'IMPERSONATIE_VERBODEN' | 'IMPERSONATIE_ALLEEN_LEZEN';

/** Is deze route (methode + pad) alleen lezen? GET/HEAD altijd; PUT/PATCH/DELETE nooit; POST alleen met een leeswoord aan het eind. */
export function isLeesRoute(route: string): boolean {
  const [methode, pad = ''] = String(route || '').split(' ');
  const m = String(methode || '').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m !== 'POST') return false;
  const delen = pad.split('?')[0].split('/').filter(Boolean).map((d) => d.toLowerCase());
  const laatste = delen[delen.length - 1] || '';
  if (!LEES.has(laatste)) return false;
  // Bv. POST /api/mcp/board maakt een kaart (geen leeswoord) → schrijven; /board/list en /board/search lezen.
  return !delen.slice(0, -1).some((d) => SCHRIJF.test(d));
}

/** Het oordeel over één aanroep binnen een impersonatie. '' = toegestaan. */
export function routeOordeel(route: string, metActies: boolean): RouteOordeel {
  const r = String(route || '');
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE) \/api\/[A-Za-z0-9/_:.-]*$/.test(r)) return 'IMPERSONATIE_VERBODEN';
  if (IMPERSONATIE_ALTIJD_VERBODEN.some((x) => x.test(r))) return 'IMPERSONATIE_VERBODEN';
  if (!metActies && !isLeesRoute(r)) return 'IMPERSONATIE_ALLEEN_LEZEN';
  return '';
}

/** Wat de beheerder ziet en niet ziet — getoond in de melding en het toestemmingsvenster van de gebruiker. */
export const IMPERSONATIE_ZICHTBAAR = Object.freeze({
  uk: {
    ziet: 'ваші сторінки так, як бачите їх ви: огляд, пошту, файли, календар, дошку, налаштування вигляду',
    nooit: 'пароль, passkey, коди, секрети й ключі; змінювати безпеку, способи входу, ролі; видаляти акаунт; експортувати дані; оплату',
    lezen: 'Лише перегляд: нічого не надсилається, не змінюється і не видаляється.',
    acties: 'З правом дій: може натискати кнопки від вашого імені (крім заборонених вище). Кожна дія — у вашому журналі.',
  },
  nl: {
    ziet: 'uw pagina’s zoals u ze ziet: overzicht, mail, bestanden, agenda, bord, weergave-instellingen',
    nooit: 'wachtwoord, passkey, codes, geheimen en sleutels; beveiliging, aanmeldmethoden of rollen wijzigen; account verwijderen; gegevens exporteren; betalingen',
    lezen: 'Alleen bekijken: er wordt niets verzonden, gewijzigd of verwijderd.',
    acties: 'Met recht op acties: mag knoppen namens u gebruiken (behalve het verbodene hierboven). Elke actie staat in uw journaal.',
  },
});

/** mm:ss voor de band (nooit negatief). */
export function resterend(eindMs: number, nu = Date.now()): string {
  const s = Math.max(0, Math.floor((eindMs - nu) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- uitleg «?» (wat · gevolg · risico · voor ontwikkelaars)

export const HELP_IMP_TOESTEMMING: HelpLagen = {
  wat: ['Адміністратор просить побачити сайт так, як бачите його ви — щоб знайти проблему, яку ви описали.', 'Een beheerder vraagt de site te zien zoals u die ziet — om het probleem te vinden dat u meldde.'],
  gevolg: ['На вказаний час він бачить ваші сторінки (огляд, пошту, файли, календар, дошку). Без «з правом дій» — лише перегляд: нічого не надсилається, не змінюється, не видаляється. Кожен його крок — у вашому журналі; завершити можна будь-коли.', 'Voor de gekozen tijd ziet hij uw pagina’s (overzicht, mail, bestanden, agenda, bord). Zonder «met acties» alleen bekijken: niets wordt verzonden, gewijzigd of verwijderd. Elke stap staat in uw journaal; op elk moment te beëindigen.'],
  risico: ['Дозволяйте лише, якщо самі просили допомоги і знаєте цю людину. Ніколи не доступні: пароль, passkey, коди, секрети, безпека акаунта, способи входу, ролі, видалення акаунта, експорт, оплата.', 'Alleen toestaan als u zelf om hulp vroeg en de persoon kent. Nooit bereikbaar: wachtwoord, passkey, codes, geheimen, accountbeveiliging, aanmeldmethoden, rollen, account verwijderen, export, betalingen.'],
  dev: ['Адмін НЕ отримує вашу cookie чи токен. Його вкладка шле кожен запит через POST /api/impersonatie/aanroep; сервер щоразу перевіряє рядок app.impersonatie_sessies (actief, eind_op, та сама особа, та сама вкладка, технічний профіль активний), правило маршруту (shared/impersonatie.ts) і виконує маршрут у процесі від вашого імені з actorType «impersonatie». Три огорожі «лише читання»: правило маршруту, ownerRequireSession і db.ts. Дозвіл — свіжий passkey/TOTP/код відновлення, після цього він погашений.', 'De beheerder krijgt GEEN cookie of token. Zijn tabblad stuurt elke aanroep via POST /api/impersonatie/aanroep; de server controleert telkens de rij (actief, eind_op, dezelfde persoon en hetzelfde tabblad, technisch profiel actief), de routeregel en voert de route in-process uit met actorType «impersonatie». Drie hekken «alleen lezen»: routeregel, ownerRequireSession en db.ts. Toestaan vraagt een verse passkey/TOTP/herstelcode, daarna verbruikt.'],
};

export const HELP_IMP_AANVRAGEN: HelpLagen = {
  wat: ['Запит до користувача: побачити його сайт його очима на 5–60 хв (за замовчуванням 15).', 'Verzoek aan een gebruiker om zijn site met zijn ogen te zien, 5–60 min (standaard 15).'],
  gevolg: ['Користувач бачить вашу пошту, причину, термін і що буде видно; вирішує сам із passkey. Після дозволу ця вкладка показує його сайт під червоною смугою з таймером; усе інше у вас не змінюється.', 'De gebruiker ziet uw e-mail, reden, duur en wat zichtbaar is; beslist zelf met passkey. Daarna toont dit tabblad zijn site onder een rode band met timer; verder verandert er niets voor u.'],
  risico: ['За замовчуванням лише перегляд. Дії — тільки якщо користувач сам поставив галочку, і навіть тоді заборонено безпеку, входи, passkey, видалення акаунта, секрети, експорт, ролі. Вихід із технічного профілю чи з акаунта одразу завершує перегляд.', 'Standaard alleen bekijken. Acties alleen als de gebruiker dat zelf aanvinkte, en ook dan nooit beveiliging, aanmelden, passkeys, account verwijderen, geheimen, export of rollen. Technisch profiel of account verlaten beëindigt meteen.'],
  dev: ['Лише в цій вкладці (хеш tabContext) і поки активна активація з ‘impersonatie.aanvragen’. Агенти ШІ не можуть ні просити, ні користуватися (AGENT_VERBODEN). Читальні запити — один запис у журналі на маршрут за хвилину; кожна дія й кожна відмова — окремо.', 'Alleen in dit tabblad (hash van tabContext) en zolang de activering met ‘impersonatie.aanvragen’ loopt. AI-agenten kunnen niet vragen of gebruiken (AGENT_VERBODEN). Leesaanroepen: één journaalregel per route per minuut; elke actie en weigering apart.'],
};
