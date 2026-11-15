// Вкладка «Боти агентів Telegram / Agentbots Telegram» у Стрімі пам’яті:
//   - реєстр окремих Telegram-ботів для 15+ популярних і власних ШІ-агентів без розширення їхніх прав;
//   - перевірка підключення (getMe / getChat / getChatMember), пауза, активація, відкликання й видалення;
//   - черга доставлення й передавання завдань (taakId + vorigeBezorgingId) із захистом від дублікатів і повтором;
//   - ручне збереження підсумків розмов і посилань на файли з інших середовищ у Стрім пам’яті.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { foutCode } from '../agenten/fouten';
import { routeLang } from '../canoniek-navigatie';
import {
  AGENT_PROFIEL_CATALOGUS,
  BERICHT_SOORT_META,
  BERICHT_SOORTEN,
  BEZORGING_STATUS_META,
  BOT_FOUT_TEKSTEN,
  BOT_FOUTEN,
  BOT_STATUS_META,
  type AgentProfielSjabloon,
  type BerichtSoort,
  type BestandsVerwijzing,
  type BotStatus,
  type GeheugenAgentBot,
  type GeheugenTelegramBezorging,
} from '../../shared/geheugen-stroom';
import type { AiRuimte } from '../../shared/ai-ruimte';

type Tr = (uk: string, nl: string) => string;

type Props = {
  tr: Tr;
  onStroomBijgewerkt?: () => void;
};

type OverzichtAntwoord = {
  ruimte: AiRuimte;
  bots: GeheugenAgentBot[];
  bezorgingen: GeheugenTelegramBezorging[];
};

const ctx = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

function botFoutTekst(e: unknown, tr: Tr): string {
  const { code } = foutCode(e);
  if (code === BOT_FOUTEN.sleutelGesloten) {
    return tr(
      'Сховище ключів у цій сесії закрите. Розблокуйте ключ доступу в налаштуваннях, щоб зберігати або розшифровувати токени ботів.',
      'Uw sleutelkluis is in deze sessie vergrendeld. Ontgrendel uw sleutel om botsleutels te bewaren of te lezen.',
    );
  }
  const bekend = BOT_FOUT_TEKSTEN[code];
  if (bekend) return tr(bekend.uk, bekend.nl);
  if (code === BOT_FOUTEN.geheimGeweigerd) {
    return tr(
      'У тексті виявлено можливий ключ доступу або пароль. Запис відхилено фільтром безпеки.',
      'Er is een mogelijke toegangssleutel of wachtwoord herkend. Opslag is geweigerd door het geheimenfilter.',
    );
  }
  if (code === BOT_FOUTEN.ongeldigeInvoer) {
    return tr('Перевірте обов’язкові поля та формат введених значень.', 'Controleer de verplichte velden en de opmaak van uw invoer.');
  }
  return tr(`Помилка операції (${code || 'невідома'}).`, `Fout tijdens bewerking (${code || 'onbekend'}).`);
}

function parseBestandsRegels(tekst: string): BestandsVerwijzing[] {
  const regels = tekst
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const uit: BestandsVerwijzing[] = [];
  for (const r of regels) {
    const [naamRaw, verwRaw, shaRaw] = r.split('|').map((s) => s.trim());
    if (!naamRaw || !verwRaw) continue;
    uit.push({
      naam: naamRaw,
      verwijzing: verwRaw,
      ...(shaRaw ? { sha256: shaRaw } : {}),
    });
  }
  return uit;
}

const kleurKlas = (kleur: string): string => {
  const s = kleur.toLowerCase();
  if (s.includes('c26') || s.includes('d97')) return 'is-warm';
  if (s.includes('059') || s.includes('0d9') || s.includes('0f7')) return 'is-groen';
  if (s.includes('7c3') || s.includes('4f4')) return 'is-violet';
  if (s.includes('475') || s.includes('334')) return 'is-leisteen';
  return 'is-blauw';
};

