// Werkblad v3 — bibliotheek «Все на сайті» / «Alles op de site» (TZ §2.1, §4, §7-B).
//
// EÉN register, opgebouwd uit de ECHTE bronnen — niets met de hand verzonnen:
//   - diensten + pagina's:  shared/menu-model.ts (DIENST_IDS, MENU_PAGINAS, itemAccent) en shared/beheer-paginas.ts;
//   - widgets:              shared/werkblad-indeling.ts (WERKBLAD_WIDGETS, zelfde id's, stand klaar/binnenkort/legacy/technisch);
//   - opdrachten:           alleen VEILIGE «open de plek waar je dit doet»-acties (zelfde set als de widget «Snelle acties»).
//                           Een opdracht voert NOOIT zelf iets onomkeerbaars uit: «Написати лист» opent de mail, verzenden
//                           gebeurt daar, met de bevestiging van die plek. Er bestaat dus geen cmd voor verzenden/verwijderen.
//   - persoonlijk (usr:):   een eigen naam/icoon voor een BESTAAND register-item (verwijst via `doel`), nooit een eigen URL;
//   - mappen (map:):        één niveau diep (WERKBLAD_V3_LIMIETEN.maxMapNiveaus).
// Geen React, geen DOM, geen netwerk: draait in browser én server (servervalidatie van v3-items).
//
// Veiligheid: een item heeft GEEN vrije URL. `launchDoel()` geeft {dienst, tab} terug; de browser maakt daar met de canonieke
// router (src/canoniek-navigatie.ts → public/canonical-service.js) een adres van, en alleen voor tabs die die router kent.
// `planned` en `denied` zijn nooit startbaar. Rechten worden bij elke klik opnieuw berekend (`toegestaanVoor`).
import type { ApparaatKlasse, Beschikbaarheid, ItemSoort, RegisterItem, WerkbladRuimte } from './werkblad-v3-types';
import { WERKBLAD_V3_LIMIETEN } from './werkblad-v3-types';
import { DIENST_IDS, MENU_PAGINAS, itemAccent, type Accent } from './menu-model';
import { isBeheerPagina } from './beheer-paginas';
import { WERKBLAD_WIDGETS, type WerkbladWidgetDef } from './werkblad-indeling';
import { serviceTabLabel } from '../src/dienst-tab-labels';

export type Taal = 'uk' | 'nl';
export type Tweetalig = { uk: string; nl: string };
export type RegisterCategorie = RegisterItem['categorie'];

