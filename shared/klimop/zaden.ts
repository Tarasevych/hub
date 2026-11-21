// KLIMOP-013 (21.11.2026, Етап 12 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// «Насіння» — самодостатній пакет незалежного відтворення екосистеми з нуля (Документ №19),
// порядок передавання спадкоємності новим уповноваженим учасникам без постійної участі початкового автора (Документ №23),
// безперервний автономний розвиток 16 спеціалізованих напрямів ШІ-агентів без необмеженої автономії (§32–§34, §36 Етап 12)
// та приймальна звірка всіх 12 засад кінцевого бачення (§46) і 25 обов'язкових документів (§44):
//   1. Канонічний реєстр перевірених технічних залежностей без прив'язки до сторонніх хмарних монополій (§44 п. 19);
//   2. Пакет «Насіння» з деревом Меркла SHA-256 по всіх 12 модулях ядра, запечатаний одночасно пороговим підписом
//      FROST (RFC 9591) та гібридним постквантовим підписом Ed25519 + ML-DSA-65 (FIPS 204), із суворим бар'єром Етапу 11
//      і забороною вкладення будь-яких закритих ключів чи особистих даних;
//   3. Відтворення екосистеми на чистому ізольованому середовищі з нульовим зверненням до старого сервера (§1.7);
//   4. Двосторонній пороговий акт спадкоємності між поколіннями хранителів із 72-год часовим замком і нерозголошенням
//      особистих даних користувачів (§2, §18–§20, Документ №23);
//   5. Контроль пропозицій автономного розвитку ШІ-агентів та перевірка 12 засад §46.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  beoordeelKlimopWijziging,
  berekenKnooppuntId,
  canoniekeJson,
  controleerKnooppuntOnafhankelijkheid,
  type KlimopControleVraagId,
  type KlimopKnooppuntIdentiteit,
} from './kern';
import { verifieerStandaardEd25519Handtekening } from './drempelsleutels';
import { verifieerBestuursGrondwetVorm, type KlimopBestuursGrondwet } from './bestuur';
import {
  ondertekenHybrideEd25519MlDsa65,
  verifieerHybrideEd25519MlDsa65,
  verifieerOnafhankelijkAuditRapport,
  type HybrideDubbeleHandtekening,
  type HybridePostkwantumSleutelbundel,
  type KlimopOnafhankelijkAuditRapport,
} from './beveiligingsaudit';

const ZAAD_PAKKET_FROST_DOMEIN = 'klimop-etappe12-zaadpakket-frost-v1|';
const ZAAD_PAKKET_HYBRIDE_DOMEIN = 'klimop-etappe12-zaadpakket-hybride-v1|';
const OPVOLGING_VORIG_QUORUM_DOMEIN = 'klimop-etappe12-opvolging-oud-v1|';
const OPVOLGING_NIEUW_QUORUM_DOMEIN = 'klimop-etappe12-opvolging-nieuw-v1|';

export const KLIMOP_KERNMODULES = Object.freeze([
  'shared/klimop/kern.ts',
  'shared/klimop/stengels.ts',
  'shared/klimop/opslag.ts',
  'shared/klimop/drempelsleutels.ts',
  'shared/klimop/drempel-vervoer.ts',
  'shared/klimop/identiteit.ts',
  'shared/klimop/bestuur.ts',
  'shared/klimop/immuunsysteem.ts',
  'shared/klimop/diensten-catalogus.ts',
  'shared/klimop/diensten.ts',
  'shared/klimop/mensbescherming.ts',
  'shared/klimop/hechtranken.ts',
  'shared/klimop/beveiligingsaudit.ts',
  'shared/klimop/zaden.ts',
] as const);
/** Синонім зворотної сумісності для споживачів, які зверталися за історичною назвою константи Етапу 12. */
export const KLIMOP_TWAALF_KERNMODULES = KLIMOP_KERNMODULES;
export type KlimopKernModulePad = (typeof KLIMOP_KERNMODULES)[number];

// =================================================================================================
// 1. Перелік перевірених технічних залежностей екосистеми (§44 п. 19, Документ №19)
// =================================================================================================

export interface KlimopTechnischeAfhankelijkheid {
  afhankelijkheidId: string;
  onderdeelNaam: string;
  openStandaardOfSpecificatie: string;
  vereistProprietaireCloudDienst: false; // Жодної примусової сторонньої хмари для ядра «Плюща»!
  alleenOvergangsTerugvallijn: boolean;
  vervangingsPadUk: string;
}

export const KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN: readonly KlimopTechnischeAfhankelijkheid[] = Object.freeze([
  {
    afhankelijkheidId: 'DEP-01',
    onderdeelNaam: 'Node.js LTS v24/v26 + node:crypto (OpenSSL 3.5+)',
    openStandaardOfSpecificatie: 'ECMA-262 / RFC 8032 / RFC 7748 / RFC 8439 / FIPS 203 / FIPS 204',
    vereistProprietaireCloudDienst: false,
    alleenOvergangsTerugvallijn: false,
    vervangingsPadUk: 'Будь-яке сумісне середовище виконання зі стандартними примітивами Ed25519, X25519, ChaCha20-Poly1305, ML-DSA-65 та ML-KEM-768.',
  },
  {
    afhankelijkheidId: 'DEP-02',
    onderdeelNaam: 'Протокол взаємно автентифікованих каналів «Стебла»',
    openStandaardOfSpecificatie: 'X25519 + Ed25519 + HKDF-SHA-256 (RFC 5869) + ChaCha20-Poly1305 (RFC 8439)',
    vereistProprietaireCloudDienst: false,
    alleenOvergangsTerugvallijn: false,
    vervangingsPadUk: 'Пряме перемикання профілю шифрування через узгодження версій на AES-256-GCM або гібридний постквантовий обмін X25519+ML-KEM-768.',
  },
  {
    afhankelijkheidId: 'DEP-03',
    onderdeelNaam: 'Конвертне шифрування та завадостійкі коди Ріда–Соломона',
    openStandaardOfSpecificatie: 'ChaCha20-Poly1305 / AES-256-GCM + коди Ріда–Соломона над скінченним полем GF(2^8)',
    vereistProprietaireCloudDienst: false,
    alleenOvergangsTerugvallijn: false,
    vervangingsPadUk: 'Самодостатня реалізація в shared/klimop/opslag.ts без зовнішніх двійкових бібліотек; переналаштування параметрів (k, m) за маніфестом об’єкта.',
  },
  {
    afhankelijkheidId: 'DEP-04',
    onderdeelNaam: 'Перевірюваний поділ секретів і порогові підписи Шнорра',
    openStandaardOfSpecificatie: 'Схеми Фельдмана і Педерсена над Ed25519 + FROST(Ed25519, SHA-512) RFC 9591',
    vereistProprietaireCloudDienst: false,
    alleenOvergangsTerugvallijn: false,
    vervangingsPadUk: 'Повна математична реалізація в shared/klimop/drempelsleutels.ts, чиї 64-байтні підписи перевіряються будь-яким стандартним перевіряльником RFC 8032.',
  },
  {
    afhankelijkheidId: 'DEP-05',
    onderdeelNaam: 'Самосуверенна ідентичність, груповий захист та безконфліктне злиття',
    openStandaardOfSpecificatie: 'klid1_ / psid1_ (SHA-256 + HKDF) + принципи MLS (RFC 9420) + HLC LWW-CRDT',
    vereistProprietaireCloudDienst: false,
    alleenOvergangsTerugvallijn: false,
    vervangingsPadUk: 'Відкриті канонічні JSON-структури зі схемою версій і детермінованим злиттям на будь-якому незалежному вузлі синхронізації.',
  },
  {
    afhankelijkheidId: 'DEP-06',
    onderdeelNaam: 'Поточна реляційна база PostgreSQL 18.6 та резервні архіви age',
    openStandaardOfSpecificatie: 'SQL / PostgreSQL 18.6 + age-encryption.org v1',
    vereistProprietaireCloudDienst: false,
    alleenOvergangsTerugvallijn: true,
    vervangingsPadUk: 'Використовується як недоторканна робоча лінія повернення (§35) до окремого рішення власника про переведення кожної служби.',
  },
]);

