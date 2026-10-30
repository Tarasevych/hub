// «Подивитися як користувач» (0068, 18.10.2026): alleen met uitdrukkelijke toestemming. Echte database, echte regels (backend/impersonatie.ts)
// en ECHTE routes van de site (in-process via site-dispatch → backend/index.ts), geen nagebootste site.
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { auditToevoegen } from '../../server/platform/audit';
import { metImpersonatie } from '../../server/platform/context';
import * as tp from '../../backend/tech-profiel';
import * as im from '../../backend/impersonatie';
import { roepAlsImpersonatie, callSite, echteAanroepZonderHekVoorTest } from '../../backend/site-aanroep';
import { agentRouteVerboden } from '../../backend/agent-namens';
import { sterkeStapOpGeldig, totpStapOpVastleggen, passkeyStapOpVastleggen } from '../../backend/stap-op';
import { IMPERSONATIE_STANDAARD, isLeesRoute, routeOordeel } from '../../shared/impersonatie';
import { checker } from './hulp/nep-google';
import { readFileSync } from 'node:fs';
import { dienstVanHost, herschrijf } from '../../src/impersonatie/herschrijf';

const tab = () => randomBytes(24).toString('hex');
async function code(p: Promise<unknown>) { try { await p; return 'OK'; } catch (e) { return e instanceof tp.TechFout ? `${e.code}/${e.status}` : `ANDERS:${(e as Error).message}`; } }

