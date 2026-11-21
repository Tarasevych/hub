// KLIMOP-015 / KLIMOP-016 / KLIMOP-017 (21.11.2026, Етапи 14–16 впровадження «Плюща» у платформу «Мій простір»):
// Сходинки 2–4 поступового переходу за §35 маніфесту — пасивне дзеркальне читання, контрольоване подвійне записування
// зі звіркою читання після запису, кворумний атестат готовності Сходинки 4 під подвійною печаткою FROST (RFC 9591)
// і гібридного постквантового підпису Ed25519 + ML-DSA-65 (FIPS 204), криптографічно зв'язані журнали SHA-256
// без особистого вмісту та незмінне право миттєвого повернення однієї або всіх 11 служб без вимкнення живої бази.

import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  canoniekeJson,
  controleerKnooppuntOnafhankelijkheid,
  maakKlimopKnooppunt,
} from '../shared/klimop/kern';
import {
  herstelEnOntsleutelObject,
  versleutelEnVerdeelObject,
} from '../shared/klimop/opslag';
import {
  combineerDkgBijdragenVoorDeelnemer,
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  frostVoegHandtekeningSamen,
  maakDkgDeelnemerBijdrage,
  verifieerStandaardEd25519Handtekening,
} from '../shared/klimop/drempelsleutels';
import { maakPersoonsIdentiteit } from '../shared/klimop/identiteit';
import {
  KLIMOP_ELF_DIENSTEN,
  STANDAARD_DIENST_ISOLATIE_PROFIELEN,
  beslisOverDienstOverdrachtStap,
  leidGeisoleerdeDienstContextAf,
  maakHlcStempel,
  maakLegeDienstCrdtStaat,
  maakOndertekendeCrdtOperatie,
  ontsleutelCrdtOperatieWaarde,
  vergelijkErfenisEnKlimopStaat,
  voegCrdtStatenSamen,
  type DienstStaatSamenvattingRecord,
  type KlimopDienstId,
} from '../shared/klimop/diensten';
import {
  maakHybridePostkwantumKnooppunt,
  ondertekenHybrideEd25519MlDsa65,
  verifieerHybrideEd25519MlDsa65,
} from '../shared/klimop/beveiligingsaudit';
import {
  KLIMOP_GESIMULEERDE_AFWIJKINGEN,
  KLIMOP_GESIMULEERDE_ATTEST_FOUTEN,
  KLIMOP_GESIMULEERDE_DUBBEL_FOUTEN,
  KlimopFout,
  type KlimopDienstSchakelaarStaat,
  type KlimopDubbelLogboekOverzicht,
  type KlimopDubbelSchrijfKwitantieRegel,
  type KlimopDubbelSchrijfModus,
  type KlimopDubbelSchrijvenUitkomst,
  type KlimopGesimuleerdeAfwijking,
  type KlimopGesimuleerdeDubbelSchrijfFout,
  type KlimopGesimuleerdeQuorumAttestFout,
  type KlimopOverdrachtSchakelaarUitkomst,
  type KlimopPassieveLeesModus,
  type KlimopPassieveSpiegelUitkomst,
  type KlimopQuorumAttestModus,
  type KlimopQuorumAttestRegel,
  type KlimopQuorumAttestUitkomst,
  type KlimopQuorumLogboekOverzicht,
  type KlimopSchakelaarActie,
  type KlimopSpiegelLogboekOverzicht,
  type KlimopSpiegelLogboekRegel,
} from '../shared/klimop-overzicht-model';

export const KLIMOP_GENESIS_KETEN_SHA256 = '0'.repeat(64);

const SCHAKELAARS_BESTAND = 'schakelaars.json';
const LOGBOEK_BESTAND = 'spiegel-logboek.jsonl';
const DUBBEL_LOGBOEK_BESTAND = 'dubbel-schrijven-kluis.jsonl';
const ATTEST_LOGBOEK_BESTAND = 'quorum-attesten-kluis.jsonl';
const SLOT_BESTAND = 'overdracht.lock';
const WAL_BESTAND = 'overdracht-wal.json';
const SLOT_VEROUDERD_MS = 30_000;
const QUORUM_ATTEST_FROST_DOMEIN = 'klimop-stap4-quorum-attest-frost-v1|';
const QUORUM_ATTEST_HYBRIDE_DOMEIN = 'klimop-stap4-quorum-attest-hybride-v1|';
const STANDAARD_STEEKPROEF = 4;
const MIN_STEEKPROEF = 2;
const MAX_STEEKPROEF = 12;
const STANDAARD_DUBBEL_OPERATIES = 4;
const MIN_DUBBEL_OPERATIES = 3;
const MAX_DUBBEL_OPERATIES = 12;
const MAX_RECENTE_REGELS = 200;

interface SchakelaarOpslagBestand {
  schema: 1;
  bijgewerktOp: string;
  diensten: Record<KlimopDienstId, KlimopDienstSchakelaarStaat>;
}

interface LogboekCheckpointBestand<TKeten> {
  schema: 1;
  totaalAantal: number;
  grootteBytes: number;
  vingerafdrukSha256: string;
  ketenIntegriteit: TKeten;
}

interface OverdrachtWalBestand {
  schema: 1;
  transactieId: string;
  aangemaaktOp: string;
  schakelaars: SchakelaarOpslagBestand;
  spiegelRegel?: KlimopSpiegelLogboekRegel;
  dubbelRegel?: KlimopDubbelSchrijfKwitantieRegel;
  attestRegel?: KlimopQuorumAttestRegel;
}

/** Визначає ізольовану серверну теку стану поза робочим деревом Git (щоб жоден виклик не забруднював кодову базу). */
export function klimopStaatMap(opgegevenMap?: string): string {
  const rauw =
    opgegevenMap?.trim()
    || process.env.KLIMOP_STAAT_MAP?.trim()
    || join(process.env.ORCH_INBOX?.trim() || join(tmpdir(), 'mijn-ruimte-klimop-staat'), 'klimop-overdracht');
  return resolve(rauw);
}

/** Захоплює взаємовиключний файловий замок теки перенесення з автоочищенням завислого замка та звільненням у finally. */
function metOverdrachtSlot<T>(map: string, fn: () => T): T {
  mkdirSync(map, { recursive: true });
  const slotPad = join(map, SLOT_BESTAND);
  let verkregen = false;
  const wachtBuffer = new Int32Array(new SharedArrayBuffer(4));

  for (let poging = 0; poging < 80; poging++) {
    try {
      const fd = openSync(slotPad, 'wx');
      try {
        const meta = Buffer.from(`${process.pid}:${Date.now()}\n`, 'utf8');
        writeFileSync(fd, meta);
      } finally {
        closeSync(fd);
      }
      verkregen = true;
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'EEXIST') throw err;
      try {
        const st = statSync(slotPad);
        if (Date.now() - st.mtimeMs > SLOT_VEROUDERD_MS) {
          unlinkSync(slotPad);
          continue;
        }
      } catch {
        continue;
      }
      Atomics.wait(wachtBuffer, 0, 0, 10);
    }
  }

  if (!verkregen) {
    throw new KlimopFout('KLIMOP_OVERDRACHT_SLOT_BEZET', 409);
  }

  try {
    return fn();
  } finally {
    try {
      if (existsSync(slotPad)) unlinkSync(slotPad);
    } catch {
      // Якщо замок уже прибрано, додаткових дій не потрібно
    }
  }
}

