import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Blocks,
  Bot,
  Cpu,
  FolderLock,
  Layers,
  LayoutDashboard,
  MessageSquare,
  PlugZap,
  Server,
  Sparkles,
  Workflow,
  Wrench,
} from 'lucide-react';
import ProductEmptyState from './ProductLegeToestand';
import { canonicalNavigationUrl, routeLang, sharedRouteSnapshot, writeLocalTab } from './canoniek-navigatie';
import { RichtingBand } from './weergave/Weergave';

import { aiVerbindingenNaar } from '../shared/ai-agent-bord';
import { V2_AGENTEN } from '../shared/connector-v2/agenten';
import AgentLogo from './agenten/AgentLogo';
import { MaquetteAnkerRail, MaquetteHeld, type MaquetteAnkerItem, type MaquetteHeldStatistiek } from './maquette-kern';
import { useIsMaquette } from './thema/useThema';
import './agenten/agenten.css';
import './ai-werkruimte-maquette.css';

/** Werkgebied «ШІ для вас» (punt 13, 19.10.2026): startstaat uit echte feiten, chat, startvragen, alle hulpmiddelen. */
const AiWerkruimte = lazy(() => import('./AiWerkruimte'));
const AiEcosysteemPaneel = lazy(() => import('./ai-ecosysteem/AiEcosysteemPaneel'));

type Tr = (uk: string, nl: string) => string;
type Props = { tab: string; tr: Tr; userName: string; workspaceName: string; /** AI-02: alleen de eigenaar beheert de sleutelkluis (api.*); anderen gaan naar de hub. */ eigenaar?: boolean };
type AiWerkTab = 'workspace' | 'agents' | 'runs' | 'workflows';

const AI_MODAAL_SELECTOR =
  "[data-mq-laag-open='1'], .venster-achter, .venster:not([hidden]), .modal-backdrop, dialog[open], [role='dialog'][aria-modal='true']";

const AI_HELD_TEKSTEN: Record<AiWerkTab, {
  boven: readonly [string, string];
  voor: readonly [string, string];
  cursief: readonly [string, string];
  beschrijving: readonly [string, string];
}> = {
  workspace: {
    boven: ['ПРОСТІР ШТУЧНОГО ІНТЕЛЕКТУ · AI.TARASEVYCH.COM', 'AI-RUIMTE · AI.TARASEVYCH.COM'],
    voor: ['Робоча бесіда та', 'Werkgesprek en'],
    cursief: ['живі інструменти.', 'levende hulpmiddelen.'],
    beschrijving: [
      'Ваш особистий помічник на власному сервері: ставте запитання у бесіді, обирайте готові підказки, додавайте спільний контекст між завданнями та керуйте дозволеними службами.',
      'Uw persoonlijke assistent op uw eigen server: stel vragen in het gesprek, kies kant-en-klare startvragen, stuur gedeelde werkcontext mee en bedien vrijgegeven diensten.',
    ],
  },
  agents: {
    boven: ['АГЕНТНІ ПРОСТОРИ · AI.TARASEVYCH.COM', 'AGENTWERKRUIMTES · AI.TARASEVYCH.COM'],
    voor: ['Ізольовані межі для', 'Geïsoleerde grenzen voor'],
    cursief: ['кожного агента.', 'elke agent.'],
    beschrijving: [
      'Визначайте окремі середовища комп’ютера, оглядача чи сервера з чітким переліком дозволених файлів і служб та приєднуйте потрібних помічників у межах вашого простору.',
      'Bepaal afzonderlijke omgevingen voor computer, browser of server met strikte grenzen voor bestanden en diensten, en koppel uw assistenten veilig binnen uw ruimte.',
    ],
  },
  runs: {
    boven: ['ПРОЦЕСИ ТА СПІВПРАЦЯ · AI.TARASEVYCH.COM', 'PROCESSEN EN SAMENWERKING · AI.TARASEVYCH.COM'],
    voor: ['Спільний контекст і', 'Gedeelde context en'],
    cursief: ['передача завдань.', 'taakoverdracht.'],
    beschrijving: [
      'Зберігайте напрацьовані відомості між окремими завданнями й координуйте послідовну передачу роботи від одного агента до іншого без втрати змісту.',
      'Bewaar opgebouwde inzichten tussen afzonderlijke taken en stem de overdracht van werk tussen agenten nauwkeurig af zonder contextverlies.',
    ],
  },
  workflows: {
    boven: ['СЦЕНАРІЇ ТА САМОСТІЙНІСТЬ · AI.TARASEVYCH.COM', 'WERKSTROMEN EN ZELFBEHEER · AI.TARASEVYCH.COM'],
    voor: ['Власні сценарії та', 'Eigen werkstromen en'],
    cursief: ['відкрита основа.', 'open fundament.'],
    beschrijving: [
      'Налаштовуйте швидкі наскрізні потоки дій між службами вашого облікового запису та керуйте пакетом для незалежного розгортання на власному обладнанні.',
      'Richt doorlopende werkstromen in tussen de diensten van uw account en beheer het open pakket voor zelfstandige plaatsing op eigen apparatuur.',
    ],
  },
};

