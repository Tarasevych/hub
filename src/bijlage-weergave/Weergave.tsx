// Спільний перегляд вкладень, етап 1 (Grok: hub.tarasevych.com). Vlag `bijlage-weergave-gedeeld-v1`, standaard UIT.
// Omlijsting rond de bestaande formaatweergaven: kop in één regel (naam, vertrouwenslabel, hoofdactie, «Подробиці», «⋯», sluiten),
// snelle kaart, strook met alle bijlagen en een eerlijke laad- en foutstaat. Weet niets van de mail: de bron geeft gegevens en
// acties door. Concept: docs/concept/bijlage-weergave/CONCEPT.md.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Info, LoaderCircle, MoreHorizontal, RotateCcw, X } from 'lucide-react';
import { formaatVan, grootteTekst, kies, soortVan, type Taal } from './soort';
import { bewijsUitBlob, type Vertrouwen } from './vertrouwen';
import { technischeRijen } from './details';
import { actiesVoor, type Beschikbaar } from './acties';
import './weergave.css';

export type WeergaveItem = { naam: string; contentType: string; grootte: number };

export type KopProps = {
  taal: Taal;
  naam: string;
  contentType: string;
  grootte: number;
  blob?: Blob | null;
  archiefNamen?: string[];
  nav: { index: number; totaal: number } | null;
  beschikbaar: Beschikbaar;
  /** zoom alleen voor afbeeldingen (canvas) */
  zoom?: { waarde: number; zet: (v: number) => void } | null;
  /** volgende bijlage wordt geladen of mislukte */
  staat?: { fase: 'laden' | 'fout'; naam: string; code: string; onOpnieuw: () => void } | null;
  onSluit: () => void;
};

const t2 = (taal: Taal) => (uk: string, nl: string) => kies(taal, [uk, nl]);

/** Eén menu tegelijk; sluit bij een klik buiten of Escape (Escape van de viewer zelf gaat pas daarna). */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', klik, true); document.addEventListener('keydown', toets, true);
    return () => { document.removeEventListener('mousedown', klik, true); document.removeEventListener('keydown', toets, true); };
  }, [open]);
  return { open, setOpen, ref };
}

export function foutTekst(code: string): [string, string] {
  if (/TOO_LARGE/.test(code)) return ['Вкладення завелике для безпечного перегляду. Оригінал не змінено, його можна завантажити.', 'De bijlage is te groot voor een veilige weergave. Het origineel is ongewijzigd en kan worden gedownload.'];
  if (/NETWORK|Network|Failed to fetch|ERR_|offline/i.test(code)) return ['Немає зв’язку із сервером. Перевірте мережу й спробуйте ще раз.', 'Geen verbinding met de server. Controleer het netwerk en probeer opnieuw.'];
  if (/TIJD|TIMEOUT|timeout/i.test(code)) return ['Сервер пошти не відповів вчасно. Нічого не втрачено.', 'De mailserver antwoordde niet op tijd. Er is niets verloren.'];
  return ['Сервер пошти не віддав файл. Нічого не втрачено — спробуйте ще раз.', 'De mailserver gaf het bestand niet terug. Er is niets verloren — probeer opnieuw.'];
}

