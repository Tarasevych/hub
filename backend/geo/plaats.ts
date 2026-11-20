// МІСЦЕ Й ПРОВАЙДЕР ЗАПИТУ (PLAATS-TEKENS-001, 17.11.2026). Для сповіщення про вхід: країна, область/провінція, місто (з заголовків
// тунелю Cloudflare, які сайт уже отримує) і провайдер (з локальної бази мереж, backend/geo/asn.ts) разом із ключами знаків у
// реєстрі логотипів. Усе локально: індекси міст лежать у dist/merk/plaats/<land>.json, база мереж — у MIJN_RUIMTE_GEO_MAP.
// PLAATS EN PROVIDER VAN EEN VERZOEK: land/regio/stad uit de Cloudflare-koppen, provider uit de lokale netwerkbasis, plus de
// sleutels van de tekens. Niets gaat naar buiten.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { landCode, plaatsTekens, type PlaatsAntwoord, type PlaatsIndex } from '../../shared/plaats-teken';
import { providerNaamUitAsNaam, providerTeken } from '../../shared/aanbieder-teken';
import { asnVanIp } from './asn';

export type VerzoekPlaats = PlaatsAntwoord & {
  land: string;
  regioCode: string;
  regioNaam: string;
  stadNaam: string;
  provider: { asn: number; naam: string; sleutel: string | null } | null;
  /** Waar het vandaan komt, in gewone woorden voor de melding. */
  bron: 'cloudflare' | 'netwerkbasis' | 'onbekend';
};

const kop = (h: Record<string, unknown>, n: string): string => {
  const v = h[n] ?? h[n.toLowerCase()];
  const s = Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
  try { return decodeURIComponent(s).trim().slice(0, 120); } catch { return s.trim().slice(0, 120); }
};

const indexCache = new Map<string, { mtime: number; index: PlaatsIndex | null }>();
function indexMappen(): string[] {
  const dist = process.env.DIST_DIR || path.resolve('dist');
  return [path.join(dist, 'merk/plaats'), path.resolve('public/merk/plaats')];
}
export function plaatsIndex(land: string): PlaatsIndex | null {
  const c = landCode(land);
  if (!c) return null;
  const f = indexMappen().map((m) => path.join(m, `${c.toLowerCase()}.json`)).find((p) => existsSync(p));
  if (!f) return null;
  try {
    const m = statSync(f).mtimeMs;
    const oud = indexCache.get(f);
    if (oud && oud.mtime === m) return oud.index;
    const index = JSON.parse(readFileSync(f, 'utf8')) as PlaatsIndex;
    indexCache.set(f, { mtime: m, index });
    return index;
  } catch { return null; }
}

export function plaatsVanVerzoek(headers: Record<string, unknown>, ip?: string | null): VerzoekPlaats {
  const netwerk = asnVanIp(ip);
  const landKop = landCode(kop(headers, 'cf-ipcountry'));
  const land = landKop || landCode(netwerk?.land);
  const regioCode = kop(headers, 'cf-region-code').toUpperCase();
  const regioNaam = kop(headers, 'cf-region');
  const stadNaam = kop(headers, 'cf-ipcity');
  const antwoord = plaatsTekens({ land, regioCode, regio: regioNaam, stad: stadNaam }, plaatsIndex(land));
  const p = netwerk ? providerTeken({ asn: netwerk.asn, naam: netwerk.asNaam }) : null;
  return {
    ...antwoord, land, regioCode, regioNaam, stadNaam,
    provider: netwerk ? { asn: netwerk.asn, naam: p?.naam || providerNaamUitAsNaam(netwerk.asNaam), sleutel: p?.sleutel ?? null } : null,
    bron: landKop ? 'cloudflare' : netwerk ? 'netwerkbasis' : 'onbekend',
  };
}
