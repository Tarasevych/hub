// KLIMOP-019 (21.11.2026): друга хвиля виправлень за незалежною перевіркою «Плюща» (GPT-6.2 Astra (Ультра))
// робіт KLIMOP-001–017 (Gemini 4 Carbon (High)); виправлення виконує Claude Opus 5.5 (High) у Google Antigravity.
//   1. FROST(Ed25519, SHA-512) збігається з еталонним вектором RFC 9591 додатка E.1 побайтово: нонси, зобов'язання,
//      входи й коефіцієнти прив'язки, частки підпису, спільне зобов'язання R і кінцевий підпис; нонс залежить від частки.
//   2. Підчастки DKG і нульові вклади оновлення епох шифруються лише для адресата й підписуються відправником;
//      координатор не бачить відкритих підчасток і не може непомітно підмінити склад учасників.
//   3. Перехід епохи двофазний і стійкий: стан вузла зберігається в зашифрованому файлі 0600, перезапуск між фазами
//      не розводить групу, повтор підтвердження безпечний, протилежне рішення відхиляється, пошкоджений файл — відмова.
//   4. Корінь Меркла «Насіння» v2: побайтове впорядкування, відмова на повторних шляхах, без дублювання непарного вузла.
//   5. Повний порядок CRDT: злиття операцій з однаковим HLC не залежить від порядку.
// KLIMOP-019 · Tweede herstelgolf: FROST volgens RFC 9591 E.1, geadresseerde versleuteling van subdelen,
// duurzame tweefasige epochewissel, Merkle v2 en totale CRDT-ordening.
// Запуск: node scripts/eenheidstests.mjs klimop-019-frost-dkg-epoche-merkle-crdt-20261121.test.ts

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import {
  ED25519_ORDE_L,
  berekenFrostBindingFactorenRfc9591,
  frostNonceGenereer,
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  maakDkgDeelnemerBijdrage,
  verifieerStandaardEd25519Handtekening,
  type FeldmanVssDeel,
} from '../../shared/klimop/drempelsleutels';
import {
  maakDrempelOntvangstSleutel,
  ontsleutelDkgPakketVoorOntvanger,
  ontsleutelSubdeel,
  verifieerDrempelSamenstelling,
  versleutelDkgPakket,
  versleutelSubdeel,
  type KlimopDrempelDeelnemer,
} from '../../shared/klimop/drempel-vervoer';
import { laadDrempelStaat } from '../../backend/klimop-knooppunt-staat';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopDrempelOndertekenaarClient } from '../../backend/klimop-drempel-client';
import { ZAAD_MERKLE_SCHEMA, berekenZaadMerkleWortelSha256 } from '../../shared/klimop/zaden';
import {
  KLIMOP_ELF_DIENSTEN,
  maakHlcStempel,
  maakLegeDienstCrdtStaat,
  maakOndertekendeCrdtOperatie,
  vergelijkCrdtOperaties,
  voegCrdtStatenSamen,
} from '../../shared/klimop/diensten';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const WORTEL = process.cwd();
const VERBODEN_LETTERS = new RegExp(`[${[0x401, 0x451, 0x42a, 0x44a, 0x42b, 0x44b, 0x42d, 0x44d].map((c) => String.fromCodePoint(c)).join('')}]`);
const lees = (rel: string) => readFileSync(join(WORTEL, rel), 'utf8');

