import { lazy, Suspense, useEffect } from 'react';
import { Bot } from 'lucide-react';
import ProductEmptyState from './ProductLegeToestand';
import { canonicalNavigationUrl, routeLang } from './canoniek-navigatie';
import { RichtingBand } from './weergave/Weergave';

import { aiVerbindingenNaar } from '../shared/ai-agent-bord';
import { V2_AGENTEN } from '../shared/connector-v2/agenten';
import AgentLogo from './agenten/AgentLogo';
import './agenten/agenten.css';

/** Werkgebied «ШІ для вас» (punt 13, 19.10.2026): startstaat uit echte feiten, chat, startvragen, alle hulpmiddelen. */
const AiWerkruimte = lazy(() => import('./AiWerkruimte'));
const AiEcosysteemPaneel = lazy(() => import('./ai-ecosysteem/AiEcosysteemPaneel'));

type Tr = (uk: string, nl: string) => string;
type Props = { tab: string; tr: Tr; userName: string; workspaceName: string; /** AI-02: alleen de eigenaar beheert de sleutelkluis (api.*); anderen gaan naar de hub. */ eigenaar?: boolean };

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

export default function AIServiceView({ tab, tr, eigenaar }: Props) {
  if (tab === 'verbindingen') return <NaarHub tr={tr} />;
  if (tab === 'agents' || tab === 'runs' || tab === 'workflows') return <AiOnderdeel tab={tab} tr={tr} />;
  // Etap 3: altijd zichtbaar in welke richting deze dienst werkt (site → AI), met een verwijzing naar de brug AI → site.
  const band = <div className='ai-richting'><RichtingBand richting='ai' uk={routeLang() !== 'nl'} /></div>;
  return (
    <Suspense fallback={<>{band}</>}>
      <AiWerkruimte tr={tr} eigenaar={eigenaar === true} band={band} geenSleutel={<GeenSleutel tr={tr} eigenaar={eigenaar === true} />} />
    </Suspense>
  );
}
