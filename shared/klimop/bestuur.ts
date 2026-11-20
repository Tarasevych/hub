// KLIMOP-007 (20.11.2026, Етап 6 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Розподілене порогове керування, 7 незалежних категорій повноважень, захисні часові замки та безпечні хвильові випуски
// (§2, §18–§20, §23–§25, §32, §34, §36 Етап 6, §40; обов'язкові Документи №8 та №14 за §44 маніфесту):
//   1. Сім розмежованих категорій повноважень без одноосібної влади та без влади випадкової більшості вузлів (§2, §19);
//   2. Сувора заборона одному суб'єктові чи ШІ-агенту одноосібно пропонувати й затверджувати критичну зміну (§32, §34);
//   3. Обов'язкові часові замки (24/48/72 год) для ризикових рішень при 0 год затримки для пошти, файлів і календаря (§20),
//      а також незмінний геш-пов'язаний журнал критичних рішень із перевіркою порогових підписів FROST (RFC 9591);
//   4. Чотирирівнева перевірка метаданих випуску (корінь довіри FROST, цільовий артефакт + підписаний вебклієнт, монотонний
//      знімок версії проти відкочування та короткоживуче свідоцтво свіжості проти заморожування, §25);
//   5. Хвильове поширення оновлень з перевіркою 4 показників здоров'я та безпеки (запуск, цілісність даних, правильність
//      дозволів, відсутність витоку секретів) і автоматичним припиненням та поверненням стану при збої першої хвилі (§24).

import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { canoniekeJson, controleerKnooppuntOnafhankelijkheid, type KlimopKnooppuntIdentiteit } from './kern';
import { verifieerStandaardEd25519Handtekening } from './drempelsleutels';

// =================================================================================================
// 1. Сім незалежних категорій повноважень (§19) та конституція спільного керування (§18–§20)
// =================================================================================================

export type BestuursBevoegdheidCategorie =
  | 'eigen_gegevens_rechten'           // 1. Користувацькі права над власними даними (0 год затримки)
  | 'persoonlijk_apparaat_beheer'      // 2. Керування особистими пристроями (0 год затримки)
  | 'operationeel_knooppunt_beheer'    // 3. Операційне керування конкретним вузлом (0 год затримки на власному вузлі)
  | 'software_onderhoud'               // 4. Супровід програмного забезпечення (лише пропозиція, ніколи не самовстановлення!)
  | 'cryptografische_goedkeuring_kritiek' // 5. Криптографічне підтвердження критичних змін (кворум FROST + >= 24 год)
  | 'noodherstel_bestuur'              // 6. Надзвичайне відновлення системних ролей (кворум FROST + >= 48 год)
  | 'ecosysteem_regels_wijziging';     // 7. Зміна правил усієї екосистеми / заміна кореня довіри (кворум FROST + >= 72 год)

export const ALLE_BESTUURS_CATEGORIEEN = Object.freeze<readonly BestuursBevoegdheidCategorie[]>([
  'eigen_gegevens_rechten',
  'persoonlijk_apparaat_beheer',
  'operationeel_knooppunt_beheer',
  'software_onderhoud',
  'cryptografische_goedkeuring_kritiek',
  'noodherstel_bestuur',
  'ecosysteem_regels_wijziging',
]);

export interface CategorieBeleidRegel {
  categorie: BestuursBevoegdheidCategorie;
  vereistFrostQuorum: boolean;
  minimaleWachttijdUren: number;
  magDoorAiAgentZelfstandigWordenGoedgekeurd: false;
  magPersoonlijkeGeheimeGegevensLezen: boolean;
}

/** Нормативна матриця 7 категорій повноважень (§19–§20 маніфесту): щоденні дії користувача мають 0 год затримки! */
export const STANDAARD_CATEGORIE_BELEID: Readonly<Record<BestuursBevoegdheidCategorie, CategorieBeleidRegel>> = Object.freeze({
  eigen_gegevens_rechten: {
    categorie: 'eigen_gegevens_rechten',
    vereistFrostQuorum: false,
    minimaleWachttijdUren: 0,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: true, // Виключно сам власник своїх даних!
  },
  persoonlijk_apparaat_beheer: {
    categorie: 'persoonlijk_apparaat_beheer',
    vereistFrostQuorum: false,
    minimaleWachttijdUren: 0,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: false,
  },
  operationeel_knooppunt_beheer: {
    categorie: 'operationeel_knooppunt_beheer',
    vereistFrostQuorum: false,
    minimaleWachttijdUren: 0,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: false,
  },
  software_onderhoud: {
    categorie: 'software_onderhoud',
    vereistFrostQuorum: false,
    minimaleWachttijdUren: 0,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: false,
  },
  cryptografische_goedkeuring_kritiek: {
    categorie: 'cryptografische_goedkeuring_kritiek',
    vereistFrostQuorum: true,
    minimaleWachttijdUren: 24,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: false,
  },
  noodherstel_bestuur: {
    categorie: 'noodherstel_bestuur',
    vereistFrostQuorum: true,
    minimaleWachttijdUren: 48,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: false,
  },
  ecosysteem_regels_wijziging: {
    categorie: 'ecosysteem_regels_wijziging',
    vereistFrostQuorum: true,
    minimaleWachttijdUren: 72,
    magDoorAiAgentZelfstandigWordenGoedgekeurd: false,
    magPersoonlijkeGeheimeGegevensLezen: false,
  },
});

