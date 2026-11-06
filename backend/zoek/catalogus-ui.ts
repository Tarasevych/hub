// ZOEKEN — DE CATALOGUS VAN DE INTERFACE (Z2, 22.10.2026): «знайти функцію без знання структури сайту».
//
// Elke pagina, elk tabblad, elke knop, elke instelling, elke integratie en elke «?»-uitleg wordt een ZoekObject — NIET met
// de hand opgeschreven maar afgeleid uit de bronnen van waarheid die de site zelf al gebruikt:
//   • shared/menu-model.ts (DIENST_IDS, MENU_PAGINAS) + src/dienst-tab-labels.ts + MENU_CATALOG (src/menu-voorkeuren.tsx, door de generator gelezen) → pagina's en menu
//   • shared/zoek-ui-knoppen.generated.ts (scripts/zoek-ui-catalogus.mjs leest src/**/*.tsx)                                → knoppen, koppen, dialogen, hash-tabbladen
//   • shared/hulp-register.ts (wat / gevolg / risico, uk + nl, met het bronbestand)                                            → instellingen en schakelaars met uitleg
//   • shared/connector-v2/catalogus.ts (V2_OPTIES: rechten voor AI, kant gebruiker/beheer)                                    → AI-rechten
//   • shared/integraties-catalogus.ts (INTEGRATIES) en shared/mail-aanbieders.ts (MAIL_AANBIEDERS)                           → integraties
//
// TOEGANG. Elk object heeft een niveau: 'iedereen', 'profiel' (wie een technisch profiel HEEFT: de band om het aan te zetten)
// of 'technisch' (sitebeheer: alleen met een ACTIEVE technische activering). De catalogus zelf is gedeeld (geen persoonlijke
// gegevens), maar hij wordt per lade geïndexeerd: de persoonlijke lade krijgt 'iedereen' (+ 'profiel' als technischeRechten
// het zegt), de technische lade krijgt alles. Omdat de poort (gegevensRuimteVeilig) de technische lade alleen geeft bij een
// levende activering, ziet niemand zonder actief technisch profiel ooit een technisch object — ook niet via suggesties.
//
// ROUTE. {host: dienst, pad: tabblad-id, hash?: '#<tab>', params?: {focus: '<data-hulp-sleutel>'}}: de client (src/zoek/zoek-kern.ts →
// routeUrl) maakt daar https://<domein van de dienst>/<Nederlandse slug van het tabblad> van, en bij `focus` scrolt de pagina naar
// het element met data-hulp=<sleutel> (afspraak met Z4). Tot 05.11.2026 kende de client de hosts identity/api/admin/huis niet en
// las hij een tabblad-id als ongeldig pad: geen enkel object opende zijn tabblad (ORCH-001, oude fout; test zoek-route-tabblad).
import { createHash } from 'node:crypto';
import { DIENST_IDS, MENU_PAGINAS } from '../../shared/menu-model';
import { BEHEER_PAGINAS } from '../../shared/beheer-paginas';
import { HULP_REGISTER } from '../../shared/hulp-register';
import { V2_GROEPEN, V2_OPTIES, KANT_TEKST } from '../../shared/connector-v2/catalogus';
import { CATEGORIEEN, INTEGRATIES, STATUS_LABEL } from '../../shared/integraties-catalogus';
import { MAIL_AANBIEDERS } from '../../shared/mail-aanbieders';
import { UI_DIENSTEN, UI_ELEMENTEN, UI_ELEMENTEN_VERSIE, UI_ONBEREIKBAAR, uiPlekVan, type UiToegang } from '../../shared/zoek-ui-knoppen.generated';
import { serviceTabLabel } from '../../src/dienst-tab-labels';
import type { ZoekObject, ZoekRoute, ZoekSoort, ZoekBron } from '../../shared/zoek-model';
import type { Lade } from '../../shared/ruimte-scheiding';

export type { UiToegang };
/** Eén element van de interface, nog zonder lade (gedeeld). */
export type UiObject = {
  id: string; bron: ZoekBron; soort: ZoekSoort; toegang: UiToegang;
  titels: { uk: string; nl: string }; omschrijving: { uk: string; nl: string };
  pad: { uk: string; nl: string }; route: ZoekRoute; trefwoorden: string[]; extra: Record<string, unknown>;
};

