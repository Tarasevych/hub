// UI-010 fase 2: eigen meldingen van de Mijn Ruimte-scripts in de terminal in de taal van de pagina (uk/nl).
//
// Waarom zo (en niet in de scripts zelf): het logboek in de database blijft het ECHTE, ongewijzigde logboek (kopiëren/downloaden
// geven altijd de originele regels). De vertaling gebeurt alleen bij het tonen, dus de taal wisselt mee zonder de installatie te
// herstarten of de pagina te herladen. Alleen regels met het voorvoegsel van onze eigen scripts ([installeer] / [uitrol]) én een
// bekend patroon worden vertaald; variabelen (paden, versies, codes, getallen) gaan letterlijk mee uit de oorspronkelijke regel.
// Uitvoer van derden (npm, tar, systemd, psql, …) wordt NOOIT vertaald. Onbekende eigen regels: alleen het voorvoegsel
// (LET OP/FOUT/stap) wordt vertaald, de rest blijft letterlijk.
type Patroon = [RegExp, (m: RegExpMatchArray) => string];
const v = (m: RegExpMatchArray, i: number) => m[i] ?? '';

const STAPPEN: Record<string, string> = {
  'PostgreSQL-versie controleren': 'перевірка версії PostgreSQL', 'back-up van de database': 'резервна копія бази даних', databasemigraties: 'міграції бази даних',
  'overschakelen en de dienst herstarten': 'перемикання й перезапуск служби', gezondheidscontrole: 'перевірка роботи сайту', 'ontbrekende geheimen aanmaken': 'створення відсутніх секретів',
  'broncode kopiëren': 'копіювання коду',
};
const INSTALLEER: Patroon[] = [
  [/^migraties uitvoeren…$/, () => 'виконання міграцій…'],
  [/^back-up vóór migratie…$/, () => 'резервна копія перед міграцією…'],
  [/^back-up mislukt; oorzaak volgens de dienst:$/, () => 'резервна копія не вдалася; причина за словами служби:'],
  [/^bouwen \(npm ci, audit, vite, server-bundel\)…$/, () => 'збірка (npm ci, audit, vite, серверна збірка)…'],
  [/^nog één poging over 20 s…$/, () => 'ще одна спроба через 20 с…'],
  [/^veilige uitrol ingericht$/, () => 'безпечне розгортання налаштовано'],
  [/^goedgekeurd: via SSH als root \(zonder passkey\)$/, () => 'схвалено: через SSH як root (без passkey)'],
  [/^map: (.+)$/, (m) => `тека: ${v(m, 1)}`],
  [/^versie in deze map \(UITROL-VERSIE\): (.*?)\s+\|\s+nu actief: (.*)$/, (m) => `версія в цій теці (UITROL-VERSIE): ${v(m, 1)}   |   зараз активна: ${v(m, 2)}`],
  [/^nabewaking: nieuwe release (\S+) s onder toezicht…$/, (m) => `нагляд: новий випуск ${v(m, 1)} с під наглядом…`],
  [/^nabewaking: (\S+) s stabiel$/, (m) => `нагляд: ${v(m, 1)} с стабільно`],
  [/^nazorg: (\S+) min lang wordt automatisch teruggedraaid als de site faalt$/, (m) => `нагляд після встановлення: ${v(m, 1)} хв автоматичного відкату, якщо сайт не працюватиме`],
  [/^rendercontrole \((.+)\)…$/, (m) => `перевірка відображення (${v(m, 1)})…`],
  [/^pakketten installeren: (.+)$/, (m) => `встановлення пакетів: ${v(m, 1)}`],
  [/^pakketgegevens: (.+)$/, (m) => `дані пакета: ${v(m, 1)}`],
  [/^automatisch terug naar (.+)$/, (m) => `автоматичний відкат до ${v(m, 1)}`],
  [/^migraties worden NIET teruggedraaid; het databaseschema blijft op de nieuwste stand$/, () => 'міграції НЕ відкочуються; схема бази лишається найновішою'],
  [/^gezondheidscontrole mislukt \((.+?)\); (.+)$/, (m) => `перевірка роботи сайту не вдалася (${v(m, 1)}); ${v(m, 2)}`],
  [/^nabewaking mislukt; (.+)$/, (m) => `нагляд не вдався; ${v(m, 1)}`],
  [/^stap: (\S+) \((\d+)%\) ?(.*)$/, (m) => `крок: ${v(m, 1)} (${v(m, 2)}%) ${STAPPEN[v(m, 3)] ?? v(m, 3)}`.trimEnd()],
];
const UITROL: Patroon[] = [
  [/^er loopt al een uitrol$/, () => 'вже виконується інше розгортання'],
  [/^geen pakket in de inbox$/, () => 'у вхідній теці немає пакета'],
  [/^inbox (.+) ontbreekt$/, (m) => `вхідної теки ${v(m, 1)} немає`],
  [/^run (\S+): pakket (\S+) ontvangen \((.+)\)$/, (m) => `запуск ${v(m, 1)}: пакет ${v(m, 2)} отримано (${v(m, 3)})`],
  [/^passkey-goedkeuring geldig voor (.+)$/, (m) => `схвалення passkey дійсне для ${v(m, 1)}`],
  [/^handtekening geldig voor (.+)$/, (m) => `підпис дійсний для ${v(m, 1)}`],
  [/^archief bewaard: (\S+) \((\d+) bytes, sha256 (\S+)\)$/, (m) => `архів збережено: ${v(m, 1)} (${v(m, 2)} байт, sha256 ${v(m, 3)})`],
  [/^archief: geen kopie om te bewaren$/, () => 'архів: немає копії для збереження'],
  [/^archief: kopiëren mislukt$/, () => 'архів: копіювання не вдалося'],
  [/^klaar: (.+)$/, (m) => `готово: ${v(m, 1)}`],
  [/^installatie mislukt \(afsluitcode (\S+)\): (.*)$/, (m) => `встановлення не вдалося (код виходу ${v(m, 1)}): ${v(m, 2)}`],
  [/^GEWEIGERD: (.*)$/, (m) => `ВІДХИЛЕНО: ${v(m, 1)}`],
  [/^AFGEBROKEN \((\S+)\): (.*)$/, (m) => `ПЕРЕРВАНО (${v(m, 1)}): ${v(m, 2)}`],
];

export type TerminalVertaling = { tekst: string; vertaald: boolean };

/** Vertaalt één regel naar uk als het een bekende eigen melding is; anders (of bij nl) ongewijzigd. ANSI-codes blijven staan. */
export function vertaalRegel(tekst: string, lang: 'uk' | 'nl'): TerminalVertaling {
  if (lang !== 'uk') return { tekst, vertaald: false };
  const m = /^((?:\x1b\[[0-9;]*m)*)\[(installeer|uitrol)\] (.*)$/s.exec(tekst);
  if (!m) return { tekst, vertaald: false };
  const [, ansi, bron, rest0] = m;
  let voor = ''; let rest = rest0;
  const pre = /^(LET OP|FOUT): (.*)$/s.exec(rest);
  if (pre) { voor = pre[1] === 'FOUT' ? 'ПОМИЛКА: ' : 'УВАГА: '; rest = pre[2]; }
  for (const [re, f] of bron === 'installeer' ? INSTALLEER : UITROL) {
    const r = rest.match(re);
    if (r) return { tekst: `${ansi}[${bron}] ${voor}${f(r)}`, vertaald: true };
  }
  return voor ? { tekst: `${ansi}[${bron}] ${voor}${rest}`, vertaald: true } : { tekst, vertaald: false };
}
