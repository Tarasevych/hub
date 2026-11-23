// «Налаштування → Зашифрований архів випусків у Telegram» (AES-256-GCM, розрізання, обов’язкова перевірка, відновлення).
// «Instellingen → Versleuteld release-archief in Telegram» (AES-256-GCM, opsplitsen, verplichte controle, herstel).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive, CheckCircle2, Copy, Download, EyeOff, KeyRound, Loader2, Lock, RefreshCw, Save, Send, ShieldAlert, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import { api } from '../platform/client';
import { useVlag } from '../functievlag-lezen';
import { foutCode } from '../platform/webauthn';
import { leesSha256 } from '../../shared/bestand-lezen';
import HulpVraag from '../hulp/HulpVraag';
import { foutTekst } from './fouten';
import { leesTelegramKoppeling, UITROL_TELEGRAM_KOPPELING_VLAG } from './telegram-koppeling';
import { datum, mb, tr, type Lang, type Run } from './types';

const SLEUTEL_VERBERG_SEC = 30;
const KLEM_WIS_MS = 45_000;

type TelegramDeel = {
  deelNr: number;
  totaalDelen: number;
  naam: string;
  sha256: string;
  bytes: number;
};

type TelegramArchiefItem = {
  id: string;
  versie: string;
  runId: string;
  chatId: string;
  messageThreadId: number | null;
  origineelSha256: string;
  origineelBytes: number;
  versleuteldSha256: string;
  versleuteldBytes: number;
  algoritme: string;
  aantalDelen: number;
  delen: TelegramDeel[];
  status: string;
  foutCode: string;
  pogingen: number;
  aangemaaktOp: string;
  voltooidOp: string;
};

type TelegramStand = {
  chatId: string;
  messageThreadId: number | null;
  actief: boolean;
  verplichtVoorInstallatie: boolean;
  laatstGetestOp: string;
  laatsteTestOk: boolean;
  laatsteTestFout: string;
  bijgewerktOp: string;
  botAanwezig: boolean;
  botBron: 'kluis' | 'omgeving' | null;
  sleutelAanwezig: boolean;
  webhookGeheimAanwezig?: boolean;
  webhookUrl?: string;
  klaar: boolean;
  blokkade: { geblokkeerd: false } | { geblokkeerd: true; code: 'TELEGRAM_ARCHIEF_VEREIST'; huidigeVersie: string; huidigeRunId: string };
  archieven: TelegramArchiefItem[];
};

const UITROL_BOT_EMBLEEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512">
  <circle cx="64" cy="64" r="60" fill="#1e3a8a" stroke="#60a5fa" stroke-width="4" />
  <circle cx="64" cy="64" r="50" fill="#172554" />
  <rect x="34" y="54" width="60" height="40" rx="8" fill="#1d4ed8" stroke="#93c5fd" stroke-width="3.5" />
  <path d="M34 62h60" stroke="#93c5fd" stroke-width="3" />
  <path d="M64 30v36M51 54l13 13 13-13" fill="none" stroke="#f8fafc" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  <rect x="52" y="75" width="24" height="6" rx="3" fill="#bfdbfe" />
