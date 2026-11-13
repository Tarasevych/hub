// SEC-002 g11 (12.11.2026): regressietests voor de aanvullende bevindingen zonder eigen bestandseigenaar.
//   aanv-gat-a-01  besluit over een toegangsverzoek: step-up, alleen pending, eigenaar/geblokkeerd beschermd, één winnaar
//   aanv-gat-c-01  zoeken in de post: lineaire adres-/domeinextractie, begrensde zoekvraag
//   aanv-gat-c-02  e-mailadrescontrole: lengte eerst, lineaire expressie (shared/adres-controle.ts)
//   aanv-gat-c-03  begrensd uitpakken van ZIP in stukken (zip-bom)
//   aanv-ronde1-06 Dropbox-padcontrole zonder geneste kwantoren
//   aanv-ronde1-07 notitieklad gebonden aan account + ruimte, verloopt, wisbaar bij afmelden
//   aanv-ronde1-08 overdragen van de technische hmara-lade: verplaatsen (ook grote bestanden en versies), alles of niets
// Регресійні тести для додаткових знахідок групи g11.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, stat, truncate } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { checker, nepGoogle } from './hulp/nep-google';

const ms = (f: () => unknown) => { const t0 = performance.now(); try { f(); } catch { /* alleen de tijd telt */ } return performance.now() - t0; };
const herhaal = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g11-20261112');
  // Eigen uploadmap: de test schrijft en verplaatst echte bestanden.
  const uploads = await mkdtemp(join(tmpdir(), 'mr-g11-uploads-'));
  process.env.UPLOADS_DIR = uploads;

  // ================================================================ aanv-gat-c-01: zoeken in de post
  {
    const { evaluateMailSearch, mailAdressenUitTekst, domeinenUitTekst } = await import('../../backend/mail-zoek-relevantie');
    const velden = (body: string) => [{ name: 'from', value: 'x@example.org', boost: 95 }, { name: 'subject', value: 'factuur', boost: 100 }, { name: 'body', value: body, boost: 55 }];
    const vijandig: Array<[string, string]> = [
      ['«aaaa…» 80 000', 'a'.repeat(80_000)],
      ['«a.a.…1» 80 001', herhaal('a.', 80_000) + '1'],
      ['«a@a.a.…» 80 002', 'a@' + herhaal('a.', 80_000)],
      ['200 000 tekens zonder spatie', herhaal('a.', 200_000)],
      ['korte reeksen van 254 tekens met @', herhaal('a@' + herhaal('a.', 251) + '1 ', 200_000)],
    ];
    for (const [naam, body] of vijandig) {
      const t = ms(() => evaluateMailSearch('factuur', velden(body)));
      check(`aanv-gat-c-01: evaluateMailSearch op ${naam} < 100 ms`, t < 100, `${t.toFixed(1)} ms`);
    }
    const groteVraag = 'a@' + '.'.repeat(1_000_000) + '@ ' + 'a'.repeat(1_000_000);
    const tv = ms(() => evaluateMailSearch(groteVraag, velden('gewone tekst')));
    check('aanv-gat-c-01: een zoekvraag van 2 MB wordt begrensd (< 100 ms)', tv < 100, `${tv.toFixed(1)} ms`);
    // Gedrag blijft: adressen en domeinen in gewone tekst worden gevonden, ook met leestekens eromheen.
    check('aanv-gat-c-01: adressen in gewone tekst blijven gevonden',
      JSON.stringify(mailAdressenUitTekst('mail john.doe@example.com, of <x@y.nl>. (info@firma.be)')) === JSON.stringify(['john.doe@example.com', 'x@y.nl', 'info@firma.be']));
    check('aanv-gat-c-01: domeinen in gewone tekst blijven gevonden',
      JSON.stringify(domeinenUitTekst('zie www.example.co.uk/pad en x@y.nl.')) === JSON.stringify(['www.example.co.uk', 'y.nl']));
    const m1 = evaluateMailSearch('john.doe@example.com', [{ name: 'body', value: 'Groet, john.doe@example.com', boost: 55 }]);
    const m2 = evaluateMailSearch('example.com', [{ name: 'from', value: 'Jan <jan@example.com>', boost: 95 }]);
    check('aanv-gat-c-01: zoeken op een volledig adres en op een domein blijft exact', m1?.tier === 'exact' && m2?.tier === 'exact', `${m1?.tier}/${m2?.tier}`);
    const zoekBron = readFileSync('backend/mail-zoek.ts', 'utf8');
    check('aanv-gat-c-01: search/advanced begrenst query en criteria en geeft de event-loop vrij',
      zoekBron.includes('query=fold(safe(body.query,400))') && zoekBron.includes('from=fold(safe(criteria.from,500))')
      && zoekBron.includes('setImmediate') && zoekBron.includes('ZOEK_BUDGET_MS') && !/match\(\/\[A-Z0-9\._%\+-\]\+@/.test(zoekBron));
  }

  // ================================================================ toets-g11 №1 (aanv-gat-c-01): ranking op «woordenruis» en de lus op tijd
  {
    const { evaluateMailSearch } = await import('../../backend/mail-zoek-relevantie');
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let zaad = 7; const rnd = () => (zaad = (zaad * 1103515245 + 12345) % 2147483648) / 2147483648;
    const woord = (n: number) => Array.from({ length: n }, () => letters[Math.floor(rnd() * 26)]).join('');
    const ruis = (max: number) => { let s = ''; while (s.length < max) s += woord(6 + Math.floor(rnd() * 4)) + ' '; return s.slice(0, max); };
    const b200 = ruis(200_000);
    const velden = (body: string) => [{ name: 'from', value: 'x@example.org', boost: 95 }, { name: 'subject', value: 'factuur', boost: 100 }, { name: 'body', value: body, boost: 55 }];
    const vragen: Array<[string, string]> = [['3 woorden', 'factuur betaling herinnering'], ['400 tekens', Array.from({ length: 60 }, () => woord(7)).join(' ').slice(0, 400)]];
    for (const [naam, q] of vragen) {
      let max = 0; for (let i = 0; i < 5; i += 1) { const t0 = performance.now(); evaluateMailSearch(q, velden(b200)); max = Math.max(max, performance.now() - t0); }
      check(`toets-g11 №1: evaluateMailSearch (${naam}) op 200 000 tekens woordenruis ≤ 60 ms per mail`, max <= 60, `${max.toFixed(1)} ms`);
    }
    const ver = `${b200.slice(0, 150_000)} zeldzaamwoord ${b200.slice(150_000)}`;
    const m = evaluateMailSearch('zeldzaamwoord', velden(ver));
    check('toets-g11 №1: een exact woord voorbij het rangvenster (20 000) wordt nog exact gevonden', m?.tier === 'exact', String(m?.tier));
    const typo = evaluateMailSearch('herinering', [{ name: 'body', value: 'een vriendelijke herinnering aan de factuur', boost: 55 }]);
    check('toets-g11 №1: gelijkenis (tikfout) werkt nog', typo?.tier === 'similar' && typo.matchedTerms.includes('herinnering'), JSON.stringify(typo?.matchedTerms));

    // De echte route: 200 mails × 80 000 tekens woordenruis; meet het langste synchrone stuk (vertraging van een 5 ms-tik).
    const { getPool } = await import('../../server/platform/pg');
    const { metVerzoek, zetGebruiker } = await import('../../server/platform/context');
    const { createMailAdvancedSearchRoutes } = await import('../../backend/mail-zoek');
    const sysPool = getPool('systeem');
    const uid = randomUUID(), acc = randomUUID();
    await sysPool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: `g11-zoek-${uid.slice(0, 8)}@example.test`, role: 'member', status: 'approved' }]);
    await sysPool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['mail_accounts_v1', acc, { ownerUserId: uid, provider: 'google', email: 'bus@example.test', status: 'connected', ruimte: 'prive' }]);
    for (let i = 0; i < 200; i += 20) {
      const rijen = Array.from({ length: 20 }, (_, k) => [randomUUID(), JSON.stringify({ ownerUserId: uid, ruimte: 'prive', source: 'provider', mailAccountId: acc, providerMessageId: `m${i + k}`, providerThreadId: `t${i + k}`, labelIds: ['INBOX'], senderName: 'Vreemde', senderEmail: 'spam@example.org', subject: `bericht ${i + k}`, receivedAt: Date.now() - (i + k) * 1000, body: ruis(80_000), unread: true, sizeBytes: 80_000, to: 'bus@example.test' })]);
      await sysPool.query(`INSERT INTO app.records (tbl,id,data) SELECT 'mail_items_v1', x.id, x.data::jsonb FROM jsonb_to_recordset($1::jsonb) AS x(id text, data text)`, [JSON.stringify(rijen.map(([id, data]) => ({ id, data })))]);
    }
    const routes = createMailAdvancedSearchRoutes(async () => ({ service: 'mail', user: { id: uid, status: 'approved' } }));
    let langste = 0, vorige = performance.now();
    const tik = setInterval(() => { const nu = performance.now(); langste = Math.max(langste, nu - vorige); vorige = nu; }, 5);
    const t0 = performance.now();
    const antw = await metVerzoek('POST /api/owner/mail/search/advanced', async () => {
      zetGebruiker(uid, 'mail');
      return routes['POST /api/owner/mail/search/advanced'][0]({ event: {}, body: { query: 'factuur betaling herinnering', accountEmails: ['bus@example.test'], criteria: {} }, params: {} } as never);
    }) as { statusCode?: number; body?: string };
    const totaal = performance.now() - t0;
    clearInterval(tik); langste = Math.max(langste, performance.now() - vorige);
    const data = JSON.parse(String(antw?.body || '{}'));
    check('toets-g11 №1: search/advanced over 200 mails × 80 000 tekens — geen synchroon stuk langer dan 200 ms',
      langste < 200 && Number(data?.facets?.indexedCount) === 200, `langste ${langste.toFixed(0)} ms, totaal ${totaal.toFixed(0)} ms, geïndexeerd ${data?.facets?.indexedCount}, status ${antw?.statusCode}`);
  }

  // ================================================================ aanv-gat-c-02: e-mailadrescontrole
  {
    const { isEmailAdres, isOntvangerAdres } = await import('../../shared/adres-controle');
    const { normalizeMailRecipients } = await import('../../backend/mail-opdrachten');
    const bom = 'a@' + '.'.repeat(200_000) + '@';
    const bomOntvanger = 'a@' + '.'.repeat(200_000) + '<';
    const bomLang = 'a@b' + 'b'.repeat(5_000_000) + '@';
    check('aanv-gat-c-02: isEmailAdres weigert «a@»+200 000 punten+«@» in < 5 ms', ms(() => isEmailAdres(bom)) < 5 && !isEmailAdres(bom));
    check('aanv-gat-c-02: isEmailAdres met grens 320 weigert 5 MB in < 5 ms', ms(() => isEmailAdres(bomLang, 320)) < 5);
    check('aanv-gat-c-02: ook zonder lengtegrens is de expressie lineair (200 000 tekens < 20 ms)',
      ms(() => isEmailAdres(bom, Number.MAX_SAFE_INTEGER)) < 20 && ms(() => isOntvangerAdres(bomOntvanger, Number.MAX_SAFE_INTEGER)) < 20);
    const tOntv = ms(() => normalizeMailRecipients([bomOntvanger]));
    let fout = ''; try { normalizeMailRecipients([bomOntvanger]); } catch (e) { fout = (e as Error).message; }
    check('aanv-gat-c-02: normalizeMailRecipients weigert een vijandig adres snel', tOntv < 5 && fout === 'MAIL_RECIPIENTS_INVALID', `${tOntv.toFixed(1)} ms ${fout}`);
    let fout2 = ''; try { normalizeMailRecipients('x@y.nl,' + 'a'.repeat(30_000)); } catch (e) { fout2 = (e as Error).message; }
    check('aanv-gat-c-02: een ontvangersveld boven 20 000 tekens wordt vóór het splitsen geweigerd', fout2 === 'MAIL_RECIPIENTS_INVALID');
    check('aanv-gat-c-02: gewone adressen blijven geldig',
      isEmailAdres('jan.de-vries+tag@sub.example.co.uk') && isOntvangerAdres('x@y.nl') && JSON.stringify(normalizeMailRecipients('A@B.nl; c@d.be')) === JSON.stringify(['a@b.nl', 'c@d.be']));
    check('aanv-gat-c-02: ongeldige vormen blijven ongeldig',
      !isEmailAdres('a@b') && !isEmailAdres('a b@c.nl') && !isEmailAdres('@c.nl') && !isEmailAdres('a@.nl') && !isOntvangerAdres('a<b@c.nl') );
    const verp = 'bounce-md_31050260.66a8c1b2.v1-0123456789abcdef0123456789abcdef-' + 'x'.repeat(8) + '@mandrillapp.com';
    check('toets-g11 №3: adressen met een lokaal deel van meer dan 64 tekens (VERP, meldingen) blijven geldig', verp.split('@')[0].length > 64 && isEmailAdres(verp, 320) && isOntvangerAdres(verp) && normalizeMailRecipients([verp]).length === 1, String(verp.split('@')[0].length));
    const oudRe = '/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/';
    const bronnen = ['backend/index.ts', 'backend/mail-weergave-voorkeuren.ts', 'backend/vlaggen.ts', 'backend/impersonatie.ts', 'backend/ondersteuning.ts', 'backend/tech-profiel.ts', 'backend/mail-opdrachten.ts'];
    const nogOud = bronnen.filter((f) => readFileSync(f, 'utf8').includes(oudRe) || readFileSync(f, 'utf8').includes('[^\\s<>@,;]+@[^\\s<>@,;]+\\.'));
    check('aanv-gat-c-02: geen enkele van de gemelde plaatsen gebruikt nog de kwadratische expressie', nogOud.length === 0, nogOud.join(', '));
    const idx = readFileSync('backend/index.ts', 'utf8');
    check('aanv-gat-c-02: share/email, share/link (nu mét grens 254) en mail/accounts/link gebruiken isEmailAdres',
      idx.includes('if (!isEmailAdres(email, 254)') && idx.includes("if (email && !isEmailAdres(email, 254)) return error('Valid email required', 400)") && idx.includes("if(!isEmailAdres(email,320))return error('MAIL_ACCOUNT_EMAIL_INVALID',400)"));
  }

  // ================================================================ aanv-gat-c-03: zip-bom
  {
    const fflate = await import('fflate');
    const { unzipMailPackageBounded } = await import('../../src/mail-begrensd-zip');
    const MiB = 1024 * 1024;
    const bom = fflate.zipSync({ 'word/document.xml': new Uint8Array(64 * MiB) }, { level: 9 });
    // Variant met een gelogen (0) originalSize in de lokale kop: dan helpt alleen het uitpakken in stukken.
    const gelogen = bom.slice();
    const dv = new DataView(gelogen.buffer, gelogen.byteOffset, gelogen.byteLength);
    dv.setUint32(22, 0, true);
    const opties = { maxEntries: 10, maxTotalBytes: 2 * MiB, maxEntryBytes: 1 * MiB, errorPrefix: 'PROEF' };
    for (const [naam, zip] of [['eerlijke kop', bom], ['originalSize 0 in de kop', gelogen]] as Array<[string, Uint8Array]>) {
      (globalThis as { gc?: () => void }).gc?.();
      const voor = process.memoryUsage().arrayBuffers;
      let piek = voor;
      const timer = setInterval(() => { piek = Math.max(piek, process.memoryUsage().arrayBuffers); }, 1);
      const t0 = performance.now();
      let fout = '';
      try { await unzipMailPackageBounded(zip, opties); } catch (e) { fout = (e as Error).message; }
      piek = Math.max(piek, process.memoryUsage().arrayBuffers);
      clearInterval(timer);
      const t = performance.now() - t0;
      check(`aanv-gat-c-03: zip-bom 64 MiB (${naam}) geweigerd vóór volledig uitpakken`, fout === 'PROEF_EXPANDED_LIMIT' && (piek - voor) < 40 * MiB && t < 400,
        `${fout} ${t.toFixed(0)} ms, piek +${((piek - voor) / MiB).toFixed(1)} MiB`);
    }
    const klein = fflate.zipSync({ 'a.txt': fflate.strToU8('hallo'), 'map/b.xml': fflate.strToU8('<x>' + 'y'.repeat(200_000) + '</x>') });
    const uit = await unzipMailPackageBounded(klein, { maxEntries: 10, maxTotalBytes: 4 * MiB, maxEntryBytes: 2 * MiB, errorPrefix: 'PROEF' });
    check('aanv-gat-c-03: een gewoon archief (meerdere stukken invoer) pakt nog correct uit',
      fflate.strFromU8(uit['a.txt']) === 'hallo' && uit['map/b.xml']?.length === 200_007);
  }

  // ================================================================ aanv-ronde1-06: Dropbox-paden
  {
    const { isDropboxPad, DropboxTransport } = await import('../../backend/cloud-overdracht-adapters');
    const { DropboxDirectory } = await import('../../backend/cloud-m8-directory');
    const vijand = '/' + 'a'.repeat(100) + '\\';
    const vijand2 = '/' + 'a/'.repeat(300) + '\\';
    check('aanv-ronde1-06: isDropboxPad weigert «/a×100\\» lineair (< 5 ms)', ms(() => isDropboxPad(vijand)) < 5 && !isDropboxPad(vijand) && !isDropboxPad(vijand2));
    check('aanv-ronde1-06: geldige paden en id: blijven geldig',
      isDropboxPad('/Documenten/Rapport 2026.pdf') && isDropboxPad('id:abcDEF_123-x') && isDropboxPad('/map/') && !isDropboxPad('/') && !isDropboxPad('/a/../b') && !isDropboxPad('rel/pad') && !isDropboxPad('/' + 'x/'.repeat(41)));
    const ctx = { userId: 'u1', space: 'prive', accountId: 'acc-1', provider: 'dropbox' } as never;
    let opgehaald = 0;
    const nepFetch = (async () => { opgehaald += 1; return new Response('{}', { status: 500 }); }) as typeof fetch;
    const dir = new DropboxDirectory(async () => 'tok', nepFetch);
    let code = ''; const t0 = performance.now();
    try { await dir.list(ctx, vijand, null); } catch (e) { code = (e as { code?: string }).code || ''; }
    const t1 = performance.now() - t0;
    const tr = new DropboxTransport(async () => 'tok', nepFetch);
    let code2 = ''; const t2s = performance.now();
    try { await tr.stat({ context: ctx, fileId: vijand }); } catch (e) { code2 = (e as { code?: string }).code || ''; }
    const t2 = performance.now() - t2s;
    check('aanv-ronde1-06: DropboxDirectory.list en DropboxTransport.stat weigeren het vijandige pad snel en zonder verzoek',
      code === 'CLOUD_M8_DROPBOX_FOLDER_INVALID' && code2 === 'CLOUD_DROPBOX_PATH_INVALID' && t1 < 50 && t2 < 50 && opgehaald === 0, `${code} ${t1.toFixed(1)} ms / ${code2} ${t2.toFixed(1)} ms`);
  }

  // ================================================================ aanv-ronde1-07: notitieklad
  {
    const g = globalThis as Record<string, unknown>;
    const maakOpslag = () => { const m = new Map<string, string>(); return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, _m: m }; };
    // Nagebootste browser met de echte canonieke runtime (public/canonical-service.js), zoals in agent-een-plek-20261020.test.ts.
    const voorG = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
    const u = new URL('https://hub.tarasevych.com/notes');
    const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ dataset: {}, style: {}, setAttribute: () => undefined, getAttribute: () => null }), documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
    g.document = doc;
    g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
    g.sessionStorage = maakOpslag(); g.localStorage = maakOpslag();
    g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
    g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
    runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
    const nc = await import('../../src/notities/notities-client');
    const o = maakOpslag();
    const A = { account: 'u-0000000a', ruimte: 'prive' as const };
    const B = { account: 'u-0000000b', ruimte: 'prive' as const };
    const AT = { account: 'u-0000000a', ruimte: 'technisch' as const };
    nc.kladBewarenVoor(A, 'nieuw', { titel: 'geheim', inhoud: 'wachtwoord van A' }, o);
    check('aanv-ronde1-07: het klad van account A wordt account B nooit aangeboden', nc.kladLezenVoor(B, 'nieuw', o) === null && nc.kladLezenVoor(A, 'nieuw', o)?.inhoud === 'wachtwoord van A');
    check('aanv-ronde1-07: ook de technische ruimte van dezelfde mens ziet het persoonlijke klad niet', nc.kladLezenVoor(AT, 'nieuw', o) === null);
    // Een waarde die onder B's sleutel staat maar van A zegt te zijn (gekopieerd/vervalst): niet aanbieden en weggooien.
    o.setItem(nc.kladSleutel(B, 'nieuw'), JSON.stringify({ titel: 't', inhoud: 'van A', op: new Date().toISOString(), account: A.account, ruimte: 'prive' }));
    check('aanv-ronde1-07: account en ruimte IN de waarde worden vergeleken', nc.kladLezenVoor(B, 'nieuw', o) === null && o.getItem(nc.kladSleutel(B, 'nieuw')) === null);
    check('aanv-ronde1-07: zonder account (afgemeld, «anon») of ruimte: niets lezen of schrijven', (() => { const p = maakOpslag(); nc.kladBewarenVoor(null, 'nieuw', { titel: 'x', inhoud: 'y' }, p); return p.length === 0 && nc.kladLezenVoor(null, 'nieuw', o) === null; })());
    const oud = Date.now() - nc.KLAD_MAX_LEEFTIJD - 60_000;
    nc.kladBewarenVoor(A, 'n-oud', { titel: 'oud', inhoud: 'oud' }, o, oud);
    o.setItem('mr-notitie-klad:nieuw', JSON.stringify({ titel: 'x', inhoud: 'ongebonden', op: new Date().toISOString() }));
    o.setItem('mr-notitie-klad:abc123', JSON.stringify({ titel: 'x', inhoud: 'ongebonden', op: new Date().toISOString() }));
    const gewist = nc.kladOpruimen(o);
    check('aanv-ronde1-07: opruimen wist verlopen kladden en de oude, niet-gebonden sleutels', gewist === 3 && o.getItem(nc.kladSleutel(A, 'n-oud')) === null && o.getItem('mr-notitie-klad:nieuw') === null && o.getItem(nc.kladSleutel(A, 'nieuw')) !== null);
    nc.kladBewarenVoor(B, 'x1', { titel: 'b', inhoud: 'van B' }, o);
    const n = nc.wisNotitieKladden('u-0000000a', o);
    check('aanv-ronde1-07: afmelden van A wist alleen de kladden van A', n === 1 && o.getItem(nc.kladSleutel(A, 'nieuw')) === null && nc.kladLezenVoor(B, 'x1', o)?.inhoud === 'van B');
    check('aanv-ronde1-07: «alle accounts afmelden» wist alles', nc.wisNotitieKladden(undefined, o) >= 1 && o.length === 0);
    check('aanv-ronde1-07: zonder bekend account in dit tabblad geeft kladScopeNu null', nc.kladScopeNu() === null);
    const bew = readFileSync('src/notities/NotitieBewerker.tsx', 'utf8');
    for (const [k, d] of voorG) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__;
    check('aanv-ronde1-07: de bewerker schrijft alleen in het account/de ruimte waarin hij opende', bew.includes('zelfdeScope(kladScope, kladScopeNu())') && !/kladBewaren\(id/.test(bew));
  }

  // ================================================================ aanv-ronde1-08: technische hmara-lade overdragen
  {
    const { getPool } = await import('../../server/platform/pg');
    const { storage, LEES_PLAFOND_BYTES } = await import('../../server/platform/opslag');
    const rca = await import('../../backend/ruimte-cloud-agenda');
    const pool = getPool('systeem');
    const van = randomUUID(), naar = randomUUID();
    const tech = { userId: van, ruimte: 'technisch' as const }, prive = { userId: naar, ruimte: 'prive' as const };
    const voorT = rca.cloudVoorvoegsel(tech), voorP = rca.cloudVoorvoegsel(prive);
    const schrijf = async (naam: string, inhoud: string) => { const p = `${voorT}/${randomBytes(6).toString('hex')}-${naam}`; const [ok] = await storage.write([{ path: p, content: inhoud, contentType: 'text/plain', ownerId: van }]); if (!ok) throw new Error('schrijven mislukt'); return p; };
    const huidig = await schrijf('rapport.txt', 'versie 3');
    const v1 = await schrijf('rapport-v1.txt', 'versie 1');
    const v2 = await schrijf('rapport-v2.txt', 'versie 2');
    const groot = await schrijf('film.bin', 'x');
    await truncate(join(uploads, groot), LEES_PLAFOND_BYTES + 64 * 1024 * 1024); // ijl bestand boven de leesgrens (geen echte schijfruimte)
    const item = async (pad: string, versies: string[]) => {
      const id = randomUUID();
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['cloud_items_v1', id, { ownerUserId: van, ruimte: 'technisch', kind: 'file', title: 't', storagePath: pad, versies: versies.map((p, i) => ({ pad: p, bytes: 8, sha256: String(i), op: new Date().toISOString() })) }]);
      return id;
    };
    const idA = await item(huidig, [v1, v2]);
    const idB = await item(groot, []);
    const lees = async (id: string) => (await pool.query("SELECT data FROM app.records WHERE tbl='cloud_items_v1' AND id=$1", [id])).rows[0]?.data as Record<string, any>;

    // Eerst «alles of niets»: een doel dat al bestaat laat de verplaatsing falen → alles terug, geen rij veranderd.
    const botsDoel = `${voorP}/${v2.split('/').pop()}`;
    await storage.write([{ path: botsDoel, content: 'van de eigenaar', contentType: 'text/plain', ownerId: naar }]);
    let fout = '';
    try { await rca.cloudLadeOverdragen(van, naar); } catch (e) { fout = (e as Error).message; }
    const naFout = await lees(idA);
    check('aanv-ronde1-08: één mislukte verplaatsing → fout, bestanden terug, geen enkele rij overgedragen',
      fout === 'CLOUD_LADE_BESTAND_OVERDRACHT_MISLUKT' && naFout.ownerUserId === van && naFout.storagePath === huidig
      && existsSync(join(uploads, huidig)) && existsSync(join(uploads, v1)) && existsSync(join(uploads, groot))
      && (await readFile(join(uploads, botsDoel), 'utf8')) === 'van de eigenaar', fout);
    await storage.delete([botsDoel]);

    // toets-g11 №2: een fout NA het verplaatsen (bijwerken van de tweede rij) → ROLLBACK, bestanden terug, rijen onveranderd.
    await pool.query(`CREATE OR REPLACE FUNCTION public.g11_toets_faal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${idB}' THEN RAISE EXCEPTION 'g11-toets: storing'; END IF; RETURN NEW; END $$`);
    await pool.query('DROP TRIGGER IF EXISTS g11_toets_faal ON app.records');
    await pool.query('CREATE TRIGGER g11_toets_faal BEFORE UPDATE ON app.records FOR EACH ROW EXECUTE FUNCTION public.g11_toets_faal()');
    let fout2 = '';
    try { await rca.cloudLadeOverdragen(van, naar); } catch (e) { fout2 = (e as Error).message; } finally {
      await pool.query('DROP TRIGGER IF EXISTS g11_toets_faal ON app.records');
      await pool.query('DROP FUNCTION IF EXISTS public.g11_toets_faal()');
    }
    const a2 = await lees(idA), b2 = await lees(idB);
    check('toets-g11 №2: fout bij het bijwerken van een rij → CLOUD_LADE_BESTAND_OVERDRACHT_MISLUKT, geen rij veranderd, alle bestanden terug',
      fout2 === 'CLOUD_LADE_BESTAND_OVERDRACHT_MISLUKT' && a2.ownerUserId === van && a2.ruimte === 'technisch' && a2.storagePath === huidig && a2.versies[0].pad === v1
      && b2.storagePath === groot && [huidig, v1, v2, groot].every((p) => existsSync(join(uploads, p))) && [huidig, v1, v2, groot].every((p) => !existsSync(join(uploads, `${voorP}/${p.split('/').pop()}`))), fout2);

    const regels = await rca.cloudLadeOverdragen(van, naar);
    const a = await lees(idA), b = await lees(idB);
    const nieuwPad = (p: string) => `${voorP}/${p.split('/').pop()}`;
    check('aanv-ronde1-08: het bestand boven de leesgrens is verplaatst (niet overgeslagen) en blijft even groot',
      b.storagePath === nieuwPad(groot) && !existsSync(join(uploads, groot)) && (await stat(join(uploads, nieuwPad(groot)))).size === LEES_PLAFOND_BYTES + 64 * 1024 * 1024);
    check('aanv-ronde1-08: huidige inhoud én alle versies staan in de lade van de nieuwe eigenaar; de rij wijst ernaar',
      a.storagePath === nieuwPad(huidig) && a.versies.map((v: { pad: string }) => v.pad).join('|') === [v1, v2].map(nieuwPad).join('|')
      && [huidig, v1, v2].every((p) => !existsSync(join(uploads, p)) && existsSync(join(uploads, nieuwPad(p)))));
    check('aanv-ronde1-08: de rijen horen nu bij de nieuwe eigenaar in zijn persoonlijke lade, met paden binnen die lade',
      a.ownerUserId === naar && a.ruimte === 'prive' && rca.padInLade(a.storagePath, prive) && a.versies.every((v: { pad: string }) => rca.padInLade(v.pad, prive)));
    const meta = (await pool.query('SELECT path, owner_id FROM app.storage_objects WHERE path = ANY($1::text[])', [[huidig, v1, nieuwPad(huidig), nieuwPad(v1)]])).rows as Array<{ path: string; owner_id: string }>;
    check('aanv-ronde1-08: de metadata (app.storage_objects) verhuist mee, met de nieuwe eigenaar',
      meta.length === 2 && meta.every((r) => r.path.startsWith(`${voorP}/`) && r.owner_id === naar));
    check('aanv-ronde1-08: het verslag telt 4 verplaatste bestanden', regels.some((r) => r.tabel === 'opslag/bestanden' && r.rijen === 4), JSON.stringify(regels.find((r) => r.tabel === 'opslag/bestanden')));
    const nogmaals = await rca.cloudLadeOverdragen(van, naar);
    check('aanv-ronde1-08: nogmaals overdragen is onschadelijk (niets meer te doen)', nogmaals.some((r) => r.tabel === 'opslag/bestanden' && r.rijen === 0));
  }

  // ================================================================ aanv-gat-a-01: besluit over een toegangsverzoek
  {
    const { agentRouteVerboden } = await import('../../backend/agent-namens');
    check('aanv-gat-a-01: agenten mogen access-requests nooit (ook niet namens de eigenaar)', agentRouteVerboden('POST /api/owner/admin/access-requests/abc') && agentRouteVerboden('POST /api/owner/admin/users/abc'));
    const { getPool, closePool } = await import('../../server/platform/pg');
    const T = Date.now().toString(36) + randomBytes(2).toString('hex');
    const eigenaarMail = `g11-eig-${T}@example.test`;
    const G = await nepGoogle({ ownerEmail: eigenaarMail });
    const pool = getPool();
    const rij = async (email: string) => (await pool.query("select id, data from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0];
    const verzoekVan = async (userId: string) => (await pool.query("select id, data from app.records where tbl='access_requests' and data->>'userId'=$1 order by seq desc limit 1", [userId])).rows[0];
    const nieuweAanvrager = async (naam: string) => {
      const mail = `g11-${naam}-${T}@example.test`;
      const b = G.browser();
      await b.aanmelden(`g11-${naam}-${T}`, mail, { intent: 'login' });
      await b.verzoek('hub.tarasevych.com', '/api/owner/access/request', b.ctxBody('hub'));
      const u = await rij(mail);
      return { mail, id: String(u.id), verzoek: String((await verzoekVan(String(u.id)))?.id || '') };
    };
    const oud = Math.floor(Date.now() / 1000) - 3600;
    const eOud = G.browser();
    await eOud.aanmelden(`g11-eig-${T}`, eigenaarMail, { intent: 'login', service: 'admin', authTime: oud });
    const eVers = G.browser();
    await eVers.aanmelden(`g11-eig-${T}`, eigenaarMail, { intent: 'login', service: 'admin' });
    const besluit = (b: typeof eOud, id: string, decision: string) => b.verzoek('admin.tarasevych.com', `/api/owner/admin/access-requests/${id}`, b.ctxBody('admin', { confirmation: 'ADMIN_POLICY_CHANGE', decision }));

    const y = await nieuweAanvrager('y');
    check('aanv-gat-a-01: voorbereiding — er is een open verzoek', Boolean(y.verzoek));
    const zonder = await besluit(eOud, y.verzoek, 'admin');
    const yNa = await rij(y.mail);
    check('aanv-gat-a-01: zonder verse bevestiging van de aanmelding: 403 STEP_UP_REQUIRED, rol en status onveranderd',
      zonder.status === 403 && /STEP_UP/.test(zonder.body) && yNa.data.role !== 'admin' && yNa.data.status === 'pending', `http=${zonder.status} rol=${yNa.data.role} status=${yNa.data.status}`);
    const met = await besluit(eVers, y.verzoek, 'member');
    const yMet = await rij(y.mail);
    check('aanv-gat-a-01: met verse bevestiging werkt het besluit (member, approved)', met.status === 200 && yMet.data.status === 'approved' && yMet.data.role === 'member', `http=${met.status} ${met.body.slice(0, 80)}`);
    const opnieuw = await besluit(eVers, y.verzoek, 'deny');
    const yOpnieuw = await rij(y.mail);
    check('aanv-gat-a-01: een al beslist verzoek opnieuw beslissen → 409 NOT_PENDING, status blijft approved',
      opnieuw.status === 409 && /NOT_PENDING/.test(opnieuw.body) && yOpnieuw.data.status === 'approved', `http=${opnieuw.status} status=${yOpnieuw.data.status}`);

    const z = await nieuweAanvrager('z');
    await pool.query("update app.records set data = data || '{\"status\":\"blocked\"}'::jsonb where tbl='users' and id=$1", [z.id]);
    const deblok = await besluit(eVers, z.verzoek, 'approve');
    const zNa = await rij(z.mail);
    check('aanv-gat-a-01: een geblokkeerd account deblokkeren via een open verzoek → 409, blijft geblokkeerd',
      deblok.status === 409 && /TARGET_LOCKED/.test(deblok.body) && zNa.data.status === 'blocked', `http=${deblok.status} status=${zNa.data.status}`);
    const auditRij = (await getPool('systeem').query("SELECT result FROM app.audit WHERE action = 'owner.admin.access-request.decided' AND details->>'targetRequestId' = $1 AND details->>'code' = 'ADMIN_ACCESS_REQUEST_TARGET_LOCKED'", [z.verzoek])).rows[0];
    check('toets-g11 №5: de weigering staat in het logboek (denied + code)', auditRij?.result === 'denied', JSON.stringify(auditRij));
    const sluit = await besluit(eVers, z.verzoek, 'deny');
    const zGesloten = await rij(z.mail);
    const zVerzoek = (await verzoekVan(z.id))?.data;
    check('toets-g11 №5: het verzoek van een geblokkeerd account kan met «weigeren» gesloten worden; het account blijft geblokkeerd',
      sluit.status === 200 && zVerzoek?.status === 'denied' && zGesloten.data.status === 'blocked', `http=${sluit.status} verzoek=${zVerzoek?.status} account=${zGesloten.data.status}`);

    // toets-g11 №5: faalt het bijwerken van het verzoek NA het account, dan geen half besluit: account en verzoek terug, opnieuw beslisbaar.
    const v = await nieuweAanvrager('v');
    const sp = getPool('systeem');
    await sp.query(`CREATE OR REPLACE FUNCTION public.g11_toets_verzoek() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tbl = 'access_requests' AND NEW.id = '${v.verzoek}' AND COALESCE(NEW.data->>'status','') <> 'pending' THEN RAISE EXCEPTION 'g11-toets: storing'; END IF; RETURN NEW; END $$`);
    await sp.query('DROP TRIGGER IF EXISTS g11_toets_verzoek ON app.records');
    await sp.query('CREATE TRIGGER g11_toets_verzoek BEFORE UPDATE ON app.records FOR EACH ROW EXECUTE FUNCTION public.g11_toets_verzoek()');
    let half: Awaited<ReturnType<typeof besluit>>;
    try { half = await besluit(eVers, v.verzoek, 'admin'); } finally {
      await sp.query('DROP TRIGGER IF EXISTS g11_toets_verzoek ON app.records');
      await sp.query('DROP FUNCTION IF EXISTS public.g11_toets_verzoek()');
    }
    const vNa = await rij(v.mail), vVerzoek = (await verzoekVan(v.id))?.data;
    check('toets-g11 №5: storing na het bijwerken van het account → 503, account niet admin, verzoek weer pending zonder in-beslagname',
      half.status === 503 && vNa.data.role !== 'admin' && vNa.data.status === 'pending' && vVerzoek?.status === 'pending' && !vVerzoek?.besluit?.genomen, `http=${half.status} rol=${vNa.data.role} status=${vNa.data.status} verzoek=${vVerzoek?.status} genomen=${vVerzoek?.besluit?.genomen}`);
    const daarna = await besluit(eVers, v.verzoek, 'viewer');
    check('toets-g11 №5: daarna is het verzoek gewoon opnieuw te beslissen', daarna.status === 200 && (await rij(v.mail)).data.role === 'viewer', `http=${daarna.status}`);

    const eig = await rij(eigenaarMail);
    const eigVerzoek = randomUUID();
    await getPool('systeem').query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['access_requests', eigVerzoek, { userId: String(eig.id), email: eigenaarMail, status: 'pending', requestedAt: Date.now() }]);
    const tegenEig = await besluit(eVers, eigVerzoek, 'deny');
    const eigNa = await rij(eigenaarMail);
    check('aanv-gat-a-01: het eigenaarsaccount is beschermd (400 OWNER_PROTECTED, rol owner blijft)',
      tegenEig.status === 400 && /OWNER_ACCOUNT_PROTECTED/.test(tegenEig.body) && eigNa.data.role === eig.data.role, `http=${tegenEig.status} rol=${eigNa.data.role}`);

    const w = await nieuweAanvrager('w');
    const [r1, r2] = await Promise.all([besluit(eVers, w.verzoek, 'viewer'), besluit(eVers, w.verzoek, 'admin')]);
    const wNa = await rij(w.mail);
    const statussen = [r1.status, r2.status].sort().join(',');
    check('aanv-gat-a-01: twee gelijktijdige besluiten — precies één wint, de ander krijgt 409',
      statussen === '200,409' && ['viewer', 'admin'].includes(wNa.data.role), `${statussen} rol=${wNa.data.role}`);

    G.herstel();
    await closePool();
  }

  return einde();
}
