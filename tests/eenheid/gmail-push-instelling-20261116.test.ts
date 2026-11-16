// MAILPUSH-001 (16.11.2026) — миттєві сигнали Gmail: три значення Pub/Sub з оточення АБО зі «Сховища ключів» власника
// (backend/gmail-push-instelling.ts). Перевіряє: перевагу оточення, запасний шлях через сховище, перевірку форми (помилка вводу
// не вмикає watch), кеш і скидання, та що backend/index.ts більше не читає ці назви напряму з оточення.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('gmail-push-instelling-20261116');
  const g = await import('../../backend/gmail-push-instelling');
  const TOPIC = 'projects/mijn-ruimte-123/topics/gmail-push';
  const AUD = 'https://mail.tarasevych.com/api/owner/mail/google/pubsub/push';
  const SA = 'gmail-push-sender@mijn-ruimte-123.iam.gserviceaccount.com';
  let omgeving: Record<string, string> = {}, kluis: Record<string, string> = {}, kluisGelezen = 0;
  g.zetGmailPushLezer({ omgeving: async (n) => omgeving[n] || '', kluis: async (n) => { kluisGelezen += 1; return kluis[n] || ''; } });

  // vorm
  check('vorm: juiste waarden', g.gmailPushVorm('GOOGLE_GMAIL_PUBSUB_TOPIC', TOPIC) === '' && g.gmailPushVorm('GOOGLE_GMAIL_PUBSUB_AUDIENCE', AUD) === '' && g.gmailPushVorm('GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL', SA) === '');
  check('vorm: tema zonder projects/…/topics/… → TOPIC_VORM', g.gmailPushVorm('GOOGLE_GMAIL_PUBSUB_TOPIC', 'gmail-push') === 'TOPIC_VORM');
  check('vorm: audience op http, ander pad of met query → AUDIENCE_VORM', ['http://mail.tarasevych.com/api/owner/mail/google/pubsub/push', 'https://mail.tarasevych.com/', `${AUD}?x=1`].every((v) => g.gmailPushVorm('GOOGLE_GMAIL_PUBSUB_AUDIENCE', v) === 'AUDIENCE_VORM'));
  check('vorm: gewoon Gmail-adres als service account → SERVICE_ACCOUNT_VORM', g.gmailPushVorm('GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL', 'iemand@gmail.com') === 'SERVICE_ACCOUNT_VORM');

  // niets ingesteld
  let i = await g.gmailPushInstelling();
  check('niets ingesteld → niet volledig, drie keer LEEG, bron geen', !i.volledig && i.fouten.length === 3 && Object.values(i.bron).every((b) => b === 'geen') && !i.topic);

  // alleen in het Сховище ключів
  kluis = { GOOGLE_GMAIL_PUBSUB_TOPIC: TOPIC, GOOGLE_GMAIL_PUBSUB_AUDIENCE: AUD, GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL: ` ${SA} ` };
  i = await g.gmailPushInstelling();
  check('cache: binnen een minuut wordt niet opnieuw gelezen', !i.volledig);
  g.gmailPushVergeet();
  i = await g.gmailPushInstelling();
  check('alleen in het «Сховище ключів» → volledig, bron kluis, waarden getrimd', i.volledig && i.topic === TOPIC && i.serviceEmail === SA && Object.values(i.bron).every((b) => b === 'kluis'), JSON.stringify(i.bron));
  check('overzicht: alle drie namen tellen als ingesteld', JSON.stringify(await g.gmailPushNamen()) === JSON.stringify([...g.GMAIL_PUSH_NAMEN]));

  // omgeving heeft voorrang
  omgeving = { GOOGLE_GMAIL_PUBSUB_TOPIC: 'projects/ander-project-9/topics/gmail' };
  g.gmailPushVergeet(); kluisGelezen = 0;
  i = await g.gmailPushInstelling();
  check('omgeving heeft voorrang (tema), de rest uit het сховище', i.topic === 'projects/ander-project-9/topics/gmail' && i.bron.GOOGLE_GMAIL_PUBSUB_TOPIC === 'omgeving' && i.bron.GOOGLE_GMAIL_PUBSUB_AUDIENCE === 'kluis' && kluisGelezen === 2, `${kluisGelezen}`);

  // tikfout in het сховище
  omgeving = {}; kluis = { ...kluis, GOOGLE_GMAIL_PUBSUB_AUDIENCE: 'https://mail.tarasevych.com/push' };
  g.gmailPushVergeet();
  i = await g.gmailPushInstelling();
  check('tikfout in audience → niet volledig, audience leeg (watch gaat niet aan), foutcode zichtbaar', !i.volledig && i.audience === '' && i.fouten.includes('GOOGLE_GMAIL_PUBSUB_AUDIENCE:AUDIENCE_VORM'));
  check('overzicht: alleen de twee juiste namen', JSON.stringify(await g.gmailPushNamen()) === JSON.stringify(['GOOGLE_GMAIL_PUBSUB_TOPIC', 'GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL']));
  g.zetGmailPushLezer(null);

  // bron: index.ts leest de drie namen niet meer rechtstreeks
  const idx = readFileSync('backend/index.ts', 'utf8');
  check('index.ts: geen secrets.readSecret(\'GOOGLE_GMAIL_PUBSUB_…\') meer — alles via gmailPushInstelling', !/secrets\.readSecret\('GOOGLE_GMAIL_PUBSUB_/.test(idx) && (idx.match(/gmailPushInstelling\(\)/g) || []).length >= 4);
  check('index.ts: watch zonder tema → MAIL_PUSH_CONFIGURATION_MISSING; push-route zonder audience/service account → 503', idx.includes("const topic=(await gmailPushInstelling()).topic;if(!topic)throw new Error('MAIL_PUSH_CONFIGURATION_MISSING')") && idx.includes("if(!audience||!serviceEmail)return error('MAIL_PUSH_CONFIGURATION_MISSING',503);"));
  check('index.ts: «Готовність пошти» telt de waarden uit het сховище mee', idx.includes('const push=await gmailPushNamen();secretNames=[...secretNames.filter(n=>!n.startsWith(\'GOOGLE_GMAIL_PUBSUB_\')),...push]'));
  const sh = readFileSync('deploy/gmail-push-google-cloud.sh', 'utf8');
  check('Cloud Shell-script: tema, publisher-recht voor Gmail, Token Creator, push met OIDC en dezelfde audience; verwijdert niets',
    sh.includes('gmail-api-push@system.gserviceaccount.com') && sh.includes('roles/pubsub.publisher') && sh.includes('roles/iam.serviceAccountTokenCreator')
    && sh.includes('--push-auth-token-audience="$ENDPOINT"') && !/\b(delete|remove-iam-policy-binding)\b/.test(sh));
  return einde();
}
