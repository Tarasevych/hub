import { Bell, Bot, Calendar, Cloud, Container, Globe, Home, KeyRound, LayoutDashboard, Mail, Plug, ShieldCheck, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import type { LogoKind } from './mcp-ui';
import type { CanonicalNoticeKind } from './canonical-notifications';

type Lang = 'uk' | 'nl';
export type Section = 'mail' | 'cloud' | 'calendar' | 'ai' | 'claude' | 'agent' | 'browser' | 'github' | 'mcp' | 'hub' | 'huis' | 'identity' | 'api' | 'admin' | 'site';
export type NoticeStyle = { section: Section; label: string; Icon: LucideIcon; provider: LogoKind | null; providerLabel: string };

const SECTIONS: Record<Section, { uk: string; nl: string; Icon: LucideIcon }> = {
  mail: { uk: 'Пошта', nl: 'E-mail', Icon: Mail },
  cloud: { uk: 'Хмара', nl: 'Cloud', Icon: Cloud },
  calendar: { uk: 'Календар', nl: 'Agenda', Icon: Calendar },
  ai: { uk: 'ШІ', nl: 'AI', Icon: Sparkles },
  claude: { uk: 'Claude', nl: 'Claude', Icon: Bot },
  agent: { uk: 'Пристрої', nl: 'Apparaten', Icon: Container },
  browser: { uk: 'Браузер', nl: 'Browser', Icon: Globe },
  github: { uk: 'GitHub', nl: 'GitHub', Icon: Wrench },
  mcp: { uk: 'Агенти', nl: 'Agenten', Icon: Plug },
  hub: { uk: 'Хаб', nl: 'Hub', Icon: LayoutDashboard },
  huis: { uk: 'Дім', nl: 'Huis', Icon: Home },
  identity: { uk: 'Обліковий запис', nl: 'Account', Icon: KeyRound },
  api: { uk: 'API', nl: 'API', Icon: KeyRound },
  admin: { uk: 'Адміністрування', nl: 'Beheer', Icon: ShieldCheck },
  site: { uk: 'Сайт', nl: 'Site', Icon: Bell },
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

/* ---------- Tekst van meldingen: wat er gebeurde, waarom, en wat u nu kunt doen ---------- */

/** Stand van een actie, zoals het overzicht van de site die geeft. */
export type StatusGroup = 'waiting' | 'active' | 'done' | 'failed' | 'rejected' | 'expired';

/** Soort melding bij een stand: wat u moet weten bepaalt de kleur en de pop-up. */
export function kindOfStatus(group: StatusGroup): CanonicalNoticeKind {
  if (group === 'failed') return 'error';
  if (group === 'waiting' || group === 'rejected' || group === 'expired') return 'warning';
  if (group === 'done') return 'success';
  return 'info';
}

/** Korte stand in gewone taal, voor in de titel van een melding. */
export function statusWord(group: StatusGroup, lang: Lang): string {
  const pair: Record<StatusGroup, [string, string]> = {
    waiting: ['очікує вашого рішення', 'wacht op uw beslissing'],
    active: ['виконується', 'wordt uitgevoerd'],
    done: ['виконано', 'uitgevoerd'],
    failed: ['не вдалося', 'mislukt'],
    rejected: ['відхилено', 'geweigerd'],
    expired: ['час вийшов', 'verlopen'],
  };
  return lang === 'uk' ? pair[group][0] : pair[group][1];
}

/** Bekende foutcodes van de site, in gewone taal. Een onbekende code blijft zichtbaar, met een algemene zin ervoor. */
const REASON_TEXT: Record<string, [string, string]> = {
  AI_NIET_TOEGESTAAN: ['Claude не має доступу до цієї служби', 'Claude heeft voor deze dienst geen toegang'],
  OWNER_API_SESSION_REQUIRED: ['сеанс застарів, увійдіть знову', 'uw sessie is verlopen; meld u opnieuw aan'],
  STEP_UP_REQUIRED: ['потрібне додаткове підтвердження', 'er is een extra bevestiging nodig'],
  PROVIDER_NOT_CONNECTED: ['служба більше не підключена', 'de dienst is niet (meer) gekoppeld'],
  TOKEN_EXPIRED: ['підключення застаріло', 'de koppeling is verlopen'],
};

/** Oorzaak als zin: een bekende code krijgt uitleg, een vrije tekst wordt ongewijzigd getoond. */
export function reasonText(reason: string | undefined, lang: Lang): string {
  const raw = String(reason || '').trim();
  if (!raw) return '';
  const hit = REASON_TEXT[raw];
  if (hit) return `${lang === 'uk' ? hit[0] : hit[1]} (${raw})`;
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}

/**
 * Uitleg onder de titel: wat de oorzaak is (waar bekend) en wat de gebruiker nu kan doen. Blijft kort en in gewone taal.
 */
export function noticeExplain(args: { group: StatusGroup; section: Section; lang: Lang; reason?: string }): string {
  const { group, lang, reason } = args;
  const sec = sectionLabel(args.section, lang);
  const why = reasonText(reason, lang);
  if (lang === 'uk') {
    switch (group) {
      case 'waiting':
        return `${sec} очікує вашої згоди; без вашого рішення нічого не станеться. Що зробити: відкрийте запит і виберіть «Дозволити» або «Відхилити».`;
      case 'failed':
        return `Причина: ${why || `дію не вдалося виконати в розділі «${sec}» (у журналі немає докладнішої причини)`}. Що зробити: перевірте, чи ${sec} ще підключено, і запустіть дію знову. Якщо помилка повторюється, відкрийте розділ і перегляньте деталі.`;
      case 'rejected':
        return `Відхилено${why ? `: ${why}` : ''}. ${sec} не виконає цю дію. Що зробити: якщо ви цього не хотіли, знову надайте доступ у розділі «${sec}» або змініть автоматичні дозволи.`;
      case 'expired':
        return 'Відповідь не надійшла вчасно, тому дію скасовано. Що зробити: запустіть дію знову й ухваліть рішення вчасно.';
      case 'done':
        return `Виконано в розділі «${sec}». Нічого більше не потрібно.`;
      default:
        return `Триває в розділі «${sec}». Нічого робити не потрібно: ви отримаєте повідомлення, коли все буде готово.`;
    }
  }
  switch (group) {
    case 'waiting':
      return `${sec} wacht op uw toestemming; zonder uw keuze gebeurt er niets. Wat nu: open het verzoek en kies toestaan of weigeren.`;
    case 'failed':
      return `Oorzaak: ${why || `de actie kon bij ${sec} niet worden voltooid (geen nadere oorzaak in het logboek)`}. Wat nu: controleer of ${sec} nog is gekoppeld en start de actie opnieuw. Blijft het mislukken, open dan de sectie en bekijk de details.`;
    case 'rejected':
      return `Geweigerd${why ? `: ${why}` : ''}. ${sec} voert deze actie niet uit. Wat nu: wilde u dit niet, geef de toegang dan opnieuw in ${sec} of pas de automatische rechten aan.`;
    case 'expired':
      return 'Er kwam geen antwoord binnen de wachttijd, dus de actie is verlopen. Wat nu: laat de actie opnieuw starten en beslis dan op tijd.';
    case 'done':
      return `Afgerond bij ${sec}. Er is niets meer nodig.`;
    default:
      return `Bezig bij ${sec}. U hoeft niets te doen; u krijgt een melding zodra het klaar is.`;
  }
}

/** Een actie op de site zonder bekende naam: zet de auditnaam om naar een zin met het gebied voorop. */
const SITE_AREA: Record<string, [string, string]> = {
  mail: ['Пошта', 'E-mail'], cloud: ['Хмара', 'Cloud'], calendar: ['Календар', 'Agenda'], github: ['GitHub', 'GitHub'], mcp: ['Claude', 'Claude'],
  agent: ['Пристрої', 'Apparaten'], browser: ['Браузер', 'Browser'], identity: ['Обліковий запис', 'Account'], privacy: ['Приватність', 'Privacy'],
  admin: ['Адміністрування', 'Beheer'], api: ['API', 'API'], vault: ['Секрети', 'Geheimen'], access: ['Доступ', 'Toegang'], ai: ['ШІ', 'AI'],
  chat: ['ШІ', 'AI'], auth: ['Вхід', 'Aanmelding'], session: ['Сеанс', 'Sessie'], profile: ['Профіль', 'Profiel'], step_up: ['Підтвердження', 'Bevestiging'],
};
const SITE_PHRASE: Array<[RegExp, [string, string]]> = [
  [/(vault|secret).*(denied|reject|fail|error)/, ['спробу дії з секретом відхилено', 'poging met een geheim geweigerd']],
  [/(vault|secret)/, ['дію з секретом', 'actie met een geheim']],
  [/grant.*(denied|reject)/, ['доступ відхилено', 'toegang geweigerd']],
  [/(denied|reject)/, ['дію відхилено', 'actie geweigerd']],
  [/(fail|error)/, ['дію не виконано', 'actie mislukt']],
];

export function siteActionText(type: string, lang: Lang): string {
  const parts = String(type || '').replace(/^owner\./, '').split('.');
  const area = parts[0] || '';
  const rest = parts.slice(1).join('.');
  const areaName = SITE_AREA[area] ? (lang === 'uk' ? SITE_AREA[area][0] : SITE_AREA[area][1]) : (lang === 'uk' ? 'Сайт' : 'Site');
  const phrase = SITE_PHRASE.find(([re]) => re.test(`${area}.${rest}`));
  if (phrase) return `${areaName}: ${lang === 'uk' ? phrase[1][0] : phrase[1][1]}`;
  const tail = rest.replace(/[._]/g, ' ').trim();
  return tail ? `${areaName}: ${tail}` : areaName;
}

/** Het gebied van een site-actie of activiteit als sectie (voor de pictogrammen en de link). */
export const SECTION_SERVICE: Partial<Record<Section, 'hub' | 'ai' | 'mail' | 'cloud' | 'github' | 'huis' | 'identity' | 'api' | 'admin' | 'mcp'>> = {
  mail: 'mail', cloud: 'cloud', calendar: 'hub', ai: 'ai', github: 'github', huis: 'huis', identity: 'identity', api: 'api', admin: 'admin',
  claude: 'mcp', agent: 'mcp', browser: 'mcp', mcp: 'mcp', hub: 'hub',
};
