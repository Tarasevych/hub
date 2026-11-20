// KLIMOP-008 (20.11.2026, Етап 7 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Імунна система екосистеми, спостереження без розкриття особистих даних, самовідновлення у межах квот,
// добровільна участь користувацьких пристроїв та перевірка живучості за 10 аварійними сценаріями
// (§1.5, §1.6, §21–§22, §26–§27, §36 Етап 7, §37, §41; обов'язкові Документи №10, №11 та №18 за §44 маніфесту):
//   1. Сліпа криптографічна перевірка наявності та цілісності зашифрованих фрагментів (HMAC-SHA-256 за свіжим одноразовим
//      викликом) без розкриття вмісту файлів чи метаданих власника (§21);
//   2. Класифікація стану вузла: чітке розмежування перевантаження/затримки, втрати зв'язку (Документ №10) та
//      компрометації/пошкодження даних із негайним карантином (Документ №11);
//   3. Квоти швидкості самовідновлення та захист користувацьких пристроїв від виснаження акумулятора й мережі без
//      позбавлення людини доступу до її власних даних (§22, §26–§27);
//   4. Самовідновлення ніколи не надає собі нових повноважень і не обходить криптографічні мандати (§22 абз. 3);
//   5. Програмний оцінювач усіх 10 обов'язкових аварійних сценаріїв живучості з 4 вимірюваними гарантіями (§37, §41).

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { KlimopOndertekendMandaat } from './kern';

// =================================================================================================
// 1. Сліпа криптографічна перевірка цілісності зашифрованого фрагмента без розкриття вмісту (§21)
// =================================================================================================

const BLINDE_INTEGRITEIT_DOMEIN = 'klimop-blinde-integriteit-v1|';

export interface KlimopBlindeIntegriteitUitdaging {
  schema: 1;
  blokSha256: string;
  uitdagingNonceHex: string; // 64 шістнадцяткові символи (32 байти випадковості)
  aangevraagdOp: string;
}

export interface KlimopBlindeIntegriteitAntwoord {
  schema: 1;
  blokSha256: string;
  grootteBytes: number;
  bewijsHmacHex: string;
}

/** Створює свіжий 32-байтний криптографічний виклик для перевірки наявності та незмінності зашифрованого блока. */
export function maakBlindeIntegriteitUitdaging(
  blokSha256: string,
  nuIso = new Date().toISOString(),
): KlimopBlindeIntegriteitUitdaging {
  if (!/^[0-9a-f]{64}$/i.test(blokSha256)) {
    throw new Error('ONGELDIGE_BLOK_SHA256');
  }
  return {
    schema: 1,
    blokSha256: blokSha256.toLowerCase(),
    uitdagingNonceHex: randomBytes(32).toString('hex'),
    aangevraagdOp: nuIso,
  };
}

/**
 * Обчислює на вузлі зберігання доказ володіння точним зашифрованим блоком без розшифрування:
 * якщо на носії пошкоджено хоча б 1 біт, або вузол видалив блок і пам'ятає лише його старий відбиток SHA-256,
 * обчислити правильний HMAC за свіжим одноразовим викликом неможливо.
 */
export function berekenBlindeIntegriteitBewijs(
  ruweCijfertekst: Buffer,
  uitdagingNonceHex: string,
): { ok: true; antwoord: KlimopBlindeIntegriteitAntwoord } | { ok: false; fout: string } {
  if (!/^[0-9a-f]{64}$/i.test(uitdagingNonceHex)) {
    return { ok: false, fout: 'UITDAGING_NONCE_ONGELDIG' };
  }
  const werkelijkeSha256 = createHash('sha256').update(ruweCijfertekst).digest('hex');
  const sleutel = Buffer.from(uitdagingNonceHex, 'hex');
  const hmac = createHmac('sha256', sleutel);
  hmac.update(Buffer.from(`${BLINDE_INTEGRITEIT_DOMEIN}${werkelijkeSha256}|${ruweCijfertekst.length}|`, 'utf8'));
  hmac.update(ruweCijfertekst);

  return {
    ok: true,
    antwoord: {
      schema: 1,
      blokSha256: werkelijkeSha256,
      grootteBytes: ruweCijfertekst.length,
      bewijsHmacHex: hmac.digest('hex'),
    },
  };
}

