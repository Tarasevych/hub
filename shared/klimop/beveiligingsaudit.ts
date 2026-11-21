// KLIMOP-012 (21.11.2026, Етап 11 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Незалежний аудит безпеки, зведена модель загроз і залишкових ризиків (обов'язковий Документ №20),
// гібридна постквантова криптографія на стандартах FIPS 203 (ML-KEM-768) і FIPS 204 (ML-DSA-65) у вбудованому node:crypto,
// перевірка 10 криптографічних сценаріїв (§38), 6 сценаріїв автономності (§40) та 12 вимірюваних гарантій (§41):
//   1. Справжні гібридні підписи `Ed25519 + ML-DSA-65` та інкапсуляція ключів `X25519 + ML-KEM-768` (§13, §38);
//   2. Повна модель загроз із чесним переліком залишкових ризиків без заборонених заяв про абсолютну невразливість (§43 п. 1);
//   3. Оцінювачі обов'язкових програм перевірки криптографії (§38), автономності (§40) та вимірюваних показників (§41);
//   4. Гібридно підписаний звіт незалежного аудиту Етапу 11, де будь-яке відкрите слабке місце блокує перехід до Етапу 12.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  decapsulate,
  diffieHellman,
  encapsulate,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import {
  KLIMOP_BLAD_ROLLEN,
  KLIMOP_KNOOPPUNT_TYPEN,
  beoordeelKlimopWijziging,
  berekenKnooppuntId,
  canoniekeJson,
  type KlimopBladRol,
  type KlimopControleVraagId,
  type KlimopKnooppuntIdentiteit,
  type KlimopKnooppuntType,
  type KlimopVerbodenVereenvoudigingId,
} from './kern';

const HYBRIDE_HANDTEKENING_DOMEIN = 'klimop-hybride-ed25519-mldsa65-v1|';
const HYBRIDE_KEM_HKDF_INFO_VOORVOEGSEL = 'klimop-hybride-x25519-mlkem768-v1|';
const AUDIT_RAPPORT_DOMEIN = 'klimop-etappe11-auditrapport-v1|';

// =================================================================================================
// 1. Гібридна постквантова криптографія (§13, §36 Етап 11): Ed25519 + ML-DSA-65 та X25519 + ML-KEM-768
// =================================================================================================

export interface HybridePostkwantumSleutelbundel {
  identiteit: KlimopKnooppuntIdentiteit;
  ed25519PubliekDerB64u: string;
  ed25519GeheimPkcs8B64u: string;
  mlDsa65PubliekSpkiB64u: string;
  mlDsa65GeheimPkcs8B64u: string;
  x25519PubliekSpkiB64u: string;
  x25519GeheimPkcs8B64u: string;
  mlKem768PubliekSpkiB64u: string;
  mlKem768GeheimPkcs8B64u: string;
}

export interface HybrideDubbeleHandtekening {
  schema: 1;
  algoritme: 'ed25519+ml-dsa-65';
  ed25519PubliekDerB64u: string;
  mlDsa65PubliekSpkiB64u: string;
  ed25519HandtekeningB64u: string;
  mlDsa65HandtekeningB64u: string;
}

export interface HybrideIngekapseldeSleutel {
  schema: 1;
  algoritme: 'x25519+ml-kem-768-hkdf-sha256';
  efemeerX25519PubSpkiB64u: string;
  mlKem768CijfertekstB64u: string;
}

/**
 * Створює паспорт вузла з увімкненим гібридним постквантовим профілем (`ed25519+ml-dsa-65-voorbereid`)
 * та повним комплектом стандартизованих пар ключів `Ed25519`, `ML-DSA-65` (FIPS 204), `X25519` і `ML-KEM-768` (FIPS 203).
 */
