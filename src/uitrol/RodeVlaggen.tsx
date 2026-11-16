// Червоні прапорці перед схваленням (SEC-PAKKET-001): окремий блок зі змінами, які дають найбільшу владу над сервером, і окреме
// підтвердження. Без позначки кнопка «Схвалити» неактивна; сервер так само відхиляє схвалення без неї (RISICO_NIET_BEVESTIGD).
// Власник (16.11.2026): «не бухгалтерський звіт, а сучасне оформлення з піктограмами й графіками, де зміни видно оком».
// Тому: кільце-діаграма висновків, плитки «де саме зміни» з піктограмами (фільтр), шкала доданих/прибраних рядків у кожному пункті,
// «було → стане» як дві картки зі стрілкою, однакові безпечніші зміни згорнуто в одну групу, пояснення автора — як цитата.
// Rode vlaggen vóór het goedkeuren: ringdiagram, tegels per soort (filter), verschilbalk per punt, voor → na als kaartjes met pijl,
// gelijke veiligere wijzigingen samengevoegd, uitleg van de maker als citaat.
import { useId, useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Code2, Database, Flag, Github, HelpCircle, Info, Layers, Lightbulb, Link2, Lock, MessageSquareQuote, Package, Server, ShieldAlert, ShieldCheck, Upload, Workflow, type LucideIcon, Tag, Plus, Minus, Repeat, FileCode2, ChevronLeft, ChevronRight, List, Eye } from 'lucide-react';
import { tr, type Lang, type RisicoItemUit, type VoorcontroleUit } from './types';
import HulpVraag from '../hulp/HulpVraag';

/** Прапорці з поясненнями; для старих записів перевірки (лише рядки) — прапорці без пояснень. */
export const rodeVlaggen = (vc: VoorcontroleUit | null | undefined): RisicoItemUit[] | null => {
  const c = vc?.controles?.find((x) => x.id === 'risico');
  if (!c || c.niveau === 'ok') return null;
  return c.vlaggen?.length ? c.vlaggen : (c.details ?? []).filter((d) => d.startsWith('[')).map((vlag) => ({ vlag, wat: { uk: '', nl: '' }, wijziging: { uk: '', nl: '' }, let: { uk: '', nl: '' } }));
};

/** Без пояснення автора (досьє, поле risicoUitleg) — встановлення заблоковано перевіркою пакета. */
export const zonderUitleg = (it: RisicoItemUit) => !!it.leesbaar?.uitlegNodig && !it.auteur;

type Soort = { icoon: LucideIcon; uk: string; nl: string; tipUk: string; tipNl: string };
const SOORT: Record<string, Soort> = {
  root: { icoon: Server, uk: 'Сервер (root)', nl: 'Server (root)', tipUk: 'Файли в deploy/: їх виконує або встановлює root (скрипти, служби, sudoers). Шкідлива зміна тут = повний контроль над сервером.', tipNl: 'Bestanden in deploy/: root voert ze uit of installeert ze. Een kwaadaardige wijziging hier = volledige controle over de server.' },
  CI: { icoon: Workflow, uk: 'Збирання на GitHub', nl: 'Bouwen op GitHub', tipUk: 'Процеси GitHub Actions: від них залежить, що потрапить в архів для сервера.', tipNl: 'GitHub Actions-werkstromen: ze bepalen wat er in het archief voor de server komt.' },
  npm: { icoon: Package, uk: 'Пакети npm', nl: 'npm-pakketten', tipUk: 'Чужий готовий код, який сервер завантажує й виконує під час збирання.', tipNl: 'Kant-en-klare code van anderen die de server downloadt en uitvoert bij het bouwen.' },
  lock: { icoon: Link2, uk: 'Джерела пакетів', nl: 'Pakketbronnen', tipUk: 'Адреси, звідки сервер завантажує пакети. Нестандартна адреса = чужий код.', tipNl: 'Adressen waar de server pakketten haalt. Ongebruikelijk adres = vreemde code.' },
  SQL: { icoon: Database, uk: 'База даних', nl: 'Database', tipUk: 'Нові міграції змінюють права в базі (ролі, RLS, функції з правами власника). При відкаті не скасовуються.', tipNl: 'Nieuwe migraties wijzigen rechten in de database. Ze worden bij terugdraaien niet teruggedraaid.' },
  GitHub: { icoon: Upload, uk: 'Архів вручну', nl: 'Archief met de hand', tipUk: 'Архів у випуску на GitHub поклала людина, а не автоматична збірка.', tipNl: 'Het archief in de GitHub-release is door een mens geplaatst, niet door de automatische build.' },
  '!': { icoon: HelpCircle, uk: 'Без порівняння', nl: 'Niet vergeleken', tipUk: 'Не вдалося порівняти з встановленою версією.', tipNl: 'Vergelijken met de geïnstalleerde versie lukte niet.' },
};
const soortVan = (it: RisicoItemUit) => { const k = /^\[([^\]]+)\]/.exec(it.vlag)?.[1] ?? '!'; return SOORT[k] ? k : '!'; };
const padVan = (it: RisicoItemUit) => /^\[[^\]]+\]\s*(.*)$/.exec(it.vlag)?.[1] ?? it.vlag;
const oordeelVan = (it: RisicoItemUit) => it.leesbaar?.oordeel ?? 'aandacht';

