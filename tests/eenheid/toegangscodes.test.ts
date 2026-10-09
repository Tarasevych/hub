// §13.11 Toegangscodes voor anderen: allowlist van scopes (alleen lezen, verboden gebieden nooit), code één keer getoond en alleen
// gehasht bewaard, verloop (безстроково / presets / eigen datum), eenmalig of herbruikbaar met maximum, inwisselen → aparte gastsessie
// (eigen cookie, niet de identiteit van de eigenaar), scope per verzoek (standaard weigeren), alles gelogd met de code-id, melding bij
// eerste gebruik, intrekken (reden) beëindigt gastsessies meteen, verloop werkt, verlengen vraagt sterke step-up, per-IP-blokkade,
// «Сесії»: gastsessies + «alle andere beëindigen». Via de echte handler (nep-Google, nep-passkey).
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JOURNAAL_ACTIES } from '../../backend/connectors-routes';
import { GAST_LEZERS, GAST_SCOPES, NOOIT, VERBODEN_SCOPE, codeHash, codeNormaal, isVerlenging, nieuweCode, scopesVan, statusVan, verloopVan } from '../../backend/toegangscodes';
import { alsGebruiker } from '../../backend/ai-grants';
import { ipHash } from '../../server/platform/audit';
import { PUBLIEKE_ROUTES } from '../../server/platform/auth-poort';
import { closePool, getPool } from '../../server/platform/pg';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-passkey';
import { checker, nepGoogle } from './hulp/nep-google';

const fc = (f: () => unknown) => { try { f(); return ''; } catch (e) { return String((e as { code?: string }).code || e); } };

