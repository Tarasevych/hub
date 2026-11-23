// MELDLINK-001 (16.11.2026): ЄДИНЕ МІСЦЕ, ДЕ ПОСИЛАННЯ СПОВІЩЕННЯ СТАЄ ДІЙСНОЮ АДРЕСОЮ · één plek waar de link van een melding
// een bestaande pagina wordt.
//
// Чому це потрібно (скарга Павла 16.11.2026: «у деяких сповіщеннях посилання ведуть на недійсну сторінку»):
//   1. Відносні адреси (/agenda, /mail, /cloud, /diagnostiek, /) браузер відкриває на ТОМУ піддомені, де зараз відкрите
//      сповіщення. Центр сповіщень спільний для всіх піддоменів, тож «/diagnostiek», прочитане на id.*, вело на id.*/diagnostiek → 404.
//   2. Деяких адрес ніколи не існувало або їх перейменували (id.*/aanmeldmethoden-beheer, mail.*/mail, cloud.*/cloud,
//      mcp.*/#extensie замість mcp.*/agents#extensie).
//   3. Старі сповіщення вже лежать у базі (site_notifications, melding_ecosysteem_gebeurtenissen) і в локальній історії браузера
//      зі старими адресами. Тому ця функція працює і під час ЗАПИСУ, і під час ЧИТАННЯ: старий запис відкривається правильно без міграції.
//
// Waarheid over routes: `tabs` (= MENU_PAGINAS), TAB_SLUG en LEGACY_ALIAS in public/canonical-service.js. De kopie hieronder wordt door
// tests/eenheid/meldlink-001-20261116.test.ts gelijk gehouden met dat bestand; een melding naar een niet-bestaand pad laat die test vallen.
// Puur (geen DOM, geen Node-API): draait op de server, in de browser en in tests.
import { PUBLIC_DOMAIN, SERVICE_HOSTS } from '../backend/deployment-identiteit';
import { MENU_PAGINAS } from './menu-model';

export type LinkDienst = keyof typeof SERVICE_HOSTS;
export const LINK_DIENSTEN = Object.keys(SERVICE_HOSTS) as LinkDienst[];

/** Kopie van TAB_SLUG uit public/canonical-service.js (id → Nederlandse slug in de adresbalk). */
export const TAB_SLUG: Readonly<Record<string, string>> = {
  overview: 'overzicht', tasks: 'taken', calendar: 'agenda', notes: 'notities', workspace: 'werkgebied', agents: 'agenten', runs: 'processen', workflows: 'werkstromen',
  inbox: 'postvak-in', starred: 'met-ster', snoozed: 'uitgesteld', sent: 'verzonden', drafts: 'concepten', labels: 'etiketten', local: 'prive', unread: 'ongelezen',
  all: 'alles', trash: 'prullenbak', scheduled: 'gepland', settings: 'instellingen', subscriptions: 'abonnementen', contacts: 'contacten', archive: 'archief',
  important: 'belangrijk', workspaces: 'werkruimtes', capture: 'vastleggen', search: 'zoeken', photos: 'fotos', code: 'code', issues: 'vraagstukken', pulls: 'samenvoegingen',
  actions: 'werkstromen-ci', releases: 'uitgaven', sync: 'spiegel', projects: 'projecten', research: 'onderzoek', activity: 'activiteit', documentation: 'documentatie',
  themes: 'themas', languages: 'talen', widgets: 'blokken', melding: 'melding', sharing: 'delen', identity: 'identiteit', sessions: 'sessies', methods: 'aanmeldmethoden',
  security: 'beveiliging', recovery: 'herstel', personalization: 'personalisatie', vault: 'kluis', access: 'toegang', reconciliation: 'afstemming', devices: 'apparaten',
  directories: 'mappen', roles: 'rollen', diagnostics: 'diagnostiek', services: 'diensten', tools: 'hulpmiddelen', board: 'bord', playground: 'zandbak', traffic: 'verkeer',
  connect: 'verbinden', roadmap: 'routekaart', download: 'downloaden', files: 'bestanden', shared: 'gedeeld', rooms: 'kamers', scenes: 'scenes', automations: 'automatiseringen',
  energy: 'energie', integrations: 'integraties', assistant: 'assistent', showroom: 'showroom', planner: 'planner',
};
/** Kopie van LEGACY_ALIAS uit public/canonical-service.js. */
export const LEGACY_ALIAS: Readonly<Record<string, string>> = {
  connections: 'verbindingen', oauth: 'access', webhooks: 'access', events: 'access', gebeurtenissen: 'access', logs: 'access', logboeken: 'access', import: 'access', importeren: 'access',
};
const SLUG_NAAR_ID: Record<string, string> = Object.fromEntries(Object.entries(TAB_SLUG).map(([id, slug]) => [slug, id]));
const idVoor = (segment: string): string => SLUG_NAAR_ID[segment] || LEGACY_ALIAS[segment] || segment;

