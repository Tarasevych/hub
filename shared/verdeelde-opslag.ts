// UPD-012: Криптографічний фундамент розподіленого зашифрованого зберігання (порогова схема Шаміра k-з-n над GF(256))
// та перевірка географічно-платформної незалежності вузлів (жодна країна чи провайдер не тримає >= k часток).
// Cryptografische kern voor verdeelde versleutelde opslag (Shamir k-van-n over GF(256)) en spreidingscontrole.

export type KnoopPlatform = 'lokaal' | 's3' | 'webdav' | 'cloud' | 'offline-qr' | 'eigen-vm';

export type OpslagKnoop = {
  id: string;
  label: string;
  landCode: string;       // ISO 3166-1 alpha-2, наприклад 'NL', 'DE', 'CH', 'UA', 'OFFLINE'
  platform: KnoopPlatform;
  aanbieder: string;      // наприклад 'eigen-pc', 'hetzner', 'scaleway', 'nextcloud-eigen', 'papier-qr'
  actief: boolean;
};

export type DrempelDeel = {
  versie: 1;
  setId: string;
  index: number;          // 1..n (координата X у GF(256), ніколи 0)
  drempel: number;        // k
  totaal: number;         // n
  geheimLengte: number;
  waardeB64: string;      // байти частки у base64url
  controleSom: string;    // FNV/SHA-контрольна сума частки для виявлення пошкодження
};

export type VerdeeldeOpslagManifest = {
  schema: 1;
  setId: string;
  revisie: number;        // монотонний лічильник для захисту від відкату версій
  aangemaaktOp: string;
  drempel: number;
  totaal: number;
  knopen: Array<{
    deelIndex: number;
    knoopId: string;
    landCode: string;
    platform: KnoopPlatform;
    aanbieder: string;
    deelHash: string;
  }>;
  objectHash: string;     // SHA-256 зашифрованого архіву/блоку (без таємного ключа)
};

export type SpreidingOordeel = {
  ok: boolean;
  fouten: Array<{ code: string; uk: string; nl: string }>;
  uniekeLanden: number;
  uniekeAanbieders: number;
};

// ------------------------------------------------------------------------------------------------ Арифметика GF(256) (поліном AES x^8 + x^4 + x^3 + x + 1 = 0x11b)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // Генератор 0x03 у GF(2^8) з поліномом 0x11b (має повний порядок 255)
    const x2 = (x << 1) ^ (x & 0x80 ? 0x1b : 0);
    x = (x2 ^ x) & 0xff;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('GF256_DELING_DOOR_NUL');
  if (a === 0) return 0;
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

function b64uEncode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64url'));
  const pad = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fnv1aHex(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function willekeurigeBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new Error('CRYPTO_RANDOM_ONBESCHIKBAAR');
}

/**
 * Розщеплює таємницю (ключ шифрування DEK/KEK або ключ відновлення) на `totaal` (n) часток із порогом `drempel` (k).
 * Будь-які k-1 часток не дають жодної інформації про таємницю (інформаційно-теоретична стійкість Шаміра).
 */
export function splitsGeheim(
  geheim: Uint8Array,
  drempel: number,
  totaal: number,
  setId: string,
  randomBron: (n: number) => Uint8Array = willekeurigeBytes,
): DrempelDeel[] {
  if (!(geheim instanceof Uint8Array) || geheim.length === 0 || geheim.length > 4096) throw new Error('GEHEIM_ONGELDIG');
  if (!Number.isInteger(drempel) || !Number.isInteger(totaal) || drempel < 2 || totaal < drempel || totaal > 255) {
    throw new Error('DREMPEL_ONGELDIG');
  }
  const len = geheim.length;
  const delenBytes: Uint8Array[] = Array.from({ length: totaal }, () => new Uint8Array(len));
  const coeffs = randomBron(len * (drempel - 1));

  for (let b = 0; b < len; b++) {
    // Поліном P(x) = geheim[b] + c1*x + c2*x^2 + ... + c_{k-1}*x^{k-1}
    for (let i = 0; i < totaal; i++) {
      const x = i + 1;
      let y = 0;
      for (let p = drempel - 1; p >= 1; p--) {
        const c = coeffs[b * (drempel - 1) + (p - 1)];
        y = gfMul(y, x) ^ c;
      }
      y = gfMul(y, x) ^ geheim[b];
      delenBytes[i][b] = y;
    }
  }

  return delenBytes.map((bytes, idx) => ({
    versie: 1,
    setId,
    index: idx + 1,
    drempel,
    totaal,
    geheimLengte: len,
    waardeB64: b64uEncode(bytes),
    controleSom: fnv1aHex(bytes),
  }));
}

