// CONSOL-001 (Блок Б, міграція 0324): зашифроване збереження, читання стану, повторна жива перевірка та розірвання
// перевірених підключень перехідників зовнішніх служб (Nextcloud/WebDAV, S3, MQTT, Zigbee2MQTT) у межах користувача й простору.
// Versleutelde opslag, levende statuscontrole en loskoppelen van adapterkoppelingen per gebruiker en ruimte onder FORCE RLS.
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { error, json } from '../server/platform';
import { envKey32 } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import type { AiRuimte } from '../shared/ai-ruimte';
import { integratie } from '../shared/integraties-catalogus';
import { registerVan, type RegisterRij } from '../shared/integraties-register';
import { SLEUTEL_GESLOTEN_CODE, isServerEnvelop } from '../shared/sleutelkluis';
import { alsGebruiker } from './ai-toestemmingen';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { adapterTempo, type AdminGate, type Levend, type Stand } from './beheer-integraties';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { herversleutelEnvelop, isGeslotenFout, ontzegel, registreerHerversleutelaar, verzegel, type KluisLade } from './sleutelkluis';
import { pinnedFetch, privateAddress } from './veilige-fetch';
import type { Haal } from './verbinding-adapters/gemeen';
import { mqttControle } from './verbinding-adapters/mqtt';
import { s3Lijst } from './verbinding-adapters/s3';
import { webdavLijst } from './verbinding-adapters/webdav';

export type AdapterId = NonNullable<RegisterRij['adapter']>;

const TABEL = 'app.integratie_adapter_koppeling';
const TOEGESTANE_INTEGRATIES = new Set(['nextcloud', 's3', 'mqtt', 'zigbee2mqtt']);
const SERVER_SLEUTEL_KANDIDATEN = [
  'OWNER_VAULT_ENCRYPTION_KEY_V1',
  'MAIL_APP_WACHTWOORD_SLEUTEL_V1',
  'SLEUTELKLUIS_SLEUTEL_V1',
  'TOTP_ENCRYPTION_KEY_V1',
] as const;

export const ADAPTER_SLEUTEL_NAAM = 'OWNER_VAULT_ENCRYPTION_KEY_V1';

const kiesServerSleutel = (): string => {
  for (const naam of SERVER_SLEUTEL_KANDIDATEN) {
    if (envKey32(naam)) return naam;
  }
  return ADAPTER_SLEUTEL_NAAM;
};

/** Додаткові автентифіковані дані конверта: жорстко прив’язані до простору, користувача та ідентифікатора рядка. */
export const adapterKoppelingAad = (userId: string, id: string, ruimte: AiRuimte = 'prive'): string =>
  `integratie-adapter|${ruimte}|${userId}|${id}`;

export type AdapterConfiguratiePubliek = {
  adres?: string;
  gebruiker?: string;
  emmer?: string;
  regio?: string;
  toegangsId?: string;
  host?: string;
  poort?: number;
};

export type AdapterKoppelingPubliek = {
  id: string;
  integratie: 'nextcloud' | 's3' | 'mqtt' | 'zigbee2mqtt';
  soort: AdapterId;
  ruimte: AiRuimte;
  configuratie: AdapterConfiguratiePubliek;
  actief: boolean;
  zichtbareItems: number;
  laatstGoedOp: number | null;
  fout: string;
  bijgewerktOp: number;
};

export type AdapterNetwerkDeps = {
  haal?: Haal;
  dnsLookup?: (host: string) => Promise<Array<{ address: string }>>;
  mqttCheck?: typeof mqttControle;
};

type DbVraag = Parameters<Parameters<typeof alsGebruiker>[1]>[0];
type AdapterRij = {
  id: string;
  integratie: 'nextcloud' | 's3' | 'mqtt' | 'zigbee2mqtt';
  soort: AdapterId;
  ruimte: AiRuimte;
  configuratie: AdapterConfiguratiePubliek | null;
  geheim?: string;
  actief: boolean;
  zichtbare_items: number;
  laatst_goed_op: Date | string | null;
  fout: string;
  bijgewerkt_op: Date | string;
};