export interface KlimopBestuursGrondwet {
  schema: 1;
  grondwetId: string;
  versieVolgnummer: number;
  frostSetId: string;
  frostGroepsPubliekeSleutelHex: string; // 64 hex (Ed25519 публічний ключ ради хранителів)
  drempel: number;
  totaalHoeders: number;
  erkendeHoeders: readonly KlimopKnooppuntIdentiteit[];
  /** Публічний ключ Ed25519 аварійного перехідного вето власника (діє лише для зупинки небезпечної зміни, не для одноосібного обходу!). */
  overgangsNoodVetoPubDerB64u: string | null;
  vastgesteldOp: string;
}

const VOORSTEL_DOMEIN = 'klimop-bestuur-voorstel-v1|';
const VETO_DOMEIN = 'klimop-bestuur-noodveto-v1|';
const BESLUIT_FROST_DOMEIN = 'klimop-bestuur-frost-besluit-v1|';
const DOELEN_ROL_DOMEIN = 'klimop-uitgave-doelenrol-v1|';
const WEBCLIENT_DOMEIN = 'klimop-uitgave-webclient-v1|';
const MOMENTOPNAME_FROST_DOMEIN = 'klimop-uitgave-momentopname-frost-v1|';
const TIJDSTEMPEL_ROL_DOMEIN = 'klimop-uitgave-tijdstempelrol-v1|';

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
 * Створює та перевіряє конституцію спільного керування:
 * відсікає одноосібну владу (drempel >= 2), відсікає випадкову більшість тимчасових вузлів
 * (хранителями можуть бути лише постійні незалежні вузли або особисті пристрої в різних юрисдикціях!).
 */
export function maakBestuursGrondwet(opties: {
  grondwetId: string;
  versieVolgnummer?: number;
  frostSetId: string;
  frostGroepsPubliekeSleutelHex: string;
  drempel: number;
  erkendeHoeders: readonly KlimopKnooppuntIdentiteit[];
  overgangsNoodVetoPubDerB64u?: string | null;
  nuIso?: string;
}): { ok: true; grondwet: KlimopBestuursGrondwet } | { ok: false; fout: string; details?: string[] } {
  if (opties.drempel < 2 || opties.erkendeHoeders.length < opties.drempel) {
    return { ok: false, fout: 'GRONDWET_DREMPEL_VERBIEDT_EENPERSOONSMACHT' };
  }
  if (!/^[0-9a-f]{64}$/i.test(opties.frostGroepsPubliekeSleutelHex)) {
    return { ok: false, fout: 'GRONDWET_ONGELDIGE_FROST_GROEPSSLEUTEL' };
  }
  // Заборона передавати критичні права випадковій більшості перехідних або вузькоспеціалізованих вузлів (§2, §19, §43 п. 7)
  if (
    opties.erkendeHoeders.some(
      (h) => h.type === 'tijdelijke_toetredingsknooppunten' || h.type === 'gespecialiseerde_knooppunten',
    )
  ) {
    return { ok: false, fout: 'WILLEKEURIGE_MEERDERHEID_GEEN_GROND_VOOR_BESTUUR' };
  }

  const spreiding = controleerKnooppuntOnafhankelijkheid(opties.erkendeHoeders, opties.drempel);
  if (!spreiding.ok) {
    return { ok: false, fout: 'GRONDWET_HOEDERS_NIET_ONAFHANKELIJK', details: spreiding.fouten };
  }

  return {
    ok: true,
    grondwet: {
      schema: 1,
      grondwetId: opties.grondwetId,
      versieVolgnummer: opties.versieVolgnummer ?? 1,
      frostSetId: opties.frostSetId,
      frostGroepsPubliekeSleutelHex: opties.frostGroepsPubliekeSleutelHex.toLowerCase(),
      drempel: opties.drempel,
      totaalHoeders: opties.erkendeHoeders.length,
      erkendeHoeders: opties.erkendeHoeders,
      overgangsNoodVetoPubDerB64u: opties.overgangsNoodVetoPubDerB64u ?? null,
      vastgesteldOp: opties.nuIso ?? new Date().toISOString(),
    },
  };
}

// =================================================================================================
// 2. Пропозиції критичних рішень, захисні часові замки (§20), заборона самосхвалення (§32) і журнал
// =================================================================================================

export type IndienerSoort = 'menselijke_deelnemer' | 'ai_agent';

export interface KlimopBestuursVoorstelKern {
  schema: 1;
  voorstelId: string;
  grondwetId: string;
  categorie: BestuursBevoegdheidCategorie;
  onderwerpSamenvatting: string;
  inhoudSha256: string;
  indienerSoort: IndienerSoort;
  indienerId: string; // persoonsId, knooppuntId або ідентифікатор агента (напр. 'agent:antigravity')
  indienerHoederIndex: number | null; // якщо ініціатор є одним із хранителів, він НЕ може одноосібно закрити кворум сам із собою
  ingediendOp: string;
  wachttijdUren: number;
  uitvoerbaarVanaf: string;
}

