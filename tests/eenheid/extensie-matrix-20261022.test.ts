// «Браузер і агенти» (zone E, 22.10.2026; migratie 0110): matrix slot × mogelijkheid × agent, termijnen naar keuze, herondertekenen,
// uitloggen, en de aanval «andere gebruiker / andere agent». Tegen de wegwerp-PG (zelfde opzet als extensie-beheer.test.ts).
//  - zuiver: capsVoorAgent/capsUnie/wordtRuimer/termijnEinde/extensieFoutUitleg (shared/extensie-matrix.ts);
//  - server: leesMatrix/schrijfMatrix/valideerInvoer; de agent van de aanroep komt uit mcp-namens (nooit uit de client);
//  - controleerBrowserOpdracht: matrix niet ingesteld → zoals vóór 0110; ingesteld → EXTENSIE_CAP / EXTENSIE_AGENT met het exacte pad;
//  - ai-grants.checkCommand: zonder grant-rij telt de matrix; matrix «niet» wint van een grant; zonderBevestiging stuurt needsFreshApproval;
//  - capsHerzien: lopende ontgrendeling krijgt de nieuwe caps en wordt opnieuw geduwd (geen tweede bevestiging);
//  - termijnen: privé 'handmatig' (366 d achtervang) en 'uitloggen' (naUitloggen trekt in); technisch 'overleeft_activatie' blijft
//    ACTIEF na het einde van de activering, 'tech-einde' niet; extensie 0.6.2 krijgt een lange termijn niet (TERMIJN_VEREIST_UPDATE);
//    capsVoorVersie strookt de nieuwe caps weg voor 0.6.2;
//  - aanval: de matrix van B raakt A niet; een agent van B met het token van A → niets; RLS: de app-rol ziet alleen eigen rijen.
import { randomBytes, randomUUID } from 'node:crypto';
import * as grants from '../../backend/ai-toestemmingen';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import * as store from '../../backend/connectors-opslag';
import * as matrix from '../../backend/extensie-matrix';
import * as eo from '../../backend/extensie-ontgrendeling';
import { metNamens } from '../../backend/mcp-namens';
import * as tp from '../../backend/tech-profiel';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';
import {
  BROWSER_BEHEER_URL, capsUnie, capsVoorAgent, capsVoorRuimte, extensieFoutUitleg, legeMatrix, ONTGRENDEL_TERMIJNEN, termijnEinde, termijnUitMinuten, termijnVan, wordtRuimer, type Matrix,
} from '../../shared/extensie-matrix';
import { BROWSER_CAPS, BROWSER_CAPS_OUD } from '../../shared/extensie-ontgrendeling';