/** Відновлює первинну таємницю з будь-яких `k` (або більше) дійсних часток інтерполяцією Лагранжа у точці x = 0. */
export function herstelGeheim(delen: readonly DrempelDeel[]): Uint8Array {
  if (!Array.isArray(delen) || delen.length < 2) throw new Error('TE_WEINIG_DELEN');
  const eerste = delen[0];
  const k = eerste.drempel;
  if (delen.length < k) throw new Error('TE_WEINIG_DELEN');

  const uniek = new Map<number, Uint8Array>();
  for (const d of delen) {
    if (d.versie !== 1 || d.setId !== eerste.setId || d.drempel !== k || d.geheimLengte !== eerste.geheimLengte) {
      throw new Error('DEEL_MISMATCH');
    }
    if (!Number.isInteger(d.index) || d.index < 1 || d.index > 255) throw new Error('DEEL_INDEX_ONGELDIG');
    const bytes = b64uDecode(d.waardeB64);
    if (bytes.length !== eerste.geheimLengte || fnv1aHex(bytes) !== d.controleSom) {
      throw new Error('DEEL_BESCHADIGD');
    }
    uniek.set(d.index, bytes);
    if (uniek.size === k) break;
  }
  if (uniek.size < k) throw new Error('DUBBELE_DELEN_TE_WEINIG');

  const paren = [...uniek.entries()];
  const out = new Uint8Array(eerste.geheimLengte);
  // Обчислюємо базисні коефіцієнти Лагранжа в x = 0 один раз
  const lagrange = paren.map(([xi], i) => {
    let num = 1;
    let den = 1;
    for (let j = 0; j < paren.length; j++) {
      if (i === j) continue;
      const xj = paren[j][0];
      num = gfMul(num, xj);        // (0 - xj) = xj у GF(256)
      den = gfMul(den, xi ^ xj);   // (xi - xj) = xi ^ xj у GF(256)
    }
    return gfDiv(num, den);
  });

  for (let b = 0; b < eerste.geheimLengte; b++) {
    let val = 0;
    for (let i = 0; i < paren.length; i++) {
      val ^= gfMul(paren[i][1][b], lagrange[i]);
    }
    out[b] = val;
  }
  return out;
}

/**
 * Перевіряє політику незалежного географічно-платформного розміщення:
 * - кількість активних вузлів >= n;
 * - жодна країна (крім офлайн-носія) і жоден постачальник не тримає >= k часток;
 * - усі вузли мають унікальні ідентифікатори.
 */
export function controleerSpreiding(knopen: readonly OpslagKnoop[], drempel: number, totaal: number): SpreidingOordeel {
  const fouten: Array<{ code: string; uk: string; nl: string }> = [];
  const actief = knopen.filter((k) => k.actief);
  if (drempel < 2 || totaal < drempel) {
    fouten.push({
      code: 'DREMPEL_ONGELDIG',
      uk: 'Поріг відновлення має бути щонайменше 2 і не перевищувати загальну кількість часток.',
      nl: 'De hersteldrempel moet minstens 2 zijn en mag het totaal aantal delen niet overschrijden.',
    });
  }
  if (actief.length < totaal) {
    fouten.push({
      code: 'TE_WEINIG_KNOPEN',
      uk: `Потрібно щонайменше ${totaal} активних незалежних вузлів, зараз доступно ${actief.length}.`,
      nl: `Er zijn minstens ${totaal} actieve onafhankelijke knopen nodig; nu beschikbaar: ${actief.length}.`,
    });
  }

  const perLand = new Map<string, number>();
  const perAanbieder = new Map<string, number>();
  for (const k of actief.slice(0, totaal)) {
    const land = String(k.landCode || '').trim().toUpperCase() || 'ONBEKEND';
    const aanb = String(k.aanbieder || '').trim().toLowerCase() || 'onbekend';
    perLand.set(land, (perLand.get(land) || 0) + 1);
    perAanbieder.set(aanb, (perAanbieder.get(aanb) || 0) + 1);
  }

  for (const [land, n] of perLand) {
    if (n >= drempel) {
      fouten.push({
        code: 'LAND_CONCENTRATIE',
        uk: `Країна ${land} утримує ${n} част., що досягає порогу ${drempel}: вилучення серверів в одній юрисдикції розкрило б дані.`,
        nl: `Land ${land} bewaart ${n} delen (≥ drempel ${drempel}): beslagname in één jurisdictie zou gegevens blootleggen.`,
      });
    }
  }
  for (const [aanb, n] of perAanbieder) {
    if (n >= drempel) {
      fouten.push({
        code: 'AANBIEDER_CONCENTRATIE',
        uk: `Платформа «${aanb}» утримує ${n} част. (≥ ${drempel}): компрометація одного сервісу неприпустима.`,
        nl: `Aanbieder «${aanb}» bewaart ${n} delen (≥ ${drempel}): afhankelijkheid van één dienst is niet toegestaan.`,
      });
    }
  }

  return {
    ok: fouten.length === 0,
    fouten,
    uniekeLanden: perLand.size,
    uniekeAanbieders: perAanbieder.size,
  };
}
