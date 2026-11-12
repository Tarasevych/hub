// Gebruikersschermen voor het open AI-ecosysteem van Mijn Ruimte (ai.tarasevych.com, 11.11.2026):
//   • modus === 'agents'    : geïsoleerde agent-werkruimtes (computer · browser · server, begrensde bestanden/diensten)
//                             + directe koppeling van OpenAI Codex, Anthropic Claude en alle overige AI-agenten;
//   • modus === 'runs'      : gedeelde werkcontext tussen taken/toepassingen + samenwerking & taakoverdracht tussen agenten;
//   • modus === 'workflows' : aanpassing en uitbreiding van het eigen deel van de site binnen de accountruimte
//                             + volledig open pakket voor zelfstandige uitrol op eigen apparatuur.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Blocks, Copy, Cpu, FolderLock, Globe, Layers, Server, ShieldAlert } from 'lucide-react';
import ProductEmptyState from '../ProductLegeToestand';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { foutCode, foutTekst, isRechtFout, RECHT_UITLEG } from '../agenten/fouten';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { RUIMTE_NAAM, type AiRuimte } from '../../shared/ai-ruimte';
import {
  bouwZelfHostPakket,
  STANDAARD_WERKRUIMTE_SJABLONEN,
  type AgentBronnen,
  type AgentOmgevingId,
  type AiAgentOverdracht,
  type AiAgentWerkruimte,
  type AiGedeeldeContextItem,
  type AiRuimteUitbreiding,
  type OverdrachtStatus,
  type UitbreidingSoort,
  type WerkruimteSjabloon,
  type ZelfHostPakket,
} from '../../shared/ai-ecosysteem';
import AgentLogo from '../agenten/AgentLogo';
import './ai-ecosysteem.css';

type Tr = (uk: string, nl: string) => string;

interface OverzichtAntwoord {
  ruimte: AiRuimte;
  werkruimtes: AiAgentWerkruimte[];
  contextItems: AiGedeeldeContextItem[];
  overdrachten: AiAgentOverdracht[];
  uitbreidingen: AiRuimteUitbreiding[];
}

const sessieLichaam = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

const BRON_LABELS: ReadonlyArray<{ sleutel: keyof AgentBronnen; uk: string; nl: string; alleenPrive?: boolean }> = [
  { sleutel: 'bestanden', uk: 'Файли', nl: 'Bestanden' },
  { sleutel: 'github', uk: 'GitHub', nl: 'GitHub', alleenPrive: true },
  { sleutel: 'bord', uk: 'Дошка та нотатки', nl: 'Bord en notities', alleenPrive: true },
  { sleutel: 'schijf', uk: 'Хмарний Диск', nl: 'Cloudschijf', alleenPrive: true },
  { sleutel: 'mail', uk: 'Пошта', nl: 'E-mail', alleenPrive: true },
  { sleutel: 'agenda', uk: 'Календар', nl: 'Agenda', alleenPrive: true },
  { sleutel: 'externeDiensten', uk: 'Зовнішні служби', nl: 'Externe diensten' },
];

const DIENST_KEUZES: ReadonlyArray<{ id: string; uk: string; nl: string }> = [
  { id: 'ai', uk: 'ШІ', nl: 'AI' },
  { id: 'hub', uk: 'Огляд', nl: 'Hub' },
  { id: 'mail', uk: 'Пошта', nl: 'E-mail' },
  { id: 'cloud', uk: 'Хмара й календар', nl: 'Cloud en agenda' },
  { id: 'github', uk: 'GitHub', nl: 'GitHub' },
  { id: 'mcp', uk: 'З’єднувачі', nl: 'Koppelingen' },
];

const STATUS_LABELS: Record<OverdrachtStatus, { uk: string; nl: string }> = {
  open: { uk: 'Відкрито', nl: 'Open' },
  bezig: { uk: 'Виконується', nl: 'Bezig' },
  voltooid: { uk: 'Завершено', nl: 'Voltooid' },
  geannuleerd: { uk: 'Скасовано', nl: 'Geannuleerd' },
};

const SOORT_LABELS: Record<UitbreidingSoort, { uk: string; nl: string }> = {
  systeem_brug: { uk: 'Системний міст (рівень ОС у вебзастосунку)', nl: 'Systeembrug (OS-niveau in webtoepassing)' },
  werkstroom: { uk: 'Наскрізний робочий потік між службами', nl: 'Doorlopende werkstroom tussen diensten' },
  paneel_actie: { uk: 'Швидка дія в просторі користувача', nl: 'Snelle actie in gebruikersruimte' },
};

export interface ContextKiezerProps {
  tr: Tr;
  actieveWerkruimteId: string;
  onWerkruimteId: (id: string) => void;
  gekozenContextSleutels: string[];
  onContextSleutels: (sleutels: string[]) => void;
  onKiesStartVraag?: (vraag: string) => void;
  hubUrl: (hash: string) => string;
}

/**
 * Compacte balk boven de chat op ai.tarasevych.com/werkgebied: verenigt modellen en agentdiensten in de huidige ruimte,
 * laat een geïsoleerde agent-werkruimte kiezen en koppelt gedeelde context tussen taken.
 */
