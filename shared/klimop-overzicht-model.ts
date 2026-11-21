// KLIMOP-014 / KLIMOP-015 (21.11.2026, Етапи 13–14 впровадження «Плюща» у платформу «Мій простір»):
// Спільна модель маршрутів власника (/api/owner/klimop/*), інструментів протоколу контексту моделі (klimop_*),
// двомовних підписів 11 служб, станів Сходинки 1 та Сходинки 2 безпечного перенесення (§35),
// криптографічного журналу розбіжностей, перемикача миттєвого повернення та контекстних підказок «?».
// Чистий модуль (без Node.js чи оглядачевого оточення): однаково імпортується сервером і клієнтською частиною.

import type {
  KlimopControleVraagId,
  KlimopVerbodenVereenvoudigingId,
} from './klimop/kern';
import type { KlimopDienstId, KlimopOverdrachtModus } from './klimop/diensten';
import type { KlimopOntwikkelRichtingId } from './klimop/zaden';

type Tekst = [string, string];
const T = (uk: string, nl: string): Tekst => [uk, nl];

export class KlimopFout extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;

  constructor(code: string, status = 400, detail?: string) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Захищені маршрути власника (лише mcp.* та admin.*, роль owner + OWNER_EMAIL). Агенти користуються MCP-інструментами klimop_*. */
export const KLIMOP_PADEN = Object.freeze({
  overzicht: '/api/owner/klimop/overzicht',
  architectuurToets: '/api/owner/klimop/architectuur-toets',
  spiegelControle: '/api/owner/klimop/spiegel-controle',
  passieveSpiegel: '/api/owner/klimop/passieve-spiegel',
  spiegelLogboek: '/api/owner/klimop/spiegel-logboek',
  overdrachtSchakelaar: '/api/owner/klimop/overdracht-schakelaar',
});

/** Імена технічних інструментів MCP у З'єднувачі другої версії (kant 'beheer') для всіх 14 ШІ-агентів. */
export const KLIMOP_TOOL_NAMEN = Object.freeze([
  'klimop_overzicht',
  'klimop_architectuur_toets',
  'klimop_spiegel_controle',
  'klimop_passieve_spiegel',
  'klimop_spiegel_logboek',
] as const);
export type KlimopToolNaam = (typeof KLIMOP_TOOL_NAMEN)[number];

export type KlimopPassieveLeesModus = 'alleen_erfenis_postgres' | 'passief_spiegel_lezen';
export type KlimopGesimuleerdeAfwijking = 'geen' | 'inhoud' | 'machtigingen' | 'ontbrekend_record';
export type KlimopSchakelaarActie = 'activeer_passief_lezen' | 'terug_naar_erfenis' | 'nood_terug_alle_elf';

export const KLIMOP_GESIMULEERDE_AFWIJKINGEN = Object.freeze([
  'geen',
  'inhoud',
  'machtigingen',
  'ontbrekend_record',
] as const);

export const KLIMOP_LEESMODUS_TEKST: Readonly<Record<KlimopPassieveLeesModus, { uk: string; nl: string }>> =
  Object.freeze({
    alleen_erfenis_postgres: {
      uk: 'Чинна основа (без пасивного дзеркала)',
      nl: 'Bestaande basis (zonder passieve spiegel)',
    },
    passief_spiegel_lezen: {
      uk: 'Сходинка 2: пасивне дзеркальне читання з автоповерненням',
      nl: 'Stap 2: passief spiegellezen met automatische terugval',
    },
  });

