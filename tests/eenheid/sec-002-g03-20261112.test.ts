// SEC-002 (12.11.2026), groep g03 — de hmara: twee bevindingen van de audit, elk eerst AANGETOOND en daarna gedicht.
//
//   wolk-07  Een beeld uit Google Photos dat in de TECHNISCHE ruimte werd geïmporteerd, kreeg een rij ZONDER `ruimte` — en een
//            rij zonder `ruimte` is persoonlijk (shared/ruimte-scheiding.ts, hoortBij). De naam, de grootte en de werkruimte
//            verschenen dus in de persoonlijke hmara, terwijl de bytes in de technische boom lagen: een lek van technisch naar
//            persoonlijk, en een bestand dat in geen van beide ruimtes te openen was.
//   wolk-08  De rol «лише перегляд» (viewer, of accessLevel 'limited': cloud.read zonder cloud.write) kon toch schrijven:
//            de bewaking in backend/rbac.ts herkent een schrijvende route aan een woord in het pad, en «…/items/:id/status»,
//            «…/resume», «…/connect/start», «…/account/select» en «…/onboarding/start» bevatten zo'n woord niet.
//
// De routes worden hier samengesteld precies zoals backend/index.ts dat doet: wrapFactoryMutations(createCloudRoutes(...)).
// Er gaat niets naar buiten (fetch is onderschept) en alle geheimen in dit bestand zijn verzonnen.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