export function valideerTechnischeAfhankelijkheden(
  lijst: readonly KlimopTechnischeAfhankelijkheid[] = KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN,
): { ok: boolean; aantal: number; fouten: string[] } {
  const fouten: string[] = [];
  if (lijst.length < 6) fouten.push('ONVOLLEDIGE_AFHANKELIJKHEDENLIJST');

  for (const dep of lijst) {
    if ((dep as { vereistProprietaireCloudDienst: boolean }).vereistProprietaireCloudDienst !== false) {
      fouten.push(`VERBODEN_PROPRIETAIRE_CLOUD_VEREISTE:${dep.afhankelijkheidId}`);
    }
    if (!dep.openStandaardOfSpecificatie.trim() || dep.vervangingsPadUk.trim().length < 20) {
      fouten.push(`ONTBREKEND_VERVANGINGSPAD:${dep.afhankelijkheidId}`);
    }
  }
  return { ok: fouten.length === 0, aantal: lijst.length, fouten };
}

// =================================================================================================
// 2. Самодостатній пакет відтворення з нуля — «Насіння» (§1.7, §36 Етап 12, Документ №19)
// =================================================================================================

export interface ZaadOnderdeelInvoer {
  pad: string;
  inhoudUtf8: string;
}

export interface ZaadOnderdeelManifestRegel {
  pad: string;
  grootteBytes: number;
  sha256: string;
}

export interface KlimopZaadPakket {
  schema: 1;
  zaadId: string;
  versieLabel: string;
  opgesteldOp: string;
  etappe11AuditId: string;
  grondwet: KlimopBestuursGrondwet;
  startToetredingsKnooppunten: readonly KlimopKnooppuntIdentiteit[];
  onderdelenManifest: readonly ZaadOnderdeelManifestRegel[];
  merkleWortelSha256: string;
  bevatGeheimeSleutelsOfPriveInhoud: false;
  frostGroepsHandtekeningHex: string;
  hybrideZaadHandtekening: HybrideDubbeleHandtekening;
  /** Самодостатні тексти перевірених складників для повної відбудови на чистому середовищі без старого сервера. */
  ingebeddeOnderdelenUtf8: Readonly<Record<string, string>>;
}

const GEHEIME_PATRONEN: readonly RegExp[] = [
  /-----BEGIN\x20(?:RSA\x20|EC\x20|OPENSSH\x20)?PRIVATE\x20KEY-----/,
  /"(?:ed25519G|g)eheimeSleutelPkcs8B64u"\s*:\s*"[A-Za-z0-9_-]{32,}"/,
  /(?:^|\n)\s*POSTGRES_PASSWORD\s*=\s*\S+/,
];

function bevatGeheimMateriaal(tekst: string): boolean {
  return GEHEIME_PATRONEN.some((patroon) => patroon.test(tekst));
}

/** Позначка схеми дерева Меркла «Насіння» (KLIMOP-019). */
export const ZAAD_MERKLE_SCHEMA = 'klimop-zaad-merkle-v2';

/**
 * Обчислює детермінований корінь дерева Меркла SHA-256 над переліком складників «Насіння» (схема v2).
 *
 * KLIMOP-019, вади попередньої схеми, знайдені незалежною перевіркою AUDIT-002:
 *   - `localeCompare` залежав від мовних налаштувань середовища — тепер порядок суто побайтовий (UTF-8);
 *   - повтор останнього непарного листка давав однаковий корінь для різних переліків — тепер непарний
 *     вузол переноситься на рівень вище без дублювання;
 *   - текстовий роздільник «|» допускав неоднозначність — тепер листки й вузли кодуються двійково з
 *     доменними префіксами 0x00 (листок) і 0x01 (вузол) та явними довжинами полів (як у RFC 6962);
 *   - повторювані шляхи тепер відхиляються (`ZAAD_DUBBEL_PAD`), а не мовчки потрапляють у дерево.
 */
export function berekenZaadMerkleWortelSha256(
  regels: readonly ZaadOnderdeelManifestRegel[],
): string {
  if (regels.length === 0) {
    return createHash('sha256').update(`${ZAAD_MERKLE_SCHEMA}|leeg`, 'utf8').digest('hex');
  }
  const gesorteerd = [...regels]
    .map((r) => ({ r, padBytes: Buffer.from(r.pad, 'utf8') }))
    .sort((a, b) => Buffer.compare(a.padBytes, b.padBytes));
  for (let i = 1; i < gesorteerd.length; i++) {
    if (gesorteerd[i].padBytes.equals(gesorteerd[i - 1].padBytes)) throw new Error('ZAAD_DUBBEL_PAD');
  }
  let laag: Buffer[] = gesorteerd.map(({ r, padBytes }) => {
    if (!/^[0-9a-f]{64}$/.test(r.sha256)) throw new Error('ZAAD_SHA256_ONGELDIG');
    if (!Number.isSafeInteger(r.grootteBytes) || r.grootteBytes < 0) throw new Error('ZAAD_GROOTTE_ONGELDIG');
    const lengte = Buffer.alloc(4);
    lengte.writeUInt32BE(padBytes.length, 0);
    const grootte = Buffer.alloc(8);
    grootte.writeBigUInt64BE(BigInt(r.grootteBytes), 0);
    return createHash('sha256')
      .update(Buffer.from([0x00]))
      .update(lengte)
      .update(padBytes)
      .update(grootte)
      .update(Buffer.from(r.sha256, 'hex'))
      .digest();
  });

  while (laag.length > 1) {
    const volgende: Buffer[] = [];
    for (let i = 0; i < laag.length; i += 2) {
      if (i + 1 >= laag.length) {
        volgende.push(laag[i]); // непарний вузол переноситься без дублювання
        continue;
      }
      volgende.push(createHash('sha256').update(Buffer.from([0x01])).update(laag[i]).update(laag[i + 1]).digest());
    }
    laag = volgende;
  }
  return laag[0].toString('hex');
}

export function maakZaadPakketTekenKern(kern: {
  schema: 1;
  zaadId: string;
  versieLabel: string;
  opgesteldOp: string;
  etappe11AuditId: string;
  grondwet: KlimopBestuursGrondwet;
  startToetredingsKnooppunten: readonly KlimopKnooppuntIdentiteit[];
  onderdelenManifest: readonly ZaadOnderdeelManifestRegel[];
  merkleWortelSha256: string;
  bevatGeheimeSleutelsOfPriveInhoud: false;
}): { frostBoodschap: Buffer; hybrideBoodschap: Buffer } {
  const json = canoniekeJson(kern);
  return {
    frostBoodschap: Buffer.from(ZAAD_PAKKET_FROST_DOMEIN + json, 'utf8'),
    hybrideBoodschap: Buffer.from(ZAAD_PAKKET_HYBRIDE_DOMEIN + json, 'utf8'),
  };
}

export interface VerwachteZaadBewaarderSleutels {
  ed25519PubliekDerB64u: string;
  mlDsa65PubliekSpkiB64u?: string;
}

/** KLIMOP-020: перевірка канонічності та безпеки відносного шляху складника «Насіння». */
export function isGeldigZaadOnderdeelPad(pad: string): boolean {
  if (typeof pad !== 'string' || pad.length === 0 || pad.length > 256) return false;
  if (pad.startsWith('/') || pad.endsWith('/') || pad.includes('\\') || pad.includes('\0') || pad.includes('//')) {
    return false;
  }
  const delen = pad.split('/');
  return delen.every((d) => d.length > 0 && d !== '.' && d !== '..');
}

/** KLIMOP-020: канонічний відбиток SHA-256 повного підписаного пакета «Насіння» для звірки на кворумі. */
export function berekenZaadPakketSha256(pakket: KlimopZaadPakket): string {
  return createHash('sha256').update(canoniekeJson(pakket), 'utf8').digest('hex');
}

/**
 * Готує та запечатує самодостатній пакет незалежного відтворення екосистеми — «Насіння» (§1.7, Документ №19):
 *   - примусово вимагає пройденого аудиту Етапу 11 (`vrijgegevenVoorEtappe12 === true`);
 *   - перевіряє наявність усіх 12 базових модулів «Плюща» і повну відсутність секретів чи приватних даних;
 *   - вимагає щонайменше 2 незалежних стартових вузлів у різних юрисдикціях і в різних постачальників;
 *   - скріплює корінь Меркла одночасно пороговим підписом FROST ради хранителів та гібридним постквантовим підписом.
 */
