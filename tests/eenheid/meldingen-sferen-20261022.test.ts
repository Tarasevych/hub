// SFEER VAN MELDINGEN: prive | technisch (22.10.2026, zone C). Klacht van de eigenaar: «звіти технічних сповіщень досі показуються в
// панелі сповіщень користувача … аудит, збої діагностики, дії агентів, звірка — чомусь досі попадають у панель» (99+/120 ongelezen).
// Register: shared/meldingen-soorten.ts; etiket op bestaande rijen: migrations/0107_meldingen_sfeer.sql; lezen per paneel:
// backend/meldingen-ruimte.ts (meldingenInLade = sfeer); activiteiten: backend/connectors-routes.ts (/api/owner/agents/activity).
//
// WAT DEZE TEST VASTHOUDT
//   1. REGISTER VOLLEDIG: elke soort uit shared/melding-soorten.ts én elke soort die backend/ met notify()/meld() maakt staat expliciet
//      in SFEER_PER_SOORT, met dezelfde sfeer als de ruimte van haar type. Een onbekende soort is technisch (nooit in de bel van de mens).
//   2. MIGRATIE 0107: de SQL-lijsten en -voorvoegsels zijn letterlijk die van het register; app.melding_sfeer geeft voor elke soort
//      hetzelfde als sfeerBijAanmaak; de UPDATE zet alleen `sfeer` (ontvanger/ruimte/read/tekst onaangeroerd), is idempotent en
//      raakt rijen die al een etiket hebben niet; de index bestaat.
//   3. SERVER: de bel van de gebruiker (siteNotificationOverview / bootstrap / notifications/read, persoonlijk tabblad) krijgt ALLEEN
//      sfeer 'prive' — ook een OUDE rij van een technische soort zonder `ruimte` (lade prive!) is weg uit de bel en staat in het
//      technische paneel; de teller telt alleen 'prive'. Technisch tabblad: alleen 'technisch'.
//   4. ACTIVITEITEN: /api/owner/agents/activity levert in een persoonlijk tabblad geen beheer-/uitrol-/diagnose-/SIEM-regels
//      (sfeerVanAuditActie), in een technisch tabblad alleen die; elke regel draagt `sfeer`.
//   5. REGRESSIE: het oude filter (lade) liet de oude technische rij in het persoonlijke beeld; het nieuwe (sfeer) niet.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { db } from '../../server/platform';
import { alsSysteem } from '../../server/platform/context';
import { auditToevoegen } from '../../server/platform/audit';
import { checker } from './hulp/nep-google';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { MELDING_TYPES } from '../../shared/melding-typen';
import { meldingRuimte, meldingenInLade, meldingenVoorRuimte, rijRuimte, rijenVanLade } from '../../shared/meldingen-ruimte';
import {
  PRIVE_SOORTEN, PRIVE_VOORVOEGSEL_BRON, SFEER_PER_SOORT, TECHNISCHE_SOORTEN, TECHNISCH_VOORVOEGSEL_BRON, activiteitenVanSfeer, isGeregistreerdeSoort,
  activiteitNaamUitJournaal, meldingenVanSfeer, ontbrekendeSoorten, sfeerBijAanmaak, sfeerVanActiviteit, sfeerVanAuditActie, sfeerVanRij, sfeerVanSoort, sqlLijst,
} from '../../shared/meldingen-soorten';
import { tabHash } from '../../backend/tech-profiel';
import { meld } from '../../backend/melder';
import { MELDING_TABEL, meldingenLade, sfeerVoorNieuweMelding } from '../../backend/meldingen-ruimte';
import { siteEventsFromAudit } from '../../backend/site-activiteit';
import { ALLEEN_BEHEER_HULPMIDDELEN } from '../../backend/connectors-routes';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'id.tarasevych.com';
const W = process.cwd();
const lees = (f: string) => readFileSync(join(W, f), 'utf8');
const bestanden = (map: string): string[] => readdirSync(join(W, map)).flatMap((n) => { const p = `${map}/${n}`; return statSync(join(W, p)).isDirectory() ? bestanden(p) : /\.(ts|mts)$/.test(n) ? [p] : []; });
type Rij = Record<string, unknown> & { id: string };

/** Argumenten van een aanroep tot het sluitende haakje (strings, template-literals en geneste haakjes correct overgeslagen). */
function argumenten(s: string, start: number): string {
  let diep = 1, i = start;
  for (; i < s.length && diep > 0; i++) {
    const c = s[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++; continue; }
    if (c === '`') { let d = 0; for (i++; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '$' && s[i + 1] === '{') { d++; i++; continue; } if (s[i] === '}' && d) { d--; continue; } if (s[i] === '`' && !d) break; } continue; }
    if (c === '(') diep++; else if (c === ')') diep--;
  }
  return s.slice(start, i - 1);
}
/** Soorten in notify()/meld()-aanroepen van backend/ — dezelfde regel als tests/eenheid/melding-soorten.test.ts (beproefd): elke stringliteraal
 *  in de argumenten met `_` of `.` (of een bekende enkelvoudige soort), behalve vergelijkingen (staat === 'verlopen' ? …). Met de
 *  haakjes-parser hierboven ook bij geneste haakjes in het eerste argument (meld(String(rows[0].id), 'uitrol.mislukt', …)). */