export function maakHybridePostkwantumKnooppunt(opties: {
  type: KlimopKnooppuntType;
  rollen: readonly KlimopBladRol[];
  juridischeRegio: string;
  aanbieder: string;
  nuIso?: string;
}): HybridePostkwantumSleutelbundel {
  if (!KLIMOP_KNOOPPUNT_TYPEN.includes(opties.type)) {
    throw new Error('KLIMOP_ONGELDIG_KNOOPPUNT_TYPE');
  }
  if (!opties.rollen.length || opties.rollen.some((r) => !KLIMOP_BLAD_ROLLEN.includes(r))) {
    throw new Error('KLIMOP_ONGELDIGE_BLAD_ROL');
  }
  const regio = String(opties.juridischeRegio || '').trim().toUpperCase();
  const aanbieder = String(opties.aanbieder || '').trim().toLowerCase();
  if (regio.length < 2 || !aanbieder) {
    throw new Error('KLIMOP_REGIO_OF_AANBIEDER_ONTBREEKT');
  }

  const ed = generateKeyPairSync('ed25519');
  const mldsa = generateKeyPairSync('ml-dsa-65');
  const x25519 = generateKeyPairSync('x25519');
  const mlkem = generateKeyPairSync('ml-kem-768');

  const edPub = (ed.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const edPriv = (ed.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url');
  const pqDsaPub = (mldsa.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const pqDsaPriv = (mldsa.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url');
  const xPub = (x25519.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const xPriv = (x25519.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url');
  const kemPub = (mlkem.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const kemPriv = (mlkem.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url');

  return {
    identiteit: {
      schema: 1,
      knooppuntId: berekenKnooppuntId(edPub),
      type: opties.type,
      rollen: [...new Set(opties.rollen)],
      juridischeRegio: regio,
      aanbieder,
      algoritme: 'ed25519+ml-dsa-65-voorbereid',
      publiekeSleutelDerB64u: edPub,
      postkwantumPubliekeSleutelB64u: pqDsaPub,
      aangemaaktOp: opties.nuIso ?? new Date().toISOString(),
    },
    ed25519PubliekDerB64u: edPub,
    ed25519GeheimPkcs8B64u: edPriv,
    mlDsa65PubliekSpkiB64u: pqDsaPub,
    mlDsa65GeheimPkcs8B64u: pqDsaPriv,
    x25519PubliekSpkiB64u: xPub,
    x25519GeheimPkcs8B64u: xPriv,
    mlKem768PubliekSpkiB64u: kemPub,
    mlKem768GeheimPkcs8B64u: kemPriv,
  };
}

function bouwHybrideTekenInvoer(
  ed25519PubliekDerB64u: string,
  mlDsa65PubliekSpkiB64u: string,
  boodschap: Buffer,
): Buffer {
  const sleutelBinding = createHash('sha256')
    .update(ed25519PubliekDerB64u)
    .update('|')
    .update(mlDsa65PubliekSpkiB64u)
    .digest('hex');
  return Buffer.concat([
    Buffer.from(`${HYBRIDE_HANDTEKENING_DOMEIN}${sleutelBinding}|`, 'utf8'),
    boodschap,
  ]);
}

/** Створює гібридний подвійний підпис `Ed25519 + ML-DSA-65` з криптографічною прив'язкою обох публічних ключів. */
export function ondertekenHybrideEd25519MlDsa65(
  boodschap: Buffer,
  ondertekenaar: {
    ed25519PubliekDerB64u: string;
    ed25519GeheimPkcs8B64u: string;
    mlDsa65PubliekSpkiB64u: string;
    mlDsa65GeheimPkcs8B64u: string;
  },
): HybrideDubbeleHandtekening {
  const invoer = bouwHybrideTekenInvoer(
    ondertekenaar.ed25519PubliekDerB64u,
    ondertekenaar.mlDsa65PubliekSpkiB64u,
    boodschap,
  );
  const edPriv = createPrivateKey({
    key: Buffer.from(ondertekenaar.ed25519GeheimPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  const pqPriv = createPrivateKey({
    key: Buffer.from(ondertekenaar.mlDsa65GeheimPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });

  return {
    schema: 1,
    algoritme: 'ed25519+ml-dsa-65',
    ed25519PubliekDerB64u: ondertekenaar.ed25519PubliekDerB64u,
    mlDsa65PubliekSpkiB64u: ondertekenaar.mlDsa65PubliekSpkiB64u,
    ed25519HandtekeningB64u: sign(null, invoer, edPriv).toString('base64url'),
    mlDsa65HandtekeningB64u: sign(null, invoer, pqPriv).toString('base64url'),
  };
}

/**
 * Перевіряє гібридний підпис `Ed25519 + ML-DSA-65`:
 * дійсний ТІЛЬКИ якщо одночасно справжні обидві частини (і класична, і постквантова)!
 */
export function verifieerHybrideEd25519MlDsa65(
  boodschap: Buffer,
  handtekening: HybrideDubbeleHandtekening,
  verwachteSleutels?: {
    ed25519PubliekDerB64u: string;
    mlDsa65PubliekSpkiB64u: string;
  },
): { ok: true } | { ok: false; fout: string } {
  if (!handtekening || handtekening.schema !== 1 || handtekening.algoritme !== 'ed25519+ml-dsa-65') {
    return { ok: false, fout: 'HYBRIDE_HANDTEKENING_VORM_ONGELDIG' };
  }
  if (
    verwachteSleutels
    && (handtekening.ed25519PubliekDerB64u !== verwachteSleutels.ed25519PubliekDerB64u
      || handtekening.mlDsa65PubliekSpkiB64u !== verwachteSleutels.mlDsa65PubliekSpkiB64u)
  ) {
    return { ok: false, fout: 'HYBRIDE_SLEUTELPAAR_KOMT_NIET_OVEREEN' };
  }

  const invoer = bouwHybrideTekenInvoer(
    handtekening.ed25519PubliekDerB64u,
    handtekening.mlDsa65PubliekSpkiB64u,
    boodschap,
  );

  try {
    const edPub = createPublicKey({
      key: Buffer.from(handtekening.ed25519PubliekDerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    if (edPub.asymmetricKeyType !== 'ed25519') {
      return { ok: false, fout: 'HYBRIDE_KLASSIEKE_SLEUTEL_GEEN_ED25519' };
    }
    const okEd = verify(null, invoer, edPub, Buffer.from(handtekening.ed25519HandtekeningB64u, 'base64url'));
    if (!okEd) {
      return { ok: false, fout: 'HYBRIDE_KLASSIEKE_HANDTEKENING_ONGELDIG' };
    }
  } catch {
    return { ok: false, fout: 'HYBRIDE_KLASSIEKE_HANDTEKENING_ONGELDIG' };
  }

  try {
    const pqPub = createPublicKey({
      key: Buffer.from(handtekening.mlDsa65PubliekSpkiB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    if (pqPub.asymmetricKeyType !== 'ml-dsa-65') {
      return { ok: false, fout: 'HYBRIDE_POSTKWANTUM_SLEUTEL_GEEN_MLDSA65' };
    }
    const okPq = verify(null, invoer, pqPub, Buffer.from(handtekening.mlDsa65HandtekeningB64u, 'base64url'));
    if (!okPq) {
      return { ok: false, fout: 'HYBRIDE_POSTKWANTUM_HANDTEKENING_ONGELDIG' };
    }
  } catch {
    return { ok: false, fout: 'HYBRIDE_POSTKWANTUM_HANDTEKENING_ONGELDIG' };
  }

  return { ok: true };
}

function bouwHybrideKemTranscriptInfo(opties: {
  contextLabel: string;
  efemeerX25519PubSpkiB64u: string;
  mlKem768CijfertekstB64u: string;
  ontvangerX25519PubSpkiB64u: string;
  ontvangerMlKem768PubSpkiB64u: string;
}): Buffer {
  const transcriptSha256 = createHash('sha256')
    .update(opties.contextLabel)
    .update('|')
    .update(opties.efemeerX25519PubSpkiB64u)
    .update('|')
    .update(opties.mlKem768CijfertekstB64u)
    .update('|')
    .update(opties.ontvangerX25519PubSpkiB64u)
    .update('|')
    .update(opties.ontvangerMlKem768PubSpkiB64u)
    .digest('hex');
  return Buffer.from(`${HYBRIDE_KEM_HKDF_INFO_VOORVOEGSEL}${transcriptSha256}`, 'utf8');
}

/**
 * Гібридна інкапсуляція сеансового або архівного ключа `X25519 + ML-KEM-768` (захист від «збережи зараз — розшифруй пізніше», §13):
 * спільний 32-байтний ключ виводиться через `HKDF-SHA-256` одночасно з `X25519`, `ML-KEM-768` та `SHA-256` повного транскрипту.
 */
export function kapselHybrideX25519MlKem768In(ontvanger: {
  x25519PubliekSpkiB64u: string;
  mlKem768PubliekSpkiB64u: string;
}, contextLabel = 'klimop-archief-en-kanaal'): {
  ingekapseld: HybrideIngekapseldeSleutel;
  gedeeldeSleutel32: Buffer;
} {
  const efemeerX = generateKeyPairSync('x25519');
  const ontvXPub = createPublicKey({
    key: Buffer.from(ontvanger.x25519PubliekSpkiB64u, 'base64url'),
    format: 'der',
    type: 'spki',
  });
  const ontvKemPub = createPublicKey({
    key: Buffer.from(ontvanger.mlKem768PubliekSpkiB64u, 'base64url'),
    format: 'der',
    type: 'spki',
  });

  const xGeheim = diffieHellman({ privateKey: efemeerX.privateKey, publicKey: ontvXPub });
  const kemUit = encapsulate(ontvKemPub);
  const efemeerXPubB64u = (efemeerX.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const kemCtB64u = Buffer.from(kemUit.ciphertext).toString('base64url');

  const ikm = Buffer.concat([xGeheim, Buffer.from(kemUit.sharedKey)]);
  const info = bouwHybrideKemTranscriptInfo({
    contextLabel,
    efemeerX25519PubSpkiB64u: efemeerXPubB64u,
    mlKem768CijfertekstB64u: kemCtB64u,
    ontvangerX25519PubSpkiB64u: ontvanger.x25519PubliekSpkiB64u,
    ontvangerMlKem768PubSpkiB64u: ontvanger.mlKem768PubliekSpkiB64u,
  });
  const afgeleid = Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(32, 0), info, 32));
  xGeheim.fill(0);
  ikm.fill(0);

  return {
    ingekapseld: {
      schema: 1,
      algoritme: 'x25519+ml-kem-768-hkdf-sha256',
      efemeerX25519PubSpkiB64u: efemeerXPubB64u,
      mlKem768CijfertekstB64u: kemCtB64u,
    },
    gedeeldeSleutel32: afgeleid,
  };
}

/** Розкриває гібридну інкапсуляцію `X25519 + ML-KEM-768` та відновлює 32-байтний ключ. */
export function ontkapselHybrideX25519MlKem768(
  ingekapseld: HybrideIngekapseldeSleutel,
  ontvanger: {
    x25519PubliekSpkiB64u: string;
    x25519GeheimPkcs8B64u: string;
    mlKem768PubliekSpkiB64u: string;
    mlKem768GeheimPkcs8B64u: string;
  },
  contextLabel = 'klimop-archief-en-kanaal',
): { ok: true; gedeeldeSleutel32: Buffer } | { ok: false; fout: string } {
  if (!ingekapseld || ingekapseld.schema !== 1 || ingekapseld.algoritme !== 'x25519+ml-kem-768-hkdf-sha256') {
    return { ok: false, fout: 'HYBRIDE_INKAPSELING_ONGELDIG' };
  }
  try {
    const efemeerXPub = createPublicKey({
      key: Buffer.from(ingekapseld.efemeerX25519PubSpkiB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    const xPriv = createPrivateKey({
      key: Buffer.from(ontvanger.x25519GeheimPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    const kemPriv = createPrivateKey({
      key: Buffer.from(ontvanger.mlKem768GeheimPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });

    const xGeheim = diffieHellman({ privateKey: xPriv, publicKey: efemeerXPub });
    const kemGeheim = Buffer.from(decapsulate(kemPriv, Buffer.from(ingekapseld.mlKem768CijfertekstB64u, 'base64url')));
    const ikm = Buffer.concat([xGeheim, kemGeheim]);
    const info = bouwHybrideKemTranscriptInfo({
      contextLabel,
      efemeerX25519PubSpkiB64u: ingekapseld.efemeerX25519PubSpkiB64u,
      mlKem768CijfertekstB64u: ingekapseld.mlKem768CijfertekstB64u,
      ontvangerX25519PubSpkiB64u: ontvanger.x25519PubliekSpkiB64u,
      ontvangerMlKem768PubSpkiB64u: ontvanger.mlKem768PubliekSpkiB64u,
    });
    const afgeleid = Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(32, 0), info, 32));
    xGeheim.fill(0);
    kemGeheim.fill(0);
    ikm.fill(0);

    return { ok: true, gedeeldeSleutel32: afgeleid };
  } catch {
    return { ok: false, fout: 'HYBRIDE_ONTKAPSELING_MISLUKT' };
  }
}

// =================================================================================================
// 2. Зведена модель загроз і залишкових ризиків (Обов'язковий Документ №20 за реєстром Етапу 1 та §44 п. 4, 21)
// =================================================================================================

export interface KlimopDreigingsInvoer {
  dreigingId: string;
  laag:
    | 'netwerk_en_stengels'
    | 'verdeelde_opslag'
    | 'drempelsleutels_en_postkwantum'
    | 'identiteit_en_groepen'
    | 'bestuur_en_uitgaven'
    | 'immuunsysteem_en_uitbreiding'
    | 'externe_verbinders'
    | 'mensbescherming_en_dwang';
  opgelosteSpofs: ReadonlyArray<'SPOF-1' | 'SPOF-2' | 'SPOF-3' | 'SPOF-4' | 'SPOF-5'>;
  aanvalsVectorUk: string;
  technischeTegenmaatregel: string;
  eerlijkRestrisicoUk: string;
  beweertAbsoluteOnkwetsbaarheid: false; // §43 п. 1: заборонено заявляти абсолютну невразливість!
}

export const KLIMOP_DREIGINGS_MODEL: readonly KlimopDreigingsInvoer[] = Object.freeze([
  {
    dreigingId: 'DRG-01',
    laag: 'netwerk_en_stengels',
    opgelosteSpofs: ['SPOF-1', 'SPOF-2'],
    aanvalsVectorUk: 'Перехоплення, повтор кадрів, аналіз довжини пакунків або блокування одного маршруту чи домену',
    technischeTegenmaatregel: 'shared/klimop/stengels.ts + backend/klimop-knooppunt-agent.ts: X25519+Ed25519, ChaCha20-Poly1305, вирівнювання до 256 байт, лічильник повторів і наскрізна естафета без розкриття вмісту',
    eerlijkRestrisicoUk: 'Глобальний спостерігач мережевого потоку все ще може бачити сам факт активності мережевих адрес у разі відсутності незалежних каналів зв’язку користувача.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-02',
    laag: 'verdeelde_opslag',
    opgelosteSpofs: ['SPOF-1', 'SPOF-3'],
    aanvalsVectorUk: 'Викрадення диска вузла зберігання або пошкодження до m зашифрованих смуг об’єкта',
    technischeTegenmaatregel: 'shared/klimop/opslag.ts + shared/klimop/immuunsysteem.ts: клієнтське конвертне шифрування, коди Ріда–Соломона (k+m), сліпа перевірка цілісності HMAC-SHA-256 і добудова без ключа',
    eerlijkRestrisicoUk: 'Одночасна фізична втрата понад m незалежних вузлів до завершення самовідновлення унеможливить відбудову об’єкта без автономної запасної копії.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-03',
    laag: 'drempelsleutels_en_postkwantum',
    opgelosteSpofs: ['SPOF-4'],
    aanvalsVectorUk: 'Повільне викрадення часток секрету в різних епохах або запис шифротекстів для майбутнього квантового розшифрування',
    technischeTegenmaatregel: 'shared/klimop/drempelsleutels.ts + shared/klimop/beveiligingsaudit.ts: перевірюваний поділ Фельдмана/Педерсена, двофазні проактивні епохи, FROST RFC 9591 та гібридні ML-DSA-65 / ML-KEM-768',
    eerlijkRestrisicoUk: 'Одночасна компрометація >= k учасників у межах однієї криптографічної епохи до її планової зміни дозволяє зловмисникам досягти порога.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-04',
    laag: 'identiteit_en_groepen',
    opgelosteSpofs: ['SPOF-1'],
    aanvalsVectorUk: 'Викрадення одного довіреного пристрою або спроба незаконного перехоплення процедури відновлення чи спадкування',
    technischeTegenmaatregel: 'shared/klimop/identiteit.ts: обмежені делеговані права пристроїв без кореневого ключа, кворумне відкликання, MLS RFC 9420 і вікно оскарження 48/168 год',
    eerlijkRestrisicoUk: 'До моменту поширення відкликання викрадений розблокований пристрій може прочитати вже відкриті на ньому розшифровані дані в пам’яті.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-05',
    laag: 'bestuur_en_uitgaven',
    opgelosteSpofs: ['SPOF-4'],
    aanvalsVectorUk: 'Одноосібна зміна правил, підміна серверного пакунка оновлення або непомітна підміна коду вебклієнта оглядача',
    technischeTegenmaatregel: 'shared/klimop/bestuur.ts: 7 категорій повноважень, часові замки 24/48/72 год, порогові рішення FROST, розділення ролей випуску, підпис вебклієнта й автоматичне відкочування Хвилі 1',
    eerlijkRestrisicoUk: 'Шкідливе розширення самого оглядача на скомпрометованому пристрої користувача поза межами підписаного вебклієнта потребує окремого перевіреного застосунку.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-06',
    laag: 'immuunsysteem_en_uitbreiding',
    opgelosteSpofs: ['SPOF-1', 'SPOF-2'],
    aanvalsVectorUk: 'Атака Сивілли десятками дешевих віртуальних машин одного хмарного постачальника або поведінка комп’ютерного хробака',
    technischeTegenmaatregel: 'shared/klimop/hechtranken.ts: заборона самовільного встановлення й прихованих витрат, двосторонні свідоцтва Ed25519 і згортання одного постачальника/підмережі до <= 1 голосу',
    eerlijkRestrisicoUk: 'Складні приховані юридичні зв’язки між формально різними постачальниками потребують періодичної перевірки списку операторів кворуму.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-07',
    laag: 'externe_verbinders',
    opgelosteSpofs: ['SPOF-2', 'SPOF-3'],
    aanvalsVectorUk: 'Компрометація стороннього поштового чи хмарного програмного інтерфейсу або витік облікових даних одного зовнішнього з’єднувача',
    technischeTegenmaatregel: 'shared/klimop/diensten.ts: некорельовані псевдоніми psid1_…, окремі ключі HKDF на кожну з 11 служб, ізольовані секрети з’єднувачів і заборона оманливих заяв',
    eerlijkRestrisicoUk: 'Дані, що вже передані зовнішньому централізованому постачальникові (зокрема звичайний лист зовнішньому адресатові), підпадають під правила того постачальника.',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
  {
    dreigingId: 'DRG-08',
    laag: 'mensbescherming_en_dwang',
    opgelosteSpofs: ['SPOF-5'],
    aanvalsVectorUk: 'Фізичний або психологічний примус до розкриття пароля й негайної зміни ключів або знищення резервів',
    technischeTegenmaatregel: 'shared/klimop/mensbescherming.ts: роздільні сховища без самознищення даних, невідрізнимі 256-байтні сигнали тривоги, оцінка 7 ознак і 72-год кворумний замок зі скасуванням',
    eerlijkRestrisicoUk: 'Жоден криптографічний механізм сам по собі не гарантує фізичної безпеки людини перед озброєним нападником (garandeertFysiekeVeiligheidTegenAanvaller: false).',
    beweertAbsoluteOnkwetsbaarheid: false,
  },
]);

export function valideerDreigingsModelEnRestrisicos(
  model: readonly KlimopDreigingsInvoer[] = KLIMOP_DREIGINGS_MODEL,
): {
  ok: boolean;
  gedekteSpofs: string[];
  aantalDreigingen: number;
  fouten: string[];
} {
  const fouten: string[] = [];
  const spofs = new Set<string>();
  const lagen = new Set<string>();

  for (const d of model) {
    if ((d as { beweertAbsoluteOnkwetsbaarheid: boolean }).beweertAbsoluteOnkwetsbaarheid !== false) {
      fouten.push(`VERBODEN_ONKWETSBAARHEIDSCLAIM:${d.dreigingId}`);
    }
    if (!d.technischeTegenmaatregel || d.technischeTegenmaatregel.trim().length < 20) {
      fouten.push(`ONTBREKENDE_TEGENMAATREGEL:${d.dreigingId}`);
    }
    if (!d.eerlijkRestrisicoUk || d.eerlijkRestrisicoUk.trim().length < 20) {
      fouten.push(`ONTBREKEND_EERLIJK_RESTRISICO:${d.dreigingId}`);
    }
    lagen.add(d.laag);
    for (const s of d.opgelosteSpofs) spofs.add(s);
  }

  for (const verwachtSpof of ['SPOF-1', 'SPOF-2', 'SPOF-3', 'SPOF-4', 'SPOF-5']) {
    if (!spofs.has(verwachtSpof)) fouten.push(`SPOF_NIET_GEDEKT:${verwachtSpof}`);
  }
  if (lagen.size < 8) {
    fouten.push('NIET_ALLE_ACHT_ARCHITECTUURLAGEN_GEDEKT');
  }

  return {
    ok: fouten.length === 0,
    gedekteSpofs: [...spofs].sort(),
    aantalDreigingen: model.length,
    fouten,
  };
}

// =================================================================================================
// 3. Обов'язкові перевірки криптографії (§38), автономності (§40) та вимірюваних гарантій (§41)
// =================================================================================================

export const KLIMOP_CRYPTO_AUDIT_SCENARIOS = Object.freeze([
  'diefstal_enkele_delen_onder_drempel',
  'vervalsing_van_deel_gedetecteerd',
  'stapeling_oude_delen_over_epochen',
  'onderbroken_epoche_verversing_teruggedraaid',
  'knooppunt_imitatie_geweigerd',
  'hergebruik_oud_bericht_geblokkeerd',
  'wijziging_ondertekende_gegevens_geweigerd',
  'poging_drempel_omzeilen_geblokkeerd',
  'nieuwe_sleutel_als_oud_voordoen_geweigerd',
  'verlies_deel_bevoegde_deelnemers_overleefd',
] as const);
export type KlimopCryptoAuditScenarioId = (typeof KLIMOP_CRYPTO_AUDIT_SCENARIOS)[number];

export interface CryptoAuditScenarioMeting {
  scenarioId: KlimopCryptoAuditScenarioId;
  aanvalAfgeslagenOfOverleefd: boolean;
  gebruikteStandaardPrimitief: string;
  eigenOngetesteCryptografieGebruikt: boolean;
  bewijsSamenvatting: string;
}

export function beoordeelCryptografischeAudit38(
  metingen: readonly CryptoAuditScenarioMeting[],
): { geslaagd: boolean; gedekteScenarios: number; fouten: string[] } {
  const fouten: string[] = [];
  const gezien = new Set<KlimopCryptoAuditScenarioId>();

  for (const m of metingen) {
    gezien.add(m.scenarioId);
    if (m.eigenOngetesteCryptografieGebruikt) {
      fouten.push(`EIGEN_ONGETESTE_CRYPTO_VERBODEN:${m.scenarioId}`);
    }
    if (!m.aanvalAfgeslagenOfOverleefd || !m.gebruikteStandaardPrimitief.trim() || !m.bewijsSamenvatting.trim()) {
      fouten.push(`CRYPTO_SCENARIO_MISLUKT:${m.scenarioId}`);
    }
  }
  for (const vereist of KLIMOP_CRYPTO_AUDIT_SCENARIOS) {
    if (!gezien.has(vereist)) fouten.push(`ONTBREKEND_CRYPTO_SCENARIO_38:${vereist}`);
  }

  return {
    geslaagd: fouten.length === 0,
    gedekteScenarios: gezien.size,
    fouten,
  };
}

export const KLIMOP_AUTONOMIE_SCENARIOS = Object.freeze([
  'hoofdserver_uitgeschakeld',
  'oorspronkelijke_auteur_onbeschikbaar',
  'een_beheerder_gecompromitteerd',
  'een_dienst_of_verbinder_onbeschikbaar',
  'een_uitgavekanaal_overgenomen',
  'gemengde_softwareversies_op_knooppunten',
] as const);
export type KlimopAutonomieScenarioId = (typeof KLIMOP_AUTONOMIE_SCENARIOS)[number];

export interface AutonomieAuditScenarioMeting {
  scenarioId: KlimopAutonomieScenarioId;
  praktischBeproefd: boolean; // §40 абз. 2: підтверджувати практичними випробуваннями, а не просто кількістю вузлів!
  kernFunctiesBehouden: boolean;
  geenEnkelePartijKreegAlleenheerschappij: boolean;
  bewijsSamenvatting: string;
}

export function beoordeelAutonomieAudit40(
  metingen: readonly AutonomieAuditScenarioMeting[],
): { geslaagd: boolean; gedekteScenarios: number; fouten: string[] } {
  const fouten: string[] = [];
  const gezien = new Set<KlimopAutonomieScenarioId>();

  for (const m of metingen) {
    gezien.add(m.scenarioId);
    if (
      !m.praktischBeproefd
      || !m.kernFunctiesBehouden
      || !m.geenEnkelePartijKreegAlleenheerschappij
      || !m.bewijsSamenvatting.trim()
    ) {
      fouten.push(`AUTONOMIE_SCENARIO_MISLUKT:${m.scenarioId}`);
    }
  }
  for (const vereist of KLIMOP_AUTONOMIE_SCENARIOS) {
    if (!gezien.has(vereist)) fouten.push(`ONTBREKEND_AUTONOMIE_SCENARIO_40:${vereist}`);
  }

  return {
    geslaagd: fouten.length === 0,
    gedekteScenarios: gezien.size,
    fouten,
  };
}

export const KLIMOP_MEETBARE_GARANTIES_IDS = Object.freeze([
  'max_hersteltijd_ms',
  'max_verlies_laatste_wijzigingen_bytes',
  'min_onafhankelijke_beschikbare_kopieen',
  'compromitteringsdrempel_kritieke_operatie',
  'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct',
  'max_belasting_gebruikersapparaat_cpu_pct',
  'max_intrekkingstijd_rechten_ms',
  'detectietijd_gevaarlijke_uitgave_ms',
  'stoptijd_gevaarlijke_uitgave_ms',
  'hersteltijd_na_sleutelverlies_uren',
  'controlefrequentie_reservekopieen_uren',
  'toelaatbare_afwijking_netwerksplitsing_stappen',
] as const);
export type KlimopMeetbareGarantieId = (typeof KLIMOP_MEETBARE_GARANTIES_IDS)[number];

export interface MeetbareGarantieInvoer {
  garantieId: KlimopMeetbareGarantieId;
  grensWaarde: number;
  feitelijkGemetenWaarde: number;
  richting: 'hoogstens' | 'minstens';
  meetMethode: string;
  beproefdInScenario: boolean; // §41 абз. 5: заборонено встановлювати довільні числа без фактичного випробування!
}

export function beoordeelMeetbareGaranties41(
  garanties: readonly MeetbareGarantieInvoer[],
): { geslaagd: boolean; gedekteGaranties: number; fouten: string[] } {
  const fouten: string[] = [];
  const gezien = new Set<KlimopMeetbareGarantieId>();

  for (const g of garanties) {
    gezien.add(g.garantieId);
    if (!g.beproefdInScenario || !g.meetMethode.trim()) {
      fouten.push(`ONBEPROEFDE_WILLEKEURIGE_GARANTIE_VERBODEN:${g.garantieId}`);
      continue;
    }
    const binnenGrens =
      g.richting === 'hoogstens'
        ? g.feitelijkGemetenWaarde <= g.grensWaarde
        : g.feitelijkGemetenWaarde >= g.grensWaarde;
    if (!binnenGrens) {
      fouten.push(`GARANTIE_OVERSCHREDEN:${g.garantieId}:${g.feitelijkGemetenWaarde}/${g.grensWaarde}`);
    }
  }

  for (const vereist of KLIMOP_MEETBARE_GARANTIES_IDS) {
    if (!gezien.has(vereist)) fouten.push(`ONTBREKENDE_GARANTIE_41:${vereist}`);
  }

  return {
    geslaagd: fouten.length === 0,
    gedekteGaranties: gezien.size,
    fouten,
  };
}

// =================================================================================================
// 4. Гібридно підписаний підсумковий звіт аудиту Етапу 11 та допуск до Етапу 12 («Насіння»)
// =================================================================================================

export interface KlimopOnafhankelijkAuditRapport {
  schema: 1;
  auditId: string;
  opgesteldOp: string;
  auditorKnooppuntId: string;
  hybrideCryptografieBewezen: boolean;
  dreigingsModelGeldig: boolean;
  overlevingScenarios37Gedekt: number;   // вимагається 10
  cryptoScenarios38Gedekt: number;       // вимагається 10
  mensbeschermingScenarios39Gedekt: number; // вимагається 8
  autonomieScenarios40Gedekt: number;    // вимагається 6
  meetbareGaranties41Gedekt: number;     // вимагається 12
  architectuurVragen15Goedgekeurd: boolean;
  openstaandeKritiekeZwaktes: readonly string[];
  vrijgegevenVoorEtappe12: boolean;
  hybrideHandtekening: HybrideDubbeleHandtekening;
}

/**
 * Складає та підписує гібридним постквантовим підписом `Ed25519 + ML-DSA-65` підсумковий звіт Етапу 11.
 * Згідно з таблицею випусків Етапу 1, будь-яка відкрита слабкість або непройдений сценарій блокує перехід до Етапу 12!
 */
export function stelOnafhankelijkAuditRapportSamen(opties: {
  auditor: HybridePostkwantumSleutelbundel;
  hybrideCryptografieBewezen: boolean;
  dreigingsModel?: readonly KlimopDreigingsInvoer[];
  overleving37GeslaagdEnAantal: { geslaagd: boolean; aantal: number };
  cryptoAudit38: readonly CryptoAuditScenarioMeting[];
  mensbescherming39GeslaagdEnAantal: { geslaagd: boolean; aantal: number };
  autonomieAudit40: readonly AutonomieAuditScenarioMeting[];
  meetbareGaranties41: readonly MeetbareGarantieInvoer[];
  antwoorden15: Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  aanwezigeVerbodenVereenvoudigingen?: readonly KlimopVerbodenVereenvoudigingId[];
  openstaandeKritiekeZwaktes?: readonly string[];
  nuIso?: string;
}): { rapport: KlimopOnafhankelijkAuditRapport; fouten: string[] } {
  const dreig = valideerDreigingsModelEnRestrisicos(opties.dreigingsModel ?? KLIMOP_DREIGINGS_MODEL);
  const c38 = beoordeelCryptografischeAudit38(opties.cryptoAudit38);
  const a40 = beoordeelAutonomieAudit40(opties.autonomieAudit40);
  const m41 = beoordeelMeetbareGaranties41(opties.meetbareGaranties41);
  const arch = beoordeelKlimopWijziging({
    naam: 'KLIMOP-012 Етап 11: незалежний аудит безпеки, модель загроз і гібридна постквантова готовність',
    fase: 11,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: opties.antwoorden15,
    aanwezigeVerbodenVereenvoudigingen: opties.aanwezigeVerbodenVereenvoudigingen ?? [],
  });

  const zwaktes = [...(opties.openstaandeKritiekeZwaktes ?? [])];
  const fouten = [
    ...dreig.fouten,
    ...c38.fouten,
    ...a40.fouten,
    ...m41.fouten,
    ...arch.fouten,
    ...zwaktes.map((z) => `OPENSTAANDE_ZWAKTE:${z}`),
  ];

  if (!opties.hybrideCryptografieBewezen) {
    fouten.push('HYBRIDE_POSTKWANTUM_CRYPTO_NIET_BEWEZEN');
  }
  if (!opties.overleving37GeslaagdEnAantal.geslaagd || opties.overleving37GeslaagdEnAantal.aantal < 10) {
    fouten.push('OVERLEVINGSPROGRAMMA_37_ONVOLLEDIG');
  }
  if (!opties.mensbescherming39GeslaagdEnAantal.geslaagd || opties.mensbescherming39GeslaagdEnAantal.aantal < 8) {
    fouten.push('MENSBESCHERMINGSPROGRAMMA_39_ONVOLLEDIG');
  }

  const vrijgegevenVoorEtappe12 = fouten.length === 0;
  const kern = {
    schema: 1 as const,
    auditId: `aud11_${randomBytes(10).toString('hex')}`,
    opgesteldOp: opties.nuIso ?? new Date().toISOString(),
    auditorKnooppuntId: opties.auditor.identiteit.knooppuntId,
    hybrideCryptografieBewezen: opties.hybrideCryptografieBewezen,
    dreigingsModelGeldig: dreig.ok,
    overlevingScenarios37Gedekt: opties.overleving37GeslaagdEnAantal.aantal,
    cryptoScenarios38Gedekt: c38.gedekteScenarios,
    mensbeschermingScenarios39Gedekt: opties.mensbescherming39GeslaagdEnAantal.aantal,
    autonomieScenarios40Gedekt: a40.gedekteScenarios,
    meetbareGaranties41Gedekt: m41.gedekteGaranties,
    architectuurVragen15Goedgekeurd: arch.goedgekeurd,
    openstaandeKritiekeZwaktes: zwaktes,
    vrijgegevenVoorEtappe12,
  };

  const boodschap = Buffer.from(AUDIT_RAPPORT_DOMEIN + canoniekeJson(kern), 'utf8');
  const hybrideHandtekening = ondertekenHybrideEd25519MlDsa65(boodschap, {
    ed25519PubliekDerB64u: opties.auditor.identiteit.publiekeSleutelDerB64u,
    ed25519GeheimPkcs8B64u: opties.auditor.ed25519GeheimPkcs8B64u,
    mlDsa65PubliekSpkiB64u: opties.auditor.mlDsa65PubliekSpkiB64u,
    mlDsa65GeheimPkcs8B64u: opties.auditor.mlDsa65GeheimPkcs8B64u,
  });

  return {
    rapport: {
      ...kern,
      hybrideHandtekening,
    },
    fouten,
  };
}

/** Перевіряє гібридний постквантовий підпис, прив'язку ідентифікатора аудитора та повноту звіту Етапу 11. */
export function verifieerOnafhankelijkAuditRapport(opties: {
  rapport: KlimopOnafhankelijkAuditRapport;
  erkendeAuditorSleutels: ReadonlyArray<{
    auditorKnooppuntId: string;
    ed25519PubliekDerB64u: string;
    mlDsa65PubliekSpkiB64u: string;
  }>;
}): { ok: true } | { ok: false; fout: string } {
  const { rapport } = opties;
  if (!rapport || rapport.schema !== 1) {
    return { ok: false, fout: 'AUDITRAPPORT_ONGELDIG' };
  }
  const erkend = opties.erkendeAuditorSleutels.find(
    (a) => a.auditorKnooppuntId === rapport.auditorKnooppuntId,
  );
  if (!erkend) {
    return { ok: false, fout: 'ONBEKENDE_AUDITOR_IDENTITEIT' };
  }
  if (berekenKnooppuntId(erkend.ed25519PubliekDerB64u) !== rapport.auditorKnooppuntId) {
    return { ok: false, fout: 'AUDITOR_SLEUTEL_ID_KOMT_NIET_OVEREEN' };
  }

  const { hybrideHandtekening, ...kern } = rapport;
  const boodschap = Buffer.from(AUDIT_RAPPORT_DOMEIN + canoniekeJson(kern), 'utf8');
  const vSig = verifieerHybrideEd25519MlDsa65(boodschap, hybrideHandtekening, {
    ed25519PubliekDerB64u: erkend.ed25519PubliekDerB64u,
    mlDsa65PubliekSpkiB64u: erkend.mlDsa65PubliekSpkiB64u,
  });
  if (!vSig.ok) return vSig;

  if (
    rapport.vrijgegevenVoorEtappe12
    && (rapport.openstaandeKritiekeZwaktes.length > 0
      || !rapport.hybrideCryptografieBewezen
      || !rapport.dreigingsModelGeldig
      || rapport.overlevingScenarios37Gedekt < 10
      || rapport.cryptoScenarios38Gedekt < 10
      || rapport.mensbeschermingScenarios39Gedekt < 8
      || rapport.autonomieScenarios40Gedekt < 6
      || rapport.meetbareGaranties41Gedekt < 12
      || !rapport.architectuurVragen15Goedgekeurd)
  ) {
    return { ok: false, fout: 'ONTERECHTE_VRIJGAVE_VOOR_ETAPPE_12' };
  }

  return { ok: true };
}
