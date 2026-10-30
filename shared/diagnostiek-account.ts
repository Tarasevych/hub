// Diagnose «voor iedereen / alleen voor mij» (verslag van de eigenaar 18.10.2026: «Діагностика «для всіх / лише для мене» — не
// впроваджено»). Per dienst twee kolommen:
//   «Сервер (для всіх)» — de serverkant van die dienst, uit de gewone diagnoseronde (app.diagnostiek_uitslagen, elke 15 min);
//   «Цей акаунт»        — synthetische controle voor één account: is de koppeling er, geldt het token, werkt het apparaat…
// Zo is meteen te zien of een storing iedereen raakt (server) of alleen dit account (koppeling opnieuw geven, apparaat herstarten).
//
// Alles hier is zuiver (geen server, geen database) en getest. Alleen metadata: stand + korte code. Nooit inhoud, adressen,
// bestandsnamen, tokens of IP's — de feiten die binnenkomen zijn tellingen en ja/nee.
import type { Stand, Tekst } from './beheer-diagnostiek';

export const ACCOUNT_DIENSTEN = ['mail', 'agenda', 'drive', 'github', 'ai', 'apparaten', 'instellingen'] as const;
export type AccountDienst = (typeof ACCOUNT_DIENSTEN)[number];
export const isAccountDienst = (v: unknown): v is AccountDienst => typeof v === 'string' && (ACCOUNT_DIENSTEN as readonly string[]).includes(v);

export const DIENST_NAAM: Record<AccountDienst, Tekst> = {
  mail: ['Пошта (Gmail)', 'E-mail (Gmail)'],
  agenda: ['Календар', 'Agenda'],
  drive: ['Google Drive', 'Google Drive'],
  github: ['GitHub', 'GitHub'],
  ai: ['Підключення ШІ', 'AI-koppelingen'],
  apparaten: ['Пристрої (агенти)', 'Apparaten (agents)'],
  instellingen: ['Мої налаштування', 'Mijn instellingen'],
};

/** Welke servercontroles (shared/beheer-diagnostiek.ts) horen bij welke dienst. De slechtste laatste stand telt. */
export const SERVER_CONTROLES: Record<AccountDienst, readonly string[]> = {
  mail: ['dienst-mail', 'mail-gmail-api', 'mail-wachtrij', 'taak-mail'],
  agenda: ['dienst-hub', 'verb-google'],
  drive: ['dienst-cloud', 'cloud-drive-api', 'cloud-opslag'],
  github: ['dienst-github', 'verb-github'],
  ai: ['dienst-ai', 'ai-verbindingen', 'verb-oauth', 'verb-mcp'],
  apparaten: ['dienst-mcp', 'apparaten-agents', 'apparaten-commando'],
  instellingen: ['dienst-id', 'data-database'],
};

export type AccountUitslag = { dienst: AccountDienst; stand: Stand; code: string; op: number };
export type ServerCel = { stand: Stand | 'nooit'; op: number; controles: Array<{ id: string; stand: Stand }> };

/** Feiten over één account — uitsluitend tellingen en ja/nee (zie backend/diagnostiek-account.ts voor de bronnen). */
export type GoogleDienstFeit = { status: 'granted' | 'configuration_missing' | 'consent_required' | 'waiting_previous_consent' | 'onbekend'; gebonden: boolean; token?: 'ok' | 'fout' | 'niet-getest'; tokenCode?: string };
export type AccountFeiten = {
  accountStatus: string;
  google: { mail: GoogleDienstFeit; drive: GoogleDienstFeit; calendar: GoogleDienstFeit } | null;
  mailAccounts: { totaal: number; verbonden: number; herstelNodig: number; gestoord: number };
  mailWachtrij: { vast: number; mislukt24: number };
  github: { gekoppeld: boolean; fout?: boolean };
  ai: { actief: number; bijnaVerlopen: number };
  apparaten: { totaal: number; verbonden: number; stil: number };
  instellingen: { leesbaar: boolean };
};

const ORDE: Record<Stand, number> = { ok: 0, onbekend: 1, 'let-op': 2, fout: 3 };
export const slechtste = (s: Stand[]): Stand => s.reduce<Stand>((a, b) => (ORDE[b] > ORDE[a] ? b : a), 'ok');
const r = (stand: Stand, code = '') => ({ stand, code });

