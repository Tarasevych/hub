// Блок «ШІ для вас» та зведення дозволів ШІ поточного простору (hub.*/overzicht).
// Підтримує як стандартний вигляд швидких запитань до ШІ, так і огляд активних дозволів/пристроїв (weergave: 'toegang' при перенесенні з Бюро).
import { ArrowRight, Bot, CalendarPlus, Mail, PenLine, Search, ShieldCheck, type LucideIcon } from 'lucide-react';
import { STARTVRAGEN } from '../../../shared/ai-werkruimte';
import { haalAiToegangSamenvatting, useBron, type AiToegangSamenvatting } from '../gegevens';
import { regelsVoor, tr, type WidgetProps } from '../soorten';

const AI_KORT: Record<string, { uk: string; nl: string; Icoon: LucideIcon }> = {
  samenvatten: { uk: 'Пояснити текст', nl: 'Tekst uitleggen', Icoon: PenLine },
  'agenda-dag': { uk: 'Мій день', nl: 'Mijn dag', Icoon: CalendarPlus },
  zoeken: { uk: 'Пошук у просторі', nl: 'Zoeken in de ruimte', Icoon: Search },
  uitleg: { uk: 'Що вміє ШІ тут', nl: 'Wat AI hier kan', Icoon: Bot },
};

export function SysteemAi({ lang, acties, apiPlatform, item, kolommen, zichtbaar }: WidgetProps) {
  const toonToegang = item.inst?.weergave === 'toegang' || item.r >= 3;
  const toegang = useBron<AiToegangSamenvatting>((f) => haalAiToegangSamenvatting(f), null, zichtbaar && toonToegang);
  const vragen = Object.keys(AI_KORT)
    .map((id) => STARTVRAGEN.find((v) => v.id === id))
    .filter((v): v is (typeof STARTVRAGEN)[number] => Boolean(v))
    .slice(0, regelsVoor(item.r, kolommen, 1, 0, item.inst?.weergave === 'toegang' ? 2 : 4));

  const sam = toegang.waarde?.samenvatting;

  return (
    <div className='wb-ai' data-wb-ai-weergave={item.inst?.weergave === 'toegang' ? 'toegang' : 'standaard'}>
      {sam ? (
        <div className='wb-tellers' data-wb-ai-tellers='1'>
          <span>
            <strong>{sam.verbindingen}</strong>
            <small>{tr(lang, 'з’єднувачів', 'koppelingen')}</small>
          </span>
          <span>
            <strong>{sam.toestemmingen}</strong>
            <small>{tr(lang, 'дозволів', 'toestemmingen')}</small>
          </span>
          <span>
            <strong>{sam.apparatenVerbonden}/{sam.apparaten}</strong>
            <small>{tr(lang, 'пристроїв у мережі', 'apparaten verbonden')}</small>
          </span>
        </div>
      ) : null}
      <ul>
        {vragen.map((v) => {
          const k = AI_KORT[v.id];
          return (
            <li key={v.id} data-wb-ai-vraag={v.id}>
              <k.Icoon aria-hidden='true' />
              <span>
                <strong>{tr(lang, k.uk, k.nl)}</strong>
                <small>{tr(lang, v.tekst[0], v.tekst[1])}</small>
              </span>
            </li>
          );
        })}
      </ul>
      {apiPlatform ? null : (
        <small className='wb-ai-hint'>
          <Mail aria-hidden='true' />
          {tr(lang, 'ШІ потребує права «api-platform» — попросіть власника.', 'AI vraagt het recht «api-platform» — vraag het de eigenaar.')}
        </small>
      )}
      <div className='wb-rij-knoppen'>
        <button type='button' className='knop-primair' onClick={() => acties.dienst('ai', 'workspace')}>
          <Bot aria-hidden='true' />
          {tr(lang, 'Відкрити ШІ', 'AI openen')}
        </button>
        {apiPlatform ? (
          <button type='button' className='wb-alles' onClick={() => acties.dienst('mcp', 'agents')}>
            <ShieldCheck aria-hidden='true' />
            {tr(lang, 'Дозволи ШІ', 'AI-toestemmingen')}
            <ArrowRight aria-hidden='true' />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default SysteemAi;
