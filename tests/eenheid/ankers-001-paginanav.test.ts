// ANKERS-001 (15.11.2026): навігація якорів сторінки центру облікового запису (вигляд «Макет») і головне меню сайту мають
// ОКРЕМІ положення й поведінку. З IDENTITEIT-015 (14.11) обидва писали в dock.positie і modus меню сайту, тож вибір «Праворуч»
// для якорів пересував і меню сайту, і навпаки. Тепер якорі — власне поле paginaNav у налаштуваннях меню облікового запису.
//  • модель: старий запис без paginaNav отримує поточне положення й режим меню сайту (вибір людини не губиться), далі незалежно;
//  • сервер: справжні маршрути, зміна меню сайту з іншого піддомену не рухає якорі, зміна якорів на id не рухає меню сайту,
//    обидва значення переживають повторне читання (перезавантаження) і видні з іншого піддомену;
//  • двигун «Макета»: вибір положення/режиму якорів іде як positie/modus у bijWeergave (→ paginaNav), тексти uk/nl чесні.
// Ankernavigatie en sitemenu hebben elk een eigen positie en gedrag; oude records erven de huidige keuze.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs ankers-001-paginanav.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { allesTerugzetten, normaliseerRuimtes, normaliseerZijbalk, standaardZijbalk } from '../../shared/menu-model';
import { checker, nepGoogle } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('ankers-001-paginanav');

  // ================================================================ (а) модель і міграція старого запису
  {
    const oud = normaliseerZijbalk({ modus: 'dicht', dock: { positie: 'rechts' } });
    check('міграція: старий запис без paginaNav — якорі отримують поточне положення й режим меню сайту (вибір не губиться)',
      oud.paginaNav.positie === 'rechts' && oud.paginaNav.modus === 'dicht' && oud.dock.positie === 'rechts' && oud.modus === 'dicht', JSON.stringify(oud.paginaNav));
    const eigen = normaliseerZijbalk({ modus: 'open', dock: { positie: 'boven' }, paginaNav: { positie: 'onder', modus: 'auto' } });
    check('модель: власне значення якорів зберігається поруч із меню сайту й не залежить від нього',
      eigen.paginaNav.positie === 'onder' && eigen.paginaNav.modus === 'auto' && eigen.dock.positie === 'boven' && eigen.modus === 'open');
    const zipZap = normaliseerZijbalk({ ...oud, dock: { ...oud.dock, positie: 'boven' }, modus: 'open' });
    check('модель: зміна меню сайту в уже нормалізованому записі не рухає якорі (поле вже зафіксоване)',
      zipZap.paginaNav.positie === 'rechts' && zipZap.paginaNav.modus === 'dicht' && zipZap.dock.positie === 'boven');
    const onzin = normaliseerZijbalk({ dock: { positie: 'links' }, paginaNav: { positie: '<script>', modus: 'altijd', extra: 1 } });
    check('модель: підроблені значення якорів відкидаються (замість них — меню сайту), зайві поля зникають',
      onzin.paginaNav.positie === 'links' && onzin.paginaNav.modus === 'auto' && Object.keys(onzin.paginaNav).join() === 'positie,modus', JSON.stringify(onzin.paginaNav));
    const std = standaardZijbalk();
    check('модель: типовий запис має якорі ліворуч, автоматично (як меню сайту за замовчуванням)', std.paginaNav.positie === 'links' && std.paginaNav.modus === 'auto');
    const terug = allesTerugzetten({ ...eigen, dock: { ...eigen.dock, positie: 'rechts' } });
    check('модель: «Усе повернути» в меню сайту не скидає навігацію якорів (вона не частина меню сайту)',
      terug.dock.positie === 'links' && terug.paginaNav.positie === 'onder' && terug.paginaNav.modus === 'auto');
    const ruimtes = normaliseerRuimtes({ versie: 2, gebruiker: { dock: { positie: 'onder' } }, technisch: { paginaNav: { positie: 'boven', modus: 'open' } } });
    check('модель: у кожного простору (звичайний/технічний) свої якорі', ruimtes.gebruiker.paginaNav.positie === 'onder' && ruimtes.technisch.paginaNav.positie === 'boven');
  }

  // ================================================================ (б) двигун «Макета», шаблон і компонент: куди йдуть зміни, що кажуть тексти
  {
    const motor = readFileSync('src/identiteit/maquette/maquette-motor.ts', 'utf8');
    const sjabloon = readFileSync('src/identiteit/maquette/maquette-sjabloon.ts', 'utf8');
    const component = readFileSync('src/identiteit/maquette/IdentiteitMaquette.tsx', 'utf8');
    check('компонент: макет читає якорі з paginaNav, а не з dock.positie/modus меню сайту',
      component.includes('positie: zijbalk.paginaNav.positie, modus: zijbalk.paginaNav.modus') && !component.includes('positie: zijbalk.dock.positie'));
    check('компонент: зміна якорів пише лише paginaNav; dock і modus меню сайту weergaveNaarSite не чіпає',
      component.includes('paginaNav: { ...z.paginaNav,') && !/\{ dock: \{ \.\.\.z\.dock/.test(component) && !/modus: patch\.modus \} : \{\}\), \.\.\.\(patch\.positie/.test(component));
    check('тексти uk: вікно навігації каже, що положення й поведінка — лише навігація сторінки, окремо від меню сайту',
      sjabloon.includes('Положення й поведінка діють лише на навігацію цієї сторінки й зберігаються в обліковому записі окремо від меню сайту')
      && motor.includes('зміна тут не рухає меню сайту, а зміна меню сайту — цю навігацію') && !motor.includes('діють і на меню сайту'));
    check('тексти nl: те саме нідерландською', motor.includes('Positie en gedrag gelden alleen voor de navigatie van deze pagina') && !motor.includes('gelden ook voor het menu van de site'));
    check('підказка кнопки «Налаштування меню сайту» пояснює наслідок (uk/nl), кнопка веде до меню сайту',
      sjabloon.includes('data-kaart-ga=\\"menu|#menu-modus\\" title=\\"Відкриває налаштування головного меню сайту')
      && motor.includes('Opent de instellingen van het hoofdmenu van de site') && motor.includes('verandert de navigatie van deze pagina niet'));
    check('блок «Положення якорів» у розділі «Меню» більше не називає себе «демонстраційною панеллю»',
      motor.includes('dockInlineHint:"Лише навігація цієї сторінки; меню сайту не зміниться"') && motor.includes('dockInlineHint:"Alleen de navigatie van deze pagina; het sitemenu verandert niet"') && !motor.includes('демонстраційної панелі'));
  }

  // ================================================================ (в) сервер: справжні маршрути, інший піддомен, перезавантаження
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const eigenaar = `ank-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  type B = ReturnType<typeof G.browser>;
  const opslaan = (b: B, host: string, dienst: string, sidebar: unknown) => b.verzoek(host, '/api/owner/ui/sidebar/save', b.ctxBody(dienst, { sidebar }));
  const lezen = async (b: B, host: string, dienst: string) => (await b.verzoek(host, '/api/owner/ui/preferences', b.ctxBody(dienst))).data.sidebar;
  try {
    const b = G.browser();
    await b.aanmelden(`sub-ank-eig-${T}`, eigenaar, { service: 'identity', intent: 'login' });
    const id = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
    // Запис «як до ANKERS-001»: меню праворуч, згорнуте, без paginaNav (так його залишив випуск 20261114/20261115).
    const eerste = await opslaan(b, 'id.tarasevych.com', 'identity', { modus: 'dicht', dock: { positie: 'rechts' } });
    await pool.query(`update app.records set data = jsonb_set(data, '{sidebar}', $2::jsonb) where tbl='owner_ui_preferences_v1' and data->>'userId'=$1`, [id, JSON.stringify({ versie: 2, gebruiker: { versie: 1, modus: 'dicht', icoonStijl: 'kleur', dock: { positie: 'rechts', transparantie: 0, vergroting: false } } })]);
    const oud = await lezen(b, 'id.tarasevych.com', 'identity');
    check('сервер: старий запис без paginaNav читається з якорями = поточне меню сайту (праворуч, згорнуте)',
      eerste.status === 200 && oud?.paginaNav?.positie === 'rechts' && oud?.paginaNav?.modus === 'dicht' && oud?.dock?.positie === 'rechts' && oud?.icoonStijl === 'kleur', JSON.stringify(oud?.paginaNav));
    // Інший піддомен (пошта): людина ставить меню сайту зверху й «завжди розгорнуте». Клієнт надсилає увесь нормалізований запис.
    const vanMail = await opslaan(b, 'mail.tarasevych.com', 'mail', { ...oud, modus: 'open', dock: { ...oud.dock, positie: 'boven' } });
    const naMail = await lezen(b, 'id.tarasevych.com', 'identity');
    check('сервер: меню сайту, змінене на іншому піддомені, НЕ рухає якорі (вони лишаються праворуч, згорнуті)',
      vanMail.status === 200 && naMail?.dock?.positie === 'boven' && naMail?.modus === 'open' && naMail?.paginaNav?.positie === 'rechts' && naMail?.paginaNav?.modus === 'dicht',
      `${vanMail.status} ${JSON.stringify({ d: naMail?.dock?.positie, m: naMail?.modus, p: naMail?.paginaNav })}`);
    // id: людина ставить якорі знизу, «автоматично».
    const vanId = await opslaan(b, 'id.tarasevych.com', 'identity', { ...naMail, paginaNav: { positie: 'onder', modus: 'auto' } });
    const opHub = await lezen(b, 'hub.tarasevych.com', 'hub');
    check('сервер: якорі, змінені на id, НЕ рухають меню сайту; на іншому піддомені (hub) меню сайту те саме — зверху, розгорнуте',
      vanId.status === 200 && opHub?.dock?.positie === 'boven' && opHub?.modus === 'open' && opHub?.paginaNav?.positie === 'onder' && opHub?.paginaNav?.modus === 'auto',
      JSON.stringify({ d: opHub?.dock?.positie, m: opHub?.modus, p: opHub?.paginaNav }));
    // «Перезавантаження» й інший пристрій: новий набір cookie, той самий обліковий запис.
    const tweede = G.browser();
    await tweede.aanmelden(`sub-ank-eig-${T}`, eigenaar, { service: 'identity', intent: 'login' });
    const opTweede = await lezen(tweede, 'id.tarasevych.com', 'identity');
    check('сервер: після нового входу (перезавантаження, інший пристрій) обидва вибори ті самі й незалежні',
      opTweede?.dock?.positie === 'boven' && opTweede?.modus === 'open' && opTweede?.paginaNav?.positie === 'onder' && opTweede?.paginaNav?.modus === 'auto');
    const onzin = await opslaan(b, 'id.tarasevych.com', 'identity', { ...opTweede, paginaNav: { positie: 'midden', modus: 1 } });
    check('сервер: підроблене положення якорів не зберігається (замість нього — положення меню сайту)',
      onzin.status === 200 && onzin.data.sidebar?.paginaNav?.positie === 'boven' && onzin.data.sidebar?.paginaNav?.modus === 'open', JSON.stringify(onzin.data.sidebar?.paginaNav));
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar]])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }
  await closePool();
  return einde();
}