/** Diensten die de canonieke router kent (public/canonical-service.js `serviceIds`). */
export const CANONIEKE_DIENSTEN = ['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'identity', 'api', 'admin', 'mcp'] as const;
export type CanoniekeDienst = typeof CANONIEKE_DIENSTEN[number];

/** Veilige iconen: exact de id's die MenuGlyph (src/menu-voorkeuren.tsx) kent + vier lucide-terugvallers voor de bibliotheek.
 *  Een eenheidstest bewaakt dat elk id hier een echt component heeft. Nooit vrije SVG of URL. */
export const MENU_ICOON_IDS = [
  'home', 'bot', 'mail', 'cloud', 'github', 'house', 'key', 'network', 'shield', 'share', 'calendar', 'tasks', 'notes', 'google', 'microsoft', 'drive', 'onedrive', 'dropbox', 'settings', 'cable',
  'overview', 'recent', 'workspace', 'agents', 'runs', 'workflows', 'connections', 'unread', 'all-mail', 'important', 'drafts', 'sent', 'archive', 'labels', 'local', 'photos', 'accounts',
  'repositories', 'projects', 'documentation', 'research', 'activity', 'personalization', 'menu', 'themes', 'languages', 'widgets', 'sharing', 'identity', 'account', 'sessions', 'vault', 'oauth',
  'access', 'webhooks', 'events', 'logs', 'import', 'reconciliation', 'apps', 'devices', 'sso', 'directories', 'roles', 'audit', 'inbox', 'star', 'snooze', 'dot', 'spam', 'trash', 'news',
  'scheduled', 'tune', 'sidebar', 'blocks', 'invite', 'id-card', 'lock', 'lifebuoy', 'user-check', 'reconcile', 'sign-in', 'gauge', 'link', 'download', 'ai-access', 'deploy',
] as const;
export const EXTRA_ICOON_IDS = ['folder', 'pen-line', 'upload', 'zap', 'server', 'sparkle', 'contacts'] as const;
export const ICOON_IDS: readonly string[] = Object.freeze([...MENU_ICOON_IDS, ...EXTRA_ICOON_IDS]);
export const isIcoonId = (v: unknown): v is string => typeof v === 'string' && ICOON_IDS.includes(v);
/** Presets die de mens als eigen icoon mag kiezen (zelfde lijst; los benoemd zodat het later kleiner kan). */
export const ICOON_PRESETS: readonly string[] = ICOON_IDS;

/** Pagina-iconen per dienst — gelijk aan LOCAL_ICONS in src/menu-voorkeuren.tsx (eenheidstest vergelijkt via localTabIcon). */
const PAGINA_ICOON: Record<string, Record<string, string>> = {
  hub: { overview: 'overview', recent: 'recent', tasks: 'tasks', calendar: 'calendar', notes: 'notes', zoek: 'research', photos: 'photos' },
  ai: { workspace: 'workspace', agents: 'agents', runs: 'runs', workflows: 'workflows', verbindingen: 'connections' },
  mail: { inbox: 'inbox', starred: 'star', snoozed: 'snooze', sent: 'sent', drafts: 'drafts', archive: 'archive', labels: 'labels', accounts: 'accounts', local: 'local', unread: 'dot', all: 'all-mail', important: 'important', spam: 'spam', trash: 'trash', subscriptions: 'news', scheduled: 'scheduled', settings: 'tune' },
  cloud: { overview: 'overview', files: 'local', workspaces: 'projects', capture: 'import', inbox: 'inbox', search: 'research', recent: 'recent', calendar: 'scheduled', photos: 'photos', accounts: 'accounts', google: 'drive', onedrive: 'onedrive', dropbox: 'dropbox' },
  github: { overview: 'github', repositories: 'repositories', code: 'drafts', issues: 'dot', pulls: 'reconcile', actions: 'workflows', releases: 'deploy', sync: 'webhooks', projects: 'projects', documentation: 'documentation', research: 'research', activity: 'activity', accounts: 'accounts' },
  huis: { overview: 'overview', rooms: 'blocks', devices: 'devices', scenes: 'workspace', automations: 'workflows', security: 'lock', energy: 'gauge', activity: 'activity', integrations: 'connections', assistant: 'ai-access', settings: 'tune', showroom: 'photos', planner: 'reconcile' },
  mcp: { overview: 'overview', dashboard: 'deploy', services: 'connections', tools: 'workflows', board: 'projects', agents: 'agents', apps: 'blocks', playground: 'runs', traffic: 'gauge', connect: 'link', roadmap: 'documentation', download: 'download', verbindingen: 'key' },
  identity: { personalization: 'tune', menu: 'sidebar', themes: 'themes', languages: 'languages', widgets: 'blocks', sharing: 'invite', identity: 'id-card', account: 'account', sessions: 'sessions', methods: 'vault', security: 'lock', recovery: 'lifebuoy' },
  api: { verbindingen: 'connections', vault: 'vault', oauth: 'oauth', access: 'user-check', webhooks: 'webhooks', events: 'events', logs: 'logs', import: 'import', reconciliation: 'reconcile' },
  admin: { overview: 'overview', access: 'user-check', ai: 'ai-access', contour: 'vault', updates: 'import', apps: 'oauth', devices: 'sessions', sso: 'sign-in', directories: 'connections', roles: 'accounts', diagnostics: 'activity', audit: 'logs' },
};
export const paginaIcoon = (dienst: string, pagina: string): string => PAGINA_ICOON[dienst]?.[pagina] || 'overview';

/** Dienst-gegevens — gelijk aan MENU_CATALOG in src/menu-voorkeuren.tsx (eenheidstest vergelijkt titel, icoon, doel, tab, planned). */
type DienstDef = { titel: Tweetalig; icoon: string; doel: CanoniekeDienst; tab: string; planned?: boolean };
export const DIENST_DEF: Record<typeof DIENST_IDS[number], DienstDef> = {
  hub: { titel: { uk: 'Мій простір', nl: 'Mijn ruimte' }, icoon: 'home', doel: 'hub', tab: '' },
  ai: { titel: { uk: 'ШІ для вас', nl: 'AI voor u' }, icoon: 'bot', doel: 'ai', tab: 'workspace' },
  mail: { titel: { uk: 'Пошта', nl: 'E-mail' }, icoon: 'mail', doel: 'mail', tab: 'inbox' },
  cloud: { titel: { uk: 'Хмарне сховище', nl: 'Cloudopslag' }, icoon: 'cloud', doel: 'cloud', tab: 'overview' },
  github: { titel: { uk: 'GitHub', nl: 'GitHub' }, icoon: 'github', doel: 'github', tab: 'overview' },
  huis: { titel: { uk: 'Розумний будинок', nl: 'Slim huis' }, icoon: 'house', doel: 'huis', tab: 'overview' },
  mcp: { titel: { uk: 'Міст ШІ → сайт', nl: 'Brug AI → site' }, icoon: 'cable', doel: 'mcp', tab: 'agents' },
  tasks: { titel: { uk: 'Завдання', nl: 'Taken' }, icoon: 'tasks', doel: 'hub', tab: 'tasks' },
  calendar: { titel: { uk: 'Календар', nl: 'Agenda' }, icoon: 'calendar', doel: 'hub', tab: 'calendar' },
  notes: { titel: { uk: 'Нотатки', nl: 'Notities' }, icoon: 'notes', doel: 'hub', tab: 'notes' },
  identity: { titel: { uk: 'Налаштування', nl: 'Instellingen' }, icoon: 'settings', doel: 'identity', tab: 'personalization' },
  api: { titel: { uk: 'API та інтеграції', nl: 'API en integraties' }, icoon: 'network', doel: 'api', tab: 'access' },
  admin: { titel: { uk: 'Адміністрування', nl: 'Beheer' }, icoon: 'shield', doel: 'admin', tab: 'overview' },
  social: { titel: { uk: 'Соціальні мережі', nl: 'Sociale netwerken' }, icoon: 'share', doel: 'hub', tab: '', planned: true },
};

/** Registerregel met de extra's die de bibliotheek nodig heeft (bovenop het gedeelde contract RegisterItem). */
export interface RegisterRegel extends RegisterItem {
  /** Uitleg waarom iets (nog) niet kan — alleen bij planned/denied. */
  reden?: Tweetalig;
  /** Doel in de canonieke router (nooit een URL). Ontbreekt bij widgets en mappen. */
  doel?: { dienst: CanoniekeDienst; tab: string };
  /** Accent uit menu-model (kleur van de herkomstdienst). */
  accent?: Accent;
  /** Alleen via overzetting van oude indelingen — niet nieuw toe te voegen. */
  legacy?: boolean;
  /** usr:-items verwijzen naar een bestaand register-item. */
  basis?: string;
  /** Korte omschrijving (widgets: uitleg uit werkblad-indeling). */
  uitleg?: Tweetalig;
}

const ALLE_APPARATEN: ApparaatKlasse[] = ['computer', 'tablet', 'telefoon'];
const BEIDE: WerkbladRuimte[] = ['prive', 'technisch'];
const TECH: WerkbladRuimte[] = ['technisch'];
/** Ruwe rastermaat van v2 (kolom van 12 ≈ 100 px, rij 96 px) → logische px. */
const KOLOM_PX = 100, RIJ_PX = 96;
export const SNELKOPPELING_AFM = { standaard: { w: 96, h: 104 }, min: { w: 72, h: 80 }, max: { w: 192, h: 208 } } as const;
const TECH_DIENST = (d: string) => d === 'api' || d === 'admin';

const PLANNED_DIENST: Tweetalig = { uk: 'Цей розділ ще в розробці — відкрити його поки не можна.', nl: 'Dit onderdeel is nog in ontwikkeling — openen kan nog niet.' };

function dienstRegel(d: typeof DIENST_IDS[number]): RegisterRegel {
  const def = DIENST_DEF[d];
  const tech = TECH_DIENST(d);
  return {
    id: `svc:${d}`, kind: 'shortcut', dienst: d, route: `${def.doel}/${def.tab}`, titel: def.titel, icoon: def.icoon,
    categorie: tech ? 'technisch' : 'dienst', ruimtes: tech ? TECH : BEIDE, beschikbaarheid: def.planned ? 'planned' : 'ready',
    standaardAfm: { ...SNELKOPPELING_AFM.standaard }, minAfm: { ...SNELKOPPELING_AFM.min }, maxAfm: { ...SNELKOPPELING_AFM.max },
    apparaten: ALLE_APPARATEN, zoekwoorden: [d, def.titel.uk, def.titel.nl], accent: itemAccent(`svc:${d}`),
    ...(def.planned ? { reden: PLANNED_DIENST } : { doel: { dienst: def.doel, tab: def.tab } }),
  };
}

function paginaRegel(d: string, p: string): RegisterRegel {
  const dienstTitel = DIENST_DEF[d as keyof typeof DIENST_DEF]?.titel ?? { uk: d, nl: d };
  const tech = TECH_DIENST(d) || isBeheerPagina(d, p);
  const titel = { uk: serviceTabLabel(p, 'uk'), nl: serviceTabLabel(p, 'nl') };
  return {
    id: `pg:${d}/${p}`, kind: 'shortcut', dienst: d, route: `${d}/${p}`, titel, icoon: paginaIcoon(d, p),
    categorie: tech ? 'technisch' : 'pagina', ruimtes: tech ? TECH : BEIDE, beschikbaarheid: 'ready',
    standaardAfm: { ...SNELKOPPELING_AFM.standaard }, minAfm: { ...SNELKOPPELING_AFM.min }, maxAfm: { ...SNELKOPPELING_AFM.max },
    apparaten: ALLE_APPARATEN, zoekwoorden: [d, p, titel.uk, titel.nl, dienstTitel.uk, dienstTitel.nl], accent: itemAccent(`pg:${d}/${p}`),
    doel: { dienst: d as CanoniekeDienst, tab: p },
  };
}

/** Veilige opdrachten: elk opent de plek waar de handeling gebeurt (zelfde set als «Snelle acties»). Geen schrijfactie. */
type OpdrachtDef = { id: string; titel: Tweetalig; icoon: string; dienst: CanoniekeDienst; tab: string; herkomst: string; zw: string[] };
export const OPDRACHTEN: readonly OpdrachtDef[] = Object.freeze([
  { id: 'cmd:notitie-maken', titel: { uk: 'Створити нотатку', nl: 'Notitie maken' }, icoon: 'notes', dienst: 'hub', tab: 'notes', herkomst: 'notes', zw: ['note', 'нотатка'] },
  { id: 'cmd:taak-maken', titel: { uk: 'Нове завдання', nl: 'Nieuwe taak' }, icoon: 'tasks', dienst: 'hub', tab: 'tasks', herkomst: 'tasks', zw: ['task', 'todo'] },
  { id: 'cmd:afspraak-toevoegen', titel: { uk: 'Додати подію', nl: 'Afspraak toevoegen' }, icoon: 'calendar', dienst: 'hub', tab: 'calendar', herkomst: 'calendar', zw: ['event', 'подія'] },
  // «Написати лист» opent de mail (opsteller); VERZENDEN gebeurt daar, met de eigen bevestiging. Er is geen cmd voor verzenden.
  { id: 'cmd:bericht-schrijven', titel: { uk: 'Написати лист', nl: 'Bericht schrijven' }, icoon: 'pen-line', dienst: 'mail', tab: 'inbox', herkomst: 'mail', zw: ['compose', 'лист', 'mail'] },
  { id: 'cmd:bestand-uploaden', titel: { uk: 'Завантажити файл', nl: 'Bestand uploaden' }, icoon: 'upload', dienst: 'cloud', tab: 'capture', herkomst: 'cloud', zw: ['upload', 'файл'] },
  { id: 'cmd:bord-openen', titel: { uk: 'Відкрити дошку', nl: 'Bord openen' }, icoon: 'projects', dienst: 'mcp', tab: 'board', herkomst: 'mcp', zw: ['board', 'kanban'] },
  { id: 'cmd:zoeken', titel: { uk: 'Пошук по простору', nl: 'Zoeken in de ruimte' }, icoon: 'research', dienst: 'hub', tab: 'zoek', herkomst: 'hub', zw: ['search', 'пошук'] },
]);

function opdrachtRegel(o: OpdrachtDef): RegisterRegel {
  return {
    id: o.id, kind: 'shortcut', dienst: o.herkomst, route: `${o.dienst}/${o.tab}`, actionId: o.id.slice(4), titel: o.titel, icoon: o.icoon,
    categorie: 'opdracht', ruimtes: BEIDE, beschikbaarheid: 'ready',
    standaardAfm: { ...SNELKOPPELING_AFM.standaard }, minAfm: { ...SNELKOPPELING_AFM.min }, maxAfm: { ...SNELKOPPELING_AFM.max },
    apparaten: ALLE_APPARATEN, zoekwoorden: [...o.zw, o.titel.uk, o.titel.nl], accent: itemAccent(`svc:${o.herkomst}`), doel: { dienst: o.dienst, tab: o.tab },
  };
}

const WIDGET_ICOON: Record<string, string> = {
  begroeting: 'home', 'snel-toegang': 'link', 'snelle-acties': 'zap', tip: 'lifebuoy', post: 'mail', agenda: 'calendar', taken: 'tasks', notities: 'notes', bord: 'projects',
  bestanden: 'recent', opslag: 'cloud', 'zoek-recent': 'research', diensten: 'gauge', ai: 'bot', systeem: 'activity', github: 'github',
  'tech-server': 'server', 'tech-updates': 'deploy', 'tech-diagnostiek': 'activity', 'oud-blok': 'blocks', snelkoppeling: 'link',
};
const WIDGET_DIENST: Record<string, string> = { post: 'mail', agenda: 'calendar', taken: 'tasks', notities: 'notes', bord: 'mcp', bestanden: 'cloud', opslag: 'cloud', ai: 'ai', github: 'github', 'tech-server': 'admin', 'tech-updates': 'admin', 'tech-diagnostiek': 'admin' };

function widgetRegel(w: WerkbladWidgetDef): RegisterRegel {
  const tech = w.cat === 'technisch';
  const beschikbaarheid: Beschikbaarheid = w.stand === 'klaar' ? 'ready' : 'planned';
  const dienst = WIDGET_DIENST[w.id];
  return {
    id: `wdg:${w.id}`, kind: 'widget', ...(dienst ? { dienst } : {}), titel: { uk: w.titel[0], nl: w.titel[1] }, icoon: WIDGET_ICOON[w.id] || 'blocks',
    categorie: tech ? 'technisch' : 'widget', ruimtes: [...w.ruimtes], beschikbaarheid,
    standaardAfm: { w: w.k * KOLOM_PX, h: w.r * RIJ_PX }, minAfm: { w: w.minK * KOLOM_PX, h: w.minR * RIJ_PX }, maxAfm: { w: 12 * KOLOM_PX + 400, h: 8 * RIJ_PX },
    apparaten: ALLE_APPARATEN, zoekwoorden: [w.id, w.cat, w.titel[0], w.titel[1], w.uitleg[0], w.uitleg[1]],
    ...(w.enkel ? { singleton: true } : {}), ...(w.bron ? { liveBron: w.bron } : {}), ...(dienst ? { accent: itemAccent(`svc:${dienst}`) } : {}),
    uitleg: { uk: w.uitleg[0], nl: w.uitleg[1] },
    ...(w.ontbreekt ? { reden: { uk: w.ontbreekt[0], nl: w.ontbreekt[1] } } : {}),
    ...(w.verborgenInCatalogus ? { legacy: true } : {}),
  };
}

export const MAP_ITEM: RegisterRegel = Object.freeze({
  id: 'map:nieuw', kind: 'folder', titel: { uk: 'Нова тека', nl: 'Nieuwe map' }, icoon: 'folder', categorie: 'map', ruimtes: BEIDE, beschikbaarheid: 'ready',
  standaardAfm: { ...SNELKOPPELING_AFM.standaard }, minAfm: { ...SNELKOPPELING_AFM.min }, maxAfm: { ...SNELKOPPELING_AFM.max },
  apparaten: ALLE_APPARATEN, zoekwoorden: ['folder', 'map', 'тека'],
}) as RegisterRegel;

function bouwRegister(): readonly RegisterRegel[] {
  const uit: RegisterRegel[] = [];
  for (const d of DIENST_IDS) {
    uit.push(dienstRegel(d));
    for (const p of MENU_PAGINAS[d] || []) uit.push(paginaRegel(d, p));
  }
  for (const o of OPDRACHTEN) uit.push(opdrachtRegel(o));
  for (const w of WERKBLAD_WIDGETS) uit.push(widgetRegel(w));
  uit.push(MAP_ITEM);
  return Object.freeze(uit.map((r) => Object.freeze(r)));
}

/** Het volledige register (statisch). Persoonlijke items (usr:) komen er per mens bij via `persoonlijkItem`. */
export const WERKBLAD_REGISTER: readonly RegisterRegel[] = bouwRegister();
const PER_ID = new Map(WERKBLAD_REGISTER.map((r) => [r.id, r]));

// ----------------------------------------------------------------------------------------------- persoonlijke items
export const USR_ID = /^usr:[a-z0-9-]{1,40}$/;
export type PersoonlijkInvoer = { id: string; basis: string; titel?: string; icoon?: string };
const schoon = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);

