// «Секрети й ключі» (admin.* /contour): één overzicht van ALLE geheimen en sleutels van de site, zonder ooit een waarde te lekken.
//
// Wat hier staat (alleen namen en metadata):
//   - de eigen versleutelde kluis (owner_vault_v1): tonen / vervangen / verwijderen via de bestaande kluisroutes, die nu een
//     passkey, TOTP of herstelcode vragen en die bevestiging na ÉÉN actie verbruiken (backend/api-platform-kluis.ts);
//   - de Google-contour en de platformgeheimen (env op de server): alleen status. Die waarden leest de site bewust nooit
//     terug naar een browser (CONTOUR_REVEAL_DISABLED); ze beheert de root-beheerder in /etc/mijn-ruimte/geheimen.env;
//   - andere omgevingsvariabelen die op een geheim lijken (alleen de NAAM), API-tokens en AI-koppelingen (alleen metadata).
// Geschiedenis: komt uit het hash-geketende auditlogboek (backend/index.ts ownerAudit → app.audit); er is geen tweede opslag.
import { error, isOwnerEmail, json } from '../server/platform';
import type { AuditRij } from '../server/platform/audit';
import { journaalZoeken } from './beheer-journaal';
import { actieLabel } from '../shared/beheer-journaal';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { SECRET_ALLOW_LIST } from '../server/platform/geheimen';
import { googleContourKeyCards } from './google-contour';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { apiPlatformVaultItems, vaultEncryptionReady } from './api-platform-kluis';
import { apiPlatformTokensForOwner } from './api-platform-tokens';
import { listGrants } from './mcp-connector-opslag';
import { listAgents } from './connectors-opslag';
import { metaUitRecord, vaultStaat } from '../shared/kluis-meta';
import { AUDIT_ACTIES, DOEL_INFO, MASKER, afleiden, isVaultDoel, lijktOpGeheim, type Geheim, type GeheimActie, type GeheimGebeurtenis, type GeheimStaat } from '../shared/geheimen';

/** Geheimen die de site verwacht maar die ontbreken kunnen: dan tonen we «Відсутній» met uitleg. */
const VERWACHT_ENV = ['AUDIT_IP_PEPPER', 'DATABASE_URL_APP', 'DATABASE_URL_SYSTEM', 'RECOVERY_CODE_PEPPER', 'TOTP_ENCRYPTION_KEY_V1'] as const;
const DAG = 86_400_000;
const BIJNA_MS = 14 * DAG;
const VOOR_SERVER: readonly [string, string] = ['Керується на сервері (/etc/mijn-ruimte/geheimen.env). Сайт свідомо не віддає це значення в браузер.', 'Beheerd op de server (/etc/mijn-ruimte/geheimen.env). De site geeft deze waarde bewust nooit aan een browser.'];
const VOOR_TOKEN: readonly [string, string] = ['Токен показується лише один раз при створенні; відкликати можна на сторінці API.', 'Een token wordt maar één keer getoond bij het aanmaken; intrekken kan op de API-pagina.'];
const VOOR_AI: readonly [string, string] = ['Токен підключення ШІ. Відкликати можна в «Доступ ШІ» / «Агенти».', 'Token van een AI-koppeling. Intrekken kan bij «AI-toegang» / «Agenten».'];

const tijdStaat = (verlooptOp: number | undefined, ingetrokken: boolean, nu: number): GeheimStaat => {
  if (ingetrokken) return 'ingetrokken';
  if (verlooptOp && verlooptOp <= nu) return 'verlopen';
  if (verlooptOp && verlooptOp - nu <= BIJNA_MS) return 'bijna';
  return 'ingesteld';
};
const ms = (d: unknown) => { const t = d instanceof Date ? d.getTime() : Date.parse(String(d ?? '')); return Number.isFinite(t) ? t : undefined; };

