// Diagnose «для всіх чи лише для мене» (architectuur 13.10.2026, etap 4).
//
// Idee: één knop «Щось не працює?» voor IEDEREEN (niet alleen beheer). Er lopen twee soorten controles naast elkaar:
//  - server  (= voor iedereen gelijk): database, schema, MCP-deur, onderhoud van de e-mail, schijfruimte, servertijd;
//  - browser (= alleen bij u): verbinding, snelheid, sessie, versie van de pagina, klok, cookies/opslag.
// Uit de combinatie volgt één oordeel in gewone taal: «для всіх» (de server; u hoeft niets te doen, beheer is gewaarschuwd door
// de melding), «лише у вас» (met een concrete stap: opnieuw aanmelden, Ctrl+F5, klok gelijkzetten…), of «усе працює».
//
// Waarom zo (alternatieven): een losse statuspagina (zoals Statuspage) zegt alleen iets over de server en niets over «waarom bij
// MIJ niet»; alleen browsercontroles zien geen serverfout. Externe monitoring (Datadog e.d.) valt af: alles blijft op de eigen server.
// De servercontroles geven alleen namen, ja/nee, duur en een korte code — nooit inhoud, sleutels, paden of e-mailadressen.
import type { HelpLagen, Tekst } from './tech-rollen';

export type Bereik = 'server' | 'browser';
export type Stand = 'ok' | 'let-op' | 'fout' | 'onbekend';
export type ControleId =
  | 'database' | 'schema' | 'mcp-deur' | 'mail-onderhoud' | 'schijf' | 'servertijd' | 'healthcheck'
  | 'online' | 'snelheid' | 'sessie' | 'versie' | 'klok' | 'opslag';
export type Uitslag = { id: ControleId; stand: Stand; ms?: number; code?: string };

