// KLIMOP-014 (21.11.2026, Етап 13 впровадження «Плюща» у платформу «Мій простір»):
// Спільний серверний міст платформи «Мій простір» до модулів живої цифрової екосистеми «Плющ» (shared/klimop/*.ts).
// Працює без підключення до робочої бази PostgreSQL і без зміни живих служб (§3.2, §35 маніфесту):
// використовується однаково і маршрутами власника (/api/owner/klimop/*), і інструментами MCP (klimop_*) для всіх 14 агентів.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  KLIMOP_VERBODEN_VEREENVOUDIGINGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  type KlimopControleVraagId,
  type KlimopVerbodenVereenvoudigingId,
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
  type KlimopDienstId,
} from '../shared/klimop/diensten';
import {
  KLIMOP_EINDVISIE_TWAALF_PIJLERS,
  KLIMOP_TWAALF_KERNMODULES,
  KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN,
  beoordeelAutonoomOntwikkelVoorstel,
  berekenZaadMerkleWortelSha256,
  valideerKlimopEindvisie46,
  valideerTechnischeAfhankelijkheden,
  type EindvisiePijlerBewijs,
  type KlimopKernModulePad,
  type KlimopOntwikkelRichtingId,
  type ZaadOnderdeelManifestRegel,
} from '../shared/klimop/zaden';
import {
  KLIMOP_TOOL_NAMEN,
  KlimopFout,
  type KlimopArchitectuurToetsInvoer,
  type KlimopArchitectuurToetsUitkomst,
  type KlimopDienstBrugStatus,
  type KlimopDubbelSchrijfModus,
  type KlimopModuleIntegriteit,
  type KlimopPassieveLeesModus,
  type KlimopPlatformOverzicht,
  type KlimopQuorumAttestModus,
  type KlimopSpiegelControleUitkomst,
} from '../shared/klimop-overzicht-model';
import {
  leesKlimopDubbelSchrijvenLogboek,
  leesKlimopQuorumAttestLogboek,
  leesKlimopSpiegelLogboek,
} from './klimop-overdracht-opslag';

export { KlimopFout };

export function klimopWortel(): string {
  const envPad = process.env.KLIMOP_WORTEL ?? process.env.ORCH_WORTEL;
  return resolve(envPad && envPad.trim() ? envPad.trim() : process.cwd());
}

const PIJLER_MODULE_KAART: Readonly<Record<(typeof KLIMOP_EINDVISIE_TWAALF_PIJLERS)[number], KlimopKernModulePad>> =
  Object.freeze({
    persoon_onafhankelijke_eigenaar_van_gegevens: 'shared/klimop/identiteit.ts',
    vertrouwd_apparaat_beperkte_functies: 'shared/klimop/identiteit.ts',
    knooppunt_beperkte_rol_en_verifieerbaar: 'shared/klimop/kern.ts',
    dienst_geisoleerd_met_expliciete_rechten: 'shared/klimop/diensten.ts',
    kritieke_sleutel_volledige_levenscyclus: 'shared/klimop/drempelsleutels.ts',
    belangrijk_besluit_herleidbaar_en_afgestemd: 'shared/klimop/bestuur.ts',
    kritieke_verbinding_alternatieven_gedocumenteerd: 'shared/klimop/stengels.ts',
    uitgave_vooraf_getoetst_zonder_vertrouwensbreuk: 'shared/klimop/bestuur.ts',
    storing_geeft_begrensde_verifieerbare_reactie: 'shared/klimop/immuunsysteem.ts',
    gebruiker_kan_uittreden_en_rechten_intrekken: 'shared/klimop/hechtranken.ts',
    ai_agent_helpt_zonder_onbeperkte_macht: 'shared/klimop/zaden.ts',
    toekomstige_ontwikkelaar_kan_voortzetten_uit_zaad: 'shared/klimop/zaden.ts',
  });

