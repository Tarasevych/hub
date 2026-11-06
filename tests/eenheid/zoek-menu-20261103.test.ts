// INTEG-001 (03.11.2026) — HET ZOEKMENU IN DE BOVENBALK. Draaien: node scripts/eenheidstests.mjs zoek-menu-20261103
// Wens van de eigenaar (vier punten):
//   1. de zoekknop klapt een menu open (zoals Windows), geen nieuwe pagina;
//   2. in het menu: de recente zoekopdrachten met TYPE, PICTOGRAM en SECTIE;
//   3. een aparte knop «Перейти до пошуку» opent de zoekpagina met het HUIDIGE resultaat (niet gewist, meteen getoond);
//   4. Esc sluit het menu, Enter zoekt, ↑/↓ lopen door de rijen, een klik ernaast sluit.
// Standalone: geen database, geen netwerk. Wat hier staat:
//  A. recente zoekopdrachten met type (zoek / functie / pagina) + route, oude rijen, kapotte opslag, geen persoonlijke titels
//  B. het geheugen van het huidige resultaat (zoek-laatste.ts): heen en terug, andere vraag, verlopen, te groot, kapotte opslag
//  C. de zuivere menulogica (zoek-menu.ts): meta, rijen, volgorde, keuzeactie, toetsen, paginadoel, melding aan de zoekpagina
//  D. structuur: ZoekVeld als MENU (kopjes, vast open, type · sectie · tijd), ZoekGlobaal-bron (knop, Esc, Enter, klik ernaast), pagina
//  E. CSS: nieuwe regels, tokens, geen hex
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { bewaarRecent, leesRecent, recentSleutel, RECENT_MAX } from '../../src/zoek/zoek-recent';
import { MENU_RESULTATEN_MAX, MENU_SUGGESTIES_MAX, RECENT_SOORT_NAAM, ZOEK_NAAR_PAGINA_EVENT, bouwMenuRijen, keuzeActie, meldZoekPagina, menuToets, paginaDoel, recentMeta, trefferRij, uitkomstVoor } from '../../src/zoek/zoek-menu';
import { volgendeIndex } from '../../src/platform/toegankelijk';
import type { ZoekRoute, ZoekSuggestie, ZoekTreffer } from '../../shared/zoek-model';

const lees = (f: string) => readFileSync(f, 'utf8');
const tel = (s: string, d: string) => s.split(d).length - 1;

function geheugen(): Storage & { kaart: Map<string, string> } {
  const kaart = new Map<string, string>();
  return { kaart, getItem: (k: string) => (kaart.has(k) ? kaart.get(k)! : null), setItem: (k: string, v: string) => { kaart.set(k, String(v)); }, removeItem: (k: string) => { kaart.delete(k); }, clear: () => kaart.clear(), key: () => null, get length() { return kaart.size; } } as Storage & { kaart: Map<string, string> };
}
const treffer = (p: Partial<ZoekTreffer>): ZoekTreffer => ({ id: 'x', bron: 'mail', soort: 'bericht', titel: 'Titel', titels: {}, omschrijving: '', pad: '', route: { host: 'mail', pad: '/inbox' }, taal: '', formaat: '', bijgewerktOp: 1_800_000_000_000, extra: {}, integratie: '', score: 1, percent: 50, uitleg: [], fragment: { tekst: '', bron: 'tekst', posities: [] }, ...p });

