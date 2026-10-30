// DE HMARA EN DE AGENDA IN TWEE GESCHEIDEN LADEN (opdracht van de eigenaar, 20.10.2026: «технічний профіль і профіль
// користувача мають спільний простір — як от пошту, ШІ, хмару та інші сервіси сайту»; migraties 0082 + 0084).
//
// Deze test houdt precies vast wat de eigenaar vroeg, en niets anders:
//   1. BESTAANDE GEGEVENS BLIJVEN PERSOONLIJK. Een werkruimte, een bestand, een afspraak en een abonnement die er nu
//      staan hebben geen `ruimte` en horen dus bij de persoonlijke lade. Er verhuist niets en er verdwijnt niets.
//   2. DE TECHNISCHE RUIMTE BEGINT LEEG. Zonder dat de mens de hmara of de agenda daar bewust verbond, is er geen
//      bestand, geen werkruimte, geen agenda, geen koppeling en geen abonnement te zien — en zegt elke weg WAAROM.
//   3. DE PADEN IN DE OPSLAG KRUISEN ELKAAR NIET. Twee bomen (`cloud/<hash>` en `cloud-technisch/<hash>`), zodat de
//      bestanden fysiek niet door elkaar liggen en het wissen van de ene boom de andere niet kan raken.
//   4. «СПІЛЬНО» LAAT WÉL HET PERSOONLIJKE ZIEN. Dat is een bewuste samenvoeging, dus de technische ruimte leest dan
//      precies dezelfde bestanden, dezelfde Google-koppeling en dezelfde afspraken — zonder kopie.
//   5. BEVRIEZEN SNIJDT ALLES IN ÉÉN KEER AF: elke route, elk hulpmiddel van de AI, én de planner in de achtergrond.
//      Wat van de technische ruimte was (de OAuth-grant, de Drive-rekening, de externe abonnementen) wordt echt
//      ingetrokken; het persoonlijke blijft volledig heel.
//   6. HET BESLUIT VAN DE SERVEREIGENAAR DOET ECHT IETS: overdragen verplaatst de rijen én de bestanden, verwijderen
//      wist ze (ook in de opslag), en een tweede aanroep is onschadelijk.
//   7. GEEN ONBEWAAKTE ROUTE. Niet «we hebben goed gekeken», maar: de test bouwt ALLE routeverzamelingen van de hmara
//      en de agenda, roept ze met een bevroren lade aan, en eist van elke route een weigering met uitleg.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-cloud-agenda');
  // De opslag MOET in een eigen map staan: deze test schrijft en wist er echte bestanden in.
  const uploads = await mkdtemp(join(tmpdir(), 'mr-uploads-'));
  process.env.UPLOADS_DIR = uploads;

  const { getPool } = await import('../../server/platform/pg');
  const { db, storage } = await import('../../server/platform');
  const { padHoortBijAnder } = await import('../../server/platform/opslag');
  const { hoortBij, ladeVelden } = await import('../../shared/ruimte-scheiding');
  const rs = await import('../../backend/ruimte-scheiding');
  const rca = await import('../../backend/ruimte-cloud-agenda');
  const { tabHash } = await import('../../backend/tech-profiel');
  const { createCloudRoutes } = await import('../../backend/cloud-platform');
  const { createAgendaRoutes } = await import('../../backend/agenda-routes');
  const { createGoogleSuiteBrowserRoutes } = await import('../../backend/google-suite-browser');
  const { createGoogleSuiteCalendarPhotosRoutes } = await import('../../backend/google-suite-agenda-fotos');
  const { icsLijst, icsCronRonde } = await import('../../backend/agenda-ics');
  const { caldavLijst, caldavCronRonde } = await import('../../backend/agenda-caldav');
  const { agendaItems, koppelClaim, koppelLees, externeSpiegelVervang } = await import('../../backend/agenda-spiegel');
  const siteTools = await import('../../backend/site-hulpmiddelen');

  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const tE = randomBytes(24).toString('hex');
  const prive = (userId: string) => ({ userId, ruimte: 'prive' as const });
  const tech = (userId: string) => ({ userId, ruimte: 'technisch' as const });

  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]);
    return id;
  };
  const bestaand = (await pool.query(`SELECT id, data->>'status' AS status FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eigId = bestaand ? String(bestaand.id) : await mk(`eig-${sfx}@eenheid.test`, 'owner');
  const eigStatus = bestaand ? String(bestaand.status || 'approved') : 'approved';
  const opruimen: string[] = bestaand ? [] : [eigId];
  const hadProfiel = (await pool.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eigId])).rows.length > 0;
  /** Elke bewaakte route krijgt dit lichaam: de tabcontext hoort erbij, net als bij een echt verzoek van de pagina. */
  const lichaam = { service: 'cloud', tabContext: tE, sourceOrigin: 'https://cloud.tarasevych.com' };
  const nepAuth = async () => ({ service: 'cloud', user: { id: eigId, email: `eig-${sfx}@eenheid.test`, name: 'Eig', status: 'approved', role: 'owner' } });
  type Resp = { statusCode: number; body: string };
  const routesVanAlles = () => ({
    ...createCloudRoutes(nepAuth as never),
    ...createAgendaRoutes(nepAuth as never),
    ...createGoogleSuiteBrowserRoutes(nepAuth as never),
    ...createGoogleSuiteCalendarPhotosRoutes(nepAuth as never),
  }) as Record<string, Array<(ctx: unknown) => Promise<Resp>>>;
  const roep = async (routes: Record<string, Array<(ctx: unknown) => Promise<Resp>>>, route: string, extra: Record<string, unknown> = {}) => {
    const res = await routes[route][0]({ event: {}, body: { ...lichaam, ...extra }, params: { id: 'onbekend' } });
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(res.body || '{}'); } catch { data = {}; }
    return { status: res.statusCode, data };
  };

  try {
    // ------------------------------------------------------------------ migratie 0084 (twee keer: idempotent)
    for (const naam of ['0082_ruimte_scheiding.sql', '0087_ruimte_besluit_verslag.sql', '0084_ruimte_cloud_agenda.sql']) {
      const mig = readFileSync(join(process.cwd(), 'migrations', naam), 'utf8');
      await getPool('migratie').query(mig);
      await getPool('migratie').query(mig);
    }
    check('migratie 0084 draait twee keer zonder fout en zet `ruimte` op alle drie de agendatabellen, met DEFAULT «prive»',
      (await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns
         WHERE table_schema='app' AND column_name='ruimte' AND column_default = '''prive''::text' AND is_nullable='NO'
           AND table_name IN ('agenda_koppeling','agenda_abonnement','agenda_externe_gebeurtenis')`)).rows[0].n === 3);
    check('de unieke sleutel van een abonnement is nu PER LADE — anders kan de technische ruimte hetzelfde rooster nooit volgen',
      (await pool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='app' AND indexname='agenda_abonnement_adres_ruimte_idx'`)).rows[0]?.indexdef?.includes('ruimte') === true
      && (await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='agenda_abonnement_adres_idx'`)).rows.length === 0);
    check('de CHECK laat precies twee waarden toe (een derde «ruimte» bestaat niet)',
      await pool.query(`INSERT INTO app.agenda_abonnement (user_id, ruimte, id, bron, adres) VALUES ($1,'overal',$2,'ics','https://x.invalid/a.ics')`,
        [eigId, randomUUID()]).then(() => false).catch(() => true));

    // ------------------------------------------------------------------ punt 3: de twee bomen in de opslag
    const voorP = rca.cloudVoorvoegsel(prive(eigId)), voorT = rca.cloudVoorvoegsel(tech(eigId));
    const hashKort = createHash('sha256').update(eigId).digest('hex').slice(0, 18);
    check('twee bomen in de opslag: «cloud/<hash>» en «cloud-technisch/<hash>» — nooit hetzelfde pad',
      voorP === `cloud/${hashKort}` && voorT === `cloud-technisch/${hashKort}` && voorP !== voorT);
    check('het pad van de PERSOONLIJKE lade is onveranderd, dus geen enkel bestaand bestand verhuist', voorP === `cloud/${hashKort}`);
    check('een pad van de ene lade hoort NOOIT bij de andere (padInLade), en een pad met een map erin ook niet',
      rca.padInLade(`${voorT}/a.txt`, tech(eigId)) && !rca.padInLade(`${voorT}/a.txt`, prive(eigId))
      && !rca.padInLade(`${voorP}/a.txt`, tech(eigId)) && !rca.padInLade(`${voorT}/map/a.txt`, tech(eigId))
      && !rca.padInLade('', tech(eigId)) && !rca.padInLade(`cloud-technisch/${'0'.repeat(18)}/a.txt`, tech(eigId)));
    check('de opslag schrijft BEIDE bomen aan DEZELFDE mens toe (en aan niemand anders): de eigenaarscontrole blijft werken',
      !padHoortBijAnder(`${voorT}/a.txt`, eigId) && !padHoortBijAnder(`${voorP}/a.txt`, eigId)
      && padHoortBijAnder(`${voorT}/a.txt`, 'iemand-anders') && padHoortBijAnder(`${voorP}/a.txt`, 'iemand-anders'));

    // ------------------------------------------------------------------ punt 1: wat er nu staat is PERSOONLIJK
    // Rijen zoals ze vóór 0084 werden geschreven: géén `ruimte`-veld, géén `ruimte`-kolom.
    const [oudeWerkruimte] = await db.add('cloud_workspaces_v1', [{ ownerUserId: eigId, title: `oud-${sfx}`, normalizedTitle: `oud-${sfx}`, description: '', template: 'project', sections: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now(), archivedAt: 0 }]);
    const oudPad = `${voorP}/${Date.now()}-oud.txt`;
    await storage.write([{ path: oudPad, content: 'persoonlijk', contentType: 'text/plain', ownerId: eigId }]);
    const [oudItem] = await db.add('cloud_items_v1', [{ ownerUserId: eigId, workspaceId: oudeWerkruimte, kind: 'file', title: 'oud bestand', originalName: 'oud.txt', description: '', textContent: '', sourceUrl: '', mimeType: 'text/plain', sizeBytes: 11, storagePath: oudPad, tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0 }]);
    const oudAbo = randomUUID();
    await pool.query(`INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres) VALUES ($1,$2,'ics','oud','https://rooster.invalid/oud.ics')`, [eigId, oudAbo]);
    await pool.query(`INSERT INTO app.agenda_externe_gebeurtenis (user_id, abonnement_id, agenda_url, uid, titel, begin_waarde) VALUES ($1,$2,'','uid-oud','Oude afspraak','2026-10-21T09:00:00Z')`, [eigId, oudAbo]);
    check('een rij van vóór 0084 heeft geen «ruimte» en hoort dus bij de PERSOONLIJKE lade, nooit bij de technische',
      hoortBij({ ownerUserId: eigId }, prive(eigId)) && !hoortBij({ ownerUserId: eigId }, tech(eigId))
      && (await pool.query(`SELECT ruimte FROM app.agenda_abonnement WHERE user_id=$1 AND id=$2`, [eigId, oudAbo])).rows[0].ruimte === 'prive');

    // ------------------------------------------------------------------ technisch profiel met een lopende activering
    const profielId = `tech-${randomBytes(6).toString('hex')}`;
    if (!hadProfiel) await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],480,'test')`, [eigId, profielId]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [eigId])).rows[0].profiel_id);
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eigId]);
    const activeer = async () => {
      await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden='vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [eigId]);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
        VALUES ($1,$2,$3,ARRAY['eigenaar'],'eenheidstest hmara en agenda', now() + interval '60 minutes')`, [eigId, pid, tabHash(tE)]);
    };
    await activeer();
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [eigId]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [eigId]);

    // ------------------------------------------------------------------ punt 2 + punt 7: de technische ruimte is LEEG
    const alleRoutes = routesVanAlles();
    const routeNamen = Object.keys(alleRoutes);
    check('de uitzonderingenlijst is LEEG: er is geen enkele route van de hmara of de agenda die buiten de poort valt',
      Object.keys(rca.ONBEWAAKTE_ROUTES).length === 0 && rca.bewaakteRoutes(alleRoutes as never).length === routeNamen.length);
    check('alle routeverzamelingen van de hmara en de agenda zijn samen genomen (zes bestanden, ruim veertig routes)',
      routeNamen.length >= 40 && routeNamen.some((r) => r.includes('/cloud/bootstrap')) && routeNamen.some((r) => r.includes('/agenda/overzicht'))
      && routeNamen.some((r) => r.includes('/drive/browse')) && routeNamen.some((r) => r.includes('/calendar/events'))
      && routeNamen.some((r) => r.includes('/photos/import')) && routeNamen.some((r) => r.includes('/google-suite/onboarding/start')), String(routeNamen.length));

    // Vóór de eenmalige keuze bestaat de technische ruimte niet: elke route moet dat ZEGGEN, niet leeg blijven.
    const zonderKeuze = await Promise.all(routeNamen.map(async (r) => ({ r, ...await roep(alleRoutes, r) })));
    const slecht = zonderKeuze.filter((x) => x.data.error !== 'KEUZE_ONTBREEKT');
    check('vóór de keuze weigert ELKE route van de hmara en de agenda met KEUZE_ONTBREEKT — geen enkele uitzondering',
      slecht.length === 0, slecht.map((x) => `${x.r}:${x.status}:${String(x.data.error)}`).slice(0, 4).join(' | '));
    check('de weigering legt het in BEIDE talen uit (nooit een leeg scherm en nooit alleen een code)',
      zonderKeuze.every((x) => {
        const u = (x.data.uitleg ?? (x.data.ruimte as Record<string, unknown> | undefined)?.uitleg) as { uk?: string; nl?: string } | undefined;
        return !!u?.uk && !!u?.nl;
      }));
    check('de twee overzichtsroutes geven 200 met de uitleg én een lege inhoud (de pagina kan de reden tonen)',
      zonderKeuze.filter((x) => x.r.endsWith('/cloud/bootstrap') || x.r.endsWith('/agenda/overzicht'))
        .every((x) => x.status === 200 && Array.isArray(x.data.items) && (x.data.items as unknown[]).length === 0));
    check('al het andere geeft 403 — nooit stil een lege lijst uit de andere lade',
      zonderKeuze.filter((x) => !x.r.endsWith('/cloud/bootstrap') && !x.r.endsWith('/agenda/overzicht')).every((x) => x.status === 403));

    await rs.keuzeZetten(eigId, 'per_dienst', eigId);
    const naKeuze = await Promise.all(routeNamen.map(async (r) => ({ r, ...await roep(alleRoutes, r) })));
    check('na de keuze, vóór het verbinden: elke route zegt «deze dienst staat hier uit» (DIENST_UIT), met uitleg',
      naKeuze.every((x) => x.data.error === 'DIENST_UIT'), naKeuze.filter((x) => x.data.error !== 'DIENST_UIT').map((x) => x.r).slice(0, 4).join(' | '));

    // ------------------------------------------------------------------ «власні дані»: de technische lade is echt leeg
    await rs.dienstZetten(eigId, 'cloud', 'verbind-eigen', { stapOpGedaan: true });
    await rs.dienstZetten(eigId, 'agenda', 'verbind-eigen', { stapOpGedaan: true });
    const techStart = await roep(alleRoutes, 'POST /api/owner/cloud/bootstrap');
    check('«власні дані»: de technische hmara begint LEEG — geen enkel persoonlijk bestand of werkruimte te zien',
      techStart.status === 200 && (techStart.data.ruimte as Record<string, unknown>)?.ruimte === 'technisch'
      && (techStart.data.workspaces as unknown[]).length === 0 && (techStart.data.items as unknown[]).length === 0,
      JSON.stringify((techStart.data.ruimte as Record<string, unknown>) ?? {}).slice(0, 120));
    const techAgenda = await roep(alleRoutes, 'POST /api/owner/agenda/overzicht');
    check('«власні дані»: de technische agenda begint LEEG — geen afspraak, geen agenda, geen abonnement',
      techAgenda.status === 200 && (techAgenda.data.items as unknown[]).length === 0
      && ((techAgenda.data.abonnementen as { ics: unknown[]; caldav: unknown[] }).ics.length === 0)
      && (techAgenda.data.agendas as unknown[]).length === 0);
    check('en de pagina weet in welke ruimte zij kijkt, in beide talen',
      (techAgenda.data.ruimte as { ruimte?: string; uitleg?: { uk?: string; nl?: string } })?.ruimte === 'technisch'
      && !!(techAgenda.data.ruimte as { uitleg?: { uk?: string } })?.uitleg?.uk);
    check('de PERSOONLIJKE lade ziet haar bestand en haar abonnement nog precies zoals gisteren',
      (await rca.metLade(prive(eigId), 'agenda', () => icsLijst(eigId))).some((r) => r.id === oudAbo)
      && (await rca.metLade(prive(eigId), 'agenda', () => agendaItems(eigId, { schrijfbaar: false }))).items.some((i) => i.titel === 'Oude afspraak')
      && (await rca.metLade(prive(eigId), 'cloud', async () => (await db.get('cloud_items_v1', [oudItem || '']))[0] !== null)));

    // ------------------------------------------------------------------ twee laden naast elkaar, zelfde adres
    const adres = 'https://rooster.invalid/gedeeld.ics';
    const privAbo = randomUUID(), techAbo = randomUUID();
    await pool.query(`INSERT INTO app.agenda_abonnement (user_id, ruimte, id, bron, naam, adres) VALUES ($1,'prive',$2,'ics','p',$4), ($1,'technisch',$3,'ics','t',$4)`, [eigId, privAbo, techAbo, adres]);
    check('hetzelfde rooster kan in BEIDE laden staan, los van elkaar (de sleutel is nu per lade)',
      (await rca.metLade(prive(eigId), 'agenda', () => icsLijst(eigId))).some((r) => r.id === privAbo)
      && (await rca.metLade(tech(eigId), 'agenda', () => icsLijst(eigId))).some((r) => r.id === techAbo)
      && !(await rca.metLade(tech(eigId), 'agenda', () => icsLijst(eigId))).some((r) => r.id === privAbo));

    // gespiegelde afspraken per lade, en het idempotentiegeheugen per lade
    await rca.metLade(tech(eigId), 'agenda', () => externeSpiegelVervang(eigId, techAbo, '', [
      { abonnementId: techAbo, agendaUrl: '', uid: 'uid-tech', titel: 'Technische afspraak', locatie: '', beschrijving: '', begin: '2026-10-22T10:00:00Z', einde: '', heleDag: false, tijdzone: '', rrule: '', status: '', reeks: 0, gewijzigdOp: '', url: '' },
    ]));
    const techItems = await rca.metLade(tech(eigId), 'agenda', () => agendaItems(eigId, { schrijfbaar: false }));
    const privItems = await rca.metLade(prive(eigId), 'agenda', () => agendaItems(eigId, { schrijfbaar: false }));
    check('de spiegel van externe afspraken is per lade: elk ziet alleen zijn eigen afspraken',
      techItems.items.some((i) => i.titel === 'Technische afspraak') && !techItems.items.some((i) => i.titel === 'Oude afspraak')
      && privItems.items.some((i) => i.titel === 'Oude afspraak') && !privItems.items.some((i) => i.titel === 'Technische afspraak'));
    const sleutel = randomBytes(16).toString('hex');
    await rca.metLade(tech(eigId), 'agenda', () => koppelClaim(eigId, sleutel, 'aanmaken', 'lok-tech-1234', 'primary'));
    check('ook het idempotentiegeheugen (app.agenda_koppeling) is per lade: de persoonlijke lade kent die sleutel niet',
      (await rca.metLade(tech(eigId), 'agenda', () => koppelLees(eigId, sleutel))) !== null
      && (await rca.metLade(prive(eigId), 'agenda', () => koppelLees(eigId, sleutel))) === null);

    // ------------------------------------------------------------------ punt 3 in het echt: twee bestanden, twee bomen
    const schrijf = async (lade: { userId: string; ruimte: 'prive' | 'technisch' }, naam: string) => {
      const pad = `${rca.cloudVoorvoegsel(lade)}/${Date.now()}-${randomBytes(4).toString('hex')}-${naam}`;
      await storage.write([{ path: pad, content: naam, contentType: 'text/plain', ownerId: lade.userId }]);
      const [id] = await db.add('cloud_items_v1', [{ ...ladeVelden(lade), workspaceId: '', kind: 'file', title: naam, originalName: naam, description: '', textContent: '', sourceUrl: '', mimeType: 'text/plain', sizeBytes: naam.length, storagePath: pad, tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0 }]);
      return { pad, id: id || '' };
    };
    const techBestand = await schrijf(tech(eigId), 'technisch.txt');
    check('een bestand van de technische lade staat in een ANDERE map op schijf dan de persoonlijke bestanden',
      techBestand.pad.startsWith(`${voorT}/`) && !techBestand.pad.startsWith(`${voorP}/`)
      && (await stat(join(uploads, techBestand.pad))).isFile() && (await stat(join(uploads, oudPad))).isFile());
    check('de twee mappen bestaan naast elkaar en bevatten elk alleen hun eigen bestand',
      (await readdir(join(uploads, voorT))).length === 1 && (await readdir(join(uploads, voorP))).length === 1);

    // ------------------------------------------------------------------ punt 4: «спільно» laat het persoonlijke zien
    await rs.dienstZetten(eigId, 'cloud', 'ontkoppel');
    await rs.dienstZetten(eigId, 'cloud', 'verbind-gedeeld', { stapOpGedaan: true });
    const gedeeld = await roep(alleRoutes, 'POST /api/owner/cloud/bootstrap');
    check('«спільно»: de technische ruimte leest de PERSOONLIJKE hmara — hetzelfde bestand, zonder kopie',
      gedeeld.status === 200 && (gedeeld.data.ruimte as { ruimte?: string; gedeeld?: boolean })?.ruimte === 'prive'
      && (gedeeld.data.ruimte as { gedeeld?: boolean })?.gedeeld === true
      && (gedeeld.data.items as Array<{ title?: string }>).some((i) => i.title === 'oud bestand')
      && !(gedeeld.data.items as Array<{ title?: string }>).some((i) => i.title === 'technisch.txt'));
    check('en het scherm krijgt te horen DAT het een bewuste samenvoeging is (uitleg in beide talen)',
      !!(gedeeld.data.ruimte as { uitleg?: { uk?: string; nl?: string } })?.uitleg?.uk
      && !!(gedeeld.data.ruimte as { uitleg?: { uk?: string; nl?: string } })?.uitleg?.nl);

    // ------------------------------------------------------------------ punt 5: bevriezen snijdt alles af
    // Een technische Google-koppeling plus een persoonlijke, zodat we kunnen zien dat ALLEEN de technische sneuvelt.
    const [privGrant] = await db.add('google_oauth_grant_v1', [{ ...ladeVelden(prive(eigId)), principalId: 'p-priv', providerAccountId: 'acc-p', provider: 'google', clientRef: 'google_suite_web_oauth_client', tokenKind: 'refresh_token', grantStatus: 'active', grantedScopes: [], revokedAt: 0, updatedAt: Date.now() }]);
    const [techGrant] = await db.add('google_oauth_grant_v1', [{ ...ladeVelden(tech(eigId)), principalId: 'p-tech', providerAccountId: 'acc-t', provider: 'google', clientRef: 'google_suite_web_oauth_client', tokenKind: 'refresh_token', grantStatus: 'active', grantedScopes: [], revokedAt: 0, updatedAt: Date.now() }]);
    const [techDrive] = await db.add('cloud_provider_accounts_v1', [{ ...ladeVelden(tech(eigId)), principalId: 'p-tech', provider: 'google_drive', service: 'drive', status: 'connected', updatedAt: Date.now() }]);
    const [privDrive] = await db.add('cloud_provider_accounts_v1', [{ ...ladeVelden(prive(eigId)), principalId: 'p-priv', provider: 'google_drive', service: 'drive', status: 'connected', updatedAt: Date.now() }]);
    await rs.dienstZetten(eigId, 'cloud', 'ontkoppel');
    await rs.dienstZetten(eigId, 'cloud', 'verbind-eigen', { stapOpGedaan: true });

    // De rechten weg: het technisch profiel wordt ingetrokken.
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = now() WHERE user_id=$1`, [eigId]);
    await rs.rechtenVerloren(eigId, 'profiel-ingetrokken', 'test');
    await rca.bevriezingAfdwingen(eigId, 'test');
    const standen = await rs.standenVan(eigId);
    check('rechten weg → hmara én agenda zijn ONMIDDELLIJK bevroren (alle twee, in één keer)',
      standen.find((s) => s.dienst === 'cloud')?.stand === 'bevroren' && standen.find((s) => s.dienst === 'agenda')?.stand === 'bevroren');
    const grantStand = async (id: string) => String(((await db.get<Record<string, unknown>>('google_oauth_grant_v1', [id]))[0] || {}).grantStatus || '');
    const driveStand = async (id: string) => String(((await db.get<Record<string, unknown>>('cloud_provider_accounts_v1', [id]))[0] || {}).status || '');
    check('wat van de TECHNISCHE ruimte was is echt ingetrokken: de OAuth-grant en de Drive-rekening',
      (await grantStand(techGrant || '')) === 'revoked' && (await driveStand(techDrive || '')) === 'disconnected');
    check('het PERSOONLIJKE blijft volledig heel: diezelfde mens houdt zijn eigen koppeling en zijn eigen rekening',
      (await grantStand(privGrant || '')) === 'active' && (await driveStand(privDrive || '')) === 'connected');
    check('de externe abonnementen van de technische lade staan uit, die van de persoonlijke lade niet',
      (await pool.query(`SELECT actief FROM app.agenda_abonnement WHERE user_id=$1 AND id=$2`, [eigId, techAbo])).rows[0].actief === false
      && (await pool.query(`SELECT actief FROM app.agenda_abonnement WHERE user_id=$1 AND id=$2`, [eigId, privAbo])).rows[0].actief === true);

    // ---- EERST: zolang de rechten WEG zijn, is er geen technische ruimte meer. Dan hoort een verzoek in de
    // PERSOONLIJKE lade te landen (daar heeft deze mens altijd recht op) en mag er van de technische lade NIETS
    // doorschemeren. Dat is wat «de gegevens zijn heel maar onbereikbaar» in de praktijk betekent.
    await activeer();
    const zonderRechten = await roep(alleRoutes, 'POST /api/owner/cloud/bootstrap');
    check('rechten weg: het verzoek valt terug op de PERSOONLIJKE lade — en ziet geen enkel bestand van de bevroren technische lade',
      zonderRechten.status === 200 && (zonderRechten.data.ruimte as { ruimte?: string })?.ruimte === 'prive'
      && (zonderRechten.data.items as Array<{ title?: string }>).some((i) => i.title === 'oud bestand')
      && !(zonderRechten.data.items as Array<{ title?: string }>).some((i) => i.title === 'technisch.txt'));
    check('en wie rechtstreeks om de TECHNISCHE lade vraagt, krijgt haar niet: geen eigen lade zonder geldige rechten',
      (await rs.gegevensLade({ userId: eigId, rol: 'owner', tabContext: tE, dienst: 'cloud' })).ok === true
      && (await rs.gegevensLade({ userId: eigId, rol: 'owner', tabContext: tE, dienst: 'cloud' }) as { lade: { ruimte: string } }).lade.ruimte === 'prive');

    // ---- DAARNA het geval waar de stand «bevroren» echt zichtbaar moet zijn: de mens heeft zijn technische toegang
    // terug (het profiel is opnieuw geldig en er loopt een activering), maar de SERVEREIGENAAR heeft nog niet beslist
    // wat er met de bevroren gegevens gebeurt. Dan is de technische ruimte er wél, en moet ELKE weg naar die lade
    // dicht zijn — met uitleg, niet met een leeg scherm.
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eigId]);
    await activeer();
    const nogBevroren = await rs.standenVan(eigId);
    check('de stand blijft «bevroren» tot de SERVEREIGENAAR beslist — het terugkrijgen van de rechten opent niets van zichzelf',
      nogBevroren.find((s) => s.dienst === 'cloud')?.stand === 'bevroren' && nogBevroren.find((s) => s.dienst === 'agenda')?.stand === 'bevroren');
    const bevrorenAlles = await Promise.all(routeNamen.map(async (r) => ({ r, ...await roep(alleRoutes, r) })));
    check('bevroren: ELKE route van de hmara en de agenda weigert met BEVROREN en met uitleg — geen enkele uitzondering',
      bevrorenAlles.every((x) => x.data.error === 'BEVROREN'),
      bevrorenAlles.filter((x) => x.data.error !== 'BEVROREN').map((x) => `${x.r}:${String(x.data.error)}`).slice(0, 4).join(' | '));
    // De hulpmiddelen van de AI lopen via dezelfde routes (backend/site-aanroep.ts belt ze intern), dus dezelfde poort.
    const toolRoutes = siteTools.SITE_TOOLS
      .filter((t) => /^(drive|calendar)_/.test(t.tool.name))
      .map((t) => ({ naam: t.tool.name, route: t.request({ calendar_id: 'primary', file_id: 'x', event_id: 'x'.repeat(8), idempotency_key: 'k'.repeat(12), to_calendar_id: 'y' }).route }));
    const toolsGedekt = toolRoutes.filter((t) => routeNamen.includes(t.route));
    check('elk AI-hulpmiddel voor de hmara en de agenda (drive_*, calendar_*) wijst naar een BEWAAKTE route',
      toolRoutes.length >= 8 && toolsGedekt.length === toolRoutes.length,
      toolRoutes.filter((t) => !routeNamen.includes(t.route)).map((t) => `${t.naam}->${t.route}`).join(' | '));
    const perTool = await Promise.all(toolsGedekt.map(async (t) => ({ ...t, ...await roep(alleRoutes, t.route) })));
    check('en dus geeft ELK van die hulpmiddelen in een bevroren ruimte niets terug behalve de uitleg',
      perTool.every((x) => x.data.error === 'BEVROREN'), perTool.filter((x) => x.data.error !== 'BEVROREN').map((x) => x.naam).join(' | '));

    // ook de PLANNER in de achtergrond leest niets meer voor een bevroren lade
    await pool.query(`UPDATE app.agenda_abonnement SET actief = true, laatst_op = NULL WHERE user_id=$1 AND id=$2`, [eigId, techAbo]);
    const ronde = await icsCronRonde(50);
    const davRonde = await caldavCronRonde(25);
    check('de planner in de achtergrond slaat een bevroren technische lade over (en leest dus ook daar niets meer)',
      !JSON.stringify(ronde.uitslagen).includes(String(techAbo).slice(0, 8)) && Number(ronde.overgeslagen) >= 1 && typeof davRonde.overgeslagen === 'number',
      `overgeslagen=${ronde.overgeslagen}`);
    check('de PERSOONLIJKE lade blijft gewoon werken: haar abonnementen zijn niet overgeslagen',
      (await rca.metLade(prive(eigId), 'agenda', () => icsLijst(eigId))).some((r) => r.id === privAbo && r.actief));

    // ------------------------------------------------------------------ punt 6: het besluit van de servereigenaar
    const eigenaarsBesluit = (dienst: string, besluit: string) => rs.eigenaarsBesluit({ userId: eigId, dienst, besluit, eigenaarId: eigId, doorEigenaar: true, stapOpGedaan: true });
    const overdracht = await eigenaarsBesluit('agenda', 'overdragen');
    check('«передати собі» (agenda): de uitvoerder meldt zich, verplaatst de rijen naar de PERSOONLIJKE lade van de eigenaar en zegt wat hij deed',
      overdracht.verslag?.volledig === true && overdracht.verslag.regels.some((r) => r.tabel === 'app.agenda_abonnement')
      && (await pool.query(`SELECT count(*)::int AS n FROM app.agenda_abonnement WHERE user_id=$1 AND ruimte='technisch'`, [eigId])).rows[0].n === 0
      && (await pool.query(`SELECT count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id=$1 AND ruimte='technisch'`, [eigId])).rows[0].n === 0,
      JSON.stringify(overdracht.verslag?.regels?.slice(0, 2) ?? []).slice(0, 160));
    check('het persoonlijke abonnement van vóór de overdracht staat er nog — er is niets overschreven',
      (await pool.query(`SELECT count(*)::int AS n FROM app.agenda_abonnement WHERE user_id=$1 AND id=$2`, [eigId, oudAbo])).rows[0].n === 1);
    check('tweede keer hetzelfde besluit doet niets meer (de dienst is niet meer bevroren): veilig te herhalen',
      await eigenaarsBesluit('agenda', 'overdragen').then(() => false).catch((e) => (e as { code?: string })?.code === 'NIET_BEVROREN'));

    const wegBestand = join(uploads, techBestand.pad);
    const bestondNog = await stat(wegBestand).then(() => true).catch(() => false);
    const wissen = await eigenaarsBesluit('cloud', 'verwijderen');
    const nogDaar = await stat(wegBestand).then(() => true).catch(() => false);
    check('«видалити» (hmara): de rijen van de technische lade zijn weg ÉN het bestand in de opslag is echt gewist',
      bestondNog && !nogDaar && wissen.verslag?.volledig === true
      && wissen.verslag.regels.some((r) => r.tabel === 'opslag/bestanden' && r.rijen >= 1),
      JSON.stringify(wissen.verslag?.regels?.filter((r) => r.rijen) ?? []).slice(0, 200));
    check('het PERSOONLIJKE bestand van diezelfde mens staat er nog — het wissen van de ene boom raakt de andere niet',
      await stat(join(uploads, oudPad)).then(() => true).catch(() => false)
      && (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='cloud_items_v1' AND data->>'ownerUserId'=$1 AND COALESCE(data->>'ruimte','prive')='prive'`, [eigId])).rows[0].n >= 1);
    check('en de technische grant is met de lade mee verdwenen, de persoonlijke niet',
      (await db.get('google_oauth_grant_v1', [techGrant || '']))[0] === null
      && (await db.get('google_oauth_grant_v1', [privGrant || '']))[0] !== null);
    check('tweede keer «видалити» is onschadelijk (de rij blijft als bewijs van het besluit, dus NIET_BEVROREN)',
      await eigenaarsBesluit('cloud', 'verwijderen').then(() => false).catch((e) => (e as { code?: string })?.code === 'NIET_BEVROREN'));
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='cloud'`, [eigId]);
    const nogmaals = await eigenaarsBesluit('cloud', 'verwijderen');
    check('en een derde keer op een opnieuw bevroren lade vindt niets meer: rijen 0, geen fout (idempotent)',
      nogmaals.verslag?.regels.filter((r) => r.tabel.startsWith('app.records/')).every((r) => r.rijen === 0) === true);

    // ------------------------------------------------------------------ nooit de lade van een ander
    const ander = await mk(`ander-${sfx}@eenheid.test`);
    opruimen.push(ander);
    check('een gewone gebruiker houdt zijn PERSOONLIJKE lade: voor hem verandert er niets',
      (await rs.gegevensLade({ userId: ander, rol: 'member', tabContext: tE, dienst: 'cloud' })).ok === true
      && rca.ladeOf(ander).ruimte === 'prive');
    check('buiten een bewaakte aanroep is de lade ALTIJD persoonlijk (minste rechten), ook midden in een technische sessie',
      await rca.metLade(tech(eigId), 'cloud', async () => rca.ladeOf(eigId).ruimte === 'technisch' && rca.ladeOf(ander).ruimte === 'prive')
      && rca.ladeOf(eigId).ruimte === 'prive');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    const alle = [eigId, ...opruimen];
    for (const sql of [
      'DELETE FROM app.agenda_externe_gebeurtenis WHERE user_id = ANY($1)',
      'DELETE FROM app.agenda_abonnement WHERE user_id = ANY($1)',
      'DELETE FROM app.agenda_koppeling WHERE user_id = ANY($1)',
      'DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)',
      'DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)',
      'DELETE FROM app.tech_activaties WHERE user_id = ANY($1)',
    ]) await pool.query(sql, [alle]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl IN ('cloud_items_v1','cloud_workspaces_v1','cloud_resume_v1','cloud_ai_decisions_v1','cloud_audit_v1','google_oauth_grant_v1','cloud_provider_accounts_v1') AND data->>'ownerUserId' = ANY($1)`, [alle]).catch(() => undefined);
    if (!hadProfiel) await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eigId]).catch(() => undefined);
    else await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eigId]).catch(() => undefined);
    await pool.query(`UPDATE app.records SET data = data || jsonb_build_object('role','owner','status',$2::text) WHERE tbl='users' AND id=$1`, [eigId, eigStatus]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [opruimen]).catch(() => undefined);
  }
  return einde();
}
