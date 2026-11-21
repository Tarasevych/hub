// KLIMOP-006 (20.11.2026, Етап 5 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Незалежна самосуверенна криптографічна ідентичність людини та її довірених пристроїв (§1.1, §4.2, §12, §36 Етап 5):
//   1. Кореневе посвідчення особи klid1_<32 hex> із ротацією ключів та псевдонімними службовими ідентичностями (§12);
//   2. Двосторонній підписаний міст зворотної сумісності з поточним userId платформи «Мій простір»;
//   3. Сертифікати особистих пристроїв з чітко обмеженими делегованими повноваженнями, лімітами ресурсів і миттєвим відкликанням;
//   4. Законне багатостороннє порогове відновлення доступу на основі приховувальних часток Педерсена з обов'язковим часовим
//      вікном оскарження та захистом від незаконного спадкування чи захоплення процедури відновлення (§14, §17, §39);
//   5. Групове узгодження ключів спільних просторів і оселі за принципами стандарту RFC 9420 (MLS / TreeKEM на X25519 + Ed25519 + HKDF)
//      із прямою таємницею при додаванні учасників та посткомпрометаційною безпекою при вилученні пристроїв (§12).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { canoniekeJson, type KlimopKnooppuntIdentiteit } from './kern';
import { herstelUitPedersenDelen, type PedersenVssDeel } from './drempelsleutels';

// =================================================================================================
// 1. Самосуверенна ідентичність особи (klid1_...), ротація кореня, псевдоніми та міст з userId
// =================================================================================================

export type ApparaatBevoegdheid =
  | 'lezen_werkgegevens'
  | 'schrijven_werkgegevens'
  | 'open_ruimte_sleutel'
  | 'groeps_mls_lid'
  | 'goedkeuren_uitgave'
  | 'nood_betwisting';

export const ALLE_APPARAAT_BEVOEGDHEDEN = Object.freeze<readonly ApparaatBevoegdheid[]>([
  'lezen_werkgegevens',
  'schrijven_werkgegevens',
  'open_ruimte_sleutel',
  'groeps_mls_lid',
  'goedkeuren_uitgave',
  'nood_betwisting',
]);

export interface KlimopIdentiteitOprichtingKern {
  schema: 1;
  aanvankelijkeWortelPubDerB64u: string;
  opgerichtOp: string;
  nonceB64u: string;
}

export interface KlimopIdentiteitOprichting extends KlimopIdentiteitOprichtingKern {
  persoonsId: string; // klid1_<32 hex>
  handtekeningB64u: string;
}

export interface KlimopWortelRotatieBewijs {
  schema: 1;
  persoonsId: string;
  volgnummer: number; // 1, 2, ...
  vorigeWortelPubDerB64u: string;
  nieuweWortelPubDerB64u: string;
  geroteerdOp: string;
  reden: 'geplande_rotatie' | 'wettig_drempel_herstel';
  /** Підпис попереднім кореневим ключем (при плановій ротації) або новим ключем разом із квитанцією порогового відновлення. */
  handtekeningVorigeOfHerstelB64u: string;
  handtekeningNieuweB64u: string;
  herstelAanvraagId: string | null;
  /**
   * KLIMOP-020: повний сертифікат переходу при законному відновленні — політика, заявка зі строками
   * та підписані голоси опікунів. Входить до підписаного змісту ротації й перевіряється кожним споживачем.
   */
  herstelCertificaat?: KlimopHerstelCertificaat;
}

/** KLIMOP-020: політику відновлення закріплює кореневий ключ чинної епохи ще до втрати доступу. */
export interface KlimopHerstelBeleidVerankering {
  schema: 1;
  persoonsId: string;
  epoche: number;
  beleidSha256: string;
  vastgelegdOp: string;
  handtekeningB64u: string;
}

/** KLIMOP-020: сертифікат переходу відновлення, який споживач перевіряє без довіри до вузла. */
export interface KlimopHerstelCertificaat {
  beleid: KlimopHerstelBeleid;
  aanvraag: {
    aanvraagId: string;
    persoonsId: string;
    omstandigheid: KlimopHerstelAanvraag['omstandigheid'];
    kandidaatNieuweWortelPubDerB64u: string;
    geopendOp: string;
    betwistingVerlooptOp: string;
  };
  voogdStemmen: KlimopHerstelAanvraag['voogdStemmen'];
}

export interface KlimopPersoonsStaat {
  oprichting: KlimopIdentiteitOprichting;
  rotaties: readonly KlimopWortelRotatieBewijs[];
  actieveWortelPubDerB64u: string;
  actieveEpoche: number;
  /** KLIMOP-020: закріплення політик відновлення підписами кореня відповідної епохи. */
  herstelBeleidVerankeringen?: readonly KlimopHerstelBeleidVerankering[];
}

const OPRICHTING_DOMEIN = 'klimop-persoon-oprichting-v1|';
const ROTATIE_DOMEIN = 'klimop-persoon-wortelrotatie-v1|';
const KOPPELING_DOMEIN = 'klimop-erfenis-userid-koppeling-v1|';
const APPARAAT_CERT_DOMEIN = 'klimop-apparaat-certificaat-v1|';
const APPARAAT_INTREKKING_DOMEIN = 'klimop-apparaat-intrekking-v1|';
const HERSTEL_VOOGD_DOMEIN = 'klimop-herstel-voogd-stem-v2|';
const HERSTEL_VERANKERING_DOMEIN = 'klimop-herstelbeleid-verankering-v1|';
const MS_PER_UUR = 3600 * 1000;
const HERSTEL_BETWIST_DOMEIN = 'klimop-herstel-eigenaar-betwisting-v1|';
const MLS_PAKKET_DOMEIN = 'klimop-mls-sleutelpakket-v1|';
const MLS_COMMIT_DOMEIN = 'klimop-mls-commit-v1|';
const MLS_BERICHT_DOMEIN = 'klimop-mls-bericht-v1|';

