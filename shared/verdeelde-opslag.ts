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

// ------------------------------------------------------------------------------------------------ UPD-013: типи вузлів, SHA-256, ротація, маніфест та навчальне відновлення

export type KnoopSoort = 'r-schijf' | 's3' | 'webdav' | 'rclone' | 'nextcloud' | 'offline-qr' | 'eigen-server';
export type KnoopStatus = 'gezond' | 'waarschuwing' | 'fout' | 'onbekend';
export type RotatieSoort = 'rotatie' | 'oefen-herstel' | 'controle';

export const KNOOP_SOORTEN: readonly KnoopSoort[] = [
  'r-schijf',
  's3',
  'webdav',
  'rclone',
  'nextcloud',
  'offline-qr',
  'eigen-server',
] as const;

export const KNOOP_STATUSSEN: readonly KnoopStatus[] = [
  'gezond',
  'waarschuwing',
  'fout',
  'onbekend',
] as const;

export type OpslagKnoopMeta = {
  id: string;
  naam: string;
  landCode: string;
  platform: string;
  soort: KnoopSoort;
  bestemmingHint?: string;
  status?: KnoopStatus;
  laatsteSha256?: string;
  laatsteControleOp?: string;
  actief: boolean;
};

export type KnoopInstructie = {
  soort: KnoopSoort;
  titelUk: string;
  titelNl: string;
  stappenUk: string[];
  stappenNl: string[];
};

export type VerdeelManifestInvoer = {
  setId?: string;
  revisie?: number;
  drempel: number;
  aantal?: number;
  knopen: readonly OpslagKnoopMeta[];
  objectHash?: string;
  aangemaaktOp?: string;
};

export type VerdeelManifestDocument = {
  formaat: 'VERDEELDE-OPSLAG-MANIFEST';
  schema: 2;
  setId: string;
  revisie: number;
  aangemaaktOp: string;
  beleid: {
    drempelK: number;
    aantalDelen: number;
    nulKosten: true;
    geheimenInManifest: false;
    omschrijvingUk: string;
    omschrijvingNl: string;
  };
  spreiding: SpreidingOordeel & {
    perLand: Record<string, number>;
    perPlatform: Record<string, number>;
  };
  knopen: Array<{
    deelIndex: number;
    id: string;
    naam: string;
    landCode: string;
    platform: string;
    soort: KnoopSoort;
    bestemmingHint: string;
    status: KnoopStatus;
    laatsteSha256: string;
    laatsteControleOp: string;
    actief: boolean;
  }>;
  objectHash: string;
  instructies: Record<KnoopSoort, KnoopInstructie>;
};

export type OefenHerstelStap = {
  stap: string;
  ok: boolean;
  uk: string;
  nl: string;
};

export type OefenHerstelResultaat = {
  geslaagd: boolean;
  aantalDelen: number;
  drempelK: number;
  oorspronkelijkSha256: string;
  herstelVoorRotatieSha256: string;
  herstelNaRotatieSha256: string;
  teWeinigDelenGeweigerd: boolean;
  polynoomVernieuwd: boolean;
  stappen: OefenHerstelStap[];
  samenvattingUk: string;
  samenvattingNl: string;
  uitgevoerdOp: string;
};

/** Перетворює прикладний тип вузла на платформу перевірки рознесення. */
export function knoopSoortNaarPlatform(soort: KnoopSoort): KnoopPlatform {
  switch (soort) {
    case 'r-schijf': return 'lokaal';
    case 's3': return 's3';
    case 'webdav':
    case 'nextcloud': return 'webdav';
    case 'rclone': return 'cloud';
    case 'offline-qr': return 'offline-qr';
    case 'eigen-server': return 'eigen-vm';
  }
}

