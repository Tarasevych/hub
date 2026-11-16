// Єдиний модуль керування навичками ШІ-агентів та їхніми профілями на сторінці /agenten.
// Поєднує вбудовані системні навички (.agents/skills/*), протокольні навички (mr://skills/*) і власні двомовні навички:
//   • матриця 9 профілів агентів із кількістю активних навичок та фільтрацією;
//   • живий пошук і підбір навичок за темою (POST /api/owner/vaardigheden/aanbevelen);
//   • перемикачі ввімкнення/вимкнення будь-якої навички глобально або для конкретного агента;
//   • створення/редагування власних двомовних навичок з перевіркою мовного закону й забороною секретів;
//   • імпорт/експорт у форматі SKILL.md та JSON-пакета (mr-vaardigheid-v1) + історія версій і відкат.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  History,
  Layers,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import type { AgentSlug } from '../../shared/connector-v2/agenten';
import {
  bouwSkillMarkdown,
  bouwVaardigheidPakket,
  isVaardigheidActiefVoorAgent,
  vaardFoutTekst,
  valideerVaardigheidInvoer,
  type VaardigheidAanbeveling,
  type VaardigheidAgentStand,
  type VaardigheidItem,
  type VaardigheidRevisie,
  type VaardigheidRuimte,
} from '../../shared/vaardigheden-ecosysteem';
import { Badge, Knop, Segment } from './ui';
import './vaardigheden-maquette.css';

type AgentProfielSamenvatting = {
  slug: AgentSlug;
  naam: string;
  actieveVaardigheden: string[];
  aantalActief: number;
};

type OverzichtAntwoord = {
  ruimte: VaardigheidRuimte;
  taal: 'uk' | 'nl';
  vaardigheden: VaardigheidItem[];
  ingebouwd: VaardigheidItem[];
  eigen: VaardigheidItem[];
  standen: VaardigheidAgentStand[];
  revisies: VaardigheidRevisie[];
  agentProfielen: AgentProfielSamenvatting[];
  agenten: Array<{ slug: AgentSlug; naam: string }>;
};

type BronFilter = 'alle' | 'systeem' | 'protocol' | 'eigen';

const LEEG_FORMULIER = {
  slug: '',
  titelUk: '',
  titelNl: '',
  samenvattingUk: '',
  samenvattingNl: '',
  inhoudUk: '',
  inhoudNl: '',
  termenUkTekst: '',
  termenNlTekst: '',
  hulpmiddelenTekst: '',
  agentKoppelingen: [] as AgentSlug[],
};