type Ctx = { event: Record<string, unknown>; body: unknown };
type Sess = { user: { id: string; email?: string; status?: string; role?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<Sess | { errorCode: string }>;

const sys = () => getPool('systeem');

export class AdapterKoppelingFout extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(code);
  }
}

function gooi(code: string, status = 400): never {
  throw new AdapterKoppelingFout(code, status);
}

async function inRuimte<T>(userId: string, ruimte: AiRuimte, werk: (q: DbVraag) => Promise<T>): Promise<T> {
  return alsGebruiker(userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [ruimte]);
    return werk(q);
  });
}

const schoonTekst = (v: unknown, max = 512): string =>
  String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

function publiekUitRij(r: AdapterRij): AdapterKoppelingPubliek {
  const cfg = (r.configuratie && typeof r.configuratie === 'object' ? r.configuratie : {}) as AdapterConfiguratiePubliek;
  const veiligeCfg: AdapterConfiguratiePubliek = {
    ...(cfg.adres ? { adres: String(cfg.adres).slice(0, 512) } : {}),
    ...(cfg.gebruiker ? { gebruiker: String(cfg.gebruiker).slice(0, 200) } : {}),
    ...(cfg.emmer ? { emmer: String(cfg.emmer).slice(0, 63) } : {}),
    ...(cfg.regio ? { regio: String(cfg.regio).slice(0, 40) } : {}),
    ...(cfg.toegangsId ? { toegangsId: String(cfg.toegangsId).slice(0, 200) } : {}),
    ...(cfg.host ? { host: String(cfg.host).slice(0, 253) } : {}),
    ...(typeof cfg.poort === 'number' && Number.isFinite(cfg.poort) ? { poort: cfg.poort } : {}),
  };
  return {
    id: String(r.id),
    integratie: r.integratie,
    soort: r.soort,
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    configuratie: veiligeCfg,
    actief: Boolean(r.actief),
    zichtbareItems: Number(r.zichtbare_items || 0),
    laatstGoedOp: r.laatst_goed_op ? new Date(String(r.laatst_goed_op)).getTime() : null,
    fout: String(r.fout || '').slice(0, 180),
    bijgewerktOp: r.bijgewerkt_op ? new Date(String(r.bijgewerkt_op)).getTime() : Date.now(),
  };
}

function doelSamenvatting(k: AdapterKoppelingPubliek): string {
  if (k.soort === 'webdav') return String(k.configuratie.adres || 'WebDAV').slice(0, 140);
  if (k.soort === 's3') return `${k.configuratie.emmer || 's3'} @ ${k.configuratie.adres || ''}`.trim().slice(0, 140);
  return `${k.configuratie.host || 'mqtt'}:${k.configuratie.poort || 8883}`.slice(0, 140);
}

export function adapterLevendUitLijst(lijst: readonly AdapterKoppelingPubliek[]): Record<string, Levend> {
  const uit: Record<string, Levend> = {};
  for (const k of lijst) {
    const doel = doelSamenvatting(k);
    if (!k.actief) {
      uit[k.integratie] = { toestand: 'niet', code: 'NIET_GEKOPPELD', detail: doel };
    } else if (k.fout) {
      uit[k.integratie] = {
        toestand: 'fout',
        code: 'ADAPTER_FOUT',
        detail: `${doel}: ${k.fout}`.slice(0, 180),
        ...(k.laatstGoedOp ? { gecontroleerdOp: k.laatstGoedOp } : {}),
      };
    } else {
      uit[k.integratie] = {
        toestand: 'verbonden',
        code: 'VERBONDEN',
        n: 1,
        detail: doel,
        ...(k.laatstGoedOp ? { gecontroleerdOp: k.laatstGoedOp } : {}),
      };
    }
  }
  return uit;
}