/** Перевіряє доказ цілісності блока проти очікуваного зашифрованого фрагмента (або його перевіреної смуги Ріда–Соломона). */
export function verifieerBlindeIntegriteitBewijs(opties: {
  uitdaging: KlimopBlindeIntegriteitUitdaging;
  antwoord: KlimopBlindeIntegriteitAntwoord;
  verwachteCijfertekst?: Buffer;
  verwachteGrootteBytes?: number;
}): { ok: true } | { ok: false; fout: string } {
  const { uitdaging, antwoord } = opties;
  if (!antwoord || antwoord.schema !== 1 || !/^[0-9a-f]{64}$/i.test(antwoord.bewijsHmacHex)) {
    return { ok: false, fout: 'INTEGRITEIT_ANTWOORD_ONGELDIGE_VORM' };
  }
  if (antwoord.blokSha256.toLowerCase() !== uitdaging.blokSha256.toLowerCase()) {
    return { ok: false, fout: 'INTEGRITEIT_SCHIJFBESCHADIGING_OF_VERVALSING' };
  }
  if (
    opties.verwachteGrootteBytes !== undefined
    && antwoord.grootteBytes !== opties.verwachteGrootteBytes
  ) {
    return { ok: false, fout: 'INTEGRITEIT_GROOTTE_KOMT_NIET_OVEREEN' };
  }
  if (opties.verwachteCijfertekst) {
    const verwacht = berekenBlindeIntegriteitBewijs(opties.verwachteCijfertekst, uitdaging.uitdagingNonceHex);
    if (!verwacht.ok) return verwacht;
    const a = Buffer.from(antwoord.bewijsHmacHex, 'hex');
    const b = Buffer.from(verwacht.antwoord.bewijsHmacHex, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, fout: 'INTEGRITEIT_HMAC_BEWIJS_ONGELDIG' };
    }
  }
  return { ok: true };
}

// =================================================================================================
// 2. Спостереження стану без розкриття особистих даних (§21) та класифікація реакції (§22, Док. №10, №11)
// =================================================================================================

export type ImmuunReactieSoort =
  | 'gezond'
  | 'beperk_belasting_en_omleid'          // Тимчасове перевантаження або висока затримка (без карантину!)
  | 'omleid_en_plan_herbouw'              // Недоступність / вимкнення вузла (Протокол втрати вузлів — Документ №10)
  | 'onmiddellijke_quarantaine_en_herbouw'; // Компрометація / пошкодження даних / порушення прав (Документ №11)

/** Одинадцять аспектів спостереження за §21 маніфесту — ЖОДНИХ приватних даних чи вмісту повідомлень! */
export interface KlimopGezondheidsWaarneming {
  knooppuntId: string;
  bereikbaar: boolean;
  integriteitBewijsGeldig: boolean;
  uitgaveIntegriteitOk: boolean;
  stengelAuthentiek: boolean;
  epocheActueel: boolean;
  onafhankelijkeKopieen: number;
  minVereisteOnafhankelijkeKopieen: number;
  vertragingMs: number;
  maxNormaleVertragingMs: number;
  overbelast: boolean;
  herstelPadBeschikbaar: boolean;
  geenOnbevoegdeMachtigingWijziging: boolean;
  geenPersoonlijkeInhoudInTelemetrie: true;
}

export interface KlimopImmuunBeoordeling {
  knooppuntId: string;
  reactie: ImmuunReactieSoort;
  plaatsInQuarantaine: boolean;
  herbouwVereist: boolean;
  redenen: string[];
}

/**
 * Оцінює стан вузла та визначає суворо обмежену реакцію імунної системи (§21–§22):
 *   - криптографічні порушення (підміна підпису стебла, пошкодження зашифрованого блока, спроба несанкціоновано змінити
 *     дозволи чи пошкодження коду випуску) -> миттєвий карантин + відтворення втраченої смуги на іншому вузлі;
 *   - фізичне вимкнення / втрата зв'язку -> перенаправлення маршруту + планова добудова за нестачі копій;
 *   - перевантаження або повільна лінія -> розвантаження без хибного звинувачення в компрометації.
 */
