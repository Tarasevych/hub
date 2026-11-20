// KLIMOP-008 (20.11.2026, Етап 7 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Мережевий координатор імунної системи та керованого самовідновлення екосистеми «Плющ»
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient) і розподільника Ріда–Соломона (KlimopVerdeeldeOpslagClient):
//   - неперервна сліпа перевірка цілісності зашифрованих фрагментів БЕЗ ключа власника KEK/DEK і без розкриття вмісту (§21);
//   - автоматичний карантин пошкоджених або скомпрометованих вузлів у таблиці маршрутизації (Документ №11);
//   - добудова втрачених фрагментів на здорових незалежних резервних вузлах у межах квот трафіку, з повагою до
//     заряду й мережі користувацьких пристроїв (§26–§27) та без жодного самовільного розширення повноважень (§22).

import type { KlimopKnooppuntIdentiteit, KlimopOndertekendMandaat } from '../shared/klimop/kern';
import type { KlimopRouteTabel } from '../shared/klimop/stengels';
import { verifieerObjectManifest, type KlimopObjectManifest } from '../shared/klimop/opslag';
import {
  beoordeelKnooppuntGezondheid,
  controleerZelfherstelQuota,
  maakBlindeIntegriteitUitdaging,
  magApparaatBijdragenAanHerstel,
  verifieerBlindeIntegriteitBewijs,
  type KlimopApparaatBijdrageVoorkeur,
  type KlimopGezondheidsWaarneming,
  type KlimopImmuunBeoordeling,
  type KlimopZelfherstelQuotaBeleid,
} from '../shared/klimop/immuunsysteem';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';
import type { KlimopPlaatsingsKaart, KlimopVerdeeldeOpslagClient } from './klimop-opslag-client';

export interface ReserveKnooppuntKandidaat {
  identiteit: KlimopKnooppuntIdentiteit;
  voorafOndertekendMandaat: KlimopOndertekendMandaat | null;
  apparaatVoorkeur?: KlimopApparaatBijdrageVoorkeur;
}

export interface ObjectImmuunInspectieVerslag {
  ok: boolean;
  gezondeStrepen: number;
  totaalStrepen: number;
  vereistMinimumStrepen: number;
  directLeesbaarZonderHerstel: boolean;
  beoordelingenPerIndex: Record<number, KlimopImmuunBeoordeling>;
  verlorenOfBeschadigdeIndexen: number[];
}

export interface AutomatischZelfherstelVerslag {
  volledigHersteld: boolean;
  vernieuwdePlaatsing: KlimopPlaatsingsKaart;
  inQuarantaineGeplaatsteKnooppuntIds: string[];
  hersteldeIndexenNaarKnooppuntId: Record<number, string>;
  overgeslagenKandidaten: Array<{ knooppuntId: string; reden: string }>;
  gebruikteHerbouwBytes: number;
  herstelDuurMs: number;
  stopReden: string | null;
}

export class KlimopImmuunsysteemClient {
  constructor(
    private readonly netwerkClient: KlimopNetwerkClient,
    private readonly opslagClient: KlimopVerdeeldeOpslagClient,
    private readonly routeTabel: KlimopRouteTabel,
  ) {}