function ontleedAdapterInvoer(
  soort: AdapterId,
  b: Record<string, unknown>,
): { configuratie: AdapterConfiguratiePubliek; geheim: string } {
  if (soort === 'webdav') {
    const adres = schoonTekst(b.adres, 512);
    const gebruiker = schoonTekst(b.gebruiker, 200);
    const wachtwoord = String(b.wachtwoord ?? '').slice(0, 1024);
    if (!adres || !gebruiker || !wachtwoord) gooi('WEBDAV_GEGEVENS_ONTBREKEN', 400);
    return { configuratie: { adres, gebruiker }, geheim: wachtwoord };
  }
  if (soort === 's3') {
    const adres = schoonTekst(b.adres, 512);
    const emmer = schoonTekst(b.emmer, 63);
    const regio = schoonTekst(b.regio, 40) || 'us-east-1';
    const toegangsId = schoonTekst(b.toegangsId, 200);
    const geheim = String(b.geheim ?? '').slice(0, 1024);
    if (!adres || !emmer || !toegangsId || !geheim) gooi('S3_GEGEVENS_ONTBREKEN', 400);
    return { configuratie: { adres, emmer, regio, toegangsId }, geheim };
  }
  const host = schoonTekst(b.host, 253);
  const poortRuw = Number(b.poort || 8883);
  const poort = Number.isInteger(poortRuw) && poortRuw > 0 && poortRuw < 65536 ? poortRuw : 8883;
  const gebruiker = schoonTekst(b.gebruiker, 200);
  const wachtwoord = String(b.wachtwoord ?? '').slice(0, 1024);
  if (!host || !wachtwoord) gooi('MQTT_GEGEVENS_ONTBREKEN', 400);
  return { configuratie: { host, poort, ...(gebruiker ? { gebruiker } : {}) }, geheim: wachtwoord };
}

export async function controleerAdapterNetwerk(
  soort: AdapterId,
  configuratie: AdapterConfiguratiePubliek,
  geheim: string,
  deps: AdapterNetwerkDeps = {},
): Promise<{ ok: true; zichtbareItems: number; ms?: number } | { ok: false; fout: string }> {
  const haal: Haal = deps.haal
    ?? ((url, init) => pinnedFetch(url, init, 15_000, 2 * 1024 * 1024));
  if (soort === 'webdav') {
    const u = await webdavLijst(haal, String(configuratie.adres || ''), String(configuratie.gebruiker || ''), geheim);
    return u.ok ? { ok: true, zichtbareItems: u.waarde.items.length } : { ok: false, fout: u.fout };
  }
  if (soort === 's3') {
    const u = await s3Lijst(
      haal,
      String(configuratie.adres || ''),
      String(configuratie.emmer || ''),
      {
        toegangsId: String(configuratie.toegangsId || ''),
        geheim,
        regio: String(configuratie.regio || 'us-east-1'),
      },
      { max: 20 },
    );
    return u.ok ? { ok: true, zichtbareItems: u.waarde.objecten.length } : { ok: false, fout: u.fout };
  }
  const host = String(configuratie.host || '');
  const poort = Number(configuratie.poort || 8883);
  const dnsLookup = deps.dnsLookup ?? ((h: string) => lookup(h, { all: true }));
  const mqttFn = deps.mqttCheck ?? mqttControle;
  let adressen: Array<{ address: string }> = [];
  try {
    adressen = await dnsLookup(host);
  } catch {
    adressen = [];
  }
  if (!adressen.length) return { ok: false, fout: 'MQTT_ONBEREIKBAAR' };
  if (adressen.some((x) => privateAddress(x.address))) return { ok: false, fout: 'MQTT_PRIVE_ADRES' };
  const u = await mqttFn(adressen[0].address, poort, {
    tls: true,
    tlsServernaam: host,
    gebruiker: configuratie.gebruiker || undefined,
    wachtwoord: geheim || undefined,
  });
  return u.ok ? { ok: true, zichtbareItems: 0, ms: u.waarde.ms } : { ok: false, fout: u.fout };
}

async function ontzegelAdapterGeheim(lade: KluisLade, id: string, envelop: string): Promise<string> {
  const aad = adapterKoppelingAad(lade.userId, id, lade.ruimte);
  if (!isServerEnvelop(envelop)) {
    return ontzegel(lade, TABEL, envelop, aad, kiesServerSleutel());
  }
  let laatsteFout: unknown = null;
  for (const sleutelNaam of SERVER_SLEUTEL_KANDIDATEN) {
    if (!envKey32(sleutelNaam)) continue;
    try {
      return await ontzegel(lade, TABEL, envelop, aad, sleutelNaam);
    } catch (e) {
      laatsteFout = e;
    }
  }
  throw laatsteFout || new AdapterKoppelingFout('ADAPTER_SLEUTEL_ONTBREEKT', 503);
}

