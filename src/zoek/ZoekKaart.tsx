// /zoek — de resultaatkaart (specificatie §11): ronde typeicoon, titel, bron › pad, fragment met de markering van de SERVER
// (posities → tekstknopen, geen innerHTML), «Відповідність запиту N%» (serverwaarde), datum, tags, de echte overgang (route →
// URL van de dienst) met een actie per soort, en «чому релевантно» (uitleg van de server, uitklapbaar).
//
// Zone D (22.10.2026, macet van de eigenaar): de icoon staat in een GEKLEURDE tegel per bron (tokens: info = interface/instellingen,
// ok = post, accent = bestanden, warn = agenda, github = neutraal, bord = gemengd), een brief toont de foto/het logo van de afzender
// (src/afzenders/AfzenderFoto → app.afzender_beeld, zoals in de post), een bestand het formaat onder de icoon, GitHub en Drive het
// OFFICIËLE merklogo (src/merk, nooit een eigen tekening). `weergave='raster'` = de tegelvorm (verticaal) voor het raster.
import { Fragment, useMemo } from 'react';
import { ArrowRight, Calendar, CheckSquare, CircleDot, CircleHelp, ExternalLink, File, FileImage, FileSpreadsheet, FileText, Folder, GitBranch, GitCommitHorizontal, GitPullRequest, Mail, Menu, MessageSquare, Monitor, MousePointerClick, Paperclip, Plug, Settings, StickyNote, TextCursorInput, User, Zap } from 'lucide-react';
import Merk from '../merk/Merk';
import AfzenderFoto from '../afzenders/AfzenderFoto';
import { formaatVan } from '../../shared/bestandsformaten';
import FormaatTeken from '../bestand/FormaatTeken';
import { BRON_NAAM, type ZoekSoort, type ZoekTreffer } from '../../shared/zoek-model';
import { SOORT_NAAM, TAAL_NAAM, type Markering } from './zoek-logica';
import { ACTIE_LABEL, actieVoor, githubUrl, highlightParts, routeUrl, stukkenUitPosities, type Lang } from './zoek-kern';