export const CONTROLES: Record<ControleId, { bereik: Bereik; naam: Tekst; advies?: Tekst }> = {
  database: { bereik: 'server', naam: ['База даних', 'Database'] },
  schema: { bereik: 'server', naam: ['Оновлення бази (міграції)', 'Database-updates (migraties)'] },
  'mcp-deur': { bereik: 'server', naam: ['Двері MCP (для ШІ)', 'MCP-deur (voor AI)'] },
  'mail-onderhoud': { bereik: 'server', naam: ['Фонова синхронізація пошти', 'Achtergrondsynchronisatie e-mail'] },
  schijf: { bereik: 'server', naam: ['Місце на диску сервера', 'Schijfruimte van de server'] },
  servertijd: { bereik: 'server', naam: ['Годинник сервера', 'Klok van de server'] },
  // HUB-05: de gezondheidscontrole van de server (/api/_healthcheck) telt mee in het oordeel: een 503 is een serverprobleem, geen «Усе працює».
  healthcheck: { bereik: 'server', naam: ['Відповідь сервера (healthcheck)', 'Antwoord van de server (healthcheck)'] },
  online: { bereik: 'browser', naam: ['Інтернет на цьому пристрої', 'Internet op dit apparaat'], advies: ['Перевірте Wi-Fi або кабель і спробуйте ще раз.', 'Controleer wifi of kabel en probeer opnieuw.'] },
  snelheid: { bereik: 'browser', naam: ['Швидкість зв’язку з сайтом', 'Snelheid naar de site'], advies: ['Зв’язок повільний: інша мережа або VPN можуть допомогти.', 'Trage verbinding: een ander netwerk of VPN uitzetten kan helpen.'] },
  sessie: { bereik: 'browser', naam: ['Ваш вхід на цьому сайті', 'Uw aanmelding op deze site'], advies: ['Вхід закінчився: вийдіть і увійдіть знову.', 'Aanmelding verlopen: meld u af en opnieuw aan.'] },
  versie: { bereik: 'browser', naam: ['Версія сторінки', 'Versie van de pagina'], advies: ['У вас стара версія сторінки: натисніть Ctrl+F5 (на телефоні — оновіть сторінку).', 'U hebt een oude versie van de pagina: druk Ctrl+F5 (op de telefoon: pagina vernieuwen).'] },
  klok: { bereik: 'browser', naam: ['Годинник цього пристрою', 'Klok van dit apparaat'], advies: ['Час на пристрої відрізняється від сервера: увімкніть автоматичне встановлення часу.', 'De tijd op het apparaat wijkt af: zet automatische tijd aan.'] },
  opslag: { bereik: 'browser', naam: ['Cookies і сховище браузера', 'Cookies en opslag van de browser'], advies: ['Браузер блокує cookies або сховище для цього сайту: дозвольте їх у налаштуваннях.', 'De browser blokkeert cookies of opslag voor deze site: sta ze toe in de instellingen.'] },
};
/** Codes van de controles in gewone taal (HUB-05: geen rauw «NIET_INGESTELD» voor de gebruiker). Onbekende code → de code zelf. */
export const CODE_TEKST: Record<string, Tekst> = {
  NIET_INGESTELD: ['не налаштовано на сервері', 'niet ingesteld op de server'], GEEN_MAP: ['тека міграцій недоступна', 'map met migraties onbereikbaar'], GEEN_TOEGANG: ['немає доступу', 'geen toegang'],
  NOG_NIET_GEDRAAID: ['ще не запускалося', 'nog niet gedraaid'], LAATSTE_RUN_MISLUKT: ['останній запуск не вдався', 'laatste run mislukt'], TE_LANG_GELEDEN: ['надто давно', 'te lang geleden'],
  BIJNA_VOL: ['майже заповнено', 'bijna vol'], WEINIG_VRIJ: ['мало вільного місця', 'weinig vrij'], DB_KLOK_WIJKT_AF: ['годинник бази відхиляється', 'klok van de database wijkt af'],
  OFFLINE: ['немає інтернету', 'offline'], GEEN_ANTWOORD: ['немає відповіді', 'geen antwoord'], SOMS_GEEN_ANTWOORD: ['відповідає не завжди', 'antwoordt niet altijd'],
  NIET_AANGEMELD: ['не ввійшли', 'niet aangemeld'], GEEN_VERBINDING: ['немає з’єднання', 'geen verbinding'], NIET_TE_BEPALEN: ['не вдалося визначити', 'niet te bepalen'], OUDE_VERSIE: ['стара версія сторінки', 'oude versie'],
  COOKIES_UIT: ['cookies вимкнені', 'cookies uit'], OPSLAG_GEBLOKKEERD: ['сховище заблоковано', 'opslag geblokkeerd'],
};
export function codeTekst(code: string | undefined, uk: boolean): string {
  if (!code) return '';
  const t = CODE_TEKST[code]; if (t) return uk ? t[0] : t[1];
  const m = /^HTTP_(\d{3})$/.exec(code); if (m) return uk ? `сервер відповів ${m[1]}` : `server antwoordde ${m[1]}`;
  const o = /^OPEN_(\d+)$/.exec(code); if (o) return uk ? `незастосованих міграцій: ${o[1]}` : `${o[1]} open migraties`;
  return code;
}
export const SERVER_CONTROLES = (Object.keys(CONTROLES) as ControleId[]).filter((id) => CONTROLES[id].bereik === 'server');
export const BROWSER_CONTROLES = (Object.keys(CONTROLES) as ControleId[]).filter((id) => CONTROLES[id].bereik === 'browser');

/** Grenzen (ook gebruikt door de tests): wanneer is iets «let op» of «fout». */
export const GRENS = {
  snelheidLetOpMs: 1500, snelheidFoutMs: 6000,
  klokLetOpMs: 2 * 60_000, klokFoutMs: 10 * 60_000,
  mailOnderhoudUren: 26,
  schijfLetOpProcent: 10, schijfFoutProcent: 3,
} as const;

