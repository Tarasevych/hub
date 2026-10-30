// Punt 4 + punt 17 (audit 19.10.2026):
//  • elke webruimte (gebruikersprofiel / technisch profiel) heeft een EIGEN menu: volgorde, zichtbaarheid, snelle toegang,
//    iconen en kleuren. Een wijziging in de ene ruimte verandert niets in de andere — ook niet voor de eigenaar;
//  • het oude formaat (één losse ZijbalkVoorkeuren) wordt gelezen als de gebruikersruimte: niets gaat verloren;
//  • elk punt kan een EIGEN kleur hebben (ItemOverride.kleur / ItemKopie.kleur) uit het bestaande palet ACCENTEN;
//  • «Швидкий доступ» heeft een uitdrukkelijke bewerker: toevoegen, weghalen, volgorde, icoon, kleur, terugzetten —
//    met knoppen en keuzelijsten, dus ook met het toetsenbord en op een telefoon (slepen blijft bestaan).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  ACCENTEN, DIENST_ACCENT, MENU_RUIMTES, isMenuRuimte, metRuimte, normaliseerRuimtes, normaliseerZijbalk, ruimteVoorkeuren,
  standaardRuimtes, standaardZijbalk,
} from '../../shared/menu-model';
import {
  itemIcoonZetten, itemKleurZetten, menuWeergave, nieuweKopieId, snelKandidaten, snelStap, snelToevoegen, snelWeg,
  snelbalkTerugzetten, type Basis,
} from '../../shared/menu-indeling';

