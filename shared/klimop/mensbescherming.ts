// KLIMOP-010 (20.11.2026, Етап 9 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Захист людини, незалежність від пам'яті та фізичного стану, необов'язковий режим протидії примусу,
// невідрізнимі сигнали небезпеки, контекстна оцінка технічного ризику, протокол тривалої відсутності
// та перевірка всіх 8 безпечних імітаційних сценаріїв §39
// (§14–§17, §36 Етап 9, §39, §42 п. 9, §43 п. 9; обов'язковий Документ №12 за реєстром Етапу 1 і §44):
//   1. Регламент для всіх 9 життєвих надзвичайних обставин (§14) без залежності від пам'яті однієї людини;
//   2. Необов'язковий профіль протидії примусу (§15): роздільні ключі основного й правдоподібного обмеженого сховищ,
//      категорична заборона автоматичного знищення особистих даних та чесне застереження щодо фізичної безпеки;
//   3. Шифровані конверти пульсу й тихого сигналу тривоги однакової фіксованої довжини 384 байти (X25519 + HKDF-SHA-256 +
//      ChaCha20-Poly1305), невідрізнимі для спостерігача й оператора вузла, та двостороннє зняття помилкової тривоги (§15, §39);
//   4. Контекстна оцінка небезпеки виключно за 7 технічними ознаками (§16) із забороною несанкціонованої біометрії,
//      без автоматичних висновків про психічний стан чи примус і зі збереженням доступу людини до власних даних;
//   5. Відкладені критичні операції з обов'язковим часовим замком (24–72 год), криптографічним скасуванням підписом власника
//      та класифікатор 6 станів тривалої відсутності (§17);
//   6. Машинний оцінювач повноти й безпеки всіх 8 обов'язкових імітаційних сценаріїв захисту людини (§39).

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  scryptSync,
  sign,
  verify,
} from 'node:crypto';
import { canoniekeJson } from './kern';

// =================================================================================================
// 1. Дев'ять життєвих обставин захисту людини (§14 маніфесту)
// =================================================================================================

export const KLIMOP_MENS_NOODOMSTANDIGHEDEN = Object.freeze([
  'verlies_van_apparaat',          // 1. Втрата пристрою
  'verlies_van_inloggegevens',     // 2. Втрата облікових даних
  'langdurige_onbeschikbaarheid',  // 3. Тривала недоступність
  'ernstige_ziekte',               // 4. Тяжка хвороба
  'geheugenstoornis',              // 5. Порушення пам'яті
  'overlijden_van_eigenaar',       // 6. Смерть власника
  'fysieke_dwang',                 // 7. Фізичний примус
  'psychologische_druk',           // 8. Психологічний тиск
  'overname_beheerrechten',        // 9. Захоплення адміністративних повноважень
] as const);

export type KlimopMensNoodomstandigheid = (typeof KLIMOP_MENS_NOODOMSTANDIGHEDEN)[number];

export interface MensNoodomstandigheidBeleid {
  omstandigheid: KlimopMensNoodomstandigheid;
  vereistOnafhankelijkeVoogdenDrempel: number;
  wachttijdOfBetwistingUren: number;
  onthulPriveGegevensAutomatischZonderQuorum: false;
  vernietigGegevensAutomatisch: false;
  beschermendeMaatregel:
    | 'onmiddellijke_apparaat_intrekking_via_neventoestel_of_quorum'
    | 'drempelherstel_pedersen_met_betwistingsvenster'
    | 'bewarende_bevriezing_zonder_rechtenoverdracht'
    | 'begrensd_zorgmandaat_zonder_wortelsleutel'
    | 'begeleid_drempelherstel_zonder_wachtwoordlast'
    | 'wettige_erfopvolging_na_lang_betwistingsvenster'
    | 'stille_beperking_tijdslot_en_onopvallend_voogdsignaal'
    | 'afkoelingsperiode_met_herroepbare_wachtrij'
    | 'blokkeer_eenzijdig_beheer_vereis_interjurisdictioneel_quorum';
}

export const STANDAARD_MENS_NOODBELEID: Readonly<Record<KlimopMensNoodomstandigheid, MensNoodomstandigheidBeleid>> =
  Object.freeze({
    verlies_van_apparaat: {
      omstandigheid: 'verlies_van_apparaat',
      vereistOnafhankelijkeVoogdenDrempel: 0, // достатньо резервного пристрою власника або кворуму при втраті всіх
      wachttijdOfBetwistingUren: 0,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'onmiddellijke_apparaat_intrekking_via_neventoestel_of_quorum',
    },
    verlies_van_inloggegevens: {
      omstandigheid: 'verlies_van_inloggegevens',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 48,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'drempelherstel_pedersen_met_betwistingsvenster',
    },
    langdurige_onbeschikbaarheid: {
      omstandigheid: 'langdurige_onbeschikbaarheid',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 168,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'bewarende_bevriezing_zonder_rechtenoverdracht',
    },
    ernstige_ziekte: {
      omstandigheid: 'ernstige_ziekte',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 48,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'begrensd_zorgmandaat_zonder_wortelsleutel',
    },
    geheugenstoornis: {
      omstandigheid: 'geheugenstoornis',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 72,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'begeleid_drempelherstel_zonder_wachtwoordlast',
    },
    overlijden_van_eigenaar: {
      omstandigheid: 'overlijden_van_eigenaar',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 168,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'wettige_erfopvolging_na_lang_betwistingsvenster',
    },
    fysieke_dwang: {
      omstandigheid: 'fysieke_dwang',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 72,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'stille_beperking_tijdslot_en_onopvallend_voogdsignaal',
    },
    psychologische_druk: {
      omstandigheid: 'psychologische_druk',
      vereistOnafhankelijkeVoogdenDrempel: 2,
      wachttijdOfBetwistingUren: 48,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'afkoelingsperiode_met_herroepbare_wachtrij',
    },
    overname_beheerrechten: {
      omstandigheid: 'overname_beheerrechten',
      vereistOnafhankelijkeVoogdenDrempel: 3,
      wachttijdOfBetwistingUren: 72,
      onthulPriveGegevensAutomatischZonderQuorum: false,
      vernietigGegevensAutomatisch: false,
      beschermendeMaatregel: 'blokkeer_eenzijdig_beheer_vereis_interjurisdictioneel_quorum',
    },
  });

