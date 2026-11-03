import { Bell, Bot, Calendar, Cloud, Container, Globe, Home, KeyRound, LayoutDashboard, Mail, Plug, ShieldCheck, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import type { LogoKind } from './mcp-ui';
import type { CanonicalNoticeKind } from './canoniek-meldingen';

type Lang = 'uk' | 'nl';
export type Section = 'mail' | 'cloud' | 'calendar' | 'ai' | 'claude' | 'agent' | 'browser' | 'github' | 'mcp' | 'hub' | 'huis' | 'identity' | 'api' | 'admin' | 'site';
export type NoticeStyle = { section: Section; label: string; Icon: LucideIcon; provider: LogoKind | null; providerLabel: string };

const SECTIONS: Record<Section, { uk: string; nl: string; Icon: LucideIcon }> = {
  mail: { uk: 'Пошта', nl: 'E-mail', Icon: Mail }, cloud: { uk: 'Хмара', nl: 'Cloud', Icon: Cloud }, calendar: { uk: 'Календар', nl: 'Agenda', Icon: Calendar },
  ai: { uk: 'ШІ', nl: 'AI', Icon: Sparkles }, claude: { uk: 'Claude', nl: 'Claude', Icon: Bot }, agent: { uk: 'Пристрої', nl: 'Apparaten', Icon: Container },
  browser: { uk: 'Браузер', nl: 'Browser', Icon: Globe }, github: { uk: 'GitHub', nl: 'GitHub', Icon: Wrench }, mcp: { uk: 'Агенти', nl: 'Agenten', Icon: Plug },
  hub: { uk: 'Хаб', nl: 'Hub', Icon: LayoutDashboard }, huis: { uk: 'Дім', nl: 'Huis', Icon: Home }, identity: { uk: 'Обліковий запис', nl: 'Account', Icon: KeyRound },
  api: { uk: 'API', nl: 'API', Icon: KeyRound }, admin: { uk: 'Адміністрування', nl: 'Beheer', Icon: ShieldCheck }, site: { uk: 'Сайт', nl: 'Site', Icon: Bell },
};
const PROVIDERS: Record<string, { logo: LogoKind; label: string }> = {
  google: { logo: 'google', label: 'Google' }, microsoft: { logo: 'microsoft', label: 'Microsoft' }, github: { logo: 'github', label: 'GitHub' }, claude: { logo: 'claude', label: 'Claude' },
  anthropic: { logo: 'claude', label: 'Anthropic' }, windows: { logo: 'windows', label: 'Windows' }, linux: { logo: 'linux', label: 'Linux' }, macos: { logo: 'macos', label: 'macOS' },
  chrome: { logo: 'chrome', label: 'Chrome' }, edge: { logo: 'edge', label: 'Edge' }, opera: { logo: 'opera', label: 'Opera' }, brave: { logo: 'brave', label: 'Brave' }, firefox: { logo: 'firefox', label: 'Firefox' },
  internal: { logo: 'internal', label: 'Mijn Ruimte' }, docker: { logo: 'docker', label: 'Docker' },
};

/**
 * Bron van een melding -> sectie, pictogram en dienst (logo). Een bron mag "sectie:dienst" zijn (bv. "mail:microsoft", "ai:anthropic"); zonder dienst
 * volgt die uit de sectie (e-mail en cloud hebben nu alleen Google gekoppeld). Zo ziet u in één oogopslag WAT er gebeurde en BIJ WELKE dienst.
 */
export function styleOf(source: string, lang: Lang, hint?: { provider?: string }): NoticeStyle {
  const [rawSection, rawProvider] = String(source || '').toLowerCase().split(':');
  let section: Section = 'site';
  if (/^mail/.test(rawSection)) section = 'mail';
  else if (/^(cloud|drive)/.test(rawSection)) section = 'cloud';
  else if (/^calendar|^agenda/.test(rawSection)) section = 'calendar';
  else if (/^github/.test(rawSection)) section = 'github';
  else if (rawSection === 'claude') section = 'claude';
  else if (rawSection === 'ai' || /^chat/.test(rawSection)) section = 'ai';
  else if (rawSection === 'agent') section = 'agent';
  else if (rawSection === 'browser') section = 'browser';
  else if (rawSection === 'mcp') section = 'mcp';
  else if ((Object.keys(SECTIONS) as Section[]).includes(rawSection as Section)) section = rawSection as Section;
  const providerKey = hint?.provider || rawProvider || (section === 'mail' || section === 'cloud' || section === 'calendar' ? 'google' : section === 'github' ? 'github' : section === 'claude' ? 'claude' : section === 'ai' ? 'anthropic' : '');
  const provider = PROVIDERS[providerKey] ?? null;
  const meta = SECTIONS[section];
  return { section, label: lang === 'uk' ? meta.uk : meta.nl, Icon: meta.Icon, provider: provider ? provider.logo : null, providerLabel: provider ? provider.label : '' };
}

export const sectionLabel = (section: Section, lang: Lang) => (lang === 'uk' ? SECTIONS[section].uk : SECTIONS[section].nl);
export const allSections = (): Section[] => Object.keys(SECTIONS) as Section[];

/* ---------- Tekst van meldingen: wat er gebeurde, waarom, en wat u nu kunt doen (geen kale «помилка») ---------- */

/** Stand van een actie, zoals de site die geeft. */
export type StatusGroep = 'waiting' | 'active' | 'done' | 'failed' | 'rejected' | 'expired';

/** Soort melding bij een stand: wat u moet weten bepaalt de kleur en de pop-up. */
export function soortVanStatus(groep: StatusGroep): CanonicalNoticeKind {
  if (groep === 'failed') return 'error';
  if (groep === 'waiting' || groep === 'rejected' || groep === 'expired') return 'warning';
  if (groep === 'done') return 'success';
  return 'info';
}

/** Korte stand in gewone taal, achter de titel («… — не вдалося»). «Не вдалося» is duidelijker dan «помилка». */
export function statusWoord(groep: StatusGroep, lang: Lang): string {
  const paar: Record<StatusGroep, [string, string]> = {
    waiting: ['очікує вашого рішення', 'wacht op uw beslissing'],
    active: ['виконується', 'wordt uitgevoerd'],
    done: ['виконано', 'uitgevoerd'],
    failed: ['не вдалося', 'mislukt'],
    rejected: ['відхилено', 'geweigerd'],
    expired: ['час вийшов', 'verlopen'],
  };
  return lang === 'uk' ? paar[groep][0] : paar[groep][1];
}

/** Bekende foutcodes van de site, in gewone taal. Een onbekende code blijft zichtbaar, achter een algemene zin. */
const REDEN_TEKST: Record<string, [string, string]> = {
  AI_NIET_TOEGESTAAN: ['Claude не має доступу до цієї служби', 'Claude heeft voor deze dienst geen toegang'],
  OWNER_API_SESSION_REQUIRED: ['сеанс застарів, увійдіть знову', 'uw sessie is verlopen; meld u opnieuw aan'],
  STEP_UP_REQUIRED: ['потрібне додаткове підтвердження', 'er is een extra bevestiging nodig'],
  PROVIDER_NOT_CONNECTED: ['служба більше не підключена', 'de dienst is niet (meer) gekoppeld'],
  TOKEN_EXPIRED: ['підключення застаріло', 'de koppeling is verlopen'],
};

/** Oorzaak als zin: een bekende code krijgt uitleg, een vrije tekst wordt (ingekort) ongewijzigd getoond. */
export function redenTekst(reden: string | undefined, lang: Lang): string {
  const ruw = String(reden || '').trim();
  if (!ruw) return '';
  const hit = REDEN_TEKST[ruw];
  if (hit) return `${lang === 'uk' ? hit[0] : hit[1]} (${ruw})`;
  return ruw.length > 160 ? `${ruw.slice(0, 157)}…` : ruw;
}

/**
 * Uitleg onder de titel: wat de oorzaak is (waar bekend) en wat u nu kunt doen. Kort, in gewone taal, met de sectie erin.
 */
export function meldingUitleg(args: { groep: StatusGroep; sectie: Section; lang: Lang; reden?: string }): string {
  const { groep, lang } = args;
  const sec = sectionLabel(args.sectie, lang);
  const waarom = redenTekst(args.reden, lang);
  if (lang === 'uk') {
    switch (groep) {
      case 'waiting': return `${sec} очікує вашої згоди; без вашого рішення нічого не станеться. Що зробити: відкрийте запит і виберіть «Дозволити» або «Відхилити».`;
      case 'failed': return `Причина: ${waarom || `дію не вдалося виконати в розділі «${sec}» (у журналі немає докладнішої причини)`}. Що зробити: перевірте, чи ${sec} ще підключено, і запустіть дію знову. Якщо збій повториться, відкрийте розділ і перегляньте деталі.`;
      case 'rejected': return `Відхилено${waarom ? `: ${waarom}` : ''}. ${sec} не виконає цю дію. Що зробити: якщо ви цього не хотіли, знову надайте доступ у розділі «${sec}» або змініть автоматичні дозволи.`;
      case 'expired': return 'Відповідь не надійшла вчасно, тому дію скасовано. Що зробити: запустіть дію знову й ухваліть рішення вчасно.';
      case 'done': return `Виконано в розділі «${sec}». Нічого більше не потрібно.`;
      default: return `Триває в розділі «${sec}». Нічого робити не потрібно: ви отримаєте повідомлення, коли все буде готово.`;
    }
  }
  switch (groep) {
    case 'waiting': return `${sec} wacht op uw toestemming; zonder uw keuze gebeurt er niets. Wat nu: open het verzoek en kies toestaan of weigeren.`;
    case 'failed': return `Oorzaak: ${waarom || `de actie kon bij ${sec} niet worden voltooid (geen nadere oorzaak in het logboek)`}. Wat nu: controleer of ${sec} nog is gekoppeld en start de actie opnieuw. Blijft het mislukken, open dan de sectie en bekijk de details.`;
    case 'rejected': return `Geweigerd${waarom ? `: ${waarom}` : ''}. ${sec} voert deze actie niet uit. Wat nu: wilde u dit niet, geef de toegang dan opnieuw in ${sec} of pas de automatische rechten aan.`;
    case 'expired': return 'Er kwam geen antwoord binnen de wachttijd, dus de actie is verlopen. Wat nu: laat de actie opnieuw starten en beslis dan op tijd.';
    case 'done': return `Afgerond bij ${sec}. Er is niets meer nodig.`;
    default: return `Bezig bij ${sec}. U hoeft niets te doen; u krijgt een melding zodra het klaar is.`;
  }
}

/** Een actie op de site zonder bekende naam: zet de auditnaam om naar een zin met het gebied voorop (nooit «Інша дія на сайті»). */
const SITE_GEBIED: Record<string, [string, string]> = {
  mail: ['Пошта', 'E-mail'], cloud: ['Хмара', 'Cloud'], calendar: ['Календар', 'Agenda'], github: ['GitHub', 'GitHub'], mcp: ['Claude', 'Claude'],
  agent: ['Пристрої', 'Apparaten'], browser: ['Браузер', 'Browser'], identity: ['Обліковий запис', 'Account'], privacy: ['Приватність', 'Privacy'],
  admin: ['Адміністрування', 'Beheer'], api: ['API', 'API'], vault: ['Секрети', 'Geheimen'], access: ['Доступ', 'Toegang'], ai: ['ШІ', 'AI'],
  chat: ['ШІ', 'AI'], auth: ['Вхід', 'Aanmelding'], session: ['Сеанс', 'Sessie'], profile: ['Профіль', 'Profiel'], step_up: ['Підтвердження', 'Bevestiging'],
  extensie: ['Розширення браузера', 'Browserextensie'], beheer: ['Адміністрування', 'Beheer'],
};
const SITE_ZIN: Array<[RegExp, [string, string]]> = [
  [/(vault|secret).*(denied|reject|fail|error)/, ['спробу дії з секретом відхилено', 'poging met een geheim geweigerd']],
  [/(vault|secret)/, ['дію з секретом', 'actie met een geheim']],
  [/grant.*(denied|reject)/, ['доступ відхилено', 'toegang geweigerd']],
  [/(denied|reject)/, ['дію відхилено', 'actie geweigerd']],
  [/(fail|error)/, ['дію не вдалося виконати', 'actie mislukt']],
];

/**
 * INTEG-001 (eigenaar: «Не «інша дія»: кажи конкретно, яка і про що»): een auditnaam zonder eigen label wordt — als ALLE delen bekend
 * zijn — een gewone zin «<gebied>: <wat> <gebeurde>» («Хмара: теку створено»). Is een deel onbekend, dan nooit de interne code als titel
 * (vroeger «Дія на сайті: mail contacten scan gestart»), maar wel het gebied en waar de code staat (de technische details).
 */
const SITE_WAT: Record<string, [string, string]> = {
  file: ['файл', 'bestand'], bestand: ['файл', 'bestand'], folder: ['теку', 'map'], map: ['теку', 'map'], account: ['акаунт', 'account'], mailbox: ['поштову скриньку', 'mailbox'],
  session: ['сеанс', 'sessie'], sessie: ['сеанс', 'sessie'], key: ['ключ', 'sleutel'], sleutel: ['ключ', 'sleutel'], token: ['токен', 'token'], passkey: ['ключ входу (passkey)', 'passkey'],
  device: ['пристрій', 'apparaat'], apparaat: ['пристрій', 'apparaat'], label: ['мітку', 'label'], labels: ['мітки', 'labels'], message: ['лист', 'bericht'], bericht: ['лист', 'bericht'],
  event: ['подію', 'afspraak'], afspraak: ['подію', 'afspraak'], rule: ['правило', 'regel'], regel: ['правило', 'regel'], policy: ['правила', 'beleid'], beleid: ['правила', 'beleid'],
  settings: ['налаштування', 'instellingen'], setting: ['налаштування', 'instelling'], instellingen: ['налаштування', 'instellingen'], grant: ['доступ', 'toegang'], toegang: ['доступ', 'toegang'], access: ['доступ', 'toegang'],
  user: ['користувача', 'gebruiker'], gebruiker: ['користувача', 'gebruiker'], role: ['роль', 'rol'], rol: ['роль', 'rol'], photo: ['фото', 'foto'], foto: ['фото', 'foto'], profile: ['профіль', 'profiel'], profiel: ['профіль', 'profiel'],
  share: ['спільний доступ', 'deling'], deling: ['спільний доступ', 'deling'], export: ['експорт', 'export'], backup: ['резервну копію', 'back-up'], secret: ['секрет', 'geheim'], geheim: ['секрет', 'geheim'],
  contact: ['контакт', 'contact'], contacten: ['контакти', 'contacten'], draft: ['чернетку', 'concept'], concept: ['чернетку', 'concept'], note: ['нотатку', 'notitie'], notitie: ['нотатку', 'notitie'],
  repo: ['репозиторій', 'repository'], issue: ['задачу', 'issue'], extensie: ['розширення', 'extensie'], extension: ['розширення', 'extensie'], webhook: ['вебхук', 'webhook'],
};
const SITE_GEBEURDE: Record<string, [string, string]> = {
  created: ['створено', 'aangemaakt'], create: ['створено', 'aangemaakt'], aangemaakt: ['створено', 'aangemaakt'], added: ['додано', 'toegevoegd'], toegevoegd: ['додано', 'toegevoegd'],
  deleted: ['видалено', 'verwijderd'], delete: ['видалено', 'verwijderd'], verwijderd: ['видалено', 'verwijderd'], removed: ['прибрано', 'weggehaald'],
  updated: ['змінено', 'gewijzigd'], update: ['змінено', 'gewijzigd'], modified: ['змінено', 'gewijzigd'], changed: ['змінено', 'gewijzigd'], gewijzigd: ['змінено', 'gewijzigd'], bijgewerkt: ['оновлено', 'bijgewerkt'],
  connected: ['підключено', 'gekoppeld'], linked: ['підключено', 'gekoppeld'], gekoppeld: ['підключено', 'gekoppeld'], disconnected: ['відключено', 'ontkoppeld'], unlinked: ['відключено', 'ontkoppeld'], ontkoppeld: ['відключено', 'ontkoppeld'],
  revoked: ['відкликано', 'ingetrokken'], ingetrokken: ['відкликано', 'ingetrokken'], approved: ['схвалено', 'goedgekeurd'], goedgekeurd: ['схвалено', 'goedgekeurd'],
  started: ['почато', 'gestart'], gestart: ['почато', 'gestart'], completed: ['завершено', 'voltooid'], klaar: ['завершено', 'voltooid'], done: ['завершено', 'voltooid'], voltooid: ['завершено', 'voltooid'],
  enabled: ['увімкнено', 'aangezet'], disabled: ['вимкнено', 'uitgezet'], sent: ['надіслано', 'verzonden'], verzonden: ['надіслано', 'verzonden'], imported: ['імпортовано', 'geïmporteerd'], exported: ['експортовано', 'geëxporteerd'],
  shared: ['поділено', 'gedeeld'], gedeeld: ['поділено', 'gedeeld'], restored: ['відновлено', 'hersteld'], hersteld: ['відновлено', 'hersteld'], renamed: ['перейменовано', 'hernoemd'], moved: ['переміщено', 'verplaatst'], verplaatst: ['переміщено', 'verplaatst'],
  scheduled: ['заплановано', 'ingepland'], cancelled: ['скасовано', 'geannuleerd'], canceled: ['скасовано', 'geannuleerd'], requested: ['запитано', 'aangevraagd'], saved: ['збережено', 'opgeslagen'], opgeslagen: ['збережено', 'opgeslagen'],
  verified: ['перевірено', 'geverifieerd'], geverifieerd: ['перевірено', 'geverifieerd'], expired: ['прострочено', 'verlopen'], verlopen: ['прострочено', 'verlopen'], rotated: ['замінено на новий', 'vernieuwd'], vernieuwd: ['оновлено', 'vernieuwd'],
};
export function siteActieTekst(type: string, lang: Lang): string {
  const delen = String(type || '').replace(/^owner\./, '').split('.');
  const gebied = delen[0] || '';
  const rest = delen.slice(1).join('.');
  const i = lang === 'uk' ? 0 : 1;
  const gebiedNaam = SITE_GEBIED[gebied] ? SITE_GEBIED[gebied][i] : (lang === 'uk' ? 'Сайт' : 'Site');
  const zin = SITE_ZIN.find(([re]) => re.test(`${gebied}.${rest}`));
  if (zin) return `${gebiedNaam}: ${zin[1][i]}`;
  const woorden = delen.slice(1).flatMap((d) => d.split(/[_-]/)).map((w) => w.toLowerCase()).filter(Boolean);
  const wat = woorden.filter((w) => SITE_WAT[w]), gebeurde = woorden.filter((w) => SITE_GEBEURDE[w]);
  // Alleen als ELK woord bekend is, wordt het een zin (anders zou een interne code als «tekst» in het paneel komen).
  if (SITE_GEBIED[gebied] && gebeurde.length && wat.length + gebeurde.length === woorden.length) {
    const watTekst = wat.map((w) => SITE_WAT[w][i]).join(' ');
    return `${gebiedNaam}: ${watTekst} ${SITE_GEBEURDE[gebeurde[gebeurde.length - 1]][i]}`.replace(/\s+/g, ' ').trim();
  }
  // Onbekend: het gebied en waar de code staat — nooit de kale «дія» of «інша дія», nooit de code zelf als titel.
  if (!SITE_GEBIED[gebied]) return lang === 'uk' ? 'Подія на сайті без опису (код — у «Технічних подробицях»)' : 'Gebeurtenis op de site zonder omschrijving (code onder «Technische details»)';
  return lang === 'uk' ? `${gebiedNaam}: подія без опису (код — у «Технічних подробицях»)` : `${gebiedNaam}: gebeurtenis zonder omschrijving (code onder «Technische details»)`;
}

/** Het gebied van een site-actie als sectie: voor het pictogram en de link naar het onderdeel. */
export const SECTIE_DIENST: Partial<Record<Section, 'hub' | 'ai' | 'mail' | 'cloud' | 'github' | 'huis' | 'identity' | 'api' | 'admin' | 'mcp'>> = {
  mail: 'mail', cloud: 'cloud', calendar: 'hub', ai: 'ai', github: 'github', huis: 'huis', identity: 'identity', api: 'api', admin: 'admin',
  claude: 'mcp', agent: 'mcp', browser: 'mcp', mcp: 'mcp', hub: 'hub',
};
