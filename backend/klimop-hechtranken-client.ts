// KLIMOP-011 (20.11.2026, Етап 10 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Кворумний координатор керованого розширення мережі («Вусики»), протидії атакам Сивілли,
// обліку справедливого обміну ресурсами («Живлення») та безпечного виведення вузлів
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient):
//   - перевіряє незалежність вузлів ролі `verificatie` (різні юрисдикції та постачальники);
//   - підписує мандати у площині `knooppunt_beheer` на рівень `gedeelde_systeemtoestanden` без доступу до особистих таємниць (§2);
//   - поширює двосторонні свідоцтва приєднання, підписані квитанції ресурсів та свідоцтва безпечного виведення
//     на кворум незалежних вузлів з автоматичним обходом обірваних маршрутів (§4–§5.2, §26–§27).

import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import type {
  EerlijkeVoedingBalans,
  HechtrankToetredingsBewijs,
  KlimopMiddelenBijdrageKwitantie,
  SybilWeerstandVerslag,
  VeiligeKnooppuntUittredingBewijs,
} from '../shared/klimop/hechtranken';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopUitbreidingsQuorumGroep {
  groepId: string;
  quorumMinimum: number;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export class KlimopHechtrankenEnVoedingClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Створює кворумну групу незалежних вузлів перевірки (`verificatie`) та підписує мандати
   * у площині керування вузлами (`knooppunt_beheer` -> `gedeelde_systeemtoestanden`).
   */
  maakUitbreidingsQuorumGroep(opties: {
    groepId: string;
    coordinator: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    quorumMinimum: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): { ok: true; groep: KlimopUitbreidingsQuorumGroep } | { ok: false; fout: string; details?: string[] } {
    if (opties.quorumMinimum < 2 || opties.knooppunten.length < opties.quorumMinimum) {
      return { ok: false, fout: 'UITBREIDING_QUORUM_TE_KLEIN' };
    }
    if (opties.knooppunten.some((kn) => !kn.rollen.includes('verificatie'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_VERIFICATIEROL' };
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.quorumMinimum);
    if (!spreiding.ok) {
      return { ok: false, fout: 'UITBREIDING_KNOOPPUNTEN_NIET_ONAFHANKELIJK', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_hchr_${opties.groepId}_${kn.knooppuntId.slice(5, 17)}`,
          uitgeverKnooppuntId: opties.coordinator.identiteit.knooppuntId,
          ontvangerKnooppuntId: kn.knooppuntId,
          machtDomein: 'knooppunt_beheer',
          toegestaneRollen: ['verificatie'],
          toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
          alleenMetDrempelQuorum: false,
          drempelVereist: null,
          uitgegevenOp: nuIso,
          verlooptOp: verlooptOpIso,
        },
        opties.coordinator,
      );
    }

    return {
      ok: true,
      groep: {
        groepId: opties.groepId,
        quorumMinimum: opties.quorumMinimum,
        knooppunten: opties.knooppunten,
        mandatenPerKnooppuntId,
      },
    };
  }

  /** Поширює двосторонньо підписане свідоцтво приєднання нового вузла на кворум незалежних вузлів. */
  async publiceerToetredingOpQuorum(opties: {
    groep: KlimopUitbreidingsQuorumGroep;
    bewijs: HechtrankToetredingsBewijs;
    erkendeSponsorPubSleutels: readonly string[];
    nuIso?: string;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'GEEN_BEREIKBARE_VERIFICATIEKNOOPPUNTEN';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'registreer_knooppunt_toetreding',
        bewijs: opties.bewijs,
        erkendeSponsorPubSleutels: opties.erkendeSponsorPubSleutels,
        nuIso: opties.nuIso,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'knooppunt_toetreding_geregistreerd') {
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }
    return { ok: true, bevestigdeKnooppuntIds };
  }

  /** Поширює підписану іншим вузлом квитанцію наданих ресурсів на кворум незалежних вузлів. */
  async publiceerMiddelenKwitantieOpQuorum(opties: {
    groep: KlimopUitbreidingsQuorumGroep;
    kwitantie: KlimopMiddelenBijdrageKwitantie;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'KWITANTIE_QUORUM_REGISTRATIE_MISLUKT';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'registreer_middelen_kwitantie',
        kwitantie: opties.kwitantie,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'middelen_kwitantie_geregistreerd') {
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }
    return { ok: true, bevestigdeKnooppuntIds };
  }

  /** Реєструє безпечне виведення вузла з кворуму на незалежних вузлах перевірки. */
  async publiceerVeiligeUittredingOpQuorum(opties: {
    groep: KlimopUitbreidingsQuorumGroep;
    uittreding: VeiligeKnooppuntUittredingBewijs;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'UITTREDING_QUORUM_REGISTRATIE_MISLUKT';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'registreer_veilige_uittreding',
        uittreding: opties.uittreding,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'veilige_uittreding_geregistreerd') {
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }
    return { ok: true, bevestigdeKnooppuntIds };
  }

  /**
   * Опитує кворум незалежних вузлів щодо стійкості проти атак Сивілли та справедливого балансу «Живлення» учасника.
   * Повертає консервативну (найсуворішу серед відповідей кворуму) оцінку незалежних голосів та балів внеску.
   */
  async raadpleegUitbreidingEnVoedingVanQuorum(opties: {
    groep: KlimopUitbreidingsQuorumGroep;
    deelnemerId: string;
    vereisteDrempel: number;
  }): Promise<
    | {
        ok: true;
        sybilVerslag: SybilWeerstandVerslag;
        voedingBalans: EerlijkeVoedingBalans;
        actieveKnooppuntIds: readonly string[];
        uitgetredenKnooppuntIds: readonly string[];
        geraadpleegdeKnooppuntIds: string[];
      }
    | { ok: false; fout: string }
  > {
    const geraadpleegdeKnooppuntIds: string[] = [];
    let gekozenSybil: SybilWeerstandVerslag | null = null;
    let gekozenBalans: EerlijkeVoedingBalans | null = null;
    let actieveKnooppuntIds: readonly string[] = [];
    let uitgetredenKnooppuntIds: readonly string[] = [];
    let laatsteFout = 'ONVOLDOENDE_BEREIKBARE_QUORUMKNOOPPUNTEN';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'raadpleeg_uitbreiding_en_voeding',
        deelnemerId: opties.deelnemerId,
        vereisteDrempel: opties.vereisteDrempel,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'uitbreiding_en_voeding_overzicht') {
        geraadpleegdeKnooppuntIds.push(kn.knooppuntId);
        if (
          !gekozenSybil
          || r.antwoord.sybilVerslag.effectieveOnafhankelijkeStemmen < gekozenSybil.effectieveOnafhankelijkeStemmen
        ) {
          gekozenSybil = r.antwoord.sybilVerslag;
          actieveKnooppuntIds = r.antwoord.actieveKnooppuntIds;
          uitgetredenKnooppuntIds = r.antwoord.uitgetredenKnooppuntIds;
        }
        if (!gekozenBalans || r.antwoord.voedingBalans.bijdragePunten < gekozenBalans.bijdragePunten) {
          gekozenBalans = r.antwoord.voedingBalans;
        }
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (geraadpleegdeKnooppuntIds.length < opties.groep.quorumMinimum || !gekozenSybil || !gekozenBalans) {
      return { ok: false, fout: laatsteFout };
    }

    return {
      ok: true,
      sybilVerslag: gekozenSybil,
      voedingBalans: gekozenBalans,
      actieveKnooppuntIds,
      uitgetredenKnooppuntIds,
      geraadpleegdeKnooppuntIds,
    };
  }
}