  /**
   * Проводить неперервну сліпу інспекцію всіх смуг зашифрованого об'єкта без ключа розшифрування власника (§21):
   * перевіряє досяжність вузла, автентичність стебла та криптографічний доказ цілісності кожного фрагмента.
   */
  async inspecteerObjectZonderInzage(opties: {
    manifest: KlimopObjectManifest;
    plaatsing: KlimopPlaatsingsKaart;
    maxNormaleVertragingMs?: number;
  }): Promise<ObjectImmuunInspectieVerslag> {
    const mv = verifieerObjectManifest(opties.manifest);
    const totaal = opties.manifest.reedSolomon.k + opties.manifest.reedSolomon.m;
    const minK = opties.manifest.reedSolomon.k;
    const maxVertraging = opties.maxNormaleVertragingMs ?? 2000;

    if (!mv.ok) {
      return {
        ok: false,
        gezondeStrepen: 0,
        totaalStrepen: totaal,
        vereistMinimumStrepen: minK,
        directLeesbaarZonderHerstel: false,
        beoordelingenPerIndex: {},
        verlorenOfBeschadigdeIndexen: Array.from({ length: totaal }, (_, i) => i),
      };
    }

    const statusPerIndex: Array<{
      knooppuntId: string;
      bereikbaar: boolean;
      integriteitOk: boolean;
      vertragingMs: number;
    }> = [];

    for (let r = 0; r < totaal; r++) {
      const kn = opties.plaatsing.knooppuntPerIndex[r];
      const mandaat = kn ? opties.plaatsing.mandatenPerKnooppuntId[kn.knooppuntId] : undefined;
      if (!kn || !mandaat || this.routeTabel.inQuarantaineSet().has(kn.knooppuntId)) {
        statusPerIndex.push({
          knooppuntId: kn?.knooppuntId ?? `onbekend_${r}`,
          bereikbaar: false,
          integriteitOk: false,
          vertragingMs: 0,
        });
        continue;
      }

      const tStart = performance.now();
      let alleSegmentenVanStreepOk = true;
      let knoopBereikbaar = true;

      for (const seg of opties.manifest.segmenten) {
        const ref = seg.fragmentRefs.find((f) => f.index === r);
        if (!ref) {
          alleSegmentenVanStreepOk = false;
          break;
        }
        const uitdaging = maakBlindeIntegriteitUitdaging(ref.sha256);
        const antw = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
          actie: 'controleer_blok_integriteit',
          blokSha256: ref.sha256,
          uitdagingNonceHex: uitdaging.uitdagingNonceHex,
          mandaat,
        });

        if (!antw.antwoord.ok) {
          if (
            antw.antwoord.fout === 'GEEN_GEZONDE_STENGEL_ROUTE'
            || antw.antwoord.fout === 'HANDDRUK_MISLUKT'
            || antw.antwoord.fout === 'KADER_VERZENDING_MISLUKT'
          ) {
            knoopBereikbaar = false;
          }
          alleSegmentenVanStreepOk = false;
          break;
        }
        if (antw.antwoord.actie !== 'blok_integriteit_bewijs') {
          alleSegmentenVanStreepOk = false;
          break;
        }

        const vBewijs = verifieerBlindeIntegriteitBewijs({
          uitdaging,
          antwoord: antw.antwoord.bewijs,
        });
        if (!vBewijs.ok) {
          alleSegmentenVanStreepOk = false;
          break;
        }
      }