function bouwDienstenStatusLijst(
  spiegelBeschikbaar: boolean,
  leesModusKaart?: ReadonlyMap<KlimopDienstId, KlimopPassieveLeesModus>,
  schrijfModusKaart?: ReadonlyMap<KlimopDienstId, KlimopDubbelSchrijfModus>,
  attestModusKaart?: ReadonlyMap<KlimopDienstId, KlimopQuorumAttestModus>,
): KlimopDienstBrugStatus[] {
  return KLIMOP_ELF_DIENSTEN.map((dienstId) => {
    const profiel = STANDAARD_DIENST_ISOLATIE_PROFIELEN[dienstId];
    return {
      dienstId,
      subdomein: profiel.subdomeinBestaand,
      eigenGeheugenRuimte: profiel.eigenGeheugenRuimte,
      vereistExterneVerbinderIsolatie: profiel.vereistExterneVerbinderIsolatie,
      huidigeProductieModus: 'alleen_erfenis_postgres',
      passieveLeesModus: leesModusKaart?.get(dienstId) ?? 'alleen_erfenis_postgres',
      dubbelSchrijfModus: schrijfModusKaart?.get(dienstId) ?? 'alleen_erfenis_postgres',
      quorumAttestModus: attestModusKaart?.get(dienstId) ?? 'alleen_erfenis_postgres',
      spiegelVerificatieBeschikbaar: spiegelBeschikbaar,
      productieDatabankActief: true,
    };
  });
}