const RANG: Record<string, number> = { aandacht: 0, gewoon: 1, veiliger: 2 };
const OORDEEL: Record<string, { uk: string; nl: string; o: string; icoon: LucideIcon }> = {
  aandacht: { uk: 'Потребує уваги', nl: 'Aandacht nodig', o: 'let', icoon: AlertTriangle },
  gewoon: { uk: 'Звичайна зміна', nl: 'Gewone wijziging', o: 'gewoon', icoon: Info },
  veiliger: { uk: 'Безпечніше', nl: 'Veiliger', o: 'ok', icoon: CheckCircle2 },
};

/** Кількість доданих і прибраних рядків у різниці — для наочної шкали. */
function telRegels(verschil?: string): { plus: number; min: number } {
  let plus = 0; let min = 0;
  for (const r of (verschil ?? '').split('\n')) {
    if (r.startsWith('+++') || r.startsWith('---')) continue;
    if (r[0] === '+') plus++; else if (r[0] === '-') min++;
  }
  return { plus, min };
}

/** Шкала змін, як у GitHub: 5 клітинок, зелені = додано, червоні = прибрано. */
function Schaal({ verschil, lang }: { verschil?: string; lang: Lang }) {
  const { plus, min } = telRegels(verschil);
  if (!plus && !min) return null;
  const tot = plus + min; const groen = Math.round((plus / tot) * 5); const blokken = Array.from({ length: 5 }, (_, i) => (i < groen ? '+' : '-'));
  return <span className='ut-rv-schaal' title={tr(lang, `Додано рядків: ${plus}, прибрано: ${min}`, `Regels toegevoegd: ${plus}, verwijderd: ${min}`)}>
    <span data-r='+'>+{plus}</span><span data-r='-'>−{min}</span>
    <span className='ut-rv-blokken' aria-hidden='true'>{blokken.map((b, i) => <i key={i} data-r={b} />)}</span>
  </span>;
}

/** Кільце-діаграма висновків (SVG, без бібліотек). */
function Ring({ a, g, v, lang }: { a: number; g: number; v: number; lang: Lang }) {
  const tot = Math.max(1, a + g + v); const R = 34; const O = 2 * Math.PI * R;
  let start = 0;
  const boog = (n: number, k: string) => { if (!n) return null; const len = (n / tot) * O; const el = <circle key={k} data-o={k} r={R} cx='44' cy='44' strokeDasharray={`${len} ${O - len}`} strokeDashoffset={-start} />; start += len; return el; };
  return <svg className='ut-rv-ring' viewBox='0 0 88 88' role='img' aria-label={tr(lang, `Уваги: ${a}, звичайних: ${g}, безпечніших: ${v}`, `Aandacht: ${a}, gewoon: ${g}, veiliger: ${v}`)}>
    <circle className='ut-rv-ring-spoor' r={R} cx='44' cy='44' />
    <g transform='rotate(-90 44 44)'>{boog(a, 'let')}{boog(g, 'gewoon')}{boog(v, 'ok')}</g>
    <text x='44' y='42' textAnchor='middle' className='ut-rv-ring-getal'>{a + g + v}</text>
    <text x='44' y='57' textAnchor='middle' className='ut-rv-ring-label'>{tr(lang, 'змін', 'wijz.')}</text>
  </svg>;
}

