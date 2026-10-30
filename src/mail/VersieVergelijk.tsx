// Venster «Порівняти версії» (pakket 3 «Adaptive Mail Canvas», 24.10.2026). Макет: «вкладення: група версій одного документа
// (v3/v2/v1) · Порівняти». Twee versies uit de groep (src/mail/gesprek-context.ts → bijlageVersies), tekst eruit
// (src/mail/bijlage-tekst.ts) en een leesbaar verschil per alinea/zin met gemarkeerde woorden (src/mail/tekst-verschil.ts).
// Eerlijk: alleen tekst; onleesbaar formaat, scan zonder tekst, fout en «gelijk» elk met een eigen melding — nooit een verzonnen
// uitkomst. Modaal (portal in <body>): focus erin en terug, Tab blijft binnen, Escape sluit (capture op window + stopPropagation,
// zodat de lezer erachter niet ook sluit); data-versie-vergelijk laat de lezer de laag herkennen (ANDERE_LAGEN in LeesVenster).
// Getoetst in tests/eenheid/versie-vergelijk-20261024.test.ts.
import { ArrowRight, Check, FileWarning, Info, LoaderCircle, X } from 'lucide-react';
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { loadMailAttachmentBlob, MAIL_ATTACHMENT_PREVIEW_MAX_BYTES } from '../mail-bijlage-lader';
import { focusbaar, focusTerug, houdTab } from '../platform/toegankelijk';
import { bijlageSoort, bijlageTekst, PDF_MAX_PAGINAS, type BijlageTekst } from './bijlage-tekst';
import { adresVan, naamVan, type VersieGroep, type VersieItem } from './gesprek-context';
import { vergelijkTeksten, type VerschilRij, type VerschilUitkomst, type VerschilWoord } from './tekst-verschil';
import './versie-vergelijk.css';

type Lang = 'uk' | 'nl';
export type VersieVergelijkProps = {
  lang: Lang;
  /** Account en cache van het gesprek (bijlagen lezen), zoals ContextPaneel ze krijgt. */
  bron: { context: Record<string, string>; accountId: string; cacheAccountId: string };
  groep: VersieGroep;
  onSluit: () => void;
};
export type VergelijkStand =
  | { soort: 'laden' }
  | { soort: 'zelfde' }
  | { soort: 'fout'; welke: number; code: string }
  | { soort: 'onleesbaar'; welke: number[] }
  | { soort: 'leeg'; welke: number[]; oud: BijlageTekst; nieuw: BijlageTekst }
  | { soort: 'klaar'; uitkomst: VerschilUitkomst; oud: BijlageTekst; nieuw: BijlageTekst };

/** Grotere bijlagen vergelijken we hier niet (zelfde grens als het voorbeeld); de bestanden zelf blijven te openen. */
export const VERGELIJK_MAX_BYTES = MAIL_ATTACHMENT_PREVIEW_MAX_BYTES;
const STAP = 150; // rijen per keer op het scherm

