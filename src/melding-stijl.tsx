import { Bell, Bot, Calendar, Cloud, Container, Globe, Home, KeyRound, LayoutDashboard, Mail, Plug, ShieldCheck, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import type { LogoKind } from './mcp-ui';

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
