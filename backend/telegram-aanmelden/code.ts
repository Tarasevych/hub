// TELEGRAM-AANMELDEN v1 — de «таємний код» (geheime code). Alleen op de site ingevoerd (beschermd veld), nooit in de chat.
// Opslag: Argon2id/scrypt-hash met eigen zout + serverpeper (sleutels.ts). Tijdconstante controle. Grenzen van de beheerder:
// na `pauzeNa` fouten een pauze van `pauzeMinuten`; na `uitNa` fouten staat Telegram-bevestiging uit tot een passkey-aanmelding
// (passkey-step-up op de pagina «Мої способи входу» → «Відновити»). Optionele alarmcode: lijkt te slagen, blokkeert stil en
// alarmeert de eigenaar (voor als iemand onder dwang staat).
import { codeHashen, codeKlopt } from './cryptografie';
import { codePeper } from './sleutels';
import { instellingen, koppelingenVanGebruiker, sql, standZetten } from './opslag';
import { audit, beheerAlarm, siteMelding } from './meldingen';
import { codeZwakte, type CodeReden } from '../../shared/telegram-aanmelden/code-sterkte';

export type CodeUitkomst = 'ok' | 'fout' | 'pauze' | 'uit' | 'alarm' | 'geen';

export async function codeInstellen(userId: string, code: string, alarmCode: string | null, telefoon: string): Promise<{ ok: true } | { ok: false; reden: CodeReden | 'ALARM_GELIJK' }> {
  const inst = await instellingen();
  const zwak = codeZwakte(code, { min: inst.code.minLengte, max: inst.code.maxLengte, telefoon });
  if (zwak) return { ok: false, reden: zwak };
  if (alarmCode) {
    if (alarmCode === code) return { ok: false, reden: 'ALARM_GELIJK' };
    const zwakAlarm = codeZwakte(alarmCode, { min: inst.code.minLengte, max: inst.code.maxLengte, telefoon });
    if (zwakAlarm) return { ok: false, reden: zwakAlarm };
  }
  const peper = await codePeper(true);
  await sql(`INSERT INTO app.tg_geheime_codes (user_id, hash, alarm_hash, mislukt, pauze_tot, uitgeschakeld, reden, gewijzigd_op)
    VALUES ($1,$2,$3,0,NULL,false,'',now()) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, alarm_hash = EXCLUDED.alarm_hash, mislukt = 0,
    pauze_tot = NULL, uitgeschakeld = false, reden = '', gewijzigd_op = now()`, [userId, codeHashen(code, peper), alarmCode ? codeHashen(alarmCode, peper) : null]);
  await audit(userId, 'code.ingesteld', 'success', { alarmcode: !!alarmCode });
  return { ok: true };
}