// An empty screen has to say what the next step is. Both routes go through the
// existing canonical navigation: an in-app hop on the technical host, a real
// navigation on the production subdomains.
export const openIntegrations = () => {
  const lang = routeLang();
  location.assign(canonicalNavigationUrl('api', 'verbindingen', lang));
};
/** G2: «Відкрити сховище ключів» moet naar de kluis (api.*\/vault), niet naar de koppelingen. Optioneel met ?doel=... voorgeselecteerd. */
export const openVault = (doel?: unknown) => {
  const lang = routeLang();
  const basis = canonicalNavigationUrl('api', 'vault', lang);
  const q = typeof doel === 'string' && /^[a-z0-9-]+$/.test(doel)
    ? `${basis.includes('?') ? '&' : '?'}doel=${encodeURIComponent(doel)}`
    : '';
  location.assign(`${basis}${q}`);
};

/** Adres van de hub «Підключення ШІ» (mcp.*\/agents) met tabblad. */
export const hubUrl = (hubTab: string) => `${canonicalNavigationUrl('mcp', 'agents', routeLang()).replace(/#.*$/, '')}#${hubTab}`;

/**
 * ai.*\/verbindingen («Підключення ШІ», 19.10.2026): alles over AI-toegang staat nu op ÉÉN plek, de hub op mcp.*\/agents. Dit adres
 * blijft werken en leidt erheen: #bord (standaard) → #ai, #connectors → #connectors, #tech → #technisch. De componenten van de
 * vroegere hub (VerbindingenHub, AgentBord, ConnectorsTab, TechVerbindingen) leven daar verder.
 */
function NaarHub({ tr }: { tr: Tr }) {
  const doel = hubUrl(aiVerbindingenNaar(typeof location !== 'undefined' ? location.hash : ''));
  useEffect(() => { location.replace(doel); }, [doel]);
  return <p className='ai-naar-hub' data-naar-hub={doel}><a href={doel}>{tr('Підключення ШІ тепер в одному місці — відкрити', 'AI-koppelingen staan nu op één plek — openen')}</a></p>;
}

/** Volwaardige schermen voor agents / runs / workflows binnen het open AI-ecosysteem (11.11.2026). */
function AiOnderdeel({ tab, tr }: { tab: 'agents' | 'runs' | 'workflows'; tr: Tr }) {
  const uk = routeLang() !== 'nl';
  const band = <div className='ai-richting'><RichtingBand richting='ai' uk={uk} /></div>;
  return (
    <>
      {band}
      {tab === 'agents' ? (
        <section className='ag ag-ai-ingangen' data-ai-agent-ingangen='1' aria-label={tr('Підключити окремий ШІ', 'Eén AI koppelen')}>
          <ul className='ag-agent-ingangen'>
            {V2_AGENTEN.map((a) => (
              <li key={a.slug}><a className='ag-kaart ag-agent-ingang' href={hubUrl(`agent/${a.slug}`)} data-agent-ingang={a.slug}>
                <AgentLogo agent={a.slug} naam={a.naam} size={26} /><b>{tr(`Підключити ${a.naam}`, `${a.naam} koppelen`)}</b>
              </a></li>
            ))}
          </ul>
        </section>
      ) : null}
      <Suspense fallback={null}>
        <AiEcosysteemPaneel modus={tab} tr={tr} band={null} hubUrl={hubUrl} />
      </Suspense>
    </>
  );
}