export default function AgentTelegramBotsPaneel({ tr, onStroomBijgewerkt }: Props) {
  const lang = routeLang();
  const [data, setData] = useState<OverzichtAntwoord | null>(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');

  // Фільтри
  const [zoek, setZoek] = useState('');
  const [filterTaakId, setFilterTaakId] = useState('');
  const [filterAgentSlug, setFilterAgentSlug] = useState('');

  // Форма налаштування бота
  const [agentSlug, setAgentSlug] = useState('claude');
  const [dienstNaam, setDienstNaam] = useState('Anthropic Claude');
  const [weergaveNaam, setWeergaveNaam] = useState('Claude');
  const [beschrijving, setBeschrijving] = useState('');
  const [avatarKleur, setAvatarKleur] = useState('#c26d3a');
  const [botSleutel, setBotSleutel] = useState('');
  const [chatId, setChatId] = useState('');
  const [threadId, setThreadId] = useState('');
  const [toegestaneSoorten, setToegestaneSoorten] = useState<BerichtSoort[]>([...BERICHT_SOORTEN]);
  const [bevestigVerwijderSlug, setBevestigVerwijderSlug] = useState('');

  // Форма відправлення повідомлення / передачі завдання
  const [bezAgentSlug, setBezAgentSlug] = useState('claude');
  const [bezTaakId, setBezTaakId] = useState('');
  const [bezSoort, setBezSoort] = useState<BerichtSoort>('overdracht');
  const [bezTitel, setBezTitel] = useState('');
  const [bezSamenvatting, setBezSamenvatting] = useState('');
  const [bezIdemSleutel, setBezIdemSleutel] = useState('');
  const [bezVorigeId, setBezVorigeId] = useState('');
  const [bezBestandenTekst, setBezBestandenTekst] = useState('');

  // Форма ручного внесення розмови з іншої служби
  const [gesprekAgent, setGesprekAgent] = useState('chatgpt');
  const [gesprekTaakId, setGesprekTaakId] = useState('');
  const [gesprekTitel, setGesprekTitel] = useState('');
  const [gesprekSamenvatting, setGesprekSamenvatting] = useState('');
  const [gesprekBestandenTekst, setGesprekBestandenTekst] = useState('');
  const [gesprekOokBezorgen, setGesprekOokBezorgen] = useState(false);

  const laadOverzicht = useCallback(async () => {
    setLaden(true);
    setFout('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/bots/overzicht', {
        ...ctx(),
        zoek,
        taakId: filterTaakId,
        agentSlug: filterAgentSlug,
      });
      setData(res.data as OverzichtAntwoord);
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setLaden(false);
    }
  }, [zoek, filterTaakId, filterAgentSlug, tr]);

  useEffect(() => {
    void laadOverzicht();
  }, [laadOverzicht]);

  const botsBySlug = useMemo(() => {
    const m = new Map<string, GeheugenAgentBot>();
    for (const b of data?.bots || []) m.set(b.agentSlug, b);
    return m;
  }, [data]);

  function kiesSjabloon(s: AgentProfielSjabloon) {
    setAgentSlug(s.slug);
    setDienstNaam(s.dienstNaam);
    setWeergaveNaam(s.weergaveNaam);
    setBeschrijving(lang === 'nl' ? s.beschrijvingNl : s.beschrijvingUk);
    setAvatarKleur(s.avatarKleur);
    setBotSleutel('');
    const bestaand = botsBySlug.get(s.slug);
    if (bestaand) {
      setChatId(bestaand.chatId);
      setThreadId(bestaand.threadId != null ? String(bestaand.threadId) : '');
      setToegestaneSoorten(bestaand.toegestaneBerichtSoorten);
    } else {
      setChatId('');
      setThreadId('');
      setToegestaneSoorten([...BERICHT_SOORTEN]);
    }
    setMelding('');
    setFout('');
  }

  function laadBotInFormulier(bot: GeheugenAgentBot) {
    setAgentSlug(bot.agentSlug);
    setDienstNaam(bot.dienstNaam);
    setWeergaveNaam(bot.weergaveNaam);
    setBeschrijving(bot.beschrijving);
    setAvatarKleur(bot.avatarKleur || '#2f6f73');
    setBotSleutel('');
    setChatId(bot.chatId);
    setThreadId(bot.threadId != null ? String(bot.threadId) : '');
    setToegestaneSoorten(bot.toegestaneBerichtSoorten);
    setMelding('');
    setFout('');
  }

  function wisselSoort(soort: BerichtSoort) {
    setToegestaneSoorten((prev) =>
      prev.includes(soort) ? (prev.length > 1 ? prev.filter((x) => x !== soort) : prev) : [...prev, soort],
    );
  }

  async function bewaarBot() {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/bots/opslaan', {
        ...ctx(),
        agentSlug,
        dienstNaam,
        weergaveNaam,
        beschrijving,
        avatarKleur,
        ...(botSleutel.trim() ? { botSleutel: botSleutel.trim() } : {}),
        chatId,
        threadId: threadId.trim() ? Number(threadId.trim()) : null,
        toegestaneBerichtSoorten: toegestaneSoorten,
      });
      const opgeslagen = res.data as { bot: GeheugenAgentBot };
      setBotSleutel('');
      setMelding(
        tr(
          `Профіль бота «${opgeslagen.bot.weergaveNaam || opgeslagen.bot.agentSlug}» збережено. Запустіть перевірку підключення.`,
          `Botprofiel "${opgeslagen.bot.weergaveNaam || opgeslagen.bot.agentSlug}" opgeslagen. Voer nu de koppelingscontrole uit.`,
        ),
      );
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function testenBot(slug: string) {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/bots/testen', {
        ...ctx(),
        agentSlug: slug,
      });
      const uitslag = res.data as { bot: GeheugenAgentBot; foutCode?: string };
      if (uitslag.bot.kanPubliceren) {
        setMelding(
          tr(
            `Бот @${uitslag.bot.botUsername || uitslag.bot.agentSlug} підтверджено та активовано для публікації.`,
            `Bot @${uitslag.bot.botUsername || uitslag.bot.agentSlug} bevestigd en geactiveerd om te publiceren.`,
          ),
        );
      } else {
        const tekst = (uitslag.foutCode && BOT_FOUT_TEKSTEN[uitslag.foutCode]) || null;
        setFout(
          tekst
            ? tr(tekst.uk, tekst.nl)
            : tr(
                `Перевірку виконано, але право публікації не підтверджено: ${uitslag.bot.laatsteFout || 'невідома причина'}.`,
                `Controle uitgevoerd, maar publicatierecht is niet bevestigd: ${uitslag.bot.laatsteFout || 'onbekend'}.`,
              ),
        );
      }
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function zetStatus(slug: string, status: BotStatus) {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/ai/geheugen/bots/status', { ...ctx(), agentSlug: slug, status });
      setMelding(
        tr(
          `Стан бота «${slug}» змінено на «${BOT_STATUS_META[status].uk}».`,
          `Status van bot "${slug}" gewijzigd naar "${BOT_STATUS_META[status].nl}".`,
        ),
      );
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function verwijderBot(slug: string) {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await api.post('/api/owner/ai/geheugen/bots/verwijderen', { ...ctx(), agentSlug: slug });
      setBevestigVerwijderSlug('');
      setMelding(tr(`Бота «${slug}» видалено з активного простору.`, `Bot "${slug}" uit de actieve ruimte verwijderd.`));
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function bezorgBericht() {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const sleutel = bezIdemSleutel.trim() || `${bezAgentSlug}-${bezTaakId.trim() || 'taak'}-${Date.now()}`;
      const res = await api.post('/api/owner/ai/geheugen/bots/bezorgen', {
        ...ctx(),
        agentSlug: bezAgentSlug,
        taakId: bezTaakId.trim() || `taak-${Date.now()}`,
        soortBericht: bezSoort,
        titel: bezTitel,
        samenvatting: bezSamenvatting,
        idempotentieSleutel: sleutel,
        ...(bezVorigeId ? { vorigeBezorgingId: bezVorigeId } : {}),
        bestandsVerwijzingen: parseBestandsRegels(bezBestandenTekst),
      });
      const uit = res.data as {
        bezorging: GeheugenTelegramBezorging;
        duplicaat: boolean;
        verzonden: boolean;
        fout?: string;
      };
      if (uit.duplicaat) {
        setMelding(
          tr(
            'Такий ключ повторостійкості вже існує — повернуто наявний запис без дублювання повідомлення.',
            'Deze herhaalsleutel bestaat al — het bestaande bezorgitem is zonder dubbels teruggegeven.',
          ),
        );
      } else if (uit.verzonden) {
        setMelding(
          tr(
            `Повідомлення доставлено до Telegram (ID: ${uit.bezorging.telegramBerichtId ?? '—'}).`,
            `Bericht bezorgd in Telegram (ID: ${uit.bezorging.telegramBerichtId ?? '—'}).`,
          ),
        );
        setBezTitel('');
        setBezSamenvatting('');
        setBezIdemSleutel('');
        setBezBestandenTekst('');
      } else {
        setFout(
          tr(
            `Запис збережено в черзі зі статусом помилки (${uit.fout || 'Telegram'}). Повторіть спробу пізніше без втрати даних.`,
            `Het item is in de wachtrij bewaard met bezorgfout (${uit.fout || 'Telegram'}). U kunt het later veilig herhalen.`,
          ),
        );
      }
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function opnieuwBezorgen(id: string) {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/bots/opnieuw', { ...ctx(), id });
      const uit = res.data as { verzonden: boolean; bezorging: GeheugenTelegramBezorging; fout?: string };
      if (uit.verzonden) {
        setMelding(
          tr(
            `Повторне доставлення успішне (ID у Telegram: ${uit.bezorging.telegramBerichtId ?? '—'}).`,
            `Opnieuw bezorgd in Telegram (bericht-ID: ${uit.bezorging.telegramBerichtId ?? '—'}).`,
          ),
        );
      } else {
        setFout(tr(`Повтор не вдався: ${uit.fout || 'помилка'}`, `Herhaling mislukt: ${uit.fout || 'fout'}`));
      }
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  async function gesprekInvoeren() {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const res = await api.post('/api/owner/ai/geheugen/bots/gesprek-invoeren', {
        ...ctx(),
        agentSlug: gesprekAgent,
        taakId: gesprekTaakId,
        titel: gesprekTitel,
        samenvatting: gesprekSamenvatting,
        bestandsVerwijzingen: parseBestandsRegels(gesprekBestandenTekst),
        ookBezorgen: gesprekOokBezorgen,
      });
      const uit = res.data as { opmerkingUk: string; opmerkingNl: string; bezorging?: GeheugenTelegramBezorging };
      setGesprekTitel('');
      setGesprekSamenvatting('');
      setGesprekBestandenTekst('');
      setMelding(tr(uit.opmerkingUk, uit.opmerkingNl));
      onStroomBijgewerkt?.();
      await laadOverzicht();
    } catch (e) {
      setFout(botFoutTekst(e, tr));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className='gs-container'>
      <div className='gs-kaart gs-bot-info'>
        <div className='gs-kop-tekst'>
          <strong>
            {tr(
              'Ізольовані Telegram-боти по кожному ШІ-агенту без додаткових прав',
              'Afzonderlijke Telegram-bots per AI-agent zonder extra bevoegdheden',
            )}
          </strong>
          <p className='gs-subtekst'>
            {tr(
              'Кожен помічник може мати власного бота та тему в групі-форумі. Токени шифруються Сховищем ключів, ніколи не повертаються на екран і не додають агентам нових прав на сайті.',
              'Elke assistent kan een eigen bot en onderwerp in een forumgroep krijgen. Sleutels worden via de sleutelkluis versleuteld, nooit teruggetoond en geven agenten geen extra rechten op de site.',
            )}
          </p>
        </div>
      </div>

      {fout ? <p className='gs-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='gs-melding' role='status'>{melding}</p> : null}

      <div className='gs-form'>
        <strong>{tr('1. Каталог ШІ-агентів та налаштування бота', '1. Catalogus van AI-agenten en botinstellingen')}</strong>
        <div className='gs-bot-catalogus' aria-label={tr('Швидкий вибір профілю агента', 'Snelle keuze uit agentprofielen')}>
          {AGENT_PROFIEL_CATALOGUS.map((s) => {
            const ingesteld = botsBySlug.get(s.slug);
            return (
              <button
                key={s.slug}
                type='button'
                className={`gs-bot-chip ${agentSlug === s.slug ? 'is-geselecteerd' : ''}`}
                onClick={() => kiesSjabloon(s)}
              >
                <span className={`gs-bot-stip ${kleurKlas(s.avatarKleur)}`} aria-hidden='true' />
                <span>{s.weergaveNaam}</span>
                {ingesteld ? (
                  <span className='gs-pil'>
                    {ingesteld.kanPubliceren ? tr('готовий', 'gereed') : tr(BOT_STATUS_META[ingesteld.status].uk, BOT_STATUS_META[ingesteld.status].nl)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className='gs-grid-3'>
          <label className='gs-veld'>
            <span>{tr('Код агента (власний або з каталогу)', 'Agentkenmerk (eigen of uit catalogus)')}</span>
            <input
              type='text'
              className='gs-invoer'
              value={agentSlug}
              onChange={(e) => setAgentSlug(e.target.value.toLowerCase())}
              placeholder='claude / codex / eigen-agent'
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Назва служби', 'Dienstnaam')}</span>
            <input
              type='text'
              className='gs-invoer'
              value={dienstNaam}
              onChange={(e) => setDienstNaam(e.target.value)}
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Відображуване ім’я', 'Weergavenaam')}</span>
            <input
              type='text'
              className='gs-invoer'
              value={weergaveNaam}
              onChange={(e) => setWeergaveNaam(e.target.value)}
            />
          </label>
        </div>

        <div className='gs-grid-3'>
          <label className='gs-veld'>
            <span>
              {tr('Токен бота від @BotFather (лише для оновлення)', 'Botsleutel van @BotFather (alleen bij invullen gewijzigd)')}
            </span>
            <input
              type='password'
              className='gs-invoer'
              autoComplete='new-password'
              value={botSleutel}
              onChange={(e) => setBotSleutel(e.target.value)}
              placeholder={botsBySlug.get(agentSlug)?.sleutelAanwezig ? '•••• (збережено / opgeslagen)' : '123456789:AA...'}
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Ідентифікатор групи або каналу Telegram (chat_id)', 'Chat-id van de Telegram-groep of het kanaal')}</span>
            <input
              type='text'
              className='gs-invoer'
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder='-1001234567890'
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Номер теми форуму (thread_id, необов’язково)', 'Onderwerpnummer van het forum (thread_id, optioneel)')}</span>
            <input
              type='number'
              className='gs-invoer'
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              placeholder='42'
            />
          </label>
        </div>

        <label className='gs-veld'>
          <span>{tr('Призначення та межі цього бота', 'Doel en afbakening van deze agentbot')}</span>
          <input
            type='text'
            className='gs-invoer'
            value={beschrijving}
            onChange={(e) => setBeschrijving(e.target.value)}
          />
        </label>

        <div className='gs-bot-soorten'>
          <span className='gs-subtekst'>{tr('Дозволені види повідомлень:', 'Toegestane berichttypen:')}</span>
          <div className='gs-knoppen'>
            {BERICHT_SOORTEN.map((soort) => (
              <label key={soort} className='gs-checkbox'>
                <input
                  type='checkbox'
                  checked={toegestaneSoorten.includes(soort)}
                  onChange={() => wisselSoort(soort)}
                />
                <span>{tr(BERICHT_SOORT_META[soort].uk, BERICHT_SOORT_META[soort].nl)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className='gs-knoppen'>
          <button type='button' className='gs-knop-hoofd' disabled={bezig || !agentSlug.trim()} onClick={() => void bewaarBot()}>
            <Bot size={14} aria-hidden='true' />
            {tr('Зберегти профіль бота', 'Botprofiel opslaan')}
          </button>
          {botsBySlug.get(agentSlug)?.sleutelAanwezig ? (
            <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => void testenBot(agentSlug)}>
              <RefreshCw size={14} aria-hidden='true' />
              {tr('Перевірити підключення в Telegram', 'Koppeling in Telegram testen')}
            </button>
          ) : null}
        </div>
      </div>

      <div className='gs-kaart gs-bot-sectie'>
        <div className='gs-kop'>
          <strong>
            {tr(
              `Налаштовані боти в активному просторі (${data?.bots.length ?? 0})`,
              `Ingestelde agentbots in de actieve ruimte (${data?.bots.length ?? 0})`,
            )}
          </strong>
          <button type='button' className='gs-knop-tweede' disabled={laden} onClick={() => void laadOverzicht()}>
            <RefreshCw size={14} aria-hidden='true' />
            {tr('Оновити список', 'Lijst vernieuwen')}
          </button>
        </div>

        {data?.bots.length ? (
          <ul className='gs-knopen-lijst'>
            {data.bots.map((bot) => (
              <li key={bot.id} className='gs-knoop-kaart'>
                <div className='gs-knoop-kop'>
                  <div className='gs-pijlers'>
                    <span className={`gs-bot-stip ${kleurKlas(bot.avatarKleur)}`} aria-hidden='true' />
                    <strong>{bot.weergaveNaam || bot.agentSlug}</strong>
                    <span className='gs-pil'>{bot.agentSlug}</span>
                    {bot.botUsername ? <span className='gs-pil'>@{bot.botUsername}</span> : null}
                    <span className={`gs-pil ${bot.kanPubliceren && bot.status === 'actief' ? '' : 'gs-pil-waarschuwing'}`}>
                      {bot.kanPubliceren ? (
                        <CheckCircle2 size={12} aria-hidden='true' />
                      ) : (
                        <ShieldAlert size={12} aria-hidden='true' />
                      )}
                      {tr(BOT_STATUS_META[bot.status].uk, BOT_STATUS_META[bot.status].nl)}
                    </span>
                  </div>
                  <div className='gs-knoppen'>
                    <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => laadBotInFormulier(bot)}>
                      {tr('Редагувати', 'Bewerken')}
                    </button>
                    <button type='button' className='gs-knop-tweede' disabled={bezig || !bot.sleutelAanwezig} onClick={() => void testenBot(bot.agentSlug)}>
                      <ShieldCheck size={14} aria-hidden='true' />
                      {tr('Перевірити', 'Testen')}
                    </button>
                    {bot.status === 'gepauzeerd' ? (
                      <button type='button' className='gs-knop-tweede' disabled={bezig || !bot.kanPubliceren} onClick={() => void zetStatus(bot.agentSlug, 'actief')}>
                        <PlayCircle size={14} aria-hidden='true' />
                        {tr('Активувати', 'Activeren')}
                      </button>
                    ) : bot.status === 'actief' ? (
                      <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => void zetStatus(bot.agentSlug, 'gepauzeerd')}>
                        <PauseCircle size={14} aria-hidden='true' />
                        {tr('Призупинити', 'Pauzeren')}
                      </button>
                    ) : null}
                    {bot.status !== 'ingetrokken' ? (
                      <button type='button' className='gs-knop-gevaar' disabled={bezig} onClick={() => void zetStatus(bot.agentSlug, 'ingetrokken')}>
                        {tr('Відкликати', 'Intrekken')}
                      </button>
                    ) : null}
                    {bevestigVerwijderSlug === bot.agentSlug ? (
                      <>
                        <button type='button' className='gs-knop-gevaar' disabled={bezig} onClick={() => void verwijderBot(bot.agentSlug)}>
                          {tr('Підтвердити видалення', 'Verwijderen bevestigen')}
                        </button>
                        <button type='button' className='gs-knop-tweede' onClick={() => setBevestigVerwijderSlug('')}>
                          {tr('Скасувати', 'Annuleren')}
                        </button>
                      </>
                    ) : (
                      <button
                        type='button'
                        className='gs-knop-tweede'
                        aria-label={tr('Видалити бота', 'Bot verwijderen')}
                        onClick={() => setBevestigVerwijderSlug(bot.agentSlug)}
                      >
                        <Trash2 size={14} aria-hidden='true' />
                      </button>
                    )}
                  </div>
                </div>
                <p className='gs-subtekst'>
                  {tr('Група', 'Groep')}: <code>{bot.chatId || '—'}</code>
                  {' · '}
                  {tr('Тема', 'Onderwerp')}: <code>{bot.threadId != null ? String(bot.threadId) : '—'}</code>
                  {' · '}
                  {tr('Токен', 'Sleutel')}: <code>{bot.sleutelAanwezig ? bot.sleutelMasker : tr('відсутній', 'ontbreekt')}</code>
                  {bot.laatsteBerichtId != null ? ` · ${tr('Останнє ID', 'Laatste ID')}: ${bot.laatsteBerichtId}` : ''}
                </p>
                {bot.laatsteFout ? (
                  <p className='gs-fout' role='note'>
                    <AlertTriangle size={13} aria-hidden='true' /> {bot.laatsteFout}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className='gs-leeg'>
            <Bot size={22} aria-hidden='true' />
            <p className='gs-subtekst'>
              {tr(
                'У цьому просторі ще немає налаштованих ботів агентів. Оберіть профіль вище й додайте токен від @BotFather.',
                'Er zijn in deze ruimte nog geen agentbots ingesteld. Kies hierboven een profiel en vul een sleutel van @BotFather in.',
              )}
            </p>
          </div>
        )}
      </div>

      <div className='gs-grid-2'>
        <div className='gs-form'>
          <strong>{tr('2. Доставлення або передавання завдання ботові', '2. Bericht of taakoverdracht naar agentbot bezorgen')}</strong>
          <div className='gs-grid-2'>
            <label className='gs-veld'>
              <span>{tr('Агент-отримувач', 'Doelagent')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={bezAgentSlug}
                onChange={(e) => setBezAgentSlug(e.target.value.toLowerCase())}
              />
            </label>
            <label className='gs-veld'>
              <span>{tr('Вид повідомлення', 'Soort bericht')}</span>
              <select className='gs-select' value={bezSoort} onChange={(e) => setBezSoort(e.target.value as BerichtSoort)}>
                {BERICHT_SOORTEN.map((s) => (
                  <option key={s} value={s}>
                    {tr(BERICHT_SOORT_META[s].uk, BERICHT_SOORT_META[s].nl)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className='gs-grid-2'>
            <label className='gs-veld'>
              <span>{tr('Код завдання (taakId)', 'Taaknummer (taakId)')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={bezTaakId}
                onChange={(e) => setBezTaakId(e.target.value)}
                placeholder='taak-2026-01'
              />
            </label>
            <label className='gs-veld'>
              <span>{tr('Ключ повторостійкості (необов’язково)', 'Herhaalsleutel (optioneel)')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={bezIdemSleutel}
                onChange={(e) => setBezIdemSleutel(e.target.value)}
                placeholder='overdracht-stap-2'
              />
            </label>
          </div>
          <label className='gs-veld'>
            <span>{tr('Попередня передача в ланцюжку (необов’язково)', 'Vorige bezorging in deze keten (optioneel)')}</span>
            <select className='gs-select' value={bezVorigeId} onChange={(e) => setBezVorigeId(e.target.value)}>
              <option value=''>{tr('— без попереднього запису —', '— geen vorige bezorging —')}</option>
              {(data?.bezorgingen || []).map((z) => (
                <option key={z.id} value={z.id}>
                  [{z.agentSlug}] {z.taakId || '—'} · {z.titel.slice(0, 50)}
                </option>
              ))}
            </select>
          </label>
          <label className='gs-veld'>
            <span>{tr('Заголовок повідомлення (без секретів)', 'Titel van het bericht (zonder geheimen)')}</span>
            <input
              type='text'
              className='gs-invoer'
              value={bezTitel}
              onChange={(e) => setBezTitel(e.target.value)}
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Підсумок і контекст передавання', 'Samenvatting en overdrachtscontext')}</span>
            <textarea
              className='gs-textarea'
              value={bezSamenvatting}
              onChange={(e) => setBezSamenvatting(e.target.value)}
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Файли (рядок: Назва | Посилання | SHA-256)', 'Bestanden (regel: Naam | Verwijzing | SHA-256)')}</span>
            <textarea
              className='gs-textarea gs-bot-klein-area'
              value={bezBestandenTekst}
              onChange={(e) => setBezBestandenTekst(e.target.value)}
              placeholder='rapport.md | /cloud/rapport.md'
            />
          </label>
          <div className='gs-knoppen'>
            <button type='button' className='gs-knop-hoofd' disabled={bezig || !bezTitel.trim()} onClick={() => void bezorgBericht()}>
              <Send size={14} aria-hidden='true' />
              {tr('Поставити в чергу й надіслати', 'Klaarzetten en bezorgen')}
            </button>
          </div>
        </div>

        <div className='gs-form'>
          <strong>{tr('3. Ручне внесення розмови зі сторонньої служби', '3. Handmatige gesprekssamenvatting van een andere dienst')}</strong>
          <p className='gs-subtekst'>
            {tr(
              'Зовнішні платформи без відкритого інтерфейсу не зчитуються автоматично — перенесіть сюди короткий висновок і посилання на файли.',
              'Externe diensten zonder koppeling worden niet automatisch gelezen — leg hier een korte samenvatting en bestandsverwijzingen handmatig vast.',
            )}
          </p>
          <div className='gs-grid-2'>
            <label className='gs-veld'>
              <span>{tr('Агент / служба джерела', 'Agent / brondienst')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={gesprekAgent}
                onChange={(e) => setGesprekAgent(e.target.value.toLowerCase())}
              />
            </label>
            <label className='gs-veld'>
              <span>{tr('Код завдання (необов’язково)', 'Taaknummer (optioneel)')}</span>
              <input
                type='text'
                className='gs-invoer'
                value={gesprekTaakId}
                onChange={(e) => setGesprekTaakId(e.target.value)}
              />
            </label>
          </div>
          <label className='gs-veld'>
            <span>{tr('Заголовок підсумку розмови', 'Titel van de gesprekssamenvatting')}</span>
            <input
              type='text'
              className='gs-invoer'
              value={gesprekTitel}
              onChange={(e) => setGesprekTitel(e.target.value)}
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Зміст висновку й ухвалені рішення (без таємниць)', 'Inhoud van de conclusie en besluiten (zonder geheimen)')}</span>
            <textarea
              className='gs-textarea'
              value={gesprekSamenvatting}
              onChange={(e) => setGesprekSamenvatting(e.target.value)}
            />
          </label>
          <label className='gs-veld'>
            <span>{tr('Посилання на файли (Назва | Шлях | SHA-256)', 'Bestandsverwijzingen (Naam | Pad | SHA-256)')}</span>
            <textarea
              className='gs-textarea gs-bot-klein-area'
              value={gesprekBestandenTekst}
              onChange={(e) => setGesprekBestandenTekst(e.target.value)}
            />
          </label>
          <label className='gs-checkbox'>
            <input
              type='checkbox'
              checked={gesprekOokBezorgen}
              onChange={(e) => setGesprekOokBezorgen(e.target.checked)}
            />
            <span>{tr('Також одразу надіслати в тему Telegram цього агента', 'Ook direct bezorgen in het Telegram-onderwerp van deze agent')}</span>
          </label>
          <div className='gs-knoppen'>
            <button
              type='button'
              className='gs-knop-tweede'
              disabled={bezig || !gesprekTitel.trim() || !gesprekSamenvatting.trim()}
              onClick={() => void gesprekInvoeren()}
            >
              {tr('Зберегти у Стрім пам’яті', 'Opslaan in geheugenstroom')}
            </button>
          </div>
        </div>
      </div>

      <div className='gs-kaart gs-bot-sectie'>
        <strong>{tr('Черга доставлення та історія передавань', 'Bezorgwachtrij en overdrachtsgeschiedenis')}</strong>
        <div className='gs-grid-3'>
          <input
            type='search'
            className='gs-invoer'
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder={tr('Пошук за заголовком, змістом чи ключем…', 'Zoeken op titel, inhoud of sleutel…')}
          />
          <input
            type='text'
            className='gs-invoer'
            value={filterTaakId}
            onChange={(e) => setFilterTaakId(e.target.value)}
            placeholder={tr('Фільтр за кодом завдання (taakId)…', 'Filter op taaknummer (taakId)…')}
          />
          <input
            type='text'
            className='gs-invoer'
            value={filterAgentSlug}
            onChange={(e) => setFilterAgentSlug(e.target.value.toLowerCase())}
            placeholder={tr('Фільтр за агентом (claude, codex…)…', 'Filter op agent (claude, codex…)…')}
          />
        </div>

        {data?.bezorgingen.length ? (
          <ul className='gs-knopen-lijst'>
            {data.bezorgingen.map((z) => (
              <li key={z.id} className='gs-knoop-kaart'>
                <div className='gs-knoop-kop'>
                  <div className='gs-pijlers'>
                    <strong>{z.titel}</strong>
                    <span className='gs-pil'>{z.agentSlug}</span>
                    {z.taakId ? <span className='gs-pil'>{z.taakId}</span> : null}
                    <span className='gs-pil'>{tr(BERICHT_SOORT_META[z.soortBericht].uk, BERICHT_SOORT_META[z.soortBericht].nl)}</span>
                    <span className={`gs-pil ${z.status === 'mislukt' ? 'gs-pil-waarschuwing' : ''}`}>
                      {tr(BEZORGING_STATUS_META[z.status].uk, BEZORGING_STATUS_META[z.status].nl)}
                    </span>
                  </div>
                  {(z.status === 'mislukt' || z.status === 'wachtrij') ? (
                    <button type='button' className='gs-knop-tweede' disabled={bezig} onClick={() => void opnieuwBezorgen(z.id)}>
                      <RefreshCw size={14} aria-hidden='true' />
                      {tr('Повторити доставлення', 'Opnieuw bezorgen')}
                    </button>
                  ) : null}
                </div>
                {z.samenvatting ? <p className='gs-knoop-inhoud'>{z.samenvatting}</p> : null}
                <p className='gs-subtekst'>
                  {tr('Спроб', 'Pogingen')}: {z.pogingen}
                  {' · '}
                  {tr('Ключ', 'Sleutel')}: <code>{z.idempotentieSleutel}</code>
                  {z.telegramBerichtId != null ? ` · Telegram #${z.telegramBerichtId}` : ''}
                  {z.vorigeBezorgingId ? ` · ${tr('Після запису', 'Na item')} ${z.vorigeBezorgingId.slice(0, 8)}` : ''}
                </p>
                {z.laatsteFout ? <p className='gs-fout'>{z.laatsteFout}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className='gs-subtekst'>
            {tr('Записів у черзі доставлення за обраним фільтром ще немає.', 'Er zijn nog geen bezorgitems voor deze selectie.')}
          </p>
        )}
      </div>
    </div>
  );
}
