// ELDERS-001 (16.11.2026, verzoek van de eigenaar): een AI-verzoek dat in de ANDERE ruimte van dezelfde mens wacht, moet in het
// meldingencentrum zichtbaar zijn — anders zoekt de mens het in de beheeromgeving tevergeefs. Bewezen met de echte servercode tegen
// een wegwerp-PG:
//   1. in de technische lade verschijnt een levende regel voor wachtende verzoeken uit «Мій простір» (en omgekeerd);
//   2. ZONDER inhoud van het verzoek (geen titel, samenvatting of parameter) — alleen aantal, ruimte en een knop;
//   3. alleen eigen verzoeken (een ander account telt niet mee), alleen 'wacht' en niet verlopen;
//   4. in dezelfde ruimte geen extra regel (daar staat de gewone melding al);
//   5. de id verandert met het nieuwste verzoek (een nieuw verzoek is weer «ongelezen»).
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';

export async function main(): Promise<number> {
  const { check, einde } = checker('melding-elders-20261116');
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN melding-elders (integratie): geen database'); return einde(); }

  const ab = await import('../../backend/ai-bevestiging');
  const { registreerMelder } = await import('../../backend/melder');
  registreerMelder(async () => undefined);
  const sys = getPool('systeem');
  const A = `me-a-${randomUUID()}`, B = `me-b-${randomUUID()}`;
  const GEHEIM = `geheim-${randomUUID()}`;
  ab.registreerBevestigSoort<{ tekst: string }>({
    soort: 'test.elders', dienst: 'bord', ruimtes: ['prive', 'technisch'], risico: 'midden',
    valideer: (ruw) => ({ ok: true, params: { tekst: String((ruw as { tekst?: unknown })?.tekst || 'x') } }),
    beschrijf: (q) => ({ titel: { uk: 'Тест ' + q.tekst, nl: 'Test ' + q.tekst }, samenvatting: { uk: q.tekst, nl: q.tekst }, details: [] }),
    voerUit: async () => ({ ok: true, resultaat: null }),
  });
  const vraag = (userId: string, ruimte: 'prive' | 'technisch', tekst: string) =>
    ab.vraagBevestiging({ userId, ruimte, soort: 'test.elders', params: { tekst }, tool: 'test_tool', agent: 'claude', klant: 'Claude' });

  try {
    for (const u of [A, B]) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u, { email: `${u}@test.invalid`, role: 'member', status: 'approved' }]);

    check('niets wacht → geen regel, in geen van beide ruimtes', (await ab.wachtEldersMelding(A, 'technisch')) === null && (await ab.wachtEldersMelding(A, 'prive')) === null);

    const v1 = await vraag(A, 'prive', GEHEIM);
    const t1 = await ab.wachtEldersMelding(A, 'technisch');
    check('technische lade: 1 wachtend verzoek uit «Мій простір» wordt getoond, in de technische lade zelf (ruimte en sfeer = technisch)',
      v1.ok && !!t1 && t1.elders.ruimte === 'prive' && t1.elders.aantal === 1 && t1.ruimte === 'technisch' && t1.sfeer === 'technisch' && t1.read === false && t1.kind === 'ai_bevestiging', JSON.stringify(t1));
    check('zonder inhoud van het verzoek: geen titel, samenvatting of parameter van de AI in de regel',
      !!t1 && !JSON.stringify(t1).includes(GEHEIM) && !JSON.stringify(t1).includes('Тест') && !JSON.stringify(t1).includes('Test '));
    check('uitleg in de taal van de mens: «запит ШІ чекає … у «Моєму просторі»» en een knop naar het verzoek',
      !!t1 && /запит ШІ чекає/.test(t1.title) && /Моєму просторі/.test(t1.title) && v1.ok && t1.link.endsWith(`#agent/claude?bevestiging=${v1.id}`), t1?.title);
    check('dezelfde ruimte (prive) → geen extra regel: daar staat de gewone melding al', (await ab.wachtEldersMelding(A, 'prive')) === null);
    check('ander account ziet niets van A', (await ab.wachtEldersMelding(B, 'technisch')) === null);

    const v2 = await vraag(A, 'prive', 'twee');
    const t2 = await ab.wachtEldersMelding(A, 'technisch');
    check('twee wachtende → aantal 2, meervoud in de titel, en de id volgt het nieuwste verzoek (weer ongelezen)',
      v2.ok && !!t2 && t2.elders.aantal === 2 && /2 запити ШІ чекають/.test(t2.title) && t2.id !== t1?.id && t2.id.endsWith(v2.ok ? v2.id : '-'), JSON.stringify(t2));

    // Een technisch verzoek vraagt een actieve technische activering; hier alleen de rij in de technische ruimte zetten (de telling leest de kolom).
    const v3 = await vraag(B, 'prive', 'tech');
    if (v3.ok) await sys.query("UPDATE app.ai_bevestiging SET user_id = $2, ruimte = 'technisch' WHERE id = $1", [v3.id, A]);
    const p3 = await ab.wachtEldersMelding(A, 'prive');
    check('omgekeerd: in «Мій простір» een regel voor het wachtende verzoek in de technische ruimte',
      v3.ok && !!p3 && p3.elders.ruimte === 'technisch' && p3.elders.aantal === 1 && /технічному просторі/.test(p3.title) && p3.ruimte === 'prive', JSON.stringify(p3));

    // afgehandeld of verlopen telt niet meer
    if (v1.ok) await ab.weiger({ userId: A, id: v1.id, ruimte: 'prive' }).catch(() => undefined);
    if (v2.ok) await sys.query("UPDATE app.ai_bevestiging SET aangemaakt_op = now() - interval '20 minutes', verloopt_op = now() - interval '1 minute' WHERE id = $1", [v2.id]);
    check('geweigerd en verlopen tellen niet meer mee → geen regel in de technische lade', (await ab.wachtEldersMelding(A, 'technisch')) === null);
  } finally {
    await sys.query("DELETE FROM app.ai_bevestiging WHERE user_id = ANY($1)", [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
