// KLIMOP-005 (20.11.2026, Етап 4 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Розподілені ключі, перевірюваний пороговий поділ секретів (Фельдман та Педерсен), проактивне епохальне
// оновлення часток із захистом від перерваної процедури, розподілене створення ключів без єдиного дилера (DKG)
// та двораундові порогові цифрові підписи Шнорра FROST(Ed25519, SHA-512) за стандартом RFC 9591 (§7–§10, §36, §38).
// Отримані 64-байтні порогові підписи мають канонічний формат RFC 8032 і прямо перевіряються вбудованим node:crypto.verify.
// Примітка щодо пам'яті (KLIMOP-021): одноразові буфери dScalairBuf / eScalairBuf затираються нулями одразу у 2-му раунді,
// проте арифметика великих цілих чисел BigInt та незмінних рядків у середовищі V8 не гарантує сталого часу виконання чи повного
// фізичного стирання копій в купі збирача сміття — для апаратної ізоляції на вузлах застосовується окреме сховище ключів.

import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';

// =================================================================================================
// 1. Арифметика скрученої кривої Едвардса Ed25519 (RFC 8032 §5.1) над простим полем p = 2^255 - 19
//    та простою підгрупою порядку L = 2^252 + 27742317777372353535851937790883648493.
// =================================================================================================

const VELD_P = (1n << 255n) - 19n;
export const ED25519_ORDE_L = (1n << 252n) + 27742317777372353535851937790883648493n;
const ED25519_SPKI_KOP = Buffer.from('302a300506032b6570032100', 'hex');

function mod(a: bigint, m: bigint = VELD_P): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function machtMod(grondtal: bigint, exponent: bigint, m: bigint = VELD_P): bigint {
  let res = 1n;
  let b = mod(grondtal, m);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) res = (res * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return res;
}

function invModP(a: bigint): bigint {
  const v = mod(a, VELD_P);
  if (v === 0n) throw new Error('ED25519_DELING_DOOR_NUL_MOD_P');
  return machtMod(v, VELD_P - 2n, VELD_P);
}

function invModL(a: bigint): bigint {
  const v = mod(a, ED25519_ORDE_L);
  if (v === 0n) throw new Error('ED25519_DELING_DOOR_NUL_MOD_L');
  return machtMod(v, ED25519_ORDE_L - 2n, ED25519_ORDE_L);
}

const D_CONST = mod(-121665n * invModP(121666n));
const TWEE_D = mod(2n * D_CONST);
const WORTEL_MIN_EEN = machtMod(2n, (VELD_P - 1n) / 4n, VELD_P);

interface VerlengdPunt {
  readonly X: bigint;
  readonly Y: bigint;
  readonly Z: bigint;
  readonly T: bigint;
}

const NUL_PUNT: VerlengdPunt = Object.freeze({ X: 0n, Y: 1n, Z: 1n, T: 0n });

function herstelXUitY(y: bigint, tekenBit: bigint): bigint | null {
  if (y < 0n || y >= VELD_P) return null;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D_CONST * y2 + 1n);
  const v3 = mod(v * mod(v * v));
  const v7 = mod(v3 * mod(v3 * v));
  let x = mod(mod(u * v3) * machtMod(mod(u * v7), (VELD_P - 5n) / 8n));
  const vxx = mod(v * mod(x * x));
  if (vxx === mod(-u)) {
    x = mod(x * WORTEL_MIN_EEN);
  } else if (vxx !== u) {
    return null;
  }
  if (x === 0n && tekenBit === 1n) return null;
  if ((x & 1n) !== tekenBit) x = VELD_P - x;
  return x;
}

function puntTelOp(p1: VerlengdPunt, p2: VerlengdPunt): VerlengdPunt {
  const A = mod((p1.Y - p1.X) * (p2.Y - p2.X));
  const B = mod((p1.Y + p1.X) * (p2.Y + p2.X));
  const C = mod(p1.T * mod(TWEE_D * p2.T));
  const D = mod(p1.Z * 2n * p2.Z);
  const E = mod(B - A);
  const F = mod(D - C);
  const G = mod(D + C);
  const H = mod(B + A);
  return {
    X: mod(E * F),
    Y: mod(G * H),
    Z: mod(F * G),
    T: mod(E * H),
  };
}

function puntNegatief(p: VerlengdPunt): VerlengdPunt {
  return { X: mod(-p.X), Y: p.Y, Z: p.Z, T: mod(-p.T) };
}

function puntVermenigvuldig(punt: VerlengdPunt, scalair: bigint): VerlengdPunt {
  let k = scalair;
  let basis = punt;
  if (k < 0n) {
    basis = puntNegatief(punt);
    k = -k;
  }
  let res = NUL_PUNT;
  while (k > 0n) {
    if (k & 1n) res = puntTelOp(res, basis);
    basis = puntTelOp(basis, basis);
    k >>= 1n;
  }
  return res;
}

function puntIsGelijk(p1: VerlengdPunt, p2: VerlengdPunt): boolean {
  return mod(p1.X * p2.Z) === mod(p2.X * p1.Z) && mod(p1.Y * p2.Z) === mod(p2.Y * p1.Z);
}

function puntIsNul(p: VerlengdPunt): boolean {
  return puntIsGelijk(p, NUL_PUNT);
}