/** Een persoonlijke snelkoppeling: eigen naam/icoon op een BESTAANDE shortcut. Ongeldige invoer → undefined (nooit een vrije URL). */
export function persoonlijkItem(inv: PersoonlijkInvoer): RegisterRegel | undefined {
  if (!inv || !USR_ID.test(String(inv.id))) return undefined;
  const basis = PER_ID.get(String(inv.basis));
  if (!basis || basis.kind !== 'shortcut' || basis.id.startsWith('usr:')) return undefined;
  const naam = schoon(inv.titel, WERKBLAD_V3_LIMIETEN.maxTitel);
  return Object.freeze({
    ...basis, id: inv.id, categorie: 'persoonlijk', basis: basis.id,
    titel: naam ? { uk: naam, nl: naam } : basis.titel,
    icoon: isIcoonId(inv.icoon) ? inv.icoon : basis.icoon,
    zoekwoorden: [...basis.zoekwoorden, naam].filter(Boolean),
  }) as RegisterRegel;
}

/** Item op id; usr:-items alleen als ze in `persoonlijk` staan. */
export function registerItem(id: unknown, persoonlijk: readonly RegisterRegel[] = []): RegisterRegel | undefined {
  if (typeof id !== 'string') return undefined;
  return PER_ID.get(id) ?? persoonlijk.find((p) => p.id === id);
}