/** Різниця «було → стане»: червоні рядки були, зелені з'являться. */
function Verschil({ tekst, afgekapt, lang }: { tekst: string; afgekapt?: boolean; lang: Lang }) {
  return <div className='ut-rv-diff' role='region' aria-label={tr(lang, 'Різниця: було → стане', 'Verschil: voorheen → straks')}>
    <p className='ut-rv-legenda'><span data-r='-'>− {tr(lang, 'було', 'voorheen')}</span><span data-r='+'>+ {tr(lang, 'стане', 'straks')}</span></p>
    <pre>{tekst.split('\n').map((r, i) => <span key={i} data-r={r.startsWith('+++') || r.startsWith('---') ? 'kop' : r.startsWith('@@') ? 'blok' : r[0] === '+' ? '+' : r[0] === '-' ? '-' : undefined}>{r || ' '}{'\n'}</span>)}</pre>
    {afgekapt && <p className='ut-hint'>{tr(lang, 'Показано лише початок — повну різницю дивіться в коміті на GitHub.', 'Alleen het begin wordt getoond — het volledige verschil staat in de commit op GitHub.')}</p>}
  </div>;
}

type Paar = NonNullable<RisicoItemUit['leesbaar']>['voorNa'][number];
/**
 * «Було → стане» компактно (власник 16.11.2026: довгий стовпчик червоних і зелених блоків «не гарний»).
 * Модулі GitHub — один рядок: назва, мітка «було» (перекреслена) → закріплена версія із замком, «×N». Решта — рядок із кольоровою
 * позначкою (додано / прибрано / змінено), «було» дрібно й перекреслено над «стане». Повний текст — у підказці.
 * Voor → na compact: modules als één regel (label → vastgezette versie), de rest als regel met gekleurd teken.
 */
/** 1 модуль · 2 модулі · 5 модулів. */
const modWoord = (n: number) => { const d = n % 10, h = n % 100; return d === 1 && h !== 11 ? "модуль" : d >= 2 && d <= 4 && (h < 12 || h > 14) ? "модулі" : "модулів"; };
/** Чому зміна модуля важлива — звичайними словами. Waarom de modulewijziging telt, in gewone woorden. */
function modWaarom(m: { naam: string; van?: string; naar?: string; vast?: boolean }, lang: Lang): string {
  if (m.naar && m.vast) return tr(lang,
    `Мітка${m.van ? ` «${m.van}»` : ''} — як ярлик: автор модуля «${m.naam}» може будь-коли перевісити її на інший код, і наступне збирання тихо візьме його. Версію ${m.naar} закріплено відбитком (хешем): під нею завжди той самий код. Тому це безпечніше.`,
    `Een label${m.van ? ` «${m.van}»` : ''} is als een etiket: de maker van «${m.naam}» kan het op andere code hangen en de volgende build neemt die stil mee. Versie ${m.naar} is vastgezet met een vingerafdruk (hash): altijd dezelfde code. Daarom veiliger.`);
  if (m.naar) return tr(lang,
    `Модуль «${m.naam}» підключено за міткою «${m.naar}»: її автор може непомітно змінити код. Безпечніше закріпити точну версію.`,
    `Module «${m.naam}» hangt aan label «${m.naar}»: de maker kan de code ongemerkt wijzigen. Veiliger is een vastgezette versie.`);
  return tr(lang, `Модуль «${m.naam}» більше не використовується в цьому процесі.`, `Module «${m.naam}» wordt in deze werkstroom niet meer gebruikt.`);
}
function Wissels({ lang, paren }: { lang: Lang; paren: Paar[] }) {
  const t = (x: { uk: string; nl: string } | null) => (x ? (lang === 'uk' ? x.uk : x.nl) : '');
  const modules = paren.filter((p) => p.module); const rest = paren.filter((p) => !p.module);
  const allesVast = modules.length > 0 && modules.every((p) => p.module?.vast && p.module.van);
  return <div className='ut-rv-wissels'>
    {modules.length > 0 && <div className='ut-rv-mods'>
      <div className='ut-rv-mods-kop'><Lock aria-hidden='true' /><span>{allesVast
        ? tr(lang, `${modules.length} ${modWoord(modules.length)} GitHub закріплено — тихо підмінити не можна`, `${modules.length} GitHub-${modules.length === 1 ? "module" : "modules"} vastgezet — niet ongemerkt te vervangen`)
        : tr(lang, 'Готові модулі GitHub', 'Kant-en-klare GitHub-modules')}</span></div>
      <ul>{modules.map((p, i) => { const m = p.module!; return <li key={i} data-toon={p.toon}>
        {/* Натиск розгортає рядок: що було, що стало й чому так (власник 16.11.2026). Klik klapt de regel open. */}
        <details className='ut-rv-mod'>
          <summary>
            <span className='ut-rv-mod-naam'><Github aria-hidden='true' /><code>{m.naam}</code>{p.keer && p.keer > 1 ? <em title={tr(lang, `Трапляється ${p.keer} рази у файлі`, `Komt ${p.keer} keer voor in het bestand`)}>×{p.keer}</em> : null}</span>
            <span className='ut-rv-mod-versies'>
              {m.van ? <span className='ut-rv-ver' data-k='van'><Tag aria-hidden='true' />{m.van}</span> : <span className='ut-rv-ver' data-k='nieuw'>{tr(lang, 'новий', 'nieuw')}</span>}
              <ArrowRight aria-hidden='true' className='ut-rv-ver-pijl' />
              {m.naar ? <span className='ut-rv-ver' data-k={m.vast ? 'vast' : 'label'}>{m.vast ? <Lock aria-hidden='true' /> : <Tag aria-hidden='true' />}{m.naar}</span> : <span className='ut-rv-ver' data-k='weg'>{tr(lang, 'прибрано', 'verwijderd')}</span>}
              <ChevronDown aria-hidden='true' className='ut-rv-mod-pijl' />
            </span>
          </summary>
          <div className='ut-rv-mod-meer'>
            <dl>
              <dt>{tr(lang, 'Було', 'Was')}</dt><dd data-k='voor'>{p.voor ? t(p.voor) : tr(lang, 'модуля не було', 'module bestond niet')}</dd>
              <dt>{tr(lang, 'Стане', 'Wordt')}</dt><dd data-k='na'>{p.na ? t(p.na) : tr(lang, 'модуль більше не використовується', 'module wordt niet meer gebruikt')}</dd>
            </dl>
            <p className='ut-rv-mod-waarom'><Info aria-hidden='true' /><span>{modWaarom(m, lang)}</span></p>
          </div>
        </details></li>; })}</ul>
    </div>}
    {rest.length > 0 && <ul className='ut-rv-rest'>{rest.map((p, i) => { const soort = !p.voor ? 'plus' : !p.na ? 'min' : 'wissel';
      const I = soort === 'plus' ? Plus : soort === 'min' ? Minus : Repeat;
      return <li key={i} data-toon={p.toon || 'neutraal'}>
        <span className='ut-rv-rest-icoon' aria-hidden='true'><I /></span>
        <span className='ut-rv-rest-tekst'>
          <small>{soort === 'plus' ? tr(lang, 'Додано', 'Toegevoegd') : soort === 'min' ? tr(lang, 'Прибрано', 'Verwijderd') : tr(lang, 'Змінено', 'Gewijzigd')}
            {p.toon === 'veiliger' ? tr(lang, ' · безпечніше', ' · veiliger') : p.toon === 'risico' ? tr(lang, ' · ризиковіше', ' · risicovoller') : ''}
            {p.keer && p.keer > 1 ? ` · ×${p.keer}` : ''}</small>
          {soort === 'wissel' && <s>{t(p.voor)}</s>}
          <span>{soort === 'min' ? t(p.voor) : t(p.na)}</span>
        </span></li>; })}</ul>}
  </div>;
}