function codeerPuntHex(p: VerlengdPunt): string {
  const invZ = invModP(p.Z);
  const x = mod(p.X * invZ);
  const y = mod(p.Y * invZ);
  const buf = Buffer.alloc(32);
  let v = y;
  for (let i = 0; i < 32; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  buf[31] |= Number(x & 1n) << 7;
  return buf.toString('hex');
}

function decodeerPuntHex(hex: string, staNulPuntToe = false): VerlengdPunt | null {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  const buf = Buffer.from(hex, 'hex');
  const teken = BigInt((buf[31] >> 7) & 1);
  const kopie = Buffer.from(buf);
  kopie[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(kopie[i]);
  if (y >= VELD_P) return null;
  const x = herstelXUitY(y, teken);
  if (x === null) return null;
  const p: VerlengdPunt = { X: x, Y: y, Z: 1n, T: mod(x * y) };
  if (puntIsNul(p)) return staNulPuntToe ? p : null;
  // Сувора перевірка належності простій підгрупі порядку L (захист від підміни точкою малої підгрупи)
  if (!puntIsNul(puntVermenigvuldig(p, ED25519_ORDE_L))) return null;
  return p;
}

function codeerScalairHex(s: bigint): string {
  const buf = Buffer.alloc(32);
  let v = mod(s, ED25519_ORDE_L);
  for (let i = 0; i < 32; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf.toString('hex');
}

function decodeerScalairHex(hex: string): bigint | null {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  const buf = Buffer.from(hex, 'hex');
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(buf[i]);
  if (v >= ED25519_ORDE_L) return null;
  return v;
}

function leesHash512ModL(digest: Buffer): bigint {
  let v = 0n;
  for (let i = digest.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(digest[i]);
  return mod(v, ED25519_ORDE_L);
}

function willekeurigeNietNulScalair(): bigint {
  while (true) {
    const s = leesHash512ModL(randomBytes(64));
    if (s !== 0n) return s;
  }
}

const BASIS_BY = mod(4n * invModP(5n));
const BASIS_BX = herstelXUitY(BASIS_BY, 0n)!;
const GENERATOR_B: VerlengdPunt = Object.freeze({
  X: BASIS_BX,
  Y: BASIS_BY,
  Z: 1n,
  T: mod(BASIS_BX * BASIS_BY),
});

/**
 * Другий незалежний генератор H для приховувальних зобов'язань Педерсена («нічого у рукаві»):
 * виводиться з відкритого рядка SHA-512 і множення на кофактор 8 без відомого дискретного логарифма log_B(H).
 */
const GENERATOR_H: VerlengdPunt = (() => {
  for (let teller = 0; teller < 256; teller++) {
    const h = createHash('sha512')
      .update(`klimop-pedersen-generator-H-ed25519-v1|teller:${teller}`, 'utf8')
      .digest();
    const kandidaat = Buffer.from(h.subarray(0, 32));
    kandidaat[31] &= 0x7f;
    let y = 0n;
    for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(kandidaat[i]);
    if (y >= VELD_P) continue;
    const x = herstelXUitY(y, 0n);
    if (x === null) continue;
    const ruwPunt: VerlengdPunt = { X: x, Y: y, Z: 1n, T: mod(x * y) };
    // Відтинаємо кофактор 8, щоб отримати точку точно простого порядку L
    const vrijVanCofactor = puntVermenigvuldig(ruwPunt, 8n);
    if (!puntIsNul(vrijVanCofactor) && puntIsNul(puntVermenigvuldig(vrijVanCofactor, ED25519_ORDE_L))) {
      return Object.freeze(vrijVanCofactor);
    }
  }
  throw new Error('PEDERSEN_GENERATOR_H_NIET_GEVONDEN');
})();

/** Пакує 32-байтний публічний ключ групи Ed25519 (64 hex) у стандартний SPKI DER у base64url. */
export function pakEd25519PubliekeSleutelSpkiIn(groepsPubliekeSleutelHex: string): string {
  if (!decodeerPuntHex(groepsPubliekeSleutelHex)) {
    throw new Error('ONGELDIGE_ED25519_PUBLIEKE_SLEUTEL');
  }
  return Buffer.concat([ED25519_SPKI_KOP, Buffer.from(groepsPubliekeSleutelHex, 'hex')]).toString('base64url');
}

/** Перевіряє 64-байтний підпис Ed25519 стандартним вбудованим ядром OpenSSL (`node:crypto.verify`). */
export function verifieerStandaardEd25519Handtekening(
  boodschap: Buffer,
  handtekeningHex: string,
  groepsPubliekeSleutelHex: string,
): boolean {
  if (!/^[0-9a-f]{128}$/i.test(handtekeningHex)) return false;
  try {
    const spkiB64u = pakEd25519PubliekeSleutelSpkiIn(groepsPubliekeSleutelHex);
    const pub = createPublicKey({
      key: Buffer.from(spkiB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, boodschap, pub, Buffer.from(handtekeningHex, 'hex'));
  } catch {
    return false;
  }
}

// =================================================================================================
// 2. Перевірюваний пороговий поділ секретів Фельдмана (Feldman VSS) та Педерсена (Pedersen VSS)
// =================================================================================================

export interface FeldmanVssDeel {
  schema: 1;
  setId: string;
  epoche: number;
  index: number; // 1..n
  drempel: number;
  totaal: number;
  scalairHex: string; // s_i = f(i) mod L (32 байти little-endian у hex)
  toezeggingenHex: readonly string[]; // C_0 .. C_{t-1}, де C_j = a_j * B
}

export interface PedersenVssDeel {
  schema: 1;
  setId: string;
  epoche: number;
  index: number;
  drempel: number;
  totaal: number;
  scalairHex: string;       // s_i = f(i) mod L
  blindheidScalairHex: string; // r_i = g(i) mod L
  toezeggingenHex: readonly string[]; // P_0 .. P_{t-1}, де P_j = a_j * B + b_j * H
}

function evalueerPolynoomModL(coeffs: readonly bigint[], x: bigint): bigint {
  let y = 0n;
  for (let j = coeffs.length - 1; j >= 0; j--) {
    y = mod(y * x + coeffs[j], ED25519_ORDE_L);
  }
  return y;
}

function lagrangeNulCoeffModL(indexen: readonly number[], eigenIndex: number): bigint {
  const xi = BigInt(eigenIndex);
  let teller = 1n;
  let noemer = 1n;
  for (const j of indexen) {
    if (j === eigenIndex) continue;
    const xj = BigInt(j);
    teller = mod(teller * xj, ED25519_ORDE_L);
    noemer = mod(noemer * (xj - xi), ED25519_ORDE_L);
  }
  return mod(teller * invModL(noemer), ED25519_ORDE_L);
}

/** Перетворює 32-байтний буфер (або скаляр у hex) на дійсний секретний скаляр підгрупи [1, L - 1]. */
export function leidGeheimScalairAf(invoer: Buffer | string): string {
  if (typeof invoer === 'string') {
    const s = decodeerScalairHex(invoer);
    if (s === null || s === 0n) throw new Error('GEHEIM_SCALAIR_ONGELDIG');
    return codeerScalairHex(s);
  }
  if (!Buffer.isBuffer(invoer) || invoer.length < 16) throw new Error('GEHEIM_BUFFER_TE_KORT');
  const h = createHash('sha512').update('klimop-scalair-v1|').update(invoer).digest();
  const s = leesHash512ModL(h);
  return codeerScalairHex(s === 0n ? 1n : s);
}

/**
 * Розщеплює секретний скаляр за перевірюваною схемою Фельдмана (Feldman VSS, §7–§8 маніфесту):
 * кожен учасник може перевірити справжність своєї частки за публічними точками C_j = a_j * B без розкриття секрету.
 */
export function splitsMetFeldmanVss(opties: {
  geheimScalairHex: string;
  drempel: number;
  totaal: number;
  setId: string;
  epoche?: number;
}): { groepsPubliekeSleutelHex: string; toezeggingenHex: string[]; delen: FeldmanVssDeel[] } {
  const s0 = decodeerScalairHex(opties.geheimScalairHex);
  if (s0 === null || s0 === 0n) throw new Error('GEHEIM_SCALAIR_ONGELDIG');
  const { drempel, totaal } = opties;
  if (!Number.isInteger(drempel) || !Number.isInteger(totaal) || drempel < 2 || totaal < drempel || totaal > 64) {
    throw new Error('DREMPEL_PARAMETERS_ONGELDIG');
  }
  const epoche = opties.epoche ?? 1;
  if (!Number.isInteger(epoche) || epoche < 1) throw new Error('EPOCHE_ONGELDIG');

  const coeffs: bigint[] = [s0];
  for (let j = 1; j < drempel; j++) coeffs.push(willekeurigeNietNulScalair());

  const toezeggingenHex = coeffs.map((a) => codeerPuntHex(puntVermenigvuldig(GENERATOR_B, a)));
  const delen: FeldmanVssDeel[] = [];
  for (let i = 1; i <= totaal; i++) {
    const si = evalueerPolynoomModL(coeffs, BigInt(i));
    delen.push({
      schema: 1,
      setId: opties.setId,
      epoche,
      index: i,
      drempel,
      totaal,
      scalairHex: codeerScalairHex(si),
      toezeggingenHex,
    });
  }

  return {
    groepsPubliekeSleutelHex: toezeggingenHex[0],
    toezeggingenHex,
    delen,
  };
}

/** Перевіряє частку Фельдмана за рівністю s_i * B == Sum_{j=0}^{t-1} i^j * C_j без розкриття секрету. */
export function verifieerFeldmanDeel(deel: FeldmanVssDeel): { ok: true; deelnemerPubliekeSleutelHex: string } | { ok: false; fout: string } {
  if (!deel || deel.schema !== 1 || deel.index < 1 || deel.index > deel.totaal || deel.toezeggingenHex.length !== deel.drempel) {
    return { ok: false, fout: 'FELDMAN_DEEL_VORM_ONGELDIG' };
  }
  const si = decodeerScalairHex(deel.scalairHex);
  if (si === null) return { ok: false, fout: 'FELDMAN_SCALAIR_ONGELDIG' };

  const links = puntVermenigvuldig(GENERATOR_B, si);
  let rechts = NUL_PUNT;
  const xi = BigInt(deel.index);
  let xMacht = 1n;

  for (let j = 0; j < deel.toezeggingenHex.length; j++) {
    const cj = decodeerPuntHex(deel.toezeggingenHex[j], j > 0);
    if (!cj) return { ok: false, fout: 'FELDMAN_TOEZEGGING_PUNT_ONGELDIG' };
    rechts = puntTelOp(rechts, puntVermenigvuldig(cj, xMacht));
    xMacht = mod(xMacht * xi, ED25519_ORDE_L);
  }

  if (!puntIsGelijk(links, rechts)) {
    return { ok: false, fout: 'FELDMAN_TOEZEGGING_KLOPT_NIET' };
  }
  return { ok: true, deelnemerPubliekeSleutelHex: codeerPuntHex(links) };
}

/** Відновлює секретний скаляр з будь-яких t перевірених часток Фельдмана однієї епохи. */
export function herstelUitFeldmanDelen(
  delen: readonly FeldmanVssDeel[],
): { ok: true; geheimScalairHex: string } | { ok: false; fout: string } {
  if (!Array.isArray(delen) || delen.length < 2) return { ok: false, fout: 'ONVOLDOENDE_DELEN' };
  const eerste = delen[0];
  if (delen.some((d) => d.setId !== eerste.setId || d.drempel !== eerste.drempel)) {
    return { ok: false, fout: 'DELEN_SET_KOMT_NIET_OVEREEN' };
  }
  if (delen.some((d) => d.epoche !== eerste.epoche)) {
    return { ok: false, fout: 'EPOCHE_VAN_DELEN_VERSCHILT' };
  }
  if (delen.some((d) => JSON.stringify(d.toezeggingenHex) !== JSON.stringify(eerste.toezeggingenHex))) {
    return { ok: false, fout: 'TEGENSTRIJDIGE_TOEZEGGINGEN_TUSSEN_DELEN' };
  }

  const uniek: FeldmanVssDeel[] = [];
  const gezieneIndexen = new Set<number>();
  for (const d of delen) {
    if (gezieneIndexen.has(d.index)) continue;
    const v = verifieerFeldmanDeel(d);
    if (!v.ok) return v;
    gezieneIndexen.add(d.index);
    uniek.push(d);
    if (uniek.length === eerste.drempel) break;
  }
  if (uniek.length < eerste.drempel) return { ok: false, fout: 'ONVOLDOENDE_GELDIGE_DELEN' };

  const indexLijst = uniek.map((u) => u.index);
  let hersteld = 0n;
  for (const u of uniek) {
    const lambda = lagrangeNulCoeffModL(indexLijst, u.index);
    const si = decodeerScalairHex(u.scalairHex)!;
    hersteld = mod(hersteld + mod(lambda * si, ED25519_ORDE_L), ED25519_ORDE_L);
  }

  const verwachteC0 = decodeerPuntHex(eerste.toezeggingenHex[0]);
  if (!verwachteC0 || !puntIsGelijk(puntVermenigvuldig(GENERATOR_B, hersteld), verwachteC0)) {
    return { ok: false, fout: 'HERSTELD_GEHEIM_KOMT_NIET_OVEREEN_MET_C0' };
  }
  return { ok: true, geheimScalairHex: codeerScalairHex(hersteld) };
}

/**
 * Інформаційно-теоретично приховувальний перевірюваний поділ Педерсена (Pedersen VSS, §8 маніфесту):
 * публічні зобов'язання P_j = a_j * B + b_j * H повністю приховують секрет навіть від необмеженого супротивника,
 * але дозволяють кожному учаснику строго перевірити пару (s_i, r_i).
 */
export function splitsMetPedersenVss(opties: {
  geheimScalairHex: string;
  drempel: number;
  totaal: number;
  setId: string;
  epoche?: number;
}): { toezeggingenHex: string[]; delen: PedersenVssDeel[] } {
  const s0 = decodeerScalairHex(opties.geheimScalairHex);
  if (s0 === null || s0 === 0n) throw new Error('GEHEIM_SCALAIR_ONGELDIG');
  const { drempel, totaal } = opties;
  if (!Number.isInteger(drempel) || !Number.isInteger(totaal) || drempel < 2 || totaal < drempel || totaal > 64) {
    throw new Error('DREMPEL_PARAMETERS_ONGELDIG');
  }
  const epoche = opties.epoche ?? 1;

  const coeffsF: bigint[] = [s0];
  const coeffsG: bigint[] = [willekeurigeNietNulScalair()];
  for (let j = 1; j < drempel; j++) {
    coeffsF.push(willekeurigeNietNulScalair());
    coeffsG.push(willekeurigeNietNulScalair());
  }

  const toezeggingenHex = coeffsF.map((aj, j) => {
    const p = puntTelOp(
      puntVermenigvuldig(GENERATOR_B, aj),
      puntVermenigvuldig(GENERATOR_H, coeffsG[j]),
    );
    return codeerPuntHex(p);
  });

  const delen: PedersenVssDeel[] = [];
  for (let i = 1; i <= totaal; i++) {
    const xi = BigInt(i);
    delen.push({
      schema: 1,
      setId: opties.setId,
      epoche,
      index: i,
      drempel,
      totaal,
      scalairHex: codeerScalairHex(evalueerPolynoomModL(coeffsF, xi)),
      blindheidScalairHex: codeerScalairHex(evalueerPolynoomModL(coeffsG, xi)),
      toezeggingenHex,
    });
  }

  return { toezeggingenHex, delen };
}

/** Перевіряє частку Педерсена за рівністю s_i * B + r_i * H == Sum_{j=0}^{t-1} i^j * P_j. */
export function verifieerPedersenDeel(deel: PedersenVssDeel): { ok: true } | { ok: false; fout: string } {
  if (!deel || deel.schema !== 1 || deel.index < 1 || deel.index > deel.totaal || deel.toezeggingenHex.length !== deel.drempel) {
    return { ok: false, fout: 'PEDERSEN_DEEL_VORM_ONGELDIG' };
  }
  const si = decodeerScalairHex(deel.scalairHex);
  const ri = decodeerScalairHex(deel.blindheidScalairHex);
  if (si === null || ri === null) return { ok: false, fout: 'PEDERSEN_SCALAIR_ONGELDIG' };

  const links = puntTelOp(
    puntVermenigvuldig(GENERATOR_B, si),
    puntVermenigvuldig(GENERATOR_H, ri),
  );
  let rechts = NUL_PUNT;
  const xi = BigInt(deel.index);
  let xMacht = 1n;

  for (const pHex of deel.toezeggingenHex) {
    const pj = decodeerPuntHex(pHex, true);
    if (!pj) return { ok: false, fout: 'PEDERSEN_TOEZEGGING_PUNT_ONGELDIG' };
    rechts = puntTelOp(rechts, puntVermenigvuldig(pj, xMacht));
    xMacht = mod(xMacht * xi, ED25519_ORDE_L);
  }

  return puntIsGelijk(links, rechts) ? { ok: true } : { ok: false, fout: 'PEDERSEN_TOEZEGGING_KLOPT_NIET' };
}

/** Відновлює секрет із t перевірених часток Педерсена однієї епохи зі звіркою приховувального зобов'язання P_0. */
export function herstelUitPedersenDelen(
  delen: readonly PedersenVssDeel[],
): { ok: true; geheimScalairHex: string } | { ok: false; fout: string } {
  if (!Array.isArray(delen) || delen.length < 2) return { ok: false, fout: 'ONVOLDOENDE_DELEN' };
  const eerste = delen[0];
  if (delen.some((d) => d.setId !== eerste.setId || d.drempel !== eerste.drempel || d.epoche !== eerste.epoche)) {
    return { ok: false, fout: 'PEDERSEN_DELEN_NIET_COMPATIBEL' };
  }
  const uniek: PedersenVssDeel[] = [];
  const geziene = new Set<number>();
  for (const d of delen) {
    if (geziene.has(d.index)) continue;
    const v = verifieerPedersenDeel(d);
    if (!v.ok) return v;
    geziene.add(d.index);
    uniek.push(d);
    if (uniek.length === eerste.drempel) break;
  }
  if (uniek.length < eerste.drempel) return { ok: false, fout: 'ONVOLDOENDE_GELDIGE_DELEN' };

  const indexLijst = uniek.map((u) => u.index);
  let s0 = 0n;
  let r0 = 0n;
  for (const u of uniek) {
    const lambda = lagrangeNulCoeffModL(indexLijst, u.index);
    s0 = mod(s0 + mod(lambda * decodeerScalairHex(u.scalairHex)!, ED25519_ORDE_L), ED25519_ORDE_L);
    r0 = mod(r0 + mod(lambda * decodeerScalairHex(u.blindheidScalairHex)!, ED25519_ORDE_L), ED25519_ORDE_L);
  }

  const p0 = decodeerPuntHex(eerste.toezeggingenHex[0], true);
  const verwachtP0 = puntTelOp(puntVermenigvuldig(GENERATOR_B, s0), puntVermenigvuldig(GENERATOR_H, r0));
  if (!p0 || !puntIsGelijk(p0, verwachtP0)) {
    return { ok: false, fout: 'PEDERSEN_HERSTEL_KOMT_NIET_OVEREEN_MET_P0' };
  }
  return { ok: true, geheimScalairHex: codeerScalairHex(s0) };
}

// =================================================================================================
// 3. Епохальне проактивне оновлення часток без збирання секрету (Herzberg et al., §9 маніфесту)
//    із двофазною підготовкою та безпечним відкочуванням при перерваній процедурі.
// =================================================================================================

export interface ProactieveNulBijdrage {
  schema: 1;
  setId: string;
  vanEpoche: number;
  naarEpoche: number;
  afzenderIndex: number;
  drempel: number;
  totaal: number;
  /** Зобов'язання для коефіцієнтів j = 1 .. (t - 1); вільний член j = 0 дорівнює нулю! */
  nulToezeggingenVanaf1Hex: readonly string[];
  /** Підчастки delta_k(i) для кожного отримувача i = 1..n. */
  subdelenPerOntvanger: Readonly<Record<number, string>>;
}

export interface VoorbereideEpocheStaat {
  huidigDeel: FeldmanVssDeel;
  kandidaatNieuwDeel: FeldmanVssDeel;
}

/** Генерує нульовий оновлювальний поліном delta(0) = 0, який змінює всі частки, не змінюючи самого секрету. */
export function maakProactieveNulBijdrage(opties: {
  setId: string;
  vanEpoche: number;
  afzenderIndex: number;
  drempel: number;
  totaal: number;
}): ProactieveNulBijdrage {
  if (opties.drempel < 2 || opties.totaal < opties.drempel) {
    throw new Error('DREMPEL_PARAMETERS_ONGELDIG');
  }
  const coeffs: bigint[] = [0n];
  for (let j = 1; j < opties.drempel; j++) coeffs.push(willekeurigeNietNulScalair());

  const nulToezeggingenVanaf1Hex = coeffs.slice(1).map((c) => codeerPuntHex(puntVermenigvuldig(GENERATOR_B, c)));
  const subdelenPerOntvanger: Record<number, string> = {};
  for (let i = 1; i <= opties.totaal; i++) {
    subdelenPerOntvanger[i] = codeerScalairHex(evalueerPolynoomModL(coeffs, BigInt(i)));
  }

  return {
    schema: 1,
    setId: opties.setId,
    vanEpoche: opties.vanEpoche,
    naarEpoche: opties.vanEpoche + 1,
    afzenderIndex: opties.afzenderIndex,
    drempel: opties.drempel,
    totaal: opties.totaal,
    nulToezeggingenVanaf1Hex,
    subdelenPerOntvanger,
  };
}

/** Перевіряє, що оновлювальний вклад для отримувача `ontvangerIndex` дійсно відповідає нульовому вільному члену. */
export function verifieerProactieveNulBijdrageVoorOntvanger(
  bijdrage: ProactieveNulBijdrage,
  ontvangerIndex: number,
): { ok: true } | { ok: false; fout: string } {
  if (
    !bijdrage
    || bijdrage.schema !== 1
    || bijdrage.naarEpoche !== bijdrage.vanEpoche + 1
    || bijdrage.nulToezeggingenVanaf1Hex.length !== bijdrage.drempel - 1
  ) {
    return { ok: false, fout: 'PROACTIEVE_BIJDRAGE_VORM_ONGELDIG' };
  }
  const deltaHex = bijdrage.subdelenPerOntvanger[ontvangerIndex];
  const delta = deltaHex ? decodeerScalairHex(deltaHex) : null;
  if (delta === null) return { ok: false, fout: 'PROACTIEF_SUBDEEL_ONTBREEKT_OF_ONGELDIG' };

  const links = puntVermenigvuldig(GENERATOR_B, delta);
  let rechts = NUL_PUNT; // Вільний член при j=0 строго дорівнює NUL_PUNT (0 * B)!
  const xi = BigInt(ontvangerIndex);
  let xMacht = xi;

  for (const puntHex of bijdrage.nulToezeggingenVanaf1Hex) {
    const dp = decodeerPuntHex(puntHex, true);
    if (!dp) return { ok: false, fout: 'PROACTIEVE_TOEZEGGING_PUNT_ONGELDIG' };
    rechts = puntTelOp(rechts, puntVermenigvuldig(dp, xMacht));
    xMacht = mod(xMacht * xi, ED25519_ORDE_L);
  }

  return puntIsGelijk(links, rechts) ? { ok: true } : { ok: false, fout: 'PROACTIEVE_NULBIJDRAGE_VERVALST' };
}

/**
 * Крок 1 двофазного оновлення епохи: перевіряє всі оновлювальні вклади та готує нову частку епохи (e + 1),
 * зберігаючи поточну частку епохи e недоторканою на випадок перерваної мережевої процедури (§9 маніфесту).
 */
export function bereidEpocheVerversingVoor(
  huidigDeel: FeldmanVssDeel,
  bijdragen: readonly ProactieveNulBijdrage[],
): { ok: true; staat: VoorbereideEpocheStaat } | { ok: false; fout: string } {
  const hv = verifieerFeldmanDeel(huidigDeel);
  if (!hv.ok) return hv;
  if (!Array.isArray(bijdragen) || bijdragen.length === 0) {
    return { ok: false, fout: 'GEEN_PROACTIEVE_BIJDRAGEN' };
  }

  let nieuwScalair = decodeerScalairHex(huidigDeel.scalairHex)!;
  const nieuweToezeggingen: VerlengdPunt[] = huidigDeel.toezeggingenHex.map((h, idx) => decodeerPuntHex(h, idx > 0)!);

  const gezieneAfzenders = new Set<number>();
  for (const b of bijdragen) {
    if (
      b.setId !== huidigDeel.setId
      || b.vanEpoche !== huidigDeel.epoche
      || b.drempel !== huidigDeel.drempel
      || b.totaal !== huidigDeel.totaal
      || gezieneAfzenders.has(b.afzenderIndex)
    ) {
      return { ok: false, fout: 'PROACTIEVE_BIJDRAGE_CONTEXT_FOUT' };
    }
    const v = verifieerProactieveNulBijdrageVoorOntvanger(b, huidigDeel.index);
    if (!v.ok) return v;
    gezieneAfzenders.add(b.afzenderIndex);

    const delta = decodeerScalairHex(b.subdelenPerOntvanger[huidigDeel.index])!;
    nieuwScalair = mod(nieuwScalair + delta, ED25519_ORDE_L);
    for (let j = 1; j < huidigDeel.drempel; j++) {
      const dp = decodeerPuntHex(b.nulToezeggingenVanaf1Hex[j - 1], true)!;
      nieuweToezeggingen[j] = puntTelOp(nieuweToezeggingen[j], dp);
    }
  }

  const kandidaatNieuwDeel: FeldmanVssDeel = {
    schema: 1,
    setId: huidigDeel.setId,
    epoche: huidigDeel.epoche + 1,
    index: huidigDeel.index,
    drempel: huidigDeel.drempel,
    totaal: huidigDeel.totaal,
    scalairHex: codeerScalairHex(nieuwScalair),
    toezeggingenHex: nieuweToezeggingen.map((p) => codeerPuntHex(p)),
  };

  const kv = verifieerFeldmanDeel(kandidaatNieuwDeel);
  if (!kv.ok) return kv;

  return {
    ok: true,
    staat: { huidigDeel, kandidaatNieuwDeel },
  };
}

/** Крок 2 двофазного оновлення: підтверджує перехід на нову епоху або безпечно відкочує при скасуванні. */
export function rondEpocheVerversingAf(
  staat: VoorbereideEpocheStaat,
  actie: 'bevestig' | 'afbreken',
): FeldmanVssDeel {
  return actie === 'bevestig' ? staat.kandidaatNieuwDeel : staat.huidigDeel;
}

// =================================================================================================
// 4. Розподілене створення ключів без єдиного дилера (DKG) та двораундовий пороговий підпис
//    Шнорра FROST(Ed25519, SHA-512) за стандартом RFC 9591 (§10 маніфесту).
// =================================================================================================

export interface DkgRondePakket {
  schema: 1;
  setId: string;
  afzenderIndex: number; // 1..n
  drempel: number;
  totaal: number;
  toezeggingenHex: readonly string[]; // C_{m,0} .. C_{m,t-1}
  subdelenPerOntvanger: Readonly<Record<number, string>>;
}

export function maakDkgDeelnemerBijdrage(opties: {
  setId: string;
  afzenderIndex: number;
  drempel: number;
  totaal: number;
}): DkgRondePakket {
  const eigenGeheim = codeerScalairHex(willekeurigeNietNulScalair());
  const gesplitst = splitsMetFeldmanVss({
    geheimScalairHex: eigenGeheim,
    drempel: opties.drempel,
    totaal: opties.totaal,
    setId: opties.setId,
    epoche: 1,
  });
  const subdelenPerOntvanger: Record<number, string> = {};
  for (const d of gesplitst.delen) {
    subdelenPerOntvanger[d.index] = d.scalairHex;
  }
  return {
    schema: 1,
    setId: opties.setId,
    afzenderIndex: opties.afzenderIndex,
    drempel: opties.drempel,
    totaal: opties.totaal,
    toezeggingenHex: gesplitst.toezeggingenHex,
    subdelenPerOntvanger,
  };
}

/**
 * Перевіряє вклади всіх n учасників DKG для вузла `ontvangerIndex` та збирає його підсумкову частку Фельдмана,
 * груповий публічний ключ Ed25519 і публічні ключі перевірки всіх учасників без існування повного закритого ключа.
 */
export function combineerDkgBijdragenVoorDeelnemer(
  ontvangerIndex: number,
  alleBijdragen: readonly DkgRondePakket[],
):
  | {
      ok: true;
      deel: FeldmanVssDeel;
      groepsPubliekeSleutelHex: string;
      groepsPubliekeSleutelSpkiB64u: string;
      deelnemerPubliekeSleutelsHex: Record<number, string>;
    }
  | { ok: false; fout: string; verdachteAfzenderIndex?: number } {
  if (!Array.isArray(alleBijdragen) || alleBijdragen.length < 2) {
    return { ok: false, fout: 'DKG_ONVOLDOENDE_DEELNEMERS' };
  }
  const eerste = alleBijdragen[0];
  if (alleBijdragen.length !== eerste.totaal) {
    return { ok: false, fout: 'DKG_NIET_ALLE_BIJDRAGEN_AANWEZIG' };
  }

  let somScalair = 0n;
  const somToezeggingen: VerlengdPunt[] = Array.from({ length: eerste.drempel }, () => NUL_PUNT);
  const geziene = new Set<number>();

  for (const pakket of alleBijdragen) {
    if (
      pakket.setId !== eerste.setId
      || pakket.drempel !== eerste.drempel
      || pakket.totaal !== eerste.totaal
      || geziene.has(pakket.afzenderIndex)
    ) {
      return { ok: false, fout: 'DKG_BIJDRAGE_CONTEXT_ONGELDIG' };
    }
    geziene.add(pakket.afzenderIndex);

    const subHex = pakket.subdelenPerOntvanger[ontvangerIndex];
    if (!subHex) {
      return { ok: false, fout: 'DKG_SUBDEEL_ONTBREEKT', verdachteAfzenderIndex: pakket.afzenderIndex };
    }
    const proefDeel: FeldmanVssDeel = {
      schema: 1,
      setId: pakket.setId,
      epoche: 1,
      index: ontvangerIndex,
      drempel: pakket.drempel,
      totaal: pakket.totaal,
      scalairHex: subHex,
      toezeggingenHex: pakket.toezeggingenHex,
    };
    const v = verifieerFeldmanDeel(proefDeel);
    if (!v.ok) {
      return { ok: false, fout: 'DKG_SUBDEEL_VERVALST', verdachteAfzenderIndex: pakket.afzenderIndex };
    }

    somScalair = mod(somScalair + decodeerScalairHex(subHex)!, ED25519_ORDE_L);
    for (let j = 0; j < eerste.drempel; j++) {
      somToezeggingen[j] = puntTelOp(somToezeggingen[j], decodeerPuntHex(pakket.toezeggingenHex[j], j > 0)!);
    }
  }

  const gecombineerdeToezeggingenHex = somToezeggingen.map((p) => codeerPuntHex(p));
  const deel: FeldmanVssDeel = {
    schema: 1,
    setId: eerste.setId,
    epoche: 1,
    index: ontvangerIndex,
    drempel: eerste.drempel,
    totaal: eerste.totaal,
    scalairHex: codeerScalairHex(somScalair),
    toezeggingenHex: gecombineerdeToezeggingenHex,
  };

  const deelnemerPubliekeSleutelsHex: Record<number, string> = {};
  for (let i = 1; i <= eerste.totaal; i++) {
    let yi = NUL_PUNT;
    const xi = BigInt(i);
    let xMacht = 1n;
    for (let j = 0; j < eerste.drempel; j++) {
      yi = puntTelOp(yi, puntVermenigvuldig(somToezeggingen[j], xMacht));
      xMacht = mod(xMacht * xi, ED25519_ORDE_L);
    }
    deelnemerPubliekeSleutelsHex[i] = codeerPuntHex(yi);
  }

  const groepsPubliekeSleutelHex = gecombineerdeToezeggingenHex[0];
  return {
    ok: true,
    deel,
    groepsPubliekeSleutelHex,
    groepsPubliekeSleutelSpkiB64u: pakEd25519PubliekeSleutelSpkiIn(groepsPubliekeSleutelHex),
    deelnemerPubliekeSleutelsHex,
  };
}

/** Обчислює публічні ключі перевірки всіх учасників Y_i = Sum_{j=0}^{t-1} i^j * C_j за вектором зобов'язань Фельдмана. */
export function berekenDeelnemerPubliekeSleutelsUitToezeggingen(
  toezeggingenHex: readonly string[],
  totaal: number,
): Record<number, string> {
  const punten = toezeggingenHex.map((h, idx) => {
    const p = decodeerPuntHex(h, idx > 0);
    if (!p) throw new Error('ONGELDIGE_FELDMAN_TOEZEGGING');
    return p;
  });
  const uit: Record<number, string> = {};
  for (let i = 1; i <= totaal; i++) {
    let yi = NUL_PUNT;
    const xi = BigInt(i);
    let xMacht = 1n;
    for (const cj of punten) {
      yi = puntTelOp(yi, puntVermenigvuldig(cj, xMacht));
      xMacht = mod(xMacht * xi, ED25519_ORDE_L);
    }
    uit[i] = codeerPuntHex(yi);
  }
  return uit;
}

// =================================================================================================
// Двораундовий пороговий підпис Шнорра FROST(Ed25519, SHA-512) за RFC 9591
// =================================================================================================

export interface FrostRonde1PubliekeToezegging {
  deelnemerIndex: number;
  schuilPuntDHex: string; // D_i = d_i * B
  bindPuntEHex: string;   // E_i = e_i * B
}

export interface FrostGeheimeNonceStaat {
  readonly deelnemerIndex: number;
  dScalairBuf: Buffer; // 32 байти (затирається нулями одразу після Раунду 2!)
  eScalairBuf: Buffer; // 32 байти (затирається нулями одразу після Раунду 2!)
  verbruikt: boolean;
}

export interface FrostRonde2DeelHandtekening {
  deelnemerIndex: number;
  zDeelHex: string; // z_i = d_i + e_i * rho_i + lambda_i * s_i * c (mod L)
}

/**
 * Рядок контексту набору шифрів FROST(Ed25519, SHA-512) за RFC 9591 §6.1.
 * KLIMOP-019: раніше вживалися власні роздільники «|msg|», «|com|», «|rho|» та 4-байтові індекси,
 * через що зобов'язання й частки підпису не збігалися з еталонними векторами RFC 9591 додатка E.1.
 */
export const FROST_ED25519_KONTEKST = 'FROST-ED25519-SHA512-v1';

/** H1, H3 (з mod L) та H4, H5 (сирий відбиток) RFC 9591 §6.1: SHA-512(контекст || мітка || m). */
function frostHash(mitka: 'rho' | 'nonce' | 'msg' | 'com', ...delen: Buffer[]): Buffer {
  const h = createHash('sha512').update(FROST_ED25519_KONTEKST, 'utf8').update(mitka, 'utf8');
  for (const d of delen) h.update(d);
  return h.digest();
}

/** Ідентифікатор учасника RFC 9591 §4.1: ненульовий скаляр, закодований як 32 байти little-endian. */
function codeerFrostIdentificator(deelnemerIndex: number): Buffer {
  if (!Number.isInteger(deelnemerIndex) || deelnemerIndex < 1) {
    throw new Error('FROST_DEELNEMER_INDEX_ONGELDIG');
  }
  return Buffer.from(codeerScalairHex(BigInt(deelnemerIndex)), 'hex');
}

/** encode_group_commitment_list RFC 9591 §4.3: послідовність id(32) || D(32) || E(32) за зростанням id. */
function codeerFrostToezeggingenLijst(gesorteerd: readonly FrostRonde1PubliekeToezegging[]): Buffer {
  return Buffer.concat(
    gesorteerd.flatMap((t) => [
      codeerFrostIdentificator(t.deelnemerIndex),
      Buffer.from(t.schuilPuntDHex, 'hex'),
      Buffer.from(t.bindPuntEHex, 'hex'),
    ]),
  );
}

/**
 * nonce_generate RFC 9591 §4.1: H3(random_bytes(32) || SerializeScalar(secret)).
 * Прив'язка до закритої частки захищає від повторення нонса навіть за слабкого джерела випадковості.
 * `willekeur` передається явно лише в перевірці еталонним вектором; у роботі завжди береться `randomBytes(32)`.
 */
export function frostNonceGenereer(deelScalairHex: string, willekeur?: Buffer): string {
  const geheim = decodeerScalairHex(deelScalairHex);
  if (geheim === null || geheim === 0n) throw new Error('FROST_SCALAIR_ONGELDIG');
  const ruis = willekeur ?? randomBytes(32);
  if (!Buffer.isBuffer(ruis) || ruis.length !== 32) throw new Error('FROST_WILLEKEUR_LENGTE_ONGELDIG');
  const nonce = leesHash512ModL(frostHash('nonce', ruis, Buffer.from(codeerScalairHex(geheim), 'hex')));
  return codeerScalairHex(nonce);
}

export interface FrostBindingFactorVerslag {
  /** PK || H4(msg) || H5(encode_group_commitment_list) — спільний префікс входу RFC 9591 §4.4. */
  invoerVoorvoegselHex: string;
  perDeelnemer: Array<{ deelnemerIndex: number; invoerHex: string; bindingFactorHex: string }>;
}

function berekenFrostBindingFactoren(
  boodschap: Buffer,
  gesorteerdeToezeggingen: readonly FrostRonde1PubliekeToezegging[],
  groepsPubliekeSleutelHex: string,
): { rhoPerIndex: Map<number, bigint>; verslag: FrostBindingFactorVerslag } {
  const voorvoegsel = Buffer.concat([
    Buffer.from(groepsPubliekeSleutelHex, 'hex'),
    frostHash('msg', boodschap),
    frostHash('com', codeerFrostToezeggingenLijst(gesorteerdeToezeggingen)),
  ]);
  const rhoPerIndex = new Map<number, bigint>();
  const perDeelnemer: FrostBindingFactorVerslag['perDeelnemer'] = [];
  for (const t of gesorteerdeToezeggingen) {
    const invoer = Buffer.concat([voorvoegsel, codeerFrostIdentificator(t.deelnemerIndex)]);
    const rho = leesHash512ModL(frostHash('rho', invoer));
    rhoPerIndex.set(t.deelnemerIndex, rho);
    perDeelnemer.push({
      deelnemerIndex: t.deelnemerIndex,
      invoerHex: invoer.toString('hex'),
      bindingFactorHex: codeerScalairHex(rho),
    });
  }
  return { rhoPerIndex, verslag: { invoerVoorvoegselHex: voorvoegsel.toString('hex'), perDeelnemer } };
}

/**
 * Відкрито обчислює входи й коефіцієнти прив'язки RFC 9591 §4.4 для порівняння з еталонним вектором
 * або з незалежною реалізацією. Не потребує жодних закритих даних.
 */
export function berekenFrostBindingFactorenRfc9591(opties: {
  boodschap: Buffer;
  toezeggingenLijst: readonly FrostRonde1PubliekeToezegging[];
  groepsPubliekeSleutelHex: string;
}): { ok: true; verslag: FrostBindingFactorVerslag; groepsToezeggingHex: string; uitdagingHex: string } | { ok: false; fout: string } {
  const ber = berekenFrostGroepsToezeggingEnUitdaging(opties.boodschap, opties.toezeggingenLijst, opties.groepsPubliekeSleutelHex);
  if (!ber.ok) return ber;
  return { ok: true, verslag: ber.verslag, groepsToezeggingHex: ber.groepsPuntRHex, uitdagingHex: codeerScalairHex(ber.uitdagingC) };
}

function berekenFrostGroepsToezeggingEnUitdaging(
  boodschap: Buffer,
  toezeggingen: readonly FrostRonde1PubliekeToezegging[],
  groepsPubliekeSleutelHex: string,
):
  | {
      ok: true;
      gesorteerd: FrostRonde1PubliekeToezegging[];
      rhoPerIndex: Map<number, bigint>;
      groepsPuntR: VerlengdPunt;
      groepsPuntRHex: string;
      uitdagingC: bigint;
      verslag: FrostBindingFactorVerslag;
    }
  | { ok: false; fout: string } {
  if (!decodeerPuntHex(groepsPubliekeSleutelHex)) {
    return { ok: false, fout: 'FROST_GROEPSSLEUTEL_ONGELDIG' };
  }
  const gesorteerd = [...toezeggingen].sort((a, b) => a.deelnemerIndex - b.deelnemerIndex);
  for (let i = 1; i < gesorteerd.length; i++) {
    if (gesorteerd[i].deelnemerIndex === gesorteerd[i - 1].deelnemerIndex) {
      return { ok: false, fout: 'FROST_DUBBELE_DEELNEMER_IN_LIJST' };
    }
  }

  const rhoPerIndex = new Map<number, bigint>();
  for (const t of gesorteerd) {
    if (!decodeerPuntHex(t.schuilPuntDHex) || !decodeerPuntHex(t.bindPuntEHex)) {
      return { ok: false, fout: 'FROST_RONDE1_PUNT_ONGELDIG' };
    }
  }
  const factoren = berekenFrostBindingFactoren(boodschap, gesorteerd, groepsPubliekeSleutelHex);
  let groepsPuntR = NUL_PUNT;
  for (const t of gesorteerd) {
    const D = decodeerPuntHex(t.schuilPuntDHex)!;
    const E = decodeerPuntHex(t.bindPuntEHex)!;
    const rho = factoren.rhoPerIndex.get(t.deelnemerIndex)!;
    rhoPerIndex.set(t.deelnemerIndex, rho);
    groepsPuntR = puntTelOp(groepsPuntR, puntTelOp(D, puntVermenigvuldig(E, rho)));
  }

  const groepsPuntRHex = codeerPuntHex(groepsPuntR);
  // H2 RFC 9591 §6.1 збігається з викликом Шнорра RFC 8032 §5.1.6: SHA-512(enc(R) || enc(Y) || M) mod L
  const cDigest = createHash('sha512')
    .update(Buffer.from(groepsPuntRHex, 'hex'))
    .update(Buffer.from(groepsPubliekeSleutelHex, 'hex'))
    .update(boodschap)
    .digest();
  const uitdagingC = leesHash512ModL(cDigest);

  return { ok: true, gesorteerd, rhoPerIndex, groepsPuntR, groepsPuntRHex, uitdagingC, verslag: factoren.verslag };
}

/**
 * Раунд 1 FROST (RFC 9591 §5.1 commit): учасник виводить одноразову пару нонсів (d_i, e_i) через
 * nonce_generate із прив'язкою до власної закритої частки s_i і публікує зобов'язання (D_i, E_i).
 * `vasteWillekeur` дозволена лише для звірки з еталонним вектором RFC 9591 додатка E.1.
 */
export function frostRonde1MaakToezegging(
  deel: FeldmanVssDeel,
  vasteWillekeur?: { schuil: Buffer; bind: Buffer },
): {
  publiek: FrostRonde1PubliekeToezegging;
  geheimeNonceStaat: FrostGeheimeNonceStaat;
} {
  if (!deel || typeof deel !== 'object' || !Number.isInteger(deel.index) || deel.index < 1) {
    throw new Error('FROST_DEELNEMER_INDEX_ONGELDIG');
  }
  const deelnemerIndex = deel.index;
  const dHex = frostNonceGenereer(deel.scalairHex, vasteWillekeur?.schuil);
  const eHex = frostNonceGenereer(deel.scalairHex, vasteWillekeur?.bind);
  const d = decodeerScalairHex(dHex)!;
  const e = decodeerScalairHex(eHex)!;
  if (d === 0n || e === 0n) throw new Error('FROST_NONCE_NUL');
  const DHex = codeerPuntHex(puntVermenigvuldig(GENERATOR_B, d));
  const EHex = codeerPuntHex(puntVermenigvuldig(GENERATOR_B, e));
  return {
    publiek: {
      deelnemerIndex,
      schuilPuntDHex: DHex,
      bindPuntEHex: EHex,
    },
    geheimeNonceStaat: {
      deelnemerIndex,
      dScalairBuf: Buffer.from(dHex, 'hex'),
      eScalairBuf: Buffer.from(eHex, 'hex'),
      verbruikt: false,
    },
  };
}

/**
 * Раунд 2 FROST: учасник обчислює лише свою частку підпису z_i без передавання закритої частки s_i
 * і негайно безповоротно затирає одноразові нонси (d_i, e_i) нулями в оперативній пам'яті.
 */
export function frostRonde2TekenDeel(opties: {
  deel: FeldmanVssDeel;
  geheimeNonceStaat: FrostGeheimeNonceStaat;
  boodschap: Buffer;
  toezeggingenLijst: readonly FrostRonde1PubliekeToezegging[];
  groepsPubliekeSleutelHex: string;
}): { ok: true; deelHandtekening: FrostRonde2DeelHandtekening } | { ok: false; fout: string } {
  const { geheimeNonceStaat, deel } = opties;
  if (geheimeNonceStaat.verbruikt) {
    return { ok: false, fout: 'FROST_NONCE_REEDS_VERBRUIKT' };
  }
  geheimeNonceStaat.verbruikt = true;

  try {
    if (geheimeNonceStaat.deelnemerIndex !== deel.index) {
      return { ok: false, fout: 'FROST_DEELNEMER_KOMT_NIET_OVEREEN' };
    }
    if (opties.toezeggingenLijst.length < deel.drempel) {
      return { ok: false, fout: 'FROST_ONVOLDOENDE_ONDERTEKENAARS_VOOR_DREMPEL' };
    }
    if (!opties.toezeggingenLijst.some((t) => t.deelnemerIndex === deel.index)) {
      return { ok: false, fout: 'FROST_EIGEN_TOEZEGGING_ONTBREEKT_IN_LIJST' };
    }

    const ber = berekenFrostGroepsToezeggingEnUitdaging(
      opties.boodschap,
      opties.toezeggingenLijst,
      opties.groepsPubliekeSleutelHex,
    );
    if (!ber.ok) return ber;

    const di = decodeerScalairHex(geheimeNonceStaat.dScalairBuf.toString('hex'));
    const ei = decodeerScalairHex(geheimeNonceStaat.eScalairBuf.toString('hex'));
    const si = decodeerScalairHex(deel.scalairHex);
    if (di === null || ei === null || si === null) {
      return { ok: false, fout: 'FROST_SCALAIR_ONGELDIG' };
    }

    const indexen = ber.gesorteerd.map((t) => t.deelnemerIndex);
    const lambdaI = lagrangeNulCoeffModL(indexen, deel.index);
    const rhoI = ber.rhoPerIndex.get(deel.index)!;

    const zi = mod(
      di + mod(ei * rhoI, ED25519_ORDE_L) + mod(mod(lambdaI * si, ED25519_ORDE_L) * ber.uitdagingC, ED25519_ORDE_L),
      ED25519_ORDE_L,
    );

    return {
      ok: true,
      deelHandtekening: {
        deelnemerIndex: deel.index,
        zDeelHex: codeerScalairHex(zi),
      },
    };
  } finally {
    geheimeNonceStaat.dScalairBuf.fill(0);
    geheimeNonceStaat.eScalairBuf.fill(0);
  }
}

/**
 * Перевіряє кожну частку підпису окремо за публічною точкою учасника Y_i (поіменно виявляючи скомпрометований вузол!)
 * та агрегує стандартний 64-байтний підпис Ed25519 RFC 8032 без збирання приватного ключа групи.
 */
export function frostVoegHandtekeningSamen(opties: {
  boodschap: Buffer;
  toezeggingenLijst: readonly FrostRonde1PubliekeToezegging[];
  deelHandtekeningen: readonly FrostRonde2DeelHandtekening[];
  deelnemerPubliekeSleutelsHex: Readonly<Record<number, string>>;
  groepsPubliekeSleutelHex: string;
  drempel: number;
}):
  | { ok: true; handtekeningHex: string; handtekeningB64u: string }
  | { ok: false; fout: string; verdachteDeelnemers?: number[] } {
  if (
    opties.toezeggingenLijst.length < opties.drempel
    || opties.deelHandtekeningen.length !== opties.toezeggingenLijst.length
  ) {
    return { ok: false, fout: 'FROST_AANTAL_DEELHANDTEKENINGEN_ONGELDIG' };
  }

  const ber = berekenFrostGroepsToezeggingEnUitdaging(
    opties.boodschap,
    opties.toezeggingenLijst,
    opties.groepsPubliekeSleutelHex,
  );
  if (!ber.ok) return ber;

  const indexen = ber.gesorteerd.map((t) => t.deelnemerIndex);
  const toezeggingMap = new Map(ber.gesorteerd.map((t) => [t.deelnemerIndex, t]));
  const verdachteDeelnemers: number[] = [];
  let zSom = 0n;

  for (const dh of opties.deelHandtekeningen) {
    const t = toezeggingMap.get(dh.deelnemerIndex);
    const yiHex = opties.deelnemerPubliekeSleutelsHex[dh.deelnemerIndex];
    const zi = decodeerScalairHex(dh.zDeelHex);
    const yi = yiHex ? decodeerPuntHex(yiHex) : null;
    if (!t || zi === null || !yi) {
      verdachteDeelnemers.push(dh.deelnemerIndex);
      continue;
    }

    const D = decodeerPuntHex(t.schuilPuntDHex)!;
    const E = decodeerPuntHex(t.bindPuntEHex)!;
    const rhoI = ber.rhoPerIndex.get(dh.deelnemerIndex)!;
    const lambdaI = lagrangeNulCoeffModL(indexen, dh.deelnemerIndex);

    // Перевірка частки підпису RFC 9591 §5.3: z_i * B == D_i + rho_i * E_i + (lambda_i * c) * Y_i
    const links = puntVermenigvuldig(GENERATOR_B, zi);
    const rechts = puntTelOp(
      puntTelOp(D, puntVermenigvuldig(E, rhoI)),
      puntVermenigvuldig(yi, mod(lambdaI * ber.uitdagingC, ED25519_ORDE_L)),
    );
    if (!puntIsGelijk(links, rechts)) {
      verdachteDeelnemers.push(dh.deelnemerIndex);
      continue;
    }

    zSom = mod(zSom + zi, ED25519_ORDE_L);
  }

  if (verdachteDeelnemers.length > 0) {
    return {
      ok: false,
      fout: 'FROST_DEELHANDTEKENING_ONGELDIG',
      verdachteDeelnemers: verdachteDeelnemers.sort((a, b) => a - b),
    };
  }

  const handtekeningHex = ber.groepsPuntRHex + codeerScalairHex(zSom);
  if (!verifieerStandaardEd25519Handtekening(opties.boodschap, handtekeningHex, opties.groepsPubliekeSleutelHex)) {
    return { ok: false, fout: 'FROST_EINDVERIFICATIE_MISLUKT' };
  }

  return {
    ok: true,
    handtekeningHex,
    handtekeningB64u: Buffer.from(handtekeningHex, 'hex').toString('base64url'),
  };
}

/**
 * Оновлює публічні точки перевірки учасників Y_i^{(e+1)} виключно за попередніми точками Y_i^{(e)}
 * та відкритими нульовими зобов'язаннями Delta_{k,1..t-1} — без доступу до жодної закритої частки!
 */
export function werkDeelnemerPubliekeSleutelsBijNaVerversing(
  oudeDeelnemerSleutelsHex: Readonly<Record<number, string>>,
  nulBijdragen: readonly ProactieveNulBijdrage[],
): Record<number, string> {
  const uit: Record<number, string> = {};
  for (const [sleutelIdx, oudHex] of Object.entries(oudeDeelnemerSleutelsHex)) {
    const i = Number(sleutelIdx);
    const basisPunt = decodeerPuntHex(oudHex);
    if (!basisPunt) throw new Error('ONGELDIGE_DEELNEMER_PUBLIEKE_SLEUTEL');
    let som = basisPunt;
    const xi = BigInt(i);
    for (const b of nulBijdragen) {
      let xMacht = xi;
      for (const deltaHex of b.nulToezeggingenVanaf1Hex) {
        const dp = decodeerPuntHex(deltaHex, true);
        if (!dp) throw new Error('ONGELDIGE_PROACTIEVE_TOEZEGGING');
        som = puntTelOp(som, puntVermenigvuldig(dp, xMacht));
        xMacht = mod(xMacht * xi, ED25519_ORDE_L);
      }
    }
    uit[i] = codeerPuntHex(som);
  }
  return uit;
}

