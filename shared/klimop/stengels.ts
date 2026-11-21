// KLIMOP-003 (20.11.2026, Етап 2 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Криптографічний протокол захищених зв'язків «Стебла» (§1.2, §6–§10, §15, §19) та маршрутизації з обходом збоїв і карантином.
// Використовує виключно перевірені стандартизовані примітиви вбудованого модуля node:crypto:
//   - X25519 (RFC 7748) для одноразового ефемерного обміну ключами на кожен сеанс (пряма таємниця);
//   - Ed25519 (RFC 8032) для взаємного підписання повного транскрипту рукостискання паспортами вузлів;
//   - HKDF-SHA-256 (RFC 5869) для виведення роздільних односторонніх сеансових ключів;
//   - ChaCha20-Poly1305 (RFC 8439) та AES-256-GCM для автентифікованого шифрування кадрів із вирівнюванням довжини
//     до фіксованих блоків (мінімізація витоку метаданих за розміром повідомлень) та захистом від повторного відтворення.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import {
  berekenKnooppuntId,
  canoniekeJson,
  type KlimopKnooppuntIdentiteit,
} from './kern';

export type StengelKaderAlgoritme = 'chacha20-poly1305' | 'aes-256-gcm';

export interface StengelHanddrukAanvraag {
  schema: 1;
  handdrukId: string;
  vanIdentiteit: KlimopKnooppuntIdentiteit;
  doelKnooppuntId: string;
  efemeerX25519DerB64u: string;
  /** Поле для гібридного постквантового розширення X25519MLKEM768 (FIPS 203) без зламу сумісності. */
  postkwantumKemB64u: string | null;
  algoritmeVoorkeur: StengelKaderAlgoritme;
  nonceB64u: string;
  tijdIso: string;
  handtekeningB64u: string;
}

export interface StengelHanddrukAntwoord {
  schema: 1;
  handdrukId: string;
  sessieId: string;
  vanIdentiteit: KlimopKnooppuntIdentiteit;
  doelKnooppuntId: string;
  gekozenAlgoritme: StengelKaderAlgoritme;
  efemeerX25519DerB64u: string;
  postkwantumKemAntwoordB64u: string | null;
  nonceB64u: string;
  tijdIso: string;
  transcriptSha256: string;
  handtekeningB64u: string;
}

export interface StengelVersleuteldKader {
  schema: 1;
  sessieId: string;
  vanKnooppuntId: string;
  naarKnooppuntId: string;
  algoritme: StengelKaderAlgoritme;
  volgnummer: number;
  opvullingBlokGrootte: number;
  cijfertekstB64u: string;
  authenticatieTagB64u: string;
}

export interface KlimopStengelSessie {
  readonly sessieId: string;
  readonly rol: 'initiator' | 'ontvanger';
  readonly eigenKnooppuntId: string;
  readonly tegenpartijIdentiteit: KlimopKnooppuntIdentiteit;
  readonly algoritme: StengelKaderAlgoritme;
  readonly opvullingBlokGrootte: number;
  readonly zendSleutel: Buffer;
  readonly ontvangSleutel: Buffer;
  volgendZendNummer: number;
  gezieneOntvangNummers: Set<number>;
  /** KLIMOP-021: нижня межа ковзного вікна прийому кадрів (обмежує пам'ять і відсікає застарілі кадри). */
  ontvangVensterOnderGrens: number;
  /** KLIMOP-021: гранична кількість кадрів до обов'язкової зміни сеансового ключа. */
  maxKadersTotSleutelWissel: number;
  /** KLIMOP-021: строк життя сеансу в мілісекундах UNIX. */
  verlooptOpMs: number;
  gesloten: boolean;
}