/** Атомарно записує файл із примусовим скиданням буферів fsyncSync перед перейменуванням. */
function schrijfBestandAtomairMetSync(doelPad: string, inhoudUtf8: string): void {
  const tmpPad = `${doelPad}.tmp-${randomBytes(6).toString('hex')}`;
  const fd = openSync(tmpPad, 'wx');
  try {
    writeFileSync(fd, inhoudUtf8, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPad, doelPad);
}

/** Обчислює точний відбиток SHA-256 усього файла журналу потоковим читанням по 64 КіБ без сліпих зон посередині. */
function berekenBestandVolledigeVingerafdruk(
  pad: string,
): { grootteBytes: number; vingerafdrukSha256: string } | null {
  if (!existsSync(pad)) return null;
  const fd = openSync(pad, 'r');
  try {
    const grootteBytes = statSync(pad).size;
    const h = createHash('sha256');
    h.update(`klimop-logboek-volledig-v2|${grootteBytes}|`, 'utf8');
    const blok = Buffer.allocUnsafe(65_536);
    let pos = 0;
    while (pos < grootteBytes) {
      const gelezen = readSync(fd, blok, 0, Math.min(blok.length, grootteBytes - pos), pos);
      if (gelezen <= 0) break;
      h.update(blok.subarray(0, gelezen));
      pos += gelezen;
    }
    if (pos !== grootteBytes) return null;
    return { grootteBytes, vingerafdrukSha256: h.digest('hex') };
  } finally {
    closeSync(fd);
  }
}

function leesGeldigLogboekCheckpoint<TKeten>(
  pad: string,
): { totaalAantal: number; ketenIntegriteit: TKeten } | null {
  const cpPad = `${pad}.checkpoint.json`;
  if (!existsSync(pad) || !existsSync(cpPad)) return null;
  try {
    const actueel = berekenBestandVolledigeVingerafdruk(pad);
    if (!actueel) return null;
    const parsed = JSON.parse(readFileSync(cpPad, 'utf8')) as Partial<LogboekCheckpointBestand<TKeten>>;
    if (
      parsed.schema !== 1
      || typeof parsed.totaalAantal !== 'number'
      || parsed.grootteBytes !== actueel.grootteBytes
      || parsed.vingerafdrukSha256 !== actueel.vingerafdrukSha256
      || !parsed.ketenIntegriteit
      || typeof parsed.ketenIntegriteit !== 'object'
    ) {
      return null;
    }
    return {
      totaalAantal: parsed.totaalAantal,
      ketenIntegriteit: parsed.ketenIntegriteit,
    };
  } catch {
    return null;
  }
}

function schrijfLogboekCheckpoint<TKeten>(
  pad: string,
  totaalAantal: number,
  ketenIntegriteit: TKeten,
): void {
  const actueel = berekenBestandVolledigeVingerafdruk(pad);
  if (!actueel) return;
  const cpPad = `${pad}.checkpoint.json`;
  const inhoud: LogboekCheckpointBestand<TKeten> = {
    schema: 1,
    totaalAantal,
    grootteBytes: actueel.grootteBytes,
    vingerafdrukSha256: actueel.vingerafdrukSha256,
    ketenIntegriteit,
  };
  schrijfBestandAtomairMetSync(cpPad, `${JSON.stringify(inhoud)}\n`);
}

/** Читає лише хвостовий фрагмент великого JSONL-журналу без завантаження всієї історії в пам'ять. */
function leesLaatsteJsonlRegelsUitStaart<T>(
  pad: string,
  maxBytes: number,
): { regels: T[]; volledigBestandGelezen: boolean } | null {
  if (!existsSync(pad)) {
    return { regels: [], volledigBestandGelezen: true };
  }
  const fd = openSync(pad, 'r');
  try {
    const grootte = statSync(pad).size;
    if (grootte === 0) {
      return { regels: [], volledigBestandGelezen: true };
    }
    const leesLengte = Math.min(grootte, Math.max(4096, maxBytes));
    const startPos = grootte - leesLengte;
    const buf = Buffer.alloc(leesLengte);
    readSync(fd, buf, 0, leesLengte, startPos);
    let tekst = buf.toString('utf8');
    if (startPos > 0) {
      const eersteNieuweRegel = tekst.indexOf('\n');
      if (eersteNieuweRegel === -1) return null;
      tekst = tekst.slice(eersteNieuweRegel + 1);
    }
    const lijnen = tekst
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const regels: T[] = [];
    for (const lijn of lijnen) {
      try {
        regels.push(JSON.parse(lijn) as T);
      } catch {
        return null;
      }
    }
    return { regels, volledigBestandGelezen: startPos === 0 };
  } finally {
    closeSync(fd);
  }
}

function bevatStaartRegelMetId<T>(
  pad: string,
  idVeld: keyof T,
  gezochteId: string,
): boolean {
  if (!existsSync(pad)) return false;
  const staart = leesLaatsteJsonlRegelsUitStaart<T>(pad, 65_536);
  if (staart) {
    return staart.regels.some((r) => r && String(r[idVeld] ?? '') === gezochteId);
  }
  return readFileSync(pad, 'utf8').includes(`"${String(idVeld)}":"${gezochteId}"`);
}

function pasOverdrachtWalToe(map: string, wal: OverdrachtWalBestand): void {
  mkdirSync(map, { recursive: true });

  if (wal.spiegelRegel) {
    const spiegelPad = join(map, LOGBOEK_BESTAND);
    const cpVoor = leesGeldigLogboekCheckpoint<KlimopSpiegelLogboekOverzicht['ketenIntegriteit']>(spiegelPad);
    const bestondAl = existsSync(spiegelPad);
    if (!bevatStaartRegelMetId<KlimopSpiegelLogboekRegel>(spiegelPad, 'regelId', wal.spiegelRegel.regelId)) {
      appendFileSync(spiegelPad, `${JSON.stringify(wal.spiegelRegel)}\n`, 'utf8');
      if (
        (!bestondAl && wal.spiegelRegel.volgnummer === 1 && wal.spiegelRegel.vorigeRegelSha256 === KLIMOP_GENESIS_KETEN_SHA256)
        || (
          cpVoor
          && cpVoor.ketenIntegriteit.ok
          && wal.spiegelRegel.volgnummer === cpVoor.totaalAantal + 1
          && wal.spiegelRegel.vorigeRegelSha256 === cpVoor.ketenIntegriteit.laatsteSha256
        )
      ) {
        schrijfLogboekCheckpoint(spiegelPad, wal.spiegelRegel.volgnummer, {
          ok: true,
          gecontroleerdeRegels: wal.spiegelRegel.volgnummer,
          laatsteSha256: wal.spiegelRegel.regelSha256,
          gebrokenBijVolgnummer: null,
          fout: null,
        });
      }
    }
  }

  if (wal.dubbelRegel) {
    const dubbelPad = join(map, DUBBEL_LOGBOEK_BESTAND);
    const cpVoor = leesGeldigLogboekCheckpoint<KlimopDubbelLogboekOverzicht['ketenIntegriteit']>(dubbelPad);
    const bestondAl = existsSync(dubbelPad);
    if (!bevatStaartRegelMetId<KlimopDubbelSchrijfKwitantieRegel>(dubbelPad, 'kwitantieId', wal.dubbelRegel.kwitantieId)) {
      appendFileSync(dubbelPad, `${JSON.stringify(wal.dubbelRegel)}\n`, 'utf8');
      if (
        (!bestondAl && wal.dubbelRegel.volgnummer === 1 && wal.dubbelRegel.vorigeKwitantieSha256 === KLIMOP_GENESIS_KETEN_SHA256)
        || (
          cpVoor
          && cpVoor.ketenIntegriteit.ok
          && wal.dubbelRegel.volgnummer === cpVoor.totaalAantal + 1
          && wal.dubbelRegel.vorigeKwitantieSha256 === cpVoor.ketenIntegriteit.laatsteSha256
        )
      ) {
        schrijfLogboekCheckpoint(dubbelPad, wal.dubbelRegel.volgnummer, {
          ok: true,
          gecontroleerdeKwitanties: wal.dubbelRegel.volgnummer,
          laatsteSha256: wal.dubbelRegel.kwitantieSha256,
          gebrokenBijVolgnummer: null,
          fout: null,
        });
      }
    }
  }

  if (wal.attestRegel) {
    const attestPad = join(map, ATTEST_LOGBOEK_BESTAND);
    const cpVoor = leesGeldigLogboekCheckpoint<KlimopQuorumLogboekOverzicht['ketenIntegriteit']>(attestPad);
    const bestondAl = existsSync(attestPad);
    if (!bevatStaartRegelMetId<KlimopQuorumAttestRegel>(attestPad, 'attestId', wal.attestRegel.attestId)) {
      appendFileSync(attestPad, `${JSON.stringify(wal.attestRegel)}\n`, 'utf8');
      if (
        (!bestondAl && wal.attestRegel.volgnummer === 1 && wal.attestRegel.vorigeAttestSha256 === KLIMOP_GENESIS_KETEN_SHA256)
        || (
          cpVoor
          && cpVoor.ketenIntegriteit.ok
          && wal.attestRegel.volgnummer === cpVoor.totaalAantal + 1
          && wal.attestRegel.vorigeAttestSha256 === cpVoor.ketenIntegriteit.laatsteSha256
        )
      ) {
        schrijfLogboekCheckpoint(attestPad, wal.attestRegel.volgnummer, {
          ok: true,
          gecontroleerdeAttesten: wal.attestRegel.volgnummer,
          laatsteSha256: wal.attestRegel.attestSha256,
          gebrokenBijVolgnummer: null,
          fout: null,
        });
      }
    }
  }

  schrijfSchakelaarsAtomair(map, wal.schakelaars);

  const walPad = join(map, WAL_BESTAND);
  if (existsSync(walPad)) {
    unlinkSync(walPad);
  }
}

function herstelOnderbrokenOverdrachtTransactieBinnenSlot(
  map: string,
): { hersteld: boolean; transactieId: string | null } {
  const walPad = join(map, WAL_BESTAND);
  if (!existsSync(walPad)) {
    return { hersteld: false, transactieId: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(walPad, 'utf8')) as Partial<OverdrachtWalBestand>;
    if (
      parsed.schema !== 1
      || typeof parsed.transactieId !== 'string'
      || !parsed.schakelaars
      || typeof parsed.schakelaars !== 'object'
    ) {
      unlinkSync(walPad);
      return { hersteld: false, transactieId: null };
    }
    pasOverdrachtWalToe(map, parsed as OverdrachtWalBestand);
    return { hersteld: true, transactieId: parsed.transactieId };
  } catch {
    try {
      if (existsSync(walPad)) unlinkSync(walPad);
    } catch {
      // нічого
    }
    return { hersteld: false, transactieId: null };
  }
}

/**
 * Дограє перервану WAL-транзакцію після можливого аварійного перезапуску між файловими кроками
 * виключно під міжпроцесним замком `metOverdrachtSlot` (ідемпотентно за ID події).
 */
export function herstelOnderbrokenOverdrachtTransactie(
  opgegevenMap?: string,
): { hersteld: boolean; transactieId: string | null } {
  const map = klimopStaatMap(opgegevenMap);
  return metOverdrachtSlot(map, () => herstelOnderbrokenOverdrachtTransactieBinnenSlot(map));
}

function voerOverdrachtTransactieUit(
  map: string,
  invoer: {
    schakelaars: SchakelaarOpslagBestand;
    spiegelRegel?: KlimopSpiegelLogboekRegel;
    dubbelRegel?: KlimopDubbelSchrijfKwitantieRegel;
    attestRegel?: KlimopQuorumAttestRegel;
  },
): void {
  mkdirSync(map, { recursive: true });
  const walPad = join(map, WAL_BESTAND);
  const wal: OverdrachtWalBestand = {
    schema: 1,
    transactieId: `tx_${Date.now()}_${randomBytes(4).toString('hex')}`,
    aangemaaktOp: new Date().toISOString(),
    schakelaars: invoer.schakelaars,
    ...(invoer.spiegelRegel ? { spiegelRegel: invoer.spiegelRegel } : {}),
    ...(invoer.dubbelRegel ? { dubbelRegel: invoer.dubbelRegel } : {}),
    ...(invoer.attestRegel ? { attestRegel: invoer.attestRegel } : {}),
  };
  schrijfBestandAtomairMetSync(walPad, `${JSON.stringify(wal)}\n`);
  pasOverdrachtWalToe(map, wal);
}

function standaardDienstSchakelaar(dienstId: KlimopDienstId): KlimopDienstSchakelaarStaat {
  return {
    dienstId,
    primaireSchrijfBron: 'erfenis_postgres',
    leesModus: 'alleen_erfenis_postgres',
    schrijfModus: 'alleen_erfenis_postgres',
    attestModus: 'alleen_erfenis_postgres',
    laatstePariteitOk: null,
    opeenvolgendeGelijkeControles: 0,
    totaalUitgevoerdeControles: 0,
    totaalGevondenAfwijkingen: 0,
    laatsteDubbelSchrijfOk: null,
    opeenvolgendeDubbelSchrijfControles: 0,
    totaalDubbelSchrijfProeven: 0,
    totaalDubbelSchrijfFouten: 0,
    laatsteQuorumAttestOk: null,
    opeenvolgendeGeldigeAttesten: 0,
    totaalQuorumAttesten: 0,
    totaalQuorumAttestFouten: 0,
    automatischeTerugschakelingen: 0,
    handmatigeTerugschakelingen: 0,
    laatsteControleOp: null,
    laatsteDubbelSchrijfOp: null,
    laatsteQuorumAttestOp: null,
    laatsteSchakelingOp: null,
    laatsteReden: 'STANDAARD_ONAANGETASTE_BASIS',
    bewijsVersie: 0,
    laatsteGeldigeAttestSha256: null,
  };
}

function leesSchakelaarsBestand(map: string): SchakelaarOpslagBestand {
  const pad = join(map, SCHAKELAARS_BESTAND);
  const diensten = {} as Record<KlimopDienstId, KlimopDienstSchakelaarStaat>;
  for (const d of KLIMOP_ELF_DIENSTEN) {
    diensten[d] = standaardDienstSchakelaar(d);
  }

  if (!existsSync(pad)) {
    return { schema: 1, bijgewerktOp: new Date().toISOString(), diensten };
  }

  try {
    const parsed = JSON.parse(readFileSync(pad, 'utf8')) as Partial<SchakelaarOpslagBestand>;
    const opgeslagen = parsed.diensten ?? ({} as Record<string, Partial<KlimopDienstSchakelaarStaat>>);
    for (const d of KLIMOP_ELF_DIENSTEN) {
      const bron = opgeslagen[d];
      if (!bron || typeof bron !== 'object') continue;
      const leesModus: KlimopPassieveLeesModus =
        bron.leesModus === 'passief_spiegel_lezen'
          ? 'passief_spiegel_lezen'
          : 'alleen_erfenis_postgres';
      // Сходинка 3 ніколи не може бути активною без активної Сходинки 2, а Сходинка 4 — без активної Сходинки 3 (§35).
      const schrijfModus: KlimopDubbelSchrijfModus =
        leesModus === 'passief_spiegel_lezen' && bron.schrijfModus === 'gecontroleerd_dubbel_schrijven'
          ? 'gecontroleerd_dubbel_schrijven'
          : 'alleen_erfenis_postgres';
      const attestModus: KlimopQuorumAttestModus =
        schrijfModus === 'gecontroleerd_dubbel_schrijven' && bron.attestModus === 'quorum_gereed_onder_erfenis'
          ? 'quorum_gereed_onder_erfenis'
          : 'alleen_erfenis_postgres';
      diensten[d] = {
        dienstId: d,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus,
        schrijfModus,
        attestModus,
        laatstePariteitOk: typeof bron.laatstePariteitOk === 'boolean' ? bron.laatstePariteitOk : null,
        opeenvolgendeGelijkeControles: Math.max(0, Number(bron.opeenvolgendeGelijkeControles ?? 0) | 0),
        totaalUitgevoerdeControles: Math.max(0, Number(bron.totaalUitgevoerdeControles ?? 0) | 0),
        totaalGevondenAfwijkingen: Math.max(0, Number(bron.totaalGevondenAfwijkingen ?? 0) | 0),
        laatsteDubbelSchrijfOk: typeof bron.laatsteDubbelSchrijfOk === 'boolean' ? bron.laatsteDubbelSchrijfOk : null,
        opeenvolgendeDubbelSchrijfControles: Math.max(0, Number(bron.opeenvolgendeDubbelSchrijfControles ?? 0) | 0),
        totaalDubbelSchrijfProeven: Math.max(0, Number(bron.totaalDubbelSchrijfProeven ?? 0) | 0),
        totaalDubbelSchrijfFouten: Math.max(0, Number(bron.totaalDubbelSchrijfFouten ?? 0) | 0),
        laatsteQuorumAttestOk: typeof bron.laatsteQuorumAttestOk === 'boolean' ? bron.laatsteQuorumAttestOk : null,
        opeenvolgendeGeldigeAttesten: Math.max(0, Number(bron.opeenvolgendeGeldigeAttesten ?? 0) | 0),
        totaalQuorumAttesten: Math.max(0, Number(bron.totaalQuorumAttesten ?? 0) | 0),
        totaalQuorumAttestFouten: Math.max(0, Number(bron.totaalQuorumAttestFouten ?? 0) | 0),
        automatischeTerugschakelingen: Math.max(0, Number(bron.automatischeTerugschakelingen ?? 0) | 0),
        handmatigeTerugschakelingen: Math.max(0, Number(bron.handmatigeTerugschakelingen ?? 0) | 0),
        laatsteControleOp: typeof bron.laatsteControleOp === 'string' ? bron.laatsteControleOp : null,
        laatsteDubbelSchrijfOp: typeof bron.laatsteDubbelSchrijfOp === 'string' ? bron.laatsteDubbelSchrijfOp : null,
        laatsteQuorumAttestOp: typeof bron.laatsteQuorumAttestOp === 'string' ? bron.laatsteQuorumAttestOp : null,
        laatsteSchakelingOp: typeof bron.laatsteSchakelingOp === 'string' ? bron.laatsteSchakelingOp : null,
        laatsteReden: typeof bron.laatsteReden === 'string' ? bron.laatsteReden : 'STANDAARD_ONAANGETASTE_BASIS',
        bewijsVersie: Math.max(0, Number(bron.bewijsVersie ?? 0) | 0),
        laatsteGeldigeAttestSha256:
          typeof bron.laatsteGeldigeAttestSha256 === 'string' ? bron.laatsteGeldigeAttestSha256 : null,
      };
    }
    return {
      schema: 1,
      bijgewerktOp: typeof parsed.bijgewerktOp === 'string' ? parsed.bijgewerktOp : new Date().toISOString(),
      diensten,
    };
  } catch {
    return { schema: 1, bijgewerktOp: new Date().toISOString(), diensten };
  }
}

function schrijfSchakelaarsAtomair(map: string, staat: SchakelaarOpslagBestand): void {
  mkdirSync(map, { recursive: true });
  const doelPad = join(map, SCHAKELAARS_BESTAND);
  schrijfBestandAtomairMetSync(doelPad, `${JSON.stringify(staat, null, 2)}\n`);
}

function hashSleutelIdVoorLogboek(sleutelId: string): string {
  return createHash('sha256').update(`klimop-spiegel-sleutel|${sleutelId}`, 'utf8').digest('hex').slice(0, 16);
}

/** Обчислює детермінований відбиток SHA-256 запису журналу розбіжностей, прив'язаний до попереднього запису. */
export function berekenSpiegelLogboekRegelSha256(
  zonderEigenHash: Omit<KlimopSpiegelLogboekRegel, 'regelSha256'>,
): string {
  const kanoniek = JSON.stringify([
    zonderEigenHash.regelId,
    zonderEigenHash.volgnummer,
    zonderEigenHash.tijdstipIso,
    zonderEigenHash.soort,
    zonderEigenHash.dienstId,
    zonderEigenHash.leesModusVoor,
    zonderEigenHash.leesModusNa,
    zonderEigenHash.aantalGecontroleerd,
    zonderEigenHash.afwijkingenAantal,
    zonderEigenHash.afwijkingSleutelHashes.ontbrekend,
    zonderEigenHash.afwijkingSleutelHashes.inhoud,
    zonderEigenHash.afwijkingSleutelHashes.machtigingen,
    zonderEigenHash.reedSolomonHersteld,
    zonderEigenHash.crdtSamenvoegingOk,
    zonderEigenHash.automatischTeruggezet,
    zonderEigenHash.reden,
    zonderEigenHash.bevatGeheimenOfInhoud,
    zonderEigenHash.vorigeRegelSha256,
  ]);
  return createHash('sha256').update(kanoniek, 'utf8').digest('hex');
}

function leesAlleLogboekRegelsRuw(map: string): {
  regels: KlimopSpiegelLogboekRegel[];
  parseerFoutBijRegel: number | null;
} {
  const pad = join(map, LOGBOEK_BESTAND);
  if (!existsSync(pad)) {
    return { regels: [], parseerFoutBijRegel: null };
  }
  const inhoud = readFileSync(pad, 'utf8');
  const lijnen = inhoud
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const regels: KlimopSpiegelLogboekRegel[] = [];
  for (let i = 0; i < lijnen.length; i++) {
    try {
      const r = JSON.parse(lijnen[i]) as KlimopSpiegelLogboekRegel;
      regels.push(r);
    } catch {
      return { regels, parseerFoutBijRegel: i + 1 };
    }
  }
  return { regels, parseerFoutBijRegel: null };
}

/** Перевіряє нерозривність і непідробність усього ланцюжка SHA-256 збережуваного журналу дзеркальної звірки. */
export function verifieerSpiegelLogboekKeten(regels: readonly KlimopSpiegelLogboekRegel[]): {
  ok: boolean;
  gecontroleerdeRegels: number;
  laatsteSha256: string;
  gebrokenBijVolgnummer: number | null;
  fout: string | null;
} {
  let verwachteVorige = KLIMOP_GENESIS_KETEN_SHA256;
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i];
    if (
      !r
      || r.volgnummer !== i + 1
      || r.vorigeRegelSha256 !== verwachteVorige
      || r.bevatGeheimenOfInhoud !== false
    ) {
      return {
        ok: false,
        gecontroleerdeRegels: i,
        laatsteSha256: verwachteVorige,
        gebrokenBijVolgnummer: i + 1,
        fout: 'LOGBOEK_KETEN_VERBROKEN',
      };
    }
    const herrekend = berekenSpiegelLogboekRegelSha256({
      regelId: r.regelId,
      volgnummer: r.volgnummer,
      tijdstipIso: r.tijdstipIso,
      soort: r.soort,
      dienstId: r.dienstId,
      leesModusVoor: r.leesModusVoor,
      leesModusNa: r.leesModusNa,
      aantalGecontroleerd: r.aantalGecontroleerd,
      afwijkingenAantal: r.afwijkingenAantal,
      afwijkingSleutelHashes: r.afwijkingSleutelHashes,
      reedSolomonHersteld: r.reedSolomonHersteld,
      crdtSamenvoegingOk: r.crdtSamenvoegingOk,
      automatischTeruggezet: r.automatischTeruggezet,
      reden: r.reden,
      bevatGeheimenOfInhoud: false,
      vorigeRegelSha256: r.vorigeRegelSha256,
    });
    if (herrekend !== r.regelSha256) {
      return {
        ok: false,
        gecontroleerdeRegels: i,
        laatsteSha256: verwachteVorige,
        gebrokenBijVolgnummer: i + 1,
        fout: 'LOGBOEK_REGEL_HASH_ONGELDIG',
      };
    }
    verwachteVorige = r.regelSha256;
  }
  return {
    ok: true,
    gecontroleerdeRegels: regels.length,
    laatsteSha256: verwachteVorige,
    gebrokenBijVolgnummer: null,
    fout: null,
  };
}

function bereidSpiegelLogboekRegelVoor(
  map: string,
  basis: Omit<
    KlimopSpiegelLogboekRegel,
    'regelId' | 'volgnummer' | 'vorigeRegelSha256' | 'regelSha256' | 'bevatGeheimenOfInhoud'
  >,
): KlimopSpiegelLogboekRegel {
  const pad = join(map, LOGBOEK_BESTAND);
  let vorigeSha = KLIMOP_GENESIS_KETEN_SHA256;
  let volgnummer = 1;

  if (existsSync(pad)) {
    const cp = leesGeldigLogboekCheckpoint<KlimopSpiegelLogboekOverzicht['ketenIntegriteit']>(pad);
    if (cp && cp.ketenIntegriteit.ok) {
      vorigeSha = cp.ketenIntegriteit.laatsteSha256;
      volgnummer = cp.totaalAantal + 1;
    } else {
      const ruw = leesAlleLogboekRegelsRuw(map);
      const keten = verifieerSpiegelLogboekKeten(ruw.regels);
      if (ruw.parseerFoutBijRegel === null && keten.ok) {
        schrijfLogboekCheckpoint(pad, ruw.regels.length, keten);
        vorigeSha = keten.laatsteSha256;
      } else if (ruw.regels.length > 0) {
        vorigeSha = String(ruw.regels[ruw.regels.length - 1].regelSha256 ?? KLIMOP_GENESIS_KETEN_SHA256);
      }
      volgnummer = ruw.regels.length + 1;
    }
  }

  const stempel = basis.tijdstipIso.replace(/[-:TZ.]/g, '').slice(0, 14);
  const regelId = `spg_${stempel}_${randomBytes(4).toString('hex')}`;

  const zonderEigenHash: Omit<KlimopSpiegelLogboekRegel, 'regelSha256'> = {
    regelId,
    volgnummer,
    tijdstipIso: basis.tijdstipIso,
    soort: basis.soort,
    dienstId: basis.dienstId,
    leesModusVoor: basis.leesModusVoor,
    leesModusNa: basis.leesModusNa,
    aantalGecontroleerd: basis.aantalGecontroleerd,
    afwijkingenAantal: basis.afwijkingenAantal,
    afwijkingSleutelHashes: basis.afwijkingSleutelHashes,
    reedSolomonHersteld: basis.reedSolomonHersteld,
    crdtSamenvoegingOk: basis.crdtSamenvoegingOk,
    automatischTeruggezet: basis.automatischTeruggezet,
    reden: basis.reden,
    bevatGeheimenOfInhoud: false,
    vorigeRegelSha256: vorigeSha,
  };

  return {
    ...zonderEigenHash,
    regelSha256: berekenSpiegelLogboekRegelSha256(zonderEigenHash),
  };
}