// ----------------------------------------------------------------------------------------------- rechten
export type RegisterRechten = { apiPlatform: boolean; eigenaar: boolean };
export type RegisterContext = {
  ruimte: WerkbladRuimte;
  rechten?: RegisterRechten;
  /** Optioneel: diensten die deze mens nu heeft (bv. alleen zichtbare/gekoppelde). Ontbreekt = geen extra beperking. */
  diensten?: readonly string[];
};
export type Toestemming = { ok: true } | { ok: false; beschikbaarheid: Exclude<Beschikbaarheid, 'ready'>; reden: Tweetalig };

const R_TECH: Tweetalig = { uk: 'Лише в технічному просторі (технічний профіль).', nl: 'Alleen in de technische ruimte (technisch profiel).' };
const R_RECHT: Tweetalig = { uk: 'Немає права «api-platform» для цього розділу.', nl: 'Geen recht «api-platform» voor dit onderdeel.' };
const R_DIENST: Tweetalig = { uk: 'Ця служба для вашого акаунта недоступна.', nl: 'Deze dienst is voor uw account niet beschikbaar.' };
const R_RUIMTE: Tweetalig = { uk: 'Недоступно в цьому просторі.', nl: 'Niet beschikbaar in deze ruimte.' };
const R_LEGACY: Tweetalig = { uk: 'Лише зі старої розкладки — нове додати не можна.', nl: 'Alleen uit een oude indeling — nieuw toevoegen kan niet.' };
const R_ONBEKEND: Tweetalig = { uk: 'Невідомий елемент.', nl: 'Onbekend item.' };

