// UITROL-001 · Перевірка вимог до встановлення (preflight) — спільні типи й чисті правила для браузера, сервера й тестів.
// UITROL-001 · Vereistencontrole vóór het uploaden — gedeelde typen en pure regels voor browser, server en tests.
//
// Waarom (09.11.2026): release 20261109-065647 kwam door alle controles, werd volledig geüpload en viel pas minuten later om bij
// «databasemigraties»: migratie 0200 schreef een omschrijving van 301 tekens terwijl de database (CHECK feature_flags_omschrijving_check)
// er 300 toelaat. De voorcontrole keek alleen naar namen en nummering — een CHECK bestaat alleen in de database zelf.
// Nu: de browser leest het archief lokaal, stuurt alleen de beschrijving en de SQL van de NIEUWE migraties (enkele KB) en de server
// beoordeelt de vereisten vóór er één megabyte wordt verstuurd. De migratieproef draait op een wegwerpkopie van het schema
// (deploy/uitrol/mijn-ruimte-migratie-proef.sh) — de productiedatabase wordt nooit geraakt.
// Чому: архів пройшов усі перевірки, повністю завантажився й упав лише на кроці міграцій. Тепер вимоги перевіряються ДО завантаження.

export type VereisteNiveau = 'ok' | 'fout' | 'waarschuwing' | 'wacht' | 'bezig' | 'overgeslagen';
export type VereisteGroep = 'archief' | 'herkomst' | 'compatibiliteit' | 'server';
export const GROEPEN: ReadonlyArray<{ id: VereisteGroep; uk: string; nl: string; icoon: string }> = [
  { id: 'archief', uk: 'Архів', nl: 'Archief', icoon: 'package' },
  { id: 'herkomst', uk: 'Походження й безпека', nl: 'Herkomst en veiligheid', icoon: 'fingerprint' },
  { id: 'compatibiliteit', uk: 'Сумісність із цим сервером', nl: 'Compatibel met deze server', icoon: 'database' },
  { id: 'server', uk: 'Готовність сервера', nl: 'Server gereed', icoon: 'server' },
];

/** Eén vereiste: wat, waarom het telt (uitleg over de gevolgen), de uitkomst en hoe lang de controle duurde. */
export type Vereiste = {
  id: string; groep: VereisteGroep; niveau: VereisteNiveau;
  uk: string; nl: string;
  /** Wat er gevonden is (waarde), kort. */
  waardeUk?: string; waardeNl?: string;
  /** Waarom deze vereiste bestaat en wat er gebeurt als ze faalt — tooltip «?». */
  waaromUk: string; waaromNl: string;
  /** Duur van de controle in ms (null = niet gemeten). */
  ms?: number | null;
  details?: string[];
  /** Bij de migratieproef: de precieze oorzaak. */
  oorzaak?: MigratieOorzaak | null;
};

export type MigratieOorzaak = {
  migratie: string; regel: number | null; code: string; bericht: string; detail?: string; hint?: string;
  constraint?: string; tabel?: string; kolom?: string; definitie?: string; fragment?: string; teLang?: { lengte: number; grens: number } | null;
  uitlegUk: string; uitlegNl: string; actieUk: string; actieNl: string;
};

/** Wat de browser over het archief meestuurt (geen inhoud behalve de SQL van nieuwe migraties, in een tweede verzoek). */
export type ArchiefBeschrijving = {
  bestand: string; bytes: number; versie: string; commit: string; bovenmap: string; bestanden: number;
  auteur: string; agent: string; samenvattingTekens: number; manifest: boolean; manifestFouten: number; installer: boolean;
  basis: { versie: string; commit: string } | null;
  migraties: Array<{ naam: string; bytes: number }>;
  problemen: string[];
  /** Duur van het lokale lezen in de browser (ms). */
  leesMs: number;
};

export type MigratieProefUitslag = {
  id: string; ok: boolean; status: 'bezig' | 'klaar' | 'mislukt' | 'niet-beschikbaar' | 'fout';
  code?: string; tijd: string;
  stappen: Array<{ id: 'kopie' | 'schema' | 'migraties' | 'opruimen'; ms: number; ok: boolean }>;
  migraties: Array<{ naam: string; ms: number; ok: boolean; fout?: { code: string; bericht: string; detail?: string; hint?: string; constraint?: string; tabel?: string; kolom?: string; regel?: number | null; definitie?: string; fragment?: string;
    /** Bij een lengtebeperking: gevonden lengte tegen de grens (bv. 301 > 300). */ teLang?: { lengte: number; grens: number } | null } }>;
  pg?: string; log?: string[];
};

