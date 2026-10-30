// Contextpaneel van de open brief (pakket 2 «Adaptive Mail Canvas», 24.10.2026). Макет: «Контекст (колонка; на телефоні аркуш із
// вкладками): Хронологія · Вкладення · Зв'язки · Завдання; відправник: перевірка + вибір кольору контакту з палітри Пошти;
// безпека: TLS, зображення через сервер, трекери».
//
// Vorm komt van het kader (src/mail/LeesVenster.tsx → context.vorm): «kolom» naast de brief in een breed venster (≥ 1100 px), «blad»
// op verzoek in een smaller venster (zijblad; op de telefoon een blad van onderen, met tabbladen), «uit». Escape en «Назад» sluiten
// eerst het blad (regelt het kader). Alles hier komt uit de brieven zelf en uit een gewone zoekopdracht in deze mailbox — geen ШІ;
// dat staat er ook bij. De regels (versies, tijdlijn, verwante brieven, controle) zijn puur: src/mail/gesprek-context.ts.
//
// Pakket 3 (24.10.2026): «Порівняти» bij elke groep versies (src/mail/VersieVergelijk.tsx — alleen de tekst, in de browser) en in
// «Завдання й події» de punten van «Що від вас потрібно?» (src/mail/WatNodigBlok.tsx), elk met zijn bron («лист 3 · §2» → «Звідки
// це?») en «До завдань». Die punten zijn het enige hier dat (misschien) van een model komt: ze dragen dan het merk «ШІ».
import {
  CalendarDays, CalendarPlus, Clock3, Download, ExternalLink, Eye, GitCompareArrows, History, Image as BeeldIcoon, ImageOff, Link2, ListChecks,
  ListTodo, Lock, LockOpen, MapPin, Paperclip, Save, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, UserRound, X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { bronLabel } from '../../shared/ai-bronnen';
import AfzenderBadge from '../afzenders/AfzenderBadge';
import AfzenderFoto from '../afzenders/AfzenderFoto';
import { mailColorPairs } from '../mail-kleur-palet';
import { normalizeMailAddress } from '../mail-email';
import { formatMailAttachmentSize, type MailAttachment } from '../MailBijlageVoorbeeld';
import type { MailThreadMessage } from '../MailGesprekInhoud';
import { useLeesVenster } from './LeesVenster';
import { TOON_ALINEA } from './alinea-aanwijzen';
import { useBeeldenAltijd, zetBeeldenAltijd } from './beelden-toestemming';
import {
  adresVan, afzenderControle, beeldenTellen, bijlageVersies, contactKleur, naamVan, onderwerpWoorden, tijdlijn, verwanteBrieven,
  type AfzenderControle, type Kandidaat, type VersieGroep, type VerwantBericht,
} from './gesprek-context';
import { afspraakTijd, useIcsGebeurtenissen, type IcsBron } from './ics-gebeurtenissen';
import VersieVergelijk from './VersieVergelijk';
import { openBron, termijnTekst, voorstelUit, type WatNodigUitkomst } from './WatNodigBlok';
import './context-paneel.css';

export type AfspraakVoorstel = { titel: string; start: number; einde: number; plaats: string; beschrijving: string };
type Props = {
  lang: 'uk' | 'nl';
  thread: MailThreadMessage[];
  /** De brief die nu open is («ви тут»). */
  openId: string;
  /** Account en cache van deze brief (bijlagen lezen). */
  bron: IcsBron;
  /** Adressen van de gekoppelde accounts: «ik» telt niet als afzender of deelnemer. */
  mijnAdressen: string[];
  /** Afzenderregels van de Post (kleur per adres) — dezelfde als in de lijst. */
  regels: Array<{ email: string; color: string }>;
  onKleur: (from: string, kleur: string) => void;
  /** Gewone zoekopdracht in deze mailbox (Gmail-zoektaal), voor «Зв'язки». */
  zoekBrieven: (query: string, max: number) => Promise<Kandidaat[]>;
  onOpenBericht: (id: string, threadId: string) => void;
  /** Een brief van dit gesprek tonen (uitklappen en ernaartoe schuiven). */
  onToonInGesprek: (id: string) => void;
  onOpenBijlage: (berichtId: string, bijlage: MailAttachment) => void;
  onDownloadBijlage: (berichtId: string, bijlage: MailAttachment) => void;
  onBewaarAlles: () => void;
  /** «В Агенду» (met de gegevens uit de .ics) of «Створити подію» (null): het afspraakvenster van de brief. */
  onAfspraak: (voorstel: AfspraakVoorstel | null) => void;
  onTaak: () => void;
  /** «Що від вас потрібно?» van dit gesprek (alleen de punten die letterlijk in de brieven staan), of null. */
  watNodig?: WatNodigUitkomst | null;
  /** «До завдань» met een voorstel (titel, termijn, bron) uit een punt. */
  onTaakVoorstel?: (voorstel: AfspraakVoorstel) => void;
};

type Tab = 'tijdlijn' | 'bijlagen' | 'verwant' | 'taken' | 'afzender';
const TABS: Array<{ id: Tab; uk: string; nl: string }> = [
  { id: 'tijdlijn', uk: 'Хронологія', nl: 'Tijdlijn' },
  { id: 'bijlagen', uk: 'Вкладення', nl: 'Bijlagen' },
  { id: 'verwant', uk: "Зв'язки", nl: 'Verbanden' },
  { id: 'taken', uk: 'Завдання', nl: 'Taken' },
  { id: 'afzender', uk: 'Відправник', nl: 'Afzender' },
];
/** Namen van de kleuren van het palet van de Post (schermlezers en tooltip). */
const KLEUR_NAAM: Record<string, [string, string]> = {
  '#fb4c2f': ['червоний', 'rood'], '#ffad46': ['помаранчевий', 'oranje'], '#fad165': ['жовтий', 'geel'], '#16a766': ['зелений', 'groen'],
  '#43d692': ['світло-зелений', 'lichtgroen'], '#4a86e8': ['синій', 'blauw'], '#a479e2': ['фіолетовий', 'paars'], '#f691b3': ['рожевий', 'roze'],
  '#999999': ['сірий', 'grijs'], '#666666': ['темно-сірий', 'donkergrijs'], '#efefef': ['світло-сірий', 'lichtgrijs'], '#ffffff': ['білий', 'wit'],
};
/** 1 версія, 2–4 версії, 5+ версій (en 11–14 versій). */
const ukMeervoud = (n: number, [een, paar, veel]: [string, string, string]) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? een : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? paar : veel;
};

