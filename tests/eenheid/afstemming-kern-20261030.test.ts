// AFSTEMMING vNEXT — KERN (30.10.2026, UI-014, backend/afstemming-kern.ts + backend/afstemming-opslag.ts, contract
// shared/afstemming-model.ts). Tegen de ECHTE Postgres (app.records), zonder stubs van de db-laag.
//
// WAT DEZE TEST VASTHOUDT:
//   1. DE POORT. Geen sessie → 401; verkeerde dienst → OWNER_CLOUD_SESSION_REQUIRED; geen eigenaar → ACCOUNT_NOT_APPROVED.
//   2. LEGACY-SEED. Precies 25 kaarten uit backend/waarheid-claims.ts, idempotent; de gezondheidsmap verhoogt NOOIT de
//      bewijslaag: «confirmed» zonder qa/ogen blijft unknown, mét automated_qa wordt working; alles start op fase approved.
//   3. VOORSTEL. Idempotentiesleutel, KRT-nummering, bezette/kapotte externId, agentvoorstel blijft concept.
//   4. WIJZIG. Versieconflict → 409 mét de verse kaart; nieuwe revisie + diff toont precies de veranderde velden;
//      eigen notitie verandert zonder revisie; criteria houden hun stand bij een tekstwijziging van andere criteria.
//   5. GESCHIEDENIS. Append-only: na drie mutaties is de oudste gebeurtenis byte voor byte dezelfde.
//   6. FASE/CRITERIUM/BEWIJS. production_verified alleen mét geslaagd production-bewijs; accepted alleen daarna;
//      alsAgent → AGENT_MAG_NIET; criterium passed alleen mét geslaagd bewijsstuk.
//   7. IMPORT. Het voorbeeld-JSON uit het dossier parseert (4 criteria); md/txt; te groot; kapotte JSON; idempotente
//      herhaling (bestaand + hergebruikt); vergelijkbaar vindt lexicale buren.
//   8. KARTOTHEEK. Zoeken, filters, sorteren, paginering voorbij de oude afkap (120 kaarten → 2 pagina's).
//   9. ANDERMANS. Een tweede eigenaar heeft zijn eigen seed en ziet kaart A niet.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { getPool } from '../../server/platform/pg';
import { afstemmingKernRoutes } from '../../backend/afstemming-kern';
import { legacyGezondheid } from '../../backend/afstemming-opslag';
import { WAARHEID_CLAIMS } from '../../backend/waarheid-claims';
import { AFSTEMMING_LIMIETEN as LIMIET } from '../../shared/afstemming-model';
import { checker } from './hulp/nep-google';

type Routes = ReturnType<typeof afstemmingKernRoutes>;
type Antw = { status: number; uit: Record<string, any> };

