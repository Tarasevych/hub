// GESCHEIDEN GEGEVENSRUIMTES (opdracht van de eigenaar, 20.10.2026): «технічний профіль і профіль користувача мають спільний
// простір — як от пошту, ШІ, хмару та інші сервіси сайту». Deze test houdt de vier beslissingen van de eigenaar vast:
//   1. een EIGEN ruimte in hetzelfde account: één mens, twee laden; de poort zegt uit welke lade gelezen en geschreven wordt;
//   2. ÉÉN KEER vragen: tot er gekozen is, is de technische ruimte leeg en weigert elke dienst MET UITLEG (geen leeg scherm);
//   3. rechten weg → ONMIDDELLIJK bevriezen: alle technische verbindingen ingetrokken, de gegevens heel maar onbereikbaar,
//      en de eigenaar van de server beslist: teruggeven / overnemen / verwijderen. Alle wegen waarlangs rechten kunnen
//      verdwijnen (rol gewijzigd, profiel ingetrokken, account geblokkeerd) komen op datzelfde punt uit;
//   4. samenvoegen is PER DIENST: verbinden vraagt een bevestiging en komt in het logboek, losmaken werkt onmiddellijk.
// Plus de twee veiligheidsregels: bestaande gegevens blijven 'prive' (er gaat geen rij verloren) en een onbekende stand geeft
// de MINSTE rechten — nooit stil de persoonlijke lade.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import {
  DEELBARE_DIENSTEN, EIGEN_LADE_MOGELIJKHEDEN, ROLLEN_MET_EIGEN_LADE, dienstOf, hoortBij, keuzeOf, ladeFilter, ladeVelden,
  ladeVoor, magEigenLade, overgang, sqlLadeWaar, standOf,
} from '../../shared/ruimte-scheiding';
import { TECH_ROLLEN, mogelijkhedenVan } from '../../shared/tech-rollen';
import { effectieveRuimte } from '../../backend/ai-ruimte-poort';
import * as rs from '../../backend/ruimte-scheiding';
import { tabHash } from '../../backend/tech-profiel';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal';
import { NOOIT_ONTHOUDEN, actieVoorPad, onthoudMagVoorPad } from '../../backend/stap-op';
import { checker } from './hulp/nep-google';

