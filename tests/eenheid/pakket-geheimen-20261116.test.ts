// СЕКРЕТИ В ПАКЕТІ ОНОВЛЕННЯ (SEC-PAKKET-001, 16.11.2026). Без браузера й бази.
// GEHEIMEN IN HET UITROLPAKKET. Zonder browser en zonder database.
//
// Скарга власника: сторінка «Оновлення» майже щоразу показувала «Схоже, у пакеті є секрети (ключі/токени/.env)».
// Розслідування (архів випуску 20261116-031827 і вся хронологія git): чинних секретів немає; попередження давали
// чотири тестові зразки в tests/eenheid/ (нереальні «ключі» для перевірки маскування). Через це справжнє
// попередження загубилося б серед хибних. Водночас перевірка знала лише 5 префіксів і пропустила б, наприклад,
// fijnmazige GitHub-PAT, age-sleutel чи Telegram-bottoken.
//
// Ця перевірка тримає три речі:
//   1. Робоче дерево (те саме, що потрапляє в пакет через git archive) не дає жодного спрацювання тієї самої
//      перевірки, що й backend/uitrol-voorcontrole.ts («geheimen»). Новий тестовий зразок треба збирати під час
//      виконання (tests/eenheid/hulp/nep-geheim.ts), інакше ця перевірка падає ще в CI, а не на сторінці оновлення.
//   2. Розширений строгий перелік ловить усі сталі префікси (на зразках, зібраних під час виконання).
//   3. Звичайний текст і зразки .env.example не дають спрацювання.
// Значення ніколи не друкуються: лише файл і вид.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { nepGeheim } from './hulp/nep-geheim';
import { pakketGeheimInhoud, pakketGeheimNaam, pakketTekstBestand, geheimenIn } from '../../shared/geheim-patronen';

// Те, чого немає в пакеті (git archive бере лише відстежувані файли; ці каталоги не відстежуються або є збіркою).
const OVERSLAAN = new Set(['.git', 'node_modules', 'dist', 'dist-server', 'rapporten', 'uitvoer', 'release', '.claude']);

