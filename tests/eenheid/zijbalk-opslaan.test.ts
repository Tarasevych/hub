// Menu v2: POST /api/owner/ui/sidebar/save via de echte handler (nep-Google). Weigert zonder sessie, met een niet-goedgekeurde
// sessie (403 OWNER_APPROVED_SESSION_REQUIRED) en met een te grote payload (413 SIDEBAR_TOO_LARGE); een geweigerd verzoek
// verandert de opgeslagen voorkeur niet. Een geldige opslag wordt strikt genormaliseerd teruggegeven.
import { randomBytes } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('zijbalk-opslaan');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const eigenaar = `zb-eig-${T}@example.test`, ander = `zb-ander-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  type B = ReturnType<typeof G.browser>;
  const opslaan = (b: B, sidebar: unknown) => b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar }));
  const voorkeur = async (b: B) => (await b.verzoek('id.tarasevych.com', '/api/owner/ui/preferences', b.ctxBody('identity'))).data.sidebar;
  try {
    // ---- zonder sessie
    const leeg = G.browser();
    const r0 = await opslaan(leeg, { modus: 'dicht' });
    check('zonder sessie: geweigerd (401/403), niets opgeslagen', (r0.status === 401 || r0.status === 403) && !r0.data.sidebar, `${r0.status} ${r0.body.slice(0, 120)}`);

    // ---- niet-goedgekeurde sessie (ander Google-account, nog geen toegang)
    const b2 = G.browser();
    await b2.aanmelden(`sub-zb-ander-${T}`, ander, { service: 'identity', intent: 'login' });
    const r1 = await opslaan(b2, { modus: 'dicht', icoonStijl: 'kleur' });
    check('niet-goedgekeurde sessie: 403 OWNER_APPROVED_SESSION_REQUIRED', r1.status === 403 && JSON.stringify(r1.data).includes('OWNER_APPROVED_SESSION_REQUIRED'), `${r1.status} ${r1.body.slice(0, 160)}`);
    const anderId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [ander])).rows[0]?.id as string | undefined;
    const anderPrefs = anderId ? (await pool.query("select count(*)::int as n from app.records where tbl='owner_ui_preferences_v1' and data->>'userId'=$1 and data ? 'sidebar'", [anderId])).rows[0].n : -1;
    check('niet-goedgekeurde sessie: geen zijbalkvoorkeur in de database', anderPrefs === 0, String(anderPrefs));

    // ---- eigenaar: geldige opslag
    const b = G.browser();
    await b.aanmelden(`sub-zb-eig-${T}`, eigenaar, { service: 'identity', intent: 'login' });
    const ok = await opslaan(b, { modus: 'dicht', icoonStijl: 'kleur', onbekend: 'x', dock: { transparantie: 999 } });
    check('eigenaar: geldige opslag 200, genormaliseerd (onbekende velden weg, begrensd)', ok.status === 200 && ok.data.sidebar?.modus === 'dicht' && ok.data.sidebar?.icoonStijl === 'kleur' && !('onbekend' in (ok.data.sidebar || {})) && ok.data.sidebar?.dock?.transparantie === 60, `${ok.status} ${ok.body.slice(0, 200)}`);
    check('eigenaar: voorkeur komt terug via /api/owner/ui/preferences', (await voorkeur(b))?.modus === 'dicht');

    // ---- te grote payload
    const groot = { modus: 'open', icoonStijl: 'klassiek', items: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`pg:hub/p${i}`, { zichtbaar: false, icoon: 'x'.repeat(40) }])) };
    check('testpayload is echt groter dan 20 000 tekens', JSON.stringify(groot).length > 20000, String(JSON.stringify(groot).length));
    const r2 = await opslaan(b, groot);
    check('te grote payload: 413 SIDEBAR_TOO_LARGE', r2.status === 413 && JSON.stringify(r2.data).includes('SIDEBAR_TOO_LARGE'), `${r2.status} ${r2.body.slice(0, 160)}`);
    const na = await voorkeur(b);
    check('te grote payload: opgeslagen voorkeur ongewijzigd (modus dicht, kleur)', na?.modus === 'dicht' && na?.icoonStijl === 'kleur', JSON.stringify(na).slice(0, 160));
    const r3 = await opslaan(b, 'x'.repeat(20001));
    check('te grote string als sidebar: ook 413', r3.status === 413, String(r3.status));
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
