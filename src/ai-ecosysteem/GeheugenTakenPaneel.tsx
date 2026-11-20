// Вкладка «Перехід задач і сесій / Taak- en sessie-overdracht» у Стрімі пам’яті:
//   - наскрізні задачі з унікальним ключем, станом, пріоритетом і прив’язкою до картки afstemming;
//   - покрокова естафета між 13 ШІ-агентами та новими сесіями без втрати контексту;
//   - миттєве формування двомовного тексту переходу (uk/nl) та сповіщення в Telegram-бот обраного агента.
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  FileText,
  FolderGit2,
  Plus,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { foutCode } from '../agenten/fouten';
import { routeLang } from '../canoniek-navigatie';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import {
  TAAK_FOUT_UITLEG,
  TAAK_FOUTEN,
  TAAK_PRIORITEIT_META,
  TAAK_PRIORITEITEN,
  TAAK_STAP_SOORT_META,
  TAAK_STATUS_META,
  TAAK_STATUSSEN,
  type BestandsVerwijzing,
  type GeheugenTaak,
  type GeheugenTaakPakket,
  type GeheugenTaakStap,
  type TaakPrioriteit,
  type TaakStatus,
} from '../../shared/geheugen-stroom';
import type { AiRuimte } from '../../shared/ai-ruimte';

type Tr = (uk: string, nl: string) => string;

type Props = {
  tr: Tr;
  onStroomBijgewerkt?: () => void;
};

type OverzichtAntwoord = {
  ruimte: AiRuimte;
  taken: GeheugenTaak[];
  laatsteStappen: GeheugenTaakStap[];
};

const ctx = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

function taakFoutTekst(e: unknown, tr: Tr): string {
  const { code } = foutCode(e);
  const uitleg = TAAK_FOUT_UITLEG[code];
  if (uitleg) return tr(uitleg.uk, uitleg.nl);
  if (code === TAAK_FOUTEN.geheimGeweigerd) {
    return tr(
      'У тексті виявлено можливий ключ доступу або пароль. Стрім задач не зберігає таємних даних.',
      'Er is een mogelijke toegangssleutel of wachtwoord herkend. Taken bewaren geen geheimen.',
    );
  }
  return tr(`Помилка операції із задачами (${code || 'невідома'}).`, `Fout tijdens taakbewerking (${code || 'onbekend'}).`);
}

function parseBestandsRegels(tekst: string): BestandsVerwijzing[] {
  return tekst
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [naamRaw, verwRaw] = r.split('|').map((s) => s.trim());
      if (!naamRaw) return null;
      return {
        naam: naamRaw.slice(0, 140),
        verwijzing: (verwRaw || naamRaw).slice(0, 320),
      };
    })
    .filter((x): x is BestandsVerwijzing => x !== null);
}

