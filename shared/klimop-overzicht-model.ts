// KLIMOP-014 / KLIMOP-015 / KLIMOP-016 / KLIMOP-017 (21.11.2026, Етапи 13–16 впровадження «Плюща» у платформу «Мій простір»):
// Спільна модель маршрутів власника (/api/owner/klimop/*), інструментів протоколу контексту моделі (klimop_*),
// двомовних підписів 11 служб, станів Сходинок 1–4 безпечного перенесення (§35: дзеркальна звірка, пасивне читання,
// контрольоване подвійне записування, кворумний атестат готовності під пороговим і гібридним постквантовим підписами),
// криптографічних журналів, перемикача миттєвого повернення та підказок «?».
// Чистий модуль (без Node.js чи оглядачевого оточення): однаково імпортується сервером і клієнтською частиною.

import type {
  KlimopControleVraagId,
  KlimopVerbodenVereenvoudigingId,
} from './klimop/kern';
import type { KlimopDienstId, KlimopOverdrachtModus } from './klimop/diensten';
import type { HybrideDubbeleHandtekening } from './klimop/beveiligingsaudit';
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
  dubbelSchrijven: '/api/owner/klimop/dubbel-schrijven',
  dubbelLogboek: '/api/owner/klimop/dubbel-logboek',
  quorumAttest: '/api/owner/klimop/quorum-attest',
  quorumLogboek: '/api/owner/klimop/quorum-logboek',
  overdrachtSchakelaar: '/api/owner/klimop/overdracht-schakelaar',
});

/** Імена технічних інструментів MCP у З'єднувачі другої версії (kant 'beheer') для всіх 14 ШІ-агентів. */
export const KLIMOP_TOOL_NAMEN = Object.freeze([
  'klimop_overzicht',
  'klimop_architectuur_toets',
  'klimop_spiegel_controle',
  'klimop_passieve_spiegel',
  'klimop_spiegel_logboek',
  'klimop_dubbel_schrijven',
  'klimop_dubbel_logboek',
  'klimop_quorum_attest',
  'klimop_quorum_logboek',
] as const);
export type KlimopToolNaam = (typeof KLIMOP_TOOL_NAMEN)[number];

export type KlimopPassieveLeesModus = 'alleen_erfenis_postgres' | 'passief_spiegel_lezen';
export type KlimopDubbelSchrijfModus = 'alleen_erfenis_postgres' | 'gecontroleerd_dubbel_schrijven';
export type KlimopQuorumAttestModus = 'alleen_erfenis_postgres' | 'quorum_gereed_onder_erfenis';
export type KlimopGesimuleerdeAfwijking = 'geen' | 'inhoud' | 'machtigingen' | 'ontbrekend_record';
export type KlimopGesimuleerdeDubbelSchrijfFout =
  | 'geen'
  | 'tweede_schrijf_mislukt'
  | 'lees_inhoud_afwijking'
  | 'verwijder_tombstone_gemist'
  | 'machtigingen_afwijking';
export type KlimopGesimuleerdeQuorumAttestFout =
  | 'geen'
  | 'frost_deel_vervalst'
  | 'hybride_pq_vervalst'
  | 'onafhankelijkheid_geschonden'
  | 'keten_kop_afwijking';
export type KlimopSchakelaarActie =
  | 'activeer_passief_lezen'
  | 'activeer_dubbel_schrijven'
  | 'bevestig_quorum_gereedheid'
  | 'terug_naar_erfenis'
  | 'nood_terug_alle_elf';

export const KLIMOP_GESIMULEERDE_AFWIJKINGEN = Object.freeze([
  'geen',
  'inhoud',
  'machtigingen',
  'ontbrekend_record',
] as const);

export const KLIMOP_GESIMULEERDE_DUBBEL_FOUTEN = Object.freeze([
  'geen',
  'tweede_schrijf_mislukt',
  'lees_inhoud_afwijking',
  'verwijder_tombstone_gemist',
  'machtigingen_afwijking',
] as const);