function googleStand(g: GoogleDienstFeit | undefined, prefix: string): { stand: Stand; code: string } {
  if (!g || g.status === 'onbekend') return r('onbekend', 'GEEN_GEGEVENS');
  if (g.status === 'configuration_missing') return r('onbekend', 'SERVER_NIET_INGESTELD');
  if (g.status === 'consent_required' || g.status === 'waiting_previous_consent') return r('let-op', `${prefix}_NIET_GEKOPPELD`);
  if (!g.gebonden) return r('fout', `${prefix}_KOPPELING_ZONDER_TOESTEMMING`);
  if (g.token === 'fout') return r('fout', /^[A-Z0-9_]{1,40}$/.test(g.tokenCode || '') ? String(g.tokenCode) : `${prefix}_TOKEN_ONGELDIG`);
  return r('ok');
}

/** Zuiver: feiten → stand per dienst voor DIT account. */
export function beoordeelAccount(f: AccountFeiten): Record<AccountDienst, { stand: Stand; code: string }> {
  const mailG = googleStand(f.google?.mail, 'GMAIL');
  const mail = mailG.stand !== 'ok' ? mailG
    : f.mailAccounts.herstelNodig > 0 ? r('fout', 'MAIL_OPNIEUW_AANMELDEN')
    : f.mailWachtrij.vast > 0 ? r('fout', 'MAIL_WACHTRIJ_VAST')
    : f.mailAccounts.gestoord > 0 ? r('let-op', 'MAIL_GESTOORD')
    : f.mailWachtrij.mislukt24 > 0 ? r('let-op', 'MAIL_VERZENDEN_MISLUKT')
    : r('ok');
  const geblokkeerd = !!f.accountStatus && !['approved', 'active'].includes(f.accountStatus);
  return {
    mail,
    agenda: googleStand(f.google?.calendar, 'AGENDA'),
    drive: googleStand(f.google?.drive, 'DRIVE'),
    github: f.github.fout ? r('onbekend', 'GITHUB_ONBEKEND') : f.github.gekoppeld ? r('ok') : r('let-op', 'GITHUB_NIET_GEKOPPELD'),
    ai: f.ai.actief === 0 ? r('let-op', 'AI_GEEN_KOPPELING') : f.ai.bijnaVerlopen > 0 ? r('let-op', 'AI_BIJNA_VERLOPEN') : r('ok'),
    apparaten: f.apparaten.totaal === 0 ? r('let-op', 'GEEN_APPARAAT') : f.apparaten.verbonden === 0 ? r('fout', 'APPARAAT_OFFLINE') : f.apparaten.stil > 0 ? r('let-op', 'APPARAAT_STIL') : r('ok'),
    instellingen: geblokkeerd ? r('fout', 'ACCOUNT_GEBLOKKEERD') : !f.instellingen.leesbaar ? r('fout', 'INSTELLINGEN_ONLEESBAAR') : r('ok'),
  };
}