function tekenEd25519(geheimeSleutelPkcs8B64u: string, boodschap: Buffer): string {
  const priv = createPrivateKey({
    key: Buffer.from(geheimeSleutelPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, boodschap, priv).toString('base64url');
}

function verifieerEd25519(publiekeSleutelDerB64u: string, boodschap: Buffer, handtekeningB64u: string): boolean {
  try {
    const pub = createPublicKey({
      key: Buffer.from(publiekeSleutelDerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, boodschap, pub, Buffer.from(handtekeningB64u, 'base64url'));
  } catch {
    return false;
  }
}

function genereerEd25519Sleutelpaar(): { publiekDerB64u: string; geheimPkcs8B64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

function genereerX25519Sleutelpaar(): { publiekDerB64u: string; geheimPkcs8B64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    publiekDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

/** Створює нову самосуверенну криптографічну ідентичність особи `klid1_<32 hex>` без залежності від центральної БД. */
export function maakPersoonsIdentiteit(nuIso?: string): {
  staat: KlimopPersoonsStaat;
  wortelGeheimPkcs8B64u: string;
} {
  const wortel = genereerEd25519Sleutelpaar();
  const kern: KlimopIdentiteitOprichtingKern = {
    schema: 1,
    aanvankelijkeWortelPubDerB64u: wortel.publiekDerB64u,
    opgerichtOp: nuIso ?? new Date().toISOString(),
    nonceB64u: randomBytes(16).toString('base64url'),
  };
  const digest = createHash('sha256').update(OPRICHTING_DOMEIN + canoniekeJson(kern), 'utf8').digest('hex');
  const persoonsId = `klid1_${digest.slice(0, 32)}`;
  const handtekeningB64u = tekenEd25519(
    wortel.geheimPkcs8B64u,
    Buffer.from(`${OPRICHTING_DOMEIN}${persoonsId}|${canoniekeJson(kern)}`, 'utf8'),
  );
  const oprichting: KlimopIdentiteitOprichting = {
    ...kern,
    persoonsId,
    handtekeningB64u,
  };
  return {
    staat: {
      oprichting,
      rotaties: [],
      actieveWortelPubDerB64u: wortel.publiekDerB64u,
      actieveEpoche: 1,
    },
    wortelGeheimPkcs8B64u: wortel.geheimPkcs8B64u,
  };
}

/** Перевіряє засновницьке свідоцтво та повний ланцюжок планових ротацій кореневого ключа особи. */
export function verifieerPersoonsStaat(staat: KlimopPersoonsStaat): { ok: true } | { ok: false; fout: string } {
  if (!staat?.oprichting || staat.oprichting.schema !== 1) {
    return { ok: false, fout: 'PERSOON_OPRICHTING_ONGELDIG' };
  }
  const { persoonsId, handtekeningB64u, ...kern } = staat.oprichting;
  const verwachtDigest = createHash('sha256').update(OPRICHTING_DOMEIN + canoniekeJson(kern), 'utf8').digest('hex');
  if (persoonsId !== `klid1_${verwachtDigest.slice(0, 32)}`) {
    return { ok: false, fout: 'PERSOON_ID_HASH_KOMT_NIET_OVEREEN' };
  }
  if (
    !verifieerEd25519(
      kern.aanvankelijkeWortelPubDerB64u,
      Buffer.from(`${OPRICHTING_DOMEIN}${persoonsId}|${canoniekeJson(kern)}`, 'utf8'),
      handtekeningB64u,
    )
  ) {
    return { ok: false, fout: 'PERSOON_OPRICHTING_HANDTEKENING_ONGELDIG' };
  }

  if (!Array.isArray(staat.rotaties)) return { ok: false, fout: 'PERSOON_ROTATIEKETEN_GEBROKEN' };
  const verankeringen = staat.herstelBeleidVerankeringen ?? [];
  if (!Array.isArray(verankeringen)) return { ok: false, fout: 'HERSTELBELEID_VERANKERING_ONGELDIG' };
  for (const v of verankeringen) {
    const vk = verifieerHerstelBeleidVerankering(v, staat);
    if (!vk.ok) return vk;
  }

  let huidigeSleutel = kern.aanvankelijkeWortelPubDerB64u;
  for (let i = 0; i < staat.rotaties.length; i++) {
    const r = staat.rotaties[i];
    if (r.persoonsId !== persoonsId || r.volgnummer !== i + 1 || r.vorigeWortelPubDerB64u !== huidigeSleutel) {
      return { ok: false, fout: 'PERSOON_ROTATIEKETEN_GEBROKEN' };
    }
    // KLIMOP-020: невідомий вид переходу відхиляється, а не трактується як відновлення
    if (r.reden !== 'geplande_rotatie' && r.reden !== 'wettig_drempel_herstel') {
      return { ok: false, fout: 'PERSOON_ONBEKEND_ROTATIETYPE' };
    }
    const { handtekeningVorigeOfHerstelB64u, handtekeningNieuweB64u, ...rotKern } = r;
    const boodschap = Buffer.from(ROTATIE_DOMEIN + canoniekeJson(rotKern), 'utf8');
    if (!verifieerEd25519(r.nieuweWortelPubDerB64u, boodschap, handtekeningNieuweB64u)) {
      return { ok: false, fout: 'PERSOON_ROTATIE_NIEUWE_SLEUTEL_ONGELDIG' };
    }
    if (r.reden === 'geplande_rotatie') {
      if (!verifieerEd25519(huidigeSleutel, boodschap, handtekeningVorigeOfHerstelB64u)) {
        return { ok: false, fout: 'PERSOON_ROTATIE_VORIGE_SLEUTEL_ONGELDIG' };
      }
    } else {
      if (!r.herstelAanvraagId) {
        return { ok: false, fout: 'PERSOON_HERSTELROTATIE_MIST_AANVRAAG_ID' };
      }
      // KLIMOP-020: перехід відновлення засвідчується повним сертифікатом за політикою, закріпленою раніше
      const hc = verifieerHerstelCertificaat(r, staat, i + 1, verankeringen);
      if (!hc.ok) return hc;
    }
    huidigeSleutel = r.nieuweWortelPubDerB64u;
  }

  if (
    staat.actieveWortelPubDerB64u !== huidigeSleutel
    || staat.actieveEpoche !== staat.rotaties.length + 1
  ) {
    return { ok: false, fout: 'PERSOON_ACTIEVE_SLEUTEL_KOMT_NIET_OVEREEN' };
  }
  return { ok: true };
}

/** KLIMOP-020: відкритий ключ кореня для епохи `epoche` (1 — засновницький ключ). */
function wortelSleutelVoorEpoche(staat: KlimopPersoonsStaat, epoche: number): string | null {
  if (!Number.isInteger(epoche) || epoche < 1) return null;
  if (epoche === 1) return staat.oprichting.aanvankelijkeWortelPubDerB64u;
  return staat.rotaties[epoche - 2]?.nieuweWortelPubDerB64u ?? null;
}

/**
 * KLIMOP-020: чи мав кореневий ключ право видавати посвідчення на момент `momentIso`.
 * Право має лише корінь епохи, чинної в цей момент. Після законного відновлення всі попередні корені
 * втрачають право (їхній закритий ключ міг потрапити до чужих рук): видані ними посвідчення недійсні для
 * будь-якого використання після моменту відновлення (`gebruiksMomentIso`), а дії, здійснені раніше, лишаються чинними.
 */
function wortelWasBevoegdOp(
  staat: KlimopPersoonsStaat,
  wortelPub: string,
  momentIso: string,
  gebruiksMomentIso: string = momentIso,
): string | null {
  const momentMs = Date.parse(momentIso);
  const gebruikMs = Date.parse(gebruiksMomentIso);
  if (!Number.isFinite(momentMs) || !Number.isFinite(gebruikMs)) return 'TIJDSTIP_ONGELDIG';
  const aantalEpochen = staat.rotaties.length + 1;
  for (let e = 1; e <= aantalEpochen; e++) {
    if (wortelSleutelVoorEpoche(staat, e) !== wortelPub) continue;
    const beginMs = Date.parse(e === 1 ? staat.oprichting.opgerichtOp : staat.rotaties[e - 2].geroteerdOp);
    const eindIso = staat.rotaties[e - 1]?.geroteerdOp;
    const eindMs = eindIso ? Date.parse(eindIso) : Number.POSITIVE_INFINITY;
    if (!(momentMs >= beginMs && momentMs < eindMs)) continue;
    if (staat.rotaties.slice(e - 1).some((r) => r.reden === 'wettig_drempel_herstel' && Date.parse(r.geroteerdOp) <= gebruikMs)) {
      return 'WORTEL_VERVANGEN_DOOR_HERSTEL';
    }
    return null;
  }
  return 'WORTEL_NIET_GELDIG_OP_TIJDSTIP';
}

/** KLIMOP-020: канонічний відбиток політики відновлення. */
export function berekenHerstelBeleidSha256(beleid: KlimopHerstelBeleid): string {
  return createHash('sha256').update(HERSTEL_VERANKERING_DOMEIN + canoniekeJson(beleid), 'utf8').digest('hex');
}

function verifieerHerstelBeleidVerankering(
  v: KlimopHerstelBeleidVerankering,
  staat: KlimopPersoonsStaat,
): { ok: true } | { ok: false; fout: string } {
  if (!v || v.schema !== 1 || v.persoonsId !== staat.oprichting.persoonsId || !/^[0-9a-f]{64}$/.test(v.beleidSha256 ?? '')) {
    return { ok: false, fout: 'HERSTELBELEID_VERANKERING_ONGELDIG' };
  }
  const sleutel = wortelSleutelVoorEpoche(staat, v.epoche);
  if (!sleutel || !Number.isFinite(Date.parse(v.vastgelegdOp))) {
    return { ok: false, fout: 'HERSTELBELEID_VERANKERING_ONGELDIG' };
  }
  const { handtekeningB64u, ...kern } = v;
  if (!verifieerEd25519(sleutel, Buffer.from(HERSTEL_VERANKERING_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'HERSTELBELEID_VERANKERING_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}

/** KLIMOP-020: склад голосу опікуна охоплює політику, умову відновлення та строк оскарження. */
function herstelStemKern(
  aanvraag: KlimopHerstelCertificaat['aanvraag'],
  beleidSha256: string,
  voogdKnooppuntId: string,
  gestemdOp: string,
): Record<string, string> {
  return {
    aanvraagId: aanvraag.aanvraagId,
    persoonsId: aanvraag.persoonsId,
    omstandigheid: aanvraag.omstandigheid,
    kandidaatNieuweWortelPubDerB64u: aanvraag.kandidaatNieuweWortelPubDerB64u,
    geopendOp: aanvraag.geopendOp,
    betwistingVerlooptOp: aanvraag.betwistingVerlooptOp,
    beleidSha256,
    voogdKnooppuntId,
    gestemdOp,
  };
}

function minimaleBetwistingsUren(beleid: KlimopHerstelBeleid, omstandigheid: KlimopHerstelAanvraag['omstandigheid']): number {
  const eigen = Number(beleid.minimaleBetwistingsVensterUren?.[omstandigheid]);
  return Math.max(omstandigheid === 'verlies_alle_apparaten' ? 48 : 168, Number.isFinite(eigen) ? eigen : 0);
}

/** KLIMOP-020: рахує дійсні голоси опікунів за політикою (лише різні опікуни з цієї політики). */
function telGeldigeVoogdStemmen(
  beleid: KlimopHerstelBeleid,
  aanvraag: KlimopHerstelCertificaat['aanvraag'],
  stemmen: KlimopHerstelAanvraag['voogdStemmen'],
): number {
  const beleidSha256 = berekenHerstelBeleidSha256(beleid);
  const voogdSleutelMap = new Map(beleid.voogden.map((v) => [v.knooppuntId, v.publiekeSleutelDerB64u]));
  const gezien = new Set<string>();
  const openMs = Date.parse(aanvraag.geopendOp);
  for (const stem of stemmen ?? []) {
    if (gezien.has(stem.voogdKnooppuntId)) continue;
    const pub = voogdSleutelMap.get(stem.voogdKnooppuntId);
    if (!pub) continue;
    const stemMs = Date.parse(stem.gestemdOp);
    if (!Number.isFinite(stemMs) || stemMs < openMs) continue;
    const kern = herstelStemKern(aanvraag, beleidSha256, stem.voogdKnooppuntId, stem.gestemdOp);
    if (verifieerEd25519(pub, Buffer.from(HERSTEL_VOOGD_DOMEIN + canoniekeJson(kern), 'utf8'), stem.handtekeningB64u)) {
      gezien.add(stem.voogdKnooppuntId);
    }
  }
  return gezien.size;
}

/** KLIMOP-020: найпізніше закріплення, чинне для переходу з епохи `vanEpoche` на момент відкриття заявки. */
function zoekVerankering(
  verankeringen: readonly KlimopHerstelBeleidVerankering[],
  vanEpoche: number,
  geopendOp: string,
): KlimopHerstelBeleidVerankering | null {
  const openMs = Date.parse(geopendOp);
  let beste: KlimopHerstelBeleidVerankering | null = null;
  for (const v of verankeringen) {
    if (v.epoche > vanEpoche || Date.parse(v.vastgelegdOp) > openMs) continue;
    if (!beste || v.epoche > beste.epoche || (v.epoche === beste.epoche && Date.parse(v.vastgelegdOp) > Date.parse(beste.vastgelegdOp))) {
      beste = v;
    }
  }
  return beste;
}

function verifieerHerstelCertificaat(
  r: KlimopWortelRotatieBewijs,
  staat: KlimopPersoonsStaat,
  vanEpoche: number,
  verankeringen: readonly KlimopHerstelBeleidVerankering[],
): { ok: true } | { ok: false; fout: string } {
  const c = r.herstelCertificaat;
  if (!c || !c.beleid || !c.aanvraag || !Array.isArray(c.voogdStemmen)) {
    return { ok: false, fout: 'HERSTELCERTIFICAAT_ONTBREEKT' };
  }
  const pid = staat.oprichting.persoonsId;
  if (
    c.beleid.persoonsId !== pid
    || c.aanvraag.persoonsId !== pid
    || c.aanvraag.aanvraagId !== r.herstelAanvraagId
    || c.aanvraag.kandidaatNieuweWortelPubDerB64u !== r.nieuweWortelPubDerB64u
  ) {
    return { ok: false, fout: 'HERSTELCERTIFICAAT_KOMT_NIET_OVEREEN' };
  }
  const verankering = zoekVerankering(verankeringen, vanEpoche, c.aanvraag.geopendOp);
  if (!verankering || verankering.beleidSha256 !== berekenHerstelBeleidSha256(c.beleid)) {
    return { ok: false, fout: 'HERSTELBELEID_NIET_VERANKERD' };
  }
  if (!Number.isInteger(c.beleid.drempel) || c.beleid.drempel < 2 || c.beleid.voogden.length < c.beleid.drempel) {
    return { ok: false, fout: 'HERSTELBELEID_DREMPEL_ONGELDIG' };
  }
  const openMs = Date.parse(c.aanvraag.geopendOp);
  const eindMs = Date.parse(c.aanvraag.betwistingVerlooptOp);
  const rotMs = Date.parse(r.geroteerdOp);
  if (![openMs, eindMs, rotMs].every(Number.isFinite)) return { ok: false, fout: 'HERSTELCERTIFICAAT_TIJD_ONGELDIG' };
  if (eindMs - openMs < minimaleBetwistingsUren(c.beleid, c.aanvraag.omstandigheid) * MS_PER_UUR) {
    return { ok: false, fout: 'HERSTELCERTIFICAAT_BETWISTINGSVENSTER_TE_KORT' };
  }
  if (rotMs < eindMs) return { ok: false, fout: 'HERSTELCERTIFICAAT_VOOR_EINDE_BETWISTING' };
  if (telGeldigeVoogdStemmen(c.beleid, c.aanvraag, c.voogdStemmen) < c.beleid.drempel) {
    return { ok: false, fout: 'HERSTELCERTIFICAAT_ONVOLDOENDE_VOOGDEN' };
  }
  return { ok: true };
}

/**
 * KLIMOP-020: закріплює політику відновлення підписом кореня чинної епохи. Лише закріплена політика
 * (її опікуни, поріг і строки) може згодом засвідчити новий корінь після втрати доступу.
 */
export function verankerHerstelBeleid(opties: {
  staat: KlimopPersoonsStaat;
  beleid: KlimopHerstelBeleid;
  wortelGeheimPkcs8B64u: string;
  nuIso?: string;
}): { ok: true; nieuweStaat: KlimopPersoonsStaat } | { ok: false; fout: string } {
  const sv = verifieerPersoonsStaat(opties.staat);
  if (!sv.ok) return sv;
  if (opties.beleid.persoonsId !== opties.staat.oprichting.persoonsId) {
    return { ok: false, fout: 'HERSTELBELEID_PERSOON_KOMT_NIET_OVEREEN' };
  }
  const kern = {
    schema: 1 as const,
    persoonsId: opties.staat.oprichting.persoonsId,
    epoche: opties.staat.actieveEpoche,
    beleidSha256: berekenHerstelBeleidSha256(opties.beleid),
    vastgelegdOp: opties.nuIso ?? new Date().toISOString(),
  };
  const handtekeningB64u = tekenEd25519(
    opties.wortelGeheimPkcs8B64u,
    Buffer.from(HERSTEL_VERANKERING_DOMEIN + canoniekeJson(kern), 'utf8'),
  );
  if (!verifieerEd25519(opties.staat.actieveWortelPubDerB64u, Buffer.from(HERSTEL_VERANKERING_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'WORTELGEHEIM_KOMT_NIET_OVEREEN' };
  }
  return {
    ok: true,
    nieuweStaat: {
      ...opties.staat,
      herstelBeleidVerankeringen: [...(opties.staat.herstelBeleidVerankeringen ?? []), { ...kern, handtekeningB64u }],
    },
  };
}

/** Планова ротація кореневого ключа зі збереженням сталого ідентифікатора особи `persoonsId`. */
export function roteerPersoonsWortelSleutel(
  staat: KlimopPersoonsStaat,
  huidigeWortelGeheimPkcs8B64u: string,
  nuIso?: string,
): { nieuweStaat: KlimopPersoonsStaat; nieuwWortelGeheimPkcs8B64u: string } {
  const sv = verifieerPersoonsStaat(staat);
  if (!sv.ok) throw new Error(sv.fout);

  const nieuw = genereerEd25519Sleutelpaar();
  const rotKern = {
    schema: 1 as const,
    persoonsId: staat.oprichting.persoonsId,
    volgnummer: staat.rotaties.length + 1,
    vorigeWortelPubDerB64u: staat.actieveWortelPubDerB64u,
    nieuweWortelPubDerB64u: nieuw.publiekDerB64u,
    geroteerdOp: nuIso ?? new Date().toISOString(),
    reden: 'geplande_rotatie' as const,
    herstelAanvraagId: null,
  };
  const boodschap = Buffer.from(ROTATIE_DOMEIN + canoniekeJson(rotKern), 'utf8');
  const bewijs: KlimopWortelRotatieBewijs = {
    ...rotKern,
    handtekeningVorigeOfHerstelB64u: tekenEd25519(huidigeWortelGeheimPkcs8B64u, boodschap),
    handtekeningNieuweB64u: tekenEd25519(nieuw.geheimPkcs8B64u, boodschap),
  };

  return {
    nieuweStaat: {
      oprichting: staat.oprichting,
      rotaties: [...staat.rotaties, bewijs],
      actieveWortelPubDerB64u: nieuw.publiekDerB64u,
      actieveEpoche: staat.actieveEpoche + 1,
      ...(staat.herstelBeleidVerankeringen ? { herstelBeleidVerankeringen: staat.herstelBeleidVerankeringen } : {}),
    },
    nieuwWortelGeheimPkcs8B64u: nieuw.geheimPkcs8B64u,
  };
}

/**
 * Розділення особистої та службової мережевої ідентичності (§12 маніфесту):
 * виводить необоротний псевдонімний ідентифікатор psid1_<32 hex> для конкретної служби/простору,
 * щоб сторонні вузли не могли пов'язати активність людини між різними службами.
 */
export function leidPseudoniemeDienstIdentiteitAf(
  persoonsGeheimZout32: Buffer,
  persoonsId: string,
  dienstDomein: string,
): string {
  if (persoonsGeheimZout32.length < 32) throw new Error('PSEUDONIEM_ZOUT_TE_KORT');
  const mac = createHmac('sha256', persoonsGeheimZout32)
    .update(`klimop-pseudoniem-v1|${persoonsId}|${dienstDomein}`, 'utf8')
    .digest('hex');
  return `psid1_${mac.slice(0, 32)}`;
}

export interface ErfenisGebruikerKoppeling {
  schema: 1;
  erfenisUserId: string;
  persoonsId: string;
  wortelPubDerB64u: string;
  gekoppeldOp: string;
  handtekeningB64u: string;
}

/** Створює двосторонній криптографічно підписаний міст сумісності між чинним `userId` та `persoonsId` (§35, Етап 5). */
export function maakErfenisGebruikerKoppeling(
  erfenisUserId: string,
  staat: KlimopPersoonsStaat,
  wortelGeheimPkcs8B64u: string,
  nuIso?: string,
): ErfenisGebruikerKoppeling {
  if (!erfenisUserId || !erfenisUserId.trim()) throw new Error('ERFENIS_USER_ID_LEEG');
  const kern = {
    schema: 1 as const,
    erfenisUserId: erfenisUserId.trim(),
    persoonsId: staat.oprichting.persoonsId,
    wortelPubDerB64u: staat.actieveWortelPubDerB64u,
    gekoppeldOp: nuIso ?? new Date().toISOString(),
  };
  return {
    ...kern,
    handtekeningB64u: tekenEd25519(wortelGeheimPkcs8B64u, Buffer.from(KOPPELING_DOMEIN + canoniekeJson(kern), 'utf8')),
  };
}

export function verifieerErfenisGebruikerKoppeling(
  koppeling: ErfenisGebruikerKoppeling,
  staat: KlimopPersoonsStaat,
): boolean {
  const sv = verifieerPersoonsStaat(staat);
  if (!sv.ok) return false;
  if (koppeling.persoonsId !== staat.oprichting.persoonsId) return false;
  const geldigeWortels = new Set([
    staat.oprichting.aanvankelijkeWortelPubDerB64u,
    ...staat.rotaties.map((r) => r.nieuweWortelPubDerB64u),
  ]);
  if (!geldigeWortels.has(koppeling.wortelPubDerB64u)) return false;
  const { handtekeningB64u, ...kern } = koppeling;
  return verifieerEd25519(
    koppeling.wortelPubDerB64u,
    Buffer.from(KOPPELING_DOMEIN + canoniekeJson(kern), 'utf8'),
    handtekeningB64u,
  );
}

// =================================================================================================
// 2. Довірені особисті пристрої з обмеженими делегованими повноваженнями та відкликанням (§4.2, §14)
// =================================================================================================

export interface ApparaatMiddelenLimiet {
  maxOpslagMb: number;
  toestaanAchtergrondTaken: boolean; // Типово false (§42 п. 13: жодної прихованої витрати ресурсів!)
}

export interface KlimopApparaatCertificaatKern {
  schema: 1;
  apparaatId: string; // kdev1_<32 hex>
  persoonsId: string;
  naamLabel: string;
  apparaatTekenPubDerB64u: string; // Ed25519
  apparaatUitwisselPubDerB64u: string; // X25519
  toegestaneBevoegdheden: readonly ApparaatBevoegdheid[];
  middelenLimiet: ApparaatMiddelenLimiet;
  uitgegevenBijEpoche: number;
  uitgegevenOp: string;
  verlooptOp: string;
}

export interface KlimopApparaatCertificaat extends KlimopApparaatCertificaatKern {
  wortelPubDerB64u: string;
  wortelHandtekeningB64u: string;
}

export interface KlimopApparaatSleutelBundel {
  certificaat: KlimopApparaatCertificaat;
  tekenGeheimPkcs8B64u: string;
  uitwisselGeheimPkcs8B64u: string;
}

export interface KlimopApparaatIntrekking {
  schema: 1;
  persoonsId: string;
  ingetrokkenApparaatId: string;
  reden: 'verloren_of_gestolen' | 'vervangen' | 'verdacht_gedrag';
  ingetrokkenOp: string;
  ondertekenaarSoort: 'wortel' | 'nood_apparaat';
  ondertekenaarPubDerB64u: string;
  noodApparaatCertificaat: KlimopApparaatCertificaat | null;
  handtekeningB64u: string;
}

/** Випускає сертифікат особистого пристрою з чітко обмеженими правами без передавання йому кореневого ключа. */
export function registreerVertrouwdApparaat(opties: {
  staat: KlimopPersoonsStaat;
  wortelGeheimPkcs8B64u: string;
  naamLabel: string;
  toegestaneBevoegdheden: readonly ApparaatBevoegdheid[];
  middelenLimiet?: Partial<ApparaatMiddelenLimiet>;
  nuIso?: string;
  verlooptOpIso?: string;
}): KlimopApparaatSleutelBundel {
  const sv = verifieerPersoonsStaat(opties.staat);
  if (!sv.ok) throw new Error(sv.fout);
  if (opties.toegestaneBevoegdheden.length === 0) {
    throw new Error('APPARAAT_MOET_MINSTENS_EEN_BEVOEGDHEID_HEBBEN');
  }

  const tekenPaar = genereerEd25519Sleutelpaar();
  const uitwisselPaar = genereerX25519Sleutelpaar();
  const idDigest = createHash('sha256')
    .update(`klimop-apparaat-id-v1|${tekenPaar.publiekDerB64u}|${uitwisselPaar.publiekDerB64u}`, 'utf8')
    .digest('hex');
  const apparaatId = `kdev1_${idDigest.slice(0, 32)}`;

  const nuIso = opties.nuIso ?? new Date().toISOString();
  const verlooptOp = opties.verlooptOpIso ?? new Date(Date.parse(nuIso) + 180 * 24 * 3600 * 1000).toISOString();

  const kern: KlimopApparaatCertificaatKern = {
    schema: 1,
    apparaatId,
    persoonsId: opties.staat.oprichting.persoonsId,
    naamLabel: opties.naamLabel,
    apparaatTekenPubDerB64u: tekenPaar.publiekDerB64u,
    apparaatUitwisselPubDerB64u: uitwisselPaar.publiekDerB64u,
    toegestaneBevoegdheden: [...new Set(opties.toegestaneBevoegdheden)],
    middelenLimiet: {
      maxOpslagMb: Math.max(0, opties.middelenLimiet?.maxOpslagMb ?? 512),
      toestaanAchtergrondTaken: Boolean(opties.middelenLimiet?.toestaanAchtergrondTaken ?? false),
    },
    uitgegevenBijEpoche: opties.staat.actieveEpoche,
    uitgegevenOp: nuIso,
    verlooptOp,
  };

  const wortelHandtekeningB64u = tekenEd25519(
    opties.wortelGeheimPkcs8B64u,
    Buffer.from(APPARAAT_CERT_DOMEIN + canoniekeJson(kern), 'utf8'),
  );

  return {
    certificaat: {
      ...kern,
      wortelPubDerB64u: opties.staat.actieveWortelPubDerB64u,
      wortelHandtekeningB64u,
    },
    tekenGeheimPkcs8B64u: tekenPaar.geheimPkcs8B64u,
    uitwisselGeheimPkcs8B64u: uitwisselPaar.geheimPkcs8B64u,
  };
}

/** Перевіряє криптографічну дійсність заяви про відкликання особистого пристрою. */
export function verifieerApparaatIntrekking(
  intrekking: KlimopApparaatIntrekking,
  staat: KlimopPersoonsStaat,
  /** KLIMOP-020: інші відомі відкликання — аварійний пристрій, який сам відкликаний, не може відкликати інших. */
  andereIntrekkingen?: readonly KlimopApparaatIntrekking[],
): { ok: true } | { ok: false; fout: string } {
  const sv = verifieerPersoonsStaat(staat);
  if (!sv.ok) return sv;
  if (!intrekking || intrekking.schema !== 1 || intrekking.persoonsId !== staat.oprichting.persoonsId) {
    return { ok: false, fout: 'APPARAAT_INTREKKING_ONGELDIG' };
  }

  if (intrekking.ondertekenaarSoort === 'wortel') {
    const geldigeWortels = new Set([
      staat.oprichting.aanvankelijkeWortelPubDerB64u,
      ...staat.rotaties.map((r) => r.nieuweWortelPubDerB64u),
    ]);
    if (!geldigeWortels.has(intrekking.ondertekenaarPubDerB64u)) {
      return { ok: false, fout: 'APPARAAT_INTREKKING_ONBEKENDE_WORTEL' };
    }
    // KLIMOP-020: відкликати може лише корінь, чинний на момент відкликання
    const bevoegd = wortelWasBevoegdOp(staat, intrekking.ondertekenaarPubDerB64u, intrekking.ingetrokkenOp);
    if (bevoegd) return { ok: false, fout: `APPARAAT_INTREKKING_${bevoegd}` };
  } else {
    if (
      !intrekking.noodApparaatCertificaat
      || intrekking.noodApparaatCertificaat.apparaatTekenPubDerB64u !== intrekking.ondertekenaarPubDerB64u
    ) {
      return { ok: false, fout: 'APPARAAT_INTREKKING_NOODCERTIFICAAT_ONTBREEKT' };
    }
    const cv = verifieerApparaatCertificaat(intrekking.noodApparaatCertificaat, staat, {
      vereisteBevoegdheid: 'nood_betwisting',
      nuIso: intrekking.ingetrokkenOp,
      intrekkingen: andereIntrekkingen?.filter(
        (a) => a.ingetrokkenApparaatId !== intrekking.ingetrokkenApparaatId || a.handtekeningB64u !== intrekking.handtekeningB64u,
      ),
    });
    if (!cv.ok) return cv;
  }

  const { handtekeningB64u, ...kern } = intrekking;
  if (
    !verifieerEd25519(
      intrekking.ondertekenaarPubDerB64u,
      Buffer.from(APPARAAT_INTREKKING_DOMEIN + canoniekeJson(kern), 'utf8'),
      handtekeningB64u,
    )
  ) {
    return { ok: false, fout: 'APPARAAT_INTREKKING_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}

/** Перевіряє чинність сертифіката пристрою, відсутність дійсного відкликання та наявність потрібного права. */
export function verifieerApparaatCertificaat(
  certificaat: KlimopApparaatCertificaat,
  staat: KlimopPersoonsStaat,
  opties: {
    vereisteBevoegdheid?: ApparaatBevoegdheid;
    intrekkingen?: readonly KlimopApparaatIntrekking[];
    nuIso?: string;
  } = {},
): { ok: true } | { ok: false; fout: string } {
  const sv = verifieerPersoonsStaat(staat);
  if (!sv.ok) return sv;
  if (!certificaat || certificaat.schema !== 1 || certificaat.persoonsId !== staat.oprichting.persoonsId) {
    return { ok: false, fout: 'APPARAAT_CERTIFICAAT_ONGELDIG' };
  }

  const nuMs = Date.parse(opties.nuIso ?? new Date().toISOString());
  const vanMs = Date.parse(certificaat.uitgegevenOp);
  const totMs = Date.parse(certificaat.verlooptOp);
  // KLIMOP-020: невизначений час дає закриту відмову, а не мовчазний успіх порівняння
  if (!Number.isFinite(nuMs) || !Number.isFinite(vanMs) || !Number.isFinite(totMs) || totMs <= vanMs) {
    return { ok: false, fout: 'APPARAAT_CERTIFICAAT_TIJD_ONGELDIG' };
  }
  if (nuMs < vanMs || nuMs > totMs) {
    return { ok: false, fout: 'APPARAAT_CERTIFICAAT_VERLOPEN' };
  }

  if (
    opties.intrekkingen?.some(
      (intr) => intr.ingetrokkenApparaatId === certificaat.apparaatId && verifieerApparaatIntrekking(intr, staat).ok,
    )
  ) {
    return { ok: false, fout: 'APPARAAT_IS_INGETROKKEN' };
  }

  // Кореневий ключ, який підписав пристрій, має належати дійсній історії цієї особи
  const geldigeWortels = new Set([
    staat.oprichting.aanvankelijkeWortelPubDerB64u,
    ...staat.rotaties.map((r) => r.nieuweWortelPubDerB64u),
  ]);
  if (!geldigeWortels.has(certificaat.wortelPubDerB64u)) {
    return { ok: false, fout: 'APPARAAT_ONBEKENDE_WORTELSLEUTEL' };
  }
  // KLIMOP-020: корінь мав бути чинним на момент видачі, а не будь-яким коренем з історії
  const bevoegd = wortelWasBevoegdOp(staat, certificaat.wortelPubDerB64u, certificaat.uitgegevenOp, new Date(nuMs).toISOString());
  if (bevoegd) return { ok: false, fout: `APPARAAT_${bevoegd}` };

  const { wortelPubDerB64u, wortelHandtekeningB64u, ...kern } = certificaat;
  if (
    !verifieerEd25519(
      wortelPubDerB64u,
      Buffer.from(APPARAAT_CERT_DOMEIN + canoniekeJson(kern), 'utf8'),
      wortelHandtekeningB64u,
    )
  ) {
    return { ok: false, fout: 'APPARAAT_HANDTEKENING_ONGELDIG' };
  }

  if (opties.vereisteBevoegdheid && !certificaat.toegestaneBevoegdheden.includes(opties.vereisteBevoegdheid)) {
    return { ok: false, fout: 'APPARAAT_MIST_BEVOEGDHEID' };
  }

  return { ok: true };
}

/** Негайно відкликає втрачений чи скомпрометований пристрій кореневим ключем або іншим пристроєм із правом `nood_betwisting`. */
export function trekApparaatIn(opties: {
  staat: KlimopPersoonsStaat;
  ingetrokkenApparaatId: string;
  reden: 'verloren_of_gestolen' | 'vervangen' | 'verdacht_gedrag';
  ondertekenaar:
    | { soort: 'wortel'; geheimPkcs8B64u: string }
    | { soort: 'nood_apparaat'; bundel: KlimopApparaatSleutelBundel };
  nuIso?: string;
}): KlimopApparaatIntrekking {
  const nuIso = opties.nuIso ?? new Date().toISOString();
  let ondertekenaarPubDerB64u: string;
  let geheimPkcs8B64u: string;
  let noodApparaatCertificaat: KlimopApparaatCertificaat | null = null;

  if (opties.ondertekenaar.soort === 'wortel') {
    ondertekenaarPubDerB64u = opties.staat.actieveWortelPubDerB64u;
    geheimPkcs8B64u = opties.ondertekenaar.geheimPkcs8B64u;
  } else {
    const cv = verifieerApparaatCertificaat(opties.ondertekenaar.bundel.certificaat, opties.staat, {
      vereisteBevoegdheid: 'nood_betwisting',
      nuIso,
    });
    if (!cv.ok) throw new Error(cv.fout);
    ondertekenaarPubDerB64u = opties.ondertekenaar.bundel.certificaat.apparaatTekenPubDerB64u;
    geheimPkcs8B64u = opties.ondertekenaar.bundel.tekenGeheimPkcs8B64u;
    noodApparaatCertificaat = opties.ondertekenaar.bundel.certificaat;
  }

  const kern = {
    schema: 1 as const,
    persoonsId: opties.staat.oprichting.persoonsId,
    ingetrokkenApparaatId: opties.ingetrokkenApparaatId,
    reden: opties.reden,
    ingetrokkenOp: nuIso,
    ondertekenaarSoort: opties.ondertekenaar.soort,
    ondertekenaarPubDerB64u,
    noodApparaatCertificaat,
  };

  return {
    ...kern,
    handtekeningB64u: tekenEd25519(geheimPkcs8B64u, Buffer.from(APPARAAT_INTREKKING_DOMEIN + canoniekeJson(kern), 'utf8')),
  };
}

// =================================================================================================
// 3. Багатостороннє відновлення доступу та захист від незаконного спадкування (§14, §17, §39)
// =================================================================================================

export type HerstelOmstandigheid =
  | 'gewone_afwezigheid'
  | 'tijdelijk_verbindingsverlies'
  | 'verlies_alle_apparaten'
  | 'bevestigde_langdurige_onbeschikbaarheid'
  | 'wettige_erfopvolging';

export interface KlimopHerstelBeleid {
  schema: 1;
  persoonsId: string;
  drempel: number;
  voogden: ReadonlyArray<{ knooppuntId: string; publiekeSleutelDerB64u: string }>;
  pedersenSetId: string;
  minimaleBetwistingsVensterUren: {
    verlies_alle_apparaten: number; // >= 48 год
    bevestigde_langdurige_onbeschikbaarheid: number; // >= 168 год
    wettige_erfopvolging: number; // >= 168 год
  };
}

export interface KlimopHerstelAanvraag {
  aanvraagId: string;
  persoonsId: string;
  omstandigheid: Exclude<HerstelOmstandigheid, 'gewone_afwezigheid' | 'tijdelijk_verbindingsverlies'>;
  kandidaatNieuweWortelPubDerB64u: string;
  geopendOp: string;
  betwistingVerlooptOp: string;
  staat: 'wacht_op_quorum_en_tijdslot' | 'geblokkeerd_door_eigenaar' | 'voltooid';
  voogdStemmen: ReadonlyArray<{
    voogdKnooppuntId: string;
    gestemdOp: string;
    handtekeningB64u: string;
  }>;
  betwistingBewijs: {
    betwistOp: string;
    ondertekenaarPubDerB64u: string;
    handtekeningB64u: string;
  } | null;
}

/**
 * Відкриває заявку на багатостороннє відновлення доступу (§14, §17 маніфесту).
 * Категорично відхиляє звичайну відсутність або тимчасову втрату зв'язку як підставу передавання прав!
 */
export function openHerstelAanvraag(opties: {
  beleid: KlimopHerstelBeleid;
  omstandigheid: HerstelOmstandigheid;
  kandidaatNieuweWortelPubDerB64u: string;
  nuIso?: string;
}): { ok: true; aanvraag: KlimopHerstelAanvraag } | { ok: false; fout: string } {
  if (
    opties.omstandigheid === 'gewone_afwezigheid'
    || opties.omstandigheid === 'tijdelijk_verbindingsverlies'
  ) {
    return { ok: false, fout: 'AFWEZIGHEID_ALLEEN_GEEN_GROND_VOOR_OVERDRACHT' };
  }
  if (opties.beleid.drempel < 2 || opties.beleid.voogden.length < opties.beleid.drempel) {
    return { ok: false, fout: 'HERSTELBELEID_DREMPEL_ONGELDIG' };
  }

  const minUren = Math.max(
    opties.omstandigheid === 'verlies_alle_apparaten' ? 48 : 168,
    opties.beleid.minimaleBetwistingsVensterUren[opties.omstandigheid],
  );
  const nuIso = opties.nuIso ?? new Date().toISOString();
  const betwistingVerlooptOp = new Date(Date.parse(nuIso) + minUren * 3600 * 1000).toISOString();

  return {
    ok: true,
    aanvraag: {
      aanvraagId: `hrst_${randomBytes(12).toString('hex')}`,
      persoonsId: opties.beleid.persoonsId,
      omstandigheid: opties.omstandigheid,
      kandidaatNieuweWortelPubDerB64u: opties.kandidaatNieuweWortelPubDerB64u,
      geopendOp: nuIso,
      betwistingVerlooptOp,
      staat: 'wacht_op_quorum_en_tijdslot',
      voogdStemmen: [],
      betwistingBewijs: null,
    },
  };
}

/** Додає криптографічно підписане підтвердження незалежного опікуна відновлення. */
export function voegVoogdBevestigingToe(opties: {
  beleid: KlimopHerstelBeleid;
  aanvraag: KlimopHerstelAanvraag;
  voogd: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
}): { ok: true; aanvraag: KlimopHerstelAanvraag } | { ok: false; fout: string } {
  if (opties.aanvraag.staat !== 'wacht_op_quorum_en_tijdslot') {
    return { ok: false, fout: 'HERSTELAANVRAAG_NIET_OPEN' };
  }
  const voogdId = opties.voogd.identiteit.knooppuntId;
  const erkend = opties.beleid.voogden.find((v) => v.knooppuntId === voogdId);
  if (!erkend || erkend.publiekeSleutelDerB64u !== opties.voogd.identiteit.publiekeSleutelDerB64u) {
    return { ok: false, fout: 'ONBEVOEGDE_HERSTELVOOGD' };
  }
  if (opties.aanvraag.voogdStemmen.some((s) => s.voogdKnooppuntId === voogdId)) {
    return { ok: false, fout: 'VOOGD_HEEFT_AL_BEVESTIGD' };
  }

  const gestemdOp = opties.nuIso ?? new Date().toISOString();
  // KLIMOP-020: опікун підписує також умову відновлення, строки оскарження й відбиток політики
  const stemKern = herstelStemKern(opties.aanvraag, berekenHerstelBeleidSha256(opties.beleid), voogdId, gestemdOp);
  const handtekeningB64u = tekenEd25519(
    opties.voogd.geheimeSleutelPkcs8B64u,
    Buffer.from(HERSTEL_VOOGD_DOMEIN + canoniekeJson(stemKern), 'utf8'),
  );

  return {
    ok: true,
    aanvraag: {
      ...opties.aanvraag,
      voogdStemmen: [
        ...opties.aanvraag.voogdStemmen,
        { voogdKnooppuntId: voogdId, gestemdOp, handtekeningB64u },
      ],
    },
  };
}

/**
 * Захист від незаконного спадкування або ворожого перехоплення процедури відновлення (§17, §39):
 * живий власник одним підписом кореня чи пристрою з правом `nood_betwisting` назавжди блокує заявку!
 */
export function betwistHerstelAanvraagDoorEigenaar(opties: {
  staat: KlimopPersoonsStaat;
  aanvraag: KlimopHerstelAanvraag;
  ondertekenaar:
    | { soort: 'wortel'; geheimPkcs8B64u: string }
    | { soort: 'nood_apparaat'; bundel: KlimopApparaatSleutelBundel; intrekkingen?: readonly KlimopApparaatIntrekking[] };
  nuIso?: string;
}): { ok: true; geblokkeerdeAanvraag: KlimopHerstelAanvraag } | { ok: false; fout: string } {
  if (opties.aanvraag.persoonsId !== opties.staat.oprichting.persoonsId) {
    return { ok: false, fout: 'BETWISTING_PERSOON_KOMT_NIET_OVEREEN' };
  }
  if (opties.aanvraag.staat === 'voltooid') {
    return { ok: false, fout: 'HERSTELAANVRAAG_REEDS_VOLTOOID' };
  }

  const betwistOp = opties.nuIso ?? new Date().toISOString();
  let pub: string;
  let priv: string;
  if (opties.ondertekenaar.soort === 'wortel') {
    pub = opties.staat.actieveWortelPubDerB64u;
    priv = opties.ondertekenaar.geheimPkcs8B64u;
  } else {
    const cv = verifieerApparaatCertificaat(opties.ondertekenaar.bundel.certificaat, opties.staat, {
      vereisteBevoegdheid: 'nood_betwisting',
      intrekkingen: opties.ondertekenaar.intrekkingen,
      nuIso: betwistOp,
    });
    if (!cv.ok) return cv;
    pub = opties.ondertekenaar.bundel.certificaat.apparaatTekenPubDerB64u;
    priv = opties.ondertekenaar.bundel.tekenGeheimPkcs8B64u;
  }

  const kern = {
    aanvraagId: opties.aanvraag.aanvraagId,
    persoonsId: opties.aanvraag.persoonsId,
    betwistOp,
    ondertekenaarPubDerB64u: pub,
  };
  const handtekeningB64u = tekenEd25519(priv, Buffer.from(HERSTEL_BETWIST_DOMEIN + canoniekeJson(kern), 'utf8'));

  return {
    ok: true,
    geblokkeerdeAanvraag: {
      ...opties.aanvraag,
      staat: 'geblokkeerd_door_eigenaar',
      betwistingBewijs: { betwistOp, ondertekenaarPubDerB64u: pub, handtekeningB64u },
    },
  };
}

/**
 * Завершує законне відновлення доступу після перевірки кворуму опікунів, повного спливу часового замка оскарження,
 * відсутності заперечення власника та відновлення секрету з приховувальних часток Педерсена (§14, §17).
 */
export function voltooiWettigHerstel(opties: {
  staat: KlimopPersoonsStaat;
  beleid: KlimopHerstelBeleid;
  aanvraag: KlimopHerstelAanvraag;
  pedersenDelen: readonly PedersenVssDeel[];
  kandidaatNieuwWortelGeheimPkcs8B64u: string;
  nuIso?: string;
}):
  | {
      ok: true;
      nieuweStaat: KlimopPersoonsStaat;
      voltooideAanvraag: KlimopHerstelAanvraag;
      hersteldGeheimScalairHex: string;
    }
  | { ok: false; fout: string } {
  const sv = verifieerPersoonsStaat(opties.staat);
  if (!sv.ok) return sv;
  if (opties.aanvraag.staat === 'geblokkeerd_door_eigenaar' || opties.aanvraag.betwistingBewijs) {
    return { ok: false, fout: 'HERSTEL_GEBLOKKEERD_DOOR_EIGENAAR' };
  }
  if (opties.aanvraag.staat !== 'wacht_op_quorum_en_tijdslot') {
    return { ok: false, fout: 'HERSTELAANVRAAG_ONGELDIGE_STAAT' };
  }

  const nuIso = opties.nuIso ?? new Date().toISOString();
  const nuMs = Date.parse(nuIso);
  const eindMs = Date.parse(opties.aanvraag.betwistingVerlooptOp);
  if (!Number.isFinite(nuMs) || !Number.isFinite(eindMs)) {
    return { ok: false, fout: 'HERSTEL_TIJD_ONGELDIG' };
  }
  if (nuMs < eindMs) {
    return { ok: false, fout: 'BETWISTINGSTERMIJN_NOG_NIET_VERSTREKEN' };
  }

  // KLIMOP-020: заявка має належати цій особі, а політика — бути закріпленою коренем раніше
  const pid = opties.staat.oprichting.persoonsId;
  if (opties.aanvraag.persoonsId !== pid || opties.beleid.persoonsId !== pid) {
    return { ok: false, fout: 'HERSTEL_PERSOON_KOMT_NIET_OVEREEN' };
  }
  const verankering = zoekVerankering(
    opties.staat.herstelBeleidVerankeringen ?? [],
    opties.staat.actieveEpoche,
    opties.aanvraag.geopendOp,
  );
  if (!verankering || verankering.beleidSha256 !== berekenHerstelBeleidSha256(opties.beleid)) {
    return { ok: false, fout: 'HERSTELBELEID_NIET_VERANKERD' };
  }

  // Перевіряємо всі підписи опікунів
  if (telGeldigeVoogdStemmen(opties.beleid, opties.aanvraag, opties.aanvraag.voogdStemmen) < opties.beleid.drempel) {
    return { ok: false, fout: 'ONVOLDOENDE_VOOGD_BEVESTIGINGEN' };
  }

  if (opties.pedersenDelen.some((d) => d.setId !== opties.beleid.pedersenSetId)) {
    return { ok: false, fout: 'PEDERSEN_SET_ID_KOMT_NIET_OVEREEN' };
  }
  const pedUit = herstelUitPedersenDelen(opties.pedersenDelen);
  if (!pedUit.ok) return pedUit;

  const rotKern = {
    schema: 1 as const,
    persoonsId: opties.staat.oprichting.persoonsId,
    volgnummer: opties.staat.rotaties.length + 1,
    vorigeWortelPubDerB64u: opties.staat.actieveWortelPubDerB64u,
    nieuweWortelPubDerB64u: opties.aanvraag.kandidaatNieuweWortelPubDerB64u,
    geroteerdOp: nuIso,
    reden: 'wettig_drempel_herstel' as const,
    herstelAanvraagId: opties.aanvraag.aanvraagId,
    herstelCertificaat: {
      beleid: opties.beleid,
      aanvraag: {
        aanvraagId: opties.aanvraag.aanvraagId,
        persoonsId: opties.aanvraag.persoonsId,
        omstandigheid: opties.aanvraag.omstandigheid,
        kandidaatNieuweWortelPubDerB64u: opties.aanvraag.kandidaatNieuweWortelPubDerB64u,
        geopendOp: opties.aanvraag.geopendOp,
        betwistingVerlooptOp: opties.aanvraag.betwistingVerlooptOp,
      },
      voogdStemmen: opties.aanvraag.voogdStemmen,
    },
  };
  const boodschap = Buffer.from(ROTATIE_DOMEIN + canoniekeJson(rotKern), 'utf8');
  const sigNieuw = tekenEd25519(opties.kandidaatNieuwWortelGeheimPkcs8B64u, boodschap);
  if (!verifieerEd25519(opties.aanvraag.kandidaatNieuweWortelPubDerB64u, boodschap, sigNieuw)) {
    return { ok: false, fout: 'KANDIDAAT_WORTELGEHEIM_KOMT_NIET_OVEREEN' };
  }

  const bewijs: KlimopWortelRotatieBewijs = {
    ...rotKern,
    handtekeningVorigeOfHerstelB64u: sigNieuw,
    handtekeningNieuweB64u: sigNieuw,
  };

  return {
    ok: true,
    nieuweStaat: {
      oprichting: opties.staat.oprichting,
      rotaties: [...opties.staat.rotaties, bewijs],
      actieveWortelPubDerB64u: opties.aanvraag.kandidaatNieuweWortelPubDerB64u,
      actieveEpoche: opties.staat.actieveEpoche + 1,
      ...(opties.staat.herstelBeleidVerankeringen
        ? { herstelBeleidVerankeringen: opties.staat.herstelBeleidVerankeringen }
        : {}),
    },
    voltooideAanvraag: { ...opties.aanvraag, staat: 'voltooid' },
    hersteldGeheimScalairHex: pedUit.geheimScalairHex,
  };
}

// =================================================================================================
// 4. Захист групових просторів та оселі за принципами стандарту RFC 9420 (MLS / TreeKEM):
//    пряма таємниця при додаванні учасників та посткомпрометаційна безпека при вилученні пристроїв (§12).
// =================================================================================================

export interface MlsBladSleutelPakket {
  schema: 1;
  apparaatId: string;
  persoonsId: string;
  tekenPubDerB64u: string; // Ed25519
  bladX25519PubDerB64u: string; // Одноразовий/оновлюваний листовий ключ X25519 учасника групи
  aangemaaktOp: string;
  handtekeningB64u: string;
}

export interface MlsVersleuteldeDoos {
  ontvangerApparaatId: string;
  efemeerX25519PubDerB64u: string;
  ivB64u: string;
  cijfertekstB64u: string;
  tagB64u: string;
}

export interface MlsEpocheCommit {
  schema: 1;
  groepId: string;
  vanEpoche: number;
  naarEpoche: number;
  soort: 'toevoegen' | 'verwijderen' | 'sleutel_verversen';
  afzenderApparaatId: string;
  actieveLeden: readonly MlsBladSleutelPakket[];
  groepsContextSha256: string;
  ingepakteCommitGeheimen: readonly MlsVersleuteldeDoos[];
  handtekeningB64u: string;
}

export interface MlsWelkomPakket {
  schema: 1;
  groepId: string;
  epoche: number;
  actieveLeden: readonly MlsBladSleutelPakket[];
  groepsContextSha256: string;
  ingepaktInitGeheim: MlsVersleuteldeDoos;
}

export interface MlsLidSessieStaat {
  groepId: string;
  eigenApparaatId: string;
  eigenTekenGeheimPkcs8B64u: string;
  eigenBladX25519GeheimPkcs8B64u: string;
  epoche: number;
  actieveLeden: MlsBladSleutelPakket[];
  groepsContextSha256: string;
  initGeheim: Buffer;       // Затирається й замінюється при кожному переході епохи (пряма таємниця!)
  toepassingSleutel: Buffer; // Поточний AEAD-ключ повідомлень епохи
  volgendBerichtNummer: number;
}

export interface MlsGroepsBericht {
  schema: 1;
  groepId: string;
  epoche: number;
  afzenderApparaatId: string;
  volgnummer: number;
  ivB64u: string;
  cijfertekstB64u: string;
  tagB64u: string;
  handtekeningB64u: string;
}

function berekenMlsGroepsContextSha256(
  groepId: string,
  epoche: number,
  leden: readonly MlsBladSleutelPakket[],
): string {
  const gesorteerd = [...leden].sort((a, b) => a.apparaatId.localeCompare(b.apparaatId));
  return createHash('sha256')
    .update(canoniekeJson({ groepId, epoche, leden: gesorteerd }), 'utf8')
    .digest('hex');
}

function leidMlsEpocheSleutelsAf(
  vorigInitGeheim: Buffer,
  commitGeheim: Buffer,
  groepsContextSha256: string,
): { toepassingSleutel: Buffer; nieuwInitGeheim: Buffer } {
  const zout = Buffer.from(groepsContextSha256, 'hex');
  const prk = Buffer.from(hkdfSync('sha256', commitGeheim, vorigInitGeheim, Buffer.from('klimop-mls-epoch-joiner-v1', 'utf8'), 32));
  const toepassingSleutel = Buffer.from(hkdfSync('sha256', prk, zout, Buffer.from('klimop-mls-app-secret-v1', 'utf8'), 32));
  const nieuwInitGeheim = Buffer.from(hkdfSync('sha256', prk, zout, Buffer.from('klimop-mls-init-secret-v1', 'utf8'), 32));
  prk.fill(0);
  return { toepassingSleutel, nieuwInitGeheim };
}

function versleutelVoorMlsBlad(
  ontvanger: MlsBladSleutelPakket,
  geheim: Buffer,
  aadLabel: string,
): MlsVersleuteldeDoos {
  const ef = genereerX25519Sleutelpaar();
  const efPriv = createPrivateKey({ key: Buffer.from(ef.geheimPkcs8B64u, 'base64url'), format: 'der', type: 'pkcs8' });
  const peerPub = createPublicKey({ key: Buffer.from(ontvanger.bladX25519PubDerB64u, 'base64url'), format: 'der', type: 'spki' });
  const dh = diffieHellman({ privateKey: efPriv, publicKey: peerPub });
  const sleutel = Buffer.from(hkdfSync('sha256', dh, Buffer.alloc(32, 0), Buffer.from(`klimop-mls-hpke-v1|${aadLabel}`, 'utf8'), 32));
  dh.fill(0);

  const iv = randomBytes(12);
  const c = createCipheriv('chacha20-poly1305', sleutel, iv, { authTagLength: 16 });
  const aad = Buffer.from(`${aadLabel}|${ontvanger.apparaatId}`, 'utf8');
  c.setAAD(aad, { plaintextLength: geheim.length });
  const ct = Buffer.concat([c.update(geheim), c.final()]);
  const tag = c.getAuthTag();
  sleutel.fill(0);

  return {
    ontvangerApparaatId: ontvanger.apparaatId,
    efemeerX25519PubDerB64u: ef.publiekDerB64u,
    ivB64u: iv.toString('base64url'),
    cijfertekstB64u: ct.toString('base64url'),
    tagB64u: tag.toString('base64url'),
  };
}

function ontsleutelVoorMlsBlad(
  doos: MlsVersleuteldeDoos,
  eigenApparaatId: string,
  eigenBladX25519GeheimPkcs8B64u: string,
  aadLabel: string,
): Buffer | null {
  try {
    const eigenPriv = createPrivateKey({ key: Buffer.from(eigenBladX25519GeheimPkcs8B64u, 'base64url'), format: 'der', type: 'pkcs8' });
    const efPub = createPublicKey({ key: Buffer.from(doos.efemeerX25519PubDerB64u, 'base64url'), format: 'der', type: 'spki' });
    const dh = diffieHellman({ privateKey: eigenPriv, publicKey: efPub });
    const sleutel = Buffer.from(hkdfSync('sha256', dh, Buffer.alloc(32, 0), Buffer.from(`klimop-mls-hpke-v1|${aadLabel}`, 'utf8'), 32));
    dh.fill(0);

    const ct = Buffer.from(doos.cijfertekstB64u, 'base64url');
    const d = createDecipheriv('chacha20-poly1305', sleutel, Buffer.from(doos.ivB64u, 'base64url'), { authTagLength: 16 });
    const aad = Buffer.from(`${aadLabel}|${eigenApparaatId}`, 'utf8');
    d.setAAD(aad, { plaintextLength: ct.length });
    d.setAuthTag(Buffer.from(doos.tagB64u, 'base64url'));
    const klaar = Buffer.concat([d.update(ct), d.final()]);
    sleutel.fill(0);
    return klaar;
  } catch {
    return null;
  }
}

/** Генерує підписаний листовий пакет ключа пристрою для приєднання до групового простору MLS. */
export function maakMlsBladSleutelPakket(
  bundel: KlimopApparaatSleutelBundel,
  nuIso?: string,
): { pakket: MlsBladSleutelPakket; bladX25519GeheimPkcs8B64u: string } {
  if (!bundel.certificaat.toegestaneBevoegdheden.includes('groeps_mls_lid')) {
    throw new Error('APPARAAT_MIST_MLS_GROEPSBEVOEGDHEID');
  }
  const blad = genereerX25519Sleutelpaar();
  const kern = {
    schema: 1 as const,
    apparaatId: bundel.certificaat.apparaatId,
    persoonsId: bundel.certificaat.persoonsId,
    tekenPubDerB64u: bundel.certificaat.apparaatTekenPubDerB64u,
    bladX25519PubDerB64u: blad.publiekDerB64u,
    aangemaaktOp: nuIso ?? new Date().toISOString(),
  };
  return {
    pakket: {
      ...kern,
      handtekeningB64u: tekenEd25519(bundel.tekenGeheimPkcs8B64u, Buffer.from(MLS_PAKKET_DOMEIN + canoniekeJson(kern), 'utf8')),
    },
    bladX25519GeheimPkcs8B64u: blad.geheimPkcs8B64u,
  };
}

export function verifieerMlsBladSleutelPakket(pakket: MlsBladSleutelPakket): boolean {
  if (!pakket || pakket.schema !== 1) return false;
  const { handtekeningB64u, ...kern } = pakket;
  return verifieerEd25519(pakket.tekenPubDerB64u, Buffer.from(MLS_PAKKET_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u);
}

/** Ініціалізує нову групову сесію спільного простору або оселі (епоха 1). */
export function maakMlsGroep(opties: {
  groepId: string;
  oprichterBundel: KlimopApparaatSleutelBundel;
  nuIso?: string;
}): MlsLidSessieStaat {
  const eigenBlad = maakMlsBladSleutelPakket(opties.oprichterBundel, opties.nuIso);
  const leden = [eigenBlad.pakket];
  const groepsContextSha256 = berekenMlsGroepsContextSha256(opties.groepId, 1, leden);
  const startZaad = randomBytes(32);
  const commitGeheim = randomBytes(32);
  const afgeleid = leidMlsEpocheSleutelsAf(startZaad, commitGeheim, groepsContextSha256);
  startZaad.fill(0);
  commitGeheim.fill(0);

  return {
    groepId: opties.groepId,
    eigenApparaatId: opties.oprichterBundel.certificaat.apparaatId,
    eigenTekenGeheimPkcs8B64u: opties.oprichterBundel.tekenGeheimPkcs8B64u,
    eigenBladX25519GeheimPkcs8B64u: eigenBlad.bladX25519GeheimPkcs8B64u,
    epoche: 1,
    actieveLeden: leden,
    groepsContextSha256,
    initGeheim: afgeleid.nieuwInitGeheim,
    toepassingSleutel: afgeleid.toepassingSleutel,
    volgendBerichtNummer: 0,
  };
}

function voerMlsGroepsMutatieUit(
  staat: MlsLidSessieStaat,
  soort: 'toevoegen' | 'verwijderen' | 'sleutel_verversen',
  nieuweLedenLijst: MlsBladSleutelPakket[],
  nieuwEigenBladGeheim?: string,
  welkomDoelPakket?: MlsBladSleutelPakket,
): { commit: MlsEpocheCommit; welkom: MlsWelkomPakket | null } {
  if (nieuweLedenLijst.some((l) => !verifieerMlsBladSleutelPakket(l))) {
    throw new Error('MLS_ONGELDIG_SLEUTELPAKKET_IN_GROEP');
  }
  const naarEpoche = staat.epoche + 1;
  const groepsContextSha256 = berekenMlsGroepsContextSha256(staat.groepId, naarEpoche, nieuweLedenLijst);
  const commitGeheim = randomBytes(32);
  const aadLabel = `mls-commit|${staat.groepId}|ep:${naarEpoche}`;

  // Кожен чинний учасник отримує commitGeheim, зашифрований на його листовий ключ X25519 (вилучений пристрій не отримує!)
  const dozen = nieuweLedenLijst
    .filter((l) => l.apparaatId !== welkomDoelPakket?.apparaatId)
    .map((lid) => versleutelVoorMlsBlad(lid, commitGeheim, aadLabel));

  const afgeleid = leidMlsEpocheSleutelsAf(staat.initGeheim, commitGeheim, groepsContextSha256);

  let welkom: MlsWelkomPakket | null = null;
  if (welkomDoelPakket) {
    // Новий учасник отримує лише упакований секрет НОВОЇ епохи (не знаючи попереднього initGeheim — пряма таємниця!)
    const welkomBundel = Buffer.concat([afgeleid.toepassingSleutel, afgeleid.nieuwInitGeheim]);
    welkom = {
      schema: 1,
      groepId: staat.groepId,
      epoche: naarEpoche,
      actieveLeden: nieuweLedenLijst,
      groepsContextSha256,
      ingepaktInitGeheim: versleutelVoorMlsBlad(
        welkomDoelPakket,
        welkomBundel,
        `mls-welkom|${staat.groepId}|ep:${naarEpoche}`,
      ),
    };
    welkomBundel.fill(0);
  }

  // Безповоротно затираємо секрети попередньої епохи у власній пам'яті!
  staat.initGeheim.fill(0);
  staat.toepassingSleutel.fill(0);
  commitGeheim.fill(0);

  if (nieuwEigenBladGeheim) {
    staat.eigenBladX25519GeheimPkcs8B64u = nieuwEigenBladGeheim;
  }
  staat.epoche = naarEpoche;
  staat.actieveLeden = nieuweLedenLijst;
  staat.groepsContextSha256 = groepsContextSha256;
  staat.initGeheim = afgeleid.nieuwInitGeheim;
  staat.toepassingSleutel = afgeleid.toepassingSleutel;
  staat.volgendBerichtNummer = 0;

  const commitKern = {
    schema: 1 as const,
    groepId: staat.groepId,
    vanEpoche: naarEpoche - 1,
    naarEpoche,
    soort,
    afzenderApparaatId: staat.eigenApparaatId,
    actieveLeden: nieuweLedenLijst,
    groepsContextSha256,
    ingepakteCommitGeheimen: dozen,
  };

  return {
    commit: {
      ...commitKern,
      handtekeningB64u: tekenEd25519(
        staat.eigenTekenGeheimPkcs8B64u,
        Buffer.from(MLS_COMMIT_DOMEIN + canoniekeJson(commitKern), 'utf8'),
      ),
    },
    welkom,
  };
}

/** Додає нового учасника/пристрій до групи MLS з просуванням епохи (новий учасник не читає минулих епох). */
export function voegLidToeAanMlsGroep(
  staat: MlsLidSessieStaat,
  nieuwLidPakket: MlsBladSleutelPakket,
): { commit: MlsEpocheCommit; welkom: MlsWelkomPakket } {
  if (staat.actieveLeden.some((l) => l.apparaatId === nieuwLidPakket.apparaatId)) {
    throw new Error('MLS_LID_BESTAAT_REEDS');
  }
  const uit = voerMlsGroepsMutatieUit(
    staat,
    'toevoegen',
    [...staat.actieveLeden, nieuwLidPakket],
    undefined,
    nieuwLidPakket,
  );
  return { commit: uit.commit, welkom: uit.welkom! };
}

/**
 * Вилучає втрачений чи відкликаний пристрій із групи MLS з ротацією листового ключа відправника:
 * забезпечує посткомпрометаційну безпеку — вилучений пристрій не має доступу до ключа нової епохи!
 */
export function verwijderLidUitMlsGroep(
  staat: MlsLidSessieStaat,
  eigenBundel: KlimopApparaatSleutelBundel,
  teVerwijderenApparaatId: string,
  nuIso?: string,
): MlsEpocheCommit {
  if (teVerwijderenApparaatId === staat.eigenApparaatId) {
    throw new Error('MLS_KAN_ZICHZELF_NIET_VERWIJDEREN');
  }
  const overblijvend = staat.actieveLeden.filter((l) => l.apparaatId !== teVerwijderenApparaatId);
  if (overblijvend.length === staat.actieveLeden.length) {
    throw new Error('MLS_TE_VERWIJDEREN_LID_NIET_GEVONDEN');
  }
  const ververstEigenBlad = maakMlsBladSleutelPakket(eigenBundel, nuIso);
  const nieuweLijst = overblijvend.map((l) => (l.apparaatId === staat.eigenApparaatId ? ververstEigenBlad.pakket : l));
  return voerMlsGroepsMutatieUit(staat, 'verwijderen', nieuweLijst, ververstEigenBlad.bladX25519GeheimPkcs8B64u).commit;
}

/** Новий учасник приєднується до групи MLS за зашифрованим пакетом привітання (лише з поточної епохи!). */
export function pasMlsWelkomToe(
  welkom: MlsWelkomPakket,
  eigenBundel: KlimopApparaatSleutelBundel,
  eigenBladX25519GeheimPkcs8B64u: string,
): { ok: true; staat: MlsLidSessieStaat } | { ok: false; fout: string } {
  if (!welkom || welkom.schema !== 1) return { ok: false, fout: 'MLS_WELKOM_ONGELDIG' };
  const verwachteCtx = berekenMlsGroepsContextSha256(welkom.groepId, welkom.epoche, welkom.actieveLeden);
  if (verwachteCtx !== welkom.groepsContextSha256) return { ok: false, fout: 'MLS_WELKOM_CONTEXT_FOUT' };

  const geopend = ontsleutelVoorMlsBlad(
    welkom.ingepaktInitGeheim,
    eigenBundel.certificaat.apparaatId,
    eigenBladX25519GeheimPkcs8B64u,
    `mls-welkom|${welkom.groepId}|ep:${welkom.epoche}`,
  );
  if (!geopend || geopend.length !== 64) {
    return { ok: false, fout: 'MLS_WELKOM_ONTSLEUTELING_MISLUKT' };
  }

  return {
    ok: true,
    staat: {
      groepId: welkom.groepId,
      eigenApparaatId: eigenBundel.certificaat.apparaatId,
      eigenTekenGeheimPkcs8B64u: eigenBundel.tekenGeheimPkcs8B64u,
      eigenBladX25519GeheimPkcs8B64u,
      epoche: welkom.epoche,
      actieveLeden: [...welkom.actieveLeden],
      groepsContextSha256: welkom.groepsContextSha256,
      toepassingSleutel: Buffer.from(geopend.subarray(0, 32)),
      initGeheim: Buffer.from(geopend.subarray(32, 64)),
      volgendBerichtNummer: 0,
    },
  };
}

/** Чинний учасник застосовує підписаний пакет зміни епохи `MlsEpocheCommit` (вилучений пристрій не зможе розшифрувати!). */
export function pasMlsCommitToe(
  staat: MlsLidSessieStaat,
  commit: MlsEpocheCommit,
): { ok: true } | { ok: false; fout: string } {
  if (!commit || commit.schema !== 1 || commit.groepId !== staat.groepId || commit.vanEpoche !== staat.epoche) {
    return { ok: false, fout: 'MLS_COMMIT_EPOCHE_OF_GROEP_FOUT' };
  }
  const afzender = staat.actieveLeden.find((l) => l.apparaatId === commit.afzenderApparaatId);
  if (!afzender) return { ok: false, fout: 'MLS_COMMIT_AFZENDER_NIET_IN_GROEP' };

  const { handtekeningB64u, ...kern } = commit;
  if (!verifieerEd25519(afzender.tekenPubDerB64u, Buffer.from(MLS_COMMIT_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'MLS_COMMIT_HANDTEKENING_ONGELDIG' };
  }

  const verwachteCtx = berekenMlsGroepsContextSha256(commit.groepId, commit.naarEpoche, commit.actieveLeden);
  if (verwachteCtx !== commit.groepsContextSha256) {
    return { ok: false, fout: 'MLS_COMMIT_CONTEXT_KOMT_NIET_OVEREEN' };
  }

  const doos = commit.ingepakteCommitGeheimen.find((d) => d.ontvangerApparaatId === staat.eigenApparaatId);
  if (!doos) {
    return { ok: false, fout: 'MLS_APPARAAT_UIT_GROEP_VERWIJDERD' };
  }

  const commitGeheim = ontsleutelVoorMlsBlad(
    doos,
    staat.eigenApparaatId,
    staat.eigenBladX25519GeheimPkcs8B64u,
    `mls-commit|${commit.groepId}|ep:${commit.naarEpoche}`,
  );
  if (!commitGeheim) return { ok: false, fout: 'MLS_COMMIT_GEHEIM_ONTSLEUTELING_MISLUKT' };

  const afgeleid = leidMlsEpocheSleutelsAf(staat.initGeheim, commitGeheim, commit.groepsContextSha256);
  staat.initGeheim.fill(0);
  staat.toepassingSleutel.fill(0);
  commitGeheim.fill(0);

  staat.epoche = commit.naarEpoche;
  staat.actieveLeden = [...commit.actieveLeden];
  staat.groepsContextSha256 = commit.groepsContextSha256;
  staat.initGeheim = afgeleid.nieuwInitGeheim;
  staat.toepassingSleutel = afgeleid.toepassingSleutel;
  staat.volgendBerichtNummer = 0;
  return { ok: true };
}

/** Шифрує та підписує групове повідомлення в поточній епосі MLS. */
export function versleutelMlsGroepsBericht(staat: MlsLidSessieStaat, klareInhoud: Buffer): MlsGroepsBericht {
  const volgnummer = staat.volgendBerichtNummer++;
  const iv = randomBytes(12);
  const aad = Buffer.from(
    `klimop-mls-msg-v1|${staat.groepId}|ep:${staat.epoche}|${staat.groepsContextSha256}|${staat.eigenApparaatId}|${volgnummer}`,
    'utf8',
  );
  const c = createCipheriv('chacha20-poly1305', staat.toepassingSleutel, iv, { authTagLength: 16 });
  c.setAAD(aad, { plaintextLength: klareInhoud.length });
  const ct = Buffer.concat([c.update(klareInhoud), c.final()]);
  const tag = c.getAuthTag();

  const kern = {
    schema: 1 as const,
    groepId: staat.groepId,
    epoche: staat.epoche,
    afzenderApparaatId: staat.eigenApparaatId,
    volgnummer,
    ivB64u: iv.toString('base64url'),
    cijfertekstB64u: ct.toString('base64url'),
    tagB64u: tag.toString('base64url'),
  };
  return {
    ...kern,
    handtekeningB64u: tekenEd25519(staat.eigenTekenGeheimPkcs8B64u, Buffer.from(MLS_BERICHT_DOMEIN + canoniekeJson(kern), 'utf8')),
  };
}

/** Перевіряє підпис активного учасника поточної епохи та розшифровує групове повідомлення MLS. */
export function ontsleutelMlsGroepsBericht(
  staat: MlsLidSessieStaat,
  bericht: MlsGroepsBericht,
): { ok: true; klareInhoud: Buffer } | { ok: false; fout: string } {
  if (!bericht || bericht.schema !== 1 || bericht.groepId !== staat.groepId || bericht.epoche !== staat.epoche) {
    return { ok: false, fout: 'MLS_BERICHT_EPOCHE_VERSCHILT' };
  }
  const afzender = staat.actieveLeden.find((l) => l.apparaatId === bericht.afzenderApparaatId);
  if (!afzender) return { ok: false, fout: 'MLS_BERICHT_AFZENDER_NIET_IN_EPOCHE' };

  const { handtekeningB64u, ...kern } = bericht;
  if (!verifieerEd25519(afzender.tekenPubDerB64u, Buffer.from(MLS_BERICHT_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'MLS_BERICHT_HANDTEKENING_ONGELDIG' };
  }

  try {
    const ct = Buffer.from(bericht.cijfertekstB64u, 'base64url');
    const aad = Buffer.from(
      `klimop-mls-msg-v1|${staat.groepId}|ep:${staat.epoche}|${staat.groepsContextSha256}|${bericht.afzenderApparaatId}|${bericht.volgnummer}`,
      'utf8',
    );
    const d = createDecipheriv('chacha20-poly1305', staat.toepassingSleutel, Buffer.from(bericht.ivB64u, 'base64url'), { authTagLength: 16 });
    d.setAAD(aad, { plaintextLength: ct.length });
    d.setAuthTag(Buffer.from(bericht.tagB64u, 'base64url'));
    return { ok: true, klareInhoud: Buffer.concat([d.update(ct), d.final()]) };
  } catch {
    return { ok: false, fout: 'MLS_BERICHT_AUTHENTICATIE_MISLUKT' };
  }
}