/** Читає стан усіх 11 перемикачів служб, останні записи журналу розбіжностей та перевіряє ланцюжок SHA-256. */
export function leesKlimopSpiegelLogboek(opties?: {
  staatMap?: string;
  limiet?: number;
  dienstId?: KlimopDienstId;
  volledigeGeschiedenisControle?: boolean;
  alleenLezenZonderMutatie?: boolean;
}): KlimopSpiegelLogboekOverzicht {
  const map = klimopStaatMap(opties?.staatMap);
  if (opties?.dienstId !== undefined && !KLIMOP_ELF_DIENSTEN.includes(opties.dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }
  const alleenLezen = opties?.alleenLezenZonderMutatie === true;
  if (!alleenLezen && existsSync(join(map, WAL_BESTAND))) {
    herstelOnderbrokenOverdrachtTransactie(map);
  }
  const schakelaarsBestand = leesSchakelaarsBestand(map);
  const schakelaars = KLIMOP_ELF_DIENSTEN.map((d) => schakelaarsBestand.diensten[d]);
  const limiet = Math.min(
    MAX_RECENTE_REGELS,
    Math.max(1, Number.isInteger(opties?.limiet) ? Number(opties?.limiet) : 30),
  );

  const pad = join(map, LOGBOEK_BESTAND);
  if (!opties?.volledigeGeschiedenisControle) {
    const cp = leesGeldigLogboekCheckpoint<KlimopSpiegelLogboekOverzicht['ketenIntegriteit']>(pad);
    if (cp) {
      const staart = leesLaatsteJsonlRegelsUitStaart<KlimopSpiegelLogboekRegel>(
        pad,
        Math.max(65_536, limiet * 2048),
      );
      if (staart) {
        const gefilterd = opties?.dienstId
          ? staart.regels.filter((r) => r.dienstId === opties.dienstId || r.dienstId === 'alle_elf')
          : staart.regels;
        if (gefilterd.length >= limiet || staart.volledigBestandGelezen) {
          return {
            ketenIntegriteit: cp.ketenIntegriteit,
            samenvatting: {
              actievePassiefLezenDiensten: schakelaars.filter((s) => s.leesModus === 'passief_spiegel_lezen').length,
              actieveDubbelSchrijvenDiensten: schakelaars.filter(
                (s) => s.schrijfModus === 'gecontroleerd_dubbel_schrijven',
              ).length,
              actieveQuorumGereedDiensten: schakelaars.filter(
                (s) => s.attestModus === 'quorum_gereed_onder_erfenis',
              ).length,
              totaalDiensten: schakelaars.length,
              totaalLogboekRegels: cp.totaalAantal,
              totaalAutomatischeTerugschakelingen: schakelaars.reduce((n, s) => n + s.automatischeTerugschakelingen, 0),
              totaalHandmatigeTerugschakelingen: schakelaars.reduce((n, s) => n + s.handmatigeTerugschakelingen, 0),
            },
            schakelaars,
            recenteRegels: [...gefilterd].slice(-limiet).reverse(),
            productieDatabankGewijzigd: false,
          };
        }
      }
    }
  }

  const grootteVoorLezen = existsSync(pad) ? statSync(pad).size : 0;
  const ruw = leesAlleLogboekRegelsRuw(map);
  const keten =
    ruw.parseerFoutBijRegel !== null
      ? {
          ok: false,
          gecontroleerdeRegels: Math.max(0, ruw.parseerFoutBijRegel - 1),
          laatsteSha256: KLIMOP_GENESIS_KETEN_SHA256,
          gebrokenBijVolgnummer: ruw.parseerFoutBijRegel,
          fout: 'LOGBOEK_JSON_BESCHADIGD',
        }
      : verifieerSpiegelLogboekKeten(ruw.regels);
  if (!alleenLezen && keten.ok && existsSync(pad)) {
    metOverdrachtSlot(map, () => {
      if (!existsSync(join(map, WAL_BESTAND)) && existsSync(pad) && statSync(pad).size === grootteVoorLezen) {
        schrijfLogboekCheckpoint(pad, ruw.regels.length, keten);
      }
    });
  }

  const gefilterd = opties?.dienstId
    ? ruw.regels.filter((r) => r.dienstId === opties.dienstId || r.dienstId === 'alle_elf')
    : ruw.regels;
  const recenteRegels = [...gefilterd].slice(-limiet).reverse();

  return {
    ketenIntegriteit: keten,
    samenvatting: {
      actievePassiefLezenDiensten: schakelaars.filter((s) => s.leesModus === 'passief_spiegel_lezen').length,
      actieveDubbelSchrijvenDiensten: schakelaars.filter(
        (s) => s.schrijfModus === 'gecontroleerd_dubbel_schrijven',
      ).length,
      actieveQuorumGereedDiensten: schakelaars.filter(
        (s) => s.attestModus === 'quorum_gereed_onder_erfenis',
      ).length,
      totaalDiensten: schakelaars.length,
      totaalLogboekRegels: ruw.regels.length,
      totaalAutomatischeTerugschakelingen: schakelaars.reduce((n, s) => n + s.automatischeTerugschakelingen, 0),
      totaalHandmatigeTerugschakelingen: schakelaars.reduce((n, s) => n + s.handmatigeTerugschakelingen, 0),
    },
    schakelaars,
    recenteRegels,
    productieDatabankGewijzigd: false,
  };
}

/**
 * Сходинка 2 (§35 маніфесту): виконує пасивне дзеркальне читання багатоелементної вибірки для обраної служби,
 * записує знеособлений результат у криптографічний журнал розбіжностей і при виявленні бодай однієї розбіжності
 * миттєво й автоматично перемикає службу назад на чинну основу (`alleen_erfenis_postgres`).
 */
export function voerPassieveSpiegelLeesProefUit(
  raw: unknown,
  opties?: { staatMap?: string },
): KlimopPassieveSpiegelUitkomst {
  const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dienstId = String(b.dienstId ?? 'postvak') as KlimopDienstId;
  if (!KLIMOP_ELF_DIENSTEN.includes(dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }

  const ruweSteekproef = b.steekproefGrootte !== undefined ? Number(b.steekproefGrootte) : STANDAARD_STEEKPROEF;
  if (!Number.isInteger(ruweSteekproef) || ruweSteekproef < MIN_STEEKPROEF || ruweSteekproef > MAX_STEEKPROEF) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }
  const steekproefGrootte = ruweSteekproef;

  const gesimuleerdeAfwijking = String(b.simuleerAfwijking ?? 'geen') as KlimopGesimuleerdeAfwijking;
  if (!KLIMOP_GESIMULEERDE_AFWIJKINGEN.includes(gesimuleerdeAfwijking)) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }

  const map = klimopStaatMap(opties?.staatMap);
  return metOverdrachtSlot(map, () => {
    herstelOnderbrokenOverdrachtTransactieBinnenSlot(map);
    const nuIso = new Date().toISOString();
    const profiel = STANDAARD_DIENST_ISOLATIE_PROFIELEN[dienstId];

    const wortelGeheim32 = randomBytes(32);
    const zout32 = randomBytes(32);
    const kek32 = randomBytes(32);

    try {
      const persoon = maakPersoonsIdentiteit(nuIso);
      const dienstCtx = leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: wortelGeheim32,
        persoonsZout32: zout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId,
        epoche: 2,
      });
      const andereDienstId: KlimopDienstId = dienstId === 'postvak' ? 'wolkopslag' : 'postvak';
      const andereDienstCtx = leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: wortelGeheim32,
        persoonsZout32: zout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId: andereDienstId,
        epoche: 2,
      });

      try {
        const knoopA = maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'NL',
          aanbieder: 'passief-lees-nl',
          nuIso,
        });
        const knoopB = maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'CH',
          aanbieder: 'passief-lees-ch',
          nuIso,
        });

        let staatA = maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid);
        let staatB = maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid);
        const erfenisRecords: DienstStaatSamenvattingRecord[] = [];
        const hersteldeInhoudMap = new Map<string, string>();
        const machtigingenMap = new Map<string, string>();
        let reedSolomonAlleRecordsHersteld = true;
        let kruisDienstIsolatieAfgedwongen = dienstCtx.dienstPsid !== andereDienstCtx.dienstPsid;

        for (let idx = 0; idx < steekproefGrootte; idx++) {
          const sleutelId = `passief_${dienstId}_item_${idx + 1}`;
          const waarde = {
            schema: 2,
            soort: 'passief_spiegel_lezen_stap_2',
            dienstId,
            dienstPsid: dienstCtx.dienstPsid,
            volgorde: idx + 1,
            tijdstip: nuIso,
          };
          const klareBytes = Buffer.from(JSON.stringify(waarde), 'utf8');
          const inhoudSha256 = createHash('sha256').update(klareBytes).digest('hex');
          const machtigingenSha256 = createHash('sha256')
            .update(`${dienstId}|${dienstCtx.dienstPsid}|alleen_eigenaar_lezen|${idx + 1}`, 'utf8')
            .digest('hex');

          erfenisRecords.push({ sleutelId, inhoudSha256, machtigingenSha256 });
          machtigingenMap.set(sleutelId, machtigingenSha256);

          const verdeeld = versleutelEnVerdeelObject({
            inhoud: klareBytes,
            objectId: sleutelId,
            eigenaar: knoopA,
            kek: kek32,
            k: 4,
            m: 2,
            nuIso,
          });
          const overlevende = verdeeld.fragmentenPerSegment.map((seg) =>
            seg.filter((f) => f.index !== (idx % 6) && f.index !== ((idx + 3) % 6)),
          );
          const hersteld = herstelEnOntsleutelObject({
            manifest: verdeeld.manifest,
            fragmentenPerSegment: overlevende,
            kek: kek32,
          });
          if (!hersteld.ok) {
            reedSolomonAlleRecordsHersteld = false;
          } else {
            hersteldeInhoudMap.set(
              sleutelId,
              createHash('sha256').update(hersteld.inhoud).digest('hex'),
            );
          }

          const schrijver = idx % 2 === 0 ? knoopA : knoopB;
          const op = maakOndertekendeCrdtOperatie({
            dienstContext: dienstCtx,
            sleutelId,
            soort: 'zet',
            klareWaarde: waarde,
            hlc: maakHlcStempel(Date.now(), idx + 1, schrijver.identiteit.knooppuntId),
            apparaatTekenSleutels: {
              publiekeSleutelDerB64u: schrijver.identiteit.publiekeSleutelDerB64u,
              geheimeSleutelPkcs8B64u: schrijver.geheimeSleutelPkcs8B64u,
            },
          });
          if (idx === 0) {
            const kruis = ontsleutelCrdtOperatieWaarde(op, andereDienstCtx);
            if (kruis.ok !== false) kruisDienstIsolatieAfgedwongen = false;
          }
          if (idx % 2 === 0) {
            staatA = { ...staatA, elementen: { ...staatA.elementen, [sleutelId]: op } };
          } else {
            staatB = { ...staatB, elementen: { ...staatB.elementen, [sleutelId]: op } };
          }
        }

        const samengevoegd = voegCrdtStatenSamen(staatA, staatB);
        let crdtSamenvoegingOk = samengevoegd.ok;
        const klimopRecords: DienstStaatSamenvattingRecord[] = [];

        if (samengevoegd.ok) {
          for (let idx = 0; idx < steekproefGrootte; idx++) {
            const sleutelId = `passief_${dienstId}_item_${idx + 1}`;
            const op = samengevoegd.samengevoegd.elementen[sleutelId];
            if (!op) {
              crdtSamenvoegingOk = false;
              continue;
            }
            const ontsl = ontsleutelCrdtOperatieWaarde(op, dienstCtx);
            if (!ontsl.ok) {
              crdtSamenvoegingOk = false;
              continue;
            }

            if (gesimuleerdeAfwijking === 'ontbrekend_record' && idx === steekproefGrootte - 1) {
              continue;
            }

            let inhoudSha256 = hersteldeInhoudMap.get(sleutelId) ?? '';
            let machtigingenSha256 = machtigingenMap.get(sleutelId) ?? '';

            if (gesimuleerdeAfwijking === 'inhoud' && idx === 0) {
              inhoudSha256 = createHash('sha256').update('gesimuleerde-inhoudsafwijking', 'utf8').digest('hex');
            }
            if (gesimuleerdeAfwijking === 'machtigingen' && idx === 0) {
              machtigingenSha256 = createHash('sha256').update('gesimuleerde-rechtenafwijking', 'utf8').digest('hex');
            }

            klimopRecords.push({ sleutelId, inhoudSha256, machtigingenSha256 });
          }
        }

        const pariteitVerslag = vergelijkErfenisEnKlimopStaat(erfenisRecords, klimopRecords);
        const schakelaarsBestand = leesSchakelaarsBestand(map);
        const huidigeStaat = schakelaarsBestand.diensten[dienstId];
        const leesModusVoor: KlimopPassieveLeesModus = huidigeStaat.leesModus;

        const overdrachtBesluit = beslisOverDienstOverdrachtStap({
          dienstId,
          huidigeModus:
            leesModusVoor === 'passief_spiegel_lezen'
              ? 'schaduw_dubbel_schrijven'
              : 'alleen_erfenis_postgres',
          gewensteModus: 'schaduw_dubbel_schrijven',
          pariteit: pariteitVerslag,
        });

        const afwijkingenAantal =
          pariteitVerslag.ontbrekendeInKlimopIds.length
          + pariteitVerslag.afwijkendeInhoudIds.length
          + pariteitVerslag.afwijkendeMachtigingenIds.length;

        const allesOk =
          reedSolomonAlleRecordsHersteld
          && crdtSamenvoegingOk
          && kruisDienstIsolatieAfgedwongen
          && pariteitVerslag.volledigGelijk
          && overdrachtBesluit.toegestaan;

        let leesModusNa: KlimopPassieveLeesModus = leesModusVoor;
        let schrijfModusNa: KlimopDubbelSchrijfModus = huidigeStaat.schrijfModus;
        let attestModusNa: KlimopQuorumAttestModus = huidigeStaat.attestModus;
        let automatischTeruggezet = false;

        if (
          !allesOk
          && (
            leesModusVoor === 'passief_spiegel_lezen'
            || huidigeStaat.schrijfModus === 'gecontroleerd_dubbel_schrijven'
            || huidigeStaat.attestModus === 'quorum_gereed_onder_erfenis'
          )
        ) {
          leesModusNa = 'alleen_erfenis_postgres';
          schrijfModusNa = 'alleen_erfenis_postgres';
          attestModusNa = 'alleen_erfenis_postgres';
          automatischTeruggezet = true;
        }

        const bijgewerkteStaat: KlimopDienstSchakelaarStaat = {
          ...huidigeStaat,
          primaireSchrijfBron: 'erfenis_postgres',
          leesModus: leesModusNa,
          schrijfModus: schrijfModusNa,
          attestModus: attestModusNa,
          laatstePariteitOk: allesOk,
          opeenvolgendeGelijkeControles: allesOk ? huidigeStaat.opeenvolgendeGelijkeControles + 1 : 0,
          totaalUitgevoerdeControles: huidigeStaat.totaalUitgevoerdeControles + 1,
          totaalGevondenAfwijkingen: huidigeStaat.totaalGevondenAfwijkingen + afwijkingenAantal,
          laatsteDubbelSchrijfOk: allesOk ? huidigeStaat.laatsteDubbelSchrijfOk : false,
          opeenvolgendeDubbelSchrijfControles: allesOk ? huidigeStaat.opeenvolgendeDubbelSchrijfControles : 0,
          laatsteQuorumAttestOk: allesOk ? huidigeStaat.laatsteQuorumAttestOk : false,
          opeenvolgendeGeldigeAttesten: allesOk ? huidigeStaat.opeenvolgendeGeldigeAttesten : 0,
          automatischeTerugschakelingen:
            huidigeStaat.automatischeTerugschakelingen + (automatischTeruggezet ? 1 : 0),
          laatsteControleOp: nuIso,
          laatsteSchakelingOp: automatischTeruggezet ? nuIso : huidigeStaat.laatsteSchakelingOp,
          laatsteReden: automatischTeruggezet
            ? 'AUTOMATISCH_TERUGGEZET_WEGENS_PARITEITSAFWIJKING'
            : overdrachtBesluit.reden,
          bewijsVersie: (huidigeStaat.bewijsVersie ?? 0) + 1,
          laatsteGeldigeAttestSha256: null,
        };

        schakelaarsBestand.diensten[dienstId] = bijgewerkteStaat;
        schakelaarsBestand.bijgewerktOp = nuIso;

        const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
          tijdstipIso: nuIso,
          soort: automatischTeruggezet ? 'automatische_terugschakeling' : 'passieve_spiegel_proef',
          dienstId,
          leesModusVoor,
          leesModusNa,
          aantalGecontroleerd: steekproefGrootte,
          afwijkingenAantal,
          afwijkingSleutelHashes: {
            ontbrekend: pariteitVerslag.ontbrekendeInKlimopIds.map(hashSleutelIdVoorLogboek),
            inhoud: pariteitVerslag.afwijkendeInhoudIds.map(hashSleutelIdVoorLogboek),
            machtigingen: pariteitVerslag.afwijkendeMachtigingenIds.map(hashSleutelIdVoorLogboek),
          },
          reedSolomonHersteld: reedSolomonAlleRecordsHersteld,
          crdtSamenvoegingOk,
          automatischTeruggezet,
          reden: bijgewerkteStaat.laatsteReden,
        });

        voerOverdrachtTransactieUit(map, {
          schakelaars: schakelaarsBestand,
          spiegelRegel: logboekRegel,
        });

        return {
          ok: allesOk,
          dienstId,
          subdomein: profiel.subdomeinBestaand,
          geisoleerdeDienstPsid: dienstCtx.dienstPsid,
          steekproefGrootte,
          gesimuleerdeAfwijking,
          reedSolomonAlleRecordsHersteld,
          crdtSamenvoegingOk,
          kruisDienstIsolatieAfgedwongen,
          pariteit: {
            volledigGelijk: pariteitVerslag.volledigGelijk,
            totaalGecontroleerd: steekproefGrootte,
            afwijkingen: afwijkingenAantal,
            ontbrekendAantal: pariteitVerslag.ontbrekendeInKlimopIds.length,
            inhoudAfwijkingAantal: pariteitVerslag.afwijkendeInhoudIds.length,
            machtigingenAfwijkingAantal: pariteitVerslag.afwijkendeMachtigingenIds.length,
          },
          schakelaar: bijgewerkteStaat,
          automatischTeruggezetNaarErfenis: automatischTeruggezet,
          logboekRegel,
          productieDatabankGewijzigd: false,
        };
      } finally {
        dienstCtx.dienstSleutel32.fill(0);
        andereDienstCtx.dienstSleutel32.fill(0);
      }
    } finally {
      wortelGeheim32.fill(0);
      zout32.fill(0);
      kek32.fill(0);
    }
  });
}

// =================================================================================================
// Сходинка 3 (§35 маніфесту): контрольоване подвійне записування зі звіркою читання й квитанціями SHA-256
// =================================================================================================

/** Обчислює детермінований відбиток SHA-256 квитанції подвійного записування у ланцюжку Сходинки 3. */
export function berekenDubbelKwitantieSha256(
  zonderEigenHash: Omit<KlimopDubbelSchrijfKwitantieRegel, 'kwitantieSha256'>,
): string {
  const kanoniek = JSON.stringify([
    zonderEigenHash.kwitantieId,
    zonderEigenHash.volgnummer,
    zonderEigenHash.tijdstipIso,
    zonderEigenHash.dienstId,
    zonderEigenHash.geisoleerdeDienstPsid,
    zonderEigenHash.knooppuntRegios,
    zonderEigenHash.knooppuntenOnafhankelijk,
    zonderEigenHash.operatiesAantal,
    zonderEigenHash.zetAantal,
    zonderEigenHash.bijgewerktAantal,
    zonderEigenHash.verwijderTombstoneAantal,
    zonderEigenHash.gesimuleerdeFout,
    zonderEigenHash.tweedeSchrijfGeslaagd,
    zonderEigenHash.leesNaSchrijfGelijk,
    zonderEigenHash.tombstoneBevestigd,
    zonderEigenHash.reedSolomonHersteld,
    zonderEigenHash.crdtSamenvoegingOk,
    zonderEigenHash.kruisDienstIsolatieOk,
    zonderEigenHash.afwijkingenAantal,
    zonderEigenHash.afwijkingSleutelHashes.ontbrekend,
    zonderEigenHash.afwijkingSleutelHashes.inhoud,
    zonderEigenHash.afwijkingSleutelHashes.machtigingen,
    zonderEigenHash.schrijfModusVoor,
    zonderEigenHash.schrijfModusNa,
    zonderEigenHash.automatischTeruggezet,
    zonderEigenHash.reden,
    zonderEigenHash.bevatGeheimenOfInhoud,
    zonderEigenHash.vorigeKwitantieSha256,
  ]);
  return createHash('sha256').update(kanoniek, 'utf8').digest('hex');
}

function leesAlleDubbelKwitantiesRuw(map: string): {
  kwitanties: KlimopDubbelSchrijfKwitantieRegel[];
  parseerFoutBijRegel: number | null;
} {
  const pad = join(map, DUBBEL_LOGBOEK_BESTAND);
  if (!existsSync(pad)) {
    return { kwitanties: [], parseerFoutBijRegel: null };
  }
  const inhoud = readFileSync(pad, 'utf8');
  const lijnen = inhoud
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const kwitanties: KlimopDubbelSchrijfKwitantieRegel[] = [];
  for (let i = 0; i < lijnen.length; i++) {
    try {
      const k = JSON.parse(lijnen[i]) as KlimopDubbelSchrijfKwitantieRegel;
      kwitanties.push(k);
    } catch {
      return { kwitanties, parseerFoutBijRegel: i + 1 };
    }
  }
  return { kwitanties, parseerFoutBijRegel: null };
}