function bestanden(map: string, basis = ''): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(join(map, basis))) {
    if (!basis && OVERSLAAN.has(naam)) continue;
    const rel = basis ? `${basis}/${naam}` : naam;
    const st = lstatSync(join(map, rel));
    if (st.isDirectory()) uit.push(...bestanden(map, rel));
    else if (st.isFile()) uit.push(rel);
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('pakket-geheimen-20261116');
  const wortel = process.cwd();

  // 1. Дерево без спрацювань.
  const alle = bestanden(wortel);
  const treffers: string[] = [];
  for (const f of alle) { const s = pakketGeheimNaam(f); if (s) treffers.push(`${f}: ${s}`); }
  for (const f of alle.filter(pakketTekstBestand)) {
    if (lstatSync(join(wortel, f)).size > 2 * 1024 * 1024) continue;
    const s = pakketGeheimInhoud(readFileSync(join(wortel, f), 'utf8'));
    if (s) treffers.push(`${f}: ${s}`);
  }
  check(`у дереві (${alle.length} файлів) немає нічого, що перевірка пакета вважає секретом`, treffers.length === 0,
    treffers.length ? `знайдено: ${treffers.slice(0, 20).join('; ')} — зберіть зразок через nepGeheim()` : '');

  // 2. Розширений перелік ловить сталі префікси. Зразки — нереальні, зібрані під час виконання.
  const a36 = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const h = (n: number) => 'a1b2c3d4e5f6'.repeat(20).slice(0, n); // hex
  const b = (n: number) => 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'.repeat(10).slice(0, n); // base62
  const zaken: Array<[string, string]> = [
    [nepGeheim('-----BEGIN ', 'PRIVATE KEY-----'), 'privésleutel'],
    [nepGeheim('-----BEGIN ', 'ENCRYPTED PRIVATE KEY-----'), 'privésleutel'],
    [nepGeheim('-----BEGIN ', 'OPENSSH PRIVATE KEY-----'), 'privésleutel'],
    [nepGeheim('-----BEGIN ', 'PGP PRIVATE KEY BLOCK-----'), 'privésleutel'],
    [nepGeheim('PuTTY-User', '-Key-File-3: ssh-ed25519'), 'PuTTY-sleutel'],
    [nepGeheim('[Interface]\nPrivate', 'Key = ', b(43), '='), 'WireGuard-sleutel'],
    [nepGeheim('AGE-SECRET', '-KEY-1', 'QQQQ'.repeat(15)), 'age-sleutel'],
    [nepGeheim('gh', 'p_', a36), 'GitHub-token'],
    [nepGeheim('gh', 'o_', a36), 'GitHub-token'],
    [nepGeheim('gh', 's_', a36), 'GitHub-token'],
    [nepGeheim('github', '_pat_', a36, '_', a36), 'GitHub-token'],
    [nepGeheim('gl', 'pat-', b(20)), 'GitLab-token'],
    [nepGeheim('np', 'm_', a36), 'npm-token'],
    [nepGeheim('//registry.npmjs.org/', ':_authToken=', b(36)), 'npm-configuratie'],
    [nepGeheim('pypi-AgEI', 'cHlwaS5vcmc', b(60)), 'PyPI-token'],
    [nepGeheim('dckr', '_pat_', b(27)), 'Docker-token'],
    [nepGeheim('AK', 'IA', 'ABCDEFGH23456789'), 'AWS-sleutel'],
    [nepGeheim('AS', 'IA', 'ABCDEFGH23456789'), 'AWS-sleutel'],
    [nepGeheim('Account', 'Key=', b(86), '=='), 'Azure-sleutel'],
    [nepGeheim('abc', '8Q~', b(34)), 'Azure-sleutel'],
    [nepGeheim('AI', 'za', a36.slice(0, 35)), 'Google-API-sleutel'],
    [nepGeheim('GOC', 'SPX-', a36), 'Google-OAuth-geheim'],
    [nepGeheim('ya', '29.', b(60)), 'Google-toegangstoken'],
    [nepGeheim('1//', '0', b(45)), 'Google-toegangstoken'],
    [nepGeheim('AA', 'AA', b(7), ':', b(140)), 'Firebase-sleutel'],
    [nepGeheim('LT', 'AI', b(20)), 'Alibaba-sleutel'],
    [nepGeheim('do', 'p_v1_', h(64)), 'DigitalOcean-token'],
    [nepGeheim('HR', 'KU-', b(60)), 'Heroku-sleutel'],
    [nepGeheim('v1.0', '-', h(24), '-', h(146)), 'Cloudflare-token'],
    [nepGeheim('hv', 's.', b(95)), 'HashiCorp-token'],
    [nepGeheim(b(14), '.atlas', 'v1.', b(60)), 'HashiCorp-token'],
    [nepGeheim('dp', '.pt.', b(43)), 'Doppler-token'],
    [nepGeheim('sb', 'p_', h(40)), 'Supabase-sleutel'],
    [nepGeheim('sb', '_secret_', b(32)), 'Supabase-sleutel'],
    [nepGeheim('ts', 'key-auth-', b(12), '-', b(24)), 'Tailscale-sleutel'],
    [nepGeheim('sk-', 'ant-', 'api03-', a36), 'Anthropic-sleutel'],
    [nepGeheim('sk-', 'proj-', a36, a36), 'OpenAI-sleutel'],
    [nepGeheim('sk-', 'svcacct-', a36, a36), 'OpenAI-sleutel'],
    [nepGeheim('sk-', b(20), 'T3Blbk', 'FJ', b(20)), 'OpenAI-sleutel'],
    [nepGeheim('gs', 'k_', b(52)), 'Groq-sleutel'],
    [nepGeheim('xa', 'i-', b(80)), 'xAI-sleutel'],
    [nepGeheim('h', 'f_', b(34)), 'Hugging-Face-token'],
    [nepGeheim('r', '8_', b(37)), 'Replicate-token'],
    [nepGeheim('pp', 'lx-', b(48)), 'Perplexity-sleutel'],
    [nepGeheim('xo', 'xb-', '1234567890-abcdef'), 'Slack-token'],
    [nepGeheim('https://hooks.', 'slack.com/services/', 'T0000/B0000/', b(24)), 'webhook-adres'],
    [nepGeheim('https://discord.com/api/', 'webhooks/', '123456789012345678/', b(68)), 'webhook-adres'],
    [nepGeheim('123456789', ':AA', 'Bb'.repeat(16), 'c'), 'Telegram-bottoken'],
    [nepGeheim('S', 'G.', b(22), '.', b(43)), 'SendGrid-sleutel'],
    [nepGeheim('ke', 'y-', h(32)), 'Mailgun-sleutel'],
    [nepGeheim(h(32), '-us', '12'), 'Mailchimp-sleutel'],
    [nepGeheim('S', 'K', h(32)), 'Twilio-sleutel'],
    [nepGeheim('sk', '_live_', a36), 'Stripe-sleutel'],
    [nepGeheim('wh', 'sec_', b(32)), 'Stripe-sleutel'],
    [nepGeheim('shp', 'at_', h(32)), 'Shopify-token'],
    [nepGeheim('sq0', 'csp-', b(43)), 'Square-token'],
    [nepGeheim('access_token', '$production$', h(16), '$', h(32)), 'PayPal-token'],
    [nepGeheim('sk', '.eyJ', b(60), '.', b(22)), 'Mapbox-sleutel'],
    [nepGeheim('ATA', 'TT3', b(185)), 'Atlassian-token'],
    [nepGeheim('lin', '_api_', b(40)), 'Linear-sleutel'],
    [nepGeheim('nt', 'n_', '12345678901', b(35)), 'Notion-token'],
    [nepGeheim('fi', 'gd_', b(42)), 'Figma-token'],
    [nepGeheim('PM', 'AK-', h(24), '-', h(34)), 'Postman-sleutel'],
    [nepGeheim('snt', 'rys_', b(60)), 'Sentry-token'],
    [nepGeheim('gl', 'sa_', b(32), '_', h(8)), 'Grafana-token'],
    [nepGeheim('NR', 'AK-', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0'), 'New-Relic-sleutel'],
    [nepGeheim('postgres://', 'beheer:', 'Zr8kLq2mWp4x@', 'db.mijnbedrijf.nl/prod'), 'verbindingsreeks'],
  ];
  for (const [tekst, soort] of zaken) {
    check(`строга перевірка впізнає «${soort}» (${tekst.slice(0, 6)}…)`, pakketGeheimInhoud(`x = '${tekst}';`) === soort);
    check(`повний перелік (пошуковий індекс) теж впізнає «${soort}»`, geheimenIn(tekst).includes(soort as never));
  }

  // 3. Без хибних спрацювань.
  // Звичайний код і локальні бази не блокують випуск.
  check('пароль тестової бази на 127.0.0.1 / localhost / *.test не блокує', [
    nepGeheim('postgres://', 'migratie:ci-wachtwoord-123@', '127.0.0.1:5432/x'),
    nepGeheim('postgresql://', 'u:langwachtwoord99@', 'localhost/x'),
    nepGeheim('postgres://', 'u:langwachtwoord99@', 'db.voorbeeld.test/x'),
    nepGeheim('postgres://', 'u:${WACHTWOORD}@', 'db.mijnbedrijf.nl/x'),
  ].every((x) => pakketGeheimInhoud(x) === null));
  check('SHA-1/SHA-256 у hex і UUID не є секретами', pakketGeheimInhoud(h(40) + ' ' + h(64) + ' 123e4567-e89b-12d3-a456-426614174000') === null);
  check('усі види з переліку мають хоча б один зразок у цьому тесті', new Set(zaken.map(([, s]) => s)).size >= 50);
  check('звичайний текст зі словом «token» не є секретом', pakketGeheimInhoud('Токен доступу (token) зберігається в сховищі ключів.') === null);
  check('назва змінної GITHUB_TOKEN без значення не є секретом', pakketGeheimInhoud('env: GH_TOKEN: ${{ github.token }}') === null);
  check('коротке «ghp_» без 36 знаків не є секретом', pakketGeheimInhoud(nepGeheim('gh', 'p_abc')) === null);
  check('.env.example — зразок, не секрет', pakketGeheimNaam('.env.example') === null && pakketGeheimNaam('deploy/.env.sample') === null);
  check('.env і .env.production — секрети', pakketGeheimNaam('.env') === '.env-bestand' && pakketGeheimNaam('server/.env.production') === '.env-bestand');
  check('sleutelbestand поза tests/ — секрет, у tests/ — ні', pakketGeheimNaam('deploy/tls.key') === 'sleutelbestand' && pakketGeheimNaam('tests/fixtures/x.pem') === null);
  check('Windows-шлях теж розпізнається', pakketGeheimNaam('deploy\\geheim.pem') === 'sleutelbestand');
  check('package-lock.json не перевіряється на вміст (лише хеші пакетів)', !pakketTekstBestand('package-lock.json') && pakketTekstBestand('src/a.tsx'));

  return einde();
}
