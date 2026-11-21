// KLIMOP-022 (21.11.2026): Регресійний набір модульних та живих мережевих випробувань Хвилі 5
// за всіма 25 знахідками повторної незалежної перевірки AUDIT-003 (6 високих, 11 середніх, 8 низьких):
//   1. В-1: лінійність ротацій на вузлі, відсічення попередніх коренів після законного відновлення,
//      підписаний відбиток verankeringenTotEpocheSha256 та інтервал чинності прив'язки спадкового користувача;
//   2. В-2: транзитивне відкликання аварійних пристроїв (nood_betwisting) на всіх рівнях та захист від циклів;
//   3. В-3: обов'язкові objectIds, вкладені ідентифікатори об'єктів, розділення machtDomein та годинник вузла klok;
//   4. В-4: первинна конституція під пороговим підписом FROST від зовнішнього якоря та локальна тривога примусу на вузлі;
//   5. В-5 + Н-7: повний потоковий SHA-256 контрольної точки великого журналу, режим читання без запису в теці власника,
//      фільтр .lock у тимчасовому ізольованому каталозі та роздільні лічильники частоти за ідентифікатором агента;
//   6. В-6 + Н-8: усі 14 модулів shared/klimop/*.ts у пакеті «Насіння», реальне складання esbuild на чистому дереві,
//      перевірка конституції у спадкоємності, обидва ключі хранителя в beginAnker та рівність заголовків ## у 25 статтях §44;
//   7. С-1..С-4: закриті відмови дат і строку сеансу «Стебел», звірка ключа ML-DSA-65 маніфесту, юрисдикційний кворум
//      і захист від одиничної точки та дублікатів індексів у FROST;
//   8. С-5 + С-6: схема інструмента klimop_architectuur_toets (етапи 0..16, antwoorden15, 14 заборон §43) та поіменний розбір доказів;
//   9. С-7 + С-8: багатоланкова підписана естафета [A, R1, R2, B] і повне автоматичне відкочування вже оновлених вузлів хвилі;
//  10. С-9..С-11 + Н-1..Н-6: сталий час порівняння сховищ, прив'язка alarmId, узгодженість навичок, статей, дзеркал,
//      записів авторства AUDIT-003 і KLIMOP-022, відсутність грошових одиниць та Абсолютний мовний закон.
// Запуск: node scripts/eenheidstests.mjs klimop-022-sluit-audit003-restbevindingen-20261121.test.ts

import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  openSync,
  closeSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { checker } from './hulp/nep-google';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  controleerKnooppuntOnafhankelijkheid,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  verifieerKlimopMandaat,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import {
  KlimopRouteTabel,
  beantwoordStengelHanddruk,
  maakStengelHanddrukAanvraag,
  ontsleutelStengelKader,
  versleutelStengelKader,
  voltooiStengelHanddruk,
} from '../../shared/klimop/stengels';
import {
  verifieerObjectManifest,
  versleutelEnVerdeelObject,
} from '../../shared/klimop/opslag';
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
  heeftGeldigGemeenschappelijkRotatieVoorvoegsel,
  maakErfenisGebruikerKoppeling,
  maakPersoonsIdentiteit,
  openHerstelAanvraag,
  registreerVertrouwdApparaat,
  roteerPersoonsWortelSleutel,
  trekApparaatIn,
  verankerHerstelBeleid,
  verifieerApparaatCertificaat,
  verifieerApparaatIntrekking,
  verifieerErfenisGebruikerKoppeling,
  verifieerPersoonsStaat,
  voegVoogdBevestigingToe,
  voltooiWettigHerstel,
  type KlimopApparaatIntrekking,
  type KlimopHerstelBeleid,
} from '../../shared/klimop/identiteit';
import {
  maakAanvankelijkeGrondwetFrostBoodschap,
  verifieerAanvankelijkeGrondwetFrostHandtekening,
  type KlimopBestuursGrondwet,
} from '../../shared/klimop/bestuur';
import {
  maakHlcStempel,
  maakOndertekendeCrdtOperatie,
} from '../../shared/klimop/diensten';
import {
  berekenKluisVerifierHex,
  herstelNaValsDwangAlarm,
  leidKluisGeheimUitWachtzin,
  leidScheidbareKluisContextAf,
  maakUitgesteldeKritiekeOperatie,
  maakValsAlarmHerstelVerklaring,
  type KlimopDwangBeschermingsProfiel,
} from '../../shared/klimop/mensbescherming';
import {
  KLIMOP_AUTONOMIE_SCENARIOS,
  KLIMOP_CRYPTO_AUDIT_SCENARIOS,
  KLIMOP_MEETBARE_GARANTIES_IDS,
  maakHybridePostkwantumKnooppunt,
  stelOnafhankelijkAuditRapportSamen,
} from '../../shared/klimop/beveiligingsaudit';
import {
  KLIMOP_TWAALF_KERNMODULES,
  controleerVijfentwintigVerplichteDocumenten,
  herbouwEcosysteemUitZaadOpSchoonMilieu,
  stelKlimopZaadPakketSamen,
  stelOpvolgingsOverdrachtSamen,
  verifieerOpvolgingsOverdracht,
} from '../../shared/klimop/zaden';
import {
  KLIMOP_VEERTIEN_VERBODEN_LIJST,
  maakLeegVragenBewijsSjabloon,
  ontleedVoorstelBewijsNaarAntwoorden,
} from '../../shared/klimop-overzicht-model';
import {
  KLIMOP_ARCHITECTUUR_TOETS,
  KLIMOP_OVERZICHT,
  KLIMOP_PASSIEVE_SPIEGEL,
  KLIMOP_SPIEGEL_LOGBOEK,
  KLIMOP_TOOLS,
} from '../../backend/klimop-hulpmiddeldefinities';
import {
  _klimopMcpLimietenLeeg,
  voerKlimopToolUit,
} from '../../backend/klimop-hulpmiddelen';
import {
  leesKlimopDubbelSchrijvenLogboek,
  leesKlimopQuorumAttestLogboek,
  leesKlimopSpiegelLogboek,
  voerPassieveSpiegelLeesProefUit,
} from '../../backend/klimop-overdracht-opslag';
import {
  KlimopNetwerkClient,
  startKlimopProefKnooppunt,
} from '../../backend/klimop-knooppunt-agent';
import { KlimopIdentiteitNetwerkClient } from '../../backend/klimop-identiteit-client';
import { KlimopDrempelOndertekenaarClient } from '../../backend/klimop-drempel-client';
import { KlimopBestuurEnUitrolClient } from '../../backend/klimop-bestuur-client';

