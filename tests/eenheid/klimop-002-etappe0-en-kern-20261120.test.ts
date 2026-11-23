// KLIMOP-002 (20.11.2026): Модульні та криптографічні випробування Етапу 0 (інспектор дійсного стану + двомовний звіт)
// та Етапу 1 (специфікація архітектурного ядра, вибір технологій, план випусків і модуль shared/klimop/kern.ts).
// Запуск: node scripts/eenheidstests.mjs klimop-002-etappe0-en-kern-20261120.test.ts

import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
// @ts-expect-error — .mjs без декларацій типів
import { voerKlimopEtappe0AuditUit } from '../../scripts/klimop-etappe0-audit.mjs';
import {
  KLIMOP_BLAD_ROLLEN,
  KLIMOP_CONTROLE_VRAGEN_IDS,
  KLIMOP_KNOOPPUNT_TYPEN,
  KLIMOP_MACHT_DOMEINEN,
  KLIMOP_OPSLAG_LAGEN,
  KLIMOP_STRUCTUUR_ELEMENTEN,
  KLIMOP_VERBODEN_VEREENVOUDIGINGEN_IDS,
  beoordeelDwangSignaal,
  beoordeelKlimopWijziging,
  berekenKnooppuntId,
  canoniekeJson,
  controleerKnooppuntOnafhankelijkheid,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  verifieerKlimopMandaat,
  type KlimopControleVraagId,
  type KlimopMandaatInhoud,
} from '../../shared/klimop/kern';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-002-etappe0-en-kern');

  // ------------------------------------------------------------------ 1. Автоматичний інспектор Етапу 0 (scripts/klimop-etappe0-audit.mjs)
  const audit = voerKlimopEtappe0AuditUit(process.cwd());
  check('інспектор Етапу 0 повертає валідний звіт з усіма 11 службами та справжніми файлами',
    audit.schema === 1
    && audit.code === 'KLIMOP-ETAPPE-0-AUDIT'
    && audit.diensten.length === 11
    && audit.alleKernBestandenAanwezig === true
    && audit.enkelePuntenVanUitval.length === 5);

  check('інспектор Етапу 0 точно фіксує міграції (>=187), RLS, >=11 піддоменів тунелю, >=30 позицій сховища ключів і 14 агентів',
    audit.databank.totaalMigratieBestanden >= 187
    && audit.databank.migratiesMetEnableRls >= 86
    && audit.databank.migratiesMetForceRls >= 10
    && audit.netwerk.aantalTunnelSubdomeinen >= 11
    && audit.netwerk.aantalAppSubdomeinen >= 10
    && audit.versleuteling.sleutelkluisTotaal >= 30
    && audit.versleuteling.sleutelkluisOnderDek >= 11
    && audit.versleuteling.shamirKernAanwezig === true
    && audit.agentenEnVaardigheden.aantalAgentenInBeleid === 14
    && audit.agentenEnVaardigheden.aantalAdaptersInBeleid === 14
    && audit.agentenEnVaardigheden.aantalGedeeldeVaardigheden >= 12);

  // ------------------------------------------------------------------ 2. Двомовні документи Етапу 0 та Етапу 1
  const et0Uk = 'docs/hub/ПЛЮЩ-ЕТАП-0-АУДИТ-ДІЙСНОГО-СТАНУ.uk.md';
  const et0Md = 'docs/hub/ПЛЮЩ-ЕТАП-0-АУДИТ-ДІЙСНОГО-СТАНУ.md';
  const et0Nl = 'docs/hub/KLIMOP-FASE-0-AUDIT-FEITELIJKE-STAAT.nl.md';
  const et1Uk = 'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md';
  const et1Md = 'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md';
  const et1Nl = 'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md';

  check('двомовні звіти Етапу 0 та Етапу 1 існують, .md збігаються з .uk.md',
    [et0Uk, et0Md, et0Nl, et1Uk, et1Md, et1Nl].every((p) => existsSync(p))
    && lees(et0Uk) === lees(et0Md)
    && lees(et1Uk) === lees(et1Md));

  check('звіт Етапу 0 містить усі 5 виявлених SPOF та посилання на інспектор klimop-etappe0-audit.mjs',
    ['SPOF-1', 'SPOF-2', 'SPOF-3', 'SPOF-4', 'SPOF-5', 'klimop-etappe0-audit.mjs']
      .every((s) => lees(et0Uk).includes(s) && lees(et0Nl).includes(s)));

  check('специфікація Етапу 1 містить вибір технологій (Ed25519, FROST, Reed-Solomon, MLS, X25519MLKEM768), 25 документів та Етапи 2–12',
    ['Ed25519', 'FROST', 'Reed-Solomon', 'MLS (RFC 9420)', 'X25519MLKEM768', 'KLIMOP-003', 'KLIMOP-013', '| 25 |']
      .every((s) => lees(et1Uk).includes(s) && lees(et1Nl).includes(s)));

  // ------------------------------------------------------------------ 3. Програмне ядро Етапу 1 (shared/klimop/kern.ts)
  check('константи ядра відповідають маніфесту: 7 елементів, 4 типи вузлів, 7 ролей, 6 рівнів зберігання, 3 площини влади, 15 питань, 14 заборон',
    KLIMOP_STRUCTUUR_ELEMENTEN.length === 7
    && KLIMOP_KNOOPPUNT_TYPEN.length === 4
    && KLIMOP_BLAD_ROLLEN.length === 7
    && KLIMOP_OPSLAG_LAGEN.length === 6
    && KLIMOP_MACHT_DOMEINEN.length === 3
    && KLIMOP_CONTROLE_VRAGEN_IDS.length === 15
    && KLIMOP_VERBODEN_VEREENVOUDIGINGEN_IDS.length === 14);

  check('canoniekeJson упорядковує ключі детерміновано незалежно від порядку полів',
    canoniekeJson({ b: 2, a: { z: true, k: [3, 1] } }) === canoniekeJson({ a: { k: [3, 1], z: true }, b: 2 }));

  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie'],
    juridischeRegio: 'nl',
    aanbieder: 'eigen-apparatuur-nl',
    nuIso: '2026-11-20T18:00:00Z',
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'herstel'],
    juridischeRegio: 'ch',
    aanbieder: 'zwitserse-knoop',
    nuIso: '2026-11-20T18:00:00Z',
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verbinding', 'verificatie'],
    juridischeRegio: 'ua',
    aanbieder: 'oekraiense-knoop',
    nuIso: '2026-11-20T18:00:00Z',
  });
  const knMens = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'herstel', 'verificatie'],
    juridischeRegio: 'nl',
    aanbieder: 'persoonlijke-laptop',
    nuIso: '2026-11-20T18:00:00Z',
  });

  check('паспорт вузла Ed25519 має префікс klm1_ і точно відтворюваний knooppuntId за публічним ключем',
    /^klm1_[0-9a-f]{32}$/.test(knNL.identiteit.knooppuntId)
    && berekenKnooppuntId(knNL.identiteit.publiekeSleutelDerB64u) === knNL.identiteit.knooppuntId
    && knNL.identiteit.juridischeRegio === 'NL');

  let foutTijdelijk = '';
  try {
    maakKlimopKnooppunt({
      type: 'tijdelijke_toetredingsknooppunten',
      rollen: ['verbinding', 'herstel'],
      juridischeRegio: 'de',
      aanbieder: 'gastknoop',
    });
  } catch (e) {
    foutTijdelijk = (e as Error).message;
  }
  check('тимчасовий вузол приєднання не може отримати роль herstel (§4.4 маніфесту)',
    foutTijdelijk === 'KLIMOP_TIJDELIJK_KNOOPPUNT_MAG_GEEN_HERSTEL');

  const spreidingGoed = controleerKnooppuntOnafhankelijkheid([knNL.identiteit, knCH.identiteit, knUA.identiteit], 2);
  const knZelfdeAanbieder = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag'],
    juridischeRegio: 'de',
    aanbieder: 'eigen-apparatuur-nl',
  });
  const spreidingSlechtAanbieder = controleerKnooppuntOnafhankelijkheid([knNL.identiteit, knZelfdeAanbieder.identiteit], 2);
  const spreidingEenLand = controleerKnooppuntOnafhankelijkheid([knNL.identiteit, knMens.identiteit], 2);

  check('controleerKnooppuntOnafhankelijkheid схвалює 3 юрисдикції/постачальників і відхиляє концентрацію в одного постачальника чи в 1 країні (§43 п. 2)',
    spreidingGoed.ok === true && spreidingGoed.uniekeRegios === 3 && spreidingGoed.uniekeAanbieders === 3
    && !spreidingSlechtAanbieder.ok && spreidingSlechtAanbieder.fouten.some((f) => f.startsWith('EEN_AANBIEDER_HEEFT_QUORUM:'))
    && !spreidingEenLand.ok && spreidingEenLand.fouten.includes('MINSTENS_TWEE_JURISDICTIES_VEREIST'));

  // ------------------------------------------------------------------ 4. Мандати повноважень Ed25519, відокремлення влади та відкликання
  const basisMandaat: KlimopMandaatInhoud = {
    schema: 1,
    mandaatId: 'mnd-persoonlijk-001',
    uitgeverKnooppuntId: knMens.identiteit.knooppuntId,
    ontvangerKnooppuntId: knNL.identiteit.knooppuntId,
    machtDomein: 'persoonlijke_gegevens',
    toegestaneRollen: ['opslag'],
    toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
    alleenMetDrempelQuorum: false,
    drempelVereist: null,
    uitgegevenOp: '2026-11-20T18:00:00Z',
    verlooptOp: '2026-12-20T18:00:00Z',
  };
  const getekendPersoonlijk = ondertekenKlimopMandaat(basisMandaat, knMens);
  check('дійсний мандат власника особистих даних проходить перевірку підпису Ed25519',
    verifieerKlimopMandaat(getekendPersoonlijk, { nuIso: '2026-11-21T00:00:00Z' }).ok === true);

  const schendingScheiding: KlimopMandaatInhoud = {
    ...basisMandaat,
    mandaatId: 'mnd-schending-002',
    uitgeverKnooppuntId: knNL.identiteit.knooppuntId,
    machtDomein: 'knooppunt_beheer',
    toegestaneOpslagLagen: ['persoonlijke_geheime_gegevens'],
  };
  const vScheiding = verifieerKlimopMandaat(ondertekenKlimopMandaat(schendingScheiding, knNL), { nuIso: '2026-11-21T00:00:00Z' });
  check('оператор вузла (knooppunt_beheer) не може видати собі доступ до особистих таємних даних (§2 маніфесту)',
    !vScheiding.ok && vScheiding.fouten.includes('SCHEIDING_VAN_MACHTEN_GESCHONDEN_PERSOONLIJKE_GEGEVENS'));

  const alleenheerserRegel: KlimopMandaatInhoud = {
    ...basisMandaat,
    mandaatId: 'mnd-alleen-003',
    machtDomein: 'netwerk_regels',
    toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
    alleenMetDrempelQuorum: false,
    drempelVereist: null,
  };
  const vAlleen = verifieerKlimopMandaat(ondertekenKlimopMandaat(alleenheerserRegel, knNL), { nuIso: '2026-11-21T00:00:00Z' });
  check('одноосібний мандат у площині netwerk_regels без порогового кворуму блокується (GEEN_ALLEENHEERSCHAPPIJ)',
    !vAlleen.ok && vAlleen.fouten.includes('GEEN_ALLEENHEERSCHAPPIJ_DREMPEL_VEREIST'));

  const quorumInhoud: KlimopMandaatInhoud = {
    ...alleenheerserRegel,
    mandaatId: 'mnd-quorum-004',
    alleenMetDrempelQuorum: true,
    drempelVereist: { k: 2, n: 3 },
  };
  const eenHandtekening = ondertekenKlimopMandaat(quorumInhoud, knNL);
  const tweeHandtekeningen = ondertekenKlimopMandaat(quorumInhoud, knCH, eenHandtekening.handtekeningen);
  check('пороговий мандат netwerk_regels (2-з-3): з 1 підписом відхиляється, з 2 незалежними підписами Ed25519 — чинний',
    !verifieerKlimopMandaat(eenHandtekening, { nuIso: '2026-11-21T00:00:00Z' }).ok
    && verifieerKlimopMandaat(tweeHandtekeningen, { nuIso: '2026-11-21T00:00:00Z' }).ok === true);

  const vervalst = {
    ...tweeHandtekeningen,
    inhoud: { ...tweeHandtekeningen.inhoud, verlooptOp: '2029-12-31T00:00:00Z' },
  };
  check('підробка вмісту після підписання, закінчення строку дії та відкликання мандата чи вузла негайно блокуються',
    !verifieerKlimopMandaat(vervalst, { nuIso: '2026-11-21T00:00:00Z' }).ok
    && verifieerKlimopMandaat(tweeHandtekeningen, { nuIso: '2027-01-01T00:00:00Z' }).fouten.includes('MANDAAT_VERLOPEN_OF_NOG_NIET_GELDIG')
    && verifieerKlimopMandaat(tweeHandtekeningen, { nuIso: '2026-11-21T00:00:00Z', ingetrokkenMandaatIds: new Set(['mnd-quorum-004']) }).fouten.includes('MANDAAT_INGETROKKEN')
    && !verifieerKlimopMandaat(tweeHandtekeningen, { nuIso: '2026-11-21T00:00:00Z', ingetrokkenKnooppuntIds: new Set([knCH.identiteit.knooppuntId]) }).ok);

  // ------------------------------------------------------------------ 5. Захист людини від примусу (§17) та перевіряльник 15 питань (§42–§43)
  const dwangLezen = beoordeelDwangSignaal({ dwangSleutelGebruikt: true, verdachteOmgeving: false, gevraagdeActie: 'lezen_basis' });
  const dwangSleutelExport = beoordeelDwangSignaal({ dwangSleutelGebruikt: true, verdachteOmgeving: false, gevraagdeActie: 'sleutel_export' });
  const dwangVernietig = beoordeelDwangSignaal({
    dwangSleutelGebruikt: true,
    verdachteOmgeving: true,
    gevraagdeActie: 'gegevens_wissen',
    gevraagdeAutomatischeVernietiging: true,
  });

  check('режим примусу (§17): вмикає veilig_beperkt, блокує експорт ключів із 72-год затримкою і НІКОЛИ автоматично не знищує дані',
    dwangLezen.modus === 'veilig_beperkt' && dwangLezen.actieToegestaan === true
    && dwangSleutelExport.modus === 'veilig_beperkt' && dwangSleutelExport.actieToegestaan === false && dwangSleutelExport.verplichteWachttijdUren === 72
    && dwangVernietig.actieToegestaan === false
    && dwangVernietig.automatischeVernietigingUitgevoerd === false
    && dwangVernietig.redenCode === 'AUTOMATISCHE_VERNIETIGING_VERBODEN_DOOR_MANIFEST');

  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, { voldaan: true, bewijs: `Перевірено модулем ядра для ${id}` }]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const oordeelGoed = beoordeelKlimopWijziging({
    naam: 'KLIMOP-002 Етап 1 ядро',
    fase: 1,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  const oordeelSlecht = beoordeelKlimopWijziging({
    naam: 'Спроба вимкнути сервер до заміни',
    fase: 1,
    raaktProductieDirectZonderGoedkeuring: true,
    antwoorden15: { ...geldigeAntwoorden15, veilig_terugdraaien_mogelijk: { voldaan: false, bewijs: '' } },
    aanwezigeVerbodenVereenvoudigingen: ['productie_uitschakelen_voor_vervanging'],
  });

  check('beoordeelKlimopWijziging схвалює повну 15-пунктову відповідність і блокує порушення питань, заборонені спрощення та втручання в робоче середовище',
    oordeelGoed.goedgekeurd === true && oordeelGoed.fouten.length === 0
    && !oordeelSlecht.goedgekeurd
    && oordeelSlecht.fouten.includes('DIRECTE_PRODUCTIEWIJZIGING_ZONDER_EIGENAAR_VERBODEN')
    && oordeelSlecht.ontbrekendeOfGefaaldeVragen.includes('veilig_terugdraaien_mogelijk')
    && oordeelSlecht.geschondenVereenvoudigingen.includes('productie_uitschakelen_voor_vervanging'));

  // ------------------------------------------------------------------ 6. Досьє пам'яті та Абсолютний мовний закон
  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json містить злиту задачу KLIMOP-001 (запит №183), нову задачу KLIMOP-002 і 6 активних можливостей',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-001' && w.pr === 183)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-002')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 6);

  const bestandenKlimop002 = [
    'scripts/klimop-etappe0-audit.mjs',
    'shared/klimop/kern.ts',
    et0Uk,
    et0Nl,
    et1Uk,
    et1Nl,
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'tests/eenheid/klimop-002-etappe0-en-kern-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop002.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || taalwetOvertreding(inhoud);
  });
  check('усі файли KLIMOP-002 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
