// Opslag achter de GitHub-koppeling: de app-gegevens van de EIGENAAR uit de kluis, de bewaarde tokens en de eenmalige
// `state` van de OAuth-flow.
//
// Drie regels gelden in dit hele bestand:
//  1. een token of een client secret staat alleen versleuteld (AES-256-GCM, gebonden aan gebruiker + weg) in de database en
//     komt nooit in een antwoord, een journaalregel of een URL terecht;
//  2. de `state` van de flow wordt alleen als hash bewaard, is aan één sessie én aan de tijd gebonden en verdwijnt bij het
//     eerste gebruik — een tweede keer dezelfde state is dus altijd onbekend;
//  3. BYOS: er staat geen enkele gedeelde client id of sleutel in de code. Alles komt uit de kluis van de eigenaar zelf.
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../server/platform';
import { envKey32, openWithEnvKey, sealWithEnvKey } from '../server/platform/beveiliging';
import { apiPlatformVaultItems, readOwnerVaultPlaintext } from './api-platform-kluis';
import { GITHUB_APP_DOEL, GITHUB_OAUTH_DOEL, leesAppSleutel, leesOauthApp, type AppSleutel, type OauthApp } from '../shared/github-koppeling';
import { hoortBij, type Lade } from '../shared/ruimte-scheiding';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import { herversleutelEnvelop, ontzegel as kluisOntzegel, registreerHerversleutelaar, verzegel as kluisVerzegel } from './sleutelkluis';
import { isServerEnvelop } from '../shared/sleutelkluis';

export const KOPPELING_TABEL = 'github_koppeling_v1';
export const STATE_TABEL = 'github_oauth_state_v1';

/** Hoe lang een begonnen flow mag duren voordat de terugkeer niet meer telt. */
export const STATE_GELDIG_MS = 10 * 60 * 1000;
/** Zoveel vóór het verlopen wordt een token al vernieuwd, zodat een verzoek er niet tussenin valt. */
export const VERNIEUW_MARGE_MS = 5 * 60 * 1000;

const SLEUTEL_NAAM = () => (envKey32('GITHUB_KOPPELING_SLEUTEL_V1') ? 'GITHUB_KOPPELING_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1');
/**
 * Waaraan een zegel vastzit. De RUIMTE hoort erbij: zo gaat een zegel van de TECHNISCHE lade nooit open als zegel van de
 * persoonlijke lade (en omgekeerd), ook niet als iemand de rij in de database van vlag verwisselt. Voor 'prive' blijft het
 * pad precies zoals het was, zodat elke bestaande rij gewoon open blijft gaan.
 */
const aad = (userId: string, pad: string) => `github-koppeling-v1|${userId}|${pad}`;
/** Het pad waarmee een zegel van DEZE lade is gebonden: persoonlijk ongewijzigd, technisch met een eigen achtervoegsel. */
export const zegelPad = (pad: string, ruimte: AiRuimte): string => (ruimteOf(ruimte) === 'technisch' ? `${pad}@technisch` : pad);
export const verzegel = (waarde: string, userId: string, pad: string): string => sealWithEnvKey(SLEUTEL_NAAM(), waarde, aad(userId, pad));
export const ontzegel = (zegel: string, userId: string, pad: string): string => openWithEnvKey(SLEUTEL_NAAM(), zegel, aad(userId, pad));
export const sleutelKlaar = (): boolean => !!envKey32(SLEUTEL_NAAM());
/**
 * Sleutelkluis (0092): dezelfde zegels, maar onder de EIGEN gegevenssleutel van de mens zodra die de kluis aanzette (anders de
 * serversleutel, exact als `verzegel`). De ruimte zit al in het pad (zegelPad) én in de lade, dus een technische zegel gaat nooit
 * open met de persoonlijke sleutel. Oude 'v1.'-zegels blijven leesbaar; «перешифрувати зараз» zet ze om (herversleutelaar onderaan).
 */
export const verzegelVoor = (waarde: string, userId: string, pad: string, ruimte: AiRuimte = 'prive'): Promise<string> =>
  kluisVerzegel({ userId, ruimte: ruimteOf(ruimte) }, KOPPELING_TABEL, waarde, aad(userId, pad), SLEUTEL_NAAM());
export const ontzegelVoor = (zegel: string, userId: string, pad: string, ruimte: AiRuimte = 'prive'): Promise<string> =>
  kluisOntzegel({ userId, ruimte: ruimteOf(ruimte) }, KOPPELING_TABEL, zegel, aad(userId, pad), SLEUTEL_NAAM());

export const hash = (waarde: string): string => createHash('sha256').update(waarde).digest('hex');
export const nieuweState = (): string => randomBytes(32).toString('base64url');

// ------------------------------------------------------------------------------------------------ gegevens van de app (kluis)

