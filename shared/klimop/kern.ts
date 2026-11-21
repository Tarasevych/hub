// KLIMOP-002 (20.11.2026, Етап 1 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Ізольоване, самодостатнє програмне ядро цільової екосистеми «Плющ» без підключення до живого бойового сервера чи PostgreSQL.
// Закріплює в коді:
//   1. Сім структурних елементів цифрового плюща (§1), чотири типи вузлів (§4), сім функціональних ролей та шість рівнів зберігання (§11).
//   2. Відокремлення трьох площин повноважень (§2): власник особистих даних ≠ оператор вузла ≠ зміна спільних правил мережі,
//      із жорсткою забороною одноосібної необмеженої влади («geen alleenheerschappij»).
//   3. Криптографічно перевірювані посвідчення вузлів і підписані мандати повноважень на стандартизованому Ed25519 (RFC 8032)
//      із терміном дії, перевіркою відкликання та підготовкою до гібридного постквантового розширення (Ed25519 + ML-DSA-65).
//   4. Правило захисту людини під час примусу (§17): перехід у безпечний обмежений режим із затримкою чутливих дій,
//      але категорична заборона автоматичного безповоротного знищення особистих даних за підозрою.
//   5. Програмний перевіряльник 15 питань архітектурної перевірки (§42) та 14 заборонених спрощень (§43).

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export const KLIMOP_STRUCTUUR_ELEMENTEN = Object.freeze([
  'wortels',        // 1.1 Коріння — незалежні основи довіри
  'stengels',       // 1.2 Стебла — взаємно автентифіковані зашифровані зв'язки
  'bladeren',       // 1.3 Листя — функціональні складники
  'hechtranken',    // 1.4 Вусики — кероване добровільне розширення
  'voeding',        // 1.5 Живлення — справедливий і прозорий обмін ресурсами
  'immuunsysteem',  // 1.6 Імунна система — безпека, карантин і самовідновлення
  'zaden',          // 1.7 Насіння — переносність і відтворення без єдиного творця
] as const);
export type KlimopStructuurElement = (typeof KLIMOP_STRUCTUUR_ELEMENTEN)[number];

export const KLIMOP_KNOOPPUNT_TYPEN = Object.freeze([
  'vaste_onafhankelijke_knooppunten',      // Постійні незалежні вузли у різних юрисдикціях і операторів
  'persoonlijke_gebruikersapparaten',      // Особисті пристрої людини (ноутбук, телефон, домашній сервер, носій відновлення)
  'gespecialiseerde_knooppunten',          // Спеціалізовані вузли (зашифровані архіви, поштовий шлюз, ШІ-обчислення, аудит)
  'tijdelijke_toetredingsknooppunten',     // Тимчасові вузли приєднання без доступу до закритих даних
] as const);
export type KlimopKnooppuntType = (typeof KLIMOP_KNOOPPUNT_TYPEN)[number];

export const KLIMOP_BLAD_ROLLEN = Object.freeze([
  'opslag',         // Зберігання зашифрованих блоків і часток
  'rekenkracht',    // Обчислення та локальні ШІ-завдання
  'verbinding',     // Маршрутизація зашифрованих потоків
  'synchronisatie', // Узгодження журналів подій і станів без конфліктів
  'verificatie',    // Незалежна перевірка підписів, кворумів і цілісності
  'herstel',        // Збирання дозволених часток для законного відновлення
  'brug',           // Ізольований з'єднувач із зовнішньою службою
] as const);
export type KlimopBladRol = (typeof KLIMOP_BLAD_ROLLEN)[number];

