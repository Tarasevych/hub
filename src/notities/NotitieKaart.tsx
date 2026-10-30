// Eén notitie als kaart (raster) of rij (lijst). De inhoud is de VEILIGE Markdown-weergave (shared/notities-vnext-model.ts →
// markdownNaarHtml, daarna nog DOMPurify als tweede slot); een vinkje in een checklist slaat meteen op.
import { useMemo, type MouseEvent } from 'react';
import DOMPurify from 'dompurify';
import { Archive, ArchiveRestore, Code2, Link2, ListChecks, Pencil, Pin, PinOff, RotateCcw, Trash2, Type, X, type LucideIcon } from 'lucide-react';
import { lijstVoortgang, markdownNaarHtml, vnKoppelingen, type Notitie, type NotitieMap, type NotitieSoort } from '../../shared/notities-vnext-model';
import { SOORT_LABEL, datumTekst, tr, type Lang } from './tekst';

const SOORT_ICOON: Record<NotitieSoort, LucideIcon> = { tekst: Type, lijst: ListChecks, code: Code2, koppeling: Link2 };
const TOEGESTAAN = ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'input', 'span', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr'];
const ATTR = ['href', 'target', 'rel', 'class', 'type', 'checked', 'data-regel', 'data-taal', 'aria-label'];
// ALLOWED_URI_REGEXP geldt in DOMPurify voor ELK attribuut dat niet «URI-veilig» heet — dus `type="checkbox"` zou sneuvelen op
// /^https/. Daarom staan de niet-URI-attributen uitdrukkelijk in ADD_URI_SAFE_ATTR; href blijft aan de https-regel gebonden.
const URI_VEILIG = ['type', 'checked', 'data-regel', 'data-taal', 'aria-label', 'class', 'target', 'rel'];
export const veiligeHtml = (md: string) => DOMPurify.sanitize(markdownNaarHtml(md), { ALLOWED_TAGS: TOEGESTAAN, ALLOWED_ATTR: ATTR, ALLOWED_URI_REGEXP: /^https:\/\//i, ADD_URI_SAFE_ATTR: URI_VEILIG });

type Props = {
  lang: Lang; notitie: Notitie; indeling: 'kaarten' | 'lijst'; mappen: NotitieMap[]; bezig: boolean; weergave: string;
  onOpen: (n: Notitie) => void; onActie: (n: Notitie, actie: 'vast' | 'losmaken' | 'archief' | 'uit-archief' | 'prullenbak' | 'herstel' | 'definitief') => void;
  onVink: (n: Notitie, regel: number) => void; onEtiket: (e: string) => void;
};
export default function NotitieKaart({ lang, notitie: n, indeling, mappen, bezig, weergave, onOpen, onActie, onVink, onEtiket }: Props) {
  const Icoon = SOORT_ICOON[n.soort];
  const inBak = Boolean(n.verwijderdOp);
  const html = useMemo(() => (n.soort === 'code' ? '' : veiligeHtml(indeling === 'lijst' ? n.inhoud.slice(0, 400) : n.inhoud.slice(0, 1600))), [n.inhoud, n.soort, indeling]);
  const voortgang = n.soort === 'lijst' ? lijstVoortgang(n.inhoud) : null;
  const koppelingen = n.soort === 'koppeling' ? vnKoppelingen(n.inhoud).slice(0, 3) : [];
  const map = n.mapId ? mappen.find((m) => m.id === n.mapId) : null;
  const klik = (e: MouseEvent<HTMLDivElement>) => {
    const doel = e.target as HTMLElement;
    if (doel.tagName === 'INPUT' && doel.dataset.regel !== undefined) { e.preventDefault(); if (!bezig && !inBak) onVink(n, Number(doel.dataset.regel)); return; }
    if (doel.closest('a')) return;
    onOpen(n);
  };
  const toets = (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(n); } };
  return (
    <article className={`vn-kaart kleur-${n.kleur}${n.vast ? ' is-vast' : ''}${inBak ? ' is-bak' : ''}`} data-vn-notitie={n.id} data-vn-soort={n.soort} data-vn-vast={n.vast ? '1' : '0'} aria-label={n.titel}>
      <div className='vn-kaart-kop'>
        <span className='vn-kaart-soort'><Icoon aria-hidden='true' />{tr(lang, SOORT_LABEL[n.soort][0], SOORT_LABEL[n.soort][1])}{map ? <> · <span className={`vn-stip kleur-${map.kleur}`} aria-hidden='true' />{map.naam}</> : null}</span>
        {n.vast ? <Pin className='vn-kaart-vastteken' aria-label={tr(lang, 'закріплено', 'vastgezet')} /> : null}
      </div>
      <div className='vn-kaart-klik' role='button' tabIndex={0} onClick={klik} onKeyDown={toets} aria-label={tr(lang, `Відкрити «${n.titel}»`, `«${n.titel}» openen`)}>
        <h3>{n.titel}</h3>
        {n.soort === 'code' && n.inhoud ? <pre className='vn-code'><code>{indeling === 'lijst' ? n.inhoud.slice(0, 300) : n.inhoud.slice(0, 1200)}</code></pre>
          : html ? <div className='vn-kaart-inhoud vn-md' dangerouslySetInnerHTML={{ __html: html }} /> : null}
        {koppelingen.length ? <div className='vn-kaart-koppelingen'>{koppelingen.map((k) => <a key={k} href={k} target='_blank' rel='noopener noreferrer'><Link2 aria-hidden='true' />{k.replace(/^https:\/\//, '').slice(0, 60)}</a>)}</div> : null}
        {voortgang && voortgang.totaal ? <div className='vn-voortgang' aria-label={tr(lang, `${voortgang.af} з ${voortgang.totaal} виконано`, `${voortgang.af} van ${voortgang.totaal} gedaan`)}><span style={{ width: `${Math.round((voortgang.af / voortgang.totaal) * 100)}%` }} /><small>{voortgang.af}/{voortgang.totaal}</small></div> : null}
      </div>
      <footer className='vn-kaart-voet'>
        <div className='vn-kaart-etiketten'>
          {n.etiketten.slice(0, 5).map((e) => <button key={e} type='button' className='vn-etiket' onClick={() => onEtiket(e)} title={tr(lang, `Фільтр за тегом ${e}`, `Filter op etiket ${e}`)}>#{e}</button>)}
          {n.etiketten.length > 5 ? <span className='vn-etiket is-meer'>+{n.etiketten.length - 5}</span> : null}
        </div>
        <small className='vn-kaart-datum'>{datumTekst(lang, n.gewijzigdOp || n.aangemaaktOp)}</small>
        <div className='vn-kaart-knoppen'>
          {inBak ? (
            <>
              <button type='button' className='vn-icoonknop' disabled={bezig} onClick={() => onActie(n, 'herstel')} aria-label={tr(lang, `Відновити «${n.titel}»`, `«${n.titel}» herstellen`)} title={tr(lang, 'Відновити', 'Herstellen')} data-vn-actie='herstel'><RotateCcw /></button>
              <button type='button' className='vn-icoonknop is-gevaar' disabled={bezig} onClick={() => onActie(n, 'definitief')} aria-label={tr(lang, `Видалити «${n.titel}» назавжди`, `«${n.titel}» voorgoed verwijderen`)} title={tr(lang, 'Видалити назавжди', 'Voorgoed verwijderen')} data-vn-actie='definitief'><X /></button>
            </>
          ) : (
            <>
              <button type='button' className='vn-icoonknop' disabled={bezig} onClick={() => onActie(n, n.vast ? 'losmaken' : 'vast')} aria-label={n.vast ? tr(lang, `Відкріпити «${n.titel}»`, `«${n.titel}» losmaken`) : tr(lang, `Закріпити «${n.titel}»`, `«${n.titel}» vastzetten`)} title={n.vast ? tr(lang, 'Відкріпити', 'Losmaken') : tr(lang, 'Закріпити', 'Vastzetten')} data-vn-actie='vast'>{n.vast ? <PinOff /> : <Pin />}</button>
              <button type='button' className='vn-icoonknop' onClick={() => onOpen(n)} aria-label={tr(lang, `Редагувати «${n.titel}»`, `«${n.titel}» bewerken`)} title={tr(lang, 'Редагувати', 'Bewerken')} data-vn-actie='bewerk'><Pencil /></button>
              {weergave === 'archief'
                ? <button type='button' className='vn-icoonknop' disabled={bezig} onClick={() => onActie(n, 'uit-archief')} aria-label={tr(lang, `Повернути «${n.titel}» з архіву`, `«${n.titel}» uit het archief halen`)} title={tr(lang, 'З архіву', 'Uit archief')} data-vn-actie='uit-archief'><ArchiveRestore /></button>
                : <button type='button' className='vn-icoonknop' disabled={bezig} onClick={() => onActie(n, 'archief')} aria-label={tr(lang, `Архівувати «${n.titel}»`, `«${n.titel}» archiveren`)} title={tr(lang, 'В архів', 'Archiveren')} data-vn-actie='archief'><Archive /></button>}
              <button type='button' className='vn-icoonknop is-gevaar' disabled={bezig} onClick={() => onActie(n, 'prullenbak')} aria-label={tr(lang, `У кошик «${n.titel}»`, `«${n.titel}» naar de prullenbak`)} title={tr(lang, 'У кошик', 'Naar prullenbak')} data-vn-actie='prullenbak'><Trash2 /></button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
