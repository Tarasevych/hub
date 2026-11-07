// Mail zoeken v2 (UI-009, vlag `mail-zoeken-v2`, standaard UIT).
// Eén paneel voor snelfilters én alle voorwaarden (vervangt bij vlag AAN «Фільтри пошуку» en «Ще умови»).
// Alle keuzes gaan in een CONCEPT; pas «Шукати» start één zoekopdracht. Criteriamodel, zoekmotor en API's zijn ongewijzigd.
import {
  Archive, ArrowLeft, Ban, CalendarDays, Check, ChevronRight, File, FileSearch, FileText, History, Image, Inbox, Info,
  ListFilter, Mail, Paperclip, Pencil, RefreshCw, RotateCcw, Save, Search, Send, Star, Tag, TextSearch, Trash2, UserRound, X, AlertCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import {
  defaultMailSearchCriteria, mailAttachmentGroupExtensions, mailSearchFromValues, mailSearchLocations, mailSearchSubjectValues, mailSearchToValues,
  type MailAttachmentGroup, type MailSearchCriteria, type MailSearchFacets, type MailSearchLocation,
} from '../mail-zoek';
import type { MailRecentSearch, MailSavedSearch } from '../mail-zoek-cache';
import { mailQuarterRange, mailSeasonRange, mailDateLabel, mailLocalIso } from '../mail-datum-periodes';
import MailSearchActiveChips from '../MailZoekActiefChips';
import MailDateCalendar from '../MailDatumKalender';
import {
  grensStand, grootteFout, leesModus, markeer, metLeesModus, normaliseerGrootte, operatorVoorstellen, periodeTekst,
  VOORINSTELLINGEN, voorinstellingBereik, vulOperatorAan, zelfdeConcept, type LeesModus,
} from './logica';
import '../mail-geavanceerd-zoeken.css';
import '../mail-datum-periodes.css';
import './mail-zoeken-v2.css';

type Lang = 'uk' | 'nl';
type Account = { id: string; email: string; displayName: string };
type Label = { id: string; name: string; type: 'system' | 'user' };
export type V2Weergave = 'home' | 'text' | 'people' | 'subject' | 'status' | 'date' | 'label' | 'scope' | 'attachment' | 'size' | 'saved';
type Props = {
  lang: Lang; open: boolean; query: string; criteria: MailSearchCriteria; accounts: Account[]; currentAccountId: string; labels: Label[];
  facets: MailSearchFacets; busy: boolean; savedSearches: MailSavedSearch[]; recentSearches: MailRecentSearch[];
  onClose: () => void; onRun: (query: string, criteria: MailSearchCriteria) => void; onClearAll: () => void;
  onSave: (query: string, criteria: MailSearchCriteria) => void; onRenameSaved: (id: string, name: string) => void; onRemoveSaved: (id: string) => void;
  onClearRecent: () => void; onLoadFacets: () => void; onPeriodOpen: () => void; onPeriodSync: () => void;
  /** alleen voor de teststand */ beginWeergave?: V2Weergave;
};
const vouw = (s: string) => s.toLocaleLowerCase();
const wissel = (lijst: string[], v: string) => lijst.some((x) => vouw(x) === vouw(v)) ? lijst.filter((x) => vouw(x) !== vouw(v)) : [...lijst, v];
const wisselPlek = (lijst: MailSearchLocation[], v: MailSearchLocation) =>
  lijst.some((x) => x.kind === v.kind && x.value === v.value) ? lijst.filter((x) => !(x.kind === v.kind && x.value === v.value)) : [...lijst, v];
const tint = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const initialen = (naam: string) => (naam.replace(/<.*>/, '').trim().split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('') || '?').toLocaleUpperCase();

function Markering({ tekst, term }: { tekst: string; term: string }) {
  return <>{markeer(tekst, term).map((d, i) => (d.hit ? <mark key={i} className="mzv2-hit">{d.t}</mark> : <span key={i}>{d.t}</span>))}</>;
}
/** Eén «ⓘ» per blok: korte uitleg op aanvraag i.p.v. een groot vast blok. */
function Uitleg({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mzv2-uitleg">
      <button type="button" className="mzv2-ikoon-knop" aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen((v) => !v)}><Info /></button>
      {open && <span role="note" className="mzv2-uitleg-tekst">{children}</span>}
    </span>
  );
}
function Segment<T extends string>({ waarde, opties, onKies, label }: { waarde: T; opties: Array<[T, string]>; onKies: (v: T) => void; label: string }) {
  return (
    <div className="mzv2-segment" role="radiogroup" aria-label={label}>
      {opties.map(([v, tekst]) => (
        <button key={v} type="button" role="radio" aria-checked={waarde === v} className={waarde === v ? 'actief' : ''} onClick={() => onKies(v)}>{tekst}</button>
      ))}
    </div>
  );
}
function Schakelaar({ aan, onWissel, children }: { aan: boolean; onWissel: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="mzv2-schakel">
      <input type="checkbox" role="switch" checked={aan} onChange={(e) => onWissel(e.target.checked)} />
      <span className="mzv2-schakel-baan" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export default function MailZoekenV2(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const paneel = useRef<HTMLElement | null>(null);
  const werkgebied = useRef<HTMLDivElement | null>(null);
  const [weergave, setWeergave] = useState<V2Weergave>(p.beginWeergave || 'home');
  const [q, setQ] = useState(p.query);
  const [c, setC] = useState<MailSearchCriteria>(p.criteria);
  const begin = useRef({ q: p.query, c: p.criteria });
  const set = (deel: Partial<MailSearchCriteria>) => setC((oud) => ({ ...oud, ...deel }));
  const allIds = p.accounts.map((a) => a.id);
  const grootteProbleem = grootteFout(c.sizeMode, c.sizeValue);
  const gewijzigd = !zelfdeConcept([q.trim(), c], [begin.current.q.trim(), begin.current.c]);

  useEffect(() => {
    if (!p.open) return;
    setQ(p.query); setC(p.criteria); begin.current = { q: p.query, c: p.criteria }; setWeergave(p.beginWeergave || 'home');
    p.onLoadFacets();
    if (p.beginWeergave === 'date') p.onPeriodOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);
  useEffect(() => {
    if (!p.open) return;
    const buiten = (e: PointerEvent) => {
      const doel = e.target as Element | null;
      if (paneel.current && doel && !paneel.current.contains(doel) && !doel.closest?.('.mail-top-search-tune')) p.onClose();
    };
    document.addEventListener('pointerdown', buiten, true);
    return () => document.removeEventListener('pointerdown', buiten, true);
  }, [p.open, p.onClose]);
  // Focus naar het eerste invoerveld of de eerste knop van de nieuwe weergave (voorspelbaar voor toetsenbord en schermlezer).
  useEffect(() => {
    if (!p.open) return;
    werkgebied.current?.scrollTo?.({ top: 0 });
    const el = werkgebied.current?.querySelector<HTMLElement>('[data-mzv2-focus]') || werkgebied.current?.querySelector<HTMLElement>('input,button');
    el?.focus({ preventScroll: true });
  }, [weergave, p.open]);
  if (!p.open) return null;

  const openEditor = (w: V2Weergave) => { setWeergave(w); if (w === 'date') p.onPeriodOpen(); };
  const zoek = () => { if (!grootteProbleem) p.onRun(q, { ...c, sizeValue: normaliseerGrootte(c.sizeValue) }); };
  const toets = (e: RKeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (weergave !== 'home') setWeergave('home'); else p.onClose();
  };

  const titel: Record<V2Weergave, string> = {
    home: t('Пошук і фільтри', 'Zoeken en filters'), text: t('Текст і слова', 'Tekst en woorden'), people: t('Люди', 'Personen'),
    subject: t('Тема', 'Onderwerp'), status: t('Стан листа', 'Berichtstatus'), date: t('Період', 'Periode'),
    label: t('Тека / мітка', 'Map / label'), scope: t('Область пошуку', 'Zoekbereik'), attachment: t('Вкладення і тип вмісту', 'Bijlagen en inhoudstype'),
    size: t('Розмір', 'Grootte'), saved: t('Збережені пошуки', 'Opgeslagen zoekopdrachten'),
  };
  const froms = mailSearchFromValues(c), tos = mailSearchToValues(c), subjects = mailSearchSubjectValues(c), plekken = mailSearchLocations(c);
  const groepNaam = (g: string) => g === 'documents' ? t('Документи', 'Documenten') : g === 'images' ? t('Зображення', 'Afbeeldingen') : g === 'archives' ? t('Архіви', 'Archieven') : t('Інше', 'Overig');
  const waarde = (w: V2Weergave): string => {
    if (w === 'text') return [c.includeWords && `${t('усі', 'alle')}: ${c.includeWords}`, c.excludeWords && `${t('без', 'zonder')}: ${c.excludeWords}`].filter(Boolean).join(' · ');
    if (w === 'people') return [...froms.map((v) => `${t('від', 'van')} ${v}`), ...tos.map((v) => `${t('кому', 'aan')} ${v}`)].join(', ');
    if (w === 'subject') return subjects.join(', ');
    if (w === 'status') { const m = leesModus(c); return [m === 'unread' ? t('непрочитані', 'ongelezen') : m === 'read' ? t('прочитані', 'gelezen') : '', c.starred ? t('із зірочкою', 'met ster') : ''].filter(Boolean).join(', '); }
    if (w === 'date') return periodeTekst(c, p.lang);
    if (w === 'label') return plekken.map((x) => x.name).join(', ');
    if (w === 'scope') return c.locationKind === 'current' ? t('поточний розділ', 'huidige sectie') : '';
    if (w === 'attachment') return [c.hasAttachment ? t('є вкладення', 'met bijlage') : '', c.attachmentGroup ? groepNaam(c.attachmentGroup) : '', c.attachmentTypes.join(', ').toUpperCase(), c.filename].filter(Boolean).join(', ');
    if (w === 'size') return c.sizeMode && c.sizeValue ? `${c.sizeMode === 'larger' ? '>' : '<'} ${c.sizeValue} ${c.sizeUnit}` : '';
    if (w === 'saved') return p.savedSearches.length ? String(p.savedSearches.length) : '';
    return '';
  };
  const rij = (w: V2Weergave, ikoon: ReactNode) => {
    const v = waarde(w);
    return (
      <button type="button" className={`mzv2-rij${v ? ' gezet' : ''}`} onClick={() => openEditor(w)} data-mzv2-rij={w}>
        <span className="mzv2-rij-ikoon" aria-hidden="true">{ikoon}</span>
        <span className="mzv2-rij-tekst"><strong>{titel[w]}</strong>{v && <small>{v}</small>}</span>
        <ChevronRight aria-hidden="true" />
      </button>
    );
  };

  return (
    <section ref={paneel} id="mail-zoeken-v2" className="mail-advanced-search mzv2" role="dialog" aria-modal="false" aria-label={titel.home}
      data-mail-zoeken-v2={weergave} onKeyDown={toets}>
      <header className="mzv2-kop">
        {weergave !== 'home'
          ? <button type="button" className="mzv2-ikoon-knop" aria-label={t('Назад до всіх умов', 'Terug naar alle voorwaarden')} onClick={() => setWeergave('home')}><ArrowLeft /></button>
          : <span className="mzv2-kop-ikoon" aria-hidden="true"><ListFilter /></span>}
        <h2>{titel[weergave]}</h2>
        <button type="button" className="mzv2-ikoon-knop" aria-label={t('Закрити', 'Sluiten')} onClick={p.onClose}><X /></button>
      </header>
      <MailSearchActiveChips lang={p.lang} criteria={c} currentAccountId={p.currentAccountId} allAccountIds={allIds} onChange={setC}
        onClearAll={() => setC(defaultMailSearchCriteria([p.currentAccountId].filter(Boolean)))} className="mzv2-chips" />
      <div className="mzv2-werk" ref={werkgebied}>
        {weergave === 'home' && (
          <>
            <ZoekInvoer lang={p.lang} waarde={q} onWaarde={setQ} recent={p.recentSearches} onKies={(r) => { setQ(r.query); setC(r.criteria); }}
              onWisRecent={p.onClearRecent} onEnter={zoek} compact />
            <div className="mzv2-snel" aria-label={t('Швидкі фільтри', 'Snelle filters')}>
              <Segment<LeesModus> label={t('Прочитаність', 'Leesstatus')} waarde={leesModus(c)} onKies={(m) => set(metLeesModus(m))}
                opties={[['alle', t('Усі', 'Alle')], ['unread', t('Непрочитані', 'Ongelezen')], ['read', t('Прочитані', 'Gelezen')]]} />
              <button type="button" className={`mzv2-pil${c.starred ? ' actief' : ''}`} aria-pressed={c.starred} onClick={() => set({ starred: !c.starred })}><Star />{t('Зірочка', 'Ster')}</button>
              <button type="button" className={`mzv2-pil${c.hasAttachment ? ' actief' : ''}`} aria-pressed={c.hasAttachment}
                onClick={() => set(c.hasAttachment ? { hasAttachment: false, attachmentGroup: '', filename: '', attachmentTypes: [] } : { hasAttachment: true })}><Paperclip />{t('Вкладення', 'Bijlage')}</button>
            </div>
            <Groep titel={t('Текст і учасники', 'Tekst en deelnemers')}>{rij('text', <TextSearch />)}{rij('people', <UserRound />)}{rij('subject', <Mail />)}</Groep>
            <Groep titel={t('Стан і місце листа', 'Status en plaats')}>{rij('status', <ListFilter />)}{rij('label', <Tag />)}{rij('scope', <Inbox />)}</Groep>
            <Groep titel={t('Час', 'Tijd')}>{rij('date', <CalendarDays />)}</Groep>
            <Groep titel={t('Файли', 'Bestanden')}>{rij('attachment', <Paperclip />)}{rij('size', <FileSearch />)}</Groep>
            <Groep titel={t('Додатково', 'Extra')}>{rij('saved', <Save />)}</Groep>
          </>
        )}
        {weergave === 'text' && (
          <div className="mzv2-editor">
            <div className="mzv2-veld-kop"><span>{t('Пошуковий запит', 'Zoekopdracht')}</span>
              <Uitleg label={t('Підказка про оператори Gmail', 'Uitleg over Gmail-operators')}>
                {t('Можна писати оператори Gmail: from:, to:, subject:, has:attachment, filename:pdf, newer_than:7d, after:2024/01/31, label:, is:unread. Почніть вводити — з’являться підказки.',
                  'Gmail-operators zijn toegestaan: from:, to:, subject:, has:attachment, filename:pdf, newer_than:7d, after:2024/01/31, label:, is:unread. Begin te typen voor suggesties.')}
              </Uitleg></div>
            <ZoekInvoer lang={p.lang} waarde={q} onWaarde={setQ} recent={p.recentSearches} onKies={(r) => { setQ(r.query); setC(r.criteria); }}
              onWisRecent={p.onClearRecent} onEnter={zoek} altijdLijst />
            <label className="mzv2-veld"><span>{t('Містить усі слова', 'Bevat alle woorden')}</span>
              <input value={c.includeWords} onChange={(e) => set({ includeWords: e.target.value })} /></label>
            <label className="mzv2-veld"><span>{t('Не містить', 'Bevat niet')}</span>
              <input value={c.excludeWords} onChange={(e) => set({ excludeWords: e.target.value })} /></label>
            {p.facets.subjects.length > 0 && (
              <Lijst titel={t('Підказки з тем листів', 'Suggesties uit onderwerpen')}>
                {p.facets.subjects.filter((s) => !c.includeWords.trim() || vouw(s.value).includes(vouw(c.includeWords.trim()))).slice(0, 8).map((s) => (
                  <button type="button" key={s.value} className="mzv2-item" onClick={() => set({ includeWords: s.value })}>
                    <span className="mzv2-item-tekst"><strong><Markering tekst={s.value} term={c.includeWords} /></strong></span><em>{s.count}</em>
                  </button>))}
              </Lijst>)}
          </div>
        )}
        {weergave === 'people' && <MensenEditor lang={p.lang} c={c} set={set} facets={p.facets} />}
        {weergave === 'subject' && <OnderwerpEditor lang={p.lang} c={c} set={set} facets={p.facets} />}
        {weergave === 'status' && (
          <div className="mzv2-editor">
            <Segment<LeesModus> label={t('Прочитаність', 'Leesstatus')} waarde={leesModus(c)} onKies={(m) => set(metLeesModus(m))}
              opties={[['alle', t('Усі', 'Alle')], ['unread', t('Непрочитані', 'Ongelezen')], ['read', t('Прочитані', 'Gelezen')]]} />
            <Schakelaar aan={c.starred} onWissel={(v) => set({ starred: v })}>{t('Лише із зірочкою', 'Alleen met ster')}</Schakelaar>
          </div>
        )}
        {weergave === 'date' && <PeriodeEditor lang={p.lang} c={c} set={set} facets={p.facets} onSync={p.onPeriodSync} />}
        {weergave === 'label' && <LabelEditor lang={p.lang} c={c} set={set} facets={p.facets} labels={p.labels} currentAccountId={p.currentAccountId} allIds={allIds} />}
        {weergave === 'scope' && (
          <div className="mzv2-editor">
            <Segment<'current' | 'all'> label={t('Область пошуку', 'Zoekbereik')} waarde={c.locationKind === 'current' ? 'current' : 'all'}
              onKies={(v) => set({ locationKind: v, locationValue: '', locationName: '', accountIds: v === 'all' ? allIds : [p.currentAccountId].filter(Boolean) })}
              opties={[['current', t('Поточний розділ', 'Huidige sectie')], ['all', t('Уся пошта', 'Alle e-mail')]]} />
            <p className="mzv2-noot">{c.locationKind === 'current'
              ? t('Шукати лише у відкритій зараз теці цього акаунта.', 'Alleen zoeken in de nu geopende map van dit account.')
              : t('Шукати в усіх теках усіх підключених акаунтів. Інші умови діють разом із цим.', 'Zoeken in alle mappen van alle gekoppelde accounts. Andere voorwaarden gelden tegelijk.')}</p>
            {(['SPAM', 'TRASH'] as const).map((id) => (
              <Schakelaar key={id} aan={c.excludeSystemLabels.includes(id)}
                onWissel={(v) => set({ excludeSystemLabels: v ? [...new Set([...c.excludeSystemLabels, id])] : c.excludeSystemLabels.filter((x) => x !== id) })}>
                {id === 'SPAM' ? t('Без «Спаму»', 'Zonder «Spam»') : t('Без «Кошика»', 'Zonder «Prullenbak»')}
              </Schakelaar>))}
          </div>
        )}
        {weergave === 'attachment' && <BijlageEditor lang={p.lang} c={c} set={set} facets={p.facets} groepNaam={groepNaam} />}
        {weergave === 'size' && (
          <div className="mzv2-editor">
            <div className="mzv2-grootte" role="group" aria-label={t('Розмір листа', 'Grootte van het bericht')}>
              <Segment<'' | 'larger' | 'smaller'> label={t('Порівняння', 'Vergelijking')} waarde={c.sizeMode} onKies={(v) => set({ sizeMode: v })}
                opties={[['', t('Будь-який', 'Elke')], ['larger', t('Більше', 'Groter')], ['smaller', t('Менше', 'Kleiner')]]} />
              <span className="mzv2-grootte-invoer">
                <input inputMode="decimal" aria-label={t('Значення', 'Waarde')} disabled={!c.sizeMode} value={c.sizeValue} aria-invalid={Boolean(grootteProbleem)}
                  onChange={(e) => set({ sizeValue: e.target.value })} placeholder="10" />
                <select aria-label={t('Одиниця', 'Eenheid')} disabled={!c.sizeMode} value={c.sizeUnit} onChange={(e) => set({ sizeUnit: e.target.value as MailSearchCriteria['sizeUnit'] })}>
                  {(['KB', 'MB', 'GB', 'B'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </span>
            </div>
            {grootteProbleem && <p className="mzv2-fout" role="alert">{grootteProbleem === 'leeg' ? t('Вкажіть розмір.', 'Vul een grootte in.') : t('Розмір має бути додатним числом.', 'De grootte moet een positief getal zijn.')}</p>}
          </div>
        )}
        {weergave === 'saved' && <OpgeslagenEditor lang={p.lang} lijst={p.savedSearches} onStart={(s) => p.onRun(s.query, s.criteria)} onHernoem={p.onRenameSaved} onWis={p.onRemoveSaved} />}
      </div>
      <footer className="mzv2-voet">
        <button type="button" className="mzv2-knop" onClick={p.onClearAll}><RotateCcw />{t('Скинути', 'Resetten')}</button>
        <button type="button" className="mzv2-knop" disabled={p.busy || Boolean(grootteProbleem) || p.savedSearches.length >= 3 && !p.savedSearches.some((s) => zelfdeConcept([s.query, s.criteria], [q.trim(), c]))}
          title={p.savedSearches.length >= 3 ? t('Можна зберегти до 3 пошуків', 'Maximaal 3 opgeslagen zoekopdrachten') : undefined}
          onClick={() => p.onSave(q, c)}><Save />{t('Зберегти', 'Opslaan')}</button>
        <button type="button" className="mzv2-knop primair" disabled={p.busy || Boolean(grootteProbleem)} onClick={zoek} data-gewijzigd={gewijzigd ? 'ja' : 'nee'}>
          <Search />{t('Шукати', 'Zoeken')}
        </button>
      </footer>
    </section>
  );
}

function Groep({ titel, children }: { titel: string; children: ReactNode }) {
  return <section className="mzv2-groep"><h3>{titel}</h3><div className="mzv2-groep-rijen">{children}</div></section>;
}
function Lijst({ titel, children, extra }: { titel: string; children: ReactNode; extra?: ReactNode }) {
  return <section className="mzv2-lijst"><div className="mzv2-lijst-kop"><h3>{titel}</h3>{extra}</div><div className="mzv2-lijst-items">{children}</div></section>;
}

/** Zoekveld met aanvulling van Gmail-operators en de recente zoekopdrachten (treffers gemarkeerd, ↑/↓/Enter, wissen). */
function ZoekInvoer({ lang, waarde, onWaarde, recent, onKies, onWisRecent, onEnter, compact, altijdLijst }: {
  lang: Lang; waarde: string; onWaarde: (v: string) => void; recent: MailRecentSearch[]; onKies: (r: MailRecentSearch) => void;
  onWisRecent: () => void; onEnter: () => void; compact?: boolean; altijdLijst?: boolean;
}) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [focus, setFocus] = useState(false), [actief, setActief] = useState(-1);
  const ops = operatorVoorstellen(waarde);
  const hist = recent.filter((r) => r.query.trim() && (!waarde.trim() || vouw(r.query).includes(vouw(waarde.trim()))) && r.query.trim() !== waarde.trim()).slice(0, 6);
  const toon = altijdLijst || focus;
  const items: Array<{ soort: 'op'; v: string } | { soort: 'r'; r: MailRecentSearch }> = [...ops.map((v) => ({ soort: 'op' as const, v })), ...(toon ? hist.map((r) => ({ soort: 'r' as const, r })) : [])];
  const kies = (i: number) => { const it = items[i]; if (!it) return; if (it.soort === 'op') onWaarde(vulOperatorAan(waarde, it.v)); else onKies(it.r); setActief(-1); };
  const lijstId = compact ? 'mzv2-voorstel-home' : 'mzv2-voorstel-tekst';
  return (
    <div className={`mzv2-zoek${compact ? ' compact' : ''}`}>
      <label className="mzv2-zoek-veld">
        <Search aria-hidden="true" />
        <input data-mzv2-focus value={waarde} placeholder={t('Слова, адреса або from:, has:attachment…', 'Woorden, adres of from:, has:attachment…')}
          aria-label={t('Пошуковий запит', 'Zoekopdracht')} role="combobox" aria-expanded={items.length > 0 && toon} aria-controls={lijstId} aria-autocomplete="list"
          aria-activedescendant={actief >= 0 ? `${lijstId}-${actief}` : undefined}
          onFocus={() => setFocus(true)} onBlur={() => window.setTimeout(() => setFocus(false), 150)}
          onChange={(e) => { onWaarde(e.target.value); setActief(-1); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setActief((i) => (i + 1) % items.length); }
            else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); setActief((i) => (i <= 0 ? items.length - 1 : i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (actief >= 0) kies(actief); else onEnter(); }
          }} />
        {waarde && <button type="button" className="mzv2-ikoon-knop" aria-label={t('Очистити запит', 'Zoekopdracht wissen')} onClick={() => onWaarde('')}><X /></button>}
      </label>
      {items.length > 0 && toon && (
        <div className="mzv2-voorstellen" id={lijstId} role="listbox" aria-label={t('Підказки', 'Suggesties')}>
          {ops.length > 0 && <div className="mzv2-ops">{ops.map((v, i) => (
            <button type="button" role="option" id={`${lijstId}-${i}`} aria-selected={actief === i} key={v} className={`mzv2-op${actief === i ? ' actief' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => kies(i)}>{v}</button>))}</div>}
          {toon && hist.length > 0 && (
            <>
              <div className="mzv2-lijst-kop"><h3><History aria-hidden="true" />{t('Нещодавні пошуки', 'Recente zoekopdrachten')}</h3>
                <button type="button" className="mzv2-link" onMouseDown={(e) => e.preventDefault()} onClick={onWisRecent}>{t('Очистити', 'Wissen')}</button></div>
              {hist.map((r, j) => { const i = ops.length + j; return (
                <button type="button" role="option" id={`${lijstId}-${i}`} aria-selected={actief === i} key={r.id} className={`mzv2-item${actief === i ? ' actief' : ''}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => kies(i)}>
                  <span className="mzv2-item-tekst"><strong><Markering tekst={r.query} term={waarde} /></strong></span>
                </button>); })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ naam }: { naam: string }) {
  return <span className="mzv2-avatar" aria-hidden="true" style={{ ['--mzv2-tint' as string]: String(tint(naam)) }}>{initialen(naam)}</span>;
}
function MensenEditor({ lang, c, set, facets }: { lang: Lang; c: MailSearchCriteria; set: (d: Partial<MailSearchCriteria>) => void; facets: MailSearchFacets }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [kant, setKant] = useState<'van' | 'aan'>(mailSearchToValues(c).length && !mailSearchFromValues(c).length ? 'aan' : 'van');
  const [term, setTerm] = useState('');
  const gekozen = kant === 'van' ? mailSearchFromValues(c) : mailSearchToValues(c);
  const zet = (lijst: string[]) => set(kant === 'van' ? { from: '', fromValues: lijst } : { to: '', toValues: lijst });
  const bron = kant === 'van' ? facets.senders : facets.recipients;
  const zichtbaar = useMemo(() => bron.filter((x) => !term.trim() || vouw(`${x.name} ${x.email}`).includes(vouw(term.trim()))).slice(0, 60), [bron, term]);
  const voegToe = () => { const v = term.trim(); if (!v) return; if (!gekozen.some((x) => vouw(x) === vouw(v))) zet([...gekozen, v]); setTerm(''); };
  return (
    <div className="mzv2-editor">
      <Segment<'van' | 'aan'> label={t('Хто', 'Wie')} waarde={kant} onKies={(v) => { setKant(v); setTerm(''); }}
        opties={[['van', `${t('Від кого', 'Van wie')}${mailSearchFromValues(c).length ? ` · ${mailSearchFromValues(c).length}` : ''}`], ['aan', `${t('Кому', 'Aan wie')}${mailSearchToValues(c).length ? ` · ${mailSearchToValues(c).length}` : ''}`]]} />
      <p className="mzv2-noot">{kant === 'van' ? t('Листи, які вам надіслали ці люди.', 'Berichten die deze mensen u stuurden.') : t('Листи, які ви або інші надіслали цим людям.', 'Berichten die aan deze mensen zijn gestuurd.')}</p>
      {gekozen.length > 0 && <div className="mzv2-keuze-chips">{gekozen.map((v) => (
        <span key={v} className="mail-search-chip">{v}<button type="button" aria-label={`${t('Зняти', 'Verwijderen')}: ${v}`} onClick={() => zet(gekozen.filter((x) => x !== v))}><X /></button></span>))}</div>}
      <label className="mzv2-zoek-veld">
        <Search aria-hidden="true" />
        <input data-mzv2-focus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); voegToe(); } }}
          placeholder={t('Ім’я або адреса; Enter — додати свою', 'Naam of adres; Enter = zelf toevoegen')} aria-label={t('Знайти або додати адресу', 'Adres zoeken of toevoegen')} />
        {term.trim() && <button type="button" className="mzv2-link" onClick={voegToe}>{t('Додати', 'Toevoegen')}</button>}
      </label>
      <Lijst titel={kant === 'van' ? t('Відправники', 'Afzenders') : t('Отримувачі', 'Ontvangers')}
        extra={<Uitleg label={t('Звідки цей список', 'Waar komt deze lijst vandaan')}>{t('Список і кількість листів — за вже проіндексованими листами, а не за всім Gmail.', 'Lijst en aantallen komen uit de reeds geïndexeerde berichten, niet uit heel Gmail.')}</Uitleg>}>
        {zichtbaar.length ? zichtbaar.map((x) => { const aan = gekozen.some((v) => vouw(v) === vouw(x.email)); return (
          <button type="button" key={x.email} className={`mzv2-item persoon${aan ? ' actief' : ''}`} aria-pressed={aan} onClick={() => zet(wissel(gekozen, x.email))}>
            <Avatar naam={x.name || x.email} />
            <span className="mzv2-item-tekst"><strong><Markering tekst={x.name || x.email} term={term} /></strong>{x.name && <small><Markering tekst={x.email} term={term} /></small>}</span>
            <em>{x.count}</em>{aan && <Check className="mzv2-vink" aria-hidden="true" />}
          </button>); }) : <p className="mzv2-leeg">{term.trim() ? t('Нічого не знайдено. Натисніть Enter, щоб додати адресу.', 'Niets gevonden. Druk op Enter om het adres toe te voegen.') : t('Список ще порожній.', 'De lijst is nog leeg.')}</p>}
      </Lijst>
    </div>
  );
}
function OnderwerpEditor({ lang, c, set, facets }: { lang: Lang; c: MailSearchCriteria; set: (d: Partial<MailSearchCriteria>) => void; facets: MailSearchFacets }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [term, setTerm] = useState('');
  const gekozen = mailSearchSubjectValues(c), zet = (l: string[]) => set({ subject: '', subjectValues: l });
  const lijst = facets.subjects.filter((s) => !term.trim() || vouw(s.value).includes(vouw(term.trim()))).slice(0, 40);
  const voegToe = () => { const v = term.trim(); if (v && !gekozen.some((x) => vouw(x) === vouw(v))) zet([...gekozen, v]); setTerm(''); };
  const datum = (n: number) => (n ? new Date(n).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  return (
    <div className="mzv2-editor">
      {gekozen.length > 0 && <div className="mzv2-keuze-chips">{gekozen.map((v) => (
        <span key={v} className="mail-search-chip">{v}<button type="button" aria-label={`${t('Зняти', 'Verwijderen')}: ${v}`} onClick={() => zet(gekozen.filter((x) => x !== v))}><X /></button></span>))}</div>}
      <label className="mzv2-zoek-veld"><Search aria-hidden="true" />
        <input data-mzv2-focus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); voegToe(); } }}
          placeholder={t('Слово з теми; Enter — додати', 'Woord uit onderwerp; Enter = toevoegen')} aria-label={t('Тема містить', 'Onderwerp bevat')} />
        {term.trim() && <button type="button" className="mzv2-link" onClick={voegToe}>{t('Додати', 'Toevoegen')}</button>}
      </label>
      <Lijst titel={t('Часті теми', 'Veelvoorkomende onderwerpen')}>
        {lijst.length ? lijst.map((s) => { const aan = gekozen.some((v) => vouw(v) === vouw(s.value)); return (
          <button type="button" key={s.value} className={`mzv2-item${aan ? ' actief' : ''}`} aria-pressed={aan} onClick={() => zet(wissel(gekozen, s.value))}>
            <span className="mzv2-item-tekst"><strong><Markering tekst={s.value} term={term} /></strong>{s.lastSeen > 0 && <small>{datum(s.lastSeen)}</small>}</span>
            <em>{s.count}</em>{aan && <Check className="mzv2-vink" aria-hidden="true" />}
          </button>); }) : <p className="mzv2-leeg">{t('Немає тем для підказки.', 'Geen onderwerpen om voor te stellen.')}</p>}
      </Lijst>
    </div>
  );
}

