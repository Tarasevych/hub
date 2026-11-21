// KLIMOP-015 (21.11.2026, Етап 14 впровадження «Плюща» у платформу «Мій простір»):
// Сходинка 2 поступового переходу за §35 маніфесту — пасивне дзеркальне читання без зміни чинної бази даних,
// збережуваний криптографічно зв'язаний журнал розбіжностей (ланцюжок SHA-256 без особистого вмісту чи таємниць)
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
import { maakKlimopKnooppunt } from '../shared/klimop/kern';
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
  KlimopFout,
  type KlimopDienstSchakelaarStaat,
  type KlimopGesimuleerdeAfwijking,
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
const STANDAARD_STEEKPROEF = 4;
const MIN_STEEKPROEF = 2;
const MAX_STEEKPROEF = 12;
const MAX_RECENTE_REGELS = 200;

interface SchakelaarOpslagBestand {
  schema: 1;
  bijgewerktOp: string;
  diensten: Record<KlimopDienstId, KlimopDienstSchakelaarStaat>;
}

/** Визначає ізольовану серверную теку стану поза робочим деревом Git (щоб жоден виклик не забруднював кодову базу). */
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
    laatstePariteitOk: null,
    opeenvolgendeGelijkeControles: 0,
    totaalUitgevoerdeControles: 0,
    totaalGevondenAfwijkingen: 0,
    automatischeTerugschakelingen: 0,
    handmatigeTerugschakelingen: 0,
    laatsteControleOp: null,
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
      diensten[d] = {
        dienstId: d,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus:
          bron.leesModus === 'passief_spiegel_lezen'
            ? 'passief_spiegel_lezen'
            : 'alleen_erfenis_postgres',
        laatstePariteitOk: typeof bron.laatstePariteitOk === 'boolean' ? bron.laatstePariteitOk : null,
        opeenvolgendeGelijkeControles: Math.max(0, Number(bron.opeenvolgendeGelijkeControles ?? 0) | 0),
        totaalUitgevoerdeControles: Math.max(0, Number(bron.totaalUitgevoerdeControles ?? 0) | 0),
        totaalGevondenAfwijkingen: Math.max(0, Number(bron.totaalGevondenAfwijkingen ?? 0) | 0),
        automatischeTerugschakelingen: Math.max(0, Number(bron.automatischeTerugschakelingen ?? 0) | 0),
        handmatigeTerugschakelingen: Math.max(0, Number(bron.handmatigeTerugschakelingen ?? 0) | 0),
        laatsteControleOp: typeof bron.laatsteControleOp === 'string' ? bron.laatsteControleOp : null,
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
      let automatischTeruggezet = false;

      if (!allesOk && leesModusVoor === 'passief_spiegel_lezen') {
        leesModusNa = 'alleen_erfenis_postgres';
        automatischTeruggezet = true;
      }

      const bijgewerkteStaat: KlimopDienstSchakelaarStaat = {
        ...huidigeStaat,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: leesModusNa,
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

/**
 * Захищений перемикач власника (§35 маніфесту):
 *   - `activeer_passief_lezen`: вмикає пасивне дзеркальне читання Сходинки 2 для однієї служби, виключно якщо
 *     ланцюжок SHA-256 журналу цілісний і остання пасивна звірка цієї служби пройшла з 0 розбіжностей;
 *   - `terug_naar_erfenis`: миттєво повертає обрану службу на чинну основу (навіть за пошкодженого журналу!);
 *   - `nood_terug_alle_elf`: одним рухом миттєво повертає всі 11 служб на чинну основу з 0 втрат.
 */
export function schakelKlimopDienstOverdracht(
  raw: unknown,
  opties?: { staatMap?: string },
): KlimopOverdrachtSchakelaarUitkomst {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }
  const b = raw as Record<string, unknown>;
  const actie = String(b.actie ?? '') as KlimopSchakelaarActie;
  if (
    actie !== 'activeer_passief_lezen'
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
      const wasPassief = cur.leesModus === 'passief_spiegel_lezen';
      if (wasPassief) omgeschakeld++;
      schakelaarsBestand.diensten[d] = {
        ...cur,
        primaireSchrijfBron: 'erfenis_postgres',
        leesModus: 'alleen_erfenis_postgres',
        handmatigeTerugschakelingen: cur.handmatigeTerugschakelingen + (wasPassief ? 1 : 0),
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

    const actieveAantal = KLIMOP_ELF_DIENSTEN.filter(
      (d) => schakelaarsBestand.diensten[d].leesModus === 'passief_spiegel_lezen',
    ).length;

    return {
      ok: true,
      actie,
      dienstId,
      omgeschakeldeDienstenAantal: leesModusVoor === 'passief_spiegel_lezen' ? 0 : 1,
      schakelaar: bijgewerkt,
      actievePassiefLezenDiensten: actieveAantal,
      logboekRegel,
      productieDatabankGewijzigd: false,
    };
  }

  // actie === 'terug_naar_erfenis' — безвідмовне миттєве повернення однієї служби
  const wasPassief = leesModusVoor === 'passief_spiegel_lezen';
  const terugStaat: KlimopDienstSchakelaarStaat = {
    ...huidige,
    primaireSchrijfBron: 'erfenis_postgres',
    leesModus: 'alleen_erfenis_postgres',
    handmatigeTerugschakelingen: huidige.handmatigeTerugschakelingen + (wasPassief ? 1 : 0),
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

  const actieveAantal = KLIMOP_ELF_DIENSTEN.filter(
    (d) => schakelaarsBestand.diensten[d].leesModus === 'passief_spiegel_lezen',
  ).length;

  return {
    ok: true,
    actie,
    dienstId,
    omgeschakeldeDienstenAantal: wasPassief ? 1 : 0,
    schakelaar: terugStaat,
    actievePassiefLezenDiensten: actieveAantal,
    logboekRegel,
    productieDatabankGewijzigd: false,
  };
}