export async function codeVerwijderen(userId: string): Promise<void> {
  await sql('DELETE FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
  await audit(userId, 'code.verwijderd', 'success');
}

/** Herstel na «te veel pogingen» of «in chat gezien» — alleen aanroepen NA een passkey-bevestiging (poort 'geheime-code'). */
export async function codeHerstellen(userId: string): Promise<void> {
  await sql("UPDATE app.tg_geheime_codes SET mislukt = 0, pauze_tot = NULL, uitgeschakeld = false, reden = '' WHERE user_id = $1 AND reden <> 'alarm'", [userId]);
  await audit(userId, 'code.hersteld', 'success');
}

export async function codeStand(userId: string): Promise<{ ingesteld: boolean; alarm: boolean; uitgeschakeld: boolean; reden: string; pauzeTot: string | null; mislukt: number }> {
  const [r] = await sql('SELECT * FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
  return r ? { ingesteld: true, alarm: !!r.alarm_hash, uitgeschakeld: !!r.uitgeschakeld, reden: String(r.reden || ''), pauzeTot: r.pauze_tot ? new Date(r.pauze_tot).toISOString() : null, mislukt: Number(r.mislukt || 0) }
    : { ingesteld: false, alarm: false, uitgeschakeld: false, reden: '', pauzeTot: null, mislukt: 0 };
}

/** Controle met tellers. Gelijktijdige pogingen worden met FOR UPDATE na elkaar verwerkt (geen raadrace). */
export async function codeControleren(userId: string, code: string): Promise<CodeUitkomst> {
  const inst = await instellingen();
  const peper = await codePeper(false);
  const [r] = await sql('SELECT * FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
  if (!r || !peper) return 'geen';
  if (r.uitgeschakeld) return 'uit';
  if (r.pauze_tot && new Date(r.pauze_tot).getTime() > Date.now()) return 'pauze';
  const juist = codeKlopt(code, peper, String(r.hash));
  const alarm = !juist && r.alarm_hash ? codeKlopt(code, peper, String(r.alarm_hash)) : false;
  if (juist) {
    await sql('UPDATE app.tg_geheime_codes SET mislukt = 0, pauze_tot = NULL WHERE user_id = $1', [userId]);
    return 'ok';
  }
  if (alarm) {
    // Stil: alles dicht, eigenaar en beheer alarmeren; de aanroeper toont «gelukt».
    await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'alarm' WHERE user_id = $1", [userId]);
    for (const k of await koppelingenVanGebruiker(userId)) await standZetten(k.id, 'uitgeschakeld', 'alarmcode');
    await audit(userId, 'code.alarm', 'alarm');
    await beheerAlarm('alarmcode', { userId }, { uk: 'Використано код тривоги. Усі прив’язки Telegram цього акаунта вимкнено.', nl: 'De alarmcode is gebruikt. Alle Telegram-koppelingen van dit account staan uit.' });
    return 'alarm';
  }
  const [na] = await sql<{ mislukt: number }>('UPDATE app.tg_geheime_codes SET mislukt = mislukt + 1 WHERE user_id = $1 RETURNING mislukt', [userId]);
  const mislukt = Number(na?.mislukt || 0);
  if (mislukt >= inst.code.uitNa) {
    await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'te-veel-pogingen' WHERE user_id = $1", [userId]);
    await audit(userId, 'code.uitgeschakeld', 'denied', { mislukt });
    await siteMelding(userId, { uk: 'Таємний код заблоковано', nl: 'Geheime code geblokkeerd' }, { uk: `Таємний код уведено неправильно ${mislukt} разів. Підтвердження через Telegram вимкнено, доки ви не відновите його ключем доступу на сторінці «Способи входу».`, nl: `De geheime code is ${mislukt} keer fout ingevoerd. Bevestigen via Telegram staat uit tot u het herstelt met uw toegangssleutel op de pagina «Aanmeldmethoden».` });
    await beheerAlarm('code-uit', { userId, mislukt }, { uk: 'Таємний код заблоковано після забагатьох спроб.', nl: 'Geheime code geblokkeerd na te veel pogingen.' });
    return 'uit';
  }
  if (mislukt >= inst.code.pauzeNa && mislukt % inst.code.pauzeNa === 0) {
    await sql('UPDATE app.tg_geheime_codes SET pauze_tot = now() + make_interval(mins => $2) WHERE user_id = $1', [userId, inst.code.pauzeMinuten]);
    await audit(userId, 'code.pauze', 'denied', { mislukt });
    return 'pauze';
  }
  return 'fout';
}

/** De bot zag iets dat op de code lijkt in de chat: code buiten gebruik tot de gebruiker hem met een passkey wijzigt. */
export async function codeInChatGezien(userId: string): Promise<void> {
  await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'in-chat-gezien' WHERE user_id = $1 AND reden <> 'alarm'", [userId]);
  await audit(userId, 'code.in-chat', 'denied');
  await siteMelding(userId, { uk: 'Схоже, таємний код надіслали в чат', nl: 'De geheime code lijkt in de chat gestuurd' }, { uk: 'Бот видалив повідомлення. Змініть таємний код на сайті ключем доступу; доти підтвердження через Telegram вимкнено.', nl: 'De bot heeft het bericht verwijderd. Wijzig de geheime code op de site met uw toegangssleutel; tot dan staat bevestigen via Telegram uit.' });
}

/** Lijkt dit chatbericht op de code van een van deze accounts? (tijdconstante hashcontrole per woord) */
export async function lijktOpCodeVan(userIds: string[], tekst: string): Promise<string | null> {
  const peper = await codePeper(false);
  if (!peper) return null;
  const woorden = String(tekst || '').split(/\s+/).filter((w) => w.length >= 6 && w.length <= 12).slice(0, 5);
  for (const userId of userIds) {
    const [r] = await sql('SELECT hash, alarm_hash FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
    if (!r) continue;
    for (const w of woorden) if (codeKlopt(w, peper, String(r.hash)) || (r.alarm_hash && codeKlopt(w, peper, String(r.alarm_hash)))) return userId;
  }
  return null;
}