const SYSTEEM: Array<[string, string, string, ReactNode]> = [
  ['INBOX', 'Вхідні', 'Postvak IN', <Inbox key="i" />], ['STARRED', 'Із зірочкою', 'Met ster', <Star key="s" />], ['SENT', 'Надіслані', 'Verzonden', <Send key="se" />],
  ['DRAFT', 'Чернетки', 'Concepten', <FileText key="d" />], ['IMPORTANT', 'Важливі', 'Belangrijk', <AlertCircle key="im" />], ['SPAM', 'Спам', 'Spam', <Ban key="sp" />], ['TRASH', 'Кошик', 'Prullenbak', <Trash2 key="t" />],
];
function LabelEditor({ lang, c, set, facets, labels, currentAccountId, allIds }: { lang: Lang; c: MailSearchCriteria; set: (d: Partial<MailSearchCriteria>) => void; facets: MailSearchFacets; labels: Label[]; currentAccountId: string; allIds: string[] }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [term, setTerm] = useState('');
  const plekken = mailSearchLocations(c);
  const eigen = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const l of facets.labels) if (l.type === 'user') m.set(vouw(l.name), { id: l.id, name: l.name });
    for (const l of labels) if (l.type === 'user') m.set(vouw(l.name), { id: l.id, name: l.name });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [facets.labels, labels]);
  const past = (n: string) => !term.trim() || vouw(n).includes(vouw(term.trim()));
  const wisselLoc = (v: MailSearchLocation) => set({ locationKind: c.locationKind === 'system' || c.locationKind === 'label' ? 'all' : c.locationKind, locationValue: '', locationName: '', locations: wisselPlek(plekken, v) });
  const knop = (v: MailSearchLocation, ikoon: ReactNode) => { const aan = plekken.some((x) => x.kind === v.kind && x.value === v.value); return (
    <button type="button" key={`${v.kind}:${v.value}`} className={`mzv2-item${aan ? ' actief' : ''}`} aria-pressed={aan} onClick={() => wisselLoc(v)}>
      <span className="mzv2-item-ikoon" aria-hidden="true">{ikoon}</span><span className="mzv2-item-tekst"><strong><Markering tekst={v.name} term={term} /></strong></span>
      {aan && <Check className="mzv2-vink" aria-hidden="true" />}
    </button>); };
  void currentAccountId; void allIds;
  const sys = SYSTEEM.filter(([, uk, nl]) => past(lang === 'uk' ? uk : nl));
  const eig = eigen.filter((l) => past(l.name)).slice(0, 120);
  return (
    <div className="mzv2-editor">
      <label className="mzv2-zoek-veld"><Search aria-hidden="true" />
        <input data-mzv2-focus value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('Знайти теку або мітку', 'Map of label zoeken')} aria-label={t('Знайти теку або мітку', 'Map of label zoeken')} /></label>
      {sys.length > 0 && <Lijst titel={t('Теки', 'Mappen')}>{sys.map(([id, uk, nl, ik]) => knop({ kind: 'system', value: id, name: lang === 'uk' ? uk : nl }, ik))}</Lijst>}
      {eig.length > 0 && <Lijst titel={t('Мої мітки', 'Mijn labels')}>{eig.map((l) => knop({ kind: 'label', value: l.id, name: l.name }, <Tag />))}</Lijst>}
      {!sys.length && !eig.length && <p className="mzv2-leeg">{t('Нічого не знайдено.', 'Niets gevonden.')}</p>}
    </div>
  );
}

