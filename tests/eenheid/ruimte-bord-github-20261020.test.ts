// GESCHEIDEN GEGEVENSRUIMTES VOOR TWEE DIENSTEN: «bord» (taken, notities, bureaublad, werkruimtes en blokken van de hub) en
// «github» (OAuth, GitHub App, de PAT-weg, het MCP-adres en de stand). Migratie 0086; de kern is 0082 +
// shared/ruimte-scheiding.ts + backend/ruimte-scheiding.ts, en die wordt hier gebruikt, niet nagemaakt.
//
// WAT DEZE TEST VASTHOUDT — precies wat de eigenaar vroeg:
//   1. BESTAANDE GEGEVENS BLIJVEN PERSOONLIJK. Taken, notities, het bureaublad, de blokvoorkeuren, de werkruimtes en de
//      GitHub-koppeling die er vandaag zijn, horen bij de persoonlijke lade — ook al heeft niemand ooit een `ruimte`
//      geschreven. Er verhuist geen rij en er verdwijnt geen rij.
//   2. DE TECHNISCHE RUIMTE BEGINT LEEG. Zonder keuze: weigering met uitleg. Met keuze maar zonder verbinding: weigering met
//      uitleg. Nooit een lege lijst zonder reden, en nooit stil de persoonlijke lade.
//   3. «GEDEELD» LAAT HET PERSOONLIJKE ZIEN — bewust, en dat is het enige geval waarin dat gebeurt.
//   4. BEVRIEZEN SNIJDT ALLES TEGELIJK AF, ook de hulpmiddelen van een AI, en trekt de TECHNISCHE GitHub-token ECHT in
//      (DELETE /applications/{client_id}/token) terwijl de persoonlijke koppeling volledig heel blijft.
//   5. OVERDRAGEN AAN DE EIGENAAR EN VERWIJDEREN WERKEN ECHT (rijen gaan mee of weg), en een tweede aanroep is onschadelijk.
//   6. ER BLIJFT GEEN ONBEWAAKTE WEG OVER: elke lees- en schrijfplek van beide diensten gaat door `gegevensLade`.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { db } from '../../server/platform';
import { alsSysteem } from '../../server/platform/context';
import { hoortBij } from '../../shared/ruimte-scheiding';
import { ruimteFeitenUit, ruimteGeslotenUit, ruimteRegel } from '../../shared/ruimte-weergave';
import * as rs from '../../backend/ruimte-scheiding';
import * as rbg from '../../backend/ruimte-bord-github';
import { meldRechtenVerlies, tabHash } from '../../backend/tech-profiel';
import { koppelingBewaren, koppelingLezen, ontzegel, setKoppelingKluis, verzegel, zegelPad, KOPPELING_TABEL } from '../../backend/github-koppeling-opslag';
import { githubToegang } from '../../backend/github-toegang';
import { SITE_TOOL_BY_NAME } from '../../backend/site-hulpmiddelen';
import { checker } from './hulp/nep-google';

