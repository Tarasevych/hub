// KLIMOP-010 (20.11.2026, Етап 9 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Кворумний мережевий координатор захисту людини, невідрізнимих сигналів небезпеки та відкладених критичних операцій
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient):
//   - перевіряє незалежність вузлів ролі `herstel` (різні юрисдикції та різні постачальники);
//   - надсилає вирівняні до 256 байт зашифровані пакети пульсу або тихої тривоги на кворум вузлів наосліп;
//   - реєструє відкладені критичні операції під часовим замком (24–72 год), дозволяє власникові скасувати їх
//     підписом Ed25519 у вікні очікування та вимагає кворумного підтвердження перед виконанням (§15–§17, §36, §39).

import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import type {
  KlimopOperatieAnnulering,
  KlimopUitgesteldeKritiekeOperatie,
  OnopvallendSignaalPakket,
} from '../shared/klimop/mensbescherming';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopMensbeschermingGroep {
  groepId: string;
  quorumMinimum: number;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export class KlimopMensbeschermingClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Створює кворумну групу незалежних вузлів ролі `herstel` та підписує мандати на рівень `systeem_en_machtigingen`.
   */
  maakMensbeschermingGroep(opties: {
    groepId: string;
    eigenaar: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    quorumMinimum: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): { ok: true; groep: KlimopMensbeschermingGroep } | { ok: false; fout: string; details?: string[] } {
    if (opties.quorumMinimum < 2 || opties.knooppunten.length < opties.quorumMinimum) {
      return { ok: false, fout: 'HERSTEL_QUORUM_TE_KLEIN' };
    }
    if (opties.knooppunten.some((kn) => !kn.rollen.includes('herstel'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_HERSTELROL' };
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.quorumMinimum);
    if (!spreiding.ok) {
      return { ok: false, fout: 'HERSTEL_KNOOPPUNTEN_NIET_ONAFHANKELIJK', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_hrst_${opties.groepId}_${kn.knooppuntId.slice(5, 17)}`,
          uitgeverKnooppuntId: opties.eigenaar.identiteit.knooppuntId,
          ontvangerKnooppuntId: kn.knooppuntId,
          machtDomein: 'persoonlijke_gegevens',
          toegestaneRollen: ['herstel'],
          toegestaneOpslagLagen: ['systeem_en_machtigingen'],
          alleenMetDrempelQuorum: false,
          drempelVereist: null,
          uitgegevenOp: nuIso,
          verlooptOp: verlooptOpIso,
        },
        opties.eigenaar,
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

  /**
   * Розсилає зашифрований пакет фіксованого розміру (звичайний пульс або тихий сигнал небезпеки) на кворум вузлів.
   */
  async verspreidOnopvallendSignaal(opties: {
    groep: KlimopMensbeschermingGroep;
    pakket: OnopvallendSignaalPakket;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'GEEN_BEREIKBARE_HERSTELKNOOPPUNTEN';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'ontvang_onopvallend_signaal',
        pakket: opties.pakket,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'onopvallend_signaal_ontvangen') {
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
   * Отримує та об'єднує всі унікальні зашифровані пакети пульсу/тривоги для довіреної особи з кворуму вузлів.
   */
  async haalVoogdSignalenOpVanQuorum(opties: {
    groep: KlimopMensbeschermingGroep;
    voogdId: string;
  }): Promise<{ ok: true; pakketten: OnopvallendSignaalPakket[]; geraadpleegdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const perPakketId = new Map<string, OnopvallendSignaalPakket>();
    const geraadpleegdeKnooppuntIds: string[] = [];
    let laatsteFout = 'ONVOLDOENDE_HERSTELKNOOPPUNTEN';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'haal_voogd_signalen_op',
        voogdId: opties.voogdId,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'voogd_signalen_opgehaald') {
        for (const p of r.antwoord.pakketten) {
          perPakketId.set(p.pakketId, p);
        }
        geraadpleegdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (geraadpleegdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }
    return { ok: true, pakketten: [...perPakketId.values()], geraadpleegdeKnooppuntIds };
  }

  /** Реєструє підписану відкладену критичну операцію під захисним часовим замком на кворумі незалежних вузлів. */
  async registreerUitgesteldeOperatieOpQuorum(opties: {
    groep: KlimopMensbeschermingGroep;
    operatie: KlimopUitgesteldeKritiekeOperatie;
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'REGISTRATIE_UITGESTELDE_OPERATIE_MISLUKT';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'registreer_uitgestelde_operatie',
        operatie: opties.operatie,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'uitgestelde_operatie_geregistreerd') {
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

  /** Поширює підписане власником скасування відкладеної критичної операції на кворум вузлів. */
  async annuleerUitgesteldeOperatieOpQuorum(opties: {
    groep: KlimopMensbeschermingGroep;
    annulering: KlimopOperatieAnnulering;
    toegestaneAnnuleerPubSleutels: readonly string[];
  }): Promise<{ ok: true; bevestigdeKnooppuntIds: string[] } | { ok: false; fout: string }> {
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'ANNULERING_OP_QUORUM_MISLUKT';

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'annuleer_uitgestelde_operatie',
        annulering: opties.annulering,
        toegestaneAnnuleerPubSleutels: opties.toegestaneAnnuleerPubSleutels,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'uitgestelde_operatie_geannuleerd') {
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
   * Запитує у кворуму незалежних вузлів дозвіл на виконання відкладеної операції:
   * дозволено лише якщо щонайменше `quorumMinimum` вузлів одночасно підтвердили сплив часового замка і відсутність скасування!
   */
  async controleerUitvoerbaarheidOpQuorum(opties: {
    groep: KlimopMensbeschermingGroep;
    operatieId: string;
    toegestaneAnnuleerPubSleutels: readonly string[];
    actiefStilDwangAlarm: boolean;
    nuIso: string;
  }): Promise<{ magUitvoeren: boolean; bevestigdeToestemmingen: number; redenIndienGeweigerd: string | null }> {
    let bevestigdeToestemmingen = 0;
    let redenIndienGeweigerd: string | null = null;

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'controleer_uitvoering_uitgestelde_operatie',
        operatieId: opties.operatieId,
        toegestaneAnnuleerPubSleutels: opties.toegestaneAnnuleerPubSleutels,
        actiefStilDwangAlarm: opties.actiefStilDwangAlarm,
        nuIso: opties.nuIso,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'uitgestelde_operatie_uitvoerbaarheid') {
        if (r.antwoord.magUitvoeren) {
          bevestigdeToestemmingen += 1;
        } else if (!redenIndienGeweigerd) {
          redenIndienGeweigerd = r.antwoord.redenIndienGeweigerd ?? 'GEWEIGERD_DOOR_KNOOPPUNT';
        }
      }
    }

    if (bevestigdeToestemmingen < opties.groep.quorumMinimum) {
      return {
        magUitvoeren: false,
        bevestigdeToestemmingen,
        redenIndienGeweigerd: redenIndienGeweigerd ?? 'ONVOLDOENDE_QUORUM_BEVESTIGINGEN',
      };
    }

    return { magUitvoeren: true, bevestigdeToestemmingen, redenIndienGeweigerd: null };
  }
}