/** Zelfde regel als src/account-rechten.ts `dienstToegestaan` (mcp = recht api-platform of technisch profiel; api/admin = technisch profiel).
 *  Hier gedupliceerd omdat shared/ geen src/-module met React-afhankelijkheden mag laden; de eenheidstest vergelijkt beide. */
export function dienstToegestaanRegister(dienst: string, r: RegisterRechten | undefined, techProfiel: boolean): boolean {
  if (dienst === 'mcp') return !!r?.apiPlatform || techProfiel;
  if (dienst === 'api' || dienst === 'admin') return techProfiel;
  return true;
}

/** Dynamische rechtencontrole — bij tonen, bij toevoegen én bij elke klik opnieuw. */
export function toegestaanVoor(item: RegisterRegel | undefined, ctx: RegisterContext): Toestemming {
  if (!item) return { ok: false, beschikbaarheid: 'denied', reden: R_ONBEKEND };
  if (item.beschikbaarheid !== 'ready') return { ok: false, beschikbaarheid: item.beschikbaarheid, reden: item.reden ?? PLANNED_DIENST };
  if (item.legacy) return { ok: false, beschikbaarheid: 'denied', reden: R_LEGACY };
  const tech = ctx.ruimte === 'technisch';
  if (!item.ruimtes.includes(ctx.ruimte)) return { ok: false, beschikbaarheid: 'denied', reden: item.categorie === 'technisch' ? R_TECH : R_RUIMTE };
  const diensten = [item.dienst, item.doel?.dienst].filter((d): d is string => !!d);
  for (const d of diensten) {
    if (!dienstToegestaanRegister(d, ctx.rechten, tech)) return { ok: false, beschikbaarheid: 'denied', reden: d === 'mcp' ? R_RECHT : R_TECH };
    if (ctx.diensten && item.dienst === d && !ctx.diensten.includes(d)) return { ok: false, beschikbaarheid: 'denied', reden: R_DIENST };
  }
  return { ok: true };
}

