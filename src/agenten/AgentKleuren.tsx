// «Колір агента»: welke kleur hoort bij welke AI (opdracht eigenaar 20.10.2026).
//
// Waarom hier: de markering in het browsertabblad zegt sinds extensie 0.6.2 WIE er nu leest, en de rand krijgt de kleur van
// die agent. De kleur hoort bij de GEBRUIKER (niet bij een tabblad, niet bij een koppeling) en geldt daarom overal tegelijk:
// de rand in de pagina, de badge op het pictogram van de extensie en deze lijst.
//
// Het palet is HET palet van de site (shared/menu-model.ts → ACCENT_KLEUREN, 14 accenten, al op contrast gecontroleerd in
// licht en donker). Er is bewust GEEN vrije kleurkiezer: een eigen hexwaarde zou in een van de twee thema's onleesbaar
// kunnen worden. «Стандарт» zet de kleur terug op het standaardaccent van die agent (shared/markering-agenten.ts).
// Logo's komen uit het ene merkregister (src/merk/) via AgentLogo.
import { useEffect, useState } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import AgentLogo from './AgentLogo';
import { ACCENTEN, ACCENT_KLEUREN, type Accent } from '../../shared/menu-model';
import { V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import { AGENT_ACCENT, MARKERING_STAART_MS } from '../../shared/markering-agenten';

type Rij = { agent: AgentSlug; accent: Accent; standaard: boolean };
const naamVan = (slug: AgentSlug) => V2_AGENTEN.find((a) => a.slug === slug)?.naam ?? slug;

/** `blok` (INTEG-001, 03.11.2026): als eigen blok op «Розширення браузера» (.ag-blok met kop, één zin en de lijst). Zonder `blok`
 *  blijft de oude weergave, zoals in het uitklapvak op de pagina van één agent (AgentPagina, met een eigen <summary>). */
export default function AgentKleuren({ tr, blok = false }: { tr: Tr; blok?: boolean }) {
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [bezig, setBezig] = useState<AgentSlug | ''>('');
  const [fout, setFout] = useState('');

  const laad = async () => {
    try {
      const r = await api.post('/api/owner/agents/kleuren', sessionBody());
      const lijst = (r.data as { kleuren?: Rij[] } | undefined)?.kleuren;
      setRijen(Array.isArray(lijst) ? lijst : V2_AGENTEN.map((a) => ({ agent: a.slug, accent: AGENT_ACCENT[a.slug], standaard: true })));
    } catch { setRijen(V2_AGENTEN.map((a) => ({ agent: a.slug, accent: AGENT_ACCENT[a.slug], standaard: true }))); }
  };
  useEffect(() => { void laad(); }, []);

  const zet = async (agent: AgentSlug, accent: Accent | null) => {
    setBezig(agent); setFout('');
    try {
      const r = await api.post('/api/owner/agents/kleuren/zet', { ...sessionBody(), agent, accent });
      const lijst = (r.data as { kleuren?: Rij[] } | undefined)?.kleuren;
      if (Array.isArray(lijst)) setRijen(lijst);
    } catch {
      setFout(tr('Колір не збережено — спробуйте ще раз.', 'De kleur is niet opgeslagen — probeer het nog eens.'));
    } finally { setBezig(''); }
  };

  if (!rijen) return null;
  const sec = Math.round(MARKERING_STAART_MS / 1000);
  // Eén return voor beide weergaven: de kop staat in de bron vóór de knoppen, zodat de zoekcatalogus (scripts/zoek-ui-catalogus.mjs)
  // «Стандарт» bij «Колір агента» blijft plaatsen.
  return (
    <section className={blok ? 'ag-blok ag-agentkleuren' : 'ag-ext-sectie ag-agentkleuren'} data-ext-sectie='agent-kleuren' data-ag-blok={blok ? 'agent-kleuren' : undefined} aria-labelledby='ag-agentkleuren-kop'>
      {blok ? (
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='ag-agentkleuren-kop'><Palette aria-hidden='true' /> {tr('Колір агента', 'Kleur per agent')}</h3>
          <p className='ag-blok-uitleg'>{tr('Коли ШІ читає або діє у вкладці, сторінка отримує обрамлення цього кольору з назвою агента та його дією.', 'Als een AI in een tabblad leest of handelt, krijgt die pagina een rand in deze kleur met de naam van de agent en wat hij doet.')}</p>
        </header>
      ) : <h3 id='ag-agentkleuren-kop'><Palette aria-hidden='true' /> {tr('Колір агента', 'Kleur per agent')}</h3>}
      {blok ? (
        <p className='ag2-noot'>{tr(`Обрамлення зникає приблизно через ${sec} с після останньої дії. Колір зберігається на вас і діє також у значку розширення.`,
          `De rand verdwijnt ongeveer ${sec} s na de laatste actie. De kleur hoort bij u en geldt ook voor de badge van de extensie.`)}</p>
      ) : (
        <p className='ag-ext-uitleg'>
          {tr(`Коли ШІ читає або діє у вкладці, сторінка отримує обрамлення цього кольору й підпис із назвою агента та його дією. Обрамлення зникає приблизно через ${sec} с після останньої дії. Колір зберігається на вас і діє також у значку розширення.`,
            `Als een AI in een tabblad leest of handelt, krijgt die pagina een rand in deze kleur met de naam van de agent en wat hij doet. De rand verdwijnt ongeveer ${sec} s na de laatste actie. De kleur hoort bij u en geldt ook voor de badge van de extensie.`)}
        </p>
      )}
      {fout ? <p className={blok ? 'ag-melding ag-melding-fout' : 'ag-ext-regel'} role='alert' data-kleur-fout='1'>{fout}</p> : null}
      <ul className='ag-kleur-lijst' data-lijst='agent-kleuren'>
        {rijen.map((rij) => (
          <li key={rij.agent} className='ag-kaart ag-kleur-rij' data-agent={rij.agent} data-accent={rij.accent} data-standaard={rij.standaard ? '1' : '0'}>
            <span className='ag-kleur-wie'>
              <AgentLogo agent={rij.agent} naam={naamVan(rij.agent)} size={24} />
              <b>{naamVan(rij.agent)}</b>
              <i className='ag-kleur-staal' aria-hidden='true' style={{ background: ACCENT_KLEUREN[rij.accent].licht.hoofd }} />
            </span>
            <span className='ag-kleur-keuzes' role='group' aria-label={tr(`Колір для ${naamVan(rij.agent)}`, `Kleur voor ${naamVan(rij.agent)}`)}>
              {ACCENTEN.map((acc) => (
                <button key={acc} type='button' className='ag-kleur-knop' data-accent={acc} aria-pressed={rij.accent === acc}
                  disabled={bezig === rij.agent} onClick={() => void zet(rij.agent, acc)}
                  title={`${naamVan(rij.agent)} · ${acc}`} aria-label={`${naamVan(rij.agent)} · ${acc}`}
                  style={{ background: ACCENT_KLEUREN[acc].licht.hoofd }} />
              ))}
              <button type='button' className='ag-knop ag-kleur-terug' data-kleur-standaard='1' disabled={bezig === rij.agent || rij.standaard}
                onClick={() => void zet(rij.agent, null)}>
                <RotateCcw size={14} aria-hidden='true' />{tr('Стандарт', 'Standaard')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
