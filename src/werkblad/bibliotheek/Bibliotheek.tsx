// Bibliotheek «Все на сайті» / «Alles op de site» (Werkblad v3, TZ §4). Zoeken, categorieën, meervoudige selectie,
// «Додати як ярлик / як віджет», dupliceren, sorteren, eigen naam/icoon (persoonlijke usr:-items), slepen naar het canvas.
// Toevoegen gaat ALLEEN via het contract in ./contract.ts; dit paneel schrijft zelf niets naar de server.
// Niet-beschikbare items blijven zichtbaar met hun reden (planned = «скоро», denied = waarom niet), maar zijn niet toe te voegen.
import { useMemo, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Search, X } from 'lucide-react';
import {
  ICOON_PRESETS, REGISTER_CATEGORIEEN, USR_ID, dienstTitel, kanAlsSnelkoppeling, kanAlsWidget, persoonlijkItem, toegestaanVoor, zoekRegister,
  type RegisterCategorie, type RegisterContext, type RegisterRegel,
} from '../../../shared/werkblad-register';
import { RegisterIcoon } from './icoon';
import { stuurToevoegen, zetSleepData, type BibliotheekVerzoek } from './contract';
import { accentStijl } from './tegels';
import { tr, type Lang } from '../soorten';
import './bibliotheek.css';

export type Sortering = 'standaard' | 'naam' | 'categorie';
export type BibliotheekProps = {
  lang: Lang; ctx: RegisterContext; donker?: boolean;
  /** Persoonlijke snelkoppelingen (usr:) — bewaard door de datalaag; dit paneel stelt alleen een nieuwe lijst voor. */
  persoonlijk?: readonly RegisterRegel[];
  onPersoonlijk?: (lijst: RegisterRegel[]) => void;
  /** Standaard: CustomEvent op window (contract). Tests/canvas mogen een eigen ontvanger geven. */
  onToevoegen?: (v: BibliotheekVerzoek) => void;
  onSluiten?: () => void;
};

const nieuwUsrId = (bestaand: readonly RegisterRegel[]) => {
  for (let n = 1; n < 1000; n += 1) { const id = `usr:k${n}`; if (!bestaand.some((b) => b.id === id)) return id; }
  return `usr:k${Date.now().toString(36)}`;
};