/** Effectieve beschikbaarheid voor deze mens (ready/planned/denied). */
export const beschikbaarheidVoor = (item: RegisterRegel, ctx: RegisterContext): Beschikbaarheid => {
  const t = toegestaanVoor(item, ctx);
  return t.ok ? 'ready' : t.beschikbaarheid;
};

// ----------------------------------------------------------------------------------------------- launcher
export type LaunchDoel = { dienst: CanoniekeDienst; tab: string; actionId?: string };

/** Doel voor de canonieke router. `undefined` = niet startbaar (widget, map, planned, onbekende tab, of geen recht in ctx). */
export function launchDoel(item: RegisterRegel | undefined, ctx?: RegisterContext): LaunchDoel | undefined {
  if (!item || item.kind !== 'shortcut' || item.beschikbaarheid !== 'ready' || !item.doel) return undefined;
  if (ctx && !toegestaanVoor(item, ctx).ok) return undefined;
  const { dienst, tab } = item.doel;
  if (!(CANONIEKE_DIENSTEN as readonly string[]).includes(dienst)) return undefined;
  if (tab && !(MENU_PAGINAS[dienst] || []).includes(tab)) return undefined;
  return { dienst, tab, ...(item.actionId ? { actionId: item.actionId } : {}) };
}

// ----------------------------------------------------------------------------------------------- zoeken
const norm = (s: string) => s.toLocaleLowerCase('uk').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’'ʼ`]/g, '');