const tab = () => randomBytes(24).toString('hex');
const bureauTabel = (owner: string) => `hub_bureau_v1:${createHash('sha256').update(owner).digest('hex').slice(0, 32)}`;
const indelingTabel = (owner: string) => `hub_layout_preferences_v1:${createHash('sha256').update(owner).digest('hex').slice(0, 32)}`;
const wacht = (ms = 120) => new Promise((r) => setTimeout(r, ms));
async function codeVan(p: Promise<unknown>): Promise<string> { try { await p; return 'OK'; } catch (e) { return e instanceof rs.RuimteFout ? e.code : `ANDERS:${(e as Error).message}`; } }
const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-bord-github');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const echteFetch = globalThis.fetch;

  // Wat de nagebootste GitHub te horen kreeg. Het INTREKKEN moet er echt in staan, anders «heet» een token ingetrokken.
  const bijGithub: Array<{ methode: string; url: string; body: string }> = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? '');
    bijGithub.push({ methode: String(init.method || 'GET'), url, body: typeof init.body === 'string' ? init.body : '' });
    if (/\/applications\/.*\/token$/.test(url)) return new Response('', { status: 204 });
    return new Response(JSON.stringify({ login: 'test' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  // De OAuth-app van de «eigenaar» uit de kluis, zodat het intrekken een client id en secret heeft om mee te praten.
  setKoppelingKluis({
    rijen: async () => [{ keyName: 'gh', purpose: 'github-oauth' }],
    // Een client secret van GitHub is 40 tekens; korter wordt door leesOauthApp (terecht) geweigerd.
    waarde: async () => JSON.stringify({ clientId: 'Iv1.testclient0001', clientSecret: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }),
  });

  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]);
    return { id, email };
  };
  const bestaandeEigenaar = (await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eigenaarId = bestaandeEigenaar ? String(bestaandeEigenaar.id) : (await mk(`eig-bg-${sfx}@eenheid.test`, 'owner')).id;
  const dev = await mk(`dev-bg-${sfx}@eenheid.test`);
  const tD = tab();
  const opruimen: string[] = [dev.id];

  try {
    // ------------------------------------------------------------------ migratie 0086: idempotent, en niets verhuist
    for (const naam of ['0082_ruimte_scheiding.sql', '0086_ruimte_bord_github.sql', '0087_ruimte_besluit_verslag.sql']) {
      const mig = lees(`migrations/${naam}`);
      await getPool('migratie').query(mig);
      await getPool('migratie').query(mig);
    }
    const kolom = (await pool.query(`SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_schema='app' AND table_name='mcp_console_items' AND column_name='ruimte'`)).rows[0];
    check('0086 draait twee keer zonder fout en geeft het bord de kolom «ruimte» met standaard «prive» (NOT NULL)',
      !!kolom && /prive/.test(String(kolom.column_default)) && kolom.is_nullable === 'NO', JSON.stringify(kolom || null));
    check('0086 zet geen enkele CHECK buiten de twee bekende ruimtes',
      (await pool.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname='mcp_console_items_ruimte_chk'`)).rows[0]?.d?.includes("'technisch'") === true);
    check('0086 bevat geen UPDATE of DELETE op bestaande gegevens (geen rij verhuist of verdwijnt)',
      !/\bUPDATE\s+app\.(mcp_console_items|records)\b/i.test(lees('migrations/0086_ruimte_bord_github.sql'))
      && !/\bDELETE\s+FROM\s+app\.(mcp_console_items|records)\b/i.test(lees('migrations/0086_ruimte_bord_github.sql')));

    // ------------------------------------------------------------------ wat er «al was»: alles persoonlijk, zonder vlag
    // De rijen worden met opzet ZONDER `ruimte` gemaakt (bord: de kolomstandaard; records: veld afwezig), precies zoals ze
    // er voor migratie 0086 stonden. Daarna moet elke persoonlijke weg ze zien en geen enkele technische weg.
    const taakId = String((await pool.query(
      `INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author) VALUES ($1,'task','oude taak','', 'backlog','operator') RETURNING id`, [dev.id])).rows[0].id);
    const notitieId = String((await pool.query(
      `INSERT INTO app.mcp_console_items (user_id, kind, title, body, author, tags) VALUES ($1,'note','oude notitie','', 'operator', ARRAY['hub']) RETURNING id`, [dev.id])).rows[0].id);
    await pool.query(`UPDATE app.mcp_console_items SET ruimte = NULL WHERE id::text = ANY($1)`, [[taakId, notitieId]]).catch(() => undefined);
    await alsSysteem(async () => {
      await db.add(bureauTabel(dev.id), [{ ownerUserId: dev.id, indeling: { tegels: [] }, updatedAt: 1 }]);
      await db.add(indelingTabel(dev.id), [{ ownerUserId: dev.id, layouts: {}, updatedAt: 1 }]);
      await db.add('workspaces', [{ ownerUserId: dev.id, name: 'oude werkruimte', createdAt: 1, updatedAt: 1, archivedAt: 0 }]);
      await db.add('workspace_blocks', [{ ownerUserId: dev.id, workspaceId: 'oud', kind: 'focus', title: 'oud blok', position: 0, visible: true, custom: false }]);
    });
    await koppelingBewaren(dev.id, 'oauth', { login: 'prive-login', scopes: ['repo'], tokenZegel: verzegel('gho_PERSOONLIJK', dev.id, 'oauth') });
    // Precies de situatie van vóór 0086: de bewaarde rij heeft helemaal geen veld `ruimte`.
    await pool.query(`UPDATE app.records SET data = data - 'ruimte' WHERE tbl = $1 AND data->>'userId' = $2`, [KOPPELING_TABEL, dev.id]);

    const priveRij = { ownerUserId: dev.id };
    check('rij zonder «ruimte» hoort bij de PERSOONLIJKE lade en nooit bij de technische (model, niet mening)',
      hoortBij(priveRij, { userId: dev.id, ruimte: 'prive' }) && !hoortBij(priveRij, { userId: dev.id, ruimte: 'technisch' }));
    const priveKop = await koppelingLezen(dev.id, 'oauth');
    check('de GitHub-koppeling van vóór 0086 is zonder migratie van gegevens leesbaar als PERSOONLIJKE koppeling',
      !!priveKop && priveKop.login === 'prive-login');
    check('de persoonlijke GitHub-token blijft bruikbaar in de persoonlijke lade',
      (await githubToegang(dev.id))?.token === 'gho_PERSOONLIJK');

    // ------------------------------------------------------------------ technisch profiel met lopende activering
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
      VALUES ($1,$2,ARRAY['ontwikkelaar'],240,'test')
      ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [dev.id, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [dev.id])).rows[0].profiel_id);
    const activeer = async () => {
      await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden='vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [dev.id]);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
        VALUES ($1,$2,$3,ARRAY['ontwikkelaar'],'eenheidstest bord/github', now() + interval '60 minutes')`, [dev.id, pid, tabHash(tD)]);
    };
    await activeer();

    const bord = (t = tD) => rbg.bordPoort({ userId: dev.id, tabContext: t });
    const github = (t = tD) => rbg.githubPoort({ userId: dev.id, tabContext: t });

    // ------------------------------------------------------------------ 2: de technische ruimte begint LEEG, met uitleg
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [dev.id]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [dev.id]);
    const bordVoor = await bord(), ghVoor = await github();
    check('vóór de keuze: bord én GitHub weigeren met een uitleg in BEIDE talen (geen leeg scherm)',
      !bordVoor.ok && bordVoor.code === 'KEUZE_ONTBREEKT' && !!bordVoor.uitleg.uk && !!bordVoor.uitleg.nl
      && !ghVoor.ok && ghVoor.code === 'KEUZE_ONTBREEKT');

    await rs.keuzeZetten(dev.id, 'per_dienst', dev.id);
    const bordUit = await bord(), ghUit = await github();
    check('na de keuze «обидва окремо»: beide diensten staan op «uit» en zeggen dat ook',
      !bordUit.ok && bordUit.code === 'DIENST_UIT' && !ghUit.ok && ghUit.code === 'DIENST_UIT');
    // Het scherm moet die weigering kunnen vertalen zonder zelf iets te verzinnen.
    const geslotenVoorScherm = ruimteGeslotenUit({ error: bordUit.ok ? '' : bordUit.code, dienst: 'bord', dienstNaam: { uk: 'Дошка', nl: 'Bord' }, uitleg: bordUit.ok ? null : bordUit.uitleg });
    check('het scherm leest de weigering met code én uitleg (punt 6: eerlijk, niet leeg)',
      !!geslotenVoorScherm && geslotenVoorScherm.code === 'DIENST_UIT' && !!geslotenVoorScherm.uitleg.uk && !!geslotenVoorScherm.uitleg.nl);

    // ------------------------------------------------------------------ 1 + 3: eigen lade leeg, «gedeeld» laat persoonlijk zien
    await rs.dienstZetten(dev.id, 'bord', 'verbind-eigen', { stapOpGedaan: true });
    const bordEigen = await bord();
    const techItems = (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND ruimte='technisch'`, [dev.id])).rows[0].n;
    const priveItems = (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND COALESCE(ruimte,'prive')='prive'`, [dev.id])).rows[0].n;
    check('«власні дані» voor het bord: de technische lade is LEEG en de twee persoonlijke rijen staan er nog',
      bordEigen.ok && bordEigen.lade.ruimte === 'technisch' && techItems === 0 && priveItems === 2);
    const bureauTech = (await alsSysteem(() => db.list<{ ownerUserId: string; ruimte?: unknown }>(bureauTabel(dev.id), { limit: 8 }))).items;
    check('het bureaublad van de technische lade bestaat niet (de persoonlijke rij blijft en is persoonlijk)',
      bureauTech.filter((r) => hoortBij(r, { userId: dev.id, ruimte: 'technisch' })).length === 0
      && bureauTech.filter((r) => hoortBij(r, { userId: dev.id, ruimte: 'prive' })).length === 1);
    // «notities» is geen eigen dienst: zij volgt het bord (één tabel, etiket 'hub').
    const notitiesVolgt = await rbg.bordPoort({ userId: dev.id, tabContext: tD });
    check('notities volgen het bord: dezelfde lade, dus dezelfde stand (geen tweede waarheid)',
      notitiesVolgt.ok && notitiesVolgt.dienst === 'bord' && notitiesVolgt.lade.ruimte === 'technisch');

    await rs.dienstZetten(dev.id, 'bord', 'ontkoppel');
    await rs.dienstZetten(dev.id, 'bord', 'verbind-gedeeld', { stapOpGedaan: true });
    const bordGedeeld = await bord();
    check('«спільне з особистим» leidt het bord naar de PERSOONLIJKE lade — bewust, en alleen dan',
      bordGedeeld.ok && bordGedeeld.lade.ruimte === 'prive' && bordGedeeld.gedeeld === true);
    // Wat het scherm ervan maakt: «Особистий простір · Спільне з особистим» — eerlijk over de samenvoeging, in beide talen.
    const feitenVoorScherm = ruimteFeitenUit({ ruimte: rbg.ruimteKop(bordGedeeld as never) });
    check('de strook benoemt de lade én de samenvoeging, in beide talen',
      !!feitenVoorScherm && feitenVoorScherm.gedeeld === true
      && /Спільне з особистим/.test(ruimteRegel(feitenVoorScherm, 'uk'))
      && /Gedeeld met persoonlijk/.test(ruimteRegel(feitenVoorScherm, 'nl')),
      feitenVoorScherm ? ruimteRegel(feitenVoorScherm, 'uk') : 'geen');

    // ------------------------------------------------------------------ GitHub: twee tokens, nooit verwisseld
    await rs.dienstZetten(dev.id, 'github', 'verbind-eigen', { stapOpGedaan: true });
    const ghEigen = await github();
    check('GitHub «власні дані»: de technische lade heeft nog GEEN verbinding — en pakt de persoonlijke PAT niet',
      ghEigen.ok && ghEigen.lade.ruimte === 'technisch' && (await githubToegang(dev.id, 'technisch')) === null);
    await koppelingBewaren(dev.id, 'oauth', { login: 'tech-login', scopes: ['repo'], tokenZegel: verzegel('gho_TECHNISCH', dev.id, zegelPad('oauth', 'technisch')) }, 'technisch');
    const techToegang = await githubToegang(dev.id, 'technisch');
    const priveToegang = await githubToegang(dev.id, 'prive');
    check('twee laden, twee koppelingen: elke lade krijgt haar EIGEN token, nooit die van de andere',
      techToegang?.token === 'gho_TECHNISCH' && techToegang?.login === 'tech-login'
      && priveToegang?.token === 'gho_PERSOONLIJK' && priveToegang?.login === 'prive-login');
    const techRij = await koppelingLezen(dev.id, 'oauth', 'technisch');
    // Het zegel hangt aan (mens, weg, RUIMTE). Een rij die iemand van vlag verwisselt levert dus geen bruikbare token op.
    const verkeerdePad = (() => { try { return ontzegel(String(techRij?.tokenZegel || ''), dev.id, 'oauth'); } catch { return ''; } })();
    check('een zegel van de technische lade gaat NIET open als zegel van de persoonlijke (gebonden aan de ruimte)',
      !!techRij && verkeerdePad === '' && ontzegel(techRij.tokenZegel, dev.id, zegelPad('oauth', 'technisch')) === 'gho_TECHNISCH');

    await rs.dienstZetten(dev.id, 'github', 'ontkoppel');
    const ghNaLos = await github();
    check('ontkoppelen van GitHub is onmiddellijk, en de PERSOONLIJKE koppeling blijft heel',
      !ghNaLos.ok && ghNaLos.code === 'DIENST_UIT' && (await githubToegang(dev.id))?.token === 'gho_PERSOONLIJK');
    await rs.dienstZetten(dev.id, 'github', 'verbind-eigen', { stapOpGedaan: true });

    // ------------------------------------------------------------------ 4: bevriezen snijdt alles af en trekt echt in
    bijGithub.length = 0;
    await rs.rechtenVerloren(dev.id, 'profiel-ingetrokken', 'system');
    const bordBevroren = await bord(), ghBevroren = await github();
    check('bevroren: bord én GitHub weigeren langs de poort, met de bevriezingsuitleg',
      !bordBevroren.ok && bordBevroren.code === 'BEVROREN' && !ghBevroren.ok && ghBevroren.code === 'BEVROREN');
    // DE HULPMIDDELEN VAN EEN AI LOPEN LANGS DEZELFDE POORT: ladeVoorTool is de enige weg die zij hebben.
    const toolFout = await (async () => { try { await rbg.ladeVoorTool({ userId: dev.id, aiRuimte: 'technisch' }, 'bord'); return 'OK'; } catch (e) { return (e as Error).message; } })();
    check('hulpmiddelen van een AI zijn op datzelfde moment ook dicht, met de reden in de melding (geen leeg bord)',
      /^RUIMTE_GESLOTEN:(BEVROREN|DIENST_UIT)/.test(toolFout) && /технічн|technische/i.test(toolFout), toolFout);
    await wacht();
    const naBevriezing = await koppelingLezen(dev.id, 'oauth', 'technisch');
    const priveNaBevriezing = await koppelingLezen(dev.id, 'oauth', 'prive');
    const ingetrokkenBijGithub = bijGithub.some((r) => r.methode === 'DELETE' && /\/applications\/.*\/token$/.test(r.url) && r.body.includes('gho_TECHNISCH'));
    check('de TECHNISCHE token is ECHT ingetrokken bij GitHub (DELETE /applications/{client_id}/token met die token)',
      ingetrokkenBijGithub, JSON.stringify(bijGithub.map((r) => `${r.methode} ${r.url}`)));
    check('en de technische rij is weg, terwijl de PERSOONLIJKE koppeling volledig intact blijft',
      naBevriezing === null && priveNaBevriezing?.login === 'prive-login'
      && (await githubToegang(dev.id))?.token === 'gho_PERSOONLIJK');
    check('de persoonlijke token is NOOIT aan GitHub aangeboden om in te trekken',
      !bijGithub.some((r) => r.body.includes('gho_PERSOONLIJK')));
    bijGithub.length = 0;
    await rbg.bevriezingAfdwingen(dev.id, 'test');
    check('bevriezing afdwingen is idempotent: er is niets meer om in te trekken, dus GitHub wordt niet opnieuw gebeld',
      bijGithub.length === 0);
    // De haak van de kern draagt beide luisteraars: de AI-verbindingen (kern) én GitHub (dit bestand).
    await koppelingBewaren(dev.id, 'oauth', { login: 'tech-2', tokenZegel: verzegel('gho_TECH2', dev.id, zegelPad('oauth', 'technisch')) }, 'technisch');
    meldRechtenVerlies(dev.id, 'rol-weg', 'system');
    await wacht(250);
    check('dezelfde haak als de kern (meldRechtenVerlies) trekt de technische GitHub-koppeling ook in',
      (await koppelingLezen(dev.id, 'oauth', 'technisch')) === null && (await koppelingLezen(dev.id, 'oauth', 'prive'))?.login === 'prive-login');

    // ------------------------------------------------------------------ 5: overdragen aan de eigenaar, en verwijderen
    // Eerst echte technische gegevens klaarzetten, zodat er iets te verplaatsen valt.
    await pool.query(`INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author, ruimte)
      VALUES ($1,'task','technische taak','', 'backlog','operator','technisch'), ($1,'note','technische notitie','', NULL,'operator','technisch')`, [dev.id]);
    await alsSysteem(async () => {
      await db.add(bureauTabel(dev.id), [{ ownerUserId: dev.id, ruimte: 'technisch', indeling: { tegels: [] }, updatedAt: 2 }]);
      await db.add('workspaces', [{ ownerUserId: dev.id, ruimte: 'technisch', name: 'technische werkruimte', createdAt: 2, updatedAt: 2, archivedAt: 0 }]);
    });
    await koppelingBewaren(dev.id, 'oauth', { login: 'tech-3', scopes: ['repo'], tokenZegel: verzegel('gho_TECH3', dev.id, zegelPad('oauth', 'technisch')) }, 'technisch');
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen', bevroren_op=now(), bevroren_oorzaak='rol-weg', besluit='', besluit_op=NULL, verslag='{}'::jsonb
      WHERE user_id=$1 AND dienst = ANY($2)`, [dev.id, ['bord', 'github']]);

    bijGithub.length = 0;
    const overBord = await rs.eigenaarsBesluit({ userId: dev.id, dienst: 'bord', besluit: 'overdragen', eigenaarId: eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const bordBijEigenaar = (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND ruimte='technisch'`, [eigenaarId])).rows[0].n;
    const bordBijDev = (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND ruimte='technisch'`, [dev.id])).rows[0].n;
    const devPriveNog = (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND COALESCE(ruimte,'prive')='prive'`, [dev.id])).rows[0].n;
    check('bord overdragen: de bevroren rijen staan nu bij de eigenaar (in ZIJN technische lade), niet meer bij de mens',
      overBord.verslag?.volledig === true && bordBijEigenaar >= 2 && bordBijDev === 0, `eigenaar=${bordBijEigenaar} dev=${bordBijDev}`);
    check('overdragen raakt de PERSOONLIJKE taken en notities van diezelfde mens niet aan', devPriveNog === 2);
    const wsNaOver = (await alsSysteem(() => db.list<{ ownerUserId: string; ruimte?: unknown; name?: string }>('workspaces', { filter: { ruimte: 'technisch' }, limit: 100 }))).items;
    check('de technische werkruimte is meeverhuisd naar de eigenaar',
      wsNaOver.some((w) => w.name === 'technische werkruimte' && w.ownerUserId === eigenaarId));
    const bureauNaOver = (await alsSysteem(() => db.list<{ ownerUserId: string; ruimte?: unknown }>(bureauTabel(dev.id), { limit: 8 }))).items;
    check('het technische bureaublad is bij de mens weg en het persoonlijke staat er nog',
      bureauNaOver.filter((r) => hoortBij(r, { userId: dev.id, ruimte: 'technisch' })).length === 0
      && bureauNaOver.filter((r) => hoortBij(r, { userId: dev.id, ruimte: 'prive' })).length === 1);
    check('een tweede «overdragen» op dezelfde dienst doet niets (de dienst is niet meer bevroren)',
      (await codeVan(rs.eigenaarsBesluit({ userId: dev.id, dienst: 'bord', besluit: 'overdragen', eigenaarId, doorEigenaar: true, stapOpGedaan: true }))) === 'NIET_BEVROREN');

    const overGh = await rs.eigenaarsBesluit({ userId: dev.id, dienst: 'github', besluit: 'overdragen', eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const ghBijEigenaar = await koppelingLezen(eigenaarId, 'oauth', 'technisch');
    check('GitHub overdragen: de token is eerst ECHT ingetrokken en alleen de FEITEN gaan over (geen token mee)',
      bijGithub.some((r) => r.methode === 'DELETE' && r.body.includes('gho_TECH3'))
      && ghBijEigenaar?.login === 'tech-3' && ghBijEigenaar?.tokenZegel === ''
      && (await koppelingLezen(dev.id, 'oauth', 'technisch')) === null,
      JSON.stringify(overGh.verslag?.regels ?? null));
    check('het verslag zegt eerlijk dat de nieuwe beheerder zelf opnieuw moet koppelen',
      (overGh.verslag?.regels ?? []).some((r) => /opnieuw/.test(String(r.opmerking || ''))));

    // verwijderen: nu echt niets meer over, en de persoonlijke kant blijft heel
    await pool.query(`INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author, ruimte)
      VALUES ($1,'task','nog een technische taak','', 'backlog','operator','technisch')`, [dev.id]);
    await koppelingBewaren(dev.id, 'oauth', { login: 'tech-4', tokenZegel: verzegel('gho_TECH4', dev.id, zegelPad('oauth', 'technisch')) }, 'technisch');
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen', besluit='', besluit_op=NULL, verslag='{}'::jsonb
      WHERE user_id=$1 AND dienst = ANY($2)`, [dev.id, ['bord', 'github']]);
    const wegBord = await rs.eigenaarsBesluit({ userId: dev.id, dienst: 'bord', besluit: 'verwijderen', eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const wegGh = await rs.eigenaarsBesluit({ userId: dev.id, dienst: 'github', besluit: 'verwijderen', eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    check('verwijderen wist de technische lade van beide diensten, en laat de persoonlijke volledig staan',
      wegBord.verslag?.volledig === true && wegGh.verslag?.volledig === true
      && (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND ruimte='technisch'`, [dev.id])).rows[0].n === 0
      && (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id=$1 AND COALESCE(ruimte,'prive')='prive'`, [dev.id])).rows[0].n === 2
      && (await koppelingLezen(dev.id, 'oauth', 'technisch')) === null
      && (await koppelingLezen(dev.id, 'oauth', 'prive'))?.login === 'prive-login');
    check('een tweede «verwijderen» is onschadelijk (NIET_BEVROREN, en er verdwijnt niets extra)',
      (await codeVan(rs.eigenaarsBesluit({ userId: dev.id, dienst: 'github', besluit: 'verwijderen', eigenaarId, doorEigenaar: true, stapOpGedaan: true }))) === 'NIET_BEVROREN'
      && (await koppelingLezen(dev.id, 'oauth', 'prive'))?.login === 'prive-login');
    check('beide diensten hebben een echte uitvoerder aangemeld (geen besluit dat alleen een vlag zet)',
      rs.ladeUitvoerders('bord').length >= 1 && rs.ladeUitvoerders('github').length >= 1);

    // ------------------------------------------------------------------ 6: geen onbewaakte weg meer
    const console_ = lees('backend/mcp-console.ts');
    const bordRegels = console_.split('\n').filter((r) => r.includes('app.mcp_console_items'));
    const ongedekt = bordRegels.filter((r) => !/sqlLadeWaar|'prive'|ruimte/.test(r));
    check('elke SQL-regel van het bord noemt de lade (sqlLadeWaar) of schrijft expliciet «prive» — geen onbewaakte weg',
      bordRegels.length >= 6 && ongedekt.length === 0, ongedekt.join(' | ').slice(0, 300));
    check('geen bordfunctie werkt nog op een losse userId: board/addItem/editItem/deleteItem/searchBoard nemen een lade',
      /function board\(lade: Lade\)/.test(console_) && /function addItem\(lade: Lade/.test(console_)
      && /function editItem\(lade: Lade/.test(console_) && /function deleteItem\(lade: Lade/.test(console_)
      && /function searchBoard\(lade: Lade/.test(console_));
    const ghBronnen = ['backend/github-oauth.ts', 'backend/github-app.ts', 'backend/github-toegang.ts', 'backend/ruimte-bord-github.ts'].map(lees).join('\n');
    check('geen GitHub-opslagaanroep zonder lade meer (koppelingLezen/Bewaren/Wissen krijgen altijd een ruimte)',
      !/koppeling(Lezen|Wissen)\([^,)]+,\s*'(oauth|app)'\s*\)/.test(ghBronnen), (/koppeling(Lezen|Wissen)\([^,)]+,\s*'(oauth|app)'\s*\)/.exec(ghBronnen) || [''])[0]);
    check('de PAT blijft persoonlijk: in de technische lade wordt hij bewust overgeslagen, met uitleg in de code',
      /if \(ruimte === 'technisch'\) return null;/.test(lees('backend/github-toegang.ts'))
      && /PAT IS PERSOONLIJK/i.test(lees('backend/github-toegang.ts')));
    const platform = lees('backend/github-platform.ts');
    check('elke GitHub-route haalt eerst de lade op; de bewerkingen krijgen «wie» in plaats van een losse userId',
      /const poort = await githubLade\(\{ userId: auth\.user\.id, tabContext: bodyOf\(ctx\.body\)\.tabContext \}\)/.test(platform)
      && /if \(!poort\.ok\)/.test(platform) && !/await gh\(userId,/.test(platform));
    check('de poort bepaalt de ruimte ZELF (uit het tabblad of uit de AI-verbinding) — een verzoek kan haar niet kiezen',
      /huidigeRuimte\(\)/.test(lees('backend/ruimte-bord-github.ts')) && !/body\.(ruimte|aiRuimte)/.test(platform));

    // De hulpmiddelen van de AI lopen via routes die hierboven bewaakt zijn — dat is de reden dat punt 4 automatisch klopt.
    const bewaakt = (route: string) => /^(POST|PATCH|PUT) \/api\/mcp\/board/.test(route) || /^POST \/api\/owner\/github\//.test(route) || /^POST \/api\/owner\/hub\/(bureau|layouts)\//.test(route);
    const aiTools = ['mcp_board_list', 'mcp_board_add', 'search_board', 'create_task', 'manage_hub_notes', 'get_github_projects',
      'github_status', 'github_list_repos', 'github_list_issues', 'github_create_issue', 'github_comment_issue'];
    const nietBewaakt = aiTools.map((naam) => {
      const t = SITE_TOOL_BY_NAME.get(naam);
      if (!t) return `${naam}: ontbreekt`;
      const voorbeeld = { action: 'list', title: 'x', repo: 'a/b', q: 'xx', number: 1, body: 'x', id: 'abcdefgh' } as Record<string, unknown>;
      try { const r = t.request(voorbeeld); return bewaakt(r.route) ? '' : `${naam}: ${r.route}`; } catch (e) { return `${naam}: ${(e as Error).message}`; }
    }).filter(Boolean);
    check('elk ШІ-hulpmiddel van bord en GitHub gebruikt een route die door de ruimtepoort gaat (punt 4)',
      nietBewaakt.length === 0, nietBewaakt.join(' | '));
    check('ook github_get (het enige hulpmiddel dat de kluis rechtstreeks las) gaat nu door de poort',
      /const poort = await githubPoort\(\{ userId \}\)/.test(lees('backend/connectors-hulpmiddelen.ts'))
      && !/readOwnerVaultPlaintext\(userId, kop\.keyName, kop\.purpose\)/.test(lees('backend/connectors-hulpmiddelen.ts')));

    // bureaublad, blokvoorkeuren, werkruimtes en blokken: ook allemaal door dezelfde poort
    check('bureaublad, blokvoorkeuren, werkruimtes en blokken halen alle vier de lade op vóór lezen en schrijven',
      (lees('backend/hub-bureau.ts').match(/await bordLade\(/g) || []).length === 2
      && (lees('backend/hub-indeling-voorkeuren.ts').match(/await bordLade\(/g) || []).length === 2
      && (lees('backend/index.ts').match(/await bordLade\(/g) || []).length >= 5);
    check('werkruimtes en blokken worden per lade gefilterd (hoortBij), nooit alleen op ownerUserId',
      /listOwnedWorkspaces\(userId: string, ruimte: AiRuimte = 'prive'\)/.test(lees('backend/index.ts'))
      && /workspaceAccess\(user: User, workspaceId: string, ruimte: AiRuimte = 'prive'\)/.test(lees('backend/index.ts')));

    return einde();
  } finally {
    globalThis.fetch = echteFetch;
    setKoppelingKluis(null);
    try {
      for (const id of opruimen) {
        await pool.query('DELETE FROM app.mcp_console_items WHERE user_id = $1', [id]).catch(() => undefined);
        await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1', [id]).catch(() => undefined);
        await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id = $1', [id]).catch(() => undefined);
        await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [id]).catch(() => undefined);
        await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [id]).catch(() => undefined);
        await pool.query(`DELETE FROM app.records WHERE data->>'ownerUserId' = $1 OR data->>'userId' = $1`, [id]).catch(() => undefined);
        await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = $1`, [id]).catch(() => undefined);
      }
      // Wat de eigenaar in dit testje heeft overgenomen, hoort niet in zijn echte lade te blijven staan.
      await pool.query(`DELETE FROM app.mcp_console_items WHERE user_id = $1 AND ruimte = 'technisch'`, [eigenaarId]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE data->>'ruimte' = 'technisch' AND (data->>'ownerUserId' = $1 OR data->>'userId' = $1)`, [eigenaarId]).catch(() => undefined);
      await pool.query(`DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1 AND dienst = ANY($2)`, [eigenaarId, ['bord', 'github']]).catch(() => undefined);
    } catch { /* opruimen mag de uitkomst nooit veranderen */ }
  }
}