/** Шість рівнів зберігання даних за §11 Головного архітектурного маніфесту «Плющ». */
export const KLIMOP_OPSLAG_LAGEN = Object.freeze([
  'persoonlijke_geheime_gegevens', // 1. Особисті таємні дані (ключі, довірені контакти, особисті записи, налаштування відновлення)
  'werkgegevens_van_diensten',     // 2. Робочі дані служб (пошта, календар, завдання, нотатки, налаштування застосунків)
  'grote_versleutelde_objecten',   // 3. Великі файли та архіви (документи, знімки, медіа, резервні пакунки з кодами відновлення)
  'gedeelde_systeemtoestanden',    // 4. Спільні системні стани (списки вузлів, дозволи, політики, журнали перевірок, версії)
  'tijdelijke_uitwisselingsdata',  // 5. Тимчасові обмінні дані (черги повідомлень, короткочасні сеанси, одноразові підтвердження)
  'onveranderlijk_herstelzaad',    // 6. Незмінні архіви «Насіння» для повного відтворення екосистеми
] as const);
export type KlimopOpslagLaag = (typeof KLIMOP_OPSLAG_LAGEN)[number];

/** Три суворо відокремлені площини повноважень за §2 маніфесту: жоден суб'єкт не поєднує необмежену владу над усіма трьома. */
export const KLIMOP_MACHT_DOMEINEN = Object.freeze([
  'persoonlijke_gegevens', // Виключне право власника особистих даних (шифрування, читання, поділ, відкликання доступу)
  'knooppunt_beheer',      // Повноваження оператора конкретного вузла (ресурси, запуск служб вузла — БЕЗ читання чужих даних)
  'netwerk_regels',        // Багатостороннє порогове керування спільними правилами та випусками екосистеми
] as const);
export type KlimopMachtDomein = (typeof KLIMOP_MACHT_DOMEINEN)[number];

export const KLIMOP_CONTROLE_VRAGEN_IDS = Object.freeze([
  'geen_nieuw_spof',                  // 1. Чи виникає нова єдина точка відмови?
  'geen_verborgen_bevoegdheden',      // 2. Чи не розширюються приховані повноваження?
  'wettig_herstel_beschikbaar',       // 3. Чи залишається доступним законне відновлення?
  'beschermd_op_apparaat_lijn_opslag', // 4. Чи захищено інформацію на пристрої, під час передавання й у сховищі?
  'geen_onnodige_metadata',           // 5. Чи не розкриваються непотрібні метадані?
  'toestemmingen_intrekbaar',         // 6. Чи можна відкликати створені дозволи?
  'knooppunten_compatibel',           // 7. Чи не порушується сумісність між вузлами?
  'isolatie_defect_onderdeel',        // 8. Чи зберігається можливість ізолювати несправний складник?
  'bescherming_mens_behouden',        // 9. Чи не погіршується захист людини (втрата, хвороба, примус)?
  'wijziging_verifieerbaar',          // 10. Чи залишається зміна перевірюваною?
  'veilig_terugdraaien_mogelijk',     // 11. Чи є спосіб безпечного повернення попереднього стану?
  'geen_grotere_afhankelijkheid_auteur', // 12. Чи не збільшується залежність від початкового автора?
  'geen_middelenverbruik_zonder_toestemming', // 13. Чи не витрачаються ресурси користувачів без їхньої згоди?
  'rechten_gegevenseigenaar_intact',  // 14. Чи не порушуються права власників особистих даних?
  'geen_netwerkrisico_door_een_verbinder', // 15. Чи не створюється нова небезпека для всієї мережі через один з'єднувач?
] as const);
export type KlimopControleVraagId = (typeof KLIMOP_CONTROLE_VRAGEN_IDS)[number];