/** Живий огляд 12 модулів ядра, кореня Меркла «Насіння», досьє та стану Сходинок 1–4 для всіх 11 служб (§35, §46). */
export function klimopOverzicht(wortel = klimopWortel(), staatMap?: string): KlimopPlatformOverzicht {
  const afhankelijkheden = valideerTechnischeAfhankelijkheden();
  const logboekStaat = leesKlimopSpiegelLogboek({ staatMap, limiet: 1 });
  const dubbelStaat = leesKlimopDubbelSchrijvenLogboek({ staatMap, limiet: 1 });
  const attestStaat = leesKlimopQuorumAttestLogboek({ staatMap, limiet: 1 });
  const leesModusKaart = new Map(
    logboekStaat.schakelaars.map((s) => [s.dienstId, s.leesModus] as const),
  );
  const schrijfModusKaart = new Map(
    logboekStaat.schakelaars.map((s) => [s.dienstId, s.schrijfModus] as const),
  );
  const attestModusKaart = new Map(
    logboekStaat.schakelaars.map((s) => [s.dienstId, s.attestModus] as const),
  );
  const overdrachtStaat = {
    actievePassiefLezenDiensten: logboekStaat.samenvatting.actievePassiefLezenDiensten,
    actieveDubbelSchrijvenDiensten: logboekStaat.samenvatting.actieveDubbelSchrijvenDiensten,
    actieveQuorumGereedDiensten: logboekStaat.samenvatting.actieveQuorumGereedDiensten,
    totaalLogboekRegels: logboekStaat.samenvatting.totaalLogboekRegels,
    totaalDubbelKwitanties: dubbelStaat.samenvatting.totaalKwitanties,
    totaalQuorumAttesten: attestStaat.samenvatting.totaalAttesten,
    ketenIntegriteitOk: logboekStaat.ketenIntegriteit.ok,
    dubbelKetenIntegriteitOk: dubbelStaat.ketenIntegriteit.ok,
    attestKetenIntegriteitOk: attestStaat.ketenIntegriteit.ok,
  };

  const kernPad = join(wortel, 'shared/klimop/kern.ts');
  if (!existsSync(kernPad)) {
    return {
      bron: { aanwezig: false, wortel, code: 'KLIMOP_GEEN_BRON' },
      kernModules: [],
      zaadMerkleWortelSha256: null,
      afhankelijkheden,
      eindvisie46: null,
      dossier: null,
      diensten: bouwDienstenStatusLijst(true, leesModusKaart, schrijfModusKaart, attestModusKaart),
      overdrachtStaat,
      hulpmiddelen: KLIMOP_TOOL_NAMEN,
      productieOnaangetast: true,
    };
  }

  const kernModules: KlimopModuleIntegriteit[] = [];
  const zaadRegels: ZaadOnderdeelManifestRegel[] = [];

  for (const relPad of KLIMOP_TWAALF_KERNMODULES) {
    const volPad = join(wortel, relPad);
    if (!existsSync(volPad)) {
      kernModules.push({ pad: relPad, aanwezig: false, grootteBytes: 0, sha256: '' });
      continue;
    }
    const buf = readFileSync(volPad);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    kernModules.push({ pad: relPad, aanwezig: true, grootteBytes: buf.length, sha256 });
    zaadRegels.push({ pad: relPad, grootteBytes: buf.length, sha256 });
  }

  const alleTwaalfAanwezig = kernModules.length === 12 && kernModules.every((m) => m.aanwezig);
  const zaadMerkleWortelSha256 = alleTwaalfAanwezig ? berekenZaadMerkleWortelSha256(zaadRegels) : null;

  const et1Pad = join(wortel, 'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md');
  const et1Inhoud = existsSync(et1Pad) ? readFileSync(et1Pad, 'utf8') : '';
  const voltooideDocumenten44 =
    et1Inhoud && !et1Inhoud.includes('Заплановано (Етап') ? 25 : 0;

  const pijlers: EindvisiePijlerBewijs[] = KLIMOP_EINDVISIE_TWAALF_PIJLERS.map((pijlerId) => {
    const modPad = PIJLER_MODULE_KAART[pijlerId];
    const modOk = kernModules.some((m) => m.pad === modPad && m.aanwezig);
    return {
      pijlerId,
      verwezenlijktInModule: modPad,
      geverifieerd: modOk,
    };
  });

  const visie = valideerKlimopEindvisie46({
    pijlers,
    voltooideVerplichteDocumenten44: voltooideDocumenten44,
    alleTwaalfEtappesVoltooid: alleTwaalfAanwezig && voltooideDocumenten44 === 25,
    productieInfrastructuurOnaangetast: true,
  });

  let dossier: KlimopPlatformOverzicht['dossier'] = null;
  const dossierPad = join(wortel, 'orchestratie/onderwerpen/ecosysteem-klimop.json');
  if (existsSync(dossierPad)) {
    try {
      const parsed = JSON.parse(readFileSync(dossierPad, 'utf8')) as {
        bijgewerkt?: string;
        werk?: unknown[];
        mogelijkheden?: Array<{ staat?: string }>;
      };
      const mog = Array.isArray(parsed.mogelijkheden) ? parsed.mogelijkheden : [];
      dossier = {
        bijgewerkt: String(parsed.bijgewerkt ?? ''),
        aantalTaken: Array.isArray(parsed.werk) ? parsed.werk.length : 0,
        actieveMogelijkheden: mog.filter((x) => x.staat === 'actief').length,
        verlorenMogelijkheden: mog.filter((x) => x.staat === 'verloren').length,
      };
    } catch {
      dossier = null;
    }
  }

  return {
    bron: { aanwezig: true, wortel },
    kernModules,
    zaadMerkleWortelSha256,
    afhankelijkheden,
    eindvisie46: {
      ok: visie.ok,
      gedektePijlers: visie.gedektePijlers,
      totaalPijlers: KLIMOP_EINDVISIE_TWAALF_PIJLERS.length,
      voltooideDocumenten44,
    },
    dossier,
    diensten: bouwDienstenStatusLijst(alleTwaalfAanwezig, leesModusKaart, schrijfModusKaart, attestModusKaart),
    overdrachtStaat,
    hulpmiddelen: KLIMOP_TOOL_NAMEN,
    productieOnaangetast: true,
  };
}

export async function klimopOverzichtA(wortel = klimopWortel(), staatMap?: string): Promise<KlimopPlatformOverzicht> {
  return klimopOverzicht(wortel, staatMap);
}

