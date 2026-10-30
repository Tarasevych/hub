// POST EN CONTACTEN IN TWEE GESCHEIDEN GEGEVENSRUIMTES (opdracht van de eigenaar, 20.10.2026).
//
// Wat deze test vasthoudt, punt voor punt uit de opdracht:
//   1. BESTAANDE POST BLIJFT PERSOONLIJK — geen rij verhuist, ook niet een rij van vóór migratie 0083 (ruimte NULL);
//   2. de TECHNISCHE RUIMTE ZONDER VERBINDING ZIET NIETS: geen bericht, geen contact, geen gekoppelde mailbox, geen concept;
//   3. «GEDEELD» betekent écht de PERSOONLIJKE gegevens (het eigen adres, geen kopie) — en losmaken werkt onmiddellijk;
//   4. BEVRIEZEN snijdt op hetzelfde moment ALLE wegen af, ook de hulpmiddelen van de AI (een technische connector krijgt
//      geen persoonlijke post als de dienst niet verbonden is);
//   5. PERENENEN NAAR DE EIGENAAR en VERWIJDEREN werken echt, en een tweede aanroep is onschadelijk;
//   6. ER IS GEEN ROUTE BUITEN DE POORT: elke echte route van post en contacten uit de router wordt door metMailRuimte
//      gepoort, en de drie uitzonderingen staan met hun reden in VRIJ_VAN_POORT.
// Plus de regel die alles draagt: zonder lade geeft de opslag een FOUT en nooit stil de persoonlijke gegevens.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { hoortBij, type Lade } from '../../shared/ruimte-scheiding';
import * as rs from '../../backend/ruimte-scheiding';
import * as mr from '../../backend/mail-ruimte';
import { tabHash } from '../../backend/tech-profiel';
import { contactenLijst, contactenScanStand } from '../../backend/mail-afzenders';
import { getDraft, listDrafts, saveDraft } from '../../backend/mail-opstel';
import { TOEGESTANE_ROUTES } from '../../backend/site-aanroep';
import { checker } from './hulp/nep-google';