const HANDDRUK_AANVRAAG_DOMEIN = 'klimop-stengel-handdruk-aanvraag-v1|';
const HANDDRUK_ANTWOORD_DOMEIN = 'klimop-stengel-handdruk-antwoord-v1|';
const STANDAARD_KLOK_VENSTER_MS = 5 * 60 * 1000;
const STANDAARD_OPVULLING_BLOK = 256;
export const STENGEL_ONTVANG_VENSTER_GROOTTE = 2048;
export const STENGEL_STANDAARD_MAX_KADERS = 65_536;
export const STENGEL_STANDAARD_SESSIE_TTL_MS = 60 * 60 * 1000;

function controleerTijdVenster(tijdIso: string, nuIso?: string, maxScheefheidMs = STANDAARD_KLOK_VENSTER_MS): boolean {
  const t = Date.parse(tijdIso);
  const nu = Date.parse(nuIso ?? new Date().toISOString());
  if (!Number.isFinite(t) || !Number.isFinite(nu)) return false;
  return Math.abs(nu - t) <= maxScheefheidMs;
}

function verifieerPaspoortEnHandtekening(
  identiteit: KlimopKnooppuntIdentiteit,
  boodschap: Buffer,
  handtekeningB64u: string,
): boolean {
  if (!identiteit || identiteit.schema !== 1) return false;
  if (berekenKnooppuntId(identiteit.publiekeSleutelDerB64u) !== identiteit.knooppuntId) return false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(identiteit.publiekeSleutelDerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, boodschap, pub, Buffer.from(handtekeningB64u, 'base64url'));
  } catch {
    return false;
  }
}

function leidSessieSleutelsAf(
  gedeeldGeheim: Buffer,
  transcriptSha256: string,
  initiatorId: string,
  ontvangerId: string,
): { sessieId: string; sleutelInitiatorNaarOntvanger: Buffer; sleutelOntvangerNaarInitiator: Buffer } {
  const zout = Buffer.from(transcriptSha256, 'hex');
  const sessieId = `stgl1_${createHash('sha256').update('klimop-sessie-id|').update(zout).digest('hex').slice(0, 32)}`;
  const sleutelInitiatorNaarOntvanger = Buffer.from(
    hkdfSync('sha256', gedeeldGeheim, zout, Buffer.from(`klimop-stengel-i2r|${initiatorId}|${ontvangerId}`, 'utf8'), 32),
  );
  const sleutelOntvangerNaarInitiator = Buffer.from(
    hkdfSync('sha256', gedeeldGeheim, zout, Buffer.from(`klimop-stengel-r2i|${ontvangerId}|${initiatorId}`, 'utf8'), 32),
  );
  return { sessieId, sleutelInitiatorNaarOntvanger, sleutelOntvangerNaarInitiator };
}