export const KLIMOP_VERBODEN_VEREENVOUDIGINGEN_IDS = Object.freeze([
  'onkwetsbaarheid_claimen',                 // 1
  'kopieen_op_een_server_als_onafhankelijk', // 2
  'shamir_verwarren_met_grote_bestanden',    // 3
  'serverversleuteling_als_nulkennis',       // 4
  'drempelhandtekening_als_versleuteling',   // 5
  'vertrouwen_op_netwerknabijheid',          // 6
  'kritieke_macht_aan_toevallige_meerderheid', // 7
  'hardware_isolatie_als_absoluut',          // 8
  'automatisch_herstel_of_vernietiging',     // 9
  'verborgen_gebruik_gebruikersapparaten',   // 10
  'productie_uitschakelen_voor_vervanging',  // 11
  'eigen_ongeteste_cryptografie',            // 12
  'tests_geslaagd_zonder_bewijs',            // 13
  'kritieke_uitrol_zonder_goedkeuring',      // 14
] as const);
export type KlimopVerbodenVereenvoudigingId = (typeof KLIMOP_VERBODEN_VEREENVOUDIGINGEN_IDS)[number];

export interface KlimopKnooppuntIdentiteit {
  schema: 1;
  knooppuntId: string;           // Детермінований відбиток SHA-256 публічного ключа (префікс klm1_)
  type: KlimopKnooppuntType;
  rollen: readonly KlimopBladRol[];
  juridischeRegio: string;       // ISO-код країни або 'OFFLINE' для перевірки незалежності юрисдикцій
  aanbieder: string;             // Постачальник обладнання / зв'язку (для уникнення прихованої централізації)
  algoritme: 'ed25519' | 'ed25519+ml-dsa-65-voorbereid';
  publiekeSleutelDerB64u: string; // SPKI DER у base64url
  postkwantumPubliekeSleutelB64u: string | null;
  aangemaaktOp: string;
}

export interface KlimopMandaatInhoud {
  schema: 1;
  mandaatId: string;
  uitgeverKnooppuntId: string;
  ontvangerKnooppuntId: string;
  machtDomein: KlimopMachtDomein;
  toegestaneRollen: readonly KlimopBladRol[];
  toegestaneOpslagLagen: readonly KlimopOpslagLaag[];
  alleenMetDrempelQuorum: boolean; // Критичні дії в netwerk_regels вимагають порогової згоди (не 1 підпису)
  drempelVereist: { k: number; n: number } | null;
  uitgegevenOp: string;
  verlooptOp: string;
  /**
   * KLIMOP-020: точний перелік дій, які відкриває мандат (наприклад `dkg_maak_bijdrage`, `bewaar_blok`).
   * Вузол у суворому режимі (довірений реєстр видавців) відхиляє мандат без цього переліку.
   */
  toegestaneActies?: readonly string[];
  /** KLIMOP-020: перелік об'єктів (набір ключів, блок, служба), до яких застосовне право. */
  objectIds?: readonly string[];
  /**
   * KLIMOP-020: вузли, яким дозволено подавати цей мандат у сеансі. Без переліку подавати може лише
   * видавець (а для порогового мандата — один із чинних підписантів).
   */
  gemachtigdeAfzenders?: readonly string[];
}

export interface KlimopOndertekendMandaat {
  inhoud: KlimopMandaatInhoud;
  handtekeningen: ReadonlyArray<{
    ondertekenaarKnooppuntId: string;
    publiekeSleutelDerB64u: string;
    handtekeningB64u: string;
  }>;
}