export function beoordeelKnooppuntGezondheid(w: KlimopGezondheidsWaarneming): KlimopImmuunBeoordeling {
  const redenen: string[] = [];

  if (!w.stengelAuthentiek) redenen.push('STENGEL_HANDTEKENING_ONGELDIG');
  if (w.bereikbaar && !w.integriteitBewijsGeldig) redenen.push('VERSLEUTELD_FRAGMENT_BESCHADIGD_OF_VERVALST');
  if (!w.uitgaveIntegriteitOk) redenen.push('UITGAVE_INTEGRITEIT_GESCHONDEN');
  if (!w.geenOnbevoegdeMachtigingWijziging) redenen.push('ONBEVOEGDE_MACHTIGING_WIJZIGING');

  if (redenen.length > 0) {
    return {
      knooppuntId: w.knooppuntId,
      reactie: 'onmiddellijke_quarantaine_en_herbouw',
      plaatsInQuarantaine: true,
      herbouwVereist: true,
      redenen,
    };
  }

  if (!w.bereikbaar) {
    redenen.push('KNOOPPUNT_ONBEREIKBAAR');
    if (w.onafhankelijkeKopieen < w.minVereisteOnafhankelijkeKopieen) {
      redenen.push('TEKORT_AAN_ONAFHANKELIJKE_KOPIEEN');
    }
    return {
      knooppuntId: w.knooppuntId,
      reactie: 'omleid_en_plan_herbouw',
      plaatsInQuarantaine: false,
      herbouwVereist: true,
      redenen,
    };
  }

  if (!w.epocheActueel) redenen.push('CRYPTO_EPOCHE_ACHTEROP');
  if (!w.herstelPadBeschikbaar) redenen.push('GEEN_RESERVE_HERSTELPAD');
  if (w.onafhankelijkeKopieen < w.minVereisteOnafhankelijkeKopieen) {
    redenen.push('TEKORT_AAN_ONAFHANKELIJKE_KOPIEEN');
    return {
      knooppuntId: w.knooppuntId,
      reactie: 'omleid_en_plan_herbouw',
      plaatsInQuarantaine: false,
      herbouwVereist: true,
      redenen,
    };
  }

  if (w.overbelast || w.vertragingMs > w.maxNormaleVertragingMs || redenen.length > 0) {
    if (w.overbelast) redenen.push('KNOOPPUNT_OVERBELAST');
    if (w.vertragingMs > w.maxNormaleVertragingMs) redenen.push('HOGE_NETWERKVERTRAGING');
    return {
      knooppuntId: w.knooppuntId,
      reactie: 'beperk_belasting_en_omleid',
      plaatsInQuarantaine: false,
      herbouwVereist: false,
      redenen,
    };
  }

  return {
    knooppuntId: w.knooppuntId,
    reactie: 'gezond',
    plaatsInQuarantaine: false,
    herbouwVereist: false,
    redenen: [],
  };
}

// =================================================================================================
// 3. Добровільна участь пристроїв (§26–§27) та квоти швидкості самовідновлення (§22 абз. 2–3)
// =================================================================================================

export interface KlimopApparaatBijdrageVoorkeur {
  knooppuntId: string;
  vrijwilligeDeelnameActief: boolean;
  alleenTijdensOpladen: boolean;
  isAanHetOpladen: boolean;
  batterijPercentage: number;
  minBatterijPercentage: number;
  alleenGoedgekeurdeNetwerken: boolean;
  opGoedgekeurdNetwerk: boolean;
  huidigGeheugenGebruikMiB: number;
  maxGeheugenGebruikMiB: number;
  huidigeCpuBelastingPct: number;
  maxCpuBelastingPct: number;
}

/**
 * Перевіряє, чи дозволено залучати пристрій користувача до взаємної підтримки інших вузлів (§26–§27):
 *   - негайно призупиняє фонову участь за низького заряду, відсутності живлення, чужої мережі чи вимкненої згоди;
 *   - КАТЕГОРИЧНО зберігає за людиною повний доступ до її власних даних незалежно від надання ресурсів (§27 абз. 3!).
 */
