// KLIMOP-005 (20.11.2026, Етап 4 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Мережевий координатор розподіленого створення ключів без єдиного дилера (DKG), двораундового порогового
// підписування FROST(Ed25519, SHA-512) за RFC 9591 та двофазного проактивного епохального оновлення часток
// поверх захищених зв'язків «Стебла» (KlimopNetwerkClient). Координатор НІКОЛИ не бачить закритих часток вузлів.

import { randomBytes } from 'node:crypto';
import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  frostVoegHandtekeningSamen,
  werkDeelnemerPubliekeSleutelsBijNaVerversing,
  type FrostRonde1PubliekeToezegging,
  type FrostRonde2DeelHandtekening,
} from '../shared/klimop/drempelsleutels';
import {
  berekenVerversingBesluitId,
  verifieerDrempelSamenstelling,
  type KlimopDrempelDeelnemer,
  type VersleuteldDkgRondePakket,
  type VersleuteldeNulBijdrage,
} from '../shared/klimop/drempel-vervoer';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

/** KLIMOP-020: порогові дії, які дозволяє мандат набору ключа (перевіряються вузлом у суворому режимі). */
export const KLIMOP_DREMPEL_MANDAAT_ACTIES = [
  'dkg_maak_ontvangstsleutel',
  'dkg_maak_bijdrage',
  'dkg_voltooi_sleutel',
  'frost_ronde1',
  'frost_ronde2',
  'ververs_maak_nulbijdrage',
  'ververs_voorbereiden',
  'ververs_afronden',
  'ververs_status',
] as const;