// ------------------------------------------------------------------ teksten
const ukMeervoud = (n: number, [een, paar, veel]: [string, string, string]) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? een : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? paar : veel;
};
function wanneer(ms: number, lang: Lang): string {
  if (!(ms > 0)) return '';
  const d = new Date(ms), ditJaar = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'short', ...(ditJaar ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' });
}
/** «v2 · 23 жовт., 19:15 · Pavlo» */
export function versieLabel(it: VersieItem, lang: Lang): string {
  return [`v${it.nummer}`, wanneer(it.wanneer, lang), naamVan(it.van) || adresVan(it.van)].filter(Boolean).join(' · ');
}
/** Eén keuze per versie (een ongewijzigd doorgestuurd bestand heeft hetzelfde nummer: de eerste brief telt), oudste eerst. */
export function versiesVan(groep: VersieGroep): VersieItem[] {
  const per = new Map<number, VersieItem>();
  for (const it of groep.items) { const al = per.get(it.nummer); if (!al || it.wanneer < al.wanneer) per.set(it.nummer, it); }
  return [...per.values()].sort((a, b) => a.nummer - b.nummer);
}
/** Standaard: de vorige tegenover de laatste versie. */
export function standaardKeuze(versies: VersieItem[]): { oud: number; nieuw: number } {
  const laatste = versies[versies.length - 1]?.nummer ?? 0;
  return { oud: versies.length > 1 ? versies[versies.length - 2].nummer : laatste, nieuw: laatste };
}
/** «Змінено 2 абзаци · додано 1 · прибрано 0» (verplaatste alinea's apart: die zijn niet geschrapt). */
export function samenvatting(rijen: VerschilRij[], lang: Lang): string {
  let gewijzigd = 0, weg = 0, nieuw = 0, verplaatst = 0;
  for (const r of rijen) {
    if (r.soort === 'gewijzigd') gewijzigd++;
    else if (r.soort === 'weg') { if (typeof r.verplaatst === 'number') verplaatst++; else weg++; }
    else if (r.soort === 'nieuw' && typeof r.verplaatst !== 'number') nieuw++;
  }
  if (lang === 'uk') return `Змінено ${gewijzigd} ${ukMeervoud(gewijzigd, ['абзац', 'абзаци', 'абзаців'])} · додано ${nieuw} · прибрано ${weg}${verplaatst ? ` · перенесено ${verplaatst}` : ''}`;
  return `${gewijzigd} ${gewijzigd === 1 ? 'alinea' : "alinea's"} gewijzigd · ${nieuw} toegevoegd · ${weg} verwijderd${verplaatst ? ` · ${verplaatst} verplaatst` : ''}`;
}
function foutTekst(code: string, nr: number, lang: Lang): { tekst: string; opnieuw: boolean } {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (code === 'MAIL_ATTACHMENT_PREVIEW_TOO_LARGE') {
    const mb = Math.round(VERGELIJK_MAX_BYTES / 1048576);
    return { tekst: t(`Версія v${nr} завелика для порівняння тут (понад ${mb} МБ). Відкрийте обидві версії.`, `Versie v${nr} is te groot om hier te vergelijken (meer dan ${mb} MB). Open beide versies.`), opnieuw: false };
  }
  if (code === 'DOCUMENT_RICH_TOO_LARGE') {
    return { tekst: t(`Документ версії v${nr} завеликий, щоб прочитати його тут. Відкрийте обидві версії.`, `Het document van versie v${nr} is te groot om hier te lezen. Open beide versies.`), opnieuw: false };
  }
  if (code === 'PDF_WACHTWOORD') {
    return { tekst: t(`PDF версії v${nr} захищено паролем — текст прочитати не вдається. Відкрийте обидві версії.`, `De pdf van versie v${nr} is met een wachtwoord beveiligd — de tekst kan niet worden gelezen. Open beide versies.`), opnieuw: false };
  }
  if (code === 'PDF_ONGELDIG') {
    return { tekst: t(`Файл версії v${nr} не є коректним PDF — текст прочитати не вдається.`, `Het bestand van versie v${nr} is geen geldige pdf — de tekst kan niet worden gelezen.`), opnieuw: false };
  }
  return { tekst: t(`Не вдалося завантажити або прочитати версію v${nr}.`, `Versie v${nr} kon niet worden geladen of gelezen.`), opnieuw: true };
}

// ------------------------------------------------------------------ tekst per versie (één keer per bijlage, zolang de pagina open is)
const TEKSTEN = new Map<string, Promise<BijlageTekst>>();
const MAX_ONTHOUDEN = 8;
function leesVersie(bron: VersieVergelijkProps['bron'], it: VersieItem): Promise<BijlageTekst> {
  const sleutel = `${bron.cacheAccountId || bron.accountId}\u001f${it.berichtId}\u001f${it.bijlage.providerAttachmentId}`;
  const al = TEKSTEN.get(sleutel);
  if (al) return al;
  const taak = (async (): Promise<BijlageTekst> => {
    // een formaat zonder lezer hoeft niet eens gedownload te worden
    if (bijlageSoort(it.bijlage.contentType, it.bijlage.filename) === 'onbekend') return { tekst: '', soort: 'onbekend', afgekapt: false };
    const r = await loadMailAttachmentBlob({ context: bron.context, accountId: bron.accountId, cacheAccountId: bron.cacheAccountId, messageId: it.berichtId, item: it.bijlage, maxBytes: VERGELIJK_MAX_BYTES });
    return bijlageTekst(r.blob, it.bijlage.contentType || r.contentType, it.bijlage.filename);
  })();
  TEKSTEN.set(sleutel, taak);
  taak.catch(() => TEKSTEN.delete(sleutel));
  while (TEKSTEN.size > MAX_ONTHOUDEN) { const oudste = TEKSTEN.keys().next().value; if (oudste === undefined) break; TEKSTEN.delete(oudste); }
  return taak;
}

// ------------------------------------------------------------------ verschil (presentatie, ook los te tonen en te toetsen)
type Groep = { soort: 'gelijk'; van: number; tot: number } | { soort: 'rij'; index: number };
function groeperen(rijen: VerschilRij[]): Groep[] {
  const uit: Groep[] = [];
  rijen.forEach((r, i) => {
    const vorige = uit[uit.length - 1];
    if (r.soort !== 'gelijk') uit.push({ soort: 'rij', index: i });
    else if (vorige?.soort === 'gelijk' && vorige.tot === i) vorige.tot = i + 1;
    else uit.push({ soort: 'gelijk', van: i, tot: i + 1 });
  });
  return uit;
}
function woordenNaar(woorden: VerschilWoord[], kant: 'oud' | 'nieuw', lang: Lang): ReactNode[] {
  const delen: ReactNode[] = [];
  woorden.forEach((w, i) => {
    if (w.soort === (kant === 'oud' ? 'nieuw' : 'weg')) return;
    if (delen.length) delen.push(' ');
    if (w.soort === 'gelijk') delen.push(kant === 'oud' ? (w.oud ?? w.tekst) : w.tekst);
    else if (w.soort === 'weg') delen.push(<Fragment key={i}><span className='vv-sr'>{lang === 'uk' ? 'прибрано: ' : 'verwijderd: '}</span><del>{w.tekst}</del></Fragment>);
    else delen.push(<Fragment key={i}><span className='vv-sr'>{lang === 'uk' ? 'додано: ' : 'toegevoegd: '}</span><ins>{w.tekst}</ins></Fragment>);
  });
  return delen;
}
function RijWeergave({ rij, index, lang, oudLabel, nieuwLabel }: { rij: VerschilRij; index: number; lang: Lang; oudLabel: string; nieuwLabel: string }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const verplaatst = typeof rij.verplaatst === 'number', lager = verplaatst && (rij.verplaatst as number) > index;
  const soortTekst = rij.soort === 'gewijzigd' ? t('Змінений абзац', 'Gewijzigde alinea')
    : rij.soort === 'weg' ? (verplaatst ? (lager ? t('Абзац перенесено нижче', 'Alinea naar beneden verplaatst') : t('Абзац перенесено вище', 'Alinea naar boven verplaatst')) : t('Прибраний абзац', 'Verwijderde alinea'))
      : rij.soort === 'nieuw' ? (verplaatst ? (lager ? t('Перенесений абзац (був нижче)', 'Verplaatste alinea (stond lager)') : t('Перенесений абзац (був вище)', 'Verplaatste alinea (stond hoger)')) : t('Доданий абзац', 'Toegevoegde alinea'))
        : t('Без змін', 'Ongewijzigd');
  const oud = rij.soort === 'gewijzigd' && rij.woorden ? woordenNaar(rij.woorden, 'oud', lang) : rij.soort === 'weg' && !verplaatst ? <del>{rij.oud}</del> : rij.oud;
  const nieuw = rij.soort === 'gewijzigd' && rij.woorden ? woordenNaar(rij.woorden, 'nieuw', lang) : rij.soort === 'nieuw' && !verplaatst ? <ins>{rij.nieuw}</ins> : rij.nieuw;
  return (
    <li className='vv-rij' data-soort={rij.soort} data-verplaatst={verplaatst ? 'ja' : undefined}>
      <span className={verplaatst ? 'vv-merk' : 'vv-sr'}>{soortTekst}</span>
      <div className='vv-kant' data-kant='oud' data-leeg={rij.soort === 'nieuw' ? 'ja' : undefined}>
        <span className='vv-kant-label'>{oudLabel}</span>
        {rij.soort === 'nieuw' ? <p className='vv-leeg' aria-hidden='true'>{t('— немає в цій версії', '— niet in deze versie')}</p> : <p className='vv-tekst'>{oud}</p>}
      </div>
      <div className='vv-kant' data-kant='nieuw' data-leeg={rij.soort === 'weg' ? 'ja' : undefined}>
        <span className='vv-kant-label'>{nieuwLabel}</span>
        {rij.soort === 'weg' ? <p className='vv-leeg' aria-hidden='true'>{t('— немає в цій версії', '— niet in deze versie')}</p> : <p className='vv-tekst'>{nieuw}</p>}
      </div>
    </li>
  );
}

/** De rijen van een vergelijking: samenvatting, legenda, kolomkoppen (breed) en de rijen; ongewijzigde alinea's ingeklapt
 *  («N незмінних абзаців — показати»), hoogstens 150 rijen per keer. */
export function VerschilWeergave({ lang, rijen, oudLabel, nieuwLabel }: { lang: Lang; rijen: VerschilRij[]; oudLabel: string; nieuwLabel: string }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const [alles, setAlles] = useState(false);
  const [limiet, setLimiet] = useState(STAP);
  const groepen = useMemo(() => groeperen(rijen), [rijen]);
  const heeftGelijk = groepen.some((g) => g.soort === 'gelijk'), heeftVerplaatst = rijen.some((r) => typeof r.verplaatst === 'number');
  const wissel = (van: number) => setOpen((s) => { const n = new Set(s); if (n.has(van)) n.delete(van); else n.add(van); return n; });
  const items: ReactNode[] = [];
  let getoond = 0, meer = false;
  for (const g of groepen) {
    if (getoond >= limiet) { meer = true; break; }
    if (g.soort === 'rij') { items.push(<RijWeergave key={`r${g.index}`} rij={rijen[g.index]} index={g.index} lang={lang} oudLabel={oudLabel} nieuwLabel={nieuwLabel} />); getoond++; continue; }
    const n = g.tot - g.van, isOpen = alles || open.has(g.van);
    if (!alles) {
      const tekst = lang === 'uk' ? `${n} ${ukMeervoud(n, ['незмінний абзац', 'незмінні абзаци', 'незмінних абзаців'])} — ${isOpen ? 'сховати' : 'показати'}`
        : `${n} ${n === 1 ? 'ongewijzigde alinea' : "ongewijzigde alinea's"} — ${isOpen ? 'verbergen' : 'tonen'}`;
      items.push(<li key={`g${g.van}`} className='vv-ingeklapt'><button type='button' aria-expanded={isOpen} onClick={() => wissel(g.van)}>{tekst}</button></li>);
      getoond++;
    }
    if (!isOpen) continue;
    for (let i = g.van; i < g.tot; i++) {
      if (getoond >= limiet) { meer = true; break; }
      items.push(<RijWeergave key={`r${i}`} rij={rijen[i]} index={i} lang={lang} oudLabel={oudLabel} nieuwLabel={nieuwLabel} />);
      getoond++;
    }
    if (meer) break;
  }
  return (
    <div className='vv-verschil'>
      <div className='vv-overzicht'>
        <p className='vv-samenvatting' role='status'>{samenvatting(rijen, lang)}</p>
        <ul className='vv-legenda' aria-label={t('Позначення', 'Legenda')}>
          <li><span className='vv-weg'>{t('прибрано', 'verwijderd')}</span></li>
          <li><span className='vv-nieuw'>{t('додано', 'toegevoegd')}</span></li>
          <li><span className='vv-staal' data-soort='gewijzigd' aria-hidden='true' />{t('змінений абзац', 'gewijzigde alinea')}</li>
          {heeftVerplaatst && <li><span className='vv-staal' data-soort='verplaatst' aria-hidden='true' />{t('перенесено', 'verplaatst')}</li>}
        </ul>
        {heeftGelijk && <button type='button' className='vv-knop' aria-pressed={alles} onClick={() => setAlles((a) => !a)}>{t('Показати незмінні', 'Ongewijzigde tonen')}</button>}
      </div>
      <div className='vv-kolommen' aria-hidden='true'><span title={oudLabel}>{oudLabel}</span><span title={nieuwLabel}>{nieuwLabel}</span></div>
      <ol className='vv-rijen'>{items}</ol>
      {meer && <div className='vv-meer'><button type='button' className='vv-knop' onClick={() => setLimiet((l) => l + STAP)}>{t('Показати ще', 'Meer tonen')}</button></div>}
    </div>
  );
}

// ------------------------------------------------------------------ venster (presentatie, zonder portal)
export type VersieVergelijkLaagProps = {
  lang: Lang; titel: string; versies: VersieItem[]; oudNummer: number; nieuwNummer: number; stand: VergelijkStand;
  onKies: (kant: 'oud' | 'nieuw', nummer: number) => void; onSluit: () => void; onOpnieuw: () => void;
  laagRef?: RefObject<HTMLDivElement | null>; vensterRef?: RefObject<HTMLDivElement | null>;
};
export function VersieVergelijkLaag(p: VersieVergelijkLaagProps) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const kopId = useId(), nootId = useId();
  const oud = p.versies.find((v) => v.nummer === p.oudNummer), nieuw = p.versies.find((v) => v.nummer === p.nieuwNummer);
  const oudLabel = oud ? versieLabel(oud, p.lang) : '', nieuwLabel = nieuw ? versieLabel(nieuw, p.lang) : '';
  // React-gebeurtenissen lopen door een portal heen naar de lezer en het contextpaneel: hier stoppen (zoals AfzenderDialoog)
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const tabToets = (e: ReactKeyboardEvent<HTMLDivElement>) => { const v = p.vensterRef?.current; if (e.key === 'Tab' && v) houdTab(e, focusbaar(v), { houder: v }); };
  const opties = p.versies.map((v) => <option key={v.nummer} value={v.nummer}>{versieLabel(v, p.lang)}</option>);
  const nummers = (l: number[]) => l.map((n) => `v${n}`).join(p.lang === 'uk' ? ' і ' : ' en ');
  const sluitKnop = <div className='vv-knoppen'><button type='button' className='vv-knop' onClick={p.onSluit}>{t('Закрити', 'Sluiten')}</button></div>;

  let inhoud: ReactNode = null;
  const s = p.stand;
  if (s.soort === 'laden') inhoud = <p className='vv-laden' role='status'><LoaderCircle aria-hidden='true' />{t('Завантажуємо й читаємо обидві версії…', 'Beide versies laden en lezen…')}</p>;
  else if (s.soort === 'zelfde') inhoud = <div className='vv-melding' role='status'><Info aria-hidden='true' /><div><p>{t('Виберіть дві різні версії.', 'Kies twee verschillende versies.')}</p></div></div>;
  else if (s.soort === 'fout') {
    const f = foutTekst(s.code, s.welke, p.lang);
    inhoud = (
      <div className='vv-melding' data-soort='fout' role='alert'><FileWarning aria-hidden='true' />
        <div><p>{f.tekst}</p>{f.opnieuw ? <div className='vv-knoppen'><button type='button' className='vv-knop' onClick={p.onOpnieuw}>{t('Спробувати ще раз', 'Opnieuw proberen')}</button></div> : sluitKnop}</div>
      </div>
    );
  } else if (s.soort === 'onleesbaar') {
    inhoud = (
      <div className='vv-melding' data-soort='let' role='status'><FileWarning aria-hidden='true' />
        <div><p>{t('Цей формат не вдається прочитати як текст — порівняння недоступне. Відкрийте обидві версії.', 'Dit formaat kan niet als tekst worden gelezen — vergelijken is niet mogelijk. Open beide versies.')}</p>{sluitKnop}</div>
      </div>
    );
  } else if (s.soort === 'leeg') {
    inhoud = (
      <div className='vv-melding' data-soort='let' role='status'><FileWarning aria-hidden='true' />
        <div><p>{s.welke.length > 1
          ? t(`У версіях ${nummers(s.welke)} немає тексту, який можна прочитати (можливо, це скани або порожні файли), — порівняння недоступне. Відкрийте обидві версії.`, `De versies ${nummers(s.welke)} bevatten geen leesbare tekst (misschien scans of lege bestanden) — vergelijken is niet mogelijk. Open beide versies.`)
          : t(`У версії ${nummers(s.welke)} немає тексту, який можна прочитати (можливо, це скан або порожній файл), — порівняння недоступне. Відкрийте обидві версії.`, `Versie ${nummers(s.welke)} bevat geen leesbare tekst (misschien een scan of een leeg bestand) — vergelijken is niet mogelijk. Open beide versies.`)}</p>{sluitKnop}</div>
      </div>
    );
  } else if (s.uitkomst.rijen.every((r) => r.soort === 'gelijk')) {
    inhoud = (
      <div className='vv-melding' data-soort='ok' role='status'><Check aria-hidden='true' />
        <div><p>{s.uitkomst.afgekapt || s.oud.afgekapt || s.nieuw.afgekapt
          ? t('У порівняній частині текст однаковий; решту не порівнювали — документ завеликий.', 'In het vergeleken deel is de tekst gelijk; de rest is niet vergeleken — het document is te groot.')
          : t('Текст версій однаковий.', 'De tekst van beide versies is gelijk.')}</p></div>
      </div>
    );
  } else inhoud = <VerschilWeergave lang={p.lang} rijen={s.uitkomst.rijen} oudLabel={oudLabel} nieuwLabel={nieuwLabel} />;

  const noten: ReactNode[] = [];
  if (s.soort === 'klaar' || s.soort === 'leeg') {
    const delen: Array<[number, BijlageTekst]> = [[p.oudNummer, s.oud], [p.nieuwNummer, s.nieuw]];
    noten.push(<p key='typo'>{delen.some(([, x]) => x.soort === 'pdf')
      ? t('У PDF пропущено колонтитули й номери сторінок. Різні лапки, тире й пробіли вважаються однаковими.', 'In een pdf worden kop- en voetteksten en paginanummers overgeslagen. Verschillende aanhalingstekens, streepjes en spaties tellen als gelijk.')
      : t('Різні лапки, тире й пробіли вважаються однаковими.', 'Verschillende aanhalingstekens, streepjes en spaties tellen als gelijk.')}</p>);
    for (const [nr, x] of delen) if (x.afgekapt) {
      noten.push(<p key={`af${nr}`} data-soort='let'>{x.soort === 'pdf'
        ? t(`Версія v${nr}: прочитано перші ${PDF_MAX_PAGINAS} з ${x.paginas ?? '?'} сторінок.`, `Versie v${nr}: de eerste ${PDF_MAX_PAGINAS} van ${x.paginas ?? '?'} pagina's gelezen.`)
        : t(`Версія v${nr}: прочитано лише перші 2 МБ тексту.`, `Versie v${nr}: alleen de eerste 2 MB tekst gelezen.`)}</p>);
    }
    if (s.soort === 'klaar' && s.uitkomst.afgekapt) {
      noten.push(<p key='groot' data-soort='let'>{t('Документ дуже великий: порівняно не все — частину відмінностей показано без виділення слів або не показано.', 'Zeer groot document: niet alles is vergeleken — een deel van de verschillen staat er zonder gemarkeerde woorden of ontbreekt.')}</p>);
    }
  }

  return (
    <div
      ref={p.laagRef} className='vv-laag' data-versie-vergelijk=''
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) p.onSluit(); }}
      onClick={stop} onPointerDown={stop} onTouchStart={stop} onKeyDown={stop} onKeyUp={stop}
    >
      <div ref={p.vensterRef} className='vv-venster' role='dialog' aria-modal='true' aria-labelledby={kopId} aria-describedby={nootId} tabIndex={-1} onKeyDown={tabToets}>
        <header className='vv-kop'>
          <div className='vv-titel'>
            <h2 id={kopId}>{t('Порівняння версій', 'Versies vergelijken')}</h2>
            <p>{p.titel}</p>
          </div>
          <button type='button' className='vv-sluit' aria-label={t('Закрити порівняння', 'Vergelijking sluiten')} title={t('Закрити', 'Sluiten')} onClick={p.onSluit}><X aria-hidden='true' /></button>
        </header>
        <div className='vv-keuze'>
          <label className='vv-veld'>
            <span>{t('Старіша версія', 'Oudere versie')}</span>
            <select value={p.oudNummer} onChange={(e) => p.onKies('oud', Number(e.currentTarget.value))}>{opties}</select>
          </label>
          <ArrowRight className='vv-pijl' aria-hidden='true' />
          <label className='vv-veld'>
            <span>{t('Новіша версія', 'Nieuwere versie')}</span>
            <select value={p.nieuwNummer} onChange={(e) => p.onKies('nieuw', Number(e.currentTarget.value))}>{opties}</select>
          </label>
        </div>
        <div className='vv-inhoud'>{inhoud}</div>
        <footer className='vv-voet'>
          <p id={nootId}><Info aria-hidden='true' />{t('Порівнюється лише текст: форматування, підписи, печатки й зображення не порівнюються.', 'Alleen de tekst wordt vergeleken: opmaak, handtekeningen, stempels en afbeeldingen niet.')}</p>
          {noten}
        </footer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ het venster zelf
