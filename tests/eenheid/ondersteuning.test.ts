// Etap 7 (13.10.2026): «Підтримка від імені» alleen met toestemming. Echte database en echte regels (backend/ondersteuning.ts).
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import * as o from '../../backend/ondersteuning';
import { checker } from './hulp/nep-google';

const tab = () => randomBytes(24).toString('hex');
async function code(p: Promise<unknown>) { try { await p; return 'OK'; } catch (e) { return e instanceof tp.TechFout ? e.code : `ANDERS:${(e as Error).message}`; } }

export async function main(): Promise<number> {
  const { check, einde } = checker('ondersteuning');
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'user', status = 'approved') => { const id = randomUUID(); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status, name: 'Тест' }]); return { id, email, role, status }; };
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eig = bestaand ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' } : await mk(String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'), 'owner');
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  const eigProfielVooraf = (await sys.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows.length;
  const steun = await mk(`steun-${sfx}@eenheid.test`), klant = await mk(`klant-${sfx}@eenheid.test`), ander = await mk(`ander-${sfx}@eenheid.test`);
  const meldingen: Array<{ id: string; titel: string }> = [];
  const meld: o.Melder = async (id, _e, _k, titel) => { meldingen.push({ id, titel }); };
  const ids = [steun.id, klant.id, ander.id];
  try {
    const tE = tab(), tS = tab();
    await tp.activeren(eig, tE, 60, 'beheer');
    await tp.toekennen(eig, tE, { email: steun.email, rollen: ['ondersteuning'], maxMinuten: 240 });
    check('zonder technisch profiel: aanvragen geweigerd', (await code(o.aanvragen(steun, tS, { email: klant.email, reden: 'hulp', minuten: 15 }, meld))) === 'TECH_ONDERSTEUNING_VEREIST');
    await tp.activeren(steun, tS, 60, 'support');
    const eigCode = await code(o.aanvragen(steun, tS, { email: eig.email, reden: 'hulp', minuten: 15 }, meld));
    // Twee accounts met hetzelfde adres (zie aanmelden.test: ander Google-subject) → dubbelzinnig → ook geweigerd.
    check('niet bij de eigenaar van de server', ['EIGENAAR_ONAANTASTBAAR', 'GEBRUIKER_NIET_GEVONDEN'].includes(eigCode), eigCode);
    check('niet bij zichzelf', (await code(o.aanvragen(steun, tS, { email: steun.email, reden: 'hulp', minuten: 15 }, meld))) === 'NIET_AAN_JEZELF');
    check('duur 5–30 min', (await code(o.aanvragen(steun, tS, { email: klant.email, reden: 'hulp', minuten: 60 }, meld))) === 'DUUR_ONGELDIG');
    check('nood alleen voor de eigenaar', (await code(o.aanvragen(steun, tS, { email: klant.email, reden: 'hulp', minuten: 15, nood: true }, meld))) === 'NOOD_ALLEEN_EIGENAAR');

    const v = await o.aanvragen(steun, tS, { email: klant.email, reden: 'пошта не синхронізується', minuten: 15 }, meld);
    check('verzoek: status «wacht», gebruiker gemeld', v.status === 'wacht' && meldingen.some((m) => m.id === klant.id && /просить дозволу/.test(m.titel)));
    check('gebruiker ziet het wachtende verzoek met wie en waarom', (await o.voorMij(klant)).some((x) => x.id === v.id && x.aanvrager === steun.email && x.reden === 'пошта не синхронізується'));
    check('vóór toestemming: geen overzicht', (await code(o.overzicht(steun, tS, v.id))) === 'GEEN_TOESTEMMING');
    check('een ander kan niet beslissen over dit verzoek', (await code(o.beslissen(ander, v.id, true))) === 'VERZOEK_NIET_OPEN');
    const ok = await o.beslissen(klant, v.id, true);
    check('toegestaan: eind = nu + 15 min', ok.status === 'goedgekeurd' && Math.abs((ok.eind ?? 0) - Date.now() - 15 * 60_000) < 10_000);
    check('ander tabblad van de ondersteuner: geweigerd', (await code(o.overzicht(steun, (await (async () => { const t2 = tab(); await tp.activeren(steun, t2, 30, 'tweede tab'); return t2; })()), v.id))) === 'ANDER_TABBLAD');
    check('een andere ondersteuner (ook eigenaar) kan dit verzoek niet gebruiken', (await code(o.overzicht(eig, tE, v.id))) === 'VERZOEK_NIET_GEVONDEN');
    const ov = await o.overzicht(steun, tS, v.id);
    check('overzicht: account van de klant, metadata', ov.account.email === klant.email && ov.weergave === 'eenvoudig' && Array.isArray(ov.apparaten) && Array.isArray(ov.recenteActies));
    const tekst = JSON.stringify(ov);
    check('overzicht bevat geen hashes, tokens of sleutels', !/hash|token_|secret|password|command_key|refresh_|access_/i.test(tekst), tekst.slice(0, 160));
    const bekeken = (await sys.query(`SELECT actor_id FROM app.audit WHERE owner_id=$1 AND action='owner.ondersteuning.bekeken'`, [klant.id])).rows;
    check('elk bekijken in het logboek van de klant, met de ondersteuner als actor', bekeken.length >= 1 && bekeken.every((r) => r.actor_id === steun.id));

    await tp.beeindigen(steun, tS);
    check('technisch profiel uit → geen overzicht meer', (await code(o.overzicht(steun, tS, v.id))) === 'TECH_ONDERSTEUNING_VEREIST');
    await tp.activeren(steun, tS, 60, 'support weer');
    await sys.query(`UPDATE app.ondersteuning_verzoeken SET besloten_op = now() - interval '20 minutes', eind_op = now() - interval '1 minute' WHERE id = $1`, [v.id]);
    check('na eind_op: verlopen, geen overzicht', (await code(o.overzicht(steun, tS, v.id))) === 'GEEN_TOESTEMMING' && (await sys.query('SELECT status FROM app.ondersteuning_verzoeken WHERE id=$1', [v.id])).rows[0].status === 'verlopen');
    check('database: toegang > 30 min onmogelijk', await sys.query(`UPDATE app.ondersteuning_verzoeken SET besloten_op = now(), eind_op = now() + interval '45 minutes' WHERE id = $1`, [v.id]).then(() => false, () => true));

    const v2 = await o.aanvragen(steun, tS, { email: klant.email, reden: 'ще раз', minuten: 10 }, meld);
    await o.beslissen(klant, v2.id, false);
    check('geweigerd → geen overzicht', (await code(o.overzicht(steun, tS, v2.id))) === 'GEEN_TOESTEMMING');
    const v3 = await o.aanvragen(steun, tS, { email: klant.email, reden: 'знову', minuten: 10 }, meld);
    await sys.query(`UPDATE app.ondersteuning_verzoeken SET aangevraagd_op = now() - interval '16 minutes' WHERE id = $1`, [v3.id]);
    check('geen antwoord binnen 15 min → verlopen, niet meer toe te staan', (await code(o.beslissen(klant, v3.id, true))) === 'VERZOEK_NIET_OPEN');
    const v4 = await o.aanvragen(steun, tS, { email: klant.email, reden: 'вчетверте', minuten: 10 }, meld);
    await o.beslissen(klant, v4.id, true);
    await o.beeindigen(klant, v4.id);
    check('klant beëindigt op elk moment', (await code(o.overzicht(steun, tS, v4.id))) === 'GEEN_TOESTEMMING');

    const nood = await o.aanvragen(eig, tE, { email: klant.email, reden: 'аварія', minuten: 30, nood: true }, meld);
    check('nood (eigenaar): meteen toegestaan, klant meteen gemeld', nood.status === 'goedgekeurd' && meldingen.some((m) => m.id === klant.id && /Термінова/.test(m.titel)) && (await code(o.overzicht(eig, tE, nood.id))) === 'OK');
    const acties = (await sys.query(`SELECT DISTINCT action FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.ondersteuning.%'`, [klant.id])).rows.map((r) => r.action).sort();
    check('logboek van de klant: gevraagd, toegestaan, geweigerd, beëindigd, bekeken, nood', ['owner.ondersteuning.beeindigd', 'owner.ondersteuning.bekeken', 'owner.ondersteuning.geweigerd', 'owner.ondersteuning.gevraagd', 'owner.ondersteuning.nood', 'owner.ondersteuning.toegestaan'].every((a) => acties.includes(a)), acties.join(','));
    const app = await getPool('app').query(`UPDATE app.ondersteuning_verzoeken SET status='goedgekeurd' WHERE id=$1`, [v2.id]).then(() => 'ok', (e) => String(e.code));
    check('app-rol kan niets schrijven', app === '42501', app);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.ondersteuning_verzoeken WHERE aanvrager_id = ANY($1) OR doel_id = ANY($1)', [[...ids, eig.id]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [eigProfielVooraf ? ids : [...ids, eig.id]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [eigProfielVooraf ? ids : [...ids, eig.id]]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [ids]).catch(() => undefined);
  }
  return einde();
}
