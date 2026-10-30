// AFSTEMMING vNEXT — KOPPEL (30.10.2026, vlag afstemming-vnext, backend/afstemming-koppel.ts, contract
// shared/afstemming-model.ts). Tegen de ECHTE Postgres; kaarten worden rechtstreeks als records aangemaakt (de kern is
// een parallel werkdeel), releases als echte rijen in app.uitrol_runs.
//
// WAT DEZE TEST VASTHOUDT:
//   1. DE POORT. Geen sessie → 401; verkeerde dienst → 403; geen eigenaar → ACCOUNT_NOT_APPROVED; api én hub mogen.
//   2. KOPPELINGEN. stel-voor met validatie (soort, zelf, reden, onbekende kaart, duplicaat óók omgekeerd bij symmetrische
//      soorten); gebeurtenissen op BEIDE kaarten; tellers herberekend; conflicts_with → openConflicten op beide.
//   3. BESLUIT. Een agent mag nooit beslissen (AGENT_MAG_NIET); de eigenaar bevestigt/wijst af mét Besluit-rij en
//      gebeurtenissen; idempotent; een beslist voorstel is onwrikbaar (KOPPEL_BESLIST); verwijderen alleen voorgesteld.
//   4. KANDIDATEN. Lexicaal (gemeenschappelijke woorden, reden noemt ze), graf (zelfde dienst+categorie → relates_to 0.3),
//      nooit voor al-gekoppelde of afgewezen paren, niets wordt opgeslagen.
//   5. GRAAF. Knopen/randen met stand; filters dienst/soorten; omgeving van één kaart met diepte.
//   6. RELEASES. Echte app.uitrol_runs-rijen (staat klaar), jongste eerst; release-koppel (preflight eerlijk:
//      ongeregistreerd voor een onbekende versie), bevestigen alleen door de eigenaar.
//   7. POSTFLIGHT. «Uitgerold ≠ bevestigd» (scenario 4): alleen productie­bewijs NA de release telt; regressie apart.
//   8. SCAN. Eigen tabs/vlaggen/routes zonder kaart → zonder_kaart; kaart zonder spoor → kaart_zonder_spoor; read-only.
//   9. RAPPORT en MOGELIJKHEDEN. Telbare feiten; «перевірено» alléén met productie­bewijs of legacy owner_browser_verified.
//  10. ISOLATIE. Een ander account ziet niets.
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { db } from '../../server/platform';
import { afstemmingKoppelRoutes } from '../../backend/afstemming-koppel';
import type { Kaart } from '../../shared/afstemming-model';
import { checker } from './hulp/nep-google';

type Routes = ReturnType<typeof afstemmingKoppelRoutes>;
type Antw = { status: number; uit: Record<string, any> };
const KAARTEN = 'afstemming_kaarten_v1';
const GEBEURTENISSEN = 'afstemming_gebeurtenissen_v1';
const BESLUITEN = 'afstemming_besluiten_v1';
const BEWIJS = 'afstemming_bewijs_v1';