const code = async (p: Promise<unknown>): Promise<string> => p.then(() => 'OK', (e) => (e instanceof eo.Weigering ? e.code : `ANDERS:${(e as Error).message}`));

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-matrix-20261022');
  const sys = getPool('systeem');

  // ---------------------------------------------------------------- 1. zuiver
  const m: Matrix = { ...legeMatrix(), rijen: [
    { ruimte: 'prive', agent: '*', caps: ['browser.read'], gewijzigdOp: null, gewijzigdDoor: null },
    { ruimte: 'prive', agent: 'claude', caps: ['browser.read', 'browser.navigate', 'browser.debug'], gewijzigdOp: null, gewijzigdDoor: null },
  ] };
  check('capsVoorAgent: eigen kolom wint, anders «*»; onbekende ruimte → null (erfenis); debug/script nooit privé',
    JSON.stringify(capsVoorAgent(m, 'prive', 'claude')) === '["browser.read","browser.navigate"]' && JSON.stringify(capsVoorAgent(m, 'prive', 'grok')) === '["browser.read"]'
    && JSON.stringify(capsVoorAgent(m, 'prive', null)) === '["browser.read"]' && capsVoorAgent(m, 'technisch', 'claude') === null
    && !capsVoorRuimte('prive').includes('browser.script') && capsVoorRuimte('technisch').length === BROWSER_CAPS.length);
  check('capsUnie: unie over de agenten; wordtRuimer ziet een nieuwe cap, een nieuwe kolom en zonderBevestiging',
    JSON.stringify(capsUnie(m, 'prive')) === '["browser.read","browser.navigate"]'
    && !wordtRuimer(m, m, 'prive')
    && wordtRuimer(m, { ...m, rijen: [...m.rijen, { ruimte: 'prive', agent: 'gpt', caps: ['browser.read', 'browser.interact'], gewijzigdOp: null, gewijzigdDoor: null }] }, 'prive')
    && wordtRuimer(m, { ...m, instellingen: { ...m.instellingen, prive: { zonderBevestiging: true, devtoolsNamen: false } } }, 'prive')
    && !wordtRuimer(m, { ...m, rijen: m.rijen.map((r) => (r.agent === 'claude' ? { ...r, caps: ['browser.read'] as never } : r)) }, 'prive'));
  const nu = 1_800_000_000_000;
  const t7d = termijnVan('7d')!, tTech = termijnVan('tech-einde')!, tHand = termijnVan('handmatig')!;
  const e1 = termijnEinde(t7d, nu, { ruimte: 'technisch', activatieEind: nu + 3_600_000, plafondMs: 366 * 86_400_000 });
  const e2 = termijnEinde(tTech, nu, { ruimte: 'technisch', activatieEind: nu + 3_600_000, plafondMs: 366 * 86_400_000 });
  const e3 = termijnEinde(tHand, nu, { ruimte: 'prive', activatieEind: null, plafondMs: 30 * 86_400_000 });
  check('termijnEinde: 7 d technisch overleeft de activering; tech-einde = activering; handmatig privé kapt op het beleid (30 d)',
    e1.eind === nu + 7 * 86_400_000 && e1.overleeftActivatie && e1.soort === 'duur'
    && e2.eind === nu + 3_600_000 && !e2.overleeftActivatie && e2.soort === 'tech-einde'
    && e3.eind === nu + 30 * 86_400_000 && e3.soort === 'handmatig' && !e3.overleeftActivatie);
  check('termijnen: elf keuzes (0111: + «до закриття браузера»), tech-einde alleen technisch, 15 min ↔ id, onbekend → null',
    ONTGRENDEL_TERMIJNEN.length === 12 && termijnVan('1d')?.ms === 86_400_000 && ONTGRENDEL_TERMIJNEN.filter((t) => t.alleenTechnisch).map((t) => t.id).join() === 'tech-einde' && termijnVan('browser')?.soort === 'browser'
    && termijnUitMinuten(15) === '15m' && termijnUitMinuten(240) === '4u' && termijnUitMinuten(17) === null && termijnVan('x') === null);
  const fu = extensieFoutUitleg('EXTENSIE_CAP: the private slot does not allow "browser.navigate" for Claude …');
  check('extensieFoutUitleg: herkent EXTENSIE_* en geeft uk/nl + het adres van het scherm; andere tekst → null',
    !!fu && fu.code === 'EXTENSIE_CAP' && fu.url === BROWSER_BEHEER_URL && /матриц/i.test(fu.uk) && /matrix/i.test(fu.nl) && extensieFoutUitleg('PERMISSION_OFF: …') === null);

  // ---------------------------------------------------------------- 2. fixtures (A en B; A heeft tech-profiel)
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const A = `exm-a-${T}`, B = `exm-b-${T}`;
  const verplaatst = (await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner-tijdelijk\"') WHERE tbl = 'users' AND data->>'role' = 'owner' RETURNING id")).rows.map((r: { id: string }) => r.id);
  try {
    for (const id of [A, B]) await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', id, { email: `${id}@example.test`, role: 'user', status: 'approved', name: id }]);
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['ontwikkelaar'], 240, 'test')`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    for (const id of [A, B]) await aiDienstAan(id);
    const g = (id: string) => ({ id, email: `${id}@example.test`, role: 'user', status: 'approved' });
    const sessie = (id: string) => ({ user: g(id), service: 'mcp', tabContext: randomBytes(24).toString('hex'), session: { id: randomUUID(), createdAt: Date.now() - 1000 }, tabSession: null }) as eo.Aanroep;
    const aA = sessie(A);
    const maakBrowser = async (uid: string, ruimte: 'prive' | 'technisch', versie = '0.7.0') => {
      const tok = randomToken(32);
      return store.createAgent(uid, `Chrome ${ruimte} ${uid}`, 'browser', sha256(tok), {}, undefined, { pairingId: `p${uid}`.replace(/[^A-Za-z0-9]/g, ''), commandKeyEnc: sealCommandKey(newCommandKey(), uid, sha256(tok)), version: versie, ruimte });
    };
    const AP = await maakBrowser(A, 'prive'), AT = await maakBrowser(A, 'technisch'), BP = await maakBrowser(B, 'prive');
    // A: lopende privé-ontgrendeling met alleen lezen (zoals de eigenaar op 22.10: «allowed: browser.read»)
    const gidAP = await ontgrendelVoorTest(AP.id, A, { caps: ['browser.read'], minuten: 24 * 60 });
    const alsClaude = <T>(f: () => Promise<T>) => metNamens({ client: 'Claude', agent: 'claude', ruimte: 'prive' }, f);
    const alsGrok = <T>(f: () => Promise<T>) => metNamens({ client: 'Grok', agent: 'grok', ruimte: 'prive' }, f);

    // ---------------------------------------------------------------- 3. niet ingesteld = erfenis
    const v0 = await alsClaude(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.navigate', { url: 'https://mail.tarasevych.com/' }));
    check('matrix niet ingesteld: zoals vóór 0110 — EXTENSIE_CAP uit de ontgrendeling, mét het pad naar «Браузер і агенти»',
      !v0.ok && /^EXTENSIE_CAP/.test(v0.fout) && v0.fout.includes(BROWSER_BEHEER_URL), v0.ok ? '' : v0.fout.slice(0, 120));
    check('leesMatrix zonder rijen: leeg, instellingen standaard', (await matrix.leesMatrix(A)).rijen.length === 0 && (await matrix.capsNu(A, 'prive')) === null);

    // ---------------------------------------------------------------- 4. invoer en opslaan
    let fout = '';
    try { matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: 'claude', caps: ['browser.script'] }] }); } catch (e) { fout = (e as Error).message; }
    let fout2 = '';
    try { matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: 'nep', caps: [] }] }); } catch (e) { fout2 = (e as Error).message; }
    const inv = matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: 'claude', caps: ['browser.navigate', 'browser.read'] }], instellingen: { devtoolsNamen: true } });
    check('valideerInvoer: script privé → MATRIX_ONGELDIG:caps-ruimte; onbekende agent → :agent; geldig → caps in BROWSER_CAPS-volgorde + rij «*» erbij',
      fout === 'MATRIX_ONGELDIG:caps-ruimte' && fout2 === 'MATRIX_ONGELDIG:agent' && inv.rijen.some((r) => r.agent === '*') && inv.rijen.find((r) => r.agent === 'claude')!.caps.join() === 'browser.read,browser.navigate' && inv.instellingen?.devtoolsNamen === true);
    const invC = matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: 'gpt', caps: ['browser.console'] }] });
    check('«Консоль і мережа» brengt «Читати» mee (console valt in ai-grants onder lezen)', invC.rijen.find((r) => r.agent === 'gpt')!.caps.join() === 'browser.read,browser.console');
    const { na } = await matrix.schrijfMatrix(A, inv, 'test');
    check('schrijfMatrix: rijen + instellingen op «*»; audit owner.extensie.matrix', na.rijen.length === 2 && na.instellingen.prive.devtoolsNamen === true && na.instellingen.prive.zonderBevestiging === false
      && Number((await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.extensie.matrix'", [A])).rows[0].n) === 1);

    // ---------------------------------------------------------------- 5. afdwinging per agent
    const vClaude = await alsClaude(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.snapshot', {}));
    const vGrok = await alsGrok(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.snapshot', {}));
    check('ingesteld: Claude (eigen kolom) mag lezen; Grok (kolom «*» leeg) → EXTENSIE_AGENT met slot, kolom en het adres',
      vClaude.ok && !vGrok.ok && /^EXTENSIE_AGENT/.test(vGrok.fout) && /column «\*»/.test(vGrok.fout) && vGrok.fout.includes(BROWSER_BEHEER_URL), vGrok.ok ? '' : vGrok.fout.slice(0, 160));
    const vCon = await alsClaude(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.console', {}));
    check('console: de ontgrendeling (lezen) laat het toe, de matrix-rij «Консоль і мережа» niet → EXTENSIE_CAP met browser.console en de kolom',
      !vCon.ok && /^EXTENSIE_CAP/.test(vCon.fout) && /"browser\.console"/.test(vCon.fout) && /column «claude»/.test(vCon.fout), vCon.ok ? '' : vCon.fout.slice(0, 160));
    const vNav = await alsClaude(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.navigate', { url: 'https://mail.tarasevych.com/' }));
    check('matrix staat navigatie toe, maar de ontgrendeling (nog) niet → EXTENSIE_CAP noemt rij én dat de ontgrendeling herondertekend wordt',
      !vNav.ok && /^EXTENSIE_CAP/.test(vNav.fout) && /re-signed/.test(vNav.fout), vNav.ok ? '' : vNav.fout.slice(0, 160));
    const herzien = await eo.capsHerzien(A, 'prive', capsUnie(na, 'prive') ?? []);
    const rijNa = (await sys.query('SELECT caps FROM app.extensie_ontgrendelingen WHERE id = $1', [gidAP])).rows[0];
    const vNav2 = await alsClaude(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.navigate', { url: 'https://mail.tarasevych.com/' }));
    check('capsHerzien: de lopende ontgrendeling krijgt browser.navigate (zelfde gid, geen nieuwe bevestiging) en de opdracht mag nu',
      herzien === 1 && rijNa.caps.join() === 'browser.read,browser.navigate' && vNav2.ok, JSON.stringify(rijNa));
    // chat van de site (geen slug) → kolom «*» (leeg) → geweigerd; met «*» gevuld → mag
    const vChat = await metNamens({ client: 'Чат ШІ (ai.tarasevych.com)' }, () => eo.controleerBrowserOpdracht(AP.id, A, 'browser.snapshot', {}));
    check('zonder agentslug (sitechat) telt de kolom «*»', !vChat.ok && /^EXTENSIE_AGENT/.test(vChat.fout));
    await matrix.schrijfMatrix(A, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read'] }, { agent: 'claude', caps: ['browser.read', 'browser.navigate'] }] }), 'test');
    check('«*» gevuld: Grok en de sitechat mogen lezen, Grok mag niet navigeren (EXTENSIE_CAP noemt kolom «grok»)',
      (await alsGrok(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.snapshot', {}))).ok
      && (await metNamens({ client: 'Чат ШІ (ai.tarasevych.com)' }, () => eo.controleerBrowserOpdracht(AP.id, A, 'browser.snapshot', {}))).ok
      && /column «grok»/.test((await alsGrok(() => eo.controleerBrowserOpdracht(AP.id, A, 'browser.navigate', { url: 'https://mail.tarasevych.com/' })) as { fout: string }).fout));

    // ---------------------------------------------------------------- 6. ai-grants: matrix als toestemming
    const c1 = await alsClaude(() => grants.checkCommand({ id: AP.id, user_id: A }, 'browser.snapshot', {}, 'dispatch'));
    const c2 = await alsGrok(() => grants.checkCommand({ id: AP.id, user_id: A }, 'browser.navigate', { url: 'https://mail.tarasevych.com/' }, 'dispatch'));
    check('checkCommand zonder grant-rij: matrix telt (grantId null, domeinen leeg); matrix «niet» → NO_GRANT',
      c1.ok && c1.grantId === null && c1.domains.length === 0 && !c2.ok && c2.code === 'NO_GRANT');
    await grants.addGrants(A, A, [{ agentId: AP.id, capability: 'browser.interact', minutes: 60 }], { steppedUp: false });
    const c3 = await alsClaude(() => grants.checkCommand({ id: AP.id, user_id: A }, 'browser.click', { name: 'x' }, 'dispatch'));
    check('een grant-rij die de matrix niet dekt (interact) → NO_GRANT: de matrix wint', !c3.ok && c3.code === 'NO_GRANT');
    await matrix.schrijfMatrix(A, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read', 'browser.interact'] }], instellingen: { zonderBevestiging: true } }), 'test');
    const c4 = await alsGrok(() => grants.checkCommand({ id: AP.id, user_id: A }, 'browser.click', { name: 'x' }, 'dispatch'));
    const eff = await grants.effectiveCaps(A, AP.id);
    check('zonderBevestiging in de matrix: destructief zonder klik (needsFreshApproval false); effectiveCaps (push naar de extensie) draagt de matrix-caps',
      c4.ok && c4.needsFreshApproval === false && eff.caps.some((c) => c.capability === 'browser.interact') && eff.caps.some((c) => c.capability === 'browser.read'));

    // ---------------------------------------------------------------- 7. termijnen
    await sys.query("UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = 'test' WHERE user_id = $1 AND ingetrokken_op IS NULL", [A]);
    eo.bijVerbonden(AP.id, A, 'browser', '0.7.0');
    // privé zonder step-up → STEP_UP_REQUIRED (de termijn wordt vóór de step-up al gecontroleerd: ongeldige termijn → DUUR_ONGELDIG)
    check('privé: onbekende termijn → DUUR_ONGELDIG; tech-einde privé → DUUR_ONGELDIG; geldige termijn zonder step-up → STEP_UP_REQUIRED',
      (await code(eo.priveOntgrendelen(aA, { agentId: AP.id, termijn: 'nep' }))) === 'DUUR_ONGELDIG'
      && (await code(eo.priveOntgrendelen(aA, { agentId: AP.id, termijn: 'tech-einde' }))) === 'DUUR_ONGELDIG'
      && (await code(eo.priveOntgrendelen(aA, { agentId: AP.id, termijn: 'handmatig' }))) === 'STEP_UP_REQUIRED');
    eo.bijVerbonden(AP.id, A, 'browser', '0.6.2');
    check('privé met extensie 0.6.2: termijn boven 30 dagen → TERMIJN_VEREIST_UPDATE (vóór de step-up), 7 d mag (STEP_UP_REQUIRED)',
      (await code(eo.priveOntgrendelen(aA, { agentId: AP.id, termijn: '182d' }))) === 'TERMIJN_VEREIST_UPDATE' && (await code(eo.priveOntgrendelen(aA, { agentId: AP.id, termijn: '7d' }))) === 'STEP_UP_REQUIRED');
    eo.bijVerbroken(AP.id);
    // rijen rechtstreeks: 'uitloggen' en 'handmatig' eindigen bij uitloggen; 'duur' niet
    const gidU = await ontgrendelVoorTest(AP.id, A, { caps: ['browser.read'], minuten: 300 * 24 * 60 });
    await sys.query("UPDATE app.extensie_ontgrendelingen SET einde_soort = 'uitloggen' WHERE id = $1", [gidU]);
    const gidD = await ontgrendelVoorTest(BP.id, B, { caps: ['browser.read'], minuten: 60 });
    const nUit = await eo.naUitloggen(A);
    const rU = (await sys.query('SELECT reden_einde, ingetrokken_door FROM app.extensie_ontgrendelingen WHERE id = $1', [gidU])).rows[0];
    check("naUitloggen: rij 'uitloggen' van A ingetrokken (reden uitgelogd, door systeem); rij 'duur' van B ongemoeid",
      nUit === 1 && rU.reden_einde === 'uitgelogd' && rU.ingetrokken_door === 'systeem' && !!(await eo.actieveOntgrendeling(BP.id, B)) && String((await eo.actieveOntgrendeling(BP.id, B))!.id) === gidD);
    check('tech-profiel.bijUitloggen roept de haak ook zonder lopende activering (beeindigenBijUitloggen)', await (async () => {
      const g2 = await ontgrendelVoorTest(AP.id, A, { caps: ['browser.read'], minuten: 60 });
      await sys.query("UPDATE app.extensie_ontgrendelingen SET einde_soort = 'handmatig' WHERE id = $1", [g2]);
      await tp.beeindigenBijUitloggen(A);
      await new Promise((r) => setTimeout(r, 300));
      return (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [g2])).rows[0].reden_einde === 'uitgelogd';
    })());
    // technisch: overleeft_activatie
    const act = await tp.activeren(g(A), aA.tabContext, 30, 'test matrix', { id: aA.session!.id, createdAt: aA.session!.createdAt });
    const gidT1 = await ontgrendelVoorTest(AT.id, A, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 20, activatieId: act.id });
    await sys.query("UPDATE app.extensie_ontgrendelingen SET einde_soort = 'duur', overleeft_activatie = true, eind_op = now() + interval '7 days' WHERE id = $1", [gidT1]);
    await tp.beeindigen(g(A), aA.tabContext, { id: aA.session!.id, createdAt: aA.session!.createdAt });
    await new Promise((r) => setTimeout(r, 300));
    const naEinde = await eo.actieveOntgrendeling(AT.id, A);
    check('technisch met overleeft_activatie: blijft ACTIEF na het einde van de activering (naTechEinde laat hem staan)', !!naEinde && String(naEinde.id) === gidT1);
    const act2 = await tp.activeren(g(A), aA.tabContext, 30, 'test matrix 2', { id: aA.session!.id, createdAt: aA.session!.createdAt });
    const gidT2 = await ontgrendelVoorTest(AT.id, A, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 20, activatieId: act2.id });
    await tp.beeindigen(g(A), aA.tabContext, { id: aA.session!.id, createdAt: aA.session!.createdAt });
    await new Promise((r) => setTimeout(r, 300));
    check("technisch 'tech-einde' (overleeft false): wél ingetrokken bij het einde van de activering", (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [gidT2])).rows[0].reden_einde === 'tech-einde');
    // ---------------------------------------------------------------- 8. caps per versie
    const rijT = (await sys.query('SELECT * FROM app.extensie_ontgrendelingen WHERE id = $1', [gidT1])).rows[0] as eo.Rij;
    await sys.query('UPDATE app.extensie_ontgrendelingen SET caps = $2 WHERE id = $1', [gidT1, [...BROWSER_CAPS]]);
    const rijT7 = (await sys.query('SELECT * FROM app.extensie_ontgrendelingen WHERE id = $1', [gidT1])).rows[0] as eo.Rij;
    eo.bijVerbonden(AT.id, A, 'browser', '0.6.2');
    const gOud = eo.grantVan(rijT7);
    eo.bijVerbonden(AT.id, A, 'browser', '0.7.0');
    const gNieuw = eo.grantVan(rijT7);
    eo.bijVerbroken(AT.id);
    check('capsVoorVersie: extensie 0.6.2 krijgt alleen de oude vijf in de ondertekende grant; 0.7.0 alle zeven',
      JSON.stringify(gOud.caps) === JSON.stringify(BROWSER_CAPS_OUD) && gNieuw.caps.length === 7 && !!rijT && eo.ontgrendelingVan(rijT7).overleeftActivatie === true);
    // script nooit privé, en zonder 0.7.0 nooit
    await matrix.schrijfMatrix(A, matrix.valideerInvoer({ ruimte: 'technisch', rijen: [{ agent: '*', caps: [...BROWSER_CAPS] }] }), 'test');
    eo.bijVerbonden(AT.id, A, 'browser', '0.6.2');
    const vS = await alsClaude(() => eo.controleerBrowserOpdracht(AT.id, A, 'browser.script', { expression: '1+1' }));
    eo.bijVerbroken(AT.id);
    check('browser.script met extensie 0.6.2 → EXTENSIE_SCRIPT (nooit stil naar een extensie die het niet kent)', !vS.ok && /^EXTENSIE_SCRIPT/.test(vS.fout), vS.ok ? '' : vS.fout.slice(0, 100));

    // ---------------------------------------------------------------- 9. aanval
    await matrix.schrijfMatrix(B, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot'] }] }), 'test');
    check('de matrix van B raakt A niet: A houdt zijn eigen kolommen', JSON.stringify(capsVoorAgent(await matrix.leesMatrix(A), 'prive', 'grok')) === '["browser.read","browser.interact"]');
    const vB = await alsClaude(() => eo.controleerBrowserOpdracht(BP.id, A, 'browser.snapshot', {}));
    check('agent van B onder het account van A → EXTENSIE_VERGRENDELD (geen ontgrendeling van A voor die agent)', !vB.ok && /^EXTENSIE_VERGRENDELD/.test(vB.fout));
    if (appRolActief()) {
      const app = getPool('app');
      const cl = await app.connect();
      try {
        await cl.query('BEGIN'); await cl.query("SELECT set_config('app.user_id', $1, true)", [A]);
        const r = await cl.query('SELECT user_id FROM app.extensie_matrix');
        check('RLS: de app-rol als A ziet alleen de rijen van A', r.rows.length > 0 && r.rows.every((x: { user_id: string }) => x.user_id === A));
        const w = await cl.query("INSERT INTO app.extensie_matrix (user_id, ruimte, agent, caps) VALUES ($1, 'prive', 'gpt', '{browser.read}')", [B]).then(() => 'OK', (e) => String((e as Error).message));
        check('RLS: de app-rol kan niet schrijven (alleen de systeemrol)', w !== 'OK', w);
        await cl.query('ROLLBACK');
      } finally { cl.release(); }
    } else check('RLS: app-rol (overgeslagen: geen aparte app-rol in deze omgeving)', true);
  } finally {
    await sys.query('DELETE FROM app.extensie_matrix WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_grants WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await aiDienstOpruimen([A, B]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]).catch(() => undefined);
    for (const id of verplaatst) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl = 'users' AND id = $1", [id]).catch(() => undefined);
    eo._testReset();
    await closePool();
  }
  return einde();
}