/** Paden die geen tabblad zijn maar door de app zelf worden bediend (gastpagina, publieke deelkoppeling). */
const EXTRA_PADEN: Partial<Record<LinkDienst, RegExp>> = {
  identity: /^\/toegang\/?$/,
  cloud: /^\/gedeeld\/[^/]+\/?$/,
};

const eersteSegment = (pad: string): string => {
  const s = pad.split('/').filter(Boolean)[0] || '';
  try { return decodeURIComponent(s); } catch { return s; }
};

/** Bestaat dit pad op deze dienst (zoals public/canonical-service.js het oplost, zonder 404)? */
export function padBestaat(dienst: LinkDienst, pad: string): boolean {
  if (!pad || pad === '/') return true;
  if (EXTRA_PADEN[dienst]?.test(pad)) return true;
  return (MENU_PAGINAS[dienst] || []).includes(idVoor(eersteSegment(pad)));
}

/** Dienst bij een hostnaam van deze installatie (hub.<domein>, id.<domein> …; het kale domein = hub). */
export function dienstVoorHost(host: string): LinkDienst | undefined {
  const h = String(host || '').toLowerCase();
  if (h === PUBLIC_DOMAIN) return 'hub';
  return LINK_DIENSTEN.find((d) => SERVICE_HOSTS[d] === h);
}

/**
 * Oude of nooit bestaande paden → [dienst, nieuw pad]. Sleutel = eerste padsegment. Alleen wat ooit in een melding stond
 * (zie de bronnen in de test); al het andere dat niet bestaat valt terug op de startpagina van de dienst.
 * Застарілі адреси зі сповіщень → дійсна сторінка.
 */
const OUDE_PADEN: Record<string, readonly [LinkDienst, string]> = {
  // backend/telegram-aanmelden/meldingen.ts en backend/apparaat-bevestiging/kern.ts (тривога власнику): цієї сторінки не було;
  // керування Telegram і «Підтвердження з іншого пристрою» — у адмінці «Система єдиного входу».
  'aanmeldmethoden-beheer': ['admin', '/sso'],
  // backend/ai-vertaling-routes.ts ('/mail'), backend/cloud-schrijfrecht.ts ('/cloud'): назва служби замість сторінки.
  mail: ['mail', '/'],
  cloud: ['cloud', '/'],
  huis: ['huis', '/'],
  crm: ['crm', '/'],
  klant: ['crm', '/'],
  klantrelatie: ['crm', '/'],
  klantrelatiebeheer: ['crm', '/'],
  klimop: ['mcp', '/agents#orch'],
  afstemming: ['api', '/afstemming'],
  geheugen: ['ai', '/processen'],
  foto: ['cloud', '/fotos'],
  social: ['identity', '/netwerken'],
  agenda: ['hub', '/agenda'],
  notities: ['hub', '/notities'],
  diagnostiek: ['admin', '/diagnostiek'],
  updates: ['admin', '/updates'],
};

/** Ankers van de pagina «Підключення ШІ» (src/agenten/agenten-hash.ts): op de startpagina van mcp.* doen ze niets. */
const AGENTEN_ANKER = /^#(overzicht|overview|connectors|agent(\/|$)|ai(\/|$)|extern|orch|extensie|extension|browser|apparaten|tokens|toegang|dostupy|toegangen|technisch|journaal|pending|claude|tools|doors|pair|dev:)/;

/** Specifiek subpad voor diensten die op een eigen tabblad of anker van een host leven (bij een kale '/' met soort-hint). */
function padVoorSoort(soort: string | undefined): readonly [LinkDienst, string] | undefined {
  const s = String(soort || '').toLowerCase();
  if (!s) return undefined;
  if (/^(klimop|owner\.klimop)($|[._:-])/.test(s)) return ['mcp', '/agents#orch'];
  if (/^(afstemming|reconciliation|owner\.afstemming)($|[._:-])/.test(s)) return ['api', '/afstemming'];
  if (/^(geheugen|owner\.ai\.geheugen)($|[._:-])/.test(s)) return ['ai', '/processen'];
  if (/^(foto|fotos|photos|owner\.foto)($|[._:-])/.test(s)) return ['cloud', '/fotos'];
  if (/^(social|netwerken|owner\.social)($|[._:-])/.test(s)) return ['identity', '/netwerken'];
  return undefined;
}

