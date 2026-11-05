// Recente zoekopdrachten van de bovenbalk (02.11.2026): per account, alleen op dit apparaat, met try/catch rond de opslag.
// Standalone: geen database, geen netwerk. Een eenvoudige geheugen-opslag vervangt localStorage.
import { checker } from './hulp/nep-google';
import { readFileSync } from 'node:fs';
import { bewaarRecent, leesRecent, recentSleutel, wisRecent, RECENT_MAX, RECENT_RUIMTE_HINT, type RecenteZoekopdracht } from '../../src/zoek/zoek-recent';

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
    const voorkeuren = readFileSync('src/gedeelde-voorkeuren.ts', 'utf8');
    check('ruimte: dezelfde hint als src/gedeelde-voorkeuren.ts (WEERGAVE_RUIMTE_HINT)', voorkeuren.includes(`WEERGAVE_RUIMTE_HINT='${RECENT_RUIMTE_HINT}'`));
  }

  return einde();
}
