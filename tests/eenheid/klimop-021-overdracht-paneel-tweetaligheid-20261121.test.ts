// KLIMOP-021 (21.11.2026): Модульні та живі мережеві випробування завершальної Хвилі 4 виправлень за незалежною перевіркою AUDIT-002:
//   1. Реєстр зовнішньо підтверджених операторів у controleerKnooppuntOnafhankelijkheid ([485]) та KLIMOP_MAX_FASE = 16 ([487]);
//   2. Суворі ключі ML-DSA-65 для рівня 20 ([477]), зашифровані versleuteldeEigenaarMeta й вирівнювання 256 байт ([483]), роздільний облік видалення ([526]);
//   3. Ковзне вікно кадрів, межа зміни ключа, час життя сеансу й затирання у «Стеблах» ([479], [481]), скасування раунду 1 FROST, фізичний відкат випуску та чиста відбудова з «Насіння» ([495]);
//   4. Виведення секрету сховища з фрази scrypt, модель спостерігача й захист дат ([489], [491], [499]), суворі пари ключів KEM ([493]), походження вимірів §41 ([469], [474], [497]) та 25 документів §44 ([472]);
//   5. Карта піддоменів проти SERVICE_HOSTS ([511]), очищення старих слів у локальному пошуку ([528]) та виявлення дублікатів у звірці станів ([503]);
//   6. Міжпроцесний замок, ідемпотентне відновлення WAL, контрольні точки O(1) та прив'язка Сходинки 4 до bewijsVersie ([458], [460], [462], [507]);
//   7. Тимчасова ізольована пісочниця MCP ([505]), повний аудит з реальною службою сеансу admin/mcp ([509]) і вилучення абсолютного шляху ([530]);
//   8. Доступність і чесні стани порожніх журналів у KlimopPaneel.tsx та agenten.css ([464], [513], [515], [517], [519], [532]);
//   9. Двомовна паритетність статей, покажчиків, рішення B-025 (1.6.0), відсутність грошових сум та Абсолютний мовний закон ([521], [523], [537], [541], [543], [545]).
// Запуск: node scripts/eenheidstests.mjs klimop-021-overdracht-paneel-tweetaligheid-20261121.test.ts

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  KLIMOP_MAX_FASE,
  beoordeelKlimopWijziging,
  controleerKnooppuntOnafhankelijkheid,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import {
  KlimopRouteTabel,
  beantwoordStengelHanddruk,
  maakStengelHanddrukAanvraag,
  ontsleutelStengelKader,
  sluitStengelSessie,
  versleutelStengelKader,
  voltooiStengelHanddruk,
} from '../../shared/klimop/stengels';
import {
  herstelEnOntsleutelObject,
  verifieerObjectManifest,
  versleutelEnVerdeelObject,
} from '../../shared/klimop/opslag';
import {
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  frostVoegHandtekeningSamen,
  leidGeheimScalairAf,
  splitsMetFeldmanVss,
  verifieerFeldmanDeel,
  type FeldmanVssDeel,
} from '../../shared/klimop/drempelsleutels';
import {
  controleerDienstIsolatieTegenServiceHosts,
  maakLokaleZoekIndex,
  vergelijkErfenisEnKlimopStaat,
  verwijderUitLokaleZoekIndex,
  voegToeAanLokaleZoekIndex,
  zoekLokaalOverBronnen,
} from '../../shared/klimop/diensten';
import {
  NOODSIGNAAL_WAARNEMER_MODEL,
  leidKluisGeheimUitWachtzin,
  verifieerUitgesteldeKritiekeOperatie,
} from '../../shared/klimop/mensbescherming';
import {
  KLIMOP_AUTONOMIE_SCENARIOS,
  KLIMOP_CRYPTO_AUDIT_SCENARIOS,
  KLIMOP_MEETBARE_GARANTIES_IDS,
  beoordeelMeetbareGaranties41,
  kapselHybrideX25519MlKem768In,
  maakHybridePostkwantumKnooppunt,
  ontkapselHybrideX25519MlKem768,
  stelOnafhankelijkAuditRapportSamen,
} from '../../shared/klimop/beveiligingsaudit';
import {
  KLIMOP_TWAALF_KERNMODULES,
  controleerVijfentwintigVerplichteDocumenten,
  herbouwEcosysteemUitZaadOpSchoonMilieu,
  stelKlimopZaadPakketSamen,
} from '../../shared/klimop/zaden';
import { KLIMOP_PADEN } from '../../shared/klimop-overzicht-model';
import {
  KlimopNetwerkClient,
  startKlimopProefKnooppunt,
} from '../../backend/klimop-knooppunt-agent';
import { KlimopVerdeeldeOpslagClient } from '../../backend/klimop-opslag-client';
import { KlimopDrempelOndertekenaarClient } from '../../backend/klimop-drempel-client';
import { KlimopBestuurEnUitrolClient } from '../../backend/klimop-bestuur-client';
import {
  klimopArchitectuurToets,
  klimopOverzicht,
} from '../../backend/klimop-platform-brug';
import {
  herstelOnderbrokenOverdrachtTransactie,
  leesKlimopDubbelSchrijvenLogboek,
  leesKlimopQuorumAttestLogboek,
  leesKlimopSpiegelLogboek,
  schakelKlimopDienstOverdracht,
  voerGecontroleerdeDubbelSchrijfProefUit,
  voerPassieveSpiegelLeesProefUit,
  voerStap4QuorumAttestProefUit,
} from '../../backend/klimop-overdracht-opslag';
import { klimopPaden } from '../../backend/klimop-paden';
import {
  _klimopMcpLimietenLeeg,
  voerKlimopToolUit,
} from '../../backend/klimop-hulpmiddelen';
import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { type KlimopBestuursGrondwet } from '../../shared/klimop/bestuur';

const lees = (pad: string): string => readFileSync(pad, 'utf8');