export const KLIMOP_DIENST_TEKST: Readonly<Record<KlimopDienstId, { uk: string; nl: string }>> = Object.freeze({
  werkblad: { uk: 'Робочий простір (головна)', nl: 'Werkblad (startruimte)' },
  postvak: { uk: 'Пошта та повідомлення', nl: 'Postvak en berichten' },
  identiteit: { uk: 'Ідентичність і доступи', nl: 'Identiteit en toegang' },
  wolkopslag: { uk: 'Хмарне сховище файлів', nl: 'Wolkopslag van bestanden' },
  agenda: { uk: 'Календар і події', nl: 'Agenda en afspraken' },
  ai_ruimte: { uk: 'ШІ-простір', nl: 'AI-ruimte' },
  mcp_poort: { uk: 'Шлюз координації агентів', nl: 'Poort voor agentcoördinatie' },
  ontwikkelmiddelen: { uk: 'Засоби розробки та сховищ коду', nl: 'Ontwikkelmiddelen en codeopslag' },
  slimwoon: { uk: 'Розумний дім та оселя', nl: 'Slim wonen en huishouden' },
  verbinders: { uk: 'Зовнішні програмні з’єднувачі', nl: 'Externe programmaverbinders' },
  beheer_en_diagnose: { uk: 'Адміністрування та діагностика', nl: 'Beheer en diagnose' },
});

export const KLIMOP_OVERDRACHT_TEKST: Readonly<Record<KlimopOverdrachtModus, { uk: string; nl: string }>> = Object.freeze({
  alleen_erfenis_postgres: {
    uk: 'Чинна база даних (недоторканна основа)',
    nl: 'Bestaande databank (onaangetaste basis)',
  },
  schaduw_dubbel_schrijven: {
    uk: 'Сходинка 1: дзеркальна звірка без змін основи',
    nl: 'Stap 1: spiegelverificatie zonder wijziging van de basis',
  },
  klimop_primair_met_erfenis_terugval: {
    uk: 'Сходинка 2: розподілені вузли з гарячим поверненням',
    nl: 'Stap 2: verdeelde knooppunten met directe terugval',
  },
  volledig_onafhankelijk_geverifieerd: {
    uk: 'Сходинка 3: повна незалежність (лише за рішенням власника)',
    nl: 'Stap 3: volledige onafhankelijkheid (alleen na eigenaarsbesluit)',
  },
});

export interface KlimopModuleIntegriteit {
  pad: string;
  aanwezig: boolean;
  grootteBytes: number;
  sha256: string;
}

export interface KlimopDienstBrugStatus {
  dienstId: KlimopDienstId;
  subdomein: string;
  eigenGeheugenRuimte: boolean;
  vereistExterneVerbinderIsolatie: boolean;
  huidigeProductieModus: KlimopOverdrachtModus;
  passieveLeesModus?: KlimopPassieveLeesModus;
  spiegelVerificatieBeschikbaar: boolean;
  productieDatabankActief: true;
}

export interface KlimopPlatformOverzicht {
  bron: {
    aanwezig: boolean;
    wortel: string;
    code?: string;
  };
  kernModules: KlimopModuleIntegriteit[];
  zaadMerkleWortelSha256: string | null;
  afhankelijkheden: {
    ok: boolean;
    aantal: number;
    fouten: string[];
  };
  eindvisie46: {
    ok: boolean;
    gedektePijlers: number;
    totaalPijlers: number;
    voltooideDocumenten44: number;
  } | null;
  dossier: {
    bijgewerkt: string;
    aantalTaken: number;
    actieveMogelijkheden: number;
    verlorenMogelijkheden: number;
  } | null;
  diensten: KlimopDienstBrugStatus[];
  overdrachtStaat?: {
    actievePassiefLezenDiensten: number;
    totaalLogboekRegels: number;
    ketenIntegriteitOk: boolean;
  };
  hulpmiddelen: readonly string[];
  productieOnaangetast: true;
}

export interface KlimopArchitectuurToetsInvoer {
  naam?: string;
  fase?: number;
  richting?: KlimopOntwikkelRichtingId;
  agentId?: string;
  regelsVersie?: string;
  bevatTestBewijs?: boolean;
  raaktProductieDirectZonderGoedkeuring?: boolean;
  probeertZelfGoedTeKeurenOfUitTeRollen?: boolean;
  wijzigtCryptoregelsZonderQuorum?: boolean;
  breidtEigenRechtenUit?: boolean;
  onthultGeheimen?: boolean;
  aanwezigeVerbodenVereenvoudigingen?: KlimopVerbodenVereenvoudigingId[];
  antwoorden15?: Partial<Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>>;
  gebruikStandaardBewijsVoorOntbrekendeVragen?: boolean;
}