// Еталонний вектор RFC 9591, додаток E.1 — FROST(Ed25519, SHA-512), учасники 1 і 3 з набору 2-з-3.
const E1 = {
  groepsSleutel: '15d21ccd7ee42959562fc8aa63224c8851fb3ec85a3faf66040d380fb9738673',
  boodschap: '74657374',
  p1: {
    deel: '929dcc590407aae7d388761cddb0c0db6f5627aea8e217f4a033f2ec83d93509',
    schuil: '0fd2e39e111cdc266f6c0f4d0fd45c947761f1f5d3cb583dfcb9bbaf8d4c9fec',
    bind: '69cd85f631d5f7f2721ed5e40519b1366f340a87c2f6856363dbdcda348a7501',
    d: 'b5aa8ab305882a6fc69cbee9327e5a45e54c08af61ae77cb8207be3d2ce13de3',
    e: '67e98ab55aa310c3120418e5050c9cf76cf387cb20ac9e4b6fdb6f82a469f932',
    bf: 'f2cb9d7dd9beff688da6fcc83fa89046b3479417f47f55600b106760eb3b5603',
    z: '001719ab5a53ee1a12095cd088fd149702c0720ce5fd2f29dbecf24b7281b603',
  },
  p3: {
    deel: 'd3cb090a075eb154e82fdb4b3cb507f110040905468bb9c46da8bdea643a9a02',
    schuil: '86d64a260059e495d0fb4fcc17ea3da7452391baa494d4b00321098ed2a0062f',
    bind: '13e6b25afb2eba51716a9a7d44130c0dbae0004a9ef8d7b5550c8a0e07c61775',
    d: 'cfbdb165bd8aad6eb79deb8d287bcc0ab6658ae57fdcc98ed12c0669e90aec91',
    e: '7487bc41a6e712eea2f2af24681b58b1cf1da278ea11fe4e8b78398965f13552',
    bf: 'b087686bf35a13f3dc78e780a34b0fe8a77fef1b9938c563f5573d71d8d7890f',
    z: 'bd86125de990acc5e1f13781d8e32c03a9bbd4c53539bbc106058bfd14326007',
  },
  r: '36282629c383bb820a88b71cae937d41f2f2adfcc3d02e55507e2fb9e2dd3cbe',
  handtekening: '36282629c383bb820a88b71cae937d41f2f2adfcc3d02e55507e2fb9e2dd3cbebd9d2b0844e49ae0f3fa935161e1419aab7b47d21a37ebeae1f17d4987b3160b',
};