// =================================================================================================
// 2. Необов'язковий режим протидії примусу, роздільні сховища та невідрізнимі сигнали тривоги (§15)
// =================================================================================================

export interface KlimopDwangBeschermingsProfiel {
  schema: 1;
  persoonsId: string;
  vrijwilligIngeschakeld: boolean;
  fysiekGeweldRisicoBeoordeeldDoorGebruiker: boolean;
  kritiekeActieWachttijdUren: number; // >= 24 год
  vertrouwenspersonenVoorAlarm: ReadonlyArray<{
    voogdId: string;
    x25519PubDerB64u: string;
    ed25519PubDerB64u: string;
  }>;
  automatischeGegevensVernietigingBijDwang: boolean;
}

/**
 * Перевіряє налаштування необов'язкового режиму захисту під примусом (§15, §43 п. 9):
 *   - категорично відхиляє будь-яке автоматичне знищення особистих даних;
 *   - якщо режим увімкнено, вимагає попередньої оцінки ризику фізичного насильства (§15 абз. 3) і затримки >= 24 год;
 *   - чесно фіксує `garandeertFysiekeVeiligheidTegenAanvaller: false` (§15 абз. 4).
 */
export function valideerDwangBeschermingsProfiel(
  profiel: KlimopDwangBeschermingsProfiel,
): {
  ok: true;
  garandeertFysiekeVeiligheidTegenAanvaller: false;
} | { ok: false; fout: string } {
  if (profiel.automatischeGegevensVernietigingBijDwang) {
    return { ok: false, fout: 'AUTOMATISCHE_GEGEVENSVERNIETIGING_VERBODEN' };
  }
  if (!profiel.vrijwilligIngeschakeld) {
    return { ok: true, garandeertFysiekeVeiligheidTegenAanvaller: false };
  }
  if (!profiel.fysiekGeweldRisicoBeoordeeldDoorGebruiker) {
    return { ok: false, fout: 'FYSIEK_GEWELDRISICO_BEOORDELING_VEREIST' };
  }
  if (profiel.kritiekeActieWachttijdUren < 24) {
    return { ok: false, fout: 'DWANG_WACHTTIJD_TE_KORT_MINSTENS_24U' };
  }
  if (profiel.vertrouwenspersonenVoorAlarm.length < 1) {
    return { ok: false, fout: 'DWANG_VEREIST_MINSTENS_EEN_VERTROUWENSPERSOON' };
  }
  return { ok: true, garandeertFysiekeVeiligheidTegenAanvaller: false };
}

/**
 * Виводить криптографічний контекст сховища з введеної фрази/ключа входу (§15 абз. 2):
 *   - основний секрет розкриває `hoofd_kluis` з повними правами власника на його дані;
 *   - спеціальний секрет примусу розкриває незалежне обмежене сховище `afgeschermde_nevenkluis`
 *     ідентичної довжини ключа (32 байти), без доступу до ключів основного сховища, резервних часток чи керування мережею!
 *   - жодних ознак існування іншого сховища у виведеному ключі немає; дані основного сховища залишаються цілими.
 */
export function leidScheidbareKluisContextAf(opties: {
  ingevoerdGeheimMateriaal: Buffer;
  kluisZout32: Buffer;
  verwachteHoofdVerifierHex: string;
  verwachteDwangVerifierHex: string;
}):
  | {
      ok: true;
      geopendeKluis: 'hoofd_kluis' | 'afgeschermde_nevenkluis';
      kluisSleutel32: Buffer;
      stilDwangModusActief: boolean;
      toegestaneRechten: readonly ('lezen_nevenkluis' | 'lezen_volledig' | 'schrijven_basis' | 'kritiek_beheer')[];
      hoofdGegevensIntact: true;
    }
  | { ok: false; fout: string } {
  if (opties.kluisZout32.length < 32 || opties.ingevoerdGeheimMateriaal.length < 16) {
    return { ok: false, fout: 'KLUIS_SLEUTELMATERIAAL_ONGELDIG' };
  }
  const verifier = Buffer.from(
    hkdfSync('sha256', opties.ingevoerdGeheimMateriaal, opties.kluisZout32, Buffer.from('klimop-kluis-verifier-v1', 'utf8'), 32),
  ).toString('hex');

  if (verifier === opties.verwachteHoofdVerifierHex) {
    const kluisSleutel32 = Buffer.from(
      hkdfSync('sha256', opties.ingevoerdGeheimMateriaal, opties.kluisZout32, Buffer.from('klimop-kluis-sleutel-v1|hoofd', 'utf8'), 32),
    );
    return {
      ok: true,
      geopendeKluis: 'hoofd_kluis',
      kluisSleutel32,
      stilDwangModusActief: false,
      toegestaneRechten: ['lezen_volledig', 'schrijven_basis', 'kritiek_beheer'],
      hoofdGegevensIntact: true,
    };
  }

  if (verifier === opties.verwachteDwangVerifierHex) {
    const kluisSleutel32 = Buffer.from(
      hkdfSync('sha256', opties.ingevoerdGeheimMateriaal, opties.kluisZout32, Buffer.from('klimop-kluis-sleutel-v1|neven', 'utf8'), 32),
    );
    return {
      ok: true,
      geopendeKluis: 'afgeschermde_nevenkluis',
      kluisSleutel32,
      stilDwangModusActief: true,
      toegestaneRechten: ['lezen_nevenkluis', 'schrijven_basis'],
      hoofdGegevensIntact: true,
    };
  }

  return { ok: false, fout: 'INLOGGEGEVENS_ONJUIST' };
}

