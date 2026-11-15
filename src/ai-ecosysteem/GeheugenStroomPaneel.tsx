// Головний інтерфейс «Стріму пам’яті» (Stroom van geheugen):
// хронологічна, версійна, простір-ізольована довготривала пам’ять із графом зв’язків,
// виявленням суперечностей, екстрактором кандидатів, конструктором пакетів для будь-якого ШІ та експортом.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  Bot,
  Brain,
  Copy,
  Download,
  GitBranch,
  History,
  Link2,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { foutCode } from '../agenten/fouten';
import { canonicalNavigationUrl, routeLang } from '../canoniek-navigatie';
import {
  GEHEUGEN_ACTIE_META,
  GEHEUGEN_DIENST_LABELS,
  GEHEUGEN_DIENSTEN,
  GEHEUGEN_FOUTEN,
  GEHEUGEN_RELATIE_META,
  GEHEUGEN_RELATIE_SOORTEN,
  GEHEUGEN_SOORT_META,
  GEHEUGEN_SOORTEN,
  GEHEUGEN_STATUS_META,
  type GeheugenGebeurtenis,
  type GeheugenGerangschiktItem,
  type GeheugenKandidaat,
  type GeheugenKnoop,
  type GeheugenPakket,
  type GeheugenRelatie,
  type GeheugenRelatieSoort,
  type GeheugenSoort,
  type GeheugenTegenspraak,
} from '../../shared/geheugen-stroom';
import type { AiAgentWerkruimte } from '../../shared/ai-ecosysteem';
import type { AiRuimte } from '../../shared/ai-ruimte';
import type { KluisStand } from '../../shared/sleutelkluis';
import AgentTelegramBotsPaneel from './AgentTelegramBotsPaneel';
import GeheugenTakenPaneel from './GeheugenTakenPaneel';
import './geheugen-stroom.css';

type Tr = (uk: string, nl: string) => string;

type OverzichtData = {
  ruimte: AiRuimte;
  sleutelStand: KluisStand;
  knopen: GeheugenKnoop[];
  relaties: GeheugenRelatie[];
  gebeurtenissen: GeheugenGebeurtenis[];
  tegenspraken: GeheugenTegenspraak[];
  gerangschikt: GeheugenGerangschiktItem[];
  statistiek: {
    totaal: number;
    actief: number;
    vastgepind: number;
    verouderd: number;
    gearchiveerd: number;
    versleuteld: number;
    relaties: number;
    tegenspraken: number;
  };
};

type PaneelTab = 'stroom' | 'pakket' | 'uittreksel' | 'bots' | 'taken';

type Props = {
  tr: Tr;
  werkruimtes?: AiAgentWerkruimte[];
  actieveWerkruimteId?: string;
};

const ctx = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

function geheugenFoutTekst(e: unknown, tr: Tr): string {
  const { code } = foutCode(e);
  if (code === GEHEUGEN_FOUTEN.geheimGeweigerd) {
    return tr(
      'У тексті виявлено можливий ключ доступу або пароль. Стрім пам’яті не зберігає таємних даних — використайте Сховище ключів.',
      'Er is een mogelijke toegangssleutel of wachtwoord herkend. De geheugenstroom bewaart geen geheimen — gebruik de sleutelkluis.',
    );
  }
  if (code === GEHEUGEN_FOUTEN.sleutelGesloten) {
    return tr(
      'Ваше шифрування даних у цій сесії закрите. Відкрийте ключ у налаштуваннях, щоб змінювати зашифровану пам’ять.',
      'Uw gegevensversleuteling is in deze sessie vergrendeld. Ontgrendel uw sleutel om versleuteld geheugen te wijzigen.',
    );
  }
  if (code === GEHEUGEN_FOUTEN.ongeldigeInvoer) {
    return tr('Заповніть заголовок і зміст вузла пам’яті.', 'Vul zowel een titel als een inhoud voor de geheugenknoop in.');
  }
  if (code === GEHEUGEN_FOUTEN.zelfRelatie) {
    return tr('Вузол не можна пов’язати із самим собою.', 'Een knoop kan niet aan zichzelf worden gekoppeld.');
  }
  if (code === GEHEUGEN_FOUTEN.nietGevonden) {
    return tr('Потрібний вузол або зв’язок у цьому просторі не знайдено.', 'De gevraagde knoop of relatie is in deze ruimte niet gevonden.');
  }
  return tr(`Помилка операції (${code || 'невідома'}).`, `Fout tijdens bewerking (${code || 'onbekend'}).`);
}