export function stelKlimopZaadPakketSamen(opties: {
  zaadId?: string;
  versieLabel: string;
  etappe11Rapport: KlimopOnafhankelijkAuditRapport;
  erkendeAuditorSleutels: ReadonlyArray<{
    auditorKnooppuntId: string;
    ed25519PubliekDerB64u: string;
    mlDsa65PubliekSpkiB64u: string;
  }>;
  grondwet: KlimopBestuursGrondwet;
  startToetredingsKnooppunten: readonly KlimopKnooppuntIdentiteit[];
  onderdelen: readonly ZaadOnderdeelInvoer[];
  zaadBewaarder: HybridePostkwantumSleutelbundel;
  tekenMetFrostGroep: (frostBoodschap: Buffer) => string; // повертає 128-символьний hex порогового підпису FROST
  nuIso?: string;
}): { ok: true; pakket: KlimopZaadPakket } | { ok: false; fout: string } {
  const auditVer = verifieerOnafhankelijkAuditRapport({
    rapport: opties.etappe11Rapport,
    erkendeAuditorSleutels: opties.erkendeAuditorSleutels,
  });
  if (!auditVer.ok) {
    return { ok: false, fout: `ETAPPE_11_AUDIT_ONGELDIG:${auditVer.fout}` };
  }
  if (!opties.etappe11Rapport.vrijgegevenVoorEtappe12) {
    return { ok: false, fout: 'ETAPPE_11_VRIJGAVE_ONTBREEKT' };
  }

  const grondwetVorm = verifieerBestuursGrondwetVorm(opties.grondwet);
  if (!grondwetVorm.ok) {
    return { ok: false, fout: grondwetVorm.fout };
  }
  if (opties.startToetredingsKnooppunten.length < 2) {
    return { ok: false, fout: 'MINSTENS_TWEE_STARTKNOOPPUNTEN_VEREIST' };
  }
  const spreiding = controleerKnooppuntOnafhankelijkheid(opties.startToetredingsKnooppunten, 2);
  if (!spreiding.ok) {
    return { ok: false, fout: 'STARTKNOOPPUNTEN_NIET_ONAFHANKELIJK' };
  }

  const padenSet = new Set<string>();
  for (const ond of opties.onderdelen) {
    if (!isGeldigZaadOnderdeelPad(ond.pad)) {
      return { ok: false, fout: `ZAAD_PAD_ONGELDIG:${ond.pad}` };
    }
    if (padenSet.has(ond.pad)) {
      return { ok: false, fout: 'ZAAD_DUBBEL_PAD' };
    }
    padenSet.add(ond.pad);
  }
  for (const vereistPad of KLIMOP_TWAALF_KERNMODULES) {
    if (!padenSet.has(vereistPad)) {
      return { ok: false, fout: `ZAAD_MIST_KERNMODULE:${vereistPad}` };
    }
  }

  const onderdelenManifest: ZaadOnderdeelManifestRegel[] = [];
  const ingebeddeOnderdelenUtf8: Record<string, string> = {};
  // KLIMOP-020: сталий побайтовий порядок UTF-8 замість залежного від локалі localeCompare
  const gesorteerd = [...opties.onderdelen].sort((a, b) =>
    Buffer.compare(Buffer.from(a.pad, 'utf8'), Buffer.from(b.pad, 'utf8')),
  );

  for (const ond of gesorteerd) {
    if (!ond.inhoudUtf8 || ond.inhoudUtf8.trim().length === 0) {
      return { ok: false, fout: `LEEGE_INHOUD_IN_ZAAD:${ond.pad}` };
    }
    if (bevatGeheimMateriaal(ond.inhoudUtf8)) {
      return { ok: false, fout: `GEHEIM_MATERIAAL_IN_ZAAD_VERBODEN:${ond.pad}` };
    }
    const buf = Buffer.from(ond.inhoudUtf8, 'utf8');
    onderdelenManifest.push({
      pad: ond.pad,
      grootteBytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    });
    ingebeddeOnderdelenUtf8[ond.pad] = ond.inhoudUtf8;
  }

  let merkleWortelSha256: string;
  try {
    merkleWortelSha256 = berekenZaadMerkleWortelSha256(onderdelenManifest);
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : 'ZAAD_MERKLE_ONGELDIG' };
  }
  const kern = {
    schema: 1 as const,
    zaadId: opties.zaadId ?? `zaad1_${randomBytes(10).toString('hex')}`,
    versieLabel: opties.versieLabel,
    opgesteldOp: opties.nuIso ?? new Date().toISOString(),
    etappe11AuditId: opties.etappe11Rapport.auditId,
    grondwet: opties.grondwet,
    startToetredingsKnooppunten: opties.startToetredingsKnooppunten,
    onderdelenManifest,
    merkleWortelSha256,
    bevatGeheimeSleutelsOfPriveInhoud: false as const,
  };

  const { frostBoodschap, hybrideBoodschap } = maakZaadPakketTekenKern(kern);
  const frostGroepsHandtekeningHex = opties.tekenMetFrostGroep(frostBoodschap);
  if (
    !verifieerStandaardEd25519Handtekening(
      frostBoodschap,
      frostGroepsHandtekeningHex,
      opties.grondwet.frostGroepsPubliekeSleutelHex,
    )
  ) {
    return { ok: false, fout: 'ZAAD_FROST_HANDTEKENING_ONGELDIG' };
  }

  const hybrideZaadHandtekening = ondertekenHybrideEd25519MlDsa65(hybrideBoodschap, opties.zaadBewaarder);

  return {
    ok: true,
    pakket: {
      ...kern,
      frostGroepsHandtekeningHex,
      hybrideZaadHandtekening,
      ingebeddeOnderdelenUtf8,
    },
  };
}

