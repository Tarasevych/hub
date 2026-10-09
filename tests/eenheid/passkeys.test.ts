// Passkeys per gebruiker — Instellingen → «Способи входу» (backend/passkeys.ts, migratie 0023, RUNBOOK §13).
// Volledig via de echte handler (nagebootste Google, echte sessies, echte step-up) en echte WebAuthn-handtekeningen
// (nep-passkey): registratie en step-up per gebruiker, isolatie tussen gebruikers (routes én RLS), herstelcodes met
// passkey-bevestiging, het eigenaar-only recht «Може схвалювати оновлення сервера», rpId/origins en root rp-bijwerken.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-passkey';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';

const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
const GOOGLE_AAGUID = 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4';

export async function main(): Promise<number> {
  const { check, einde } = checker('passkeys');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const basis = mkdtempSync(join(tmpdir(), 'passkeys-test-'));
  const inbox = join(basis, 'inbox'); const statusDir = join(basis, 'status'); mkdirSync(inbox); mkdirSync(statusDir);
  const sleutels = join(basis, 'goedkeur-passkeys.json'); const rechten = join(basis, 'mcp-rechten.json');
  writeFileSync(sleutels, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: ['https://admin.tarasevych.com', 'https://id.tarasevych.com'], sleutels: [] }));
  writeFileSync(rechten, JSON.stringify({ 'passkey-goedkeuring': true }));
  const ENV = ['GOEDKEUR_SLEUTELS', 'GOEDKEUR_INBOX', 'MCP_RECHTEN_PAD', 'OPDRACHT_STATUS_DIR', 'PASSKEY_RP_ID', 'PASSKEY_ORIGINS', 'OWNER_EMAIL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_INBOX: inbox, MCP_RECHTEN_PAD: rechten, OPDRACHT_STATUS_DIR: statusDir });
  delete process.env.PASSKEY_RP_ID; delete process.env.PASSKEY_ORIGINS;
  const eigenaar = `pk-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  type B = ReturnType<typeof G.browser>;
  const id = (b: B, pad: string, extra: Record<string, unknown> = {}, service = 'identity') =>
    b.verzoek(`${service === 'identity' ? 'id' : service}.tarasevych.com`, pad, b.ctxBody(service, extra));
  const P = '/api/owner/access/passkeys';
  /** Opties halen en registreren met een nep-passkey (o = afwijkende rpId/origin/vlaggen). */
  const registreerMet = async (b: B, pk: NepPasskey, o: Parameters<typeof registreer>[2] = {}, naam = '', service = 'identity') => {
    const opt = await id(b, `${P}/registreren/opties`, {}, service);
    if (opt.status !== 200) return { opt, reg: opt };
    const reg = await id(b, `${P}/registreren`, { uitdagingId: opt.data.uitdagingId, naam, transports: ['internal', 'hybrid', 'vreemd'], ...registreer(pk, opt.data.publicKey.challenge, o) }, service);
    return { opt, reg };
  };
  const stapOpMet = async (b: B, pk: NepPasskey, o: Parameters<typeof bevestig>[2] = {}) => {
    const opt = await id(b, '/api/owner/access/stap-op/passkey/opties');
    if (opt.status !== 200) return opt;
    return id(b, '/api/owner/access/stap-op/passkey', { uitdagingId: opt.data.uitdagingId, assertie: bevestig(pk, opt.data.publicKey.challenge, o) });
  };

  try {
    // ---------------------------------------------------------------- kern + root: rpId en origins
    check('kern: rpId tarasevych.com; root accepteert alleen admin + id (hub niet)', kern.STANDAARD_RP.rpId === 'tarasevych.com' && kern.STANDAARD_RP.origins.includes('https://admin.tarasevych.com') && kern.STANDAARD_RP.origins.includes('https://id.tarasevych.com') && !kern.STANDAARD_RP.origins.some((x) => x.includes('hub.')));
    check('kern: originHoortBijRp (https, geen poort/pad, zelfde domein)', kern.originHoortBijRp('https://hub.tarasevych.com', 'tarasevych.com') && kern.originHoortBijRp('https://tarasevych.com', 'tarasevych.com')
      && !kern.originHoortBijRp('http://id.tarasevych.com', 'tarasevych.com') && !kern.originHoortBijRp('https://id.tarasevych.com:8443', 'tarasevych.com') && !kern.originHoortBijRp('https://tarasevych.com.evil.example', 'tarasevych.com')
      && !kern.originHoortBijRp('https://eviltarasevych.com', 'tarasevych.com') && !kern.originHoortBijRp('https://id.tarasevych.com/pad', 'tarasevych.com'));
    check('kern: sleutelbestand met een vreemde origin valt terug op de standaard', !kern.normaliseerSleutelbestand({ rpId: 'tarasevych.com', origins: ['https://evil.example'] }).origins.includes('https://evil.example'));
    const pkm = await import('../../backend/passkeys');
    process.env.PASSKEY_ORIGINS = 'https://id.tarasevych.com,https://evil.example,http://hub.tarasevych.com';
    const rpTest = pkm.passkeyRp();
    delete process.env.PASSKEY_ORIGINS;
    check('app: PASSKEY_ORIGINS buiten het rpId-domein of zonder https vallen weg', rpTest.origins.length === 1 && rpTest.origins[0] === 'https://id.tarasevych.com');
    check('app: passkeySoort (telefoon via hybrid, beveiligingssleutel, apparaat, wachtwoordbeheerder)', pkm.passkeySoort('', ['hybrid']) === 'telefoon' && pkm.passkeySoort('', ['usb', 'nfc']) === 'beveiligingssleutel'
      && pkm.passkeySoort('', ['internal']) === 'apparaat' && pkm.passkeySoort('', ['internal', 'hybrid'], true) === 'wachtwoordbeheerder' && pkm.passkeySoort(GOOGLE_AAGUID.replace(/-/g, ''), ['hybrid', 'internal']) === 'wachtwoordbeheerder'
      && pkm.passkeySoort('cb69481e8ff7403993ec0a2729a154a8', ['usb']) === 'beveiligingssleutel' && pkm.passkeySoort('', []) === 'onbekend');
    check('app: transportsVoorGet voegt hybrid toe, leeg = niet beperken', JSON.stringify(pkm.transportsVoorGet(['internal'])) === '["internal","hybrid"]' && JSON.stringify(pkm.transportsVoorGet(['hybrid', 'internal'])) === '["hybrid","internal"]' && pkm.transportsVoorGet([]) === undefined && pkm.transportsVoorGet(null) === undefined);
    {
      // Gesynchroniseerde passkeys (Google/iCloud, ook via QR van de telefoon) hebben BE/BS-vlaggen en teller 0: kern (ook root) moet ze aannemen.
      const sync = nieuwePasskey('es256', 0);
      const reg = kern.verifieerRegistratie({ ...registreer(sync, 'c1', { be: true, bs: true, aaguid: GOOGLE_AAGUID, origin: 'https://id.tarasevych.com' }), verwachteUitdaging: 'c1', rpId: 'tarasevych.com', origins: ['https://id.tarasevych.com'] });
      const sl = reg.ok ? [{ credentialId: reg.credentialId, alg: reg.alg, jwk: reg.jwk, label: 'telefoon' }] : [];
      const as1 = kern.verifieerAssertie({ assertie: bevestig(sync, 'c2', { be: true, bs: true, origin: 'https://admin.tarasevych.com' }), verwachteUitdaging: 'c2', rpId: 'tarasevych.com', origins: [...kern.STANDAARD_RP.origins], sleutels: sl });
      const as2 = kern.verifieerAssertie({ assertie: bevestig(sync, 'c3', { be: true, bs: false, origin: 'https://admin.tarasevych.com' }), verwachteUitdaging: 'c3', rpId: 'tarasevych.com', origins: [...kern.STANDAARD_RP.origins], sleutels: sl });
      const zonderUv = kern.verifieerAssertie({ assertie: bevestig(sync, 'c4', { be: true, bs: true, uv: false, origin: 'https://admin.tarasevych.com' }), verwachteUitdaging: 'c4', rpId: 'tarasevych.com', origins: [...kern.STANDAARD_RP.origins], sleutels: sl });
      check('kern/root: BE+BS-vlaggen breken registratie en assertie niet; teller 0 → 0 blijft geldig; UV blijft verplicht',
        reg.ok && (reg.vlaggen & kern.VLAG.BE) !== 0 && (reg.vlaggen & kern.VLAG.BS) !== 0 && as1.ok && as2.ok && (as1 as { vlaggen: number }).vlaggen === (0x01 | 0x04 | 0x08 | 0x10)
        && kern.tellerOk(0, 0) && !zonderUv.ok && (zonderUv as { code: string }).code === 'GEEN_VERIFICATIE', JSON.stringify([reg.ok, as1, as2, zonderUv]).slice(0, 300));
    }
    const rp = pkm.passkeyRp();
    check('app: standaard rpId tarasevych.com met origins id/admin/hub', rp.rpId === 'tarasevych.com' && ['id', 'admin', 'hub'].every((h) => rp.origins.includes(`https://${h}.tarasevych.com`)) && rp.origins.length === 3);

    const root = (bestand: unknown) => {
      const f = join(basis, `rp-${randomBytes(3).toString('hex')}.json`); writeFileSync(f, JSON.stringify(bestand));
      const r = spawnSync(process.execPath, [HULP, 'rp-bijwerken'], { env: { ...process.env, GOEDKEUR_SLEUTELS: f, GOEDKEUR_STAAT: join(basis, 'staat'), GOEDKEUR_INBOX: inbox, GOEDKEUR_STATUS_DIR: statusDir, GOEDKEUR_RECHTEN: rechten, GOEDKEUR_GROEP: 'nogroup' }, encoding: 'utf8' });
      return { status: r.status, na: JSON.parse(readFileSync(f, 'utf8')), err: r.stderr };
    };
    const leeg = root({ versie: 1, rpId: 'admin.tarasevych.com', origins: ['https://admin.tarasevych.com'], sleutels: [] });
    check('root: rp-bijwerken zet een leeg bestand om naar tarasevych.com + admin/id', leeg.status === 0 && leeg.na.rpId === 'tarasevych.com' && leeg.na.origins.length === 2 && leeg.na.origins.includes('https://id.tarasevych.com'), leeg.err);
    const nogmaals = root(leeg.na);
    check('root: rp-bijwerken is idempotent', nogmaals.status === 0 && nogmaals.na.rpId === 'tarasevych.com');
    const oudPk = nieuwePasskey();
    const oudReg = kern.verifieerRegistratie({ ...registreer(oudPk, 'c', { rpId: 'admin.tarasevych.com' }), verwachteUitdaging: 'c', rpId: 'admin.tarasevych.com', origins: ['https://admin.tarasevych.com'] });
    const metSleutel = root({ versie: 1, rpId: 'admin.tarasevych.com', origins: ['https://admin.tarasevych.com'], sleutels: oudReg.ok ? [{ credentialId: oudReg.credentialId, alg: oudReg.alg, jwk: oudReg.jwk, label: 'oud' }] : [] });
    check('root: rp-bijwerken laat een bestand met sleutels ongemoeid (exit 1)', oudReg.ok && metSleutel.status === 1 && metSleutel.na.rpId === 'admin.tarasevych.com' && metSleutel.na.sleutels.length === 1);

    // ---------------------------------------------------------------- gebruikers
    const O = G.browser(); await O.aanmelden(`sub-o-${T}`, eigenaar, { authTime: oud });
    const A = G.browser(); const aMail = `pk-a-${T}@example.test`; await A.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    const Bb = G.browser(); const bMail = `pk-b-${T}@example.test`; await Bb.aanmelden(`sub-b-${T}`, bMail, { authTime: oud });
    const aId = await idRij(aMail), bId = await idRij(bMail), oId = await idRij(eigenaar);
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = any($1)", [[aId, bId]]);

    const leegA = await id(A, `${P}/lijst`);
    check('lijst: gewone gebruiker ziet eigen (lege) lijst, zonder goedkeur-velden', leegA.status === 200 && Array.isArray(leegA.data.passkeys) && leegA.data.passkeys.length === 0 && !('goedkeuring' in leegA.data), `${leegA.status} ${leegA.body.slice(0, 120)}`);
    check('registreren: zonder recente bevestiging → 403 STEP_UP_REQUIRED', (await id(A, `${P}/registreren/opties`)).data.error === 'STEP_UP_REQUIRED');
    check('step-up met passkey zonder passkey → GEEN_PASSKEY (dan TOTP/Google)', (await id(A, '/api/owner/access/stap-op/passkey/opties')).data.error === 'GEEN_PASSKEY');
    await A.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up' });
    await Bb.aanmelden(`sub-b-${T}`, bMail, { intent: 'step-up' });

    // registratie-opties
    const opt = await id(A, `${P}/registreren/opties`);
    const pkOpt = opt.data.publicKey || {};
    check('registratie-opties: rpId tarasevych.com, UV required, resident key preferred, attestation none, user.id ≠ account-id', opt.status === 200 && pkOpt.rp?.id === 'tarasevych.com' && pkOpt.authenticatorSelection?.userVerification === 'required' && pkOpt.authenticatorSelection?.residentKey === 'preferred' && pkOpt.attestation === 'none' && pkOpt.user?.id && pkOpt.user.id !== aId && !String(pkOpt.user.id).includes(aId), JSON.stringify(pkOpt).slice(0, 200));

    check('registratie-opties: geen authenticatorAttachment en geen hints (browser toont alle keuzes, ook telefoon via QR)', opt.status === 200 && !('authenticatorAttachment' in (pkOpt.authenticatorSelection || {})) && !('hints' in pkOpt), JSON.stringify(pkOpt.authenticatorSelection) + JSON.stringify(pkOpt.hints));
    // origins: alleen id/admin/hub
    const geweigerd: string[] = [];
    for (const origin of ['https://evil.example', 'http://id.tarasevych.com', 'https://id.tarasevych.com:8443', 'https://tarasevych.com.evil.example', 'https://mail.tarasevych.com']) {
      const r = await registreerMet(A, nieuwePasskey(), { origin });
      if (r.reg.data.error !== 'PASSKEY_ORIGIN_ONJUIST') geweigerd.push(`${origin}:${r.reg.data.error}`);
    }
    check('registratie: andere origins geweigerd (evil, http, poort, lookalike, ander subdomein)', geweigerd.length === 0, geweigerd.join(' '));
    const verkeerdRp = await registreerMet(A, nieuwePasskey(), { rpId: 'admin.tarasevych.com', origin: 'https://admin.tarasevych.com' });
    check('registratie: passkey voor de oude rpId admin.tarasevych.com geweigerd', verkeerdRp.reg.data.error === 'PASSKEY_RPID_ONJUIST', verkeerdRp.reg.body.slice(0, 100));
    check('registratie: zonder gebruikersverificatie geweigerd', (await registreerMet(A, nieuwePasskey(), { uv: false })).reg.data.error === 'PASSKEY_GEEN_VERIFICATIE');

    const a1 = nieuwePasskey('es256', 5), a2 = nieuwePasskey('ed25519'), b1 = nieuwePasskey();
    const rA1 = await registreerMet(A, a1, { origin: 'https://id.tarasevych.com', be: true, bs: true, aaguid: GOOGLE_AAGUID });
    const rA2 = await registreerMet(A, a2, {}, 'Laptop', 'hub');
    const rB1 = await registreerMet(Bb, b1, { origin: 'https://admin.tarasevych.com' }, 'Telefoon B');
    check('registratie vanaf id, hub en admin geaccepteerd', rA1.reg.status === 200 && rA2.reg.status === 200 && rB1.reg.status === 200, `${rA1.reg.body.slice(0, 80)} | ${rA2.reg.body.slice(0, 80)} | ${rB1.reg.body.slice(0, 80)}`);
    const pA1 = rA1.reg.data.passkey || {}, pA2 = rA2.reg.data.passkey || {}, pB1 = rB1.reg.data.passkey || {};
    check('registratie: AAGUID-hint, BE/BS (gesynchroniseerd) en standaardnaam', pA1.aanbieder === 'Google Password Manager' && pA1.naam === 'Google Password Manager' && pA1.synchroniseerbaar === true && pA1.gesynchroniseerd === true && pA2.gesynchroniseerd === false && pA2.naam === 'Laptop', JSON.stringify(pA1));
    check('registratie: soort en viaTelefoon per passkey (Google Менеджер паролів = wachtwoordbeheerder)', pA1.soort === 'wachtwoordbeheerder' && pA1.viaTelefoon === true && Array.isArray(pA1.transports) && !pA1.transports.includes('vreemd'), JSON.stringify(pA1));
    check('registratie: gewone gebruiker krijgt geen goedkeur-status', !('goedkeuring' in pA1) && !('goedkeuring' in pB1));
    const dubbel = await id(A, `${P}/registreren`, { uitdagingId: rA1.opt.data.uitdagingId, ...registreer(a1, rA1.opt.data.publicKey.challenge) });
    check('registratie: challenge is eenmalig', dubbel.data.error === 'UITDAGING_ONGELDIG');
    const nogEens = await registreerMet(A, a1);
    check('registratie: dezelfde passkey twee keer → PASSKEY_BESTAAT_AL', nogEens.reg.data.error === 'PASSKEY_BESTAAT_AL', nogEens.reg.body.slice(0, 100));
    const optA = await id(A, `${P}/registreren/opties`);
    const kaping = await id(Bb, `${P}/registreren`, { uitdagingId: optA.data.uitdagingId, ...registreer(nieuwePasskey(), optA.data.publicKey.challenge) });
    check('isolatie: B kan de registratie-challenge van A niet gebruiken', kaping.data.error === 'UITDAGING_ONGELDIG');
    const audit = (await pool.query("select count(*)::int n from app.audit where owner_id=$1 and action='passkey_toegevoegd'", [aId])).rows[0].n;
    check('audit: passkey_toegevoegd per registratie', audit === 2, `n=${audit}`);

    // isolatie
    const lA = await id(A, `${P}/lijst`), lB = await id(Bb, `${P}/lijst`);
    check('isolatie: elke gebruiker ziet alleen eigen passkeys', lA.data.passkeys.length === 2 && lB.data.passkeys.length === 1 && lB.data.passkeys[0].id === pB1.id && !lA.data.passkeys.some((x: { id: string }) => x.id === pB1.id));
    check('isolatie: B kan de passkey van A niet hernoemen of verwijderen', (await id(Bb, `${P}/hernoemen`, { id: pA1.id, naam: 'van B' })).status === 404 && (await id(Bb, `${P}/verwijderen`, { id: pA1.id })).status === 404);
    const optB = await id(Bb, '/api/owner/access/stap-op/passkey/opties');
    check('isolatie: step-up-opties van B noemen alleen de passkey van B', optB.data.publicKey.allowCredentials.length === 1);
    check('step-up-opties: transports niet beperkt — opgeslagen lijst plus hybrid (QR met telefoon)', (optB.data.publicKey.allowCredentials[0].transports || []).includes('hybrid') && (optB.data.publicKey.allowCredentials[0].transports || []).includes('internal'), JSON.stringify(optB.data.publicKey.allowCredentials[0]));
    const metAvoorB = await id(Bb, '/api/owner/access/stap-op/passkey', { uitdagingId: optB.data.uitdagingId, assertie: bevestig(a2, optB.data.publicKey.challenge) });
    check('isolatie: B kan geen step-up doen met de passkey van A', metAvoorB.data.error === 'PASSKEY_SLEUTEL_ONBEKEND', metAvoorB.body.slice(0, 100));
    const { alsGebruiker } = await import('../../backend/ai-grants');
    if (process.env.DATABASE_URL_APP) {
      const gezien = await alsGebruiker(bId, async (q) => Number((await q('select count(*)::int n from app.passkeys where user_id = $1', [aId])).rows[0].n));
      let schrijf = 'toegestaan';
      try { await alsGebruiker(bId, (q) => q("insert into app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam) values ($1, $2, -7, '{}', $3, 'x')", [aId, randomBytes(20).toString('base64url'), 'a'.repeat(64)])); } catch { schrijf = 'geweigerd'; }
      const upd = await alsGebruiker(bId, async (q) => (await q("update app.passkeys set naam = 'gekaapt' where user_id = $1", [aId])).rowCount);
      check('RLS: mijnruimte_app ziet, schrijft en wijzigt geen passkeys van een ander', gezien === 0 && schrijf === 'geweigerd' && upd === 0, `gezien=${gezien} schrijf=${schrijf} upd=${upd}`);
    } else check('RLS: overgeslagen (geen DATABASE_URL_APP)', true);

    // hernoemen
    const hn = await id(A, `${P}/hernoemen`, { id: pA1.id, naam: '  Pixel  ' });
    check('hernoemen: eigen passkey, naam opgeschoond; lege naam geweigerd', hn.status === 200 && hn.data.naam === 'Pixel' && (await id(A, `${P}/hernoemen`, { id: pA1.id, naam: '   ' })).data.error === 'NAAM_ONGELDIG');

    // step-up met passkey in een nieuwe sessie
    const A2 = G.browser(); await A2.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    check('step-up: nieuwe sessie zonder bevestiging → verwijderen 403 STEP_UP_REQUIRED', (await id(A2, `${P}/verwijderen`, { id: pA2.id })).data.error === 'STEP_UP_REQUIRED');
    check('step-up: assertie zonder UV geweigerd', (await stapOpMet(A2, a1, { uv: false })).data.error === 'PASSKEY_GEEN_VERIFICATIE');
    const A3 = G.browser(); await A3.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    const optA2 = await id(A2, '/api/owner/access/stap-op/passkey/opties');
    check('step-up: challenge van een andere sessie (zelfde gebruiker) geweigerd', (await id(A3, '/api/owner/access/stap-op/passkey', { uitdagingId: optA2.data.uitdagingId, assertie: bevestig(a1, optA2.data.publicKey.challenge) })).data.error === 'UITDAGING_ONGELDIG');
    check('step-up: oude teller (gekloonde sleutel) geweigerd', (await stapOpMet(A2, a1, { teller: 5 })).data.error === 'PASSKEY_TELLER_TERUG');
    const so = await stapOpMet(A2, a1);
    check('step-up: geldige passkey-assertie → bevestigd', so.status === 200 && so.data.ok === true, so.body.slice(0, 100));
    check('step-up: geldt alleen voor die sessie', (await id(A3, `${P}/verwijderen`, { id: pA2.id })).data.error === 'STEP_UP_REQUIRED');
    const naGebruik = (await id(A2, `${P}/lijst`)).data.passkeys.find((x: { id: string }) => x.id === pA1.id);
    check('step-up: laatst gebruikt en teller bijgewerkt', !!naGebruik?.laatstGebruiktOp && Number((await pool.query('select sign_count from app.passkeys where id=$1', [pA1.id])).rows[0].sign_count) > 5);
    check('step-up: met de bevestiging kan de passkey weg', (await id(A2, `${P}/verwijderen`, { id: pA2.id })).status === 200 && (await id(A2, `${P}/lijst`)).data.passkeys.length === 1);

    // herstelcodes
    if (Date.now() % 30000 > 25000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
    const stap = Math.floor(Date.now() / 30000);
    const ts = await id(A, '/api/owner/access/totp/start');
    const tc = await id(A, '/api/owner/access/totp/confirm', { code: totpCode(ts.data.secret, stap) });
    check('herstel: TOTP instellen geeft eenmalig herstelcodes', ts.status === 200 && tc.status === 200 && (tc.data.recoveryCodes || []).length === 10, `${ts.status} ${tc.status}`);
    const snap1 = await id(A, '/api/owner/access/snapshot');
    const rec1 = (snap1.data.factors || []).find((f: { id: string }) => f.id === 'recovery');
    const pkF = (snap1.data.factors || []).find((f: { id: string }) => f.id === 'passkey');
    check('herstel: status «niet als bewaard gemarkeerd»; snapshot telt passkeys', rec1?.enrolled === true && !rec1.bekekenOp && pkF?.count === 1, JSON.stringify(rec1) + JSON.stringify(pkF));
    const bek = await id(A, '/api/owner/access/recovery/bekeken');
    check('herstel: «Я зберіг коди» zet bekekenOp', bek.status === 200 && ((bek.data.factors || []).find((f: { id: string }) => f.id === 'recovery')?.bekekenOp || 0) > 0);
    const A4 = G.browser(); await A4.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    const zonder = await id(A4, '/api/owner/access/recovery/rotate', {});
    check('herstel: nieuwe codes zonder code en zonder passkey-bevestiging geweigerd', zonder.status >= 400 && !zonder.data.recoveryCodes, `${zonder.status} ${zonder.body.slice(0, 80)}`);
    check('herstel: foute code geweigerd', !(await id(A4, '/api/owner/access/recovery/rotate', { code: '000000' })).data.recoveryCodes);
    await stapOpMet(A4, a1);
    const rot = await id(A4, '/api/owner/access/recovery/rotate', {});
    const rec2 = ((await id(A4, '/api/owner/access/snapshot')).data.factors || []).find((f: { id: string }) => f.id === 'recovery');
    check('herstel: na passkey-bevestiging nieuwe codes (eenmalig getoond), bewaard-status opnieuw leeg', rot.status === 200 && rot.data.recoveryCodes?.length === 10 && rot.data.recoveryCodes[0] !== tc.data.recoveryCodes[0] && !rec2?.bekekenOp, `${rot.status} ${rot.body.slice(0, 80)}`);

    // venster «Підтвердіть доступ»: methoden + herstelcode als step-up
    const A5 = G.browser(); await A5.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    const m5 = await id(A5, '/api/owner/access/stap-op/methoden');
    check('methoden: e-mail en alleen ja/nee per manier (passkey, app, herstelcode, Google), nog niet bevestigd', m5.status === 200 && m5.data.email === aMail && m5.data.methoden?.passkey === true && m5.data.methoden?.totp === true && m5.data.methoden?.herstelcode === true && m5.data.methoden?.google === true && m5.data.geldigTot === 0 && m5.data.maxAgeSeconds === 300 && !/secret|hash|code"/i.test(m5.body.replace(/herstelcode/g, '')), m5.body.slice(0, 200));
    const mB = await id(Bb, '/api/owner/access/stap-op/methoden');
    check('methoden: gebruiker zonder app en codes → alleen Google (en passkey als die er is)', mB.status === 200 && mB.data.methoden?.totp === false && mB.data.methoden?.herstelcode === false && mB.data.methoden?.google === true, mB.body.slice(0, 200));
    check('methoden: zonder sessie 401', (await G.browser().verzoek('id.tarasevych.com', '/api/owner/access/stap-op/methoden', { service: 'identity', tabContext: 'x'.repeat(48) })).status === 401);
    check('herstelcode-step-up: foute code geweigerd', (await id(A5, '/api/owner/access/stap-op', { methode: 'herstelcode', code: 'ABCDEF123456' })).data.error === 'ACCESS_RECOVERY_INVALID');
    check('herstelcode-step-up: zonder codes → STEP_UP_RECOVERY_NOT_ENROLLED', (await id(Bb, '/api/owner/access/stap-op', { methode: 'herstelcode', code: 'ABCDEF123456' })).data.error === 'STEP_UP_RECOVERY_NOT_ENROLLED');
    const hc = await id(A5, '/api/owner/access/stap-op', { methode: 'herstelcode', code: ` ${String(rot.data.recoveryCodes?.[0] || '').toLowerCase()} ` });
    check('herstelcode-step-up: geldige code → bevestigd, één code minder', hc.status === 200 && hc.data.stepUp === 'herstelcode' && hc.data.resterend === 9, hc.body.slice(0, 120));
    check('herstelcode-step-up: daarna 5 min geldig op die sessie (methoden.geldigTot, passkey toevoegen mag)', (await id(A5, '/api/owner/access/stap-op/methoden')).data.geldigTot > Date.now() && (await id(A5, `${P}/registreren/opties`)).status === 200);
    const A6 = G.browser(); await A6.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    check('herstelcode-step-up: dezelfde code werkt geen tweede keer', (await id(A6, '/api/owner/access/stap-op', { methode: 'herstelcode', code: rot.data.recoveryCodes?.[0] })).data.error === 'ACCESS_RECOVERY_INVALID');
    check('herstelcode-step-up: geldt alleen voor die sessie', (await id(A6, `${P}/registreren/opties`)).data.error === 'STEP_UP_REQUIRED');
    check('geen verzwakking: met TOTP vraagt «nieuwe herstelcodes» nog steeds de TOTP-code of een passkey (herstelcode-step-up telt niet)', !(await id(A5, '/api/owner/access/recovery/rotate', {})).data.recoveryCodes);
    check('geen verzwakking: TOTP-step-up zonder methode accepteert geen herstelcode', (await id(A6, '/api/owner/access/stap-op', { code: rot.data.recoveryCodes?.[1] })).data.error === 'ACCESS_TOTP_INVALID');
    // herstelcodes: gemaskeerd overzicht, gebruikte code doorgestreept met datum, invoer met streepjes, «Відкликати всі»
    const codes0 = (rot.data.recoveryCodes || []) as string[];
    const ov1 = await id(A5, '/api/owner/access/recovery/overzicht');
    const r0 = (ov1.data.codes || []).find((c: { nr: number }) => c.nr === 1);
    check('herstel-overzicht: 10 regels, gebruikte code «gebruikt» met datum, «Залишилося 9 з 10», alleen hint (2 tekens), geen hashes of codes',
      ov1.status === 200 && ov1.data.codes?.length === 10 && r0?.status === 'gebruikt' && r0.gebruiktOp > 0 && ov1.data.resterend === 9 && ov1.data.totaal === 10 && r0.hint === codes0[0].slice(-2)
      && (ov1.data.codes || []).every((c: { hint: string }) => c.hint.length === 2) && !/hash/i.test(ov1.body) && !codes0.some((c) => ov1.body.includes(c)), ov1.body.slice(0, 300));
    const A7 = G.browser(); await A7.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    const metStreep = await id(A7, '/api/owner/access/stap-op', { methode: 'herstelcode', code: codes0[2].match(/.{4}/g)!.join('-').toLowerCase() });
    check('herstelcode: invoer «abcd-efgh-ijkl» (streepjes, kleine letters) werkt ook', metStreep.status === 200 && metStreep.data.resterend === 8, metStreep.body.slice(0, 120));
    const A8 = G.browser(); await A8.aanmelden(`sub-a-${T}`, aMail, { authTime: oud });
    const intrekZonder = await id(A8, '/api/owner/access/recovery/intrekken');
    check('«Відкликати всі» zonder step-up → 403 STEP_UP_REQUIRED, codes blijven', intrekZonder.status === 403 && intrekZonder.data.error === 'STEP_UP_REQUIRED' && (await id(A5, '/api/owner/access/recovery/overzicht')).data.resterend === 8);
    const intrek = await id(A7, '/api/owner/access/recovery/intrekken');
    const st = (intrek.data.codes || []).map((c: { status: string }) => c.status);
    check('«Відкликати всі» met step-up: resterend 0, ongebruikte → «ingetrokken», gebruikte blijven «gebruikt»', intrek.status === 200 && intrek.data.resterend === 0 && intrek.data.ingetrokkenOp > 0 && st.filter((x: string) => x === 'ingetrokken').length === 8 && st.filter((x: string) => x === 'gebruikt').length === 2, intrek.body.slice(0, 200));
    const naIntrek = await id(A8, '/api/owner/access/stap-op', { methode: 'herstelcode', code: codes0[4] });
    check('na intrekken: een eerder geldige code werkt niet meer', naIntrek.status >= 400 && naIntrek.data.stepUp !== 'herstelcode', naIntrek.body.slice(0, 120));
    // Google-step-up vanaf id.tarasevych.com komt terug op dezelfde pagina (hervatten); een gewone aanmelding op id → hub.
    const terug = await A6.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods?lang=uk' });
    check('Google-step-up op id: returnTo = dezelfde pagina (/methods)', terug.cb.data.returnTo === 'https://id.tarasevych.com/methods?lang=uk' && terug.authUrl.searchParams.get('prompt') === 'select_account' && terug.authUrl.searchParams.get('max_age') === '0', `${terug.cb.status} ${terug.cb.body.slice(0, 200)}`);
    check('Google-step-up op id: daarna bevestigd voor die sessie', (await id(A6, `${P}/registreren/opties`)).status === 200);
    const vreemd = await A6.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up', service: 'identity', returnTo: 'https://evil.example/methods' });
    check('Google-step-up op id: returnTo naar een andere origin geweigerd', vreemd.start.data.error === 'OWNER_TRANSACTION_RETURN_TO_INVALID' || vreemd.start.status >= 400, vreemd.start.body.slice(0, 120));
    const gewoon = await G.browser().aanmelden(`sub-a-${T}`, aMail, { intent: 'login', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });
    check('gewone aanmelding op id: nog steeds naar hub', gewoon.cb.data.returnTo === 'https://hub.tarasevych.com', `${gewoon.cb.status} ${gewoon.cb.body.slice(0, 200)}`);

    // eigenaar-only recht
    const nietEig = await Promise.all(['goedkeuring/aanvragen', 'goedkeuring/annuleren', 'goedkeuring/bevestigen/opties', 'goedkeuring/intrekken/opties', 'goedkeuring/bevestigen', 'goedkeuring/intrekken'].map((r) => id(A, `${P}/${r}`, { id: pA1.id })));
    check('niet-eigenaar: alle goedkeur-routes 403 OWNER_REQUIRED, niets in de inbox', nietEig.every((r) => r.status === 403 && r.data.error === 'OWNER_REQUIRED') && readdirSync(inbox).length === 0, nietEig.map((r) => r.data.error).join(','));
    await O.aanmelden(`sub-o-${T}`, eigenaar, { intent: 'step-up' });
    const o1 = nieuwePasskey('es256', 1);
    const rO = await registreerMet(O, o1, {}, 'Telefoon eigenaar');
    const lO = await id(O, `${P}/lijst`);
    check('eigenaar: eigen passkey «Лише вхід», root-rpId klopt', rO.reg.status === 200 && lO.data.passkeys[0]?.goedkeuring === 'alleen-aanmelden' && lO.data.goedkeuring?.rpKlopt === true && lO.data.goedkeuring?.schakelaar === true, rO.reg.body.slice(0, 100));
    check('eigenaar: kan de passkey van een andere gebruiker niet laten promoveren', (await id(O, `${P}/goedkeuring/aanvragen`, { id: pA1.id })).status === 404 && (await id(O, `${P}/goedkeuring/bevestigen/opties`, { id: pA1.id })).status === 404);
    check('eigenaar: op hub geen goedkeur-routes (alleen id/admin)', (await id(O, `${P}/goedkeuring/aanvragen`, { id: rO.reg.data.passkey.id }, 'hub')).data.error === 'OWNER_REQUIRED');
    const aanv = await id(O, `${P}/goedkeuring/aanvragen`, { id: rO.reg.data.passkey.id });
    check('eigenaar: aanvragen → alleen een aanmelding voor root (eerste: SSH-opdracht)', aanv.status === 200 && aanv.data.eerste === true && readdirSync(inbox).some((f) => f.startsWith('sleutel-aanmelding-')) && JSON.parse(readFileSync(sleutels, 'utf8')).sleutels.length === 0, aanv.body.slice(0, 120));
    // Een niet-eigenaar-passkey kan nooit goedkeuren: root vertrouwt alleen zijn eigen bestand.
    const rootHulp = (...args: string[]) => spawnSync(process.execPath, [HULP, ...args], { env: { ...process.env, GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_STAAT: join(basis, 'staat'), GOEDKEUR_INBOX: inbox, GOEDKEUR_STATUS_DIR: statusDir, GOEDKEUR_RECHTEN: rechten, GOEDKEUR_GROEP: 'nogroup' }, encoding: 'utf8' });
    const ssh = rootHulp('toevoegen', String(aanv.data.sshOpdracht).split(' ').pop() || '');
    const b = kern.normaliseerSleutelbestand(JSON.parse(readFileSync(sleutels, 'utf8')));
    const u = kern.uitdagingVoor('goedkeuren', { voorstelId: '00000000-0000-4000-8000-000000000000', versie: '20261009-120000', sha256: 'a'.repeat(64), nonce: randomBytes(32).toString('base64url'), verloopt: Date.now() + 200000 });
    const vA = kern.verifieerAssertie({ assertie: bevestig(a1, u), verwachteUitdaging: u, rpId: b.rpId, origins: b.origins, sleutels: b.sleutels });
    const vO = kern.verifieerAssertie({ assertie: bevestig(o1, u), verwachteUitdaging: u, rpId: b.rpId, origins: b.origins, sleutels: b.sleutels });
    const vHub = kern.verifieerAssertie({ assertie: bevestig(o1, u, { origin: 'https://hub.tarasevych.com' }), verwachteUitdaging: u, rpId: b.rpId, origins: b.origins, sleutels: b.sleutels });
    check('root: na SSH mag de eigenaarspasskey goedkeuren; die van een gewone gebruiker niet; vanaf hub niet', ssh.status === 0 && vO.ok && !vA.ok && (vA as { code: string }).code === 'SLEUTEL_ONBEKEND' && !vHub.ok && (vHub as { code: string }).code === 'ORIGIN_ONJUIST', `${ssh.stderr} ${JSON.stringify(vA)} ${JSON.stringify(vHub)}`);
    check('eigenaar: status «Може схвалювати оновлення»', (await id(O, `${P}/lijst`)).data.passkeys[0]?.goedkeuring === 'kan-goedkeuren');
    check('eigenaar: passkey die mag goedkeuren kan niet verwijderd worden', (await id(O, `${P}/verwijderen`, { id: rO.reg.data.passkey.id })).data.error === 'PASSKEY_KAN_GOEDKEUREN');
    const o2 = nieuwePasskey();
    const rO2 = await registreerMet(O, o2, {}, 'Laptop eigenaar');
    await id(O, `${P}/goedkeuring/aanvragen`, { id: rO2.reg.data.passkey.id });
    const bo = await id(O, `${P}/goedkeuring/bevestigen/opties`, { id: rO2.reg.data.passkey.id });
    const bz = await id(O, `${P}/goedkeuring/bevestigen`, { uitdagingId: bo.data.uitdagingId, assertie: bevestig(o2, bo.data.publicKey.challenge) });
    check('promoveren: een sleutel die nog niet mag goedkeuren kan zichzelf niet bevestigen', bz.data.error === 'PASSKEY_SLEUTEL_ONBEKEND', bz.body.slice(0, 100));
    const bo2 = await id(O, `${P}/goedkeuring/bevestigen/opties`, { id: rO2.reg.data.passkey.id });
    const bz2 = await id(O, `${P}/goedkeuring/bevestigen`, { uitdagingId: bo2.data.uitdagingId, assertie: bevestig(o1, bo2.data.publicKey.challenge) });
    rootHulp('verwerk');
    check('promoveren: met de al goedgekeurde passkey → root voegt de tweede toe', bz2.status === 200 && JSON.parse(readFileSync(sleutels, 'utf8')).sleutels.length === 2, bz2.body.slice(0, 100));
    const oudeRoutes = await id(O, '/api/owner/uitrol/passkey/registreren/opties', {}, 'admin');
    check('oude registratie onder /api/owner/uitrol/passkey/ bestaat niet meer', oudeRoutes.status === 404 || oudeRoutes.status === 405, `${oudeRoutes.status}`);
    void oId;

    // statisch: UI-teksten
    const labels = readFileSync('src/service-tab-labels.ts', 'utf8');
    const ui = readFileSync('src/access-plane-panels.tsx', 'utf8') + readFileSync('src/PasskeysSection.tsx', 'utf8');
    check('ui: menu «Способи входу» / «Aanmeldmethoden»; geen sms-kaart; eigenaar-schakelaar aanwezig', /methods: \['Способи входу', 'Aanmeldmethoden'\]/.test(labels) && !/data-access-factor='sms'/.test(ui) && /Може схвалювати оновлення сервера/.test(ui));
    const stapUi = ['src/platform/stap-op.ts', 'src/platform/bevestig-toegang.tsx', 'src/PasskeysSection.tsx', 'src/access-plane-panels.tsx', 'src/AccessPlaneView.tsx'].map((f) => readFileSync(f, 'utf8'));
    check('ui: geen window.prompt/confirm/alert meer in step-up en «Способи входу»', stapUi.every((t) => !/\b(window\.)?(prompt|confirm|alert)\(/.test(t.replace(/\/\/.*$/gm, ''))));
    const venster = stapUi[1];
    check('ui: venster «Підтвердіть доступ» / «Toegang bevestigen», één taal per keer (taal van de pagina)', /'Підтвердіть доступ', 'Toegang bevestigen'/.test(venster) && /paginaTaal\(\)/.test(venster) && /lang === 'nl' \? 1 : 0/.test(venster) && !/\\n\\n/.test(stapUi[0]));
    check('ui: code-invoer autofocus, inputmode numeric, autocomplete one-time-code; «Виникли проблеми?»; 5-minutentip', /autoFocus inputMode='numeric' autoComplete='one-time-code'/.test(venster) && /Виникли проблеми\?/.test(venster) && /протягом 5 хвилин/.test(venster));
    check('ui: hervatten na Google bewaart alleen actie + naam (geen codes) en passkey toevoegen hervat', /actie:'passkey-toevoegen',gegevens:\{naam\}/.test(stapUi[2]) && /neemHervat\('passkey-toevoegen'\)/.test(stapUi[2]) && !/gegevens:\{[^}]*code/.test(stapUi.join('')));
    check('ui: hint «Використовувати телефон або планшет» + QR bij passkey toevoegen; Синхронізовано-badge', /виберіть «Використовувати телефон або планшет» і відскануйте QR-код камерою телефону \(Bluetooth має бути увімкнено\)/.test(stapUi[2]) && /'Синхронізовано','Gesynchroniseerd'/.test(stapUi[2]));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`pk-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query('delete from app.passkeys where user_id = any($1)', [ids]);
      await pool.query('delete from app.passkey_uitdagingen where user_id = any($1)', [ids]);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
      await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]).catch(() => undefined);
    }
    for (const k of ENV) { const v = vorige[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(basis, { recursive: true, force: true });
  }
  await closePool();
  return einde();
}