// Zelfde nagebootste browser als zoek-in-menu-20261024 (canonical-service leest window.__TSV_CANONICAL_SERVICE__ bij het laden).
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://hub.tarasevych.com/zoek?q=пошта');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(g, 'navigator', { value: { platform: 'Linux', userAgent: 'eenheid' }, configurable: true, writable: true });
  g.CSS = { escape: (s: string) => s };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-menu-20261103');
  const A = 'acc-1';
  const NU = 1_800_000_000_000;
  const routeInst: ZoekRoute = { host: 'id', pad: '/instellingen', params: { focus: 'mail.koppelen' } };

  // ================================================================ A. recente zoekopdrachten met type
  {
    const op = geheugen();
    bewaarRecent('factuur', 'mail', NU - 5 * 60_000, A, op);
    bewaarRecent('Налаштування пошти', 'instellingen', NU - 3_600_000, A, op, { soort: 'functie', route: routeInst });
    bewaarRecent('Поштові акаунти', 'paginas', NU - 60_000, A, op, { soort: 'pagina', route: { host: 'mail', pad: '/accounts' } });
    const l = leesRecent(A, op);
    check('A type bewaard: zoekopdracht, functie en pagina (nieuwste eerst)', l.map(r => r.soort).join() === 'pagina,functie,zoek');
    check('A functie en pagina bewaren hun route (om opnieuw rechtstreeks te openen); een zoekopdracht niet', l[1].route?.pad === '/instellingen' && l[1].route?.params?.focus === 'mail.koppelen' && l[0].route?.host === 'mail' && l[2].route === undefined);
    bewaarRecent('factuur', 'agenda', NU, A, op, { soort: 'functie', route: routeInst });
    const l2 = leesRecent(A, op);
    check('A dezelfde tekst als zoekopdracht én als functie zijn twee aparte rijen', l2.filter(r => r.vraag === 'factuur').length === 2);
    bewaarRecent('Налаштування пошти', 'instellingen', NU + 1, A, op, { soort: 'functie', route: routeInst });
    check('A dezelfde functie (tekst + route) twee keer: naar voren, niet gedupliceerd', leesRecent(A, op).filter(r => r.soort === 'functie' && r.vraag === 'Налаштування пошти').length === 1 && leesRecent(A, op)[0].tijd === NU + 1);
    check('A de maximale lengte geldt voor alle typen samen', (() => { const o = geheugen(); for (let i = 0; i < RECENT_MAX + 4; i++) bewaarRecent(`p${i}`, 'paginas', NU + i, A, o, { soort: 'pagina', route: { host: 'hub', pad: `/p${i}` } }); return leesRecent(A, o).length === RECENT_MAX; })());
  }
  {
    const op = geheugen();
    const uit = bewaarRecent('zonder route', 'paginas', NU, A, op, { soort: 'functie' });
    check('A een functie zonder route kan niet rechtstreeks openen → geldt als gewone zoekopdracht', uit[0].soort === 'zoek' && uit[0].route === undefined);
    op.setItem(recentSleutel(A), JSON.stringify([
      { vraag: 'oud', sectie: 'mail', tijd: 5 },
      { vraag: 'slecht-host', sectie: 'paginas', tijd: 6, soort: 'functie', route: { host: 'evil.example', pad: '/x' } },
      { vraag: 'te-lang-pad', sectie: 'paginas', tijd: 7, soort: 'pagina', route: { host: 'hub', pad: `/${'a'.repeat(600)}` } },
      { vraag: 'goed', sectie: 'paginas', tijd: 8, soort: 'pagina', route: { host: 'hub', pad: '/zoek', params: { ok_1: 'x', 'k k': 'y', n: 5 } } },
      { vraag: 'onbekend-type', sectie: 'mail', tijd: 9, soort: 'treffer', route: { host: 'hub', pad: '/' } },
    ]));
    const l = leesRecent(A, op);
    check('A oude rijen (zonder soort) gelden als zoekopdracht; onbekend type → zoekopdracht', l.find(r => r.vraag === 'oud')?.soort === 'zoek' && l.find(r => r.vraag === 'onbekend-type')?.soort === 'zoek');
    check('A een route met een vreemde host of een te lang pad wordt niet vertrouwd (→ zoekopdracht zonder route)', ['slecht-host', 'te-lang-pad'].every(v => { const r = l.find(x => x.vraag === v); return !!r && r.soort === 'zoek' && r.route === undefined; }));
    check('A een geldige route blijft, met alleen de veilige parameters (naam-regel, waarde = tekst)', JSON.stringify(l.find(r => r.vraag === 'goed')?.route) === '{"host":"hub","pad":"/zoek","params":{"ok_1":"x"}}');
  }
  {
    const bron = lees('src/zoek/zoek-recent.ts');
    check('A privacy: er is geen type «treffer» — titels van resultaten uit post/bestanden worden nooit bewaard, alleen getypte tekst en namen van functies/pagina’s', !/'treffer'|'resultaat'/.test(bron.replace(/\/\/.*$/gm, '')) && bron.includes('GEEN titels van'));
  }

  // ================================================================ B. het huidige resultaat (zoek-laatste.ts)
  const herstel = nepBrowser();
  const stil = console.error; console.error = () => {};
  try {
    const { bewaarLaatste, leesLaatste, laatsteSleutel, LAATSTE_GELDIG_MS, LAATSTE_MAX_TEKENS } = await import('../../src/zoek/zoek-laatste');
    const uitkomst = (n: number) => ({
      q: 'factuur', qNorm: 'factuur', items: Array.from({ length: n }, (_, i) => treffer({ id: `m-${i}`, titel: `Factuur ${i}`, percent: 90 - i })), suggesties: [], totaal: n + 30, pagina: 1, perPagina: 20, bron: 'index' as const, duurMs: 4, versie: 'zoek-kern-2' as const,
      gesloten: [{ dienst: 'cloud', dienstNaam: { uk: 'Хмара', nl: 'Cloud' }, code: 'RUIMTE_GESLOTEN', uitleg: { uk: 'закрито', nl: 'dicht' } }],
    });
    {
      const op = geheugen();
      check('B bewaren lukt voor een aangemeld account', bewaarLaatste('Factuur', 'mail', uitkomst(3), NU, A, op) === true && op.kaart.has(laatsteSleutel(A)));
      const terug = leesLaatste('  factuur ', 'mail', NU + 60_000, A, op);
      check('B precies deze vraag en sectie komt terug (hoofdletters en randspaties tellen niet), met totaal, items en gesloten diensten', !!terug && terug.items.length === 3 && terug.totaal === 33 && terug.items[0].titel === 'Factuur 0' && terug.gesloten.length === 1 && terug.gesloten[0].dienst === 'cloud');
      check('B een andere vraag of een andere sectie geeft niets (het huidige resultaat is van PRECIES die vraag)', leesLaatste('factuur 2', 'mail', NU, A, op) === null && leesLaatste('factuur', 'all', NU, A, op) === null);
      check('B na 10 minuten verlopen; net ervoor nog geldig', leesLaatste('factuur', 'mail', NU + LAATSTE_GELDIG_MS + 1, A, op) === null && leesLaatste('factuur', 'mail', NU + LAATSTE_GELDIG_MS - 1, A, op) !== null);
      check('B lezen wist niets (de pagina mag herladen en toont hetzelfde resultaat)', leesLaatste('factuur', 'mail', NU, A, op) !== null && leesLaatste('factuur', 'mail', NU, A, op) !== null);
      check('B ander account ziet niets (sleutel per account)', leesLaatste('factuur', 'mail', NU, 'acc-2', op) === null);
      bewaarLaatste('factuur', 'mail', null, NU, A, op);
      check('B bewaren van «geen resultaat» wist het geheugen', leesLaatste('factuur', 'mail', NU, A, op) === null && !op.kaart.has(laatsteSleutel(A)));
    }
    {
      const op = geheugen();
      check('B zonder account of zonder opslag wordt niets bewaard', bewaarLaatste('x', 'all', uitkomst(1), NU, '', op) === false && op.kaart.size === 0 && bewaarLaatste('x', 'all', uitkomst(1), NU, A, null) === false);
      const groot = uitkomst(1); groot.items[0].extra = { rommel: 'x'.repeat(LAATSTE_MAX_TEKENS + 10) };
      check('B een te groot antwoord wordt niet bewaard (en een oude waarde verdwijnt)', bewaarLaatste('x', 'all', uitkomst(1), NU, A, op) === true && bewaarLaatste('x', 'all', groot, NU, A, op) === false && op.kaart.size === 0);
      op.setItem(laatsteSleutel(A), '{kapot');
      check('B kapotte JSON → null, geen fout', leesLaatste('x', 'all', NU, A, op) === null);
      op.setItem(laatsteSleutel(A), JSON.stringify({ k: 'all|x', tijd: NU, uitkomst: { items: [{ id: '', bron: 'mail' }, { id: 'ok', bron: 'hack' }, { id: 'goed', bron: 'mail', soort: 'bericht', titel: 'T', route: { host: 'mail', pad: '/inbox' } }], totaal: 1 } }));
      const schoon = leesLaatste('x', 'all', NU, A, op);
      check('B bij het lezen worden de rijen opnieuw gecontroleerd (tolerante lezer): ongeldige treffers vallen weg', !!schoon && schoon.items.length === 1 && schoon.items[0].id === 'goed');
      op.setItem(laatsteSleutel(A), JSON.stringify({ k: 'all|x', tijd: NU, uitkomst: { items: [], totaal: 0 } }));
      check('B een leeg antwoord telt niet als «huidig resultaat»', leesLaatste('x', 'all', NU, A, op) === null);
      const kapot = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('vol'); }, removeItem: () => { throw new Error('nee'); } } as unknown as Storage;
      let gegooid = false; try { bewaarLaatste('x', 'all', uitkomst(1), NU, A, kapot); leesLaatste('x', 'all', NU, A, kapot); } catch { gegooid = true; }
      check('B geblokkeerde opslag gooit nooit een fout naar buiten', !gegooid);
    }

    // ================================================================ C. zuivere menulogica
    {
      const r = { vraag: 'factuur', sectie: 'mail' as const, tijd: NU - 5 * 60_000, soort: 'zoek' as const };
      check('C meta: type · sectie · tijd (uk)', recentMeta(r, 'uk', NU) === 'Запит · Пошта · 5 хв тому');
      check('C meta (nl) en types functie/pagina', recentMeta({ ...r, soort: 'functie', sectie: 'instellingen', tijd: NU - 3_600_000 }, 'nl', NU) === 'Functie · Instellingen · 1 uur geleden' && RECENT_SOORT_NAAM.pagina.uk === 'Сторінка' && RECENT_SOORT_NAAM.zoek.nl === 'Zoekopdracht');
      check('C meta: ouder dan een week → geen tijd, geen losse scheiding', recentMeta({ ...r, tijd: NU - 20 * 864e5 }, 'uk', NU) === 'Запит · Пошта');
    }
    const recenten = [
      { vraag: 'фактура березень', sectie: 'mail' as const, tijd: NU - 60_000, soort: 'zoek' as const },
      { vraag: 'Налаштування пошти', sectie: 'instellingen' as const, tijd: NU - 120_000, soort: 'functie' as const, route: routeInst },
      { vraag: 'rapport', sectie: 'files' as const, tijd: NU - 180_000, soort: 'zoek' as const },
      { vraag: 'факт', sectie: 'all' as const, tijd: NU - 240_000, soort: 'zoek' as const },
    ];
    const groepen = { recent: 'Нещодавні', suggesties: 'Підказки', resultaten: 'Результати' };
    {
      const leeg = bouwMenuRijen({ q: '', lang: 'uk', nu: NU, recent: recenten, suggesties: [], treffers: [treffer({})], groepen });
      check('C leeg veld: alleen de recente zoekopdrachten, in volgorde, elk met pictogram, meta (type · sectie · tijd) en kopje «Нещодавні»', leeg.length === 4 && leeg.every(x => x.soort === 'geschiedenis' && 'icoon' in x && !!x.icoon && 'meta' in x && !!x.meta && x.groep === 'Нещодавні') && ('meta' in leeg[0] && leeg[0].meta === 'Запит · Пошта · 1 хв тому') && ('meta' in leeg[1] && leeg[1].meta?.startsWith('Функція · Налаштування')));
      check('C het pictogram volgt het type: zoekopdracht = icoon van de sectie, functie = eigen icoon (niet hetzelfde als mail)', (() => { const a = leeg[0], b = leeg[1], c = leeg[2]; return 'icoon' in a && 'icoon' in b && 'icoon' in c && a.icoon !== b.icoon && a.icoon !== c.icoon; })());
      check('C geen recente rijen → geen rijen (geen verzonnen inhoud)', bouwMenuRijen({ q: '', lang: 'nl', nu: NU, recent: [], suggesties: [], treffers: [], groepen }).length === 0);
    }
    {
      const sug: ZoekSuggestie[] = [
        { soort: 'aanvulling', tekst: 'факт' }, { soort: 'correctie', tekst: 'фактура' }, { soort: 'functie', tekst: 'Фактури: відкрити', route: { host: 'mail', pad: '/inbox' } }, { soort: 'pagina', tekst: 'Фактура' },
        { soort: 'synoniem', tekst: 'рахунок' }, { soort: 'aanvulling', tekst: 'ФАКТ' }, { soort: 'aanvulling', tekst: 'фактичний' },
      ];
      const tr = [
        ...Array.from({ length: 9 }, (_, i) => treffer({ id: `m${i}`, titel: `Фактура ${i}`, titels: { uk: `Фактура ${i}`, nl: `Factuur ${i}` } })),
        treffer({ id: 'zonder', titel: 'Geen bestemming', route: null, extra: {} }),
        treffer({ id: 'gh', bron: 'github', soort: 'issue', titel: 'Issue 12', route: null, extra: { url: 'https://github.com/o/r/issues/12' } }),
      ];
      const rijen = bouwMenuRijen({ q: 'факт', lang: 'uk', nu: NU, recent: recenten, suggesties: sug, treffers: tr, groepen });
      const soorten = rijen.map(x => x.soort);
      const sugRijen = rijen.filter(x => x.groep === 'Підказки'), resRijen = rijen.filter(x => x.groep === 'Результати'), recRijen = rijen.filter(x => x.groep === 'Нещодавні');
      check('C getypt: eerst suggesties (≤ 4; functie/pagina eerst), dan de resultaten (≤ 6), dan de recente die beginnen met de tekst (≤ 2)', sugRijen.length === MENU_SUGGESTIES_MAX && resRijen.length === MENU_RESULTATEN_MAX && soorten.indexOf('resultaat') > soorten.lastIndexOf('functie') && rijen.indexOf(recRijen[0]) > rijen.indexOf(resRijen[resRijen.length - 1]) && sugRijen[0].soort === 'functie' && sugRijen[1].soort === 'pagina');
      check('C geen dubbele teksten tussen suggesties en recente; de exact getypte tekst staat niet nog eens in de recente', new Set(rijen.filter(x => x.soort !== 'resultaat').map(x => x.tekst.toLocaleLowerCase())).size === rijen.filter(x => x.soort !== 'resultaat').length && !recRijen.some(x => x.tekst.toLocaleLowerCase() === 'факт'));
      const rr = trefferRij(tr[0], 'nl', 'R');
      check('C een resultaat toont type · sectie en zijn titel in de taal van de pagina; zonder bestemming geen rij; GitHub via de externe link', !!rr && rr.soort === 'resultaat' && rr.tekst === 'Factuur 0' && 'meta' in rr && rr.meta === 'E-mail · E-mail' && trefferRij(tr[9], 'uk') === null && (trefferRij(tr[10], 'uk') as { extern?: string } | null)?.extern === 'https://github.com/o/r/issues/12');
      check('C de recente rij van de exact gelijke tekst valt weg, een langere die begint met de tekst blijft', recRijen.length >= 1 && recRijen.every(x => x.tekst.toLocaleLowerCase().startsWith('факт') && x.tekst.toLocaleLowerCase() !== 'факт'));
      // pijltjestoetsen: ↓ van de laatste rij naar de eerste, ↑ vanaf niets naar de laatste (rond), over ALLE rijen (kopjes tellen niet mee)
      const n = rijen.length;
      check('C ↑/↓ lopen rond door alle rijen van het menu (recent, suggesties én resultaten)', volgendeIndex('ArrowDown', n - 1, n, { rond: true }) === 0 && volgendeIndex('ArrowUp', -1, n, { rond: true }) === n - 1 && volgendeIndex('ArrowDown', -1, n, { rond: true }) === 0 && volgendeIndex('ArrowUp', 0, n, { rond: true }) === n - 1);
    }
    {
      const q = 'factuur';
      const res = trefferRij(treffer({ id: 'r1', titel: 'Factuur' }), 'uk')!;
      const a1 = keuzeActie(res, ` ${q} `, 'mail');
      check('C een resultaat kiezen = openen; bewaard wordt de GETYPTE zoekopdracht (niet de titel van de e-mail)', a1.type === 'open' && a1.route?.pad === '/inbox' && a1.bewaar?.tekst === q && a1.bewaar.soort === 'zoek' && a1.bewaar.route === null);
      check('C een resultaat kiezen bij een leeg veld bewaart niets', (keuzeActie(res, '', 'all') as { bewaar: unknown }).bewaar === null);
      const gh = keuzeActie(trefferRij(treffer({ bron: 'github', soort: 'issue', route: null, extra: { url: 'https://github.com/o/r/issues/12' } }), 'uk')!, 'x', 'github');
      check('C een GitHub-resultaat opent de externe link', gh.type === 'open' && gh.extern === 'https://github.com/o/r/issues/12' && gh.route === null);
      const rf = bouwMenuRijen({ q: '', lang: 'uk', nu: NU, recent: recenten, suggesties: [], treffers: [], groepen });
      const aZoek = keuzeActie(rf[0], '', 'all'), aFunctie = keuzeActie(rf[1], '', 'all');
      check('C een recente zoekopdracht kiezen = opnieuw uitvoeren in het menu (geen navigatie)', aZoek.type === 'zoek' && aZoek.tekst === 'фактура березень');
      check('C een recente functie kiezen = rechtstreeks openen met de bewaarde route (en weer vooraan zetten met hetzelfde type)', aFunctie.type === 'open' && aFunctie.route?.pad === '/instellingen' && aFunctie.bewaar?.soort === 'functie' && aFunctie.bewaar.sectie === 'instellingen');
      const aSug = keuzeActie({ soort: 'functie', tekst: 'Thema’s', bron: 'instelling', route: { host: 'id', pad: '/themes' } }, 'th', 'all');
      check('C een functie uit de suggesties met route = openen en als functie bewaren in de sectie van haar bron', aSug.type === 'open' && aSug.bewaar?.soort === 'functie' && aSug.bewaar.sectie === 'instellingen');
      check('C een pagina zonder bron valt terug op de sectie «Сторінки»', (keuzeActie({ soort: 'pagina', tekst: 'Mail', route: { host: 'mail', pad: '/' } }, 'm', 'all') as { bewaar: { sectie: string } }).bewaar.sectie === 'paginas');
      check('C aanvulling, correctie, synoniem, categorie en een functie ZONDER route = de tekst zoeken', (['aanvulling', 'correctie', 'synoniem', 'categorie', 'functie'] as const).every(s => { const a = keuzeActie({ soort: s, tekst: 'abc', route: null }, 'a', 'all'); return a.type === 'zoek' && a.tekst === 'abc'; }));
    }
    {
      const e = (key: string, o: Record<string, boolean> = {}) => menuToets({ key, ...o });
      check('C Esc sluit het menu (één keer)', e('Escape') === 'sluit');
      check('C Esc met een modifier of tijdens IME-samenstelling is niet voor ons', e('Escape', { ctrlKey: true }) === null && e('Escape', { altKey: true }) === null && e('Escape', { isComposing: true }) === null && e('Enter', { ctrlKey: true, isComposing: true }) === null);
      check('C Ctrl/⌘+Enter = naar de zoekpagina; gewone Enter, Shift+Enter en Alt+Enter niet (Enter zoekt in het menu zelf, in ZoekVeld)', e('Enter', { ctrlKey: true }) === 'naar-pagina' && e('Enter', { metaKey: true }) === 'naar-pagina' && e('Enter') === null && e('Enter', { shiftKey: true }) === null && e('Enter', { ctrlKey: true, altKey: true }) === null);
      check('C pijltjes en andere toetsen doen op venster-niveau niets (die zijn van ZoekVeld)', ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab', 'a'].every(k => e(k) === null));
    }
    {
      check('C paginadoel: de getypte tekst en de sectie waarin gezocht wordt', JSON.stringify(paginaDoel('  rapport ', 'files', recenten)) === '{"q":"rapport","cat":"files"}');
      check('C paginadoel bij een leeg veld: de laatste ZOEKOPDRACHT (functies/pagina’s tellen niet), met haar sectie — nooit een leeg scherm als er iets te hervatten is', JSON.stringify(paginaDoel('', 'all', [recenten[1], ...recenten])) === '{"q":"фактура березень","cat":"mail"}');
      check('C paginadoel zonder tekst en zonder recente: leeg, de sectie blijft', JSON.stringify(paginaDoel('', 'github', [])) === '{"q":"","cat":"github"}');
      check('C uitkomstVoor: alleen het resultaat van precies deze vraag en sectie mag mee naar de pagina', uitkomstVoor({ q: 'Factuur', cat: 'mail' }, ' factuur', 'mail') && !uitkomstVoor({ q: 'factuur', cat: 'mail' }, 'factuur', 'all') && !uitkomstVoor({ q: 'factuur', cat: 'mail' }, 'factuur 2', 'mail') && !uitkomstVoor(null, 'x', 'all'));
    }
    {
      // melding aan de zoekpagina: een echte EventTarget als window
      const g = globalThis as Record<string, unknown>; const vorig = Object.getOwnPropertyDescriptor(g, 'window');
      const doel = new EventTarget(); Object.defineProperty(g, 'window', { value: doel, configurable: true, writable: true });
      try {
        const detail = { q: 'factuur', cat: 'mail' as const, uitkomst: null };
        check('C zonder open zoekpagina niemand die de melding overneemt → false (het venster navigeert zelf)', meldZoekPagina(detail) === false);
        let ontvangen: unknown = null;
        const h = (ev: Event) => { ontvangen = (ev as CustomEvent).detail; ev.preventDefault(); };
        doel.addEventListener(ZOEK_NAAR_PAGINA_EVENT, h);
        const overgenomen = meldZoekPagina(detail);
        doel.removeEventListener(ZOEK_NAAR_PAGINA_EVENT, h);
        check('C een open zoekpagina neemt tekst, sectie en resultaat over (preventDefault) → true, geen herladen', overgenomen === true && (ontvangen as { q: string; cat: string } | null)?.q === 'factuur' && (ontvangen as { cat: string }).cat === 'mail');
        doel.addEventListener(ZOEK_NAAR_PAGINA_EVENT, () => undefined);
        check('C een luisteraar die de melding niet overneemt (geen preventDefault) telt niet als overgenomen', meldZoekPagina(detail) === false);
      } finally { if (vorig) Object.defineProperty(g, 'window', vorig); else delete g.window; }
    }

    // ================================================================ D. structuur
    {
      const Veld = (await import('../../src/zoek/ZoekVeld')).default;
      const rijen = bouwMenuRijen({ q: '', lang: 'uk', nu: NU, recent: recenten, suggesties: [], treffers: [], groepen });
      const menu = renderToStaticMarkup(createElement(Veld, { lang: 'uk', value: '', onChange: () => undefined, onSubmit: () => undefined, suggesties: rijen, placeholder: 'Функція…', label: 'Швидкий пошук', vast: true, voet: createElement('div', { className: 'zk-pop-voet' }, 'voet') }));
      check('D MENU (vast): meteen zichtbaar zonder focus (aria-expanded=true, kader niet verborgen), 4 opties, één kopje «Нещодавні»', menu.includes('aria-expanded="true"') && !/class="zk-pop-kader"[^>]*hidden/.test(menu) && tel(menu, 'role="option"') === 4 && tel(menu, 'class="zk-groep-titel"') === 1 && menu.includes('>Нещодавні</li>'));
      check('D elke recente rij toont pictogram (svg), tekst en «type · sectie · tijd»', menu.includes('>Запит · Пошта · 1 хв тому</span>') && menu.includes('>Функція · Налаштування · 2 хв тому</span>') && tel(menu, '<svg') >= 5);
      check('D het kopje is geen optie (role=presentation) en staat vóór de eerste rij', menu.includes('<li role="presentation" class="zk-groep-titel">') && menu.indexOf('zk-groep-titel') < menu.indexOf('role="option"'));
      const gemengd = bouwMenuRijen({ q: 'факт', lang: 'uk', nu: NU, recent: recenten, suggesties: [{ soort: 'functie', tekst: 'Фактури', route: { host: 'mail', pad: '/inbox' } }], treffers: [treffer({ id: 'a', titel: 'Фактура 1' })], groepen });
      const m2 = renderToStaticMarkup(createElement(Veld, { lang: 'uk', value: 'факт', onChange: () => undefined, onSubmit: () => undefined, suggesties: gemengd, placeholder: 'x', label: 'y', vast: true, voet: createElement('div', {}, 'voet') }));
      check('D getypt: drie kopjes in de volgorde Підказки → Результати → Нещодавні; het resultaat toont «Лист · Пошта» en de tekst gemarkeerd', ['Підказки', 'Результати', 'Нещодавні'].every(k => m2.includes(`>${k}</li>`)) && m2.indexOf('Підказки') < m2.indexOf('Результати') && m2.indexOf('Результати') < m2.indexOf('Нещодавні') && m2.includes('>Лист · Пошта</span>') && m2.includes('<mark>Факт</mark>') && m2.includes('soort-resultaat'));
      const gewoon = renderToStaticMarkup(createElement(Veld, { lang: 'uk', value: 'пош', onChange: () => undefined, onSubmit: () => undefined, suggesties: [{ soort: 'functie', tekst: 'Пошта', route: { host: 'mail', pad: '/' } }], placeholder: 'x', label: 'y' }));
      check('D de zoekpagina-variant (zonder vast/groepen) blijft zoals ze was: lijst verborgen tot focus, geen kopjes', gewoon.includes('aria-expanded="false"') && gewoon.includes('hidden=""') && !gewoon.includes('zk-groep-titel'));
    }
    {
      const { default: ZoekGlobaal, ZoekMenuKnop } = await import('../../src/zoek/ZoekGlobaal');
      const veld = renderToStaticMarkup(createElement(ZoekGlobaal, { lang: 'uk', dienst: 'cloud' }));
      check('D de knop in de bovenbalk is nog steeds alleen een knop (aria-expanded=false): het menu opent pas na een klik, het is geen link naar een pagina', veld.includes('class="zk-trigger"') && veld.includes('aria-expanded="false"') && veld.includes('aria-haspopup="listbox"') && !veld.includes('<a ') && !veld.includes('href='));
      check('D ZoekMenuKnop opent het menu (geen navigatie): knop zonder href', !renderToStaticMarkup(createElement(ZoekMenuKnop, { lang: 'nl' })).includes('href='));
    }
    const bron = lees('src/zoek/ZoekGlobaal.tsx');
    const code = bron.replace(/\/\/.*$/gm, '');
    check('D knop «Перейти до пошуку» (uk) / «Naar zoeken» (nl), apart van het veld, met titel «…met het huidige resultaat»', bron.includes("zoekpagina: 'Перейти до пошуку'") && bron.includes("zoekpagina: 'Naar zoeken'") && bron.includes('data-zoek-naar-pagina') && bron.includes('onClick={naarPagina}') && bron.includes('met het huidige resultaat') && bron.includes('з поточним результатом'));
    check('D Esc: één keer sluiten, vóór ZoekVeld (onKeyDownCapture) en met stopPropagation; Ctrl/⌘+Enter → pagina', code.includes('onKeyDownCapture={onKeyCapture}') && code.includes("toets === 'sluit'") && code.includes('e.stopPropagation(); doClose()') && code.includes("toets === 'naar-pagina'") && code.includes('isComposing: e.nativeEvent.isComposing'));
    check('D Enter zoekt in het menu zelf (zoekNu → direct, bewaart in recent, GEEN navigatie); het menu is vast open', code.includes('onSubmit={zoekNu}') && /const zoekNu = \(tekst: string\) => \{[\s\S]*?bewaarRecent\(v, sectie[,)][\s\S]*?direct\.current = 1/.test(code) /* ORCH-001: met de ruimte van het geopende menu erbij */ && !/const zoekNu[^;]*location\.assign/.test(code) && code.includes(' vast '));
    check('D klik buiten sluit (pointerdown); een zoekknop schakelt zelf om (negeren in «buiten», PALET_EVENT schakelt om)', code.includes("document.addEventListener('pointerdown', buiten)") && code.includes("x.closest('[data-zoek-trigger]')") && code.includes('const o = () => { if (!open) doOpen(); else doClose(); }'));
    check('D «Перейти до пошуку»: bewaart het huidige resultaat voor de pagina (bewaarLaatste), meldt aan een open zoekpagina, anders navigeert met tekst + sectie; leeg veld → laatste zoekopdracht (paginaDoel)', code.includes('bewaarLaatste(vraag, doel.cat, huidig)') && code.includes('meldZoekPagina({ q: v, cat: doel.cat, uitkomst: huidig })') && code.includes('location.assign(zoekPaginaUrl(lang, v, doel.cat') && code.includes('paginaDoel(q, sectie, recent)'));
    check('D het resultaat in het menu is dezelfde vraag als op de pagina (bouwVraag zonder filters) en wordt met abort/debounce 250 ms opgehaald', code.includes('zoeken(bouwVraag(query, sectie, LEEG_FILTER)') && code.includes('const DEBOUNCE_MS = 250') && code.includes('ac.abort()'));
    check('D scrollen in de lijst verplaatst het venster niet (alleen scrollen van de pagina meet opnieuw)', code.includes('paneel.current.contains(e.target)'));
    check('D oude invarianten blijven: precies één useState(false) (open), focus terug via focusTerug, ⌘K/Ctrl+K, geen innerHTML', tel(bron, 'useState(false)') === 1 && bron.includes('focusTerug(vorigeFocus.current)') && bron.includes("(e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k'") && !/innerHTML/.test(bron));
    const pagina = lees('src/zoek/ZoekPagina.tsx');
    check('D zoekpagina: het huidige resultaat uit het geheugen staat er meteen (voorvulling uit leesLaatste, alleen zonder filters)', pagina.includes('leesLaatste(v, init.cat)') && pagina.includes('aantalFilters(init.f) === 0') && pagina.includes('useState<ZoekUitkomst | null>(voorvulling)') && pagina.includes('useState<ZoekTreffer[]>(voorvulling?.items ?? [])'));
    check('D zoekpagina: een open pagina neemt tekst, sectie en resultaat van het menu over zonder herladen (preventDefault), en zoekt daarna zelf verder', pagina.includes('window.addEventListener(ZOEK_NAAR_PAGINA_EVENT, h)') && pagina.includes('e.preventDefault();') && pagina.includes('setAntwoord(d.uitkomst); setItems(d.uitkomst.items)') && pagina.includes('submit(d.q); setHerhaal'));
    check('D schil: het menu verandert de bovenbalk (CanoniekOmlijsting) niet — alleen de zoekmap src/zoek', !/zoek-menu|zoek-laatste/.test(lees('src/CanoniekOmlijsting.tsx')));
  } finally { console.error = stil; herstel(); }

  // ================================================================ E. CSS
  const css = lees('src/zoek/zoek.css').replace(/\/\*[\s\S]*?\*\//g, '');
  check('E CSS: kopje, stand en rechterkolom van het menu zijn er; alleen tokens (geen hex), geen <style>, mobiel zonder maximumbreedte van de meta', ['.zk-groep-titel{', '.zk-pop-status{', '.zk-pop-status:empty{', '.zk-uitklap .zk-optie-soort{max-width:16rem', '.zk-uitklap .zk-optie-soort{max-width:none}'].every(x => css.includes(x)) && !/#[0-9a-f]{3,8}\b/i.test(css) && !/<style/i.test(lees('src/zoek/ZoekGlobaal.tsx') + lees('src/zoek/ZoekVeld.tsx')));

  return einde();
}
