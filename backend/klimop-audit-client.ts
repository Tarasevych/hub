// KLIMOP-012 (21.11.2026, Етап 11 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Кворумний мережевий клієнт незалежного аудиту безпеки та перевірки допуску до Етапу 12 («Насіння»)
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient):
//   - перевіряє незалежність вузлів ролі `verificatie` (різні юрисдикції та різні постачальники);
//   - публікує гібридно підписаний (`Ed25519 + ML-DSA-65`) підсумковий звіт аудиту на кворум вузлів;
//   - підтверджує допуск до Етапу 12 лише тоді, коли щонайменше `quorumMinimum` незалежних вузлів
//     одночасно перевірили обидва підписи звіту та зафіксували `vrijgegevenVoorEtappe12 === true`.

import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  verifieerOnafhankelijkAuditRapport,
  type KlimopOnafhankelijkAuditRapport,
} from '../shared/klimop/beveiligingsaudit';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopAuditQuorumGroep {
  groepId: string;
  quorumMinimum: number;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export class KlimopBeveiligingsAuditClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Створює кворумну групу незалежних вузлів ролі `verificatie` та підписує мандати
   * у площині `knooppunt_beheer` на рівень `gedeelde_systeemtoestanden`.
   */
  maakAuditQuorumGroep(opties: {
    groepId: string;
    coordinator: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    quorumMinimum: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): { ok: true; groep: KlimopAuditQuorumGroep } | { ok: false; fout: string; details?: string[] } {
    if (opties.quorumMinimum < 2 || opties.knooppunten.length < opties.quorumMinimum) {
      return { ok: false, fout: 'AUDIT_QUORUM_TE_KLEIN' };
    }
    if (opties.knooppunten.some((kn) => !kn.rollen.includes('verificatie'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_VERIFICATIEROL' };
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.quorumMinimum);
    if (!spreiding.ok) {
      return { ok: false, fout: 'AUDIT_KNOOPPUNTEN_NIET_ONAFHANKELIJK', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_aud_${opties.groepId}_${kn.knooppuntId.slice(5, 17)}`,
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
          toegestaneActies: ['registreer_beveiligingsaudit_rapport', 'raadpleeg_beveiligingsaudit_staat'],
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

  /** Поширює гібридно підписаний звіт незалежного аудиту Етапу 11 на кворум вузлів перевірки. */
  async publiceerAuditRapportOpQuorum(opties: {
    groep: KlimopAuditQuorumGroep;
    rapport: KlimopOnafhankelijkAuditRapport;
    erkendeAuditorSleutels: ReadonlyArray<{
      auditorKnooppuntId: string;
      ed25519PubliekDerB64u: string;
      mlDsa65PubliekSpkiB64u: string;
    }>;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'GEEN_BEREIKBARE_AUDITKNOOPPUNTEN';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'registreer_beveiligingsaudit_rapport',
        rapport: opties.rapport,
        erkendeAuditorSleutels: opties.erkendeAuditorSleutels,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'beveiligingsaudit_rapport_geregistreerd') {
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
   * Запитує у кворуму незалежних вузлів збережений звіт аудиту та повторно локально перевіряє його
   * гібридний постквантовий підпис `Ed25519 + ML-DSA-65` перед підтвердженням допуску до Етапу 12!
   */
  async controleerVrijgaveVoorEtappe12OpQuorum(opties: {
    groep: KlimopAuditQuorumGroep;
    auditId: string;
    erkendeAuditorSleutels: ReadonlyArray<{
      auditorKnooppuntId: string;
      ed25519PubliekDerB64u: string;
      mlDsa65PubliekSpkiB64u: string;
    }>;
  }): Promise<{
    vrijgegevenVoorEtappe12: boolean;
    bevestigdeKnooppuntIds: string[];
    redenIndienGeweigerd: string | null;
  }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let redenIndienGeweigerd: string | null = null;

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'raadpleeg_beveiligingsaudit_staat',
        auditId: opties.auditId,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'beveiligingsaudit_staat') {
        const lokaalGeldig = verifieerOnafhankelijkAuditRapport({
          rapport: r.antwoord.rapport,
          erkendeAuditorSleutels: opties.erkendeAuditorSleutels,
        });
        if (!lokaalGeldig.ok) {
          redenIndienGeweigerd = lokaalGeldig.fout;
          continue;
        }
        if (r.antwoord.rapport.vrijgegevenVoorEtappe12) {
          bevestigdeKnooppuntIds.push(kn.knooppuntId);
        } else if (!redenIndienGeweigerd) {
          redenIndienGeweigerd = 'AUDITRAPPORT_BLOKKEERT_ETAPPE_12';
        }
      } else if (!r.antwoord.ok && !redenIndienGeweigerd) {
        redenIndienGeweigerd = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return {
        vrijgegevenVoorEtappe12: false,
        bevestigdeKnooppuntIds,
        redenIndienGeweigerd: redenIndienGeweigerd ?? 'ONVOLDOENDE_AUDIT_QUORUM',
      };
    }

    return {
      vrijgegevenVoorEtappe12: true,
      bevestigdeKnooppuntIds,
      redenIndienGeweigerd: null,
    };
  }
}