/** Перевіряє нерозривність і непідробність ланцюжка SHA-256 квитанцій подвійного записування Сходинки 3. */
export function verifieerDubbelKwitantieKeten(
  kwitanties: readonly KlimopDubbelSchrijfKwitantieRegel[],
): {
  ok: boolean;
  gecontroleerdeKwitanties: number;
  laatsteSha256: string;
  gebrokenBijVolgnummer: number | null;
  fout: string | null;
} {
  let verwachteVorige = KLIMOP_GENESIS_KETEN_SHA256;
  for (let i = 0; i < kwitanties.length; i++) {
    const k = kwitanties[i];
    if (
      !k
      || k.volgnummer !== i + 1
      || k.vorigeKwitantieSha256 !== verwachteVorige
      || k.bevatGeheimenOfInhoud !== false
    ) {
      return {
        ok: false,
        gecontroleerdeKwitanties: i,
        laatsteSha256: verwachteVorige,
        gebrokenBijVolgnummer: i + 1,
        fout: 'DUBBEL_LOGBOEK_KETEN_VERBROKEN',
      };
    }
    const herrekend = berekenDubbelKwitantieSha256({
      kwitantieId: k.kwitantieId,
      volgnummer: k.volgnummer,
      tijdstipIso: k.tijdstipIso,
      dienstId: k.dienstId,
      geisoleerdeDienstPsid: k.geisoleerdeDienstPsid,
      knooppuntRegios: k.knooppuntRegios,
      knooppuntenOnafhankelijk: k.knooppuntenOnafhankelijk,
      operatiesAantal: k.operatiesAantal,
      zetAantal: k.zetAantal,
      bijgewerktAantal: k.bijgewerktAantal,
      verwijderTombstoneAantal: k.verwijderTombstoneAantal,
      gesimuleerdeFout: k.gesimuleerdeFout,
      tweedeSchrijfGeslaagd: k.tweedeSchrijfGeslaagd,
      leesNaSchrijfGelijk: k.leesNaSchrijfGelijk,
      tombstoneBevestigd: k.tombstoneBevestigd,
      reedSolomonHersteld: k.reedSolomonHersteld,
      crdtSamenvoegingOk: k.crdtSamenvoegingOk,
      kruisDienstIsolatieOk: k.kruisDienstIsolatieOk,
      afwijkingenAantal: k.afwijkingenAantal,
      afwijkingSleutelHashes: k.afwijkingSleutelHashes,
      schrijfModusVoor: k.schrijfModusVoor,
      schrijfModusNa: k.schrijfModusNa,
      automatischTeruggezet: k.automatischTeruggezet,
      reden: k.reden,
      bevatGeheimenOfInhoud: false,
      vorigeKwitantieSha256: k.vorigeKwitantieSha256,
    });
    if (herrekend !== k.kwitantieSha256) {
      return {
        ok: false,
        gecontroleerdeKwitanties: i,
        laatsteSha256: verwachteVorige,
        gebrokenBijVolgnummer: i + 1,
        fout: 'DUBBEL_KWITANTIE_HASH_ONGELDIG',
      };
    }
    verwachteVorige = k.kwitantieSha256;
  }
  return {
    ok: true,
    gecontroleerdeKwitanties: kwitanties.length,
    laatsteSha256: verwachteVorige,
    gebrokenBijVolgnummer: null,
    fout: null,
  };
}

function bereidDubbelKwitantieVoor(
  map: string,
  basis: Omit<
    KlimopDubbelSchrijfKwitantieRegel,
    'kwitantieId' | 'volgnummer' | 'vorigeKwitantieSha256' | 'kwitantieSha256' | 'bevatGeheimenOfInhoud'
  >,
): KlimopDubbelSchrijfKwitantieRegel {
  const pad = join(map, DUBBEL_LOGBOEK_BESTAND);
  let vorigeSha = KLIMOP_GENESIS_KETEN_SHA256;
  let volgnummer = 1;

  if (existsSync(pad)) {
    const cp = leesGeldigLogboekCheckpoint<KlimopDubbelLogboekOverzicht['ketenIntegriteit']>(pad);
    if (cp && cp.ketenIntegriteit.ok) {
      vorigeSha = cp.ketenIntegriteit.laatsteSha256;
      volgnummer = cp.totaalAantal + 1;
    } else {
      const ruw = leesAlleDubbelKwitantiesRuw(map);
      const keten = verifieerDubbelKwitantieKeten(ruw.kwitanties);
      if (ruw.parseerFoutBijRegel === null && keten.ok) {
        schrijfLogboekCheckpoint(pad, ruw.kwitanties.length, keten);
        vorigeSha = keten.laatsteSha256;
      } else if (ruw.kwitanties.length > 0) {
        vorigeSha = String(ruw.kwitanties[ruw.kwitanties.length - 1].kwitantieSha256 ?? KLIMOP_GENESIS_KETEN_SHA256);
      }
      volgnummer = ruw.kwitanties.length + 1;
    }
  }

  const stempel = basis.tijdstipIso.replace(/[-:TZ.]/g, '').slice(0, 14);
  const kwitantieId = `dbl_${stempel}_${randomBytes(4).toString('hex')}`;

  const zonderEigenHash: Omit<KlimopDubbelSchrijfKwitantieRegel, 'kwitantieSha256'> = {
    kwitantieId,
    volgnummer,
    tijdstipIso: basis.tijdstipIso,
    dienstId: basis.dienstId,
    geisoleerdeDienstPsid: basis.geisoleerdeDienstPsid,
    knooppuntRegios: basis.knooppuntRegios,
    knooppuntenOnafhankelijk: basis.knooppuntenOnafhankelijk,
    operatiesAantal: basis.operatiesAantal,
    zetAantal: basis.zetAantal,
    bijgewerktAantal: basis.bijgewerktAantal,
    verwijderTombstoneAantal: basis.verwijderTombstoneAantal,
    gesimuleerdeFout: basis.gesimuleerdeFout,
    tweedeSchrijfGeslaagd: basis.tweedeSchrijfGeslaagd,
    leesNaSchrijfGelijk: basis.leesNaSchrijfGelijk,
    tombstoneBevestigd: basis.tombstoneBevestigd,
    reedSolomonHersteld: basis.reedSolomonHersteld,
    crdtSamenvoegingOk: basis.crdtSamenvoegingOk,
    kruisDienstIsolatieOk: basis.kruisDienstIsolatieOk,
    afwijkingenAantal: basis.afwijkingenAantal,
    afwijkingSleutelHashes: basis.afwijkingSleutelHashes,
    schrijfModusVoor: basis.schrijfModusVoor,
    schrijfModusNa: basis.schrijfModusNa,
    automatischTeruggezet: basis.automatischTeruggezet,
    reden: basis.reden,
    bevatGeheimenOfInhoud: false,
    vorigeKwitantieSha256: vorigeSha,
  };

  return {
    ...zonderEigenHash,
    kwitantieSha256: berekenDubbelKwitantieSha256(zonderEigenHash),
  };
}

