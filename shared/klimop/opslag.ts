// KLIMOP-004 (20.11.2026, Етап 3 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Клієнтське конвертне шифрування даних (§6, §13), ієрархія ключів на HKDF-SHA-256, криптографічна гнучкість
// із захистом від пониження рівня шифрування, завадостійке кодування відновлення втрачених фрагментів Ріда–Соломона
// Reed-Solomon (k + m) над скінченним полем Галуа GF(2^8) (§11 та §43 п. 3: суворе відокремлення від схеми Шаміра!)
// та перехідні сліпі пошукові відбитки HMAC-SHA-256 для таблиць реєстру сховища ключів.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import {
  KLIMOP_OPSLAG_LAGEN,
  berekenKnooppuntId,
  canoniekeJson,
  type KlimopKnooppuntIdentiteit,
  type KlimopOpslagLaag,
} from './kern';

export const KLIMOP_VERSLEUTELING_PROFIELEN = Object.freeze([
  'klimop-v1-chacha20-poly1305',
  'klimop-v1-aes-256-gcm',
  'klimop-v2-pq-voorbereid',
] as const);
export type KlimopVersleutelingProfiel = (typeof KLIMOP_VERSLEUTELING_PROFIELEN)[number];

const PROFIEL_STERKTE_RANG: Readonly<Record<KlimopVersleutelingProfiel, number>> = Object.freeze({
  'klimop-v1-aes-256-gcm': 10,
  'klimop-v1-chacha20-poly1305': 10,
  'klimop-v2-pq-voorbereid': 20,
});

/**
 * Узгоджує криптографічний профіль між відправником і отримувачем та блокує будь-яку спробу
 * понизити рівень захисту нижче мінімально допустимого (§13 маніфесту: криптографічна гнучкість).
 */
export function onderhandelKlimopProfiel(
  ondersteundDoorZender: readonly string[],
  ondersteundDoorOntvanger: readonly string[],
  minimaalVereisteRang = 10,
): { ok: true; gekozenProfiel: KlimopVersleutelingProfiel } | { ok: false; fout: string } {
  const geldigeSet = new Set<string>(KLIMOP_VERSLEUTELING_PROFIELEN);
  const gemeenschappelijk = ondersteundDoorZender.filter(
    (p): p is KlimopVersleutelingProfiel => geldigeSet.has(p) && ondersteundDoorOntvanger.includes(p),
  );
  if (gemeenschappelijk.length === 0) {
    return { ok: false, fout: 'GEEN_GEMEENSCHAPPELIJK_VERSLEUTELINGSPROFIEL' };
  }
  gemeenschappelijk.sort((a, b) => PROFIEL_STERKTE_RANG[b] - PROFIEL_STERKTE_RANG[a]);
  const beste = gemeenschappelijk[0];
  if (PROFIEL_STERKTE_RANG[beste] < minimaalVereisteRang) {
    return { ok: false, fout: 'VERBODEN_AFZWAKKING_VAN_VERSLEUTELING' };
  }
  return { ok: true, gekozenProfiel: beste };
}

export type KlimopSleutelSubdoel = 'kek' | 'zoek_blind' | 'manifest';

/**
 * Виводить ізольований 32-байтний ключ із кореневого ключа простору власника через HKDF-SHA-256 (RFC 5869)
 * із жорстким прив'язуванням до рівня зберігання, ідентифікатора простору, криптографічної епохи та призначення.
 */