/** Перевіряє цілісність усіх вкладень, точну рівність множин, дерево Меркла, відсутність секретів та обидва підписи пакета «Насіння». */
export function verifieerKlimopZaadPakket(
  pakket: KlimopZaadPakket,
  verwachteFrostPubHex?: string,
  verwachteZaadBewaarderSleutels?: VerwachteZaadBewaarderSleutels,
): { ok: true; geverifieerdeModules: number } | { ok: false; fout: string } {
  if (
    !pakket
    || pakket.schema !== 1
    || pakket.bevatGeheimeSleutelsOfPriveInhoud !== false
    || !pakket.ingebeddeOnderdelenUtf8
    || typeof pakket.ingebeddeOnderdelenUtf8 !== 'object'
    || Array.isArray(pakket.ingebeddeOnderdelenUtf8)
  ) {
    return { ok: false, fout: 'ZAAD_PAKKET_VORM_ONGELDIG' };
  }
  const grondwetVorm = verifieerBestuursGrondwetVorm(pakket.grondwet);
  if (!grondwetVorm.ok) {
    return { ok: false, fout: grondwetVorm.fout };
  }
  if (
    verwachteFrostPubHex
    && pakket.grondwet.frostGroepsPubliekeSleutelHex.toLowerCase() !== verwachteFrostPubHex.toLowerCase()
  ) {
    return { ok: false, fout: 'ZAAD_GRONDWET_SLEUTEL_KOMT_NIET_OVEREEN' };
  }
  if (verwachteZaadBewaarderSleutels) {
    if (
      pakket.hybrideZaadHandtekening?.ed25519PubliekDerB64u !== verwachteZaadBewaarderSleutels.ed25519PubliekDerB64u
      || (verwachteZaadBewaarderSleutels.mlDsa65PubliekSpkiB64u !== undefined
        && pakket.hybrideZaadHandtekening?.mlDsa65PubliekSpkiB64u !== verwachteZaadBewaarderSleutels.mlDsa65PubliekSpkiB64u)
    ) {
      return { ok: false, fout: 'ZAAD_BEWAARDER_SLEUTEL_KOMT_NIET_OVEREEN' };
    }
  }
  if (pakket.startToetredingsKnooppunten.length < 2) {
    return { ok: false, fout: 'MINSTENS_TWEE_STARTKNOOPPUNTEN_VEREIST' };
  }
  if (!controleerKnooppuntOnafhankelijkheid(pakket.startToetredingsKnooppunten, 2).ok) {
    return { ok: false, fout: 'STARTKNOOPPUNTEN_NIET_ONAFHANKELIJK' };
  }

  const padenSet = new Set<string>();
  for (const r of pakket.onderdelenManifest) {
    if (!isGeldigZaadOnderdeelPad(r.pad)) {
      return { ok: false, fout: `ZAAD_PAD_ONGELDIG:${r.pad}` };
    }
    if (padenSet.has(r.pad)) {
      return { ok: false, fout: 'ZAAD_DUBBEL_PAD' };
    }
    padenSet.add(r.pad);
  }
  for (const vereistPad of KLIMOP_TWAALF_KERNMODULES) {
    if (!padenSet.has(vereistPad)) {
      return { ok: false, fout: `ZAAD_MIST_KERNMODULE:${vereistPad}` };
    }
  }

  // KLIMOP-020: сувора рівність множини вбудованих файлів і підписаного переліку (заборона непідписаних вкладень)
  const ingebeddeSleutels = Object.keys(pakket.ingebeddeOnderdelenUtf8);
  for (const sleutel of ingebeddeSleutels) {
    if (!padenSet.has(sleutel)) {
      return { ok: false, fout: `ZAAD_ONGETEKEND_ONDERDEEL_AANWEZIG:${sleutel}` };
    }
  }
  if (ingebeddeSleutels.length !== padenSet.size) {
    return { ok: false, fout: 'ZAAD_ONDERDELEN_VERZAMELING_VERSCHILT' };
  }

  for (const regel of pakket.onderdelenManifest) {
    const tekst = Object.prototype.hasOwnProperty.call(pakket.ingebeddeOnderdelenUtf8, regel.pad)
      ? pakket.ingebeddeOnderdelenUtf8[regel.pad]
      : undefined;
    if (typeof tekst !== 'string') {
      return { ok: false, fout: `INGEBED_ONDERDEEL_ONTBREEKT:${regel.pad}` };
    }
    if (bevatGeheimMateriaal(tekst)) {
      return { ok: false, fout: `GEHEIM_MATERIAAL_IN_ZAAD_VERBODEN:${regel.pad}` };
    }
    const buf = Buffer.from(tekst, 'utf8');
    const sha = createHash('sha256').update(buf).digest('hex');
    if (buf.length !== regel.grootteBytes || sha !== regel.sha256) {
      return { ok: false, fout: `ZAAD_ONDERDEEL_BESCHADIGD:${regel.pad}` };
    }
  }

  let berekendeWortel: string;
  try {
    berekendeWortel = berekenZaadMerkleWortelSha256(pakket.onderdelenManifest);
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : 'ZAAD_MERKLE_ONGELDIG' };
  }
  if (berekendeWortel !== pakket.merkleWortelSha256) {
    return { ok: false, fout: 'ZAAD_MERKLE_WORTEL_KLOPT_NIET' };
  }

  const kern = {
    schema: pakket.schema,
    zaadId: pakket.zaadId,
    versieLabel: pakket.versieLabel,
    opgesteldOp: pakket.opgesteldOp,
    etappe11AuditId: pakket.etappe11AuditId,
    grondwet: pakket.grondwet,
    startToetredingsKnooppunten: pakket.startToetredingsKnooppunten,
    onderdelenManifest: pakket.onderdelenManifest,
    merkleWortelSha256: pakket.merkleWortelSha256,
    bevatGeheimeSleutelsOfPriveInhoud: pakket.bevatGeheimeSleutelsOfPriveInhoud,
  };
  const { frostBoodschap, hybrideBoodschap } = maakZaadPakketTekenKern(kern);

  if (
    !verifieerStandaardEd25519Handtekening(
      frostBoodschap,
      pakket.frostGroepsHandtekeningHex,
      pakket.grondwet.frostGroepsPubliekeSleutelHex,
    )
  ) {
    return { ok: false, fout: 'ZAAD_FROST_HANDTEKENING_ONGELDIG' };
  }

  const verwachteHybrideSleutels =
    verwachteZaadBewaarderSleutels?.mlDsa65PubliekSpkiB64u !== undefined
      ? {
          ed25519PubliekDerB64u: verwachteZaadBewaarderSleutels.ed25519PubliekDerB64u,
          mlDsa65PubliekSpkiB64u: verwachteZaadBewaarderSleutels.mlDsa65PubliekSpkiB64u,
        }
      : undefined;
  const vHybride = verifieerHybrideEd25519MlDsa65(
    hybrideBoodschap,
    pakket.hybrideZaadHandtekening,
    verwachteHybrideSleutels,
  );
  if (!vHybride.ok) {
    return { ok: false, fout: `ZAAD_HYBRIDE_HANDTEKENING_ONGELDIG:${vHybride.fout}` };
  }

  return { ok: true, geverifieerdeModules: pakket.onderdelenManifest.length };
}

/**
 * Контрольне розгортання «з нуля» на чистому середовищі без зв'язку зі старим сервером (§1.7, таблиця Етапу 1):
 * будь-яке звернення до старої інфраструктури (`verbindingMetOudeServerGebruikt: true`) негайно визнається провалом!
 */
export function herbouwEcosysteemUitZaadOpSchoonMilieu(opties: {
  pakket: KlimopZaadPakket;
  nieuweGeneratieKnooppunten: readonly KlimopKnooppuntIdentiteit[];
  verbindingMetOudeServerGebruikt: boolean;
  verwachteFrostPubHex?: string;
  verwachteZaadBewaarderSleutels?: VerwachteZaadBewaarderSleutels;
  /** KLIMOP-021: чиста цільова тека розпакування; якщо не вказана — тимчасова тека ОС, яка прибирається після звірки. */
  doelMap?: string;
  bewaarDoelMap?: boolean;
}):
  | {
      ok: true;
      hersteldePadLijst: string[];
      merkleWortelSha256: string;
      nieuweRechtsgebieden: string[];
      opSchijfGeschrevenEnGeverifieerd: true;
      hersteldeBestandenSha256: Record<string, string>;
      doelMap?: string;
    }
  | { ok: false; fout: string } {
  if (opties.verbindingMetOudeServerGebruikt) {
    return { ok: false, fout: 'VERBINDING_MET_OUDE_SERVER_VERBODEN_BIJ_SCHONE_OPBOUW' };
  }
  const ver = verifieerKlimopZaadPakket(
    opties.pakket,
    opties.verwachteFrostPubHex,
    opties.verwachteZaadBewaarderSleutels,
  );
  if (!ver.ok) return ver;

  if (opties.nieuweGeneratieKnooppunten.length < 2) {
    return { ok: false, fout: 'ONVOLDOENDE_NIEUWE_KNOOPPUNTEN' };
  }
  const onafh = controleerKnooppuntOnafhankelijkheid(opties.nieuweGeneratieKnooppunten, 2);
  if (!onafh.ok) {
    return { ok: false, fout: 'NIEUWE_GENERATIE_NIET_ONAFHANKELIJK' };
  }

  // KLIMOP-021: господарська відбудова на чистому носії — записуємо всі модулі на диск і заново звіряємо їхні SHA-256 та корінь Меркла
  const tijdelijkeMap = opties.doelMap ?? mkdtempSync(join(tmpdir(), 'klimop-zaad-herbouw-'));
  const moetOpruimen = !opties.doelMap && opties.bewaarDoelMap !== true;
  const hersteldeBestandenSha256: Record<string, string> = {};
  try {
    mkdirSync(tijdelijkeMap, { recursive: true });
    const herlezenRegels: Array<{ pad: string; sha256: string; grootteBytes: number }> = [];
    for (const regel of opties.pakket.onderdelenManifest) {
      if (!isGeldigZaadOnderdeelPad(regel.pad)) {
        return { ok: false, fout: `ZAAD_PAD_ONGELDIG:${regel.pad}` };
      }
      const doelBestand = join(tijdelijkeMap, regel.pad);
      mkdirSync(dirname(doelBestand), { recursive: true });
      const bronTekst = opties.pakket.ingebeddeOnderdelenUtf8[regel.pad];
      writeFileSync(doelBestand, bronTekst, 'utf8');
      const schijfBuf = readFileSync(doelBestand);
      const schijfSha = createHash('sha256').update(schijfBuf).digest('hex');
      if (schijfBuf.length !== regel.grootteBytes || schijfSha !== regel.sha256) {
        return { ok: false, fout: `ZAAD_SCHIJFHERBOUW_SHA256_FOUT:${regel.pad}` };
      }
      hersteldeBestandenSha256[regel.pad] = schijfSha;
      herlezenRegels.push({ pad: regel.pad, sha256: schijfSha, grootteBytes: schijfBuf.length });
    }
    writeFileSync(
      join(tijdelijkeMap, 'ZAAD-GRONDWET.json'),
      canoniekeJson(opties.pakket.grondwet),
      'utf8',
    );
    const schijfMerkleWortel = berekenZaadMerkleWortelSha256(herlezenRegels);
    if (schijfMerkleWortel !== opties.pakket.merkleWortelSha256) {
      return { ok: false, fout: 'ZAAD_SCHIJFHERBOUW_MERKLE_FOUT' };
    }
    // KLIMOP-022: перевіряємо, що кожен локальний імпорт `./...` всередині розпакованих модулів фізично присутній на носії
    const relImportPatroon = /from\s+['"](\.[^'"]+)['"]/g;
    for (const regel of opties.pakket.onderdelenManifest) {
      if (!regel.pad.endsWith('.ts')) continue;
      const bestandPad = join(tijdelijkeMap, regel.pad);
      const bron = readFileSync(bestandPad, 'utf8');
      relImportPatroon.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = relImportPatroon.exec(bron)) !== null) {
        const relSpec = match[1];
        const kandidaatTs = join(dirname(bestandPad), relSpec.endsWith('.ts') ? relSpec : `${relSpec}.ts`);
        if (!existsSync(kandidaatTs)) {
          return { ok: false, fout: `ZAAD_HERBOUW_ONTBREKENDE_IMPORT:${regel.pad}->${relSpec}` };
        }
      }
    }
  } finally {
    if (moetOpruimen) {
      rmSync(tijdelijkeMap, { recursive: true, force: true });
    }
  }

  const nieuweRechtsgebieden = [
    ...new Set(opties.nieuweGeneratieKnooppunten.map((k) => k.juridischeRegio)),
  ].sort();

  return {
    ok: true,
    hersteldePadLijst: opties.pakket.onderdelenManifest.map((m) => m.pad),
    merkleWortelSha256: opties.pakket.merkleWortelSha256,
    nieuweRechtsgebieden,
    opSchijfGeschrevenEnGeverifieerd: true,
    hersteldeBestandenSha256,
    ...(opties.doelMap || opties.bewaarDoelMap ? { doelMap: tijdelijkeMap } : {}),
  };
}