export type VereistenAntwoord = {
  id: string; tijd: string; ok: boolean; klaar: boolean; ms: number;
  vereisten: Vereiste[];
  /** Nieuwe migraties waarvan de server de SQL nodig heeft voor de proef (leeg = niets te proberen). */
  nieuweMigraties: string[];
  proef: { status: 'niet-nodig' | 'wacht-op-sql' | 'bezig' | 'klaar' | 'niet-beschikbaar'; uitslag?: MigratieProefUitslag | null };
  log: VereisteLogRegel[];
};
export type VereisteLogRegel = { t: string; niveau: 'info' | 'ok' | 'fout' | 'waarschuwing'; tekst: string };

export const MIGRATIE_NAAM = /^\d{4}_[a-z0-9_]+$/;
export const PROEF_MAX_MIGRATIES = 60;
export const PROEF_MAX_BYTES = 1024 * 1024; // 1 MB SQL in totaal
export const PROEF_DB_RE = /^mijnruimte_proef_[a-z0-9_]{1,40}$/;

/**
 * Задокументовані історичні перейменування міграцій жовтня 2026 року: у базах даних лишився запис зі старою назвою
 * поруч із новою канонічною назвою. Якщо в архіві присутня канонічна міграція-спадкоємиця, такий запис вважається
 * підтвердженим історичним перейменуванням. Відсутність будь-якої іншої застосованої міграції блокує встановлення (MIGRATIES_ONTBREKEN).
 *
 * Gedocumenteerde historische hernoemingen uit oktober 2026: alleen wanneer de canonieke opvolger in het archief staat,
 * geldt dit als bevestigde historische hernoeming; elke echt ontbrekende toegepaste migratie blokkeert het pakket (MIGRATIES_ONTBREKEN).
 */
export const HISTORISCH_HERNOEMDE_MIGRATIES: Readonly<Record<string, string>> = Object.freeze({
  '0093_globaal_zoeken_laatste': '0093_zoek_index',
  '0094_zoekindex': '0094_zoek_rls',
});

export type ToegepasteMigratiesBeoordeling = {
  echtOntbrekend: string[];
  historischHernoemd: Array<{ oud: string; nieuw: string }>;
};

export function beoordeelToegepasteMigraties(
  namenInArchief: Iterable<string>,
  toegepast: Iterable<string> | null | undefined,
): ToegepasteMigratiesBeoordeling {
  if (!toegepast) return { echtOntbrekend: [], historischHernoemd: [] };
  const aanwezig = new Set(namenInArchief);
  const echtOntbrekend: string[] = [];
  const historischHernoemd: Array<{ oud: string; nieuw: string }> = [];
  for (const ruw of toegepast) {
    const naam = String(ruw || '').trim();
    if (!naam || naam === 'rechten' || aanwezig.has(naam)) continue;
    const opvolger = HISTORISCH_HERNOEMDE_MIGRATIES[naam];
    if (opvolger && aanwezig.has(opvolger)) {
      historischHernoemd.push({ oud: naam, nieuw: opvolger });
    } else {
      echtOntbrekend.push(naam);
    }
  }
  historischHernoemd.sort((a, b) => a.oud.localeCompare(b.oud));
  echtOntbrekend.sort();
  return { echtOntbrekend, historischHernoemd };
}

/** Regelnummer (1-gebaseerd) bij een PostgreSQL-«position» (1-gebaseerde tekenpositie in de verzonden SQL). */
export function positieNaarRegel(sql: string, positie: number | string | undefined | null): number | null {
  const p = Number(positie);
  if (!Number.isFinite(p) || p < 1) return null;
  const tot = Array.from(sql).slice(0, p - 1).join('');
  return tot.split('\n').length;
}