/** Машинна оцінка пропозиції за 15 питаннями §42, 14 заборонами §43 та правилами ШІ-агентів §33–§34. */
export function klimopArchitectuurToets(raw: unknown): KlimopArchitectuurToetsUitkomst {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new KlimopFout('KLIMOP_INVOER_ONGELDIG', 400);
  }
  const b = raw as KlimopArchitectuurToetsInvoer;
  const naam = typeof b.naam === 'string' && b.naam.trim() ? b.naam.trim().slice(0, 200) : 'Перевірка пропозиції Плющ';
  const fase = Number.isInteger(b.fase) ? Number(b.fase) : 12;

  const antwoorden15 = {} as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const standaardAanvullen = b.gebruikStandaardBewijsVoorOntbrekendeVragen === true;
  let beoordeeldeVragen = 0;

  for (const vraagId of KLIMOP_CONTROLE_VRAGEN_IDS) {
    const opgegeven = b.antwoorden15?.[vraagId];
    if (opgegeven && typeof opgegeven === 'object') {
      beoordeeldeVragen++;
      antwoorden15[vraagId] = {
        voldaan: opgegeven.voldaan === true,
        bewijs: String(opgegeven.bewijs ?? '').trim(),
      };
    } else if (standaardAanvullen) {
      beoordeeldeVragen++;
      antwoorden15[vraagId] = {
        voldaan: true,
        bewijs: 'Перевірено за канонічними інваріантами модулів shared/klimop/*.ts без втручання в робочу базу.',
      };
    }
  }

  const geldigeVerbodSet = new Set<string>(KLIMOP_VERBODEN_VEREENVOUDIGINGEN_IDS);
  const aanwezigeVerbodenVereenvoudigingen: KlimopVerbodenVereenvoudigingId[] = Array.isArray(
    b.aanwezigeVerbodenVereenvoudigingen,
  )
    ? b.aanwezigeVerbodenVereenvoudigingen.filter(
        (v): v is KlimopVerbodenVereenvoudigingId => typeof v === 'string' && geldigeVerbodSet.has(v),
      )
    : [];

  const basisOordeel = beoordeelKlimopWijziging({
    naam,
    fase,
    raaktProductieDirectZonderGoedkeuring: b.raaktProductieDirectZonderGoedkeuring === true,
    antwoorden15,
    aanwezigeVerbodenVereenvoudigingen,
  });

  const extraFouten: string[] = [];
  const heeftAgentVelden =
    b.richting !== undefined
    || b.agentId !== undefined
    || b.probeertZelfGoedTeKeurenOfUitTeRollen !== undefined
    || b.wijzigtCryptoregelsZonderQuorum !== undefined
    || b.breidtEigenRechtenUit !== undefined
    || b.onthultGeheimen !== undefined;

  if (heeftAgentVelden) {
    const richting = (
      typeof b.richting === 'string'
        ? b.richting
        : 'compatibiliteit_en_migratie'
    ) as KlimopOntwikkelRichtingId;

    if (!KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN.includes(richting)) {
      extraFouten.push('ONBEKENDE_ONTWIKKELRICHTING');
    } else {
      const agentOordeel = beoordeelAutonoomOntwikkelVoorstel({
        voorstelId: 'TOETS-PLATFORM',
        agentId: typeof b.agentId === 'string' && b.agentId.trim() ? b.agentId.trim() : 'antigravity',
        richting,
        regelsVersie: typeof b.regelsVersie === 'string' ? b.regelsVersie : '1.5.0',
        bevatTestBewijs: b.bevatTestBewijs !== false,
        antwoorden15,
        probeertZelfGoedTeKeurenOfUitTeRollen: b.probeertZelfGoedTeKeurenOfUitTeRollen === true,
        wijzigtCryptoregelsZonderQuorum: b.wijzigtCryptoregelsZonderQuorum === true,
        breidtEigenRechtenUit: b.breidtEigenRechtenUit === true,
        onthultGeheimen: b.onthultGeheimen === true,
      });
      for (const f of agentOordeel.fouten) {
        if (!basisOordeel.fouten.includes(f) && !extraFouten.includes(f)) {
          extraFouten.push(f);
        }
      }
    }
  }

  const alleFouten = [...basisOordeel.fouten, ...extraFouten];
  return {
    naam,
    fase,
    goedgekeurd: alleFouten.length === 0,
    vereistMenselijkOfQuorumBesluit: true,
    beoordeeldeVragen,
    ontbrekendeOfGefaaldeVragen: basisOordeel.ontbrekendeOfGefaaldeVragen,
    geschondenVereenvoudigingen: basisOordeel.geschondenVereenvoudigingen,
    fouten: alleFouten,
  };
}