export interface KlimopArchitectuurToetsUitkomst {
  naam: string;
  fase: number;
  goedgekeurd: boolean;
  vereistMenselijkOfQuorumBesluit: true;
  beoordeeldeVragen: number;
  ontbrekendeOfGefaaldeVragen: KlimopControleVraagId[];
  geschondenVereenvoudigingen: KlimopVerbodenVereenvoudigingId[];
  fouten: string[];
}

export interface KlimopSpiegelControleUitkomst {
  ok: boolean;
  dienstId: KlimopDienstId;
  subdomein: string;
  geisoleerdeDienstPsid: string;
  reedSolomon: {
    k: number;
    m: number;
    totaalStrepen: number;
    hersteldNaUitvalVanTweeStrepen: boolean;
    inhoudSha256Gelijk: boolean;
  };
  crdtSamenvoegingOk: boolean;
  kruisDienstIsolatieAfgedwongen: boolean;
  pariteit: {
    volledigGelijk: boolean;
    totaalGecontroleerd: number;
    afwijkingen: number;
  };
  overdrachtBesluit: {
    toegestaan: boolean;
    huidigeProductieModus: KlimopOverdrachtModus;
    gevalideerdeProefModus: KlimopOverdrachtModus;
    reden: string;
  };
  productieDatabankGewijzigd: false;
  gecontroleerdOp: string;
}

// ---------------------------------------------------------------- Сходинка 2 (§35): пасивне читання, журнал розбіжностей і перемикач повернення
export interface KlimopDienstSchakelaarStaat {
  dienstId: KlimopDienstId;
  primaireSchrijfBron: 'erfenis_postgres';
  leesModus: KlimopPassieveLeesModus;
  laatstePariteitOk: boolean | null;
  opeenvolgendeGelijkeControles: number;
  totaalUitgevoerdeControles: number;
  totaalGevondenAfwijkingen: number;
  automatischeTerugschakelingen: number;
  handmatigeTerugschakelingen: number;
  laatsteControleOp: string | null;
  laatsteSchakelingOp: string | null;
  laatsteReden: string;
}

export interface KlimopSpiegelLogboekRegel {
  regelId: string;
  volgnummer: number;
  tijdstipIso: string;
  soort: 'passieve_spiegel_proef' | 'handmatige_schakeling' | 'automatische_terugschakeling' | 'nood_terug_alle_elf';
  dienstId: KlimopDienstId | 'alle_elf';
  leesModusVoor: KlimopPassieveLeesModus;
  leesModusNa: KlimopPassieveLeesModus;
  aantalGecontroleerd: number;
  afwijkingenAantal: number;
  afwijkingSleutelHashes: {
    ontbrekend: string[];
    inhoud: string[];
    machtigingen: string[];
  };
  reedSolomonHersteld: boolean;
  crdtSamenvoegingOk: boolean;
  automatischTeruggezet: boolean;
  reden: string;
  bevatGeheimenOfInhoud: false;
  vorigeRegelSha256: string;
  regelSha256: string;
}

export interface KlimopPassieveSpiegelUitkomst {
  ok: boolean;
  dienstId: KlimopDienstId;
  subdomein: string;
  geisoleerdeDienstPsid: string;
  steekproefGrootte: number;
  gesimuleerdeAfwijking: KlimopGesimuleerdeAfwijking;
  reedSolomonAlleRecordsHersteld: boolean;
  crdtSamenvoegingOk: boolean;
  kruisDienstIsolatieAfgedwongen: boolean;
  pariteit: {
    volledigGelijk: boolean;
    totaalGecontroleerd: number;
    afwijkingen: number;
    ontbrekendAantal: number;
    inhoudAfwijkingAantal: number;
    machtigingenAfwijkingAantal: number;
  };
  schakelaar: KlimopDienstSchakelaarStaat;
  automatischTeruggezetNaarErfenis: boolean;
  logboekRegel: KlimopSpiegelLogboekRegel;
  productieDatabankGewijzigd: false;
}

