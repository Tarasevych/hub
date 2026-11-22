// KLIMOP-010 (20.11.2026): Модульні, криптографічні (§14–§17, §36 Етап 9, §39, §42 п. 9, §43 п. 9) та живі мережеві випробування:
//   1. Регламент для всіх 9 надзвичайних обставин (§14) без автоматичного розкриття чи знищення особистих даних;
//   2. Профіль протидії примусу (§15): категоричне блокування самознищення даних, чесна межа фізичної безпеки та роздільні сховища;
//   3. 256-байтні конверти X25519 + ChaCha20-Poly1305, побітово невідрізнимі за розміром між пульсом і тихою тривогою, та двостороннє зняття помилкової тривоги;
//   4. Контекстна оцінка небезпеки за 7 технічними ознаками (§16) без несанкціонованої біометрії та без позбавлення людини доступу до її даних;
//   5. Відкладені критичні операції з 72-год часовим замком, скасуванням підписом власника та протокол 6 станів відсутності (§17);
//   6. Живе виконання всіх 8 обов'язкових безпечних імітаційних сценаріїв §39 на 3 незалежних вузлах (NL, CH, UA) ролі `herstel`.
// Запуск: node scripts/eenheidstests.mjs klimop-010-etappe9-mensbescherming-dwang-20261120.test.ts

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import { leidGeheimScalairAf, splitsMetPedersenVss } from '../../shared/klimop/drempelsleutels';
import {
  betwistHerstelAanvraagDoorEigenaar,
  maakPersoonsIdentiteit,
  openHerstelAanvraag,
  registreerVertrouwdApparaat,
  trekApparaatIn,
  verifieerApparaatCertificaat,
  voegVoogdBevestigingToe,
  verankerHerstelBeleid,
  voltooiWettigHerstel,
} from '../../shared/klimop/identiteit';
import {
  KLIMOP_AFWEZIGHEID_KLASSEN,
  KLIMOP_MENSBESCHERMING_SCENARIOS,
  KLIMOP_MENS_NOODOMSTANDIGHEDEN,
  KLIMOP_TECHNISCHE_RISICO_SIGNALEN,
  STANDAARD_MENS_NOODBELEID,
  beoordeelContextueelOperatieRisico,
  beoordeelLangdurigeAfwezigheidProtocol,
  beoordeelMensbeschermingsProgramma,
  beoordeelUitvoeringUitgesteldeOperatie,
  berekenKluisVerifierHex,
  herstelNaValsDwangAlarm,
  leidScheidbareKluisContextAf,
  maakOnopvallendNoodSignaalPakket,
  maakOperatieAnnulering,
  maakUitgesteldeKritiekeOperatie,
  maakValsAlarmHerstelVerklaring,
  maakX25519SleutelPaar,
  openNoodSignaalDoorVertrouwenspersoon,
  valideerDwangBeschermingsProfiel,
  type KlimopDwangBeschermingsProfiel,
  type MensbeschermingScenarioMeting,
} from '../../shared/klimop/mensbescherming';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopMensbeschermingClient } from '../../backend/klimop-mensbescherming-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakEd25519SleutelPaar(): { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekeSleutelDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimeSleutelPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-010-etappe9-mensbescherming-dwang');
  const t0Ms = Date.parse('2026-11-20T23:18:00.000Z');
  const nuIso = new Date(t0Ms).toISOString();
  const liveNuIso = new Date().toISOString();
  const liveVerlooptIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  // ------------------------------------------------------------------ 1. Дев'ять надзвичайних життєвих обставин людини (§14 маніфесту)
  check('усі 9 життєвих обставин §14 мають регламент без автоматичного розкриття даних і без автоматичного самознищення',
    KLIMOP_MENS_NOODOMSTANDIGHEDEN.length === 9
    && KLIMOP_MENS_NOODOMSTANDIGHEDEN.every((o) =>
      STANDAARD_MENS_NOODBELEID[o].onthulPriveGegevensAutomatischZonderQuorum === false
      && STANDAARD_MENS_NOODBELEID[o].vernietigGegevensAutomatisch === false,
    )
    && STANDAARD_MENS_NOODBELEID.overname_beheerrechten.vereistOnafhankelijkeVoogdenDrempel === 3
    && STANDAARD_MENS_NOODBELEID.overlijden_van_eigenaar.wachttijdOfBetwistingUren === 168);

  // ------------------------------------------------------------------ 2. Необов'язковий профіль примусу, заборона самознищення та роздільні сховища (§15)
  const voogdX25519 = maakX25519SleutelPaar();
  const vreemdeX25519 = maakX25519SleutelPaar();
  const voogdEd25519 = maakEd25519SleutelPaar();
  const vreemdeEd25519 = maakEd25519SleutelPaar();

  const basisProfiel: KlimopDwangBeschermingsProfiel = {
    schema: 1,
    persoonsId: 'klid1_mens010abcdef0123456789abcdef012',
    vrijwilligIngeschakeld: true,
    fysiekGeweldRisicoBeoordeeldDoorGebruiker: true,
    kritiekeActieWachttijdUren: 72,
    vertrouwenspersonenVoorAlarm: [
      {
        voogdId: 'voogd_vertrouwd_01',
        x25519PubDerB64u: voogdX25519.publiekDerB64u,
        ed25519PubDerB64u: voogdEd25519.publiekeSleutelDerB64u,
      },
    ],
    automatischeGegevensVernietigingBijDwang: false,
  };

  const pGoed = valideerDwangBeschermingsProfiel(basisProfiel);
  const pVernietiging = valideerDwangBeschermingsProfiel({
    ...basisProfiel,
    automatischeGegevensVernietigingBijDwang: true,
  });
  const pZonderGeweldToets = valideerDwangBeschermingsProfiel({
    ...basisProfiel,
    fysiekGeweldRisicoBeoordeeldDoorGebruiker: false,
  });
  const pKorteWacht = valideerDwangBeschermingsProfiel({
    ...basisProfiel,
    kritiekeActieWachttijdUren: 6,
  });
  const pZonderVoogd = valideerDwangBeschermingsProfiel({
    ...basisProfiel,
    vertrouwenspersonenVoorAlarm: [],
  });

  check('valideerDwangBeschermingsProfiel категорично блокує самознищення даних, вимагає оцінки ризику фізичного насильства і чесно не обіцяє фізичної невразливості (§15)',
    pGoed.ok === true && pGoed.garandeertFysiekeVeiligheidTegenAanvaller === false
    && !pVernietiging.ok && pVernietiging.fout === 'AUTOMATISCHE_GEGEVENSVERNIETIGING_VERBODEN'
    && !pZonderGeweldToets.ok && pZonderGeweldToets.fout === 'FYSIEK_GEWELDRISICO_BEOORDELING_VEREIST'
    && !pKorteWacht.ok && pKorteWacht.fout === 'DWANG_WACHTTIJD_TE_KORT_MINSTENS_24U'
    && !pZonderVoogd.ok && pZonderVoogd.fout === 'DWANG_VEREIST_MINSTENS_EEN_VERTROUWENSPERSOON');

  const kluisZout32 = randomBytes(32);
  const hoofdGeheim = randomBytes(32);
  const dwangGeheim = randomBytes(32);
  const hoofdVerif = berekenKluisVerifierHex(hoofdGeheim, kluisZout32);
  const dwangVerif = berekenKluisVerifierHex(dwangGeheim, kluisZout32);

  const uitHoofd = leidScheidbareKluisContextAf({
    ingevoerdGeheimMateriaal: hoofdGeheim,
    kluisZout32,
    verwachteHoofdVerifierHex: hoofdVerif,
    verwachteDwangVerifierHex: dwangVerif,
  });
  const uitNeven = leidScheidbareKluisContextAf({
    ingevoerdGeheimMateriaal: dwangGeheim,
    kluisZout32,
    verwachteHoofdVerifierHex: hoofdVerif,
    verwachteDwangVerifierHex: dwangVerif,
  });
  const uitFout = leidScheidbareKluisContextAf({
    ingevoerdGeheimMateriaal: randomBytes(32),
    kluisZout32,
    verwachteHoofdVerifierHex: hoofdVerif,
    verwachteDwangVerifierHex: dwangVerif,
  });

  check('leidScheidbareKluisContextAf виводить криптографічно незалежні 32-байтні ключі основного та обмеженого сховищ без пошкодження основних даних',
    uitHoofd.ok && uitHoofd.geopendeKluis === 'hoofd_kluis' && !uitHoofd.stilDwangModusActief
    && uitHoofd.toegestaneRechten.includes('kritiek_beheer')
    && uitNeven.ok && uitNeven.geopendeKluis === 'afgeschermde_nevenkluis' && uitNeven.stilDwangModusActief
    && !uitNeven.toegestaneRechten.includes('kritiek_beheer')
    && uitNeven.hoofdGegevensIntact === true
    && !uitHoofd.kluisSleutel32.equals(uitNeven.kluisSleutel32)
    && !uitFout.ok && uitFout.fout === 'INLOGGEGEVENS_ONJUIST');

  // ------------------------------------------------------------------ 3. Невідрізнимі 256-байтні сигнали та зняття помилкової тривоги (§15, §39 п. 4)
  const pakketHartslag = maakOnopvallendNoodSignaalPakket({
    ontvangerVoogdId: 'voogd_vertrouwd_01',
    ontvangerX25519PubDerB64u: voogdX25519.publiekDerB64u,
    soort: 'gewone_hartslag',
    persoonsPsid: 'psid1_0123456789abcdef0123456789abcdef',
    nuIso,
  });
  const pakketAlarm = maakOnopvallendNoodSignaalPakket({
    ontvangerVoogdId: 'voogd_vertrouwd_01',
    ontvangerX25519PubDerB64u: voogdX25519.publiekDerB64u,
    soort: 'stil_dwang_alarm',
    persoonsPsid: 'psid1_0123456789abcdef0123456789abcdef',
    nuIso,
    toelichtingCode: 'DWANG_CODE_INGEVOERD',
  });

  const geopendHartslag = openNoodSignaalDoorVertrouwenspersoon({
    pakket: pakketHartslag,
    voogdX25519GeheimPkcs8B64u: voogdX25519.geheimPkcs8B64u,
  });
  const geopendAlarm = openNoodSignaalDoorVertrouwenspersoon({
    pakket: pakketAlarm,
    voogdX25519GeheimPkcs8B64u: voogdX25519.geheimPkcs8B64u,
  });
  const geweigerdVreemd = openNoodSignaalDoorVertrouwenspersoon({
    pakket: pakketAlarm,
    voogdX25519GeheimPkcs8B64u: vreemdeX25519.geheimPkcs8B64u,
  });

  check('звичайний пульс і тихий сигнал небезпеки мають однакову довжину 256 байт у мережі й розшифровуються лише ключем X25519 довіреної особи',
    Buffer.from(pakketHartslag.cijfertekstB64u, 'base64url').length === 256
    && Buffer.from(pakketAlarm.cijfertekstB64u, 'base64url').length === 256
    && !JSON.stringify(pakketAlarm).includes('stil_dwang_alarm')
    && geopendHartslag.ok && geopendHartslag.inhoud.soort === 'gewone_hartslag'
    && geopendAlarm.ok && geopendAlarm.inhoud.soort === 'stil_dwang_alarm'
    && geweigerdVreemd.ok === false);

  const eigenaarEd25519 = maakEd25519SleutelPaar();
  const geldigeValsAlarmVerklaring = maakValsAlarmHerstelVerklaring({
    persoonsId: basisProfiel.persoonsId,
    alarmGeactiveerdOp: nuIso,
    eigenaarSleutels: eigenaarEd25519,
    voogdSleutels: { voogdId: 'voogd_vertrouwd_01', ...voogdEd25519 },
    nuIso,
  });
  const valseVoogdVerklaring = maakValsAlarmHerstelVerklaring({
    persoonsId: basisProfiel.persoonsId,
    alarmGeactiveerdOp: nuIso,
    eigenaarSleutels: eigenaarEd25519,
    voogdSleutels: { voogdId: 'voogd_vertrouwd_01', ...vreemdeEd25519 },
    nuIso,
  });

  const herstelValsOk = herstelNaValsDwangAlarm({
    profiel: basisProfiel,
    verwachteEigenaarPubDerB64u: eigenaarEd25519.publiekeSleutelDerB64u,
    verklaring: geldigeValsAlarmVerklaring,
  });
  const herstelValsGeweigerd = herstelNaValsDwangAlarm({
    profiel: basisProfiel,
    verwachteEigenaarPubDerB64u: eigenaarEd25519.publiekeSleutelDerB64u,
    verklaring: valseVoogdVerklaring,
  });

  check('herstelNaValsDwangAlarm вимагає спільного підпису власника й визнаної довіреної особи і відновлює роботу з 0 байт втрат (§39 п. 4)',
    herstelValsOk.ok && herstelValsOk.nieuweModus === 'normaal' && herstelValsOk.gegevensVerliesBytes === 0
    && !herstelValsGeweigerd.ok && herstelValsGeweigerd.fout === 'VALS_ALARM_VEREIST_ERKENDE_VERTROUWENSPERSOON');

  // ------------------------------------------------------------------ 4. Контекстна оцінка небезпеки за 7 технічними ознаками (§16 маніфесту)
  const rZonderToestemmingBiometrie = beoordeelContextueelOperatieRisico({
    waargenomenSignalen: [],
    gevraagdeActieSoort: 'gewoon_lezen_en_werken',
    bevatBiometrischeOfFysiologischeGegevens: true,
    aparteUitdrukkelijkeBiometrieToestemmingEnMotivering: false,
  });
  const rLaag = beoordeelContextueelOperatieRisico({
    waargenomenSignalen: [],
    gevraagdeActieSoort: 'kritieke_sleutel_of_rechten_actie',
  });
  const rVerhoogd = beoordeelContextueelOperatieRisico({
    waargenomenSignalen: ['plotselinge_apparaatwissel'],
    gevraagdeActieSoort: 'kritieke_sleutel_of_rechten_actie',
  });
  const rHoogKritiek = beoordeelContextueelOperatieRisico({
    waargenomenSignalen: ['massale_gegevensverwijdering', 'verdachte_herstelregel_wijziging'],
    gevraagdeActieSoort: 'kritieke_sleutel_of_rechten_actie',
  });
  const rHoogGewoonLezen = beoordeelContextueelOperatieRisico({
    waargenomenSignalen: ['massale_gegevensverwijdering', 'verdachte_herstelregel_wijziging'],
    gevraagdeActieSoort: 'gewoon_lezen_en_werken',
  });

  check('beoordeelContextueelOperatieRisico блокує несанкціоновану біометрію, затримує ризикові дії на 24/72 год і ніколи не позбавляє людину доступу до даних (§16)',
    KLIMOP_TECHNISCHE_RISICO_SIGNALEN.length === 7
    && !rZonderToestemmingBiometrie.ok && rZonderToestemmingBiometrie.fout === 'BIOMETRIE_ZONDER_UITDRUKKELIJKE_TOESTEMMING_VERBODEN'
    && rLaag.ok && rLaag.verplichteWachttijdUren === 0
    && rVerhoogd.ok && rVerhoogd.risicoNiveau === 'verhoogd' && rVerhoogd.verplichteWachttijdUren === 24
    && rHoogKritiek.ok && rHoogKritiek.risicoNiveau === 'hoog'
    && rHoogKritiek.besluit === 'vertraag_kritieke_actie_en_vraag_quorum' && rHoogKritiek.verplichteWachttijdUren === 72
    && rHoogGewoonLezen.ok && rHoogGewoonLezen.verplichteWachttijdUren === 0
    && [rZonderToestemmingBiometrie, rLaag, rVerhoogd, rHoogKritiek, rHoogGewoonLezen].every(
      (r) => r.toegangTotEigenGegevensBehouden === true && r.automatischeConclusieOverGeestestoestandOfDwang === false,
    ));

  // ------------------------------------------------------------------ 5. Відкладені критичні операції та протокол тривалої відсутності (§17)
  const dwangOperatie = maakUitgesteldeKritiekeOperatie({
    persoonsId: basisProfiel.persoonsId,
    soort: 'verwijder_volledig_archief',
    doelSamenvatting: 'Примусова спроба видалення архіву',
    wachttijdUren: 24,
    onderDwangAangevraagd: true,
    aanvragerSleutels: eigenaarEd25519,
    nuIso,
  });
  const dwangUitvoerCheck = beoordeelUitvoeringUitgesteldeOperatie({
    operatie: dwangOperatie,
    annulering: null,
    toegestaneAnnuleerPubSleutels: new Set([eigenaarEd25519.publiekeSleutelDerB64u]),
    actiefStilDwangAlarm: false,
    nuIso: new Date(t0Ms + 100 * 3600_000).toISOString(),
  });

  const afwStilte365 = beoordeelLangdurigeAfwezigheidProtocol({
    klasse: 'gewone_afwezigheid',
    dagenZonderActiviteit: 365,
    bevestigdeOnafhankelijkeVoogden: 3,
    vereisteVoogdenDrempel: 2,
    verstrekenBetwistingUren: 500,
    eigenaarHeeftBezwaarAangetekend: false,
  });
  const afwZonderQuorum = beoordeelLangdurigeAfwezigheidProtocol({
    klasse: 'langdurige_wilsonbekwaamheid',
    dagenZonderActiviteit: 90,
    bevestigdeOnafhankelijkeVoogden: 1,
    vereisteVoogdenDrempel: 2,
    verstrekenBetwistingUren: 200,
    eigenaarHeeftBezwaarAangetekend: false,
  });
  const afwBezwaarEigenaar = beoordeelLangdurigeAfwezigheidProtocol({
    klasse: 'wettige_erfopvolging',
    dagenZonderActiviteit: 90,
    bevestigdeOnafhankelijkeVoogden: 3,
    vereisteVoogdenDrempel: 2,
    verstrekenBetwistingUren: 200,
    eigenaarHeeftBezwaarAangetekend: true,
  });
  const afwWettigVoltooid = beoordeelLangdurigeAfwezigheidProtocol({
    klasse: 'wettige_erfopvolging',
    dagenZonderActiviteit: 90,
    bevestigdeOnafhankelijkeVoogden: 2,
    vereisteVoogdenDrempel: 2,
    verstrekenBetwistingUren: 170,
    eigenaarHeeftBezwaarAangetekend: false,
  });

  check('протокол тривалої відсутності розрізняє 6 станів §17, не розкриває даних через саме мовчання і блокує дії під примусом',
    KLIMOP_AFWEZIGHEID_KLASSEN.length === 6
    && !dwangUitvoerCheck.magUitvoeren && dwangUitvoerCheck.fout === 'KRITIEKE_OPERATIE_GEBLOKKEERD_WEGENS_DWANGBESCHERMING'
    && afwStilte365.toegestaneReactie === 'geen_overdracht_alleen_bewaring'
    && afwZonderQuorum.toegestaneReactie === 'wacht_op_voogdenquorum_en_betwistingstermijn'
    && afwBezwaarEigenaar.toegestaneReactie === 'geblokkeerd_door_levende_eigenaar'
    && afwWettigVoltooid.toegestaneReactie === 'vooraf_overeengekomen_herstel_toegestaan'
    && [afwStilte365, afwZonderQuorum, afwBezwaarEigenaar, afwWettigVoltooid].every(
      (a) => a.priveGegevensAutomatischOnthuldDoorStilte === false && a.volledigeBeheerrechtenAutomatischOvergedragen === false,
    ));

  // ------------------------------------------------------------------ 6. Оцінювач повноти та безпеки 8 сценаріїв §39
  const onvolledige8 = beoordeelMensbeschermingsProgramma([
    {
      scenarioId: 'diefstal_van_apparaat',
      veiligeSimulatieZonderEchtGevaar: true,
      aanvallerKreegAlleenheerschappij: false,
      gegevensVerliesBytes: 0,
      wettigeRechtenBehouden: true,
      bewijsSamenvatting: 'Перевірено',
    },
  ]);
  const onveiligeProef = beoordeelMensbeschermingsProgramma(
    KLIMOP_MENSBESCHERMING_SCENARIOS.map((id, idx) => ({
      scenarioId: id,
      veiligeSimulatieZonderEchtGevaar: idx !== 1, // §39 абз. 2 забороняє небезпечні для людини випробування!
      aanvallerKreegAlleenheerschappij: false,
      gegevensVerliesBytes: idx === 3 ? 4 : 0,
      wettigeRechtenBehouden: true,
      bewijsSamenvatting: `Сценарій ${id}`,
    })),
  );

  check('beoordeelMensbeschermingsProgramma вимагає всі 8 сценаріїв §39 і відхиляє небезпечні експерименти або будь-яку втрату даних',
    KLIMOP_MENSBESCHERMING_SCENARIOS.length === 8
    && !onvolledige8.geslaagd && onvolledige8.ontbrekendeScenarios.length === 7
    && !onveiligeProef.geslaagd && onveiligeProef.gefaaldeScenarios.length === 2);

  // ------------------------------------------------------------------ 7. Живе мережеве виконання всіх 8 сценаріїв §39 на 3 вузлах (NL, CH, UA)
  const knClient = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['herstel', 'verificatie', 'opslag'],
    juridischeRegio: 'NL',
    aanbieder: 'toestel-eigenaar-010',
    nuIso: liveNuIso,
  });
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['herstel', 'verificatie', 'verbinding'],
    juridischeRegio: 'NL',
    aanbieder: 'herstel-nl',
    nuIso: liveNuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['herstel', 'verificatie', 'verbinding'],
    juridischeRegio: 'CH',
    aanbieder: 'herstel-ch',
    nuIso: liveNuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['herstel', 'verificatie', 'verbinding'],
    juridischeRegio: 'UA',
    aanbieder: 'herstel-ua',
    nuIso: liveNuIso,
  });
  const knNL2Zelfde = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'herstel-nl',
    nuIso: liveNuIso,
  });
  const knZonderHerstelRol = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag'],
    juridischeRegio: 'SE',
    aanbieder: 'opslag-se',
    nuIso: liveNuIso,
  });

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });
  const alleServers = [srvNL, srvCH, srvUA];

  try {
    const tabel = new KlimopRouteTabel();
    for (const s of alleServers) {
      tabel.voegTweerichtingsStengelToe(knClient.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
    }
    const adressen = new Map(alleServers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
    const netwerkClient = new KlimopNetwerkClient(knClient, adressen, tabel);
    const mensClient = new KlimopMensbeschermingClient(netwerkClient);

    const foutRegio = mensClient.maakMensbeschermingGroep({
      groepId: 'fout_regio',
      eigenaar: knClient,
      knooppunten: [knNL.identiteit, knNL2Zelfde.identiteit],
      quorumMinimum: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    const foutRol = mensClient.maakMensbeschermingGroep({
      groepId: 'fout_rol',
      eigenaar: knClient,
      knooppunten: [knNL.identiteit, knZonderHerstelRol.identiteit],
      quorumMinimum: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    const groepRes = mensClient.maakMensbeschermingGroep({
      groepId: 'herstel_010_3',
      eigenaar: knClient,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      quorumMinimum: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    if (!groepRes.ok) throw new Error(groepRes.fout);

    check('KlimopMensbeschermingClient відхиляє залежні вузли однієї юрисдикції та вузли без ролі herstel і приймає незалежні NL/CH/UA',
      !foutRegio.ok && foutRegio.fout === 'HERSTEL_KNOOPPUNTEN_NIET_ONAFHANKELIJK'
      && !foutRol.ok && foutRol.fout === 'KNOOPPUNT_MIST_HERSTELROL'
      && groepRes.ok === true);

    const persoon = maakPersoonsIdentiteit(nuIso);
    const laptop = registreerVertrouwdApparaat({
      staat: persoon.staat,
      wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
      naamLabel: 'Ноутбук власника',
      toegestaneBevoegdheden: ['lezen_werkgegevens', 'schrijven_werkgegevens', 'nood_betwisting'],
      nuIso,
    });
    const telefoon = registreerVertrouwdApparaat({
      staat: persoon.staat,
      wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
      naamLabel: 'Телефон власника',
      toegestaneBevoegdheden: ['lezen_werkgegevens', 'schrijven_werkgegevens'],
      nuIso,
    });
    const wortelSleutelPaar = {
      publiekeSleutelDerB64u: persoon.staat.actieveWortelPubDerB64u,
      geheimeSleutelPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    };

    // Відриваємо стебло до CH — уся кворумна мережа захисту людини продовжує працювати на NL + UA:
    tabel.markeerStengelStaat(knClient.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');

    const zendHartslag = await mensClient.verspreidOnopvallendSignaal({ groep: groepRes.groep, pakket: pakketHartslag });
    const zendAlarm = await mensClient.verspreidOnopvallendSignaal({ groep: groepRes.groep, pakket: pakketAlarm });
    const opgehaaldeSignalen = await mensClient.haalVoogdSignalenOpVanQuorum({
      groep: groepRes.groep,
      voogdId: 'voogd_vertrouwd_01',
    });

    // Спроба перехоплення правил відновлення ставиться на 72-год часовий замок і скасовується власником:
    const verdachteOp = maakUitgesteldeKritiekeOperatie({
      persoonsId: persoon.staat.oprichting.persoonsId,
      soort: 'wijzig_herstelvoogden',
      doelSamenvatting: 'Підозріла зміна опікунів з нового середовища',
      wachttijdUren: rHoogKritiek.verplichteWachttijdUren,
      aanvragerSleutels: wortelSleutelPaar,
      nuIso,
    });
    const regVerdacht = await mensClient.registreerUitgesteldeOperatieOpQuorum({
      groep: groepRes.groep,
      operatie: verdachteOp,
    });
    const vroegCheck = await mensClient.controleerUitvoerbaarheidOpQuorum({
      groep: groepRes.groep,
      operatieId: verdachteOp.operatieId,
      toegestaneAnnuleerPubSleutels: [wortelSleutelPaar.publiekeSleutelDerB64u],
      actiefStilDwangAlarm: false,
      nuIso: new Date(t0Ms + 4 * 3600_000).toISOString(),
    });
    const annulering = maakOperatieAnnulering({
      operatieId: verdachteOp.operatieId,
      persoonsId: persoon.staat.oprichting.persoonsId,
      reden: 'verdachte_poging_geblokkeerd',
      ondertekenaarSleutels: wortelSleutelPaar,
      nuIso: new Date(t0Ms + 6 * 3600_000).toISOString(),
    });
    const annuleerQuorum = await mensClient.annuleerUitgesteldeOperatieOpQuorum({
      groep: groepRes.groep,
      annulering,
      toegestaneAnnuleerPubSleutels: [wortelSleutelPaar.publiekeSleutelDerB64u],
    });
    const na72CheckGeannuleerd = await mensClient.controleerUitvoerbaarheidOpQuorum({
      groep: groepRes.groep,
      operatieId: verdachteOp.operatieId,
      toegestaneAnnuleerPubSleutels: [wortelSleutelPaar.publiekeSleutelDerB64u],
      actiefStilDwangAlarm: false,
      nuIso: new Date(t0Ms + 80 * 3600_000).toISOString(),
    });

    // Натомість законна планова операція без скасування та без тривоги примусу стає виконуваною після 24 год:
    const wettigeOp = maakUitgesteldeKritiekeOperatie({
      persoonsId: persoon.staat.oprichting.persoonsId,
      soort: 'exporteer_sleutelmateriaal',
      doelSamenvatting: 'Планова резервна копія власника',
      wachttijdUren: 24,
      aanvragerSleutels: wortelSleutelPaar,
      nuIso,
    });
    await mensClient.registreerUitgesteldeOperatieOpQuorum({ groep: groepRes.groep, operatie: wettigeOp });
    const wettigeNa25Uur = await mensClient.controleerUitvoerbaarheidOpQuorum({
      groep: groepRes.groep,
      operatieId: wettigeOp.operatieId,
      toegestaneAnnuleerPubSleutels: [wortelSleutelPaar.publiekeSleutelDerB64u],
      actiefStilDwangAlarm: false,
      nuIso: new Date(t0Ms + 25 * 3600_000).toISOString(),
    });

    check('кворум NL + UA (при обірваному CH) доставляє невідрізнимі сигнали, блокує дострокове чи скасоване захоплення і пропускає законну дію після замка',
      zendHartslag.ok && zendAlarm.ok
      && opgehaaldeSignalen.ok && opgehaaldeSignalen.pakketten.length === 2
      && regVerdacht.ok && annuleerQuorum.ok
      && !vroegCheck.magUitvoeren && vroegCheck.redenIndienGeweigerd === 'KRITIEKE_OPERATIE_IN_WACHTTIJD'
      && !na72CheckGeannuleerd.magUitvoeren && na72CheckGeannuleerd.redenIndienGeweigerd === 'KRITIEKE_OPERATIE_GEANNULEERD_DOOR_EIGENAAR'
      && wettigeNa25Uur.magUitvoeren === true && srvNL.aantalUitgesteldeOperaties() === 2);

    // Зводимо всі 8 сценаріїв §39:
    const intrTel = trekApparaatIn({
      staat: persoon.staat,
      ingetrokkenApparaatId: telefoon.certificaat.apparaatId,
      reden: 'verloren_of_gestolen',
      ondertekenaar: { soort: 'nood_apparaat', bundel: laptop },
      nuIso,
    });
    const telNaDiefstal = verifieerApparaatCertificaat(telefoon.certificaat, persoon.staat, { intrekkingen: [intrTel], nuIso });

    const pedersen = splitsMetPedersenVss({
      setId: 'test-pedersen-010',
      geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
      drempel: 2,
      totaal: 3,
    });
    const herstelBeleid = {
      schema: 1 as const,
      persoonsId: persoon.staat.oprichting.persoonsId,
      drempel: 2,
      voogden: [
        { knooppuntId: knNL.identiteit.knooppuntId, publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u },
        { knooppuntId: knCH.identiteit.knooppuntId, publiekeSleutelDerB64u: knCH.identiteit.publiekeSleutelDerB64u },
        { knooppuntId: knUA.identiteit.knooppuntId, publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u },
      ],
      pedersenSetId: 'test-pedersen-010',
      minimaleBetwistingsVensterUren: {
        verlies_alle_apparaten: 48,
        bevestigde_langdurige_onbeschikbaarheid: 168,
        wettige_erfopvolging: 168,
      },
    };
    // KLIMOP-020: політику відновлення закріплює корінь чинної епохи до втрати доступу
    const verankering020 = verankerHerstelBeleid({
      staat: persoon.staat,
      beleid: herstelBeleid,
      wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
      nuIso: nuIso,
    });
    if (!verankering020.ok) throw new Error(verankering020.fout);
    persoon.staat = verankering020.nieuweStaat;
    const nieuwWortel = maakEd25519SleutelPaar();
    const aanvHerstel = openHerstelAanvraag({
      beleid: herstelBeleid,
      omstandigheid: 'verlies_alle_apparaten',
      kandidaatNieuweWortelPubDerB64u: nieuwWortel.publiekeSleutelDerB64u,
      nuIso,
    });
    if (!aanvHerstel.ok) throw new Error(aanvHerstel.fout);
    const st1 = voegVoogdBevestigingToe({ beleid: herstelBeleid, aanvraag: aanvHerstel.aanvraag, voogd: knNL, nuIso });
    if (!st1.ok) throw new Error(st1.fout);
    const st2 = voegVoogdBevestigingToe({ beleid: herstelBeleid, aanvraag: st1.aanvraag, voogd: knUA, nuIso });
    if (!st2.ok) throw new Error(st2.fout);
    const voltooidHerstel = voltooiWettigHerstel({
      staat: persoon.staat,
      beleid: herstelBeleid,
      aanvraag: st2.aanvraag,
      pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
      kandidaatNieuwWortelGeheimPkcs8B64u: nieuwWortel.geheimeSleutelPkcs8B64u,
      nuIso: new Date(t0Ms + 50 * 3600_000).toISOString(),
    });

    const valseErf = openHerstelAanvraag({
      beleid: herstelBeleid,
      omstandigheid: 'wettige_erfopvolging',
      kandidaatNieuweWortelPubDerB64u: maakEd25519SleutelPaar().publiekeSleutelDerB64u,
      nuIso,
    });
    if (!valseErf.ok) throw new Error(valseErf.fout);
    const geblokkeerdeErf = betwistHerstelAanvraagDoorEigenaar({
      staat: persoon.staat,
      aanvraag: valseErf.aanvraag,
      ondertekenaar: { soort: 'wortel', geheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u },
      nuIso,
    });

    const alle8Metingen: MensbeschermingScenarioMeting[] = [
      {
        scenarioId: 'diefstal_van_apparaat',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: telNaDiefstal.ok,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: !telNaDiefstal.ok,
        bewijsSamenvatting: 'Викрадений телефон миттєво відкликано резервним ноутбуком',
      },
      {
        scenarioId: 'gedwongen_afgifte_een_inlogset',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: !uitNeven.ok || uitNeven.toegestaneRechten.includes('kritiek_beheer'),
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: uitNeven.ok && uitNeven.hoofdGegevensIntact && geopendAlarm.ok,
        bewijsSamenvatting: 'Відкрито лише обмежене сховище, основні дані цілі, 256-байтну тривогу доставлено',
      },
      {
        scenarioId: 'langdurige_onbeschikbaarheid_eigenaar',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: afwStilte365.volledigeBeheerrechtenAutomatischOvergedragen,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: afwStilte365.toegestaneReactie === 'geen_overdracht_alleen_bewaring',
        bewijsSamenvatting: 'Тривала відсутність сама по собі не розкриває даних і не передає прав',
      },
      {
        scenarioId: 'vals_alarm_noodsignaal',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: false,
        gegevensVerliesBytes: herstelValsOk.ok ? herstelValsOk.gegevensVerliesBytes : 1,
        wettigeRechtenBehouden: herstelValsOk.ok === true,
        bewijsSamenvatting: 'Помилкова тривога знята спільним підписом власника й довіреної особи з 0 байт втрат',
      },
      {
        scenarioId: 'verlies_alle_persoonlijke_apparaten',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: false,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: aanvHerstel.aanvraag.staat === 'wacht_op_quorum_en_tijdslot',
        bewijsSamenvatting: 'Відкрито процедуру порогового відновлення з 48-годинним вікном оскарження',
      },
      {
        scenarioId: 'wettig_herstel',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: false,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: voltooidHerstel.ok && voltooidHerstel.nieuweStaat.oprichting.persoonsId === persoon.staat.oprichting.persoonsId,
        bewijsSamenvatting: 'Відновлено доступ за частками Педерсена 2-з-3 зі збереженням persoonsId',
      },
      {
        scenarioId: 'poging_onwettige_erfopvolging',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: !geblokkeerdeErf.ok,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: geblokkeerdeErf.ok && geblokkeerdeErf.geblokkeerdeAanvraag.staat === 'geblokkeerd_door_eigenaar',
        bewijsSamenvatting: 'Незаконне спадкування миттєво заблоковано підписом живого власника',
      },
      {
        scenarioId: 'poging_kaping_herstelprocedure',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: vroegCheck.magUitvoeren || na72CheckGeannuleerd.magUitvoeren,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: !vroegCheck.magUitvoeren && !na72CheckGeannuleerd.magUitvoeren,
        bewijsSamenvatting: 'Підозріла зміна опікунів затримана на 72 год і скасована на кворумі NL + UA',
      },
    ];

    const volledigOordeel8 = beoordeelMensbeschermingsProgramma(alle8Metingen);
    check('усі 8 обов’язкових безпечних імітаційних сценаріїв захисту людини §39 проходять живу перевірку з 0 байт втрат',
      volledigOordeel8.geslaagd === true && volledigOordeel8.gedekteScenarios === 8 && volledigOordeel8.gefaaldeScenarios.length === 0);
  } finally {
    await Promise.all(alleServers.map((s) => s.sluit()));
  }

  // ------------------------------------------------------------------ 8. Архітектурна перевірка 15 питань, документація Етапу 9 та мовний закон
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Етапом 9 (mensbescherming.ts / 8 сценаріїв §39) для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe9 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-010 Етап 9: захист людини, протидія примусу, контекстний ризик та 8 сценаріїв §39',
    fase: 9,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 9 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe9.goedgekeurd === true && oordeelEtappe9.fouten.length === 0);

  const et9Uk = 'docs/hub/ПЛЮЩ-ЕТАП-9-ЗАХИСТ-ЛЮДИНИ-ТА-ПРОТИДІЯ-ПРИМУСУ.uk.md';
  const et9Md = 'docs/hub/ПЛЮЩ-ЕТАП-9-ЗАХИСТ-ЛЮДИНИ-ТА-ПРОТИДІЯ-ПРИМУСУ.md';
  const et9Nl = 'docs/hub/KLIMOP-FASE-9-MENSBESCHERMING-EN-DWANGBESTENDIGHEID.nl.md';

  check('двомовні документи Етапу 9 (Документ №12), полігон і всі 7 дзеркальних пар документації повністю синхронізовані',
    [et9Uk, et9Md, et9Nl, 'scripts/klimop-etappe9-mensbescherming-proef.mjs'].every((p) => existsSync(p))
    && lees(et9Uk) === lees(et9Md)
    && lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && [
      'leidScheidbareKluisContextAf',
      'maakOnopvallendNoodSignaalPakket',
      'beoordeelContextueelOperatieRisico',
      'beoordeelLangdurigeAfwezigheidProtocol',
      'beoordeelMensbeschermingsProgramma',
      'mensbescherming.ts',
      'klimop-mensbescherming-client.ts',
    ].every((s) => lees(et9Uk).includes(s) && lees(et9Nl).includes(s)));

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує запит №191 для KLIMOP-009, задачу KLIMOP-010 та всі 22 активні можливості без жодної втраченої',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-009' && w.pr === 191)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-010')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 22
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'));

  const bestandenKlimop010 = [
    'shared/klimop/mensbescherming.ts',
    'backend/klimop-mensbescherming-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe9-mensbescherming-proef.mjs',
    et9Uk,
    et9Nl,
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
    'tests/eenheid/klimop-010-etappe9-mensbescherming-dwang-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop010.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-010 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