/** Welke dienst past bij een meldingssoort als de link zelf het niet zegt (relatief pad zonder host). */
export function dienstVoorSoort(soort: string | undefined): LinkDienst | undefined {
  const s = String(soort || '').toLowerCase();
  if (!s) return undefined;
  if (/^(agenda|calendar|owner\.calendar|notitie|owner\.notitie)/.test(s)) return 'hub';
  if (/^(mail|post|owner\.mail)/.test(s)) return 'mail';
  if (/^(cloud|bestand|drive|foto|fotos|photos|owner\.cloud|owner\.foto)/.test(s)) return 'cloud';
  if (/^(uitrol|beveiliging\.zekering|google_login_config)/.test(s)) return 'admin';
  if (/^(workspace|share|deel)/.test(s)) return 'hub';
  if (/^(geheugen|owner\.ai\.geheugen)/.test(s)) return 'ai';
  if (/^(klimop|owner\.klimop|ai|mcp|agent|extensie)/.test(s)) return 'mcp';
  if (/^(vault|afstemming|reconciliation|owner\.afstemming)/.test(s)) return 'api';
  if (/^(huis|domotica|woning|owner\.huis)/.test(s)) return 'huis';
  if (/^(klant|klantrelatie|klantrelatiebeheer|crm|owner\.klantrelatie)/.test(s)) return 'crm';
  if (/^(social|netwerken|owner\.social|security|access|passkey|toegang|herstel|recovery|login|session|sessie|apparaat|impersonatie|ondersteuning)/.test(s)) return 'identity';
  return undefined;
}

const VOLGORDE: readonly LinkDienst[] = ['hub', 'identity', 'mail', 'cloud', 'ai', 'mcp', 'admin', 'api', 'github', 'crm', 'huis'];
const absoluut = (dienst: LinkDienst, padEnRest: string): string => `https://${SERVICE_HOSTS[dienst]}${padEnRest.startsWith('/') ? padEnRest : `/${padEnRest}`}`;

export type LinkHint = {
  /** Soort van de melding (site_notifications.kind / ecosysteem soort of bron). */
  soort?: string;
  /** Dienst die de bron zelf opgaf (ecosysteem `subdomein`) of waar een lokale melding ontstond. */
  dienst?: LinkDienst;
};

/**
 * Maakt van de link van een melding een ABSOLUTE adres naar een pagina die echt bestaat. Externe https-adressen en links die al goed
 * zijn blijven ongewijzigd; alles wat niet te herstellen is wordt '' (de kaart toont dan geen knop in plaats van een 404).
 * Перетворює посилання сповіщення на абсолютну адресу дійсної сторінки; невиправне → '' (кнопки не буде замість сторінки 404).
 */
export function routeerMeldingLink(raw: unknown, hint: LinkHint = {}): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('#')) {
    // Alleen een anker: hoort bij de dienst van de bron.
    const d = hint.dienst || dienstVoorSoort(hint.soort);
    return d ? routeerMeldingLink(absoluut(d, `/${s}`), hint) : s;
  }
  if (s.startsWith('/') && !s.startsWith('//')) {
    let u: URL;
    try { u = new URL(s, 'https://x.invalid'); } catch { return ''; }
    const rest = `${u.pathname}${u.search}${u.hash}`;
    const seg = eersteSegment(u.pathname);
    if (u.pathname === '/' && !u.hash && !hint.dienst) {
      const spec = padVoorSoort(hint.soort);
      if (spec) return absoluut(spec[0], `${spec[1]}${spec[1].includes('#') ? '' : u.search}`);
    }
    const voorkeur = [hint.dienst, dienstVoorSoort(hint.soort)].filter(Boolean) as LinkDienst[];
    // 1) de dienst van de bron/soort, als het pad daar bestaat; 2) een bekend oud pad; 3) de eerste dienst waar het pad bestaat.
    for (const d of voorkeur) if (padBestaat(d, u.pathname)) return routeerMeldingLink(absoluut(d, rest), hint);
    const oud = OUDE_PADEN[seg];
    if (oud) return absoluut(oud[0], `${oud[1]}${oud[1].includes('#') ? '' : u.search + u.hash}`);
    const d = VOLGORDE.find((x) => padBestaat(x, u.pathname));
    return d ? routeerMeldingLink(absoluut(d, rest), hint) : (voorkeur[0] ? absoluut(voorkeur[0], '/') : absoluut('hub', '/'));
  }
  let u: URL;
  try { u = new URL(s); } catch { return ''; }
  const dienst = dienstVoorHost(u.hostname);
  if (!dienst || u.protocol !== 'https:') return s; // extern adres of lokale test: niet aan ons om te herschrijven
  if (dienst === 'mcp' && (u.pathname === '/' || u.pathname === '') && AGENTEN_ANKER.test(u.hash)) return absoluut('mcp', `/agents${u.search}${u.hash}`);
  if (padBestaat(dienst, u.pathname)) return u.href;
  const seg = eersteSegment(u.pathname);
  const oud = OUDE_PADEN[seg];
  if (oud) return absoluut(oud[0], `${oud[1]}${oud[1].includes('#') ? '' : u.search + u.hash}`);
  // Pad bestaat op een andere dienst (bv. id.*/agenda): daarheen; anders de startpagina van deze dienst.
  const elders = VOLGORDE.find((x) => x !== dienst && padBestaat(x, u.pathname));
  return elders ? absoluut(elders, `${u.pathname}${u.search}${u.hash}`) : absoluut(dienst, '/');
}