/** Geen «position» (bv. een CHECK-schending): de eerste regel die de tabel schrijft (INSERT/UPDATE … <tabel>). */
export function regelVoorTabel(sql: string, tabel?: string | null): number | null {
  if (!tabel) return null;
  const re = new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|ALTER\\s+TABLE)\\s+(?:"?\\w+"?\\.)?"?${tabel.replace(/[^\w]/g, '')}"?\\b`, 'i');
  const i = sql.split('\n').findIndex((r) => re.test(r));
  return i >= 0 ? i + 1 : null;
}

/** Bij een lengtebeperking (char_length/length(kolom) <= N): de langste tekstwaarde in de SQL die de grens overschrijdt. */
export function teLangeTekst(sql: string, definitie?: string | null): { lengte: number; grens: number; regel: number } | null {
  const m = /(?:char_length|length)\(\w+\)\s*<=?\s*(\d+)/i.exec(String(definitie || ''));
  if (!m) return null;
  const grens = Number(m[1]) - (/<=/.test(m[0]) ? 0 : 1);
  let beste: { lengte: number; grens: number; regel: number } | null = null;
  const re = /'((?:[^']|'')*)'/g; let x: RegExpExecArray | null;
  while ((x = re.exec(sql))) {
    const lengte = Array.from(x[1].replace(/''/g, "'")).length;
    if (lengte > grens && (!beste || lengte > beste.lengte)) beste = { lengte, grens, regel: sql.slice(0, x.index).split('\n').length };
  }
  return beste;
}

/** De regel (en één ervoor/erna) rond het foutpunt, afgekapt — alleen de SQL uit het pakket zelf. */
export function fragmentRond(sql: string, regel: number | null, omtrek = 1): string {
  if (!regel) return '';
  const regels = sql.split('\n');
  const van = Math.max(0, regel - 1 - omtrek), tot = Math.min(regels.length, regel + omtrek);
  return regels.slice(van, tot).map((r, i) => `${String(van + i + 1).padStart(4)} │ ${r.slice(0, 220)}`).join('\n');
}

const PG_UITLEG: Record<string, [string, string, string, string]> = {
  '23514': ['Новий рядок порушує обмеження CHECK у базі.', 'Een nieuwe rij schendt een CHECK-beperking in de database.', 'Приведіть значення у міграції до вимоги обмеження (наприклад, довжина тексту) і зберіть новий випуск.', 'Pas de waarde in de migratie aan de beperking aan (bijv. tekstlengte) en bouw een nieuwe release.'],
  '23505': ['Запис із таким ключем уже існує (унікальність).', 'Er bestaat al een rij met deze sleutel (uniek).', 'Додайте ON CONFLICT … DO NOTHING/UPDATE або змініть ключ.', 'Voeg ON CONFLICT … DO NOTHING/UPDATE toe of wijzig de sleutel.'],
  '23502': ['Порожнє значення в колонці NOT NULL.', 'Lege waarde in een NOT NULL-kolom.', 'Задайте значення або DEFAULT для колонки.', 'Geef een waarde of DEFAULT voor de kolom.'],
  '23503': ['Посилання на запис, якого немає (зовнішній ключ).', 'Verwijzing naar een rij die niet bestaat (vreemde sleutel).', 'Створіть спершу запис, на який посилаєтеся, або змініть порядок міграцій.', 'Maak eerst de rij waarnaar verwezen wordt of wijzig de volgorde.'],
  '22001': ['Значення задовге для типу колонки.', 'Waarde te lang voor het kolomtype.', 'Скоротіть значення або розширте тип колонки.', 'Kort de waarde in of verruim het kolomtype.'],
  '42601': ['Синтаксична помилка SQL.', 'SQL-syntaxisfout.', 'Виправте SQL у вказаному рядку.', 'Herstel de SQL op de aangegeven regel.'],
  '42P01': ['Таблиці не існує.', 'De tabel bestaat niet.', 'Перевірте назву й схему (app.…) або порядок міграцій.', 'Controleer naam en schema (app.…) of de volgorde van de migraties.'],
  '42703': ['Колонки не існує.', 'De kolom bestaat niet.', 'Перевірте назву колонки або додайте її попередньою міграцією.', 'Controleer de kolomnaam of voeg haar in een eerdere migratie toe.'],
  '42P07': ['Такий обʼєкт уже існує.', 'Dit object bestaat al.', 'Використайте IF NOT EXISTS або перевірте, чи міграцію не дубльовано.', 'Gebruik IF NOT EXISTS of controleer op een dubbele migratie.'],
  '42710': ['Такий обʼєкт уже існує.', 'Dit object bestaat al.', 'Використайте IF NOT EXISTS / DROP … IF EXISTS.', 'Gebruik IF NOT EXISTS / DROP … IF EXISTS.'],
  '42883': ['Функції з такими аргументами немає.', 'Er is geen functie met deze argumenten.', 'Перевірте назву, схему й типи аргументів.', 'Controleer naam, schema en argumenttypen.'],
  '42501': ['Бракує прав ролі міграцій.', 'De migratierol heeft onvoldoende rechten.', 'Обʼєкт має належати ролі mijnruimte_migrator або потрібен GRANT у rechten.sql.', 'Het object moet van mijnruimte_migrator zijn of er is een GRANT in rechten.sql nodig.'],
  '42804': ['Невідповідність типів.', 'Typen komen niet overeen.', 'Додайте явне приведення типу (::тип).', 'Voeg een expliciete cast toe (::type).'],
  '55P03': ['Не вдалося отримати блокування вчасно.', 'Vergrendeling niet op tijd verkregen.', 'Повторіть перевірку; на копії схеми таке трапляється рідко.', 'Herhaal de controle; op de schemakopie gebeurt dit zelden.'],
  '57014': ['Міграція виконувалась задовго (statement_timeout).', 'De migratie duurde te lang (statement_timeout).', 'Розбийте важку міграцію або зробіть її інкрементною.', 'Splits de zware migratie of maak haar incrementeel.'],
  '25001': ['У міграції є власні BEGIN/COMMIT.', 'De migratie bevat eigen BEGIN/COMMIT.', 'Приберіть керування транзакцією: кожну міграцію вже обгорнуто в транзакцію.', 'Verwijder transactiebeheer: elke migratie draait al in een transactie.'],
};

/** Mensentaal bij een PostgreSQL-foutcode: wat er mis is en wat te doen (uk + nl). */
export function pgUitleg(code: string, constraint?: string, definitie?: string, teLang?: { lengte: number; grens: number } | null): Pick<MigratieOorzaak, 'uitlegUk' | 'uitlegNl' | 'actieUk' | 'actieNl'> {
  if (teLang) return { uitlegUk: `Текст має ${teLang.lengte} знаків, а база дозволяє не більше ${teLang.grens}${constraint ? ` (${constraint})` : ''}.`, uitlegNl: `De tekst heeft ${teLang.lengte} tekens, de database staat er hoogstens ${teLang.grens} toe${constraint ? ` (${constraint})` : ''}.`,
    actieUk: `Скоротіть текст у міграції щонайменше на ${teLang.lengte - teLang.grens} знак(и) і зберіть новий випуск.`, actieNl: `Kort de tekst in de migratie met minstens ${teLang.lengte - teLang.grens} teken(s) in en bouw een nieuwe release.` };
  const u = PG_UITLEG[code] || ['Міграція завершилась помилкою бази даних.', 'De migratie eindigde met een databasefout.', 'Відкрийте деталі й виправте міграцію у вказаному рядку.', 'Open de details en herstel de migratie op de aangegeven regel.'];
  const extra = constraint ? [` Обмеження: ${constraint}${definitie ? ` (${definitie})` : ''}.`, ` Beperking: ${constraint}${definitie ? ` (${definitie})` : ''}.`] : ['', ''];
  return { uitlegUk: u[0] + extra[0], uitlegNl: u[1] + extra[1], actieUk: u[2], actieNl: u[3] };
}

/** Samenvatting voor de kop/melding: «17 з 18», blokkerend of niet. */
export function telVereisten(v: ReadonlyArray<Pick<Vereiste, 'niveau'>>): { totaal: number; ok: number; fout: number; waarschuwing: number; open: number; blokkeert: boolean } {
  const tel = (n: VereisteNiveau) => v.filter((x) => x.niveau === n).length;
  const fout = tel('fout'); const open = tel('wacht') + tel('bezig');
  return { totaal: v.length, ok: tel('ok'), fout, waarschuwing: tel('waarschuwing'), open, blokkeert: fout > 0 };
}

/** Een mislukte proef → één «Vereiste»-oorzaak met uitleg (zonder iets anders te weten dan de proefuitslag en de SQL). */
export function oorzaakUitProef(u: MigratieProefUitslag, sqlVan?: (naam: string) => string | undefined): MigratieOorzaak | null {
  const m = u.migraties.find((x) => !x.ok && x.fout);
  if (!m || !m.fout) return null;
  const f = m.fout;
  const sql = sqlVan?.(m.naam) || '';
  const regel = f.regel ?? null;
  return { migratie: m.naam, regel, code: f.code, bericht: f.bericht, detail: f.detail, hint: f.hint, constraint: f.constraint, tabel: f.tabel, kolom: f.kolom,
    definitie: f.definitie, fragment: f.fragment || (sql ? fragmentRond(sql, regel) : ''), teLang: f.teLang ?? null, ...pgUitleg(f.code, f.constraint, f.definitie, f.teLang) };
}