/** Alleen voor tests: de kluis en de klok vervangen. */
let kluisRijen: (userId: string) => Promise<Array<{ keyName: string; purpose: string }>> = (userId) => apiPlatformVaultItems(userId) as unknown as Promise<Array<{ keyName: string; purpose: string }>>;
let kluisWaarde: (userId: string, keyName: string, purpose: string) => Promise<string> = (userId, keyName, purpose) => readOwnerVaultPlaintext(userId, keyName, purpose as never);
export const setKoppelingKluis = (deps: { rijen?: typeof kluisRijen; waarde?: typeof kluisWaarde } | null) => {
  kluisRijen = deps?.rijen ?? ((userId) => apiPlatformVaultItems(userId) as unknown as Promise<Array<{ keyName: string; purpose: string }>>);
  kluisWaarde = deps?.waarde ?? ((userId, keyName, purpose) => readOwnerVaultPlaintext(userId, keyName, purpose as never));
};

const uitKluis = async (userId: string, doel: string): Promise<string | null> => {
  let rijen: Array<{ keyName: string; purpose: string }>;
  try { rijen = await kluisRijen(userId); } catch { return null; }
  const rij = rijen.find((r) => r.purpose === doel);
  if (!rij) return null;
  try { return await kluisWaarde(userId, rij.keyName, doel); } catch { return null; }
};

/** Staat er een sleutel met dit doel in de kluis? (Zonder de waarde te lezen.) */
export async function doelAanwezig(userId: string, doel: string): Promise<boolean> {
  try { return (await kluisRijen(userId)).some((r) => r.purpose === doel); } catch { return false; }
}

/**
 * De OAuth-app van de eigenaar. `null` = er staat niets in de kluis; `'onleesbaar'` = er staat wel iets, maar het zijn geen
 * client id + client secret. Dat verschil maakt de kaart zichtbaar, zodat niemand naar een lege knop staart.
 */
export async function oauthApp(userId: string): Promise<OauthApp | 'onleesbaar' | null> {
  const rauw = await uitKluis(userId, GITHUB_OAUTH_DOEL);
  if (rauw === null) return null;
  return leesOauthApp(rauw) ?? 'onleesbaar';
}

/** De sleutel van de GitHub App van de eigenaar; zelfde drie uitkomsten als bij de OAuth-app. */
export async function appSleutel(userId: string): Promise<AppSleutel | 'onleesbaar' | null> {
  const rauw = await uitKluis(userId, GITHUB_APP_DOEL);
  if (rauw === null) return null;
  return leesAppSleutel(rauw) ?? 'onleesbaar';
}

// ------------------------------------------------------------------------------------------------ bewaarde koppeling

export type KoppelPadOpslag = 'oauth' | 'app';
/**
 * Eén bewaarde weg per gebruiker. `userId` staat er los in zodat de RLS-expressie van app.records (0007) de rij aan het
 * juiste account hangt. Alle tokenvelden zijn zegels, nooit leesbare tekst.
 */
export type KoppelingRecord = {
  userId: string;
  /**
   * De gegevenslade waar deze weg bij hoort (migratie 0086). Ontbrekend of NULL = 'prive': elke rij van vóór 0086 blijft
   * dus een PERSOONLIJKE koppeling en wordt nooit stil technisch. De technische lade begint leeg.
   */
  ruimte: AiRuimte;
  pad: KoppelPadOpslag;
  /** @login zoals GitHub hem gaf (OAuth) of de naam van het account waar de app staat (App). */
  login: string;
  scopes: string[];
  tokenZegel: string;
  /** Alleen OAuth met «expiration» aan. */
  verversZegel: string;
  /** 0 = zonder termijn. */
  verlooptOp: number;
  verversVerlooptOp: number;
  /** GitHub App: installatie en de repositories waar ze bij mag. */
  installatie: number;
  repos: string[];
  aangemaaktOp: number;
  bijgewerktOp: number;
};

/** Alle bewaarde wegen van deze mens, uit BEIDE laden; het filteren per lade doet `hoortBij` (veld afwezig = prive). */
const rijenVan = async (userId: string): Promise<Array<KoppelingRecord & { id: string }>> => {
  const uit = await db.list<KoppelingRecord>(KOPPELING_TABEL, { filter: { userId }, limit: 40 });
  return uit.items as Array<KoppelingRecord & { id: string }>;
};
/** De lade van deze mens; standaard de PERSOONLIJKE, zodat een aanroeper die niets zegt nooit per ongeluk technisch leest. */
const ladeVan = (userId: string, ruimte: AiRuimte = 'prive'): Lade => ({ userId, ruimte: ruimteOf(ruimte) });
/** Alleen de wegen van ÉÉN lade. */
export const koppelingenVanLade = async (userId: string, ruimte: AiRuimte = 'prive'): Promise<Array<KoppelingRecord & { id: string }>> =>
  (await rijenVan(userId)).filter((r) => hoortBij(r as unknown as { userId?: unknown; ruimte?: unknown }, ladeVan(userId, ruimte)));