/** Alle geheimen van deze eigenaar als metadata. Nooit een waarde (ook geen lengte of laatste tekens van echte geheimen). */
export async function geheimenLijst(userId: string, nu = Date.now()): Promise<{ items: Geheim[]; vaultKlaar: boolean }> {
  const items: Geheim[] = [];
  const bekend = new Set<string>();
  const voeg = (g: Geheim) => { if (!bekend.has(g.id)) { bekend.add(g.id); items.push(g); } };

  let vaultKlaar = true;
  try { vaultKlaar = await vaultEncryptionReady(); } catch { vaultKlaar = false; }
  try {
    for (const v of await apiPlatformVaultItems(userId)) {
      const meta = metaUitRecord(v.meta);
      const st = vaultStaat(meta, nu);
      const doel = isVaultDoel(v.purpose) ? v.purpose : 'other';
      const info = DOEL_INFO[doel];
      const staat: GeheimStaat = st.staat === 'verlopen' ? 'verlopen' : st.staat === 'bijna' ? 'bijna' : st.staat === 'nog-niet' ? 'nog-niet' : 'ingesteld';
      voeg({ id: `vault:${v.id}`, naam: v.keyName, bron: 'vault', groep: info.groep, dienst: info.dienst, staat, gemaskeerd: MASKER, kanTonen: vaultKlaar, kanWijzigen: vaultKlaar, kanVerwijderen: true,
        doel, aangemaaktOp: v.createdAt, bijgewerktOp: v.rotatedAt || v.updatedAt, meta, vaultStaat: st.staat,
        verlooptOp: meta.geldigTot ? Date.parse(`${meta.geldigTot}T23:59:59Z`) : undefined });
    }
  } catch (e) { console.error('[geheimen] kluis:', (e as Error).message); }

  try {
    const platformNamen = new Set<string>(SECRET_ALLOW_LIST);
    for (const k of await googleContourKeyCards()) {
      const afl = afleiden(k.name);
      const isGoogle = k.group === 'google';
      const publiek = k.id === 'google-redirect';
      voeg({ id: `${isGoogle ? 'google' : 'platform'}:${k.name}`, naam: k.name, bron: isGoogle ? 'google' : 'platform', groep: isGoogle ? 'google' : afl.groep, dienst: isGoogle ? 'google' : afl.dienst,
        staat: k.configured ? 'ingesteld' : 'ontbreekt', gemaskeerd: k.configured ? (publiek ? k.masked : MASKER) : '', kanTonen: false, kanWijzigen: false, kanVerwijderen: false,
        beheerdIn: VOOR_SERVER, notitie: [k.noteUk, k.noteNl] });
      platformNamen.add(k.name);
    }
    // Overige variabelen die op een geheim lijken: alleen de naam, en alleen of ze gezet zijn.
    const env = process.env;
    for (const naam of Object.keys(env).sort()) {
      if (platformNamen.has(naam) || !lijktOpGeheim(naam) || /^MIJNRUIMTE_TEST_/i.test(naam)) continue;
      const a = afleiden(naam);
      const gezet = String(env[naam] ?? '').trim() !== '';
      voeg({ id: `env:${naam}`, naam, bron: 'env', groep: a.groep, dienst: a.dienst, staat: gezet ? 'ingesteld' : 'ontbreekt', gemaskeerd: gezet ? MASKER : '', kanTonen: false, kanWijzigen: false, kanVerwijderen: false, beheerdIn: VOOR_SERVER });
    }
    for (const naam of VERWACHT_ENV) {
      if (bekend.has(`env:${naam}`)) continue;
      const a = afleiden(naam);
      voeg({ id: `env:${naam}`, naam, bron: 'env', groep: a.groep, dienst: a.dienst, staat: 'ontbreekt', gemaskeerd: '', kanTonen: false, kanWijzigen: false, kanVerwijderen: false, beheerdIn: VOOR_SERVER,
        notitie: ['Очікуваний секрет сервера: не заданий.', 'Verwacht servergeheim: niet ingesteld.'] });
    }
  } catch (e) { console.error('[geheimen] platform:', (e as Error).message); }

  try {
    for (const t of await apiPlatformTokensForOwner(userId)) {
      const verlooptOp = Number(t.expiresAt) || undefined;
      voeg({ id: `token:${t.id}`, naam: String(t.label || `tsv_${t.prefix}`), bron: 'token', groep: 'ai', dienst: 'api', staat: tijdStaat(verlooptOp, !!t.revokedAt, nu), gemaskeerd: `tsv_${t.prefix}_…`,
        kanTonen: false, kanWijzigen: false, kanVerwijderen: false, beheerdIn: VOOR_TOKEN, aangemaaktOp: t.createdAt, bijgewerktOp: t.createdAt, verlooptOp, laatstGebruikt: t.lastUsedAt || undefined });
    }
  } catch (e) { console.error('[geheimen] tokens:', (e as Error).message); }

  try {
    for (const g of await listGrants(userId)) {
      const verlooptOp = ms(g.refresh_expires_at);
      voeg({ id: `ai:${g.id}`, naam: `${g.client_name || 'AI'}${g.agent ? ` · ${g.agent}` : ''}${g.ruimte === 'technisch' ? ' · tech' : ''}`, bron: 'token', groep: 'ai', dienst: g.agent === 'claude' ? 'anthropic' : 'mcp',
        staat: tijdStaat(verlooptOp, !!g.revoked_at, nu), gemaskeerd: MASKER, kanTonen: false, kanWijzigen: false, kanVerwijderen: false, beheerdIn: VOOR_AI,
        aangemaaktOp: ms(g.created_at), bijgewerktOp: ms(g.created_at), verlooptOp, laatstGebruikt: ms(g.last_used_at) });
    }
  } catch (e) { console.error('[geheimen] ai-koppelingen:', (e as Error).message); }

  try {
    for (const a of await listAgents(userId)) {
      const verlooptOp = ms(a.token_expires_at);
      voeg({ id: `agent:${a.id}`, naam: `${a.name}${a.ruimte === 'technisch' ? ' · tech' : ''}`, bron: 'token', groep: 'ai', dienst: 'mcp', staat: tijdStaat(verlooptOp, !!a.revoked_at, nu), gemaskeerd: MASKER,
        kanTonen: false, kanWijzigen: false, kanVerwijderen: false, beheerdIn: VOOR_AI, aangemaaktOp: ms(a.created_at), bijgewerktOp: ms(a.created_at), verlooptOp, laatstGebruikt: ms(a.last_seen_at) });
    }
  } catch (e) { console.error('[geheimen] apparaten:', (e as Error).message); }

  return { items, vaultKlaar };
}

