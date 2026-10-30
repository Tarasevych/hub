// «Секрети й ключі» (admin /contour): zuivere hulpfuncties, lijst zonder waarden, en de kluisroutes met een ECHTE step-up:
// tonen/opslaan/verwijderen vragen passkey/code (Google alleen telt niet), één bevestiging = één actie, en alles komt in de geschiedenis.
import { randomUUID } from 'node:crypto';
import { createApiPlatformVaultRoutes } from '../../backend/api-platform-kluis';
import { geheimenGeschiedenis, geheimenLijst, geheimenRoutes, overzichtGeopend } from '../../backend/geheimen';
import { passkeyStapOpVastleggen, googleStapOpVastleggen, stapOpVerbruiken } from '../../backend/stap-op';
import { registreerMethodenBron } from '../../backend/toegang-context';
import { afleiden, lijktOpGeheim, MASKER, AUDIT_ACTIES, type Geheim } from '../../shared/geheimen';
import { aandacht, filterGeheimen, filterJournaal, foutTekst, groepeer, initialen, laatstePerNaam, sorteerGeheimen, standaardFilters, standaardJournaal, telStanden } from '../../src/geheimen/hulp';
import { db } from '../../server/platform';
import { auditToevoegen } from '../../server/platform/audit';
import { closePool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

const g = (o: Partial<Geheim>): Geheim => ({ id: 'x', naam: 'X', bron: 'vault', groep: 'eigen', dienst: 'overig', staat: 'ingesteld', gemaskeerd: MASKER, kanTonen: true, kanWijzigen: true, kanVerwijderen: true, ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('geheimen');

  // ------------------------------------------------------------------ zuiver
  check('groep/dienst uit naam: Google, GitHub, database, SSH, betaling, onbekend → site', afleiden('GOOGLE_OAUTH_CLIENT_SECRET').groep === 'google' && afleiden('GITHUB_APP_KEY').dienst === 'github'
    && afleiden('DATABASE_URL_APP').groep === 'database' && afleiden('SSH_CA_PRIVATE_KEY').groep === 'server' && afleiden('STRIPE_SECRET').groep === 'betaling' && afleiden('IETS_ANDERS_TOKEN').groep === 'site');
  check('lijktOpGeheim: tokens/sleutels ja; PATH, HOME, npm_*, proxy nee', ['AUDIT_IP_PEPPER', 'SCIM_BEARER_TOKEN', 'OWNER_VAULT_ENCRYPTION_KEY_V1', 'STRIPE_API_KEY', 'DATABASE_URL_APP'].every(lijktOpGeheim)
    && !['PATH', 'HOME', 'npm_config_cache', 'HTTPS_PROXY', 'NODE_ENV', 'SSH_AUTH_SOCK', 'KEYBOARD'].some(lijktOpGeheim));
  const lijst = [g({ id: '1', naam: 'B_OK', staat: 'ingesteld' }), g({ id: '2', naam: 'A_VERLOPEN', staat: 'verlopen', groep: 'ai' }), g({ id: '3', naam: 'C_ONTBREEKT', staat: 'ontbreekt', bron: 'env', groep: 'server', dienst: 'ssh' }), g({ id: '4', naam: 'D_BIJNA', staat: 'bijna', groep: 'cloud', dienst: 'github' })];
  check('sorteren: verlopen, bijna, ontbreekt, dan ingesteld', sorteerGeheimen(lijst).map((x) => x.naam).join() === 'A_VERLOPEN,D_BIJNA,C_ONTBREEKT,B_OK');
  check('filter: zoek (naam + dienstnaam), groep, bron, staat «aandacht»', filterGeheimen(lijst, { ...standaardFilters, zoek: 'github' }, 'nl').map((x) => x.naam).join() === 'D_BIJNA'
    && filterGeheimen(lijst, { ...standaardFilters, groep: 'ai' }, 'uk').length === 1 && filterGeheimen(lijst, { ...standaardFilters, bron: 'env' }, 'uk')[0].naam === 'C_ONTBREEKT'
    && filterGeheimen(lijst, { ...standaardFilters, staat: 'aandacht' }, 'uk').length === 3 && lijst.filter(aandacht).length === 3);
  const st = telStanden(lijst);
  check('tellers: totaal, aandacht, per staat', st.totaal === 4 && st.aandacht === 3 && st.verlopen === 1 && st.ontbreekt === 1 && st.ingesteld === 1 && groepeer(lijst).length === 4);
  const ev = (id: string, naam: string, actie: any, at: number, wie = 'u1') => ({ id, at, actie, resultaat: 'success', naam, wie: { id: wie, naam: `Naam ${wie}`, email: `${wie}@x.y`, foto: '' }, methode: 'passkey', apparaat: '', info: '' });
  const j = [ev('3', 'K1', 'getoond', 3000), ev('2', 'K2', 'aangemaakt', 2000, 'u2'), ev('1', 'K1', 'aangemaakt', 1000)];
  check('journaal: laatste per naam, filter op actie/wie/datum/zoek', laatstePerNaam(j).get('K1')?.id === '3' && filterJournaal(j, { ...standaardJournaal, actie: 'aangemaakt' }).length === 2
    && filterJournaal(j, { ...standaardJournaal, wie: 'u2' }).length === 1 && filterJournaal(j, { ...standaardJournaal, zoek: 'k2' }).length === 1 && filterJournaal(j, { ...standaardJournaal, van: '2100-01-01' }).length === 0);
  check('initialen en foutteksten (NL + UK, onbekende code blijft zichtbaar)', initialen('Eigenaar Test', '') === 'PT' && initialen('', 'a@b.c') === 'A' && /passkey/.test(foutTekst('STEP_UP_STRONG_REQUIRED', 'nl')) && /скасовано/.test(foutTekst('STEP_UP_STRONG_REQUIRED', 'uk')) && foutTekst('IETS_RAARS', 'nl') === 'IETS_RAARS');

  // ------------------------------------------------------------------ routes (echte database, echte versleuteling, echte step-up)
  if (!process.env.OWNER_VAULT_ENCRYPTION_KEY_V1 || (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL)) { console.log('OVERGESLAGEN routes: geen database of kluissleutel'); return einde(); }
  delete process.env.STAP_OP_UIT;
  const U = `geh-${randomUUID()}`;
  const EMAIL = process.env.OWNER_EMAIL || `${U}@test.invalid`;
  const user = { id: U, email: EMAIL, role: 'owner', status: 'approved', entitlements: ['api-platform'] };
  const sessie = { id: `sess-${U}`, createdAt: Date.now() };
  const auth = { user, session: sessie, service: 'admin' } as any;
  registreerMethodenBron(async () => ({ passkey: true, totp: false, herstelcode: false }));
  const vaultRoutes = createApiPlatformVaultRoutes({
    requireSession: async () => auth,
    respond: (data: unknown, status = 200) => ({ statusCode: status, body: JSON.stringify(data) }),
    fail: (message: string, status = 400) => ({ statusCode: status, body: JSON.stringify({ error: message }) }),
    audit: async (userId: string, action: string, result: string, details?: Record<string, unknown>) => { await auditToevoegen({ ownerId: userId, action, result, details, type: 'beveiliging' }); },
    body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}),
  }) as Record<string, any[]>;
  const geh = geheimenRoutes({ requireSession: async () => auth }) as Record<string, any[]>;
  const event = { headers: { host: 'admin.tarasevych.com', origin: 'https://admin.tarasevych.com' } };
  const vcall = async (route: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}) => {
    const res = await vaultRoutes[route][0]({ event, body: { service: 'admin', ...body }, params });
    return { status: res.statusCode as number, data: JSON.parse(res.body || 'null') };
  };
  const gcall = async (route: string, body: Record<string, unknown> = {}) => {
    const res = await geh[route][0]({ event, body: { service: 'admin', ...body }, params: {} });
    const tekst = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    return { status: (res.statusCode ?? res.status) as number, tekst, data: JSON.parse(tekst || 'null') };
  };
  const GEHEIM = `s3cret-${randomUUID()}`;
  try {
    const zonder = await vcall('POST /api/owner/api-platform/vault/save', { name: 'GEH_TOKEN', purpose: 'github', value: GEHEIM });
    check('opslaan zonder bevestiging → 403 STEP_UP_STRONG_REQUIRED, niets opgeslagen', zonder.status === 403 && zonder.data.error === 'STEP_UP_STRONG_REQUIRED' && (await db.list('owner_vault_v1', { filter: { ownerUserId: U }, limit: 5 })).items.length === 0);

    await googleStapOpVastleggen(U, [sessie.id], Date.now());
    const metGoogle = await vcall('POST /api/owner/api-platform/vault/save', { name: 'GEH_TOKEN', purpose: 'github', value: GEHEIM });
    check('Google-aanmelding alleen telt niet zodra een passkey bestaat', metGoogle.status === 403 && metGoogle.data.error === 'STEP_UP_STRONG_REQUIRED');

    await passkeyStapOpVastleggen(auth);
    const nieuw = await vcall('POST /api/owner/api-platform/vault/save', { name: 'GEH_TOKEN', purpose: 'github', value: GEHEIM, meta: { van: 'GitHub', geldigTot: '2099-01-01' } });
    const id = String(nieuw.data?.item?.id || '');
    check('met passkey: opgeslagen; antwoord bevat de waarde niet', nieuw.status === 200 && !!id && !JSON.stringify(nieuw.data).includes(GEHEIM));
    const tweede = await vcall('POST /api/owner/api-platform/vault/save', { name: 'GEH_TWEE', purpose: 'other', value: 'x-waarde' });
    check('één bevestiging = één actie: de tweede opslag vraagt opnieuw', tweede.status === 403 && tweede.data.error === 'STEP_UP_STRONG_REQUIRED');

    const tonenZonder = await vcall('POST /api/owner/api-platform/vault/:id/reveal', { confirm: 'REVEAL_SECRET' }, { id });
    check('tonen zonder nieuwe bevestiging → 403', tonenZonder.status === 403 && tonenZonder.data.error === 'STEP_UP_STRONG_REQUIRED' && !JSON.stringify(tonenZonder.data).includes(GEHEIM));
    await passkeyStapOpVastleggen(auth);
    const toon = await vcall('POST /api/owner/api-platform/vault/:id/reveal', { confirm: 'REVEAL_SECRET' }, { id });
    check('tonen met passkey: waarde terug, 30 s', toon.status === 200 && toon.data.revealedValue === GEHEIM && toon.data.ttlSeconds === 30);
    const nogEens = await vcall('POST /api/owner/api-platform/vault/:id/reveal', { confirm: 'REVEAL_SECRET' }, { id });
    check('tonen is eenmalig bevestigd: direct opnieuw → 403', nogEens.status === 403);

    const l = await gcall('POST /api/owner/geheimen/lijst');
    const vi = (l.data.items as Geheim[]).find((x) => x.naam === 'GEH_TOKEN');
    check('lijst: het geheim staat erin met groep/dienst GitHub, maar de waarde komt nergens in het antwoord voor', l.status === 200 && vi?.dienst === 'github' && vi.groep === 'cloud' && vi.bron === 'vault' && vi.gemaskeerd === MASKER && !l.tekst.includes(GEHEIM));
    check('lijst: env-namen alleen als naam (geen waarden); verwachte ontbrekende secrets zichtbaar', !l.tekst.includes(process.env.OWNER_VAULT_ENCRYPTION_KEY_V1!) && (l.data.items as Geheim[]).some((x) => x.bron === 'env' || x.bron === 'platform'));

    await passkeyStapOpVastleggen(auth);
    const del = await vcall('POST /api/owner/api-platform/vault/:id/delete', {}, { id });
    check('verwijderen met passkey', del.status === 200);

    const h = await gcall('POST /api/owner/geheimen/historie', { naam: 'GEH_TOKEN' });
    const hItems = h.data.items as Array<{ actie: string; methode: string; naam: string; resultaat: string; info: string }>;
    const echt = hItems.filter((x) => x.actie !== 'geweigerd');
    const acties = echt.map((x) => x.actie).sort().join();
    check('geschiedenis: aangemaakt, getoond, verwijderd — met methode «passkey» en zonder waarde', h.status === 200 && acties === 'aangemaakt,getoond,verwijderd' && echt.every((x) => x.methode === 'passkey') && !h.tekst.includes(GEHEIM));
    const geweigerd = hItems.filter((x) => x.actie === 'geweigerd');
    check('geschiedenis: elke geweigerde poging (opslaan, opslaan, tonen, tonen) staat erin met resultaat «denied» en de reden', geweigerd.length === 4 && geweigerd.every((x) => x.resultaat === 'denied' && x.info.includes('STEP_UP_STRONG_REQUIRED')) && geweigerd.some((x) => x.info.includes('reveal')) && geweigerd.some((x) => x.info.includes('save')));
    const alles = await geheimenGeschiedenis(U, {});
    check('geschiedenis: alleen geheim-acties (of «overig» uit de categorie geheimen van het beheerjournaal), nieuwste eerst', alles.items.every((x) => Object.values(AUDIT_ACTIES).includes(x.actie) || x.actie === 'overig') && alles.items[0].actie === 'verwijderd');
    // Audit 19.10.2026 (A12): zelfde bron als Beheer → «Журнал»: een token-actie (categorie geheimen, niet in AUDIT_ACTIES) staat er ook in, als «overig» met label.
    const { schrijfBeheerAudit: sba } = await import('../../backend/audit-gebeurtenis');
    await sba({ actor: { id: U }, doel: { soort: 'token', naam: 'proef-token' }, actie: 'owner.api.token.created', resultaat: 'success' });
    const metToken = await geheimenGeschiedenis(U, {});
    const tokenRij = metToken.items.find((x) => x.info.includes('owner.api.token.created'));
    check('A12: beheerjournaal-regel van vandaag (owner.api.token.created) staat in het contour-journaal als «overig» met label', !!tokenRij && tokenRij.actie === 'overig' && tokenRij.info.length > 'owner.api.token.created'.length && metToken.items[0].id === tokenRij.id, JSON.stringify(tokenRij));
    check('A12: limiet is die van het beheerjournaal (max. 200)', (await geheimenGeschiedenis(U, { limiet: 999 })).items.length <= 200);
    check('overzicht openen komt in het logboek, maar hoogstens één keer per 10 minuten', alles.items.filter((x) => x.actie === 'bekeken').length === 1 && (await overzichtGeopend(U)) === false);
    check('lijst na verwijderen: weg', !(await geheimenLijst(U)).items.some((x) => x.naam === 'GEH_TOKEN'));

    auth.user = { ...user, role: 'member' };
    const nietEigenaar = await gcall('POST /api/owner/geheimen/lijst');
    check('geen eigenaar → 403', nietEigenaar.status === 403);
    const naDenial = await geheimenGeschiedenis(U, {});
    check('geen eigenaar: de poging staat in het logboek (secret.toegang.geweigerd)', naDenial.items.some((x) => x.actie === 'geweigerd' && x.naam === 'overzicht' && x.resultaat === 'denied'));
    auth.user = user;
    auth.service = 'hub';
    check('andere dienst dan admin → 403', (await gcall('POST /api/owner/geheimen/lijst')).status === 403);
    auth.service = 'admin';
    await stapOpVerbruiken(auth);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 700));
  } finally {
    const rows = await db.list<Record<string, unknown>>('owner_vault_v1', { filter: { ownerUserId: U }, limit: 100 }).catch(() => ({ items: [] as Array<{ id: string }> }));
    if (rows.items.length) await db.delete('owner_vault_v1', rows.items.map((r: any) => r.id)).catch(() => undefined);
    await closePool();
  }
  return einde();
}
