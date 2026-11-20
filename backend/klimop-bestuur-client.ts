// KLIMOP-007 (20.11.2026, Етап 6 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Мережевий координатор розподіленого порогового керування та поступового (хвильового) поширення підписаних випусків
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient) і порогового підписувача FROST (KlimopDrempelOndertekenaarClient).
// Жоден приватний ключ ради керування ніколи не збирається в одному місці; при першому порушенні показників здоров'я
// чи безпеки на першій хвилі подальше поширення автоматично зупиняється без зачіпання наступних хвиль (§24, §40).

import {
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  STANDAARD_CATEGORIE_BELEID,
  bekrachtigBestuursBesluitMetFrost,
  maakFrostBesluitBoodschap,
  maakMomentopnameFrostBoodschap,
  maakUitgaveDoelenMetadata,
  maakUitgaveTijdstempelMetadata,
  zijnKnooppuntVersiesOnderlingCompatibel,
  type IndienerSoort,
  type KlimopBekrachtigdBestuursBesluit,
  type KlimopBestuursGrondwet,
  type KlimopBestuursVoorstel,
  type KlimopUitgaveMomentopnameMetadata,
  type KlimopUitrolGezondheidsMeting,
  type KlimopVolledigeUitgaveBundel,
} from '../shared/klimop/bestuur';
import type { KlimopDrempelGroepManifest, KlimopDrempelOndertekenaarClient } from './klimop-drempel-client';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopBestuursNetwerkOmgeving {
  netwerkId: string;
  grondwet: KlimopBestuursGrondwet;
  frostGroep: KlimopDrempelGroepManifest;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
  erkendeDoelenRolPubDerB64u: string;
  erkendeTijdstempelRolPubDerB64u: string;
}

export interface GefaseerdeUitrolVerslag {
  voltooid: boolean;
  status: 'alle_golven_voltooid' | 'automatisch_gestopt_en_teruggedraaid' | 'afgewezen_voor_installatie';
  voltooideGolven: number;
  geactiveerdeKnooppuntIds: string[];
  nietAangeraakteKnooppuntIds: string[];
  tussentijdseVersieCompatibiliteitOk: boolean;
  stopFout: string | null;
  stopDetails: string[];
}

export class KlimopBestuurEnUitrolClient {
  constructor(
    private readonly netwerkClient: KlimopNetwerkClient,
    private readonly drempelClient: KlimopDrempelOndertekenaarClient,
  ) {}