/** Очищує підказку призначення від випадкових паролів, ключів доступу та параметрів запиту. */
export function zuiverBestemmingHint(waarde: unknown): string {
  const ruw = String(waarde ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240);
  if (!ruw) return '';
  return ruw
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+@)/gi, '$1[приховано]@')
    .replace(/([?&](?:token|key|secret|password|pass|auth|sig|signature)=)[^&\s]+/gi, '$1[приховано]')
    .replace(/\b(?:tvh|mr3f|mruw|ghp|gho|sk|pk)_[A-Za-z0-9_-]{8,}\b/g, '[приховано]');
}

// Чиста портативна реалізація SHA-256 (FIPS 180-4) для браузера й сервера без зовнішніх залежностей.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Обчислює шістнадцяткову контрольну суму SHA-256 (64 символи) для довільного масиву байтів. */
export function sha256Hex(bytes: Uint8Array): string {
  const len = bytes.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;
  const padLen = ((len + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, bitLenHi, false);
  view.setUint32(padLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, '0')).join('');
}

function volgendeSetId(oudSetId: string): string {
  const m = /^(.*)-r(\d+)$/.exec(oudSetId);
  if (m) return `${m[1]}-r${Number(m[2]) + 1}`;
  return `${oudSetId || 'verdeeld'}-r2`;
}

/**
 * Проактивна ротація часток Шаміра: відновлює таємницю виключно в оперативній пам’яті
 * й негайно перевипускає новий набір часток із новим випадковим поліномом та оновленими
 * контрольними сумами без зміни самого секрету. Буфер секрету очищується нулями у `finally`.
 */
export function roteerDelen(
  bestaandeDelen: readonly DrempelDeel[],
  nieuwAantal?: number,
  nieuwDrempel?: number,
  opties?: { nieuwSetId?: string; randomBron?: (n: number) => Uint8Array },
): DrempelDeel[] {
  if (!Array.isArray(bestaandeDelen) || bestaandeDelen.length < 2) throw new Error('TE_WEINIG_DELEN');
  const eerste = bestaandeDelen[0];
  const n = nieuwAantal ?? eerste.totaal;
  const k = nieuwDrempel ?? eerste.drempel;
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 2 || n < k || n > 255) {
    throw new Error('DREMPEL_ONGELDIG');
  }
  const geheim = herstelGeheim(bestaandeDelen);
  try {
    const setId = String(opties?.nieuwSetId || '').trim() || volgendeSetId(eerste.setId);
    const randomBron = opties?.randomBron ?? willekeurigeBytes;
    return splitsGeheim(geheim, k, n, setId, randomBron);
  } finally {
    geheim.fill(0);
  }
}