// =================================================================================================
// 3. Передавання спадкоємності новим уповноваженим учасникам без участі початкового автора (Документ №23)
// =================================================================================================

export interface KlimopOpvolgingsOverdracht {
  schema: 1;
  overdrachtId: string;
  vorigeGrondwet: KlimopBestuursGrondwet;
  nieuweGrondwet: KlimopBestuursGrondwet;
  aangekondigdOp: string;
  uitvoerbaarVanaf: string;
  bekrachtigdOp: string;
  oorspronkelijkeAuteurDeelnameVereist: false;
  toegangTotPersoonlijkeGegevensOvergedragen: false; // §2, §19: хранителі ніколи не отримують доступу до особистих даних!
  vorigeFrostHandtekeningHex: string;
  nieuweFrostHandtekeningHex: string;
}

function maakOpvolgingsKernBoodschappen(kern: {
  schema: 1;
  overdrachtId: string;
  vorigeGrondwet: KlimopBestuursGrondwet;
  nieuweGrondwet: KlimopBestuursGrondwet;
  aangekondigdOp: string;
  uitvoerbaarVanaf: string;
  bekrachtigdOp: string;
  oorspronkelijkeAuteurDeelnameVereist: false;
  toegangTotPersoonlijkeGegevensOvergedragen: false;
}): { oudQuorumBoodschap: Buffer; nieuwQuorumBoodschap: Buffer } {
  const json = canoniekeJson(kern);
  return {
    oudQuorumBoodschap: Buffer.from(OPVOLGING_VORIG_QUORUM_DOMEIN + json, 'utf8'),
    nieuwQuorumBoodschap: Buffer.from(OPVOLGING_NIEUW_QUORUM_DOMEIN + json, 'utf8'),
  };
}

/**
 * Формує двосторонній пороговий акт спадкоємності керування (Документ №23, §1.7, §19–§20):
 *   - вимагає монотонного зростання `versieVolgnummer` конституції та між'юрисдикційної незалежності нової ради хранителів;
 *   - вимагає витриманого часового замка `>= 72` годин (`ecosysteem_regels_wijziging`);
 *   - скріплюється одночасно пороговим підписом FROST попереднього кворуму ТА пороговим підписом FROST нового кворуму;
 *   - НЕ потребує участі початкового автора (`oorspronkelijkeAuteurDeelnameVereist: false`) і НІКОЛИ не передає доступ
 *     до особистих зашифрованих даних користувачів (`toegangTotPersoonlijkeGegevensOvergedragen: false`).
 */
export function stelOpvolgingsOverdrachtSamen(opties: {
  vorigeGrondwet: KlimopBestuursGrondwet;
  nieuweGrondwet: KlimopBestuursGrondwet;
  aangekondigdOp: string;
  bekrachtigdOp: string;
  tekenMetVorigFrostQuorum: (boodschap: Buffer) => string;
  tekenMetNieuwFrostQuorum: (boodschap: Buffer) => string;
}): { ok: true; overdracht: KlimopOpvolgingsOverdracht } | { ok: false; fout: string } {
  const vormVorige = verifieerBestuursGrondwetVorm(opties.vorigeGrondwet);
  if (!vormVorige.ok) return vormVorige;
  const vormNieuwe = verifieerBestuursGrondwetVorm(opties.nieuweGrondwet);
  if (!vormNieuwe.ok) return vormNieuwe;
  if (opties.nieuweGrondwet.versieVolgnummer <= opties.vorigeGrondwet.versieVolgnummer) {
    return { ok: false, fout: 'OPVOLGING_VERSIE_MOET_STIJGEN' };
  }
  if (opties.nieuweGrondwet.drempel < 2 || opties.nieuweGrondwet.erkendeHoeders.length < opties.nieuweGrondwet.drempel) {
    return { ok: false, fout: 'NIEUW_HOEDERSQUORUM_TE_KLEIN' };
  }
  const spreidingNieuw = controleerKnooppuntOnafhankelijkheid(
    opties.nieuweGrondwet.erkendeHoeders,
    opties.nieuweGrondwet.drempel,
  );
  if (!spreidingNieuw.ok) {
    return { ok: false, fout: 'NIEUWE_HOEDERS_NIET_ONAFHANKELIJK' };
  }

  const tAangekondigd = Date.parse(opties.aangekondigdOp);
  const tBekrachtigd = Date.parse(opties.bekrachtigdOp);
  if (!Number.isFinite(tAangekondigd) || !Number.isFinite(tBekrachtigd)) {
    return { ok: false, fout: 'ONGELDIG_TIJDSTIP_OPVOLGING' };
  }
  const minWachttijdMs = 72 * 3600 * 1000;
  const uitvoerbaarVanaf = new Date(tAangekondigd + minWachttijdMs).toISOString();
  if (tBekrachtigd < tAangekondigd + minWachttijdMs) {
    return { ok: false, fout: 'OPVOLGING_TIJDSLOT_72_UUR_NOG_ACTIEF' };
  }

  const kern = {
    schema: 1 as const,
    overdrachtId: `opv1_${randomBytes(10).toString('hex')}`,
    vorigeGrondwet: opties.vorigeGrondwet,
    nieuweGrondwet: opties.nieuweGrondwet,
    aangekondigdOp: opties.aangekondigdOp,
    uitvoerbaarVanaf,
    bekrachtigdOp: opties.bekrachtigdOp,
    oorspronkelijkeAuteurDeelnameVereist: false as const,
    toegangTotPersoonlijkeGegevensOvergedragen: false as const,
  };

  const { oudQuorumBoodschap, nieuwQuorumBoodschap } = maakOpvolgingsKernBoodschappen(kern);
  const vorigeFrostHandtekeningHex = opties.tekenMetVorigFrostQuorum(oudQuorumBoodschap);
  const nieuweFrostHandtekeningHex = opties.tekenMetNieuwFrostQuorum(nieuwQuorumBoodschap);

  const overdracht: KlimopOpvolgingsOverdracht = {
    ...kern,
    vorigeFrostHandtekeningHex,
    nieuweFrostHandtekeningHex,
  };

  const v = verifieerOpvolgingsOverdracht(overdracht);
  if (!v.ok) return v;

  return { ok: true, overdracht };
}

