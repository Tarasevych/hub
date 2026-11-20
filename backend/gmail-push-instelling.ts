// MAILPUSH-001 (16.11.2026) — миттєві сигнали Gmail (Google Cloud Pub/Sub) без правки файла на сервері.
// Власник: «треба зробити щоб було налаштовано». Три значення (тема Pub/Sub, audience, service account) — НЕ секрети, але досі їх
// можна було задати лише в /etc/mijn-ruimte/geheimen.env з перезапуском служби. Тепер сервер бере їх:
//   1) з оточення (geheimen.env) — як і раніше, має перевагу;
//   2) інакше зі «Сховища ключів» власника сайту (owner_vault_v1, призначення «Google») під тими самими назвами.
// Значення перевіряються за формою (тема projects/…/topics/…, audience = https-адреса цього шляху, e-mail service account Google),
// щоб помилка вводу не вмикала watch з хибною темою. Кеш 60 с; запис у сховищі скидає кеш (gmailPushVergeet).
// Nl: de drie waarden komen uit de omgeving of, als die leeg is, uit de sleutelkluis van de eigenaar (doel «Google»). Geen herstart nodig.
import { secrets } from '../server/platform';
import { alsSysteem } from '../server/platform/context';
import { eigenaarUserId } from './integraties-kluis';

export const GMAIL_PUSH_NAMEN = ['GOOGLE_GMAIL_PUBSUB_TOPIC', 'GOOGLE_GMAIL_PUBSUB_AUDIENCE', 'GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL'] as const;
export type GmailPushNaam = typeof GMAIL_PUSH_NAMEN[number];
export const GMAIL_PUSH_PAD = '/api/owner/mail/google/pubsub/push';
export type GmailPushBron = 'omgeving' | 'kluis' | 'geen';
export type GmailPushInstelling = { topic: string; audience: string; serviceEmail: string; bron: Record<GmailPushNaam, GmailPushBron>; volledig: boolean; fouten: string[] };

/** Vorm van elke waarde. Lege of afwijkende waarde = «niet ingesteld» (met een foutcode voor het overzicht). */
export function gmailPushVorm(naam: GmailPushNaam, waarde: string): string {
  const v = String(waarde || '').trim();
  if (!v) return 'LEEG';
  if (naam === 'GOOGLE_GMAIL_PUBSUB_TOPIC') return /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/topics\/[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/.test(v) ? '' : 'TOPIC_VORM';
  if (naam === 'GOOGLE_GMAIL_PUBSUB_AUDIENCE') {
    try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && u.pathname === GMAIL_PUSH_PAD && !u.search ? '' : 'AUDIENCE_VORM'; } catch { return 'AUDIENCE_VORM'; }
  }
  return /^[a-z][a-z0-9-]{4,29}@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(v) ? '' : 'SERVICE_ACCOUNT_VORM';
}

type Lezer = { omgeving: (naam: GmailPushNaam) => Promise<string>; kluis: (naam: GmailPushNaam) => Promise<string> };
const standaardLezer: Lezer = {
  omgeving: (naam) => secrets.readSecret(naam).catch(() => ''),
  kluis: async (naam) => {
    try {
      const eigenaar = await eigenaarUserId();
      if (!eigenaar) return '';
      const m = await import('./api-platform-kluis');
      return String(await alsSysteem(() => m.readOwnerVaultPlaintext(eigenaar, naam)) || '');
    } catch { return ''; }
  },
};
let lezer: Lezer = standaardLezer;
let cache: { tot: number; waarde: Promise<GmailPushInstelling> } | null = null;
/** Alleen voor tests: een eigen bron, of null = de echte. */
export const zetGmailPushLezer = (l: Lezer | null) => { lezer = l ?? standaardLezer; cache = null; };
/** Na een wijziging in het «Сховище ключів»: meteen opnieuw lezen. */
export const gmailPushVergeet = () => { cache = null; };

async function lees(): Promise<GmailPushInstelling> {
  const bron = {} as Record<GmailPushNaam, GmailPushBron>, waarde = {} as Record<GmailPushNaam, string>, fouten: string[] = [];
  for (const naam of GMAIL_PUSH_NAMEN) {
    const o = String(await lezer.omgeving(naam) || '').trim();
    if (o) { waarde[naam] = o; bron[naam] = 'omgeving'; }
    else { const k = String(await lezer.kluis(naam) || '').trim(); waarde[naam] = k; bron[naam] = k ? 'kluis' : 'geen'; }
    const f = gmailPushVorm(naam, waarde[naam]);
    if (f) { fouten.push(`${naam}:${f}`); waarde[naam] = ''; }
  }
  return { topic: waarde.GOOGLE_GMAIL_PUBSUB_TOPIC, audience: waarde.GOOGLE_GMAIL_PUBSUB_AUDIENCE, serviceEmail: waarde.GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL, bron, volledig: fouten.length === 0, fouten };
}
export function gmailPushInstelling(): Promise<GmailPushInstelling> {
  const nu = Date.now();
  if (cache && cache.tot > nu) return cache.waarde;
  const waarde = lees();
  cache = { tot: nu + 60_000, waarde };
  waarde.catch(() => { cache = null; });
  return waarde;
}
/** De namen die «ingesteld» zijn (omgeving of kluis, juiste vorm) — voor het overzicht «Готовність пошти» (mailProviderReadiness). */
export async function gmailPushNamen(): Promise<string[]> {
  const i = await gmailPushInstelling();
  return GMAIL_PUSH_NAMEN.filter((n) => !i.fouten.some((f) => f.startsWith(`${n}:`)));
}