export default function VersieVergelijk(p: VersieVergelijkProps) {
  const versies = useMemo(() => versiesVan(p.groep), [p.groep]);
  const [keuze, setKeuze] = useState(() => standaardKeuze(versies));
  const [poging, setPoging] = useState(0);
  const [stand, setStand] = useState<VergelijkStand>({ soort: 'laden' });
  const laagRef = useRef<HTMLDivElement | null>(null), vensterRef = useRef<HTMLDivElement | null>(null);
  const sluitRef = useRef(p.onSluit);
  useEffect(() => { sluitRef.current = p.onSluit; }, [p.onSluit]);
  const oud = versies.find((v) => v.nummer === keuze.oud), nieuw = versies.find((v) => v.nummer === keuze.nieuw);
  const oudSleutel = oud ? `${oud.nummer}:${oud.berichtId}:${oud.bijlage.providerAttachmentId}` : '';
  const nieuwSleutel = nieuw ? `${nieuw.nummer}:${nieuw.berichtId}:${nieuw.bijlage.providerAttachmentId}` : '';

  // focus naar het venster bij openen, terug naar wie het opende bij sluiten (niet als de focus intussen elders staat)
  useLayoutEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const laag = laagRef.current;
    vensterRef.current?.focus({ preventScroll: true });
    return () => {
      const actief = document.activeElement;
      if (!actief || actief === document.body || !actief.isConnected || laag?.contains(actief)) focusTerug(vorige);
    };
  }, []);

  // Escape: vóór alles (capture op window) en niet verder, zodat de lezer en het contextblad erachter niet ook sluiten
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      const laag = laagRef.current, actief = document.activeElement;
      if (!laag || (actief && actief !== document.body && !laag.contains(actief))) return; // focus in een laag erboven
      e.preventDefault();
      e.stopPropagation();
      sluitRef.current();
    };
    window.addEventListener('keydown', opToets, true);
    return () => window.removeEventListener('keydown', opToets, true);
  }, []);

  useEffect(() => {
    if (!oud || !nieuw || oud.nummer === nieuw.nummer) { setStand({ soort: 'zelfde' }); return; }
    let levend = true, klok = 0;
    setStand({ soort: 'laden' });
    void Promise.allSettled([leesVersie(p.bron, oud), leesVersie(p.bron, nieuw)]).then(([a, b]) => {
      if (!levend) return;
      if (a.status === 'rejected' || b.status === 'rejected') {
        const fout: unknown = a.status === 'rejected' ? a.reason : b.status === 'rejected' ? b.reason : null;
        setStand({ soort: 'fout', welke: a.status === 'rejected' ? oud.nummer : nieuw.nummer, code: fout instanceof Error ? fout.message : String(fout || '') });
        return;
      }
      const ta = a.value, tb = b.value;
      const onleesbaar = [ta.soort === 'onbekend' ? oud.nummer : 0, tb.soort === 'onbekend' ? nieuw.nummer : 0].filter(Boolean);
      if (onleesbaar.length) { setStand({ soort: 'onleesbaar', welke: onleesbaar }); return; }
      const leeg = [ta.tekst.trim() ? 0 : oud.nummer, tb.tekst.trim() ? 0 : nieuw.nummer].filter(Boolean);
      if (leeg.length) { setStand({ soort: 'leeg', welke: leeg, oud: ta, nieuw: tb }); return; }
      // vergelijken in een volgende taak: «laden» staat dan al op het scherm
      klok = window.setTimeout(() => { if (levend) setStand({ soort: 'klaar', uitkomst: vergelijkTeksten(ta.tekst, tb.tekst), oud: ta, nieuw: tb }); }, 0);
    });
    return () => { levend = false; window.clearTimeout(klok); };
  }, [oudSleutel, nieuwSleutel, p.bron.accountId, p.bron.cacheAccountId, poging]);

  const laatste = versies[versies.length - 1]?.bijlage.filename || '';
  const ext = /\.([a-z0-9]{1,8})$/i.exec(laatste)?.[1]?.toUpperCase() || '';
  const titel = [p.groep.titel || laatste, ext].filter(Boolean).join(' · ');
  if (typeof document === 'undefined') return null;
  return createPortal(
    <VersieVergelijkLaag
      lang={p.lang} titel={titel} versies={versies} oudNummer={keuze.oud} nieuwNummer={keuze.nieuw} stand={stand}
      onKies={(kant, nummer) => setKeuze((k) => ({ ...k, [kant]: nummer }))} onSluit={p.onSluit} onOpnieuw={() => setPoging((n) => n + 1)}
      laagRef={laagRef} vensterRef={vensterRef}
    />,
    document.body,
  );
}
