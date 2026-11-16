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
  const zaken: Array<[string, string]> = [
    [nepGeheim('-----BEGIN ', 'PRIVATE KEY-----'), 'privésleutel'],
    [nepGeheim('-----BEGIN ', 'ENCRYPTED PRIVATE KEY-----'), 'privésleutel'],
    [nepGeheim('gh', 'p_', a36), 'GitHub-token'],
    [nepGeheim('gh', 'o_', a36), 'GitHub-token'],
    [nepGeheim('gh', 's_', a36), 'GitHub-token'],
    [nepGeheim('github', '_pat_', a36, '_', a36), 'GitHub-token'],
    [nepGeheim('AK', 'IA', 'ABCDEFGH23456789'), 'AWS-sleutel'],
    [nepGeheim('sk-', 'ant-', 'api03-', a36), 'Anthropic-sleutel'],
    [nepGeheim('sk-', 'proj-', a36, a36), 'OpenAI-sleutel'],
    [nepGeheim('xo', 'xb-', '1234567890-abcdef'), 'Slack-token'],
    [nepGeheim('AGE-SECRET', '-KEY-1', 'QQQQ'.repeat(15)), 'age-sleutel'],
    [nepGeheim('123456789', ':AA', 'Bb'.repeat(16), 'c'), 'Telegram-bottoken'],
    [nepGeheim('GOC', 'SPX-', a36), 'Google-OAuth-geheim'],
    [nepGeheim('AI', 'za', a36.slice(0, 35)), 'Google-API-sleutel'],
    [nepGeheim('np', 'm_', a36), 'npm-token'],
    [nepGeheim('sk', '_live_', a36), 'Stripe-sleutel'],
  ];
  for (const [tekst, soort] of zaken) {
    check(`строга перевірка впізнає «${soort}» (${tekst.slice(0, 6)}…)`, pakketGeheimInhoud(`x = '${tekst}';`) === soort);
    check(`повний перелік (пошуковий індекс) теж впізнає «${soort}»`, geheimenIn(tekst).includes(soort as never));
  }

  // 3. Без хибних спрацювань.
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