export type ZoekOpties = { categorie?: RegisterCategorie | 'alle'; persoonlijk?: readonly RegisterRegel[]; metLegacy?: boolean };

/** Tekstzoeken (uk + nl + id + trefwoorden). Lege vraag = alles. Rangschikking: titel-begin > titel bevat > trefwoord. */
export function zoekRegister(query: string, taal: Taal, opties: ZoekOpties = {}): RegisterRegel[] {
  const lijst = [...WERKBLAD_REGISTER, ...(opties.persoonlijk ?? [])].filter((r) => (opties.metLegacy || !r.legacy) && (!opties.categorie || opties.categorie === 'alle' || r.categorie === opties.categorie));
  const woorden = norm(String(query ?? '').slice(0, 80)).split(/\s+/).filter(Boolean);
  if (!woorden.length) return lijst;
  const scored: Array<[number, number, RegisterRegel]> = [];
  lijst.forEach((r, i) => {
    const titel = norm(r.titel[taal]);
    const ander = norm(r.titel[taal === 'uk' ? 'nl' : 'uk']);
    const hooi = norm([r.id, ...r.zoekwoorden].join(' '));
    let score = 0;
    for (const w of woorden) {
      if (titel.startsWith(w)) score += 4; else if (titel.includes(w)) score += 3; else if (ander.includes(w)) score += 2; else if (hooi.includes(w)) score += 1; else { score = -1; break; }
    }
    if (score > 0) scored.push([score, i, r]);
  });
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((s) => s[2]);
}