function BijlageEditor({ lang, c, set, facets, groepNaam }: { lang: Lang; c: MailSearchCriteria; set: (d: Partial<MailSearchCriteria>) => void; facets: MailSearchFacets; groepNaam: (g: string) => string }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [term, setTerm] = useState('');
  const groepVan = (ext: string): Exclude<MailAttachmentGroup, ''> => (Object.entries(mailAttachmentGroupExtensions).find(([, l]) => l.includes(ext))?.[0] as Exclude<MailAttachmentGroup, ''>) || 'other';
  const ikoon = (g: string) => (g === 'documents' ? <FileText /> : g === 'images' ? <Image /> : g === 'archives' ? <Archive /> : <File />);
  const formaten = facets.attachmentTypeCounts.filter((x) => (!term.trim() || vouw(x.type).includes(vouw(term.trim()))) && (!c.attachmentGroup || groepVan(vouw(x.type)) === c.attachmentGroup)).slice(0, 60);
  return (
    <div className="mzv2-editor">
      <Schakelaar aan={c.hasAttachment} onWissel={(v) => set(v ? { hasAttachment: true } : { hasAttachment: false, attachmentGroup: '', filename: '', attachmentTypes: [] })}>{t('Лише листи з вкладеннями', 'Alleen berichten met bijlage')}</Schakelaar>
      <div className="mzv2-veld-kop"><span>{t('Тип вмісту', 'Inhoudstype')}</span></div>
      <Segment<MailAttachmentGroup> label={t('Тип вмісту', 'Inhoudstype')} waarde={c.attachmentGroup}
        onKies={(g) => set({ attachmentGroup: g, ...(g ? { hasAttachment: true } : {}) })}
        opties={[['', t('Усі', 'Alle')], ['documents', groepNaam('documents')], ['images', groepNaam('images')], ['archives', groepNaam('archives')], ['other', groepNaam('other')]]} />
      <label className="mzv2-veld"><span>{t('Назва файла', 'Bestandsnaam')}</span>
        <input data-mzv2-focus value={c.filename} placeholder={t('напр. рахунок або .pdf', 'bv. factuur of .pdf')}
          onChange={(e) => set({ filename: e.target.value, hasAttachment: Boolean(e.target.value.trim()) || c.hasAttachment })} /></label>
      {c.attachmentTypes.length > 0 && <div className="mzv2-keuze-chips">{c.attachmentTypes.map((v) => (
        <span key={v} className="mail-search-chip">{v.toUpperCase()}<button type="button" aria-label={`${t('Зняти', 'Verwijderen')}: ${v}`} onClick={() => set({ attachmentTypes: c.attachmentTypes.filter((x) => x !== v) })}><X /></button></span>))}</div>}
      <Lijst titel={t('Формати', 'Formaten')} extra={<Uitleg label={t('Обмеження пошуку у вкладеннях', 'Beperking van zoeken in bijlagen')}>
        {t('Кількість — за проіндексованими листами. Текст усередині файлів поки не індексується, тому пошук іде за назвою та форматом.', 'Aantallen komen uit geïndexeerde berichten. Tekst ín bestanden wordt nog niet geïndexeerd; er wordt gezocht op naam en formaat.')}</Uitleg>}>
        <label className="mzv2-zoek-veld klein"><Search aria-hidden="true" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('Знайти формат', 'Formaat zoeken')} aria-label={t('Знайти формат', 'Formaat zoeken')} /></label>
        <div className="mzv2-formaten">
          {formaten.length ? formaten.map((x) => { const aan = c.attachmentTypes.includes(x.type); return (
            <button type="button" key={x.type} className={`mzv2-formaat${aan ? ' actief' : ''}`} aria-pressed={aan}
              onClick={() => set({ hasAttachment: true, attachmentTypes: wissel(c.attachmentTypes, x.type) })}>
              <span aria-hidden="true">{ikoon(groepVan(vouw(x.type)))}</span><strong>{x.type.toUpperCase()}</strong><em>{x.count}</em>
            </button>); }) : <p className="mzv2-leeg">{t('Форматів поки немає.', 'Nog geen formaten.')}</p>}
        </div>
      </Lijst>
    </div>
  );
}