export function WeergaveKop(p: KopProps) {
  const t = t2(p.taal);
  const soort = soortVan(p.naam, p.contentType);
  const formaat = formaatVan(p.naam);
  const [vertrouwen, setVertrouwen] = useState<Vertrouwen | null>(null);
  const [maat, setMaat] = useState<{ b: number; h: number } | null>(null);
  const meer = useMenu(), info = useMenu();
  const infoId = useId();
  useEffect(() => {
    let weg = false; setVertrouwen(null); setMaat(null);
    if (p.blob) {
      void bewijsUitBlob(p.blob, p.naam, p.archiefNamen).then((v) => { if (!weg) setVertrouwen(v); }).catch(() => undefined);
      if (soort.sleutel === 'foto' && typeof createImageBitmap === 'function') void createImageBitmap(p.blob).then((bm) => { if (!weg) setMaat({ b: bm.width, h: bm.height }); bm.close(); }).catch(() => undefined);
    }
    return () => { weg = true; };
  }, [p.blob, p.naam]);
  const { hoofd, overig } = actiesVoor(soort.sleutel, formaat, p.beschikbaar);
  const plaats = p.nav && p.nav.totaal > 1 ? t(`вкладення ${p.nav.index + 1} з ${p.nav.totaal}`, `bijlage ${p.nav.index + 1} van ${p.nav.totaal}`) : '';
  const feiten = [formaat, grootteTekst(p.grootte, p.taal), plaats].filter(Boolean).join(' · ');
  const niveau = vertrouwen?.niveau || 'bezig';
  return (
    <header className='weergave-kop' data-weergave-kop=''>
      <div className='weergave-rij'>
        <div className='weergave-titel'>
          <strong title={p.naam}>{p.naam}</strong>
          <span>{kies(p.taal, soort.naam)}{feiten ? ` · ${feiten}` : ''}</span>
        </div>
        <span className='weergave-vertrouwen' data-niveau={niveau} title={vertrouwen ? kies(p.taal, vertrouwen.zin) : ''} role='status'>
          <i aria-hidden='true' />
          <span className='weergave-vertrouwen-zin'>{vertrouwen ? kies(p.taal, vertrouwen.zin) : t('Перевіряємо файл…', 'Bestand nagaan…')}</span>
          <span className='weergave-vertrouwen-kort'>{vertrouwen ? kies(p.taal, vertrouwen.kort) : t('Перевірка', 'Nagaan')}</span>
        </span>
        <div className='weergave-knoppen' role='toolbar' aria-label={t('Дії вкладення', 'Bijlageacties')}>
          {hoofd && <button type='button' className='weergave-hoofd' onClick={hoofd.uitvoeren}>{kies(p.taal, hoofd.label)}</button>}
          <div className='weergave-menu-anker' ref={info.ref}>
            <button type='button' className='weergave-knop' aria-expanded={info.open} aria-controls={infoId} onClick={() => { meer.setOpen(false); info.setOpen(!info.open); }}>
              <Info aria-hidden='true' /><span>{t('Подробиці', 'Details')}</span>
            </button>
            {info.open && (
              <div className='weergave-paneel' id={infoId} role='dialog' aria-label={t('Подробиці про файл', 'Details over het bestand')}>
                <dl>{technischeRijen({ taal: p.taal, naam: p.naam, contentType: p.contentType, grootte: p.grootte, vertrouwen, breedte: maat?.b, hoogte: maat?.h }).map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.waarde}</dd></div>)}</dl>
                {vertrouwen && <ul className='weergave-bevindingen'>{vertrouwen.bevindingen.map((b) => <li key={b.sleutel} data-ernst={b.ernst}>{kies(p.taal, b.tekst)}</li>)}</ul>}
              </div>
            )}
          </div>
          {(overig.length > 0 || p.zoom) && (
            <div className='weergave-menu-anker' ref={meer.ref}>
              <button type='button' className='weergave-knop rond' aria-label={t('Ще дії', 'Meer acties')} title={t('Ще дії', 'Meer acties')} aria-expanded={meer.open} onClick={() => { info.setOpen(false); meer.setOpen(!meer.open); }}><MoreHorizontal aria-hidden='true' /></button>
              {meer.open && (
                <div className='weergave-paneel menu' role='menu'>
                  {p.zoom && <div className='weergave-zoom' role='group' aria-label={t('Масштаб', 'Zoom')}>
                    <button type='button' role='menuitem' onClick={() => p.zoom!.zet(Math.max(0.5, Math.round((p.zoom!.waarde - 0.1) * 10) / 10))}>−</button>
                    <button type='button' role='menuitem' onClick={() => p.zoom!.zet(1)}>{Math.round(p.zoom.waarde * 100)} %</button>
                    <button type='button' role='menuitem' onClick={() => p.zoom!.zet(Math.min(2.5, Math.round((p.zoom!.waarde + 0.1) * 10) / 10))}>+</button>
                  </div>}
                  {overig.map((a) => <button key={a.sleutel} type='button' role='menuitem' onClick={() => { meer.setOpen(false); a.uitvoeren(); }}>{kies(p.taal, a.label)}</button>)}
                </div>
              )}
            </div>
          )}
          <button type='button' className='weergave-knop rond' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={p.onSluit}><X aria-hidden='true' /></button>
        </div>
      </div>
      {p.staat && (
        <div className='weergave-melding' data-fase={p.staat.fase} role={p.staat.fase === 'fout' ? 'alert' : 'status'}>
          {p.staat.fase === 'laden'
            ? <><LoaderCircle className='spin' aria-hidden='true' /><span>{t(`Завантажуємо «${p.staat.naam}»…`, `«${p.staat.naam}» laden…`)}</span></>
            : <><span>{t(`«${p.staat.naam}»: `, `«${p.staat.naam}»: `)}{kies(p.taal, foutTekst(p.staat.code))}</span><button type='button' onClick={p.staat.onOpnieuw}><RotateCcw aria-hidden='true' />{t('Спробувати ще раз', 'Opnieuw proberen')}</button></>}
        </div>
      )}
    </header>
  );
}

