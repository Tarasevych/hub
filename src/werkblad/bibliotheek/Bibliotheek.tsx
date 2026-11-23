// Bibliotheek «Все на сайті» / «Alles op de site» (Werkblad v3, TZ §4). Zoeken, categorieën, meervoudige selectie,
// BIB-002 (15.11.2026): вигляд «магазину» — картки з піктограмою, назвою, описом і станом, групи за категоріями, позначка «На столі».
// «Додати як ярлик / як віджет», dupliceren, sorteren, eigen naam/icoon (persoonlijke usr:-items), slepen naar het canvas.
// Toevoegen gaat ALLEEN via het contract in ./contract.ts; dit paneel schrijft zelf niets naar de server.
// Niet-beschikbare items blijven zichtbaar met hun reden (planned = «скоро», denied = waarom niet), maar zijn niet toe te voegen.
import { useMemo, useRef, useState } from 'react';
import { Blocks, Check, Copy, FileText, Folder, LayoutGrid, Pencil, Plus, Search, ShieldCheck, Star, Wrench, X, Zap, type LucideIcon } from 'lucide-react';
import {
  ICOON_PRESETS, REGISTER_CATEGORIEEN, USR_ID, dienstTitel, persoonlijkItem, toegestaanVoor, zoekRegister,
  type RegisterCategorie, type RegisterContext, type RegisterRegel,
} from '../../../shared/werkblad-register';
import { MENU_PAGINAS } from '../../../shared/menu-model';
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
  /** BIB-002: itemId's die al op de laag van dit apparaat staan (позначка «На столі»). */
  opWerkblad?: ReadonlySet<string>;
};

const nieuwUsrId = (bestaand: readonly RegisterRegel[]) => {
  for (let n = 1; n < 1000; n += 1) { const id = `usr:k${n}`; if (!bestaand.some((b) => b.id === id)) return id; }
  return `usr:k${Date.now().toString(36)}`;
};

const CAT_ICOON: Record<RegisterCategorie | 'alle', LucideIcon> = {
  alle: LayoutGrid, dienst: Blocks, pagina: FileText, opdracht: Zap, widget: LayoutGrid, persoonlijk: Star, map: Folder, technisch: Wrench,
};

/** Wat er gebeurt bij «Додати» — de tooltip legt het gevolg uit, niet de naam van de knop. */
function soortTekst(r: RegisterRegel, lang: Lang): { label: string; uitleg: string } {
  if (r.kind === 'widget') return { label: tr(lang, 'Віджет', 'Widget'), uitleg: tr(lang, 'Ставить на стіл живий блок із даними цієї служби. Розмір можна змінити.', 'Zet een live blok met gegevens van deze dienst op het werkblad. Het formaat is aan te passen.') };
  if (r.kind === 'folder') return { label: tr(lang, 'Тека', 'Map'), uitleg: tr(lang, 'Створює порожню теку на столі: перетягуйте в неї ярлики, щоб згрупувати.', 'Maakt een lege map op het werkblad: sleep er snelkoppelingen in om ze te groeperen.') };
  if (r.categorie === 'opdracht') return { label: tr(lang, 'Дія', 'Opdracht'), uitleg: tr(lang, 'Ставить кнопку, що відкриває місце для цієї дії. Сама дія нічого не надсилає й не видаляє.', 'Zet een knop die de plek voor deze handeling opent. De knop zelf verstuurt of verwijdert niets.') };
  return { label: tr(lang, 'Ярлик', 'Snelkoppeling'), uitleg: tr(lang, 'Ставить ярлик на стіл цього простору. Ярлик лише відкриває сторінку — права перевіряються під час відкриття.', 'Zet een snelkoppeling op het werkblad van deze ruimte. Ze opent alleen de pagina — rechten worden bij het openen gecontroleerd.') };
}

