// «Швидкий доступ» / «Snelle toegang» — een UITDRUKKELIJKE bewerker (punt 17, audit 19.10.2026).
// Tot nu kon de snelbalk alleen met SLEPEN worden gevuld: op een telefoon vrijwel onmogelijk, met het toetsenbord onvindbaar, en er
// was geen kleurverschil tussen de knoppen. Hier kan alles met gewone knoppen en selecties: een punt toevoegen, weghalen, met
// ↑/↓ (of Alt+pijltjes) van plaats wisselen, een eigen icoon en een eigen KLEUR kiezen, en alles terugzetten.
//
// Alles geldt alleen voor DIT account en alleen voor DEZE webruimte (gebruikersruimte of technisch profiel): de voorkeuren staan per
// account én per ruimte op de server (zie src/zijbalk-voorkeuren.ts en shared/menu-model.ts). Elke wijziging gaat via `menuWijzigen`,
// dus met «Ongedaan maken» en meteen op alle subdomeinen.
import { useMemo, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Palette, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import { ACCENTEN, DIENST_ACCENT, type Accent } from '../shared/menu-model';
import { isBeheerPagina } from '../shared/beheer-paginas';
import { itemIcoonZetten, itemKleurZetten, menuWeergave, nieuweKopieId, ontleed, snelKandidaten, snelStap, snelToevoegen, snelWeg, snelbalkTerugzetten, type Basis, type Rij } from '../shared/menu-indeling';
import { dienstToegestaan, type AccountRechten } from './account-rechten';
import { MENU_CATALOG, MENU_ICON_OPTIONS, MenuGlyph, TECH_MENU, isSiteBeheer, localTabIcon } from './menu-voorkeuren';
import { itemNaam } from './MenuIndelingInstellingen';
import { menuWijzigen } from './menu-bewerken';
import { techActief, useTech } from './tech/tech-opslag';
import { useZijbalkVoorkeuren, zijbalkHuidigeRuimte } from './zijbalk-voorkeuren';

type Tr = (uk: string, nl: string) => string;
const KLEUR_NAAM: Record<Accent, [string, string]> = {
  teal: ['Бірюзовий', 'Turkoois'], violet: ['Фіолетовий', 'Violet'], blauw: ['Синій', 'Blauw'], hemel: ['Блакитний', 'Hemelsblauw'],
  grafiet: ['Графітовий', 'Grafiet'], oranje: ['Оранжевий', 'Oranje'], groen: ['Зелений', 'Groen'], limoen: ['Лаймовий', 'Limoen'],
  indigo: ['Індиго', 'Indigo'], oker: ['Вохра', 'Oker'], grijs: ['Сірий', 'Grijs'], roze: ['Рожевий', 'Roze'],
  rood: ['Червоний', 'Rood'], bruin: ['Коричневий', 'Bruin'],
};
const kleurLabel = (k: Accent, lang: 'uk' | 'nl') => KLEUR_NAAM[k][lang === 'uk' ? 0 : 1];
const rnd = (n: number) => { const a = new Uint8Array(n); (globalThis.crypto || { getRandomValues: (x: Uint8Array) => x }).getRandomValues?.(a); return a; };
const standaardKleur = (r: Rij): Accent => DIENST_ACCENT[r.dienst as keyof typeof DIENST_ACCENT] || 'grijs';
const standaardIcoon = (r: Rij) => (r.pagina ? localTabIcon(r.dienst, r.pagina) : MENU_CATALOG.find((e) => e.id === r.dienst)?.icon || 'overview');

export default function SnelleToegangEditor({ tr, rechten }: { tr: Tr; rechten?: AccountRechten }) {
  const v = useZijbalkVoorkeuren(), ruimte = zijbalkHuidigeRuimte();
  const lang: 'uk' | 'nl' = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';
  const tech = useTech(), techProfiel = techActief(tech);
  const [nieuw, setNieuw] = useState('');

  // Welke onderdelen dit account in DEZE ruimte in de snelbalk mag zetten. De gebruikersruimte krijgt nooit beheerpagina's; het
  // technisch profiel krijgt alleen beheer. Dezelfde regel als in CanonicalChrome (account-rechten.ts: dienstToegestaan).
  const basis: Basis = useMemo(() => {
    const diensten = (ruimte === 'technisch' ? [...TECH_MENU] : MENU_CATALOG.filter((e) => !e.planned && !isSiteBeheer(e.id) && e.id !== 'mcp').map((e) => e.id as string))
      .filter((d) => dienstToegestaan(d, rechten, ruimte === 'technisch' || techProfiel));
    return { diensten, toegestaan: diensten };
  }, [ruimte, rechten, techProfiel]);
  // Twee webruimtes delen nooit dezelfde punten: «gebruiker» toont nooit beheer, «technisch» toont alleen beheer.
  const mag = (item: string) => {
    const o = ontleed(item);
    if (!o) return false;
    const beheer = isSiteBeheer(o.dienst) || (!!o.pagina && isBeheerPagina(o.dienst, o.pagina));
    return ruimte === 'technisch' ? beheer : !beheer;
  };
  const weergave = useMemo(() => menuWeergave(v, basis), [v, basis]);
  const rijen = weergave.snelbalk.filter((r) => mag(r.item));
  const kandidaten = snelKandidaten(v, basis).filter(mag);

  const doe = (res: ReturnType<typeof snelStap>, tekst: string) => { if (res.ok) menuWijzigen(res.v, tekst, lang); };
  const naam = (item: string) => itemNaam(item, lang);
  const toevoegen = () => { if (!nieuw) return; doe(snelToevoegen(v, basis, nieuw, nieuweKopieId(rnd)), tr(`«${naam(nieuw)}» додано до швидкого доступу`, `«${naam(nieuw)}» toegevoegd aan de snelle toegang`)); setNieuw(''); };
  const toetsen = (r: Rij) => (e: RKeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
    doe(snelStap(v, basis, r.sleutel, d), tr(`«${naam(r.item)}» переміщено`, `«${naam(r.item)}» verplaatst`));
  };

  return <fieldset className='zijbalk-meldingen menu-snel-editor' data-snelle-toegang-editor>
    <legend><Zap aria-hidden='true' />{tr('Швидкий доступ', 'Snelle toegang')}</legend>
    <p className='zijbalk-meldingen-uitleg' data-snel-uitleg>
      {tr('Кнопки швидкого доступу — це верхній ряд меню. Тут можна додати будь-який пункт, прибрати, змінити порядок стрілками (або Alt+←/→, Alt+↑/↓), вибрати власну іконку та колір. Перетягування теж працює, але тут усе доступно з клавіатури й на телефоні.',
        'De knoppen voor snelle toegang zijn de bovenste rij van het menu. Hier kunt u elk item toevoegen, weghalen, de volgorde met pijltjes wijzigen (of Alt+←/→, Alt+↑/↓) en een eigen icoon en kleur kiezen. Slepen werkt ook, maar hier kan alles met het toetsenbord en op een telefoon.')}
    </p>
    <p className='zijbalk-meldingen-uitleg' data-snel-bereik>
      <strong>{ruimte === 'technisch' ? tr('Лише цей обліковий запис і лише технічний профіль.', 'Alleen dit account en alleen het technisch profiel.') : tr('Лише цей обліковий запис і лише користувацький профіль.', 'Alleen dit account en alleen het gebruikersprofiel.')}</strong>{' '}
      {tr('Інші користувачі й інший профіль цього не побачать: у кожного свій порядок, свої кольори та свій швидкий доступ.',
        'Andere gebruikers en het andere profiel zien dit niet: ieder heeft zijn eigen volgorde, eigen kleuren en eigen snelle toegang.')}
    </p>
    <ul className='menu-snel-lijst' data-snel-lijst aria-label={tr('Кнопки швидкого доступу', 'Knoppen voor snelle toegang')}>
      {rijen.map((r, i) => <li key={r.sleutel} data-snel-rij={r.sleutel} data-accent={r.accent}>
        <span className='menu-snel-voorbeeld' aria-hidden='true'><MenuGlyph icon={r.icoon || standaardIcoon(r)} /></span>
        <span className='menu-snel-naam'><strong>{naam(r.item)}</strong><small>{tr(`позиція ${i + 1} з ${rijen.length}`, `positie ${i + 1} van ${rijen.length}`)}</small></span>
        <span className='menu-snel-knoppen'>
          <button type='button' data-snel-omhoog={r.sleutel} disabled={i === 0} aria-label={tr(`Перемістити «${naam(r.item)}» раніше`, `«${naam(r.item)}» eerder zetten`)} onKeyDown={toetsen(r)} onClick={() => doe(snelStap(v, basis, r.sleutel, -1), tr(`«${naam(r.item)}» переміщено раніше`, `«${naam(r.item)}» eerder gezet`))}><ArrowUp aria-hidden='true' /></button>
          <button type='button' data-snel-omlaag={r.sleutel} disabled={i === rijen.length - 1} aria-label={tr(`Перемістити «${naam(r.item)}» пізніше`, `«${naam(r.item)}» later zetten`)} onKeyDown={toetsen(r)} onClick={() => doe(snelStap(v, basis, r.sleutel, 1), tr(`«${naam(r.item)}» переміщено пізніше`, `«${naam(r.item)}» later gezet`))}><ArrowDown aria-hidden='true' /></button>
          <select data-snel-icoon={r.sleutel} value={r.icoon || ''} aria-label={tr(`Іконка «${naam(r.item)}»`, `Icoon van «${naam(r.item)}»`)} onChange={(e) => doe(itemIcoonZetten(v, r.sleutel, e.target.value || undefined), tr(`Іконку «${naam(r.item)}» змінено`, `Icoon van «${naam(r.item)}» gewijzigd`))}>
            <option value=''>{tr('Стандартна іконка', 'Standaardicoon')}</option>
            {MENU_ICON_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o[lang]}</option>)}
          </select>
          <select data-snel-kleur={r.sleutel} value={r.accent === standaardKleur(r) && !heeftEigenKleur(v, r) ? '' : r.accent} aria-label={tr(`Колір «${naam(r.item)}»`, `Kleur van «${naam(r.item)}»`)} onChange={(e) => doe(itemKleurZetten(v, r.sleutel, (e.target.value || undefined) as Accent | undefined), tr(`Колір «${naam(r.item)}» змінено`, `Kleur van «${naam(r.item)}» gewijzigd`))}>
            <option value=''>{tr(`Колір розділу (${kleurLabel(standaardKleur(r), lang)})`, `Kleur van het onderdeel (${kleurLabel(standaardKleur(r), lang)})`)}</option>
            {ACCENTEN.map((k) => <option key={k} value={k}>{kleurLabel(k, lang)}</option>)}
          </select>
          <button type='button' className='menu-snel-weg' data-snel-weg={r.sleutel} aria-label={tr(`Прибрати «${naam(r.item)}» зі швидкого доступу`, `«${naam(r.item)}» uit de snelle toegang halen`)} onClick={() => doe(snelWeg(v, basis, r.sleutel), tr(`«${naam(r.item)}» прибрано зі швидкого доступу`, `«${naam(r.item)}» uit de snelle toegang gehaald`))}><Trash2 aria-hidden='true' /></button>
        </span>
      </li>)}
      {rijen.length === 0 && <li className='menu-snel-leeg' data-snel-leeg>{tr('Поки порожньо — додайте перший пункт нижче.', 'Nog leeg — voeg hieronder het eerste item toe.')}</li>}
    </ul>
    <div className='menu-snel-toevoegen'>
      <label><span>{tr('Додати пункт', 'Item toevoegen')}</span>
        <select data-snel-nieuw value={nieuw} onChange={(e) => setNieuw(e.target.value)}>
          <option value=''>{tr('— виберіть —', '— kies —')}</option>
          {kandidaten.map((item) => <option key={item} value={item}>{naam(item)}</option>)}
        </select>
      </label>
      <button type='button' className='settings-primary' data-snel-toevoegen disabled={!nieuw} onClick={toevoegen}><Plus aria-hidden='true' />{tr('Додати', 'Toevoegen')}</button>
      <button type='button' data-snel-standaard disabled={rijen.length === 0} onClick={() => menuWijzigen(snelbalkTerugzetten(v, basis), tr('Швидкий доступ повернуто до стандарту', 'Snelle toegang teruggezet naar de standaard'), lang)}><RotateCcw aria-hidden='true' />{tr('Скинути до стандарту', 'Terug naar standaard')}</button>
    </div>
    <p className='zijbalk-meldingen-uitleg'><Palette aria-hidden='true' className='menu-snel-inline' />{tr('Колір видно і в згорнутій панелі, де є лише іконка, — в обох стилях іконок («Класичний» і «Кольоровий»).', 'De kleur is ook te zien in de ingeklapte zijbalk, waar alleen het icoon staat — in beide icoonstijlen («Klassiek» en «Kleurrijk»).')}</p>
  </fieldset>;
}

/** Heeft dit item/kopie een ZELF gekozen kleur (en niet alleen die van zijn onderdeel)? */
function heeftEigenKleur(v: { items: Record<string, { kleur?: Accent }>; kopieen: Array<{ id: string; kleur?: Accent }> }, r: Rij): boolean {
  return r.kopie ? !!v.kopieen.find((k) => k.id === r.kopie)?.kleur : !!v.items[r.item]?.kleur;
}