export function magApparaatBijdragenAanHerstel(voorkeur: KlimopApparaatBijdrageVoorkeur): {
  magNetwerkOndersteunen: boolean;
  toegangTotEigenGegevensBlijftBehouden: true;
  redenIndienGeweigerd: string | null;
} {
  if (!voorkeur.vrijwilligeDeelnameActief) {
    return {
      magNetwerkOndersteunen: false,
      toegangTotEigenGegevensBlijftBehouden: true,
      redenIndienGeweigerd: 'VRIJWILLIGE_DEELNAME_UITGESCHAKELD',
    };
  }
  if (voorkeur.alleenTijdensOpladen && !voorkeur.isAanHetOpladen) {
    return {
      magNetwerkOndersteunen: false,
      toegangTotEigenGegevensBlijftBehouden: true,
      redenIndienGeweigerd: 'APPARAAT_NIET_AAN_OPLADER',
    };
  }
  if (voorkeur.batterijPercentage < voorkeur.minBatterijPercentage) {
    return {
      magNetwerkOndersteunen: false,
      toegangTotEigenGegevensBlijftBehouden: true,
      redenIndienGeweigerd: 'LAGE_BATTERIJLADING',
    };
  }
  if (voorkeur.alleenGoedgekeurdeNetwerken && !voorkeur.opGoedgekeurdNetwerk) {
    return {
      magNetwerkOndersteunen: false,
      toegangTotEigenGegevensBlijftBehouden: true,
      redenIndienGeweigerd: 'NETWERK_NIET_GOEDGEKEURD_VOOR_ACHTERGROND',
    };
  }
  if (
    voorkeur.huidigGeheugenGebruikMiB > voorkeur.maxGeheugenGebruikMiB
    || voorkeur.huidigeCpuBelastingPct > voorkeur.maxCpuBelastingPct
  ) {
    return {
      magNetwerkOndersteunen: false,
      toegangTotEigenGegevensBlijftBehouden: true,
      redenIndienGeweigerd: 'APPARAAT_BRONLIMIET_BEREIKT',
    };
  }

  return {
    magNetwerkOndersteunen: true,
    toegangTotEigenGegevensBlijftBehouden: true,
    redenIndienGeweigerd: null,
  };
}

export interface KlimopZelfherstelQuotaBeleid {
  maxHerbouwBytesPerVenster: number;
  maxGelijktijdigeHerbouwTaken: number;
  zelfherstelMagGeenBevoegdhedenUitbreiden: true;
}

/**
 * Перевіряє, чи автоматична дія самовідновлення не виходить за погоджені квоти трафіку/завдань
 * і чи спирається виключно на вже підписаний дійсний мандат без самовільного розширення прав (§22 абз. 2–3).
 */
export function controleerZelfherstelQuota(opties: {
  beleid: KlimopZelfherstelQuotaBeleid;
  reedsVerbruikteBytesInVenster: number;
  aangevraagdeHerbouwBytes: number;
  actieveHerbouwTaken: number;
  bestaandMandaatVoorReserveKnoop: KlimopOndertekendMandaat | null | undefined;
}): { toegestaan: true } | { toegestaan: false; fout: string } {
  if (!opties.bestaandMandaatVoorReserveKnoop) {
    return { toegestaan: false, fout: 'ZELFHERSTEL_MAG_GEEN_NIEUWE_BEVOEGDHEDEN_AANMAKEN' };
  }
  if (opties.actieveHerbouwTaken >= opties.beleid.maxGelijktijdigeHerbouwTaken) {
    return { toegestaan: false, fout: 'ZELFHERSTEL_TAAKLIMIET_BEREIKT' };
  }
  if (
    opties.reedsVerbruikteBytesInVenster + opties.aangevraagdeHerbouwBytes
    > opties.beleid.maxHerbouwBytesPerVenster
  ) {
    return { toegestaan: false, fout: 'ZELFHERSTEL_BANDWIDTH_QUOTA_BEREIKT' };
  }
  return { toegestaan: true };
}

// =================================================================================================
// 4. Десять обов'язкових аварійних сценаріїв перевірки живучості (§37) та вимірювані гарантії (§41)
// =================================================================================================

