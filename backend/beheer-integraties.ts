// Admin → /mappen «Інтеграції»: levende toestand, beschikbaarheid voor gebruikers, statuscontrole en loskoppelen.
//
// Eerlijkheid en veiligheid:
//  - de browser stuurt alleen een catalogus-id; alles wat bestaat staat in shared/integraties-catalogus.ts. Een onbekend id → 404;
//  - «beschikbaar voor gebruikers» kan alleen aan voor koppelingen met status «klaar» (die werkelijk bestaan); «binnenkort» wordt geweigerd;
//  - de statuscontrole is een CONFIGURATIECONTROLE (bestaat er een sleutel/koppeling, is hij ingetrokken, is hij verlopen). Er gaat geen
//    verzoek naar de externe dienst en er wordt nooit een geheim gelezen; wat de site niet kan weten blijft «onbekend»;
//  - elke wijziging en elke controle komt in het hash-geketende beheerlogboek (integration.*, via schrijfBeheerAudit);
//  - loskoppelen: sleutel-koppelingen worden «ingetrokken» (de waarde blijft in de kluis tot u haar daar verwijdert, met passkey);
//    AI-agenten: de eigen koppelingen van de aanroeper worden ingetrokken.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { INTEGRATIES, integratie, type Integratie } from '../shared/integraties-catalogus';
import { detailVan } from '../shared/integraties-detail';
import { isAgentSlug } from '../shared/connector-v2/agenten';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { actieveKoppelingen, trekIn } from './connector-v2-opslag';
import { apiPlatformConnectionCards, zetVerbindingStatus, type ConnectionId } from './api-platform-verbindingen';
import { integratiesWizardRoutes } from './integraties-wizard';
import { googleSuiteOnboardingSnapshot } from './google-suite-inrichting';
import { mailImapLijst } from './mail-imap';
import { pinnedFetch, privateAddress } from './veilige-fetch';
import { lookup } from 'node:dns/promises';
import { webdavLijst } from './verbinding-adapters/webdav';
import { s3Lijst } from './verbinding-adapters/s3';
import { mqttControle } from './verbinding-adapters/mqtt';
import { REGISTER } from '../shared/integraties-register';
import type { MailImapKoppelingPubliek } from '../shared/mail-aanbieders';

