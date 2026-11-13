// «Що від вас потрібно?» (pakket 3 «Adaptive Mail Canvas», 24.10.2026) — boven de brieven van het gesprek. Макет: «ШІ · не частина
// листа · модель на вашому сервері; пункти з чипом джерела «лист 3 · §3» і терміном; «Коротко» — теж із джерелами; дії: Чернетка
// відповіді · До завдань · В Агенду; підвал: «Кожен пункт знайдено дослівно в оригіналі (3 з 3)» і хто склав: модель або «простий
// розбір» без моделі».
//
// Eerlijk over de herkomst:
//   - meteen, zonder iets te versturen: het EENVOUDIGE ONTLEDEN in de browser (shared/ai-bronnen.ts) — vragen, verzoeken en termijnen
//     als letterlijke zinnen uit de brieven die na uw laatste antwoord kwamen;
//   - «Уточнити з ШІ» (alleen met een privé-agent met mail.read, alleen na een klik): de agent maakt de punten in uw taal; elk punt
//     wordt op de server ÉN hier nog eens tegen het origineel gecontroleerd. Wat niet letterlijk in de brief staat, wordt niet
//     getoond (de voet zegt hoeveel, en u kunt ze apart bekijken, gemarkeerd als «не знайдено»);
//   - «Пункт хибний — прибрати» (in «Звідки це?») onthoudt dit apparaat per gesprek; «Повернути» haalt ze terug.
import { CalendarPlus, ChevronDown, CircleHelp, Clock3, ListChecks, ListTodo, LoaderCircle, PenLine, ShieldAlert, ShieldCheck, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  antwoordNodig, bronLabel, controleerPunten, datumUit, eenvoudigeOntleding, gespreksAlineas, normaliseer, telGevonden,
  type GecontroleerdPunt, type Opbouw,
} from '../../shared/ai-bronnen';
import { aiFoutVan, aiRun, useAiStaat, type AiFout } from './ai-staat';
import { useLeesVenster } from './LeesVenster';
import { adresVan } from '../../shared/mail-afzenders';
import './ai-blok.css';

export type WatNodigBrief = { id: string; from: string; receivedAt: number; tekst: string };
export type AfspraakOfTaak = { titel: string; start: number; einde: number; plaats: string; beschrijving: string };
export type WatNodigUitkomst = {
  punten: GecontroleerdPunt[];
  kort: GecontroleerdPunt[];
  /** Korte antwoorden van het model (in de taal van de brief); leeg zonder model. */
  hints: string[];
  /** Het punt waarom het gesprek op uw antwoord wacht («Потребує відповіді»), of null. */
  antwoordNodig: GecontroleerdPunt | null;
  opbouw: Opbouw;
  agentNaam: string;
};

type Props = {
  lang: 'uk' | 'nl';
  context: Record<string, string>;
  accountId: string;
  threadId: string;
  subject: string;
  /** Het hele gesprek, oudste eerst (brief 1 = de oudste); `tekst` = platte tekst. */
  brieven: WatNodigBrief[];
  mijnAdressen: string[];
  onBron: (p: GecontroleerdPunt, u: WatNodigUitkomst) => void;
  onConcept: (u: WatNodigUitkomst) => void;
  onTaak: (v: AfspraakOfTaak) => void;
  onAgenda: (v: AfspraakOfTaak) => void;
  onUitkomst?: (u: WatNodigUitkomst) => void;
};