export function Bibliotheek(p: BibliotheekProps) {
  const lang = p.lang;
  const [vraag, setVraag] = useState('');
  const [cat, setCat] = useState<RegisterCategorie | 'alle'>('alle');
  const [sort, setSort] = useState<Sortering>('standaard');
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [bewerk, setBewerk] = useState<RegisterRegel | null>(null);
  const [status, setStatus] = useState('');
  const persoonlijk = p.persoonlijk ?? [];
  const zoekRef = useRef<HTMLInputElement>(null);

  const lijst = useMemo(() => {
    const r = zoekRegister(vraag, lang, { categorie: cat, persoonlijk });
    if (sort === 'naam') return [...r].sort((a, b) => a.titel[lang].localeCompare(b.titel[lang], lang === 'uk' ? 'uk' : 'nl'));
    if (sort === 'categorie') { const v = REGISTER_CATEGORIEEN.map((c) => c.id); return [...r].sort((a, b) => v.indexOf(a.categorie) - v.indexOf(b.categorie)); }
    return r;
  }, [vraag, lang, cat, sort, persoonlijk]);

  const stuur = (v: BibliotheekVerzoek) => (p.onToevoegen ? p.onToevoegen(v) : stuurToevoegen(v));
  const voegToe = (r: RegisterRegel, kind: 'shortcut' | 'widget' | 'folder') => {
    if (!toegestaanVoor(r, p.ctx).ok) return false;
    stuur({ itemId: r.id, kind });
    return true;
  };
  const enkel = (r: RegisterRegel, kind: 'shortcut' | 'widget' | 'folder') => { if (voegToe(r, kind)) setStatus(tr(lang, `Додано: ${r.titel.uk}`, `Toegevoegd: ${r.titel.nl}`)); };
  const meerdere = () => {
    let n = 0;
    for (const r of lijst) if (gekozen.has(r.id) && voegToe(r, r.kind === 'widget' ? 'widget' : r.kind === 'folder' ? 'folder' : 'shortcut')) n += 1;
    setGekozen(new Set());
    setStatus(tr(lang, `Додано елементів: ${n}`, `Items toegevoegd: ${n}`));
  };
  const dupliceer = (r: RegisterRegel) => {
    const basis = r.basis ?? r.id;
    const nieuw = persoonlijkItem({ id: nieuwUsrId(persoonlijk), basis, titel: `${r.titel[lang]} (2)`, icoon: r.icoon });
    if (!nieuw || !p.onPersoonlijk) return;
    p.onPersoonlijk([...persoonlijk, nieuw]);
    setStatus(tr(lang, 'Створено копію в «Мої ярлики».', 'Kopie gemaakt in «Mijn snelkoppelingen».'));
  };
  const wissel = (id: string) => setGekozen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className='bib-paneel' aria-labelledby='bib-titel' onKeyDown={(e) => { if (e.key === 'Escape' && !bewerk && p.onSluiten) { e.stopPropagation(); p.onSluiten(); } }}>
      <header className='bib-kop'>
        <h2 id='bib-titel'>{tr(lang, 'Все на сайті', 'Alles op de site')}</h2>
        {p.onSluiten && <button type='button' className='bib-ikoonknop' onClick={p.onSluiten} aria-label={tr(lang, 'Закрити бібліотеку', 'Bibliotheek sluiten')}><X aria-hidden='true' /></button>}
      </header>
      <label className='bib-zoek'>
        <Search aria-hidden='true' />
        <span className='bib-sr'>{tr(lang, 'Пошук у бібліотеці', 'Zoeken in de bibliotheek')}</span>
        <input ref={zoekRef} type='search' value={vraag} maxLength={80} onChange={(e) => setVraag(e.target.value)} placeholder={tr(lang, 'Пошук служб, сторінок, віджетів…', 'Zoek diensten, pagina’s, widgets…')} />
      </label>
      <div className='bib-chips' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
        {[{ id: 'alle' as const, titel: { uk: 'Усе', nl: 'Alles' } }, ...REGISTER_CATEGORIEEN].map((c) => (
          <button key={c.id} type='button' className='bib-chip' aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.titel[lang]}</button>
        ))}
      </div>
      <div className='bib-balk'>
        <label>{tr(lang, 'Сортувати', 'Sorteren')}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sortering)}>
            <option value='standaard'>{tr(lang, 'Як у меню', 'Zoals in het menu')}</option>
            <option value='naam'>{tr(lang, 'За назвою', 'Op naam')}</option>
            <option value='categorie'>{tr(lang, 'За категорією', 'Op categorie')}</option>
          </select>
        </label>
        <span aria-live='polite' className='bib-aantal'>{tr(lang, `Знайдено: ${lijst.length}`, `Gevonden: ${lijst.length}`)}</span>
        <button type='button' className='bib-knop bib-primair' disabled={!gekozen.size} onClick={meerdere}><Plus aria-hidden='true' />{tr(lang, `Додати вибрані (${gekozen.size})`, `Gekozen toevoegen (${gekozen.size})`)}</button>
      </div>
      <ul className='bib-lijst' aria-label={tr(lang, 'Елементи бібліотеки', 'Items van de bibliotheek')}>
        {lijst.length === 0 && <li className='bib-leeg'>{tr(lang, 'Нічого не знайдено.', 'Niets gevonden.')}</li>}
        {lijst.map((r) => {
          const t = toegestaanVoor(r, p.ctx);
          const sub = r.categorie === 'widget' || r.categorie === 'technisch' && r.kind === 'widget' ? (r.uitleg?.[lang] ?? '') : dienstTitel(r, lang);
          return (
            <li key={r.id} className={`bib-rij${t.ok ? '' : ' bib-uit'}`} style={accentStijl(r.accent, !!p.donker)} data-bib-id={r.id} data-bib-stand={t.ok ? 'ready' : t.beschikbaarheid}
              draggable={t.ok} onDragStart={(e) => { if (!t.ok) { e.preventDefault(); return; } zetSleepData(e.dataTransfer, { itemId: r.id, kind: r.kind }); }}>
              <label className='bib-kies'>
                <input type='checkbox' checked={gekozen.has(r.id)} disabled={!t.ok} onChange={() => wissel(r.id)} />
                <span className='bib-sr'>{tr(lang, `Вибрати «${r.titel.uk}»`, `«${r.titel.nl}» kiezen`)}</span>
              </label>
              <span className='bib-rij-icoon'><RegisterIcoon icoon={r.icoon} /></span>
              <span className='bib-rij-tekst'>
                <strong>{r.titel[lang]}</strong>
                {sub && <small>{sub}</small>}
                {!t.ok && <small className='bib-reden'>{t.beschikbaarheid === 'planned' ? tr(lang, 'Скоро: ', 'Binnenkort: ') : tr(lang, 'Недоступно: ', 'Niet beschikbaar: ')}{t.reden[lang]}</small>}
              </span>
              <span className='bib-acties'>
                {kanAlsSnelkoppeling(r) && <button type='button' className='bib-knop' disabled={!t.ok} onClick={() => enkel(r, r.kind === 'folder' ? 'folder' : 'shortcut')}>{r.kind === 'folder' ? tr(lang, 'Додати теку', 'Map toevoegen') : tr(lang, 'Як ярлик', 'Als snelkoppeling')}</button>}
                {kanAlsWidget(r) && <button type='button' className='bib-knop' disabled={!t.ok} onClick={() => enkel(r, 'widget')}>{tr(lang, 'Як віджет', 'Als widget')}</button>}
                {r.kind === 'shortcut' && p.onPersoonlijk && <button type='button' className='bib-ikoonknop' disabled={!t.ok} onClick={() => dupliceer(r)} aria-label={tr(lang, `Дублювати «${r.titel.uk}»`, `«${r.titel.nl}» dupliceren`)}><Copy aria-hidden='true' /></button>}
                {r.kind === 'shortcut' && p.onPersoonlijk && <button type='button' className='bib-ikoonknop' onClick={() => setBewerk(r)} aria-label={tr(lang, `Перейменувати або змінити значок «${r.titel.uk}»`, `Naam of icoon van «${r.titel.nl}» wijzigen`)}><Pencil aria-hidden='true' /></button>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className='bib-sr' role='status'>{status}</p>
      {bewerk && <BewerkVenster lang={lang} item={bewerk} onAnnuleer={() => setBewerk(null)} onBewaar={(naam, icoon) => {
        const lijstNu = [...persoonlijk];
        const bestaand = USR_ID.test(bewerk.id) ? lijstNu.findIndex((x) => x.id === bewerk.id) : -1;
        const nieuw = persoonlijkItem({ id: bestaand >= 0 ? bewerk.id : nieuwUsrId(lijstNu), basis: bewerk.basis ?? bewerk.id, titel: naam, icoon });
        if (nieuw && p.onPersoonlijk) { if (bestaand >= 0) lijstNu[bestaand] = nieuw; else lijstNu.push(nieuw); p.onPersoonlijk(lijstNu); }
        setBewerk(null);
        setStatus(tr(lang, 'Збережено в «Мої ярлики». Назва служби не змінилася.', 'Bewaard in «Mijn snelkoppelingen». De naam van de dienst is niet gewijzigd.'));
      }} />}
    </section>
  );
}

function BewerkVenster({ lang, item, onAnnuleer, onBewaar }: { lang: Lang; item: RegisterRegel; onAnnuleer: () => void; onBewaar: (naam: string, icoon: string) => void }) {
  const [naam, setNaam] = useState(item.titel[lang]);
  const [icoon, setIcoon] = useState(item.icoon);
  return (
    <div className='bib-bewerk' role='dialog' aria-modal='true' aria-labelledby='bib-bewerk-titel' onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onAnnuleer(); } }}>
      <form onSubmit={(e) => { e.preventDefault(); onBewaar(naam, icoon); }}>
        <h3 id='bib-bewerk-titel'>{tr(lang, 'Мій ярлик', 'Mijn snelkoppeling')}</h3>
        <label>{tr(lang, 'Назва', 'Naam')}<input autoFocus value={naam} maxLength={60} onChange={(e) => setNaam(e.target.value)} /></label>
        <fieldset className='bib-iconen'>
          <legend>{tr(lang, 'Значок (лише з набору)', 'Icoon (alleen uit de set)')}</legend>
          {ICOON_PRESETS.map((i) => (
            <label key={i} className='bib-icoonkeuze' title={i}>
              <input type='radio' name='bib-icoon' value={i} checked={icoon === i} onChange={() => setIcoon(i)} />
              <RegisterIcoon icoon={i} /><span className='bib-sr'>{i}</span>
            </label>
          ))}
        </fieldset>
        <div className='bib-balk'>
          <button type='button' className='bib-knop' onClick={onAnnuleer}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
          <button type='submit' className='bib-knop bib-primair'>{tr(lang, 'Зберегти', 'Bewaren')}</button>
        </div>
      </form>
    </div>
  );
}
