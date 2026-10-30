// Eenheidstest 20.10.2026 — «de sessie valt weg bij het wisselen van tabblad» (klacht van de eigenaar).
//
// DEEL 1 (echte handler + echte database, nagebootste Google): een NIEUW tabblad bij een LEVENDE sessie.
//   Vroeger gaf ownerRequireSessionKern OWNER_TAB_SIGNED_OUT voor elk tabblad zonder eigen rij zodra een ander tabblad van
//   deze browser op een ander account stond. Een nieuw tabblad kreeg dan het aanmeldscherm terwijl de serversessie leefde.
//   Nu valt een onbekend tabblad terug op het ankeraccount van de browser en krijgt het daar zijn eigen rij.
// DEEL 2 (alleen de browserkant, nagebootste opslag): de hint over de sessie overleeft een nieuw tabblad, de keuze
//   «dit account bewaren» overleeft een nieuwe sessie en bepaalt de privécache, en afmelden van account A laat de hints en
//   de privécache van account B staan.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';

const ORIGIN = 'https://hub.tarasevych.com';
const opslag = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
/** Nagebootste Cache Storage: genoeg voor src/mail-bijlage-cache.ts (open/keys/put/match/delete). */
const nepCaches = () => {
  const bakken = new Map<string, Map<string, Response>>();
  const bak = (naam: string) => { if (!bakken.has(naam)) bakken.set(naam, new Map()); return bakken.get(naam)!; };
  return {
    bakken,
    api: {
      open: async (naam: string) => {
        const b = bak(naam);
        return {
          keys: async () => [...b.keys()].map(url => ({ url })),
          put: async (req: { url: string }, res: Response) => { b.set(req.url, res); },
          // Zoals een echte Cache Storage: elke match geeft een VERSE Response (een body is maar één keer te lezen).
          match: async (req: { url: string }) => b.get(req.url)?.clone(),
          delete: async (req: { url: string }) => b.delete(req.url)
        };
      },
      delete: async (naam: string) => bakken.delete(naam)
    }
  };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('sessie-tabbladen-20261020');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const google = await nepGoogle({ ownerEmail: `sessie-eigenaar-${T}@example.test` });
  const mailA = `sessie-a-${T}@example.test`, mailB = `sessie-b-${T}@example.test`;
  try {
    // ------------------------------------------------------------------ DEEL 1: server
    const b = google.browser();
    const tabA = randomBytes(24).toString('hex'), tabB = randomBytes(24).toString('hex'), tabC = randomBytes(24).toString('hex'), tabD = randomBytes(24).toString('hex');
    const wieIn = async (tabContext: string) => {
      const r = await b.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext });
      // De bootstrap geeft bij een levende sessie het account (geen veld `state`); «state: signed_out» is juist het aanmeldscherm.
      return { status: r.status, afgemeld: String(r.data.state || '') === 'signed_out', email: String(r.data.user?.email || ''), onthouden: r.data.sessionPolicy?.rememberedBrowser };
    };
    const aA = await b.aanmelden(`sub-a-${T}`, mailA, { tabContext: tabA, remember: true });
    const aB = await b.aanmelden(`sub-b-${T}`, mailB, { tabContext: tabB, remember: true });
    check('voorwaarde: twee accounts aangemeld in één browser (tabblad A = A, tabblad B = B)',
      aA.cb.data.ok === true && aB.cb.data.ok === true && (await wieIn(tabA)).email === mailA && (await wieIn(tabB)).email === mailB,
      `${aA.cb.data.reasonCode || 'ok'} / ${aB.cb.data.reasonCode || 'ok'}`);

    const nieuwTabblad = await wieIn(tabC);
    check('(A) nieuw tabblad bij levende sessie: GEEN aanmeldscherm, het ankeraccount van de browser',
      !nieuwTabblad.afgemeld && nieuwTabblad.email === mailA, `afgemeld=${nieuwTabblad.afgemeld} / ${nieuwTabblad.email || 'leeg'}`);
    check('(A) B-005 blijft: het nieuwe tabblad krijgt nooit het account van een ANDER tabblad',
      nieuwTabblad.email !== mailB, nieuwTabblad.email);
    const nogmaals = await wieIn(tabC);
    check('(A) het nieuwe tabblad houdt zijn account bij het volgende verzoek (eigen rij gebonden aan het anker)',
      !nogmaals.afgemeld && nogmaals.email === mailA, `afgemeld=${nogmaals.afgemeld} / ${nogmaals.email || 'leeg'}`);
    check('(A) tabblad B is door het nieuwe tabblad niet veranderd', (await wieIn(tabB)).email === mailB);

    const uit = await b.verzoek('hub.tarasevych.com', '/api/owner/session/logout-account-browser', { service: 'hub', tabContext: tabA });
    const naA = await wieIn(tabA), naC = await wieIn(tabC), naB = await wieIn(tabB);
    const lijst = (uit.data.accounts || []) as Array<{ user?: { email?: string } }>;
    check('(B) afmelden van A geldt in ALLE tabbladen van A (het eigen tabblad en het nieuwe tabblad)',
      uit.status === 200 && naA.afgemeld && naC.afgemeld && !naA.email && !naC.email, `${uit.status} ${naA.afgemeld}/${naC.afgemeld}`);
    check('(B) afmelden van A raakt account B NIET (sessie van B leeft verder in zijn tabblad)',
      !naB.afgemeld && naB.email === mailB && uit.data.otherAccountsPreserved === true, `afgemeld=${naB.afgemeld}/${naB.email || 'leeg'}, bewaard=${uit.data.otherAccountsPreserved}`);
    check('(B) de onthouden-hint van B blijft in de accountlijst staan na het afmelden van A',
      lijst.some(item => item.user?.email === mailB), lijst.map(item => item.user?.email || '?').join(','));
    const naLogoutNieuw = await wieIn(tabD);
    check('(B) een nieuw tabblad na het afmelden van A komt bij B (het nieuwe anker), niet op het aanmeldscherm',
      !naLogoutNieuw.afgemeld && naLogoutNieuw.email === mailB, `afgemeld=${naLogoutNieuw.afgemeld} / ${naLogoutNieuw.email || 'leeg'}`);
    check('(3) de server meldt «onthouden browser» voor een aanmelding met remember=true', naB.onthouden === true, String(naB.onthouden));

    // ------------------------------------------------------------------ DEEL 2: browserkant
    const g = globalThis as Record<string, unknown>;
    const u = new URL(`${ORIGIN}/overview`);
    const cachesNep = nepCaches();
    let sessie = opslag();
    const lokaal = opslag();
    g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: '', hash: '', protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
    g.localStorage = lokaal;
    g.sessionStorage = sessie;
    g.document = { cookie: '', hidden: false, title: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, head: { appendChild: () => undefined }, createElement: () => ({ rel: '', href: '', type: '', dataset: {}, setAttribute: () => undefined, getAttribute: () => null, getContext: () => null, toDataURL: () => 'data:,' }), documentElement: { dataset: {}, style: { setProperty: () => undefined }, classList: { add: () => undefined, remove: () => undefined, contains: () => false } } };
    g.window = Object.assign(g, { name: '', caches: cachesNep.api, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, setTimeout, clearTimeout, setInterval, clearInterval, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
    g.caches = cachesNep.api;
    /** Een NIEUW tabblad: window.name en sessionStorage zijn leeg, localStorage en de cookie blijven (zo werkt een browser). */
    const nieuwTabbladNaboosten = () => { (g as { name: string }).name = ''; sessie = opslag(); g.sessionStorage = sessie; (g.window as { name: string }).name = ''; };

    // public/canonical-service.js levert window.__TSV_CANONICAL_SERVICE__ (zoals in de browser, vóór de bundel).
    runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: g.document, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });

    const tc = await import('../../src/tab-context');
    const onthouden = await import('../../src/aanmelden-onthouden');
    const dvc = await import('../../src/domein-weergave-cache');
    const cache = await import('../../src/mail-bijlage-cache');

    tc.setEcosystemSessionLikely(true);
    check('(A) hint over de sessie staat na het aanmelden in dit tabblad', tc.ecosystemSessionHint() === 'known');
    nieuwTabbladNaboosten();
    check('(A) de hint overleeft het openen van een NIEUW tabblad (eerste beeld «aan het kijken», niet «meld u aan»)',
      tc.ecosystemSessionHint() === 'known', tc.ecosystemSessionHint());
    tc.setEcosystemSessionLikely(false);
    check('(A) afmelden in DIT tabblad zet alleen dit tabblad op «afgemeld»', tc.ecosystemSessionHint() === 'out');
    nieuwTabbladNaboosten();
    check('(B) het afmelden van één tabblad laat de hint van het apparaat staan (andere accounts blijven zichtbaar)',
      tc.ecosystemSessionHint() === 'known', tc.ecosystemSessionHint());
    tc.clearEcosystemDeviceSessionHint();
    nieuwTabbladNaboosten();
    check('(A) zonder enig account is er ook geen hint meer', tc.ecosystemSessionHint() === '');

    check('(3) standaard staat «dit account bewaren» aan', onthouden.leesAanmeldenOnthouden() === true);
    onthouden.zetAanmeldenOnthouden(false);
    nieuwTabbladNaboosten();
    check('(3) de keuze «niet bewaren» overleeft een nieuw tabblad EN een nieuwe sessie (per apparaat, niet per tabblad)',
      onthouden.leesAanmeldenOnthouden() === false);
    onthouden.zetAanmeldenOnthouden(true);
    check('(3) de keuze is weer te wijzigen', onthouden.leesAanmeldenOnthouden() === true);

    const sleutelA = dvc.rememberViewAccount('mail', `user-a-${T}`), sleutelB = dvc.rememberViewAccount('cloud', `user-b-${T}`);
    const voor = dvc.viewAccountForService('mail') === sleutelA && dvc.viewAccountForService('cloud') === sleutelB;
    dvc.forgetViewAccountEverywhere(`user-a-${T}`);
    check('(B) afmelden van A wist alleen de dienst→account-kaart van A; die van B blijft',
      voor && dvc.viewAccountForService('mail') === 'anon' && dvc.viewAccountForService('cloud') === sleutelB,
      `voor=${voor}, mail=${dvc.viewAccountForService('mail')}, cloud=${dvc.viewAccountForService('cloud')}`);

    const scopeA = cache.mailCacheScope(`owner-a-${T}`, 'acc-a'), scopeB = cache.mailCacheScope(`owner-b-${T}`, 'acc-b');
    await cache.setMailPrivateCacheRemembered(`owner-a-${T}`, false); // A: niet bewaren → wissen na afmelden
    await cache.setMailPrivateCacheRemembered(`owner-b-${T}`, true);  // B: bewaren
    await cache.writeMailSnooze(scopeA, 'bericht-a', 111);
    await cache.writeMailSnooze(scopeB, 'bericht-b', 222);
    const beideGeschreven = (await cache.readMailSnooze(scopeA, 'bericht-a')) === 111 && (await cache.readMailSnooze(scopeB, 'bericht-b')) === 222;
    check('(3) het beleid van de privécache volgt de keuze: «session» bij niet bewaren, «remembered» bij bewaren',
      lokaal.getItem(`tsv-mail-cache-policy-v1:owner-a-${T}`) === 'session' && lokaal.getItem(`tsv-mail-cache-policy-v1:owner-b-${T}`) === 'remembered',
      `${lokaal.getItem(`tsv-mail-cache-policy-v1:owner-a-${T}`)}/${lokaal.getItem(`tsv-mail-cache-policy-v1:owner-b-${T}`)}`);
    await cache.endMailPrivateCacheSession(`owner-a-${T}`);
    const naUit = await cache.readMailSnooze(scopeA, 'bericht-a'), bBlijft = await cache.readMailSnooze(scopeB, 'bericht-b');
    check('(3)+(B) afmelden van A wist de privécache van A (keuze «niet bewaren») en laat die van B volledig staan',
      beideGeschreven && naUit === 0 && bBlijft === 222, `geschreven=${beideGeschreven}, A=${naUit}, B=${bBlijft}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    google.herstel();
    const pool = getPool();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`sessie-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    await closePool();
  }
  return einde();
}
