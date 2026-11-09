// TELEGRAM-001 (09.11.2026) — гілки з нідерландським префіксом (functie/herstel/controle) приймаються всюди, де перевіряється
// гілка завдання: спільна перевірка журналу розробки (сайт), упаковка і системний інсталятор. Політику (beleid.json, takPatroon)
// змінює лише власник через рішення правил із ключем доступу — тут лише перевіряємо, що давні імена там і далі дійсні.
// Давні імена (feature/fix/audit/release) лишаються дійсними. Takken met een Nederlands voorvoegsel zijn overal geldig.
import { readFileSync } from 'node:fs';
import { TAK } from '../../shared/ontwikkelarchief';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
const { check: controle, einde } = checker('tak-namen-nederlands');

const goed = ['functie/telegram-aanmelden-20261109-151500', 'herstel/aanmelden-20261109-151500', 'controle/beveiliging-20261109-151500',
  'feature/telegram-001-20261109-134807', 'fix/a-20261101-000000', 'audit/b-20261101-000000', 'release/c-20261101-000000'];
const slecht = ['telegram-aanmelden-op-105221', 'functie/Telegram-20261109-151500', 'kenmerk/x-20261109-151500', 'functie/x-2026110-151500', 'integratie', 'functie/-20261109-151500'];

const beleid = JSON.parse(readFileSync('orchestratie/beleid.json', 'utf8'));
const beleidRe = new RegExp(beleid.takPatroon);
const pakket = readFileSync('scripts/orch/pakket.mjs', 'utf8');
const pakketRe = new RegExp((pakket.match(/const ONTWIKKEL_TAK = \/(.+)\/;/) ?? [])[1] ?? 'x^');
const sh = readFileSync('deploy/uitrol/mijn-ruimte-uitrol.sh', 'utf8');
const shBron = (sh.match(/re\.fullmatch\(r'(\([a-z|]+\)\/\[a-z0-9-\]\+-\\d\{8\}-\\d\{6\})',tak\)/) ?? [])[1] ?? 'x^';
const shRe = new RegExp(`^${shBron}$`);

for (const t of goed) {
  controle(`спільна перевірка приймає ${t}`, TAK.test(t));
  if (!/^(functie|herstel|controle)\//.test(t)) controle(`beleid.json приймає ${t}`, beleidRe.test(t));
  controle(`упаковка приймає ${t}`, pakketRe.test(t));
  controle(`системний інсталятор приймає ${t}`, shRe.test(t));
}
for (const t of slecht) {
  controle(`спільна перевірка відхиляє ${t}`, !TAK.test(t));
  controle(`beleid.json відхиляє ${t}`, !beleidRe.test(t));
  controle(`упаковка відхиляє ${t}`, !pakketRe.test(t));
}
controle('системний інсталятор знає functie/', shBron.includes('functie'));

return einde();
}
