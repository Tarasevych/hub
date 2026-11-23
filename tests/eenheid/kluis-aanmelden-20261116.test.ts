// KLUIS-AANMELDEN (16.11.2026) — «вхід, який одразу розшифровує дані» · aanmelden dat meteen ontsleutelt.
// Wens van de eigenaar: wie zich aanmeldt met wachtwoord of passkey, hoeft daarna niet nog eens te ontsleutelen — ook niet op een
// NIEUW apparaat. Deze test loopt over de echte routes en de echte database en bewijst:
//   1. wachtwoord: de eerste aanmelding (sleutel dicht, nog geen omslag) laat een KEK hoogstens 15 min wachten; zodra de mens op een
//      andere manier opent, komt de omslag; na een «herstart» opent een aanmelding met wachtwoord op een nieuwe browser alles meteen;
//   2. de database bevat geen wachtwoord, geen DEK, geen KEK; een verkeerd wachtwoord opent niets; een gewijzigd wachtwoord vervangt
//      de omslag; uitzetten wist hem en de volgende aanmelding opent niets meer; aanzetten vraagt sterke step-up;
//   3. passkey: koppelen en ontgrendelen met de tweede PRF (aanmeldzout) maken de omslag 'passkey-aanmelden'; de aanmelding met die
//      passkey op een NIEUWE browser krijgt omslag + eenmalig token, de browser (echte code: src/platform/sleutelkluis-client.ts)
//      opent hem met de PRF die hij zelf heeft en stuurt de DEK; token eenmalig, verkeerde DEK geweigerd; de server krijgt nooit PRF of KEK;
//   4. ontkoppelen van de passkey wist ook de aanmeldomslag; open ruimtes krijgen de nieuwe sessie als houder.
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';