export function berekenKluisVerifierHex(geheimMateriaal: Buffer, kluisZout32: Buffer): string {
  return Buffer.from(
    hkdfSync('sha256', geheimMateriaal, kluisZout32, Buffer.from('klimop-kluis-verifier-v1', 'utf8'), 32),
  ).toString('hex');
}

/**
 * KLIMOP-021: пам'яттєво-складне виведення 32-байтного секретного матеріалу з людської парольної фрази
 * низької ентропії через `scrypt` (`N=16384, r=8, p=1`), перш ніж передавати його у `leidScheidbareKluisContextAf`.
 * Для сильних 32-байтних випадкових апаратних ключів використовується прямий `HKDF-SHA-256`.
 */
export function leidKluisGeheimUitWachtzin(wachtzin: string, kluisZout32: Buffer): Buffer {
  if (typeof wachtzin !== 'string' || wachtzin.trim().length < 8 || kluisZout32.length < 32) {
    throw new Error('WACHTZIN_OF_ZOUT_ONGELDIG');
  }
  const genormaliseerd = Buffer.from(wachtzin.normalize('NFKC'), 'utf8');
  try {
    return scryptSync(genormaliseerd, kluisZout32, 32, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  } finally {
    genormaliseerd.fill(0);
  }
}

// Фіксований розмір внутрішнього відкритого блока (256 байт), щоб зашифрований пакет пульсу і пакет тихої тривоги
// мали побітово однакову довжину в мережі та у сховищі вузла!
const VASTE_SIGNAAL_KLARE_LENGTE = 256;
const SIGNAAL_AAD_PREFIX = 'klimop-onopvallend-signaal-v1|';
const VALS_ALARM_HERSTEL_DOMEIN = 'klimop-herstel-vals-dwangalarm-v1|';
const UITGESTELDE_OP_DOMEIN = 'klimop-uitgestelde-kritieke-op-v1|';
const ANNULERING_OP_DOMEIN = 'klimop-annulering-uitgestelde-op-v1|';

export interface OnopvallendSignaalPakket {
  schema: 1;
  pakketId: string;
  ontvangerVoogdId: string;
  efemeerX25519PubDerB64u: string;
  ivB64u: string;
  cijfertekstB64u: string; // завжди рівно 256 байт у сировинному вигляді!
  authTagB64u: string;
}

export interface OntsleuteldSignaalBinnenwerk {
  soort: 'gewone_hartslag' | 'stil_dwang_alarm';
  persoonsPsid: string;
  verzondenOp: string;
  toelichtingCode: string;
}

export function maakX25519SleutelPaar(): { publiekDerB64u: string; geheimPkcs8B64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    publiekDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

function tekenEd25519(geheimPkcs8B64u: string, boodschap: Buffer): string {
  const priv = createPrivateKey({
    key: Buffer.from(geheimPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, boodschap, priv).toString('base64url');
}

function verifieerEd25519(publiekDerB64u: string, boodschap: Buffer, handtekeningB64u: string): boolean {
  try {
    const pub = createPublicKey({
      key: Buffer.from(publiekDerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, boodschap, pub, Buffer.from(handtekeningB64u, 'base64url'));
  } catch {
    return false;
  }
}

/**
 * KLIMOP-021: чесна модель спостерігача для 256-байтних конвертів пульсу та сигналу небезпеки (§15):
 *   - пасивний спостерігач на транспортному каналі та оператор проміжного вузла не розрізняють `gewone_hartslag`
 *     та `stil_dwang_alarm` за довжиною чи шифротекстом при тому самому `ontvangerVoogdId`;
 *   - ідентифікатор одержувача `ontvangerVoogdId` та момент доставки видимі вузлу скриньки, тому для приховування
 *     частоти пристрій повинен надсилати конверти за постійним плановим інтервалом пульсу тим самим маршрутом;
 *   - локальні сліди пам'яті, інтерфейсу чи носія на захопленому пристрої цим конвертом не усуваються.
 */
export const NOODSIGNAAL_WAARNEMER_MODEL = Object.freeze({
  vasteCijfertekstLengteBytes: VASTE_SIGNAAL_KLARE_LENGTE,
  verbergtSoortVoorNetwerkEnTussenknoop: true,
  ontvangerVoogdIdZichtbaarVoorPostbusKnoop: true,
  vereistVastHartslagIntervalEnRoute: true,
  verbergtLokaleApparaatSporen: false,
} as const);

/**
 * Формує зашифрований конверт фіксованого розміру (рівно 256 байт шифротексту) для довіреної особи (§15):
 *   - ні нападник, який бачить мережеві пакети з пристрою за фіксованим розкладом пульсу, ні оператор проміжного вузла
 *     не можуть за шифротекстом розрізнити звичайний плановий пульс `gewone_hartslag` і сигнал `stil_dwang_alarm`.
 */
export function maakOnopvallendNoodSignaalPakket(opties: {
  ontvangerVoogdId: string;
  ontvangerX25519PubDerB64u: string;
  soort: 'gewone_hartslag' | 'stil_dwang_alarm';
  persoonsPsid: string;
  nuIso?: string;
  toelichtingCode?: string;
}): OnopvallendSignaalPakket {
  const efemeer = generateKeyPairSync('x25519');
  const efemeerPubDer = efemeer.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const ontvangerPub = createPublicKey({
    key: Buffer.from(opties.ontvangerX25519PubDerB64u, 'base64url'),
    format: 'der',
    type: 'spki',
  });

  let gedeeldGeheim: Buffer | null = null;
  let sleutel32: Buffer | null = null;
  let jsonBytes: Buffer | null = null;
  let vlakBlok: Buffer | null = null;
  try {
    gedeeldGeheim = diffieHellman({ privateKey: efemeer.privateKey, publicKey: ontvangerPub });
    const pakketId = `sig_${randomBytes(12).toString('hex')}`;
    sleutel32 = Buffer.from(
      hkdfSync(
        'sha256',
        gedeeldGeheim,
        efemeerPubDer,
        Buffer.from(`${SIGNAAL_AAD_PREFIX}${opties.ontvangerVoogdId}|${pakketId}`, 'utf8'),
        32,
      ),
    );

    jsonBytes = Buffer.from(
      canoniekeJson({
        soort: opties.soort,
        persoonsPsid: opties.persoonsPsid,
        verzondenOp: opties.nuIso ?? new Date().toISOString(),
        toelichtingCode: (opties.toelichtingCode ?? 'OK').slice(0, 48),
      } satisfies OntsleuteldSignaalBinnenwerk),
      'utf8',
    );
    if (jsonBytes.length > VASTE_SIGNAAL_KLARE_LENGTE - 2) {
      throw new Error('SIGNAAL_BINNENWERK_TE_LANG');
    }

    // Записуємо 2-байтну довжину JSON + вміст + випадкове заповнення до рівно 256 байт:
    vlakBlok = randomBytes(VASTE_SIGNAAL_KLARE_LENGTE);
    vlakBlok.writeUInt16BE(jsonBytes.length, 0);
    jsonBytes.copy(vlakBlok, 2);

    const iv = randomBytes(12);
    const aad = Buffer.from(`${SIGNAAL_AAD_PREFIX}${opties.ontvangerVoogdId}|${pakketId}`, 'utf8');
    const cipher = createCipheriv('chacha20-poly1305', sleutel32, iv, { authTagLength: 16 });
    cipher.setAAD(aad, { plaintextLength: vlakBlok.length });
    const ct = Buffer.concat([cipher.update(vlakBlok), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      schema: 1,
      pakketId,
      ontvangerVoogdId: opties.ontvangerVoogdId,
      efemeerX25519PubDerB64u: efemeerPubDer.toString('base64url'),
      ivB64u: iv.toString('base64url'),
      cijfertekstB64u: ct.toString('base64url'),
      authTagB64u: tag.toString('base64url'),
    };
  } finally {
    gedeeldGeheim?.fill(0);
    sleutel32?.fill(0);
    jsonBytes?.fill(0);
    vlakBlok?.fill(0);
  }
}

/** Розшифровує пакет пульсу або тихої тривоги виключно приватним ключем X25519 призначеної довіреної особи. */
export function openNoodSignaalDoorVertrouwenspersoon(opties: {
  pakket: OnopvallendSignaalPakket;
  voogdX25519GeheimPkcs8B64u: string;
}): { ok: true; inhoud: OntsleuteldSignaalBinnenwerk } | { ok: false; fout: string } {
  let gedeeldGeheim: Buffer | null = null;
  let sleutel32: Buffer | null = null;
  let vlakBlok: Buffer | null = null;
  try {
    const ct = Buffer.from(opties.pakket.cijfertekstB64u, 'base64url');
    if (ct.length !== VASTE_SIGNAAL_KLARE_LENGTE) {
      return { ok: false, fout: 'SIGNAAL_PAKKET_AFWIJKENDE_LENGTE' };
    }
    const voogdPriv = createPrivateKey({
      key: Buffer.from(opties.voogdX25519GeheimPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    const efemeerPubDer = Buffer.from(opties.pakket.efemeerX25519PubDerB64u, 'base64url');
    const efemeerPub = createPublicKey({ key: efemeerPubDer, format: 'der', type: 'spki' });

    gedeeldGeheim = diffieHellman({ privateKey: voogdPriv, publicKey: efemeerPub });
    const aad = Buffer.from(`${SIGNAAL_AAD_PREFIX}${opties.pakket.ontvangerVoogdId}|${opties.pakket.pakketId}`, 'utf8');
    sleutel32 = Buffer.from(hkdfSync('sha256', gedeeldGeheim, efemeerPubDer, aad, 32));

    const decipher = createDecipheriv('chacha20-poly1305', sleutel32, Buffer.from(opties.pakket.ivB64u, 'base64url'), {
      authTagLength: 16,
    });
    decipher.setAAD(aad, { plaintextLength: ct.length });
    decipher.setAuthTag(Buffer.from(opties.pakket.authTagB64u, 'base64url'));
    vlakBlok = Buffer.concat([decipher.update(ct), decipher.final()]);
    const jsonLengte = vlakBlok.readUInt16BE(0);
    if (jsonLengte <= 0 || jsonLengte > VASTE_SIGNAAL_KLARE_LENGTE - 2) {
      return { ok: false, fout: 'SIGNAAL_LENGTEVELD_ONGELDIG' };
    }
    const inhoud = JSON.parse(vlakBlok.subarray(2, 2 + jsonLengte).toString('utf8')) as OntsleuteldSignaalBinnenwerk;
    return { ok: true, inhoud };
  } catch {
    return { ok: false, fout: 'SIGNAAL_ONTSLEUTELING_GEWEIGERD' };
  } finally {
    gedeeldGeheim?.fill(0);
    sleutel32?.fill(0);
    vlakBlok?.fill(0);
  }
}

/**
 * Безпечне зняття помилково активованого сигналу небезпеки (§39 п. 4 «помилкове спрацювання сигналу небезпеки»):
 *   - 0 байт даних втрачено;
 *   - щоб нападник не міг примусити власника одразу одноосібно вимкнути тривогу, для дострокового зняття
 *     обов'язковий спільний криптографічний підпис власника ТА визначеної довіреної особи з профілю!
 */
export function maakValsAlarmHerstelVerklaring(opties: {
  persoonsId: string;
  alarmGeactiveerdOp: string;
  eigenaarSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  voogdSleutels: { voogdId: string; publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
}) {
  const kern = {
    schema: 1 as const,
    persoonsId: opties.persoonsId,
    alarmGeactiveerdOp: opties.alarmGeactiveerdOp,
    bevestigdOp: opties.nuIso ?? new Date().toISOString(),
    eigenaarPubDerB64u: opties.eigenaarSleutels.publiekeSleutelDerB64u,
    voogdId: opties.voogdSleutels.voogdId,
    voogdPubDerB64u: opties.voogdSleutels.publiekeSleutelDerB64u,
  };
  const boodschap = Buffer.from(VALS_ALARM_HERSTEL_DOMEIN + canoniekeJson(kern), 'utf8');
  return {
    ...kern,
    eigenaarHandtekeningB64u: tekenEd25519(opties.eigenaarSleutels.geheimeSleutelPkcs8B64u, boodschap),
    voogdHandtekeningB64u: tekenEd25519(opties.voogdSleutels.geheimeSleutelPkcs8B64u, boodschap),
  };
}

export function herstelNaValsDwangAlarm(opties: {
  profiel: KlimopDwangBeschermingsProfiel;
  verwachteEigenaarPubDerB64u: string;
  verklaring: ReturnType<typeof maakValsAlarmHerstelVerklaring>;
}): { ok: true; nieuweModus: 'normaal'; gegevensVerliesBytes: 0 } | { ok: false; fout: string } {
  const { verklaring } = opties;
  if (
    verklaring.persoonsId !== opties.profiel.persoonsId
    || verklaring.eigenaarPubDerB64u !== opties.verwachteEigenaarPubDerB64u
  ) {
    return { ok: false, fout: 'VALS_ALARM_EIGENAAR_ONGELDIG' };
  }
  const erkendeVoogd = opties.profiel.vertrouwenspersonenVoorAlarm.find(
    (v) => v.voogdId === verklaring.voogdId && v.ed25519PubDerB64u === verklaring.voogdPubDerB64u,
  );
  if (!erkendeVoogd) {
    return { ok: false, fout: 'VALS_ALARM_VEREIST_ERKENDE_VERTROUWENSPERSOON' };
  }
  const { eigenaarHandtekeningB64u, voogdHandtekeningB64u, ...kern } = verklaring;
  const boodschap = Buffer.from(VALS_ALARM_HERSTEL_DOMEIN + canoniekeJson(kern), 'utf8');
  if (
    !verifieerEd25519(verklaring.eigenaarPubDerB64u, boodschap, eigenaarHandtekeningB64u)
    || !verifieerEd25519(verklaring.voogdPubDerB64u, boodschap, voogdHandtekeningB64u)
  ) {
    return { ok: false, fout: 'VALS_ALARM_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true, nieuweModus: 'normaal', gegevensVerliesBytes: 0 };
}

// =================================================================================================
// 3. Контекстна оцінка небезпеки за 7 технічними ознаками (§16 маніфесту)
// =================================================================================================

export const KLIMOP_TECHNISCHE_RISICO_SIGNALEN = Object.freeze([
  'plotselinge_apparaatwissel',        // 1. Раптова зміна пристрою
  'ongebruikelijke_rechtenuitbreiding', // 2. Нетипова спроба розширити права
  'aanmelding_uit_nieuwe_omgeving',    // 3. Вхід з нового середовища
  'afwijkende_actievolgorde',          // 4. Незвична послідовність дій
  'massale_gegevensverwijdering',      // 5. Масове вилучення даних
  'gelijktijdige_sleutelwijzigingen',  // 6. Одночасні спроби змінити ключі
  'verdachte_herstelregel_wijziging',  // 7. Підозрілі зміни правил відновлення
] as const);

export type KlimopTechnischRisicoSignaal = (typeof KLIMOP_TECHNISCHE_RISICO_SIGNALEN)[number];

const RISICO_GEWICHTEN: Readonly<Record<KlimopTechnischRisicoSignaal, number>> = Object.freeze({
  plotselinge_apparaatwissel: 20,
  ongebruikelijke_rechtenuitbreiding: 35,
  aanmelding_uit_nieuwe_omgeving: 15,
  afwijkende_actievolgorde: 15,
  massale_gegevensverwijdering: 45,
  gelijktijdige_sleutelwijzigingen: 45,
  verdachte_herstelregel_wijziging: 55,
});

export interface ContextueleRisicoInvoer {
  waargenomenSignalen: readonly KlimopTechnischRisicoSignaal[];
  gevraagdeActieSoort: 'gewoon_lezen_en_werken' | 'kritieke_sleutel_of_rechten_actie';
  bevatBiometrischeOfFysiologischeGegevens?: boolean;
  aparteUitdrukkelijkeBiometrieToestemmingEnMotivering?: boolean;
}

export interface ContextueleRisicoBeoordeling {
  ok: boolean;
  fout: string | null;
  risicoScore: number;
  risicoNiveau: 'laag' | 'verhoogd' | 'hoog';
  besluit:
    | 'onmiddellijk_toestaan'
    | 'vraag_extra_authenticatie'
    | 'vertraag_kritieke_actie_en_vraag_quorum';
  verplichteWachttijdUren: number;
  toegangTotEigenGegevensBehouden: true;
  automatischeConclusieOverGeestestoestandOfDwang: false;
}

/**
 * Оцінює технічний ризик операції за §16 маніфесту:
 *   - забороняє використання біометричних/фізіологічних даних без окремої явної згоди й обґрунтування (§16 абз. 2);
 *   - ніколи не робить автоматичних висновків про психічний стан, дію речовин чи примус із поведінки (§16 абз. 3);
 *   - ніколи не позбавляє людину доступу до її власних даних — лише затримує небезпечну критичну операцію (§16 абз. 4)!
 */
export function beoordeelContextueelOperatieRisico(invoer: ContextueleRisicoInvoer): ContextueleRisicoBeoordeling {
  if (
    invoer.bevatBiometrischeOfFysiologischeGegevens
    && !invoer.aparteUitdrukkelijkeBiometrieToestemmingEnMotivering
  ) {
    return {
      ok: false,
      fout: 'BIOMETRIE_ZONDER_UITDRUKKELIJKE_TOESTEMMING_VERBODEN',
      risicoScore: 0,
      risicoNiveau: 'laag',
      besluit: 'vraag_extra_authenticatie',
      verplichteWachttijdUren: 0,
      toegangTotEigenGegevensBehouden: true,
      automatischeConclusieOverGeestestoestandOfDwang: false,
    };
  }

  const unieke = new Set(invoer.waargenomenSignalen);
  let score = 0;
  for (const s of unieke) {
    score += RISICO_GEWICHTEN[s] ?? 0;
  }
  score = Math.min(100, score);

  const niveau: 'laag' | 'verhoogd' | 'hoog' = score >= 50 ? 'hoog' : score >= 20 ? 'verhoogd' : 'laag';

  // Звичайне читання й робота з власними даними завжди зберігаються (§16 абз. 4):
  if (invoer.gevraagdeActieSoort === 'gewoon_lezen_en_werken') {
    return {
      ok: true,
      fout: null,
      risicoScore: score,
      risicoNiveau: niveau,
      besluit: niveau === 'hoog' ? 'vraag_extra_authenticatie' : 'onmiddellijk_toestaan',
      verplichteWachttijdUren: 0,
      toegangTotEigenGegevensBehouden: true,
      automatischeConclusieOverGeestestoestandOfDwang: false,
    };
  }

  if (niveau === 'hoog') {
    return {
      ok: true,
      fout: null,
      risicoScore: score,
      risicoNiveau: 'hoog',
      besluit: 'vertraag_kritieke_actie_en_vraag_quorum',
      verplichteWachttijdUren: 72,
      toegangTotEigenGegevensBehouden: true,
      automatischeConclusieOverGeestestoestandOfDwang: false,
    };
  }
  if (niveau === 'verhoogd') {
    return {
      ok: true,
      fout: null,
      risicoScore: score,
      risicoNiveau: 'verhoogd',
      besluit: 'vraag_extra_authenticatie',
      verplichteWachttijdUren: 24,
      toegangTotEigenGegevensBehouden: true,
      automatischeConclusieOverGeestestoestandOfDwang: false,
    };
  }

  return {
    ok: true,
    fout: null,
    risicoScore: score,
    risicoNiveau: 'laag',
    besluit: 'onmiddellijk_toestaan',
    verplichteWachttijdUren: 0,
    toegangTotEigenGegevensBehouden: true,
    automatischeConclusieOverGeestestoestandOfDwang: false,
  };
}

// =================================================================================================
// 4. Відкладені критичні операції з правом тихого скасування та протокол тривалої відсутності (§17, §36)
// =================================================================================================

export type KritiekeMensOperatieSoort =
  | 'exporteer_sleutelmateriaal'
  | 'wijzig_herstelvoogden'
  | 'draag_eigendom_over'
  | 'verwijder_volledig_archief';

export interface KlimopUitgesteldeKritiekeOperatie {
  schema: 1;
  operatieId: string;
  persoonsId: string;
  soort: KritiekeMensOperatieSoort;
  doelSamenvatting: string;
  aangevraagdOp: string;
  uitvoerbaarVanaf: string;
  onderDwangAangevraagd: boolean;
  aanvragerPubDerB64u: string;
  handtekeningB64u: string;
}

export interface KlimopOperatieAnnulering {
  schema: 1;
  operatieId: string;
  persoonsId: string;
  geannuleerdOp: string;
  reden: 'eigenaar_herroeping' | 'dwang_bescherming' | 'verdachte_poging_geblokkeerd';
  ondertekenaarPubDerB64u: string;
  handtekeningB64u: string;
}

/** Створює підписану відкладену критичну операцію із захисним часовим замком щонайменше 24 год (72 год при ризику/примусі). */
export function maakUitgesteldeKritiekeOperatie(opties: {
  persoonsId: string;
  soort: KritiekeMensOperatieSoort;
  doelSamenvatting: string;
  wachttijdUren: number;
  onderDwangAangevraagd?: boolean;
  aanvragerSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
}): KlimopUitgesteldeKritiekeOperatie {
  const nuIso = opties.nuIso ?? new Date().toISOString();
  const minUren = opties.onderDwangAangevraagd ? Math.max(72, opties.wachttijdUren) : Math.max(24, opties.wachttijdUren);
  const uitvoerbaarVanaf = new Date(Date.parse(nuIso) + minUren * 3600 * 1000).toISOString();
  const kern = {
    schema: 1 as const,
    operatieId: `ukop_${randomBytes(10).toString('hex')}`,
    persoonsId: opties.persoonsId,
    soort: opties.soort,
    doelSamenvatting: opties.doelSamenvatting,
    aangevraagdOp: nuIso,
    uitvoerbaarVanaf,
    onderDwangAangevraagd: Boolean(opties.onderDwangAangevraagd),
    aanvragerPubDerB64u: opties.aanvragerSleutels.publiekeSleutelDerB64u,
  };
  return {
    ...kern,
    handtekeningB64u: tekenEd25519(
      opties.aanvragerSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(UITGESTELDE_OP_DOMEIN + canoniekeJson(kern), 'utf8'),
    ),
  };
}

export function verifieerUitgesteldeKritiekeOperatie(
  op: KlimopUitgesteldeKritiekeOperatie,
): { ok: true } | { ok: false; fout: string } {
  if (!op || op.schema !== 1 || !op.operatieId) {
    return { ok: false, fout: 'UITGESTELDE_OPERATIE_ONGELDIG' };
  }
  const tAanvraag = Date.parse(op.aangevraagdOp);
  const tVanaf = Date.parse(op.uitvoerbaarVanaf);
  if (!Number.isFinite(tAanvraag) || !Number.isFinite(tVanaf)) {
    return { ok: false, fout: 'UITGESTELDE_OPERATIE_TIJD_ONGELDIG' };
  }
  if (tVanaf - tAanvraag < 24 * 3600 * 1000) {
    return { ok: false, fout: 'UITGESTELDE_OPERATIE_TIJDSLOT_TE_KORT' };
  }
  const { handtekeningB64u, ...kern } = op;
  if (!verifieerEd25519(op.aanvragerPubDerB64u, Buffer.from(UITGESTELDE_OP_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'UITGESTELDE_OPERATIE_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}

/** Дозволяє власникові або його резервному пристрою криптографічно скасувати відкладену операцію під час вікна очікування. */
export function maakOperatieAnnulering(opties: {
  operatieId: string;
  persoonsId: string;
  reden: KlimopOperatieAnnulering['reden'];
  ondertekenaarSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
}): KlimopOperatieAnnulering {
  const kern = {
    schema: 1 as const,
    operatieId: opties.operatieId,
    persoonsId: opties.persoonsId,
    geannuleerdOp: opties.nuIso ?? new Date().toISOString(),
    reden: opties.reden,
    ondertekenaarPubDerB64u: opties.ondertekenaarSleutels.publiekeSleutelDerB64u,
  };
  return {
    ...kern,
    handtekeningB64u: tekenEd25519(
      opties.ondertekenaarSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(ANNULERING_OP_DOMEIN + canoniekeJson(kern), 'utf8'),
    ),
  };
}

export function beoordeelUitvoeringUitgesteldeOperatie(opties: {
  operatie: KlimopUitgesteldeKritiekeOperatie;
  annulering: KlimopOperatieAnnulering | null;
  toegestaneAnnuleerPubSleutels: ReadonlySet<string>;
  actiefStilDwangAlarm: boolean;
  nuIso: string;
}): { magUitvoeren: boolean; fout: string | null } {
  const vOp = verifieerUitgesteldeKritiekeOperatie(opties.operatie);
  if (!vOp.ok) return { magUitvoeren: false, fout: vOp.fout };

  if (opties.annulering) {
    const tGeannuleerd = Date.parse(opties.annulering.geannuleerdOp);
    const { handtekeningB64u, ...kern } = opties.annulering;
    const geldig =
      Number.isFinite(tGeannuleerd)
      && opties.annulering.operatieId === opties.operatie.operatieId
      && opties.toegestaneAnnuleerPubSleutels.has(opties.annulering.ondertekenaarPubDerB64u)
      && verifieerEd25519(
        opties.annulering.ondertekenaarPubDerB64u,
        Buffer.from(ANNULERING_OP_DOMEIN + canoniekeJson(kern), 'utf8'),
        handtekeningB64u,
      );
    if (geldig) {
      return { magUitvoeren: false, fout: 'KRITIEKE_OPERATIE_GEANNULEERD_DOOR_EIGENAAR' };
    }
  }

  if (opties.operatie.onderDwangAangevraagd || opties.actiefStilDwangAlarm) {
    return { magUitvoeren: false, fout: 'KRITIEKE_OPERATIE_GEBLOKKEERD_WEGENS_DWANGBESCHERMING' };
  }

  const tNu = Date.parse(opties.nuIso);
  const tVanaf = Date.parse(opties.operatie.uitvoerbaarVanaf);
  if (!Number.isFinite(tNu) || !Number.isFinite(tVanaf)) {
    return { magUitvoeren: false, fout: 'UITGESTELDE_OPERATIE_TIJD_ONGELDIG' };
  }
  if (tNu < tVanaf) {
    return { magUitvoeren: false, fout: 'KRITIEKE_OPERATIE_IN_WACHTTIJD' };
  }

  return { magUitvoeren: true, fout: null };
}

export const KLIMOP_AFWEZIGHEID_KLASSEN = Object.freeze([
  'gewone_afwezigheid',
  'tijdelijk_verbindingsverlies',
  'verlies_van_apparaat',
  'bevestigde_noodsituatie',
  'langdurige_wilsonbekwaamheid',
  'wettige_erfopvolging',
] as const);

export type KlimopAfwezigheidKlasse = (typeof KLIMOP_AFWEZIGHEID_KLASSEN)[number];

/**
 * Протокол тривалої відсутності (§17 маніфесту):
 *   - розрізняє всі 6 станів §17;
 *   - сам факт мовчання власника (навіть сотні днів) без незалежних підтверджень опікунів і відкритого вікна оскарження
 *     НІКОЛИ автоматично не розкриває приватні дані й не передає адміністративні права!
 */
export function beoordeelLangdurigeAfwezigheidProtocol(opties: {
  klasse: KlimopAfwezigheidKlasse;
  dagenZonderActiviteit: number;
  bevestigdeOnafhankelijkeVoogden: number;
  vereisteVoogdenDrempel: number;
  verstrekenBetwistingUren: number;
  eigenaarHeeftBezwaarAangetekend: boolean;
}): {
  toegestaneReactie:
    | 'geen_overdracht_alleen_bewaring'
    | 'alleen_specifiek_apparaat_intrekken'
    | 'wacht_op_voogdenquorum_en_betwistingstermijn'
    | 'geblokkeerd_door_levende_eigenaar'
    | 'vooraf_overeengekomen_herstel_toegestaan';
  priveGegevensAutomatischOnthuldDoorStilte: false;
  volledigeBeheerrechtenAutomatischOvergedragen: false;
} {
  if (opties.eigenaarHeeftBezwaarAangetekend) {
    return {
      toegestaneReactie: 'geblokkeerd_door_levende_eigenaar',
      priveGegevensAutomatischOnthuldDoorStilte: false,
      volledigeBeheerrechtenAutomatischOvergedragen: false,
    };
  }
  if (opties.klasse === 'gewone_afwezigheid' || opties.klasse === 'tijdelijk_verbindingsverlies') {
    return {
      toegestaneReactie: 'geen_overdracht_alleen_bewaring',
      priveGegevensAutomatischOnthuldDoorStilte: false,
      volledigeBeheerrechtenAutomatischOvergedragen: false,
    };
  }
  if (opties.klasse === 'verlies_van_apparaat') {
    return {
      toegestaneReactie: 'alleen_specifiek_apparaat_intrekken',
      priveGegevensAutomatischOnthuldDoorStilte: false,
      volledigeBeheerrechtenAutomatischOvergedragen: false,
    };
  }

  const minDrempel = Math.max(2, opties.vereisteVoogdenDrempel);
  const minBetwistingUren = opties.klasse === 'bevestigde_noodsituatie' ? 48 : 168;

  if (
    opties.bevestigdeOnafhankelijkeVoogden < minDrempel
    || opties.verstrekenBetwistingUren < minBetwistingUren
  ) {
    return {
      toegestaneReactie: 'wacht_op_voogdenquorum_en_betwistingstermijn',
      priveGegevensAutomatischOnthuldDoorStilte: false,
      volledigeBeheerrechtenAutomatischOvergedragen: false,
    };
  }

  return {
    toegestaneReactie: 'vooraf_overeengekomen_herstel_toegestaan',
    priveGegevensAutomatischOnthuldDoorStilte: false,
    volledigeBeheerrechtenAutomatischOvergedragen: false,
  };
}

// =================================================================================================
// 5. Оцінювач повноти та безпеки всіх 8 обов'язкових сценаріїв захисту людини (§39 маніфесту)
// =================================================================================================

export const KLIMOP_MENSBESCHERMING_SCENARIOS = Object.freeze([
  'diefstal_van_apparaat',                // 1. Викрадення пристрою
  'gedwongen_afgifte_een_inlogset',       // 2. Примусове розкриття одного набору облікових даних
  'langdurige_onbeschikbaarheid_eigenaar', // 3. Тривала недоступність власника
  'vals_alarm_noodsignaal',               // 4. Помилкове спрацювання сигналу небезпеки
  'verlies_alle_persoonlijke_apparaten',  // 5. Втрата всіх особистих пристроїв
  'wettig_herstel',                       // 6. Законне відновлення
  'poging_onwettige_erfopvolging',        // 7. Спроба незаконного спадкування
  'poging_kaping_herstelprocedure',       // 8. Спроба захопити процедуру відновлення
] as const);

export type KlimopMensbeschermingScenarioId = (typeof KLIMOP_MENSBESCHERMING_SCENARIOS)[number];

export interface MensbeschermingScenarioMeting {
  scenarioId: KlimopMensbeschermingScenarioId;
  veiligeSimulatieZonderEchtGevaar: boolean;
  aanvallerKreegAlleenheerschappij: boolean;
  gegevensVerliesBytes: number;
  wettigeRechtenBehouden: boolean;
  bewijsSamenvatting: string;
}

export function beoordeelMensbeschermingsProgramma(
  metingen: readonly MensbeschermingScenarioMeting[],
): {
  geslaagd: boolean;
  gedekteScenarios: number;
  ontbrekendeScenarios: KlimopMensbeschermingScenarioId[];
  gefaaldeScenarios: KlimopMensbeschermingScenarioId[];
} {
  const perId = new Map<KlimopMensbeschermingScenarioId, MensbeschermingScenarioMeting>();
  for (const m of metingen) perId.set(m.scenarioId, m);

  const ontbrekendeScenarios: KlimopMensbeschermingScenarioId[] = [];
  const gefaaldeScenarios: KlimopMensbeschermingScenarioId[] = [];

  for (const id of KLIMOP_MENSBESCHERMING_SCENARIOS) {
    const m = perId.get(id);
    if (!m) {
      ontbrekendeScenarios.push(id);
      continue;
    }
    const ok =
      m.veiligeSimulatieZonderEchtGevaar === true
      && m.aanvallerKreegAlleenheerschappij === false
      && m.gegevensVerliesBytes === 0
      && m.wettigeRechtenBehouden === true
      && m.bewijsSamenvatting.trim().length > 0;
    if (!ok) {
      gefaaldeScenarios.push(id);
    }
  }

  return {
    geslaagd: ontbrekendeScenarios.length === 0 && gefaaldeScenarios.length === 0,
    gedekteScenarios: KLIMOP_MENSBESCHERMING_SCENARIOS.length - ontbrekendeScenarios.length,
    ontbrekendeScenarios,
    gefaaldeScenarios,
  };
}