export default function VaardighedenBeheer({
  tr,
  vastAgent,
  compact = false,
  onLeesResourceInInspector,
}: {
  tr: Tr;
  vastAgent?: AgentSlug;
  compact?: boolean;
  onLeesResourceInInspector?: (uri: string) => void;
}) {
  const taal: 'uk' | 'nl' = tr('uk', 'nl') === 'nl' ? 'nl' : 'uk';
  const [data, setData] = useState<OverzichtAntwoord | null>(null);
  const [laden, setLaden] = useState(false);
  const [bezig, setBezig] = useState('');
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');

  const [gekozenAgent, setGekozenAgent] = useState<AgentSlug | '*'>(vastAgent ?? '*');
  const [bronFilter, setBronFilter] = useState<BronFilter>('alle');
  const [zoekTekst, setZoekTekst] = useState('');
  const [aanbevelingen, setAanbevelingen] = useState<VaardigheidAanbeveling[] | null>(null);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [gekopieerd, setGekopieerd] = useState('');

  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [form, setForm] = useState(LEEG_FORMULIER);
  const [importOpen, setImportOpen] = useState(false);
  const [importTekst, setImportTekst] = useState('');
  const [historieOpen, setHistorieOpen] = useState(false);

  useEffect(() => {
    if (vastAgent) setGekozenAgent(vastAgent);
  }, [vastAgent]);

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const res = await api.post('/api/owner/vaardigheden/overzicht', sessionBody());
      setData(res.data as OverzichtAntwoord);
      setFout('');
    } catch (e) {
      setFout(String((e as Error)?.message || 'VAARD_LADEN_MISLUKT'));
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  const kopieer = async (sleutel: string, tekst: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(sleutel);
      setTimeout(() => setGekopieerd((v) => (v === sleutel ? '' : v)), 1600);
    } catch {
      /* копіювання недоступне */
    }
  };

  const zoekAanbevelingen = async () => {
    const q = zoekTekst.trim();
    if (!q) {
      setAanbevelingen(null);
      return;
    }
    setBezig('aanbevelen');
    setFout('');
    try {
      const res = await api.post('/api/owner/vaardigheden/aanbevelen', {
        ...sessionBody(),
        vraag: q,
        agent: gekozenAgent === '*' ? undefined : gekozenAgent,
        maximum: 6,
      });
      setAanbevelingen((res.data as { aanbevelingen: VaardigheidAanbeveling[] }).aanbevelingen ?? []);
    } catch (e) {
      setFout(String((e as Error)?.message || 'VAARD_AANBEVELEN_MISLUKT'));
    } finally {
      setBezig('');
    }
  };

  const schakelVoorAgent = async (item: VaardigheidItem, doelActief: boolean) => {
    const doelAgent: AgentSlug | '*' = gekozenAgent;
    const sleutel = `stand:${doelAgent}:${item.id}`;
    setBezig(sleutel);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/vaardigheden/koppelen', {
        ...sessionBody(),
        agentSlug: doelAgent,
        vaardigheidId: item.id,
        actief: doelActief,
      });
      await laad();
      setMelding(
        doelActief
          ? tr(`Навичку «${item.id}» увімкнено.`, `Vaardigheid «${item.id}» ingeschakeld.`)
          : tr(`Навичку «${item.id}» вимкнено.`, `Vaardigheid «${item.id}» uitgeschakeld.`),
      );
    } catch (e) {
      const code = String((e as Error)?.message || 'VAARD_KOPPELEN_MISLUKT');
      setFout(vaardFoutTekst(code, taal));
    } finally {
      setBezig('');
    }
  };

  const opslaanEigen = async () => {
    const payload = {
      slug: form.slug.trim().toLowerCase(),
      titelUk: form.titelUk.trim(),
      titelNl: form.titelNl.trim(),
      samenvattingUk: form.samenvattingUk.trim(),
      samenvattingNl: form.samenvattingNl.trim(),
      inhoudUk: form.inhoudUk,
      inhoudNl: form.inhoudNl,
      termenUk: form.termenUkTekst.split(',').map((s) => s.trim()).filter(Boolean),
      termenNl: form.termenNlTekst.split(',').map((s) => s.trim()).filter(Boolean),
      vereisteHulpmiddelen: form.hulpmiddelenTekst.split(',').map((s) => s.trim()).filter(Boolean),
      agentKoppelingen: form.agentKoppelingen,
      actief: true,
    };
    const check = valideerVaardigheidInvoer(payload);
    if (!check.ok) {
      setFout(vaardFoutTekst(check.code, taal));
      return;
    }
    setBezig('opslaan');
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/vaardigheden/opslaan', { ...sessionBody(), ...payload });
      setBewerkOpen(false);
      setForm(LEEG_FORMULIER);
      await laad();
      setMelding(tr(`Навичку «${payload.slug}» збережено в поточному просторі.`, `Vaardigheid «${payload.slug}» opgeslagen in de actieve ruimte.`));
    } catch (e) {
      const code = String((e as Error)?.message || 'VAARD_OPSLAAN_MISLUKT');
      setFout(vaardFoutTekst(code, taal));
    } finally {
      setBezig('');
    }
  };

  const importeerPakket = async () => {
    if (!importTekst.trim()) return;
    setBezig('importeren');
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/vaardigheden/importeren', {
        ...sessionBody(),
        inhoud: importTekst,
      });
      const item = (res.data as { item?: VaardigheidItem }).item;
      setImportOpen(false);
      setImportTekst('');
      await laad();
      setMelding(
        tr(
          `Навичку «${item?.id ?? ''}» успішно імпортовано.`,
          `Vaardigheid «${item?.id ?? ''}» is geïmporteerd.`,
        ),
      );
    } catch (e) {
      const code = String((e as Error)?.message || 'VAARD_MARKDOWN_ONGELDIG');
      setFout(vaardFoutTekst(code, taal));
    } finally {
      setBezig('');
    }
  };

  const verwijderEigen = async (slug: string) => {
    setBezig(`verwijder:${slug}`);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/vaardigheden/verwijderen', { ...sessionBody(), slug });
      await laad();
      setMelding(tr(`Власну навичку «${slug}» видалено.`, `Eigen vaardigheid «${slug}» verwijderd.`));
    } catch (e) {
      const code = String((e as Error)?.message || 'VAARD_VERWIJDEREN_MISLUKT');
      setFout(vaardFoutTekst(code, taal));
    } finally {
      setBezig('');
    }
  };

  const herstelRevisie = async (revisieId: string) => {
    setBezig(`herstel:${revisieId}`);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/vaardigheden/herstellen', { ...sessionBody(), revisieId });
      const item = (res.data as { item?: VaardigheidItem }).item;
      await laad();
      setMelding(
        tr(
          `Навичку «${item?.id ?? ''}» відновлено до нової версії v${item?.versie ?? ''}.`,
          `Vaardigheid «${item?.id ?? ''}» hersteld als versie v${item?.versie ?? ''}.`,
        ),
      );
    } catch (e) {
      const code = String((e as Error)?.message || 'VAARD_NIET_GEVONDEN');
      setFout(vaardFoutTekst(code, taal));
    } finally {
      setBezig('');
    }
  };

  const bewerkBestaande = (item: VaardigheidItem) => {
    setForm({
      slug: item.id,
      titelUk: item.titel.uk,
      titelNl: item.titel.nl,
      samenvattingUk: item.samenvatting.uk,
      samenvattingNl: item.samenvatting.nl,
      inhoudUk: item.inhoud.uk,
      inhoudNl: item.inhoud.nl,
      termenUkTekst: item.termen.uk.join(', '),
      termenNlTekst: item.termen.nl.join(', '),
      hulpmiddelenTekst: item.vereisteHulpmiddelen.join(', '),
      agentKoppelingen: item.agentKoppelingen,
    });
    setBewerkOpen(true);
    setImportOpen(false);
  };

  const gefilterdeVaardigheden = useMemo(() => {
    if (!data) return [];
    const q = zoekTekst.trim().toLowerCase();
    return data.vaardigheden.filter((v) => {
      if (bronFilter === 'systeem' && v.bron !== 'systeem') return false;
      if (bronFilter === 'protocol' && v.bron !== 'protocol') return false;
      if (bronFilter === 'eigen' && v.bron !== 'eigen' && v.bron !== 'geimporteerd') return false;
      if (!q) return true;
      const alles = [
        v.id,
        v.titel.uk,
        v.titel.nl,
        v.samenvatting.uk,
        v.samenvatting.nl,
        ...v.termen.uk,
        ...v.termen.nl,
      ]
        .join(' ')
        .toLowerCase();
      return alles.includes(q);
    });
  }, [data, bronFilter, zoekTekst]);

  const bronLabel = (bron: VaardigheidItem['bron']) => {
    if (bron === 'systeem') return tr('Системна', 'Systeem');
    if (bron === 'protocol') return tr('Протокол MCP', 'MCP-protocol');
    if (bron === 'geimporteerd') return tr('Імпортована', 'Geïmporteerd');
    return tr('Власна', 'Eigen');
  };

  return (
    <section className='ag-vaard-kaart' data-vaardigheden-beheer='1'>
      <div className='ag-vaard-kop'>
        <div className='ag-vaard-titel-blok'>
          <h4>
            <Layers size={17} aria-hidden='true' />
            {vastAgent
              ? tr(`Модульні навички агента (${vastAgent})`, `Modulaire vaardigheden voor ${vastAgent}`)
              : tr('Екосистема модульних навичок і профілів агентів', 'Ecosysteem van modulaire vaardigheden en agentprofielen')}
            {data ? (
              <Badge toon={data.ruimte === 'technisch' ? 'warn' : 'info'}>
                {data.ruimte === 'technisch'
                  ? tr('Технічний простір', 'Technische ruimte')
                  : tr('Приватний простір', 'Privéruimte')}
              </Badge>
            ) : null}
          </h4>
          <p className='ag-vaard-uitleg'>
            {tr(
              'Навички дають ШІ-агентам перевірені покрокові настанови (mr://skills/*) без розширення прав. Керуйте прив’язками до агентів, створюйте власні двомовні навички та відновлюйте попередні версії.',
              'Vaardigheden geven AI-agenten gecontroleerde werkinstructies (mr://skills/*) zonder extra rechten. Beheer agentkoppelingen, maak eigen tweetalige vaardigheden en herstel eerdere versies.',
            )}
          </p>
        </div>
        <div className='ag-knoppen'>
          <Knop
            icoon={<Plus />}
            toon='primary'
            onClick={() => {
              setForm({
                ...LEEG_FORMULIER,
                agentKoppelingen: vastAgent ? [vastAgent] : [],
              });
              setBewerkOpen((v) => !v);
              setImportOpen(false);
            }}
            data='vaard-nieuw'
          >
            {bewerkOpen ? tr('Закрити редактор', 'Editor sluiten') : tr('Нова навичка', 'Nieuwe vaardigheid')}
          </Knop>
          {!compact ? (
            <Knop
              icoon={<Upload />}
              onClick={() => {
                setImportOpen((v) => !v);
                setBewerkOpen(false);
              }}
              data='vaard-import-toggle'
            >
              {tr('Імпорт SKILL.md / JSON', 'Importeer SKILL.md / JSON')}
            </Knop>
          ) : null}
          <Knop
            icoon={<History />}
            onClick={() => setHistorieOpen((v) => !v)}
            data='vaard-historie-toggle'
          >
            {tr(`Історія (${data?.revisies.length ?? 0})`, `Geschiedenis (${data?.revisies.length ?? 0})`)}
          </Knop>
          <Knop icoon={<RefreshCw />} bezig={laden} onClick={() => void laad()} data='vaard-ververs'>
            {tr('Оновити', 'Vernieuwen')}
          </Knop>
        </div>
      </div>

      {fout ? <p className='ag-melding ag-melding-fout' role='alert' data-vaard-fout='1'>{fout}</p> : null}
      {melding ? <p className='ag-melding ag-melding-ok' role='status' data-vaard-melding='1'>{melding}</p> : null}

      {/* Матриця профілів 9 агентів */}
      {!vastAgent && data?.agentProfielen.length ? (
        <div className='ag-vaard-profielen' data-vaard-profielen='1'>
          <button
            type='button'
            className={`ag-vaard-profiel-knop${gekozenAgent === '*' ? ' is-actief' : ''}`}
            onClick={() => setGekozenAgent('*')}
            data-profiel-agent='*'
          >
            <div className='ag-vaard-profiel-kop'>
              <span>{tr('Усі агенти разом', 'Alle agenten samen')}</span>
              <Badge toon='info'>{data.vaardigheden.length}</Badge>
            </div>
            <span className='ag-vaard-profiel-sub'>
              {tr('Спільний каталог простору', 'Gezamenlijke ruimtecatalogus')}
            </span>
          </button>
          {data.agentProfielen.map((p) => (
            <button
              key={p.slug}
              type='button'
              className={`ag-vaard-profiel-knop${gekozenAgent === p.slug ? ' is-actief' : ''}`}
              onClick={() => setGekozenAgent(p.slug)}
              data-profiel-agent={p.slug}
            >
              <div className='ag-vaard-profiel-kop'>
                <span>{p.naam}</span>
                <Badge toon={p.aantalActief > 0 ? 'ok' : 'off'}>{p.aantalActief}</Badge>
              </div>
              <span className='ag-vaard-profiel-sub'>
                {tr(`Активних навичок: ${p.aantalActief}`, `Actieve vaardigheden: ${p.aantalActief}`)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Редактор створення або оновлення власної двомовної навички */}
      {bewerkOpen ? (
        <div className='ag-vaard-formulier' data-vaard-editor='1'>
          <h5>{tr('Редактор двомовної навички (uk + nl)', 'Editor voor tweetalige vaardigheid (uk + nl)')}</h5>
          <div className='ag-vaard-velden'>
            <label className='ag-vaard-veld'>
              <span>{tr('Ключ навички (латиницею, через дефіс)', 'Sleutel (kleine letters en koppelteken)')}</span>
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder='mijn-werkstroom'
                data-vaard-veld='slug'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Обов’язкові інструменти (через кому)', 'Vereiste hulpmiddelen (kommagescheiden)')}</span>
              <input
                value={form.hulpmiddelenTekst}
                onChange={(e) => setForm((f) => ({ ...f, hulpmiddelenTekst: e.target.value }))}
                placeholder='site_search, mcp_board_list'
                data-vaard-veld='hulpmiddelen'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Назва українською', 'Titel in het Oekraïens')}</span>
              <input
                value={form.titelUk}
                onChange={(e) => setForm((f) => ({ ...f, titelUk: e.target.value }))}
                placeholder='Перевірка щоденного зведення'
                data-vaard-veld='titelUk'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Назва нідерландською', 'Titel in het Nederlands')}</span>
              <input
                value={form.titelNl}
                onChange={(e) => setForm((f) => ({ ...f, titelNl: e.target.value }))}
                placeholder='Dagelijkse overzichtscontrole'
                data-vaard-veld='titelNl'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Короткий підсумок (uk)', 'Korte samenvatting (uk)')}</span>
              <input
                value={form.samenvattingUk}
                onChange={(e) => setForm((f) => ({ ...f, samenvattingUk: e.target.value }))}
                data-vaard-veld='samenvattingUk'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Короткий підсумок (nl)', 'Korte samenvatting (nl)')}</span>
              <input
                value={form.samenvattingNl}
                onChange={(e) => setForm((f) => ({ ...f, samenvattingNl: e.target.value }))}
                data-vaard-veld='samenvattingNl'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Ключові слова добору (uk, через кому)', 'Zoekwoorden (uk, kommagescheiden)')}</span>
              <input
                value={form.termenUkTekst}
                onChange={(e) => setForm((f) => ({ ...f, termenUkTekst: e.target.value }))}
                data-vaard-veld='termenUk'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Ключові слова добору (nl, через кому)', 'Zoekwoorden (nl, kommagescheiden)')}</span>
              <input
                value={form.termenNlTekst}
                onChange={(e) => setForm((f) => ({ ...f, termenNlTekst: e.target.value }))}
                data-vaard-veld='termenNl'
              />
            </label>
          </div>
          <div className='ag-vaard-velden'>
            <label className='ag-vaard-veld'>
              <span>{tr('Повна настанова українською (без секретів)', 'Volledige werkinstructie in het Oekraïens')}</span>
              <textarea
                value={form.inhoudUk}
                onChange={(e) => setForm((f) => ({ ...f, inhoudUk: e.target.value }))}
                data-vaard-veld='inhoudUk'
              />
            </label>
            <label className='ag-vaard-veld'>
              <span>{tr('Повна настанова нідерландською (без секретів)', 'Volledige werkinstructie in het Nederlands')}</span>
              <textarea
                value={form.inhoudNl}
                onChange={(e) => setForm((f) => ({ ...f, inhoudNl: e.target.value }))}
                data-vaard-veld='inhoudNl'
              />
            </label>
          </div>
          {data?.agenten.length ? (
            <div className='ag-vaard-veld'>
              <span>
                {tr(
                  'Прив’язати до конкретних агентів (якщо нікого не вибрано — доступна для всіх)',
                  'Koppelen aan specifieke agenten (leeg betekent beschikbaar voor alle agenten)',
                )}
              </span>
              <div className='ag-vaard-agent-chips'>
                {data.agenten.map((ag) => {
                  const aan = form.agentKoppelingen.includes(ag.slug);
                  return (
                    <button
                      key={ag.slug}
                      type='button'
                      className={`ag-vaard-chip${aan ? ' is-aan' : ''}`}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          agentKoppelingen: aan
                            ? f.agentKoppelingen.filter((x) => x !== ag.slug)
                            : [...f.agentKoppelingen, ag.slug],
                        }))
                      }
                    >
                      {ag.naam}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className='ag-knoppen'>
            <Knop toon='primary' icoon={<Check />} bezig={bezig === 'opslaan'} onClick={() => void opslaanEigen()} data='vaard-opslaan'>
              {tr('Зберегти навичку', 'Vaardigheid bewaren')}
            </Knop>
            <Knop onClick={() => setBewerkOpen(false)}>{tr('Скасувати', 'Annuleren')}</Knop>
          </div>
        </div>
      ) : null}

      {/* Панель імпорту SKILL.md або JSON-пакета */}
      {importOpen ? (
        <div className='ag-vaard-formulier' data-vaard-import='1'>
          <label className='ag-vaard-veld'>
            <span>
              {tr(
                'Вставте вміст файла SKILL.md (із YAML-заголовком) або JSON-пакета mr-vaardigheid-v1',
                'Plak de inhoud van een SKILL.md-bestand of een JSON-pakket mr-vaardigheid-v1',
              )}
            </span>
            <textarea
              value={importTekst}
              onChange={(e) => setImportTekst(e.target.value)}
              placeholder={'---\nname: mijn-controle\ndescription: Перевірка перед змінами. Controle vooraf.\n---\n# ...'}
              data-vaard-import-tekst='1'
            />
          </label>
          <div className='ag-knoppen'>
            <Knop
              toon='primary'
              icoon={<Upload />}
              bezig={bezig === 'importeren'}
              disabled={!importTekst.trim()}
              onClick={() => void importeerPakket()}
              data='vaard-import-uitvoeren'
            >
              {tr('Імпортувати в активний простір', 'Importeren in actieve ruimte')}
            </Knop>
            <Knop onClick={() => setImportOpen(false)}>{tr('Закрити', 'Sluiten')}</Knop>
          </div>
        </div>
      ) : null}

      {/* Історія версій і відновлення */}
      {historieOpen && data ? (
        <div className='ag-vaard-revisies' data-vaard-historie='1'>
          <h5>{tr('Останні зміни та версії навичок', 'Recente wijzigingen en vaardigheidsversies')}</h5>
          {data.revisies.length === 0 ? (
            <p className='ag-leeg'>{tr('У цьому просторі ще немає зафіксованих змін навичок.', 'Er zijn nog geen wijzigingen vastgelegd in deze ruimte.')}</p>
          ) : (
            data.revisies.slice(0, 15).map((rev) => (
              <div key={rev.id} className='ag-vaard-revisie-rij' data-revisie={rev.id}>
                <div>
                  <b><code>{rev.vaardigheidSlug}</code></b>{' '}
                  <Badge toon='info'>v{rev.versie}</Badge>{' '}
                  <span>{rev.actie}</span>{' '}
                  <small className='ag-meta'>
                    {new Date(rev.aangemaaktOp).toLocaleString()}
                    {rev.doorAgent ? ` · ${rev.doorAgent}` : ''}
                  </small>
                </div>
                {rev.actie !== 'koppeling_gewijzigd' && rev.momentopname.inhoudUk ? (
                  <Knop
                    icoon={<RotateCcw />}
                    bezig={bezig === `herstel:${rev.id}`}
                    onClick={() => void herstelRevisie(rev.id)}
                    data={`vaard-herstel:${rev.id}`}
                  >
                    {tr('Відновити версію', 'Versie herstellen')}
                  </Knop>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Пошук, фільтр і живий підбір */}
      <div className='ag-vaard-gereedschap'>
        <input
          type='search'
          className='ag-vaard-zoek-invoer'
          value={zoekTekst}
          onChange={(e) => setZoekTekst(e.target.value)}
          placeholder={tr('Пошук за назвою, темою або ключовими словами…', 'Zoek op titel, onderwerp of zoekwoorden…')}
          data-vaard-zoek='1'
        />
        <Knop
          icoon={<Search />}
          bezig={bezig === 'aanbevelen'}
          disabled={!zoekTekst.trim()}
          onClick={() => void zoekAanbevelingen()}
          data='vaard-aanbevelen'
        >
          {tr('Підібрати за запитом', 'Passende kiezen')}
        </Knop>
        {aanbevelingen !== null ? (
          <Knop onClick={() => setAanbevelingen(null)}>{tr('Скинути підбір', 'Selectie wissen')}</Knop>
        ) : null}
        <Segment<BronFilter>
          waarde={bronFilter}
          label={tr('Джерело навичок', 'Bron van vaardigheden')}
          onKies={(id) => setBronFilter(id)}
          opties={[
            { id: 'alle', label: tr(`Усі (${data?.vaardigheden.length ?? 0})`, `Alle (${data?.vaardigheden.length ?? 0})`) },
            { id: 'systeem', label: tr('Системні', 'Systeem') },
            { id: 'protocol', label: tr('Протокол', 'Protocol') },
            { id: 'eigen', label: tr('Власні', 'Eigen') },
          ]}
        />
      </div>

      {/* Результат підбору за запитом */}
      {aanbevelingen !== null ? (
        <div className='ag-vaard-formulier' data-vaard-aanbevelingen='1'>
          <h5>
            <Sparkles size={14} aria-hidden='true' />{' '}
            {tr(`Найточніші збіги для запиту (${aanbevelingen.length})`, `Beste treffers voor uw vraag (${aanbevelingen.length})`)}
          </h5>
          {aanbevelingen.length === 0 ? (
            <p className='ag-leeg'>{tr('Для цього запиту відповідних активних навичок не знайдено.', 'Geen passende actieve vaardigheden gevonden voor deze vraag.')}</p>
          ) : (
            <ul className='ag-vaard-lijst'>
              {aanbevelingen.map((a) => (
                <li key={a.id} className='ag-vaard-rij' data-aanbeveling={a.id}>
                  <div className='ag-vaard-rij-kop'>
                    <div className='ag-vaard-rij-info'>
                      <div className='ag-vaard-rij-titel'>
                        <code>{a.id}</code> — {a.titel[taal]}
                        {a.versieSemver ? <Badge toon='off'>v{a.versieSemver}</Badge> : null}
                        <Badge toon='info'>{tr(`Збіг: ${a.score}`, `Score: ${a.score}`)}</Badge>
                        {a.aansluiting === 'hulpmiddelen_aanwezig' ? (
                          <Badge toon='ok'>{tr('Інструменти відкриті', 'Hulpmiddelen open')}</Badge>
                        ) : a.aansluiting === 'hulpmiddelen_ontbreken' ? (
                          <Badge toon='warn'>
                            {tr(
                              `Бракує: ${a.ontbrekendeHulpmiddelen.join(', ')}`,
                              `Ontbreekt: ${a.ontbrekendeHulpmiddelen.join(', ')}`,
                            )}
                          </Badge>
                        ) : null}
                      </div>
                      <p className='ag-vaard-rij-tekst'>{a.samenvatting[taal]}</p>
                      {a.afhankelijkheden?.length ? (
                        <div className='ag-vaard-rij-meta'>
                          <span>
                            {tr('Залежності', 'Afhankelijkheden')}: <code>{a.afhankelijkheden.join(', ')}</code>
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <Knop
                      icoon={<BookOpen />}
                      onClick={() => setOpenIds((o) => ({ ...o, [a.id]: true }))}
                    >
                      {tr('Розгорнути', 'Openen')}
                    </Knop>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Головний перелік навичок */}
      <ul className='ag-vaard-lijst' data-lijst='vaardigheden-ecosysteem'>
        {gefilterdeVaardigheden.map((item) => {
          const isOpen = Boolean(openIds[item.id]);
          const actiefNu = data
            ? isVaardigheidActiefVoorAgent(
              item,
              data.standen,
              gekozenAgent === '*' ? undefined : gekozenAgent,
              data.ruimte,
            )
            : true;
          const isEigen = item.bron === 'eigen' || item.bron === 'geimporteerd';

          return (
            <li key={item.id} className='ag-vaard-rij' data-vaardigheid-id={item.id}>
              <div className='ag-vaard-rij-kop'>
                <div className='ag-vaard-rij-info'>
                  <div className='ag-vaard-rij-titel'>
                    <span>{item.titel[taal]}</span>
                    <code>{item.id}</code>
                    <Badge toon={isEigen ? 'info' : 'off'}>{bronLabel(item.bron)}</Badge>
                    <Badge toon={actiefNu ? 'ok' : 'warn'}>
                      {actiefNu ? tr('Активна', 'Actief') : tr('Вимкнена', 'Uit')}
                    </Badge>
                    {item.ruimte === 'technisch' ? (
                      <Badge toon='warn'>{tr('Лише технічний простір', 'Alleen technisch')}</Badge>
                    ) : null}
                    {item.versieSemver ? (
                      <Badge toon='info'>v{item.versieSemver}</Badge>
                    ) : item.versie > 1 ? (
                      <Badge toon='info'>v{item.versie}</Badge>
                    ) : null}
                  </div>
                  <p className='ag-vaard-rij-tekst'>{item.samenvatting[taal]}</p>
                  <div className='ag-vaard-rij-meta'>
                    <span>URI: <code>{item.uri}</code></span>
                    {item.afhankelijkheden?.length ? (
                      <span>
                        {tr('Залежності', 'Afhankelijkheden')}: <code>{item.afhankelijkheden.join(', ')}</code>
                      </span>
                    ) : null}
                    {item.vereisteHulpmiddelen.length ? (
                      <span>
                        {tr('Інструменти', 'Hulpmiddelen')}: <code>{item.vereisteHulpmiddelen.join(', ')}</code>
                      </span>
                    ) : null}
                    {item.agentKoppelingen.length ? (
                      <span>
                        {tr('Агенти', 'Agenten')}: <code>{item.agentKoppelingen.join(', ')}</code>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className='ag-knoppen'>
                  <Knop
                    icoon={<BookOpen />}
                    onClick={() => setOpenIds((o) => ({ ...o, [item.id]: !o[item.id] }))}
                    data={`vaard-open:${item.id}`}
                  >
                    {isOpen ? tr('Згорнути', 'Sluiten') : tr('Переглянути', 'Bekijken')}
                  </Knop>
                  <Knop
                    toon={actiefNu ? 'default' : 'primary'}
                    bezig={bezig === `stand:${gekozenAgent}:${item.id}`}
                    onClick={() => void schakelVoorAgent(item, !actiefNu)}
                    data={`vaard-schakel:${item.id}`}
                  >
                    {actiefNu
                      ? tr('Вимкнути', 'Uitzetten')
                      : tr('Увімкнути', 'Aanzetten')}
                  </Knop>
                  {onLeesResourceInInspector ? (
                    <Knop
                      icoon={<Play />}
                      onClick={() => onLeesResourceInInspector(item.uri)}
                      data={`vaard-mcp-test:${item.id}`}
                    >
                      {tr('Перевірити в MCP', 'Test in MCP')}
                    </Knop>
                  ) : null}
                </div>
              </div>

              {isOpen ? (
                <div className='ag-vaard-details' data-vaardigheid-details={item.id}>
                  <div className='ag-vaard-inhoud-raster'>
                    <div className='ag-vaard-inhoud-vak'>
                      <h5>{tr('Настанова українською (uk)', 'Werkinstructie Oekraïens (uk)')}</h5>
                      <pre className='ag-vaard-code'>{item.inhoud.uk}</pre>
                    </div>
                    <div className='ag-vaard-inhoud-vak'>
                      <h5>{tr('Настанова нідерландською (nl)', 'Werkinstructie Nederlands (nl)')}</h5>
                      <pre className='ag-vaard-code'>{item.inhoud.nl}</pre>
                    </div>
                  </div>
                  <div className='ag-knoppen'>
                    <Knop
                      icoon={gekopieerd === `md:${item.id}` ? <Check /> : <Copy />}
                      onClick={() => void kopieer(`md:${item.id}`, bouwSkillMarkdown(item))}
                      data={`vaard-kopieer-md:${item.id}`}
                    >
                      {gekopieerd === `md:${item.id}` ? tr('Скопійовано SKILL.md', 'SKILL.md gekopieerd') : tr('Копіювати SKILL.md', 'Kopieer SKILL.md')}
                    </Knop>
                    <Knop
                      icoon={gekopieerd === `json:${item.id}` ? <Check /> : <Download />}
                      onClick={() => void kopieer(`json:${item.id}`, JSON.stringify(bouwVaardigheidPakket(item), null, 2))}
                      data={`vaard-kopieer-json:${item.id}`}
                    >
                      {gekopieerd === `json:${item.id}` ? tr('Скопійовано JSON', 'JSON gekopieerd') : tr('Експорт JSON', 'Exporteer JSON')}
                    </Knop>
                    {isEigen ? (
                      <>
                        <Knop icoon={<Pencil />} onClick={() => bewerkBestaande(item)} data={`vaard-bewerk:${item.id}`}>
                          {tr('Редагувати', 'Bewerken')}
                        </Knop>
                        <Knop
                          toon='danger'
                          icoon={<Trash2 />}
                          bezig={bezig === `verwijder:${item.id}`}
                          onClick={() => void verwijderEigen(item.id)}
                          data={`vaard-verwijder:${item.id}`}
                        >
                          {tr('Видалити', 'Verwijderen')}
                        </Knop>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
