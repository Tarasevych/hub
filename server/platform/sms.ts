// IDENTITEIT-015 (крок «aanmelden», етап 3.9): надсилання SMS через провайдера ЗА ІНТЕРФЕЙСОМ.
// Sms versturen via een aanbieder achter één interface. Eerste echte aanbieder: Twilio (REST, Basic-authenticatie).
//
// Звідки ключ: зі сховища секретів ВЛАСНИКА сайту («API та інтеграції» → «Сховище секретів», api.tarasevych.com/?service=api&tab=vault),
// запис із назвою SMS_AANBIEDER (призначення «Інше»), значення `twilio|<Account SID>|<Auth Token>|<номер відправника +…>`.
// Читає його backend (registreerSmsSleutelLezer у backend/toegangslaag.ts) — цей модуль платформи не знає про сховище.
// Без ключа smsAanbieder() повертає null, і маршрут чесно каже «потребує налаштування власника» з точною передумовою
// (SMS_VOORWAARDE). У тестах — підроблений провайдер (zetSmsAanbiederVoorTest); назовні нічого не йде.
// Код і номер ніколи не потрапляють у журнал: у відповідь іде лише id повідомлення провайдера.

export type SmsUitkomst = { ok: true; id: string } | { ok: false; code: 'NIET_INGESTELD' | 'AANBIEDER_WEIGERT' | 'NETWERK' | 'NUMMER_ONGELDIG' };
export interface SmsAanbieder {
  readonly naam: string;
  verstuur(naar: string, tekst: string): Promise<SmsUitkomst>;
}

/** Назва запису в сховищі секретів власника. Naam van de sleutel in de kluis van de eigenaar. */
export const SMS_KLUIS_NAAM = 'SMS_AANBIEDER';
/** Точна передумова для людини й для відомості. Exacte voorwaarde voor de mens en de verantwoording. */
export const SMS_VOORWAARDE: readonly [string, string] = Object.freeze([
  'Потрібне налаштування власника сайту: у «API та інтеграції» → «Сховище секретів» додати ключ SMS_AANBIEDER (призначення «Інше») у форматі twilio|<Account SID>|<Auth Token>|<номер відправника +…> і ввімкнути прапорець «Підтвердження номера кодом із SMS» (aanmelden-sms).',
  'Instelling van de site-eigenaar nodig: in «API en integraties» → «Geheimenkluis» de sleutel SMS_AANBIEDER toevoegen (doel «Overig») als twilio|<Account SID>|<Auth Token>|<afzendernummer +…> en de vlag «Telefoonnummer bevestigen met sms-code» (aanmelden-sms) aanzetten.',
]) as readonly [string, string];

/** Міжнародний формат E.164: «+», код країни, разом 8–15 цифр. */
export const isTelefoonnummer = (v: unknown): v is string => typeof v === 'string' && /^\+[1-9]\d{7,14}$/.test(v);
/** Для показу: лише останні 3 цифри. Voor weergave: alleen de laatste 3 cijfers. */
export const nummerMasker = (v: string): string => (v.length > 5 ? `${v.slice(0, 3)}${'•'.repeat(Math.max(3, v.length - 6))}${v.slice(-3)}` : '•••');

export type SmsConfig = { soort: 'twilio'; accountSid: string; token: string; van: string };
/** Розбір значення з сховища; null — формат не той (нічого не надсилаємо). */
export function smsConfigLezen(waarde: string): SmsConfig | null {
  const [soort, sid, token, van] = String(waarde || '').trim().split('|').map((x) => x.trim());
  if (soort !== 'twilio') return null;
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid || '') || !/^[A-Za-z0-9]{16,64}$/.test(token || '') || !isTelefoonnummer(van)) return null;
  return { soort: 'twilio', accountSid: sid, token, van };
}

/** Twilio REST API (Messages.json). basis — для тестів зі своїм сервером; типово справжня адреса. */
export function twilioAanbieder(cfg: SmsConfig, basis = String(process.env.SMS_TWILIO_BASIS || 'https://api.twilio.com').replace(/\/+$/, '')): SmsAanbieder {
  return {
    naam: 'twilio',
    async verstuur(naar, tekst) {
      if (!isTelefoonnummer(naar)) return { ok: false, code: 'NUMMER_ONGELDIG' };
      try {
        const r = await fetch(`${basis}/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
          method: 'POST',
          headers: { authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({ To: naar, From: cfg.van, Body: tekst.slice(0, 300) }).toString(),
          signal: AbortSignal.timeout(10_000),
        });
        const data = (await r.json().catch(() => null)) as { sid?: string } | null;
        if (!r.ok || !data?.sid) return { ok: false, code: 'AANBIEDER_WEIGERT' };
        return { ok: true, id: String(data.sid).slice(0, 64) };
      } catch {
        return { ok: false, code: 'NETWERK' };
      }
    },
  };
}

let testAanbieder: SmsAanbieder | null | undefined;
let sleutelLezer: (() => Promise<string>) | null = null;
/** Лише для тестів: підроблений провайдер (null — «не налаштовано»; undefined — звичайний шлях). */
export function zetSmsAanbiederVoorTest(a: SmsAanbieder | null | undefined): void { testAanbieder = a; }
/** backend реєструє читання ключа зі сховища власника. */
export function registreerSmsSleutelLezer(fn: () => Promise<string>): void { sleutelLezer = fn; }

/** Налаштований провайдер або null («потребує налаштування власника»). */
export async function smsAanbieder(): Promise<SmsAanbieder | null> {
  if (testAanbieder !== undefined) return testAanbieder;
  if (!sleutelLezer) return null;
  const cfg = smsConfigLezen(await sleutelLezer().catch(() => ''));
  return cfg ? twilioAanbieder(cfg) : null;
}