function serverSoorten(): Map<string, string> {
  const uit = new Map<string, string>();
  for (const f of bestanden('backend')) {
    const s = lees(f);
    for (const m of s.matchAll(/\b(?:meld|notify)\(/g)) {
      const stuk = argumenten(s, m.index! + m[0].length);
      if (/^\s*(?:userId|recipientUserId)\s*:/.test(stuk) || /^[a-zA-Z]+:\s*string/.test(stuk)) continue; // definitie, geen aanroep
      for (const l of stuk.matchAll(/(===\s*)?'([a-z][a-z0-9_.]*[a-z0-9])'/g)) {
        if (l[1]) continue;
        if (!/[_.]/.test(l[2]) && !MELDING_SOORTEN[l[2]] && !/^(security|server|deur|siem|uitrol|release|impersonatie|ondersteuning)$/.test(l[2])) continue;
        uit.set(l[2], f);
      }
    }
  }
  // soorten van notification_jobs (kind: '…' in een db.add('notification_jobs', …))
  for (const f of bestanden('backend')) { const s = lees(f); const re2 = /db\.add\('notification_jobs'[\s\S]{0,400}?kind:\s*'([a-z][a-z0-9_.]+)'/g; let m: RegExpExecArray | null; while ((m = re2.exec(s))) if (!uit.has(m[1])) uit.set(m[1], f); }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-sferen-20261022');
  const pool = getPool('systeem');
  const idx = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');
  const sfx = randomBytes(4).toString('hex');
  const stil = console.error; console.error = () => {};
  const sessies: string[] = [];
  const gemaakt: string[] = [];

  const mk = async (email: string, role = 'member') => {
    const id = randomUUID(); gemaakt.push(id);
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved', name: email, entitlements: ['api-platform'] }]);
    return { id, email, role, status: 'approved' as const, entitlements: ['api-platform'] };
  };
  const rijen = async (userId: string): Promise<Rij[]> => (await pool.query(`SELECT id, data FROM app.records WHERE tbl=$1 AND data->>'recipientUserId'=$2 ORDER BY seq`, [MELDING_TABEL, userId])).rows.map((r) => ({ ...(r.data as object), id: String(r.id) } as Rij));
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
    // ------------------------------------------------------------------ 1. register volledig
    const ontbreekt = ontbrekendeSoorten();
    check(`1. elke soort uit shared/melding-soorten.ts (${Object.keys(MELDING_SOORTEN).length}) staat expliciet in SFEER_PER_SOORT`, ontbreekt.length === 0, ontbreekt.join(','));
    const scheef = Object.entries(MELDING_SOORTEN).filter(([k, i]) => MELDING_TYPES[i.type].ruimte !== SFEER_PER_SOORT[k]).map(([k]) => k);
    check('1. de sfeer per soort is dezelfde als de ruimte van haar type (geen tweede waarheid)', scheef.length === 0, scheef.join(','));
    const extra = Object.keys(SFEER_PER_SOORT).filter((k) => !(k in MELDING_SOORTEN));
    check('1. het register kent geen soorten die melding-soorten.ts niet kent', extra.length === 0, extra.join(','));
    const gebruikt = serverSoorten();
    const nietGereg = [...gebruikt.entries()].filter(([k]) => !isGeregistreerdeSoort(k)).map(([k, f]) => `${k} (${f})`);
    check(`1. elke soort die backend/ maakt (${gebruikt.size} gevonden) is geregistreerd — een nieuwe soort zonder sfeer laat deze test falen`, gebruikt.size >= 20 && nietGereg.length === 0 && gebruikt.has('uitrol.mislukt') && gebruikt.has('beveiliging.zekering') && gebruikt.has('impersonatie.beheerder'), `${nietGereg.join('; ')} · gevonden: ${[...gebruikt.keys()].sort().join(',')}`);
    check('1. onbekende soort → technisch; aantoonbaar persoonlijk voorvoegsel → prive; technisch voorvoegsel → technisch',
      sfeerVanSoort('ietsnieuws') === 'technisch' && sfeerVanSoort('') === 'technisch' && sfeerVanSoort('mail_nieuw') === 'prive' && sfeerVanSoort('agenda.x') === 'prive'
      && sfeerVanSoort('diag.storing') === 'technisch' && sfeerVanSoort('rook.kapot') === 'technisch' && sfeerVanSoort('besluit.klaar') === 'technisch' && sfeerVanSoort('UITROL.MISLUKT') === 'technisch');
    check('1. aanmaken: technische soort → technisch (ook in prive-lade); persoonlijke soort → lade beslist (technisch ⇒ technisch)',
      sfeerBijAanmaak('uitrol', 'prive') === 'technisch' && sfeerBijAanmaak('security') === 'prive' && sfeerBijAanmaak('security', 'technisch') === 'technisch' && sfeerBijAanmaak('ai_bevestiging', 'prive') === 'prive');
    check('1. opgeslagen rij: veld wint; zonder veld → lade technisch ⇒ technisch, anders de soort',
      sfeerVanRij({ sfeer: 'prive', kind: 'siem' }) === 'prive' && sfeerVanRij({ ruimte: 'technisch', kind: 'security' }) === 'technisch' && sfeerVanRij({ kind: 'siem' }) === 'technisch' && sfeerVanRij({ kind: 'security' }) === 'prive' && sfeerVanRij(null) === 'technisch');

    // ------------------------------------------------------------------ 2. migratie 0107
    const mig = lees('migrations/0107_meldingen_sfeer.sql');
    check('2. 0107 bevat letterlijk de persoonlijke en technische lijst van het register', mig.includes(`IN (${sqlLijst(PRIVE_SOORTEN)}) THEN 'prive'`) && mig.includes(`IN (${sqlLijst(TECHNISCHE_SOORTEN)}) THEN 'technisch'`));
    check('2. 0107 bevat letterlijk de voorvoegsels van het register (technisch vóór persoonlijk, rest technisch)',
      mig.indexOf(`~ '${TECHNISCH_VOORVOEGSEL_BRON}' THEN 'technisch'`) > 0 && mig.indexOf(`~ '${PRIVE_VOORVOEGSEL_BRON}' THEN 'prive'`) > mig.indexOf(`~ '${TECHNISCH_VOORVOEGSEL_BRON}'`) && /ELSE 'technisch'/.test(mig));
    check('2. 0107 raakt alleen rijen ZONDER etiket en alleen het veld sfeer (geen DELETE, geen ALTER TABLE, geen ontvanger/ruimte)',
      /\(data->>'sfeer'\) IS NULL/.test(mig) && !/\bDELETE\s+FROM\b|\bALTER\s+TABLE\b/i.test(mig.replace(/--[^\n]*/g, '')) && !/jsonb_build_object\('(recipientUserId|ruimte|recipientEmail)'/.test(mig));
    const dev = await mk(`dev-sfeer-${sfx}@eenheid.test`);
    const nu = Date.now();
    // «wat er al was»: rijen van vóór 20.10 (geen ruimte, geen sfeer) + een rij met technische lade + een rij met verkeerd etiket (moet blijven)
    const ids = await alsSysteem(() => db.add(MELDING_TABEL, [
      { recipientUserId: dev.id, recipientEmail: '', kind: 'server', title: 'oud-uitrol', message: '', read: false, createdAt: nu - 5000 }, // «server» (diagnose.lezen) — zichtbaar voor de rol beheerder; de eigenaar ziet alles
      { recipientUserId: dev.id, recipientEmail: '', kind: 'siem', title: 'oud-siem', message: '', read: false, createdAt: nu - 4000 },
      { recipientUserId: dev.id, recipientEmail: '', kind: 'security_warning', title: 'oud-sec', message: '', read: false, createdAt: nu - 3000 },
      { recipientUserId: dev.id, recipientEmail: '', kind: 'security', title: 'techlade-sec', message: '', read: false, createdAt: nu - 2000, ruimte: 'technisch' },
      { recipientUserId: dev.id, recipientEmail: '', kind: 'siem', title: 'al-geetiketteerd', message: '', read: true, createdAt: nu - 1000, ruimte: 'prive', sfeer: 'prive' },
      { recipientUserId: dev.id, recipientEmail: '', kind: 'nooit_gezien_soort', title: 'onbekend', message: '', read: false, createdAt: nu - 500 },
    ]));
    await pool.query(`UPDATE app.records SET data = data - 'ruimte' - 'sfeer' WHERE tbl=$1 AND data->>'recipientUserId'=$2 AND data->>'title' IN ('oud-uitrol','oud-siem','oud-sec','onbekend')`, [MELDING_TABEL, dev.id]);
    await pool.query(`UPDATE app.records SET data = data - 'sfeer' WHERE tbl=$1 AND data->>'recipientUserId'=$2 AND data->>'title' = 'techlade-sec'`, [MELDING_TABEL, dev.id]);
    const jobId = (await alsSysteem(() => db.add('notification_jobs', [{ channel: 'email', recipient: 'x', recipientUserId: dev.id, kind: 'access_request', status: 'waiting_integration', createdAt: nu }])))[0];
    const voor = await rijen(dev.id);
    const migPool = getPool('migratie');
    await migPool.query(mig); await migPool.query(mig);
    const na = await rijen(dev.id);
    const byT = (t: string) => na.find((m) => m.title === t);
    check('2. 0107 draait twee keer zonder fout en maakt de index', (await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='records_meldingen_sfeer_idx'`)).rows.length === 1);
    check('2. etiket: oude technische soorten (lade prive) → technisch; oude persoonlijke → prive; technische lade met persoonlijke soort → technisch; onbekend → technisch',
      byT('oud-uitrol')?.sfeer === 'technisch' && byT('oud-siem')?.sfeer === 'technisch' && byT('oud-sec')?.sfeer === 'prive' && byT('techlade-sec')?.sfeer === 'technisch' && byT('onbekend')?.sfeer === 'technisch', JSON.stringify(na.map((m) => [m.title, m.sfeer])));
    check('2. een rij die al een etiket had, blijft zoals ze was (idempotent, geen herclassificatie)', byT('al-geetiketteerd')?.sfeer === 'prive');
    check('2. niets verhuisde: ontvanger, lade (ruimte), read en tekst zijn per rij ongewijzigd',
      voor.every((v) => { const n = na.find((x) => x.id === v.id)!; return n && n.recipientUserId === v.recipientUserId && (n.ruimte ?? null) === (v.ruimte ?? null) && n.read === v.read && n.title === v.title && rijRuimte(n) === rijRuimte(v); }));
    check('2. notification_jobs krijgt hetzelfde etiket', (await pool.query('SELECT data->>$2 AS s FROM app.records WHERE id=$1', [jobId, 'sfeer'])).rows[0]?.s === 'technisch');
    // app.melding_sfeer ⇔ sfeerBijAanmaak voor elke geregistreerde soort, voorvoegselsoorten en onbekenden, in beide laden
    const proef = [...Object.keys(SFEER_PER_SOORT), 'diag.storing', 'rook.kapot', 'mail_nieuw', 'agenda.x', 'agent.grant.verlopen', 'ssh-ca', 'remote.x', 'ietsnieuws', '', 'Security', 'AI_BEVESTIGING'];
    const verschil: string[] = [];
    for (const k of proef) for (const r of ['prive', 'technisch', null]) {
      const sql = (await pool.query('SELECT app.melding_sfeer($1,$2) AS s', [k, r])).rows[0].s;
      if (sql !== sfeerBijAanmaak(k, r ?? undefined)) verschil.push(`${k}/${r}: sql=${sql} ts=${sfeerBijAanmaak(k, r ?? undefined)}`);
    }
    check(`2. app.melding_sfeer geeft voor ${proef.length} soorten × 3 laden precies sfeerBijAanmaak`, verschil.length === 0, verschil.slice(0, 5).join('; '));

    // ------------------------------------------------------------------ 3. server: de bel krijgt alleen prive
    const tD = tab(), tP = tab();
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['beheerder'],60,'test')`, [dev.id, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [dev.id])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'eenheidstest sferen', now() + interval '60 minutes')`, [dev.id, pid, tabHash(tD)]);
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [dev.id]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [dev.id]);
    await meld(dev.id, 'server', 'nieuw-server', 'achtergrond');
    await meld(dev.id, 'security', 'nieuw-security', 'persoonlijk');
    const alle = await rijen(dev.id);
    check('3. notify() zet sfeer bij het aanmaken: server → technisch, security → prive; sfeerVoorNieuweMelding idem',
      alle.find((m) => m.title === 'nieuw-server')?.sfeer === 'technisch' && alle.find((m) => m.title === 'nieuw-security')?.sfeer === 'prive' && sfeerVoorNieuweMelding(dev.id, 'uitrol') === 'technisch' && sfeerVoorNieuweMelding(dev.id, 'security') === 'prive');
    const overzicht = async (t?: string) => { const r = await idx.siteNotificationOverview(dev as never, { tabContext: t }); return { titels: r.notificationItems.map((m) => m.title).sort().join(','), n: r.notifications, ruimte: r.meldingenRuimte, items: r.notificationItems }; };
    const zP = await overzicht(tP), zT = await overzicht(tD);
    check('3. PERSOONLIJK tabblad: alleen sfeer prive — de oude «server» en «siem» (lade prive!) zijn WEG uit de bel, de onbekende soort ook',
      zP.titels === 'al-geetiketteerd,nieuw-security,oud-sec' && zP.items.every((m) => m.sfeer === 'prive') && zP.ruimte === 'prive', zP.titels);
    check('3. teller van de bel: alleen de ongelezen persoonlijke (2), niet 99+', zP.n === 2, String(zP.n));
    check('3. TECHNISCH tabblad: alleen sfeer technisch — de oude rijen uit de persoonlijke lade erbij (etiket), de persoonlijke weg',
      zT.titels === 'nieuw-server,onbekend,oud-siem,oud-uitrol,techlade-sec' && zT.items.every((m) => m.sfeer === 'technisch') && zT.ruimte === 'technisch', zT.titels);
    check('3. teller technisch: 5 ongelezen', zT.n === 5, String(zT.n));
    check('3. de LADE van de oude rijen is onveranderd (bevriezen/overdragen/wissen zien ze nog als persoonlijk): rijenVanLade ≠ meldingenInLade',
      rijenVanLade(alle, 'prive').some((m) => m.title === 'oud-uitrol') && !meldingenInLade(alle, 'prive').some((m) => m.title === 'oud-uitrol') && meldingenInLade(alle, 'technisch').some((m) => m.title === 'oud-uitrol'));
    const s = await sessie(dev.id);
    const boot = await roep('/api/bootstrap', s, {}, tP);
    check('3. /api/bootstrap telt alleen de persoonlijke sfeer (2)', boot.status === 200 && boot.data.notifications === 2, JSON.stringify(boot.data.notifications));
    const oudTechId = String(alle.find((m) => m.title === 'oud-uitrol')?.id);
    const leesP = await roep('/api/owner/notifications/read', s, { notificationId: oudTechId }, tP);
    check('3. «gelezen» op de oude technische rij vanuit het persoonlijke tabblad: 404 — zij bestaat daar niet meer', leesP.status === 404, JSON.stringify(leesP));
    const allesP = await roep('/api/owner/notifications/read', s, {}, tP);
    const naLezen = await rijen(dev.id);
    check('3. «alles gelezen» in het persoonlijke tabblad raakt alleen sfeer prive; de technische (ook de oude in de prive-lade) blijven ongelezen',
      allesP.status === 200 && meldingenVanSfeer(naLezen, 'prive').every((m) => m.read === true) && meldingenVanSfeer(naLezen, 'technisch').filter((m) => m.title !== 'al-geetiketteerd').every((m) => m.read !== true));
    const leesT = await roep('/api/owner/notifications/read', s, { notificationId: oudTechId }, tD);
    check('3. …en vanuit het technische tabblad wél (200, gelezen)', leesT.status === 200 && (await rijen(dev.id)).find((m) => m.id === oudTechId)?.read === true, JSON.stringify(leesT));
    check('3. scherm: meldingenVoorRuimte volgt het serverveld sfeer (oude siem met sfeer technisch niet in de bel; zonder veld: de soort)',
      meldingenVoorRuimte([{ kind: 'siem', ruimte: 'prive', sfeer: 'technisch' }], 'prive').length === 0 && meldingenVoorRuimte([{ kind: 'siem', ruimte: 'prive', sfeer: 'technisch' }], 'technisch').length === 1
      && meldingRuimte('security', undefined, 'technisch', 'prive') === 'prive' && meldingenVoorRuimte([{ kind: 'siem' }, { kind: 'security' }], 'technisch').length === 1);

    // ------------------------------------------------------------------ 4. activiteiten
    check('4. auditacties: beheer/uitrol/diagnose/SIEM/звірка/besluit/rook → technisch; post/agenda/github/eigen sessie → prive; technische context wint',
      ['owner.admin.user.updated', 'owner.uitrol.diagnose', 'diag.storing', 'owner.siem.gelezen', 'owner.admin.rls.bekeken', 'besluit.klaar', 'rook.kapot', 'owner.tech.beeindigd', 'owner.terminal.geopend', 'owner.ssh-ca.uitgegeven', 'owner.api.vault.rotated', 'secret.gewijzigd', 'uitrol_gestart', 'owner.ondersteuning.toegestaan'].every((a) => sfeerVanAuditActie(a) === 'technisch')
      && ['owner.mail.send.committed', 'owner.calendar.x', 'owner.github.issue_create', 'owner.session.revoked.one', 'owner.browser.grant.created', 'owner.mcp.grant.approved', 'owner.mcp.tool', 'owner.access.requested', 'owner.privacy.export', 'account.deleted'].every((a) => sfeerVanAuditActie(a) === 'prive')
      && sfeerVanAuditActie('owner.mcp.tool', { profiel: 'ja' }) === 'technisch' && sfeerVanAuditActie('owner.mail.send.committed', { activatie: 'ja' }) === 'technisch');
    check('4. activiteiten: apparaat met ruimte technisch → technisch; eigen apparaat/toestemming → prive; hulpmiddel _beheer → technisch; opgeslagen sfeer wint',
      sfeerVanActiviteit({ kind: 'command', ruimte: 'technisch' }) === 'technisch' && sfeerVanActiviteit({ kind: 'command', ruimte: 'prive' }) === 'prive' && sfeerVanActiviteit({ kind: 'grant' }) === 'prive'
      && sfeerVanActiviteit({ kind: 'tool', type: 'uitvoeren_opdracht_beheer' }) === 'technisch' && sfeerVanActiviteit({ kind: 'tool', type: 'lezen_bericht_gebruiker' }) === 'prive' && sfeerVanActiviteit({ kind: 'site', type: 'owner.admin.x', sfeer: 'prive' }) === 'prive'
      && activiteitenVanSfeer([{ kind: 'site', type: 'owner.admin.x' }, { kind: 'site', type: 'owner.mail.x' }], 'prive').length === 1);
    const ev = siteEventsFromAudit([{ id: '1', action: 'owner.mail.send.committed', result: 'success', createdAt: nu, context: { profiel: 'tech-abcdef', activatie: randomUUID() } }, { id: '2', action: 'owner.admin.user.updated', result: 'success', createdAt: nu }]);
    check('4. site-activity geeft alleen de VLAG van de technische context door (nooit het profiel-id), zodat de sfeer klopt',
      ev.length === 2 && ev[0].context?.profiel === 'ja' && !JSON.stringify(ev).includes('tech-abcdef') && sfeerVanActiviteit(ev[0]) === 'technisch' && sfeerVanActiviteit(ev[1]) === 'technisch');
    // 23.10: een AI-actie via de TECHNISCHE koppeling (owner.mcp.tool met details.ruimte 'technisch' of v2-naam «…_beheer») is technisch,
    // dezelfde actie via de persoonlijke koppeling persoonlijk; een apparaat/browser in het technische slot (details.ruimte) ook technisch.
    const ai = siteEventsFromAudit([
      { id: '3', action: 'owner.mcp.tool', result: 'success', createdAt: nu, details: { tool: 'lezen_bestand', ruimte: 'technisch', v2: 'lezen_bestand_claude_mcp_tarasevych_com_beheer' } },
      { id: '4', action: 'owner.mcp.tool', result: 'success', createdAt: nu, details: { tool: 'lezen_bericht', ruimte: 'prive', v2: 'lezen_bericht_claude_mail_gmail_tarasevych_com_gebruiker' } },
      { id: '5', action: 'owner.mcp.tool', result: 'denied', createdAt: nu, details: { tool: 'x', v2: 'uitvoeren_opdracht_claude_mcp_tarasevych_com_beheer' } },
      { id: '6', action: 'owner.agent.paired', result: 'success', createdAt: nu, details: { ruimte: 'technisch' } },
    ]);
    check('4. AI-acties: technische koppeling (ruimte of «…_beheer») → technisch, persoonlijke koppeling → prive; apparaat in het technische slot → technisch',
      ai.map((e) => sfeerVanActiviteit(e)).join(',') === 'technisch,prive,technisch,technisch' && !JSON.stringify(ai).includes('"lade"'), JSON.stringify(ai.map((e) => [e.id, e.ruimte])));
    // 23.10 (stand): één paginalading van de hub in een technisch tabblad zonder keuze schreef tientallen «owner.ruimte.geweigerd» — in de
    // oude bel «Дія на сайті: ruimte geweigerd · виконано» (het Nederlandse resultaat telde niet als weigering). Nu: geen activiteit (journaal
    // houdt ze), en een Nederlandse weigering/mislukking krijgt de juiste stand.
    const nl = siteEventsFromAudit([
      { id: '7', action: 'owner.ruimte.geweigerd', result: 'geweigerd', createdAt: nu, details: { ruimte: 'technisch', stand: 'leeg' } },
      { id: '8', action: 'owner.ruimte.bevroren', result: 'geweigerd', createdAt: nu, details: {} },
      { id: '9', action: 'owner.tech.geactiveerd', result: 'mislukt', createdAt: nu },
      { id: '10', action: 'owner.mail.send.committed', result: 'denied', createdAt: nu },
    ]);
    check('4. poortweigeringen (owner.ruimte.geweigerd) zijn geen activiteit; «geweigerd» → відхилено (rejected), «mislukt» → помилка (failed); Engels gedrag ongewijzigd',
      nl.length === 3 && !nl.some((e) => e.type === 'owner.ruimte.geweigerd') && nl[0].status === 'rejected' && nl[1].status === 'failed' && nl[2].status === 'failed', JSON.stringify(nl.map((e) => [e.type, e.status])));
    const alleenBeheer = [...ALLEEN_BEHEER_HULPMIDDELEN];
    const beideKanten = [...new Set(V2_OPTIES.filter((o) => o.intern && V2_OPTIES.some((x) => x.intern === o.intern && x.kant !== o.kant)).map((o) => o.intern!))];
    check(`4. catalogus: ${alleenBeheer.length} hulpmiddelen bestaan alleen aan de beheerkant (bv. releases/server) en geen ervan ook aan de gebruikerskant`,
      alleenBeheer.length >= 3 && alleenBeheer.every((n) => !V2_OPTIES.some((o) => o.intern === n && o.kant === 'gebruiker')) && beideKanten.length > 0 && beideKanten.every((n) => !ALLEEN_BEHEER_HULPMIDDELEN.has(n)), alleenBeheer.slice(0, 6).join(','));
    check('4. namen: technische actie zonder label → rubriek van het logboek, nooit de interne code; met label → het label; persoonlijk zonder label → null',
      activiteitNaamUitJournaal('owner.siem.gelezen', 'uk', true) === 'Дія в розділі «Діагностика»' && activiteitNaamUitJournaal('owner.tech.geactiveerd', 'uk', true) === 'Активовано технічний профіль'
      && activiteitNaamUitJournaal('owner.iets.nieuws', 'uk', true) === 'Дія в технічному просторі' && activiteitNaamUitJournaal('owner.iets.nieuws', 'nl', false) === null
      && activiteitNaamUitJournaal('owner.uitrol.diagnose', 'nl', true)?.startsWith('Actie in «') === true && !/gelezen|siem/i.test(activiteitNaamUitJournaal('owner.siem.gelezen', 'uk', true) || ''));
    // echte route: wachtrij-aanroepen van hulpmiddelen (app.connector_tool_calls kent geen ruimte)
    await pool.query(`INSERT INTO app.connector_tool_calls (user_id, tool, args, status, finished_at) VALUES ($1,$2,'{}'::jsonb,'succeeded',now()), ($1,$3,'{}'::jsonb,'succeeded',now())`, [dev.id, alleenBeheer[0], beideKanten[0]]);
    // echte route: audit van dev met een beheeractie en een postactie
    await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.admin.user.updated', result: 'success', details: {} });
    await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.mail.send.committed', result: 'success', details: {} });
    await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.siem.gelezen', result: 'failure', details: {} });
    const actP = await roep('/api/owner/agents/activity', s, {}, tP);
    const actT = await roep('/api/owner/agents/activity', s, {}, tD);
    const typesVan = (d: Record<string, unknown>) => ((d.events as Array<{ type: string; sfeer?: string }>) || []).map((e) => e.type);
    check('4. /api/owner/agents/activity, persoonlijk tabblad: de postactie en het hulpmiddel van beide kanten wél, beheer, SIEM en het beheer-hulpmiddel niet; elke regel sfeer prive',
      actP.status === 200 && actP.data.sfeer === 'prive' && typesVan(actP.data).includes('owner.mail.send.committed') && typesVan(actP.data).includes(beideKanten[0]) && !typesVan(actP.data).includes(alleenBeheer[0]) && !typesVan(actP.data).some((t) => /admin|siem/.test(t)) && ((actP.data.events as Array<{ sfeer?: string }>) || []).every((e) => e.sfeer === 'prive'), JSON.stringify(typesVan(actP.data)));
    check('4. …technisch tabblad: beheer, SIEM en het beheer-hulpmiddel wél, de postactie niet; alles sfeer technisch; geen intern veld «ruimte» naar de browser',
      actT.status === 200 && actT.data.sfeer === 'technisch' && typesVan(actT.data).includes('owner.admin.user.updated') && typesVan(actT.data).includes('owner.siem.gelezen') && typesVan(actT.data).includes(alleenBeheer[0]) && !typesVan(actT.data).includes('owner.mail.send.committed') && ((actT.data.events as Array<{ sfeer?: string; ruimte?: unknown }>) || []).every((e) => e.sfeer === 'technisch' && e.ruimte === undefined), JSON.stringify(typesVan(actT.data)));

    // 23.10 (integratie, stand H-EIND): het venster van de route was «de nieuwste 120 auditregels van alles», pas daarna de sfeer. Na een
    // drukke sessie (ruis + de andere sfeer) viel de technische actie uit het paneel van de band. Nu: ruis en andere sfeer al in SQL eruit.
    for (let i = 0; i < 160; i++) await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.ruimte.geweigerd', result: 'geweigerd', details: { ruimte: 'technisch' } });
    for (let i = 0; i < 130; i++) await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.mail.item.read', result: 'success', details: {} });
    for (let i = 0; i < 130; i++) await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.calendar.event.created', result: 'success', details: {} });
    const actT2 = await roep('/api/owner/agents/activity', s, {}, tD);
    check('4. venster: na 160 poortweigeringen en 260 persoonlijke acties ziet het technische tabblad zijn SIEM- en beheeractie nog',
      actT2.status === 200 && typesVan(actT2.data).includes('owner.siem.gelezen') && typesVan(actT2.data).includes('owner.admin.user.updated') && !typesVan(actT2.data).includes('owner.ruimte.geweigerd'), typesVan(actT2.data).slice(0, 8).join(','));
    for (let i = 0; i < 260; i++) await auditToevoegen({ ownerId: dev.id, actorId: dev.id, action: 'owner.admin.user.updated', result: 'success', details: {} });
    const actP2 = await roep('/api/owner/agents/activity', s, {}, tP);
    check('4. venster: na 260 beheeracties ziet het persoonlijke tabblad zijn postactie nog (en geen enkele beheeractie)',
      actP2.status === 200 && typesVan(actP2.data).includes('owner.mail.send.committed') && !typesVan(actP2.data).includes('owner.admin.user.updated'), typesVan(actP2.data).slice(0, 8).join(','));

    // ------------------------------------------------------------------ 5. regressie
    const oudFilter = rijenVanLade(alle, 'prive'); // het filter van 20.10 (lade): de oude «uitrol.mislukt» stond in het persoonlijke beeld
    check('5. OUD nagebootst: het lade-filter liet de oude technische rij in de bel van de gebruiker staan; het sfeer-filter niet',
      oudFilter.some((m) => m.title === 'oud-uitrol') && !meldingenInLade(alle, 'prive').some((m) => m.title === 'oud-uitrol'));
    // de UI-code: de bel filtert activiteiten op haar sfeer en geeft technische aan het paneel in de band
    const cnc = lees('src/CanoniekMeldingencentrum.tsx'), tm = lees('src/meldingen/TechMeldingen.tsx'), chrome = lees('src/CanoniekOmlijsting.tsx');
    check('5. UI: de bel toont alleen activiteiten van haar eigen sfeer, geeft technische aan de band door, en CanonicalChrome geeft de sfeer mee',
      /activiteitenVanSfeer\(activity\.events,\s*belSfeer\)/.test(cnc) && /zetTechActiviteit\(activiteitenVanSfeer\(activity\.events,\s*'technisch'\)/.test(cnc) && /sfeer=\{ruimte\}/.test(chrome) && /data-tm-activiteit/.test(tm) && /ongelezenTechActiviteit/.test(tm));
    const npb = lees('src/MeldingenpaneelInhoud.tsx'), npcss = lees('src/meldingenpaneel.css'), mcss = lees('src/meldingen/meldingen.css');
    check('5. UI: elke rij in de bel draagt data-sfeer van de server; het paneel voegt gelijke activiteiten samen («N×», «Прочитано» voor de groep); op de telefoon geen lijst-in-lijst',
      /data-sfeer=\{item\.sfeer\}/.test(npb) && /origin: 'server', sfeer: r\.sfeer/.test(npb) && /origin: 'activity', sfeer: e\.sfeer/.test(npb)
      && /data-tm-aantal=\{ids\.length\}/.test(tm) && /for \(const id of ids\) leesActiviteit\(id\)/.test(tm) && /\.tm-paneel \.tm-lijst \{ max-height: none/.test(mcss));
    check('5. contrast: gelezen rijen in de bel worden niet meer als geheel doorschijnend gemaakt (de meta-tekst zakte onder 4.5:1)', !/\.cnc-row\.is-read\{opacity/.test(npcss) && /\.cnc-row\.is-read \.cnc-icon\{opacity/.test(npcss));
  } finally {
    console.error = stil;
    for (const uid of gemaakt) {
      await pool.query(`DELETE FROM app.records WHERE tbl IN ($1,'notification_jobs') AND data->>'recipientUserId'=$2`, [MELDING_TABEL, uid]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
      await pool.query('DELETE FROM app.connector_tool_calls WHERE user_id=$1', [uid]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [uid]).catch(() => undefined);
    }
    if (sessies.length) await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id = ANY($1)`, [sessies]).catch(() => undefined);
  }
  // ---------------------------------------------------------------- 23.10 (integratie): nieuwe acties van de andere zones
  // De stand H-EIND vond «Дія на сайті: extensie matrix» in de bel van de mens: de matrix «Браузер і агенти» (zone E) is beheer van AI-toegang.
  check('integratie: owner.extensie.matrix en .modi zijn technisch (nooit in de bel van de mens)',
    sfeerVanAuditActie('owner.extensie.matrix') === 'technisch' && sfeerVanAuditActie('owner.extensie.matrix.modi') === 'technisch'
    && sfeerVanActiviteit({ kind: 'site', type: 'owner.extensie.matrix' }) === 'technisch');
  check('integratie: een chatbericht in het zijpaneel van de extensie is geen melding (alleen journaal)',
    siteEventsFromAudit([{ id: 'x1', action: 'owner.extensie.zijpaneel.chat', result: 'success', createdAt: Date.now() }]).length === 0);
  check('integratie: de journaalnaam van de matrix is leesbare tekst, geen code',
    activiteitNaamUitJournaal('owner.extensie.matrix', 'uk', true) === 'Змінено дозволи «Браузер і агенти»'
    && activiteitNaamUitJournaal('owner.extensie.matrix.modi', 'nl', true) === 'Modi van hulpmiddelen «Browser en agenten» gewijzigd');
  return einde();
}