/** Читає огляд квитанцій подвійного записування Сходинки 3, перевіряє ланцюжок SHA-256 та стан перемикачів. */
export function leesKlimopDubbelSchrijvenLogboek(opties?: {
  staatMap?: string;
  limiet?: number;
  dienstId?: KlimopDienstId;
  volledigeGeschiedenisControle?: boolean;
  alleenLezenZonderMutatie?: boolean;
}): KlimopDubbelLogboekOverzicht {
  const map = klimopStaatMap(opties?.staatMap);
  if (opties?.dienstId !== undefined && !KLIMOP_ELF_DIENSTEN.includes(opties.dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }
  const alleenLezen = opties?.alleenLezenZonderMutatie === true;
  if (!alleenLezen && existsSync(join(map, WAL_BESTAND))) {
    herstelOnderbrokenOverdrachtTransactie(map);
  }
  const schakelaarsBestand = leesSchakelaarsBestand(map);
  const schakelaars = KLIMOP_ELF_DIENSTEN.map((d) => schakelaarsBestand.diensten[d]);
  const limiet = Math.min(
    MAX_RECENTE_REGELS,
    Math.max(1, Number.isInteger(opties?.limiet) ? Number(opties?.limiet) : 30),
  );

  const pad = join(map, DUBBEL_LOGBOEK_BESTAND);
  if (!opties?.volledigeGeschiedenisControle) {
    const cp = leesGeldigLogboekCheckpoint<KlimopDubbelLogboekOverzicht['ketenIntegriteit']>(pad);
    if (cp) {
      const staart = leesLaatsteJsonlRegelsUitStaart<KlimopDubbelSchrijfKwitantieRegel>(
        pad,
        Math.max(65_536, limiet * 2048),
      );
      if (staart) {
        const gefilterd = opties?.dienstId
          ? staart.regels.filter((k) => k.dienstId === opties.dienstId)
          : staart.regels;
        if (gefilterd.length >= limiet || staart.volledigBestandGelezen) {
          return {
            ketenIntegriteit: cp.ketenIntegriteit,
            samenvatting: {
              actieveDubbelSchrijvenDiensten: schakelaars.filter(
                (s) => s.schrijfModus === 'gecontroleerd_dubbel_schrijven',
              ).length,
              actievePassiefLezenDiensten: schakelaars.filter((s) => s.leesModus === 'passief_spiegel_lezen').length,
              actieveQuorumGereedDiensten: schakelaars.filter(
                (s) => s.attestModus === 'quorum_gereed_onder_erfenis',
              ).length,
              totaalDiensten: schakelaars.length,
              totaalKwitanties: cp.totaalAantal,
              totaalDubbelSchrijfFouten: schakelaars.reduce((n, s) => n + s.totaalDubbelSchrijfFouten, 0),
            },
            schakelaars,
            recenteKwitanties: [...gefilterd].slice(-limiet).reverse(),
            productieDatabankGewijzigd: false,
          };
        }
      }
    }
  }

  const grootteVoorLezen = existsSync(pad) ? statSync(pad).size : 0;
  const ruw = leesAlleDubbelKwitantiesRuw(map);
  const keten =
    ruw.parseerFoutBijRegel !== null
      ? {
          ok: false,
          gecontroleerdeKwitanties: Math.max(0, ruw.parseerFoutBijRegel - 1),
          laatsteSha256: KLIMOP_GENESIS_KETEN_SHA256,
          gebrokenBijVolgnummer: ruw.parseerFoutBijRegel,
          fout: 'DUBBEL_LOGBOEK_JSON_BESCHADIGD',
        }
      : verifieerDubbelKwitantieKeten(ruw.kwitanties);
  if (!alleenLezen && keten.ok && existsSync(pad)) {
    metOverdrachtSlot(map, () => {
      if (!existsSync(join(map, WAL_BESTAND)) && existsSync(pad) && statSync(pad).size === grootteVoorLezen) {
        schrijfLogboekCheckpoint(pad, ruw.kwitanties.length, keten);
      }
    });
  }

  const gefilterd = opties?.dienstId
    ? ruw.kwitanties.filter((k) => k.dienstId === opties.dienstId)
    : ruw.kwitanties;
  const recenteKwitanties = [...gefilterd].slice(-limiet).reverse();

  return {
    ketenIntegriteit: keten,
    samenvatting: {
      actieveDubbelSchrijvenDiensten: schakelaars.filter(
        (s) => s.schrijfModus === 'gecontroleerd_dubbel_schrijven',
      ).length,
      actievePassiefLezenDiensten: schakelaars.filter((s) => s.leesModus === 'passief_spiegel_lezen').length,
      actieveQuorumGereedDiensten: schakelaars.filter(
        (s) => s.attestModus === 'quorum_gereed_onder_erfenis',
      ).length,
      totaalDiensten: schakelaars.length,
      totaalKwitanties: ruw.kwitanties.length,
      totaalDubbelSchrijfFouten: schakelaars.reduce((n, s) => n + s.totaalDubbelSchrijfFouten, 0),
    },
    schakelaars,
    recenteKwitanties,
    productieDatabankGewijzigd: false,
  };
}

/**
 * Сходинка 3 (§35 маніфесту): виконує контрольоване подвійне записування в ізольованому контурі
 * (створення `zet`, конкурентне оновлення за вищим HLC та криптографічне видалення з надгробком `verwijder`)
 * на між'юрисдикційному кворумі 3 незалежних вузлів (`NL`, `CH`, `UA`) зі смугами Ріда–Соломона `(4+2)`,
 * проводить негайну звірку читання після запису та при будь-якому збої миттєво й автоматично повертає службу
 * на чинну основу (`alleen_erfenis_postgres`) без жодного втручання у робочу базу даних.
 */
export function voerGecontroleerdeDubbelSchrijfProefUit(
  raw: unknown,
  opties?: { staatMap?: string },
): KlimopDubbelSchrijvenUitkomst {
  const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dienstId = String(b.dienstId ?? 'postvak') as KlimopDienstId;
  if (!KLIMOP_ELF_DIENSTEN.includes(dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }

  const ruweOperaties =
    b.operatiesAantal !== undefined ? Number(b.operatiesAantal) : STANDAARD_DUBBEL_OPERATIES;
  if (
    !Number.isInteger(ruweOperaties)
    || ruweOperaties < MIN_DUBBEL_OPERATIES
    || ruweOperaties > MAX_DUBBEL_OPERATIES
  ) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }
  const operatiesAantal = ruweOperaties;

  const gesimuleerdeFout = String(b.simuleerFout ?? 'geen') as KlimopGesimuleerdeDubbelSchrijfFout;
  if (!KLIMOP_GESIMULEERDE_DUBBEL_FOUTEN.includes(gesimuleerdeFout)) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }

  const map = klimopStaatMap(opties?.staatMap);
  return metOverdrachtSlot(map, () => {
    herstelOnderbrokenOverdrachtTransactieBinnenSlot(map);
    const nuIso = new Date().toISOString();
    const nuMs = Date.now();
    const profiel = STANDAARD_DIENST_ISOLATIE_PROFIELEN[dienstId];

    const wortelGeheim32 = randomBytes(32);
    const zout32 = randomBytes(32);
    const kek32 = randomBytes(32);

    try {
      const persoon = maakPersoonsIdentiteit(nuIso);
      const dienstCtx = leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: wortelGeheim32,
        persoonsZout32: zout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId,
        epoche: 3,
      });
      const andereDienstId: KlimopDienstId = dienstId === 'postvak' ? 'wolkopslag' : 'postvak';
      const andereDienstCtx = leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: wortelGeheim32,
        persoonsZout32: zout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId: andereDienstId,
        epoche: 3,
      });

      try {
        const knoopNL = maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'NL',
          aanbieder: 'dubbel-schrijf-nl',
          nuIso,
        });
        const knoopCH = maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'CH',
          aanbieder: 'dubbel-schrijf-ch',
          nuIso,
        });
        const knoopUA = maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'UA',
          aanbieder: 'dubbel-schrijf-ua',
          nuIso,
        });
        const knooppunten = [knoopNL, knoopCH, knoopUA] as const;
        const onafhankelijkheid = controleerKnooppuntOnafhankelijkheid(
          knooppunten.map((k) => k.identiteit),
          2,
        );

        // Будуємо послідовність контрольованих мутацій: створення `zet`, конкурентне оновлення за HLC та видалення `verwijder`.
        const hoofdSleutelId = `dubbel_${dienstId}_rec_1`;
        const wisSleutelId = `dubbel_${dienstId}_te_wissen`;

        type MutatieStap = {
          sleutelId: string;
          soort: 'zet' | 'verwijder';
          versie: number;
          hlcTeller: number;
          knoopIdx: number;
        };

        const mutaties: MutatieStap[] = [];
        let hlcTeller = 1;

        if (operatiesAantal === 3) {
          mutaties.push({ sleutelId: hoofdSleutelId, soort: 'zet', versie: 1, hlcTeller: hlcTeller++, knoopIdx: 0 });
          mutaties.push({ sleutelId: hoofdSleutelId, soort: 'zet', versie: 2, hlcTeller: hlcTeller++, knoopIdx: 1 });
          mutaties.push({ sleutelId: wisSleutelId, soort: 'verwijder', versie: 1, hlcTeller: hlcTeller++, knoopIdx: 2 });
        } else {
          mutaties.push({ sleutelId: hoofdSleutelId, soort: 'zet', versie: 1, hlcTeller: hlcTeller++, knoopIdx: 0 });
          mutaties.push({ sleutelId: wisSleutelId, soort: 'zet', versie: 1, hlcTeller: hlcTeller++, knoopIdx: 1 });
          for (let extra = 2; extra <= operatiesAantal - 2; extra++) {
            mutaties.push({
              sleutelId: `dubbel_${dienstId}_rec_${extra}`,
              soort: 'zet',
              versie: 1,
              hlcTeller: hlcTeller++,
              knoopIdx: extra % 3,
            });
          }
          mutaties.push({ sleutelId: hoofdSleutelId, soort: 'zet', versie: 2, hlcTeller: hlcTeller++, knoopIdx: 2 });
          mutaties.push({ sleutelId: wisSleutelId, soort: 'verwijder', versie: 2, hlcTeller: hlcTeller++, knoopIdx: 0 });
        }

        const zetAantal = operatiesAantal - 2;
        const bijgewerktAantal = 1;
        const verwijderTombstoneAantal = 1;

        // 1) Контур А (еталон у пам'яті без жодного запису в робочу PostgreSQL)
        const erfenisMap = new Map<string, { waardeJson: string; inhoudSha256: string; machtigingenSha256: string }>();
        // 2) Контур Б (розподілені CRDT-репліки на вузлах NL, CH, UA)
        let staatNL = maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid);
        let staatCH = maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid);
        let staatUA = maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid);

        let tweedeSchrijfGeslaagd = true;
        let kruisDienstIsolatieAfgedwongen = dienstCtx.dienstPsid !== andereDienstCtx.dienstPsid;

        for (let i = 0; i < mutaties.length; i++) {
          const m = mutaties[i];
          const waarde = {
            dienstId,
            dienstPsid: dienstCtx.dienstPsid,
            schema: 3,
            sleutelId: m.sleutelId,
            soort: 'gecontroleerd_dubbel_schrijven_stap_3',
            tijdstip: nuIso,
            versie: m.versie,
          };
          const waardeJson = JSON.stringify(waarde, Object.keys(waarde).sort());
          const inhoudSha256 = createHash('sha256').update(waardeJson, 'utf8').digest('hex');
          const machtigingenSha256 = createHash('sha256')
            .update(`${dienstId}|${dienstCtx.dienstPsid}|eigenaar_dubbel_schrijven|v${m.versie}`, 'utf8')
            .digest('hex');

          // Застосовуємо мутацію до еталонного контуру А
          if (m.soort === 'verwijder') {
            erfenisMap.delete(m.sleutelId);
          } else {
            erfenisMap.set(m.sleutelId, { waardeJson, inhoudSha256, machtigingenSha256 });
          }

          // Імітація збою другого запису чи пропущеного надгробка видалення у контурі Б
          if (gesimuleerdeFout === 'tweede_schrijf_mislukt' && m.sleutelId === hoofdSleutelId && m.versie === 2) {
            tweedeSchrijfGeslaagd = false;
            continue;
          }
          if (gesimuleerdeFout === 'verwijder_tombstone_gemist' && m.soort === 'verwijder') {
            continue;
          }

          const schrijver = knooppunten[m.knoopIdx];
          const op = maakOndertekendeCrdtOperatie({
            dienstContext: dienstCtx,
            sleutelId: m.sleutelId,
            soort: m.soort,
            klareWaarde: m.soort === 'verwijder' ? null : waarde,
            hlc: maakHlcStempel(nuMs + m.hlcTeller, m.hlcTeller, schrijver.identiteit.knooppuntId),
            apparaatTekenSleutels: {
              publiekeSleutelDerB64u: schrijver.identiteit.publiekeSleutelDerB64u,
              geheimeSleutelPkcs8B64u: schrijver.geheimeSleutelPkcs8B64u,
            },
          });

          if (i === 0) {
            const kruis = ontsleutelCrdtOperatieWaarde(op, andereDienstCtx);
            if (kruis.ok !== false) kruisDienstIsolatieAfgedwongen = false;
          }

          if (m.knoopIdx === 0) {
            staatNL = { ...staatNL, elementen: { ...staatNL.elementen, [m.sleutelId]: op } };
          } else if (m.knoopIdx === 1) {
            staatCH = { ...staatCH, elementen: { ...staatCH.elementen, [m.sleutelId]: op } };
          } else {
            staatUA = { ...staatUA, elementen: { ...staatUA.elementen, [m.sleutelId]: op } };
          }
        }

        // Зливаємо CRDT-стани всіх 3 незалежних вузлів (комутативно й асоціативно)
        const stap1Samen = voegCrdtStatenSamen(staatNL, staatCH);
        const samengevoegd = stap1Samen.ok
          ? voegCrdtStatenSamen(stap1Samen.samengevoegd, staatUA)
          : stap1Samen;

        let crdtSamenvoegingOk = samengevoegd.ok;
        let tombstoneBevestigd = false;
        let reedSolomonAlleActieveHersteld = true;

        const erfenisRecords: DienstStaatSamenvattingRecord[] = [...erfenisMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([sleutelId, v]) => ({
            sleutelId,
            inhoudSha256: v.inhoudSha256,
            machtigingenSha256: v.machtigingenSha256,
          }));

        const klimopRecords: DienstStaatSamenvattingRecord[] = [];

        if (samengevoegd.ok) {
          const wisOp = samengevoegd.samengevoegd.elementen[wisSleutelId];
          if (wisOp) {
            const ontslWis = ontsleutelCrdtOperatieWaarde(wisOp, dienstCtx);
            tombstoneBevestigd =
              ontslWis.ok === true && ontslWis.soort === 'verwijder' && ontslWis.waarde === null;
          }

          const gesorteerdeSleutels = Object.keys(samengevoegd.samengevoegd.elementen).sort((a, b) =>
            a.localeCompare(b),
          );
          let idxTeller = 0;
          for (const sleutelId of gesorteerdeSleutels) {
            const op = samengevoegd.samengevoegd.elementen[sleutelId];
            const ontsl = ontsleutelCrdtOperatieWaarde<Record<string, unknown>>(op, dienstCtx);
            if (!ontsl.ok) {
              crdtSamenvoegingOk = false;
              continue;
            }
            if (ontsl.soort === 'verwijder') {
              continue;
            }

            const ontslObj = ontsl.waarde ?? {};
            const klareBytes = Buffer.from(
              JSON.stringify(ontslObj, Object.keys(ontslObj).sort()),
              'utf8',
            );
            const verdeeld = versleutelEnVerdeelObject({
              inhoud: klareBytes,
              objectId: sleutelId,
              eigenaar: knoopNL,
              kek: kek32,
              k: 4,
              m: 2,
              nuIso,
            });
            // Імітуємо втрату 2 смуг (наприклад, недоступність вузла CH під час звірки читання після запису)
            const overlevende = verdeeld.fragmentenPerSegment.map((seg) =>
              seg.filter((f) => f.index !== (idxTeller % 6) && f.index !== ((idxTeller + 2) % 6)),
            );
            const hersteld = herstelEnOntsleutelObject({
              manifest: verdeeld.manifest,
              fragmentenPerSegment: overlevende,
              kek: kek32,
            });
            idxTeller++;

            if (!hersteld.ok) {
              reedSolomonAlleActieveHersteld = false;
              continue;
            }

            let inhoudSha256 = createHash('sha256').update(hersteld.inhoud).digest('hex');
            const versie = Number(ontsl.waarde?.versie ?? 1);
            let machtigingenSha256 = createHash('sha256')
              .update(`${dienstId}|${dienstCtx.dienstPsid}|eigenaar_dubbel_schrijven|v${versie}`, 'utf8')
              .digest('hex');

            if (gesimuleerdeFout === 'lees_inhoud_afwijking' && sleutelId === hoofdSleutelId) {
              inhoudSha256 = createHash('sha256')
                .update('gesimuleerde-lees-na-schrijf-afwijking', 'utf8')
                .digest('hex');
            }
            if (gesimuleerdeFout === 'machtigingen_afwijking' && sleutelId === hoofdSleutelId) {
              machtigingenSha256 = createHash('sha256')
                .update('gesimuleerde-dubbel-schrijf-rechtenafwijking', 'utf8')
                .digest('hex');
            }

            klimopRecords.push({ sleutelId, inhoudSha256, machtigingenSha256 });
          }
        }

        const pariteitVerslag = vergelijkErfenisEnKlimopStaat(erfenisRecords, klimopRecords);
        const leesNaSchrijfGelijk = pariteitVerslag.volledigGelijk && tombstoneBevestigd;

        const overdrachtBesluit = beslisOverDienstOverdrachtStap({
          dienstId,
          huidigeModus: 'schaduw_dubbel_schrijven',
          gewensteModus: 'klimop_primair_met_erfenis_terugval',
          pariteit: pariteitVerslag,
        });

        const extraOngewisteIds =
          !tombstoneBevestigd && !pariteitVerslag.afwijkendeInhoudIds.includes(wisSleutelId)
            ? [wisSleutelId]
            : [];

        const afwijkingenAantal =
          pariteitVerslag.ontbrekendeInKlimopIds.length
          + pariteitVerslag.afwijkendeInhoudIds.length
          + pariteitVerslag.afwijkendeMachtigingenIds.length
          + extraOngewisteIds.length
          + (tweedeSchrijfGeslaagd ? 0 : 1);

        const allesOk =
          onafhankelijkheid.ok
          && tweedeSchrijfGeslaagd
          && leesNaSchrijfGelijk
          && tombstoneBevestigd
          && reedSolomonAlleActieveHersteld
          && crdtSamenvoegingOk
          && kruisDienstIsolatieAfgedwongen
          && overdrachtBesluit.toegestaan;

        const schakelaarsBestand = leesSchakelaarsBestand(map);
        const huidigeStaat = schakelaarsBestand.diensten[dienstId];
        const leesModusVoor = huidigeStaat.leesModus;
        const schrijfModusVoor = huidigeStaat.schrijfModus;

        let leesModusNa: KlimopPassieveLeesModus = leesModusVoor;
        let schrijfModusNa: KlimopDubbelSchrijfModus = schrijfModusVoor;
        let attestModusNa: KlimopQuorumAttestModus = huidigeStaat.attestModus;
        let automatischTeruggezet = false;

        if (
          !allesOk
          && (
            schrijfModusVoor === 'gecontroleerd_dubbel_schrijven'
            || leesModusVoor === 'passief_spiegel_lezen'
            || huidigeStaat.attestModus === 'quorum_gereed_onder_erfenis'
          )
        ) {
          leesModusNa = 'alleen_erfenis_postgres';
          schrijfModusNa = 'alleen_erfenis_postgres';
          attestModusNa = 'alleen_erfenis_postgres';
          automatischTeruggezet = true;
        }

        const reden = automatischTeruggezet
          ? 'AUTOMATISCH_TERUGGEZET_NA_DUBBEL_SCHRIJF_FOUT'
          : allesOk
            ? 'DUBBEL_SCHRIJVEN_EN_LEESVERIFICATIE_BEWEZEN'
            : 'DUBBEL_SCHRIJF_PROEF_AFGEWEZEN_WEGENS_AFWIJKING';

        const bijgewerkteStaat: KlimopDienstSchakelaarStaat = {
          ...huidigeStaat,
          primaireSchrijfBron: 'erfenis_postgres',
          leesModus: leesModusNa,
          schrijfModus: schrijfModusNa,
          attestModus: attestModusNa,
          laatstePariteitOk: allesOk ? huidigeStaat.laatstePariteitOk : false,
          opeenvolgendeGelijkeControles: allesOk ? huidigeStaat.opeenvolgendeGelijkeControles : 0,
          laatsteDubbelSchrijfOk: allesOk,
          opeenvolgendeDubbelSchrijfControles: allesOk
            ? huidigeStaat.opeenvolgendeDubbelSchrijfControles + 1
            : 0,
          totaalDubbelSchrijfProeven: huidigeStaat.totaalDubbelSchrijfProeven + 1,
          totaalDubbelSchrijfFouten: huidigeStaat.totaalDubbelSchrijfFouten + (allesOk ? 0 : 1),
          laatsteQuorumAttestOk: allesOk ? huidigeStaat.laatsteQuorumAttestOk : false,
          opeenvolgendeGeldigeAttesten: allesOk ? huidigeStaat.opeenvolgendeGeldigeAttesten : 0,
          totaalGevondenAfwijkingen: huidigeStaat.totaalGevondenAfwijkingen + afwijkingenAantal,
          automatischeTerugschakelingen:
            huidigeStaat.automatischeTerugschakelingen + (automatischTeruggezet ? 1 : 0),
          laatsteDubbelSchrijfOp: nuIso,
          laatsteSchakelingOp: automatischTeruggezet ? nuIso : huidigeStaat.laatsteSchakelingOp,
          laatsteReden: reden,
          bewijsVersie: (huidigeStaat.bewijsVersie ?? 0) + 1,
          laatsteGeldigeAttestSha256: null,
        };

        schakelaarsBestand.diensten[dienstId] = bijgewerkteStaat;
        schakelaarsBestand.bijgewerktOp = nuIso;

        const afwijkingSleutelHashes = {
          ontbrekend: pariteitVerslag.ontbrekendeInKlimopIds.map(hashSleutelIdVoorLogboek),
          inhoud: [...pariteitVerslag.afwijkendeInhoudIds, ...extraOngewisteIds].map(
            hashSleutelIdVoorLogboek,
          ),
          machtigingen: pariteitVerslag.afwijkendeMachtigingenIds.map(hashSleutelIdVoorLogboek),
        };

        const kwitantieRegel = bereidDubbelKwitantieVoor(map, {
          tijdstipIso: nuIso,
          dienstId,
          geisoleerdeDienstPsid: dienstCtx.dienstPsid,
          knooppuntRegios: ['NL', 'CH', 'UA'],
          knooppuntenOnafhankelijk: onafhankelijkheid.ok,
          operatiesAantal,
          zetAantal,
          bijgewerktAantal,
          verwijderTombstoneAantal,
          gesimuleerdeFout,
          tweedeSchrijfGeslaagd,
          leesNaSchrijfGelijk,
          tombstoneBevestigd,
          reedSolomonHersteld: reedSolomonAlleActieveHersteld,
          crdtSamenvoegingOk,
          kruisDienstIsolatieOk: kruisDienstIsolatieAfgedwongen,
          afwijkingenAantal,
          afwijkingSleutelHashes,
          schrijfModusVoor,
          schrijfModusNa,
          automatischTeruggezet,
          reden,
        });

        const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
          tijdstipIso: nuIso,
          soort: automatischTeruggezet ? 'automatische_terugschakeling' : 'dubbel_schrijven_proef',
          dienstId,
          leesModusVoor,
          leesModusNa,
          aantalGecontroleerd: operatiesAantal,
          afwijkingenAantal,
          afwijkingSleutelHashes,
          reedSolomonHersteld: reedSolomonAlleActieveHersteld,
          crdtSamenvoegingOk,
          automatischTeruggezet,
          reden,
        });

        voerOverdrachtTransactieUit(map, {
          schakelaars: schakelaarsBestand,
          dubbelRegel: kwitantieRegel,
          spiegelRegel: logboekRegel,
        });

        return {
          ok: allesOk,
          dienstId,
          subdomein: profiel.subdomeinBestaand,
          geisoleerdeDienstPsid: dienstCtx.dienstPsid,
          knooppunten: {
            regios: ['NL', 'CH', 'UA'],
            onafhankelijkQuorumOk: onafhankelijkheid.ok,
          },
          operaties: {
            totaal: operatiesAantal,
            zetAantal,
            bijgewerktAantal,
            verwijderTombstoneAantal,
          },
          gesimuleerdeFout,
          tweedeSchrijfGeslaagd,
          leesNaSchrijfGelijk,
          tombstoneBevestigd,
          reedSolomonAlleActieveHersteld,
          crdtSamenvoegingOk,
          kruisDienstIsolatieAfgedwongen,
          pariteit: {
            volledigGelijk: leesNaSchrijfGelijk,
            actieveRecordsGecontroleerd: erfenisRecords.length,
            afwijkingen: afwijkingenAantal,
            ontbrekendAantal: pariteitVerslag.ontbrekendeInKlimopIds.length,
            inhoudAfwijkingAantal: pariteitVerslag.afwijkendeInhoudIds.length + extraOngewisteIds.length,
            machtigingenAfwijkingAantal: pariteitVerslag.afwijkendeMachtigingenIds.length,
          },
          overdrachtBesluit: {
            toegestaan: allesOk,
            huidigeProductieModus: 'alleen_erfenis_postgres',
            gevalideerdeProefModus: allesOk
              ? overdrachtBesluit.nieuweActieveModus
              : 'alleen_erfenis_postgres',
            reden,
          },
          schakelaar: bijgewerkteStaat,
          automatischTeruggezetNaarErfenis: automatischTeruggezet,
          kwitantieRegel,
          logboekRegel,
          productieDatabankGewijzigd: false,
        };
      } finally {
        dienstCtx.dienstSleutel32.fill(0);
        andereDienstCtx.dienstSleutel32.fill(0);
      }
    } finally {
      wortelGeheim32.fill(0);
      zout32.fill(0);
      kek32.fill(0);
    }
  });
}

// =================================================================================================
// Сходинка 4 (§35 маніфесту): кворумний атестат готовності під подвійною печаткою FROST (RFC 9591)
// та гібридного постквантового підпису Ed25519 + ML-DSA-65 (FIPS 204) без самовільного вимкнення БД
// =================================================================================================

/** Формує канонічні криптографічні повідомлення з розділенням доменів для FROST та гібридного підпису. */
export function maakQuorumAttestTekenBoodschappen(kern: {
  attestId: string;
  volgnummer: number;
  tijdstipIso: string;
  dienstId: KlimopDienstId;
  geisoleerdeDienstPsid: string;
  knooppuntRegios: readonly string[];
  frostDrempel: { k: number; n: number };
  frostOndertekenaars: readonly number[];
  spiegelKetenKopSha256: string;
  dubbelKetenKopSha256: string;
  zaadMerkleWortelSha256: string | null;
  vorigeAttestSha256: string;
  dienstBewijsVersie?: number;
  quorumKnooppuntIds?: readonly string[];
  gereedheidVoorwaardeOk?: boolean;
}): { frostBoodschap: Buffer; hybrideBoodschap: Buffer } {
  const json = canoniekeJson({
    schema: 4,
    attestId: kern.attestId,
    volgnummer: kern.volgnummer,
    tijdstipIso: kern.tijdstipIso,
    dienstId: kern.dienstId,
    geisoleerdeDienstPsid: kern.geisoleerdeDienstPsid,
    knooppuntRegios: kern.knooppuntRegios,
    frostDrempel: kern.frostDrempel,
    frostOndertekenaars: kern.frostOndertekenaars,
    spiegelKetenKopSha256: kern.spiegelKetenKopSha256,
    dubbelKetenKopSha256: kern.dubbelKetenKopSha256,
    zaadMerkleWortelSha256: kern.zaadMerkleWortelSha256,
    vorigeAttestSha256: kern.vorigeAttestSha256,
    ...(kern.dienstBewijsVersie !== undefined ? { dienstBewijsVersie: kern.dienstBewijsVersie } : {}),
    ...(kern.quorumKnooppuntIds ? { quorumKnooppuntIds: kern.quorumKnooppuntIds } : {}),
    ...(kern.gereedheidVoorwaardeOk !== undefined ? { gereedheidVoorwaardeOk: kern.gereedheidVoorwaardeOk } : {}),
  });
  return {
    frostBoodschap: Buffer.from(QUORUM_ATTEST_FROST_DOMEIN + json, 'utf8'),
    hybrideBoodschap: Buffer.from(QUORUM_ATTEST_HYBRIDE_DOMEIN + json, 'utf8'),
  };
}

/** Обчислює детермінований відбиток SHA-256 запису кворумного атестата у ланцюжку Сходинки 4. */
export function berekenQuorumAttestSha256(
  zonderEigenHash: Omit<KlimopQuorumAttestRegel, 'attestSha256'>,
): string {
  const kanoniek = JSON.stringify([
    zonderEigenHash.attestId,
    zonderEigenHash.volgnummer,
    zonderEigenHash.tijdstipIso,
    zonderEigenHash.dienstId,
    zonderEigenHash.geisoleerdeDienstPsid,
    zonderEigenHash.knooppuntRegios,
    zonderEigenHash.knooppuntenOnafhankelijk,
    zonderEigenHash.frostDrempel.k,
    zonderEigenHash.frostDrempel.n,
    zonderEigenHash.frostOndertekenaars,
    zonderEigenHash.spiegelKetenKopSha256,
    zonderEigenHash.dubbelKetenKopSha256,
    zonderEigenHash.zaadMerkleWortelSha256,
    zonderEigenHash.gesimuleerdeFout,
    zonderEigenHash.frostGroepsPubliekeSleutelHex,
    zonderEigenHash.frostGroepsHandtekeningHex,
    zonderEigenHash.hybrideHandtekening.algoritme,
    zonderEigenHash.hybrideHandtekening.ed25519PubliekDerB64u,
    zonderEigenHash.hybrideHandtekening.mlDsa65PubliekSpkiB64u,
    zonderEigenHash.hybrideHandtekening.ed25519HandtekeningB64u,
    zonderEigenHash.hybrideHandtekening.mlDsa65HandtekeningB64u,
    zonderEigenHash.frostVerificatieOk,
    zonderEigenHash.hybrideVerificatieOk,
    zonderEigenHash.ketensSluitend,
    zonderEigenHash.besluitVolledigOnafhankelijkToegestaan,
    ...(zonderEigenHash.uitvoeringsAard ? [zonderEigenHash.uitvoeringsAard] : []),
    ...(zonderEigenHash.dienstBewijsVersie !== undefined ? [zonderEigenHash.dienstBewijsVersie] : []),
    ...(zonderEigenHash.quorumKnooppuntIds ? [zonderEigenHash.quorumKnooppuntIds] : []),
    ...(zonderEigenHash.gereedheidVoorwaardeOk !== undefined ? [zonderEigenHash.gereedheidVoorwaardeOk] : []),
    zonderEigenHash.attestModusVoor,
    zonderEigenHash.attestModusNa,
    zonderEigenHash.automatischTeruggezet,
    zonderEigenHash.reden,
    zonderEigenHash.bevatGeheimenOfInhoud,
    zonderEigenHash.vorigeAttestSha256,
  ]);
  return createHash('sha256').update(kanoniek, 'utf8').digest('hex');
}

