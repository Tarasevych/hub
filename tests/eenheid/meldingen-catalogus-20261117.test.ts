// СТОРОЖ ЄДИНОГО РЕЄСТРУ СПОВІЩЕНЬ / WACHTER VAN HET ENE MELDINGENREGISTER (17.11.2026)
// Вимога власника: усі сповіщення сайту в одному файлі (shared/meldingen-catalogus.ts), а не розкидані по коду.
// Що тримає цей тест:
//   1. Кожне місце в коді, яке створює сповіщення (дзвіночок, Telegram, лист, розширення, сторінка, журнал), є в реєстрі
//      з тим самим каналом, файлом і видом. Нове сповіщення без рядка в реєстрі → тест червоний.
//   2. Кожен рядок реєстру має живе місце в коді (немає «мертвих» записів після переїзду чи видалення).
//   3. Кожен вид із shared/melding-soorten.ts або має відправника в реєстрі, або стоїть у запасі (MELDING_SOORTEN_IN_RESERVE).
//   4. Кожен підвид backend/beveiliging-meldingen.ts є окремим рядком.
//   5. Рядки повні: унікальний id, відома група (shared/melding-typen.ts), відома схема, заголовок українською й нідерландською.
//   6. Регресія: сторож справді ловить нове сповіщення поза реєстром (штучна вставка).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { MELDINGEN, MELDING_SCHEMAS, MELDING_SOORTEN_IN_RESERVE, type MeldingItem } from '../../shared/meldingen-catalogus';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { MELDING_TYPES } from '../../shared/melding-typen';
// @ts-expect-error — .mjs без типів / zonder typen
import { zoek } from '../../scripts/meldingen-zoeken.mjs';

type Vondst = { kanaal: string; bestand: string; regel: number; soort: string; titel: string };
const sleutel = (x: { kanaal: string; bestand: string; soort: string }) => `${x.kanaal}|${x.bestand}|${x.soort}`;

export function ontbrekend(vondsten: Vondst[], register: readonly MeldingItem[]): Vondst[] {
  const bekend = new Set(register.map(sleutel));
  return vondsten.filter((v) => !bekend.has(sleutel(v)));
}

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-catalogus');
  const vondsten = zoek() as Vondst[];

  // 1
  const mis = ontbrekend(vondsten, MELDINGEN);
  check(`усі ${vondsten.length} місць у коді є в реєстрі${mis.length ? ` — бракує: ${mis.slice(0, 8).map((v) => `${v.bestand}:${v.regel} ${v.kanaal}/${v.soort}`).join('; ')}` : ''}`, mis.length === 0);
  check('ревізія знаходить усі канали (дзвіночок, сторінки, сигнали смуг, журнал, розширення, Telegram, лист)',
    ['bel', 'toast', 'pagina', 'activiteit', 'extensie', 'telegram', 'email'].every((k) => vondsten.some((v) => v.kanaal === k)));
  check('ревізія не губить виклики: не менше 250 місць', vondsten.length >= 250);
  check('жоден вид у коді не лишився нерозпізнаним («?»)', !vondsten.some((v) => v.soort === '?'));

  // 2
  const inCode = new Set(vondsten.map(sleutel));
  const dood = MELDINGEN.filter((m) => !m.sub && !inCode.has(sleutel(m)));
  check(`немає мертвих рядків реєстру${dood.length ? ` — ${dood.slice(0, 6).map((m) => m.id).join(', ')}` : ''}`, dood.length === 0);

  // 3
  const gebruikt = new Set(MELDINGEN.filter((m) => ['bel', 'telegram', 'email'].includes(m.kanaal)).map((m) => m.soort));
  const zonder = Object.keys(MELDING_SOORTEN).filter((k) => !gebruikt.has(k) && !MELDING_SOORTEN_IN_RESERVE.includes(k));
  check(`кожен вид із melding-soorten має відправника або стоїть у запасі${zonder.length ? ` — ${zonder.join(', ')}` : ''}`, zonder.length === 0);
  check('запас не містить видів, які вже хтось надсилає', MELDING_SOORTEN_IN_RESERVE.every((k) => !gebruikt.has(k)));
  check('кожен вид реєстру (дзвіночок) відомий у melding-soorten.ts',
    MELDINGEN.filter((m) => m.kanaal === 'bel').every((m) => Object.prototype.hasOwnProperty.call(MELDING_SOORTEN, m.soort)));

  // 4
  const bm = readFileSync(join(process.cwd(), 'backend/beveiliging-meldingen.ts'), 'utf8');
  const subs = [...bm.matchAll(/^\s+'([a-z-]+)':\s*\(/gm)].map((m) => m[1]);
  const regSubs = new Set(MELDINGEN.filter((m) => m.sub).map((m) => m.sub));
  check(`усі ${subs.length} підвиди безпекових сповіщень є окремими рядками`, subs.length >= 20 && subs.every((s) => regSubs.has(s)) && regSubs.size === subs.length);

  // 5
  const ids = MELDINGEN.map((m) => m.id);
  check('id унікальні', new Set(ids).size === ids.length);
  check('група кожного рядка відома', MELDINGEN.every((m) => Object.prototype.hasOwnProperty.call(MELDING_TYPES, m.type)));
  check('схема кожного рядка відома', MELDINGEN.every((m) => Object.prototype.hasOwnProperty.call(MELDING_SCHEMAS, m.schema)));
  check('заголовок кожного рядка є українською й нідерландською', MELDINGEN.every((m) => m.titel[0].trim().length > 2 && m.titel[1].trim().length > 2));
  check('технічна група лише в технічних подій (немає технічного в особистому дзвіночку)',
    MELDINGEN.filter((m) => m.kanaal === 'bel' && m.type.startsWith('tech.')).every((m) => (MELDING_SOORTEN as Record<string, { type: string }>)[m.soort]?.type.startsWith('tech.')));
  check('небезпечний рівень не в звичайних тостах сторінок', MELDINGEN.filter((m) => m.kanaal === 'toast').every((m) => m.niveau !== 'gevaar'));
  check('кожна схема має значки й кнопки обома мовами', Object.values(MELDING_SCHEMAS).every((s) => s.emblemen.length >= 4 && s.knoppen.every((k) => k[0] && k[1])));

  // 6 — регресія: штучне нове сповіщення поза реєстром ловиться
  const nep: Vondst = { kanaal: 'bel', bestand: 'backend/nieuw-bestand.ts', regel: 1, soort: 'security', titel: 'Нове' };
  check('штучне сповіщення поза реєстром ловиться', ontbrekend([...vondsten, nep], MELDINGEN).length === mis.length + 1);
  return einde();
}