export async function main(): Promise<number> {
  const { check, einde } = checker('impersonatie');
  delete process.env.STAP_OP_UIT;
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'user', status = 'approved') => { const id = randomUUID(); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status, name: `Тест ${email.split('@')[0]}` }]); return { id, email, role, status }; };
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eig = bestaand ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' } : await mk(String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'), 'owner');
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  const eigProfielVooraf = (await sys.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows.length;
  const beh = await mk(`beheer-${sfx}@eenheid.test`), klant = await mk(`klant-${sfx}@eenheid.test`), ander = await mk(`ander-${sfx}@eenheid.test`);
  const ids = [beh.id, klant.id, ander.id];
  const meldingen: Array<{ id: string; titel: string; tekst: string }> = [];
  const meld: im.Melder = async (id, _e, _k, titel, tekst) => { meldingen.push({ id, titel, tekst }); };
  const klantAuth = (sid = `sess-${randomUUID()}`) => ({ user: klant, session: { id: sid, createdAt: Date.now() - 60_000 }, tabSession: null });
  try {
    // ------------------------------------------------ regels (puur)
    check('lezen: GET en POST …/overzicht, …/messages; schrijven: …/zet, …/send, …/read (markeren), PATCH/DELETE',
      isLeesRoute('POST /api/owner/weergave') && isLeesRoute('POST /api/owner/mail/google-suite/messages') && isLeesRoute('GET /api/x')
      && !isLeesRoute('POST /api/owner/weergave/zet') && !isLeesRoute('POST /api/owner/mail/send') && !isLeesRoute('POST /api/owner/notifications/read')
      && !isLeesRoute('PATCH /api/mcp/board') && !isLeesRoute('DELETE /api/x/1') && !isLeesRoute('POST /api/mcp/board'));
    const verboden = ['POST /api/owner/identity/account/delete', 'POST /api/owner/identity/security/revoke-all', 'POST /api/owner/access/passkeys/remove', 'POST /api/owner/access/totp/reset',
      'POST /api/owner/geheimen/lijst', 'POST /api/owner/api-platform/vault/reveal', 'POST /api/owner/cloud/export', 'POST /api/owner/admin/users/role', 'POST /api/owner/identity/admin/roles',
      'POST /api/owner/tech/activeren', 'POST /api/impersonatie/aanvragen', 'POST /api/ondersteuning/toestaan', 'POST /api/owner/session/logout', 'POST /api/owner/billing/checkout', 'POST /api/security/overview'];
    const lek = verboden.filter((r) => routeOordeel(r, true) !== 'IMPERSONATIE_VERBODEN');
    check(`vaste verbodslijst geldt OOK «з правом дій» (${verboden.length} routes)`, lek.length === 0, lek.join(', '));

    // ------------------------------------------------ browser van de beheerder (puur): wat wordt doorgestuurd
    const O = 'https://mail.tarasevych.com';
    const w1 = herschrijf('POST', '/api/owner/mail/google-suite/messages', JSON.stringify({ service: 'mail', q: 'x' }), O);
    check('browser: same-origin POST /api/… → aanroep met route en body', w1?.route === 'POST /api/owner/mail/google-suite/messages' && w1?.body.q === 'x');
    check('browser: GET met query → body uit de query', herschrijf('GET', `${O}/api/flags?a=1`, null, O)?.body.a === '1');
    check('browser: /api/impersonatie/* en /api/owner/tech/* blijven van de beheerder; andere origin en niet-/api/ ongemoeid',
      herschrijf('POST', '/api/impersonatie/band', '{}', O) === null && herschrijf('POST', '/api/owner/tech/status', '{}', O) === null && herschrijf('POST', 'https://evil.example/api/x', '{}', O) === null && herschrijf('GET', '/assets/a.js', null, O) === null);
    check('browser: dienst uit de hostnaam (id → identity, onbekend → hub)', dienstVanHost('id.tarasevych.com') === 'identity' && dienstVanHost('mail.tarasevych.com') === 'mail' && dienstVanHost('admin.tarasevych.com') === 'hub' && dienstVanHost('localhost') === 'hub');
    const W = process.cwd(), bron = (f: string) => readFileSync(`${W}/${f}`, 'utf8');
    const mainSrc = bron('src/main.tsx');
    check('main.tsx: modus start vóór de app (eerste aanroepen al als de gebruiker)', mainSrc.indexOf('startImpersonatieModus();') > 0 && mainSrc.indexOf('startImpersonatieModus();') < mainSrc.indexOf("render(<App />)"));
    const tl = bron('src/tech/TechLaag.tsx');
    check('technische laag: knop alleen met impersonatie.aanvragen; toestemming voor iedereen', (/techMag\('impersonatie\.aanvragen', t\) \? <ImpersonatieKnop/.test(tl) || /techMag\('impersonatie\.aanvragen', t\) && \{ k: 'impersonatie'[^\n]*el: <ImpersonatieKnop/.test(tl)) /* lijst «⋯» 18.10.2026: groep «Люди й підтримка» */ && tl.includes('<ImpersonatieGebruiker />'));
    const idx = bron('backend/index.ts');
    check('index.ts: hek 2 (routeOordeel + zetImpersonatie) in de gedelegeerde tak, routes geregistreerd', /if\(delegated\.impersonatie\)\{const oordeel=impersonatieRouteOordeel\(route,delegated\.impersonatie\.metActies\)/.test(idx) && idx.includes('...impersonatieRoutes(ownerRequireSession'));

    // ------------------------------------------------ technisch profiel
    const tE = tab(), tB = tab();
    await tp.activeren(eig, tE, 60, 'beheer');
    await tp.toekennen(eig, tE, { email: beh.email, rollen: ['ondersteuning'], maxMinuten: 240 });
    check('beheerder zonder rol (geen technisch profiel) → 403', (await code(im.aanvragen(ander, tab(), { email: klant.email, reden: 'хочу', minuten: 15 }, meld))) === 'TECH_IMPERSONATIE_VEREIST/403');
    check('rol, maar technisch profiel niet actief → 403', (await code(im.aanvragen(beh, tB, { email: klant.email, reden: 'хочу', minuten: 15 }, meld))) === 'TECH_IMPERSONATIE_VEREIST/403');
    await tp.activeren(beh, tB, 120, 'support');
    check('niet bij zichzelf', (await code(im.aanvragen(beh, tB, { email: beh.email, reden: 'тест', minuten: 15 }, meld))).startsWith('NIET_AAN_JEZELF'));
    check('niet bij de eigenaar van de server', /^(EIGENAAR_ONAANTASTBAAR|GEBRUIKER_NIET_GEVONDEN)/.test(await code(im.aanvragen(beh, tB, { email: eig.email, reden: 'тест', minuten: 15 }, meld))));
    check('duur 5–60 min (4 en 61 geweigerd)', (await code(im.aanvragen(beh, tB, { email: klant.email, reden: 'тест', minuten: 61 }, meld))).startsWith('DUUR_ONGELDIG') && (await code(im.aanvragen(beh, tB, { email: klant.email, reden: 'тест', minuten: 4 }, meld))).startsWith('DUUR_ONGELDIG'));
    check('reden verplicht', (await code(im.aanvragen(beh, tB, { email: klant.email, reden: ' ', minuten: 15 }, meld))).startsWith('REDEN_ONGELDIG'));

    // ------------------------------------------------ verzoek + melding
    const v = await im.aanvragen(beh, tB, { email: klant.email, reden: 'не видно листів у пошті' }, meld);
    check(`zonder duur → standaard ${IMPERSONATIE_STANDAARD} min, status «wacht», alleen lezen`, v.status === 'wacht' && v.minuten === IMPERSONATIE_STANDAARD && v.metActies === false);
    const m = meldingen.find((x) => x.id === klant.id);
    check('melding aan de gebruiker: wie, waarom, hoe lang, wat zichtbaar en wat nooit', !!m && m.tekst.includes(beh.email) && m.tekst.includes('не видно листів') && m.tekst.includes('15 хв') && /Буде видно/.test(m.tekst) && /Ніколи/.test(m.tekst) && /passkey/.test(m.tekst));
    const vm = await im.voorMij(klant);
    check('«Хто має доступ»: wachtend verzoek met beheerder en reden', vm.open.some((x) => x.id === v.id && x.beheerder === beh.email && x.status === 'wacht'));

    // ------------------------------------------------ geen toestemming → geen sessie
    check('zonder toestemming: geen aanroep (IMPERSONATIE_BEEINDIGD)', (await code(im.aanroep(beh, tB, { id: v.id, route: 'POST /api/owner/weergave', body: {} }))) === 'IMPERSONATIE_BEEINDIGD/403');
    check('zonder toestemming: geen band', (await code(im.band(beh, tB, v.id))) === 'IMPERSONATIE_BEEINDIGD/403');
    check('een ander kan niet beslissen', (await code(im.toestaan({ user: ander, session: { id: 's', createdAt: 1 }, tabSession: null } as never, v.id, false, meld))).startsWith('VERZOEK_NIET_OPEN'));

    // ------------------------------------------------ toestemming zonder sterke step-up → geweigerd
    const ka = klantAuth();
    check('toestaan zonder verse passkey/code → STEP_UP_STRONG_REQUIRED', (await code(im.toestaan(ka as never, v.id, false, meld))) === 'STEP_UP_STRONG_REQUIRED/403');
    check('…en het verzoek wacht nog (geen sessie)', (await sys.query('SELECT status FROM app.impersonatie_sessies WHERE id=$1', [v.id])).rows[0].status === 'wacht');
    await passkeyStapOpVastleggen(ka as never);
    const ok = await im.toestaan(ka as never, v.id, false, meld);
    check('met passkey: actief, eind = nu + 15 min, alleen lezen', ok.status === 'actief' && !ok.metActies && Math.abs((ok.eind ?? 0) - Date.now() - 15 * 60_000) < 10_000);
    check('bevestiging is verbruikt (volgende toestemming vraagt opnieuw)', !(await sterkeStapOpGeldig(ka as never)));
    check('beheerder krijgt een melding van de toestemming', meldingen.some((x) => x.id === beh.id && /дозволив/.test(x.titel)));

    // ------------------------------------------------ echte routes, alleen lezen
    await sys.query(`INSERT INTO app.ui_weergave (user_id, modus) VALUES ($1,'expert') ON CONFLICT (user_id) DO UPDATE SET modus='expert'`, [klant.id]);
    await sys.query(`INSERT INTO app.ui_weergave (user_id, modus) VALUES ($1,'eenvoudig') ON CONFLICT (user_id) DO UPDATE SET modus='eenvoudig'`, [beh.id]);
    const lees = await im.aanroep(beh, tB, { id: v.id, route: 'POST /api/owner/weergave', body: { service: 'hub' } });
    check('lezen werkt en toont de gegevens van de GEBRUIKER (expert), niet van de beheerder (eenvoudig)', lees.status === 200 && (lees.data as any)?.modus === 'expert', JSON.stringify(lees));
    const zet = await code(im.aanroep(beh, tB, { id: v.id, route: 'POST /api/owner/weergave/zet', body: { modus: 'eenvoudig' } }));
    check('alleen lezen: POST /api/owner/weergave/zet → 403 IMPERSONATIE_ALLEEN_LEZEN', zet === 'IMPERSONATIE_ALLEEN_LEZEN/403', zet);
    check('…en de instelling van de gebruiker is ongewijzigd', (await sys.query('SELECT modus FROM app.ui_weergave WHERE user_id=$1', [klant.id])).rows[0].modus === 'expert');
    for (const r of ['POST /api/mcp/board', 'PATCH /api/mcp/board', 'POST /api/owner/notifications/read', 'POST /api/owner/mail/google-suite/message/modify', 'POST /api/owner/mail/compose/draft/save', 'DELETE /api/owner/cloud/items/1'])
      check(`alleen lezen: ${r} → 403`, (await code(im.aanroep(beh, tB, { id: v.id, route: r, body: { kind: 'task', title: 'x' } }))) === 'IMPERSONATIE_ALLEEN_LEZEN/403');
    const borden = (await sys.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1`, [klant.id]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    check('geen kaart op het bord van de gebruiker aangemaakt', borden === 0);
    // Hek 2: dezelfde schrijfroute rechtstreeks in-process (zonder hek 1) → ownerRequireSession weigert.
    const h2 = await roepAlsImpersonatie(klant.id, 'hub', 'POST /api/owner/weergave/zet', { service: 'hub', tabContext: tB, modus: 'eenvoudig' }, { id: v.id, beheerderId: beh.id, metActies: false });
    check('hek 2 (ownerRequireSession): schrijfroute zonder hek 1 → IMPERSONATIE_ALLEEN_LEZEN, niets gewijzigd', h2.data?.error === 'IMPERSONATIE_ALLEEN_LEZEN' && (await sys.query('SELECT modus FROM app.ui_weergave WHERE user_id=$1', [klant.id])).rows[0].modus === 'expert', JSON.stringify(h2.data));
    // Hek 3: db.ts weigert elke schrijfquery in een alleen-lezen-context (ook als een route verkeerd als «lezen» zou zijn ingedeeld).
    const h3 = await metImpersonatie({ id: v.id, door: beh.id }, true, async () => db.add('impersonatie_test_v1', [{ x: 1 }]).then((r) => (r.every((x) => x === null) ? 'niet geschreven' : 'geschreven'), (e) => String((e as Error).message)));
    const h3n = (await sys.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='impersonatie_test_v1'`)).rows[0].n;
    check('hek 3 (db.ts): schrijven in app.records geweigerd en gemarkeerd (niets in de tabel)', ['niet geschreven', 'IMPERSONATIE_ALLEEN_LEZEN'].includes(String(h3.waarde)) && h3.geblokkeerd === true && h3n === 0, JSON.stringify({ ...h3, h3n }));
    const h3l = await metImpersonatie({ id: v.id, door: beh.id }, true, async () => db.list('impersonatie_test_v1', {}).then(() => 'gelezen', (e) => String((e as Error).message)));
    check('hek 3: lezen blijft werken', h3l.waarde === 'gelezen' && !h3l.geblokkeerd);
    // Journaal: elke regel in de keten van de gebruiker met de beheerder als actor.
    await metImpersonatie({ id: v.id, door: beh.id, doorEmail: beh.email }, true, async () => auditToevoegen({ ownerId: klant.id, action: 'owner.test.binnen-impersonatie', result: 'success', details: {} }));
    const binnen = (await sys.query(`SELECT actor_id, details, ctx_namens FROM app.audit WHERE owner_id=$1 AND action='owner.test.binnen-impersonatie' ORDER BY id DESC LIMIT 1`, [klant.id])).rows[0];
    check('audit binnen een impersonatie: actor = beheerder, actorType «impersonatie», namensId = gebruiker, «від імені» = sessie', binnen?.actor_id === beh.id && binnen?.details?.actorType === 'impersonatie' && binnen?.details?.namensId === klant.id && binnen?.ctx_namens === v.id, JSON.stringify(binnen));
    const tB2 = tab(); await tp.activeren(beh, tB2, 30, 'ander tabblad');
    check('ander tabblad van dezelfde beheerder → ANDER_TABBLAD', (await code(im.aanroep(beh, tB2, { id: v.id, route: 'POST /api/owner/weergave' }))) === 'ANDER_TABBLAD/403');
    check('een andere beheerder (ook de eigenaar) kan deze sessie niet gebruiken', (await code(im.aanroep(eig, tE, { id: v.id, route: 'POST /api/owner/weergave' }))) === 'IMPERSONATIE_NIET_GEVONDEN/404');
    check('band: wie en tot wanneer', (await im.band(beh, tB, v.id)).doelNaam === `Тест klant-${sfx}`);

    // ------------------------------------------------ gebruiker beëindigt → meteen
    await im.beeindigen(klant, v.id, meld);
    check('gebruiker «Завершити негайно» → volgende aanroep meteen geweigerd', (await code(im.aanroep(beh, tB, { id: v.id, route: 'POST /api/owner/weergave' }))) === 'IMPERSONATIE_BEEINDIGD/403');
    const jr = await im.sessieJournaal(klant, v.id);
    const acties = jr.regels.map((r) => r.actie);
    check('journaal voor de gebruiker: gevraagd, toegestaan, bekeken, geweigerde routes, beëindigd', ['owner.impersonatie.gevraagd', 'owner.impersonatie.toegestaan', 'owner.impersonatie.bekeken', 'owner.impersonatie.geweigerd-route', 'owner.impersonatie.beeindigd'].every((a) => acties.includes(a)), acties.join(','));
    check('journaal: handelingen van de beheerder met actorType «impersonatie»', jr.regels.filter((r) => r.door === 'beheerder' && r.actie !== 'owner.impersonatie.gevraagd').every((r) => r.actorType === 'impersonatie') && jr.regels.some((r) => r.door === 'beheerder' && r.actorType === 'impersonatie'));
    check('samenvatting na afloop: geweigerd ≥ 7, acties 0', jr.samenvatting.geweigerd >= 7 && jr.samenvatting.acties === 0, JSON.stringify(jr.samenvatting));
    check('een derde kan het journaal niet lezen', (await code(im.sessieJournaal(ander, v.id))).startsWith('IMPERSONATIE_NIET_GEVONDEN'));

    // ------------------------------------------------ «з правом дій»: gewone actie mag, verbodslijst nooit
    const v2 = await im.aanvragen(beh, tB, { email: klant.email, reden: 'допомогти змінити вигляд', minuten: 10 }, meld);
    const ka2 = klantAuth(); await totpStapOpVastleggen(ka2 as never);
    const ok2 = await im.toestaan(ka2 as never, v2.id, true, meld);
    check('toestemming met recht op acties (TOTP)', ok2.metActies === true && ok2.status === 'actief');
    const actie = await im.aanroep(beh, tB, { id: v2.id, route: 'POST /api/owner/weergave/zet', body: { modus: 'eenvoudig' } });
    check('met acties: gewone instelling wijzigen werkt (bij de GEBRUIKER)', actie.status === 200 && (await sys.query('SELECT modus FROM app.ui_weergave WHERE user_id=$1', [klant.id])).rows[0].modus === 'eenvoudig'
      && (await sys.query('SELECT modus FROM app.ui_weergave WHERE user_id=$1', [beh.id])).rows[0].modus === 'eenvoudig', JSON.stringify(actie));
    const ar = (await sys.query(`SELECT actor_id, details FROM app.audit WHERE owner_id=$1 AND action='owner.impersonatie.actie' AND ctx_namens=$2`, [klant.id, v2.id])).rows;
    check('elke actie in het journaal van de gebruiker (actor = beheerder, actorType impersonatie)', ar.length === 1 && ar[0].actor_id === beh.id && ar[0].details.actorType === 'impersonatie' && ar[0].details.route === 'POST /api/owner/weergave/zet');
    for (const r of ['POST /api/owner/identity/account/delete', 'POST /api/owner/access/passkeys/remove', 'POST /api/owner/geheimen/lijst', 'POST /api/owner/cloud/export', 'POST /api/owner/admin/users/role', 'POST /api/owner/session/logout', 'POST /api/impersonatie/toestaan'])
      check(`met acties, toch verboden: ${r}`, (await code(im.aanroep(beh, tB, { id: v2.id, route: r, body: {} }))) === 'IMPERSONATIE_VERBODEN/403');
    const h2b = await roepAlsImpersonatie(klant.id, 'hub', 'POST /api/owner/geheimen/lijst', { service: 'hub', tabContext: tB }, { id: v2.id, beheerderId: beh.id, metActies: true });
    check('hek 2 ook voor de verbodslijst (zonder hek 1): geheimen → IMPERSONATIE_VERBODEN', h2b.status >= 400 && h2b.data?.error === 'IMPERSONATIE_VERBODEN', JSON.stringify(h2b));
    const h2c = await roepAlsImpersonatie(klant.id, 'identity', 'POST /api/owner/identity/security/overview', { service: 'identity', tabContext: tB }, { id: v2.id, beheerderId: beh.id, metActies: true });
    check('route met eigen sessiecontrole (identity) krijgt zonder cookie niets', h2c.status >= 400, JSON.stringify(h2c));

    // ------------------------------------------------ einde door de tijd en door uitloggen van de beheerder
    await sys.query(`UPDATE app.impersonatie_sessies SET besloten_op = now() - interval '11 minutes', eind_op = now() - interval '1 minute' WHERE id = $1`, [v2.id]);
    check('tijd om → meteen geweigerd, status «verlopen»', (await code(im.aanroep(beh, tB, { id: v2.id, route: 'POST /api/owner/weergave' }))) === 'IMPERSONATIE_BEEINDIGD/403' && (await sys.query('SELECT status FROM app.impersonatie_sessies WHERE id=$1', [v2.id])).rows[0].status === 'verlopen');
    const v3 = await im.aanvragen(beh, tB, { email: klant.email, reden: 'ще раз', minuten: 5 }, meld);
    const ka3 = klantAuth(); await passkeyStapOpVastleggen(ka3 as never); await im.toestaan(ka3 as never, v3.id, false, meld);
    check('nieuwe sessie loopt', (await im.aanroep(beh, tB, { id: v3.id, route: 'POST /api/owner/weergave' })).status === 200);
    await tp.beeindigenBijUitloggen(beh.id, tB);
    check('beheerder logt uit → sessie meteen beëindigd', (await code(im.aanroep(beh, tB, { id: v3.id, route: 'POST /api/owner/weergave' }))).startsWith('IMPERSONATIE_BEEINDIGD') && (await sys.query('SELECT status, beeindigd_reden FROM app.impersonatie_sessies WHERE id=$1', [v3.id])).rows[0].beeindigd_reden === 'tech-beeindigd');
    check('«Хто має доступ»: niets meer open, recent met samenvatting', await im.voorMij(klant).then((x) => x.open.length === 0 && x.recent.some((r) => r.id === v.id && r.beeindigdDoor === 'gebruiker')));
    await tp.activeren(beh, tB, 60, 'weer');
    const v4 = await im.aanvragen(beh, tB, { email: klant.email, reden: 'вчетверте', minuten: 5 }, meld);
    await im.weigeren(klant, v4.id, meld);
    check('geweigerd → geen sessie', (await code(im.aanroep(beh, tB, { id: v4.id, route: 'POST /api/owner/weergave' }))) === 'IMPERSONATIE_BEEINDIGD/403');
    const v5 = await im.aanvragen(beh, tB, { email: klant.email, reden: 'вп\'яте', minuten: 5 }, meld);
    await sys.query(`UPDATE app.impersonatie_sessies SET aangevraagd_op = now() - interval '16 minutes' WHERE id=$1`, [v5.id]);
    const ka5 = klantAuth(); await passkeyStapOpVastleggen(ka5 as never);
    check('geen antwoord binnen 15 min → verlopen, niet meer toe te staan', (await code(im.toestaan(ka5 as never, v5.id, false, meld))).startsWith('VERZOEK_NIET_OPEN'));

    // ------------------------------------------------ AI-agenten
    check('AGENT_VERBODEN bevat /api/impersonatie en /api/ondersteuning', agentRouteVerboden('POST /api/impersonatie/aanvragen') && agentRouteVerboden('POST /api/impersonatie/aanroep') && agentRouteVerboden('POST /api/ondersteuning/toestaan'));
    check('agent via callSite (hek 1) → AGENT_NIET_TOEGESTAAN', (await callSite(klant.id, 'hub', 'POST /api/impersonatie/voor-mij', {}).then(() => 'OK', (e) => (e as Error).message)) === 'AGENT_NIET_TOEGESTAAN');
    const ag = await echteAanroepZonderHekVoorTest(beh.id, 'hub', 'POST /api/impersonatie/aanvragen', { email: klant.email, reden: 'agent', minuten: 5 }, { namensId: randomUUID(), agent: 'claude' });
    check('agent zonder hek 1 → ownerRequireSession weigert (hek 2)', ag.data?.error === 'AGENT_NIET_TOEGESTAAN', JSON.stringify(ag.data));

    // ------------------------------------------------ database
    check('database: > 60 min onmogelijk', await sys.query(`UPDATE app.impersonatie_sessies SET besloten_op = now(), eind_op = now() + interval '75 minutes' WHERE id = $1`, [v3.id]).then(() => false, () => true));
    const cl = await sys.connect();
    const app = await (async () => { try { await cl.query('BEGIN'); await cl.query('SET LOCAL ROLE mijnruimte_app'); await cl.query(`UPDATE app.impersonatie_sessies SET status='actief' WHERE id=$1`, [v4.id]); return 'ok'; } catch (e) { return String((e as { code?: string }).code); } finally { await cl.query('ROLLBACK').catch(() => undefined); cl.release(); } })();
    check('app-rol kan niets schrijven (ook niet de eigen toestemming verlengen)', app === '42501', app);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.impersonatie_sessies WHERE beheerder_id = ANY($1) OR doel_id = ANY($1)', [[...ids, eig.id]]).catch(() => undefined);
    await sys.query('DELETE FROM app.ui_weergave WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [eigProfielVooraf ? ids : [...ids, eig.id]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [eigProfielVooraf ? ids : [...ids, eig.id]]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [ids]).catch(() => undefined);
  }
  return einde();
}