export const KLIMOP_GESIMULEERDE_ATTEST_FOUTEN = Object.freeze([
  'geen',
  'frost_deel_vervalst',
  'hybride_pq_vervalst',
  'onafhankelijkheid_geschonden',
  'keten_kop_afwijking',
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

export const KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST: Readonly<
  Record<KlimopDubbelSchrijfModus, { uk: string; nl: string }>
> = Object.freeze({
  alleen_erfenis_postgres: {
    uk: 'Чинна основа (без подвійного записування)',
    nl: 'Bestaande basis (zonder dubbel schrijven)',
  },
  gecontroleerd_dubbel_schrijven: {
    uk: 'Сходинка 3: контрольоване подвійне записування зі звіркою читання',
    nl: 'Stap 3: gecontroleerd dubbel schrijven met leesverificatie',
  },
});

export const KLIMOP_QUORUM_ATTESTMODUS_TEKST: Readonly<
  Record<KlimopQuorumAttestModus, { uk: string; nl: string }>
> = Object.freeze({
  alleen_erfenis_postgres: {
    uk: 'Чинна основа (без підтвердженого кворумного атестата)',
    nl: 'Bestaande basis (zonder bevestigd quorumattest)',
  },
  quorum_gereed_onder_erfenis: {
    uk: 'Сходинка 4: кворумний атестат готовності підтверджено (база активна)',
    nl: 'Stap 4: quorumattest van gereedheid bevestigd (databank actief)',
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
  routePad?: string;
  eigenGeheugenRuimte: boolean;
  vereistExterneVerbinderIsolatie: boolean;
  huidigeProductieModus: KlimopOverdrachtModus;
  passieveLeesModus?: KlimopPassieveLeesModus;
  dubbelSchrijfModus?: KlimopDubbelSchrijfModus;
  quorumAttestModus?: KlimopQuorumAttestModus;
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
    gedeeltelijkeDocumenten44?: number;
    ontbrekendeDocumenten44?: number;
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
    actieveDubbelSchrijvenDiensten: number;
    actieveQuorumGereedDiensten: number;
    totaalLogboekRegels: number;
    totaalDubbelKwitanties: number;
    totaalQuorumAttesten: number;
    ketenIntegriteitOk: boolean;
    dubbelKetenIntegriteitOk: boolean;
    attestKetenIntegriteitOk: boolean;
  };
  hulpmiddelen: readonly string[];
  productieOnaangetast: true;
}

export const KLIMOP_VIJFTIEN_VRAGEN_LIJST: ReadonlyArray<{
  id: KlimopControleVraagId;
  uk: string;
  nl: string;
}> = Object.freeze([
  { id: 'geen_nieuw_spof', uk: '1. Чи виникає нова єдина точка відмови?', nl: '1. Ontstaat er een nieuw enkel punt van uitval?' },
  { id: 'geen_verborgen_bevoegdheden', uk: '2. Чи не розширюються приховані повноваження?', nl: '2. Worden er geen verborgen bevoegdheden uitgebreid?' },
  { id: 'wettig_herstel_beschikbaar', uk: '3. Чи залишається доступним законне відновлення?', nl: '3. Blijft wettig herstel van toegang beschikbaar?' },
  { id: 'beschermd_op_apparaat_lijn_opslag', uk: '4. Чи захищено дані на пристрої, у каналі та в сховищі?', nl: '4. Zijn gegevens beschermd op apparaat, verbinding en opslag?' },
  { id: 'geen_onnodige_metadata', uk: '5. Чи не розкриваються непотрібні метадані?', nl: '5. Worden er geen onnodige metagegevens onthuld?' },
  { id: 'toestemmingen_intrekbaar', uk: '6. Чи можна відкликати створені дозволи?', nl: '6. Kunnen aangemaakte toestemmingen worden ingetrokken?' },
  { id: 'knooppunten_compatibel', uk: '7. Чи не порушується сумісність між вузлами?', nl: '7. Blijft de compatibiliteit tussen knooppunten behouden?' },
  { id: 'isolatie_defect_onderdeel', uk: '8. Чи зберігається можливість ізолювати несправний складник?', nl: '8. Blijft isolatie van een defect onderdeel mogelijk?' },
  { id: 'bescherming_mens_behouden', uk: '9. Чи не погіршується захист людини (втрата, хвороба, примус)?', nl: '9. Verslechtert de bescherming van de mens niet (verlies, ziekte, dwang)?' },
  { id: 'wijziging_verifieerbaar', uk: '10. Чи залишається зміна перевірюваною?', nl: '10. Blijft de wijziging onafhankelijk verifieerbaar?' },
  { id: 'veilig_terugdraaien_mogelijk', uk: '11. Чи є спосіб безпечного повернення попереднього стану?', nl: '11. Is er een veilige manier om de vorige staat terug te zetten?' },
  { id: 'geen_grotere_afhankelijkheid_auteur', uk: '12. Чи не збільшується залежність від початкового автора?', nl: '12. Neemt de afhankelijkheid van de oorspronkelijke auteur niet toe?' },
  { id: 'geen_middelenverbruik_zonder_toestemming', uk: '13. Чи не витрачаються ресурси користувачів без їхньої згоди?', nl: '13. Worden er geen middelen van gebruikers verbruikt zonder toestemming?' },
  { id: 'rechten_gegevenseigenaar_intact', uk: '14. Чи не порушуються права власників особистих даних?', nl: '14. Blijven de rechten van gegevenseigenaren ongeschonden?' },
  { id: 'geen_netwerkrisico_door_een_verbinder', uk: '15. Чи не створюється нова небезпека для мережі через один з’єднувач?', nl: '15. Ontstaat er geen netwerkbreed risico via één enkele verbinder?' },
]);

export interface KlimopVraagToetsResultaat {
  vraagId: KlimopControleVraagId;
  status: 'voldaan' | 'gefaald' | 'onbeoordeeld';
  bewijs: string;
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
  onbeoordeeldeVragen?: KlimopControleVraagId[];
  vragenResultaten?: readonly KlimopVraagToetsResultaat[];
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

// ---------------------------------------------------------------- Сходинки 2–4 (§35): пасивне читання, подвійне записування, кворумний атестат і миттєве повернення
export interface KlimopDienstSchakelaarStaat {
  dienstId: KlimopDienstId;
  primaireSchrijfBron: 'erfenis_postgres';
  leesModus: KlimopPassieveLeesModus;
  schrijfModus: KlimopDubbelSchrijfModus;
  attestModus: KlimopQuorumAttestModus;
  laatstePariteitOk: boolean | null;
  opeenvolgendeGelijkeControles: number;
  totaalUitgevoerdeControles: number;
  totaalGevondenAfwijkingen: number;
  laatsteDubbelSchrijfOk: boolean | null;
  opeenvolgendeDubbelSchrijfControles: number;
  totaalDubbelSchrijfProeven: number;
  totaalDubbelSchrijfFouten: number;
  laatsteQuorumAttestOk: boolean | null;
  opeenvolgendeGeldigeAttesten: number;
  totaalQuorumAttesten: number;
  totaalQuorumAttestFouten: number;
  automatischeTerugschakelingen: number;
  handmatigeTerugschakelingen: number;
  laatsteControleOp: string | null;
  laatsteDubbelSchrijfOp: string | null;
  laatsteQuorumAttestOp: string | null;
  laatsteSchakelingOp: string | null;
  laatsteReden: string;
  /** KLIMOP-021: монотонна версія доказів служби, яка змінюється при кожному новому вимірюванні чи збої. */
  bewijsVersie?: number;
  /** KLIMOP-021: точний відбиток SHA-256 останнього чинного атестата цієї служби (скидається при будь-якому збої). */
  laatsteGeldigeAttestSha256?: string | null;
}

export interface KlimopSpiegelLogboekRegel {
  regelId: string;
  volgnummer: number;
  tijdstipIso: string;
  soort:
    | 'passieve_spiegel_proef'
    | 'dubbel_schrijven_proef'
    | 'quorum_attest_proef'
    | 'handmatige_schakeling'
    | 'automatische_terugschakeling'
    | 'nood_terug_alle_elf';
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
    actieveDubbelSchrijvenDiensten: number;
    actieveQuorumGereedDiensten: number;
    totaalDiensten: number;
    totaalLogboekRegels: number;
    totaalAutomatischeTerugschakelingen: number;
    totaalHandmatigeTerugschakelingen: number;
  };
  schakelaars: KlimopDienstSchakelaarStaat[];
  recenteRegels: KlimopSpiegelLogboekRegel[];
  productieDatabankGewijzigd: false;
}

export interface KlimopDubbelSchrijfKwitantieRegel {
  kwitantieId: string;
  volgnummer: number;
  tijdstipIso: string;
  dienstId: KlimopDienstId;
  geisoleerdeDienstPsid: string;
  knooppuntRegios: readonly string[];
  knooppuntenOnafhankelijk: boolean;
  operatiesAantal: number;
  zetAantal: number;
  bijgewerktAantal: number;
  verwijderTombstoneAantal: number;
  gesimuleerdeFout: KlimopGesimuleerdeDubbelSchrijfFout;
  tweedeSchrijfGeslaagd: boolean;
  leesNaSchrijfGelijk: boolean;
  tombstoneBevestigd: boolean;
  reedSolomonHersteld: boolean;
  crdtSamenvoegingOk: boolean;
  kruisDienstIsolatieOk: boolean;
  afwijkingenAantal: number;
  afwijkingSleutelHashes: {
    ontbrekend: string[];
    inhoud: string[];
    machtigingen: string[];
  };
  schrijfModusVoor: KlimopDubbelSchrijfModus;
  schrijfModusNa: KlimopDubbelSchrijfModus;
  automatischTeruggezet: boolean;
  reden: string;
  bevatGeheimenOfInhoud: false;
  vorigeKwitantieSha256: string;
  kwitantieSha256: string;
}

export interface KlimopDubbelSchrijvenUitkomst {
  ok: boolean;
  dienstId: KlimopDienstId;
  subdomein: string;
  geisoleerdeDienstPsid: string;
  knooppunten: {
    regios: readonly string[];
    onafhankelijkQuorumOk: boolean;
  };
  operaties: {
    totaal: number;
    zetAantal: number;
    bijgewerktAantal: number;
    verwijderTombstoneAantal: number;
  };
  gesimuleerdeFout: KlimopGesimuleerdeDubbelSchrijfFout;
  tweedeSchrijfGeslaagd: boolean;
  leesNaSchrijfGelijk: boolean;
  tombstoneBevestigd: boolean;
  reedSolomonAlleActieveHersteld: boolean;
  crdtSamenvoegingOk: boolean;
  kruisDienstIsolatieAfgedwongen: boolean;
  pariteit: {
    volledigGelijk: boolean;
    actieveRecordsGecontroleerd: number;
    afwijkingen: number;
    ontbrekendAantal: number;
    inhoudAfwijkingAantal: number;
    machtigingenAfwijkingAantal: number;
  };
  overdrachtBesluit: {
    toegestaan: boolean;
    huidigeProductieModus: KlimopOverdrachtModus;
    gevalideerdeProefModus: KlimopOverdrachtModus;
    reden: string;
  };
  schakelaar: KlimopDienstSchakelaarStaat;
  automatischTeruggezetNaarErfenis: boolean;
  kwitantieRegel: KlimopDubbelSchrijfKwitantieRegel;
  logboekRegel: KlimopSpiegelLogboekRegel;
  productieDatabankGewijzigd: false;
}

export interface KlimopDubbelLogboekOverzicht {
  ketenIntegriteit: {
    ok: boolean;
    gecontroleerdeKwitanties: number;
    laatsteSha256: string;
    gebrokenBijVolgnummer: number | null;
    fout: string | null;
  };
  samenvatting: {
    actieveDubbelSchrijvenDiensten: number;
    actievePassiefLezenDiensten: number;
    actieveQuorumGereedDiensten: number;
    totaalDiensten: number;
    totaalKwitanties: number;
    totaalDubbelSchrijfFouten: number;
  };
  schakelaars: KlimopDienstSchakelaarStaat[];
  recenteKwitanties: KlimopDubbelSchrijfKwitantieRegel[];
  productieDatabankGewijzigd: false;
}

export interface KlimopQuorumAttestRegel {
  attestId: string;
  volgnummer: number;
  tijdstipIso: string;
  dienstId: KlimopDienstId;
  geisoleerdeDienstPsid: string;
  knooppuntRegios: readonly string[];
  knooppuntenOnafhankelijk: boolean;
  frostDrempel: { k: number; n: number };
  frostOndertekenaars: readonly number[];
  spiegelKetenKopSha256: string;
  dubbelKetenKopSha256: string;
  zaadMerkleWortelSha256: string | null;
  gesimuleerdeFout: KlimopGesimuleerdeQuorumAttestFout;
  frostGroepsPubliekeSleutelHex: string;
  frostGroepsHandtekeningHex: string;
  hybrideHandtekening: HybrideDubbeleHandtekening;
  frostVerificatieOk: boolean;
  hybrideVerificatieOk: boolean;
  ketensSluitend: boolean;
  besluitVolledigOnafhankelijkToegestaan: boolean;
  /** KLIMOP-020: чесно вказує, чи створено кворум як місцеве моделювання в одному процесі, чи за зовнішнім реєстром ключів. */
  uitvoeringsAard?: 'lokale_simulatie_een_proces' | 'extern_knooppuntenregister';
  /** KLIMOP-021: версія доказів служби на момент підписання атестата. */
  dienstBewijsVersie?: number;
  /** KLIMOP-021: засвідчений підписами перелік ідентифікаторів вузлів кворуму. */
  quorumKnooppuntIds?: readonly string[];
  /** KLIMOP-021: підписаний кворумом висновок про виконання умов цілісності журналів і незалежності вузлів. */
  gereedheidVoorwaardeOk?: boolean;
  attestModusVoor: KlimopQuorumAttestModus;
  attestModusNa: KlimopQuorumAttestModus;
  automatischTeruggezet: boolean;
  reden: string;
  bevatGeheimenOfInhoud: false;
  vorigeAttestSha256: string;
  attestSha256: string;
}

export interface KlimopQuorumAttestUitkomst {
  ok: boolean;
  dienstId: KlimopDienstId;
  subdomein: string;
  geisoleerdeDienstPsid: string;
  /** KLIMOP-020: явна позначка місцевого моделювання кворуму в одному процесі до під'єднання зовнішніх вузлів. */
  uitvoeringsAard?: 'lokale_simulatie_een_proces' | 'extern_knooppuntenregister';
  knooppunten: {
    regios: readonly string[];
    onafhankelijkQuorumOk: boolean;
  };
  drempelZegel: {
    drempel: { k: number; n: number };
    ondertekenaars: readonly number[];
    frostGroepsPubliekeSleutelHex: string;
    frostGroepsHandtekeningHex: string;
    frostVerificatieOk: boolean;
    verdachteDeelnemers: readonly number[];
    hybrideAlgoritme: 'ed25519+ml-dsa-65';
    hybrideVerificatieOk: boolean;
  };
  ketenVerankering: {
    spiegelKetenKopSha256: string;
    dubbelKetenKopSha256: string;
    ketensSluitend: boolean;
  };
  gesimuleerdeFout: KlimopGesimuleerdeQuorumAttestFout;
  overdrachtBesluit: {
    toegestaan: boolean;
    huidigeProductieModus: KlimopOverdrachtModus;
    gevalideerdeDoelModus: KlimopOverdrachtModus;
    reden: string;
    /** KLIMOP-020: розрізняє місцеве моделювання в одному процесі та атестат зовнішньо зареєстрованих фізичних вузлів. */
    bewijsOmvang?: 'lokale_simulatie' | 'extern_geverifieerd_quorum';
    waarschuwing?: Tekst;
  };
  schakelaar: KlimopDienstSchakelaarStaat;
  automatischTeruggezetNaarErfenis: boolean;
  attestRegel: KlimopQuorumAttestRegel;
  logboekRegel: KlimopSpiegelLogboekRegel | null;
  productieDatabankActief: true;
  productieDatabankGewijzigd: false;
}

export interface KlimopQuorumLogboekOverzicht {
  ketenIntegriteit: {
    ok: boolean;
    gecontroleerdeAttesten: number;
    laatsteSha256: string;
    gebrokenBijVolgnummer: number | null;
    fout: string | null;
  };
  samenvatting: {
    actieveQuorumGereedDiensten: number;
    actieveDubbelSchrijvenDiensten: number;
    actievePassiefLezenDiensten: number;
    totaalDiensten: number;
    totaalAttesten: number;
    totaalQuorumAttestFouten: number;
  };
  schakelaars: KlimopDienstSchakelaarStaat[];
  recenteAttesten: KlimopQuorumAttestRegel[];
  productieDatabankGewijzigd: false;
}

export interface KlimopOverdrachtSchakelaarUitkomst {
  ok: true;
  actie: KlimopSchakelaarActie;
  dienstId: KlimopDienstId | 'alle_elf';
  omgeschakeldeDienstenAantal: number;
  schakelaar: KlimopDienstSchakelaarStaat | null;
  actievePassiefLezenDiensten: number;
  actieveDubbelSchrijvenDiensten: number;
  actieveQuorumGereedDiensten: number;
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
  KLIMOP_STAP2_ACTIEF_VEREIST: T(
    'Перед переходом до контрольованого подвійного записування служба має перебувати на Сходинці 2 пасивного читання. Перестрибування сходинок заборонене.',
    'Voordat gecontroleerd dubbel schrijven kan worden ingeschakeld, moet de dienst op Stap 2 van passief spiegellezen staan. Stappen overslaan is verboden.',
  ),
  KLIMOP_DUBBEL_SCHRIJVEN_PROEF_VEREIST: T(
    'Перед увімкненням контрольованого подвійного записування виконайте успішну перевірку запису та звірки читання без розбіжностей.',
    'Voer eerst een foutloze proef van gecontroleerd dubbel schrijven met leesverificatie uit voordat deze stand wordt ingeschakeld.',
  ),
  KLIMOP_STAP3_ACTIEF_VEREIST: T(
    'Перед підтвердженням кворумної готовності Сходинки 4 служба має перебувати на активній Сходинці 3 подвійного записування. Перестрибування сходинок заборонене.',
    'Voordat quorum-gereedheid van Stap 4 kan worden bevestigd, moet de dienst op een actieve Stap 3 van dubbel schrijven staan. Stappen overslaan is verboden.',
  ),
  KLIMOP_QUORUM_ATTEST_VEREIST: T(
    'Перед підтвердженням Сходинки 4 випустіть дійсний кворумний атестат під пороговим і гібридним постквантовим підписами без жодних зауважень.',
    'Stel eerst een geldig quorumattest onder drempel- en hybride postkwantumhandtekening op voordat Stap 4 wordt bevestigd.',
  ),
  KLIMOP_QUORUM_ATTEST_VEROUDERD_OF_ONGELDIG: T(
    'Кворумний атестат обраної служби відсутній, прострочений або замінений новішою зміною стану чи збоєм. Випустіть свіжий атестат для поточної версії доказів цієї служби.',
    'Het quorumattest voor de gekozen dienst ontbreekt, is verlopen of is ingehaald door een nieuwere statuswijziging of storing. Stel een vers attest op voor de huidige bewijsversie van deze dienst.',
  ),
  KLIMOP_LOGBOEK_KETEN_ONGELDIG: T(
    'Порушено криптографічну цілісність ланцюжка журналу дзеркальної звірки. Перемикання вперед заблоковано, повернення на чинну основу залишається доступним.',
    'De cryptografische keten van het spiegellogboek is doorbroken. Opschakelen is geblokkeerd; terugschakelen naar de bestaande basis blijft direct beschikbaar.',
  ),
  KLIMOP_DUBBEL_LOGBOEK_KETEN_ONGELDIG: T(
    'Порушено цілісність ланцюжка квитанцій подвійного записування. Перемикання вперед заблоковано, миттєве повернення на чинну основу залишається доступним.',
    'De cryptografische keten van het kwitantielogboek voor dubbel schrijven is doorbroken. Opschakelen is geblokkeerd; terugzetten naar de bestaande basis blijft beschikbaar.',
  ),
  KLIMOP_ATTEST_KETEN_ONGELDIG: T(
    'Порушено криптографічну цілісність або підписи ланцюжка кворумних атестатів Сходинки 4. Підтвердження вперед заблоковано, повернення залишається доступним.',
    'De cryptografische keten of ondertekening van het quorumattestlogboek is doorbroken. Bevestigen is geblokkeerd; terugzetten naar de basis blijft beschikbaar.',
  ),
  KLIMOP_LOSKOPPELING_VERBODEN: T(
    'Самовільне відокремлення або вимкнення чинної бази даних заборонене. Робоча основа залишається обов’язковою до окремого рішення власника.',
    'Zelfstandig loskoppelen of uitschakelen van de bestaande databank is verboden. De draaiende basis blijft verplicht tot een afzonderlijk eigenaarsbesluit.',
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
  'klimop.dubbel': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Контрольоване подвійне записування Сходинки 3 зі звіркою читання після запису, перевіркою видалень та журналом квитанцій.',
      'Gecontroleerd dubbel schrijven van Stap 3 met onmiddellijke leesverificatie, verwijdermarkeringen en een sluitend kwitantielogboek.',
    ),
    T(
      'Перевіряє створення, оновлення й видалення у кворумі трьох незалежних вузлів та миттєво скидає службу на чинну основу за найменшого збою.',
      'Beproeft aanmaken, bijwerken en verwijderen op drie onafhankelijke knooppunten en zet de dienst bij elke fout direct terug naar de basis.',
    ),
    T(
      'Низький ризик. Чинна база даних залишається єдиним первинним джерелом запису, а вміст ніколи не потрапляє до квитанцій.',
      'Laag risico. De bestaande databank blijft de enige primaire schrijfbron en inhoud komt nooit in het kwitantielogboek terecht.',
    ),
    T(
      'POST /api/owner/klimop/dubbel-schrijven та /dubbel-logboek → backend/klimop-overdracht-opslag.ts; через MCP — klimop_dubbel_schrijven і klimop_dubbel_logboek.',
      'POST /api/owner/klimop/dubbel-schrijven en /dubbel-logboek → backend/klimop-overdracht-opslag.ts; via MCP klimop_dubbel_schrijven en klimop_dubbel_logboek.',
    ),
  ),
  'klimop.attest': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Кворумний атестат готовності Сходинки 4 під пороговим підписом Шнорра (два з трьох) і гібридним постквантовим підписом.',
      'Quorumattest van gereedheid van Stap 4 onder een twee-uit-drie drempelhandtekening en een hybride postkwantumhandtekening.',
    ),
    T(
      'Зв’язує голови журналів звірки та квитанцій із трьома незалежними вузлами й у разі підробки частки чи ключа миттєво скидає службу на чинну основу.',
      'Koppelt de koppen van het spiegel- en kwitantielogboek aan drie onafhankelijke knooppunten en schakelt bij vervalsing direct terug naar de basis.',
    ),
    T(
      'Низький ризик. Атестат ніколи не вимикає та не відокремлює робочу базу даних і не зберігає жодних таємних часток чи вмісту.',
      'Laag risico. Het attest schakelt de draaiende productiedatabank nooit uit of los en bewaart geen geheime sleuteldelen of inhoud.',
    ),
    T(
      'POST /api/owner/klimop/quorum-attest та /quorum-logboek → backend/klimop-overdracht-opslag.ts; через MCP — klimop_quorum_attest і klimop_quorum_logboek.',
      'POST /api/owner/klimop/quorum-attest en /quorum-logboek → backend/klimop-overdracht-opslag.ts; via MCP klimop_quorum_attest en klimop_quorum_logboek.',
    ),
  ),
  'klimop.schakelaar': hulp(
    'src/agenten/KlimopPaneel.tsx',
    T(
      'Керований перемикач сходинок пасивного читання, подвійного записування, кворумної готовності та миттєвого повернення одинадцяти служб.',
      'Beheerste schakelaar voor passief spiegellezen, gecontroleerd dubbel schrijven, quorum-gereedheid en onmiddellijke terugval van elf diensten.',
    ),
    T(
      'Дозволяє рух уперед лише послідовно без перестрибування сходинок за чистих звірок або миттєво повертає одну чи всі одинадцять служб у вихідний стан.',
      'Staat opschakelen uitsluitend stapsgewijs toe na bewezen foutloze controles of zet één dienst of alle elf diensten onmiddellijk terug naar de beginstand.',
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