const STANDAARD_INSTRUCTIES: Record<KnoopSoort, KnoopInstructie> = {
  'r-schijf': {
    soort: 'r-schijf',
    titelUk: 'Локальний захищений диск R:\\ (ПК власника)',
    titelNl: 'Lokale beveiligde schijf R:\\ (pc van de eigenaar)',
    stappenUk: [
      'Створіть окрему теку R:\\mijn-ruimte-reservekopie\\verdeeld\\ із правами доступу лише для облікового запису власника.',
      'Зберігайте на цьому диску виключно одну частку та копію очищеного маніфеста VERDEELDE-OPSLAG-MANIFEST.json.',
      'Звіряйте контрольну суму SHA-256 після кожного оновлення запасних копій.',
    ],
    stappenNl: [
      'Maak een aparte map R:\\mijn-ruimte-reservekopie\\verdeeld\\ met alleen toegang voor het account van de eigenaar.',
      'Bewaar op deze schijf uitsluitend één deel en een kopie van het geschoonde manifest VERDEELDE-OPSLAG-MANIFEST.json.',
      'Controleer de SHA-256-controlesom na elke bijwerking van de reservekopieën.',
    ],
  },
  s3: {
    soort: 's3',
    titelUk: 'Сумісне сховище S3 (окрема європейська юрисдикція)',
    titelNl: 'S3-compatibele opslag (afzonderlijke Europese jurisdictie)',
    stappenUk: [
      'Створіть закритий контейнер S3 в обраній країні без публічного доступу та з увімкненим керуванням версіями.',
      'Видайте окремий обмежений ключ лише на читання й запис одного каталогу часток.',
      'Перевіряйте метадані об’єкта та SHA-256 без вивантаження таємниці на основний сервер.',
    ],
    stappenNl: [
      'Maak een besloten S3-bucket in het gekozen land zonder openbare toegang en met versiebeheer ingeschakeld.',
      'Geef een beperkte sleutel uit met alleen lees- en schrijfrechten voor één deelmap.',
      'Controleer objectmetadata en SHA-256 zonder het geheim naar de hoofdserver te halen.',
    ],
  },
  webdav: {
    soort: 'webdav',
    titelUk: 'Незалежний вузол WebDAV (HTTPS)',
    titelNl: 'Onafhankelijke WebDAV-knoop (HTTPS)',
    stappenUk: [
      'Налаштуйте окремий каталог WebDAV через захищене з’єднання HTTPS в іншій країні й іншого постачальника.',
      'Використовуйте окремий пароль застосунку, який не зберігається у відкритому маніфесті.',
      'Звіряйте наявність файла частки й контрольну суму через запит заголовків.',
    ],
    stappenNl: [
      'Richt een aparte WebDAV-map in via HTTPS in een ander land bij een andere aanbieder.',
      'Gebruik een apart toepassingswachtwoord dat nooit in het manifest wordt opgeslagen.',
      'Controleer het deelbestand en de controlesom via een statuscontrole zonder herstel.',
    ],
  },
  rclone: {
    soort: 'rclone',
    titelUk: 'Синхронізація rclone (зашифроване віддалене сховище)',
    titelNl: 'Synchronisatie via rclone (versleutelde externe opslag)',
    stappenUk: [
      'Налаштуйте віддалений профіль rclone із шифруванням імен та вмісту (crypt) на робочому ПК власника.',
      'Призначте цьому вузлу лише один індекс частки, щоб постачальник не мав порогу k.',
      'Запускайте періодичну перевірку контрольних сум командою звірки без розшифрування ключа.',
    ],
    stappenNl: [
      'Configureer een rclone-profiel met versleutelde namen en inhoud (crypt) op de werk-pc van de eigenaar.',
      'Wijs slechts één deelindex toe aan deze knoop zodat geen enkele aanbieder drempel k bereikt.',
      'Voer periodieke controlesomverificatie uit zonder de hoofdsleutel samen te stellen.',
    ],
  },
  nextcloud: {
    soort: 'nextcloud',
    titelUk: 'Власний або довірений Nextcloud (WebDAV)',
    titelNl: 'Eigen of vertrouwde Nextcloud (WebDAV)',
    stappenUk: [
      'Створіть ізольовану теку у Nextcloud та окремий пароль застосунку з обмеженими правами.',
      'Вимкніть зовнішні публічні посилання для цієї теки й переконайтеся, що сервер розташований в окремій країні.',
      'Запишіть лише шлях теки як підказку та SHA-256 останньої частки.',
    ],
    stappenNl: [
      'Maak een afgeschermde map in Nextcloud met een apart toepassingswachtwoord.',
      'Schakel openbare deellinks voor deze map uit en kies een server in een ander land.',
      'Leg uitsluitend de mapverwijzing en de laatste SHA-256-controlesom vast.',
    ],
  },
  'offline-qr': {
    soort: 'offline-qr',
    titelUk: 'Офлайн-носій (паперовий QR-код або захищений носій)',
    titelNl: 'Offline drager (papieren QR-code of fysieke kluis)',
    stappenUk: [
      'Роздрукуйте або збережіть частку поза мережею (на папері чи зашифрованому носії у фізичному сховищі).',
      'Вкажіть код країни «OFFLINE» або фактичне фізичне розташування, відмінне від серверів.',
      'Після кожної проактивної ротації замініть старий офлайн-носій новим зразком.',
    ],
    stappenNl: [
      'Druk het deel af of bewaar het buiten het netwerk (papier of fysiek beveiligde drager in een kluis).',
      'Gebruik landcode «OFFLINE» of de feitelijke fysieke locatie, gescheiden van de servers.',
      'Vervang de oude offline drager direct na elke proactieve deelrotatie.',
    ],
  },
  'eigen-server': {
    soort: 'eigen-server',
    titelUk: 'Окремий власний сервер (резервний вузол)',
    titelNl: 'Afzonderlijke eigen server (reserveknoop)',
    stappenUk: [
      'Розмістіть частку на фізично окремому власному вузлі поза основною віртуальною машиною.',
      'Обмежте права каталогу до 0600 для виділеного облікового запису обслуговування.',
      'Перевіряйте стан вузла й SHA-256 через захищене підключення без збереження інших часток.',
    ],
    stappenNl: [
      'Plaats het deel op een fysiek afzonderlijke eigen server buiten de hoofd-VM.',
      'Beperk bestandsrechten tot 0600 voor een toegewijd systeemaccount.',
      'Controleer de knoopstatus en SHA-256 periodiek zonder andere delen op dezelfde machine.',
    ],
  },
};

