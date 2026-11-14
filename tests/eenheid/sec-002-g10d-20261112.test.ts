// SEC-002 · groep g10d (12.11.2026): regressietests voor
//   extensie-01         één WS-bericht van een gekoppelde agent liet het serverproces vallen (gesloten door g10a/http-rand-03; hier de
//                       aanvullende varianten: capabilities met U+0000 in het auth-bericht, vangnet van het proces)
//   http-rand-04        procent-codering omzeilde de poort van /assets/tech/* en het verbod op *.map, verborgen bestanden en mappen
//   wolk-03             de achtergrondwerker van de overdrachten erfde voorgoed de context van wie de route het eerst opende
//   ai-mcp-06           technisch agenttoken tvh_ werkte op /api/mcp/agent zonder levende controle (profiel, dienst «ai»)
//   wolk-02 / privacy-logboek-04  fotodienst: onbegrensde uploadsessies in /tmp, race op «stuk», heel bestand in het geheugen bij «klaar»
//   wolk-04             eigen opslag: schijfcontrole telde open sessies niet mee; geen bodem bij «stuk»; opruimen zag maar 200 mappen
//   wolk-05             vlag cloud-vnext verborg alleen de interface
//   wolk-06             download overschreef het hele record met een oud beeld (prullenbak, hernoemen, nieuwe versie gingen verloren)
//   wolk-09             actieve MIME-typen: XML-familie, Drive→eigen zonder keuring, «SVG» in hoofdletters bij foto's
//   wolk-10             ruwe interne foutteksten (paden, PostgreSQL) in antwoorden van cloud vNext
//   post-08             Authentication-Results: commentaar/aanhalingstekens niet ontleed; bovenste regel zonder bewijs van Gmail-ontvangst
//   aanv-ronde1-05      «Упорядкувати» (foto): alle paren O(n²) met regex per paar — 6000 foto's hielden het proces ~20 s bezig
//   aanv-ronde1-09      opruimen van uploadsessies (cloud vNext) wiste een sessie die een parallel «begin» net aanmaakte
// Alle «geheimen» hieronder zijn verzonnen proefwaarden. Eén blok draaien: G10D_ALLEEN=wolk-06,post-08 node scripts/eenheidstests.mjs …
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { db, storage } from '../../server/platform';
import * as context from '../../server/platform/context';
import * as afz from '../../shared/mail-afzenders';
import * as vnextModel from '../../shared/cloud-vnext-model';
import * as fotoModel from '../../shared/foto-model';
import * as bestandenMod from '../../backend/cloud-vnext-bestanden';
import * as takenMod from '../../backend/cloud-vnext-taken';
import * as integratiesMod from '../../backend/cloud-vnext-integraties';
import * as fotoMod from '../../backend/foto-dienst';
import { cloudVoorvoegsel, huidigeLadeContext, metLade } from '../../backend/ruimte-cloud-agenda';
import type { Lade } from '../../shared/ruimte-scheiding';

