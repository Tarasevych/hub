// KLIMOP-011 (20.11.2026, Етап 10 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Кероване добровільне розширення мережі («Вусики»), між'юрисдикційна стійкість, протидія атакам Сивілли
// та поведінці комп'ютерного хробака, справедливий взаємний обмін ресурсами («Живлення») і безпечне виведення вузлів
// (§1.4–1.5, §4–§5.2, §26–§27, §36 Етап 10, §42 п. 6, 13, §43 п. 2, 6, 7, 10; обов'язковий Документ №15):
//   1. Запобіжник проти поведінки комп'ютерного хробака (§5.2) та нульовий бюджет витрат без прямого рішення власника;
//   2. Підписане свідоцтво приєднання нового вузла (`HechtrankToetredingsBewijs`) з обмеженими ролями й відкликанням;
//   3. Захист від масового створення фальшивих учасників (атак Сивілли), монополізації маршрутів і єдиного вузла входу (§4.4, §5.1);
//   4. Двосторонні підписані квитанції перевіреного внеску ресурсів та справедливий баланс «Живлення» (§26–§27),
//      де доступ людини до її власних даних ЗАВЖДИ залишається безумовним (ніколи не є «винагородою» за потужності);
//   5. Безпечне виведення постійного вузла чи особистого пристрою з мережі без втрати кворуму, юрисдикцій чи зашифрованих смуг.

import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import {
  KLIMOP_BLAD_ROLLEN,
  KLIMOP_KNOOPPUNT_TYPEN,
  berekenKnooppuntId,
  canoniekeJson,
  controleerKnooppuntOnafhankelijkheid,
  type KlimopBladRol,
  type KlimopKnooppuntIdentiteit,
} from './kern';

const HECHTRANK_TOETREDING_DOMEIN = 'klimop-hechtrank-toetreding-v1|';
const VOEDING_KWITANTIE_DOMEIN = 'klimop-voeding-kwitantie-v1|';
const UITTREDING_BEWIJS_DOMEIN = 'klimop-veilige-uittreding-v1|';