export function verifieerOpvolgingsOverdracht(
  overdracht: KlimopOpvolgingsOverdracht,
  verwachteVorigeFrostSleutelHex?: string,
): { ok: true } | { ok: false; fout: string } {
  if (
    !overdracht
    || overdracht.schema !== 1
    || overdracht.oorspronkelijkeAuteurDeelnameVereist !== false
    || overdracht.toegangTotPersoonlijkeGegevensOvergedragen !== false
  ) {
    return { ok: false, fout: 'OPVOLGING_VORM_OF_SCHEIDING_ONGELDIG' };
  }
  const vormVorige = verifieerBestuursGrondwetVorm(overdracht.vorigeGrondwet);
  if (!vormVorige.ok) return vormVorige;
  const vormNieuwe = verifieerBestuursGrondwetVorm(overdracht.nieuweGrondwet);
  if (!vormNieuwe.ok) return vormNieuwe;
  if (
    verwachteVorigeFrostSleutelHex
    && overdracht.vorigeGrondwet.frostGroepsPubliekeSleutelHex !== verwachteVorigeFrostSleutelHex
  ) {
    return { ok: false, fout: 'OPVOLGING_VORIGE_GRONDWET_KOMT_NIET_OVEREEN' };
  }
  if (overdracht.nieuweGrondwet.versieVolgnummer <= overdracht.vorigeGrondwet.versieVolgnummer) {
    return { ok: false, fout: 'OPVOLGING_VERSIE_MOET_STIJGEN' };
  }
  if (
    overdracht.nieuweGrondwet.drempel < 2
    || !controleerKnooppuntOnafhankelijkheid(
      overdracht.nieuweGrondwet.erkendeHoeders,
      overdracht.nieuweGrondwet.drempel,
    ).ok
  ) {
    return { ok: false, fout: 'NIEUWE_HOEDERS_NIET_ONAFHANKELIJK' };
  }

  const tAan = Date.parse(overdracht.aangekondigdOp);
  const tBekr = Date.parse(overdracht.bekrachtigdOp);
  if (!Number.isFinite(tAan) || !Number.isFinite(tBekr) || tBekr < tAan + 72 * 3600 * 1000) {
    return { ok: false, fout: 'OPVOLGING_TIJDSLOT_72_UUR_NOG_ACTIEF' };
  }

  const { vorigeFrostHandtekeningHex, nieuweFrostHandtekeningHex, ...kern } = overdracht;
  const { oudQuorumBoodschap, nieuwQuorumBoodschap } = maakOpvolgingsKernBoodschappen(kern);

  if (
    !verifieerStandaardEd25519Handtekening(
      oudQuorumBoodschap,
      vorigeFrostHandtekeningHex,
      overdracht.vorigeGrondwet.frostGroepsPubliekeSleutelHex,
    )
  ) {
    return { ok: false, fout: 'OPVOLGING_VORIG_FROST_QUORUM_ONGELDIG' };
  }
  if (
    !verifieerStandaardEd25519Handtekening(
      nieuwQuorumBoodschap,
      nieuweFrostHandtekeningHex,
      overdracht.nieuweGrondwet.frostGroepsPubliekeSleutelHex,
    )
  ) {
    return { ok: false, fout: 'OPVOLGING_NIEUW_FROST_QUORUM_ONGELDIG' };
  }

  return { ok: true };
}

// =================================================================================================
// 4. Постійний розвиток 16 напрямів ШІ-агентів без необмеженої автономії (§32–§34, §36 Етап 12) та 12 засад §46
// =================================================================================================

export const KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN = Object.freeze([
  'algemene_architectuur',        // 1. Загальна архітектура
  'tussenknooppunt_verbinding',   // 2. Міжвузловий зв'язок
  'cryptografie',                 // 3. Криптографія
  'verdeelde_opslag',             // 4. Розподілене зберігання
  'identiteit',                   // 5. Ідентичність
  'toegangsherstel',              // 6. Відновлення
  'mensbescherming',              // 7. Захист людини
  'gezamenlijk_bestuur',          // 8. Система спільного керування
  'externe_verbinders',           // 9. З'єднувачі зовнішніх служб
  'zelfherstel',                  // 10. Самовідновлення
  'uitgavebeveiliging',           // 11. Захист випусків
  'beveiligingsaudit',            // 12. Перевірка безпеки
  'prestatie_en_middelen',        // 13. Швидкодія та ресурси
  'privacy_en_metadata',          // 14. Приватність
  'compatibiliteit_en_migratie',  // 15. Сумісність і перенесення
  'documentatie_en_beheer',       // 16. Документація та супровід
] as const);
export type KlimopOntwikkelRichtingId = (typeof KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN)[number];

export interface AutonoomAgentOntwikkelVoorstel {
  voorstelId: string;
  agentId: string;
  richting: KlimopOntwikkelRichtingId;
  regelsVersie: string;
  bevatTestBewijs: boolean;
  antwoorden15: Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  probeertZelfGoedTeKeurenOfUitTeRollen: boolean;
  wijzigtCryptoregelsZonderQuorum: boolean;
  breidtEigenRechtenUit: boolean;
  onthultGeheimen: boolean;
}

/**
 * Перевіряє пропозицію ШІ-агента у контурі постійного розвитку Етапу 12 (§32–§34):
 * дозволяє автономний пошук вад і підготовку перевірених покращень, але блокує будь-яку спробу
 * самосхвалення, обходу кворуму, розширення власних прав або розкриття секретів.
 */