export default function ContextPaneel(p: Props) {
  const lv = useLeesVenster();
  const vorm = lv?.context.vorm || 'uit';
  if (!lv || vorm === 'uit' || !p.thread.length) return null;
  return <Paneel {...p} vorm={vorm} sluit={lv.context.sluit} />;
}

function Paneel(p: Props & { vorm: 'kolom' | 'blad'; sluit: () => void }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const taal = p.lang === 'uk' ? 'uk-UA' : 'nl-BE';
  const id = useId(), ref = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<Tab>('tijdlijn');
  const blad = p.vorm === 'blad';
  // het blad krijgt de focus bij het openen (de kolom niet: die staat er gewoon naast; F6 brengt je erheen)
  useEffect(() => { if (blad) ref.current?.focus({ preventScroll: true }); }, [blad]);
  // «Показати абзац у листі» («Звідки це?», ook vanuit dit paneel): het blad gaat dicht, anders ligt het over die alinea. Ligt de stap
  // van «Звідки це?» nog bovenaan (telefoon), dan eerst die «Назад» afwachten — twee keer history.back() kort na elkaar is onbetrouwbaar.
  const sluitRef = useRef(p.sluit);
  sluitRef.current = p.sluit;
  useEffect(() => {
    if (!blad) return;
    let wacht: (() => void) | null = null;
    const bronStap = () => { try { return Boolean((history.state as Record<string, unknown> | null)?.mrBronBlad); } catch { return false; } };
    const opToon = () => {
      if (wacht) return;
      if (!bronStap()) { sluitRef.current(); return; }
      wacht = () => { wacht = null; sluitRef.current(); };
      window.addEventListener('popstate', wacht, { once: true });
    };
    window.addEventListener(TOON_ALINEA, opToon);
    return () => { window.removeEventListener(TOON_ALINEA, opToon); if (wacht) window.removeEventListener('popstate', wacht); };
  }, [blad]);
  const [vergelijkGroep, setVergelijkGroep] = useState<VersieGroep | null>(null);
  useEffect(() => { setVergelijkGroep(null); }, [p.openId]);

  const ik = useMemo(() => new Set(p.mijnAdressen.map((a) => normalizeMailAddress(a)).filter(Boolean)), [p.mijnAdressen]);
  const open = p.thread.find((b) => b.id === p.openId) || p.thread[p.thread.length - 1];
  // «Відправник»: de laatste brief van iemand anders dan ik (mijn eigen antwoord kleuren heeft geen zin)
  const afzenderBrief = useMemo(() => [...p.thread].reverse().find((b) => !ik.has(adresVan(b.from))) || open, [p.thread, ik, open]);
  const { groepen, los } = useMemo(() => bijlageVersies(p.thread), [p.thread]);
  const totaalBijlagen = useMemo(() => p.thread.reduce((n, b) => n + (b.attachments?.length || 0), 0), [p.thread]);
  const ics = useIcsGebeurtenissen(p.bron, p.thread, true);
  const verwant = useVerwant(p.thread, p.mijnAdressen, p.zoekBrieven, p.bron.accountId);
  const items = useMemo(() => tijdlijn({
    thread: p.thread, openId: open?.id || '', verwant: verwant.items, groepen, nu: Date.now(),
    gebeurtenissen: ics.items.map((g) => ({ titel: g.titel, start: g.start, einde: g.einde, plaats: g.plaats, berichtId: g.berichtId, providerAttachmentId: g.providerAttachmentId })),
  }), [p.thread, open?.id, verwant.items, groepen, ics.items]);

  const wanneer = (ms: number) => {
    if (!(ms > 0)) return '';
    const d = new Date(ms), ditJaar = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleString(taal, { day: 'numeric', month: 'short', ...(ditJaar ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' });
  };
  const naam = (from: string) => naamVan(from) || adresVan(from) || t('Невідомий відправник', 'Onbekende afzender');
  const bijlageVan = (berichtId: string, attId: string) => p.thread.find((b) => b.id === berichtId)?.attachments.find((a) => a.providerAttachmentId === attId) || null;

  // ------------------------------------------------------------ secties
  const tijdlijnSectie = (
    <section className='ctx-sectie' aria-labelledby={`${id}-tl`} key='tijdlijn'>
      <h3 id={`${id}-tl`}><History aria-hidden='true' />{t('Хронологія', 'Tijdlijn')}</h3>
      <ol className='ctx-tijdlijn'>
        {items.map((it) => {
          const kleur = it.soort === 'bericht' ? contactKleur(p.regels, it.van) : '';
          const reden = it.soort === 'verwant' ? verwant.items.find((v) => v.id === it.id)?.reden : undefined;
          const stijl = kleur ? ({ '--ctx-kleur': kleur } as CSSProperties) : undefined;
          return (
            <li key={`${it.soort}:${it.id}`} data-soort={it.soort} data-hier={it.hier ? 'ja' : undefined} data-toekomst={it.toekomst ? 'ja' : undefined} style={stijl}>
              <span className='ctx-tl-punt' aria-hidden='true' />
              {it.soort === 'gebeurtenis' ? (
                <div className='ctx-tl-tekst'>
                  <strong><CalendarDays aria-hidden='true' />{it.titel}</strong>
                  <small>{wanneer(it.wanneer)}{it.toekomst ? <b className='ctx-merk' data-merk='toekomst'>{t('майбутня подія', 'komende afspraak')}</b> : null}</small>
                </div>
              ) : (
                <button type='button' className='ctx-tl-tekst' onClick={() => (it.soort === 'bericht' ? p.onToonInGesprek(it.id) : p.onOpenBericht(it.id, it.threadId || ''))}>
                  <strong>{it.soort === 'bericht' ? naam(it.van) : it.titel}</strong>
                  <small>
                    {wanneer(it.wanneer)}
                    {it.hier ? <b className='ctx-merk' data-merk='hier'>{t('ви тут', 'u bent hier')}</b> : null}
                    {reden ? <b className='ctx-merk' data-merk='verwant'>{reden === 'afzender' ? t('той самий відправник', 'zelfde afzender') : t('схожа тема', 'zelfde onderwerp')}</b> : null}
                  </small>
                  {it.soort === 'bericht' ? <span className='ctx-tl-uittreksel'>{it.titel}</span> : <span className='ctx-tl-uittreksel'>{naam(it.van)}</span>}
                  {it.versies.length > 0 && <span className='ctx-chips' aria-label={t('Версії вкладень у цьому листі', 'Versies van bijlagen in dit bericht')}>{it.versies.map((v) => <em key={v}>v{v}</em>)}</span>}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {verwant.items.length > 0 && <p className='ctx-noot'>{t('Пунктиром — інші листи з тими самими людьми або темою.', 'Gestippeld — andere berichten met dezelfde mensen of hetzelfde onderwerp.')}</p>}
    </section>
  );

  const bijlageRij = (berichtId: string, a: MailAttachment, extra: ReactNode, van: string, ms: number) => (
    <li key={`${berichtId}:${a.providerAttachmentId}`}>
      <span className='ctx-bestand'>
        {extra}
        <strong title={a.filename}>{a.filename}</strong>
        <small>{wanneer(ms)} · {naam(van)} · {formatMailAttachmentSize(a.sizeBytes)}</small>
      </span>
      <span className='ctx-acties'>
        <button type='button' aria-label={`${t('Відкрити', 'Openen')}: ${a.filename}`} title={t('Відкрити', 'Openen')} onClick={() => p.onOpenBijlage(berichtId, a)}><ExternalLink aria-hidden='true' /></button>
        <button type='button' aria-label={`${t('Завантажити', 'Downloaden')}: ${a.filename}`} title={t('Завантажити', 'Downloaden')} onClick={() => p.onDownloadBijlage(berichtId, a)}><Download aria-hidden='true' /></button>
      </span>
    </li>
  );
  const bijlagenSectie = (
    <section className='ctx-sectie' aria-labelledby={`${id}-bl`} key='bijlagen'>
      <h3 id={`${id}-bl`}><Paperclip aria-hidden='true' />{t('Вкладення', 'Bijlagen')}{totaalBijlagen > 0 && <small>{totaalBijlagen}</small>}</h3>
      {groepen.map((g) => (
        <div className='ctx-versies' key={g.sleutel}>
          <div className='ctx-versies-kop'>
            <h4>{g.titel}<small>{p.lang === 'uk' ? `${g.totaal} ${ukMeervoud(g.totaal, ['версія', 'версії', 'версій'])}` : `${g.totaal} versies`}</small></h4>
            <button type='button' className='ctx-knop ctx-vergelijk' data-versies-vergelijken={g.sleutel} onClick={() => setVergelijkGroep(g)}
              aria-label={t(`Порівняти версії: ${g.titel}`, `Versies vergelijken: ${g.titel}`)} title={t('Порівняти текст двох версій', 'De tekst van twee versies vergelijken')}>
              <GitCompareArrows aria-hidden='true' />{t('Порівняти', 'Vergelijken')}
            </button>
          </div>
          <ul className='ctx-lijst'>
            {g.items.map((it) => bijlageRij(it.berichtId, it.bijlage as MailAttachment,
              <b className='ctx-versie' data-laatste={it.laatste ? 'ja' : undefined}>v{it.nummer}{it.laatste ? ` · ${t('остання', 'laatste')}` : ''}</b>, it.van, it.wanneer))}
          </ul>
        </div>
      ))}
      {los.length > 0 && (
        <>
          {groepen.length > 0 && <h4 className='ctx-tussenkop'>{t('Інші файли', 'Andere bestanden')}</h4>}
          <ul className='ctx-lijst'>{los.map((x) => bijlageRij(x.berichtId, x.bijlage as MailAttachment, null, x.van, x.wanneer))}</ul>
        </>
      )}
      {totaalBijlagen > 0
        ? <button type='button' className='ctx-knop' onClick={p.onBewaarAlles}><Save aria-hidden='true' />{t('Зберегти всі', 'Alles opslaan')}</button>
        : <p className='ctx-leeg'>{t('У цій гілці вкладень немає.', 'Geen bijlagen in dit gesprek.')}</p>}
    </section>
  );

  const verwantSectie = (
    <section className='ctx-sectie' aria-labelledby={`${id}-vw`} key='verwant'>
      <h3 id={`${id}-vw`}><Link2 aria-hidden='true' />{t("Зв'язки", 'Verbanden')}<small className='ctx-zonder-ai'>{t('без ШІ', 'zonder AI')}</small></h3>
      {verwant.laden ? <p className='ctx-leeg' role='status'>{t('Шукаємо в цій скриньці…', 'Zoeken in deze mailbox…')}</p>
        : verwant.items.length ? (
          <ul className='ctx-lijst ctx-verwant'>
            {verwant.items.map((v) => (
              <li key={v.id}>
                <button type='button' className='ctx-bestand' onClick={() => p.onOpenBericht(v.id, v.threadId)}>
                  <strong>{v.subject || t('Без теми', 'Geen onderwerp')}</strong>
                  <small>{naam(v.from)} · {wanneer(v.receivedAt)}</small>
                  <b className='ctx-merk' data-merk='verwant'>{v.reden === 'afzender' ? t('той самий відправник', 'zelfde afzender') : t('схожа тема', 'zelfde onderwerp')}</b>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className='ctx-leeg'>{verwant.fout ? t('Пошук зараз не вдався.', 'Zoeken lukte nu niet.') : t('Інших листів від цих людей або з такою темою не знайдено.', 'Geen andere berichten van deze mensen of met dit onderwerp gevonden.')}</p>}
      <p className='ctx-noot'>{t('Знайдено звичайним пошуком у цій скриньці — за адресою відправника та словами теми.', 'Gevonden met een gewone zoekopdracht in deze mailbox — op het adres van de afzender en woorden uit het onderwerp.')}</p>
    </section>
  );

  // «Що від вас потрібно?»: dezelfde punten als boven de brief (alleen wat letterlijk in de brieven staat), met bron en termijn
  const wn = p.watNodig && p.watNodig.punten.length ? p.watNodig : null;
  const laatsteBrief = p.thread[p.thread.length - 1];
  const gesprekId = laatsteBrief?.threadId || laatsteBrief?.id || '';
  const wnRef = laatsteBrief?.receivedAt || Date.now();
  const aiPunten = wn && (
    <div className='ctx-ai' data-ctx-ai data-opbouw={wn.opbouw}>
      <h4>
        <span className='ai-blok-merk' data-opbouw={wn.opbouw}>{wn.opbouw === 'model' ? <><Sparkles aria-hidden='true' />{t('ШІ', 'AI')}</> : <><ListChecks aria-hidden='true' />{t('Авто', 'Auto')}</>}</span>
        {t('Що від вас потрібно?', 'Wat wordt er van u verwacht?')}
      </h4>
      <ul className='ctx-lijst ctx-ai-punten'>
        {wn.punten.map((x) => (
          <li key={x.id} data-ai-punt={x.id} data-soort={x.soort}>
            <span className='ctx-bestand'>
              <strong>{x.tekst}</strong>
              <small>
                {x.bron && (
                  <button type='button' className='ai-bron-chip' data-bron-chip onClick={() => openBron(gesprekId, x.id)} title={t('Звідки це?', 'Waar komt dit vandaan?')}
                    aria-label={t(`Звідки це? Джерело: ${bronLabel('uk', x.bron)}`, `Waar komt dit vandaan? Bron: ${bronLabel('nl', x.bron)}`)}>{bronLabel(p.lang, x.bron)}</button>
                )}
                {x.termijn ? <span className='ai-termijn-chip' title={x.termijn}><Clock3 aria-hidden='true' />{termijnTekst(p.lang, x.termijn, wnRef)}</span> : null}
              </small>
            </span>
            {p.onTaakVoorstel && (
              <span className='ctx-acties'>
                <button type='button' data-ai-taak aria-label={`${t('До завдань', 'Naar taken')}: ${x.tekst}`} title={t('До завдань', 'Naar taken')}
                  onClick={() => p.onTaakVoorstel?.(voorstelUit({ subject: laatsteBrief?.subject || '', punten: [x], kort: [], ref: wnRef, lang: p.lang, voor: 'taak' }))}>
                  <ListTodo aria-hidden='true' />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className='ctx-noot'>{wn.opbouw === 'model'
        ? t(`Склав ваш ШІ-агент «${wn.agentNaam}» — не частина листа; кожен пункт знайдено дослівно в листі.`, `Opgesteld door uw AI-agent «${wn.agentNaam}» — geen deel van het bericht; elk punt staat letterlijk in het bericht.`)
        : t('Простий розбір у браузері, без моделі: це речення з листів.', 'Eenvoudige ontleding in de browser, zonder model: dit zijn zinnen uit de berichten.')}</p>
    </div>
  );
  const takenSectie = (
    <section className='ctx-sectie' aria-labelledby={`${id}-tk`} key='taken'>
      <h3 id={`${id}-tk`}><CalendarDays aria-hidden='true' />{t('Завдання й події', 'Taken en afspraken')}</h3>
      {aiPunten}
      {ics.items.map((g) => {
        const bijlage = bijlageVan(g.berichtId, g.providerAttachmentId);
        return (
          <article className='ctx-afspraak' key={`${g.berichtId}:${g.providerAttachmentId}:${g.start}`} data-toekomst={g.start > Date.now() ? 'ja' : undefined}>
            <strong>{g.titel}</strong>
            <small>{afspraakTijd(g, p.lang)}{g.start > Date.now() ? <b className='ctx-merk' data-merk='toekomst'>{t('майбутня', 'komend')}</b> : null}</small>
            {g.plaats && <small><MapPin aria-hidden='true' />{g.plaats}</small>}
            {g.organisator && <small>{t('Організатор', 'Organisator')}: {g.organisator}</small>}
            <small className='ctx-bron'>{t('Джерело', 'Bron')}: {g.filename}</small>
            <span className='ctx-knoppen'>
              <button type='button' className='ctx-knop' onClick={() => p.onAfspraak({ titel: g.titel, start: g.start, einde: g.einde, plaats: g.plaats, beschrijving: g.beschrijving })}><CalendarPlus aria-hidden='true' />{t('В Агенду', 'Naar Agenda')}</button>
              {bijlage && <button type='button' className='ctx-knop' onClick={() => p.onOpenBijlage(g.berichtId, bijlage)}><ExternalLink aria-hidden='true' />{t('Відкрити .ics', '.ics openen')}</button>}
            </span>
          </article>
        );
      })}
      {!ics.items.length && <p className='ctx-leeg' role={ics.laden ? 'status' : undefined}>{ics.laden ? t('Читаємо запрошення…', 'Uitnodiging lezen…') : t('У вкладеннях цієї гілки подій (.ics) немає.', 'Geen afspraken (.ics) in de bijlagen van dit gesprek.')}</p>}
      <span className='ctx-knoppen'>
        <button type='button' className='ctx-knop' onClick={p.onTaak}><ListTodo aria-hidden='true' />{t('До завдань', 'Aan taken')}</button>
        <button type='button' className='ctx-knop' onClick={() => p.onAfspraak(null)}><CalendarPlus aria-hidden='true' />{t('Створити подію', 'Afspraak maken')}</button>
      </span>
    </section>
  );

  const controle: AfzenderControle = afzenderControle(afzenderBrief?.details);
  const controleTekst: Record<AfzenderControle, [string, string]> = {
    ok: ['Провайдер підтвердив, що лист надіслано з домену відправника (SPF, DKIM, DMARC).', 'De provider bevestigde dat het bericht van het domein van de afzender komt (SPF, DKIM, DMARC).'],
    deels: ['Відправника підтверджено частково — частина перевірок не пройдена або не повідомлена.', 'De afzender is gedeeltelijk bevestigd — een deel van de controles faalde of werd niet gemeld.'],
    mislukt: ['Перевірку відправника не пройдено — будьте обережні з посиланнями й вкладеннями.', 'De controle van de afzender is mislukt — wees voorzichtig met links en bijlagen.'],
    onbekend: ['Провайдер не повідомив результат перевірки — це нічого не доводить.', 'De provider meldde geen uitslag van de controle — dat bewijst niets.'],
  };
  const ControleIcoon = controle === 'ok' ? ShieldCheck : controle === 'mislukt' ? ShieldAlert : ShieldQuestion;
  const auth = afzenderBrief?.details?.authentication;
  const huidigeKleur = afzenderBrief ? contactKleur(p.regels, afzenderBrief.from) : '';
  const afzAdres = afzenderBrief ? adresVan(afzenderBrief.from) : '';
  const kleurKiezen = (kleur: string) => { if (afzenderBrief && kleur.toLowerCase() !== huidigeKleur.toLowerCase()) p.onKleur(afzenderBrief.from, kleur); };
  const afzenderSectie = afzenderBrief && (
    <section className='ctx-sectie' aria-labelledby={`${id}-af`} key='afzender'>
      <h3 id={`${id}-af`}><UserRound aria-hidden='true' />{t('Відправник', 'Afzender')}</h3>
      <div className='ctx-afzender' style={huidigeKleur ? ({ '--ctx-kleur': huidigeKleur } as CSSProperties) : undefined}>
        <span className='ctx-foto'><AfzenderFoto adres={afzAdres} naam={naamVan(afzenderBrief.from)} maat={44} /></span>
        <span className='ctx-afzender-tekst'>
          <strong>{naam(afzenderBrief.from)}</strong>
          <small>{afzAdres}</small>
        </span>
        <AfzenderBadge lang={p.lang} from={afzenderBrief.from} messageId={afzenderBrief.id} accountId={p.bron.accountId} plek='lezer' />
      </div>
      <p className='ctx-controle' data-controle={controle}>
        <ControleIcoon aria-hidden='true' />
        <span>{controleTekst[controle][p.lang === 'uk' ? 0 : 1]}{auth ? <small> SPF {auth.spf || '—'} · DKIM {auth.dkim || '—'} · DMARC {auth.dmarc || '—'}</small> : null}</span>
      </p>
      <fieldset className='ctx-kleuren'>
        <legend>{t('Колір контакту', 'Kleur van het contact')}</legend>
        <label className='ctx-kleur' data-geen title={t('Без кольору', 'Geen kleur')}>
          <input type='radio' name={`${id}-kleur`} checked={!huidigeKleur} onChange={() => kleurKiezen('')} />
          <span aria-hidden='true'>×</span>
          <span className='ctx-sr'>{t('Без кольору', 'Geen kleur')}</span>
        </label>
        {mailColorPairs.map(([kleur]) => {
          const nm = KLEUR_NAAM[kleur]?.[p.lang === 'uk' ? 0 : 1] || kleur;
          return (
            <label className='ctx-kleur' key={kleur} title={nm} style={{ '--ctx-staal': kleur } as CSSProperties}>
              <input type='radio' name={`${id}-kleur`} checked={huidigeKleur.toLowerCase() === kleur} onChange={() => kleurKiezen(kleur)} />
              <span aria-hidden='true' />
              <span className='ctx-sr'>{nm}</span>
            </label>
          );
        })}
      </fieldset>
      <p className='ctx-noot'>{t('Колір видно в списку листів і в цій гілці: смуга й кільце біля аватара.', 'De kleur staat in de berichtenlijst en in dit gesprek: streep en ring rond de avatar.')}</p>
    </section>
  );

  const beelden = useMemo(() => p.thread.reduce((s, b) => {
    const r = beeldenTellen(b.renderBody?.kind === 'html' ? b.renderBody.html : '');
    return { extern: s.extern + r.extern, pixels: s.pixels + r.pixels, onveilig: s.onveilig + r.onveilig };
  }, { extern: 0, pixels: 0, onveilig: 0 }), [p.thread]);
  const tls = afzenderBrief?.details?.transport?.status === 'encrypted_observed';
  // externe beelden: «Вигляд → Зовнішні зображення» (standaard «Питати») of «altijd» voor deze afzender (op dit apparaat)
  const beeldenInstelling = useLeesVenster()?.weergave.beelden || 'altijd', afzenderAltijd = useBeeldenAltijd(afzenderBrief?.from || '');
  const beeldenGetoond = beeldenInstelling === 'altijd' || afzenderAltijd;
  const veiligSectie = (
    <section className='ctx-sectie' aria-labelledby={`${id}-vl`} key='veilig'>
      <h3 id={`${id}-vl`}><ShieldCheck aria-hidden='true' />{t('Безпека', 'Veiligheid')}</h3>
      <ul className='ctx-veilig'>
        <li data-ok={tls ? 'ja' : undefined}>{tls ? <Lock aria-hidden='true' /> : <LockOpen aria-hidden='true' />}
          <span>{tls ? t('Шифрування в дорозі (TLS) видно в заголовках Received.', 'Versleuteling onderweg (TLS) is te zien in de Received-headers.') : t('Провайдер не показав дані про транспорт — це не доказ, що TLS не було.', 'De provider toonde geen transportgegevens — dat bewijst niet dat TLS ontbrak.')}</span></li>
        <li data-ok={beelden.extern && !beeldenGetoond ? 'ja' : undefined}><BeeldIcoon aria-hidden='true' />
          <span>{!beelden.extern ? t('Зовнішніх зображень немає.', 'Geen externe afbeeldingen.')
            : beeldenGetoond
              ? t(`Зовнішні зображення: ${beelden.extern}. Їх завантажує ваш сервер, а не браузер: відправник бачить адресу сервера, а не вашу; сервер їх не зберігає.`, `Externe afbeeldingen: ${beelden.extern}. Uw server haalt ze op, niet de browser: de afzender ziet het adres van de server, niet het uwe; de server bewaart ze niet.`)
              : t(`Зовнішні зображення: ${beelden.extern} — приховано, доки ви їх не покажете (смуга над листом). Показані завантажує ваш сервер, а не браузер.`, `Externe afbeeldingen: ${beelden.extern} — verborgen tot u ze toont (strook boven het bericht). Getoond haalt uw server ze op, niet de browser.`)}
            {beelden.extern > 0 && afzenderBrief && beeldenInstelling !== 'altijd' && (
              <button type='button' className='ctx-knop ctx-knop-klein' onClick={() => zetBeeldenAltijd(afzenderBrief.from, !afzenderAltijd)}>
                {afzenderAltijd ? t('Більше не показувати автоматично', 'Niet meer automatisch tonen') : t('Завжди від цього відправника', 'Altijd van deze afzender')}
              </button>
            )}</span></li>
        {beelden.pixels > 0 && <li data-let={beeldenGetoond ? 'ja' : undefined} data-ok={beeldenGetoond ? undefined : 'ja'}><Eye aria-hidden='true' /><span>{beeldenGetoond
          ? t(`Схожі на пікселі стеження: ${beelden.pixels} (1×1 або приховані). Відправник може дізнатися, що лист відкрито.`, `Lijken op volgpixels: ${beelden.pixels} (1×1 of verborgen). De afzender kan te weten komen dat het bericht geopend is.`)
          : t(`Схожі на пікселі стеження: ${beelden.pixels} (1×1 або приховані). Не завантажено — відправник не дізнається, що лист відкрито.`, `Lijken op volgpixels: ${beelden.pixels} (1×1 of verborgen). Niet geladen — de afzender komt niet te weten dat het bericht geopend is.`)}</span></li>}
        {beelden.onveilig > 0 && <li><ImageOff aria-hidden='true' /><span>{t(`Незахищені (http) зображення не завантажено: ${beelden.onveilig}.`, `Onbeveiligde (http-)afbeeldingen niet geladen: ${beelden.onveilig}.`)}</span></li>}
        <li><ExternalLink aria-hidden='true' /><span>{t('Посилання відкриваються в новій вкладці, без адреси цієї сторінки.', 'Links openen in een nieuw tabblad, zonder het adres van deze pagina.')}</span></li>
      </ul>
      <p className='ctx-noot'>{t('Пікселі визначено простою перевіркою розміру й видимості, без списку трекерів.', 'Pixels herkend met een eenvoudige controle op grootte en zichtbaarheid, zonder lijst van trackers.')}</p>
    </section>
  );

  const perTab: Record<Tab, ReactNode> = {
    tijdlijn: tijdlijnSectie, bijlagen: bijlagenSectie, verwant: verwantSectie, taken: takenSectie,
    afzender: <>{afzenderSectie}{veiligSectie}</>,
  };
  const tabToets = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((x) => x.id === tab);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -2;
    if (j === -2) return;
    e.preventDefault();
    const doel = TABS[(j + TABS.length) % TABS.length].id;
    setTab(doel);
    requestAnimationFrame(() => document.getElementById(`${id}-tab-${doel}`)?.focus());
  };

  return (
    <>
      {blad && <div className='ctx-scherm' aria-hidden='true' onMouseDown={p.sluit} />}
      <div
        ref={ref}
        id='mail-context-paneel'
        className='ctx-paneel'
        data-context-paneel
        data-vorm={p.vorm}
        role={blad ? 'dialog' : 'complementary'}
        aria-labelledby={`${id}-kop`}
        tabIndex={-1}
      >
        <header className='ctx-kop'>
          {blad && <span className='ctx-greep' aria-hidden='true' />}
          <h2 id={`${id}-kop`}>{t('Контекст', 'Context')}</h2>
          <small>{wn?.opbouw === 'model' ? t('з даних листів; пункти ШІ позначено «ШІ»', 'uit de berichten zelf; punten van AI dragen «AI»') : t('з даних листів, без ШІ', 'uit de berichten zelf, zonder AI')}</small>
          <button type='button' className='ctx-sluit' aria-label={blad ? t('Закрити контекст', 'Context sluiten') : t('Сховати колонку контексту', 'Contextkolom verbergen')} title={t('Закрити', 'Sluiten')} onClick={p.sluit}><X aria-hidden='true' /></button>
        </header>
        {blad && (
          <div className='ctx-tabs' role='tablist' aria-label={t('Розділи контексту', 'Onderdelen van de context')}>
            {TABS.map((x) => (
              <button
                key={x.id} id={`${id}-tab-${x.id}`} type='button' role='tab' aria-selected={tab === x.id} aria-controls={`${id}-paneel`} tabIndex={tab === x.id ? 0 : -1}
                onClick={() => setTab(x.id)} onKeyDown={tabToets}
              >
                {t(x.uk, x.nl)}
              </button>
            ))}
          </div>
        )}
        <div className='ctx-inhoud' id={`${id}-paneel`} role={blad ? 'tabpanel' : undefined} aria-labelledby={blad ? `${id}-tab-${tab}` : undefined}>
          {blad ? perTab[tab] : <>{tijdlijnSectie}{bijlagenSectie}{verwantSectie}{takenSectie}{afzenderSectie}{veiligSectie}</>}
        </div>
      </div>
      {vergelijkGroep && <VersieVergelijk lang={p.lang} bron={p.bron} groep={vergelijkGroep} onSluit={() => setVergelijkGroep(null)} />}
    </>
  );
}

// ------------------------------------------------------------ «Зв'язки»: zoeken (één keer per gesprek en account)
const VERWANT = new Map<string, Promise<VerwantBericht[]>>();
const veiligAdres = (a: string) => a.replace(/[^a-z0-9._%+\-@]/gi, '');
/** Zoekopdrachten voor verwante brieven: de deelnemers (zonder mij, hoogstens drie) en de onderscheidende woorden van het onderwerp. */
export function verwantVragen(thread: Array<{ from: string; subject: string }>, mijnAdressen: string[]): string[] {
  const ik = new Set(mijnAdressen.map((a) => normalizeMailAddress(a)).filter(Boolean));
  const deelnemers = [...new Set(thread.map((b) => adresVan(b.from)).filter((a) => a && !ik.has(a)).map(veiligAdres).filter((a) => a.includes('@')))].slice(0, 3);
  const woorden = onderwerpWoorden(thread[thread.length - 1]?.subject || thread[0]?.subject || '').slice(0, 3);
  const vragen: string[] = [];
  if (deelnemers.length) vragen.push(deelnemers.map((a) => `from:${a}`).join(' OR '));
  if (woorden.length >= 2 || (woorden[0] || '').length >= 7) vragen.push(`subject:(${woorden.join(' ')})`);
  return vragen;
}
function useVerwant(thread: MailThreadMessage[], mijnAdressen: string[], zoek: Props['zoekBrieven'], accountId: string) {
  const sleutel = `${accountId}\u001f${thread[thread.length - 1]?.threadId || thread[0]?.id || ''}\u001f${thread.length}`;
  const [stand, setStand] = useState<{ sleutel: string; items: VerwantBericht[]; laden: boolean; fout: boolean }>({ sleutel: '', items: [], laden: true, fout: false });
  useEffect(() => {
    let levend = true;
    let taak = VERWANT.get(sleutel);
    if (!taak) {
      const vragen = verwantVragen(thread, mijnAdressen);
      taak = Promise.allSettled(vragen.map((q) => zoek(q, 25))).then((uit) => {
        if (vragen.length && uit.every((r) => r.status === 'rejected')) throw new Error('VERWANT_ZOEKEN_MISLUKT');
        return verwanteBrieven({ thread, kandidaten: uit.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])), mijnAdressen, max: 6 });
      });
      VERWANT.set(sleutel, taak);
      taak.catch(() => VERWANT.delete(sleutel));
    }
    setStand((s) => (s.sleutel === sleutel ? s : { sleutel, items: [], laden: true, fout: false }));
    taak.then((items) => { if (levend) setStand({ sleutel, items, laden: false, fout: false }); }, () => { if (levend) setStand({ sleutel, items: [], laden: false, fout: true }); });
    return () => { levend = false; };
  }, [sleutel]);
  return stand.sleutel === sleutel ? stand : { sleutel, items: [] as VerwantBericht[], laden: true, fout: false };
}