export async function koppelingLezen(userId: string, pad: KoppelPadOpslag, ruimte: AiRuimte = 'prive'): Promise<(KoppelingRecord & { id: string }) | null> {
  return (await koppelingenVanLade(userId, ruimte)).find((r) => r.pad === pad) ?? null;
}

export async function koppelingBewaren(userId: string, pad: KoppelPadOpslag, velden: Partial<KoppelingRecord>, ruimte: AiRuimte = 'prive'): Promise<KoppelingRecord & { id: string }> {
  const nu = Date.now();
  const lade = ladeVan(userId, ruimte);
  const bestaand = await koppelingLezen(userId, pad, lade.ruimte);
  const record: KoppelingRecord = {
    userId, pad, ruimte: lade.ruimte,
    login: velden.login ?? bestaand?.login ?? '',
    scopes: velden.scopes ?? bestaand?.scopes ?? [],
    tokenZegel: velden.tokenZegel ?? bestaand?.tokenZegel ?? '',
    verversZegel: velden.verversZegel ?? bestaand?.verversZegel ?? '',
    verlooptOp: velden.verlooptOp ?? bestaand?.verlooptOp ?? 0,
    verversVerlooptOp: velden.verversVerlooptOp ?? bestaand?.verversVerlooptOp ?? 0,
    installatie: velden.installatie ?? bestaand?.installatie ?? 0,
    repos: velden.repos ?? bestaand?.repos ?? [],
    aangemaaktOp: bestaand?.aangemaaktOp ?? nu,
    bijgewerktOp: nu,
  };
  if (bestaand) { await db.update(KOPPELING_TABEL, [{ id: bestaand.id, record }]); return { ...record, id: bestaand.id }; }
  const [id] = await db.add(KOPPELING_TABEL, [record]);
  return { ...record, id: String(id ?? '') };
}

export async function koppelingWissen(userId: string, pad: KoppelPadOpslag, ruimte: AiRuimte = 'prive'): Promise<boolean> {
  const bestaand = await koppelingLezen(userId, pad, ruimte);
  if (!bestaand) return false;
  const [ok] = await db.delete(KOPPELING_TABEL, [bestaand.id]);
  return !!ok;
}

/** De token van een bewaarde weg, ontzegeld. `null` als er niets staat of de zegel niet opengaat (andere sleutel). */
export async function koppelingToken(record: KoppelingRecord | null, userId: string): Promise<string | null> {
  if (!record?.tokenZegel) return null;
  try { return await ontzegelVoor(record.tokenZegel, userId, zegelPad(record.pad, record.ruimte), record.ruimte); } catch { return null; }
}
export async function koppelingVerversToken(record: KoppelingRecord | null, userId: string): Promise<string | null> {
  if (!record?.verversZegel) return null;
  try { return await ontzegelVoor(record.verversZegel, userId, `${zegelPad(record.pad, record.ruimte)}:verversen`, record.ruimte); } catch { return null; }
}
/** Staat deze weg nog onder de serversleutel? (voor «ще серверним ключем» op de pagina) */
export const koppelingNogServerSleutel = (record: KoppelingRecord | null): boolean => !!record && (isServerEnvelop(record.tokenZegel) || isServerEnvelop(record.verversZegel));

// Sleutelkluis (0092): oude v1-zegels van déze lade onder de DEK zetten.
registreerHerversleutelaar(KOPPELING_TABEL, async (lade, dek) => {
  const rijen = await koppelingenVanLade(lade.userId, lade.ruimte);
  let gevonden = 0, herversleuteld = 0;
  for (const r of rijen) {
    if (!isServerEnvelop(r.tokenZegel) && !isServerEnvelop(r.verversZegel)) continue;
    gevonden++;
    try {
      const tokenZegel = r.tokenZegel ? herversleutelEnvelop(dek, r.tokenZegel, aad(lade.userId, zegelPad(r.pad, r.ruimte)), SLEUTEL_NAAM()) : '';
      const verversZegel = r.verversZegel ? herversleutelEnvelop(dek, r.verversZegel, aad(lade.userId, `${zegelPad(r.pad, r.ruimte)}:verversen`), SLEUTEL_NAAM()) : '';
      const { id, ...rest } = r;
      await db.update(KOPPELING_TABEL, [{ id, record: { ...rest, tokenZegel, verversZegel, bijgewerktOp: Date.now() } }]);
      herversleuteld++;
    } catch { /* deze rij blijft v1; de teller zegt het */ }
  }
  return { gevonden, herversleuteld };
});

