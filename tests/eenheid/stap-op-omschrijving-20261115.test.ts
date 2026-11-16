// STAPOP-OMSCHR-001 (15.11.2026) — тест-сторож вікна «Підтвердіть доступ».
// Павло побачив: «⚠ Що ви підтверджуєте: Дія: /api/owner/connector-v2/activeer-tech — сайт не знає її опису». Причина: новий
// маршрут з підтвердженням з'явився без запису в shared/stap-op-beschrijving.ts, і ніщо цього не помітило.
// Цей тест:
//   (1) знаходить у backend/ КОЖЕН маршрут, що може відповісти 403 STEP_UP_REQUIRED / STEP_UP_STRONG_REQUIRED (hulp/stap-op-routes.ts),
//       і вимагає для нього опис українською й нідерландською з наслідком — так само, як його складає вікно
//       (beschrijfStapOp(actieVoorPad(pad), pad));
//   (2) перевіряє тексти activeer-tech для кожного варіанта кнопки (для якого ШІ, на який строк, що вмикається, як вимкнути);
//   (3) перевіряє, що без опису вікно не показує сиру адресу API як головний текст — лише дрібно в «Подробицях»;
//   (4) перевіряє, що опис не послаблює перевірку: actieVoorPad для цих маршрутів не змінився (те, що не можна запам'ятовувати,
//       лишається 'onbekend').
// Без мережі й бази. Запуск: node scripts/eenheidstests.mjs stap-op-omschrijving-20261115.test.ts
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { onopgelosteSjablonen, routesMetStapOp } from './hulp/stap-op-routes';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { beschrijfStapOp, verzoekKern } from '../../shared/stap-op-beschrijving';

