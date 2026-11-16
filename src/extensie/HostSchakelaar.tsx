// EXTUI-001 (16.11.2026, побажання власника): сторінки й сайти ШІ у вікнах доступу — не «бухгалтерський список» адрес із
// квадратиками, а рядки з логотипом, людською назвою (як у меню сайту), адресою дрібніше й вмикачем праворуч.
// Pagina's en AI-sites in de toegangsvensters: rij met logo, menselijke naam (zoals in het menu), adres klein en een schakelaar.
// Вмикач — справжній checkbox із role=switch: клавіатура, читач екрана і наявні data-атрибути працюють як раніше.
// Довідка: ключ «?» передає виклик (hulp='…'); tests/eenheid/hulp-register.test.ts перевіряє ключ і «?» у файлі виклику.
import type { ReactNode } from 'react';
import { Bot, Cable, Cloud, Github, Globe, Home, HousePlug, Mail, Network, Settings, ShieldCheck, type LucideIcon } from 'lucide-react';
import Merk from '../merk/Merk';
import { DIENST_ACCENT } from '../../shared/menu-model';
import './host-schakelaar.css';

type DienstInfo = { dienst: keyof typeof DIENST_ACCENT; icoon: LucideIcon; uk: string; nl: string };
/** Власні сервіси: назва й піктограма такі самі, як у меню сайту (src/menu-voorkeuren.tsx), колір — колір сервісу. */
const DIENSTEN: Readonly<Record<string, DienstInfo>> = {
  'hub.tarasevych.com': { dienst: 'hub', icoon: Home, uk: 'Мій простір', nl: 'Mijn ruimte' },
  'mail.tarasevych.com': { dienst: 'mail', icoon: Mail, uk: 'Пошта', nl: 'E-mail' },
  'cloud.tarasevych.com': { dienst: 'cloud', icoon: Cloud, uk: 'Хмарне сховище', nl: 'Cloudopslag' },
  'ai.tarasevych.com': { dienst: 'ai', icoon: Bot, uk: 'ШІ для вас', nl: 'AI voor u' },
  'id.tarasevych.com': { dienst: 'identity', icoon: Settings, uk: 'Обліковий запис', nl: 'Account' },
  'github.tarasevych.com': { dienst: 'github', icoon: Github, uk: 'GitHub', nl: 'GitHub' },
  'huis.tarasevych.com': { dienst: 'huis', icoon: HousePlug, uk: 'Розумний будинок', nl: 'Slim huis' },
  'mcp.tarasevych.com': { dienst: 'mcp', icoon: Cable, uk: 'Міст ШІ → сайт', nl: 'Brug AI → site' },
  'admin.tarasevych.com': { dienst: 'admin', icoon: ShieldCheck, uk: 'Адміністрування', nl: 'Beheer' },
  'api.tarasevych.com': { dienst: 'api', icoon: Network, uk: 'API та інтеграції', nl: 'API en integraties' },
};
/** Сайти ШІ: справжній знак виробника з бази логотипів (src/merk). Microsoft Copilot — власний ключ, до його появи знак Microsoft. */
const AI_SITES: Readonly<Record<string, { merk: string; naam: string; terugval?: string }>> = {
  'claude.ai': { merk: 'claude', naam: 'Claude' },
  'chatgpt.com': { merk: 'gpt', naam: 'ChatGPT' },
  'gemini.google.com': { merk: 'gemini', naam: 'Gemini' },
  'grok.com': { merk: 'grok', naam: 'Grok' },
  'copilot.microsoft.com': { merk: 'mscopilot', naam: 'Microsoft Copilot', terugval: 'microsoft' },
};

export function hostNaam(host: string, uk: boolean): string {
  const d = DIENSTEN[host];
  if (d) return uk ? d.uk : d.nl;
  return AI_SITES[host]?.naam ?? host;
}

function HostLogo({ host }: { host: string }): ReactNode {
  const d = DIENSTEN[host];
  if (d) { const I = d.icoon; return <span className='hs-logo is-dienst' data-accent={DIENST_ACCENT[d.dienst]} aria-hidden='true'><I /></span>; }
  const a = AI_SITES[host];
  if (a) return <span className='hs-logo is-merk' aria-hidden='true'><Merk merk={a.merk} naam={a.naam} maat={30} vorm='gliefje' terugval={a.terugval ? <Merk merk={a.terugval} maat={30} vorm='gliefje' /> : undefined} /></span>;
  return <span className='hs-logo is-dienst' aria-hidden='true'><Globe /></span>;
}

export type HostSchakelaarProps = {
  host: string;
  aan: boolean;
  uk: boolean;
  disabled?: boolean;
  onChange: (aan: boolean) => void;
  /** Ключ довідки (shared/hulp-register.ts); «?» з цим ключем стоїть у заголовку списку у файлі виклику. */
  hulp: string;
  /** Наявні атрибути для тестів (data-eo-prive-domein …) — ідуть на сам вмикач. */
  data?: Record<string, string>;
  /** Підказка: що станеться, якщо ввімкнути (наслідки, а не повтор назви). */
  uitleg?: string;
};

export default function HostSchakelaar({ host, aan, uk, disabled, onChange, hulp, data, uitleg }: HostSchakelaarProps) {
  const naam = hostNaam(host, uk);
  const d = DIENSTEN[host];
  // Колір сервісу на всьому рядку: увімкнений вмикач фарбується тим самим кольором, що й значок (а не чорним).
  return (
    <label className={`hs-rij${aan ? ' is-aan' : ''}`} title={uitleg} data-hs-host={host} data-accent={d ? DIENST_ACCENT[d.dienst] : undefined}>
      <HostLogo host={host} />
      <span className='hs-tekst'>
        <b>{naam}</b>
        <small>{host}</small>
      </span>
      <input type='checkbox' role='switch' className='hs-schakel' checked={aan} disabled={disabled}
        aria-label={`${naam} (${host})`} onChange={(e) => onChange(e.target.checked)} data-hulp={hulp} {...data} />
    </label>
  );
}