export const REGISTER_CATEGORIEEN: ReadonlyArray<{ id: RegisterCategorie; titel: Tweetalig }> = Object.freeze([
  { id: 'dienst', titel: { uk: 'Служби', nl: 'Diensten' } },
  { id: 'pagina', titel: { uk: 'Сторінки', nl: "Pagina's" } },
  { id: 'opdracht', titel: { uk: 'Дії', nl: 'Opdrachten' } },
  { id: 'widget', titel: { uk: 'Віджети', nl: 'Widgets' } },
  { id: 'persoonlijk', titel: { uk: 'Мої ярлики', nl: 'Mijn snelkoppelingen' } },
  { id: 'map', titel: { uk: 'Теки', nl: 'Mappen' } },
  { id: 'technisch', titel: { uk: 'Технічні', nl: 'Technisch' } },
]);

/** Titel van de herkomstdienst (ondertitel in de bibliotheek, want veel pagina's heten «Огляд»). */
export const dienstTitel = (item: RegisterRegel, taal: Taal): string => (item.dienst && DIENST_DEF[item.dienst as keyof typeof DIENST_DEF]?.titel[taal]) || '';

/** Kan dit item als snelkoppeling / als widget worden toegevoegd? */
export const kanAlsSnelkoppeling = (r: RegisterRegel) => r.kind === 'shortcut' || r.kind === 'folder';
export const kanAlsWidget = (r: RegisterRegel) => r.kind === 'widget';
export type { ItemSoort };

// ----------------------------------------------------------------------------------------------- server-validatie (integratie, etappe D)
/** Map-instanties krijgen een eigen id `map:<naam>`; het register kent alleen het sjabloon `map:nieuw`. */
export const MAP_ID = /^map:[a-z0-9-]{1,40}$/;

/** Item voor validatie/weergave van één canvasobject: map:* → MAP_ITEM, usr:* → persoonlijkItem(basis uit config.basis). */
export function registerItemVoorEntry(itemId: string, config?: Record<string, unknown>): RegisterRegel | undefined {
  if (MAP_ID.test(itemId)) return MAP_ITEM;
  if (USR_ID.test(itemId)) return persoonlijkItem({ id: itemId, basis: String(config?.basis ?? ''), titel: typeof config?.titel === 'string' ? config.titel : undefined });
  return PER_ID.get(itemId);
}

/**
 * Haken voor shared/werkblad-v3.ts normaliseerLaag (server én client). Regel: het item moet in het register bestaan, de soort moet
 * kloppen, de ruimte moet passen (privé/technisch blijft gescheiden) en het apparaat moet ondersteund zijn. planned/legacy-items
 * blijven bewaard (ze worden als «скоро»/«недоступно» getoond en openen niets); persoonlijke rechten (mcp/api-platform) worden bij
 * elke KLIK opnieuw gecontroleerd door toegestaanVoor() en door de doeldienst zelf — een positie op het werkblad is geen recht.
 */
export const REGISTER_V3_HAKEN = Object.freeze({
  itemToegestaan(itemId: string, kind: ItemSoort, ruimte: WerkbladRuimte, apparaat: ApparaatKlasse, config?: Record<string, unknown>): boolean {
    const r = registerItemVoorEntry(itemId, config);
    if (!r || r.kind !== kind) return false;
    if (!r.ruimtes.includes(ruimte)) return false;
    return r.apparaten.includes(apparaat);
  },
  grenzen(itemId: string, kind: ItemSoort): { min: { w: number; h: number }; max: { w: number; h: number } } | undefined {
    if (USR_ID.test(itemId)) return kind === 'shortcut' ? { min: { ...SNELKOPPELING_AFM.min }, max: { ...SNELKOPPELING_AFM.max } } : undefined;
    const r = MAP_ID.test(itemId) ? MAP_ITEM : PER_ID.get(itemId);
    if (!r || r.kind !== kind) return undefined;
    return { min: { ...r.minAfm }, max: { ...r.maxAfm } };
  },
  singleton(itemId: string): boolean { return PER_ID.get(itemId)?.singleton === true; },
});