export interface KlimopSpiegelLogboekOverzicht {
  ketenIntegriteit: {
    ok: boolean;
    gecontroleerdeRegels: number;
    laatsteSha256: string;
    gebrokenBijVolgnummer: number | null;
    fout: string | null;
  };
  samenvatting: {
    actievePassiefLezenDiensten: number;
    totaalDiensten: number;
    totaalLogboekRegels: number;
    totaalAutomatischeTerugschakelingen: number;
    totaalHandmatigeTerugschakelingen: number;
  };
  schakelaars: KlimopDienstSchakelaarStaat[];
  recenteRegels: KlimopSpiegelLogboekRegel[];
  productieDatabankGewijzigd: false;
}

export interface KlimopOverdrachtSchakelaarUitkomst {
  ok: true;
  actie: KlimopSchakelaarActie;
  dienstId: KlimopDienstId | 'alle_elf';
  omgeschakeldeDienstenAantal: number;
  schakelaar: KlimopDienstSchakelaarStaat | null;
  actievePassiefLezenDiensten: number;
  logboekRegel: KlimopSpiegelLogboekRegel;
  productieDatabankGewijzigd: false;
}

export const KLIMOP_CODES: Readonly<Record<string, Tekst>> = Object.freeze({
  KLIMOP_GEEN_BRON: T(
    'На сервері не знайдено робочої копії джерел екосистеми Плющ. Перевірте змінну середовища з кореневою текою координації.',
    'Op de server is geen werkkopie van de Klimop-bronbestanden gevonden. Controleer de omgevingsvariabele met de wortelmap van de coördinatie.',
  ),
  ONBEKENDE_KLIMOP_DIENST: T(
    'Вказано невідомий ідентифікатор служби. Оберіть одну з одинадцяти зареєстрованих служб платформи.',
    'Er is een onbekende dienstaanduiding opgegeven. Kies een van de elf geregistreerde diensten van het platform.',
  ),
  KLIMOP_INVOER_ONGELDIG: T(
    'Вхідні параметри перевірки неповні або мають недопустиму форму.',
    'De opgegeven invoer voor de controle is onvolledig of heeft een ongeldige vorm.',
  ),
  KLIMOP_SPIEGEL_EERST_VEREIST: T(
    'Перед увімкненням пасивного дзеркального читання для служби потрібно виконати успішну безрозбіжну перевірку.',
    'Voer eerst een geslaagde spiegelcontrole zonder afwijkingen uit voordat passief spiegellezen voor deze dienst wordt ingeschakeld.',
  ),
  KLIMOP_LOGBOEK_KETEN_ONGELDIG: T(
    'Порушено криптографічну цілісність ланцюжка журналу дзеркальної звірки. Перемикання вперед заблоковано, повернення на чинну основу залишається доступним.',
    'De cryptografische keten van het spiegellogboek is doorbroken. Opschakelen is geblokkeerd; terugschakelen naar de bestaande basis blijft direct beschikbaar.',
  ),
  KLIMOP_SCHAKELAAR_ACTIE_ONGELDIG: T(
    'Вказано невідому дію перемикача перенесення служби.',
    'Er is een onbekende schakelhandeling voor dienstoverdracht opgegeven.',
  ),
  RATE_LIMITED: T(
    'Перевищено допустиму кількість звернень до перевірок екосистеми Плющ за хвилину. Спробуйте трохи згодом.',
    'Het toegestane aantal aanroepen van de Klimop-controles per minuut is bereikt. Probeer het straks opnieuw.',
  ),
});

export const klimopCodeTekst = (lang: 'uk' | 'nl', code: string): string => {
  const t = KLIMOP_CODES[code];
  return t ? (lang === 'uk' ? t[0] : t[1]) : code;
};

