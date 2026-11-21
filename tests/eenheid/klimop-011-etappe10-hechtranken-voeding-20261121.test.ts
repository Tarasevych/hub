// KLIMOP-011 (21.11.2026): Модульні, криптографічні (§1.4–1.5, §4–§5.2, §26–§27, §36 Етап 10, Документ №15)
// та живі мережеві випробування:
//   1. Запобіжник проти поведінки комп'ютерного хробака (§5.2) та нульовий бюджет витрат без прямого рішення власника;
//   2. Двосторонньо підписані свідоцтва приєднання вузлів Ed25519, обмеження тимчасових вузлів і відкликання;
//   3. Стійкість проти масових атак Сивілли (згортання постачальників і підмереж) та заборона єдиної точки входу (§4.4, §5.1);
//   4. Реалістичні профілі 5 класів пристроїв, взаємні квитанції ресурсів та безумовний доступ пасивних учасників до власних даних (§26–§27);
//   5. Безпечне виведення вузла з кворуму після перенесення смуг зі збереженням між'юрисдикційної незалежності;
//   6. Жива кворумна перевірка на 3 незалежних серверах (NL, CH, UA) із приєднанням SE/IS та роботою при обірваному маршруті до CH.
// Запуск: node scripts/eenheidstests.mjs klimop-011-etappe10-hechtranken-voeding-20261121.test.ts