export interface KlimopBestuursVoorstel extends KlimopBestuursVoorstelKern {
  indienerPubDerB64u: string;
  indienerHandtekeningB64u: string;
  staat: 'wacht_op_tijdslot_en_quorum' | 'gevetood_in_wachttijd' | 'bekrachtigd';
  noodVetoBewijs: {
    gevetoodOp: string;
    reden: string;
    handtekeningB64u: string;
  } | null;
}

export interface KlimopBekrachtigdBestuursBesluit {
  schema: 1;
  volgnummer: number;
  vorigeBesluitSha256: string;
  voorstel: KlimopBestuursVoorstel;
  bekrachtigdOp: string;
  frostOndertekenaarIndexen: readonly number[];
  frostHandtekeningHex: string; // 128 hex (64 байти Ed25519 за RFC 9591)
  besluitSha256: string;
}

/**
 * Створює підписану пропозицію рішення керування та автоматично призначає обов'язковий часовий замок (§20):
 * - 0 год для щоденних користувацьких дій та особистих пристроїв;
 * - >= 24 год для критичних змін;
 * - >= 48 год для надзвичайного відновлення ролей;
 * - >= 72 год для зміни правил екосистеми або заміни кореневих ключів.
 * Будь-яка спроба занизити часовий замок автоматично піднімається до конституційного мінімуму (§20 абз. 4!).
 */
export function maakBestuursVoorstel(opties: {
  grondwet: KlimopBestuursGrondwet;
  categorie: BestuursBevoegdheidCategorie;
  onderwerpSamenvatting: string;
  inhoudPayload: unknown;
  indienerSoort: IndienerSoort;
  indienerId: string;
  indienerHoederIndex?: number | null;
  indienerSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  aangevraagdeWachttijdUren?: number;
  nuIso?: string;
}): KlimopBestuursVoorstel {
  const regel = STANDAARD_CATEGORIE_BELEID[opties.categorie];
  // Захист від спроби обійти часовий замок зміною параметрів пропозиції (§20)
  const wachttijdUren = Math.max(regel.minimaleWachttijdUren, opties.aangevraagdeWachttijdUren ?? regel.minimaleWachttijdUren);
  const ingediendOp = opties.nuIso ?? new Date().toISOString();
  const uitvoerbaarVanaf = new Date(Date.parse(ingediendOp) + wachttijdUren * 3600 * 1000).toISOString();
  const inhoudSha256 = createHash('sha256').update(canoniekeJson(opties.inhoudPayload), 'utf8').digest('hex');

  const kern: KlimopBestuursVoorstelKern = {
    schema: 1,
    voorstelId: `bst_${randomBytes(12).toString('hex')}`,
    grondwetId: opties.grondwet.grondwetId,
    categorie: opties.categorie,
    onderwerpSamenvatting: opties.onderwerpSamenvatting,
    inhoudSha256,
    indienerSoort: opties.indienerSoort,
    indienerId: opties.indienerId,
    indienerHoederIndex: opties.indienerHoederIndex ?? null,
    ingediendOp,
    wachttijdUren,
    uitvoerbaarVanaf,
  };

  const indienerHandtekeningB64u = tekenEd25519Der(
    opties.indienerSleutels.geheimeSleutelPkcs8B64u,
    Buffer.from(VOORSTEL_DOMEIN + canoniekeJson(kern), 'utf8'),
  );

  return {
    ...kern,
    indienerPubDerB64u: opties.indienerSleutels.publiekeSleutelDerB64u,
    indienerHandtekeningB64u,
    staat: 'wacht_op_tijdslot_en_quorum',
    noodVetoBewijs: null,
  };
}

/** Формує канонічне повідомлення пропозиції, яке підписується пороговим кворумом FROST після спливу часового замка. */
export function maakFrostBesluitBoodschap(voorstel: KlimopBestuursVoorstel, bekrachtigdOp: string): Buffer {
  const { indienerPubDerB64u, indienerHandtekeningB64u, staat: _s, noodVetoBewijs: _v, ...kern } = voorstel;
  return Buffer.from(
    BESLUIT_FROST_DOMEIN + canoniekeJson({ kern, indienerPubDerB64u, indienerHandtekeningB64u, bekrachtigdOp }),
    'utf8',
  );
}

/**
 * Дозволяє накласти підписане аварійне вето під час перехідного часового вікна очікування
 * (зупиняє скомпрометовану або помилкову критичну зміну до набуття нею чинності).
 */