/** Uitleg + advies per code, voor de gebruiker zelf (in de 2e persoon) en de beheerder. */
export const CODE_ADVIES: Record<string, { wat: Tekst; doe: Tekst }> = {
  GEEN_GEGEVENS: { wat: ['Немає даних про підключення Google.', 'Geen gegevens over de Google-koppeling.'], doe: ['Повторіть перевірку пізніше.', 'Probeer de controle later opnieuw.'] },
  SERVER_NIET_INGESTELD: { wat: ['На сервері ще не налаштоване підключення Google.', 'De Google-koppeling is op de server nog niet ingesteld.'], doe: ['Це питання до власника сайту, не до вашого акаунта.', 'Dit ligt bij de eigenaar van de site, niet bij uw account.'] },
  GMAIL_NIET_GEKOPPELD: { wat: ['Пошту Gmail ще не підключено.', 'Gmail is nog niet gekoppeld.'], doe: ['Відкрийте «Пошта» і натисніть «Підключити Gmail».', 'Open «Пошта» en klik op «Gmail koppelen».'] },
  AGENDA_NIET_GEKOPPELD: { wat: ['Календар ще не підключено.', 'De agenda is nog niet gekoppeld.'], doe: ['Підключіть календар у «Налаштування» → «Підключення».', 'Koppel de agenda via «Instellingen» → «Koppelingen».'] },
  DRIVE_NIET_GEKOPPELD: { wat: ['Google Drive ще не підключено.', 'Google Drive is nog niet gekoppeld.'], doe: ['Підключіть Drive у «Хмара».', 'Koppel Drive via «Cloud».'] },
  GMAIL_KOPPELING_ZONDER_TOESTEMMING: { wat: ['Підключення Gmail є, але дозвіл Google втрачено.', 'De Gmail-koppeling bestaat, maar de Google-toestemming is weg.'], doe: ['Підключіть Gmail ще раз (дозвіл на сторінці Google).', 'Koppel Gmail opnieuw (toestemming op de Google-pagina).'] },
  AGENDA_KOPPELING_ZONDER_TOESTEMMING: { wat: ['Дозвіл Google для календаря втрачено.', 'De Google-toestemming voor de agenda is weg.'], doe: ['Підключіть календар ще раз.', 'Koppel de agenda opnieuw.'] },
  DRIVE_KOPPELING_ZONDER_TOESTEMMING: { wat: ['Дозвіл Google для Drive втрачено.', 'De Google-toestemming voor Drive is weg.'], doe: ['Підключіть Drive ще раз.', 'Koppel Drive opnieuw.'] },
  GMAIL_TOKEN_ONGELDIG: { wat: ['Google більше не приймає доступ до пошти цього акаунта.', 'Google aanvaardt de toegang tot de mail van dit account niet meer.'], doe: ['Підключіть Gmail ще раз; якщо ви змінювали пароль Google — це очікувано.', 'Koppel Gmail opnieuw; na een gewijzigd Google-wachtwoord is dat normaal.'] },
  AGENDA_TOKEN_ONGELDIG: { wat: ['Google не приймає доступ до календаря.', 'Google aanvaardt de toegang tot de agenda niet.'], doe: ['Підключіть календар ще раз.', 'Koppel de agenda opnieuw.'] },
  DRIVE_TOKEN_ONGELDIG: { wat: ['Google не приймає доступ до Drive.', 'Google aanvaardt de toegang tot Drive niet.'], doe: ['Підключіть Drive ще раз.', 'Koppel Drive opnieuw.'] },
  MAIL_OPNIEUW_AANMELDEN: { wat: ['Поштова скринька чекає повторного входу.', 'Een postvak wacht op opnieuw aanmelden.'], doe: ['Відкрийте «Пошта» → «Скриньки» і увійдіть ще раз.', 'Open «Пошта» → «Postvakken» en meld opnieuw aan.'] },
  MAIL_WACHTRIJ_VAST: { wat: ['Заплановані листи застрягли в черзі.', 'Geplande mails zitten vast in de wachtrij.'], doe: ['Відкрийте «Заплановані» і надішліть ще раз або скасуйте.', 'Open «Gepland» en verstuur opnieuw of annuleer.'] },
  MAIL_GESTOORD: { wat: ['Синхронізація пошти працює з перебоями.', 'De mailsynchronisatie hapert.'], doe: ['Зачекайте кілька хвилин; якщо не минає — підключіть скриньку ще раз.', 'Wacht een paar minuten; blijft het, koppel het postvak opnieuw.'] },
  MAIL_VERZENDEN_MISLUKT: { wat: ['За добу були невдалі відправлення.', 'Er mislukten verzendingen in de afgelopen dag.'], doe: ['Перевірте адреси одержувачів і надішліть ще раз.', 'Controleer de ontvangers en verstuur opnieuw.'] },
  GITHUB_NIET_GEKOPPELD: { wat: ['GitHub не підключено.', 'GitHub is niet gekoppeld.'], doe: ['Підключіть токен GitHub у «GitHub» → «Підключення».', 'Koppel een GitHub-token via «GitHub» → «Koppeling».'] },
  GITHUB_ONBEKEND: { wat: ['Стан GitHub не вдалося прочитати.', 'De GitHub-stand kon niet worden gelezen.'], doe: ['Повторіть перевірку пізніше.', 'Probeer later opnieuw.'] },
  AI_GEEN_KOPPELING: { wat: ['Жоден ШІ-помічник не підключений до вашого простору.', 'Er is geen AI-assistent aan uw ruimte gekoppeld.'], doe: ['Якщо потрібно — підключіть у «Агенти» → «Конектори».', 'Indien nodig: koppel via «Agenten» → «Connectors».'] },
  AI_BIJNA_VERLOPEN: { wat: ['Підключення ШІ скоро закінчиться.', 'Een AI-koppeling verloopt binnenkort.'], doe: ['Підключіть помічника ще раз, щоб він не втратив доступ.', 'Koppel de assistent opnieuw zodat de toegang niet wegvalt.'] },
  GEEN_APPARAAT: { wat: ['Жоден пристрій не підключено.', 'Er is geen apparaat gekoppeld.'], doe: ['Встановіть локального агента на свій комп’ютер, якщо він потрібен.', 'Installeer de lokale agent op uw computer als u die nodig hebt.'] },
  APPARAAT_OFFLINE: { wat: ['Жоден ваш пристрій зараз не на зв’язку.', 'Geen van uw apparaten is nu verbonden.'], doe: ['Увімкніть комп’ютер і перевірте, що агент запущений.', 'Zet de computer aan en controleer of de agent draait.'] },
  APPARAAT_STIL: { wat: ['Деякі пристрої давно не подавали сигнал.', 'Sommige apparaten gaven al lang geen signaal.'], doe: ['Перезапустіть агента на цьому пристрої.', 'Herstart de agent op dat apparaat.'] },
  ACCOUNT_GEBLOKKEERD: { wat: ['Обліковий запис не активний (очікує схвалення або заблокований).', 'Het account is niet actief (wacht op goedkeuring of geblokkeerd).'], doe: ['Зверніться до власника сайту.', 'Neem contact op met de eigenaar van de site.'] },
  INSTELLINGEN_ONLEESBAAR: { wat: ['Ваші налаштування не вдалося прочитати.', 'Uw instellingen konden niet worden gelezen.'], doe: ['Оновіть сторінку; якщо повторюється — повідомте власника.', 'Vernieuw de pagina; blijft het, meld het de eigenaar.'] },
};
export const adviesVoor = (code: string): { wat: Tekst; doe: Tekst } | null => (code ? CODE_ADVIES[code] ?? { wat: [`Код: ${code}`, `Code: ${code}`], doe: ['Повторіть перевірку; якщо не минає — повідомте власника.', 'Probeer opnieuw; blijft het, meld het de eigenaar.'] } : null);