/** Wat mensen typen als ze AI willen koppelen (hub «Підключення ШІ»). */
const AI_KOPPELEN: readonly string[] = ['підключити шi', 'підключити claude', 'підключити chatgpt', 'конектор', 'mcp', 'доступи шi', 'що може шi', 'відкликати доступ', 'ai koppelen', 'claude koppelen', 'connector', 'ai-toegang', 'toegang intrekken', 'connect ai', 'connect claude', 'revoke access', 'подключить ии', 'подключить claude', 'коннектор', 'доступы ии'];
/**
 * Bedoelingen («наміри»): wat mensen TYPEN als ze een pagina zoeken zonder de naam te kennen — uk / nl / en / ru, surzhyk en
 * vertalingen inbegrepen. Sleutel = 'dienst/tab' (of een object-id voor één element). Gewicht B (trefwoorden) in de kern.
 */
const INTENTIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'identity/languages': ['змінити мову', 'поміняти мову', 'мова інтерфейсу', 'мова сайту', 'переключити мову', 'taal wijzigen', 'taal veranderen', 'taal instellen', 'change language', 'switch language', 'сменить язык', 'поменять язык', 'язык интерфейса', 'українська', 'nederlands', 'english'],
  'identity/themes': ['темна тема', 'світла тема', 'змінити тему', 'нічний режим', 'темний режим', 'кольори', 'donker thema', 'licht thema', 'thema wijzigen', 'donkere modus', 'nachtmodus', 'kleuren', 'dark mode', 'light mode', 'change theme', 'тёмная тема', 'темная тема', 'сменить тему', 'ночной режим'],
  'identity/sessions': ['вийти з усіх пристроїв', 'вийти скрізь', 'завершити сесії', 'активні сесії', 'хто входив у мій акаунт', 'хто заходив', 'пристрої входу', 'чужий вхід', 'overal afmelden', 'alle sessies beëindigen', 'actieve sessies', 'wie is aangemeld', 'aanmeldingen bekijken', 'apparaten', 'sign out everywhere', 'log out all devices', 'active sessions', 'who logged in', 'выйти со всех устройств', 'кто входил в мой аккаунт', 'активные сессии'],
  'identity/menu': ['впорядкувати меню', 'налаштувати меню', 'сховати пункт меню', 'порядок меню', 'бічна панель', 'іконки меню', 'menu instellen', 'menu anders ordenen', 'menu-item verbergen', 'zijbalk', 'volgorde menu', 'customize menu', 'reorder menu', 'hide menu item', 'sidebar', 'настроить меню', 'порядок меню', 'скрыть пункт меню'],
  'identity/methods': ['способи входу', 'passkey', 'ключ доступу', 'застосунок-автентифікатор', 'google вхід', 'шифрування моїх даних', 'зашифрувати дані', 'ключ шифрування', 'aanmeldmethoden', 'passkey toevoegen', 'authenticator-app', 'versleuteling van mijn gegevens', 'gegevens versleutelen', 'login methods', 'encrypt my data', 'encryption key', 'способы входа', 'шифрование моих данных', 'зашифровать данные'],
  'identity/recovery': ['коди відновлення', 'загубив телефон', 'втратив доступ', 'відновити доступ', 'забув пароль', 'резервні коди', 'herstelcodes', 'telefoon kwijt', 'toegang herstellen', 'wachtwoord vergeten', 'recovery codes', 'lost my phone', 'restore access', 'forgot password', 'коды восстановления', 'потерял телефон', 'восстановить доступ', 'забыл пароль'],
  'identity/security': ['двофакторна', '2fa', 'двоетапна перевірка', 'підтвердження входу', 'безпека акаунта', 'tweefactorauthenticatie', 'tweestapsverificatie', 'beveiliging account', 'two-factor', 'two factor authentication', 'двухфакторная', 'безопасность аккаунта'],
  'identity/account': ['видалити акаунт', 'мій профіль', 'робочі простори', 'account verwijderen', 'mijn profiel', 'werkruimtes', 'delete account', 'my profile', 'удалить аккаунт', 'мой профиль'],
  'identity/personalization': ['налаштування', 'персоналізація', 'instellingen', 'personalisatie', 'settings', 'preferences', 'настройки'],
  'identity/widgets': ['додати блок', 'додати віджет', 'blok toevoegen', 'widget toevoegen', 'add widget', 'добавить блок'],
  'identity/sharing': ['поділитися простором', 'надати доступ', 'приватне посилання', 'ruimte delen', 'toegang geven', 'privélink', 'share workspace', 'поделиться', 'дать доступ'],
  'mail/accounts': ['додати скриньку', 'додати пошту', 'додати ще один gmail', 'підключити gmail', 'підключити пошту', 'поштові акаунти', 'друга пошта', 'imap', 'mailbox toevoegen', 'nog een gmail toevoegen', 'gmail koppelen', 'e-mailaccounts', 'tweede mailbox', 'add mailbox', 'add another gmail', 'connect email', 'email accounts', 'добавить почту', 'добавить ещё один gmail', 'подключить gmail', 'почтовые аккаунты'],
  'mail/inbox': ['пошта', 'вхідні', 'листи', 'почта', 'письма', 'входящие', 'postvak in', 'e-mail', 'mail', 'inbox', 'brieven'],
  'mail/settings': ['налаштування пошти', 'підпис', 'автовідповідь', 'mailinstellingen', 'handtekening', 'automatisch antwoord', 'mail settings', 'signature', 'auto reply', 'настройки почты', 'подпись'],
  'mail/contacts': ['контакти', 'відправники', 'заблокувати відправника', 'contacten', 'afzenders', 'afzender blokkeren', 'contacts', 'senders', 'block sender', 'контакты', 'отправители'],
  'mail/subscriptions': ['відписатися', 'розсилки', 'підписки', 'afmelden nieuwsbrief', 'abonnementen', 'unsubscribe', 'newsletters', 'отписаться', 'рассылки'],
  'mail/spam': ['спам', 'spam', 'ongewenst', 'junk'],
  'mail/trash': ['кошик', 'видалені листи', 'prullenbak', 'verwijderde mails', 'trash', 'deleted mail', 'корзина', 'удалённые письма'],
  'mail/labels': ['мітки', 'ярлики', 'labels', 'etiketten', 'tags', 'метки', 'ярлыки'],
  'mail/scheduled': ['заплановані листи', 'надіслати пізніше', 'gepland', 'later verzenden', 'scheduled send', 'отложенная отправка'],
  'cloud/calendar': ['календар', 'події', 'зустріч', 'додати подію', 'agenda', 'afspraak', 'afspraak toevoegen', 'calendar', 'event', 'add event', 'календарь', 'встреча', 'добавить событие'],
  'cloud/accounts': ['google drive', 'підключити drive', 'диск', 'drive koppelen', 'schijf', 'connect drive', 'подключить диск', 'гугл диск'],
  'cloud/photos': ['фото', 'світлини', 'галерея', "foto's", 'galerij', 'photos', 'gallery', 'фотографии', 'галерея'],
  'cloud/search': ['файли', 'документи', 'знайти файл', 'bestanden', 'documenten', 'bestand zoeken', 'files', 'documents', 'find file', 'файлы', 'документы', 'найти файл'],
  'cloud/capture': ['швидко зберегти', 'зберегти посилання', 'snel opslaan', 'link bewaren', 'quick save', 'save link', 'быстро сохранить'],
  'cloud/overview': ['хмара', 'сховище', 'робочі простори', 'cloud', 'opslag', 'werkruimtes', 'storage', 'облако', 'хранилище'],
  'hub/tasks': ['завдання', 'задачі', 'дошка', 'to-do', 'taken', 'bord', 'tasks', 'todo', 'задачи', 'доска'],
  'hub/notes': ['нотатки', 'записки', 'notities', 'notes', 'заметки'],
  'hub/zoek': ['пошук', 'знайти', 'шукати', 'zoeken', 'vinden', 'search', 'find', 'поиск', 'найти'],
  'hub/overview': ['головна', 'мій простір', 'огляд', 'startpagina', 'mijn ruimte', 'overzicht', 'home', 'dashboard', 'главная'],
  'hub/recent': ['останні', 'нещодавні', 'recent', 'recente', 'недавние'],
  // De hub «Підключення ШІ» staat op mcp.*/agents; ai.*/agents verwijst ernaar. Dezelfde bedoelingen voor beide.
  'ai/agents': AI_KOPPELEN,
  'mcp/agents': AI_KOPPELEN,
  'ai/workspace': ['чат з шi', 'робочий простір шi', 'ai-chat', 'werkruimte', 'ai chat', 'чат с ии'],
  'github/overview': ['github', 'репозиторії', 'код', 'issues', 'pull requests', 'repositories', 'code', 'репозитории', 'код'],
  'github/accounts': ['підключити github', 'github koppelen', 'connect github', 'подключить github'],
  'huis/overview': ['розумний дім', 'розумний будинок', 'slim huis', 'smart home', 'умный дом'],
  'mcp/dashboard': ['розгортання', 'оновити сайт', 'реліз', 'uitrol', 'site bijwerken', 'release', 'deploy', 'деплой', 'развёртывание'],
  'mcp/apps': ['додатки на сервері', 'контейнери', 'docker', 'apps op de server', 'containers', 'server apps', 'приложения на сервере'],
  'admin/access': ['користувачі', 'запити доступу', 'ролі користувачів', 'заблокувати користувача', 'gebruikers', 'toegangsverzoeken', 'gebruiker blokkeren', 'users', 'access requests', 'block user', 'пользователи', 'запросы доступа'],
  'admin/updates': ['оновлення', 'відкотити', 'версія сайту', 'updates', 'terugdraaien', 'versie', 'rollback', 'site version', 'обновления', 'откатить'],
  'admin/contour': ['секрети', 'ключі', 'токени сервера', 'geheimen', 'sleutels', 'secrets', 'keys', 'секреты', 'ключи'],
  'admin/diagnostics': ['діагностика', 'стан сервера', 'diagnostiek', 'serverstatus', 'diagnostics', 'server health', 'диагностика'],
  'admin/audit': ['журнал', 'аудит', 'хто що змінив', 'logboek', 'audit', 'wie wijzigde wat', 'audit log', 'журнал', 'кто что менял'],
  'admin/directories': ['інтеграції', 'каталог інтеграцій', 'integraties', 'integrations', 'интеграции'],
  'admin/ai': ['доступ шi', 'політика шi', 'ai-toegang', 'ai-beleid', 'ai access policy', 'доступ ии'],
  'admin/devices': ['пристрої', 'apparaten', 'devices', 'устройства'],
  'admin/sso': ['sso', 'єдиний вхід', 'single sign-on', 'единый вход'],
  'admin/roles': ['ролі', 'rollen', 'roles', 'роли'],
  'api/vault': ['сховище секретів', 'kluis', 'geheimenkluis', 'vault', 'хранилище секретов'],
  'api/access': ['api-доступ', 'api-токен', 'api-toegang', 'api token', 'api-доступ'],
  // Eén element: de sectie «Шифрування моїх даних» (SleutelkluisSectie) krijgt dezelfde bedoelingen als haar pagina.
  'ui:sectie:identity/methods:14bcd57609': ['шифрування моїх даних', 'зашифрувати дані', 'ключ шифрування', 'versleuteling van mijn gegevens', 'gegevens versleutelen', 'encrypt my data', 'шифрование моих данных'],
});
const intenties = (dienst: string, tab: string, id?: string): string[] => [...(INTENTIES[`${dienst}/${tab}`] || []), ...(id ? INTENTIES[id] || [] : [])];