export function pasOvergangsNoodVetoToe(opties: {
  grondwet: KlimopBestuursGrondwet;
  voorstel: KlimopBestuursVoorstel;
  reden: string;
  vetoGeheimPkcs8B64u: string;
  nuIso?: string;
}): { ok: true; gevetoodVoorstel: KlimopBestuursVoorstel } | { ok: false; fout: string } {
  if (!opties.grondwet.overgangsNoodVetoPubDerB64u) {
    return { ok: false, fout: 'GEEN_OVERGANGSVETO_INGESTELD' };
  }
  if (opties.voorstel.staat === 'bekrachtigd') {
    return { ok: false, fout: 'BESLUIT_REEDS_BEKRACHTIGD' };
  }
  const gevetoodOp = opties.nuIso ?? new Date().toISOString();
  const boodschap = Buffer.from(
    VETO_DOMEIN + canoniekeJson({ voorstelId: opties.voorstel.voorstelId, gevetoodOp, reden: opties.reden }),
    'utf8',
  );
  const sig = tekenEd25519Der(opties.vetoGeheimPkcs8B64u, boodschap);
  if (!verifieerEd25519Der(opties.grondwet.overgangsNoodVetoPubDerB64u, boodschap, sig)) {
    return { ok: false, fout: 'NOODVETO_HANDTEKENING_ONGELDIG' };
  }

  return {
    ok: true,
    gevetoodVoorstel: {
      ...opties.voorstel,
      staat: 'gevetood_in_wachttijd',
      noodVetoBewijs: { gevetoodOp, reden: opties.reden, handtekeningB64u: sig },
    },
  };
}

/**
 * Перевіряє та затверджує критичне рішення керування у незмінний геш-пов'язаний журнал:
 *   - блокує одноосібне затвердження або самосхвалення ШІ-агента (§18, §32, §34);
 *   - перевіряє повний сплив часового замка очікування (§20);
 *   - перевіряє відсутність накладеного аварійного вето;
 *   - перевіряє пороговий підпис FROST(Ed25519, SHA-512) від щонайменше `drempel` незалежних хранителів.
 */
export function bekrachtigBestuursBesluitMetFrost(opties: {
  grondwet: KlimopBestuursGrondwet;
  bestaandLogboek: readonly KlimopBekrachtigdBestuursBesluit[];
  voorstel: KlimopBestuursVoorstel;
  frostOndertekenaarIndexen: readonly number[];
  frostHandtekeningHex: string;
  bekrachtigdOp?: string;
}): { ok: true; besluit: KlimopBekrachtigdBestuursBesluit } | { ok: false; fout: string } {
  const { grondwet, voorstel } = opties;
  if (voorstel.grondwetId !== grondwet.grondwetId) {
    return { ok: false, fout: 'VOORSTEL_GRONDWET_KOMT_NIET_OVEREEN' };
  }
  if (voorstel.staat === 'gevetood_in_wachttijd' || voorstel.noodVetoBewijs) {
    return { ok: false, fout: 'VOORSTEL_IS_GEVETOOD' };
  }

  const { indienerPubDerB64u, indienerHandtekeningB64u, staat: _s, noodVetoBewijs: _v, ...voorstelKern } = voorstel;
  if (!verifieerEd25519Der(indienerPubDerB64u, Buffer.from(VOORSTEL_DOMEIN + canoniekeJson(voorstelKern), 'utf8'), indienerHandtekeningB64u)) {
    return { ok: false, fout: 'VOORSTEL_INDIENER_HANDTEKENING_ONGELDIG' };
  }

  const regel = STANDAARD_CATEGORIE_BELEID[voorstel.categorie];
  if (!regel.vereistFrostQuorum) {
    return { ok: false, fout: 'CATEGORIE_HOORT_NIET_BIJ_SYSTEEMBESTUUR' };
  }

  // Заборона одноосібного схвалення або ситуації, де ініціатор є єдиним іншим учасником без незалежного кворуму (§18, §32)
  const uniekeIndexen = [...new Set(opties.frostOndertekenaarIndexen)].sort((a, b) => a - b);
  if (uniekeIndexen.length < grondwet.drempel) {
    return { ok: false, fout: 'EENPERSOONS_OF_ONVOLDOENDE_QUORUM_GEWEIGERD' };
  }
  if (voorstel.indienerSoort === 'ai_agent' && uniekeIndexen.length < grondwet.drempel) {
    return { ok: false, fout: 'EENPERSOONS_OF_AGENT_ZELFGOEDKEURING_GEWEIGERD' };
  }
  // Навіть якщо ініціатор сам є одним із хранителів, крім нього мусить підписати щонайменше ще один незалежний хранитель!
  const andereHoeders = uniekeIndexen.filter((idx) => idx !== voorstel.indienerHoederIndex);
  if (andereHoeders.length === 0) {
    return { ok: false, fout: 'EENPERSOONS_OF_AGENT_ZELFGOEDKEURING_GEWEIGERD' };
  }

  const bekrachtigdOp = opties.bekrachtigdOp ?? new Date().toISOString();
  const minVereistMs = Date.parse(voorstel.ingediendOp) + regel.minimaleWachttijdUren * 3600 * 1000;
  if (Date.parse(bekrachtigdOp) < Math.max(Date.parse(voorstel.uitvoerbaarVanaf), minVereistMs)) {
    return { ok: false, fout: 'BESTUUR_TIJDSLOT_NOG_NIET_VERSTREKEN' };
  }

  const frostBoodschap = maakFrostBesluitBoodschap(voorstel, bekrachtigdOp);
  if (!verifieerStandaardEd25519Handtekening(frostBoodschap, opties.frostHandtekeningHex, grondwet.frostGroepsPubliekeSleutelHex)) {
    return { ok: false, fout: 'BESTUUR_FROST_HANDTEKENING_ONGELDIG' };
  }

  const vorige = opties.bestaandLogboek[opties.bestaandLogboek.length - 1];
  const vorigeBesluitSha256 = vorige ? vorige.besluitSha256 : '0'.repeat(64);
  const volgnummer = opties.bestaandLogboek.length + 1;
  const bekrachtigdVoorstel: KlimopBestuursVoorstel = { ...voorstel, staat: 'bekrachtigd' };

  const besluitKern = {
    schema: 1 as const,
    volgnummer,
    vorigeBesluitSha256,
    voorstel: bekrachtigdVoorstel,
    bekrachtigdOp,
    frostOndertekenaarIndexen: uniekeIndexen,
    frostHandtekeningHex: opties.frostHandtekeningHex.toLowerCase(),
  };
  const besluitSha256 = createHash('sha256').update(canoniekeJson(besluitKern), 'utf8').digest('hex');

  return {
    ok: true,
    besluit: {
      ...besluitKern,
      besluitSha256,
    },
  };
}