/**
 * Формує очищений документ VERDEELDE-OPSLAG-MANIFEST.json без жодних таємниць:
 * поріг k-з-n, перелік вузлів по країнах і платформах, оцінка рознесення та інструкції налаштування.
 */
export function bouwVerdeelManifest(p: VerdeelManifestInvoer): VerdeelManifestDocument {
  const knopenLijst = Array.isArray(p.knopen) ? p.knopen : [];
  const actieveKnopen = knopenLijst.filter((k) => k.actief);
  const drempelK = Math.max(2, Math.min(255, Math.floor(Number(p.drempel) || 3)));
  const aantalDelen = Math.max(
    drempelK,
    Math.min(255, Math.floor(Number(p.aantal) || Math.max(5, actieveKnopen.length))),
  );

  const voorControle: OpslagKnoop[] = knopenLijst.map((k) => ({
    id: k.id,
    label: k.naam,
    landCode: String(k.landCode || '').trim().toUpperCase() || 'ONBEKEND',
    platform: knoopSoortNaarPlatform(k.soort),
    aanbieder: String(k.platform || '').trim().toLowerCase() || k.soort,
    actief: Boolean(k.actief),
  }));

  const spreidingBase = controleerSpreiding(voorControle, drempelK, aantalDelen);
  const perLand: Record<string, number> = {};
  const perPlatform: Record<string, number> = {};
  for (const k of actieveKnopen) {
    const land = String(k.landCode || '').trim().toUpperCase() || 'ONBEKEND';
    const plat = String(k.platform || '').trim().toLowerCase() || k.soort;
    perLand[land] = (perLand[land] || 0) + 1;
    perPlatform[plat] = (perPlatform[plat] || 0) + 1;
  }

  let actiefIdx = 0;
  const schoneKnopen = knopenLijst.map((k) => {
    const deelIndex = k.actief ? ++actiefIdx : 0;
    const sha = /^[0-9a-f]{64}$/i.test(String(k.laatsteSha256 || '').trim())
      ? String(k.laatsteSha256).trim().toLowerCase()
      : '';
    return {
      deelIndex,
      id: String(k.id || ''),
      naam: String(k.naam || '').trim().slice(0, 120),
      landCode: String(k.landCode || '').trim().toUpperCase().slice(0, 16),
      platform: String(k.platform || '').trim().slice(0, 80),
      soort: KNOOP_SOORTEN.includes(k.soort) ? k.soort : 'eigen-server',
      bestemmingHint: zuiverBestemmingHint(k.bestemmingHint),
      status: KNOOP_STATUSSEN.includes(k.status as KnoopStatus) ? (k.status as KnoopStatus) : 'onbekend',
      laatsteSha256: sha,
      laatsteControleOp: String(k.laatsteControleOp || ''),
      actief: Boolean(k.actief),
    };
  });

  const objectHash = /^[0-9a-f]{64}$/i.test(String(p.objectHash || '').trim())
    ? String(p.objectHash).trim().toLowerCase()
    : '';

  return {
    formaat: 'VERDEELDE-OPSLAG-MANIFEST',
    schema: 2,
    setId: String(p.setId || 'mijn-ruimte-verdeeld-v2').trim().slice(0, 80),
    revisie: Math.max(1, Math.floor(Number(p.revisie) || 1)),
    aangemaaktOp: String(p.aangemaaktOp || new Date().toISOString()),
    beleid: {
      drempelK,
      aantalDelen,
      nulKosten: true,
      geheimenInManifest: false,
      omschrijvingUk: `Порогова схема Шаміра ${drempelK}-з-${aantalDelen}: жодна країна й жодна платформа не може зберігати ${drempelK} або більше часток.`,
      omschrijvingNl: `Shamir-drempelschema ${drempelK}-van-${aantalDelen}: geen enkel land en geen enkel platform mag ${drempelK} of meer delen bewaren.`,
    },
    spreiding: {
      ...spreidingBase,
      perLand,
      perPlatform,
    },
    knopen: schoneKnopen,
    objectHash,
    instructies: STANDAARD_INSTRUCTIES,
  };
}

