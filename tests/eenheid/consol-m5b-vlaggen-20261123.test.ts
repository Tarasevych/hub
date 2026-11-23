// Віха M5-Б (CONSOL-001, 23.11.2026): перевірка повноти VLAG_UITLEG (63 прапорці), завершальної міграції 0335,
// нагадування VLAG_OPRUIMEN (понад 30 днів в архіві), реактивності клієнтських прапорців та спадкоємності 52 запитів на злиття.
// Mijlpaal M5-B: volledigheid van VLAG_UITLEG, migratie 0335, VLAG_OPRUIMEN-herinnering, reactieve vlaggencache en PR-erfenis.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moetVlagOpruimen, OPRUIMEN_NA_DAGEN, VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';

const RU_LETTERS = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const BEVEILIGING_VLAGGEN = [
  'gastcodes-iedereen',
  'aanmelden-passkey',
  'aanmelden-wachtwoord',
  'aanmelden-extern',
  'aanmelden-sms',
] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m5b-vlaggen-20261123');

  // 1. Повнота VLAG_UITLEG відносно всіх міграцій (0041..0329)
  const dbSleutels = new Set<string>();
  for (const f of readdirSync('migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', f), 'utf8');
    for (const m of sql.matchAll(/INSERT\s+INTO\s+app\.feature_flags[\s\S]*?;/gi)) {
      const idx = m[0].toUpperCase().indexOf('VALUES');
      if (idx >= 0) {
        for (const km of m[0].slice(idx).matchAll(/\(\s*'([a-z0-9-]+)'/g)) dbSleutels.add(km[1]);
      }
    }
  }
  const ontbrekend = [...dbSleutels].filter((k) => !VLAG_UITLEG[k]);
  check('усі прапорці з міграцій описані у VLAG_UITLEG (включно з ai-prijzen-ophalen)', dbSleutels.size >= 63 && ontbrekend.length === 0, ontbrekend.join(', '));

  const taalFouten: string[] = [];
  for (const [k, u] of Object.entries(VLAG_UITLEG)) {
    for (const veld of ['naam', 'wat', 'wanneer', 'gevolg'] as const) {
      const [uk, nl] = u[veld];
      if (!uk || uk.trim().length < 5 || !nl || nl.trim().length < 5) taalFouten.push(`${k}.${veld}: порожній текст`);
      if (RU_LETTERS.test(uk) || RU_LETTERS.test(nl)) taalFouten.push(`${k}.${veld}: заборонені літери`);
    }
  }
  check('усі записи VLAG_UITLEG мають непорожні двомовні пояснення без заборонених літер', taalFouten.length === 0, taalFouten.join(' | '));

  // 2. Завершальна міграція 0335_vlaggen_consolidatie_aan.sql
  const m0335 = readFileSync('migrations/0335_vlaggen_consolidatie_aan.sql', 'utf8');
  check(
    'міграція 0335 вмикає прикладні прапорці «Для всіх», зберігаючи 5 безпекових прапорців входу/гостьових кодів та архівні записи',
    /UPDATE\s+app\.feature_flags\s+SET\s+aan\s*=\s*true\s*,\s*standaard\s*=\s*true/i.test(m0335)
      && BEVEILIGING_VLAGGEN.every((v) => m0335.includes(`'${v}'`))
      && /gearchiveerd_op\s+IS\s+NULL/i.test(m0335)
      && !RU_LETTERS.test(m0335),
  );

  // 3. Обчислення нагадування VLAG_OPRUIMEN у Vlaggen.tsx
  const nu = Date.UTC(2026, 10, 23, 10, 0, 0);
  check('OPRUIMEN_NA_DAGEN дорівнює 30 дням', OPRUIMEN_NA_DAGEN === 30);
  check('неархівний прапорець або свіжий архів (< 30 днів) не потребує прибирання',
    !moetVlagOpruimen({ gearchiveerd: false, gearchiveerd_op: '2026-09-01T00:00:00Z' }, nu)
    && !moetVlagOpruimen({ gearchiveerd: true, gearchiveerd_op: '2026-11-10T00:00:00Z' }, nu));
  check('архівний прапорець старший за 30 днів повертає moetVlagOpruimen === true',
    moetVlagOpruimen({ gearchiveerd: true, gearchiveerd_op: '2026-10-01T00:00:00Z' }, nu));
  const vlaggenBron = readFileSync('src/vlaggen/Vlaggen.tsx', 'utf8');
  check('Vlaggen.tsx містить двомовну позначку VLAG_OPRUIMEN',
    vlaggenBron.includes('VLAG_OPRUIMEN')
    && vlaggenBron.includes('Перевірено понад 30 днів тому — готово до переведення у постійний стан коду')
    && vlaggenBron.includes('Meer dan 30 dagen geleden bevestigd — klaar om vast in de code op te nemen'));

  // 4. Реактивність клієнтських читачів при mr:vlaggen-vernieuwd
  const clientVlagBestanden = [
    'src/functievlag-lezen.ts',
    'src/afstemming-vnext/afstemming-vlag.ts',
    'src/agenda/v3/agenda-vlag.ts',
    'src/foto/foto-vlaggen.ts',
    'src/huis/huis-vlag.ts',
    'src/integraties/catalogus-vlag.ts',
    'src/mobiel-veilig/vlag.ts',
    'src/notities/notities-vlag.ts',
    'src/tech/ruimtes/ruimtes-vlag.ts',
    'src/uitrol/uitrol-vlag.ts',
    'src/verbindingen/verbindingen-vlag.ts',
    'src/accountmenu-v2/vlag.ts',
    'src/accountmenu-v3/vlag.ts',
  ];
  const zonderEvent = clientVlagBestanden.filter((p) => !readFileSync(p, 'utf8').includes('mr:vlaggen-vernieuwd'));
  check('усі оновлені клієнтські модулі прапорців реагують на подію mr:vlaggen-vernieuwd', zonderEvent.length === 0, zonderEvent.join(', '));

  // 5. Записи спадкоємності для відкритих PR (№208 і №211 samengevoegd + 50 поглинутих gesloten)
  const pr208 = readdirSync('orchestratie/verwijzingen/pr-208').some((f) => f.endsWith('-samengevoegd.json'));
  const pr211 = readdirSync('orchestratie/verwijzingen/pr-211').some((f) => f.endsWith('-samengevoegd.json'));
  const verwachteGesloten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 23, 26, 27, 37, 51, 55, 56, 73, 76, 77, 83, 86, 87, 91, 92, 94, 97, 99, 100, 101, 103, 104, 105, 108, 109, 114, 126, 133, 134, 152, 153, 154, 155, 156, 157, 158, 159, 162, 174, 175];
  const ontbrekendePrs = verwachteGesloten.filter((n) => !existsSync(`orchestratie/verwijzingen/pr-${n}`) || !readdirSync(`orchestratie/verwijzingen/pr-${n}`).some((f) => f.endsWith('-gesloten.json')));
  check('№208 і №211 мають подію samengevoegd, а всі 50 поглинутих відкритих PR — подію gesloten у verwijzingen/', pr208 && pr211 && ontbrekendePrs.length === 0, ontbrekendePrs.join(', '));

  return einde();
}