      statusPerIndex.push({
        knooppuntId: kn.knooppuntId,
        bereikbaar: knoopBereikbaar,
        integriteitOk: knoopBereikbaar && alleSegmentenVanStreepOk,
        vertragingMs: Math.round(performance.now() - tStart),
      });
    }

    const gezondeStrepen = statusPerIndex.filter((s) => s.bereikbaar && s.integriteitOk).length;
    const beoordelingenPerIndex: Record<number, KlimopImmuunBeoordeling> = {};
    const verlorenOfBeschadigdeIndexen: number[] = [];

    for (let r = 0; r < totaal; r++) {
      const s = statusPerIndex[r];
      const waarneming: KlimopGezondheidsWaarneming = {
        knooppuntId: s.knooppuntId,
        bereikbaar: s.bereikbaar,
        integriteitBewijsGeldig: s.integriteitOk,
        uitgaveIntegriteitOk: true,
        stengelAuthentiek: true,
        epocheActueel: true,
        onafhankelijkeKopieen: gezondeStrepen,
        minVereisteOnafhankelijkeKopieen: totaal,
        vertragingMs: s.vertragingMs,
        maxNormaleVertragingMs: maxVertraging,
        overbelast: false,
        herstelPadBeschikbaar: gezondeStrepen >= minK,
        geenOnbevoegdeMachtigingWijziging: true,
        geenPersoonlijkeInhoudInTelemetrie: true,
      };
      const oordeel = beoordeelKnooppuntGezondheid(waarneming);
      beoordelingenPerIndex[r] = oordeel;
      if (!s.bereikbaar || !s.integriteitOk) {
        verlorenOfBeschadigdeIndexen.push(r);
      }
    }

    return {
      ok: verlorenOfBeschadigdeIndexen.length === 0,
      gezondeStrepen,
      totaalStrepen: totaal,
      vereistMinimumStrepen: minK,
      directLeesbaarZonderHerstel: gezondeStrepen >= minK,
      beoordelingenPerIndex,
      verlorenOfBeschadigdeIndexen,
    };
  }

  /**
   * Виконує повний цикл керованого самовідновлення за §22 маніфесту (Документи №10 і №11):
   *   1. Негайно ізолює в карантині пошкоджені / скомпрометовані вузли;
   *   2. Перевіряє політику енергоощадження й добровільної згоди кандидатів та наявність підписаних мандатів;
   *   3. Контролює квоту швидкості відновлення (щоб не перевантажити мережу);
   *   4. Добудовує втрачені смуги Ріда–Соломона без ключа розшифрування та повторно підтверджує їхню сліпу цілісність.
   */
  async voerAutomatischZelfherstelUit(opties: {
    manifest: KlimopObjectManifest;
    plaatsing: KlimopPlaatsingsKaart;
    reserveKandidaten: readonly ReserveKnooppuntKandidaat[];
    quotaBeleid: KlimopZelfherstelQuotaBeleid;
    reedsVerbruikteBytesInVenster?: number;
  }): Promise<AutomatischZelfherstelVerslag> {
    const t0 = performance.now();
    const inspectie = await this.inspecteerObjectZonderInzage({
      manifest: opties.manifest,
      plaatsing: opties.plaatsing,
    });

    const inQuarantaineGeplaatsteKnooppuntIds: string[] = [];
    for (const idx of inspectie.verlorenOfBeschadigdeIndexen) {
      const oordeel = inspectie.beoordelingenPerIndex[idx];
      if (oordeel?.plaatsInQuarantaine) {
        this.routeTabel.plaatsInQuarantaine(oordeel.knooppuntId);
        inQuarantaineGeplaatsteKnooppuntIds.push(oordeel.knooppuntId);
      }
    }

    if (inspectie.verlorenOfBeschadigdeIndexen.length === 0) {
      return {
        volledigHersteld: true,
        vernieuwdePlaatsing: opties.plaatsing,
        inQuarantaineGeplaatsteKnooppuntIds,
        hersteldeIndexenNaarKnooppuntId: {},
        overgeslagenKandidaten: [],
        gebruikteHerbouwBytes: 0,
        herstelDuurMs: Math.max(1, Math.round(performance.now() - t0)),
        stopReden: null,
      };
    }

    if (!inspectie.directLeesbaarZonderHerstel) {
      return {
        volledigHersteld: false,
        vernieuwdePlaatsing: opties.plaatsing,
        inQuarantaineGeplaatsteKnooppuntIds,
        hersteldeIndexenNaarKnooppuntId: {},
        overgeslagenKandidaten: [],
        gebruikteHerbouwBytes: 0,
        herstelDuurMs: Math.max(1, Math.round(performance.now() - t0)),
        stopReden: 'ONVOLDOENDE_LEVENDE_STREPEN_VOOR_REED_SOLOMON',
      };
    }

    const overgeslagenKandidaten: Array<{ knooppuntId: string; reden: string }> = [];
    const beschikbareReserves: Array<{
      identiteit: KlimopKnooppuntIdentiteit;
      mandaat: KlimopOndertekendMandaat;
    }> = [];

    const reedsGebruiktInPlaatsing = new Set(
      Object.entries(opties.plaatsing.knooppuntPerIndex)
        .filter(([idxStr]) => !inspectie.verlorenOfBeschadigdeIndexen.includes(Number(idxStr)))
        .map(([, kn]) => kn.knooppuntId),
    );

    for (const kandidaat of opties.reserveKandidaten) {
      if (reedsGebruiktInPlaatsing.has(kandidaat.identiteit.knooppuntId)) {
        continue;
      }
      if (this.routeTabel.inQuarantaineSet().has(kandidaat.identiteit.knooppuntId)) {
        overgeslagenKandidaten.push({ knooppuntId: kandidaat.identiteit.knooppuntId, reden: 'KANDIDAAT_IN_QUARANTAINE' });
        continue;
      }
      if (kandidaat.apparaatVoorkeur) {
        const toestemming = magApparaatBijdragenAanHerstel(kandidaat.apparaatVoorkeur);
        if (!toestemming.magNetwerkOndersteunen) {
          overgeslagenKandidaten.push({
            knooppuntId: kandidaat.identiteit.knooppuntId,
            reden: toestemming.redenIndienGeweigerd ?? 'APPARAAT_VOORKEUR_WEIGERT',
          });
          continue;
        }
      }
      if (!kandidaat.voorafOndertekendMandaat) {
        overgeslagenKandidaten.push({
          knooppuntId: kandidaat.identiteit.knooppuntId,
          reden: 'ZELFHERSTEL_MAG_GEEN_NIEUWE_BEVOEGDHEDEN_AANMAKEN',
        });
        continue;
      }
      beschikbareReserves.push({
        identiteit: kandidaat.identiteit,
        mandaat: kandidaat.voorafOndertekendMandaat,
      });
    }

    let huidigePlaatsing = opties.plaatsing;
    let verbruikteBytes = opties.reedsVerbruikteBytesInVenster ?? 0;
    let gebruikteHerbouwBytes = 0;
    let actieveTaken = 0;
    const hersteldeIndexenNaarKnooppuntId: Record<number, string> = {};
    let reserveCursor = 0;

    const geschatteBytesPerStreep = opties.manifest.segmenten.reduce(
      (som, seg) => som + Math.ceil(seg.versleuteldeLengte / opties.manifest.reedSolomon.k),
      0,
    );

    for (const verlorenIndex of inspectie.verlorenOfBeschadigdeIndexen) {
      if (reserveCursor >= beschikbareReserves.length) {
        return {
          volledigHersteld: false,
          vernieuwdePlaatsing: huidigePlaatsing,
          inQuarantaineGeplaatsteKnooppuntIds,
          hersteldeIndexenNaarKnooppuntId,
          overgeslagenKandidaten,
          gebruikteHerbouwBytes,
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t0)),
          stopReden: 'GEEN_GESCHIKT_RESERVEKNOOPPUNT_BESCHIKBAAR',
        };
      }

      const gekozenReserve = beschikbareReserves[reserveCursor++];
      const quotaCheck = controleerZelfherstelQuota({
        beleid: opties.quotaBeleid,
        reedsVerbruikteBytesInVenster: verbruikteBytes,
        aangevraagdeHerbouwBytes: geschatteBytesPerStreep,
        actieveHerbouwTaken: actieveTaken,
        bestaandMandaatVoorReserveKnoop: gekozenReserve.mandaat,
      });
      if (!quotaCheck.toegestaan) {
        return {
          volledigHersteld: false,
          vernieuwdePlaatsing: huidigePlaatsing,
          inQuarantaineGeplaatsteKnooppuntIds,
          hersteldeIndexenNaarKnooppuntId,
          overgeslagenKandidaten,
          gebruikteHerbouwBytes,
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t0)),
          stopReden: quotaCheck.fout,
        };
      }

      actieveTaken++;
      const herbouwRes = await this.opslagClient.herbouwVerlorenKnooppuntZonderSleutel({
        manifest: opties.manifest,
        plaatsing: huidigePlaatsing,
        verlorenIndex,
        vervangendKnooppunt: gekozenReserve.identiteit,
        vervangendMandaat: gekozenReserve.mandaat,
      });
      actieveTaken--;

      if (!herbouwRes.ok) {
        return {
          volledigHersteld: false,
          vernieuwdePlaatsing: huidigePlaatsing,
          inQuarantaineGeplaatsteKnooppuntIds,
          hersteldeIndexenNaarKnooppuntId,
          overgeslagenKandidaten,
          gebruikteHerbouwBytes,
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t0)),
          stopReden: herbouwRes.fout,
        };
      }

      huidigePlaatsing = herbouwRes.vernieuwdePlaatsing;
      verbruikteBytes += geschatteBytesPerStreep;
      gebruikteHerbouwBytes += geschatteBytesPerStreep;
      hersteldeIndexenNaarKnooppuntId[verlorenIndex] = gekozenReserve.identiteit.knooppuntId;
    }

    // Повторна сліпа перевірка після самовідновлення: усі (k + m) смуг знову цілі й доступні!
    const eindInspectie = await this.inspecteerObjectZonderInzage({
      manifest: opties.manifest,
      plaatsing: huidigePlaatsing,
    });

    return {
      volledigHersteld: eindInspectie.ok,
      vernieuwdePlaatsing: huidigePlaatsing,
      inQuarantaineGeplaatsteKnooppuntIds,
      hersteldeIndexenNaarKnooppuntId,
      overgeslagenKandidaten,
      gebruikteHerbouwBytes,
      herstelDuurMs: Math.max(1, Math.round(performance.now() - t0)),
      stopReden: eindInspectie.ok ? null : 'NA_HERBOUW_CONTROLE_NIET_VOLLEDIG',
    };
  }
}
