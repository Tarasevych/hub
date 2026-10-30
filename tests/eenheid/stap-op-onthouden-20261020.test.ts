// «Запам'ятати цей браузер (не питати знову до виходу)» in het venster «Підтвердіть доступ».
// Vóór deze reeks deed het vinkje niets: het stond alleen in het geheugen van het venster en werd alleen in de Google-tak
// meegegeven aan een parameter die voor step-up tóch op false werd gezet. Deze test legt het echte gedrag vast:
//   1. de keuze gaat mee naar de server vanuit ELKE manier (passkey, TOTP, herstelcode, Google/eigen eindpunt);
//   2. een tweede gevoelige actie binnen de termijn vraagt niet opnieuw;
//   3. sterke acties en de lijst NOOIT_ONTHOUDEN vragen altijd opnieuw;
//   4. uitloggen vergeet het onthouden;
//   5. een tweede account in dezelfde browser blijft ongemoeid;
//   6. de termijn wordt gerespecteerd;
//   7. het onthouden is zichtbaar in het sessie-overzicht en kan daar vergeten worden.
// Alles via de echte handler (nagebootste Google, echte sessies, echte TOTP/herstelcodes/WebAuthn-handtekeningen).
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';
import {
  STAP_OP_ONTHOUD_MS, STAP_OP_TABEL, actieVoorPad, onthoudGeldig, onthoudMagVoorActie, onthoudMagVoorPad,
  onthoudVastleggen, onthoudVergeten, onthoudenSessies, stapOpFout, stapOpGeldig,
} from '../../backend/stap-op';

