// MAILANKER-001 (15.11.2026): меню якорів пошти отримує всі пункти лівого меню пошти (теки, «Написати лист», «Редагувати меню»,
// «Більше» з додатковими теками, «Керування мітками», «Створити нову мітку», мітки користувача), а колишні пункти
// («Фільтри списку», «Подання списку», «Дії скриньки») згорнуто в групу «Вигляд і дії».
//  • модель: склад і порядок збігаються з бічним меню, враховують «Редагувати меню» (зона/порядок/видимість) і «пам'ять стану»;
//  • буфер налаштувань більше не губить seenUnread (після F5 лічильники переглянутих тек не поверталися б);
//  • джерело: обидва меню беруть пункти з однієї моделі; група з активним пунктом у якорях знову згортається.
// Ankermenu van E-mail krijgt alle items van het linkermenu; oude weergave-items zitten ingeklapt in «Weergave en acties».
// Запуск: node scripts/eenheidstests.mjs mailanker-001-model.test.ts
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { bouwMailNavigatie, MAIL_NAV_DEFINITIES, type MailNavLabel } from '../../src/mail/mail-navigatie-model';

function browserOmgeving(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/inbox');
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ dataset: {}, style: {}, setAttribute: () => undefined, getAttribute: () => null, getContext: () => null }),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

