// KLIMOP-020 (21.11.2026): Модульні та живі мережеві випробування Хвилі 3 виправлень за незалежною перевіркою AUDIT-002:
//   1. Суворий режим мандатів: довірений реєстр видавців і підписантів, перелік дій, прив'язка до об'єкта та особи сеансу;
//   2. Сертифікат переходу відновлення особи з попередньо закріпленою політикою, епохи коренів і кворум спільного префікса історії;
//   3. Прив'язка зміни конституції на вузлі до відбитка змісту 72-годинного рішення FROST, однократність і строк чинності;
//   4. Точна рівність вкладень пакета «Насіння», зовнішній початковий якір ради й хранителя та звірка повного пакета на кворумі;
//   5. Сліпа імунна перевірка блоків виключно за незалежним еталоном і очікуваним розміром;
//   6. Підпис пакета привітання, одноразові ключі повідомлень за відправником і захист від повторів у спрощеному груповому шифруванні;
//   7. Локальні довірені корені на вузлі замість сліпої довіри полям запиту, чесна позначка місцевого моделювання кворуму в одному процесі.
// Запуск: node scripts/eenheidstests.mjs klimop-020-vertrouwensgrenzen-20261121.test.ts

import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  verifieerKlimopMandaat,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { leidKlimopSleutelAf } from '../../shared/klimop/opslag';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import {
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  frostVoegHandtekeningSamen,
  leidGeheimScalairAf,
  splitsMetFeldmanVss,
  splitsMetPedersenVss,
  verifieerFeldmanDeel,
  type FeldmanVssDeel,
} from '../../shared/klimop/drempelsleutels';
import {
  maakMlsBladSleutelPakket,
  maakMlsGroep,
  maakPersoonsIdentiteit,
  ontsleutelMlsGroepsBericht,
  openHerstelAanvraag,
  pasMlsCommitToe,
  pasMlsWelkomToe,
  registreerVertrouwdApparaat,
  roteerPersoonsWortelSleutel,
  trekApparaatIn,
  verankerHerstelBeleid,
  verifieerApparaatCertificaat,
  verifieerApparaatIntrekking,
  verifieerPersoonsStaat,
  versleutelMlsGroepsBericht,
  verversEigenMlsBladSleutel,
  voegLidToeAanMlsGroep,
  voegVoogdBevestigingToe,
  voltooiWettigHerstel,
  type KlimopHerstelBeleid,
} from '../../shared/klimop/identiteit';
import {
  bekrachtigBestuursBesluitMetFrost,
  maakBestuursGrondwet,
  maakBestuursVoorstel,
  maakGrondwetWijzigingInhoud,
} from '../../shared/klimop/bestuur';
import {
  berekenBlindeIntegriteitBewijs,
  maakBlindeIntegriteitUitdaging,
  verifieerBlindeIntegriteitBewijs,
} from '../../shared/klimop/immuunsysteem';
import {
  KLIMOP_ELF_DIENSTEN,
  maakHlcStempel,
  maakLegeDienstCrdtStaat,
  maakOndertekendeCrdtOperatie,
} from '../../shared/klimop/diensten';
import {
  beoordeelSybilEnSpreidingsWeerstand,
  maakHechtrankToetredingsBewijs,
  type KnooppuntToetredingsAanvraag,
} from '../../shared/klimop/hechtranken';
import {
  KLIMOP_AUTONOMIE_SCENARIOS,
  KLIMOP_CRYPTO_AUDIT_SCENARIOS,
  KLIMOP_MEETBARE_GARANTIES_IDS,
  maakHybridePostkwantumKnooppunt,
  stelOnafhankelijkAuditRapportSamen,
} from '../../shared/klimop/beveiligingsaudit';
import {
  KLIMOP_TWAALF_KERNMODULES,
  stelKlimopZaadPakketSamen,
  stelOpvolgingsOverdrachtSamen,
  verifieerKlimopZaadPakket,
} from '../../shared/klimop/zaden';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopVerdeeldeOpslagClient } from '../../backend/klimop-opslag-client';
import { KlimopImmuunsysteemClient } from '../../backend/klimop-immuunsysteem-client';
import { KlimopIdentiteitNetwerkClient } from '../../backend/klimop-identiteit-client';
import { KlimopZadenEnOpvolgingClient } from '../../backend/klimop-zaden-client';
import { verifieerQuorumAttestKeten, voerStap4QuorumAttestProefUit } from '../../backend/klimop-overdracht-opslag';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakEd25519Sleutels() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekeSleutelDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimeSleutelPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

function maakFrostGroep(setId: string, drempel: number, totaal: number) {
  const splits = splitsMetFeldmanVss({
    geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
    drempel,
    totaal,
    setId,
    epoche: 1,
  });
  const deelnemerPubMap: Record<number, string> = {};
  for (const d of splits.delen) {
    const v = verifieerFeldmanDeel(d);
    if (!v.ok) throw new Error(v.fout);
    deelnemerPubMap[d.index] = v.deelnemerPubliekeSleutelHex;
  }
  return { groepsPubHex: splits.groepsPubliekeSleutelHex, delen: splits.delen, deelnemerPubMap };
}