export default function GeheugenTakenPaneel({ tr, onStroomBijgewerkt }: Props) {
  const lang = routeLang();
  const [taken, setTaken] = useState<GeheugenTaak[]>([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');

  // Фільтри списку
  const [zoekVraag, setZoekVraag] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('alle');
  const [filterAgent, setFilterAgent] = useState<string>('alle');

  // Обране досьє задачі
  const [geselecteerdeSleutel, setGeselecteerdeSleutel] = useState('');
  const [pakket, setPakket] = useState<GeheugenTaakPakket | null>(null);
  const [promptTaal, setPromptTaal] = useState<'uk' | 'nl'>(lang === 'nl' ? 'nl' : 'uk');

  // Форма створення / оновлення задачі
  const [toonNieuweForm, setToonNieuweForm] = useState(false);
  const [taakSleutel, setTaakSleutel] = useState('');
  const [titel, setTitel] = useState('');
  const [doel, setDoel] = useState('');
  const [status, setStatus] = useState<TaakStatus>('bezig');
  const [prioriteit, setPrioriteit] = useState<TaakPrioriteit>('normaal');
  const [huidigeAgent, setHuidigeAgent] = useState('claude');
  const [afstemmingExternId, setAfstemmingExternId] = useState('');
  const [geheugenSleutelsTekst, setGeheugenSleutelsTekst] = useState('');
  const [eigenaarVereist, setEigenaarVereist] = useState(false);

  // Форма передачі естафети
  const [naarAgent, setNaarAgent] = useState('codex');
  const [naarAgentEigen, setNaarAgentEigen] = useState('');
  const [overdrachtTekst, setOverdrachtTekst] = useState('');
  const [overdrachtBestanden, setOverdrachtBestanden] = useState('');
  const [bewaarInStroom, setBewaarInStroom] = useState(true);
  const [ookBezorgen, setOokBezorgen] = useState(false);

  const laadOverzicht = useCallback(async (houdSelectie = true) => {
    setLaden(true);
    setFout('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/taken/overzicht', {
        ...ctx(),
        ...(filterStatus !== 'alle' ? { status: filterStatus } : {}),
        ...(filterAgent !== 'alle' ? { agent: filterAgent } : {}),
        ...(zoekVraag.trim() ? { vraag: zoekVraag.trim() } : {}),
      });
      const ant = res.data as OverzichtAntwoord;
      setTaken(ant.taken ?? []);
      if (houdSelectie && geselecteerdeSleutel) {
        const bestaat = (ant.taken ?? []).some((t) => t.taakSleutel === geselecteerdeSleutel);
        if (!bestaat) {
          setGeselecteerdeSleutel('');
          setPakket(null);
        }
      }
    } catch (e) {
      setFout(taakFoutTekst(e, tr));
    } finally {
      setLaden(false);
    }
  }, [filterAgent, filterStatus, geselecteerdeSleutel, tr, zoekVraag]);

  const laadDetail = useCallback(async (sleutel: string) => {
    if (!sleutel) return;
    setBezig(true);
    setFout('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/taken/detail', {
        ...ctx(),
        taakSleutel: sleutel,
      });
      setPakket(res.data as GeheugenTaakPakket);
      setGeselecteerdeSleutel(sleutel);
    } catch (e) {
      setFout(taakFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }, [tr]);

  useEffect(() => {
    void laadOverzicht(false);
  }, [laadOverzicht]);

  async function bewaarTaak() {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const sleutels = geheugenSleutelsTekst
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.post('/api/owner/ai/geheugen/taken/opslaan', {
        ...ctx(),
        taakSleutel: taakSleutel.trim(),
        titel: titel.trim(),
        doel: doel.trim(),
        status,
        prioriteit,
        huidigeAgent,
        afstemmingExternId: afstemmingExternId.trim(),
        geheugenSleutels: sleutels,
        eigenaarVereist,
      });
      const ant = res.data as { ok: true; pakket: GeheugenTaakPakket; nieuw: boolean };
      setPakket(ant.pakket);
      setGeselecteerdeSleutel(ant.pakket.taak.taakSleutel);
      setToonNieuweForm(false);
      setMelding(
        ant.nieuw
          ? tr(`Задачу «${ant.pakket.taak.taakSleutel}» створено для переходу між агентами.`, `Taak «${ant.pakket.taak.taakSleutel}» aangemaakt voor overdracht.`)
          : tr(`Задачу «${ant.pakket.taak.taakSleutel}» оновлено.`, `Taak «${ant.pakket.taak.taakSleutel}» bijgewerkt.`),
      );
      await laadOverzicht(true);
    } catch (e) {
      setFout(taakFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function draagTaakOver() {
    if (!pakket) return;
    const doelAgent = (naarAgentEigen.trim() || naarAgent).trim().toLowerCase();
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/taken/overdragen', {
        ...ctx(),
        taakSleutel: pakket.taak.taakSleutel,
        naarAgent: doelAgent,
        samenvatting: overdrachtTekst.trim(),
        bewaarInStroom,
        ookBezorgen,
        bestandsVerwijzingen: parseBestandsRegels(overdrachtBestanden),
      });
      const ant = res.data as {
        ok: true;
        pakket: GeheugenTaakPakket;
        bezorgd: boolean;
        bezorgingFout?: string;
      };
      setPakket(ant.pakket);
      setOverdrachtTekst('');
      setOverdrachtBestanden('');
      setMelding(
        ookBezorgen
          ? ant.bezorgd
            ? tr(`Естафету передано «${doelAgent}» і надіслано в Telegram.`, `Taak overgedragen aan «${doelAgent}» en naar Telegram gestuurd.`)
            : tr(`Естафету передано «${doelAgent}» (сповіщення Telegram відкладено: ${ant.bezorgingFout || 'перевірте бота'}).`, `Taak overgedragen aan «${doelAgent}» (Telegram-melding uitgesteld: ${ant.bezorgingFout || 'controleer de bot'}).`)
          : tr(`Естафету передано «${doelAgent}». Контекст продовження готовий нижче.`, `Taak overgedragen aan «${doelAgent}». De vervolginstructie staat hieronder klaar.`),
      );
      onStroomBijgewerkt?.();
      await laadOverzicht(true);
    } catch (e) {
      setFout(taakFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function kopieerPrompt() {
    if (!pakket) return;
    const tekst = promptTaal === 'nl' ? pakket.overdrachtPromptNl : pakket.overdrachtPromptUk;
    try {
      await navigator.clipboard.writeText(tekst);
      setMelding(tr('Готовий контекст переходу скопійовано в буфер обміну.', 'De kant-en-klare vervolginstructie is gekopieerd naar het klembord.'));
    } catch {
      setFout(tr('Не вдалося скопіювати автоматично — виділіть текст у вікні нижче.', 'Automatisch kopiëren mislukt — selecteer de tekst hieronder.'));
    }
  }

  return (
    <div className='gs-container'>
      <div className='gs-kop'>
        <div className='gs-kop-titel'>
          <h3>
            <ArrowRightLeft size={17} aria-hidden='true' />
            {tr('Безперервний перехід задач між сесіями та 13 ШІ-агентами', 'Doorlopende taakoverdracht tussen sessies en 13 AI-agenten')}
          </h3>
          <p className='gs-subtekst'>
            {tr(
              'Фіксуйте спільну задачу під сталим ключем, передавайте естафету між Claude, ChatGPT, Codex, Gemini, Grok, Copilot, Cursor, Antigravity, AutoClaw, Windsurf, Cline, Devin, OpenCode і Microsoft Copilot та отримуйте чистий контекст для продовження без повторів.',
              'Leg elke doorlopende taak onder een vaste sleutel vast, draag het werk over tussen alle 14 AI-agenten en ontvang een schone vervolginstructie zonder dubbel werk.',
            )}
          </p>
        </div>
        <div className='gs-knoppen'>
          <button type='button' className='gs-knop-tweede' disabled={laden || bezig} onClick={() => void laadOverzicht(true)}>
            <RefreshCw size={14} aria-hidden='true' />
            {tr('Оновити', 'Vernieuwen')}
          </button>
          <button
            type='button'
            className='gs-knop-hoofd'
            onClick={() => {
              setToonNieuweForm((v) => !v);
              setTaakSleutel('');
              setTitel('');
              setDoel('');
              setAfstemmingExternId('');
              setGeheugenSleutelsTekst('');
            }}
          >
            <Plus size={14} aria-hidden='true' />
            {toonNieuweForm ? tr('Сховати форму', 'Formulier sluiten') : tr('Нова наскрізна задача', 'Nieuwe doorlopende taak')}
          </button>
        </div>
      </div>

      {fout ? <p className='gs-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='gs-melding' role='status'>{melding}</p> : null}

      {toonNieuweForm ? (
        <div className='gs-form'>
          <div className='gs-grid-2'>
            <label className='gs-veld'>
              <span>{tr('Ключ задачі (taak_sleutel)', 'Taaksleutel (taak_sleutel)')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={taakSleutel}
                onChange={(e) => setTaakSleutel(e.target.value)}
                placeholder='GEHEUGEN-003'
              />
            </label>
            <label className='gs-veld'>
              <span>{tr('Назва задачі', 'Taaktitel')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
                placeholder={tr('Коротка назва без таємниць…', 'Korte titel zonder geheimen…')}
              />
            </label>
          </div>
          <label className='gs-veld'>
            <span>{tr('Мета та межі задачі', 'Doel en afbakening van de taak')}</span>
            <textarea
              className='gs-textarea'
              value={doel}
              onChange={(e) => setDoel(e.target.value)}
              placeholder={tr('Що має бути досягнуто, які файли чи критерії важливі…', 'Wat moet bereikt worden, welke bestanden of criteria tellen…')}
            />
          </label>
          <div className='gs-grid-3'>
            <label className='gs-veld'>
              <span>{tr('Стан', 'Status')}</span>
              <select className='gs-select' value={status} onChange={(e) => setStatus(e.target.value as TaakStatus)}>
                {TAAK_STATUSSEN.map((st) => (
                  <option key={st} value={st}>{tr(TAAK_STATUS_META[st].uk, TAAK_STATUS_META[st].nl)}</option>
                ))}
              </select>
            </label>
            <label className='gs-veld'>
              <span>{tr('Пріоритет', 'Prioriteit')}</span>
              <select className='gs-select' value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as TaakPrioriteit)}>
                {TAAK_PRIORITEITEN.map((pr) => (
                  <option key={pr} value={pr}>{tr(TAAK_PRIORITEIT_META[pr].uk, TAAK_PRIORITEIT_META[pr].nl)}</option>
                ))}
              </select>
            </label>
            <label className='gs-veld'>
              <span>{tr('Поточний агент', 'Huidige agent')}</span>
              <select className='gs-select' value={huidigeAgent} onChange={(e) => setHuidigeAgent(e.target.value)}>
                {V2_AGENTEN.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.naam} ({a.slug})</option>
                ))}
              </select>
            </label>
          </div>
          <div className='gs-grid-2'>
            <label className='gs-veld'>
              <span>{tr('Код картки узгодження (afstemming)', 'Code van afstemmingskaart (optioneel)')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={afstemmingExternId}
                onChange={(e) => setAfstemmingExternId(e.target.value)}
                placeholder='UI-014'
              />
            </label>
            <label className='gs-veld'>
              <span>{tr('Ключі вузлів пам’яті (через кому)', 'Sleutels van geheugenknopen (kommagescheiden)')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={geheugenSleutelsTekst}
                onChange={(e) => setGeheugenSleutelsTekst(e.target.value)}
                placeholder='mova-pravyl, release-regels'
              />
            </label>
          </div>
          <label className='gs-check'>
            <input type='checkbox' checked={eigenaarVereist} onChange={(e) => setEigenaarVereist(e.target.checked)} />
            <span>{tr('Потрібне схвалення або рішення власника на наступному кроці', 'Vereist een eigenaarsbesluit of bevestiging in de volgende stap')}</span>
          </label>
          <div className='gs-knoppen'>
            <button type='button' className='gs-knop-hoofd' disabled={bezig || !taakSleutel.trim() || !titel.trim()} onClick={() => void bewaarTaak()}>
              <CheckCircle2 size={14} aria-hidden='true' />
              {tr('Зберегти задачу', 'Taak bewaren')}
            </button>
          </div>
        </div>
      ) : null}

      <div className='gs-zoekbalk'>
        <input
          type='search'
          className='gs-invoer'
          value={zoekVraag}
          onChange={(e) => setZoekVraag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void laadOverzicht(true);
          }}
          placeholder={tr('Пошук за ключем задачі, назвою або карткою узгодження…', 'Zoeken op taaksleutel, titel of afstemmingskaart…')}
        />
        <select className='gs-select' value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value='alle'>{tr('Усі стани', 'Alle statussen')}</option>
          {TAAK_STATUSSEN.map((st) => (
            <option key={st} value={st}>{tr(TAAK_STATUS_META[st].uk, TAAK_STATUS_META[st].nl)}</option>
          ))}
        </select>
        <select className='gs-select' value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
          <option value='alle'>{tr('Усі 13 агентів', 'Alle 13 agenten')}</option>
          {V2_AGENTEN.map((a) => (
            <option key={a.slug} value={a.slug}>{a.naam}</option>
          ))}
        </select>
      </div>

      <div className='gs-grid-2'>
        <div className='gs-taken-kolom'>
          {laden && !taken.length ? (
            <p className='gs-subtekst'>{tr('Завантажую наскрізні задачі…', 'Doorlopende taken laden…')}</p>
          ) : taken.length === 0 ? (
            <div className='gs-form'>
              <p className='gs-subtekst'>
                {tr(
                  'У цьому просторі ще немає наскрізних задач. Створіть першу кнопкою вгорі або через MCP-інструмент geheugen_taak_opslaan.',
                  'Er zijn nog geen doorlopende taken in deze ruimte. Maak er een aan met de knop bovenaan of via geheugen_taak_opslaan.',
                )}
              </p>
            </div>
          ) : (
            <ul className='gs-lijst'>
              {taken.map((t) => {
                const geselecteerd = pakket?.taak.taakSleutel === t.taakSleutel;
                return (
                  <li key={t.id} className={`gs-knoop-kaart ${geselecteerd ? 'gs-taak-actief' : ''}`}>
                    <div className='gs-knoop-kop'>
                      <strong>{t.titel}</strong>
                      <div className='gs-knoppen'>
                        <span className='gs-pil'>{t.taakSleutel}</span>
                        <span className={`gs-pil ${t.status === 'wacht_op_eigenaar' ? 'gs-pil-waarschuwing' : t.status === 'klaar' || t.status === 'bezig' ? 'gs-pil-beschermd' : ''}`}>
                          {tr(TAAK_STATUS_META[t.status].uk, TAAK_STATUS_META[t.status].nl)}
                        </span>
                        {t.huidigeAgent ? <span className='gs-pil'>{t.huidigeAgent}</span> : null}
                        {t.afstemmingExternId ? <span className='gs-pil'>{t.afstemmingExternId}</span> : null}
                      </div>
                    </div>
                    {t.doel ? <p className='gs-knoop-inhoud'>{t.doel}</p> : null}
                    <div className='gs-knoppen'>
                      <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => void laadDetail(t.taakSleutel)}>
                        <Search size={13} aria-hidden='true' />
                        {tr('Відкрити досьє й перехід', 'Dossier en overdracht openen')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className='gs-taken-dossier'>
          {!pakket ? (
            <div className='gs-form'>
              <strong>{tr('Досьє переходу задачі', 'Overdrachtsdossier van de taak')}</strong>
              <p className='gs-subtekst'>
                {tr(
                  'Оберіть будь-яку задачу ліворуч, щоб переглянути історію кроків, передати естафету іншому агенту чи скопіювати готовий контекст у нову сесію.',
                  'Kies links een taak om het stappenverloop te bekijken, het werk over te dragen of de vervolginstructie voor een nieuwe sessie te kopiëren.',
                )}
              </p>
            </div>
          ) : (
            <div className='gs-container'>
              <div className='gs-form'>
                <div className='gs-knoop-kop'>
                  <strong>{pakket.taak.taakSleutel}: {pakket.taak.titel}</strong>
                  <span className='gs-pil'>
                    {tr(TAAK_PRIORITEIT_META[pakket.taak.prioriteit].uk, TAAK_PRIORITEIT_META[pakket.taak.prioriteit].nl)}
                  </span>
                </div>
                {pakket.taak.doel ? <p className='gs-subtekst'>{pakket.taak.doel}</p> : null}
                <div className='gs-knoppen'>
                  <span className='gs-pil gs-pil-beschermd'>
                    {tr('Зараз веде:', 'Nu bij:')} {pakket.taak.huidigeAgent || tr('не призначено', 'niet toegewezen')}
                  </span>
                  {pakket.geheugenKnopen.length > 0 ? (
                    <span className='gs-pil'>
                      {tr(`Вузлів пам’яті: ${pakket.geheugenKnopen.length}`, `Geheugenknopen: ${pakket.geheugenKnopen.length}`)}
                    </span>
                  ) : null}
                  {pakket.bezorgingen.length > 0 ? (
                    <span className='gs-pil'>
                      {tr(`Доставлень Telegram: ${pakket.bezorgingen.length}`, `Telegram-bezorgingen: ${pakket.bezorgingen.length}`)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className='gs-form'>
                <strong>
                  <Send size={14} aria-hidden='true' />{' '}
                  {tr('Передати естафету іншому агенту або новій сесії', 'Taak overdragen aan andere agent of nieuwe sessie')}
                </strong>
                <div className='gs-grid-2'>
                  <label className='gs-veld'>
                    <span>{tr('Отримувач серед 13 агентів', 'Ontvangende agent (13 standaard)')}</span>
                    <select className='gs-select' value={naarAgent} onChange={(e) => setNaarAgent(e.target.value)}>
                      {V2_AGENTEN.map((a) => (
                        <option key={a.slug} value={a.slug}>{a.naam} ({a.slug})</option>
                      ))}
                    </select>
                  </label>
                  <label className='gs-veld'>
                    <span>{tr('Або власний код сесії/агента', 'Of eigen sessie-/agentcode')}</span>
                    <input
                      type='text'
                      className='gs-invoer'
                      value={naarAgentEigen}
                      onChange={(e) => setNaarAgentEigen(e.target.value)}
                      placeholder={tr('Напр. claude-sesiya-2', 'Bijv. claude-sessie-2')}
                    />
                  </label>
                </div>
                <label className='gs-veld'>
                  <span>{tr('Що зроблено, що перевірено й із чого почати далі', 'Wat is afgerond, wat is getest en wat is de eerste vervolgstap')}</span>
                  <textarea
                    className='gs-textarea'
                    value={overdrachtTekst}
                    onChange={(e) => setOverdrachtTekst(e.target.value)}
                    placeholder={tr('Стислий підсумок без ключів доступу й паролів…', 'Beknopte samenvatting zonder toegangssleutels of wachtwoorden…')}
                  />
                </label>
                <label className='gs-veld'>
                  <span>{tr('Посилання на файли (по одному в рядку: назва | шлях)', 'Bestandsverwijzingen (één per regel: naam | pad)')}</span>
                  <textarea
                    className='gs-textarea'
                    value={overdrachtBestanden}
                    onChange={(e) => setOverdrachtBestanden(e.target.value)}
                    placeholder='backend/geheugen-taken.ts | Реалізація маршрутів задач'
                  />
                </label>
                <div className='gs-knoppen'>
                  <label className='gs-check'>
                    <input type='checkbox' checked={bewaarInStroom} onChange={(e) => setBewaarInStroom(e.target.checked)} />
                    <span>{tr('Закріпити підсумок у Стрімі пам’яті', 'Samenvatting vastzetten in Stroom van geheugen')}</span>
                  </label>
                  <label className='gs-check'>
                    <input type='checkbox' checked={ookBezorgen} onChange={(e) => setOokBezorgen(e.target.checked)} />
                    <span>{tr('Надіслати в тему Telegram-бота агента', 'Ook sturen naar Telegram-botonderwerp van de agent')}</span>
                  </label>
                </div>
                <div className='gs-knoppen'>
                  <button type='button' className='gs-knop-hoofd' disabled={bezig || !overdrachtTekst.trim()} onClick={() => void draagTaakOver()}>
                    <ArrowRightLeft size={14} aria-hidden='true' />
                    {tr('Зафіксувати крок і передати естафету', 'Stap vastleggen en overdragen')}
                  </button>
                </div>
              </div>

              <div className='gs-form'>
                <div className='gs-knoop-kop'>
                  <strong>
                    <FileText size={14} aria-hidden='true' />{' '}
                    {tr('Готовий контекст переходу для нової сесії', 'Kant-en-klare vervolginstructie voor nieuwe sessie')}
                  </strong>
                  <div className='gs-knoppen'>
                    <button type='button' className='gs-knop-tweede' onClick={() => setPromptTaal(promptTaal === 'uk' ? 'nl' : 'uk')}>
                      {promptTaal === 'uk' ? 'UK → NL' : 'NL → UK'}
                    </button>
                    <button type='button' className='gs-knop-hoofd' onClick={() => void kopieerPrompt()}>
                      <Copy size={13} aria-hidden='true' />
                      {tr('Копіювати перехід', 'Instructie kopiëren')}
                    </button>
                  </div>
                </div>
                <pre className='gs-code'>{promptTaal === 'nl' ? pakket.overdrachtPromptNl : pakket.overdrachtPromptUk}</pre>
              </div>

              {pakket.stappen.length > 0 ? (
                <div className='gs-form'>
                  <strong>
                    <FolderGit2 size={14} aria-hidden='true' />{' '}
                    {tr(`Ланцюжок кроків (${pakket.stappen.length})`, `Chronologie van stappen (${pakket.stappen.length})`)}
                  </strong>
                  <ul className='gs-lijst'>
                    {pakket.stappen.map((st) => (
                      <li key={st.id} className='gs-knoop-kaart'>
                        <div className='gs-knoop-kop'>
                          <span className='gs-pil'>
                            {tr(TAAK_STAP_SOORT_META[st.stapSoort].uk, TAAK_STAP_SOORT_META[st.stapSoort].nl)}
                          </span>
                          <span className='gs-subtekst'>
                            {[st.vanAgent, st.naarAgent].filter(Boolean).join(' → ') || '—'} ·{' '}
                            {new Date(st.aangemaaktOp).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA')}
                          </span>
                        </div>
                        <p className='gs-knoop-inhoud'>{st.samenvatting}</p>
                        {st.bestandsVerwijzingen.length > 0 ? (
                          <div className='gs-knoppen'>
                            {st.bestandsVerwijzingen.map((b, idx) => (
                              <span key={`${b.naam}-${idx}`} className='gs-pil'>
                                {b.naam}{b.verwijzing && b.verwijzing !== b.naam ? `: ${b.verwijzing}` : ''}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