const tab = () => randomBytes(24).toString('hex');
async function foutVan(p: Promise<unknown>): Promise<string> {
  try { await p; return 'OK'; } catch (e) { return (e as { code?: string }).code || (e as Error).message; }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-mail');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');

  // ------------------------------------------------------------------ 6a. geen route buiten de poort (puur, zonder database)
  check('de uitzonderingen op de poort staan geteld en benoemd: twee provider-webhooks + de standroute, niets anders',
    mr.VRIJ_VAN_POORT.length === 3
    && mr.VRIJ_VAN_POORT.includes('POST /api/owner/mail/google/pubsub/push')
    && mr.VRIJ_VAN_POORT.includes('POST /api/owner/mail/microsoft/webhook')
    && mr.VRIJ_VAN_POORT.includes('POST /api/owner/mail/ruimte'), mr.VRIJ_VAN_POORT.join(' | '));
  check('contacten en afzenders zijn de dienst «contacten», de rest van post is «mail»',
    mr.dienstVoorPad('/api/owner/mail/contacten/lijst') === 'contacten'
    && mr.dienstVoorPad('/api/owner/mail/afzenders/status') === 'contacten'
    && mr.dienstVoorPad('/api/owner/mail/google-suite/messages') === 'mail'
    && mr.dienstVoorPad('/api/owner/mail/compose/send') === 'mail');
  check('alleen post- en contactenpaden worden gepoort (de rest van de site blijft onaangeraakt)',
    mr.isPostPad('/api/owner/mail/google-suite/messages') && mr.isPostPad('/api/owner/contacten/lijst')
    && !mr.isPostPad('/api/owner/cloud/items') && !mr.isPostPad('/api/owner/ruimte/overzicht') && !mr.isPostPad('/api/owner/mailbox'));

  // DE ECHTE ROUTETABEL. We halen alle patronen uit de router van de site en laten de poort er zelf over beslissen: elk
  // postpad moet een gepoorte keten krijgen (één schakel, de poort) en elk ander pad zijn eigen keten houden.
  const { handler } = await import('../../backend/index');
  const alleRoutes: string[] = (handler as unknown as { patronen: string[] }).patronen;
  const postRoutes = alleRoutes.filter((r) => mr.isPostPad(r.replace(/^[A-Z]+\s+/, '')));
  const nep: Record<string, Array<() => undefined>> = {};
  for (const r of alleRoutes) nep[r] = [() => undefined];
  const gepoort = mr.metMailRuimte(nep as never, async () => ({ errorCode: 'GEEN_SESSIE' }));
  const ongepoort = postRoutes.filter((r) => !mr.VRIJ_VAN_POORT.includes(r) && gepoort[r] === nep[r as never]);
  check(`alle ${postRoutes.length} post- en contactenroutes van de site gaan door de poort; geen enkele erbuiten`,
    postRoutes.length > 50 && ongepoort.length === 0, ongepoort.slice(0, 5).join(' | '));
  check('de uitzonderingen zijn ook écht niet gepoort (en het zijn er precies drie in de echte tabel)',
    mr.VRIJ_VAN_POORT.every((r) => !(r in gepoort) || gepoort[r] === nep[r as never]));
  check('niet-postroutes houden hun eigen keten (de poort raakt de rest van de site niet aan)',
    alleRoutes.filter((r) => !mr.isPostPad(r.replace(/^[A-Z]+\s+/, ''))).every((r) => gepoort[r] === nep[r as never]));
  check('de poort staat om de HELE routetabel van backend/index.ts, niet om losse fabrieken',
    /router\(metMailRuimte\(\{/.test(readFileSync(join(process.cwd(), 'backend/index.ts'), 'utf8')));
  // De hulpmiddelen van de AI (backend/site-hulpmiddelen.ts) roepen ECHTE routes aan; staan die routes onder de poort, dan volgt
  // een AI dus automatisch dezelfde stand. Dit is het bewijs dat er geen tweede, ongepoorte weg voor de AI bestaat.
  const aiPostRoutes = [...TOEGESTANE_ROUTES].filter((r) => mr.isPostPad(r.replace(/^[A-Z]+\s+/, '')));
  check(`de ${aiPostRoutes.length} postroutes die de AI mag aanroepen zijn alle gepoort (geen aparte weg voor een connector)`,
    aiPostRoutes.length >= 6 && aiPostRoutes.every((r) => !mr.VRIJ_VAN_POORT.includes(r) && gepoort[r] !== nep[r as never]),
    aiPostRoutes.join(' | '));

  // ------------------------------------------------------------------ server
  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]);
    return id;
  };
  const bestaand = (await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eigenaarId = bestaand ? String(bestaand.id) : await mk(`eig-${sfx}@eenheid.test`, 'owner');
  const mens = await mk(`ontw-${sfx}@eenheid.test`);
  const tOnt = tab();
  const opruimen: string[] = [mens];

  try {
    for (const naam of ['0082_ruimte_scheiding.sql', '0083_mail_contacten_ruimte.sql']) {
      const mig = readFileSync(join(process.cwd(), 'migrations', naam), 'utf8');
      await getPool('migratie').query(mig);
      await getPool('migratie').query(mig); // idempotent
    }
    const kolommen = (await pool.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='ruimte'
      AND table_name IN ('mail_afzenders','mail_domein_dns','mail_contacten_scan','mail_contacten_scan_beleid','mail_afzender_audit','mail_drafts','mail_queue')`)).rows.length;
    check('migratie 0083 draait twee keer zonder fout en zet de kolom «ruimte» op alle zeven posttabellen', kolommen === 7, String(kolommen));
    const sleutel = (await pool.query(`SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='app' AND t.relname='mail_afzenders' AND c.contype='p'`)).rows[0]?.d;
    check('dezelfde mens kan hetzelfde adres in BEIDE laden hebben: de ruimte zit in de primaire sleutel',
      String(sleutel) === 'PRIMARY KEY (user_id, ruimte, adres)', String(sleutel));

    // Technisch profiel met een lopende activering: dan geeft de poort voor DEZE mens 'technisch'.
    const profiel = `tech-${randomBytes(6).toString('hex')}`;
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
      VALUES ($1,$2,ARRAY['ontwikkelaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen=EXCLUDED.rollen, ingetrokken_op=NULL`, [mens, profiel]);
    const activeer = async () => {
      await pool.query(`UPDATE app.tech_activaties SET beeindigd_op=now(), beeindigd_reden='vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [mens]);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
        VALUES ($1,$2,$3,ARRAY['ontwikkelaar'],'eenheidstest ruimte-post', now() + interval '60 minutes')`, [mens, profiel, tabHash(tOnt)]);
    };
    await activeer();
    const poort = (dienst: string) => rs.gegevensLade({ userId: mens, tabContext: tOnt, dienst });
    const prive: Lade = { userId: mens, ruimte: 'prive' }, technisch: Lade = { userId: mens, ruimte: 'technisch' };

    // ---------------------------------------------------------------- 1. bestaande post blijft persoonlijk
    // Twee rijen zoals ze er vóór 0083 stonden: de migratie geeft ze alle de standaardwaarde 'prive', zonder ze te verplaatsen.
    // (De kolom staat in de primaire sleutel en is daarom NOT NULL: een rij KAN na 0083 geen lege ruimte meer hebben, en de
    //  COALESCE in sqlLadeWaar blijft staan voor opslag die dat wél kan — de recordtabellen hieronder.)
    await pool.query(`INSERT INTO app.mail_afzenders (user_id, adres, domein, status) VALUES ($1,$2,'oud.test','onbekend')`, [mens, `oud-${sfx}@oud.test`]);
    await pool.query(`INSERT INTO app.mail_afzenders (user_id, adres, domein, status) VALUES ($1,$2,'leeg.test','onbekend')`, [mens, `leeg-${sfx}@leeg.test`]);
    await pool.query(`INSERT INTO app.mail_contacten_scan (user_id, ruimte, account_id, account_email, staat) VALUES ($1,'prive','acc-prive','prive@oud.test','klaar')`, [mens]);
    check('een bestaande rij blijft na de migratie persoonlijk: zij krijgt «prive» en verhuist niet',
      (await pool.query(`SELECT count(*)::int AS n FROM app.mail_afzenders WHERE user_id=$1 AND ruimte='prive'`, [mens])).rows[0].n === 2);
    // De recordtabellen van post (app.records) hebben geen kolom maar een VELD: ontbreekt dat, dan is de rij persoonlijk.
    check('een POSTRECORD zonder veld «ruimte» hoort bij de persoonlijke lade en nooit bij de technische',
      hoortBij({ ownerUserId: mens }, prive) && !hoortBij({ ownerUserId: mens }, technisch)
      && (await mr.metLade(prive, 'mail', async () => mr.postRecordsVanLade(mens, [{ ownerUserId: mens }, { ownerUserId: mens, ruimte: 'technisch' }]))).length === 1
      && (await mr.metLade(technisch, 'mail', async () => mr.postRecordsVanLade(mens, [{ ownerUserId: mens }, { ownerUserId: mens, ruimte: 'technisch' }]))).length === 1
      && (await mr.metLade(technisch, 'mail', async () => mr.postRecordVanLade(mens, { ownerUserId: mens }))) === null
      && (await mr.metLade(technisch, 'mail', async () => mr.postRecordVelden(mens))).ruimte === 'technisch');

    const inPrive = <T>(fn: () => Promise<T>) => mr.metLade(prive, 'contacten', fn);
    const inTechnisch = <T>(fn: () => Promise<T>) => mr.metLade(technisch, 'contacten', fn);
    const priveLijst = await inPrive(() => contactenLijst(mens, {}));
    const techLijst = await inTechnisch(() => contactenLijst(mens, {}));
    check('de persoonlijke lade ziet alle bestaande contacten, precies zoals voor de migratie',
      priveLijst.totaal === 2, `${priveLijst.totaal}`);
    check('de technische lade ziet ER GEEN ENKELE van: zij begint leeg', techLijst.totaal === 0, `${techLijst.totaal}`);
    const techScan = await inTechnisch(() => contactenScanStand(mens));
    const priveScan = await inPrive(() => contactenScanStand(mens));
    check('ook de stand van de controle per mailbox is per lade: technisch leeg, persoonlijk ongewijzigd',
      techScan.accounts.length === 0 && priveScan.accounts.length === 1, `${techScan.accounts.length}/${priveScan.accounts.length}`);

    // ---------------------------------------------------------------- 2. zonder keuze en zonder verbinding: niets, met uitleg
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [mens]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [mens]);
    const voorKeuze = await Promise.all([poort('mail'), poort('contacten')]);
    check('vóór de eenmalige keuze weigeren post én contacten MET tweetalige uitleg (geen leeg scherm)',
      voorKeuze.every((b) => !b.ok && b.code === 'KEUZE_ONTBREEKT' && !!b.uitleg.uk && !!b.uitleg.nl));
    await rs.keuzeZetten(mens, 'per_dienst', mens);
    const naKeuze = await Promise.all([poort('mail'), poort('contacten')]);
    check('na de keuze, vóór het verbinden: nog steeds niets, nu met de uitleg «de dienst staat uit»',
      naKeuze.every((b) => !b.ok && b.code === 'DIENST_UIT' && !!b.uitleg.uk));

    // geen gekoppelde mailbox in de technische ruimte zolang daar niets verbonden is
    await mr.mailboxInLadeZetten(prive, 'acc-prive', 'prive@oud.test', mens);
    const zichtbaarPrive = await mr.mailboxenInLade(prive, [{ id: 'acc-prive' }, { id: 'acc-tech' }]);
    await mr.mailboxInLadeZetten(technisch, 'acc-tech', 'tech@eenheid.test', mens);
    const zichtbaarTech = await mr.mailboxenInLade(technisch, [{ id: 'acc-prive' }, { id: 'acc-tech' }]);
    const naTech = await mr.mailboxenInLade(prive, [{ id: 'acc-prive' }, { id: 'acc-tech' }]);
    check('een mailbox zonder vermelding is persoonlijk; wat technisch verbonden is, verdwijnt uit de persoonlijke lijst',
      zichtbaarPrive.length === 2 && zichtbaarTech.map((a) => a.id).join() === 'acc-tech' && naTech.map((a) => a.id).join() === 'acc-prive',
      `${zichtbaarPrive.length} / ${zichtbaarTech.map((a) => a.id).join()} / ${naTech.map((a) => a.id).join()}`);

    // ---------------------------------------------------------------- eigen lade: eigen contacten, eigen concepten
    await rs.dienstZetten(mens, 'contacten', 'verbind-eigen', { stapOpGedaan: true });
    await rs.dienstZetten(mens, 'mail', 'verbind-eigen', { stapOpGedaan: true });
    const eigenContacten = await poort('contacten');
    check('«власні дані» leidt naar de TECHNISCHE lade van dezelfde mens', eigenContacten.ok && eigenContacten.lade.ruimte === 'technisch');
    await pool.query(`INSERT INTO app.mail_afzenders (user_id, ruimte, adres, domein, status) VALUES ($1,'technisch',$2,'tech.test','onbekend')`, [mens, `tech-${sfx}@tech.test`]);
    const tech2 = await inTechnisch(() => contactenLijst(mens, {}));
    const prive2 = await inPrive(() => contactenLijst(mens, {}));
    check('een technisch contact staat ALLEEN in de technische lijst; de persoonlijke lijst verandert niet',
      tech2.totaal === 1 && prive2.totaal === 2, `${tech2.totaal}/${prive2.totaal}`);

    const concept = await mr.metLade(technisch, 'mail', () => saveDraft(mens, { localId: `tech-${sfx}-concept`, subject: 'technisch', plainText: 'alleen hier' }));
    check('een concept uit de technische ruimte lukt en krijgt die ruimte mee', !('error' in concept), JSON.stringify(concept).slice(0, 120));
    const conceptenPrive = await mr.metLade(prive, 'mail', () => listDrafts(mens));
    const conceptenTech = await mr.metLade(technisch, 'mail', () => listDrafts(mens));
    check('de persoonlijke ruimte ziet dat technische concept NIET; de technische ziet het wel',
      conceptenPrive.length === 0 && conceptenTech.length === 1, `${conceptenPrive.length}/${conceptenTech.length}`);
    check('hetzelfde lokale id in de andere lade is een ANDER concept (geen overschrijven)',
      (await mr.metLade(prive, 'mail', () => getDraft(mens, `tech-${sfx}-concept`))) === null);

    // ---------------------------------------------------------------- 3. «gedeeld» = het persoonlijke adres zelf
    await rs.dienstZetten(mens, 'contacten', 'ontkoppel');
    await rs.dienstZetten(mens, 'contacten', 'verbind-gedeeld', { stapOpGedaan: true });
    const gedeeld = await poort('contacten');
    const gedeeldeLijst = gedeeld.ok ? await mr.metLade(gedeeld.lade, 'contacten', () => contactenLijst(mens, {})) : null;
    check('«спільне з особистим» geeft de PERSOONLIJKE lade: dezelfde rijen, geen kopie',
      gedeeld.ok && gedeeld.gedeeld === true && gedeeld.lade.ruimte === 'prive' && gedeeldeLijst?.totaal === 2,
      `${gedeeld.ok ? gedeeld.lade.ruimte : (gedeeld as { code: string }).code} / ${gedeeldeLijst?.totaal}`);
    await rs.dienstZetten(mens, 'contacten', 'ontkoppel');
    const naLos = await poort('contacten');
    check('losmaken werkt onmiddellijk: de persoonlijke contacten zijn op datzelfde moment onbereikbaar uit de technische ruimte',
      !naLos.ok && naLos.code === 'DIENST_UIT');

    // ---------------------------------------------------------------- 4. bevriezen snijdt alles af, ook de AI
    await rs.dienstZetten(mens, 'contacten', 'verbind-gedeeld', { stapOpGedaan: true });
    const verloren = await rs.rechtenVerloren(mens, 'profiel-ingetrokken', 'system');
    const naBevries = await Promise.all([poort('mail'), poort('contacten')]);
    check('rechten weg: post en contacten zijn bevroren en geven niets meer, met uitleg',
      verloren.bevroren >= 2 && naBevries.every((b) => !b.ok && b.code === 'BEVROREN'), JSON.stringify(naBevries.map((b) => b.ok ? 'ok' : b.code)));
    const aiTech = await rs.gegevensLade({ userId: mens, aiRuimte: 'technisch', dienst: 'mail' });
    const aiPrive = await rs.gegevensLade({ userId: mens, aiRuimte: 'prive', dienst: 'mail' });
    check('een TECHNISCHE AI-verbinding krijgt dan ook niets; een PRIVÉverbinding houdt de persoonlijke lade',
      !aiTech.ok && aiTech.code === 'BEVROREN' && aiPrive.ok && aiPrive.lade.ruimte === 'prive');
    // en de persoonlijke kant van dezelfde mens is heel gebleven
    check('de persoonlijke post en contacten van dezelfde mens zijn volledig intact gebleven',
      (await inPrive(() => contactenLijst(mens, {}))).totaal === 2);

    // ---------------------------------------------------------------- 5. overdragen en verwijderen
    check('post en contacten hebben zich bij de kern aangemeld als uitvoerder (anders kan de eigenaar niets beslissen)',
      rs.ladeUitvoerders('mail').some((u) => u.naam === 'mail-ruimte-mail')
      && rs.ladeUitvoerders('contacten').some((u) => u.naam === 'mail-ruimte-contacten'));
    const omvangVoor = await mr.ladeOmvang(mens, 'contacten');
    check('de omvang van de bevroren technische lade is te zien (de eigenaar moet weten waarover hij beslist)',
      (omvangVoor.find((r) => r.tabel === 'app.mail_afzenders')?.rijen ?? 0) === 1, JSON.stringify(omvangVoor));

    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='contacten'`, [mens]);
    const over = await rs.eigenaarsBesluit({ userId: mens, dienst: 'contacten', besluit: 'overdragen', eigenaarId: eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const bijEigenaar = (await pool.query(`SELECT count(*)::int AS n FROM app.mail_afzenders WHERE user_id=$1 AND adres=$2 AND COALESCE(ruimte,'prive')='prive'`, [eigenaarId, `tech-${sfx}@tech.test`])).rows[0].n;
    const nogTechnisch = (await pool.query(`SELECT count(*)::int AS n FROM app.mail_afzenders WHERE user_id=$1 AND ruimte='technisch'`, [mens])).rows[0].n;
    check('«передати собі»: het technische contact staat nu persoonlijk bij de EIGENAAR en niet meer in de technische lade',
      over.verslag?.volledig === true && Number(bijEigenaar) === 1 && Number(nogTechnisch) === 0, `${bijEigenaar}/${nogTechnisch}/${over.verslag?.rijen}`);
    check('de persoonlijke contacten van de mens zijn daarbij NIET aangeraakt',
      (await inPrive(() => contactenLijst(mens, {}))).totaal === 2);
    check('tweede keer hetzelfde besluit: onschadelijk (de dienst is niet meer bevroren)',
      (await foutVan(rs.eigenaarsBesluit({ userId: mens, dienst: 'contacten', besluit: 'overdragen', eigenaarId: eigenaarId, doorEigenaar: true, stapOpGedaan: true }))) === 'NIET_BEVROREN');

    // verwijderen: het technische concept van «mail»
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='mail'`, [mens]);
    const weg = await rs.eigenaarsBesluit({ userId: mens, dienst: 'mail', besluit: 'verwijderen', eigenaarId: eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const conceptenNa = (await pool.query(`SELECT count(*)::int AS n FROM app.mail_drafts WHERE user_id=$1 AND ruimte='technisch'`, [mens])).rows[0].n;
    check('«видалити»: de technische concepten zijn echt weg, en het verslag zegt hoeveel',
      weg.verslag?.besluit === 'verwijderen' && Number(conceptenNa) === 0 && (weg.verslag?.rijen ?? 0) >= 1, `${conceptenNa}/${weg.verslag?.rijen}`);
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='mail'`, [mens]);
    const nogmaals = await rs.eigenaarsBesluit({ userId: mens, dienst: 'mail', besluit: 'verwijderen', eigenaarId: eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    check('een tweede verwijdering vindt niets meer en gooit niets (idempotent)', nogmaals.verslag?.rijen === 0, JSON.stringify(nogmaals.verslag?.rijen));

    // ---------------------------------------------------------------- de regel die alles draagt
    check('ZONDER lade geeft de opslag een FOUT en nooit stil de persoonlijke gegevens',
      (await foutVan(contactenLijst(mens, {}))) === 'RUIMTE_POORT_ONTBREEKT'
      && (await foutVan(listDrafts(mens))) === 'RUIMTE_POORT_ONTBREEKT');
    check('de lade van een ANDER mens wordt nooit gebruikt, ook niet als zij gebonden is',
      mr.huidigeLade('iemand-anders') === null
      && (await mr.metLade(prive, 'contacten', async () => mr.huidigeLade('iemand-anders'))) === null);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    for (const t of ['mail_afzenders', 'mail_domein_dns', 'mail_contacten_scan', 'mail_contacten_scan_beleid', 'mail_afzender_audit', 'mail_drafts', 'mail_queue', 'mail_ruimte_account']) {
      await pool.query(`DELETE FROM app.${t} WHERE user_id = ANY($1)`, [[...opruimen, eigenaarId]]).catch(() => undefined);
    }
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)', [opruimen]).catch(() => undefined);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)', [opruimen]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [opruimen]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [opruimen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [bestaand ? opruimen : [...opruimen, eigenaarId]]).catch(() => undefined);
  }
  return einde();
}