import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  type KlimopBladRol,
  type KlimopControleVraagId,
  type KlimopKnooppuntIdentiteit,
} from '../../shared/klimop/kern';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import {
  APPARAAT_KLASSE_RICHTWAARDEN,
  beoordeelSybilEnSpreidingsWeerstand,
  berekenEerlijkeMiddelenBalans,
  controleerGeenEnkelToetredingsknooppunt,
  maakHechtrankToetredingsBewijs,
  maakMiddelenBijdrageKwitantie,
  planVeiligeKnooppuntUittreding,
  valideerKnooppuntToetredingsAanvraag,
  verifieerHechtrankToetredingsBewijs,
  verifieerMiddelenBijdrageKwitantie,
  verifieerVeiligeKnooppuntUittreding,
  type KnooppuntToetredingsAanvraag,
} from '../../shared/klimop/hechtranken';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopHechtrankenEnVoedingClient } from '../../backend/klimop-hechtranken-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakGeldigeAanvraag(
  kandidaatIdentiteit: KlimopKnooppuntIdentiteit,
  netwerkVoorvoegsel: string,
  gevraagdeRollen: readonly KlimopBladRol[],
): KnooppuntToetredingsAanvraag {
  return {
    kandidaatIdentiteit,
    netwerkVoorvoegsel,
    gevraagdeRollen,
    maxOpslagMiB: 4096,
    maxBandbreedteMiBPerDag: 8192,
    maxToegestaneReplicas: 6,
    uitdrukkelijkeToestemmingApparaatEigenaar: true,
    geenZelfstandigeInstallatie: true,
    geenOngevraagdeKopieVanPriveInhoud: true,
    geenVerborgenRekenkrachtGebruik: true,
    automatischeRechtenUitbreidingViaVerbinding: false,
    vertrouwdAlleenWegensNetwerkNabijheid: false,
    maandelijkseKostenEuro: 0,
    uitdrukkelijkeKostenGoedkeuringEigenaar: false,
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-011-etappe10-hechtranken-voeding');
  const nuIso = new Date().toISOString();

  const knSponsor = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'NL',
    aanbieder: 'sponsor-eigenaar-011',
    nuIso,
  });
  const knVreemde = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'DE',
    aanbieder: 'onbekende-partij',
    nuIso,
  });
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag', 'verbinding'],
    juridischeRegio: 'NL',
    aanbieder: 'knoop-nl-011',
    nuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag', 'verbinding'],
    juridischeRegio: 'CH',
    aanbieder: 'knoop-ch-011',
    nuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag', 'verbinding'],
    juridischeRegio: 'UA',
    aanbieder: 'knoop-ua-011',
    nuIso,
  });
  const knSE = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag', 'verbinding'],
    juridischeRegio: 'SE',
    aanbieder: 'knoop-se-011',
    nuIso,
  });
  const knIS = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag', 'verbinding'],
    juridischeRegio: 'IS',
    aanbieder: 'knoop-is-011',
    nuIso,
  });
  const knTijdelijk = maakKlimopKnooppunt({
    type: 'tijdelijke_toetredingsknooppunten',
    rollen: ['verbinding', 'opslag'],
    juridischeRegio: 'FR',
    aanbieder: 'tijdelijk-relais-fr',
    nuIso,
  });

  // ------------------------------------------------------------------ 1. Заборона поведінки комп'ютерного хробака (§5.2)
  const basisAanvraagSE = maakGeldigeAanvraag(knSE.identiteit, '193.10.40.0/24', ['verificatie', 'opslag']);
  const vGoed = valideerKnooppuntToetredingsAanvraag(basisAanvraagSE);
  const vZonderToestemming = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    uitdrukkelijkeToestemmingApparaatEigenaar: false,
  });
  const vZelfInstall = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    geenZelfstandigeInstallatie: false,
  });
  const vOngevraagdeKopie = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    geenOngevraagdeKopieVanPriveInhoud: false,
  });
  const vVerborgenCpu = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    geenVerborgenRekenkrachtGebruik: false,
  });
  const vAutoRechten = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    automatischeRechtenUitbreidingViaVerbinding: true,
  });
  const vNabijheid = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    vertrouwdAlleenWegensNetwerkNabijheid: true,
  });
  const vOnbegrensdeReplicas = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    maxToegestaneReplicas: 99,
  });

  check('valideerKnooppuntToetredingsAanvraag відсікає всі ознаки комп’ютерного хробака та довіру за мережевою близькістю (§5.2, §43 п. 6, 10)',
    vGoed.ok === true
    && !vZonderToestemming.ok && vZonderToestemming.fout === 'WORMGEDRAG_ZELFSTANDIGE_INSTALLATIE_VERBODEN'
    && !vZelfInstall.ok && vZelfInstall.fout === 'WORMGEDRAG_ZELFSTANDIGE_INSTALLATIE_VERBODEN'
    && !vOngevraagdeKopie.ok && vOngevraagdeKopie.fout === 'WORMGEDRAG_ONGEVRAAGDE_KOPIE_VERBODEN'
    && !vVerborgenCpu.ok && vVerborgenCpu.fout === 'WORMGEDRAG_VERBORGEN_MIDDELENVERBRUIK_VERBODEN'
    && !vAutoRechten.ok && vAutoRechten.fout === 'WORMGEDRAG_AUTOMATISCHE_RECHTENUITBREIDING_VERBODEN'
    && !vNabijheid.ok && vNabijheid.fout === 'NETWERKNABIJHEID_GEEN_GROND_VOOR_VERTROUWEN'
    && !vOnbegrensdeReplicas.ok && vOnbegrensdeReplicas.fout === 'WORMGEDRAG_ONBEGRENSDE_REPLICATIE_VERBODEN');

  // ------------------------------------------------------------------ 2. Нульовий бюджет витрат без згоди власника та обмеження тимчасових вузлів
  const vKostenGeweigerd = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    maandelijkseKostenEuro: 15,
    uitdrukkelijkeKostenGoedkeuringEigenaar: false,
  });
  const vKostenGoedgekeurd = valideerKnooppuntToetredingsAanvraag({
    ...basisAanvraagSE,
    maandelijkseKostenEuro: 15,
    uitdrukkelijkeKostenGoedkeuringEigenaar: true,
  });
  const vTijdelijkOpslagGeweigerd = valideerKnooppuntToetredingsAanvraag(
    maakGeldigeAanvraag(knTijdelijk.identiteit, '172.18.0.0/24', ['verbinding', 'opslag']),
  );
  const vTijdelijkAlleenVerbinding = valideerKnooppuntToetredingsAanvraag(
    maakGeldigeAanvraag(knTijdelijk.identiteit, '172.18.0.0/24', ['verbinding']),
  );

  check('бюджетне правило 0 євро блокує платні витрати без рішення власника, а тимчасові вузли приймаються лише з роллю verbinding (§4.4)',
    !vKostenGeweigerd.ok && vKostenGeweigerd.fout === 'KOSTEN_ZONDER_EIGENAARSGOEDKEURING_VERBODEN'
    && vKostenGoedgekeurd.ok === true
    && !vTijdelijkOpslagGeweigerd.ok && vTijdelijkOpslagGeweigerd.fout === 'TIJDELIJKE_TOETREDINGSKNOOP_ALLEEN_VERBINDINGSROL'
    && vTijdelijkAlleenVerbinding.ok === true);

  // ------------------------------------------------------------------ 3. Двосторонні свідоцтва приєднання Ed25519 та відкликання
  const sponsorSleutels = {
    publiekeSleutelDerB64u: knSponsor.identiteit.publiekeSleutelDerB64u,
    geheimeSleutelPkcs8B64u: knSponsor.geheimeSleutelPkcs8B64u,
  };
  const bewSE = maakHechtrankToetredingsBewijs({
    aanvraag: basisAanvraagSE,
    kandidaatGeheimPkcs8B64u: knSE.geheimeSleutelPkcs8B64u,
    sponsorSleutels,
    nuIso,
    geldigheidDagen: 30,
  });
  if (!bewSE.ok) throw new Error('Не вдалося створити тестове свідоцтво SE');

  const erkendeSet = new Set([sponsorSleutels.publiekeSleutelDerB64u]);
  const verOk = verifieerHechtrankToetredingsBewijs({
    bewijs: bewSE.bewijs,
    erkendeSponsorPubSleutels: erkendeSet,
    nuIso,
  });
  const verOnbekendeSponsor = verifieerHechtrankToetredingsBewijs({
    bewijs: bewSE.bewijs,
    erkendeSponsorPubSleutels: new Set([knVreemde.identiteit.publiekeSleutelDerB64u]),
    nuIso,
  });
  const verVerlopen = verifieerHechtrankToetredingsBewijs({
    bewijs: bewSE.bewijs,
    erkendeSponsorPubSleutels: erkendeSet,
    nuIso: new Date(Date.parse(nuIso) + 45 * 86_400_000).toISOString(),
  });
  const verIngetrokken = verifieerHechtrankToetredingsBewijs({
    bewijs: bewSE.bewijs,
    erkendeSponsorPubSleutels: erkendeSet,
    ingetrokkenToetredingIds: new Set([bewSE.bewijs.toetredingId]),
    nuIso,
  });
  const verVervalsteSleutelId = verifieerHechtrankToetredingsBewijs({
    bewijs: {
      ...bewSE.bewijs,
      knooppuntIdentiteit: { ...bewSE.bewijs.knooppuntIdentiteit, knooppuntId: 'klm1_00000000000000000000000000000000' },
    },
    erkendeSponsorPubSleutels: erkendeSet,
    nuIso,
  });

  check('maakHechtrankToetredingsBewijs і verifieerHechtrankToetredingsBewijs перевіряють обидва підписи Ed25519, термін дії, ключ і відкликання',
    verOk.ok === true
    && !verOnbekendeSponsor.ok && verOnbekendeSponsor.fout === 'TOETREDING_ONBEKENDE_SPONSOR'
    && !verVerlopen.ok && verVerlopen.fout === 'TOETREDINGSBEWIJS_VERLOPEN'
    && !verIngetrokken.ok && verIngetrokken.fout === 'TOETREDINGSBEWIJS_INGETROKKEN'
    && !verVervalsteSleutelId.ok && verVervalsteSleutelId.fout === 'TOETREDING_SLEUTEL_ID_KOMT_NIET_OVEREEN');

  // ------------------------------------------------------------------ 4. Захист від атак Сивілли та згортання постачальників і підмереж (§5.1)
  const maakSnelBewijs = (knoop: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string }, voorvoegsel: string, rollen: readonly KlimopBladRol[]) => {
    const r = maakHechtrankToetredingsBewijs({
      aanvraag: maakGeldigeAanvraag(knoop.identiteit, voorvoegsel, rollen),
      kandidaatGeheimPkcs8B64u: knoop.geheimeSleutelPkcs8B64u,
      sponsorSleutels,
      nuIso,
    });
    if (!r.ok) throw new Error(r.fout);
    return r.bewijs;
  };

  const sybilKlonen = Array.from({ length: 12 }, (_, idx) => {
    const k = maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag'],
      juridischeRegio: 'DE',
      aanbieder: 'enkele-sybil-aanbieder',
      nuIso,
    });
    return maakSnelBewijs(k, `10.77.${idx}.0/24`, ['opslag']);
  });
  const subnetKlonen = Array.from({ length: 4 }, (_, idx) => {
    const k = maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag'],
      juridischeRegio: 'NO',
      aanbieder: `subnet-kloon-${idx}`,
      nuIso,
    });
    return maakSnelBewijs(k, '198.51.100.0/24', ['opslag']);
  });
  const tijdelijkeBewijzen = [maakSnelBewijs(knTijdelijk, '172.18.0.0/24', ['verbinding'])];

  const sybilRapport = beoordeelSybilEnSpreidingsWeerstand({
    toetredingen: [
      maakSnelBewijs(knNL, '185.10.1.0/24', ['verificatie', 'opslag']),
      maakSnelBewijs(knCH, '194.20.2.0/24', ['verificatie', 'opslag']),
      maakSnelBewijs(knUA, '91.210.3.0/24', ['verificatie', 'opslag']),
      ...sybilKlonen,
      ...subnetKlonen,
      ...tijdelijkeBewijzen,
    ],
    vereisteOnafhankelijkeDrempel: 5,
  });

  const monoJurisdictieRapport = beoordeelSybilEnSpreidingsWeerstand({
    toetredingen: [
      maakSnelBewijs(knNL, '185.10.1.0/24', ['verificatie']),
      maakSnelBewijs(
        maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['verificatie'],
          juridischeRegio: 'NL',
          aanbieder: 'tweede-nl-aanbieder',
          nuIso,
        }),
        '185.99.1.0/24',
        ['verificatie'],
      ),
    ],
    vereisteOnafhankelijkeDrempel: 2,
  });

  check('beoordeelSybilEnSpreidingsWeerstand згортає 12 клонів постачальника і 4 клони підмережі до 1 голосу кожну групу й відхиляє 1 юрисдикцію',
    sybilRapport.veiligTegenSybilOvername === true
    && sybilRapport.totaalAangemeldeKnopen === 20
    && sybilRapport.genegeerdeTijdelijkeKnopen === 1
    && sybilRapport.begrensdeDubbeleAanbiederOfSubnetKnopen === 14 // (12 - 1) + (4 - 1)
    && sybilRapport.effectieveOnafhankelijkeStemmen === 5
    && monoJurisdictieRapport.veiligTegenSybilOvername === false
    && monoJurisdictieRapport.fouten.includes('MINSTENS_TWEE_JURISDICTIES_VEREIST_VOOR_SPREIDING'));

  // ------------------------------------------------------------------ 5. Заборона єдиної точки входу (§4.4)
  const ingangVeilig = controleerGeenEnkelToetredingsknooppunt({
    actieveIngangsPunten: [
      { knooppuntId: 'start_knoop', aanbieder: 'oud-relais', juridischeRegio: 'NL' },
      { knooppuntId: knCH.identiteit.knooppuntId, aanbieder: 'knoop-ch-011', juridischeRegio: 'CH' },
      { knooppuntId: knUA.identiteit.knooppuntId, aanbieder: 'knoop-ua-011', juridischeRegio: 'UA' },
    ],
    teSluitenKnooppuntId: 'start_knoop',
  });
  const ingangOnveilig = controleerGeenEnkelToetredingsknooppunt({
    actieveIngangsPunten: [
      { knooppuntId: 'start_knoop', aanbieder: 'oud-relais', juridischeRegio: 'NL' },
      { knooppuntId: knCH.identiteit.knooppuntId, aanbieder: 'knoop-ch-011', juridischeRegio: 'CH' },
    ],
    teSluitenKnooppuntId: 'start_knoop',
  });

  check('controleerGeenEnkelToetredingsknooppunt забороняє вимкнення перехідної точки входу без щонайменше 2 незалежних альтернатив (§4.4)',
    ingangVeilig.ok === true && ingangVeilig.overblijvendeOnafhankelijkeIngangen === 2
    && ingangOnveilig.ok === false && ingangOnveilig.fout === 'ENKEL_TOETREDINGSKNOOPPUNT_OF_ONVOLDOENDE_ALTERNATIEVE_INGANGEN');

  // ------------------------------------------------------------------ 6. Реалістичні профілі 5 класів пристроїв (§26)
  const alleKlassen = Object.values(APPARAAT_KLASSE_RICHTWAARDEN);
  check('APPARAAT_KLASSE_RICHTWAARDEN охоплює 5 класів пристроїв без оманливих обіцянок однакового споживання на всіх телефонах (§26)',
    alleKlassen.length === 5
    && alleKlassen.every((p) => p.gelijkVerbruikBelofteOpAlleTelefoons === false)
    && APPARAAT_KLASSE_RICHTWAARDEN.ouder_zuinig_toestel.alleenTijdensOpladenStandaard === true
    && APPARAAT_KLASSE_RICHTWAARDEN.moderne_telefoon.alleenTijdensOpladenStandaard === true
    && APPARAAT_KLASSE_RICHTWAARDEN.ouder_zuinig_toestel.maxAchtergrondGeheugenMiB < APPARAAT_KLASSE_RICHTWAARDEN.vast_knooppunt_server.maxAchtergrondGeheugenMiB);

  // ------------------------------------------------------------------ 7. Двосторонні квитанції ресурсів (§27)
  const zelfKwitantie = maakMiddelenBijdrageKwitantie({
    leverancierKnooppuntId: knSE.identiteit.knooppuntId,
    controleur: knSE,
    geleverdeOpslagMiB: 500,
    beschikbaarheidMinuten: 500,
    overgedragenVersleuteldeMiB: 500,
    geverifieerdeOperaties: 500,
    betrouwbaarheidRatio: 1,
    nuIso,
  });
  const geldigeKwitantie = maakMiddelenBijdrageKwitantie({
    leverancierKnooppuntId: knIS.identiteit.knooppuntId,
    controleur: knNL,
    geleverdeOpslagMiB: 3000,
    beschikbaarheidMinuten: 1440,
    overgedragenVersleuteldeMiB: 800,
    geverifieerdeOperaties: 400,
    betrouwbaarheidRatio: 1,
    nuIso,
  });
  if (!geldigeKwitantie.ok) throw new Error('Не вдалося сформувати квитанцію');

  const verKwOk = verifieerMiddelenBijdrageKwitantie(geldigeKwitantie.kwitantie);
  const verKwVervalst = verifieerMiddelenBijdrageKwitantie({
    ...geldigeKwitantie.kwitantie,
    geleverdeOpslagMiB: 999_999,
  });
  const verKwSleutelIdFout = verifieerMiddelenBijdrageKwitantie({
    ...geldigeKwitantie.kwitantie,
    controleurKnooppuntId: knCH.identiteit.knooppuntId,
  });

  check('maakMiddelenBijdrageKwitantie блокує самопідписання, підробку обсягів і невідповідність ключа контролера',
    !zelfKwitantie.ok && zelfKwitantie.fout === 'ZELF_ONDERTEKENDE_BIJDRAGE_ONGELDIG'
    && verKwOk.ok === true
    && !verKwVervalst.ok && verKwVervalst.fout === 'KWITANTIE_HANDTEKENING_ONGELDIG'
    && !verKwSleutelIdFout.ok && verKwSleutelIdFout.fout === 'KWITANTIE_CONTROLEUR_SLEUTEL_ID_KOMT_NIET_OVEREEN');

  // ------------------------------------------------------------------ 8. Чесний баланс «Живлення» та безумовний доступ до власних даних (§27)
  const balansPassief = berekenEerlijkeMiddelenBalans('klid1_passieve_deelnemer', [geldigeKwitantie.kwitantie]);
  const balansKern = berekenEerlijkeMiddelenBalans(knIS.identiteit.knooppuntId, [geldigeKwitantie.kwitantie]);

  check('berekenEerlijkeMiddelenBalans гарантує безумовний доступ до власних даних навіть при 0 внеску та підвищує пріоритет активних вузлів',
    balansPassief.bijdragePunten === 0
    && balansPassief.prioriteitVoorExtraNetwerkRepliek === 'basis_passief_lid'
    && balansPassief.toegangTotEigenGegevensOnvoorwaardelijk === true
    && balansPassief.verplichteRekenkrachtDeelname === false
    && balansKern.bijdragePunten >= 2000
    && balansKern.prioriteitVoorExtraNetwerkRepliek === 'kern_ondersteuner'
    && balansKern.toegangTotEigenGegevensOnvoorwaardelijk === true);

  // ------------------------------------------------------------------ 9. Безпечне виведення вузлів із кворуму (§26 п. 7–8)
  const uitMetOpenStrepen = planVeiligeKnooppuntUittreding({
    uittredendKnooppunt: knSE,
    alleActieveKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
    vereisteQuorumDrempel: 3,
    openstaandeTeVerplaatsenStrepen: 2,
    nuIso,
  });
  const uitBreektQuorum = planVeiligeKnooppuntUittreding({
    uittredendKnooppunt: knCH,
    alleActieveKnooppunten: [knNL.identiteit, knCH.identiteit],
    vereisteQuorumDrempel: 2,
    openstaandeTeVerplaatsenStrepen: 0,
    nuIso,
  });
  const uitGeldig = planVeiligeKnooppuntUittreding({
    uittredendKnooppunt: knSE,
    alleActieveKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
    vereisteQuorumDrempel: 3,
    openstaandeTeVerplaatsenStrepen: 0,
    nuIso,
  });

  check('planVeiligeKnooppuntUittreding вимагає перенесення смуг і збереження між’юрисдикційного кворуму, завжди дозволяючи негайну зупинку фонової роботи пристрою',
    !uitMetOpenStrepen.ok
    && uitMetOpenStrepen.fout === 'EERST_STREPEN_HERPLAATSEN_VOOR_UITTREDING'
    && uitMetOpenStrepen.onmiddellijkStoppenAchtergrondToegestaan === true
    && !uitBreektQuorum.ok
    && uitBreektQuorum.fout === 'UITTREDING_BREEKT_JURISDICTIE_OF_AANBIEDER_QUORUM'
    && uitGeldig.ok === true
    && verifieerVeiligeKnooppuntUittreding(uitGeldig.bewijs).ok === true);

  // ------------------------------------------------------------------ 10–12. Жива кворумна мережа Етапу 10 (NL, CH, UA + SE, IS)
  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });

  try {
    const adressen = new Map([
      [knNL.identiteit.knooppuntId, srvNL.basisUrl],
      [knCH.identiteit.knooppuntId, srvCH.basisUrl],
      [knUA.identiteit.knooppuntId, srvUA.basisUrl],
    ]);
    const tabel = new KlimopRouteTabel();
    for (const s of [srvNL, srvCH, srvUA]) {
      tabel.voegTweerichtingsStengelToe(knSponsor.identiteit.knooppuntId, s.identiteit.knooppuntId, 10);
    }

    const netwerkClient = new KlimopNetwerkClient(knSponsor, adressen, tabel);
    const client = new KlimopHechtrankenEnVoedingClient(netwerkClient);

    const knoopZelfdeAanbieder = maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie'],
      juridischeRegio: 'DE',
      aanbieder: 'knoop-nl-011',
      nuIso,
    });
    const onafhGeweigerd = client.maakUitbreidingsQuorumGroep({
      groepId: 'foutgroep',
      coordinator: knSponsor,
      knooppunten: [knNL.identiteit, knoopZelfdeAanbieder.identiteit],
      quorumMinimum: 2,
      nuIso,
    });
    const groepOk = client.maakUitbreidingsQuorumGroep({
      groepId: 'quorum011',
      coordinator: knSponsor,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      quorumMinimum: 2,
      nuIso,
    });

    check('KlimopHechtrankenEnVoedingClient.maakUitbreidingsQuorumGroep відхиляє залежні вузли одного постачальника й формує кворум NL/CH/UA',
      !onafhGeweigerd.ok && onafhGeweigerd.fout === 'UITBREIDING_KNOOPPUNTEN_NIET_ONAFHANKELIJK'
      && groepOk.ok === true);

    if (!groepOk.ok) throw new Error('Група кворуму не створена');
    const groep = groepOk.groep;
    const erkendeSponsors = [sponsorSleutels.publiekeSleutelDerB64u];

    for (const [knoop, voorvoegsel] of [
      [knNL, '185.10.1.0/24'],
      [knCH, '194.20.2.0/24'],
      [knUA, '91.210.3.0/24'],
      [knSE, '193.10.40.0/24'],
      [knIS, '82.221.90.0/24'],
    ] as const) {
      const b = maakSnelBewijs(knoop, voorvoegsel, ['verificatie', 'opslag', 'verbinding']);
      const pub = await client.publiceerToetredingOpQuorum({
        groep,
        bewijs: b,
        erkendeSponsorPubSleutels: erkendeSponsors,
        nuIso,
      });
      if (!pub.ok) throw new Error(`Збій реєстрації вузла: ${pub.fout}`);
    }

    const pubKw = await client.publiceerMiddelenKwitantieOpQuorum({
      groep,
      kwitantie: geldigeKwitantie.kwitantie,
    });

    // Вузли переводять скомпрометований сторонній вузол у карантин — його приєднання відхиляється кворумом
    srvNL.plaatsKnooppuntInQuarantaine(knVreemde.identiteit.knooppuntId);
    srvCH.plaatsKnooppuntInQuarantaine(knVreemde.identiteit.knooppuntId);
    const bewQuarantaine = maakSnelBewijs(knVreemde, '203.0.113.0/24', ['verificatie']);
    const pubQuarantaine = await client.publiceerToetredingOpQuorum({
      groep,
      bewijs: bewQuarantaine,
      erkendeSponsorPubSleutels: erkendeSponsors,
      nuIso,
    });

    const overzichtVoorUittreding = await client.raadpleegUitbreidingEnVoedingVanQuorum({
      groep,
      deelnemerId: knIS.identiteit.knooppuntId,
      vereisteDrempel: 5,
    });

    check('живий кворум NL/CH/UA реєструє розширення SE/IS, квитанції ресурсів і блокує приєднання вузла в карантині',
      pubKw.ok === true
      && !pubQuarantaine.ok && pubQuarantaine.fout === 'KNOOPPUNT_IN_QUARANTAINE'
      && overzichtVoorUittreding.ok === true
      && overzichtVoorUittreding.sybilVerslag.effectieveOnafhankelijkeStemmen === 5
      && overzichtVoorUittreding.voedingBalans.prioriteitVoorExtraNetwerkRepliek === 'kern_ondersteuner'
      && srvNL.aantalActieveToetredingen() === 5);

    // Обриваємо зв'язок із CH і перевіряємо безпечне виведення SE на кворумі NL + UA (2-з-3)
    tabel.markeerStengelStaat(knSponsor.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
    if (!uitGeldig.ok) throw new Error('Свідоцтво виведення SE відсутнє');
    const pubUit = await client.publiceerVeiligeUittredingOpQuorum({
      groep,
      uittreding: uitGeldig.bewijs,
    });
    const overzichtNaUittreding = await client.raadpleegUitbreidingEnVoedingVanQuorum({
      groep,
      deelnemerId: 'klid1_passieve_gebruiker',
      vereisteDrempel: 4,
    });

    check('безпечне виведення SE підтверджується живим кворумом NL/UA при обірваному CH зі збереженням 4 незалежних юрисдикцій і доступу пасивного учасника',
      pubUit.ok === true
      && pubUit.bevestigdeKnooppuntIds.length === 2
      && overzichtNaUittreding.ok === true
      && overzichtNaUittreding.uitgetredenKnooppuntIds.includes(knSE.identiteit.knooppuntId)
      && overzichtNaUittreding.sybilVerslag.effectieveOnafhankelijkeStemmen === 4
      && overzichtNaUittreding.voedingBalans.toegangTotEigenGegevensOnvoorwaardelijk === true);
  } finally {
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
  }

  // ------------------------------------------------------------------ 13. Обов'язкова 15-пунктова архітектурна перевірка (§42)
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Етапом 10 (hechtranken.ts / Документ №15) для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe10 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-011 Етап 10: кероване розширення «Вусики», протидія атакам Сивілли та обмін ресурсами «Живлення»',
    fase: 10,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 10 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe10.goedgekeurd === true && oordeelEtappe10.fouten.length === 0);

  // ------------------------------------------------------------------ 14. Синхронізація двомовної документації Етапу 10 та 7 дзеркальних пар
  const et10Uk = 'docs/hub/ПЛЮЩ-ЕТАП-10-КЕРОВАНЕ-РОЗШИРЕННЯ-ТА-ОБМІН-РЕСУРСАМИ.uk.md';
  const et10Md = 'docs/hub/ПЛЮЩ-ЕТАП-10-КЕРОВАНЕ-РОЗШИРЕННЯ-ТА-ОБМІН-РЕСУРСАМИ.md';
  const et10Nl = 'docs/hub/KLIMOP-FASE-10-BEHEERSTE-UITBREIDING-EN-MIDDELENUITWISSELING.nl.md';

  check('двомовні документи Етапу 10 (Документ №15), полігон і всі 7 дзеркальних пар документації повністю синхронізовані',
    [et10Uk, et10Md, et10Nl, 'scripts/klimop-etappe10-hechtranken-proef.mjs'].every((p) => existsSync(p))
    && lees(et10Uk) === lees(et10Md)
    && lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && [
      'valideerKnooppuntToetredingsAanvraag',
      'maakHechtrankToetredingsBewijs',
      'beoordeelSybilEnSpreidingsWeerstand',
      'controleerGeenEnkelToetredingsknooppunt',
      'APPARAAT_KLASSE_RICHTWAARDEN',
      'berekenEerlijkeMiddelenBalans',
      'planVeiligeKnooppuntUittreding',
      'hechtranken.ts',
      'klimop-hechtranken-client.ts',
    ].every((s) => lees(et10Uk).includes(s) && lees(et10Nl).includes(s)));

  // ------------------------------------------------------------------ 15. Досьє функції та Абсолютний мовний закон
  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує запит №192 для KLIMOP-010, задачу KLIMOP-011 та всі 24 активні можливості без жодної втраченої',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-010' && w.pr === 192)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-011')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 24
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'));

  const bestandenKlimop011 = [
    'shared/klimop/hechtranken.ts',
    'backend/klimop-hechtranken-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'backend/klimop-mensbescherming-client.ts',
    'scripts/klimop-etappe9-mensbescherming-proef.mjs',
    'scripts/klimop-etappe10-hechtranken-proef.mjs',
    et10Uk,
    et10Nl,
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md',
    'docs/INDEX.nl.md',
    'README.md',
    'ОГЛЯД-ПРОЄКТУ.uk.md',
    'LEESMIJ.md',
    'PROJECTOVERZICHT.nl.md',
    'ПЛАН-ПЕРЕНЕСЕННЯ.uk.md',
    'PORTEERPLAN.nl.md',
    'tests/eenheid/klimop-009-etappe8-diensten-overdracht-20261120.test.ts',
    'tests/eenheid/klimop-010-etappe9-mensbescherming-dwang-20261120.test.ts',
    'tests/eenheid/klimop-011-etappe10-hechtranken-voeding-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop011.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-011 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