export function WeergaveStrook(p: { taal: Taal; items: WeergaveItem[]; index: number; onKies: (i: number) => void }) {
  const t = t2(p.taal);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [p.index]);
  if (p.items.length < 2) return null;
  return (
    <nav className='weergave-strook' aria-label={t('Усі вкладення листа', 'Alle bijlagen van het bericht')}>
      <button type='button' className='weergave-knop rond' aria-label={t('Попереднє вкладення', 'Vorige bijlage')} disabled={p.index <= 0} onClick={() => p.onKies(p.index - 1)}><ChevronLeft aria-hidden='true' /></button>
      <div className='weergave-strook-lijst' ref={ref}>
        {p.items.map((it, i) => {
          const s = soortVan(it.naam, it.contentType);
          return (
            <button key={`${i}:${it.naam}`} type='button' className='weergave-mini' data-soort={s.sleutel} aria-current={i === p.index ? 'true' : undefined} title={it.naam} onClick={() => p.onKies(i)}>
              <b>{kies(p.taal, s.kort)}</b><span>{it.naam}</span>
            </button>
          );
        })}
      </div>
      <span className='weergave-strook-teller'>{t(`${p.index + 1} з ${p.items.length}`, `${p.index + 1} van ${p.items.length}`)}</span>
      <button type='button' className='weergave-knop rond' aria-label={t('Наступне вкладення', 'Volgende bijlage')} disabled={p.index >= p.items.length - 1} onClick={() => p.onKies(p.index + 1)}><ChevronRight aria-hidden='true' /></button>
    </nav>
  );
}

/** Eerste opening: het venster verschijnt meteen, ook tijdens het laden en bij een fout (niet stil dichtgaan). */
export function WeergaveStaatVenster(p: { taal: Taal; naam: string; contentType: string; grootte: number; fase: 'laden' | 'fout'; code: string; stijl?: CSSProperties; onOpnieuw: () => void; onSluit: () => void }) {
  const t = t2(p.taal);
  const soort = soortVan(p.naam, p.contentType);
  const knop = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { knop.current?.focus({ preventScroll: true }); }, [p.fase]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); p.onSluit(); } };
    document.addEventListener('keydown', toets); return () => document.removeEventListener('keydown', toets);
  }, [p.onSluit]);
  return (
    <div className='google-mail-attachment-backdrop weergave-staat-achtergrond' style={p.stijl} role='presentation'>
      <article className='google-mail-attachment-preview weergave-staat' data-gedeelde-weergave='aan' role='dialog' aria-modal='true' aria-label={p.naam}>
        <header className='weergave-kop'><div className='weergave-rij'>
          <div className='weergave-titel'><strong title={p.naam}>{p.naam}</strong><span>{kies(p.taal, soort.naam)} · {grootteTekst(p.grootte, p.taal)}</span></div>
          <div className='weergave-knoppen'><button type='button' className='weergave-knop rond' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={p.onSluit} ref={p.fase === 'laden' ? knop : undefined}><X aria-hidden='true' /></button></div>
        </div></header>
        <section className='weergave-staat-inhoud' data-fase={p.fase} role={p.fase === 'fout' ? 'alert' : 'status'} aria-live='polite'>
          {p.fase === 'laden'
            ? <><LoaderCircle className='spin' aria-hidden='true' /><strong>{t('Завантажуємо вкладення…', 'Bijlage laden…')}</strong><span>{t('Файл береться просто з пошти й ніде не зберігається.', 'Het bestand komt rechtstreeks uit de mail en wordt nergens bewaard.')}</span></>
            : <><strong>{t('Не вдалося відкрити вкладення', 'Bijlage kon niet worden geopend')}</strong><span>{kies(p.taal, foutTekst(p.code))}</span>
                <div className='weergave-staat-knoppen'><button type='button' className='weergave-hoofd' ref={knop} onClick={p.onOpnieuw}><RotateCcw aria-hidden='true' />{t('Спробувати ще раз', 'Opnieuw proberen')}</button><button type='button' className='weergave-knop' onClick={p.onSluit}>{t('Закрити', 'Sluiten')}</button></div></>}
        </section>
      </article>
    </div>
  );
}