export default function GeheugenStroomPaneel({ tr, werkruimtes = [], actieveWerkruimteId = '' }: Props) {
  const lang = routeLang();
  const [data, setData] = useState<OverzichtData | null>(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [tab, setTab] = useState<PaneelTab>('stroom');

  // Пошук і фільтри
  const [zoekVraag, setZoekVraag] = useState('');
  const [filterSoort, setFilterSoort] = useState<string>('alle');
  const [filterStatus, setFilterStatus] = useState<string>('actief_en_verouderd');
  const [toonFormulier, setToonFormulier] = useState(false);

  // Форма створення / редагування вузла
  const [editId, setEditId] = useState('');
  const [sleutel, setSleutel] = useState('');
  const [soort, setSoort] = useState<GeheugenSoort>('besluit');
  const [titel, setTitel] = useState('');
  const [inhoud, setInhoud] = useState('');
  const [bronDienst, setBronDienst] = useState('ai');
  const [labelsTekst, setLabelsTekst] = useState('');
  const [vastgepind, setVastgepind] = useState(false);
  const [werkruimteId, setWerkruimteId] = useState(actieveWerkruimteId);
  const [vervangtId, setVervangtId] = useState('');
  const [bevestigVerwijderId, setBevestigVerwijderId] = useState('');

  // Форма додавання зв’язку прямо з картки
  const [linkVanId, setLinkVanId] = useState('');
  const [linkNaarId, setLinkNaarId] = useState('');
  const [linkSoort, setLinkSoort] = useState<GeheugenRelatieSoort>('ondersteunt');
  const [linkToelichting, setLinkToelichting] = useState('');

  // Конструктор пакета
  const [pakketVraag, setPakketVraag] = useState('');
  const [pakketDienst, setPakketDienst] = useState('alle');
  const [pakketLimiet, setPakketLimiet] = useState(3200);
  const [pakket, setPakket] = useState<GeheugenPakket | null>(null);

  // Екстрактор тексту та експорт
  const [uittrekselTekst, setUittrekselTekst] = useState('');
  const [kandidaten, setKandidaten] = useState<GeheugenKandidaat[]>([]);
  const [exportUitvoer, setExportUitvoer] = useState('');

  useEffect(() => {
    if (actieveWerkruimteId) setWerkruimteId(actieveWerkruimteId);
  }, [actieveWerkruimteId]);

  const laadOverzicht = useCallback(async (customVraag?: string) => {
    setLaden(true);
    setFout('');
    try {
      const vraag = customVraag !== undefined ? customVraag : zoekVraag;
      const statusParam = filterStatus === 'actief_en_verouderd' ? '' : filterStatus;
      const res = await api.post('/api/owner/ai/geheugen/overzicht', {
        ...ctx(),
        vraag,
        soort: filterSoort,
        ...(statusParam ? { status: statusParam } : {}),
        ...(werkruimteId ? { werkruimteId } : {}),
      });
      setData(res.data as OverzichtData);
    } catch (e) {
      setFout(geheugenFoutTekst(e, tr));
    } finally {
      setLaden(false);
    }
  }, [zoekVraag, filterSoort, filterStatus, werkruimteId, tr]);

  useEffect(() => {
    void laadOverzicht();
  }, [laadOverzicht]);

  const knopenMap = useMemo(() => {
    const m = new Map<string, GeheugenKnoop>();
    for (const k of data?.knopen ?? []) m.set(k.id, k);
    return m;
  }, [data?.knopen]);

  const relatiesVoorKnoop = useMemo(() => {
    const m = new Map<string, { uitgaand: GeheugenRelatie[]; inkomend: GeheugenRelatie[] }>();
    for (const r of data?.relaties ?? []) {
      const bron = m.get(r.bronKnoopId) ?? { uitgaand: [], inkomend: [] };
      bron.uitgaand.push(r);
      m.set(r.bronKnoopId, bron);

      const doel = m.get(r.doelKnoopId) ?? { uitgaand: [], inkomend: [] };
      doel.inkomend.push(r);
      m.set(r.doelKnoopId, doel);
    }
    return m;
  }, [data?.relaties]);

  const kopieerTekst = async (tekst: string, etiketUk: string, etiketNl: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      setMelding(tr(`Скопійовано: ${etiketUk}`, `Gekopieerd: ${etiketNl}`));
    } catch {
      setFout(tr('Не вдалося скопіювати до буфера.', 'Kopiëren naar klembord mislukt.'));
    }
  };

  const leegFormulier = () => {
    setEditId('');
    setSleutel('');
    setSoort('besluit');
    setTitel('');
    setInhoud('');
    setBronDienst('ai');
    setLabelsTekst('');
    setVastgepind(false);
    setVervangtId('');
  };

  const openBewerken = (k: GeheugenKnoop) => {
    setEditId(k.id);
    setSleutel(k.sleutel);
    setSoort(k.soort);
    setTitel(k.titel);
    setInhoud(k.inhoud);
    setBronDienst(k.bronDienst);
    setLabelsTekst(k.labels.join(', '));
    setVastgepind(k.vastgepind);
    setVervangtId('');
    setToonFormulier(true);
    setFout('');
    setMelding('');
  };

  const bewaarKnoop = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/ai/geheugen/opslaan', {
        ...ctx(),
        ...(editId ? { id: editId } : {}),
        ...(sleutel.trim() ? { sleutel: sleutel.trim() } : {}),
        soort,
        titel,
        inhoud,
        bronDienst,
        labels: labelsTekst,
        vastgepind,
        ...(werkruimteId ? { werkruimteId } : {}),
        ...(vervangtId ? { vervangtId } : {}),
      });
      const wasEdit = Boolean(editId);
      leegFormulier();
      setToonFormulier(false);
      setMelding(wasEdit ? tr('Вузол пам’яті оновлено.', 'Geheugenknoop bijgewerkt.') : tr('Вузол збережено у Стрімі пам’яті.', 'Geheugenknoop opgeslagen in de stroom.'));
      await laadOverzicht();
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const wijzigStatus = async (
    id: string,
    wijziging: { status?: string; vastgepind?: boolean; verwijder?: boolean },
  ) => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/ai/geheugen/status', {
        ...ctx(),
        id,
        ...wijziging,
      });
      if (wijziging.verwijder) {
        setBevestigVerwijderId('');
        if (editId === id) {
          leegFormulier();
          setToonFormulier(false);
        }
      }
      await laadOverzicht();
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const maakRelatie = async (
    bronKnoopId: string,
    doelKnoopId: string,
    relatieSoort: GeheugenRelatieSoort,
    toelichting = '',
  ) => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/ai/geheugen/relatie', {
        ...ctx(),
        actie: 'aanmaken',
        bronKnoopId,
        doelKnoopId,
        relatieSoort,
        toelichting,
      });
      setLinkVanId('');
      setLinkNaarId('');
      setLinkToelichting('');
      setMelding(tr('Зв’язок між вузлами створено.', 'Relatie tussen knopen opgeslagen.'));
      await laadOverzicht();
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const verwijderRelatie = async (relatieId: string) => {
    setBezig(true);
    setFout('');
    try {
      await api.post('/api/owner/ai/geheugen/relatie', {
        ...ctx(),
        actie: 'verwijderen',
        relatieId,
      });
      await laadOverzicht();
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const bouwPakket = async () => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/pakket', {
        ...ctx(),
        vraag: pakketVraag,
        ...(pakketDienst !== 'alle' ? { doelDienst: pakketDienst } : {}),
        ...(werkruimteId ? { werkruimteId } : {}),
        maxTekens: pakketLimiet,
        registreerGebruik: false,
      });
      setPakket(res.data?.pakket as GeheugenPakket);
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const analyseerTekst = async () => {
    if (!uittrekselTekst.trim()) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/uittreksel', {
        ...ctx(),
        tekst: uittrekselTekst,
      });
      setKandidaten((res.data?.kandidaten ?? []) as GeheugenKandidaat[]);
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const bewaarKandidaat = async (k: GeheugenKandidaat) => {
    if (k.geblokkeerdDoorGeheim) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/ai/geheugen/opslaan', {
        ...ctx(),
        sleutel: k.sleutel,
        soort: k.soort,
        titel: k.titel,
        inhoud: k.inhoud,
        labels: k.labels,
        bronDienst: 'ai',
        ...(werkruimteId ? { werkruimteId } : {}),
      });
      setKandidaten((huidig) => huidig.filter((x) => x.sleutel !== k.sleutel));
      setMelding(tr(`Збережено вузол «${k.titel}».`, `Knoop «${k.titel}» opgeslagen.`));
      await laadOverzicht();
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const exporteer = async (formaat: 'markdown' | 'json') => {
    setBezig(true);
    setFout('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/exporteren', {
        ...ctx(),
        taal: lang,
      });
      const tekst = formaat === 'markdown' ? String(res.data?.markdown ?? '') : JSON.stringify(res.data, null, 2);
      setExportUitvoer(tekst);
    } catch (err) {
      setFout(geheugenFoutTekst(err, tr));
    } finally {
      setBezig(false);
    }
  };

  const sleutelLabel =
    data?.sleutelStand === 'open'
      ? tr('Шифрується вашим ключем', 'Versleuteld met uw sleutel')
      : data?.sleutelStand === 'gesloten'
        ? tr('Ключ шифрування закрито в цій сесії', 'Sleutelkluis vergrendeld in deze sessie')
        : tr('Звичайний захист (Сховище ключів вимкнено)', 'Standaardbeveiliging (sleutelkluis uit)');

  const items = data?.gerangschikt ?? [];

  return (
    <section className='gs-container' data-geheugen-stroom='1'>
      <article className='gs-kaart'>
        <div className='gs-kop'>
          <div className='gs-kop-titel'>
            <h2>
              <Brain size={20} aria-hidden='true' />
              {tr('Стрім пам’яті — жива пам’ять між завданнями та агентами', 'Stroom van geheugen — levend geheugen tussen taken en agenten')}
            </h2>
            <p className='gs-subtekst'>
              {tr(
                'Факти, рішення, уподобання й застереження зберігаються в хронологічному графі знань. Старіші рішення не зникають, а чітко позначаються заміненими, а суперечності підсвічуються для вас.',
                'Feiten, besluiten, voorkeuren en waarschuwingen blijven bewaard in een tijdgevoelige kennisgraaf. Oudere besluiten worden gemarkeerd als vervangen en tegenspraken worden zichtbaar gemaakt.',
              )}
            </p>
          </div>
          <div className='gs-statusrij'>
            <span className='gs-pil'>
              {data?.ruimte === 'technisch' ? tr('Технічний простір', 'Technische ruimte') : tr('Приватний простір', 'Privéruimte')}
            </span>
            <span className={`gs-pil ${data?.sleutelStand === 'gesloten' ? 'gs-pil-waarschuwing' : data?.sleutelStand === 'open' ? 'gs-pil-beschermd' : ''}`}>
              {data?.sleutelStand === 'gesloten' ? <Lock size={13} aria-hidden='true' /> : <ShieldCheck size={13} aria-hidden='true' />}
              {sleutelLabel}
            </span>
            <button type='button' className='gs-knop-tweede' onClick={() => void laadOverzicht()} disabled={laden || bezig}>
              <RefreshCw size={14} aria-hidden='true' />
              {tr('Оновити', 'Vernieuwen')}
            </button>
          </div>
        </div>

        {data ? (
          <div className='gs-stat-grid'>
            <div className='gs-stat-cel'>
              <strong>{data.statistiek.actief}</strong>
              <span>{tr('Активні вузли', 'Actieve knopen')}</span>
            </div>
            <div className='gs-stat-cel'>
              <strong>{data.statistiek.vastgepind}</strong>
              <span>{tr('Закріплені', 'Vastgezet')}</span>
            </div>
            <div className='gs-stat-cel'>
              <strong>{data.statistiek.verouderd}</strong>
              <span>{tr('Замінені / старі', 'Vervangen / oud')}</span>
            </div>
            <div className='gs-stat-cel'>
              <strong>{data.statistiek.relaties}</strong>
              <span>{tr('Зв’язки в графі', 'Relaties in graaf')}</span>
            </div>
            <div className='gs-stat-cel'>
              <strong>{data.statistiek.tegenspraken}</strong>
              <span>{tr('Суперечності', 'Tegenspraken')}</span>
            </div>
          </div>
        ) : null}

        {data?.sleutelStand === 'gesloten' ? (
          <div className='gs-kluis-banner' role='status'>
            <span>
              {tr(
                'Ваш ключ Сховища закрито в цій сесії — зашифровані вузли приховані, а збереження нових вузлів тимчасово заблоковане.',
                'Uw sleutelkluis is in deze sessie vergrendeld — versleutelde knopen zijn verborgen en nieuw opslaan staat tijdelijk uit.',
              )}
            </span>
            <a className='gs-knop-tweede' href={canonicalNavigationUrl('identity', 'methods', lang)}>
              <Lock size={14} aria-hidden='true' />
              {tr('Відкрити Сховище ключів', 'Sleutelkluis ontgrendelen')}
            </a>
          </div>
        ) : null}

        {data?.tegenspraken.length ? (
          <div className='gs-conflict-doos' role='region' aria-label={tr('Виявлені суперечності пам’яті', 'Gevonden tegenspraken in het geheugen')}>
            <h3>
              <AlertTriangle size={16} aria-hidden='true' />
              {tr(`Виявлено потенційні суперечності (${data.tegenspraken.length})`, `Mogelijke tegenspraken gevonden (${data.tegenspraken.length})`)}
            </h3>
            {data.tegenspraken.map((t) => {
              const a = knopenMap.get(t.knoopAId);
              const b = knopenMap.get(t.knoopBId);
              const nieuwste = a && b && b.bijgewerktOp >= a.bijgewerktOp ? b : a;
              const oudste = nieuwste && a && nieuwste.id === a.id ? b : a;
              return (
                <div key={t.id} className='gs-conflict-item'>
                  <strong>{t.knoopATitel} ↔ {t.knoopBTitel}</strong>
                  <p className='gs-subtekst'>{tr(t.redenUk, t.redenNl)}</p>
                  {nieuwste && oudste ? (
                    <div className='gs-knoppen'>
                      <button
                        type='button'
                        className='gs-knop-hoofd'
                        disabled={bezig}
                        onClick={() => void maakRelatie(nieuwste.id, oudste.id, 'vervangt', tr('Новіше рішення замінює старіше', 'Nieuwer besluit vervangt ouder besluit'))}
                      >
                        {tr(`«${nieuwste.titel.slice(0, 32)}» замінює старіше`, `«${nieuwste.titel.slice(0, 32)}» vervangt oudere`)}
                      </button>
                      <button
                        type='button'
                        className='gs-knop-tweede'
                        disabled={bezig}
                        onClick={() => void wijzigStatus(oudste.id, { status: 'gearchiveerd' })}
                      >
                        {tr('Архівувати старіший вузол', 'Oudere knoop archiveren')}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {fout ? <p className='gs-fout' role='alert'>{fout}</p> : null}
        {melding ? <p className='gs-melding' role='status'>{melding}</p> : null}

        <div className='gs-tabs' role='tablist'>
          <button
            type='button'
            role='tab'
            className='gs-tab'
            aria-selected={tab === 'stroom'}
            onClick={() => setTab('stroom')}
          >
            <GitBranch size={15} aria-hidden='true' />
            {tr('Стрічка і граф знань', 'Stroom en kennisgraaf')}
          </button>
          <button
            type='button'
            role='tab'
            className='gs-tab'
            aria-selected={tab === 'pakket'}
            onClick={() => setTab('pakket')}
          >
            <Sparkles size={15} aria-hidden='true' />
            {tr('Конструктор пакета для будь-якого ШІ', 'Pakketbouwer voor elke AI')}
          </button>
          <button
            type='button'
            role='tab'
            className='gs-tab'
            aria-selected={tab === 'uittreksel'}
            onClick={() => setTab('uittreksel')}
          >
            <Download size={15} aria-hidden='true' />
            {tr('Витяг із тексту та експорт', 'Extractie uit tekst en export')}
          </button>
          <button
            type='button'
            role='tab'
            className='gs-tab'
            aria-selected={tab === 'bots'}
            onClick={() => setTab('bots')}
          >
            <Bot size={15} aria-hidden='true' />
            {tr('Боти агентів Telegram', 'Agentbots Telegram')}
          </button>
          <button
            type='button'
            role='tab'
            className='gs-tab'
            aria-selected={tab === 'taken'}
            onClick={() => setTab('taken')}
          >
            <ArrowRightLeft size={15} aria-hidden='true' />
            {tr('Перехід задач (13 ШІ)', 'Taakoverdracht (13 AI)')}
          </button>
        </div>

        {tab === 'stroom' ? (
          <>
            <div className='gs-zoekbalk'>
              <input
                type='search'
                className='gs-invoer'
                value={zoekVraag}
                onChange={(e) => setZoekVraag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void laadOverzicht(zoekVraag);
                }}
                placeholder={tr('Пошук за змістом, ключем або міткою (uk/nl)…', 'Zoeken op inhoud, sleutel of label (uk/nl)…')}
              />
              <button type='button' className='gs-knop-tweede' onClick={() => void laadOverzicht(zoekVraag)} disabled={laden}>
                <Search size={14} aria-hidden='true' />
                {tr('Знайти', 'Zoeken')}
              </button>
              <button
                type='button'
                className='gs-knop-hoofd'
                onClick={() => {
                  if (toonFormulier) {
                    leegFormulier();
                    setToonFormulier(false);
                  } else {
                    leegFormulier();
                    setToonFormulier(true);
                  }
                }}
              >
                <Plus size={14} aria-hidden='true' />
                {toonFormulier ? tr('Згорнути форму', 'Formulier sluiten') : tr('Додати вузол', 'Knoop toevoegen')}
              </button>
            </div>

            <div className='gs-grid-3'>
              <label className='gs-veld'>
                <span>{tr('Вид знання', 'Soort kennis')}</span>
                <select className='gs-select' value={filterSoort} onChange={(e) => setFilterSoort(e.target.value)}>
                  <option value='alle'>{tr('Усі види', 'Alle soorten')}</option>
                  {GEHEUGEN_SOORTEN.map((s) => (
                    <option key={s} value={s}>{tr(GEHEUGEN_SOORT_META[s].uk, GEHEUGEN_SOORT_META[s].nl)}</option>
                  ))}
                </select>
              </label>

              <label className='gs-veld'>
                <span>{tr('Стан вузлів', 'Status van knopen')}</span>
                <select className='gs-select' value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value='actief_en_verouderd'>{tr('Активні та замінені', 'Actief en vervangen')}</option>
                  <option value='actief'>{tr('Лише активні', 'Alleen actief')}</option>
                  <option value='gearchiveerd'>{tr('Архівні', 'Gearchiveerd')}</option>
                  <option value='alle'>{tr('Усі стани', 'Alle statussen')}</option>
                </select>
              </label>

              <label className='gs-veld'>
                <span>{tr('Робочий простір агента', 'Agent-werkruimte')}</span>
                <select className='gs-select' value={werkruimteId} onChange={(e) => setWerkruimteId(e.target.value)}>
                  <option value=''>{tr('Увесь активний простір', 'Hele actieve ruimte')}</option>
                  {werkruimtes.map((w) => (
                    <option key={w.id} value={w.id}>{w.naam}</option>
                  ))}
                </select>
              </label>
            </div>

            {toonFormulier ? (
              <form className='gs-form' onSubmit={(e) => void bewaarKnoop(e)}>
                <div className='gs-grid-3'>
                  <label className='gs-veld'>
                    <span>{tr('Вид вузла', 'Soort knoop')}</span>
                    <select className='gs-select' value={soort} onChange={(e) => setSoort(e.target.value as GeheugenSoort)}>
                      {GEHEUGEN_SOORTEN.map((s) => (
                        <option key={s} value={s}>{tr(GEHEUGEN_SOORT_META[s].uk, GEHEUGEN_SOORT_META[s].nl)}</option>
                      ))}
                    </select>
                  </label>
                  <label className='gs-veld'>
                    <span>{tr('Джерело', 'Brondienst')}</span>
                    <select className='gs-select' value={bronDienst} onChange={(e) => setBronDienst(e.target.value)}>
                      {GEHEUGEN_DIENSTEN.map((d) => (
                        <option key={d} value={d}>{tr(GEHEUGEN_DIENST_LABELS[d].uk, GEHEUGEN_DIENST_LABELS[d].nl)}</option>
                      ))}
                    </select>
                  </label>
                  <label className='gs-veld'>
                    <span>{tr('Сталий ключ (необов’язково)', 'Vaste sleutel (optioneel)')}</span>
                    <input
                      type='text'
                      className='gs-invoer'
                      value={sleutel}
                      onChange={(e) => setSleutel(e.target.value)}
                      placeholder={tr('автоматично з заголовка', 'automatisch uit titel')}
                    />
                  </label>
                </div>

                <label className='gs-veld'>
                  <span>{tr('Короткий заголовок', 'Korte titel')}</span>
                  <input
                    type='text'
                    className='gs-invoer'
                    required
                    maxLength={200}
                    value={titel}
                    onChange={(e) => setTitel(e.target.value)}
                    placeholder={tr('Наприклад: Основний формат звітів — чиста українська та нідерландська', 'Bijv.: Standaardtaal voor rapporten is Oekraïens en Nederlands')}
                  />
                </label>

                <label className='gs-veld'>
                  <span>{tr('Зміст пам’яті (ніколи не вводьте паролі або ключі)', 'Inhoud van geheugen (voer nooit wachtwoorden of sleutels in)')}</span>
                  <textarea
                    className='gs-textarea'
                    required
                    maxLength={8000}
                    value={inhoud}
                    onChange={(e) => setInhoud(e.target.value)}
                    placeholder={tr('Опишіть факт, рішення, правило чи уподобання, яким мають користуватися агенти…', 'Beschrijf het feit, besluit, de regel of voorkeur die agenten moeten kennen…')}
                  />
                </label>

                <div className='gs-grid-2'>
                  <label className='gs-veld'>
                    <span>{tr('Мітки через кому', 'Labels met komma')}</span>
                    <input
                      type='text'
                      className='gs-invoer'
                      value={labelsTekst}
                      onChange={(e) => setLabelsTekst(e.target.value)}
                      placeholder={tr('мова, архітектура, пошта', 'taal, architectuur, mail')}
                    />
                  </label>

                  <label className='gs-veld'>
                    <span>{tr('Замінює попередній вузол (необов’язково)', 'Vervangt eerdere knoop (optioneel)')}</span>
                    <select className='gs-select' value={vervangtId} onChange={(e) => setVervangtId(e.target.value)}>
                      <option value=''>{tr('Не замінює нічого', 'Vervangt niets')}</option>
                      {(data?.knopen ?? [])
                        .filter((k) => k.status === 'actief' && k.id !== editId)
                        .map((k) => (
                          <option key={k.id} value={k.id}>{k.titel} ({k.sleutel})</option>
                        ))}
                    </select>
                  </label>
                </div>

                <label className='gs-statusrij'>
                  <input type='checkbox' checked={vastgepind} onChange={(e) => setVastgepind(e.target.checked)} />
                  <span>{tr('Закріпити як постійний вузол (не згасає з часом)', 'Vastzetten als blijvende knoop (vervaagt niet)')}</span>
                </label>

                <div className='gs-knoppen'>
                  <button type='submit' className='gs-knop-hoofd' disabled={bezig}>
                    {editId ? tr('Оновити вузол пам’яті', 'Geheugenknoop bijwerken') : tr('Зберегти у Стрім пам’яті', 'Opslaan in Stroom van geheugen')}
                  </button>
                  <button
                    type='button'
                    className='gs-knop-tweede'
                    onClick={() => {
                      leegFormulier();
                      setToonFormulier(false);
                    }}
                  >
                    {tr('Скасувати', 'Annuleren')}
                  </button>
                </div>
              </form>
            ) : null}

            {laden ? (
              <p className='gs-subtekst'>{tr('Завантажуємо вузли пам’яті…', 'Geheugenknopen laden…')}</p>
            ) : items.length === 0 ? (
              <div className='gs-leeg' data-geheugen-leeg='1'>
                <Brain size={24} aria-hidden='true' />
                <strong>
                  {data?.sleutelStand === 'gesloten' && (data?.statistiek.versleuteld ?? 0) > 0
                    ? tr(`Зашифровані вузли приховані (усього: ${data.statistiek.versleuteld})`, `Versleutelde knopen zijn verborgen (totaal: ${data.statistiek.versleuteld})`)
                    : tr('У цій вибірці ще немає вузлів пам’яті', 'Nog geen geheugenknopen in deze selectie')}
                </strong>
                <p className='gs-subtekst'>
                  {data?.sleutelStand === 'gesloten' && (data?.statistiek.versleuteld ?? 0) > 0
                    ? tr('Відкрийте Сховище ключів вище, щоб розшифрувати й переглянути ваші збережені вузли.', 'Ontgrendel hierboven uw sleutelkluis om uw opgeslagen knopen te ontsleutelen en te bekijken.')
                    : tr(
                        'Додайте перший факт, рішення чи уподобання або витягніть їх автоматично з уривку тексту на третій вкладці.',
                        'Voeg het eerste feit, besluit of voorkeur toe of haal ze automatisch uit een tekst op het derde tabblad.',
                      )}
                </p>
              </div>
            ) : (
              <ul className='gs-knopen-lijst'>
                {items.map((item) => {
                  const k = item.knoop;
                  const rels = relatiesVoorKnoop.get(k.id);
                  const linkerOpen = linkVanId === k.id;
                  return (
                    <li
                      key={k.id}
                      className={`gs-knoop-kaart${k.vastgepind ? ' is-vastgepind' : ''}${k.status === 'verouderd' ? ' is-verouderd' : ''}`}
                      data-geheugen-knoop={k.sleutel}
                    >
                      <div className='gs-knoop-kop'>
                        <div>
                          <strong>{k.titel}</strong>{' '}
                          <code>{k.sleutel}</code>
                        </div>
                        <div className='gs-statusrij'>
                          <span className='gs-pil'>{tr(GEHEUGEN_SOORT_META[k.soort].uk, GEHEUGEN_SOORT_META[k.soort].nl)}</span>
                          <span className='gs-pil'>{tr(GEHEUGEN_STATUS_META[k.status].uk, GEHEUGEN_STATUS_META[k.status].nl)}</span>
                          {k.versleuteld ? <span className='gs-pil gs-pil-beschermd'>{tr('Зашифровано', 'Versleuteld')}</span> : null}
                          <span className='gs-pil'>{tr('Бал', 'Score')}: {item.score}</span>
                        </div>
                      </div>

                      <p className='gs-knoop-inhoud'>
                        {k.vergrendeld
                          ? tr('Вміст зашифровано вашим ключем. Розблокуйте ключ у Сховищі, щоб переглянути текст.', 'Inhoud is versleuteld met uw eigen sleutel. Ontgrendel uw sleutel om de tekst te zien.')
                          : k.inhoud}
                      </p>

                      {item.vervangenDoor ? (
                        <p className='gs-subtekst'>
                          ⚠ {tr('Замінено новішим вузлом:', 'Vervangen door nieuwere knoop:')} <strong>{item.vervangenDoor.titel}</strong> (<code>{item.vervangenDoor.sleutel}</code>)
                        </p>
                      ) : null}

                      <div className='gs-statusrij'>
                        <span className='gs-pil'>
                          {tr(
                            GEHEUGEN_DIENST_LABELS[k.bronDienst]?.uk ?? k.bronDienst,
                            GEHEUGEN_DIENST_LABELS[k.bronDienst]?.nl ?? k.bronDienst,
                          )}
                        </span>
                        {k.bronAgent ? <span className='gs-pil'>{k.bronAgent}</span> : null}
                        {k.labels.map((l) => <span key={l} className='gs-pil'>#{l}</span>)}
                        {item.redenenUk.map((r, idx) => (
                          <span key={idx} className='gs-subtekst'>· {tr(r, item.redenenNl[idx] ?? r)}</span>
                        ))}
                      </div>

                      {rels && (rels.uitgaand.length > 0 || rels.inkomend.length > 0) ? (
                        <div className='gs-relaties-doos'>
                          {rels.uitgaand.map((r) => {
                            const doel = knopenMap.get(r.doelKnoopId);
                            return (
                              <div key={r.id} className='gs-relatie-rij'>
                                <span>
                                  → <b>{tr(GEHEUGEN_RELATIE_META[r.relatieSoort].uk, GEHEUGEN_RELATIE_META[r.relatieSoort].nl)}</b>:{' '}
                                  {doel?.titel ?? r.doelKnoopId}
                                  {r.toelichting ? ` (${r.toelichting})` : ''}
                                </span>
                                <button type='button' className='gs-knop-tweede' onClick={() => void verwijderRelatie(r.id)} disabled={bezig}>
                                  {tr('Прибрати', 'Ontkoppelen')}
                                </button>
                              </div>
                            );
                          })}
                          {rels.inkomend.map((r) => {
                            const bron = knopenMap.get(r.bronKnoopId);
                            return (
                              <div key={r.id} className='gs-relatie-rij'>
                                <span>
                                  ← <b>{tr(GEHEUGEN_RELATIE_META[r.relatieSoort].omgekeerdUk, GEHEUGEN_RELATIE_META[r.relatieSoort].omgekeerdNl)}</b>:{' '}
                                  {bron?.titel ?? r.bronKnoopId}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className='gs-knoppen'>
                        <button
                          type='button'
                          className='gs-knop-tweede'
                          disabled={bezig}
                          onClick={() => void wijzigStatus(k.id, { vastgepind: !k.vastgepind })}
                        >
                          {k.vastgepind ? <PinOff size={14} aria-hidden='true' /> : <Pin size={14} aria-hidden='true' />}
                          {k.vastgepind ? tr('Відкріпити', 'Losmaken') : tr('Закріпити', 'Vastzetten')}
                        </button>

                        {!k.vergrendeld ? (
                          <button
                            type='button'
                            className='gs-knop-tweede'
                            disabled={bezig}
                            onClick={() => openBewerken(k)}
                          >
                            <Pencil size={14} aria-hidden='true' />
                            {tr('Редагувати', 'Bewerken')}
                          </button>
                        ) : null}

                        <button
                          type='button'
                          className='gs-knop-tweede'
                          disabled={bezig}
                          onClick={() => setLinkVanId(linkerOpen ? '' : k.id)}
                        >
                          <Link2 size={14} aria-hidden='true' />
                          {tr('Пов’язати', 'Koppelen')}
                        </button>

                        {k.status !== 'gearchiveerd' ? (
                          <button
                            type='button'
                            className='gs-knop-tweede'
                            disabled={bezig}
                            onClick={() => void wijzigStatus(k.id, { status: 'gearchiveerd' })}
                          >
                            <Archive size={14} aria-hidden='true' />
                            {tr('В архів', 'Archiveren')}
                          </button>
                        ) : (
                          <button
                            type='button'
                            className='gs-knop-tweede'
                            disabled={bezig}
                            onClick={() => void wijzigStatus(k.id, { status: 'actief' })}
                          >
                            <ArchiveRestore size={14} aria-hidden='true' />
                            {tr('Відновити', 'Herstellen')}
                          </button>
                        )}

                        {bevestigVerwijderId === k.id ? (
                          <>
                            <button
                              type='button'
                              className='gs-knop-gevaar'
                              disabled={bezig}
                              onClick={() => void wijzigStatus(k.id, { verwijder: true })}
                            >
                              <Trash2 size={14} aria-hidden='true' />
                              {tr('Точно видалити', 'Definitief verwijderen')}
                            </button>
                            <button
                              type='button'
                              className='gs-knop-tweede'
                              disabled={bezig}
                              onClick={() => setBevestigVerwijderId('')}
                            >
                              {tr('Скасувати', 'Annuleren')}
                            </button>
                          </>
                        ) : (
                          <button
                            type='button'
                            className='gs-knop-gevaar'
                            disabled={bezig}
                            onClick={() => setBevestigVerwijderId(k.id)}
                          >
                            <Trash2 size={14} aria-hidden='true' />
                            {tr('Видалити', 'Verwijderen')}
                          </button>
                        )}
                      </div>

                      {linkerOpen ? (
                        <div className='gs-form'>
                          <div className='gs-grid-3'>
                            <label className='gs-veld'>
                              <span>{tr('Тип зв’язку', 'Soort relatie')}</span>
                              <select className='gs-select' value={linkSoort} onChange={(e) => setLinkSoort(e.target.value as GeheugenRelatieSoort)}>
                                {GEHEUGEN_RELATIE_SOORTEN.map((rs) => (
                                  <option key={rs} value={rs}>{tr(GEHEUGEN_RELATIE_META[rs].uk, GEHEUGEN_RELATIE_META[rs].nl)}</option>
                                ))}
                              </select>
                            </label>
                            <label className='gs-veld'>
                              <span>{tr('Цільовий вузол', 'Doelknoop')}</span>
                              <select className='gs-select' value={linkNaarId} onChange={(e) => setLinkNaarId(e.target.value)}>
                                <option value=''>{tr('Оберіть вузол…', 'Kies een knoop…')}</option>
                                {(data?.knopen ?? [])
                                  .filter((x) => x.id !== k.id)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>{x.titel} ({x.sleutel})</option>
                                  ))}
                              </select>
                            </label>
                            <label className='gs-veld'>
                              <span>{tr('Коротке пояснення', 'Korte toelichting')}</span>
                              <input type='text' className='gs-invoer' value={linkToelichting} onChange={(e) => setLinkToelichting(e.target.value)} />
                            </label>
                          </div>
                          <div className='gs-knoppen'>
                            <button
                              type='button'
                              className='gs-knop-hoofd'
                              disabled={bezig || !linkNaarId}
                              onClick={() => void maakRelatie(k.id, linkNaarId, linkSoort, linkToelichting)}
                            >
                              {tr('Створити зв’язок', 'Relatie opslaan')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {data?.gebeurtenissen.length ? (
              <details className='gs-events-details' data-geheugen-events='1'>
                <summary>
                  <History size={15} aria-hidden='true' />
                  {tr(
                    `Хронологія подій Стріму пам’яті (${data.gebeurtenissen.length})`,
                    `Tijdlijn van geheugengebeurtenissen (${data.gebeurtenissen.length})`,
                  )}
                </summary>
                <ul className='gs-events-lijst'>
                  {data.gebeurtenissen.slice(0, 15).map((g) => {
                    const actieMeta = GEHEUGEN_ACTIE_META[g.actie];
                    const gekoppeldeKnoop = g.knoopId ? knopenMap.get(g.knoopId) : undefined;
                    return (
                      <li key={g.id} className='gs-events-rij'>
                        <span>
                          <strong>{actieMeta ? tr(actieMeta.uk, actieMeta.nl) : g.actie}</strong>
                          {gekoppeldeKnoop ? ` · ${gekoppeldeKnoop.titel}` : ''}
                          {g.bronAgent ? ` (${g.bronAgent})` : ''}
                        </span>
                        <span className='gs-subtekst'>
                          {new Date(g.aangemaaktOp).toLocaleString(lang === 'nl' ? 'nl-NL' : 'uk-UA')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}

        {tab === 'pakket' ? (
          <div className='gs-container'>
            <p className='gs-subtekst'>
              {tr(
                'Сформуйте компактний і точний пакет знань під конкретне завдання в межах заданого обсягу символів, щоб вставити його в будь-який зовнішній або локальний ШІ.',
                'Stel een beknopt geheugenpakket samen voor een specifieke taak binnen uw tekenlimiet, zodat u het in elke externe of lokale AI kunt gebruiken.',
              )}
            </p>

            <div className='gs-grid-3'>
              <label className='gs-veld'>
                <span>{tr('Опис поточного завдання або запит', 'Taakomschrijving of vraag')}</span>
                <input
                  type='text'
                  className='gs-invoer'
                  value={pakketVraag}
                  onChange={(e) => setPakketVraag(e.target.value)}
                  placeholder={tr('Наприклад: підготовка звіту чи робота з поштою', 'Bijv.: rapport voorbereiden of e-mail beheren')}
                />
              </label>
              <label className='gs-veld'>
                <span>{tr('Пріоритет служби', 'Prioriteit van dienst')}</span>
                <select className='gs-select' value={pakketDienst} onChange={(e) => setPakketDienst(e.target.value)}>
                  <option value='alle'>{tr('Усі служби рівні', 'Alle diensten gelijk')}</option>
                  {GEHEUGEN_DIENSTEN.map((d) => (
                    <option key={d} value={d}>{tr(GEHEUGEN_DIENST_LABELS[d].uk, GEHEUGEN_DIENST_LABELS[d].nl)}</option>
                  ))}
                </select>
              </label>
              <label className='gs-veld'>
                <span>{tr('Бюджет символів (400–12000)', 'Tekenbudget (400–12000)')}</span>
                <input
                  type='number'
                  min={400}
                  max={12000}
                  step={200}
                  className='gs-invoer'
                  value={pakketLimiet}
                  onChange={(e) => setPakketLimiet(Number(e.target.value) || 3200)}
                />
              </label>
            </div>

            <div className='gs-knoppen'>
              <button type='button' className='gs-knop-hoofd' onClick={() => void bouwPakket()} disabled={bezig}>
                <Sparkles size={14} aria-hidden='true' />
                {tr('Побудувати пакет пам’яті', 'Geheugenpakket samenstellen')}
              </button>
              {pakket ? (
                <button
                  type='button'
                  className='gs-knop-tweede'
                  onClick={() => void kopieerTekst(lang === 'nl' ? pakket.tekstNl : pakket.tekstUk, 'пакет пам’яті', 'geheugenpakket')}
                >
                  <Copy size={14} aria-hidden='true' />
                  {tr('Копіювати пакет', 'Pakket kopiëren')}
                </button>
              ) : null}
            </div>

            {pakket ? (
              <>
                <div className='gs-statusrij'>
                  <span className='gs-pil'>
                    {tr(`Відібрано ${pakket.items.length} з ${pakket.totaalBekeken}`, `${pakket.items.length} van ${pakket.totaalBekeken} geselecteerd`)}
                  </span>
                  <span className='gs-pil'>
                    {tr(`Обсяг: ${pakket.tekensGebruikt} / ${pakket.tekensLimiet} симв.`, `Omvang: ${pakket.tekensGebruikt} / ${pakket.tekensLimiet} tekens`)}
                  </span>
                </div>
                <pre className='gs-code'>{lang === 'nl' ? pakket.tekstNl : pakket.tekstUk}</pre>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === 'uittreksel' ? (
          <div className='gs-container'>
            <div className='gs-form'>
              <label className='gs-veld'>
                <span>{tr('Вставте уривок діалогу, листа або нотатки для автоматичного виокремлення фактів і рішень', 'Plak een gesprek, bericht of notitie om feiten en besluiten voor te stellen')}</span>
                <textarea
                  className='gs-textarea'
                  value={uittrekselTekst}
                  onChange={(e) => setUittrekselTekst(e.target.value)}
                  placeholder={tr('Наприклад: Ми вирішили завжди готувати двомовні звіти без англіцизмів. Не можна змінювати базу без міграції…', 'Bijv.: We hebben besloten om altijd tweetalige rapporten te maken. Wijzig nooit de database zonder migratie…')}
                />
              </label>
              <div className='gs-knoppen'>
                <button type='button' className='gs-knop-hoofd' disabled={bezig || !uittrekselTekst.trim()} onClick={() => void analyseerTekst()}>
                  <Sparkles size={14} aria-hidden='true' />
                  {tr('Витягти кандидатів у пам’ять', 'Kandidaten uit tekst halen')}
                </button>
              </div>
            </div>

            {kandidaten.length ? (
              <ul className='gs-knopen-lijst'>
                {kandidaten.map((k) => (
                  <li key={k.sleutel} className='gs-knoop-kaart'>
                    <div className='gs-knoop-kop'>
                      <strong>{k.titel}</strong>
                      <span className='gs-pil'>{tr(GEHEUGEN_SOORT_META[k.soort].uk, GEHEUGEN_SOORT_META[k.soort].nl)}</span>
                    </div>
                    <p className='gs-knoop-inhoud'>{k.inhoud}</p>
                    <div className='gs-knoppen'>
                      {k.geblokkeerdDoorGeheim ? (
                        <span className='gs-pil gs-pil-waarschuwing'>
                          {tr('Заблоковано фільтром таємниць', 'Geblokkeerd door geheimenfilter')}
                        </span>
                      ) : (
                        <button type='button' className='gs-knop-hoofd' disabled={bezig} onClick={() => void bewaarKandidaat(k)}>
                          <Plus size={14} aria-hidden='true' />
                          {tr('Зберегти у Стрім', 'Opslaan in stroom')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className='gs-form'>
              <strong>{tr('Прозорий експорт без прив’язки до однієї платформи', 'Transparante export zonder platformbinding')}</strong>
              <p className='gs-subtekst'>
                {tr(
                  'У будь-який момент заберіть усю свою пам’ять, зв’язки та історію змін у чистому Markdown або JSON.',
                  'Neem op elk moment al uw geheugen, relaties en geschiedenis mee als leesbare Markdown of JSON.',
                )}
              </p>
              <div className='gs-knoppen'>
                <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => void exporteer('markdown')}>
                  <Download size={14} aria-hidden='true' />
                  {tr('Сформувати Markdown', 'Markdown opbouwen')}
                </button>
                <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => void exporteer('json')}>
                  <Download size={14} aria-hidden='true' />
                  {tr('Сформувати JSON', 'JSON opbouwen')}
                </button>
                {exportUitvoer ? (
                  <button type='button' className='gs-knop-hoofd' onClick={() => void kopieerTekst(exportUitvoer, 'експорт пам’яті', 'geheugenexport')}>
                    <Copy size={14} aria-hidden='true' />
                    {tr('Копіювати експорт', 'Export kopiëren')}
                  </button>
                ) : null}
              </div>
              {exportUitvoer ? <pre className='gs-code'>{exportUitvoer}</pre> : null}
            </div>
          </div>
        ) : null}

        {tab === 'bots' ? (
          <AgentTelegramBotsPaneel tr={tr} onStroomBijgewerkt={() => void laadOverzicht(zoekVraag)} />
        ) : null}

        {tab === 'taken' ? (
          <GeheugenTakenPaneel tr={tr} onStroomBijgewerkt={() => void laadOverzicht(zoekVraag)} />
        ) : null}
      </article>
    </section>
  );
}