const tab = () => randomBytes(24).toString('hex');
async function codeVan(p: Promise<unknown>): Promise<string> { try { await p; return 'OK'; } catch (e) { return e instanceof rs.RuimteFout ? e.code : `ANDERS:${(e as Error).message}`; } }

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-scheiding');

  // ------------------------------------------------------------------------------------ zuivere regels
  check('onbekende stand → «uit» (minste rechten), nooit «gedeeld»', standOf('ja') === 'uit' && standOf(undefined) === 'uit' && standOf('gedeeld') === 'gedeeld');
  check('onbekende keuze → null (dus «nog niet gekozen»)', keuzeOf('x') === null && keuzeOf('samen') === 'samen');
  check('dienstnamen: alias «notities»/«notes» → «bord» (één tabel app.mcp_console_items), onbekend → null',
    dienstOf('notities') === 'bord' && dienstOf('notes') === 'bord' && dienstOf('calendar') === 'agenda' && dienstOf('geheimen') === null);
  check('zeven deelbare diensten, geen dubbelen', new Set(DEELBARE_DIENSTEN).size === 7);

  // ------------------------------------------------------------------------------------ wie krijgt een eigen lade (punt 1)
  check('eigen lade voor ELKE rol die in de technische ruimte werkt — niet alleen de eigenaar',
    ROLLEN_MET_EIGEN_LADE.join(',') === 'tester,ontwikkelaar,beheerder,eigenaar', ROLLEN_MET_EIGEN_LADE.join(','));
  check('alleen-lezen rollen (ondersteuning, auditor) krijgen géén eigen lade: minste rechten',
    !magEigenLade(['ondersteuning']) && !magEigenLade(['auditor']) && !magEigenLade(['ondersteuning', 'auditor']) && !magEigenLade([]) && !magEigenLade(['onbekend']));
  check('een profiel met een werkende én een lezende rol krijgt wél een lade', magEigenLade(['auditor', 'ontwikkelaar']));
  // GEEN NIEUWE RECHTEN: de regel gebruikt uitsluitend mogelijkheden die al bestonden, en voegt er geen enkele toe.
  const alleMogelijk = new Set(TECH_ROLLEN.flatMap((r) => r.mogelijkheden as readonly string[]));
  check('de ladenregel gebruikt alleen BESTAANDE mogelijkheden uit shared/tech-rollen.ts (verzint er geen)',
    EIGEN_LADE_MOGELIJKHEDEN.every((m) => alleMogelijk.has(m)));
  check('geen rol kreeg een nieuwe mogelijkheid: de catalogus is onveranderd (uitrol/terminal/ssh blijven waar ze waren)',
    mogelijkhedenVan(['ontwikkelaar']).join(',') === 'diagnose.lezen,flags.test,logboeken.diensten,terminal.test,testruimtes,uitrol.voorbereiden'
    && mogelijkhedenVan(['tester']).join(',') === 'diagnose.lezen,flags.test,testruimtes'
    && !mogelijkhedenVan(['beheerder']).includes('ssh.host') && !mogelijkhedenVan(['tester']).includes('uitrol.voorbereiden'),
    mogelijkhedenVan(['ontwikkelaar']).join(','));

  // BESTAANDE GEGEVENS BLIJVEN PRIVE: een rij zonder `ruimte` hoort bij de persoonlijke lade en NOOIT bij de technische.
  const oud = { ownerUserId: 'u1' };
  check('rij zonder «ruimte» = persoonlijk (geen enkele bestaande rij verdwijnt of verhuist)',
    hoortBij(oud, { userId: 'u1', ruimte: 'prive' }) && !hoortBij(oud, { userId: 'u1', ruimte: 'technisch' }));
  check('rij van een ANDERE mens hoort nooit bij mijn lade', !hoortBij({ ownerUserId: 'u2' }, { userId: 'u1', ruimte: 'prive' }));
  check('SQL: «prive» rekent NULL mee, «technisch» nooit',
    sqlLadeWaar('ruimte', { userId: 'u1', ruimte: 'prive' }, 1) === "user_id = $1 AND COALESCE(ruimte, 'prive') = 'prive'"
    && sqlLadeWaar('ruimte', { userId: 'u1', ruimte: 'technisch' }, 2) === "user_id = $2 AND ruimte = 'technisch'");
  check('filter/velden: technische lade vraagt expliciet ruimte=technisch, nieuwe rijen krijgen de ruimte mee',
    (ladeFilter({ userId: 'u1', ruimte: 'technisch' }) as { ruimte?: string }).ruimte === 'technisch'
    && (ladeFilter({ userId: 'u1', ruimte: 'prive' }) as { ruimte?: string }).ruimte === undefined
    && ladeVelden({ userId: 'u1', ruimte: 'prive' }).ruimte === 'prive');
  check('kolomnaam uit een vreemde bron wordt niet doorgelaten (SQL-injectie)',
    sqlLadeWaar("ruimte'; DROP TABLE app.audit; --", { userId: 'u1', ruimte: 'technisch' }, 1) === "user_id = $1 AND ruimte = 'technisch'");

  // overgangen
  const zonderKeuze = overgang('uit', 'verbind-gedeeld', { keuzeGemaakt: false });
  const metKeuze = overgang('uit', 'verbind-gedeeld', { keuzeGemaakt: true });
  const los = overgang('gedeeld', 'ontkoppel', { keuzeGemaakt: true });
  check('zonder keuze mag niets verbonden worden', !zonderKeuze.ok && zonderKeuze.fout === 'KEUZE_ONTBREEKT');
  check('verbinden vraagt bevestiging; losmaken niet', metKeuze.ok && metKeuze.stapOp === true && los.ok && los.stapOp === false && los.naar === 'uit');
  check('uit «bevroren» komt niemand met een gewone actie', (() => { const o = overgang('bevroren', 'verbind-eigen', { keuzeGemaakt: true }); return !o.ok && o.fout === 'BEVROREN'; })());
  check('losmaken van iets wat al uit is: geen stille «ok»', (() => { const o = overgang('uit', 'ontkoppel', { keuzeGemaakt: true }); return !o.ok && o.fout === 'AL_ZO'; })());
  check('eigenaarsbesluit alleen op bevroren gegevens', (() => { const o = overgang('eigen', 'teruggeven', {}); return !o.ok && o.fout === 'NIET_BEVROREN'; })());
  check('teruggeven landt NOOIT op «gedeeld» (samenvoegen is altijd een nieuwe bewuste daad)',
    (() => { const o = overgang('bevroren', 'teruggeven', { naStand: 'gedeeld' }); return o.ok && o.naar === 'eigen'; })());
  check('onbekende actie wordt geweigerd', (() => { const o = overgang('uit', 'open-alles', { keuzeGemaakt: true }); return !o.ok && o.fout === 'ACTIE_ONBEKEND'; })());

  // de lade
  const lp = ladeVoor({ userId: 'u1', ruimte: 'prive', dienst: 'mail', stand: 'uit', keuzeGemaakt: false });
  const lg = ladeVoor({ userId: 'u1', ruimte: 'technisch', dienst: 'mail', stand: 'gedeeld', keuzeGemaakt: true });
  const le = ladeVoor({ userId: 'u1', ruimte: 'technisch', dienst: 'mail', stand: 'eigen', keuzeGemaakt: true });
  const lz = ladeVoor({ userId: 'u1', ruimte: 'technisch', dienst: 'mail', stand: 'eigen', keuzeGemaakt: false });
  const lo = ladeVoor({ userId: 'u1', ruimte: 'technisch', dienst: 'mail', stand: 'raar', keuzeGemaakt: true });
  const lb = ladeVoor({ userId: 'u1', ruimte: 'technisch', dienst: 'mail', stand: 'bevroren', keuzeGemaakt: true });
  const lx = ladeVoor({ userId: 'u1', ruimte: 'technisch', dienst: 'geheimen', stand: 'eigen', keuzeGemaakt: true });
  check('persoonlijke ruimte blijft werken, wat de technische stand ook is', lp.ok && lp.lade.ruimte === 'prive' && lp.lade.userId === 'u1');
  check('«gedeeld» leidt naar de PERSOONLIJKE lade, «eigen» naar de technische', lg.ok && lg.lade.ruimte === 'prive' && lg.gedeeld && le.ok && le.lade.ruimte === 'technisch');
  check('zonder keuze: weigering met uitleg in beide talen', !lz.ok && lz.code === 'KEUZE_ONTBREEKT' && !!lz.uitleg.uk && !!lz.uitleg.nl);
  check('onbekende stand → weigering (NOOIT de persoonlijke lade)', !lo.ok && lo.code === 'DIENST_UIT');
  check('bevroren → weigering met uitleg', !lb.ok && lb.code === 'BEVROREN');
  check('onbekende dienst → weigering', !lx.ok && lx.code === 'DIENST_ONBEKEND');
  check('de lade is altijd van de VRAGER zelf (nooit een vreemde userId)', le.ok && le.lade.userId === 'u1');

  // step-up: verbinden staat in de lijst «altijd vragen», losmaken bestaat daar niet
  check('step-up: /ruimte/keuze, /ruimte/dienst en /ruimte/besluit worden nooit onthouden',
    ['ruimte-verbinden', 'ruimte-keuze', 'ruimte-besluit'].every((a) => NOOIT_ONTHOUDEN.includes(a))
    && actieVoorPad('/api/owner/ruimte/dienst') === 'ruimte-verbinden'
    && !onthoudMagVoorPad('/api/owner/ruimte/dienst') && !onthoudMagVoorPad('/api/owner/ruimte/keuze') && !onthoudMagVoorPad('/api/owner/ruimte/besluit'));
  // logboek: zelfde weg als elke andere beheerhandeling
  check('logboek: owner.ruimte.* heeft labels en landt in de categorie «tech»',
    ['owner.ruimte.keuze', 'owner.ruimte.verbonden', 'owner.ruimte.ontkoppeld', 'owner.ruimte.bevroren', 'owner.ruimte.besluit']
      .every((a) => !!ACTIE_LABELS[a] && categorieVan(a) === 'tech'));

  // ------------------------------------------------------------------------------------ server
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'member', status = 'approved') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status }]);
    return { id, email, role, status };
  };
  // Er kan maar één eigenaar zijn (index records_een_eigenaar): bestaande hergebruiken, anders zelf maken.
  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email, data->>'status' AS status FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eig = bestaand
    ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: String(bestaand.status || 'approved') }
    : await mk(`eig-${sfx}@eenheid.test`, 'owner');
  const ander = await mk(`ander-${sfx}@eenheid.test`);
  const tE = tab();
  /** Extra testaccounts (niet-eigenaars met technische toegang); worden in `finally` opgeruimd. */
  const extra: string[] = [];
  const profielId = `tech-${randomBytes(6).toString('hex')}`;
  const hadProfiel = (await pool.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows.length > 0;
  const herstelStatus = eig.status;

  try {
    // Migratie 0082 hier draaien (twee keer: ze moet idempotent zijn), zodat deze test op een database van vóór 0082 werkt.
    for (const naam of ['0082_ruimte_scheiding.sql', '0087_ruimte_besluit_verslag.sql']) {
      const mig = readFileSync(join(process.cwd(), 'migrations', naam), 'utf8');
      await getPool('migratie').query(mig);
      await getPool('migratie').query(mig);
    }
    check('migraties 0082 + 0087 draaien twee keer zonder fout (idempotent), met RLS en de besluitkolommen',
      (await pool.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND tablename IN ('ruimte_keuze','ruimte_dienst_stand') AND rowsecurity`)).rows[0].n === 2
      && (await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='app' AND table_name='ruimte_dienst_stand' AND column_name IN ('besluit','besluit_op','besluit_door','verslag')`)).rows[0].n === 4);

    // Technisch profiel met een lopende activering: zo geeft effectieveRuimte 'technisch' (backend/ai-ruimte-poort.ts).
    if (!hadProfiel) await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],480,'test')`, [eig.id, profielId]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows[0].profiel_id);
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eig.id]);
    const activeer = async () => {
      await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [eig.id]);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
        VALUES ($1, $2, $3, ARRAY['eigenaar'], 'eenheidstest ruimtescheiding', now() + interval '60 minutes')`, [eig.id, pid, tabHash(tE)]);
    };
    await activeer();
    const lade = (dienst: string) => rs.gegevensLade({ userId: eig.id, rol: 'owner', tabContext: tE, dienst });

    // --- beslissing 2: één keer vragen; tot dan is de technische ruimte LEEG, met uitleg
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)', [[eig.id, ander.id]]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)', [[eig.id, ander.id]]);
    const voorKeuze = await lade('mail');
    const allesVoorKeuze = await Promise.all(DEELBARE_DIENSTEN.map((d) => lade(d)));
    check('vóór de keuze: technische ruimte leeg — elke dienst weigert met uitleg, niet met een leeg scherm',
      !voorKeuze.ok && voorKeuze.code === 'KEUZE_ONTBREEKT' && !!voorKeuze.uitleg.uk
      && allesVoorKeuze.every((b) => !b.ok && b.code === 'KEUZE_ONTBREEKT'));
    check('vóór de keuze kan niets verbonden worden', (await codeVan(rs.dienstZetten(eig.id, 'mail', 'verbind-eigen', { stapOpGedaan: true }))) === 'KEUZE_ONTBREEKT');
    check('keuze: onbekende waarde geweigerd', (await codeVan(rs.keuzeZetten(eig.id, 'alles-open', eig.id))) === 'KEUZE_ONGELDIG');

    const na = await rs.keuzeZetten(eig.id, 'per_dienst', eig.id);
    check('keuze «обидва окремо»: elke dienst begint op «uit» en de keuze staat in het logboek',
      na.keuze.keuze === 'per_dienst' && na.standen.length === DEELBARE_DIENSTEN.length && na.standen.every((s) => s.stand === 'uit')
      && (await pool.query(`SELECT 1 FROM app.audit WHERE actor_id=$1 AND action='owner.ruimte.keuze'`, [eig.id])).rows.length > 0);
    check('de keuze is eenmalig: een tweede keer wordt geweigerd', (await codeVan(rs.keuzeZetten(eig.id, 'samen', eig.id))) === 'KEUZE_AL_GEMAAKT');
    const naKeuze = await lade('mail');
    check('na de keuze, vóór het verbinden: dienst «uit» weigert nog steeds met uitleg', !naKeuze.ok && naKeuze.code === 'DIENST_UIT');

    // --- beslissing 4: per dienst, verbinden met bevestiging, losmaken onmiddellijk
    check('verbinden zonder bevestiging: STEP_UP_REQUIRED', (await codeVan(rs.dienstZetten(eig.id, 'mail', 'verbind-gedeeld'))) === 'STEP_UP_REQUIRED');
    await rs.dienstZetten(eig.id, 'mail', 'verbind-gedeeld', { stapOpGedaan: true });
    const mailGedeeld = await lade('mail');
    const cloudNog = await lade('cloud');
    check('pochta під’єднана, хмара — ні: koppelen is per dienst',
      mailGedeeld.ok && mailGedeeld.lade.ruimte === 'prive' && mailGedeeld.gedeeld === true && !cloudNog.ok && cloudNog.code === 'DIENST_UIT');
    check('verbinden staat in het logboek (owner.ruimte.verbonden met van→naar)',
      (await pool.query(`SELECT details FROM app.audit WHERE actor_id=$1 AND action='owner.ruimte.verbonden' ORDER BY id DESC LIMIT 1`, [eig.id])).rows[0]?.details?.wijziging?.naar === 'gedeeld');

    await rs.dienstZetten(eig.id, 'cloud', 'verbind-eigen', { stapOpGedaan: true });
    const cloudEigen = await lade('cloud');
    check('«власні дані» leidt naar de TECHNISCHE lade (en dus nooit naar de persoonlijke rijen)',
      cloudEigen.ok && cloudEigen.lade.ruimte === 'technisch' && cloudEigen.lade.userId === eig.id && cloudEigen.gedeeld === false);
    // «notities» hoort bij «bord»: dezelfde lade, dus dezelfde stand.
    await rs.dienstZetten(eig.id, 'bord', 'verbind-eigen', { stapOpGedaan: true });
    const notities = await lade('notities');
    check('«notities» volgt «bord» (één tabel) en komt in dezelfde lade uit', notities.ok && notities.dienst === 'bord' && notities.lade.ruimte === 'technisch');

    const losGelukt = await rs.dienstZetten(eig.id, 'mail', 'ontkoppel');
    const mailNaLos = await lade('mail');
    check('від’єднання — одразу, без підтвердження, en de dienst is meteen dicht',
      losGelukt.overgang.naar === 'uit' && losGelukt.overgang.stapOp === false && !mailNaLos.ok && mailNaLos.code === 'DIENST_UIT'
      && (await pool.query(`SELECT 1 FROM app.audit WHERE actor_id=$1 AND action='owner.ruimte.ontkoppeld'`, [eig.id])).rows.length > 0);

    // --- beslissing 3: rechten weg → alles ingetrokken en bevroren. Eerst twee verbindingen klaarzetten.
    const tokenTech = randomBytes(16).toString('hex'), tokenPrive = randomBytes(16).toString('hex');
    await pool.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, ruimte) VALUES ($1,'tech','mrt_',$2,'technisch'), ($1,'prive','mrp_',$3,'prive')`, [eig.id, tokenTech, tokenPrive]);
    await rs.dienstZetten(eig.id, 'mail', 'verbind-gedeeld', { stapOpGedaan: true });
    const uitkomst = await rs.rechtenVerloren(eig.id, 'profiel-ingetrokken', 'system');
    const naBevries = await Promise.all(DEELBARE_DIENSTEN.map((d) => lade(d)));
    const techWeg = (await pool.query('SELECT revoked_at FROM app.mcp_console_tokens WHERE token_hash=$1', [tokenTech])).rows[0]?.revoked_at;
    const priveHeel = (await pool.query('SELECT revoked_at FROM app.mcp_console_tokens WHERE token_hash=$1', [tokenPrive])).rows[0]?.revoked_at;
    check('rechten weg: alle TECHNISCHE verbindingen op hetzelfde moment ingetrokken, de persoonlijke blijven heel',
      uitkomst.verbindingen >= 1 && !!techWeg && !priveHeel);
    check('rechten weg: elke dienst bevroren en GEEN ENKELE route geeft nog gegevens',
      uitkomst.bevroren >= 1 && naBevries.every((b) => !b.ok && (b.code === 'BEVROREN' || b.code === 'DIENST_UIT'))
      && naBevries.some((b) => !b.ok && b.code === 'BEVROREN'));
    const bevriesRegel = (await pool.query(`SELECT details, result FROM app.audit WHERE owner_id=$1 AND action='owner.ruimte.bevroren' ORDER BY id DESC LIMIT 1`, [eig.id])).rows[0];
    check('bevriezen staat per dienst in het logboek, met de oorzaak en als «geweigerd»',
      !!bevriesRegel && bevriesRegel.result === 'geweigerd' && bevriesRegel.details?.reden === 'profiel-ingetrokken' && bevriesRegel.details?.wijziging?.naar === 'bevroren',
      JSON.stringify(bevriesRegel?.details || null));
    check('bevroren: de mens zelf kan niets verbinden of losmaken', (await codeVan(rs.dienstZetten(eig.id, 'bord', 'verbind-eigen', { stapOpGedaan: true }))) === 'BEVROREN');
    check('bevriezen is idempotent (tweede keer verandert niets meer)', (await rs.rechtenVerloren(eig.id, 'profiel-ingetrokken', 'system')).bevroren === 0);

    // --- de eigenaar beslist
    check('besluit zonder eigenaar of zonder bevestiging: geweigerd',
      (await codeVan(rs.eigenaarsBesluit({ userId: eig.id, dienst: 'bord', besluit: 'teruggeven', eigenaarId: eig.id, doorEigenaar: false, stapOpGedaan: true }))) === 'OWNER_REQUIRED'
      && (await codeVan(rs.eigenaarsBesluit({ userId: eig.id, dienst: 'bord', besluit: 'teruggeven', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: false }))) === 'STEP_UP_REQUIRED');
    await rs.eigenaarsBesluit({ userId: eig.id, dienst: 'bord', besluit: 'teruggeven', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true });
    await rs.eigenaarsBesluit({ userId: eig.id, dienst: 'cloud', besluit: 'overdragen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true });
    await rs.eigenaarsBesluit({ userId: eig.id, dienst: 'mail', besluit: 'verwijderen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true });
    const bordTerug = await lade('bord'), cloudOver = await lade('cloud'), mailWeg = await lade('mail');
    check('eigenaar kan teruggeven (eigen lade), overnemen (dienst uit) en verwijderen (rij weg, dus «uit»)',
      bordTerug.ok && bordTerug.lade.ruimte === 'technisch' && !cloudOver.ok && cloudOver.code === 'DIENST_UIT' && !mailWeg.ok && mailWeg.code === 'DIENST_UIT'
      && (await pool.query(`SELECT stand, besluit FROM app.ruimte_dienst_stand WHERE user_id=$1 AND dienst=$2`, [eig.id, 'mail'])).rows[0]?.besluit === 'verwijderen');
    check('teruggeven van wat «gedeeld» was geeft een EIGEN lade, nooit opnieuw de persoonlijke gegevens',
      (await rs.standenVan(eig.id)).find((s) => s.dienst === 'bord')?.stand === 'eigen');
    check('besluit over een niet-bevroren dienst: geweigerd',
      (await codeVan(rs.eigenaarsBesluit({ userId: eig.id, dienst: 'bord', besluit: 'teruggeven', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true }))) === 'NIET_BEVROREN');

    // --- elke weg naar rechtenverlies komt op hetzelfde punt uit (ook zonder dat iemand het meldde: de poort controleert het zelf)
    const wegen: Array<[string, () => Promise<void>, () => Promise<void>]> = [
      ['профіль відкликано', async () => { await pool.query('UPDATE app.tech_profielen SET ingetrokken_op = now() WHERE user_id=$1', [eig.id]); },
        async () => { await pool.query('UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1', [eig.id]); }],
      ['роль змінено', async () => { await pool.query(`UPDATE app.records SET data = data || '{"role":"member"}'::jsonb WHERE tbl='users' AND id=$1`, [eig.id]); },
        async () => { await pool.query(`UPDATE app.records SET data = data || '{"role":"owner"}'::jsonb WHERE tbl='users' AND id=$1`, [eig.id]); }],
      ['акаунт заблоковано', async () => { await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked"}'::jsonb WHERE tbl='users' AND id=$1`, [eig.id]); },
        async () => { await pool.query(`UPDATE app.records SET data = data || '{"status":"approved"}'::jsonb WHERE tbl='users' AND id=$1`, [eig.id]); }],
    ];
    for (const [naam, breek, herstel] of wegen) {
      await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='eigen', bevroren_op=NULL, bevroren_oorzaak='' WHERE user_id=$1 AND dienst='agenda'`, [eig.id]);
      const rechtenVoor = await rs.technischeRechten(eig.id);
      await breek();
      const rechtenNa = await rs.technischeRechten(eig.id);
      const besluit = await lade('agenda');
      // De poort geeft NOOIT de technische lade; en wat nog niet bevroren was, is het nu (passieve controle).
      await new Promise((r) => setTimeout(r, 60));
      const stand = (await rs.standenVan(eig.id)).find((s) => s.dienst === 'agenda')?.stand;
      check(`${naam}: rechten weg, geen technische lade meer, en de stand is bevroren`,
        rechtenVoor.ok && !rechtenNa.ok && besluit.ok === true && besluit.lade.ruimte === 'prive' && stand === 'bevroren',
        `rechtenNa=${JSON.stringify(rechtenNa)} lade=${JSON.stringify(besluit)} stand=${stand}`);
      await herstel();
      await activeer();
    }

    // Alle vier de plekken in de code die rechtenverlies melden, staan er ook echt (anders hangt alles aan de passieve controle).
    const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    check('elke weg waar rechten verdwijnen meldt het ook ACTIEF (profiel intrekken, rol/blokkade/verwijdering, verouderde eigenaarsrol)',
      /meldRechtenVerlies\(t\.id, 'profiel-ingetrokken'/.test(lees('backend/tech-profiel.ts'))
      && /bijTechRechtenVerlies\(/.test(lees('backend/ruimte-scheiding.ts'))
      && /ruimteRechtenVerloren\(userId, String\(reden\)\.includes\('delete'\)/.test(lees('backend/index.ts'))
      && /ruimteRechtenVerloren\(next\.id,/.test(lees('backend/index.ts'))
      && /rechtenVerloren\(id, 'rol-weg'/.test(lees('backend/eigenaar-opschonen.ts')));

    // ------------------------------------------------------------------ punt 1: een NIET-EIGENAAR met technische toegang
    // De rolhouder (ontwikkelaar) krijgt een EIGEN gegevenslade, maar geen enkel technisch recht erbij: effectieveRuimte —
    // de poort voor AI-HULPMIDDELEN (releases, serverdeur, server) — blijft voor hem 'prive'.
    const tOnt = tab();
    const ontwikkelaar = await mk(`ontw-${sfx}@eenheid.test`);
    const auditor = await mk(`audit-${sfx}@eenheid.test`);
    extra.push(ontwikkelaar.id, auditor.id);
    const geefProfiel = async (u: { id: string }, rollen: string[], t: string) => {
      await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,$3::text[],240,'test')
        ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [u.id, `tech-${randomBytes(6).toString('hex')}`, rollen]);
      const p = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [u.id])).rows[0].profiel_id);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
        VALUES ($1, $2, $3, $4::text[], 'eenheidstest ruimtescheiding', now() + interval '60 minutes')`, [u.id, p, tabHash(t), rollen]);
    };
    await geefProfiel(ontwikkelaar, ['ontwikkelaar'], tOnt);
    const rechtenOnt = await rs.technischeRechten(ontwikkelaar.id);
    check('ontwikkelaar (geen eigenaar) heeft technische toegang en dus recht op een eigen lade',
      rechtenOnt.ok === true && rechtenOnt.ok && rechtenOnt.ikEigenaar === false && rechtenOnt.rollen.join() === 'ontwikkelaar');
    const ontVoorKeuze = await rs.gegevensLade({ userId: ontwikkelaar.id, tabContext: tOnt, dienst: 'cloud' });
    check('ook voor een niet-eigenaar: zonder keuze is de technische ruimte leeg, met uitleg', !ontVoorKeuze.ok && ontVoorKeuze.code === 'KEUZE_ONTBREEKT');
    await rs.keuzeZetten(ontwikkelaar.id, 'apart', ontwikkelaar.id);
    const ontLade = await rs.gegevensLade({ userId: ontwikkelaar.id, tabContext: tOnt, dienst: 'cloud' });
    check('ontwikkelaar kan zelf kiezen («роздільно») en krijgt zijn EIGEN technische lade',
      ontLade.ok === true && ontLade.ok && ontLade.lade.ruimte === 'technisch' && ontLade.lade.userId === ontwikkelaar.id);
    check('BEWIJS: geen nieuw technisch recht — effectieveRuimte (hulpmiddelen van de AI) blijft voor hem «prive»',
      (await effectieveRuimte(ontwikkelaar.id, undefined, tOnt)) === 'prive' && (await effectieveRuimte(ontwikkelaar.id, 'member', tOnt)) === 'prive');
    check('BEWIJS: besluiten over bevroren gegevens blijven bij de servereigenaar (route + kern)',
      (await codeVan(rs.eigenaarsBesluit({ userId: ontwikkelaar.id, dienst: 'cloud', besluit: 'overdragen', eigenaarId: ontwikkelaar.id, doorEigenaar: false, stapOpGedaan: true }))) === 'OWNER_REQUIRED'
      && /eigenaarOnly: true/.test(readFileSync(join(process.cwd(), 'backend/ruimte-scheiding-routes.ts'), 'utf8')));
    check('BEWIJS: de rollencatalogus zelf is niet aangeraakt (geen woord over ruimtescheiding in shared/tech-rollen.ts)',
      !/ruimte_dienst_stand|ruimte-scheiding|eigen lade/i.test(readFileSync(join(process.cwd(), 'shared/tech-rollen.ts'), 'utf8')));
    // Een AI-verbinding in de PRIVÉruimte komt nooit in de technische lade, ook niet terwijl het profiel loopt.
    const aiPrive = await rs.gegevensLade({ userId: ontwikkelaar.id, aiRuimte: 'prive', dienst: 'cloud' });
    const aiTech = await rs.gegevensLade({ userId: ontwikkelaar.id, aiRuimte: 'technisch', dienst: 'cloud' });
    check('AI: een privéverbinding leest de persoonlijke lade, een technische verbinding de technische — nooit omgekeerd',
      aiPrive.ok === true && aiPrive.ok && aiPrive.lade.ruimte === 'prive' && aiTech.ok === true && aiTech.ok && aiTech.lade.ruimte === 'technisch');

    // auditor: geldig profiel, maar alleen lezen → geen eigen lade (en wat er ooit stond, wordt bevroren)
    const tAud = tab();
    await geefProfiel(auditor, ['auditor'], tAud);
    await pool.query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1,'apart',$1) ON CONFLICT DO NOTHING`, [auditor.id]);
    await pool.query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand) VALUES ($1,'bord','eigen') ON CONFLICT (user_id, dienst) DO UPDATE SET stand='eigen'`, [auditor.id]);
    const audRechten = await rs.technischeRechten(auditor.id);
    const audLade = await rs.gegevensLade({ userId: auditor.id, tabContext: tAud, dienst: 'bord' });
    await new Promise((r) => setTimeout(r, 60));
    check('auditor (alleen lezen): geen eigen lade, persoonlijke lade blijft, en wat er stond is bevroren',
      !audRechten.ok && audRechten.oorzaak === 'rol-weg' && audLade.ok === true && audLade.ok && audLade.lade.ruimte === 'prive'
      && (await rs.standenVan(auditor.id)).find((x) => x.dienst === 'bord')?.stand === 'bevroren');

    // ------------------------------------------------------------------ punt 2: uitvoerders (overdragen / verwijderen)
    rs._wisUitvoerders();
    const gezien: string[] = [];
    rs.registreerLadeUitvoerder({
      dienst: 'bord', naam: 'test-bord',
      async overdragen({ vanUserId, naarUserId, lade }) { gezien.push(`over:${vanUserId}->${naarUserId}:${lade.ruimte}`); return [{ tabel: 'app.mcp_console_items', rijen: 3 }]; },
      async verwijderen({ userId, lade }) { gezien.push(`weg:${userId}:${lade.ruimte}`); return [{ tabel: 'app.mcp_console_items', rijen: 2 }]; },
    });
    rs.registreerLadeUitvoerder({ dienst: 'bord', naam: 'test-bord', async overdragen() { return []; }, async verwijderen() { return []; } });
    check('register: dezelfde naam twee keer geeft één uitvoerder (geen dubbel werk)', rs.ladeUitvoerders('bord').length === 1 && rs.ladeUitvoerders('mail').length === 0);

    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen', besluit='', verslag='{}'::jsonb WHERE user_id=$1 AND dienst='bord'`, [ontwikkelaar.id]);
    rs._wisUitvoerders();
    const zonderUitvoerder = await rs.eigenaarsBesluit({ userId: ontwikkelaar.id, dienst: 'bord', besluit: 'overdragen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true });
    check('geen uitvoerder aangemeld → het besluit staat vast, maar het verslag zegt eerlijk dat er niets verplaatst is',
      zonderUitvoerder.verslag?.volledig === false && zonderUitvoerder.verslag?.uitvoerders === 0 && zonderUitvoerder.verslag?.rijen === 0);

    rs.registreerLadeUitvoerder({
      dienst: 'bord', naam: 'test-bord',
      async overdragen({ vanUserId, naarUserId, lade }) { gezien.push(`over:${vanUserId}->${naarUserId}:${lade.ruimte}`); return [{ tabel: 'app.mcp_console_items', rijen: 3 }]; },
      async verwijderen({ userId, lade }) { gezien.push(`weg:${userId}:${lade.ruimte}`); return [{ tabel: 'app.mcp_console_items', rijen: 2 }]; },
    });
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='bord'`, [ontwikkelaar.id]);
    const over = await rs.eigenaarsBesluit({ userId: ontwikkelaar.id, dienst: 'bord', besluit: 'overdragen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true });
    check('«передати собі»: de uitvoerder krijgt de TECHNISCHE lade en de eigenaar als bestemming, en meldt wat hij deed',
      over.verslag?.volledig === true && over.verslag?.rijen === 3 && over.verslag?.regels[0]?.door === 'test-bord'
      && gezien.includes(`over:${ontwikkelaar.id}->${eig.id}:technisch`), gezien.join(' | '));
    check('het verslag staat in de database en in het logboek',
      (await rs.standenVan(ontwikkelaar.id)).find((x) => x.dienst === 'bord')?.verslag?.rijen === 3
      && (await pool.query(`SELECT details FROM app.audit WHERE owner_id=$1 AND action='owner.ruimte.besluit' ORDER BY id DESC LIMIT 1`, [ontwikkelaar.id])).rows[0]?.details?.verslag?.besluit === 'overdragen');
    check('tweede keer hetzelfde besluit doet NIETS meer (de dienst is niet meer bevroren)',
      (await codeVan(rs.eigenaarsBesluit({ userId: ontwikkelaar.id, dienst: 'bord', besluit: 'overdragen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true }))) === 'NIET_BEVROREN');

    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='bord'`, [ontwikkelaar.id]);
    const weg = await rs.eigenaarsBesluit({ userId: ontwikkelaar.id, dienst: 'bord', besluit: 'verwijderen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true });
    check('«видалити»: dezelfde weg, met een eigen verslag, en de rij blijft als bewijs van het besluit',
      weg.verslag?.besluit === 'verwijderen' && weg.verslag?.rijen === 2 && gezien.includes(`weg:${ontwikkelaar.id}:technisch`)
      && (await rs.standenVan(ontwikkelaar.id)).find((x) => x.dienst === 'bord')?.besluit === 'verwijderen');

    // een uitvoerder die faalt laat de lade BEVROREN (liever niet gelukt dan half open)
    rs._wisUitvoerders();
    rs.registreerLadeUitvoerder({
      dienst: 'bord', naam: 'stuk',
      async overdragen() { throw new Error('tabel op slot'); },
      async verwijderen() { throw new Error('tabel op slot'); },
    });
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='bord'`, [ontwikkelaar.id]);
    const mislukt = await codeVan(rs.eigenaarsBesluit({ userId: ontwikkelaar.id, dienst: 'bord', besluit: 'verwijderen', eigenaarId: eig.id, doorEigenaar: true, stapOpGedaan: true }));
    check('een uitvoerder die faalt: UITVOEREN_MISLUKT, de dienst blijft bevroren en de fout staat in het logboek',
      mislukt === 'UITVOEREN_MISLUKT'
      && (await rs.standenVan(ontwikkelaar.id)).find((x) => x.dienst === 'bord')?.stand === 'bevroren'
      && (await pool.query(`SELECT result FROM app.audit WHERE owner_id=$1 AND action='owner.ruimte.besluit' ORDER BY id DESC LIMIT 1`, [ontwikkelaar.id])).rows[0]?.result === 'failure');
    rs._wisUitvoerders();

    // --- nooit de lade van een ander
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [ander.id]);
    const vreemd = await rs.gegevensLade({ userId: ander.id, rol: 'member', tabContext: tE, dienst: 'mail' });
    check('een gewone gebruiker houdt zijn persoonlijke lade en komt nooit in de technische ruimte',
      vreemd.ok === true && vreemd.lade.userId === ander.id && vreemd.lade.ruimte === 'prive');
    check('de technische stand van de ene mens zegt niets over de andere', (await rs.standenVan(ander.id)).every((s) => s.stand === 'uit'));
    const zonderGebruiker = await rs.gegevensLade({ userId: '', dienst: 'mail' });
    check('zonder gebruiker: weigering (nooit een lade «van niemand»)', !zonderGebruiker.ok);

    // --- databasefout / onbekende stand: minste rechten
    check('onbekende dienst via de poort: weigering met uitleg', (await lade('geheimen')).ok === false);
    check('stand van een dienst zonder rij is «uit»', (await rs.standVan(eig.id, 'github')) === 'uit' || (await rs.standVan(eig.id, 'github')) === 'bevroren');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    const alle = [eig.id, ander.id, ...extra];
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [extra]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [extra]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [extra]).catch(() => undefined);
    await pool.query('DELETE FROM app.mcp_console_tokens WHERE user_id = $1', [eig.id]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [eig.id]).catch(() => undefined);
    if (!hadProfiel) await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eig.id]).catch(() => undefined);
    await pool.query(`UPDATE app.records SET data = data || jsonb_build_object('role','owner','status',$2::text) WHERE tbl='users' AND id=$1`, [eig.id, herstelStatus]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [bestaand ? [ander.id] : [eig.id, ander.id]]).catch(() => undefined);
  }
  return einde();
}