/** Вміст розгорнутого пункту: що робити, пояснення автора, «було → стане», підозрілі рядки, подробиці й код. */
function Uitleg({ it, lang }: { it: RisicoItemUit; lang: Lang }) {
  const t = (x: { uk: string; nl: string }) => (lang === 'uk' ? x.uk : x.nl);
  const l = it.leesbaar; const o = OORDEEL[oordeelVan(it)];
  return <div className='ut-rv-uitleg'>
    {zonderUitleg(it)
      ? <p className='ut-rv-doen' data-o='let'><ShieldAlert aria-hidden='true' /><span><b>{tr(lang, 'Автор не пояснив цю зміну. ', 'De maker heeft deze wijziging niet uitgelegd. ')}</b>{tr(lang, 'Тому встановлення заблоковано. Автор має дописати пояснення в досьє випуску й зібрати пакет знову.', 'Daarom is de installatie geblokkeerd. De maker moet uitleg in het releasedossier zetten en het pakket opnieuw bouwen.')}</span></p>
      : l && <p className='ut-rv-doen' data-o={o.o}><Lightbulb aria-hidden='true' /><span><b>{tr(lang, 'Що робити: ', 'Wat te doen: ')}</b>{t(l.doen)}</span></p>}
    {it.auteur && <blockquote className='ut-rv-auteur'><MessageSquareQuote aria-hidden='true' /><div><small>{tr(lang, 'Пояснення автора (з досьє випуску)', 'Uitleg van de maker (uit het releasedossier)')}</small><p>{t(it.auteur)}</p>
      <small className='ut-rv-auteur-noot'>{tr(lang, 'Це слова автора, а не доказ. Порівняйте їх із тим, що змінилося.', 'Dit zijn woorden van de maker, geen bewijs. Vergelijk ze met wat er veranderde.')}</small></div></blockquote>}
    {l?.voorNa.length ? <Wissels lang={lang} paren={l.voorNa} /> : null}
    {l?.overig ? <p className='ut-rv-overig'><Code2 aria-hidden='true' />{tr(lang, `Ще ${l.overig} рядк. логіки програми — їх словами не перекласти${it.auteur ? '; про них — у поясненні автора.' : '.'}`, `Nog ${l.overig} regel(s) programmalogica — niet in woorden te vatten${it.auteur ? '; zie de uitleg van de maker.' : '.'}`)}</p> : null}
    {it.opvallend?.length ? <ul className='ut-rv-opvallend'>{it.opvallend.map((x, i) => <li key={i}><AlertTriangle aria-hidden='true' />{t(x)}</li>)}</ul> : null}
    {(t(it.wat) || it.betekenis?.length) && <details className='ut-rv-meer'><summary><Info aria-hidden='true' />{tr(lang, 'Докладніше', 'Meer uitleg')}</summary>
      {t(it.wat) && <p><b>{tr(lang, 'Що це: ', 'Wat is dit: ')}</b>{t(it.wat)}</p>}
      {t(it.wijziging) && <p><b>{tr(lang, 'Що змінилося: ', 'Wat verandert: ')}</b>{t(it.wijziging)}</p>}
      {it.betekenis?.length ? <ul className='ut-rv-betekenis'>{it.betekenis.map((x, i) => <li key={i}><CheckCircle2 aria-hidden='true' />{t(x)}</li>)}</ul> : null}
      {t(it.let) && <p><b>{tr(lang, 'На що звернути увагу: ', 'Waar op letten: ')}</b>{t(it.let)}</p>}
    </details>}
    {it.verschil && <details className='ut-rv-meer'><summary><Code2 aria-hidden='true' />{tr(lang, 'Для програміста: код змін', 'Voor de programmeur: code van de wijziging')}</summary>
      <Verschil tekst={it.verschil} afgekapt={it.verschilAfgekapt} lang={lang} /></details>}
  </div>;
}