/** Список збережених підключень перехідників користувача у вибраному просторі (ніколи не повертає секретів). */
export async function adapterKoppelingenLijst(userId: string, ruimte: AiRuimte): Promise<AdapterKoppelingPubliek[]> {
  if (!userId) return [];
  try {
    const rijen = await inRuimte(userId, ruimte, async (q) => {
      const { rows } = await q(
        `SELECT id::text AS id, integratie, soort, ruimte, configuratie, actief, zichtbare_items, laatst_goed_op, fout, bijgewerkt_op
           FROM app.integratie_adapter_koppeling
          WHERE user_id = $1 AND ruimte = $2
          ORDER BY integratie`,
        [userId, ruimte],
      );
      return rows as AdapterRij[];
    });
    return rijen.map(publiekUitRij);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') return [];
    throw e;
  }
}

/** Зберегти підключення перехідника ПІСЛЯ живої мережевої перевірки та запечатування секрету під AAD. */
export async function adapterKoppelingBewaren(
  userId: string,
  ruimte: AiRuimte,
  integratieId: string,
  invoer: Record<string, unknown>,
  deps: AdapterNetwerkDeps = {},
): Promise<{ koppeling: AdapterKoppelingPubliek; ms?: number }> {
  if (!TOEGESTANE_INTEGRATIES.has(integratieId) || !integratie(integratieId)) {
    gooi('INTEGRATIE_ONBEKEND', 404);
  }
  const reg = registerVan(integratieId);
  if (!reg?.adapter) gooi('SOORT_ONBEKEND', 400);
  const soort = reg.adapter;
  const { configuratie, geheim } = ontleedAdapterInvoer(soort, invoer);

  const proef = await controleerAdapterNetwerk(soort, configuratie, geheim, deps);
  if (!proef.ok) gooi(proef.fout, 400);

  const bestaand = await inRuimte(userId, ruimte, async (q) => {
    const { rows } = await q(
      'SELECT id::text AS id FROM app.integratie_adapter_koppeling WHERE user_id = $1 AND ruimte = $2 AND integratie = $3',
      [userId, ruimte, integratieId],
    );
    return rows[0] as { id: string } | undefined;
  });

  const rijId = bestaand?.id || randomUUID();
  let verzegeldGeheim = '';
  try {
    verzegeldGeheim = await verzegel(
      { userId, ruimte },
      TABEL,
      geheim,
      adapterKoppelingAad(userId, rijId, ruimte),
      kiesServerSleutel(),
    );
  } catch (e) {
    if (isGeslotenFout(e)) gooi(SLEUTEL_GESLOTEN_CODE, 423);
    gooi('ADAPTER_SLEUTEL_ONTBREEKT', 503);
  }

  const opgeslagen = await inRuimte(userId, ruimte, async (q) => {
    const { rows } = await q(
      `INSERT INTO app.integratie_adapter_koppeling
         (user_id, ruimte, id, integratie, soort, configuratie, geheim, actief, zichtbare_items, laatst_goed_op, fout, aangemaakt_op, bijgewerkt_op)
       VALUES ($1, $2, $3::uuid, $4, $5, $6::jsonb, $7, true, $8, now(), '', now(), now())
       ON CONFLICT (user_id, ruimte, integratie)
       DO UPDATE SET
         soort = EXCLUDED.soort,
         configuratie = EXCLUDED.configuratie,
         geheim = EXCLUDED.geheim,
         actief = true,
         zichtbare_items = EXCLUDED.zichtbare_items,
         laatst_goed_op = now(),
         fout = '',
         bijgewerkt_op = now()
       RETURNING id::text AS id, integratie, soort, ruimte, configuratie, actief, zichtbare_items, laatst_goed_op, fout, bijgewerkt_op`,
      [userId, ruimte, rijId, integratieId, soort, JSON.stringify(configuratie), verzegeldGeheim, proef.zichtbareItems],
    );
    return rows[0] as AdapterRij;
  });

  const publiek = publiekUitRij(opgeslagen);
  await sys()
    .query(
      'INSERT INTO app.integratie_controles (integratie, stand, code, detail, door) VALUES ($1, $2, $3, $4, $5)',
      [integratieId, 'ok', 'VERBONDEN', doelSamenvatting(publiek).slice(0, 300), userId],
    )
    .catch(() => undefined);

  return { koppeling: publiek, ...(proef.ms !== undefined ? { ms: proef.ms } : {}) };
}

