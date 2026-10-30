// Werkblad v3 — register «Все на сайті» (shared/werkblad-register.ts) en het contract bibliotheek → canvas.
// Bewaakt: unieke id's, volledige dekking van menu-diensten en -pagina's, bestaande iconen, nooit een vrije URL, rechten
// (technisch alleen in de technische ruimte, mcp met api-platform), planned/denied niet startbaar, veilige opdrachten,
// gelijkheid met MENU_CATALOG/LOCAL_ICONS/dienstToegestaan/canonical-service.js, zoeken, persoonlijke items en het event-contract.
import { readFileSync } from 'node:fs';
import {
  CANONIEKE_DIENSTEN, DIENST_DEF, ICOON_IDS, MENU_ICOON_IDS, OPDRACHTEN, WERKBLAD_REGISTER, beschikbaarheidVoor, dienstToegestaanRegister, launchDoel, paginaIcoon,
  persoonlijkItem, registerItem, toegestaanVoor, zoekRegister, type RegisterContext,
} from '../../shared/werkblad-register';
import { DIENST_IDS, MENU_PAGINAS } from '../../shared/menu-model';
import { WERKBLAD_WIDGETS } from '../../shared/werkblad-indeling';
import { isBeheerPagina } from '../../shared/beheer-paginas';
import { MENU_CATALOG, localTabIcon, menuIconComponent } from '../../src/menu-voorkeuren';
import { dienstToegestaan } from '../../src/account-rechten';
import { EXTRA_ICONEN } from '../../src/werkblad/bibliotheek/icoon';
import { REGISTER_V3_HAKEN as H } from '../../shared/werkblad-register';
import { normaliseerLaag } from '../../shared/werkblad-v3';
import { grenzenVan } from '../../src/werkblad/canvas/kern';
import { BIBLIOTHEEK_EVENT, BIBLIOTHEEK_MIME, leesVerzoek } from '../../src/werkblad/bibliotheek/contract';
import { checker } from './hulp/nep-google';