const rnd = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7 + 3) % 36));

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-per-profiel-20261019');
  const basis: Basis = { diensten: ['hub', 'mail', 'identity'], toegestaan: ['hub', 'mail', 'identity'] };

  // ================================================================ 1. twee ruimtes in het model
  check('twee ruimtes: gebruiker en technisch', MENU_RUIMTES.join() === 'gebruiker,technisch' && isMenuRuimte('gebruiker') && isMenuRuimte('technisch') && !isMenuRuimte('eigenaar'));
  const std = standaardRuimtes();
  check('standaard: beide ruimtes op de standaardvoorkeur, versie 2', std.versie === 2 && JSON.stringify(std.gebruiker) === JSON.stringify(standaardZijbalk()) && JSON.stringify(std.technisch) === JSON.stringify(standaardZijbalk()));

  // ---- terugwaartse compatibiliteit: oud formaat = gebruikersruimte, niets verloren
  const oud = { modus: 'dicht', icoonStijl: 'kleur', items: { 'svc:mail': { volgorde: 0, plaats: 'snelbalk' } }, kopieen: [{ id: 'k-oud00001', item: 'pg:hub/tasks', plaats: 'snelbalk', volgorde: 1 }] };
  const gemigreerd = normaliseerRuimtes(oud);
  check('oud (één losse voorkeur) → gebruikersruimte, volledig behouden',
    gemigreerd.versie === 2 && gemigreerd.gebruiker.modus === 'dicht' && gemigreerd.gebruiker.icoonStijl === 'kleur'
    && gemigreerd.gebruiker.items['svc:mail']?.plaats === 'snelbalk' && gemigreerd.gebruiker.kopieen[0]?.id === 'k-oud00001'
    && JSON.stringify(gemigreerd.gebruiker) === JSON.stringify(normaliseerZijbalk(oud)), JSON.stringify(gemigreerd.gebruiker).slice(0, 160));
  check('oud formaat geeft de technische ruimte de standaard (en nooit de gebruikersindeling)',
    JSON.stringify(gemigreerd.technisch) === JSON.stringify(standaardZijbalk()) && gemigreerd.technisch.modus === 'auto' && gemigreerd.technisch.kopieen.length === 0);
  check('rommel → beide ruimtes standaard', JSON.stringify(normaliseerRuimtes('x')) === JSON.stringify(std) && JSON.stringify(normaliseerRuimtes(null)) === JSON.stringify(std));
  check('ruimteVoorkeuren leest één ruimte uit beide formaten', ruimteVoorkeuren(oud, 'gebruiker').modus === 'dicht' && ruimteVoorkeuren(oud, 'technisch').modus === 'auto' && ruimteVoorkeuren(gemigreerd, 'gebruiker').modus === 'dicht');

  // ---- één ruimte schrijven laat de ANDERE ongemoeid (geen profiel kan het andere overschrijven)
  const na = metRuimte(gemigreerd, 'technisch', { modus: 'open', items: { 'svc:admin': { volgorde: 0, plaats: 'snelbalk', kleur: 'rood' } } });
  check('technisch opslaan verandert de gebruikersruimte niet', JSON.stringify(na.gebruiker) === JSON.stringify(gemigreerd.gebruiker) && na.technisch.modus === 'open' && na.technisch.items['svc:admin']?.kleur === 'rood');
  const na2 = metRuimte(na, 'gebruiker', { modus: 'auto' });
  check('gebruiker opslaan verandert de technische ruimte niet', na2.technisch.items['svc:admin']?.kleur === 'rood' && na2.technisch.modus === 'open' && na2.gebruiker.modus === 'auto' && na2.gebruiker.kopieen.length === 0);
  check('idempotent en strikt genormaliseerd', JSON.stringify(normaliseerRuimtes(na2)) === JSON.stringify(na2));

  // ================================================================ 2. kleur per punt
  const k1 = normaliseerZijbalk({ items: { 'svc:mail': { kleur: 'roze' }, 'svc:hub': { kleur: 'neon' } }, kopieen: [{ id: 'k-kl000001', item: 'pg:hub/tasks', plaats: 'snelbalk', volgorde: 0, kleur: 'limoen' }, { id: 'k-kl000002', item: 'pg:hub/notes', plaats: 'snelbalk', volgorde: 1, kleur: 'paars' }] });
  check('kleur alleen uit ACCENTEN; onbekende kleur valt weg (item én kopie)',
    k1.items['svc:mail']?.kleur === 'roze' && !('kleur' in (k1.items['svc:hub'] || {})) && k1.kopieen[0].kleur === 'limoen' && !('kleur' in k1.kopieen[1]), JSON.stringify(k1.items) + JSON.stringify(k1.kopieen));
  const w1 = menuWeergave(k1, basis);
  check('weergave: het punt krijgt zijn EIGEN kleur, anders die van zijn dienst',
    w1.zijbalk.find((r) => r.item === 'svc:mail')?.accent === 'roze'
    && w1.zijbalk.find((r) => r.item === 'svc:hub')?.accent === DIENST_ACCENT.hub
    && w1.snelbalk.find((r) => r.kopie === 'k-kl000001')?.accent === 'limoen'
    && w1.snelbalk.find((r) => r.kopie === 'k-kl000002')?.accent === DIENST_ACCENT.hub);
  check('elke accentkleur van het palet is te kiezen (14 kleuren, zelfde palet als de diensten)', ACCENTEN.length === 14 && ACCENTEN.every((a) => !!normaliseerZijbalk({ items: { 'svc:mail': { kleur: a } } }).items['svc:mail']?.kleur));
  const kleurUit = itemKleurZetten(k1, 'svc:mail', undefined);
  check('kleur terugzetten → weer de kleur van het onderdeel', kleurUit.ok && !kleurUit.v.items['svc:mail']?.kleur && menuWeergave(kleurUit.v, basis).zijbalk.find((r) => r.item === 'svc:mail')?.accent === DIENST_ACCENT.mail);
  const kopieKleur = itemKleurZetten(k1, 'k-kl000002:pg:hub/notes', 'indigo');
  check('kleur van een kopie apart instelbaar (de andere kopie blijft)', kopieKleur.ok && kopieKleur.v.kopieen.find((k) => k.id === 'k-kl000002')?.kleur === 'indigo' && kopieKleur.v.kopieen.find((k) => k.id === 'k-kl000001')?.kleur === 'limoen');
  check('onbekend punt → geen stille wijziging', !itemKleurZetten(k1, 'svc:bestaatniet!', 'rood').ok && !itemKleurZetten(k1, 'k-nietbest:pg:hub/tasks', 'rood').ok);

  // ---- icoon per punt
  const ic = itemIcoonZetten(k1, 'k-kl000001:pg:hub/tasks', 'star');
  check('icoon van een kopie instelbaar en weer weg te halen', ic.ok && ic.v.kopieen[0].icoon === 'star' && menuWeergave(ic.v, basis).snelbalk.find((r) => r.kopie === 'k-kl000001')?.icoon === 'star' && itemIcoonZetten(ic.v, 'k-kl000001:pg:hub/tasks', undefined).ok);
  const ic2 = itemIcoonZetten(k1, 'svc:mail', 'inbox');
  check('icoon van een gewoon punt instelbaar; ongeldige id wordt genegeerd', ic2.ok && ic2.v.items['svc:mail']?.icoon === 'inbox' && !normaliseerZijbalk({ items: { 'svc:mail': { icoon: '<script>' } } }).items['svc:mail']?.icoon);

  // ================================================================ 3. bewerker «Швидкий доступ»: toevoegen / weg / volgorde / reset
  let v = standaardZijbalk();
  check('standaard is de snelbalk leeg', menuWeergave(v, basis).snelbalk.length === 0);
  const a = snelToevoegen(v, basis, 'svc:mail', nieuweKopieId(rnd));
  check('toevoegen: het punt staat in de snelle toegang en BLIJFT in het hoofdmenu staan',
    a.ok && menuWeergave(a.v, basis).snelbalk.length === 1 && menuWeergave(a.v, basis).snelbalk[0].item === 'svc:mail' && menuWeergave(a.v, basis).zijbalk.some((r) => r.item === 'svc:mail'));
  v = a.ok ? a.v : v;
  check('hetzelfde punt twee keer kan niet', !snelToevoegen(v, basis, 'svc:mail', 'k-tweede01').ok);
  check('een punt waar dit account geen recht op heeft kan niet (dienstToegestaan bepaalt de lijst)', !snelToevoegen(v, basis, 'svc:admin', 'k-adm00001').ok && !snelToevoegen(v, basis, 'pg:admin/updates', 'k-adm00002').ok);
  check('kandidatenlijst: alleen toegestane punten, zonder wat er al staat', !snelKandidaten(v, basis).includes('svc:mail') && snelKandidaten(v, basis).includes('pg:hub/tasks') && snelKandidaten(v, basis).every((i) => basis.toegestaan.some((d) => i === `svc:${d}` || i.startsWith(`pg:${d}/`))));

  const b = snelToevoegen(v, basis, 'pg:hub/tasks', 'k-tak00001');
  v = b.ok ? b.v : v;
  const c = snelToevoegen(v, basis, 'pg:identity/menu', 'k-men00001');
  v = c.ok ? c.v : v;
  const orde = () => menuWeergave(v, basis).snelbalk.map((r) => r.item).join(',');
  check('drie knoppen, in de volgorde waarin ze zijn toegevoegd', orde() === 'svc:mail,pg:hub/tasks,pg:identity/menu', orde());
  const op = snelStap(v, basis, menuWeergave(v, basis).snelbalk[2].sleutel, -1);
  v = op.ok ? op.v : v;
  check('één plaats eerder (pijltje / Alt+pijl)', orde() === 'svc:mail,pg:identity/menu,pg:hub/tasks', orde());
  const neer = snelStap(v, basis, menuWeergave(v, basis).snelbalk[0].sleutel, 1);
  v = neer.ok ? neer.v : v;
  check('één plaats later', orde() === 'pg:identity/menu,svc:mail,pg:hub/tasks', orde());
  check('aan de rand gaat niets stil verloren', !snelStap(v, basis, menuWeergave(v, basis).snelbalk[0].sleutel, -1).ok && !snelStap(v, basis, menuWeergave(v, basis).snelbalk[2].sleutel, 1).ok);

  const kleur = itemKleurZetten(v, menuWeergave(v, basis).snelbalk[1].sleutel, 'oranje');
  v = kleur.ok ? kleur.v : v;
  check('kleur van een knop in de snelle toegang', menuWeergave(v, basis).snelbalk[1].accent === 'oranje' && menuWeergave(v, basis).snelbalk[0].accent !== 'oranje');
  const weg = snelWeg(v, basis, menuWeergave(v, basis).snelbalk[1].sleutel);
  v = weg.ok ? weg.v : v;
  check('weghalen: de knop verdwijnt uit de snelle toegang, het punt blijft in het menu', orde() === 'pg:identity/menu,pg:hub/tasks' && menuWeergave(v, basis).zijbalk.some((r) => r.item === 'svc:mail'));
  const terug = snelbalkTerugzetten(v, basis);
  check('terugzetten: snelle toegang leeg, het hoofdmenu volledig intact', menuWeergave(terug, basis).snelbalk.length === 0 && menuWeergave(terug, basis).zijbalk.length === menuWeergave(standaardZijbalk(), basis).zijbalk.length);

  // ---- een GESLEEPT (verplaatst, niet gekopieerd) punt gaat met «weghalen» terug naar zijn eigen plek
  const gesleept = normaliseerZijbalk({ items: { 'pg:mail/inbox': { plaats: 'snelbalk', volgorde: 0 } } });
  const wegGesleept = snelWeg(gesleept, basis, 'pg:mail/inbox');
  check('een gesleept punt gaat bij weghalen terug naar zijn submenu (niet verloren)',
    wegGesleept.ok && menuWeergave(wegGesleept.v, basis).snelbalk.length === 0 && (menuWeergave(wegGesleept.v, basis).secties.mail || []).some((r) => r.pagina === 'inbox'));

  // ================================================================ 4. de bewerker in de UI (knoppen, toetsenbord, telefoon, bereik)
  const ed = readFileSync('src/SnelleToegangBewerker.tsx', 'utf8');
  check('bewerker: toevoegen, weghalen, omhoog, omlaag, icoon, kleur en terugzetten zijn echte knoppen/keuzelijsten',
    ['data-snel-toevoegen', 'data-snel-weg', 'data-snel-omhoog', 'data-snel-omlaag', 'data-snel-icoon', 'data-snel-kleur', 'data-snel-standaard', 'data-snel-nieuw'].every((h) => ed.includes(h)));
  check('bewerker: werkt met het toetsenbord (Alt+pijltjes) en alles heeft een aria-label', /e\.altKey/.test(ed) && /ArrowUp/.test(ed) && /ArrowLeft/.test(ed) && (ed.match(/aria-label=/g) || []).length >= 6);
  check('bewerker: elke wijziging gaat via menuWijzigen (dus «Ongedaan маken» + opslag per account en profiel)', /menuWijzigen\(/.test(ed) && !/zetZijbalk\(/.test(ed));
  check('bewerker zegt uitdrukkelijk dat het alleen dit account en alleen dit profiel betreft',
    /Лише цей обліковий запис і лише технічний профіль/.test(ed) && /Лише цей обліковий запис і лише користувацький профіль/.test(ed) && /Alleen dit account en alleen het technisch profiel/.test(ed));
  check('bewerker: op een telefoon bruikbaar (geen slepen nodig; eigen regels voor smalle schermen in de CSS)',
    /@media \(max-width:700px\)\{\.menu-snel-knoppen/.test(readFileSync('src/menu-v2.css', 'utf8')));
  check('bewerker is te openen uit het menu «⋯» van de panel-werkbalk én uit Налаштування → Меню',
    /snelleToegang/.test(readFileSync('src/ZijbalkWerkbalk.tsx', 'utf8')) && /snelleToegang/.test(readFileSync('src/MenuInstellingenVenster.tsx', 'utf8'))
    && /<SnelleToegangEditor/.test(readFileSync('src/ZijbalkInstellingen.tsx', 'utf8')) && /<SnelleToegangEditor/.test(readFileSync('src/CanoniekOmlijsting.tsx', 'utf8')));

  // ---- kleurverschil moet ZICHTBAAR zijn: in de snelbalk en in de smalle (ingeklapte) panel, in beide icoonstijlen
  const css = readFileSync('src/menu-v2.css', 'utf8'), chrome = readFileSync('src/CanoniekOmlijsting.tsx', 'utf8');
  check('CanonicalChrome markeert een zelf gekozen kleur (data-eigen-kleur) en gebruikt de kleur van de RIJ, niet alleen die van de dienst',
    /data-eigen-kleur=\{eigenKleur\(/.test(chrome) && /data-accent=\{r\?\.accent\|\|DIENST_ACCENT\[item\.id/.test(chrome));
  check('CSS: snelle toegang en zelf gekozen kleuren zijn altijd te zien (niet alleen bij aanwijzen) en ook ingeklapt',
    /\.menu-snelbalk \.canonical-service-button \.menu-lucide-glyph\{color:var\(--a/.test(css)
    && /\[data-eigen-kleur='ja'\]>\.canonical-service-main-row>\.canonical-service-button \.menu-lucide-glyph\{color:var\(--a/.test(css)
    && /:not\(\.sidebar-expanded\) \.menu-snelbalk \.canonical-menu-icon-slot::after/.test(css));
  check('CSS: de kleurregels staan buiten [data-icoon-stijl], dus ze gelden in «klassiek» én «kleur»',
    !/data-icoon-stijl[^\n]*menu-snelbalk/.test(css) && !/data-icoon-stijl[^\n]*data-eigen-kleur/.test(css));

  // ---- CanonicalChrome geeft de ruimte van dit tabblad door aan de voorkeurenwinkel
  // 20.10.2026: dezelfde regel zet nu ook het UITERLIJK per ruimte (weergaveRuimte), daarom via de hulpvariabele `r`.
  check('CanonicalChrome zet de ruimte van dit tabblad (oppervlak → zijbalkRuimte)', /const r=oppervlak==='technisch'\?'technisch':'gebruiker';zijbalkRuimte\(r\)/.test(chrome));
  return einde();
}
