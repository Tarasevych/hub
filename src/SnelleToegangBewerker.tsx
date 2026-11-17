// «Швидкий доступ» / «Snelle toegang» — een UITDRUKKELIJKE bewerker (punt 17, audit 19.10.2026).
// Tot nu kon de snelbalk alleen met SLEPEN worden gevuld: op een telefoon vrijwel onmogelijk, met het toetsenbord onvindbaar, en er
// was geen kleurverschil tussen de knoppen. Hier kan alles met gewone knoppen en selecties: een punt toevoegen, weghalen, met
// ↑/↓ (of Alt+pijltjes) van plaats wisselen, een eigen icoon en een eigen KLEUR kiezen, en alles terugzetten.
//
// Alles geldt alleen voor DIT account en alleen voor DEZE webruimte (gebruikersruimte of technisch profiel): de voorkeuren staan per
// account én per ruimte op de server (zie src/zijbalk-voorkeuren.ts en shared/menu-model.ts). Elke wijziging gaat via `menuWijzigen`,
// dus met «Ongedaan maken» en meteen op alle subdomeinen.
import { useMemo, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, FolderInput, Palette, Plus, RotateCcw, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { ACCENTEN, DIENST_ACCENT, type Accent } from '../shared/menu-model';
import { isBeheerPagina } from '../shared/beheer-paginas';
import { itemIcoonZetten, itemKleurZetten, menuWeergave, nieuweKopieId, ontleed, snelKandidaten, snelStap, snelToevoegen, snelWeg, snelbalkTerugzetten, type Basis, type Rij } from '../shared/menu-indeling';
import { isTechYarlykItem, techYarlykBandKleur } from '../shared/tech-yarlyky';
import { dienstToegestaan, type AccountRechten } from './account-rechten';
import { emitCanonicalNotice } from './canoniek-meldingen';
import { MENU_CATALOG, MENU_ICON_OPTIONS, MenuGlyph, TECH_MENU, TECH_NAAM, isSiteBeheer, localTabIcon } from './menu-voorkeuren';
import { itemNaam } from './MenuIndelingInstellingen';
import { menuWijzigen } from './menu-bewerken';
import { techActief, useTech } from './tech/tech-opslag';
import { useZijbalkVoorkeuren, zijbalkHuidigeRuimte, zijbalkKopieInRuimte } from './zijbalk-voorkeuren';

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
  const tech = useTech(), techProfiel = techActief(tech), heeftTechProfiel = !!tech.profiel || (!tech.geladen && !!rechten?.eigenaar);
  const yarlykMag = !!tech.profiel?.snelkoppelingenToegestaan, apiPlat = !!rechten?.apiPlatform;
  const band = techYarlykBandKleur(tech.profiel?.band.kleur);
  const [nieuw, setNieuw] = useState('');

  // Які розділи цей обліковий запис може додати до швидкого доступу в цій частині меню. Без дозволу адміністратора на ярлики звичайний простір не містить
  // служб керування; із дозволом адміністратора повноважна особа з техпрофілем може додавати ярлики в обох частинах меню.
  const basis: Basis = useMemo(() => {
    const eigenDiensten = (ruimte === 'technisch' ? [...TECH_MENU] : MENU_CATALOG.filter((e) => !e.planned && !isSiteBeheer(e.id) && e.id !== 'mcp').map((e) => e.id as string))
      .filter((d) => dienstToegestaan(d, rechten, ruimte === 'technisch' || techProfiel));
    const extraDiensten = ruimte === 'gebruiker' && yarlykMag
      ? TECH_MENU.filter((d) => dienstToegestaan(d, rechten, heeftTechProfiel))
      : [];
    const toegestaan = extraDiensten.length > 0 ? Array.from(new Set([...eigenDiensten, ...extraDiensten])) : eigenDiensten;
    return { diensten: eigenDiensten, toegestaan };
  }, [ruimte, rechten, techProfiel, yarlykMag, heeftTechProfiel]);
  const mag = (item: string) => {
    const o = ontleed(item);
    if (!o) return false;
    const beheer = isSiteBeheer(o.dienst) || (!!o.pagina && isBeheerPagina(o.dienst, o.pagina));
    if (ruimte === 'technisch') return beheer;
    return !beheer || (yarlykMag && isTechYarlykItem(item, apiPlat, false));
  };
  const isYarlyk = (item: string) => (yarlykMag || ruimte === 'technisch') && isTechYarlykItem(item, apiPlat, ruimte === 'technisch');
  const weergave = useMemo(() => menuWeergave(v, basis), [v, basis]);
  const rijen = weergave.snelbalk.filter((r) => mag(r.item));
  const kandidaten = snelKandidaten(v, basis).filter(mag);

  const doe = (res: ReturnType<typeof snelStap>, tekst: string) => { if (res.ok) menuWijzigen(res.v, tekst, lang); };
  const naam = (item: string) => {
    if (item === 'svc:mcp' && (ruimte === 'technisch' || !apiPlat)) return TECH_NAAM[lang].mcp || itemNaam(item, lang);
    return itemNaam(item, lang);
  };
  const toevoegen = () => { if (!nieuw) return; doe(snelToevoegen(v, basis, nieuw, nieuweKopieId(rnd)), tr(`«${naam(nieuw)}» додано до швидкого доступу`, `«${naam(nieuw)}» toegevoegd aan de snelle toegang`)); setNieuw(''); };
  const plaatsElders = (r: Rij) => {
    const doel = ruimte === 'technisch' ? 'gebruiker' : 'technisch';
    const res = zijbalkKopieInRuimte(doel, r.item, 'snelbalk', nieuweKopieId(rnd), { icoon: r.icoon, kleur: r.accent });
    if (res === 'toegevoegd') {
      emitCanonicalNotice({
        kind: 'success',
        source: 'menu-indeling',
        text: doel === 'gebruiker'
          ? tr(`Ярлик «${naam(r.item)}» розміщено у звичайній частині меню (Швидкий доступ).`, `Snelkoppeling «${naam(r.item)}» in het gebruikersdeel (Snelle toegang) geplaatst.`)
          : tr(`Ярлик «${naam(r.item)}» розміщено у технічній частині меню (Швидкий доступ).`, `Snelkoppeling «${naam(r.item)}» in het technisch deel (Snelle toegang) geplaatst.`),
      });
    } else if (res === 'bestaat') {
      emitCanonicalNotice({ kind: 'info', source: 'menu-indeling', text: tr(`Ярлик «${naam(r.item)}» вже є в цьому місці іншої частини меню.`, `Snelkoppeling «${naam(r.item)}» staat daar al in het andere deel.`), dedupeSeconds: 4 });
    } else if (res === 'te-veel') {
      emitCanonicalNotice({ kind: 'warning', source: 'menu-indeling', text: tr('Забагато копій у цільовій частині меню (щонайбільше 50).', 'Te veel kopieën in het doelmenu (maximaal 50).'), dedupeSeconds: 5 });
    }
  };
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
      {rijen.map((r, i) => {
        const yarlyk = isYarlyk(r.item);
        const kanDeel = yarlyk && yarlykMag && (ruimte === 'technisch' || techProfiel);
        return <li key={r.sleutel} data-snel-rij={r.sleutel} data-accent={r.accent} data-tech-yarlyk={yarlyk ? 'ja' : undefined} style={yarlyk ? { ['--tech-profiel-kleur' as string]: band.bg, ['--tech-profiel-tekst' as string]: band.fg } : undefined}>
        <span className='menu-snel-voorbeeld' data-tech-yarlyk={yarlyk ? 'ja' : undefined} aria-hidden='true'><MenuGlyph icon={r.icoon || standaardIcoon(r)} />{yarlyk && <span className='tech-yarlyk-schild'><ShieldCheck /></span>}</span>
        <span className='menu-snel-naam'><strong>{naam(r.item)}</strong><small>{tr(`позиція ${i + 1} з ${rijen.length}`, `positie ${i + 1} van ${rijen.length}`)}{yarlyk ? ` · ${tr('Технічний профіль', 'Technisch profiel')}` : ''}</small></span>
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
          {kanDeel && <button type='button' data-snel-deel={r.sleutel} title={ruimte === 'technisch' ? tr('Розмістити ярлик у звичайній частині меню', 'Snelkoppeling in gebruikersdeel plaatsen') : tr('Розмістити ярлик у технічній частині меню', 'Snelkoppeling in technisch deel plaatsen')} aria-label={ruimte === 'technisch' ? tr(`Розмістити ярлик «${naam(r.item)}» у звичайній частині меню`, `Snelkoppeling «${naam(r.item)}» in gebruikersdeel plaatsen`) : tr(`Розмістити ярлик «${naam(r.item)}» у технічній частині меню`, `Snelkoppeling «${naam(r.item)}» in technisch deel plaatsen`)} onClick={() => plaatsElders(r)}><FolderInput aria-hidden='true' /></button>}
          <button type='button' className='menu-snel-weg' data-snel-weg={r.sleutel} aria-label={tr(`Прибрати «${naam(r.item)}» зі швидкого доступу`, `«${naam(r.item)}» uit de snelle toegang halen`)} onClick={() => doe(snelWeg(v, basis, r.sleutel), tr(`«${naam(r.item)}» прибрано зі швидкого доступу`, `«${naam(r.item)}» uit de snelle toegang gehaald`))}><Trash2 aria-hidden='true' /></button>
        </span>
      </li>;
      })}
      {rijen.length === 0 && <li className='menu-snel-leeg' data-snel-leeg>{tr('Поки порожньо — додайте перший пункт нижче.', 'Nog leeg — voeg hieronder het eerste item toe.')}</li>}
    </ul>
    <div className='menu-snel-toevoegen'>
      <label><span>{tr('Додати пункт', 'Item toevoegen')}</span>
        <select data-snel-nieuw value={nieuw} onChange={(e) => setNieuw(e.target.value)}>
          <option value=''>{tr('— виберіть —', '— kies —')}</option>
          {kandidaten.map((item) => <option key={item} value={item}>{naam(item)}{isYarlyk(item) && ruimte === 'gebruiker' ? ` — ${tr('Технічний профіль', 'Technisch profiel')}` : ''}</option>)}
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