export async function main(): Promise<number> {
  const { check, einde } = checker('afstemming-koppel-20261030');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`afk-a-${sfx}@eenheid.test`);
  const b = await mk(`afk-b-${sfx}@eenheid.test`);
  const maak = (id: string, service = 'api', role = 'owner') => afstemmingKoppelRoutes(async () => ({ user: { id, role, status: 'approved' }, service }));
  const rA = maak(a);
  const rB = maak(b);
  const roep = async (routes: Routes, pad: string, body: Record<string, unknown> = {}): Promise<Antw> => {
    const res = await (routes[`POST /api/owner/afstemming/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} });
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };
  const t0 = new Date().toISOString();
  const kaart = async (eigenaar: string, extern: string, velden: Record<string, unknown> = {}): Promise<Kaart & { id: string }> => {
    const record = {
      ownerUserId: eigenaar, externId: extern, levensfase: 'draft', gezondheid: 'unknown', revisieId: `rev-${extern}`, revisieNummer: 1,
      titel: [`${extern}-назва`, `${extern}-naam`], samenvatting: ['стислий опис', 'korte omschrijving'], dienst: 'api', categorie: 'test',
      prioriteit: 'P2', criteriaTotaal: 0, criteriaGeslaagd: 0, koppelingen: 0, bewijs: 0, openConflicten: 0,
      bronSoort: 'gesprek', provenance: 'eenheidstest', aangemaaktOp: t0, bijgewerktOp: t0, versie: 1, ...velden,
    };
    const [id] = await db.add(KAARTEN, [record]);
    return { ...(record as unknown as Kaart), id: id! };
  };
  const kaartNu = async (id: string) => (await db.get<Record<string, any>>(KAARTEN, [id]))[0]!;
  const gebeurtenissenVan = async (kaartId: string) => (await db.list<Record<string, any>>(GEBEURTENISSEN, { filter: { ownerUserId: a, kaartId }, limit: 200 })).items;
  const runIds: string[] = [];
  const uitrolRij = async (versie: string, wijzigingen: string, opIso: string) => {
    const id = `afk-${sfx}-${versie}`;
    runIds.push(id);
    await pool.query(`INSERT INTO app.uitrol_runs (id, methode, versie, release, staat, wijzigingen, bron_commit, gestart_op, geeindigd_op)
                      VALUES ($1,'opdracht',$2,$2,'klaar',$3,'abc123',$4,$4)`, [id, versie, wijzigingen, opIso]);
  };

  try {
    // ================================================================ 1. de poort
    const geen = afstemmingKoppelRoutes(async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }));
    check('zonder sessie: 401', (await roep(geen, 'rapport')).status === 401);
    check('verkeerde dienst (cloud) → OWNER_CLOUD_SESSION_REQUIRED (403)', await roep(maak(a, 'cloud'), 'rapport').then((r) => r.status === 403 && r.uit.error === 'OWNER_CLOUD_SESSION_REQUIRED'));
    check('geen eigenaar (member) → ACCOUNT_NOT_APPROVED (403)', await roep(maak(a, 'api', 'member'), 'rapport').then((r) => r.status === 403 && r.uit.error === 'ACCOUNT_NOT_APPROVED'));
    check('api én hub mogen allebei (lege lijst koppelingen)', await roep(maak(a, 'hub'), 'koppel', { actie: 'lijst' }).then((r) => r.status === 200 && Array.isArray(r.uit.koppelingen)));

    // ================================================================ 2. stel-voor + validaties + tellers + gebeurtenissen
    const kA = await kaart(a, 'K-A', { samenvatting: ['розумна картотека можливостей продукту і доказів', 'slim register'] });
    const kB = await kaart(a, 'K-B', { samenvatting: ['картотека можливостей продукту для команди', 'register voor het team'] });
    const kC = await kaart(a, 'K-C', { samenvatting: ['зовсім інша тема без перетину слів', 'iets heel anders'], categorie: 'test' });
    check('onbekende soort → SOORT_ONBEKEND', await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kB.id, soort: 'verzonnen', reden: 'геть не існує' }).then((r) => r.uit.error === 'SOORT_ONBEKEND'));
    check('kaart aan zichzelf → KOPPEL_ZELF', await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kA.id, soort: 'relates_to', reden: 'само до себе' }).then((r) => r.uit.error === 'KOPPEL_ZELF'));
    check('reden korter dan 5 tekens → REDEN_VEREIST', await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kB.id, soort: 'relates_to', reden: 'аб' }).then((r) => r.uit.error === 'REDEN_VEREIST'));
    check('onbekende doelkaart → KAART_ONBEKEND (404)', await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: randomUUID(), soort: 'relates_to', reden: 'немає такої' }).then((r) => r.status === 404 && r.uit.error === 'KAART_ONBEKEND'));
    const v1 = await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kB.id, soort: 'duplicates', reden: 'обидві описують ту саму картотеку', zekerheid: 1.7 });
    check('voorstel aangemaakt: stand voorgesteld, zekerheid geklemd op 1', v1.status === 200 && v1.uit.koppeling.stand === 'voorgesteld' && v1.uit.koppeling.zekerheid === 1 && v1.uit.koppeling.id);
    check('gebeurtenis «koppeling» op BEIDE kaarten', (await gebeurtenissenVan(kA.id)).some((g) => g.soort === 'koppeling') && (await gebeurtenissenVan(kB.id)).some((g) => g.soort === 'koppeling'));
    check('tellers herberekend: koppelingen=1 op beide, geen open conflicten', (await kaartNu(kA.id)).koppelingen === 1 && (await kaartNu(kB.id)).koppelingen === 1 && (await kaartNu(kA.id)).openConflicten === 0);
    check('exact duplicaat → KOPPEL_BESTAAT', await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kB.id, soort: 'duplicates', reden: 'ще раз те саме' }).then((r) => r.uit.error === 'KOPPEL_BESTAAT'));
    check('symmetrische soort omgekeerd → ook KOPPEL_BESTAAT', await roep(rA, 'koppel', { actie: 'stel-voor', van: kB.id, naar: kA.id, soort: 'duplicates', reden: 'навпаки те саме' }).then((r) => r.uit.error === 'KOPPEL_BESTAAT'));
    const depAB = await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kB.id, soort: 'depends_on', reden: 'А потребує Б' });
    const depBA = await roep(rA, 'koppel', { actie: 'stel-voor', van: kB.id, naar: kA.id, soort: 'depends_on', reden: 'Б потребує А (навпаки — інша релація)' });
    check('asymmetrische soort mag in beide richtingen apart', depAB.status === 200 && depBA.status === 200);
    const conflict = await roep(rA, 'koppel', { actie: 'stel-voor', van: kA.id, naar: kC.id, soort: 'conflicts_with', reden: 'двоє вимог про одну кнопку' });
    check('conflicts_with → openConflicten=1 op beide kaarten', conflict.status === 200 && (await kaartNu(kA.id)).openConflicten === 1 && (await kaartNu(kC.id)).openConflicten === 1);

    // ================================================================ 3. besluit: alleen de eigenaar, met Besluit-rij
    check('een agent mag niet bevestigen → AGENT_MAG_NIET (403)', await roep(rA, 'koppel', { actie: 'bevestig', id: v1.uit.koppeling.id, alsAgent: true }).then((r) => r.status === 403 && r.uit.error === 'AGENT_MAG_NIET'));
    const best = await roep(rA, 'koppel', { actie: 'bevestig', id: v1.uit.koppeling.id, reden: 'так, це дублі' });
    check('eigenaar bevestigt: stand bevestigd + besluitOp', best.status === 200 && best.uit.koppeling.stand === 'bevestigd' && best.uit.koppeling.besluitOp);
    const besluiten = (await db.list<Record<string, any>>(BESLUITEN, { filter: { ownerUserId: a }, limit: 100 })).items;
    check('Besluit-rij bewaard met keuze «bevestig» en de reden', besluiten.some((x) => x.keuze === 'bevestig' && x.kaartId === kA.id && String(x.reden).includes('дублі')));
    check('gebeurtenis «besluit» op beide kaarten', (await gebeurtenissenVan(kA.id)).some((g) => g.soort === 'besluit') && (await gebeurtenissenVan(kB.id)).some((g) => g.soort === 'besluit'));
    check('idempotent: nogmaals bevestigen → 200, zelfde stand', await roep(rA, 'koppel', { actie: 'bevestig', id: v1.uit.koppeling.id }).then((r) => r.status === 200 && r.uit.koppeling.stand === 'bevestigd'));
    check('afwijzen van een al-besliste → KOPPEL_BESLIST', await roep(rA, 'koppel', { actie: 'wijs-af', id: v1.uit.koppeling.id }).then((r) => r.uit.error === 'KOPPEL_BESLIST'));
    const afw = await roep(rA, 'koppel', { actie: 'wijs-af', id: depBA.uit.koppeling.id, reden: 'зайва релація' });
    check('afwijzen werkt: stand afgewezen + Besluit «afwijzen», teller zakt (afgewezen telt niet mee)', afw.uit.koppeling.stand === 'afgewezen'
      && (await db.list<Record<string, any>>(BESLUITEN, { filter: { ownerUserId: a }, limit: 100 })).items.some((x) => x.keuze === 'afwijzen')
      && (await kaartNu(kB.id)).koppelingen === 2);
    check('conflict bevestigen bewaart conflictMet in het besluit', await roep(rA, 'koppel', { actie: 'bevestig', id: conflict.uit.koppeling.id }).then(async () =>
      (await db.list<Record<string, any>>(BESLUITEN, { filter: { ownerUserId: a }, limit: 100 })).items.some((x) => x.conflictMet === kC.id)));
    check('verwijderen van een besliste → KOPPEL_BESLIST; van onbekende → 404', (await roep(rA, 'koppel', { actie: 'verwijder', id: v1.uit.koppeling.id })).uit.error === 'KOPPEL_BESLIST'
      && (await roep(rA, 'koppel', { actie: 'verwijder', id: randomUUID() })).status === 404);
    const wegKoppel = await roep(rA, 'koppel', { actie: 'stel-voor', van: kB.id, naar: kC.id, soort: 'blocks', reden: 'тимчасова пропозиція' });
    check('verwijderen van een voorgestelde mag en herberekent de tellers', (await roep(rA, 'koppel', { actie: 'verwijder', id: wegKoppel.uit.koppeling.id })).uit.ok === true
      && (await kaartNu(kC.id)).koppelingen === 1);
    check('onbekende actie → ACTIE_ONGELDIG', (await roep(rA, 'koppel', { actie: 'x' })).uit.error === 'ACTIE_ONGELDIG');
    check('lijst per kaart: kA heeft er 4 (dup bevestigd, dep heen, dep terug afgewezen, conflict) — alle standen zichtbaar', (await roep(rA, 'koppel', { actie: 'lijst', kaartId: kA.id })).uit.koppelingen.length === 4);

    // ================================================================ 4. kandidaten (niets wordt opgeslagen)
    const kD = await kaart(a, 'K-D', { samenvatting: ['розумна картотека можливостей і доказів продукту', 'register'], categorie: 'anders' });
    const kand = await roep(rA, 'kandidaten', { kaartId: kD.id });
    const lexicaal = (kand.uit.kandidaten as any[]).find((x) => x.id === '' && (x.soort === 'duplicates' || x.soort === 'overlaps') && (x.van === kD.id || x.naar === kD.id));
    check('lexicale kandidaat gevonden met de gemeenschappelijke woorden in de reden', !!lexicaal && /спільні слова/.test(lexicaal.reden) && /картотека/.test(lexicaal.reden) && lexicaal.zekerheid > 0);
    const kandC = (kand.uit.kandidaten as any[]).filter((x) => x.van === kC.id || x.naar === kC.id);
    check('geen lexicale kandidaat met de niet-verwante kaart (kC is al gekoppeld → ook geen graf-kandidaat)', kandC.every((x) => x.id !== ''));
    const kE = await kaart(a, 'K-E', { samenvatting: ['нічого схожого тут нема', 'niets'], dienst: 'api', categorie: 'anders' });
    const kandE = await roep(rA, 'kandidaten', { kaartId: kE.id });
    const graf = (kandE.uit.kandidaten as any[]).find((x) => x.id === '' && x.soort === 'relates_to');
    check('graf-kandidaat: zelfde dienst+categorie → relates_to met zekerheid 0.3', !!graf && graf.zekerheid === 0.3 && /служба/.test(graf.reden));
    check('niets opgeslagen: verse kandidaten hebben id "" en de collectie groeide niet', (await roep(rA, 'koppel', { actie: 'lijst', kaartId: kE.id })).uit.koppelingen.length === 0);
    check('onbekende kaart bij kandidaten → 404', (await roep(rA, 'kandidaten', { kaartId: randomUUID() })).status === 404);

    // ================================================================ 5. graaf
    const graaf = await roep(rA, 'graaf', {});
    check('graaf: alle kaarten als knopen, randen dragen stand (bevestigd én voorgesteld)', graaf.uit.knopen.length === 5
      && graaf.uit.randen.some((r: any) => r.stand === 'bevestigd') && graaf.uit.randen.some((r: any) => r.stand === 'voorgesteld')
      && graaf.uit.randen.every((r: any) => r.stand !== 'afgewezen'));
    check('graaf: soorten-filter houdt alleen conflicts_with over', (await roep(rA, 'graaf', { soorten: ['conflicts_with'] })).uit.randen.every((r: any) => r.soort === 'conflicts_with'));
    check('graaf: omgeving van kC met diepte 1 = kC + kA (conflict), zonder kB', await roep(rA, 'graaf', { kaartId: kC.id, diepte: 1 }).then((r) => {
      const ids = (r.uit.knopen as any[]).map((k) => k.id);
      return ids.includes(kC.id) && ids.includes(kA.id) && !ids.includes(kB.id);
    }));

    // ================================================================ 6. releases uit de echte uitrolgeschiedenis
    const eerder = new Date(Date.now() - 3600_000).toISOString();
    const later = new Date(Date.now() - 60_000).toISOString();
    await uitrolRij(`20261030-0001${sfx}`, 'Eerste testrelease: mail en cloud.', eerder);
    await uitrolRij(`20261030-0002${sfx}`, 'Tweede testrelease: afstemming.', later);
    const rel = await roep(rA, 'releases', {});
    const mijne = (rel.uit.releases as any[]).filter((r) => String(r.versie).includes(sfx));
    check('releases komen uit app.uitrol_runs, jongste eerst, met samenvatting en tijd', mijne.length === 2 && mijne[0].versie === `20261030-0002${sfx}` && /afstemming/.test(mijne[0].samenvatting) && mijne[0].op > mijne[1].op);
    check('ongeregistreerd is eerlijk leeg (diff-analyse is gepland, niet verzonnen)', mijne.every((r) => Array.isArray(r.ongeregistreerd) && r.ongeregistreerd.length === 0));
    const rk = await roep(rA, 'release-koppel', { kaartId: kA.id, releaseVersie: `20261030-0002${sfx}`, zekerheid: 0.8 });
    check('release-koppel: voorgesteld, preflight ok (zekerheid ≥ 0.5), runId uit de echte rij', rk.status === 200 && rk.uit.koppeling.stand === 'voorgesteld' && rk.uit.koppeling.preflight === 'ok' && String(rk.uit.koppeling.runId).includes(sfx));
    check('duplicaat kaart+versie → KOPPEL_BESTAAT', (await roep(rA, 'release-koppel', { kaartId: kA.id, releaseVersie: `20261030-0002${sfx}`, zekerheid: 0.9 })).uit.error === 'KOPPEL_BESTAAT');
    check('onbekende versie → preflight «ongeregistreerd» (eerlijk, geen weigering)', (await roep(rA, 'release-koppel', { kaartId: kC.id, releaseVersie: `99999999-x${sfx}`, zekerheid: 0.9 })).uit.koppeling.preflight === 'ongeregistreerd');
    check('agent mag niet bevestigen bij release-koppel → AGENT_MAG_NIET', (await roep(rA, 'release-koppel', { kaartId: kB.id, releaseVersie: `20261030-0001${sfx}`, zekerheid: 0.6, bevestig: true, alsAgent: true })).status === 403);
    const rkB = await roep(rA, 'release-koppel', { kaartId: kB.id, releaseVersie: `20261030-0002${sfx}`, zekerheid: 0.4, bevestig: true });
    check('eigenaar bevestigt meteen: stand bevestigd + Besluit + preflight onbekend (zekerheid < 0.5)', rkB.uit.koppeling.stand === 'bevestigd' && rkB.uit.koppeling.preflight === 'onbekend'
      && (await db.list<Record<string, any>>(BESLUITEN, { filter: { ownerUserId: a }, limit: 100 })).items.some((x) => /release 20261030-0002/.test(String(x.reden))));
    check('gebeurtenis «release» op de kaart', (await gebeurtenissenVan(kA.id)).some((g) => g.soort === 'release'));
    check('releases tonen de koppelingen onder de juiste versie', await roep(rA, 'releases', {}).then((r) => {
      const twee = (r.uit.releases as any[]).find((x) => x.versie === `20261030-0002${sfx}`);
      return twee && twee.kaarten.length === 2;
    }));

    // ================================================================ 7. postflight: uitgerold ≠ bevestigd (scenario 4)
    check('onbekende release → RELEASE_ONBEKEND (404)', (await roep(rA, 'postflight', { releaseVersie: 'bestaat-niet' })).status === 404);
    const kR = await kaart(a, 'K-R', { gezondheid: 'regressed' });
    await roep(rA, 'release-koppel', { kaartId: kR.id, releaseVersie: `20261030-0002${sfx}`, zekerheid: 0.9 });
    const voorRelease = new Date(Date.now() - 7200_000).toISOString();
    await db.add(BEWIJS, [{ ownerUserId: a, kaartId: kC.id, soort: 'production_probe', omgeving: 'production', verwijzing: 'oud bewijs', resultaat: 'geslaagd', waargenomenOp: voorRelease, door: { soort: 'systeem', id: 'test' } }]);
    await db.add(BEWIJS, [{ ownerUserId: a, kaartId: kA.id, soort: 'production_probe', omgeving: 'production', verwijzing: 'e2e na release', resultaat: 'geslaagd', waargenomenOp: new Date().toISOString(), door: { soort: 'systeem', id: 'test' } }]);
    await roep(rA, 'release-koppel', { kaartId: kC.id, releaseVersie: `20261030-0002${sfx}`, zekerheid: 0.7 }); // kC heeft alleen OUD bewijs (van vóór de release)
    const post = await roep(rA, 'postflight', { releaseVersie: `20261030-0002${sfx}` });
    check('postflight: alleen kA bevestigd (vers productie­bewijs NA de release)', post.uit.gecontroleerd === 1);
    check('postflight: kB onbevestigd (uitrol is geen bewijs), kR als regressie', (post.uit.onbevestigd as string[]).includes('K-B') && (post.uit.regressies as string[]).includes('K-R'));
    check('postflight bijgewerkt op de koppeling zelf (zichtbaar in releases)', await roep(rA, 'releases', {}).then((r) => {
      const twee = (r.uit.releases as any[]).find((x) => x.versie === `20261030-0002${sfx}`);
      const vanA = (twee.kaarten as any[]).find((k) => k.kaartId === kA.id);
      return vanA?.postflight === 'gecontroleerd';
    }));
    check('bewijs van VÓÓR de release telt niet: kC kreeg geen postflight-bevestiging', !((post.uit.regressies as string[]).includes('K-C')) && (post.uit.onbevestigd as string[]).includes('K-C'));

    // ================================================================ 8. scan (read-only inventaris)
    const scan1 = await roep(rA, 'scan', {});
    check('scan vindt de cloud-vlag «cloud-vnext» als zonder_kaart zolang geen kaart die noemt', (scan1.uit.bevindingen as any[]).some((x) => x.soort === 'zonder_kaart' && x.sleutel === 'cloud-vnext'));
    check('scan markeert een kaart zonder enig spoor als kaart_zonder_spoor met kaartId', (scan1.uit.bevindingen as any[]).some((x) => x.soort === 'kaart_zonder_spoor' && x.kaartId === kE.id));
    await kaart(a, 'K-F', { samenvatting: ['вмикає прапорець cloud-vnext для хмари', 'zet de vlag cloud-vnext aan'] });
    const scan2 = await roep(rA, 'scan', {});
    check('na een kaart die de vlag noemt verdwijnt die sleutel uit zonder_kaart', !(scan2.uit.bevindingen as any[]).some((x) => x.soort === 'zonder_kaart' && x.sleutel === 'cloud-vnext'));
    check('scan blijft begrensd (≤200) en draagt een tijdstempel', (scan2.uit.bevindingen as any[]).length <= 200 && typeof scan2.uit.op === 'string');

    // ================================================================ 9. rapport en mogelijkheden
    const rap = await roep(rA, 'rapport', { periode: 'week' });
    check('rapport telt: alles nieuw deze week, conflicten en «zonder criteria» kloppen, tekst noemt de cijfers', rap.uit.nieuw >= 7 && rap.uit.conflicten >= 2 && rap.uit.zonderEigenaar >= 7 && new RegExp(`нових карток ${rap.uit.nieuw}`).test(rap.uit.tekst[0]));
    const kW = await kaart(a, 'K-W', { gezondheid: 'working', levensfase: 'deployed', samenvatting: ['працює розділ /afstemming на сайті', 'werkt'] });
    const rap2 = await roep(rA, 'rapport', {});
    check('«werkt» zonder vers bewijs telt als verouderd', rap2.uit.verouderd >= 1);
    const mog1 = await roep(rA, 'mogelijkheden', {});
    const itemW = (mog1.uit.rubrieken as any[]).flatMap((r) => r.items).find((i) => i.externId === 'K-W');
    check('mogelijkheden: uitgerold zonder productie­bewijs heet «не перевірено» (scenario 4) en route /afstemming is herkend', !!itemW && itemW.stand === 'не перевірено' && itemW.route === '/afstemming');
    await db.add(BEWIJS, [{ ownerUserId: a, kaartId: kW.id, soort: 'e2e', omgeving: 'production', verwijzing: 'probe', resultaat: 'geslaagd', waargenomenOp: new Date().toISOString(), door: { soort: 'systeem', id: 'test' } }]);
    const mog2 = await roep(rA, 'mogelijkheden', {});
    check('mét productie­bewijs wordt het «перевірено»', (mog2.uit.rubrieken as any[]).flatMap((r) => r.items).find((i) => i.externId === 'K-W')?.stand === 'перевірено');
    await kaart(a, 'L-1', { bronSoort: 'legacy', gezondheid: 'working', legacy: { claimId: 'CAN-X', bewijslaag: ['source_only', 'owner_browser_verified'], classificatie: 'confirmed_in_canonical' } });
    await kaart(a, 'L-2', { bronSoort: 'legacy', gezondheid: 'working', legacy: { claimId: 'CAN-Y', bewijslaag: ['source_only'], classificatie: 'confirmed_in_canonical' } });
    const mog3 = await roep(rA, 'mogelijkheden', {});
    const items3 = (mog3.uit.rubrieken as any[]).flatMap((r) => r.items);
    check('legacy met owner_browser_verified → «перевірено»; met alleen source_only → «не перевірено» (bewijslaag nooit verhoogd)', items3.find((i) => i.externId === 'L-1')?.stand === 'перевірено' && items3.find((i) => i.externId === 'L-2')?.stand === 'не перевірено');
    check('concept-kaarten staan niet tussen de mogelijkheden', !items3.some((i) => i.externId === 'K-A'));

    // ================================================================ 10. isolatie
    check('een ander account ziet geen koppelingen, kandidaten of graaf', (await roep(rB, 'koppel', { actie: 'lijst' })).uit.koppelingen.length === 0
      && (await roep(rB, 'graaf', {})).uit.knopen.length === 0
      && (await roep(rB, 'kandidaten', {})).uit.kandidaten.length === 0);
    check('een ander account kan andermans voorstel niet bevestigen (404)', (await roep(rB, 'koppel', { actie: 'bevestig', id: depAB.uit.koppeling.id })).status === 404);
  } finally {
    await pool.query(`DELETE FROM app.records WHERE tbl LIKE 'afstemming_%' AND data->>'ownerUserId' = ANY($1)`, [[a, b]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[a, b]]).catch(() => undefined);
    if (runIds.length) await pool.query('DELETE FROM app.uitrol_runs WHERE id = ANY($1)', [runIds]).catch(() => undefined);
  }
  return einde();
}