/** Повторна жива перевірка збереженого підключення без передавання пароля з оглядача. */
export async function adapterKoppelingControleren(
  userId: string,
  ruimte: AiRuimte,
  integratieId: string,
  deps: AdapterNetwerkDeps = {},
): Promise<{ stand: Stand; code: string; detail: string; levend: Levend; koppeling: AdapterKoppelingPubliek; op: number }> {
  if (!TOEGESTANE_INTEGRATIES.has(integratieId) || !integratie(integratieId)) {
    gooi('INTEGRATIE_ONBEKEND', 404);
  }
  const rij = await inRuimte(userId, ruimte, async (q) => {
    const { rows } = await q(
      `SELECT id::text AS id, integratie, soort, ruimte, configuratie, geheim, actief, zichtbare_items, laatst_goed_op, fout, bijgewerkt_op
         FROM app.integratie_adapter_koppeling
        WHERE user_id = $1 AND ruimte = $2 AND integratie = $3`,
      [userId, ruimte, integratieId],
    );
    return rows[0] as AdapterRij | undefined;
  });
  if (!rij || !rij.geheim) gooi('KOPPELING_NIET_GEVONDEN', 404);

  let geheim = '';
  try {
    geheim = await ontzegelAdapterGeheim({ userId, ruimte }, String(rij.id), rij.geheim);
  } catch (e) {
    if (isGeslotenFout(e)) gooi(SLEUTEL_GESLOTEN_CODE, 423);
    gooi('ADAPTER_SLEUTEL_ONTBREEKT', 503);
  }

  const cfg = (rij.configuratie && typeof rij.configuratie === 'object' ? rij.configuratie : {}) as AdapterConfiguratiePubliek;
  const proef = await controleerAdapterNetwerk(rij.soort, cfg, geheim, deps);
  const bijgewerkt = await inRuimte(userId, ruimte, async (q) => {
    const { rows } = await q(
      `UPDATE app.integratie_adapter_koppeling
          SET zichtbare_items = CASE WHEN $4 THEN $5 ELSE zichtbare_items END,
              laatst_goed_op = CASE WHEN $4 THEN now() ELSE laatst_goed_op END,
              fout = $6,
              bijgewerkt_op = now()
        WHERE user_id = $1 AND ruimte = $2 AND integratie = $3
        RETURNING id::text AS id, integratie, soort, ruimte, configuratie, actief, zichtbare_items, laatst_goed_op, fout, bijgewerkt_op`,
      [userId, ruimte, integratieId, proef.ok, proef.ok ? proef.zichtbareItems : 0, proef.ok ? '' : proef.fout],
    );
    return rows[0] as AdapterRij;
  });

  const publiek = publiekUitRij(bijgewerkt);
  const levend = adapterLevendUitLijst([publiek])[integratieId];
  const stand: Stand = proef.ok ? 'ok' : 'fout';
  const code = proef.ok ? 'VERBONDEN' : proef.fout;
  const detail = levend.detail;
  const op = Date.now();
  await sys()
    .query(
      'INSERT INTO app.integratie_controles (integratie, stand, code, detail, door) VALUES ($1, $2, $3, $4, $5)',
      [integratieId, stand, code, detail.slice(0, 300), userId],
    )
    .catch(() => undefined);

  return { stand, code, detail, levend, koppeling: publiek, op };
}

