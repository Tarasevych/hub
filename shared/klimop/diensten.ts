// KLIMOP-009 (20.11.2026, Етап 8 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Єдиний цифровий простір без спільного необмеженого доступу, безконфліктне узгодження робочих даних (CRDT),
// ізольовані з'єднувачі звичайного інтернету, захищений локальний пошук і поетапне перенесення 11 служб
// (§3, §10–§11, §28–§31, §35–§36 Етап 8, §42 п. 15; обов'язкові Документи №13 та №17 за реєстром Етапу 1 і §44):
//   1. Сувора криптографічна ізоляція всіх 11 служб платформи за псевдонімами psid1_… і окремими ключами HKDF-SHA-256 (§28, §30);
//   2. Зашифровані й підписані безконфліктні структури робочих записів (HLC + LWW-Element-Map CRDT) для автономної роботи
//      пристроїв під час розриву зв'язку та сліпого злиття на вузлах без розкриття вмісту (§10–§11);
//   3. Захищені зовнішні з'єднувачі з ізольованими обліковими даними, обмеженим строком дії, перевіркою відповідей
//      постачальника та забороною оманливих заяв про децентралізацію сторонніх служб (§29, Документ №13);
//   4. Локальний об'єднаний пошук по 4 відокремлених класах джерел із блокуванням передавання відкритих індексів у мережу (§31);
//   5. Покрокове перенесення служб у режимі двосторонньої звірки з автоматичним поверненням при найменшій розбіжності (§35, Док. №17).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { canoniekeJson } from './kern';
import { leidPseudoniemeDienstIdentiteitAf } from './identiteit';

// =================================================================================================
// 1. Одинадцять ізольованих служб «Мого простору» (§3, §28, §30) та контроль міжслужбової взаємодії
// =================================================================================================

export const KLIMOP_ELF_DIENSTEN = Object.freeze([
  'werkblad',            // 1. Головний робочий простір (нотатки, завдання, огляд)
  'postvak',             // 2. Електронна пошта та повідомлення
  'identiteit',          // 3. Облікові записи та самосуверенна ідентичність
  'wolkopslag',          // 4. Хмарне сховище зашифрованих файлів
  'agenda',              // 5. Календар і події
  'ai_ruimte',           // 6. ШІ-простір
  'mcp_poort',           // 7. Шлюз протоколу контексту моделі (14 ШІ-агентів)
  'ontwikkelmiddelen',   // 8. Засоби розробки та інтеграції сховищ коду
  'slimwoon',            // 9. Розумний дім і спільна оселя
  'verbinders',          // 10. Програмні з'єднувачі зовнішніх служб
  'beheer_en_diagnose',  // 11. Адміністрування та діагностика стану вузлів
] as const);

export type KlimopDienstId = (typeof KLIMOP_ELF_DIENSTEN)[number];

export interface KlimopDienstIsolatieProfiel {
  dienstId: KlimopDienstId;
  subdomeinBestaand: string;
  eigenGeheugenRuimte: true;
  magAndereDienstenLezenZonderToestemming: false;
  vereistExterneVerbinderIsolatie: boolean;
}

export const STANDAARD_DIENST_ISOLATIE_PROFIELEN: Readonly<Record<KlimopDienstId, KlimopDienstIsolatieProfiel>> =
  Object.freeze({
    werkblad: {
      dienstId: 'werkblad',
      subdomeinBestaand: 'tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: false,
    },
    postvak: {
      dienstId: 'postvak',
      subdomeinBestaand: 'mail.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: true,
    },
    identiteit: {
      dienstId: 'identiteit',
      subdomeinBestaand: 'id.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: false,
    },
    wolkopslag: {
      dienstId: 'wolkopslag',
      subdomeinBestaand: 'cloud.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: false,
    },
    agenda: {
      dienstId: 'agenda',
      subdomeinBestaand: 'agenda.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: true,
    },
    ai_ruimte: {
      dienstId: 'ai_ruimte',
      subdomeinBestaand: 'ai.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: true,
    },
    mcp_poort: {
      dienstId: 'mcp_poort',
      subdomeinBestaand: 'mcp.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: false,
    },
    ontwikkelmiddelen: {
      dienstId: 'ontwikkelmiddelen',
      subdomeinBestaand: 'github.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: true,
    },
    slimwoon: {
      dienstId: 'slimwoon',
      subdomeinBestaand: 'huis.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: true,
    },
    verbinders: {
      dienstId: 'verbinders',
      subdomeinBestaand: 'api.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: true,
    },
    beheer_en_diagnose: {
      dienstId: 'beheer_en_diagnose',
      subdomeinBestaand: 'admin.tarasevych.com',
      eigenGeheugenRuimte: true,
      magAndereDienstenLezenZonderToestemming: false,
      vereistExterneVerbinderIsolatie: false,
    },
  });