/**
 * Перемикач файлів групи (власник 16.11.2026: стовпчик назв «треба зробити краще»). Угорі — поточний файл великим шрифтом, тека й
 * «1 з 9», стрілки вперед/назад; нижче — одна стрічка коротких назв, яку можна гортати (на телефоні пальцем), вибрана — залита.
 * Bestandenwisselaar: huidig bestand groot met map en «1 van 9», pijlen; daaronder één scrollbare strook met korte namen.
 */
function Bestanden({ lang, paden, verschillen = [], gekozen, kies }: { lang: Lang; paden: string[]; verschillen?: (string | undefined)[]; gekozen: number; kies: (i: number) => void }) {
  const strook = useRef<HTMLDivElement>(null); const [alles, setAlles] = useState(false); const lijstId = useId();
  const n = paden.length; const pad = paden[gekozen] || '';
  const naam = pad.split('/').pop() || pad; const map = pad.includes('/') ? pad.slice(0, pad.lastIndexOf('/')) : '';
  const kort = (p: string) => (p.split('/').pop() || p).replace(/\.(ya?ml|json|sh|service|timer|sql)$/i, '');
  const ext = /\.([a-z]+)$/i.exec(naam)?.[1]?.toUpperCase() || '';
  // Усі файли в одній теці — тека показана вгорі один раз, у рядках списку не повторюється. Eén map: niet per regel herhalen.
  const mapVan = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''); const eenMap = paden.every((p) => mapVan(p) === mapVan(paden[0]));
  useEffect(() => { // вибраний пункт — у видиму частину стрічки, без прокручування сторінки · gekozen tab in beeld, zonder de pagina te scrollen
    const s = strook.current; const b = s?.children[gekozen] as HTMLElement | undefined;
    if (s && b && typeof s.scrollTo === 'function') s.scrollTo({ left: b.offsetLeft - s.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
  }, [gekozen]);
  const toets = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); kies((gekozen + 1) % n); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); kies((gekozen - 1 + n) % n); }
  };
  return <div className='ut-rv-bestanden'>
    <div className='ut-rv-best-kop'>
      <span className='ut-rv-best-icoon' aria-hidden='true'><FileCode2 />{ext && <em>{ext}</em>}</span>
      <span className='ut-rv-best-naam'><b title={pad}>{naam}</b><small>{map && <><code>{map}</code><span className='ut-rv-best-scheid'> · </span></>}{tr(lang, `файл ${gekozen + 1} з ${n}`, `bestand ${gekozen + 1} van ${n}`)}</small></span>
      <span className='ut-rv-best-nav'>
        <button type='button' onClick={() => kies((gekozen - 1 + n) % n)} aria-label={tr(lang, 'Попередній файл', 'Vorig bestand')} title={tr(lang, 'Попередній файл групи: пояснення нижче зміниться під нього', 'Vorig bestand van de groep: de uitleg hieronder volgt mee')}><ChevronLeft aria-hidden='true' /></button>
        <button type='button' onClick={() => kies((gekozen + 1) % n)} aria-label={tr(lang, 'Наступний файл', 'Volgend bestand')} title={tr(lang, 'Наступний файл групи: пояснення нижче зміниться під нього', 'Volgend bestand van de groep: de uitleg hieronder volgt mee')}><ChevronRight aria-hidden='true' /></button>
        <button type='button' className='ut-rv-best-alles' aria-expanded={alles} aria-controls={lijstId} onClick={() => setAlles(!alles)}
          title={alles ? tr(lang, 'Згорнути список файлів', 'Bestandenlijst inklappen') : tr(lang, 'Показати всі файли групи списком: тека, кількість змінених рядків; натиск на файл показує його пояснення', 'Alle bestanden van de groep als lijst: map en gewijzigde regels; klik toont de uitleg van dat bestand')}>
          <List aria-hidden='true' /><span>{tr(lang, `Усі ${n}`, `Alle ${n}`)}</span><ChevronDown aria-hidden='true' className='ut-rv-best-alles-pijl' /></button>
      </span>
    </div>
    <div className='ut-rv-best-strook' role='tablist' aria-label={tr(lang, 'Файли групи', 'Bestanden van de groep')} ref={strook} onKeyDown={toets}>
      {paden.map((p, i) => <button key={i} type='button' role='tab' aria-selected={i === gekozen} tabIndex={i === gekozen ? 0 : -1} title={p} onClick={() => kies(i)}>
        <span className='ut-rv-best-nr'>{i + 1}</span>{kort(p)}</button>)}
    </div>
    {/* Повний список (власник 16.11.2026: «рядок лишається, але має також розгортатися»). Volledige lijst, stroken blijft staan. */}
    {alles && <ol className='ut-rv-best-lijst' id={lijstId} data-een-map={eenMap || undefined}>{paden.map((p, i) => { const { plus, min } = telRegels(verschillen[i]);
      const nm = p.split('/').pop() || p; const mp = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      return <li key={i}><button type='button' aria-current={i === gekozen || undefined} onClick={() => kies(i)} title={tr(lang, 'Показати пояснення цього файлу нижче', 'De uitleg van dit bestand hieronder tonen')}>
        <span className='ut-rv-best-nr'>{i + 1}</span>
        <span className='ut-rv-best-lijst-naam'><b>{nm}</b>{mp && !eenMap && <small>{mp}</small>}</span>
        {(plus || min) ? <span className='ut-rv-best-lijst-tel'><span data-r='+'>+{plus}</span><span data-r='-'>−{min}</span></span> : null}
        {i === gekozen ? <Eye aria-hidden='true' className='ut-rv-best-oog' /> : <ChevronRight aria-hidden='true' className='ut-rv-best-oog' />}
      </button></li>; })}</ol>}
  </div>;
}