/** Розірвати збережене підключення перехідника та стерти зашифрований рядок зі сховища простору. */
export async function adapterKoppelingLoskoppelen(
  userId: string,
  ruimte: AiRuimte,
  integratieId: string,
): Promise<boolean> {
  if (!TOEGESTANE_INTEGRATIES.has(integratieId)) gooi('INTEGRATIE_ONBEKEND', 404);
  return inRuimte(userId, ruimte, async (q) => {
    const res = await q(
      'DELETE FROM app.integratie_adapter_koppeling WHERE user_id = $1 AND ruimte = $2 AND integratie = $3',
      [userId, ruimte, integratieId],
    );
    return (res.rowCount || 0) > 0;
  });
}

export function integratiesKoppelingenRoutes(
  gate: AdminGate,
  _requireSession?: RequireSession,
  netwerkDeps: AdapterNetwerkDeps = {},
): Record<string, RouterMiddleware[]> {
  const route = (
    capability: string,
    schrijvend: boolean,
    run: (b: Record<string, unknown>, auth: { user: { id: string; email?: string; role?: string; accessLevel?: string } }, ruimte: AiRuimte) => Promise<unknown>,
  ): RouterMiddleware =>
    (async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await gate(ctx, capability);
      if ('errorCode' in auth) return error(auth.errorCode, 403);
      const b = ctx.body && typeof ctx.body === 'object' ? (ctx.body as Record<string, unknown>) : {};
      const vreemd = rejectForeignOwnerUserId(auth.user as never, b);
      if (vreemd) return vreemd;
      if (schrijvend) {
        const geweigerd = denyMutation(
          { ...auth.user, status: (auth.user as { status?: string }).status ?? 'approved' } as never,
          'workspace.write',
        );
        if (geweigerd) return geweigerd;
      }
      const ruimte = await gegevensRuimteVeilig(auth.user.id, {
        tabContext: typeof b.tabContext === 'string' ? b.tabContext : null,
      });
      try {
        return json(await run(b, auth, ruimte));
      } catch (e) {
        if (isGeslotenFout(e)) return error(SLEUTEL_GESLOTEN_CODE, 423);
        if (e instanceof AdapterKoppelingFout) return error(e.code, e.status);
        const code = (e as { code?: string })?.code;
        if (typeof code === 'string' && /^[A-Z0-9_]{3,50}$/.test(code)) {
          return error(code, code.endsWith('ONBEKEND') || code.endsWith('NIET_GEVONDEN') ? 404 : 400);
        }
        console.error('[integraties-koppelingen]', (e as Error)?.message);
        return error('INTEGRATIES_FOUT', 500);
      }
    }) as RouterMiddleware;

  return {
    'POST /api/owner/admin/integraties/adapter-koppelingen/stand': [
      route('admin.read', false, async (_b, auth, ruimte) => {
        const koppelingen = await adapterKoppelingenLijst(auth.user.id, ruimte);
        return {
          ruimte,
          koppelingen,
          levend: adapterLevendUitLijst(koppelingen),
          plaintextReturned: false,
        };
      }),
    ],

    'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar': [
      route('apps.manage', true, async (b, auth, ruimte) => {
        if (!adapterTempo(auth.user.id)) gooi('TE_VAAK', 429);
        const integratieId = schoonTekst(b.integratie ?? b.id, 64);
        const info = integratie(integratieId);
        if (!info || !TOEGESTANE_INTEGRATIES.has(integratieId)) gooi('INTEGRATIE_ONBEKEND', 404);
        try {
          const uit = await adapterKoppelingBewaren(auth.user.id, ruimte, integratieId, b, netwerkDeps);
          await schrijfBeheerAudit({
            actor: { id: auth.user.id, email: auth.user.email },
            eigenaar: auth.user.id,
            doel: { soort: 'integratie', id: integratieId, naam: info.naam },
            actie: 'integration.adapter.bewaard',
            na: doelSamenvatting(uit.koppeling),
            resultaat: 'success',
            details: { ruimte, soort: uit.koppeling.soort, zichtbareItems: uit.koppeling.zichtbareItems },
          }).catch(() => undefined);
          return {
            ok: true,
            ruimte,
            koppeling: uit.koppeling,
            levend: adapterLevendUitLijst([uit.koppeling])[integratieId],
            ...(uit.ms !== undefined ? { ms: uit.ms } : {}),
            plaintextReturned: false,
          };
        } catch (e) {
          const reden = e instanceof AdapterKoppelingFout ? e.code : isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'FOUT';
          await schrijfBeheerAudit({
            actor: { id: auth.user.id, email: auth.user.email },
            eigenaar: auth.user.id,
            doel: { soort: 'integratie', id: integratieId, naam: info.naam },
            actie: 'integration.adapter.bewaard',
            reden,
            resultaat: 'failure',
            details: { ruimte },
          }).catch(() => undefined);
          throw e;
        }
      }),
    ],

    'POST /api/owner/admin/integraties/adapter-koppelingen/controleer': [
      route('admin.read', false, async (b, auth, ruimte) => {
        if (!adapterTempo(auth.user.id)) gooi('TE_VAAK', 429);
        const integratieId = schoonTekst(b.id ?? b.integratie, 64);
        const info = integratie(integratieId);
        if (!info || !TOEGESTANE_INTEGRATIES.has(integratieId)) gooi('INTEGRATIE_ONBEKEND', 404);
        const uit = await adapterKoppelingControleren(auth.user.id, ruimte, integratieId, netwerkDeps);
        await schrijfBeheerAudit({
          actor: { id: auth.user.id, email: auth.user.email },
          eigenaar: auth.user.id,
          doel: { soort: 'integratie', id: integratieId, naam: info.naam },
          actie: 'integration.adapter.test',
          na: uit.stand,
          resultaat: uit.stand === 'ok' ? 'success' : 'failure',
          details: { ruimte, code: uit.code },
        }).catch(() => undefined);
        return { id: integratieId, ...uit, plaintextReturned: false };
      }),
    ],

    'POST /api/owner/admin/integraties/adapter-koppelingen/loskoppelen': [
      route('apps.manage', true, async (b, auth, ruimte) => {
        const integratieId = schoonTekst(b.id ?? b.integratie, 64);
        const info = integratie(integratieId);
        if (!info || !TOEGESTANE_INTEGRATIES.has(integratieId)) gooi('INTEGRATIE_ONBEKEND', 404);
        if (b.bevestig !== true) gooi('BEVESTIGING_VEREIST', 400);
        const verwijderd = await adapterKoppelingLoskoppelen(auth.user.id, ruimte, integratieId);
        if (!verwijderd) gooi('KOPPELING_NIET_GEVONDEN', 404);
        await schrijfBeheerAudit({
          actor: { id: auth.user.id, email: auth.user.email },
          eigenaar: auth.user.id,
          doel: { soort: 'integratie', id: integratieId, naam: info.naam },
          actie: 'integration.disconnect',
          na: 'adapterkoppeling verwijderd uit ruimte',
          resultaat: 'success',
          details: { ruimte },
        }).catch(() => undefined);
        return { ok: true, id: integratieId, ruimte };
      }),
    ],
  };
}