const KRUIS_DIENST_DOMEIN = 'klimop-kruisdienst-toestemming-v1|';
const CRDT_OP_DOMEIN = 'klimop-crdt-operatie-v1|';

function tekenEd25519Der(geheimeSleutelPkcs8B64u: string, boodschap: Buffer): string {
  const priv = createPrivateKey({
    key: Buffer.from(geheimeSleutelPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, boodschap, priv).toString('base64url');
}

function verifieerEd25519Der(publiekeSleutelDerB64u: string, boodschap: Buffer, handtekeningB64u: string): boolean {
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

/**
 * Виводить криптографічно відокремлений псевдонім служби `psid1_<32 hex>` та ізольований 32-байтний ключ
 * шифрування робочих записів конкретної служби (§28, §30): жодна інша служба не може розшифрувати ці дані.
 */
export function leidGeisoleerdeDienstContextAf(opties: {
  persoonsWortelGeheim32: Buffer;
  persoonsZout32: Buffer;
  persoonsId: string;
  dienstId: KlimopDienstId;
  epoche?: number;
}): { dienstId: KlimopDienstId; dienstPsid: string; dienstSleutel32: Buffer; epoche: number } {
  if (opties.persoonsWortelGeheim32.length < 32 || opties.persoonsZout32.length < 32) {
    throw new Error('DIENST_SLEUTELMATERIAAL_TE_KORT');
  }
  if (!KLIMOP_ELF_DIENSTEN.includes(opties.dienstId)) {
    throw new Error('ONBEKENDE_KLIMOP_DIENST');
  }
  const epoche = opties.epoche ?? 1;
  const dienstPsid = leidPseudoniemeDienstIdentiteitAf(opties.persoonsZout32, opties.persoonsId, opties.dienstId);
  const info = Buffer.from(`klimop-dienst-isolatie-v1|${opties.dienstId}|${dienstPsid}|epoche:${epoche}`, 'utf8');
  const dienstSleutel32 = Buffer.from(hkdfSync('sha256', opties.persoonsWortelGeheim32, opties.persoonsZout32, info, 32));
  return { dienstId: opties.dienstId, dienstPsid, dienstSleutel32, epoche };
}

export interface KlimopKruisDienstToestemming {
  schema: 1;
  toestemmingId: string;
  persoonsId: string;
  bronDienst: KlimopDienstId;
  doelDienst: KlimopDienstId;
  toegestaneSleutelPatronen: readonly string[];
  uitgegevenOp: string;
  verlooptOp: string;
  eigenaarPubDerB64u: string;
  handtekeningB64u: string;
}

/** Створює обмежений у часі й за переліком ключів дозвіл власника на передавання конкретного елемента між двома службами (§28). */
export function maakKruisDienstToestemming(opties: {
  persoonsId: string;
  bronDienst: KlimopDienstId;
  doelDienst: KlimopDienstId;
  toegestaneSleutelPatronen: readonly string[];
  eigenaarSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
  geldigheidMinuten?: number;
}): KlimopKruisDienstToestemming {
  if (opties.bronDienst === opties.doelDienst || opties.toegestaneSleutelPatronen.length === 0) {
    throw new Error('ONGELDIGE_KRUISDIENST_TOESTEMMING');
  }
  const uitgegevenOp = opties.nuIso ?? new Date().toISOString();
  const min = Math.max(1, opties.geldigheidMinuten ?? 30);
  const verlooptOp = new Date(Date.parse(uitgegevenOp) + min * 60_000).toISOString();
  const kern = {
    schema: 1 as const,
    toestemmingId: `kdt_${randomBytes(10).toString('hex')}`,
    persoonsId: opties.persoonsId,
    bronDienst: opties.bronDienst,
    doelDienst: opties.doelDienst,
    toegestaneSleutelPatronen: opties.toegestaneSleutelPatronen,
    uitgegevenOp,
    verlooptOp,
    eigenaarPubDerB64u: opties.eigenaarSleutels.publiekeSleutelDerB64u,
  };
  return {
    ...kern,
    handtekeningB64u: tekenEd25519Der(
      opties.eigenaarSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(KRUIS_DIENST_DOMEIN + canoniekeJson(kern), 'utf8'),
    ),
  };
}

export function verifieerKruisDienstToestemming(opties: {
  toestemming: KlimopKruisDienstToestemming;
  verwachteEigenaarPubDerB64u: string;
  bronDienst: KlimopDienstId;
  doelDienst: KlimopDienstId;
  gevraagdeSleutelId: string;
  ingetrokkenToestemmingIds?: ReadonlySet<string>;
  nuIso?: string;
}): { ok: true } | { ok: false; fout: string } {
  const { toestemming } = opties;
  if (opties.ingetrokkenToestemmingIds?.has(toestemming.toestemmingId)) {
    return { ok: false, fout: 'KRUISDIENST_TOESTEMMING_INGETROKKEN' };
  }
  if (
    toestemming.eigenaarPubDerB64u !== opties.verwachteEigenaarPubDerB64u
    || toestemming.bronDienst !== opties.bronDienst
    || toestemming.doelDienst !== opties.doelDienst
  ) {
    return { ok: false, fout: 'KRUISDIENST_DOEL_OF_EIGENAAR_ONGELDIG' };
  }
  const { handtekeningB64u, ...kern } = toestemming;
  if (!verifieerEd25519Der(toestemming.eigenaarPubDerB64u, Buffer.from(KRUIS_DIENST_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'KRUISDIENST_HANDTEKENING_ONGELDIG' };
  }
  const nuMs = Date.parse(opties.nuIso ?? new Date().toISOString());
  if (nuMs > Date.parse(toestemming.verlooptOp)) {
    return { ok: false, fout: 'KRUISDIENST_TOESTEMMING_VERLOPEN' };
  }
  if (!toestemming.toegestaneSleutelPatronen.includes(opties.gevraagdeSleutelId)) {
    return { ok: false, fout: 'KRUISDIENST_SLEUTEL_NIET_TOEGESTAAN' };
  }
  return { ok: true };
}

// =================================================================================================
// 2. Зашифровані й підписані безконфліктні структури робочих записів (HLC + LWW-Element-Map CRDT)
// =================================================================================================

export interface HlcStempel {
  fysiekMs: number;
  logischTeller: number;
  apparaatId: string;
}

export function maakHlcStempel(fysiekMs: number, logischTeller: number, apparaatId: string): HlcStempel {
  return { fysiekMs: Math.trunc(fysiekMs), logischTeller: Math.max(0, Math.trunc(logischTeller)), apparaatId };
}

/** Строгий детермінований повний порядок для вирішення одночасних правок без втрати узгодженості між вузлами. */
export function vergelijkHlcStempels(a: HlcStempel, b: HlcStempel): number {
  if (a.fysiekMs !== b.fysiekMs) return a.fysiekMs < b.fysiekMs ? -1 : 1;
  if (a.logischTeller !== b.logischTeller) return a.logischTeller < b.logischTeller ? -1 : 1;
  if (a.apparaatId === b.apparaatId) return 0;
  return a.apparaatId < b.apparaatId ? -1 : 1;
}

export interface KlimopOndertekendeCrdtOperatie {
  schema: 1;
  dienstId: KlimopDienstId;
  dienstPsid: string;
  sleutelId: string;
  soort: 'zet' | 'verwijder';
  hlc: HlcStempel;
  epoche: number;
  ivB64u: string;
  cijfertekstB64u: string;
  authTagB64u: string;
  apparaatTekenPubDerB64u: string;
  handtekeningB64u: string;
}

export interface KlimopDienstCrdtStaat {
  schema: 1;
  dienstId: KlimopDienstId;
  dienstPsid: string;
  elementen: Record<string, KlimopOndertekendeCrdtOperatie>;
}

function crdtAad(dienstId: KlimopDienstId, dienstPsid: string, sleutelId: string, soort: 'zet' | 'verwijder', hlc: HlcStempel, epoche: number): Buffer {
  return Buffer.from(
    `klimop-crdt-aad-v1|${dienstId}|${dienstPsid}|${sleutelId}|${soort}|${hlc.fysiekMs}:${hlc.logischTeller}:${hlc.apparaatId}|epoche:${epoche}`,
    'utf8',
  );
}

/**
 * Створює на пристрої власника зашифровану (`ChaCha20-Poly1305`) та підписану (`Ed25519`) CRDT-операцію:
 * вузол синхронізації перевіряє підпис і зливає стан, не маючи жодного доступу до відкритого вмісту запису!
 */
export function maakOndertekendeCrdtOperatie(opties: {
  dienstContext: { dienstId: KlimopDienstId; dienstPsid: string; dienstSleutel32: Buffer; epoche: number };
  sleutelId: string;
  soort: 'zet' | 'verwijder';
  klareWaarde: unknown;
  hlc: HlcStempel;
  apparaatTekenSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
}): KlimopOndertekendeCrdtOperatie {
  const { dienstContext } = opties;
  const iv = randomBytes(12);
  const aad = crdtAad(dienstContext.dienstId, dienstContext.dienstPsid, opties.sleutelId, opties.soort, opties.hlc, dienstContext.epoche);
  const klareBytes = Buffer.from(canoniekeJson(opties.soort === 'verwijder' ? null : opties.klareWaarde), 'utf8');

  const cipher = createCipheriv('chacha20-poly1305', dienstContext.dienstSleutel32, iv, { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: klareBytes.length });
  const ct = Buffer.concat([cipher.update(klareBytes), cipher.final()]);
  const tag = cipher.getAuthTag();

  const kern = {
    schema: 1 as const,
    dienstId: dienstContext.dienstId,
    dienstPsid: dienstContext.dienstPsid,
    sleutelId: opties.sleutelId,
    soort: opties.soort,
    hlc: opties.hlc,
    epoche: dienstContext.epoche,
    ivB64u: iv.toString('base64url'),
    cijfertekstB64u: ct.toString('base64url'),
    authTagB64u: tag.toString('base64url'),
    apparaatTekenPubDerB64u: opties.apparaatTekenSleutels.publiekeSleutelDerB64u,
  };

  return {
    ...kern,
    handtekeningB64u: tekenEd25519Der(
      opties.apparaatTekenSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(CRDT_OP_DOMEIN + canoniekeJson(kern), 'utf8'),
    ),
  };
}

/** Сліпа перевірка підпису CRDT-операції на вузлі синхронізації (без ключа шифрування служби!). */
export function verifieerCrdtOperatieHandtekening(
  op: KlimopOndertekendeCrdtOperatie,
  toegestaneApparaatPubSleutels?: ReadonlySet<string>,
): { ok: true } | { ok: false; fout: string } {
  if (!op || op.schema !== 1 || !KLIMOP_ELF_DIENSTEN.includes(op.dienstId)) {
    return { ok: false, fout: 'CRDT_OPERATIE_ONGELDIGE_VORM' };
  }
  if (toegestaneApparaatPubSleutels && !toegestaneApparaatPubSleutels.has(op.apparaatTekenPubDerB64u)) {
    return { ok: false, fout: 'CRDT_ONBEKEND_OF_INGETROKKEN_APPARAAT' };
  }
  const { handtekeningB64u, ...kern } = op;
  if (!verifieerEd25519Der(op.apparaatTekenPubDerB64u, Buffer.from(CRDT_OP_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'CRDT_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}

/** Розшифровує значення CRDT-запису на пристрої власника; ключ іншої служби гарантовано зазнає криптографічної відмови! */
export function ontsleutelCrdtOperatieWaarde<T = unknown>(
  op: KlimopOndertekendeCrdtOperatie,
  dienstContext: { dienstId: KlimopDienstId; dienstPsid: string; dienstSleutel32: Buffer; epoche: number },
): { ok: true; soort: 'zet' | 'verwijder'; waarde: T | null } | { ok: false; fout: string } {
  if (op.dienstId !== dienstContext.dienstId || op.dienstPsid !== dienstContext.dienstPsid) {
    return { ok: false, fout: 'DIENST_ISOLATIE_GRENS_GEWEIGERD' };
  }
  const vSig = verifieerCrdtOperatieHandtekening(op);
  if (!vSig.ok) return vSig;

  try {
    const iv = Buffer.from(op.ivB64u, 'base64url');
    const ct = Buffer.from(op.cijfertekstB64u, 'base64url');
    const tag = Buffer.from(op.authTagB64u, 'base64url');
    const aad = crdtAad(op.dienstId, op.dienstPsid, op.sleutelId, op.soort, op.hlc, op.epoche);
    const decipher = createDecipheriv('chacha20-poly1305', dienstContext.dienstSleutel32, iv, { authTagLength: 16 });
    decipher.setAAD(aad, { plaintextLength: ct.length });
    decipher.setAuthTag(tag);
    const klaar = Buffer.concat([decipher.update(ct), decipher.final()]);
    return {
      ok: true,
      soort: op.soort,
      waarde: op.soort === 'verwijder' ? null : (JSON.parse(klaar.toString('utf8')) as T),
    };
  } catch {
    return { ok: false, fout: 'CRDT_ONTSLEUTELING_MISLUKT_ANDERE_SLEUTEL' };
  }
}

export function maakLegeDienstCrdtStaat(dienstId: KlimopDienstId, dienstPsid: string): KlimopDienstCrdtStaat {
  return { schema: 1, dienstId, dienstPsid, elementen: {} };
}

/**
 * Комутативне, асоціативне й ідемпотентне злиття двох CRDT-станів однієї служби:
 * гарантує однаковий результат на всіх вузлах незалежно від порядку надходження пакетів після відновлення мережі (§10).
 */
export function voegCrdtStatenSamen(
  staatA: KlimopDienstCrdtStaat,
  staatB: KlimopDienstCrdtStaat,
  toegestaneApparaatPubSleutels?: ReadonlySet<string>,
): { ok: true; samengevoegd: KlimopDienstCrdtStaat } | { ok: false; fout: string } {
  if (staatA.dienstId !== staatB.dienstId || staatA.dienstPsid !== staatB.dienstPsid) {
    return { ok: false, fout: 'CRDT_SAMENVOEGING_VERSCHILLENDE_DIENSTEN_GEWEIGERD' };
  }

  const elementen: Record<string, KlimopOndertekendeCrdtOperatie> = {};
  for (const bron of [staatA.elementen, staatB.elementen]) {
    for (const [sleutelId, op] of Object.entries(bron)) {
      if (op.dienstId !== staatA.dienstId || op.dienstPsid !== staatA.dienstPsid || op.sleutelId !== sleutelId) {
        return { ok: false, fout: 'CRDT_ELEMENT_DIENST_MISMATCH' };
      }
      const v = verifieerCrdtOperatieHandtekening(op, toegestaneApparaatPubSleutels);
      if (!v.ok) return v;

      const bestaand = elementen[sleutelId];
      if (!bestaand || vergelijkHlcStempels(bestaand.hlc, op.hlc) < 0) {
        elementen[sleutelId] = op;
      }
    }
  }

  return {
    ok: true,
    samengevoegd: {
      schema: 1,
      dienstId: staatA.dienstId,
      dienstPsid: staatA.dienstPsid,
      elementen,
    },
  };
}

// =================================================================================================
// 3. Ізольовані з'єднувачі звичайного інтернету (§29–§30, §42 п. 15; Документ №13 за реєстром Етапу 1)
// =================================================================================================

export type ExternePrivacyWirkelijkheid =
  | 'gecentraliseerde_externe_aanbieder'
  | 'federatieve_aanbieder_zonder_e2ee'
  | 'bewezen_e2ee_en_gedecentraliseerd';

export interface KlimopExterneVerbinderContract {
  schema: 1;
  verbinderId: string;
  doelDienst: KlimopDienstId;
  aanbiederNaam: string;
  officieleKoppelingSoort: 'oauth2_pkce' | 'imap_smtp_tls' | 'caldav_tls' | 'https_rest_officieel';
  gebruiktOnofficieleKoppeling?: boolean;
  eigenGeisoleerdeGeheimKluisId: string;
  minimaleRechten: readonly string[];
  uitgegevenOp: string;
  verlooptOp: string;
  ingetrokken: boolean;
  magRechtenDoorgevenZonderToestemming: boolean;
  werkelijkeAanbiederPrivacy: ExternePrivacyWirkelijkheid;
  gepresenteerdAanGebruikerAlsVolledigPrivaatEnGedecentraliseerd: boolean;
  maxAntwoordBytes: number;
}

/**
 * Перевіряє зовнішній з'єднувач за всіма 9 правилами §29–§30 маніфесту (Документ №13):
 *   - блокує неофіційні обхідні способи під'єднання, надлишкові права (`*` / `onbeperkt`), спільні ключі між з'єднувачами,
 *     прострочені чи відкликані доступи, передавання прав іншим службам та оманливу рекламу сторонніх служб як децентралізованих!
 */
export function valideerExterneVerbinder(
  contract: KlimopExterneVerbinderContract,
  reedsGebruikteKluisIdsDoorAndereVerbinders: ReadonlySet<string> = new Set(),
  nuIso = new Date().toISOString(),
): { ok: true } | { ok: false; fout: string } {
  if (contract.gebruiktOnofficieleKoppeling) {
    return { ok: false, fout: 'VERBINDER_ONOFFICIELE_KOPPELING_VERBODEN' };
  }
  if (contract.ingetrokken) {
    return { ok: false, fout: 'VERBINDER_IS_INGETROKKEN' };
  }
  if (contract.magRechtenDoorgevenZonderToestemming) {
    return { ok: false, fout: 'VERBINDER_MAG_RECHTEN_NIET_DOORGEVEN' };
  }
  if (
    contract.minimaleRechten.length === 0
    || contract.minimaleRechten.some((r) => r === '*' || r.toLowerCase().includes('onbeperkt'))
  ) {
    return { ok: false, fout: 'VERBINDER_SCHENDT_MINIMALE_BEVOEGDHEDEN' };
  }
  if (
    !contract.eigenGeisoleerdeGeheimKluisId
    || reedsGebruikteKluisIdsDoorAndereVerbinders.has(contract.eigenGeisoleerdeGeheimKluisId)
  ) {
    return { ok: false, fout: 'VERBINDER_DEELT_INLOGGEGEVENS_MET_ANDERE_DIENST' };
  }
  if (Date.parse(nuIso) > Date.parse(contract.verlooptOp)) {
    return { ok: false, fout: 'VERBINDER_TOEGANG_VERLOPEN' };
  }
  // §29 абз. 3: не представляти сторонню централізовану службу як повністю приватну або децентралізовану!
  if (
    contract.gepresenteerdAanGebruikerAlsVolledigPrivaatEnGedecentraliseerd
    && contract.werkelijkeAanbiederPrivacy !== 'bewezen_e2ee_en_gedecentraliseerd'
  ) {
    return { ok: false, fout: 'VERBINDER_MISLEIDENDE_PRIVACY_CLAIM_GEWEIGERD' };
  }
  return { ok: true };
}

export interface VerbinderAuditRegel {
  tijdIso: string;
  verbinderId: string;
  doelDienst: KlimopDienstId;
  actieNaam: string;
  antwoordSha256: string;
  grootteBytes: number;
  bevatGeheimenOfInhoud: false;
}

/** Перевіряє розмір і JSON-будову відповіді зовнішнього постачальника та формує очищений запис аудиту (§29, §42 п. 15). */
export function verwerkExterneVerbinderAntwoord(opties: {
  contract: KlimopExterneVerbinderContract;
  actieNaam: string;
  ruwAntwoord: Buffer;
  vereisteSleutelsInJson: readonly string[];
  nuIso?: string;
}): { ok: true; geparseerd: Record<string, unknown>; auditRegel: VerbinderAuditRegel } | { ok: false; fout: string } {
  const v = valideerExterneVerbinder(opties.contract, new Set(), opties.nuIso);
  if (!v.ok) return v;

  if (opties.ruwAntwoord.length > opties.contract.maxAntwoordBytes) {
    return { ok: false, fout: 'VERBINDER_ANTWOORD_OVERSCHRIJDT_LIMIET' };
  }
  let obj: unknown;
  try {
    obj = JSON.parse(opties.ruwAntwoord.toString('utf8'));
  } catch {
    return { ok: false, fout: 'VERBINDER_ANTWOORD_ONGELDIGE_JSON' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, fout: 'VERBINDER_ANTWOORD_GEEN_OBJECT' };
  }
  const rec = obj as Record<string, unknown>;
  for (const k of opties.vereisteSleutelsInJson) {
    if (!(k in rec)) {
      return { ok: false, fout: 'VERBINDER_ANTWOORD_MIST_VERPLICHT_VELD' };
    }
  }

  return {
    ok: true,
    geparseerd: rec,
    auditRegel: {
      tijdIso: opties.nuIso ?? new Date().toISOString(),
      verbinderId: opties.contract.verbinderId,
      doelDienst: opties.contract.doelDienst,
      actieNaam: opties.actieNaam,
      antwoordSha256: createHash('sha256').update(opties.ruwAntwoord).digest('hex'),
      grootteBytes: opties.ruwAntwoord.length,
      bevatGeheimenOfInhoud: false,
    },
  };
}

// =================================================================================================
// 4. Захищений локальний спільний пошук по 4 відокремлених класах джерел (§31)
// =================================================================================================

export const KLIMOP_ZOEK_BRON_KLASSEN = Object.freeze([
  'openbare_gegevens',          // 1. Відкриті відомості
  'dienst_metadata',            // 2. Службові метадані
  'prive_versleuteld_materiaal', // 3. Приватні зашифровані матеріали (лише на довіреному пристрої!)
  'externe_aanbieder_gegevens',  // 4. Дані зовнішніх постачальників (з чесним позначенням походження)
] as const);

export type KlimopZoekBronKlasse = (typeof KLIMOP_ZOEK_BRON_KLASSEN)[number];

export interface LokaalZoekDocument {
  documentId: string;
  dienstId: KlimopDienstId;
  bronKlasse: KlimopZoekBronKlasse;
  titel: string;
  tekstInhoud: string;
}

export interface KlimopLokaleZoekIndex {
  alleenOpVertrouwdApparaatGeheugen: true;
  documenten: Map<string, LokaalZoekDocument>;
  omgekeerdeWoorden: Map<string, Set<string>>;
}

function tokeniseerZoekTekst(tekst: string): string[] {
  return tekst
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((w) => w.length >= 2);
}

export function maakLokaleZoekIndex(): KlimopLokaleZoekIndex {
  return {
    alleenOpVertrouwdApparaatGeheugen: true,
    documenten: new Map(),
    omgekeerdeWoorden: new Map(),
  };
}

export function voegToeAanLokaleZoekIndex(index: KlimopLokaleZoekIndex, doc: LokaalZoekDocument): void {
  index.documenten.set(doc.documentId, doc);
  for (const woord of tokeniseerZoekTekst(`${doc.titel} ${doc.tekstInhoud}`)) {
    let verzameling = index.omgekeerdeWoorden.get(woord);
    if (!verzameling) {
      verzameling = new Set();
      index.omgekeerdeWoorden.set(woord, verzameling);
    }
    verzameling.add(doc.documentId);
  }
}

export interface LokaalZoekResultaat {
  documentId: string;
  dienstId: KlimopDienstId;
  bronKlasse: KlimopZoekBronKlasse;
  titel: string;
}

/** Виконує об'єднаний пошук виключно в пам'яті довіреного пристрою за дозволеними службами й класами джерел (§31). */
export function zoekLokaalOverBronnen(opties: {
  index: KlimopLokaleZoekIndex;
  zoekopdracht: string;
  toegestaneDiensten: ReadonlySet<KlimopDienstId>;
  toegestaneBronKlassen?: ReadonlySet<KlimopZoekBronKlasse>;
}): LokaalZoekResultaat[] {
  const termen = tokeniseerZoekTekst(opties.zoekopdracht);
  if (termen.length === 0) return [];

  let kandidaatIds: Set<string> | null = null;
  for (const term of termen) {
    const treffers = opties.index.omgekeerdeWoorden.get(term) ?? new Set<string>();
    if (kandidaatIds === null) {
      kandidaatIds = new Set(treffers);
    } else {
      for (const id of [...kandidaatIds]) {
        if (!treffers.has(id)) kandidaatIds.delete(id);
      }
    }
  }
  if (!kandidaatIds) return [];

  const resultaten: LokaalZoekResultaat[] = [];
  for (const id of kandidaatIds) {
    const doc = opties.index.documenten.get(id);
    if (!doc) continue;
    if (!opties.toegestaneDiensten.has(doc.dienstId)) continue;
    if (opties.toegestaneBronKlassen && !opties.toegestaneBronKlassen.has(doc.bronKlasse)) continue;
    resultaten.push({
      documentId: doc.documentId,
      dienstId: doc.dienstId,
      bronKlasse: doc.bronKlasse,
      titel: doc.titel,
    });
  }
  return resultaten.sort((a, b) => a.documentId.localeCompare(b.documentId));
}

/**
 * Запобіжник §31 абз. 4: категорично блокує передавання розшифрованого індексу, листів або приватних документів
 * у загальну мережу вузлів заради зручності пошуку!
 */
export function controleerGeenKlareIndexOpNetwerk(netwerkPakket: unknown): {
  veiligVoorNetwerk: boolean;
  fout: string | null;
} {
  if (netwerkPakket && typeof netwerkPakket === 'object') {
    const rec = netwerkPakket as Record<string, unknown>;
    if (
      rec.alleenOpVertrouwdApparaatGeheugen === true
      || 'omgekeerdeWoorden' in rec
      || 'tekstInhoud' in rec
      || rec.bronKlasse === 'prive_versleuteld_materiaal'
    ) {
      return { veiligVoorNetwerk: false, fout: 'KLARE_ZOEKINDEX_OP_NETWERK_VERBODEN' };
    }
  }
  return { veiligVoorNetwerk: true, fout: null };
}

// =================================================================================================
// 5. Поетапне перенесення служб у режимі двосторонньої звірки без втрати даних (§35, Документ №17)
// =================================================================================================

export const KLIMOP_OVERDRACHT_MODI = Object.freeze([
  'alleen_erfenis_postgres',            // Крок 0: чинна система PostgreSQL 18.6 (початковий стан)
  'schaduw_dubbel_schrijven',           // Крок 1: подвійний запис і неперервна фонова звірка зі старою БД
  'klimop_primair_met_erfenis_terugval', // Крок 2: робота через вузли «Плюща» зі збереженням гарячої лінії повернення
  'volledig_onafhankelijk_geverifieerd', // Крок 3: доведена незалежна робота (лише після окремого дозволу власника!)
] as const);

export type KlimopOverdrachtModus = (typeof KLIMOP_OVERDRACHT_MODI)[number];

export interface DienstStaatSamenvattingRecord {
  sleutelId: string;
  inhoudSha256: string;
  machtigingenSha256: string;
}

export interface TweezijdigePariteitVerslag {
  volledigGelijk: boolean;
  totaalErfenisRecords: number;
  totaalKlimopRecords: number;
  ontbrekendeInKlimopIds: string[];
  afwijkendeInhoudIds: string[];
  afwijkendeMachtigingenIds: string[];
}

/** Порівнює контрольні суми записів і дозволів служби між чинною БД PostgreSQL та вузлами «Плюща» (§35). */
export function vergelijkErfenisEnKlimopStaat(
  erfenisRecords: readonly DienstStaatSamenvattingRecord[],
  klimopRecords: readonly DienstStaatSamenvattingRecord[],
): TweezijdigePariteitVerslag {
  const klimopMap = new Map(klimopRecords.map((r) => [r.sleutelId, r]));
  const ontbrekendeInKlimopIds: string[] = [];
  const afwijkendeInhoudIds: string[] = [];
  const afwijkendeMachtigingenIds: string[] = [];

  for (const erf of erfenisRecords) {
    const kl = klimopMap.get(erf.sleutelId);
    if (!kl) {
      ontbrekendeInKlimopIds.push(erf.sleutelId);
      continue;
    }
    if (kl.inhoudSha256 !== erf.inhoudSha256) {
      afwijkendeInhoudIds.push(erf.sleutelId);
    }
    if (kl.machtigingenSha256 !== erf.machtigingenSha256) {
      afwijkendeMachtigingenIds.push(erf.sleutelId);
    }
  }

  const volledigGelijk =
    erfenisRecords.length === klimopRecords.length
    && ontbrekendeInKlimopIds.length === 0
    && afwijkendeInhoudIds.length === 0
    && afwijkendeMachtigingenIds.length === 0;

  return {
    volledigGelijk,
    totaalErfenisRecords: erfenisRecords.length,
    totaalKlimopRecords: klimopRecords.length,
    ontbrekendeInKlimopIds,
    afwijkendeInhoudIds,
    afwijkendeMachtigingenIds,
  };
}

/**
 * Керує переходом служби між сходинками перенесення (§35 маніфесту):
 *   - при виявленні втрати бодай одного запису чи розбіжності дозволів перенесення автоматично зупиняється,
 *     а служба безпечно повертається на попередню перевірену сходинку;
 *   - перехід до фінальної сходинки `volledig_onafhankelijk_geverifieerd` додатково вимагає явного дозволу власника!
 */
export function beslisOverDienstOverdrachtStap(opties: {
  dienstId: KlimopDienstId;
  huidigeModus: KlimopOverdrachtModus;
  gewensteModus: KlimopOverdrachtModus;
  pariteit: TweezijdigePariteitVerslag;
  uitdrukkelijkeGoedkeuringEigenaarVoorVolledigOnafhankelijk?: boolean;
}): {
  toegestaan: boolean;
  nieuweActieveModus: KlimopOverdrachtModus;
  reden: string;
} {
  if (!opties.pariteit.volledigGelijk) {
    const huidigeIndex = KLIMOP_OVERDRACHT_MODI.indexOf(opties.huidigeModus);
    const veiligeTerugvalModus =
      huidigeIndex <= 1 ? 'alleen_erfenis_postgres' : KLIMOP_OVERDRACHT_MODI[huidigeIndex - 1];
    return {
      toegestaan: false,
      nieuweActieveModus: veiligeTerugvalModus,
      reden: 'AUTOMATISCH_TERUGGEZET_WEGENS_PARITEITSAFWIJKING',
    };
  }

  const vanIdx = KLIMOP_OVERDRACHT_MODI.indexOf(opties.huidigeModus);
  const naarIdx = KLIMOP_OVERDRACHT_MODI.indexOf(opties.gewensteModus);
  if (naarIdx > vanIdx + 1) {
    return {
      toegestaan: false,
      nieuweActieveModus: opties.huidigeModus,
      reden: 'STAP_OVERSLAAN_VERBODEN_GEFASEERDE_OVERDRACHT',
    };
  }
  if (
    opties.gewensteModus === 'volledig_onafhankelijk_geverifieerd'
    && !opties.uitdrukkelijkeGoedkeuringEigenaarVoorVolledigOnafhankelijk
  ) {
    return {
      toegestaan: false,
      nieuweActieveModus: opties.huidigeModus,
      reden: 'VOLLEDIGE_LOSKOPPELING_VEREIST_GOEDKEURING_EIGENAAR',
    };
  }

  return {
    toegestaan: true,
    nieuweActieveModus: opties.gewensteModus,
    reden: 'PARITEIT_BEWEZEN_STAP_VEILIG',
  };
}
