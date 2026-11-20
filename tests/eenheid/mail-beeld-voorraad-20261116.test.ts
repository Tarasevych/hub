// MAILBEELD-001 (16.11.2026) — «Завантажувати при отриманні (приватно)» (migratie 0296, backend/mail-beelden-voorraad.ts,
// routes in backend/google-suite-mail-browser.ts, keuze in src/mail/WeergaveKeuze.tsx). Bewijst op een echte PostgreSQL:
//   1. welke adressen uit een brief komen (img src, background, entiteiten; geen http/data/cid; uniek; hoogstens 30);
//   2. standaard UIT: niets opgehaald, niets bewaard; aanzetten en uitzetten op elk moment (ook terug);
//   3. Spam, Prullenbak, Verzonden en Concepten: nooit iets opgehaald;
//   4. aan: elk beeld één keer opgehaald en bewaard, de URL zelf staat NERGENS in de database (alleen HMAC);
//      een mislukte ophaling wordt een negatieve rij en niet opnieuw gevraagd;
//   5. sleutelkluis aan + open: alleen dek1-envelop (data NULL), terug te lezen; dicht: NIETS bewaard, de brief wacht in de
//      wachtrij (alleen het id), en na het openen haalt de onderhoudsronde hem alsnog op;
//   6. herversleutelen zet oude onversleutelde rijen om; wissen wist voorraad en wachtrij, de keuze blijft;
//   7. de routes: stand, instelling (ook een kijker kan niets wijzigen), wissen; de beeldproxy kijkt eerst in de voorraad;
//   8. de bron: het leesvenster vraagt in de stand «Питати» eerst de voorraad (alleenVoorraad) en nooit buiten.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-beeld-voorraad-20261116');
  const vorigePepper = process.env.AUDIT_IP_PEPPER;
  if (String(process.env.AUDIT_IP_PEPPER || '').length < 32) process.env.AUDIT_IP_PEPPER = randomBytes(32).toString('hex');
  process.env.SLEUTELKLUIS_SLEUTEL_V1 = process.env.SLEUTELKLUIS_SLEUTEL_V1 || randomBytes(32).toString('base64');
  const pool = getPool('systeem');
  const sk = await import('../../backend/sleutelkluis');
  sk.zetHouderControle(async () => true);
  const v = await import('../../backend/mail-beelden-voorraad');
  const T = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const U = `beeld-${T}`;
  const lade = { userId: U, ruimte: 'prive' as const };
  const png = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32 + n, n)]);
  const gevraagd: string[] = [];
  const haal: import('../../backend/mail-beelden-voorraad').Haal = async (url) => {
    gevraagd.push(url);
    if (url.includes('kapot')) throw new Error('GOOGLE_MAIL_READER_IMAGE_FETCH_FAILED');
    return { bytes: png(url.length % 50), contentType: 'image/png' };
  };
  const html = (id: string) => `<html><body>
    <img src="https://img.example.test/logo.png?u=${id}&amp;t=geheim-volgcode-${id}" alt="logo">
    <IMG SRC='https://img.example.test/kop.jpg'>
    <img src="https://img.example.test/kop.jpg">
    <table background="https://img.example.test/achtergrond.png"><tr><td>x</td></tr></table>
    <img src="http://onveilig.example.test/a.png"><img src="data:image/png;base64,AAAA"><img src="cid:inline-1">
    <img src="https://kapot.example.test/pixel.gif?id=${id}">
  </body></html>`;
  const telRijen = async (where = '') => Number((await pool.query(`SELECT count(*)::int AS n FROM app.mail_beeld_voorraad WHERE user_id = $1 ${where}`, [U])).rows[0].n);
  try {
    // ------------------------------------------------------------------ 1. adressen uit de brief
    {
      const urls = v.beeldUrlsUitHtml(html('a1'));
      check('1: https-beelden uit <img src> (ook HOOFDLETTERS, enkele quotes) en background=, entiteiten ontcijferd, uniek, in volgorde',
        JSON.stringify(urls) === JSON.stringify(['https://img.example.test/logo.png?u=a1&t=geheim-volgcode-a1', 'https://img.example.test/kop.jpg', 'https://img.example.test/achtergrond.png', 'https://kapot.example.test/pixel.gif?id=a1']), JSON.stringify(urls));
      const veel = `<div>${Array.from({ length: 50 }, (_, i) => `<img src="https://x.example.test/${i}.png">`).join('')}</div>`;
      check('1: hoogstens 30 per brief', v.beeldUrlsUitHtml(veel).length === 30);
      check('1: geen http, data: of cid: — en een brief zonder beelden geeft niets', v.beeldUrlsUitHtml('<img src="http://a.test/x.png"><img src="cid:x"><p>tekst</p>').length === 0);
      check('1: dezelfde vorm als de beeldproxy (NUL weg, getrimd)', v.normaliseerUrl(' https://a.test/x\u0000.png ') === 'https://a.test/x.png');
    }

    // ------------------------------------------------------------------ 2. standaard uit
    {
      const vk = await v.voorkeurVan(lade);
      check('2: standaard UIT («Питати»)', vk.bijOntvangst === false && vk.aanSinds === 0);
      const u = await v.beeldenBijOntvangst(lade, 'acc1', { berichtId: 'msg_uit_1', labelIds: ['INBOX'], htmlBody: html('b1') }, haal);
      check('2: uit → niets opgehaald, niets bewaard', u.status === 'uit' && gevraagd.length === 0 && (await telRijen()) === 0, JSON.stringify(u));
      const aan = await v.zetVoorkeur(lade, true);
      const nogEens = await v.zetVoorkeur(lade, true);
      check('2: aanzetten bewaart de keuze en het moment; nogmaals aanzetten verschuift «sinds» niet', aan.bijOntvangst && aan.aanSinds > 0 && nogEens.aanSinds === aan.aanSinds);
      const uit = await v.zetVoorkeur(lade, false);
      const weer = await v.zetVoorkeur(lade, true);
      check('2: uit en weer aan — op elk moment', uit.bijOntvangst === false && uit.aanSinds === 0 && weer.bijOntvangst === true);
    }

    // ------------------------------------------------------------------ 3. labels die nooit tellen
    for (const label of ['SPAM', 'TRASH', 'SENT', 'DRAFT']) {
      const u = await v.beeldenBijOntvangst(lade, 'acc1', { berichtId: `msg_${label}`, labelIds: [label, 'UNREAD'], htmlBody: html(label) }, haal);
      check(`3: ${label} → overgeslagen, geen enkel verzoek`, u.status === 'overgeslagen' && gevraagd.length === 0, JSON.stringify(u));
    }

    // ------------------------------------------------------------------ 4. aan: ophalen en bewaren
    {
      const u = await v.beeldenBijOntvangst(lade, 'acc1', { berichtId: 'msg_in_1', labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'], htmlBody: html('c1') }, haal);
      check('4: vier adressen, drie opgehaald en bewaard, één mislukt', u.status === 'klaar' && u.opgehaald === 3 && u.mislukt === 1 && gevraagd.length === 4, JSON.stringify(u));
      check('4: drie beelden + één negatieve rij in de voorraad', (await telRijen('AND fout IS NULL AND data IS NOT NULL')) === 3 && (await telRijen('AND fout IS NOT NULL')) === 1);
      const dump = JSON.stringify((await pool.query('SELECT * FROM app.mail_beeld_voorraad WHERE user_id = $1', [U])).rows);
      check('4: de URL (met de volgcode) staat nergens in de database — alleen HMAC', !dump.includes('geheim-volgcode') && !dump.includes('img.example.test') && !dump.includes('kapot.example.test'));
      const terug = await v.beeldUitVoorraad(lade, 'https://img.example.test/kop.jpg');
      check('4: terug te lezen, zelfde bytes', !!terug && 'inhoud' in terug && terug.mime === 'image/png' && terug.inhoud.equals(png('https://img.example.test/kop.jpg'.length % 50)));
      check('4: onbekend adres → null; mislukt adres → fout', (await v.beeldUitVoorraad(lade, 'https://nooit.example.test/x.png')) === null
        && 'fout' in ((await v.beeldUitVoorraad(lade, 'https://kapot.example.test/pixel.gif?id=c1')) || {}));
      const voor = gevraagd.length;
      const tweede = await v.beeldenBijOntvangst(lade, 'acc1', { berichtId: 'msg_in_2', labelIds: ['INBOX'], htmlBody: html('c1') }, haal);
      check('4: een tweede brief met dezelfde beelden vraagt niets opnieuw (ook het mislukte niet)', gevraagd.length === voor && tweede.bekend === 4, JSON.stringify(tweede));
      const ander = await v.beeldenBijOntvangst({ userId: `${U}-ander`, ruimte: 'prive' }, 'acc9', { berichtId: 'msg_x', labelIds: ['INBOX'], htmlBody: html('c1') }, haal);
      check('4: een andere mens met dezelfde keuze uit → niets (de voorraad is per mens)', ander.status === 'uit' && (await v.beeldUitVoorraad({ userId: `${U}-ander`, ruimte: 'prive' }, 'https://img.example.test/kop.jpg')) === null);
      check('4: de technische ruimte ziet de persoonlijke voorraad niet', (await v.beeldUitVoorraad({ userId: U, ruimte: 'technisch' }, 'https://img.example.test/kop.jpg')) === null);
      const omvang = await v.voorraadOmvang(lade);
      check('4: omvang telt alleen geslaagde beelden', omvang.aantal === 3 && omvang.bytes > 0 && omvang.wachtrij === 0, JSON.stringify(omvang));
    }

    // ------------------------------------------------------------------ 5. sleutelkluis
    {
      // oude (onversleutelde) rijen bestaan al; nu de kluis aan
      await sk.inschakelen(lade, { soort: 'sessie', id: `s-${T}` });
      const u = await v.beeldenBijOntvangst(lade, 'acc1', { berichtId: 'msg_kluis_1', labelIds: ['INBOX'], htmlBody: '<img src="https://img.example.test/nieuw-onder-dek.png">' }, haal);
      const rij = (await pool.query('SELECT data, data_versleuteld FROM app.mail_beeld_voorraad WHERE user_id = $1 AND url_hash = $2', [U, v.urlHash('https://img.example.test/nieuw-onder-dek.png')])).rows[0];
      check('5: kluis aan en open → alleen een dek1-envelop, data NULL', u.opgehaald === 1 && rij && rij.data === null && /^dek1\./.test(String(rij.data_versleuteld)), JSON.stringify(u));
      const terug = await v.beeldUitVoorraad(lade, 'https://img.example.test/nieuw-onder-dek.png');
      check('5: met open sleutel terug te lezen', !!terug && 'inhoud' in terug && terug.inhoud.length > 8);
      sk.sleutelVergrendelen(lade);
      check('5: sleutel dicht → het versleutelde beeld is «gesloten», niet leesbaar', JSON.stringify(await v.beeldUitVoorraad(lade, 'https://img.example.test/nieuw-onder-dek.png')) === JSON.stringify({ gesloten: true }));
      const voor = gevraagd.length;
      const dicht = await v.beeldenBijOntvangst(lade, 'acc1', { berichtId: 'msg_kluis_dicht', labelIds: ['INBOX'], htmlBody: '<img src="https://img.example.test/later.png?k=volgcode-later">' }, haal);
      const wacht = (await pool.query('SELECT * FROM app.mail_beeld_wachtrij WHERE user_id = $1', [U])).rows;
      check('5: sleutel dicht → NIETS opgehaald of bewaard, de brief wacht (alleen het id, geen URL)', dicht.status === 'gesloten' && gevraagd.length === voor && wacht.length === 1 && wacht[0].bericht_id === 'msg_kluis_dicht' && !JSON.stringify(wacht).includes('later.png'), JSON.stringify(dicht));
      const leeg = await v.wachtrijVerwerken(U, async () => ({ berichtId: 'msg_kluis_dicht', labelIds: ['INBOX'], htmlBody: '<img src="https://img.example.test/later.png?k=volgcode-later">' }), haal);
      check('5: onderhoudsronde met dichte sleutel laat de brief staan (geen poging verbruikt)', leeg.verwerkt === 0 && leeg.open === 1 && Number((await pool.query('SELECT pogingen FROM app.mail_beeld_wachtrij WHERE user_id = $1', [U])).rows[0].pogingen) === 0);
      // opnieuw openen na een dichte sleutel: op een tweede mens met de herstelcode (de weg van «Розблокувати»)
      const U2 = `${U}-2`, lade2 = { userId: U2, ruimte: 'prive' as const };
      await v.zetVoorkeur(lade2, true);
      const { herstelcode } = await sk.inschakelen(lade2, { soort: 'sessie', id: `s2-${T}` });
      sk.sleutelVergrendelen(lade2);
      const d2 = await v.beeldenBijOntvangst(lade2, 'acc2', { berichtId: 'msg_wacht_2', labelIds: ['INBOX'], htmlBody: '<img src="https://img.example.test/wacht.png">' }, haal);
      await sk.ontgrendelMetHerstelcode(lade2, herstelcode, { soort: 'sessie', id: `s3-${T}` });
      const na = await v.wachtrijVerwerken(U2, async (acc, id) => (acc === 'acc2' && id === 'msg_wacht_2' ? { berichtId: id, labelIds: ['INBOX'], htmlBody: '<img src="https://img.example.test/wacht.png">' } : null), haal);
      const r2 = await v.beeldUitVoorraad(lade2, 'https://img.example.test/wacht.png');
      check('5: na het openen haalt de onderhoudsronde de wachtende brief alsnog op (versleuteld) en leegt de wachtrij',
        d2.status === 'gesloten' && na.verwerkt === 1 && na.open === 0 && !!r2 && 'inhoud' in r2, JSON.stringify({ d2, na }));
      const weg = await v.wachtrijVerwerken(U2, async () => null, haal);
      check('5: een lege wachtrij doet niets', weg.verwerkt === 0 && weg.open === 0);
      await pool.query('DELETE FROM app.mail_beeld_voorraad WHERE user_id = $1', [U2]);
      await pool.query('DELETE FROM app.mail_beeld_voorkeur WHERE user_id = $1', [U2]);
    }

    // ------------------------------------------------------------------ 6. herversleutelen en wissen
    {
      check('6: herversleutelaar is geregistreerd en het register heeft een «dek»-regel', sk.geregistreerdeHerversleutelaars().includes('app.mail_beeld_voorraad') && !sk.registerZonderHerversleutelaar().includes('app.mail_beeld_voorraad'));
      const U3 = `${U}-3`, lade3 = { userId: U3, ruimte: 'prive' as const };
      await v.zetVoorkeur(lade3, true);
      await v.beeldenBijOntvangst(lade3, 'acc3', { berichtId: 'msg_h_1', labelIds: ['INBOX'], htmlBody: '<img src="https://img.example.test/h1.png"><img src="https://img.example.test/h2.png">' }, haal);
      const { herstelcode } = await sk.inschakelen(lade3, { soort: 'sessie', id: `s4-${T}` });
      void herstelcode;
      const uit = await sk.herversleutelen(lade3, {});
      const tabel = uit.tabellen.find((x) => x.tabel === 'app.mail_beeld_voorraad');
      const plat = Number((await pool.query('SELECT count(*)::int AS n FROM app.mail_beeld_voorraad WHERE user_id = $1 AND data IS NOT NULL', [U3])).rows[0].n);
      check('6: «Перешифрувати мої дані зараз» zet oude rijen onder de DEK', !!tabel && tabel.herversleuteld === 2 && plat === 0, JSON.stringify(tabel));
      const h1 = await v.beeldUitVoorraad(lade3, 'https://img.example.test/h1.png');
      check('6: na herversleutelen nog leesbaar', !!h1 && 'inhoud' in h1);
      const gewist = await v.voorraadWissen(lade3);
      check('6: wissen wist alles van deze mens; de keuze blijft', gewist === 2 && (await v.voorraadOmvang(lade3)).aantal === 0 && (await v.voorkeurVan(lade3)).bijOntvangst === true);
      await pool.query('DELETE FROM app.mail_beeld_voorkeur WHERE user_id = $1', [U3]);
    }

    // ------------------------------------------------------------------ 7. opruimen
    {
      await pool.query(`UPDATE app.mail_beeld_voorraad SET laatst_gebruikt = now() - interval '200 days' WHERE user_id = $1 AND url_hash = $2`, [U, v.urlHash('https://img.example.test/achtergrond.png')]);
      const n = await v.voorraadOpruimen(lade);
      check('7: ongebruikt sinds > 180 dagen wordt opgeruimd, de rest blijft', n === 1 && (await v.beeldUitVoorraad(lade, 'https://img.example.test/achtergrond.png')) === null && (await telRijen()) >= 3, String(n));
    }

    // ------------------------------------------------------------------ 8. routes
    {
      const { createGoogleSuiteMailBrowserRoutes } = await import('../../backend/google-suite-mail-browser');
      const { metLade } = await import('../../backend/mail-ruimte');
      let user: Record<string, unknown> = { id: U, email: 'beeld@example.test', name: 'B', role: 'owner', status: 'approved', accessLevel: 'full' };
      const routes = createGoogleSuiteMailBrowserRoutes(async () => ({ service: 'mail', user }) as never) as Record<string, any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const roep = async (pad: string, body: Record<string, unknown> = {}) => metLade({ userId: String(user.id), ruimte: 'prive' }, 'mail', async () => {
        for (const stap of routes[`POST /api/owner/mail/google-suite/${pad}`]) { const r = await stap({ event: { headers: {} }, body, params: {} }); if (r) return { status: r.statusCode as number, data: JSON.parse(r.body || '{}') }; }
        return { status: 0, data: {} };
      });
      const stand = await roep('reader/beelden-voorraad');
      check('8: stand: aan, aantal en grootte (geen URL\'s)', stand.status === 200 && stand.data.bijOntvangst === true && stand.data.aantal >= 3 && !JSON.stringify(stand.data).includes('example.test'), JSON.stringify(stand.data));
      const fout = await roep('reader/beelden-voorraad/instelling', { bijOntvangst: 'ja' });
      check('8: instelling zonder boolean → 400', fout.status === 400);
      const uit = await roep('reader/beelden-voorraad/instelling', { bijOntvangst: false });
      const aan = await roep('reader/beelden-voorraad/instelling', { bijOntvangst: true });
      check('8: instelling uit en weer aan via de route', uit.status === 200 && uit.data.bijOntvangst === false && aan.data.bijOntvangst === true);
      user = { id: `kijker-${T}`, email: 'k@example.test', name: 'K', role: 'viewer', status: 'approved', accessLevel: 'limited' };
      const kijker = await roep('reader/beelden-voorraad/instelling', { bijOntvangst: true });
      const kijkerWis = await roep('reader/beelden-voorraad/wissen');
      const kijkerLees = await roep('reader/beelden-voorraad');
      check('8: een kijker kan de keuze niet wijzigen en niets wissen (403), wel de eigen stand lezen', kijker.status === 403 && kijkerWis.status === 403 && kijkerLees.status === 200 && kijkerLees.data.bijOntvangst === false, `${kijker.status}/${kijkerWis.status}/${kijkerLees.status}`);
      user = { id: U, email: 'beeld@example.test', name: 'B', role: 'owner', status: 'approved', accessLevel: 'full' };
      const wis = await roep('reader/beelden-voorraad/wissen');
      check('8: wissen via de route', wis.status === 200 && wis.data.aantal === 0 && wis.data.gewist >= 3 && wis.data.bijOntvangst === true, JSON.stringify(wis.data));
    }

    // ------------------------------------------------------------------ 9. bron: leesvenster, proxy en synchronisatie
    {
      const lezer = readFileSync('src/MailBerichtTekst.tsx', 'utf8');
      check('9: leesvenster — zonder toestemming eerst de voorraad (alleenVoorraad), anders verborgen; nooit de gewone proxy',
        /if\(uitVoorraad&&!externToestaan&&\/\^https:\/i\.test\(source\)&&!inlineVan\(source\)\)\{try\{const blob=await remoteBlob\(context,accountId,source,true\)/.test(lezer)
        && lezer.includes("if(!externToestaan&&/^https:/i.test(source)&&!inlineVan(source)){node.dataset.mailResourceState='verborgen';verborgen+=1;continue}")
        && /alleenVoorraad\?\{alleenVoorraad:true\}:\{\}/.test(lezer));
      const proxy = readFileSync('backend/google-suite-mail-browser.ts', 'utf8');
      check('9: beeldproxy — eerst de voorraad; met alleenVoorraad nooit mailReaderRemoteImage', /beeldUitVoorraad\(lade,url\)[^]*?if\(alleenVoorraad\)return error\([^]*?const image=await mailReaderRemoteImage\(url\)/.test(proxy));
      const idx = readFileSync('backend/index.ts', 'utf8');
      check('9: synchronisatie — alleen de incrementele weg (nieuwe brieven) zet bijOntvangst, de eerste synchronisatie niet',
        /for\(const id of ids\)await mailGoogleFetchAndStore\(account,accessToken,id,true\)/.test(idx) && /if\(row\.id\)await mailGoogleFetchAndStore\(account,accessToken,row\.id\)/.test(idx));
      check('9: onderhoudsronde verwerkt de wachtrij', /await mailBeeldWachtrij\(ownerUserId\)/.test(idx));
    }
  } finally {
    await pool.query('DELETE FROM app.mail_beeld_voorraad WHERE user_id LIKE $1', [`${U}%`]).catch(() => undefined);
    await pool.query('DELETE FROM app.mail_beeld_voorkeur WHERE user_id LIKE $1', [`${U}%`]).catch(() => undefined);
    await pool.query('DELETE FROM app.mail_beeld_wachtrij WHERE user_id LIKE $1', [`${U}%`]).catch(() => undefined);
    for (const u of [U, `${U}-2`, `${U}-3`]) {
      await pool.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.sleutelkluis_journaal WHERE user_id = $1', [u]).catch(() => undefined);
    }
    sk.geheugenLeeg();
    if (vorigePepper === undefined) delete process.env.AUDIT_IP_PEPPER; else process.env.AUDIT_IP_PEPPER = vorigePepper;
    await closePool();
  }
  return einde();
}