const KYRILLISCH = /[Ѐ-ӿ]/;
/** Механізм самого підтвердження (не дії, що його вимагають): вікно для них ніколи не відкривається (client.ts їх виключає). */
const MECHANISME = [/\/api\/owner\/access\/stap-op(\/|$)/, /\/api\/owner\/identity\/transactions\//];
/** Маршрути, де підтвердження вимагає допоміжна функція, якої пошук у тексті маршруту не бачить. */
const EXTRA = [{ methode: 'POST', pad: '/api/impersonatie/toestaan', voorbeeld: '/api/impersonatie/toestaan', bestand: 'backend/impersonatie.ts' }];

export async function main(): Promise<number> {
  const { check, einde } = checker('stap-op-omschrijving-20261115');

  // ------------------------------------------------------------------ (1) кожен маршрут з підтвердженням має опис
  const gevonden = routesMetStapOp('backend');
  const routes = [...gevonden, ...EXTRA].filter((r) => !MECHANISME.some((re) => re.test(r.pad)));
  check('пошук бачить маршрути з підтвердженням (≥ 100), серед них activeer-tech, toepassen і sleutelkluis/inschakelen',
    gevonden.length >= 100 && ['/api/owner/connector-v2/activeer-tech', '/api/owner/connector-v2/toepassen', '/api/owner/sleutelkluis/inschakelen'].every((p) => gevonden.some((r) => r.pad === p)),
    `знайдено ${gevonden.length}`);
  check('усі адреси маршрутів розібрано (жодного нерозв’язаного ${…})', onopgelosteSjablonen('backend').length === 0, onopgelosteSjablonen('backend').join('; '));
  const zonder: string[] = [];
  const slecht: string[] = [];
  for (const r of routes) {
    const b = beschrijfStapOp(actieVoorPad(r.voorbeeld), r.voorbeeld);
    if (!b.bekend) { zonder.push(`${r.methode} ${r.pad} (${r.bestand})`); continue; }
    if (!KYRILLISCH.test(b.uk) || !KYRILLISCH.test(b.gevolgUk) || KYRILLISCH.test(b.nl) || KYRILLISCH.test(b.gevolgNl)
      || b.uk.length < 8 || b.nl.length < 8 || b.gevolgUk.length < 15 || b.gevolgNl.length < 15 || /\/api\//.test(b.uk + b.nl)) slecht.push(`${r.pad}: «${b.uk}» / «${b.nl}»`);
  }
  check(`кожен маршрут з підтвердженням (${routes.length}) має опис у реєстрі — новий маршрут без опису додайте в shared/stap-op-beschrijving.ts`,
    zonder.length === 0, zonder.join('\n      '));
  check('кожен опис — українською (кирилиця) і нідерландською (без кирилиці), з наслідком, без адреси API в головному тексті',
    slecht.length === 0, slecht.join('\n      '));

  // ------------------------------------------------------------------ (2) activeer-tech: усі варіанти кнопки
  const AT = '/api/owner/connector-v2/activeer-tech';
  const at = (body: Record<string, unknown>) => beschrijfStapOp(actieVoorPad(AT), AT, verzoekKern(body));
  const einde_ = at({ actie: 'alles-aan', agent: 'claude', verbindingId: 'g-1', termijn: 'tot-technisch-einde' });
  const uur = at({ actie: 'alles-aan', agent: 'claude', verbindingId: 'g-1', termijn: 'tijd', minuten: 60 });
  const zonderKoppeling = at({ actie: 'alles-aan', agent: 'gpt', termijn: 'tot-technisch-einde' });
  const eigen = at({ actie: 'dienst-eigen', agent: 'claude' });
  const gedeeld = at({ actie: 'dienst-gedeeld', agent: 'claude' });
  const kaal = at({});
  check('activeer-tech «Дозволити до кінця сеансу»: для якого ШІ, на який строк, що ШІ зможе, як вимкнути; з попередженням',
    einde_.bekend && einde_.gevaar && einde_.uk === 'Дозволити ШІ Claude працювати в технічному просторі до кінця технічного сеансу'
    && /технічні інструменти сайту й сервера/.test(einde_.gevolgUk) && /«Завжди» спрацюють без вашого кліку/.test(einde_.gevolgUk)
    && /Залишити лише звичайний простір/.test(einde_.gevolgUk) && /інші ШІ цього доступу не отримують/.test(einde_.gevolgUk)
    && /De AI Claude laten werken in de technische ruimte tot het einde van de technische sessie/.test(einde_.nl) && /Alleen gewone ruimte laten/.test(einde_.gevolgNl),
    JSON.stringify(einde_));
  check('activeer-tech «На 1 год»: строк у назві обома мовами', /на 1 год$/.test(uur.uk) && /voor 1 uur$/.test(uur.nl), `${uur.uk} / ${uur.nl}`);
  check('activeer-tech без конкретного підключення: чесно — дозвіл може діяти для всіх підключень ШІ (сервер бере «*»), не «лише цей ШІ»',
    /ChatGPT/.test(zonderKoppeling.uk) && /для всіх ваших підключень ШІ/.test(zonderKoppeling.gevolgUk) && !/інші ШІ цього доступу не отримують/.test(zonderKoppeling.gevolgUk)
    && /voor al uw AI-koppelingen/.test(zonderKoppeling.gevolgNl), zonderKoppeling.gevolgUk);
  check('activeer-tech «Увімкнути (окремі дані / спільно)»: служба «Підключення ШІ» у технічному просторі, як від’єднати',
    /окремі дані/.test(eigen.uk) && /спільно з особистим/.test(gedeeld.uk) && /Від’єднати службу/.test(eigen.gevolgUk) && /Dienst losmaken/.test(gedeeld.gevolgNl) && eigen.gevaar,
    `${eigen.uk} / ${gedeeld.uk}`);
  check('activeer-tech без полів запиту (типово alles-aan): усе одно зрозумілий опис, без адреси', kaal.bekend && /технічному просторі/.test(kaal.uk) && !kaal.technisch);
  check('опис activeer-tech однаковий у вікні й у тесті: вікно передає поля запиту (stap-op.ts → verzoekKern → beschrijfStapOp)',
    readFileSync('src/platform/stap-op.ts', 'utf8').includes('verzoek: verzoekKern(b)') && readFileSync('src/platform/bevestig-toegang.tsx', 'utf8').includes('beschrijfStapOp(opties.actie, opties.pad, opties.verzoek)'));
  const kern = verzoekKern({ actie: 'alles-aan', agent: 'claude', verbindingId: 'x', waarde: 'GEHEIM-123', tabContext: 't', reden: '<b>x</b>', termijn: 'Tijd!!' });
  check('verzoekKern бере лише відомі поля й значення: жодних секретів чи довільного тексту із запиту',
    JSON.stringify(kern) === JSON.stringify({ actie: 'alles-aan', agent: 'claude', verbinding: true }) && !JSON.stringify(kern).includes('GEHEIM'), JSON.stringify(kern));
  check('невідомий слаг ШІ не потрапляє в текст', !/evil/.test(at({ actie: 'alles-aan', agent: 'evil-ai' }).uk));

  // ------------------------------------------------------------------ варіанти інших кнопок
  const blok = beschrijfStapOp('onbekend', '/api/owner/ai/block', verzoekKern({ userId: 'u', unblock: true }));
  const blokkeer = beschrijfStapOp('onbekend', '/api/owner/ai/block', verzoekKern({ userId: 'u' }));
  check('ai/block: «Розблокувати» і «Заблокувати» — різні тексти за полем запиту', /^Розблокувати/.test(blok.uk) && /^Заблокувати/.test(blokkeer.uk) && /відкликано/.test(blokkeer.gevolgUk));

  // ------------------------------------------------------------------ (3) запасний вигляд без опису
  const o = beschrijfStapOp('onbekend', '/api/owner/iets/nieuws?x=1');
  check('без опису: зрозуміле попередження, адреса API НЕ в головному тексті, лише в technisch (без ?query)',
    !o.bekend && o.gevaar && !/\/api\//.test(o.uk + o.nl + o.gevolgUk + o.gevolgNl) && /не має опису/.test(o.uk) && /скасуйте/.test(o.gevolgUk)
    && o.technisch === '/api/owner/iets/nieuws' && /geen beschrijving/.test(o.nl), JSON.stringify(o));
  const venster = readFileSync('src/platform/bevestig-toegang.tsx', 'utf8');
  check('вікно показує технічну адресу дрібно в згорнутих «Подробицях» (details/summary), не в рядку «Що ви підтверджуєте»',
    /\{wat\.technisch && <details className='bevestig-toegang-details'/.test(venster) && venster.includes("details: ['Подробиці для перевірки', 'Details om te controleren']")
    && /\.bevestig-toegang-details\{[^}]*font-size:\.76rem/.test(readFileSync('src/platform/bevestig-toegang.css', 'utf8')));

  // ------------------------------------------------------------------ (4) перевірку не послаблено
  check('actieVoorPad не змінився для нових описів: activeer-tech, ai/grants, sleutelkluis, apps/geheimen лишаються «onbekend» (ніколи не запам’ятовуються)',
    ['/api/owner/connector-v2/activeer-tech', '/api/owner/ai/grants/add', '/api/owner/sleutelkluis/inschakelen', '/api/owner/apps/geheimen/x1/invullen', '/api/ssh-ca/uitgifte'].every((p) => actieVoorPad(p) === 'onbekend'));

  return einde();
}
