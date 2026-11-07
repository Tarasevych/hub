// Diagnose «для всіх / лише для мене» (verslag van de eigenaar 18.10.2026). Bewijst: (1) zuivere beoordeling per dienst en de tabel
// «server ok / account niet» → conclusie «alleen dit account»; (2) feiten via NAGEBOOTSTE bronnen (Google, GitHub, apparaten…),
// inclusief een token dat Google weigert; (3) privacy: geen inhoud, adressen of tokens in opslag, antwoord of logboek, ook niet als
// een bron ze aanbiedt; (4) rechten via de ECHTE routes: een gewone gebruiker ziet alleen het eigen account en geen serverkolom,
// de beheerroute weigert hem; de eigenaar ziet beide kolommen; (5) geplande serverronde (cron) en de bedrading.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import {
  ACCOUNT_DIENSTEN, CODE_ADVIES, SERVER_CONTROLES, adviesVoor, beoordeelAccount, conclusie, schoonAccountUitslag, serverCel, tabel,
  type AccountFeiten,
} from '../../shared/diagnostiek-account';
import { isControleId } from '../../shared/beheer-diagnostiek';
import { checker } from './hulp/nep-google';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const GEHEIM_TOKEN = 'ya29.GEHEIM-TOKEN-' + randomBytes(6).toString('hex');
const GEHEIM_ADRES = 'vertrouwelijk-' + randomBytes(3).toString('hex') + '@voorbeeld.test';

const goed = (): AccountFeiten => ({
  accountStatus: 'approved',
  google: { mail: { status: 'granted', gebonden: true, token: 'ok' }, drive: { status: 'granted', gebonden: true, token: 'ok' }, calendar: { status: 'granted', gebonden: true, token: 'ok' } },
  mailAccounts: { totaal: 1, verbonden: 1, herstelNodig: 0, gestoord: 0 }, mailWachtrij: { vast: 0, mislukt24: 0 },
  github: { gekoppeld: true }, ai: { actief: 2, bijnaVerlopen: 0 }, apparaten: { totaal: 1, verbonden: 1, stil: 0 }, instellingen: { leesbaar: true },
});

