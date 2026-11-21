// KLIMOP-014 (21.11.2026, Етап 13 впровадження «Плюща» у платформу «Мій простір»):
// Спільна модель маршрутів власника (/api/owner/klimop/*), інструментів протоколу контексту моделі (klimop_*),
// двомовних підписів 11 служб, станів Сходинки 1 безпечного перенесення (§35) та контекстних підказок «?».
// Чистий модуль (без Node.js чи браузерного оточення): однаково імпортується сервером і клієнтською частиною.

import type {
  KlimopControleVraagId,
  KlimopVerbodenVereenvoudigingId,
} from './klimop/kern';
import type { KlimopDienstId, KlimopOverdrachtModus } from './klimop/diensten';
import type { KlimopOntwikkelRichtingId } from './klimop/zaden';

type Tekst = [string, string];
const T = (uk: string, nl: string): Tekst => [uk, nl];

/** Захищені маршрути власника (лише mcp.* та admin.*, роль owner + OWNER_EMAIL). Агенти користуються MCP-інструментами klimop_*. */
export const KLIMOP_PADEN = Object.freeze({
  overzicht: '/api/owner/klimop/overzicht',
  architectuurToets: '/api/owner/klimop/architectuur-toets',
  spiegelControle: '/api/owner/klimop/spiegel-controle',
});

/** Імена технічних інструментів MCP у З'єднувачі другої версії (kant 'beheer') для всіх 14 ШІ-агентів. */
export const KLIMOP_TOOL_NAMEN = Object.freeze([
  'klimop_overzicht',
  'klimop_architectuur_toets',
  'klimop_spiegel_controle',
] as const);
export type KlimopToolNaam = (typeof KLIMOP_TOOL_NAMEN)[number];

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
