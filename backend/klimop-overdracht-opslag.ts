// KLIMOP-015 / KLIMOP-016 (21.11.2026, Етапи 14–15 впровадження «Плюща» у платформу «Мій простір»):
// Сходинки 2–3 поступового переходу за §35 маніфесту — пасивне дзеркальне читання, контрольоване подвійне записування
// зі звіркою читання після запису, збережувані криптографічно зв'язані журнали (ланцюжки SHA-256 без особистого вмісту)
// та перемикач миттєвого повернення (автоматичний при будь-якій розбіжності й ручний для однієї або всіх 11 служб).

import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  controleerKnooppuntOnafhankelijkheid,
  maakKlimopKnooppunt,
} from '../shared/klimop/kern';
import {
  herstelEnOntsleutelObject,
  versleutelEnVerdeelObject,
} from '../shared/klimop/opslag';
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
  KLIMOP_GESIMULEERDE_AFWIJKINGEN,
  KLIMOP_GESIMULEERDE_DUBBEL_FOUTEN,
  KlimopFout,
  type KlimopDienstSchakelaarStaat,
  type KlimopDubbelLogboekOverzicht,
  type KlimopDubbelSchrijfKwitantieRegel,
  type KlimopDubbelSchrijfModus,
  type KlimopDubbelSchrijvenUitkomst,
  type KlimopGesimuleerdeAfwijking,
  type KlimopGesimuleerdeDubbelSchrijfFout,
  type KlimopOverdrachtSchakelaarUitkomst,
  type KlimopPassieveLeesModus,
  type KlimopPassieveSpiegelUitkomst,
  type KlimopSchakelaarActie,
  type KlimopSpiegelLogboekOverzicht,
  type KlimopSpiegelLogboekRegel,
} from '../shared/klimop-overzicht-model';

export const KLIMOP_GENESIS_KETEN_SHA256 = '0'.repeat(64);

const SCHAKELAARS_BESTAND = 'schakelaars.json';
const LOGBOEK_BESTAND = 'spiegel-logboek.jsonl';
const DUBBEL_LOGBOEK_BESTAND = 'dubbel-schrijven-kluis.jsonl';
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

/** Визначає ізольовану серверну теку стану поза робочим деревом Git (щоб жоден виклик не забруднював кодову базу). */
export function klimopStaatMap(opgegevenMap?: string): string {
  const rauw =
    opgegevenMap?.trim()
    || process.env.KLIMOP_STAAT_MAP?.trim()
    || join(process.env.ORCH_INBOX?.trim() || join(tmpdir(), 'mijn-ruimte-klimop-staat'), 'klimop-overdracht');
  return resolve(rauw);
}