function tekenEd25519(geheimPkcs8B64u: string, boodschap: Buffer): string {
  const priv = createPrivateKey({
    key: Buffer.from(geheimPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, boodschap, priv).toString('base64url');
}

function verifieerEd25519(publiekDerB64u: string, boodschap: Buffer, handtekeningB64u: string): boolean {
  try {
    const pub = createPublicKey({
      key: Buffer.from(publiekDerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, boodschap, pub, Buffer.from(handtekeningB64u, 'base64url'));
  } catch {
    return false;
  }
}

// =================================================================================================
// 1. Кероване приєднання нових вузлів («Вусики») та захист від поведінки комп'ютерного хробака (§5.2)
// =================================================================================================

export interface KnooppuntToetredingsAanvraag {
  kandidaatIdentiteit: KlimopKnooppuntIdentiteit;
  netwerkVoorvoegsel: string; // напр. '185.40.12.0/24' або '2a03:b0c0:3::/48'
  gevraagdeRollen: readonly KlimopBladRol[];
  maxOpslagMiB: number;
  maxBandbreedteMiBPerDag: number;
  maxToegestaneReplicas: number;
  uitdrukkelijkeToestemmingApparaatEigenaar: boolean;
  geenZelfstandigeInstallatie: boolean;
  geenOngevraagdeKopieVanPriveInhoud: boolean;
  geenVerborgenRekenkrachtGebruik: boolean;
  automatischeRechtenUitbreidingViaVerbinding: boolean;
  vertrouwdAlleenWegensNetwerkNabijheid: boolean;
  externeMiddelenBelastingEenheden?: number;
  maandelijkseKostenEuro?: number;
  uitdrukkelijkeKostenGoedkeuringEigenaar: boolean;
}

/**
 * Перевіряє заявку нового вузла за §5, §5.2, §43 п. 6, 10 та правилом добровільного надання ресурсів без прихованих зобов'язань:
 *   - блокує будь-яку ознаку комп'ютерного хробака (самовільне встановлення, приховане споживання, безмежне розмноження,
 *     автоматичне розширення повноважень через сусідство);
 *   - забороняє тимчасовим перехідним вузлам (`tijdelijke_toetredingsknooppunten`) отримувати критичні ролі `herstel` чи `opslag` закритих часток;
 *   - блокує несанкціоноване залучення додаткових сторонніх ресурсів без прямого попереднього рішення власника.
 */
export function valideerKnooppuntToetredingsAanvraag(
  aanvraag: KnooppuntToetredingsAanvraag,
): { ok: true } | { ok: false; fout: string } {
  const { kandidaatIdentiteit } = aanvraag;
  if (!kandidaatIdentiteit || !KLIMOP_KNOOPPUNT_TYPEN.includes(kandidaatIdentiteit.type)) {
    return { ok: false, fout: 'TOETREDING_ONGELDIG_KNOOPPUNT_TYPE' };
  }
  if (
    !aanvraag.uitdrukkelijkeToestemmingApparaatEigenaar
    || !aanvraag.geenZelfstandigeInstallatie
  ) {
    return { ok: false, fout: 'WORMGEDRAG_ZELFSTANDIGE_INSTALLATIE_VERBODEN' };
  }
  if (!aanvraag.geenOngevraagdeKopieVanPriveInhoud) {
    return { ok: false, fout: 'WORMGEDRAG_ONGEVRAAGDE_KOPIE_VERBODEN' };
  }
  if (!aanvraag.geenVerborgenRekenkrachtGebruik) {
    return { ok: false, fout: 'WORMGEDRAG_VERBORGEN_MIDDELENVERBRUIK_VERBODEN' };
  }
  if (aanvraag.automatischeRechtenUitbreidingViaVerbinding) {
    return { ok: false, fout: 'WORMGEDRAG_AUTOMATISCHE_RECHTENUITBREIDING_VERBODEN' };
  }
  if (aanvraag.vertrouwdAlleenWegensNetwerkNabijheid) {
    return { ok: false, fout: 'NETWERKNABIJHEID_GEEN_GROND_VOOR_VERTROUWEN' };
  }
  if (aanvraag.maxToegestaneReplicas <= 0 || aanvraag.maxToegestaneReplicas > 16) {
    return { ok: false, fout: 'WORMGEDRAG_ONBEGRENSDE_REPLICATIE_VERBODEN' };
  }
  if (aanvraag.maxOpslagMiB <= 0 || aanvraag.maxBandbreedteMiBPerDag <= 0) {
    return { ok: false, fout: 'TOETREDING_MIDDELENQUOTA_ONGELDIG' };
  }
  const externeBelasting = aanvraag.externeMiddelenBelastingEenheden ?? aanvraag.maandelijkseKostenEuro ?? 0;
  if (!Number.isFinite(externeBelasting) || externeBelasting < 0) {
    return { ok: false, fout: 'TOETREDING_MIDDELENQUOTA_ONGELDIG' };
  }
  if (externeBelasting > 0 && !aanvraag.uitdrukkelijkeKostenGoedkeuringEigenaar) {
    return { ok: false, fout: 'KOSTEN_ZONDER_EIGENAARSGOEDKEURING_VERBODEN' };
  }
  if (
    aanvraag.gevraagdeRollen.length === 0
    || aanvraag.gevraagdeRollen.some((r) => !KLIMOP_BLAD_ROLLEN.includes(r))
    || aanvraag.gevraagdeRollen.some((r) => !kandidaatIdentiteit.rollen.includes(r))
  ) {
    return { ok: false, fout: 'TOETREDING_GEVRAAGDE_ROLLEN_ONGELDIG' };
  }
  if (
    kandidaatIdentiteit.type === 'tijdelijke_toetredingsknooppunten'
    && aanvraag.gevraagdeRollen.some((r) => r !== 'verbinding')
  ) {
    return { ok: false, fout: 'TIJDELIJKE_TOETREDINGSKNOOP_ALLEEN_VERBINDINGSROL' };
  }
  return { ok: true };
}

export interface HechtrankToetredingsBewijs {
  schema: 1;
  toetredingId: string;
  knooppuntIdentiteit: KlimopKnooppuntIdentiteit;
  netwerkVoorvoegsel: string;
  toegekendeRollen: readonly KlimopBladRol[];
  maxOpslagMiB: number;
  maxBandbreedteMiBPerDag: number;
  maxToegestaneReplicas: number;
  uitgegevenOp: string;
  verlooptOp: string;
  sponsorPubDerB64u: string;
  sponsorHandtekeningB64u: string;
  kandidaatHandtekeningB64u: string;
}

/** Видає двосторонньо підписане (спонсор довіри + сам новий вузол) свідоцтво керованого приєднання (§5, Документ №15). */
export function maakHechtrankToetredingsBewijs(opties: {
  aanvraag: KnooppuntToetredingsAanvraag;
  kandidaatGeheimPkcs8B64u: string;
  sponsorSleutels: { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string };
  nuIso?: string;
  geldigheidDagen?: number;
}): { ok: true; bewijs: HechtrankToetredingsBewijs } | { ok: false; fout: string } {
  const v = valideerKnooppuntToetredingsAanvraag(opties.aanvraag);
  if (!v.ok) return v;

  const uitgegevenOp = opties.nuIso ?? new Date().toISOString();
  const dagen = Math.max(1, opties.geldigheidDagen ?? 90);
  const verlooptOp = new Date(Date.parse(uitgegevenOp) + dagen * 86_400_000).toISOString();

  const kern = {
    schema: 1 as const,
    toetredingId: `htr_${randomBytes(10).toString('hex')}`,
    knooppuntIdentiteit: opties.aanvraag.kandidaatIdentiteit,
    netwerkVoorvoegsel: opties.aanvraag.netwerkVoorvoegsel,
    toegekendeRollen: [...opties.aanvraag.gevraagdeRollen],
    maxOpslagMiB: opties.aanvraag.maxOpslagMiB,
    maxBandbreedteMiBPerDag: opties.aanvraag.maxBandbreedteMiBPerDag,
    maxToegestaneReplicas: opties.aanvraag.maxToegestaneReplicas,
    uitgegevenOp,
    verlooptOp,
    sponsorPubDerB64u: opties.sponsorSleutels.publiekeSleutelDerB64u,
  };
  const boodschap = Buffer.from(HECHTRANK_TOETREDING_DOMEIN + canoniekeJson(kern), 'utf8');

  return {
    ok: true,
    bewijs: {
      ...kern,
      sponsorHandtekeningB64u: tekenEd25519(opties.sponsorSleutels.geheimeSleutelPkcs8B64u, boodschap),
      kandidaatHandtekeningB64u: tekenEd25519(opties.kandidaatGeheimPkcs8B64u, boodschap),
    },
  };
}

export function verifieerHechtrankToetredingsBewijs(opties: {
  bewijs: HechtrankToetredingsBewijs;
  erkendeSponsorPubSleutels: ReadonlySet<string>;
  ingetrokkenToetredingIds?: ReadonlySet<string>;
  nuIso?: string;
}): { ok: true } | { ok: false; fout: string } {
  const { bewijs } = opties;
  if (!bewijs || bewijs.schema !== 1) {
    return { ok: false, fout: 'TOETREDINGSBEWIJS_ONGELDIG' };
  }
  if (opties.ingetrokkenToetredingIds?.has(bewijs.toetredingId)) {
    return { ok: false, fout: 'TOETREDINGSBEWIJS_INGETROKKEN' };
  }
  if (!opties.erkendeSponsorPubSleutels.has(bewijs.sponsorPubDerB64u)) {
    return { ok: false, fout: 'TOETREDING_ONBEKENDE_SPONSOR' };
  }
  const nuMs = Date.parse(opties.nuIso ?? new Date().toISOString());
  const uitgegevenMs = Date.parse(bewijs.uitgegevenOp);
  const verlooptMs = Date.parse(bewijs.verlooptOp);
  if (![nuMs, uitgegevenMs, verlooptMs].every(Number.isFinite) || nuMs < uitgegevenMs || nuMs > verlooptMs) {
    return { ok: false, fout: 'TOETREDINGSBEWIJS_VERLOPEN' };
  }
  if (berekenKnooppuntId(bewijs.knooppuntIdentiteit.publiekeSleutelDerB64u) !== bewijs.knooppuntIdentiteit.knooppuntId) {
    return { ok: false, fout: 'TOETREDING_SLEUTEL_ID_KOMT_NIET_OVEREEN' };
  }
  const { sponsorHandtekeningB64u, kandidaatHandtekeningB64u, ...kern } = bewijs;
  const boodschap = Buffer.from(HECHTRANK_TOETREDING_DOMEIN + canoniekeJson(kern), 'utf8');
  if (
    !verifieerEd25519(bewijs.sponsorPubDerB64u, boodschap, sponsorHandtekeningB64u)
    || !verifieerEd25519(bewijs.knooppuntIdentiteit.publiekeSleutelDerB64u, boodschap, kandidaatHandtekeningB64u)
  ) {
    return { ok: false, fout: 'TOETREDINGSBEWIJS_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}

// =================================================================================================
// 2. Протидія атакам Сивілли, монополізації маршрутів і єдиній точці входу (§4.4, §5.1, §43 п. 2, 7)
// =================================================================================================

export interface SybilWeerstandVerslag {
  veiligTegenSybilOvername: boolean;
  totaalAangemeldeKnopen: number;
  effectieveOnafhankelijkeStemmen: number;
  uniekeJuridischeRegios: number;
  uniekeAanbieders: number;
  uniekeNetwerkVoorvoegsels: number;
  genegeerdeTijdelijkeKnopen: number;
  begrensdeDubbeleAanbiederOfSubnetKnopen: number;
  /** KLIMOP-020: прострочені або відкликані приєднання, відсіяні на момент оцінки. */
  verlopenOfIngetrokkenGenegeerd?: number;
  /** KLIMOP-020: чи підтверджено фактичну незалежність операторів/мереж зовнішнім реєстром (самозаявлені паспорти = false). */
  fysiekeOnafhankelijkheidExternBewezen?: boolean;
  onafhankelijkheidsBewijsBron?: 'zelfverklaarde_paspoorten' | 'extern_geverifieerd_register';
  fouten: string[];
}

/**
 * Обчислює справжню порогову вагу мережі за §5.1 та §43 п. 2, 7:
 *   - відкидає прострочені, відкликані й тимчасові перехідні вузли з критичного кворуму;
 *   - згортає будь-яку кількість фальшивих вузлів одного постачальника чи однієї підмережі до щонайбільше 1 ефективного голосу;
 *   - окремо показує брак зовнішніх доказів фактичної незалежності, якщо перевірено лише самозаявлені паспорти.
 */
export function beoordeelSybilEnSpreidingsWeerstand(opties: {
  toetredingen: readonly HechtrankToetredingsBewijs[];
  vereisteOnafhankelijkeDrempel: number;
  nuIso?: string;
  ingetrokkenToetredingIds?: ReadonlySet<string>;
  externGeverifieerdeKnooppuntIds?: ReadonlySet<string>;
}): SybilWeerstandVerslag {
  const fouten: string[] = [];
  const gezieneAanbieders = new Set<string>();
  const gezieneVoorvoegsels = new Set<string>();
  const effectieveRegios = new Set<string>();
  const nuMs = Date.parse(opties.nuIso ?? new Date().toISOString());

  let effectieveOnafhankelijkeStemmen = 0;
  let externBewezenStemmen = 0;
  let genegeerdeTijdelijkeKnopen = 0;
  let begrensdeDubbeleAanbiederOfSubnetKnopen = 0;
  let verlopenOfIngetrokkenGenegeerd = 0;

  for (const t of opties.toetredingen) {
    if (opties.ingetrokkenToetredingIds?.has(t.toetredingId)) {
      verlopenOfIngetrokkenGenegeerd += 1;
      continue;
    }
    const uitMs = Date.parse(t.uitgegevenOp);
    const verMs = Date.parse(t.verlooptOp);
    if (![nuMs, uitMs, verMs].every(Number.isFinite) || verMs <= uitMs || nuMs < uitMs || nuMs > verMs) {
      verlopenOfIngetrokkenGenegeerd += 1;
      continue;
    }
    const kn = t.knooppuntIdentiteit;
    if (kn.type === 'tijdelijke_toetredingsknooppunten') {
      genegeerdeTijdelijkeKnopen += 1;
      continue;
    }
    if (gezieneAanbieders.has(kn.aanbieder) || gezieneVoorvoegsels.has(t.netwerkVoorvoegsel)) {
      begrensdeDubbeleAanbiederOfSubnetKnopen += 1;
      continue;
    }
    gezieneAanbieders.add(kn.aanbieder);
    gezieneVoorvoegsels.add(t.netwerkVoorvoegsel);
    effectieveRegios.add(kn.juridischeRegio);
    effectieveOnafhankelijkeStemmen += 1;
    if (opties.externGeverifieerdeKnooppuntIds?.has(kn.knooppuntId)) {
      externBewezenStemmen += 1;
    }
  }

  if (effectieveOnafhankelijkeStemmen < opties.vereisteOnafhankelijkeDrempel) {
    fouten.push('ONVOLDOENDE_ECHT_ONAFHANKELIJKE_KNOPEN_NA_SYBIL_FILTER');
  }
  if (effectieveRegios.size < 2) {
    fouten.push('MINSTENS_TWEE_JURISDICTIES_VEREIST_VOOR_SPREIDING');
  }

  const fysiekeOnafhankelijkheidExternBewezen =
    Boolean(opties.externGeverifieerdeKnooppuntIds)
    && externBewezenStemmen >= opties.vereisteOnafhankelijkeDrempel;

  return {
    veiligTegenSybilOvername: fouten.length === 0,
    totaalAangemeldeKnopen: opties.toetredingen.length,
    effectieveOnafhankelijkeStemmen,
    uniekeJuridischeRegios: effectieveRegios.size,
    uniekeAanbieders: gezieneAanbieders.size,
    uniekeNetwerkVoorvoegsels: gezieneVoorvoegsels.size,
    genegeerdeTijdelijkeKnopen,
    begrensdeDubbeleAanbiederOfSubnetKnopen,
    verlopenOfIngetrokkenGenegeerd,
    fysiekeOnafhankelijkheidExternBewezen,
    onafhankelijkheidsBewijsBron: fysiekeOnafhankelijkheidExternBewezen
      ? 'extern_geverifieerd_register'
      : 'zelfverklaarde_paspoorten',
    fouten,
  };
}

/**
 * Перевіряє правило перехідних вузлів входу (§4.4 маніфесту):
 *   - перехідний вузол не може бути єдиним способом знайти інші вузли;
 *   - вимкнення перехідного вузла заборонене, доки не перевірено щонайменше 2 незалежні точки входу у різних постачальників!
 */
export function controleerGeenEnkelToetredingsknooppunt(opties: {
  actieveIngangsPunten: ReadonlyArray<{ knooppuntId: string; aanbieder: string; juridischeRegio: string }>;
  teSluitenKnooppuntId?: string;
}): { ok: boolean; overblijvendeOnafhankelijkeIngangen: number; fout: string | null } {
  const overblijvend = opties.actieveIngangsPunten.filter((p) => p.knooppuntId !== opties.teSluitenKnooppuntId);
  const uniekeAanbieders = new Set(overblijvend.map((p) => p.aanbieder));
  const uniekeRegios = new Set(overblijvend.map((p) => p.juridischeRegio));

  if (uniekeAanbieders.size < 2 || uniekeRegios.size < 2) {
    return {
      ok: false,
      overblijvendeOnafhankelijkeIngangen: uniekeAanbieders.size,
      fout: 'ENKEL_TOETREDINGSKNOOPPUNT_OF_ONVOLDOENDE_ALTERNATIEVE_INGANGEN',
    };
  }
  return {
    ok: true,
    overblijvendeOnafhankelijkeIngangen: uniekeAanbieders.size,
    fout: null,
  };
}

// =================================================================================================
// 3. Економіка ресурсів («Живлення»): чесні профілі пристроїв та взаємний обмін (§26–§27)
// =================================================================================================

export type ApparaatMiddelenKlasse =
  | 'ouder_zuinig_toestel'
  | 'moderne_telefoon'
  | 'persoonlijke_laptop'
  | 'thuis_miniserver'
  | 'vast_knooppunt_server';

export interface ApparaatRichtwaardenProfiel {
  klasse: ApparaatMiddelenKlasse;
  alleenTijdensOpladenStandaard: boolean;
  maxAchtergrondGeheugenMiB: number;
  maxAchtergrondCpuPct: number;
  maxDagelijksVerkeerMiB: number;
  gelijkVerbruikBelofteOpAlleTelefoons: false; // §26 абз. 4: ніколи не обіцяти однакове споживання всіма телефонами!
}

export const APPARAAT_KLASSE_RICHTWAARDEN: Readonly<Record<ApparaatMiddelenKlasse, ApparaatRichtwaardenProfiel>> =
  Object.freeze({
    ouder_zuinig_toestel: {
      klasse: 'ouder_zuinig_toestel',
      alleenTijdensOpladenStandaard: true,
      maxAchtergrondGeheugenMiB: 64,
      maxAchtergrondCpuPct: 10,
      maxDagelijksVerkeerMiB: 50,
      gelijkVerbruikBelofteOpAlleTelefoons: false,
    },
    moderne_telefoon: {
      klasse: 'moderne_telefoon',
      alleenTijdensOpladenStandaard: true,
      maxAchtergrondGeheugenMiB: 192,
      maxAchtergrondCpuPct: 20,
      maxDagelijksVerkeerMiB: 250,
      gelijkVerbruikBelofteOpAlleTelefoons: false,
    },
    persoonlijke_laptop: {
      klasse: 'persoonlijke_laptop',
      alleenTijdensOpladenStandaard: false,
      maxAchtergrondGeheugenMiB: 512,
      maxAchtergrondCpuPct: 25,
      maxDagelijksVerkeerMiB: 2048,
      gelijkVerbruikBelofteOpAlleTelefoons: false,
    },
    thuis_miniserver: {
      klasse: 'thuis_miniserver',
      alleenTijdensOpladenStandaard: false,
      maxAchtergrondGeheugenMiB: 2048,
      maxAchtergrondCpuPct: 50,
      maxDagelijksVerkeerMiB: 20_480,
      gelijkVerbruikBelofteOpAlleTelefoons: false,
    },
    vast_knooppunt_server: {
      klasse: 'vast_knooppunt_server',
      alleenTijdensOpladenStandaard: false,
      maxAchtergrondGeheugenMiB: 8192,
      maxAchtergrondCpuPct: 75,
      maxDagelijksVerkeerMiB: 102_400,
      gelijkVerbruikBelofteOpAlleTelefoons: false,
    },
  });

export interface KlimopMiddelenBijdrageKwitantie {
  schema: 1;
  kwitantieId: string;
  leverancierKnooppuntId: string;
  controleurKnooppuntId: string;
  controleurPubDerB64u: string;
  geleverdeOpslagMiB: number;
  beschikbaarheidMinuten: number;
  overgedragenVersleuteldeMiB: number;
  geverifieerdeOperaties: number;
  betrouwbaarheidRatio: number; // 0..1
  vastgelegdOp: string;
  controleurHandtekeningB64u: string;
}

/** Формує криптографічно підписану іншим вузлом квитанцію фактично наданих ресурсів (§27). */
export function maakMiddelenBijdrageKwitantie(opties: {
  leverancierKnooppuntId: string;
  controleur: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
  geleverdeOpslagMiB: number;
  beschikbaarheidMinuten: number;
  overgedragenVersleuteldeMiB: number;
  geverifieerdeOperaties: number;
  betrouwbaarheidRatio: number;
  nuIso?: string;
}): { ok: true; kwitantie: KlimopMiddelenBijdrageKwitantie } | { ok: false; fout: string } {
  if (opties.leverancierKnooppuntId === opties.controleur.identiteit.knooppuntId) {
    return { ok: false, fout: 'ZELF_ONDERTEKENDE_BIJDRAGE_ONGELDIG' };
  }
  const kern = {
    schema: 1 as const,
    kwitantieId: `vkw_${randomBytes(10).toString('hex')}`,
    leverancierKnooppuntId: opties.leverancierKnooppuntId,
    controleurKnooppuntId: opties.controleur.identiteit.knooppuntId,
    controleurPubDerB64u: opties.controleur.identiteit.publiekeSleutelDerB64u,
    geleverdeOpslagMiB: Math.max(0, Math.trunc(opties.geleverdeOpslagMiB)),
    beschikbaarheidMinuten: Math.max(0, Math.trunc(opties.beschikbaarheidMinuten)),
    overgedragenVersleuteldeMiB: Math.max(0, Math.trunc(opties.overgedragenVersleuteldeMiB)),
    geverifieerdeOperaties: Math.max(0, Math.trunc(opties.geverifieerdeOperaties)),
    betrouwbaarheidRatio: Math.min(1, Math.max(0, opties.betrouwbaarheidRatio)),
    vastgelegdOp: opties.nuIso ?? new Date().toISOString(),
  };
  return {
    ok: true,
    kwitantie: {
      ...kern,
      controleurHandtekeningB64u: tekenEd25519(
        opties.controleur.geheimeSleutelPkcs8B64u,
        Buffer.from(VOEDING_KWITANTIE_DOMEIN + canoniekeJson(kern), 'utf8'),
      ),
    },
  };
}

export function verifieerMiddelenBijdrageKwitantie(
  kwitantie: KlimopMiddelenBijdrageKwitantie,
): { ok: true } | { ok: false; fout: string } {
  if (!kwitantie || kwitantie.schema !== 1) {
    return { ok: false, fout: 'KWITANTIE_ONGELDIG' };
  }
  if (kwitantie.leverancierKnooppuntId === kwitantie.controleurKnooppuntId) {
    return { ok: false, fout: 'ZELF_ONDERTEKENDE_BIJDRAGE_ONGELDIG' };
  }
  if (berekenKnooppuntId(kwitantie.controleurPubDerB64u) !== kwitantie.controleurKnooppuntId) {
    return { ok: false, fout: 'KWITANTIE_CONTROLEUR_SLEUTEL_ID_KOMT_NIET_OVEREEN' };
  }
  const { controleurHandtekeningB64u, ...kern } = kwitantie;
  if (!verifieerEd25519(kwitantie.controleurPubDerB64u, Buffer.from(VOEDING_KWITANTIE_DOMEIN + canoniekeJson(kern), 'utf8'), controleurHandtekeningB64u)) {
    return { ok: false, fout: 'KWITANTIE_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}

export interface EerlijkeVoedingBalans {
  deelnemerId: string;
  bijdragePunten: number;
  prioriteitVoorExtraNetwerkRepliek: 'basis_passief_lid' | 'actieve_bijdrager' | 'kern_ondersteuner';
  toegangTotEigenGegevensOnvoorwaardelijk: true; // §27 абз. 3: доступ до власних даних НІКОЛИ не залежить від внеску!
  verplichteRekenkrachtDeelname: false;          // §27 абз. 5: жодного примусу до надання потужностей!
}

/**
 * Розраховує чесний баланс взаємної підтримки «Живлення» (§27 маніфесту):
 *   - пасивний учасник з `0` квитанцій (напр. людина без постійно ввімкненого пристрою, §27 абз. 4)
 *     отримує повний і безумовний доступ до власних даних (`toegangTotEigenGegevensOnvoorwaardelijk: true`);
 *   - перевірені квитанції визначають лише чесну черговість додаткових мережевих резервів між вузлами.
 */
export function berekenEerlijkeMiddelenBalans(
  deelnemerId: string,
  kwitanties: readonly KlimopMiddelenBijdrageKwitantie[],
): EerlijkeVoedingBalans {
  let som = 0;
  for (const kw of kwitanties) {
    if (kw.leverancierKnooppuntId !== deelnemerId) continue;
    if (!verifieerMiddelenBijdrageKwitantie(kw).ok) continue;
    const ruw =
      kw.geleverdeOpslagMiB * 0.5
      + kw.beschikbaarheidMinuten * 0.2
      + kw.overgedragenVersleuteldeMiB * 1.0
      + kw.geverifieerdeOperaties * 0.5;
    som += Math.round(ruw * kw.betrouwbaarheidRatio);
  }

  const prioriteit: EerlijkeVoedingBalans['prioriteitVoorExtraNetwerkRepliek'] =
    som >= 2000 ? 'kern_ondersteuner' : som > 0 ? 'actieve_bijdrager' : 'basis_passief_lid';

  return {
    deelnemerId,
    bijdragePunten: som,
    prioriteitVoorExtraNetwerkRepliek: prioriteit,
    toegangTotEigenGegevensOnvoorwaardelijk: true,
    verplichteRekenkrachtDeelname: false,
  };
}

// =================================================================================================
// 4. Безпечне виведення вузла або особистого пристрою з кворуму (§26 п. 7–8, план Етапу 1)
// =================================================================================================

export interface VeiligeKnooppuntUittredingBewijs {
  schema: 1;
  uittredingId: string;
  uittredendKnooppuntId: string;
  overblijvendeKnooppuntIds: readonly string[];
  uitgetredenOp: string;
  ondertekenaarPubDerB64u: string;
  handtekeningB64u: string;
}

/**
 * Перевіряє й оформлює безпечне виведення вузла з кворуму без втрати даних і без порушення юрисдикцій:
 *   - особистий пристрій користувача завжди має право НЕГАЙНО зупинити фонову участь (`onmiddellijkStoppenAchtergrondToegestaan: true`, §26 п. 7);
 *   - постійний кворумний вузол перед повним виведенням має перенести невідтворені смуги (`openstaandeTeVerplaatsenStrepen === 0`)
 *     і залишити живий незалежний кворум у щонайменше 2 юрисдикціях і в різних постачальників!
 */
export function planVeiligeKnooppuntUittreding(opties: {
  uittredendKnooppunt: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
  alleActieveKnooppunten: readonly KlimopKnooppuntIdentiteit[];
  vereisteQuorumDrempel: number;
  openstaandeTeVerplaatsenStrepen: number;
  nuIso?: string;
}):
  | {
      ok: true;
      onmiddellijkStoppenAchtergrondToegestaan: true;
      bewijs: VeiligeKnooppuntUittredingBewijs;
    }
  | {
      ok: false;
      onmiddellijkStoppenAchtergrondToegestaan: true;
      fout: string;
    } {
  const uittredendId = opties.uittredendKnooppunt.identiteit.knooppuntId;

  if (opties.openstaandeTeVerplaatsenStrepen > 0) {
    return {
      ok: false,
      onmiddellijkStoppenAchtergrondToegestaan: true,
      fout: 'EERST_STREPEN_HERPLAATSEN_VOOR_UITTREDING',
    };
  }

  const overblijvend = opties.alleActieveKnooppunten.filter(
    (k) => k.knooppuntId !== uittredendId && k.type !== 'tijdelijke_toetredingsknooppunten',
  );
  const spreiding = controleerKnooppuntOnafhankelijkheid(overblijvend, opties.vereisteQuorumDrempel);
  if (!spreiding.ok) {
    return {
      ok: false,
      onmiddellijkStoppenAchtergrondToegestaan: true,
      fout: 'UITTREDING_BREEKT_JURISDICTIE_OF_AANBIEDER_QUORUM',
    };
  }

  const uitgetredenOp = opties.nuIso ?? new Date().toISOString();
  const kern = {
    schema: 1 as const,
    uittredingId: `uit_${randomBytes(10).toString('hex')}`,
    uittredendKnooppuntId: uittredendId,
    overblijvendeKnooppuntIds: overblijvend.map((k) => k.knooppuntId),
    uitgetredenOp,
    ondertekenaarPubDerB64u: opties.uittredendKnooppunt.identiteit.publiekeSleutelDerB64u,
  };

  return {
    ok: true,
    onmiddellijkStoppenAchtergrondToegestaan: true,
    bewijs: {
      ...kern,
      handtekeningB64u: tekenEd25519(
        opties.uittredendKnooppunt.geheimeSleutelPkcs8B64u,
        Buffer.from(UITTREDING_BEWIJS_DOMEIN + canoniekeJson(kern), 'utf8'),
      ),
    },
  };
}

export function verifieerVeiligeKnooppuntUittreding(
  bewijs: VeiligeKnooppuntUittredingBewijs,
): { ok: true } | { ok: false; fout: string } {
  if (!bewijs || bewijs.schema !== 1) {
    return { ok: false, fout: 'UITTREDINGSBEWIJS_ONGELDIG' };
  }
  if (berekenKnooppuntId(bewijs.ondertekenaarPubDerB64u) !== bewijs.uittredendKnooppuntId) {
    return { ok: false, fout: 'UITTREDING_ONDERTEKENAAR_SLEUTEL_ID_KOMT_NIET_OVEREEN' };
  }
  const { handtekeningB64u, ...kern } = bewijs;
  if (!verifieerEd25519(bewijs.ondertekenaarPubDerB64u, Buffer.from(UITTREDING_BEWIJS_DOMEIN + canoniekeJson(kern), 'utf8'), handtekeningB64u)) {
    return { ok: false, fout: 'UITTREDINGSBEWIJS_HANDTEKENING_ONGELDIG' };
  }
  return { ok: true };
}