/** Serverkolom: slechtste laatste stand van de controles van die dienst. */
export function serverCel(dienst: AccountDienst, laatste: Record<string, { stand: Stand; op: number } | undefined>): ServerCel {
  const c = SERVER_CONTROLES[dienst].map((id) => ({ id, u: laatste[id] })).filter((x) => x.u) as Array<{ id: string; u: { stand: Stand; op: number } }>;
  if (!c.length) return { stand: 'nooit', op: 0, controles: [] };
  return { stand: slechtste(c.map((x) => x.u.stand)), op: Math.min(...c.map((x) => x.u.op)), controles: c.map((x) => ({ id: x.id, stand: x.u.stand })) };
}

export type Conclusie = 'alles-ok' | 'server' | 'account' | 'beide' | 'onbekend';
/** Waar zit het probleem? `server` = raakt iedereen; `account` = alleen dit account. */
export function conclusie(server: Stand | 'nooit', account: Stand | 'nooit'): Conclusie {
  const s = server === 'fout' || server === 'let-op', a = account === 'fout' || account === 'let-op';
  if (s && a) return 'beide';
  if (s) return 'server';
  if (a) return 'account';
  if (server === 'ok' && account === 'ok') return 'alles-ok';
  return 'onbekend';
}
export const CONCLUSIE_TEKST: Record<Conclusie, Tekst> = {
  'alles-ok': ['Усе гаразд — і на сервері, і в цьому акаунті.', 'Alles in orde — op de server en in dit account.'],
  server: ['Проблема на сервері — вона стосується всіх, не лише цього акаунта.', 'Probleem op de server — het raakt iedereen, niet alleen dit account.'],
  account: ['Сервер справний — проблема лише в цьому акаунті (підключення, токен або пристрій).', 'De server is in orde — het probleem zit alleen in dit account (koppeling, token of apparaat).'],
  beide: ['Збій і на сервері, і в акаунті — спершу дочекайтеся відновлення сервера.', 'Storing op de server én in het account — wacht eerst tot de server hersteld is.'],
  onbekend: ['Даних замало — запустіть перевірку.', 'Te weinig gegevens — start de controle.'],
};

export type TabelRij = { dienst: AccountDienst; naam: Tekst; server: ServerCel | null; account: AccountUitslag | null; conclusie: Conclusie };
/** De tabel «Сервер (для всіх) / Цей акаунт». `server` = null betekent: kolom niet tonen (gewone gebruiker). */
export function tabel(server: Record<string, { stand: Stand; op: number } | undefined> | null, account: AccountUitslag[]): TabelRij[] {
  const perDienst = new Map(account.map((u) => [u.dienst, u]));
  return ACCOUNT_DIENSTEN.map((d) => {
    const s = server ? serverCel(d, server) : null;
    const a = perDienst.get(d) ?? null;
    // Gewone gebruiker: zonder serverkolom alleen het eigen account beoordelen.
    return { dienst: d, naam: DIENST_NAAM[d], server: s, account: a, conclusie: conclusie(s ? s.stand : 'ok', a ? a.stand : 'nooit') };
  });
}

/** Schone uitslag (controle op vorm) — wat uit de database of van de client komt, gaat hier eerst doorheen. */
export function schoonAccountUitslag(u: unknown): AccountUitslag | null {
  if (!u || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  if (!isAccountDienst(o.dienst) || !['ok', 'let-op', 'fout', 'onbekend'].includes(String(o.stand))) return null;
  const code = typeof o.code === 'string' && /^[A-Z0-9_]{0,40}$/.test(o.code) ? o.code : '';
  return { dienst: o.dienst, stand: o.stand as Stand, code, op: Number(o.op) || 0 };
}