// ------------------------------------------------------------------------------------------------ geschiedenis
const veiligTekst = (v: unknown, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const fotoVeilig = (v: unknown) => { const s = String(v ?? ''); return /^https:\/\/[^\s"'<>]{1,400}$/.test(s) ? s : ''; };

/** Auditregel → gebeurtenis. Neemt alleen veilige velden over (nooit een waarde). */
export function alsGebeurtenis(r: Pick<AuditRij, 'id' | 'action' | 'result' | 'details' | 'createdAt' | 'actorId' | 'device'>, wie: GeheimGebeurtenis['wie']): GeheimGebeurtenis | null {
  // Audit 19.10.2026 (A12): dezelfde bron als het beheerjournaal (categorie «geheimen»); een actie zonder eigen pictogram wordt «overig»
  // met het label van het beheerjournaal, zodat het contour-journaal niets mist wat het beheerjournaal wél toont.
  const actie: GeheimActie = AUDIT_ACTIES[r.action] ?? 'overig';
  const d = (r.details || {}) as Record<string, unknown>;
  const doelNaam = d.doel && typeof d.doel === 'object' ? (d.doel as Record<string, unknown>).naam : '';
  const naam = veiligTekst(d.keyName ?? d.to ?? d.name ?? doelNaam ?? '', 80);
  const delen: string[] = [];
  if (actie === 'termijn' && Array.isArray(d.velden)) delen.push(`${(d.velden as unknown[]).map((x) => veiligTekst(x, 24)).join(', ')}`);
  if (actie === 'hernoemd' && d.from) delen.push(`${veiligTekst(d.from, 80)} → ${veiligTekst(d.to, 80)}`);
  if (actie === 'vervangen' && d.oudeNaam) delen.push(`${veiligTekst(d.oudeNaam, 80)} → ${naam}`);
  if (actie === 'aangemaakt' && d.purpose) delen.push(veiligTekst(d.purpose, 40));
  if (actie === 'geweigerd') { if (d.poging) delen.push(veiligTekst(d.poging, 16)); if (d.reden) delen.push(veiligTekst(d.reden, 60)); }
  if (d.reason) delen.push(veiligTekst(d.reason, 60));
  if (actie === 'overig') delen.unshift(`${actieLabel(r.action, 'uk')} (${veiligTekst(r.action, 60)})`);
  return { id: r.id, at: r.createdAt, actie, resultaat: veiligTekst(r.result, 20), naam, wie, methode: veiligTekst(d.methode ?? '', 20), apparaat: veiligTekst(r.device ?? '', 40), info: delen.join(' · ') };
}

/** Audit 19.10.2026 (A12): zelfde bron en limiet als Beheer → «Журнал» (journaalZoeken, categorie «geheimen», max. 200, ruis inbegrepen) —
 *  niet langer een eigen lijstje exacte actiecodes met eigenaar-filter, waardoor regels van vandaag (bv. token- of app-geheim-acties) ontbraken. */
export async function geheimenGeschiedenis(userId: string, filter: { naam?: string; vaultId?: string; limiet?: number; voor?: string } = {}) {
  const limiet = Math.max(10, Math.min(200, Math.floor(Number(filter.limiet) || 200)));
  const uit = await journaalZoeken({ categorieen: ['geheimen'], limiet, verbergRuis: false, volgorde: 'nieuw', ...(filter.voor ? { cursor: filter.voor } : {}) }, { eigenaarId: userId });
  const rijen = uit.items.filter((r) => {
    if (!filter.naam && !filter.vaultId) return true;
    const d = (r.details || {}) as Record<string, unknown>;
    return (!!filter.vaultId && d.vaultId === filter.vaultId) || (!!filter.naam && [d.keyName, d.name, d.to, d.from, d.oudeNaam, d.doel && typeof d.doel === 'object' ? (d.doel as Record<string, unknown>).naam : undefined].includes(filter.naam));
  });
  const ids = [...new Set(rijen.map((r) => r.actorId).filter((x): x is string => !!x))];
  const kaart = new Map<string, GeheimGebeurtenis['wie']>();
  if (ids.length) {
    const { rows } = await getPool('systeem').query(`SELECT id, data->>'name' AS name, data->>'email' AS email, data->>'picture' AS picture FROM app.records WHERE tbl = 'users' AND id::text = ANY($1::text[])`, [ids]);
    for (const u of rows) kaart.set(String(u.id), { id: String(u.id), naam: veiligTekst(u.name, 120), email: veiligTekst(u.email, 120), foto: fotoVeilig(u.picture) });
  }
  const items = rijen.map((r) => alsGebeurtenis(r, kaart.get(r.actorId || '') || { id: r.actorId || '', naam: '', email: '', foto: '' })).filter((x): x is GeheimGebeurtenis => !!x);
  return { items, nextCursor: uit.nextCursor };
}

// ------------------------------------------------------------------------------------------------ routes
/** «Wie keek wanneer»: het openen van het overzicht (alleen namen) komt hoogstens één keer per 10 minuten per eigenaar in het logboek. */
const LAATSTE_KEER = new Map<string, number>();
export const OVERZICHT_LOG_MS = 10 * 60_000;
export async function overzichtGeopend(userId: string, email?: string, nu = Date.now()): Promise<boolean> {
  if (nu - (LAATSTE_KEER.get(userId) || 0) < OVERZICHT_LOG_MS) return false;
  LAATSTE_KEER.set(userId, nu);
  await schrijfBeheerAudit({ actor: { id: userId, email }, doel: { soort: 'geheim', naam: 'overzicht' }, actie: 'secret.overzicht.bekeken', resultaat: 'success' });
  return true;
}

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const body = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function geheimenRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const eigenaar = (run: (ctx: Ctx, auth: SessionOk) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (auth.user.role !== 'owner' || !isOwnerEmail(auth.user.email)) {
      // Een ingelogd, niet-eigenaar account dat de geheimen probeert te openen: altijd in het logboek.
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'geheim', naam: 'overzicht' }, actie: 'secret.toegang.geweigerd', resultaat: 'denied', reden: 'OWNER_REQUIRED' });
      return error('OWNER_REQUIRED', 403);
    }
    try { return json(await run(ctx, auth)); }
    catch (e) { console.error('[geheimen]', (e as Error).message); return error('GEHEIMEN_FOUT', 500); }
  }) as RouterMiddleware;
  return {
    'POST /api/owner/geheimen/lijst': [eigenaar(async (_c, auth) => {
      await overzichtGeopend(auth.user.id, auth.user.email);
      return { ok: true, ...(await geheimenLijst(auth.user.id)), plaintextReturned: false };
    })],
    'POST /api/owner/geheimen/historie': [eigenaar(async (ctx, auth) => {
      const b = body(ctx.body);
      return { ok: true, ...(await geheimenGeschiedenis(auth.user.id, { naam: veiligTekst(b.naam, 80) || undefined, vaultId: veiligTekst(b.vaultId, 80) || undefined, limiet: Number(b.limiet) || undefined, voor: typeof b.voor === 'string' ? b.voor : undefined })), plaintextReturned: false };
    })],
  };
}