function leesAlleQuorumAttestenRuw(map: string): {
  attesten: KlimopQuorumAttestRegel[];
  parseerFoutBijRegel: number | null;
} {
  const pad = join(map, ATTEST_LOGBOEK_BESTAND);
  if (!existsSync(pad)) {
    return { attesten: [], parseerFoutBijRegel: null };
  }
  const inhoud = readFileSync(pad, 'utf8');
  const lijnen = inhoud
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const attesten: KlimopQuorumAttestRegel[] = [];
  for (let i = 0; i < lijnen.length; i++) {
    try {
      const a = JSON.parse(lijnen[i]) as KlimopQuorumAttestRegel;
      attesten.push(a);
    } catch {
      return { attesten, parseerFoutBijRegel: i + 1 };
    }
  }
  return { attesten, parseerFoutBijRegel: null };
}

export interface ErkendQuorumSleutelRegister {
  frostGroepsPubliekeSleutelHex: string;
  ed25519PubliekDerB64u: string;
  mlDsa65PubliekSpkiB64u: string;
}

/**
 * Перевіряє нерозривність ланцюжка SHA-256 та справжність ОБОХ криптографічних підписів
 * (`FROST Ed25519 RFC 9591` + `Ed25519 + ML-DSA-65 FIPS 204`) для кожного чинного кворумного атестата,
 * а за наявності `erkendSleutelRegister` — також належність ключів до наперед схваленого реєстру.
 */
export function verifieerQuorumAttestKeten(
  attesten: readonly KlimopQuorumAttestRegel[],
  erkendSleutelRegister?: ErkendQuorumSleutelRegister,
): {
  ok: boolean;
  gecontroleerdeAttesten: number;
  laatsteSha256: string;
  gebrokenBijVolgnummer: number | null;
  fout: string | null;
} {
  let verwachteVorige = KLIMOP_GENESIS_KETEN_SHA256;
  for (let i = 0; i < attesten.length; i++) {
    const a = attesten[i];
    if (
      !a
      || a.volgnummer !== i + 1
      || a.vorigeAttestSha256 !== verwachteVorige
      || a.bevatGeheimenOfInhoud !== false
    ) {
      return {
        ok: false,
        gecontroleerdeAttesten: i,
        laatsteSha256: verwachteVorige,
        gebrokenBijVolgnummer: i + 1,
        fout: 'ATTEST_KETEN_VERBROKEN',
      };
    }
    const herrekend = berekenQuorumAttestSha256({
      attestId: a.attestId,
      volgnummer: a.volgnummer,
      tijdstipIso: a.tijdstipIso,
      dienstId: a.dienstId,
      geisoleerdeDienstPsid: a.geisoleerdeDienstPsid,
      knooppuntRegios: a.knooppuntRegios,
      knooppuntenOnafhankelijk: a.knooppuntenOnafhankelijk,
      frostDrempel: a.frostDrempel,
      frostOndertekenaars: a.frostOndertekenaars,
      spiegelKetenKopSha256: a.spiegelKetenKopSha256,
      dubbelKetenKopSha256: a.dubbelKetenKopSha256,
      zaadMerkleWortelSha256: a.zaadMerkleWortelSha256,
      gesimuleerdeFout: a.gesimuleerdeFout,
      frostGroepsPubliekeSleutelHex: a.frostGroepsPubliekeSleutelHex,
      frostGroepsHandtekeningHex: a.frostGroepsHandtekeningHex,
      hybrideHandtekening: a.hybrideHandtekening,
      frostVerificatieOk: a.frostVerificatieOk,
      hybrideVerificatieOk: a.hybrideVerificatieOk,
      ketensSluitend: a.ketensSluitend,
      besluitVolledigOnafhankelijkToegestaan: a.besluitVolledigOnafhankelijkToegestaan,
      ...(a.uitvoeringsAard ? { uitvoeringsAard: a.uitvoeringsAard } : {}),
      ...(a.dienstBewijsVersie !== undefined ? { dienstBewijsVersie: a.dienstBewijsVersie } : {}),
      ...(a.quorumKnooppuntIds ? { quorumKnooppuntIds: a.quorumKnooppuntIds } : {}),
      ...(a.gereedheidVoorwaardeOk !== undefined ? { gereedheidVoorwaardeOk: a.gereedheidVoorwaardeOk } : {}),
      attestModusVoor: a.attestModusVoor,
      attestModusNa: a.attestModusNa,
      automatischTeruggezet: a.automatischTeruggezet,
      reden: a.reden,
      bevatGeheimenOfInhoud: false,
      vorigeAttestSha256: a.vorigeAttestSha256,
    });
    if (herrekend !== a.attestSha256) {
      return {
        ok: false,
        gecontroleerdeAttesten: i,
        laatsteSha256: verwachteVorige,
        gebrokenBijVolgnummer: i + 1,
        fout: 'ATTEST_HASH_ONGELDIG',
      };
    }

    if (erkendSleutelRegister && (a.frostVerificatieOk || a.hybrideVerificatieOk || a.besluitVolledigOnafhankelijkToegestaan)) {
      if (
        a.frostGroepsPubliekeSleutelHex.toLowerCase() !== erkendSleutelRegister.frostGroepsPubliekeSleutelHex.toLowerCase()
        || a.hybrideHandtekening.ed25519PubliekDerB64u !== erkendSleutelRegister.ed25519PubliekDerB64u
        || a.hybrideHandtekening.mlDsa65PubliekSpkiB64u !== erkendSleutelRegister.mlDsa65PubliekSpkiB64u
      ) {
        return {
          ok: false,
          gecontroleerdeAttesten: i,
          laatsteSha256: verwachteVorige,
          gebrokenBijVolgnummer: i + 1,
          fout: 'ATTEST_SLEUTEL_BUITEN_ERKEND_REGISTER',
        };
      }
    }

    // Якщо атестат заявлено чинним, повторно перевіряємо справжність порогового та постквантового підписів!
    if (a.frostVerificatieOk || a.besluitVolledigOnafhankelijkToegestaan) {
      const boodschappen = maakQuorumAttestTekenBoodschappen(a);
      const frostOk = verifieerStandaardEd25519Handtekening(
        boodschappen.frostBoodschap,
        a.frostGroepsHandtekeningHex,
        a.frostGroepsPubliekeSleutelHex,
      );
      if (!frostOk) {
        return {
          ok: false,
          gecontroleerdeAttesten: i,
          laatsteSha256: verwachteVorige,
          gebrokenBijVolgnummer: i + 1,
          fout: 'ATTEST_FROST_HANDTEKENING_ONGELDIG',
        };
      }
    }
    if (a.hybrideVerificatieOk || a.besluitVolledigOnafhankelijkToegestaan) {
      const boodschappen = maakQuorumAttestTekenBoodschappen(a);
      const hybrideOk = verifieerHybrideEd25519MlDsa65(
        boodschappen.hybrideBoodschap,
        a.hybrideHandtekening,
      );
      if (!hybrideOk.ok) {
        return {
          ok: false,
          gecontroleerdeAttesten: i,
          laatsteSha256: verwachteVorige,
          gebrokenBijVolgnummer: i + 1,
          fout: 'ATTEST_HYBRIDE_HANDTEKENING_ONGELDIG',
        };
      }
    }

    verwachteVorige = a.attestSha256;
  }
  return {
    ok: true,
    gecontroleerdeAttesten: attesten.length,
    laatsteSha256: verwachteVorige,
    gebrokenBijVolgnummer: null,
    fout: null,
  };
}

function leesAttestKopVoorToevoegen(map: string): {
  ketenOk: boolean;
  vorigeSha256: string;
  volgendVolgnummer: number;
} {
  const pad = join(map, ATTEST_LOGBOEK_BESTAND);
  const cp = leesGeldigLogboekCheckpoint<{
    ok: boolean;
    gecontroleerdeAttesten: number;
    laatsteSha256: string;
    gebrokenBijVolgnummer: number | null;
    fout: string | null;
  }>(pad);
  if (cp && cp.ketenIntegriteit.ok) {
    return {
      ketenOk: true,
      vorigeSha256: cp.ketenIntegriteit.laatsteSha256,
      volgendVolgnummer: cp.totaalAantal + 1,
    };
  }
  const ruw = leesAlleQuorumAttestenRuw(map);
  const keten = verifieerQuorumAttestKeten(ruw.attesten);
  if (ruw.parseerFoutBijRegel === null && keten.ok) {
    schrijfLogboekCheckpoint(pad, ruw.attesten.length, keten);
    return {
      ketenOk: true,
      vorigeSha256: keten.laatsteSha256,
      volgendVolgnummer: ruw.attesten.length + 1,
    };
  }
  return {
    ketenOk: false,
    vorigeSha256:
      ruw.attesten.length > 0
        ? String(ruw.attesten[ruw.attesten.length - 1].attestSha256 ?? KLIMOP_GENESIS_KETEN_SHA256)
        : KLIMOP_GENESIS_KETEN_SHA256,
    volgendVolgnummer: ruw.attesten.length + 1,
  };
}

