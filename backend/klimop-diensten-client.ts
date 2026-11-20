// KLIMOP-009 (20.11.2026, Етап 8 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Мережевий координатор ізольованих служб та безконфліктної реплікації зашифрованих CRDT-записів
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient):
//   - обов'язкова перевірка незалежності вузлів синхронізації (різні юрисдикції та різні оператори);
//   - вузли зливають підписані Ed25519 CRDT-стани під псевдонімами служб psid1_… наосліп — без ключів шифрування служби;
//   - автоматичне узгодження одночасних автономних змін з різних пристроїв власника після відновлення мережі (§10, §28, §35).

import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  maakLegeDienstCrdtStaat,
  voegCrdtStatenSamen,
  type KlimopDienstCrdtStaat,
  type KlimopDienstId,
} from '../shared/klimop/diensten';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopDienstSynchronisatieGroep {
  groepId: string;
  quorumMinimum: number;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export class KlimopDienstenOverdrachtClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Створює перевірену групу незалежних вузлів синхронізації та підписує мандати ролі `synchronisatie`
   * на рівень `werkgegevens_van_diensten` (рівень зберігання №2 за §11 маніфесту).
   */
  maakDienstSynchronisatieGroep(opties: {
    groepId: string;
    eigenaar: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    quorumMinimum: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): { ok: true; groep: KlimopDienstSynchronisatieGroep } | { ok: false; fout: string; details?: string[] } {
    if (opties.quorumMinimum < 2 || opties.knooppunten.length < opties.quorumMinimum) {
      return { ok: false, fout: 'SYNCHRONISATIE_QUORUM_TE_KLEIN' };
    }
    if (opties.knooppunten.some((kn) => !kn.rollen.includes('synchronisatie'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_SYNCHRONISATIEROL' };
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.quorumMinimum);
    if (!spreiding.ok) {
      return { ok: false, fout: 'SYNCHRONISATIE_KNOOPPUNTEN_NIET_ONAFHANKELIJK', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_sync_${opties.groepId}_${kn.knooppuntId.slice(5, 17)}`,
          uitgeverKnooppuntId: opties.eigenaar.identiteit.knooppuntId,
          ontvangerKnooppuntId: kn.knooppuntId,
          machtDomein: 'persoonlijke_gegevens',
          toegestaneRollen: ['synchronisatie'],
          toegestaneOpslagLagen: ['werkgegevens_van_diensten'],
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
   * Відправляє зашифрований CRDT-стан конкретної служби на всі досяжні вузли групи та повертає злитий результат,
   * якщо підпис і злиття підтвердили щонайменше `quorumMinimum` незалежних вузлів.
   */
  async synchroniseerDienstStaatOpNetwerk(opties: {
    groep: KlimopDienstSynchronisatieGroep;
    lokaleStaat: KlimopDienstCrdtStaat;
    toegestaneApparaatPubSleutels?: readonly string[];
  }): Promise<
    | { ok: true; samengevoegdeStaat: KlimopDienstCrdtStaat; bevestigdeKnooppuntIds: string[] }
    | { ok: false; fout: string }
  > {
    let verzameld = opties.lokaleStaat;
    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'GEEN_BEREIKBARE_SYNCHRONISATIEKNOOPPUNTEN';
    const toegestaanSet = opties.toegestaneApparaatPubSleutels
      ? new Set(opties.toegestaneApparaatPubSleutels)
      : undefined;

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'synchroniseer_dienst_crdt',
        inkomendeStaat: verzameld,
        toegestaneApparaatPubSleutels: opties.toegestaneApparaatPubSleutels,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'dienst_crdt_staat') {
        const mergeRes = voegCrdtStatenSamen(verzameld, r.antwoord.staat, toegestaanSet);
        if (!mergeRes.ok) return mergeRes;
        verzameld = mergeRes.samengevoegd;
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }

    return { ok: true, samengevoegdeStaat: verzameld, bevestigdeKnooppuntIds };
  }

  /**
   * Читає з кворуму незалежних вузлів та безконфліктно об'єднує актуальний зашифрований CRDT-стан ізольованої служби.
   */
  async haalSamengevoegdeDienstStaatOp(opties: {
    groep: KlimopDienstSynchronisatieGroep;
    dienstId: KlimopDienstId;
    dienstPsid: string;
    toegestaneApparaatPubSleutels?: readonly string[];
  }): Promise<
    | { ok: true; staat: KlimopDienstCrdtStaat; geraadpleegdeKnooppuntIds: string[] }
    | { ok: false; fout: string }
  > {
    let verzameld = maakLegeDienstCrdtStaat(opties.dienstId, opties.dienstPsid);
    const geraadpleegdeKnooppuntIds: string[] = [];
    let laatsteFout = 'ONVOLDOENDE_BEREIKBARE_KNOOPPUNTEN';
    const toegestaanSet = opties.toegestaneApparaatPubSleutels
      ? new Set(opties.toegestaneApparaatPubSleutels)
      : undefined;

    for (const kn of opties.groep.knooppunten) {
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'raadpleeg_dienst_crdt',
        dienstId: opties.dienstId,
        dienstPsid: opties.dienstPsid,
        mandaat: opties.groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (r.antwoord.ok && r.antwoord.actie === 'dienst_crdt_staat') {
        const mergeRes = voegCrdtStatenSamen(verzameld, r.antwoord.staat, toegestaanSet);
        if (!mergeRes.ok) return mergeRes;
        verzameld = mergeRes.samengevoegd;
        geraadpleegdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (geraadpleegdeKnooppuntIds.length < opties.groep.quorumMinimum) {
      return { ok: false, fout: laatsteFout };
    }

    return { ok: true, staat: verzameld, geraadpleegdeKnooppuntIds };
  }
}