/** Перевіряє цілісність усього геш-пов'язаного журналу критичних рішень керування. */
export function verifieerBestuursBesluitLogboek(
  grondwet: KlimopBestuursGrondwet,
  logboek: readonly KlimopBekrachtigdBestuursBesluit[],
): { ok: true } | { ok: false; fout: string; foutiefVolgnummer?: number } {
  let verwachteVorige = '0'.repeat(64);
  for (let i = 0; i < logboek.length; i++) {
    const item = logboek[i];
    if (item.volgnummer !== i + 1 || item.vorigeBesluitSha256 !== verwachteVorige) {
      return { ok: false, fout: 'BESLUITLOGBOEK_KETEN_GEBROKEN', foutiefVolgnummer: i + 1 };
    }
    const { besluitSha256, ...kern } = item;
    const berekend = createHash('sha256').update(canoniekeJson(kern), 'utf8').digest('hex');
    if (berekend !== besluitSha256) {
      return { ok: false, fout: 'BESLUITLOGBOEK_HASH_ONGELDIG', foutiefVolgnummer: i + 1 };
    }
    const frostBoodschap = maakFrostBesluitBoodschap(item.voorstel, item.bekrachtigdOp);
    if (!verifieerStandaardEd25519Handtekening(frostBoodschap, item.frostHandtekeningHex, grondwet.frostGroepsPubliekeSleutelHex)) {
      return { ok: false, fout: 'BESLUITLOGBOEK_FROST_HANDTEKENING_ONGELDIG', foutiefVolgnummer: i + 1 };
    }
    verwachteVorige = besluitSha256;
  }
  return { ok: true };
}

// =================================================================================================
// 3. Безпечні підписані випуски з розділенням ролей (на зразок TUF), свіжістю та підписом вебклієнта (§24–§25)
// =================================================================================================

export interface KlimopWebClientManifest {
  schema: 1;
  versieLabel: string;
  webClientBundelSha256: string;
  afhankelijkhedenBoomSha256: string;
  bouwerPubDerB64u: string;
  bouwerHandtekeningB64u: string;
}

export interface KlimopUitgaveDoelenMetadata {
  schema: 1;
  versieLabel: string;
  uitgaveVolgnummer: number;
  minCompatibelVolgnummer: number; // Межа сумісності сусідніх версій між вузлами під час хвильового оновлення (§40 п. 6)
  pakketSha256: string;
  bronCommitSha40: string;
  ontwikkelarchiefSha256: string; // Зв'язок із TRACE-001
  webClientManifest: KlimopWebClientManifest;
  isOnomkeerbareMigratie: boolean;
  onomkeerbareHerstelProcedureId: string | null; // Обов'язкове поле для незворотних змін (§24 абз. 4!)
  auteurSoort: IndienerSoort;
  auteurId: string;
  doelenRolPubDerB64u: string;
  doelenRolHandtekeningB64u: string;
}

export interface KlimopUitgaveMomentopnameMetadata {
  schema: 1;
  grondwetId: string;
  uitgaveVolgnummer: number;
  doelenMetadataSha256: string;
  frostOndertekenaarIndexen: readonly number[];
  frostHandtekeningHex: string; // Пороговий підпис FROST ради керування (не одного збирача!)
}

export interface KlimopUitgaveTijdstempelMetadata {
  schema: 1;
  uitgaveVolgnummer: number;
  momentopnameSha256: string;
  uitgegevenOp: string;
  verlooptOp: string; // Коротке вікно свіжості проти freeze-атаки (напр. 24–72 год)
  tijdstempelRolPubDerB64u: string;
  tijdstempelRolHandtekeningB64u: string;
}

