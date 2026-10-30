// DE SLEUTELKLUIS (migratie 0092, backend/sleutelkluis.ts, shared/sleutelkluis.ts) — besluit van de eigenaar, 20.10.2026:
// «персональні дані мають бути доступні лише їх власникам… щоб навіть адмін чи хтось із доступом до сайту не міг
// використовувати дані користувачів». Deze test bewijst elke regel van het model:
//   1. de DEK staat NOOIT in platte vorm op schijf (grep over alle rijen na een volledige cyclus, ook het journaal);
//   2. zonder sessie en zonder AI-verbinding slaat een achtergrondtaak de mens over met de eerlijke code;
//   3. een AI-verbinding opent ALLEEN haar eigen omslag, met haar eigen token; intrekken sluit en wist;
//   4. een technisch profiel opent nooit de persoonlijke sleutel (twee onafhankelijke DEK's, AAD met ruimte);
//   5. de herstelcode werkt één keer en wordt meteen vervangen; de oude gaat nooit meer open;
//   6. oude v1-rijen (serversleutel) blijven leesbaar en worden geteld; nieuwe rijen zijn dek1; herversleutelen zet om;
//   7. regressie: zonder kluis werkt alles exact als vroeger (serversleutel);
//   8. het register: elke 'dek'-regel heeft een herversleutelaar, elke sealWithEnvKey-module staat in het register of op de
//      uitzonderingslijst met reden — een nieuwe gevoelige tabel zonder regel laat deze test falen;
//   9. de routes: inschakelen (sterke step-up), stand, uitloggen = dicht, herstelcode, passkey met PRF (omslag in de «browser»).
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { sealWithEnvKey } from '../../server/platform/beveiliging';
import { checker, nepGoogle } from './hulp/nep-google';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { SLEUTELKLUIS_REGISTER, SLEUTEL_GESLOTEN_CODE, isDekEnvelop, isServerEnvelop, omslagAad, opmaakHerstelcode, normaliseerHerstelcode } from '../../shared/sleutelkluis';