/**
 * «Ключа моделі ще немає»: dezelfde lege staat als voorheen, met de volgende stap per rol (AI-02). De eigenaar beheert de
 * kluis op api.*; iedere andere mens koppelt zijn eigen AI (Claude, Grok…) via een connector in de hub. Het werkgebied
 * gebruikt dit blok ook binnen de chat, zodat er nergens twee verschillende antwoorden op dezelfde vraag staan.
 */
function GeenSleutel({ tr, eigenaar }: { tr: Tr; eigenaar: boolean }) {
  return eigenaar ? <ProductEmptyState
    icon={Bot}
    title={tr('ШІ для вас', 'AI voor u')}
    description={tr(
      'Додайте свій ключ Anthropic у сховищі секретів (API → Сховище секретів), і тут з’явиться чат, який керує вашими пристроями.',
      'Voeg uw eigen Anthropic-sleutel toe in de geheimenkluis (API → Geheimenkluis); dan verschijnt hier een chat die uw apparaten bedient.',
    )}
    actionLabel={tr('Відкрити сховище', 'Kluis openen')}
    onAction={openVault}
  /> : <ProductEmptyState
    icon={Bot}
    title={tr('ШІ для вас', 'AI voor u')}
    description={tr(
      'Чат на сайті потребує ключа Anthropic, який додає власник сервера. Щоб ШІ (Claude, ChatGPT, Grok…) працював із вашими даними вже зараз, підключіть його через конектор у хабі «Підключення ШІ».',
      'De chat op de site heeft een Anthropic-sleutel nodig die de eigenaar van de server toevoegt. Om een AI (Claude, ChatGPT, Grok…) nu al met uw gegevens te laten werken, koppelt u hem via een connector in de hub «AI-koppelingen».',
    )}
    actionLabel={tr('Підключити ШІ', 'AI koppelen')}
    onAction={() => location.assign(hubUrl('connectors'))}
  />;
}

