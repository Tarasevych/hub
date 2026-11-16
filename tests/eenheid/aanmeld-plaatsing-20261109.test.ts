// AANMELD-PLAATSING v1 (TELEGRAM-001, 09.11.2026) — розміщення способів входу: типова поведінка без змін, будь-яке розміщення
// адміністратора, захист від блокування, порожні «Інші способи входу» ховаються, маршрути проходять через перевірку.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { aanmeldIndeling, indelen, METHODEN, plaatsingControleren, plaatsingNormaliseren, STANDAARD_PLAATSING, verschuiven, type Plaatsing } from '../../shared/aanmeld-plaatsing/plaatsing';
import AanmeldAndereOpties from '../../src/AanmeldAndereOpties';
import { telegramRoutes } from '../../backend/telegram-aanmelden/routes';
import { ALLEEN_SESSIE, BEWAAKT } from '../../backend/telegram-aanmelden/beleid-poort';

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmeld-plaatsing');
  const J = (x: unknown) => JSON.stringify(x);
  const met = (plek: Partial<Plaatsing['plek']>, volgorde = STANDAARD_PLAATSING.volgorde): Plaatsing => ({ volgorde: [...volgorde], plek: { ...STANDAARD_PLAATSING.plek, ...plek } });
  const beide = ['google', 'telegram'] as const, alleenGoogle = ['google'] as const;

  // ------------------------------------------------ типова поведінка = як до цієї функції
  const st = indelen(STANDAARD_PLAATSING, beide);
  check('типово: Google і Telegram на головній', J(st.hoofd) === J(['google', 'telegram']));
  check('типово: GitHub, Apple, Microsoft, ключ доступу — в «Інші способи входу»', J(st.andere) === J(['github', 'apple', 'microsoft', 'passkey']));
  check('без розміщення (прапорець вимкнено / помилка) — точно старий екран', J(aanmeldIndeling(null)) === J({ hoofd: ['google', 'telegram'], andere: ['github', 'apple', 'microsoft', 'passkey'], noodGoogle: false }) && J(aanmeldIndeling(undefined)) === J(aanmeldIndeling(null)));
  check('розміщення з сервера з прапорцем, Telegram ще без ключа → Telegram не видно ніде', J(aanmeldIndeling({ zichtbaar: false, bot: '', botId: '', stand: '', soort: '', plaatsing: STANDAARD_PLAATSING })) === J({ hoofd: ['google'], andere: ['github', 'apple', 'microsoft', 'passkey'], noodGoogle: false }));

  // ------------------------------------------------ розміщення адміністратора
  const tgAndere = indelen(met({ telegram: 'andere' }), beide);
  check('Telegram у «Інші»: на головній лише Google', J(tgAndere.hoofd) === J(['google']) && tgAndere.andere[0] === 'telegram');
  const alles = indelen(met({ google: 'hoofd', telegram: 'hoofd', github: 'hoofd', apple: 'hoofd', microsoft: 'hoofd', passkey: 'hoofd' }), beide);
  check('усі на головній: робочі на головній, неробочі на головну НЕ потрапляють', J(alles.hoofd) === J(['google', 'telegram']) && J(alles.andere) === J(['github', 'apple', 'microsoft', 'passkey']));
  const volg = indelen(met({}, ['telegram', 'passkey', 'google', 'github', 'apple', 'microsoft']), beide);
  check('порядок адміністратора зберігається (Telegram перед Google)', J(volg.hoofd) === J(['telegram', 'google']) && J(volg.andere) === J(['passkey', 'github', 'apple', 'microsoft']));
  const leeg = indelen(met({ github: 'verborgen', apple: 'verborgen', microsoft: 'verborgen', passkey: 'verborgen' }), beide);
  check('усе, крім головних, приховано → «Інші» порожні', leeg.andere.length === 0 && J(leeg.hoofd) === J(['google', 'telegram']));
  const googleWeg = indelen(met({ google: 'verborgen' }), beide);
  check('Google приховано, Telegram працює → лише Telegram на головній', J(googleWeg.hoofd) === J(['telegram']) && !googleWeg.noodGoogle);
  const nood = indelen(met({ google: 'verborgen' }), alleenGoogle);
  check('запобіжник: Google приховано, а Telegram не працює → Google все одно з’являється', nood.noodGoogle && nood.hoofd[0] === 'google');

  // ------------------------------------------------ перевірка під час збереження
  check('не можна приховати всі робочі способи', J(plaatsingControleren(met({ google: 'verborgen', telegram: 'verborgen' }), beide)) === J(['GEEN_WERKENDE_METHODE']));
  check('не можна приховати Google, коли Telegram ще не працює', J(plaatsingControleren(met({ google: 'verborgen' }), alleenGoogle)) === J(['GEEN_WERKENDE_METHODE']));
  check('можна приховати Google, коли Telegram працює й видимий', plaatsingControleren(met({ google: 'verborgen' }), beide).length === 0);
  check('Google у «Інші» — теж видимий, дозволено', plaatsingControleren(met({ google: 'andere', telegram: 'verborgen' }), alleenGoogle).length === 0);

  // ------------------------------------------------ нормалізація й порядок
  const n = plaatsingNormaliseren({ volgorde: ['passkey', 'passkey', 'onzin', 'google'], plek: { google: 'verborgen', telegram: 'raar', x: 'hoofd' } });
  check('нормалізація: дублікати й невідомі відкидаються, відсутні — в кінці', J(n.volgorde) === J(['passkey', 'google', 'telegram', 'github', 'apple', 'microsoft', 'discord', 'wachtwoord']) /* IDENTITEIT-015: два нові способи в кінці */);
  check('нормалізація: неправильне місце → типове', n.plek.telegram === 'hoofd' && n.plek.google === 'verborgen' && !('x' in n.plek));
  check('нормалізація сміття → типове розміщення', J(plaatsingNormaliseren(null)) === J(STANDAARD_PLAATSING) && J(plaatsingNormaliseren('x')) === J(STANDAARD_PLAATSING));
  check('усі способи мають назву й місце', METHODEN.every((m) => STANDAARD_PLAATSING.plek[m]));
  const op = verschuiven(STANDAARD_PLAATSING, 'telegram', -1);
  check('вище/нижче: Telegram на перше місце; межі не порушуються', op.volgorde[0] === 'telegram' && verschuiven(op, 'telegram', -1) === op && J(verschuiven(STANDAARD_PLAATSING, 'wachtwoord', 1)) === J(STANDAARD_PLAATSING) /* IDENTITEIT-015: останній тепер «wachtwoord» */);

  // ------------------------------------------------ «Інші способи входу»
  check('порожній список → кнопку «Інші способи входу» не показано', renderToStaticMarkup(createElement(AanmeldAndereOpties, { lang: 'uk', ids: [] })) === '');
  const lijst = renderToStaticMarkup(createElement(AanmeldAndereOpties, { lang: 'uk', ids: ['passkey', 'github'], standaardOpen: true }));
  check('лише вибрані, у вибраному порядку', lijst.indexOf('data-aanmeld-ingang="passkey"') > 0 && lijst.indexOf('data-aanmeld-ingang="passkey"') < lijst.indexOf('data-aanmeld-ingang="github"') && !lijst.includes('"apple"'));
  const extra = renderToStaticMarkup(createElement(AanmeldAndereOpties, { lang: 'nl', ids: ['google'], extra: { google: createElement('button', { type: 'button' }, 'Aanmelden met Google') }, standaardOpen: true }));
  check('робочий спосіб (Google) у «Інші» — справжня кнопка', extra.includes('Aanmelden met Google') && extra.includes('data-aanmeld-ingang="google"'));
  check('без ids — як раніше: усі чотири', (renderToStaticMarkup(createElement(AanmeldAndereOpties, { lang: 'uk', standaardOpen: true })).match(/data-aanmeld-ingang=/g) ?? []).length === 4);

  // ------------------------------------------------ маршрути, міграція, журнал
  const r = telegramRoutes({ requireSession: async () => ({ errorCode: 'X' }), aanmeldStart: async () => ({ fout: 'X' }), aanmeldVoltooien: async () => { throw new Error('x'); }, sessiesIntrekken: async () => 0, vlagAan: async () => false } as never);
  const soort = (m: unknown) => m as Record<symbol, unknown>;
  check('збереження розміщення — через перевірку з ключем доступу (beheer-instellingen)', soort(r['POST /api/owner/telegram/beheer/plaatsing'])[BEWAAKT] === 'beheer-instellingen' || !!soort(r['POST /api/owner/telegram/beheer/plaatsing'])[BEWAAKT]);
  check('читання розміщення — лише сеанс адміністратора', !!soort(r['POST /api/owner/telegram/beheer/plaatsing-lezen'])[ALLEEN_SESSIE]);
  const mig = readFileSync('migrations/0203_aanmeld_plaatsing.sql', 'utf8');
  check('міграція 0203 повторювана й з одним рядком', mig.includes('CREATE TABLE IF NOT EXISTS app.aanmeld_plaatsing') && mig.includes('CHECK (id = 1)') && mig.includes('ENABLE ROW LEVEL SECURITY'));
  const terug = readFileSync('deploy/telegram-aanmelden-terugdraaien.sql', 'utf8');
  check('відкат прибирає таблицю й запис міграції 0203', terug.includes('app.aanmeld_plaatsing') && terug.includes("'0203_aanmeld_plaatsing'"));
  const be = readFileSync('backend/telegram-aanmelden/plaatsing.ts', 'utf8');
  check('збереження пишеться в журнал (і відмова теж)', be.includes("action: 'aanmelden.plaatsing'") && be.includes("audit('denied'") && be.includes("audit('success'"));
  check('публічна відповідь має розміщення лише з прапорцем', readFileSync('backend/telegram-aanmelden/routes.ts', 'utf8').includes('plaatsing: (await vlagHoofdschakelaar()) ? await plaatsingLezen() : null'));
  return einde();
}