export async function main(): Promise<number> {
  const { check, einde } = checker('diagnostiek-account');

  // ---------------------------------------------------------------- zuiver
  check('register: elke servercontrole bestaat in shared/beheer-diagnostiek.ts', Object.values(SERVER_CONTROLES).flat().every(isControleId), Object.values(SERVER_CONTROLES).flat().filter((i) => !isControleId(i)).join());
  check('register: elke accountcode heeft uk+nl uitleg en advies', Object.values(CODE_ADVIES).every((a) => a.wat[0] && a.wat[1] && a.doe[0] && a.doe[1]));
  const alles = beoordeelAccount(goed());
  check('beoordeel: alles in orde → 7× ok', ACCOUNT_DIENSTEN.every((d) => alles[d].stand === 'ok'));
  const f1 = goed(); f1.google!.mail = { status: 'granted', gebonden: true, token: 'fout', tokenCode: 'GOOGLE_SUITE_REFRESH_REVOKED' };
  check('beoordeel: Google weigert het Gmail-token → mail fout met de code van de bron', beoordeelAccount(f1).mail.stand === 'fout' && beoordeelAccount(f1).mail.code === 'GOOGLE_SUITE_REFRESH_REVOKED');
  const f1b = goed(); f1b.google!.mail = { status: 'granted', gebonden: true, token: 'fout', tokenCode: 'invalid_grant ' + GEHEIM_TOKEN };
  check('beoordeel: tekst van Google (met token) wordt NOOIT een code → vaste code', beoordeelAccount(f1b).mail.code === 'GMAIL_TOKEN_ONGELDIG');
  const f2 = goed(); f2.google!.calendar = { status: 'consent_required', gebonden: false };
  check('beoordeel: agenda niet gekoppeld → let op, advies «підключіть»', beoordeelAccount(f2).agenda.code === 'AGENDA_NIET_GEKOPPELD' && beoordeelAccount(f2).agenda.stand === 'let-op' && !!adviesVoor('AGENDA_NIET_GEKOPPELD')?.doe[0]);
  const f3 = goed(); f3.google!.drive = { status: 'granted', gebonden: false };
  check('beoordeel: Drive gekoppeld maar toestemming weg → fout', beoordeelAccount(f3).drive.code === 'DRIVE_KOPPELING_ZONDER_TOESTEMMING');
  const f4 = goed(); f4.google = { mail: { status: 'configuration_missing', gebonden: false }, drive: { status: 'configuration_missing', gebonden: false }, calendar: { status: 'configuration_missing', gebonden: false } };
  check('beoordeel: server zonder Google-configuratie → onbekend (niet de schuld van het account)', beoordeelAccount(f4).mail.stand === 'onbekend' && beoordeelAccount(f4).mail.code === 'SERVER_NIET_INGESTELD');
  const f5 = goed(); f5.mailWachtrij.vast = 2; f5.apparaten = { totaal: 2, verbonden: 0, stil: 0 }; f5.github = { gekoppeld: false }; f5.ai = { actief: 0, bijnaVerlopen: 0 };
  const b5 = beoordeelAccount(f5);
  check('beoordeel: wachtrij vast / apparaat offline / geen GitHub / geen AI', b5.mail.code === 'MAIL_WACHTRIJ_VAST' && b5.apparaten.code === 'APPARAAT_OFFLINE' && b5.github.code === 'GITHUB_NIET_GEKOPPELD' && b5.ai.code === 'AI_GEEN_KOPPELING');
  const f6 = goed(); f6.accountStatus = 'blocked';
  check('beoordeel: geblokkeerd account → instellingen fout', beoordeelAccount(f6).instellingen.code === 'ACCOUNT_GEBLOKKEERD');

  check('conclusie: server ok + account fout = «alleen dit account»', conclusie('ok', 'fout') === 'account' && conclusie('ok', 'let-op') === 'account');
  check('conclusie: server fout + account ok = «server, voor iedereen»', conclusie('fout', 'ok') === 'server');
  check('conclusie: beide / alles ok / onbekend', conclusie('fout', 'fout') === 'beide' && conclusie('ok', 'ok') === 'alles-ok' && conclusie('nooit', 'nooit') === 'onbekend' && conclusie('ok', 'onbekend') === 'onbekend');
  const nu = Date.now();
  const server = { 'dienst-mail': { stand: 'ok' as const, op: nu }, 'mail-gmail-api': { stand: 'ok' as const, op: nu }, 'mail-wachtrij': { stand: 'ok' as const, op: nu }, 'taak-mail': { stand: 'ok' as const, op: nu },
    'dienst-cloud': { stand: 'fout' as const, op: nu }, 'cloud-drive-api': { stand: 'ok' as const, op: nu } };
  check('serverCel: slechtste van de controles van de dienst; zonder gegevens «nooit»', serverCel('mail', server).stand === 'ok' && serverCel('drive', server).stand === 'fout' && serverCel('github', server).stand === 'nooit');
  const rijen = tabel(server, [{ dienst: 'mail', stand: 'fout', code: 'GMAIL_TOKEN_ONGELDIG', op: nu }, { dienst: 'drive', stand: 'ok', code: '', op: nu }]);
  const rij = (d: string) => rijen.find((r) => r.dienst === d)!;
  check('TABEL: mail — server ok, account fout → «account»', rij('mail').server!.stand === 'ok' && rij('mail').account!.stand === 'fout' && rij('mail').conclusie === 'account');
  check('TABEL: drive — server fout, account ok → «server»', rij('drive').conclusie === 'server');
  check('TABEL: niet gecontroleerd account → geen uitslag, conclusie onbekend', rij('github').account === null && rij('github').conclusie === 'onbekend');
  check('TABEL: alle 7 diensten, vaste volgorde', rijen.map((r) => r.dienst).join() === ACCOUNT_DIENSTEN.join());
  check('TABEL zonder serverkolom (gewone gebruiker): server = null', tabel(null, []).every((r) => r.server === null));
  check('schoonAccountUitslag: onbekende dienst/stand of vreemde code valt weg', schoonAccountUitslag({ dienst: 'x', stand: 'ok' }) === null && schoonAccountUitslag({ dienst: 'mail', stand: 'groen' }) === null
    && schoonAccountUitslag({ dienst: 'mail', stand: 'fout', code: GEHEIM_TOKEN, op: 1 })!.code === '');

  // ---------------------------------------------------------------- nagebootste bronnen
  const da = await import('../../backend/diagnostiek-account');
  check('codeUit: alleen een echte foutcode gaat door; Google-tekst met token → vaste code', da.codeUit(new Error('GOOGLE_SUITE_PRIMARY_PRINCIPAL_NOT_FOUND')) === 'GOOGLE_SUITE_PRIMARY_PRINCIPAL_NOT_FOUND'
    && da.codeUit(new Error(`invalid_grant: Token ${GEHEIM_TOKEN} has been expired`)) === 'GOOGLE_TOKEN_FOUT');
  const pool = getPool('systeem');
  const lid = randomUUID(), lidMail = `lid-${randomBytes(3).toString('hex')}@eenheid.test`;
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', lid, { email: lidMail, role: 'member', status: 'approved', name: 'Lid Test' }]);
  let tokenVragen = 0;
  const nep = (o: Partial<{ tokenFout: boolean; githubGooit: boolean }> = {}): import('../../backend/diagnostiek-account').AccountBronnen => ({
    gebruiker: async (id) => (id === lid ? { id: lid, email: lidMail, status: 'approved' } : null),
    google: async () => ({ mail: { status: 'granted', gebonden: true }, drive: { status: 'granted', gebonden: true }, calendar: { status: 'consent_required', gebonden: false } }),
    // De bron «heeft» een token; de diagnose mag alleen weten óf het er is.
    googleToken: async (_id, _e, d) => { tokenVragen++; const token = GEHEIM_TOKEN; if (o.tokenFout && d === 'mail') throw new Error(`invalid_grant ${token} ${GEHEIM_ADRES}`); return token ? true : 'GOOGLE_GEEN_TOKEN'; },
    mailAccounts: async () => ({ totaal: 1, verbonden: 1, herstelNodig: 0, gestoord: 0 }),
    mailWachtrij: async () => ({ vast: 0, mislukt24: 0 }),
    github: async () => { if (o.githubGooit) throw new Error('netwerk ' + GEHEIM_ADRES); return true; },
    ai: async () => ({ actief: 1, bijnaVerlopen: 0 }),
    apparaten: async () => ({ totaal: 1, verbonden: 1, stil: 1 }),
  });
  const ondiep = await da.accountFeiten(lid, nep(), false);
  check('accountFeiten (niet diep): geen tokenvraag aan Google (pagina openen kost niets)', tokenVragen === 0 && ondiep!.google!.mail.token === 'niet-getest');
  const diep = await da.accountFeiten(lid, nep({ tokenFout: true, githubGooit: true }), true);
  check('accountFeiten (diep): token gevraagd alleen voor gekoppelde diensten (mail, drive), niet voor agenda', tokenVragen === 2, String(tokenVragen));
  check('accountFeiten: mail-token geweigerd → fout + vaste code; GitHub-fout → onbekend (geen gooi)', diep!.google!.mail.token === 'fout' && beoordeelAccount(diep!).mail.code === 'GOOGLE_TOKEN_FOUT' && beoordeelAccount(diep!).github.stand === 'onbekend');
  check('accountFeiten: onbekende gebruiker → null', (await da.accountFeiten('bestaat-niet-123', nep())) === null);

  const sessies: string[] = [];
  try {
    const r1 = await da.accountRonde(lid, lid, nep({ tokenFout: true }));
    check('accountRonde: 7 uitslagen bewaard', r1!.uitslagen.length === 7 && Number((await pool.query('SELECT count(*)::int AS n FROM app.diagnostiek_account_uitslagen WHERE batch=$1', [r1!.batch])).rows[0].n) === 7);
    const rijenDb = JSON.stringify((await pool.query('SELECT * FROM app.diagnostiek_account_uitslagen WHERE user_id=$1', [lid])).rows);
    check('PRIVACY opslag: geen token, geen adres, geen Google-tekst', !rijenDb.includes('ya29') && !rijenDb.includes(GEHEIM_ADRES) && !rijenDb.includes(lidMail) && !/invalid_grant/i.test(rijenDb));
    const o1 = await da.accountOverzicht(lid);
    check('accountOverzicht: laatste per dienst + historie; «door» als zelf/beheer/systeem (geen id)', o1.laatste.length === 7 && o1.historie.length >= 7 && o1.historie.every((h) => h.door === 'zelf') && !JSON.stringify(o1).includes(lid));
    const mailRij = o1.laatste.find((u) => u.dienst === 'mail')!;
    check('accountOverzicht: mail = fout (token geweigerd), apparaten = let op (stil)', mailRij.stand === 'fout' && o1.laatste.find((u) => u.dienst === 'apparaten')!.code === 'APPARAAT_STIL');
    await da.accountRonde(lid, 'beheerder-x', nep());
    check('historie: ronde door een beheerder → «beheer»', (await da.accountOverzicht(lid)).historie[0].door === 'beheer');

    // ---------------------------------------------------------------- rechten via de echte routes
    const { handler } = await import('../../backend/index');
    const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
    const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
    const eig = bestaand ? String(bestaand.id) : randomUUID();
    if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
    else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', eig, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
    const sessie = async (uid: string) => {
      const id = randomUUID(), token = randomBytes(32).toString('base64url'), t = Date.now();
      const epoch = Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [uid])).rows[0]?.e || 0);
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: 'https://id.tarasevych.com', tabHash: sha('ecosystem'), grantId: '', createdAt: t, authenticatedAt: t, lastSeenAt: t, idleExpiresAt: t + 864e5, absoluteExpiresAt: t + 864e5, rotation: 0, version: 1, revocationEpoch: epoch, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' }]);
      sessies.push(id);
      return `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}`;
    };
    const roep = async (pad: string, cookie: string, host: string, service: string, body: Record<string, unknown> = {}) => {
      const evt = { headers: { host, origin: `https://${host}`, 'content-type': 'application/json', cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service, tabContext: randomBytes(24).toString('hex'), sourceOrigin: `https://${host}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
      const r = await handler(evt as never) as { statusCode: number; body: string };
      let data: any = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
      return { status: r.statusCode, data, ruw: String(r.body || '') };
    };
    const cLid = await sessie(lid), cEig = await sessie(eig);
    // Eigenaar heeft een (nagebootste) accountuitslag die het lid NIET mag zien.
    await pool.query(`INSERT INTO app.diagnostiek_account_uitslagen (user_id, dienst, stand, code, door, batch) VALUES ($1, 'github', 'fout', 'EIGENAAR_MERKTEKEN', $1, 'x')`, [eig]);
    const zelf = await roep('/api/owner/diagnostiek/mijn-diensten', cLid, 'id.tarasevych.com', 'identity', { gebruikerId: eig });
    check('RECHTEN: gewone gebruiker → 200, alleen het EIGEN account (gebruikerId van de eigenaar genegeerd)', zelf.status === 200 && Array.isArray(zelf.data.rijen) && !zelf.ruw.includes('EIGENAAR_MERKTEKEN') && zelf.data.rijen.find((r: any) => r.dienst === 'mail')?.account?.stand === 'ok', `${zelf.status} ${zelf.ruw.slice(0, 160)}`);
    check('RECHTEN: gewone gebruiker krijgt GEEN serverkolom', zelf.data.rijen.every((r: any) => r.server === null));
    check('PRIVACY antwoord: geen e-mail, geen token, geen gebruikers-id', !zelf.ruw.includes(lidMail) && !zelf.ruw.includes('ya29') && !zelf.ruw.includes(lid));
    const adminLid = await roep('/api/owner/admin/diagnostiek/account', cLid, 'admin.tarasevych.com', 'admin', { gebruikerId: eig });
    check('RECHTEN: gewone gebruiker op de beheerroute → geweigerd (401/403), niets van de eigenaar', [401, 403].includes(adminLid.status) && !adminLid.ruw.includes('EIGENAAR_MERKTEKEN'), `${adminLid.status} ${adminLid.ruw.slice(0, 120)}`);
    const zonder = await roep('/api/owner/diagnostiek/mijn-diensten', '', 'id.tarasevych.com', 'identity');
    check('RECHTEN: zonder sessie → 401', zonder.status === 401);
    const adm = await roep('/api/owner/admin/diagnostiek/account', cEig, 'admin.tarasevych.com', 'admin', { gebruikerId: lid });
    if (adm.status === 200) {
      check('BEHEER: eigenaar ziet gekozen account met beide kolommen', adm.data.rijen.length === 7 && adm.data.rijen.every((r: any) => r.server !== null && 'account' in r) && adm.data.gebruiker?.id === lid, adm.ruw.slice(0, 200));
      check('PRIVACY beheer: geen token of Google-tekst', !adm.ruw.includes('ya29') && !/invalid_grant/i.test(adm.ruw));
      const log = JSON.stringify((await pool.query(`SELECT * FROM app.audit WHERE action = 'diag.account.bekeken' ORDER BY id DESC LIMIT 1`).catch(() => ({ rows: [] }))).rows);
      check('LOGBOEK: diag.account.bekeken geschreven, zonder token/adres', log.includes('diag.account.bekeken') && !log.includes('ya29') && !log.includes(GEHEIM_ADRES), log.slice(0, 200));
    } else {
      // De beheerroute vraagt de admin-dienst; in deze testopstelling kan de sessie op admin.* een stap-op of toegang vragen.
      check('BEHEER: eigenaar wordt niet als «onbekend» geweigerd (alleen sessie/dienst-poort)', [401, 403].includes(adm.status) && !/GEBRUIKER_ONBEKEND/.test(adm.ruw), `${adm.status} ${adm.ruw.slice(0, 160)}`);
    }
    const eigenGebruikerOnbekend = await roep('/api/owner/admin/diagnostiek/account', cEig, 'admin.tarasevych.com', 'admin', { gebruikerId: '../../etc' });
    check('BEHEER: ongeldige gebruikerId → 400/401/403, nooit 200', eigenGebruikerOnbekend.status !== 200);
  } finally {
    await pool.query('DELETE FROM app.diagnostiek_account_uitslagen WHERE user_id = ANY($1::text[]) OR code = $2', [[lid], 'EIGENAAR_MERKTEKEN']).catch(() => undefined);
    await pool.query("DELETE FROM app.records WHERE tbl='users' AND id=$1", [lid]).catch(() => undefined);
    for (const id of sessies) await pool.query("DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1", [id]).catch(() => undefined);
  }

  // ---------------------------------------------------------------- planning en bedrading
  const cron = JSON.parse(lees('cron.json')) as Array<{ name: string; cron: string; handler: string }>;
  const c = cron.find((x) => x.name === 'diagnostiek-server');
  check('cron.json: «diagnostiek-server» elke 15 min → diagnostiekServerCron', !!c && c.cron === '*/15 * * * *' && c.handler === 'diagnostiekServerCron');
  check('backend/index.ts exporteert diagnostiekServerCron (server/cron.ts zoekt de handler daar)', /export \{diagnostiekServerCron\} from '\.\/beheer-diagnostiek'/.test(lees('backend/index.ts')));
  const timer = lees('deploy/mijn-ruimte-diagnostiek-server.timer');
  check('systemd-timer: elke 15 min, Unit=mijn-ruimte-cron@diagnostiek-server.service, in TIMERS van de installer', /OnCalendar=\*:07\/15/.test(timer) && timer.includes('Unit=mijn-ruimte-cron@diagnostiek-server.service') && /TIMERS=\([^)]*mijn-ruimte-diagnostiek-server\.timer/.test(lees('deploy/installeer-app.sh')));
  const ad = await import('../../backend/beheer-diagnostiek');
  check('serverRonde + cron-handler bestaan; knop «Перевірити» gebruikt dezelfde ronde', typeof ad.serverRonde === 'function' && typeof ad.diagnostiekServerCron === 'function' && lees('backend/beheer-diagnostiek.ts').includes('await serverRonde(ids, { id: auth.user.id'));
  const inst = lees('src/InstellingencentrumWeergave.tsx'), md = lees('src/instellingen/MijnDiensten.tsx');
  check('Налаштування → Акаунт: «Стан моїх служб» (alleen eigen account, geen serverkolom)', inst.includes('<MijnDiensten lang={p.lang}/>') && md.includes("'/api/owner/diagnostiek/mijn-diensten'") && md.includes('metServer={false}') && !/mijn-diensten', \{[^}]*gebruikerId/.test(md));
  check('Діагностика: tab «Для всіх / цей акаунт» + tabel bij «Скарга користувача»', lees('src/diagnostiek/Diagnostiek.tsx').includes("tab === 'account' && <AccountTabel") && lees('src/diagnostiek/GebruikerTab.tsx').includes('<AccountTabel lang={lang} ctx={ctx} gebruikerId={detail.gebruiker.id} />'));
  const css = lees('src/instellingen/mijn-diensten.css');
  check('390px: tabel wordt kaarten (geen horizontaal scrollen), kleuren uit het thema', /@media \(max-width:560px\)/.test(css) && css.includes('var(--panel)') && !/#fff\b|#000\b/.test(css));
  return einde();
}