export async function main(): Promise<number> {
  const { check, einde } = checker('afstemming-kern-20261030');
  // INTEG-001: het dossiervoorbeeld (sectie 7, feature-UI-014-example.json uit het dossier «UI-014 Afstemming vNext») staat NIET in de
  // repository. Wie het heeft, geeft het pad mee in AFSTEMMING_VOORBEELD_PAD. Ontbreekt het, dan melden we dat luid en slaan alleen de
  // controles over die het nodig hebben; alle andere controles blijven actief.
  // SEC-002 (slot x, SEC002-SECR-01): vroeger stond hier een vast pad naar de werkmap van een agent (met sessie-id) — weg.
  const voorbeeldPad = String(process.env.AFSTEMMING_VOORBEELD_PAD || '');
  const heeftVoorbeeld = !!voorbeeldPad && existsSync(voorbeeldPad);
  if (!heeftVoorbeeld) console.log(`OVERGESLAGEN afstemming-kern: fixture ontbreekt (zet AFSTEMMING_VOORBEELD_PAD op feature-UI-014-example.json)${voorbeeldPad ? ` — niet gevonden: ${voorbeeldPad}` : ''}`);
  // Deze test draait tegen de echte Postgres (zonder stubs); zonder database is er niets te controleren (zelfde stijl als agent-namens).
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN afstemming-kern (integratie): geen database'); return einde(); }
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  // In de db staan de testmensen als 'member' (app.records staat maar één echte owner-rij toe — records_een_eigenaar);
  // de ROUTE vertrouwt de sessie, en die stub geeft hieronder role 'owner'. De scheiding loopt via ownerUserId.
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`afk-a-${sfx}@eenheid.test`);
  const b = await mk(`afk-b-${sfx}@eenheid.test`);
  const maak = (id: string, service = 'api', role = 'owner') => afstemmingKernRoutes(async () => ({ user: { id, role, status: 'approved', email: `x-${sfx}@t` }, service }));
  const rA = maak(a);
  const rB = maak(b);
  const roep = async (routes: Routes, pad: string, body: Record<string, unknown> = {}): Promise<Antw> => {
    const res = await (routes[`POST /api/owner/afstemming/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} });
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };
  try {
    // ================================================================ 1. de poort
    const dicht = afstemmingKernRoutes(async () => ({ errorCode: 'UNAUTHORIZED' }));
    check('zonder sessie → 401', await roep(dicht, 'overzicht').then((r) => r.status === 401));
    check('verkeerde dienst (cloud) → OWNER_CLOUD_SESSION_REQUIRED', (await roep(maak(a, 'cloud'), 'overzicht')).uit.error === 'OWNER_CLOUD_SESSION_REQUIRED');
    check('geen eigenaar → ACCOUNT_NOT_APPROVED', (await roep(maak(a, 'api', 'member'), 'overzicht')).uit.error === 'ACCOUNT_NOT_APPROVED');

    // ================================================================ 2. legacy-seed (25 claims, idempotent, geen upgrade)
    const ov1 = await roep(rA, 'overzicht');
    check('eerste overzicht zaait precies 25 legacy-kaarten', ov1.status === 200 && ov1.uit.tellers.kaarten === 25);
    const ov2 = await roep(rA, 'overzicht');
    check('tweede aanroep zaait NIET opnieuw (idempotent)', ov2.uit.tellers.kaarten === 25);
    const alle25 = await roep(rA, 'kaarten', { sorteer: 'titel' });
    check('kartotheek: totaal 25, categorie legacy-matrix aanwezig', alle25.uit.totaal === 25 && alle25.uit.categorieen.includes('legacy-matrix'));
    const perExtern = new Map<string, Record<string, any>>((alle25.uit.kaarten as Array<Record<string, any>>).map((k) => [k.externId, k]));
    check('alle 25 dragen claim_id als externId en fase approved (ooit besloten, nooit meer dan dat)', WAARHEID_CLAIMS.every((c) => perExtern.get(c.claim_id)?.levensfase === 'approved'));
    const can1 = perExtern.get('CAN-001');
    check('CAN-001 (confirmed, alleen source/ui): gezondheid blijft UNKNOWN — geen stilzwijgende upgrade', can1?.gezondheid === 'unknown' && can1?.legacy?.classificatie === 'confirmed_in_canonical');
    const metQa = WAARHEID_CLAIMS.find((c) => c.classification === 'confirmed_in_canonical' && c.evidence_layer.includes('automated_qa'));
    check('confirmed mét automated_qa → working (de enige toegestane «werkt»)', !!metQa && perExtern.get(metQa.claim_id)?.gezondheid === 'working');
    check('gezondheidsmap puur: partial/missing/archief/regressed/deprecated', legacyGezondheid('partial', []) === 'partially_working' && legacyGezondheid('missing', []) === 'not_implemented' && legacyGezondheid('present_only_in_archive', []) === 'not_implemented' && legacyGezondheid('regressed', []) === 'regressed' && legacyGezondheid('deprecated', []) === 'obsolete' && legacyGezondheid('confirmed_in_canonical', ['owner_browser_verified']) === 'working');
    check('legacy kreeg GEEN bewijsstukken (bewijslaag is informatie, geen bewijs)', (alle25.uit.kaarten as Array<Record<string, any>>).every((k) => k.bewijs === 0));
    const legacyDetail = await roep(rA, 'kaart', { id: can1!.id });
    check('legacy-kaart: dossier met revisie 1 en de bron in provenance', legacyDetail.uit.revisie.nummer === 1 && legacyDetail.uit.kaart.provenance === 'waarheid-matrix-26.10.2026');

    // ================================================================ 3. voorstel
    check('lege titel → TITEL_ONGELDIG', (await roep(rA, 'voorstel', { titel: '  ' })).uit.error === 'TITEL_ONGELDIG');
    const v1 = await roep(rA, 'voorstel', { titel: ['Нічний режим для пошти', 'Nachtmodus voor e-mail'], samenvatting: 'Темна тема листів', dienst: 'mail', categorie: 'інтерфейс', prioriteit: 'P1', criteria: [{ id: 'AC-1', tekst: 'перемикач у налаштуваннях', verificatie: 'e2e' }, { tekst: 'лист читається в темному', verificatie: 'production' }], idempotentie: `idem-${sfx}` });
    check('voorstel: concept met KRT-nummer, 2 criteria, versie 1', v1.status === 200 && v1.uit.kaart.levensfase === 'draft' && /^KRT-\d{3}$/.test(v1.uit.kaart.externId) && v1.uit.kaart.criteriaTotaal === 2 && v1.uit.kaart.versie === 1);
    const k1 = v1.uit.kaart;
    check('zelfde idempotentiesleutel → dezelfde kaart, geen duplicaat', (await roep(rA, 'voorstel', { titel: 'Інша назва', idempotentie: `idem-${sfx}` })).uit.kaart.id === k1.id);
    check('bezette externId → IDEMPOTENTIE_BOTSING', (await roep(rA, 'voorstel', { titel: 'X-тест', externId: 'CAN-001' })).uit.error === 'IDEMPOTENTIE_BOTSING');
    check('kapotte externId (begint met cijfer) → EXTERNID_ONGELDIG', (await roep(rA, 'voorstel', { titel: 'X-тест', externId: '1X' })).uit.error === 'EXTERNID_ONGELDIG');
    const vAgent = await roep(rA, 'voorstel', { titel: 'Агентська пропозиція: експорт у CSV', bron: 'agent' });
    check('agentvoorstel: bronSoort agent, blijft CONCEPT (keuren doet de mens)', vAgent.uit.kaart.bronSoort === 'agent' && vAgent.uit.kaart.levensfase === 'draft');
    const gAgent = await roep(rA, 'geschiedenis', { id: vAgent.uit.kaart.id });
    check('de gebeurtenis van het agentvoorstel draagt actor agent', gAgent.uit.gebeurtenissen[0]?.actor?.soort === 'agent' && gAgent.uit.gebeurtenissen[0]?.soort === 'voorgesteld');

    // ================================================================ 4. wijzig: 409, revisies, diff, notitie, criteria-stand
    const fout409 = await roep(rA, 'wijzig', { id: k1.id, versie: 99, velden: { titel: 'X' } });
    check('verkeerde versie → 409 VERSIE_CONFLICT mét de verse kaart', fout409.status === 409 && fout409.uit.error === 'VERSIE_CONFLICT' && fout409.uit.huidig.versie === 1);
    const w1 = await roep(rA, 'wijzig', { id: k1.id, versie: 1, velden: { titel: ['Нічний режим пошти й календаря', 'Nachtmodus voor e-mail en agenda'], prioriteit: 'P0' } });
    check('wijzig: revisie 2, versie omhoog, snapshot bijgewerkt', w1.status === 200 && w1.uit.revisie.nummer === 2 && w1.uit.kaart.revisieNummer === 2 && w1.uit.kaart.versie === 2 && w1.uit.kaart.prioriteit === 'P0');
    const rev1 = legacyDetail.uit.revisie.id ? (await roep(rA, 'kaart', { id: k1.id })).uit : null;
    const detail1 = await roep(rA, 'kaart', { id: k1.id });
    const diff = await roep(rA, 'verschil', { id: k1.id, revisieA: w1.uit.revisie.ouderId, revisieB: w1.uit.revisie.id });
    check('diff tussen rev1 en rev2: precies titel en prioriteit veranderd', diff.uit.velden.length === 2 && diff.uit.velden.some((v: any) => v.veld === 'titel') && diff.uit.velden.some((v: any) => v.veld === 'prioriteit'));
    const wN = await roep(rA, 'wijzig', { id: k1.id, versie: 2, velden: { eigenNotitie: 'моя нотатка: перевірити на телефоні' } });
    check('eigen notitie: GEEN nieuwe revisie, wel versie en gebeurtenis «notitie»', wN.uit.kaart.revisieNummer === 2 && wN.uit.kaart.versie === 3 && wN.uit.kaart.eigenNotitie?.includes('телефоні'));
    check('lege wijziging (geen velden) → TITEL_ONGELDIG', (await roep(rA, 'wijzig', { id: k1.id, versie: 3, velden: {} })).uit.error === 'TITEL_ONGELDIG');
    check('onbekende kaart → 404 KAART_ONBEKEND', await roep(rA, 'wijzig', { id: randomUUID(), versie: 1, velden: { titel: 'x' } }).then((r) => r.status === 404 && r.uit.error === 'KAART_ONBEKEND'));

    // ================================================================ 5. bewijs + criterium + fase (de eerlijke assen)
    const bSlecht = await roep(rA, 'bewijs', { kaartId: k1.id, soort: 'gevoel', omgeving: 'production', verwijzing: 'x', resultaat: 'geslaagd' });
    check('onbekende bewijssoort → BEWIJS_ONGELDIG', bSlecht.uit.error === 'BEWIJS_ONGELDIG');
    const bMislukt = await roep(rA, 'bewijs', { kaartId: k1.id, criteriumId: 'AC-1', soort: 'e2e', omgeving: 'staging', verwijzing: `tests/e2e/x-${sfx}.ts`, resultaat: 'mislukt' });
    check('bewijs (mislukt, staging) hangt aan de kaart; teller bewijs = 1', bMislukt.status === 200 && (await roep(rA, 'kaart', { id: k1.id })).uit.kaart.bewijs === 1);
    check('criterium passed ZONDER bewijs → BEWIJS_VEREIST', (await roep(rA, 'criterium', { id: k1.id, versie: 4, criteriumId: 'AC-1', stand: 'passed' })).uit.error === 'BEWIJS_VEREIST');
    check('criterium passed met MISLUKT bewijs → BEWIJS_VEREIST', (await roep(rA, 'criterium', { id: k1.id, versie: 4, criteriumId: 'AC-1', stand: 'passed', bewijsId: bMislukt.uit.stuk.id })).uit.error === 'BEWIJS_VEREIST');
    const bGoed = await roep(rA, 'bewijs', { kaartId: k1.id, criteriumId: 'AC-1', soort: 'e2e', omgeving: 'production', verwijzing: `e2e-run-${sfx}`, resultaat: 'geslaagd', bron: 'agent' });
    check('agent mag bewijs aanhechten; het stuk draagt actor agent', bGoed.status === 200 && bGoed.uit.stuk.door.soort === 'agent');
    const krit = await roep(rA, 'criterium', { id: k1.id, versie: 5, criteriumId: 'AC-1', stand: 'passed', bewijsId: bGoed.uit.stuk.id });
    check('criterium passed mét geslaagd bewijs → AC-teller 1/2', krit.status === 200 && krit.uit.kaart.criteriaGeslaagd === 1 && krit.uit.kaart.criteriaTotaal === 2);
    check('onbekend criterium → 404', await roep(rA, 'criterium', { id: k1.id, versie: 6, criteriumId: 'AC-9', stand: 'failed' }).then((r) => r.status === 404));
    check('kapotte stand → STAND_ONGELDIG', (await roep(rA, 'criterium', { id: k1.id, versie: 6, criteriumId: 'AC-1', stand: 'done' })).uit.error === 'STAND_ONGELDIG');
    // criteria-stand blijft behouden bij een tekstwijziging van een ANDER criterium
    const wC = await roep(rA, 'wijzig', { id: k1.id, versie: 6, velden: { criteria: [{ id: 'AC-1', tekst: 'перемикач у налаштуваннях', verificatie: 'e2e' }, { id: 'C-2', tekst: 'лист читається в темному — оновлений текст', verificatie: 'production' }] } });
    check('revisie met criteriawijziging: stand van AC-1 (passed) blijft staan', wC.status === 200 && wC.uit.kaart.criteriaGeslaagd === 1);
    // fase-as
    const vers = () => roep(rA, 'kaart', { id: k1.id }).then((r) => r.uit.kaart.versie as number);
    check('fase production_verified: bewijs is er (e2e/production/geslaagd) → mag', (await roep(rA, 'fase', { id: k1.id, versie: await vers(), fase: 'production_verified' })).uit.kaart?.levensfase === 'production_verified');
    const vKaal = await roep(rA, 'voorstel', { titel: 'Кандидат без доказів' });
    check('production_verified ZONDER production-bewijs → FASE_BEWIJS_ONTBREEKT', (await roep(rA, 'fase', { id: vKaal.uit.kaart.id, versie: 1, fase: 'production_verified' })).uit.error === 'FASE_BEWIJS_ONTBREEKT');
    check('accepted vóór production_verified → FASE_ONGELDIG', (await roep(rA, 'fase', { id: vKaal.uit.kaart.id, versie: 1, fase: 'accepted' })).uit.error === 'FASE_ONGELDIG');
    check('accepted ná production_verified → mag (eigenaarsbesluit)', (await roep(rA, 'fase', { id: k1.id, versie: await vers(), fase: 'accepted', reden: 'подивився на телефоні' })).uit.kaart?.levensfase === 'accepted');
    check('alsAgent + goedkeuren → AGENT_MAG_NIET', (await roep(rA, 'fase', { id: vKaal.uit.kaart.id, versie: 1, fase: 'approved', alsAgent: true })).uit.error === 'AGENT_MAG_NIET');
    check('alsAgent + production_verified → AGENT_MAG_NIET (succes verklaart een agent nooit zelf)', (await roep(rA, 'fase', { id: k1.id, versie: await vers(), fase: 'production_verified', alsAgent: true })).uit.error === 'AGENT_MAG_NIET');
    check('onbestaande fase → FASE_ONGELDIG', (await roep(rA, 'fase', { id: k1.id, versie: await vers(), fase: 'klaar' })).uit.error === 'FASE_ONGELDIG');

    // ================================================================ 6. geschiedenis is append-only
    const g1 = await roep(rA, 'geschiedenis', { id: k1.id });
    const oudste1 = g1.uit.gebeurtenissen[g1.uit.gebeurtenissen.length - 1];
    check('geschiedenis: nieuwste eerst, oudste is «voorgesteld»', g1.uit.gebeurtenissen.length >= 8 && oudste1.soort === 'voorgesteld');
    await roep(rA, 'wijzig', { id: k1.id, versie: await vers(), velden: { samenvatting: 'Темна тема листів і календаря' } });
    const g2 = await roep(rA, 'geschiedenis', { id: k1.id });
    const oudste2 = g2.uit.gebeurtenissen[g2.uit.gebeurtenissen.length - 1];
    check('na een nieuwe mutatie is de OUDSTE gebeurtenis byte voor byte dezelfde (append-only)', g2.uit.gebeurtenissen.length === g1.uit.gebeurtenissen.length + 1 && JSON.stringify(oudste1) === JSON.stringify(oudste2));
    check('verschil met onbekende revisie → 404 REVISIE_ONBEKEND', await roep(rA, 'verschil', { id: k1.id, revisieA: randomUUID(), revisieB: w1.uit.revisie.id }).then((r) => r.status === 404));

    // ================================================================ 7. import
    if (heeftVoorbeeld) {
      const voorbeeldJson = readFileSync(voorbeeldPad, 'utf8');
      const impJ = await roep(rA, 'import', { actie: 'voorbeeld', naam: 'feature-UI-014-example.json', formaat: 'json', inhoud: voorbeeldJson });
      check('import-json (dossiervoorbeeld): titel uk, 4 criteria, P1, externId UI-014, criteria niet onzeker', impJ.status === 200 && impJ.uit.kaart.titel[0].includes('картотека') && impJ.uit.kaart.criteria.length === 4 && impJ.uit.kaart.prioriteit === 'P1' && impJ.uit.kaart.externId === 'UI-014' && !impJ.uit.onzeker.includes('criteria'));
      check('verificatie «integration + production» → integration (eerste bekende soort)', impJ.uit.kaart.criteria[1].verificatie === 'integration');
      const vast = await roep(rA, 'import', { actie: 'vastleggen', invoerHash: impJ.uit.invoerHash, kaart: impJ.uit.kaart });
      check('vastleggen: kaart UI-014, bronSoort import', vast.status === 200 && vast.uit.hergebruikt === false && vast.uit.kaart.externId === 'UI-014' && vast.uit.kaart.bronSoort === 'import');
      const vast2 = await roep(rA, 'import', { actie: 'vastleggen', invoerHash: impJ.uit.invoerHash, kaart: impJ.uit.kaart });
      check('zelfde invoer nóg eens vastleggen → hergebruikt, zelfde kaart (scenario 1 van het dossier)', vast2.uit.hergebruikt === true && vast2.uit.kaart.id === vast.uit.kaart.id);
      const impJ2 = await roep(rA, 'import', { actie: 'voorbeeld', naam: 'feature-UI-014-example.json', formaat: 'json', inhoud: voorbeeldJson });
      check('voorbeeld van dezelfde inhoud ná vastleggen → bestaand verwijst naar de kaart', impJ2.uit.bestaand?.kaartId === vast.uit.kaart.id);
      // De lexicale buur «UI-014» bestaat alleen als het voorbeeld hierboven is vastgelegd.
      const impVergelijk = await roep(rA, 'import', { actie: 'voorbeeld', naam: 'idee.txt', formaat: 'txt', inhoud: 'Розумна картотека можливостей для команди\nдодаткові деталі' });
      check('vergelijkbaar: lexicale buur (кartотека можливостей) gevonden met reden', impVergelijk.uit.vergelijkbaar.some((v: any) => v.externId === 'UI-014' && /спільні слова/.test(v.reden)));
    } else {
      console.log('OVERGESLAGEN afstemming-kern: 6 controles in sectie 7 (import-json, verificatie, vastleggen, hergebruik, bestaand, vergelijkbaar) en 1 in sectie 8 (zoeken op externId UI-014): fixture ontbreekt');
      // De teller «zonderBewijs» (sectie 9) telde in feite alleen de uit het voorbeeld vastgelegde kaart UI-014 (4 criteria, geen bewijs):
      // de legacy-kaarten hebben 0 criteria en k1 heeft bewijs. Zonder voorbeeld zorgt deze eigen kaart voor dezelfde voorwaarde,
      // zodat die controle actief blijft (en niet om een ontbrekend bestand faalt).
      const zonderBewijsKaart = await roep(rA, 'voorstel', { titel: 'Звіт із критеріями без жодного доказу', criteria: [{ tekst: 'критерій, який ще ніхто не перевірив', verificatie: 'e2e' }] });
      check('(zonder fixture) eigen kaart met 1 criterium en nog geen bewijs aangemaakt', zonderBewijsKaart.status === 200 && zonderBewijsKaart.uit.kaart.criteriaTotaal === 1 && zonderBewijsKaart.uit.kaart.bewijs === 0);
    }
    const impMd = await roep(rA, 'import', { actie: 'voorbeeld', naam: 'x.md', formaat: 'md', inhoud: '# Експорт звітів у PDF\n\nОдин клік — готовий файл.\n\n## Критерії\n- кнопка на сторінці звіту\n- файл відкривається в переглядачі\n' });
    check('import-md: titel uit #, samenvatting uit de eerste alinea, 2 criteria (owner)', impMd.uit.kaart.titel[0] === 'Експорт звітів у PDF' && impMd.uit.kaart.samenvatting[0].includes('Один клік') && impMd.uit.kaart.criteria.length === 2 && impMd.uit.kaart.criteria[0].verificatie === 'owner');
    const impTxt = await roep(rA, 'import', { actie: 'voorbeeld', naam: 'y.txt', formaat: 'txt', inhoud: 'Швидкий фільтр за теґами\nщоб не гортати все' });
    check('import-txt: eerste regel = titel; criteria eerlijk onzeker', impTxt.uit.kaart.titel[0] === 'Швидкий фільтр за теґами' && impTxt.uit.onzeker.includes('criteria'));
    check('te groot → IMPORT_TE_GROOT', (await roep(rA, 'import', { actie: 'voorbeeld', naam: 'g.txt', formaat: 'txt', inhoud: 'x'.repeat(LIMIET.importBytesMax + 1) })).uit.error === 'IMPORT_TE_GROOT');
    check('kapotte JSON → IMPORT_ONGELDIG (de ruwe tekst blijft bij de client)', (await roep(rA, 'import', { actie: 'voorbeeld', naam: 'k.json', formaat: 'json', inhoud: '{kapot' })).uit.error === 'IMPORT_ONGELDIG');
    check('pdf → FORMAAT_ONBEKEND (eerlijk gepland, geen stille parser)', (await roep(rA, 'import', { actie: 'voorbeeld', naam: 'z.pdf', inhoud: 'x' })).uit.error === 'FORMAAT_ONBEKEND');
    check('onbekende actie → ACTIE_ONGELDIG', (await roep(rA, 'import', { actie: 'x' })).uit.error === 'ACTIE_ONGELDIG');

    // ================================================================ 8. kartotheek: zoeken/filters/sorteren/pagina's
    for (let i = 0; i < 120; i++) await roep(rA, 'voorstel', { titel: `Масова картка ${String(i).padStart(3, '0')}`, categorie: 'bulk', dienst: 'mail' });
    const p1 = await roep(rA, 'kaarten', { categorie: 'bulk', sorteer: 'titel' });
    const p2 = await roep(rA, 'kaarten', { categorie: 'bulk', sorteer: 'titel', token: p1.uit.volgende });
    check('paginering voorbij de oude afkap: 120 → 100 + 20, totaal klopt, token sluit af', p1.uit.kaarten.length === 100 && p1.uit.volgende === '100' && p2.uit.kaarten.length === 20 && p2.uit.volgende === null && p1.uit.totaal === 120);
    check('pagina 1 en 2 overlappen niet', new Set([...p1.uit.kaarten, ...p2.uit.kaarten].map((k: any) => k.id)).size === 120);
    const zoek = await roep(rA, 'kaarten', { zoek: 'нічний режим' });
    check('zoeken (uk, hoofdletterongevoelig) vindt de kaart', zoek.uit.kaarten.some((k: any) => k.id === k1.id));
    if (heeftVoorbeeld) { // zoekt de kaart UI-014 die sectie 7 uit het dossiervoorbeeld vastlegde
      const zoekExtern = await roep(rA, 'kaarten', { zoek: 'ui-014' });
      check('zoeken op externId werkt', zoekExtern.uit.kaarten.some((k: any) => k.externId === 'UI-014'));
    }
    const faseFilter = await roep(rA, 'kaarten', { fase: 'accepted' });
    check('filter op fase: alleen de aanvaarde kaart', faseFilter.uit.totaal === 1 && faseFilter.uit.kaarten[0].id === k1.id);
    const gezFilter = await roep(rA, 'kaarten', { gezondheid: 'regressed' });
    check('filter op gezondheid regressed = de legacy-regressies', gezFilter.uit.kaarten.every((k: any) => k.gezondheid === 'regressed') && gezFilter.uit.totaal === WAARHEID_CLAIMS.filter((c) => c.classification === 'regressed').length);
    const prio = await roep(rA, 'kaarten', { sorteer: 'prioriteit' });
    check('sorteren op prioriteit: P0 bovenaan (zonder opgaaf oplopend)', prio.uit.kaarten[0].prioriteit === 'P0');
    const dienstF = await roep(rA, 'kaarten', { dienst: 'mail' });
    check('dienstfilter + dienstenlijst aanwezig', dienstF.uit.kaarten.every((k: any) => k.dienst === 'mail') && dienstF.uit.diensten.includes('mail'));

    // ================================================================ 9. overzicht-tellers en isolatie
    await roep(rA, 'fase', { id: vKaal.uit.kaart.id, versie: 1, fase: 'needs_review' });
    const ov3 = await roep(rA, 'overzicht');
    check('overzicht: aandacht bevat de kaart in needs_review; recent gevuld', ov3.uit.aandacht.some((k: any) => k.id === vKaal.uit.kaart.id) && ov3.uit.recent.length === 8);
    check('zonderBewijs telt kaarten met criteria zonder één bewijsstuk', ov3.uit.tellers.zonderBewijs >= 1);
    const ovB = await roep(rB, 'overzicht');
    check('tweede eigenaar: eigen seed (25), ziet kaart A niet', ovB.uit.tellers.kaarten === 25 && (await roep(rB, 'kaart', { id: k1.id })).status === 404);
    const kaartB = await roep(rB, 'kaarten', { categorie: 'bulk' });
    check('bulk-kaarten van A zijn onzichtbaar voor B', kaartB.uit.totaal === 0);
  } finally {
    for (const uid of [a, b]) {
      await pool.query(`DELETE FROM app.records WHERE tbl LIKE 'afstemming_%' AND data->>'ownerUserId' = $1`, [uid]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = $1`, [uid]).catch(() => undefined);
    }
  }
  return einde();
}