/** Канонічна серіалізація JSON із лексикографічним порядком ключів для однозначного підписування. */
export function canoniekeJson(waarde: unknown): string {
  if (waarde === null || typeof waarde !== 'object') return JSON.stringify(waarde);
  if (Array.isArray(waarde)) return `[${waarde.map((el) => canoniekeJson(el)).join(',')}]`;
  const obj = waarde as Record<string, unknown>;
  // KLIMOP-020: ключі зі значенням undefined пропускаються так само, як їх губить JSON.stringify під час
  // передавання мережею; інакше підпис, створений до передавання, не збігався б після нього.
  const sleutels = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${sleutels.map((k) => `${JSON.stringify(k)}:${canoniekeJson(obj[k])}`).join(',')}}`;
}

/** Обчислює незмінний ідентифікатор вузла `klm1_<32 hex>` за SPKI-ключем Ed25519. */
export function berekenKnooppuntId(publiekeSleutelDerB64u: string): string {
  const der = Buffer.from(publiekeSleutelDerB64u, 'base64url');
  const digest = createHash('sha256').update('klimop-knooppunt-v1:').update(der).digest('hex');
  return `klm1_${digest.slice(0, 32)}`;
}

/** Генерує нову криптографічну пару Ed25519 і паспорт вузла «Плюща» (лише стандартний RFC 8032 через node:crypto). */
export function maakKlimopKnooppunt(opties: {
  type: KlimopKnooppuntType;
  rollen: readonly KlimopBladRol[];
  juridischeRegio: string;
  aanbieder: string;
  nuIso?: string;
}): { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string } {
  if (!KLIMOP_KNOOPPUNT_TYPEN.includes(opties.type)) throw new Error('KLIMOP_ONGELDIG_KNOOPPUNT_TYPE');
  if (!opties.rollen.length || opties.rollen.some((r) => !KLIMOP_BLAD_ROLLEN.includes(r))) {
    throw new Error('KLIMOP_ONGELDIGE_BLAD_ROL');
  }
  // Тимчасовий вузол приєднання за §4.4 не має права тримати ролі відновлення чи зберігання особистих секретів
  if (opties.type === 'tijdelijke_toetredingsknooppunten' && opties.rollen.includes('herstel')) {
    throw new Error('KLIMOP_TIJDELIJK_KNOOPPUNT_MAG_GEEN_HERSTEL');
  }
  const regio = String(opties.juridischeRegio || '').trim().toUpperCase();
  const aanbieder = String(opties.aanbieder || '').trim().toLowerCase();
  if (regio.length < 2 || !aanbieder) throw new Error('KLIMOP_REGIO_OF_AANBIEDER_ONTBREEKT');

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubDer = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const privDer = (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url');

  return {
    identiteit: {
      schema: 1,
      knooppuntId: berekenKnooppuntId(pubDer),
      type: opties.type,
      rollen: [...new Set(opties.rollen)],
      juridischeRegio: regio,
      aanbieder,
      algoritme: 'ed25519',
      publiekeSleutelDerB64u: pubDer,
      postkwantumPubliekeSleutelB64u: null,
      aangemaaktOp: opties.nuIso ?? new Date().toISOString(),
    },
    geheimeSleutelPkcs8B64u: privDer,
  };
}

const MANDAAT_DOMEIN_PREFIX = 'klimop-mandaat-v1|';

/** Підписує мандат повноважень закритим ключем Ed25519 вузла-підписанта. */
export function ondertekenKlimopMandaat(
  inhoud: KlimopMandaatInhoud,
  ondertekenaar: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
  bestaandeHandtekeningen: KlimopOndertekendMandaat['handtekeningen'] = [],
): KlimopOndertekendMandaat {
  const boodschap = Buffer.from(MANDAAT_DOMEIN_PREFIX + canoniekeJson(inhoud), 'utf8');
  const priv = createPrivateKey({
    key: Buffer.from(ondertekenaar.geheimeSleutelPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = sign(null, boodschap, priv).toString('base64url');
  const gefilterd = bestaandeHandtekeningen.filter(
    (h) => h.ondertekenaarKnooppuntId !== ondertekenaar.identiteit.knooppuntId,
  );
  return {
    inhoud,
    handtekeningen: [
      ...gefilterd,
      {
        ondertekenaarKnooppuntId: ondertekenaar.identiteit.knooppuntId,
        publiekeSleutelDerB64u: ondertekenaar.identiteit.publiekeSleutelDerB64u,
        handtekeningB64u: sig,
      },
    ],
  };
}

/**
 * Перевіряє підписаний мандат повноважень за правилами §2 та §16 маніфесту «Плющ»:
 * - дійсність криптографічних підписів Ed25519 і відповідність knooppuntId публічному ключу;
 * - відсутність у списку відкликаних мандатів або відкликаних вузлів;
 * - чинний часовий проміжок дії (мандати без терміну дії або прострочені відхиляються);
 * - заборона одноосібної влади: у площині `netwerk_regels` обов'язковий пороговий кворум `k >= 2` з `k` різними підписантами,
 *   а площина `knooppunt_beheer` ніколи не надає доступу до `persoonlijke_geheime_gegevens` без мандата власника даних!
 * KLIMOP-020 (вада зі звіту AUDIT-002: «мандат не встановлює, хто має право видати дозвіл на конкретний об'єкт або дію»):
 * - `vertrouwdeUitgevers` — довірений реєстр вузла: видавець і всі зараховані підписанти мають бути в ньому;
 * - `actie` / `objectId` — право перевіряється для конкретної дії та об'єкта (`vereisActieBereik` вимагає явного переліку);
 * - `sessieAfzenderKnooppuntId` — мандат подає лише видавець, чинний підписант або вузол із `gemachtigdeAfzenders`.
 */
export function verifieerKlimopMandaat(
  mandaat: KlimopOndertekendMandaat,
  context: {
    nuIso?: string;
    ingetrokkenMandaatIds?: ReadonlySet<string>;
    ingetrokkenKnooppuntIds?: ReadonlySet<string>;
    vertrouwdeUitgevers?: ReadonlySet<string>;
    actie?: string;
    objectId?: string;
    vereisActieBereik?: boolean;
    sessieAfzenderKnooppuntId?: string;
  } = {},
): { ok: boolean; fouten: string[] } {
  const fouten: string[] = [];
  const { inhoud, handtekeningen } = mandaat ?? ({} as KlimopOndertekendMandaat);

  if (!inhoud || inhoud.schema !== 1 || !inhoud.mandaatId) {
    return { ok: false, fouten: ['MANDAAT_ONGELDIGE_VORM'] };
  }
  if (!KLIMOP_MACHT_DOMEINEN.includes(inhoud.machtDomein)) fouten.push('MANDAAT_ONGELDIG_MACHT_DOMEIN');

  if (context.ingetrokkenMandaatIds?.has(inhoud.mandaatId)) fouten.push('MANDAAT_INGETROKKEN');
  if (
    context.ingetrokkenKnooppuntIds?.has(inhoud.uitgeverKnooppuntId)
    || context.ingetrokkenKnooppuntIds?.has(inhoud.ontvangerKnooppuntId)
  ) {
    fouten.push('KNOOPPUNT_INGETROKKEN');
  }

  const nu = Date.parse(context.nuIso ?? new Date().toISOString());
  const van = Date.parse(inhoud.uitgegevenOp);
  const tot = Date.parse(inhoud.verlooptOp);
  if (!Number.isFinite(van) || !Number.isFinite(tot) || tot <= van) {
    fouten.push('MANDAAT_TIJDSVENSTER_ONGELDIG');
  } else if (nu < van || nu >= tot) {
    fouten.push('MANDAAT_VERLOPEN_OF_NOG_NIET_GELDIG');
  }

  // Відокремлення повноважень (§2): оператор вузла не може видати собі доступ до особистих таємних даних людини
  if (
    inhoud.machtDomein === 'knooppunt_beheer'
    && inhoud.toegestaneOpslagLagen.includes('persoonlijke_geheime_gegevens')
  ) {
    fouten.push('SCHEIDING_VAN_MACHTEN_GESCHONDEN_PERSOONLIJKE_GEGEVENS');
  }

  // Заборона одноосібної влади над спільними правилами мережі (§2, §18)
  if (inhoud.machtDomein === 'netwerk_regels') {
    if (
      !inhoud.alleenMetDrempelQuorum
      || !inhoud.drempelVereist
      || inhoud.drempelVereist.k < 2
      || inhoud.drempelVereist.n < inhoud.drempelVereist.k
    ) {
      fouten.push('GEEN_ALLEENHEERSCHAPPIJ_DREMPEL_VEREIST');
    }
  }

  if (!Array.isArray(handtekeningen) || handtekeningen.length === 0) {
    fouten.push('MANDAAT_ZONDER_HANDTEKENING');
  } else {
    const boodschap = Buffer.from(MANDAAT_DOMEIN_PREFIX + canoniekeJson(inhoud), 'utf8');
    const geldigeOndertekenaars = new Set<string>();

    for (const h of handtekeningen) {
      if (context.ingetrokkenKnooppuntIds?.has(h.ondertekenaarKnooppuntId)) {
        fouten.push(`ONDERTEKENAAR_INGETROKKEN:${h.ondertekenaarKnooppuntId}`);
        continue;
      }
      // KLIMOP-020: підпис вузла поза довіреним реєстром не зараховується до кворуму
      if (context.vertrouwdeUitgevers && !context.vertrouwdeUitgevers.has(h.ondertekenaarKnooppuntId)) {
        fouten.push(`ONDERTEKENAAR_NIET_VERTROUWD:${h.ondertekenaarKnooppuntId}`);
        continue;
      }
      const verwachtId = berekenKnooppuntId(h.publiekeSleutelDerB64u);
      if (verwachtId !== h.ondertekenaarKnooppuntId) {
        fouten.push(`SLEUTEL_ID_KOMT_NIET_OVEREEN:${h.ondertekenaarKnooppuntId}`);
        continue;
      }
      try {
        const pub = createPublicKey({
          key: Buffer.from(h.publiekeSleutelDerB64u, 'base64url'),
          format: 'der',
          type: 'spki',
        });
        const ok = verify(null, boodschap, pub, Buffer.from(h.handtekeningB64u, 'base64url'));
        if (!ok) fouten.push(`HANDTEKENING_ONGELDIG:${h.ondertekenaarKnooppuntId}`);
        else geldigeOndertekenaars.add(h.ondertekenaarKnooppuntId);
      } catch {
        fouten.push(`HANDTEKENING_FOUT:${h.ondertekenaarKnooppuntId}`);
      }
    }

    if (inhoud.alleenMetDrempelQuorum && inhoud.drempelVereist) {
      if (geldigeOndertekenaars.size < inhoud.drempelVereist.k) {
        fouten.push(`DREMPEL_QUORUM_NIET_GEHAALD:${geldigeOndertekenaars.size}/${inhoud.drempelVereist.k}`);
      }
    } else if (!geldigeOndertekenaars.has(inhoud.uitgeverKnooppuntId)) {
      fouten.push('UITGEVER_HEEFT_NIET_ONDERTEKEND');
    }

    // KLIMOP-020: мандат подає лише видавець, чинний підписант або явно вповноважений відправник
    if (context.sessieAfzenderKnooppuntId !== undefined) {
      const afzender = context.sessieAfzenderKnooppuntId;
      const gemachtigd = afzender === inhoud.uitgeverKnooppuntId
        || geldigeOndertekenaars.has(afzender)
        || (Array.isArray(inhoud.gemachtigdeAfzenders) && inhoud.gemachtigdeAfzenders.includes(afzender));
      if (!gemachtigd) fouten.push('MANDAAT_AFZENDER_NIET_GEMACHTIGD');
    }
  }

  // KLIMOP-020: видавець має бути в довіреному реєстрі вузла
  if (context.vertrouwdeUitgevers && !context.vertrouwdeUitgevers.has(inhoud.uitgeverKnooppuntId)) {
    fouten.push('UITGEVER_NIET_VERTROUWD');
  }

  // KLIMOP-020: право перевіряється для конкретної дії
  if (context.actie !== undefined) {
    if (Array.isArray(inhoud.toegestaneActies)) {
      if (!inhoud.toegestaneActies.includes(context.actie)) fouten.push('MANDAAT_ACTIE_NIET_TOEGESTAAN');
    } else if (context.vereisActieBereik) {
      fouten.push('MANDAAT_ZONDER_ACTIEBEREIK');
    }
  } else if (context.vereisActieBereik && !Array.isArray(inhoud.toegestaneActies)) {
    fouten.push('MANDAAT_ZONDER_ACTIEBEREIK');
  }

  // KLIMOP-020: якщо мандат обмежений переліком об'єктів, об'єкт дії мусить бути в ньому
  if (Array.isArray(inhoud.objectIds)) {
    if (context.objectId === undefined || !inhoud.objectIds.includes(context.objectId)) {
      if (context.objectId !== undefined || context.vereisActieBereik) {
        fouten.push('MANDAAT_OBJECT_NIET_TOEGESTAAN');
      }
    }
  }

  return { ok: fouten.length === 0, fouten };
}

/**
 * Перевіряє незалежність набору постійних вузлів (§4.1, §43 п. 2):
 * копії на одному сервері, у одного постачальника чи в одній юрисдикції НЕ вважаються достатньою пороговою групою.
 */
export function controleerKnooppuntOnafhankelijkheid(
  knooppunten: readonly KlimopKnooppuntIdentiteit[],
  drempelK: number,
): { ok: boolean; fouten: string[]; uniekeRegios: number; uniekeAanbieders: number } {
  const fouten: string[] = [];
  if (drempelK < 2) fouten.push('DREMPEL_TE_LAAG');
  if (knooppunten.length < drempelK) fouten.push('TE_WEINIG_KNOOPPUNTEN');

  const ids = new Set(knooppunten.map((k) => k.knooppuntId));
  if (ids.size !== knooppunten.length) fouten.push('DUBBELE_KNOOPPUNT_IDS');

  const perAanbieder = new Map<string, number>();
  const perRegio = new Map<string, number>();
  for (const kn of knooppunten) {
    perAanbieder.set(kn.aanbieder, (perAanbieder.get(kn.aanbieder) ?? 0) + 1);
    perRegio.set(kn.juridischeRegio, (perRegio.get(kn.juridischeRegio) ?? 0) + 1);
  }

  for (const [aanbieder, aantal] of perAanbieder.entries()) {
    if (aantal >= drempelK) fouten.push(`EEN_AANBIEDER_HEEFT_QUORUM:${aanbieder}`);
  }
  if (perRegio.size < 2) fouten.push('MINSTENS_TWEE_JURISDICTIES_VEREIST');

  return {
    ok: fouten.length === 0,
    fouten,
    uniekeRegios: perRegio.size,
    uniekeAanbieders: perAanbieder.size,
  };
}

/**
 * Політика захисту людини під час примусу або небезпечного входу (§17 та §43 п. 9 маніфесту «Плющ»):
 * - Переводить сеанс у безпечний обмежений режим без доступу до керування ключами, мережею й резервними частками.
 * - Вимагає часової затримки (щонайменше 24 години) та багатостороннього підтвердження для критичних операцій.
 * - КАТЕГОРИЧНО ЗАБОРОНЯЄ автоматичне знищення особистих даних при спрацюванні ознаки примусу!
 */
export function beoordeelDwangSignaal(invoer: {
  dwangSleutelGebruikt: boolean;
  verdachteOmgeving: boolean;
  gevraagdeActie: 'lezen_basis' | 'sleutel_export' | 'netwerk_regel_wijzigen' | 'gegevens_wissen';
  gevraagdeAutomatischeVernietiging?: boolean;
}): {
  modus: 'normaal' | 'veilig_beperkt';
  actieToegestaan: boolean;
  verplichteWachttijdUren: number;
  automatischeVernietigingUitgevoerd: false;
  redenCode: string;
} {
  // Навіть якщо хтось явно просить автоматичне самознищення даних за примусом — маніфест (§17, §43 п. 9) це забороняє!
  if (invoer.gevraagdeAutomatischeVernietiging) {
    return {
      modus: 'veilig_beperkt',
      actieToegestaan: false,
      verplichteWachttijdUren: 72,
      automatischeVernietigingUitgevoerd: false,
      redenCode: 'AUTOMATISCHE_VERNIETIGING_VERBODEN_DOOR_MANIFEST',
    };
  }
  const onderDwang = invoer.dwangSleutelGebruikt || invoer.verdachteOmgeving;
  if (!onderDwang) {
    return {
      modus: 'normaal',
      actieToegestaan: true,
      verplichteWachttijdUren: invoer.gevraagdeActie === 'gegevens_wissen' ? 24 : 0,
      automatischeVernietigingUitgevoerd: false,
      redenCode: 'NORMAAL_GECONTROLEERD',
    };
  }
  const veiligLezen = invoer.gevraagdeActie === 'lezen_basis';
  return {
    modus: 'veilig_beperkt',
    actieToegestaan: veiligLezen,
    verplichteWachttijdUren: 72,
    automatischeVernietigingUitgevoerd: false,
    redenCode: veiligLezen ? 'VEILIG_BEPERKT_ALLEEN_BASISZICHT' : 'GEBLOKKEERD_ONDER_DWANG_BESCHERMING',
  };
}

export interface KlimopWijzigingBeoordelingInvoer {
  naam: string;
  fase: number;
  raaktProductieDirectZonderGoedkeuring: boolean;
  antwoorden15: Readonly<Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>>;
  aanwezigeVerbodenVereenvoudigingen?: readonly KlimopVerbodenVereenvoudigingId[];
}

/**
 * Програмний перевіряльник кожної архітектурної чи кодової зміни за 15 питаннями (§42)
 * та 14 забороненими спрощеннями (§43) Головного архітектурного маніфесту «Плющ».
 */
export function beoordeelKlimopWijziging(invoer: KlimopWijzigingBeoordelingInvoer): {
  goedgekeurd: boolean;
  ontbrekendeOfGefaaldeVragen: KlimopControleVraagId[];
  geschondenVereenvoudigingen: KlimopVerbodenVereenvoudigingId[];
  fouten: string[];
} {
  const fouten: string[] = [];
  if (!Number.isInteger(invoer.fase) || invoer.fase < 0 || invoer.fase > 12) {
    fouten.push('ONGELDIGE_KLIMOP_FASE');
  }
  if (invoer.raaktProductieDirectZonderGoedkeuring) {
    fouten.push('DIRECTE_PRODUCTIEWIJZIGING_ZONDER_EIGENAAR_VERBODEN');
  }

  const ontbrekendeOfGefaaldeVragen: KlimopControleVraagId[] = [];
  for (const vraagId of KLIMOP_CONTROLE_VRAGEN_IDS) {
    const item = invoer.antwoorden15?.[vraagId];
    if (!item || item.voldaan !== true || String(item.bewijs || '').trim().length < 8) {
      ontbrekendeOfGefaaldeVragen.push(vraagId);
    }
  }
  if (ontbrekendeOfGefaaldeVragen.length > 0) {
    fouten.push(`CONTROLEVRAGEN_NIET_VOLDAAN:${ontbrekendeOfGefaaldeVragen.join(',')}`);
  }

  const geschondenVereenvoudigingen = [...(invoer.aanwezigeVerbodenVereenvoudigingen ?? [])];
  if (geschondenVereenvoudigingen.length > 0) {
    fouten.push(`VERBODEN_VEREENVOUDIGINGEN:${geschondenVereenvoudigingen.join(',')}`);
  }

  return {
    goedgekeurd: fouten.length === 0,
    ontbrekendeOfGefaaldeVragen,
    geschondenVereenvoudigingen,
    fouten,
  };
}
