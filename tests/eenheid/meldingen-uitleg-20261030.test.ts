// UI-014 (30.10.2026): meldingencentrum — register per soort (uitleg + actie + deeplink verplicht), de drie kaarten uit de
// schermafbeeldingen van de eigenaar, taal-splitsing, gelezen-status (tabbladen, groepen), «nieuwste eerst» op de server, de voet-
// fix, de grootte-instelling en de migraties 0190/0191.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { REGISTER, ALGEMENE_ACTIES, uitlegVoor, wieVan, objectVan, redenVan, absoluteTijd } from '../../shared/meldingen-v2/uitleg-register';
import { groepeer, tellers, type V2Melding } from '../../shared/meldingen-v2/groepering';
import { legeRegels, normaliseerRegels, normaliseerWeergave, zetRegel } from '../../shared/meldingen-v2/beleid';
import { normaliseerIds, GELEZEN_MAX } from '../../backend/meldingen-gelezen';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';

const NU = Date.parse('2026-10-30T09:00:00+01:00');
const cyr = /[\u0400-\u04FF]/;

function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
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
  const { check, einde } = checker('meldingen-uitleg-20261030');
  // Browsermodules pas na een nagebootste browser laden (zelfde als zoek-in-menu-20261024: canonical-service.js bij het laden).
  nepBrowser();
  const { taalDeel } = await import('../../src/canoniek-meldingen');
  const { activityTitle, mergeRead, READ_MAX } = await import('../../src/connector-activiteit');
  const { vanActiviteit, vanServer } = await import('../../src/meldingen/v2/omzetten');

  // ---------------- 1. register: elke soort volledig
  const ids = new Set<string>();
  for (const r of REGISTER) {
    check(`register ${r.id}: unieke id`, !ids.has(r.id)); ids.add(r.id);
    const velden = [r.wat, r.waarom, r.gevolg, r.doen, ...(r.rechten ? [r.rechten] : [])];
    check(`register ${r.id}: uitleg in uk én nl (wat/waarom/gevolg/doen)`, velden.every(([uk, nl]) => uk.length > 15 && nl.length > 15 && cyr.test(uk) && !cyr.test(nl)));
    check(`register ${r.id}: minstens één eigen actie`, r.acties.length >= 1);
    const proef: V2Melding = { id: 's:x', dienst: 'site', ernst: 'info', titel: 'x', tijd: NU, gelezen: false };
    const dl = r.deeplink(proef);
    check(`register ${r.id}: deeplink naar eigen site`, /^(\/|https:\/\/([a-z0-9-]+\.)?tarasevych\.com\/)/.test(dl), dl);
    for (const a of r.acties) {
      check(`register ${r.id}/${a.soort}: label uk+nl`, cyr.test(a.label[0]) && !cyr.test(a.label[1]));
      if (a.gevaarlijk) check(`register ${r.id}/${a.soort}: gevaarlijke actie = alleen link naar bevestigingspagina`, typeof a.href === 'function');
    }
  }
  check('register eindigt met een vangnet «algemeen»', REGISTER[REGISTER.length - 1].id === 'algemeen' && REGISTER[REGISTER.length - 1].past({} as V2Melding));
  check('algemene acties: gelezen + later', ALGEMENE_ACTIES.map((a) => a.soort).join() === 'gelezen,later');

  // ---------------- 2. de drie kaarten uit de schermafbeeldingen
  const bericht = 'eigenaar@example.test відкликав право «Власник — з пристрою». Причина: «наданнно оновленні права розширені до 30 днів, Павлом». Якщо це несподівано — перегляньте зміну. / eigenaar@example.test heeft het recht «Власник — з пристрою» ingetrokken. Reden: «наданнно оновленні права розширені до 30 днів, Павлом». Onverwacht? Bekijk de wijziging.';
  const uk = taalDeel(bericht, 'uk'), nl = taalDeel(bericht, 'nl');
  check('taalDeel: tweetalige tekst met Oekraïense namen tussen «» wordt WEL gesplitst (uk)', uk.startsWith('eigenaar@example.test відкликав') && !uk.includes('ingetrokken'), uk);
  check('taalDeel: … en (nl)', nl.includes('ingetrokken') && !nl.includes('відкликав'), nl);
  check('taalDeel: pad met « / » blijft heel', taalDeel('Map / Documenten', 'uk') === 'Map / Documenten');
  const recht = vanServer({ id: 'r1', kind: 'security_warning', title: 'Право готувати оновлення відкликано', message: uk, createdAt: NU - 19 * 86400_000, link: 'https://id.tarasevych.com/methods?wijziging=abc' });
  const u1 = uitlegVoor(recht);
  check('kaart «Право … відкликано» → soort uitrol-recht-ingetrokken, risico hoog', u1.id === 'uitrol-recht-ingetrokken' && u1.risico === 'hoog', u1.id);
  check('… WIE = e-mail uit de tekst', wieVan(recht) === 'eigenaar@example.test');
  check('… WAT = «Власник — з пристрою»', objectVan(recht) === 'Власник — з пристрою');
  check('… WAAROM = reden uit de tekst', redenVan(recht) === 'наданнно оновленні права розширені до 30 днів, Павлом');
  check('… deeplink = de exacte wijziging', u1.deeplink(recht) === 'https://id.tarasevych.com/methods?wijziging=abc');
  check('… acties: wijziging bekijken + «це не я» (gevaarlijk) + wie heeft toegang', u1.acties.some((a) => a.soort === 'wijziging') && u1.acties.some((a) => a.soort === 'niet-ik' && a.gevaarlijk));
  check('… absolute tijd in Europe/Brussels', /2026/.test(absoluteTijd(recht.tijd, 'uk')));

  const ext = vanActiviteit({ id: 'audit:1', source: 'site', kind: 'site', type: 'owner.extensie.vernieuwing-geblokkeerd', subject: '', status: 'rejected', createdAt: NU - 2 * 86400_000, finishedAt: NU, doel: 'prive', eind: '2026-11-20T10:00:00.000Z' }, 'uk', false);
  check('kaart «extensie vernieuwing-geblokkeerd»: titel in het Oekraïens, geen Nederlandse code', cyr.test(ext.titel) && !/extensie|vernieuwing/i.test(ext.titel), ext.titel);
  check('… nl-titel zonder code', !/vernieuwing-geblokkeerd/.test(activityTitle({ id: 'a', source: 'site', kind: 'site', type: 'owner.extensie.vernieuwing-geblokkeerd', subject: '', status: 'rejected', createdAt: NU, finishedAt: NU }, 'nl')));
  check('… soort extensie, WAT = ruimte, einde bekend', uitlegVoor(ext).id === 'extensie' && ext.object === 'prive' && !!ext.eind);
  // INTEG-001 (eigenaar: «Не «інша дія»: кажи конкретно, яка і про що»): niet meer het kale «Дія на сайті», maar wel nog steeds nooit
  // de interne code als titel; de titel zegt dat er geen omschrijving is en waar de code staat.
  const onbekendTitel = activityTitle({ id: 'b', source: 'site', kind: 'site', type: 'owner.iets.nieuw_onbekend', subject: '', status: 'succeeded', createdAt: NU, finishedAt: NU }, 'uk');
  check('onbekende site-actie: nooit de interne code als titel, en niet het kale «Дія на сайті»', onbekendTitel !== 'Дія на сайті' && !/iets|nieuw|onbekend/i.test(onbekendTitel) && onbekendTitel.includes('Технічних подробицях'), onbekendTitel);

  const schrijf = vanActiviteit({ id: 'cmd:1', source: 'agent', kind: 'command', type: 'fs.write', subject: 'Pavlo-PC', status: 'failed', createdAt: NU - 3 * 86400_000, finishedAt: NU, doel: 'C:\\miy-prostir\\app\\x.ts', reden: 'PAD_NIET_TOEGESTAAN' }, 'uk', false);
  check('kaart «Запис файлу»: soort agent-bestand, WIE = apparaat, WAT = bestandspad', uitlegVoor(schrijf).id === 'agent-bestand' && /Pavlo-PC/.test(schrijf.wie || '') && schrijf.object === 'C:\\miy-prostir\\app\\x.ts', `${schrijf.wie} ${schrijf.object}`);

  // ---------------- 3. gelezen
  const tabA = mergeRead(['x1'], ['a']), tabB = mergeRead(tabA, ['b']);
  check('gelezen: tweede tabblad overschrijft het eerste niet (samenvoegen)', tabB.has('a') && tabB.has('b') && tabB.has('x1'));
  const veel = mergeRead(Array.from({ length: READ_MAX + 50 }, (_, i) => `o${i}`), ['nieuw']);
  check('gelezen: begrensd, nieuwste blijft', veel.size === READ_MAX && veel.has('nieuw') && !veel.has('o0'));
  const leden: V2Melding[] = [1, 2, 3].map((i) => ({ id: `a:${i}`, dienst: 'ai', ernst: 'fout', titel: 'Запис файлу', soort: 'command.fs.write', procesId: 'p1', tijd: NU - i * 1000, gelezen: false }));
  const g0 = groepeer(leden, legeRegels(), NU);
  check('groep ×3 telt als 1 ongelezen item', g0.length === 1 && g0[0].aantal === 3 && tellers(g0).ongelezen === 1);
  const gelezenIds = new Set<string>(); g0[0].leden.forEach((x) => gelezenIds.add(x.id)); // = markeerGroep: ALLE leden
  const g1 = groepeer(leden.map((x) => ({ ...x, gelezen: gelezenIds.has(x.id) })), legeRegels(), NU);
  check('groep ×3: na «gelezen» zijn alle onderliggende regels gelezen → 0 ongelezen', g1[0].ongelezen === 0 && tellers(g1).ongelezen === 0);
  check('server-ids: alleen geldige, begrensd', normaliseerIds(['ok:1', 'slecht id', 5, 'a'.repeat(200)]).join() === 'ok:1' && normaliseerIds(Array.from({ length: 900 }, (_, i) => `x${i}`)).length === GELEZEN_MAX);

  // ---------------- 4. bron: server levert de NIEUWSTE meldingen; gelezen op id
  const index = readFileSync('backend/index.ts', 'utf8');
  check('overzicht: site_notifications nieuwste eerst (niet langer de oudste 100)', /'site_notifications',\{filter:\{recipientUserId:user\.id\},limit:100,nieuwsteEerst:true\}/.test(index));
  check('e-mailmeldingen: nieuwste eerst', /recipientEmail:user\.email,\.\.\.filter\},nieuwsteEerst:true/.test(index));
  check('gelezen op id: opzoeken per id, al gelezen = ok, buiten de lade 404', /eigenMeldingOpId/.test(index) && /enkel===null\|\|!selected\.length\)\)return error\('OWNER_NOTIFICATION_NOT_FOUND'/.test(index) && /teSchrijven=selected\.filter\(item=>item\.read!==true\)/.test(index));
  check('routes gelezen-sync geregistreerd', /meldingGelezenRoutes\(/.test(index));
  const omlijsting = readFileSync('src/CanoniekOmlijsting.tsx', 'utf8');
  check('«alles gelezen»: één fout stopt de rest niet meer', /Promise\.allSettled\(open\.map/.test(omlijsting));
  const uitrol = readFileSync('backend/uitrol-goedkeuring.ts', 'utf8');
  check('nieuwe bronnen: recht gegeven, pakket wacht, pakket geweigerd, geïnstalleerd', /Право готувати оновлення надано/.test(uitrol) && /чекає схвалення \/ Update/.test(uitrol) && /відхилено перевіркою/.test(uitrol) && /встановлено \/ Update/.test(uitrol));

  // ---------------- 5. voet (bugfix) en grootte (vlag)
  const css = readFileSync('src/meldingen/v2/meldingen-v2.css', 'utf8');
  check('voet: globale footer-regel teruggezet (rij, geen marge, sticky)', /\.mv2>footer\.mv2-voet\{position:sticky;[^}]*flex-direction:row;[^}]*margin:0/.test(css));
  check('grootte: paneel schaalt mee met tekst, standaard groter op ≥1280', /--mv2-basis:1\.18/.test(css) && /width:min\(calc\(25rem \* var\(--mv2-f\)\)/.test(css));
  check('weergave: normalisatie', normaliseerWeergave({ tekst: 'XL', dichtheid: 'ruim' })?.tekst === 'XL' && normaliseerWeergave({ tekst: 'Z' })?.tekst === 'M' && normaliseerWeergave(null) === undefined);
  const r = normaliseerRegels({ ...legeRegels(), weergave: { tekst: 'L', dichtheid: 'compact' } }, NU);
  check('weergave blijft bewaard in de regels, ook na een regelwijziging', r.weergave?.tekst === 'L' && zetRegel(r, { dienst: 'post' }, 'stil', NU).weergave?.dichtheid === 'compact');

  // ---------------- 6. vlag en migraties
  const m190 = readFileSync('migrations/0190_melding_gelezen_rls.sql', 'utf8'), m191 = readFileSync('migrations/0191_meldingen_uitleg_v3_vlag.sql', 'utf8');
  check('0190: idempotent, RLS-groep voorkeuren', /NOT \('melding_gelezen_v1' = ANY\(tabellen\)\)/.test(m190));
  check('0191: vlag standaard UIT, idempotent', /'meldingen-uitleg-v3'[\s\S]*false, false\)\s*ON CONFLICT/.test(m191));
  check('vlag meldingen-uitleg-v3 heeft uitleg uk+nl', !!VLAG_UITLEG['meldingen-uitleg-v3'] && cyr.test(VLAG_UITLEG['meldingen-uitleg-v3'].naam[0]));
  check('geen Engels in nieuwe UI-teksten (register uk-kant)', REGISTER.every((x) => !/\b(the|and|click|open)\b/i.test(x.wat[0] + x.doen[0])));
  return einde();
}
