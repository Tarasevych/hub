// §13.10 «Способи входу» in context: gebruik van passkeys en herstelcodes (waarvoor, waar, apparaat, IP-hash), privénotities
// (RLS), «sterke» step-up voor het intrekken van rechten (Google alleen telt niet als er iets sterkers is), reden verplicht,
// melding «Це були ви?» met link, «Це був не я» (terugdraaien + de sessie van de wijziging intrekken) en de root-kant
// (sleutel-intrekken zonder assertie; terug alleen via SSH). Via de echte handler met nagebootste Google en nep-passkeys.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JOURNAAL_ACTIES, journaalItem } from '../../backend/connectors-routes';
import { meldLink } from '../../backend/melder';
import { ACTIES, actieVan, gebruikVastleggen, gebruikVoor, hostVoorDienst, redenVan } from '../../backend/toegang-context';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import { closePool, getPool } from '../../server/platform/pg';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';

const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');

export async function main(): Promise<number> {
  const { check, einde } = checker('toegang-context');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const basis = mkdtempSync(join(tmpdir(), 'toegang-test-'));
  const inbox = join(basis, 'inbox'); const statusDir = join(basis, 'status'); mkdirSync(inbox); mkdirSync(statusDir);
  const sleutels = join(basis, 'goedkeur-passkeys.json'); const rechten = join(basis, 'mcp-rechten.json');
  writeFileSync(sleutels, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: ['https://admin.tarasevych.com', 'https://id.tarasevych.com'], sleutels: [] }));
  writeFileSync(rechten, JSON.stringify({ 'passkey-goedkeuring': true }));
  // Als root (cloud-sessie) negeert de root-hulp bewust de testpaden (GOEDKEUR_*) en zou hij de ECHTE /etc-, /srv- en /var-paden raken.
  // Dan draait de hulp als nobody (65534; zelfde patroon als ai-beleid en besluit-root): de testmap wordt van 65534 en de inbox krijgt
  // setgid, zodat de bestanden die de app (root) er met 0640 neerlegt groep 65534 krijgen en voor de hulp leesbaar zijn.
  const alsNobody: { uid?: number; gid?: number } = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
  if (alsNobody.uid) { spawnSync('chown', ['-R', '65534:65534', basis]); chmodSync(inbox, 0o2770); }
  const ENV = ['GOEDKEUR_SLEUTELS', 'GOEDKEUR_INBOX', 'MCP_RECHTEN_PAD', 'OPDRACHT_STATUS_DIR', 'PASSKEY_RP_ID', 'PASSKEY_ORIGINS', 'OWNER_EMAIL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'AUDIT_IP_PEPPER'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_INBOX: inbox, MCP_RECHTEN_PAD: rechten, OPDRACHT_STATUS_DIR: statusDir });
  delete process.env.PASSKEY_RP_ID; delete process.env.PASSKEY_ORIGINS;
  // Eigen pepper voor de IP-hash (Audit-fix 10: geen terugval meer op RECOVERY_CODE_PEPPER): niet afhankelijk van de geheimen van de machine.
  if (String(process.env.AUDIT_IP_PEPPER || '').length < 32) process.env.AUDIT_IP_PEPPER = randomBytes(48).toString('base64');
  const eigenaar = `tc-eig-${T}@example.test`, aMail = `tc-a-${T}@example.test`, bMail = `tc-b-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  type B = ReturnType<typeof G.browser>;
  const id = (b: B, pad: string, extra: Record<string, unknown> = {}, service = 'identity') => b.verzoek(`${service === 'identity' ? 'id' : service}.tarasevych.com`, pad, b.ctxBody(service, extra));
  const P = '/api/owner/access/passkeys', A_ = '/api/owner/access';
  const rootHulp = (...args: string[]) => spawnSync(process.execPath, [HULP, ...args], { env: { ...process.env, GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_STAAT: join(basis, 'staat'), GOEDKEUR_INBOX: inbox, GOEDKEUR_STATUS_DIR: statusDir, GOEDKEUR_RECHTEN: rechten, GOEDKEUR_GROEP: 'nogroup' }, encoding: 'utf8', ...alsNobody });
  const rootN = () => JSON.parse(readFileSync(sleutels, 'utf8')).sleutels.length as number;
  const registreerMet = async (b: B, pk: NepPasskey, naam: string) => {
    const opt = await id(b, `${P}/registreren/opties`);
    return id(b, `${P}/registreren`, { uitdagingId: opt.data.uitdagingId, naam, transports: ['internal'], ...registreer(pk, opt.data.publicKey.challenge) });
  };
  const stapOpMet = async (b: B, pk: NepPasskey, actie: string) => {
    const opt = await id(b, '/api/owner/access/stap-op/passkey/opties', { actie });
    return id(b, '/api/owner/access/stap-op/passkey', { uitdagingId: opt.data.uitdagingId, actie, assertie: bevestig(pk, opt.data.publicKey.challenge) });
  };
  const meldingen = async (userId: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 order by (data->>'createdAt')::bigint desc", [userId])).rows.map((r: { data: any }) => r.data);

  try {
    // ---------------------------------------------------------------- zuiver
    check('acties: vaste lijst (UA+NL); onbekend of rommel → «onbekend»', actieVan('herstelcodes-nieuw') === 'herstelcodes-nieuw' && actieVan('../../etc') === 'onbekend' && actieVan('<script>') === 'onbekend' && actieVan(undefined) === 'onbekend'
      && Object.values(ACTIES).every((v: any) => Array.isArray(v) && v.length === 2 && v[0] && v[1]));
    check('host komt van de dienst van de sessie (nooit van de client)', hostVoorDienst('identity') === 'id.tarasevych.com' && hostVoorDienst('admin') === 'admin.tarasevych.com' && hostVoorDienst('evil.example') === '');
    let r1 = '', r2 = '';
    try { redenVan('  te kort '); } catch (e) { r1 = (e as { code: string }).code; }
    try { redenVan('x'.repeat(501)); } catch (e) { r2 = (e as { code: string }).code; }
    check('reden: ≥ 10 en ≤ 500 tekens, getrimd', r1 === 'REDEN_TE_KORT' && r2 === 'REDEN_TE_LANG' && redenVan('  Telefoon kwijt in de trein  ') === 'Telefoon kwijt in de trein');
    check('meldLink: eigen pad of https *.tarasevych.com; niets anders', meldLink('/methods?wijziging=1') === '/methods?wijziging=1' && meldLink('https://id.tarasevych.com/methods?wijziging=x').startsWith('https://id.tarasevych.com/')
      && meldLink('//evil.example') === '' && meldLink('/\\evil.example') === '' && meldLink('https://evil.example') === '' && meldLink('https://u:p@id.tarasevych.com/') === '' && meldLink('javascript:alert(1)') === '' && meldLink('http://id.tarasevych.com/') === '');
    check('journaal: rechtwijzigingen en «Це був не я» staan onder «toegang»', ['goedkeur_recht_ingetrokken', 'goedkeur_passkey_verwijderd', 'uitrol_voorbereider_ingetrokken', 'toegang_wijziging_ongedaan'].every((a) => JOURNAAL_ACTIES[a] === 'toegang'));
    const ji = journaalItem({ id: '1', action: 'goedkeur_recht_ingetrokken', result: 'success', createdAt: 1, details: { vingerafdruk: 'abcd', label: 'Telefoon', reden: 'Telefoon kwijt', wijziging: 'w', sessie: 's1' } }, { agents: new Map(), tokens: new Map(), oauth: new Map() });
    check('journaal: reden, sleutel (label + vingerafdruk) en sessie zichtbaar', ji.soort === 'toegang' && ji.details.reden === 'Telefoon kwijt' && ji.details.label === 'Telefoon' && ji.details.vingerafdruk === 'abcd' && ji.details.sessie === 's1');

    // ---------------------------------------------------------------- gebruikers
    const A = G.browser(); await A.aanmelden(`sub-a-${T}`, aMail, { service: 'identity' });
    const Bb = G.browser(); await Bb.aanmelden(`sub-b-${T}`, bMail, { service: 'identity' });
    const aId = await idRij(aMail), bId = await idRij(bMail);
    check('opzet: twee gebruikers', !!aId && !!bId && aId !== bId);
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = any($1)", [[aId, bId]]);
    await A.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });
    await Bb.aanmelden(`sub-b-${T}`, bMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });

    // Herstelcodes: A zet TOTP aan (krijgt codes) → A heeft sterke methoden.
    if (Date.now() % 30000 > 25000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
    const ts = await id(A, `${A_}/totp/start`);
    const tc = await id(A, `${A_}/totp/confirm`, { code: totpCode(ts.data.secret, Math.floor(Date.now() / 30000)) });
    const codes = (tc.data.recoveryCodes || []) as string[];
    check('opzet: A heeft TOTP + 10 herstelcodes', tc.status === 200 && codes.length === 10);

    // ---------------------------------------------------------------- sterke step-up
    const nepId = randomUUID();
    const TD = `${A_}/toegang/wijziging/terugdraaien`;
    const g1 = await id(A, TD, { id: nepId });
    check('sterk: A (heeft TOTP/codes) met alleen een verse Google-aanmelding → STEP_UP_STRONG_REQUIRED', g1.status === 403 && g1.data.error === 'STEP_UP_STRONG_REQUIRED' && JSON.stringify(g1.data.methods) === '["passkey","totp","herstelcode"]', g1.body.slice(0, 200));
    const A2 = G.browser(); await A2.aanmelden(`sub-a-${T}`, aMail, { authTime: oud, service: 'identity' });
    const ga = await A2.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });
    check('sterk: ook na een expliciete Google-step-up nog steeds geweigerd', ga.cb.status === 200 && (await id(A2, TD, { id: nepId })).data.error === 'STEP_UP_STRONG_REQUIRED');
    const hc = await id(A, `${A_}/stap-op`, { methode: 'herstelcode', actie: 'wijziging-terugdraaien', code: codes[0] });
    check('sterk: herstelcode-step-up telt als sterk (daarna gaat het verzoek door → 404 niet gevonden)', hc.status === 200 && (await id(A, TD, { id: nepId })).status === 404);
    const hc2 = await id(A2, `${A_}/stap-op`, { methode: 'herstelcode', actie: 'rm -rf /', code: codes[1] });
    check('gebruik: actie buiten de lijst → «onbekend» (geweigerd als label, niet als bevestiging)', hc2.status === 200);
    const ov = await id(A, `${A_}/recovery/overzicht`);
    const c1 = ov.data.codes.find((c: any) => c.nr === 1), c2 = ov.data.codes.find((c: any) => c.nr === 2);
    check('gebruik: code 1 toont «waarvoor» + host + apparaat + korte IP-hash', c1?.gebruik?.[0]?.actie === 'wijziging-terugdraaien' && c1.gebruik[0].host === 'id.tarasevych.com' && !!c1.gebruik[0].apparaat && /^[0-9a-f]{12}$/.test(c1.gebruik[0].ipKort), JSON.stringify(c1));
    check('gebruik: code 2 met een onbekend label → «onbekend»', c2?.gebruik?.[0]?.actie === 'onbekend');
    check('gebruik: B ziet niets van A (andere sleutels, RLS)', (await alsGebruiker(bId, async (q) => (await q('select count(*)::int n from app.toegang_gebruik where user_id = $1', [aId])).rows[0].n)) === 0);
    const B2 = G.browser(); await B2.aanmelden(`sub-b-${T}`, bMail, { authTime: oud, service: 'identity' });
    check('sterk: B zonder sterke methode: verse Google-aanmelding is genoeg (404), oude niet (STEP_UP_REQUIRED)', (await id(Bb, TD, { id: nepId })).status === 404 && (await id(B2, TD, { id: nepId })).data.error === 'STEP_UP_REQUIRED');
    for (let i = 0; i < 25; i++) await gebruikVastleggen(aId, 'passkey', 'test-trim', i % 2 ? 'inloggen' : 'bevestigen', { dienst: 'identity' });
    check('gebruik: per sleutel alleen de laatste 20', (await pool.query("select count(*)::int n from app.toegang_gebruik where user_id = $1 and sleutel = 'test-trim'", [aId])).rows[0].n === 20 && ((await gebruikVoor(aId, 'passkey', ['test-trim'])).get('test-trim') || []).length === 20);

    // ---------------------------------------------------------------- notities
    const N = `${A_}/notities`;
    const setS = String(ov.data.setSleutel);
    const n1 = await id(A, `${N}/opslaan`, { soort: 'herstelset', sleutel: setS, tekst: 'Тека «Документи», конверт\u0000 2' });
    const n2 = await id(A, `${N}/opslaan`, { soort: 'herstelcode', sleutel: c1.sleutel, tekst: 'Gebruikt op de laptop van kantoor' });
    check('notities: opslaan (set + losse code), stuurtekens weg', n1.status === 200 && n2.status === 200 && n1.data.notitie.tekst.startsWith('Тека «Документи», конверт') && !n1.data.notitie.tekst.includes('\u0000'), JSON.stringify(n1.data));
    const lijst = await id(A, `${N}/lijst`);
    check('notities: lijst geeft ze terug', lijst.data.notities.length === 2 && lijst.data.notities.some((n: any) => n.soort === 'herstelcode' && n.sleutel === c1.sleutel));
    check('notities: > 500 tekens geweigerd', (await id(A, `${N}/opslaan`, { soort: 'passkey', sleutel: 'x', tekst: 'я'.repeat(501) })).data.error === 'NOTITIE_TE_LANG' && (await id(A, `${N}/opslaan`, { soort: 'passkey', sleutel: 'x', tekst: 'я'.repeat(500) })).status === 200);
    check('notities: onbekende soort / rare sleutel geweigerd', (await id(A, `${N}/opslaan`, { soort: 'wachtwoord', sleutel: 'x', tekst: 'a' })).data.error === 'NOTITIE_SOORT_ONGELDIG' && (await id(A, `${N}/opslaan`, { soort: 'passkey', sleutel: '../x y', tekst: 'a' })).data.error === 'NOTITIE_SLEUTEL_ONGELDIG');
    check('notities: leeg = verwijderen', (await id(A, `${N}/opslaan`, { soort: 'passkey', sleutel: 'x', tekst: '   ' })).status === 200 && (await id(A, `${N}/lijst`)).data.notities.length === 2);
    await id(Bb, `${N}/opslaan`, { soort: 'herstelset', sleutel: setS, tekst: 'Notitie van B' });
    check('notities: B ziet alleen de eigen notitie; die van A is onveranderd', (await id(Bb, `${N}/lijst`)).data.notities.length === 1 && (await id(A, `${N}/lijst`)).data.notities.find((n: any) => n.soort === 'herstelset').tekst.startsWith('Тека'));
    let rls = 'open';
    try { await alsGebruiker(bId, (q) => q("insert into app.toegang_notities (user_id, soort, sleutel, tekst) values ($1, 'passkey', 'y', 'z')", [aId])); } catch { rls = 'dicht'; }
    check('notities: RLS — app-rol kan geen notitie voor een ander schrijven', rls === 'dicht');
    check('notities: RLS — app-rol leest geen notities van een ander', (await alsGebruiker(bId, async (q) => (await q('select count(*)::int n from app.toegang_notities where user_id = $1', [aId])).rows[0].n)) === 0);
    let wz = 'open';
    try { await alsGebruiker(aId, (q) => q("insert into app.toegang_wijzigingen (user_id, actor_id, soort, sleutel) values ($1, $1, 'goedkeur-recht-ingetrokken', 'x')", [aId])); } catch { wz = 'dicht'; }
    check('wijzigingen: app-rol kan het spoor niet zelf schrijven (alleen systeem)', wz === 'dicht');
    check('notities: zonder sessie 401', (await G.browser().verzoek('id.tarasevych.com', `${N}/lijst`, { service: 'identity', tabContext: 'x'.repeat(48) })).status === 401);

    // ---------------------------------------------------------------- eigenaar: recht intrekken + «Це були ви?» + «Це був не я»
    const E = G.browser(); await E.aanmelden(`sub-e-${T}`, eigenaar, { service: 'identity' });
    const eId = await idRij(eigenaar);
    await E.aanmelden(`sub-e-${T}`, eigenaar, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });
    const pk = nieuwePasskey('es256', 3);
    const reg = await registreerMet(E, pk, 'Telefoon');
    const pid = String(reg.data?.passkey?.id || '');
    const aan = await id(E, `${P}/goedkeuring/aanvragen`, { id: pid });
    const ssh = rootHulp('toevoegen', String(aan.data.sshOpdracht || '').split(' ').pop() || '');
    check('opzet: eigenaar-passkey kan goedkeuren (via SSH)', reg.status === 200 && ssh.status === 0 && rootN() === 1, `${reg.status} ${aan.body.slice(0, 160)} ${ssh.stderr}`);
    const fp = JSON.parse(readFileSync(sleutels, 'utf8')).sleutels[0].vingerafdruk as string;
    const RI = `${P}/goedkeuring/recht-intrekken`, REDEN = 'Telefoon verloren in de trein';
    check('intrekken: reden verplicht (vóór het venster)', (await id(E, RI, { id: pid, reden: 'kort' })).data.error === 'REDEN_TE_KORT');
    check('intrekken: verse Google-aanmelding alleen is niet genoeg (eigenaar heeft een passkey)', (await id(E, RI, { id: pid, reden: REDEN })).data.error === 'STEP_UP_STRONG_REQUIRED' && rootN() === 1 && !readdirSync(inbox).some((f) => f.startsWith('sleutel-intrekken-')));
    check('intrekken: andere gebruiker → OWNER_REQUIRED', (await id(A, RI, { id: pid, reden: REDEN })).data.error === 'OWNER_REQUIRED');
    const so = await stapOpMet(E, pk, 'goedkeur-recht-intrekken');
    const ri = await id(E, RI, { id: pid, reden: REDEN });
    check('intrekken: met passkey-step-up → intrekverzoek voor root', so.status === 200 && ri.status === 200 && readdirSync(inbox).some((f) => f.startsWith('sleutel-intrekken-')), ri.body.slice(0, 200));
    const ls = await id(E, `${P}/lijst`);
    const p1 = ls.data.passkeys.find((p: any) => p.id === pid);
    check('gebruik: passkey toont «waarvoor» (goedkeur-recht-intrekken), host en apparaat', p1?.gebruik?.[0]?.actie === 'goedkeur-recht-intrekken' && p1.gebruik[0].host === 'id.tarasevych.com' && !!p1.gebruik[0].apparaat, JSON.stringify(p1?.gebruik));
    check('geschiedenis: «wordt ingetrokken» + reden + door wie', p1?.goedkeuring === 'wordt-ingetrokken' && p1.geschiedenis.some((g: any) => g.soort === 'goedkeur-recht-ingetrokken' && g.wijziging?.reden === REDEN && g.wijziging.actorEmail === eigenaar));
    const m = (await meldingen(eId)).find((x) => /Це були ви\?/.test(String(x.title)));
    const wid = String(m?.link || '').split('wijziging=')[1] || '';
    check('melding «Це були ви? / Was u dit?» in de bel met link naar de wijziging', !!m && String(m.link).startsWith('https://id.tarasevych.com/methods?wijziging=') && /^[0-9a-f-]{36}$/.test(wid) && /Telefoon/.test(String(m.message)), JSON.stringify(m || {}));
    const ov2 = await E.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', E.ctxBody('identity', {}));
    check('melding: overzicht voor de bel geeft de link mee', JSON.stringify(ov2.data || {}).includes(`wijziging=${wid}`), `${ov2.status} ${Object.keys(ov2.data || {}).join(',')}`);
    const wv = await id(E, `${A_}/toegang/wijziging`, { id: wid });
    check('wijziging: wie, wanneer, waarom, welke sleutel, apparaat; stand «wordt ingetrokken»', wv.status === 200 && wv.data.wijziging.reden === REDEN && wv.data.wijziging.vingerafdruk === fp && wv.data.wijziging.actorEmail === eigenaar && !!wv.data.wijziging.apparaat && wv.data.stand.recht === 'wordt-ingetrokken' && wv.data.kanTerugdraaien === true, wv.body.slice(0, 300));
    check('wijziging: een ander account ziet hem niet', (await id(A, `${A_}/toegang/wijziging`, { id: wid })).status === 404);
    // «Це був не я» vanuit een ándere sessie (E2), na een passkey-step-up. De sessie die de wijziging deed (E) wordt beëindigd.
    const E2 = G.browser(); await E2.aanmelden(`sub-e-${T}`, eigenaar, { service: 'identity' });
    await E2.aanmelden(`sub-e-${T}`, eigenaar, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });
    check('terugdraaien: Google alleen is niet genoeg', (await id(E2, TD, { id: wid })).data.error === 'STEP_UP_STRONG_REQUIRED');
    await stapOpMet(E2, pk, 'wijziging-terugdraaien');
    const td = await id(E2, TD, { id: wid });
    check('terugdraaien vóór root: recht behouden, intrekverzoek weg, sessie van de wijziging beëindigd', td.status === 200 && td.data.uitkomst.recht === 'behouden' && td.data.uitkomst.sessie === 'ingetrokken' && !readdirSync(inbox).some((f) => f.startsWith('sleutel-intrekken-')) && rootN() === 1, td.body.slice(0, 300));
    check('terugdraaien: de sessie die de wijziging deed is uitgelogd (401)', (await id(E, `${P}/lijst`)).status === 401);
    check('terugdraaien: E2 werkt gewoon door', (await id(E2, `${P}/lijst`)).status === 200);
    check('terugdraaien: melding «Зміну скасовано» + audit', (await meldingen(eId)).some((x) => /Зміну скасовано/.test(String(x.title)))
      && (await pool.query("select 1 from app.audit where owner_id = $1 and action = 'toegang_wijziging_ongedaan'", [eId]).catch(() => ({ rows: [] }))).rows.length === 1);
    // Nu echt intrekken en root laten verwerken; terugdraaien kan dan alleen eerlijk «via SSH».
    await stapOpMet(E2, pk, 'goedkeur-recht-intrekken');
    const ri2 = await id(E2, RI, { id: pid, reden: REDEN });
    const verwerk = rootHulp('verwerk');
    check('root: verwerkt het intrekverzoek (zonder assertie) → sleutel weg', ri2.status === 200 && verwerk.status === 0 && rootN() === 0, verwerk.stderr);
    const w2 = String(((await meldingen(eId)).find((x) => /Це були ви\?/.test(String(x.title)) && !String(x.link).endsWith(wid))?.link || '').split('wijziging=')[1] || '');
    const td2 = await id(E2, TD, { id: w2 });
    check('terugdraaien ná root: eerlijk «alleen via SSH» + SSH-opdracht + nieuwe aanmelding', td2.status === 200 && td2.data.uitkomst.recht === 'ssh-nodig' && String(td2.data.uitkomst.sshOpdracht).startsWith('sudo mijn-ruimte-passkey toevoegen ') && existsSync(join(inbox, `sleutel-aanmelding-${fp}.json`)) && td2.data.uitkomst.sessie === 'huidige-sessie', td2.body.slice(0, 300));
    const p2 = (await id(E2, `${P}/lijst`)).data.passkeys.find((p: any) => p.id === pid);
    check('na intrekken: de app toont de SSH-opdracht om terug te zetten', p2 && String(p2.sshOpdracht || '').startsWith('sudo mijn-ruimte-passkey toevoegen '), JSON.stringify(p2 || {}).slice(0, 300));
    check('root: SSH zet het recht terug', rootHulp('toevoegen', fp.slice(0, 20)).status === 0 && rootN() === 1);
    // Goedkeur-passkey verwijderen: reden + sterke step-up; daarna terugdraaien zet de passkey terug.
    check('verwijderen: zonder reden → PASSKEY_KAN_GOEDKEUREN', (await id(E2, `${P}/verwijderen`, { id: pid })).data.error === 'PASSKEY_KAN_GOEDKEUREN');
    await stapOpMet(E2, pk, 'passkey-verwijderen');
    const vw = await id(E2, `${P}/verwijderen`, { id: pid, reden: 'Oude telefoon weggegeven' });
    check('verwijderen met reden: rij weg, intrekverzoek voor root, melding', vw.status === 200 && !(await id(E2, `${P}/lijst`)).data.passkeys.some((p: any) => p.id === pid) && readdirSync(inbox).some((f) => f.startsWith('sleutel-intrekken-')), vw.body.slice(0, 200));
    const w3 = String(((await meldingen(eId))[0]?.link || '').split('wijziging=')[1] || '');
    const td3 = await id(E2, TD, { id: w3 });
    check('terugdraaien: passkey terug + recht behouden (vóór root)', td3.status === 200 && td3.data.uitkomst.passkeyTerug === true && td3.data.uitkomst.recht === 'behouden' && (await id(E2, `${P}/lijst`)).data.passkeys.some((p: any) => p.id === pid && p.goedkeuring === 'kan-goedkeuren'), td3.body.slice(0, 300));
    check('journaal (/agents): eigenaar ziet de toegang-regels', (await pool.query("select count(*)::int n from app.audit where owner_id = $1 and action = any($2)", [eId, ['goedkeur_recht_ingetrokken', 'goedkeur_passkey_verwijderd', 'toegang_wijziging_ongedaan']]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n >= 5);

    // ---------------------------------------------------------------- statisch: UI
    const ui = ['src/ToegangssleutelsSectie.tsx', 'src/HerstelcodesSectie.tsx', 'src/ToegangWijziging.tsx', 'src/platform/bevestig-toegang.tsx', 'src/BeheerUitrolWeergave.tsx'].map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : ''));
    check('ui: «Це був не я — скасувати та захистити акаунт» + NL', /Це був не я — скасувати та захистити акаунт/.test(ui[2]) && /Dit was ik niet/.test(ui[2]));
    check('ui: InvalidStateError → vriendelijke tekst (UA + NL)', /Цей пристрій уже має ваш passkey\. Щоб додати телефон, у вікні Windows оберіть «Використовувати телефон або планшет»\./.test(ui[0]) && /Dit apparaat heeft al uw passkey/.test(ui[0]));
    check('ui: geen window.confirm meer bij intrekken voorbereider', !/window\.confirm\(/.test(ui[4]));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`tc-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      for (const t of ['passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities', 'toegang_wijzigingen']) await pool.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
      await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]).catch(() => undefined);
    }
    for (const k of ENV) { const v = vorige[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(basis, { recursive: true, force: true });
  }
  await closePool();
  return einde();
}