type Resp = { statusCode: number; body: string };
type Stap = (ctx: unknown) => Promise<Resp | undefined> | Resp | undefined;
type Routes = Record<string, Stap[]>;
type Mens = { id: string; email: string; name: string; status: string; role: string; accessLevel: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g03-20261112');
  // De opslag in een eigen map: deze test schrijft echte bestanden.
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), 'mr-sec002-g03-'));
  // Niets naar buiten: elke poging wordt onthouden en krijgt een verzonnen foutantwoord.
  const buiten: string[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => { buiten.push(String(input)); return new Response('{}', { status: 599 }); }) as typeof fetch;

  const { getPool } = await import('../../server/platform/pg');
  const { db } = await import('../../server/platform');
  const { hoortBij, ladeFilter, ladeVelden } = await import('../../shared/ruimte-scheiding');
  const rca = await import('../../backend/ruimte-cloud-agenda');
  const cp = await import('../../backend/cloud-platform');
  const { isMutationPath, wrapFactoryMutations } = await import('../../backend/rbac');

  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const tab = randomBytes(24).toString('hex');
  const mensen: string[] = [];
  const mk = async (naam: string, role: string, accessLevel: string, status = 'approved'): Promise<Mens> => {
    const id = randomUUID(), email = `${naam}-${sfx}@eenheid.test`;
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status, accessLevel }]);
    mensen.push(id);
    return { id, email, name: naam, status, role, accessLevel };
  };
  /** Zelfde samenstelling als backend/index.ts: eerst de bewaking op de padnaam, daarbinnen de lade-poort en de route zelf. */
  const routesVoor = (mens: Mens): Routes => {
    const auth = async () => ({ service: 'cloud', user: { ...mens } });
    return wrapFactoryMutations(cp.createCloudRoutes(auth as never) as never, auth as never) as Routes;
  };
  /** Zoals de router (server/platform/router.ts): de keten loopt tot de eerste schakel die een antwoord geeft. */
  const roep = async (routes: Routes, route: string, extra: Record<string, unknown> = {}, id = 'onbekend') => {
    const ctx = { event: {}, body: { service: 'cloud', tabContext: tab, sourceOrigin: 'https://cloud.tarasevych.com', ...extra }, params: { id }, query: {} };
    for (const stap of routes[route] || []) {
      const res = await stap(ctx);
      if (!res) continue;
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(res.body || '{}'); } catch { data = {}; }
      return { status: res.statusCode, data };
    }
    return { status: 0, data: {} as Record<string, unknown> };
  };
  const rij = async (tabel: string, id: string) => ((await db.get<Record<string, unknown>>(tabel, [id]))[0] || null) as Record<string, unknown> | null;
  const aantal = async (tabel: string, userId: string) => Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl=$1 AND data->>'ownerUserId'=$2`, [tabel, userId])).rows[0].n);
  const prive = (userId: string) => ({ userId, ruimte: 'prive' as const });
  const tech = (userId: string) => ({ userId, ruimte: 'technisch' as const });
  const nu = Date.now();
  const itemRij = (lade: { userId: string; ruimte: 'prive' | 'technisch' }, workspaceId: string, titel: string) => ({ ...ladeVelden(lade), workspaceId, suggestedWorkspaceId: '', kind: 'note', title: titel, originalName: '', description: '', textContent: `tekst van ${titel}`, sourceUrl: '', mimeType: '', sizeBytes: 0, storagePath: '', tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: nu, updatedAt: nu, openedAt: 0 });
  const werkruimteRij = (lade: { userId: string; ruimte: 'prive' | 'technisch' }, titel: string) => ({ ...ladeVelden(lade), title: titel, normalizedTitle: titel, description: '', template: 'project', sections: [], status: 'active', createdAt: nu, updatedAt: nu, archivedAt: 0 });

  try {
    // ================================================================== wolk-07: de import uit Google Photos volgt de lade
    {
      const lid = await mk('lid', 'member', 'full');
      const bytes = Buffer.from('verzonnen-beeldbytes-voor-de-eenheidstest');
      const naam = `technisch${sfx}`;
      const [techWerkruimte] = await db.add('cloud_workspaces_v1', [werkruimteRij(tech(lid.id), `tech-werkruimte-${sfx}`)]);
      const [priveWerkruimte] = await db.add('cloud_workspaces_v1', [werkruimteRij(prive(lid.id), `prive-werkruimte-${sfx}`)]);

      const inTech = await rca.metLade(tech(lid.id), 'cloud', () => cp.cloudImportExternalMedia(lid.id, { filename: `${naam}.png`, mimeType: 'image/png', bytes, workspaceId: techWerkruimte || '', sourceLabel: 'Google Photos' }));
      const techRij = await rij('cloud_items_v1', String(inTech.id));
      check('wolk-07: een import in de TECHNISCHE lade krijgt een rij met ruimte «technisch» (niet een rij zonder ruimte = persoonlijk)',
        techRij?.ruimte === 'technisch', `ruimte=${String(techRij?.ruimte)}`);
      check('wolk-07: rij en bytes liggen in DEZELFDE lade — de rij hoort bij de technische lade en het pad bij de technische boom',
        hoortBij(techRij, tech(lid.id)) && !hoortBij(techRij, prive(lid.id)) && rca.padInLade(techRij?.storagePath, tech(lid.id)) && !rca.padInLade(techRij?.storagePath, prive(lid.id)));
      const techLijst = (await db.list<Record<string, unknown>>('cloud_items_v1', { filter: ladeFilter(tech(lid.id)) })).items as Array<Record<string, unknown>>;
      check('wolk-07: in de technische lade is het bestand te vinden (vóór de patch was het daar onzichtbaar)',
        techLijst.some((i) => i.id === inTech.id && hoortBij(i, tech(lid.id))));

      // De PERSOONLIJKE hmara van dezelfde mens: geen naam, geen grootte, geen werkruimte van het technische bestand.
      const routesLid = routesVoor(lid);
      const start = await roep(routesLid, 'POST /api/owner/cloud/bootstrap');
      const zichtbaar = [...((start.data.items as Array<{ id: string }>) || []), ...((start.data.inbox as Array<{ id: string }>) || []), ...((start.data.recent as Array<{ id: string }>) || [])];
      check('wolk-07: de persoonlijke hmara toont het technische bestand NIET (lijst, «вхідні», «нещодавні»)',
        start.status === 200 && (start.data.ruimte as { ruimte?: string })?.ruimte === 'prive' && !zichtbaar.some((i) => i.id === inTech.id),
        `status=${start.status} zichtbaar=${zichtbaar.filter((i) => i.id === inTech.id).length}`);
      const zoek = await roep(routesLid, 'POST /api/owner/cloud/search', { query: naam });
      check('wolk-07: zoeken in de persoonlijke hmara vindt de naam van het technische bestand niet',
        zoek.status === 200 && !((zoek.data.results as Array<{ id: string }>) || []).some((i) => i.id === inTech.id), `status=${zoek.status}`);
      const open = await roep(routesLid, 'POST /api/owner/cloud/items/:id/open', {}, String(inTech.id));
      check('wolk-07: en openen vanuit de persoonlijke hmara zegt «niet gevonden» — geen halve toegang tot de andere lade',
        open.status === 404 && open.data.error === 'CLOUD_ITEM_NOT_FOUND', `${open.status}:${String(open.data.error)}`);

      // Aangrenzende gevallen van dezelfde fout: de persoonlijke lade, buiten elke lade, en een werkruimte van de andere lade.
      const inPrive = await rca.metLade(prive(lid.id), 'cloud', () => cp.cloudImportExternalMedia(lid.id, { filename: `prive${sfx}.png`, mimeType: 'image/png', bytes, workspaceId: priveWerkruimte || '' }));
      const zonderLade = await cp.cloudImportExternalMedia(lid.id, { filename: `los${sfx}.png`, mimeType: 'image/png', bytes });
      const priveRij = await rij('cloud_items_v1', String(inPrive.id)), losRij = await rij('cloud_items_v1', String(zonderLade.id));
      check('wolk-07: een import in de persoonlijke lade (en buiten elke lade) blijft persoonlijk, nu met de ruimte uitgeschreven',
        priveRij?.ruimte === 'prive' && losRij?.ruimte === 'prive' && hoortBij(priveRij, prive(lid.id)) && hoortBij(losRij, prive(lid.id))
        && rca.padInLade(priveRij?.storagePath, prive(lid.id)) && rca.padInLade(losRij?.storagePath, prive(lid.id)),
        `prive=${String(priveRij?.ruimte)} los=${String(losRij?.ruimte)}`);
      check('wolk-07: het antwoord van de import verraadt geen eigenaar en geen opslagpad (zoals elke andere weg van de hmara)',
        !('ownerUserId' in inTech) && !('storagePath' in inTech) && inTech.downloadable === true && inTech.workspaceId === techWerkruimte);
      check('wolk-07: een werkruimte van de ANDERE lade wordt geweigerd, in beide richtingen (bestaande bescherming, blijft heel)',
        await rca.metLade(tech(lid.id), 'cloud', () => cp.cloudImportExternalMedia(lid.id, { filename: `kruis${sfx}.png`, mimeType: 'image/png', bytes, workspaceId: priveWerkruimte || '' })).then(() => false).catch((e) => (e as Error).message === 'CLOUD_WORKSPACE_NOT_FOUND')
        && await rca.metLade(prive(lid.id), 'cloud', () => cp.cloudImportExternalMedia(lid.id, { filename: `kruis${sfx}.png`, mimeType: 'image/png', bytes, workspaceId: techWerkruimte || '' })).then(() => false).catch((e) => (e as Error).message === 'CLOUD_WORKSPACE_NOT_FOUND'));
      const bron = (await import('node:fs')).readFileSync(join(process.cwd(), 'backend', 'cloud-platform.ts'), 'utf8');
      const schrijvers = bron.split('\n').filter((regel) => /db\.add\(CLOUD_(?:ITEMS|WORKSPACES|RESUME|AI_DECISIONS|AUDIT),/.test(regel));
      check('wolk-07: ELKE plek in backend/cloud-platform.ts die een rij van de hmara aanmaakt, schrijft de velden van de lade mee',
        schrijvers.length >= 6 && schrijvers.every((regel) => regel.includes('ladeVelden(')), `${schrijvers.filter((r) => !r.includes('ladeVelden(')).length} van ${schrijvers.length} zonder ladeVelden`);

      // Migratie 0215: rijen van VÓÓR de patch (bestand in de technische boom, rij zonder `ruimte`) gaan terug naar hun bestand.
      const oud = (storagePath: string, extra: Record<string, unknown> = {}) => ({ ownerUserId: lid.id, workspaceId: '', suggestedWorkspaceId: '', kind: 'file', title: 'oud', originalName: 'oud.png', description: '', textContent: '', sourceUrl: '', mimeType: 'image/png', sizeBytes: 1, storagePath, tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: nu, updatedAt: nu, openedAt: 0, ...extra });
      const [lek, gewoon, vreemd, notitie, alTech] = await db.add('cloud_items_v1', [
        oud(`${rca.cloudVoorvoegsel(tech(lid.id))}/${nu}-lek.png`),
        oud(`${rca.cloudVoorvoegsel(prive(lid.id))}/${nu}-gewoon.png`),
        oud(`cloud-technisch/${'0'.repeat(18)}/${nu}-vreemd.png`),
        oud('', { kind: 'note', textContent: 'cloud-technisch/ staat alleen in de tekst' }),
        oud(`${rca.cloudVoorvoegsel(tech(lid.id))}/${nu}-al.png`, { ruimte: 'technisch' }),
      ]);
      // ---- NA DE TOETS (aantekening 1): wat er AAN zo'n gelekte rij hing, moet mee — anders blijft het lek in een afgeleide tabel staan.
      // Vóór de patch zag de PERSOONLIJKE fotobibliotheek (backend/foto-dienst.ts, «indexeer») het technische bestand en maakte er
      // een eigen rij foto_media_v1 van: naam, grootte, sha256, EXIF en miniatuur van een TECHNISCH bestand in de persoonlijke lade.
      const ander = await mk('ander', 'member', 'full');
      const [priveMap, techMap] = await db.add('cloud_mappen_v1', [
        { ...ladeVelden(prive(lid.id)), naam: `prive-map-${sfx}`, ouderId: null, createdAt: nu },
        { ...ladeVelden(tech(lid.id)), naam: `tech-map-${sfx}`, ouderId: null, createdAt: nu },
      ]);
      // In de persoonlijke hmara kon de mens de gelekte rij ook nog in een PERSOONLIJKE map of werkruimte zetten.
      const [lekInPriveMap, lekInTechMap] = await db.add('cloud_items_v1', [
        oud(`${rca.cloudVoorvoegsel(tech(lid.id))}/${nu}-lek-prive-map.png`, { mapId: priveMap, workspaceId: priveWerkruimte, suggestedWorkspaceId: priveWerkruimte }),
        oud(`${rca.cloudVoorvoegsel(tech(lid.id))}/${nu}-lek-tech-map.png`, { mapId: techMap, workspaceId: techWerkruimte }),
      ]);
      const fotoNaam = `tech-foto-${sfx}.png`, miniatuur = 'data:image/png;base64,AAAA';
      const fotoRij = (lade: { userId: string; ruimte: 'prive' | 'technisch' }, cloudItemId: string | undefined, extra: Record<string, unknown> = {}) => ({
        ...ladeVelden(lade), naam: fotoNaam, titel: fotoNaam, mime: 'image/png', bytes: 1, sha256: 'a'.repeat(64), genomenOp: null, datumBron: 'onbekend', plaats: null, camera: '', breedte: null, hoogte: null,
        tags: ['eigen-etiket'], albums: [`album-van-de-persoonlijke-lade-${sfx}`], favoriet: true, verborgen: false, herkomst: [{ bron: 'cloud', pad: 'oud.png', op: new Date(nu).toISOString() }],
        opslag: 'cloud', cloudItemId, miniatuur, createdAt: nu, updatedAt: nu, ...extra,
      });
      const eigenPad = `${rca.cloudVoorvoegsel(prive(lid.id))}/foto-${sfx}.png`;
      const [fotoLek, fotoGewoon, fotoVreemd, fotoDubbel, fotoKopie, fotoTweeling, fotoTechAl, fotoAnder] = await db.add('foto_media_v1', [
        fotoRij(prive(lid.id), lek),                                   // de aantekening zelf: afgeleide rij van een gelekt bestand
        fotoRij(prive(lid.id), gewoon, { naam: `gewoon-${sfx}.png` }), // een gewone persoonlijke rij: blijft
        fotoRij(prive(lid.id), vreemd, { naam: `vreemd-${sfx}.png` }), // wijst naar een pad in de boom van een ander: blijft
        // «dubbel»: de mens had dezelfde foto al ZELF persoonlijk geüpload; «indexeer» schreef er alleen de herkomst en de koppeling bij.
        fotoRij(prive(lid.id), lek, { naam: `mijn-${sfx}.png`, opslag: 'eigen', storagePath: eigenPad, herkomst: [{ bron: 'eigen', pad: `mijn-${sfx}.png`, op: 'x' }, { bron: 'cloud', pad: 'oud.png', op: 'x' }, { bron: 'cloud', pad: 'iets-anders.png', op: 'x' }] }),
        // «kopieer»: een eigen kopie die ALLEEN uit het gelekte bestand komt (geen andere herkomst).
        fotoRij(prive(lid.id), lek, { opslag: 'eigen', storagePath: `${rca.cloudVoorvoegsel(prive(lid.id))}/foto-kopie-${sfx}.png` }),
        fotoRij(prive(lid.id), alTech),                                // de technische bibliotheek heeft dit bestand al (rij hieronder): geen tweede rij
        fotoRij(tech(lid.id), alTech, { tags: ['van-technisch'] }),
        fotoRij(prive(ander.id), lek, { naam: `ander-${sfx}.png` }),   // rij van een ANDER mens met hetzelfde id: nooit aanraken
      ]);
      const alleZaad = [lek, gewoon, vreemd, notitie, alTech, lekInPriveMap, lekInTechMap, fotoLek, fotoGewoon, fotoVreemd, fotoDubbel, fotoKopie, fotoTweeling, fotoTechAl, fotoAnder].map(String);
      await pool.query(`UPDATE app.records SET updated_at = now() - interval '1 day' WHERE tbl IN ('cloud_items_v1','foto_media_v1') AND id = ANY($1)`, [alleZaad]);
      const vers = async (tabel: string, id: string | undefined) => Boolean((await pool.query(`SELECT updated_at > now() - interval '10 minutes' AS vers FROM app.records WHERE tbl=$1 AND id=$2`, [tabel, id || ''])).rows[0]?.vers);
      const geraakt = (uitkomst: unknown) => (Array.isArray(uitkomst) ? uitkomst : [uitkomst]).reduce((n: number, r) => n + Number((r as { rowCount?: number })?.rowCount || 0), 0);

      // ---- NA DE TWEEDE TOETS (aantekening 4): ook een vNext-taak (cloud_taken_v1.naam) en een deelkoppeling
      // (app.cloud_deel_koppelingen.naam/doel_naam) die de mens in de PERSOONLIJKE ruimte voor het gelekte bestand maakte, dragen
      // de naam van het technische bestand.
      const taakRij = (bronId: string | undefined, naam: string) => ({ ...ladeVelden(prive(lid.id)), soort: 'kopie', stand: 'fout', bron: { dienst: 'eigen', id: bronId }, doel: { dienst: 'google-drive', account: 'verzonnen' }, naam, totaalBytes: 1, voortgangBytes: 0, createdAt: nu, updatedAt: nu });
      const [taakLek, taakGewoon, taakAnder] = await db.add('cloud_taken_v1', [taakRij(lek, 'oud'), taakRij(gewoon, 'gewoon'), { ...taakRij(lek, 'ander'), ownerUserId: ander.id }]);
      const koppeling = async (userId: string, doelSoort: string, doelId: string | undefined, doelNaam: string, bereik: Record<string, unknown> = {}) => String((await pool.query(
        `INSERT INTO app.cloud_deel_koppelingen (user_id, ruimte, code_hash, naam, doel_soort, doel_id, doel_naam, bereik) VALUES ($1,'prive',$2,$3,$4,$5,$3,$6::jsonb) RETURNING id`,
        [userId, randomBytes(32).toString('hex'), doelNaam, doelSoort, doelId || 'x', JSON.stringify(bereik)])).rows[0].id);
      const deelLek = await koppeling(lid.id, 'bestand', lek, 'oud.png');
      const deelSelectieLek = await koppeling(lid.id, 'selectie', lek, 'oud.png', { mapIds: [], bestandIds: [lek] });
      const deelGemengd = await koppeling(lid.id, 'selectie', lek, 'oud.png (+1)', { mapIds: [], bestandIds: [lek, gewoon] });
      const deelGewoon = await koppeling(lid.id, 'bestand', gewoon, 'gewoon.png');
      const deelAnder = await koppeling(ander.id, 'bestand', lek, 'ander.png');
      await pool.query(`INSERT INTO app.cloud_deel_gebeurtenissen (koppeling_id, user_id, ruimte, soort, doel_pad) VALUES ($1,$2,'prive','download','oud.png'), ($3,$2,'prive','download','gewoon.png')`, [deelLek, lid.id, deelGewoon]);
      const deel = async (id: string) => (await pool.query(`SELECT ruimte, ingetrokken_op, naam, doel_id, doel_naam, bereik FROM app.cloud_deel_koppelingen WHERE id=$1`, [id])).rows[0] as Record<string, unknown>;
      const deelRuimtes = async (id: string) => (await pool.query(`SELECT ruimte FROM app.cloud_deel_gebeurtenissen WHERE koppeling_id=$1`, [id])).rows.map((r) => String(r.ruimte));

      const migratie =(await import('node:fs')).readFileSync(join(process.cwd(), 'migrations', '0215_hmara_import_lade_herstel.sql'), 'utf8');
      const eerste = { rowCount: geraakt(await getPool('migratie').query(migratie)) };
      const tweede = { rowCount: geraakt(await getPool('migratie').query(migratie)) };
      const ruimteVan = async (id: string | undefined) => String((await rij('cloud_items_v1', id || ''))?.ruimte ?? '(geen)');

      const fotoVan = async (id: string | undefined) => await rij('foto_media_v1', id || '');
      const achtergebleven = (await pool.query(
        `SELECT f.id FROM app.records f JOIN app.records c ON c.tbl='cloud_items_v1' AND c.id = f.data->>'cloudItemId'
          WHERE f.tbl='foto_media_v1' AND f.data->>'ownerUserId' = $1 AND COALESCE(f.data->>'ruimte','prive') <> 'technisch'
            AND c.data->>'ownerUserId' = $1 AND c.data->>'ruimte' = 'technisch'`, [lid.id])).rows.map((r) => String(r.id));
      check('wolk-07 (toets 1): na migratie 0215 staat er in de PERSOONLIJKE lade geen enkele fotorij meer die naar een technisch bestand wijst',
        achtergebleven.length === 0, `achtergebleven=${achtergebleven.length}`);
      const naLek = await fotoVan(fotoLek);
      check('wolk-07 (toets 1): de afgeleide fotorij verhuist MEE naar de technische lade — met miniatuur en etiketten, zonder de albums van de persoonlijke lade',
        hoortBij(naLek, tech(lid.id)) && !hoortBij(naLek, prive(lid.id)) && naLek?.miniatuur === miniatuur && naLek?.favoriet === true && JSON.stringify(naLek?.tags) === '["eigen-etiket"]'
        && JSON.stringify(naLek?.albums) === '[]' && naLek?.cloudItemId === lek && naLek?.opslag === 'cloud',
        `ruimte=${String(naLek?.ruimte)} albums=${JSON.stringify(naLek?.albums)}`);
      const naDubbel = await fotoVan(fotoDubbel);
      check('wolk-07 (toets 1): een foto die de mens ZELF persoonlijk had geüpload blijft persoonlijk, maar verliest de koppeling én de naam van het technische bestand',
        hoortBij(naDubbel, prive(lid.id)) && naDubbel?.storagePath === eigenPad && naDubbel?.opslag === 'eigen' && !('cloudItemId' in (naDubbel || {}))
        && JSON.stringify((naDubbel?.herkomst as Array<{ bron: string; pad: string }>).map((h) => `${h.bron}:${h.pad}`)) === JSON.stringify([`eigen:mijn-${sfx}.png`, 'cloud:iets-anders.png']),
        `ruimte=${String(naDubbel?.ruimte)} cloudItemId=${String(naDubbel?.cloudItemId)} herkomst=${JSON.stringify(naDubbel?.herkomst)}`);
      check('wolk-07 (toets 1): een eigen kopie die ALLEEN uit het gelekte bestand komt (geen andere herkomst) gaat ook naar de technische lade',
        hoortBij(await fotoVan(fotoKopie), tech(lid.id)) && (await fotoVan(fotoKopie))?.opslag === 'eigen', `ruimte=${String((await fotoVan(fotoKopie))?.ruimte)}`);
      check('wolk-07 (toets 1): heeft de technische bibliotheek het bestand al, dan verdwijnt de persoonlijke rij (geen tweede rij) en blijft de technische onaangeroerd',
        await fotoVan(fotoTweeling) === null && hoortBij(await fotoVan(fotoTechAl), tech(lid.id)) && JSON.stringify((await fotoVan(fotoTechAl))?.tags) === '["van-technisch"]' && !(await vers('foto_media_v1', fotoTechAl)),
        `tweeling=${String((await fotoVan(fotoTweeling))?.ruimte ?? 'weg')}`);
      check('wolk-07 (toets 1): gewone persoonlijke fotorijen, een rij naar een vreemd pad en de rij van een ANDER mens blijven precies zoals ze waren',
        hoortBij(await fotoVan(fotoGewoon), prive(lid.id)) && (await fotoVan(fotoGewoon))?.cloudItemId === gewoon && JSON.stringify((await fotoVan(fotoGewoon))?.albums) !== '[]' && !(await vers('foto_media_v1', fotoGewoon))
        && hoortBij(await fotoVan(fotoVreemd), prive(lid.id)) && (await fotoVan(fotoVreemd))?.cloudItemId === vreemd && !(await vers('foto_media_v1', fotoVreemd))
        && hoortBij(await fotoVan(fotoAnder), prive(ander.id)) && (await fotoVan(fotoAnder))?.cloudItemId === lek && !(await vers('foto_media_v1', fotoAnder)));
      // Door de echte routes van de fotodienst, in elke lade: wat ziet de mens na de migratie?
      const fotoDienst = await import('../../backend/foto-dienst');
      const hadVlag = fotoDienst.fotoProef.vlagNegeren;
      fotoDienst.fotoProef.vlagNegeren = true;
      try {
        const fotoRoutes = fotoDienst.fotoDienstRoutes((async () => ({ service: 'cloud', user: { ...lid } })) as never) as unknown as Routes;
        const bibliotheek = async (lade: { userId: string; ruimte: 'prive' | 'technisch' }) => {
          const res = await rca.metLade(lade, 'cloud', async () => fotoRoutes['POST /api/owner/foto/bibliotheek'][0]({ event: {}, body: {}, params: {} }));
          return ((JSON.parse(res?.body || '{}') as { items?: Array<Record<string, unknown>> }).items || []).filter((i) => i.naam === fotoNaam);
        };
        const inPriveBib = await bibliotheek(prive(lid.id)), inTechBib = await bibliotheek(tech(lid.id));
        check('wolk-07 (toets 1): de persoonlijke fotobibliotheek toont de naam, grootte en miniatuur van het technische bestand niet meer; de technische toont het, beschikbaar',
          inPriveBib.length === 0 && inTechBib.length >= 2 && inTechBib.some((i) => i.id === fotoLek && i.beschikbaar === true && i.miniatuur === miniatuur),
          `persoonlijk=${inPriveBib.length} technisch=${inTechBib.length}`);
      } finally { fotoDienst.fotoProef.vlagNegeren = hadVlag; }
      // De zoekindex (backend/zoek/bronnen.ts, stapRecords) ziet een wijziging alleen aan de KOLOM updated_at.
      check('wolk-07 (toets 1): de migratie zet updated_at van elke verplaatste rij op «nu» (anders vindt «Пошук усюди» in de technische ruimte het bestand nooit) — en van geen andere',
        await vers('cloud_items_v1', lek) && await vers('cloud_items_v1', lekInPriveMap) && await vers('foto_media_v1', fotoLek) && await vers('foto_media_v1', fotoDubbel) && await vers('foto_media_v1', fotoKopie)
        && !(await vers('cloud_items_v1', gewoon)) && !(await vers('cloud_items_v1', vreemd)) && !(await vers('cloud_items_v1', notitie)) && !(await vers('cloud_items_v1', alTech)),
        `lek=${await vers('cloud_items_v1', lek)} foto=${await vers('foto_media_v1', fotoLek)} gewoon=${await vers('cloud_items_v1', gewoon)}`);
      const naPriveMap = await rij('cloud_items_v1', lekInPriveMap || ''), naTechMap = await rij('cloud_items_v1', lekInTechMap || '');
      check('wolk-07 (toets 1): een verplaatste rij neemt geen map of werkruimte van de PERSOONLIJKE lade mee (ze zou in de technische hmara onvindbaar zijn bij het bladeren); een technische map blijft',
        naPriveMap?.ruimte === 'technisch' && naPriveMap?.mapId === null && naPriveMap?.workspaceId === '' && naPriveMap?.suggestedWorkspaceId === ''
        && naTechMap?.ruimte === 'technisch' && naTechMap?.mapId === techMap && naTechMap?.workspaceId === techWerkruimte,
        `prive-map: mapId=${String(naPriveMap?.mapId)} werkruimte=${String(naPriveMap?.workspaceId)} | tech-map: mapId=${String(naTechMap?.mapId)} werkruimte=${String(naTechMap?.workspaceId)}`);
      check('wolk-07 (toets 4): een PERSOONLIJKE vNext-taak voor het gelekte bestand is weg; een taak voor een gewoon bestand en die van een ander mens blijven',
        await rij('cloud_taken_v1', taakLek || '') === null && (await rij('cloud_taken_v1', taakGewoon || ''))?.naam === 'gewoon' && (await rij('cloud_taken_v1', taakAnder || ''))?.naam === 'ander',
        `lek=${String((await rij('cloud_taken_v1', taakLek || ''))?.ruimte ?? 'weg')}`);
      const [dLek, dSel, dGem, dGew, dAnd] = [await deel(deelLek), await deel(deelSelectieLek), await deel(deelGemengd), await deel(deelGewoon), await deel(deelAnder)];
      check('wolk-07 (toets 4): een persoonlijke deelkoppeling die ALLEEN het gelekte bestand deelt, is ingetrokken en staat (met haar statistiek) in de technische lade',
        dLek?.ruimte === 'technisch' && dLek?.ingetrokken_op !== null && dSel?.ruimte === 'technisch' && dSel?.ingetrokken_op !== null
        && JSON.stringify(await deelRuimtes(deelLek)) === '["technisch"]',
        `koppeling=${String(dLek?.ruimte)}/${String(dLek?.ingetrokken_op)} selectie=${String(dSel?.ruimte)} gebeurtenissen=${JSON.stringify(await deelRuimtes(deelLek))}`);
      check('wolk-07 (toets 4): een gemengde selectie blijft persoonlijk en werkzaam, maar zonder het technische bestand en zonder zijn naam',
        dGem?.ruimte === 'prive' && dGem?.ingetrokken_op === null && JSON.stringify((dGem?.bereik as { bestandIds?: unknown })?.bestandIds) === JSON.stringify([gewoon])
        && dGem?.doel_id === gewoon && !String(dGem?.doel_naam).includes('oud') && !String(dGem?.naam).includes('oud'),
        `ruimte=${String(dGem?.ruimte)} bereik=${JSON.stringify(dGem?.bereik)} doel=${String(dGem?.doel_id)} naam=${String(dGem?.naam)}/${String(dGem?.doel_naam)}`);
      check('wolk-07 (toets 4): een gewone persoonlijke koppeling en de koppeling van een ANDER mens blijven precies zoals ze waren',
        dGew?.ruimte === 'prive' && dGew?.ingetrokken_op === null && dGew?.naam === 'gewoon.png' && JSON.stringify(await deelRuimtes(deelGewoon)) === '["prive"]'
        && dAnd?.ruimte === 'prive' && dAnd?.ingetrokken_op === null && dAnd?.doel_naam === 'ander.png');
      check('wolk-07: migratie 0215 zet een rij van vóór de patch (technisch pad, geen ruimte) in de technische lade — en alleen die',
        await ruimteVan(lek) === 'technisch' && await ruimteVan(gewoon) === '(geen)' && await ruimteVan(vreemd) === '(geen)' && await ruimteVan(notitie) === '(geen)' && await ruimteVan(alTech) === 'technisch',
        `lek=${await ruimteVan(lek)} gewoon=${await ruimteVan(gewoon)} vreemd=${await ruimteVan(vreemd)} notitie=${await ruimteVan(notitie)}`);
      check('wolk-07: migratie 0215 is idempotent (de tweede keer raakt geen rij meer) en laat de rest van de rij ongemoeid',
        Number(eerste.rowCount) >= 1 && tweede.rowCount === 0 && (await rij('cloud_items_v1', lek || ''))?.title === 'oud' && (await rij('cloud_items_v1', lek || ''))?.updatedAt === nu
        && hoortBij(await rij('cloud_items_v1', lek || ''), tech(lid.id)) && hoortBij(await rij('cloud_items_v1', gewoon || ''), prive(lid.id)),
        `eerste=${String(eerste.rowCount)} tweede=${String(tweede.rowCount)}`);
    }

    // ================================================================== wolk-08: «alleen lezen» schrijft niets
    {
      const kijker = await mk('kijker', 'viewer', 'limited');
      const beperkt = await mk('beperkt', 'member', 'limited');
      const lid = await mk('schrijver', 'member', 'full');
      const wachtend = await mk('wachtend', 'member', 'full', 'new');
      const zaai = async (mens: Mens) => {
        const [werkruimte] = await db.add('cloud_workspaces_v1', [werkruimteRij(prive(mens.id), `werkruimte-${mens.name}-${sfx}`)]);
        const [item] = await db.add('cloud_items_v1', [itemRij(prive(mens.id), werkruimte || '', `notitie-${mens.name}-${sfx}`)]);
        const [rekening] = await db.add('cloud_provider_accounts_v1', [{ ...ladeVelden(prive(mens.id)), principalId: '', provider: 'google_drive', service: 'drive', tokenName: 'google_drive_token', accountRole: 'additional', providerAccountId: `verzonnen-${sfx}`, email: `drive-${sfx}@example.invalid`, displayName: 'Verzonnen', picture: '', status: 'connected', grantedScopes: [], scopeMode: 'full_drive', connectionStage: 'connected', lastErrorCode: '', storageLimit: '', storageUsage: '', storageUsageInDrive: '', canCreateDrives: false, createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
        return { werkruimte: werkruimte || '', item: item || '', rekening: rekening || '' };
      };
      const vanKijker = await zaai(kijker), vanBeperkt = await zaai(beperkt), vanLid = await zaai(lid);
      const rKijker = routesVoor(kijker), rBeperkt = routesVoor(beperkt), rLid = routesVoor(lid), rWachtend = routesVoor(wachtend);

      // ---- de vijf routes uit de bevinding, met de rol «alleen lezen»
      const status = await roep(rKijker, 'POST /api/owner/cloud/items/:id/status', { status: 'done' }, vanKijker.item);
      check('wolk-08: «alleen lezen» kan de status van een item NIET wijzigen (403 RBAC_FORBIDDEN, rij ongewijzigd)',
        status.status === 403 && status.data.error === 'RBAC_FORBIDDEN' && (await rij('cloud_items_v1', vanKijker.item))?.status === 'captured',
        `${status.status}:${String(status.data.error)} status=${String((await rij('cloud_items_v1', vanKijker.item))?.status)}`);
      const statusBeperkt = await roep(rBeperkt, 'POST /api/owner/cloud/items/:id/status', { status: 'done' }, vanBeperkt.item);
      check('wolk-08: hetzelfde voor accessLevel «limited» met de rol member (ook dat is «alleen lezen»)',
        statusBeperkt.status === 403 && statusBeperkt.data.error === 'RBAC_FORBIDDEN' && (await rij('cloud_items_v1', vanBeperkt.item))?.status === 'captured',
        `${statusBeperkt.status}:${String(statusBeperkt.data.error)}`);

      const open = await roep(rKijker, 'POST /api/owner/cloud/items/:id/open', {}, vanKijker.item);
      const naOpen = await rij('cloud_items_v1', vanKijker.item);
      check('wolk-08: «alleen lezen» kan een item wél OPENEN (lezen blijft werken)',
        open.status === 200 && open.data.kind === 'note' && String(open.data.text || '').includes('tekst van'), `${open.status}:${String(open.data.error || open.data.kind)}`);
      check('wolk-08: maar het openen schrijft dan niets: geen openedAt, geen updatedAt, geen hervatpunt',
        naOpen?.openedAt === 0 && naOpen?.updatedAt === nu && await aantal('cloud_resume_v1', kijker.id) === 0,
        `openedAt=${String(naOpen?.openedAt)} gewijzigd=${naOpen?.updatedAt !== nu} hervat=${await aantal('cloud_resume_v1', kijker.id)}`);

      const hervat = await roep(rKijker, 'POST /api/owner/cloud/resume', { currentWorkspaceId: vanKijker.werkruimte, currentItemId: vanKijker.item, focus: true, energy: 'high' });
      const hervatpunt = (hervat.data.resume || {}) as Record<string, unknown>;
      check('wolk-08: «alleen lezen» bewaart geen hervatpunt op de server (geen rij), en het antwoord zegt dat eerlijk (persisted: false)',
        await aantal('cloud_resume_v1', kijker.id) === 0 && hervat.data.persisted === false, `rijen=${await aantal('cloud_resume_v1', kijker.id)} persisted=${String(hervat.data.persisted)}`);
      check('wolk-08: het scherm van «alleen lezen» werkt door: 200 met het gecontroleerde hervatpunt, zonder foutmelding bij elke klik',
        hervat.status === 200 && hervatpunt.currentWorkspaceId === vanKijker.werkruimte && hervatpunt.currentItemId === vanKijker.item && hervatpunt.focus === true && hervatpunt.energy === 'high',
        `${hervat.status}:${String(hervat.data.error || '')}`);
      const hervatVreemd = await roep(rKijker, 'POST /api/owner/cloud/resume', { currentWorkspaceId: vanLid.werkruimte, currentItemId: vanLid.item, focus: true, energy: 'onzin' });
      check('wolk-08: ook zonder opslag blijft de controle staan: een item of werkruimte van een ANDER komt niet in het antwoord',
        hervatVreemd.status === 200 && (hervatVreemd.data.resume as Record<string, unknown>)?.currentItemId === '' && (hervatVreemd.data.resume as Record<string, unknown>)?.currentWorkspaceId === ''
        && (hervatVreemd.data.resume as Record<string, unknown>)?.focus === false && (hervatVreemd.data.resume as Record<string, unknown>)?.energy === 'medium' && hervatVreemd.data.repaired === true);

      const koppel = await roep(rKijker, 'POST /api/owner/cloud/providers/google/connect/start', { accountRole: 'primary', locale: 'uk', returnTo: 'https://cloud.tarasevych.com/' });
      check('wolk-08: «alleen lezen» kan geen Google-koppeling starten (403 RBAC_FORBIDDEN, geen OAuth-toestand aangemaakt)',
        koppel.status === 403 && koppel.data.error === 'RBAC_FORBIDDEN' && await aantal('google_suite_oauth_states_v1', kijker.id) === 0, `${koppel.status}:${String(koppel.data.error)}`);
      const kies = await roep(rKijker, 'POST /api/owner/cloud/providers/google/account/select', { accountId: vanKijker.rekening });
      check('wolk-08: «alleen lezen» kan het actieve Google-account niet wisselen (403 RBAC_FORBIDDEN, geen keuze opgeslagen)',
        kies.status === 403 && kies.data.error === 'RBAC_FORBIDDEN' && await aantal('cloud_provider_selections_v1', kijker.id) === 0,
        `${kies.status}:${String(kies.data.error)} keuzes=${await aantal('cloud_provider_selections_v1', kijker.id)}`);

      // ---- dezelfde fout bij de buren die in createCloudRoutes worden meegenomen
      const inrichten = await roep(rKijker, 'POST /api/owner/cloud/google-suite/onboarding/start', { suiteService: 'mail', locale: 'uk' });
      const m4 = await roep(rKijker, 'POST /api/owner/cloud/integrations/v1/accounts/start', { provider: 'dropbox', mode: 'write' });
      check('wolk-08: ook «onboarding/start» en «integrations/v1/accounts/start» (zelfde vorm, andere bestanden) weigeren «alleen lezen»',
        inrichten.status === 403 && inrichten.data.error === 'RBAC_FORBIDDEN' && m4.status === 403 && m4.data.error === 'RBAC_FORBIDDEN',
        `${inrichten.status}:${String(inrichten.data.error)} | ${m4.status}:${String(m4.data.error)}`);

      // ---- de lijst «alleen lezen» is uitgeschreven; alles daarbuiten vraagt cloud.write
      const lees = (cp as unknown as { CLOUD_LEESROUTES?: ReadonlySet<string> }).CLOUD_LEESROUTES;
      const alle = Object.keys(rKijker);
      check('wolk-08: backend/cloud-platform.ts schrijft de routes «alleen lezen» UIT (CLOUD_LEESROUTES) in plaats van op de padnaam te gokken',
        lees instanceof Set && lees.size > 0);
      const leesLijst = [...(lees || [])].sort();
      check('wolk-08: de lijst bevat geen verdwenen routes en geen route die de padnaam zelf al «schrijvend» noemt',
        leesLijst.length > 0 && leesLijst.every((r) => alle.includes(r)) && !leesLijst.some((r) => isMutationPath(r.replace(/^[A-Z]+\s+/, ''))),
        leesLijst.filter((r) => !alle.includes(r) || isMutationPath(r.replace(/^[A-Z]+\s+/, ''))).join(' | '));
      check('wolk-08: de lijst is precies deze — een route erbij zetten is een bewust besluit dat óók hier moet worden vastgelegd',
        JSON.stringify(leesLijst) === JSON.stringify([
          'GET /api/owner/cloud/oauth/m4/callback',
          'POST /api/owner/cloud/bootstrap',
          'POST /api/owner/cloud/google-suite/drive/preview',
          'POST /api/owner/cloud/google-suite/onboarding/status',
          'POST /api/owner/cloud/google-suite/onboarding/verify',
          'POST /api/owner/cloud/integrations/v1/accounts/list',
          'POST /api/owner/cloud/integrations/v1/admin/policies/list',
          'POST /api/owner/cloud/integrations/v1/catalogue',
          'POST /api/owner/cloud/integrations/v1/directory/batch',
          'POST /api/owner/cloud/integrations/v1/directory/list',
          'POST /api/owner/cloud/integrations/v1/files/preview',
          'POST /api/owner/cloud/integrations/v1/google/file/capabilities',
          'POST /api/owner/cloud/integrations/v1/status',
          'POST /api/owner/cloud/integrations/v1/transfer/plan',
          'POST /api/owner/cloud/items/:id/open',
          'POST /api/owner/cloud/platform-status',
          'POST /api/owner/cloud/providers/status/verify',
          'POST /api/owner/cloud/resume',
          'POST /api/owner/cloud/search',
        ]), leesLijst.join(' | '));
      // Elke route BUITEN de lijst wordt echt aangeroepen met «alleen lezen»: de weigering komt vóór de route zelf, dus er gebeurt niets.
      const schrijvend = alle.filter((r) => !(lees || new Set<string>()).has(r));
      const antwoorden = [] as Array<{ r: string; status: number; fout: string }>;
      for (const r of schrijvend) { const a = await roep(rKijker, r, {}, vanKijker.item); antwoorden.push({ r, status: a.status, fout: String(a.data.error || '') }); }
      const lek = antwoorden.filter((a) => a.status !== 403 || a.fout !== 'RBAC_FORBIDDEN');
      check('wolk-08: ELKE route van createCloudRoutes buiten de lijst weigert «alleen lezen» met 403 RBAC_FORBIDDEN — ook een route van morgen',
        schrijvend.length >= 10 && lek.length === 0, lek.map((a) => `${a.r}:${a.status}:${a.fout}`).slice(0, 6).join(' | '));
      check('wolk-08: en niets daarvan liet een spoor na (status, werkruimtes, keuze en hervatpunt van «alleen lezen» ongewijzigd)',
        (await rij('cloud_items_v1', vanKijker.item))?.status === 'captured' && (await rij('cloud_items_v1', vanKijker.item))?.workspaceId === vanKijker.werkruimte
        && await aantal('cloud_workspaces_v1', kijker.id) === 1 && await aantal('cloud_items_v1', kijker.id) === 1
        && await aantal('cloud_provider_selections_v1', kijker.id) === 0 && await aantal('cloud_resume_v1', kijker.id) === 0
        && (await rij('cloud_provider_accounts_v1', vanKijker.rekening))?.status === 'connected');

      // ---- NA DE TOETS (aantekening 3): een weigering is wél een SPOOR in het auditboek van de hmara (geen gegevens van de mens):
      // één regel per route, result 'rejected', in de lade van de aanroep, zonder inhoud van het verzoek — en begrensd.
      const weigeringen = async (userId: string) => (await pool.query(`SELECT data FROM app.records WHERE tbl='cloud_audit_v1' AND data->>'ownerUserId'=$1 AND data->>'action'='cloud.schrijven.geweigerd'`, [userId])).rows.map((r) => r.data as Record<string, unknown>);
      const boekKijker = await weigeringen(kijker.id);
      // Routes die de bewaking op de padnaam (backend/rbac.ts, wrapFactoryMutations) al vóór de hmara weigert, komen hier niet aan;
      // die bewaking is gemeenschappelijk voor alle diensten en schrijft (nog) geen audit — zie het verslag («відкладено»).
      const doorDePoort = schrijvend.filter((r) => !isMutationPath(r.replace(/^[A-Z]+\s+/, '')));
      check('wolk-08 (toets 3): elke weigering van «alleen lezen» door de hmara staat in het auditboek — één regel per route, result «rejected», in de eigen lade',
        doorDePoort.length >= 5 && boekKijker.length === doorDePoort.length && JSON.stringify(boekKijker.map((r) => String(r.entityId)).sort()) === JSON.stringify([...doorDePoort].sort())
        && boekKijker.every((r) => r.result === 'rejected' && r.entityType === 'route' && hoortBij(r, prive(kijker.id))),
        `regels=${boekKijker.length} routes=${doorDePoort.length}: ${doorDePoort.join(' | ')}`);
      check('wolk-08 (toets 3): de regel bevat alleen de route en de code — niets uit het verzoek (geen status, account of tekst)',
        boekKijker.every((r) => JSON.stringify(Object.keys((r.details || {}) as object)) === '["reden"]' && (r.details as { reden?: string }).reden === 'RBAC_FORBIDDEN')
        && !JSON.stringify(boekKijker).includes(vanKijker.rekening) && !JSON.stringify(boekKijker).includes('done'));
      for (let k = 0; k < 3; k++) await roep(rKijker, 'POST /api/owner/cloud/items/:id/status', { status: 'done' }, vanKijker.item);
      check('wolk-08 (toets 3): herhaald klikken vult het boek niet (hoogstens één regel per mens, route en code per venster)',
        (await weigeringen(kijker.id)).length === doorDePoort.length, `regels=${(await weigeringen(kijker.id)).length}`);
      const boekBeperkt = await weigeringen(beperkt.id);
      check('wolk-08 (toets 3): ook accessLevel «limited» laat zijn weigering na',
        boekBeperkt.length === 1 && boekBeperkt[0].entityId === 'POST /api/owner/cloud/items/:id/status', `regels=${boekBeperkt.length}`);
      // De expliciete controles in backend/cloud-google-drive.ts (ook buiten de schrijfpoort) leggen de weigering eveneens vast.
      const kijker2 = await mk('kijker2', 'viewer', 'limited');
      const gd = await import('../../backend/cloud-google-drive');
      const losGoogle = gd.createCloudGoogleRoutes((async () => ({ service: 'cloud', user: { ...kijker2 } })) as never) as unknown as Routes;
      const ontkoppel = await roep(losGoogle, 'POST /api/owner/cloud/providers/google/disconnect', { accountId: 'x' });
      const boekKijker2 = await weigeringen(kijker2.id);
      check('wolk-08 (toets 3): ook de eigen controle van «disconnect» (zonder schrijfpoort ervoor) weigert én legt vast',
        ontkoppel.status === 403 && ontkoppel.data.error === 'RBAC_FORBIDDEN' && boekKijker2.length === 1 && boekKijker2[0].entityId === 'POST /api/owner/cloud/providers/google/disconnect',
        `${ontkoppel.status}:${String(ontkoppel.data.error)} regels=${boekKijker2.length}`);

      // ---- NA DE TOETS (aantekening 2): dezelfde fout langs een ANDERE weg — de functies die zelf in de hmara schrijven, worden ook
      // buiten createCloudRoutes aangeroepen («media/diagram», «media/afbeelding», «google-suite/photos/import»).
      const uitkomst = (p: Promise<unknown>) => p.then(() => 'geschreven', (e) => String((e as Error)?.message || e));
      const schema = 'flowchart TD\n  A-->B';
      const aiInvoer = (titel: string) => ({ filename: `${titel}.mmd`, mimeType: 'text/plain', bytes: Buffer.from(schema, 'utf8'), titel, beschrijving: '', tags: ['mermaid'], tekst: schema, bron: 'diagram_generate' });
      const importKijker = await uitkomst(cp.cloudImportExternalMedia(kijker.id, { filename: `kijker-${sfx}.png`, mimeType: 'image/png', bytes: Buffer.from('verzonnen-beeld') }));
      const aiKijker = await uitkomst(cp.cloudAiBestandOpslaan(kijker.id, aiInvoer(`kijker-${sfx}`)));
      const aiBeperkt = await uitkomst(cp.cloudAiBestandOpslaan(beperkt.id, aiInvoer(`beperkt-${sfx}`)));
      const aiWachtend = await uitkomst(cp.cloudAiBestandOpslaan(wachtend.id, aiInvoer(`wachtend-${sfx}`)));
      const aiOnbekend = await uitkomst(cp.cloudAiBestandOpslaan(randomUUID(), aiInvoer(`onbekend-${sfx}`)));
      check('wolk-08 (toets 2): cloudImportExternalMedia en cloudAiBestandOpslaan weigeren «alleen lezen» ZELF — geen rij, zoals elke route van de hmara',
        importKijker === 'RBAC_FORBIDDEN' && aiKijker === 'RBAC_FORBIDDEN' && aiBeperkt === 'RBAC_FORBIDDEN'
        && await aantal('cloud_items_v1', kijker.id) === 1 && await aantal('cloud_items_v1', beperkt.id) === 1,
        `import=${importKijker} ai=${aiKijker} beperkt=${aiBeperkt} rijen=${await aantal('cloud_items_v1', kijker.id)}`);
      check('wolk-08 (toets 2): een nog niet goedgekeurd account en een onbekend id schrijven er evenmin iets mee',
        aiWachtend === 'RBAC_PENDING_CANNOT_MUTATE' && aiOnbekend === 'RBAC_FORBIDDEN' && await aantal('cloud_items_v1', wachtend.id) === 0, `wachtend=${aiWachtend} onbekend=${aiOnbekend}`);
      check('wolk-08 (toets 2): en er komt geen byte op schijf in de hmara van «alleen lezen»',
        !existsSync(join(String(process.env.UPLOADS_DIR), rca.cloudVoorvoegsel(prive(kijker.id)))) && !existsSync(join(String(process.env.UPLOADS_DIR), rca.cloudVoorvoegsel(prive(beperkt.id)))));
      const { devMgRoutes } = await import('../../backend/dev-mg-routes');
      const mgVoor = (mens: Mens) => devMgRoutes({ requireSession: (async () => ({ service: 'cloud', user: { ...mens } })) as never }) as unknown as Routes;
      const diagramKijker = await roep(mgVoor(kijker), 'POST /api/owner/media/diagram', { code: schema, title: `schema-kijker-${sfx}` });
      check('wolk-08 (toets 2): de route «media/diagram» (buiten createCloudRoutes) schrijft voor «alleen lezen» niets meer in de hmara',
        diagramKijker.status !== 200 && diagramKijker.data.error === 'RBAC_FORBIDDEN' && await aantal('cloud_items_v1', kijker.id) === 1,
        `${diagramKijker.status}:${String(diagramKijker.data.error)} rijen=${await aantal('cloud_items_v1', kijker.id)}`);
      const diagramLid = await roep(mgVoor(lid), 'POST /api/owner/media/diagram', { code: schema, title: `schema-lid-${sfx}` });
      const lidSchema = await rij('cloud_items_v1', String(diagramLid.data.itemId || ''));
      check('wolk-08 (toets 2): voor een gewoon lid werkt «media/diagram» als voorheen (bestand in zijn eigen persoonlijke hmara)',
        diagramLid.status === 200 && hoortBij(lidSchema, prive(lid.id)) && lidSchema?.textContent === schema, `${diagramLid.status}:${String(diagramLid.data.error || '')}`);
      check('wolk-08 (toets 3): ook de weigering van zo\'n functie staat in het auditboek (één regel per functie)',
        (await weigeringen(kijker.id)).filter((r) => ['cloudImportExternalMedia', 'cloudAiBestandOpslaan'].includes(String(r.entityId))).length === 2);

      // ---- lezen blijft werken voor «alleen lezen»
      const start = await roep(rKijker, 'POST /api/owner/cloud/bootstrap');
      const zoek = await roep(rKijker, 'POST /api/owner/cloud/search', { query: `notitie-${kijker.name}-${sfx}` });
      check('wolk-08: «alleen lezen» ziet zijn hmara en kan erin zoeken — er is niets aan het lezen afgenomen',
        start.status === 200 && ((start.data.items as Array<{ id: string }>) || []).some((i) => i.id === vanKijker.item)
        && zoek.status === 200 && ((zoek.data.results as Array<{ id: string }>) || []).some((i) => i.id === vanKijker.item), `${start.status} | ${zoek.status}`);

      // ---- zelfde fout, andere plek: het zelfherstel van een verouderd hervatpunt in de LEESroute «bootstrap» is ook schrijven
      const verouderd = { currentWorkspaceId: 'bestaat-niet-meer', currentItemId: 'bestaat-niet-meer', focus: true, energy: 'high', updatedAt: nu };
      const hersteller = await mk('hersteller', 'member', 'full');
      const [puntKijker] = await db.add('cloud_resume_v1', [{ ...ladeVelden(prive(kijker.id)), ...verouderd }]);
      const [puntLid] = await db.add('cloud_resume_v1', [{ ...ladeVelden(prive(hersteller.id)), ...verouderd }]);
      const startKijker = await roep(rKijker, 'POST /api/owner/cloud/bootstrap');
      const startHersteller = await roep(routesVoor(hersteller), 'POST /api/owner/cloud/bootstrap');
      const schoon = (r: Record<string, unknown>) => { const p = (r.resume || {}) as Record<string, unknown>; return p.currentItemId === '' && p.currentWorkspaceId === '' && p.focus === false; };
      check('wolk-08: «bootstrap» geeft «alleen lezen» het opgeschoonde hervatpunt, maar herschrijft de rij NIET (een leesroute schrijft niets voor die rol)',
        startKijker.status === 200 && schoon(startKijker.data) && (await rij('cloud_resume_v1', puntKijker || ''))?.currentItemId === 'bestaat-niet-meer',
        `${startKijker.status} rij=${String((await rij('cloud_resume_v1', puntKijker || ''))?.currentItemId)}`);
      check('wolk-08: voor een gewoon lid werkt het zelfherstel als voorheen (de verouderde verwijzing is uit de rij verdwenen)',
        startHersteller.status === 200 && schoon(startHersteller.data) && (await rij('cloud_resume_v1', puntLid || ''))?.currentItemId === '',
        `${startHersteller.status} rij=${String((await rij('cloud_resume_v1', puntLid || ''))?.currentItemId)}`);

      // ---- wie mag schrijven, kan dat nog steeds (geen gedrag gebroken)
      const statusLid = await roep(rLid, 'POST /api/owner/cloud/items/:id/status', { status: 'in_progress' }, vanLid.item);
      const openLid = await roep(rLid, 'POST /api/owner/cloud/items/:id/open', {}, vanLid.item);
      const naOpenLid = await rij('cloud_items_v1', vanLid.item);
      check('wolk-08: een gewoon lid wijzigt de status en het openen wordt onthouden (openedAt + hervatpunt), precies als voorheen',
        statusLid.status === 200 && naOpenLid?.status === 'in_progress' && openLid.status === 200 && Number(naOpenLid?.openedAt) > 0 && await aantal('cloud_resume_v1', lid.id) === 1,
        `${statusLid.status}:${String(statusLid.data.error || '')} openedAt=${String(naOpenLid?.openedAt)} hervat=${await aantal('cloud_resume_v1', lid.id)}`);
      const hervatLid = await roep(rLid, 'POST /api/owner/cloud/resume', { currentWorkspaceId: vanLid.werkruimte, currentItemId: vanLid.item, focus: true, energy: 'low' });
      const opgeslagen = (await db.list<Record<string, unknown>>('cloud_resume_v1', { filter: ladeFilter(prive(lid.id)) })).items as Array<Record<string, unknown>>;
      check('wolk-08: het hervatpunt van een gewoon lid wordt opgeslagen (persisted: true, één rij met de gevraagde waarden)',
        hervatLid.status === 200 && hervatLid.data.persisted === true && opgeslagen.length === 1 && opgeslagen[0].currentItemId === vanLid.item && opgeslagen[0].focus === true && opgeslagen[0].energy === 'low',
        `${hervatLid.status} persisted=${String(hervatLid.data.persisted)} rijen=${opgeslagen.length}`);
      const kiesLid = await roep(rLid, 'POST /api/owner/cloud/providers/google/account/select', { accountId: vanLid.rekening });
      const koppelLid = await roep(rLid, 'POST /api/owner/cloud/providers/google/connect/start', { accountRole: 'additional', locale: 'uk' });
      const maakLid = await roep(rLid, 'POST /api/owner/cloud/workspaces/create', { title: `nieuw-${sfx}`, template: 'personal' });
      check('wolk-08: een gewoon lid wisselt het actieve account, bereikt de Google-koppeling en maakt een werkruimte (geen RBAC-weigering)',
        kiesLid.status === 200 && await aantal('cloud_provider_selections_v1', lid.id) === 1 && koppelLid.data.error !== 'RBAC_FORBIDDEN' && maakLid.status === 200,
        `${kiesLid.status}:${String(kiesLid.data.error || '')} | ${koppelLid.status}:${String(koppelLid.data.error || '')} | ${maakLid.status}`);

      // ---- nog niet goedgekeurd: geen enkele schrijvende route, en lezen ook niet
      const wachtStatus = await roep(rWachtend, 'POST /api/owner/cloud/items/:id/status', { status: 'done' }, vanLid.item);
      const wachtStart = await roep(rWachtend, 'POST /api/owner/cloud/bootstrap');
      check('wolk-08: een nog niet goedgekeurd account blijft overal buiten (403), zoals voorheen',
        wachtStatus.status === 403 && wachtStart.status === 403, `${wachtStatus.status}:${String(wachtStatus.data.error)} | ${wachtStart.status}:${String(wachtStart.data.error)}`);
      const boekWachtend = await weigeringen(wachtend.id), boekLid = await weigeringen(lid.id);
      check('wolk-08 (toets 3): de weigering van een niet goedgekeurd account staat er met zijn eigen code; wie mag schrijven laat geen weigering na',
        boekWachtend.some((r) => r.entityId === 'POST /api/owner/cloud/items/:id/status' && (r.details as { reden?: string })?.reden === 'RBAC_PENDING_CANNOT_MUTATE') && boekLid.length === 0,
        `wachtend=${boekWachtend.length} lid=${boekLid.length}`);
    }

    // ================================================================== aanv-ronde1-04: geen heel groot bestand in het geheugen
    // De oude weg «items/:id/open» en de fotodienst lazen een bestand in zijn geheel (readFile + base64), ook als het uit vNext kwam
    // (tot 32 GiB, zelfde collectie cloud_items_v1). Een paar gelijktijdige verzoeken konden zo het geheugen van de server uitputten.
    {
      const groot = await mk('groot', 'member', 'full');
      const { storage } = await import('../../server/platform');
      const grens = Number((cp as unknown as { CLOUD_OPEN_MAX_BYTES?: number }).CLOUD_OPEN_MAX_BYTES || 32 * 1024 * 1024);
      const inhoudGroot = Buffer.alloc(grens + 1, 7), inhoudKlein = Buffer.from('kleine-inhoud-voor-de-eenheidstest');
      const padGroot = `${rca.cloudVoorvoegsel(prive(groot.id))}/${nu}-groot.bin`, padKlein = `${rca.cloudVoorvoegsel(prive(groot.id))}/${nu}-klein.png`;
      const [okGroot, okKlein] = await storage.write([
        { path: padGroot, content: inhoudGroot.toString('base64'), contentType: 'application/octet-stream', ownerId: groot.id },
        { path: padKlein, content: inhoudKlein.toString('base64'), contentType: 'image/png', ownerId: groot.id },
      ]);
      const bestand = (storagePath: string, sizeBytes: number, naam: string) => ({ ...itemRij(prive(groot.id), '', naam), kind: 'file', textContent: '', originalName: naam, mimeType: 'application/octet-stream', sizeBytes, storagePath });
      // «groot-oud»: de rij zegt 100 bytes (verouderd — vervangen door een groter bestand met hetzelfde id), het bestand is groter dan de grens.
      const [grootOud, grootBekend, klein] = await db.add('cloud_items_v1', [bestand(padGroot, 100, 'groot-oud.bin'), bestand(padGroot, 2 * 1024 * 1024 * 1024, 'groot-bekend.bin'), bestand(padKlein, inhoudKlein.length, 'klein.png')]);
      // Spion op de opslag: wie leest er, met welke grens, en hoeveel komt er werkelijk in het geheugen?
      const echtLezen = storage.read.bind(storage), echtDeel = storage.leesDeel.bind(storage);
      const lezingen: Array<{ pad: string; maxBytes?: number; tekens: number; teGroot: boolean }> = [];
      let delen = 0;
      (storage as { read: typeof storage.read }).read = (async (paden: string[], opties: Parameters<typeof storage.read>[1] = {}) => {
        const uit = await echtLezen(paden, opties);
        uit.forEach((u) => lezingen.push({ pad: u.path, maxBytes: (opties as { maxBytes?: number }).maxBytes, tekens: String(u.content || '').length, teGroot: Boolean((u as { teGroot?: boolean }).teGroot) }));
        return uit;
      }) as typeof storage.read;
      (storage as { leesDeel: typeof storage.leesDeel }).leesDeel = (async (...a: Parameters<typeof storage.leesDeel>) => { delen++; return echtDeel(...a); }) as typeof storage.leesDeel;
      try {
        const rGroot = routesVoor(groot);
        const openOud = await roep(rGroot, 'POST /api/owner/cloud/items/:id/open', {}, String(grootOud));
        check('aanv-ronde1-04: «open» van een bestand boven de grens geeft 413 CLOUD_ITEM_TE_GROOT, ook als de rij een verouderde (kleine) grootte noemt',
          okGroot === true && openOud.status === 413 && openOud.data.error === 'CLOUD_ITEM_TE_GROOT' && !('data' in openOud.data),
          `${openOud.status}:${String(openOud.data.error || openOud.data.kind)}`);
        check('aanv-ronde1-04: …en de opslag las het bestand daarbij NIET in het geheugen (eerst de werkelijke grootte, dan pas lezen)',
          lezingen.some((l) => l.pad === padGroot && l.teGroot && l.tekens === 0 && l.maxBytes === grens) && !lezingen.some((l) => l.pad === padGroot && l.tekens > 0),
          JSON.stringify(lezingen.map((l) => ({ ...l, pad: l.pad === padGroot ? 'groot' : 'ander' }))));
        const voorBekend = lezingen.length;
        const openBekend = await roep(rGroot, 'POST /api/owner/cloud/items/:id/open', {}, String(grootBekend));
        check('aanv-ronde1-04: zegt de rij al dat het bestand te groot is, dan wordt de opslag niet eens aangeraakt',
          openBekend.status === 413 && openBekend.data.error === 'CLOUD_ITEM_TE_GROOT' && lezingen.length === voorBekend, `${openBekend.status}:${String(openBekend.data.error)} lezingen=${lezingen.length - voorBekend}`);
        // NA DE TWEEDE TOETS (aantekening 5): de blokkade is een beschermingsmaatregel en laat een spoor na — begrensd, zonder inhoud.
        for (let k = 0; k < 3; k++) { await roep(rGroot, 'POST /api/owner/cloud/items/:id/open', {}, String(grootOud)); await roep(rGroot, 'POST /api/owner/cloud/items/:id/open', {}, String(grootBekend)); }
        const blokkades = (await pool.query(`SELECT data FROM app.records WHERE tbl='cloud_audit_v1' AND data->>'ownerUserId'=$1 AND data->>'action'='cloud.item.open.geweigerd'`, [groot.id])).rows.map((r) => r.data as Record<string, unknown>);
        const perItem = (id: string | undefined) => blokkades.filter((b) => b.entityId === id);
        check('aanv-ronde1-04 (toets 5): elke 413-blokkade van «open» staat in het auditboek van de hmara — één regel per mens en bestand, ook na herhaalde pogingen',
          perItem(grootOud).length === 1 && perItem(grootBekend).length === 1 && blokkades.length === 2
          && blokkades.every((b) => b.entityType === 'item' && b.result === 'rejected' && hoortBij(b, prive(groot.id))),
          `regels=${blokkades.length}`);
        check('aanv-ronde1-04 (toets 5): de regel noemt de reden en de WERKELIJKE grootte, niets van de inhoud',
          blokkades.every((b) => JSON.stringify(Object.keys((b.details || {}) as object).sort()) === '["reden","sizeBytes"]' && (b.details as { reden?: string }).reden === 'CLOUD_ITEM_TE_GROOT')
          && (perItem(grootOud)[0]?.details as { sizeBytes?: number })?.sizeBytes === grens + 1 && (perItem(grootBekend)[0]?.details as { sizeBytes?: number })?.sizeBytes === 2 * 1024 * 1024 * 1024,
          JSON.stringify(blokkades.map((b) => b.details)));
        const openKlein =await roep(rGroot, 'POST /api/owner/cloud/items/:id/open', {}, String(klein));
        check('aanv-ronde1-04: een gewoon (klein) bestand opent als voorheen, met de inhoud',
          okKlein === true && openKlein.status === 200 && openKlein.data.kind === 'file' && openKlein.data.data === inhoudKlein.toString('base64'), `${openKlein.status}:${String(openKlein.data.error || '')}`);
        const [direct] = await echtLezen([padGroot], { maxBytes: grens });
        const [ruim] = await echtLezen([padKlein], { maxBytes: grens });
        check('aanv-ronde1-04: storage.read met maxBytes: boven de grens content null + teGroot, eronder gewoon de inhoud',
          direct.content === null && (direct as { teGroot?: boolean }).teGroot === true && ruim.content === inhoudKlein.toString('base64') && !(ruim as { teGroot?: boolean }).teGroot);

        // De fotodienst: «controleer» rekent de sha256 in stukken; «inhoud» en «kopieer» lezen met een grens op de WERKELIJKE grootte.
        const fotoDienst = await import('../../backend/foto-dienst');
        const hadVlag = fotoDienst.fotoProef.vlagNegeren;
        fotoDienst.fotoProef.vlagNegeren = true;
        try {
          const shaGroot = createHash('sha256').update(inhoudGroot).digest('hex');
          const [fotoGroot, fotoKlein] = await db.add('foto_media_v1', [
            { ...ladeVelden(prive(groot.id)), naam: 'groot.bin', titel: 'groot', mime: 'image/png', bytes: 10, sha256: shaGroot, tags: [], albums: [], herkomst: [], opslag: 'eigen', storagePath: padGroot, createdAt: nu, updatedAt: nu },
            { ...ladeVelden(prive(groot.id)), naam: 'klein.png', titel: 'klein', mime: 'image/png', bytes: 10, sha256: '', tags: [], albums: [], herkomst: [], opslag: 'cloud', cloudItemId: klein, createdAt: nu, updatedAt: nu },
          ]);
          const fotoRoutes = fotoDienst.fotoDienstRoutes((async () => ({ service: 'cloud', user: { ...groot } })) as never) as unknown as Routes;
          const foto = async (pad: string, body: Record<string, unknown>) => {
            const res = await rca.metLade(prive(groot.id), 'cloud', async () => fotoRoutes[`POST /api/owner/foto/${pad}`][0]({ event: {}, body, params: {} }));
            return { status: Number(res?.statusCode), data: JSON.parse(res?.body || '{}') as Record<string, unknown> };
          };
          lezingen.length = 0; delen = 0;
          const controle = await foto('item', { actie: 'controleer', ids: [fotoGroot] });
          const naControle = await rij('foto_media_v1', String(fotoGroot));
          check('aanv-ronde1-04: «controleer» rekent de sha256 van een groot bestand in stukken — nooit het hele bestand in het geheugen — en vindt hem juist',
            controle.status === 200 && naControle?.backupOk === true && lezingen.length === 0 && delen >= Math.ceil(inhoudGroot.length / (4 * 1024 * 1024)),
            `${controle.status}:${String(controle.data.error || '')} ok=${String(naControle?.backupOk)} lezingen=${lezingen.length} delen=${delen}`);
          const L = (await import('../../shared/foto-model')).FOTO_LIMIETEN;
          lezingen.length = 0;
          const toon = await foto('inhoud', { id: fotoKlein });
          const toonLezingen = lezingen.splice(0);
          const kopie = await foto('item', { actie: 'kopieer', ids: [fotoKlein] });
          // «kopieer» mag ook stromend werken (zonder storage.read); leest hij wél in één keer, dan met de grens op de werkelijke grootte.
          check('aanv-ronde1-04: «inhoud» en «kopieer» lezen met een bovengrens op de werkelijke grootte (niet alleen op het opgeslagen r.bytes)',
            toon.status === 200 && toon.data.data === inhoudKlein.toString('base64') && kopie.status === 200
            && toonLezingen.length > 0 && toonLezingen.every((l) => l.maxBytes !== undefined && l.maxBytes <= L.inhoudMaxBytes)
            && lezingen.every((l) => l.maxBytes !== undefined && l.maxBytes <= L.itemMaxBytes),
            `${toon.status} | ${kopie.status}:${String(kopie.data.error || '')} | inhoud=${JSON.stringify(toonLezingen.map((l) => l.maxBytes ?? 'geen'))} kopieer=${JSON.stringify(lezingen.map((l) => l.maxBytes ?? 'geen'))}`);
        } finally { fotoDienst.fotoProef.vlagNegeren = hadVlag; }
      } finally {
        (storage as { read: typeof storage.read }).read = echtLezen as typeof storage.read;
        (storage as { leesDeel: typeof storage.leesDeel }).leesDeel = echtDeel as typeof storage.leesDeel;
        await storage.delete([padGroot, padKlein]).catch(() => undefined);
      }
    }

    check('er is tijdens deze test geen enkel verzoek naar buiten gegaan', buiten.length === 0, buiten.slice(0, 3).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    globalThis.fetch = echteFetch;
    await pool.query(`DELETE FROM app.cloud_deel_koppelingen WHERE user_id = ANY($1)`, [mensen]).catch(() => undefined);
    for (const tabel of ['cloud_items_v1', 'cloud_workspaces_v1', 'cloud_resume_v1', 'cloud_ai_decisions_v1', 'cloud_audit_v1', 'cloud_provider_accounts_v1', 'cloud_provider_selections_v1', 'google_suite_oauth_states_v1', 'cloud_mappen_v1', 'foto_media_v1', 'cloud_taken_v1'])
      await pool.query(`DELETE FROM app.records WHERE tbl=$1 AND data->>'ownerUserId' = ANY($2)`, [tabel, mensen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [mensen]).catch(() => undefined);
  }
  return einde();
}