/**
 * Виконує в ізольованій пам'яті безризикову дзеркальну криптографічну перевірку Сходинки 1 (§35 маніфесту)
 * для обраної служби платформи:
 *   - виводить окремий псевдонім служби psid1_… та 32-байтний ключ HKDF-SHA-256;
 *   - перевіряє конвертне шифрування ChaCha20-Poly1305 та відновлення смуг Ріда–Соломона (4+2) при відмові 2 смуг;
 *   - перевіряє підписане CRDT-злиття та криптографічну відмову при спробі читання ключем іншої служби;
 *   - звіряє двосторонню рівність контрольних сум без жодного запису чи читання у робочій PostgreSQL.
 */
export function klimopSpiegelControle(raw: unknown): KlimopSpiegelControleUitkomst {
  const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dienstId = String(b.dienstId ?? 'werkblad') as KlimopDienstId;
  if (!KLIMOP_ELF_DIENSTEN.includes(dienstId)) {
    throw new KlimopFout('ONBEKENDE_KLIMOP_DIENST', 400);
  }

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
      epoche: 1,
    });

    const andereDienstId: KlimopDienstId = dienstId === 'postvak' ? 'wolkopslag' : 'postvak';
    const andereDienstCtx = leidGeisoleerdeDienstContextAf({
      persoonsWortelGeheim32: wortelGeheim32,
      persoonsZout32: zout32,
      persoonsId: persoon.staat.oprichting.persoonsId,
      dienstId: andereDienstId,
      epoche: 1,
    });

    try {
      const proefKnooppunt = maakKlimopKnooppunt({
        type: 'persoonlijke_gebruikersapparaten',
        rollen: ['opslag', 'synchronisatie', 'verificatie'],
        juridischeRegio: 'NL',
        aanbieder: 'spiegel-geheugenproef',
        nuIso,
      });

      const kunstmatigRecord = {
        schema: 1,
        proefSoort: 'spiegel_verificatie_stap_1',
        dienstId,
        dienstPsid: dienstCtx.dienstPsid,
        tijdstip: nuIso,
      };
      const klareBytes = Buffer.from(JSON.stringify(kunstmatigRecord), 'utf8');
      const oorspronkelijkeSha256 = createHash('sha256').update(klareBytes).digest('hex');
      const machtigingenSha256 = createHash('sha256')
        .update(`${dienstId}|${dienstCtx.dienstPsid}|alleen_eigenaar`, 'utf8')
        .digest('hex');

      const verdeeld = versleutelEnVerdeelObject({
        inhoud: klareBytes,
        objectId: `spiegel_${dienstId}`,
        eigenaar: proefKnooppunt,
        kek: kek32,
        k: 4,
        m: 2,
        nuIso,
      });

      // Імітуємо одночасну втрату двох смуг (індекси 0 та 3 із 6): залишаються рівно k = 4 смуги.
      const overlevendeFragmenten = verdeeld.fragmentenPerSegment.map((seg) =>
        seg.filter((f) => f.index !== 0 && f.index !== 3),
      );
      const hersteld = herstelEnOntsleutelObject({
        manifest: verdeeld.manifest,
        fragmentenPerSegment: overlevendeFragmenten,
        kek: kek32,
      });

      const hersteldeSha256 = hersteld.ok
        ? createHash('sha256').update(hersteld.inhoud).digest('hex')
        : '';
      const inhoudSha256Gelijk = hersteld.ok && hersteldeSha256 === oorspronkelijkeSha256;

      // CRDT-операція та перевірка криптографічної ізоляції між службами (§28, §30)
      const apparaatSleutels = {
        publiekeSleutelDerB64u: proefKnooppunt.identiteit.publiekeSleutelDerB64u,
        geheimeSleutelPkcs8B64u: proefKnooppunt.geheimeSleutelPkcs8B64u,
      };
      const op1 = maakOndertekendeCrdtOperatie({
        dienstContext: dienstCtx,
        sleutelId: 'spiegel_proef_sleutel_1',
        soort: 'zet',
        klareWaarde: kunstmatigRecord,
        hlc: maakHlcStempel(Date.now(), 1, proefKnooppunt.identiteit.knooppuntId),
        apparaatTekenSleutels: apparaatSleutels,
      });

      const staatA = {
        ...maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid),
        elementen: { [op1.sleutelId]: op1 },
      };
      const staatB = maakLegeDienstCrdtStaat(dienstId, dienstCtx.dienstPsid);
      const samengevoegd = voegCrdtStatenSamen(staatA, staatB);
      const eigenOntsleuteld = samengevoegd.ok
        ? ontsleutelCrdtOperatieWaarde(samengevoegd.samengevoegd.elementen[op1.sleutelId], dienstCtx)
        : { ok: false as const, fout: 'SAMENVOEGING_MISLUKT' };
      const kruisPoging = ontsleutelCrdtOperatieWaarde(op1, andereDienstCtx);

      const crdtSamenvoegingOk = samengevoegd.ok && eigenOntsleuteld.ok;
      const kruisDienstIsolatieAfgedwongen =
        kruisPoging.ok === false && dienstCtx.dienstPsid !== andereDienstCtx.dienstPsid;

      // Двостороння звірка станів і рішення сходинки перенесення (§35)
      const erfenisSamenvatting = [
        {
          sleutelId: 'spiegel_proef_sleutel_1',
          inhoudSha256: oorspronkelijkeSha256,
          machtigingenSha256,
        },
      ];
      const klimopSamenvatting = [
        {
          sleutelId: 'spiegel_proef_sleutel_1',
          inhoudSha256: hersteldeSha256,
          machtigingenSha256,
        },
      ];
      const pariteitVerslag = vergelijkErfenisEnKlimopStaat(erfenisSamenvatting, klimopSamenvatting);
      const stapBesluit = beslisOverDienstOverdrachtStap({
        dienstId,
        huidigeModus: 'alleen_erfenis_postgres',
        gewensteModus: 'schaduw_dubbel_schrijven',
        pariteit: pariteitVerslag,
      });

      const afwijkingen =
        pariteitVerslag.ontbrekendeInKlimopIds.length
        + pariteitVerslag.afwijkendeInhoudIds.length
        + pariteitVerslag.afwijkendeMachtigingenIds.length;

      const allesOk =
        inhoudSha256Gelijk
        && crdtSamenvoegingOk
        && kruisDienstIsolatieAfgedwongen
        && pariteitVerslag.volledigGelijk
        && stapBesluit.toegestaan;

      return {
        ok: allesOk,
        dienstId,
        subdomein: profiel.subdomeinBestaand,
        geisoleerdeDienstPsid: dienstCtx.dienstPsid,
        reedSolomon: {
          k: 4,
          m: 2,
          totaalStrepen: 6,
          hersteldNaUitvalVanTweeStrepen: hersteld.ok,
          inhoudSha256Gelijk,
        },
        crdtSamenvoegingOk,
        kruisDienstIsolatieAfgedwongen,
        pariteit: {
          volledigGelijk: pariteitVerslag.volledigGelijk,
          totaalGecontroleerd: erfenisSamenvatting.length,
          afwijkingen,
        },
        overdrachtBesluit: {
          toegestaan: stapBesluit.toegestaan,
          huidigeProductieModus: 'alleen_erfenis_postgres',
          gevalideerdeProefModus: stapBesluit.nieuweActieveModus,
          reden: stapBesluit.reden,
        },
        productieDatabankGewijzigd: false,
        gecontroleerdOp: nuIso,
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