/** Is de token van deze weg (bijna) verlopen? Een weg zonder termijn verloopt nooit. */
export const bijnaVerlopen = (record: KoppelingRecord | null, nu = Date.now()): boolean =>
  !!record && record.verlooptOp > 0 && record.verlooptOp - VERNIEUW_MARGE_MS <= nu;

// ------------------------------------------------------------------------------------------------ eenmalige state

export type StateRecord = {
  userId: string;
  /** De lade waarin deze flow is begonnen; de terugkeer schrijft de token in diezelfde lade. Ontbrekend = 'prive'. */
  ruimte: AiRuimte;
  /** Alleen de hash; de state zelf staat alleen in de adresbalk van de eigenaar en in de terugkeer van GitHub. */
  stateHash: string;
  /** Sessie die de flow begon — de terugkeer moet uit dezelfde sessie komen. */
  sessieHash: string;
  /** Host waarop de flow begon; de terugkeer wordt alleen op deze host aangenomen. */
  host: string;
  clientId: string;
  scopeGevraagd: string;
  /** PKCE: de `code_verifier` versleuteld. Hij hoort bij deze ene flow en verdwijnt met de state. */
  verifierZegel: string;
  aangemaaktOp: number;
  verlooptOp: number;
};

/**
 * Bewaart een begonnen flow. Geeft de state én de PKCE-verifier terug: de state gaat in de URL naar GitHub, de verifier
 * blijft op de server (versleuteld in de rij) en wordt pas bij het inwisselen van de code meegestuurd.
 */
export async function stateBewaren(userId: string, gegevens: { sessieToken: string; host: string; clientId: string; scopeGevraagd: string; ruimte?: AiRuimte }): Promise<{ state: string; verifier: string }> {
  const state = nieuweState();
  const verifier = randomBytes(48).toString('base64url');
  const nu = Date.now();
  const ruimte = ruimteOf(gegevens.ruimte);
  await db.add(STATE_TABEL, [{
    userId, ruimte, stateHash: hash(state), sessieHash: hash(gegevens.sessieToken), host: gegevens.host,
    clientId: gegevens.clientId, scopeGevraagd: gegevens.scopeGevraagd,
    verifierZegel: verzegel(verifier, userId, 'oauth:verifier'), aangemaaktOp: nu, verlooptOp: nu + STATE_GELDIG_MS,
  } satisfies StateRecord]);
  return { state, verifier };
}

/** De PKCE-verifier uit een verbruikte state. '' als hij niet opengaat. */
export function stateVerifier(rij: StateRecord): string {
  try { return rij.verifierZegel ? ontzegel(rij.verifierZegel, rij.userId, 'oauth:verifier') : ''; } catch { return ''; }
}

/**
 * Haalt een begonnen flow op EN verwijdert hem meteen — ook als de rest van de terugkeer straks faalt. Daarmee is de state
 * echt eenmalig: een herhaalde of nagemaakte terugkeer met dezelfde state vindt niets meer.
 */
export async function stateVerbruiken(state: string): Promise<StateRecord | null> {
  if (!state || state.length > 200) return null;
  const gezocht = hash(state);
  const uit = await db.list<StateRecord>(STATE_TABEL, { filter: { stateHash: gezocht }, limit: 5 });
  const rijen = uit.items as Array<StateRecord & { id: string }>;
  const rij = rijen.find((r) => r.stateHash === gezocht) ?? null;
  if (rij) await db.delete(STATE_TABEL, [rij.id]);
  if (!rij || rij.verlooptOp <= Date.now()) return null;
  return rij;
}

/**
 * Alle (ook nog geldige) flows van ÉÉN lade weggooien. Dit is wat bevriezen en een eigenaarsbesluit nodig hebben: een
 * halfafgemaakte technische flow mag na het verlies van de rechten niet alsnog een token kunnen opleveren. Idempotent.
 */
export async function statesVanLadeWissen(userId: string, ruimte: AiRuimte = 'prive'): Promise<number> {
  const uit = await db.list<StateRecord>(STATE_TABEL, { filter: { userId }, limit: 200 });
  const lade = ladeVan(userId, ruimte);
  const ids = (uit.items as Array<StateRecord & { id: string }>)
    .filter((r) => hoortBij(r as unknown as { userId?: unknown; ruimte?: unknown }, lade)).map((r) => r.id);
  if (!ids.length) return 0;
  return (await db.delete(STATE_TABEL, ids)).filter(Boolean).length;
}

/** Oude, niet-afgemaakte flows weggooien (één per start, dus de tabel blijft klein). */
export async function statesOpruimen(userId: string): Promise<void> {
  const uit = await db.list<StateRecord>(STATE_TABEL, { filter: { userId }, limit: 50 });
  const oud = (uit.items as Array<StateRecord & { id: string }>).filter((r) => r.verlooptOp <= Date.now()).map((r) => r.id);
  if (oud.length) await db.delete(STATE_TABEL, oud);
}