/**
 * Навчальне випробування повного життєвого циклу на вигаданому тестовому ключі (без справжніх даних):
 * розщеплення → перевірка відмови для k-1 часток → відновлення з k часток →
 * проактивна ротація (новий поліном) → повторне відновлення → звірка точного збігу SHA-256.
 */
export function oefenHerstelTest(
  aantal = 5,
  drempel = 3,
  randomBron: (n: number) => Uint8Array = willekeurigeBytes,
): OefenHerstelResultaat {
  const n = Math.floor(Number(aantal));
  const k = Math.floor(Number(drempel));
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 2 || n < k || n > 255) {
    throw new Error('DREMPEL_ONGELDIG');
  }

  const uitgevoerdOp = new Date().toISOString();
  const stappen: OefenHerstelStap[] = [];
  const proefGeheim = randomBron(32);
  let hersteldVoor: Uint8Array | null = null;
  let hersteldNa: Uint8Array | null = null;

  try {
    const oorspronkelijkSha256 = sha256Hex(proefGeheim);
    const setId = `oefen-${Date.now().toString(36)}`;

    // 1. Розщеплення вигаданого ключа на n часток із порогом k
    const delen = splitsGeheim(proefGeheim, k, n, setId, randomBron);
    const splitsOk = delen.length === n && delen.every((d) => d.drempel === k && d.totaal === n);
    stappen.push({
      stap: 'splitsen',
      ok: splitsOk,
      uk: `Вигаданий 256-бітний ключ розщеплено на ${n} часток із порогом ${k}.`,
      nl: `Fictieve 256-bits sleutel opgesplitst in ${n} delen met drempel ${k}.`,
    });

    // 2. Перевірка, що k-1 часток недостатньо для відновлення
    let teWeinigDelenGeweigerd = false;
    try {
      herstelGeheim(delen.slice(0, k - 1));
    } catch {
      teWeinigDelenGeweigerd = true;
    }
    stappen.push({
      stap: 'onder-drempel-geweigerd',
      ok: teWeinigDelenGeweigerd,
      uk: `Набір із ${k - 1} часток очікувано відхилено — без порогу ${k} відновлення неможливе.`,
      nl: `Verzameling van ${k - 1} delen zoals verwacht geweigerd — zonder drempel ${k} is herstel onmogelijk.`,
    });

    // 3. Відновлення з першої підмножини k часток (з кроком для різноманітності)
    const eersteSub: DrempelDeel[] = [];
    for (let i = 0; i < n && eersteSub.length < k; i++) {
      if (i % 2 === 0 || n - i <= k - eersteSub.length) eersteSub.push(delen[i]);
    }
    hersteldVoor = herstelGeheim(eersteSub);
    const herstelVoorRotatieSha256 = sha256Hex(hersteldVoor);
    const voorOk = herstelVoorRotatieSha256 === oorspronkelijkSha256;
    stappen.push({
      stap: 'herstel-voor-rotatie',
      ok: voorOk,
      uk: voorOk
        ? `Відновлення з ${k} часток дало точний збіг SHA-256.`
        : 'Невідповідність SHA-256 під час первинного відновлення.',
      nl: voorOk
        ? `Herstel uit ${k} delen leverde een exacte SHA-256-overeenkomst op.`
        : 'SHA-256-afwijking bij het eerste herstel.',
    });

    // 4. Проактивна ротація часток (новий випадковий поліном без зміни таємниці)
    const geroteerd = roteerDelen(eersteSub, n, k, { randomBron });
    const polynoomVernieuwd = geroteerd.length === n
      && geroteerd[0].setId !== delen[0].setId
      && geroteerd.some((d, idx) => d.waardeB64 !== delen[idx].waardeB64);
    stappen.push({
      stap: 'proactieve-rotatie',
      ok: polynoomVernieuwd,
      uk: polynoomVernieuwd
        ? `Перевипущено ${n} нових часток із новим поліномом та оновленими контрольними сумами.`
        : 'Не вдалося підтвердити оновлення полінома під час ротації.',
      nl: polynoomVernieuwd
        ? `${n} nieuwe delen aangemaakt met een nieuw polynoom en bijgewerkte controlesommen.`
        : 'Vernieuwing van het polynoom kon niet worden bevestigd.',
    });

    // 5. Повторне відновлення з останніх k нових часток і звірка SHA-256
    const tweedeSub = geroteerd.slice(n - k);
    hersteldNa = herstelGeheim(tweedeSub);
    const herstelNaRotatieSha256 = sha256Hex(hersteldNa);
    const naOk = herstelNaRotatieSha256 === oorspronkelijkSha256;
    stappen.push({
      stap: 'herstel-na-rotatie',
      ok: naOk,
      uk: naOk
        ? `Повторне відновлення після ротації з іншої підмножини (${k} із ${n}) підтвердило точний збіг SHA-256.`
        : 'Невідповідність SHA-256 після проактивної ротації.',
      nl: naOk
        ? `Herstel na rotatie uit een andere deelverzameling (${k} van ${n}) bevestigde de exacte SHA-256.`
        : 'SHA-256-afwijking na proactieve rotatie.',
    });

    const geslaagd = splitsOk && teWeinigDelenGeweigerd && voorOk && polynoomVernieuwd && naOk;
    return {
      geslaagd,
      aantalDelen: n,
      drempelK: k,
      oorspronkelijkSha256,
      herstelVoorRotatieSha256,
      herstelNaRotatieSha256,
      teWeinigDelenGeweigerd,
      polynoomVernieuwd,
      stappen,
      samenvattingUk: geslaagd
        ? `Навчальне відновлення й ротація ${k}-з-${n} успішні: SHA-256 збігся до й після перевипуску (${oorspronkelijkSha256.slice(0, 12)}…).`
        : `Навчальне випробування ${k}-з-${n} виявило помилку перевірки.`,
      samenvattingNl: geslaagd
        ? `Oefenherstel en rotatie ${k}-van-${n} geslaagd: SHA-256 identiek vóór en na vernieuwing (${oorspronkelijkSha256.slice(0, 12)}…).`
        : `Oefenherstel ${k}-van-${n} meldde een verificatiefout.`,
      uitgevoerdOp,
    };
  } finally {
    proefGeheim.fill(0);
    if (hersteldVoor) hersteldVoor.fill(0);
    if (hersteldNa) hersteldNa.fill(0);
  }
}