export interface KlimopDrempelGroepManifest {
  setId: string;
  drempel: number;
  totaal: number;
  epoche: number;
  /** KLIMOP-019: відбиток складу учасників (ідентичності + ключі отримання), однаково обчислений кожним вузлом. */
  samenstellingHex?: string;
  groepsPubliekeSleutelHex: string;
  groepsPubliekeSleutelSpkiB64u: string;
  knooppuntPerDeelnemerIndex: Record<number, KlimopKnooppuntIdentiteit>;
  deelnemerPubliekeSleutelsHex: Record<number, string>;
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

export interface KlimopEpocheVoorbereiding {
  besluitId: string;
  nulBijdragen: VersleuteldeNulBijdrage[];
}

export class KlimopDrempelOndertekenaarClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Проводить розподілене створення порогового ключа (DKG без єдиного дилера) між незалежними вузлами:
   * кожен вузол сам створює свій вклад і збирає власну частку, а назовні повертається лише публічний ключ групи.
   */
  async voerNetwerkDkgUit(opties: {
    setId: string;
    opdrachtgever: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    knooppunten: readonly KlimopKnooppuntIdentiteit[];
    drempel: number;
    nuIso?: string;
    verlooptOpIso?: string;
  }): Promise<
    | { ok: true; groep: KlimopDrempelGroepManifest }
    | { ok: false; fout: string; details?: string[] }
  > {
    const totaal = opties.knooppunten.length;
    if (opties.drempel < 2 || totaal < opties.drempel) {
      return { ok: false, fout: 'DREMPEL_PARAMETERS_ONGELDIG' };
    }
    if (opties.knooppunten.some((k) => !k.rollen.includes('verificatie'))) {
      return { ok: false, fout: 'KNOOPPUNT_MIST_VERIFICATIEROL' };
    }

    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.knooppunten, opties.drempel);
    if (!spreiding.ok) {
      return { ok: false, fout: 'ONAFHANKELIJKHEID_NIET_VOLDAAN', details: spreiding.fouten };
    }

    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const knooppuntPerDeelnemerIndex: Record<number, KlimopKnooppuntIdentiteit> = {};
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};

    for (let idx = 1; idx <= totaal; idx++) {
      const kn = opties.knooppunten[idx - 1];
      knooppuntPerDeelnemerIndex[idx] = kn;
      mandatenPerKnooppuntId[kn.knooppuntId] = ondertekenKlimopMandaat({
        schema: 1,
        mandaatId: `mnd_frost_${opties.setId}_${kn.knooppuntId.slice(5, 17)}`,
        uitgeverKnooppuntId: opties.opdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: kn.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptOpIso,
        // KLIMOP-020: лише порогові дії над цим набором ключа
        toegestaneActies: [...KLIMOP_DREMPEL_MANDAAT_ACTIES],
        objectIds: [opties.setId],
      }, opties.opdrachtgever);
    }

    // Фаза 0 DKG (KLIMOP-019): кожен вузол створює й підписує власний ключ отримання X25519 для набору
    const deelnemers: KlimopDrempelDeelnemer[] = [];
    for (let idx = 1; idx <= totaal; idx++) {
      const kn = knooppuntPerDeelnemerIndex[idx];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'dkg_maak_ontvangstsleutel',
        setId: opties.setId,
        deelnemerIndex: idx,
        mandaat: mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (!r.antwoord.ok || r.antwoord.actie !== 'dkg_ontvangstsleutel') {
        return { ok: false, fout: !r.antwoord.ok ? r.antwoord.fout : 'DKG_ONTVANGSTSLEUTEL_MISLUKT' };
      }
      deelnemers.push({ identiteit: kn, ontvangstSleutel: r.antwoord.ontvangstSleutel });
    }
    const samenstelling = verifieerDrempelSamenstelling(opties.setId, deelnemers);
    if (!samenstelling.ok) return { ok: false, fout: samenstelling.fout };

    // Фаза 1 DKG: кожен вузол генерує власний поліном, шифрує кожну підчастку лише для її адресата
    // і підписує пакет; координатор бачить тільки зобов'язання та шифротексти.
    const alleBijdragen: VersleuteldDkgRondePakket[] = [];
    for (let idx = 1; idx <= totaal; idx++) {
      const kn = knooppuntPerDeelnemerIndex[idx];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'dkg_maak_bijdrage',
        setId: opties.setId,
        deelnemerIndex: idx,
        drempel: opties.drempel,
        totaal,
        deelnemers,
        mandaat: mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (!r.antwoord.ok || r.antwoord.actie !== 'dkg_bijdrage') {
        return { ok: false, fout: !r.antwoord.ok ? r.antwoord.fout : 'DKG_BIJDRAGE_MISLUKT' };
      }
      if (r.antwoord.samenstellingHex !== samenstelling.samenstellingHex) {
        return { ok: false, fout: 'DKG_SAMENSTELLING_VERSCHILT_TUSSEN_KNOOPPUNTEN' };
      }
      alleBijdragen.push(r.antwoord.pakket);
    }

    // Фаза 2 DKG: кожен вузол перевіряє підписи й відбиток складу, розшифровує лише свою підчастку
    // і формує власну частку у своїй пам'яті (або в зашифрованому файлі стану).
    let groepsPubliekeSleutelHex = '';
    let groepsPubliekeSleutelSpkiB64u = '';
    let deelnemerPubliekeSleutelsHex: Record<number, string> = {};

    for (let idx = 1; idx <= totaal; idx++) {
      const kn = knooppuntPerDeelnemerIndex[idx];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'dkg_voltooi_sleutel',
        setId: opties.setId,
        deelnemerIndex: idx,
        alleBijdragen,
        mandaat: mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (!r.antwoord.ok || r.antwoord.actie !== 'dkg_voltooid') {
        return { ok: false, fout: !r.antwoord.ok ? r.antwoord.fout : 'DKG_VOLTOOIING_MISLUKT' };
      }
      if (r.antwoord.samenstellingHex !== samenstelling.samenstellingHex) {
        return { ok: false, fout: 'DKG_SAMENSTELLING_VERSCHILT_TUSSEN_KNOOPPUNTEN' };
      }
      if (!groepsPubliekeSleutelHex) {
        groepsPubliekeSleutelHex = r.antwoord.groepsPubliekeSleutelHex;
        groepsPubliekeSleutelSpkiB64u = r.antwoord.groepsPubliekeSleutelSpkiB64u;
        deelnemerPubliekeSleutelsHex = r.antwoord.deelnemerPubliekeSleutelsHex;
      } else if (groepsPubliekeSleutelHex !== r.antwoord.groepsPubliekeSleutelHex) {
        return { ok: false, fout: 'DKG_GROEPSSLEUTEL_VERSCHILT_TUSSEN_KNOOPPUNTEN' };
      }
    }

    return {
      ok: true,
      groep: {
        setId: opties.setId,
        drempel: opties.drempel,
        totaal,
        epoche: 1,
        samenstellingHex: samenstelling.samenstellingHex,
        groepsPubliekeSleutelHex,
        groepsPubliekeSleutelSpkiB64u,
        knooppuntPerDeelnemerIndex,
        deelnemerPubliekeSleutelsHex,
        mandatenPerKnooppuntId,
      },
    };
  }

  /**
   * Виконує двораундовий пороговий підпис FROST(Ed25519, SHA-512) за участю щонайменше `drempel` живих вузлів,
   * автоматично обходячи карантинні або недоступні вузли, та перевіряє кожну частку підпису окремо.
   */
  async tekenMetFrostQuorum(opties: {
    groep: KlimopDrempelGroepManifest;
    boodschap: Buffer;
  }): Promise<
    | { ok: true; handtekeningHex: string; handtekeningB64u: string; ondertekenaarIndexen: number[] }
    | { ok: false; fout: string; verdachteDeelnemers?: number[] }
  > {
    const { groep } = opties;
    const sessieTekenId = `frst_${randomBytes(12).toString('hex')}`;
    const toezeggingen: FrostRonde1PubliekeToezegging[] = [];

    for (let idx = 1; idx <= groep.totaal; idx++) {
      if (toezeggingen.length >= groep.drempel) break;
      const kn = groep.knooppuntPerDeelnemerIndex[idx];
      const mandaat = kn ? groep.mandatenPerKnooppuntId[kn.knooppuntId] : undefined;
      if (!kn || !mandaat) continue;

      const r1 = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'frost_ronde1',
        setId: groep.setId,
        sessieTekenId,
        mandaat,
      });
      if (!r1.antwoord.ok || r1.antwoord.actie !== 'frost_ronde1_toezegging') continue;
      if (r1.antwoord.epoche !== groep.epoche) continue;
      toezeggingen.push(r1.antwoord.toezegging);
    }

    if (toezeggingen.length < groep.drempel) {
      return { ok: false, fout: 'ONVOLDOENDE_BEREIKBARE_ONDERTEKENAARS' };
    }

    const deelHandtekeningen: FrostRonde2DeelHandtekening[] = [];
    const boodschapB64u = opties.boodschap.toString('base64url');
    for (const tz of toezeggingen) {
      const kn = groep.knooppuntPerDeelnemerIndex[tz.deelnemerIndex];
      const mandaat = groep.mandatenPerKnooppuntId[kn.knooppuntId];
      const r2 = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'frost_ronde2',
        setId: groep.setId,
        sessieTekenId,
        boodschapB64u,
        toezeggingenLijst: toezeggingen,
        groepsPubliekeSleutelHex: groep.groepsPubliekeSleutelHex,
        mandaat,
      });
      if (!r2.antwoord.ok || r2.antwoord.actie !== 'frost_ronde2_deel') {
        return { ok: false, fout: !r2.antwoord.ok ? r2.antwoord.fout : 'FROST_RONDE2_MISLUKT' };
      }
      deelHandtekeningen.push(r2.antwoord.deelHandtekening);
    }

    const samengevoegd = frostVoegHandtekeningSamen({
      boodschap: opties.boodschap,
      toezeggingenLijst: toezeggingen,
      deelHandtekeningen,
      deelnemerPubliekeSleutelsHex: groep.deelnemerPubliekeSleutelsHex,
      groepsPubliekeSleutelHex: groep.groepsPubliekeSleutelHex,
      drempel: groep.drempel,
    });
    if (!samengevoegd.ok) return samengevoegd;

    return {
      ok: true,
      handtekeningHex: samengevoegd.handtekeningHex,
      handtekeningB64u: samengevoegd.handtekeningB64u,
      ondertekenaarIndexen: toezeggingen.map((t) => t.deelnemerIndex),
    };
  }

  /**
   * Фаза 1 двофазного переходу епохи (KLIMOP-019): збирає підписані зашифровані нульові вклади всіх вузлів
   * і готує на кожному вузлі нову частку, не чіпаючи чинної. Якщо підготовка не вдалася хоч на одному
   * вузлі, усім уже підготовленим надсилається скасування цієї самої підготовки (за відбитком рішення).
   */
  async bereidEpocheVerversingVoorOpNetwerk(opties: { groep: KlimopDrempelGroepManifest }): Promise<
    | { ok: true; voorbereiding: KlimopEpocheVoorbereiding }
    | { ok: false; fout: string }
  > {
    const { groep } = opties;
    const nulBijdragen: VersleuteldeNulBijdrage[] = [];

    for (let idx = 1; idx <= groep.totaal; idx++) {
      const kn = groep.knooppuntPerDeelnemerIndex[idx];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'ververs_maak_nulbijdrage',
        setId: groep.setId,
        mandaat: groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (!r.antwoord.ok || r.antwoord.actie !== 'ververs_nulbijdrage') {
        return { ok: false, fout: !r.antwoord.ok ? r.antwoord.fout : 'NULBIJDRAGE_MISLUKT' };
      }
      if (groep.samenstellingHex && r.antwoord.bijdrage.samenstellingHex !== groep.samenstellingHex) {
        return { ok: false, fout: 'VERVERS_SAMENSTELLING_VERSCHILT' };
      }
      nulBijdragen.push(r.antwoord.bijdrage);
    }
    const besluitId = berekenVerversingBesluitId(nulBijdragen);

    for (let idx = 1; idx <= groep.totaal; idx++) {
      const kn = groep.knooppuntPerDeelnemerIndex[idx];
      const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
        actie: 'ververs_voorbereiden',
        setId: groep.setId,
        bijdragen: nulBijdragen,
        mandaat: groep.mandatenPerKnooppuntId[kn.knooppuntId],
      });
      if (!r.antwoord.ok || r.antwoord.actie !== 'ververs_voorbereid' || r.antwoord.besluitId !== besluitId) {
        for (let terug = 1; terug < idx; terug++) {
          const knTerug = groep.knooppuntPerDeelnemerIndex[terug];
          await this.netwerkClient.roepOpdrachtAan(knTerug.knooppuntId, {
            actie: 'ververs_afronden',
            setId: groep.setId,
            besluitId,
            besluit: 'afbreken',
            mandaat: groep.mandatenPerKnooppuntId[knTerug.knooppuntId],
          });
        }
        return { ok: false, fout: !r.antwoord.ok ? r.antwoord.fout : 'VOORBEREIDING_MISLUKT' };
      }
    }
    return { ok: true, voorbereiding: { besluitId, nulBijdragen } };
  }

  /**
   * Фаза 2 двофазного переходу епохи: надсилає одне й те саме рішення всім вузлам і повторює його для тих,
   * хто не відповів (втрата зв'язку, перезапуск). Після першого `bevestig` скасування більше не надсилається:
   * вузли з підготовкою на диску завершать перехід під час повтору, тож група не розходиться між епохами.
   * Якщо після всіх спроб хтось лишився, повертається `AFRONDING_ONVOLTOOID` з переліком — виклик можна
   * безпечно повторити пізніше з тією самою підготовкою.
   */
  async rondEpocheVerversingAfOpNetwerk(opties: {
    groep: KlimopDrempelGroepManifest;
    voorbereiding: KlimopEpocheVoorbereiding;
    besluit: 'bevestig' | 'afbreken';
    maxPogingen?: number;
    wachtMs?: number;
  }): Promise<
    | { ok: true; vernieuwdeGroep: KlimopDrempelGroepManifest; afgerondeActie: 'bevestig' | 'afbreken' }
    | { ok: false; fout: string; openstaandeIndexen?: number[]; laatsteFout?: string }
  > {
    const { groep, voorbereiding, besluit } = opties;
    const maxPogingen = Math.max(1, opties.maxPogingen ?? 3);
    const wachtMs = Math.max(0, opties.wachtMs ?? 200);
    let openstaand = Array.from({ length: groep.totaal }, (_, i) => i + 1);
    let laatsteFout = 'AFRONDING_ONVOLTOOID';

    for (let poging = 1; poging <= maxPogingen && openstaand.length > 0; poging++) {
      const nogOpen: number[] = [];
      for (const idx of openstaand) {
        const kn = groep.knooppuntPerDeelnemerIndex[idx];
        const r = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
          actie: 'ververs_afronden',
          setId: groep.setId,
          besluitId: voorbereiding.besluitId,
          besluit,
          mandaat: groep.mandatenPerKnooppuntId[kn.knooppuntId],
        });
        if (r.antwoord.ok && r.antwoord.actie === 'ververs_afgerond' && r.antwoord.besluitId === voorbereiding.besluitId) continue;
        if (!r.antwoord.ok && r.antwoord.fout === 'VERVERSING_REEDS_ANDERS_AFGEROND') {
          return { ok: false, fout: 'VERVERSING_REEDS_ANDERS_AFGEROND', openstaandeIndexen: [idx] };
        }
        laatsteFout = !r.antwoord.ok ? r.antwoord.fout : 'AFRONDING_MISLUKT';
        nogOpen.push(idx);
      }
      openstaand = nogOpen;
      if (openstaand.length > 0 && poging < maxPogingen && wachtMs > 0) {
        await new Promise((klaar) => setTimeout(klaar, wachtMs * poging));
      }
    }

    if (openstaand.length > 0) {
      return { ok: false, fout: 'AFRONDING_ONVOLTOOID', openstaandeIndexen: openstaand, laatsteFout };
    }
    if (besluit === 'afbreken') {
      return { ok: true, vernieuwdeGroep: groep, afgerondeActie: 'afbreken' };
    }
    return {
      ok: true,
      vernieuwdeGroep: {
        ...groep,
        epoche: groep.epoche + 1,
        deelnemerPubliekeSleutelsHex: werkDeelnemerPubliekeSleutelsBijNaVerversing(
          groep.deelnemerPubliekeSleutelsHex,
          voorbereiding.nulBijdragen.map((b) => ({
            schema: 1 as const,
            setId: b.setId,
            vanEpoche: b.vanEpoche,
            naarEpoche: b.naarEpoche,
            afzenderIndex: b.afzenderIndex,
            drempel: b.drempel,
            totaal: b.totaal,
            nulToezeggingenVanaf1Hex: b.nulToezeggingenVanaf1Hex,
            subdelenPerOntvanger: {},
          })),
        ),
      },
      afgerondeActie: 'bevestig',
    };
  }

  /**
   * Проводить двофазне епохальне проактивне оновлення часток між живими вузлами без зміни секрету
   * і без зміни публічного ключа групи (з підтримкою безпечного відкочування при `simuleerAfbrekingVoorBevestiging`).
   */
  async verversEpocheOpNetwerk(opties: {
    groep: KlimopDrempelGroepManifest;
    simuleerAfbrekingVoorBevestiging?: boolean;
    maxPogingen?: number;
    wachtMs?: number;
  }): Promise<
    | { ok: true; vernieuwdeGroep: KlimopDrempelGroepManifest; afgerondeActie: 'bevestig' | 'afbreken' }
    | { ok: false; fout: string; openstaandeIndexen?: number[] }
  > {
    const vb = await this.bereidEpocheVerversingVoorOpNetwerk({ groep: opties.groep });
    if (!vb.ok) return vb;
    return this.rondEpocheVerversingAfOpNetwerk({
      groep: opties.groep,
      voorbereiding: vb.voorbereiding,
      besluit: opties.simuleerAfbrekingVoorBevestiging ? 'afbreken' : 'bevestig',
      maxPogingen: opties.maxPogingen,
      wachtMs: opties.wachtMs,
    });
  }
}