/** Крок 1 рукостискання: ініціатор формує підписаний запит з одноразовим ефемерним ключем X25519. */
export function maakStengelHanddrukAanvraag(
  initiator: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
  doelKnooppuntId: string,
  opties: {
    algoritmeVoorkeur?: StengelKaderAlgoritme;
    nuIso?: string;
  } = {},
): { aanvraag: StengelHanddrukAanvraag; efemeerGeheimPkcs8B64u: string } {
  const { publicKey: efPub, privateKey: efPriv } = generateKeyPairSync('x25519');
  const efemeerX25519DerB64u = (efPub.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const efemeerGeheimPkcs8B64u = (efPriv.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url');

  const kern = {
    schema: 1 as const,
    handdrukId: `hdr_${randomBytes(12).toString('hex')}`,
    vanIdentiteit: initiator.identiteit,
    doelKnooppuntId,
    efemeerX25519DerB64u,
    postkwantumKemB64u: null,
    algoritmeVoorkeur: opties.algoritmeVoorkeur ?? 'chacha20-poly1305',
    nonceB64u: randomBytes(16).toString('base64url'),
    tijdIso: opties.nuIso ?? new Date().toISOString(),
  };

  const priv = createPrivateKey({
    key: Buffer.from(initiator.geheimeSleutelPkcs8B64u, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  const handtekeningB64u = sign(
    null,
    Buffer.from(HANDDRUK_AANVRAAG_DOMEIN + canoniekeJson(kern), 'utf8'),
    priv,
  ).toString('base64url');

  return {
    aanvraag: { ...kern, handtekeningB64u },
    efemeerGeheimPkcs8B64u,
  };
}

/** Крок 2 рукостискання: отримувач перевіряє ініціатора, генерує свій ефемерний ключ X25519 і виводить сеансові ключі. */
export function beantwoordStengelHanddruk(
  ontvanger: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
  aanvraag: StengelHanddrukAanvraag,
  opties: {
    nuIso?: string;
    ingetrokkenKnooppuntIds?: ReadonlySet<string>;
    opvullingBlokGrootte?: number;
    maxKadersTotSleutelWissel?: number;
    sessieTtlMs?: number;
  } = {},
): { ok: true; antwoord: StengelHanddrukAntwoord; sessie: KlimopStengelSessie } | { ok: false; fout: string } {
  if (!aanvraag || aanvraag.schema !== 1) return { ok: false, fout: 'HANDDRUK_ONGELDIGE_VORM' };
  if (aanvraag.doelKnooppuntId !== ontvanger.identiteit.knooppuntId) {
    return { ok: false, fout: 'HANDDRUK_VERKEERD_DOEL_KNOOPPUNT' };
  }
  if (
    opties.ingetrokkenKnooppuntIds?.has(aanvraag.vanIdentiteit.knooppuntId)
    || opties.ingetrokkenKnooppuntIds?.has(ontvanger.identiteit.knooppuntId)
  ) {
    return { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' };
  }
  if (!controleerTijdVenster(aanvraag.tijdIso, opties.nuIso)) {
    return { ok: false, fout: 'HANDDRUK_TIJD_BUITEN_VENSTER' };
  }

  const { handtekeningB64u, ...aanvraagKern } = aanvraag;
  const boodschapAanvraag = Buffer.from(HANDDRUK_AANVRAAG_DOMEIN + canoniekeJson(aanvraagKern), 'utf8');
  if (!verifieerPaspoortEnHandtekening(aanvraag.vanIdentiteit, boodschapAanvraag, handtekeningB64u)) {
    return { ok: false, fout: 'HANDDRUK_INITIATOR_HANDTEKENING_ONGELDIG' };
  }

  const { publicKey: efPub, privateKey: efPriv } = generateKeyPairSync('x25519');
  const efemeerX25519DerB64u = (efPub.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url');
  const gekozenAlgoritme: StengelKaderAlgoritme =
    aanvraag.algoritmeVoorkeur === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305';
  const nonceB64u = randomBytes(16).toString('base64url');
  const tijdIso = opties.nuIso ?? new Date().toISOString();

  const transcriptSha256 = createHash('sha256')
    .update(canoniekeJson({
      aanvraagKern,
      ontvangerIdentiteit: ontvanger.identiteit,
      efemeerOntvanger: efemeerX25519DerB64u,
      gekozenAlgoritme,
      nonceOntvanger: nonceB64u,
      tijdOntvanger: tijdIso,
    }))
    .digest('hex');

  let gedeeldGeheim: Buffer | null = null;
  let afgeleid: ReturnType<typeof leidSessieSleutelsAf> | null = null;
  let gelukt = false;
  try {
    const peerEfPub = createPublicKey({
      key: Buffer.from(aanvraag.efemeerX25519DerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    gedeeldGeheim = diffieHellman({ privateKey: efPriv, publicKey: peerEfPub });
    afgeleid = leidSessieSleutelsAf(
      gedeeldGeheim,
      transcriptSha256,
      aanvraag.vanIdentiteit.knooppuntId,
      ontvanger.identiteit.knooppuntId,
    );

    const antwoordKern = {
      schema: 1 as const,
      handdrukId: aanvraag.handdrukId,
      sessieId: afgeleid.sessieId,
      vanIdentiteit: ontvanger.identiteit,
      doelKnooppuntId: aanvraag.vanIdentiteit.knooppuntId,
      gekozenAlgoritme,
      efemeerX25519DerB64u,
      postkwantumKemAntwoordB64u: null,
      nonceB64u,
      tijdIso,
      transcriptSha256,
    };

    const priv = createPrivateKey({
      key: Buffer.from(ontvanger.geheimeSleutelPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    const antwoordSig = sign(
      null,
      Buffer.from(HANDDRUK_ANTWOORD_DOMEIN + canoniekeJson(antwoordKern), 'utf8'),
      priv,
    ).toString('base64url');

    const nuMs = Date.parse(tijdIso);
    const ttlMs = Math.max(1000, opties.sessieTtlMs ?? STENGEL_STANDAARD_SESSIE_TTL_MS);
    gelukt = true;
    return {
      ok: true,
      antwoord: { ...antwoordKern, handtekeningB64u: antwoordSig },
      sessie: {
        sessieId: afgeleid.sessieId,
        rol: 'ontvanger',
        eigenKnooppuntId: ontvanger.identiteit.knooppuntId,
        tegenpartijIdentiteit: aanvraag.vanIdentiteit,
        algoritme: gekozenAlgoritme,
        opvullingBlokGrootte: opties.opvullingBlokGrootte ?? STANDAARD_OPVULLING_BLOK,
        zendSleutel: afgeleid.sleutelOntvangerNaarInitiator,
        ontvangSleutel: afgeleid.sleutelInitiatorNaarOntvanger,
        volgendZendNummer: 0,
        gezieneOntvangNummers: new Set<number>(),
        ontvangVensterOnderGrens: 0,
        maxKadersTotSleutelWissel: Math.max(1, opties.maxKadersTotSleutelWissel ?? STENGEL_STANDAARD_MAX_KADERS),
        verlooptOpMs: (Number.isFinite(nuMs) ? nuMs : Date.now()) + ttlMs,
        gesloten: false,
      },
    };
  } catch {
    return { ok: false, fout: 'HANDDRUK_SLEUTELUITWISSELING_MISLUKT' };
  } finally {
    if (gedeeldGeheim) gedeeldGeheim.fill(0);
    if (!gelukt && afgeleid) {
      afgeleid.sleutelInitiatorNaarOntvanger.fill(0);
      afgeleid.sleutelOntvangerNaarInitiator.fill(0);
    }
  }
}

/** Крок 3 рукостискання: ініціатор перевіряє підпис отримувача за транскриптом і завершує встановлення сеансу. */
export function voltooiStengelHanddruk(
  initiator: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
  aanvraagPakket: { aanvraag: StengelHanddrukAanvraag; efemeerGeheimPkcs8B64u: string },
  antwoord: StengelHanddrukAntwoord,
  opties: {
    nuIso?: string;
    ingetrokkenKnooppuntIds?: ReadonlySet<string>;
    opvullingBlokGrootte?: number;
    maxKadersTotSleutelWissel?: number;
    sessieTtlMs?: number;
  } = {},
): { ok: true; sessie: KlimopStengelSessie } | { ok: false; fout: string } {
  if (!antwoord || antwoord.schema !== 1) return { ok: false, fout: 'ANTWOORD_ONGELDIGE_VORM' };
  const { aanvraag } = aanvraagPakket;
  if (
    antwoord.handdrukId !== aanvraag.handdrukId
    || antwoord.doelKnooppuntId !== initiator.identiteit.knooppuntId
    || antwoord.vanIdentiteit.knooppuntId !== aanvraag.doelKnooppuntId
  ) {
    return { ok: false, fout: 'ANTWOORD_KOMT_NIET_OVEREEN_MET_AANVRAAG' };
  }
  if (opties.ingetrokkenKnooppuntIds?.has(antwoord.vanIdentiteit.knooppuntId)) {
    return { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' };
  }
  if (!controleerTijdVenster(antwoord.tijdIso, opties.nuIso)) {
    return { ok: false, fout: 'HANDDRUK_TIJD_BUITEN_VENSTER' };
  }

  const { handtekeningB64u: _sigA, ...aanvraagKern } = aanvraag;
  const verwachtTranscript = createHash('sha256')
    .update(canoniekeJson({
      aanvraagKern,
      ontvangerIdentiteit: antwoord.vanIdentiteit,
      efemeerOntvanger: antwoord.efemeerX25519DerB64u,
      gekozenAlgoritme: antwoord.gekozenAlgoritme,
      nonceOntvanger: antwoord.nonceB64u,
      tijdOntvanger: antwoord.tijdIso,
    }))
    .digest('hex');

  if (verwachtTranscript !== antwoord.transcriptSha256) {
    return { ok: false, fout: 'TRANSCRIPT_HASH_KOMT_NIET_OVEREEN' };
  }

  const { handtekeningB64u: sigAntwoord, ...antwoordKern } = antwoord;
  const boodschapAntwoord = Buffer.from(HANDDRUK_ANTWOORD_DOMEIN + canoniekeJson(antwoordKern), 'utf8');
  if (!verifieerPaspoortEnHandtekening(antwoord.vanIdentiteit, boodschapAntwoord, sigAntwoord)) {
    return { ok: false, fout: 'HANDDRUK_ONTVANGER_HANDTEKENING_ONGELDIG' };
  }

  let gedeeldGeheim: Buffer | null = null;
  let afgeleid: ReturnType<typeof leidSessieSleutelsAf> | null = null;
  let gelukt = false;
  try {
    const efPriv = createPrivateKey({
      key: Buffer.from(aanvraagPakket.efemeerGeheimPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    const peerEfPub = createPublicKey({
      key: Buffer.from(antwoord.efemeerX25519DerB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    gedeeldGeheim = diffieHellman({ privateKey: efPriv, publicKey: peerEfPub });
    afgeleid = leidSessieSleutelsAf(
      gedeeldGeheim,
      verwachtTranscript,
      initiator.identiteit.knooppuntId,
      antwoord.vanIdentiteit.knooppuntId,
    );
    if (afgeleid.sessieId !== antwoord.sessieId) {
      return { ok: false, fout: 'SESSIE_ID_KOMT_NIET_OVEREEN' };
    }

    const nuMs = Date.parse(opties.nuIso ?? new Date().toISOString());
    const ttlMs = Math.max(1000, opties.sessieTtlMs ?? STENGEL_STANDAARD_SESSIE_TTL_MS);
    gelukt = true;
    return {
      ok: true,
      sessie: {
        sessieId: afgeleid.sessieId,
        rol: 'initiator',
        eigenKnooppuntId: initiator.identiteit.knooppuntId,
        tegenpartijIdentiteit: antwoord.vanIdentiteit,
        algoritme: antwoord.gekozenAlgoritme,
        opvullingBlokGrootte: opties.opvullingBlokGrootte ?? STANDAARD_OPVULLING_BLOK,
        zendSleutel: afgeleid.sleutelInitiatorNaarOntvanger,
        ontvangSleutel: afgeleid.sleutelOntvangerNaarInitiator,
        volgendZendNummer: 0,
        gezieneOntvangNummers: new Set<number>(),
        ontvangVensterOnderGrens: 0,
        maxKadersTotSleutelWissel: Math.max(1, opties.maxKadersTotSleutelWissel ?? STENGEL_STANDAARD_MAX_KADERS),
        verlooptOpMs: (Number.isFinite(nuMs) ? nuMs : Date.now()) + ttlMs,
        gesloten: false,
      },
    };
  } catch {
    return { ok: false, fout: 'HANDDRUK_SLEUTELUITWISSELING_MISLUKT' };
  } finally {
    if (gedeeldGeheim) gedeeldGeheim.fill(0);
    if (!gelukt && afgeleid) {
      afgeleid.sleutelInitiatorNaarOntvanger.fill(0);
      afgeleid.sleutelOntvangerNaarInitiator.fill(0);
    }
  }
}

function maakDeterministischeIv(richtingPrefix: 'I2R ' | 'R2I ', volgnummer: number): Buffer {
  const iv = Buffer.alloc(12);
  iv.write(richtingPrefix, 0, 4, 'ascii');
  iv.writeBigUInt64BE(BigInt(volgnummer), 4);
  return iv;
}

function kaderAad(
  sessieId: string,
  vanId: string,
  naarId: string,
  algoritme: StengelKaderAlgoritme,
  volgnummer: number,
  opvullingBlokGrootte: number,
): Buffer {
  return Buffer.from(
    `klimop-kader-v1|${sessieId}|${vanId}|${naarId}|${algoritme}|${volgnummer}|${opvullingBlokGrootte}`,
    'utf8',
  );
}

/** Вирівнює буфер до кратного блоку (щонайменше 64 байти) з 4-байтним заголовком справжньої довжини. */
export function vulKaderLadingAan(inhoud: Buffer, blokGrootte = STANDAARD_OPVULLING_BLOK): Buffer {
  const blok = Math.max(64, Math.min(4096, Math.trunc(blokGrootte)));
  const ruweLengte = 4 + inhoud.length;
  const doelLengte = Math.ceil(ruweLengte / blok) * blok;
  const uit = Buffer.alloc(doelLengte, 0);
  uit.writeUInt32BE(inhoud.length, 0);
  inhoud.copy(uit, 4);
  return uit;
}

export function verwijderKaderOpvulling(opgevuld: Buffer): Buffer {
  if (opgevuld.length < 4) throw new Error('KADER_OPVULLING_TE_KORT');
  const echteLengte = opgevuld.readUInt32BE(0);
  if (echteLengte > opgevuld.length - 4) throw new Error('KADER_LENGTE_ONGELDIG');
  return Buffer.from(opgevuld.subarray(4, 4 + echteLengte));
}

/** Шифрує корисні байти у захищений кадр «Стебла» з монотонним номером, межею зміни ключа та вирівнюванням довжини. */
export function versleutelStengelKader(sessie: KlimopStengelSessie, klareInhoud: Buffer): StengelVersleuteldKader {
  if (sessie.gesloten) throw new Error('STENGEL_SESSIE_GESLOTEN');
  const maxKaders = sessie.maxKadersTotSleutelWissel ?? STENGEL_STANDAARD_MAX_KADERS;
  if (!Number.isSafeInteger(sessie.volgendZendNummer) || sessie.volgendZendNummer >= maxKaders) {
    sluitStengelSessie(sessie);
    throw new Error('STENGEL_SLEUTELWISSEL_VEREIST');
  }
  const volgnummer = sessie.volgendZendNummer++;
  const richting: 'I2R ' | 'R2I ' = sessie.rol === 'initiator' ? 'I2R ' : 'R2I ';
  const iv = maakDeterministischeIv(richting, volgnummer);
  const opgevuld = vulKaderLadingAan(klareInhoud, sessie.opvullingBlokGrootte);
  try {
    const aad = kaderAad(
      sessie.sessieId,
      sessie.eigenKnooppuntId,
      sessie.tegenpartijIdentiteit.knooppuntId,
      sessie.algoritme,
      volgnummer,
      sessie.opvullingBlokGrootte,
    );

    if (sessie.algoritme === 'chacha20-poly1305') {
      const cipher = createCipheriv('chacha20-poly1305', sessie.zendSleutel, iv, { authTagLength: 16 });
      cipher.setAAD(aad, { plaintextLength: opgevuld.length });
      const ct = Buffer.concat([cipher.update(opgevuld), cipher.final()]);
      const tag = cipher.getAuthTag();
      return {
        schema: 1,
        sessieId: sessie.sessieId,
        vanKnooppuntId: sessie.eigenKnooppuntId,
        naarKnooppuntId: sessie.tegenpartijIdentiteit.knooppuntId,
        algoritme: sessie.algoritme,
        volgnummer,
        opvullingBlokGrootte: sessie.opvullingBlokGrootte,
        cijfertekstB64u: ct.toString('base64url'),
        authenticatieTagB64u: tag.toString('base64url'),
      };
    }

    const cipher = createCipheriv('aes-256-gcm', sessie.zendSleutel, iv);
    cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(opgevuld), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      schema: 1,
      sessieId: sessie.sessieId,
      vanKnooppuntId: sessie.eigenKnooppuntId,
      naarKnooppuntId: sessie.tegenpartijIdentiteit.knooppuntId,
      algoritme: sessie.algoritme,
      volgnummer,
      opvullingBlokGrootte: sessie.opvullingBlokGrootte,
      cijfertekstB64u: ct.toString('base64url'),
      authenticatieTagB64u: tag.toString('base64url'),
    };
  } finally {
    opgevuld.fill(0);
  }
}

/** Перевіряє автентичність, ковзне вікно захисту від повторів і розшифровує кадр «Стебла». */
export function ontsleutelStengelKader(
  sessie: KlimopStengelSessie,
  kader: StengelVersleuteldKader,
): { ok: true; klareInhoud: Buffer } | { ok: false; fout: string } {
  if (sessie.gesloten) return { ok: false, fout: 'STENGEL_SESSIE_GESLOTEN' };
  if (
    !kader
    || kader.schema !== 1
    || kader.sessieId !== sessie.sessieId
    || kader.vanKnooppuntId !== sessie.tegenpartijIdentiteit.knooppuntId
    || kader.naarKnooppuntId !== sessie.eigenKnooppuntId
    || kader.algoritme !== sessie.algoritme
  ) {
    return { ok: false, fout: 'KADER_KOP_ONGELDIG' };
  }
  const onderGrens = sessie.ontvangVensterOnderGrens ?? 0;
  const maxKaders = sessie.maxKadersTotSleutelWissel ?? STENGEL_STANDAARD_MAX_KADERS;
  if (
    !Number.isSafeInteger(kader.volgnummer)
    || kader.volgnummer < onderGrens
    || kader.volgnummer >= maxKaders
    || kader.volgnummer >= onderGrens + STENGEL_ONTVANG_VENSTER_GROOTTE * 4
    || sessie.gezieneOntvangNummers.has(kader.volgnummer)
  ) {
    return { ok: false, fout: 'HERHALING_OF_VOLGORDE_FOUT' };
  }

  const richting: 'I2R ' | 'R2I ' = sessie.rol === 'initiator' ? 'R2I ' : 'I2R ';
  const iv = maakDeterministischeIv(richting, kader.volgnummer);
  const ct = Buffer.from(kader.cijfertekstB64u, 'base64url');
  const tag = Buffer.from(kader.authenticatieTagB64u, 'base64url');
  const aad = kaderAad(
    kader.sessieId,
    kader.vanKnooppuntId,
    kader.naarKnooppuntId,
    kader.algoritme,
    kader.volgnummer,
    kader.opvullingBlokGrootte,
  );

  let opgevuld: Buffer | null = null;
  try {
    if (kader.algoritme === 'chacha20-poly1305') {
      const decipher = createDecipheriv('chacha20-poly1305', sessie.ontvangSleutel, iv, { authTagLength: 16 });
      decipher.setAAD(aad, { plaintextLength: ct.length });
      decipher.setAuthTag(tag);
      opgevuld = Buffer.concat([decipher.update(ct), decipher.final()]);
    } else {
      const decipher = createDecipheriv('aes-256-gcm', sessie.ontvangSleutel, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      opgevuld = Buffer.concat([decipher.update(ct), decipher.final()]);
    }
    const klareInhoud = verwijderKaderOpvulling(opgevuld);
    sessie.gezieneOntvangNummers.add(kader.volgnummer);
    if (kader.volgnummer >= onderGrens + STENGEL_ONTVANG_VENSTER_GROOTTE) {
      const nieuweOnderGrens = kader.volgnummer - STENGEL_ONTVANG_VENSTER_GROOTTE + 1;
      sessie.ontvangVensterOnderGrens = nieuweOnderGrens;
      for (const oud of sessie.gezieneOntvangNummers) {
        if (oud < nieuweOnderGrens) sessie.gezieneOntvangNummers.delete(oud);
      }
    }
    return { ok: true, klareInhoud };
  } catch {
    return { ok: false, fout: 'KADER_AUTHENTICATIE_MISLUKT' };
  } finally {
    if (opgevuld) opgevuld.fill(0);
  }
}

/** Закриває сеанс і затирає обидва сеансові ключі нулями в оперативній пам'яті. */
export function sluitStengelSessie(sessie: KlimopStengelSessie): void {
  sessie.gesloten = true;
  sessie.zendSleutel.fill(0);
  sessie.ontvangSleutel.fill(0);
  sessie.gezieneOntvangNummers.clear();
}

export interface StengelVerbindingRand {
  vanKnooppuntId: string;
  naarKnooppuntId: string;
  kosten: number;
  staat: 'gezond' | 'verbroken';
}

/**
 * Таблиця маршрутизації «Стебел» (§1.2, §7–§10 маніфесту):
 * знаходить найкоротший живий маршрут між вузлами (прямий або через довірений естафетний вузол),
 * обходить обірвані з'єднання та миттєво ізолює вузли, переведені до карантину.
 */
export class KlimopRouteTabel {
  private readonly randen = new Map<string, StengelVerbindingRand>();
  private readonly quarantaine = new Set<string>();

  private sleutel(vanId: string, naarId: string): string {
    return `${vanId}->${naarId}`;
  }

  voegTweerichtingsStengelToe(aId: string, bId: string, kosten = 1): void {
    this.randen.set(this.sleutel(aId, bId), { vanKnooppuntId: aId, naarKnooppuntId: bId, kosten, staat: 'gezond' });
    this.randen.set(this.sleutel(bId, aId), { vanKnooppuntId: bId, naarKnooppuntId: aId, kosten, staat: 'gezond' });
  }

  markeerStengelStaat(aId: string, bId: string, staat: 'gezond' | 'verbroken'): void {
    const r1 = this.randen.get(this.sleutel(aId, bId));
    const r2 = this.randen.get(this.sleutel(bId, aId));
    if (r1) r1.staat = staat;
    if (r2) r2.staat = staat;
  }

  plaatsInQuarantaine(knooppuntId: string): void {
    this.quarantaine.add(knooppuntId);
  }

  haalUitQuarantaine(knooppuntId: string): void {
    this.quarantaine.delete(knooppuntId);
  }

  inQuarantaineSet(): ReadonlySet<string> {
    return this.quarantaine;
  }

  /** Повертає впорядкований шлях `[vanId, ..., naarId]` або `null`, якщо жодного здорового маршруту немає. */
  kiesBesteRoute(vanId: string, naarId: string): string[] | null {
    if (this.quarantaine.has(vanId) || this.quarantaine.has(naarId)) return null;
    if (vanId === naarId) return [vanId];

    const afstand = new Map<string, number>([[vanId, 0]]);
    const vorige = new Map<string, string>();
    const bezocht = new Set<string>();

    while (true) {
      let huidig: string | null = null;
      let besteAfstand = Infinity;
      for (const [knoop, d] of afstand.entries()) {
        if (!bezocht.has(knoop) && d < besteAfstand) {
          besteAfstand = d;
          huidig = knoop;
        }
      }
      if (huidig === null) break;
      if (huidig === naarId) {
        const pad: string[] = [];
        let stap: string | undefined = naarId;
        while (stap) {
          pad.unshift(stap);
          stap = vorige.get(stap);
        }
        return pad;
      }
      bezocht.add(huidig);

      for (const rand of this.randen.values()) {
        if (rand.vanKnooppuntId !== huidig || rand.staat !== 'gezond') continue;
        if (this.quarantaine.has(rand.naarKnooppuntId)) continue;
        const nieuw = besteAfstand + rand.kosten;
        if (nieuw < (afstand.get(rand.naarKnooppuntId) ?? Infinity)) {
          afstand.set(rand.naarKnooppuntId, nieuw);
          vorige.set(rand.naarKnooppuntId, huidig);
        }
      }
    }
    return null;
  }
}