/** Ondertitel van een dienst: niet nog eens de naam, maar wat de kaart opent. */
function dienstOmschrijving(r: RegisterRegel, lang: Lang): string {
  const n = (MENU_PAGINAS[r.dienst ?? ''] || []).length;
  if (r.beschikbaarheid !== 'ready') return tr(lang, 'Служба в розробці', 'Dienst in ontwikkeling');
  return n > 1 ? tr(lang, `Служба · ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'сторінка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'сторінки' : 'сторінок'} у меню`, `Dienst · ${n} pagina’s in het menu`) : tr(lang, 'Служба · відкриває головну сторінку', 'Dienst · opent de startpagina');
}

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
  const techZichtbaar = p.ctx.ruimte === 'technisch' || !!p.ctx.techToegang;
  const categorieen = REGISTER_CATEGORIEEN.filter((c) => c.id !== 'technisch' || techZichtbaar);

  // Alles wat bij de zoekvraag past (zonder categoriefilter) — voor de tellers op de chips.
  const gevonden = useMemo(
    // BIB-002: без технічного доступу технічні елементи в приватному просторі не показуємо — їх однаково не можна ні додати, ні відкрити.
    () => zoekRegister(vraag, lang, { persoonlijk }).filter((x) => x.categorie !== 'technisch' || techZichtbaar),
    [vraag, lang, persoonlijk, techZichtbaar]);
  const lijst = useMemo(() => {
    const r = cat === 'alle' ? gevonden : gevonden.filter((x) => x.categorie === cat);
    if (sort === 'naam') return [...r].sort((a, b) => a.titel[lang].localeCompare(b.titel[lang], lang === 'uk' ? 'uk' : 'nl'));
    if (sort === 'categorie') { const v = REGISTER_CATEGORIEEN.map((c) => c.id); return [...r].sort((a, b) => v.indexOf(a.categorie) - v.indexOf(b.categorie)); }
    return r;
  }, [gevonden, cat, sort, lang]);
  // «Усе» zonder zoekvraag en in de menuvolgorde: per categorie een eigen plank, zoals in een winkel.
  const groepen = useMemo(() => {
    if (cat !== 'alle' || vraag.trim() || sort === 'naam') return [{ id: cat, titel: null as string | null, items: lijst }];
    return categorieen.map((c) => ({ id: c.id, titel: c.titel[lang] as string | null, items: lijst.filter((x) => x.categorie === c.id) })).filter((g) => g.items.length);
  }, [cat, vraag, sort, lijst, categorieen, lang]);

  const stuur = (v: BibliotheekVerzoek) => (p.onToevoegen ? p.onToevoegen(v) : stuurToevoegen(v));
  const soortVan = (r: RegisterRegel) => (r.kind === 'widget' ? 'widget' : r.kind === 'folder' ? 'folder' : 'shortcut') as 'shortcut' | 'widget' | 'folder';
  const voegToe = (r: RegisterRegel, kind: 'shortcut' | 'widget' | 'folder') => {
    if (!toegestaanVoor(r, p.ctx).ok) return false;
    stuur({ itemId: r.id, kind });
    return true;
  };
  const enkel = (r: RegisterRegel) => { if (voegToe(r, soortVan(r))) setStatus(tr(lang, `Додано: ${r.titel.uk}`, `Toegevoegd: ${r.titel.nl}`)); };
  const meerdere = () => {
    let n = 0;
    for (const r of gevonden) if (gekozen.has(r.id) && voegToe(r, soortVan(r))) n += 1;
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

  const kaart = (r: RegisterRegel) => {
    const t = toegestaanVoor(r, p.ctx);
    const sub = r.kind === 'widget' ? (r.uitleg?.[lang] ?? '')
      : r.categorie === 'map' ? tr(lang, 'Групуйте ярлики в одну плитку.', 'Groepeer snelkoppelingen in één tegel.')
      : r.id.startsWith('svc:') ? dienstOmschrijving(r, lang)
      : dienstTitel(r, lang);
    const soort = soortTekst(r, lang);
    const deur = !!r.techDeur && p.ctx.ruimte === 'prive';
    const opStal = !!p.opWerkblad?.has(r.id) && r.kind !== 'folder';
    const isGekozen = gekozen.has(r.id);
    const knopTekst = r.kind === 'folder' ? tr(lang, 'Додати теку', 'Map toevoegen') : r.kind === 'widget' ? tr(lang, 'Додати віджет', 'Widget toevoegen') : tr(lang, 'Додати', 'Toevoegen');
    return (
      <li key={r.id} className={`bib-kaart${t.ok ? '' : ' bib-uit'}${isGekozen ? ' is-gekozen' : ''}`} style={accentStijl(r.accent, !!p.donker)} data-bib-id={r.id} data-bib-stand={t.ok ? 'ready' : t.beschikbaarheid}
        draggable={t.ok} onDragStart={(e) => { if (!t.ok) { e.preventDefault(); return; } zetSleepData(e.dataTransfer, { itemId: r.id, kind: r.kind }); }}>
        <div className='bib-kaart-boven'>
          <span className='bib-kaart-icoon'><RegisterIcoon icoon={r.icoon} /></span>
          <span className='bib-labels'>
            {t.ok ? <span className='bib-label' title={soort.uitleg}>{soort.label}</span>
              : <span className={`bib-label ${t.beschikbaarheid === 'planned' ? 'is-skoro' : 'is-uit'}`}>{t.beschikbaarheid === 'planned' ? tr(lang, 'Скоро', 'Binnenkort') : tr(lang, 'Недоступно', 'Niet beschikbaar')}</span>}
            {deur && t.ok ? <span className='bib-label is-deur' title={tr(lang, 'Ярлик веде в технічний простір. Сам він нічого не відкриває без вас: на сторінці вкладка попросить увімкнути технічний профіль (з ключем доступу, якщо потрібно). Технічні дані на приватному столі не показуються.', 'Deze snelkoppeling leidt naar de technische ruimte. Op de pagina vraagt het tabblad om het technisch profiel aan te zetten (zo nodig met passkey). Technische gegevens verschijnen niet op het privéwerkblad.')}><ShieldCheck aria-hidden='true' />{tr(lang, 'Техн. простір', 'Techn. ruimte')}</span> : null}
            {opStal ? <span className='bib-label is-op-stal' title={tr(lang, 'Цей елемент уже є на столі цього пристрою. Можна додати ще раз.', 'Dit item staat al op het werkblad van dit apparaat. Nog eens toevoegen kan.')}><Check aria-hidden='true' />{tr(lang, 'На столі', 'Op werkblad')}</span> : null}
          </span>
          <label className='bib-kies' title={t.ok ? tr(lang, 'Позначте кілька карток і додайте їх разом кнопкою внизу.', 'Vink meerdere kaarten aan en voeg ze samen toe met de knop onderaan.') : undefined}>
            <input type='checkbox' checked={isGekozen} disabled={!t.ok} onChange={() => wissel(r.id)} />
            <span className='bib-sr'>{tr(lang, `Вибрати «${r.titel.uk}»`, `«${r.titel.nl}» kiezen`)}</span>
          </label>
        </div>
        <div className='bib-kaart-tekst'>
          <strong>{r.titel[lang]}</strong>
          {sub && <small>{sub}</small>}
          {!t.ok && <small className='bib-reden'>{t.beschikbaarheid === 'planned' ? tr(lang, 'Скоро: ', 'Binnenkort: ') : tr(lang, 'Недоступно: ', 'Niet beschikbaar: ')}{t.reden[lang]}</small>}
        </div>
        <div className='bib-acties'>
          <button type='button' className='bib-knop bib-toevoeg' disabled={!t.ok} title={t.ok ? soort.uitleg : t.reden[lang]} onClick={() => enkel(r)}><Plus aria-hidden='true' />{knopTekst}</button>
          {r.kind === 'shortcut' && p.onPersoonlijk && <button type='button' className='bib-ikoonknop' disabled={!t.ok} title={tr(lang, 'Створити власну копію в «Мої ярлики» — оригінал не зміниться.', 'Een eigen kopie maken in «Mijn snelkoppelingen» — het origineel blijft.')} onClick={() => dupliceer(r)} aria-label={tr(lang, `Дублювати «${r.titel.uk}»`, `«${r.titel.nl}» dupliceren`)}><Copy aria-hidden='true' /></button>}
          {r.kind === 'shortcut' && p.onPersoonlijk && <button type='button' className='bib-ikoonknop' title={tr(lang, 'Своя назва й значок для ярлика. Назва служби на сайті не зміниться.', 'Eigen naam en icoon voor de snelkoppeling. De naam van de dienst op de site blijft.')} onClick={() => setBewerk(r)} aria-label={tr(lang, `Перейменувати або змінити значок «${r.titel.uk}»`, `Naam of icoon van «${r.titel.nl}» wijzigen`)}><Pencil aria-hidden='true' /></button>}
        </div>
      </li>
    );
  };

  return (
    <section className='bib-paneel bib-winkel' aria-labelledby='bib-titel' onKeyDown={(e) => { if (e.key === 'Escape' && !bewerk && p.onSluiten) { e.stopPropagation(); p.onSluiten(); } }}>
      <header className='bib-kop'>
        <div className='bib-kop-tekst'>
          <h2 id='bib-titel'>{tr(lang, 'Все на сайті', 'Alles op de site')}</h2>
          <p>{tr(lang, 'Служби, сторінки, дії й віджети для вашого столу. Натисніть «Додати» або перетягніть картку на стіл.', 'Diensten, pagina’s, opdrachten en widgets voor uw werkblad. Klik op «Toevoegen» of sleep een kaart naar het werkblad.')}</p>
        </div>
        {p.onSluiten && <button type='button' className='bib-ikoonknop' onClick={p.onSluiten} aria-label={tr(lang, 'Закрити бібліотеку', 'Bibliotheek sluiten')}><X aria-hidden='true' /></button>}
      </header>
      <label className='bib-zoek'>
        <Search aria-hidden='true' />
        <span className='bib-sr'>{tr(lang, 'Пошук у бібліотеці', 'Zoeken in de bibliotheek')}</span>
        <input ref={zoekRef} type='search' value={vraag} maxLength={80} onChange={(e) => setVraag(e.target.value)} placeholder={tr(lang, 'Пошук служб, сторінок, віджетів…', 'Zoek diensten, pagina’s, widgets…')} />
      </label>
      <div className='bib-chips' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
        {[{ id: 'alle' as const, titel: { uk: 'Усе', nl: 'Alles' } }, ...categorieen].map((c) => {
          const I = CAT_ICOON[c.id];
          const n = c.id === 'alle' ? gevonden.length : gevonden.filter((x) => x.categorie === c.id).length;
          return (
            <button key={c.id} type='button' className='bib-chip' aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              <I aria-hidden='true' /><span className='bib-chip-naam'>{c.titel[lang]}</span><span className='bib-chip-aantal' aria-hidden='true'>{n}</span>
            </button>
          );
        })}
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
      </div>
      <div className='bib-schap'>
        {lijst.length === 0 && <p className='bib-leeg'>{tr(lang, 'Нічого не знайдено. Спробуйте інше слово або категорію «Усе».', 'Niets gevonden. Probeer een ander woord of de categorie «Alles».')}</p>}
        {groepen.map((g) => (
          <section key={g.id} className='bib-groep' aria-label={g.titel ?? undefined}>
            {g.titel ? <h3 className='bib-groep-kop'><span>{g.titel}</span><small>{g.items.length}</small></h3> : null}
            <ul className='bib-raster' aria-label={g.titel ?? tr(lang, 'Елементи бібліотеки', 'Items van de bibliotheek')}>{g.items.map(kaart)}</ul>
          </section>
        ))}
      </div>
      {gekozen.size > 0 && (
        <div className='bib-voet' role='region' aria-label={tr(lang, 'Вибрані елементи', 'Gekozen items')}>
          <span>{tr(lang, `Вибрано: ${gekozen.size}`, `Gekozen: ${gekozen.size}`)}</span>
          <button type='button' className='bib-knop' onClick={() => setGekozen(new Set())}>{tr(lang, 'Зняти вибір', 'Keuze wissen')}</button>
          <button type='button' className='bib-knop bib-primair' onClick={meerdere}><Plus aria-hidden='true' />{tr(lang, `Додати вибрані (${gekozen.size})`, `Gekozen toevoegen (${gekozen.size})`)}</button>
        </div>
      )}
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