export async function main(): Promise<number> {
  const { check, einde } = checker('kluis-aanmelden-20261116');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  process.env.SLEUTELKLUIS_SLEUTEL_V1 = randomBytes(32).toString('base64');
  const eigenaar = `kaa-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool('systeem');
  const { vlagGeheugenLeeg } = await import('../../backend/vlaggen');
  const sk = await import('../../backend/sleutelkluis');
  const ska = await import('../../backend/sleutelkluis-aanmelden');
  const client = await import('../../src/platform/sleutelkluis-client');
  const { AANMELD_PRF_ZOUT } = await import('../../shared/sleutelkluis');
  const bron = (f: string) => readFileSync(f, 'utf8');
  type Browser = ReturnType<typeof G.browser>;
  const IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
  const id = (b: Browser, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra), { ip: IP });
  const mail = (b: Browser, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('mail.tarasevych.com', pad, b.ctxBody('mail', extra), { ip: IP });
  const post = (b: Browser, pad: string, body: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, body, { ip: IP });
  const ctx = (b: Browser) => ({ service: 'identity', tabContext: b.tab, sourceOrigin: 'https://id.tarasevych.com', returnTo: 'https://id.tarasevych.com/', locale: 'uk', remember: false });
  // De «authenticator»: PRF = HMAC(geheim van deze passkey, zout) — zoals een echte passkey: vast per passkey en zout, geheim voor de server.
  const prfGeheim = new Map<NepPasskey, Buffer>();
  const prf = (p: NepPasskey, zoutB64: string) => { if (!prfGeheim.has(p)) prfGeheim.set(p, randomBytes(32)); return createHmac('sha256', prfGeheim.get(p)!).update(Buffer.from(zoutB64, 'base64url')).digest(); };
  const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const P = '/api/owner/sleutelkluis';
  const P_VLAGGEN = ['aanmelden-passkey', 'aanmelden-wachtwoord'];
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [P_VLAGGEN])).rows;
  const geheimen: string[] = [];

  try {
    // ------------------------------------------------------------------ voorbereiding: mens met kluis, passkey en wachtwoord
    const oudTijd = Math.floor(Date.now() / 1000) - 3600;
    const A = G.browser(); const aMail = `kaa-a-${T}@example.test`; await A.aanmelden(`sub-a-${T}`, aMail, { authTime: oudTijd });
    const aId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [aMail])).rows[0]?.id as string;
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = $1", [aId]);
    for (const v of P_VLAGGEN) await pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [v, [aId]]);
    vlagGeheugenLeeg();
    const ww = `Lang-wachtwoord-${T}-ÄÖ`;
    { const salt = randomBytes(16); await pool.query("insert into app.records (tbl,id,data) values ('identity_passwords_v1',$1,$2)", [`kaa-ww-${aId}`, { userId: aId, algorithm: 'scrypt', n: 16384, r: 8, p: 1, salt: salt.toString('base64url'), hash: scryptSync(ww, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url'), mustChange: false, createdAt: Date.now(), updatedAt: Date.now() }]); }
    geheimen.push(ww);
    await A.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up' });
    const pk = nieuwePasskey('es256');
    const ro = await id(A, '/api/owner/access/passkeys/registreren/opties');
    await id(A, '/api/owner/access/passkeys/registreren', { uitdagingId: ro.data.uitdagingId, naam: 'Telefoon', transports: ['internal'], ...registreer(pk, ro.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    const sterk = async (b: Browser) => { const so = await id(b, '/api/owner/access/stap-op/passkey/opties'); return id(b, '/api/owner/access/stap-op/passkey', { uitdagingId: so.data.uitdagingId, assertie: bevestig(pk, so.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) }); };
    await sterk(A);
    const aan = await id(A, `${P}/inschakelen`);
    const lade = { userId: aId, ruimte: 'prive' as const };
    check('voorbereiding: kluis aan, sleutel open', aan.status === 200 && (await id(A, `${P}/stand`)).data.stand === 'open', `${aan.status} ${aan.body.slice(0, 120)}`);
    const dekHex = Buffer.from(sk.sleutelOpen(lade)!).toString('hex');
    const herstelcode = String(aan.data.herstelcode || '');
    geheimen.push(dekHex);
    const pkId = (await pool.query('select id::text from app.passkeys where user_id = $1', [aId])).rows[0]?.id as string;

    // ------------------------------------------------------------------ 3a. passkey koppelen met de tweede PRF (aanmeldzout)
    const ko = await id(A, `${P}/passkey/koppelen/opties`);
    const evalPk = Object.values(ko.data.publicKey?.extensions?.prf?.evalByCredential || {})[0] as { first: string; second?: string } | undefined;
    check('koppelen: de server vraagt per passkey twee PRF-zouten, het tweede = het vaste aanmeldzout', evalPk?.second === AANMELD_PRF_ZOUT && !!evalPk?.first && evalPk.first !== AANMELD_PRF_ZOUT);
    const kp = ko.data.passkeys[0];
    const kek1 = await client.kekUitPrf(ab(prf(pk, kp.salt)));
    const envelop = await client.omslaan(kek1, ko.data.dek, kp.aad);
    const aanmeldEnvelop = await client.aanmeldOmslag(ab(prf(pk, AANMELD_PRF_ZOUT)), ko.data.dek, kp.aanmeldAad);
    const kop = await id(A, `${P}/passkey/koppelen`, { uitdagingId: ko.data.uitdagingId, assertie: bevestig(pk, ko.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }), salt: kp.salt, envelop, prfOndersteund: true, aanmeldEnvelop });
    const omslagSoorten = async () => (await pool.query('select soort, houder from app.sleutelkluis_omslag where user_id = $1 and ruimte = $2 order by soort', [aId, 'prive'])).rows as Array<{ soort: string; houder: string }>;
    check('koppelen: ook de omslag «passkey-aanmelden» van deze passkey staat er (browser sloeg om, zelfproef ok)',
      kop.status === 200 && kop.data.aanmelden === true && (await omslagSoorten()).some((r) => r.soort === 'passkey-aanmelden' && r.houder === pkId), `${kop.status} ${kop.body.slice(0, 120)}`);
    check('stand: deze passkey staat bij «aanmelden ontsleutelt meteen»', ((await id(A, `${P}/stand`)).data.omslagen?.aanmeldPasskeys || []).includes(pkId));

    // ------------------------------------------------------------------ 1. wachtwoord: eerste aanmelding, sleutel dicht → wachten
    sk.geheugenLeeg(); ska.aanmeldGeheugenLeeg(); // «herstart na een update»
    const wwLogin = async (b: Browser, wachtwoord: string) => { const s = await post(b, '/api/aanmelden/wachtwoord/start', ctx(b)); return post(b, '/api/aanmelden/wachtwoord/voltooien', { pogingId: s.data.pogingId, email: aMail, password: wachtwoord, code: '' }); };
    const W1 = G.browser();
    const w1 = await wwLogin(W1, ww);
    check('wachtwoord, eerste keer: aangemeld; sleutel nog dicht (er was geen omslag), KEK wacht in het geheugen',
      w1.status === 200 && w1.data.sessionCreated === true && !w1.data.kluisOpen && (await id(W1, `${P}/stand`)).data.stand === 'gesloten' && ska.wachtVoor(lade), `${w1.status} ${w1.body.slice(0, 160)}`);
    check('wachtwoord, eerste keer: nog geen wachtwoordomslag in de database', !(await omslagSoorten()).some((r) => r.soort === 'wachtwoord'));
    // De mens opent één keer op een andere manier (hier: de herstelcode in de kaart) → de omslag komt vanzelf.
    const hc = await id(W1, `${P}/ontgrendelen/herstelcode`, { code: herstelcode });
    await id(W1, `${P}/herstelcode/bevestigen`);
    await new Promise((r) => setTimeout(r, 400));
    check('na één keer openen (herstelcode): de wachtwoordomslag is gemaakt en de KEK is uit het geheugen',
      hc.status === 200 && (await omslagSoorten()).some((r) => r.soort === 'wachtwoord') && !ska.wachtVoor(lade), `${hc.status} ${hc.body.slice(0, 100)}`);
    geheimen.push(String(hc.data.herstelcode || ''));

    // Herstart + NIEUWE browser, alleen het wachtwoord: meteen open.
    sk.geheugenLeeg(); ska.aanmeldGeheugenLeeg();
    const W2 = G.browser();
    const w2 = await wwLogin(W2, ww);
    check('NIEUWE browser na herstart: aanmelden met wachtwoord opent de gegevens meteen (kluisOpen=prive, stand open, ook op mail)',
      w2.status === 200 && Array.isArray(w2.data.kluisOpen) && w2.data.kluisOpen.includes('prive') && (await id(W2, `${P}/stand`)).data.stand === 'open' && (await mail(W2, `${P}/stand`)).data.stand === 'open', `${w2.status} ${w2.body.slice(0, 160)}`);
    check('de sessie van die aanmelding houdt de sleutel (houder «sessie»)', sk.houdersVan(lade).some((h) => h.soort === 'sessie'));
    // verkeerd wachtwoord → geen sessie, niets open
    sk.geheugenLeeg();
    const W3 = G.browser();
    const w3 = await wwLogin(W3, `${ww}x`);
    check('verkeerd wachtwoord: geen sessie, sleutel blijft dicht', w3.status === 401 && sk.sleutelOpen(lade) === null);
    await pool.query("delete from app.login_lockouts where subject like $1", [`wachtwoord:${aMail}:%`]);

    // De database: geen wachtwoord, geen DEK, en de omslag gaat niet open met de sleutels van de server.
    const rij = (await pool.query("select parameters, envelop from app.sleutelkluis_omslag where user_id = $1 and ruimte = 'prive' and soort = 'wachtwoord'", [aId])).rows[0];
    let metServer = false;
    for (const k of ['SLEUTELKLUIS_SLEUTEL_V1', 'TOTP_ENCRYPTION_KEY_V1']) { try { const kek = Buffer.from(String(process.env[k] || ''), 'base64'); sk.omslagOpenen(kek.length === 32 ? kek : Buffer.alloc(32), rij.envelop, `sleutelkluis-omslag|${aId}|prive|wachtwoord|wachtwoord|`); metServer = true; } catch { /* goed */ } }
    check('wachtwoordomslag: scrypt-parameters + eigen zout, en hij gaat NIET open met de serversleutels uit de omgeving', rij?.parameters?.kdf === 'scrypt' && Number(rij?.parameters?.N) >= 65536 && !!rij?.parameters?.salt && !metServer);

    // ------------------------------------------------------------------ 2. wijzigen, uitzetten, aanzetten
    const nieuwWw = `Nieuw-wachtwoord-${T}`;
    geheimen.push(nieuwWw);
    await sk.sleutelOpenen(lade, Buffer.from(dekHex, 'hex'), { soort: 'intern', id: 'test' });
    await ska.wachtwoordGewijzigd(aId, nieuwWw);
    sk.geheugenLeeg();
    // Met het oude wachtwoord gaat de nieuwe omslag niet open (aanmelden met het oude kan niet meer; dit is de rekenproef zelf).
    const kdf = await import('../../backend/sleutelkluis-kdf');
    const r2 = (await pool.query("select parameters, envelop from app.sleutelkluis_omslag where user_id = $1 and ruimte = 'prive' and soort = 'wachtwoord'", [aId])).rows[0];
    let oudOpent = true;
    try { sk.omslagOpenen(await kdf.kekUitWachtwoordAsync(ww, Buffer.from(r2.parameters.salt, 'base64url'), r2.parameters), r2.envelop, `sleutelkluis-omslag|${aId}|prive|wachtwoord|wachtwoord|`); } catch { oudOpent = false; }
    const nieuw = await ska.naWachtwoordAanmelding(aId, nieuwWw, ['nieuwesessie123']);
    check('wachtwoord gewijzigd: nieuwe omslag; het oude wachtwoord opent hem niet, het nieuwe wel', !!r2 && !oudOpent && nieuw.includes('prive'));
    sk.geheugenLeeg();
    await ska.naWachtwoordAanmelding(aId, ww, ['x'.repeat(12)]); // terug naar het echte wachtwoord van het account (wordt «niet passend» → wacht)
    await sk.sleutelOpenen(lade, Buffer.from(dekHex, 'hex'), { soort: 'intern', id: 'test' });
    await new Promise((r) => setTimeout(r, 400));
    check('bron: zetten / verwijderen / tijdelijk wachtwoord van de beheerder roepen de omslag-haken aan (toegangslaag.ts)',
      /wachtwoordGewijzigd\(auth\.user\.id,password\)/.test(bron('backend/toegangslaag.ts')) && (bron('backend/toegangslaag.ts').match(/wachtwoordVervallen\(/g) || []).length >= 3);
    const uit = await id(W2, `${P}/wachtwoord/uit`);
    check('uitzetten (zonder step-up): omslag gewist', uit.status === 200 && !(await omslagSoorten()).some((r) => r.soort === 'wachtwoord'), `${uit.status} ${uit.body.slice(0, 100)}`);
    sk.geheugenLeeg();
    const W4 = G.browser();
    const w4 = await wwLogin(W4, ww);
    check('uitgezet: aanmelden met wachtwoord werkt, maar opent niets en laat ook geen KEK wachten',
      w4.status === 200 && !w4.data.kluisOpen && (await id(W4, `${P}/stand`)).data.stand === 'gesloten' && !ska.wachtVoor(lade) && (await id(W4, `${P}/stand`)).data.wachtwoordOpent === false);
    const aanZonder = await id(W4, `${P}/wachtwoord/aan`);
    check('aanzetten vraagt sterke step-up (een zwakker geheim toelaten)', aanZonder.status === 403 && /STEP_UP/.test(String(aanZonder.data.error)), `${aanZonder.status} ${aanZonder.body.slice(0, 100)}`);

    // ------------------------------------------------------------------ 3b. passkey-aanmelding op een NIEUWE browser
    sk.geheugenLeeg(); ska.aanmeldGeheugenLeeg();
    const N = G.browser();
    const po = await post(N, '/api/aanmelden/passkey/opties', ctx(N));
    check('aanmeldopties: PRF met het vaste aanmeldzout (eval), zonder allowCredentials', po.data.publicKey?.extensions?.prf?.eval?.first === AANMELD_PRF_ZOUT && Array.isArray(po.data.publicKey?.allowCredentials) && po.data.publicKey.allowCredentials.length === 0);
    const pv = await post(N, '/api/aanmelden/passkey/voltooien', { uitdagingId: po.data.uitdagingId, assertie: bevestig(pk, po.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    const k = pv.data.kluis as { token: string; omslagen: Array<{ ruimte: 'prive' | 'technisch'; envelop: string; aad: string }> } | undefined;
    check('passkey-aanmelding: sessie + omslag van de prive-ruimte + eenmalig token; sleutel nog dicht tot de browser antwoordt',
      pv.status === 200 && pv.data.sessionCreated === true && !!k?.token && k.omslagen.length === 1 && k.omslagen[0].ruimte === 'prive' && sk.sleutelOpen(lade) === null, `${pv.status} ${pv.body.slice(0, 200)}`);
    // De browser: PRF van zijn passkey met het aanmeldzout → KEK → DEK (echte browsercode).
    const kekL = await client.kekUitPrf(ab(prf(pk, AANMELD_PRF_ZOUT)));
    const dekL = await client.omslagOpenen(kekL, k!.omslagen[0].envelop, k!.omslagen[0].aad);
    const verkeerd = await post(N, '/api/aanmelden/kluis', { token: k!.token, ruimte: 'prive', dek: randomBytes(32).toString('hex') });
    check('een verkeerde DEK met het token → 403, sleutel dicht', verkeerd.status === 403 && sk.sleutelOpen(lade) === null, `${verkeerd.status} ${verkeerd.body.slice(0, 80)}`);
    // Het token is per ruimte eenmalig: na een verkeerde poging is het voor prive verbruikt → nieuwe aanmelding.
    const po2 = await post(N, '/api/aanmelden/passkey/opties', ctx(N));
    const pv2 = await post(N, '/api/aanmelden/passkey/voltooien', { uitdagingId: po2.data.uitdagingId, assertie: bevestig(pk, po2.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    const k2 = pv2.data.kluis as typeof k;
    const goed = await post(N, '/api/aanmelden/kluis', { token: k2!.token, ruimte: 'prive', dek: dekL });
    check('passkey-aanmelding op een nieuwe browser: de DEK uit de eigen PRF opent de gegevens meteen (stand open op id én mail)',
      goed.status === 200 && dekL === dekHex && (await id(N, `${P}/stand`)).data.stand === 'open' && (await mail(N, `${P}/stand`)).data.stand === 'open', `${goed.status} ${goed.body.slice(0, 100)}`);
    const nogEens = await post(N, '/api/aanmelden/kluis', { token: k2!.token, ruimte: 'prive', dek: dekL });
    check('hetzelfde token een tweede keer → 403 SLEUTELKLUIS_AANMELD_TOKEN', nogEens.status === 403 && nogEens.data.error === 'SLEUTELKLUIS_AANMELD_TOKEN');
    const vreemdToken = await post(G.browser(), '/api/aanmelden/kluis', { token: randomBytes(32).toString('base64url'), ruimte: 'prive', dek: dekL });
    check('verzonnen token → 403', vreemdToken.status === 403);
    const audit = (await pool.query(`SELECT action, details::text AS d FROM app.audit WHERE owner_id = $1 AND action LIKE 'sleutelkluis.%' ORDER BY seq`, [aId])).rows as Array<{ action: string; d: string }>;
    check('audit: ontgrendeld via «wachtwoord-aanmelding» en «passkey-aanmelding»', audit.some((r) => r.d.includes('wachtwoord-aanmelding')) && audit.some((r) => r.d.includes('passkey-aanmelding')));
    // Open ruimte: een volgende aanmelding met de passkey krijgt geen werk, alleen een extra houder.
    const M = G.browser();
    const po3 = await post(M, '/api/aanmelden/passkey/opties', ctx(M));
    const pv3 = await post(M, '/api/aanmelden/passkey/voltooien', { uitdagingId: po3.data.uitdagingId, assertie: bevestig(pk, po3.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    check('sleutel al open: geen omslag terug (niets te doen voor de browser), de nieuwe sessie ziet «open»', pv3.status === 200 && !pv3.data.kluis && (await id(M, `${P}/stand`)).data.stand === 'open');

    // ------------------------------------------------------------------ 3c. ontgrendelen in de kaart maakt de aanmeldomslag ook
    await pool.query("delete from app.sleutelkluis_omslag where user_id = $1 and soort = 'passkey-aanmelden'", [aId]);
    sk.geheugenLeeg();
    const oo = await id(M, `${P}/passkey/ontgrendelen/opties`);
    const om = oo.data.omslagen[0];
    const ev = Object.values(oo.data.publicKey?.extensions?.prf?.evalByCredential || {})[0] as { first: string; second?: string };
    const dekK = await client.omslagOpenen(await client.kekUitPrf(ab(prf(pk, ev.first))), om.envelop, om.aad);
    const aEnv = await client.aanmeldOmslag(ab(prf(pk, ev.second!)), dekK, om.aanmeldAad);
    const ont = await id(M, `${P}/passkey/ontgrendelen`, { uitdagingId: oo.data.uitdagingId, assertie: bevestig(pk, oo.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }), dek: dekK, aanmeldEnvelop: aEnv });
    check('ontgrendelen met passkey (kaart) maakt de aanmeldomslag opnieuw', ont.status === 200 && ont.data.aanmelden === true && (await omslagSoorten()).some((r) => r.soort === 'passkey-aanmelden'), `${ont.status} ${ont.body.slice(0, 100)}`);

    // ------------------------------------------------------------------ 4. geen geheimen op schijf; ontkoppelen
    const dump = JSON.stringify((await pool.query(
      `select (select coalesce(json_agg(o), '[]') from app.sleutelkluis_omslag o where o.user_id = $1)::text as a,
              (select coalesce(json_agg(r.data), '[]') from app.records r where r.data::text like '%' || $1 || '%')::text as b,
              (select coalesce(json_agg(x.details), '[]') from app.audit x where x.owner_id = $1)::text as c`, [aId])).rows);
    const PRF_HEX = [prf(pk, AANMELD_PRF_ZOUT).toString('hex'), prf(pk, AANMELD_PRF_ZOUT).toString('base64url')];
    check('op schijf (omslagen, records, audit): geen wachtwoord, geen DEK, geen PRF-uitkomst', ![...geheimen.filter(Boolean), ...PRF_HEX].some((g) => dump.includes(g)));
    await sterk(M);
    const los = await id(M, `${P}/passkey/ontkoppelen`, { passkeyId: pkId });
    check('passkey ontkoppelen wist ook de aanmeldomslag', los.status === 200 && !(await omslagSoorten()).some((r) => r.soort.startsWith('passkey')), `${los.status} ${los.body.slice(0, 80)}`);

    // ------------------------------------------------------------------ bron: de draden in de browser
    const zg = bron('src/aanmelden/AanmeldZonderGoogle.tsx');
    check('aanmeldpagina: passkey met PRF (aanmeldzout), PRF verlaat de browser niet (prf niet in de assertie), daarna /api/aanmelden/kluis',
      /passkeyAanmeldenMetPrf\(/.test(zg) && /const \{ prf, prf2: _p2, \.\.\.assertie \} = a;/.test(zg) && zg.includes("'/api/aanmelden/kluis'"));
    const kp2 = bron('src/platform/kluis-poort.tsx'), sec = bron('src/SleutelkluisSectie.tsx');
    check('kaart en instellingen: prf2 nooit in de assertie, wel de aanmeldomslag', /prf: _p, prf2, \.\.\.assertie/.test(kp2) && /prf:_p,prf2,\.\.\.assertie/.test(sec) && /prf,prf2,\.\.\.assertie/.test(sec) && /aanmeldEnvelop/.test(kp2));
    check('instellingen: rij «Пароль» met waarschuwing en uitleg van het risico, uk + nl', /data-omslag='wachtwoord'/.test(sec) && /AlertTriangle/.test(sec) && /хто скопіює базу даних/.test(sec) && /wie de database kopieert/.test(sec));
    const mig = bron('migrations/0289_sleutelkluis_aanmelden.sql');
    check('migratie 0289: nieuwe soorten in de check, voorkeurtabel met RLS, herhaalbaar', /'wachtwoord', 'passkey-aanmelden'/.test(mig) && /ENABLE ROW LEVEL SECURITY/.test(mig) && /DROP CONSTRAINT IF EXISTS/.test(mig) && /CREATE TABLE IF NOT EXISTS/.test(mig));
    check('publieke route /api/aanmelden/kluis staat in beide lijsten (auth-poort en aanmelden-methoden)', bron('server/platform/auth-poort.ts').includes("'POST /api/aanmelden/kluis'") && bron('backend/aanmelden-methoden.ts').includes("'POST /api/aanmelden/kluis'"));
  } finally {
    sk.geheugenLeeg(); ska.aanmeldGeheugenLeeg();
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    vlagGeheugenLeeg();
    await closePool().catch(() => undefined);
  }
  return einde();
}