const TOEGANG_RANG: Record<UiToegang, number> = { iedereen: 0, profiel: 1, technisch: 2 };
const TECHNISCHE_DIENSTEN = new Set(['admin', 'api']);
const dienstToegang = (dienst: string, tab: string): UiToegang => (TECHNISCHE_DIENSTEN.has(dienst) || (BEHEER_PAGINAS[dienst] ?? []).includes(tab) ? 'technisch' : 'iedereen');
const strenger = (a: UiToegang, b: UiToegang): UiToegang => (TOEGANG_RANG[a] >= TOEGANG_RANG[b] ? a : b);
const knip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const dienstNaam = (dienst: string): { uk: string; nl: string } => {
  const m = UI_DIENSTEN.find((x) => x.id === dienst);
  return m ? { uk: m.uk, nl: m.nl } : { uk: dienst, nl: dienst };
};
const tabNaam = (tab: string): { uk: string; nl: string } => ({ uk: serviceTabLabel(tab, 'uk'), nl: serviceTabLabel(tab, 'nl') });
const route = (host: string, pad: string, extra: { hash?: string; focus?: string } = {}): ZoekRoute =>
  ({ host: host as ZoekRoute['host'], pad, ...(extra.hash ? { hash: `#${extra.hash}` } : {}), ...(extra.focus ? { params: { focus: extra.focus } } : {}) });
