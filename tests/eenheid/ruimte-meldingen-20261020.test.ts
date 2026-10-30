// MELDINGEN IN TWEE GESCHEIDEN GEGEVENSRUIMTES (klacht van de eigenaar, 20.10.2026: «панель сповіщень показує технічні
// сповіщення, коли користувач в особистому просторі»). Migratie 0091; model in shared/meldingen-ruimte.ts; poort in
// backend/meldingen-ruimte.ts; de live ruimte komt uit backend/ruimte-scheiding.ts (gegevensRuimteVeilig) — dezelfde als voor post,
// hmara, agenda en bord.
//
// WAT DEZE TEST VASTHOUDT
//   1. Een TECHNISCHE melding is in het persoonlijke tabblad onzichtbaar; een PERSOONLIJKE melding in het technische tabblad ook.
//   2. De teller van de bel telt alleen de eigen lade (geen gedeelde badge meer).
//   3. BEVROREN of GESLOTEN technische lade → technische meldingen weg uit het beeld; de achtergrond schrijft ze gewoon door.
//   4. Een OUDE rij zonder `ruimte` is PERSOONLIJK — ook met een technische soort. Niets verhuist (0091 heeft geen UPDATE/DELETE).
//   5. REGRESSIE: het oude overzicht (zonder lade) laat de technische melding in het persoonlijke beeld zien; het nieuwe niet.
//   6. «Verwijderen» (besluit van de servereigenaar over de bevroren hub-lade) wist ALLEEN de technische meldingen.
//   7. «Gelezen» via de echte route raakt alleen de live lade: «alles gelezen» in het persoonlijke tabblad laat de technische staan.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { db } from '../../server/platform';
import { alsSysteem } from '../../server/platform/context';
import { checker } from './hulp/nep-google';
import { meldingRuimte, meldingenInLade, meldingenVoorRuimte, rijRuimte, ruimteBijAanmaak } from '../../shared/meldingen-ruimte';
import { MELDING_SOORTEN, filterVoorOntvanger, soortRuimte } from '../../shared/melding-soorten';
import { MELDING_TYPES } from '../../shared/melding-typen';
import { DEELBARE_DIENSTEN } from '../../shared/ruimte-scheiding';
import * as rs from '../../backend/ruimte-scheiding';
import { tabHash } from '../../backend/tech-profiel';
import { meld } from '../../backend/melder';
import { metLade as mailMetLade } from '../../backend/mail-ruimte';
import { metLade as cloudMetLade } from '../../backend/ruimte-cloud-agenda';
import { MELDING_TABEL, meldingenLade, ruimteVoorNieuweMelding } from '../../backend/meldingen-ruimte';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'id.tarasevych.com';
const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
type Rij = Record<string, unknown> & { id: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-meldingen');
  const pool = getPool('systeem');
  const idx = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');
  const sfx = randomBytes(4).toString('hex');
  const stil = console.error; console.error = () => {};

  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved', name: email }]);
    return { id, email, role, status: 'approved' as const };
  };
  const bestaandeEigenaar = (await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eigenaarId = bestaandeEigenaar ? String(bestaandeEigenaar.id) : (await mk(`eig-mld-${sfx}@eenheid.test`, 'owner')).id;
  const dev = await mk(`dev-mld-${sfx}@eenheid.test`);
  const tD = tab(), tP = tab(); // tD: tabblad met technische activering; tP: tabblad zonder (persoonlijk)
  const sessies: string[] = [];

  const rijen = async (userId: string): Promise<Rij[]> => (await pool.query(`SELECT id, data FROM app.records WHERE tbl=$1 AND data->>'recipientUserId'=$2 ORDER BY seq`, [MELDING_TABEL, userId])).rows.map((r) => ({ ...(r.data as object), id: String(r.id) } as Rij));
  const overzicht = async (t?: string) => { const r = await idx.siteNotificationOverview(dev as never, { tabContext: t }); return { kinds: r.notificationItems.map((m) => m.kind).sort().join(','), n: r.notifications, ruimte: r.meldingenRuimte, items: r.notificationItems }; };
  const sessie = async (uid: string) => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now - 3_600_000, authenticatedAt: now - 3_600_000, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    sessies.push(id);
    return { id, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const roep = async (pad: string, s: { cookie: string }, body: Record<string, unknown>, tabContext: string) => {
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await idx.handler(evt as never);
    let data: Record<string, unknown> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };

  try {
    // ------------------------------------------------------------------ migratie 0091: idempotent, niets verhuist
    const mig = lees('migrations/0091_ruimte_meldingen.sql');
    await getPool('migratie').query(mig); await getPool('migratie').query(mig);
    check('0091 draait twee keer zonder fout en maakt de partiële index op technische meldingen',
      (await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='records_meldingen_technisch_idx'`)).rows.length === 1);
    check('0091 bevat geen UPDATE of DELETE en geen kolom: geen rij verhuist of verdwijnt (records: ruimte is een veld, zoals 0086)',
      !/\b(UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\b/i.test(mig.replace(/--[^\n]*/g, '')));

    // ------------------------------------------------------------------ het model (puur)
    check('model: een rij zonder «ruimte» is PERSOONLIJK, ook met een technische soort; alleen «technisch» zelf is technisch',
      rijRuimte({}) === 'prive' && rijRuimte({ ruimte: null }) === 'prive' && rijRuimte({ ruimte: 'onzin' }) === 'prive' && rijRuimte({ ruimte: 'technisch' }) === 'technisch'
      && meldingRuimte('uitrol.mislukt', undefined, 'prive') === 'prive' && meldingRuimte('uitrol.mislukt') === 'technisch');
    check('model: bij het aanmaken is een technische soort ALTIJD technisch (ook in een persoonlijke lade); een persoonlijke soort volgt de lade',
      ruimteBijAanmaak('uitrol.mislukt', 'prive') === 'technisch' && ruimteBijAanmaak('siem') === 'technisch'
      && ruimteBijAanmaak('security', undefined) === 'prive' && ruimteBijAanmaak('security', 'technisch') === 'technisch' && ruimteBijAanmaak('onbekend_ding', 'prive') === 'prive');
    // Elke bron die de server kent, is geclassificeerd: technisch ⇔ type met ruimte 'technisch' (tabel 18.10, hier ongewijzigd).
    const bronnen = Object.entries(MELDING_SOORTEN).map(([k, i]) => `${k}=${MELDING_TYPES[i.type].ruimte}`);
    check(`bronnen: ${Object.keys(MELDING_SOORTEN).length} soorten, elk met één ruimte (${bronnen.filter((b) => b.endsWith('technisch')).length} technisch, ${bronnen.filter((b) => b.endsWith('prive')).length} persoonlijk)`,
      Object.keys(MELDING_SOORTEN).length >= 25 && ['security', 'security_warning', 'impersonatie', 'ondersteuning', 'workspace_share', 'access_decision'].every((k) => soortRuimte(k) === 'prive')
      && ['uitrol.mislukt', 'siem', 'server', 'deur', 'vault_key_expired', 'mcp_app_secret', 'access_request', 'beveiliging.zekering', 'google_login_config'].every((k) => soortRuimte(k) === 'technisch'));
    check('meldingen zijn bewust GEEN eigen deelbare dienst (geen keuze eigen/gedeeld/uit): het register hangt aan de hub-lade «bord»',
      !(DEELBARE_DIENSTEN as readonly string[]).includes('meldingen') && rs.ladeUitvoerders('bord').some((u) => u.naam === 'meldingen'));

    // ------------------------------------------------------------------ wat er «al was»: oude rijen zonder ruimte
    await alsSysteem(() => db.add(MELDING_TABEL, [
      { recipientUserId: dev.id, recipientEmail: '', kind: 'siem', title: 'oud-siem', message: '', read: false, createdAt: Date.now() - 2000 },
      { recipientUserId: dev.id, recipientEmail: '', kind: 'security_warning', title: 'oud-sec', message: '', read: false, createdAt: Date.now() - 1000 },
    ]));
    await pool.query(`UPDATE app.records SET data = data - 'ruimte' WHERE tbl=$1 AND data->>'recipientUserId'=$2`, [MELDING_TABEL, dev.id]);

    // technisch profiel (beheerder: journaal.lezen, diagnose.lezen → ziet siem/server) met lopende activering in tabblad tD
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['beheerder'],60,'test')`, [dev.id, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [dev.id])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'eenheidstest meldingen', now() + interval '60 minutes')`, [dev.id, pid, tabHash(tD)]);
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [dev.id]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [dev.id]);

    const lT = await meldingenLade(dev.id, { tabContext: tD }), lP = await meldingenLade(dev.id, { tabContext: tP }), lZ = await meldingenLade(dev.id);
    check('lade: tabblad met activering → technisch; tabblad zonder → prive; zonder tabblad (achtergrond) → prive',
      lT.ruimte === 'technisch' && lP.ruimte === 'prive' && lZ.ruimte === 'prive');
    check('lade: ook ZONDER de eenmalige keuze (technische ruimte «leeg») blijven technische meldingen bereikbaar — zij zijn geen dienst met stand',
      lT.ruimte === 'technisch' && (await rs.keuzeVan(dev.id)) === null);

    const oudP = await overzicht(tP), oudT = await overzicht(tD);
    // 22.10.2026 (sfeer, shared/meldingen-soorten.ts + 0107): de LADE van een oude rij blijft persoonlijk (niets verhuist), maar het PANEEL
    // volgt de sfeer: de oude «siem» hoort in het technische paneel, niet in de bel van de gebruiker (klacht eigenaar 22.10).
    check('4. oude rijen zonder «ruimte» liggen in de PERSOONLIJKE lade; in de bel staat alleen de persoonlijke soort (sfeer prive)',
      oudP.kinds === 'security_warning' && oudP.n === 1 && oudP.ruimte === 'prive' && oudP.items.every((m) => m.ruimte === 'prive' && m.sfeer === 'prive'), JSON.stringify(oudP));
    check('4. …en de oude «siem» staat in het technische tabblad (sfeer technisch) mét haar onveranderde lade «prive»: zij is niet verplaatst',
      oudT.kinds === 'siem' && oudT.n === 1 && oudT.ruimte === 'technisch' && oudT.items[0]?.ruimte === 'prive' && oudT.items[0]?.sfeer === 'technisch', JSON.stringify(oudT));

    // ------------------------------------------------------------------ nieuw: elke melding krijgt haar lade bij het aanmaken
    await meld(dev.id, 'server', 'nieuw-server', 'achtergrond, zonder tabblad');        // technische soort → technisch, ook zonder context
    await meld(dev.id, 'security', 'nieuw-security', 'persoonlijke soort, geen lade');   // persoonlijke soort → prive
    await mailMetLade({ userId: dev.id, ruimte: 'technisch' }, 'mail', () => meld(dev.id, 'workspace_share', 'in-techlade', 'persoonlijke soort in de technische postlade'));
    await cloudMetLade({ userId: dev.id, ruimte: 'technisch' }, 'cloud', () => meld(dev.id, 'access_decision', 'in-techlade-cloud', 'persoonlijke soort in de technische hmaralade'));
    await mailMetLade({ userId: dev.id, ruimte: 'prive' }, 'mail', () => meld(dev.id, 'siem', 'tech-in-privelade', 'technische soort in de persoonlijke lade'));
    await mailMetLade({ userId: eigenaarId, ruimte: 'technisch' }, 'mail', () => meld(dev.id, 'ondersteuning', 'andermans-lade', 'lade van een ANDERE mens telt niet'));
    const alle = await rijen(dev.id);
    const r = (title: string) => alle.find((x) => x.title === title);
    check('aanmaken: technische soort → «technisch» zonder tabblad én in een persoonlijke lade; persoonlijke soort → «prive»',
      r('nieuw-server')?.ruimte === 'technisch' && r('tech-in-privelade')?.ruimte === 'technisch' && r('nieuw-security')?.ruimte === 'prive');
    check('aanmaken: persoonlijke soort in de technische lade (post óf hmara/agenda, metLade) → «technisch»; de lade van een ANDERE mens telt niet',
      r('in-techlade')?.ruimte === 'technisch' && r('in-techlade-cloud')?.ruimte === 'technisch' && r('andermans-lade')?.ruimte === 'prive');
    check('ruimteVoorNieuweMelding leest alleen soort + AsyncLocalStorage (nooit een verzoek)',
      ruimteVoorNieuweMelding(dev.id, 'uitrol') === 'technisch' && ruimteVoorNieuweMelding(dev.id, 'security') === 'prive');

    // ------------------------------------------------------------------ 1 + 2: twee beelden, twee tellers
    const zP = await overzicht(tP), zT = await overzicht(tD);
    check('1. persoonlijk tabblad: alleen sfeer prive — geen «server», geen «tech-in-privelade», geen rij uit de technische lade, geen oude «siem»',
      zP.kinds === 'ondersteuning,security,security_warning' && zP.items.every((m) => m.ruimte === 'prive' && m.sfeer === 'prive') && !zP.items.some((m) => m.title === 'nieuw-server' || m.title === 'tech-in-privelade' || m.title === 'in-techlade' || m.title === 'oud-siem'), JSON.stringify(zP.kinds));
    check('1. technisch tabblad: alleen sfeer technisch — geen «security»; wél de persoonlijke soort die in de technische lade ontstond én de oude «siem» (22.10: etiket)',
      zT.kinds === 'access_decision,server,siem,siem,workspace_share' && zT.items.every((m) => m.sfeer === 'technisch') && zT.items.some((m) => m.title === 'in-techlade') && zT.items.some((m) => m.title === 'oud-siem' && m.ruimte === 'prive'), JSON.stringify(zT.kinds));
    check('2. de teller is per paneel: persoonlijk 3 ongelezen, technisch 5 — niet 8 in beide',
      zP.n === 3 && zT.n === 5, `${zP.n}/${zT.n}`);
    // Het scherm (shared/meldingen-ruimte.ts) volgt de sfeer van de server; zonder veld valt het terug op de soort.
    check('scherm: meldingenVoorRuimte volgt het veld van de server (sfeer) en valt zonder veld terug op de soort',
      meldingenVoorRuimte(zP.items, 'prive').length === 3 && meldingenVoorRuimte(zP.items, 'technisch').length === 0 && meldingenVoorRuimte(zT.items, 'technisch').length === 5
      && meldingenVoorRuimte([{ kind: 'siem' }, { kind: 'security' }], 'technisch').length === 1);

    // ------------------------------------------------------------------ 5. regressie: het oude overzicht lekte
    const ontvanger = await idx.meldingOntvanger(dev as never);
    const oudBeeld = filterVoorOntvanger(alle, ontvanger); // precies wat siteNotificationOverview vóór 20.10.2026 teruggaf: alles van de mens
    check('5. OUD gedrag nagebootst: zonder lade stond «server» (technisch) in het persoonlijke beeld en telde de badge alles (8)',
      oudBeeld.some((m) => m.title === 'nieuw-server') && oudBeeld.filter((m) => m.read !== true).length === 8, String(oudBeeld.length));
    check('5. NIEUW: hetzelfde filter mét lade laat «server» niet door in prive, en «security» niet in technisch',
      !meldingenInLade(oudBeeld, 'prive').some((m) => m.title === 'nieuw-server') && !meldingenInLade(oudBeeld, 'technisch').some((m) => m.title === 'nieuw-security'));

    // ------------------------------------------------------------------ 7. «gelezen» via de echte route: alleen de live lade
    const s = await sessie(dev.id);
    const allesP = await roep('/api/owner/notifications/read', s, {}, tP);
    const naP = await rijen(dev.id);
    check('7. «alles gelezen» in het PERSOONLIJKE tabblad: de persoonlijke (sfeer prive) gelezen, de technische ONGELEZEN — ook de oude «siem» in de persoonlijke lade',
      allesP.status === 200 && meldingenInLade(naP, 'prive').every((m) => m.read === true) && meldingenInLade(naP, 'technisch').every((m) => m.read !== true) && naP.find((m) => m.title === 'oud-siem')?.read !== true, JSON.stringify(allesP));
    const techId = String(r('nieuw-server')?.id);
    const eenInP = await roep('/api/owner/notifications/read', s, { notificationId: techId }, tP);
    check('7. één technische melding op gelezen zetten vanuit het persoonlijke tabblad: 404 (zij bestaat daar niet)',
      eenInP.status === 404, JSON.stringify(eenInP));
    const eenInT = await roep('/api/owner/notifications/read', s, { notificationId: techId }, tD);
    const naT = await rijen(dev.id);
    check('7. …en vanuit het technische tabblad: gelezen; de andere technische blijven ongelezen',
      eenInT.status === 200 && naT.find((m) => m.id === techId)?.read === true && naT.filter((m) => rijRuimte(m) === 'technisch' && m.id !== techId).every((m) => m.read !== true), JSON.stringify(eenInT));
    check('7. teller na het lezen: persoonlijk 0, technisch 4 (incl. de oude «siem»)', (await overzicht(tP)).n === 0 && (await overzicht(tD)).n === 4);
    check('bootstrap-route geeft het overzicht van de live lade mee (meldingenRuimte)',
      (await roep('/api/owner/session/bootstrap', s, {}, tD)).data.meldingenRuimte === 'technisch' && (await roep('/api/owner/session/bootstrap', s, {}, tP)).data.meldingenRuimte === 'prive');

    // ------------------------------------------------------------------ 3. gesloten en bevroren
    // Gesloten: de activering is voorbij → de live ruimte is prive → technische meldingen weg uit het beeld.
    await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [dev.id]);
    const dichtT = await overzicht(tD);
    check('3. GESLOTEN (activering voorbij): hetzelfde tabblad ziet alleen nog de persoonlijke lade',
      dichtT.ruimte === 'prive' && !dichtT.items.some((m) => m.ruimte === 'technisch'));
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'opnieuw', now() + interval '60 minutes')`, [dev.id, pid, tabHash(tD)]);
    check('3. …en zodra de activering terug is, zijn de technische meldingen er weer (niets is gewist)', (await overzicht(tD)).n === 4);
    // Bevroren: rechten weg (profiel ingetrokken) → bevriezing; de achtergrond schrijft door, het beeld toont niets technisch.
    await rs.keuzeZetten(dev.id, 'apart', dev.id);
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = now() WHERE user_id=$1`, [dev.id]);
    await rs.rechtenVerloren(dev.id, 'profiel-ingetrokken', 'system');
    await meld(dev.id, 'deur', 'tijdens-bevriezing', 'de achtergrond breekt niet');
    const bevT = await overzicht(tD);
    const bevRij = (await rijen(dev.id)).find((m) => m.title === 'tijdens-bevriezing');
    check('3. BEVROREN (rechten weg): technische meldingen onzichtbaar, ook in het tabblad met activering; de nieuwe technische melding is wél geschreven (technisch)',
      bevT.ruimte === 'prive' && !bevT.items.some((m) => m.ruimte === 'technisch') && bevRij?.ruimte === 'technisch' && bevRij?.read !== true, JSON.stringify(bevT.kinds));
    // Profiel terug maar de hub-lade nog bevroren (geen besluit van de eigenaar): dicht blijft dicht.
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [dev.id]);
    const halfT = await meldingenLade(dev.id, { tabContext: tD });
    check('3. profiel terug maar hub-lade «bevroren» → technische meldingen blijven dicht tot de servereigenaar beslist (reden «bevroren»)',
      halfT.ruimte === 'prive' && halfT.reden === 'bevroren' && (await rs.standVan(dev.id, 'bord')) === 'bevroren');

    // ------------------------------------------------------------------ 6. besluit van de servereigenaar: verwijderen wist alleen technisch
    const voorBesluit = await rijen(dev.id);
    const nTechVoor = voorBesluit.filter((m) => rijRuimte(m) === 'technisch').length, nPriveVoor = voorBesluit.filter((m) => rijRuimte(m) === 'prive').length;
    const weg = await rs.eigenaarsBesluit({ userId: dev.id, dienst: 'bord', besluit: 'verwijderen', eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const naBesluit = await rijen(dev.id);
    const regel = weg.verslag?.regels.find((x) => x.door === 'meldingen');
    check('6. «verwijderen» op de hub-lade wist ALLE technische meldingen (5) en laat elke persoonlijke staan — ook de oude «siem» zonder veld',
      nTechVoor === 5 && regel?.rijen === 5 && naBesluit.filter((m) => rijRuimte(m) === 'technisch').length === 0 && naBesluit.filter((m) => rijRuimte(m) === 'prive').length === nPriveVoor && naBesluit.some((m) => m.title === 'oud-siem'),
      `tech ${nTechVoor}→${naBesluit.filter((m) => rijRuimte(m) === 'technisch').length}, prive ${nPriveVoor}→${naBesluit.filter((m) => rijRuimte(m) === 'prive').length}, verslag ${JSON.stringify(regel)}`);
    // 22.10: de oude «siem» ligt in de persoonlijke LADE en wordt door het besluit niet gewist (regel: niets verhuist/verdwijnt); zij blijft in het technische paneel.
    check('6. na het besluit is de hub-lade niet meer bevroren en zijn technische meldingen weer bereikbaar (alleen de oude «siem» uit de persoonlijke lade)',
      (await meldingenLade(dev.id, { tabContext: tD })).ruimte === 'technisch' && (await overzicht(tD)).n === 1 && (await overzicht(tD)).kinds === 'siem');
    // Overdragen: de technische meldingen gaan naar de TECHNISCHE lade van de eigenaar (zoals het bord), e-mail eraf.
    await meld(dev.id, 'siem', 'over-te-dragen', '');
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen', bevroren_op=now(), bevroren_oorzaak='rol-weg', besluit='', besluit_op=NULL, verslag='{}'::jsonb WHERE user_id=$1 AND dienst='bord'`, [dev.id]);
    const over = await rs.eigenaarsBesluit({ userId: dev.id, dienst: 'bord', besluit: 'overdragen', eigenaarId, doorEigenaar: true, stapOpGedaan: true });
    const bijEigenaar = (await rijen(eigenaarId)).find((m) => m.title === 'over-te-dragen');
    check('6. «overdragen» zet de technische melding op de technische lade van de eigenaar en laat de persoonlijke van de mens staan',
      over.verslag?.regels.some((x) => x.door === 'meldingen' && x.rijen === 1) && bijEigenaar?.ruimte === 'technisch' && bijEigenaar?.recipientEmail === '' && bijEigenaar?.overgedragenVan === dev.id
      && !(await rijen(dev.id)).some((m) => m.title === 'over-te-dragen') && (await rijen(dev.id)).some((m) => m.title === 'oud-siem'));
    if (bijEigenaar) await pool.query(`DELETE FROM app.records WHERE tbl=$1 AND id=$2`, [MELDING_TABEL, bijEigenaar.id]);

    // ------------------------------------------------------------------ geen onbewaakte weg in de code
    const index = lees('backend/index.ts');
    check('code: notify() schrijft de lade bij het aanmaken (ruimteVoorNieuweMelding), de aanroeper kan haar niet meegeven',
      /createdAt: Date\.now\(\), ruimte: ruimteVoorNieuweMelding\(recipientUserId, kind\)/.test(index) && !/notify\([^)]*ruimte/.test(index));
    check('code: het overzicht, de teller en beide «gelezen»-routes gaan langs meldingenLade (live ruimte) — geen tweede waarheid',
      (index.match(/await meldingenLade\(/g) || []).length === 4 && /siteNotificationOverview\(user:User,herkomst/.test(index) && /ownerPayload\(updated,auth\.user,tabUpdated,auth\.tab\)/.test(index));
    check('code: in de eigenaarsroute reist de lade via het tabblad van de sessie (auth.tab); nergens een vrij veld «ruimte» uit de body',
      /lade=await meldingenLade\(auth\.user\.id,\{tabContext:auth\.tab,/.test(index) && !/meldingenLade\([^)]*body\.ruimte/.test(index));
    check('scherm: CanonicalChrome filtert nog steeds via meldingenVoorRuimte (dat nu het serverveld volgt) en het type kent «ruimte»',
      /meldingenVoorRuimte\(serverNotifications,ruimte\)/.test(lees('src/CanoniekOmlijsting.tsx')) && /ruimte\?:'prive'\|'technisch'/.test(lees('src/canoniek-meldingen.ts')));
    check('push: er is geen web-push/abonnement in de site (service-worker zonder push) — de enige weg is dit overzicht, dus de regel dekt alles',
      !/push|Notification/.test(lees('public/service-worker.js')) && !/PushManager|pushManager/.test(lees('src/main.tsx')));
  } finally {
    console.error = stil;
    await pool.query(`DELETE FROM app.records WHERE tbl=$1 AND (data->>'recipientUserId' = $2 OR data->>'overgedragenVan' = $2)`, [MELDING_TABEL, dev.id]).catch(() => undefined);
    if (sessies.length) await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id = ANY($1)`, [sessies]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='owner_tab_sessions_v1' AND data->>'userId'=$1`, [dev.id]).catch(() => undefined);
    for (const t of ['tech_activaties', 'tech_profielen', 'ruimte_dienst_stand', 'ruimte_keuze']) await pool.query(`DELETE FROM app.${t} WHERE user_id=$1`, [dev.id]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [dev.id]).catch(() => undefined);
    if (!bestaandeEigenaar) await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [eigenaarId]).catch(() => undefined);
    const { closePool } = await import('../../server/platform/pg');
    await closePool().catch(() => undefined);
  }
  return einde();
}
