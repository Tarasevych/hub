// Recente zoekopdrachten van de bovenbalk (02.11.2026): per account, alleen op dit apparaat, met try/catch rond de opslag.
// Standalone: geen database, geen netwerk. Een eenvoudige geheugen-opslag vervangt localStorage.
import { checker } from './hulp/nep-google';
import { readFileSync } from 'node:fs';
import { bewaarRecent, isTechRoute, leesRecent, recentRuimteNu, recentRuimteVoor, recentSleutel, wisRecent, RECENT_MAX, RECENT_RUIMTE_HINT, type RecenteZoekopdracht } from '../../src/zoek/zoek-recent';

function geheugen(): Storage & { kaart: Map<string, string> } {
  const kaart = new Map<string, string>();
  return {
    kaart,
    getItem: (k: string) => (kaart.has(k) ? kaart.get(k)! : null),
    setItem: (k: string, v: string) => { kaart.set(k, String(v)); },
    removeItem: (k: string) => { kaart.delete(k); },
    clear: () => kaart.clear(),
    key: () => null,
    get length() { return kaart.size; },
  } as Storage & { kaart: Map<string, string> };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-recent');
  const A = 'acc-1';
  const B = 'acc-2';

  {
    const op = geheugen();
    bewaarRecent('Factuur', 'mail', 1000, A, op);
    bewaarRecent('Foto', 'files', 2000, A, op);
    const lijst = leesRecent(A, op);
    check('nieuwste eerst', lijst.map(r => r.vraag).join(',') === 'Foto,Factuur');
    check('sectie en tijd bewaard', lijst[1].sectie === 'mail' && lijst[1].tijd === 1000);
    bewaarRecent('  factuur ', 'agenda', 3000, A, op);
    const na = leesRecent(A, op);
    check('dubbel (hoofdletters tellen niet mee) naar voren, niet gedupliceerd', na.length === 2 && na[0].vraag === 'factuur' && na[0].sectie === 'agenda');
  }

  {
    const op = geheugen();
    for (let i = 0; i < RECENT_MAX + 5; i++) bewaarRecent(`zoek ${i}`, 'all', 1000 + i, A, op);
    const lijst = leesRecent(A, op);
    check(`maximaal ${RECENT_MAX} rijen`, lijst.length === RECENT_MAX);
    check('de oudste vallen eruit', lijst[0].vraag === `zoek ${RECENT_MAX + 4}` && !lijst.some(r => r.vraag === 'zoek 0'));
  }

  {
    const op = geheugen();
    bewaarRecent('geheim', 'mail', 1000, A, op);
    check('ander account ziet niets (sleutel per account)', leesRecent(B, op).length === 0);
    check('sleutel bevat de gebruikers-id', recentSleutel(A) === `mr-zoek-recent:${A}` && recentSleutel('') === '');
  }

  {
    const op = geheugen();
    const uit = bewaarRecent('niets', 'all', 1000, '', op);
    check('zonder account wordt niets bewaard', uit.length === 0 && op.kaart.size === 0);
    check('lege of lege-spatie-tekst wordt niet bewaard', bewaarRecent('   ', 'all', 1000, A, op).length === 0 && op.kaart.size === 0);
  }

  {
    const op = geheugen();
    op.setItem(`mr-zoek-recent:${A}`, '{kapot');
    check('kapotte JSON → lege lijst, geen fout', leesRecent(A, op).length === 0);
    op.setItem(`mr-zoek-recent:${A}`, JSON.stringify([{ vraag: 'ok', sectie: 'mail', tijd: 5 }, { vraag: '', tijd: 5 }, 'x', { vraag: 'slecht-sectie', sectie: 'hack', tijd: 6 }, { vraag: 'geen-tijd' }]));
    const lijst = leesRecent(A, op) as RecenteZoekopdracht[];
    check('ongeldige rijen weggelaten, onbekende sectie → all', lijst.length === 2 && lijst[1].sectie === 'all' && lijst.every(r => r.tijd > 0));
  }

  {
    const kapot = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('vol'); }, removeItem: () => { throw new Error('nee'); } } as unknown as Storage;
    let gegooid = false;
    try {
      check('geblokkeerde opslag: lezen geeft lege lijst', leesRecent(A, kapot).length === 0);
      check('geblokkeerde opslag: bewaren geeft lijst zonder fout', bewaarRecent('x', 'all', 1, A, kapot).length === 1);
      wisRecent(A, kapot);
    } catch {
      gegooid = true;
    }
    check('geblokkeerde opslag gooit nooit een fout naar buiten', !gegooid);
  }

  {
    const op = geheugen();
    bewaarRecent('weg', 'all', 1000, A, op);
    wisRecent(A, op);
    check('wissen leegt de lijst van dit account', leesRecent(A, op).length === 0);
  }

  // ORCH-001 (05.11.2026): een lijst per ruimte van het tabblad. Een in het technische profiel gekozen pagina (admin/sso) mag in de
  // privéruimte van hetzelfde account niet als rechtstreekse link verschijnen.
  {
    const vorige = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    const tab = geheugen();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = tab;
    try {
      const op = geheugen();
      bewaarRecent('Приватний запит', 'all', 1000, A, op);
      tab.setItem(RECENT_RUIMTE_HINT, 'technisch');
      bewaarRecent('SSO', 'paginas', 2000, A, op, { soort: 'pagina', route: { host: 'admin', pad: 'sso' } });
      const tech = leesRecent(A, op);
      tab.setItem(RECENT_RUIMTE_HINT, 'gebruiker');
      const prive = leesRecent(A, op);
      check('ruimte: technisch profiel → eigen sleutel; privé houdt de oude sleutel (bestaande lijsten blijven)',
        recentSleutel(A, 'technisch') === `mr-zoek-recent:${A}:technisch` && recentSleutel(A, 'gebruiker') === `mr-zoek-recent:${A}` && recentSleutel(A) === `mr-zoek-recent:${A}`);
      check('ruimte: de in het technische profiel gekozen pagina admin/sso staat alleen in de technische lijst, niet in de privéruimte',
        tech.length === 1 && tech[0].route?.host === 'admin' && prive.length === 1 && prive[0].vraag === 'Приватний запит' && !prive.some((r) => r.route?.host === 'admin'),
        JSON.stringify({ tech, prive }));
      tab.setItem(RECENT_RUIMTE_HINT, 'technisch');
      wisRecent(A, op);
      tab.setItem(RECENT_RUIMTE_HINT, 'gebruiker');
      check('ruimte: wissen in het technische profiel laat de privélijst staan', leesRecent(A, op).length === 1);
    } finally {
      (globalThis as { sessionStorage?: unknown }).sessionStorage = vorige;
    }
  }

  // Na de onafhankelijke controle (05.11.2026): de ruimte volgt de activering, niet het uiterlijk; technische routes nooit privé.
  {
    const op = geheugen();
    // Privépagina (hub, mail, id) met een actief profiel: het uiterlijk zegt 'gebruiker', de zoeker toont toch admin/sso.
    bewaarRecent('Приватний запит', 'all', 1000, A, op, {}, 'gebruiker');
    const terug = bewaarRecent('SSO', 'paginas', 2000, A, op, { soort: 'pagina', route: { host: 'admin', pad: 'sso' } }, 'gebruiker');
    const prive = leesRecent(A, op, 'gebruiker'), tech = leesRecent(A, op, 'technisch');
    check('techroute: admin/sso gekozen in de ruimte «gebruiker» → alleen in de technische lijst; de privélijst blijft zoals hij was',
      tech.length === 1 && tech[0].route?.host === 'admin' && prive.length === 1 && prive[0].vraag === 'Приватний запит' && terug.length === 1 && terug[0].vraag === 'Приватний запит'
        && !String(op.kaart.get(`mr-zoek-recent:${A}`)).includes('admin'), JSON.stringify({ prive, tech, terug }));
    const r = (host: string, p: string, hash?: string) => ({ host, pad: p, ...(hash ? { hash } : {}) }) as Parameters<typeof isTechRoute>[0];
    const techJa = [r('admin', 'sso'), r('api', 'vault'), r('mcp', 'dashboard'), r('mcp', 'tools'), r('mcp', 'verbindingen'), r('mcp', '/hulpmiddelen'), r('mcp', 'agents', 'technisch'), r('mcp', 'agents', '#technisch/x')];
    const techNee = [r('hub', 'overview'), r('mail', 'inbox'), r('id', 'sessions'), r('identity', 'security'), r('mcp', 'agents'), r('mcp', '/agenten'), r('mcp', 'overview'), r('mcp', 'connect'), r('mcp', ''), r('mcp', 'agents', 'connectors'), null];
    check('techroute: admin.*, api.*, mcp.* buiten de hub en de hub #technisch zijn technisch; de hub zelf en de privédiensten niet',
      techJa.every((x) => isTechRoute(x)) && techNee.every((x) => !isTechRoute(x)),
      `${techJa.filter((x) => !isTechRoute(x)).map((x) => JSON.stringify(x)).join(' ')}|${techNee.filter((x) => isTechRoute(x)).map((x) => JSON.stringify(x)).join(' ')}`);
    // Een privélijst van vóór de scheiding (één lijst voor alles) met een technische route: niet meer getoond, weg bij het volgende bewaren.
    const oud = geheugen();
    oud.setItem(`mr-zoek-recent:${A}`, JSON.stringify([{ vraag: 'Ролі', sectie: 'paginas', tijd: 9, soort: 'pagina', route: { host: 'admin', pad: 'roles' } }, { vraag: 'Пошта', sectie: 'paginas', tijd: 8, soort: 'pagina', route: { host: 'mail', pad: 'inbox' } }]));
    const zicht = leesRecent(A, oud, 'gebruiker');
    bewaarRecent('Нове', 'all', 10, A, oud, {}, 'gebruiker');
    check('techroute: oude privélijst toont admin/roles niet meer en schrijft hem bij het volgende bewaren niet terug',
      zicht.length === 1 && zicht[0].vraag === 'Пошта' && !String(oud.kaart.get(`mr-zoek-recent:${A}`)).includes('admin'), JSON.stringify(zicht));
    wisRecent(A, op, 'gebruiker');
    check('techroute: wissen in de privéruimte laat de technische lijst staan', leesRecent(A, op, 'technisch').length === 1 && leesRecent(A, op, 'gebruiker').length === 0);
    bewaarRecent('Ще приватне', 'all', 3000, A, op, {}, 'gebruiker');
    wisRecent(A, op, 'technisch');
    check('techroute: wissen met de ruimte «technisch» (zonder hint) leegt alleen de technische lijst', leesRecent(A, op, 'technisch').length === 0 && leesRecent(A, op, 'gebruiker').length === 1);
  }

  {
    const tab = geheugen();
    check('ruimte na F5: status nog niet geladen, geen hint → privé', recentRuimteVoor({ geladen: false, technisch: false }, tab) === 'gebruiker' && tab.kaart.size === 0);
    check('ruimte: geladen + actieve activering → technisch, en onthouden voor F5', recentRuimteVoor({ geladen: true, technisch: true }, tab) === 'technisch' && tab.getItem(RECENT_RUIMTE_HINT) === 'technisch');
    check('ruimte na F5: status laadt nog → de laatst bekende ruimte van dit tabblad (technisch), niet privé',
      recentRuimteVoor({ geladen: false, technisch: false }, tab) === 'technisch' && recentRuimteNu(tab) === 'technisch');
    check('ruimte: geladen zonder activering → privé, ook als het tabblad eerder technisch was', recentRuimteVoor({ geladen: true, technisch: false }, tab) === 'gebruiker' && tab.getItem(RECENT_RUIMTE_HINT) === 'gebruiker');
    const kapot = { getItem: () => { throw new Error('nee'); }, setItem: () => { throw new Error('nee'); } } as unknown as Storage;
    let gegooid = false;
    try { check('ruimte: geblokkeerde sessionStorage → geen fout; activering beslist, zonder status privé', recentRuimteVoor({ geladen: true, technisch: true }, kapot) === 'technisch' && recentRuimteVoor({ geladen: false, technisch: true }, kapot) === 'gebruiker'); } catch { gegooid = true; }
    check('ruimte: geblokkeerde sessionStorage gooit nooit', !gegooid);
    check('ruimte: eigen hint, niet die van het uiterlijk (tsv-weergave-ruimte is op privépagina\'s altijd «gebruiker»)', RECENT_RUIMTE_HINT !== 'tsv-weergave-ruimte' && RECENT_RUIMTE_HINT === 'mr-zoek-ruimte');
    // ZoekGlobaal: de ruimte wordt bij het openen vastgelegd en aan ALLE aanroepen meegegeven (anders schrijft een open menu na een
    // statuswijziging in de verkeerde lijst).
    const zg = readFileSync('src/zoek/ZoekGlobaal.tsx', 'utf8');
    const aanroepen = zg.match(/\b(?:bewaarRecent|leesRecent|wisRecent)\([^;]*/g) || [];
    check('ZoekGlobaal: ruimte vastgelegd bij het openen (activering via profielVan) en meegegeven aan elke lees-, bewaar- en wisaanroep',
      /const doOpen = useCallback\(\(\) => \{[\s\S]*?ruimte\.current = recentRuimteVoor\(\{ geladen: st\.geladen, technisch: profielVan\(st\) === 'technisch' \}\)/.test(zg)
        && aanroepen.length >= 5 && aanroepen.every((a) => a.includes('ruimte.current')), aanroepen.filter((a) => !a.includes('ruimte.current')).join(' | ') || String(aanroepen.length));
  }

  return einde();
}