export async function main(): Promise<number> {
  const { check, einde } = checker('sleutelkluis-20261020');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  process.env.SLEUTELKLUIS_SLEUTEL_V1 = randomBytes(32).toString('base64');
  process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1 = randomBytes(32).toString('base64');
  const eigenaar = `sk-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const sk = await import('../../backend/sleutelkluis');
  // Modules met een herversleutelaar laden (zoals de server dat bij het opstarten doet via backend/index.ts).
  await import('../../backend/mail-imap'); await import('../../backend/agenda-caldav'); await import('../../backend/github-koppeling-opslag');
  await import('../../backend/vensters-onthouden'); await import('../../backend/google-suite-inrichting');
  const st = await import('../../backend/mcp-connector-opslag');
  const sync = await import('../../backend/google-suite-sync');
  const { db } = await import('../../server/platform');
  const geheimen: string[] = [];
  const U = `sk-u-${T}`;
  const bron = (f: string) => readFileSync(f, 'utf8');

  try {
    // ------------------------------------------------------------------ 1. inschakelen + DEK nooit op schijf
    sk.zetHouderControle(async () => true); // geen echte sessies in dit deel: houders leven zolang hun eindtijd loopt
    const prive = { userId: U, ruimte: 'prive' as const };
    check('zonder kluis: stand «uit»', (await sk.kluisStand(prive)) === 'uit');
    const aan = await sk.inschakelen(prive, { soort: 'sessie', id: 's1' });
    const code1 = aan.herstelcode;
    check('inschakelen geeft een herstelcode van 20 tekens (5×4), en de sleutel staat open voor de sessie', normaliseerHerstelcode(code1).length === 20 && opmaakHerstelcode(code1).split('-').length === 5 && (await sk.kluisStand(prive)) === 'open');
    const dek = sk.sleutelOpen(prive)!;
    check('de open DEK is 32 bytes', !!dek && dek.length === 32);
    const dekHex = Buffer.from(dek).toString('hex'), dekB64 = Buffer.from(dek).toString('base64'), dekB64u = Buffer.from(dek).toString('base64url');
    geheimen.push(dekHex, dekB64, dekB64u, normaliseerHerstelcode(code1));
    check('tweede keer inschakelen → SLEUTELKLUIS_AL_AAN', await sk.inschakelen(prive, { soort: 'sessie', id: 's1' }).then(() => false, (e) => e.code === 'SLEUTELKLUIS_AL_AAN'));

    // ------------------------------------------------------------------ 6/7. twee wegen: v1 (serversleutel) en dek1 (DEK)
    const aad = `test|${U}|rij1`;
    const oud = sealWithEnvKey('MAIL_APP_WACHTWOORD_SLEUTEL_V1', 'oud-wachtwoord', aad);
    check('een OUDE rij (v1, serversleutel) blijft leesbaar met de kluis aan', isServerEnvelop(oud) && (await sk.ontzegel(prive, 'app.mail_imap_koppeling', oud, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1')) === 'oud-wachtwoord');
    const nieuw = await sk.verzegel(prive, 'app.mail_imap_koppeling', 'nieuw-wachtwoord', aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1');
    check('een NIEUWE rij is dek1 en gaat open met de DEK', isDekEnvelop(nieuw) && (await sk.ontzegel(prive, 'app.mail_imap_koppeling', nieuw, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1')) === 'nieuw-wachtwoord');
    await new Promise((r) => setTimeout(r, 150));
    const j1 = (await sk.journaalVan(prive)).find((j) => j.tabel === 'app.mail_imap_koppeling' && j.soort === 'serversleutel-gelezen');
    check('lezen via de oude weg wordt geteld («ще серверним ключем»)', !!j1 && j1.aantal >= 1);
    const ander = { userId: `sk-ander-${T}`, ruimte: 'prive' as const };
    const regressie = await sk.verzegel(ander, 'app.mail_imap_koppeling', 'zonder-kluis', aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1');
    check('regressie: een mens ZONDER kluis schrijft en leest precies als vroeger (v1, serversleutel)', isServerEnvelop(regressie) && (await sk.ontzegel(ander, 'x', regressie, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1')) === 'zonder-kluis');
    check('herversleutelEnvelop: v1 → dek1 met dezelfde inhoud', isDekEnvelop(sk.herversleutelEnvelop(dek, oud, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1')) && sk.ontzegelMetDek(dek, sk.herversleutelEnvelop(dek, oud, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1'), aad) === 'oud-wachtwoord');

    // ------------------------------------------------------------------ 2. sessie weg = sleutel dicht; cron slaat over
    sk.sleutelSluitenVoorHouder('sessie', 's1');
    check('sessie weg → stand «gesloten»; schrijven en lezen van dek1 weigeren met SLEUTELKLUIS_GESLOTEN (nooit stil de serversleutel)',
      (await sk.kluisStand(prive)) === 'gesloten'
      && await sk.verzegel(prive, 'x', 'p', aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1').then(() => false, (e) => e.code === SLEUTEL_GESLOTEN_CODE)
      && await sk.ontzegel(prive, 'x', nieuw, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1').then(() => false, (e) => e.code === SLEUTEL_GESLOTEN_CODE));
    check('een OUDE v1-rij blijft ook met gesloten sleutel leesbaar (er gaat niets verloren)', (await sk.ontzegel(prive, 'x', oud, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1')) === 'oud-wachtwoord');
    const [accId] = await db.add('cloud_provider_accounts_v1', [{ ownerUserId: U, ruimte: 'prive', principalId: `p-${T}`, status: 'connected', email: eigenaar, provider: 'google_drive', accountRole: 'primary', createdAt: Date.now(), updatedAt: Date.now() }]);
    const drive = await sync.synchroniseerDriveVoorAccount({ id: String(accId), ownerUserId: U, ruimte: 'prive', principalId: `p-${T}`, status: 'connected', email: eigenaar });
    await new Promise((r) => setTimeout(r, 150));
    const jOver = (await sk.journaalVan(prive)).find((j) => j.soort === 'gesloten-overgeslagen');
    check('cron (Drive) zonder open sleutel: overgeslagen met SLEUTELKLUIS_GESLOTEN als reden en geteld in het journaal (zichtbaar op de pagina), geen Google-aanroep',
      (drive as { gesloten?: boolean; sleutel?: string }).gesloten === true && (drive as { sleutel?: string }).sleutel === 'gesloten' && (drive as { reason?: string }).reason === SLEUTEL_GESLOTEN_CODE && !!jOver && jOver.aantal >= 1, JSON.stringify(drive));
    check('kluisGeslotenVoorGebruiker: ja (de mailonderhoudscron slaat deze mens dan over in plaats van zijn taken te laten sterven)', await sk.kluisGeslotenVoorGebruiker(U) === true);

    // ------------------------------------------------------------------ 5. herstelcode: één keer, dan vervangen
    check('verkeerde herstelcode → SLEUTELKLUIS_HERSTELCODE_ONGELDIG', await sk.ontgrendelMetHerstelcode(prive, 'AAAA-AAAA-AAAA-AAAA-AAAA', { soort: 'sessie', id: 's2' }).then(() => false, (e) => e.code === 'SLEUTELKLUIS_HERSTELCODE_ONGELDIG'));
    const ont = await sk.ontgrendelMetHerstelcode(prive, opmaakHerstelcode(code1).toLowerCase(), { soort: 'sessie', id: 's2' });
    const code2 = ont.herstelcode;
    geheimen.push(normaliseerHerstelcode(code2));
    check('juiste herstelcode (ook met streepjes/kleine letters) opent de sleutel en geeft METEEN een nieuwe code', (await sk.kluisStand(prive)) === 'open' && normaliseerHerstelcode(code2).length === 20 && code2 !== code1);
    check('de DEK na ontgrendelen is dezelfde als bij inschakelen', Buffer.from(sk.sleutelOpen(prive)!).toString('hex') === dekHex);
    sk.sleutelSluitenVoorHouder('sessie', 's2');
    check('de gebruikte code werkt NIET meer (eenmalig)', await sk.ontgrendelMetHerstelcode(prive, code1, { soort: 'sessie', id: 's3' }).then(() => false, (e) => e.code === 'SLEUTELKLUIS_HERSTELCODE_ONGELDIG'));
    await pool.query("DELETE FROM app.login_lockouts WHERE subject LIKE 'sleutelkluis:%'");
    await sk.ontgrendelMetHerstelcode(prive, code2, { soort: 'sessie', id: 's3' });
    check('de nieuwe code werkt wél', (await sk.kluisStand(prive)) === 'open');
    const ver = await sk.herstelcodeVernieuwen(prive);
    geheimen.push(normaliseerHerstelcode(ver.herstelcode));
    sk.sleutelSluitenVoorHouder('sessie', 's3');
    await pool.query("DELETE FROM app.login_lockouts WHERE subject LIKE 'sleutelkluis:%'");
    check('«nieuwe code» vervangt de vorige: oud dicht, nieuw open', await sk.ontgrendelMetHerstelcode(prive, code2, { soort: 'sessie', id: 's4' }).then(() => false, (e) => e.code === 'SLEUTELKLUIS_HERSTELCODE_ONGELDIG')
      && (await pool.query("DELETE FROM app.login_lockouts WHERE subject LIKE 'sleutelkluis:%'"), true)
      && await sk.ontgrendelMetHerstelcode(prive, ver.herstelcode, { soort: 'sessie', id: 's4' }).then((r) => { geheimen.push(normaliseerHerstelcode(r.herstelcode)); return true; }, () => false));
    const lockSubject = `sleutelkluis:${U}:prive`;
    for (let i = 0; i < 6; i++) await sk.ontgrendelMetHerstelcode(prive, 'BBBB-BBBB-BBBB-BBBB-BBBB', { soort: 'sessie', id: 'sx' }).catch(() => undefined);
    const geblokkeerd = await sk.ontgrendelMetHerstelcode(prive, 'BBBB-BBBB-BBBB-BBBB-BBBB', { soort: 'sessie', id: 'sx' }).then(() => '', (e) => e.code);
    check('raden wordt geblokkeerd (lockout na 5 pogingen)', geblokkeerd === 'SLEUTELKLUIS_HERSTELCODE_GEBLOKKEERD');
    await pool.query('DELETE FROM app.login_lockouts WHERE subject = $1', [lockSubject]);

    // ------------------------------------------------------------------ 3. AI-verbinding (grant): eigen omslag, eigen token
    const clientId = `cl-${T}`;
    await st.insertClient(clientId, 'Test-AI', ['https://example.invalid/cb']);
    const tokA = { toegang: `mcpa_${randomBytes(32).toString('base64url')}`, vernieuw: `mcpr_${randomBytes(32).toString('base64url')}` };
    const tokB = { toegang: `mcpa_${randomBytes(32).toString('base64url')}`, vernieuw: `mcpr_${randomBytes(32).toString('base64url')}` };
    const sha = (v: string) => createHash('sha256').update(v).digest('hex');
    const grantA = await st.insertToken({ userId: U, clientId, clientName: 'Test-AI', scope: 'x', accessHash: sha(tokA.toegang), refreshHash: sha(tokA.vernieuw), ruimte: 'prive' });
    const grantB = await st.insertToken({ userId: U, clientId, clientName: 'Test-AI', scope: 'x', accessHash: sha(tokB.toegang), refreshHash: sha(tokB.vernieuw), ruimte: 'prive' });
    check('grant-omslag ontstaat alleen met OPEN sleutel (mens aanwezig)', (await sk.kluisStand(prive)) === 'open' && await sk.grantVerzegelen(grantA, tokA) === true);
    sk.sleutelSluitenVoorHouder('sessie', 's4');
    check('de sessie is weg maar de verbinding houdt de sleutel open (besluit van de eigenaar: agenten werken zonder mens)', (await sk.kluisStand(prive)) === 'open' && sk.houdersVan(prive).every((h) => h.soort === 'grant'));
    await sk.grantSluiten(grantA);
    check('verbinding dicht → sleutel dicht', (await sk.kluisStand(prive)) === 'gesloten');
    // Omslagen zijn gewist bij sluiten; maak ze opnieuw aan via een open sessie om het token-pad te testen.
    await sk.sleutelOpenen(prive, Buffer.from(dekHex, 'hex'), { soort: 'sessie', id: 's5' });
    await sk.grantVerzegelen(grantA, tokA);
    sk.sleutelVergrendelen(prive);
    check('na een herstart (geheugen leeg): het JUISTE access-token opent de omslag van de verbinding', (await sk.kluisStand(prive)) === 'gesloten' && await sk.grantOpenen(grantA, 'toegang', tokA.toegang) === true && (await sk.kluisStand(prive)) === 'open');
    sk.sleutelVergrendelen(prive);
    check('een VERKEERD token opent niets; een andere verbinding (B, zonder omslag) kan de omslag van A niet gebruiken',
      await sk.grantOpenen(grantA, 'toegang', tokB.toegang) === false && await sk.grantOpenen(grantB, 'toegang', tokA.toegang) === false && await sk.grantOpenen(grantB, 'toegang', tokB.toegang) === false && (await sk.kluisStand(prive)) === 'gesloten');
    const tokA2 = { toegang: `mcpa_${randomBytes(32).toString('base64url')}`, vernieuw: `mcpr_${randomBytes(32).toString('base64url')}` };
    check('roteren: het oude refresh-token opent, beide nieuwe tokens krijgen een omslag', await sk.grantRoteren(grantA, tokA.vernieuw, tokA2) === true && (sk.sleutelVergrendelen(prive), await sk.grantOpenen(grantA, 'toegang', tokA2.toegang)) === true);
    sk.sleutelVergrendelen(prive);
    check('het OUDE access-token (vóór rotatie) opent niet meer', await sk.grantOpenen(grantA, 'toegang', tokA.toegang) === false);
    await sk.grantOpenen(grantA, 'toegang', tokA2.toegang);
    await st.revokeGrant(U, grantA);
    await sk.grantSluiten(grantA);
    const restOmslag = await pool.query(`SELECT count(*)::int AS n FROM app.sleutelkluis_omslag WHERE soort = 'grant' AND houder = $1`, [grantA]);
    check('intrekken: sleutel dicht én omslagen van de verbinding gewist', (await sk.kluisStand(prive)) === 'gesloten' && restOmslag.rows[0].n === 0);
    check('een ingetrokken verbinding kan met haar token niets meer openen', await sk.grantOpenen(grantA, 'toegang', tokA2.toegang) === false);

    // ------------------------------------------------------------------ 4. technisch ≠ persoonlijk
    const tech = { userId: U, ruimte: 'technisch' as const };
    await sk.sleutelOpenen(prive, Buffer.from(dekHex, 'hex'), { soort: 'sessie', id: 's6' });
    const techAan = await sk.inschakelen(tech, { soort: 'sessie', id: 't1' });
    geheimen.push(normaliseerHerstelcode(techAan.herstelcode));
    const techDek = sk.sleutelOpen(tech)!;
    geheimen.push(Buffer.from(techDek).toString('hex'));
    check('de technische DEK is een ANDERE sleutel (onafhankelijk, niet afgeleid)', Buffer.from(techDek).toString('hex') !== dekHex);
    const persoonlijkeRij = await sk.verzegel(prive, 'x', 'persoonlijk-geheim', `rij|${U}`, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1');
    sk.sleutelSluitenVoorHouder('sessie', 's6');
    check('technisch profiel (alleen technische sleutel open): de persoonlijke rij gaat NIET open',
      (await sk.kluisStand(tech)) === 'open' && (await sk.kluisStand(prive)) === 'gesloten'
      && await sk.ontzegel(prive, 'x', persoonlijkeRij, `rij|${U}`, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1').then(() => false, (e) => e.code === SLEUTEL_GESLOTEN_CODE)
      && (() => { try { sk.ontzegelMetDek(techDek, persoonlijkeRij, `rij|${U}`); return false; } catch { return true; } })());
    check('een omslag van de technische ruimte gaat niet open als persoonlijke (AAD draagt de ruimte)', omslagAad(U, 'technisch', 'herstelcode', 'herstelcode') !== omslagAad(U, 'prive', 'herstelcode', 'herstelcode'));
    sk.sleutelSluitenVoorHouder('sessie', 't1');

    // ------------------------------------------------------------------ 2 (vervolg). de achtergrondronde in het SERVERPROCES
    const ag = await import('../../backend/sleutelkluis-achtergrond');
    let geroepen = 0;
    const taak = { naam: `sk-taak-${T}`, handler: async () => { geroepen++; return { statusCode: 200, body: '{"ok":true}' }; } };
    const dicht = await ag.sleutelkluisAchtergrondRonde([taak]);
    check('achtergrondronde: zonder enige open sleutel gebeurt er NIETS (de gewone cron doet alles)', dicht[0]?.status === 'overgeslagen' && geroepen === 0);
    await sk.sleutelOpenen(prive, Buffer.from(dekHex, 'hex'), { soort: 'sessie', id: 's7' });
    const slot = await pool.connect();
    await slot.query('SELECT pg_advisory_lock(hashtext($1))', [`cron:${taak.naam}`]);
    const bezet = await ag.sleutelkluisAchtergrondRonde([taak]);
    await slot.query('SELECT pg_advisory_unlock_all()'); slot.release();
    check('achtergrondronde: loopt de cron (zelfde advisory lock), dan wacht de ronde — nooit twee tegelijk', bezet[0]?.status === 'bezet' && geroepen === 0);
    const open = await ag.sleutelkluisAchtergrondRonde([taak]);
    const run = await pool.query(`SELECT status FROM app.cron_runs WHERE name = $1 ORDER BY id DESC LIMIT 1`, [`${taak.naam}@server`]);
    check('achtergrondronde: met een open sleutel draait de taak in het serverproces en staat de run in app.cron_runs als «@server»', open[0]?.status === 'ok' && geroepen === 1 && run.rows[0]?.status === 'ok');
    sk.sleutelSluitenVoorHouder('sessie', 's7');
    check('de mailonderhoudscron slaat een mens met gesloten sleutel over (code) en het serverproces start de ronde (code)', bron('backend/index.ts').includes('kluisGeslotenVoorGebruiker(ownerUserId)') && bron('server/start.ts').includes('sleutelkluisAchtergrondRonde(['));

    // ------------------------------------------------------------------ 1 (vervolg). GREP: nergens een DEK of herstelcode op schijf
    const dump: string[] = [];
    for (const t of ['app.sleutelkluis', 'app.sleutelkluis_omslag', 'app.sleutelkluis_journaal']) dump.push(...(await pool.query(`SELECT row_to_json(r)::text AS t FROM ${t} r WHERE user_id = $1`, [U])).rows.map((r) => String(r.t)));
    dump.push(...(await pool.query(`SELECT data::text AS t FROM app.records WHERE data::text LIKE $1`, [`%${U}%`])).rows.map((r) => String(r.t)));
    dump.push(...(await pool.query(`SELECT details::text AS t FROM app.audit WHERE owner_id = $1`, [U])).rows.map((r) => String(r.t)));
    dump.push(...(await pool.query(`SELECT row_to_json(r)::text AS t FROM app.mcp_oauth_tokens r WHERE user_id = $1`, [U])).rows.map((r) => String(r.t)));
    const alles = dump.join('\n');
    const lek = geheimen.filter((g) => g.length >= 20 && alles.includes(g));
    check(`na de hele cyclus staat GEEN DEK en GEEN herstelcode ergens in de database (${dump.length} rijen doorzocht, ${geheimen.length} geheimen)`, lek.length === 0 && dump.length > 5, lek.map((l) => l.slice(0, 6)).join());
    const ctr = (await pool.query('SELECT controle FROM app.sleutelkluis WHERE user_id = $1 AND ruimte = $2', [U, 'prive'])).rows[0]?.controle;
    check('de controlewaarde is een HMAC (64 hex) en niet de sleutel zelf', /^[a-f0-9]{64}$/.test(String(ctr)) && ctr !== dekHex);
    check('geen omslag met alleen een serversleutel: alle soorten zijn passkey/herstelcode/grant', (await pool.query(`SELECT count(*)::int AS n FROM app.sleutelkluis_omslag WHERE user_id = $1 AND soort NOT IN ('passkey','herstelcode','grant')`, [U])).rows[0].n === 0);

    // ------------------------------------------------------------------ 8. register
    check('elke «dek»-regel in het register heeft een herversleutelaar (anders is «dek» een loze belofte)', sk.registerZonderHerversleutelaar().length === 0, sk.registerZonderHerversleutelaar().join());
    check('elke «nog-niet»-regel heeft een reden in beide talen', SLEUTELKLUIS_REGISTER.filter((r) => r.stand === 'nog-niet').every((r) => !!r.reden && r.reden.uk.length > 20 && r.reden.nl.length > 20));
    const backendBestanden = readdirSync('backend').filter((f) => f.endsWith('.ts')).map((f) => `backend/${f}`);
    // Elke module die met de serversleutel verzegelt, staat in het register (als module) of op deze uitzonderingslijst met reden.
    const UITZONDERING: Record<string, string> = {
      'backend/toegangslaag.ts': 'TOTP-geheim: wordt vóór het openen van de kluis gecontroleerd (register: identity_totp_v1, nog-niet)',
      'backend/connectors-crypto.ts': 'opdrachtsleutel van een PC-agent (geen persoonlijke inhoud; gebonden aan token-hash)',
      'backend/browser-diag-archief.ts': 'register: app.browser_diag_archive, nog-niet',
      'backend/sleutelkluis.ts': 'de kluis zelf (oude weg voor wie de kluis niet aanzette)',
      'backend/github-koppeling-opslag.ts': 'sync verzegel() alleen voor de OAuth-state-verifier (eenmalig, 10 min) en tests; tokens gaan via verzegelVoor',
    };
    const modules = new Set(SLEUTELKLUIS_REGISTER.flatMap((r) => r.module.split(',').map((m) => m.trim().split(' ')[0])));
    const zonderRegel = backendBestanden.filter((f) => /\bsealWithEnvKey\(/.test(bron(f)) && !modules.has(f) && !UITZONDERING[f]);
    check('elke module die met de serversleutel verzegelt staat in het register of op de uitzonderingslijst', zonderRegel.length === 0, zonderRegel.join());
    const bekendGevoelig = ['mail_items_v1', 'google_oauth_grant_v1', 'mail_oauth_tokens_v2', 'app.mail_imap_koppeling', 'app.agenda_abonnement', 'github_koppeling_v1', 'app.venster_stand', 'owner_vault_v1', 'google_suite_drive_projection_v1', 'cloud_items_v1', 'app.mcp_console_items', 'app.mail_afzenders'];
    check('bekende gevoelige tabellen staan allemaal in het register', bekendGevoelig.every((t) => SLEUTELKLUIS_REGISTER.some((r) => r.tabel.includes(t))), bekendGevoelig.filter((t) => !SLEUTELKLUIS_REGISTER.some((r) => r.tabel.includes(t))).join());
    check('de hooks zitten in de code: logout sluit de houder, «overal afmelden» vergrendelt alles, de connector slaat grants om',
      /sleutelSluitenVoorHouder\('sessie'/.test(bron('backend/index.ts')) && /sleutelVergrendelenVoorGebruiker\(userId\)/.test(bron('backend/index.ts'))
      && bron('backend/mcp-connector.ts').includes('grantVerzegelen(grantId') && bron('backend/mcp-connector.ts').includes("grantOpenen(String(row.id), 'toegang'") && bron('backend/connector-v2-opslag.ts').includes('grantSluiten('));
    check('de crons vragen de stand van de kluis (Drive, agenda, CalDAV)', bron('backend/google-suite-sync.ts').includes("kluisStand(lade)==='gesloten'") && bron('backend/google-suite-agenda-sync.ts').includes("kluisStand(lade)) === 'gesloten'") && bron('backend/agenda-caldav.ts').includes("kluisStand(lade)) === 'gesloten'"));
    check('audit ruimtes: ai-vertaling leest alleen de lade van de aanroep (postRecordsVanLade)', bron('backend/ai-vertaling-routes.ts').includes('postRecordsVanLade(userId, itemRes.items'));
    check('UI: de sectie staat op de pagina «Способи входу», met beide talen en de eerlijke PRF-tekst', bron('src/toegangslaag-panelen.tsx').includes('<SleutelkluisSectie') && bron('src/SleutelkluisSectie.tsx').includes('KLUIS_TEKST.geenPrf') && bron('src/SleutelkluisSectie.tsx').includes("'Перешифрувати мої дані зараз'") && bron('src/platform/sleutelkluis-client.ts').includes('evalByCredential'));

    // ------------------------------------------------------------------ 9. de routes, via de echte handler
    sk.zetHouderControle(null); // vanaf hier: echte sessies, echte lui-controle
    const oudTijd = Math.floor(Date.now() / 1000) - 3600;
    const A = G.browser(); const aMail = `sk-a-${T}@example.test`; await A.aanmelden(`sub-a-${T}`, aMail, { authTime: oudTijd });
    const aId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [aMail])).rows[0]?.id as string;
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = $1", [aId]);
    const id = (b: ReturnType<typeof G.browser>, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
    const P = '/api/owner/sleutelkluis';
    const stand0 = await id(A, `${P}/stand`);
    check('stand (uit) voor een goedgekeurde gebruiker: ruimte prive, register meegeleverd', stand0.status === 200 && stand0.data.stand === 'uit' && stand0.data.ruimte === 'prive' && Array.isArray(stand0.data.register), `${stand0.status} ${stand0.body.slice(0, 100)}`);
    const zonder = await id(A, `${P}/inschakelen`);
    check('inschakelen zonder sterke step-up → 403', zonder.status === 403 && /STEP_UP/.test(String(zonder.data.error || zonder.data.reasonCode)), `${zonder.status} ${zonder.body.slice(0, 100)}`);
    // Passkey registreren (Google-step-up volstaat daarvoor) en daarmee een STERKE step-up doen.
    await A.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up' });
    const pk = nieuwePasskey('es256');
    const opt = await id(A, '/api/owner/access/passkeys/registreren/opties');
    const reg = await id(A, '/api/owner/access/passkeys/registreren', { uitdagingId: opt.data.uitdagingId, naam: 'Telefoon', transports: ['internal'], ...registreer(pk, opt.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    const so = await id(A, '/api/owner/access/stap-op/passkey/opties');
    const su = await id(A, '/api/owner/access/stap-op/passkey', { uitdagingId: so.data.uitdagingId, assertie: bevestig(pk, so.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    check('voorbereiding: passkey geregistreerd en sterke step-up gedaan', reg.status === 200 && su.status === 200, `${reg.status} ${reg.body.slice(0, 80)} / ${su.status} ${su.body.slice(0, 80)}`);
    const aanR = await id(A, `${P}/inschakelen`);
    check('inschakelen met sterke step-up: herstelcode EENMALIG terug, stand open', aanR.status === 200 && aanR.data.eenmalig === true && normaliseerHerstelcode(aanR.data.herstelcode).length === 20 && (await id(A, `${P}/stand`)).data.stand === 'open', `${aanR.status} ${aanR.data.error || ''}`);
    geheimen.push(normaliseerHerstelcode(String(aanR.data.herstelcode || '')));
    const standA = await id(A, `${P}/stand`);
    check('stand toont de omslagen (herstelcode ja, passkey nog niet gekoppeld) en de houder (1 sessie)', standA.data.omslagen?.herstelcode && standA.data.passkeys?.length === 1 && standA.data.passkeys[0].gekoppeld === false && standA.data.houders?.filter((h: { soort: string }) => h.soort === 'sessie').length === 1);

    // Passkey + PRF koppelen: de «browser» (deze test) rekent de KEK uit een nagebootste PRF-uitkomst en slaat de DEK om.
    const prf = randomBytes(32);
    const kop = await id(A, `${P}/passkey/koppelen/opties`);
    check('koppelen/opties geeft de DEK (hex, over TLS) + salt + aad per passkey + PRF-extensie in de opties', kop.status === 200 && /^[0-9a-f]{64}$/.test(kop.data.dek) && kop.data.passkeys[0].salt && kop.data.passkeys[0].aad && kop.data.publicKey.extensions.prf.evalByCredential[kop.data.passkeys[0].credentialId].first === kop.data.passkeys[0].salt, `${kop.status} ${kop.data.error || ''}`);
    geheimen.push(String(kop.data.dek));
    const kek = sk.kekUitPrf(prf);
    const envelop = sk.omslaan(kek, Buffer.from(String(kop.data.dek), 'hex'), kop.data.passkeys[0].aad);
    const kopR = await id(A, `${P}/passkey/koppelen`, { uitdagingId: kop.data.uitdagingId, assertie: bevestig(pk, kop.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }), salt: kop.data.passkeys[0].salt, envelop, prfOndersteund: true });
    check('passkey gekoppeld (omslag door de browser gemaakt)', kopR.status === 200 && kopR.data.ok === true && (await id(A, `${P}/stand`)).data.passkeys[0].gekoppeld === true, `${kopR.status} ${kopR.body.slice(0, 100)}`);
    const kop2 = await id(A, `${P}/passkey/koppelen/opties`);
    const geenPrf = await id(A, `${P}/passkey/koppelen`, { uitdagingId: kop2.data.uitdagingId, assertie: bevestig(pk, kop2.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }), prfOndersteund: false });
    check('passkey ZONDER PRF: eerlijke uitleg in beide talen, geen omslag', geenPrf.status === 200 && geenPrf.data.ok === false && geenPrf.data.uitleg?.uk?.includes('PRF') && geenPrf.data.uitleg?.nl?.includes('PRF'));

    // Uitloggen = sleutel dicht (expliciete hook) — en opnieuw aanmelden = gesloten tot ontgrendelen.
    const uit = await id(A, '/api/owner/session/logout-current');
    await A.aanmelden(`sub-a-${T}`, aMail, { authTime: oudTijd });
    const standNa = await id(A, `${P}/stand`);
    check('uitloggen sluit de sleutel: na opnieuw aanmelden «gesloten»', uit.status === 200 && standNa.data.stand === 'gesloten', `${uit.status} ${standNa.body.slice(0, 100)}`);
    // Ontgrendelen met de passkey (PRF): opties → omslag → «browser» opent → DEK terug.
    const oo = await id(A, `${P}/passkey/ontgrendelen/opties`);
    const omslag = oo.data.omslagen?.[0];
    check('ontgrendelen/opties: omslag + salt + aad per gekoppelde passkey, GEEN dek', oo.status === 200 && !!omslag?.envelop && omslag.salt === kop.data.passkeys[0].salt && !('dek' in oo.data), `${oo.status} ${oo.body.slice(0, 120)}`);
    const dekTerug = sk.omslagOpenen(sk.kekUitPrf(prf), omslag.envelop, omslag.aad).toString('hex');
    const fouteDek = await id(A, `${P}/passkey/ontgrendelen`, { uitdagingId: oo.data.uitdagingId, assertie: bevestig(pk, oo.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }), dek: randomBytes(32).toString('hex') });
    check('een verkeerde DEK (verkeerde PRF) wordt tegen de controlewaarde geweigerd', fouteDek.status === 403 && fouteDek.data.error === 'SLEUTELKLUIS_DEK_ONGELDIG', `${fouteDek.status} ${fouteDek.body.slice(0, 100)}`);
    const oo2 = await id(A, `${P}/passkey/ontgrendelen/opties`);
    const ontR = await id(A, `${P}/passkey/ontgrendelen`, { uitdagingId: oo2.data.uitdagingId, assertie: bevestig(pk, oo2.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }), dek: dekTerug });
    check('ontgrendelen met passkey (PRF): sleutel open', ontR.status === 200 && dekTerug === kop.data.dek && (await id(A, `${P}/stand`)).data.stand === 'open', `${ontR.status} ${ontR.body.slice(0, 100)}`);
    await id(A, `${P}/vergrendelen`);
    const hc = await id(A, `${P}/ontgrendelen/herstelcode`, { code: aanR.data.herstelcode });
    check('ontgrendelen met de herstelcode via de route: open + nieuwe code eenmalig terug', hc.status === 200 && hc.data.eenmalig === true && normaliseerHerstelcode(hc.data.herstelcode).length === 20 && (await id(A, `${P}/stand`)).data.stand === 'open', `${hc.status} ${hc.data.error || ''}`);
    geheimen.push(normaliseerHerstelcode(String(hc.data.herstelcode || '')));
    // Herversleutelen via de route (sterke step-up is al gedaan in deze sessie? nee: nieuwe sessie → opnieuw).
    const so2 = await id(A, '/api/owner/access/stap-op/passkey/opties');
    await id(A, '/api/owner/access/stap-op/passkey', { uitdagingId: so2.data.uitdagingId, assertie: bevestig(pk, so2.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    // Een oude v1-rij voor deze mens (IMAP) om om te zetten.
    const oudGeheim = sealWithEnvKey('MAIL_APP_WACHTWOORD_SLEUTEL_V1', 'app-ww', `mail-imap|${aId}|imap-${T}`);
    await pool.query(`INSERT INTO app.mail_imap_koppeling (user_id, id, aanbieder, adres, geheim, ruimte) VALUES ($1, $2, 'icloud', $3, $4, 'prive')`, [aId, `imap-${T}`, `a-${T}@icloud.com`, oudGeheim]);
    const hv = await id(A, `${P}/herversleutelen`);
    const imapRij = (await pool.query('SELECT geheim FROM app.mail_imap_koppeling WHERE user_id = $1 AND id = $2', [aId, `imap-${T}`])).rows[0];
    const imapT = (hv.data.tabellen || []).find((t: { tabel: string }) => t.tabel === 'app.mail_imap_koppeling');
    check('«перешифрувати зараз»: de oude IMAP-rij is nu dek1 en het resultaat per tabel komt terug', hv.status === 200 && imapT?.gevonden === 1 && imapT?.herversleuteld === 1 && isDekEnvelop(imapRij?.geheim), `${hv.status} ${hv.body.slice(0, 200)}`);
    const dekA = sk.sleutelOpen({ userId: aId, ruimte: 'prive' })!;
    check('de omgezette rij gaat open met de DEK van de mens en bevat het oude wachtwoord', sk.ontzegelMetDek(dekA, imapRij.geheim, `mail-imap|${aId}|imap-${T}`) === 'app-ww');
    const dumpA = [...(await pool.query(`SELECT row_to_json(r)::text AS t FROM app.sleutelkluis_omslag r WHERE user_id = $1`, [aId])).rows, ...(await pool.query(`SELECT details::text AS t FROM app.audit WHERE owner_id = $1`, [aId])).rows, ...(await pool.query(`SELECT data::text AS t FROM app.records WHERE data::text LIKE $1`, [`%${aId}%`])).rows].map((r) => String(r.t)).join('\n');
    const lekA = geheimen.filter((g) => g.length >= 20 && dumpA.includes(g));
    check('na de routes: geen DEK en geen herstelcode op schijf (omslagen, audit, records)', lekA.length === 0, lekA.map((l) => l.slice(0, 6)).join());
  } finally {
    sk.geheugenLeeg();
    await pool.query("DELETE FROM app.records WHERE tbl = 'cloud_provider_accounts_v1' AND data->>'ownerUserId' = $1", [U]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
