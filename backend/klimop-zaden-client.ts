// KLIMOP-013 (21.11.2026, Етап 12 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Кворумний мережевий координатор пакета незалежного відтворення «Насіння» (Документ №19)
// та двостороннього порогового передавання спадкоємності новим уповноваженим учасникам (Документ №23)
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient):
//   - перевіряє між'юрисдикційну та операторську незалежність вузлів зберігання й перевірки «Насіння»;
//   - поширює підписаний пакет «Насіння» (FROST RFC 9591 + Ed25519 + ML-DSA-65 FIPS 204) на кворум незалежних вузлів;
//   - видобуває з доступного кворуму перевірене «Насіння», повторно локально звіряє дерево Меркла й обидва підписи
//     та виконує чисте розгортання нового покоління вузлів без жодного зв'язку зі старим сервером;
//   - закріплює на кворумі передавання конституційної спадкоємності новій раді хранителів без участі початкового автора.

import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  herbouwEcosysteemUitZaadOpSchoonMilieu,
  verifieerKlimopZaadPakket,
  verifieerOpvolgingsOverdracht,
  type KlimopOpvolgingsOverdracht,
  type KlimopZaadPakket,
} from '../shared/klimop/zaden';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopZadenQuorumGroep {
  groepId: string;
  quorumMinimum: number;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export class KlimopZadenEnOpvolgingClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Формує кворумну групу незалежних вузлів ролі `verificatie` у різних юрисдикціях
   * та підписує мандати у площині `knooppunt_beheer` на рівень `gedeelde_systeemtoestanden`.
   */
  maakZadenQuorumGroep(opties: {
    groepId: string;
    coordinator: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    quorumMinimum: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): { ok: true; groep: KlimopZadenQuorumGroep } | { ok: false; fout: string; details?: string[] } {
    if (opties.quorumMinimum < 2 || opties.knooppunten.length < opties.quorumMinimum) {
      return { ok: false, fout: 'ZADEN_QUORUM_TE_KLEIN' };
    }
    if (opties.knooppunten.some((kn) => !kn.rollen.includes('verificatie'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_VERIFICATIEROL' };
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.quorumMinimum);
    if (!spreiding.ok) {
      return { ok: false, fout: 'ZADEN_KNOOPPUNTEN_NIET_ONAFHANKELIJK', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_zaad_${opties.groepId}_${kn.knooppuntId.slice(5, 17)}`,
          uitgeverKnooppuntId: opties.coordinator.identiteit.knooppuntId,
          ontvangerKnooppuntId: kn.knooppuntId,
          machtDomein: 'knooppunt_beheer',
          toegestaneRollen: ['verificatie'],
          toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
          alleenMetDrempelQuorum: false,
          drempelVereist: null,
          uitgegevenOp: nuIso,
          verlooptOp: verlooptOpIso,
          // KLIMOP-020: явний перелік дій, які дозволяє цей мандат
          toegestaneActies: ['bewaar_gevalideerd_zaad_pakket', 'registreer_opvolgings_overdracht', 'raadpleeg_zaad_en_opvolging'],
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

  /** Поширює підписаний пакет відтворення «Насіння» на кворум незалежних вузлів. */
  async verspreidZaadPakketOpQuorum(opties: {
    groep: KlimopZadenQuorumGroep;
    pakket: KlimopZaadPakket;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'GEEN_BEREIKBARE_ZADENKNOOPPUNTEN';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'bewaar_gevalideerd_zaad_pakket',
        pakket: opties.pakket,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'zaad_pakket_opgeslagen') {
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
   * Збирає з живого кворуму незалежних вузлів пакет «Насіння», повторно локально перевіряє його
   * корінь Меркла SHA-256, пороговий підпис FROST та гібридний постквантовий підпис Ed25519 + ML-DSA-65
   * і виконує чисте відтворення нового покоління вузлів без старого сервера.
   */
  async herstelEnStartNieuweGeneratieUitQuorumZaad(opties: {
    groep: KlimopZadenQuorumGroep;
    zaadId: string;
    verwachteFrostPubHex: string;
    nieuweGeneratieKnooppunten: readonly KlimopKnooppuntIdentiteit[];
  }): Promise<
    | {
        ok: true;
        bevestigdeBronKnooppuntIds: string[];
        merkleWortelSha256: string;
        hersteldePadLijst: string[];
        nieuweRechtsgebieden: string[];
      }
    | { ok: false; fout: string }
  > {
    const bevestigdeBronKnooppuntIds: string[] = [];
    let geverifieerdPakket: KlimopZaadPakket | null = null;
    let laatsteFout = 'ZAAD_NIET_OPGEHAALD_VAN_QUORUM';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'raadpleeg_zaad_en_opvolging',
        zaadId: opties.zaadId,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'zaad_en_opvolging_staat' && r.antwoord.pakket) {
        const lokaalOk = verifieerKlimopZaadPakket(r.antwoord.pakket, opties.verwachteFrostPubHex);
        if (!lokaalOk.ok) {
          laatsteFout = lokaalOk.fout;
          continue;
        }
        if (geverifieerdPakket && r.antwoord.pakket.merkleWortelSha256 !== geverifieerdPakket.merkleWortelSha256) {
          return { ok: false, fout: 'QUORUM_ZAAD_MERKLE_TEGENSTRIJDIG' };
        }
        geverifieerdPakket = r.antwoord.pakket;
        bevestigdeBronKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (!geverifieerdPakket || bevestigdeBronKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }

    const schoneOpbouw = herbouwEcosysteemUitZaadOpSchoonMilieu({
      pakket: geverifieerdPakket,
      nieuweGeneratieKnooppunten: opties.nieuweGeneratieKnooppunten,
      verbindingMetOudeServerGebruikt: false,
    });
    if (!schoneOpbouw.ok) return schoneOpbouw;

    return {
      ok: true,
      bevestigdeBronKnooppuntIds,
      merkleWortelSha256: schoneOpbouw.merkleWortelSha256,
      hersteldePadLijst: schoneOpbouw.hersteldePadLijst,
      nieuweRechtsgebieden: schoneOpbouw.nieuweRechtsgebieden,
    };
  }

  /** Реєструє на кворумі незалежних вузлів двосторонній пороговий акт спадкоємності керування (Документ №23). */
  async bekrachtigOpvolgingsOverdrachtOpQuorum(opties: {
    groep: KlimopZadenQuorumGroep;
    overdracht: KlimopOpvolgingsOverdracht;
  }): Promise<
    | { ok: true; bevestigdeKnooppuntIds: string[]; nieuweGrondwetVersie: number }
    | { ok: false; fout: string }
  > {
    const v = verifieerOpvolgingsOverdracht(opties.overdracht);
    if (!v.ok) return v;

    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'OPVOLGING_NIET_BEVESTIGD_OP_QUORUM';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'registreer_opvolgings_overdracht',
        overdracht: opties.overdracht,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'opvolgings_overdracht_geregistreerd') {
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }
    return {
      ok: true,
      bevestigdeKnooppuntIds,
      nieuweGrondwetVersie: opties.overdracht.nieuweGrondwet.versieVolgnummer,
    };
  }
}
