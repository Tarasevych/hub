// KLIMOP-019 (21.11.2026, хвиля 2 виправлень за незалежною перевіркою AUDIT-002):
// Адресне шифрування підчасток DKG і нульових вкладів оновлення епох.
//
// Вада, знайдена перевіркою: пакети `DkgRondePakket.subdelenPerOntvanger` і
// `ProactieveNulBijdrage.subdelenPerOntvanger` передавалися координаторові відкритими, тож координатор,
// який збирав і розсилав усі пакети, міг відновити повний секрет групи. Тепер:
//   1. кожен вузол створює для набору ключів окремий ключ отримання X25519 і підписує його ключем
//      ідентичності Ed25519 (ідентифікатор вузла — відбиток цього ключа, тому підміна помітна);
//   2. відправник шифрує кожну підчастку лише для її адресата: одноразовий X25519 (ECDH) →
//      HKDF-SHA256 → ChaCha20-Poly1305 (RFC 8439), де додаткові автентифіковані дані містять набір,
//      вид обміну, епоху, відправника, отримувача та відбиток складу учасників;
//   3. кожен пакет підписує вузол-відправник, а отримувач перевіряє підпис і збіг відбитка складу
//      учасників із тим, який обчислив сам, — координатор не може непомітно підмінити склад чи пакет.
// Обмеження (чесно): ключ отримання один на набір і не змінюється між епохами, тож компрометація
// цього ключа розкриває підчастки всіх епох набору; щоепохова заміна ключа — наступний крок.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { berekenKnooppuntId, canoniekeJson, type KlimopKnooppuntIdentiteit } from './kern';
import type { DkgRondePakket, ProactieveNulBijdrage } from './drempelsleutels';

const X25519_SPKI_KOP = Buffer.from('302a300506032b656e032100', 'hex');
const ONTVANGSTSLEUTEL_DOMEIN = 'klimop-drempel-ontvangstsleutel-v1|';
const PAKKET_DOMEIN = 'klimop-drempel-pakket-v1|';
const HKDF_INFO_VOORVOEGSEL = 'klimop-drempel-subdeel-v1|';

export interface KlimopDrempelOntvangstSleutel {
  schema: 1;
  setId: string;
  deelnemerIndex: number;
  knooppuntId: string;
  /** Сирий 32-байтовий відкритий ключ X25519 у base64url. */
  x25519PubliekB64u: string;
  /** Підпис Ed25519 ключем ідентичності вузла над канонічним вмістом без цього поля. */
  handtekeningB64u: string;
}

export interface KlimopDrempelDeelnemer {
  identiteit: KlimopKnooppuntIdentiteit;
  ontvangstSleutel: KlimopDrempelOntvangstSleutel;
}

export interface KlimopVersleuteldSubdeel {
  efemeerPubliekB64u: string;
  nonceB64u: string;
  cijfertekstB64u: string; // шифротекст || мітка автентичності (16 байтів)
}

export interface KlimopSubdeelContext {
  setId: string;
  soort: 'dkg' | 'ververs';
  epoche: number;
  afzenderIndex: number;
  ontvangerIndex: number;
  samenstellingHex: string;
}

export interface VersleuteldDkgRondePakket {
  schema: 2;
  setId: string;
  afzenderIndex: number;
  afzenderKnooppuntId: string;
  drempel: number;
  totaal: number;
  samenstellingHex: string;
  toezeggingenHex: readonly string[];
  versleuteldeSubdelen: Readonly<Record<number, KlimopVersleuteldSubdeel>>;
  handtekeningB64u: string;
}

export interface VersleuteldeNulBijdrage {
  schema: 2;
  setId: string;
  vanEpoche: number;
  naarEpoche: number;
  afzenderIndex: number;
  afzenderKnooppuntId: string;
  drempel: number;
  totaal: number;
  samenstellingHex: string;
  nulToezeggingenVanaf1Hex: readonly string[];
  versleuteldeSubdelen: Readonly<Record<number, KlimopVersleuteldSubdeel>>;
  handtekeningB64u: string;
}