</svg>\n`;

export default function TelegramArchief({
  lang,
  context,
  runs = [],
  onGewijzigd,
}: {
  lang: Lang;
  context: Record<string, unknown>;
  runs?: Run[];
  onGewijzigd?: () => void;
}) {
  const koppelingVlagAan = useVlag('uitrol-telegram-koppeling-v1', false);
  const [stand, setStand] = useState<TelegramStand | null>(null);
  const [chatId, setChatId] = useState('');
  const [koppelLink, setKoppelLink] = useState('');
  const [threadId, setThreadId] = useState('');
  const [actief, setActief] = useState(false);
  const [verplicht, setVerplicht] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [archiefSleutel, setArchiefSleutel] = useState('');
  const [eenmaligSleutel, setEenmaligSleutel] = useState('');
  const [sleutelRestSec, setSleutelRestSec] = useState(0);
  const [gekozenRun, setGekozenRun] = useState('');
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null);
  const [laadFout, setLaadFout] = useState('');
  const klemTimerRef = useRef<number | null>(null);

  const laden = useCallback(async () => {
    try {
      const d = (await api.post('/api/owner/uitrol/telegram/stand', context)).data as TelegramStand;
      setStand(d);
      setChatId(d.chatId || '');
      setThreadId(d.messageThreadId != null ? String(d.messageThreadId) : '');
      setActief(Boolean(d.actief));
      setVerplicht(Boolean(d.verplichtVoorInstallatie));
      setLaadFout('');
    } catch (e) {
      setLaadFout(foutTekst(lang, foutCode(e)));
    }
  }, [context, lang]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const gearchiveerdeRuns = runs.filter((r) => r.staat === 'klaar' && r.pakket?.bewaard);
  useEffect(() => {
    if (!gekozenRun && gearchiveerdeRuns.length > 0) {
      setGekozenRun(gekozenRunsFirst(gekozenRun, stand, gearchiveerdeRuns));
    }
  }, [gekozenRun, stand, gearchiveerdeRuns]);

  const opslaan = async (genereerSleutel = false) => {
    setBezig(genereerSleutel ? 'genereer' : 'opslaan');
    setMelding(null);
    setEenmaligSleutel('');
    try {
      const r = (await api.post('/api/owner/uitrol/telegram/instellingen', {
        ...context,
        chatId: chatId.trim(),
        messageThreadId: threadId.trim() ? Number(threadId.trim()) : '',
        actief,
        verplichtVoorInstallatie: verplicht,
        ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        ...(genereerSleutel ? { genereerSleutel: true } : archiefSleutel.trim() ? { archiefSleutel: archiefSleutel.trim() } : {}),
      })).data as TelegramStand & { eenmaligeSleutel?: string };
      setBotToken('');
      setArchiefSleutel('');
      if (r.eenmaligeSleutel) setEenmaligSleutel(r.eenmaligeSleutel);
      setMelding({
        soort: 'ok',
        tekst: genereerSleutel
          ? tr(lang, 'Новий 256-бітний ключ згенеровано та зашифровано у Сховищі секретів. Обов’язково збережіть його копію нижче.', 'Nieuwe 256-bits sleutel gegenereerd en versleuteld in het Geheimenkluis opgeslagen. Bewaar een kopie hieronder.')
          : tr(lang, 'Налаштування архівування в Telegram збережено.', 'Instellingen voor Telegram-archivering opgeslagen.'),
      });
      await laden();
      onGewijzigd?.();
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setBezig('');
    }
  };

  const verwerkKoppeling = (waarde: string) => {
    setKoppelLink(waarde);
    const koppeling = leesTelegramKoppeling(waarde);
    if (!koppeling) return;
    setChatId(koppeling.chatId);
    if (koppeling.threadId) setThreadId(koppeling.threadId);
    setMelding({
      soort: 'ok',
      tekst: tr(
        lang,
        `З посилання взято chat_id ${koppeling.chatId}${koppeling.threadId ? ` і тему ${koppeling.threadId}` : ''}. Натисніть «Зберегти налаштування», потім «Перевірити зв’язок».`,
        `Uit de link overgenomen: chat_id ${koppeling.chatId}${koppeling.threadId ? ` en topic ${koppeling.threadId}` : ''}. Klik op «Instellingen opslaan» en daarna op «Verbinding testen».`,
      ),
    });
  };

  const testen = async () => {
    setBezig('test');
    setMelding(null);
    try {
      const r = (await api.post('/api/owner/uitrol/telegram/testen', context)).data as {
        botUsername?: string;
        chatTitle?: string;
        chatType?: string;
        botStatus?: string;
        messageThreadId?: number | null;
        documentOk?: boolean;
      };
      setMelding({
        soort: 'ok',
        tekst: tr(
          lang,
          `Зв’язок підтверджено: бот @${r.botUsername || 'bot'} (${r.botStatus || 'ok'}) надіслав пробне повідомлення${r.documentOk ? ' і пробний файл' : ''} у «${r.chatTitle || chatId}»${r.messageThreadId ? ` (тема ${r.messageThreadId})` : ''}.`,
          `Verbinding geslaagd: bot @${r.botUsername || 'bot'} (${r.botStatus || 'ok'}) stuurde een proefbericht${r.documentOk ? ' en proefbestand' : ''} naar «${r.chatTitle || chatId}»${r.messageThreadId ? ` (topic ${r.messageThreadId})` : ''}.`,
        ),
      });
      await laden();
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
      await laden();
    } finally {
      setBezig('');
    }
  };

  const webhookInstellen = async (vernieuwGeheim = false) => {
    setBezig('webhook');
    setMelding(null);
    try {
      const r = (await api.post('/api/owner/uitrol/telegram/webhook-instellen', { ...context, vernieuwGeheim })).data as {
        webhookUrl?: string;
      };
      setMelding({
        soort: 'ok',
        tekst: tr(
          lang,
          `Вхідний приймач команд бота випусків підключено на ${r.webhookUrl || 'адресу сервера'} (доступні лише /status і /help у погодженій темі).`,
          `Webhook van de releasebot geactiveerd op ${r.webhookUrl || 'het serveradres'} (alleen /status en /help in het ingestelde topic).`,
        ),
      });
      await laden();
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setBezig('');
    }
  };

  const downloadEmbleem = () => {
    const blob = new Blob([UITROL_BOT_EMBLEEM_SVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mijn-ruimte-uitrol-bot.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const kopieerTekst = async (waarde: string, uk: string, nl: string) => {
    if (!waarde) return;
    try {
      await navigator.clipboard.writeText(waarde);
      setMelding({ soort: 'ok', tekst: tr(lang, uk, nl) });
    } catch { /* ігнор */ }
  };

  const nuArchiveren = async (runIdDoel: string) => {
    if (!runIdDoel) return;
    setBezig('archief');
    setMelding(null);
    try {
      const r = (await api.post('/api/owner/uitrol/telegram/archiveren', { ...context, runId: runIdDoel })).data as {
        versie: string;
        aantalDelen: number;
        reedsBestaand?: boolean;
      };
      setMelding({
        soort: 'ok',
        tekst: r.reedsBestaand
          ? tr(lang, `Випуск ${r.versie} уже збережено в Telegram (${r.aantalDelen} част.).`, `Release ${r.versie} staat al in Telegram (${r.aantalDelen} delen).`)
          : tr(lang, `Зашифрований архів ${r.versie} надіслано до Telegram (${r.aantalDelen} част., AES-256-GCM).`, `Versleuteld archief ${r.versie} naar Telegram verzonden (${r.aantalDelen} delen, AES-256-GCM).`),
      });
      await laden();
      onGewijzigd?.();
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setBezig('');
    }
  };

  const herstellen = async (item: TelegramArchiefItem) => {
    setBezig(`herstel-${item.id}`);
    setMelding(null);
    try {
      const info = (await api.post(`/api/owner/uitrol/telegram/archief/${encodeURIComponent(item.id)}/herstel`, context)).data as {
        downloadId: string;
        naam: string;
        sha256: string;
        bytes: number;
      };
      const res = await fetch(`/api/owner/uitrol/telegram/archief/${encodeURIComponent(item.id)}/download`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...context, downloadId: info.downloadId }),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const blob = await res.blob();
      const echteSha = await leesSha256(blob);
      if (echteSha !== info.sha256 || echteSha !== item.origineelSha256) {
        throw new Error('TELEGRAM_HERSTEL_INTEGRITEIT');
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = info.naam;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMelding({
        soort: 'ok',
        tekst: tr(
          lang,
          `Архів ${item.versie} зібрано з ${item.aantalDelen} частин Telegram, розшифровано, перевірено SHA-256 у браузері та збережено як ${info.naam}.`,
          `Archief ${item.versie} uit ${item.aantalDelen} Telegram-delen samengevoegd, ontsleuteld, in de browser met SHA-256 gecontroleerd en opgeslagen als ${info.naam}.`,
        ),
      });
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setBezig('');
    }
  };

  useEffect(() => {
    if (!eenmaligSleutel) {
      setSleutelRestSec(0);
      return;
    }
    setSleutelRestSec(SLEUTEL_VERBERG_SEC);
    const gestart = Date.now();
    const t = window.setInterval(() => {
      const rest = Math.max(0, SLEUTEL_VERBERG_SEC - Math.floor((Date.now() - gestart) / 1000));
      setSleutelRestSec(rest);
      if (rest === 0) {
        window.clearInterval(t);
        setEenmaligSleutel('');
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [eenmaligSleutel]);

  useEffect(() => () => {
    if (klemTimerRef.current !== null) {
      window.clearTimeout(klemTimerRef.current);
      klemTimerRef.current = null;
    }
  }, []);

  const verbergEnWisNu = async () => {
    setEenmaligSleutel('');
    setSleutelRestSec(0);
    if (klemTimerRef.current !== null) {
      window.clearTimeout(klemTimerRef.current);
      klemTimerRef.current = null;
    }
    try {
      await navigator.clipboard.writeText('');
      setMelding({
        soort: 'ok',
        tekst: tr(lang, 'Ключ приховано з екрана, а буфер обміну очищено.', 'Sleutel verborgen en klembord gewist.'),
      });
    } catch {
      setMelding({
        soort: 'fout',
        tekst: tr(
          lang,
          'Ключ приховано з екрана, але браузер не дозволив очистити буфер обміну — очистьте його вручну.',
          'Sleutel verborgen, maar de browser weigerde het klembord te wissen — wis het handmatig.',
        ),
      });
    }
  };

  const kopieerSleutel = async () => {
    if (!eenmaligSleutel) return;
    try {
      await navigator.clipboard.writeText(eenmaligSleutel);
      if (klemTimerRef.current !== null) window.clearTimeout(klemTimerRef.current);
      klemTimerRef.current = window.setTimeout(() => {
        klemTimerRef.current = null;
        void navigator.clipboard.writeText('').catch(() => undefined);
      }, KLEM_WIS_MS);
      setMelding({
        soort: 'ok',
        tekst: tr(
          lang,
          'Ключ скопійовано. Збережіть його поза сервером — буфер обміну автоматично очиститься через 45 секунд.',
          'Sleutel gekopieerd. Bewaar deze buiten de server — het klembord wordt over 45 seconden automatisch gewist.',
        ),
      });
    } catch {
      setMelding({
        soort: 'fout',
        tekst: tr(
          lang,
          'Браузер заборонив доступ до буфера обміну — скопіюйте ключ вручну й збережіть його поза сервером.',
          'De browser weigerde toegang tot het klembord — kopieer de sleutel handmatig en bewaar deze buiten de server.',
        ),
      });
    }
  };

  return (
    <section className='ut-kaart ut-github' id='ut-telegram-archief-anker' data-ut-telegram-archief data-vlag={UITROL_TELEGRAM_KOPPELING_VLAG} aria-labelledby='ut-tg-arch-titel'>
      <header className='ut-kaart-kop'>
        <div>
          <h2 id='ut-tg-arch-titel'><Lock aria-hidden='true' /> {tr(lang, 'Резервне архівування випусків у Telegram (AES-256-GCM)', 'Versleutelde release-reservekopie in Telegram (AES-256-GCM)')}</h2>
          <p className='ut-sub'>
            {tr(
              lang,
              'Перед відправкою в приватний канал чи групу Telegram кожен архів .tar.gz шифрується на сервері вашим 256-бітним ключем, ріжеться на безпечні частини й супроводжується контрольними сумами SHA-256.',
              'Vóór verzending naar uw besloten Telegram-kanaal of -groep wordt elk .tar.gz-archief op de server met uw 256-bits sleutel versleuteld, in veilige delen gesplitst en voorzien van SHA-256-controlesommen.',
            )}
          </p>
        </div>
        <button type='button' className='ut-knop' disabled={Boolean(bezig)} onClick={() => void laden()}>
          <RefreshCw size={15} aria-hidden='true' /> {tr(lang, 'Оновити', 'Vernieuwen')}
        </button>
      </header>

      {laadFout && <p className='ut-fout' role='alert'>{laadFout}</p>}
      {!stand && !laadFout && <p className='ut-leeg' role='status'><Loader2 className='ut-draai' aria-hidden='true' /> {tr(lang, 'Завантаження…', 'Laden…')}</p>}

      {stand && (
        <>
          {stand.blokkade.geblokkeerd && (
            <div className='ut-fout' role='alert' data-ut-tg-blokkade>
              <TriangleAlert size={16} aria-hidden='true' />{' '}
              {tr(
                lang,
                `Схвалення нових оновлень заблоковано: поточний випуск ${stand.blokkade.huidigeVersie} ще не заархівовано в Telegram.`,
                `Goedkeuren van nieuwe updates is geblokkeerd: de huidige release ${stand.blokkade.huidigeVersie} is nog niet in Telegram gearchiveerd.`,
              )}{' '}
              <button
                type='button'
                className='ut-knop ut-knop-primair'
                disabled={Boolean(bezig) || !stand.klaar}
                onClick={() => stand.blokkade.geblokkeerd && void nuArchiveren(stand.blokkade.huidigeRunId)}
              >
                {bezig === 'archief' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Send aria-hidden='true' />}
                {tr(lang, `Заархівувати ${stand.blokkade.huidigeVersie} зараз`, `Nu ${stand.blokkade.huidigeVersie} archiveren`)}
              </button>
            </div>
          )}

          <div className='ut-gh-raster'>
            <div className='ut-gh-blok' data-ut-tg-config>
              <h3><Send aria-hidden='true' /> {tr(lang, 'Канал або група та бот', 'Kanaal of groep en bot')}</h3>
              <ul className='ut-gh-tokens'>
                <li data-aanwezig={stand.botAanwezig}>
                  {stand.botAanwezig ? <CheckCircle2 aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
                  <span>
                    <b>{tr(lang, 'Окремий ключ бота випусків', 'Eigen bot-token van releasebot')}</b>
                    <small>
                      {stand.botAanwezig
                        ? tr(
                            lang,
                            `підключено (${stand.botBron === 'kluis' ? 'Сховище секретів · TELEGRAM_UITROL_BOT_TOKEN' : 'змінна оточення'})`,
                            `gekoppeld (${stand.botBron === 'kluis' ? 'Geheimenkluis · TELEGRAM_UITROL_BOT_TOKEN' : 'omgeving'})`,
                          )
                        : tr(lang, 'не підключено', 'niet ingesteld')}
                    </small>
                  </span>
                </li>
                <li data-aanwezig={stand.sleutelAanwezig}>
                  {stand.sleutelAanwezig ? <CheckCircle2 aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
                  <span>
                    <b>{tr(lang, 'Ключ шифрування AES-256-GCM', 'Versleutelingssleutel AES-256-GCM')}</b>
                    <small>{stand.sleutelAanwezig ? tr(lang, 'збережено в Сховищі секретів (UITROL_ARCHIEF_SLEUTEL)', 'opgeslagen in Geheimenkluis (UITROL_ARCHIEF_SLEUTEL)') : tr(lang, 'не заданий', 'niet ingesteld')}</small>
                  </span>
                </li>
              </ul>

              {koppelingVlagAan ? (
                <label className='ut-veld'>
                  <span>{tr(lang, 'Посилання на гілку Telegram (необов’язково, заповнить поля нижче)', 'Link naar het Telegram-topic (optioneel, vult de velden hieronder)')}</span>
                  <input
                    type='text'
                    value={koppelLink}
                    onChange={(e) => verwerkKoppeling(e.target.value)}
                    placeholder='https://t.me/c/3928298101/1939'
                    maxLength={200}
                    spellCheck={false}
                    autoComplete='off'
                    data-ut-tg-koppeling
                  />
                  <small className='ut-hint'>
                    {tr(
                      lang,
                      'Вставте посилання на тему групи (три числа: група, тема, повідомлення) — з нього автоматично підставиться chat_id і номер теми.',
                      'Plak de topiclink (drie getallen: groep, topic, bericht) — daaruit worden chat_id en topicnummer overgenomen.',
                    )}
                  </small>
                </label>
              ) : null}

              <label className='ut-veld'>
                <span>{tr(lang, 'Ідентифікатор чату / каналу (chat_id)', 'Chat- of kanaal-ID (chat_id)')}</span>
                <input
                  type='text'
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder='-1001234567890'
                  maxLength={64}
                  spellCheck={false}
                  autoComplete='off'
                  data-ut-tg-chatid
                />
              </label>

              <label className='ut-veld'>
                <span>{tr(lang, 'Тема групи (message_thread_id, необов’язково)', 'Groeptopic (message_thread_id, optioneel)')}</span>
                <input
                  type='text'
                  value={threadId}
                  onChange={(e) => setThreadId(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder='42'
                  maxLength={20}
                  inputMode='numeric'
                />
              </label>

              <label className='ut-veld'>
                <span>{tr(lang, 'Новий ключ доступу бота (залиште порожнім, щоб не змінювати)', 'Nieuwe bot-token (leeg laten om huidige te behouden)')}</span>
                <input
                  type='password'
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder='123456789:AA...'
                  maxLength={140}
                  autoComplete='new-password'
                  data-ai-geen-actie='1'
                />
              </label>
            </div>

            <div className='ut-gh-blok' data-ut-tg-sleutel>
              <h3><KeyRound aria-hidden='true' /> {tr(lang, 'Ключ шифрування та політика', 'Versleutelingssleutel en beleid')} <HulpVraag k='uitrol.telegram-archief-actief' naam={['Автоархів', 'Automatisch archiveren']} meer={[['uitrol.telegram-archief-verplicht', 'Обов’язкове збереження', 'Verplichte reservekopie']]} lang={lang} /></h3>
              <label className='ut-veld'>
                <span>{tr(lang, 'Власний 256-бітний ключ (64 hex або мін. 32 символи)', 'Eigen 256-bits sleutel (64 hex of min. 32 tekens)')}</span>
                <input
                  type='password'
                  value={archiefSleutel}
                  onChange={(e) => setArchiefSleutel(e.target.value)}
                  placeholder={stand.sleutelAanwezig ? '••••••••••••••••••••••••••••••••' : tr(lang, 'Введіть ключ або згенеруйте кнопкою нижче', 'Voer een sleutel in of genereer er een')}
                  maxLength={256}
                  autoComplete='new-password'
                  data-ai-geen-actie='1'
                  data-ut-tg-sleutel-invoer
                />
              </label>

              <label className='ut-schakel'>
                <input data-hulp='uitrol.telegram-archief-actief' type='checkbox' checked={actief} onChange={(e) => setActief(e.target.checked)} data-ut-tg-actief />
                <span>{tr(lang, 'Автоматично шифрувати й надсилати кожен встановлений випуск у Telegram', 'Elke geslaagde installatie automatisch versleutelen en naar Telegram sturen')}</span>
              </label>

              <label className='ut-schakel'>
                <input data-hulp='uitrol.telegram-archief-verplicht' type='checkbox' checked={verplicht} onChange={(e) => setVerplicht(e.target.checked)} data-ut-tg-verplicht />
                <span>{tr(lang, 'Обов’язкове збереження: заборонити схвалення наступного оновлення, доки поточний випуск не в Telegram', 'Verplichte reservekopie: goedkeuring van een volgende update blokkeren totdat de huidige release in Telegram staat')}</span>
              </label>

              <div className='ut-pakket-knoppen'>
                <button type='button' className='ut-knop ut-knop-primair' disabled={Boolean(bezig)} onClick={() => void opslaan(false)} data-ut-tg-opslaan>
                  {bezig === 'opslaan' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Save aria-hidden='true' />}
                  {tr(lang, 'Зберегти налаштування', 'Instellingen opslaan')}
                </button>
                <button type='button' className='ut-knop' disabled={Boolean(bezig)} onClick={() => void opslaan(true)} data-ut-tg-genereer>
                  {bezig === 'genereer' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <KeyRound aria-hidden='true' />}
                  {tr(lang, 'Зберегти й згенерувати 256-бітний ключ', 'Opslaan en 256-bits sleutel genereren')}
                </button>
                <button type='button' className='ut-knop' disabled={Boolean(bezig) || !stand.botAanwezig || !chatId.trim()} onClick={() => void testen()} data-ut-tg-test>
                  {bezig === 'test' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Send aria-hidden='true' />}
                  {tr(lang, 'Перевірити зв’язок', 'Verbinding testen')}
                </button>
              </div>

              {stand.laatstGetestOp && (
                <p className='ut-hint'>
                  {stand.laatsteTestOk
                    ? tr(lang, `Остання перевірка: успішна (${datum(lang, stand.laatstGetestOp)}).`, `Laatste test: geslaagd (${datum(lang, stand.laatstGetestOp)}).`)
                    : tr(lang, `Остання перевірка: помилка ${stand.laatsteTestFout} (${datum(lang, stand.laatstGetestOp)}).`, `Laatste test: mislukt (${stand.laatsteTestFout}, ${datum(lang, stand.laatstGetestOp)}).`)}
                </p>
              )}
            </div>
          </div>

          <div className='ut-gh-blok' data-ut-tg-sleutel-uitleg='1'>
            <h3><ShieldCheck aria-hidden='true' /> {tr(lang, 'Як і де зберігаються ключі', 'Hoe en waar sleutels worden bewaard')}</h3>
            <p className='ut-hint'>
              {tr(
                lang,
                'Ключ бота, ключ шифрування архіву й секрет приймача зберігаються лише на сервері в таблиці owner_vault_v1 у зашифрованому вигляді (AES-256-GCM з автентифікованим зв’язуванням AAD). Вони ніколи не зберігаються в браузері й ніколи не записуються у відкритому вигляді в базі даних. Одноразовий ключ приховується автоматично через 30 с, а буфер обміну очищується через 45 с після копіювання.',
                'De botsleutel, archiefsleutel en het webhook-geheim worden uitsluitend op de server bewaard in owner_vault_v1, versleuteld met AES-256-GCM en AAD-binding. Ze worden nooit in de browser opgeslagen en nooit onversleuteld in de database gezet. De eenmalige sleutel wordt na 30 s automatisch verborgen en het klembord wordt 45 s na kopiëren automatisch gewist.',
              )}
            </p>
          </div>

          <div className='ut-gh-blok' data-ut-tg-webhook>
            <div className='ut-pakket-knoppen'>
              <svg
                width='56'
                height='56'
                viewBox='0 0 128 128'
                role='img'
                aria-label={tr(lang, 'Емблема бота архіву випусків: кругла скринька завантаження', 'Embleem van de release-archiefbot: ronde downloadkist')}
              >
                <circle cx='64' cy='64' r='60' fill='#1e3a8a' stroke='#60a5fa' strokeWidth='4' />
                <circle cx='64' cy='64' r='50' fill='#172554' />
                <rect x='34' y='54' width='60' height='40' rx='8' fill='#1d4ed8' stroke='#93c5fd' strokeWidth='3.5' />
                <path d='M34 62h60' stroke='#93c5fd' strokeWidth='3' />
                <path d='M64 30v36M51 54l13 13 13-13' fill='none' stroke='#f8fafc' strokeWidth='6' strokeLinecap='round' strokeLinejoin='round' />
                <rect x='52' y='75' width='24' height='6' rx='3' fill='#bfdbfe' />
              </svg>
              <div>
                <h3>{tr(lang, 'Вхідний приймач команд читання (/status, /laatste, /help) та емблема бота', 'Webhook voor leesopdrachten (/status, /laatste, /help) en bot-embleem')}</h3>
                <p className='ut-hint'>
                  {tr(
                    lang,
                    'Бот надсилає повний перебіг подій випусків і відповідає виключно на команди й кнопки читання (/status, /laatste, /help) лише в погодженій групі та темі. Схвалення чи встановлення через Telegram неможливе.',
                    'De bot meldt alle stappen van de uitgavecyclus en reageert uitsluitend op leesopdrachten en statusknoppen (/status, /laatste, /help) in de ingestelde groep en het topic. Goedkeuren of installeren via Telegram is onmogelijk.',
                  )}
                </p>
              </div>
            </div>

            {stand.webhookUrl && (
              <div className='ut-pakket-knoppen'>
                <code className='ut-mono' data-ut-tg-webhook-url>{stand.webhookUrl}</code>
                <button
                  type='button'
                  className='ut-knop'
                  onClick={() => void kopieerTekst(stand.webhookUrl || '', 'Адресу приймача скопійовано.', 'Webhook-adres gekopieerd.')}
                >
                  <Copy size={14} aria-hidden='true' /> {tr(lang, 'Копіювати URL', 'URL kopiëren')}
                </button>
              </div>
            )}

            <div className='ut-pakket-knoppen'>
              <button
                type='button'
                className='ut-knop ut-knop-primair'
                disabled={Boolean(bezig) || !stand.botAanwezig}
                onClick={() => void webhookInstellen(false)}
                data-ut-tg-webhook-btn
              >
                {bezig === 'webhook' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Send aria-hidden='true' />}
                {stand.webhookGeheimAanwezig
                  ? tr(lang, 'Підключити / перевірити приймач бота', 'Bot-webhook activeren / vernieuwen')
                  : tr(lang, 'Підключити приймач бота', 'Bot-webhook activeren')}
              </button>
              {stand.webhookGeheimAanwezig && (
                <button
                  type='button'
                  className='ut-knop'
                  disabled={Boolean(bezig) || !stand.botAanwezig}
                  onClick={() => void webhookInstellen(true)}
                  data-ut-tg-webhook-vernieuw
                >
                  <KeyRound size={15} aria-hidden='true' /> {tr(lang, 'Оновити секрет приймача', 'Webhook-geheim vernieuwen')}
                </button>
              )}
              <button
                type='button'
                className='ut-knop'
                onClick={downloadEmbleem}
                data-ut-tg-embleem-download
              >
                <Download size={15} aria-hidden='true' /> {tr(lang, 'Завантажити .svg-емблему для @BotFather', '.svg-embleem voor @BotFather downloaden')}
              </button>
            </div>
          </div>

          {eenmaligSleutel && (
            <div className='ut-gh-blok' role='status' data-ut-tg-eenmalige-sleutel data-ai-verborgen='1'>
              <strong>{tr(lang, 'Збережіть цей 256-бітний ключ шифрування поза сервером!', 'Bewaar deze 256-bits versleutelingssleutel buiten de server!')}</strong>
              <p className='ut-hint'>
                {tr(
                  lang,
                  `Він показаний лише один раз після генерації (також збережений зашифровано в owner_vault_v1 під назвою UITROL_ARCHIEF_SLEUTEL). Автоприховування через ${sleutelRestSec} с.`,
                  `Deze wordt eenmalig na generatie getoond (ook versleuteld opgeslagen in owner_vault_v1 als UITROL_ARCHIEF_SLEUTEL). Automatisch verbergen over ${sleutelRestSec} s.`,
                )}
              </p>
              <div className='ut-pakket-knoppen'>
                <code className='ut-mono' data-ai-verborgen='1'>{eenmaligSleutel}</code>
                <button type='button' className='ut-knop' onClick={() => void kopieerSleutel()}>
                  <Copy size={14} aria-hidden='true' /> {tr(lang, 'Копіювати ключ', 'Sleutel kopiëren')}
                </button>
                <button type='button' className='ut-knop' onClick={() => void verbergEnWisNu()} data-ut-tg-sleutel-wis>
                  <EyeOff size={14} aria-hidden='true' /> {tr(lang, 'Сховати й очистити буфер зараз', 'Nu verbergen en klembord wissen')}
                </button>
              </div>
            </div>
          )}

          {gearchiveerdeRuns.length > 0 && (
            <div className='ut-gh-blok'>
              <h3><Archive aria-hidden='true' /> {tr(lang, 'Заархівувати встановлений випуск вручну', 'Geïnstalleerde release handmatig archiveren')}</h3>
              <div className='ut-pakket-knoppen'>
                <select value={gekozenRun} onChange={(e) => setGekozenRun(e.target.value)} data-hulp-vrij='keuze'>
                  {gearchiveerdeRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.versie || r.release || r.id} · {datum(lang, r.gestart)}
                    </option>
                  ))}
                </select>
                <button
                  type='button'
                  className='ut-knop ut-knop-primair'
                  disabled={Boolean(bezig) || !stand.klaar || !gekozenRun}
                  onClick={() => void nuArchiveren(gekozenRun)}
                  data-ut-tg-archiveren
                >
                  {bezig === 'archief' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Send aria-hidden='true' />}
                  {tr(lang, 'Зашифрувати й надіслати в Telegram', 'Versleutelen en naar Telegram sturen')}
                </button>
              </div>
            </div>
          )}

          {melding && (
            <p className={melding.soort === 'ok' ? 'ut-ok-tekst' : 'ut-fout'} role={melding.soort === 'ok' ? 'status' : 'alert'}>
              {melding.soort === 'ok' ? <CheckCircle2 aria-hidden='true' /> : <TriangleAlert aria-hidden='true' />} {melding.tekst}
            </p>
          )}

          <details className='ut-gh-log' open={stand.archieven.length > 0}>
            <summary>{tr(lang, 'Історія архівів у Telegram і відновлення', 'Geschiedenis van Telegram-archieven en herstel')} <b>{stand.archieven.length}</b></summary>
            {stand.archieven.length === 0 ? (
              <p className='ut-leeg'>{tr(lang, 'Ще не збережено жодного зашифрованого архіву в Telegram.', 'Nog geen versleutelde archieven in Telegram bewaard.')}</p>
            ) : (
              <ol>
                {stand.archieven.map((item) => (
                  <li key={item.id} data-uitkomst={item.status === 'voltooid' ? 'ok' : 'fout'}>
                    <time>{datum(lang, item.voltooidOp || item.aangemaaktOp)}</time>
                    <b className='ut-mono'>{item.versie}</b>
                    <span>
                      {item.algoritme} · {item.aantalDelen} {tr(lang, 'част.', 'delen')} · {mb(item.origineelBytes)} ·{' '}
                      <code className='ut-mono'>{item.origineelSha256.slice(0, 12)}…</code>
                      {item.foutCode ? ` · ${foutTekst(lang, item.foutCode)}` : ''}
                    </span>
                    {item.status === 'voltooid' ? (
                      <button
                        type='button'
                        className='ut-knop'
                        disabled={Boolean(bezig)}
                        onClick={() => void herstellen(item)}
                        data-ut-tg-herstel={item.versie}
                      >
                        {bezig === `herstel-${item.id}` ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Download aria-hidden='true' />}
                        {tr(lang, 'Відновити й перевірити (.tar.gz)', 'Herstellen en controleren (.tar.gz)')}
                      </button>
                    ) : (
                      <small>{item.status}</small>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </>
      )}
    </section>
  );
}

function gekozenRunsFirst(huidige: string, stand: TelegramStand | null, runs: Run[]): string {
  if (huidige) return huidige;
  if (stand?.blokkade?.geblokkeerd && runs.some((r) => r.id === (stand.blokkade as { huidigeRunId?: string }).huidigeRunId)) {
    return (stand.blokkade as { huidigeRunId: string }).huidigeRunId;
  }
  return runs[0]?.id || '';
}
