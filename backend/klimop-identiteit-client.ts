// KLIMOP-006 (20.11.2026, Етап 5 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Мережевий координатор розподіленого безсекретного реєстру самосуверенних посвідчень, відкликань пристроїв
// та заявок багатостороннього відновлення поверх захищених зв'язків «Стебла» (KlimopNetwerkClient).
// Жоден закритий ключ або особистий вміст НІКОЛИ не передається на вузли реєстру; кожна відповідь вузлів
// повторно криптографічно перевіряється на пристрої користувача з кворумним захистом від застарілого стану.

import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  verifieerApparaatCertificaat,
  verifieerApparaatIntrekking,
  verifieerPersoonsStaat,
  type ApparaatBevoegdheid,
  type KlimopApparaatCertificaat,
  type KlimopApparaatIntrekking,
  type KlimopHerstelAanvraag,
  type KlimopPersoonsStaat,
} from '../shared/klimop/identiteit';
import type { KlimopIdentiteitRegisterInvoer, KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopIdentiteitRegisterGroep {
  registerId: string;
  quorumDrempel: number;
  knooppunten: readonly KlimopKnooppuntIdentiteit[];
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export class KlimopIdentiteitNetwerkClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Формує незалежний кворумний набір вузлів перевірки посвідчень та відкликань пристроїв
   * із перевіркою рознесення країн і постачальників (§2, §42 п. 1 маніфесту).
   */
  maakIdentiteitRegisterGroep(opties: {
    registerId: string;
    opdrachtgever: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    quorumDrempel: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): { ok: true; groep: KlimopIdentiteitRegisterGroep } | { ok: false; fout: string; details?: string[] } {
    if (opties.quorumDrempel < 2 || opties.knooppunten.length < opties.quorumDrempel) {
      return { ok: false, fout: 'IDENTITEIT_REGISTER_QUORUM_ONGELDIG' };
    }
    if (opties.knooppunten.some((k) => !k.rollen.includes('verificatie'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_VERIFICATIEROL' };
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.quorumDrempel);
    if (!spreiding.ok) {
      return { ok: false, fout: 'ONAFHANKELIJKHEID_NIET_VOLDAAN', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (const kn of opties.knooppunten) {
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: `mnd_idreg_${opties.registerId}_${kn.knooppuntId.slice(5, 17)}`,
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

    return {
      ok: true,
      groep: {
        registerId: opties.registerId,
        quorumDrempel: opties.quorumDrempel,
        knooppunten: opties.knooppunten,
        mandatenPerKnooppuntId,
      },
    };
  }

  /**
   * Публікує криптографічно підписаний стан особи, список відкликаних пристроїв і поточну заявку відновлення
   * на всі досяжні вузли групи та вимагає підтвердження щонайменше від `quorumDrempel` незалежних вузлів.
   */
  async publiceerPersoonsStaatOpNetwerk(opties: {
    groep: KlimopIdentiteitRegisterGroep;
    staat: KlimopPersoonsStaat;
    intrekkingen?: readonly KlimopApparaatIntrekking[];
    herstelAanvraag?: KlimopHerstelAanvraag | null;
  }): Promise<
    | { ok: true; bevestigdeKnooppuntIds: string[]; actieveEpoche: number }
    | { ok: false; fout: string; bevestigdeKnooppuntIds: string[] }
  > {
    const sv = verifieerPersoonsStaat(opties.staat);
    if (!sv.ok) return { ok: false, fout: sv.fout, bevestigdeKnooppuntIds: [] };

    const intrekkingen = opties.intrekkingen ?? [];
    for (const intr of intrekkingen) {
      const iv = verifieerApparaatIntrekking(intr, opties.staat);
      if (!iv.ok) return { ok: false, fout: iv.fout, bevestigdeKnooppuntIds: [] };
    }

    const bevestigdeKnooppuntIds: string[] = [];
    let laatsteFout = 'ONVOLDOENDE_REGISTER_KNOOPPUNTEN_BEREIKBAAR';

    for (const kn of opties.groep.knooppunten) {
      const mandaat = opties.groep.mandatenPerKnooppuntId[kn.knooppuntId];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'publiceer_identiteit_staat',
        staat: opties.staat,
        intrekkingen,
        herstelAanvraag: opties.herstelAanvraag ?? null,
        mandaat,
      });
      if (r.antwoord.ok && r.antwoord.actie === 'identiteit_gepubliceerd') {
        bevestigdeKnooppuntIds.push(kn.knooppuntId);
      } else if (!r.antwoord.ok) {
        laatsteFout = r.antwoord.fout;
      }
    }

    if (bevestigdeKnooppuntIds.length < opties.groep.quorumDrempel) {
      return { ok: false, fout: laatsteFout, bevestigdeKnooppuntIds };
    }

    return {
      ok: true,
      bevestigdeKnooppuntIds,
      actieveEpoche: opties.staat.actieveEpoche,
    };
  }

  /**
   * Читає стан особи з кворумом незалежних вузлів, повторно перевіряючи всі підписи Ed25519 на клієнті,
   * обираючи найвищу криптографічно доведену епоху та об'єднуючи всі дійсні заяви відкликання пристроїв.
   */
  async raadpleegPersoonsStaatMetQuorum(opties: {
    groep: KlimopIdentiteitRegisterGroep;
    persoonsId: string;
  }): Promise<
    | {
        ok: true;
        invoer: KlimopIdentiteitRegisterInvoer;
        geraadpleegdeKnooppuntIds: string[];
      }
    | { ok: false; fout: string }
  > {
    const geldigeAntwoorden: Array<{ knooppuntId: string; invoer: KlimopIdentiteitRegisterInvoer }> = [];

    for (const kn of opties.groep.knooppunten) {
      const mandaat = opties.groep.mandatenPerKnooppuntId[kn.knooppuntId];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'raadpleeg_identiteit_staat',
        persoonsId: opties.persoonsId,
        mandaat,
      });
      if (!r.antwoord.ok || r.antwoord.actie !== 'identiteit_geraadpleegd') continue;

      const { invoer } = r.antwoord;
      if (invoer.staat.oprichting.persoonsId !== opties.persoonsId) continue;
      if (!verifieerPersoonsStaat(invoer.staat).ok) continue;

      geldigeAntwoorden.push({ knooppuntId: kn.knooppuntId, invoer });
    }

    if (geldigeAntwoorden.length < opties.groep.quorumDrempel) {
      return { ok: false, fout: 'ONVOLDOENDE_GELDIGE_QUORUM_ANTWOORDEN' };
    }

    const ankerHandtekening = geldigeAntwoorden[0].invoer.staat.oprichting.handtekeningB64u;
    if (geldigeAntwoorden.some((a) => a.invoer.staat.oprichting.handtekeningB64u !== ankerHandtekening)) {
      return { ok: false, fout: 'TEGENSTRIJDIGE_OPRICHTINGSBEWIJZEN_GEDETECTEERD' };
    }

    // Обираємо найвищу криптографічно підтверджену епоху особи
    geldigeAntwoorden.sort((a, b) => b.invoer.staat.actieveEpoche - a.invoer.staat.actieveEpoche);
    const nieuwsteStaat = geldigeAntwoorden[0].invoer.staat;

    // Об'єднуємо всі криптографічно дійсні відкликання пристроїв з усіх опитаних вузлів
    const intrekkingenMap = new Map<string, KlimopApparaatIntrekking>();
    let gekozenHerstelAanvraag: KlimopHerstelAanvraag | null = null;

    for (const a of geldigeAntwoorden) {
      for (const intr of a.invoer.intrekkingen) {
        if (verifieerApparaatIntrekking(intr, nieuwsteStaat).ok) {
          intrekkingenMap.set(intr.ingetrokkenApparaatId, intr);
        }
      }
      if (a.invoer.herstelAanvraag) {
        if (
          !gekozenHerstelAanvraag
          || a.invoer.herstelAanvraag.staat === 'geblokkeerd_door_eigenaar'
          || (gekozenHerstelAanvraag.staat !== 'geblokkeerd_door_eigenaar'
            && a.invoer.herstelAanvraag.staat === 'voltooid')
        ) {
          gekozenHerstelAanvraag = a.invoer.herstelAanvraag;
        }
      }
    }

    return {
      ok: true,
      invoer: {
        staat: nieuwsteStaat,
        intrekkingen: [...intrekkingenMap.values()],
        herstelAanvraag: gekozenHerstelAanvraag,
      },
      geraadpleegdeKnooppuntIds: geldigeAntwoorden.map((a) => a.knooppuntId),
    };
  }

  /** Перевіряє чинність сертифіката особистого пристрою за актуальним мережевим кворумом вузлів. */
  async controleerApparaatOpNetwerk(opties: {
    groep: KlimopIdentiteitRegisterGroep;
    certificaat: KlimopApparaatCertificaat;
    vereisteBevoegdheid?: ApparaatBevoegdheid;
    nuIso?: string;
  }): Promise<{ ok: true; actieveEpoche: number } | { ok: false; fout: string }> {
    const q = await this.raadpleegPersoonsStaatMetQuorum({
      groep: opties.groep,
      persoonsId: opties.certificaat.persoonsId,
    });
    if (!q.ok) return q;

    const cv = verifieerApparaatCertificaat(opties.certificaat, q.invoer.staat, {
      vereisteBevoegdheid: opties.vereisteBevoegdheid,
      intrekkingen: q.invoer.intrekkingen,
      nuIso: opties.nuIso,
    });
    if (!cv.ok) return cv;

    return { ok: true, actieveEpoche: q.invoer.staat.actieveEpoche };
  }
}
