// Technisch profiel (13.10.2026): rollen en plafonds, band-contrast, en de serverregels in backend/tech-profiel.ts
// (activeren per tabblad, verlopen, toekennen/intrekken alleen binnen de eigen rollen, eigenaar onaantastbaar, RLS op de tabellen).
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { BAND_KLEUREN, TECH_ROLLEN, contrast, maxMinutenVoor, mogelijkhedenVan } from '../../shared/tech-rollen';
import * as tp from '../../backend/tech-profiel';
import { checker } from './hulp/nep-google';

const tab = () => randomBytes(24).toString('hex');
async function codeVan(p: Promise<unknown>): Promise<string> { try { await p; return 'OK'; } catch (e) { return e instanceof tp.TechFout ? e.code : `ANDERS:${(e as Error).message}`; } }

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-profiel');

  // ---------------------------------------------------------------- gedeelde regels
  const slecht = Object.entries(BAND_KLEUREN).filter(([, k]) => contrast(k.bg, k.fg) < 4.5).map(([id, k]) => `${id}:${contrast(k.bg, k.fg).toFixed(2)}`);
  check('band: elke kleur haalt WCAG-contrast ≥ 4.5', slecht.length === 0, slecht.join(','));
  check('band: rood is niet kiesbaar (voorbehouden aan «від імені»)', !Object.keys(BAND_KLEUREN).some((k) => /rood|red/.test(k)));
  check('plafond: strengste rol beslist, minimaal 15', maxMinutenVoor(['tester'], 480) === 480 && maxMinutenVoor(['tester', 'beheerder'], 480) === 60 && maxMinutenVoor(['auditor'], 30) === 30 && maxMinutenVoor(['beheerder'], 5) === 15);
  check('alleen beheerder en eigenaar mogen delegeren', TECH_ROLLEN.filter((r) => r.mogelijkheden.includes('roles.delegate')).map((r) => r.id).sort().join(',') === 'beheerder,eigenaar');
  check('mogelijkheden: unie zonder dubbelen, onbekende rol genegeerd', (() => { const m = mogelijkhedenVan(['auditor', 'ondersteuning', 'xxx' as never]); return new Set(m).size === m.length && m.includes('journaal.lezen') && m.includes('diagnose.lezen'); })());
  check('elke rol heeft uitleg met «для розробників»', TECH_ROLLEN.every((r) => r.help.wat[0] && r.help.gevolg[0] && r.help.dev?.[0]));

  // ---------------------------------------------------------------- server
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'user', status = 'approved') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status }]);
    return { id, email, role, status };
  };
  const ownerEmail = String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test');
  // Er kan maar één eigenaar zijn (index records_een_eigenaar): bestaande gebruiken als die er is, anders aanmaken en na afloop opruimen.
  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const bestaandeEigenaar = bestaand ? 1 : 0;
  const eig = bestaand ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' } : await mk(ownerEmail, 'owner');
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  const eigProfielVooraf = bestaand ? (await pool.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows.length : 0;
  const beh = await mk(`beh-${sfx}@eenheid.test`);
  const test = await mk(`test-${sfx}@eenheid.test`);
  const vreemd = await mk(`nieuw-${sfx}@eenheid.test`, 'user', 'pending');
  const ids = [eig.id, beh.id, test.id, vreemd.id];
  const opruimen = bestaand && eigProfielVooraf ? [beh.id, test.id, vreemd.id] : ids;
  try {
    const p = await tp.profielVan(eig);
    check('eigenaar krijgt automatisch profiel «eigenaar»', !!p && p.rollen.join() === 'eigenaar' && /^tech-[0-9a-f]{12}$/.test(p.profielId));
    check('gewone gebruiker heeft geen profiel', (await tp.profielVan(test)) === null);
    check('zonder profiel: activeren geweigerd', (await codeVan(tp.activeren(test, tab(), 30, 'probeer'))) === 'GEEN_TECH_PROFIEL');

    const tE = tab(), tAnder = tab();
    check('activeren: duur boven plafond (eigenaar 120) geweigerd', (await codeVan(tp.activeren(eig, tE, 240, 'onderhoud'))) === 'DUUR_ONGELDIG');
    check('activeren: reden te kort geweigerd', (await codeVan(tp.activeren(eig, tE, 60, 'x'))) === 'REDEN_ONGELDIG');
    check('activeren: ongeldige tab geweigerd', (await codeVan(tp.activeren(eig, 'abc', 60, 'onderhoud'))) === 'TAB_ONGELDIG');
    const a = await tp.activeren(eig, tE, 60, 'onderhoud  server');
    check('activeren: loopt ~60 min, reden genormaliseerd', a.reden === 'onderhoud server' && Math.abs(a.eind - a.begin - 3600_000) < 5000);
    check('activering geldt alleen voor DIT tabblad', !!(await tp.actieveActivatie(eig.id, tE)) && (await tp.actieveActivatie(eig.id, tAnder)) === null);
    const a2 = await tp.activeren(eig, tE, 30, 'verlengd');
    const oud = (await pool.query('SELECT beeindigd_reden FROM app.tech_activaties WHERE id=$1', [a.id])).rows[0]?.beeindigd_reden;
    check('opnieuw activeren in dezelfde tab vervangt de vorige', oud === 'vervangen' && (await tp.actieveActivatie(eig.id, tE))?.id === a2.id);

    // toekennen
    check('toekennen zonder activering geweigerd', (await codeVan(tp.toekennen(eig, tAnder, { email: beh.email, rollen: ['beheerder'], maxMinuten: 60 }))) === 'TECH_NIET_ACTIEF');
    check('rol «eigenaar» niet toe te kennen', (await codeVan(tp.toekennen(eig, tE, { email: beh.email, rollen: ['eigenaar'], maxMinuten: 60 }))) === 'EIGENAAR_NIET_TOE_TE_KENNEN');
    check('onbekende rol geweigerd', (await codeVan(tp.toekennen(eig, tE, { email: beh.email, rollen: ['beheerder', 'god'], maxMinuten: 60 }))) === 'ROLLEN_ONGELDIG');
    check('niet goedgekeurd account geweigerd', (await codeVan(tp.toekennen(eig, tE, { email: vreemd.email, rollen: ['tester'], maxMinuten: 60 }))) === 'GEBRUIKER_NIET_GOEDGEKEURD');
    check('niet aan jezelf', (await codeVan(tp.toekennen(eig, tE, { email: eig.email, rollen: ['tester'], maxMinuten: 60 }))) === 'NIET_AAN_JEZELF');
    const pb = await tp.toekennen(eig, tE, { email: beh.email, rollen: ['beheerder'], maxMinuten: 480, notitie: 'test' });
    check('eigenaar geeft «beheerder»', pb.rollen.join() === 'beheerder');
    const tB = tab();
    check('beheerder: plafond 60 ondanks profiel 480', (await codeVan(tp.activeren(beh, tB, 120, 'werk'))) === 'DUUR_ONGELDIG' && (await codeVan(tp.activeren(beh, tB, 60, 'werk'))) === 'OK');
    check('beheerder kan geen rol geven die hij niet heeft (escalatie)', (await codeVan(tp.toekennen(beh, tB, { email: test.email, rollen: ['ontwikkelaar'], maxMinuten: 60 }))) === 'ROLLEN_BOVEN_EIGEN');
    check('beheerder kan de eigenaar niet aanraken', ['EIGENAAR_ONAANTASTBAAR', 'ROLLEN_BOVEN_EIGEN'].includes(await codeVan(tp.intrekken(beh, tB, eig.id, 'weg'))));
    check('beheerder geeft «beheerder» door', (await codeVan(tp.toekennen(beh, tB, { email: test.email, rollen: ['beheerder'], maxMinuten: 60 }))) === 'OK');
    // test → tester (door eigenaar); daarna kan beheerder dat profiel niet intrekken? tester ⊄ {beheerder} → geweigerd
    await tp.toekennen(eig, tE, { email: test.email, rollen: ['tester'], maxMinuten: 480 });
    check('intrekken alleen binnen eigen rollen', (await codeVan(tp.intrekken(beh, tB, test.id, 'x'))) === 'ROLLEN_BOVEN_EIGEN');
    const tT = tab();
    await tp.activeren(test, tT, 480, 'testen');
    check('tester mag niet delegeren', (await codeVan(tp.profielenLijst(test, tT))) === 'DELEGEREN_NIET_TOEGESTAAN');
    await tp.intrekken(eig, tE, test.id, 'klaar');
    check('intrekken beëindigt lopende activering', (await tp.actieveActivatie(test.id, tT)) === null && (await tp.profielVan(test))?.ingetrokkenOp !== null);
    check('na intrekken: activeren geweigerd', (await codeVan(tp.activeren(test, tab(), 30, 'opnieuw'))) === 'GEEN_TECH_PROFIEL');

    const tWeg = tab();
    await tp.activeren(beh, tWeg, 15, 'kort');
    check('zelf beëindigen sluit alleen die tab', (await tp.beeindigen(beh, tWeg)) && (await tp.actieveActivatie(beh.id, tWeg)) === null && !!(await tp.actieveActivatie(beh.id, tB)));
    // verlopen
    await pool.query(`UPDATE app.tech_activaties SET begin_op = now() - interval '2 hours', eind_op = now() - interval '1 minute' WHERE user_id=$1 AND beeindigd_op IS NULL`, [beh.id]);
    const naVerlopen = await tp.actieveActivatie(beh.id, tB);
    const reden = (await pool.query(`SELECT beeindigd_reden FROM app.tech_activaties WHERE user_id=$1 AND tab_hash=$2 ORDER BY begin_op DESC LIMIT 1`, [beh.id, tp.tabHash(tB)])).rows[0]?.beeindigd_reden;
    check('verlopen activering geeft niets meer en wordt «verlopen»', naVerlopen === null && reden === 'verlopen' && !(await tp.heeftTechMogelijkheid(beh.id, tB, 'roles.delegate')));
    check('database: activering > 8 uur onmogelijk', await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['tester'],'abc', now() + interval '9 hours')`, [beh.id, pb.profielId, 'a'.repeat(64)]).then(() => false, () => true));

    // eigenaar: profiel herstelt zich
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = now(), rollen = ARRAY['tester'] WHERE user_id=$1`, [eig.id]);
    const herstel = await tp.profielVan(eig);
    check('eigenaar: ingetrokken profiel herstelt zich automatisch', !!herstel && herstel.ingetrokkenOp === null && herstel.rollen.join() === 'eigenaar');

    // band
    check('band: ongeldige kleur geweigerd', (await codeVan(tp.bandZetten(eig, 'rood', 'geen'))) === 'BAND_ONGELDIG');
    check('band: geldige keuze bewaard', (await tp.bandZetten(eig, 'paars', 'stippen')).band.kleur === 'paars');

    // logboek en RLS
    const acties = (await pool.query(`SELECT DISTINCT action FROM app.audit WHERE actor_id = ANY($1) AND action LIKE 'owner.tech.%'`, [ids])).rows.map((r) => r.action).sort();
    check('logboek: alle owner.tech.* acties', ['owner.tech.band', 'owner.tech.beeindigd', 'owner.tech.geactiveerd', 'owner.tech.ingetrokken', 'owner.tech.toegekend'].every((x) => acties.includes(x)), acties.join(','));
    const app = getPool('app');
    const schrijf = await app.query(`UPDATE app.tech_profielen SET rollen = ARRAY['eigenaar'] WHERE user_id=$1`, [beh.id]).then(() => 'ok', (e) => String(e.code));
    check('app-rol kan niet schrijven in tech_profielen', schrijf === '42501', schrijf);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [opruimen]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [opruimen]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [bestaand ? [beh.id, test.id, vreemd.id] : ids]).catch(() => undefined);
  }
  return einde();
}