/** Одна картка: піктограма виду, коротке речення, шлях, шкала змін, висновок. Група = кілька однакових змін в одній картці. */
function Kaart({ groep, lang }: { groep: RisicoItemUit[]; lang: Lang }) {
  const [open, setOpen] = useState(false); const [gekozen, setGekozen] = useState(0);
  const it = groep[Math.min(gekozen, groep.length - 1)]; const eerste = groep[0];
  const s = SOORT[soortVan(eerste)]; const o = OORDEEL[oordeelVan(eerste)]; const OIcoon = o.icoon; const SIcoon = s.icoon;
  const t = (x: { uk: string; nl: string }) => (lang === 'uk' ? x.uk : x.nl);
  const blok = groep.some(zonderUitleg); const heeftUitleg = !!(eerste.leesbaar || t(eerste.wat) || eerste.verschil);
  const titel = eerste.leesbaar ? t(eerste.leesbaar.kort) : padVan(eerste);
  const verschilSom = groep.length > 1 ? groep.map((g) => g.verschil ?? '').join('\n') : eerste.verschil;
  return <li className='ut-rv-kaart' data-open={open || undefined} data-oordeel={oordeelVan(eerste)} data-blok={blok || undefined}>
    <button type='button' className='ut-rv-rij' aria-expanded={open} disabled={!heeftUitleg} onClick={() => setOpen(!open)} title={tr(lang, s.tipUk, s.tipNl)}>
      <span className='ut-rv-icoon' data-o={blok ? 'let' : o.o}><SIcoon aria-hidden='true' />{groep.length > 1 && <em>×{groep.length}</em>}</span>
      <span className='ut-rv-kort'>
        <span>{titel}{groep.length > 1 && <em className='ut-rv-aantal'>{tr(lang, `${groep.length} файлів`, `${groep.length} bestanden`)}</em>}</span>
        <small><code>{groep.length > 1 ? groep.map(padVan).map((p) => p.replace(/^[+~−]\s+/, '').split('/').pop()).join(' · ') : padVan(eerste)}</code></small>
      </span>
      <span className='ut-rv-rechts'>
        <Schaal verschil={verschilSom} lang={lang} />
        <span className='ut-rv-oordeel' data-o={blok ? 'let' : o.o}>{blok ? <Lock aria-hidden='true' /> : <OIcoon aria-hidden='true' />}{blok ? tr(lang, 'Без пояснення', 'Zonder uitleg') : tr(lang, o.uk, o.nl)}</span>
        {heeftUitleg && <ChevronDown aria-hidden='true' className='ut-rv-pijl' />}
      </span>
    </button>
    {open && <>
      {groep.length > 1 && <Bestanden lang={lang} paden={groep.map((g) => padVan(g).replace(/^[+~−]\s+/, ''))} verschillen={groep.map((g) => g.verschil)} gekozen={gekozen} kies={setGekozen} />}
      <Uitleg it={it} lang={lang} />
    </>}
  </li>;
}