export const KLIMOP_OVERLEVINGS_SCENARIOS = Object.freeze([
  'uitschakeling_hoofdserver',                // 1. Вимкнення головного сервера
  'verlies_een_onafhankelijk_knooppunt',      // 2. Втрата одного незалежного вузла
  'gelijktijdig_verlies_meerdere_knooppunten', // 3. Одночасна втрата кількох вузлів у межах моделі відмов (до m)
  'netwerk_splitsing',                        // 4. Розділення мережі
  'uitval_verbindingsaanbieder',              // 5. Втрата постачальника зв'язку
  'onbereikbaarheid_opstartknooppunten',      // 6. Недоступність початкових вузлів під'єднання
  'beschadiging_versleutelde_fragmenten',     // 7. Пошкодження зашифрованих частин
  'tekort_aan_onafhankelijke_kopieen',        // 8. Нестача незалежних копій
  'verdwijning_eigenaar_uit_bestuur',         // 9. Зникнення власника з процесу керування
  'verlies_gebruikersapparaten',              // 10. Втрата пристроїв користувача
] as const);

export type OverlevingsScenarioId = (typeof KLIMOP_OVERLEVINGS_SCENARIOS)[number];

/** Чотири обов'язкові виміри для кожного з 10 сценаріїв живучості за §37 абз. 2 та §41 маніфесту! */
export interface KlimopOverlevingsMeting {
  scenarioId: OverlevingsScenarioId;
  beschikbaarGebleven: boolean;
  herstelDuurMs: number;
  maxToegestaneHerstelDuurMs: number;
  gegevensVerliesBytes: number;
  machtigingenCorrectGebleven: boolean;
  bewijsSamenvatting: string;
}

export interface OverlevingsProefProgrammaOordeel {
  geslaagd: boolean;
  gedekteScenarios: number;
  ontbrekendeScenarios: OverlevingsScenarioId[];
  gefaaldeScenarios: Array<{ scenarioId: OverlevingsScenarioId; redenen: string[] }>;
}

/**
 * Перевіряє повноту та успішність виконання всієї 10-пунктової програми перевірки живучості (§37, §41, Документ №18):
 * жоден сценарій не може бути пропущений, у жодному не допускається втрата даних (> 0 байт), порушення дозволів
 * чи перевищення граничного часу відновлення!
 */
export function beoordeelOverlevingsProefProgramma(
  metingen: readonly KlimopOverlevingsMeting[],
): OverlevingsProefProgrammaOordeel {
  const perScenario = new Map<OverlevingsScenarioId, KlimopOverlevingsMeting>();
  for (const m of metingen) {
    perScenario.set(m.scenarioId, m);
  }

  const ontbrekendeScenarios: OverlevingsScenarioId[] = [];
  const gefaaldeScenarios: Array<{ scenarioId: OverlevingsScenarioId; redenen: string[] }> = [];

  for (const id of KLIMOP_OVERLEVINGS_SCENARIOS) {
    const m = perScenario.get(id);
    if (!m) {
      ontbrekendeScenarios.push(id);
      continue;
    }
    const redenen: string[] = [];
    if (!m.beschikbaarGebleven) redenen.push('DIENST_NIET_BESCHIKBAAR_GEBLEVEN');
    if (m.herstelDuurMs < 0 || m.herstelDuurMs > m.maxToegestaneHerstelDuurMs) {
      redenen.push('HERSTELDUUR_OVERSCHRIJDT_GARANTIE');
    }
    if (m.gegevensVerliesBytes !== 0) {
      redenen.push('GEGEVENSVERLIES_GEDETECTEERD');
    }
    if (!m.machtigingenCorrectGebleven) {
      redenen.push('MACHTIGINGEN_GESCHONDEN_TIJDENS_HERSTEL');
    }
    if (!m.bewijsSamenvatting || m.bewijsSamenvatting.trim().length < 8) {
      redenen.push('BEWIJS_ONTBREEKT');
    }
    if (redenen.length > 0) {
      gefaaldeScenarios.push({ scenarioId: id, redenen });
    }
  }

  return {
    geslaagd: ontbrekendeScenarios.length === 0 && gefaaldeScenarios.length === 0,
    gedekteScenarios: KLIMOP_OVERLEVINGS_SCENARIOS.length - ontbrekendeScenarios.length,
    ontbrekendeScenarios,
    gefaaldeScenarios,
  };
}
