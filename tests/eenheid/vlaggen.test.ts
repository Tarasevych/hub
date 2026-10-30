// Etap F (14.10.2026): feature flags. Pure berekening (shared/vlaggen.ts) en echte database + regels (backend/vlaggen.ts).
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import * as fl from '../../backend/vlaggen';
import { emmer, evalueer, type Vlag } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';

const tab = () => randomBytes(24).toString('hex');
async function code(p: Promise<unknown>) { try { await p; return 'OK'; } catch (e) { return e instanceof tp.TechFout ? e.code : `ANDERS:${(e as Error).message}`; } }
const bestanden = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? bestanden(p) : /\.(ts|tsx|mjs)$/.test(n) ? [p] : []; });

export async function main(): Promise<number> {
  const { check, einde } = checker('vlaggen');

  // ---------------------------------------------------------------- pure berekening
  const v = (x: Partial<Vlag> = {}): Vlag => ({ sleutel: 'proef', omschrijving: '', aan: true, standaard: false, percentage: 0, gebruikers: [], ...x });
  check('onbekende vlag: false, ERROR / FLAG_NOT_FOUND', (() => { const r = evalueer('weg', undefined, 'u1'); return r.value === false && r.reason === 'ERROR' && r.errorCode === 'FLAG_NOT_FOUND'; })());
  check('hoofdschakelaar uit: false, DISABLED (ook voor iemand in de lijst)', (() => { const r = evalueer('proef', v({ aan: false, gebruikers: ['u1'], standaard: true }), 'u1'); return r.value === false && r.reason === 'DISABLED'; })());
  check('in de lijst: true, TARGETING_MATCH', evalueer('proef', v({ gebruikers: ['u1'] }), 'u1').reason === 'TARGETING_MATCH' && evalueer('proef', v({ gebruikers: ['u1'] }), 'u1').value === true);
  check('standaard zonder uitrol: STATIC met de standaardwaarde', evalueer('proef', v({ standaard: true }), 'x').value === true && evalueer('proef', v(), 'x').value === false && evalueer('proef', v(), 'x').reason === 'STATIC');
  check('test van de tester wint, ook als de vlag uit staat', (() => { const r = evalueer('proef', v({ aan: false }), 'u1', true); return r.value === true && r.reason === 'TARGETING_MATCH' && r.metadata?.test === true; })());
  const ids = Array.from({ length: 2000 }, (_, i) => `gebruiker-${i}`);
  const aan30 = ids.filter((id) => evalueer('proef', v({ percentage: 30 }), id).value);
  check('30 %: ongeveer 30 % van 2000 gebruikers (25–35 %)', aan30.length > 500 && aan30.length < 700, String(aan30.length));
  check('emmer is vast: zelfde gebruiker, zelfde uitkomst', ids.slice(0, 50).every((id) => emmer('proef', id) === emmer('proef', id)));
  check('30 → 40 %: niemand verliest de functie', aan30.every((id) => evalueer('proef', v({ percentage: 40 }), id).value));
  check('andere vlag, andere emmer (niet steeds dezelfde mensen eerst)', ids.filter((id) => (emmer('proef', id) < 30) !== (emmer('ander', id) < 30)).length > 300);
  check('100 %: iedereen; 0 %: standaard', ids.every((id) => evalueer('proef', v({ percentage: 100 }), id).value) && ids.every((id) => evalueer('proef', v({ percentage: 0 }), id).reason === 'STATIC'));

  // ---------------------------------------------------------------- een vlag is nooit een recht
  const importeurs = [...bestanden('backend'), ...bestanden('server'), ...bestanden('shared')].filter((p) => /from ['"][./]*(?:\.\.\/)*(?:shared\/)?vlaggen['"]|from ['"]\.\/vlaggen['"]|from ['"]\.\.\/shared\/vlaggen['"]/.test(readFileSync(p, 'utf8')));
  check('alleen backend/index.ts (routes) importeert backend/vlaggen; geen autorisatiemodule', importeurs.every((p) => ['backend/index.ts', 'backend/vlaggen.ts'].includes(p.replace(/\\/g, '/'))), importeurs.join(', '));

  // ---------------------------------------------------------------- database en regels
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'user', status = 'approved') => { const id = randomUUID(); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status, name: 'Тест' }]); return { id, email, role, status }; };
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eig = bestaand ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' } : await mk(String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'), 'owner');
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  const eigProfielVooraf = (await sys.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows.length;
  const beh = await mk(`vlag-beh-${sfx}@eenheid.test`), tes = await mk(`vlag-tes-${sfx}@eenheid.test`), klant = await mk(`vlag-klant-${sfx}@eenheid.test`);
  const users = [beh.id, tes.id, klant.id];
  const sleutel = `proef-${sfx}`;
  try {
    const tE = tab(), tB = tab(), tT = tab();
    await tp.activeren(eig, tE, 60, 'vlaggen');
    await tp.toekennen(eig, tE, { email: beh.email, rollen: ['beheerder'], maxMinuten: 60 });
    await tp.toekennen(eig, tE, { email: tes.email, rollen: ['tester'], maxMinuten: 240 });
    check('zonder actief technisch profiel: geen lijst', (await code(fl.beheerLijst(beh, tB))) === 'TECH_FLAGS_VEREIST');
    await tp.activeren(beh, tB, 60, 'vlag maken');
    await tp.activeren(tes, tT, 30, 'vlag testen');
    check('tester kan niet aanmaken', (await code(fl.zetten(tes, tT, { sleutel, aan: true, gebruikers: [] }))) === 'TECH_FLAGS_BEHEER_VEREIST');
    check('ongeldige sleutel geweigerd', (await code(fl.zetten(beh, tB, { sleutel: 'Hoofd LETTERS', aan: true, gebruikers: [] }))) === 'SLEUTEL_ONGELDIG');
    check('onbekende gebruiker in de lijst geweigerd (met adres)', (await code(fl.zetten(beh, tB, { sleutel, aan: true, gebruikers: [`niemand-${sfx}@eenheid.test`] }))) === `GEBRUIKER_NIET_GEVONDEN:niemand-${sfx}@eenheid.test`);
    check('percentage buiten 0–100 geweigerd', (await code(fl.zetten(beh, tB, { sleutel, aan: true, percentage: 150, gebruikers: [] }))) === 'PERCENTAGE_ONGELDIG');
    const na = await fl.zetten(beh, tB, { sleutel, omschrijving: 'нова функція', aan: true, standaard: false, percentage: 0, gebruikers: [klant.email.toUpperCase()] });
    const rij = na.vlaggen.find((x) => x.sleutel === sleutel);
    check('beheerder maakt aan; e-mail wordt id, lijst toont het adres', !!rij && rij.gebruikers.includes(klant.email) && (await sys.query('SELECT gebruikers FROM app.feature_flags WHERE sleutel=$1', [sleutel])).rows[0].gebruikers[0] === klant.id);
    const voor = async (u: { id: string }) => (await fl.berekenen(u as never, [sleutel]))[0];
    check('klant in de lijst: aan; tester niet: uit', (await voor(klant)).value === true && (await voor(tes)).value === false);
    check('berekenen geeft alleen eigen waarden (user uit de sessie)', (await fl.berekenen(tes as never, [sleutel, `weg-${sfx}`]))[1].errorCode === 'FLAG_NOT_FOUND');
    const lt = await fl.beheerLijst(tes, tT);
    check('tester ziet de vlag, maar niet wie in de lijst staat', lt.magTesten && !lt.magBeheren && lt.vlaggen.find((x) => x.sleutel === sleutel)?.gebruikers.length === 0 && lt.vlaggen.find((x) => x.sleutel === sleutel)?.aantalGebruikers === 1);
    check('beheerder (zonder flags.test) kan niet testen', (await code(fl.testen(beh, tB, sleutel, true))) === 'TECH_FLAGS_TEST_VEREIST');
    await fl.testen(tes, tT, sleutel, true);
    check('tester zet de vlag voor zichzelf aan', (await voor(tes)).value === true && (await voor(tes)).metadata?.test === true);
    check('test geldt alleen voor de tester (klant buiten de lijst blijft zoals de regels zeggen)', (await fl.berekenen({ id: randomUUID() } as never, [sleutel]))[0].value === false);
    const tot = (await sys.query('SELECT tot FROM app.feature_flag_tests WHERE user_id=$1 AND sleutel=$2', [tes.id, sleutel])).rows[0]?.tot;
    const act = await tp.actieveActivatie(tes.id, tT);
    check('test loopt tot het einde van het technisch profiel', !!tot && Math.abs(new Date(tot).getTime() - (act?.eind ?? 0)) < 2000);
    await sys.query(`UPDATE app.feature_flag_tests SET gezet_op = now() - interval '2 hours', tot = now() - interval '1 minute' WHERE user_id=$1`, [tes.id]);
    check('na het einde telt de test niet meer', (await voor(tes)).value === false);
    check('database: test langer dan 8 uur onmogelijk', await sys.query(`UPDATE app.feature_flag_tests SET gezet_op = now(), tot = now() + interval '9 hours' WHERE user_id=$1`, [tes.id]).then((r) => (r.rowCount ?? 0) === 0, () => true));
    await fl.testen(tes, tT, sleutel, false);
    await fl.testen(tes, tT, sleutel, null);
    check('test weghalen (null)', (await sys.query('SELECT 1 FROM app.feature_flag_tests WHERE user_id=$1', [tes.id])).rows.length === 0);
    await fl.zetten(beh, tB, { sleutel, omschrijving: 'нова функція', aan: false, gebruikers: [klant.email] });
    check('hoofdschakelaar uit: ook voor de klant in de lijst uit', (await voor(klant)).value === false && (await voor(klant)).reason === 'DISABLED');
    await tp.beeindigen(beh, tB);
    check('technisch profiel uit: niets meer wijzigen', (await code(fl.zetten(beh, tB, { sleutel, aan: true, gebruikers: [] }))) === 'TECH_FLAGS_BEHEER_VEREIST');
    check('eigenaar (in profiel) mag beheren én testen', await fl.beheerLijst(eig, tE).then((l) => l.magBeheren && l.magTesten));
    // 20261028: «Тест: так» gaf «Internal server error» bij een profiel «tot uitloggen» (technisch einde over 366 dagen > CHECK van 8 uur).
    const tLang = tab();
    await tp.activeren(eig, tLang, 0, 'tot uitloggen');
    check('profiel «tot uitloggen»: eigen keuze lukt (geen databasefout)', (await code(fl.testen(eig, tLang, sleutel, true))) === 'OK');
    const totLang = (await sys.query('SELECT tot FROM app.feature_flag_tests WHERE user_id=$1 AND sleutel=$2', [eig.id, sleutel])).rows[0]?.tot;
    check('eigen keuze loopt hoogstens 8 uur', !!totLang && new Date(totLang).getTime() <= Date.now() + 8 * 3600_000, String(totLang));
    check('lijst: testTot hoogstens 8 uur, rollen meegestuurd', await fl.beheerLijst(eig, tLang).then((l) => l.testTot <= Date.now() + 8 * 3600_000 && Array.isArray(l.rollen)));
    await fl.testen(eig, tLang, sleutel, null);
    await tp.beeindigen(eig, tLang);
    check('sessie niet meer actief: eigen code, niet «rol mist recht»', (await code(fl.testen(eig, tLang, sleutel, true))) === 'TECH_PROFIEL_NIET_ACTIEF');
    check('testEinde: korte sessie blijft, lange wordt 8 uur min marge', fl.testEinde(1000, 0) === 1000 && fl.testEinde(1e15, 0) === fl.TEST_MAX_MS);
    const ruw = fl.flagsRoutes(async () => ({ user: { id: 'x', status: 'approved' } as never, service: 'hub' }))['POST /api/beheer/flags'][0] as unknown as (c: unknown) => Promise<{ statusCode?: number; status?: number; body?: string }>;
    const antwoord = await ruw({ event: {}, body: { tabContext: tab() } }).catch((e) => ({ gegooid: String(e) }));
    check('onverwachte fout in een route: vaste code VLAG_SERVERFOUT, geen kale 500-tekst', JSON.stringify(antwoord).includes('TECH_FLAGS_VEREIST') || JSON.stringify(antwoord).includes('VLAG_SERVERFOUT'), JSON.stringify(antwoord).slice(0, 200));
    // ---------------------------------------------------------------- standen in gewone woorden + archief (herontwerp 20261028)
    const st = (stand: string, extra: Record<string, unknown> = {}) => fl.standZetten(eig, tE, { sleutel, stand, ...extra });
    const rijVan = async () => (await fl.beheerLijst(eig, tE)).vlaggen.find((x) => x.sleutel === sleutel)!;
    const vreemd = { id: randomUUID() };
    check('tester kan geen stand zetten', (await code(fl.standZetten(tes, tT, { sleutel, stand: 'alle' }))) === 'TECH_FLAGS_BEHEER_VEREIST');
    check('onbekende stand geweigerd', (await code(st('soms'))) === 'STAND_ONGELDIG');
    await st('alle');
    check('«Для всіх»: iedereen aan, voorIedereen', (await fl.berekenen(vreemd as never, [sleutel]))[0].value === true && (await rijVan()).voorIedereen === true);
    await fl.archiveren(eig, tE, sleutel, true);
    check('archief: gemarkeerd, waarde voor iedereen ongewijzigd', (await rijVan()).gearchiveerd === true && (await fl.berekenen(vreemd as never, [sleutel]))[0].value === true);
    await st('uit');
    check('«Вимкнено для всіх»: iedereen uit, ook de lijst; uit het archief', (await voor(klant)).value === false && (await fl.berekenen(vreemd as never, [sleutel]))[0].value === false && (await rijVan()).gearchiveerd === false);
    check('archief kan alleen bij «voor iedereen»', (await code(fl.archiveren(eig, tE, sleutel, true))) === 'ARCHIEF_ALLEEN_VOOR_IEDEREEN');
    await st('mij');
    check('«Тільки для мене»: eigenaar aan, anderen uit, alleenIk', (await voor(eig)).value === true && (await voor(klant)).value === false && (await rijVan()).alleenIk === true);
    check('«Для вибраних»: lege lijst geweigerd', (await code(st('lijst', { gebruikers: [] }))) === 'LIJST_LEEG');
    await st('lijst', { gebruikers: [klant.email] });
    check('«Для вибраних»: klant aan, eigenaar en vreemde uit', (await voor(klant)).value === true && (await voor(eig)).value === false && (await fl.berekenen(vreemd as never, [sleutel]))[0].value === false);
    check('«Для частини»: 0 en 100 geweigerd (daarvoor zijn uit/alle)', (await code(st('deel', { percentage: 0 }))) === 'PERCENTAGE_ONGELDIG' && (await code(st('deel', { percentage: 100 }))) === 'PERCENTAGE_ONGELDIG');
    await st('deel', { percentage: 30 });
    const r30 = await rijVan();
    check('«Для частини»: 30 %, lijst blijft, niet voor iedereen', r30.percentage === 30 && r30.aantalGebruikers === 1 && r30.voorIedereen === false && (await voor(klant)).value === true);
    await st('alle'); await fl.archiveren(eig, tE, sleutel, true); await fl.archiveren(eig, tE, sleutel, false);
    check('terug uit archief', (await rijVan()).gearchiveerd === false);
    await fl.archiveren(eig, tE, sleutel, true);
    await fl.zetten(eig, tE, { sleutel, omschrijving: 'x', aan: true, standaard: false, percentage: 10, gebruikers: [] });
    check('oud formulier «zetten» naar niet-voor-iedereen haalt uit het archief', (await rijVan()).gearchiveerd === false);
    const acties2 = (await sys.query(`SELECT DISTINCT action FROM app.audit WHERE details->>'sleutel' = $1`, [sleutel])).rows.map((r) => r.action);
    check('logboek: stand en archief', acties2.includes('owner.flags.stand') && acties2.includes('owner.flags.archief'));
    const app = await getPool('app').query('SELECT * FROM app.feature_flags').then(() => 'gelezen', (e) => String(e.code));
    check('app-rol kan de vlaggen niet lezen (lijsten bevatten gebruikers-id\'s)', app === '42501', app);
    await fl.verwijderen(eig, tE, sleutel);
    check('verwijderen; daarna: onbekend = uit', (await voor(klant)).errorCode === 'FLAG_NOT_FOUND');
    const acties = (await sys.query(`SELECT DISTINCT action FROM app.audit WHERE details->>'sleutel' = $1`, [sleutel])).rows.map((r) => r.action).sort();
    check('logboek: gewijzigd, getest, verwijderd', ['owner.flags.gewijzigd', 'owner.flags.getest', 'owner.flags.verwijderd'].every((a) => acties.includes(a)), acties.join(','));
    const routes = fl.flagsRoutes(async () => ({ errorCode: 'X' }));
    check('routes: eigen waarden, OFREP (lijst en één), beheer', ['POST /api/flags', 'POST /api/ofrep/v1/evaluate/flags', 'POST /api/ofrep/v1/evaluate/flags/:key', 'POST /api/beheer/flags', 'POST /api/beheer/flags/zetten', 'POST /api/beheer/flags/verwijderen', 'POST /api/beheer/flags/test', 'POST /api/beheer/flags/stand', 'POST /api/beheer/flags/archief'].every((k) => k in routes));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [sleutel]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [eigProfielVooraf ? users : [...users, eig.id]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [eigProfielVooraf ? users : [...users, eig.id]]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [users]).catch(() => undefined);
  }
  return einde();
}