const padVan = (dienst: string, tab: string, sectie?: { uk: string; nl: string } | null) => {
  const d = dienstNaam(dienst), t = tabNaam(tab);
  return { uk: [d.uk, t.uk, sectie?.uk].filter(Boolean).join(' › '), nl: [d.nl, t.nl, sectie?.nl].filter(Boolean).join(' › ') };
};
/** Trefwoorden uit een sleutel als 'toegang.beleid.max-dagen' of een id als 'pg:mail/accounts'. */
const sleutelWoorden = (k: string) => [...new Set(k.split(/[^a-z0-9]+/i).filter((w) => w.length >= 3))];

function bouw(): UiObject[] {
  const uit: UiObject[] = [];
  const voeg = (o: UiObject) => { uit.push(o); };

  // ---------------------------------------------------------------- diensten (hoofdmenu) en pagina's (tabbladen)
  for (const m of UI_DIENSTEN) {
    if (m.gepland) continue;
    const tab = m.tab || (MENU_PAGINAS[m.dienst] || [])[0] || '';
    voeg({
      id: `menu:${m.id}`, bron: 'pagina', soort: 'menu', toegang: dienstToegang(m.dienst, tab),
      titels: { uk: m.uk, nl: m.nl }, omschrijving: { uk: `Розділ меню «${m.uk}»`, nl: `Menu-onderdeel «${m.nl}»` },
      pad: { uk: 'Меню', nl: 'Menu' }, route: route(m.dienst, tab), trefwoorden: [m.id, m.dienst, m.icoon, ...intenties(m.dienst, tab)], extra: { menuId: m.id, dienst: m.dienst },
    });
  }
  for (const dienst of DIENST_IDS) {
    for (const tab of MENU_PAGINAS[dienst] || []) {
      const t = tabNaam(tab), d = dienstNaam(dienst);
      voeg({
        id: `pagina:${dienst}/${tab}`, bron: 'pagina', soort: 'pagina', toegang: dienstToegang(dienst, tab),
        titels: t, omschrijving: { uk: `Сторінка «${t.uk}» у розділі «${d.uk}»`, nl: `Pagina «${t.nl}» in «${d.nl}»` },
        pad: padVan(dienst, tab), route: route(dienst, tab), trefwoorden: [dienst, tab, ...sleutelWoorden(tab), t.uk, t.nl, d.uk, d.nl, ...intenties(dienst, tab)], extra: { dienst, tab },
      });
    }
  }

  // ---------------------------------------------------------------- gegenereerd uit src/**/*.tsx: knoppen, koppen, dialogen, hash-tabbladen
  for (const e of UI_ELEMENTEN) {
    const basis = strenger(e.toegang, dienstToegang(e.dienst, e.tab));
    const toegang: UiToegang = e.soort === 'tab' && (e.hash === 'technisch' || e.hash === 'orch') ? 'technisch' : basis;
    const soort: ZoekSoort = e.soort === 'knop' ? 'knop' : e.soort === 'dialoog' ? 'dialoog' : 'pagina';
    const sectie = e.sectieUk ? { uk: e.sectieUk, nl: e.sectieNl } : null;
    const wat = e.soort === 'knop' ? { uk: 'Кнопка', nl: 'Knop' } : e.soort === 'dialoog' ? { uk: 'Вікно', nl: 'Venster' } : e.soort === 'tab' ? { uk: 'Вкладка', nl: 'Tabblad' } : { uk: 'Розділ сторінки', nl: 'Sectie van de pagina' };
    const p = padVan(e.dienst, e.tab, sectie);
    voeg({
      id: e.id, bron: 'ui', soort, toegang,
      titels: { uk: e.uk, nl: e.nl },
      omschrijving: { uk: `${wat.uk} «${e.uk}» — ${p.uk}`, nl: `${wat.nl} «${e.nl}» — ${p.nl}` },
      pad: p, route: route(e.dienst, e.tab, { hash: e.hash, focus: e.hulp }),
      trefwoorden: [e.soort, e.dienst, e.tab, ...(e.hash ? [e.hash] : []), tabNaam(e.tab).uk, tabNaam(e.tab).nl, ...(e.soort === 'sectie' || e.soort === 'tab' || e.soort === 'dialoog' ? intenties(e.dienst, e.tab, e.id) : INTENTIES[e.id] || [])],
      extra: { element: e.soort, bestand: e.bestand, ...(e.hash ? { hash: e.hash } : {}) },
    });
  }

  // ---------------------------------------------------------------- «?»-uitleg: elke optie/schakelaar met wat/gevolg/risico
  // Een «?» uit een bestand dat de site nergens laadt (UI_ONBEREIKBAAR, bv. src/BeheerSleutelsWeergave.tsx → keys.doel) is op geen
  // enkele pagina te vinden: niet aanbieden (ORCH-001, na de onafhankelijke controle van 05.11.2026).
  const dood = new Set(UI_ONBEREIKBAAR);
  for (const [sleutel, h] of Object.entries(HULP_REGISTER)) {
    if (dood.has(h.bron)) continue;
    const plek = uiPlekVan(h.bron) || (h.bron.startsWith('deploy/') ? { dienst: 'admin', tab: 'updates', toegang: 'technisch' as UiToegang } : { dienst: 'hub', tab: 'overview', toegang: 'technisch' as UiToegang });
    const toegang = strenger(plek.toegang, dienstToegang(plek.dienst, plek.tab));
    const [watUk, watNl] = h.wat, [gevolgUk, gevolgNl] = h.gevolg, [risicoUk, risicoNl] = h.risico;
    voeg({
      id: `hulp:${sleutel}`, bron: 'hulp', soort: 'instelling', toegang,
      titels: { uk: knip(watUk, 160), nl: knip(watNl, 160) },
      omschrijving: { uk: knip(`${gevolgUk} ${risicoUk}`, 600), nl: knip(`${gevolgNl} ${risicoNl}`, 600) },
      pad: padVan(plek.dienst, plek.tab), route: route(plek.dienst, plek.tab, { focus: sleutel }),
      trefwoorden: [sleutel, ...sleutelWoorden(sleutel)], extra: { hulp: sleutel, bron: h.bron },
    });
  }

  // ---------------------------------------------------------------- AI-rechten (connector v2): wat een AI mag, per kant
  for (const o of V2_OPTIES) {
    if (o.status !== 'actief') continue;
    const groep = V2_GROEPEN.find((g) => g.id === o.groep);
    const toegang: UiToegang = o.kant === 'beheer' ? 'technisch' : 'iedereen';
    const kant = KANT_TEKST[o.kant];
    voeg({
      id: `recht:${o.key}`, bron: 'instelling', soort: 'instelling', toegang,
      titels: { uk: knip(o.uk[0], 160), nl: knip(o.nl[0], 160) },
      omschrijving: { uk: knip(`${o.uk[1]} ${o.uk[2]} ${o.uk[3] || ''}`, 600), nl: knip(`${o.nl[1]} ${o.nl[2]} ${o.nl[3] || ''}`, 600) },
      // De connectors staan in de hub op mcp.*/agents#connectors (tot 05.11.2026: ai.*/agents, alleen een verwijzing naar de hub).
      pad: { uk: `${dienstNaam('mcp').uk} › ${tabNaam('agents').uk} › Конектори › ${groep?.uk || o.groep} › ${kant.uk}`, nl: `${dienstNaam('mcp').nl} › ${tabNaam('agents').nl} › Connectors › ${groep?.nl || o.groep} › ${kant.nl}` },
      route: route('mcp', 'agents', { hash: 'connectors' }),
      trefwoorden: [o.id, o.essentie, o.weergave, o.groep, o.kant, o.soort, o.risico, ...(o.intern ? [o.intern] : [])],
      extra: { recht: o.key, groep: o.groep, kant: o.kant, risico: o.risico, soort: o.soort },
    });
  }

  // ---------------------------------------------------------------- integraties (catalogus) en mailaanbieders
  for (const i of INTEGRATIES) {
    const cat = CATEGORIEEN.find((c) => c.id === i.cat);
    const doel = i.doel && i.doel.soort === 'pagina' ? { dienst: i.doel.dienst, tab: i.doel.tab } : { dienst: 'admin', tab: 'directories' };
    const st = STATUS_LABEL[i.status];
    voeg({
      id: `integratie:${i.id}`, bron: 'instelling', soort: 'integratie', toegang: dienstToegang(doel.dienst, doel.tab),
      titels: { uk: i.naam, nl: i.naam },
      omschrijving: { uk: knip(`${i.uk} (${cat?.uk || i.cat}; ${st[0]})`, 400), nl: knip(`${i.nl} (${cat?.nl || i.cat}; ${st[1]})`, 400) },
      pad: padVan(doel.dienst, doel.tab), route: route(doel.dienst, doel.tab),
      trefwoorden: [i.id, i.cat, i.status, ...i.methoden, ...(cat ? [cat.uk, cat.nl] : [])], extra: { integratie: i.id, status: i.status, categorie: i.cat },
    });
  }
  for (const a of MAIL_AANBIEDERS) {
    voeg({
      id: `mailaanbieder:${a.id}`, bron: 'instelling', soort: 'integratie', toegang: 'iedereen',
      titels: { uk: `Пошта ${a.naam}`, nl: `E-mail ${a.naam}` },
      omschrijving: { uk: `Підключити скриньку ${a.naam} (${a.wijze})`, nl: `Mailbox ${a.naam} koppelen (${a.wijze})` },
      pad: padVan('mail', 'accounts'), route: route('mail', 'accounts'),
      trefwoorden: [a.id, a.naam, a.merk, a.wijze, a.onder[0], a.onder[1]], extra: { aanbieder: a.id, wijze: a.wijze },
    });
  }

  // Dubbele id's zijn een programmeerfout, geen gegevensfout: hard falen zodat de test het ziet.
  const gezien = new Set<string>();
  for (const o of uit) { if (gezien.has(o.id)) throw new Error(`UI_CATALOGUS_DUBBEL:${o.id}`); gezien.add(o.id); }
  return uit.sort((a, b) => a.id.localeCompare(b.id));
}

