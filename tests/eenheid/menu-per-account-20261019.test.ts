// Punt 2 (audit 19.10.2026): menu, snelle toegang, kleuren en overige menukeuzes zijn PER ACCOUNT.
// Wat de eigenaar in zijn snelle toegang zet, mag het beeld van een ander account in DEZELFDE browser niet bepalen.
//
// Gevonden fout: de cache lag onder één sleutel 'tsv-zijbalk-v2' zonder account. Daardoor (a) zag een tweede account na het wisselen
// het menu van de eerste tot de bootstrap kwam, en (b) kon een wijziging de indeling van de EERSTE onder het TWEEDE account naar de
// server schrijven. Deze test houdt beide vast: de sleutel bevat de scope, en bij een accountwissel wordt niets verstuurd.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';

const ORIGIN = 'https://hub.tarasevych.com';
type Opslag = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; clear(): void; sleutels(): string[] };
const opslag = (): Opslag => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0, sleutels: () => [...m.keys()] } as unknown as Opslag; };

type Verzoek = { url: string; body: Record<string, unknown> };
const verzoeken: Verzoek[] = [];

function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  const ls = opslag(), ss = opslag();
  const u = new URL(`${ORIGIN}/overview`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: '', hash: '', protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.localStorage = ls; g.sessionStorage = ss;
  g.window = Object.assign(g, { name: '', innerWidth: 1280, innerHeight: 800, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, setTimeout, clearTimeout, setInterval, clearInterval, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, head: { appendChild: () => undefined }, createElement: () => ({ setAttribute: () => undefined, getAttribute: () => null, dataset: {} }), documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  g.fetch = async (url: unknown, init?: { body?: string }) => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>; } catch { /* geen json */ }
    verzoeken.push({ url: String(url), body });
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => JSON.stringify({ ok: true, sidebar: body.sidebar ?? null }) } as unknown as Response;
  };
  // De canonieke runtime (public/canonical-service.js) wordt door src/canoniek-dienst.ts verwacht; zelfde aanpak als mail-contacten.test.ts.
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return { ls, ss };
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-per-account-20261019');
  const bron = readFileSync('src/zijbalk-voorkeuren.ts', 'utf8');

  // ---------------------------------------------------------------- 1. de sleutel bevat het account (bron)
  check('cachesleutel is per account: `${ZIJBALK_SLEUTEL}:${scope||\'anon\'}` (zoals menu-meldingen-opslag.ts)',
    /const SLEUTEL\s*=\s*\(scope: string\)\s*=>\s*`\$\{ZIJBALK_SLEUTEL\}:\$\{scope \|\| 'anon'\}`/.test(bron), bron.slice(0, 0));
  // De enige regel die de OUDE, accountloze sleutel nog aanraakt, is het opruimen ervan; al het andere moet via SLEUTEL(scope).
  const zonderOpruimen = bron.split('\n').filter((r) => !/removeItem\(ZIJBALK_SLEUTEL\)/.test(r)).join('\n');
  const aanroepen = [...zonderOpruimen.matchAll(/localStorage\.(?:getItem|setItem)\(([^,)]+)/g)].map((m) => m[1].trim());
  check('elke lees-/schrijfactie van de cache gaat via SLEUTEL(scope) — nooit meer één sleutel voor alle accounts',
    aanroepen.length > 0 && aanroepen.every((a) => a.startsWith('SLEUTEL(')), aanroepen.join(' | '));
  check('de oude sleutel zonder account wordt opgeruimd (hij is van niemand)', /localStorage\.removeItem\(ZIJBALK_SLEUTEL\)/.test(bron));
  check('bij een accountwissel wordt openstaande opslag afgebroken en wordt nooit namens een ander geschreven',
    /if \(s === scope\) return;\s*\n\s*wachtendenAf\(\);/.test(bron) && /if \(!server \|\| scope !== s\) return; \/\/ ander account/.test(bron));

  const { ls } = nepBrowser();
  // oude, accountloze cache van «iemand» staat er nog: die mag nooit worden toegepast
  ls.setItem('tsv-zijbalk-v2', JSON.stringify({ modus: 'dicht', icoonStijl: 'kleur' }));
  const z = await import('../../src/zijbalk-voorkeuren');

  // ---------------------------------------------------------------- 2. de oude sleutel is weg en wordt niet gelezen
  check('oude accountloze cache is verwijderd en niet overgenomen', ls.getItem('tsv-zijbalk-v2') === null && z.zijbalkVoorkeuren().modus === 'auto' && z.zijbalkVoorkeuren().icoonStijl === 'klassiek');

  // ---------------------------------------------------------------- 3. account A: eigen sleutel, eigen snelle toegang
  z.zijbalkVanServer({ modus: 'dicht', icoonStijl: 'kleur', kopieen: [{ id: 'k-aaaa1111', item: 'svc:mail', plaats: 'snelbalk', volgorde: 0 }] }, { service: 'hub', scope: 'gebruiker-A' });
  check('account A: scope gezet, voorkeuren toegepast', z.zijbalkScopeNu() === 'gebruiker-A' && z.zijbalkVoorkeuren().modus === 'dicht' && z.zijbalkVoorkeuren().kopieen.length === 1);
  check('account A: cache onder tsv-zijbalk-v2:gebruiker-A, niet onder de oude sleutel', ls.getItem('tsv-zijbalk-v2:gebruiker-A') !== null && ls.getItem('tsv-zijbalk-v2') === null, ls.sleutels().join(', '));

  // eigen wijziging van A (nog niet verstuurd: 350 ms bundeling)
  verzoeken.length = 0;
  z.zetZijbalk({ icoonStijl: 'klassiek' });
  check('wijziging van A staat meteen lokaal', z.zijbalkVoorkeuren().icoonStijl === 'klassiek' && String(ls.getItem('tsv-zijbalk-v2:gebruiker-A')).includes('klassiek'));

  // ---------------------------------------------------------------- 4. wissel naar account B VOORDAT de opslag vertrok
  z.zijbalkVanServer(undefined, { service: 'hub', scope: 'gebruiker-B' });
  await wacht(600);
  check('accountwissel: de openstaande opslag van A is NIET namens B verstuurd', verzoeken.filter((r) => r.url.includes('/api/owner/ui/sidebar/save')).length === 0, verzoeken.map((r) => r.url).join(', '));
  check('account B ziet niets van A: standaardmenu, geen snelle toegang van A', z.zijbalkVoorkeuren().modus === 'auto' && z.zijbalkVoorkeuren().kopieen.length === 0 && z.zijbalkHuidigeRuimte() === 'gebruiker');
  check('de cache van A blijft onaangeroerd onder zijn eigen sleutel', String(ls.getItem('tsv-zijbalk-v2:gebruiker-A')).includes('dicht'));

  // ---------------------------------------------------------------- 5. B schrijft alleen zijn eigen stand, met zijn eigen ruimte
  verzoeken.length = 0;
  z.zetZijbalk({ modus: 'open' });
  await wacht(600);
  const opslaan = verzoeken.filter((r) => r.url.includes('/api/owner/ui/sidebar/save'));
  const sidebar = (opslaan[0]?.body.sidebar || {}) as { modus?: string; kopieen?: unknown[] };
  check('B: één opslag, met de voorkeuren van B en ruimte «gebruiker»', opslaan.length === 1 && opslaan[0].body.ruimte === 'gebruiker' && sidebar.modus === 'open' && (sidebar.kopieen || []).length === 0, JSON.stringify(opslaan[0]?.body || {}).slice(0, 200));
  check('B: cache onder zijn eigen sleutel; A en B staan los van elkaar',
    String(ls.getItem('tsv-zijbalk-v2:gebruiker-B')).includes('open') && !String(ls.getItem('tsv-zijbalk-v2:gebruiker-B')).includes('k-aaaa1111') && String(ls.getItem('tsv-zijbalk-v2:gebruiker-A')).includes('k-aaaa1111'));

  // ---------------------------------------------------------------- 6. terug naar A: zijn eigen indeling komt terug uit zijn eigen cache
  z.zijbalkScope('gebruiker-A');
  check('terug bij A: zijn eigen cache geldt weer (dicht + zijn kopie)', z.zijbalkVoorkeuren().modus === 'dicht' && z.zijbalkVoorkeuren().kopieen[0]?.id === 'k-aaaa1111');

  // ---------------------------------------------------------------- 7. afmelden: geen enkel account meer, dus niets van iemand
  z.zijbalkVanServer(undefined, null);
  check('afgemeld: scope «anon», standaardmenu, geen serveropslag meer', z.zijbalkScopeNu() === 'anon' && z.zijbalkVoorkeuren().modus === 'auto' && z.zijbalkServerDienst() === '');
  verzoeken.length = 0;
  z.zetZijbalk({ modus: 'dicht' });
  await wacht(500);
  check('afgemeld: een wijziging blijft lokaal (geen enkel verzoek)', verzoeken.length === 0, verzoeken.map((r) => r.url).join(', '));

  // ---------------------------------------------------------------- 8. ook de weergavemodus (простий/розширений) hangt aan het account
  const wbron = readFileSync('src/weergave/weergave-opslag.ts', 'utf8');
  check('weergave-store: kopie onder `mr-weergave-modus-v1:<scope>`, oude sleutel opgeruimd',
    /const SLEUTEL = \(\) => `\$\{BASIS\}:\$\{zijbalkScopeNu\(\) \|\| 'anon'\}`/.test(wbron) && /localStorage\.removeItem\(BASIS\)/.test(wbron));

  // ---- en de weergavekeuze van het meldingenpaneel (groeperen) hangt óók aan het account
  const nbron = readFileSync('src/MeldingenpaneelInhoud.tsx', 'utf8');
  check('meldingenpaneel: «groeperen» per account (`mr.notif.group:<scope>`), oude sleutel opgeruimd',
    /const GROUP_KEY = \(\) => `\$\{GROUP_BASIS\}:\$\{zijbalkScopeNu\(\) \|\| 'anon'\}`/.test(nbron) && /removeItem\(GROUP_BASIS\)/.test(nbron));
  // ---- al accountgebonden (ongemoeid gelaten, ter bevestiging dat de aanpak overal dezelfde is)
  check('al per account: menutellers, «gezien»-stand en gelezen activiteit gebruiken dezelfde scope-aanpak',
    /WEG \+ scope/.test(readFileSync('src/menu-meldingen-opslag.ts', 'utf8'))
    && /'tsv-menu-gezien-v1:'\+meldingenScope/.test(readFileSync('src/CanoniekOmlijsting.tsx', 'utf8'))
    && /tsv:activity-read-v1:\$\{scope \|\| 'anon'\}/.test(readFileSync('src/connector-activiteit.ts', 'utf8')));

  return einde();
}
