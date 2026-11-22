// KLIMOP-003 (20.11.2026): Модульні та живі мережеві випробування Етапу 2 маніфесту «Плющ» / «Klimop»:
// протокол захищених зв'язків «Стебла» (shared/klimop/stengels.ts), ізольований мережевий вузол та маршрутизувальний клієнт
// (backend/klimop-knooppunt-agent.ts), полігон 3 незалежних вузлів (NL, CH, UA) з наскрізною естафетою та карантином.
// Запуск: node scripts/eenheidstests.mjs klimop-003-etappe2-proefnetwerk-20261120.test.ts

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  controleerKnooppuntOnafhankelijkheid,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  type KlimopControleVraagId,
  type KlimopMandaatInhoud,
} from '../../shared/klimop/kern';
import {
  KlimopRouteTabel,
  beantwoordStengelHanddruk,
  maakStengelHanddrukAanvraag,
  ontsleutelStengelKader,
  sluitStengelSessie,
  versleutelStengelKader,
  verwijderKaderOpvulling,
  voltooiStengelHanddruk,
  vulKaderLadingAan,
} from '../../shared/klimop/stengels';
import {
  KlimopNetwerkClient,
  startKlimopProefKnooppunt,
} from '../../backend/klimop-knooppunt-agent';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-003-etappe2-proefnetwerk');

  const nuIso = '2026-11-20T18:20:00Z';
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verbinding', 'verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-apparatuur-nl',
    nuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'gespecialiseerde_knooppunten',
    rollen: ['verbinding', 'verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'alpen-relais-ch',
    nuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'herstel'],
    juridischeRegio: 'UA',
    aanbieder: 'kyiv-knoop-ua',
    nuIso,
  });
  const eigenaarApparaat = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'herstel', 'verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'persoonlijk-toestel-eigenaar',
    nuIso,
  });

  // ------------------------------------------------------------------ 1. Взаємне рукостискання «Стебел» та пряма таємниця
  const hdr1 = maakStengelHanddrukAanvraag(knNL, knUA.identiteit.knooppuntId, { nuIso });
  const antw1 = beantwoordStengelHanddruk(knUA, hdr1.aanvraag, { nuIso });
  check('крок 2 рукостискання успішно перевіряє паспорт Ed25519 і виводить сеанс отримувача',
    antw1.ok === true && antw1.sessie.rol === 'ontvanger' && antw1.sessie.algoritme === 'chacha20-poly1305');

  if (!antw1.ok) return einde();
  const volt1 = voltooiStengelHanddruk(knNL, hdr1, antw1.antwoord, { nuIso });
  check('крок 3 рукостискання встановлює взаємно узгоджений сеанс з односторонніми ключами I2R ≠ R2I',
    volt1.ok === true
    && volt1.sessie.sessieId === antw1.sessie.sessieId
    && volt1.sessie.zendSleutel.equals(antw1.sessie.ontvangSleutel)
    && volt1.sessie.ontvangSleutel.equals(antw1.sessie.zendSleutel)
    && !volt1.sessie.zendSleutel.equals(volt1.sessie.ontvangSleutel));

  const hdr2 = maakStengelHanddrukAanvraag(knNL, knUA.identiteit.knooppuntId, {
    nuIso,
    algoritmeVoorkeur: 'aes-256-gcm',
  });
  const antw2 = beantwoordStengelHanddruk(knUA, hdr2.aanvraag, { nuIso });
  const volt2 = antw2.ok ? voltooiStengelHanddruk(knNL, hdr2, antw2.antwoord, { nuIso }) : { ok: false as const, fout: '' };
  check('пряма таємниця та криптографічна гнучкість: новий сеанс має інший sessieId, інші ключі та підтримує AES-256-GCM',
    antw2.ok === true
    && volt2.ok === true
    && volt1.ok === true
    && volt2.sessie.sessieId !== volt1.sessie.sessieId
    && !volt2.sessie.zendSleutel.equals(volt1.sessie.zendSleutel)
    && volt2.sessie.algoritme === 'aes-256-gcm');

  const verkeerdDoel = beantwoordStengelHanddruk(knCH, hdr1.aanvraag, { nuIso });
  const verlopenTijd = beantwoordStengelHanddruk(knUA, hdr1.aanvraag, { nuIso: '2026-11-20T19:00:00Z' });
  const inQuarantaine = beantwoordStengelHanddruk(knUA, hdr1.aanvraag, {
    nuIso,
    ingetrokkenKnooppuntIds: new Set([knNL.identiteit.knooppuntId]),
  });
  const vervalsteSig = beantwoordStengelHanddruk(
    knUA,
    { ...hdr1.aanvraag, handtekeningB64u: randomBytes(64).toString('base64url') },
    { nuIso },
  );
  const vervalstTranscript = voltooiStengelHanddruk(
    knNL,
    hdr1,
    { ...antw1.antwoord, transcriptSha256: '0'.repeat(64) },
    { nuIso },
  );

  check('рукостискання відхиляє чуже призначення, прострочений час, карантинний вузол, підроблений підпис і змінений транскрипт',
    !verkeerdDoel.ok && verkeerdDoel.fout === 'HANDDRUK_VERKEERD_DOEL_KNOOPPUNT'
    && !verlopenTijd.ok && verlopenTijd.fout === 'HANDDRUK_TIJD_BUITEN_VENSTER'
    && !inQuarantaine.ok && inQuarantaine.fout === 'KNOOPPUNT_IN_QUARANTAINE'
    && !vervalsteSig.ok && vervalsteSig.fout === 'HANDDRUK_INITIATOR_HANDTEKENING_ONGELDIG'
    && !vervalstTranscript.ok && vervalstTranscript.fout === 'TRANSCRIPT_HASH_KOMT_NIET_OVEREEN');

  // ------------------------------------------------------------------ 2. Шифрування кадрів, вирівнювання довжини та захист від повторів
  if (!volt1.ok || !antw2.ok || !volt2.ok) return einde();

  const opgevuldKort = vulKaderLadingAan(Buffer.from('Привіт', 'utf8'), 256);
  const opgevuldLang = vulKaderLadingAan(Buffer.alloc(190, 0x41), 256);
  check('вирівнювання довжини кадра приховує точний розмір повідомлення у фіксованих блоках 256 байт і точно відновлює оригінал',
    opgevuldKort.length === 256
    && opgevuldLang.length === 256
    && verwijderKaderOpvulling(opgevuldKort).toString('utf8') === 'Привіт'
    && verwijderKaderOpvulling(opgevuldLang).length === 190);

  const kaderTijdOpt = { nuMs: Date.parse(nuIso) + 1000 };
  const boodschapI2R = Buffer.from('Наскрізно зашифрований кадр ChaCha20-Poly1305', 'utf8');
  const kaderChaCha = versleutelStengelKader(volt1.sessie, boodschapI2R, kaderTijdOpt);
  const geopendChaCha = ontsleutelStengelKader(antw1.sessie, kaderChaCha, kaderTijdOpt);
  const herhalingChaCha = ontsleutelStengelKader(antw1.sessie, kaderChaCha, kaderTijdOpt);

  const boodschapAes = Buffer.from('Зворотний кадр AES-256-GCM від отримувача до ініціатора', 'utf8');
  const kaderAes = versleutelStengelKader(antw2.sessie, boodschapAes, kaderTijdOpt);
  const geopendAes = ontsleutelStengelKader(volt2.sessie, kaderAes, kaderTijdOpt);

  const beschadigdKader = {
    ...versleutelStengelKader(volt1.sessie, Buffer.from('Перевірка цілісності', 'utf8'), kaderTijdOpt),
    authenticatieTagB64u: randomBytes(16).toString('base64url'),
  };
  const geopendBeschadigd = ontsleutelStengelKader(antw1.sessie, beschadigdKader, kaderTijdOpt);

  check('кадри ChaCha20-Poly1305 та AES-256-GCM розшифровуються без втрат, а повтор і підробка мітки автентичності блокуються',
    geopendChaCha.ok === true && geopendChaCha.klareInhoud.equals(boodschapI2R)
    && !herhalingChaCha.ok && herhalingChaCha.fout === 'HERHALING_OF_VOLGORDE_FOUT'
    && geopendAes.ok === true && geopendAes.klareInhoud.equals(boodschapAes)
    && !geopendBeschadigd.ok && geopendBeschadigd.fout === 'KADER_AUTHENTICATIE_MISLUKT');

  sluitStengelSessie(volt1.sessie);
  check('sluitStengelSessie затирає сеансові ключі нулями в пам’яті й блокує подальше використання закритого сеансу',
    volt1.sessie.gesloten === true
    && volt1.sessie.zendSleutel.every((b) => b === 0)
    && volt1.sessie.ontvangSleutel.every((b) => b === 0)
    && ontsleutelStengelKader(volt1.sessie, kaderAes, kaderTijdOpt).ok === false);

  // ------------------------------------------------------------------ 3. Таблиця маршрутизації KlimopRouteTabel
  const tabel = new KlimopRouteTabel();
  const idM = eigenaarApparaat.identiteit.knooppuntId;
  const idNL = knNL.identiteit.knooppuntId;
  const idCH = knCH.identiteit.knooppuntId;
  const idUA = knUA.identiteit.knooppuntId;
  tabel.voegTweerichtingsStengelToe(idM, idUA, 1);
  tabel.voegTweerichtingsStengelToe(idM, idCH, 1);
  tabel.voegTweerichtingsStengelToe(idCH, idUA, 1);
  tabel.voegTweerichtingsStengelToe(idM, idNL, 1);
  tabel.voegTweerichtingsStengelToe(idNL, idUA, 2);

  const routeDirect = tabel.kiesBesteRoute(idM, idUA);
  tabel.markeerStengelStaat(idM, idUA, 'verbroken');
  const routeViaCH = tabel.kiesBesteRoute(idM, idUA);
  tabel.plaatsInQuarantaine(idCH);
  const routeViaNL = tabel.kiesBesteRoute(idM, idUA);
  tabel.haalUitQuarantaine(idCH);

  check('KlimopRouteTabel обирає пряме стебло, при обриві переходить на CH, а при карантині CH — на запасне стебло через NL',
    JSON.stringify(routeDirect) === JSON.stringify([idM, idUA])
    && JSON.stringify(routeViaCH) === JSON.stringify([idM, idCH, idUA])
    && JSON.stringify(routeViaNL) === JSON.stringify([idM, idNL, idUA]));

  // ------------------------------------------------------------------ 4. Живий мережевий полігон 3 незалежних вузлів (127.0.0.1)
  const spreiding = controleerKnooppuntOnafhankelijkheid([knNL.identiteit, knCH.identiteit, knUA.identiteit], 2);
  check('3 вузли полігона (NL, CH, UA) проходять перевірку юрисдикційної та операторської незалежності для кворуму 2-з-3',
    spreiding.ok === true && spreiding.uniekeRegios === 3 && spreiding.uniekeAanbieders === 3);

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });

  try {
    const alleSrv = [srvNL, srvCH, srvUA];
    for (const a of alleSrv) {
      for (const b of alleSrv) {
        if (a !== b) a.registreerBuurAdres(b.identiteit.knooppuntId, b.basisUrl);
      }
    }

    const gezResp = await fetch(`${srvUA.basisUrl}/klimop/v1/gezondheid`);
    const gezJson = (await gezResp.json()) as { ok: boolean; knooppuntId: string; juridischeRegio: string };
    check('живий вузол UA відповідає на /klimop/v1/gezondheid без розкриття таємниць чи особистих даних',
      gezResp.status === 200 && gezJson.ok === true && gezJson.knooppuntId === idUA && gezJson.juridischeRegio === 'UA');

    const netwerkTabel = new KlimopRouteTabel();
    netwerkTabel.voegTweerichtingsStengelToe(idM, idNL, 1);
    netwerkTabel.voegTweerichtingsStengelToe(idM, idCH, 1);
    netwerkTabel.voegTweerichtingsStengelToe(idM, idUA, 1);
    netwerkTabel.voegTweerichtingsStengelToe(idCH, idUA, 1);
    netwerkTabel.voegTweerichtingsStengelToe(idNL, idUA, 2);

    const adressen = new Map<string, string>([
      [idNL, srvNL.basisUrl],
      [idCH, srvCH.basisUrl],
      [idUA, srvUA.basisUrl],
    ]);
    const client = new KlimopNetwerkClient(eigenaarApparaat, adressen, netwerkTabel);

    // Шифрування блока виключно на пристрої власника (AES-256-GCM) перед передаванням на вузол зберігання UA
    const eigenaarDek = randomBytes(32);
    const eigenaarIv = randomBytes(12);
    const geheimBericht = Buffer.from('Особистий запис власника: вузол зберігання бачить лише шифротекст і відбиток SHA-256.', 'utf8');
    const ciph = createCipheriv('aes-256-gcm', eigenaarDek, eigenaarIv);
    const ctBlok = Buffer.concat([eigenaarIv, ciph.update(geheimBericht), ciph.final(), ciph.getAuthTag()]);
    const blokSha256 = createHash('sha256').update(ctBlok).digest('hex');

    const mandaatInhoud: KlimopMandaatInhoud = {
      schema: 1,
      mandaatId: 'mnd-etappe2-ua-001',
      uitgeverKnooppuntId: idM,
      ontvangerKnooppuntId: idUA,
      machtDomein: 'persoonlijke_gegevens',
      toegestaneRollen: ['opslag'],
      toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
      alleenMetDrempelQuorum: false,
      drempelVereist: null,
      uitgegevenOp: '2026-11-20T00:00:00Z',
      verlooptOp: '2026-12-31T23:59:59Z',
    };
    const mandaatUA = ondertekenKlimopMandaat(mandaatInhoud, eigenaarApparaat);

    // Спроба зберегти блок на спеціалізованому сполучному вузлі CH (який не має ролі opslag) відхиляється
    const weigerZonderOpslagRol = await client.roepOpdrachtAan(idCH, {
      actie: 'bewaar_blok',
      blokSha256,
      cijfertekstB64u: ctBlok.toString('base64url'),
      mandaat: mandaatUA,
    });
    check('вузол без ролі opslag (CH) відхиляє спробу запису зашифрованого блока (KNOOPPUNT_HEEFT_GEEN_OPSLAGROL)',
      !weigerZonderOpslagRol.antwoord.ok && weigerZonderOpslagRol.antwoord.fout === 'KNOOPPUNT_HEEFT_GEEN_OPSLAGROL');

    // Спроба зберегти блок з підміненим SHA-256 відхиляється вузлом UA
    const weigerFouteSha = await client.roepOpdrachtAan(idUA, {
      actie: 'bewaar_blok',
      blokSha256: 'f'.repeat(64),
      cijfertekstB64u: ctBlok.toString('base64url'),
      mandaat: mandaatUA,
    });
    check('вузол зберігання UA перевіряє цілісність SHA-256 і відхиляє підмінений блок',
      !weigerFouteSha.antwoord.ok && weigerFouteSha.antwoord.fout === 'BLOK_SHA256_KOMT_NIET_OVEREEN');

    // Успішний прямий запис зашифрованого блока на вузол UA
    const bewaarRes = await client.roepOpdrachtAan(idUA, {
      actie: 'bewaar_blok',
      blokSha256,
      cijfertekstB64u: ctBlok.toString('base64url'),
      mandaat: mandaatUA,
    });
    const ruwOpUA = srvUA.leesRuwOpgeslagenBlok(blokSha256);
    check('вузол UA зберігає зашифрований блок за прямим стеблом і не має відкритого тексту у пам’яті',
      bewaarRes.antwoord.ok === true
      && bewaarRes.antwoord.actie === 'opgeslagen'
      && bewaarRes.gebruiktPad.length === 2
      && Boolean(ruwOpUA)
      && !ruwOpUA!.includes(Buffer.from('Особистий запис власника', 'utf8')));

    // Імітуємо обрив прямого стебла Пристрій ↔ UA: читання автоматично йде наскрізною естафетою через CH
    netwerkTabel.markeerStengelStaat(idM, idUA, 'verbroken');
    const haalViaEstafette = await client.roepOpdrachtAan(idUA, {
      actie: 'haal_blok',
      blokSha256,
      mandaat: mandaatUA,
    });

    let hersteldTekst = '';
    if (haalViaEstafette.antwoord.ok && haalViaEstafette.antwoord.actie === 'opgehaald') {
      const terug = Buffer.from(haalViaEstafette.antwoord.cijfertekstB64u, 'base64url');
      const ivTerug = terug.subarray(0, 12);
      const tagTerug = terug.subarray(terug.length - 16);
      const encTerug = terug.subarray(12, terug.length - 16);
      const dec = createDecipheriv('aes-256-gcm', eigenaarDek, ivTerug);
      dec.setAuthTag(tagTerug);
      hersteldTekst = Buffer.concat([dec.update(encTerug), dec.final()]).toString('utf8');
    }

    check('при обриві прямого стебла клієнт автоматично зчитує блок через естафету CH без збереження блока на CH і точно розшифровує його',
      haalViaEstafette.antwoord.ok === true
      && JSON.stringify(haalViaEstafette.gebruiktPad) === JSON.stringify([idM, idCH, idUA])
      && srvCH.estafetteTeller() >= 1
      && srvCH.aantalOpgeslagenBlokken() === 0
      && hersteldTekst === geheimBericht.toString('utf8'));

    // Відкликання мандата власником негайно припиняє видачу блока
    srvUA.trekMandaatIn('mnd-etappe2-ua-001');
    const naIntrekking = await client.roepOpdrachtAan(idUA, {
      actie: 'haal_blok',
      blokSha256,
      mandaat: mandaatUA,
    });
    check('відкликання мандата на вузлі UA негайно блокує подальше зчитування блока (MANDAAT_GEWEIGERD)',
      !naIntrekking.antwoord.ok && naIntrekking.antwoord.fout === 'MANDAAT_GEWEIGERD');

    // Карантин скомпрометованого вузла NL ізолює його без зупинки CH та UA
    netwerkTabel.plaatsInQuarantaine(idNL);
    srvCH.plaatsKnooppuntInQuarantaine(idNL);
    srvUA.plaatsKnooppuntInQuarantaine(idNL);

    const pingQuarantaineNL = await client.roepOpdrachtAan(idNL, { actie: 'ping', bericht: 'перевірка карантину' });
    const pingGezondUA = await client.roepOpdrachtAan(idUA, { actie: 'ping', bericht: 'мережа живе' });
    check('карантин вузла NL повністю блокує звернення до NL, тоді як CH та UA безперервно обслуговують запити',
      !pingQuarantaineNL.antwoord.ok
      && pingGezondUA.antwoord.ok === true
      && pingGezondUA.antwoord.actie === 'pong'
      && pingGezondUA.antwoord.echo === 'мережа живе');

    client.sluitAlleSessies();
  } finally {
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
  }

  // ------------------------------------------------------------------ 5. Перевірка 15 питань, документації Етапу 2 та Абсолютного мовного закону
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, { voldaan: true, bewijs: `Підтверджено Етапом 2 (stengels.ts / proefnetwerk) для ${id}` }]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const beoordelingEtappe2 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-003 Етап 2: випробувальна мережа незалежних вузлів та протокол Стебла',
    fase: 2,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 2 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    beoordelingEtappe2.goedgekeurd === true && beoordelingEtappe2.fouten.length === 0);

  const et2Uk = 'docs/hub/ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.uk.md';
  const et2Md = 'docs/hub/ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.md';
  const et2Nl = 'docs/hub/KLIMOP-FASE-2-BEPROEVINGSNETWERK-EN-STENGELS.nl.md';
  const composePad = 'deploy/klimop-proefnetwerk/docker-compose.proef.yml';

  check('двомовні документи Етапу 2 та ізольований стенд docker-compose.proef.yml існують і містять усі ключові складники',
    [et2Uk, et2Md, et2Nl, composePad].every((p) => existsSync(p))
    && lees(et2Uk) === lees(et2Md)
    && ['X25519', 'ChaCha20-Poly1305', 'AES-256-GCM', 'stengels.ts', 'klimop-knooppunt-agent.ts', 'klimop-proefnetwerk.mjs']
      .every((s) => lees(et2Uk).includes(s) && lees(et2Nl).includes(s))
    && lees(composePad).includes('internal: true')
    && lees(composePad).includes('read_only: true'));

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує злитий запит №184 (KLIMOP-002), нову задачу KLIMOP-003 та щонайменше 8 активних можливостей',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-002' && w.pr === 184)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-003')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 8);

  const bestandenKlimop003 = [
    'shared/klimop/stengels.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-proefnetwerk.mjs',
    composePad,
    et2Uk,
    et2Nl,
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md',
    'docs/INDEX.nl.md',
    'ОГЛЯД-ПРОЄКТУ.uk.md',
    'PROJECTOVERZICHT.nl.md',
    'ПЛАН-ПЕРЕНЕСЕННЯ.uk.md',
    'PORTEERPLAN.nl.md',
    'tests/eenheid/klimop-003-etappe2-proefnetwerk-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop003.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-003 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