  /**
   * Реєструє (або оновлює за затвердженим 72-годинним рішенням кворуму FROST) конституцію керування
   * та розділені публічні ключі ролей випуску на всіх досяжних вузлах мережі.
   */
  async stelGrondwetOpNetwerkIn(opties: {
    netwerkId: string;
    opdrachtgever: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    grondwet: KlimopBestuursGrondwet;
    frostGroep: KlimopDrempelGroepManifest;
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    erkendeDoelenRolPubDerB64u: string;
    erkendeTijdstempelRolPubDerB64u: string;
    bekrachtigdLogboek?: readonly KlimopBekrachtigdBestuursBesluit[];
    nuIso?: string;
    verlooptOpIso?: string;
  }): Promise<
    | { ok: true; omgeving: KlimopBestuursNetwerkOmgeving; bevestigdeKnooppuntIds: string[] }
    | { ok: false; fout: string }
  > {
    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_bestuur_${opties.netwerkId}_${kn.knooppuntId.slice(5, 17)}`,
          uitgeverKnooppuntId: opties.opdrachtgever.identiteit.knooppuntId,
          ontvangerKnooppuntId: kn.knooppuntId,
          machtDomein: 'persoonlijke_gegevens',
          toegestaneRollen: ['verificatie'],
          toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
          alleenMetDrempelQuorum: false,
          drempelVereist: null,
          uitgegevenOp: nuIso,
          verlooptOp: verlooptOpIso,
        },
        opties.opdrachtgever,
      );
    }

    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'GEEN_BEREIKBARE_KNOOPPUNTEN';

    for (const kn of opties.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'stel_bestuursgrondwet_in',
        grondwet: opties.grondwet,
        erkendeDoelenRolPubDerB64u: opties.erkendeDoelenRolPubDerB64u,
        erkendeTijdstempelRolPubDerB64u: opties.erkendeTijdstempelRolPubDerB64u,
        bekrachtigdLogboek: opties.bekrachtigdLogboek,
        mandaat: mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'bestuursgrondwet_ingesteld') {
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.grondwet.drempel) {
      return { ok: false, fout: laatsteFout };
    }

    return {
      ok: true,
      omgeving: {
        netwerkId: opties.netwerkId,
        grondwet: opties.grondwet,
        frostGroep: opties.frostGroep,
        knooppunten: opties.knooppunten,
        mandatenPerKnooppuntId,
        erkendeDoelenRolPubDerB64u: opties.erkendeDoelenRolPubDerB64u,
        erkendeTijdstempelRolPubDerB64u: opties.erkendeTijdstempelRolPubDerB64u,
      },
      bevestigdeKnooppuntIds,
    };
  }

  /**
   * Затверджує пропозицію керування пороговим підписом FROST на живих вузлах після перевірки спливу часового замка
   * та відсутності аварійного вето.
   */
  async bekrachtigVoorstelOpNetwerk(opties: {
    omgeving: KlimopBestuursNetwerkOmgeving;
    bestaandLogboek: readonly KlimopBekrachtigdBestuursBesluit[];
    voorstel: KlimopBestuursVoorstel;
    bekrachtigdOp?: string;
  }): Promise<{ ok: true; besluit: KlimopBekrachtigdBestuursBesluit } | { ok: false; fout: string }> {
    const { omgeving, voorstel } = opties;
    if (voorstel.staat === 'gevetood_in_wachttijd' || voorstel.noodVetoBewijs) {
      return { ok: false, fout: 'VOORSTEL_IS_GEVETOOD' };
    }
    const regel = STANDAARD_CATEGORIE_BELEID[voorstel.categorie];
    if (!regel.vereistFrostQuorum) {
      return { ok: false, fout: 'CATEGORIE_HOORT_NIET_BIJ_SYSTEEMBESTUUR' };
    }

    const bekrachtigdOp = opties.bekrachtigdOp ?? new Date().toISOString();
    const minVereistMs = Date.parse(voorstel.ingediendOp) + regel.minimaleWachttijdUren * 3600 * 1000;
    if (Date.parse(bekrachtigdOp) < Math.max(Date.parse(voorstel.uitvoerbaarVanaf), minVereistMs)) {
      return { ok: false, fout: 'BESTUUR_TIJDSLOT_NOG_NIET_VERSTREKEN' };
    }

    const frostBoodschap = maakFrostBesluitBoodschap(voorstel, bekrachtigdOp);
    const frostSig = await this.drempelClient.tekenMetFrostQuorum({
      groep: omgeving.frostGroep,
      boodschap: frostBoodschap,
    });
    if (!frostSig.ok) return { ok: false, fout: frostSig.fout };

    return bekrachtigBestuursBesluitMetFrost({
      grondwet: omgeving.grondwet,
      bestaandLogboek: opties.bestaandLogboek,
      voorstel,
      frostOndertekenaarIndexen: frostSig.ondertekenaarIndexen,
      frostHandtekeningHex: frostSig.handtekeningHex,
      bekrachtigdOp,
    });
  }

  /**
   * Складає та порогово підписує чотирирівневий пакет випуску (doelen + webClientManifest + FROST momentopname + tijdstempel).
   */
  async stelOndertekendeUitgaveBundelSamen(opties: {
    omgeving: KlimopBestuursNetwerkOmgeving;
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
    tijdstempelRolSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
    nuIso?: string;
    tijdstempelGeldigheidUren?: number;
  }): Promise<{ ok: true; bundel: KlimopVolledigeUitgaveBundel } | { ok: false; fout: string }> {
    const doelen = maakUitgaveDoelenMetadata({
      versieLabel: opties.versieLabel,
      uitgaveVolgnummer: opties.uitgaveVolgnummer,
      minCompatibelVolgnummer: opties.minCompatibelVolgnummer,
      pakketInhoud: opties.pakketInhoud,
      webClientBundelInhoud: opties.webClientBundelInhoud,
      afhankelijkhedenBoomSha256: opties.afhankelijkhedenBoomSha256,
      bronCommitSha40: opties.bronCommitSha40,
      ontwikkelarchiefSha256: opties.ontwikkelarchiefSha256,
      isOnomkeerbareMigratie: opties.isOnomkeerbareMigratie,
      onomkeerbareHerstelProcedureId: opties.onomkeerbareHerstelProcedureId,
      auteurSoort: opties.auteurSoort,
      auteurId: opties.auteurId,
      doelenRolSleutels: opties.doelenRolSleutels,
    });

    const { boodschap: frostBoodschap, doelenMetadataSha256 } = maakMomentopnameFrostBoodschap(
      opties.omgeving.grondwet.grondwetId,
      doelen,
    );
    const frostSig = await this.drempelClient.tekenMetFrostQuorum({
      groep: opties.omgeving.frostGroep,
      boodschap: frostBoodschap,
    });
    if (!frostSig.ok) return { ok: false, fout: frostSig.fout };

    const momentopname: KlimopUitgaveMomentopnameMetadata = {
      schema: 1,
      grondwetId: opties.omgeving.grondwet.grondwetId,
      uitgaveVolgnummer: opties.uitgaveVolgnummer,
      doelenMetadataSha256,
      frostOndertekenaarIndexen: frostSig.ondertekenaarIndexen,
      frostHandtekeningHex: frostSig.handtekeningHex,
    };

    const tijdstempel = maakUitgaveTijdstempelMetadata({
      momentopname,
      tijdstempelRolSleutels: opties.tijdstempelRolSleutels,
      nuIso: opties.nuIso,
      geldigheidUren: opties.tijdstempelGeldigheidUren,
    });

    return { ok: true, bundel: { doelen, momentopname, tijdstempel } };
  }

  /**
   * Послідовно розгортає випуск хвилями (`golven[0] -> golven[1] -> ...`):
   *   - на кожній хвилі вузли перевіряють усі криптографічні рівні та всі 4 показники §24;
   *   - при порушенні на будь-якому вузлі поточної хвилі цей вузол автоматично відкочується,
   *     а всі подальші хвилі миттєво зупиняються без торкання їхніх вузлів!
   */
  async voerGefaseerdeUitrolUit(opties: {
    omgeving: KlimopBestuursNetwerkOmgeving;
    bundel: KlimopVolledigeUitgaveBundel;
    pakketInhoud: Buffer;
    webClientBundelInhoud: Buffer;
    golven: ReadonlyArray<readonly string[]>;
    gesimuleerdeMetingPerKnooppuntId?: Readonly<Record<string, Partial<KlimopUitrolGezondheidsMeting>>>;
    nuIso?: string;
  }): Promise<GefaseerdeUitrolVerslag> {
    const alleDoelIds = opties.golven.flat();
    const geactiveerdeKnooppuntIds: string[] = [];
    const pakketInhoudB64u = opties.pakketInhoud.toString('base64url');
    const webClientInhoudB64u = opties.webClientBundelInhoud.toString('base64url');
    let tussentijdseVersieCompatibiliteitOk = true;
    let voltooideGolven = 0;

    for (let g = 0; g < opties.golven.length; g++) {
      const golf = opties.golven[g];
      for (const knooppuntId of golf) {
        const mandaat = opties.omgeving.mandatenPerKnooppuntId[knooppuntId];
        const r = await this.netwerkClient.roepOpdrachtAan(knooppuntId, {
          actie: 'pas_uitgave_toe',
          bundel: opties.bundel,
          pakketInhoudB64u,
          webClientInhoudB64u,
          gesimuleerdeMeting: opties.gesimuleerdeMetingPerKnooppuntId?.[knooppuntId],
          nuIso: opties.nuIso,
          mandaat,
        });

        if (!r.antwoord.ok || r.antwoord.actie !== 'uitgave_geactiveerd') {
          const foutCode = !r.antwoord.ok ? r.antwoord.fout : 'ONBEKENDE_UITROLFOUT';
          const stopDetails = !r.antwoord.ok && r.antwoord.details ? r.antwoord.details : [];
          const behandeldSet = new Set([...geactiveerdeKnooppuntIds, knooppuntId]);
          const nietAangeraakteKnooppuntIds = alleDoelIds.filter((id) => !behandeldSet.has(id));
          return {
            voltooid: false,
            status:
              foutCode === 'UITGAVE_GEZONDHEIDSCONTROLE_MISLUKT_TERUGGEDRAAID'
                ? 'automatisch_gestopt_en_teruggedraaid'
                : 'afgewezen_voor_installatie',
            voltooideGolven,
            geactiveerdeKnooppuntIds,
            nietAangeraakteKnooppuntIds,
            tussentijdseVersieCompatibiliteitOk,
            stopFout: foutCode,
            stopDetails,
          };
        }

        geactiveerdeKnooppuntIds.push(knooppuntId);
      }

      voltooideGolven++;

      // Між хвилями перевіряємо сумісність вузлів нової версії з вузлами наступних хвиль на попередній версії (§40 п. 6)
      if (g < opties.golven.length - 1) {
        const volgendId = opties.golven[g + 1][0];
        if (volgendId) {
          const stVolgend = await this.netwerkClient.roepOpdrachtAan(volgendId, {
            actie: 'raadpleeg_uitgave_staat',
            mandaat: opties.omgeving.mandatenPerKnooppuntId[volgendId],
          });
          if (stVolgend.antwoord.ok && stVolgend.antwoord.actie === 'uitgave_staat') {
            const compat = zijnKnooppuntVersiesOnderlingCompatibel(
              {
                actiefVolgnummer: opties.bundel.doelen.uitgaveVolgnummer,
                minCompatibelVolgnummer: opties.bundel.doelen.minCompatibelVolgnummer,
              },
              {
                actiefVolgnummer: stVolgend.antwoord.actiefVolgnummer,
                minCompatibelVolgnummer: stVolgend.antwoord.minCompatibelVolgnummer,
              },
            );
            if (!compat) tussentijdseVersieCompatibiliteitOk = false;
          }
        }
      }
    }

    return {
      voltooid: true,
      status: 'alle_golven_voltooid',
      voltooideGolven,
      geactiveerdeKnooppuntIds,
      nietAangeraakteKnooppuntIds: [],
      tussentijdseVersieCompatibiliteitOk,
      stopFout: null,
      stopDetails: [],
    };
  }
}