export interface KlimopVolledigeUitgaveBundel {
  doelen: KlimopUitgaveDoelenMetadata;
  momentopname: KlimopUitgaveMomentopnameMetadata;
  tijdstempel: KlimopUitgaveTijdstempelMetadata;
}

/** Чотири обов'язкові критерії працездатності та безпеки хвилі випуску (§24 абз. 5–6 маніфесту!). */
export interface KlimopUitrolGezondheidsMeting {
  procesGestart: boolean;
  gegevensIntegriteitOk: boolean;
  machtigingenGeldigOk: boolean;
  geenGeheimLekGedetecteerd: boolean;
  foutReden?: string;
}

export function beoordeelUitrolGezondheid(meting: KlimopUitrolGezondheidsMeting): {
  gezond: boolean;
  gefaaldeControles: string[];
} {
  const gefaaldeControles: string[] = [];
  if (!meting.procesGestart) gefaaldeControles.push('PROCES_NIET_GESTART');
  if (!meting.gegevensIntegriteitOk) gefaaldeControles.push('GEGEVENSINTEGRITEIT_GESCHONDEN');
  if (!meting.machtigingenGeldigOk) gefaaldeControles.push('MACHTIGINGEN_ONGELDIG');
  if (!meting.geenGeheimLekGedetecteerd) gefaaldeControles.push('GEHEIMLEK_GEDETECTEERD');
  return { gezond: gefaaldeControles.length === 0, gefaaldeControles };
}

/** Підписує маніфест вебклієнта та цільові метадані випуску роллю складання (`doelenRol`). */
export function maakUitgaveDoelenMetadata(opties: {
  versieLabel: string;
  uitgaveVolgnummer: number;
  minCompatibelVolgnummer: number;
  pakketInhoud: Buffer;
  webClientBundelInhoud: Buffer;
  afhankelijkhedenBoomSha256: string;
  bronCommitSha40: string;
  ontwikkelarchiefSha256: string;
  isOnomkeerbareMigratie?: boolean;
  onomkeerbareHerstelProcedureId?: string | null;
  auteurSoort: IndienerSoort;
  auteurId: string;
  doelenRolSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
}): KlimopUitgaveDoelenMetadata {
  if (opties.uitgaveVolgnummer < 1 || opties.minCompatibelVolgnummer > opties.uitgaveVolgnummer) {
    throw new Error('UITGAVE_VOLGNUMMERS_ONGELDIG');
  }
  if (opties.isOnomkeerbareMigratie && !opties.onomkeerbareHerstelProcedureId) {
    throw new Error('ONOMKEERBARE_UITGAVE_MIST_HERSTELPROCEDURE');
  }

  const webClientBundelSha256 = createHash('sha256').update(opties.webClientBundelInhoud).digest('hex');
  const webKern = {
    schema: 1 as const,
    versieLabel: opties.versieLabel,
    webClientBundelSha256,
    afhankelijkhedenBoomSha256: opties.afhankelijkhedenBoomSha256,
    bouwerPubDerB64u: opties.doelenRolSleutels.publiekeSleutelDerB64u,
  };
  const webClientManifest: KlimopWebClientManifest = {
    ...webKern,
    bouwerHandtekeningB64u: tekenEd25519Der(
      opties.doelenRolSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(WEBCLIENT_DOMEIN + canoniekeJson(webKern), 'utf8'),
    ),
  };

  const pakketSha256 = createHash('sha256').update(opties.pakketInhoud).digest('hex');
  const doelenKern = {
    schema: 1 as const,
    versieLabel: opties.versieLabel,
    uitgaveVolgnummer: opties.uitgaveVolgnummer,
    minCompatibelVolgnummer: opties.minCompatibelVolgnummer,
    pakketSha256,
    bronCommitSha40: opties.bronCommitSha40,
    ontwikkelarchiefSha256: opties.ontwikkelarchiefSha256,
    webClientManifest,
    isOnomkeerbareMigratie: Boolean(opties.isOnomkeerbareMigratie),
    onomkeerbareHerstelProcedureId: opties.onomkeerbareHerstelProcedureId ?? null,
    auteurSoort: opties.auteurSoort,
    auteurId: opties.auteurId,
    doelenRolPubDerB64u: opties.doelenRolSleutels.publiekeSleutelDerB64u,
  };

  return {
    ...doelenKern,
    doelenRolHandtekeningB64u: tekenEd25519Der(
      opties.doelenRolSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(DOELEN_ROL_DOMEIN + canoniekeJson(doelenKern), 'utf8'),
    ),
  };
}

/** Обчислює канонічне повідомлення знімка випуску (`momentopname`) для порогового підписування FROST. */
export function maakMomentopnameFrostBoodschap(
  grondwetId: string,
  doelen: KlimopUitgaveDoelenMetadata,
): { boodschap: Buffer; doelenMetadataSha256: string } {
  const doelenMetadataSha256 = createHash('sha256').update(canoniekeJson(doelen), 'utf8').digest('hex');
  const boodschap = Buffer.from(
    MOMENTOPNAME_FROST_DOMEIN
      + canoniekeJson({
        grondwetId,
        uitgaveVolgnummer: doelen.uitgaveVolgnummer,
        doelenMetadataSha256,
      }),
    'utf8',
  );
  return { boodschap, doelenMetadataSha256 };
}

