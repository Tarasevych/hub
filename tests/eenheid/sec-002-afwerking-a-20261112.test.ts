// SEC-002, завершальний крок «A» (сервер і безпека): регресійні перевірки для пунктів, які групи відклали.
// SEC-002, afwerking «A» (server en beveiliging): regressietests voor de punten die de groepen hebben uitgesteld.
//  1. Zekering van de beschermingen: alleen fouten van de bescherming zelf (RLS 42501, 401 van de poort, OPA) zetten automatisch uit;
//     een 500 door invoer van een gebruiker zet NIETS uit (alleen een voorstel aan de eigenaar, met journaalregel).
//  2. De rol «alleen bekijken» (viewer) mag op de HELE routetabel alleen lezen (plus eigen instellingen en afmelden); weigeringen in het journaal.
//  3. Step-up: «controleren en verbruiken» ondeelbaar per account (metStapOpEenmalig, stapOpVerbruikIndienGeldig, slot rond elke schrijfactie).
//  4. Afkappen zonder halve emoji (shared/tekst-veilig.ts) en jsonb-parameters via jsonbTekst (ook connectors-opslag).
//  5. Tunnel van het externe bureaublad: tech-cookie voor ELKE verbinding (extern-bureaublad.test.ts); terminal-WebSocket begrensd.
//  6. Router: een staatswijzigend verzoek met cookie en body moet JSON zijn (formulieren → 415).
//  7/8. Overige serverpunten (registratie MCP, orch asynchroon, sleutels, geheugenplafond, SSE, regex, step-ups, Telegram-symbool, 0243).
//  10. toetsen/g10d.md №5: oude weg «openen» (veiligeMime, db.patch) en de vlag cloud-vnext voor de eigenaarsroutes van delen.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { router } from '../../server/platform/router';
import { metVerzoek } from '../../server/platform/context';
import { poortAfdwingen, poortNaVerzoek } from '../../server/platform/auth-poort';
import { _schakelaarsReset } from '../../server/platform/schakelaars';
import { _tellerLeeg, som } from '../../server/platform/antwoord-teller';
import { registreerMelder } from '../../backend/melder';
import { kluisCacheWissen } from '../../backend/integraties-kluis';
import * as bv from '../../backend/beveiliging-schakelaars';

