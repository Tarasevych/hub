// KLIMOP-019 (21.11.2026, хвиля 2 виправлень за незалежною перевіркою AUDIT-002):
// Стійке зберігання порогового стану випробувального вузла «Плюща».
//
// Вада, знайдена перевіркою: усі частки, підготовлені переходи епох і ключі отримання жили лише в пам'яті
// процесу, а підготовка переходу видалялася ще до відповіді, тож перезапуск чи втрачена відповідь
// залишали групу в різних епохах. Тепер стан (за бажанням) записується у файл:
//   - вміст шифрується ChaCha20-Poly1305 ключем, виведеним HKDF-SHA256 із закритого ключа ідентичності вузла;
//   - запис атомарний: тимчасовий файл із правами 0600 → fsync → перейменування;
//   - пошкоджений або чужий файл не замінюється порожнім станом — вузол відмовляється стартувати.
// Одноразові нонси FROST свідомо НЕ зберігаються: після перезапуску незавершений підпис треба почати знову.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import type { KlimopKnooppuntIdentiteit } from '../shared/klimop/kern';
import type { FeldmanVssDeel, VoorbereideEpocheStaat } from '../shared/klimop/drempelsleutels';
import type { KlimopDrempelDeelnemer, KlimopDrempelOntvangstSleutel } from '../shared/klimop/drempel-vervoer';

export interface KlimopDrempelOntvangstGeheim {
  deelnemerIndex: number;
  publiek: KlimopDrempelOntvangstSleutel;
  geheimX25519Pkcs8B64u: string;
}

export interface KlimopDrempelSamenstelling {
  deelnemers: KlimopDrempelDeelnemer[];
  samenstellingHex: string;
  deelnemerIndex: number;
}

export interface KlimopVoorbereideVerversing {
  besluitId: string;
  staat: VoorbereideEpocheStaat;
}

export interface KlimopAfgerondeVerversing {
  besluitId: string;
  besluit: 'bevestig' | 'afbreken';
  actieveEpoche: number;
  afgerondOp: string;
}

export interface KlimopDrempelKnooppuntStaat {
  schema: 1;
  drempelDelen: Record<string, FeldmanVssDeel>;
  ontvangstGeheimen: Record<string, KlimopDrempelOntvangstGeheim>;
  samenstellingen: Record<string, KlimopDrempelSamenstelling>;
  voorbereideVerversingen: Record<string, KlimopVoorbereideVerversing>;
  /** Ключ: `${setId}|${besluitId}` — дає змогу безпечно повторити підтвердження після втрати відповіді. */
  afgerondeVerversingen: Record<string, KlimopAfgerondeVerversing>;
}

export function legeDrempelStaat(): KlimopDrempelKnooppuntStaat {
  return {
    schema: 1,
    drempelDelen: {},
    ontvangstGeheimen: {},
    samenstellingen: {},
    voorbereideVerversingen: {},
    afgerondeVerversingen: {},
  };
}

const STAAT_MAGIE = Buffer.from('KLMSTAAT1', 'utf8');

function staatSleutel(knooppunt: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string }): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(knooppunt.geheimeSleutelPkcs8B64u, 'base64url'),
    Buffer.from('klimop-knooppunt-drempelstaat-v1', 'utf8'),
    Buffer.from(knooppunt.identiteit.knooppuntId, 'utf8'),
    32,
  ));
}

/** Читає й розшифровує стан; відсутній файл дає порожній стан, пошкоджений — виняток. */
export function laadDrempelStaat(
  bestand: string,
  knooppunt: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
): KlimopDrempelKnooppuntStaat {
  if (!existsSync(bestand)) return legeDrempelStaat();
  const ruw = readFileSync(bestand);
  const sleutel = staatSleutel(knooppunt);
  try {
    if (ruw.length < STAAT_MAGIE.length + 12 + 16 || !ruw.subarray(0, STAAT_MAGIE.length).equals(STAAT_MAGIE)) {
      throw new Error('KNOOPPUNT_STAAT_ONLEESBAAR');
    }
    const nonce = ruw.subarray(STAAT_MAGIE.length, STAAT_MAGIE.length + 12);
    const tag = ruw.subarray(ruw.length - 16);
    const ct = ruw.subarray(STAAT_MAGIE.length + 12, ruw.length - 16);
    const d = createDecipheriv('chacha20-poly1305', sleutel, nonce, { authTagLength: 16 });
    d.setAAD(Buffer.from(knooppunt.identiteit.knooppuntId, 'utf8'), { plaintextLength: ct.length });
    d.setAuthTag(tag);
    const open = Buffer.concat([d.update(ct), d.final()]);
    const staat = JSON.parse(open.toString('utf8')) as KlimopDrempelKnooppuntStaat;
    open.fill(0);
    if (!staat || staat.schema !== 1) throw new Error('KNOOPPUNT_STAAT_ONLEESBAAR');
    return { ...legeDrempelStaat(), ...staat };
  } catch {
    throw new Error('KNOOPPUNT_STAAT_ONLEESBAAR');
  } finally {
    sleutel.fill(0);
  }
}

/** Атомарно записує зашифрований стан (тимчасовий файл 0600 → fsync → перейменування). */
export function bewaarDrempelStaat(
  bestand: string,
  knooppunt: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
  staat: KlimopDrempelKnooppuntStaat,
): void {
  const sleutel = staatSleutel(knooppunt);
  const open = Buffer.from(JSON.stringify(staat), 'utf8');
  try {
    const nonce = randomBytes(12);
    const c = createCipheriv('chacha20-poly1305', sleutel, nonce, { authTagLength: 16 });
    c.setAAD(Buffer.from(knooppunt.identiteit.knooppuntId, 'utf8'), { plaintextLength: open.length });
    const inhoud = Buffer.concat([STAAT_MAGIE, nonce, c.update(open), c.final(), c.getAuthTag()]);
    const tijdelijk = `${bestand}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const fd = openSync(tijdelijk, 'wx', 0o600);
    try {
      writeSync(fd, inhoud);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tijdelijk, bestand);
  } finally {
    open.fill(0);
    sleutel.fill(0);
  }
}