// Сховище ключів (0092): переведення резервних v1-конвертів цієї шухляди під особистий ключ даних користувача (DEK).
registreerHerversleutelaar(TABEL, async (lade, dek) => {
  return inRuimte(lade.userId, lade.ruimte, async (q) => {
    const { rows } = await q(
      'SELECT id::text AS id, geheim FROM app.integratie_adapter_koppeling WHERE user_id = $1 AND ruimte = $2',
      [lade.userId, lade.ruimte],
    );
    let gevonden = 0;
    let herversleuteld = 0;
    for (const r of rows as Array<{ id: string; geheim: string }>) {
      if (!isServerEnvelop(r.geheim)) continue;
      gevonden += 1;
      const aad = adapterKoppelingAad(lade.userId, r.id, lade.ruimte);
      for (const sleutelNaam of SERVER_SLEUTEL_KANDIDATEN) {
        if (!envKey32(sleutelNaam)) continue;
        try {
          const nieuw = herversleutelEnvelop(dek, r.geheim, aad, sleutelNaam);
          await q(
            'UPDATE app.integratie_adapter_koppeling SET geheim = $4, bijgewerkt_op = now() WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid',
            [lade.userId, lade.ruimte, r.id, nieuw],
          );
          herversleuteld += 1;
          break;
        } catch {
          /* інший резервний ключ середовища */
        }
      }
    }
    return { gevonden, herversleuteld };
  });
});
