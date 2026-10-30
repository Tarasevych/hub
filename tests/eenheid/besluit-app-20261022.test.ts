// Besluiten van de eigenaar met passkey (22.10.2026, zone B; RUNBOOK §15): de APP-kant (backend/eigenaar-besluit.ts) tegen de echte
// database: alleen de eigenaar (rol + OWNER_EMAIL) op mcp/admin; starten → eenmalige challenge → ondertekenen (echte handtekening via
// nep-passkey, voorcontrole van de app) → bestand in de inbox voor root → status uit het statusbestand van root; de aanvallen aan de
// app-kant (andere gebruiker, nep-eigenaar, verkeerde service, nonce hergebruikt, inhoud gewijzigd na de challenge, vreemde passkey,
// verouderde stand, schakelaar dicht) en RLS (de app-rol ziet alleen eigen rijen).
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import * as bk from '../../deploy/goedkeuring/besluit-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const RP = 'tarasevych.com'; const ORIGIN_MCP = 'https://mcp.tarasevych.com'; const ORIGIN_ADMIN = 'https://admin.tarasevych.com';
function sleutelUit(pk: NepPasskey, label = 'telefoon') {
  const r = kern.verifieerRegistratie({ ...registreer(pk, 'c'), verwachteUitdaging: 'c', rpId: RP, origins: [ORIGIN_ADMIN] });
  if (!r.ok) throw new Error(`registratie: ${r.code}`);
  return { credentialId: r.credentialId, alg: r.alg, jwk: r.jwk, label, vingerafdruk: r.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'test' };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('besluit-app-20261022');
  const w = mkdtempSync(join(tmpdir(), 'besluit-app-'));
  const p = { inbox: join(w, 'inbox'), status: join(w, 'status'), rechten: join(w, 'mcp-rechten.json'), sleutels: join(w, 'goedkeur-passkeys.json'), app: join(w, 'srv') };
  for (const d of [p.inbox, p.status, join(p.app, 'releases')]) mkdirSync(d, { recursive: true });
  for (const r of ['20261022-120000', '20261021-120000']) { mkdirSync(join(p.app, 'releases', r, 'dist-server'), { recursive: true }); writeFileSync(join(p.app, 'releases', r, 'dist-server', 'start.mjs'), '//\n'); writeFileSync(join(p.app, 'releases', r, 'RELEASE-COMMIT'), 'abcdef0123456789\n'); }
  mkdirSync(join(p.app, 'releases', '20261020-120000'), { recursive: true });
  symlinkSync(join(p.app, 'releases', '20261022-120000'), join(p.app, 'current'));
  writeFileSync(join(p.app, 'VORIGE'), `${join(p.app, 'releases', '20261021-120000')}\n`);
  writeFileSync(p.rechten, JSON.stringify({ read: true, 'passkey-goedkeuring': true, externeMcpHosts: ['api.githubcopilot.com'], opdracht: { terugdraaien: false } }));
  const eigenaar = nieuwePasskey('es256', 1);
  const sleutel = sleutelUit(eigenaar);
  writeFileSync(p.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN_ADMIN, 'https://id.tarasevych.com'], sleutels: [] }));
  const oud = { a: process.env.BESLUIT_INBOX, b: process.env.OPDRACHT_STATUS_DIR, c: process.env.MCP_RECHTEN_PAD, d: process.env.GOEDKEUR_SLEUTELS, e: process.env.BESLUIT_APP_ROOT, f: process.env.EXTERNE_MCP_HOSTS };
  Object.assign(process.env, { BESLUIT_INBOX: p.inbox, OPDRACHT_STATUS_DIR: p.status, MCP_RECHTEN_PAD: p.rechten, GOEDKEUR_SLEUTELS: p.sleutels, BESLUIT_APP_ROOT: p.app, EXTERNE_MCP_HOSTS: 'uit-omgeving.example' });

  const m = await import('../../backend/eigenaar-besluit');
  const sys = getPool('systeem');
  const OWNER = `bs-owner-${randomUUID()}`, ANDER = `bs-ander-${randomUUID()}`, NEP = `bs-nep-${randomUUID()}`;
  const users: Record<string, any> = {
    [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: process.env.OWNER_EMAIL || 'eigenaar@test.invalid' },
    [ANDER]: { id: ANDER, role: 'user', status: 'approved', email: `a-${ANDER}@example.test` },
    [NEP]: { id: NEP, role: 'owner', status: 'approved', email: `nep-${NEP}@example.test` },
  };
  for (const u of Object.values(users)) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u.id, { email: u.role === 'owner' ? `${u.id}@example.test` : u.email, role: 'member', status: u.status }]);
  const routes = m.eigenaarBesluitRoutes({ requireSession: async (event: any) => ({ user: users[event.who], service: event.service ?? 'mcp' }) as any });
  const call = async (route: string, who: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {}, ...extra }, body } as any);
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode as number, data, fout: String(data?.error || data?.reasonCode || '') };
  };
  const rootAntwoord = (id: string, body: Record<string, unknown>) => writeFileSync(join(p.status, `besluit-${id.replace(/-/g, '')}.json`), JSON.stringify({ id: id.replace(/-/g, ''), tijd: new Date().toISOString(), ...body }));
  const inboxBestanden = () => readdirSync(p.inbox).filter((n) => n.startsWith('besluit-'));
  const teken = (g: any, pk: NepPasskey = eigenaar, origin = ORIGIN_MCP) => bevestig(pk, g.publicKey.challenge, { origin });

  try {
    // ---------------------------------------------------------------- poort
    check('poort: gewone gebruiker → OWNER_REQUIRED', (await call('POST /api/owner/besluit/overzicht', ANDER)).fout === 'OWNER_REQUIRED');
    check('poort: rol owner met ander e-mailadres is geen eigenaar', (await call('POST /api/owner/besluit/overzicht', NEP)).fout === 'OWNER_REQUIRED');
    check('poort: eigenaar op hub.* geweigerd (alleen mcp/admin)', (await call('POST /api/owner/besluit/overzicht', OWNER, {}, { service: 'hub' })).fout === 'ADMIN_SERVICE_REQUIRED');
    const ov0 = await call('POST /api/owner/besluit/overzicht', OWNER);
    check('overzicht: stand uit de bestanden (hosts uit bestand én omgeving apart, actief/vorige, releases, schakelaars: drie standen)', ov0.status === 200 && JSON.stringify(ov0.data.stand.hosts) === '["api.githubcopilot.com"]' && JSON.stringify(ov0.data.stand.hostsUitOmgeving) === '["uit-omgeving.example"]'
      && ov0.data.stand.actief === '20261022-120000' && ov0.data.stand.vorige === '20261021-120000' && ov0.data.stand.releases.length === 3 && ov0.data.stand.releases.find((r: any) => r.naam === '20261020-120000').bruikbaar === false
      && ov0.data.stand.schakelaars.terugdraaienDirect === false && ov0.data.stand.schakelaars.terugdraaienPasskey === true && ov0.data.passkeys.length === 0, JSON.stringify(ov0.data));
    check('starten: zonder root-passkey → GEEN_PASSKEY (409)', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } })).fout === 'GEEN_PASSKEY');
    writeFileSync(p.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN_ADMIN, 'https://id.tarasevych.com'], sleutels: [sleutel] }));
    check('starten: onbekend soort → SOORT_ONGELDIG', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'herstart', inhoud: {} })).fout === 'SOORT_ONGELDIG');
    check('starten: ongeldige inhoud → INHOUD_ONGELDIG', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['*'] } })).fout === 'INHOUD_ONGELDIG');
    check('starten: terugdraaien naar onbekende/onvolledige release → RELEASE_ONBEKEND', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261020-120000' } })).fout === 'RELEASE_ONBEKEND');
    check('starten: «van» ≠ actieve release → STAND_VERANDERD', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261021-120000', naar: '20261022-120000' } })).fout === 'STAND_VERANDERD');
    check('starten: hostlijst gelijk aan het bestand → GEEN_WIJZIGING', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['API.githubcopilot.com'] } })).fout === 'GEEN_WIJZIGING');
    writeFileSync(p.rechten, JSON.stringify({ read: true, 'passkey-goedkeuring': true, 'terugdraaien-passkey': false, externeMcpHosts: ['api.githubcopilot.com'] }));
    check('starten: "terugdraaien-passkey": false → BESLUIT_UIT', (await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } })).fout === 'BESLUIT_UIT');
    writeFileSync(p.rechten, JSON.stringify({ read: true, 'passkey-goedkeuring': true, externeMcpHosts: ['api.githubcopilot.com'] }));

    // ---------------------------------------------------------------- goede weg: externe hosts
    const g1 = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com', 'MCP.Example.org', 'mcp.example.org'] } });
    check('starten: externe hosts → ontwerp met genormaliseerde inhoud, hash, challenge (rpId, allowCredentials = root-sleutel)', g1.status === 200 && JSON.stringify(g1.data.inhoud) === '{"hosts":["api.githubcopilot.com","mcp.example.org"]}' && g1.data.hash === bk.besluitHash('externe-hosts', g1.data.inhoud) && g1.data.publicKey.rpId === RP && g1.data.publicKey.allowCredentials[0].id === sleutel.credentialId && /^[0-9a-f-]{36}$/.test(g1.data.uitdagingId), JSON.stringify(g1.data));
    const rij1 = (await sys.query('SELECT * FROM app.eigenaar_besluiten WHERE id = $1', [g1.data.id])).rows[0];
    check('db: rij in app.eigenaar_besluiten (ontwerp, eigenaar, hash)', rij1 && rij1.staat === 'ontwerp' && rij1.user_id === OWNER && rij1.hash === g1.data.hash);
    // Aanvallen vóór het tekenen.
    check('ondertekenen: andere gebruiker kan het besluit van de eigenaar niet tekenen', (await call('POST /api/owner/besluit/ondertekenen', ANDER, { id: g1.data.id, uitdagingId: g1.data.uitdagingId, assertie: teken(g1.data) })).status === 403);
    const vreemd = nieuwePasskey();
    check('ondertekenen: assertie van een vreemde passkey → PASSKEY_SLEUTEL_ONBEKEND, rij geweigerd, niets in de inbox', (await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g1.data.id, uitdagingId: g1.data.uitdagingId, assertie: teken(g1.data, vreemd) })).fout === 'PASSKEY_SLEUTEL_ONBEKEND'
      && (await sys.query('SELECT staat, code FROM app.eigenaar_besluiten WHERE id = $1', [g1.data.id])).rows[0].code === 'PASSKEY_SLEUTEL_ONBEKEND' && inboxBestanden().length === 0);
    check('ondertekenen: na een mislukte poging is de rij geweigerd én de challenge verbruikt (gebruikt_op) → nogmaals tekenen kan niet', (await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g1.data.id, uitdagingId: g1.data.uitdagingId, assertie: teken(g1.data) })).fout === 'STATUS_ONGELDIG'
      && (await sys.query('SELECT gebruikt_op FROM app.goedkeur_uitdagingen WHERE id = $1', [g1.data.uitdagingId])).rows[0]?.gebruikt_op !== null);
    const g2 = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com', 'mcp.example.org'] } });
    // Inhoud in de database wijzigen na de challenge (gecompromitteerde systeemrol): de hash past niet meer bij de challenge.
    const g2b = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] } });
    await sys.query(`UPDATE app.eigenaar_besluiten SET inhoud = '{"hosts":["evil.example"]}'::jsonb WHERE id = $1`, [g2b.data.id]);
    check('starten: een nieuw ontwerp van hetzelfde soort sluit het vorige ontwerp (VERVANGEN)', (await sys.query('SELECT staat, code FROM app.eigenaar_besluiten WHERE id = $1', [g2.data.id])).rows[0].code === 'VERVANGEN');
    await sys.query(`UPDATE app.eigenaar_besluiten SET inhoud = '{"hosts":["evil.example","extra.example"]}'::jsonb WHERE id = $1`, [g2b.data.id]);
    check('ondertekenen: inhoud in de rij gewijzigd na de challenge → UITDAGING_ONGELDIG (hash ≠)', (await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g2b.data.id, uitdagingId: g2b.data.uitdagingId, assertie: teken(g2b.data) })).fout === 'UITDAGING_ONGELDIG');
    const g3 = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com', 'mcp.example.org'] } });
    check('ondertekenen: assertie van hub-origin geweigerd (alleen admin/id/mcp)', (await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g3.data.id, uitdagingId: g3.data.uitdagingId, assertie: teken(g3.data, eigenaar, 'https://hub.tarasevych.com') })).fout === 'PASSKEY_ORIGIN_ONJUIST');
    const g4 = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com', 'mcp.example.org'] } });
    // Root antwoordt «klaar» kort na het neerleggen (nagebootst); de route wacht daarop.
    const t = setTimeout(() => rootAntwoord(g4.data.id, { soort: 'externe-hosts', uitkomst: 'klaar', code: 'OK', uk: 'Білий список оновлено.', nl: 'Witte lijst bijgewerkt.', passkey: sleutel.vingerafdruk.slice(0, 16), hosts: ['api.githubcopilot.com', 'mcp.example.org'], toegevoegd: ['mcp.example.org'], verwijderd: [] }), 600);
    const o4 = await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g4.data.id, uitdagingId: g4.data.uitdagingId, assertie: teken(g4.data) });
    clearTimeout(t);
    check('ondertekenen: geldige handtekening (origin mcp) → bestand voor root in de inbox + aanvraag, rij ondertekend → klaar na antwoord van root', o4.status === 200 && o4.data.staat === 'klaar' && o4.data.code === 'OK' && o4.data.passkey === sleutel.vingerafdruk.slice(0, 16) && JSON.stringify(o4.data.uitkomst.toegevoegd) === '["mcp.example.org"]' && existsSync(join(p.inbox, 'aanvraag')), JSON.stringify(o4.data));
    const bestand = JSON.parse(readFileSync(join(p.inbox, `besluit-${g4.data.id.replace(/-/g, '')}.json`), 'utf8'));
    check('inbox: het bestand voor root bevat doel, soort, inhoud, hash, nonce, verloopt, assertie en wie (zoals root het verwacht)', bestand.doel === 'eigenaar-besluit' && bestand.soort === 'externe-hosts' && bestand.besluitHash === g4.data.hash && bestand.assertie.credentialId === sleutel.credentialId && /^[A-Za-z0-9_-]{22,128}$/.test(bestand.nonce) && bestand.id === g4.data.id.replace(/-/g, ''));
    check('inbox: wat root straks verifieert is precies wat de app voorcontroleerde (challenge uit hash+nonce+verloopt)', (() => { const cd = JSON.parse(Buffer.from(bestand.assertie.clientDataJSON, 'base64url').toString()); return cd.challenge === kern.uitdagingVoor('eigenaar-besluit', { besluitHash: bestand.besluitHash, nonce: bestand.nonce, verloopt: bestand.verloopt }); })());
    check('audit: gestart, ondertekend en klaar in het journaal', (await sys.query("SELECT action FROM app.audit WHERE details->>'besluit' = $1 ORDER BY seq", [g4.data.id])).rows.map((r) => r.action).join(',') === 'eigenaar_besluit_gestart,eigenaar_besluit_ondertekend,eigenaar_besluit_klaar');

    // ---------------------------------------------------------------- terugdraaien: niet wachten (dienst herstart), status later
    const g5 = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } });
    check('starten: terugdraaien → ontwerp {van, naar} + stand', g5.status === 200 && g5.data.inhoud.van === '20261022-120000' && g5.data.inhoud.naar === '20261021-120000' && g5.data.stand.actief === '20261022-120000');
    const o5 = await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g5.data.id, uitdagingId: g5.data.uitdagingId, assertie: teken(g5.data) });
    check('ondertekenen: terugdraaien geeft meteen «ondertekend» terug (geen wachten: de dienst gaat herstarten)', o5.status === 200 && o5.data.staat === 'ondertekend' && inboxBestanden().some((n) => n === `besluit-${g5.data.id.replace(/-/g, '')}.json`));
    const s5a = await call('POST /api/owner/besluit/status', OWNER, { id: g5.data.id });
    check('status: zonder antwoord van root blijft het ondertekend, met de actieve release erbij', s5a.data.besluit.staat === 'ondertekend' && s5a.data.stand.actief === '20261022-120000');
    rootAntwoord(g5.data.id, { soort: 'terugdraaien', uitkomst: 'geweigerd', code: 'BESLUIT_TE_SNEL', uk: 'Не частіше ніж раз на 10 хв.', nl: 'Hoogstens één keer per 10 min.', passkey: sleutel.vingerafdruk.slice(0, 16) });
    const s5b = await call('POST /api/owner/besluit/status', OWNER, { id: g5.data.id });
    check('status: antwoord van root (geweigerd + code + uk/nl) wordt overgenomen in de rij', s5b.data.besluit.staat === 'geweigerd' && s5b.data.besluit.code === 'BESLUIT_TE_SNEL' && s5b.data.besluit.uitkomst.nl === 'Hoogstens één keer per 10 min.' && (await sys.query('SELECT staat FROM app.eigenaar_besluiten WHERE id = $1', [g5.data.id])).rows[0].staat === 'geweigerd');
    check('status: andere gebruiker ziet het besluit niet (NIET_GEVONDEN/403)', (await call('POST /api/owner/besluit/status', ANDER, { id: g5.data.id })).status === 403);
    check('status: statusbestand met een ander id wordt genegeerd (geen verwisseling)', await (async () => { const g = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } }); await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g.data.id, uitdagingId: g.data.uitdagingId, assertie: teken(g.data) }); writeFileSync(join(p.status, `besluit-${g.data.id.replace(/-/g, '')}.json`), JSON.stringify({ id: 'f'.repeat(32), uitkomst: 'klaar', code: 'OK' })); return (await call('POST /api/owner/besluit/status', OWNER, { id: g.data.id })).data.besluit.staat === 'ondertekend'; })());
    // Verlopen zonder antwoord: ondertekend_op 20 min terug.
    const g6 = await call('POST /api/owner/besluit/starten', OWNER, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } });
    await call('POST /api/owner/besluit/ondertekenen', OWNER, { id: g6.data.id, uitdagingId: g6.data.uitdagingId, assertie: teken(g6.data) });
    await sys.query(`UPDATE app.eigenaar_besluiten SET ondertekend_op = now() - interval '20 minutes' WHERE id = $1`, [g6.data.id]);
    const s6 = await call('POST /api/owner/besluit/status', OWNER, { id: g6.data.id });
    check('status: 15 min zonder uitkomst van root → verlopen GEEN_UITKOMST met uitleg', s6.data?.besluit?.staat === 'verlopen' && s6.data.besluit.code === 'GEEN_UITKOMST' && /journalctl/.test(s6.data.besluit.uitkomst.nl), JSON.stringify(g6.data) + JSON.stringify(s6.data));
    const ov1 = await call('POST /api/owner/besluit/overzicht', OWNER);
    check('overzicht: besluiten van de eigenaar in de lijst (nieuwste eerst), passkeys genoemd', ov1.data.besluiten.length >= 6 && ov1.data.besluiten[0].id === g6.data.id && ov1.data.passkeys[0].label === 'telefoon');

    // ---------------------------------------------------------------- RLS: de app-rol ziet alleen eigen rijen
    if (process.env.DATABASE_URL_APP) {
      const app = getPool('app');
      const als = async (user: string, sql: string, params: unknown[] = []) => { const c = await app.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.user_id', $1, true)", [user]); const r = await c.query(sql, params); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => undefined); return { rows: [], fout: String((e as { code?: string }).code) } as any; } finally { c.release(); } };
      const mijn = await als(OWNER, 'SELECT count(*)::int AS n FROM app.eigenaar_besluiten WHERE user_id = $1', [OWNER]);
      const ander = await als(ANDER, 'SELECT count(*)::int AS n FROM app.eigenaar_besluiten WHERE user_id = $1', [OWNER]);
      check('RLS: de eigenaar ziet zijn rijen als app-rol; een ander account ziet er geen (0)', Number(mijn.rows[0]?.n) >= 6 && Number(ander.rows[0]?.n) === 0, `${mijn.rows[0]?.n}/${ander.rows[0]?.n} ${mijn.fout || ''}`);
      const schrijf = await als(ANDER, `INSERT INTO app.eigenaar_besluiten (id, user_id, soort, inhoud, hash) VALUES ($1, $2, 'externe-hosts', '{"hosts":[]}', $3)`, [randomUUID(), ANDER, 'a'.repeat(64)]);
      check('RLS: de app-rol kan niet schrijven (alleen de systeemrol): 42501', schrijf.fout === '42501', String(schrijf.fout));
    } else check('RLS: app-rol ontbreekt in deze omgeving (overgeslagen; draai run-test-rls.sh)', true);
  } finally {
    await sys.query('DELETE FROM app.eigenaar_besluiten WHERE user_id = ANY($1)', [[OWNER, ANDER, NEP]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[OWNER, ANDER, NEP]]).catch(() => undefined);
    for (const [k, v] of Object.entries({ BESLUIT_INBOX: oud.a, OPDRACHT_STATUS_DIR: oud.b, MCP_RECHTEN_PAD: oud.c, GOEDKEUR_SLEUTELS: oud.d, BESLUIT_APP_ROOT: oud.e, EXTERNE_MCP_HOSTS: oud.f })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(w, { recursive: true, force: true });
    await closePool();
  }
  void randomBytes;
  return einde();
}