export function AiWerkruimteEcosysteemBalk({
  tr,
  actieveWerkruimteId,
  onWerkruimteId,
  gekozenContextSleutels,
  onContextSleutels,
  onKiesStartVraag,
  hubUrl,
}: ContextKiezerProps) {
  const [data, setData] = useState<OverzichtAntwoord | null>(null);

  useEffect(() => {
    let actief = true;
    void api.post('/api/owner/ai/ecosysteem/overzicht', sessieLichaam())
      .then((r) => {
        if (!actief || !r.data) return;
        setData(r.data as OverzichtAntwoord);
      })
      .catch(() => undefined);
    return () => { actief = false; };
  }, []);

  if (!data) return null;
  const ruimteTitel = RUIMTE_NAAM[data.ruimte] ?? RUIMTE_NAAM.prive;
  const actieveUitbreidingen = data.uitbreidingen.filter((u) => u.actief && u.config.startVraag);

  const wisselSleutel = (sleutel: string) => {
    if (gekozenContextSleutels.includes(sleutel)) {
      onContextSleutels(gekozenContextSleutels.filter((s) => s !== sleutel));
    } else {
      onContextSleutels([...gekozenContextSleutels, sleutel].slice(0, 12));
    }
  };

  return (
    <section className='aie-chat-koppeling' data-aie-werkgebied-balk='1' data-aie-ruimte={data.ruimte}>
      <div className='aie-item-kop'>
        <b>
          <Layers size={16} aria-hidden='true' />{' '}
          {tr('Єдина екосистема вашого простору', 'Verenigd ecosysteem van uw ruimte')}
        </b>
        <span className='aie-ruimte-pil'>{tr(ruimteTitel.uk, ruimteTitel.nl)}</span>
      </div>
      <p className='aie-subtekst'>
        {tr(
          'Цей простір об’єднує ваші моделі ШІ, агентні з’єднувачі (зокрема OpenAI Codex і Anthropic Claude), спільний контекст між завданнями та ізольовані межі доступу до файлів і служб.',
          'Deze ruimte verenigt uw AI-modellen, agentkoppelingen (waaronder OpenAI Codex en Anthropic Claude), gedeelde werkcontext tussen taken en geïsoleerde toegangsgrenzen voor bestanden en diensten.',
        )}
      </p>

      <div className='aie-grid-2'>
        <label className='aie-veld'>
          <span>{tr('Ізольований робочий простір агента', 'Geïsoleerde agent-werkruimte')}</span>
          <select
            value={actieveWerkruimteId}
            onChange={(e) => onWerkruimteId(e.target.value)}
            data-aie-kies-werkruimte='1'
          >
            <option value=''>{tr('Усі дозволені інструменти поточного простору', 'Alle toegestane hulpmiddelen van deze ruimte')}</option>
            {data.werkruimtes.filter((w) => w.actief).map((w) => (
              <option key={w.id} value={w.id}>{w.naam}</option>
            ))}
          </select>
        </label>

        <div className='aie-veld'>
          <span>{tr('Швидкі переходи до агентних служб', 'Snelle ingangen naar agentdiensten')}</span>
          <div className='aie-knoppen'>
            <a className='aie-knop-tweede' href={hubUrl('agent/codex')}>
              <AgentLogo agent='codex' naam='Codex' size={18} /> Codex
            </a>
            <a className='aie-knop-tweede' href={hubUrl('agent/claude')}>
              <AgentLogo agent='claude' naam='Claude' size={18} /> Claude
            </a>
            <a className='aie-knop-tweede' href={hubUrl('ai')}>
              {tr('Усі підключені агенти', 'Alle gekoppelde agenten')}
            </a>
          </div>
        </div>
      </div>

      {data.contextItems.length > 0 ? (
        <div className='aie-veld' data-aie-context-keuze='1'>
          <span>{tr('Прикріпити спільний контекст між завданнями', 'Gedeelde werkcontext tussen taken meesturen')}</span>
          <div className='aie-keuzerij'>
            {data.contextItems.slice(0, 10).map((c) => (
              <label key={c.sleutel} className='aie-vink'>
                <input
                  type='checkbox'
                  checked={gekozenContextSleutels.includes(c.sleutel)}
                  onChange={() => wisselSleutel(c.sleutel)}
                />
                <span>{c.titel} <code>({c.sleutel})</code></span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {actieveUitbreidingen.length > 0 && onKiesStartVraag ? (
        <div className='aie-veld'>
          <span>{tr('Ваші розширення простору', 'Uw ruimte-uitbreidingen')}</span>
          <div className='aie-knoppen'>
            {actieveUitbreidingen.map((u) => (
              <button
                key={u.id}
                type='button'
                className='aie-knop-tweede'
                onClick={() => u.config.startVraag && onKiesStartVraag(u.config.startVraag)}
              >
                <Blocks size={15} aria-hidden='true' /> {u.naam}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface PaneelProps {
  modus: 'agents' | 'runs' | 'workflows';
  tr: Tr;
  band: ReactNode;
  hubUrl: (hash: string) => string;
}

export default function AiEcosysteemPaneel({ modus, tr, band, hubUrl }: PaneelProps) {
  const [laden, setLaden] = useState<'laden' | 'klaar' | 'fout'>('laden');
  const [fout, setFout] = useState<{ code: string; tekst: string; recht: boolean }>({ code: '', tekst: '', recht: false });
  const [data, setData] = useState<OverzichtAntwoord>({
    ruimte: 'prive',
    werkruimtes: [],
    contextItems: [],
    overdrachten: [],
    uitbreidingen: [],
  });
  const [meldingOk, setMeldingOk] = useState('');
  const [actieFout, setActieFout] = useState('');

  // Formulier: geïsoleerde agent-werkruimte
  const [wkNaam, setWkNaam] = useState('');
  const [wkBeschrijving, setWkBeschrijving] = useState('');
  const [wkAgenten, setWkAgenten] = useState<string[]>(['codex', 'claude']);
  const [wkPcAan, setWkPcAan] = useState(true);
  const [wkPcSchrijven, setWkPcSchrijven] = useState(false);
  const [wkPcMappen, setWkPcMappen] = useState('~/projecten');
  const [wkBrowserAan, setWkBrowserAan] = useState(true);
  const [wkBrowserDomeinen, setWkBrowserDomeinen] = useState('*.tarasevych.com, github.com');
  const [wkServerAan, setWkServerAan] = useState(false);
  const [wkServerAlleenLezen, setWkServerAlleenLezen] = useState(true);
  const [wkBronnen, setWkBronnen] = useState<AgentBronnen>({
    bestanden: true, mail: false, agenda: false, schijf: true, github: true, bord: true, externeDiensten: true,
  });

  // Formulier: gedeelde werkcontext
  const [ctxSleutel, setCtxSleutel] = useState('');
  const [ctxTitel, setCtxTitel] = useState('');
  const [ctxDienst, setCtxDienst] = useState('ai');
  const [ctxWerkruimteId, setCtxWerkruimteId] = useState('');
  const [ctxInhoud, setCtxInhoud] = useState('');

  // Formulier: taakoverdracht tussen agenten
  const [ovVan, setOvVan] = useState('claude');
  const [ovNaar, setOvNaar] = useState('codex');
  const [ovDienst, setOvDienst] = useState('github');
  const [ovOpdracht, setOvOpdracht] = useState('');
  const [ovSleutels, setOvSleutels] = useState<string[]>([]);

  // Formulier: ruimte-uitbreiding
  const [uitNaam, setUitNaam] = useState('');
  const [uitSlug, setUitSlug] = useState('');
  const [uitSoort, setUitSoort] = useState<UitbreidingSoort>('systeem_brug');
  const [uitBeschrijving, setUitBeschrijving] = useState('');
  const [uitAgent, setUitAgent] = useState('codex');
  const [uitOmgevingen, setUitOmgevingen] = useState<AgentOmgevingId[]>(['pc', 'browser']);
  const [uitDiensten, setUitDiensten] = useState<string[]>(['ai', 'github']);
  const [uitStartVraag, setUitStartVraag] = useState('');
  const [uitInstructie, setUitInstructie] = useState('');

  // Zelf-host pakket
  const [zhDomein, setZhDomein] = useState('ruimte.lokaal.voorbeeld');
  const [zhPoort, setZhPoort] = useState(8787);
  const [zhLokaalModel, setZhLokaalModel] = useState(true);
  const [zhPakket, setZhPakket] = useState<ZelfHostPakket>(() => bouwZelfHostPakket());

  const leesOverzicht = useCallback(async () => {
    try {
      const res = await api.post('/api/owner/ai/ecosysteem/overzicht', sessieLichaam());
      const d = res.data as OverzichtAntwoord;
      setData({
        ruimte: d?.ruimte === 'technisch' ? 'technisch' : 'prive',
        werkruimtes: Array.isArray(d?.werkruimtes) ? d.werkruimtes : [],
        contextItems: Array.isArray(d?.contextItems) ? d.contextItems : [],
        overdrachten: Array.isArray(d?.overdrachten) ? d.overdrachten : [],
        uitbreidingen: Array.isArray(d?.uitbreidingen) ? d.uitbreidingen : [],
      });
      setLaden('klaar');
    } catch (e) {
      setFout({ code: foutCode(e).code || 'HTTP_0', tekst: foutTekst(e, tr), recht: isRechtFout(e) });
      setLaden('fout');
    }
  }, [tr]);

  useEffect(() => { void leesOverzicht(); }, [leesOverzicht]);

  const kopieerTekst = async (tekst: string, labelUk: string, labelNl: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      setMeldingOk(tr(`Скопійовано: ${labelUk}`, `Gekopieerd: ${labelNl}`));
    } catch {
      setActieFout(tr('Не вдалося скопіювати в буфер обміну.', 'Kopiëren naar het klembord is mislukt.'));
    }
  };

  const pasSjabloonToe = (s: WerkruimteSjabloon) => {
    setWkNaam(tr(s.naamUk, s.naamNl));
    setWkBeschrijving(tr(s.beschrijvingUk, s.beschrijvingNl));
    setWkAgenten([...s.agenten]);
    setWkPcAan(s.omgevingen.pc.aan);
    setWkPcSchrijven(s.omgevingen.pc.schrijven);
    setWkPcMappen(s.omgevingen.pc.mappen.join(', '));
    setWkBrowserAan(s.omgevingen.browser.aan);
    setWkBrowserDomeinen(s.omgevingen.browser.domeinen.join(', '));
    setWkServerAan(data.ruimte === 'technisch' && s.omgevingen.server.aan);
    setWkServerAlleenLezen(s.omgevingen.server.alleenLezen);
    setWkBronnen({ ...s.bronnen });
    setMeldingOk(tr('Шаблон підставлено у форму нижче — перевірте межі й натисніть «Зберегти простір агента».', 'Sjabloon ingevuld in het formulier hieronder — controleer de grenzen en druk op «Agent-werkruimte bewaren».'));
  };

  const bewaarWerkruimte = async (e: React.FormEvent) => {
    e.preventDefault();
    setActieFout(''); setMeldingOk('');
    try {
      await api.post('/api/owner/ai/ecosysteem/werkruimte/opslaan', {
        ...sessieLichaam(),
        naam: wkNaam,
        beschrijving: wkBeschrijving,
        agenten: wkAgenten,
        omgevingen: {
          pc: { aan: wkPcAan, schrijven: wkPcSchrijven, mappen: wkPcMappen.split(',').map((s) => s.trim()).filter(Boolean) },
          browser: { aan: wkBrowserAan, domeinen: wkBrowserDomeinen.split(',').map((s) => s.trim()).filter(Boolean) },
          server: { aan: data.ruimte === 'technisch' && wkServerAan, alleenLezen: wkServerAlleenLezen },
        },
        bronnen: wkBronnen,
      });
      setWkNaam(''); setWkBeschrijving('');
      setMeldingOk(tr('Ізольований робочий простір агента збережено.', 'Geïsoleerde agent-werkruimte opgeslagen.'));
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const verwijderWerkruimte = async (id: string) => {
    setActieFout(''); setMeldingOk('');
    try {
      await api.post('/api/owner/ai/ecosysteem/werkruimte/verwijderen', { ...sessieLichaam(), id });
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const bewaarContext = async (e: React.FormEvent) => {
    e.preventDefault();
    setActieFout(''); setMeldingOk('');
    try {
      await api.post('/api/owner/ai/ecosysteem/context/opslaan', {
        ...sessieLichaam(),
        sleutel: ctxSleutel || ctxTitel,
        titel: ctxTitel,
        bronDienst: ctxDienst,
        werkruimteId: ctxWerkruimteId || undefined,
        inhoud: ctxInhoud,
      });
      setCtxSleutel(''); setCtxTitel(''); setCtxInhoud('');
      setMeldingOk(tr('Запис спільного контексту збережено для завдань і агентів цього простору.', 'Item van de gedeelde werkcontext opgeslagen voor taken en agenten van deze ruimte.'));
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const verwijderContext = async (sleutel: string) => {
    setActieFout(''); setMeldingOk('');
    try {
      await api.post('/api/owner/ai/ecosysteem/context/verwijderen', { ...sessieLichaam(), sleutel });
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const maakOverdracht = async (e: React.FormEvent) => {
    e.preventDefault();
    setActieFout(''); setMeldingOk('');
    try {
      await api.post('/api/owner/ai/ecosysteem/overdracht/aanmaken', {
        ...sessieLichaam(),
        vanAgent: ovVan,
        naarAgent: ovNaar,
        doelDienst: ovDienst,
        opdracht: ovOpdracht,
        contextSleutels: ovSleutels,
      });
      setOvOpdracht('');
      setMeldingOk(tr('Передачу завдання між агентами зареєстровано за вашим розпорядженням.', 'Taakoverdracht tussen agenten geregistreerd in uw opdracht.'));
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const zetOverdrachtStatus = async (id: string, status: OverdrachtStatus) => {
    setActieFout('');
    try {
      await api.post('/api/owner/ai/ecosysteem/overdracht/bijwerken', { ...sessieLichaam(), id, status });
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const bewaarUitbreiding = async (e: React.FormEvent) => {
    e.preventDefault();
    setActieFout(''); setMeldingOk('');
    try {
      await api.post('/api/owner/ai/ecosysteem/uitbreiding/opslaan', {
        ...sessieLichaam(),
        naam: uitNaam,
        slug: uitSlug || uitNaam,
        soort: uitSoort,
        beschrijving: uitBeschrijving,
        gemaaktDoorAgent: uitAgent,
        omgevingen: uitOmgevingen,
        doelDiensten: uitDiensten,
        config: {
          startVraag: uitStartVraag || undefined,
          instructie: uitInstructie || undefined,
        },
      });
      setUitNaam(''); setUitSlug(''); setUitBeschrijving(''); setUitStartVraag(''); setUitInstructie('');
      setMeldingOk(tr('Розширення вашого простору збережено.', 'Uitbreiding van uw ruimte opgeslagen.'));
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const verwijderUitbreiding = async (slug: string) => {
    setActieFout('');
    try {
      await api.post('/api/owner/ai/ecosysteem/uitbreiding/verwijderen', { ...sessieLichaam(), slug });
      await leesOverzicht();
    } catch (err) {
      setActieFout(foutTekst(err, tr));
    }
  };

  const verversZelfHost = async () => {
    try {
      const res = await api.post('/api/owner/ai/ecosysteem/zelf-hosten/pakket', {
        ...sessieLichaam(),
        domein: zhDomein,
        poort: zhPoort,
        metLokaleModellen: zhLokaalModel,
      });
      if (res.data?.pakket) setZhPakket(res.data.pakket as ZelfHostPakket);
    } catch {
      setZhPakket(bouwZelfHostPakket({ domein: zhDomein, poort: zhPoort, metLokaleModellen: zhLokaalModel, ruimte: data.ruimte }));
    }
  };

  if (laden === 'laden') {
    return (
      <>
        {band}
        <p className='aiw-nog-niet' aria-busy='true'>{tr('Читаємо налаштування вашої екосистеми ШІ…', 'De instellingen van uw AI-ecosysteem worden gelezen…')}</p>
      </>
    );
  }

  if (laden === 'fout') {
    return (
      <>
        {band}
        <section className='aie-container'>
          <ProductEmptyState
            icon={ShieldAlert}
            title={fout.recht ? tr('Розділ ШІ для цього облікового запису ще не ввімкнено', 'Het AI-onderdeel staat voor dit account nog niet aan') : tr('Не вдалося завантажити екосистему ШІ', 'Het AI-ecosysteem kon niet geladen worden')}
            description={fout.recht ? tr(RECHT_UITLEG[0], RECHT_UITLEG[1]) : fout.tekst}
            actionLabel={tr('Перевірити ще раз', 'Opnieuw controleren')}
            onAction={() => { setLaden('laden'); void leesOverzicht(); }}
          />
        </section>
      </>
    );
  }

  const ruimteTitel = RUIMTE_NAAM[data.ruimte] ?? RUIMTE_NAAM.prive;
  const sjablonen = STANDAARD_WERKRUIMTE_SJABLONEN.filter((s) => s.ruimte === 'beide' || s.ruimte === data.ruimte);

  return (
    <>
      {band}
      <div className='aie-container' data-aie-modus={modus} data-aie-ruimte={data.ruimte}>
        {meldingOk ? <p className='aie-melding-ok' role='status'>{meldingOk}</p> : null}
        {actieFout ? <p className='aie-melding-fout' role='alert'>{actieFout}</p> : null}

        {modus === 'agents' ? (
          <>
            <header className='aie-kop'>
              <div>
                <h1>{tr('Агенти та ізольовані робочі простори', 'Agenten en geïsoleerde werkruimtes')}</h1>
                <p>{tr(
                  'Кожен агент ШІ працює в межах вибраного вами простору: ви самі визначаєте доступ до комп’ютера, оглядача й сервера, дозволені теки файлів та підключені служби.',
                  'Elke AI-agent werkt binnen een door u gekozen werkruimte: u bepaalt zelf de toegang tot computer, browser en server, de toegestane bestandsmappen en de aangesloten diensten.',
                )}</p>
              </div>
              <span className='aie-ruimte-pil'>{tr(ruimteTitel.uk, ruimteTitel.nl)}</span>
            </header>

            <article className='aie-kaart'>
              <h2><Cpu size={18} aria-hidden='true' /> {tr('Інструменти програмування ШІ (Codex, Claude та інші)', 'AI-programmeerhulpmiddelen (Codex, Claude en andere)')}</h2>
              <p className='aie-subtekst'>
                {tr(
                  'Під’єднайте OpenAI Codex, Anthropic Claude Code, Cursor, Copilot або Antigravity безпосередньо до власних з’єднувачів платформи, щоб розвивати свою частину сайту й автоматизувати роботу без прив’язки до однієї служби.',
                  'Koppel OpenAI Codex, Anthropic Claude Code, Cursor, Copilot of Antigravity rechtstreeks aan de eigen connectors van het platform om aan uw deel van de site te bouwen zonder gebonden te zijn aan één dienst.',
                )}
              </p>
              <div className='aie-grid-2'>
                <div className='aie-omgeving-vak'>
                  <b>OpenAI Codex (<code>/codex</code>)</b>
                  <pre className='aie-codeblok'>codex mcp add mijn-ruimte --url https://mcp.tarasevych.com/codex</pre>
                  <div className='aie-knoppen'>
                    <button type='button' className='aie-knop-tweede' onClick={() => void kopieerTekst('codex mcp add mijn-ruimte --url https://mcp.tarasevych.com/codex', 'команду Codex', 'Codex-opdracht')}>
                      <Copy size={14} aria-hidden='true' /> {tr('Скопіювати команду', 'Opdracht kopiëren')}
                    </button>
                    <a className='aie-knop-tweede' href={hubUrl('agent/codex')}>{tr('Налаштувати права Codex', 'Rechten van Codex instellen')}</a>
                  </div>
                </div>
                <div className='aie-omgeving-vak'>
                  <b>Anthropic Claude (<code>/claude</code>)</b>
                  <pre className='aie-codeblok'>claude mcp add --transport http mijn-ruimte https://mcp.tarasevych.com/claude</pre>
                  <div className='aie-knoppen'>
                    <button type='button' className='aie-knop-tweede' onClick={() => void kopieerTekst('claude mcp add --transport http mijn-ruimte https://mcp.tarasevych.com/claude', 'команду Claude', 'Claude-opdracht')}>
                      <Copy size={14} aria-hidden='true' /> {tr('Скопіювати команду', 'Opdracht kopiëren')}
                    </button>
                    <a className='aie-knop-tweede' href={hubUrl('agent/claude')}>{tr('Налаштувати права Claude', 'Rechten van Claude instellen')}</a>
                  </div>
                </div>
              </div>
            </article>

            <article className='aie-kaart' data-aie-werkruimtes-sectie='1'>
              <h2><FolderLock size={18} aria-hidden='true' /> {tr('Ізольовані робочі простори агентів ШІ', 'Geïsoleerde werkruimtes voor AI-agenten')}</h2>
              <p className='aie-subtekst'>
                {tr(
                  'Готові шаблони для швидкого старту — натисніть, щоб заповнити налаштування обмеженого доступу:',
                  'Kant-en-klare sjablonen voor een snelle start — klik om de instellingen voor begrensde toegang in te vullen:',
                )}
              </p>
              <div className='aie-knoppen'>
                {sjablonen.map((s) => (
                  <button key={s.id} type='button' className='aie-knop-tweede' onClick={() => pasSjabloonToe(s)}>
                    {tr(s.naamUk, s.naamNl)}
                  </button>
                ))}
              </div>

              <form onSubmit={(e) => void bewaarWerkruimte(e)} className='aie-lijst'>
                <div className='aie-grid-2'>
                  <label className='aie-veld'>
                    <span>{tr('Назва ізольованого простору', 'Naam van de geïsoleerde werkruimte')}</span>
                    <input type='text' required maxLength={120} value={wkNaam} onChange={(e) => setWkNaam(e.target.value)}
                      placeholder={tr('Наприклад: Розробка мого модуля (Codex + Claude)', 'Bijv.: Ontwikkeling van mijn module (Codex + Claude)')} />
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Призначення та межі роботи', 'Doel en werkgrenzen')}</span>
                    <input type='text' maxLength={1000} value={wkBeschrijving} onChange={(e) => setWkBeschrijving(e.target.value)}
                      placeholder={tr('Лише код і завдання без доступу до особистих листів', 'Alleen code en taken zonder toegang tot persoonlijke post')} />
                  </label>
                </div>

                <div className='aie-grid-3'>
                  <div className='aie-omgeving-vak'>
                    <b><Cpu size={15} aria-hidden='true' /> {tr('1. Локальний комп’ютер (agent.mjs)', '1. Lokale computer (agent.mjs)')}</b>
                    <label className='aie-vink'>
                      <input type='checkbox' checked={wkPcAan} onChange={(e) => setWkPcAan(e.target.checked)} />
                      <span>{tr('Дозволити доступ до комп’ютера', 'Toegang tot computer toestaan')}</span>
                    </label>
                    <label className='aie-vink'>
                      <input type='checkbox' checked={wkPcSchrijven} disabled={!wkPcAan} onChange={(e) => setWkPcSchrijven(e.target.checked)} />
                      <span>{tr('Дозволити запис і команди (з підтвердженням)', 'Schrijven en opdrachten toestaan (met bevestiging)')}</span>
                    </label>
                    <label className='aie-veld'>
                      <span>{tr('Дозволені теки (через кому)', 'Toegestane mappen (kommagescheiden)')}</span>
                      <input type='text' disabled={!wkPcAan} value={wkPcMappen} onChange={(e) => setWkPcMappen(e.target.value)} placeholder='~/projecten, ~/documenten' />
                    </label>
                  </div>

                  <div className='aie-omgeving-vak'>
                    <b><Globe size={15} aria-hidden='true' /> {tr('2. Оглядач (розширення)', '2. Browser (extensie)')}</b>
                    <label className='aie-vink'>
                      <input type='checkbox' checked={wkBrowserAan} onChange={(e) => setWkBrowserAan(e.target.checked)} />
                      <span>{tr('Дозволити роботу в оглядачі', 'Werken in de browser toestaan')}</span>
                    </label>
                    <label className='aie-veld'>
                      <span>{tr('Дозволені домени (через кому)', 'Toegestane domeinen (kommagescheiden)')}</span>
                      <input type='text' disabled={!wkBrowserAan} value={wkBrowserDomeinen} onChange={(e) => setWkBrowserDomeinen(e.target.value)} placeholder='*.tarasevych.com, github.com' />
                    </label>
                  </div>

                  <div className='aie-omgeving-vak'>
                    <b><Server size={15} aria-hidden='true' /> {tr('3. Сервер і випуски', '3. Server en uitgaven')}</b>
                    {data.ruimte === 'technisch' ? (
                      <>
                        <label className='aie-vink'>
                          <input type='checkbox' checked={wkServerAan} onChange={(e) => setWkServerAan(e.target.checked)} />
                          <span>{tr('Дозволити технічний доступ до сервера', 'Technische servertoegang toestaan')}</span>
                        </label>
                        <label className='aie-vink'>
                          <input type='checkbox' checked={wkServerAlleenLezen} disabled={!wkServerAan} onChange={(e) => setWkServerAlleenLezen(e.target.checked)} />
                          <span>{tr('Лише читання стану та журналів', 'Alleen status en logboeken lezen')}</span>
                        </label>
                      </>
                    ) : (
                      <p className='aie-subtekst'>
                        {tr('У приватному просторі доступ до сервера завжди вимкнено. Увімкніть технічний простір у меню профілю для серверних завдань.', 'In de privéruimte staat servertoegang altijd uit. Schakel de technische ruimte in via het profielmenu voor servertaken.')}
                      </p>
                    )}
                  </div>
                </div>

                <div className='aie-veld'>
                  <span>{tr('Дозволені дані й служби в цьому просторі агента', 'Toegestane gegevens en diensten in deze agent-werkruimte')}</span>
                  <div className='aie-keuzerij'>
                    {BRON_LABELS.filter((b) => !b.alleenPrive || data.ruimte === 'prive').map((b) => (
                      <label key={b.sleutel} className='aie-vink'>
                        <input
                          type='checkbox'
                          checked={wkBronnen[b.sleutel]}
                          onChange={(e) => setWkBronnen({ ...wkBronnen, [b.sleutel]: e.target.checked })}
                        />
                        <span>{tr(b.uk, b.nl)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className='aie-veld'>
                  <span>{tr('Прикріплені агенти ШІ', 'Gekoppelde AI-agenten')}</span>
                  <div className='aie-keuzerij'>
                    {V2_AGENTEN.map((a) => (
                      <label key={a.slug} className='aie-vink'>
                        <input
                          type='checkbox'
                          checked={wkAgenten.includes(a.slug)}
                          onChange={(e) => setWkAgenten(e.target.checked ? [...wkAgenten, a.slug] : wkAgenten.filter((x) => x !== a.slug))}
                        />
                        <span>{a.naam}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className='aie-knoppen'>
                  <button type='submit' className='aie-knop-hoofd'>{tr('Зберегти простір агента', 'Agent-werkruimte bewaren')}</button>
                </div>
              </form>

              {data.werkruimtes.length > 0 ? (
                <ul className='aie-lijst'>
                  {data.werkruimtes.map((w) => (
                    <li key={w.id} className='aie-item' data-aie-werkruimte-kaart={w.id}>
                      <div className='aie-item-kop'>
                        <b>{w.naam}</b>
                        <button type='button' className='aie-knop-gevaar' onClick={() => void verwijderWerkruimte(w.id)}>
                          {tr('Видалити', 'Verwijderen')}
                        </button>
                      </div>
                      {w.beschrijving ? <p className='aie-subtekst'>{w.beschrijving}</p> : null}
                      <div className='aie-badges'>
                        {w.omgevingen.pc.aan ? <span className='aie-badge'>{tr('Комп’ютер', 'Computer')}: {w.omgevingen.pc.schrijven ? tr('читання+запис', 'lezen+schrijven') : tr('лише читання', 'alleen lezen')}{w.omgevingen.pc.mappen.length ? ` (${w.omgevingen.pc.mappen.join(', ')})` : ''}</span> : null}
                        {w.omgevingen.browser.aan ? <span className='aie-badge'>{tr('Оглядач', 'Browser')}{w.omgevingen.browser.domeinen.length ? `: ${w.omgevingen.browser.domeinen.join(', ')}` : ''}</span> : null}
                        {w.omgevingen.server.aan ? <span className='aie-badge'>{tr('Сервер', 'Server')}</span> : null}
                        {w.agenten.map((ag) => <span key={ag} className='aie-badge'>{ag}</span>)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='aie-subtekst'>{tr('Поки немає жодного створеного ізольованого простору — оберіть шаблон вище або збережіть власний.', 'Nog geen geïsoleerde werkruimte aangemaakt — kies hierboven een sjabloon of bewaar uw eigen ruimte.')}</p>
              )}
            </article>
          </>
        ) : null}

        {modus === 'runs' ? (
          <>
            <header className='aie-kop'>
              <div>
                <h1>{tr('Спільний контекст і взаємодія агентів', 'Gedeelde werkcontext en samenwerking tussen agenten')}</h1>
                <p>{tr(
                  'Зберігайте контекст між завданнями й підключеними застосунками та передавайте роботу від одного агента ШІ іншому за вашим розпорядженням.',
                  'Bewaar context tussen taken en aangesloten toepassingen en draag werk in uw opdracht over van de ene AI-agent naar de andere.',
                )}</p>
              </div>
              <div className='aie-knoppen'>
                <span className='aie-ruimte-pil'>{tr(ruimteTitel.uk, ruimteTitel.nl)}</span>
                <a className='aie-knop-tweede' href={hubUrl('journaal')}>{tr('Відкрити журнал дій', 'Actielogboek openen')}</a>
              </div>
            </header>

            <article className='aie-kaart' data-aie-context-sectie='1'>
              <h2><Layers size={18} aria-hidden='true' /> {tr('Спільний контекст між завданнями та застосунками', 'Gedeelde werkcontext tussen taken en toepassingen')}</h2>
              <form onSubmit={(e) => void bewaarContext(e)} className='aie-lijst'>
                <div className='aie-grid-3'>
                  <label className='aie-veld'>
                    <span>{tr('Ключ контексту', 'Contextsleutel')}</span>
                    <input type='text' maxLength={80} value={ctxSleutel} onChange={(e) => setCtxSleutel(e.target.value)} placeholder='project-architectuur' />
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Заголовок', 'Titel')}</span>
                    <input type='text' required maxLength={160} value={ctxTitel} onChange={(e) => setCtxTitel(e.target.value)}
                      placeholder={tr('Поточні домовленості та цілі завдання', 'Huidige afspraken en taakdoelen')} />
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Служба-джерело', 'Brondienst')}</span>
                    <select value={ctxDienst} onChange={(e) => setCtxDienst(e.target.value)}>
                      {DIENST_KEUZES.map((d) => <option key={d.id} value={d.id}>{tr(d.uk, d.nl)}</option>)}
                    </select>
                  </label>
                </div>

                {data.werkruimtes.length > 0 ? (
                  <label className='aie-veld'>
                    <span>{tr('Прив’язати до ізольованого простору агента (необов’язково)', 'Koppelen aan geïsoleerde agent-werkruimte (optioneel)')}</span>
                    <select value={ctxWerkruimteId} onChange={(e) => setCtxWerkruimteId(e.target.value)}>
                      <option value=''>{tr('Доступно в усьому поточному просторі користувача', 'Beschikbaar in de hele huidige gebruikersruimte')}</option>
                      {data.werkruimtes.map((w) => <option key={w.id} value={w.id}>{w.naam}</option>)}
                    </select>
                  </label>
                ) : null}

                <label className='aie-veld'>
                  <span>{tr('Зміст контексту (без паролів і таємних ключів)', 'Contextinhoud (zonder wachtwoorden of geheime sleutels)')}</span>
                  <textarea required maxLength={16000} value={ctxInhoud} onChange={(e) => setCtxInhoud(e.target.value)}
                    placeholder={tr('Опишіть важливі висновки, шляхи до файлів, листи чи рішення, які мають пам’ятати інші завдання й агенти…', 'Beschrijf belangrijke bevindingen, bestandspaden, berichten of besluiten die volgende taken en agenten moeten onthouden…')} />
                </label>

                <div className='aie-knoppen'>
                  <button type='submit' className='aie-knop-hoofd'>{tr('Зберегти спільний контекст', 'Gedeelde context bewaren')}</button>
                </div>
              </form>

              {data.contextItems.length > 0 ? (
                <ul className='aie-lijst'>
                  {data.contextItems.map((c) => (
                    <li key={c.id} className='aie-item' data-aie-context-kaart={c.sleutel}>
                      <div className='aie-item-kop'>
                        <b>{c.titel} <code>[{c.sleutel}]</code></b>
                        <button type='button' className='aie-knop-gevaar' onClick={() => void verwijderContext(c.sleutel)}>
                          {tr('Видалити', 'Verwijderen')}
                        </button>
                      </div>
                      <div className='aie-badges'>
                        <span className='aie-badge'>{tr('Джерело', 'Bron')}: {c.bronDienst}{c.bronAgent ? ` · ${c.bronAgent}` : ''}</span>
                      </div>
                      <pre className='aie-codeblok'>{c.inhoud}</pre>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='aie-subtekst'>{tr('Записів спільного контексту ще немає — додайте перший запис вище або збережіть його через підключеного агента ШІ.', 'Nog geen gedeelde contextitems — voeg hierboven een eerste item toe of bewaar het via een gekoppelde AI-agent.')}</p>
              )}
            </article>

            <article className='aie-kaart' data-aie-overdrachten-sectie='1'>
              <h2><ArrowRightLeft size={18} aria-hidden='true' /> {tr('Передача завдань між агентами та службами за розпорядженням користувача', 'Taakoverdracht tussen agenten en diensten in opdracht van de gebruiker')}</h2>
              <form onSubmit={(e) => void maakOverdracht(e)} className='aie-lijst'>
                <div className='aie-grid-3'>
                  <label className='aie-veld'>
                    <span>{tr('Від кого', 'Van wie')}</span>
                    <select value={ovVan} onChange={(e) => setOvVan(e.target.value)}>
                      <option value='gebruiker'>{tr('Від мене (користувача)', 'Van mij (gebruiker)')}</option>
                      {V2_AGENTEN.map((a) => <option key={a.slug} value={a.slug}>{a.naam}</option>)}
                    </select>
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Цільовий агент ШІ', 'Doel-AI-agent')}</span>
                    <select value={ovNaar} onChange={(e) => setOvNaar(e.target.value)}>
                      {V2_AGENTEN.map((a) => <option key={a.slug} value={a.slug}>{a.naam}</option>)}
                    </select>
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Цільова служба', 'Doeldienst')}</span>
                    <select value={ovDienst} onChange={(e) => setOvDienst(e.target.value)}>
                      {DIENST_KEUZES.map((d) => <option key={d.id} value={d.id}>{tr(d.uk, d.nl)}</option>)}
                    </select>
                  </label>
                </div>

                {data.contextItems.length > 0 ? (
                  <div className='aie-veld'>
                    <span>{tr('Передати разом із ключами спільного контексту', 'Meesturen met sleutels van gedeelde context')}</span>
                    <div className='aie-keuzerij'>
                      {data.contextItems.map((c) => (
                        <label key={c.sleutel} className='aie-vink'>
                          <input
                            type='checkbox'
                            checked={ovSleutels.includes(c.sleutel)}
                            onChange={(e) => setOvSleutels(e.target.checked ? [...ovSleutels, c.sleutel] : ovSleutels.filter((x) => x !== c.sleutel))}
                          />
                          <span>{c.titel} ({c.sleutel})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className='aie-veld'>
                  <span>{tr('Розпорядження для наступного агента', 'Opdracht voor de volgende agent')}</span>
                  <textarea required maxLength={8000} value={ovOpdracht} onChange={(e) => setOvOpdracht(e.target.value)}
                    placeholder={tr('Наприклад: Перевір зміни в гілці на основі збереженого контексту архітектури та підготуй одиничні випробування…', 'Bijv.: Controleer de wijzigingen in de tak op basis van de bewaarde architectuurcontext en bereid eenheidstests voor…')} />
                </label>

                <div className='aie-knoppen'>
                  <button type='submit' className='aie-knop-hoofd'>{tr('Передати завдання агенту', 'Taak overdragen aan agent')}</button>
                </div>
              </form>

              {data.overdrachten.length > 0 ? (
                <ul className='aie-lijst'>
                  {data.overdrachten.map((o) => {
                    const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.open;
                    return (
                      <li key={o.id} className='aie-item'>
                        <div className='aie-item-kop'>
                          <b>{o.vanAgent} → {o.naarAgent} ({o.doelDienst})</b>
                          <span className='aie-badge'>{tr(st.uk, st.nl)}</span>
                        </div>
                        <p className='aie-subtekst'>{o.opdracht}</p>
                        {o.contextSleutels.length > 0 ? (
                          <div className='aie-badges'>
                            {o.contextSleutels.map((k) => <span key={k} className='aie-badge'>{tr('Контекст', 'Context')}: {k}</span>)}
                          </div>
                        ) : null}
                        <div className='aie-knoppen'>
                          {o.status !== 'bezig' && o.status !== 'voltooid' ? (
                            <button type='button' className='aie-knop-tweede' onClick={() => void zetOverdrachtStatus(o.id, 'bezig')}>{tr('Узяти в роботу', 'In uitvoering zetten')}</button>
                          ) : null}
                          {o.status !== 'voltooid' ? (
                            <button type='button' className='aie-knop-tweede' onClick={() => void zetOverdrachtStatus(o.id, 'voltooid')}>{tr('Позначити завершеним', 'Als voltooid markeren')}</button>
                          ) : null}
                          {o.status !== 'geannuleerd' && o.status !== 'voltooid' ? (
                            <button type='button' className='aie-knop-gevaar' onClick={() => void zetOverdrachtStatus(o.id, 'geannuleerd')}>{tr('Скасувати', 'Annuleren')}</button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className='aie-subtekst'>{tr('Активних передач між агентами ще немає.', 'Nog geen actieve taakoverdrachten tussen agenten.')}</p>
              )}
            </article>
          </>
        ) : null}

        {modus === 'workflows' ? (
          <>
            <header className='aie-kop'>
              <div>
                <h1>{tr('Розширення вашого простору та самостійне розгортання', 'Uitbreiding van uw ruimte en zelfstandige uitrol')}</h1>
                <p>{tr(
                  'Адаптуйте та розширюйте свою частину вебзастосунку за допомогою Codex, Claude та власних системних мостів — або розгорніть усю відкриту платформу на своєму обладнанні без залежності від одного сайту.',
                  'Pas uw deel van de webtoepassing aan en breid het uit met Codex, Claude en eigen systeembruggen — of rol het volledige open platform uit op uw eigen apparatuur zonder afhankelijkheid van één site.',
                )}</p>
              </div>
              <span className='aie-ruimte-pil'>{tr(ruimteTitel.uk, ruimteTitel.nl)}</span>
            </header>

            <article className='aie-kaart' data-aie-uitbreidingen-sectie='1'>
              <h2><Blocks size={18} aria-hidden='true' /> {tr('Адаптація та розширення в межах простору облікового запису', 'Aanpassing en uitbreiding binnen uw accountruimte')}</h2>
              <form onSubmit={(e) => void bewaarUitbreiding(e)} className='aie-lijst'>
                <div className='aie-grid-3'>
                  <label className='aie-veld'>
                    <span>{tr('Назва розширення', 'Naam van de uitbreiding')}</span>
                    <input type='text' required maxLength={120} value={uitNaam} onChange={(e) => setUitNaam(e.target.value)}
                      placeholder={tr('Наприклад: Зведення пошти й завдань на день', 'Bijv.: Dagoverzicht van e-mail en taken')} />
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Короткий код (латиницею)', 'Korte code (Latijns)')}</span>
                    <input type='text' maxLength={64} value={uitSlug} onChange={(e) => setUitSlug(e.target.value)} placeholder='dagoverzicht-brug' />
                  </label>
                  <label className='aie-veld'>
                    <span>{tr('Інструмент-розробник', 'Ontwikkel-agent')}</span>
                    <select value={uitAgent} onChange={(e) => setUitAgent(e.target.value)}>
                      <option value='codex'>OpenAI Codex</option>
                      <option value='claude'>Anthropic Claude</option>
                      <option value='antigravity'>Antigravity</option>
                      <option value='cursor'>Cursor</option>
                      <option value='eigen'>{tr('Власноруч', 'Zelf gemaakt')}</option>
                    </select>
                  </label>
                </div>

                <label className='aie-veld'>
                  <span>{tr('Вид інтеграції', 'Soort integratie')}</span>
                  <select value={uitSoort} onChange={(e) => setUitSoort(e.target.value as UitbreidingSoort)}>
                    {(Object.keys(SOORT_LABELS) as UitbreidingSoort[]).map((s) => (
                      <option key={s} value={s}>{tr(SOORT_LABELS[s].uk, SOORT_LABELS[s].nl)}</option>
                    ))}
                  </select>
                </label>

                <div className='aie-veld'>
                  <span>{tr('Середовища виконання', 'Uitvoeringsomgevingen')}</span>
                  <div className='aie-keuzerij'>
                    {(['pc', 'browser', ...(data.ruimte === 'technisch' ? (['server'] as const) : [])] as AgentOmgevingId[]).map((omg) => (
                      <label key={omg} className='aie-vink'>
                        <input
                          type='checkbox'
                          checked={uitOmgevingen.includes(omg)}
                          onChange={(e) => setUitOmgevingen(e.target.checked ? [...uitOmgevingen, omg] : uitOmgevingen.filter((x) => x !== omg))}
                        />
                        <span>{omg === 'pc' ? tr('Комп’ютер', 'Computer') : omg === 'browser' ? tr('Оглядач', 'Browser') : tr('Сервер', 'Server')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className='aie-veld'>
                  <span>{tr('Залучені служби сайту', 'Betrokken sitediensten')}</span>
                  <div className='aie-keuzerij'>
                    {DIENST_KEUZES.map((d) => (
                      <label key={d.id} className='aie-vink'>
                        <input
                          type='checkbox'
                          checked={uitDiensten.includes(d.id)}
                          onChange={(e) => setUitDiensten(e.target.checked ? [...uitDiensten, d.id] : uitDiensten.filter((x) => x !== d.id))}
                        />
                        <span>{tr(d.uk, d.nl)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className='aie-veld'>
                  <span>{tr('Опис можливості', 'Beschrijving van de mogelijkheid')}</span>
                  <input type='text' maxLength={1500} value={uitBeschrijving} onChange={(e) => setUitBeschrijving(e.target.value)}
                    placeholder={tr('Що саме додає або поєднує це розширення у вашому просторі', 'Wat deze uitbreiding toevoegt of verbindt in uw ruimte')} />
                </label>

                <label className='aie-veld'>
                  <span>{tr('Готовий запит для швидкого запуску в чаті ШІ (необов’язково)', 'Startvraag voor snelle uitvoering in de AI-chat (optioneel)')}</span>
                  <input type='text' maxLength={2000} value={uitStartVraag} onChange={(e) => setUitStartVraag(e.target.value)}
                    placeholder={tr('Перевір мої відкриті завдання на дошці, нові листи й останні зміни у сховищі коду та склади план дій', 'Controleer mijn open taken op het bord, nieuwe berichten en recente wijzigingen in de code-opslagplaats en maak een actieplan')} />
                </label>

                <label className='aie-veld'>
                  <span>{tr('Правила та інструкція виконання (необов’язково)', 'Regels en uitvoeringsinstructie (optioneel)')}</span>
                  <textarea maxLength={4000} value={uitInstructie} onChange={(e) => setUitInstructie(e.target.value)}
                    placeholder={tr('Покрокові правила взаємодії зі службами у вашому просторі…', 'Stapsgewijze regels voor samenwerking met diensten in uw ruimte…')} />
                </label>

                <div className='aie-knoppen'>
                  <button type='submit' className='aie-knop-hoofd'>{tr('Зберегти розширення простору', 'Ruimte-uitbreiding bewaren')}</button>
                </div>
              </form>

              {data.uitbreidingen.length > 0 ? (
                <ul className='aie-lijst'>
                  {data.uitbreidingen.map((u) => (
                    <li key={u.id} className='aie-item' data-aie-uitbreiding-kaart={u.slug}>
                      <div className='aie-item-kop'>
                        <b>{u.naam} <code>({u.slug})</code></b>
                        <button type='button' className='aie-knop-gevaar' onClick={() => void verwijderUitbreiding(u.slug)}>
                          {tr('Видалити', 'Verwijderen')}
                        </button>
                      </div>
                      {u.beschrijving ? <p className='aie-subtekst'>{u.beschrijving}</p> : null}
                      <div className='aie-badges'>
                        <span className='aie-badge'>{tr(SOORT_LABELS[u.soort].uk, SOORT_LABELS[u.soort].nl)}</span>
                        {u.gemaaktDoorAgent ? <span className='aie-badge'>{tr('Створено через', 'Gemaakt met')}: {u.gemaaktDoorAgent}</span> : null}
                        {u.doelDiensten.map((d) => <span key={d} className='aie-badge'>{d}</span>)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='aie-subtekst'>{tr('У цьому просторі ще немає збережених розширень — додайте перше вище або зареєструйте його через Codex чи Claude.', 'Nog geen opgeslagen uitbreidingen in deze ruimte — voeg er hierboven een toe of registreer haar via Codex of Claude.')}</p>
              )}
            </article>

            <article className='aie-kaart' data-aie-zelf-host-sectie='1'>
              <h2><Server size={18} aria-hidden='true' /> {tr('Відкрита платформа на власному обладнанні (без залежності від одного сайту)', 'Open platform op eigen apparatuur (zonder afhankelijkheid van één site)')}</h2>
              <p className='aie-subtekst'>
                {tr(
                  'Ви можете розгорнути власний вузол платформи на домашньому сервері, робочій станції чи віртуальній машині, під’єднати локальні моделі ШІ й працювати на будь-який смак без прив’язки до зовнішньої хмари.',
                  'U kunt uw eigen platformknooppunt uitrollen op een thuisserver, werkstation of virtuele machine, lokale AI-modellen koppelen en werken zoals u wilt zonder binding aan een externe omgeving.',
                )}
              </p>

              <div className='aie-grid-3'>
                <label className='aie-veld'>
                  <span>{tr('Ваш власний домен', 'Uw eigen domein')}</span>
                  <input type='text' value={zhDomein} onChange={(e) => setZhDomein(e.target.value)} />
                </label>
                <label className='aie-veld'>
                  <span>{tr('Локальний порт служби', 'Lokale dienstpoort')}</span>
                  <input type='number' min={1024} max={65535} value={zhPoort} onChange={(e) => setZhPoort(Number(e.target.value) || 8787)} />
                </label>
                <div className='aie-veld'>
                  <span>{tr('Локальні відкриті моделі', 'Lokale open modellen')}</span>
                  <label className='aie-vink'>
                    <input type='checkbox' checked={zhLokaalModel} onChange={(e) => setZhLokaalModel(e.target.checked)} />
                    <span>{tr('Додати середовище локальних моделей', 'Omgeving voor lokale modellen opnemen')}</span>
                  </label>
                </div>
              </div>

              <div className='aie-knoppen'>
                <button type='button' className='aie-knop-hoofd' onClick={() => void verversZelfHost()}>
                  {tr('Сформувати налаштування для мого обладнання', 'Opstelling voor mijn apparatuur opbouwen')}
                </button>
                <button type='button' className='aie-knop-tweede' onClick={() => void kopieerTekst(zhPakket.dockerCompose, 'docker-compose.yml', 'docker-compose.yml')}>
                  <Copy size={14} aria-hidden='true' /> docker-compose.yml
                </button>
                <button type='button' className='aie-knop-tweede' onClick={() => void kopieerTekst(zhPakket.envVoorbeeld, '.env', '.env')}>
                  <Copy size={14} aria-hidden='true' /> .env
                </button>
              </div>

              <div className='aie-grid-2'>
                <div className='aie-veld'>
                  <span>docker-compose.yml</span>
                  <pre className='aie-codeblok'>{zhPakket.dockerCompose}</pre>
                </div>
                <div className='aie-veld'>
                  <span>.env ({tr('приклад налаштувань', 'voorbeeldinstellingen')})</span>
                  <pre className='aie-codeblok'>{zhPakket.envVoorbeeld}</pre>
                  <span>{tr('Підключення локального комп’ютера, Codex і Claude до вашого вузла', 'Koppeling van lokale computer, Codex en Claude aan uw eigen knooppunt')}</span>
                  <pre className='aie-codeblok'>{`${zhPakket.lokaleAgentOpdracht}\n${zhPakket.codexKoppelOpdracht}\n${zhPakket.claudeKoppelOpdracht}`}</pre>
                </div>
              </div>
            </article>
          </>
        ) : null}
      </div>
    </>
  );
}