/** Читає огляд кворумних атестатів Сходинки 4, перевіряє ланцюжок і підписи та повертає стан 11 перемикачів. */
export function leesKlimopQuorumAttestLogboek(opties?: {
  staatMap?: string;
  limiet?: number;
  dienstId?: KlimopDienstId;
  volledigeGeschiedenisControle?: boolean;
  alleenLezenZonderMutatie?: boolean;
}): KlimopQuorumLogboekOverzicht {
  const map = klimopStaatMap(opties?.staatMap);
  if (opties?.dienstId !== undefined && !KLIMOP_ELF_DIENSTEN.includes(opties.dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }
  const alleenLezen = opties?.alleenLezenZonderMutatie === true;
  if (!alleenLezen && existsSync(join(map, WAL_BESTAND))) {
    herstelOnderbrokenOverdrachtTransactie(map);
  }
  const schakelaarsBestand = leesSchakelaarsBestand(map);
  const schakelaars = KLIMOP_ELF_DIENSTEN.map((d) => schakelaarsBestand.diensten[d]);
  const limiet = Math.min(
    MAX_RECENTE_REGELS,
    Math.max(1, Number.isInteger(opties?.limiet) ? Number(opties?.limiet) : 30),
  );

  const pad = join(map, ATTEST_LOGBOEK_BESTAND);
  if (!opties?.volledigeGeschiedenisControle) {
    const cp = leesGeldigLogboekCheckpoint<KlimopQuorumLogboekOverzicht['ketenIntegriteit']>(pad);
    if (cp) {
      const staart = leesLaatsteJsonlRegelsUitStaart<KlimopQuorumAttestRegel>(
        pad,
        Math.max(131_072, limiet * 8192),
      );
      if (staart) {
        const gefilterd = opties?.dienstId
          ? staart.regels.filter((a) => a.dienstId === opties.dienstId)
          : staart.regels;
        if (gefilterd.length >= limiet || staart.volledigBestandGelezen) {
          return {
            ketenIntegriteit: cp.ketenIntegriteit,
            samenvatting: {
              actieveQuorumGereedDiensten: schakelaars.filter(
                (s) => s.attestModus === 'quorum_gereed_onder_erfenis',
              ).length,
              actieveDubbelSchrijvenDiensten: schakelaars.filter(
                (s) => s.schrijfModus === 'gecontroleerd_dubbel_schrijven',
              ).length,
              actievePassiefLezenDiensten: schakelaars.filter((s) => s.leesModus === 'passief_spiegel_lezen').length,
              totaalDiensten: schakelaars.length,
              totaalAttesten: cp.totaalAantal,
              totaalQuorumAttestFouten: schakelaars.reduce((n, s) => n + s.totaalQuorumAttestFouten, 0),
            },
            schakelaars,
            recenteAttesten: [...gefilterd].slice(-limiet).reverse(),
            productieDatabankGewijzigd: false,
          };
        }
      }
    }
  }

  const grootteVoorLezen = existsSync(pad) ? statSync(pad).size : 0;
  const ruw = leesAlleQuorumAttestenRuw(map);
  const keten =
    ruw.parseerFoutBijRegel !== null
      ? {
          ok: false,
          gecontroleerdeAttesten: Math.max(0, ruw.parseerFoutBijRegel - 1),
          laatsteSha256: KLIMOP_GENESIS_KETEN_SHA256,
          gebrokenBijVolgnummer: ruw.parseerFoutBijRegel,
          fout: 'ATTEST_LOGBOEK_JSON_BESCHADIGD',
        }
      : verifieerQuorumAttestKeten(ruw.attesten);
  if (!alleenLezen && keten.ok && existsSync(pad)) {
    metOverdrachtSlot(map, () => {
      if (!existsSync(join(map, WAL_BESTAND)) && existsSync(pad) && statSync(pad).size === grootteVoorLezen) {
        schrijfLogboekCheckpoint(pad, ruw.attesten.length, keten);
      }
    });
  }

  const gefilterd = opties?.dienstId
    ? ruw.attesten.filter((a) => a.dienstId === opties.dienstId)
    : ruw.attesten;
  const recenteAttesten = [...gefilterd].slice(-limiet).reverse();

  return {
    ketenIntegriteit: keten,
    samenvatting: {
      actieveQuorumGereedDiensten: schakelaars.filter(
        (s) => s.attestModus === 'quorum_gereed_onder_erfenis',
      ).length,
      actieveDubbelSchrijvenDiensten: schakelaars.filter(
        (s) => s.schrijfModus === 'gecontroleerd_dubbel_schrijven',
      ).length,
      actievePassiefLezenDiensten: schakelaars.filter((s) => s.leesModus === 'passief_spiegel_lezen').length,
      totaalDiensten: schakelaars.length,
      totaalAttesten: ruw.attesten.length,
      totaalQuorumAttestFouten: schakelaars.reduce((n, s) => n + s.totaalQuorumAttestFouten, 0),
    },
    schakelaars,
    recenteAttesten,
    productieDatabankGewijzigd: false,
  };
}

/**
 * Сходинка 4 (§35, §10, §13 маніфесту): формує та криптографічно перевіряє кворумний атестат готовності служби
 * на між'юрисдикційному кворумі 3 незалежних вузлів (`NL`, `CH`, `UA`) через бездилерський `DKG` (2-з-3),
 * пороговий підпис Шнорра `FROST(Ed25519, SHA-512) RFC 9591` і гібридний постквантовий підпис `Ed25519 + ML-DSA-65`,
 * прив'язаний до голів журналів Сходинок 2–3, без самовільного вимкнення живої бази `PostgreSQL 18.6`.
 */
export function voerStap4QuorumAttestProefUit(
  raw: unknown,
  opties?: { staatMap?: string; zaadMerkleWortelSha256?: string | null },
): KlimopQuorumAttestUitkomst {
  const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dienstId = String(b.dienstId ?? 'postvak') as KlimopDienstId;
  if (!KLIMOP_ELF_DIENSTEN.includes(dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }

  const gesimuleerdeFout = String(b.simuleerFout ?? 'geen') as KlimopGesimuleerdeQuorumAttestFout;
  if (!KLIMOP_GESIMULEERDE_ATTEST_FOUTEN.includes(gesimuleerdeFout)) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }

  let zaadMerkleWortelSha256: string | null = opties?.zaadMerkleWortelSha256 ?? null;
  if (typeof b.zaadMerkleWortelSha256 === 'string' && b.zaadMerkleWortelSha256.length > 0) {
    if (!/^[0-9a-f]{64}$/i.test(b.zaadMerkleWortelSha256)) {
      throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
    }
    zaadMerkleWortelSha256 = b.zaadMerkleWortelSha256.toLowerCase();
  }

  const map = klimopStaatMap(opties?.staatMap);
  mkdirSync(map, { recursive: true });
  return metOverdrachtSlot(map, () => {
    herstelOnderbrokenOverdrachtTransactieBinnenSlot(map);
    const nuIso = new Date().toISOString();
    const profiel = STANDAARD_DIENST_ISOLATIE_PROFIELEN[dienstId];

    const wortelGeheim32 = randomBytes(32);
    const zout32 = randomBytes(32);

    try {
      const persoon = maakPersoonsIdentiteit(nuIso);
      const dienstCtx = leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: wortelGeheim32,
        persoonsZout32: zout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId,
        epoche: 4,
      });

      try {
        const spiegelStaat = leesKlimopSpiegelLogboek({ staatMap: map, limiet: 1 });
        const dubbelStaat = leesKlimopDubbelSchrijvenLogboek({ staatMap: map, limiet: 1 });
        const attestKopStaat = leesAttestKopVoorToevoegen(map);
        const schakelaarsBestand = leesSchakelaarsBestand(map);
        const huidigeStaat = schakelaarsBestand.diensten[dienstId];
        const leesModusVoor = huidigeStaat.leesModus;
        const schrijfModusVoor = huidigeStaat.schrijfModus;
        const attestModusVoor = huidigeStaat.attestModus;
        const dienstBewijsVersie = huidigeStaat.bewijsVersie ?? 0;

        const spiegelKetenKopSha256 = spiegelStaat.ketenIntegriteit.laatsteSha256;
        const dubbelKetenKopSha256 =
          gesimuleerdeFout === 'keten_kop_afwijking'
            ? 'f'.repeat(64)
            : dubbelStaat.ketenIntegriteit.laatsteSha256;

        const ketensSluitend =
          spiegelStaat.ketenIntegriteit.ok
          && dubbelStaat.ketenIntegriteit.ok
          && attestKopStaat.ketenOk
          && gesimuleerdeFout !== 'keten_kop_afwijking';

        const knoopNL = maakHybridePostkwantumKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'NL',
          aanbieder:
            gesimuleerdeFout === 'onafhankelijkheid_geschonden'
              ? 'gedeelde-aanbieder-sybil'
              : 'quorum-attest-nl',
          nuIso,
        });
        const knoopCH = maakHybridePostkwantumKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'CH',
          aanbieder:
            gesimuleerdeFout === 'onafhankelijkheid_geschonden'
              ? 'gedeelde-aanbieder-sybil'
              : 'quorum-attest-ch',
          nuIso,
        });
        const knoopUA = maakHybridePostkwantumKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'synchronisatie', 'verificatie'],
          juridischeRegio: 'UA',
          aanbieder: 'quorum-attest-ua',
          nuIso,
        });

        const onafhankelijkheid = controleerKnooppuntOnafhankelijkheid(
          [knoopNL.identiteit, knoopCH.identiteit, knoopUA.identiteit],
          2,
        );

        const vorigeAttestSha256 = attestKopStaat.vorigeSha256;
        const volgnummer = attestKopStaat.volgendVolgnummer;
        const stempel = nuIso.replace(/[-:TZ.]/g, '').slice(0, 14);
        const attestId = `att_${stempel}_${randomBytes(4).toString('hex')}`;
        const frostDrempel = { k: 2, n: 3 };
        const frostOndertekenaars = [1, 2] as const;
        const knooppuntRegios = ['NL', 'CH', 'UA'] as const;
        const quorumKnooppuntIds = [
          knoopNL.identiteit.knooppuntId,
          knoopCH.identiteit.knooppuntId,
          knoopUA.identiteit.knooppuntId,
        ] as const;
        const gereedheidVoorwaardeOk = onafhankelijkheid.ok && ketensSluitend;

        const boodschappen = maakQuorumAttestTekenBoodschappen({
          attestId,
          volgnummer,
          tijdstipIso: nuIso,
          dienstId,
          geisoleerdeDienstPsid: dienstCtx.dienstPsid,
          knooppuntRegios,
          frostDrempel,
          frostOndertekenaars,
          spiegelKetenKopSha256,
          dubbelKetenKopSha256,
          zaadMerkleWortelSha256,
          vorigeAttestSha256,
          dienstBewijsVersie,
          quorumKnooppuntIds,
          gereedheidVoorwaardeOk,
        });

        // Бездилерський DKG (2-з-3) між вузлами NL (1), CH (2), UA (3): повний секрет ніде не збирається
        const setId = `dkg_${attestId}`;
        const dkgBijdragen = [1, 2, 3].map((afzenderIndex) =>
          maakDkgDeelnemerBijdrage({ setId, afzenderIndex, drempel: 2, totaal: 3 }),
        );
        const dkg1 = combineerDkgBijdragenVoorDeelnemer(1, dkgBijdragen);
        const dkg2 = combineerDkgBijdragenVoorDeelnemer(2, dkgBijdragen);
        if (!dkg1.ok || !dkg2.ok) {
          throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 500, 'DKG_SAMENVOEGING_MISLUKT');
        }

        // Двораундовий пороговий підпис Шнорра FROST(Ed25519, SHA-512) за RFC 9591 (учасники 1 та 2)
        const r1Deel1 = frostRonde1MaakToezegging(dkg1.deel);
        const r1Deel2 = frostRonde1MaakToezegging(dkg2.deel);
        const toezeggingenLijst = [r1Deel1.publiek, r1Deel2.publiek];

        const r2Deel1 = frostRonde2TekenDeel({
          deel: dkg1.deel,
          geheimeNonceStaat: r1Deel1.geheimeNonceStaat,
          boodschap: boodschappen.frostBoodschap,
          toezeggingenLijst,
          groepsPubliekeSleutelHex: dkg1.groepsPubliekeSleutelHex,
        });
        const r2Deel2 = frostRonde2TekenDeel({
          deel: dkg2.deel,
          geheimeNonceStaat: r1Deel2.geheimeNonceStaat,
          boodschap: boodschappen.frostBoodschap,
          toezeggingenLijst,
          groepsPubliekeSleutelHex: dkg1.groepsPubliekeSleutelHex,
        });
        if (!r2Deel1.ok || !r2Deel2.ok) {
          throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 500, 'FROST_RONDE2_MISLUKT');
        }

        const deelHandtekening2 =
          gesimuleerdeFout === 'frost_deel_vervalst'
            ? { deelnemerIndex: 2, zDeelHex: `01${'00'.repeat(31)}` }
            : r2Deel2.deelHandtekening;

        const frostSamengevoegd = frostVoegHandtekeningSamen({
          boodschap: boodschappen.frostBoodschap,
          toezeggingenLijst,
          deelHandtekeningen: [r2Deel1.deelHandtekening, deelHandtekening2],
          deelnemerPubliekeSleutelsHex: dkg1.deelnemerPubliekeSleutelsHex,
          groepsPubliekeSleutelHex: dkg1.groepsPubliekeSleutelHex,
          drempel: 2,
        });

        const frostGroepsHandtekeningHex = frostSamengevoegd.ok
          ? frostSamengevoegd.handtekeningHex
          : '00'.repeat(64);
        const verdachteDeelnemers =
          !frostSamengevoegd.ok && frostSamengevoegd.verdachteDeelnemers
            ? frostSamengevoegd.verdachteDeelnemers
            : [];
        const frostVerificatieOk =
          frostSamengevoegd.ok
          && verifieerStandaardEd25519Handtekening(
            boodschappen.frostBoodschap,
            frostGroepsHandtekeningHex,
            dkg1.groepsPubliekeSleutelHex,
          );

        // Гібридний постквантовий підпис Ed25519 + ML-DSA-65 (FIPS 204)
        const ruweHybride = ondertekenHybrideEd25519MlDsa65(boodschappen.hybrideBoodschap, knoopNL);
        const hybrideHandtekening =
          gesimuleerdeFout === 'hybride_pq_vervalst'
            ? {
                ...ruweHybride,
                mlDsa65HandtekeningB64u:
                  ruweHybride.mlDsa65HandtekeningB64u.slice(0, -4)
                  + (ruweHybride.mlDsa65HandtekeningB64u.endsWith('AAAA') ? 'BBBB' : 'AAAA'),
              }
            : ruweHybride;
        const hybrideToets = verifieerHybrideEd25519MlDsa65(
          boodschappen.hybrideBoodschap,
          hybrideHandtekening,
          {
            ed25519PubliekDerB64u: knoopNL.ed25519PubliekDerB64u,
            mlDsa65PubliekSpkiB64u: knoopNL.mlDsa65PubliekSpkiB64u,
          },
        );
        const hybrideVerificatieOk = hybrideToets.ok;

        const cryptoEnKetensOk =
          onafhankelijkheid.ok && frostVerificatieOk && hybrideVerificatieOk && ketensSluitend;

        const ankerRecord: DienstStaatSamenvattingRecord = {
          sleutelId: `attest_anker_${dienstId}`,
          inhoudSha256: spiegelKetenKopSha256,
          machtigingenSha256: dubbelKetenKopSha256,
        };
        const pariteitVerslag = vergelijkErfenisEnKlimopStaat(
          [ankerRecord],
          cryptoEnKetensOk
            ? [ankerRecord]
            : [
                {
                  sleutelId: ankerRecord.sleutelId,
                  inhoudSha256: createHash('sha256').update('attest-afgewezen', 'utf8').digest('hex'),
                  machtigingenSha256: ankerRecord.machtigingenSha256,
                },
              ],
        );

        const overdrachtBesluit = beslisOverDienstOverdrachtStap({
          dienstId,
          huidigeModus: 'klimop_primair_met_erfenis_terugval',
          gewensteModus: 'volledig_onafhankelijk_geverifieerd',
          pariteit: pariteitVerslag,
          uitdrukkelijkeGoedkeuringEigenaarVoorVolledigOnafhankelijk: cryptoEnKetensOk,
        });

        const allesOk = cryptoEnKetensOk && overdrachtBesluit.toegestaan;

        let leesModusNa: KlimopPassieveLeesModus = leesModusVoor;
        let schrijfModusNa: KlimopDubbelSchrijfModus = schrijfModusVoor;
        let attestModusNa: KlimopQuorumAttestModus = attestModusVoor;
        let automatischTeruggezet = false;

        if (
          !allesOk
          && (
            attestModusVoor === 'quorum_gereed_onder_erfenis'
            || schrijfModusVoor === 'gecontroleerd_dubbel_schrijven'
            || leesModusVoor === 'passief_spiegel_lezen'
          )
        ) {
          leesModusNa = 'alleen_erfenis_postgres';
          schrijfModusNa = 'alleen_erfenis_postgres';
          attestModusNa = 'alleen_erfenis_postgres';
          automatischTeruggezet = true;
        }

        const reden = automatischTeruggezet
          ? 'AUTOMATISCH_TERUGGEZET_NA_QUORUM_ATTEST_FOUT'
          : allesOk
            ? 'QUORUM_ATTEST_STAP4_FROST_EN_HYBRIDE_GELDIG'
            : 'QUORUM_ATTEST_AFGEWEZEN_WEGENS_CRYPTO_OF_KETEN';

        const zonderEigenHash: Omit<KlimopQuorumAttestRegel, 'attestSha256'> = {
          attestId,
          volgnummer,
          tijdstipIso: nuIso,
          dienstId,
          geisoleerdeDienstPsid: dienstCtx.dienstPsid,
          knooppuntRegios,
          knooppuntenOnafhankelijk: onafhankelijkheid.ok,
          frostDrempel,
          frostOndertekenaars,
          spiegelKetenKopSha256,
          dubbelKetenKopSha256,
          zaadMerkleWortelSha256,
          gesimuleerdeFout,
          frostGroepsPubliekeSleutelHex: dkg1.groepsPubliekeSleutelHex,
          frostGroepsHandtekeningHex,
          hybrideHandtekening,
          frostVerificatieOk,
          hybrideVerificatieOk,
          ketensSluitend,
          besluitVolledigOnafhankelijkToegestaan: allesOk,
          uitvoeringsAard: 'lokale_simulatie_een_proces',
          dienstBewijsVersie,
          quorumKnooppuntIds,
          gereedheidVoorwaardeOk,
          attestModusVoor,
          attestModusNa,
          automatischTeruggezet,
          reden,
          bevatGeheimenOfInhoud: false,
          vorigeAttestSha256,
        };

        const attestRegel: KlimopQuorumAttestRegel = {
          ...zonderEigenHash,
          attestSha256: berekenQuorumAttestSha256(zonderEigenHash),
        };

        const bijgewerkteStaat: KlimopDienstSchakelaarStaat = {
          ...huidigeStaat,
          primaireSchrijfBron: 'erfenis_postgres',
          leesModus: leesModusNa,
          schrijfModus: schrijfModusNa,
          attestModus: attestModusNa,
          laatstePariteitOk: allesOk ? huidigeStaat.laatstePariteitOk : false,
          opeenvolgendeGelijkeControles: allesOk ? huidigeStaat.opeenvolgendeGelijkeControles : 0,
          laatsteDubbelSchrijfOk: allesOk ? huidigeStaat.laatsteDubbelSchrijfOk : false,
          opeenvolgendeDubbelSchrijfControles: allesOk
            ? huidigeStaat.opeenvolgendeDubbelSchrijfControles
            : 0,
          laatsteQuorumAttestOk: allesOk,
          opeenvolgendeGeldigeAttesten: allesOk
            ? huidigeStaat.opeenvolgendeGeldigeAttesten + 1
            : 0,
          totaalQuorumAttesten: huidigeStaat.totaalQuorumAttesten + 1,
          totaalQuorumAttestFouten: huidigeStaat.totaalQuorumAttestFouten + (allesOk ? 0 : 1),
          totaalGevondenAfwijkingen: huidigeStaat.totaalGevondenAfwijkingen + (allesOk ? 0 : 1),
          automatischeTerugschakelingen:
            huidigeStaat.automatischeTerugschakelingen + (automatischTeruggezet ? 1 : 0),
          laatsteQuorumAttestOp: nuIso,
          laatsteSchakelingOp: automatischTeruggezet ? nuIso : huidigeStaat.laatsteSchakelingOp,
          laatsteReden: reden,
          bewijsVersie: allesOk ? dienstBewijsVersie : dienstBewijsVersie + 1,
          laatsteGeldigeAttestSha256: allesOk ? attestRegel.attestSha256 : null,
        };

        schakelaarsBestand.diensten[dienstId] = bijgewerkteStaat;
        schakelaarsBestand.bijgewerktOp = nuIso;

        // KLIMOP-021 ([458]): коли атестат чинний (allesOk === true), НЕ дописуємо службовий рядок у spiegel-logboek.jsonl,
        // щоб підписана в атестаті голова spiegelKetenKopSha256 залишалася рівною фактичній голові журналу розбіжностей!
        const spiegelRegelVoorFout = !allesOk
          ? bereidSpiegelLogboekRegelVoor(map, {
              tijdstipIso: nuIso,
              soort: automatischTeruggezet ? 'automatische_terugschakeling' : 'quorum_attest_proef',
              dienstId,
              leesModusVoor,
              leesModusNa,
              aantalGecontroleerd: 3,
              afwijkingenAantal: 1,
              afwijkingSleutelHashes: {
                ontbrekend: [],
                inhoud: [hashSleutelIdVoorLogboek(ankerRecord.sleutelId)],
                machtigingen: [],
              },
              reedSolomonHersteld: true,
              crdtSamenvoegingOk: true,
              automatischTeruggezet,
              reden,
            })
          : undefined;

        voerOverdrachtTransactieUit(map, {
          schakelaars: schakelaarsBestand,
          attestRegel,
          spiegelRegel: spiegelRegelVoorFout,
        });

        const logboekRegel: KlimopSpiegelLogboekRegel | null =
          spiegelRegelVoorFout ?? spiegelStaat.recenteRegels[0] ?? null;

        return {
          ok: allesOk,
          dienstId,
          subdomein: profiel.subdomeinBestaand,
          geisoleerdeDienstPsid: dienstCtx.dienstPsid,
          uitvoeringsAard: 'lokale_simulatie_een_proces',
          knooppunten: {
            regios: knooppuntRegios,
            onafhankelijkQuorumOk: onafhankelijkheid.ok,
          },
          drempelZegel: {
            drempel: frostDrempel,
            ondertekenaars: frostOndertekenaars,
            frostGroepsPubliekeSleutelHex: dkg1.groepsPubliekeSleutelHex,
            frostGroepsHandtekeningHex,
            frostVerificatieOk,
            verdachteDeelnemers,
            hybrideAlgoritme: 'ed25519+ml-dsa-65',
            hybrideVerificatieOk,
          },
          ketenVerankering: {
            spiegelKetenKopSha256,
            dubbelKetenKopSha256,
            ketensSluitend,
          },
          gesimuleerdeFout,
          overdrachtBesluit: {
            toegestaan: allesOk,
            huidigeProductieModus: 'alleen_erfenis_postgres',
            gevalideerdeDoelModus: allesOk
              ? overdrachtBesluit.nieuweActieveModus
              : 'alleen_erfenis_postgres',
            reden,
            bewijsOmvang: 'lokale_simulatie',
            waarschuwing: [
              'Місцеве моделювання кворуму в одному процесі: не замінює атестації фізично окремих вузлів за зовнішнім реєстром ключів і окремого посвідченого рішення власника.',
              'Lokale nabootsing van het quorum in één proces: vervangt geen attestatie van fysiek gescheiden knooppunten uit een extern sleutelregister en geen afzonderlijk bevestigd eigenaarsbesluit.',
            ],
          },
          schakelaar: bijgewerkteStaat,
          automatischTeruggezetNaarErfenis: automatischTeruggezet,
          attestRegel,
          logboekRegel,
          productieDatabankActief: true,
          productieDatabankGewijzigd: false,
        };
      } finally {
        dienstCtx.dienstSleutel32.fill(0);
      }
    } finally {
      wortelGeheim32.fill(0);
      zout32.fill(0);
    }
  });
}

function telActieveModi(schakelaarsBestand: SchakelaarOpslagBestand): {
  actievePassief: number;
  actieveDubbel: number;
  actieveQuorum: number;
} {
  let actievePassief = 0;
  let actieveDubbel = 0;
  let actieveQuorum = 0;
  for (const d of KLIMOP_ELF_DIENSTEN) {
    const s = schakelaarsBestand.diensten[d];
    if (s.leesModus === 'passief_spiegel_lezen') actievePassief++;
    if (s.schrijfModus === 'gecontroleerd_dubbel_schrijven') actieveDubbel++;
    if (s.attestModus === 'quorum_gereed_onder_erfenis') actieveQuorum++;
  }
  return { actievePassief, actieveDubbel, actieveQuorum };
}

/**
 * Захищений перемикач власника (§35 маніфесту):
 *   - `activeer_passief_lezen`: вмикає Сходинку 2 пасивного читання за цілісного журналу і чистої звірки;
 *   - `activeer_dubbel_schrijven`: вмикає Сходинку 3 контрольованого подвійного записування зі звіркою читання,
 *     виключно якщо журнали цілісні, служба ВЖЕ перебуває на Сходинці 2 і остання проба Сходинки 3 чиста;
 *   - `bevestig_quorum_gereedheid`: підтверджує Сходинку 4 кворумної готовності виключно за цілісності й справжності підписів
 *     усіх трьох журналів, активної Сходинки 2, активної Сходинки 3 та чинного кворумного атестата — без вимкнення БД;
 *   - `terug_naar_erfenis`: миттєво повертає обрану службу з будь-якої сходинки на чинну основу (навіть за пошкоджених журналів!);
 *   - `nood_terug_alle_elf`: одним рухом миттєво повертає всі 11 служб на чинну основу з 0 втрат;
 *   - будь-яка спроба самовільного відокремлення чи вимкнення живої бази (`ontkoppel_erfenis_postgres`, `schakel_postgres_uit`)
 *     негайно блокується кодом `KLIMOP_LOSKOPPELING_VERBODEN` (403).
 */