const WEG_SLEUTEL = 'mail-ai-weg-v1';
const OPEN_SLEUTEL = 'mail-ai-blok-open-v1';
/** Lager dan dit (px) begint het blok ingeklapt, tenzij u het open zette. */
export const LAAG_VENSTER = 860;
const puntSleutel = (p: GecontroleerdPunt) => normaliseer(p.citaat).slice(0, 160);
function leesWeg(threadId: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(WEG_SLEUTEL) || '{}') as Record<string, string[]>; return Array.isArray(v[threadId]) ? v[threadId] : []; } catch { return []; }
}
function bewaarWeg(threadId: string, lijst: string[]) {
  try {
    const v = JSON.parse(localStorage.getItem(WEG_SLEUTEL) || '{}') as Record<string, string[]>;
    if (lijst.length) v[threadId] = lijst.slice(-40); else delete v[threadId];
    const sleutels = Object.keys(v);
    for (const k of sleutels.slice(0, Math.max(0, sleutels.length - 200))) delete v[k];
    localStorage.setItem(WEG_SLEUTEL, JSON.stringify(v));
  } catch { /* privévenster */ }
}
/** «Пункт хибний — прибрати» vanuit «Звідки це?»: zelfde opslag, het blok luistert mee. */
export const WEG_GEBEURTENIS = 'mail:ai-punt-weg';
export function zetPuntWeg(threadId: string, p: GecontroleerdPunt, weg = true) {
  const k = puntSleutel(p);
  const lijst = leesWeg(threadId).filter((x) => x !== k);
  bewaarWeg(threadId, weg ? [...lijst, k] : lijst);
  window.dispatchEvent(new CustomEvent(WEG_GEBEURTENIS, { detail: { threadId } }));
}
/** «Звідки це?» openen vanuit een ander deel van het leesvenster (het contextpaneel): het gesprek (src/MailGesprekInhoud.tsx) luistert. */
export const BRON_GEBEURTENIS = 'mail:ai-bron';
export function openBron(threadId: string, puntId: string) {
  window.dispatchEvent(new CustomEvent(BRON_GEBEURTENIS, { detail: { threadId, puntId } }));
}

/* SEC-002 (g10c-toets-1): adres uit de LAATSTE hoekhaken (adresVan), niet de eerste «<…>» uit de weergavenaam */
const adres = (v: string) => adresVan(v).adres || (String(v || '').includes('<') ? '' : String(v || '').trim().toLocaleLowerCase());

/** Wat de agent voor een gesprek gaf, voor deze sessie (alleen in het geheugen van de pagina): de brief opnieuw openen toont het
 *  meteen weer, zonder nieuw verzoek. Sleutel = gesprek + laatste brief + aantal brieven; hoogstens 50 gesprekken. */
type ModelUitkomst = { punten: GecontroleerdPunt[]; kort: GecontroleerdPunt[]; hints: string[]; nodig: boolean | null; agentNaam: string };
const MODEL_GEHEUGEN = new Map<string, ModelUitkomst>();
const onthoud = (k: string, m: ModelUitkomst | null) => {
  MODEL_GEHEUGEN.delete(k);
  if (m) { MODEL_GEHEUGEN.set(k, m); while (MODEL_GEHEUGEN.size > 50) MODEL_GEHEUGEN.delete(MODEL_GEHEUGEN.keys().next().value as string); }
};

/** «до пн, 26 жовт.» / «vóór ma 26 okt.» — of de termijn zoals hij er staat, als er geen datum in te lezen is. */
export function termijnTekst(lang: 'uk' | 'nl', termijn: string, ref: number): string {
  const d = datumUit(termijn, ref);
  if (!d) return termijn;
  const opmaak = new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'nl-BE', { weekday: 'short', day: 'numeric', month: 'short', ...(d.heleDag ? {} : { hour: '2-digit', minute: '2-digit' }) });
  return `${lang === 'uk' ? 'до' : 'vóór'} ${opmaak.format(new Date(d.start))}`;
}

/** Afspraak of taak uit de punten: het eerste punt of feit MET tijd (anders met datum) bepaalt het begin. */
export function voorstelUit(o: { subject: string; punten: GecontroleerdPunt[]; kort: GecontroleerdPunt[]; ref: number; lang: 'uk' | 'nl'; voor: 'taak' | 'agenda' }): AfspraakOfTaak {
  const t = (uk: string, nl: string) => (o.lang === 'uk' ? uk : nl);
  const kandidaten = [...o.punten, ...o.kort].map((p) => ({ p, d: datumUit(p.termijn || p.citaat, o.ref) })).filter((x) => x.d);
  const metTijd = o.voor === 'agenda' ? kandidaten.find((x) => !x.d!.heleDag) || kandidaten[0] : kandidaten.find((x) => x.p.termijn) || kandidaten[0];
  const regels = o.punten.map((p) => `• ${p.tekst}${p.termijn ? ` (${p.termijn})` : ''} — ${bronLabel(o.lang, p.bron || { brief: p.brief || 0, nr: p.alinea || 0 })}`);
  const start = metTijd?.d?.start || 0;
  const einde = start ? start + (metTijd!.d!.heleDag ? 864e5 : 3600e3) : 0;
  return {
    titel: o.voor === 'agenda' ? o.subject || t('Подія з листа', 'Afspraak uit e-mail') : o.punten[0]?.tekst?.slice(0, 200) || o.subject,
    start, einde, plaats: '',
    beschrijving: [o.voor === 'agenda' && metTijd ? metTijd.p.citaat : '', ...regels].filter(Boolean).join('\n'),
  };
}