export type Oordeel = 'iedereen' | 'alleen-ik' | 'beide' | 'alles-ok' | 'onzeker';
/** Eén oordeel uit alle uitslagen. «let op» telt mee als probleem, «onbekend» niet (we gokken niet). */
export function oordeel(uitslagen: Uitslag[]): { oordeel: Oordeel; server: Uitslag[]; browser: Uitslag[] } {
  const slecht = (u: Uitslag) => u.stand === 'fout' || u.stand === 'let-op';
  const server = uitslagen.filter((u) => CONTROLES[u.id]?.bereik === 'server' && slecht(u));
  const browser = uitslagen.filter((u) => CONTROLES[u.id]?.bereik === 'browser' && slecht(u));
  const iets = uitslagen.some((u) => u.stand !== 'onbekend');
  const o: Oordeel = server.length && browser.length ? 'beide' : server.length ? 'iedereen' : browser.length ? 'alleen-ik' : iets ? 'alles-ok' : 'onzeker';
  return { oordeel: o, server, browser };
}

export const OORDEEL_TEKST: Record<Oordeel, { kop: Tekst; uitleg: Tekst }> = {
  iedereen: { kop: ['Проблема для всіх — на сервері', 'Probleem voor iedereen — op de server'], uitleg: ['Це не ваш пристрій. Ви нічого не зламали; надішліть звіт — адміністратор побачить, що саме не працює.', 'Het ligt niet aan uw apparaat. Stuur het verslag — de beheerder ziet wat er niet werkt.'] },
  'alleen-ik': { kop: ['Проблема лише у вас', 'Probleem alleen bij u'], uitleg: ['Сервер працює для всіх. Нижче — що зробити на цьому пристрої.', 'De server werkt voor iedereen. Hieronder staat wat u op dit apparaat kunt doen.'] },
  beide: { kop: ['Проблеми і на сервері, і у вас', 'Problemen op de server én bij u'], uitleg: ['Спершу виправте те, що на вашому пристрої; серверну частину побачить адміністратор зі звіту.', 'Los eerst op wat op uw apparaat ligt; het serverdeel ziet de beheerder in het verslag.'] },
  'alles-ok': { kop: ['Усе працює', 'Alles werkt'], uitleg: ['І сервер, і ваш пристрій у порядку. Якщо щось усе одно не так — надішліть звіт з описом.', 'Server en apparaat zijn in orde. Werkt iets toch niet? Stuur een verslag met een beschrijving.'] },
  onzeker: { kop: ['Не вдалося перевірити', 'Controle niet gelukt'], uitleg: ['Перевірки не дали відповіді. Спробуйте ще раз за хвилину.', 'De controles gaven geen antwoord. Probeer het over een minuut opnieuw.'] },
};

export const HELP_DIAGNOSE: HelpLagen = {
  wat: ['Перевіряє одночасно сервер (однаковий для всіх) і цей браузер (лише ваш) та каже, з якого боку проблема.', 'Controleert tegelijk de server (voor iedereen gelijk) en deze browser (alleen van u) en zegt aan welke kant het probleem zit.'],
  gevolg: ['Нічого не змінює. Звіт надсилається лише якщо ви натиснете «Надіслати» — і ви бачите, що саме в ньому.', 'Verandert niets. Een verslag gaat alleen weg als u op «Versturen» drukt — en u ziet wat erin staat.'],
  dev: ['Серверні перевірки: SELECT 1, порівняння app.schema_migrations з файлами, /health дверей, останній запуск cron пошти, statfs, час сервера; кеш 30 с, щоб кнопка не навантажувала сервер. Браузер: navigator.onLine, медіана 3 запитів /api/_healthcheck, сесія через POST з tabContext, ім’я головного бандла vs dist/index.html, зсув годинника, cookieEnabled+localStorage. Звіт — лише коди й час, без вмісту; читають ролі з diagnose.lezen в активному технічному профілі. Альтернативи: окрема статус-сторінка (не бачить «чому лише в мене»), зовнішній моніторинг (суперечить BYOS).', 'Servercontroles: SELECT 1, app.schema_migrations vs bestanden, /health van de deur, laatste cron-run van e-mail, statfs, servertijd; 30 s cache. Browser: navigator.onLine, mediaan van 3× /api/_healthcheck, sessie via POST met tabContext, naam van de hoofdbundel vs dist/index.html, klokverschil, cookieEnabled+localStorage. Verslag: alleen codes en tijden; lezen met diagnose.lezen in een actief technisch profiel. Alternatieven: losse statuspagina (ziet «waarom alleen bij mij» niet), externe monitoring (strijdig met BYOS).'],
};