const P: RegisterContext = { ruimte: 'prive', rechten: { apiPlatform: false, eigenaar: false } };
const PA: RegisterContext = { ruimte: 'prive', rechten: { apiPlatform: true, eigenaar: true } };
const T: RegisterContext = { ruimte: 'technisch', rechten: { apiPlatform: true, eigenaar: true } };

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-register-20261027');
  const ids = WERKBLAD_REGISTER.map((r) => r.id);

  check('id\'s uniek en met een bekend voorvoegsel', new Set(ids).size === ids.length && ids.every((id) => /^(svc:[a-z]+|pg:[a-z]+\/[a-z-]+|cmd:[a-z-]+|wdg:[a-z-]+|map:[a-z-]+)$/.test(id)));
  check('elke dienst (14) staat erin', DIENST_IDS.length === 14 && DIENST_IDS.every((d) => ids.includes(`svc:${d}`)));
  const paginas = Object.entries(MENU_PAGINAS).flatMap(([d, ps]) => ps.map((p) => `pg:${d}/${p}`));
  check(`elke menupagina (${paginas.length}) staat erin, en geen verzonnen pagina`, paginas.every((id) => ids.includes(id)) && ids.filter((i) => i.startsWith('pg:')).length === paginas.length && paginas.length >= 85);
  check('elke widget (21) staat erin met dezelfde id', WERKBLAD_WIDGETS.length === 21 && WERKBLAD_WIDGETS.every((w) => ids.includes(`wdg:${w.id}`)));
  check('elk icoon bestaat (MenuGlyph-component of lucide-extra)', WERKBLAD_REGISTER.every((r) => ICOON_IDS.includes(r.icoon)) && MENU_ICOON_IDS.every((i) => !!menuIconComponent(i) || ['google', 'microsoft', 'drive', 'onedrive', 'dropbox'].includes(i)) && Object.keys(EXTRA_ICONEN).length === ICOON_IDS.length - MENU_ICOON_IDS.length);
  check('pagina-iconen gelijk aan het zijmenu (localTabIcon)', Object.entries(MENU_PAGINAS).every(([d, ps]) => ps.every((p) => paginaIcoon(d, p) === localTabIcon(d, p))));
  check('dienstgegevens gelijk aan MENU_CATALOG (titel, icoon, doel, tab, planned)', MENU_CATALOG.every((m) => { const d = DIENST_DEF[m.id]; return d && d.titel.uk === m.uk && d.titel.nl === m.nl && d.icoon === m.icon && (m.planned ? d.planned : d.doel === m.target && d.tab === (m.tab ?? '')); }) && MENU_CATALOG.length === DIENST_IDS.length);
  const json = JSON.stringify(WERKBLAD_REGISTER);
  check('geen enkel item heeft een vrije URL (geen ://, //, javascript:, data:)', !/(:\/\/|"\/\/|javascript:|data:|https?)/i.test(json));
  check('elke route = dienst/tab die de canonieke router kent', WERKBLAD_REGISTER.filter((r) => r.doel).every((r) => (CANONIEKE_DIENSTEN as readonly string[]).includes(r.doel!.dienst) && (!r.doel!.tab || (MENU_PAGINAS[r.doel!.dienst] || []).includes(r.doel!.tab))));
  const cs = readFileSync('public/canonical-service.js', 'utf8');
  check('CANONIEKE_DIENSTEN gelijk aan public/canonical-service.js', cs.includes(`const serviceIds=${JSON.stringify([...CANONIEKE_DIENSTEN]).replace(/"/g, "'")}`));
  check('dienstToegestaanRegister = src/account-rechten dienstToegestaan', [...DIENST_IDS, 'x'].every((d) => [true, false].every((tech) => [P.rechten, PA.rechten, undefined].every((r) => dienstToegestaanRegister(d, r, tech) === dienstToegestaan(d, r, tech)))));

  // rechten
  const svc = (id: string) => registerItem(id)!;
  check('technisch: api/admin + beheerpagina\'s + tech-widgets alleen in de technische ruimte',
    WERKBLAD_REGISTER.filter((r) => r.dienst === 'api' || r.dienst === 'admin' || (r.id.startsWith('pg:') && isBeheerPagina(r.dienst!, r.id.split('/')[1])) || r.id.startsWith('wdg:tech-')).every((r) => r.categorie === 'technisch' && !toegestaanVoor(r, PA).ok && (r.beschikbaarheid !== 'ready' || toegestaanVoor(r, T).ok)));
  check('mcp: zonder api-platform geweigerd in privé, mét toegestaan', !toegestaanVoor(svc('svc:mcp'), P).ok && toegestaanVoor(svc('svc:mcp'), PA).ok && !toegestaanVoor(svc('cmd:bord-openen'), P).ok);
  check('gewone dienst in privé toegestaan, en beperking via ctx.diensten', toegestaanVoor(svc('svc:mail'), P).ok && !toegestaanVoor(svc('svc:mail'), { ...P, diensten: ['ai'] }).ok);
  check('planned (social, GitHub-widget) zichtbaar met reden, nooit startbaar', beschikbaarheidVoor(svc('svc:social'), PA) === 'planned' && !launchDoel(svc('svc:social')) && beschikbaarheidVoor(svc('wdg:github'), PA) === 'planned' && !!svc('wdg:github').reden?.uk);
  check('legacy-widgets (oud-blok, snelkoppeling) niet nieuw toe te voegen en niet in de standaardzoeklijst', !toegestaanVoor(svc('wdg:oud-blok'), PA).ok && !zoekRegister('', 'uk').some((r) => r.legacy));
  check('launchDoel: widgets en mappen niet startbaar; pagina → {dienst, tab}', !launchDoel(svc('wdg:post')) && !launchDoel(svc('map:nieuw')) && JSON.stringify(launchDoel(svc('pg:mail/spam'))) === '{"dienst":"mail","tab":"spam"}');
  check('launchDoel met ctx weigert zonder recht', !launchDoel(svc('pg:admin/audit'), PA) && !!launchDoel(svc('pg:admin/audit'), T));
  check('taken/agenda/notities openen de hub-tab', JSON.stringify(launchDoel(svc('svc:tasks'))) === '{"dienst":"hub","tab":"tasks"}');

  // opdrachten
  check('opdrachten: alleen veilige «open»-acties, geen verzenden/verwijderen', OPDRACHTEN.length >= 5 && OPDRACHTEN.every((o) => !/send|verzend|delete|verwijder|wis|надісл|видал/i.test(o.id + o.titel.uk + o.titel.nl)) && launchDoel(svc('cmd:bericht-schrijven'))?.actionId === 'bericht-schrijven');

  // zoeken
  check('zoeken uk: «спам» → pg:mail/spam eerst', zoekRegister('спам', 'uk')[0]?.id === 'pg:mail/spam');
  check('zoeken nl: «sessies» vindt pg:identity/sessions', zoekRegister('sessies', 'nl').some((r) => r.id === 'pg:identity/sessions'));
  check('zoeken: categorie-filter en onzin = leeg', zoekRegister('', 'uk', { categorie: 'widget' }).every((r) => r.categorie === 'widget') && zoekRegister('qqqzzz', 'nl').length === 0);

  // persoonlijk
  const u = persoonlijkItem({ id: 'usr:k1', basis: 'pg:mail/spam', titel: '<b>Мій спам</b>', icoon: 'star' });
  check('persoonlijk: eigen naam (gesaneerd) en icoon, basis blijft', !!u && u.titel.uk === 'bМій спам/b' && u.icoon === 'star' && u.basis === 'pg:mail/spam' && svc('pg:mail/spam').titel.uk === 'Спам');
  check('persoonlijk: geen vrij icoon/URL, geen widget/usr als basis, ongeldige id geweigerd',
    persoonlijkItem({ id: 'usr:k2', basis: 'svc:mail', icoon: 'https://x/y.svg' })?.icoon === 'mail' && !persoonlijkItem({ id: 'usr:k3', basis: 'wdg:post' }) && !persoonlijkItem({ id: 'usr:K!', basis: 'svc:mail' }) && !persoonlijkItem({ id: 'usr:k4', basis: 'https://evil' }));
  check('persoonlijk erft rechten van de basis', !!u && toegestaanVoor(u, P).ok && !toegestaanVoor(persoonlijkItem({ id: 'usr:k5', basis: 'pg:admin/audit' })!, PA).ok);

  // contract
  check('contract: event- en MIME-naam', BIBLIOTHEEK_EVENT === 'werkblad-bibliotheek:toevoegen' && BIBLIOTHEEK_MIME === 'application/x-werkblad-bibliotheek');
  check('contract: geldige payload gelezen, rommel geweigerd',
    JSON.stringify(leesVerzoek('{"itemId":"pg:mail/spam","kind":"shortcut","point":{"x":10.4,"y":20}}')) === '{"itemId":"pg:mail/spam","kind":"shortcut","point":{"x":10,"y":20}}'
    && !leesVerzoek({ itemId: 'javascript:alert(1)', kind: 'shortcut' }) && !leesVerzoek({ itemId: 'svc:mail', kind: 'app' }) && !leesVerzoek('{oops') && leesVerzoek({ itemId: 'svc:mail', kind: 'shortcut', iconOverride: '<svg>' })?.iconOverride === undefined);

  // grootte
  check('afmetingen binnen de v3-grenzen en min ≤ standaard ≤ max', WERKBLAD_REGISTER.every((r) => r.minAfm.w >= 24 && r.maxAfm.w <= 4000 && r.minAfm.w <= r.standaardAfm.w && r.standaardAfm.w <= r.maxAfm.w && r.minAfm.h <= r.standaardAfm.h && r.standaardAfm.h <= r.maxAfm.h));
  // integratie (etappe D): serverhaken
  check('haken: map:m1 = map, usr: alleen met bestaande basis, onbekend/verkeerde soort weg', H.itemToegestaan('map:m1', 'folder', 'prive', 'telefoon') && H.itemToegestaan('usr:k1', 'shortcut', 'prive', 'computer', { basis: 'pg:mail/inbox' })
    && !H.itemToegestaan('usr:k1', 'shortcut', 'prive', 'computer', { basis: 'https://x.test' }) && !H.itemToegestaan('usr:k1', 'shortcut', 'prive', 'computer') && !H.itemToegestaan('pg:mail/nope', 'shortcut', 'prive', 'computer') && !H.itemToegestaan('svc:mail', 'widget', 'prive', 'computer'));
  check('haken: privé/technisch gescheiden (beheerpagina/technische widget alleen technisch)', !H.itemToegestaan('pg:admin/audit', 'shortcut', 'prive', 'computer') && H.itemToegestaan('pg:admin/audit', 'shortcut', 'technisch', 'computer') && !H.itemToegestaan('wdg:tech-server', 'widget', 'prive', 'computer') && H.itemToegestaan('wdg:tech-server', 'widget', 'technisch', 'computer'));
  check('haken: grenzen uit het register; singleton', H.grenzen('wdg:post', 'widget')?.min.w === registerItem('wdg:post')!.minAfm.w && H.grenzen('usr:k1', 'shortcut')?.min.w === 72 && H.grenzen('map:m3', 'folder')?.max.w === 192 && H.grenzen('wdg:post', 'shortcut') === undefined && H.singleton('wdg:begroeting') === !!registerItem('wdg:begroeting')!.singleton);
  const telLaag = normaliseerLaag({ canvasWidth: 390, items: [{ instanceId: 'a', itemId: 'wdg:begroeting', kind: 'widget', x: 50, y: 0, w: 5000, h: 10, z: 1 }] }, 'telefoon', { ruimte: 'prive', ...H });
  check('minimum breder dan het canvas (v2-widget op 390 px) → canvasbreedte, nooit buiten beeld', telLaag.items[0].w <= 390 && telLaag.items[0].x + telLaag.items[0].w <= 390 && grenzenVan(() => ({ minW: 1200 }), 'wdg:x', 390).minW === 390);
  check('register is bevroren', Object.isFrozen(WERKBLAD_REGISTER) && Object.isFrozen(WERKBLAD_REGISTER[0]));
  return einde();
}