/** Випускає короткоживуче свідоцтво свіжості (`tijdstempelRol`) проти атаки заморожування старих метаданих (§25). */
export function maakUitgaveTijdstempelMetadata(opties: {
  momentopname: KlimopUitgaveMomentopnameMetadata;
  tijdstempelRolSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
  geldigheidUren?: number;
}): KlimopUitgaveTijdstempelMetadata {
  const uitgegevenOp = opties.nuIso ?? new Date().toISOString();
  const uren = Math.max(1, opties.geldigheidUren ?? 48);
  const verlooptOp = new Date(Date.parse(uitgegevenOp) + uren * 3600 * 1000).toISOString();
  const momentopnameSha256 = createHash('sha256').update(canoniekeJson(opties.momentopname), 'utf8').digest('hex');

  const kern = {
    schema: 1 as const,
    uitgaveVolgnummer: opties.momentopname.uitgaveVolgnummer,
    momentopnameSha256,
    uitgegevenOp,
    verlooptOp,
    tijdstempelRolPubDerB64u: opties.tijdstempelRolSleutels.publiekeSleutelDerB64u,
  };

  return {
    ...kern,
    tijdstempelRolHandtekeningB64u: tekenEd25519Der(
      opties.tijdstempelRolSleutels.geheimeSleutelPkcs8B64u,
      Buffer.from(TIJDSTEMPEL_ROL_DOMEIN + canoniekeJson(kern), 'utf8'),
    ),
  };
}

/**
 * Перевіряє незалежно в оглядачі або на пристрої користувача, що сервер не підмінив виконуваний код вебклієнта (§25 абз. 4!).
 */
export function verifieerWebClientBundelIntegriteit(
  manifest: KlimopWebClientManifest,
  ontvangenWebClientBundel: Buffer,
  erkendeDoelenPubDerB64u?: string,
): { ok: true } | { ok: false; fout: string } {
  if (!manifest || manifest.schema !== 1) return { ok: false, fout: 'WEBCLIENT_MANIFEST_ONGELDIG' };
  if (erkendeDoelenPubDerB64u && manifest.bouwerPubDerB64u !== erkendeDoelenPubDerB64u) {
    return { ok: false, fout: 'WEBCLIENT_ONBEKENDE_BOUWERSLEUTEL' };
  }
  const { bouwerHandtekeningB64u, ...kern } = manifest;
  if (!verifieerEd25519Der(manifest.bouwerPubDerB64u, Buffer.from(WEBCLIENT_DOMEIN + canoniekeJson(kern), 'utf8'), bouwerHandtekeningB64u)) {
    return { ok: false, fout: 'WEBCLIENT_HANDTEKENING_ONGELDIG' };
  }
  const berekendSha = createHash('sha256').update(ontvangenWebClientBundel).digest('hex');
  if (berekendSha !== manifest.webClientBundelSha256) {
    return { ok: false, fout: 'WEBCLIENT_BUNDEL_INTEGRITEIT_FOUT' };
  }
  return { ok: true };
}

/**
 * Повна багатошарова перевірка пакета оновлення на вузлі перед встановленням (§24, §25):
 *   1. Розділення ролей: роль складання `doelenRol` != роль свіжості `tijdstempelRol`, а затвердження вимагає кворуму `FROST` (`drempel >= 2`);
 *   2. Свіжість `tijdstempel` (захист від freeze-атаки захопленим дзеркалом оновлень);
 *   3. Захист від відкочування до небезпечної старої версії (`uitgaveVolgnummer > huidigGeinstalleerdVolgnummer`);
 *   4. Перевірка порогового підпису `FROST` на знімку `momentopname`;
 *   5. Перевірка цілісності архіву пакета, походження `TRACE-001` та непідміненості вебклієнта.
 */