function OpgeslagenEditor({ lang, lijst, onStart, onHernoem, onWis }: { lang: Lang; lijst: MailSavedSearch[]; onStart: (s: MailSavedSearch) => void; onHernoem: (id: string, naam: string) => void; onWis: (id: string) => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [bewerk, setBewerk] = useState(''), [naam, setNaam] = useState('');
  if (!lijst.length) return <p className="mzv2-leeg" data-mzv2-focus tabIndex={-1}>{t('Збережених пошуків немає. Задайте умови й натисніть «Зберегти» (до 3).', 'Nog geen opgeslagen zoekopdrachten. Stel voorwaarden in en kies «Opslaan» (max. 3).')}</p>;
  return (
    <div className="mzv2-editor">
      <div className="mzv2-lijst-items">
        {lijst.map((s) => bewerk === s.id ? (
          <form key={s.id} className="mzv2-hernoem" onSubmit={(e) => { e.preventDefault(); if (naam.trim()) onHernoem(s.id, naam.trim()); setBewerk(''); }}>
            <input data-mzv2-focus autoFocus value={naam} maxLength={80} onChange={(e) => setNaam(e.target.value)} aria-label={t('Нова назва', 'Nieuwe naam')} />
            <button type="submit" className="mzv2-ikoon-knop" aria-label={t('Зберегти назву', 'Naam opslaan')}><Check /></button>
            <button type="button" className="mzv2-ikoon-knop" aria-label={t('Скасувати', 'Annuleren')} onClick={() => setBewerk('')}><X /></button>
          </form>
        ) : (
          <div key={s.id} className="mzv2-opgeslagen">
            <button type="button" className="mzv2-item" onClick={() => onStart(s)} title={t('Шукати за цим', 'Hiermee zoeken')}>
              <span className="mzv2-item-ikoon" aria-hidden="true"><Search /></span><span className="mzv2-item-tekst"><strong>{s.name}</strong>{s.query && s.query !== s.name && <small>{s.query}</small>}</span>
            </button>
            <button type="button" className="mzv2-ikoon-knop" aria-label={`${t('Перейменувати', 'Hernoemen')}: ${s.name}`} onClick={() => { setBewerk(s.id); setNaam(s.name); }}><Pencil /></button>
            <button type="button" className="mzv2-ikoon-knop" aria-label={`${t('Видалити', 'Verwijderen')}: ${s.name}`} onClick={() => onWis(s.id)}><Trash2 /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

const GMAIL_BEGIN = new Date(2004, 0, 1).getTime();
function PeriodeEditor({ lang, c, set, facets, onSync }: { lang: Lang; c: MailSearchCriteria; set: (d: Partial<MailSearchCriteria>) => void; facets: MailSearchFacets; onSync: () => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const stand = grensStand(facets);
  const vandaag = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const bevestigd = stand === 'bevestigd';
  const min = bevestigd ? Number(facets.providerMinDate) : GMAIL_BEGIN;
  const max = bevestigd ? Math.min(vandaag, Number(facets.providerMaxDate)) : vandaag;
  const minIso = mailLocalIso(new Date(min)), maxIso = mailLocalIso(new Date(max));
  const jaren = useMemo(() => {
    if (bevestigd && facets.providerYears?.length) return [...facets.providerYears].sort((a, b) => b - a);
    const a = new Date(max).getFullYear(), b = new Date(min).getFullYear();
    return Array.from({ length: a - b + 1 }, (_, i) => a - i);
  }, [bevestigd, facets.providerYears, min, max]);
  const dagen = useMemo(() => [...new Set((facets.dateBuckets || []).flatMap((r) => (r.days || []).map((d) => `${r.year}-${String(r.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)))].sort(), [facets.dateBuckets]);
  const [veld, setVeld] = useState<'from' | 'to'>(c.dateFrom && !c.dateTo ? 'to' : 'from');
  const [meer, setMeer] = useState(Boolean(c.dateMonth || c.dateYear));
  const [soort, setSoort] = useState<'maand' | 'jaar' | 'kwartaal' | 'seizoen'>(c.dateMonth ? 'maand' : 'jaar');
  const [jaar, setJaar] = useState(c.dateYear || jaren[0] || new Date().getFullYear());
  const vast = (v: string) => (v < minIso ? minIso : v > maxIso ? maxIso : v);
  const bereik = (r: { from: string; to: string }) => set({ datePreset: 'custom', dateFrom: vast(r.from), dateTo: vast(r.to), dateMonth: 0, dateYear: 0 });
  const kiesDag = (v: string) => {
    let van = c.datePreset === 'custom' ? c.dateFrom : '', tot = c.datePreset === 'custom' ? c.dateTo : '';
    if (veld === 'from') van = v; else tot = v;
    if (van && tot && van > tot) [van, tot] = [tot, van];
    set({ datePreset: 'custom', dateFrom: van, dateTo: tot, dateMonth: 0, dateYear: 0 });
    if (veld === 'from') setVeld('to');
  };
  const tekst = periodeTekst(c, lang);
  const actievePreset = VOORINSTELLINGEN.find((v) => { const r = voorinstellingBereik(v.dagen); return c.datePreset === 'custom' && c.dateFrom === vast(r.from) && c.dateTo === vast(r.to); })?.id || (!tekst ? 'alle' : '');
  const maandNaam = (m: number) => new Date(2024, m - 1, 1).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { month: 'short' });
  const datum = (v: string) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : t('оберіть', 'kies'));
  const grensTekst = stand === 'laden' ? t('Визначаємо межі пошти…', 'Mailgrenzen bepalen…')
    : stand === 'bevestigd' ? `${t('Листи є', 'Berichten van')} ${mailDateLabel(lang, min)} — ${mailDateLabel(lang, max)}`
    : stand === 'fout' ? t('Межі пошти зараз не вдалося визначити. Дату можна обрати й так.', 'De mailgrenzen konden nu niet worden bepaald. U kunt toch een datum kiezen.')
    : stand === 'leeg' ? t('У підключеній пошті не знайдено дат листів.', 'Geen berichtdatums gevonden in de gekoppelde mailbox.')
    : t('Межі пошти ще не визначені. Дату можна обрати й так.', 'Mailgrenzen zijn nog niet bepaald. U kunt toch een datum kiezen.');
  return (
    <div className="mzv2-editor mzv2-periode">
      <div className="mzv2-periode-gekozen" aria-live="polite">
        <CalendarDays aria-hidden="true" /><span><small>{t('Обрано', 'Gekozen')}</small><strong>{tekst || t('Будь-коли', 'Altijd')}</strong></span>
        {tekst && <button type="button" className="mzv2-link" onClick={() => set({ datePreset: 'all', dateFrom: '', dateTo: '', dateMonth: 0, dateYear: 0 })}>{t('Скинути період', 'Periode wissen')}</button>}
      </div>
      <Segment<string> label={t('Швидкий вибір', 'Snelle keuze')} waarde={actievePreset}
        onKies={(id) => { if (id === 'alle') set({ datePreset: 'all', dateFrom: '', dateTo: '', dateMonth: 0, dateYear: 0 }); else { const v = VOORINSTELLINGEN.find((x) => x.id === id)!; bereik(voorinstellingBereik(v.dagen)); } }}
        opties={[['alle', t('Будь-коли', 'Altijd')], ...VOORINSTELLINGEN.map((v) => [v.id, lang === 'uk' ? v.uk : v.nl] as [string, string])]} />
      <div className="mzv2-bereik" role="group" aria-label={t('Діапазон дат', 'Datumbereik')}>
        {(['from', 'to'] as const).map((k) => (
          <button key={k} type="button" className={`mzv2-datumveld${veld === k ? ' actief' : ''}`} aria-pressed={veld === k} data-mzv2-focus={k === 'from' ? '' : undefined} onClick={() => setVeld(k)}>
            <small>{k === 'from' ? t('Від', 'Van') : t('До', 'Tot')}</small><strong>{datum(c.datePreset === 'custom' ? (k === 'from' ? c.dateFrom : c.dateTo) : '')}</strong>
          </button>))}
      </div>
      <MailDateCalendar key={`${veld}:${minIso}:${maxIso}`} lang={lang} value={c.datePreset === 'custom' ? (veld === 'from' ? c.dateFrom : c.dateTo) : ''} rangeStart={c.datePreset === 'custom' ? c.dateFrom : ''}
        rangeEnd={c.datePreset === 'custom' ? c.dateTo : ''} minDate={min} maxDate={max} availableYears={jaren} availableDates={dagen} onSelect={kiesDag} />
      <div className={`mzv2-grens stand-${stand}`}>
        {stand === 'laden' ? <RefreshCw className="spin" aria-hidden="true" /> : <Info aria-hidden="true" />}
        <span>{grensTekst}{stand === 'fout' && facets.providerBoundsErrorCode ? <small> · {facets.providerBoundsErrorCode}</small> : null}</span>
        {stand !== 'laden' && <button type="button" className="mzv2-ikoon-knop" aria-label={t('Оновити межі пошти', 'Mailgrenzen vernieuwen')} title={t('Оновити межі пошти', 'Mailgrenzen vernieuwen')} onClick={onSync}><RefreshCw /></button>}
      </div>
      <button type="button" className="mzv2-uitklap" aria-expanded={meer} onClick={() => setMeer((v) => !v)}>
        <ChevronRight aria-hidden="true" />{t('Місяць, рік, квартал або сезон', 'Maand, jaar, kwartaal of seizoen')}
      </button>
      {meer && (
        <div className="mzv2-meer">
          <div className="mzv2-meer-kop">
            <Segment<'maand' | 'jaar' | 'kwartaal' | 'seizoen'> label={t('Що обрати', 'Wat kiezen')} waarde={soort} onKies={setSoort}
              opties={[['maand', t('Місяць', 'Maand')], ['jaar', t('Рік', 'Jaar')], ['kwartaal', t('Квартал', 'Kwartaal')], ['seizoen', t('Сезон', 'Seizoen')]]} />
            {soort !== 'jaar' && (
              <select aria-label={t('Рік', 'Jaar')} value={soort === 'maand' ? c.dateYear || 0 : jaar}
                onChange={(e) => { const j = Number(e.target.value); if (soort === 'maand') set({ datePreset: 'all', dateFrom: '', dateTo: '', dateYear: j }); else setJaar(j); }}>
                {soort === 'maand' && <option value={0}>{t('Будь-який рік', 'Elk jaar')}</option>}
                {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>)}
          </div>
          {soort === 'maand' && <div className="mzv2-raster vier">{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button type="button" key={m} className={c.dateMonth === m ? 'actief' : ''} aria-pressed={c.dateMonth === m}
              onClick={() => set({ datePreset: 'all', dateFrom: '', dateTo: '', dateMonth: c.dateMonth === m ? 0 : m })}>{maandNaam(m)}</button>))}</div>}
          {soort === 'jaar' && <div className="mzv2-raster jaren">{jaren.map((j) => (
            <button type="button" key={j} className={c.dateYear === j ? 'actief' : ''} aria-pressed={c.dateYear === j}
              onClick={() => set({ datePreset: 'all', dateFrom: '', dateTo: '', dateYear: c.dateYear === j ? 0 : j })}>{j}</button>))}</div>}
          {soort === 'kwartaal' && <div className="mzv2-raster vier">{[1, 2, 3, 4].map((k) => { const r = mailQuarterRange(jaar, k); const aan = c.datePreset === 'custom' && c.dateFrom === vast(r.from) && c.dateTo === vast(r.to); return (
            <button type="button" key={k} className={aan ? 'actief' : ''} aria-pressed={aan} disabled={r.to < minIso || r.from > maxIso} onClick={() => bereik(r)}>{lang === 'uk' ? `${k}-й` : `K${k}`}</button>); })}</div>}
          {soort === 'seizoen' && <div className="mzv2-raster vier">{([['spring', 'Весна', 'Lente'], ['summer', 'Літо', 'Zomer'], ['autumn', 'Осінь', 'Herfst'], ['winter', 'Зима', 'Winter']] as const).map(([s, uk, nl]) => { const r = mailSeasonRange(jaar, s); const aan = c.datePreset === 'custom' && c.dateFrom === vast(r.from) && c.dateTo === vast(r.to); return (
            <button type="button" key={s} className={aan ? 'actief' : ''} aria-pressed={aan} disabled={r.to < minIso || r.from > maxIso} onClick={() => bereik(r)}>{lang === 'uk' ? uk : nl}</button>); })}</div>}
        </div>
      )}
    </div>
  );
}