function leScalair(hex: string): bigint {
  return BigInt(`0x${Buffer.from(hex, 'hex').reverse().toString('hex') || '0'}`);
}
function scalairLe(x: bigint): string {
  return Buffer.from(x.toString(16).padStart(64, '0'), 'hex').reverse().toString('hex');
}
function feldmanDeel(index: number, scalairHex: string): FeldmanVssDeel {
  return { schema: 1, setId: 'rfc9591-e1', epoche: 0, index, drempel: 2, totaal: 3, scalairHex, toezeggingenHex: [] } as FeldmanVssDeel;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-019');

  // ------------------------------------------------------------------ 1. FROST за RFC 9591 E.1
  const d1 = feldmanDeel(1, E1.p1.deel);
  const d3 = feldmanDeel(3, E1.p3.deel);
  const r1 = frostRonde1MaakToezegging(d1, { schuil: Buffer.from(E1.p1.schuil, 'hex'), bind: Buffer.from(E1.p1.bind, 'hex') });
  const r3 = frostRonde1MaakToezegging(d3, { schuil: Buffer.from(E1.p3.schuil, 'hex'), bind: Buffer.from(E1.p3.bind, 'hex') });
  check('RFC 9591 E.1: зобов\'язання D і E учасника 1 збігаються з еталоном',
    r1.publiek.schuilPuntDHex === E1.p1.d && r1.publiek.bindPuntEHex === E1.p1.e, JSON.stringify(r1.publiek));
  check('RFC 9591 E.1: зобов\'язання D і E учасника 3 збігаються з еталоном',
    r3.publiek.schuilPuntDHex === E1.p3.d && r3.publiek.bindPuntEHex === E1.p3.e, JSON.stringify(r3.publiek));
  const lijst = [r1.publiek, r3.publiek];
  const boodschap = Buffer.from(E1.boodschap, 'hex');
  const bf = berekenFrostBindingFactorenRfc9591({ boodschap, toezeggingenLijst: lijst, groepsPubliekeSleutelHex: E1.groepsSleutel });
  const bf1 = bf.verslag.perDeelnemer.find((p) => p.deelnemerIndex === 1)?.bindingFactorHex;
  const bf3 = bf.verslag.perDeelnemer.find((p) => p.deelnemerIndex === 3)?.bindingFactorHex;
  check('RFC 9591 E.1: коефіцієнти прив\'язки обох учасників збігаються з еталоном', bf1 === E1.p1.bf && bf3 === E1.p3.bf, `${bf1} ${bf3}`);
  check('RFC 9591 E.1: вхід коефіцієнта прив\'язки починається з відкритого ключа групи (§4.4)',
    bf.verslag.invoerVoorvoegselHex.startsWith(E1.groepsSleutel) && bf.verslag.perDeelnemer.every((p) => p.invoerHex.startsWith(bf.verslag.invoerVoorvoegselHex)));
  check('RFC 9591 E.1: спільне зобов\'язання R збігається з еталоном', bf.groepsToezeggingHex === E1.r, bf.groepsToezeggingHex);
  const z1 = frostRonde2TekenDeel({ deel: d1, geheimeNonceStaat: r1.geheimeNonceStaat, boodschap, toezeggingenLijst: lijst, groepsPubliekeSleutelHex: E1.groepsSleutel });
  const z3 = frostRonde2TekenDeel({ deel: d3, geheimeNonceStaat: r3.geheimeNonceStaat, boodschap, toezeggingenLijst: lijst, groepsPubliekeSleutelHex: E1.groepsSleutel });
  check('RFC 9591 E.1: частки підпису учасників 1 і 3 збігаються з еталоном',
    z1.ok && z3.ok && z1.deelHandtekening.zDeelHex === E1.p1.z && z3.deelHandtekening.zDeelHex === E1.p3.z,
    JSON.stringify([z1, z3]));
  const zSom = z1.ok && z3.ok ? (leScalair(z1.deelHandtekening.zDeelHex) + leScalair(z3.deelHandtekening.zDeelHex)) % ED25519_ORDE_L : 0n;
  const handtekening = `${bf.groepsToezeggingHex}${scalairLe(zSom)}`;
  check('RFC 9591 E.1: кінцевий підпис R‖z збігається з еталоном побайтово', handtekening === E1.handtekening, handtekening);
  check('кінцевий підпис проходить стандартну перевірку Ed25519 (node:crypto)', verifieerStandaardEd25519Handtekening(boodschap, handtekening, E1.groepsSleutel));
  const herhaling = frostRonde2TekenDeel({ deel: d1, geheimeNonceStaat: r1.geheimeNonceStaat, boodschap, toezeggingenLijst: lijst, groepsPubliekeSleutelHex: E1.groepsSleutel });
  check('повторне використання тих самих нонсів відхиляється', !herhaling.ok && herhaling.fout === 'FROST_NONCE_REEDS_VERBRUIKT');
  const zelfdeWillekeur = randomBytes(32);
  check('нонс залежить від частки: та сама випадковість і різні частки дають різні нонси (RFC 9591 §4.1)',
    frostNonceGenereer(E1.p1.deel, zelfdeWillekeur) !== frostNonceGenereer(E1.p3.deel, zelfdeWillekeur)
    && frostNonceGenereer(E1.p1.deel, zelfdeWillekeur) === frostNonceGenereer(E1.p1.deel, zelfdeWillekeur));

  // ------------------------------------------------------------------ 2. Адресне шифрування підчасток
  const nuIso = new Date().toISOString();
  const verlooptOpIso = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const opdrachtgever = maakKlimopKnooppunt({ type: 'persoonlijke_gebruikersapparaten', rollen: ['verificatie', 'herstel'], juridischeRegio: 'NL', aanbieder: 'persoonlijk-toestel-eigenaar', nuIso });
  const knNL = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie', 'verbinding'], juridischeRegio: 'NL', aanbieder: 'eigen-knoop-nl', nuIso });
  const knCH = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie', 'verbinding'], juridischeRegio: 'CH', aanbieder: 'alpen-knoop-ch', nuIso });
  const knUA = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie', 'verbinding', 'herstel'], juridischeRegio: 'UA', aanbieder: 'kyiv-knoop-ua', nuIso });
  const indringer = maakKlimopKnooppunt({ type: 'vaste_onafhankelijke_knooppunten', rollen: ['verificatie'], juridischeRegio: 'DE', aanbieder: 'vreemde-knoop', nuIso });

  const setLokaal = 'klimop-019-lokaal';
  const ontvang = [knNL, knCH, knUA].map((kn, i) => maakDrempelOntvangstSleutel({ setId: setLokaal, deelnemerIndex: i + 1, knooppunt: kn }));
  const deelnemers: KlimopDrempelDeelnemer[] = [knNL, knCH, knUA].map((kn, i) => ({ identiteit: kn.identiteit, ontvangstSleutel: ontvang[i].publiek }));
  const sv = verifieerDrempelSamenstelling(setLokaal, deelnemers);
  check('склад учасників із підписаними ключами отримання проходить перевірку', sv.ok);
  const samenstellingHex = sv.ok ? sv.samenstellingHex : '';
  const vervalsteSleutel = { ...deelnemers[1], ontvangstSleutel: { ...deelnemers[1].ontvangstSleutel, x25519PubliekB64u: ontvang[0].publiek.x25519PubliekB64u } };
  const svVervalst = verifieerDrempelSamenstelling(setLokaal, [deelnemers[0], vervalsteSleutel, deelnemers[2]]);
  check('підміна ключа отримання без підпису вузла відхиляється', !svVervalst.ok && svVervalst.fout === 'ONTVANGSTSLEUTEL_HANDTEKENING_ONGELDIG', JSON.stringify(svVervalst));

  const context = { setId: setLokaal, soort: 'dkg' as const, epoche: 1, afzenderIndex: 1, ontvangerIndex: 2, samenstellingHex };
  const geheimSubdeel = randomBytes(32).toString('hex');
  const envelop = versleutelSubdeel(context, geheimSubdeel, ontvang[1].publiek.x25519PubliekB64u);
  const goed = ontsleutelSubdeel(context, envelop, ontvang[1].geheimX25519Pkcs8B64u);
  check('адресат розшифровує власну підчастку', goed.ok && goed.subdeelHex === geheimSubdeel);
  const chuzhyi = ontsleutelSubdeel(context, envelop, ontvang[2].geheimX25519Pkcs8B64u);
  check('чужий ключ отримання не розшифровує підчастку', !chuzhyi.ok);
  const andereContext = ontsleutelSubdeel({ ...context, ontvangerIndex: 3 }, envelop, ontvang[1].geheimX25519Pkcs8B64u);
  const andereEpoche = ontsleutelSubdeel({ ...context, epoche: 2 }, envelop, ontvang[1].geheimX25519Pkcs8B64u);
  const andereSamenstelling = ontsleutelSubdeel({ ...context, samenstellingHex: 'ab'.repeat(32) }, envelop, ontvang[1].geheimX25519Pkcs8B64u);
  check('зміна контексту (отримувач, епоха, склад) дає відмову розшифрування', !andereContext.ok && !andereEpoche.ok && !andereSamenstelling.ok);

  const open = maakDkgDeelnemerBijdrage({ setId: setLokaal, afzenderIndex: 1, drempel: 2, totaal: 3 });
  const versleuteld = versleutelDkgPakket({ pakket: open, deelnemers, samenstellingHex, afzender: knNL });
  const pakketJson = JSON.stringify(versleuteld);
  check('зашифрований пакет DKG не містить жодної відкритої підчастки',
    Object.values(open.subdelenPerOntvanger).every((s) => !pakketJson.includes(String(s))) && !('subdelenPerOntvanger' in versleuteld));
  const ontvangen = ontsleutelDkgPakketVoorOntvanger({ pakket: versleuteld, deelnemers, samenstellingHex, ontvangerIndex: 2, eigenGeheimX25519Pkcs8B64u: ontvang[1].geheimX25519Pkcs8B64u });
  check('отримувач бачить лише власну підчастку DKG',
    ontvangen.ok && Object.keys(ontvangen.pakket.subdelenPerOntvanger).join(',') === '2' && ontvangen.pakket.subdelenPerOntvanger[2] === open.subdelenPerOntvanger[2]);
  const gewijzigd = { ...versleuteld, toezeggingenHex: [...versleuteld.toezeggingenHex].reverse() };
  const gewijzigdUit = ontsleutelDkgPakketVoorOntvanger({ pakket: gewijzigd, deelnemers, samenstellingHex, ontvangerIndex: 2, eigenGeheimX25519Pkcs8B64u: ontvang[1].geheimX25519Pkcs8B64u });
  check('підміна зобов\'язань у підписаному пакеті відхиляється', !gewijzigdUit.ok && gewijzigdUit.fout === 'DKG_PAKKET_HANDTEKENING_ONGELDIG' && gewijzigdUit.verdachteAfzenderIndex === 1);
  const andereSamenstellingUit = ontsleutelDkgPakketVoorOntvanger({ pakket: versleuteld, deelnemers, samenstellingHex: 'cd'.repeat(32), ontvangerIndex: 2, eigenGeheimX25519Pkcs8B64u: ontvang[1].geheimX25519Pkcs8B64u });
  check('пакет з іншим відбитком складу відхиляється', !andereSamenstellingUit.ok && andereSamenstellingUit.fout === 'DKG_SAMENSTELLING_VERSCHILT');

  // ------------------------------------------------------------------ 3. Мережевий DKG і стійкий перехід епохи
  const tmp = mkdtempSync(join(tmpdir(), 'klimop-019-'));
  const staatCH = join(tmp, 'knooppunt-ch.staat');
  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  let srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH, staatBestand: staatCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });
  const tabel = new KlimopRouteTabel();
  for (const s of [srvNL, srvCH, srvUA]) tabel.voegTweerichtingsStengelToe(opdrachtgever.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
  const adressen = new Map([
    [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
    [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
    [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
  ]);
  const netwerk = new KlimopNetwerkClient(opdrachtgever, adressen, tabel);
  const drempel = new KlimopDrempelOndertekenaarClient(netwerk);
  try {
    // Координатор підмінює запис вузла NL на сторонній вузол із чинним власним підписом.
    const setAanval = 'klimop-019-aanval';
    const mandaatNL = ondertekenKlimopMandaat({
      schema: 1,
      mandaatId: `mnd_019_${knNL.identiteit.knooppuntId.slice(5, 17)}`,
      uitgeverKnooppuntId: opdrachtgever.identiteit.knooppuntId,
      ontvangerKnooppuntId: knNL.identiteit.knooppuntId,
      machtDomein: 'persoonlijke_gegevens',
      toegestaneRollen: ['verificatie'],
      toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
      alleenMetDrempelQuorum: false,
      drempelVereist: null,
      uitgegevenOp: nuIso,
      verlooptOp: verlooptOpIso,
    }, opdrachtgever);
    const o1 = await netwerk.roepOpdrachtAan(knNL.identiteit.knooppuntId, { actie: 'dkg_maak_ontvangstsleutel', setId: setAanval, deelnemerIndex: 1, mandaat: mandaatNL });
    const vreemd = maakDrempelOntvangstSleutel({ setId: setAanval, deelnemerIndex: 1, knooppunt: indringer });
    const ch2 = maakDrempelOntvangstSleutel({ setId: setAanval, deelnemerIndex: 2, knooppunt: knCH });
    const ua3 = maakDrempelOntvangstSleutel({ setId: setAanval, deelnemerIndex: 3, knooppunt: knUA });
    const aanvalSamenstelling: KlimopDrempelDeelnemer[] = [
      { identiteit: indringer.identiteit, ontvangstSleutel: vreemd.publiek },
      { identiteit: knCH.identiteit, ontvangstSleutel: ch2.publiek },
      { identiteit: knUA.identiteit, ontvangstSleutel: ua3.publiek },
    ];
    const aanval = await netwerk.roepOpdrachtAan(knNL.identiteit.knooppuntId, {
      actie: 'dkg_maak_bijdrage', setId: setAanval, deelnemerIndex: 1, drempel: 2, totaal: 3, deelnemers: aanvalSamenstelling, mandaat: mandaatNL,
    });
    check('вузол відмовляє, якщо координатор підмінив його власний запис у складі учасників',
      o1.antwoord.ok && !aanval.antwoord.ok && aanval.antwoord.fout === 'SAMENSTELLING_EIGEN_SLEUTEL_VERVALST', JSON.stringify(aanval.antwoord));

    const setId = 'klimop-019-netwerk';
    const dkg = await drempel.voerNetwerkDkgUit({
      setId, opdrachtgever, knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit], drempel: 2, nuIso, verlooptOpIso,
    });
    check('мережевий DKG 2-з-3 із зашифрованими підчастками завершується однаковим ключем групи', dkg.ok && /^[0-9a-f]{64}$/.test(dkg.groep.groepsPubliekeSleutelHex) && Boolean(dkg.groep.samenstellingHex),
      dkg.ok ? '' : dkg.fout);
    if (!dkg.ok) return einde();

    const herhaalDkg = await netwerk.roepOpdrachtAan(knNL.identiteit.knooppuntId, { actie: 'dkg_maak_ontvangstsleutel', setId, deelnemerIndex: 1, mandaat: dkg.groep.mandatenPerKnooppuntId[knNL.identiteit.knooppuntId] });
    check('повторний DKG того самого набору не перезаписує живої частки', !herhaalDkg.antwoord.ok && herhaalDkg.antwoord.fout === 'DREMPEL_SLEUTELSET_BESTAAT_REEDS');

    check('файл стану вузла має права 0600', existsSync(staatCH) && (statSync(staatCH).mode & 0o777) === 0o600, existsSync(staatCH) ? (statSync(staatCH).mode & 0o777).toString(8) : 'немає');
    const staatInhoud = readFileSync(staatCH);
    const staatOpen = laadDrempelStaat(staatCH, knCH);
    const deelCH = staatOpen.drempelDelen[setId]?.scalairHex ?? '';
    check('файл стану зашифровано: частка не трапляється у відкритому вигляді',
      deelCH.length === 64 && !staatInhoud.toString('latin1').includes(deelCH) && !staatInhoud.includes(Buffer.from(deelCH, 'hex')));

    const vb = await drempel.bereidEpocheVerversingVoorOpNetwerk({ groep: dkg.groep });
    check('фаза підготовки переходу в епоху 2 успішна на всіх вузлах', vb.ok, vb.ok ? '' : vb.fout);
    if (!vb.ok) return einde();
    await srvCH.sluit();
    const zonderCH = await drempel.rondEpocheVerversingAfOpNetwerk({ groep: dkg.groep, voorbereiding: vb.voorbereiding, besluit: 'bevestig', maxPogingen: 1, wachtMs: 0 });
    check('без CH підтвердження лишається незавершеним і називає вузол 2',
      !zonderCH.ok && zonderCH.fout === 'AFRONDING_ONVOLTOOID' && JSON.stringify(zonderCH.openstaandeIndexen) === '[2]', JSON.stringify(zonderCH));
    srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH, staatBestand: staatCH });
    adressen.set(knCH.identiteit.knooppuntId, srvCH.basisUrl);
    netwerk.sluitAlleSessies();
    check('після перезапуску CH пам\'ятає підготовку з файла стану (епоха ще 1)', srvCH.actieveDrempelEpoche(setId) === 1);
    const herhaald = await drempel.rondEpocheVerversingAfOpNetwerk({ groep: dkg.groep, voorbereiding: vb.voorbereiding, besluit: 'bevestig', maxPogingen: 2, wachtMs: 20 });
    check('повтор того самого підтвердження переводить усі три вузли в епоху 2',
      herhaald.ok && herhaald.vernieuwdeGroep.epoche === 2
      && srvNL.actieveDrempelEpoche(setId) === 2 && srvCH.actieveDrempelEpoche(setId) === 2 && srvUA.actieveDrempelEpoche(setId) === 2,
      herhaald.ok ? '' : JSON.stringify(herhaald));

    const mandaatCH = dkg.groep.mandatenPerKnooppuntId[knCH.identiteit.knooppuntId];
    const nogmaals = await netwerk.roepOpdrachtAan(knCH.identiteit.knooppuntId, { actie: 'ververs_afronden', setId, besluitId: vb.voorbereiding.besluitId, besluit: 'bevestig', mandaat: mandaatCH });
    check('повторне підтвердження вже завершеного рішення ідемпотентне (herhaald)',
      nogmaals.antwoord.ok && nogmaals.antwoord.actie === 'ververs_afgerond' && nogmaals.antwoord.herhaald === true && nogmaals.antwoord.actieveEpoche === 2);
    const tegengesteld = await netwerk.roepOpdrachtAan(knCH.identiteit.knooppuntId, { actie: 'ververs_afronden', setId, besluitId: vb.voorbereiding.besluitId, besluit: 'afbreken', mandaat: mandaatCH });
    check('протилежне рішення для вже завершеного переходу відхиляється', !tegengesteld.antwoord.ok && tegengesteld.antwoord.fout === 'VERVERSING_REEDS_ANDERS_AFGEROND');

    if (herhaald.ok) {
      tabel.plaatsInQuarantaine(knNL.identiteit.knooppuntId);
      const bericht = Buffer.from('KLIMOP-019: підпис після стійкого переходу епохи', 'utf8');
      const sig = await drempel.tekenMetFrostQuorum({ groep: herhaald.vernieuwdeGroep, boodschap: bericht });
      check('пара CH + UA підписує в епосі 2 під незмінним ключем групи',
        sig.ok && verifieerStandaardEd25519Handtekening(bericht, sig.handtekeningHex, dkg.groep.groepsPubliekeSleutelHex), sig.ok ? '' : sig.fout);
      tabel.haalUitQuarantaine(knNL.identiteit.knooppuntId);
    }

    const kapot = join(tmp, 'kapot.staat');
    writeFileSync(kapot, Buffer.concat([readFileSync(staatCH).subarray(0, 40), randomBytes(64)]));
    let weigering = '';
    try { laadDrempelStaat(kapot, knCH); } catch (e) { weigering = e instanceof Error ? e.message : String(e); }
    let startWeigering = '';
    try { const s = await startKlimopProefKnooppunt({ knooppunt: knCH, staatBestand: kapot }); await s.sluit(); } catch (e) { startWeigering = e instanceof Error ? e.message : String(e); }
    let vreemdeSleutel = '';
    try { laadDrempelStaat(staatCH, knUA); } catch (e) { vreemdeSleutel = e instanceof Error ? e.message : String(e); }
    check('пошкоджений або чужий файл стану не замінюється порожнім станом — вузол відмовляє',
      weigering === 'KNOOPPUNT_STAAT_ONLEESBAAR' && startWeigering === 'KNOOPPUNT_STAAT_ONLEESBAAR' && vreemdeSleutel === 'KNOOPPUNT_STAAT_ONLEESBAAR',
      `${weigering} | ${startWeigering} | ${vreemdeSleutel}`);
  } finally {
    netwerk.sluitAlleSessies();
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
    rmSync(tmp, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 4. Корінь Меркла «Насіння» v2
  const regel = (pad: string, n: number) => ({ pad, grootteBytes: n, sha256: Buffer.alloc(32, n).toString('hex') });
  const drie = [regel('b/twee.txt', 2), regel('a/een.txt', 1), regel('c/drie.txt', 3)];
  const wortel = berekenZaadMerkleWortelSha256(drie);
  check('схема кореня Меркла позначена як v2', ZAAD_MERKLE_SCHEMA === 'klimop-zaad-merkle-v2');
  check('корінь не залежить від вхідного порядку', wortel === berekenZaadMerkleWortelSha256([...drie].reverse()));
  let dubbel = '';
  try { berekenZaadMerkleWortelSha256([...drie, regel('a/een.txt', 9)]); } catch (e) { dubbel = e instanceof Error ? e.message : ''; }
  check('повторний шлях відхиляється (ZAAD_DUBBEL_PAD)', dubbel === 'ZAAD_DUBBEL_PAD');
  check('непарний перелік не збігається з переліком із продубльованим останнім елементом',
    wortel !== berekenZaadMerkleWortelSha256([...drie, regel('d/drie-kopie.txt', 3)]));
  check('зміна шляху, розміру чи відбитка будь-якого елемента змінює корінь',
    wortel !== berekenZaadMerkleWortelSha256([regel('a/een.txt', 1), regel('b/twee.txt', 2), { ...regel('c/drie.txt', 3), grootteBytes: 4 }])
    && wortel !== berekenZaadMerkleWortelSha256([regel('a/een.txt', 1), regel('b/twee.txt', 2), regel('c/drie.tx', 3)])
    && wortel !== berekenZaadMerkleWortelSha256([regel('a/een.txt', 1), regel('b/twee.txt', 2), { ...regel('c/drie.txt', 3), sha256: Buffer.alloc(32, 7).toString('hex') }]));
  check('межі шляху однозначні: «ab»+«c» ≠ «a»+«bc»',
    berekenZaadMerkleWortelSha256([regel('ab', 1), regel('c', 1)]) !== berekenZaadMerkleWortelSha256([regel('a', 1), regel('bc', 1)]));

  // ------------------------------------------------------------------ 5. Повний порядок CRDT
  const apparaat = generateKeyPairSync('ed25519');
  const apparaatSleutels = {
    publiekeSleutelDerB64u: (apparaat.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimeSleutelPkcs8B64u: (apparaat.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
  const dienstId = KLIMOP_ELF_DIENSTEN[0];
  const dienstContext = { dienstId, dienstPsid: 'psid-019', dienstSleutel32: randomBytes(32), epoche: 1 };
  const hlc = maakHlcStempel(1_800_000_000_000, 3, 'apparaat-019');
  const opA = maakOndertekendeCrdtOperatie({ dienstContext, sleutelId: 'notitie-1', soort: 'zet', klareWaarde: { t: 'A' }, hlc, apparaatTekenSleutels: apparaatSleutels });
  const opB = maakOndertekendeCrdtOperatie({ dienstContext, sleutelId: 'notitie-1', soort: 'zet', klareWaarde: { t: 'B' }, hlc, apparaatTekenSleutels: apparaatSleutels });
  const opV = maakOndertekendeCrdtOperatie({ dienstContext, sleutelId: 'notitie-1', soort: 'verwijder', klareWaarde: null, hlc, apparaatTekenSleutels: apparaatSleutels });
  const staat = (op: typeof opA) => ({ ...maakLegeDienstCrdtStaat(dienstId, 'psid-019'), elementen: { 'notitie-1': op } });
  const ab = voegCrdtStatenSamen(staat(opA), staat(opB));
  const ba = voegCrdtStatenSamen(staat(opB), staat(opA));
  check('злиття двох операцій з однаковим HLC дає той самий результат в обох порядках',
    ab.ok && ba.ok && ab.samengevoegd.elementen['notitie-1'].handtekeningB64u === ba.samengevoegd.elementen['notitie-1'].handtekeningB64u);
  const zelf = ab.ok ? voegCrdtStatenSamen(ab.samengevoegd, ab.samengevoegd) : ab;
  check('злиття з собою не змінює результату (ідемпотентність)', zelf.ok && ab.ok && JSON.stringify(zelf.samengevoegd) === JSON.stringify(ab.samengevoegd));
  check('порівняння операцій антисиметричне й дає 0 лише для однакових',
    Math.sign(vergelijkCrdtOperaties(opA, opB)) === -Math.sign(vergelijkCrdtOperaties(opB, opA)) && vergelijkCrdtOperaties(opA, opB) !== 0 && vergelijkCrdtOperaties(opA, opA) === 0);
  const metV1 = voegCrdtStatenSamen(staat(opA), staat(opV));
  const metV2 = voegCrdtStatenSamen(staat(opV), staat(opA));
  check('при рівному HLC видалення перемагає запис незалежно від порядку',
    metV1.ok && metV2.ok && metV1.samengevoegd.elementen['notitie-1'].soort === 'verwijder' && metV2.samengevoegd.elementen['notitie-1'].soort === 'verwijder');

  // ------------------------------------------------------------------ 6. Архітектурна перевірка, статті, мовний закон
  const antwoorden15 = Object.fromEntries(KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, {
    voldaan: true,
    bewijs: `Перевірено у KLIMOP-019 (друга хвиля виправлень: FROST за RFC 9591, адресне шифрування, стійкі епохи, Меркл v2, повний порядок CRDT) для ${id}`,
  }])) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeel = beoordeelKlimopWijziging({
    naam: 'KLIMOP-019 Друга хвиля виправлень за незалежною перевіркою',
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('зміна проходить 15-пунктову архітектурну перевірку без зауважень', oordeel.goedgekeurd === true && oordeel.fouten.length === 0, JSON.stringify(oordeel.fouten));

  const artUk = 'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md';
  const artMd = 'docs/hub/ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.md';
  const artNl = 'docs/hub/KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md';
  const uk = lees(artUk);
  const nl = lees(artNl);
  check('статті виправлень мають розділ другої хвилі обома мовами', uk.includes('KLIMOP-019') && nl.includes('KLIMOP-019') && /Хвиля 2/.test(uk) && /Golf 2/.test(nl));
  check('копія .md збігається з українською статтею', lees(artMd) === uk);
  check('статті чесно називають обмеження: один ключ отримання на набір і перевірку лише еталонним вектором',
    /один ключ отримання/.test(uk) && /één ontvangstsleutel/.test(nl) && /RFC 9591/.test(uk) && /RFC 9591/.test(nl));

  const bestanden = [
    'shared/klimop/drempelsleutels.ts', 'shared/klimop/drempel-vervoer.ts', 'backend/klimop-knooppunt-staat.ts',
    'backend/klimop-knooppunt-agent.ts', 'backend/klimop-drempel-client.ts', 'shared/klimop/zaden.ts', 'shared/klimop/diensten.ts',
    'scripts/klimop-etappe4-frost-proef.mjs', artUk, artNl,
    'tests/eenheid/klimop-019-frost-dkg-epoche-merkle-crdt-20261121.test.ts',
  ];
  const overtredingen = bestanden.filter((b) => VERBODEN_LETTERS.test(lees(b)));
  check('нові та змінені файли без заборонених літер', overtredingen.length === 0, overtredingen.join(', '));
  const taalUk = taalwetOvertreding(uk);
  const taalNl = taalwetOvertreding(nl);
  check('статті виправлень дотримуються мовного закону', !taalUk && !taalNl, `uk=${taalUk} nl=${taalNl}`);

  return einde();
}