export async function main(): Promise<number> {
  const { check, einde } = checker('stap-op-onthouden');
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN stap-op-onthouden: geen database'); return 0; }
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const bewaard = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `onth-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const sys = getPool('systeem');
  const pool = getPool();
  const opruimen: string[] = [];
  const idVan = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  /** Zet de VERSE bevestigingen van dit account in het verleden; het onthouden blijft (tenzij ookOnthoud). */
  const verouder = async (userId: string, ookOnthoud = false) => {
    const oud = String(Date.now() - 20 * 60 * 1000);
    const velden = ['sessies', 'passkeySessies', 'sterkSessies', ...(ookOnthoud ? ['onthoudSessies'] : [])];
    for (const veld of velden) {
      await sys.query(`UPDATE app.records r SET data = r.data || jsonb_build_object($3::text,
        (SELECT coalesce(jsonb_object_agg(k, $2::text::jsonb), '{}'::jsonb) FROM jsonb_object_keys(r.data->$3::text) k))
        WHERE r.tbl = $4 AND r.data->>'userId' = $1`, [userId, oud, veld, STAP_OP_TABEL]);
    }
  };
  /** Het onthouden van dit account kunstmatig verouderen tot net buiten de termijn. */
  const onthoudVerlopen = async (userId: string) => {
    const tever = String(Date.now() - STAP_OP_ONTHOUD_MS - 60_000);
    await sys.query(`UPDATE app.records r SET data = r.data || jsonb_build_object('onthoudSessies',
      (SELECT coalesce(jsonb_object_agg(k, $2::text::jsonb), '{}'::jsonb) FROM jsonb_object_keys(r.data->'onthoudSessies') k))
      WHERE r.tbl = $3 AND r.data->>'userId' = $1`, [userId, tever, STAP_OP_TABEL]);
  };
  // Niet vlak voor een 30s-grens beginnen: de test gebruikt meerdere opeenvolgende TOTP-tijdvakken.
  if (Date.now() % 30000 > 20000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));

  try {
    // ------------------------------------------------------------------ eenheden: welke acties/paden mogen onthouden worden
    check('lijst: gewone acties mogen onthouden worden, beveiligingsacties nooit',
      onthoudMagVoorActie('bevestigen') && onthoudMagVoorActie('agenten')
      && !onthoudMagVoorActie('uitrol-goedkeuren') && !onthoudMagVoorActie('passkey-toevoegen') && !onthoudMagVoorActie('passkey-verwijderen')
      && !onthoudMagVoorActie('herstelcodes-nieuw') && !onthoudMagVoorActie('account-verwijderen') && !onthoudMagVoorActie('wachtwoord')
      && !onthoudMagVoorActie('beheer') && !onthoudMagVoorActie('onbekend') && !onthoudMagVoorActie(''));
    check('paden: kluis/sleutels, verwijderen, uitrol, passkeys, terminal en SSH vragen altijd; een gewoon pad mag onthouden worden',
      onthoudMagVoorPad('/api/owner/tech/activeren') && onthoudMagVoorPad('/api/owner/mcp-connector/consent')
      && !onthoudMagVoorPad('/api/owner/uitrol/goedkeuren') && !onthoudMagVoorPad('/api/owner/access/passkeys/registreren/opties')
      && !onthoudMagVoorPad('/api/owner/api-platform/vault/geheim') && !onthoudMagVoorPad('/api/owner/agents/verwijderen')
      && !onthoudMagVoorPad('/api/owner/terminal/start') && !onthoudMagVoorPad('/api/owner/ssh-ca/uitgeven')
      && !onthoudMagVoorPad(''),
      `${actieVoorPad('/api/owner/tech/activeren')} ${actieVoorPad('/api/owner/uitrol/goedkeuren')}`);

    // ------------------------------------------------------------------ eenheid: per account, zelfde browser
    {
      const a = randomUUID(), b = randomUUID(), nu = Date.now();
      opruimen.push(a, b);
      const anker = { id: `anker-${T}`, createdAt: nu, userId: a };
      const authA = { user: { id: a }, session: anker, tabSession: { id: `tabA-${T}`, createdAt: nu } };
      const authB = { user: { id: b }, session: anker, tabSession: { id: `tabB-${T}`, createdAt: nu } };
      const tot = await onthoudVastleggen(authA);
      check('onthouden hangt aan de browser-sessie van DIT account en geldt hoogstens de vaste termijn',
        tot > nu && tot <= nu + STAP_OP_ONTHOUD_MS + 1000 && (await onthoudGeldig(authA)) && Object.keys(await onthoudenSessies(a)).join() === anker.id);
      check('onthouden in account A laat account B in dezelfde browser (zelfde anker) ongemoeid',
        (await stapOpGeldig(authA)) && !(await stapOpGeldig(authB)) && !(await onthoudGeldig(authB)) && Object.keys(await onthoudenSessies(b)).length === 0);
      check('sterke/altijd-vragen-acties negeren het onthouden; een onbekend pad ook',
        (await stapOpFout(authA, { onthoud: false })) === 'STEP_UP_REQUIRED'
        && (await stapOpFout(authA, { onthoud: onthoudMagVoorPad('/api/owner/uitrol/goedkeuren') })) === 'STEP_UP_REQUIRED'
        && (await stapOpFout(authA, { onthoud: onthoudMagVoorPad('') })) === 'STEP_UP_REQUIRED'
        && (await stapOpFout(authA, { onthoud: onthoudMagVoorPad('/api/owner/tech/activeren') })) === '');
      check('termijn: na de termijn vervalt het onthouden en wordt het niet meer opgesomd',
        !(await stapOpGeldig(authA, nu + STAP_OP_ONTHOUD_MS + 1000)) && !(await onthoudGeldig(authA, nu + STAP_OP_ONTHOUD_MS + 1000))
        && Object.keys(await onthoudenSessies(a, nu + STAP_OP_ONTHOUD_MS + 1000)).length === 0);
      check('«забути» wist precies die rij', (await onthoudVergeten(a, anker.id)) && !(await onthoudGeldig(authA)) && !(await onthoudVergeten(a, anker.id)));
    }

    // ------------------------------------------------------------------ echte handler: eigenaar meldt zich aan en zet TOTP
    const O = G.browser();
    await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'hub' });
    const oId = await idVan(eigenaar);
    const idPost = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('id.tarasevych.com', pad, O.ctxBody('identity', extra));
    const hubPost = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('hub.tarasevych.com', pad, O.ctxBody('hub', extra));
    const stap = () => Math.floor(Date.now() / 30000);
    const start = await idPost('/api/owner/access/totp/start');
    const bevestigd = await idPost('/api/owner/access/totp/confirm', { code: totpCode(start.data.secret, stap() - 1) });
    const herstelcodes: string[] = bevestigd.data.recoveryCodes || [];
    const geheim = String(start.data.secret || '');
    if (!oId || !geheim || !herstelcodes.length) { check('opzet: eigenaar met TOTP en herstelcodes', false, `${start.status}/${bevestigd.status}`); return einde(); }

    /** Een gewone gevoelige actie (gewone poort, pad mag onthouden worden). Vraagt hij om bevestiging? */
    const vraagtOmBevestiging = async () => {
      const r = await hubPost('/api/owner/tech/activeren', { modus: 'tijd', minuten: 15, reden: 'eenheidstest onthouden' });
      return r.status === 403 && r.data.error === 'STEP_UP_REQUIRED';
    };
    /** Een actie die ALTIJD moet vragen (passkey toevoegen). */
    const passkeyVraagt = async () => {
      const r = await idPost('/api/owner/access/passkeys/registreren/opties');
      return r.status === 403 && (r.data.error === 'STEP_UP_REQUIRED' || r.data.error === 'STEP_UP_STRONG_REQUIRED');
    };

    await verouder(oId, true);
    check('uitgangspunt: zonder verse bevestiging en zonder onthouden vraagt een gevoelige actie erom', await vraagtOmBevestiging());

    // ------------------------------------------------------------------ het venster weet eerlijk wat onthouden mag
    const mGewoon = await idPost('/api/owner/access/stap-op/methoden', { actie: 'bevestigen' });
    const mUitrol = await idPost('/api/owner/access/stap-op/methoden', { actie: 'uitrol-goedkeuren' });
    const mSterk = await idPost('/api/owner/access/stap-op/methoden', { actie: 'bevestigen', sterk: true });
    check('venster: de server zegt per actie of onthouden mag (sterk en uitrol goedkeuren: nee) en noemt de termijn',
      mGewoon.data.onthoudMag === true && mGewoon.data.onthoudUren === Math.round(STAP_OP_ONTHOUD_MS / 3600000)
      && mUitrol.data.onthoudMag === false && mSterk.data.onthoudMag === false,
      `${JSON.stringify([mGewoon.data.onthoudMag, mUitrol.data.onthoudMag, mSterk.data.onthoudMag, mGewoon.data.onthoudUren])}`);

    // ------------------------------------------------------------------ 1) TOTP stuurt de keuze mee
    const viaTotp = await idPost('/api/owner/access/stap-op', { code: totpCode(geheim, stap()), actie: 'bevestigen', onthoud: true });
    check('TOTP: de keuze komt aan en wordt vastgelegd', viaTotp.status === 200 && viaTotp.data.onthouden === true && viaTotp.data.onthoudTot > Date.now(), `${viaTotp.status} ${viaTotp.body.slice(0, 120)}`);
    await verouder(oId);
    check('tweede gevoelige actie binnen de termijn vraagt NIET opnieuw (dat was de klacht)', !(await vraagtOmBevestiging()));
    check('passkey toevoegen vraagt wél altijd, ook met onthouden aan', await passkeyVraagt());
    const naUitrolPad = await O.verzoek('admin.tarasevych.com', '/api/owner/uitrol/voorbereiders/toevoegen', O.ctxBody('admin', { email: `voorb-${T}@example.test` }));
    check('een uitrol-recht toekennen vraagt altijd om bevestiging, ook met onthouden aan',
      naUitrolPad.status === 403 && String(naUitrolPad.data.error || '').startsWith('STEP_UP'), `${naUitrolPad.status} ${naUitrolPad.body.slice(0, 100)}`);

    // ------------------------------------------------------------------ 7) zichtbaar in het sessie-overzicht + «забути»
    const overzicht = await idPost('/api/owner/identity/security/overview');
    const onthoudenRij = (overzicht.data.items || []).find((i: { onthoudTot?: number }) => Number(i.onthoudTot) > Date.now());
    check('sessie-overzicht toont welke browser onthouden is (met einddatum)', overzicht.status === 200 && !!onthoudenRij && Number(onthoudenRij.onthoudTot) > Date.now(), `${overzicht.status} ${JSON.stringify((overzicht.data.items || []).map((i: any) => [i.kind, i.onthoudTot]))}`);
    const vergeet = await idPost(`/api/owner/identity/security/items/${onthoudenRij?.id}/stap-op-vergeten`);
    check('«Забути цей браузер» uit het overzicht werkt en daarna wordt er weer gevraagd',
      vergeet.status === 200 && vergeet.data.vergeten === true && (await vraagtOmBevestiging())
      && !((await idPost('/api/owner/identity/security/overview')).data.items || []).some((i: { onthoudTot?: number }) => Number(i.onthoudTot) > Date.now()),
      `${vergeet.status} ${vergeet.body.slice(0, 100)}`);

    // ------------------------------------------------------------------ 2) herstelcode stuurt de keuze mee
    const viaHerstel = await idPost('/api/owner/access/stap-op', { methode: 'herstelcode', code: herstelcodes[0], actie: 'bevestigen', onthoud: true });
    check('herstelcode: de keuze komt aan en wordt vastgelegd', viaHerstel.status === 200 && viaHerstel.data.onthouden === true, `${viaHerstel.status} ${viaHerstel.body.slice(0, 120)}`);
    await verouder(oId);
    check('na een herstelcode met onthouden vraagt de volgende gewone actie niet opnieuw', !(await vraagtOmBevestiging()));

    // ------------------------------------------------------------------ 6) termijn
    await onthoudVerlopen(oId);
    check('termijn in de praktijk: een verlopen onthouden laat niets door', await vraagtOmBevestiging());

    // ------------------------------------------------------------------ 3) passkey stuurt de keuze mee
    await idPost('/api/owner/access/stap-op', { methode: 'herstelcode', code: herstelcodes[1], actie: 'bevestigen' });
    const pk = nieuwePasskey();
    const regOpties = await idPost('/api/owner/access/passkeys/registreren/opties');
    const reg = await idPost('/api/owner/access/passkeys/registreren', { uitdagingId: regOpties.data.uitdagingId, naam: 'Testsleutel', transports: ['internal'], ...registreer(pk, regOpties.data.publicKey?.challenge || '') });
    await verouder(oId, true);
    const pkOpties = await idPost('/api/owner/access/stap-op/passkey/opties');
    const viaPasskey = await idPost('/api/owner/access/stap-op/passkey', { uitdagingId: pkOpties.data.uitdagingId, assertie: bevestig(pk, pkOpties.data.publicKey?.challenge || ''), actie: 'bevestigen', onthoud: true });
    check('passkey: de keuze komt aan en wordt vastgelegd', reg.status === 200 && viaPasskey.status === 200 && viaPasskey.data.onthouden === true, `${reg.status}/${viaPasskey.status} ${viaPasskey.body.slice(0, 120)}`);
    await verouder(oId);
    check('na een passkey met onthouden vraagt de volgende gewone actie niet opnieuw', !(await vraagtOmBevestiging()));

    // ------------------------------------------------------------------ 4) het eigen eindpunt (de weg van «повторний вхід через Google»)
    await idPost(`/api/owner/identity/security/items/${onthoudenRij?.id}/stap-op-vergeten`);
    await verouder(oId, true);
    const zonderVers = await idPost('/api/owner/access/stap-op/onthouden', { actie: 'bevestigen' });
    check('eindpunt onthouden: zonder ECHT verse bevestiging geweigerd (een onthouden browser verlengt zichzelf niet)',
      zonderVers.status === 403 && zonderVers.data.error === 'STEP_UP_REQUIRED', `${zonderVers.status} ${zonderVers.body.slice(0, 100)}`);
    // Google-step-up: opnieuw aanmelden met verse auth_time in dezelfde browser.
    const googleStapOp = await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'hub', intent: 'step-up' });
    const naGoogle = await idPost('/api/owner/access/stap-op/onthouden', { actie: 'bevestigen' });
    check('Google: na terugkeer legt het eindpunt de keuze vast', googleStapOp.cb.status === 200 && naGoogle.status === 200 && naGoogle.data.onthouden === true, `${googleStapOp.cb.status}/${naGoogle.status} ${naGoogle.body.slice(0, 120)}`);
    const nietToegestaan = await idPost('/api/owner/access/stap-op/onthouden', { actie: 'uitrol-goedkeuren' });
    check('eindpunt onthouden: een actie uit de altijd-vragen-lijst wordt geweigerd', nietToegestaan.status === 400 && nietToegestaan.data.error === 'STEP_UP_ONTHOUDEN_NIET_TOEGESTAAN', `${nietToegestaan.status}`);
    await verouder(oId);
    check('na Google met onthouden vraagt de volgende gewone actie niet opnieuw', !(await vraagtOmBevestiging()));

    // ------------------------------------------------------------------ 5) uitloggen vergeet het onthouden
    const voorUitloggen = Object.keys(await onthoudenSessies(oId)).length;
    const uit = await hubPost('/api/owner/session/logout-current');
    check('uitloggen vergeet het onthouden (zoals het vinkje belooft: «не питати знову до виходу»)',
      voorUitloggen > 0 && uit.status === 200 && Object.keys(await onthoudenSessies(oId)).length === 0, `${voorUitloggen} → ${Object.keys(await onthoudenSessies(oId)).length}`);

    // ------------------------------------------------------------------ bedrading in het venster zelf
    const venster = readFileSync('src/platform/bevestig-toegang.tsx', 'utf8');
    const helper = readFileSync('src/platform/stap-op.ts', 'utf8');
    check('venster: het vinkje staat in de kaart (niet verstopt onder «Problemen?») en wordt vervangen door een eerlijke regel als onthouden niet mag',
      /onthoudMag\s*$|onthoudMag/.test(venster) && venster.includes("data-onthoud='nooit'") && venster.includes('onthoudNooit') && !venster.includes("alternatieven.length > 0 && <div className='bevestig-toegang-alt'>\n        <h3>{t('problemen')}</h3>\n        <label"));
    check('venster: alle vier de manieren sturen de keuze mee (passkey, TOTP/herstelcode, Google via sessionStorage)',
      venster.includes('opties.actie, onthoudAan') && /onthoudAan \? \{ onthoud: true \}/.test(venster) && venster.includes('bewaarOnthoudKeuze({ service: opties.service')
      && !venster.includes('remember: onthoud') && helper.includes("post('/api/owner/access/stap-op/onthouden'") && /onthoud \? \{ onthoud: true \}/.test(helper));
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 700));
  } finally {
    await sys.query("DELETE FROM app.records WHERE tbl = $1 AND data->>'userId' = ANY($2::text[])", [STAP_OP_TABEL, opruimen]).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [opruimen]).catch(() => undefined);
    G.herstel();
    for (const [k, v] of Object.entries({ OWNER_EMAIL: bewaard.owner, GOOGLE_OAUTH_CLIENT_ID: bewaard.id, GOOGLE_OAUTH_CLIENT_SECRET: bewaard.secret })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await closePool();
  }
  return einde();
}