const SOORT_ICOON: Record<ZoekSoort, typeof FileText> = {
  pagina: FileText, knop: MousePointerClick, menu: Menu, actie: Zap, veld: TextCursorInput, instelling: Settings, dialoog: MessageSquare, integratie: Plug, hulp: CircleHelp,
  bericht: Mail, bijlage: Paperclip, bestand: File, map: Folder, notitie: StickyNote, taak: CheckSquare, afspraak: Calendar, repo: GitBranch, issue: CircleDot, pull: GitPullRequest, commit: GitCommitHorizontal,
  contact: User, apparaat: Monitor, overig: FileText,
};
const MERK_VAN_BRON: Partial<Record<ZoekTreffer['bron'], string>> = { github: 'github', drive: 'google' };
/** Icoon per bestandsformaat (facet `formaat`, shared/zoek-formaten.ts) — alleen een vorm, de tekst van het formaat staat eronder. */
const FORMAAT_ICOON: Record<string, typeof FileText> = { pdf: FileText, docx: FileText, doc: FileText, odt: FileText, txt: FileText, md: FileText, html: FileText, xlsx: FileSpreadsheet, xls: FileSpreadsheet, csv: FileSpreadsheet, ods: FileSpreadsheet, png: FileImage, jpg: FileImage, jpeg: FileImage, webp: FileImage, gif: FileImage, heic: FileImage, svg: FileImage, zip: Folder, tar: Folder, gz: Folder, '7z': Folder, rar: Folder };
const afzenderVan = (r: ZoekTreffer): { adres: string; naam: string } | null => {
  if (r.bron !== 'mail' && r.soort !== 'bericht') return null;
  const adres = typeof r.extra.afzender === 'string' ? r.extra.afzender : ''; if (!adres || !adres.includes('@')) return null;
  return { adres, naam: typeof r.extra.afzenderNaam === 'string' ? r.extra.afzenderNaam : '' };
};
/** De tegel links: afzender (brief) › merk (GitHub/Drive) › formaat (bestand) › typeicoon. */
export function KaartIcoon({ r, maat = 44 }: { r: ZoekTreffer; maat?: number }) {
  const I = SOORT_ICOON[r.soort] || FileText;
  const afz = afzenderVan(r);
  if (afz) return <span className='zk-kaart-ic is-afzender' aria-hidden='true' data-zoek-icoon='afzender'><AfzenderFoto adres={afz.adres} naam={afz.naam} maat={maat} /></span>;
  const merk = MERK_VAN_BRON[r.bron];
  if (merk) return <span className='zk-kaart-ic is-merk' aria-hidden='true' data-zoek-icoon='merk'><Merk merk={merk} vorm='rond' maat={maat} terugval={<I />} /></span>;
  const f = r.formaat ? r.formaat.toLowerCase() : '';
  if (f && (r.soort === 'bestand' || r.soort === 'bijlage')) { const F = FORMAAT_ICOON[f] || File; const familie = formaatVan(`x.${f}`).familie; return <span className='zk-kaart-ic is-formaat' aria-hidden='true' data-zoek-icoon='formaat' data-formaat-familie={familie}><F /><FormaatTeken naam={`x.${f}`} tekst={false} /><span className='zk-kaart-formaat'>{f.slice(0, 5).toUpperCase()}</span></span>; }
  return <span className='zk-kaart-ic' aria-hidden='true' data-zoek-icoon='soort'><I /></span>;
}
export const UITLEG_METHODE = {
  uk: 'Відповідність запиту — це відсоток 0–100 від найкращого результату цього пошуку: точна назва й повна фраза важать найбільше, далі слова в назві, у тексті, синоніми та нормалізовані форми; свіжість додає небагато. Методику описано в документації пошуку.',
  nl: 'Overeenkomst is een percentage 0–100 ten opzichte van het beste resultaat van deze zoekopdracht: exacte titel en volledige zin wegen het zwaarst, dan woorden in de titel, in de tekst, synoniemen en genormaliseerde vormen; versheid telt licht mee. De methode staat in de zoekdocumentatie.',
};
export const fmtDatum = (ms: number, lang: Lang) => (ms > 0 ? new Date(ms).toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export const Stukken = ({ tekst, posities, terms }: { tekst: string; posities: ReadonlyArray<[number, number]>; terms: readonly string[] }) => {
  const stukken = useMemo(() => (posities.length ? stukkenUitPosities(tekst, posities) : highlightParts(tekst, terms)), [tekst, posities, terms]);
  // Niet-gemarkeerde delen als kale tekstknopen (geen <span>): een omgevouwen span zou als «overlappend tekstblok» tellen.
  return <>{stukken.map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}</>;
};

export type KaartProps = { r: ZoekTreffer; lang: Lang; terms: readonly string[]; markering?: Markering; onOpen?: (r: ZoekTreffer, url: string) => void; /** 'raster' = tegel (verticaal), standaard lijst. */ weergave?: 'lijst' | 'raster' };

export default function ZoekKaart({ r, lang, terms, markering, onOpen, weergave = 'lijst' }: KaartProps) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const extern = r.route ? '' : githubUrl(r.extra);
  const url = r.route ? routeUrl(r.route, lang) : extern;
  const actie = actieVoor(r.soort, r.bron, !!extern && !r.route);
  const titel = r.titels[lang] || r.titel || '—';
  const pct = r.percent; const pil = pct >= 75 ? 'pil-ok' : pct >= 50 ? 'pil-info' : 'pil-stil';
  const tags = [...new Set([SOORT_NAAM[r.soort][lang], r.formaat ? r.formaat.toUpperCase() : '', r.taal ? TAAL_NAAM[r.taal] : '', ...((Array.isArray(r.extra.tags) ? r.extra.tags : []) as unknown[]).map(x => String(x).slice(0, 40))].filter(Boolean))].slice(0, 6);
  const padDelen = r.pad ? r.pad.split(/\s*[›>]\s*/).filter(Boolean) : [];
  const pad = [BRON_NAAM[r.bron][lang], ...(padDelen[0] === BRON_NAAM[r.bron][lang] ? padDelen.slice(1) : padDelen)];
  const datum = fmtDatum(r.bijgewerktOp, lang);
  const open = (e: React.MouseEvent) => { if (!url) return; if (onOpen && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); onOpen(r, url); } };
  return (
    <article className={`zk-kaart kaart bron-${r.bron} soort-${r.soort}${markering === 'nieuw' ? ' is-nieuw' : ''}${weergave === 'raster' ? ' is-tegel' : ''}`} data-zoek-kaart={`${r.bron}:${r.id}`} data-percent={pct} data-zoek-bron={r.bron}>
      <KaartIcoon r={r} maat={weergave === 'raster' ? 40 : 44} />
      <div className='zk-kaart-body'>
        <h3 className='zk-kaart-titel'>
          {url ? <a href={url} onClick={open} {...(extern && !r.route ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><Stukken tekst={titel} posities={r.fragment.bron === 'titel' ? r.fragment.posities : []} terms={terms} /></a> : <span><Stukken tekst={titel} posities={[]} terms={terms} /></span>}
          {markering === 'nieuw' && <span className='pil pil-info zk-nieuw'>{t('нове', 'nieuw')}</span>}
        </h3>
        <p className='zk-kaart-pad'>{pad.map((p, i) => <span key={i}>{i > 0 && <span aria-hidden='true' className='zk-pad-sep'> › </span>}{p}</span>)}</p>
        {r.fragment.tekst && r.fragment.bron !== 'titel' && <p className='zk-kaart-fragment'><Stukken tekst={r.fragment.tekst} posities={r.fragment.posities} terms={terms} /></p>}
        {!r.fragment.tekst && r.omschrijving && <p className='zk-kaart-fragment'><Stukken tekst={r.omschrijving} posities={[]} terms={terms} /></p>}
        <div className='zk-kaart-voet'>
          <ul className='zk-tags' aria-label={t('Теги', 'Tags')}>{tags.map(x => <li key={x} className='pil pil-stil'>{x}</li>)}</ul>
          {datum && <time dateTime={new Date(r.bijgewerktOp).toISOString()} className='zk-kaart-datum'>{datum}</time>}
        </div>
        {r.uitleg.length > 0 && (
          <details className='zk-uitleg'>
            <summary>{t('Чому релевантно', 'Waarom relevant')}</summary>
            <ul>{r.uitleg.map(u => <li key={u.code}>{u[lang] || u.code}</li>)}</ul>
            <p className='zk-uitleg-methode'>{UITLEG_METHODE[lang]}</p>
          </details>)}
      </div>
      <div className='zk-kaart-rechts'>
        <span className={`pil ${pil} zk-pct`} title={UITLEG_METHODE[lang]}><span className='zk-sr'>{t('Відповідність запиту', 'Overeenkomst met de vraag')}: </span>{pct}%<span className='zk-pct-label' aria-hidden='true'> {t('відповідність', 'overeenkomst')}</span></span>
        {url && <a className='knop knop-stil is-klein zk-actie' href={url} onClick={open} {...(extern && !r.route ? { target: '_blank', rel: 'noopener noreferrer' } : {})} aria-label={`${ACTIE_LABEL[actie][lang]}: ${titel}`}>{ACTIE_LABEL[actie][lang]}{extern && !r.route ? <ExternalLink aria-hidden='true' /> : <ArrowRight aria-hidden='true' />}</a>}
        {!url && <span className='zk-geen-route'>{t('Без переходу', 'Geen overgang')}</span>}
      </div>
    </article>);
}
