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
    for (const v of [v2, v3]) if (v.ok) await sys.query("UPDATE app.ai_bevestiging SET aangemaakt_op = now() - interval '20 minutes', verloopt_op = now() - interval '1 minute' WHERE id = $1", [v.id]);
    check('geweigerd en verlopen tellen niet meer mee → geen regel, in geen van beide ruimtes',
      (await ab.wachtEldersMelding(A, 'technisch')) === null && (await ab.wachtEldersMelding(A, 'prive')) === null);

    // ================================================================ ECHTE KETEN: verzoek → bel in het technische tabblad (echte routes)
    // Precies het geval van 16.11: de AI vroeg in «Мій простір», de eigenaar keek in een tabblad met technisch profiel.
    const idx = await import('../../backend/index');
    const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
    const { tabHash } = await import('../../backend/tech-profiel');
    const { createHash, randomBytes } = await import('node:crypto');
    const sha = (v: string) => createHash('sha256').update(v).digest('hex');
    const HOST = 'id.tarasevych.com';
    const tD = randomBytes(24).toString('hex'), tP = randomBytes(24).toString('hex');
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['beheerder'],60,'test')`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await sys.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A])).rows[0].profiel_id);
    await sys.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'eenheidstest elders', now() + interval '60 minutes')`, [A, pid, tabHash(tD)]);
    const sid = randomUUID(), token = randomBytes(32).toString('base64url'), nu = Date.now();
    await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', sid, { tokenHash: sha(token), userId: A, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: nu - 3_600_000, authenticatedAt: nu - 3_600_000, lastSeenAt: nu, idleExpiresAt: nu + 7 * 864e5, absoluteExpiresAt: nu + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' }]);
    const cookie = `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${sid}.${token}`)}`;
    const roep = async (pad: string, body: Record<string, unknown>, tabContext: string) => {
      const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
      const r = await idx.handler(evt as never);
      let data: Record<string, unknown> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
      return { status: r.statusCode, data };
    };
    type Item = { id: string; kind: string; title: string; message: string; ruimte?: string; link?: string; read?: boolean };
    const bel = async (t: string) => { const r = await roep('/api/owner/session/bootstrap', {}, t); return { status: r.status, ruimte: r.data.meldingenRuimte, n: Number(r.data.notifications || 0), items: (r.data.notificationItems || []) as Item[] }; };

    const voorT = await bel(tD);
    check('keten 0: zonder wachtend verzoek is er in het technische tabblad geen regel «чекає»', voorT.status === 200 && voorT.ruimte === 'technisch' && !voorT.items.some((m) => m.id.startsWith('ai-wacht-elders:')), JSON.stringify({ s: voorT.status, r: voorT.ruimte }));

    const echt = await vraag(A, 'prive', GEHEIM); // de AI vraagt in «Мій простір», precies zoals de connector
    const naT = await bel(tD), naP = await bel(tP);
    const regel = naT.items.find((m) => m.id.startsWith('ai-wacht-elders:'));
    check('keten 1: de echte bootstrap-route van het TECHNISCHE tabblad toont de regel «1 запит ШІ чекає … у «Моєму просторі»» bovenaan',
      !!regel && naT.items[0]?.id === regel.id && /1 запит ШІ чекає/.test(regel.title) && /Моєму просторі/.test(regel.title) && regel.ruimte === 'technisch' && regel.read === false, JSON.stringify(naT.items.slice(0, 2)));
    check('keten 2: de teller van de bel in het technische tabblad telt de regel mee (+1)', naT.n === voorT.n + 1, `${voorT.n} → ${naT.n}`);
    check('keten 3: de knop wijst naar dit verzoek op de pagina «Підключення ШІ», en de uitleg zegt hoe je naar «Мій простір» gaat',
      echt.ok && !!regel?.link && regel.link.endsWith(`?bevestiging=${echt.id}`) && /без технічного профілю/.test(regel.message), regel?.link);
    check('keten 4: in de bel staat NIETS van de inhoud van het verzoek (geen parameter, geen titel van de AI)', !JSON.stringify(naT.items).includes(GEHEIM) && !JSON.stringify(naT.items).includes('Тест '));
    check('keten 5: in het persoonlijke tabblad geen extra regel (daar staat de gewone melding «просить вашого підтвердження»)',
      naP.ruimte === 'prive' && !naP.items.some((m) => m.id.startsWith('ai-wacht-elders:')) && naP.items.some((m) => m.kind === 'ai_bevestiging'), JSON.stringify(naP.items.map((m) => m.title)));
    const gelezen = await roep('/api/owner/notifications/read', { notificationId: regel?.id || '' }, tD);
    check('keten 6: «прочитано» op de regel geeft geen fout (200), en de regel blijft zolang het verzoek wacht', gelezen.status === 200 && (await bel(tD)).items.some((m) => m.id === regel?.id), JSON.stringify(gelezen));
    if (echt.ok) await ab.weiger({ userId: A, id: echt.id, ruimte: 'prive' });
    const naBesluit = await bel(tD);
    check('keten 7: na het besluit (hier: відхилити) verdwijnt de regel vanzelf uit de technische bel', !naBesluit.items.some((m) => m.id.startsWith('ai-wacht-elders:')) && naBesluit.n === voorT.n, `${naBesluit.n}`);
    await sys.query("DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1", [sid]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [A]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [A]).catch(() => undefined);
  } finally {
    await sys.query("DELETE FROM app.ai_bevestiging WHERE user_id = ANY($1)", [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
