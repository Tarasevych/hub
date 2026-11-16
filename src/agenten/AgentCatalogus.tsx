// BREEDTE-002 (15.11.2026, побажання власника): ai.*/agenten як КАТАЛОГ — одна презентаційна картка на кожен ШІ (піктограма, назва,
// одне речення «що це», де працює), одна головна кнопка «Підключити» і «Розгорнути». Розгортання відкриває під карткою подробиці
// саме цього агента: кроки, запасні шляхи (команди, конфіги), вимоги й чесні межі, перехід до прав і токенів.
// Межі безпеки не змінюються: кнопка лише відкриває офіційний шлях клієнта (OAuth через сайт, власна адреса /<агент>); доступ
// дає людина у вікні «Дозволити», за замовчуванням — лише її приватний простір.
// NL: catalogus — één presentatiekaart per AI met één hoofdknop «Koppelen» en «Uitklappen» voor de details van precies die agent.
import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, KeyRound, Monitor, Globe, SquareTerminal, Code2, Zap } from 'lucide-react';
import AgentLogo from './AgentLogo';
import { V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import { recept, type ReceptKnop } from './verbind-recepten';
import './agent-catalogus.css';

type Tr = (uk: string, nl: string) => string;
type Plek = 'browser' | 'pc' | 'terminal' | 'ide';

/** Één zin «wat is het» + waar het werkt. Alleen feiten uit verbind-recepten.ts en shared/connector-v2/agenten.ts. */
const PRESENTATIE: Record<AgentSlug, { uk: string; nl: string; plekken: Plek[] }> = {
  claude: { uk: 'Помічник Anthropic: веде розмову, пише й аналізує, працює з вашою поштою, файлами й нотатками.', nl: 'Assistent van Anthropic: voert gesprekken, schrijft en analyseert, werkt met uw e-mail, bestanden en notities.', plekken: ['browser', 'pc', 'terminal'] },
  gpt: { uk: 'ChatGPT від OpenAI у браузері: шукає й читає дані вашого простору просто в розмові.', nl: 'ChatGPT van OpenAI in de browser: zoekt en leest gegevens uit uw ruimte rechtstreeks in het gesprek.', plekken: ['browser'] },
  codex: { uk: 'Агент програмування OpenAI: розвиває вашу частину сайту, працює з кодом і завданнями.', nl: 'Programmeeragent van OpenAI: bouwt aan uw deel van de site, werkt met code en taken.', plekken: ['terminal', 'ide'] },
  grok: { uk: 'Моделі xAI через клієнти, що читають mcp.json.', nl: 'Modellen van xAI via clients die mcp.json lezen.', plekken: ['terminal', 'ide'] },
  gemini: { uk: 'Gemini CLI від Google: помічник у терміналі з доступом до вашого простору.', nl: 'Gemini CLI van Google: assistent in de terminal met toegang tot uw ruimte.', plekken: ['terminal'] },
  copilot: { uk: 'GitHub Copilot у VS Code: допомагає з кодом і бачить ваш простір.', nl: 'GitHub Copilot in VS Code: helpt met code en ziet uw ruimte.', plekken: ['ide'] },
  cursor: { uk: 'Редактор коду з ШІ: додається одним натисканням.', nl: 'Code-editor met AI: met één klik toegevoegd.', plekken: ['ide'] },
  antigravity: { uk: 'Середовище агентів Google для розробки: плагін або settings.json.', nl: 'Agentomgeving van Google voor ontwikkeling: plug-in of settings.json.', plekken: ['ide', 'terminal'] },
  autoclaw: { uk: 'Z.ai (GLM) з правничою перевіркою джерел.', nl: 'Z.ai (GLM) met juridische broncontrole.', plekken: ['browser', 'terminal'] },
  windsurf: { uk: 'Редактор Windsurf (Cascade): підключається через mcp_config.json.', nl: 'Windsurf-editor (Cascade): koppelt via mcp_config.json.', plekken: ['ide'] },
  cline: { uk: 'Розширення Cline і Roo Code у VS Code або Cursor: конфігурація streamableHttp.', nl: 'Cline- en Roo Code-extensie in VS Code of Cursor: streamableHttp-configuratie.', plekken: ['ide'] },
  devin: { uk: 'Автономний інженер Devin: підключається у вебналаштуваннях через OAuth.', nl: 'Autonome ontwikkelaar Devin: koppelt in de webinstellingen via OAuth.', plekken: ['browser', 'ide'] },
  opencode: { uk: 'OpenCode у терміналі й середовищі: одна команда чи opencode.json із OAuth.', nl: 'OpenCode in terminal en IDE: één opdracht of opencode.json met OAuth.', plekken: ['terminal', 'ide'] },
};

const PLEK: Record<Plek, { uk: string; nl: string; icoon: typeof Globe }> = {
  browser: { uk: 'Браузер', nl: 'Browser', icoon: Globe },
  pc: { uk: 'Застосунок на ПК', nl: 'App op de pc', icoon: Monitor },
  terminal: { uk: 'Термінал', nl: 'Terminal', icoon: SquareTerminal },
  ide: { uk: 'Редактор коду', nl: 'Code-editor', icoon: Code2 },
};

/** Wat de hoofdknop doet, in woorden — voor de tooltip en schermlezers. */
const hoofdUitleg = (k: ReceptKnop | undefined, naam: string, tr: Tr) => {
  if (!k) return tr(`Відкриє сторінку ${naam} у «Підключення ШІ».`, `Opent de pagina van ${naam} in «AI-koppelingen».`);
  if (k.soort === 'deeplink') return tr(`Відкриє ${naam} і запропонує додати ваш простір. Доступ підтверджуєте ви у вікні «Дозволити».`, `Opent ${naam} en stelt voor uw ruimte toe te voegen. U bevestigt de toegang zelf in het venster «Toestaan».`);
  if (k.soort === 'web') return tr(`Відкриє налаштування ${naam} у новій вкладці; нижче — що вставити. Доступ підтверджуєте ви у вікні «Дозволити».`, `Opent de instellingen van ${naam} in een nieuw tabblad; hieronder staat wat u invult. U bevestigt de toegang zelf in «Toestaan».`);
  return tr(`Скопіює ${k.soort === 'opdracht' ? 'команду' : 'налаштування'} для ${naam}; вставте у ${naam}. Під час першого звернення відкриється вікно «Дозволити».`, `Kopieert de ${k.soort === 'opdracht' ? 'opdracht' : 'instelling'} voor ${naam}; plak die in ${naam}. Bij het eerste gebruik opent het venster «Toestaan».`);
};

export interface AgentCatalogusProps {
  tr: Tr;
  hubUrl: (hash: string) => string;
  /** Aantal actieve werkruimtes per agent (alleen voor de statusregel). */
  actiefIn: (slug: AgentSlug) => number;
  kopieer: (tekst: string, labelUk: string, labelNl: string) => Promise<void> | void;
}

export default function AgentCatalogus({ tr, hubUrl, actiefIn, kopieer }: AgentCatalogusProps) {
  const [open, setOpen] = useState<AgentSlug | null>(null);
  const [gekopieerd, setGekopieerd] = useState<string>('');

  const kopieerKnop = async (sleutel: string, tekst: string, naam: string) => {
    await kopieer(tekst, naam, naam);
    setGekopieerd(sleutel);
    window.setTimeout(() => setGekopieerd((s) => (s === sleutel ? '' : s)), 2200);
  };

  return (
    <section className='agc' aria-labelledby='agc-titel' data-agent-catalogus='1'>
      <header className='agc-kop'>
        <h2 id='agc-titel'>{tr('Підключіть свій ШІ', 'Koppel uw AI')}</h2>
        <p>{tr('Одна кнопка — і помічник бачить ваш простір. Лише те, що ви дозволите; відкликати можна будь-коли.', 'Eén knop — en de assistent ziet uw ruimte. Alleen wat u toestaat; intrekken kan altijd.')}</p>
      </header>
      <ul className='agc-lijst'>
        {V2_AGENTEN.map((a) => {
          const r = recept(a.slug);
          const p = PRESENTATIE[a.slug];
          const hoofd = r.knoppen[0];
          const isOpen = open === a.slug;
          const actief = actiefIn(a.slug);
          const detailId = `agc-detail-${a.slug}`;
          const tipId = `agc-tip-${a.slug}`;
          const uitleg = hoofdUitleg(hoofd, a.naam, tr);
          const naOpen = () => setOpen(a.slug);
          const hoofdKnop = !hoofd ? (
            <a className='agc-hoofd' href={hubUrl(`agent/${a.slug}`)} aria-describedby={tipId}>{tr('Підключити', 'Koppelen')}</a>
          ) : hoofd.soort === 'deeplink' || hoofd.soort === 'web' ? (
            <a className='agc-hoofd' href={hoofd.href} target={hoofd.soort === 'web' ? '_blank' : undefined} rel='noopener noreferrer' onClick={naOpen} aria-describedby={tipId}>
              {tr('Підключити', 'Koppelen')}{hoofd.soort === 'web' ? <ExternalLink size={14} aria-hidden='true' /> : null}
            </a>
          ) : (
            <button type='button' className='agc-hoofd' onClick={() => { void kopieerKnop(`${a.slug}-0`, hoofd.kopieer || '', a.naam); naOpen(); }} aria-describedby={tipId}>
              {gekopieerd === `${a.slug}-0` ? <><Check size={15} aria-hidden='true' /> {tr('Скопійовано', 'Gekopieerd')}</> : tr('Підключити', 'Koppelen')}
            </button>
          );
          return (
            <li key={a.slug} className={`agc-kaart${isOpen ? ' is-open' : ''}`} data-agc={a.slug}>
              <div className='agc-hoofdrij'>
                <span className='agc-logo' aria-hidden='true'><AgentLogo agent={a.slug} naam={a.naam} size={44} /></span>
                <div className='agc-tekst'>
                  <h3>{a.naam}</h3>
                  <p>{tr(p.uk, p.nl)}</p>
                  <ul className='agc-plekken' aria-label={tr('Де працює', 'Waar het werkt')}>
                    {p.plekken.map((pl) => { const I = PLEK[pl].icoon; return <li key={pl}><I size={13} aria-hidden='true' />{tr(PLEK[pl].uk, PLEK[pl].nl)}</li>; })}
                    {hoofd?.soort === 'deeplink' ? <li className='agc-plek-snel'><Zap size={13} aria-hidden='true' />{tr('Один клік', 'Eén klik')}</li> : null}
                  </ul>
                </div>
                <div className='agc-acties'>
                  <span className={`agc-stand${actief ? ' is-actief' : ''}`}>{actief ? tr(`Працює в просторах: ${actief}`, `Actief in werkruimtes: ${actief}`) : tr('Ще не підключено', 'Nog niet gekoppeld')}</span>
                  <div className='agc-knoppen'>
                    {hoofdKnop}
                    <button type='button' className='agc-meer' aria-expanded={isOpen} aria-controls={detailId} onClick={() => setOpen(isOpen ? null : a.slug)}>
                      {isOpen ? tr('Згорнути', 'Inklappen') : tr('Розгорнути', 'Uitklappen')}<ChevronDown size={15} aria-hidden='true' />
                    </button>
                  </div>
                  <span className='agc-tip' role='tooltip' id={tipId}>{uitleg}</span>
                </div>
              </div>
              <div className='agc-detail' id={detailId} hidden={!isOpen}>
                <ol className='agc-stappen'>
                  {r.stappen.map((s, i) => <li key={i}>{tr(s[0], s[1])}</li>)}
                </ol>
                {r.knoppen.length ? (
                  <div className='agc-wegen'>
                    {r.knoppen.map((k, i) => {
                      const sleutel = `${a.slug}-${i}`;
                      return (
                        <div key={i} className='agc-weg'>
                          {k.kopieer ? <pre className='agc-code'>{k.kopieer}</pre> : null}
                          {k.href ? (
                            <a className='agc-tweede' href={k.href} target={k.soort === 'web' ? '_blank' : undefined} rel='noopener noreferrer'>{tr(k.label[0], k.label[1])}{k.soort === 'web' ? <ExternalLink size={13} aria-hidden='true' /> : null}</a>
                          ) : (
                            <button type='button' className='agc-tweede' onClick={() => void kopieerKnop(sleutel, k.kopieer || '', a.naam)}>
                              {gekopieerd === sleutel ? <Check size={14} aria-hidden='true' /> : <Copy size={14} aria-hidden='true' />} {gekopieerd === sleutel ? tr('Скопійовано', 'Gekopieerd') : tr(k.label[0], k.label[1])}
                            </button>
                          )}
                          {k.uitleg ? <small>{tr(k.uitleg[0], k.uitleg[1])}</small> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {r.vereist || r.grens ? (
                  <p className='agc-noot'>{r.vereist ? tr(r.vereist[0], r.vereist[1]) : ''}{r.vereist && r.grens ? ' ' : ''}{r.grens ? tr(r.grens[0], r.grens[1]) : ''}</p>
                ) : null}
                <a className='agc-rechten' href={hubUrl(`agent/${a.slug}`)}>
                  <KeyRound size={14} aria-hidden='true' /> {tr(`Права, токени й журнал ${a.naam}`, `Rechten, tokens en logboek van ${a.naam}`)}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
