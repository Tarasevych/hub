// SEC-002 (12.11.2026), groep g10h: regressie- en bewijssuite voor de bevindingen
//   integraties-01 (zie ook merk-bron-redos-20261112.test.ts), post-06, autorisatie-01, autorisatie-03, http-rand-05,
//   integraties-04 / aanmelden-05 (zie ook telegram-inlog-apparaat-20261112.test.ts) en aanmelden-04.
// Elk blok bewijst de fout zoals ze VOOR de patch bestond (de check faalde toen) en dat ze nu dicht is. Alleen verzonnen geheimen.
import { randomUUID } from 'node:crypto';
import { checker, nepGoogle } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import type { Lade } from '../../shared/ruimte-scheiding';
import { ophaalDomein } from '../../shared/merk-bron';

const sys = () => getPool('systeem');

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10h-20261112');
  const sfx = randomUUID().slice(0, 8);

  // ================================================================ post-06: logo van het domein van een afzender als volgkanaal
  {
    const pepperVoor = process.env.AFZENDER_BEELD_PEPPER;
    process.env.AFZENDER_BEELD_PEPPER = `eenheidstest-g10h-pepper-${randomUUID()}`;
    const mb = await import('../../backend/merk-bron');
    const U = `g10h-post06-${sfx}`;
    const P: Lade = { userId: U, ruimte: 'prive' };
    const opgezocht: string[] = [];
    const nx = () => Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    mb._zetMerkNet({
      txt: async (n: string) => { opgezocht.push(n); throw nx(); },
      adressen: async (h: string) => { opgezocht.push(h); throw nx(); },
    });
    mb._merkBronVergeten();
    const schakelaarVoor = (await sys().query(`SELECT aan FROM app.merk_bron_instelling WHERE sleutel = 'afzender-domeinen'`)).rows[0] as { aan: boolean } | undefined;
    await mb.domeinOphalenZetten(true, 'eenheidstest');
    const ORG = `volger-g10h-${sfx}.test`;
    const SUB = `u-ontvanger-4711.spoor.${ORG}`;
    const raakt = (naam: string) => opgezocht.some((n) => n === naam || n === `default._bimi.${naam}`);
    const merkVoor = (await sys().query(`SELECT 1 FROM app.merk_beeld WHERE sleutel = 'mollie.com'`)).rowCount;
    try {
      check('post-06: ophaalDomein — een onbekend subdomein wordt het organisatiedomein; een domein uit de eigen lijsten blijft zichzelf',
        ophaalDomein(SUB) === ORG && ophaalDomein('news.bank.com.ua') === 'bank.com.ua' && ophaalDomein('mail.voorbeeld.test', (d) => d === 'mail.voorbeeld.test') === 'mail.voorbeeld.test'
        && ophaalDomein('geen domein') === '' && ophaalDomein(ORG) === ORG);

      // 1. De aanval: «From: x@u-<ontvanger>.spoor.<domein van de volger>». De server mag dat subdomein NOOIT benaderen.
      // SEC-002 (afwerking A): de standaard is nu «niet voor onbekende afzenders»; deze aanval gaat over de stand «Завжди».
      await mb.voorkeurZetten(P, { onbekendeAfzenders: true });
      const a1 = await mb.afzenderBeelden(P, [`Nieuwsbrief <x@${SUB}>`]);
      await mb.wachtrijLeeg();
      check('post-06: de server benadert het door de afzender gekozen subdomein niet (geen DNS, geen HTTPS) — alleen het organisatiedomein',
        !opgezocht.some((n) => n.includes('u-ontvanger-4711')) && raakt(ORG) && a1.wachtrij === 1, opgezocht.join(' ').slice(0, 300));
      const neg = await mb.merkRijen([ORG, SUB]);
      check('post-06: de (negatieve) rij staat op het organisatiedomein; een tweede ontvanger-subdomein geeft geen nieuw verzoek',
        neg.has(ORG) && !neg.has(SUB) && await (async () => {
          const voor = opgezocht.length;
          const a2 = await mb.afzenderBeelden(P, [`x@u-ontvanger-9999.spoor.${ORG}`]);
          await mb.wachtrijLeeg();
          return a2.wachtrij === 0 && opgezocht.length === voor;
        })());

      // 2. De strenge stand: «onbekende afzenders» uit → alleen bekende diensten, eigen contacten en een uitdrukkelijke vraag.
      const v0 = await mb.voorkeurLezen(P);
      const v1 = await mb.voorkeurZetten(P, { onbekendeAfzenders: false });
      check('post-06: de keuze «onbekende afzenders» bestaat per mens en ruimte en blijft bewaard (Gravatar/Google ongemoeid)',
        typeof v0.onbekendeAfzenders === 'boolean' && v1.onbekendeAfzenders === false && v1.gravatar === false && v1.googleContacten === false
        && (await mb.voorkeurLezen({ userId: U, ruimte: 'technisch' })).onbekendeAfzenders === mb.ONBEKENDE_AFZENDERS_STANDAARD);
      const ONB = `onbekend-g10h-${sfx}.test`, VRIEND = `vriend-g10h-${sfx}.test`, VERD = `verdacht-g10h-${sfx}.test`, GEVR = `gevraagd-g10h-${sfx}.test`, CONT = `contact-g10h-${sfx}.test`;
      await sys().query(`INSERT INTO app.mail_afzenders (user_id, ruimte, adres, domein, status, verzonden) VALUES ($1, 'prive', $2, $3, 'onbekend', 2)`, [U, `jan@${VRIEND}`, VRIEND]);
      await sys().query(`INSERT INTO app.mail_afzenders (user_id, ruimte, adres, domein, status, verzonden) VALUES ($1, 'prive', $2, $3, 'verdacht', 5)`, [U, `nep@${VERD}`, VERD]);
      await sys().query(`INSERT INTO app.mail_afzenders (user_id, ruimte, adres, domein, status, in_contacten) VALUES ($1, 'prive', $2, $3, 'onbekend', true)`, [U, `piet@mail.${CONT}`, `mail.${CONT}`]);
      // Hetzelfde adres «gekend» in de ANDERE ruimte telt hier niet.
      await sys().query(`INSERT INTO app.mail_afzenders (user_id, ruimte, adres, domein, status, verzonden) VALUES ($1, 'prive', $2, $3, 'onbekend', 1)`, [`${U}-ander`, `iemand@${ONB}`, ONB]);
      const a3 = await mb.afzenderBeelden(P, [`iemand@${ONB}`, `jan@${VRIEND}`, `nep@${VERD}`, `piet@mail.${CONT}`, `wie@${GEVR}`, 'info@mollie.com']);
      await mb.wachtrijLeeg();
      check('post-06 (streng): een onbekende afzender zet niets in de wachtrij en er gaat niets naar zijn domein', !raakt(ONB) && !raakt(GEVR), opgezocht.join(' ').slice(-300));
      check('post-06 (streng): iemand aan wie de mens zelf schreef en iemand uit zijn contacten krijgen wel een logo (organisatiedomein)', raakt(VRIEND) && raakt(CONT) && !raakt(`mail.${CONT}`));
      check('post-06 (streng): een als verdacht gemerkt adres nooit, ook al schreef de mens er ooit naar', !raakt(VERD));
      check('post-06 (streng): een bekende dienst uit de eigen lijsten blijft werken', raakt('mollie.com') && a3.wachtrij === 3, `wachtrij ${a3.wachtrij}`);
      const a4 = await mb.afzenderBeelden(P, [`wie@${GEVR}`, `iemand@${ONB}`], { toonLogoVoor: [`wie@${GEVR}`] });
      await mb.wachtrijLeeg();
      check('post-06 (streng): na een uitdrukkelijke vraag van de mens («toon het logo») wel, en alleen voor DAT adres', raakt(GEVR) && !raakt(ONB) && a4.wachtrij === 1);
      await mb.voorkeurZetten(P, { onbekendeAfzenders: true });
      const a5 = await mb.afzenderBeelden(P, [`iemand@${ONB}`]);
      await mb.wachtrijLeeg();
      check('post-06: met de keuze «ook onbekende afzenders» (risico, uitdrukkelijk gekozen) gaat de server naar het organisatiedomein', raakt(ONB) && a5.wachtrij === 1);
    } finally {
      await mb.wachtrijLeeg();
      mb._zetMerkNet(null);
      mb._merkBronVergeten();
      await sys().query('DELETE FROM app.mail_afzenders WHERE user_id IN ($1, $2)', [U, `${U}-ander`]).catch(() => undefined);
      await sys().query('DELETE FROM app.afzender_beeld_voorkeur WHERE user_id = $1', [U]).catch(() => undefined);
      await sys().query('DELETE FROM app.merk_beeld WHERE sleutel LIKE $1', [`%g10h-${sfx}.test`]).catch(() => undefined);
      if (!merkVoor) await sys().query(`DELETE FROM app.merk_beeld WHERE sleutel = 'mollie.com'`).catch(() => undefined);
      if (schakelaarVoor) await mb.domeinOphalenZetten(schakelaarVoor.aan, 'eenheidstest'); else await sys().query(`DELETE FROM app.merk_bron_instelling WHERE sleutel = 'afzender-domeinen'`).catch(() => undefined);
      if (pepperVoor === undefined) delete process.env.AFZENDER_BEELD_PEPPER; else process.env.AFZENDER_BEELD_PEPPER = pepperVoor;
    }
  }

  // ================================================================ autorisatie-01 / -03 (opslaglaag): een intrekking blijft staan
  const { db, INTREKKING_BLIJFT } = await import('../../server/platform/db');
  const SESSIE = 'owner_service_sessions_v1', TAB = 'owner_tab_sessions_v1', GRANT = 'owner_browser_grants_v1', PAT = 'api_machine_tokens_v1';
  const opruimen: Array<[string, string]> = [];
  {
    const U = `g10h-auth-${sfx}`;
    check('autorisatie-01/-03: sessies, tabbladrijen, onthouden browsers en API-sleutels staan in INTREKKING_BLIJFT',
      [SESSIE, TAB, GRANT, PAT].every((t) => INTREKKING_BLIJFT.has(t)) && !INTREKKING_BLIJFT.has('users'));
    for (const tabel of [SESSIE, TAB, GRANT, PAT]) {
      const [id] = await db.add(tabel, [{ userId: U, ownerUserId: U, status: 'active', revokedAt: 0, lastSeenAt: 1, tokenHash: `proef-${sfx}` }]);
      opruimen.push([tabel, String(id)]);
      // Het verzoek van de aanvaller leest de rij (momentopname) …
      const [momentopname] = await db.get<Record<string, unknown>>(tabel, [String(id)]);
      // … de eigenaar trekt in (zoals de routes dat doen: het hele record met revokedAt) …
      const T = Date.now();
      await db.update(tabel, [{ id: String(id), record: { ...momentopname!, revokedAt: T, ...(tabel === TAB ? { status: 'signed_out' } : {}), ...(tabel === GRANT ? { hintOnlyAt: T } : {}) } }]);
      // … en dan schrijft het verzoek van de aanvaller zijn OUDE momentopname terug (lastSeenAt bijwerken).
      // (Echte sessierijen hebben vóór hun intrekking vaak helemaal GEEN veld revokedAt: ook dat is «niet ingetrokken».)
      const { revokedAt: _weg, ...zonderVeld } = momentopname as Record<string, unknown>;
      await db.update(tabel, [{ id: String(id), record: { ...zonderVeld, lastSeenAt: 1.5 } }]);
      const [geschreven] = await db.update(tabel, [{ id: String(id), record: { ...momentopname!, lastSeenAt: 2 } }]);
      const [na] = await db.get<Record<string, unknown>>(tabel, [String(id)]);
      check(`autorisatie-01: ${tabel} — een verouderde volledige schrijfactie maakt de intrekking NIET ongedaan (de overige velden komen wel aan)`,
        geschreven === true && na?.revokedAt === T && na?.lastSeenAt === 2 && (tabel !== TAB || na?.status === 'signed_out') && (tabel !== GRANT || na?.hintOnlyAt === T), JSON.stringify(na));
      // Een tweede intrekking of een eigen revokedAt in het nieuwe record wordt gewoon geschreven.
      await db.update(tabel, [{ id: String(id), record: { ...momentopname!, revokedAt: T + 5 } }]);
      const [later] = await db.get<Record<string, unknown>>(tabel, [String(id)]);
      // Controle: ZONDER de bewaking (heractiveren = precies het gedrag van vóór de patch) verdwijnt de intrekking wel.
      await db.update(tabel, [{ id: String(id), record: { ...momentopname!, lastSeenAt: 3 } }], { heractiveren: true });
      const [oud] = await db.get<Record<string, unknown>>(tabel, [String(id)]);
      check(`autorisatie-01: ${tabel} — controle: een nieuw revokedAt wordt geschreven; alleen de bewuste heractivering (= het oude gedrag) wist de intrekking`,
        later?.revokedAt === T + 5 && oud?.revokedAt === 0 && oud?.lastSeenAt === 3);
    }
    // Meerdere rijen in één aanroep: alleen de ingetrokken rij behoudt haar intrekking.
    const ids = (await db.add(SESSIE, [{ userId: U, revokedAt: 0, n: 1 }, { userId: U, revokedAt: 0, n: 2 }, { userId: U, revokedAt: 0, n: 3 }])).map(String);
    for (const i of ids) opruimen.push([SESSIE, i]);
    await db.update(SESSIE, [{ id: ids[1], record: { userId: U, revokedAt: 777, n: 2 } }]);
    await db.update(SESSIE, ids.map((i, n) => ({ id: i, record: { userId: U, revokedAt: 0, n: n + 1, gezien: true } })));
    const rijen = await db.get<Record<string, unknown>>(SESSIE, ids);
    check('autorisatie-01: in één aanroep met meerdere rijen behoudt alleen de ingetrokken rij haar intrekking',
      rijen[0]?.revokedAt === 0 && rijen[1]?.revokedAt === 777 && rijen[2]?.revokedAt === 0 && rijen.every((r) => r?.gezien === true));
    // Andere tabellen: ongewijzigd gedrag (volledige vervanging).
    const [vrij] = await db.add('sec002_g10h_proef', [{ ownerUserId: U, revokedAt: 5 }]);
    opruimen.push(['sec002_g10h_proef', String(vrij)]);
    await db.update('sec002_g10h_proef', [{ id: String(vrij), record: { ownerUserId: U, revokedAt: 0 } }]);
    check('autorisatie-01: een tabel buiten de lijst wordt als voorheen volledig vervangen', (await db.get<Record<string, unknown>>('sec002_g10h_proef', [String(vrij)]))[0]?.revokedAt === 0);

    // «Це був не я» (backend/toegang-context.ts → sessieIntrekken): de intrekking van tab, anker en onthouden browser overleeft een
    // verouderde schrijfactie van de ingetrokken sessie zelf.
    const { sessieIntrekken } = await import('../../backend/toegang-context');
    const [tabId] = await db.add(TAB, [{ userId: U, status: 'active', revokedAt: 0, lastSeenAt: 1 }]);
    const [ankerId] = await db.add(SESSIE, [{ userId: U, revokedAt: 0, lastSeenAt: 1 }]);
    const [grantId] = await db.add(GRANT, [{ userId: U, revokedAt: 0, lastUsedAt: 1 }]);
    opruimen.push([TAB, String(tabId)], [SESSIE, String(ankerId)], [GRANT, String(grantId)]);
    const [tabOud] = await db.get<Record<string, unknown>>(TAB, [String(tabId)]);
    const [ankerOud] = await db.get<Record<string, unknown>>(SESSIE, [String(ankerId)]);
    const [grantOud] = await db.get<Record<string, unknown>>(GRANT, [String(grantId)]);
    const uit = await sessieIntrekken(U, { tab: String(tabId), anker: String(ankerId), grant: String(grantId) }, { sessieId: 'andere-sessie', anker: 'ander-anker', grant: 'andere-grant' });
    await db.update(TAB, [{ id: String(tabId), record: { ...tabOud!, lastSeenAt: 9 } }]);
    await db.update(SESSIE, [{ id: String(ankerId), record: { ...ankerOud!, lastSeenAt: 9 } }]);
    await db.update(GRANT, [{ id: String(grantId), record: { ...grantOud!, lastUsedAt: 9 } }]);
    const [tabNa] = await db.get<Record<string, unknown>>(TAB, [String(tabId)]);
    const [ankerNa] = await db.get<Record<string, unknown>>(SESSIE, [String(ankerId)]);
    const [grantNa] = await db.get<Record<string, unknown>>(GRANT, [String(grantId)]);
    check('autorisatie-01: «Це був не я» — tab, anker en onthouden browser blijven ingetrokken na een verouderde schrijfactie van die sessie',
      uit.tab && uit.anker && uit.grant && tabNa?.status === 'signed_out' && Number(tabNa?.revokedAt) > 0 && Number(ankerNa?.revokedAt) > 0 && Number(grantNa?.revokedAt) > 0, JSON.stringify({ tabNa, ankerNa, grantNa }).slice(0, 300));
  }

  // ================================================================ autorisatie-03: ingetrokken API-sleutel «herleeft» niet; teller atomisch
  {
    const { resolveApiMachineToken, API_MACHINE_TOKEN_TABLE } = await import('../../backend/api-platform-tokens');
    const { createHash, randomBytes } = await import('node:crypto');
    const U = `g10h-pat-${sfx}`;
    await sys().query(`INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb) ON CONFLICT DO NOTHING`, [U, JSON.stringify({ email: `${U}@example.invalid`, status: 'approved', role: 'user', entitlements: ['api-platform'] })]);
    opruimen.push(['users', U]);
    const maak = async () => {
      const sleutel = `tsv_${randomBytes(4).toString('hex')}_${randomBytes(24).toString('base64url')}`; // verzonnen proefsleutel
      const nu = Date.now();
      const [id] = await db.add(API_MACHINE_TOKEN_TABLE, [{ ownerUserId: U, prefix: sleutel.slice(4, 12), tokenHash: createHash('sha256').update(sleutel).digest('hex'), scopes: ['identity.me.read'], label: 'proef', createdAt: nu, expiresAt: nu + 3600_000, lastUsedAt: 0, revokedAt: 0, rateWindowStart: 0, rateCount: 0 }]);
      opruimen.push([API_MACHINE_TOKEN_TABLE, String(id)]);
      return { id: String(id), kop: { headers: { authorization: `Bearer ${sleutel}` } } as Record<string, unknown> };
    };
    const rij = async (id: string) => (await db.get<Record<string, number>>(API_MACHINE_TOKEN_TABLE, [id]))[0]!;

    // 1. De wedloop, deterministisch: de intrekking valt precies TUSSEN het lezen van de sleutel en het bijwerken van het gebruik
    //    (resolveApiMachineToken leest daartussen het account van de maker).
    const a = await maak();
    const eerste = await resolveApiMachineToken(a.kop);
    const echteGet = db.get;
    let gewapend = true;
    (db as { get: typeof db.get }).get = (async (tabel: string, ids: string[]) => {
      if (gewapend && tabel === 'users' && ids[0] === U) {
        gewapend = false;
        // Wat de route «відкликати ключ» doet: het record met revokedAt terugschrijven.
        const [nu] = await echteGet.call(db, API_MACHINE_TOKEN_TABLE, [a.id]);
        await db.update(API_MACHINE_TOKEN_TABLE, [{ id: a.id, record: { ...(nu as object), revokedAt: Date.now() } }]);
      }
      return echteGet.call(db, tabel, ids);
    }) as typeof db.get;
    let tijdens: Awaited<ReturnType<typeof resolveApiMachineToken>>;
    try { tijdens = await resolveApiMachineToken(a.kop); } finally { (db as { get: typeof db.get }).get = echteGet; }
    const naIntrekking = await rij(a.id);
    const daarna = await resolveApiMachineToken(a.kop);
    check('autorisatie-03: een verzoek dat de sleutel vóór de intrekking las, zet de intrekking niet terug (revokedAt blijft) en wordt zelf geweigerd',
      'token' in eerste && Number(naIntrekking.revokedAt) > 0 && 'errorCode' in tijdens && tijdens.errorCode === 'API_TOKEN_REVOKED' && 'errorCode' in daarna && daarna.errorCode === 'API_TOKEN_REVOKED',
      JSON.stringify({ revokedAt: naIntrekking.revokedAt, tijdens: 'errorCode' in tijdens ? tijdens.errorCode : 'toegelaten', daarna: 'errorCode' in daarna ? daarna.errorCode : 'toegelaten' }));

    // 2. De teller: gelijktijdige verzoeken tellen elk mee (geen verloren verhoging) …
    const b = await maak();
    const twintig = await Promise.all(Array.from({ length: 20 }, () => resolveApiMachineToken(b.kop)));
    const naTwintig = await rij(b.id);
    check('autorisatie-03: 20 gelijktijdige verzoeken → rateCount is precies 20 (atomisch geteld)', twintig.every((r) => 'token' in r) && naTwintig.rateCount === 20 && naTwintig.lastUsedAt > 0, `rateCount ${naTwintig.rateCount}`);
    // … en de grens van 60 per minuut is niet met gelijktijdige verzoeken te omzeilen.
    const c = await maak();
    const tachtig = await Promise.all(Array.from({ length: 80 }, () => resolveApiMachineToken(c.kop)));
    const toegelaten = tachtig.filter((r) => 'token' in r).length, begrensd = tachtig.filter((r) => 'errorCode' in r && r.errorCode === 'API_TOKEN_RATE_LIMITED').length;
    check('autorisatie-03: van 80 gelijktijdige verzoeken komen er precies 60 door, 20 krijgen 429', toegelaten === 60 && begrensd === 20 && (await rij(c.id)).rateCount === 60, `toegelaten ${toegelaten}, begrensd ${begrensd}`);
    // 3. Een nieuw venster begint weer bij 1; een sleutel van een niet meer goedgekeurde maker werkt niet (ongewijzigd).
    await sys().query(`UPDATE app.records SET data = data || jsonb_build_object('rateWindowStart', $2::bigint) WHERE tbl = $1 AND id = $3`, [API_MACHINE_TOKEN_TABLE, Date.now() - 61_000, c.id]);
    const nieuwVenster = await resolveApiMachineToken(c.kop);
    check('autorisatie-03: na het venster van een minuut begint de teller opnieuw', 'token' in nieuwVenster && nieuwVenster.token.rateCount === 1 && (await rij(c.id)).rateCount === 1);
    const vreemd = await resolveApiMachineToken(c.kop, { workspaceId: `bestaat-niet-${sfx}` });
    check('autorisatie-03: een vreemde werkruimte blijft geweigerd', 'errorCode' in vreemd && vreemd.errorCode === 'API_TOKEN_FOREIGN_WORKSPACE');
  }

  // ================================================================ autorisatie-01 (echte routes): de wedloop, deterministisch
  // Slachtoffer (browser 1) trekt de sessie van de aanvaller (browser 2, zelfde account = «gestolen cookie») in met de ECHTE route,
  // precies terwijl het verzoek POST /api/owner/session/bootstrap van de aanvaller tussen «sessie lezen» en «sessie schrijven» zit.
  const G = await nepGoogle({ ownerEmail: `g10h-eig-${sfx}@example.test` });
  try {
    const sub = `g10h-race-${sfx}`, email = `${sub}@example.test`;
    const slachtoffer = G.browser();
    await slachtoffer.aanmelden(sub, email, { intent: 'login', service: 'identity' });
    const uid = String((await sys().query(`SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1`, [email])).rows[0]?.id || '');
    await sys().query(`UPDATE app.records SET data = data || '{"status":"approved"}'::jsonb WHERE tbl = 'users' AND id = $1`, [uid]);
    opruimen.push(['users', uid]);
    /** Eén ronde. `oudGedrag` = db.update zonder de bewaking (precies de code van vóór de patch): het bewijs van de fout zelf. */
    const wedloop = async (oudGedrag: boolean) => {
      const aanvaller = G.browser();
      await aanvaller.aanmelden(sub, email, { intent: 'login' });
      const sessies = (await sys().query(`SELECT id FROM app.records WHERE tbl = $1 AND data->>'userId' = $2 ORDER BY (data->>'createdAt')::bigint`, [SESSIE, uid])).rows as Array<{ id: string }>;
      const doel = sessies[sessies.length - 1]?.id || '';
      const bootstrap = () => aanvaller.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', aanvaller.ctxBody('hub'));
      const voor = await bootstrap();
      const echteUpdate = db.update;
      let gewapend = true, intrek = 0;
      // Het ogenblik van de wedloop: het verzoek van de aanvaller heeft zijn sessie al gelezen en goedgekeurd en staat op het punt
      // haar terug te schrijven — precies dan komt de intrekking van het slachtoffer binnen (en is klaar vóór het schrijven).
      (db as { update: typeof db.update }).update = (async (tabel: string, items: Array<{ id: string; record: Record<string, unknown> }>, opties?: { heractiveren?: boolean }) => {
        if (gewapend && tabel === SESSIE && items[0]?.id === doel) {
          gewapend = false;
          intrek = (await slachtoffer.verzoek('id.tarasevych.com', `/api/owner/identity/security/items/${doel}/revoke`, slachtoffer.ctxBody('identity', { kind: 'session' }))).status;
          if (process.env.G10H_DEBUG) console.log('DEBUG na intrekking', JSON.stringify((await db.get<Record<string, unknown>>(SESSIE, [doel]))[0]?.revokedAt), 'verouderd record revokedAt=', JSON.stringify(items[0].record.revokedAt), opties);
          const uit = await echteUpdate.call(db, tabel, items, oudGedrag ? { heractiveren: true } : opties);
          if (process.env.G10H_DEBUG) console.log('DEBUG na verouderde schrijfactie', JSON.stringify((await db.get<Record<string, unknown>>(SESSIE, [doel]))[0]?.revokedAt));
          return uit;
        }
        return echteUpdate.call(db, tabel, items, opties);
      }) as typeof db.update;
      try { await bootstrap(); } finally { (db as { update: typeof db.update }).update = echteUpdate; }
      const rij = (await db.get<Record<string, unknown>>(SESSIE, [doel]))[0];
      if (process.env.G10H_DEBUG) console.log('DEBUG rij', JSON.stringify(rij).slice(0, 600));
      const na = await bootstrap();
      // De aanvaller hoeft zijn tabblad niet te houden: met dezelfde cookie in een NIEUW tabblad telt alleen de ankersessie.
      const nieuwTab = await aanvaller.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 16) });
      return { sessies: sessies.length, voor: !!voor.data?.user, intrek, revokedAt: Number(rij?.revokedAt || 0), leeftNog: !!na.data?.user || !!nieuwTab.data?.user, na: String(na.data?.state || na.status), nieuwTab: String(nieuwTab.data?.state || nieuwTab.status) };
    };
    const oud = await wedloop(true);
    check('autorisatie-01 (routes) — BEWIJS VAN DE FOUT: zonder de bewaking maakt het lopende bootstrap-verzoek «завершити сеанс» ongedaan (revokedAt weer 0, sessie leeft)',
      oud.voor && oud.intrek === 200 && oud.revokedAt === 0 && oud.leeftNog, JSON.stringify(oud));
    const nieuw = await wedloop(false);
    check('autorisatie-01 (routes): «завершити сеанс» tijdens een lopend bootstrap-verzoek van die sessie blijft staan — de sessie is en blijft ingetrokken',
      nieuw.sessies >= 2 && nieuw.voor && nieuw.intrek === 200 && nieuw.revokedAt > 0 && !nieuw.leeftNog, JSON.stringify(nieuw));
    // Het slachtoffer zelf blijft aangemeld (alleen de doelsessie is geraakt).
    const eigen = await slachtoffer.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', slachtoffer.ctxBody('identity'));
    check('autorisatie-01 (routes): de sessie van het slachtoffer zelf werkt gewoon door', !!eigen.data?.user);
    // Gewoon gebruik: afmelden in een tabblad en daarna opnieuw aanmelden in HETZELFDE tabblad werkt nog (bewuste heractivering).
    const b3 = G.browser();
    await b3.aanmelden(sub, email, { intent: 'login' });
    const in1 = await b3.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', b3.ctxBody('hub'));
    const uitlog = await b3.verzoek('hub.tarasevych.com', '/api/owner/session/logout-current', b3.ctxBody('hub'));
    const uit1 = await b3.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', b3.ctxBody('hub'));
    await b3.aanmelden(sub, email, { intent: 'login' });
    const in2 = await b3.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', b3.ctxBody('hub'));
    check('autorisatie-01 (routes): afmelden in een tabblad en opnieuw aanmelden in hetzelfde tabblad werkt als voorheen',
      !!in1.data?.user && uitlog.status === 200 && !uit1.data?.user && !!in2.data?.user, JSON.stringify({ in1: !!in1.data?.user, uitlog: uitlog.status, uit1: uit1.data?.state || uit1.status, in2: in2.data?.state || in2.status }));

    // «Onthouden browser» (grant) na «вийти всюди»: ontsnapte zijn rij aan de intrekking (revokedAt weer 0 — zoals de wedloop
    // hierboven vóór de patch deed), dan gaf complete-remembered toch een nieuwe sessie zonder Google. Nu telt ook de epoch
    // (zoals replace-tab-remembered al deed): een grant van vóór «вийти всюди» werkt nooit meer.
    {
      const D = G.browser();
      await D.aanmelden(sub, email, { intent: 'login', remember: true });
      await D.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', D.ctxBody('hub'));
      const grantId = ([...D.jar.keys()].find((k) => k.startsWith('tsv_ot_grant_')) || '').slice('tsv_ot_grant_'.length);
      const W = G.browser();
      await W.aanmelden(sub, email, { intent: 'login' });
      await new Promise((r) => setTimeout(r, 5));
      const overal = await W.verzoek('hub.tarasevych.com', '/api/owner/session/logout-account-everywhere', W.ctxBody('hub'));
      const ingetrokken = Number((await db.get<Record<string, unknown>>(GRANT, [grantId]))[0]?.revokedAt || 0) > 0;
      await sys().query(`UPDATE app.records SET data = (data - 'hintOnlyAt') || '{"revokedAt":0}'::jsonb WHERE tbl = $1 AND id = $2`, [GRANT, grantId]);
      const tabD = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 16);
      const tx = await D.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext: tabD, flowMode: 'popup', locale: 'nl' });
      const at = await D.verzoek('id.tarasevych.com', '/api/owner/identity/transactions/attach', { service: 'identity', transactionId: tx.data.transactionId, attachSecret: tx.data.attachSecret, sourceOrigin: 'https://hub.tarasevych.com', locale: 'nl' });
      const cr = await D.verzoek('id.tarasevych.com', '/api/owner/identity/transactions/complete-remembered', { service: 'identity', transactionId: tx.data.transactionId, grantId });
      check('autorisatie-01 (onthouden browser): een grant van vóór «вийти всюди» die aan de intrekking ontsnapte, geeft via complete-remembered GEEN nieuwe sessie zonder Google',
        !!grantId && overal.status === 200 && ingetrokken && tx.status === 200 && at.status === 200 && cr.status === 401 && cr.data.error === 'OWNER_REMEMBERED_REAUTH_REQUIRED',
        JSON.stringify({ grantId: !!grantId, overal: overal.status, ingetrokken, tx: tx.status, at: at.status, cr: cr.status, fout: cr.data.error }));
    }
    // g10h-toets-2: «вийти з облікового запису в цьому оглядачі» zet eerst grants en tabbladen af en draait dat terug als een
    // vervolgstap mislukt. Dat terugdraaien van de EIGEN schrijfactie moet ondanks INTREKKING_BLIJFT werken.
    {
      const terugdraaien = async (mislukt: string) => {
        const B = G.browser();
        await B.aanmelden(sub, email, { intent: 'login', remember: true });
        await B.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', B.ctxBody('hub'));
        const grantId = ([...B.jar.keys()].find((k) => k.startsWith('tsv_ot_grant_')) || '').slice('tsv_ot_grant_'.length);
        const sid = decodeURIComponent([...B.jar.entries()].find(([k]) => k.includes('tsv_ecosystem'))?.[1] || '').split('.')[0];
        const echteUpdate = db.update;
        let gewapend = true;
        (db as { update: typeof db.update }).update = (async (tabel: string, items: Array<{ id: string; record: Record<string, unknown> }>, opties?: { heractiveren?: boolean }) => {
          // Alleen de afmeldschrijfactie zelf laten mislukken (niet het gewone «aanraken» van sessie of tabblad bij de sessiecontrole).
          const afmelding = tabel === TAB ? items.some((i) => i.record.status === 'signed_out') : items.some((i) => Number(i.record.revokedAt || 0) > 0);
          if (gewapend && tabel === mislukt && afmelding && !opties?.heractiveren) { gewapend = false; return items.map(() => false); }
          return echteUpdate.call(db, tabel, items, opties);
        }) as typeof db.update;
        let uitlog: { status: number; data: Record<string, any> };
        try { uitlog = await B.verzoek('hub.tarasevych.com', '/api/owner/session/logout-account-browser', B.ctxBody('hub')); } finally { (db as { update: typeof db.update }).update = echteUpdate; }
        const grant = (await db.get<Record<string, unknown>>(GRANT, [grantId]))[0];
        const tabs = (await sys().query(`SELECT data FROM app.records WHERE tbl = $1 AND data->>'userId' = $2 AND data->>'anchorSessionId' = $3`, [TAB, uid, sid])).rows.map((r: { data: Record<string, unknown> }) => r.data);
        return { status: uitlog.status, grantId, grantRevoked: Number(grant?.revokedAt || 0), grantHint: Number(grant?.hintOnlyAt || 0), tabs };
      };
      const t1 = await terugdraaien(TAB);
      check('g10h-toets-2: mislukt het afmelden van de tabbladen, dan staan de «onthouden browsers» weer zoals vóór het verzoek (geen revokedAt/hintOnlyAt)',
        t1.status >= 400 && !!t1.grantId && t1.grantRevoked === 0 && t1.grantHint === 0, JSON.stringify({ status: t1.status, rev: t1.grantRevoked, hint: t1.grantHint }));
      const t2 = await terugdraaien(SESSIE);
      const actief = t2.tabs.filter((d) => d.status === 'active' && !Number(d.revokedAt || 0)).length;
      check('g10h-toets-2: mislukt het intrekken van het anker, dan zijn ook de al afgemelde tabbladen teruggezet (actief) en de grant hersteld',
        t2.status >= 400 && t2.grantRevoked === 0 && actief >= 1, JSON.stringify({ status: t2.status, rev: t2.grantRevoked, actief }));
    }
    await sys().query(`DELETE FROM app.records WHERE tbl IN ($1, $2, $3) AND data->>'userId' = $4`, [SESSIE, TAB, GRANT, uid]).catch(() => undefined);

    // ============================================================== http-rand-05: limieten en blokkades per /64 (IPv6), niet per adres
    const { limietSleutel } = await import('../../shared/ip-limiet');
    const { rateLimitAfwijzing } = await import('../../server/start');
    const { verifyPasswordLogin } = await import('../../backend/toegangslaag');
    const hex = () => randomUUID().replace(/-/g, '').slice(0, 4);
    const net = () => `2001:db8:${hex()}:${hex()}`;            // een verzonnen /64 (documentatiebereik)
    const adres = (n: string, i: number) => `${n}:${hex()}:${hex()}:${hex()}:${(i + 1).toString(16)}`;
    check('http-rand-05: limietSleutel — IPv6 telt per /64, IPv4 per adres, ::ffff:a.b.c.d is IPv4, onzin blijft ongewijzigd',
      limietSleutel('2001:db8:1:2:aaaa:bbbb:cccc:dddd') === '2001:db8:1:2::/64' && limietSleutel('2001:DB8:1:2::1') === '2001:db8:1:2::/64'
      && limietSleutel('2001:db8:1:3::1') === '2001:db8:1:3::/64' && limietSleutel('2001:db8::1') === '2001:db8:0:0::/64' && limietSleutel('::1') === '0:0:0:0::/64'
      && limietSleutel('[2001:db8:1:2::9]') === '2001:db8:1:2::/64' && limietSleutel('fe80::1%eth0') === 'fe80:0:0:0::/64'
      && limietSleutel('203.0.113.9') === '203.0.113.9' && limietSleutel('::ffff:203.0.113.9') === '203.0.113.9' && limietSleutel('::ffff:cb00:7109') === '203.0.113.9'
      && limietSleutel('64:ff9b::203.0.113.9') === '64:ff9b:0:0::/64' && limietSleutel('unknown') === 'unknown' && limietSleutel('') === '' && limietSleutel('1:2:3') === '1:2:3' && limietSleutel('g::1') === 'g::1');
    // Niet over een minuutgrens heen meten (vaste vensters van één minuut in app.rate_limits).
    const wachtOpVenster = async () => { const s = new Date().getSeconds(); if (s > 50) await new Promise((r) => setTimeout(r, (61 - s) * 1000)); };
    await wachtOpVenster();
    {
      const n = net();
      const uitslagen: number[] = [];
      for (let i = 0; i < 12; i++) uitslagen.push(await rateLimitAfwijzing('POST', '/api/access/password/login', adres(n, i)));
      check('http-rand-05: 12 aanmeldpogingen vanaf 12 adressen uit ÉÉN /64 → na 10 geweigerd (strikte emmer «wachtwoord» per net)',
        uitslagen.slice(0, 10).every((x) => x === 0) && uitslagen[10] > 0 && uitslagen[11] > 0, uitslagen.join(','));
      check('http-rand-05: een ander /64 en een IPv4-adres hebben hun eigen emmer', await rateLimitAfwijzing('POST', '/api/access/password/login', adres(net(), 0)) === 0
        && await rateLimitAfwijzing('POST', '/api/access/password/login', `198.51.100.${1 + Math.floor(Math.random() * 250)}`) === 0);
      const n2 = net();
      let geweigerdOp = 0;
      for (let i = 0; i < 620 && !geweigerdOp; i++) if (await rateLimitAfwijzing('GET', '/api/owner/proef', adres(n2, i)) > 0) geweigerdOp = i + 1;
      check('http-rand-05: de algemene limiet (600/min) telt per /64: het 601e verzoek uit hetzelfde net wordt geweigerd', geweigerdOp === 601, `geweigerd op ${geweigerdOp}`);
      const n3 = net();
      const terug: number[] = [];
      for (let i = 0; i < 32; i++) terug.push(await rateLimitAfwijzing('GET', '/api/aanmelden/telegram/widget-terug', adres(n3, i)));
      check('http-rand-05: GET /api/aanmelden/telegram/widget-terug valt nu echt onder zijn strikte emmer (30/min), ook als GET', terug.slice(0, 30).every((x) => x === 0) && terug[30] > 0, terug.filter((x) => x > 0).length + ' geweigerd');
      await sys().query(`DELETE FROM app.rate_limits WHERE bucket LIKE '%2001:db8:%'`).catch(() => undefined);
    }
    {
      // Blokkade na 5 mislukte wachtwoordpogingen: per (e-mail, /64) — een ander adres uit hetzelfde net is GEEN verse teller.
      const mail = `g10h-slot-${sfx}@example.test`, n = net();
      const st: string[] = [];
      for (let i = 0; i < 7; i++) st.push((await verifyPasswordLogin(mail, `fout-wachtwoord-${i}`, '', adres(n, i))).status);
      check('http-rand-05: 7 foute wachtwoorden vanaf 7 adressen uit één /64 → na 5 pogingen geblokkeerd (ACCESS_LOCKED_TEMPORARILY)',
        st.slice(0, 5).every((x) => x === 'invalid') && st[5] === 'locked' && st[6] === 'locked', st.join(','));
      const ander = await verifyPasswordLogin(mail, 'fout-wachtwoord-x', '', adres(net(), 0));
      const v4a = await verifyPasswordLogin(mail, 'fout-wachtwoord-y', '', '198.51.100.7'), v4b = await verifyPasswordLogin(mail, 'fout-wachtwoord-z', '', '198.51.100.8');
      check('http-rand-05: een ander net en twee verschillende IPv4-adressen worden daardoor niet geblokkeerd (audit-fix 10 blijft: geen wereldwijde blokkade van een account)',
        ander.status === 'invalid' && v4a.status === 'invalid' && v4b.status === 'invalid', [ander.status, v4a.status, v4b.status].join(','));
      await sys().query(`DELETE FROM app.login_lockouts WHERE subject LIKE $1`, [`wachtwoord:${mail}:%`]).catch(() => undefined);
    }
    {
      // Toegangscode inwisselen (publiek, id.*): blokkade na 5 foute codes — ook per /64.
      const gast = G.browser(), n = net();
      const st: number[] = [];
      for (let i = 0; i < 7; i++) st.push((await gast.verzoek('id.tarasevych.com', '/api/gast/inwisselen', { code: `FOUT-${hex()}-${hex()}` }, { ip: adres(n, i) })).status);
      check('http-rand-05: 7 foute toegangscodes vanaf 7 adressen uit één /64 → na 5 pogingen 429 (GAST_GEBLOKKEERD)', st.slice(0, 5).every((x) => x !== 429) && st[5] === 429 && st[6] === 429, st.join(','));
      await sys().query(`DELETE FROM app.login_lockouts WHERE subject LIKE 'gast-inwisselen:%' AND updated_at > now() - interval '5 minutes'`).catch(() => undefined);
    }
  } finally { G.herstel(); }

  // ================================================================ g10h-toets-1 (http-rand-05, buren): gedeelde koppeling van de cloud
  // en toegangsaanvragen telden per VOLLEDIG IPv6-adres: elk adres uit het eigen /64 gaf verse 10 wachtwoordpogingen per 5 min.
  {
    const { createHash, randomBytes, scryptSync } = await import('node:crypto');
    const { bestandenDelenPubliekeRoutes } = await import('../../backend/bestanden-delen');
    const { toegangAanvraagToegestaan } = await import('../../backend/gebruiker-schrijven');
    const hex = () => randomBytes(2).toString('hex');
    const code = randomBytes(24).toString('base64url');
    const zout = randomBytes(16);
    const koppelingId = randomUUID();
    await sys().query(`INSERT INTO app.cloud_deel_koppelingen (id, user_id, code_hash, naam, doel_soort, doel_id, wachtwoord_hash) VALUES ($1, $2, $3, 'proef g10h', 'bestand', 'proef-bestand', $4)`,
      [koppelingId, `g10h-deel-${sfx}`, createHash('sha256').update(code).digest('hex'), `scrypt1$${zout.toString('hex')}$${scryptSync('verzonnen-juist-wachtwoord', zout, 32).toString('hex')}`]);
    const info = bestandenDelenPubliekeRoutes(async () => null)['POST /api/cloud/gedeeld/info'];
    const probeer = async (ip: string, i: number) => {
      const event = { headers: { 'x-forwarded-for': ip, host: 'cloud.tarasevych.com' }, requestContext: { http: { method: 'POST', sourceIp: ip } }, rawPath: '/api/cloud/gedeeld/info', body: '' };
      for (const mw of info) { const r = await (mw as unknown as (c: unknown) => Promise<{ statusCode: number } | undefined>)({ event, body: { code, wachtwoord: `fout-${i}` }, query: {}, params: {} }); if (r) return r.statusCode; }
      return 0;
    };
    try {
      const net = `2001:db8:${hex()}:${hex()}`;
      const st: number[] = [];
      for (let i = 0; i < 11; i++) st.push(await probeer(`${net}:${hex()}:${hex()}::${(i + 1).toString(16)}`, i));
      check('g10h-toets-1: 11 foute wachtwoorden voor een gedeelde koppeling vanaf 11 adressen uit één /64 → de 11e krijgt 429', st.slice(0, 10).every((x) => x === 403) && st[10] === 429, st.join(','));
      const ander = await probeer(`2001:db8:${hex()}:${hex()}::1`, 99), v4 = await probeer(`198.51.100.${10 + Math.floor(Math.random() * 200)}`, 98);
      check('g10h-toets-1: een ander /64 en een IPv4-adres hebben hun eigen emmer (fout wachtwoord = 403, geen 429)', ander === 403 && v4 === 403, `${ander} ${v4}`);
      const net2 = `2001:db8:${hex()}:${hex()}`;
      const aanvragen: boolean[] = [];
      for (let i = 0; i < 31; i++) aanvragen.push(await toegangAanvraagToegestaan(`g10h-aanvraag-${sfx}-${i}`, { requestContext: { http: { sourceIp: `${net2}::${(i + 1).toString(16)}` } } }));
      check('g10h-toets-1: toegangsaanvragen — 31 aanvragen (31 accounts) vanaf 31 adressen uit één /64 → de 31e geweigerd (30 per uur per net)', aanvragen.slice(0, 30).every(Boolean) && aanvragen[30] === false, `${aanvragen.filter(Boolean).length} toegestaan`);
    } finally {
      await sys().query('DELETE FROM app.cloud_deel_koppelingen WHERE id = $1', [koppelingId]).catch(() => undefined);
      await sys().query(`DELETE FROM app.rate_limits WHERE bucket LIKE 'cloud-gedeeld%' OR bucket LIKE 'access-request%2001:db8:%' OR bucket LIKE 'access-request:g10h-aanvraag-%'`).catch(() => undefined);
    }
  }

  for (const [tabel, id] of opruimen) await sys().query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [tabel, id]).catch(() => undefined);
  return einde();
}