export async function main(): Promise<number> {
  const { check, einde } = checker('toegangscodes');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const ENV = ['PASSKEY_RP_ID', 'PASSKEY_ORIGINS', 'OWNER_EMAIL'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  delete process.env.PASSKEY_RP_ID; delete process.env.PASSKEY_ORIGINS;
  const eigenaar = `gc-eig-${T}@example.test`, aMail = `gc-a-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool(), sys = getPool('systeem');
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  type B = ReturnType<typeof G.browser>;
  const id = (b: B, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
  const gast = (b: B, pad: string, body: Record<string, unknown> = {}, ip?: string) => b.verzoek('id.tarasevych.com', `/api/gast/${pad}`, body, ip ? { ip } : {});
  const TC = '/api/owner/access/toegangscodes', GS = '/api/owner/access/gast-sessies';
  const stapOpMet = async (b: B, pk: NepPasskey, actie: string) => {
    const opt = await id(b, '/api/owner/access/stap-op/passkey/opties', { actie });
    return id(b, '/api/owner/access/stap-op/passkey', { uitdagingId: opt.data.uitdagingId, actie, assertie: bevestig(pk, opt.data.publicKey.challenge) });
  };
  const meldingen = async (userId: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 order by (data->>'createdAt')::bigint desc", [userId])).rows.map((r: { data: any }) => r.data);
  const ips: string[] = [];
  const ip = () => { const v = `198.51.100.${10 + ips.length}`; ips.push(v); return v; };

  try {
    // ---------------------------------------------------------------- zuiver
    check('scopes: allowlist alleen lezen, geen verboden woorden, UA + NL', Object.keys(GAST_SCOPES).length >= 3 && Object.keys(GAST_SCOPES).every((s) => s.endsWith('.lezen') && !VERBODEN_SCOPE.test(s))
      && Object.values(GAST_SCOPES).every((v: any) => v[0] && v[1]) && NOOIT.length >= 5);
    check('scopes: onbekend of verboden geweigerd', fc(() => scopesVan(['passkeys.lezen'])) === 'SCOPE_NIET_TOEGESTAAN' && fc(() => scopesVan(['beheer'])) === 'SCOPE_NIET_TOEGESTAAN'
      && fc(() => scopesVan([])) === 'SCOPE_VEREIST' && fc(() => scopesVan('profiel.lezen')) === 'SCOPE_VEREIST' && scopesVan(['profiel.lezen', 'profiel.lezen']).length === 1);
    const c1 = nieuweCode(), c2 = nieuweCode();
    check('code: 16 tekens Crockford (XXXX-XXXX-XXXX-XXXX), willekeurig', /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(c1) && c1 !== c2);
    check('code: invoer opgeschoond (kleine letters, spaties, O→0, I/L→1); rommel → leeg', codeNormaal(` ${c1.toLowerCase().replace(/-/g, ' ')} `) === c1.replace(/-/g, '') && codeNormaal('OOOO-IIII-LLLL-0000') === '0000111111110000' && codeNormaal('abc') === '' && codeNormaal('UUUU-UUUU-UUUU-UUUU') === '');
    check('code: alleen een hash (64 hex), afhankelijk van de code', /^[0-9a-f]{64}$/.test(codeHash('A'.repeat(16))) && codeHash('A'.repeat(16)) !== codeHash('B'.repeat(16)));
    const nu = Date.UTC(2026, 9, 9, 10);
    check('verloop: безстроково, presets 1u/1d/7d/30d, eigen datum (≥ 5 min, ≤ 366 d)', verloopVan({ soort: 'nooit' }) === null && verloopVan({ soort: 'preset', preset: '1u' }, nu)!.getTime() === nu + 3600e3
      && verloopVan({ soort: 'preset', preset: '30d' }, nu)!.getTime() === nu + 30 * 86400e3 && verloopVan({ soort: 'datum', tot: new Date(nu + 86400e3).toISOString() }, nu)!.getTime() === nu + 86400e3
      && fc(() => verloopVan({ soort: 'datum', tot: new Date(nu + 60e3).toISOString() }, nu)) === 'VERLOOP_TE_KORT' && fc(() => verloopVan({ soort: 'datum', tot: new Date(nu + 400 * 86400e3).toISOString() }, nu)) === 'VERLOOP_TE_LANG'
      && fc(() => verloopVan({ soort: 'preset', preset: '99j' }, nu)) === 'VERLOOP_ONGELDIG' && fc(() => verloopVan(null, nu)) === 'VERLOOP_ONGELDIG');
    check('verlengen herkend (later of безстроково); korter niet', isVerlenging(new Date(nu), new Date(nu + 1)) && isVerlenging(new Date(nu), null) && !isVerlenging(new Date(nu), new Date(nu - 1)) && !isVerlenging(null, new Date(nu)));
    check('status: Діє / Використано / Закінчився / Відкликано', statusVan({ eenmalig: true, max_gebruik: null, gebruikt: 1 }) === 'gebruikt' && statusVan({ eenmalig: false, max_gebruik: 3, gebruikt: 2 }) === 'actief'
      && statusVan({ eenmalig: false, max_gebruik: null, gebruikt: 9, verloopt_op: new Date(Date.now() - 1) }) === 'verlopen' && statusVan({ eenmalig: false, max_gebruik: null, gebruikt: 0, ingetrokken_op: new Date() }) === 'ingetrokken');
    check('journaal: toegangscodes onder «toegang»; gastjournaal laat «toegang» en tokens weg', ['toegangscode_aangemaakt', 'toegangscode_ingewisseld', 'toegangscode_ingetrokken', 'toegangscode_gewijzigd', 'gast_sessie_ingetrokken'].every((a) => JOURNAAL_ACTIES[a] === 'toegang'));
    check('auth-poort: alleen inwisselen en uitloggen zijn publiek', !!PUBLIEKE_ROUTES['POST /api/gast/inwisselen'] && !!PUBLIEKE_ROUTES['POST /api/gast/uitloggen'] && !PUBLIEKE_ROUTES['POST /api/gast/bekijk'] && !PUBLIEKE_ROUTES['POST /api/gast/sessie']);

    // ---------------------------------------------------------------- eigenaar + passkey
    const E = G.browser(); await E.aanmelden(`sub-e-${T}`, eigenaar, { service: 'identity' });
    const eId = await idRij(eigenaar);
    await E.aanmelden(`sub-e-${T}`, eigenaar, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/methods' });
    const pk = nieuwePasskey('es256', 1);
    const opt = await id(E, '/api/owner/access/passkeys/registreren/opties');
    const reg = await id(E, '/api/owner/access/passkeys/registreren', { uitdagingId: opt.data.uitdagingId, naam: 'Telefoon', transports: ['internal'], ...registreer(pk, opt.data.publicKey.challenge) });
    check('opzet: eigenaar met passkey', reg.status === 200 && !!eId, reg.body.slice(0, 200));
    const A = G.browser(); await A.aanmelden(`sub-a-${T}`, aMail, { service: 'identity' });
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = $1", [await idRij(aMail)]);
    check('alleen de eigenaar: ander account → lijst «niet beschikbaar» (geen gegevens), maken → OWNER_REQUIRED', (await id(A, `${TC}/lijst`)).data.beschikbaar === false && !('codes' in (await id(A, `${TC}/lijst`)).data) && (await id(A, `${TC}/maken`, { naam: 'x', scopes: ['profiel.lezen'], verloop: { soort: 'nooit' } })).data.error === 'OWNER_REQUIRED');

    const lijst0 = await id(E, `${TC}/lijst`);
    check('lijst: allowlist + «ніколи» + presets voor de UI', lijst0.status === 200 && lijst0.data.scopes.length === Object.keys(GAST_SCOPES).length && lijst0.data.nooit.length === NOOIT.length && lijst0.data.presets.includes('7d'), lijst0.body.slice(0, 200));
    const MAAK = { naam: 'Для Олени', notitie: 'Сусідка, поливає квіти', scopes: ['apparaten.lezen', 'journaal.lezen'], verloop: { soort: 'preset', preset: '7d' } };
    check('maken: alleen Google-step-up is niet genoeg (eigenaar heeft passkey)', (await id(E, `${TC}/maken`, MAAK)).data.error === 'STEP_UP_STRONG_REQUIRED');
    check('maken: verboden scope geweigerd', (await stapOpMet(E, pk, 'toegangscode-maken')).status === 200 && (await id(E, `${TC}/maken`, { ...MAAK, scopes: ['passkeys.lezen'] })).data.error === 'SCOPE_NIET_TOEGESTAAN');
    const m1 = await id(E, `${TC}/maken`, MAAK);
    const code1 = String(m1.data.code || '');
    check('maken: code één keer terug + deellink (#fragment), status Діє', m1.status === 200 && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(code1) && m1.data.link === `https://id.tarasevych.com/toegang#code=${code1}` && m1.data.item.status === 'actief' && m1.data.item.codeHint === code1.slice(-4), m1.body.slice(0, 300));
    const rij1 = (await sys.query('select * from app.toegangscodes where id = $1', [m1.data.item.id])).rows[0];
    check('opslag: alleen de hash, nooit de code', rij1.code_hash === codeHash(codeNormaal(code1)) && !JSON.stringify(rij1).includes(code1.replace(/-/g, '')) && !JSON.stringify(rij1).includes(code1));
    const l1 = await id(E, `${TC}/lijst`);
    check('lijst: code nooit opnieuw zichtbaar; notitie opgeslagen (toegangscode)', !l1.body.includes(code1) && (await id(E, '/api/owner/access/notities/lijst')).data.notities.some((n: any) => n.soort === 'toegangscode' && n.sleutel === m1.data.item.id && /квіти/.test(n.tekst)));
    let rls = 'open';
    try { await alsGebruiker(eId, (q) => q("update app.toegangscodes set gebruikt = 0 where id = $1", [m1.data.item.id])); const n = (await sys.query('select gebruikt from app.toegangscodes where id=$1', [m1.data.item.id])).rows[0]; rls = n ? 'dicht?' : 'open'; } catch { rls = 'dicht'; }
    check('RLS: app-rol kan codes niet zelf wijzigen (alleen systeem)', rls === 'dicht');
    check('RLS: ander account ziet de codes niet', (await alsGebruiker(await idRij(aMail), async (q) => (await q('select count(*)::int n from app.toegangscodes where user_id = $1', [eId])).rows[0].n)) === 0);

    // ---------------------------------------------------------------- inwisselen als gast
    const Gst = G.browser();
    check('gast: alleen op id.tarasevych.com', (await Gst.verzoek('hub.tarasevych.com', '/api/gast/inwisselen', { code: code1 })).data.error === 'GAST_ALLEEN_ID');
    const iw = await gast(Gst, 'inwisselen', { code: code1.toLowerCase() }, ip());
    check('inwisselen: gastsessie (cookie tsv_gast) + wat/tot wanneer', iw.status === 200 && Gst.jar.has('tsv_gast') && iw.data.code === 'Для Олени' && iw.data.scopes.length === 2 && Date.parse(iw.data.tot) > Date.now(), iw.body.slice(0, 200));
    const sess = await gast(Gst, 'sessie');
    check('gastsessie: banner-gegevens, geen e-mail van de eigenaar', sess.status === 200 && !!sess.data.tot && !sess.body.includes(eigenaar) && !sess.body.includes('@'), sess.body.slice(0, 200));
    const bk = await gast(Gst, 'bekijk', { scope: 'apparaten.lezen' });
    check('gast: toegestane scope werkt (apparaten, alleen lezen)', bk.status === 200 && Array.isArray(bk.data.data.apparaten), bk.body.slice(0, 200));
    const bj = await gast(Gst, 'bekijk', { scope: 'journaal.lezen' });
    check('gast: journaal zonder «toegang»/token-regels', bj.status === 200 && bj.data.data.items.every((x: any) => x.soort !== 'toegang' && x.soort !== 'token'));
    check('gast: scope buiten de code geweigerd (profiel)', (await gast(Gst, 'bekijk', { scope: 'profiel.lezen' })).status === 403);
    check('gast: verboden/onbekend gebied geweigerd', (await gast(Gst, 'bekijk', { scope: 'passkeys' })).data.error === 'GAST_GEEN_TOEGANG' && (await gast(Gst, 'bekijk', { scope: 'beheer.lezen' })).status === 403);
    const own = await Gst.verzoek('id.tarasevych.com', '/api/owner/access/passkeys/lijst', { service: 'identity', tabContext: Gst.tab });
    const own2 = await Gst.verzoek('id.tarasevych.com', `${TC}/lijst`, { service: 'identity', tabContext: Gst.tab });
    const boot = await Gst.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', { service: 'identity', tabContext: Gst.tab, sourceOrigin: 'https://id.tarasevych.com' });
    check('gast is NIET de eigenaar: eigenaarsroutes 401, bootstrap zonder account', own.status === 401 && own2.status === 401 && !boot.body.includes(eigenaar) && !boot.data.user, `${own.status} ${own2.status} ${boot.body.slice(0, 120)}`);
    check('gast zonder cookie: 401', (await gast(G.browser(), 'sessie')).status === 401 && (await gast(G.browser(), 'bekijk', { scope: 'apparaten.lezen' })).status === 401);

    // eigenaar ziet het gebruik, de acties en krijgt één melding bij het eerste gebruik
    const l2 = (await id(E, `${TC}/lijst`)).data.codes.find((c: any) => c.id === m1.data.item.id);
    check('eigenaar: gebruik (1×), laatste keer (apparaat + IP-hash), geschiedenis met acties en weigering', l2.gebruikt === 1 && !!l2.laatstGebruiktOp && l2.laatstApparaat === 'overig/overig' && /^[0-9a-f]{12}$/.test(l2.laatstIpKort || '')
      && ['aangemaakt', 'ingewisseld', 'actie', 'geweigerd'].every((s) => l2.geschiedenis.some((g: any) => g.soort === s)) && l2.geschiedenis.some((g: any) => g.soort === 'actie' && g.detail.scope === 'apparaten.lezen') && l2.sessies.length === 1 && l2.sessies[0].actief, JSON.stringify(l2).slice(0, 400));
    const md1 = (await meldingen(eId)).filter((m: any) => /використано вперше/.test(String(m.title || '')));
    const Gst2 = G.browser();
    await gast(Gst2, 'inwisselen', { code: code1 }, ip());
    const md2 = (await meldingen(eId)).filter((m: any) => /використано вперше/.test(String(m.title || '')));
    check('melding in de bel alleen bij het EERSTE gebruik', md1.length === 1 && md2.length === 1 && /toegangscodes/.test(String(md1[0].link || '')), JSON.stringify(md1[0] || {}).slice(0, 200));
    check('audit: gastacties met code-id (actor gast:<code>)', (await sys.query("select count(*)::int n from app.audit where owner_id = $1 and actor_id = $2 and action in ('gast_actie','gast_geweigerd','toegangscode_ingewisseld')", [eId, `gast:${m1.data.item.id}`])).rows[0].n >= 4);

    // eenmalig + maximum
    const m2 = await id(E, `${TC}/maken`, { naam: 'Eenmalig', scopes: ['profiel.lezen'], verloop: { soort: 'nooit' }, eenmalig: true });
    const G3 = G.browser(), G4 = G.browser();
    const e1 = await gast(G3, 'inwisselen', { code: m2.data.code }, ip()), e2 = await gast(G4, 'inwisselen', { code: m2.data.code }, ip());
    check('eenmalig: tweede keer CODE_ONGELDIG (zelfde fout als onbekend), status «Використано»', e1.status === 200 && e2.data.error === 'CODE_ONGELDIG'
      && (await id(E, `${TC}/lijst`)).data.codes.find((c: any) => c.id === m2.data.item.id).status === 'gebruikt');
    const pr = await gast(G3, 'bekijk', { scope: 'profiel.lezen' });
    check('profiel-scope: naam/foto, nooit e-mail', pr.status === 200 && !pr.body.includes('@') && 'naam' in pr.data.data, pr.body.slice(0, 200));
    const m3 = await id(E, `${TC}/maken`, { naam: 'Twee keer', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1d' }, maxGebruik: 2 });
    const r3 = [];
    for (let i = 0; i < 3; i++) r3.push((await gast(G.browser(), 'inwisselen', { code: m3.data.code }, ip())).status);
    check('maximum 2: derde keer geweigerd', r3.join(',') === '200,200,400', r3.join(','));
    check('maken: ongeldig maximum / te lange naam geweigerd', (await id(E, `${TC}/maken`, { ...MAAK, maxGebruik: 0 })).data.error === 'MAX_GEBRUIK_ONGELDIG' && (await id(E, `${TC}/maken`, { ...MAAK, naam: 'я'.repeat(81) })).data.error === 'NAAM_TE_LANG');

    // ---------------------------------------------------------------- verloop
    const m4 = await id(E, `${TC}/maken`, { naam: 'Verloopt', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1u' } });
    const G5 = G.browser();
    await gast(G5, 'inwisselen', { code: m4.data.code }, ip());
    check('verloop: gastsessie eindigt uiterlijk bij het verloop van de code', (await gast(G5, 'sessie')).status === 200 && Math.abs(Date.parse((await gast(G5, 'sessie')).data.tot) - Date.parse(m4.data.item.verlooptOp)) < 2000);
    await sys.query("update app.toegangscodes set verloopt_op = now() - interval '1 second' where id = $1", [m4.data.item.id]);
    check('verloop: daarna 401 en inwisselen geweigerd; status «Закінчився»', (await gast(G5, 'sessie')).status === 401 && (await gast(G.browser(), 'inwisselen', { code: m4.data.code }, ip())).data.error === 'CODE_ONGELDIG'
      && (await id(E, `${TC}/lijst`)).data.codes.find((c: any) => c.id === m4.data.item.id).status === 'verlopen');

    // ---------------------------------------------------------------- wijzigen: korter vrij, langer = sterke step-up
    const E2 = G.browser(); await E2.aanmelden(`sub-e-${T}`, eigenaar, { service: 'identity', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const kort = await id(E2, `${TC}/wijzigen`, { id: m1.data.item.id, verloop: { soort: 'preset', preset: '1d' } });
    check('korter maken: zonder extra bevestiging; lopende gastsessie korter', kort.status === 200 && kort.data.verlenging === false && Math.abs(Date.parse((await gast(Gst, 'sessie')).data.tot) - Date.parse(kort.data.item.verlooptOp)) < 2000, kort.body.slice(0, 200));
    const lang = await id(E2, `${TC}/wijzigen`, { id: m1.data.item.id, verloop: { soort: 'preset', preset: '30d' } });
    check('verlengen: vraagt sterke step-up', lang.data.error === 'STEP_UP_STRONG_REQUIRED' && (await id(E2, `${TC}/wijzigen`, { id: m1.data.item.id, verloop: { soort: 'nooit' } })).data.error === 'STEP_UP_STRONG_REQUIRED');
    await stapOpMet(E2, pk, 'toegangscode-verlengen');
    const lang2 = await id(E2, `${TC}/wijzigen`, { id: m1.data.item.id, verloop: { soort: 'preset', preset: '30d' } });
    check('verlengen na passkey: gelukt + in de geschiedenis', lang2.status === 200 && lang2.data.verlenging === true && (await id(E, `${TC}/lijst`)).data.codes.find((c: any) => c.id === m1.data.item.id).geschiedenis.some((g: any) => g.soort === 'gewijzigd' && g.detail.verlenging === true));

    // ---------------------------------------------------------------- intrekken (reden) beëindigt gastsessies meteen
    check('intrekken: reden verplicht', (await id(E2, `${TC}/intrekken`, { id: m1.data.item.id, reden: 'kort' })).data.error === 'REDEN_TE_KORT');
    const it = await id(E2, `${TC}/intrekken`, { id: m1.data.item.id, reden: 'Олена вже повернула ключі' });
    check('intrekken: beide gastsessies meteen weg (401), status «Відкликано», reden bewaard', it.status === 200 && it.data.sessiesBeeindigd === 2 && (await gast(Gst, 'sessie')).status === 401 && (await gast(Gst2, 'bekijk', { scope: 'apparaten.lezen' })).status === 401
      && it.data.item.status === 'ingetrokken' && it.data.item.ingetrokkenReden === 'Олена вже повернула ключі', it.body.slice(0, 200));
    check('intrekken: code daarna ongeldig; tweede keer AL_INGETROKKEN', (await gast(G.browser(), 'inwisselen', { code: code1 }, ip())).data.error === 'CODE_ONGELDIG' && (await id(E2, `${TC}/intrekken`, { id: m1.data.item.id, reden: 'Nog een keer intrekken' })).data.error === 'AL_INGETROKKEN');
    check('journaal/audit: aangemaakt, gewijzigd, ingetrokken', (await sys.query("select count(distinct action)::int n from app.audit where owner_id = $1 and action in ('toegangscode_aangemaakt','toegangscode_gewijzigd','toegangscode_ingetrokken')", [eId])).rows[0].n === 3);

    // ---------------------------------------------------------------- blokkade bij raden
    const raadIp = ip();
    const raad: number[] = [];
    for (let i = 0; i < 6; i++) raad.push((await gast(G.browser(), 'inwisselen', { code: nieuweCode() }, raadIp)).status);
    const m5 = await id(E, `${TC}/maken`, { naam: 'Na blokkade', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1u' } });
    const geblokt = await gast(G.browser(), 'inwisselen', { code: m5.data.code }, raadIp);
    check('raden: na 5 fouten blokkade (429), ook met een geldige code', raad.slice(0, 5).every((s) => s === 400) && raad[5] === 429 && geblokt.status === 429 && geblokt.data.error === 'GAST_GEBLOKKEERD', raad.join(','));
    check('ander IP: gewoon inwisselen', (await gast(G.browser(), 'inwisselen', { code: m5.data.code }, ip())).status === 200);

    // ---------------------------------------------------------------- «Сесії»: gastsessies + alle andere beëindigen
    const G6 = G.browser(); await gast(G6, 'inwisselen', { code: m3.data.code }, ip()).catch(() => undefined);
    const G7 = G.browser(); const m6 = await id(E, `${TC}/maken`, { naam: 'Sessies', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1d' } });
    await gast(G7, 'inwisselen', { code: m6.data.code }, ip());
    const gl = await id(E, `${GS}/lijst`);
    const s7 = gl.data.sessies.find((s: any) => s.codeId === m6.data.item.id);
    check('gastsessies: lijst met code-naam, apparaat, gestart, laatst actief', gl.status === 200 && !!s7 && s7.codeNaam === 'Sessies' && !!s7.gestartOp && !!s7.laatstActiefOp, gl.body.slice(0, 300));
    const een = await id(E, `${GS}/intrekken`, { id: s7.id });
    check('gastsessie afzonderlijk beëindigen', een.data.beeindigd === 1 && (await gast(G7, 'sessie')).status === 401);
    const G8 = G.browser(); await gast(G8, 'inwisselen', { code: m6.data.code }, ip());
    const ao = await id(E, '/api/owner/identity/security/revoke-others', { sourceOrigin: 'https://id.tarasevych.com', gast: true });
    const e2boot = await E2.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', E2.ctxBody('identity', { sourceOrigin: 'https://id.tarasevych.com' }));
    const eboot = await E.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', E.ctxBody('identity', { sourceOrigin: 'https://id.tarasevych.com' }));
    check('«Завершити всі інші»: andere sessie (E2) + gastsessies weg, deze blijft', ao.status === 200 && ao.data.gast >= 1 && (await gast(G8, 'sessie')).status === 401 && !e2boot.body.includes(eigenaar) && eboot.body.includes(eigenaar), `${ao.body.slice(0, 200)} | ${e2boot.body.slice(0, 120)}`);

    // ---------------------------------------------------------------- uitloggen gast + lezers
    const G9 = G.browser(); const m7 = await id(E, `${TC}/maken`, { naam: 'Uitloggen', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1u' } });
    await gast(G9, 'inwisselen', { code: m7.data.code }, ip());
    const uit = await gast(G9, 'uitloggen');
    check('gast uitloggen: cookie weg, sessie ongeldig, idempotent', uit.status === 200 && !G9.jar.has('tsv_gast') && (await gast(G9, 'uitloggen')).status === 200);
    const jl = await GAST_LEZERS['journaal.lezen'](eId) as { items: Array<{ soort: string }> };
    check('gastjournaal: geen regels over rechten/codes/tokens', jl.items.every((x) => x.soort !== 'toegang' && x.soort !== 'token'));

    // ---------------------------------------------------------------- statisch: UI
    const ui = ['src/Toegangscodes.tsx', 'src/GastToegang.tsx', 'src/SessiesOverzicht.tsx', 'src/AdminUitrolView.tsx', 'src/main.tsx'].map((f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } });
    check('ui: «Коди доступу для інших» + NL, statussen Діє/Використано/Закінчився/Відкликано', /Коди доступу для інших/.test(ui[0]) && /Toegangscodes voor anderen/.test(ui[0]) && ['Діє', 'Використано', 'Закінчився', 'Відкликано'].every((s) => ui[0].includes(s)));
    check('ui: gastpagina met banner «Гостьовий доступ від … до …»', /Гостьовий доступ від/.test(ui[1]) && /Gasttoegang van/.test(ui[1]) && /\/toegang/.test(ui[4]));
    check('ui: «Сесії» met gastsessies en «alle andere beëindigen»', /Завершити всі інші/.test(ui[2]) && /Гостьові сесії/.test(ui[2]));
    check('ui: geen window.prompt/confirm meer in AdminUitrolView', !/window\.(prompt|confirm)\(/.test(ui[3]));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`gc-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await sys.query('delete from app.toegangscodes where user_id = any($1)', [ids]).catch(() => undefined);
      for (const t of ['passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities']) await sys.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
      await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]).catch(() => undefined);
    }
    await pool.query('delete from app.login_lockouts where subject = any($1)', [ips.map((v) => `gast-inwisselen:${ipHash(v) || v}`)]).catch(() => undefined);
    for (const k of ENV) { const v = vorige[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