// ---------------------------------------------------------------- Контекстна довідка «?» (shared/hulp-register.ts)
type HulpItem = { wat: Tekst; gevolg: Tekst; risico: Tekst; dev: Tekst; bron: string };
const hulp = (bron: string, wat: Tekst, gevolg: Tekst, risico: Tekst, dev: Tekst): HulpItem => ({
  wat,
  gevolg,
  risico,
  dev,
  bron,
});

export const HELP_KLIMOP: Readonly<Record<string, HulpItem>> = Object.freeze({
  'klimop.overzicht': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Живий огляд архітектурної готовності екосистеми Плющ: дванадцять модулів ядра, корінь дерева Меркла пакета Насіння та одинадцять служб.',
      'Actueel overzicht van de architectuurgereedheid van het ecosysteem Klimop: twaalf kernmodules, de Merkle-wortel van het Zaadpakket en elf diensten.',
    ),
    T(
      'Сервер перечитує контрольні відбитки SHA-256 усіх дванадцяти модулів, перевіряє залежності та стан досьє без жодних змін у робочій базі.',
      'De server berekent de SHA-256-afdrukken van alle twaalf kernmodules opnieuw en toetst de afhankelijkheden en het dossier zonder de productiedatabank aan te raken.',
    ),
    T(
      'Низький ризик (лише читання). Жодні особисті дані, ключі доступу чи живі служби не змінюються та не розкриваються.',
      'Laag risico (uitsluitend lezen). Persoonsgegevens, toegangssleutels en draaiende diensten blijven ongewijzigd en afgeschermd.',
    ),
    T(
      'POST /api/owner/klimop/overzicht → klimopOverzichtA() у backend/klimop-platform-brug.ts; для агентів через MCP — інструмент klimop_overzicht.',
      'POST /api/owner/klimop/overzicht → klimopOverzichtA() in backend/klimop-platform-brug.ts; voor agenten via MCP het hulpmiddel klimop_overzicht.',
    ),
  ),
  'klimop.spiegel': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Безризикова дзеркальна криптографічна перевірка Сходинки 1 для вибраної служби за розділом 35 Головного архітектурного маніфесту.',
      'Risicoloze cryptografische spiegelverificatie van Stap 1 voor de gekozen dienst volgens hoofdstuk 35 van het Hoofdarchitectuurmanifest.',
    ),
    T(
      'У пам’яті формується ізольований псевдонім служби, перевіряється відновлення смуг Ріда та Соломона після втрати двох вузлів і злиття станів.',
      'In het geheugen wordt een geïsoleerd dienstpseudoniem afgeleid en worden Reed-Solomon-herstel na verlies van twee stroken en statensamenvoeging getoetst.',
    ),
    T(
      'Низький ризик. Використовується лише штучний контрольний запис у пам’яті; робоча база даних і справжні файли користувачів залишаються недоторканними.',
      'Laag risico. Er wordt uitsluitend een kunstmatig controle-element in het geheugen gebruikt; de productiedatabank en echte bestanden blijven onaangetast.',
    ),
    T(
      'POST /api/owner/klimop/spiegel-controle → klimopSpiegelControle() у backend/klimop-platform-brug.ts; через MCP — klimop_spiegel_controle.',
      'POST /api/owner/klimop/spiegel-controle → klimopSpiegelControle() in backend/klimop-platform-brug.ts; via MCP het hulpmiddel klimop_spiegel_controle.',
    ),
  ),
  'klimop.passief': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Пасивне дзеркальне читання Сходинки 2 із записом у криптографічно зв’язаний журнал розбіжностей для вибраної служби платформи.',
      'Passief spiegellezen van Stap 2 met vastlegging in het cryptografisch gekoppelde afwijkingslogboek voor de gekozen platformdienst.',
    ),
    T(
      'Перевіряє багатоелементну вибірку служби, фіксує лише знеособлені контрольні відбитки в журналі та при будь-якій розбіжності автоматично повертає службу на чинну основу.',
      'Toetst een meervoudige steekproef van de dienst, legt alleen geanonimiseerde afdrukken in het logboek vast en schakelt bij elke afwijking direct terug naar de bestaande basis.',
    ),
    T(
      'Низький ризик. Основним джерелом запису залишається чинна база даних; особистий вміст ніколи не потрапляє до журналу розбіжностей.',
      'Laag risico. De bestaande databank blijft de enige schrijfbron; persoonlijke inhoud komt nooit in het afwijkingslogboek terecht.',
    ),
    T(
      'POST /api/owner/klimop/passieve-spiegel та /spiegel-logboek → backend/klimop-overdracht-opslag.ts; через MCP — klimop_passieve_spiegel і klimop_spiegel_logboek.',
      'POST /api/owner/klimop/passieve-spiegel en /spiegel-logboek → backend/klimop-overdracht-opslag.ts; via MCP klimop_passieve_spiegel en klimop_spiegel_logboek.',
    ),
  ),
  'klimop.schakelaar': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Керований перемикач режиму пасивного читання та миттєвого повернення однієї або всіх одинадцяти служб на чинну основу.',
      'Beheerste schakelaar voor passief spiegellezen en onmiddellijke terugval van één of alle elf diensten naar de bestaande basis.',
    ),
    T(
      'Вмикає пасивне читання лише після підтвердженої безрозбіжної звірки або миттєво повертає обрану службу чи всі одинадцять служб у вихідний стан.',
      'Schakelt passief lezen uitsluitend in na een bewezen foutloze spiegelcontrole of zet één dienst of alle elf diensten onmiddellijk terug naar de beginstand.',
    ),
    T(
      'Низький ризик. Перемикач доступний виключно власнику на службовій адресі й ніколи не вимикає основну базу даних платформи.',
      'Laag risico. De schakelaar is uitsluitend voor de eigenaar beschikbaar en schakelt de onderliggende productiedatabank nooit uit.',
    ),
    T(
      'POST /api/owner/klimop/overdracht-schakelaar → schakelKlimopDienstOverdracht() у backend/klimop-overdracht-opslag.ts (недоступний для самовільного виклику агентами).',
      'POST /api/owner/klimop/overdracht-schakelaar → schakelKlimopDienstOverdracht() in backend/klimop-overdracht-opslag.ts (niet zelfstandig door agenten aanroepbaar).',
    ),
  ),
  'klimop.toets': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Машинна перевірка архітектурної чи програмної пропозиції за п’ятнадцятьма питаннями розділу 42 та чотирнадцятьма заборонами розділу 43.',
      'Geautomatiseerde toetsing van een architectuur- of codevoorstel aan de vijftien controlevragen van hoofdstuk 42 en veertien verboden van hoofdstuk 43.',
    ),
    T(
      'Показує, чи не створює запропонована зміна нову єдину точку відмови, приховані повноваження, спробу самосхвалення агента чи втручання в роботу сервера.',
      'Toont of een voorgestelde wijziging een enkel storingspunt, verborgen bevoegdheden, zelfgoedkeuring door een agent of directe productie-ingrepen veroorzaakt.',
    ),
    T(
      'Низький ризик (оцінювання без виконання). Навіть схвалена пропозиція ніколи не встановлюється сама й потребує рішення власника чи кворуму.',
      'Laag risico (beoordeling zonder uitvoering). Zelfs een goedgekeurd voorstel wordt nooit vanzelf uitgerold en vereist altijd een besluit van eigenaar of quorum.',
    ),
    T(
      'POST /api/owner/klimop/architectuur-toets → klimopArchitectuurToets() у backend/klimop-platform-brug.ts; через MCP — klimop_architectuur_toets.',
      'POST /api/owner/klimop/architectuur-toets → klimopArchitectuurToets() in backend/klimop-platform-brug.ts; via MCP het hulpmiddel klimop_architectuur_toets.',
    ),
  ),
});