export function beoordeelAutonoomOntwikkelVoorstel(
  voorstel: AutonoomAgentOntwikkelVoorstel,
): { toegestaanAlsVoorstel: boolean; vereistMenselijkOfQuorumBesluit: true; fouten: string[] } {
  const fouten: string[] = [];
  if (!KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN.includes(voorstel.richting)) {
    fouten.push('ONBEKENDE_ONTWIKKELRICHTING');
  }
  if (!voorstel.regelsVersie.trim()) {
    fouten.push('REGELSVERSIE_ONTBREEKT');
  }
  if (!voorstel.bevatTestBewijs) {
    fouten.push('FEITELIJK_TESTBEWIJS_VEREIST');
  }
  if (voorstel.probeertZelfGoedTeKeurenOfUitTeRollen) {
    fouten.push('AI_ZELFGOEDKEURING_OF_UITROL_VERBODEN');
  }
  if (voorstel.wijzigtCryptoregelsZonderQuorum) {
    fouten.push('EIGENMACHTIGE_CRYPTOREGEL_WIJZIGING_VERBODEN');
  }
  if (voorstel.breidtEigenRechtenUit) {
    fouten.push('ZELFSTANDIGE_RECHTENUITBREIDING_VERBODEN');
  }
  if (voorstel.onthultGeheimen) {
    fouten.push('GEHEIM_OPENBAARMAKING_VERBODEN');
  }

  const arch = beoordeelKlimopWijziging({
    naam: `Пропозиція ${voorstel.voorstelId} (${voorstel.richting})`,
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: voorstel.probeertZelfGoedTeKeurenOfUitTeRollen,
    antwoorden15: voorstel.antwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  fouten.push(...arch.fouten);

  return {
    toegestaanAlsVoorstel: fouten.length === 0,
    vereistMenselijkOfQuorumBesluit: true,
    fouten,
  };
}

export const KLIMOP_EINDVISIE_TWAALF_PIJLERS = Object.freeze([
  'persoon_onafhankelijke_eigenaar_van_gegevens',       // §46.1
  'vertrouwd_apparaat_beperkte_functies',               // §46.2
  'knooppunt_beperkte_rol_en_verifieerbaar',            // §46.3
  'dienst_geisoleerd_met_expliciete_rechten',           // §46.4
  'kritieke_sleutel_volledige_levenscyclus',            // §46.5
  'belangrijk_besluit_herleidbaar_en_afgestemd',        // §46.6
  'kritieke_verbinding_alternatieven_gedocumenteerd',   // §46.7
  'uitgave_vooraf_getoetst_zonder_vertrouwensbreuk',    // §46.8
  'storing_geeft_begrensde_verifieerbare_reactie',      // §46.9
  'gebruiker_kan_uittreden_en_rechten_intrekken',       // §46.10
  'ai_agent_helpt_zonder_onbeperkte_macht',             // §46.11
  'toekomstige_ontwikkelaar_kan_voortzetten_uit_zaad',  // §46.12
] as const);
export type KlimopEindvisiePijlerId = (typeof KLIMOP_EINDVISIE_TWAALF_PIJLERS)[number];

export interface EindvisiePijlerBewijs {
  pijlerId: KlimopEindvisiePijlerId;
  verwezenlijktInModule: KlimopKernModulePad;
  geverifieerd: boolean;
}

export interface KlimopVerplichtDocument44Definitie {
  readonly nummer44: number;
  readonly titelUk: string;
  readonly ukPad: string;
  readonly nlPad: string;
  readonly vereistKenmerk: string;
}

/**
 * KLIMOP-021: первинний реєстр усіх 25 обов'язкових двомовних документів точно за §44 Головного маніфесту
 * (`docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`, рядки 1052–1076) із прив'язкою обох мовних версій і перевірного маркера змісту.
 */
export const KLIMOP_VIJFENTWINTIG_VERPLICHTE_DOCUMENTEN: readonly KlimopVerplichtDocument44Definitie[] = Object.freeze([
  { nummer44: 1, titelUk: 'Повний аудит чинного «Мого простору»', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-0-АУДИТ-ДІЙСНОГО-СТАНУ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-0-AUDIT-FEITELIJKE-STAAT.nl.md', vereistKenmerk: 'SPOF-1' },
  { nummer44: 2, titelUk: 'Архітектурна схема «Плющ»', ukPad: 'docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md', nlPad: 'docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md', vereistKenmerk: '44.' },
  { nummer44: 3, titelUk: 'Модель вузлів і зв’язків', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-2-BEPROEVINGSNETWERK-EN-STENGELS.nl.md', vereistKenmerk: 'stengels.ts' },
  { nummer44: 4, titelUk: 'Модель загроз', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md', vereistKenmerk: 'KLIMOP_DREIGINGS_MODEL' },
  { nummer44: 5, titelUk: 'Модель довіри', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md', vereistKenmerk: 'Ed25519' },
  { nummer44: 6, titelUk: 'Правила криптографії', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-4-РОЗПОДІЛЕНІ-КЛЮЧІ-ТА-ПОРОГОВІ-ПІДПИСИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-4-GEDISTRIBUEERDE-SLEUTELS-EN-DREMPELHANDTEKENINGEN.nl.md', vereistKenmerk: 'FROST' },
  { nummer44: 7, titelUk: 'Схема розподіленого зберігання', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-3-VERSLEUTELING-EN-VERDEELDE-OPSLAG.nl.md', vereistKenmerk: 'Reed-Solomon' },
  { nummer44: 8, titelUk: 'Модель ідентичності', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-5-ONAFHANKELIJKE-IDENTITEIT-EN-GROEPSRUIMTES.nl.md', vereistKenmerk: 'klid1_' },
  { nummer44: 9, titelUk: 'Порядок відновлення доступу', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-5-ONAFHANKELIJKE-IDENTITEIT-EN-GROEPSRUIMTES.nl.md', vereistKenmerk: 'identiteit.ts' },
  { nummer44: 10, titelUk: 'Модель захисту людини', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-9-ЗАХИСТ-ЛЮДИНИ-ТА-ПРОТИДІЯ-ПРИМУСУ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-9-MENSBESCHERMING-EN-DWANGBESTENDIGHEID.nl.md', vereistKenmerk: 'mensbescherming.ts' },
  { nummer44: 11, titelUk: 'Порядок розподіленого керування', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-6-РОЗПОДІЛЕНЕ-КЕРУВАННЯ-ТА-БЕЗПЕЧНІ-ВИПУСКИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md', vereistKenmerk: 'bestuur.ts' },
  { nummer44: 12, titelUk: 'Специфікація самовідновлення', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-7-ІМУННА-СИСТЕМА-ТА-САМОВІДНОВЛЕННЯ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-7-IMMUUNSYSTEEM-EN-ZELFHERSTEL.nl.md', vereistKenmerk: 'immuunsysteem.ts' },
  { nummer44: 13, titelUk: 'Правила безпечних випусків', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-6-РОЗПОДІЛЕНЕ-КЕРУВАННЯ-ТА-БЕЗПЕЧНІ-ВИПУСКИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md', vereistKenmerk: 'klimop-bestuur-client.ts' },
  { nummer44: 14, titelUk: 'Правила участі користувацьких пристроїв', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-10-КЕРОВАНЕ-РОЗШИРЕННЯ-ТА-ОБМІН-РЕСУРСАМИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-10-BEHEERSTE-UITBREIDING-EN-MIDDELENUITWISSELING.nl.md', vereistKenmerk: 'hechtranken.ts' },
  { nummer44: 15, titelUk: 'Модель ресурсів і винагород', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-10-КЕРОВАНЕ-РОЗШИРЕННЯ-ТА-ОБМІН-РЕСУРСАМИ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-10-BEHEERSTE-UITBREIDING-EN-MIDDELENUITWISSELING.nl.md', vereistKenmerk: 'berekenEerlijkeMiddelenBalans' },
  { nummer44: 16, titelUk: 'Специфікація зовнішніх з’єднувачів', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-8-ПЕРЕНЕСЕННЯ-СЛУЖБ-ТА-ІЗОЛЬОВАНІ-ЗЄДНУВАЧІ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-8-DIENSTENOVERDRACHT-EN-GEISOLEERDE-VERBINDERS.nl.md', vereistKenmerk: 'diensten.ts' },
  { nummer44: 17, titelUk: 'План перенесення бази даних', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-15-ПОДВІЙНЕ-ЗАПИСУВАННЯ-ЗВІРКА-ЧИТАННЯ-ТА-ПОВЕРНЕННЯ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-15-DUBBEL-SCHRIJVEN-LEESVERIFICATIE-EN-TERUGVAL.nl.md', vereistKenmerk: 'PostgreSQL 18.6' },
  { nummer44: 18, titelUk: 'План перенесення кожної чинної служби', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-14-ПАСИВНЕ-ЧИТАННЯ-ЖУРНАЛ-РОЗБІЖНОСТЕЙ-ТА-ПЕРЕМИКАЧ-ПОВЕРНЕННЯ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-14-PASSIEF-LEZEN-AFWIJKINGSLOGBOEK-EN-TERUGSCHAKELING.nl.md', vereistKenmerk: 'klimop-overdracht-opslag.ts' },
  { nummer44: 19, titelUk: 'Перелік технічних залежностей', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-12-ZADEN-OPVOLGING-EN-DUURZAME-ONTWIKKELING.nl.md', vereistKenmerk: 'KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN' },
  { nummer44: 20, titelUk: 'Програма випробувань', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-7-ІМУННА-СИСТЕМА-ТА-САМОВІДНОВЛЕННЯ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-7-IMMUUNSYSTEEM-EN-ZELFHERSTEL.nl.md', vereistKenmerk: 'klimop-etappe7-immuunsysteem-proef.mjs' },
  { nummer44: 21, titelUk: 'Перелік невирішених ризиків', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md', vereistKenmerk: 'beveiligingsaudit.ts' },
  { nummer44: 22, titelUk: 'План незалежної перевірки', ukPad: 'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md', nlPad: 'docs/hub/KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md', vereistKenmerk: 'KLIMOP-018' },
  { nummer44: 23, titelUk: 'Поетапний план випусків', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-16-КВОРУМНИЙ-АТЕСТАТ-СХОДИНКИ-4-ТА-ПОРОГОВИЙ-ДОПУСК.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-16-STAP-4-QUORUMATTEST-EN-DREMPELVRIJGAVE.nl.md', vereistKenmerk: 'FROST' },
  { nummer44: 24, titelUk: 'Переглянуті правила ШІ-агентів', ukPad: 'AGENTS.md', nlPad: 'AGENTENREGELS.nl.md', vereistKenmerk: 'KLIMOP-001' },
  { nummer44: 25, titelUk: 'План подальшого розвитку', ukPad: 'docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.uk.md', nlPad: 'docs/hub/KLIMOP-FASE-12-ZADEN-OPVOLGING-EN-DUURZAME-ONTWIKKELING.nl.md', vereistKenmerk: 'valideerKlimopEindvisie46' },
]);

export interface KlimopDocument44ControleRegel {
  nummer44: number;
  titelUk: string;
  ukPad: string;
  nlPad: string;
  status: 'bevestigd' | 'gedeeltelijk' | 'ontbrekend';
  ukSha256: string | null;
  nlSha256: string | null;
  ukKoppenAantal?: number;
  nlKoppenAantal?: number;
}

export interface KlimopDocument44ControleVerslag {
  totaal: 25;
  bevestigdAantal: number;
  gedeeltelijkAantal: number;
  ontbrekendAantal: number;
  onderwerpen: KlimopDocument44ControleRegel[];
}

/**
 * KLIMOP-021 / KLIMOP-022: справжня змістовна звірка всіх 25 обов'язкових документів §44 маніфесту:
 * читає обидві мовні версії з диска, обчислює їхні `SHA-256`, перевіряє мінімальний обсяг,
 * паритетність кількості розділів `## `, наявність тематичного маркера та відсутність позначок незавершеності.
 */
export function controleerVijfentwintigVerplichteDocumenten(wortelPad: string): KlimopDocument44ControleVerslag {
  let bevestigdAantal = 0;
  let gedeeltelijkAantal = 0;
  let ontbrekendAantal = 0;
  const onderwerpen: KlimopDocument44ControleRegel[] = [];

  for (const def of KLIMOP_VIJFENTWINTIG_VERPLICHTE_DOCUMENTEN) {
    const volUk = join(wortelPad, def.ukPad);
    const volNl = join(wortelPad, def.nlPad);
    const heeftUk = existsSync(volUk);
    const heeftNl = existsSync(volNl);
    if (!heeftUk && !heeftNl) {
      ontbrekendAantal++;
      onderwerpen.push({
        nummer44: def.nummer44,
        titelUk: def.titelUk,
        ukPad: def.ukPad,
        nlPad: def.nlPad,
        status: 'ontbrekend',
        ukSha256: null,
        nlSha256: null,
        ukKoppenAantal: 0,
        nlKoppenAantal: 0,
      });
      continue;
    }
    const ukTekst = heeftUk ? readFileSync(volUk, 'utf8') : '';
    const nlTekst = heeftNl ? readFileSync(volNl, 'utf8') : '';
    const ukSha256 = heeftUk ? createHash('sha256').update(ukTekst, 'utf8').digest('hex') : null;
    const nlSha256 = heeftNl ? createHash('sha256').update(nlTekst, 'utf8').digest('hex') : null;
    const ukKoppenAantal = (ukTekst.match(/^## /gm) ?? []).length;
    const nlKoppenAantal = (nlTekst.match(/^## /gm) ?? []).length;
    const koppenGelijkwaardig = ukKoppenAantal >= 1 && nlKoppenAantal === ukKoppenAantal;
    const ukVolledig =
      ukTekst.trim().length >= 400
      && ukTekst.includes(def.vereistKenmerk)
      && !ukTekst.includes('Заплановано (Етап');
    const nlVolledig =
      nlTekst.trim().length >= 400
      && nlTekst.includes(def.vereistKenmerk)
      && !nlTekst.includes('Gepland (Fase');

    if (ukVolledig && nlVolledig && koppenGelijkwaardig) {
      bevestigdAantal++;
      onderwerpen.push({
        nummer44: def.nummer44,
        titelUk: def.titelUk,
        ukPad: def.ukPad,
        nlPad: def.nlPad,
        status: 'bevestigd',
        ukSha256,
        nlSha256,
        ukKoppenAantal,
        nlKoppenAantal,
      });
    } else {
      gedeeltelijkAantal++;
      onderwerpen.push({
        nummer44: def.nummer44,
        titelUk: def.titelUk,
        ukPad: def.ukPad,
        nlPad: def.nlPad,
        status: 'gedeeltelijk',
        ukSha256,
        nlSha256,
        ukKoppenAantal,
        nlKoppenAantal,
      });
    }
  }

  return {
    totaal: 25,
    bevestigdAantal,
    gedeeltelijkAantal,
    ontbrekendAantal,
    onderwerpen,
  };
}

/** Приймальна звірка всіх 12 засад кінцевого бачення §46 та повного комплекту 25 обов'язкових документів §44. */
export function valideerKlimopEindvisie46(opties: {
  pijlers: readonly EindvisiePijlerBewijs[];
  voltooideVerplichteDocumenten44: number;
  alleTwaalfEtappesVoltooid: boolean;
  productieInfrastructuurOnaangetast: boolean;
  /** KLIMOP-021: якщо передано корінь сховища, перевіряє справжній вміст модулів і всіх 25 пар документів на диску. */
  wortelPad?: string;
}): {
  ok: boolean;
  gedektePijlers: number;
  bevestigdeDocumentenOpSchijf?: number;
  moduleBronnenSha256?: Record<string, string>;
  fouten: string[];
} {
  const fouten: string[] = [];
  const gezien = new Set<KlimopEindvisiePijlerId>();
  const moduleBronnenSha256: Record<string, string> = {};

  for (const p of opties.pijlers) {
    gezien.add(p.pijlerId);
    if (!p.geverifieerd || !KLIMOP_TWAALF_KERNMODULES.includes(p.verwezenlijktInModule)) {
      fouten.push(`EINDVISIE_PIJLER_NIET_BEWEZEN:${p.pijlerId}`);
      continue;
    }
    if (opties.wortelPad) {
      const volModPad = join(opties.wortelPad, p.verwezenlijktInModule);
      if (!existsSync(volModPad)) {
        fouten.push(`EINDVISIE_MODULE_ONTBREEKT_OP_SCHIJF:${p.verwezenlijktInModule}`);
      } else {
        const inhoud = readFileSync(volModPad, 'utf8');
        if (inhoud.trim().length < 200 || !inhoud.includes('export ')) {
          fouten.push(`EINDVISIE_MODULE_LEEG_OF_ONGELDIG:${p.verwezenlijktInModule}`);
        } else {
          moduleBronnenSha256[p.verwezenlijktInModule] = createHash('sha256').update(inhoud, 'utf8').digest('hex');
        }
      }
    }
  }
  for (const vereist of KLIMOP_EINDVISIE_TWAALF_PIJLERS) {
    if (!gezien.has(vereist)) fouten.push(`ONTBREKENDE_EINDVISIE_PIJLER_46:${vereist}`);
  }

  let bevestigdeDocumentenOpSchijf: number | undefined;
  if (opties.wortelPad) {
    const docVerslag = controleerVijfentwintigVerplichteDocumenten(opties.wortelPad);
    bevestigdeDocumentenOpSchijf = docVerslag.bevestigdAantal;
    if (docVerslag.bevestigdAantal < 25) {
      fouten.push(`NIET_ALLE_25_DOCUMENTEN_INHOUDELIJK_BEVESTIGD:${docVerslag.bevestigdAantal}`);
    }
  }
  const effectieveDoc25 = bevestigdeDocumentenOpSchijf ?? opties.voltooideVerplichteDocumenten44;
  if (effectieveDoc25 < 25) {
    fouten.push(`NIET_ALLE_25_DOCUMENTEN_VOLTOOID:${effectieveDoc25}`);
  }
  if (!opties.alleTwaalfEtappesVoltooid) {
    fouten.push('NIET_ALLE_ETAPPES_0_TOT_12_VOLTOOID');
  }
  if (!opties.productieInfrastructuurOnaangetast) {
    fouten.push('PRODUCTIE_INFRASTRUCTUUR_ONGEAUTORISEERD_GEWIJZIGD');
  }
  if (berekenKnooppuntId === undefined) {
    fouten.push('KERN_NIET_BESCHIKBAAR');
  }

  return {
    ok: fouten.length === 0,
    gedektePijlers: gezien.size,
    ...(bevestigdeDocumentenOpSchijf !== undefined ? { bevestigdeDocumentenOpSchijf, moduleBronnenSha256 } : {}),
    fouten,
  };
}