export function leidKlimopSleutelAf(
  wortelSleutel: Buffer,
  doel: {
    laag: KlimopOpslagLaag;
    ruimteId: string;
    epoche: number;
    subdoel: KlimopSleutelSubdoel;
  },
): Buffer {
  if (!Buffer.isBuffer(wortelSleutel) || wortelSleutel.length < 32) {
    throw new Error('WORTELSLEUTEL_TE_KORT');
  }
  if (!KLIMOP_OPSLAG_LAGEN.includes(doel.laag)) {
    throw new Error('ONGELDIGE_OPSLAGLAAG');
  }
  if (!doel.ruimteId || !Number.isInteger(doel.epoche) || doel.epoche < 1) {
    throw new Error('ONGELDIGE_SLEUTEL_CONTEXT');
  }
  const zout = createHash('sha256').update(`klimop-hkdf-zout-v1|${doel.ruimteId}|epoche:${doel.epoche}`).digest();
  const info = Buffer.from(`klimop-sleutel-v1|${doel.laag}|${doel.subdoel}|epoche:${doel.epoche}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', wortelSleutel, zout, info, 32));
}

export interface KlimopDekOmslagContext {
  eigenaarKnooppuntId: string;
  objectId: string;
  laag: KlimopOpslagLaag;
  epoche: number;
  profiel: KlimopVersleutelingProfiel;
}

export interface KlimopDekOmslag {
  schema: 1;
  profiel: KlimopVersleutelingProfiel;
  epoche: number;
  ivB64u: string;
  ingepakteDekB64u: string;
  authenticatieTagB64u: string;
}

function aeadAlgoritmeVoorProfiel(profiel: KlimopVersleutelingProfiel): 'chacha20-poly1305' | 'aes-256-gcm' {
  return profiel === 'klimop-v1-aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305';
}

function versleutelAead(
  algoritme: 'chacha20-poly1305' | 'aes-256-gcm',
  sleutel: Buffer,
  iv: Buffer,
  klareTekst: Buffer,
  aad: Buffer,
): { cijfertekst: Buffer; tag: Buffer } {
  if (algoritme === 'chacha20-poly1305') {
    const c = createCipheriv('chacha20-poly1305', sleutel, iv, { authTagLength: 16 });
    c.setAAD(aad, { plaintextLength: klareTekst.length });
    const cijfertekst = Buffer.concat([c.update(klareTekst), c.final()]);
    return { cijfertekst, tag: c.getAuthTag() };
  }
  const c = createCipheriv('aes-256-gcm', sleutel, iv);
  c.setAAD(aad);
  const cijfertekst = Buffer.concat([c.update(klareTekst), c.final()]);
  return { cijfertekst, tag: c.getAuthTag() };
}

function ontsleutelAead(
  algoritme: 'chacha20-poly1305' | 'aes-256-gcm',
  sleutel: Buffer,
  iv: Buffer,
  cijfertekst: Buffer,
  tag: Buffer,
  aad: Buffer,
): Buffer {
  if (algoritme === 'chacha20-poly1305') {
    const d = createDecipheriv('chacha20-poly1305', sleutel, iv, { authTagLength: 16 });
    d.setAAD(aad, { plaintextLength: cijfertekst.length });
    d.setAuthTag(tag);
    return Buffer.concat([d.update(cijfertekst), d.final()]);
  }
  const d = createDecipheriv('aes-256-gcm', sleutel, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(cijfertekst), d.final()]);
}

function maakOmslagAad(ctx: KlimopDekOmslagContext): Buffer {
  return Buffer.from(
    `klimop-dek-omslag-v1|${ctx.eigenaarKnooppuntId}|${ctx.objectId}|${ctx.laag}|epoche:${ctx.epoche}|${ctx.profiel}`,
    'utf8',
  );
}

/** Загортає одноразовий ключ об'єкта DEK під ключем KEK власника даних (конвертне шифрування §6 маніфесту). */
export function wikkelObjectDekIn(dek: Buffer, kek: Buffer, ctx: KlimopDekOmslagContext): KlimopDekOmslag {
  if (dek.length !== 32 || kek.length !== 32) throw new Error('ONGELDIGE_SLEUTELLENGTE');
  const iv = randomBytes(12);
  const alg = aeadAlgoritmeVoorProfiel(ctx.profiel);
  const { cijfertekst, tag } = versleutelAead(alg, kek, iv, dek, maakOmslagAad(ctx));
  return {
    schema: 1,
    profiel: ctx.profiel,
    epoche: ctx.epoche,
    ivB64u: iv.toString('base64url'),
    ingepakteDekB64u: cijfertekst.toString('base64url'),
    authenticatieTagB64u: tag.toString('base64url'),
  };
}

/** Розгортає ключ об'єкта DEK на пристрої власника за перевіркою контекстної прив'язки AAD. */
export function pakObjectDekUit(
  omslag: KlimopDekOmslag,
  kek: Buffer,
  ctx: KlimopDekOmslagContext,
): { ok: true; dek: Buffer } | { ok: false; fout: string } {
  if (!omslag || omslag.schema !== 1 || omslag.profiel !== ctx.profiel || omslag.epoche !== ctx.epoche) {
    return { ok: false, fout: 'OMSLAG_CONTEXT_KOMT_NIET_OVEREEN' };
  }
  try {
    const dek = ontsleutelAead(
      aeadAlgoritmeVoorProfiel(omslag.profiel),
      kek,
      Buffer.from(omslag.ivB64u, 'base64url'),
      Buffer.from(omslag.ingepakteDekB64u, 'base64url'),
      Buffer.from(omslag.authenticatieTagB64u, 'base64url'),
      maakOmslagAad(ctx),
    );
    return { ok: true, dek };
  } catch {
    return { ok: false, fout: 'OMSLAG_AUTHENTICATIE_MISLUKT' };
  }
}

// =================================================================================================
// Арифметика скінченного поля Галуа GF(2^8) (поліном x^8 + x^4 + x^3 + x + 1 = 0x11b)
// та систематичне кодування відновлення втрачених фрагментів Ріда–Соломона (матриця Коші MDS).
// =================================================================================================

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    const x2 = (x << 1) ^ (x & 0x80 ? 0x1b : 0);
    x = (x2 ^ x) & 0xff;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfVermenigvuldig(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfInvers(a: number): number {
  if (a === 0) throw new Error('GF256_INVERS_VAN_NUL');
  return GF_EXP[255 - GF_LOG[a]];
}

/**
 * Будує систематичну породжувальну MDS-матрицю розміром (k + m) × k над GF(2^8):
 * перші k рядків — одинична матриця I_k, наступні m рядків — матриця Коші C_{i,j} = 1 / (x_i xor y_j),
 * де x_i = i (0..m-1), y_j = m + j (m..m+k-1). Будь-яка квадратна підматриця k × k є невиродженою.
 */
function bouwSystematischeCauchyMatrix(k: number, m: number): Uint8Array[] {
  if (!Number.isInteger(k) || !Number.isInteger(m) || k < 1 || m < 1 || k + m > 255) {
    throw new Error('REED_SOLOMON_PARAMETERS_ONGELDIG');
  }
  const totaal = k + m;
  const rijen: Uint8Array[] = [];
  for (let r = 0; r < k; r++) {
    const rij = new Uint8Array(k);
    rij[r] = 1;
    rijen.push(rij);
  }
  for (let p = 0; p < m; p++) {
    const rij = new Uint8Array(k);
    const xi = p;
    for (let j = 0; j < k; j++) {
      const yj = m + j;
      rij[j] = gfInvers(xi ^ yj);
    }
    rijen.push(rij);
  }
  if (rijen.length !== totaal) throw new Error('REED_SOLOMON_MATRIX_FOUT');
  return rijen;
}

/** Обертає квадратну матрицю k × k над GF(2^8) методом Гауса–Жордана з вибором ведучого елемента. */
function inverteerGfMatrix(matrix: Uint8Array[]): Uint8Array[] {
  const n = matrix.length;
  const links = matrix.map((r) => new Uint8Array(r));
  const rechts = Array.from({ length: n }, (_, i) => {
    const r = new Uint8Array(n);
    r[i] = 1;
    return r;
  });

  for (let kol = 0; kol < n; kol++) {
    let spil = kol;
    while (spil < n && links[spil][kol] === 0) spil++;
    if (spil === n) throw new Error('REED_SOLOMON_ONDERMATRIX_SINGULIER');
    if (spil !== kol) {
      [links[kol], links[spil]] = [links[spil], links[kol]];
      [rechts[kol], rechts[spil]] = [rechts[spil], rechts[kol]];
    }

    const invSpil = gfInvers(links[kol][kol]);
    for (let j = 0; j < n; j++) {
      links[kol][j] = gfVermenigvuldig(links[kol][j], invSpil);
      rechts[kol][j] = gfVermenigvuldig(rechts[kol][j], invSpil);
    }

    for (let r = 0; r < n; r++) {
      if (r === kol) continue;
      const factor = links[r][kol];
      if (factor === 0) continue;
      for (let j = 0; j < n; j++) {
        links[r][j] ^= gfVermenigvuldig(factor, links[kol][j]);
        rechts[r][j] ^= gfVermenigvuldig(factor, rechts[kol][j]);
      }
    }
  }

  return rechts;
}

export interface ReedSolomonFragment {
  index: number; // 0 .. (k + m - 1)
  soort: 'gegevens' | 'pariteit';
  sha256: string;
  inhoudB64u: string;
}

/**
 * Розрізає буфер на k рівних смуг даних і добудовує m смуг парності Ріда–Соломона над GF(2^8).
 * Загальний обсяг становить лише ((k + m) / k) від вхідного буфера (замість n-кратного розмноження у Шаміра).
 */
export function codeerReedSolomon(
  gegevens: Buffer,
  k: number,
  m: number,
): { oorspronkelijkeLengte: number; streepLengte: number; fragmenten: ReedSolomonFragment[] } {
  const genMatrix = bouwSystematischeCauchyMatrix(k, m);
  const streepLengte = Math.max(1, Math.ceil(gegevens.length / k));
  const opgevuld = Buffer.alloc(streepLengte * k, 0);
  gegevens.copy(opgevuld, 0);

  const bronStrepen: Buffer[] = [];
  for (let j = 0; j < k; j++) {
    bronStrepen.push(opgevuld.subarray(j * streepLengte, (j + 1) * streepLengte));
  }

  const fragmenten: ReedSolomonFragment[] = [];
  for (let r = 0; r < k + m; r++) {
    let uitStreep: Buffer;
    if (r < k) {
      uitStreep = Buffer.from(bronStrepen[r]);
    } else {
      uitStreep = Buffer.alloc(streepLengte, 0);
      const rijCoeffs = genMatrix[r];
      for (let j = 0; j < k; j++) {
        const coeff = rijCoeffs[j];
        if (coeff === 0) continue;
        const bron = bronStrepen[j];
        const logC = GF_LOG[coeff];
        for (let b = 0; b < streepLengte; b++) {
          const v = bron[b];
          if (v !== 0) uitStreep[b] ^= GF_EXP[GF_LOG[v] + logC];
        }
      }
    }
    const sha256 = createHash('sha256').update(uitStreep).digest('hex');
    fragmenten.push({
      index: r,
      soort: r < k ? 'gegevens' : 'pariteit',
      sha256,
      inhoudB64u: uitStreep.toString('base64url'),
    });
  }

  return {
    oorspronkelijkeLengte: gegevens.length,
    streepLengte,
    fragmenten,
  };
}

function selecteerEnHerstelBronStrepen(
  beschikbareFragmenten: readonly ReedSolomonFragment[],
  k: number,
  m: number,
): { ok: true; bronStrepen: Buffer[]; streepLengte: number } | { ok: false; fout: string } {
  const genMatrix = bouwSystematischeCauchyMatrix(k, m);
  const gekozen: Array<{ index: number; bytes: Buffer }> = [];
  const gezieneIndexen = new Set<number>();

  for (const fr of beschikbareFragmenten) {
    if (!fr || !Number.isInteger(fr.index) || fr.index < 0 || fr.index >= k + m) continue;
    if (gezieneIndexen.has(fr.index)) continue;
    const bytes = Buffer.from(fr.inhoudB64u, 'base64url');
    const berekendSha = createHash('sha256').update(bytes).digest('hex');
    if (berekendSha !== fr.sha256) continue; // Пошкоджений фрагмент відсіюється автоматично
    gezieneIndexen.add(fr.index);
    gekozen.push({ index: fr.index, bytes });
    if (gekozen.length === k) break;
  }

  if (gekozen.length < k) {
    return { ok: false, fout: 'ONVOLDOENDE_GELDIGE_FRAGMENTEN' };
  }

  const streepLengte = gekozen[0].bytes.length;
  if (streepLengte === 0 || gekozen.some((g) => g.bytes.length !== streepLengte)) {
    return { ok: false, fout: 'ONGELIJKE_FRAGMENT_LENGTE' };
  }

  const onderMatrix = gekozen.map((g) => genMatrix[g.index]);
  const inverseMatrix = inverteerGfMatrix(onderMatrix);

  const bronStrepen: Buffer[] = [];
  for (let i = 0; i < k; i++) {
    const hersteldeStreep = Buffer.alloc(streepLengte, 0);
    const invRij = inverseMatrix[i];
    for (let j = 0; j < k; j++) {
      const coeff = invRij[j];
      if (coeff === 0) continue;
      const inBytes = gekozen[j].bytes;
      if (coeff === 1) {
        for (let b = 0; b < streepLengte; b++) hersteldeStreep[b] ^= inBytes[b];
      } else {
        const logC = GF_LOG[coeff];
        for (let b = 0; b < streepLengte; b++) {
          const v = inBytes[b];
          if (v !== 0) hersteldeStreep[b] ^= GF_EXP[GF_LOG[v] + logC];
        }
      }
    }
    bronStrepen.push(hersteldeStreep);
  }

  return { ok: true, bronStrepen, streepLengte };
}

/** Відновлює первинний буфер із будь-яких k дійсних і непошкоджених фрагментів Ріда–Соломона. */
export function decodeerReedSolomon(
  beschikbareFragmenten: readonly ReedSolomonFragment[],
  k: number,
  m: number,
  oorspronkelijkeLengte: number,
): { ok: true; gegevens: Buffer } | { ok: false; fout: string } {
  if (!Number.isInteger(oorspronkelijkeLengte) || oorspronkelijkeLengte < 0) {
    return { ok: false, fout: 'ONGELDIGE_OORSPRONKELIJKE_LENGTE' };
  }
  const hersteld = selecteerEnHerstelBronStrepen(beschikbareFragmenten, k, m);
  if (!hersteld.ok) return hersteld;
  const samengevoegd = Buffer.concat(hersteld.bronStrepen);
  if (oorspronkelijkeLengte > samengevoegd.length) {
    return { ok: false, fout: 'OORSPRONKELIJKE_LENGTE_OVERSCHRIJDT_STREPEN' };
  }
  return { ok: true, gegevens: samengevoegd.subarray(0, oorspronkelijkeLengte) };
}

/**
 * Добудовує всі (k + m) зашифрованих фрагментів із будь-яких k живих непошкоджених фрагментів
 * БЕЗ розшифрування даних і БЕЗ доступу до ключа власника DEK/KEK (§11, §22 маніфесту).
 */
export function herbouwReedSolomonFragmentenZonderSleutel(
  beschikbareFragmenten: readonly ReedSolomonFragment[],
  k: number,
  m: number,
  oorspronkelijkeLengte: number,
): { ok: true; fragmenten: ReedSolomonFragment[] } | { ok: false; fout: string } {
  const gedecodeerd = decodeerReedSolomon(beschikbareFragmenten, k, m, oorspronkelijkeLengte);
  if (!gedecodeerd.ok) return gedecodeerd;
  const opnieuw = codeerReedSolomon(gedecodeerd.gegevens, k, m);
  return { ok: true, fragmenten: opnieuw.fragmenten };
}

// =================================================================================================
// Потокове сегментоване конвертне шифрування об'єктів та підписаний маніфест об'єкта.
// =================================================================================================

export interface KlimopSegmentManifest {
  segmentIndex: number;
  ivB64u: string;
  versleuteldeLengte: number; // довжина шифротексту + 16 байтів мітки автентичності
  streepLengte: number;
  fragmentRefs: ReadonlyArray<{
    index: number;
    soort: 'gegevens' | 'pariteit';
    sha256: string;
  }>;
}

export interface KlimopObjectManifestKern {
  schema: 1;
  objectId: string;
  eigenaarIdentiteit: KlimopKnooppuntIdentiteit;
  laag: KlimopOpslagLaag;
  epoche: number;
  profiel: KlimopVersleutelingProfiel;
  reedSolomon: { k: number; m: number };
  segmentGrootte: number;
  klareLengteBytes: number;
  klareInhoudSha256: string;
  dekOmslag: KlimopDekOmslag;
  segmenten: readonly KlimopSegmentManifest[];
  aangemaaktOp: string;
}

export interface KlimopObjectManifest extends KlimopObjectManifestKern {
  handtekeningB64u: string;
}

const MANIFEST_HANDTEKENING_DOMEIN = 'klimop-object-manifest-v1|';

function maakSegmentIv(segmentIndex: number): Buffer {
  const iv = Buffer.alloc(12, 0);
  iv.write('KSEG', 0, 4, 'ascii');
  iv.writeBigUInt64BE(BigInt(segmentIndex), 4);
  return iv;
}

function maakSegmentAad(
  objectId: string,
  eigenaarId: string,
  laag: KlimopOpslagLaag,
  epoche: number,
  profiel: KlimopVersleutelingProfiel,
  segmentIndex: number,
): Buffer {
  return Buffer.from(
    `klimop-obj-seg-v1|${objectId}|${eigenaarId}|${laag}|epoche:${epoche}|${profiel}|seg:${segmentIndex}`,
    'utf8',
  );
}

/**
 * Наскрізно шифрує об'єкт на пристрої власника одноразовим ключем DEK, загортає DEK під KEK власника,
 * розбиває кожен зашифрований сегмент на (k + m) фрагментів Ріда–Соломона та підписує маніфест паспортом Ed25519.
 */
export function versleutelEnVerdeelObject(opties: {
  inhoud: Buffer;
  objectId: string;
  eigenaar: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
  kek: Buffer;
  laag?: KlimopOpslagLaag;
  epoche?: number;
  profiel?: KlimopVersleutelingProfiel;
  k: number;
  m: number;
  segmentGrootte?: number;
  nuIso?: string;
}): {
  manifest: KlimopObjectManifest;
  fragmentenPerSegment: ReadonlyArray<readonly ReedSolomonFragment[]>;
} {
  const laag = opties.laag ?? 'grote_versleutelde_objecten';
  const epoche = opties.epoche ?? 1;
  const profiel = opties.profiel ?? 'klimop-v1-chacha20-poly1305';
  const segmentGrootte = Math.max(256, Math.trunc(opties.segmentGrootte ?? 65536));
  const alg = aeadAlgoritmeVoorProfiel(profiel);

  const dek = randomBytes(32);
  try {
    const omslagCtx: KlimopDekOmslagContext = {
      eigenaarKnooppuntId: opties.eigenaar.identiteit.knooppuntId,
      objectId: opties.objectId,
      laag,
      epoche,
      profiel,
    };
    const dekOmslag = wikkelObjectDekIn(dek, opties.kek, omslagCtx);

    const aantalSegmenten = Math.max(1, Math.ceil(opties.inhoud.length / segmentGrootte));
    const segmenten: KlimopSegmentManifest[] = [];
    const fragmentenPerSegment: ReedSolomonFragment[][] = [];

    for (let s = 0; s < aantalSegmenten; s++) {
      const start = s * segmentGrootte;
      const eind = Math.min(opties.inhoud.length, start + segmentGrootte);
      const stuk = opties.inhoud.subarray(start, eind);
      const iv = maakSegmentIv(s);
      const aad = maakSegmentAad(
        opties.objectId,
        opties.eigenaar.identiteit.knooppuntId,
        laag,
        epoche,
        profiel,
        s,
      );
      const { cijfertekst, tag } = versleutelAead(alg, dek, iv, stuk, aad);
      const pakket = Buffer.concat([cijfertekst, tag]);
      const gecodeerd = codeerReedSolomon(pakket, opties.k, opties.m);

      fragmentenPerSegment.push(gecodeerd.fragmenten);
      segmenten.push({
        segmentIndex: s,
        ivB64u: iv.toString('base64url'),
        versleuteldeLengte: pakket.length,
        streepLengte: gecodeerd.streepLengte,
        fragmentRefs: gecodeerd.fragmenten.map((f) => ({
          index: f.index,
          soort: f.soort,
          sha256: f.sha256,
        })),
      });
    }

    const kern: KlimopObjectManifestKern = {
      schema: 1,
      objectId: opties.objectId,
      eigenaarIdentiteit: opties.eigenaar.identiteit,
      laag,
      epoche,
      profiel,
      reedSolomon: { k: opties.k, m: opties.m },
      segmentGrootte,
      klareLengteBytes: opties.inhoud.length,
      klareInhoudSha256: createHash('sha256').update(opties.inhoud).digest('hex'),
      dekOmslag,
      segmenten,
      aangemaaktOp: opties.nuIso ?? new Date().toISOString(),
    };

    const priv = createPrivateKey({
      key: Buffer.from(opties.eigenaar.geheimeSleutelPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    const handtekeningB64u = sign(
      null,
      Buffer.from(MANIFEST_HANDTEKENING_DOMEIN + canoniekeJson(kern), 'utf8'),
      priv,
    ).toString('base64url');

    return {
      manifest: { ...kern, handtekeningB64u },
      fragmentenPerSegment,
    };
  } finally {
    dek.fill(0);
  }
}

/** Перевіряє цілісність і підпис Ed25519 маніфесту об'єкта без потреби у ключі розшифрування KEK. */
export function verifieerObjectManifest(manifest: KlimopObjectManifest): { ok: true } | { ok: false; fout: string } {
  if (!manifest || manifest.schema !== 1) return { ok: false, fout: 'MANIFEST_ONGELDIGE_VORM' };
  const id = manifest.eigenaarIdentiteit;
  if (!id || berekenKnooppuntId(id.publiekeSleutelDerB64u) !== id.knooppuntId) {
    return { ok: false, fout: 'MANIFEST_EIGENAAR_PASPOORT_ONGELDIG' };
  }
  try {
    const { handtekeningB64u, ...kern } = manifest;
    const pub = createPublicKey({
      key: Buffer.from(id.publiekeSleutelDerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    const geldig = verify(
      null,
      Buffer.from(MANIFEST_HANDTEKENING_DOMEIN + canoniekeJson(kern), 'utf8'),
      pub,
      Buffer.from(handtekeningB64u, 'base64url'),
    );
    return geldig ? { ok: true } : { ok: false, fout: 'MANIFEST_HANDTEKENING_ONGELDIG' };
  } catch {
    return { ok: false, fout: 'MANIFEST_VERIFICATIE_FOUT' };
  }
}

/**
 * Збирає зашифровані сегменти з будь-яких k доступних фрагментів кожного сегмента за схемою Ріда–Соломона,
 * розгортає DEK під ключем KEK власника та повертає перевірений відкритий об'єкт.
 */
export function herstelEnOntsleutelObject(opties: {
  manifest: KlimopObjectManifest;
  fragmentenPerSegment: ReadonlyArray<readonly ReedSolomonFragment[]>;
  kek: Buffer;
}): { ok: true; inhoud: Buffer } | { ok: false; fout: string } {
  const mv = verifieerObjectManifest(opties.manifest);
  if (!mv.ok) return mv;

  const { manifest } = opties;
  if (opties.fragmentenPerSegment.length !== manifest.segmenten.length) {
    return { ok: false, fout: 'AANTAL_SEGMENTEN_KOMT_NIET_OVEREEN' };
  }

  const uitgepakt = pakObjectDekUit(manifest.dekOmslag, opties.kek, {
    eigenaarKnooppuntId: manifest.eigenaarIdentiteit.knooppuntId,
    objectId: manifest.objectId,
    laag: manifest.laag,
    epoche: manifest.epoche,
    profiel: manifest.profiel,
  });
  if (!uitgepakt.ok) return uitgepakt;

  const dek = uitgepakt.dek;
  const alg = aeadAlgoritmeVoorProfiel(manifest.profiel);
  try {
    const stukken: Buffer[] = [];
    for (let s = 0; s < manifest.segmenten.length; s++) {
      const segMeta = manifest.segmenten[s];
      const verwachtShaPerIndex = new Map(segMeta.fragmentRefs.map((r) => [r.index, r.sha256]));
      const gefilterd = opties.fragmentenPerSegment[s].filter(
        (f) => verwachtShaPerIndex.get(f.index) === f.sha256,
      );

      const rsUit = decodeerReedSolomon(
        gefilterd,
        manifest.reedSolomon.k,
        manifest.reedSolomon.m,
        segMeta.versleuteldeLengte,
      );
      if (!rsUit.ok) return rsUit;
      if (rsUit.gegevens.length < 16) return { ok: false, fout: 'SEGMENT_PAK_TE_KORT' };

      const ct = rsUit.gegevens.subarray(0, rsUit.gegevens.length - 16);
      const tag = rsUit.gegevens.subarray(rsUit.gegevens.length - 16);
      const aad = maakSegmentAad(
        manifest.objectId,
        manifest.eigenaarIdentiteit.knooppuntId,
        manifest.laag,
        manifest.epoche,
        manifest.profiel,
        s,
      );
      try {
        const klaarStuk = ontsleutelAead(alg, dek, Buffer.from(segMeta.ivB64u, 'base64url'), ct, tag, aad);
        stukken.push(klaarStuk);
      } catch {
        return { ok: false, fout: 'SEGMENT_AUTHENTICATIE_MISLUKT' };
      }
    }

    const samengevoegd = Buffer.concat(stukken);
    const eindSha = createHash('sha256').update(samengevoegd).digest('hex');
    if (samengevoegd.length !== manifest.klareLengteBytes || eindSha !== manifest.klareInhoudSha256) {
      return { ok: false, fout: 'OBJECT_EINDHASH_KOMT_NIET_OVEREEN' };
    }
    return { ok: true, inhoud: samengevoegd };
  } finally {
    dek.fill(0);
  }
}

// =================================================================================================
// Перехідний міст зі сліпим пошуковим індексом HMAC-SHA-256 для таблиць реєстру сховища ключів
// (поступовий перехід позицій 'nog-niet' зі збереженням читання наявних записів, §35 маніфесту).
// =================================================================================================

/** Обчислює нормалізовані сліпі пошукові відбитки bzk1_<32 hex> під окремим пошуковим підключем власника. */
export function berekenBlindeZoekTermen(zoekSleutel: Buffer, tabelVeldDomein: string, tekst: string): string[] {
  if (zoekSleutel.length !== 32) throw new Error('ONGELDIGE_ZOEKSLEUTEL');
  const woorden = String(tekst ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}@._-]{2,}/gu) ?? [];
  const uniek = [...new Set(woorden)];
  return uniek.map((woord) => {
    const mac = createHmac('sha256', zoekSleutel)
      .update(`klimop-blind-zoek-v1|${tabelVeldDomein}|${woord}`, 'utf8')
      .digest('hex');
    return `bzk1_${mac.slice(0, 32)}`;
  });
}

/** Шифрує окреме текстове поле таблиці у зворотно сумісну обгортку `klm1.<epoche>.<profiel>.<iv>.<ct>.<tag>`. */
export function versleutelOvergangsVeld(
  klareWaarde: string,
  veldSleutel: Buffer,
  context: { tabel: string; rijId: string; epoche?: number; profiel?: KlimopVersleutelingProfiel },
): string {
  const epoche = context.epoche ?? 1;
  const profiel = context.profiel ?? 'klimop-v1-chacha20-poly1305';
  const iv = randomBytes(12);
  const aad = Buffer.from(`klimop-veld-v1|${context.tabel}|${context.rijId}|epoche:${epoche}|${profiel}`, 'utf8');
  const { cijfertekst, tag } = versleutelAead(
    aeadAlgoritmeVoorProfiel(profiel),
    veldSleutel,
    iv,
    Buffer.from(klareWaarde, 'utf8'),
    aad,
  );
  return `klm1.${epoche}.${profiel}.${iv.toString('base64url')}.${cijfertekst.toString('base64url')}.${tag.toString('base64url')}`;
}

/**
 * Читає поле таблиці у перехідному режимі (§35 маніфесту): розшифровує нові рядки `klm1.*`,
 * а старі незашифровані рядки повертає з явною позначкою `bron: 'erfenis_onversleuteld'` для поступового перешифрування.
 */
export function ontsleutelOvergangsVeld(
  opgeslagenWaarde: string,
  veldSleutel: Buffer,
  context: { tabel: string; rijId: string },
): { ok: true; waarde: string; bron: 'klm1' | 'erfenis_onversleuteld'; epoche: number | null } | { ok: false; fout: string } {
  if (!opgeslagenWaarde.startsWith('klm1.')) {
    return { ok: true, waarde: opgeslagenWaarde, bron: 'erfenis_onversleuteld', epoche: null };
  }
  const delen = opgeslagenWaarde.split('.');
  if (delen.length !== 6) return { ok: false, fout: 'OVERGANGSVELD_ONGELDIGE_VORM' };
  const epoche = Number.parseInt(delen[1], 10);
  const profiel = delen[2] as KlimopVersleutelingProfiel;
  if (!Number.isInteger(epoche) || epoche < 1 || !KLIMOP_VERSLEUTELING_PROFIELEN.includes(profiel)) {
    return { ok: false, fout: 'OVERGANGSVELD_ONBEKEND_PROFIEL' };
  }
  try {
    const aad = Buffer.from(`klimop-veld-v1|${context.tabel}|${context.rijId}|epoche:${epoche}|${profiel}`, 'utf8');
    const klaar = ontsleutelAead(
      aeadAlgoritmeVoorProfiel(profiel),
      veldSleutel,
      Buffer.from(delen[3], 'base64url'),
      Buffer.from(delen[4], 'base64url'),
      Buffer.from(delen[5], 'base64url'),
      aad,
    );
    return { ok: true, waarde: klaar.toString('utf8'), bron: 'klm1', epoche };
  } catch {
    return { ok: false, fout: 'OVERGANGSVELD_AUTHENTICATIE_MISLUKT' };
  }
}