function standaardDienstSchakelaar(dienstId: KlimopDienstId): KlimopDienstSchakelaarStaat {
  return {
    dienstId,
    primaireSchrijfBron: 'erfenis_postgres',
    leesModus: 'alleen_erfenis_postgres',
    schrijfModus: 'alleen_erfenis_postgres',
    laatstePariteitOk: null,
    opeenvolgendeGelijkeControles: 0,
    totaalUitgevoerdeControles: 0,
    totaalGevondenAfwijkingen: 0,
    laatsteDubbelSchrijfOk: null,
    opeenvolgendeDubbelSchrijfControles: 0,
    totaalDubbelSchrijfProeven: 0,
    totaalDubbelSchrijfFouten: 0,
    automatischeTerugschakelingen: 0,
    handmatigeTerugschakelingen: 0,
    laatsteControleOp: null,
    laatsteDubbelSchrijfOp: null,
    laatsteSchakelingOp: null,
    laatsteReden: 'STANDAARD_ONAANGETASTE_BASIS',
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
      // Сходинка 3 ніколи не може бути активною без активної Сходинки 2 (§35 — заборона перестрибування сходинок).
      const schrijfModus: KlimopDubbelSchrijfModus =
        leesModus === 'passief_spiegel_lezen' && bron.schrijfModus === 'gecontroleerd_dubbel_schrijven'
          ? 'gecontroleerd_dubbel_schrijven'
          : 'alleen_erfenis_postgres';
      diensten[d] = {
        dienstId: d,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus,
        schrijfModus,
        laatstePariteitOk: typeof bron.laatstePariteitOk === 'boolean' ? bron.laatstePariteitOk : null,
        opeenvolgendeGelijkeControles: Math.max(0, Number(bron.opeenvolgendeGelijkeControles ?? 0) | 0),
        totaalUitgevoerdeControles: Math.max(0, Number(bron.totaalUitgevoerdeControles ?? 0) | 0),
        totaalGevondenAfwijkingen: Math.max(0, Number(bron.totaalGevondenAfwijkingen ?? 0) | 0),
        laatsteDubbelSchrijfOk: typeof bron.laatsteDubbelSchrijfOk === 'boolean' ? bron.laatsteDubbelSchrijfOk : null,
        opeenvolgendeDubbelSchrijfControles: Math.max(0, Number(bron.opeenvolgendeDubbelSchrijfControles ?? 0) | 0),
        totaalDubbelSchrijfProeven: Math.max(0, Number(bron.totaalDubbelSchrijfProeven ?? 0) | 0),
        totaalDubbelSchrijfFouten: Math.max(0, Number(bron.totaalDubbelSchrijfFouten ?? 0) | 0),
        automatischeTerugschakelingen: Math.max(0, Number(bron.automatischeTerugschakelingen ?? 0) | 0),
        handmatigeTerugschakelingen: Math.max(0, Number(bron.handmatigeTerugschakelingen ?? 0) | 0),
        laatsteControleOp: typeof bron.laatsteControleOp === 'string' ? bron.laatsteControleOp : null,
        laatsteDubbelSchrijfOp: typeof bron.laatsteDubbelSchrijfOp === 'string' ? bron.laatsteDubbelSchrijfOp : null,
        laatsteSchakelingOp: typeof bron.laatsteSchakelingOp === 'string' ? bron.laatsteSchakelingOp : null,
        laatsteReden: typeof bron.laatsteReden === 'string' ? bron.laatsteReden : 'STANDAARD_ONAANGETASTE_BASIS',
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
  const tmpPad = join(map, `${SCHAKELAARS_BESTAND}.tmp-${randomBytes(6).toString('hex')}`);
  writeFileSync(tmpPad, `${JSON.stringify(staat, null, 2)}\n`, 'utf8');
  renameSync(tmpPad, doelPad);
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

function voegLogboekRegelToe(
  map: string,
  basis: Omit<KlimopSpiegelLogboekRegel, 'regelId' | 'volgnummer' | 'vorigeRegelSha256' | 'regelSha256' | 'bevatGeheimenOfInhoud'>,
): KlimopSpiegelLogboekRegel {
  mkdirSync(map, { recursive: true });
  const ruw = leesAlleLogboekRegelsRuw(map);
  const keten = verifieerSpiegelLogboekKeten(ruw.regels);
  const vorigeSha =
    ruw.parseerFoutBijRegel === null && keten.ok
      ? keten.laatsteSha256
      : ruw.regels.length > 0
        ? String(ruw.regels[ruw.regels.length - 1].regelSha256 ?? KLIMOP_GENESIS_KETEN_SHA256)
        : KLIMOP_GENESIS_KETEN_SHA256;

  const volgnummer = ruw.regels.length + 1;
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

  const regel: KlimopSpiegelLogboekRegel = {
    ...zonderEigenHash,
    regelSha256: berekenSpiegelLogboekRegelSha256(zonderEigenHash),
  };

  appendFileSync(join(map, LOGBOEK_BESTAND), `${JSON.stringify(regel)}\n`, 'utf8');
  return regel;
}

/** Читає стан усіх 11 перемикачів служб, останні записи журналу розбіжностей та перевіряє ланцюжок SHA-256. */
export function leesKlimopSpiegelLogboek(opties?: {
  staatMap?: string;
  limiet?: number;
  dienstId?: KlimopDienstId;
}): KlimopSpiegelLogboekOverzicht {
  const map = klimopStaatMap(opties?.staatMap);
  if (opties?.dienstId !== undefined && !KLIMOP_ELF_DIENSTEN.includes(opties.dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }
  const schakelaarsBestand = leesSchakelaarsBestand(map);
  const schakelaars = KLIMOP_ELF_DIENSTEN.map((d) => schakelaarsBestand.diensten[d]);

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

  const limiet = Math.min(
    MAX_RECENTE_REGELS,
    Math.max(1, Number.isInteger(opties?.limiet) ? Number(opties?.limiet) : 30),
  );
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
      let automatischTeruggezet = false;

      if (
        !allesOk
        && (
          leesModusVoor === 'passief_spiegel_lezen'
          || huidigeStaat.schrijfModus === 'gecontroleerd_dubbel_schrijven'
        )
      ) {
        leesModusNa = 'alleen_erfenis_postgres';
        schrijfModusNa = 'alleen_erfenis_postgres';
        automatischTeruggezet = true;
      }

      const bijgewerkteStaat: KlimopDienstSchakelaarStaat = {
        ...huidigeStaat,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: leesModusNa,
        schrijfModus: schrijfModusNa,
        laatstePariteitOk: allesOk,
        opeenvolgendeGelijkeControles: allesOk ? huidigeStaat.opeenvolgendeGelijkeControles + 1 : 0,
        totaalUitgevoerdeControles: huidigeStaat.totaalUitgevoerdeControles + 1,
        totaalGevondenAfwijkingen: huidigeStaat.totaalGevondenAfwijkingen + afwijkingenAantal,
        automatischeTerugschakelingen:
          huidigeStaat.automatischeTerugschakelingen + (automatischTeruggezet ? 1 : 0),
        laatsteControleOp: nuIso,
        laatsteSchakelingOp: automatischTeruggezet ? nuIso : huidigeStaat.laatsteSchakelingOp,
        laatsteReden: automatischTeruggezet
          ? 'AUTOMATISCH_TERUGGEZET_WEGENS_PARITEITSAFWIJKING'
          : overdrachtBesluit.reden,
      };

      schakelaarsBestand.diensten[dienstId] = bijgewerkteStaat;
      schakelaarsBestand.bijgewerktOp = nuIso;
      schrijfSchakelaarsAtomair(map, schakelaarsBestand);

      const logboekRegel = voegLogboekRegelToe(map, {
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

function voegDubbelKwitantieToe(
  map: string,
  basis: Omit<
    KlimopDubbelSchrijfKwitantieRegel,
    'kwitantieId' | 'volgnummer' | 'vorigeKwitantieSha256' | 'kwitantieSha256' | 'bevatGeheimenOfInhoud'
  >,
): KlimopDubbelSchrijfKwitantieRegel {
  mkdirSync(map, { recursive: true });
  const ruw = leesAlleDubbelKwitantiesRuw(map);
  const keten = verifieerDubbelKwitantieKeten(ruw.kwitanties);
  const vorigeSha =
    ruw.parseerFoutBijRegel === null && keten.ok
      ? keten.laatsteSha256
      : ruw.kwitanties.length > 0
        ? String(ruw.kwitanties[ruw.kwitanties.length - 1].kwitantieSha256 ?? KLIMOP_GENESIS_KETEN_SHA256)
        : KLIMOP_GENESIS_KETEN_SHA256;

  const volgnummer = ruw.kwitanties.length + 1;
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

  const kwitantie: KlimopDubbelSchrijfKwitantieRegel = {
    ...zonderEigenHash,
    kwitantieSha256: berekenDubbelKwitantieSha256(zonderEigenHash),
  };

  appendFileSync(join(map, DUBBEL_LOGBOEK_BESTAND), `${JSON.stringify(kwitantie)}\n`, 'utf8');
  return kwitantie;
}

/** Читає огляд квитанцій подвійного записування Сходинки 3, перевіряє ланцюжок SHA-256 та стан перемикачів. */
export function leesKlimopDubbelSchrijvenLogboek(opties?: {
  staatMap?: string;
  limiet?: number;
  dienstId?: KlimopDienstId;
}): KlimopDubbelLogboekOverzicht {
  const map = klimopStaatMap(opties?.staatMap);
  if (opties?.dienstId !== undefined && !KLIMOP_ELF_DIENSTEN.includes(opties.dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }
  const schakelaarsBestand = leesSchakelaarsBestand(map);
  const schakelaars = KLIMOP_ELF_DIENSTEN.map((d) => schakelaarsBestand.diensten[d]);

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

  const limiet = Math.min(
    MAX_RECENTE_REGELS,
    Math.max(1, Number.isInteger(opties?.limiet) ? Number(opties?.limiet) : 30),
  );
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
      let automatischTeruggezet = false;

      if (
        !allesOk
        && (
          schrijfModusVoor === 'gecontroleerd_dubbel_schrijven'
          || leesModusVoor === 'passief_spiegel_lezen'
        )
      ) {
        leesModusNa = 'alleen_erfenis_postgres';
        schrijfModusNa = 'alleen_erfenis_postgres';
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
        laatstePariteitOk: allesOk ? huidigeStaat.laatstePariteitOk : false,
        opeenvolgendeGelijkeControles: allesOk ? huidigeStaat.opeenvolgendeGelijkeControles : 0,
        laatsteDubbelSchrijfOk: allesOk,
        opeenvolgendeDubbelSchrijfControles: allesOk
          ? huidigeStaat.opeenvolgendeDubbelSchrijfControles + 1
          : 0,
        totaalDubbelSchrijfProeven: huidigeStaat.totaalDubbelSchrijfProeven + 1,
        totaalDubbelSchrijfFouten: huidigeStaat.totaalDubbelSchrijfFouten + (allesOk ? 0 : 1),
        totaalGevondenAfwijkingen: huidigeStaat.totaalGevondenAfwijkingen + afwijkingenAantal,
        automatischeTerugschakelingen:
          huidigeStaat.automatischeTerugschakelingen + (automatischTeruggezet ? 1 : 0),
        laatsteDubbelSchrijfOp: nuIso,
        laatsteSchakelingOp: automatischTeruggezet ? nuIso : huidigeStaat.laatsteSchakelingOp,
        laatsteReden: reden,
      };

      schakelaarsBestand.diensten[dienstId] = bijgewerkteStaat;
      schakelaarsBestand.bijgewerktOp = nuIso;
      schrijfSchakelaarsAtomair(map, schakelaarsBestand);

      const afwijkingSleutelHashes = {
        ontbrekend: pariteitVerslag.ontbrekendeInKlimopIds.map(hashSleutelIdVoorLogboek),
        inhoud: [...pariteitVerslag.afwijkendeInhoudIds, ...extraOngewisteIds].map(
          hashSleutelIdVoorLogboek,
        ),
        machtigingen: pariteitVerslag.afwijkendeMachtigingenIds.map(hashSleutelIdVoorLogboek),
      };

      const kwitantieRegel = voegDubbelKwitantieToe(map, {
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

      const logboekRegel = voegLogboekRegelToe(map, {
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
}

function telActieveModi(schakelaarsBestand: SchakelaarOpslagBestand): {
  actievePassief: number;
  actieveDubbel: number;
} {
  let actievePassief = 0;
  let actieveDubbel = 0;
  for (const d of KLIMOP_ELF_DIENSTEN) {
    const s = schakelaarsBestand.diensten[d];
    if (s.leesModus === 'passief_spiegel_lezen') actievePassief++;
    if (s.schrijfModus === 'gecontroleerd_dubbel_schrijven') actieveDubbel++;
  }
  return { actievePassief, actieveDubbel };
}

/**
 * Захищений перемикач власника (§35 маніфесту):
 *   - `activeer_passief_lezen`: вмикає Сходинку 2 пасивного читання за цілісного журналу і чистої звірки;
 *   - `activeer_dubbel_schrijven`: вмикає Сходинку 3 контрольованого подвійного записування зі звіркою читання,
 *     виключно якщо обидва журнали цілісні, служба ВЖЕ перебуває на Сходинці 2 (заборона перестрибування сходинок!)
 *     і остання перевірка подвійного записування пройшла без жодних розбіжностей;
 *   - `terug_naar_erfenis`: миттєво повертає обрану службу зі Сходинки 3 або Сходинки 2 на чинну основу (навіть за пошкоджених журналів!);
 *   - `nood_terug_alle_elf`: одним рухом миттєво повертає всі 11 служб на чинну основу з 0 втрат;
 *   - спроба самовільного відокремлення чинної бази (`ontkoppel_erfenis_postgres`) негайно блокується кодом `KLIMOP_LOSKOPPELING_VERBODEN` (403).
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
    || b.ontkoppelErfenisDatabank === true
  ) {
    throw new KlimopFout('KLIMOP_LOSKOPPELING_VERBODEN', 403);
  }

  const actie = ruweActie as KlimopSchakelaarActie;
  if (
    actie !== 'activeer_passief_lezen'
    && actie !== 'activeer_dubbel_schrijven'
    && actie !== 'terug_naar_erfenis'
    && actie !== 'nood_terug_alle_elf'
  ) {
    throw new KlimopFout('KLIMOP_SCHAKELAAR_ACTIE_ONGELDIG', 400);
  }

  const map = klimopStaatMap(opties?.staatMap);
  const nuIso = new Date().toISOString();
  const schakelaarsBestand = leesSchakelaarsBestand(map);

  if (actie === 'nood_terug_alle_elf') {
    let omgeschakeld = 0;
    for (const d of KLIMOP_ELF_DIENSTEN) {
      const cur = schakelaarsBestand.diensten[d];
      const wasActief =
        cur.leesModus === 'passief_spiegel_lezen'
        || cur.schrijfModus === 'gecontroleerd_dubbel_schrijven';
      if (wasActief) omgeschakeld++;
      schakelaarsBestand.diensten[d] = {
        ...cur,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: 'alleen_erfenis_postgres',
        schrijfModus: 'alleen_erfenis_postgres',
        handmatigeTerugschakelingen: cur.handmatigeTerugschakelingen + (wasActief ? 1 : 0),
        laatsteSchakelingOp: nuIso,
        laatsteReden: 'NOOD_TERUGSCHAKELING_ALLE_ELF_DOOR_EIGENAAR',
      };
    }
    schakelaarsBestand.bijgewerktOp = nuIso;
    schrijfSchakelaarsAtomair(map, schakelaarsBestand);

    const logboekRegel = voegLogboekRegelToe(map, {
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

    return {
      ok: true,
      actie,
      dienstId: 'alle_elf',
      omgeschakeldeDienstenAantal: omgeschakeld,
      schakelaar: null,
      actievePassiefLezenDiensten: 0,
      actieveDubbelSchrijvenDiensten: 0,
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

  if (actie === 'activeer_passief_lezen') {
    const ruw = leesAlleLogboekRegelsRuw(map);
    const keten = verifieerSpiegelLogboekKeten(ruw.regels);
    if (ruw.parseerFoutBijRegel !== null || !keten.ok) {
      throw new KlimopFout('KLIMOP_LOGBOEK_KETEN_ONGELDIG', 409);
    }
    if (huidige.laatstePariteitOk !== true || huidige.opeenvolgendeGelijkeControles < 1) {
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
    schrijfSchakelaarsAtomair(map, schakelaarsBestand);

    const logboekRegel = voegLogboekRegelToe(map, {
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

    const { actievePassief, actieveDubbel } = telActieveModi(schakelaarsBestand);

    return {
      ok: true,
      actie,
      dienstId,
      omgeschakeldeDienstenAantal: leesModusVoor === 'passief_spiegel_lezen' ? 0 : 1,
      schakelaar: bijgewerkt,
      actievePassiefLezenDiensten: actievePassief,
      actieveDubbelSchrijvenDiensten: actieveDubbel,
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
    if (
      huidige.laatsteDubbelSchrijfOk !== true
      || huidige.opeenvolgendeDubbelSchrijfControles < 1
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
    schrijfSchakelaarsAtomair(map, schakelaarsBestand);

    const logboekRegel = voegLogboekRegelToe(map, {
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

    const { actievePassief, actieveDubbel } = telActieveModi(schakelaarsBestand);

    return {
      ok: true,
      actie,
      dienstId,
      omgeschakeldeDienstenAantal: schrijfModusVoor === 'gecontroleerd_dubbel_schrijven' ? 0 : 1,
      schakelaar: bijgewerkt,
      actievePassiefLezenDiensten: actievePassief,
      actieveDubbelSchrijvenDiensten: actieveDubbel,
      logboekRegel,
      productieDatabankGewijzigd: false,
    };
  }

  // actie === 'terug_naar_erfenis' — безвідмовне миттєве повернення однієї служби з будь-якої сходинки
  const wasActief =
    leesModusVoor === 'passief_spiegel_lezen'
    || schrijfModusVoor === 'gecontroleerd_dubbel_schrijven';
  const terugStaat: KlimopDienstSchakelaarStaat = {
    ...huidige,
    primaireSchrijfBron: 'erfenis_postgres',
    leesModus: 'alleen_erfenis_postgres',
    schrijfModus: 'alleen_erfenis_postgres',
    handmatigeTerugschakelingen: huidige.handmatigeTerugschakelingen + (wasActief ? 1 : 0),
    laatsteSchakelingOp: nuIso,
    laatsteReden: 'HANDMATIG_TERUGGEZET_NAAR_ERFENIS_DOOR_EIGENAAR',
  };
  schakelaarsBestand.diensten[dienstId] = terugStaat;
  schakelaarsBestand.bijgewerktOp = nuIso;
  schrijfSchakelaarsAtomair(map, schakelaarsBestand);

  const logboekRegel = voegLogboekRegelToe(map, {
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

  const { actievePassief, actieveDubbel } = telActieveModi(schakelaarsBestand);

  return {
    ok: true,
    actie,
    dienstId,
    omgeschakeldeDienstenAantal: wasActief ? 1 : 0,
    schakelaar: terugStaat,
    actievePassiefLezenDiensten: actievePassief,
    actieveDubbelSchrijvenDiensten: actieveDubbel,
    logboekRegel,
    productieDatabankGewijzigd: false,
  };
}