export async function main(): Promise<number> {
  let fouten = 0, totaal = 0;
  const check = (naam: string, ok: boolean, info = '') => { totaal++; if (!ok) fouten++; console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

  const labels: MailNavLabel[] = [
    { id: 'INBOX', name: 'INBOX', type: 'system', messagesUnread: 12 },
    { id: 'STARRED', name: 'STARRED', type: 'system', messagesUnread: 3 },
    { id: 'SPAM', name: 'SPAM', type: 'system', messagesUnread: 5 },
    { id: 'Label_1', name: 'Робота', type: 'user', messagesUnread: 4, color: { backgroundColor: '#16a765' } },
    { id: 'Label_2', name: 'Архів 2020', type: 'user', messagesUnread: 0, labelListVisibility: 'labelShowIfUnread' },
    { id: 'Label_3', name: 'Банк', type: 'user', messagesUnread: 1 },
  ];
  const basis = { lang: 'uk' as const, accountId: 'acc1', activeTab: 'sent', labels, navigationItems: [], navigationVisits: [] };

  // ---------------------------------------------------------------- (а) типовий склад = ліве меню пошти
  {
    const m = bouwMailNavigatie(basis);
    const namen = m.primair.map((p) => p.naam).join('|');
    check('типово: основні пункти в порядку лівого меню', namen === 'Вхідні|Непрочитані|Із зірочкою|Відкладені|Надіслані|Чернетки|Уся пошта|Контакти й відправники', namen);
    const meer = m.meer.map((p) => p.naam).join('|');
    check('типово: «Більше» — Важливі, Спам, Кошик, Заплановано, Керування підписками, Архів, Акаунти', meer === 'Важливі|Спам|Кошик|Заплановано|Керування підписками|Архів|Акаунти', meer);
    check('мітки користувача: видимі (labelShowIfUnread без непрочитаних — прихована), за типовим порядком', m.labels.map((p) => p.naam).join('|') === 'Робота|Банк');
    check('15 вбудованих пунктів у спільній моделі', MAIL_NAV_DEFINITIES.length === 15);
    const inbox = m.primair.find((p) => p.id === 'inbox')!, starred = m.primair.find((p) => p.id === 'starred')!, spam = m.meer.find((p) => p.id === 'spam')!;
    check('лічильник: «Вхідні» без числа, коли окремо є «Непрочитані» (як у бічному меню)', inbox.teller === 0);
    check('лічильники «Із зірочкою» і «Спам» — з міток Gmail', starred.teller === 3 && spam.teller === 5);
    check('«Заплановано» вимкнено, коли Gmail не дав теку SCHEDULED', m.meer.find((p) => p.id === 'scheduled')!.uitgeschakeld === true);
    const nl = bouwMailNavigatie({ ...basis, lang: 'nl' });
    check('нідерландською: Postvak IN … Accounts', nl.primair[0].naam === 'Postvak IN' && nl.meer[nl.meer.length - 1].naam === 'Accounts');
  }

  // ---------------------------------------------------------------- (б) «Редагувати меню» і «пам'ять стану»
  {
    const m = bouwMailNavigatie({
      ...basis,
      navigationItems: [
        { key: 'nav:unread', visible: false, zone: 'primary', order: 20 },
        { key: 'nav:trash', visible: true, zone: 'primary', order: 5 },
        { key: 'nav:contacts', visible: true, zone: 'more', order: 1 },
        { key: 'label:acc1:Label_3', visible: true, zone: 'primary', order: 80 },
        { key: 'label:acc1:Label_1', visible: false, zone: 'labels', order: 10 },
      ],
      navigationVisits: [{ key: 'nav:starred', seenUnread: 3 }],
    });
    check('прихований «Непрочитані» зникає і з якорів', !m.primair.some((p) => p.id === 'unread'));
    check('«Кошик», перенесений нагору з порядком 5, — перший', m.primair[0].id === 'trash');
    check('«Контакти», перенесені в «Більше», — там першими', m.meer[0].id === 'contacts' && !m.primair.some((p) => p.id === 'contacts'));
    check('мітка, перенесена в основну зону, — в основній', m.primair.some((p) => p.soort === 'label' && p.id === 'Label_3'));
    check('прихована мітка зникає', !m.labels.some((p) => p.id === 'Label_1') && !m.primair.some((p) => p.id === 'Label_1'));
    check('без «Непрочитаних» у меню «Вхідні» показують число', m.primair.find((p) => p.id === 'inbox')!.teller === 12);
    check('«пам\'ять стану»: переглянута тека без нових — без числа', m.primair.find((p) => p.id === 'starred')!.teller === 0);
    const vers = bouwMailNavigatie({ ...basis, navigationVisits: [{ key: 'nav:starred', seenUnread: 1 }] });
    check('«пам\'ять стану»: з\'явилися нові — число знову видно', vers.primair.find((p) => p.id === 'starred')!.teller === 3);
    const open = bouwMailNavigatie({ ...basis, activeTab: 'labels', gekozenLabel: 'Label_1' });
    check('відкрита мітка — без числа', open.labels.find((p) => p.id === 'Label_1')!.teller === 0);
  }

  // ---------------------------------------------------------------- (в) буфер налаштувань зберігає seenUnread
  {
    // модуль буфера тягне оболонку сайту — мінімальне оточення браузера, як в agent-een-plek-20261020
    browserOmgeving();
    const { normalizeMailViewPreferences } = await import('../../src/mail-weergave-voorkeuren-cache');
    const n = normalizeMailViewPreferences({ navigationVisits: [{ key: 'nav:spam', visitedAt: 1, attentionSeenAt: 2, activityAt: 3, seenUnread: 7 }, { key: 'nav:trash', visitedAt: 1 }, { key: 'nav:sent', seenUnread: 'x' }] });
    const spam = n.navigationVisits.find((v) => v.key === 'nav:spam');
    check('буфер: seenUnread переживає читання з сервера (F5)', spam?.seenUnread === 7, JSON.stringify(spam));
    check('буфер: без seenUnread — поле відсутнє, сміття відкинуто', !('seenUnread' in (n.navigationVisits.find((v) => v.key === 'nav:trash') || {})) && !('seenUnread' in (n.navigationVisits.find((v) => v.key === 'nav:sent') || {})));
  }

  // ---------------------------------------------------------------- (г) джерело: обидва меню з однієї моделі, групи якорів
  {
    const werk = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
    const zij = readFileSync('src/MailZijbalkNavigatie.tsx', 'utf8');
    const rail = readFileSync('src/maquette-kern/MaquetteAnkerRail.tsx', 'utf8');
    check('бічне меню бере пункти зі спільної моделі', zij.includes('MAIL_NAV_DEFINITIES.map(') && !zij.includes("{id:'inbox',Icon:Inbox"));
    check('якорі: група «Пошта» відкрита типово, з «Написати лист», «Редагувати меню», «Більше», «Керування мітками», «Створити нову мітку»',
      /id:'mail-groep-post',soort:'groep',openStandaard:true/.test(werk) && werk.includes("id:'nav:menu-bewerken'") && werk.includes("id:'mail-groep-meer'") && werk.includes("id:'nav:labels-beheren'") && werk.includes("id:'nav:label-maken'"));
    const vorm = werk.indexOf("id:'mail-groep-vorm'");
    check('якорі: «Фільтри списку», «Подання списку», «Дії скриньки» — усередині згорнутої групи «Вигляд і дії»',
      vorm > 0 && werk.indexOf("id:'mail-groep-filters',soort:'groep'") > vorm && werk.indexOf("id:'mail-groep-weergave',soort:'groep'") > vorm && werk.indexOf("id:'mail-groep-acties',soort:'groep'") > vorm
      && !/id:'mail-groep-vorm'[^}]{0,80}openStandaard/.test(werk));
    check('якорі: «Написати лист» один раз (не дублюється в «Діях скриньки»)', werk.split("id:'actie:schrijf'").length - 1 === 1);
    check('якорі: поточна щільність/панель/порядок позначені «✓»', (werk.match(/badge:maquetteVink\('/g) || []).length === 9);
    check('якорі: теки ведуть туди ж, куди й ліве меню (вкладка через writeLocalTab), мітки — через tsv:mail-label-select',
      werk.includes("writeLocalTab('mail',id,lang)") && werk.includes("sessionStorage.setItem('tsv:mail-selected-label',labelId)"));
    check('якорі: діалоги меню відкриває той самий компонент бічного меню (режим dialoogHost, у body)',
      werk.includes('<MailSidebarNavigation dialoogHost') && zij.includes('createPortal(inhoud,document.body)') && zij.includes('MAIL_NAVIGATIE_ACTIE'));
    check('якорі: група з активним пунктом відкривається лише при зміні активного пункту (її можна згорнути)',
      rail.includes('vorigActiefRef') && rail.includes('bekendeGroepenRef'));
  }

  console.log(`\n${totaal - fouten}/${totaal} geslaagd (mailanker-001-model)`);
  return fouten ? 1 : 0;
}