type Res = { statusCode: number; body: string };
const SCH = ['auth-poort', 'opa-afdwingen', 'rls'] as const;
const nul = { totaal: 0, '5xx': 0, '403': 0, poort401: 0, opa: 0, opa403: 0, rls: 0 };

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-afwerking-a-20261112');

  // ---------------------------------------------------------------- 1. zekering: zuiver
  check('1: 5xx-piek (door invoer, elke gebruiker kan die maken) zet GEEN enkele bescherming automatisch uit',
    SCH.every((s) => bv.zekeringOordeel(s, { ...nul, totaal: 100, '5xx': 20 }) === null));
  check('1: algemene 403-piek (bv. kijker die schrijft) zet OPA niet automatisch uit',
    bv.zekeringOordeel('opa-afdwingen', { ...nul, totaal: 100, '403': 30 }, { totaal: 1000, '403': 10 }) === null);
  check('1: 403 van het beleid zelf (OPA/technisch profiel) → wel automatisch uit',
    bv.zekeringOordeel('opa-afdwingen', { ...nul, totaal: 100, '403': 30, opa403: 30 }) === '403-piek');
  check('1: eigen signalen blijven werken (poort-401, OPA onbereikbaar, RLS-fouten)',
    // SEC-002 (eind-omzeiling 1): poort-401 telt alleen over ≥ 3 verschillende routes (zie sec-002-slot-s). / ≥ 3 різні маршрути.
    bv.zekeringOordeel('auth-poort', { ...nul, totaal: 50, poort401: 5, poort401routes: 3 }) === 'poort-401-piek'
    && bv.zekeringOordeel('opa-afdwingen', { ...nul, totaal: 20, opa: 3 }) === 'opa-onbereikbaar'
    && bv.zekeringOordeel('rls', { ...nul, totaal: 40, rls: 3 }) === 'rls-fouten');
  check('1: 5xx-piek wordt alleen een voorstel aan de eigenaar',
    typeof (bv as Record<string, unknown>).zekeringVoorstel === 'function'
    && SCH.every((s) => (bv as unknown as { zekeringVoorstel: typeof bv.zekeringOordeel }).zekeringVoorstel(s, { ...nul, totaal: 100, '5xx': 20 }) === '5xx-piek'));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN (integratie): geen database'); return einde(); }

  // ---------------------------------------------------------------- 1. zekering: integratie (echte router, echte tabel)
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const begin = new Date();
  const ownerEmail = String(process.env.OWNER_EMAIL || 'eigenaar@example.invalid').toLowerCase();
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND lower(data->>'email') = $1 ORDER BY created_at ASC LIMIT 1`, [ownerEmail])).rows[0] as { id: string; email: string } | undefined;
  let tijdelijk = '';
  if (!bestaand) { tijdelijk = randomUUID(); await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)`, [tijdelijk, { email: ownerEmail, role: 'owner', status: 'approved' }]); }
  const E = { id: bestaand?.id || tijdelijk, email: ownerEmail };
  kluisCacheWissen();
  const meldingen: string[] = [];
  registreerMelder(async (u, _e, k, titel) => { meldingen.push(`${u}:${k}:${titel}`); });
  // SEC-002 (slot s, eind-omzeiling 1): de zekering zet de poort alleen uit bij 401 op ≥ 3 VERSCHILLENDE routes — een echte fout van de
  // poort raakt veel routes; één route × N (een vergeten sessiecontrole, of eigen sessie verversen) is alleen een voorstel.
  // Запобіжник реагує лише на 401 на ≥ 3 різних маршрутах; тут імітуємо справжню ваду шлюзу на трьох маршрутах.
  const anoniem = (i = 0) => { const pat = `POST /api/proef/anoniem-${i % 3}`; return metVerzoek(pat, async () => poortNaVerzoek(pat, { headers: {} } as never, { statusCode: 200, headers: {}, body: '{}' })); };
  // Een route die op «slechte invoer» een onverwachte fout gooit (zoals de diep geneste JSON uit toetsen/g04.md №5).
  const h = router({ 'POST /api/proef/kapot': [async () => { throw new RangeError('Maximum call stack size exceeded'); }] });
  const kapot = () => h({ headers: {}, body: '{}', isBase64Encoded: false, rawPath: '/api/proef/kapot', rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: '/api/proef/kapot', sourceIp: '198.51.100.7', userAgent: 'proef' } } }) as Promise<Res>;
  try {
    _schakelaarsReset(); bv._bewakingReset(); _tellerLeeg();
    await bv.aanzetten('auth-poort', { id: E.id, email: E.email }, `proef afwerking-a ${sfx}`);
    check('1: auth-poort aangezet (bewaking loopt)', poortAfdwingen() === true);
    let vijf = 0;
    for (let i = 0; i < 25; i += 1) if ((await kapot()).statusCode === 500) vijf += 1;
    check('1: 25 × 500 door invoer van een gebruiker geteld', vijf === 25 && som(Date.now() - 60_000, Date.now() + 1000)['5xx'] >= 25);
    const uit1 = await bv.zekeringControleren();
    check('1: 500 door invoer van een gebruiker zet de bescherming NIET uit', uit1.length === 0 && poortAfdwingen() === true, JSON.stringify(uit1));
    const voorstel = meldingen.filter((m) => m.startsWith(`${E.id}:beveiliging.zekering:`));
    check('1: de eigenaar krijgt wel een voorstel (melding) om te controleren', voorstel.length === 1, meldingen.join(' | '));
    await bv.zekeringControleren();
    check('1: het voorstel komt één keer per aanzetten (geen stroom meldingen)', meldingen.filter((m) => m.startsWith(`${E.id}:beveiliging.zekering:`)).length === 1);
    const j1 = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE created_at >= $1 AND action = 'admin.beveiliging.zekering-voorstel'`, [begin])).rows[0]?.n;
    check('1: het voorstel staat in het beheerjournaal', j1 === 1, String(j1));

    // Echte fout van de bescherming zelf: 401 van het vangnet → automatisch uit, met journaal + melding.
    for (let i = 0; i < 6; i += 1) await anoniem(i);
    const uit2 = await bv.zekeringControleren();
    check('1: 401 van de poort zelf → automatisch uit', uit2.length === 1 && uit2[0].reden === 'poort-401-piek' && poortAfdwingen() === false, JSON.stringify(uit2));
    const j2 = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE created_at >= $1 AND action = 'admin.beveiliging.zekering'`, [begin])).rows[0]?.n;
    check('1: automatisch uitzetten nooit stil: journaalregel + melding aan de eigenaar', j2 === 1 && meldingen.filter((m) => m.startsWith(`${E.id}:beveiliging.zekering:`)).length === 2, `${j2} ${meldingen.join(' | ')}`);

    // Zonder bekende aanzetter (rij van vóór de herstart zonder door_id): de melding gaat naar de eigenaar (OWNER_EMAIL).
    _tellerLeeg(); bv._bewakingReset();
    await bv.aanzetten('auth-poort', { id: '', email: 'onbekend' }, `proef zonder aanzetter ${sfx}`);
    for (let i = 0; i < 6; i += 1) await anoniem(i);
    const voor = meldingen.length;
    const uit3 = await bv.zekeringControleren();
    check('1: zonder aanzetter → melding toch aan de eigenaar', uit3.length === 1 && meldingen.slice(voor).some((m) => m.startsWith(`${E.id}:beveiliging.zekering:`)), meldingen.slice(voor).join(' | '));
  } finally {
    await sys.query(`UPDATE app.beveiliging_schakelaars SET stand='uit', bewaking_tot=NULL, basis='{}'::jsonb`).catch(() => undefined);
    _schakelaarsReset(); bv._bewakingReset(); _tellerLeeg();
  }

  // ---------------------------------------------------------------- 2. kijker (viewer) = alleen lezen, voor de hele routetabel
  {
    const { handler } = await import('../../backend/index');
    const kl = await import('../../backend/kijker-alleen-lezen');
    const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
    const { _rbacWeigeringenLeeg } = await import('../../backend/rbac');
    const alle = handler.patronen;
    check('2: elke route van de tabel is ingedeeld (lezen / eigen / geweigerd)', alle.length > 900 && alle.every((k) => ['lezen', 'eigen', 'intrekken', 'geweigerd'].includes(kl.kijkerRouteSoort(k))) /* SEC-002 (slot s): + «intrekken» (eigen toegang sluiten) */, String(alle.length));
    const exact = [...kl.KIJKER_LEZEN_EXTRA, ...kl.KIJKER_EIGEN, ...kl.KIJKER_LEESWOORD_SCHRIJFT];
    check('2: elke uitzondering in de lijsten bestaat echt in de routetabel (geen dode regels)', exact.every((k) => alle.includes(k)), exact.filter((k) => !alle.includes(k)).join(', '));
    // Steekproef per onderdeel: schrijven is voor een kijker dicht, lezen en eigen instellingen niet.
    const schrijf = ['POST /api/notities/nieuw', 'POST /api/huis/woningen/nieuw', 'POST /api/owner/cloud/vnext/map', 'POST /api/owner/cloud/vnext/upload',
      'POST /api/owner/agenda/gebeurtenis/aanmaken', 'POST /api/owner/github/repo/create', 'POST /api/owner/api-platform/tokens/create', 'POST /api/share/email',
      'POST /api/owner/mcp-connector/tools/set', 'POST /api/owner/mail/compose/draft/save', 'POST /api/owner/mail/compose/send', 'POST /api/owner/zoek/index/starten',
      'POST /api/owner/foto/upload', 'POST /api/terminal/openen', 'POST /api/owner/ai-toegang/zet', 'POST /api/owner/hub/werkblad/bewaren', 'POST /api/blocks/add',
      'POST /api/owner/cloud/items/:id/status', 'POST /api/owner/mail/google-suite/reply', 'POST /api/owner/agents/pairing-code', 'POST /api/owner/sleutelkluis/inschakelen'];
    const lees = ['POST /api/notities/lijst', 'POST /api/huis/overzicht', 'POST /api/owner/cloud/vnext/overzicht', 'POST /api/owner/agenda/overzicht',
      'POST /api/owner/github/repos', 'POST /api/owner/mail/google-suite/messages', 'POST /api/owner/zoek', 'POST /api/owner/foto/bibliotheek', 'GET /api/version'];
    const eigen = ['POST /api/owner/session/logout-current', 'POST /api/owner/privacy/toestemming', 'POST /api/owner/notifications/read', 'POST /api/owner/weergave/zet',
      'POST /api/owner/access/passkeys/registreren', 'POST /api/share/join', 'POST /api/owner/ui/preferences/save'];
    check('2: steekproef — schrijfroutes uit elk onderdeel zijn voor een kijker dicht', schrijf.every((k) => alle.includes(k) && kl.kijkerRouteSoort(k) === 'geweigerd'), schrijf.filter((k) => !alle.includes(k) || kl.kijkerRouteSoort(k) !== 'geweigerd').join(', '));
    check('2: steekproef — leesroutes blijven open', lees.every((k) => alle.includes(k) && kl.kijkerRouteSoort(k) === 'lezen'), lees.filter((k) => !alle.includes(k) || kl.kijkerRouteSoort(k) !== 'lezen').join(', '));
    check('2: steekproef — eigen instellingen en afmelden blijven open', eigen.every((k) => alle.includes(k) && kl.kijkerRouteSoort(k) === 'eigen'), eigen.filter((k) => !alle.includes(k) || kl.kijkerRouteSoort(k) !== 'eigen').join(', '));
    check('2: een nieuwe, onbekende route is voor een kijker dicht (weigeren tenzij ingedeeld)', kl.kijkerRouteSoort('POST /api/owner/iets-nieuws/doe') === 'geweigerd');
    const idx = (await import('node:fs')).readFileSync('backend/index.ts', 'utf8');
    check('2: index.ts — de wacht omhult de hele tabel en zit in beide sessiecontroles', /router\(kijkerWacht\(metMailRuimte\(\{/.test(idx)
      && /async function ownerRequireSession\([^)]*\)[^{]*\{const uitkomst=await ownerRequireSessionKern\(event,body\);if\(!\('errorCode'in uitkomst\)&&uitkomst\.user\?\.id\)\{[^}]*\*\/kijkerControle\(uitkomst\.user\);/.test(idx)
      && /sessionContextKern\(event,body\);if\(uitkomst\?\.user\?\.id\)kijkerControle\(/.test(idx));

    // Echt door de site, met echte sessies: een kijker en (controle) een gewoon lid.
    const sha = (s: string) => createHash('sha256').update(s).digest('hex');
    const V = randomUUID(), L = randomUUID();
    await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2), ('users',$3,$4)`, [V, { email: `kijker-${sfx}@test.invalid`, role: 'viewer', status: 'approved', accessLevel: 'limited', name: 'Kijker' }, L, { email: `lid-${sfx}@test.invalid`, role: 'member', status: 'approved', accessLevel: 'full', name: 'Lid' }]);
    const sessies: string[] = [];
    const tabCtx = randomBytes(24).toString('hex');
    const maakSessie = async (userId: string) => {
      const token = randomBytes(32).toString('base64url'); const now = Date.now(); const id = randomUUID();
      await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('owner_service_sessions_v1',$1,$2)`, [id, { id, tokenHash: sha(token), userId, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('kijker'), createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 864e5, absoluteExpiresAt: now + 864e5, rotation: 0, version: 1, revocationEpoch: 999999, scope: 'ecosystem', userAgent: 'proef' }]);
      sessies.push(id);
      return `${id}.${token}`;
    };
    const roep = async (cookie: string, sleutel: string, body: Record<string, unknown> = {}) => {
      const [methode, pad] = sleutel.split(' ');
      const r = await handler({ headers: { host: 'hub.tarasevych.com', origin: 'https://hub.tarasevych.com', 'content-type': 'application/json', cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(cookie)}`, 'user-agent': 'proef' },
        body: JSON.stringify({ service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabContext: tabCtx, ...body }), isBase64Encoded: false, rawPath: pad.replace(':id', 'x1'), rawQueryString: '', queryStringParameters: {},
        requestContext: { http: { method: methode, path: pad, sourceIp: '203.0.113.21', userAgent: 'proef' } } } as never) as { statusCode: number; body: string };
      let j: Record<string, unknown> = {}; try { j = JSON.parse(r.body || '{}'); } catch { /* geen json */ }
      return { s: r.statusCode, code: String(j.error || j.errorCode || j.reasonCode || '') };
    };
    try {
      _rbacWeigeringenLeeg();
      const kv = await maakSessie(V), kl2 = await maakSessie(L);
      const b = await roep(kv, 'POST /api/owner/session/bootstrap');
      check('2 (controle): de kijkersessie is geldig (bootstrap werkt)', b.s === 200, `${b.s} ${b.code}`);
      const vNa: string[] = [];
      for (const k of schrijf) { const r = await roep(kv, k, { titel: 'x', naam: 'x' }); if (!(r.s === 403 && r.code === 'RBAC_FORBIDDEN')) vNa.push(`${k} → ${r.s} ${r.code}`); }
      check('2: kijker → 403 RBAC_FORBIDDEN op elke schrijfroute van de steekproef (echte router en sessie)', vNa.length === 0, vNa.join(' | '));
      const lNa: string[] = [];
      for (const k of schrijf) { const r = await roep(kl2, k, { titel: 'x', naam: 'x' }); if (r.code === 'RBAC_FORBIDDEN' && !['POST /api/owner/cloud/items/:id/status'].includes(k)) lNa.push(`${k} → ${r.s} ${r.code}`); }
      check('2 (controle): een gewoon lid krijgt op dezelfde routes geen RBAC_FORBIDDEN', lNa.length === 0, lNa.join(' | '));
      const lezenNa: string[] = [];
      for (const k of [...lees, ...eigen.filter((e) => !e.includes('logout'))]) { const r = await roep(kv, k); if (r.code === 'RBAC_FORBIDDEN') lezenNa.push(`${k} → ${r.s}`); }
      check('2: kijker → lezen en eigen instellingen niet geweigerd door de wacht', lezenNa.length === 0, lezenNa.join(' | '));
      const rijen = ((await sys.query(`SELECT tbl FROM app.records WHERE owner_id = $1`, [V])).rows as Array<{ tbl: string }>).map((r) => r.tbl).sort().join(',');
      const j = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE created_at >= $1 AND action = 'rbac.geweigerd' AND owner_id = $2`, [begin, V])).rows[0]?.n;
      check('2: elke weigering staat in het journaal (rbac.geweigerd)', j >= schrijf.length, `${j} / ${schrijf.length} (rijen van de kijker: ${rijen})`);
      const voor = j;
      await roep(kv, 'POST /api/notities/nieuw', { titel: 'x' }); await roep(kv, 'POST /api/notities/nieuw', { titel: 'x' });
      const j2 = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE created_at >= $1 AND action = 'rbac.geweigerd' AND owner_id = $2`, [begin, V])).rows[0]?.n;
      check('2: herhaalde weigering → geen stroom journaalregels (één per 10 min per route)', j2 === voor, `${voor} → ${j2}`);
    } finally {
      await sys.query(`DELETE FROM app.records WHERE id = ANY($1::text[])`, [[V, L, ...sessies]]).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- 3. stap-op: «controleren en verbruiken» ondeelbaar
  {
    const so = await import('../../backend/stap-op');
    const U = randomUUID();
    const auth = { user: { id: U }, session: { id: `stapop-sessie-${sfx}`, createdAt: Date.now() }, tabSession: null };
    const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      // Oude volgorde (zoals de modules die vroeger hadden): controleren → actie → verbruiken. Vier tegelijk op één bevestiging.
      await so.passkeyStapOpVastleggen(auth);
      const oud = await Promise.all([1, 2, 3, 4].map(async () => { if (!(await so.passkeyStapOpGeldig(auth))) return false; await wacht(40); await so.stapOpVerbruiken(auth); return true; }));
      check('3 (vóór): oude volgorde — één bevestiging gaf meerdere gelijktijdige acties (de fout bestaat)', oud.filter(Boolean).length > 1, oud.join(','));
      await so.passkeyStapOpVastleggen(auth);
      const nieuw = await Promise.all([1, 2, 3, 4].map(() => so.metStapOpEenmalig(auth, so.passkeyStapOpGeldig, async () => { await wacht(40); return 'gedaan'; })));
      check('3: metStapOpEenmalig — vier tegelijk op één bevestiging → precies één actie', nieuw.filter((r) => r.ok).length === 1, nieuw.map((r) => r.ok).join(','));
      check('3: daarna is de bevestiging verbruikt', !(await so.passkeyStapOpGeldig(auth)));
      await so.passkeyStapOpVastleggen(auth);
      let fout = '';
      try { await so.metStapOpEenmalig(auth, so.passkeyStapOpGeldig, async () => { throw new Error('REDEN_VEREIST'); }); } catch (e) { fout = (e as Error).message; }
      check('3: mislukte actie → fout doorgegeven en bevestiging teruggezet (een tikfout kost geen nieuwe passkey)', fout === 'REDEN_VEREIST' && (await so.passkeyStapOpGeldig(auth)) && (await so.sterkeStapOpGeldig(auth)));
      const kort = await Promise.all([1, 2, 3, 4].map(() => so.stapOpVerbruikIndienGeldig(auth, so.sterkeStapOpGeldig)));
      check('3: stapOpVerbruikIndienGeldig — vier tegelijk → precies één', kort.filter(Boolean).length === 1, kort.join(','));
      check('3: zonder bevestiging → { ok: false } en de actie loopt niet', await (async () => { let liep = false; const r = await so.metStapOpEenmalig(auth, so.passkeyStapOpGeldig, async () => { liep = true; }); return !r.ok && !liep; })());
      // Gelijktijdig vastleggen en verbruiken: het slot rond elke lees-wijzig-schrijf laat geen verbruikte bevestiging herleven.
      await so.passkeyStapOpVastleggen(auth);
      const auth2 = { ...auth, session: { id: `stapop-sessie2-${sfx}`, createdAt: Date.now() } };
      await Promise.all([so.stapOpVerbruiken(auth), so.passkeyStapOpVastleggen(auth2), so.passkeyStapOpVastleggen(auth2)]);
      check('3: vastleggen op een andere sessie tegelijk met verbruiken herstelt de verbruikte niet', !(await so.passkeyStapOpGeldig(auth)) && (await so.passkeyStapOpGeldig(auth2)));
      const bron = (f: string) => (readFileSync(f, 'utf8'));
      const mods = ['backend/beveiliging-schakelaars.ts', 'backend/agent-namens.ts', 'backend/dev-mg-routes.ts', 'backend/merk-eigen.ts', 'backend/impersonatie.ts', 'backend/ai-bevestiging-routes.ts'];
      check('3: modules gebruiken de ondeelbare stap (geen los stapOpVerbruiken na de actie meer)', mods.every((f) => /metStapOpEenmalig\(/.test(bron(f)) && !/stapOpVerbruiken\(/.test(bron(f)))
        && /stapOpVerbruikIndienGeldig\(/.test(bron('backend/api-platform-kluis.ts')) && /metStapOpEenmalig\(/.test(bron('backend/extern-routes.ts'))
        && /stapOpEenmalig: \(a, actie\) => metStapOpEenmalig\(a as never, sterkeStapOpGeldig, actie\)/.test(bron('backend/index.ts'))
        && /metStapOpSlot\(a\.user\.id/.test(bron('backend/extensie-beheer.ts')), mods.filter((f) => !/metStapOpEenmalig\(/.test(bron(f)) || /stapOpVerbruiken\(/.test(bron(f))).join(', '));
    } finally {
      await sys.query(`DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = $1`, [U]).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- 4. afkappen zonder halve emoji; jsonb neemt alles aan
  {
    const tv = await import('../../shared/tekst-veilig');
    const jv = await import('../../server/platform/json-veilig');
    const cop = await import('../../backend/connectors-opslag');
    const H = String.fromCharCode(0xD83D), L = String.fromCharCode(0xDE00), FFFD = String.fromCharCode(0xFFFD);
    check('4: één gedeelde functie (server/platform/json-veilig exporteert die uit shared/tekst-veilig)', jv.knipTekst === tv.knipTekst && jv.tekstVeilig === tv.tekstVeilig && jv.jsonbTekst === tv.jsonbTekst);
    check('4: knipVeilig breekt geen emoji en ruimt eenzame helften en U+0000 op', tv.knipVeilig('a' + H + L, 2) === 'a' && tv.knipVeilig('x' + L + 'y' + String.fromCharCode(0) + H, 10) === 'x' + FFFD + 'y' + FFFD + FFFD && tv.knipVeilig(12345, 3) === '123' && tv.knipVeilig(null, 5) === '');
    check('4: jsonbTekst(undefined) gedraagt zich als JSON.stringify (undefined → NULL-parameter)', tv.jsonbTekst(undefined) === undefined && tv.jsonbTekst({ a: 1 }) === '{"a":1}');
    const proef = async (json: string) => { try { await sys.query('SELECT $1::jsonb AS j', [json]); return 'ok'; } catch (e) { return String((e as { code?: string }).code || 'fout'); } };
    const vuil = { fout: 'x'.repeat(499) + H, [`sleutel${L}`]: ['a' + String.fromCharCode(0) + 'b'] };
    check('4 (vóór): gewone JSON.stringify met een halve emoji → jsonb weigert (22P02)', (await proef(JSON.stringify(vuil))) !== 'ok');
    check('4: connectors-opslag jsonbTekst (halve emoji in waarde en sleutel, U+0000) → jsonb neemt het aan', (await proef(cop.jsonbTekst(vuil))) === 'ok' && (await proef(tv.jsonbTekst(vuil))) === 'ok', cop.jsonbTekst(vuil).slice(-60));
    const bron = (f: string) => readFileSync(f, 'utf8');
    check('4: databaseparameters in de modules met gebruikerstekst via jsonbTekst', ['backend/ai-ecosysteem.ts', 'backend/mail-afzenders.ts', 'backend/notities-vnext.ts', 'backend/eigenaar-besluit.ts', 'backend/werkblad-blokken.ts', 'backend/zoek-index.ts', 'backend/bestanden-delen.ts', 'backend/toegangscodes.ts', 'backend/zoek-geschiedenis.ts']
      .every((f) => bron(f).includes("shared/tekst-veilig'") && bron(f).includes('jsonbTekst(')));
  }

  // ---------------------------------------------------------------- 5. WebSocket van de terminal (toetsen/g01.md №6)
  {
    const { createServer } = await import('node:http');
    const { WebSocket } = await import('ws');
    const term = await import('../../backend/terminal');
    const http = createServer((_q, s) => { s.statusCode = 404; s.end(); });
    http.on('upgrade', (req, socket, head) => term.terminalUpgrade(req, socket, head));
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const poort = (http.address() as { port: number }).port;
    const probeer = () => new Promise<string>((res) => {
      const ws = new WebSocket(`ws://127.0.0.1:${poort}/terminal/ws`, { headers: { origin: `http://127.0.0.1:${poort}` } });
      ws.on('open', () => { ws.terminate(); res('open'); }); ws.on('error', (e) => res((e as Error).message)); ws.on('unexpected-response', (_q, r) => res(`HTTP ${r.statusCode}`));
    });
    const r = await probeer();
    // SEC-002 (slot x, NAUWK-01): deze controle legde vroeger «geen wachtende sessie → 403» vast, d.w.z. een antwoord dat van de stand
    // afhing (met een wachtende sessie: 101 of 503 — een «oracle»). Nu hangt het af van de tech-cookie van de eigenaar, nooit van de stand:
    // zonder die cookie altijd 403. De stand-onafhankelijkheid zelf toont tests/eenheid/sec-002-slot-x-20261113.test.ts.
    // Раніше тест закріплював «немає сеансу → 403» (відповідь залежала від стану); тепер без cookie власника — завжди 403.
    check('5: terminal — zonder tech-cookie van de eigenaar → HTTP 403 vóór de WebSocket-handdruk, wat de stand ook is (vroeger: open)', r === 'HTTP 403', r);
    await new Promise<void>((res) => http.close(() => res()));
    const bron = readFileSync('backend/terminal.ts', 'utf8');
    check('5: terminal — vlag «dicht» (na een weigering niets meer verwerken), terminate na 1 s, eigen pool voor de browser van de eigenaar',
      bron.includes('if (dicht) return;') && bron.includes('ws.terminate()') && bron.includes('eigenaarWachtend >= MAX_EIGENAAR_WACHTEND'));
  }

  // ---------------------------------------------------------------- 6. POST met cookie: alleen JSON (aanv-ronde1-01 p.3)
  {
    const { alleenJsonAfwijzing } = await import('../../server/platform/router');
    let geraakt = 0;
    const h6 = router({ 'POST /api/proef/schrijf': [async () => { geraakt += 1; return { statusCode: 200, headers: {}, body: '{"ok":true}' }; }] });
    const post = (koppen: Record<string, string>, body = '{"a":1}') => h6({ headers: koppen, body, isBase64Encoded: false, rawPath: '/api/proef/schrijf', rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: '/api/proef/schrijf', sourceIp: '198.51.100.8', userAgent: 'proef' } } }) as Promise<Res>;
    const formulier = await post({ cookie: 'tsv=1', 'content-type': 'text/plain;charset=UTF-8' }, '{"titel":"x"}');
    const urlenc = await post({ cookie: 'tsv=1', 'content-type': 'application/x-www-form-urlencoded' }, 'a=1');
    const multi = await post({ cookie: 'tsv=1', 'content-type': 'multipart/form-data; boundary=x' }, '--x--');
    const geen = await post({ cookie: 'tsv=1' });
    check('6: POST met cookie als formulier (text/plain, urlencoded, multipart) of zonder type → 415 JSON_VEREIST, route niet geraakt', [formulier, urlenc, multi, geen].every((r) => r.statusCode === 415 && r.body.includes('JSON_VEREIST')) && geraakt === 0, [formulier, urlenc, multi, geen].map((r) => r.statusCode).join(','));
    const json = await post({ cookie: 'tsv=1', 'Content-Type': 'application/json; charset=utf-8' });
    const zonderCookie = await post({ 'content-type': 'text/plain' });
    const leeg = await post({ cookie: 'tsv=1', 'content-type': 'text/plain' }, '');
    check('6: JSON met cookie, webhook zonder cookie en een lege body gaan gewoon door', json.statusCode === 200 && zonderCookie.statusCode === 200 && leeg.statusCode === 200 && geraakt === 3);
    check('6: +json-types tellen als JSON; GET nooit', !alleenJsonAfwijzing('POST', { cookie: 'a=1', 'content-type': 'application/merge-patch+json' }, '{}') && !alleenJsonAfwijzing('GET', { cookie: 'a=1', 'content-type': 'text/plain' }, 'x'));
  }

  // ---------------------------------------------------------------- 7/8. overige punten (server)
  {
    const bron = (f: string) => readFileSync(f, 'utf8');
    // 8: zekere namen al bij de registratie van een MCP-klant weigeren
    const { registerClient } = await import('../../backend/mcp-connector');
    const reg = async (naam: string) => { const r = await registerClient(JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: naam }), ''); return { s: r.statusCode, b: r.body }; };
    const r1 = await reg('site:eigenaar'), r2 = await reg('  SITE : x'), r3 = await reg('?');
    check('8: MCP-registratie — gereserveerde namen («site:…», «?») → 400 client_name is gereserveerd', [r1, r2, r3].every((r) => r.s === 400 && r.b.includes('gereserveerd')), [r1, r2, r3].map((r) => r.s).join(','));
    // 8: orch_inleveren_klaar — dezelfde pijplijn in een eigen proces, de event-loop blijft vrij
    const orch = await import('../../scripts/orch/inleveren.mjs');
    const o = { wortel: process.cwd(), beleid: {}, lock: {}, bron: '/pad/dat/niet/bestaat.zip', nu: '2026-11-12T00:00:00.000Z', alleenVeiligeControle: true };
    const sync = orch.inleveren(o as never);
    let tik = 0; const iv = setInterval(() => { tik += 1; }, 5);
    const asyncRec = await orch.inleverenA(o as never);
    clearInterval(iv);
    check('8: inleverenA geeft hetzelfde record als inleveren, zonder de event-loop te blokkeren', asyncRec.uitkomst === sync.uitkomst && JSON.stringify(asyncRec.zaken.map((z) => z.code)) === JSON.stringify(sync.zaken.map((z) => z.code)) && tik > 0, `${asyncRec.uitkomst} tik=${tik}`);
    check('8: route en MCP-hulpmiddel gebruiken de asynchrone afronding', bron('backend/orch-routes.ts').includes('await opslag.uploadKlaarA(') && bron('backend/orch-hulpmiddelen.ts').includes('await opslag.uploadKlaarA('));
    // 8: vier modules met eigen sleutel in elke versie (_V1…_V9)
    check('8: connectors-crypto, github-koppeling-opslag, browser-diag-archief, huis-vnext kiezen hun sleutel met envSleutelBeschikbaar',
      ['backend/connectors-crypto.ts', 'backend/github-koppeling-opslag.ts', 'backend/browser-diag-archief.ts', 'backend/huis-vnext.ts'].every((f) => bron(f).includes("(envSleutelBeschikbaar('") && bron(f).includes("_V1') ? '")));
    // 8: geheugenkaart van de snelheidsgrens heeft een plafond
    const st = await import('../../server/start');
    for (let i = 0; i < st.GEHEUGEN_MAX + 500; i += 1) st._geheugenLimiet(`proef-${sfx}-${i}`, 10, 60_000);
    check('8: geheugenkaart van de snelheidsgrens groeit niet voorbij het plafond', st._geheugenGrootte() <= st.GEHEUGEN_MAX, String(st._geheugenGrootte()));
    // 8: Nextcloud-metadata: begrensde regex (lineair op 64 KB van een vreemde server)
    check('8: Nextcloud stat — attributen/inhoud in de regex begrensd', /[^>]{0,256}/.test(bron('backend/cloud-overdracht-m3-providers.ts')));
    // 8: overige serverpunten (bron)
    check('8: SSE-ingangen: strenge emmer voor mislukte aanmeldingen (30/min per IP)', bron('backend/connector-v2-stroom.ts').includes('sse-fout:') && bron('server/start.ts').includes('stroomVerzoek(req, res, m[1], clientIp(req))'));
    check('8: lijsten met relevantie in de Gmail-module geven de event-loop vrij', (bron('backend/google-suite-mail-browser.ts').match(/await geefLusVrij()/g) || []).length >= 3);
    check('8: icloud_list_events met refresh telt in dezelfde emmer als «Оновити» (12 per 10 min)', bron('backend/dev-rechten-gebruiker.ts').includes('agenda-caldav-vernieuwen:'));
    check('8: media/afbeelding en media/diagram weigeren zonder schrijfrecht VÓÓR het genereren', bron('backend/dev-mg-routes.ts').split("denyMutation(auth.user as never, 'cloud.write')").length === 3);
    check('8: ai-toegang/zet — scopes uitbreiden vraagt een step-up; ai-bevestiging — risico «midden» een gewone bevestiging',
      bron('backend/mcp-connector-routes.ts').includes('if (scopes.some((s) => !oud.includes(s))) { const su = await stepUp(ctx, auth); if (su) return su; }')
      && bron('backend/ai-bevestiging-routes.ts').includes("item.risico === 'midden' && deps.stapOp") && bron('backend/index.ts').includes('stapOp: stapOpVereist as never }'));
    check('8 (g10f): technisch profiel met ssh.host activeren vraagt een STERKE bevestiging', bron('backend/tech-routes.ts').includes("mogelijkhedenVan(profiel.rollen).includes('ssh.host')") && bron('backend/index.ts').includes('sterkeStapOp: sterkeStapOpVereist as never })'));
    // 8 (B): veilige standaard voor logo's van onbekende afzenders
    const mb = await import('../../backend/merk-bron');
    check('8 (B): ONBEKENDE_AFZENDERS_STANDAARD = false (geen spoor naar het domein van onbekende afzenders tot de mens «Завжди» kiest)', mb.ONBEKENDE_AFZENDERS_STANDAARD === false);
    // 8 (B): Telegram — symbool van het aanmeldverzoek (site en bot)
    const tg = await import('../../backend/telegram-aanmelden/inloggen');
    const s1 = tg.inlogSymbool('abc'), s2 = tg.inlogSymbool('abc');
    check('8 (B): Telegram-aanmelding — symbool per verzoek, vast voor hetzelfde id, met uk/nl-naam, in de kaart van de bot', s1.id === s2.id && !!s1.emoji && !!s1.uk && !!s1.nl && bron('backend/telegram-aanmelden/inloggen.ts').includes('${nieuwRegel}${symRegel}${tekst}'));
    // 8 (B): melding cloud_alleen_lezen bij een weigering, hoogstens één per uur
    const cs = await import('../../backend/cloud-schrijfrecht');
    const ms: string[] = [];
    registreerMelder(async (u, _e, k) => { ms.push(`${u}:${k}`); });
    const kijker = `kijker-melding-${sfx}`;
    await cs.cloudWeigeringVastleggen(kijker, 'POST /api/owner/cloud/vnext/map', 'RBAC_FORBIDDEN');
    await cs.cloudWeigeringVastleggen(kijker, 'POST /api/owner/cloud/vnext/upload', 'RBAC_FORBIDDEN');
    check('8 (B): schrijven in de hmara geweigerd → melding cloud_alleen_lezen, één per uur', ms.filter((m) => m === `${kijker}:cloud_alleen_lezen`).length === 1, ms.join(','));
    // 3 (g10f): status «inkomend» (migratie 0243)
    let inkomend = 'fout';
    try { await sys.query(`SAVEPOINT x`).catch(() => undefined); await sys.query(`INSERT INTO app.mcp_console_items (user_id, ruimte, kind, title, body, status, author, tags) VALUES ($1, 'prive', 'task', 'proef', '', 'inkomend', 'github:x', '{}') RETURNING id`, [randomUUID()]).then(async (r) => { inkomend = 'ok'; await sys.query('DELETE FROM app.mcp_console_items WHERE id = $1', [r.rows[0].id]); }); } catch (e) { inkomend = String((e as { code?: string }).code || 'fout'); }
    check('8 (g10f/B): migratie 0243 — status «inkomend» toegestaan; nieuwe GitHub-kaarten van derden komen daar', inkomend === 'ok' && bron('backend/github-werkruimte.ts').includes("'task', $3, $4, 'inkomend', $5, $6)"), inkomend);
  }

  // ---------------------------------------------------------------- 3b. SSH-certificaat: één sterke bevestiging = één certificaat (ondeelbaar)
  {
    const so = await import('../../backend/stap-op');
    const { sshCaRoutes } = await import('../../backend/ssh-ca-routes');
    const idx = readFileSync('backend/index.ts', 'utf8');
    const U = randomUUID();
    const auth = { user: { id: U, email: `ssh-${sfx}@test.invalid`, role: 'owner', status: 'approved' }, service: 'admin', session: { id: `ssh-sessie-${sfx}`, createdAt: Date.now() }, tabSession: null };
    let uitgegeven = 0;
    // Zoals backend/index.ts de routes opbouwt: sterke controle, en (na de patch) controleren + verbruiken in één ondeelbare stap.
    const deps = {
      sterkeStapOp: async (_c: unknown, a: unknown) => ((await so.sterkeStapOpGeldig(a as never)) ? null : { statusCode: 403, headers: {}, body: '{"error":"STEP_UP_STRONG_REQUIRED"}' }),
      stapOpEenmalig: <T,>(a: unknown, actie: () => Promise<T>) => so.metStapOpEenmalig(a as never, so.sterkeStapOpGeldig, actie),
      uitgeven: async () => { await new Promise((r) => setTimeout(r, 40)); uitgegeven += 1; return { ok: true }; },
    };
    const routes = sshCaRoutes(async () => auth as never, deps as never);
    const roep = () => (routes['POST /api/ssh-ca/uitgifte'][0] as unknown as (c: unknown) => Promise<Res>)({ event: {}, body: { tabContext: 'x', publiek: 'ssh-ed25519 AAAA', minuten: 5 } });
    try {
      await so.passkeyStapOpVastleggen(auth as never);
      const r = await Promise.all([roep(), roep(), roep(), roep()]);
      check('3b: SSH-certificaat — vier aanvragen tegelijk op één sterke bevestiging → precies één certificaat', uitgegeven === 1 && r.filter((x) => x.statusCode === 200).length === 1 && r.filter((x) => x.statusCode === 403).length === 3, `uitgegeven=${uitgegeven} ${r.map((x) => x.statusCode).join(',')}`);
      check('3b: index.ts geeft ssh-ca de ondeelbare stap mee', /sshCaRoutes\(ownerRequireSession as never, \{[^}]*stapOpEenmalig: \(a, actie\) => metStapOpEenmalig\(a as never, sterkeStapOpGeldig, actie\)/.test(idx));
    } finally {
      await sys.query(`DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = $1`, [U]).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- 10. toetsen/g10d.md №5 (a, b)
  {
    const U = randomUUID();
    await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)`, [U, { email: `wolk-${sfx}@test.invalid`, role: 'member', status: 'approved', accessLevel: 'full' }]);
    const gebruiker = { id: U, email: `wolk-${sfx}@test.invalid`, role: 'member', status: 'approved', accessLevel: 'full' };
    try {
      // (b) oude weg POST /api/owner/cloud/items/:id/open: het type gaat door veiligeMime, «laatst geopend» alleen als eigen veld
      const { createCloudRoutes } = await import('../../backend/cloud-platform');
      const { metVerzoek, zetGebruiker } = await import('../../server/platform/context');
      const cr = createCloudRoutes(async () => ({ user: gebruiker, service: 'cloud' }) as never) as unknown as Record<string, Array<(c: unknown) => Promise<Res>>>;
      const roep = (sleutel: string, body: Record<string, unknown>, params: Record<string, string> = {}) => metVerzoek(sleutel, async () => { zetGebruiker(U, 'cloud'); return cr[sleutel][0]({ event: {}, body, params, query: {} }); });
      const html = Buffer.from('<script>alert(document.cookie)</script>').toString('base64');
      // capture zelf weigert text/html; zo'n type staat wel in OUDERE records (bv. uit Drive) — dat bootsen we na in de database.
      const cap = await roep('POST /api/owner/cloud/capture', { kind: 'file', fileName: 'x.txt', mimeType: 'text/plain', fileData: html });
      const itemId = String((JSON.parse(cap.body || '{}') as { item?: { id?: string } }).item?.id || '');
      if (itemId) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{mimeType}', '\"text/html\"') WHERE id = $1", [itemId]);
      const open = itemId ? await roep('POST /api/owner/cloud/items/:id/open', {}, { id: itemId }) : { statusCode: 0, body: '{}' };
      const ob = JSON.parse(open.body || '{}') as { mimeType?: string };
      check('10b: oude weg «openen» — een als text/html opgeslagen bestand komt NIET als text/html terug (veiligeMime)', open.statusCode === 200 && !!ob.mimeType && !/html|svg|javascript|xml/i.test(ob.mimeType), `${cap.statusCode}/${open.statusCode} ${ob.mimeType}`);
      check('10b: «laatst geopend» wordt als eigen veld geschreven (db.patch), niet het hele record uit een momentopname',
        /'POST \/api\/owner\/cloud\/items\/:id\/open'[^\n]*db\.patch\(CLOUD_ITEMS, item\.id, \{ openedAt/.test(readFileSync('backend/cloud-platform.ts', 'utf8')));
      // (a) eigenaarsroutes van gedeelde koppelingen vragen de vlag cloud-vnext (de openbare routes niet)
      const { bestandenDelenEigenaarRoutes } = await import('../../backend/bestanden-delen');
      const dr = bestandenDelenEigenaarRoutes(async () => ({ user: gebruiker, service: 'cloud' }) as never, { vlagAan: async () => false } as never) as unknown as Record<string, Array<(c: unknown) => Promise<Res>>>;
      const uit = await dr['POST /api/owner/cloud/vnext/delen/overzicht'][0]({ event: {}, body: {} });
      check('10a: vlag cloud-vnext UIT voor deze mens → eigenaarsroutes van delen 404 CLOUD_VNEXT_UIT', uit.statusCode === 404 && uit.body.includes('CLOUD_VNEXT_UIT'), `${uit.statusCode} ${uit.body.slice(0, 80)}`);
      check('10a: index.ts geeft de vlag mee aan bestandenDelenEigenaarRoutes', /bestandenDelenEigenaarRoutes\(ownerRequireSession as never, \{\s*vlagAan: async \(u\) => \(await flagsBerekenen\(u as never, \['cloud-vnext'\]\)\)\[0\]\?\.value === true,/.test(readFileSync('backend/index.ts', 'utf8')));
    } finally {
      await sys.query(`DELETE FROM app.records WHERE id = $1 OR (tbl LIKE 'cloud%' AND data->>'ownerUserId' = $1)`, [U]).catch(() => undefined);
    }
  }

  if (tijdelijk) await sys.query(`DELETE FROM app.records WHERE id = $1`, [tijdelijk]).catch(() => undefined);
  return einde();
}
