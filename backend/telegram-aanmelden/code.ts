// TELEGRAM-AANMELDEN v1 — de «таємний код» (geheime code). Alleen op de site ingevoerd (beschermd veld), nooit in de chat.
// Opslag: Argon2id/scrypt-hash met eigen zout + serverpeper (sleutels.ts). Tijdconstante controle. Grenzen van de beheerder:
// na `pauzeNa` fouten een pauze van `pauzeMinuten`; na `uitNa` fouten staat Telegram-bevestiging uit tot een aanmelding met toegangssleutel
// (extra bevestiging met toegangssleutel op de pagina «Мої способи входу» → «Відновити»). Optionele alarmcode: lijkt te slagen, blokkeert stil en
// alarmeert de eigenaar (voor als iemand onder dwang staat).
// SEC-002 (aanv-gat-a-03): alleen de ASYNCHRONE hashfuncties (threadpool, hoogstens twee tegelijk) — nooit scrypt/Argon2 in de hoofdthread.
import { codeHashenAsync, codeKloptAsync } from './cryptografie';
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
    pauze_tot = NULL, uitgeschakeld = false, reden = '', gewijzigd_op = now()`, [userId, await codeHashenAsync(code, peper), alarmCode ? await codeHashenAsync(alarmCode, peper) : null]);
  await audit(userId, 'code.ingesteld', 'success', { alarmcode: !!alarmCode });
  return { ok: true };
}

export async function codeVerwijderen(userId: string): Promise<void> {
  await sql('DELETE FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
  await audit(userId, 'code.verwijderd', 'success');
}

/** Herstel na «te veel pogingen» of «in chat gezien» — alleen aanroepen NA een bevestiging met toegangssleutel (poort 'geheime-code'). */
export async function codeHerstellen(userId: string): Promise<void> {
  await sql("UPDATE app.tg_geheime_codes SET mislukt = 0, pauze_tot = NULL, uitgeschakeld = false, reden = '' WHERE user_id = $1 AND reden <> 'alarm'", [userId]);
  await audit(userId, 'code.hersteld', 'success');
}

export async function codeStand(userId: string): Promise<{ ingesteld: boolean; alarm: boolean; uitgeschakeld: boolean; reden: string; pauzeTot: string | null; mislukt: number }> {
  const [r] = await sql('SELECT * FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
  return r ? { ingesteld: true, alarm: !!r.alarm_hash, uitgeschakeld: !!r.uitgeschakeld, reden: String(r.reden || ''), pauzeTot: r.pauze_tot ? new Date(r.pauze_tot).toISOString() : null, mislukt: Number(r.mislukt || 0) }
    : { ingesteld: false, alarm: false, uitgeschakeld: false, reden: '', pauzeTot: null, mislukt: 0 };
}

/**
 * Controle met tellers.
 * SEC-002 (aanmelden-09, integraties-12): vroeger stond hier «FOR UPDATE», maar de code las de rij met een gewone SELECT, hashte, en
 * telde pas DAARNA: alle gelijktijdige verzoeken die vóór de eerste UPDATE lazen, werden volledig gecontroleerd — één pakket van K
 * parallelle pogingen gaf K gokken in plaats van `pauzeNa`/`uitNa`. Nu wordt de poging EERST gereserveerd in één voorwaardelijke
 * UPDATE (teller +1, alleen als de code niet uit staat, niet gepauzeerd is en de teller onder `uitNa` ligt; de pauze wordt in
 * dezelfde opdracht gezet zodra deze poging de pauzegrens bereikt). Zonder reservering geen hash. Een juiste code zet alles terug.
 */
export async function codeControleren(userId: string, code: string): Promise<CodeUitkomst> {
  const inst = await instellingen();
  const peper = await codePeper(false);
  if (!peper) return 'geen';
  const [r] = await sql(`UPDATE app.tg_geheime_codes
      SET mislukt = mislukt + 1,
          pauze_tot = CASE WHEN (mislukt + 1) >= $3 AND (mislukt + 1) % $3 = 0 THEN now() + make_interval(mins => $4) ELSE pauze_tot END
    WHERE user_id = $1 AND NOT uitgeschakeld AND (pauze_tot IS NULL OR pauze_tot <= now()) AND mislukt < $2
    RETURNING *`, [userId, inst.code.uitNa, inst.code.pauzeNa, inst.code.pauzeMinuten]);
  if (!r) {
    const [s] = await sql('SELECT uitgeschakeld, pauze_tot FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
    if (!s) return 'geen';
    if (s.uitgeschakeld) return 'uit';
    if (s.pauze_tot && new Date(s.pauze_tot).getTime() > Date.now()) return 'pauze';
    // De teller staat al op `uitNa` (een gelijktijdige poging zette hem daar): dicht, zoals na de laatste foute poging.
    await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'te-veel-pogingen' WHERE user_id = $1 AND NOT uitgeschakeld", [userId]);
    return 'uit';
  }
  const juist = await codeKloptAsync(code, peper, String(r.hash));
  const alarm = !juist && r.alarm_hash ? await codeKloptAsync(code, peper, String(r.alarm_hash)) : false;
  if (juist) {
    await sql('UPDATE app.tg_geheime_codes SET mislukt = 0, pauze_tot = NULL WHERE user_id = $1', [userId]);
    return 'ok';
  }
  if (alarm) {
    // Stil: alles dicht, eigenaar en beheer alarmeren; de aanroeper toont «gelukt».
    await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'alarm' WHERE user_id = $1", [userId]);
    for (const k of await koppelingenVanGebruiker(userId)) await standZetten(k.id, 'uitgeschakeld', 'alarmcode');
    await audit(userId, 'code.alarm', 'alarm');
    await beheerAlarm('alarmcode', { userId }, { uk: 'Використано код тривоги. Усі прив’язки Telegram цього облікового запису вимкнено.', nl: 'De alarmcode is gebruikt. Alle Telegram-koppelingen van dit account staan uit.' });
    return 'alarm';
  }
  const mislukt = Number(r.mislukt || 0); // al geteld bij de reservering hierboven
  if (mislukt >= inst.code.uitNa) {
    await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'te-veel-pogingen' WHERE user_id = $1", [userId]);
    await audit(userId, 'code.uitgeschakeld', 'denied', { mislukt });
    await siteMelding(userId, { uk: 'Таємний код заблоковано', nl: 'Geheime code geblokkeerd' }, { uk: `Таємний код уведено неправильно ${mislukt} разів. Підтвердження через Telegram вимкнено, доки ви не відновите його ключем доступу на сторінці «Способи входу».`, nl: `De geheime code is ${mislukt} keer fout ingevoerd. Bevestigen via Telegram staat uit tot u het herstelt met uw toegangssleutel op de pagina «Aanmeldmethoden».` });
    await beheerAlarm('code-uit', { userId, mislukt }, { uk: 'Таємний код заблоковано після забагатьох спроб.', nl: 'Geheime code geblokkeerd na te veel pogingen.' });
    return 'uit';
  }
  if (mislukt >= inst.code.pauzeNa && mislukt % inst.code.pauzeNa === 0) {
    // De pauze zelf staat al sinds de reservering (gelijktijdige pogingen zagen haar meteen).
    await audit(userId, 'code.pauze', 'denied', { mislukt });
    return 'pauze';
  }
  return 'fout';
}

/** De bot zag iets dat op de code lijkt in de chat: code buiten gebruik tot de gebruiker hem met een toegangssleutel wijzigt. */
export async function codeInChatGezien(userId: string): Promise<void> {
  await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'in-chat-gezien' WHERE user_id = $1 AND reden <> 'alarm'", [userId]);
  await audit(userId, 'code.in-chat', 'denied');
  await siteMelding(userId, { uk: 'Схоже, таємний код надіслали в чат', nl: 'De geheime code lijkt in de chat gestuurd' }, { uk: 'Бот видалив повідомлення. Змініть таємний код на сайті ключем доступу; доти підтвердження через Telegram вимкнено.', nl: 'De bot heeft het bericht verwijderd. Wijzig de geheime code op de site met uw toegangssleutel; tot dan staat bevestigen via Telegram uit.' });
}

/**
 * SEC-002 (aanv-gat-a-03): hashbudget per Telegram-gebruiker voor de chatcontrole hieronder (in het geheugen, één proces). Elk
 * chatbericht kostte tot tien synchrone hashes zonder enige teller; nu hoogstens CHAT_HASH_BUDGET per CHAT_HASH_VENSTER_MS.
 * Is het budget op, dan wordt er niet gehasht (de bot verwijdert een cijfercode toch al op vorm, webhook.ts).
 */
const CHAT_HASH_BUDGET = 40; // (toets g10e-toets-4: 12 was na twee gewone berichten op)
const CHAT_HASH_VENSTER_MS = 10 * 60_000;
const chatBudget = new Map<string, { start: number; n: number }>();
const budgetNemen = (bron: string, n: number): boolean => {
  const nu = Date.now();
  if (chatBudget.size > 10_000) for (const [k, v] of chatBudget) if (nu - v.start > CHAT_HASH_VENSTER_MS) chatBudget.delete(k);
  const b = chatBudget.get(bron);
  if (!b || nu - b.start > CHAT_HASH_VENSTER_MS) { if (n > CHAT_HASH_BUDGET) return false; chatBudget.set(bron, { start: nu, n }); return true; }
  if (b.n + n > CHAT_HASH_BUDGET) return false;
  b.n += n;
  return true;
};

/**
 * Lijkt dit chatbericht op de code van een van deze accounts? (tijdconstante, asynchrone hashcontrole)
 * SEC-002 (aanv-gat-a-03): alleen kandidaten met de lengte van een code volgens de instellingen (hoogstens drie: het hele bericht en
 * de eerste twee woorden), geen hash voor een code die al uit staat (in de chat gezien, te veel pogingen, alarm), en een budget per
 * Telegram-gebruiker (`bron`). Zo kan een gewone gebruiker met berichten aan de bot de server niet meer stilleggen.
 */
export async function lijktOpCodeVan(userIds: string[], tekst: string, bron = ''): Promise<string | null> {
  return (await lijktOpCode(userIds, tekst, bron)).userId;
}

/**
 * Zoals lijktOpCodeVan, plus `vermoeden`: het hashbudget was op (of de peper ontbreekt) en het bericht bevat een «codevormig» woord
 * (lengte van een code en minstens één cijfer of leesteken) — dan verwijdert de bot het bericht toch, zonder hash (webhook.ts).
 * SEC-002 (toets g10e-toets-4): kandidaten zijn ALLE woorden met de lengte van een code (plus het hele bericht), hoogstens 8 uniek —
 * een code als 4e woord van een zin wordt weer herkend; het hashen is asynchroon en in een wachtrij, dus dat kost de site niets.
 */
export async function lijktOpCode(userIds: string[], tekst: string, bron = ''): Promise<{ userId: string | null; vermoeden: boolean }> {
  const inst = await instellingen();
  const past = (w: string) => w.length >= inst.code.minLengte && w.length <= inst.code.maxLengte;
  const geheel = String(tekst || '').trim();
  const woorden = geheel.split(/\s+/).map((w) => w.replace(/^[«"'(\[:;,.!?]+|[»"')\]:;,.!?]+$/g, ''));
  const kandidaten = [...new Set([geheel, ...geheel.split(/\s+/), ...woorden].filter(past))].slice(0, 8);
  const vorm = woorden.filter(past).some((w) => /[0-9]|[^\p{L}]/u.test(w)); // leestekens rond een woord tellen niet mee
  if (!kandidaten.length) return { userId: null, vermoeden: false };
  const peper = await codePeper(false);
  if (!peper) return { userId: null, vermoeden: vorm };
  for (const userId of userIds.slice(0, 5)) {
    const [r] = await sql('SELECT hash, alarm_hash, uitgeschakeld FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
    if (!r || r.uitgeschakeld) continue;
    const hashes = [String(r.hash), ...(r.alarm_hash ? [String(r.alarm_hash)] : [])];
    if (!budgetNemen(bron || `accounts:${userIds.join(',')}`, kandidaten.length * hashes.length)) return { userId: null, vermoeden: vorm };
    for (const w of kandidaten) for (const h of hashes) if (await codeKloptAsync(w, peper, h)) return { userId, vermoeden: true };
  }
  return { userId: null, vermoeden: false };
}