function AIServiceInhoud({ tab, tr, eigenaar }: { tab: string; tr: Tr; eigenaar?: boolean }) {
  const isMaquette = useIsMaquette();
  const [laagOpen, setLaagOpen] = useState(false);
  const [werkWeergave, setWerkWeergave] = useState<'werk' | 'middelen'>('werk');
  const [onderdeelAnker, setOnderdeelAnker] = useState<string>('');
  const lang: 'uk' | 'nl' = routeLang() === 'nl' ? 'nl' : 'uk';
  const uk = lang !== 'nl';
  const isOnderdeel = tab === 'agents' || tab === 'runs' || tab === 'workflows';
  const actieveTab: AiWerkTab = isOnderdeel ? tab : 'workspace';

  const gaNaarAiTab = useCallback((doel: string) => {
    const huidigeTaal = routeLang();
    if (doel === 'verbindingen') {
      location.assign(hubUrl('ai'));
      return;
    }
    if (sharedRouteSnapshot().service === 'ai') {
      writeLocalTab('ai', doel, huidigeTaal);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    location.assign(canonicalNavigationUrl('ai', doel, huidigeTaal));
  }, []);

  const stuurWerkWeergave = useCallback(
    (modus: 'werk' | 'middelen') => {
      setWerkWeergave(modus);
      if (actieveTab !== 'workspace') {
        gaNaarAiTab('workspace');
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('tsv:ai-werk-weergave', { detail: modus }));
        }, 60);
        return;
      }
      window.dispatchEvent(new CustomEvent('tsv:ai-werk-weergave', { detail: modus }));
      document.querySelector<HTMLElement>('.aiw')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [actieveTab, gaNaarAiTab],
  );

  const springNaarSectie = useCallback((ankerId: string, selector: string) => {
    setOnderdeelAnker(ankerId);
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    setOnderdeelAnker('');
  }, [actieveTab]);

  useEffect(() => {
    const bijStand = (event: Event) => {
      const detail = (event as CustomEvent<'werk' | 'middelen'>).detail;
      if (detail === 'werk' || detail === 'middelen') {
        setWerkWeergave(detail);
      }
    };
    window.addEventListener('tsv:ai-werk-stand', bijStand);
    return () => window.removeEventListener('tsv:ai-werk-stand', bijStand);
  }, []);

  useEffect(() => {
    if (!isMaquette || typeof document === 'undefined') {
      setLaagOpen(false);
      return;
    }
    const controleer = () => {
      setLaagOpen(Boolean(document.querySelector(AI_MODAAL_SELECTOR)));
    };
    controleer();
    const wortel = document.documentElement ?? document.body;
    if (!wortel || typeof MutationObserver !== 'function') return;
    const waarnemer = new MutationObserver(controleer);
    waarnemer.observe(wortel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'aria-modal', 'data-mq-laag-open'],
    });
    return () => waarnemer.disconnect();
  }, [isMaquette, tab]);

  const statistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(
    () => [
      { waarde: V2_AGENTEN.length, label: tr('Зовнішніх агентів', 'Externe agenten') },
      { waarde: 4, label: tr('Робочі розділи', 'Werkonderdelen') },
      { waarde: eigenaar === true ? tr('Власник', 'Eigenaar') : tr('Учасник', 'Deelnemer'), label: tr('Рівень доступу', 'Toegangsniveau') },
      { waarde: tr('Ізольовано', 'Geïsoleerd'), label: tr('Межі простору', 'Ruimtegrenzen') },
    ],
    [eigenaar, tr],
  );

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(() => {
    if (actieveTab === 'agents') {
      return [
        {
          id: 'agents',
          label: tr('Агенти та простори', 'Agenten en werkruimtes'),
          icoon: Cpu,
          soort: 'groep',
          openStandaard: true,
          kiesbaar: false,
          badge: V2_AGENTEN.length,
          actiefBij: ['agents-ingangen', 'agents-tools', 'agents-ruimtes'],
          kinderen: [
            {
              id: 'agents-ingangen',
              label: tr('Швидкі входи до агентів', 'Directe agentingangen'),
              icoon: PlugZap,
              onActie: () => springNaarSectie('agents-ingangen', "[data-ai-agent-ingangen='1']"),
            },
            {
              id: 'agents-tools',
              label: tr('Codex, Claude та інші', 'Codex, Claude en andere'),
              icoon: Cpu,
              onActie: () => springNaarSectie('agents-tools', "[data-aie-agent-overzicht='1'], [data-aie-kop='agents']"),
            },
            {
              id: 'agents-ruimtes',
              label: tr('Ізольовані простори', 'Geïsoleerde werkruimtes'),
              icoon: FolderLock,
              onActie: () => springNaarSectie('agents-ruimtes', "[data-aie-werkruimtes-sectie='1']"),
            },
          ],
        },
        { id: 'workspace', label: tr('Робоча область', 'Werkgebied'), icoon: LayoutDashboard },
        { id: 'runs', label: tr('Процеси', 'Processen'), icoon: ArrowRightLeft },
        { id: 'workflows', label: tr('Сценарії', 'Werkstromen'), icoon: Workflow },
        { id: 'verbindingen', label: tr('Підключення ШІ', 'AI-koppelingen'), icoon: PlugZap },
      ];
    }

    if (actieveTab === 'runs') {
      return [
        {
          id: 'runs',
          label: tr('Процеси та контекст', 'Processen en context'),
          icoon: ArrowRightLeft,
          soort: 'groep',
          openStandaard: true,
          kiesbaar: false,
          actiefBij: ['runs-context', 'runs-overdracht'],
          kinderen: [
            {
              id: 'runs-context',
              label: tr('Спільний контекст', 'Gedeelde werkcontext'),
              icoon: Layers,
              onActie: () => springNaarSectie('runs-context', "[data-aie-context-sectie='1']"),
            },
            {
              id: 'runs-overdracht',
              label: tr('Передача завдань', 'Taakoverdracht'),
              icoon: ArrowRightLeft,
              onActie: () => springNaarSectie('runs-overdracht', "[data-aie-overdrachten-sectie='1']"),
            },
          ],
        },
        { id: 'workspace', label: tr('Робоча область', 'Werkgebied'), icoon: LayoutDashboard },
        { id: 'agents', label: tr('Агенти', 'Agenten'), icoon: Cpu, badge: V2_AGENTEN.length },
        { id: 'workflows', label: tr('Сценарії', 'Werkstromen'), icoon: Workflow },
        { id: 'verbindingen', label: tr('Підключення ШІ', 'AI-koppelingen'), icoon: PlugZap },
      ];
    }

    if (actieveTab === 'workflows') {
      return [
        {
          id: 'workflows',
          label: tr('Сценарії та основа', 'Werkstromen en basis'),
          icoon: Workflow,
          soort: 'groep',
          openStandaard: true,
          kiesbaar: false,
          actiefBij: ['workflows-uitbreiding', 'workflows-zelfhost'],
          kinderen: [
            {
              id: 'workflows-uitbreiding',
              label: tr('Розширення простору', 'Ruimte-uitbreidingen'),
              icoon: Blocks,
              onActie: () => springNaarSectie('workflows-uitbreiding', "[data-aie-uitbreidingen-sectie='1']"),
            },
            {
              id: 'workflows-zelfhost',
              label: tr('Власне обладнання', 'Eigen apparatuur'),
              icoon: Server,
              onActie: () => springNaarSectie('workflows-zelfhost', "[data-aie-zelf-host-sectie='1']"),
            },
          ],
        },
        { id: 'workspace', label: tr('Робоча область', 'Werkgebied'), icoon: LayoutDashboard },
        { id: 'agents', label: tr('Агенти', 'Agenten'), icoon: Cpu, badge: V2_AGENTEN.length },
        { id: 'runs', label: tr('Процеси', 'Processen'), icoon: ArrowRightLeft },
        { id: 'verbindingen', label: tr('Підключення ШІ', 'AI-koppelingen'), icoon: PlugZap },
      ];
    }

    return [
      {
        id: 'ai-voor-u',
        label: tr('ШІ для вас', 'AI voor u'),
        icoon: Sparkles,
        soort: 'groep',
        openStandaard: true,
        kiesbaar: false,
        actiefBij: ['werk-werk', 'werk-middelen'],
        kinderen: [
          {
            id: 'werk-werk',
            label: tr('Робота', 'Werken'),
            icoon: MessageSquare,
            onActie: () => stuurWerkWeergave('werk'),
          },
          {
            id: 'werk-middelen',
            label: tr('Усі інструменти', 'Alle hulpmiddelen'),
            icoon: Wrench,
            onActie: () => stuurWerkWeergave('middelen'),
          },
        ],
      },
      {
        id: 'workspace',
        label: tr('Робоча область', 'Werkgebied'),
        icoon: LayoutDashboard,
        onActie: () => stuurWerkWeergave('werk'),
      },
      { id: 'agents', label: tr('Агенти', 'Agenten'), icoon: Cpu, badge: V2_AGENTEN.length },
      { id: 'runs', label: tr('Процеси', 'Processen'), icoon: ArrowRightLeft },
      { id: 'workflows', label: tr('Сценарії', 'Werkstromen'), icoon: Workflow },
      { id: 'verbindingen', label: tr('Підключення ШІ', 'AI-koppelingen'), icoon: PlugZap },
    ];
  }, [actieveTab, springNaarSectie, stuurWerkWeergave, tr]);

  const actiefAnker =
    actieveTab === 'workspace'
      ? (werkWeergave === 'middelen' ? 'werk-middelen' : 'werk-werk')
      : (onderdeelAnker || actieveTab);

  if (!isMaquette) {
    if (tab === 'agents' || tab === 'runs' || tab === 'workflows') return <AiOnderdeel tab={tab} tr={tr} />;
    // Etap 3: altijd zichtbaar in welke richting deze dienst werkt (site → AI), met een verwijzing naar de brug AI → site.
    const band = <div className='ai-richting'><RichtingBand richting='ai' uk={uk} /></div>;
    return (
      <Suspense fallback={<>{band}</>}>
        <AiWerkruimte tr={tr} eigenaar={eigenaar === true} band={band} geenSleutel={<GeenSleutel tr={tr} eigenaar={eigenaar === true} />} />
      </Suspense>
    );
  }

  const held = AI_HELD_TEKSTEN[actieveTab];
  const primair =
    actieveTab === 'workspace'
      ? { label: tr('Агенти та простори', 'Agenten en werkruimtes'), onClick: () => gaNaarAiTab('agents') }
      : { label: tr('До робочої бесіди', 'Naar het werkgesprek'), onClick: () => gaNaarAiTab('workspace') };
  const secundair =
    actieveTab === 'agents'
      ? { label: tr('Процеси та передачі', 'Processen en overdracht'), onClick: () => gaNaarAiTab('runs') }
      : actieveTab === 'runs'
        ? { label: tr('Сценарії та випуск', 'Werkstromen en uitrol'), onClick: () => gaNaarAiTab('workflows') }
        : { label: tr('Осередок підключень', 'Koppelcentrum'), onClick: () => location.assign(hubUrl('ai')) };

  const band = <div className='ai-richting'><RichtingBand richting='ai' uk={uk} /></div>;

  return (
    <div className='mq-schil ai-maquette-wikkel' data-mq-dienst='ai'>
      <MaquetteHeld
        key={`ai-held-${actieveTab}`}
        id='ai-maquette-held'
        dienst='ai'
        lang={lang}
        modus={actieveTab === 'workspace' ? 'compact' : 'volledig'}
        opslagSleutel={`ai-${actieveTab}`}
        bovenregel={tr(held.boven[0], held.boven[1])}
        titelVoor={tr(held.voor[0], held.voor[1])}
        titelCursief={held.cursief ? tr(held.cursief[0], held.cursief[1]) : ''}
        beschrijving={tr(held.beschrijving[0], held.beschrijving[1])}
        statistieken={statistieken}
        primair={primair}
        secundair={secundair}
      />
      <div className='ai-maquette-inhoud'>
        {isOnderdeel ? (
          <AiOnderdeel tab={tab} tr={tr} />
        ) : (
          <Suspense fallback={<>{band}</>}>
            <AiWerkruimte tr={tr} eigenaar={eigenaar === true} band={band} geenSleutel={<GeenSleutel tr={tr} eigenaar={eigenaar === true} />} />
          </Suspense>
        )}
      </div>
      {!laagOpen ? (
        <MaquetteAnkerRail
          lang={lang}
          opslagSleutel='ai-anker'
          titel={tr('Навігація', 'Navigatie')}
          ondertitel={tr('Перетягніть до краю', 'Sleep naar een rand')}
          items={ankerItems}
          actief={actiefAnker}
          onKies={gaNaarAiTab}
        />
      ) : null}
    </div>
  );
}

export default function AIServiceView({ tab, tr, eigenaar }: Props) {
  if (tab === 'verbindingen') return <NaarHub tr={tr} />;
  return <AIServiceInhoud tab={tab} tr={tr} eigenaar={eigenaar} />;
}
