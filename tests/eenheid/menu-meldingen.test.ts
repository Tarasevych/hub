// Menu v2 fase B2/B3: «levend» menu. Puur deel (voorkeuren normaliseren, stille uren, doel van een melding, veilige links,
// badges samenstellen) én de teller-routes via de echte handler (nep-Google): alleen een goedgekeurde sessie, alleen vanaf
// mail.tarasevych.com, alleen een geheel getal; gebruikers zien elkaars tellers niet. Opruimen op exact e-mailadres.
import { randomBytes } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { badgesBouwen, badgeTekst, isStil, itemVanLink, meldingDoel, normaliseerMeldingen, standaardMeldingen, vanServer, vanTellers, veiligeLink, MAX_BELLEN, type MenuMelding } from '../../shared/menu-meldingen';
import { normaliseerZijbalk, standaardZijbalk, allesTerugzetten } from '../../shared/menu-model';

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-meldingen');
  // ---------------------------------------------------------------- voorkeuren
  const std = standaardMeldingen();
  check('rommel → standaard', JSON.stringify(normaliseerMeldingen('x')) === JSON.stringify(std) && JSON.stringify(normaliseerMeldingen(null)) === JSON.stringify(std));
  const n = normaliseerMeldingen({ aan: false, stijl: 'neon', knipperen: 'ja', herinneren: 7, bellen: false, categorieen: { post: false, onzin: false, ai: 1 }, stil: { aan: true, van: '25:00', tot: '06:30' }, extra: 1 });
  check('ongeldige velden → standaard, geldige blijven', n.aan === false && n.stijl === 'getal' && n.knipperen === true && n.herinneren === 0 && n.bellen === false && n.categorieen.post === false && n.categorieen.ai === true && !('onzin' in n.categorieen) && n.stil.aan && n.stil.van === '22:00' && n.stil.tot === '06:30' && !('extra' in n), JSON.stringify(n));
  check('idempotent', JSON.stringify(normaliseerMeldingen(n)) === JSON.stringify(n));
  check('herinneren: alleen 0/15/30/60/120', normaliseerMeldingen({ herinneren: 60 }).herinneren === 60 && normaliseerMeldingen({ herinneren: 61 }).herinneren === 0);
  const z = normaliseerZijbalk({ modus: 'dicht', meldingen: { stijl: 'punt', categorieen: { systeem: false } } });
  check('zijbalk: meldingen genormaliseerd en idempotent', z.meldingen.stijl === 'punt' && z.meldingen.categorieen.systeem === false && JSON.stringify(normaliseerZijbalk(z)) === JSON.stringify(z));
  check('zijbalk: standaard bevat meldingen; «alles terugzetten» bewaart ze', JSON.stringify(standaardZijbalk().meldingen) === JSON.stringify(std) && allesTerugzetten(z).meldingen.stijl === 'punt');
  // ---------------------------------------------------------------- stille uren
  const stil = normaliseerMeldingen({ stil: { aan: true, van: '22:00', tot: '07:00' } });
  check('stille uren over middernacht', isStil(stil, 23 * 60) && isStil(stil, 3 * 60) && !isStil(stil, 7 * 60) && !isStil(stil, 12 * 60) && isStil(stil, 22 * 60));
  const dag = normaliseerMeldingen({ stil: { aan: true, van: '09:00', tot: '17:00' } });
  check('stille uren binnen een dag; uit = nooit stil', isStil(dag, 10 * 60) && !isStil(dag, 8 * 60) && !isStil(dag, 17 * 60) && !isStil(std, 23 * 60));
  // ---------------------------------------------------------------- doel + links
  check('itemVanLink: host → dienst, pad → pagina', itemVanLink('https://admin.tarasevych.com/access?x=1') === 'pg:admin/access' && itemVanLink('https://id.tarasevych.com/') === 'svc:identity' && itemVanLink('https://mail.tarasevych.com/onbekend') === 'svc:mail' && itemVanLink('https://evil.example/access') === undefined);
  check('meldingDoel: vaste soorten', meldingDoel('access_request').item === 'pg:admin/access' && meldingDoel('access_request').categorie === 'toegang' && meldingDoel('account_email_conflict').categorie === 'beveiliging' && meldingDoel('workspace_share').item === 'pg:hub/overview' && meldingDoel('google_login_config').categorie === 'systeem');
  check('meldingDoel: onbekende soort → hub, categorie uit naam', meldingDoel('security_alert').categorie === 'beveiliging' && meldingDoel('iets').item === 'svc:hub' && meldingDoel('iets').categorie === 'systeem');
  check('veiligeLink: alleen https op eigen domein of relatief pad', veiligeLink('https://admin.tarasevych.com/access') === 'https://admin.tarasevych.com/access' && veiligeLink('/inbox') === '/inbox'
    && [veiligeLink('javascript:alert(1)'), veiligeLink('http://admin.tarasevych.com/'), veiligeLink('https://tarasevych.com.evil.example/'), veiligeLink('//evil.example/x'), veiligeLink('https://u:p@hub.tarasevych.com/'), veiligeLink('data:text/html,x'), veiligeLink(42)].every((x) => x === undefined));
  // ---------------------------------------------------------------- server- en tellermeldingen
  const nu = Date.now();
  const s = vanServer([
    { id: 'a', kind: 'access_request', title: 'Запит', message: 'm', createdAt: nu - 1000 },
    { id: 'b', kind: 'access_request', title: 'Gelezen', message: '', createdAt: nu, read: true },
    { id: 'c', kind: 'account_email_conflict', title: '<b>x</b>', message: 'y'.repeat(999), createdAt: nu - 50, link: 'javascript:alert(1)' },
  ]);
  check('vanServer: alleen ongelezen, tekst begrensd, onveilige link weg', s.length === 2 && s[1].tekst.length === 280 && !('link' in s[1]) && s[1].titel === '<b>x</b>');
  check('vanTellers: alleen bij > 0 en meer dan weggeklikt', vanTellers({ mail: { ongelezen: 4, op: nu } }, {}, 'nl')[0]?.aantal === 4 && vanTellers({ mail: { ongelezen: 4, op: nu } }, { mail: 4 }, 'uk').length === 0 && vanTellers({ mail: { ongelezen: 5, op: nu } }, { mail: 4 }, 'uk').length === 1 && vanTellers({ mail: { ongelezen: 0, op: nu } }, {}, 'nl').length === 0 && vanTellers({}, {}, 'nl').length === 0);
  // ---------------------------------------------------------------- badges
  const alles: MenuMelding[] = [...s, ...vanTellers({ mail: { ongelezen: 7, op: nu - 10 } }, {}, 'uk')];
  const b = badgesBouwen(alles, std);
  check('badges: pagina + hoofditem (aggregatie)', b['pg:admin/access']?.aantal === 1 && b['svc:admin']?.aantal === 1 && b['pg:identity/account']?.aantal === 1 && b['svc:identity']?.aantal === 1 && b['pg:mail/inbox']?.aantal === 7 && b['svc:mail']?.aantal === 7, JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.aantal]))));
  check('badges: aan=false → niets', Object.keys(badgesBouwen(alles, { ...std, aan: false })).length === 0);
  check('badges: categorie uit → die badges weg', !badgesBouwen(alles, { ...std, categorieen: { ...std.categorieen, post: false } })['svc:mail'] && !!badgesBouwen(alles, { ...std, categorieen: { ...std.categorieen, post: false } })['svc:admin']);
  const gemengd = badgesBouwen([{ id: 'x1', bron: 'server', item: 'svc:hub', categorie: 'delen', titel: '', tekst: '', op: 1 }, { id: 'x2', bron: 'server', item: 'svc:hub', categorie: 'beveiliging', titel: '', tekst: '', op: 2 }], std);
  check('badges: beveiliging altijd voorop, nieuwste melding eerst', gemengd['svc:hub'].categorieen[0] === 'beveiliging' && gemengd['svc:hub'].meldingen[0].id === 'x2' && gemengd['svc:hub'].nieuwste === 2);
  const veel = badgesBouwen(Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, bron: 'server' as const, item: 'svc:hub', categorie: 'systeem' as const, titel: '', tekst: '', op: i })), std);
  check(`badges: max ${MAX_BELLEN} bellen, aantal blijft volledig`, veel['svc:hub'].meldingen.length === MAX_BELLEN && veel['svc:hub'].aantal === 12);
  check('badges: onbekende dienst/rommel-item genegeerd', Object.keys(badgesBouwen([{ id: 'q', bron: 'server', item: 'svc:evil', categorie: 'systeem', titel: '', tekst: '', op: 1 }, { id: 'r', bron: 'server', item: 'pg:hub/<x>', categorie: 'systeem', titel: '', tekst: '', op: 1 }], std)).every((k) => k === 'svc:hub'));
  check('badgeTekst: 99+', badgeTekst(5) === '5' && badgeTekst(100) === '99+');

  // ---------------------------------------------------------------- teller-routes (echte handler)
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const eigenaar = `mt-eig-${T}@example.test`, ander = `mt-ander-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  type B = ReturnType<typeof G.browser>;
  const zet = (b: B, host: string, service: string, body: Record<string, unknown>) => b.verzoek(host, '/api/owner/menu/tellers/zet', b.ctxBody(service, body));
  const lees = (b: B, host = 'id.tarasevych.com', service = 'identity') => b.verzoek(host, '/api/owner/menu/tellers', b.ctxBody(service));
  try {
    const leeg = G.browser();
    const r0 = await zet(leeg, 'mail.tarasevych.com', 'mail', { bron: 'mail', ongelezen: 3 });
    const r0b = await lees(leeg);
    check('zonder sessie: zet en lees geweigerd (401/403)', [r0.status, r0b.status].every((x) => x === 401 || x === 403), `${r0.status} ${r0b.status}`);

    const b2 = G.browser();
    await b2.aanmelden(`sub-mt-ander-${T}`, ander, { service: 'mail', intent: 'login' });
    const r1 = await zet(b2, 'mail.tarasevych.com', 'mail', { bron: 'mail', ongelezen: 3 });
    check('niet-goedgekeurd: 403 OWNER_APPROVED_SESSION_REQUIRED', r1.status === 403 && r1.body.includes('OWNER_APPROVED_SESSION_REQUIRED'), `${r1.status} ${r1.body.slice(0, 120)}`);
    check('niet-goedgekeurd: lezen ook 403', (await lees(b2, 'mail.tarasevych.com', 'mail')).status === 403);

    const b = G.browser();
    await b.aanmelden(`sub-mt-eig-${T}`, eigenaar, { service: 'mail', intent: 'login' });
    const leeg0 = await lees(b, 'mail.tarasevych.com', 'mail');
    check('eigenaar: begint zonder tellers', leeg0.status === 200 && JSON.stringify(leeg0.data.tellers) === '{}', leeg0.body.slice(0, 160));
    const ok = await zet(b, 'mail.tarasevych.com', 'mail', { bron: 'mail', ongelezen: 12 });
    check('eigenaar vanaf mail: 200, teller 12', ok.status === 200 && ok.data.tellers?.mail?.ongelezen === 12, `${ok.status} ${ok.body.slice(0, 160)}`);
    const uitId = await lees(b);
    check('eigenaar: leesbaar vanaf id.tarasevych.com', uitId.status === 200 && uitId.data.tellers?.mail?.ongelezen === 12, uitId.body.slice(0, 160));
    const r2 = await zet(b, 'id.tarasevych.com', 'identity', { bron: 'mail', ongelezen: 99 });
    check('andere dienst dan mail: 400 MENU_TELLER_BRON_ONGELDIG', r2.status === 400 && r2.body.includes('MENU_TELLER_BRON_ONGELDIG'), `${r2.status} ${r2.body.slice(0, 120)}`);
    const r2b = await zet(b, 'id.tarasevych.com', 'mail', { bron: 'mail', ongelezen: 99 });
    check('service «mail» geclaimd op id-host: geweigerd', r2b.status >= 400 && r2b.status < 500, String(r2b.status));
    const r3 = await zet(b, 'mail.tarasevych.com', 'mail', { bron: 'cloud', ongelezen: 1 });
    check('onbekende bron: 400', r3.status === 400 && r3.body.includes('MENU_TELLER_BRON_ONGELDIG'));
    const slecht = await Promise.all([-1, 1.5, 100000, '7', null].map((v) => zet(b, 'mail.tarasevych.com', 'mail', { bron: 'mail', ongelezen: v })));
    check('ongeldige waarden (-1, 1.5, 100000, "7", null): 400 MENU_TELLER_WAARDE_ONGELDIG', slecht.every((r) => r.status === 400 && r.body.includes('MENU_TELLER_WAARDE_ONGELDIG')), slecht.map((r) => r.status).join(','));
    check('na geweigerde verzoeken: teller nog 12', (await lees(b)).data.tellers?.mail?.ongelezen === 12);
    await zet(b, 'mail.tarasevych.com', 'mail', { bron: 'mail', ongelezen: 0 });
    check('teller naar 0', (await lees(b)).data.tellers?.mail?.ongelezen === 0);
    await zet(b, 'mail.tarasevych.com', 'mail', { bron: 'mail', ongelezen: 0 });
    const eigId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
    const rijen = (await pool.query("select count(*)::int as n from app.records where tbl='menu_tellers_v1' and data->>'userId'=$1", [eigId])).rows[0].n;
    check('één rij per gebruiker (geen groei bij herhalen)', rijen === 1, String(rijen));
    const anderId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [ander])).rows[0]?.id as string | undefined;
    const anderRijen = anderId ? (await pool.query("select count(*)::int as n from app.records where tbl='menu_tellers_v1' and data->>'userId'=$1", [anderId])).rows[0].n : -1;
    check('niet-goedgekeurde gebruiker: geen tellerrij', anderRijen === 0, String(anderRijen));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar, ander]])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }
  await closePool();
  return einde();
}