export function verifieerUitgaveBundel(opties: {
  grondwet: KlimopBestuursGrondwet;
  bundel: KlimopVolledigeUitgaveBundel;
  huidigGeinstalleerdVolgnummer: number;
  ontvangenPakketInhoud: Buffer;
  ontvangenWebClientInhoud: Buffer;
  erkendeDoelenRolPubDerB64u?: string;
  erkendeTijdstempelRolPubDerB64u?: string;
  nuIso?: string;
}): { ok: true } | { ok: false; fout: string } {
  const { grondwet, bundel } = opties;
  const { doelen, momentopname, tijdstempel } = bundel;

  if (doelen.doelenRolPubDerB64u === tijdstempel.tijdstempelRolPubDerB64u) {
    return { ok: false, fout: 'UITGAVE_ROLLENSCHEIDING_GESCHONDEN' };
  }
  if (opties.erkendeDoelenRolPubDerB64u && doelen.doelenRolPubDerB64u !== opties.erkendeDoelenRolPubDerB64u) {
    return { ok: false, fout: 'UITGAVE_ONBEKENDE_DOELENROL' };
  }
  if (opties.erkendeTijdstempelRolPubDerB64u && tijdstempel.tijdstempelRolPubDerB64u !== opties.erkendeTijdstempelRolPubDerB64u) {
    return { ok: false, fout: 'UITGAVE_ONBEKENDE_TIJDSTEMPELROL' };
  }

  // 1. Захист від повернення старої вразливої версії (rollback attack, §25)
  if (doelen.uitgaveVolgnummer <= opties.huidigGeinstalleerdVolgnummer) {
    return { ok: false, fout: 'UITGAVE_TERUGDRAAI_AANVAL_GEWEIGERD' };
  }
  if (doelen.isOnomkeerbareMigratie && !doelen.onomkeerbareHerstelProcedureId) {
    return { ok: false, fout: 'ONOMKEERBARE_UITGAVE_MIST_HERSTELPROCEDURE' };
  }

  // 2. Перевірка свіжості (freeze attack, §25)
  const nuMs = Date.parse(opties.nuIso ?? new Date().toISOString());
  const { tijdstempelRolHandtekeningB64u, ...tsKern } = tijdstempel;
  if (
    !verifieerEd25519Der(
      tijdstempel.tijdstempelRolPubDerB64u,
      Buffer.from(TIJDSTEMPEL_ROL_DOMEIN + canoniekeJson(tsKern), 'utf8'),
      tijdstempelRolHandtekeningB64u,
    )
  ) {
    return { ok: false, fout: 'UITGAVE_TIJDSTEMPEL_HANDTEKENING_ONGELDIG' };
  }
  if (nuMs < Date.parse(tijdstempel.uitgegevenOp) - 60_000 || nuMs > Date.parse(tijdstempel.verlooptOp)) {
    return { ok: false, fout: 'UITGAVE_TIJDSTEMPEL_BEVROREN_OF_VERLOPEN' };
  }

  // 3. Зв'язок свіжості зі знімком і пороговий підпис FROST ради керування
  const berekendMomentSha = createHash('sha256').update(canoniekeJson(momentopname), 'utf8').digest('hex');
  if (
    tijdstempel.momentopnameSha256 !== berekendMomentSha
    || tijdstempel.uitgaveVolgnummer !== momentopname.uitgaveVolgnummer
  ) {
    return { ok: false, fout: 'UITGAVE_TIJDSTEMPEL_KOMT_NIET_OVEREEN_MET_MOMENTOPNAME' };
  }
  if (
    momentopname.grondwetId !== grondwet.grondwetId
    || new Set(momentopname.frostOndertekenaarIndexen).size < grondwet.drempel
  ) {
    return { ok: false, fout: 'UITGAVE_ONVOLDOENDE_FROST_QUORUM' };
  }

  const { boodschap: frostBoodschap, doelenMetadataSha256 } = maakMomentopnameFrostBoodschap(grondwet.grondwetId, doelen);
  if (momentopname.doelenMetadataSha256 !== doelenMetadataSha256) {
    return { ok: false, fout: 'UITGAVE_MOMENTOPNAME_DOELEN_HASH_FOUT' };
  }
  if (!verifieerStandaardEd25519Handtekening(frostBoodschap, momentopname.frostHandtekeningHex, grondwet.frostGroepsPubliekeSleutelHex)) {
    return { ok: false, fout: 'UITGAVE_FROST_QUORUMHANDTEKENING_ONGELDIG' };
  }

  // 4. Перевірка підпису doelenRol, відбитка пакета та цілісності вебклієнта
  const { doelenRolHandtekeningB64u, ...doelenKern } = doelen;
  if (
    !verifieerEd25519Der(
      doelen.doelenRolPubDerB64u,
      Buffer.from(DOELEN_ROL_DOMEIN + canoniekeJson(doelenKern), 'utf8'),
      doelenRolHandtekeningB64u,
    )
  ) {
    return { ok: false, fout: 'UITGAVE_DOELENROL_HANDTEKENING_ONGELDIG' };
  }

  const pakketSha = createHash('sha256').update(opties.ontvangenPakketInhoud).digest('hex');
  if (pakketSha !== doelen.pakketSha256) {
    return { ok: false, fout: 'UITGAVE_PAKKET_SHA256_FOUT' };
  }

  const webOk = verifieerWebClientBundelIntegriteit(
    doelen.webClientManifest,
    opties.ontvangenWebClientInhoud,
    doelen.doelenRolPubDerB64u,
  );
  if (!webOk.ok) return webOk;

  return { ok: true };
}

/** Перевіряє взаємну сумісність двох вузлів, які працюють на сусідніх версіях під час хвильового оновлення (§40 п. 6). */
export function zijnKnooppuntVersiesOnderlingCompatibel(
  knoopA: { actiefVolgnummer: number; minCompatibelVolgnummer: number },
  knoopB: { actiefVolgnummer: number; minCompatibelVolgnummer: number },
): boolean {
  return (
    knoopA.actiefVolgnummer >= knoopB.minCompatibelVolgnummer
    && knoopB.actiefVolgnummer >= knoopA.minCompatibelVolgnummer
  );
}