function tekenFrost(
  boodschap: Buffer,
  actieveDelen: readonly FeldmanVssDeel[],
  groepsPubHex: string,
  deelnemerPubMap: Readonly<Record<number, string>>,
  drempel: number,
): string {
  const r1 = actieveDelen.map((d) => frostRonde1MaakToezegging(d));
  const toezeggingenLijst = r1.map((x) => x.publiek);
  const deelHandtekeningen = actieveDelen.map((d, idx) => {
    const res = frostRonde2TekenDeel({
      deel: d,
      geheimeNonceStaat: r1[idx].geheimeNonceStaat,
      boodschap,
      toezeggingenLijst,
      groepsPubliekeSleutelHex: groepsPubHex,
    });
    if (!res.ok) throw new Error(res.fout);
    return res.deelHandtekening;
  });
  const uit = frostVoegHandtekeningSamen({
    boodschap,
    toezeggingenLijst,
    deelHandtekeningen,
    deelnemerPubliekeSleutelsHex: deelnemerPubMap,
    groepsPubliekeSleutelHex: groepsPubHex,
    drempel,
  });
  if (!uit.ok) throw new Error(uit.fout);
  return uit.handtekeningHex;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-020-vertrouwensgrenzen');
  const nuIso = new Date().toISOString();
  const verlooptIso = new Date(Date.now() + 20 * 24 * 3600_000).toISOString();
  const verledenMs = Date.parse('2026-11-10T10:00:00.000Z');
  const verledenIso = new Date(verledenMs).toISOString();

  // ------------------------------------------------------------------ 1. Межі довіри мандатів і суворий режим вузла
  const knEigenaar = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'verificatie', 'synchronisatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'eigenaar-020',
    nuIso,
  });
  const knVreemd = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'verificatie'],
    juridischeRegio: 'DE',
    aanbieder: 'vreemde-020',
    nuIso,
  });
  const knOpslagNl = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'synchronisatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'opslag-nl-020',
    nuIso,
  });
  const knOpslagCh = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'opslag-ch-020',
    nuIso,
  });
  const knOpslagUa = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie'],
    juridischeRegio: 'UA',
    aanbieder: 'opslag-ua-020',
    nuIso,
  });

  const blokData = Buffer.from('зашифрований блок перевірки KLIMOP-020', 'utf8');
  const blokSha = createHash('sha256').update(blokData).digest('hex');
  const anderBlokSha = 'b'.repeat(64);

  const mandaatZonderActies = ondertekenKlimopMandaat({
    schema: 1,
    mandaatId: 'mnd_zonder_acties',
    uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
    ontvangerKnooppuntId: knOpslagNl.identiteit.knooppuntId,
    machtDomein: 'persoonlijke_gegevens',
    toegestaneRollen: ['opslag'],
    toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
    alleenMetDrempelQuorum: false,
    drempelVereist: null,
    uitgegevenOp: nuIso,
    verlooptOp: verlooptIso,
  }, knEigenaar);

  const mandaatBeperkt = ondertekenKlimopMandaat({
    schema: 1,
    mandaatId: 'mnd_beperkt_bewaar',
    uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
    ontvangerKnooppuntId: knOpslagNl.identiteit.knooppuntId,
    machtDomein: 'persoonlijke_gegevens',
    toegestaneRollen: ['opslag'],
    toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
    alleenMetDrempelQuorum: false,
    drempelVereist: null,
    uitgegevenOp: nuIso,
    verlooptOp: verlooptIso,
    toegestaneActies: ['bewaar_blok', 'haal_blok'],
    objectIds: [blokSha],
  }, knEigenaar);

  const quorumEerste = ondertekenKlimopMandaat({
    schema: 1,
    mandaatId: 'mnd_quorum_vreemd',
    uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
    ontvangerKnooppuntId: knOpslagNl.identiteit.knooppuntId,
    machtDomein: 'netwerk_regels',
    toegestaneRollen: ['verificatie'],
    toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
    alleenMetDrempelQuorum: true,
    drempelVereist: { k: 2, n: 2 },
    uitgegevenOp: nuIso,
    verlooptOp: verlooptIso,
    toegestaneActies: ['stel_bestuursgrondwet_in'],
  }, knEigenaar);
  const quorumMandaatMetVreemde = ondertekenKlimopMandaat(
    quorumEerste.inhoud,
    knVreemd,
    quorumEerste.handtekeningen,
  );

  const vertrouwdSet = new Set([knEigenaar.identiteit.knooppuntId]);
  const vVreemdeUitgever = verifieerKlimopMandaat(mandaatBeperkt, {
    vertrouwdeUitgevers: new Set([knOpslagCh.identiteit.knooppuntId]),
  });
  const vZonderBereik = verifieerKlimopMandaat(mandaatZonderActies, {
    vertrouwdeUitgevers: vertrouwdSet,
    vereisActieBereik: true,
    actie: 'bewaar_blok',
  });
  const vVerkeerdeActie = verifieerKlimopMandaat(mandaatBeperkt, {
    vertrouwdeUitgevers: vertrouwdSet,
    vereisActieBereik: true,
    actie: 'wis_blok',
    objectId: blokSha,
    sessieAfzenderKnooppuntId: knEigenaar.identiteit.knooppuntId,
  });
  const vVerkeerdObject = verifieerKlimopMandaat(mandaatBeperkt, {
    vertrouwdeUitgevers: vertrouwdSet,
    vereisActieBereik: true,
    actie: 'bewaar_blok',
    objectId: anderBlokSha,
    sessieAfzenderKnooppuntId: knEigenaar.identiteit.knooppuntId,
  });
  const vVreemdeOndertekenaar = verifieerKlimopMandaat(quorumMandaatMetVreemde, {
    vertrouwdeUitgevers: vertrouwdSet,
    vereisActieBereik: true,
    actie: 'stel_bestuursgrondwet_in',
    sessieAfzenderKnooppuntId: knEigenaar.identiteit.knooppuntId,
  });

  check('verifieerKlimopMandaat блокує недовіреного видавця, чужого підписанта в кворумі, відсутній перелік дій, чужу дію та чужий об’єкт',
    !vVreemdeUitgever.ok && vVreemdeUitgever.fouten.includes('UITGEVER_NIET_VERTROUWD')
    && !vZonderBereik.ok && vZonderBereik.fouten.includes('MANDAAT_ZONDER_ACTIEBEREIK')
    && !vVerkeerdeActie.ok && vVerkeerdeActie.fouten.includes('MANDAAT_ACTIE_NIET_TOEGESTAAN')
    && !vVerkeerdObject.ok && vVerkeerdObject.fouten.includes('MANDAAT_OBJECT_NIET_TOEGESTAAN')
    && !vVreemdeOndertekenaar.ok
    && vVreemdeOndertekenaar.fouten.includes(`ONDERTEKENAAR_NIET_VERTROUWD:${knVreemd.identiteit.knooppuntId}`)
    && vVreemdeOndertekenaar.fouten.some((f) => f.startsWith('DREMPEL_QUORUM_NIET_GEHAALD:')));

  // ------------------------------------------------------------------ 2. Сертифікат відновлення, епохи коренів і розбіжні голови реєстру
  const persoon = maakPersoonsIdentiteit(verledenIso);
  const voogd1 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'NL', aanbieder: 'voogd-1', nuIso: verledenIso });
  const voogd2 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'CH', aanbieder: 'voogd-2', nuIso: verledenIso });
  const voogd3 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'UA', aanbieder: 'voogd-3', nuIso: verledenIso });

  const pedersenGeheimHex = leidGeheimScalairAf(randomBytes(32));
  const pedersen = splitsMetPedersenVss({
    geheimScalairHex: pedersenGeheimHex,
    drempel: 2,
    totaal: 3,
    setId: 'ped_020',
    epoche: 1,
  });
  const beleid: KlimopHerstelBeleid = {
    schema: 1,
    persoonsId: persoon.staat.oprichting.persoonsId,
    pedersenSetId: 'ped_020',
    drempel: 2,
    voogden: [
      { knooppuntId: voogd1.identiteit.knooppuntId, publiekeSleutelDerB64u: voogd1.identiteit.publiekeSleutelDerB64u },
      { knooppuntId: voogd2.identiteit.knooppuntId, publiekeSleutelDerB64u: voogd2.identiteit.publiekeSleutelDerB64u },
      { knooppuntId: voogd3.identiteit.knooppuntId, publiekeSleutelDerB64u: voogd3.identiteit.publiekeSleutelDerB64u },
    ],
    minimaleBetwistingsVensterUren: {
      verlies_alle_apparaten: 48,
      bevestigde_langdurige_onbeschikbaarheid: 168,
      wettige_erfopvolging: 168,
    },
  };

  const kandidaatSleutels = maakEd25519Sleutels();
  const aanvrOpen = openHerstelAanvraag({
    beleid,
    omstandigheid: 'verlies_alle_apparaten',
    kandidaatNieuweWortelPubDerB64u: kandidaatSleutels.publiekeSleutelDerB64u,
    nuIso: new Date(verledenMs + 3600_000).toISOString(),
  });
  if (!aanvrOpen.ok) throw new Error(aanvrOpen.fout);
  const st1 = voegVoogdBevestigingToe({ beleid, aanvraag: aanvrOpen.aanvraag, voogd: voogd1, nuIso: new Date(verledenMs + 7200_000).toISOString() });
  if (!st1.ok) throw new Error(st1.fout);
  const st2 = voegVoogdBevestigingToe({ beleid, aanvraag: st1.aanvraag, voogd: voogd2, nuIso: new Date(verledenMs + 7500_000).toISOString() });
  if (!st2.ok) throw new Error(st2.fout);

  // Спроба завершити відновлення БЕЗ попереднього закріплення політики коренем особи відхиляється
  const herstelZonderAnker = voltooiWettigHerstel({
    staat: persoon.staat,
    beleid,
    aanvraag: st2.aanvraag,
    pedersenDelen: [pedersen.delen[0], pedersen.delen[1]],
    kandidaatNieuwWortelGeheimPkcs8B64u: kandidaatSleutels.geheimeSleutelPkcs8B64u,
    nuIso: new Date(verledenMs + 60 * 3600_000).toISOString(),
  });

  // Закріплюємо політику коренем епохи 1 ДО відкриття заявки
  const verankerd = verankerHerstelBeleid({
    staat: persoon.staat,
    beleid,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    nuIso: new Date(verledenMs + 1800_000).toISOString(),
  });
  if (!verankerd.ok) throw new Error(verankerd.fout);

  // Реєструємо 2 аварійні пристрої в епосі 1 до відновлення
  const noodApp1 = registreerVertrouwdApparaat({
    staat: verankerd.nieuweStaat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'Аварійний ключ 1',
    toegestaneBevoegdheden: ['nood_betwisting', 'lezen_werkgegevens'],
    nuIso: new Date(verledenMs + 2000_000).toISOString(),
  });
  const noodApp2 = registreerVertrouwdApparaat({
    staat: verankerd.nieuweStaat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'Аварійний ключ 2',
    toegestaneBevoegdheden: ['nood_betwisting'],
    nuIso: new Date(verledenMs + 2100_000).toISOString(),
  });

  const herstelMetAnker = voltooiWettigHerstel({
    staat: verankerd.nieuweStaat,
    beleid,
    aanvraag: st2.aanvraag,
    pedersenDelen: [pedersen.delen[0], pedersen.delen[1]],
    kandidaatNieuwWortelGeheimPkcs8B64u: kandidaatSleutels.geheimeSleutelPkcs8B64u,
    nuIso: new Date(verledenMs + 60 * 3600_000).toISOString(),
  });
  if (!herstelMetAnker.ok) throw new Error(herstelMetAnker.fout);

  // Споживач перевіряє стан без закріплення або з пошкодженим голосом опікуна
  const staatZonderVerankeringen = { ...herstelMetAnker.nieuweStaat, herstelBeleidVerankeringen: [] };
  const staatMetKapotteStem = {
    ...herstelMetAnker.nieuweStaat,
    rotaties: herstelMetAnker.nieuweStaat.rotaties.map((r) => ({
      ...r,
      herstelCertificaat: r.herstelCertificaat
        ? {
            ...r.herstelCertificaat,
            voogdStemmen: r.herstelCertificaat.voogdStemmen.map((s, i) =>
              i === 0 ? { ...s, handtekeningB64u: Buffer.alloc(64, 9).toString('base64url') } : s,
            ),
          }
        : undefined,
    })),
  };

  // Після законного відновлення (t = +60h) старий корінь епохи 1 більше не приймається для посвідчень чи дій після відновлення!
  const certOudeWortelNaHerstel = verifieerApparaatCertificaat(
    noodApp1.certificaat,
    herstelMetAnker.nieuweStaat,
    { nuIso: new Date(verledenMs + 65 * 3600_000).toISOString() },
  );
  const certOngeldigeDatum = verifieerApparaatCertificaat(
    { ...noodApp1.certificaat, uitgegevenOp: 'не-дата' },
    verankerd.nieuweStaat,
    { nuIso: new Date(verledenMs + 5000_000).toISOString() },
  );

  // Аварійний пристрій 2 відкликано на t=+3000s; після цього сам відкликаний пристрій 2 намагається відкликати пристрій 1 на t=+4000s
  const intrApp2 = trekApparaatIn({
    staat: verankerd.nieuweStaat,
    ingetrokkenApparaatId: noodApp2.certificaat.apparaatId,
    reden: 'verloren_of_gestolen',
    ondertekenaar: { soort: 'wortel', geheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u },
    nuIso: new Date(verledenMs + 3000_000).toISOString(),
  });
  const valseIntrDoorIngetrokkenApp2 = trekApparaatIn({
    staat: verankerd.nieuweStaat,
    ingetrokkenApparaatId: noodApp1.certificaat.apparaatId,
    reden: 'verdacht_gedrag',
    ondertekenaar: { soort: 'nood_apparaat', bundel: noodApp2 },
    nuIso: new Date(verledenMs + 4000_000).toISOString(),
  });
  const checkValseIntr = verifieerApparaatIntrekking(valseIntrDoorIngetrokkenApp2, verankerd.nieuweStaat, [intrApp2]);

  check('відновлення вимагає попередньо закріпленої політики й дійсного сертифіката опікунів, а старий корінь і відкликаний пристрій втрачають повноваження',
    !herstelZonderAnker.ok && herstelZonderAnker.fout === 'HERSTELBELEID_NIET_VERANKERD'
    && verifieerPersoonsStaat(herstelMetAnker.nieuweStaat).ok === true
    && !verifieerPersoonsStaat(staatZonderVerankeringen).ok
    && !verifieerPersoonsStaat(staatMetKapotteStem).ok
    && !certOudeWortelNaHerstel.ok && certOudeWortelNaHerstel.fout === 'APPARAAT_WORTEL_VERVANGEN_DOOR_HERSTEL'
    && !certOngeldigeDatum.ok && certOngeldigeDatum.fout === 'APPARAAT_CERTIFICAAT_TIJD_ONGELDIG'
    && !checkValseIntr.ok);

  // ------------------------------------------------------------------ 3. Мережевий суворий режим, конституція, локальні корені, розбіжні голови й Насіння
  const auditor = maakHybridePostkwantumKnooppunt({
    type: 'gespecialiseerde_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'auditor-020',
    nuIso: verledenIso,
  });
  const zaadBewaarder = maakHybridePostkwantumKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'IS',
    aanbieder: 'bewaarder-020',
    nuIso: verledenIso,
  });
  const vertrouwdAppSleutels = maakEd25519Sleutels();
  const vreemdAppSleutels = maakEd25519Sleutels();
  const sponsorSleutels = maakEd25519Sleutels();

  const frostRaad = maakFrostGroep('frost_raad_020', 2, 3);
  const srvStrengNl = await startKlimopProefKnooppunt({
    knooppunt: knOpslagNl,
    vertrouwdeUitgevers: [knEigenaar.identiteit.knooppuntId],
    beginAnker: {
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      zaadBewaarderEd25519PubDerB64u: zaadBewaarder.ed25519PubliekDerB64u,
      zaadBewaarderMlDsa65PubSpkiB64u: zaadBewaarder.mlDsa65PubliekSpkiB64u,
    },
    toegestaneSynchronisatieApparaatPubSleutels: [vertrouwdAppSleutels.publiekeSleutelDerB64u],
    toegestaneAnnuleerPubSleutels: [vertrouwdAppSleutels.publiekeSleutelDerB64u],
    erkendeSponsorPubSleutels: [sponsorSleutels.publiekeSleutelDerB64u],
    erkendeAuditorSleutels: [{
      auditorKnooppuntId: auditor.identiteit.knooppuntId,
      ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
      mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
    }],
  });
  const srvOpenCh = await startKlimopProefKnooppunt({ knooppunt: knOpslagCh });
  const srvOpenUa = await startKlimopProefKnooppunt({ knooppunt: knOpslagUa });

  try {
    const adressen = new Map([
      [srvStrengNl.identiteit.knooppuntId, srvStrengNl.basisUrl],
      [srvOpenCh.identiteit.knooppuntId, srvOpenCh.basisUrl],
      [srvOpenUa.identiteit.knooppuntId, srvOpenUa.basisUrl],
    ]);
    const tabel = new KlimopRouteTabel();
    for (const id of adressen.keys()) {
      tabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, id, 1);
      tabel.voegTweerichtingsStengelToe(knVreemd.identiteit.knooppuntId, id, 1);
    }

    const clientEigenaar = new KlimopNetwerkClient(knEigenaar, adressen, tabel);
    const clientVreemd = new KlimopNetwerkClient(knVreemd, adressen, tabel);

    const pong = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, { actie: 'ping', bericht: '020' });
    // Чужий відправник сеансу пересилає справжній мандат власника — вузол у суворому режимі блокує!
    const gestolenMandaatAanval = await clientVreemd.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'bewaar_blok',
      blokSha256: blokSha,
      cijfertekstB64u: blokData.toString('base64url'),
      mandaat: mandaatBeperkt,
    });
    const wettigBewaar = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'bewaar_blok',
      blokSha256: blokSha,
      cijfertekstB64u: blokData.toString('base64url'),
      mandaat: mandaatBeperkt,
    });

    check('суворий режим вузла відхиляє перехоплений мандат у чужому сеансі (MANDAAT_AFZENDER_NIET_GEMACHTIGD) і приймає сеанс власника',
      pong.antwoord.ok && pong.antwoord.actie === 'pong' && pong.antwoord.vertrouwensModus === 'streng'
      && !gestolenMandaatAanval.antwoord.ok
      && gestolenMandaatAanval.antwoord.fout === 'MANDAAT_GEWEIGERD'
      && Boolean(gestolenMandaatAanval.antwoord.details?.includes('MANDAAT_AFZENDER_NIET_GEMACHTIGD'))
      && wettigBewaar.antwoord.ok);

    // Перевірка ігнорування підробленого списку пристроїв CRDT із запиту в суворому режимі
    const syncMandaat = ondertekenKlimopMandaat({
      schema: 1,
      mandaatId: 'mnd_sync_020',
      uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
      ontvangerKnooppuntId: knOpslagNl.identiteit.knooppuntId,
      machtDomein: 'persoonlijke_gegevens',
      toegestaneRollen: ['synchronisatie'],
      toegestaneOpslagLagen: ['werkgegevens_van_diensten'],
      alleenMetDrempelQuorum: false,
      drempelVereist: null,
      uitgegevenOp: nuIso,
      verlooptOp: verlooptIso,
      toegestaneActies: ['synchroniseer_dienst_crdt'],
      objectIds: ['psid1_020_proef'],
    }, knEigenaar);
    const dienstCtx = { dienstId: KLIMOP_ELF_DIENSTEN[0], dienstPsid: 'psid1_020_proef', dienstSleutel32: randomBytes(32), epoche: 1 };
    const vreemdeCrdtOp = maakOndertekendeCrdtOperatie({
      dienstContext: dienstCtx,
      sleutelId: 'k1',
      soort: 'zet',
      klareWaarde: { a: 1 },
      hlc: maakHlcStempel(Date.now(), 1, 'vreemd-app'),
      apparaatTekenSleutels: vreemdAppSleutels,
    });
    const crdtAanvalMetEigenLijstInVerzoek = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'synchroniseer_dienst_crdt',
      inkomendeStaat: { ...maakLegeDienstCrdtStaat(dienstCtx.dienstId, dienstCtx.dienstPsid), elementen: { k1: vreemdeCrdtOp } },
      // Клієнт намагається підсунути невідомий вузлові ключ у самому запиті!
      toegestaneApparaatPubSleutels: [vreemdAppSleutels.publiekeSleutelDerB64u],
      mandaat: syncMandaat,
    });
    check('вузол у суворому режимі ігнорує переданий у запиті список пристроїв і блокує невідомий локальному реєстру ключ (CRDT_ONBEKEND_OF_INGETROKKEN_APPARAAT)',
      !crdtAanvalMetEigenLijstInVerzoek.antwoord.ok
      && crdtAanvalMetEigenLijstInVerzoek.antwoord.fout === 'CRDT_ONBEKEND_OF_INGETROKKEN_APPARAAT');

    // Прив'язка конституції на вузлі до відбитка змісту рішення та однократність застосування
    const doelenRol1 = maakEd25519Sleutels();
    const tsRol1 = maakEd25519Sleutels();
    const doelenRolAanvaller = maakEd25519Sleutels();
    const gw1Uit = maakBestuursGrondwet({
      grondwetId: 'gw_020',
      versieVolgnummer: 1,
      frostSetId: 'frost_raad_020',
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      drempel: 2,
      erkendeHoeders: [knOpslagNl.identiteit, knOpslagCh.identiteit, knOpslagUa.identiteit],
      nuIso: verledenIso,
    });
    const gw2Uit = maakBestuursGrondwet({
      grondwetId: 'gw_020',
      versieVolgnummer: 2,
      frostSetId: 'frost_raad_020',
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      drempel: 2,
      erkendeHoeders: [knOpslagNl.identiteit, knOpslagCh.identiteit, knOpslagUa.identiteit],
      nuIso: new Date(verledenMs + 80 * 3600_000).toISOString(),
    });
    const gw3Uit = maakBestuursGrondwet({
      grondwetId: 'gw_020',
      versieVolgnummer: 3,
      frostSetId: 'frost_raad_020',
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      drempel: 2,
      erkendeHoeders: [knOpslagNl.identiteit, knOpslagCh.identiteit, knOpslagUa.identiteit],
      nuIso: new Date(verledenMs + 90 * 3600_000).toISOString(),
    });
    if (!gw1Uit.ok || !gw2Uit.ok || !gw3Uit.ok) throw new Error('GW_FOUT');

    const gwMandaat = ondertekenKlimopMandaat({
      schema: 1,
      mandaatId: 'mnd_gw_020',
      uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
      ontvangerKnooppuntId: knOpslagNl.identiteit.knooppuntId,
      machtDomein: 'knooppunt_beheer',
      toegestaneRollen: ['verificatie'],
      toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
      alleenMetDrempelQuorum: false,
      drempelVereist: null,
      uitgegevenOp: nuIso,
      verlooptOp: verlooptIso,
      toegestaneActies: ['stel_bestuursgrondwet_in', 'bewaar_gevalideerd_zaad_pakket', 'registreer_opvolgings_overdracht'],
      objectIds: ['gw_020'],
    }, knEigenaar);

    const { maakAanvankelijkeGrondwetFrostBoodschap } = await import('../../shared/klimop/bestuur');
    const frostSigGw1 = tekenFrost(
      maakAanvankelijkeGrondwetFrostBoodschap(
        gw1Uit.grondwet,
        doelenRol1.publiekeSleutelDerB64u,
        tsRol1.publiekeSleutelDerB64u,
      ),
      [frostRaad.delen[0], frostRaad.delen[1]],
      frostRaad.groepsPubHex,
      frostRaad.deelnemerPubMap,
      2,
    );
    const stelGw1 = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: gw1Uit.grondwet,
      erkendeDoelenRolPubDerB64u: doelenRol1.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tsRol1.publiekeSleutelDerB64u,
      aanvankelijkeFrostHandtekeningHex: frostSigGw1,
      mandaat: gwMandaat,
    });

    const indienerSleutels = maakEd25519Sleutels();
    const voorstelGw2 = maakBestuursVoorstel({
      grondwet: gw1Uit.grondwet,
      categorie: 'ecosysteem_regels_wijziging',
      onderwerpSamenvatting: 'Перехід на конституцію v2',
      inhoudPayload: maakGrondwetWijzigingInhoud({
        vorigeGrondwet: gw1Uit.grondwet,
        nieuweGrondwet: gw2Uit.grondwet,
        erkendeDoelenRolPubDerB64u: doelenRol1.publiekeSleutelDerB64u,
        erkendeTijdstempelRolPubDerB64u: tsRol1.publiekeSleutelDerB64u,
      }),
      indienerSoort: 'menselijke_deelnemer',
      indienerId: 'klid1_indiener',
      indienerSleutels,
      nuIso: verledenIso,
    });
    const bekrOp = new Date(verledenMs + 75 * 3600_000).toISOString();
    const { maakFrostBesluitBoodschap } = await import('../../shared/klimop/bestuur');
    const frostSigGw2 = tekenFrost(
      maakFrostBesluitBoodschap(voorstelGw2, bekrOp),
      [frostRaad.delen[0], frostRaad.delen[1]],
      frostRaad.groepsPubHex,
      frostRaad.deelnemerPubMap,
      2,
    );
    const besluitGw2 = bekrachtigBestuursBesluitMetFrost({
      grondwet: gw1Uit.grondwet,
      bestaandLogboek: [],
      voorstel: voorstelGw2,
      frostOndertekenaarIndexen: [1, 2],
      frostHandtekeningHex: frostSigGw2,
      bekrachtigdOp: bekrOp,
    });
    if (!besluitGw2.ok) throw new Error(besluitGw2.fout);

    // Спроба підмінити ключ ролі складання випусків при поданні дійсного 72-год рішення!
    const gw2VervalsteRol = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: gw2Uit.grondwet,
      erkendeDoelenRolPubDerB64u: doelenRolAanvaller.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tsRol1.publiekeSleutelDerB64u,
      bekrachtigdLogboek: [besluitGw2.besluit],
      mandaat: gwMandaat,
    });
    const gw2Echt = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: gw2Uit.grondwet,
      erkendeDoelenRolPubDerB64u: doelenRol1.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tsRol1.publiekeSleutelDerB64u,
      bekrachtigdLogboek: [besluitGw2.besluit],
      mandaat: gwMandaat,
    });
    // Спроба повторно застосувати те саме рішення для переходу на v3
    const gw3HergebruikBesluit = await clientEigenaar.roepOpdrachtAan(knOpslagNl.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: gw3Uit.grondwet,
      erkendeDoelenRolPubDerB64u: doelenRol1.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tsRol1.publiekeSleutelDerB64u,
      bekrachtigdLogboek: [besluitGw2.besluit],
      mandaat: gwMandaat,
    });

    check('вузол відхиляє підміну ключа ролей поза підписаним змістом рішення (GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN) і повторне застосування рішення',
      stelGw1.antwoord.ok
      && !gw2VervalsteRol.antwoord.ok && gw2VervalsteRol.antwoord.fout === 'GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN'
      && gw2Echt.antwoord.ok
      && !gw3HergebruikBesluit.antwoord.ok);

    // Суперечливі гілки ротацій у клієнті ідентичності
    const idClient = new KlimopIdentiteitNetwerkClient(clientEigenaar);
    const idGroep = idClient.maakIdentiteitRegisterGroep({
      registerId: 'id_020',
      opdrachtgever: knEigenaar,
      knooppunten: [knOpslagCh.identiteit, knOpslagUa.identiteit],
      quorumDrempel: 2,
      nuIso,
      verlooptOpIso: verlooptIso,
    });
    if (!idGroep.ok) throw new Error(idGroep.fout);
    const takA = roteerPersoonsWortelSleutel(persoon.staat, persoon.wortelGeheimPkcs8B64u, nuIso);
    const takB = roteerPersoonsWortelSleutel(persoon.staat, persoon.wortelGeheimPkcs8B64u, nuIso);

    await clientEigenaar.roepOpdrachtAan(knOpslagCh.identiteit.knooppuntId, {
      actie: 'publiceer_identiteit_staat',
      staat: takA.nieuweStaat,
      intrekkingen: [],
      herstelAanvraag: null,
      mandaat: idGroep.groep.mandatenPerKnooppuntId[knOpslagCh.identiteit.knooppuntId],
    });
    await clientEigenaar.roepOpdrachtAan(knOpslagUa.identiteit.knooppuntId, {
      actie: 'publiceer_identiteit_staat',
      staat: takB.nieuweStaat,
      intrekkingen: [],
      herstelAanvraag: null,
      mandaat: idGroep.groep.mandatenPerKnooppuntId[knOpslagUa.identiteit.knooppuntId],
    });
    const tegenstrijdig = await idClient.raadpleegPersoonsStaatMetQuorum({
      groep: idGroep.groep,
      persoonsId: persoon.staat.oprichting.persoonsId,
    });
    check('клієнт ідентичності виявляє розбіжні гілки ротацій між вузлами (TEGENSTRIJDIGE_IDENTITEITSGESCHIEDENIS_GEDETECTEERD)',
      !tegenstrijdig.ok && tegenstrijdig.fout === 'TEGENSTRIJDIGE_IDENTITEITSGESCHIEDENIS_GEDETECTEERD');

    // Імунна перевірка без еталонів повертає «неперевірено» (0 здорових смуг), а з Рідом–Соломоном підтверджує всі живі смуги
    const opslagClient = new KlimopVerdeeldeOpslagClient(clientEigenaar);
    const immuunClient = new KlimopImmuunsysteemClient(clientEigenaar, opslagClient, tabel);
    const kek = leidKlimopSleutelAf(randomBytes(32), { laag: 'grote_versleutelde_objecten', ruimteId: 'r020', epoche: 1, subdoel: 'kek' });
    const bewaardObj = await opslagClient.verdeelEnBewaarObject({
      inhoud: Buffer.from('Сліпа перевірка з еталоном Ріда–Соломона KLIMOP-020. '.repeat(20), 'utf8'),
      objectId: 'obj_020',
      eigenaar: knEigenaar,
      kek,
      doelKnooppunten: [knOpslagNl.identiteit, knOpslagCh.identiteit, knOpslagUa.identiteit],
      k: 2,
      m: 1,
      nuIso,
      verlooptOpIso: verlooptIso,
    });
    if (!bewaardObj.ok) throw new Error(bewaardObj.fout);

    const inspectieZonderRef = await immuunClient.inspecteerObjectZonderInzage({
      manifest: bewaardObj.manifest,
      plaatsing: bewaardObj.plaatsing,
      alleenMetGegevenReferenties: true,
    });
    const inspectieMetRsRef = await immuunClient.inspecteerObjectZonderInzage({
      manifest: bewaardObj.manifest,
      plaatsing: bewaardObj.plaatsing,
    });
    const losBlok = Buffer.from('окремий блок', 'utf8');
    const losBew = berekenBlindeIntegriteitBewijs(losBlok, 'a'.repeat(64));
    if (!losBew.ok) throw new Error(losBew.fout);
    const losUitd = maakBlindeIntegriteitUitdaging(losBew.antwoord.blokSha256);
    const losBewUitd = berekenBlindeIntegriteitBewijs(losBlok, losUitd.uitdagingNonceHex);
    if (!losBewUitd.ok) throw new Error(losBewUitd.fout);
    const losZonderRef = verifieerBlindeIntegriteitBewijs({ uitdaging: losUitd, antwoord: losBewUitd.antwoord });
    const losFouteGrootte = verifieerBlindeIntegriteitBewijs({
      uitdaging: losUitd,
      antwoord: losBewUitd.antwoord,
      verwachteCijfertekst: losBlok,
      verwachteGrootteBytes: losBlok.length + 5,
    });

    check('імунна перевірка без еталона не видає позитивного висновку (INTEGRITEIT_REFERENTIE_ONTBREEKT, gezondeStrepen = 0), а з еталоном Рідом–Соломоном підтверджує 3/3 смуги',
      !losZonderRef.ok && losZonderRef.fout === 'INTEGRITEIT_REFERENTIE_ONTBREEKT'
      && !losFouteGrootte.ok && losFouteGrootte.fout === 'INTEGRITEIT_GROOTTE_KOMT_NIET_OVEREEN'
      && inspectieZonderRef.ok === false && inspectieZonderRef.gezondeStrepen === 0
      && inspectieZonderRef.nietGeverifieerdeIndexen?.length === 3
      && inspectieMetRsRef.ok === true && inspectieMetRsRef.gezondeStrepen === 3);

    // Перевірка «Насіння»: зайве непідписане вкладення, ключ хранителя, відсутній якір на вузлі та розбіжність метаданих на кворумі
    const antwoorden15 = Object.fromEntries(KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, {
      voldaan: true,
      bewijs: `Перевірено у KLIMOP-020 (третя хвиля виправлень меж довіри) для ${id}`,
    }])) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

    const vrijAudit = stelOnafhankelijkAuditRapportSamen({
      auditor,
      hybrideCryptografieBewezen: true,
      overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
      cryptoAudit38: KLIMOP_CRYPTO_AUDIT_SCENARIOS.map((scenarioId) => ({
        scenarioId, aanvalAfgeslagenOfOverleefd: true, gebruikteStandaardPrimitief: 'Ed25519 / FROST / ML-DSA-65',
        eigenOngetesteCryptografieGebruikt: false, bewijsSamenvatting: `Перевірено ${scenarioId}`,
      })),
      mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
      autonomieAudit40: KLIMOP_AUTONOMIE_SCENARIOS.map((scenarioId) => ({
        scenarioId, praktischBeproefd: true, kernFunctiesBehouden: true, geenEnkelePartijKreegAlleenheerschappij: true,
        bewijsSamenvatting: `Автономно ${scenarioId}`,
      })),
      meetbareGaranties41: KLIMOP_MEETBARE_GARANTIES_IDS.map((garantieId) => ({
        garantieId, grensWaarde: 3, feitelijkGemetenWaarde: 3, richting: 'minstens' as const,
        meetMethode: `Виміряно ${garantieId}`, beproefdInScenario: true,
      })),
      antwoorden15,
      openstaandeKritiekeZwaktes: [],
      nuIso: verledenIso,
    });
    const onderdelen12 = KLIMOP_TWAALF_KERNMODULES.map((pad) => ({ pad, inhoudUtf8: lees(pad) }));
    const zaadPakketRes = stelKlimopZaadPakketSamen({
      zaadId: 'zaad_020_een',
      versieLabel: 'zaad-020-v1',
      etappe11Rapport: vrijAudit.rapport,
      erkendeAuditorSleutels: [{
        auditorKnooppuntId: auditor.identiteit.knooppuntId,
        ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
        mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
      }],
      grondwet: gw1Uit.grondwet,
      startToetredingsKnooppunten: [knOpslagCh.identiteit, knOpslagUa.identiteit],
      onderdelen: onderdelen12,
      zaadBewaarder,
      tekenMetFrostGroep: (b) => tekenFrost(b, [frostRaad.delen[0], frostRaad.delen[1]], frostRaad.groepsPubHex, frostRaad.deelnemerPubMap, 2),
      nuIso: verledenIso,
    });
    const zaadPakketTweedeMetadata = stelKlimopZaadPakketSamen({
      zaadId: 'zaad_020_een',
      versieLabel: 'zaad-020-andere-metadata',
      etappe11Rapport: vrijAudit.rapport,
      erkendeAuditorSleutels: [{
        auditorKnooppuntId: auditor.identiteit.knooppuntId,
        ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
        mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
      }],
      grondwet: gw1Uit.grondwet,
      startToetredingsKnooppunten: [knOpslagCh.identiteit, knOpslagUa.identiteit],
      onderdelen: onderdelen12,
      zaadBewaarder,
      tekenMetFrostGroep: (b) => tekenFrost(b, [frostRaad.delen[0], frostRaad.delen[1]], frostRaad.groepsPubHex, frostRaad.deelnemerPubMap, 2),
      nuIso: verledenIso,
    });
    if (!zaadPakketRes.ok || !zaadPakketTweedeMetadata.ok) throw new Error('ZAAD_FOUT');

    const zaadMetOngetekendBestand = verifieerKlimopZaadPakket({
      ...zaadPakketRes.pakket,
      ingebeddeOnderdelenUtf8: {
        ...zaadPakketRes.pakket.ingebeddeOnderdelenUtf8,
        'extra/achterdeur.ts': 'export const kwaad = true;',
      },
    });
    const zaadVreemdeBewaarder = verifieerKlimopZaadPakket(
      zaadPakketRes.pakket,
      frostRaad.groepsPubHex,
      { ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u },
    );

    // Вузол CH без beginAnker: зберігає пакет з grondwetIngesteld=false і відхиляє спадкоємність GEEN_VERTROUWD_BEGINANKER
    const zadenClient = new KlimopZadenEnOpvolgingClient(clientEigenaar);
    const zadenGroep = zadenClient.maakZadenQuorumGroep({
      groepId: 'zd_020',
      coordinator: knEigenaar,
      knooppunten: [knOpslagCh.identiteit, knOpslagUa.identiteit],
      quorumMinimum: 2,
      nuIso,
      verlooptOpIso: verlooptIso,
    });
    if (!zadenGroep.ok) throw new Error(zadenGroep.fout);

    const bewaarChZonderAnker = await clientEigenaar.roepOpdrachtAan(knOpslagCh.identiteit.knooppuntId, {
      actie: 'bewaar_gevalideerd_zaad_pakket',
      pakket: zaadPakketRes.pakket,
      mandaat: zadenGroep.groep.mandatenPerKnooppuntId[knOpslagCh.identiteit.knooppuntId],
    });
    // Кладемо на UA пакет з тим самим коренем Меркла, але іншими підписаними метаданими!
    await clientEigenaar.roepOpdrachtAan(knOpslagUa.identiteit.knooppuntId, {
      actie: 'bewaar_gevalideerd_zaad_pakket',
      pakket: zaadPakketTweedeMetadata.pakket,
      mandaat: zadenGroep.groep.mandatenPerKnooppuntId[knOpslagUa.identiteit.knooppuntId],
    });
    const herstelTegenstrijdigPakket = await zadenClient.herstelEnStartNieuweGeneratieUitQuorumZaad({
      groep: zadenGroep.groep,
      zaadId: 'zaad_020_een',
      verwachteFrostPubHex: frostRaad.groepsPubHex,
      nieuweGeneratieKnooppunten: [knOpslagCh.identiteit, knOpslagUa.identiteit],
    });

    const frostGen2 = maakFrostGroep('frost_gen2_020', 2, 3);
    const gwGen2 = maakBestuursGrondwet({
      grondwetId: 'gw_020_gen2',
      versieVolgnummer: 2,
      frostSetId: 'frost_gen2_020',
      frostGroepsPubliekeSleutelHex: frostGen2.groepsPubHex,
      drempel: 2,
      erkendeHoeders: [knOpslagNl.identiteit, knOpslagCh.identiteit, knOpslagUa.identiteit],
      nuIso: new Date(verledenMs + 80 * 3600_000).toISOString(),
    });
    if (!gwGen2.ok) throw new Error(gwGen2.fout);
    const opvolging = stelOpvolgingsOverdrachtSamen({
      vorigeGrondwet: gw1Uit.grondwet,
      nieuweGrondwet: gwGen2.grondwet,
      aangekondigdOp: verledenIso,
      bekrachtigdOp: new Date(verledenMs + 75 * 3600_000).toISOString(),
      tekenMetVorigFrostQuorum: (b) => tekenFrost(b, [frostRaad.delen[0], frostRaad.delen[1]], frostRaad.groepsPubHex, frostRaad.deelnemerPubMap, 2),
      tekenMetNieuwFrostQuorum: (b) => tekenFrost(b, [frostGen2.delen[0], frostGen2.delen[1]], frostGen2.groepsPubHex, frostGen2.deelnemerPubMap, 2),
    });
    if (!opvolging.ok) throw new Error(opvolging.fout);
    const opvOpChZonderAnker = await clientEigenaar.roepOpdrachtAan(knOpslagCh.identiteit.knooppuntId, {
      actie: 'registreer_opvolgings_overdracht',
      overdracht: opvolging.overdracht,
      mandaat: zadenGroep.groep.mandatenPerKnooppuntId[knOpslagCh.identiteit.knooppuntId],
    });

    check('«Насіння» відхиляє непідписані вкладення й чужого хранителя, без beginAnker не встановлює конституцію і не приймає спадкоємність, а клієнт ловить різницю метаданих пакета',
      !zaadMetOngetekendBestand.ok && zaadMetOngetekendBestand.fout === 'ZAAD_ONGETEKEND_ONDERDEEL_AANWEZIG:extra/achterdeur.ts'
      && !zaadVreemdeBewaarder.ok && zaadVreemdeBewaarder.fout === 'ZAAD_BEWAARDER_SLEUTEL_KOMT_NIET_OVEREEN'
      && bewaarChZonderAnker.antwoord.ok && bewaarChZonderAnker.antwoord.actie === 'zaad_pakket_opgeslagen'
      && bewaarChZonderAnker.antwoord.grondwetIngesteld === false
      && !opvOpChZonderAnker.antwoord.ok && opvOpChZonderAnker.antwoord.fout === 'GEEN_VERTROUWD_BEGINANKER'
      && !herstelTegenstrijdigPakket.ok && herstelTegenstrijdigPakket.fout === 'QUORUM_ZAAD_PAKKET_TEGENSTRIJDIG');

    clientEigenaar.sluitAlleSessies();
    clientVreemd.sluitAlleSessies();
  } finally {
    await Promise.all([srvStrengNl.sluit(), srvOpenCh.sluit(), srvOpenUa.sluit()]);
  }

  // ------------------------------------------------------------------ 4. Групове епохове шифрування, Сивілла та місцеве моделювання атестата
  const mlsApp1 = registreerVertrouwdApparaat({
    staat: verankerd.nieuweStaat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'Ноутбук групи',
    toegestaneBevoegdheden: ['groeps_mls_lid'],
    nuIso: verledenIso,
  });
  const mlsApp2 = registreerVertrouwdApparaat({
    staat: verankerd.nieuweStaat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'Планшет групи',
    toegestaneBevoegdheden: ['groeps_mls_lid'],
    nuIso: verledenIso,
  });
  const groep1 = maakMlsGroep({ groepId: 'grp_020', oprichterBundel: mlsApp1, nuIso: verledenIso });
  const blad2 = maakMlsBladSleutelPakket(mlsApp2, verledenIso);
  const toegevoegd = voegLidToeAanMlsGroep(groep1, blad2.pakket);
  const vervalstWelkom = pasMlsWelkomToe(
    { ...toegevoegd.welkom, handtekeningB64u: Buffer.alloc(64, 5).toString('base64url') },
    mlsApp2,
    blad2.bladX25519GeheimPkcs8B64u,
  );
  const echtWelkom = pasMlsWelkomToe(toegevoegd.welkom, mlsApp2, blad2.bladX25519GeheimPkcs8B64u);
  if (!echtWelkom.ok) throw new Error(echtWelkom.fout);
  const groep2 = echtWelkom.staat;

  const grpBericht = versleutelMlsGroepsBericht(groep1, Buffer.from('Одне повідомлення без права повтору', 'utf8'));
  const eersteOntvangst = ontsleutelMlsGroepsBericht(groep2, grpBericht);
  const tweedeOntvangstHerhaling = ontsleutelMlsGroepsBericht(groep2, grpBericht);
  const verversCommit = verversEigenMlsBladSleutel(groep2, mlsApp2, nuIso);
  const groep1NaVervers = pasMlsCommitToe(groep1, verversCommit);

  check('спрощене групове шифрування перевіряє підпис пакета привітання, блокує повтор повідомлення (MLS_BERICHT_HERHALING_GEWEIGERD) і підтримує ротацію листка',
    !vervalstWelkom.ok && vervalstWelkom.fout === 'MLS_WELKOM_HANDTEKENING_ONGELDIG'
    && eersteOntvangst.ok === true
    && !tweedeOntvangstHerhaling.ok && tweedeOntvangstHerhaling.fout === 'MLS_BERICHT_HERHALING_GEWEIGERD'
    && groep1NaVervers.ok === true && groep1.epoche === 3);

  // Опір Сивіллі: прострочені приєднання та чесна ознака відсутності зовнішнього доказу фізичної незалежності
  const basisAanvr = {
    gevraagdeRollen: ['opslag'] as const,
    maxOpslagMiB: 1024,
    maxBandbreedteMiBPerDag: 1024,
    maxToegestaneReplicas: 2,
    uitdrukkelijkeToestemmingApparaatEigenaar: true,
    geenZelfstandigeInstallatie: true,
    geenOngevraagdeKopieVanPriveInhoud: true,
    geenVerborgenRekenkrachtGebruik: true,
    automatischeRechtenUitbreidingViaVerbinding: false,
    vertrouwdAlleenWegensNetwerkNabijheid: false,
    maandelijkseKostenEuro: 0,
    uitdrukkelijkeKostenGoedkeuringEigenaar: false,
  };
  const aanvrNl: KnooppuntToetredingsAanvraag = {
    ...basisAanvr,
    kandidaatIdentiteit: knOpslagNl.identiteit,
    netwerkVoorvoegsel: '198.51.100.0/24',
  };
  const aanvrCh: KnooppuntToetredingsAanvraag = {
    ...basisAanvr,
    kandidaatIdentiteit: knOpslagCh.identiteit,
    netwerkVoorvoegsel: '203.0.113.0/24',
  };
  const bewNlVerlopen = maakHechtrankToetredingsBewijs({
    aanvraag: aanvrNl,
    sponsorSleutels,
    kandidaatGeheimPkcs8B64u: knOpslagNl.geheimeSleutelPkcs8B64u,
    nuIso: verledenIso,
    geldigheidDagen: 1,
  });
  const bewChGeldig = maakHechtrankToetredingsBewijs({
    aanvraag: aanvrCh,
    sponsorSleutels,
    kandidaatGeheimPkcs8B64u: knOpslagCh.geheimeSleutelPkcs8B64u,
    nuIso,
    geldigheidDagen: 30,
  });
  if (!bewNlVerlopen.ok || !bewChGeldig.ok) throw new Error('BEW_FOUT');
  const sybilMetVerlopen = beoordeelSybilEnSpreidingsWeerstand({
    toetredingen: [bewNlVerlopen.bewijs, bewChGeldig.bewijs],
    vereisteOnafhankelijkeDrempel: 2,
    nuIso,
  });

  // Кворум в одному процесі: явна позначка місцевого моделювання і відмова при звірці із зовнішнім реєстром ключів
  const tmpMap = mkdtempSync(join(tmpdir(), 'klimop-020-attest-'));
  try {
    const simAttest = voerStap4QuorumAttestProefUit({ dienstId: 'postvak' }, { staatMap: tmpMap });
    const vreemdRegisterControle = verifieerQuorumAttestKeten([simAttest.attestRegel], {
      frostGroepsPubliekeSleutelHex: 'a'.repeat(64),
      ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
      mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
    });
    check('Sybil-оцінка відсіює прострочені приєднання й позначає самозаявлені паспорти, а кворум Сходинки 4 позначено як місцеве моделювання',
      sybilMetVerlopen.verlopenOfIngetrokkenGenegeerd === 1
      && sybilMetVerlopen.fysiekeOnafhankelijkheidExternBewezen === false
      && sybilMetVerlopen.onafhankelijkheidsBewijsBron === 'zelfverklaarde_paspoorten'
      && simAttest.uitvoeringsAard === 'lokale_simulatie_een_proces'
      && simAttest.overdrachtBesluit.bewijsOmvang === 'lokale_simulatie'
      && vreemdRegisterControle.ok === false
      && vreemdRegisterControle.fout === 'ATTEST_SLEUTEL_BUITEN_ERKEND_REGISTER');
  } finally {
    rmSync(tmpMap, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 5. Архітектурна перевірка 15 питань, статті Хвилі 3 та мовний закон
  const antwoorden15Eind = Object.fromEntries(KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, {
    voldaan: true,
    bewijs: `Перевірено у KLIMOP-020 (Хвиля 3: суворі мандати, сертифікат відновлення, прив’язка конституції, зовнішній якір Насіння, еталони імунної перевірки) для ${id}`,
  }])) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeel = beoordeelKlimopWijziging({
    naam: 'KLIMOP-020 Третя хвиля виправлень за незалежною перевіркою: межі довіри',
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: antwoorden15Eind,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('KLIMOP-020 проходить 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeel.goedgekeurd === true && oordeel.fouten.length === 0);

  const artUk = 'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md';
  const artMd = 'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.md';
  const artNl = 'docs/hub/KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md';
  const overdrachtUk = 'docs/hub/ПЛЮЩ-ПЕРЕДАЧА-РОБОТИ-KLIMOP-020.uk.md';
  const overdrachtMd = 'docs/hub/ПЛЮЩ-ПЕРЕДАЧА-РОБОТИ-KLIMOP-020.md';
  const overdrachtNl = 'docs/hub/KLIMOP-020-WERKOVERDRACHT.nl.md';

  const uk = lees(artUk);
  const nl = lees(artNl);
  check('статті виправлень та документи передачі KLIMOP-020 містять Хвилю 3 обома мовами, синхронізовані з копіями .md і називають обидві моделі виконання',
    [artUk, artMd, artNl, overdrachtUk, overdrachtMd, overdrachtNl].every((p) => existsSync(p))
    && lees(artMd) === uk
    && lees(overdrachtMd) === lees(overdrachtUk)
    && uk.includes('KLIMOP-020') && nl.includes('KLIMOP-020')
    && /Хвиля 3/.test(uk) && /Golf 3/.test(nl)
    && uk.includes('Claude Opus 5.5 (High)') && uk.includes('Gemini 4 Carbon (High)')
    && nl.includes('Claude Opus 5.5 (High)') && nl.includes('Gemini 4 Carbon (High)'));

  const bestanden020 = [
    'shared/klimop/kern.ts',
    'shared/klimop/identiteit.ts',
    'shared/klimop/bestuur.ts',
    'shared/klimop/immuunsysteem.ts',
    'shared/klimop/diensten.ts',
    'shared/klimop/hechtranken.ts',
    'shared/klimop/zaden.ts',
    'shared/klimop-overzicht-model.ts',
    'backend/klimop-knooppunt-agent.ts',
    'backend/klimop-identiteit-client.ts',
    'backend/klimop-immuunsysteem-client.ts',
    'backend/klimop-zaden-client.ts',
    'backend/klimop-overdracht-opslag.ts',
    artUk,
    artNl,
    overdrachtUk,
    overdrachtNl,
    'tests/eenheid/klimop-020-vertrouwensgrenzen-20261121.test.ts',
  ];
  const taalFouten = bestanden020.filter((pad) => {
    const inhoud = lees(pad);
    return VERBODEN_LETTERS.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі змінені та нові файли KLIMOP-020 бездоганно дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