/** Eén punt: icoon, tekst, bronchip («лист 3 · §3» → «Звідки це?») en termijn. Buiten het blok, zodat de knop bij elke render dezelfde blijft. */
function PuntRegel({ x, lang, ref0, onBron }: { x: GecontroleerdPunt; lang: 'uk' | 'nl'; ref0: number; onBron: () => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  return (
    <li data-soort={x.soort} data-status={x.status} data-ai-punt={x.id}>
      <span className='ai-blok-icoon' aria-hidden='true'>{x.soort === 'vraag' ? <CircleHelp /> : x.soort === 'termijn' ? <Clock3 /> : x.status === 'niet-gevonden' ? <ShieldAlert /> : <ListChecks />}</span>
      <span className='ai-blok-regel'>
      <span className='ai-blok-tekst'>{x.tekst}</span>
      <span className='ai-blok-chips'>
        {x.bron
          ? <button type='button' className='ai-bron-chip' data-bron-chip onClick={onBron} aria-label={t(`Звідки це? Джерело: ${bronLabel('uk', x.bron)}`, `Waar komt dit vandaan? Bron: ${bronLabel('nl', x.bron)}`)} title={t('Звідки це?', 'Waar komt dit vandaan?')}>{bronLabel(lang, x.bron)}</button>
          : <span className='ai-bron-chip' data-niet-gevonden>{t('не знайдено в листі', 'niet in het bericht gevonden')}</span>}
        {x.termijn ? <span className='ai-termijn-chip' title={x.termijn}><Clock3 aria-hidden='true' />{termijnTekst(lang, x.termijn, ref0)}</span> : null}
      </span>
      </span>
    </li>
  );
}

export default function WatNodigBlok(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const id = useId();
  const lv = useLeesVenster();
  const ai = useAiStaat(p.context);
  // Open of dicht: wat u koos (dit apparaat); anders open in een hoog venster en ingeklapt in een laag (< 860 px: op 1280×800 begon de
  // brief zelf anders pas onder de rand — «Головне — лист»). Ingeklapt zegt de kop nog steeds hoeveel punten en welke termijn.
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(OPEN_SLEUTEL); if (v === '1' || v === '0') return v === '1'; } catch { /* */ }
    return typeof innerHeight === 'number' ? innerHeight >= LAAG_VENSTER : true;
  });
  // Op de telefoon (en in een smal venster) begint het blok ingeklapt: «другорядні панелі ніколи постійно не займають екран телефона».
  const [smalDicht, setSmalDicht] = useState(true);
  const smal = lv?.breedte === 'smal';
  const zichtbaarOpen = smal ? !smalDicht : open;
  const wissel = () => {
    if (smal) { setSmalDicht((v) => !v); return; }
    setOpen((v) => { try { localStorage.setItem(OPEN_SLEUTEL, v ? '0' : '1'); } catch { /* */ } return !v; });
  };

  // De brieven met hun volgnummer; geanalyseerd: wat na mijn laatste brief kwam (is de laatste van mij, dan niets).
  const genummerd = useMemo(() => p.brieven.map((b, i) => ({ ...b, brief: i + 1 })), [p.brieven]);
  const alineas = useMemo(() => gespreksAlineas(genummerd), [genummerd]);
  const teAnalyseren = useMemo(() => {
    const mijn = new Set(p.mijnAdressen.map(adres));
    let laatste = 0;
    genummerd.forEach((b) => { if (mijn.has(adres(b.from))) laatste = b.brief; });
    return genummerd.filter((b) => b.brief > laatste);
  }, [genummerd, p.mijnAdressen]);
  const eenvoudig = useMemo(() => eenvoudigeOntleding(teAnalyseren), [teAnalyseren]);

  const geheugenSleutel = `${p.threadId}\u001f${genummerd[genummerd.length - 1]?.id || ''}\u001f${genummerd.length}`;
  const [model, setModelState] = useState<ModelUitkomst | null>(() => MODEL_GEHEUGEN.get(geheugenSleutel) || null);
  const setModel = (m: ModelUitkomst | null) => { onthoud(geheugenSleutel, m); setModelState(m); };
  // een antwoord dat binnenkomt nadat u al een ander gesprek opende, hoort bij het oude gesprek (alleen onthouden, niet tonen)
  const huidigeSleutel = useRef(geheugenSleutel);
  huidigeSleutel.current = geheugenSleutel;
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<AiFout | null>(null);
  const [toonNiet, setToonNiet] = useState(false);
  const [weg, setWeg] = useState<string[]>(() => leesWeg(p.threadId));
  useEffect(() => { setModelState(MODEL_GEHEUGEN.get(geheugenSleutel) || null); setFout(null); setToonNiet(false); setWeg(leesWeg(p.threadId)); }, [geheugenSleutel]);
  useEffect(() => {
    const opWeg = (e: Event) => { if ((e as CustomEvent<{ threadId: string }>).detail?.threadId === p.threadId) setWeg(leesWeg(p.threadId)); };
    window.addEventListener(WEG_GEBEURTENIS, opWeg);
    return () => window.removeEventListener(WEG_GEBEURTENIS, opWeg);
  }, [p.threadId]);

  const vraagModel = async () => {
    if (!ai.agent || bezig) return;
    const k = geheugenSleutel;
    setBezig(true); setFout(null);
    try {
      const laatste = genummerd[genummerd.length - 1];
      const r = await aiRun(p.context, {
        mode: 'acties', targetLang: p.lang, agentId: ai.agent.id, accountId: p.accountId, messageId: laatste?.id || p.threadId, threadId: p.threadId,
        subject: p.subject, from: laatste?.from || '', bodyText: laatste?.tekst || '',
        bronBerichten: genummerd.map((b) => ({ brief: b.brief, from: b.from, receivedAt: b.receivedAt, tekst: b.tekst.slice(0, 8000) })),
      });
      const a = r.acties;
      if (!a) throw { response: { data: { error: 'GEEN_ACTIES' } } };
      // Nog eens controleren, nu tegen de brief zoals hij hier getoond wordt (de server zag een opgeschoonde versie).
      const m: ModelUitkomst = { punten: controleerPunten(a.punten, alineas), kort: controleerPunten(a.kort, alineas), hints: a.antwoordHints || [], nodig: a.antwoordNodig, agentNaam: r.agentName || ai.agent.name };
      onthoud(k, m);
      if (huidigeSleutel.current === k) setModelState(m);
    } catch (e) { if (huidigeSleutel.current === k) setFout(aiFoutVan(e)); } finally { setBezig(false); }
  };

  const opbouw: Opbouw = model ? 'model' : 'eenvoudig';
  const alle = model ? model.punten : eenvoudig.punten;
  const kortAlle = model ? model.kort : eenvoudig.kort;
  const zichtbaar = alle.filter((x) => x.status === 'letterlijk' && !weg.includes(puntSleutel(x)));
  const kort = kortAlle.filter((x) => x.status === 'letterlijk' && !weg.includes(puntSleutel(x)));
  const nietGevonden = [...alle, ...kortAlle].filter((x) => x.status === 'niet-gevonden');
  const telling = telGevonden([...alle, ...kortAlle]);
  const wegHier = [...alle, ...kortAlle].filter((x) => weg.includes(puntSleutel(x))).length;
  const nodig = useMemo(() => {
    const regel = antwoordNodig(genummerd, p.mijnAdressen, zichtbaar);
    if (model && model.nodig === false) return null;
    return regel;
  }, [genummerd, p.mijnAdressen, zichtbaar, model]);
  const agentNaam = model?.agentNaam || ai.agent?.name || '';
  const uitkomst: WatNodigUitkomst = useMemo(() => ({ punten: zichtbaar, kort, hints: model?.hints || [], antwoordNodig: nodig, opbouw, agentNaam }), [zichtbaar, kort, model, nodig, opbouw, agentNaam]);
  const uitkomstSleutel = `${opbouw}|${zichtbaar.map((x) => x.id).join(',')}|${kort.map((x) => x.id).join(',')}|${nodig?.id || ''}|${(model?.hints || []).join('|')}`;
  useEffect(() => { p.onUitkomst?.(uitkomst); }, [uitkomstSleutel]);

  const ref = genummerd[genummerd.length - 1]?.receivedAt || Date.now();
  const voorstel = (voor: 'taak' | 'agenda') => voorstelUit({ subject: p.subject, punten: zichtbaar, kort, ref, lang: p.lang, voor });
  const heeftDatum = [...zichtbaar, ...kort].some((x) => datumUit(x.termijn || x.citaat, ref));
  const vanMij = !teAnalyseren.length && genummerd.length > 0;
  const eerste = zichtbaar[0];
  const samenvatting = zichtbaar.length
    ? `${zichtbaar.length} ${p.lang === 'uk' ? (zichtbaar.length === 1 ? 'пункт' : zichtbaar.length < 5 ? 'пункти' : 'пунктів') : zichtbaar.length === 1 ? 'punt' : 'punten'}${eerste?.termijn ? ` · ${termijnTekst(p.lang, eerste.termijn, ref)}` : ''}`
    : vanMij ? t('останній лист — ваш', 'het laatste bericht is van u') : t('питань і термінів не знайдено', 'geen vragen of termijnen gevonden');

  return (
    <section className='ai-blok' data-ai-blok data-opbouw={opbouw} data-open={zichtbaarOpen ? 'ja' : 'nee'} aria-labelledby={`${id}-kop`}>
      <header className='ai-blok-kop'>
        <button type='button' className='ai-blok-wissel' aria-expanded={zichtbaarOpen} aria-controls={`${id}-inhoud`} onClick={wissel}>
          <span className='ai-blok-merk' data-opbouw={opbouw}>{opbouw === 'model' ? <><Sparkles aria-hidden='true' />{t('ШІ', 'AI')}</> : <><ListChecks aria-hidden='true' />{t('Авто', 'Auto')}</>}</span>
          <strong id={`${id}-kop`}>{t('Що від вас потрібно?', 'Wat wordt er van u verwacht?')}</strong>
          <small className='ai-blok-samenvatting'>{samenvatting}</small>
          <ChevronDown aria-hidden='true' className='ai-blok-pijl' />
        </button>
        <small className='ai-blok-herkomst'>
          {t('не частина листа', 'geen deel van het bericht')} · {opbouw === 'model'
            ? t(`склав ваш ШІ-агент «${agentNaam}»`, `opgesteld door uw AI-agent «${agentNaam}»`)
            : t('простий розбір у браузері, без моделі', 'eenvoudige ontleding in de browser, zonder model')}
        </small>
      </header>
      {zichtbaarOpen && (
        <div className='ai-blok-inhoud' id={`${id}-inhoud`}>
          {zichtbaar.length
            ? <ol className='ai-blok-punten'>{zichtbaar.map((x) => <PuntRegel key={x.id} x={x} lang={p.lang} ref0={ref} onBron={() => p.onBron(x, uitkomst)} />)}</ol>
            : <p className='ai-blok-leeg'>{vanMij
              ? t('Останній лист у гілці — ваш. Поки ніхто не відповів, від вас нічого не чекають.', 'Het laatste bericht in het gesprek is van u. Zolang niemand antwoordt, wordt er niets van u verwacht.')
              : opbouw === 'model'
                ? t('ШІ-агент не знайшов у листі нічого, що від вас потрібно.', 'De AI-agent vond in het bericht niets wat van u verwacht wordt.')
                : t('Простий розбір не знайшов у листі питань, прохань чи термінів.', 'De eenvoudige ontleding vond in het bericht geen vragen, verzoeken of termijnen.')}</p>}
          {kort.length > 0 && (
            <div className='ai-blok-kort'>
              <h4>{t('Коротко', 'Kort')}</h4>
              <ul>{kort.map((x) => <PuntRegel key={x.id} x={x} lang={p.lang} ref0={ref} onBron={() => p.onBron(x, uitkomst)} />)}</ul>
            </div>
          )}
          {toonNiet && nietGevonden.length > 0 && (
            <div className='ai-blok-niet' data-niet-gevonden-lijst>
              <h4>{t('Не знайдено в листі — не покладайтеся на це', 'Niet in het bericht gevonden — vertrouw hier niet op')}</h4>
              <ul>{nietGevonden.map((x) => <PuntRegel key={x.id} x={x} lang={p.lang} ref0={ref} onBron={() => p.onBron(x, uitkomst)} />)}</ul>
            </div>
          )}
          <div className='ai-blok-acties'>
            <button type='button' className='ai-blok-knop' data-actie='concept' disabled={vanMij && !zichtbaar.length} onClick={() => p.onConcept(uitkomst)}><PenLine aria-hidden='true' />{t('Чернетка відповіді', 'Antwoordconcept')}</button>
            <button type='button' className='ai-blok-knop' data-actie='taak' disabled={!zichtbaar.length} onClick={() => p.onTaak(voorstel('taak'))}><ListTodo aria-hidden='true' />{t('До завдань', 'Naar taken')}</button>
            <button type='button' className='ai-blok-knop' data-actie='agenda' disabled={!heeftDatum} onClick={() => p.onAgenda(voorstel('agenda'))}><CalendarPlus aria-hidden='true' />{t('В Агенду', 'Naar Agenda')}</button>
            {ai.agent && !model && (
              <button type='button' className='ai-blok-knop ai-blok-knop-ai' data-actie='model' disabled={bezig || !genummerd.length} onClick={() => void vraagModel()}
                title={t(`Надіслати гілку вашому ШІ-агенту «${ai.agent.name}» і перевірити кожен пункт за оригіналом`, `Het gesprek naar uw AI-agent «${ai.agent.name}» sturen en elk punt tegen het origineel controleren`)}>
                {bezig ? <LoaderCircle className='spin' aria-hidden='true' /> : <Sparkles aria-hidden='true' />}{t('Уточнити з ШІ', 'Verfijnen met AI')}
              </button>
            )}
            {model && <button type='button' className='ai-blok-knop' data-actie='eenvoudig' onClick={() => setModel(null)}><ListChecks aria-hidden='true' />{t('Простий розбір', 'Eenvoudige ontleding')}</button>}
          </div>
          {fout && (
            <p className='ai-blok-fout' role='alert'>
              {t(fout.uk, fout.nl)} {fout.code !== 'AI_FOUT' && <a href={fout.href}>{t('«Доступ ШІ»', '«AI-toegang»')}</a>}
            </p>
          )}
          <footer className='ai-blok-voet'>
            {telling.totaal > 0 && (
              <span data-gevonden={`${telling.gevonden}/${telling.totaal}`}>
                <ShieldCheck aria-hidden='true' />
                {telling.gevonden === telling.totaal
                  ? t(`Кожен пункт знайдено дослівно в оригіналі (${telling.gevonden} з ${telling.totaal})`, `Elk punt staat letterlijk in het origineel (${telling.gevonden} van ${telling.totaal})`)
                  : t(`Дослівно в оригіналі: ${telling.gevonden} з ${telling.totaal}; решту не показано`, `Letterlijk in het origineel: ${telling.gevonden} van ${telling.totaal}; de rest wordt niet getoond`)}
              </span>
            )}
            <span>{t('Склав', 'Opgesteld door')}: {opbouw === 'model' ? agentNaam : t('простий розбір без моделі', 'eenvoudige ontleding zonder model')}</span>
            {nietGevonden.length > 0 && <button type='button' className='ai-blok-link' aria-expanded={toonNiet} onClick={() => setToonNiet((v) => !v)}>{toonNiet ? t('Сховати не знайдене', 'Niet-gevonden verbergen') : t(`Показати не знайдене (${nietGevonden.length})`, `Niet-gevonden tonen (${nietGevonden.length})`)}</button>}
            {wegHier > 0 && <button type='button' className='ai-blok-link' onClick={() => { bewaarWeg(p.threadId, []); setWeg([]); }}><Undo2 aria-hidden='true' />{t(`Повернути прибрані (${wegHier})`, `Weggehaalde terugzetten (${wegHier})`)}</button>}
            {!ai.agent && ai.geladen && <span className='ai-blok-zonder'>{t('ШІ-агента не підключено — лист нікуди не надсилається.', 'Geen AI-agent gekoppeld — het bericht gaat nergens heen.')}</span>}
          </footer>
        </div>
      )}
    </section>
  );
}