/** Однакові зміни одного виду з однаковим висновком і реченням (наприклад, 9 процесів GitHub, що стали безпечнішими) — одна картка. */
function groepeer(lijst: RisicoItemUit[]): RisicoItemUit[][] {
  const uit: RisicoItemUit[][] = []; const per = new Map<string, RisicoItemUit[]>();
  for (const it of lijst) {
    const sleutel = it.leesbaar && oordeelVan(it) !== 'aandacht' && !zonderUitleg(it) ? `${soortVan(it)}|${oordeelVan(it)}|${it.leesbaar.kort.uk}` : '';
    if (!sleutel) { uit.push([it]); continue; }
    const g = per.get(sleutel); if (g) g.push(it); else { const n = [it]; per.set(sleutel, n); uit.push(n); }
  }
  return uit;
}

export default function RodeVlaggen({ lang, vlaggen, bevestigd, onBevestig, id, disabled }: { lang: Lang; vlaggen: RisicoItemUit[]; bevestigd: boolean; onBevestig: (b: boolean) => void; id: string; disabled?: boolean }) {
  const [filter, setFilter] = useState('');
  const n = (o: string) => vlaggen.filter((v) => oordeelVan(v) === o).length;
  const a = n('aandacht'); const g = n('gewoon'); const v = n('veiliger');
  const zonder = vlaggen.filter(zonderUitleg).length;
  const soorten = useMemo(() => {
    const m = new Map<string, RisicoItemUit[]>();
    for (const it of vlaggen) { const k = soortVan(it); m.set(k, [...(m.get(k) ?? []), it]); }
    return [...m.entries()];
  }, [vlaggen]);
  const zichtbaar = [...vlaggen].filter((it) => !filter || soortVan(it) === filter)
    .sort((x, y) => Number(zonderUitleg(y)) - Number(zonderUitleg(x)) || RANG[oordeelVan(x)] - RANG[oordeelVan(y)]);
  const staat = zonder ? 'blok' : a ? 'let' : 'ok';
  const StaatIcoon = zonder ? Lock : a ? ShieldAlert : ShieldCheck;
  return <div className='ut-rode-vlaggen' role='group' aria-labelledby={`rv-kop-${id}`} data-ut-rode-vlaggen data-staat={staat} data-bevestigd={bevestigd || undefined}>
    <div className='ut-rv-held'>
      <Ring a={a} g={g} v={v} lang={lang} />
      <div className='ut-rv-held-tekst'>
        <p className='ut-rv-kop' id={`rv-kop-${id}`}><StaatIcoon aria-hidden='true' /><b>{zonder
          ? tr(lang, 'Встановлення заблоковано', 'Installatie geblokkeerd')
          : a ? tr(lang, 'Потрібне ваше рішення', 'Uw beslissing is nodig') : tr(lang, 'Підозрілого не знайдено', 'Niets verdachts gevonden')}</b></p>
        <p className='ut-rv-staat'>{zonder
          ? tr(lang, `Автор не пояснив ${zonder === 1 ? '1 зміну, яка потребує' : `${zonder} змін, які потребують`} уваги. Без пояснень цей пакет не встановити — попросіть автора дописати їх у досьє випуску.`, `De maker heeft ${zonder} wijziging(en) die aandacht vragen niet uitgelegd. Zonder uitleg is dit pakket niet te installeren — vraag de maker die in het releasedossier te zetten.`)
          : a ? tr(lang, 'Відкрийте картки з червоною позначкою: у кожній є пояснення автора і що робити. Якщо сумніваєтеся — «Відхилити», нічого не зламається.', 'Open de kaarten met een rode markering: bij elk staat de uitleg van de maker en wat te doen. Twijfelt u, kies «Afwijzen» — er gaat niets stuk.')
            : tr(lang, 'Можна схвалювати, якщо ви очікували це оновлення.', 'U kunt goedkeuren als u deze update verwachtte.')}</p>
        <p className='ut-rv-tellers'>
          {a > 0 && <span data-o='let'><AlertTriangle aria-hidden='true' />{tr(lang, `Уваги: ${a}`, `Aandacht: ${a}`)}</span>}
          {g > 0 && <span data-o='gewoon'><Info aria-hidden='true' />{tr(lang, `Звичайні: ${g}`, `Gewoon: ${g}`)}</span>}
          {v > 0 && <span data-o='ok'><CheckCircle2 aria-hidden='true' />{tr(lang, `Безпечніше: ${v}`, `Veiliger: ${v}`)}</span>}
        </p>
      </div>
    </div>
    <div className='ut-rv-soorten' role='toolbar' aria-label={tr(lang, 'Де саме зміни', 'Waar de wijzigingen zitten')}>
      <button type='button' aria-pressed={!filter} onClick={() => setFilter('')} title={tr(lang, 'Показати всі зміни', 'Alle wijzigingen tonen')}><Layers aria-hidden='true' /><span>{tr(lang, 'Усі', 'Alle')}</span><b>{vlaggen.length}</b></button>
      {soorten.map(([k, lijst]) => { const S = SOORT[k]; const I = S.icoon; const lt = lijst.some((x) => oordeelVan(x) === 'aandacht');
        return <button key={k} type='button' aria-pressed={filter === k} data-o={lt ? 'let' : 'ok'} onClick={() => setFilter(filter === k ? '' : k)} title={tr(lang, S.tipUk, S.tipNl)}>
          {k === 'CI' ? <Github aria-hidden='true' /> : <I aria-hidden='true' />}<span>{tr(lang, S.uk, S.nl)}</span><b>{lijst.length}</b></button>; })}
    </div>
    <ul className='ut-rv-lijst'>{groepeer(zichtbaar).map((gr, i) => <Kaart key={`${filter}-${i}`} groep={gr} lang={lang} />)}</ul>
    {zonder ? <p className='ut-rv-geblokkeerd'><Lock aria-hidden='true' />{tr(lang, 'Схвалення недоступне, доки автор не пояснить усі позначені зміни.', 'Goedkeuren kan pas als de maker alle gemarkeerde wijzigingen heeft uitgelegd.')}</p>
      : <label className='ut-rv-bevestig' title={tr(lang, 'Без цієї позначки сервер не прийме схвалення. Якщо ви не очікували таких змін — відхиліть пакет: можливо, хтось отримав доступ до GitHub.', 'Zonder dit vinkje neemt de server de goedkeuring niet aan. Verwachtte u deze wijzigingen niet, wijs het pakket dan af: misschien heeft iemand toegang tot GitHub gekregen.')}>
        <input data-hulp='uitrol.risico-bevestig' type='checkbox' checked={bevestigd} disabled={disabled} onChange={(e) => onBevestig(e.target.checked)} />
        <Flag aria-hidden='true' /><span>{tr(lang, 'Я переглянув ці зміни й очікував їх', 'Ik heb deze wijzigingen bekeken en verwachtte ze')}</span> <HulpVraag k='uitrol.risico-bevestig' lang={lang} />
      </label>}
  </div>;
}