const lees = (p: string) => readFileSync(resolve(p), 'utf8');
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const wacht = async (f: () => boolean | Promise<boolean>, ms = 5000) => { const tot = Date.now() + ms; while (Date.now() < tot) { if (await f()) return true; await new Promise((r) => setTimeout(r, 40)); } return !!(await f()); };
const MiB = 1024 * 1024;
type Antw = { status: number; uit: Record<string, any>; rauw: string };
type RouteMap = Record<string, unknown[]>;

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10d-20261112');
  const alleen = String(process.env.G10D_ALLEEN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const blok = async (id: string, fn: () => Promise<void>) => {
    if (alleen.length && !alleen.includes(id)) return;
    try { await fn(); } catch (e) { check(`${id}: onverwachte fout in het testblok`, false, String((e as Error)?.stack || e).slice(0, 600)); }
  };

  const uploads = mkdtempSync(join(tmpdir(), 'sec002-g10d-'));
  const vorigeUploads = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = uploads;
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const gebruikers: string[] = [];
  const mk = async (naam: string, rol = 'member') => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email: `${naam}-${sfx}@eenheid.test`, role: rol, status: 'approved' }]); gebruikers.push(id); return id; };
  const merk = new AsyncLocalStorage<string>(); // «dit is een aanroep vanuit de test zelf» (om de achtergrondwerker te herkennen)
  const roep = async (routes: RouteMap, pad: string, body: Record<string, unknown>, lade: Lade): Promise<Antw> => {
    const res = await merk.run('route', () => metLade(lade, 'cloud', async () => (routes[pad][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} })));
    let uit: Record<string, any> = {}; try { uit = JSON.parse(res.body); } catch { uit = {}; }
    return { status: res.statusCode, uit, rauw: String(res.body) };
  };
  const V = (pad: string) => `POST /api/owner/cloud/vnext/${pad}`;
  const F = (pad: string) => `POST /api/owner/foto/${pad}`;
  const sessieVan = (id: string, rol = 'member', status = 'approved') => async () => ({ user: { id, role: rol, status }, service: 'cloud' });
  const bestandenRoutes = (id: string, opties?: unknown, rol = 'member') => (bestandenMod.cloudVnextBestandenRoutes as any)(sessieVan(id, rol), opties) as RouteMap;
  const takenRoutes = (id: string, opties?: unknown) => (takenMod.cloudVnextTakenRoutes as any)(sessieVan(id), opties) as RouteMap;
  const takenProef = (takenMod as any).cloudVnextTakenProef;
  const vnextProef = (bestandenMod as any).cloudVnextProef;
  const fotoProef = (fotoMod as any).fotoProef;
  takenProef.zetKlok(false);
  const echteFetch = globalThis.fetch;
  /** Volledige upload via de echte route (begin → stukken → klaar). */
  const upload = async (routes: RouteMap, lade: Lade, naam: string, mime: string, inhoud: Buffer, mapId: string | null = null): Promise<Antw> => {
    const begin = await roep(routes, V('upload'), { actie: 'begin', naam, mime, bytes: inhoud.length, mapId }, lade);
    if (begin.status !== 200) return begin;
    const stuk = vnextModel.CLOUD_VNEXT_LIMIETEN.stukMaxBytes;
    for (let o = 0; o < inhoud.length; o += stuk) {
      const st = await roep(routes, V('upload'), { actie: 'stuk', id: begin.uit.id, offset: o, data: inhoud.subarray(o, o + stuk).toString('base64') }, lade);
      if (st.status !== 200) return st;
    }
    return roep(routes, V('upload'), { actie: 'klaar', id: begin.uit.id, sha256: sha(inhoud) }, lade);
  };

  try {
    // ================================================================================================ post-08
    await blok('post-08', async () => {
      const P = (afz as any).parseAuthResults as (k: string[]) => any;
      const klas = (auth: unknown) => (afz as any).classificeer({ naam: 'PayPal', adres: 'service@paypal.com', domein: 'paypal.com', auth });
      const echt = 'mx.google.com; dkim=pass header.i=@paypal.com header.s=pp-dkim1 header.b=AbCd12Ef; spf=pass (google.com: domain of service@paypal.com designates 173.0.84.226 as permitted sender) smtp.mailfrom=service@paypal.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=paypal.com';
      const a0 = P([echt]);
      check('post-08: een gewone regel van Gmail wordt nog precies zo gelezen (dkim/spf/dmarc pass, domeinen, «geverifieerd»)',
        a0.betrouwbaar === true && a0.dmarc === 'pass' && a0.dmarcDomein === 'paypal.com' && a0.spf === 'pass' && a0.spfDomein === 'paypal.com'
        && a0.dkim.length === 1 && a0.dkim[0].uitslag === 'pass' && a0.dkim[0].domein === 'paypal.com' && klas(a0).status === 'geverifieerd', JSON.stringify(a0));
      // De kern van de vondst: het MAIL FROM-adres (door de afzender gekozen) staat in het SPF-commentaar én in smtp.mailfrom.
      const inj = 'mx.google.com; spf=pass (google.com: domain of "a; dmarc=pass header.from=paypal.com; x"@evil.example designates 203.0.113.9 as permitted sender) smtp.mailfrom="a; dmarc=pass header.from=paypal.com; x"@evil.example; dmarc=fail (p=REJECT sp=REJECT dis=NONE) header.from=paypal.com';
      const a1 = P([inj]);
      check('post-08: «dmarc=pass» verstopt in het SPF-commentaar/aangehaalde MAIL FROM wint NIET van de echte dmarc=fail', a1.dmarc === 'fail' && klas(a1).status === 'verdacht' && klas(a1).reden === 'DMARC_MISLUKT', `${a1.dmarc}/${a1.dmarcDomein}/${klas(a1).status}`);
      // Variant: het aangehaalde deel sluit het commentaar voortijdig («)») en er is géén echte dmarc-uitslag.
      const inj2 = 'mx.google.com; spf=pass (google.com: domain of "a) ; dmarc=pass header.from=paypal.com; iprev=pass ("@evil.example designates 203.0.113.9 as permitted sender) smtp.mailfrom="a) ; dmarc=pass header.from=paypal.com; iprev=pass ("@evil.example';
      const a2 = P([inj2]);
      check('post-08: commentaar voortijdig gesloten met «)» in een aangehaald adres → geen enkele «pass» telt', a2.dmarc !== 'pass' && klas(a2).status !== 'geverifieerd', `${a2.dmarc}/${klas(a2).status}`);
      const genest = 'mx.google.com; dkim=fail (bad signature (zie; dmarc=pass header.from=paypal.com) einde) header.i=@evil.example; dmarc=fail (p=REJECT) header.from=paypal.com';
      const a3 = P([genest]);
      check('post-08: genest commentaar met «;» erin wordt als één commentaar overgeslagen', a3.dmarc === 'fail' && a3.dkim.length === 1 && a3.dkim[0].uitslag === 'fail' && a3.dkim[0].domein === 'evil.example', JSON.stringify(a3));
      const dubbel = P(['mx.google.com; dmarc=pass header.from=paypal.com; dmarc=fail (p=REJECT) header.from=paypal.com']);
      check('post-08: twee dmarc-uitslagen in één regel → de «pass» telt niet, de «fail» wel', dubbel.dmarc === 'fail' && klas(dubbel).status === 'verdacht', JSON.stringify(dubbel));
      const dkimVals = P(['mx.google.com; dkim=pass header.i=@paypal.com; spf=pass smtp.mailfrom="x y"@evil.example']);
      check('post-08: aanhalingstekens in de regel → ook een dkim=pass telt niet meer als bewijs', (afz as any).authGeslaagdVoor(dkimVals, 'paypal.com') === false && klas(dkimVals).status !== 'geverifieerd', JSON.stringify(dkimVals));
      const rommel = P(['mx.google.com; dmarc=pass header.from=paypal.com@evil.example']);
      check('post-08: header.from moet een kaal domein zijn tot het einde van het woord', rommel.dmarcDomein !== 'paypal.com' && klas(rommel).status !== 'geverifieerd', JSON.stringify(rommel));
      const mailfrom = P(['mx.google.com; spf=pass (google.com: domain of bounce+x=y@mail.paypal.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce+x=y@mail.paypal.com; dmarc=pass (p=REJECT) header.from=paypal.com']);
      check('post-08: een gewoon VERP-adres in smtp.mailfrom blijft leesbaar', mailfrom.spfDomein === 'mail.paypal.com' && mailfrom.dmarc === 'pass', JSON.stringify(mailfrom));
      check('post-08: een onbekende authserv-id blijft onbetrouwbaar', P(['evil.example; dmarc=pass header.from=paypal.com']).betrouwbaar === false);

      // Tweede deel: zonder bewijs dat Gmail het bericht zelf via SMTP aannam is de bovenste regel van de afzender.
      const W = (afz as any).gmailOntvangstWeerlegd as ((k: Array<{ name: string; value: string }>) => boolean) | undefined;
      check('post-08: gmailOntvangstWeerlegd bestaat', typeof W === 'function');
      if (typeof W === 'function') {
        const k = (name: string, value: string) => ({ name, value });
        const gewoon = [k('Received', 'by 2002:a05:6402:1234:b0:5c5:c0de:feed with SMTP id x1csp123456edb; Thu, 12 Nov 2026 10:00:00 -0800 (PST)'), k('Received', 'from mta.paypal.com (mta.paypal.com. [173.0.84.226]) by mx.google.com with ESMTPS id abc123 for <ik@example.invalid>'), k('Authentication-Results', echt), k('Received', 'from intern by mta.paypal.com'), k('From', 'PayPal <service@paypal.com>')];
        const pop3 = [k('Received', 'by 2002:a05:6402:1234:b0:5c5:c0de:feed with POP3 id x1csp99; Thu, 12 Nov 2026 10:00:00 -0800 (PST)'), k('X-Gmail-Fetch-Info', 'oud@isp.example 1 pop.isp.example 995 oud'), k('Received', 'from x by mx.google.com with ESMTPS id vals'), k('Authentication-Results', echt), k('From', 'PayPal <service@paypal.com>')];
        const import_ = [k('Authentication-Results', echt), k('Received', 'from a.example by b.example with ESMTP'), k('From', 'PayPal <service@paypal.com>')];
        const zonderReceived = [k('Authentication-Results', echt), k('From', 'PayPal <service@paypal.com>')];
        check('post-08: gewone Gmail-ontvangst (Received … by mx.google.com with ESMTPS) → niet weerlegd', W(gewoon) === false);
        check('post-08: POP3-verzamelaar (X-Gmail-Fetch-Info / «with POP3») → weerlegd, ook met een nagemaakte Received-regel', W(pop3) === true);
        check('post-08: import/migratie (geen enkele Received … by mx.google.com) → weerlegd', W(import_) === true && W(zonderReceived) === true);
      }
      const b1 = lees('backend/mail-afzenders.ts'), b2 = lees('backend/mail-afzender-bronnen.ts');
      check('post-08 (bron): beide Gmail-lezers vragen de Received-koppen op en laten Authentication-Results vallen als de ontvangst weerlegd is',
        [b1, b2].every((s) => /'Received'/.test(s) && /'X-Gmail-Fetch-Info'/.test(s) && /gmailOntvangstWeerlegd\(h\) \? \[\] : van\('Authentication-Results'\)/.test(s)));
    });

    // ================================================================================================ wolk-09 (puur)
    await blok('wolk-09', async () => {
      const toegestaan = ((vnextModel as any).mimeToegestaan ?? (bestandenMod as any).mimeToegestaan) as (m: string) => boolean;
      const veilig = (vnextModel as any).veiligeMime as ((m: unknown) => string) | undefined;
      const actief = ['application/x-shockwave-flash', 'text/vbscript', 'application/x-httpd-php5', 'application/x-httpd-php', 'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/hta'];
      const door = actief.filter((m) => toegestaan(m));
      check('wolk-09: uitvoerbare/actieve typen (flash, vbscript, x-httpd-*, html, xhtml, svg, javascript) worden geweigerd', door.length === 0, door.join(' '));
      check('wolk-09: veiligeMime bestaat (één keuring voor alles wat de eigen opslag in- en uitgaat)', typeof veilig === 'function');
      if (typeof veilig === 'function') {
        const xml = ['application/xml', 'TEXT/XML; charset=utf-8', 'application/xslt+xml', 'application/rdf+xml', 'text/xsl', 'application/atom+xml'];
        check('wolk-09: de XML-familie verlaat de opslag als text/plain (nooit als document dat scripts kan dragen)', xml.every((m) => veilig(m) === 'text/plain'), xml.map((m) => veilig(m)).join(' '));
        check('wolk-09: html/svg/xhtml/javascript worden bij het uitgaan application/octet-stream; kapotte of lege typen ook',
          ['text/html', 'IMAGE/SVG+XML', 'application/xhtml+xml', 'text/javascript', '', 'geen-mime', 'a/b c'].every((m) => veilig(m) === 'application/octet-stream'));
        check('wolk-09: gewone typen blijven wat ze zijn', veilig('image/png') === 'image/png' && veilig('Application/PDF; x=1') === 'application/pdf' && veilig('text/plain') === 'text/plain' && veilig('application/vnd.openxmlformats-officedocument.wordprocessingml.document') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
      const mv = (fotoModel as any).mimeVoor as (n: string, m?: string) => string;
      check('wolk-09: foto — «image/SVG+xml» (hoofdletters) komt er niet meer door', mv('x.jpg', 'image/SVG+xml') === 'image/jpeg' && mv('x.svg', 'IMAGE/SVG+XML') === 'application/octet-stream' && mv('x.bin', 'Image/Svg+Xml; a=b') === 'application/octet-stream', `${mv('x.jpg', 'image/SVG+xml')} ${mv('x.svg', 'IMAGE/SVG+XML')}`);
      check('wolk-09: foto — gewone typen ongewijzigd (ook met hoofdletters en parameters)', mv('x.jpg', 'Image/PNG') === 'image/png' && mv('x.mp4', 'video/mp4; codecs=avc1') === 'video/mp4' && mv('x.heic') === 'image/heic');

      // Met de echte opslag: upload van XML, een oud record met text/html, en Drive→eigen met text/html van Google.
      const u = await mk('mime');
      const lade: Lade = { userId: u, ruimte: 'prive' };
      const r = bestandenRoutes(u);
      const xmlUp = await upload(r, lade, 'kaart.xml', 'application/xml', Buffer.from('<?xml version="1.0"?><a/>'));
      const xmlDl = xmlUp.status === 200 ? await roep(r, V('download'), { id: xmlUp.uit.bestand.id }, lade) : null;
      check('wolk-09: een .xml uploaden kan nog, maar het bewaarde en teruggegeven type is text/plain', xmlUp.status === 200 && xmlUp.uit.bestand.mime === 'text/plain' && xmlDl?.uit.mime === 'text/plain', `${xmlUp.status} ${xmlUp.uit.bestand?.mime} ${xmlDl?.uit.mime}`);
      check('wolk-09: flash uploaden → MIME_NIET_TOEGESTAAN', (await roep(r, V('upload'), { actie: 'begin', naam: 'x.swf', mime: 'application/x-shockwave-flash', bytes: 4 }, lade)).uit.error === 'MIME_NIET_TOEGESTAAN');
      // Oud record (van vóór de keuring, of door een andere weg geschreven) met een actief type.
      const pad = `${cloudVoorvoegsel(lade)}/${Date.now()}-oud.html`;
      await storage.write([{ path: pad, content: Buffer.from('<script>1</script>').toString('base64'), contentType: 'application/octet-stream', ownerId: u }]);
      const [oudId] = await db.add('cloud_items_v1', [{ ownerUserId: u, ruimte: 'prive', kind: 'file', title: 'oud.html', originalName: 'oud.html', mimeType: 'text/html', sizeBytes: 18, storagePath: pad, createdAt: Date.now(), updatedAt: Date.now() }]);
      const oudDl = await roep(r, V('download'), { id: oudId }, lade);
      const oudLijst = await roep(r, V('bestanden'), { id: oudId }, lade);
      check('wolk-09: een bestaand record met text/html gaat de deur uit als application/octet-stream (download én lijst)', oudDl.uit.mime === 'application/octet-stream' && oudLijst.uit.bestanden?.[0]?.mime === 'application/octet-stream', `${oudDl.uit.mime} ${oudLijst.uit.bestanden?.[0]?.mime}`);
      // Drive → eigen: Google meldt text/html; het record in de eigen opslag mag dat type niet dragen.
      const t = takenRoutes(u);
      takenProef.zetDriveToegang(async () => ({ token: 'proef-token', accountId: 'acc-1', email: 'x@example.invalid' }));
      takenProef.zetVrijeBytes(async () => null);
      globalThis.fetch = (async (url: unknown) => {
        const s = String(url);
        if (s.includes('alt=media')) return new Response(Buffer.from('<html><script>alert(1)</script></html>'));
        return new Response(JSON.stringify({ id: 'df-html', name: 'gedeeld.html', size: '38', mimeType: 'text/html' }), { headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      try {
        const nieuw = await roep(t, V('taken'), { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: 'acc-1', id: 'df-html' }, doel: { dienst: 'eigen' } }, lade);
        await takenProef.tikProef();
        const rij = (await pool.query(`SELECT data FROM app.records WHERE tbl='cloud_items_v1' AND data->>'ownerUserId' = $1 AND data->>'bron' = 'google-drive'`, [u])).rows[0]?.data;
        const meta = rij?.storagePath ? (await pool.query('SELECT content_type FROM app.storage_objects WHERE path = $1', [rij.storagePath]).catch(() => ({ rows: [] }))).rows[0] : null;
        check('wolk-09: Drive→eigen met text/html van Google → het eigen record krijgt application/octet-stream (ook in de opslagmetadata)', nieuw.status === 200 && !!rij && rij.mimeType === 'application/octet-stream' && (!meta || meta.content_type === 'application/octet-stream'), `${nieuw.status} ${rij?.mimeType} ${meta?.content_type}`);
      } finally { globalThis.fetch = echteFetch; }
    });

    // ================================================================================================ http-rand-04
    await blok('http-rand-04', async () => {
      const dist = mkdtempSync(join(tmpdir(), 'sec002-g10d-dist-'));
      mkdirSync(join(dist, 'assets', 'tech'), { recursive: true });
      mkdirSync(join(dist, '.vite'), { recursive: true });
      mkdirSync(join(dist, '.git'), { recursive: true });
      writeFileSync(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
      writeFileSync(join(dist, 'assets', 'app-123.js'), 'console.log(1)');
      writeFileSync(join(dist, 'assets', 'tech', 'BeheerGeheim-abc123.js'), 'export const TECH = "alleen-voor-technisch-profiel";');
      writeFileSync(join(dist, 'assets', 'index-abc.js.map'), '{"version":3,"sources":["src/geheim.ts"]}');
      writeFileSync(join(dist, '.vite', 'manifest.json'), '{"verborgen":true}');
      writeFileSync(join(dist, '.git', 'config'), '[core]');
      writeFileSync(join(dist, '.env'), 'PROEF=1');
      writeFileSync(join(dist, 'l002-diagnostic.json'), '{"audit":true}');
      const vorigeDist = process.env.DIST_DIR; process.env.DIST_DIR = dist;
      const { createServer } = await import('../../server/start');
      const server = createServer();
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      const poort = (server.address() as { port: number }).port;
      const vraag = (pad: string): Promise<{ status: number; body: string; cache: string }> => new Promise((ok, mis) => {
        const req = http.request({ host: '127.0.0.1', port: poort, path: pad, method: 'GET', headers: { host: 'hub.tarasevych.com', 'cf-connecting-ip': `198.18.77.${Math.floor(Math.random() * 200) + 1}` } }, (res) => {
          let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => ok({ status: res.statusCode || 0, body: b, cache: String(res.headers['cache-control'] || '') }));
        });
        req.on('error', mis); req.end();
      });
      try {
        const gewoon = await vraag('/assets/app-123.js'); const spa = await vraag('/inbox'); const wortel = await vraag('/');
        check('http-rand-04: gewone bestanden en de SPA werken nog (/assets/* onveranderlijk gecachet, /inbox → index.html)', gewoon.status === 200 && /immutable/.test(gewoon.cache) && spa.status === 200 && spa.body.includes('spa') && wortel.status === 200, `${gewoon.status} ${gewoon.cache} ${spa.status} ${wortel.status}`);
        const techPaden = ['/assets/tech/BeheerGeheim-abc123.js', '/assets/%74ech/BeheerGeheim-abc123.js', '/assets%2Ftech/BeheerGeheim-abc123.js', '/assets/./tech/BeheerGeheim-abc123.js', '/assets/x/..%2Ftech/BeheerGeheim-abc123.js', '/assets/tech/%42eheerGeheim-abc123.js', '/%61ssets/tech/BeheerGeheim-abc123.js', '//assets/tech/BeheerGeheim-abc123.js'];
        const techUit = await Promise.all(techPaden.map(vraag));
        const lek = techPaden.filter((_, i) => techUit[i].status === 200 || techUit[i].body.includes('alleen-voor-technisch-profiel') || /public|immutable/.test(techUit[i].cache));
        check(`http-rand-04: technische bundel zonder toegangscookie → nooit de inhoud, nooit «public/immutable», in alle ${techPaden.length} schrijfwijzen (ook %74ech en %2F)`, lek.length === 0, lek.join(' | '));
        const verborgen = ['/assets/index-abc.js.map', '/assets/index-abc.js%2Emap', '/assets/index-abc.js.ma%70', '/assets/index-abc.js.MAP', '/.vite/manifest.json', '/%2Evite/manifest.json', '/.git/config', '/%2Egit/config', '/.env', '/%2Eenv', '/l002-diagnostic.json', '/l002-diagnostic%2Ejson', '/L002-DIAGNOSTIC.JSON', '/assets/..%2F.env', '/x/%2e%2e/.vite/manifest.json'];
        const verbUit = await Promise.all(verborgen.map(vraag));
        const open = verborgen.filter((_, i) => verbUit[i].status === 200 || /verborgen|sources|PROEF|audit|\[core\]/.test(verbUit[i].body));
        check(`http-rand-04: sourcemaps, verborgen bestanden, verborgen MAPPEN en l002-diagnostic.json blijven dicht in alle ${verborgen.length} schrijfwijzen`, open.length === 0, open.join(' | '));
        const dubbel = await vraag('/assets/%2574ech/BeheerGeheim-abc123.js');
        check('http-rand-04: dubbel gecodeerd pad wordt één keer gedecodeerd (geen tweede decodering bij het openen)', dubbel.status === 404 && !dubbel.body.includes('alleen-voor'), `${dubbel.status}`);
        const kapot = await vraag('/assets/%zz.js');
        check('http-rand-04: ongeldige codering → 400', kapot.status === 400, String(kapot.status));
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
        if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
      }
      const bron = lees('server/start.ts');
      check('http-rand-04 (bron): serveStatic beslist op het gedecodeerde pad (statischDoel) en gebruikt url.pathname nergens meer voor een beslissing',
        /statischDoel\(root, url\.pathname, TECH_ASSET_PREFIX\)/.test(bron) && !/VERBORGEN_PAD\.test\(url\.pathname\)/.test(bron) && !/url\.pathname\.startsWith\(TECH_ASSET_PREFIX\)/.test(bron));
    });

    // ================================================================================================ extensie-01
    await blok('extensie-01', async () => {
      const store = await import('../../backend/connectors-opslag');
      const gw = await import('../../backend/connectors-gateway');
      const onafgehandeld: unknown[] = [];
      const vang = (e: unknown) => { onafgehandeld.push(e); };
      process.on('unhandledRejection', vang);
      class NepWs extends EventEmitter { sent: any[] = []; readyState = 1; gesloten: number | null = null; send(t: string) { this.sent.push(JSON.parse(t)); } close(c?: number) { if (this.gesloten === null) this.gesloten = c ?? 1000; this.emit('close'); } terminate() { this.emit('close'); } }
      const u = await mk('ws');
      const agentIds: string[] = [];
      try {
        const verbind = async (capabilities: unknown) => {
          const tok = randomBytes(24).toString('base64url');
          const ag = await store.createAgent(u, 'PC-g10d', 'linux-x64', sha(tok), { version: '0.8.0' }, undefined, { ruimte: 'prive', version: '0.8.0' });
          agentIds.push(ag.id);
          const ws = new NepWs();
          gw.onConnection(ws as never);
          ws.emit('message', Buffer.from(JSON.stringify({ t: 'auth', token: tok, version: '0.8.0', capabilities })));
          await wacht(() => ws.sent.some((m) => m.t === 'ready') || ws.gesloten !== null, 4000);
          return { ws, ag };
        };
        const a = await verbind({});
        a.ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: 'x', ok: true })));
        a.ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: ['x'], ok: true })));
        a.ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: randomUUID(), ok: true, data: { a: 'voor\u0000na' } })));
        a.ws.emit('message', Buffer.from(JSON.stringify({ t: 'pong', capabilities: { naam: 'x\u0000y' }, version: '0.8.0' })));
        await new Promise((r) => setTimeout(r, 500));
        check('extensie-01: «result» met een id dat geen uuid is, of met U+0000 in data, en «pong» met U+0000 → geen onafgehandelde afwijzing', onafgehandeld.length === 0, onafgehandeld.map((e) => String((e as Error)?.message || e).slice(0, 80)).join(' | '));
        onafgehandeld.length = 0;
        const b = await verbind({ naam: 'apparaat\u0000', diep: [{ 'sleu\u0000tel': 'w\u0000' }] });
        await new Promise((r) => setTimeout(r, 500));
        check('extensie-01: auth-bericht met U+0000 in capabilities → geen onafgehandelde afwijzing (verbinding aangenomen of netjes gesloten)', onafgehandeld.length === 0 && (b.ws.sent.some((m) => m.t === 'ready') || b.ws.gesloten !== null), `${onafgehandeld.length} / ready=${b.ws.sent.some((m) => m.t === 'ready')} / gesloten=${b.ws.gesloten}`);
        a.ws.close(); b.ws.close();
      } finally {
        process.off('unhandledRejection', vang);
        for (const id of agentIds) await pool.query('DELETE FROM app.agents WHERE id = $1', [id]).catch(() => undefined);
      }
      const start = lees('server/start.ts');
      check('extensie-01 (bron): het serverproces heeft een vangnet voor unhandledRejection/uncaughtException en zet het bij de start aan',
        /procesVangnetInstellen\(/.test(start.replace(/import[^\n]*\n/g, '')) && /process\.on\('unhandledRejection'/.test(lees('server/platform/proces-vangnet.ts')));
    });

    // ================================================================================================ wolk-03
    await blok('wolk-03', async () => {
      const a = await mk('klok-a'); const b = await mk('klok-b');
      const ladeA: Lade = { userId: a, ruimte: 'prive' }; const ladeATech: Lade = { userId: a, ruimte: 'technisch' }; const ladeB: Lade = { userId: b, ruimte: 'prive' };
      const tA = takenRoutes(a); const tB = takenRoutes(b);
      const buiten = (context as any).buitenVerzoek as (<T>(fn: () => T) => T) | undefined;
      check('wolk-03: context.buitenVerzoek bestaat', typeof buiten === 'function');
      if (typeof buiten === 'function') {
        const uit = await context.metVerzoek('POST /api/proef', async () => { context.zetGebruiker(a, 'cloud'); return { binnen: context.gebruikerVanContext()?.userId, buiten: buiten(() => context.huidigeContext()) }; });
        check('wolk-03: buitenVerzoek voert uit ZONDER de verzoekcontext; daarbuiten staat ze er nog', uit.binnen === a && uit.buiten === undefined);
      }
      type Gezien = { taakVan: string; gebruiker: string | null; lade: string; alleenLezen: boolean; imp: boolean };
      const gezien: Gezien[] = [];
      takenProef.zetDriveToegang(async (userId: string) => {
        if (merk.getStore() !== 'route') gezien.push({ taakVan: userId, gebruiker: context.gebruikerVanContext()?.userId ?? null, lade: `${huidigeLadeContext()?.lade.userId}/${huidigeLadeContext()?.lade.ruimte}`, alleenLezen: context.isAlleenLezen(), imp: Boolean(context.huidigeContext()?.impersonatie) });
        return { token: 'proef-token', accountId: 'acc-1', email: 'x@example.invalid' };
      });
      takenProef.zetVrijeBytes(async () => null);
      globalThis.fetch = (async (url: unknown) => {
        const s = String(url);
        if (s.includes('alt=media')) return new Response(Buffer.from('hallo'));
        return new Response(JSON.stringify({ id: 'df1', name: 'drive.txt', size: '5', mimeType: 'text/plain' }), { headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      takenProef.zetKlok(true);
      try {
        // De eerste die «Передачі» opent na een herstart: een beheerder die «als gebruiker A» kijkt (alleen lezen), in A's TECHNISCHE lade.
        const eerste = await context.metImpersonatie({ id: randomUUID(), door: 'beheerder-proef' }, true, () => context.metVerzoek('POST /api/owner/cloud/vnext/taken', async () => {
          context.zetGebruiker(a, 'cloud');
          return merk.run('route', () => metLade(ladeATech, 'cloud', async () => (tA[V('taken')][0] as unknown as (c: unknown) => Promise<{ statusCode: number }>)({ event: {}, body: { actie: 'lijst' }, params: {}, query: {} })));
        }));
        check('wolk-03: (opzet) de eerste aanroep — «als gebruiker», alleen lezen — krijgt gewoon zijn lijst', eerste.waarde.statusCode === 200);
        const drive = { dienst: 'google-drive', account: 'acc-1', id: 'df1' };
        const nb = await roep(tB, V('taken'), { actie: 'nieuw', soort: 'kopie', bron: drive, doel: { dienst: 'eigen' } }, ladeB);
        const na = await roep(tA, V('taken'), { actie: 'nieuw', soort: 'kopie', bron: drive, doel: { dienst: 'eigen' } }, ladeA);
        check('wolk-03: (opzet) A en B maken elk een overdracht aan', nb.status === 200 && na.status === 200, `${nb.status} ${na.status}`);
        const standVan = async (id: string) => String((await pool.query(`SELECT data->>'stand' AS s FROM app.records WHERE tbl='cloud_taken_v1' AND id=$1`, [id])).rows[0]?.s || '');
        const klaar = await wacht(async () => (await standVan(nb.uit.taak?.id)) === 'klaar' && (await standVan(na.uit.taak?.id)) === 'klaar', 15000);
        check('wolk-03: de klok (setInterval) voert de overdrachten van BEIDE gebruikers uit, ook als de eerste bezoeker een alleen-lezen «als gebruiker»-sessie was', klaar, `B=${await standVan(nb.uit.taak?.id)} A=${await standVan(na.uit.taak?.id)}`);
        const vanB = gezien.find((g) => g.taakVan === b); const vanA = gezien.find((g) => g.taakVan === a);
        check('wolk-03: de werker draait buiten elke gebruikerscontext (geen app.user_id van de eerste bezoeker, geen impersonatie, niet alleen-lezen)',
          !!vanA && !!vanB && gezien.every((g) => g.gebruiker === null && !g.alleenLezen && !g.imp), JSON.stringify(gezien).slice(0, 300));
        check('wolk-03: elke taak loopt in de lade uit haar EIGEN record (Google-accounts van de juiste mens en ruimte)', vanB?.lade === `${b}/prive` && vanA?.lade === `${a}/prive`, JSON.stringify(gezien).slice(0, 300));
        const bestandB = (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='cloud_items_v1' AND data->>'ownerUserId' = $1 AND data->>'ruimte' = 'prive'`, [b])).rows[0]?.n;
        check('wolk-03: het resultaat staat in de opslag van B zelf', bestandB === 1, String(bestandB));
        // Een taak in een TECHNISCHE lade van iemand zonder technische rechten: niet uitvoeren.
        const techId = randomUUID();
        await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['cloud_taken_v1', techId, { ownerUserId: a, ruimte: 'technisch', soort: 'kopie', stand: 'wacht', bron: drive, doel: { dienst: 'eigen' }, naam: 'x', totaalBytes: 5, voortgangBytes: 0, createdAt: Date.now(), updatedAt: Date.now() }]);
        const voor = gezien.length;
        await wacht(async () => (await standVan(techId)) !== 'wacht' && (await standVan(techId)) !== 'bezig', 10000);
        const techRij = (await pool.query(`SELECT data FROM app.records WHERE tbl='cloud_taken_v1' AND id=$1`, [techId])).rows[0]?.data;
        check('wolk-03: een taak in een gesloten technische lade wordt geweigerd (LADE_GESLOTEN) zonder Google te raadplegen', techRij?.stand === 'fout' && techRij?.fout?.code === 'LADE_GESLOTEN' && gezien.length === voor, `${techRij?.stand} ${techRij?.fout?.code}`);
      } finally { takenProef.zetKlok(false); globalThis.fetch = echteFetch; }
      const bron = lees('backend/cloud-vnext-taken.ts');
      check('wolk-03 (bron): de route start de klok niet meer', !/try \{ startKlok\(\);/.test(bron));
    });

    // ================================================================================================ ai-mcp-06
    await blok('ai-mcp-06', async () => {
      const { mcpConsoleRoutes } = await import('../../backend/mcp-console');
      const tp = await import('../../backend/tech-profiel');
      const dir = mkdtempSync(join(tmpdir(), 'sec002-g10d-mcp-'));
      const oud = { MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD, OWNER_EMAIL: process.env.OWNER_EMAIL };
      process.env.MCP_RECHTEN_PAD = join(dir, 'mcp-rechten.json');
      writeFileSync(process.env.MCP_RECHTEN_PAD, JSON.stringify({ read: true, uitrol: false }));
      // Eén eigenaar per database (records_een_eigenaar): de bestaande gebruiken, anders een tijdelijke.
      const bestaand = (await pool.query("SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0] as { id: string; email: string } | undefined;
      const eigId = bestaand?.id ?? `g10d-eig-${randomUUID()}`;
      const eigMail = bestaand?.email || `g10d-eig-${sfx}@eenheid.test`;
      if (!bestaand) await pool.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [eigId, { email: eigMail, role: 'owner', status: 'approved', name: 'Eigenaar proef' }]);
      process.env.OWNER_EMAIL = eigMail;
      const profielWas = (await pool.query('SELECT 1 FROM app.tech_profielen WHERE user_id = $1', [eigId])).rows.length > 0;
      const standWas = (await pool.query(`SELECT stand FROM app.ruimte_dienst_stand WHERE user_id = $1 AND dienst = 'ai'`, [eigId])).rows[0]?.stand as string | undefined;
      const keuzeWas = (await pool.query('SELECT 1 FROM app.ruimte_keuze WHERE user_id = $1', [eigId])).rows.length > 0;
      const raw = `tvh_${randomBytes(24).toString('base64url')}`;
      const routes = mcpConsoleRoutes(async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }) as never, {} as never);
      const agent = async (name: string) => {
        const res: any = await context.metVerzoek('POST /api/mcp/agent', async () => (routes['POST /api/mcp/agent'][0] as any)({ event: { headers: { authorization: `Bearer ${raw}` } }, body: { name, arguments: {} } }));
        let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
        return { status: res.statusCode as number, data };
      };
      let tokenId = '';
      try {
        tokenId = (await pool.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, expires_at, ruimte) VALUES ($1, 'g10d-proef', 'tvh_proef', $2, now() + interval '1 day', 'technisch') RETURNING id`, [eigId, sha(raw)])).rows[0].id;
        await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'handmatig' WHERE user_id = $1 AND beeindigd_op IS NULL`, [eigId]).catch(() => undefined);
        // 1. Technisch token van de eigenaar, maar het technische profiel is UIT.
        const uit1 = await agent('release_info');
        check('ai-mcp-06: technisch token, technisch profiel UIT → /api/mcp/agent weigert met TECH_PROFILE_OFF (403), niets uitgevoerd', uit1.status === 403 && uit1.data?.error === 'TECH_PROFILE_OFF' && uit1.data?.ok === false, JSON.stringify(uit1).slice(0, 200));
        const uit1b = await agent('uitrol_voorstel_status');
        check('ai-mcp-06: hetzelfde voor de uitroltools (voorbereiden vraagt ook een levende technische ruimte)', uit1b.status === 403 && uit1b.data?.error === 'TECH_PROFILE_OFF', JSON.stringify(uit1b).slice(0, 200));
        const log = (await pool.query(`SELECT detail, ok FROM app.mcp_console_log WHERE user_id = $1 AND detail LIKE '%TECH_PROFILE_OFF%' ORDER BY at DESC LIMIT 1`, [eigId]).catch(() => ({ rows: [] }))).rows[0];
        check('ai-mcp-06: de weigering staat in het verkeerslog van de console', !!log && log.ok === false, JSON.stringify(log ?? null));
        const audit = (await pool.query(`SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND result = 'denied' AND details->>'reden' = 'tech-profiel' AND details->>'grantId' = $2`, [eigId, `token:${tokenId}`])).rows;
        check('toets-g10d №3: de weigering TECH_PROFILE_OFF staat ook in het journaal (app.audit, owner.mcp.tool / denied / tech-profiel, met het token)', audit.length >= 2 && audit.every((r: any) => r.details?.transport === 'agent' && r.details?.ruimte === 'technisch'), String(audit.length));
        // 2. Profiel AAN + dienst «ai» op eigen gegevens → het token werkt.
        await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test') ON CONFLICT (user_id) DO NOTHING`, [eigId, `tech-${randomBytes(6).toString('hex')}`]);
        await pool.query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1,'per_dienst',$1) ON CONFLICT (user_id) DO NOTHING`, [eigId]);
        await pool.query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door) VALUES ($1,'ai','eigen','uit','test') ON CONFLICT (user_id, dienst) DO UPDATE SET stand = 'eigen', bevroren_op = NULL, bevroren_oorzaak = ''`, [eigId]);
        const tab = randomBytes(24).toString('hex');
        await tp.activeren({ id: eigId, email: eigMail, role: 'owner', status: 'approved' } as never, tab, 60, 'test: ai-mcp-06');
        const aan = await agent('release_info');
        check('ai-mcp-06: profiel AAN en dienst «ai» aan → hetzelfde token komt weer bij het hulpmiddel (geen 403, geen TECH_PROFILE_OFF)', aan.status !== 403 && aan.data?.error !== 'TECH_PROFILE_OFF' && aan.data?.error !== 'SPACE_SEPARATED', JSON.stringify(aan).slice(0, 200));
        // toets-g10d №6b: de wettige weg volledig — de eigenaar met levend profiel bereikt de servertools (niet OWNER_ONLY), zijn
        // eigen bord blijft gescheiden (SPACE_SEPARATED) en voorbereiden vraagt nog steeds de grant.
        const aanBord = await agent('list_tasks'); const aanUitrol = await agent('uitrol_voorstel_status');
        check('toets-g10d №6: eigenaar met levend profiel: release_info niet OWNER_ONLY; list_tasks → 403 SPACE_SEPARATED; uitrol_voorstel_status → GEEN_VOORBEREIDER_GRANT',
          aan.data?.error !== 'OWNER_ONLY' && aanBord.status === 403 && aanBord.data?.error === 'SPACE_SEPARATED' && aanUitrol.status === 400 && /GEEN_VOORBEREIDER_GRANT/.test(String(aanUitrol.data?.error)), JSON.stringify([aan.data, aanBord.data, aanUitrol.data]).slice(0, 300));
        check('toets-g10d №5: een systeemfout van een hulpmiddel (pad op schijf) komt niet in het antwoord: TOOL_FAILED + incidentnummer',
          aan.data?.ok === true || (aan.data?.error === 'TOOL_FAILED' && /^[0-9a-f]{8}$/.test(String(aan.data?.incident)) && !/srv|ENOENT|realpath/.test(JSON.stringify(aan.data))), JSON.stringify(aan.data).slice(0, 200));
        // 3. Dienst «ai» UIT in de technische ruimte (profiel nog aan) → weer geweigerd.
        await pool.query(`UPDATE app.ruimte_dienst_stand SET stand = 'uit' WHERE user_id = $1 AND dienst = 'ai'`, [eigId]);
        const dienstUit = await agent('release_info');
        check('ai-mcp-06: dienst «Підключення ШІ» UIT in de technische ruimte → geweigerd, ook met een lopende activering', dienstUit.status === 403 && dienstUit.data?.error === 'TECH_PROFILE_OFF', JSON.stringify(dienstUit).slice(0, 200));
        await pool.query(`UPDATE app.ruimte_dienst_stand SET stand = 'eigen' WHERE user_id = $1 AND dienst = 'ai'`, [eigId]);
        // 4. Profiel verlaten → meteen weg.
        await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'handmatig' WHERE user_id = $1 AND beeindigd_op IS NULL`, [eigId]);
        const weerUit = await agent('release_info');
        check('ai-mcp-06: technisch profiel verlaten → dezelfde aanroep wordt meteen weer geweigerd («levende rechten»)', weerUit.status === 403 && weerUit.data?.error === 'TECH_PROFILE_OFF', JSON.stringify(weerUit).slice(0, 200));
        // 5. Een privétoken merkt hier niets van.
        await pool.query(`UPDATE app.mcp_console_tokens SET ruimte = 'prive' WHERE id = $1`, [tokenId]);
        // Zoals bij het echte uitgeven (POST /api/mcp/tokens): de niet-gevoelige standaardscopes voor dit token (0043).
        await (await import('../../backend/ai-toegang')).geefStandaard(eigId, { soort: 'agenttoken', id: String(tokenId) }, 'prive').catch(() => undefined);
        const prive = await agent('list_tasks');
        check('ai-mcp-06: een privétoken blijft gewoon werken (eigen bord), los van het technische profiel', prive.status === 200 && prive.data?.ok === true, JSON.stringify(prive).slice(0, 200));
      } finally {
        if (tokenId) await (await import('../../backend/ai-toegang')).verwijderToegang({ soort: 'agenttoken', id: String(tokenId) }).catch(() => undefined);
        if (tokenId) await pool.query('DELETE FROM app.mcp_console_tokens WHERE id = $1', [tokenId]).catch(() => undefined);
        await pool.query('DELETE FROM app.mcp_console_log WHERE user_id = $1 AND agent = $2', [eigId, 'g10d-proef']).catch(() => undefined);
        await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'handmatig' WHERE user_id = $1 AND beeindigd_op IS NULL`, [eigId]).catch(() => undefined);
        if (!profielWas) await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [eigId]).then(() => pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eigId])).catch(() => undefined);
        if (standWas === undefined) await pool.query(`DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1 AND dienst = 'ai'`, [eigId]).catch(() => undefined);
        else await pool.query(`UPDATE app.ruimte_dienst_stand SET stand = $2 WHERE user_id = $1 AND dienst = 'ai'`, [eigId, standWas]).catch(() => undefined);
        if (!keuzeWas) await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id = $1', [eigId]).catch(() => undefined);
        if (!bestaand) await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigId]).catch(() => undefined);
        for (const [k, v] of Object.entries(oud)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      }
      check('ai-mcp-06 (bron): de opmerking in ai-ruimte-poort.ts beschrijft nu wat de code doet (aiPoortNu in /api/mcp/agent)', /\/api\/mcp\/agent/.test(lees('backend/ai-ruimte-poort.ts')) && /aiPoortNu\(/.test(lees('backend/mcp-console.ts')));
    });

    // ================================================================================================ wolk-02 + privacy-logboek-04 (foto)
    await blok('foto', async () => {
      const u = await mk('foto'); const v = await mk('foto-b');
      const lade: Lade = { userId: u, ruimte: 'prive' }; const ladeV: Lade = { userId: v, ruimte: 'prive' };
      const maak = (id: string) => (fotoMod.fotoDienstRoutes as any)(async () => ({ user: { id, role: 'member', status: 'approved' }, service: 'cloud' }), { vlagAan: async () => true }) as RouteMap;
      const rU = maak(u); const rV = maak(v);
      const L = (fotoModel as any).FOTO_LIMIETEN as Record<string, number>;
      fotoProef.wisSessies();
      const sessieBoom = join(uploads, '.foto-sessies');
      const tmpVoor = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('foto-up-')));
      // 1. aantal sessies per mens
      const max = Number(L.sessiesPerMens) || 4;
      const begins: Antw[] = [];
      for (let i = 0; i < max + 2; i++) begins.push(await roep(rU, F('upload'), { actie: 'begin', naam: `f${i}.jpg`, bytes: 1000 }, lade));
      const toegelaten = begins.filter((b) => b.status === 200).length;
      check(`privacy-logboek-04: één mens krijgt hoogstens ${max} open uploadsessies; de volgende «begin» → UPLOAD_TE_VEEL`, typeof L.sessiesPerMens === 'number' && toegelaten === max && begins[max].uit.error === 'UPLOAD_TE_VEEL', `${toegelaten} toegelaten; ${begins[max]?.uit.error}`);
      check('privacy-logboek-04: een ANDER account wordt daardoor niet geblokkeerd', (await roep(rV, F('upload'), { actie: 'begin', naam: 'v.jpg', bytes: 1000 }, ladeV)).status === 200);
      const tmpNa = readdirSync(tmpdir()).filter((n) => n.startsWith('foto-up-') && !tmpVoor.has(n));
      check('wolk-02: uploadsessies liggen onder UPLOADS_DIR/.foto-sessies (niet in /tmp)', existsSync(sessieBoom) && readdirSync(sessieBoom).length >= max && tmpNa.length === 0, `boom=${existsSync(sessieBoom) ? readdirSync(sessieBoom).length : 'geen'} tmp=${tmpNa.length}`);
      // afbreken geeft de plek terug
      await roep(rU, F('upload'), { actie: 'afbreken', id: begins[0].uit.id }, lade);
      check('privacy-logboek-04: na «afbreken» is er weer plaats', (await roep(rU, F('upload'), { actie: 'begin', naam: 'weer.jpg', bytes: 1000 }, lade)).status === 200);
      fotoProef.wisSessies();
      // 2. som van de aangekondigde bytes per mens
      const deel = Math.min(Number(L.itemMaxBytes), Math.floor((Number(L.sessieBytesPerMens) || 512 * MiB) * 0.4));
      const g1 = await roep(rU, F('upload'), { actie: 'begin', naam: 'g1.mp4', bytes: deel }, lade);
      const g2 = await roep(rU, F('upload'), { actie: 'begin', naam: 'g2.mp4', bytes: deel }, lade);
      const g3 = await roep(rU, F('upload'), { actie: 'begin', naam: 'g3.mp4', bytes: deel }, lade);
      check('privacy-logboek-04: de som van de aangekondigde bytes van één mens is begrensd (UPLOAD_TE_VEEL)', typeof L.sessieBytesPerMens === 'number' && g1.status === 200 && g2.status === 200 && g3.uit.error === 'UPLOAD_TE_VEEL', `${g1.status} ${g2.status} ${g3.status} ${g3.uit.error}`);
      fotoProef.wisSessies();
      // 3. schijf
      if (typeof fotoProef.zetVrijeBytes === 'function') fotoProef.zetVrijeBytes(async () => 100 * MiB);
      const vol = await roep(rU, F('upload'), { actie: 'begin', naam: 'vol.mp4', bytes: 200 * MiB }, lade);
      check('wolk-02: «begin» meet de vrije schijf (met reserve) → SCHIJF_VOL met cijfers', typeof fotoProef.zetVrijeBytes === 'function' && vol.status === 400 && vol.uit.error === 'SCHIJF_VOL' && vol.uit.vrijBytes === 100 * MiB, `${vol.status} ${vol.uit.error}`);
      if (typeof fotoProef.zetVrijeBytes === 'function') fotoProef.zetVrijeBytes(null);
      // 4. race op «stuk»: zes gelijke stukken tegelijk in een sessie van 10 bytes
      const klein = await roep(rU, F('upload'), { actie: 'begin', naam: 'race.jpg', bytes: 10 }, lade);
      const tien = Buffer.from('0123456789');
      const zes = await Promise.all([...Array(6)].map(() => roep(rU, F('upload'), { actie: 'stuk', id: klein.uit.id, offset: 0, data: tien.toString('base64') }, lade)));
      const ok = zes.filter((z) => z.status === 200).length;
      const pad = join(sessieBoom, String(klein.uit.id), 'inhoud');
      check('wolk-02: zes parallelle «stuk» met dezelfde offset → precies één aangenomen, de rest STUK_BUITEN_ORDE; op schijf staan 10 bytes', ok === 1 && zes.filter((z) => z.uit.error === 'STUK_BUITEN_ORDE').length === 5 && existsSync(pad) && statSync(pad).size === 10, `${ok} aangenomen; ${existsSync(pad) ? statSync(pad).size : 'geen bestand'} bytes`);
      const raceKlaar = await roep(rU, F('upload'), { actie: 'klaar', id: klein.uit.id, sha256: sha(tien) }, lade);
      check('wolk-02: «klaar» na de race levert het bestand van precies 10 bytes', raceKlaar.status === 200 && raceKlaar.uit.item?.bytes === 10 && raceKlaar.uit.item?.sha256 === sha(tien), `${raceKlaar.status} ${raceKlaar.uit.item?.bytes}`);
      // 5. een echt bestand in meerdere stukken, stromend opgeslagen, byte voor byte terug
      const inhoud = randomBytes(Math.floor(2.3 * L.stukMaxBytes));
      const b3 = await roep(rU, F('upload'), { actie: 'begin', naam: 'groot.jpg', mime: 'image/jpeg', bytes: inhoud.length }, lade);
      for (let o = 0; o < inhoud.length; o += L.stukMaxBytes) await roep(rU, F('upload'), { actie: 'stuk', id: b3.uit.id, offset: o, data: inhoud.subarray(o, o + L.stukMaxBytes).toString('base64') }, lade);
      const k3 = await roep(rU, F('upload'), { actie: 'klaar', id: b3.uit.id, sha256: sha(inhoud) }, lade);
      const terug = k3.status === 200 ? await roep(rU, F('inhoud'), { id: k3.uit.item.id }, lade) : null;
      check('wolk-02: upload in stukken → «klaar» → inhoud byte voor byte gelijk; de sessiemap is opgeruimd', k3.status === 200 && k3.uit.item.sha256 === sha(inhoud) && !!terug && Buffer.from(terug.uit.data, 'base64').equals(inhoud) && !existsSync(join(sessieBoom, String(b3.uit.id))), `${k3.status} ${k3.uit.error ?? ''}`);
      const dub = await roep(rU, F('upload'), { actie: 'begin', naam: 'groot-kopie.jpg', mime: 'image/jpeg', bytes: inhoud.length }, lade);
      for (let o = 0; o < inhoud.length; o += L.stukMaxBytes) await roep(rU, F('upload'), { actie: 'stuk', id: dub.uit.id, offset: o, data: inhoud.subarray(o, o + L.stukMaxBytes).toString('base64') }, lade);
      const dubKlaar = await roep(rU, F('upload'), { actie: 'klaar', id: dub.uit.id }, lade);
      check('wolk-02: dezelfde inhoud nogmaals → «bekend», geen tweede bestand', dubKlaar.status === 200 && dubKlaar.uit.bekend === true && dubKlaar.uit.item.id === k3.uit.item?.id, `${dubKlaar.status} ${dubKlaar.uit.bekend}`);
      const mis = await roep(rU, F('upload'), { actie: 'begin', naam: 'mis.jpg', bytes: 10 }, lade);
      await roep(rU, F('upload'), { actie: 'stuk', id: mis.uit.id, offset: 0, data: tien.toString('base64') }, lade);
      const misKlaar = await roep(rU, F('upload'), { actie: 'klaar', id: mis.uit.id, sha256: 'a'.repeat(64) }, lade);
      check('wolk-02: verkeerde sha256 → SHA_MISMATCH en de sessie (met haar bestand) is weg', misKlaar.uit.error === 'SHA_MISMATCH' && !existsSync(join(sessieBoom, String(mis.uit.id))) && (await roep(rU, F('upload'), { actie: 'stuk', id: mis.uit.id, offset: 0, data: tien.toString('base64') }, lade)).uit.error === 'UPLOAD_ONBEKEND');
      // 6. drie «klaar» tegelijk (semafoor) slagen allemaal
      const drie = await Promise.all([0, 1, 2].map(async (i) => {
        const data = randomBytes(2000 + i);
        const b = await roep(rU, F('upload'), { actie: 'begin', naam: `par${i}.jpg`, bytes: data.length }, lade);
        await roep(rU, F('upload'), { actie: 'stuk', id: b.uit.id, offset: 0, data: data.toString('base64') }, lade);
        return { b, data };
      }));
      const klaarDrie = await Promise.all(drie.map(({ b, data }) => roep(rU, F('upload'), { actie: 'klaar', id: b.uit.id, sha256: sha(data) }, lade)));
      check('wolk-02: gelijktijdige «klaar» (door de wachtrij) slagen allemaal', klaarDrie.every((k) => k.status === 200 && k.uit.bekend === false), klaarDrie.map((k) => `${k.status}:${k.uit.error ?? ''}`).join(' '));
      // 7. verlaten sessies verdwijnen zonder dat iemand opnieuw «upload» aanroept; wezen van een vorig procesleven ook
      const verlaten = await roep(rU, F('upload'), { actie: 'begin', naam: 'verlaten.jpg', bytes: 10 }, lade);
      const wees = join(sessieBoom, randomUUID()); mkdirSync(wees, { recursive: true }); writeFileSync(join(wees, 'inhoud'), 'x');
      const heeftHaak = typeof fotoProef.opruimenNu === 'function';
      if (heeftHaak) await fotoProef.opruimenNu(Date.now() + 31 * 60_000);
      check('privacy-logboek-04: verlopen sessies en wezen op schijf worden opgeruimd (klok, niet alleen bij een volgend verzoek)', heeftHaak && !existsSync(join(sessieBoom, String(verlaten.uit.id))) && !existsSync(wees), `haak=${heeftHaak}`);
      // 8. «kopieer» en «controleer» zonder het hele bestand in het geheugen
      const cloudPad = `${cloudVoorvoegsel(lade)}/${Date.now()}-kopie.jpg`;
      const cloudBytes = randomBytes(300_000);
      await storage.write([{ path: cloudPad, content: cloudBytes.toString('base64'), contentType: 'image/jpeg', ownerId: u }]);
      const [cloudId] = await db.add('cloud_items_v1', [{ ownerUserId: u, ruimte: 'prive', kind: 'file', title: 'kopie.jpg', originalName: 'kopie.jpg', mimeType: 'image/jpeg', sizeBytes: cloudBytes.length, storagePath: cloudPad, createdAt: Date.now(), updatedAt: Date.now() }]);
      await roep(rU, F('indexeer'), {}, lade);
      const bib = await roep(rU, F('bibliotheek'), { zoek: 'kopie.jpg' }, lade);
      const virtueel = (bib.uit.items as any[] | undefined)?.find((i) => i.naam === 'kopie.jpg' && i.opslag === 'cloud');
      const kop = virtueel ? await roep(rU, F('item'), { actie: 'kopieer', id: virtueel.id }, lade) : null;
      const kopItem = kop?.uit.items?.[0];
      const kopInhoud = kopItem ? await roep(rU, F('inhoud'), { id: kopItem.id }, lade) : null;
      check('wolk-02: «kopieer» (back-up uit «Хмарне сховище») levert een eigen kopie met dezelfde bytes en sha256', !!kopItem && kopItem.opslag === 'eigen' && kopItem.sha256 === sha(cloudBytes) && kopItem.bytes === cloudBytes.length && !!kopInhoud && Buffer.from(kopInhoud.uit.data, 'base64').equals(cloudBytes), `${kop?.status} ${kop?.uit.error ?? ''} ${kopItem?.opslag}`);
      const ctrl = kopItem ? await roep(rU, F('item'), { actie: 'controleer', id: kopItem.id }, lade) : null;
      check('wolk-02: «controleer» bevestigt de kopie (stromende sha256)', ctrl?.uit.items?.[0]?.backup?.ok === true, JSON.stringify(ctrl?.uit).slice(0, 160));
      const bron = lees('backend/foto-dienst.ts');
      check('wolk-02 (bron): geen readFile van het hele uploadbestand en geen base64 van de hele inhoud meer in «klaar»/«kopieer»; opslaan via writeVanPad',
        !/readFile\(s!?\.pad\)/.test(bron) && !/content: b\.toString\('base64'\)/.test(bron) && /storage\.writeVanPad\(/.test(bron) && !/mkdtemp\(join\(tmpdir\(\)/.test(bron));
      fotoProef.wisSessies();
    });

    // ================================================================================================ wolk-04
    await blok('wolk-04', async () => {
      const u = await mk('schijf'); const w = await mk('schijf-b'); const eig = await mk('schijf-rol');
      const lade: Lade = { userId: u, ruimte: 'prive' }; const ladeW: Lade = { userId: w, ruimte: 'prive' };
      const r = bestandenRoutes(u); const rW = bestandenRoutes(w);
      vnextProef.wisSessieGeheugen();
      const GiB = 1024 * MiB;
      // 1. «begin» telt de nog niet ontvangen bytes van de EIGEN open sessies mee
      vnextProef.zetVrijeBytes(async () => GiB);
      const s1 = await roep(r, V('upload'), { actie: 'begin', naam: 'een.bin', mime: 'application/octet-stream', bytes: 600 * MiB }, lade);
      const s2 = await roep(r, V('upload'), { actie: 'begin', naam: 'twee.bin', mime: 'application/octet-stream', bytes: 600 * MiB }, lade);
      check('wolk-04: een tweede sessie die samen met de eerste niet meer past → SCHIJF_VOL (vroeger: elke sessie zag dezelfde vrije ruimte)', s1.status === 200 && s2.status === 400 && s2.uit.error === 'SCHIJF_VOL' && s2.uit.vrijBytes === GiB && s2.uit.nodigBytes > GiB, `${s1.status} ${s2.status} ${s2.uit.error ?? ''}`);
      const s3 = await roep(r, V('upload'), { actie: 'begin', naam: 'klein.bin', mime: 'application/octet-stream', bytes: 10 * MiB }, lade);
      check('wolk-04: wat nog wel past, mag gewoon', s3.status === 200);
      // 2. «stuk» weigert onder de bodem van de schijf
      const klein = await roep(rW, V('upload'), { actie: 'begin', naam: 'bodem.bin', mime: 'application/octet-stream', bytes: 10 }, ladeW);
      vnextProef.zetVrijeBytes(async () => 50 * MiB);
      const stukVol = await roep(rW, V('upload'), { actie: 'stuk', id: klein.uit.id, offset: 0, data: Buffer.alloc(10, 7).toString('base64') }, ladeW);
      check('wolk-04: «stuk» schrijft niet meer zodra de schijf onder de bodem zit → SCHIJF_VOL', stukVol.status === 400 && stukVol.uit.error === 'SCHIJF_VOL', `${stukVol.status} ${stukVol.uit.error ?? ''}`);
      vnextProef.zetVrijeBytes(async () => GiB);
      const stukOk = await roep(rW, V('upload'), { actie: 'stuk', id: klein.uit.id, offset: 0, data: Buffer.alloc(10, 7).toString('base64') }, ladeW);
      check('wolk-04: met ruimte gaat hetzelfde stuk er gewoon in (de sessie bleef bestaan)', stukOk.status === 200 && stukOk.uit.ontvangen === 10);
      vnextProef.zetVrijeBytes(null);
      for (const s of [s1, s3, klein]) if (s.uit.id) await roep(s === klein ? rW : r, V('upload'), { actie: 'afbreken', id: s.uit.id }, s === klein ? ladeW : lade);
      // 3. quota per mens (alleen als de eigenaar van de server ze instelt)
      const vorigeQuota = process.env.CLOUD_EIGEN_QUOTA_BYTES;
      try {
        process.env.CLOUD_EIGEN_QUOTA_BYTES = '1000';
        const teVeel = await roep(r, V('upload'), { actie: 'begin', naam: 'q.bin', mime: 'application/octet-stream', bytes: 2000 }, lade);
        check('wolk-04: met CLOUD_EIGEN_QUOTA_BYTES weigert «begin» boven de quota → QUOTA_BEREIKT met cijfers', teVeel.status === 400 && teVeel.uit.error === 'QUOTA_BEREIKT' && teVeel.uit.quotaBytes === 1000, `${teVeel.status} ${teVeel.uit.error ?? ''}`);
        const zes = await upload(r, lade, 'zeshonderd.bin', 'application/octet-stream', randomBytes(600));
        const vijf = await roep(r, V('upload'), { actie: 'begin', naam: 'vijfhonderd.bin', mime: 'application/octet-stream', bytes: 500 }, lade);
        check('wolk-04: de quota telt wat er al staat (600 bewaard + 500 nieuw > 1000)', zes.status === 200 && vijf.uit.error === 'QUOTA_BEREIKT' && vijf.uit.gebruiktBytes === 600, `${zes.status} ${vijf.uit.error ?? ''} ${vijf.uit.gebruiktBytes}`);
        const open1 = await roep(r, V('upload'), { actie: 'begin', naam: 'driehonderd.bin', mime: 'application/octet-stream', bytes: 300 }, lade);
        const open2 = await roep(r, V('upload'), { actie: 'begin', naam: 'tweehonderd.bin', mime: 'application/octet-stream', bytes: 200 }, lade);
        check('wolk-04: de quota telt ook de aangekondigde bytes van open sessies (600 + 300 open + 200 nieuw > 1000)', open1.status === 200 && open2.uit.error === 'QUOTA_BEREIKT', `${open1.status} ${open2.uit.error ?? ''}`);
        const rEig = bestandenRoutes(eig, undefined, 'owner');
        check('wolk-04: de eigenaar van de server valt buiten de quota', (await roep(rEig, V('upload'), { actie: 'begin', naam: 'q.bin', mime: 'application/octet-stream', bytes: 5000 }, { userId: eig, ruimte: 'prive' })).status === 200);
        delete process.env.CLOUD_EIGEN_QUOTA_BYTES;
        check('wolk-04: zonder de instelling is er geen verzonnen plafond (gedrag als voorheen)', (await roep(r, V('upload'), { actie: 'begin', naam: 'vrij.bin', mime: 'application/octet-stream', bytes: 5000 }, lade)).status === 200);
      } finally { if (vorigeQuota === undefined) delete process.env.CLOUD_EIGEN_QUOTA_BYTES; else process.env.CLOUD_EIGEN_QUOTA_BYTES = vorigeQuota; }
      // 4. opruimen kijkt naar ALLE sessiemappen (niet alleen de eerste 200), ook na een herstart
      const boom = join(uploads, '.vnext-sessies');
      mkdirSync(boom, { recursive: true });
      const vers: string[] = []; const verlopen: string[] = [];
      const schrijf = (id: string, userId: string, laatst: number) => { mkdirSync(join(boom, id), { recursive: true }); writeFileSync(join(boom, id, 'inhoud'), ''); writeFileSync(join(boom, id, 'sessie.json'), JSON.stringify({ userId, ruimte: 'prive', naam: `s-${id.slice(0, 6)}.bin`, mime: 'application/octet-stream', bytes: 100, mapId: null, stukken: [], laatst })); };
      for (let i = 0; i < 215; i++) { const id = randomUUID(); vers.push(id); schrijf(id, `ander-${i}`, Date.now()); }
      for (let i = 0; i < 30; i++) { const id = randomUUID(); verlopen.push(id); schrijf(id, `oud-${i}`, Date.now() - 49 * 3600 * 1000); }
      vnextProef.wisSessieGeheugen(); // «herstart»
      await roep(r, V('upload'), { actie: 'begin', naam: 'trigger.bin', mime: 'application/octet-stream', bytes: 10 }, lade);
      const over = verlopen.filter((id) => existsSync(join(boom, id)));
      check('wolk-04: na een herstart ruimt de eerste aanroep ALLE verlopen sessiemappen op (245 mappen, 30 verlopen)', over.length === 0 && vers.every((id) => existsSync(join(boom, id))), `${over.length} verlopen mappen bleven staan`);
      // 5. de grens van 8 sessies per mens geldt ook na een herstart (sessies op schijf tellen mee)
      vnextProef.wisSessieGeheugen();
      for (const id of vers.slice(0, 8)) schrijf(id, w, Date.now());
      vnextProef.wisSessieGeheugen();
      const negende = await roep(rW, V('upload'), { actie: 'begin', naam: 'negende.bin', mime: 'application/octet-stream', bytes: 10 }, ladeW);
      check('wolk-04: acht open sessies op schijf + «herstart» → de negende «begin» is nog steeds LIMIET_BEREIKT', negende.uit.error === 'LIMIET_BEREIKT', `${negende.status} ${negende.uit.error ?? ''}`);
      vnextProef.wisSessieGeheugen();
    });

    // ================================================================================================ wolk-05
    await blok('wolk-05', async () => {
      const u = await mk('vlag');
      const lade: Lade = { userId: u, ruimte: 'prive' };
      const uit = async () => false; const aan = async () => true;
      const rUit = bestandenRoutes(u, { vlagAan: uit });
      const paden = ['overzicht', 'bestanden', 'map', 'bestand', 'upload', 'download', 'versies'];
      const antwoorden = await Promise.all(paden.map((p) => roep(rUit, V(p), p === 'upload' ? { actie: 'begin', naam: 'x.bin', mime: 'application/octet-stream', bytes: 10 } : p === 'map' ? { actie: 'nieuw', naam: 'x' } : {}, lade)));
      const open = paden.filter((_, i) => !(antwoorden[i].status === 404 && antwoorden[i].uit.error === 'CLOUD_VNEXT_UIT'));
      check('wolk-05: vlag cloud-vnext UIT → alle zeven routes van het bestandsbeheer antwoorden 404 CLOUD_VNEXT_UIT', open.length === 0, open.join(' '));
      check('wolk-05: er is ook niets aangemaakt (geen map, geen uploadsessie)', (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl = 'cloud_mappen_v1' AND data->>'ownerUserId' = $1`, [u])).rows[0].n === 0);
      const rAan = bestandenRoutes(u, { vlagAan: aan });
      check('wolk-05: vlag AAN → de routes werken', (await roep(rAan, V('overzicht'), {}, lade)).status === 200);
      const rFout = bestandenRoutes(u, { vlagAan: async () => { throw new Error('vlaggen onbereikbaar'); } });
      check('wolk-05: kan de vlag niet bepaald worden, dan is het antwoord «uit» (veilige kant)', (await roep(rFout, V('overzicht'), {}, lade)).uit.error === 'CLOUD_VNEXT_UIT');
      // taken: schrijven volgt cloud-vnext; de LIJST mag ook voor het verbindingencentrum (eigen vlag) open staan
      const tUit = takenRoutes(u, { vlagAan: uit, vlagLezen: aan });
      const nieuw = await roep(tUit, V('taken'), { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: 'acc-1', id: 'x' }, doel: { dienst: 'eigen' } }, lade);
      const lijst = await roep(tUit, V('taken'), { actie: 'lijst' }, lade);
      const opruim = await roep(tUit, V('taken'), { actie: 'opruimen' }, lade);
      check('wolk-05: taken — nieuw/opruimen 404 CLOUD_VNEXT_UIT bij vlag UIT; «lijst» blijft voor het verbindingencentrum', nieuw.status === 404 && nieuw.uit.error === 'CLOUD_VNEXT_UIT' && opruim.uit.error === 'CLOUD_VNEXT_UIT' && lijst.status === 200, `${nieuw.status} ${lijst.status} ${opruim.status}`);
      check('wolk-05: taken — beide vlaggen UIT → ook de lijst dicht', (await roep(takenRoutes(u, { vlagAan: uit, vlagLezen: uit }), V('taken'), { actie: 'lijst' }, lade)).uit.error === 'CLOUD_VNEXT_UIT');
      const iUit = (integratiesMod.cloudVnextIntegratiesRoutes as any)(sessieVan(u), { vlagAan: uit }) as RouteMap;
      check('wolk-05: integraties — vlag UIT → 404 CLOUD_VNEXT_UIT', (await roep(iUit, V('integraties'), {}, lade)).uit.error === 'CLOUD_VNEXT_UIT');
      const index = lees('backend/index.ts');
      check('wolk-05 (bron): backend/index.ts geeft de drie vNext-fabrieken de vlag mee (cloud-vnext; lezen ook met verbindingen-centrum-v2)',
        /cloudVnextBestandenRoutes\(ownerRequireSession as never, \{ vlagAan:/.test(index) && /cloudVnextIntegratiesRoutes\(ownerRequireSession as never, \{ vlagAan:/.test(index) && /cloudVnextTakenRoutes\(ownerRequireSession as never, \{ vlagAan:/.test(index)
        && /'cloud-vnext'/.test(index) && /'verbindingen-centrum-v2'/.test(index));
    });

    // ================================================================================================ wolk-06
    await blok('wolk-06', async () => {
      const u = await mk('race');
      const lade: Lade = { userId: u, ruimte: 'prive' };
      const r = bestandenRoutes(u);
      check('wolk-06: db.patch bestaat (alleen de genoemde velden samenvoegen)', typeof (db as any).patch === 'function');
      if (typeof (db as any).patch === 'function') {
        const [pid] = await db.add('cloud_items_v1', [{ ownerUserId: u, ruimte: 'prive', kind: 'note', title: 'patch', a: 1, b: { c: 2 } }]);
        const gelukt = await (db as any).patch('cloud_items_v1', pid, { a: 5, nieuw: 'x\u0000y' });
        const [na] = await db.get<Record<string, any>>('cloud_items_v1', [pid!]);
        check('wolk-06: db.patch wijzigt alleen de genoemde velden; de rest blijft staan; onbekend id → false', gelukt === true && na?.a === 5 && na?.b?.c === 2 && na?.title === 'patch' && typeof na?.nieuw === 'string' && !na.nieuw.includes('\u0000')
          && (await (db as any).patch('cloud_items_v1', randomUUID(), { a: 1 })) === false && (await (db as any).patch('cloud_items_v1', pid, null)) === false, JSON.stringify(na));
        await db.delete('cloud_items_v1', [pid!]);
      }
      const inhoud = randomBytes(5000);
      const up = await upload(r, lade, 'race.bin', 'application/octet-stream', inhoud);
      const id = up.uit.bestand?.id as string;
      const echtRead = storage.read.bind(storage); const echtDeel = storage.leesDeel.bind(storage);
      // Tijdens het lezen van de bytes verandert een ANDER verzoek het record (prullenbak / hernoemen).
      let tussen: (() => Promise<unknown>) | null = null;
      (storage as any).read = async (...args: unknown[]) => { const t = tussen; tussen = null; if (t) await t(); return (echtRead as any)(...args); };
      (storage as any).leesDeel = async (...args: unknown[]) => { const t = tussen; tussen = null; if (t) await t(); return (echtDeel as any)(...args); };
      try {
        tussen = () => roep(r, V('bestand'), { actie: 'verwijder', id }, lade);
        const dl = await roep(r, V('download'), { id }, lade);
        const [na1] = await db.get<Record<string, any>>('cloud_items_v1', [id]);
        check('wolk-06: naar de prullenbak TIJDENS een download blijft in de prullenbak (download schreef vroeger het oude record terug)', dl.status === 200 && Buffer.from(dl.uit.data, 'base64').equals(inhoud) && typeof na1?.verwijderdOp === 'string' && na1.verwijderdOp.length > 0 && Number(na1?.openedAt) > 0, `verwijderdOp=${na1?.verwijderdOp} openedAt=${na1?.openedAt}`);
        await roep(r, V('bestand'), { actie: 'herstel', id }, lade);
        tussen = () => roep(r, V('bestand'), { actie: 'hernoem', id, naam: 'nieuwe-naam.bin' }, lade);
        const deel = await roep(r, V('download'), { id, offset: 0, lengte: 1000 }, lade);
        const [na2] = await db.get<Record<string, any>>('cloud_items_v1', [id]);
        check('wolk-06: hernoemen TIJDENS een download in delen blijft staan', deel.status === 200 && na2?.title === 'nieuwe-naam.bin', `${deel.status} ${na2?.title}`);
        const geopend = Number(na2?.openedAt);
        await new Promise((res) => setTimeout(res, 15));
        await roep(r, V('download'), { id, offset: 1000, lengte: 1000 }, lade);
        const [na3] = await db.get<Record<string, any>>('cloud_items_v1', [id]);
        check('wolk-06: alleen het EERSTE deel (offset 0) zet «geopend op»; de honderden volgende delen schrijven niets meer', Number(na3?.openedAt) === geopend, `${geopend} → ${na3?.openedAt}`);
      } finally { (storage as any).read = echtRead; (storage as any).leesDeel = echtDeel; }
    });

    // ================================================================================================ wolk-10
    await blok('wolk-10', async () => {
      const u = await mk('lek');
      const lade: Lade = { userId: u, ruimte: 'prive' };
      const r = bestandenRoutes(u); const t = takenRoutes(u);
      const up = await upload(r, lade, 'lek.bin', 'application/octet-stream', randomBytes(100));
      const GEHEIM_PAD = "ENOENT: no such file or directory, open '/srv/data/uploads/.vnext-sessies/proef/inhoud'";
      const echtDeel = storage.leesDeel.bind(storage);
      (storage as any).leesDeel = async () => { throw new Error(GEHEIM_PAD); };
      const stil = console.error; const gelogd: string[] = []; console.error = (...a: unknown[]) => { gelogd.push(a.map(String).join(' ')); };
      try {
        const fout1 = await roep(r, V('download'), { id: up.uit.bestand.id, offset: 0 }, lade);
        check('wolk-10: een interne fout (pad op schijf) komt NIET in het antwoord: vaste code CLOUD_VNEXT_FOUT + incidentnummer', fout1.status === 500 && fout1.uit.error === 'CLOUD_VNEXT_FOUT' && /^[0-9a-f]{8}$/.test(String(fout1.uit.incident || '')) && !/srv|ENOENT|uploads/.test(fout1.rauw), fout1.rauw.slice(0, 160));
        check('wolk-10: de volledige tekst staat wel in het serverlogboek, met hetzelfde incidentnummer', gelogd.some((g) => g.includes(String(fout1.uit.incident)) && g.includes('ENOENT')));
        takenProef.zetDriveToegang(async () => { throw new Error('relation "app.geheime_tabel" does not exist'); });
        const fout2 = await roep(t, V('taken'), { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: 'acc-1', id: 'x' }, doel: { dienst: 'eigen' } }, lade);
        check('wolk-10: hetzelfde voor de taken-route (PostgreSQL-tekst blijft binnen)', fout2.status === 500 && fout2.uit.error === 'CLOUD_VNEXT_FOUT' && !/relation|geheime_tabel/.test(fout2.rauw), fout2.rauw.slice(0, 160));
      } finally { (storage as any).leesDeel = echtDeel; console.error = stil; takenProef.zetDriveToegang(async () => null); }
      const dlKlein = await roep(r, V('download'), { id: randomUUID() }, lade);
      check('wolk-10: contractcodes blijven wat ze waren (BESTAND_ONBEKEND 404)', dlKlein.status === 404 && dlKlein.uit.error === 'BESTAND_ONBEKEND');
      const bronI = lees('backend/cloud-vnext-integraties.ts');
      check('wolk-10 (bron): ook de integraties-route geeft geen ruwe err.message meer terug', !/String\(\(err as Error\)\?\.message \|\| 'CLOUD_VNEXT_FOUT'\)\.slice\(0, 80\)/.test(bronI) && !/fout: String\(\(caught as Error\)\?\.message/.test(bronI));
      const hulp = await import('../../backend/cloud-vnext-fout').catch(() => null) as any;
      check('wolk-10: de gedeelde hulpfunctie laat alleen vaste codes door', !!hulp && hulp.veiligeFoutcode(new Error('TE_GROOT'), 'X_FOUT') === 'TE_GROOT' && hulp.veiligeFoutcode(new Error('duplicate key value violates unique constraint "records_pkey"'), 'X_FOUT') === 'X_FOUT' && hulp.veiligeFoutcode(null, 'X_FOUT') === 'X_FOUT');
    });

    // ================================================================================================ aanv-ronde1-05
    await blok('aanv-ronde1-05', async () => {
      const G = (fotoModel as any).gelijkendeGroepen as (i: Array<Record<string, unknown>>, d?: number, m?: number) => string[][];
      const H = (fotoModel as any).hamming as (a: string, b: string) => number;
      // Referentie: de oude, trage maar eenvoudige regel (alle paren, bit voor bit).
      const hamRef = (a: string, b: string) => { if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64; let d = 0; for (let k = 0; k < 16; k++) { let x = parseInt(a[k], 16) ^ parseInt(b[k], 16); while (x) { d += x & 1; x >>= 1; } } return d; };
      const refGroepen = (items: Array<{ id: string; dhash?: string }>, drempel = 6) => {
        const ouder = items.map((_, k) => k); const w = (k: number): number => (ouder[k] === k ? k : (ouder[k] = w(ouder[k])));
        for (let x = 0; x < items.length; x++) for (let y = x + 1; y < items.length; y++) if (items[x].dhash && items[y].dhash && hamRef(items[x].dhash!, items[y].dhash!) <= drempel) ouder[w(x)] = w(y);
        const m = new Map<number, string[]>(); items.forEach((i, k) => (m.get(w(k)) || m.set(w(k), []).get(w(k))!).push(i.id));
        return [...m.values()].filter((g) => g.length > 1);
      };
      const norm = (gs: string[][]) => gs.map((g) => [...g].sort().join(',')).sort().join('|');
      const hex16 = () => randomBytes(8).toString('hex');
      const flip = (h: string, n: number) => { let b = BigInt('0x' + h); const gezien = new Set<number>(); while (gezien.size < n) gezien.add(Math.floor(Math.random() * 64)); for (const i of gezien) b ^= 1n << BigInt(i); return b.toString(16).padStart(16, '0'); };
      // 1. hamming: zelfde uitkomst als de referentie, ook voor ongeldige invoer
      const paren = [...Array(400)].map(() => { const a = hex16(); return [a, Math.random() < 0.5 ? flip(a, Math.floor(Math.random() * 20)) : hex16()] as const; });
      check('aanv-ronde1-05: hamming geeft exact dezelfde afstand als de oude regel (400 paren + ongeldige invoer = 64)', paren.every(([a, b]) => H(a, b) === hamRef(a, b)) && H('zz', hex16()) === 64 && H('ABCDEF0123456789', '0000000000000000') === 64);
      // 2. zelfde groepen als «alle paren» op een geclusterde verzameling (afstanden rond de drempel)
      const items: Array<{ id: string; dhash?: string }> = [];
      for (let c = 0; c < 60; c++) { const basis = hex16(); for (let j = 0; j < 12; j++) items.push({ id: `c${c}-${j}`, dhash: flip(basis, Math.floor(Math.random() * 9)) }); }
      for (let j = 0; j < 80; j++) items.push({ id: `los-${j}`, ...(j % 4 ? { dhash: hex16() } : {}) });
      check('aanv-ronde1-05: de groepen zijn exact gelijk aan die van «alle paren» (800 afdrukken rond de drempel 6)', norm(G(items)) === norm(refGroepen(items)));
      check('aanv-ronde1-05: ook met een andere drempel (3 en 10) dezelfde groepen', norm(G(items, 3)) === norm(refGroepen(items, 3)) && norm(G(items, 10)) === norm(refGroepen(items, 10)));
      // 3. tijd: 6000 willekeurige afdrukken (vroeger ~17-20 s synchroon) en het ongunstigste geval (één band gelijk voor iedereen)
      const zesduizend = [...Array(6000)].map((_, k) => ({ id: `z${k}`, dhash: hex16(), genomenOp: new Date(1_600_000_000_000 + k * 60_000).toISOString(), camera: 'X' }));
      let t0 = performance.now(); G(zesduizend); const t6000 = performance.now() - t0;
      check('aanv-ronde1-05: 6000 foto’s met afdruk → gelijkendeGroepen < 1000 ms (was ~17-20 s)', t6000 < 1000, `${t6000.toFixed(0)} ms`);
      const zelfdeBand = [...Array(6000)].map((_, k) => ({ id: `b${k}`, dhash: '00' + randomBytes(7).toString('hex') }));
      t0 = performance.now(); G(zelfdeBand); const tBand = performance.now() - t0;
      check('aanv-ronde1-05: ongunstigste geval (6000 afdrukken met een gelijke band) blijft < 2000 ms', tBand < 2000, `${tBand.toFixed(0)} ms`);
      // 4. de route: een tweede «Упорядкувати» van dezelfde mens terwijl de eerste loopt → 429 BEZIG; een ander account niet
      const u = await mk('organiseer'); const v = await mk('organiseer-b');
      const lade: Lade = { userId: u, ruimte: 'prive' };
      const maak = (id: string) => (fotoMod.fotoDienstRoutes as any)(async () => ({ user: { id, role: 'member', status: 'approved' }, service: 'cloud' }), { vlagAan: async () => true }) as RouteMap;
      const rijen = [...Array(1500)].map((_, k) => ({ ...lade, ownerUserId: u, naam: `f${k}.jpg`, mime: 'image/jpeg', bytes: 10, sha256: '', opslag: 'eigen', storagePath: '', dhash: hex16(), createdAt: Date.now(), updatedAt: Date.now() }));
      for (let k = 0; k < rijen.length; k += 200) await db.add('foto_media_v1', rijen.slice(k, k + 200));
      const rU = maak(u);
      t0 = performance.now();
      const [een, twee, ander] = await Promise.all([roep(rU, F('organiseer'), {}, lade), roep(rU, F('organiseer'), {}, lade), roep(maak(v), F('organiseer'), {}, { userId: v, ruimte: 'prive' })]);
      const tRoute = performance.now() - t0;
      check('aanv-ronde1-05: organiseer met 1500 foto’s antwoordt; een gelijktijdige tweede van dezelfde mens → 429 BEZIG; een ander account gewoon 200', een.status === 200 && Array.isArray(een.uit.gelijkend) && twee.status === 429 && twee.uit.error === 'BEZIG' && ander.status === 200, `${een.status} ${twee.status} ${ander.status} (${tRoute.toFixed(0)} ms)`);
      check('aanv-ronde1-05: daarna kan dezelfde mens weer (de markering is weg)', (await roep(rU, F('organiseer'), {}, lade)).status === 200);
    });

    // ================================================================================================ aanv-ronde1-09
    await blok('aanv-ronde1-09', async () => {
      const u = await mk('sessie-race'); const w = await mk('sessie-race-b');
      const lade: Lade = { userId: u, ruimte: 'prive' }; const ladeW: Lade = { userId: w, ruimte: 'prive' };
      const r = bestandenRoutes(u); const rW = bestandenRoutes(w);
      vnextProef.wisSessieGeheugen();
      const boom = join(uploads, '.vnext-sessies'); mkdirSync(boom, { recursive: true });
      check('aanv-ronde1-09: de proefhaken bestaan (volledigeRondeNu, opruimenNu)', typeof vnextProef.volledigeRondeNu === 'function' && typeof vnextProef.opruimenNu === 'function');
      if (typeof vnextProef.volledigeRondeNu !== 'function' || typeof vnextProef.opruimenNu !== 'function') return;
      // 1. een map ZONDER sessie.json die net is aangemaakt (= een «begin» tussen mkdir en sessie.json) blijft staan;
      //    een oude wees zonder sessie.json verdwijnt wel.
      const jong = randomUUID(); mkdirSync(join(boom, jong)); writeFileSync(join(boom, jong, 'inhoud'), '');
      const oud = randomUUID(); mkdirSync(join(boom, oud)); writeFileSync(join(boom, oud, 'inhoud'), '');
      const lang = new Date(Date.now() - 20 * 60_000); utimesSync(join(boom, oud), lang, lang);
      vnextProef.volledigeRondeNu();
      await roep(rW, V('upload'), { actie: 'begin', naam: 'trigger.bin', mime: 'application/octet-stream', bytes: 10 }, ladeW);
      check('aanv-ronde1-09: een verse sessiemap zonder sessie.json (begin bezig) wordt door het opruimen van een ander verzoek NIET gewist', existsSync(join(boom, jong)));
      check('aanv-ronde1-09: een wees zonder sessie.json die ouder is dan 10 minuten wordt wel opgeruimd', !existsSync(join(boom, oud)));
      // 2. «begin» terwijl een volledige opruimronde loopt: de nieuwe sessie overleeft, telkens (30 keer)
      let verloren = 0;
      for (let i = 0; i < 30; i++) {
        vnextProef.volledigeRondeNu();
        const [b] = await Promise.all([roep(r, V('upload'), { actie: 'begin', naam: `race-${i}.bin`, mime: 'application/octet-stream', bytes: 10 }, lade), vnextProef.opruimenNu(), roep(rW, V('upload'), { actie: 'status', id: randomUUID() }, ladeW)]);
        const st = b.status === 200 ? await roep(r, V('upload'), { actie: 'stuk', id: b.uit.id, offset: 0, data: Buffer.alloc(10, 1).toString('base64') }, lade) : b;
        if (st.status !== 200) verloren += 1;
        if (b.uit.id) await roep(r, V('upload'), { actie: 'afbreken', id: b.uit.id }, lade);
      }
      check('aanv-ronde1-09: 30 keer «begin» tijdens een opruimronde → elke nieuwe sessie neemt daarna gewoon een stuk aan', verloren === 0, `${verloren} verloren`);
      vnextProef.wisSessieGeheugen();
    });

    // ================================================================================================ toets-g10d №2
    // Quota: tussen het oordeel (database) en sessies.set zat een await; gelijktijdige «begin» van één mens zagen allemaal «vóór».
    await blok('toets-2', async () => {
      const u = await mk('quota-race');
      const lade: Lade = { userId: u, ruimte: 'prive' };
      const r = bestandenRoutes(u);
      vnextProef.wisSessieGeheugen();
      const vorige = process.env.CLOUD_EIGEN_QUOTA_BYTES;
      process.env.CLOUD_EIGEN_QUOTA_BYTES = '1000';
      try {
        const zes = await Promise.all([...Array(6)].map((_, i) => roep(r, V('upload'), { actie: 'begin', naam: `q${i}.bin`, mime: 'application/octet-stream', bytes: 600 }, lade)));
        const ja = zes.filter((x) => x.status === 200);
        check('toets-g10d №2: zes gelijktijdige «begin» van 600 bytes onder quota 1000 → precies één aangenomen, de rest QUOTA_BEREIKT', ja.length === 1 && zes.filter((x) => x.uit.error === 'QUOTA_BEREIKT').length === 5, zes.map((x) => `${x.status}:${x.uit.error ?? ''}`).join(' '));
        for (const x of ja) await roep(r, V('upload'), { actie: 'afbreken', id: x.uit.id }, lade);
        const vier = await Promise.all([...Array(4)].map((_, i) => roep(r, V('upload'), { actie: 'begin', naam: `k${i}.bin`, mime: 'application/octet-stream', bytes: 300 }, lade)));
        check('toets-g10d №2: vier gelijktijdige «begin» van 300 bytes → precies drie (900 ≤ 1000)', vier.filter((x) => x.status === 200).length === 3, vier.map((x) => x.status).join(' '));
        for (const x of vier) if (x.uit.id) await roep(r, V('upload'), { actie: 'afbreken', id: x.uit.id }, lade);
      } finally { if (vorige === undefined) delete process.env.CLOUD_EIGEN_QUOTA_BYTES; else process.env.CLOUD_EIGEN_QUOTA_BYTES = vorige; vnextProef.wisSessieGeheugen(); }
    });

    // ================================================================================================ toets-g10d №1 (na de onafhankelijke controle)
    // De rekening van «beloofde» bytes (wolk-04) maakte een aankondiging gratis: één «begin» van bijna de hele vrije schijf zonder
    // één byte te sturen gaf alle anderen 48 uur lang SCHIJF_VOL.
    await blok('toets-1', async () => {
      const a = await mk('belofte-a'); const b = await mk('belofte-b');
      const ladeA: Lade = { userId: a, ruimte: 'prive' }; const ladeB: Lade = { userId: b, ruimte: 'prive' };
      const rA = bestandenRoutes(a); const rB = bestandenRoutes(b);
      const GiB = 1024 * MiB;
      vnextProef.wisSessieGeheugen();
      vnextProef.zetVrijeBytes(async () => 4 * GiB);
      const groot = await roep(rA, V('upload'), { actie: 'begin', naam: 'alles.bin', mime: 'application/octet-stream', bytes: 4 * GiB - 256 * MiB - MiB }, ladeA); // bijna alles (1 MiB marge voor sessies van eerdere blokken)
      const klein = await roep(rB, V('upload'), { actie: 'begin', naam: 'klein.bin', mime: 'application/octet-stream', bytes: MiB }, ladeB);
      check('toets-g10d №1: A kondigt bijna de hele schijf aan en zwijgt → B kan toch een gewoon bestand beginnen', groot.status === 200 && klein.status === 200, `${groot.status} ${klein.status} ${klein.uit.error ?? ''}`);
      const eigen = await roep(rA, V('upload'), { actie: 'begin', naam: 'nog.bin', mime: 'application/octet-stream', bytes: 2 * MiB }, ladeA);
      check('toets-g10d №1: de EIGEN aankondigingen van A tellen nog volledig mee (tweede «begin» van A past niet → SCHIJF_VOL)', eigen.status === 400 && eigen.uit.error === 'SCHIJF_VOL', `${eigen.status} ${eigen.uit.error ?? ''}`);
      if (klein.uit.id) await roep(rB, V('upload'), { actie: 'afbreken', id: klein.uit.id }, ladeB);
      vnextProef.wisSessieGeheugen(); // herstart: de sessie van A komt van schijf terug
      const naHerstart = await roep(rB, V('upload'), { actie: 'begin', naam: 'klein2.bin', mime: 'application/octet-stream', bytes: MiB }, ladeB);
      check('toets-g10d №1: ook na een herstart blokkeert de zwijgende aankondiging van A niemand', naHerstart.status === 200, `${naHerstart.status} ${naHerstart.uit.error ?? ''}`);
      // Korte termijn voor een sessie zonder één ontvangen byte; een sessie die vordert houdt de lange termijn.
      const loopt = await roep(rB, V('upload'), { actie: 'begin', naam: 'loopt.bin', mime: 'application/octet-stream', bytes: 2 * vnextModel.CLOUD_VNEXT_LIMIETEN.stukMaxBytes }, ladeB);
      const stuk = await roep(rB, V('upload'), { actie: 'stuk', id: loopt.uit.id, offset: 0, data: Buffer.alloc(vnextModel.CLOUD_VNEXT_LIMIETEN.stukMaxBytes, 3).toString('base64') }, ladeB);
      vnextProef.volledigeRondeNu();
      await vnextProef.opruimenNu(Date.now() + 2 * 3600_000 + 60_000);
      const boom = join(uploads, '.vnext-sessies');
      check('toets-g10d №1: een sessie zonder één ontvangen byte verdwijnt na 2 uur stilte (map én reservering)', !existsSync(join(boom, String(groot.uit.id))) && !existsSync(join(boom, String(naHerstart.uit.id))));
      check('toets-g10d №1: een sessie die al bytes ontving blijft (lange termijn voor wie vordert)', stuk.status === 200 && existsSync(join(boom, String(loopt.uit.id))), `${stuk.status}`);
      if (loopt.uit.id) await roep(rB, V('upload'), { actie: 'afbreken', id: loopt.uit.id }, ladeB);
      vnextProef.zetVrijeBytes(null);
      vnextProef.wisSessieGeheugen();
    });
  } finally {
    globalThis.fetch = echteFetch;
    takenProef.zetKlok(false);
    try { vnextProef.zetVrijeBytes(null); } catch { /* n.v.t. */ }
    for (const tbl of ['cloud_items_v1', 'cloud_mappen_v1', 'cloud_taken_v1', 'foto_media_v1', 'foto_albums_v1', 'foto_import_v1']) await pool.query(`DELETE FROM app.records WHERE tbl = $1 AND data->>'ownerUserId' = ANY($2)`, [tbl, gebruikers]).catch(() => undefined);
    await pool.query('DELETE FROM app.storage_objects WHERE owner_id = ANY($1::text[])', [gebruikers]).catch(() => undefined);
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [gebruikers]).catch(() => undefined);
    if (vorigeUploads === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = vorigeUploads;
  }
  return einde();
}