export function schakelKlimopDienstOverdracht(
  raw: unknown,
  opties?: { staatMap?: string },
): KlimopOverdrachtSchakelaarUitkomst {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }
  const b = raw as Record<string, unknown>;
  const ruweActie = String(b.actie ?? '');

  if (
    ruweActie === 'ontkoppel_erfenis_postgres'
    || ruweActie === 'volledig_onafhankelijk'
    || ruweActie === 'schakel_postgres_uit'
    || b.ontkoppelErfenisDatabank === true
  ) {
    throw new KlimopFout('KLIMOP_LOSKOPPELING_VERBODEN', 403);
  }

  const actie = ruweActie as KlimopSchakelaarActie;
  if (
    actie !== 'activeer_passief_lezen'
    && actie !== 'activeer_dubbel_schrijven'
    && actie !== 'bevestig_quorum_gereedheid'
    && actie !== 'terug_naar_erfenis'
    && actie !== 'nood_terug_alle_elf'
  ) {
    throw new KlimopFout('KLIMOP_SCHAKELAAR_ACTIE_ONGELDIG', 400);
  }

  const map = klimopStaatMap(opties?.staatMap);
  return metOverdrachtSlot(map, () => {
    herstelOnderbrokenOverdrachtTransactieBinnenSlot(map);
    const nuIso = new Date().toISOString();
    const schakelaarsBestand = leesSchakelaarsBestand(map);

    if (actie === 'nood_terug_alle_elf') {
      let omgeschakeld = 0;
      for (const d of KLIMOP_ELF_DIENSTEN) {
        const cur = schakelaarsBestand.diensten[d];
        const wasActief =
          cur.leesModus === 'passief_spiegel_lezen'
          || cur.schrijfModus === 'gecontroleerd_dubbel_schrijven'
          || cur.attestModus === 'quorum_gereed_onder_erfenis';
        if (wasActief) omgeschakeld++;
        schakelaarsBestand.diensten[d] = {
          ...cur,
          primaireSchrijfBron: 'erfenis_postgres',
          leesModus: 'alleen_erfenis_postgres',
          schrijfModus: 'alleen_erfenis_postgres',
          attestModus: 'alleen_erfenis_postgres',
          handmatigeTerugschakelingen: cur.handmatigeTerugschakelingen + (wasActief ? 1 : 0),
          laatsteSchakelingOp: nuIso,
          laatsteReden: 'NOOD_TERUGSCHAKELING_ALLE_ELF_DOOR_EIGENAAR',
          bewijsVersie: (cur.bewijsVersie ?? 0) + 1,
          laatsteGeldigeAttestSha256: null,
        };
      }
      schakelaarsBestand.bijgewerktOp = nuIso;

      const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
        tijdstipIso: nuIso,
        soort: 'nood_terug_alle_elf',
        dienstId: 'alle_elf',
        leesModusVoor: omgeschakeld > 0 ? 'passief_spiegel_lezen' : 'alleen_erfenis_postgres',
        leesModusNa: 'alleen_erfenis_postgres',
        aantalGecontroleerd: KLIMOP_ELF_DIENSTEN.length,
        afwijkingenAantal: 0,
        afwijkingSleutelHashes: { ontbrekend: [], inhoud: [], machtigingen: [] },
        reedSolomonHersteld: true,
        crdtSamenvoegingOk: true,
        automatischTeruggezet: false,
        reden: 'NOOD_TERUGSCHAKELING_ALLE_ELF_DOOR_EIGENAAR',
      });
      voerOverdrachtTransactieUit(map, { schakelaars: schakelaarsBestand, spiegelRegel: logboekRegel });

      return {
        ok: true,
        actie,
        dienstId: 'alle_elf',
        omgeschakeldeDienstenAantal: omgeschakeld,
        schakelaar: null,
        actievePassiefLezenDiensten: 0,
        actieveDubbelSchrijvenDiensten: 0,
        actieveQuorumGereedDiensten: 0,
        logboekRegel,
        productieDatabankGewijzigd: false,
      };
    }

    const dienstId = String(b.dienstId ?? '') as KlimopDienstId;
    if (!KLIMOP_ELF_DIENSTEN.includes(dienstId)) {
      throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
    }

    const huidige = schakelaarsBestand.diensten[dienstId];
    const leesModusVoor = huidige.leesModus;
    const schrijfModusVoor = huidige.schrijfModus;
    const attestModusVoor = huidige.attestModus;

    if (actie === 'activeer_passief_lezen') {
      const ruw = leesAlleLogboekRegelsRuw(map);
      const keten = verifieerSpiegelLogboekKeten(ruw.regels);
      if (ruw.parseerFoutBijRegel !== null || !keten.ok) {
        throw new KlimopFout('KLIMOP_LOGBOEK_KETEN_ONGELDIG', 409);
      }
      const dienstProeven = ruw.regels.filter(
        (r) => r.dienstId === dienstId && (r.soort === 'passieve_spiegel_proef' || r.soort === 'automatische_terugschakeling'),
      );
      const laatsteProef = dienstProeven[dienstProeven.length - 1];
      if (
        huidige.laatstePariteitOk !== true
        || huidige.opeenvolgendeGelijkeControles < 1
        || !laatsteProef
        || laatsteProef.soort !== 'passieve_spiegel_proef'
        || laatsteProef.afwijkingenAantal > 0
      ) {
        throw new KlimopFout('KLIMOP_SPIEGEL_EERST_VEREIST', 409);
      }

      const bijgewerkt: KlimopDienstSchakelaarStaat = {
        ...huidige,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: 'passief_spiegel_lezen',
        laatsteSchakelingOp: nuIso,
        laatsteReden: 'PASSIEF_SPIEGELLEZEN_INGESCHAKELD_DOOR_EIGENAAR',
      };
      schakelaarsBestand.diensten[dienstId] = bijgewerkt;
      schakelaarsBestand.bijgewerktOp = nuIso;

      const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
        tijdstipIso: nuIso,
        soort: 'handmatige_schakeling',
        dienstId,
        leesModusVoor,
        leesModusNa: 'passief_spiegel_lezen',
        aantalGecontroleerd: huidige.opeenvolgendeGelijkeControles,
        afwijkingenAantal: 0,
        afwijkingSleutelHashes: { ontbrekend: [], inhoud: [], machtigingen: [] },
        reedSolomonHersteld: true,
        crdtSamenvoegingOk: true,
        automatischTeruggezet: false,
        reden: bijgewerkt.laatsteReden,
      });
      voerOverdrachtTransactieUit(map, { schakelaars: schakelaarsBestand, spiegelRegel: logboekRegel });

      const { actievePassief, actieveDubbel, actieveQuorum } = telActieveModi(schakelaarsBestand);

      return {
        ok: true,
        actie,
        dienstId,
        omgeschakeldeDienstenAantal: leesModusVoor === 'passief_spiegel_lezen' ? 0 : 1,
        schakelaar: bijgewerkt,
        actievePassiefLezenDiensten: actievePassief,
        actieveDubbelSchrijvenDiensten: actieveDubbel,
        actieveQuorumGereedDiensten: actieveQuorum,
        logboekRegel,
        productieDatabankGewijzigd: false,
      };
    }

    if (actie === 'activeer_dubbel_schrijven') {
      const ruwSpiegel = leesAlleLogboekRegelsRuw(map);
      const spiegelKeten = verifieerSpiegelLogboekKeten(ruwSpiegel.regels);
      if (ruwSpiegel.parseerFoutBijRegel !== null || !spiegelKeten.ok) {
        throw new KlimopFout('KLIMOP_LOGBOEK_KETEN_ONGELDIG', 409);
      }
      const ruwDubbel = leesAlleDubbelKwitantiesRuw(map);
      const dubbelKeten = verifieerDubbelKwitantieKeten(ruwDubbel.kwitanties);
      if (ruwDubbel.parseerFoutBijRegel !== null || !dubbelKeten.ok) {
        throw new KlimopFout('KLIMOP_DUBBEL_LOGBOEK_KETEN_ONGELDIG', 409);
      }
      if (huidige.leesModus !== 'passief_spiegel_lezen') {
        throw new KlimopFout('KLIMOP_STAP2_ACTIEF_VEREIST', 409);
      }
      const dienstKwitanties = ruwDubbel.kwitanties.filter((k) => k.dienstId === dienstId);
      const laatsteKwitantie = dienstKwitanties[dienstKwitanties.length - 1];
      if (
        huidige.laatsteDubbelSchrijfOk !== true
        || huidige.opeenvolgendeDubbelSchrijfControles < 1
        || !laatsteKwitantie
        || laatsteKwitantie.afwijkingenAantal > 0
        || !laatsteKwitantie.tweedeSchrijfGeslaagd
        || !laatsteKwitantie.leesNaSchrijfGelijk
      ) {
        throw new KlimopFout('KLIMOP_DUBBEL_SCHRIJVEN_PROEF_VEREIST', 409);
      }

      const bijgewerkt: KlimopDienstSchakelaarStaat = {
        ...huidige,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: 'passief_spiegel_lezen',
        schrijfModus: 'gecontroleerd_dubbel_schrijven',
        laatsteSchakelingOp: nuIso,
        laatsteReden: 'GECONTROLEERD_DUBBEL_SCHRIJVEN_INGESCHAKELD_DOOR_EIGENAAR',
      };
      schakelaarsBestand.diensten[dienstId] = bijgewerkt;
      schakelaarsBestand.bijgewerktOp = nuIso;

      const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
        tijdstipIso: nuIso,
        soort: 'handmatige_schakeling',
        dienstId,
        leesModusVoor,
        leesModusNa: 'passief_spiegel_lezen',
        aantalGecontroleerd: huidige.opeenvolgendeDubbelSchrijfControles,
        afwijkingenAantal: 0,
        afwijkingSleutelHashes: { ontbrekend: [], inhoud: [], machtigingen: [] },
        reedSolomonHersteld: true,
        crdtSamenvoegingOk: true,
        automatischTeruggezet: false,
        reden: bijgewerkt.laatsteReden,
      });
      voerOverdrachtTransactieUit(map, { schakelaars: schakelaarsBestand, spiegelRegel: logboekRegel });

      const { actievePassief, actieveDubbel, actieveQuorum } = telActieveModi(schakelaarsBestand);

      return {
        ok: true,
        actie,
        dienstId,
        omgeschakeldeDienstenAantal: schrijfModusVoor === 'gecontroleerd_dubbel_schrijven' ? 0 : 1,
        schakelaar: bijgewerkt,
        actievePassiefLezenDiensten: actievePassief,
        actieveDubbelSchrijvenDiensten: actieveDubbel,
        actieveQuorumGereedDiensten: actieveQuorum,
        logboekRegel,
        productieDatabankGewijzigd: false,
      };
    }

    if (actie === 'bevestig_quorum_gereedheid') {
      const ruwSpiegel = leesAlleLogboekRegelsRuw(map);
      const spiegelKeten = verifieerSpiegelLogboekKeten(ruwSpiegel.regels);
      if (ruwSpiegel.parseerFoutBijRegel !== null || !spiegelKeten.ok) {
        throw new KlimopFout('KLIMOP_LOGBOEK_KETEN_ONGELDIG', 409);
      }
      const ruwDubbel = leesAlleDubbelKwitantiesRuw(map);
      const dubbelKeten = verifieerDubbelKwitantieKeten(ruwDubbel.kwitanties);
      if (ruwDubbel.parseerFoutBijRegel !== null || !dubbelKeten.ok) {
        throw new KlimopFout('KLIMOP_DUBBEL_LOGBOEK_KETEN_ONGELDIG', 409);
      }
      const ruwAttesten = leesAlleQuorumAttestenRuw(map);
      const attestKeten = verifieerQuorumAttestKeten(ruwAttesten.attesten);
      if (ruwAttesten.parseerFoutBijRegel !== null || !attestKeten.ok) {
        throw new KlimopFout('KLIMOP_ATTEST_KETEN_ONGELDIG', 409);
      }
      if (huidige.leesModus !== 'passief_spiegel_lezen') {
        throw new KlimopFout('KLIMOP_STAP2_ACTIEF_VEREIST', 409);
      }
      if (huidige.schrijfModus !== 'gecontroleerd_dubbel_schrijven') {
        throw new KlimopFout('KLIMOP_STAP3_ACTIEF_VEREIST', 409);
      }
      if (
        huidige.laatsteQuorumAttestOk !== true
        || huidige.opeenvolgendeGeldigeAttesten < 1
      ) {
        throw new KlimopFout('KLIMOP_QUORUM_ATTEST_VEREIST', 409);
      }

      // KLIMOP-021 ([458]): перевіряємо наявність чинного не простроченого атестата САМЕ ЦІЄЇ служби,
      // мінімальної кількості доказів цієї служби в журналах Сходинок 2–3 та відсутність новіших збоїв або змін версії доказів
      const dienstAttesten = ruwAttesten.attesten.filter((a) => a.dienstId === dienstId);
      const laatsteAttest = dienstAttesten[dienstAttesten.length - 1];
      if (!laatsteAttest || !laatsteAttest.besluitVolledigOnafhankelijkToegestaan) {
        throw new KlimopFout('KLIMOP_QUORUM_ATTEST_VEREIST', 409);
      }
      const heeftSpiegelBewijs = ruwSpiegel.regels.some(
        (r) => r.dienstId === dienstId && r.soort === 'passieve_spiegel_proef' && r.afwijkingenAantal === 0,
      );
      const heeftDubbelBewijs = ruwDubbel.kwitanties.some(
        (k) => k.dienstId === dienstId && k.afwijkingenAantal === 0 && k.tweedeSchrijfGeslaagd && k.leesNaSchrijfGelijk,
      );
      const attestMs = Date.parse(laatsteAttest.tijdstipIso);
      const nuMs = Date.parse(nuIso);
      const maxAttestGeldigheidMs = 24 * 3600 * 1000;
      const nieuwereStoringVanDienst =
        ruwSpiegel.regels.some(
          (r) =>
            (r.dienstId === dienstId || r.dienstId === 'alle_elf')
            && Date.parse(r.tijdstipIso) > attestMs
            && (r.afwijkingenAantal > 0 || r.automatischTeruggezet || r.soort === 'nood_terug_alle_elf'),
        )
        || ruwDubbel.kwitanties.some(
          (k) => k.dienstId === dienstId && Date.parse(k.tijdstipIso) > attestMs && k.afwijkingenAantal > 0,
        );
      const versieKlopt =
        (huidige.laatsteGeldigeAttestSha256 === undefined || huidige.laatsteGeldigeAttestSha256 === laatsteAttest.attestSha256)
        && (laatsteAttest.dienstBewijsVersie === undefined || laatsteAttest.dienstBewijsVersie === (huidige.bewijsVersie ?? 0));

      if (
        !heeftSpiegelBewijs
        || !heeftDubbelBewijs
        || !Number.isFinite(attestMs)
        || nuMs - attestMs > maxAttestGeldigheidMs
        || nieuwereStoringVanDienst
        || !versieKlopt
      ) {
        throw new KlimopFout('KLIMOP_QUORUM_ATTEST_VEROUDERD_OF_ONGELDIG', 409);
      }

      const bijgewerkt: KlimopDienstSchakelaarStaat = {
        ...huidige,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: 'passief_spiegel_lezen',
        schrijfModus: 'gecontroleerd_dubbel_schrijven',
        attestModus: 'quorum_gereed_onder_erfenis',
        laatsteSchakelingOp: nuIso,
        laatsteReden: 'QUORUM_GEREEDHEID_STAP4_BEVESTIGD_DOOR_EIGENAAR_ONDER_ERFENIS',
      };
      schakelaarsBestand.diensten[dienstId] = bijgewerkt;
      schakelaarsBestand.bijgewerktOp = nuIso;

      const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
        tijdstipIso: nuIso,
        soort: 'handmatige_schakeling',
        dienstId,
        leesModusVoor,
        leesModusNa: 'passief_spiegel_lezen',
        aantalGecontroleerd: huidige.opeenvolgendeGeldigeAttesten,
        afwijkingenAantal: 0,
        afwijkingSleutelHashes: { ontbrekend: [], inhoud: [], machtigingen: [] },
        reedSolomonHersteld: true,
        crdtSamenvoegingOk: true,
        automatischTeruggezet: false,
        reden: bijgewerkt.laatsteReden,
      });
      voerOverdrachtTransactieUit(map, { schakelaars: schakelaarsBestand, spiegelRegel: logboekRegel });

      const { actievePassief, actieveDubbel, actieveQuorum } = telActieveModi(schakelaarsBestand);

      return {
        ok: true,
        actie,
        dienstId,
        omgeschakeldeDienstenAantal: attestModusVoor === 'quorum_gereed_onder_erfenis' ? 0 : 1,
        schakelaar: bijgewerkt,
        actievePassiefLezenDiensten: actievePassief,
        actieveDubbelSchrijvenDiensten: actieveDubbel,
        actieveQuorumGereedDiensten: actieveQuorum,
        logboekRegel,
        productieDatabankGewijzigd: false,
      };
    }

    // actie === 'terug_naar_erfenis' — безвідмовне миттєве повернення однієї служби з будь-якої сходинки
    const wasActief =
      leesModusVoor === 'passief_spiegel_lezen'
      || schrijfModusVoor === 'gecontroleerd_dubbel_schrijven'
      || attestModusVoor === 'quorum_gereed_onder_erfenis';
    const terugStaat: KlimopDienstSchakelaarStaat = {
      ...huidige,
      primaireSchrijfBron: 'erfenis_postgres',
      leesModus: 'alleen_erfenis_postgres',
      schrijfModus: 'alleen_erfenis_postgres',
      attestModus: 'alleen_erfenis_postgres',
      handmatigeTerugschakelingen: huidige.handmatigeTerugschakelingen + (wasActief ? 1 : 0),
      laatsteSchakelingOp: nuIso,
      laatsteReden: 'HANDMATIG_TERUGGEZET_NAAR_ERFENIS_DOOR_EIGENAAR',
      bewijsVersie: (huidige.bewijsVersie ?? 0) + 1,
      laatsteGeldigeAttestSha256: null,
    };
    schakelaarsBestand.diensten[dienstId] = terugStaat;
    schakelaarsBestand.bijgewerktOp = nuIso;

    const logboekRegel = bereidSpiegelLogboekRegelVoor(map, {
      tijdstipIso: nuIso,
      soort: 'handmatige_schakeling',
      dienstId,
      leesModusVoor,
      leesModusNa: 'alleen_erfenis_postgres',
      aantalGecontroleerd: 0,
      afwijkingenAantal: 0,
      afwijkingSleutelHashes: { ontbrekend: [], inhoud: [], machtigingen: [] },
      reedSolomonHersteld: true,
      crdtSamenvoegingOk: true,
      automatischTeruggezet: false,
      reden: terugStaat.laatsteReden,
    });
    voerOverdrachtTransactieUit(map, { schakelaars: schakelaarsBestand, spiegelRegel: logboekRegel });

    const { actievePassief, actieveDubbel, actieveQuorum } = telActieveModi(schakelaarsBestand);

    return {
      ok: true,
      actie,
      dienstId,
      omgeschakeldeDienstenAantal: wasActief ? 1 : 0,
      schakelaar: terugStaat,
      actievePassiefLezenDiensten: actievePassief,
      actieveDubbelSchrijvenDiensten: actieveDubbel,
      actieveQuorumGereedDiensten: actieveQuorum,
      logboekRegel,
      productieDatabankGewijzigd: false,
    };
  });
}