const lees = (pad: string): string => readFileSync(pad, 'utf8');

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
  const { check, einde } = checker('klimop-022-sluit-audit003-restbevindingen');
  const t0Ms = Date.parse('2026-11-10T10:00:00.000Z');
  const t0Iso = new Date(t0Ms).toISOString();
  const nuIso = new Date().toISOString();
  const verlooptIso = new Date(Date.now() + 14 * 24 * 3600_000).toISOString();
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Хвилею 5 для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  // ==================================================================
  // 1. В-1: Лінійність ротацій особи, відсічення старих коренів після відновлення,
  //    відбиток verankeringenTotEpocheSha256 та інтервал чинності спадкового мосту
  // ==================================================================
  const persoon = maakPersoonsIdentiteit(t0Iso);
  const voogd1 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'NL', aanbieder: 'v1-022', nuIso: t0Iso });
  const voogd2 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'CH', aanbieder: 'v2-022', nuIso: t0Iso });
  const voogd3 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'UA', aanbieder: 'v3-022', nuIso: t0Iso });

  const pedersen1 = splitsMetPedersenVss({
    geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
    drempel: 2,
    totaal: 3,
    setId: 'ped_022_a',
    epoche: 1,
  });
  const beleidEcht: KlimopHerstelBeleid = {
    schema: 1,
    persoonsId: persoon.staat.oprichting.persoonsId,
    pedersenSetId: 'ped_022_a',
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
  const verankerRes = verankerHerstelBeleid({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    beleid: beleidEcht,
    nuIso: new Date(t0Ms + 60_000).toISOString(),
  });
  if (!verankerRes.ok) throw new Error(verankerRes.fout);
  const staatMetVerankering = verankerRes.nieuweStaat;

  // Дві несумісні гілки ротацій від одного кореня (розгалуження історії): гілка Б має вищу епоху 3, ніж гілка А (епоха 2)
  const takA = roteerPersoonsWortelSleutel(
    staatMetVerankering,
    persoon.wortelGeheimPkcs8B64u,
    new Date(t0Ms + 120_000).toISOString(),
  );
  const takB1 = roteerPersoonsWortelSleutel(
    staatMetVerankering,
    persoon.wortelGeheimPkcs8B64u,
    new Date(t0Ms + 180_000).toISOString(),
  );
  const takB2 = roteerPersoonsWortelSleutel(
    takB1.nieuweStaat,
    takB1.nieuwWortelGeheimPkcs8B64u,
    new Date(t0Ms + 240_000).toISOString(),
  );

  // Перевіряємо, що пошкодження verankeringenTotEpocheSha256 відхиляється у verifieerPersoonsStaat
  const vervalsteVerankeringStaat = {
    ...takA.nieuweStaat,
    rotaties: takA.nieuweStaat.rotaties.map((r) => ({ ...r, verankeringenTotEpocheSha256: '0'.repeat(64) })),
  };
  const vVervalsteVerankering = verifieerPersoonsStaat(vervalsteVerankeringStaat);

  // Виконуємо законне порогове відновлення у нову епоху 2 (при цьому в епосі 1 також була закріплена запасна політика aanvalBeleid,
  // щоб перевірити, що після wettig_drempel_herstel будь-які політики епохи 1 відсікаються в zoekVerankering!)
  const aanvalVoogd1 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'DE', aanbieder: 'av1', nuIso: t0Iso });
  const aanvalVoogd2 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['herstel'], juridischeRegio: 'SE', aanbieder: 'av2', nuIso: t0Iso });
  const pedAanval = splitsMetPedersenVss({
    geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
    drempel: 2,
    totaal: 2,
    setId: 'ped_aanval',
    epoche: 1,
  });
  const aanvalBeleid: KlimopHerstelBeleid = {
    schema: 1,
    persoonsId: persoon.staat.oprichting.persoonsId,
    pedersenSetId: 'ped_aanval',
    drempel: 2,
    voogden: [
      { knooppuntId: aanvalVoogd1.identiteit.knooppuntId, publiekeSleutelDerB64u: aanvalVoogd1.identiteit.publiekeSleutelDerB64u },
      { knooppuntId: aanvalVoogd2.identiteit.knooppuntId, publiekeSleutelDerB64u: aanvalVoogd2.identiteit.publiekeSleutelDerB64u },
    ],
    minimaleBetwistingsVensterUren: {
      verlies_alle_apparaten: 48,
      bevestigde_langdurige_onbeschikbaarheid: 168,
      wettige_erfopvolging: 168,
    },
  };
  const staatMetTweeVerankeringenRes = verankerHerstelBeleid({
    staat: staatMetVerankering,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    beleid: aanvalBeleid,
    nuIso: new Date(t0Ms + 30_000).toISOString(),
  });
  if (!staatMetTweeVerankeringenRes.ok) throw new Error(staatMetTweeVerankeringenRes.fout);

  const kandidaatHerstelWortel = maakEd25519Sleutels();
  const herstelOpenIso = new Date(t0Ms + 3600_000).toISOString();
  const herstelVoltooidIso = new Date(t0Ms + 60 * 3600_000).toISOString();
  const aanvr1Open = openHerstelAanvraag({
    beleid: beleidEcht,
    omstandigheid: 'verlies_alle_apparaten',
    kandidaatNieuweWortelPubDerB64u: kandidaatHerstelWortel.publiekeSleutelDerB64u,
    nuIso: herstelOpenIso,
  });
  if (!aanvr1Open.ok) throw new Error(aanvr1Open.fout);
  const stem1A = voegVoogdBevestigingToe({
    aanvraag: aanvr1Open.aanvraag,
    beleid: beleidEcht,
    voogd: voogd1,
    nuIso: new Date(t0Ms + 2 * 3600_000).toISOString(),
  });
  if (!stem1A.ok) throw new Error(stem1A.fout);
  const stem1B = voegVoogdBevestigingToe({
    aanvraag: stem1A.aanvraag,
    beleid: beleidEcht,
    voogd: voogd2,
    nuIso: new Date(t0Ms + 3 * 3600_000).toISOString(),
  });
  if (!stem1B.ok) throw new Error(stem1B.fout);
  const hersteldRes = voltooiWettigHerstel({
    staat: staatMetTweeVerankeringenRes.nieuweStaat,
    beleid: beleidEcht,
    aanvraag: stem1B.aanvraag,
    pedersenDelen: [pedersen1.delen[0], pedersen1.delen[1]],
    kandidaatNieuwWortelGeheimPkcs8B64u: kandidaatHerstelWortel.geheimeSleutelPkcs8B64u,
    nuIso: herstelVoltooidIso,
  });
  if (!hersteldRes.ok) throw new Error(hersteldRes.fout);

  // Рубіж 1а: впорскування нової політики епохи 1 заднім числом ловиться відбитком verankeringenTotEpocheSha256
  const achterafVerankerUit = verankerHerstelBeleid({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    beleid: aanvalBeleid,
    nuIso: new Date(t0Ms + 95_000).toISOString(),
  });
  if (!achterafVerankerUit.ok) throw new Error(achterafVerankerUit.fout);
  const staatMetAchterafVerankering = {
    ...hersteldRes.nieuweStaat,
    herstelBeleidVerankeringen: [
      ...(hersteldRes.nieuweStaat.herstelBeleidVerankeringen ?? []),
      achterafVerankerUit.nieuweStaat.herstelBeleidVerankeringen![0],
    ],
  };
  const vAchterafVerankering = verifieerPersoonsStaat(staatMetAchterafVerankering);

  // Рубіж 1б: навіть чесно закріплена до відновлення політика епохи 1 відсікається в епосі 2 з HERSTELBELEID_NIET_VERANKERD
  const aanvalKandidaatWortel = maakEd25519Sleutels();
  const aanvalOpen = openHerstelAanvraag({
    beleid: aanvalBeleid,
    omstandigheid: 'verlies_alle_apparaten',
    kandidaatNieuweWortelPubDerB64u: aanvalKandidaatWortel.publiekeSleutelDerB64u,
    nuIso: new Date(t0Ms + 70 * 3600_000).toISOString(),
  });
  if (!aanvalOpen.ok) throw new Error(aanvalOpen.fout);
  const aanvalStem1 = voegVoogdBevestigingToe({
    aanvraag: aanvalOpen.aanvraag,
    beleid: aanvalBeleid,
    voogd: aanvalVoogd1,
    nuIso: new Date(t0Ms + 71 * 3600_000).toISOString(),
  });
  if (!aanvalStem1.ok) throw new Error(aanvalStem1.fout);
  const aanvalStem2 = voegVoogdBevestigingToe({
    aanvraag: aanvalStem1.aanvraag,
    beleid: aanvalBeleid,
    voogd: aanvalVoogd2,
    nuIso: new Date(t0Ms + 72 * 3600_000).toISOString(),
  });
  if (!aanvalStem2.ok) throw new Error(aanvalStem2.fout);
  const aanvalHerstelUit = voltooiWettigHerstel({
    staat: hersteldRes.nieuweStaat,
    beleid: aanvalBeleid,
    aanvraag: aanvalStem2.aanvraag,
    pedersenDelen: [pedAanval.delen[0], pedAanval.delen[1]],
    kandidaatNieuwWortelGeheimPkcs8B64u: aanvalKandidaatWortel.geheimeSleutelPkcs8B64u,
    nuIso: new Date(t0Ms + 125 * 3600_000).toISOString(),
  });

  // Скомпрометований корінь епохи 1 намагається підписати спадкову прив'язку після переходу до епохи 2
  const oudeWortelOpValseStaat = maakErfenisGebruikerKoppeling(
    'gebruiker-aanvaller',
    persoon.staat,
    persoon.wortelGeheimPkcs8B64u,
    new Date(t0Ms + 65 * 3600_000).toISOString(),
  );
  const nieuweWortelKoppeling = maakErfenisGebruikerKoppeling(
    'gebruiker-echt',
    hersteldRes.nieuweStaat,
    kandidaatHerstelWortel.geheimeSleutelPkcs8B64u,
    new Date(t0Ms + 65 * 3600_000).toISOString(),
  );

  check(
    'В-1: ротації зв’язані з verankeringenTotEpocheSha256, після законного відновлення старий корінь епохи 1 не може ні закласти політику відновлення, ні підписати спадкову прив’язку',
    heeftGeldigGemeenschappelijkRotatieVoorvoegsel(takA.nieuweStaat, takB2.nieuweStaat) === false
    && vVervalsteVerankering.ok === false
    && vAchterafVerankering.ok === false
    && vAchterafVerankering.fout === 'HERSTELBELEID_VERANKERING_ACHTERAF_GEWIJZIGD'
    && aanvalHerstelUit.ok === false
    && aanvalHerstelUit.fout === 'HERSTELBELEID_NIET_VERANKERD'
    && verifieerErfenisGebruikerKoppeling(oudeWortelOpValseStaat, hersteldRes.nieuweStaat) === false
    && verifieerErfenisGebruikerKoppeling(nieuweWortelKoppeling, hersteldRes.nieuweStaat) === true,
  );

  // ==================================================================
  // 2. В-2: Транзитивне відкликання аварійних пристроїв і захист від циклів
  // ==================================================================
  const noodApp1 = registreerVertrouwdApparaat({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'nood-1',
    toegestaneBevoegdheden: ['lezen_eigen_ruimte', 'nood_betwisting'],
    nuIso: new Date(t0Ms + 10_000).toISOString(),
  });
  const noodApp2 = registreerVertrouwdApparaat({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'nood-2',
    toegestaneBevoegdheden: ['lezen_eigen_ruimte', 'nood_betwisting'],
    nuIso: new Date(t0Ms + 10_000).toISOString(),
  });
  const hoofdApp = registreerVertrouwdApparaat({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'hoofd-telefoon',
    toegestaneBevoegdheden: ['lezen_eigen_ruimte', 'schrijven_eigen_ruimte'],
    nuIso: new Date(t0Ms + 10_000).toISOString(),
  });

  // Корінь власника відкликає noodApp1 о t0 + 20 с; о t0 + 30 с викрадений noodApp1 намагається відкликати hoofdApp
  const intrNood1DoorWortel = trekApparaatIn({
    staat: persoon.staat,
    ingetrokkenApparaatId: noodApp1.certificaat.apparaatId,
    reden: 'verloren_of_gestolen',
    ondertekenaar: { soort: 'wortel', geheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u },
    nuIso: new Date(t0Ms + 20_000).toISOString(),
  });
  const valseIntrHoofdDoorIngetrokkenNood = trekApparaatIn({
    staat: persoon.staat,
    ingetrokkenApparaatId: hoofdApp.certificaat.apparaatId,
    reden: 'verdacht_gedrag',
    ondertekenaar: { soort: 'nood_apparaat', bundel: noodApp1 },
    nuIso: new Date(t0Ms + 30_000).toISOString(),
  });
  const bundelIntrekkingen: readonly KlimopApparaatIntrekking[] = [
    intrNood1DoorWortel,
    valseIntrHoofdDoorIngetrokkenNood,
  ];
  const vValseIntr = verifieerApparaatIntrekking(
    valseIntrHoofdDoorIngetrokkenNood,
    persoon.staat,
    bundelIntrekkingen,
  );
  const vHoofdCertBlijftGeldig = verifieerApparaatCertificaat(hoofdApp.certificaat, persoon.staat, {
    intrekkingen: bundelIntrekkingen,
    nuIso: new Date(t0Ms + 40_000).toISOString(),
  });

  // Штучний цикл взаємного відкликання в одну мить N1 <-> N2 не спричиняє переповнення стека
  const gelijkeTijdIso = new Date(t0Ms + 50_000).toISOString();
  const cyclus12 = trekApparaatIn({
    staat: persoon.staat,
    ingetrokkenApparaatId: noodApp2.certificaat.apparaatId,
    reden: 'verdacht_gedrag',
    ondertekenaar: { soort: 'nood_apparaat', bundel: noodApp1 },
    nuIso: gelijkeTijdIso,
  });
  const cyclus21 = trekApparaatIn({
    staat: persoon.staat,
    ingetrokkenApparaatId: noodApp1.certificaat.apparaatId,
    reden: 'verdacht_gedrag',
    ondertekenaar: { soort: 'nood_apparaat', bundel: noodApp2 },
    nuIso: gelijkeTijdIso,
  });
  const cyclusRes = verifieerApparaatIntrekking(cyclus12, persoon.staat, [cyclus12, cyclus21]);

  check(
    'В-2: відкликаний власником аварійний пристрій не може відкликати основний пристрій, а взаємний цикл відкликань завершується без переповнення стека',
    vValseIntr.ok === false
    && vHoofdCertBlijftGeldig.ok === true
    && typeof cyclusRes.ok === 'boolean',
  );

  // ==================================================================
  // 3. В-1 + В-2 + В-3 + В-4 + В-6 (мережеві перевірки на живих вузлах у суворому режимі)
  // ==================================================================
  const knOpdrachtgever = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'verificatie', 'synchronisatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'eigenaar-022',
    nuIso,
  });
  const knStreng1 = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'synchronisatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'streng-1',
    nuIso,
  });
  const knStreng2 = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'synchronisatie', 'herstel'],
    juridischeRegio: 'CH',
    aanbieder: 'streng-2',
    nuIso,
  });
  const knZonderAnker = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'UA',
    aanbieder: 'zonder-anker',
    nuIso,
  });

  const frostRaad = maakFrostGroep('raad_022', 2, 3);
  const pqBewaarder = maakHybridePostkwantumKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'CH',
    aanbieder: 'zaad-bewaarder-022',
    nuIso,
  });
  const doelenSleutels = maakEd25519Sleutels();
  const tijdSleutels = maakEd25519Sleutels();

  let klokOffsetMs = 0;
  const srvStreng1 = await startKlimopProefKnooppunt({
    knooppunt: knStreng1,
    vertrouwdeUitgevers: [knOpdrachtgever.identiteit.knooppuntId],
    toegestaneAnnuleerPubSleutels: [persoon.staat.actieveWortelPubDerB64u],
    beginAnker: {
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      zaadBewaarderEd25519PubDerB64u: pqBewaarder.ed25519PubliekDerB64u,
      zaadBewaarderMlDsa65PubSpkiB64u: pqBewaarder.mlDsa65PubliekSpkiB64u,
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
    },
    klok: () => new Date(Date.now() + klokOffsetMs).toISOString(),
  });
  // Вузол із неповним якорем хранителя (лише Ed25519 без ML-DSA-65) та вузол узагалі без beginAnker
  const srvHalfAnker = await startKlimopProefKnooppunt({
    knooppunt: knStreng2,
    vertrouwdeUitgevers: [knOpdrachtgever.identiteit.knooppuntId],
    beginAnker: {
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      zaadBewaarderEd25519PubDerB64u: pqBewaarder.ed25519PubliekDerB64u,
    },
  });
  const srvZonderAnker = await startKlimopProefKnooppunt({
    knooppunt: knZonderAnker,
    vertrouwdeUitgevers: [knOpdrachtgever.identiteit.knooppuntId],
  });

  try {
    const routes = new KlimopRouteTabel();
    for (const s of [srvStreng1, srvHalfAnker, srvZonderAnker]) {
      routes.voegTweerichtingsStengelToe(knOpdrachtgever.identiteit.knooppuntId, s.identiteit.knooppuntId, 2);
    }
    const netStreng = new KlimopNetwerkClient(
      knOpdrachtgever,
      new Map([
        [srvStreng1.identiteit.knooppuntId, srvStreng1.basisUrl],
        [srvHalfAnker.identiteit.knooppuntId, srvHalfAnker.basisUrl],
        [srvZonderAnker.identiteit.knooppuntId, srvZonderAnker.basisUrl],
      ]),
      routes,
    );

    // В-1 на живому вузлі: розгалужена гілка ротацій більшої епохи відхиляється, а відкликання перевіряються транзитивно (В-2)
    const mndIdentiteit = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_id_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['verificatie', 'herstel'],
        toegestaneOpslagLagen: ['persoonlijke_geheime_gegevens'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['publiceer_identiteit_staat', 'raadpleeg_identiteit_staat'],
        objectIds: [persoon.staat.oprichting.persoonsId],
      },
      knOpdrachtgever,
    );
    const pubTakA = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'publiceer_identiteit_staat',
      staat: takA.nieuweStaat,
      intrekkingen: [],
      herstelAanvraag: null,
      mandaat: mndIdentiteit,
    });
    const pubVorkTakB = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'publiceer_identiteit_staat',
      staat: takB2.nieuweStaat,
      intrekkingen: [],
      herstelAanvraag: null,
      mandaat: mndIdentiteit,
    });

    // В-2 на живому вузлі та у KlimopIdentiteitNetwerkClient: відкликаний аварійний пристрій відхиляється на вузлі
    const pubValseIntrOpKnoop = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'publiceer_identiteit_staat',
      staat: takA.nieuweStaat,
      intrekkingen: [intrNood1DoorWortel, valseIntrHoofdDoorIngetrokkenNood],
      herstelAanvraag: null,
      mandaat: mndIdentiteit,
    });
    const pubGeldigeIntrOpKnoop = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'publiceer_identiteit_staat',
      staat: takA.nieuweStaat,
      intrekkingen: [intrNood1DoorWortel],
      herstelAanvraag: null,
      mandaat: mndIdentiteit,
    });
    const idNetClient = new KlimopIdentiteitNetwerkClient(netStreng);
    const idRegGroep = {
      registerId: 'reg_022',
      quorumDrempel: 1,
      knooppunten: [srvStreng1.identiteit],
      mandatenPerKnooppuntId: { [srvStreng1.identiteit.knooppuntId]: mndIdentiteit },
    };
    const hoofdOpNetwerk = await idNetClient.controleerApparaatOpNetwerk({
      groep: idRegGroep,
      certificaat: hoofdApp.certificaat,
      nuIso: new Date(t0Ms + 200_000).toISOString(),
    });
    const noodOpNetwerk = await idNetClient.controleerApparaatOpNetwerk({
      groep: idRegGroep,
      certificaat: noodApp1.certificaat,
      nuIso: new Date(t0Ms + 200_000).toISOString(),
    });

    check(
      'В-1 та В-2 (живий вузол): розгалуження ротацій вищої епохи відхиляється з IDENTITEIT_GESCHIEDENIS_SPLITSING_GEWEIGERD, а відкликаний аварійний пристрій не проходить ні на вузол, ні у кворум',
      pubTakA.antwoord.ok === true
      && pubVorkTakB.antwoord.ok === false
      && pubVorkTakB.antwoord.fout === 'IDENTITEIT_GESCHIEDENIS_SPLITSING_GEWEIGERD'
      && pubValseIntrOpKnoop.antwoord.ok === false
      && pubGeldigeIntrOpKnoop.antwoord.ok === true
      && hoofdOpNetwerk.ok === true
      && noodOpNetwerk.ok === false,
    );

    // В-3: мандат без objectIds, чужий voogdId, чужий machtDomein, NaN-час і зміщений годинник вузла klok
    const mndZonderObjectIds = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_zonder_obj_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['herstel'],
        toegestaneOpslagLagen: ['persoonlijke_geheime_gegevens'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['haal_voogd_signalen_op'],
      },
      knOpdrachtgever,
    );
    const mndAlleenVoogd1 = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_voogd1_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['herstel'],
        toegestaneOpslagLagen: ['persoonlijke_geheime_gegevens'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: new Date(Date.parse(nuIso) + 5_000).toISOString(),
        toegestaneActies: ['haal_voogd_signalen_op'],
        objectIds: ['voogd-1'],
      },
      knOpdrachtgever,
    );
    const rZonderObj = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'haal_voogd_signalen_op',
      voogdId: 'voogd-1',
      mandaat: mndZonderObjectIds,
    });
    const rVreemdeVoogd = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'haal_voogd_signalen_op',
      voogdId: 'voogd-2',
      mandaat: mndAlleenVoogd1,
    });
    const rEigenVoogd = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'haal_voogd_signalen_op',
      voogdId: 'voogd-1',
      mandaat: mndAlleenVoogd1,
    });

    // Зсуваємо годинник вузла на +10 секунд (у межах 15-хвилинного сеансу Стебел): мандат на 5 секунд стає простроченим за годинником вузла
    klokOffsetMs = 10_000;
    const rVerlopenVolgensKlok = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'haal_voogd_signalen_op',
      voogdId: 'voogd-1',
      mandaat: mndAlleenVoogd1,
    });
    klokOffsetMs = 0;

    const vNanNu = verifieerKlimopMandaat(mndAlleenVoogd1, {
      nuIso: 'недійсна-дата',
      vertrouwdeUitgevers: new Set([knOpdrachtgever.identiteit.knooppuntId]),
    });

    // В-3 + В-4: спроба встановити конституцію мандатом із machtDomein 'persoonlijke_gegevens', без beginAnker і без FROST
    const grondwet022: KlimopBestuursGrondwet = {
      schema: 1,
      grondwetId: 'gw_022',
      versieVolgnummer: 1,
      frostSetId: 'raad_022',
      frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
      drempel: 2,
      totaalHoeders: 3,
      erkendeHoeders: [knStreng1.identiteit, knStreng2.identiteit, knZonderAnker.identiteit],
      overgangsNoodVetoPubDerB64u: null,
      vastgesteldOp: nuIso,
    };
    const mndVerkeerdDomein = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_verkeerd_domein_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['stel_bestuursgrondwet_in'],
        objectIds: [grondwet022.grondwetId],
      },
      knOpdrachtgever,
    );
    const mndBestuurStreng1 = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_bestuur_streng1_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['stel_bestuursgrondwet_in'],
        objectIds: [grondwet022.grondwetId],
      },
      knOpdrachtgever,
    );
    const mndBestuurZonderAnker = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_bestuur_zonder_anker_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvZonderAnker.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['stel_bestuursgrondwet_in'],
        objectIds: [grondwet022.grondwetId],
      },
      knOpdrachtgever,
    );

    const mndBestuurHalfAnker = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_bestuur_half_anker_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvHalfAnker.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['stel_bestuursgrondwet_in'],
        objectIds: [grondwet022.grondwetId],
      },
      knOpdrachtgever,
    );
    const rVerkeerdDomein = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: grondwet022,
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
      mandaat: mndVerkeerdDomein,
    });
    const rZonderAnker = await netStreng.roepOpdrachtAan(srvZonderAnker.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: grondwet022,
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
      mandaat: mndBestuurZonderAnker,
    });
    const rZonderFrostSig = await netStreng.roepOpdrachtAan(srvHalfAnker.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: grondwet022,
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
      mandaat: mndBestuurHalfAnker,
    });
    const initGwFrostHex = tekenFrost(
      maakAanvankelijkeGrondwetFrostBoodschap(
        grondwet022,
        doelenSleutels.publiekeSleutelDerB64u,
        tijdSleutels.publiekeSleutelDerB64u,
      ),
      [frostRaad.delen[0], frostRaad.delen[1]],
      frostRaad.groepsPubHex,
      frostRaad.deelnemerPubMap,
      2,
    );
    const rMetFrostSig = await netStreng.roepOpdrachtAan(srvHalfAnker.identiteit.knooppuntId, {
      actie: 'stel_bestuursgrondwet_in',
      grondwet: grondwet022,
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
      aanvankelijkeFrostHandtekeningHex: initGwFrostHex,
      mandaat: mndBestuurHalfAnker,
    });

    // В-4 (тиха тривога на вузлі): мережевий клієнт передає actiefStilDwangAlarm: false, але локальний стан вузла блокує операцію
    const uitgesteldeOp = maakUitgesteldeKritiekeOperatie({
      persoonsId: persoon.staat.oprichting.persoonsId,
      soort: 'overdracht_eigendom',
      doelOmschrijving: 'Перевірка локальної тривоги вузла',
      wachttijdUren: 72,
      aanvragerSleutels: {
        publiekeSleutelDerB64u: persoon.staat.actieveWortelPubDerB64u,
        geheimeSleutelPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
      },
      nuIso,
    });
    const mndUitgesteld = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_uitgesteld_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['herstel'],
        toegestaneOpslagLagen: ['persoonlijke_geheime_gegevens'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['registreer_uitgestelde_operatie', 'controleer_uitvoering_uitgestelde_operatie'],
        objectIds: [uitgesteldeOp.operatieId],
      },
      knOpdrachtgever,
    );
    await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'registreer_uitgestelde_operatie',
      operatie: uitgesteldeOp,
      mandaat: mndUitgesteld,
    });
    srvStreng1.stelLokaalStilDwangAlarmIn(true, persoon.staat.oprichting.persoonsId);
    const rDwangOmzeilPoging = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'controleer_uitvoering_uitgestelde_operatie',
      operatieId: uitgesteldeOp.operatieId,
      toegestaneAnnuleerPubSleutels: [persoon.staat.actieveWortelPubDerB64u],
      actiefStilDwangAlarm: false,
      nuIso: new Date(Date.parse(nuIso) + 80 * 3600_000).toISOString(),
      mandaat: mndUitgesteld,
    });
    srvStreng1.stelLokaalStilDwangAlarmIn(false, persoon.staat.oprichting.persoonsId);

    check(
      'В-3 та В-4: суворий вузол вимагає objectIds, потрібний machtDomein, чинний час klok, первинний підпис FROST від beginAnker і не довіряє мережевому actiefStilDwangAlarm: false при локальній тривозі',
      rZonderObj.antwoord.ok === false
      && (rZonderObj.antwoord.details ?? []).includes('MANDAAT_ZONDER_OBJECTBEREIK')
      && rVreemdeVoogd.antwoord.ok === false
      && (rVreemdeVoogd.antwoord.details ?? []).includes('MANDAAT_OBJECT_NIET_TOEGESTAAN')
      && rEigenVoogd.antwoord.ok === true
      && rVerlopenVolgensKlok.antwoord.ok === false
      && (rVerlopenVolgensKlok.antwoord.details ?? []).includes('MANDAAT_VERLOPEN_OF_NOG_NIET_GELDIG')
      && vNanNu.ok === false
      && vNanNu.fouten.includes('MANDAAT_TIJDSVENSTER_ONGELDIG')
      && rVerkeerdDomein.antwoord.ok === false
      && (rVerkeerdDomein.antwoord.details ?? []).includes('MANDAAT_MACHT_DOMEIN_NIET_TOEGESTAAN')
      && rZonderAnker.antwoord.ok === false
      && rZonderAnker.antwoord.fout === 'GEEN_VERTROUWD_BEGINANKER'
      && rZonderFrostSig.antwoord.ok === false
      && rZonderFrostSig.antwoord.fout === 'GRONDWET_AANVANKELIJK_FROST_BEWIJS_VEREIST'
      && verifieerAanvankelijkeGrondwetFrostHandtekening({
        grondwet: grondwet022,
        erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
        erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
        frostGroepsPubliekeSleutelHex: frostRaad.groepsPubHex,
        frostHandtekeningHex: initGwFrostHex,
      }) === true
      && rMetFrostSig.antwoord.ok === true
      && rDwangOmzeilPoging.antwoord.ok === true
      && rDwangOmzeilPoging.antwoord.actie === 'uitgestelde_operatie_uitvoerbaarheid'
      && rDwangOmzeilPoging.antwoord.magUitvoeren === false
      && rDwangOmzeilPoging.antwoord.redenIndienGeweigerd === 'KRITIEKE_OPERATIE_GEBLOKKEERD_WEGENS_DWANGBESCHERMING',
    );

    // ==================================================================
    // 4. В-6 + Н-8: 14 модулів «Насіння», реальне складання esbuild,
    //    перевірка конституції у спадкоємності, обидва ключі хранителя в beginAnker та 25 документів §44
    // ==================================================================
    const pqAuditor = maakHybridePostkwantumKnooppunt({
      type: 'gespecialiseerde_knooppunten',
      rollen: ['verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'auditor-022',
      nuIso,
    });
    const rap11 = stelOnafhankelijkAuditRapportSamen({
      auditor: pqAuditor,
      hybrideCryptografieBewezen: true,
      overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
      cryptoAudit38: KLIMOP_CRYPTO_AUDIT_SCENARIOS.map((scenarioId) => ({
        scenarioId,
        aanvalAfgeslagenOfOverleefd: true,
        gebruikteStandaardPrimitief: 'Ed25519 / ML-DSA-65',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: scenarioId,
      })),
      mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
      autonomieAudit40: KLIMOP_AUTONOMIE_SCENARIOS.map((scenarioId) => ({
        scenarioId,
        praktischBeproefd: true,
        kernFunctiesBehouden: true,
        geenEnkelePartijKreegAlleenheerschappij: true,
        bewijsSamenvatting: scenarioId,
      })),
      meetbareGaranties41: KLIMOP_MEETBARE_GARANTIES_IDS.map((garantieId) => {
        const min = garantieId === 'min_onafhankelijke_beschikbare_kopieen'
          || garantieId === 'compromitteringsdrempel_kritieke_operatie'
          || garantieId === 'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct';
        return {
          garantieId,
          grensWaarde: min ? 3 : 1000,
          feitelijkGemetenWaarde: min ? 3 : 10,
          richting: min ? ('minstens' as const) : ('hoogstens' as const),
          meetMethode: garantieId,
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting' as const,
          eenheid: 'eenheid',
          bronSha256: 'd'.repeat(64),
        };
      }),
      antwoorden15: geldigeAntwoorden15,
      openstaandeKritiekeZwaktes: [],
      nuIso,
    });
    const zp = stelKlimopZaadPakketSamen({
      versieLabel: 'zaad-022',
      etappe11Rapport: rap11.rapport,
      erkendeAuditorSleutels: [{
        auditorKnooppuntId: pqAuditor.identiteit.knooppuntId,
        ed25519PubliekDerB64u: pqAuditor.ed25519PubliekDerB64u,
        mlDsa65PubliekSpkiB64u: pqAuditor.mlDsa65PubliekSpkiB64u,
      }],
      grondwet: grondwet022,
      startToetredingsKnooppunten: [knStreng1.identiteit, knStreng2.identiteit],
      onderdelen: KLIMOP_TWAALF_KERNMODULES.map((pad) => ({ pad, inhoudUtf8: lees(pad) })),
      zaadBewaarder: pqBewaarder,
      tekenMetFrostGroep: (b) => tekenFrost(b, [frostRaad.delen[0], frostRaad.delen[1]], frostRaad.groepsPubHex, frostRaad.deelnemerPubMap, 2),
      nuIso,
    });
    if (!zp.ok) throw new Error(zp.fout);

    const schoneZaadMap = mkdtempSync(join(tmpdir(), 'klimop-022-zaad-esbuild-'));
    let esbuildBundelOk = false;
    try {
      const herbouw = herbouwEcosysteemUitZaadOpSchoonMilieu({
        pakket: zp.pakket,
        nieuweGeneratieKnooppunten: [knStreng1.identiteit, knStreng2.identiteit, knZonderAnker.identiteit],
        verbindingMetOudeServerGebruikt: false,
        doelMap: schoneZaadMap,
      });
      // Створюємо вхідну точку, що імпортує всі 14 розпакованих модулів у чистому тимчасовому каталозі, та збираємо через esbuild
      const ingangPad = join(schoneZaadMap, 'zaad-ingang.ts');
      writeFileSync(
        ingangPad,
        KLIMOP_TWAALF_KERNMODULES.map((p, idx) => `import * as m${idx} from './${p.replace(/\.ts$/, '')}';\nexport { m${idx} };`).join('\n'),
        'utf8',
      );
      const gebundeld = await esbuild.build({
        entryPoints: [ingangPad],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'esm',
        logLevel: 'silent',
      });
      esbuildBundelOk =
        herbouw.ok === true
        && herbouw.opSchijfGeschrevenEnGeverifieerd === true
        && gebundeld.outputFiles.length === 1
        && gebundeld.outputFiles[0].contents.length > 20_000;
    } finally {
      rmSync(schoneZaadMap, { recursive: true, force: true });
    }

    // Перевіряємо, що вузол із неповним якорем (без ML-DSA-65 хранителя) відхиляє пакет «Насіння», а повний — приймає
    const mndZaadHalf = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_zaad_half_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvHalfAnker.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie', 'opslag'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['bewaar_gevalideerd_zaad_pakket'],
        objectIds: [zp.pakket.zaadId],
      },
      knOpdrachtgever,
    );
    const mndZaadVol = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_zaad_vol_022',
        uitgeverKnooppuntId: knOpdrachtgever.identiteit.knooppuntId,
        ontvangerKnooppuntId: srvStreng1.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie', 'opslag'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
        toegestaneActies: ['bewaar_gevalideerd_zaad_pakket'],
        objectIds: [zp.pakket.zaadId],
      },
      knOpdrachtgever,
    );
    const rZaadHalf = await netStreng.roepOpdrachtAan(srvHalfAnker.identiteit.knooppuntId, {
      actie: 'bewaar_gevalideerd_zaad_pakket',
      pakket: zp.pakket,
      mandaat: mndZaadHalf,
    });
    const rZaadVol = await netStreng.roepOpdrachtAan(srvStreng1.identiteit.knooppuntId, {
      actie: 'bewaar_gevalideerd_zaad_pakket',
      pakket: zp.pakket,
      mandaat: mndZaadVol,
    });

    // Перевірка форми нової конституції у спадкоємності (verifieerOpvolgingsOverdracht)
    const frostNieuw = maakFrostGroep('raad_022_v2', 2, 3);
    const geldigeNieuweGw: KlimopBestuursGrondwet = {
      ...grondwet022,
      versieVolgnummer: 2,
      frostSetId: 'raad_022_v2',
      frostGroepsPubliekeSleutelHex: frostNieuw.groepsPubHex,
    };
    const opvolgingRes = stelOpvolgingsOverdrachtSamen({
      vorigeGrondwet: grondwet022,
      nieuweGrondwet: geldigeNieuweGw,
      aangekondigdOp: nuIso,
      bekrachtigdOp: new Date(Date.parse(nuIso) + 80 * 3600_000).toISOString(),
      tekenMetVorigFrostQuorum: (b) => tekenFrost(b, [frostRaad.delen[0], frostRaad.delen[1]], frostRaad.groepsPubHex, frostRaad.deelnemerPubMap, 2),
      tekenMetNieuwFrostQuorum: (b) => tekenFrost(b, [frostNieuw.delen[0], frostNieuw.delen[1]], frostNieuw.groepsPubHex, frostNieuw.deelnemerPubMap, 2),
    });
    if (!opvolgingRes.ok) throw new Error(opvolgingRes.fout);
    const beschadigdeOpvolging = {
      ...opvolgingRes.overdracht,
      nieuweGrondwet: { ...geldigeNieuweGw, drempel: 9, totaalHoeders: 3 },
    };
    const vBeschadigdeOpvolging = verifieerOpvolgingsOverdracht(beschadigdeOpvolging, grondwet022);
    const doc25Verslag = controleerVijfentwintigVerplichteDocumenten(process.cwd());

    check(
      'В-6 та Н-8: пакет «Насіння» містить усі 14 модулів ядра і збирається через esbuild на чистому дереві, вимагає обидва ключі хранителя в beginAnker, перевіряє конституцію спадкоємності та 25 пар документів §44',
      KLIMOP_TWAALF_KERNMODULES.length === 14
      && KLIMOP_TWAALF_KERNMODULES.includes('shared/klimop/diensten-catalogus.ts')
      && KLIMOP_TWAALF_KERNMODULES.includes('shared/klimop/drempel-vervoer.ts')
      && esbuildBundelOk === true
      && rZaadHalf.antwoord.ok === false
      && rZaadVol.antwoord.ok === true
      && vBeschadigdeOpvolging.ok === false
      && doc25Verslag.bevestigdAantal === 25
      && doc25Verslag.gedeeltelijkAantal === 0
      && doc25Verslag.ontbrekendAantal === 0,
    );
  } finally {
    await Promise.all([srvStreng1.sluit(), srvHalfAnker.sluit(), srvZonderAnker.sluit()]);
  }

  // ==================================================================
  // 5. В-5 + Н-7: Повний потоковий SHA-256 контрольної точки великого файла,
  //    режим alleenLezenZonderMutatie без запису у теці власника, фільтр .lock і роздільний ліміт на агента
  // ==================================================================
  const overdrachtMap = mkdtempSync(join(tmpdir(), 'klimop-022-overdracht-'));
  try {
    // Наповнюємо журнал spiegel-logboek.jsonl понад 45 КіБ (120 записів), щоб середина файла лежала далеко за межами останніх 16 КіБ
    for (let i = 0; i < 120; i++) {
      voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak', steekproefGrootte: 3 }, { staatMap: overdrachtMap });
    }
    const logPad = join(overdrachtMap, 'spiegel-logboek.jsonl');
    const grootteBytes = statSync(logPad).size;
    // Перше читання записує контрольну точку з повним SHA-256 файла
    const voorCorruptie = leesKlimopSpiegelLogboek({ staatMap: overdrachtMap });
    // Підмінюємо один символ у середині файла (на зміщенні ~8 КіБ, без зміни загального розміру і без зачіпання хвоста 16 КіБ!)
    const fd = openSync(logPad, 'r+');
    try {
      const buf1 = Buffer.from('X', 'utf8');
      writeSync(fd, buf1, 0, 1, 4096);
    } finally {
      closeSync(fd);
    }
    const naMiddenCorruptie = leesKlimopSpiegelLogboek({ staatMap: overdrachtMap });

    // Створюємо чисту теку власника з штучним незавершеним WAL та чужим файлом overdracht.lock:
    // перевіряємо, що alleenLezenZonderMutatie та інструменти MCP нічого не змінюють у теці власника й не блокуються замком
    const eigenaarMap = mkdtempSync(join(tmpdir(), 'klimop-022-alleenlezen-'));
    try {
      voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak', steekproefGrootte: 3 }, { staatMap: eigenaarMap });
      rmSync(join(eigenaarMap, 'spiegel-logboek.jsonl.checkpoint.json'), { force: true });
      writeFileSync(join(eigenaarMap, 'overdracht.lock'), '999999\n', 'utf8');
      const voorOpname = readdirSync(eigenaarMap).sort().map((f) => `${f}:${statSync(join(eigenaarMap, f)).size}`).join('|');

      leesKlimopSpiegelLogboek({ staatMap: eigenaarMap, alleenLezenZonderMutatie: true });
      leesKlimopDubbelSchrijvenLogboek({ staatMap: eigenaarMap, alleenLezenZonderMutatie: true });
      leesKlimopQuorumAttestLogboek({ staatMap: eigenaarMap, alleenLezenZonderMutatie: true });

      _klimopMcpLimietenLeeg();
      const mcpOv = await voerKlimopToolUit(
        { userId: '77', clientName: 'claude', agent: 'claude' },
        KLIMOP_OVERZICHT,
        {},
        { staatMap: eigenaarMap },
      );
      const mcpLog = await voerKlimopToolUit(
        { userId: '77', clientName: 'claude', agent: 'claude' },
        KLIMOP_SPIEGEL_LOGBOEK,
        {},
        { staatMap: eigenaarMap },
      );
      // Пісочниця MCP не копіює overdracht.lock, тому проба у тимчасовій копії миттєво проходить без блокування!
      const mcpProef = await voerKlimopToolUit(
        { userId: '77', clientName: 'claude', agent: 'claude' },
        KLIMOP_PASSIEVE_SPIEGEL,
        { dienstId: 'postvak', steekproefGrootte: 3 },
        { staatMap: eigenaarMap },
      );

      const naOpname = readdirSync(eigenaarMap).sort().map((f) => `${f}:${statSync(join(eigenaarMap, f)).size}`).join('|');

      // Н-7: вичерпуємо ліміт (240 викликів/год) для агента 'claude', але агент 'gemini' того самого власника зберігає незалежну квоту
      _klimopMcpLimietenLeeg();
      let claudeGeblokkeerd = false;
      for (let i = 0; i < 245; i++) {
        const u = await voerKlimopToolUit(
          { userId: '88', clientName: 'claude', agent: 'claude' },
          KLIMOP_SPIEGEL_LOGBOEK,
          {},
          { staatMap: eigenaarMap },
        );
        if (u.isError) claudeGeblokkeerd = true;
      }
      const geminiOnafhankelijk = await voerKlimopToolUit(
        { userId: '88', clientName: 'gemini', agent: 'gemini' },
        KLIMOP_SPIEGEL_LOGBOEK,
        {},
        { staatMap: eigenaarMap },
      );
      _klimopMcpLimietenLeeg();

      check(
        'В-5 та Н-7: повний SHA-256 контрольної точки ловить підміну байта в середині великого журналу (> 32 КіБ), читання й пісочниця MCP не мутують теку власника і не копіюють .lock, а ліміт частоти розділений за агентом',
        grootteBytes > 36_000
        && voorCorruptie.ketenIntegriteit.ok === true
        && naMiddenCorruptie.ketenIntegriteit.ok === false
        && voorOpname === naOpname
        && !existsSync(join(eigenaarMap, 'spiegel-logboek.jsonl.checkpoint.json'))
        && !mcpOv.isError
        && !mcpLog.isError
        && !mcpProef.isError
        && claudeGeblokkeerd === true
        && !geminiOnafhankelijk.isError,
      );
    } finally {
      rmSync(eigenaarMap, { recursive: true, force: true });
    }
  } finally {
    rmSync(overdrachtMap, { recursive: true, force: true });
  }

  // ==================================================================
  // 6. С-1, С-2, С-3, С-4: закриті відмови дат і сеансів «Стебел», прив'язка ML-DSA-65,
  //    юрисдикційний кворум і точки зобов'язання FROST
  // ==================================================================
  let crdtNanFout = '';
  try {
    const appSleutels = maakEd25519Sleutels();
    maakOndertekendeCrdtOperatie({
      dienstId: 'notities',
      dienstPsid: 'psid1_proef022',
      elementId: 'el-1',
      soort: 'zet',
      versleuteldeWaarde: Buffer.from('abc', 'utf8'),
      hlc: maakHlcStempel(Date.now(), 0, 'kn-1'),
      apparaatId: 'app-1',
      apparaatSleutels: appSleutels,
      nuIso: 'недійсна-дата',
    });
  } catch (e) {
    crdtNanFout = e instanceof Error ? e.message : String(e);
  }

  const knStA = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'NL', aanbieder: 'st-a', nuIso });
  const knStB = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'CH', aanbieder: 'st-b', nuIso });
  const hdrAanvr = maakStengelHanddrukAanvraag(knStA, knStB.identiteit.knooppuntId, { nuIso });
  const hdrAntw = beantwoordStengelHanddruk(knStB, hdrAanvr.aanvraag, { nuIso, sessieTtlMs: 5_000 });
  if (!hdrAntw.ok) throw new Error(hdrAntw.fout);
  const hdrVol = voltooiStengelHanddruk(knStA, hdrAanvr, hdrAntw.antwoord, { nuIso, sessieTtlMs: 5_000 });
  if (!hdrVol.ok) throw new Error(hdrVol.fout);
  const geldigKader = versleutelStengelKader(hdrVol.sessie, Buffer.from('перевірка', 'utf8'), {
    nuMs: Date.parse(nuIso) + 1_000,
  });
  let versleutelVerlopenFout = '';
  try {
    versleutelStengelKader(hdrVol.sessie, Buffer.from('прострочено', 'utf8'), {
      nuMs: Date.parse(nuIso) + 10_000,
    });
  } catch (e) {
    versleutelVerlopenFout = e instanceof Error ? e.message : String(e);
  }
  const ontsleutelVerlopen = ontsleutelStengelKader(hdrAntw.sessie, geldigKader, {
    nuMs: Date.parse(nuIso) + 10_000,
  });

  // С-2: перевірка прив'язки ML-DSA-65 у verifieerObjectManifest
  const pqEig1 = maakHybridePostkwantumKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'pq-eig-1',
    nuIso,
  });
  const pqEig2 = maakHybridePostkwantumKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'pq-eig-2',
    nuIso,
  });
  const kek022 = randomBytes(32);
  const pqObj = versleutelEnVerdeelObject({
    inhoud: Buffer.from('постквантова прив’язка ключа', 'utf8'),
    objectId: 'obj_022_pq',
    eigenaar: { identiteit: pqEig1.identiteit, geheimeSleutelPkcs8B64u: pqEig1.ed25519GeheimPkcs8B64u },
    postkwantumEigenaarSleutels: {
      mlDsa65PubliekSpkiB64u: pqEig1.mlDsa65PubliekSpkiB64u,
      mlDsa65GeheimPkcs8B64u: pqEig1.mlDsa65GeheimPkcs8B64u,
    },
    vereisPostkwantumRang20: true,
    kek: kek022,
    k: 2,
    m: 1,
    profiel: 'klimop-v2-pq-voorbereid',
    laag: 'persoonlijke_geheime_gegevens',
    epoche: 1,
    nuIso,
  });
  const vPqVreemdeSleutel = verifieerObjectManifest(pqObj.manifest, {
    verwachteMlDsa65PubliekSpkiB64u: pqEig2.mlDsa65PubliekSpkiB64u,
  });
  const vPqEigenSleutel = verifieerObjectManifest(pqObj.manifest, {
    verwachteMlDsa65PubliekSpkiB64u: pqEig1.mlDsa65PubliekSpkiB64u,
  });

  // С-3: 4 вузли в NL + 1 вузол у CH при порозі drempelK = 3 дають EEN_JURISDICTIE_HEEFT_QUORUM:NL
  const vierNlEenCh = [
    maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'NL', aanbieder: 'nl-1', nuIso }).identiteit,
    maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'NL', aanbieder: 'nl-2', nuIso }).identiteit,
    maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'NL', aanbieder: 'nl-3', nuIso }).identiteit,
    maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'NL', aanbieder: 'nl-4', nuIso }).identiteit,
    maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'CH', aanbieder: 'ch-1', nuIso }).identiteit,
  ];
  const jurRes = controleerKnooppuntOnafhankelijkheid(vierNlEenCh, 3);

  // С-4: дублікат deelnemerIndex у frostVoegHandtekeningSamen
  const frostC4 = maakFrostGroep('frost_c4', 2, 3);
  const boodC4 = Buffer.from('перевірка FROST С-4', 'utf8');
  const r1C4 = [frostC4.delen[0], frostC4.delen[1]].map((d) => frostRonde1MaakToezegging(d));
  const toezC4 = r1C4.map((x) => x.publiek);
  const dSig0 = frostRonde2TekenDeel({
    deel: frostC4.delen[0],
    geheimeNonceStaat: r1C4[0].geheimeNonceStaat,
    boodschap: boodC4,
    toezeggingenLijst: toezC4,
    groepsPubliekeSleutelHex: frostC4.groepsPubHex,
  });
  if (!dSig0.ok) throw new Error(dSig0.fout);
  const dubbeleDeelnemerUit = frostVoegHandtekeningSamen({
    boodschap: boodC4,
    toezeggingenLijst: toezC4,
    deelHandtekeningen: [dSig0.deelHandtekening, dSig0.deelHandtekening],
    deelnemerPubliekeSleutelsHex: frostC4.deelnemerPubMap,
    groepsPubliekeSleutelHex: frostC4.groepsPubHex,
    drempel: 2,
  });

  check(
    'С-1..С-4: закриті відмови NaN-дат і прострочених сеансів «Стебел», прив’язка ключа ML-DSA-65 маніфесту, виявлення юрисдикційної концентрації кворуму та блокування дублікатів індексів у FROST',
    crdtNanFout.length > 0
    && versleutelVerlopenFout === 'STENGEL_SESSIE_VERLOPEN'
    && ontsleutelVerlopen.ok === false
    && ontsleutelVerlopen.fout === 'STENGEL_SESSIE_VERLOPEN'
    && vPqVreemdeSleutel.ok === false
    && vPqVreemdeSleutel.fout === 'MANIFEST_POSTKWANTUM_SLEUTEL_KOMT_NIET_OVEREEN'
    && vPqEigenSleutel.ok === true
    && jurRes.ok === false
    && jurRes.fouten.includes('EEN_JURISDICTIE_HEEFT_QUORUM:NL')
    && dubbeleDeelnemerUit.ok === false,
  );

  // ==================================================================
  // 7. С-5 + С-6: Схема KLIMOP_TOOLS (етапи 0..16, antwoorden15, 14 заборон §43)
  //    та чесний поіменний розбір доказів у KlimopPaneel
  // ==================================================================
  const toetsDef = KLIMOP_TOOLS.find((t) => t.name === KLIMOP_ARCHITECTUUR_TOETS);
  const schemaProps = (toetsDef?.inputSchema as { properties?: Record<string, any> } | undefined)?.properties ?? {};
  const vrijTekstZonderSleutel = ontleedVoorstelBewijsNaarAntwoorden('Довільний загальний опис без ідентифікатора питання');
  const eenVraagBewijs = ontleedVoorstelBewijsNaarAntwoorden('geen_nieuw_spof: Перевірено в модульному випробуванні 022');
  const sjabloonLeeg = ontleedVoorstelBewijsNaarAntwoorden(maakLeegVragenBewijsSjabloon());
  const eenVraagBeoordeling = beoordeelKlimopWijziging({
    naam: 'Лише одне оцінене питання',
    fase: 16,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: eenVraagBewijs as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>,
    aanwezigeVerbodenVereenvoudigingen: [],
  });

  check(
    'С-5 та С-6: схема klimop_architectuur_toets охоплює етапи 0..16 і antwoorden15, один рядок більше не розмножується на 15 питань, а список заборон §43 містить усі 14 позицій',
    schemaProps.fase?.maximum === 16
    && Boolean(schemaProps.antwoorden15)
    && Boolean(schemaProps.aanwezigeVerbodenVereenvoudigingen)
    && Object.keys(vrijTekstZonderSleutel).length === 0
    && Object.keys(sjabloonLeeg).length === 0
    && Object.keys(eenVraagBewijs).length === 1
    && eenVraagBeoordeling.goedgekeurd === false
    && eenVraagBeoordeling.ontbrekendeOfGefaaldeVragen.length === 14
    && KLIMOP_VEERTIEN_VERBODEN_LIJST.length === 14,
  );

  // ==================================================================
  // 8. С-7 + С-8: Багатоланкова підписана естафета [A, R1, R2, B] та автоматичний відкат хвилі
  // ==================================================================
  const knAfz = maakKlimopKnooppunt({ type: 'persoonlijke_gebruikersapparaten', rollen: ['verificatie', 'opslag'], juridischeRegio: 'NL', aanbieder: 'afz-022', nuIso });
  const knR1 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie', 'opslag', 'verbinding'], juridischeRegio: 'CH', aanbieder: 'rel-1', nuIso });
  const knR2 = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie', 'opslag', 'verbinding'], juridischeRegio: 'UA', aanbieder: 'rel-2', nuIso });
  const knDoel = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie', 'opslag'], juridischeRegio: 'IS', aanbieder: 'doel-022', nuIso });

  const srvR1 = await startKlimopProefKnooppunt({
    knooppunt: knR1,
    vertrouwdeUitgevers: [knAfz.identiteit.knooppuntId],
  });
  const srvR2 = await startKlimopProefKnooppunt({
    knooppunt: knR2,
    vertrouwdeUitgevers: [knAfz.identiteit.knooppuntId],
  });
  const srvDoel = await startKlimopProefKnooppunt({
    knooppunt: knDoel,
    vertrouwdeUitgevers: [knAfz.identiteit.knooppuntId],
  });

  try {
    // Маршрут тільки через 2 проміжні вузли: Afz -> R1 -> R2 -> Doel (pad.length === 4)
    srvR1.registreerBuurAdres(srvR2.identiteit.knooppuntId, srvR2.basisUrl);
    srvR2.registreerBuurAdres(srvDoel.identiteit.knooppuntId, srvDoel.basisUrl);

    const estafetteRoutes = new KlimopRouteTabel();
    estafetteRoutes.voegTweerichtingsStengelToe(knAfz.identiteit.knooppuntId, srvR1.identiteit.knooppuntId, 5);
    estafetteRoutes.voegTweerichtingsStengelToe(srvR1.identiteit.knooppuntId, srvR2.identiteit.knooppuntId, 5);
    estafetteRoutes.voegTweerichtingsStengelToe(srvR2.identiteit.knooppuntId, srvDoel.identiteit.knooppuntId, 5);

    const netEstafette = new KlimopNetwerkClient(
      knAfz,
      new Map([
        [srvR1.identiteit.knooppuntId, srvR1.basisUrl],
        [srvR2.identiteit.knooppuntId, srvR2.basisUrl],
        [srvDoel.identiteit.knooppuntId, srvDoel.basisUrl],
      ]),
      estafetteRoutes,
    );

    const rPingMultiHop = await netEstafette.roepOpdrachtAan(srvDoel.identiteit.knooppuntId, {
      actie: 'ping',
      bericht: 'багатоланкова-естафета-022',
    });

    // Спроба підробити підпис конверта естафети на R1 має отримати 403 ESTAFETTE_HANDTEKENING_ONGELDIG
    const nepEstafetteResp = await fetch(`${srvR1.basisUrl}/klimop/v1/estafette`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: 1,
        vanKnooppuntId: knAfz.identiteit.knooppuntId,
        doelKnooppuntId: srvDoel.identiteit.knooppuntId,
        doelPad: '/klimop/v1/handdruk',
        verpakteInhoud: { nep: true },
        resterendPad: [srvR2.identiteit.knooppuntId, srvDoel.identiteit.knooppuntId],
        afzenderIdentiteit: knAfz.identiteit,
        handtekeningB64u: Buffer.alloc(64, 7).toString('base64url'),
        hopTeller: 1,
      }),
    });
    const nepEstafetteJson = (await nepEstafetteResp.json()) as { ok: boolean; fout?: string };

    // С-8: хвильове встановлення на хвилі [R1, R2] + хвилі 2 [Doel], де R1 проходить, а R2 падає за показниками здоров'я:
    // R1 має бути автоматично відкочений назад до версії 1, а Doel — не зачеплений!
    const drempelRoutes = new KlimopRouteTabel();
    for (const s of [srvR1, srvR2, srvDoel]) {
      drempelRoutes.voegTweerichtingsStengelToe(knAfz.identiteit.knooppuntId, s.identiteit.knooppuntId, 2);
    }
    const netDirect = new KlimopNetwerkClient(
      knAfz,
      new Map([
        [srvR1.identiteit.knooppuntId, srvR1.basisUrl],
        [srvR2.identiteit.knooppuntId, srvR2.basisUrl],
        [srvDoel.identiteit.knooppuntId, srvDoel.basisUrl],
      ]),
      drempelRoutes,
    );
    const drempelClient = new KlimopDrempelOndertekenaarClient(netDirect);
    const dkgC8 = await drempelClient.voerNetwerkDkgUit({
      setId: 'uitrol_c8_frost',
      opdrachtgever: knAfz,
      knooppunten: [srvR1.identiteit, srvR2.identiteit, srvDoel.identiteit],
      drempel: 2,
      nuIso,
    });
    if (!dkgC8.ok) throw new Error(dkgC8.fout);

    // Піднімаємо 3 випробувальні вузли з початковим якорем цієї групи DKG для перевірки хвильового відкочування С-8
    const srvGolf1A = await startKlimopProefKnooppunt({
      knooppunt: knR1,
      beginAnker: { frostGroepsPubliekeSleutelHex: dkgC8.groep.groepsPubliekeSleutelHex },
    });
    const srvGolf1B = await startKlimopProefKnooppunt({
      knooppunt: knR2,
      beginAnker: { frostGroepsPubliekeSleutelHex: dkgC8.groep.groepsPubliekeSleutelHex },
    });
    const srvGolf2 = await startKlimopProefKnooppunt({
      knooppunt: knDoel,
      beginAnker: { frostGroepsPubliekeSleutelHex: dkgC8.groep.groepsPubliekeSleutelHex },
    });
    try {
      // Маршрутизуємо підписи FROST до перших 3 вузлів DKG, додавши окремий клієнт для вузлів хвильового випуску
      const golfNet = new KlimopNetwerkClient(
        knAfz,
        new Map([
          [srvGolf1A.identiteit.knooppuntId, srvGolf1A.basisUrl],
          [srvGolf1B.identiteit.knooppuntId, srvGolf1B.basisUrl],
          [srvGolf2.identiteit.knooppuntId, srvGolf2.basisUrl],
        ]),
        drempelRoutes,
      );
      const bestuurClient = new KlimopBestuurEnUitrolClient(golfNet, drempelClient);
      const gwC8: KlimopBestuursGrondwet = {
        schema: 1,
        grondwetId: 'gw_c8',
        versieVolgnummer: 1,
        frostSetId: dkgC8.groep.setId,
        frostGroepsPubliekeSleutelHex: dkgC8.groep.groepsPubliekeSleutelHex,
        drempel: 2,
        totaalHoeders: 3,
        erkendeHoeders: [srvGolf1A.identiteit, srvGolf1B.identiteit, srvGolf2.identiteit],
        overgangsNoodVetoPubDerB64u: null,
        vastgesteldOp: nuIso,
      };
      const omgC8 = await bestuurClient.stelGrondwetOpNetwerkIn({
        netwerkId: 'net_c8',
        opdrachtgever: knAfz,
        grondwet: gwC8,
        frostGroep: dkgC8.groep,
        knooppunten: [srvGolf1A.identiteit, srvGolf1B.identiteit, srvGolf2.identiteit],
        erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
        erkendeTijdstempelRolPubDerB64u: tijdSleutels.publiekeSleutelDerB64u,
        nuIso,
      });
      if (!omgC8.ok) throw new Error(omgC8.fout);

      const schoonPakket = Buffer.from('klimop-veilige-uitgave-v2-022', 'utf8');
      const schoonWeb = Buffer.from('klimop-web-v2-022', 'utf8');
      const bundelV2 = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
        omgeving: omgC8.omgeving,
        versieLabel: '20261121-202200',
        uitgaveVolgnummer: 2,
        minCompatibelVolgnummer: 1,
        pakketInhoud: schoonPakket,
        webClientBundelInhoud: schoonWeb,
        afhankelijkhedenBoomSha256: createHash('sha256').update('deps-c8').digest('hex'),
        bronCommitSha40: 'e'.repeat(40),
        ontwikkelarchiefSha256: 'f'.repeat(64),
        auteurSoort: 'menselijke_deelnemer',
        auteurId: 'eigenaar',
        doelenRolSleutels: doelenSleutels,
        tijdstempelRolSleutels: tijdSleutels,
        nuIso,
      });
      if (!bundelV2.ok) throw new Error(bundelV2.fout);

      const golfUitrol = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: omgC8.omgeving,
        bundel: bundelV2.bundel,
        pakketInhoud: schoonPakket,
        webClientBundelInhoud: schoonWeb,
        golven: [
          [srvGolf1A.identiteit.knooppuntId, srvGolf1B.identiteit.knooppuntId],
          [srvGolf2.identiteit.knooppuntId],
        ],
        gesimuleerdeMetingPerKnooppuntId: {
          [srvGolf1B.identiteit.knooppuntId]: { procesGestart: false },
        },
        nuIso,
      });

      check(
        'С-7 та С-8: 4-вузлова підписана естафета [A, R1, R2, B] доставляє зашифровану команду й відхиляє підроблений підпис (403), а збій другого вузла хвилі автоматично відкочує перший вузол назад на версію 1',
        rPingMultiHop.gebruiktPad.length === 4
        && rPingMultiHop.antwoord.ok === true
        && rPingMultiHop.antwoord.actie === 'pong'
        && srvR1.estafetteTeller() >= 2
        && srvR2.estafetteTeller() >= 2
        && nepEstafetteResp.status === 403
        && nepEstafetteJson.fout === 'ESTAFETTE_HANDTEKENING_ONGELDIG'
        && golfUitrol.voltooid === false
        && golfUitrol.status === 'automatisch_gestopt_en_teruggedraaid'
        && (golfUitrol.teruggedraaideKnooppuntIds ?? []).includes(srvGolf1A.identiteit.knooppuntId)
        && srvGolf1A.actiefUitgaveVolgnummer() === 1
        && srvGolf1B.actiefUitgaveVolgnummer() === 1
        && srvGolf2.actiefUitgaveVolgnummer() === 1
        && golfUitrol.nietAangeraakteKnooppuntIds.includes(srvGolf2.identiteit.knooppuntId),
      );
    } finally {
      await Promise.all([srvGolf1A.sluit(), srvGolf1B.sluit(), srvGolf2.sluit()]);
    }
  } finally {
    await Promise.all([srvR1.sluit(), srvR2.sluit(), srvDoel.sluit()]);
  }

  // ==================================================================
  // 9. С-9: Сталий час порівняння сховищ та перевірка alarmId при знятті помилкової тривоги
  // ==================================================================
  const zout32 = randomBytes(32);
  const hoofdGeheim = leidKluisGeheimUitWachtzin('основна-таємна-фраза-власника-022', zout32);
  const dwangGeheim = leidKluisGeheimUitWachtzin('окрема-захисна-фраза-примусу-022', zout32);
  const hoofdVer = berekenKluisVerifierHex(hoofdGeheim, zout32);
  const dwangVer = berekenKluisVerifierHex(dwangGeheim, zout32);
  const kluisHoofd = leidScheidbareKluisContextAf({
    ingevoerdGeheimMateriaal: hoofdGeheim,
    kluisZout32: zout32,
    verwachteHoofdVerifierHex: hoofdVer,
    verwachteDwangVerifierHex: dwangVer,
  });
  const kluisDwang = leidScheidbareKluisContextAf({
    ingevoerdGeheimMateriaal: dwangGeheim,
    kluisZout32: zout32,
    verwachteHoofdVerifierHex: hoofdVer,
    verwachteDwangVerifierHex: dwangVer,
  });
  const kluisKapotFormat = leidScheidbareKluisContextAf({
    ingevoerdGeheimMateriaal: hoofdGeheim,
    kluisZout32: zout32,
    verwachteHoofdVerifierHex: 'не-шістнадцятковий',
    verwachteDwangVerifierHex: dwangVer,
  });

  const eigSleutelsC9 = maakEd25519Sleutels();
  const voogdSleutelsC9 = maakEd25519Sleutels();
  const dwangProfiel: KlimopDwangBeschermingsProfiel = {
    persoonsId: persoon.staat.oprichting.persoonsId,
    vrijwilligIngeschakeld: true,
    fysiekGeweldRisicoBeoordeeldDoorGebruiker: true,
    automatischeGegevensVernietigingBijDwang: false,
    kritiekeActieWachttijdUren: 72,
    vertrouwenspersonenVoorAlarm: [
      {
        voogdId: 'voogd-c9',
        ed25519PubDerB64u: voogdSleutelsC9.publiekeSleutelDerB64u,
        x25519PubDerB64u: Buffer.alloc(44, 1).toString('base64url'),
      },
    ],
  };
  const oudeAlarmVerklaring = maakValsAlarmHerstelVerklaring({
    persoonsId: persoon.staat.oprichting.persoonsId,
    alarmId: 'alarm-oud-001',
    alarmGeactiveerdOp: '2026-11-21T10:00:00.000Z',
    eigenaarSleutels: eigSleutelsC9,
    voogdSleutels: { voogdId: 'voogd-c9', ...voogdSleutelsC9 },
    nuIso: '2026-11-21T12:00:00.000Z',
  });
  const herstelVerkeerdAlarmId = herstelNaValsDwangAlarm({
    profiel: dwangProfiel,
    verwachteEigenaarPubDerB64u: eigSleutelsC9.publiekeSleutelDerB64u,
    verwachtAlarmId: 'alarm-actief-002',
    verklaring: oudeAlarmVerklaring,
  });
  const herstelJuistAlarmId = herstelNaValsDwangAlarm({
    profiel: dwangProfiel,
    verwachteEigenaarPubDerB64u: eigSleutelsC9.publiekeSleutelDerB64u,
    verwachtAlarmId: 'alarm-oud-001',
    verwachtAlarmGeactiveerdOp: '2026-11-21T10:00:00.000Z',
    verklaring: oudeAlarmVerklaring,
  });

  check(
    'С-9: порівняння верифікаторів обох сховищ працює у сталий час і безпечно відхиляє хибний формат, а herstelNaValsDwangAlarm прив’язується до verwachtAlarmId',
    kluisHoofd.ok === true
    && kluisHoofd.geopendeKluis === 'hoofd_kluis'
    && kluisDwang.ok === true
    && kluisDwang.geopendeKluis === 'afgeschermde_nevenkluis'
    && kluisKapotFormat.ok === false
    && herstelVerkeerdAlarmId.ok === false
    && herstelVerkeerdAlarmId.fout === 'VALS_ALARM_ID_KOMT_NIET_OVEREEN'
    && herstelJuistAlarmId.ok === true,
  );

  // ==================================================================
  // 10. С-10, С-11, Н-1..Н-6: Навички, статті, покажчики, побайтові дзеркала,
  //     записи обліку AUDIT-003 + KLIMOP-022, відсутність грошових сум та Абсолютний мовний закон
  // ==================================================================
  const spiegelParen: ReadonlyArray<[string, string]> = [
    ['README.md', 'ОГЛЯД-ПРОЄКТУ.uk.md'],
    ['LEESMIJ.md', 'PROJECTOVERZICHT.nl.md'],
    ['docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md', 'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md'],
    ['docs/hub/КООРДИНАЦІЯ-ТА-РОЗГОРТАННЯ.md', 'docs/hub/КООРДИНАЦІЯ-ТА-РОЗГОРТАННЯ.uk.md'],
    ['docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.md', 'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md'],
    ['docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md', 'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md'],
    ['docs/hub/ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.md', 'docs/hub/ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.uk.md'],
    ['docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.md', 'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md'],
    ['docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.md', 'docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.uk.md'],
  ];
  const alleSpiegelsGelijk = spiegelParen.every(([a, b]) => lees(a) === lees(b));

  const etappe10Tekst = lees('scripts/klimop-etappe10-hechtranken-proef.mjs');
  const geenGeldEenheden =
    etappe10Tekst.includes('externeMiddelenBelastingEenheden')
    && !etappe10Tekst.includes('\u20ac')
    && !/\u0454\u0432\u0440\u043e|\u0442\u0430\u0440\u0438\u0444/i.test(etappe10Tekst);

  const herstelUkKoppen = (lees('docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md').match(/^## /gm) ?? []).length;
  const herstelNlKoppen = (lees('docs/hub/KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md').match(/^## /gm) ?? []).length;

  const skillUk = lees('.agents/skills/klimop-architectuur/SKILL.md');
  const skillUkExtra = lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md');
  const skillNl = lees('.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md');
  const movnyiNl = lees('.agents/skills/movnyi-zakon/VAARDIGHEID.nl.md');
  const vaardigheidSynchronisatieOk =
    skillUk.includes('1.6.0')
    && skillUkExtra.includes('1.6.0')
    && skillNl.includes('1.6.0')
    && skillUkExtra.includes('ПЛЮЩ-ЕТАП-16')
    && skillNl.includes('KLIMOP-FASE-16')
    && movnyiNl.toLowerCase().includes('absolute taalwet');

  const bijdrageAudit003Bestaat = existsSync('orchestratie/bijdragen/AUDIT-003/20261121-193700-antigravity.json');
  const bijdrageKlimop022Bestaat = existsSync('orchestratie/bijdragen/KLIMOP-022/20261121-213500-antigravity.json');

  const gecontroleerdeTeksten = [
    skillUk,
    skillUkExtra,
    skillNl,
    lees('docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md'),
    lees('docs/hub/KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md'),
  ];
  const geenTaalwetFout = gecontroleerdeTeksten.every((tekst) => !taalwetOvertreding(tekst));

  check(
    'С-10, С-11 та Н-1..Н-6: навички 1.6.0, покажчики, дзеркала .md, рівні заголовки ## (7 === 7), записи авторства AUDIT-003/KLIMOP-022, відсутність грошових сум та Абсолютний мовний закон дотримані',
    alleSpiegelsGelijk === true
    && geenGeldEenheden === true
    && herstelUkKoppen === 7
    && herstelNlKoppen === 7
    && vaardigheidSynchronisatieOk === true
    && bijdrageAudit003Bestaat === true
    && bijdrageKlimop022Bestaat === true
    && geenTaalwetFout === true,
  );

  return einde();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
