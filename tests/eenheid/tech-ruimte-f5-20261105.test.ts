// TECHNISCHE RUIMTE NA F5 (ORCH-001, oude fout, 05.11.2026). Zonder database.
//
// Na F5 op een beheerpagina laadt de status van het technische profiel opnieuw (tech-opslag: geladen = false). Tot 05.11.2026 telde
// het tabblad in die tijd als privé: menu en uiterlijk sprongen even naar de privéruimte en terug, en CanoniekOmlijsting schreef de
// hint van het tabblad (tsv-weergave-ruimte) al op 'gebruiker'. techRuimteBijLaden houdt de vorige ruimte van DIT tabblad vast tot de
// eerste status er is; alleen met een goedgekeurde sessie (of terwijl die nog gecontroleerd wordt). De inhoud blijft achter de poort
// van techActief: dit gaat alleen over het eerste beeld.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
import type { TechStatus } from '../../src/tech/tech-opslag';

/** Minimale nep-browser voor het laden van src/tech/tech-opslag.ts (zoals nepBrowser in ai-hub.test.ts). Geeft de opruimfunctie. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
  const u = new URL('https://admin.tarasevych.com/sso');
  const el = () => { const a = new Map<string, string>(); return { dataset: {}, style: {}, setAttribute: (k: string, v: string) => { a.set(k, String(v)); }, getAttribute: (k: string) => a.get(k) ?? null }; };
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (x: unknown) => x }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => el(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

const stand = (geladen: boolean, eind: number | null): TechStatus => ({
  geladen, profiel: null, catalogus: null, scheef: 0, fout: null,
  activatie: eind === null ? null : ({ id: 'a', profielId: 'p', rollen: [], mogelijkheden: [], reden: 'test', begin: 0, eind } as unknown as TechStatus['activatie']),
});

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-ruimte-f5-20261105');
  const opruimen = nepBrowser();
  let techRuimteBijLaden: (t: TechStatus, vorige: string, zonderSessie: boolean) => boolean;
  try { ({ techRuimteBijLaden } = await import('../../src/tech/tech-opslag')); } finally { opruimen(); }
  const straks = Date.now() + 3_600_000, voorbij = Date.now() - 1000;

  check('1a F5: status laadt nog, tabblad was technisch, sessie → technisch blijven', techRuimteBijLaden(stand(false, null), 'technisch', false));
  check('1b F5: status laadt nog, tabblad was privé → privé', !techRuimteBijLaden(stand(false, null), 'gebruiker', false) && !techRuimteBijLaden(stand(false, null), '', false));
  check('1c zonder goedgekeurde sessie (dan komt er nooit een status) → nooit de vorige technische ruimte', !techRuimteBijLaden(stand(false, null), 'technisch', true));
  check('1d status geladen zonder activering → privé, ook al was het tabblad technisch', !techRuimteBijLaden(stand(true, null), 'technisch', false));
  check('1e status geladen, activering verlopen → privé', !techRuimteBijLaden(stand(true, voorbij), 'technisch', false));
  check('1f lopende activering → technisch, wat de hint ook zegt (en ook zonder sessievlag)', techRuimteBijLaden(stand(true, straks), 'gebruiker', false) && techRuimteBijLaden(stand(true, straks), '', true));

  const app = readFileSync('src/VerenigdDienstApp.tsx', 'utf8');
  const aanroepen = app.match(/techRuimteBijLaden\(.{0,90}/g) || [];
  const juist = "techRuimteBijLaden(tech,weergaveRuimteNu(),state!=='authorized'&&state!=='checking')";
  check('2a VerenigdDienstApp: oppervlak (menu, uiterlijk) én tabbladen gebruiken techRuimteBijLaden met de hint van dit tabblad',
    aanroepen.length === 2 && aanroepen.every((a) => a.startsWith(juist))
      && /const techRuimte=techRuimteBijLaden\(/.test(app) && /const techRuimte=isBeheerPagina\(service,tab\)&&techRuimteBijLaden\(/.test(app), aanroepen.join(' | '));
  check('2b de inhoud van een beheerpagina blijft achter de poort van de echte activering (techActief), niet achter de hint',
    app.includes("if(!techActief(tech))return <TechPoort") && app.includes("data-tech-poort='wacht'"));
  return einde();
}