type AdminAuth = { user: { id: string; email?: string; name?: string }; capabilities?: string[] };
export type AdminGate = (ctx: { event: Record<string, unknown>; body: unknown }, capability: string) => Promise<AdminAuth | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Sess = { user: { id: string; email?: string; status?: string; role?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<Sess | { errorCode: string }>;

export type Toestand = 'verbonden' | 'ingesteld' | 'niet' | 'fout' | 'onbekend';
export type Levend = { toestand: Toestand; code: string; detail: string; n?: number; tot?: number; laatstGebruikt?: number | null; gecontroleerdOp?: number };

/** UI-013: IMAP-aanbieder (shared/mail-aanbieders.ts) → catalogus-id. Onbekende/overige aanbieders tellen als «IMAP / SMTP». */
const IMAP_NAAR_CATALOGUS: Record<string, string> = { icloud: 'icloud-mail', yahoo: 'yahoo-mail', proton: 'proton-mail', outlook: 'outlook-mail' };
/** UI-013: levende stand van de IMAP-koppelingen van één account, uit de echte controle bij het koppelen/controleren (laatst_goed_op, fout). */
export function imapLevend(lijst: readonly MailImapKoppelingPubliek[]): Record<string, Levend> {
  const per = new Map<string, MailImapKoppelingPubliek[]>();
  for (const k of lijst) { const id = IMAP_NAAR_CATALOGUS[k.aanbieder] || 'imap'; per.set(id, [...(per.get(id) || []), k]); }
  const uit: Record<string, Levend> = {};
  for (const [id, ks] of per) {
    const fout = ks.find((k) => k.fout || !k.actief);
    const op = ks.reduce((m, k) => Math.max(m, k.laatstGoedOp || 0), 0);
    uit[id] = fout
      ? { toestand: 'fout', code: 'IMAP_FOUT', n: ks.length, detail: `${fout.adres}: ${fout.fout || 'inactief'}`.slice(0, 180), ...(op ? { gecontroleerdOp: op } : {}) }
      : { toestand: 'verbonden', code: 'IMAP_ACTIEF', n: ks.length, detail: ks.map((k) => k.adres).join(', ').slice(0, 180), ...(op ? { gecontroleerdOp: op } : {}) };
  }
  return uit;
}
export type Stand = 'ok' | 'let-op' | 'fout' | 'onbekend';

const sys = () => getPool('systeem');
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VAULT_ID: Record<string, ConnectionId> = { github: 'github', telegram: 'telegram', anthropic: 'anthropic', 'home-assistant': 'home-assistant' };
const fout = (code: string) => Object.assign(new Error(code), { code });
export const PERIODIEK_MIN_MS = 30 * 60 * 1000;
const adapterTijden = new Map<string, number[]>();
/** Hoogstens 10 adaptercontroles per minuut per account (geen brute-force van wachtwoorden via deze route). */
export function adapterTempo(userId: string, nu = Date.now()): boolean {
  const lijst = (adapterTijden.get(userId) || []).filter((x) => nu - x < 60_000);
  if (lijst.length >= 10) { adapterTijden.set(userId, lijst); return false; }
  lijst.push(nu); adapterTijden.set(userId, lijst); return true;
}

/** Levende toestand van één integratie voor één account. Alleen wat de site werkelijk kan lezen; de rest geeft `null` (de kaart toont dan niets). */
export async function levendVoor(i: Integratie, userId: string, email: string, cache: { kaarten?: Awaited<ReturnType<typeof apiPlatformConnectionCards>> } = {}): Promise<Levend | null> {
  const k = i.levend || '';
  if (k.startsWith('agent:')) {
    const slug = k.slice(6);
    if (!isAgentSlug(slug)) return null;
    const lijst = await actieveKoppelingen(userId, slug);
    if (!lijst.length) return { toestand: 'niet', code: 'AGENT_GEEN', detail: 'Geen actieve koppeling van dit account.' };
    const laatste = lijst.reduce((m, x) => Math.max(m, x.lastUsedAt ?? 0), 0);
    const tot = lijst.reduce((m, x) => Math.max(m, x.expiresAt), 0);
    return { toestand: 'verbonden', code: 'AGENT_ACTIEF', n: lijst.length, detail: `${lijst.length} actieve koppeling(en).`, tot, laatstGebruikt: laatste || null };
  }
  const vaultId = VAULT_ID[k];
  if (vaultId) {
    cache.kaarten ??= await apiPlatformConnectionCards(userId, email);
    const kaart = cache.kaarten.find((c) => c.id === vaultId);
    if (!kaart) return null;
    if (kaart.status === 'error') return { toestand: 'fout', code: 'VAULT_FOUT', detail: String(kaart.lastError || 'Fout gemeld bij de laatste controle.').slice(0, 180) };
    if (kaart.status === 'revoked') return { toestand: 'niet', code: 'VAULT_INGETROKKEN', detail: 'Ingetrokken; de waarde kan nog in de kluis staan.' };
    if (kaart.hasVaultSecret) return { toestand: 'ingesteld', code: 'VAULT_SLEUTEL', detail: 'Sleutel staat in de kluis. De site controleert niet bij de externe dienst.' };
    return { toestand: 'niet', code: 'VAULT_GEEN', detail: 'Nog geen sleutel in de kluis.' };
  }
  return null;
}

async function beleidMap(): Promise<Record<string, { voorGebruikers: boolean; door: string; op: number }>> {
  const { rows } = await sys().query('SELECT integratie, voor_gebruikers, bijgewerkt_door, bijgewerkt_op FROM app.integratie_beleid');
  return Object.fromEntries(rows.map((r) => [String(r.integratie), { voorGebruikers: !!r.voor_gebruikers, door: String(r.bijgewerkt_door || ''), op: new Date(r.bijgewerkt_op).getTime() }]));
}
async function laatsteControles(): Promise<Record<string, { stand: Stand; code: string; detail: string; op: number; door: string }>> {
  const { rows } = await sys().query(`SELECT DISTINCT ON (integratie) integratie, stand, code, detail, door, op FROM app.integratie_controles ORDER BY integratie, op DESC`);
  return Object.fromEntries(rows.map((r) => [String(r.integratie), { stand: r.stand as Stand, code: String(r.code), detail: String(r.detail), door: String(r.door), op: new Date(r.op).getTime() }]));
}

/** Zet het beleid voor één integratie. Gooit INTEGRATIE_ONBEKEND / NIET_BESCHIKBAAR. Geeft `{ voor, na }` voor het logboek. */
export async function zetBeleid(id: string, voorGebruikers: boolean, door: string): Promise<{ voor: boolean; na: boolean }> {
  const i = integratie(id);
  if (!i) throw fout('INTEGRATIE_ONBEKEND');
  if (voorGebruikers && i.status === 'binnenkort') throw fout('NIET_BESCHIKBAAR');
  const oud = (await sys().query('SELECT voor_gebruikers FROM app.integratie_beleid WHERE integratie = $1', [id])).rows[0];
  await sys().query(
    `INSERT INTO app.integratie_beleid (integratie, voor_gebruikers, bijgewerkt_door, bijgewerkt_op) VALUES ($1, $2, $3, now())
     ON CONFLICT (integratie) DO UPDATE SET voor_gebruikers = EXCLUDED.voor_gebruikers, bijgewerkt_door = EXCLUDED.bijgewerkt_door, bijgewerkt_op = now()`,
    [id, voorGebruikers, door.slice(0, 80)]);
  return { voor: !!oud?.voor_gebruikers, na: voorGebruikers };
}

/** Eerlijke configuratiecontrole: welke stand geven de levende gegevens, zonder externe aanroep. */
export function standUitLevend(i: Integratie, l: Levend | null): { stand: Stand; code: string; detail: string } {
  if (i.status === 'binnenkort') return { stand: 'onbekend', code: 'NIET_GEBOUWD', detail: 'Deze koppeling bestaat nog niet op de site.' };
  if (!l) return { stand: 'onbekend', code: 'GEEN_LEVENDE_STATUS', detail: 'De site kan de toestand van deze koppeling niet zelf lezen; controleer haar op de eigen pagina.' };
  if (l.toestand === 'fout') return { stand: 'fout', code: 'MELDT_FOUT', detail: l.detail };
  if (l.toestand === 'verbonden') return { stand: 'ok', code: 'VERBONDEN', detail: l.detail };
  if (l.toestand === 'ingesteld') return { stand: 'let-op', code: 'NIET_GEVERIFIEERD', detail: l.detail };
  return { stand: 'let-op', code: 'NIET_GEKOPPELD', detail: l.detail };
}

export function adminIntegratieRoutes(gate: AdminGate, requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const route = (capability: string, run: (b: Record<string, unknown>, auth: AdminAuth) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await gate(ctx, capability);
    if ('errorCode' in auth) return error(auth.errorCode, 403);
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try { return json(await run(b, auth)); } catch (e) {
      const code = (e as { code?: string }).code;
      if (typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code)) return error(code, code.endsWith('ONBEKEND') ? 404 : 400);
      console.error('[admin-integraties]', (e as Error).message);
      return error('INTEGRATIES_FOUT', 500);
    }
  }) as RouterMiddleware;
  const alsActor = (a: AdminAuth) => ({ id: a.user.id, email: a.user.email });
  const idUit = (b: Record<string, unknown>) => { const id = String(b.id ?? ''); if (!ID_RE.test(id) || !integratie(id)) throw fout('INTEGRATIE_ONBEKEND'); return integratie(id)!; };

  return {
    // «Майстер підключень» (20.10.2026): waarden voor de consoles, stand per provider, echte controle (backend/integraties-wizard.ts).
    ...integratiesWizardRoutes(gate),
    // Levende toestand (van het account van de aanroeper), beleid en laatste controles — alles in één antwoord.
    'POST /api/owner/admin/integraties/stand': [route('admin.read', async (_b, a) => {
      const cache = {};
      const levend: Record<string, Levend> = {};
      for (const i of INTEGRATIES) {
        if (!i.levend || !(i.levend.startsWith('agent:') || VAULT_ID[i.levend])) continue;
        try { const l = await levendVoor(i, a.user.id, a.user.email || '', cache); if (l) levend[i.id] = l; } catch (e) { console.error('[admin-integraties] stand', i.id, (e as Error).message); }
      }
      // UI-013: IMAP-koppelingen (Пошта → Акаунти) van het eigen account in dezelfde stand, zodat de catalogus ze ziet.
      try { Object.assign(levend, imapLevend(await mailImapLijst(a.user.id, 'prive'))); } catch (e) { console.error('[admin-integraties] stand imap', (e as Error).message); }
      const [beleid, controles] = await Promise.all([beleidMap().catch(() => ({})), laatsteControles().catch(() => ({}))]);
      return { levend, beleid, controles, voor: 'eigen-account' };
    })],

    // UI-013 (BUG «Стан Google-підключень не вдалося прочитати»): de catalogus las de Google-stand uit de ZWARE diagnostiek
    // (/api/owner/admin/diagnostics). Die doet in één Promise.all ook de mailplatformcontrole (externe HTTP-probes naar de push-/webhook-
    // adressen met time-out + schrijven in mail_endpoint_verifications_v1), de cron-stand en een auditregel. Faalt één onderdeel, dan
    // faalt het hele antwoord en meldde de catalogus «Google onleesbaar», ook als de Google-grant zelf prima leesbaar was.
    // Deze route leest ALLEEN de Google-stand (dezelfde functie als de diagnostiek), zonder externe aanroep en zonder schrijven.
    'POST /api/owner/admin/integraties/google-stand': [route('admin.read', async (_b, a) => {
      try {
        const s = await googleSuiteOnboardingSnapshot(a.user.id, a.user.email || '');
        return { ok: true, services: s.services.map((d) => ({ id: d.id, granted: Boolean(d.granted), status: String(d.status) })), gelezenOp: Date.now() };
      } catch (e) {
        console.error('[admin-integraties] google-stand', (e as Error).message);
        return { ok: false, services: [], code: 'GOOGLE_STAND_ONLEESBAAR', gelezenOp: Date.now() };
      }
    })],

    // UI-013 fase 2: «Перевірка» van de wizard voor WebDAV/Nextcloud, S3 en MQTT. ALLEEN controleren: niets wordt bewaard of
    // geschreven (ook niet bij de dienst). Wachtwoorden komen alleen in deze ene aanvraag, gaan nooit in een antwoord, log of audit.
    // Netwerk: https via pinnedFetch (geen privé-adressen, time-out, max. bytes); MQTT alleen TLS naar een publiek adres.
    'POST /api/owner/admin/integraties/adapter-controle': [route('apps.manage', async (b, a) => {
      if (!adapterTempo(a.user.id)) throw fout('TE_VAAK');
      const soort = String(b.soort || ''), t = (k: string, max = 512) => String(b[k] ?? '').slice(0, max);
      const haal = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => pinnedFetch(url, init, 15000, 2 * 1024 * 1024);
      let u: { ok: boolean; fout?: string; aantal?: number; ms?: number };
      if (soort === 'webdav') { const x = await webdavLijst(haal, t('adres'), t('gebruiker', 200), t('wachtwoord', 1024)); u = x.ok ? { ok: true, aantal: x.waarde.items.length } : { ok: false, fout: x.fout }; }
      else if (soort === 's3') { const x = await s3Lijst(haal, t('adres'), t('emmer', 63), { toegangsId: t('toegangsId', 200), geheim: t('geheim', 1024), regio: t('regio', 40) || 'us-east-1' }, { max: 20 }); u = x.ok ? { ok: true, aantal: x.waarde.objecten.length } : { ok: false, fout: x.fout }; }
      else if (soort === 'mqtt') {
        const host = t('host', 253), poort = Number(b.poort || 8883);
        let adressen: { address: string }[] = [];
        try { adressen = await lookup(host, { all: true }); } catch { adressen = []; }
        if (!adressen.length) u = { ok: false, fout: 'MQTT_ONBEREIKBAAR' };
        else if (adressen.some((x) => privateAddress(x.address))) u = { ok: false, fout: 'MQTT_PRIVE_ADRES' };
        else { const x = await mqttControle(adressen[0].address, poort, { tls: true, tlsServernaam: host, gebruiker: t('gebruiker', 200) || undefined, wachtwoord: t('wachtwoord', 1024) || undefined }); u = x.ok ? { ok: true, ms: x.waarde.ms } : { ok: false, fout: x.fout }; }
      } else throw fout('SOORT_ONBEKEND');
      await schrijfBeheerAudit({ actor: alsActor(a), doel: { soort: 'integratie', id: `adapter-${soort}`, naam: soort }, actie: 'integration.adapter.test', na: u.ok ? 'ok' : (u.fout || 'fout'), resultaat: u.ok ? 'success' : 'failure' }).catch(() => undefined);
      return { soort, ...u, op: Date.now() };
    })],

    // UI-013 fase 2: periodieke gezondheidscontrole (configuratiecontrole, zie standUitLevend) van ALLE gebouwde koppelingen van het
    // eigen account. Frequentiegrens: hoogstens één keer per 30 minuten per account (server), de pagina vraagt het hoogstens 1×/uur.
    // Geen externe aanroep, geen schrijven bij diensten; alleen een regel in app.integratie_controles per koppeling.
    'POST /api/owner/admin/integraties/controleer-alle': [route('admin.read', async (_b, a) => {
      const vorige = (await sys().query('SELECT max(op) AS op FROM app.integratie_controles WHERE door = $1', [`periodiek:${a.user.id}`]).catch(() => ({ rows: [{ op: null }] }))).rows[0]?.op;
      if (vorige && Date.now() - new Date(vorige).getTime() < PERIODIEK_MIN_MS) return { uitgevoerd: false, reden: 'TE_RECENT', vorige: new Date(vorige).getTime() };
      const cache = {}; let n = 0;
      for (const i of INTEGRATIES) {
        if (i.status === 'binnenkort' || !i.levend || !(i.levend.startsWith('agent:') || VAULT_ID[i.levend])) continue;
        let l: Levend | null = null; try { l = await levendVoor(i, a.user.id, a.user.email || '', cache); } catch { l = null; }
        const st = standUitLevend(i, l);
        await sys().query('INSERT INTO app.integratie_controles (integratie, stand, code, detail, door) VALUES ($1, $2, $3, $4, $5)', [i.id, st.stand, st.code, st.detail.slice(0, 300), `periodiek:${a.user.id}`]);
        n++;
      }
      return { uitgevoerd: true, aantal: n, op: Date.now(), register: REGISTER.length };
    })],

    // De beheerder maakt een bestaande koppeling (on)beschikbaar voor gebruikers.
    'POST /api/owner/admin/integraties/beleid': [route('apps.manage', async (b, a) => {
      const i = idUit(b);
      const aan = b.voorGebruikers === true;
      let r: { voor: boolean; na: boolean };
      try { r = await zetBeleid(i.id, aan, a.user.id); } catch (e) {
        await schrijfBeheerAudit({ actor: alsActor(a), doel: { soort: 'integratie', id: i.id, naam: i.naam }, actie: 'integration.beleid.geweigerd', resultaat: 'denied', reden: (e as { code?: string }).code }).catch(() => undefined);
        throw e;
      }
      await schrijfBeheerAudit({
        actor: alsActor(a), doel: { soort: 'integratie', id: i.id, naam: i.naam }, actie: aan ? 'integration.beleid.aan' : 'integration.beleid.uit',
        voor: r.voor ? 'beschikbaar voor gebruikers' : 'niet beschikbaar', na: aan ? 'beschikbaar voor gebruikers' : 'niet beschikbaar', resultaat: 'success',
      }).catch(() => undefined);
      return { ok: true, id: i.id, voorGebruikers: aan, gewijzigd: r.voor !== r.na };
    })],

    // «Перевірити стан»: configuratiecontrole, bewaard als geschiedenis en gelogd.
    'POST /api/owner/admin/integraties/controleer': [route('admin.read', async (b, a) => {
      const i = idUit(b);
      let l: Levend | null = null;
      if (i.status !== 'binnenkort') { try { l = await levendVoor(i, a.user.id, a.user.email || ''); } catch { l = null; } }
      const u = standUitLevend(i, l);
      await sys().query('INSERT INTO app.integratie_controles (integratie, stand, code, detail, door) VALUES ($1, $2, $3, $4, $5)', [i.id, u.stand, u.code, u.detail.slice(0, 300), a.user.id]);
      await sys().query(`DELETE FROM app.integratie_controles WHERE integratie = $1 AND op < now() - interval '90 days'`, [i.id]).catch(() => undefined);
      await schrijfBeheerAudit({
        actor: alsActor(a), doel: { soort: 'integratie', id: i.id, naam: i.naam }, actie: 'integration.test', na: u.stand, resultaat: u.stand === 'fout' ? 'failure' : 'success',
        details: { code: u.code },
      }).catch(() => undefined);
      return { id: i.id, ...u, levend: l, op: Date.now() };
    })],

    // «Відключити»: alleen voor wat de site werkelijk kan intrekken (sleutels in de kluis, eigen AI-koppelingen). Bevestiging vereist.
    'POST /api/owner/admin/integraties/loskoppelen': [route('apps.manage', async (b, a) => {
      const i = idUit(b);
      if (b.bevestig !== true) throw fout('BEVESTIGING_VEREIST');
      const k = i.levend || '';
      let wat = '';
      if (k.startsWith('agent:') && isAgentSlug(k.slice(6))) {
        const ids = await trekIn(a.user.id, k.slice(6) as never);
        wat = `${ids.length} koppeling(en) van dit account ingetrokken`;
      } else if (VAULT_ID[k] && detailVan(i).loskoppelbaar) {
        await zetVerbindingStatus(a.user.id, VAULT_ID[k], 'revoked', '');
        wat = 'koppeling ingetrokken (de waarde blijft in de kluis tot u haar daar verwijdert)';
      } else {
        throw fout('LOSKOPPELEN_NIET_MOGELIJK');
      }
      await schrijfBeheerAudit({ actor: alsActor(a), doel: { soort: 'integratie', id: i.id, naam: i.naam }, actie: 'integration.disconnect', na: wat, resultaat: 'success' }).catch(() => undefined);
      return { ok: true, id: i.id, wat };
    })],

    // Voor gewone gebruikers: welke koppelingen mogen zij van de beheerder zien/gebruiken. Alleen id's, geen beheerdetails.
    'POST /api/owner/integraties/beschikbaar': [(async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error('OWNER_SESSION_REQUIRED', 403);
      try {
        const m = await beleidMap();
        const ids = Object.entries(m).filter(([id, v]) => v.voorGebruikers && integratie(id)?.status === 'klaar').map(([id]) => id);
        return json({ ids });
      } catch (e) { console.error('[admin-integraties] beschikbaar', (e as Error).message); return error('INTEGRATIES_FOUT', 500); }
    }) as RouterMiddleware],
  };
}
