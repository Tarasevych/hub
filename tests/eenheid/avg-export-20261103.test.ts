// AVG-export (INTEG-001, 03.11.2026): de export bevat alles wat bij het account hoort, zonder geheimen,
// zonder stille afkapping en zonder gegevens van een ander account.
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { persoonsgegevensExport, zonderGeheimen } from '../../backend/privacy';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('avg-export-20261103');
  const sys = getPool('systeem');

  // 1. Geheimen en versleutelde velden gaan eruit; titel, versienummer, datum en binaire inhoud blijven herkenbaar.
  const schoon = zonderGeheimen({
    titel: 'Boodschappen', token_hash: 'x', geheim: 'v1.aaaa.bbbb.cccc', public_key: 'pk',
    versie: 'v1.2', gemaakt: new Date('2026-11-03T10:00:00Z'), inhoud: Buffer.from('ab'),
  }) as Record<string, unknown>;
  check('AVG-export: geheimen, hashes en versleutelde velden weg; titel, versie, datum en binaire inhoud blijven leesbaar',
    schoon.titel === 'Boodschappen' && !('token_hash' in schoon) && !('geheim' in schoon) && !('public_key' in schoon)
    && schoon.versie === 'v1.2' && schoon.gemaakt instanceof Date && schoon.inhoud === '[binair, 2 bytes]');

  // 2. Echte export voor twee accounts: alleen de eigen rijen, geen geheimen uit de kolommen.
  const a = `avgexp-a-${randomUUID()}`;
  const b = `avgexp-b-${randomUUID()}`;
  const eigenMail = `avgexp-${randomUUID()}@test.invalid`;
  try {
    await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2)", [a, { email: eigenMail, name: 'Test A', role: 'member', status: 'approved' }]);
    await sys.query('INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md) VALUES ($1, $2, $3, $4)', [a, 'prive', 'Mijn notitie', 'tekst van A']);
    await sys.query('INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md) VALUES ($1, $2, $3, $4)', [b, 'prive', 'Van B', 'tekst van B']);
    await sys.query("INSERT INTO app.huis_woningen (user_id, naam) VALUES ($1, 'Thuis')", [a]);
    await sys.query(
      "INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, geheim) VALUES ($1, $2, 'ics', 'Werk', 'https://agenda.example.invalid/w.ics', 'v1.aaaa.bbbb.cccc')",
      [a, `avgexp-agenda-${randomUUID()}`],
    );

    const exp = await persoonsgegevensExport(a);
    const json = JSON.stringify(exp);
    const notities = (exp.gegevens['app.notities'] || []) as Array<Record<string, unknown>>;
    check('AVG-export: eigen notitie aanwezig, notitie van een ander account niet',
      notities.length === 1 && notities[0].titel === 'Mijn notitie' && !json.includes('Van B'));
    check('AVG-export: datum van een rij blijft een datum (geen leeg object)',
      notities.length === 1 && notities[0].created_at instanceof Date);
    check('AVG-export: huis-woning van het account aanwezig',
      (exp.gegevens['app.huis_woningen'] || []).length === 1);
    const agenda = (exp.gegevens['app.agenda_abonnement'] || []) as Array<Record<string, unknown>>;
    check('AVG-export: agenda-abonnement met naam aanwezig, het versleutelde wachtwoord niet',
      agenda.length === 1 && agenda[0].naam === 'Werk' && !('geheim' in agenda[0]) && !json.includes('v1.aaaa'));
    check('AVG-export: het accountrecord zelf (e-mail) is meegenomen',
      ((exp.gegevens.users || []) as Array<{ gegevens: { email?: string } }>).some((r) => r.gegevens.email === eigenMail));
    check('AVG-export: geen afkapping-sleutel meer; wel een lijst van bestanden en het beveiligingslogboek',
      !('afgekapt' in exp) && Array.isArray(exp.bestanden) && Array.isArray(exp.beveiligingslog));
  } finally {
    await sys.query('DELETE FROM app.agenda_abonnement WHERE user_id = ANY($1::text[])', [[a, b]]).catch(() => undefined);
    await sys.query('DELETE FROM app.huis_woningen WHERE user_id = ANY($1::text[])', [[a, b]]).catch(() => undefined);
    await sys.query('DELETE FROM app.notities WHERE user_id = ANY($1::text[])', [[a, b]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [a]).catch(() => undefined);
  }

  return einde();
}
