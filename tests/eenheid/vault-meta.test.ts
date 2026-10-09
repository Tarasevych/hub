// Kluis: metadata per sleutel (termijn, van wie, verantwoordelijke) en meldingen «скоро закінчиться» / «строк вийшов» —
// zonder dat de waarde ooit ontsleuteld of gewijzigd wordt voor metadata, en zonder dat een melding terugkomt.
import { randomUUID } from 'node:crypto';
import { createApiPlatformVaultRoutes, vaultTermijnMeldingen } from '../../backend/api-platform-vault';
import { dagenTekst, normaliseerVaultMeta, staatTekst, vandaag, vaultStaat, leegMeta } from '../../shared/vault-meta';
import { db } from '../../server/platform';
import { closePool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('vault-meta');

  // ------------------------------------------------------------------ zuiver
  const nu = Date.UTC(2026, 9, 9, 10, 0); // 9 okt 2026, 12:00 Brussel
  const m = (geldigTot: string, geldigVan = '') => ({ ...leegMeta(), geldigVan, geldigTot });
  check('vandaag in de tijdzone van de eigenaar (23:30 UTC = volgende dag in Brussel)', vandaag(Date.UTC(2026, 9, 9, 23, 30)) === '2026-10-10' && vandaag(nu) === '2026-10-09');
  check('staat: zonder einde / actief / bijna (≤ 14 d) / laatste dag / verlopen / nog niet',
    vaultStaat(m(''), nu).staat === 'zonder-termijn' && vaultStaat(m('2027-01-01'), nu).staat === 'actief' && vaultStaat(m('2026-10-20'), nu).staat === 'bijna'
    && vaultStaat(m('2026-10-09'), nu).dagenOver === 0 && vaultStaat(m('2026-10-08'), nu).staat === 'verlopen' && vaultStaat(m('', '2026-11-01'), nu).staat === 'nog-niet');
  check('tekst: «Скоро закінчиться: залишилось 3 дні», «Сьогодні останній день», «Строк вийшов … (1 день тому)»',
    staatTekst(m('2026-10-12'), 'uk', nu) === 'Скоро закінчиться: залишилось 3 дні' && staatTekst(m('2026-10-09'), 'uk', nu) === 'Сьогодні останній день' && /Строк вийшов 2026-10-08 \(1 день тому\)/.test(staatTekst(m('2026-10-08'), 'uk', nu)));
  check('meervoud: 1 день, 2 дні, 5 днів, 11 днів, 21 день, 22 дні', [1, 2, 5, 11, 21, 22].map((n) => dagenTekst(n, 'uk')).join(',') === '1 день,2 дні,5 днів,11 днів,21 день,22 дні');
  const fout = (x: unknown) => { const r = normaliseerVaultMeta(x); return 'fout' in r ? r.fout : ''; };
  check('normaliseren: ongeldige datum, einde vóór begin, onbekende soort → fout; stuurtekens weg, lengte begrensd',
    fout({ geldigTot: '2026-02-30' }) === 'OWNER_VAULT_META_DATE_INVALID' && fout({ geldigVan: '2026-10-10', geldigTot: '2026-10-01' }) === 'OWNER_VAULT_META_RANGE_INVALID'
    && fout({ soort: 'robot' }) === 'OWNER_VAULT_META_KIND_INVALID' && (normaliseerVaultMeta({ van: 'Claude\u0000  Code', notitie: 'x'.repeat(500) }) as any).meta.van === 'Claude Code'
    && (normaliseerVaultMeta({ notitie: 'x'.repeat(500) }) as any).meta.notitie.length === 240);
  const basis = { ...leegMeta(), van: 'Home Assistant', geldigTot: '2027-01-01' };
  const deel = normaliseerVaultMeta({ verantwoordelijke: 'Pavlo' }, basis) as any;
  check('bijwerken: wat niet meegestuurd wordt, blijft', deel.meta.van === 'Home Assistant' && deel.meta.geldigTot === '2027-01-01' && deel.meta.verantwoordelijke === 'Pavlo');

  // ------------------------------------------------------------------ routes (echte database, echte versleuteling)
  if (!process.env.OWNER_VAULT_ENCRYPTION_KEY_V1 || (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL)) { console.log('OVERGESLAGEN routes: geen database of kluissleutel'); return einde(); }
  const U = `vault-${randomUUID()}`;
  const user = { id: U, email: `${U}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] };
  const audit: Array<{ action: string; details?: Record<string, unknown> }> = [];
  const routes = createApiPlatformVaultRoutes({
    requireSession: async () => ({ user, service: 'api' }) as any,
    respond: (data: unknown, status = 200) => ({ statusCode: status, body: JSON.stringify(data) }),
    fail: (message: string, status = 400) => ({ statusCode: status, body: JSON.stringify({ error: message }) }),
    audit: async (_u: string, action: string, _r: string, details?: Record<string, unknown>) => { audit.push({ action, details }); },
    body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}),
  }) as Record<string, any[]>;
  const call = async (route: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}) => {
    const res = await routes[route][0]({ event: { headers: { host: 'api.tarasevych.com' } }, body, params });
    return { status: res.statusCode as number, data: JSON.parse(res.body || 'null') };
  };
  const ruw = async (id: string) => (await db.get<Record<string, any>>('owner_vault_v1', [id]))[0]!;
  try {
    const vandaagDag = vandaag();
    const plusDagen = (n: number) => new Date(Date.parse(`${vandaagDag}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const nieuw = await call('POST /api/owner/api-platform/vault/save', { name: 'HA_TOKEN', purpose: 'home-assistant', value: 'geheim-1', meta: { soort: 'service', van: 'Home Assistant', verantwoordelijke: 'Pavlo', geldigTot: plusDagen(60) } });
    const id = String(nieuw.data?.item?.id || '');
    check('toevoegen met metadata: soort/van/verantwoordelijke, begin = vandaag, staat actief; geen waarde in het antwoord',
      nieuw.status === 200 && nieuw.data.item.meta.van === 'Home Assistant' && nieuw.data.item.meta.geldigVan === vandaagDag && nieuw.data.item.staat === 'actief' && !JSON.stringify(nieuw.data).includes('geheim-1'), JSON.stringify(nieuw.data).slice(0, 300));
    const voor = await ruw(id);
    const metaAlleen = await call('POST /api/owner/api-platform/vault/:id/meta', { meta: { geldigTot: plusDagen(3), notitie: 'scope: lezen' } }, { id });
    const na = await ruw(id);
    check('«Деталі»: alleen metadata gewijzigd — versleutelde waarde, iv en tag identiek; staat «bijna»',
      metaAlleen.status === 200 && metaAlleen.data.item.staat === 'bijna' && metaAlleen.data.item.meta.van === 'Home Assistant' && na.ciphertext === voor.ciphertext && na.iv === voor.iv && na.authTag === voor.authTag);
    check('audit: welke velden, nooit de waarde', audit.some((a) => a.action === 'owner.api.vault.meta' && Array.isArray(a.details?.velden) && (a.details!.velden as string[]).includes('geldigTot') && !JSON.stringify(a.details).includes('geheim')));
    const slecht = await call('POST /api/owner/api-platform/vault/:id/meta', { meta: { geldigVan: plusDagen(10), geldigTot: plusDagen(1) } }, { id });
    check('einde vóór begin → 400, niets gewijzigd', slecht.status === 400 && slecht.data.error === 'OWNER_VAULT_META_RANGE_INVALID' && (await ruw(id)).meta.geldigTot === plusDagen(3));

    // meldingen
    const meldingen: Array<{ kind: string; title: string; message: string; link: string }> = [];
    const meld = async (kind: string, title: string, message: string, link: string) => { meldingen.push({ kind, title, message, link }); };
    const t0 = Date.now();
    await vaultTermijnMeldingen(user, meld, t0);
    await vaultTermijnMeldingen(user, meld, t0 + 11 * 60_000);
    check('melding «скоро закінчиться» één keer (ook na een nieuwe controle), met wie en link naar de kluis',
      meldingen.length === 1 && meldingen[0].kind === 'vault_key_expiring' && /HA_TOKEN/.test(meldingen[0].title) && /Home Assistant/.test(meldingen[0].message) && /Pavlo/.test(meldingen[0].message) && meldingen[0].link === 'https://api.tarasevych.com/vault', JSON.stringify(meldingen));
    await call('POST /api/owner/api-platform/vault/:id/meta', { meta: { geldigVan: plusDagen(-30), geldigTot: plusDagen(-1) } }, { id });
    await vaultTermijnMeldingen(user, meld, t0 + 22 * 60_000);
    check('verlopen = nieuwe staat → één nieuwe melding «строк вийшов»', meldingen.length === 2 && meldingen[1].kind === 'vault_key_expired' && /вийшов/.test(meldingen[1].title));
    const vervangen = await call('POST /api/owner/api-platform/vault/save', { id, name: 'HA_TOKEN', purpose: 'home-assistant', value: 'geheim-2' });
    const naRotatie = await ruw(id);
    check('nieuwe waarde (rotatie): metadata blijft, doel blijft, meldingen gewist, rotatedAt gezet',
      vervangen.status === 200 && naRotatie.meta.van === 'Home Assistant' && naRotatie.purpose === 'home-assistant' && Object.keys(naRotatie.gemeld || {}).length === 0 && naRotatie.rotatedAt >= t0 && naRotatie.ciphertext !== na.ciphertext);
    const oud = await db.add('owner_vault_v1', [{ ...voor, keyName: 'OUD_ZONDER_META', meta: undefined, gemeld: undefined }]);
    const lijst = await call('POST /api/owner/api-platform/vault');
    const oudItem = lijst.data.items.find((x: any) => x.name === 'OUD_ZONDER_META');
    check('oude sleutel zonder metadata: leeg + «zonder termijn», geen fout', !!oud[0] && oudItem?.staat === 'zonder-termijn' && oudItem.meta.geldigTot === '');
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 600));
  } finally {
    const rows = await db.list<Record<string, unknown>>('owner_vault_v1', { filter: { ownerUserId: U }, limit: 100 }).catch(() => ({ items: [] as Array<{ id: string }> }));
    if (rows.items.length) await db.delete('owner_vault_v1', rows.items.map((r: any) => r.id)).catch(() => undefined);
    await closePool();
  }
  return einde();
}