let cache: { lijst: UiObject[]; versie: string } | null = null;
/** De hele catalogus (gedeeld, in het geheugen; één keer gebouwd). */
export function uiCatalogus(): UiObject[] { return (cache ??= bouwCache()).lijst; }
/** Versie van de catalogus: verandert zodra één element verandert (hash over alle objecten + de gegenereerde lijst). */
export function uiCatalogusVersie(): string { return (cache ??= bouwCache()).versie; }
function bouwCache() {
  const lijst = bouw();
  const h = createHash('sha256').update(UI_ELEMENTEN_VERSIE).update(JSON.stringify(lijst)).digest('hex').slice(0, 16);
  return { lijst, versie: `ui-${h}` };
}
export const _uiCatalogusLeeg = () => { cache = null; };

/** Welke objecten iemand met dit toegangsniveau mag zien. */
export const uiObjectenVoor = (niveau: UiToegang): UiObject[] => uiCatalogus().filter((o) => TOEGANG_RANG[o.toegang] <= TOEGANG_RANG[niveau]);

/**
 * Catalogus → ZoekObjecten voor ÉÉN lade. De technische lade krijgt alles; de persoonlijke lade 'iedereen' en — als
 * de mens een technisch profiel heeft (de aanroeper geeft dat door: technischeRechten) — ook 'profiel'.
 */
export function uiZoekObjecten(lade: Lade, opties: { heeftProfiel?: boolean; nu?: number } = {}): ZoekObject[] {
  const niveau: UiToegang = lade.ruimte === 'technisch' ? 'technisch' : opties.heeftProfiel ? 'profiel' : 'iedereen';
  const versie = uiCatalogusVersie();
  const nu = opties.nu ?? Date.now();
  return uiObjectenVoor(niveau).map((o) => ({
    id: o.id, bron: o.bron, soort: o.soort,
    titel: o.titels.uk, titels: { uk: o.titels.uk, nl: o.titels.nl },
    omschrijving: `${o.omschrijving.uk}\n${o.omschrijving.nl}`,
    trefwoorden: [...new Set([...o.trefwoorden, o.pad.uk, o.pad.nl].map((x) => knip(x, 80)).filter(Boolean))],
    pad: o.pad.uk, route: o.route, taal: '', fragmentBron: 'omschrijving',
    bijgewerktOp: nu, versie: `${versie}:${o.id}`,
    extra: { ...o.extra, toegang: o.toegang, padNl: o.pad.nl },
    rechten: { userId: lade.userId, ruimte: lade.ruimte },
  }));
}