type Ondertekenaar = { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };

function ondertekenEd25519(domein: string, inhoud: unknown, ondertekenaar: Ondertekenaar): string {
  const priv = createPrivateKey({
    key: Buffer.from(ondertekenaar.geheimeSleutelPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(domein + canoniekeJson(inhoud), 'utf8'), priv).toString('base64url');
}

function verifieerEd25519(domein: string, inhoud: unknown, handtekeningB64u: string, identiteit: KlimopKnooppuntIdentiteit): boolean {
  try {
    if (berekenKnooppuntId(identiteit.publiekeSleutelDerB64u) !== identiteit.knooppuntId) return false;
    const pub = createPublicKey({ key: Buffer.from(identiteit.publiekeSleutelDerB64u, 'base64url'), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(domein + canoniekeJson(inhoud), 'utf8'), pub, Buffer.from(handtekeningB64u, 'base64url'));
  } catch {
    return false;
  }
}

function x25519PubliekUitRuw(ruwB64u: string): KeyObject {
  const ruw = Buffer.from(ruwB64u, 'base64url');
  if (ruw.length !== 32) throw new Error('X25519_SLEUTEL_LENGTE_ONGELDIG');
  return createPublicKey({ key: Buffer.concat([X25519_SPKI_KOP, ruw]), format: 'der', type: 'spki' });
}

function x25519RuwUitPubliek(pub: KeyObject): string {
  const der = pub.export({ type: 'spki', format: 'der' }) as Buffer;
  return der.subarray(der.length - 32).toString('base64url');
}

/** Фаза 0: вузол створює власний ключ отримання X25519 для набору й підписує його ключем ідентичності. */
export function maakDrempelOntvangstSleutel(opties: {
  setId: string;
  deelnemerIndex: number;
  knooppunt: Ondertekenaar;
}): { publiek: KlimopDrempelOntvangstSleutel; geheimX25519Pkcs8B64u: string } {
  if (!opties.setId || !Number.isInteger(opties.deelnemerIndex) || opties.deelnemerIndex < 1) {
    throw new Error('ONTVANGSTSLEUTEL_PARAMETERS_ONGELDIG');
  }
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const inhoud = {
    schema: 1 as const,
    setId: opties.setId,
    deelnemerIndex: opties.deelnemerIndex,
    knooppuntId: opties.knooppunt.identiteit.knooppuntId,
    x25519PubliekB64u: x25519RuwUitPubliek(publicKey),
  };
  return {
    publiek: { ...inhoud, handtekeningB64u: ondertekenEd25519(ONTVANGSTSLEUTEL_DOMEIN, inhoud, opties.knooppunt) },
    geheimX25519Pkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

/**
 * Перевіряє склад учасників: ідентичності самоперевірні (ідентифікатор = відбиток ключа), ключі отримання
 * підписані відповідними вузлами, індекси 1..n без пропусків і повторів, набір збігається.
 * Повертає відбиток складу, який кожен вузол обчислює сам і вкладає в підписані пакети.
 */
export function verifieerDrempelSamenstelling(
  setId: string,
  deelnemers: readonly KlimopDrempelDeelnemer[],
): { ok: true; samenstellingHex: string } | { ok: false; fout: string } {
  if (!Array.isArray(deelnemers) || deelnemers.length < 2) return { ok: false, fout: 'SAMENSTELLING_TE_KLEIN' };
  const gesorteerd = [...deelnemers].sort((a, b) => a.ontvangstSleutel.deelnemerIndex - b.ontvangstSleutel.deelnemerIndex);
  const gezieneKnooppunten = new Set<string>();
  for (let i = 0; i < gesorteerd.length; i++) {
    const { identiteit, ontvangstSleutel } = gesorteerd[i];
    if (ontvangstSleutel.deelnemerIndex !== i + 1) return { ok: false, fout: 'SAMENSTELLING_INDEXEN_ONGELDIG' };
    if (ontvangstSleutel.setId !== setId || ontvangstSleutel.schema !== 1) return { ok: false, fout: 'ONTVANGSTSLEUTEL_SET_ONGELDIG' };
    if (ontvangstSleutel.knooppuntId !== identiteit.knooppuntId || gezieneKnooppunten.has(identiteit.knooppuntId)) {
      return { ok: false, fout: 'SAMENSTELLING_KNOOPPUNT_ONGELDIG' };
    }
    gezieneKnooppunten.add(identiteit.knooppuntId);
    const { handtekeningB64u, ...inhoud } = ontvangstSleutel;
    if (!verifieerEd25519(ONTVANGSTSLEUTEL_DOMEIN, inhoud, handtekeningB64u, identiteit)) {
      return { ok: false, fout: 'ONTVANGSTSLEUTEL_HANDTEKENING_ONGELDIG' };
    }
    try {
      x25519PubliekUitRuw(ontvangstSleutel.x25519PubliekB64u);
    } catch {
      return { ok: false, fout: 'ONTVANGSTSLEUTEL_X25519_ONGELDIG' };
    }
  }
  const samenstellingHex = createHash('sha256')
    .update('klimop-drempel-samenstelling-v1|')
    .update(canoniekeJson({
      setId,
      deelnemers: gesorteerd.map((d) => ({
        index: d.ontvangstSleutel.deelnemerIndex,
        knooppuntId: d.identiteit.knooppuntId,
        x25519: d.ontvangstSleutel.x25519PubliekB64u,
      })),
    }))
    .digest('hex');
  return { ok: true, samenstellingHex };
}

function contextTekst(c: KlimopSubdeelContext): string {
  return canoniekeJson({
    setId: c.setId,
    soort: c.soort,
    epoche: c.epoche,
    afzenderIndex: c.afzenderIndex,
    ontvangerIndex: c.ontvangerIndex,
    samenstellingHex: c.samenstellingHex,
  });
}

function leidSleutelAf(gedeeld: Buffer, efemeerRuw: Buffer, ontvangerRuw: Buffer, c: KlimopSubdeelContext): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.concat([gedeeld, efemeerRuw, ontvangerRuw]),
    Buffer.from(c.samenstellingHex, 'hex'),
    Buffer.from(HKDF_INFO_VOORVOEGSEL + contextTekst(c), 'utf8'),
    32,
  ));
}

/** Шифрує одну підчастку (32-байтовий скаляр у hex) лише для адресата. */
export function versleutelSubdeel(c: KlimopSubdeelContext, subdeelHex: string, ontvangerX25519PubliekB64u: string): KlimopVersleuteldSubdeel {
  if (!/^[0-9a-f]{64}$/i.test(subdeelHex)) throw new Error('SUBDEEL_VORM_ONGELDIG');
  const ontvangerPub = x25519PubliekUitRuw(ontvangerX25519PubliekB64u);
  const efemeer = generateKeyPairSync('x25519');
  const gedeeld = diffieHellman({ privateKey: efemeer.privateKey, publicKey: ontvangerPub });
  const efemeerRuw = Buffer.from(x25519RuwUitPubliek(efemeer.publicKey), 'base64url');
  const sleutel = leidSleutelAf(gedeeld, efemeerRuw, Buffer.from(ontvangerX25519PubliekB64u, 'base64url'), c);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('chacha20-poly1305', sleutel, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(contextTekst(c), 'utf8'), { plaintextLength: 32 });
  const open = Buffer.from(subdeelHex, 'hex');
  const ct = Buffer.concat([cipher.update(open), cipher.final(), cipher.getAuthTag()]);
  open.fill(0);
  gedeeld.fill(0);
  sleutel.fill(0);
  return { efemeerPubliekB64u: efemeerRuw.toString('base64url'), nonceB64u: nonce.toString('base64url'), cijfertekstB64u: ct.toString('base64url') };
}

/** Розшифровує підчастку власним закритим ключем отримання; будь-яка зміна контексту дає відмову. */
export function ontsleutelSubdeel(
  c: KlimopSubdeelContext,
  envelop: KlimopVersleuteldSubdeel,
  eigenGeheimX25519Pkcs8B64u: string,
): { ok: true; subdeelHex: string } | { ok: false; fout: string } {
  try {
    const priv = createPrivateKey({ key: Buffer.from(eigenGeheimX25519Pkcs8B64u, 'base64url'), format: 'der', type: 'pkcs8' });
    const eigenRuw = Buffer.from(x25519RuwUitPubliek(createPublicKey(priv)), 'base64url');
    const efemeerRuw = Buffer.from(envelop.efemeerPubliekB64u, 'base64url');
    const gedeeld = diffieHellman({ privateKey: priv, publicKey: x25519PubliekUitRuw(envelop.efemeerPubliekB64u) });
    const sleutel = leidSleutelAf(gedeeld, efemeerRuw, eigenRuw, c);
    const ct = Buffer.from(envelop.cijfertekstB64u, 'base64url');
    if (ct.length !== 48) return { ok: false, fout: 'SUBDEEL_CIJFERTEKST_LENGTE_ONGELDIG' };
    const decipher = createDecipheriv('chacha20-poly1305', sleutel, Buffer.from(envelop.nonceB64u, 'base64url'), { authTagLength: 16 });
    decipher.setAAD(Buffer.from(contextTekst(c), 'utf8'), { plaintextLength: 32 });
    decipher.setAuthTag(ct.subarray(32));
    const open = Buffer.concat([decipher.update(ct.subarray(0, 32)), decipher.final()]);
    const hex = open.toString('hex');
    open.fill(0);
    gedeeld.fill(0);
    sleutel.fill(0);
    return { ok: true, subdeelHex: hex };
  } catch {
    return { ok: false, fout: 'SUBDEEL_ONTSLEUTELING_MISLUKT' };
  }
}

function zoekDeelnemer(deelnemers: readonly KlimopDrempelDeelnemer[], index: number): KlimopDrempelDeelnemer | undefined {
  return deelnemers.find((d) => d.ontvangstSleutel.deelnemerIndex === index);
}

/** Відправник: шифрує всі підчастки свого відкритого DKG-пакета для адресатів і підписує результат. */
export function versleutelDkgPakket(opties: {
  pakket: DkgRondePakket;
  deelnemers: readonly KlimopDrempelDeelnemer[];
  samenstellingHex: string;
  afzender: Ondertekenaar;
}): VersleuteldDkgRondePakket {
  const { pakket } = opties;
  const versleuteldeSubdelen: Record<number, KlimopVersleuteldSubdeel> = {};
  for (let i = 1; i <= pakket.totaal; i++) {
    const ontvanger = zoekDeelnemer(opties.deelnemers, i);
    if (!ontvanger) throw new Error('DKG_ONTVANGER_ONTBREEKT');
    versleuteldeSubdelen[i] = versleutelSubdeel(
      { setId: pakket.setId, soort: 'dkg', epoche: 1, afzenderIndex: pakket.afzenderIndex, ontvangerIndex: i, samenstellingHex: opties.samenstellingHex },
      pakket.subdelenPerOntvanger[i],
      ontvanger.ontvangstSleutel.x25519PubliekB64u,
    );
  }
  const inhoud = {
    schema: 2 as const,
    setId: pakket.setId,
    afzenderIndex: pakket.afzenderIndex,
    afzenderKnooppuntId: opties.afzender.identiteit.knooppuntId,
    drempel: pakket.drempel,
    totaal: pakket.totaal,
    samenstellingHex: opties.samenstellingHex,
    toezeggingenHex: [...pakket.toezeggingenHex],
    versleuteldeSubdelen,
  };
  return { ...inhoud, handtekeningB64u: ondertekenEd25519(PAKKET_DOMEIN, inhoud, opties.afzender) };
}

/**
 * Отримувач: перевіряє підпис відправника й відбиток складу, розшифровує лише власну підчастку і
 * повертає відкритий пакет, у якому є тільки підчастка цього отримувача.
 */
export function ontsleutelDkgPakketVoorOntvanger(opties: {
  pakket: VersleuteldDkgRondePakket;
  deelnemers: readonly KlimopDrempelDeelnemer[];
  samenstellingHex: string;
  ontvangerIndex: number;
  eigenGeheimX25519Pkcs8B64u: string;
}): { ok: true; pakket: DkgRondePakket } | { ok: false; fout: string; verdachteAfzenderIndex?: number } {
  const { pakket } = opties;
  const verdacht = pakket?.afzenderIndex;
  if (!pakket || pakket.schema !== 2) return { ok: false, fout: 'DKG_PAKKET_VORM_ONGELDIG', verdachteAfzenderIndex: verdacht };
  if (pakket.samenstellingHex !== opties.samenstellingHex) return { ok: false, fout: 'DKG_SAMENSTELLING_VERSCHILT', verdachteAfzenderIndex: verdacht };
  const afzender = zoekDeelnemer(opties.deelnemers, pakket.afzenderIndex);
  if (!afzender || afzender.identiteit.knooppuntId !== pakket.afzenderKnooppuntId) {
    return { ok: false, fout: 'DKG_AFZENDER_ONBEKEND', verdachteAfzenderIndex: verdacht };
  }
  const { handtekeningB64u, ...inhoud } = pakket;
  if (!verifieerEd25519(PAKKET_DOMEIN, inhoud, handtekeningB64u, afzender.identiteit)) {
    return { ok: false, fout: 'DKG_PAKKET_HANDTEKENING_ONGELDIG', verdachteAfzenderIndex: verdacht };
  }
  const envelop = pakket.versleuteldeSubdelen[opties.ontvangerIndex];
  if (!envelop) return { ok: false, fout: 'DKG_SUBDEEL_ONTBREEKT', verdachteAfzenderIndex: verdacht };
  const o = ontsleutelSubdeel(
    { setId: pakket.setId, soort: 'dkg', epoche: 1, afzenderIndex: pakket.afzenderIndex, ontvangerIndex: opties.ontvangerIndex, samenstellingHex: opties.samenstellingHex },
    envelop,
    opties.eigenGeheimX25519Pkcs8B64u,
  );
  if (!o.ok) return { ...o, verdachteAfzenderIndex: verdacht };
  return {
    ok: true,
    pakket: {
      schema: 1,
      setId: pakket.setId,
      afzenderIndex: pakket.afzenderIndex,
      drempel: pakket.drempel,
      totaal: pakket.totaal,
      toezeggingenHex: pakket.toezeggingenHex,
      subdelenPerOntvanger: { [opties.ontvangerIndex]: o.subdeelHex },
    },
  };
}

/** Відправник: шифрує нульовий вклад оновлення епохи для кожного адресата й підписує його. */
export function versleutelNulBijdrage(opties: {
  bijdrage: ProactieveNulBijdrage;
  deelnemers: readonly KlimopDrempelDeelnemer[];
  samenstellingHex: string;
  afzender: Ondertekenaar;
}): VersleuteldeNulBijdrage {
  const b = opties.bijdrage;
  const versleuteldeSubdelen: Record<number, KlimopVersleuteldSubdeel> = {};
  for (let i = 1; i <= b.totaal; i++) {
    const ontvanger = zoekDeelnemer(opties.deelnemers, i);
    if (!ontvanger) throw new Error('VERVERS_ONTVANGER_ONTBREEKT');
    versleuteldeSubdelen[i] = versleutelSubdeel(
      { setId: b.setId, soort: 'ververs', epoche: b.naarEpoche, afzenderIndex: b.afzenderIndex, ontvangerIndex: i, samenstellingHex: opties.samenstellingHex },
      b.subdelenPerOntvanger[i],
      ontvanger.ontvangstSleutel.x25519PubliekB64u,
    );
  }
  const inhoud = {
    schema: 2 as const,
    setId: b.setId,
    vanEpoche: b.vanEpoche,
    naarEpoche: b.naarEpoche,
    afzenderIndex: b.afzenderIndex,
    afzenderKnooppuntId: opties.afzender.identiteit.knooppuntId,
    drempel: b.drempel,
    totaal: b.totaal,
    samenstellingHex: opties.samenstellingHex,
    nulToezeggingenVanaf1Hex: [...b.nulToezeggingenVanaf1Hex],
    versleuteldeSubdelen,
  };
  return { ...inhoud, handtekeningB64u: ondertekenEd25519(PAKKET_DOMEIN, inhoud, opties.afzender) };
}

/** Отримувач: перевіряє й розшифровує лише власну підчастку нульового вкладу. */
export function ontsleutelNulBijdrageVoorOntvanger(opties: {
  bijdrage: VersleuteldeNulBijdrage;
  deelnemers: readonly KlimopDrempelDeelnemer[];
  samenstellingHex: string;
  ontvangerIndex: number;
  eigenGeheimX25519Pkcs8B64u: string;
}): { ok: true; bijdrage: ProactieveNulBijdrage } | { ok: false; fout: string } {
  const b = opties.bijdrage;
  if (!b || b.schema !== 2) return { ok: false, fout: 'PROACTIEVE_BIJDRAGE_VORM_ONGELDIG' };
  if (b.samenstellingHex !== opties.samenstellingHex) return { ok: false, fout: 'VERVERS_SAMENSTELLING_VERSCHILT' };
  const afzender = zoekDeelnemer(opties.deelnemers, b.afzenderIndex);
  if (!afzender || afzender.identiteit.knooppuntId !== b.afzenderKnooppuntId) return { ok: false, fout: 'VERVERS_AFZENDER_ONBEKEND' };
  const { handtekeningB64u, ...inhoud } = b;
  if (!verifieerEd25519(PAKKET_DOMEIN, inhoud, handtekeningB64u, afzender.identiteit)) {
    return { ok: false, fout: 'VERVERS_PAKKET_HANDTEKENING_ONGELDIG' };
  }
  const envelop = b.versleuteldeSubdelen[opties.ontvangerIndex];
  if (!envelop) return { ok: false, fout: 'PROACTIEF_SUBDEEL_ONTBREEKT_OF_ONGELDIG' };
  const o = ontsleutelSubdeel(
    { setId: b.setId, soort: 'ververs', epoche: b.naarEpoche, afzenderIndex: b.afzenderIndex, ontvangerIndex: opties.ontvangerIndex, samenstellingHex: opties.samenstellingHex },
    envelop,
    opties.eigenGeheimX25519Pkcs8B64u,
  );
  if (!o.ok) return o;
  return {
    ok: true,
    bijdrage: {
      schema: 1,
      setId: b.setId,
      vanEpoche: b.vanEpoche,
      naarEpoche: b.naarEpoche,
      afzenderIndex: b.afzenderIndex,
      drempel: b.drempel,
      totaal: b.totaal,
      nulToezeggingenVanaf1Hex: b.nulToezeggingenVanaf1Hex,
      subdelenPerOntvanger: { [opties.ontvangerIndex]: o.subdeelHex },
    },
  };
}

/** Відбиток рішення про перехід епохи: однаково обчислюється кожним вузлом і координатором. */
export function berekenVerversingBesluitId(bijdragen: readonly VersleuteldeNulBijdrage[]): string {
  const gesorteerd = [...bijdragen].sort((a, b) => a.afzenderIndex - b.afzenderIndex);
  return createHash('sha256')
    .update('klimop-epoche-verversing-besluit-v1|')
    .update(canoniekeJson(gesorteerd.map((b) => ({
      setId: b.setId,
      naarEpoche: b.naarEpoche,
      afzenderIndex: b.afzenderIndex,
      handtekeningB64u: b.handtekeningB64u,
    }))))
    .digest('hex');
}
