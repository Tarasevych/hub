// «Усі користувачі» voor de browserextensie (0.6, backend/extensie-beheer.ts + extensie-beleid.ts, migratie 0073) tegen de wegwerp-PG.
//  - alleen de eigenaar of een lopende activering met 'users.manage' (beheerder) mag; een gewone gebruiker of een ontwikkelaar niet;
//  - een gebruiker ziet alleen zijn eigen beleid (extensie-status; RLS met de app-rol);
//  - beleid kapt: strenger beleid trekt lopende ontgrendelingen die erbuiten vallen meteen in (reden 'beleid') + melding; technisch
//    ontgrendelen wordt op de maximale duur van het beleid gekapt;
//  - nooit beleid/ontgrendelingen van de eigenaar door een ander; niet je eigen beleid (tenzij eigenaar);
//  - intrekken door beheer: reden 'beheer', melding aan de gebruiker; verlengen alleen binnen beleid, technisch nooit voorbij de activering;
//  - alles in app.audit (ook bekijken en weigeringen).
import { randomBytes, randomUUID } from 'node:crypto';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import * as grants from '../../backend/ai-toestemmingen';
import { newCommandKey, pairingCode, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import * as store from '../../backend/connectors-opslag';
import * as beheer from '../../backend/extensie-beheer';
import { leesBeleid, valideerBeleidInvoer } from '../../backend/extensie-beleid';
import * as eo from '../../backend/extensie-ontgrendeling';
import { registreerMelder } from '../../backend/melder';
import * as tp from '../../backend/tech-profiel';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const code = async (p: Promise<unknown>): Promise<string> => p.then(() => 'OK', (e) => (e instanceof eo.Weigering ? e.code : `ANDERS:${(e as Error).message}`));

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-beheer');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const E = `exb-e-${T}`, B = `exb-b-${T}`, O = `exb-o-${T}`, X = `exb-x-${T}`;
  const ALLE = [E, B, O, X];
  const meldingen: Array<{ userId: string; kind: string; title: string }> = [];
  registreerMelder(async (userId, _e, kind, title) => { meldingen.push({ userId, kind, title }); });
  const audits = async (actie: string, uid: string) => Number((await sys.query('SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = $2', [uid, actie])).rows[0].n);
  const ruimRijen = () => sys.query("UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = 'test' WHERE user_id = ANY($1) AND ingetrokken_op IS NULL", [ALLE]);

  // Gedeelde test-DB: een eventuele bestaande eigenaarsrij (andere tests) tijdelijk degraderen (unieke index records_een_eigenaar).
  const verplaatst = (await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner-tijdelijk\"') WHERE tbl = 'users' AND data->>'role' = 'owner' RETURNING id")).rows.map((r: { id: string }) => r.id);
  try {
    const mail = (id: string) => (id === E ? 'eigenaar@test.invalid' : `${id}@example.test`);
    for (const id of ALLE) {
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', id, { email: mail(id), role: id === E ? 'owner' : 'user', status: 'approved', name: id }]);
    }
    const g = (id: string) => ({ id, email: mail(id), role: id === E ? 'owner' : 'user', status: 'approved' });
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['beheerder'], 60, 'test'), ($3, $4, ARRAY['ontwikkelaar'], 240, 'test')`,
      [B, `tech-${randomBytes(6).toString('hex')}`, O, `tech-${randomBytes(6).toString('hex')}`]);
    // 20.10.2026: het technische slot van de extensie is ondergeschikt aan de stand van de dienst «ai» in de gescheiden
    // gegevensruimtes (0082); die staat standaard op «uit». Deze test gaat over BEHEER van sloten, dus zetten we hem aan
    // (tests/eenheid/hulp/ruimte-ai.ts; de standen zelf staan in tests/eenheid/ruimte-ai-20261020.test.ts).
    for (const id of ALLE) await aiDienstAan(id);
    const sessie = (id: string) => ({ user: g(id), service: 'mcp', tabContext: randomBytes(24).toString('hex'), session: { id: randomUUID(), createdAt: Date.now() - 1000 }, tabSession: null }) as eo.Aanroep;
    const aE = sessie(E), aB = sessie(B), aO = sessie(O), aX = sessie(X);
    const sv = (a: eo.Aanroep) => ({ id: a.session!.id, createdAt: a.session!.createdAt });

    // ---------------------------------------------------------------- bevoegdheid
    check('gewone gebruiker: lijst/beleid/intrekken/verlengen → GEEN_BEHEERRECHT',
      (await code(beheer.lijst(aX))) === 'GEEN_BEHEERRECHT' && (await code(beheer.beleidZetten(aX, { userId: O, priveAan: false }))) === 'GEEN_BEHEERRECHT'
      && (await code(beheer.intrekkenVoor(aX, { userId: O }))) === 'GEEN_BEHEERRECHT' && (await code(beheer.verlengen(aX, { gid: randomUUID(), minuten: 10 }))) === 'GEEN_BEHEERRECHT');
    check('beheerder met profiel maar ZONDER lopende activering → GEEN_BEHEERRECHT (rechten alleen in een activering)', (await code(beheer.lijst(aB))) === 'GEEN_BEHEERRECHT');
    await tp.activeren(g(B), aB.tabContext, 60, 'test extensie-beheer', sv(aB));
    const actO = await tp.activeren(g(O), aO.tabContext, 60, 'test extensie-beheer', sv(aO));
    check('ontwikkelaar met lopende activering (geen users.manage) → GEEN_BEHEERRECHT', (await code(beheer.lijst(aO))) === 'GEEN_BEHEERRECHT');
    check('weigeringen staan in app.audit (owner.extensie.beheer.geweigerd)', (await audits('owner.extensie.beheer.geweigerd', X)) >= 4 && (await audits('owner.extensie.beheer.geweigerd', O)) >= 1);

    // fixtures: X heeft een prive-browser met toestemmingen en een lopende prive-ontgrendeling; O een technisch slot met ontgrendeling
    const tokX = randomToken(32);
    const XP = await store.createAgent(X, `Chrome X (${T})`, 'browser', sha256(tokX), {}, undefined, { pairingId: `px${T}`.replace(/[^A-Za-z0-9]/g, ''), commandKeyEnc: sealCommandKey(newCommandKey(), X, sha256(tokX)), version: '0.6.2', ruimte: 'prive' });
    await grants.addGrants(X, X, [{ agentId: XP.id, capability: 'browser.read', minutes: 3 * 24 * 60 }, { agentId: XP.id, capability: 'browser.navigate', minutes: 3 * 24 * 60 }], { steppedUp: false });
    const gidX = await ontgrendelVoorTest(XP.id, X, { caps: ['browser.read', 'browser.navigate'], minuten: 24 * 60 });
    const tokO = randomToken(32);
    const OT = await store.createAgent(O, `Chrome O (${T})`, 'browser', sha256(tokO), {}, undefined, { commandKeyEnc: sealCommandKey(newCommandKey(), O, sha256(tokO)), version: '0.6.2', ruimte: 'technisch' });
    const gidO = await ontgrendelVoorTest(OT.id, O, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 20, activatieId: actO.id });
    const tokE = randomToken(32);
    const EP = await store.createAgent(E, `Chrome E (${T})`, 'browser', sha256(tokE), {}, undefined, { commandKeyEnc: sealCommandKey(newCommandKey(), E, sha256(tokE)), version: '0.6.2', ruimte: 'prive' });
    const gidE = await ontgrendelVoorTest(EP.id, E, { caps: ['browser.read'], minuten: 60 });

    const lijstB = await beheer.lijst(aB);
    const rijX = lijstB.gebruikers.find((u) => u.userId === X), rijE = lijstB.gebruikers.find((u) => u.userId === E), rijB = lijstB.gebruikers.find((u) => u.userId === B);
    check('beheerder (users.manage) ziet alle gebruikers met beleid, techProfiel en browsers (slot + ontgrendeling)', lijstB.door === 'users.manage' && !!rijX && rijX.techProfiel === false
      && rijX.beleid.priveAan === true && rijX.browsers.length === 1 && rijX.browsers[0].ruimte === 'prive' && rijX.browsers[0].ontgrendeling?.gid === gidX
      && lijstB.gebruikers.find((u) => u.userId === O)?.techProfiel === true && lijstB.gebruikers.find((u) => u.userId === O)?.browsers[0]?.ruimte === 'technisch', JSON.stringify(rijX));
    check('lijst: eigenaar en jezelf niet bewerkbaar voor de beheerder; anderen wel', rijE?.eigenaar === true && rijE.bewerkbaar === false && rijB?.bewerkbaar === false && rijX.bewerkbaar === true);
    const lijstE = await beheer.lijst(aE);
    check('eigenaar mag ook zonder activering; zijn eigen rij is voor hem bewerkbaar', lijstE.door === 'eigenaar' && lijstE.gebruikers.find((u) => u.userId === E)?.bewerkbaar === true);
    check('bekijken staat in app.audit', (await audits('owner.extensie.beheer.bekeken', B)) === 1 && (await audits('owner.extensie.beheer.bekeken', E)) === 1);

    // ---------------------------------------------------------------- harde regels
    check('beheerder: beleid van de eigenaar → EIGENAAR_ONAANTASTBAAR; eigen beleid → NIET_AAN_JEZELF; ontgrendeling van de eigenaar intrekken → EIGENAAR_ONAANTASTBAAR',
      (await code(beheer.beleidZetten(aB, { userId: E, priveAan: false }))) === 'EIGENAAR_ONAANTASTBAAR'
      && (await code(beheer.beleidZetten(aB, { userId: B, priveMaxDagen: 30 }))) === 'NIET_AAN_JEZELF'
      && (await code(beheer.intrekkenVoor(aB, { userId: E }))) === 'EIGENAAR_ONAANTASTBAAR'
      && (await code(beheer.verlengen(aB, { gid: gidE, minuten: 10 }))) === 'EIGENAAR_ONAANTASTBAAR'
      && !!(await eo.actieveOntgrendeling(EP.id, E)) && (await leesBeleid(E)).priveAan === true);
    check('ongeldige invoer: tikfout in een beleidsveld, onbekende cap, te lange duur → ONGELDIG; onbekende gebruiker → GEBRUIKER_ONBEKEND',
      (await code(beheer.beleidZetten(aB, { userId: X, priveCap: ['browser.read'] }))) === 'ONGELDIG'
      && (await code(beheer.beleidZetten(aB, { userId: X, priveCaps: ['browser.everything'] }))) === 'ONGELDIG'
      && (await code(beheer.beleidZetten(aB, { userId: X, priveMaxDagen: 367 }))) === 'ONGELDIG'
      && (await code(beheer.beleidZetten(aB, { userId: `bestaat-niet-${T}`, priveAan: false }))) === 'GEBRUIKER_ONBEKEND');
    let tikfout = '';
    // 0110 (zone E): de bovengrens is 366 dagen (527040 minuten); daarboven blijft het ongeldig.
    try { valideerBeleidInvoer({ technischMaxMinuten: 527041 }); } catch (e) { tikfout = (e as Error).message; }
    check('valideerBeleidInvoer: technisch > 366 dagen geweigerd; sessievelden genegeerd', /technischMaxMinuten/.test(tikfout) && JSON.stringify(valideerBeleidInvoer({ service: 'mcp', tabContext: 'x', lokaalAan: false })) === '{"lokaalAan":false}');

    // ---------------------------------------------------------------- beleid kapt en trekt in
    const voorMeldingen = meldingen.length;
    const b1 = await beheer.beleidZetten(aB, { userId: X, priveCaps: ['browser.read'], notitie: 'stagiair' });
    const naX = (await sys.query('SELECT reden_einde, ingetrokken_door FROM app.extensie_ontgrendelingen WHERE id = $1', [gidX])).rows[0];
    check('strenger beleid (prive alleen lezen) trekt de lopende prive-ontgrendeling met navigate meteen in (reden beleid, door beheer)', b1.ok && b1.ingetrokken === 1
      && naX.reden_einde === 'beleid' && naX.ingetrokken_door === 'beheer' && b1.beleid.priveCaps?.join() === 'browser.read' && b1.beleid.notitie === 'stagiair' && b1.beleid.gewijzigdDoor === mail(B));
    check('melding aan de gebruiker (soort security) bij beperken door een ander', meldingen.slice(voorMeldingen).some((m) => m.userId === X && m.kind === 'security'));
    check('beleid staat in app.audit bij de gebruiker én bij de beheerder', (await audits('owner.extensie.beleid', X)) === 1 && (await audits('owner.extensie.beleid', B)) === 1
      && (await audits('owner.extensie.ingetrokken', X)) === 1);
    // gebruiker ziet alleen zijn eigen beleid
    const stX = await eo.extensieStatus(g(X), aX.tabContext, { id: aX.session!.id, createdAt: aX.session!.createdAt });
    check('gebruiker ziet in extensie-status alleen zijn eigen beleid (prive alleen lezen) en geen beheer', stX.beleid.priveCaps?.join() === 'browser.read' && stX.beheer === false
      && stX.recht.prive.caps.join() === 'browser.read' && stX.agenten.every((a) => a.agentId === XP.id));
    if (appRolActief()) {
      const zicht = await grants.alsGebruiker(X, async (q) => (await q('SELECT user_id FROM app.extensie_beleid')).rows.map((r) => String(r.user_id)));
      check('RLS (app-rol): een gebruiker leest alleen zijn eigen beleidsrij', zicht.every((u) => u === X));
    } else console.log('OVERGESLAGEN extensie-beheer: RLS-controle met de app-rol (DATABASE_URL_APP niet gezet)');

    // technisch beleid kapt de duur van een nieuwe technische ontgrendeling (passkey-pad, uitdaging)
    await beheer.beleidZetten(aE, { userId: O, technischMaxMinuten: 15 });
    check('strenger technisch beleid (15 min) trekt de lopende technische rij van 20 min in', (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [gidO])).rows[0].reden_einde === 'beleid');
    const pk = nieuwePasskey();
    const reg = kern.verifieerRegistratie({ ...registreer(pk, 'c-reg'), verwachteUitdaging: 'c-reg', rpId: 'tarasevych.com', origins: ['https://admin.tarasevych.com'] }) as any;
    await sys.query(`INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam) VALUES ($1, $2, $3, $4::jsonb, $5, 'test')`, [O, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk]);
    const ud = await eo.uitdaging(aO, { agentId: OT.id, minuten: 60 });
    check('technisch ontgrendelen: eind gekapt op het beleid (15 i.p.v. 60 minuten); recht.technisch.maxMinuten = 15',
      Math.abs(ud.voorstel.eind - (Date.now() + 15 * 60_000)) < 10_000 && (await eo.recht(g(O), aO.tabContext, sv(aO))).maxMinuten === 15);
    await beheer.beleidZetten(aE, { userId: O, technischCaps: ['browser.debug'] });
    const capsO = await eo.recht(g(O), aO.tabContext, sv(aO));
    check('technisch beleid kapt de caps van de rollen (ontwikkelaar: 5 → alleen browser.debug)', capsO.mag === true && capsO.caps.join() === 'browser.debug');
    await beheer.beleidZetten(aE, { userId: O, technischCaps: [] });
    check('technisch beleid zonder caps (lege lijst) → GEEN_BROWSER_RECHTEN', (await code(eo.uitdaging(aO, { agentId: OT.id, minuten: 15 }))) === 'GEEN_BROWSER_RECHTEN');
    await beheer.beleidZetten(aE, { userId: O, technischAan: false });
    check('technisch uit → BELEID_UIT', (await code(eo.uitdaging(aO, { agentId: OT.id, minuten: 15 }))) === 'BELEID_UIT');
    await beheer.beleidZetten(aE, { userId: O, technischAan: true, technischCaps: null, technischMaxMinuten: 480 });

    // ---------------------------------------------------------------- verlengen
    const gidO2 = await ontgrendelVoorTest(OT.id, O, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 20, activatieId: actO.id });
    const vO = await beheer.verlengen(aE, { gid: gidO2, minuten: 480 });
    check('verlengen technisch door de eigenaar: gekapt op het einde van de activering (60 min), nooit verder', vO.ok && vO.gekapt === true && Math.abs(vO.ontgrendeling.eind - actO.eind) < 2000, JSON.stringify(vO.ontgrendeling));
    check('verlengen voorbij de grens die al bereikt is → BUITEN_BELEID', (await code(beheer.verlengen(aE, { gid: gidO2, minuten: 30 }))) === 'BUITEN_BELEID');
    check('verlengen: minuten én dagen, of geen van beide → ONGELDIG; onbekende gid → ONTGRENDELING_ONBEKEND',
      (await code(beheer.verlengen(aE, { gid: gidO2, minuten: 5, dagen: 1 }))) === 'ONGELDIG' && (await code(beheer.verlengen(aE, { gid: gidO2 }))) === 'ONGELDIG'
      && (await code(beheer.verlengen(aE, { gid: randomUUID(), minuten: 5 }))) === 'ONTGRENDELING_ONBEKEND');
    const gidX2 = await ontgrendelVoorTest(XP.id, X, { caps: ['browser.read'], minuten: 60 });
    const vX = await beheer.verlengen(aB, { gid: gidX2, dagen: 30 });
    const grantEind = (await grants.effectiveCaps(X, XP.id)).caps.find((c) => c.capability === 'browser.read')!.expiresAt;
    check('verlengen prive door de beheerder: gekapt op het einde van de toestemmingen (3 dagen), audit owner.extensie.verlengd',
      vX.ok && vX.gekapt && Math.abs(vX.ontgrendeling.eind - new Date(grantEind).getTime()) < 2000 && (await audits('owner.extensie.verlengd', X)) === 1, JSON.stringify(vX.ontgrendeling));
    await beheer.beleidZetten(aE, { userId: B, priveAan: true }); // eigenaar mag het beleid van de beheerder wel
    const tokB = randomToken(32);
    const BP = await store.createAgent(B, `Chrome B (${T})`, 'browser', sha256(tokB), {}, undefined, { commandKeyEnc: sealCommandKey(newCommandKey(), B, sha256(tokB)), version: '0.6.2', ruimte: 'prive' });
    const gidB = await ontgrendelVoorTest(BP.id, B, { caps: ['browser.read'], minuten: 30 });
    check('beheerder verlengt zijn eigen toegang niet (NIET_AAN_JEZELF), maar mag zichzelf wel intrekken',
      (await code(beheer.verlengen(aB, { gid: gidB, minuten: 10 }))) === 'NIET_AAN_JEZELF' && (await beheer.intrekkenVoor(aB, { userId: B })).ingetrokken === 1);

    // ---------------------------------------------------------------- intrekken door beheer
    const gidX3 = (await eo.actieveOntgrendeling(XP.id, X))?.id;
    const voor2 = meldingen.length;
    const ix = await beheer.intrekkenVoor(aB, { userId: X, ruimte: 'prive' });
    const naX3 = (await sys.query('SELECT reden_einde, ingetrokken_door FROM app.extensie_ontgrendelingen WHERE id = $1', [gidX3])).rows[0];
    check('intrekken door de beheerder (ruimte prive): reden beheer, melding aan de gebruiker, audit bij beiden', ix.ingetrokken === 1 && naX3.reden_einde === 'beheer'
      && naX3.ingetrokken_door === 'beheer' && meldingen.slice(voor2).some((m) => m.userId === X && m.kind === 'security')
      && (await audits('owner.extensie.beheer.ingetrokken', X)) === 1 && (await audits('owner.extensie.beheer.ingetrokken', B)) >= 2);
    check('intrekken: ongeldige ruimte/agentId → ONGELDIG', (await code(beheer.intrekkenVoor(aB, { userId: X, ruimte: 'beheer' }))) === 'ONGELDIG' && (await code(beheer.intrekkenVoor(aB, { userId: X, agentId: 'x' }))) === 'ONGELDIG');
    check('eigenaar trekt zijn eigen toegang in via beheer: geen melding naar zichzelf', (await beheer.intrekkenVoor(aE, { userId: E })).ingetrokken === 1 && !meldingen.some((m) => m.userId === E));

    // ---------------------------------------------------------------- koppelen: twee sloten, alleen hetzelfde slot vervangen
    const pid = `slot${T}`.replace(/[^A-Za-z0-9]/g, '');
    const s1 = await store.createAgent(X, 'Chrome slot', 'browser', sha256(randomToken(32)), {}, undefined, { pairingId: pid, ruimte: 'prive', version: '0.6.2' });
    const s2 = await store.createAgent(X, 'Chrome slot', 'browser', sha256(randomToken(32)), {}, undefined, { pairingId: pid, ruimte: 'technisch', version: '0.6.2' });
    const weg = await store.revokePreviousPairing(X, s2.id, pid, 'Chrome slot', 'browser', 'technisch');
    const s3 = await store.createAgent(X, 'Chrome slot', 'browser', sha256(randomToken(32)), {}, undefined, { pairingId: pid, ruimte: 'prive', version: '0.6.2' });
    const weg2 = await store.revokePreviousPairing(X, s3.id, pid, 'Chrome slot', 'browser', 'prive');
    check('opnieuw koppelen (zelfde pairingId) vervangt alleen hetzelfde slot: technisch laat prive staan; nieuw prive vervangt het oude prive',
      weg.length === 0 && weg2.length === 1 && weg2[0] === s1.id && !!(await store.getAgent(X, s2.id)));

    // ---------------------------------------------------------------- pair geeft ruimte; /self geeft ruimte + techRecht; code voor het technische slot alleen voor een browser
    const { handler } = await import('../../backend/index');
    const evt = (method: string, pad: string, body: unknown, headers: Record<string, string> = {}) => ({
      headers: { host: 'mcp.tarasevych.com', origin: 'https://mcp.tarasevych.com', 'content-type': 'application/json', 'user-agent': 'eenheid', ...headers },
      body: body === undefined ? '' : JSON.stringify(body), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {},
      requestContext: { http: { method, path: pad, sourceIp: '203.0.113.7', userAgent: 'eenheid' } },
    });
    const koppelcode = async (uid: string, ruimte: 'prive' | 'technisch', alleen: string | null) => {
      const c = pairingCode();
      await store.createPairingCode(uid, sha256(c), ruimte, alleen);
      return c;
    };
    const cT = await koppelcode(O, 'technisch', 'browser');
    const pc = await handler(evt('POST', '/api/owner/agents/pair', { code: cT, name: 'pc', platform: 'linux' }) as never);
    const pb = await handler(evt('POST', '/api/owner/agents/pair', { code: cT, name: 'Chrome O2', platform: 'browser', version: '0.6.2', pairingId: `po${T}`.replace(/[^A-Za-z0-9]/g, '') }) as never);
    const pbJ = JSON.parse(String(pb.body));
    check('koppelcode voor het technische slot (alleen_platform browser): een pc → PAIRING_CODE_INVALID; de browser → ruimte technisch in het antwoord',
      pc.statusCode === 400 && pb.statusCode === 200 && pbJ.ruimte === 'technisch' && typeof pbJ.commandKey === 'string' && (await store.getAgent(O, pbJ.agentId))?.ruimte === 'technisch', `${pc.statusCode} ${pb.statusCode} ${pb.body}`);
    const cP = await koppelcode(X, 'prive', null);
    const px = JSON.parse(String((await handler(evt('POST', '/api/owner/agents/pair', { code: cP, name: 'Chrome X2', platform: 'browser', version: '0.6.2' }) as never)).body));
    const selfO = JSON.parse(String((await handler(evt('GET', '/api/owner/agents/self', undefined, { authorization: `Bearer ${pbJ.token}` }) as never)).body));
    const selfX = JSON.parse(String((await handler(evt('GET', '/api/owner/agents/self', undefined, { authorization: `Bearer ${px.token}` }) as never)).body));
    check('/self: ruimte van de koppeling + techRecht (O heeft een tech-profiel, X niet); geen andere persoonsgegevens',
      px.ruimte === 'prive' && selfO.ruimte === 'technisch' && selfO.techRecht === true && selfX.ruimte === 'prive' && selfX.techRecht === false && !('email' in selfX) && !('userId' in selfX), JSON.stringify({ selfO, selfX }));
    void ruimRijen;
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await aiDienstOpruimen(ALLE);
    eo._testReset();
    await sys.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.extensie_beleid WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_grants WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.passkey_uitdagingen WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.passkeys WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [ALLE]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [ALLE]).catch(() => undefined);
    if (verplaatst.length) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl = 'users' AND id = ANY($1)", [verplaatst]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