function tekenFrostSubgroep(
  boodschap: Buffer,
  actieveDelen: readonly FeldmanVssDeel[],
  groepsPubHex: string,
  deelnemerPubMap: Record<number, string>,
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
  const samengevoegd = frostVoegHandtekeningSamen({
    boodschap,
    toezeggingenLijst,
    deelHandtekeningen,
    deelnemerPubliekeSleutelsHex: deelnemerPubMap,
    groepsPubliekeSleutelHex: groepsPubHex,
    drempel,
  });
  if (!samengevoegd.ok) throw new Error(samengevoegd.fout);
  return samengevoegd.handtekeningHex;
}

export async function main() {
  const { check, einde } = checker('klimop-021-overdracht-paneel-tweetaligheid');
  const nuIso = '2026-11-21T16:35:00.000Z';
  const verlooptIso = '2026-11-22T16:35:00.000Z';
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Хвилею 4 для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  // ------------------------------------------------------------------ 1. Зовнішній реєстр операторів ([485]) та межа етапів 0..16 ([487])
  const knNl = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'NL',
    aanbieder: 'op-nl',
    nuIso,
  });
  const knCh = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'CH',
    aanbieder: 'op-ch',
    nuIso,
  });
  const knUa = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'UA',
    aanbieder: 'op-ua',
    nuIso,
  });

  const onafhZelf = controleerKnooppuntOnafhankelijkheid(
    [knNl.identiteit, knCh.identiteit],
    2,
    { vereisExternBewijs: true },
  );
  const onafhZelfdeOperator = controleerKnooppuntOnafhankelijkheid(
    [knNl.identiteit, knCh.identiteit],
    2,
    {
      vereisExternBewijs: true,
      erkendeOperatorRegister: new Map([
        [knNl.identiteit.knooppuntId, { operatorId: 'dezelfde-eigenaar', foutgroepId: 'fg-1' }],
        [knCh.identiteit.knooppuntId, { operatorId: 'dezelfde-eigenaar', foutgroepId: 'fg-2' }],
      ]),
    },
  );
  const onafhExternGoed = controleerKnooppuntOnafhankelijkheid(
    [knNl.identiteit, knCh.identiteit],
    2,
    {
      vereisExternBewijs: true,
      erkendeOperatorRegister: new Map([
        [knNl.identiteit.knooppuntId, { operatorId: 'op-onafh-1', foutgroepId: 'fg-nl' }],
        [knCh.identiteit.knooppuntId, { operatorId: 'op-onafh-2', foutgroepId: 'fg-ch' }],
      ]),
    },
  );

  const fase16Goed = beoordeelKlimopWijziging({
    naam: 'Сходинка 4 кворумного атестата',
    fase: 16,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  const fase17Fout = beoordeelKlimopWijziging({
    naam: 'Позамежний етап',
    fase: 17,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });

  check(
    'controleerKnooppuntOnafhankelijkheid розрізняє самозаявлені паспорти та зовнішній реєстр операторів ([485]), а beoordeelKlimopWijziging охоплює етапи 0..16 ([487])',
    KLIMOP_MAX_FASE === 16
    && onafhZelf.ok === false
    && onafhZelf.onafhankelijkheidsBewijsBron === 'zelfverklaarde_paspoorten'
    && onafhZelfdeOperator.ok === false
    && onafhExternGoed.ok === true
    && onafhExternGoed.onafhankelijkheidsBewijsBron === 'extern_geverifieerd_operatorregister'
    && fase16Goed.goedgekeurd === true
    && fase17Fout.goedgekeurd === false,
  );

  // ------------------------------------------------------------------ 2. Постквантовий рівень 20 ([477]), versleuteldeEigenaarMeta ([483]) та роздільний облік видалення ([526])
  const kek = randomBytes(32);
  let pqZonderMlDsaFout = '';
  try {
    versleutelEnVerdeelObject({
      inhoud: Buffer.from('таємний запис власника', 'utf8'),
      objectId: 'obj_pq_fout',
      eigenaar: knNl,
      kek,
      k: 2,
      m: 1,
      profiel: 'klimop-v2-pq-voorbereid',
      vereisPostkwantumRang20: true,
      laag: 'persoonlijke_geheime_gegevens',
      epoche: 1,
      nuIso,
    });
  } catch (e) {
    pqZonderMlDsaFout = e instanceof Error ? e.message : String(e);
  }
  const pqEigenaar = maakHybridePostkwantumKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'NL',
    aanbieder: 'eigenaar-pq',
    nuIso,
  });
  const eigenaarKn = {
    identiteit: pqEigenaar.identiteit,
    geheimeSleutelPkcs8B64u: pqEigenaar.ed25519GeheimPkcs8B64u,
  };
  const pqGoed = versleutelEnVerdeelObject({
    inhoud: Buffer.from('захищений гібридний об’єкт', 'utf8'),
    objectId: 'obj_pq_goed',
    eigenaar: eigenaarKn,
    postkwantumEigenaarSleutels: {
      mlDsa65PubliekSpkiB64u: pqEigenaar.mlDsa65PubliekSpkiB64u,
      mlDsa65GeheimPkcs8B64u: pqEigenaar.mlDsa65GeheimPkcs8B64u,
    },
    vereisPostkwantumRang20: true,
    kek,
    k: 2,
    m: 1,
    profiel: 'klimop-v2-pq-voorbereid',
    laag: 'persoonlijke_geheime_gegevens',
    epoche: 1,
    nuIso,
  });

  const hersteldPq = herstelEnOntsleutelObject({
    manifest: pqGoed.manifest,
    fragmentenPerSegment: [[pqGoed.fragmentenPerSegment[0][0], pqGoed.fragmentenPerSegment[0][2]]],
    kek,
  });

  check(
    'рівень 20 вимагає ML-DSA-65 ([477]), а новий маніфест шифрує розмір і SHA-256 під DEK у versleuteldeEigenaarMeta з вирівнюванням сегмента до 256 байт ([483])',
    pqZonderMlDsaFout === 'POSTKWANTUM_SLEUTELS_VEREIST'
    && pqGoed.manifest.effectieveBeveiligingsRang === 20
    && Boolean(pqGoed.manifest.mlDsa65HandtekeningB64u)
    && pqGoed.manifest.klareLengteBytes === undefined
    && pqGoed.manifest.klareInhoudSha256 === undefined
    && Boolean(pqGoed.manifest.versleuteldeEigenaarMeta?.cijfertekstB64u)
    && (pqGoed.manifest.segmenten[0].versleuteldeLengte - 16) % 256 === 0
    && verifieerObjectManifest(pqGoed.manifest).ok === true
    && hersteldPq.ok === true
    && hersteldPq.inhoud.toString('utf8') === 'захищений гібридний об’єкт',
  );

  // ------------------------------------------------------------------ 3. Ковзне вікно, зміна ключа і строк дії «Стебел» ([479], [481])
  const hdr = maakStengelHanddrukAanvraag(knNl, knCh.identiteit.knooppuntId, { nuIso });
  const hdrAntw = beantwoordStengelHanddruk(knCh, hdr.aanvraag, {
    nuIso,
    sessieTtlMs: 60_000,
    maxKadersTotSleutelWissel: 2,
  });
  if (!hdrAntw.ok) throw new Error(hdrAntw.fout);
  const hdrVol = voltooiStengelHanddruk(knNl, hdr, hdrAntw.antwoord, {
    nuIso,
    sessieTtlMs: 60_000,
    maxKadersTotSleutelWissel: 2,
  });
  if (!hdrVol.ok) throw new Error(hdrVol.fout);

  const kaderTijdOpt = { nuMs: Date.parse(nuIso) + 1000 };
  const kd1 = versleutelStengelKader(hdrVol.sessie, Buffer.from('кадр-1', 'utf8'), kaderTijdOpt);
  const kd2 = versleutelStengelKader(hdrVol.sessie, Buffer.from('кадр-2', 'utf8'), kaderTijdOpt);
  let sleutelwisselFout = '';
  try {
    versleutelStengelKader(hdrVol.sessie, Buffer.from('кадр-3', 'utf8'), kaderTijdOpt);
  } catch (e) {
    sleutelwisselFout = e instanceof Error ? e.message : String(e);
  }
  const ont1 = ontsleutelStengelKader(hdrAntw.sessie, kd1, kaderTijdOpt);
  const ontHerhaling = ontsleutelStengelKader(hdrAntw.sessie, kd1, kaderTijdOpt);
  const ont2 = ontsleutelStengelKader(hdrAntw.sessie, kd2, kaderTijdOpt);
  sluitStengelSessie(hdrVol.sessie);
  sluitStengelSessie(hdrAntw.sessie);

  check(
    'сеанс «Стебел» обмежує кількість кадрів до зміни ключа, відхиляє повтори у ковзному вікні та затирає ключі при закритті ([479], [481])',
    ont1.ok === true
    && ont2.ok === true
    && ontHerhaling.ok === false
    && ontHerhaling.fout === 'HERHALING_OF_VOLGORDE_FOUT'
    && sleutelwisselFout.includes('STENGEL_SLEUTELWISSEL_VEREIST')
    && hdrVol.sessie.zendSleutel.every((b) => b === 0)
    && hdrAntw.sessie.ontvangSleutel.every((b) => b === 0),
  );

  // ------------------------------------------------------------------ 4. Мережеве видалення з розривом ([526]), скасування FROST раунду 1 ([481]) та фізичний відкат випуску ([495])
  const srvNl = await startKlimopProefKnooppunt({ knooppunt: knNl });
  const srvCh = await startKlimopProefKnooppunt({ knooppunt: knCh });
  const srvUa = await startKlimopProefKnooppunt({ knooppunt: knUa });
  try {
    const adr = new Map([
      [srvNl.identiteit.knooppuntId, srvNl.basisUrl],
      [srvCh.identiteit.knooppuntId, srvCh.basisUrl],
      [srvUa.identiteit.knooppuntId, srvUa.basisUrl],
    ]);
    const tabel = new KlimopRouteTabel();
    for (const id of adr.keys()) {
      tabel.voegTweerichtingsStengelToe(eigenaarKn.identiteit.knooppuntId, id, 10);
    }
    const netClient = new KlimopNetwerkClient(eigenaarKn, adr, tabel);
    const opslagClient = new KlimopVerdeeldeOpslagClient(netClient);

    const bewaard = await opslagClient.verdeelEnBewaarObject({
      inhoud: Buffer.from('дані для перевірки часткового витирання', 'utf8'),
      objectId: 'obj_wis_526',
      eigenaar: eigenaarKn,
      kek,
      doelKnooppunten: [knNl.identiteit, knCh.identiteit, knUa.identiteit],
      k: 2,
      m: 1,
      laag: 'werkgegevens_van_diensten',
      epoche: 1,
      nuIso,
    });
    if (!bewaard.ok) throw new Error(bewaard.fout);

    // Розриваємо зв'язок з CH: видалення має чесно повідомити про недосяжний фрагмент у onbereikbareFragmenten
    tabel.markeerStengelStaat(eigenaarKn.identiteit.knooppuntId, knCh.identiteit.knooppuntId, 'verbroken');
    const gedeeltelijkeWis = await opslagClient.wisObjectVanKnooppunten({
      manifest: bewaard.manifest,
      plaatsing: bewaard.plaatsing,
    });
    tabel.markeerStengelStaat(eigenaarKn.identiteit.knooppuntId, knCh.identiteit.knooppuntId, 'gezond');

    // Ініціалізуємо мережевий DKG, а потім відкриваємо й скасовуємо раунд 1 FROST на srvNl
    const drempelClient = new KlimopDrempelOndertekenaarClient(netClient);
    const bestuurClient = new KlimopBestuurEnUitrolClient(netClient, drempelClient);
    const dkgUitrol = await drempelClient.voerNetwerkDkgUit({
      setId: 'uitrol_021_frost',
      opdrachtgever: eigenaarKn,
      knooppunten: [knNl.identiteit, knCh.identiteit, knUa.identiteit],
      drempel: 2,
      nuIso,
    });
    if (!dkgUitrol.ok) throw new Error(dkgUitrol.fout);

    const mndDrempel = ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_021_dr',
        uitgeverKnooppuntId: eigenaarKn.identiteit.knooppuntId,
        ontvangerKnooppuntId: knNl.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        toegestaneActies: ['frost_ronde1', 'frost_annuleer_ronde1'],
        gemachtigdeAfzenders: [eigenaarKn.identiteit.knooppuntId],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
      },
      eigenaarKn,
    );
    await netClient.roepOpdrachtAan(knNl.identiteit.knooppuntId, {
      actie: 'frost_ronde1',
      setId: 'uitrol_021_frost',
      sessieTekenId: 'teken_annul_021',
      mandaat: mndDrempel,
    });
    const openVoorAnnulering = srvNl.aantalOpenFrostNonces();
    const rAnnul = await netClient.roepOpdrachtAan(knNl.identiteit.knooppuntId, {
      actie: 'frost_annuleer_ronde1',
      setId: 'uitrol_021_frost',
      sessieTekenId: 'teken_annul_021',
      mandaat: mndDrempel,
    });
    const openNaAnnulering = srvNl.aantalOpenFrostNonces();

    // Перевіряємо фізичний відкат небезпечного випуску на тимчасовому носії srvNl
    const grondwet: KlimopBestuursGrondwet = {
      schema: 1,
      grondwetId: 'gw_021',
      versieVolgnummer: 1,
      frostSetId: dkgUitrol.groep.setId,
      frostGroepsPubliekeSleutelHex: dkgUitrol.groep.groepsPubliekeSleutelHex,
      drempel: 2,
      totaalHoeders: 3,
      erkendeHoeders: [knNl.identiteit, knCh.identiteit, knUa.identiteit],
      overgangsNoodVetoPubDerB64u: null,
      vastgesteldOp: nuIso,
    };
    const doelenKn = maakKlimopKnooppunt({
      type: 'gespecialiseerde_knooppunten',
      rollen: ['verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'doelen-021',
      nuIso,
    });
    const tijdKn = maakKlimopKnooppunt({
      type: 'gespecialiseerde_knooppunten',
      rollen: ['verificatie'],
      juridischeRegio: 'CH',
      aanbieder: 'tijd-021',
      nuIso,
    });
    const omg = await bestuurClient.stelGrondwetOpNetwerkIn({
      netwerkId: 'net_021',
      opdrachtgever: eigenaarKn,
      grondwet,
      frostGroep: dkgUitrol.groep,
      knooppunten: [knNl.identiteit, knCh.identiteit, knUa.identiteit],
      erkendeDoelenRolPubDerB64u: doelenKn.identiteit.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdKn.identiteit.publiekeSleutelDerB64u,
      nuIso,
    });
    if (!omg.ok) throw new Error(omg.fout);
    const lekPakket = Buffer.from('klimop-uitgave-021\nAGE-SECRET-KEY-1SYNTHETICTESTONLY0000', 'utf8');
    const webBuf = Buffer.from('klimop-webclient-021', 'utf8');
    const bundelLek = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
      omgeving: omg.omgeving,
      versieLabel: '20261121-999999',
      uitgaveVolgnummer: 2,
      minCompatibelVolgnummer: 1,
      pakketInhoud: lekPakket,
      webClientBundelInhoud: webBuf,
      afhankelijkhedenBoomSha256: createHash('sha256').update('deps-021').digest('hex'),
      bronCommitSha40: 'a'.repeat(40),
      ontwikkelarchiefSha256: 'b'.repeat(64),
      auteurSoort: 'menselijke_deelnemer',
      auteurId: 'eigenaar',
      doelenRolSleutels: {
        publiekeSleutelDerB64u: doelenKn.identiteit.publiekeSleutelDerB64u,
        geheimeSleutelPkcs8B64u: doelenKn.geheimeSleutelPkcs8B64u,
      },
      tijdstempelRolSleutels: {
        publiekeSleutelDerB64u: tijdKn.identiteit.publiekeSleutelDerB64u,
        geheimeSleutelPkcs8B64u: tijdKn.geheimeSleutelPkcs8B64u,
      },
      nuIso,
    });
    if (!bundelLek.ok) throw new Error(bundelLek.fout);
    const uitrolRes = await bestuurClient.voerGefaseerdeUitrolUit({
      omgeving: omg.omgeving,
      bundel: bundelLek.bundel,
      pakketInhoud: lekPakket,
      webClientBundelInhoud: webBuf,
      golven: [[knNl.identiteit.knooppuntId], [knCh.identiteit.knooppuntId]],
      nuIso,
    });

    check(
      'wisObjectVanKnooppunten розділяє недосяжні смуги ([526]), frost_annuleer_ronde1 затирає відкритий нонс ([481]), а вузол фізично виявляє витік ключа на носії та відкочує випуск ([495])',
      gedeeltelijkeWis.manifestGeldig === true
      && gedeeltelijkeWis.gewisteFragmenten === 2
      && gedeeltelijkeWis.onbereikbareFragmenten === 1
      && openVoorAnnulering === 1
      && rAnnul.antwoord.ok === true
      && openNaAnnulering === 0
      && uitrolRes.voltooid === false
      && uitrolRes.status === 'automatisch_gestopt_en_teruggedraaid'
      && srvNl.actiefUitgaveVolgnummer() === 1
      && srvNl.aantalUitgaveTerugdraaiingen() >= 1,
    );
  } finally {
    await Promise.all([srvNl.sluit(), srvCh.sluit(), srvUa.sluit()]);
  }

  // ------------------------------------------------------------------ 5. Служби проти SERVICE_HOSTS ([511]), пошук при заміні ([528]), дублікати звірки ([503]), scrypt, KEM і 25 документів §44
  const hostsControle = controleerDienstIsolatieTegenServiceHosts(SERVICE_HOSTS);
  const zoekIdx = maakLokaleZoekIndex();
  const zSleutel = randomBytes(32);
  voegToeAanLokaleZoekIndex(zoekIdx, {
    documentId: 'doc-1',
    dienstId: 'werkblad',
    bronKlasse: 'prive_versleuteld_materiaal',
    titel: 'Старий проєкт зоря',
    tekstInhoud: 'секретний чернетковий запис',
    toegangsSleutel: zSleutel,
  });
  voegToeAanLokaleZoekIndex(zoekIdx, {
    documentId: 'doc-1',
    dienstId: 'werkblad',
    bronKlasse: 'prive_versleuteld_materiaal',
    titel: 'Оновлений запис промінь',
    tekstInhoud: 'чистий фінальний зміст',
    toegangsSleutel: zSleutel,
  });
  const toegestaneDiensten = new Set(['werkblad'] as const);
  const toegestaneKlassen = new Set(['prive_versleuteld_materiaal'] as const);
  const zoekOudWoord = zoekLokaalOverBronnen({
    index: zoekIdx,
    zoekopdracht: 'зоря',
    toegestaneDiensten,
    toegestaneBronKlassen: toegestaneKlassen,
  });
  const zoekNieuwWoord = zoekLokaalOverBronnen({
    index: zoekIdx,
    zoekopdracht: 'промінь',
    toegestaneDiensten,
    toegestaneBronKlassen: toegestaneKlassen,
  });
  verwijderUitLokaleZoekIndex(zoekIdx, 'doc-1');
  const zoekNaVerwijderen = zoekLokaalOverBronnen({
    index: zoekIdx,
    zoekopdracht: 'промінь',
    toegestaneDiensten,
    toegestaneBronKlassen: toegestaneKlassen,
  });

  const pariteitDubbel = vergelijkErfenisEnKlimopStaat(
    [
      { sleutelId: 'k1', inhoudSha256: 'a'.repeat(64), machtigingenSha256: 'm'.repeat(64) },
      { sleutelId: 'k1', inhoudSha256: 'a'.repeat(64), machtigingenSha256: 'm'.repeat(64) },
    ],
    [
      { sleutelId: 'k1', inhoudSha256: 'a'.repeat(64), machtigingenSha256: 'm'.repeat(64) },
      { sleutelId: 'k_extra', inhoudSha256: 'b'.repeat(64), machtigingenSha256: 'm'.repeat(64) },
    ],
  );

  const zout32 = randomBytes(32);
  const kluisSleutel = leidKluisGeheimUitWachtzin('стійка кодова фраза власника 2026', zout32);
  const uitgesteldOngeldigeTijd = verifieerUitgesteldeKritiekeOperatie({
    schema: 1,
    operatieId: 'op_ongeldige_tijd',
    soort: 'verwijder_volledig_archief',
    doelSamenvatting: 'повний архів простору',
    persoonsId: 'klid1_00000000000000000000000000000000',
    aanvragerPubDerB64u: knNl.identiteit.publiekeSleutelDerB64u,
    aangevraagdOp: 'не-дата',
    uitvoerbaarVanaf: verlooptIso,
    onderDwangAangevraagd: false,
    handtekeningB64u: 'AA',
  });

  const kemA = maakHybridePostkwantumKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'kem-a',
    nuIso,
  });
  const kemB = maakHybridePostkwantumKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'kem-b',
    nuIso,
  });
  const ingekapseld = kapselHybrideX25519MlKem768In(
    {
      x25519PubliekSpkiB64u: kemA.x25519PubliekSpkiB64u,
      mlKem768PubliekSpkiB64u: kemA.mlKem768PubliekSpkiB64u,
    },
    'proef-021',
  );
  const kemMismatched = ontkapselHybrideX25519MlKem768(
    ingekapseld.ingekapseld,
    {
      ...kemA,
      x25519PubliekSpkiB64u: kemB.x25519PubliekSpkiB64u,
    },
    'proef-021',
  );

  const garantiesZonderBron = beoordeelMeetbareGaranties41(
    KLIMOP_MEETBARE_GARANTIES_IDS.map((garantieId) => ({
      garantieId,
      grensWaarde: 100,
      feitelijkGemetenWaarde: 50,
      richting: 'hoogstens' as const,
      meetMethode: 'проба',
      beproefdInScenario: true,
    })),
    { vereisBronMetadata: true },
  );

  const doc25 = controleerVijfentwintigVerplichteDocumenten(process.cwd());

  // Чиста відбудова пакета «Насіння» на тимчасовому носії диска
  const zaadMap = mkdtempSync(join(tmpdir(), 'klimop-021-zaad-'));
  let zaadOpSchijfOk = false;
  try {
    const splitsZ = splitsMetFeldmanVss({
      geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
      drempel: 2,
      totaal: 3,
      setId: 'zaad_021',
      epoche: 1,
    });
    const pubZ: Record<number, string> = {};
    for (const d of splitsZ.delen) {
      const v = verifieerFeldmanDeel(d);
      if (v.ok) pubZ[d.index] = v.deelnemerPubliekeSleutelHex;
    }
    const gwZ: KlimopBestuursGrondwet = {
      schema: 1,
      grondwetId: 'gw_z_021',
      versieVolgnummer: 1,
      frostSetId: 'zaad_021',
      frostGroepsPubliekeSleutelHex: splitsZ.groepsPubliekeSleutelHex,
      drempel: 2,
      totaalHoeders: 3,
      erkendeHoeders: [knNl.identiteit, knCh.identiteit, knUa.identiteit],
      overgangsNoodVetoPubDerB64u: null,
      vastgesteldOp: nuIso,
    };
    const rap11 = stelOnafhankelijkAuditRapportSamen({
      auditor: kemA,
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
          bronSha256: 'c'.repeat(64),
        };
      }),
      antwoorden15: geldigeAntwoorden15,
      openstaandeKritiekeZwaktes: [],
      nuIso,
    });
    const zp = stelKlimopZaadPakketSamen({
      versieLabel: 'zaad-021',
      etappe11Rapport: rap11.rapport,
      erkendeAuditorSleutels: [{
        auditorKnooppuntId: kemA.identiteit.knooppuntId,
        ed25519PubliekDerB64u: kemA.ed25519PubliekDerB64u,
        mlDsa65PubliekSpkiB64u: kemA.mlDsa65PubliekSpkiB64u,
      }],
      grondwet: gwZ,
      startToetredingsKnooppunten: [knCh.identiteit, knUa.identiteit],
      onderdelen: KLIMOP_TWAALF_KERNMODULES.map((pad) => ({ pad, inhoudUtf8: lees(pad) })),
      zaadBewaarder: kemB,
      tekenMetFrostGroep: (b) => tekenFrostSubgroep(b, [splitsZ.delen[0], splitsZ.delen[1]], splitsZ.groepsPubliekeSleutelHex, pubZ, 2),
      nuIso,
    });
    if (!zp.ok) throw new Error(zp.fout);
    const uitp = herbouwEcosysteemUitZaadOpSchoonMilieu({
      pakket: zp.pakket,
      nieuweGeneratieKnooppunten: [knNl.identiteit, knCh.identiteit, knUa.identiteit],
      verbindingMetOudeServerGebruikt: false,
      doelMap: zaadMap,
    });
    zaadOpSchijfOk =
      uitp.ok === true
      && uitp.opSchijfGeschrevenEnGeverifieerd === true
      && existsSync(join(zaadMap, 'shared/klimop/kern.ts'))
      && existsSync(join(zaadMap, 'ZAAD-GRONDWET.json'));
  } finally {
    rmSync(zaadMap, { recursive: true, force: true });
  }

  check(
    'SERVICE_HOSTS, вичищення слів у локальному пошуку, дублікати звірки, scrypt, валідація KEM, походження §41, 25/25 документів §44 та розпакування «Насіння» на диск працюють бездоганно',
    hostsControle.ok === true
    && zoekOudWoord.length === 0
    && zoekNieuwWoord.length === 1
    && zoekNaVerwijderen.length === 0
    && pariteitDubbel.volledigGelijk === false
    && pariteitDubbel.dubbeleSleutelIds.includes('k1')
    && pariteitDubbel.extraInKlimopIds.includes('k_extra')
    && kluisSleutel.length === 32
    && NOODSIGNAAL_WAARNEMER_MODEL.ontvangerVoogdIdZichtbaarVoorPostbusKnoop === true
    && NOODSIGNAAL_WAARNEMER_MODEL.verbergtLokaleApparaatSporen === false
    && uitgesteldOngeldigeTijd.ok === false
    && uitgesteldOngeldigeTijd.fout === 'UITGESTELDE_OPERATIE_TIJD_ONGELDIG'
    && kemMismatched.ok === false
    && kemMismatched.fout === 'HYBRIDE_KEM_SLEUTELPAAR_KOMT_NIET_OVEREEN'
    && garantiesZonderBron.geslaagd === false
    && doc25.bevestigdAantal === 25
    && doc25.ontbrekendAantal === 0
    && zaadOpSchijfOk === true,
  );

  // ------------------------------------------------------------------ 6. Транзакційність WAL ([462]), контрольні точки O(1) ([507]) та прив'язка Сходинки 4 до bewijsVersie ([458], [460])
  const overdrachtMap = mkdtempSync(join(tmpdir(), 'klimop-021-ov-'));
  try {
    // 6а. Ідемпотентне відновлення перерваної WAL-транзакції (збій між appendFileSync у журнал і schrijfSchakelaarsAtomair)
    const walBronMap = mkdtempSync(join(tmpdir(), 'klimop-021-walbron-'));
    const walCrashMap = mkdtempSync(join(tmpdir(), 'klimop-021-walcrash-'));
    let walHerstel1 = { hersteld: false, transactieId: null as string | null };
    let walHerstel2 = { hersteld: false, transactieId: null as string | null };
    let walSchakelaarsAanwezig = false;
    let walGeenDubbeleRegel = false;
    try {
      voerPassieveSpiegelLeesProefUit({ dienstId: 'agenda' }, { staatMap: walBronMap });
      const bronSchakelaars = JSON.parse(lees(join(walBronMap, 'schakelaars.json')));
      const bronLogTekst = lees(join(walBronMap, 'spiegel-logboek.jsonl'));
      const bronSpiegelRegel = JSON.parse(bronLogTekst.trim());
      // Записуємо вже дописаний рядок журналу + активний overdracht-wal.json БЕЗ schakelaars.json
      writeFileSync(join(walCrashMap, 'spiegel-logboek.jsonl'), bronLogTekst, 'utf8');
      writeFileSync(
        join(walCrashMap, 'overdracht-wal.json'),
        JSON.stringify({
          schema: 1,
          transactieId: 'tx_crash_021',
          aangemaaktOp: nuIso,
          schakelaars: bronSchakelaars,
          spiegelRegel: bronSpiegelRegel,
        }),
        'utf8',
      );
      walHerstel1 = herstelOnderbrokenOverdrachtTransactie(walCrashMap);
      walHerstel2 = herstelOnderbrokenOverdrachtTransactie(walCrashMap);
      walSchakelaarsAanwezig = existsSync(join(walCrashMap, 'schakelaars.json')) && !existsSync(join(walCrashMap, 'overdracht-wal.json'));
      const naHerstelRegels = lees(join(walCrashMap, 'spiegel-logboek.jsonl')).trim().split('\n');
      walGeenDubbeleRegel = naHerstelRegels.length === 1;
    } finally {
      rmSync(walBronMap, { recursive: true, force: true });
      rmSync(walCrashMap, { recursive: true, force: true });
    }

    // 6б. Повний прохід Сходинок 2 -> 3 -> 4 для postvak, контрольні точки .checkpoint.json та інвалідація bewijsVersie
    const mapOpt = { staatMap: overdrachtMap };
    voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak' }, mapOpt);
    schakelKlimopDienstOverdracht({ dienstId: 'postvak', actie: 'activeer_passief_lezen' }, mapOpt);
    voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'postvak' }, mapOpt);
    schakelKlimopDienstOverdracht({ dienstId: 'postvak', actie: 'activeer_dubbel_schrijven' }, mapOpt);
    const attestRes = voerStap4QuorumAttestProefUit({ dienstId: 'postvak' }, mapOpt);

    // Запускаємо читання з примусовою перевіркою, щоб оновити контрольні точки .checkpoint.json
    leesKlimopSpiegelLogboek({ staatMap: overdrachtMap, limiet: 5, volledigeGeschiedenisControle: true });
    leesKlimopDubbelSchrijvenLogboek({ staatMap: overdrachtMap, limiet: 5, volledigeGeschiedenisControle: true });
    leesKlimopQuorumAttestLogboek({ staatMap: overdrachtMap, limiet: 5, volledigeGeschiedenisControle: true });

    const heeftCheckpoints =
      existsSync(join(overdrachtMap, 'spiegel-logboek.jsonl.checkpoint.json'))
      && existsSync(join(overdrachtMap, 'dubbel-schrijven-kluis.jsonl.checkpoint.json'))
      && existsSync(join(overdrachtMap, 'quorum-attesten-kluis.jsonl.checkpoint.json'));

    // Перевірка, що запис розбіжності для ІНШОЇ служби ('agenda') не псує ланцюжок чи свіжість атестата 'postvak'
    voerPassieveSpiegelLeesProefUit({ dienstId: 'agenda', simuleerAfwijking: 'inhoud' }, mapOpt);
    const spLog = leesKlimopSpiegelLogboek({ staatMap: overdrachtMap, limiet: 5 });
    const dbLog = leesKlimopDubbelSchrijvenLogboek({ staatMap: overdrachtMap, limiet: 5 });
    const qaLog = leesKlimopQuorumAttestLogboek({ staatMap: overdrachtMap, limiet: 5 });

    // А от збій для САМОЇ служби 'postvak' скидає її до Сходинки 1 і робить старий атестат недійсним для просування!
    voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak', simuleerAfwijking: 'inhoud' }, mapOpt);
    let naStoringDirectCode = '';
    try {
      voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak' }, mapOpt);
      schakelKlimopDienstOverdracht({ dienstId: 'postvak', actie: 'activeer_passief_lezen' }, mapOpt);
      voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'postvak' }, mapOpt);
      schakelKlimopDienstOverdracht({ dienstId: 'postvak', actie: 'activeer_dubbel_schrijven' }, mapOpt);
      schakelKlimopDienstOverdracht({ dienstId: 'postvak', actie: 'bevestig_quorum_gereedheid' }, mapOpt);
    } catch (e) {
      naStoringDirectCode = String((e as { code?: string }).code ?? '');
    }

    // І навіть якщо лічильник у schakelaars.json підроблено, перевірка dienstBewijsVersie у журналі блокує старий атестат!
    const gemanipuleerd = JSON.parse(lees(join(overdrachtMap, 'schakelaars.json')));
    gemanipuleerd.diensten.postvak.laatsteQuorumAttestOk = true;
    gemanipuleerd.diensten.postvak.opeenvolgendeGeldigeAttesten = 1;
    writeFileSync(join(overdrachtMap, 'schakelaars.json'), JSON.stringify(gemanipuleerd, null, 2), 'utf8');
    let verouderdAttestCode = '';
    try {
      schakelKlimopDienstOverdracht({ dienstId: 'postvak', actie: 'bevestig_quorum_gereedheid' }, mapOpt);
    } catch (e) {
      verouderdAttestCode = String((e as { code?: string }).code ?? '');
    }

    check(
      'WAL ідемпотентно відновлює перерваний запис ([462]), контрольні точки O(1) узгоджені ([507]), а bevestig_quorum_gereedheid відхиляє застарілий атестат після збою служби ([458], [460])',
      walHerstel1.hersteld === true
      && walHerstel1.transactieId === 'tx_crash_021'
      && walHerstel2.hersteld === false
      && walSchakelaarsAanwezig === true
      && walGeenDubbeleRegel === true
      && attestRes.ok === true
      && heeftCheckpoints === true
      && spLog.ketenIntegriteit.ok === true
      && dbLog.ketenIntegriteit.ok === true
      && qaLog.ketenIntegriteit.ok === true
      && naStoringDirectCode === 'KLIMOP_QUORUM_ATTEST_VEREIST'
      && verouderdAttestCode === 'KLIMOP_QUORUM_ATTEST_VEROUDERD_OF_ONGELDIG',
    );

    // ------------------------------------------------------------------ 7. Ізольована пісочниця MCP ([505]), аудит admin/mcp ([509]) і вилучення абсолютного шляху ([530])
    const ovZonderPad = klimopOverzicht(process.cwd(), overdrachtMap);
    const vorigeAantalRegels = leesKlimopSpiegelLogboek({ staatMap: overdrachtMap, limiet: 20 }).samenvatting.totaalLogboekRegels;
    _klimopMcpLimietenLeeg();
    const mcpPassief = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Antigravity', agent: 'antigravity' },
      'klimop_passieve_spiegel',
      { dienstId: 'agenda' },
      { staatMap: overdrachtMap },
    );
    const mcpPassiefJson = JSON.parse(mcpPassief.content[0].text);
    const naMcpAantalRegels = leesKlimopSpiegelLogboek({ staatMap: overdrachtMap, limiet: 20 }).samenvatting.totaalLogboekRegels;

    const auditLijst: Array<{ service: string; action: string; result: string }> = [];
    const paden = klimopPaden({
      requireSession: async (ev) =>
        ev.wie
          ? ({ user: { id: 'u-1', role: ev.rol ?? 'owner', email: 'eig@klimop.invalid', status: 'approved' }, service: String(ev.service ?? 'admin') } as never)
          : { errorCode: 'UNAUTHORIZED' },
      isOwnerEmail: (em) => em === 'eig@klimop.invalid',
      rateLimit: async () => ({ ok: !Boolean((auditLijst as { _limiet?: boolean })._limiet) }),
      audit: async (_e, action, result, details, service) => {
        auditLijst.push({ service: String(service ?? details.service ?? ''), action, result });
      },
      staatMap: overdrachtMap,
    });

    await paden[`POST ${KLIMOP_PADEN.overzicht}`][0]({ event: { wie: null, service: 'admin', headers: {} }, body: {} } as never);
    await paden[`POST ${KLIMOP_PADEN.overzicht}`][0]({ event: { wie: 'lid', rol: 'member', service: 'admin', headers: {} }, body: {} } as never);
    await paden[`POST ${KLIMOP_PADEN.overzicht}`][0]({ event: { wie: 'eig', rol: 'owner', service: 'admin', headers: {} }, body: {} } as never);

    check(
      'MCP виконує перевірки в ізольованій пісочниці з полем controleUitkomst ([505]), огляд не містить абсолютного шляху сервера ([530]), а маршрути фіксують 401/403/200 із реальною службою admin ([509])',
      !mcpPassief.isError
      && mcpPassiefJson.controleUitkomst === 'geslaagd'
      && mcpPassiefJson.geisoleerdeAgentOefening === true
      && naMcpAantalRegels === vorigeAantalRegels
      && !ovZonderPad.bron.wortel.startsWith('/')
      && auditLijst.some((a) => a.action === 'klimop_overzicht' && a.result === 'denied' && a.service === 'mcp')
      && auditLijst.some((a) => a.action === 'klimop_overzicht' && a.result === 'denied' && a.service === 'admin')
      && auditLijst.some((a) => a.action === 'klimop_overzicht' && a.result === 'success' && a.service === 'admin'),
    );
  } finally {
    rmSync(overdrachtMap, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 8. Доступність, чесні стани порожніх журналів і 15 питань у KlimopPaneel.tsx та agenten.css
  const paneelBron = lees('src/agenten/KlimopPaneel.tsx');
  const cssBron = lees('src/agenten/agenten.css');
  const toetsZonderBewijs = klimopArchitectuurToets({
    naam: 'Порожній доказ у формі панелі',
    fase: 16,
    gebruikStandaardBewijsVoorOntbrekendeVragen: false,
  });

  check(
    'KlimopPaneel.tsx та agenten.css містять чесні стани порожніх журналів ([464]), сталі htmlFor/id, aria-live, етапи 0..16, 15 поіменних питань без підставлення доказів ([513], [515], [517], [519]) і мобільне перенесення 360px ([532])',
    paneelBron.includes('порожні журнали (0 записів)')
    && paneelBron.includes('lege logboeken (0 regels)')
    && paneelBron.includes("aria-live='polite'")
    && paneelBron.includes('klimop-live-leeg')
    && paneelBron.includes("htmlFor='klimop-dienst-keuze'")
    && paneelBron.includes("htmlFor='klimop-voorstel-naam'")
    && paneelBron.includes("htmlFor='klimop-voorstel-fase'")
    && paneelBron.includes("htmlFor='klimop-voorstel-bewijs'")
    && !/<label[^>]*>(?:(?!<\/label>)[\s\S])*<HulpVraag/.test(paneelBron)
    && paneelBron.includes('KLIMOP_VIJFTIEN_VRAGEN_LIJST')
    && paneelBron.includes('gebruikStandaardBewijsVoorOntbrekendeVragen: false')
    && toetsZonderBewijs.goedgekeurd === false
    && toetsZonderBewijs.beoordeeldeVragen === 0
    && cssBron.includes('[data-klimop-paneel] .ag-knop')
    && cssBron.includes('overflow-wrap:anywhere'),
  );

  // ------------------------------------------------------------------ 9. Двомовна паритетність, якорі, B-025 (1.6.0), відсутність грошових сум і Мовний закон
  const gewijzigdeBestanden = [
    'shared/klimop/kern.ts',
    'shared/klimop/stengels.ts',
    'shared/klimop/opslag.ts',
    'shared/klimop/drempelsleutels.ts',
    'shared/klimop/diensten.ts',
    'shared/klimop/mensbescherming.ts',
    'shared/klimop/hechtranken.ts',
    'shared/klimop/beveiligingsaudit.ts',
    'shared/klimop/zaden.ts',
    'shared/klimop-overzicht-model.ts',
    'backend/klimop-knooppunt-agent.ts',
    'backend/klimop-opslag-client.ts',
    'backend/klimop-drempel-client.ts',
    'backend/klimop-overdracht-opslag.ts',
    'backend/klimop-platform-brug.ts',
    'backend/klimop-hulpmiddelen.ts',
    'backend/klimop-paden.ts',
    'src/agenten/KlimopPaneel.tsx',
    'scripts/klimop-etappe10-hechtranken-proef.mjs',
    'scripts/klimop-etappe11-beveiligingsaudit-proef.mjs',
    'scripts/klimop-etappe12-zaden-proef.mjs',
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.uk.md',
    'docs/hub/KLIMOP-FASE-2-BEPROEVINGSNETWERK-EN-STENGELS.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.uk.md',
    'docs/hub/KLIMOP-FASE-3-VERSLEUTELING-EN-VERDEELDE-OPSLAG.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-6-РОЗПОДІЛЕНЕ-КЕРУВАННЯ-ТА-БЕЗПЕЧНІ-ВИПУСКИ.uk.md',
    'docs/hub/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md',
    'docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md',
    'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md',
    'docs/hub/KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md',
    'tests/eenheid/bijdragen-001-20261118.test.ts',
    'tests/eenheid/klimop-021-overdracht-paneel-tweetaligheid-20261121.test.ts',
  ];

  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const geldPatroon = new RegExp('\\b0\\s*(?:\\u0454\\u0432\\u0440\\u043e|eu' + 'ro)\\b|\\u20ac\\s*\\d', 'i');
  const taalOfGeldFouten = gewijzigdeBestanden.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || geldPatroon.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });

  check(
    'усі дзеркальні пари (.uk.md/.md, BESLUITEN.md/РІШЕННЯ.uk.md, README/LEESMIJ, покажчики), якорі, B-025 (1.6.0) та вимоги Мовного закону без грошових сум виконуються повністю ([521], [523], [537], [541], [543], [545])',
    taalOfGeldFouten.length === 0
    && lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('docs/hub/ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.md')
    && lees('docs/hub/ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.md')
    && lees('docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.md')
    && lees('docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md') === lees('docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.md')
    && lees('orchestratie/BESLUITEN.md') === lees('orchestratie/РІШЕННЯ.uk.md')
    && lees('AGENTS.md') === lees('ПРАВИЛА-АГЕНТІВ.uk.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md').includes('backend/deployment-identiteit.ts')
    && lees('LEESMIJ.md').includes('backend/deployment-identiteit.ts')
    && lees('docs/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md'.replace('docs/', 'docs/hub/')).includes('onomkeerbareHerstelProcedureId'),
    taalOfGeldFouten.join(', '),
  );

  return einde();
}
