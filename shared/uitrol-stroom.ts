// Розумний потік розгортання: інтелектуальні нотатки, контекстні контрольні списки та автоматичні докази перевірок.
// Slimme uitrolstroom: intelligente notities, contextafhankelijke controlelijsten en automatisch bewijs van controles.
//
// Пуристично без Node і без DOM: той самий код виконується на сервері, у браузері та в модульних тестах.
import type { Manifest } from './uitrol-manifest';
import type { VereistenAntwoord } from './uitrol-vereisten';

export type StroomTaal = 'uk' | 'nl';
export type StroomNotitieSoort = 'ai-duiding' | 'eigenaar' | 'systeem';
export type StroomRisico = 'laag' | 'normaal' | 'verhoogd' | 'kritiek';
export type ControlelijstGroep = 'voorbereiding' | 'veiligheid' | 'migraties' | 'goedkeuring' | 'nazorg' | 'eigen';
export type ControlelijstStatus = 'open' | 'geslaagd' | 'waarschuwing' | 'mislukt' | 'overgeslagen' | 'afgevinkt';
export type ControlelijstHerkomst = 'systeem' | 'eigenaar' | 'ai';
export type BewijsSoort =
  | 'pakket-integriteit'
  | 'vereisten-preflight'
  | 'migratie-proef'
  | 'voorcontrole'
  | 'ontwikkelarchief'
  | 'testresultaten'
  | 'goedkeuring-passkey'
  | 'installatie-uitvoering'
  | 'server-diagnose'
  | 'telegram-archief'
  | 'github-ontvangst';
export type BewijsStatus = 'geslaagd' | 'waarschuwing' | 'mislukt' | 'overgeslagen';

export type StroomNotitie = {
  id: string;
  versie: string;
  voorstelId: string | null;
  runId: string;
  soort: StroomNotitieSoort;
  risico: StroomRisico;
  titelUk: string;
  titelNl: string;
  inhoudUk: string;
  inhoudNl: string;
  onderdelen: string[];
  vastgepind: boolean;
  geschoond: boolean;
  auteur: string;
  sleutel: string | null;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type ControlelijstItem = {
  id: string;
  versie: string;
  voorstelId: string | null;
  runId: string;
  sleutel: string;
  groep: ControlelijstGroep;
  herkomst: ControlelijstHerkomst;
  verplicht: boolean;
  handmatigBevestigen: boolean;
  titelUk: string;
  titelNl: string;
  toelichtingUk: string;
  toelichtingNl: string;
  status: ControlelijstStatus;
  reden: string;
  bewijsSoort: string;
  volgorde: number;
  bijgewerktDoor: string;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type StroomBewijs = {
  id: string;
  versie: string;
  voorstelId: string | null;
  runId: string;
  soort: BewijsSoort;
  bron: string;
  status: BewijsStatus;
  samenvattingUk: string;
  samenvattingNl: string;
  pakketSha256: string;
  bewijsData: Record<string, unknown>;
  bewijsHash: string;
  vorigeHash: string;
  geschoond: boolean;
  aangemaaktOp: string;
  integriteitOk?: boolean;
};

export type StroomDuidingFactor = {
  ernst: 'info' | 'waarschuwing' | 'kritiek';
  uk: string;
  nl: string;
};

export type StroomDuidingResultaat = {
  risico: StroomRisico;
  score: number;
  gebieden: string[];
  factoren: StroomDuidingFactor[];
  titelUk: string;
  titelNl: string;
  samenvattingUk: string;
  samenvattingNl: string;
  aanbevelingenUk: string[];
  aanbevelingenNl: string[];
  aiPrompt: { systeem: string; vraag: string };
};

export type StroomGereedheid = {
  totaal: number;
  afgerond: number;
  openVerplicht: number;
  mislukt: number;
  waarschuwing: number;
  geblokkeerd: boolean;
  voortgangPct: number;
};

export type StroomVersieKeuze = {
  versie: string;
  bron: 'voorstel' | 'run' | 'actief' | 'stroom';
  status: string;
  tijd: string;
  isActief: boolean;
  voorstelId?: string;
  runId?: string;
};

export type StroomOverzicht = {
  versie: string;
  ruimte: 'technisch';
  actieveVersie: string | null;
  voorstel: {
    id: string;
    status: string;
    sha256: string;
    bytes: number;
    voorbereider: string;
    commit: string;
    aangemaaktOp: string;
    beslistOp?: string;
    beslistDoor?: string;
  } | null;
  run: {
    id: string;
    staat: string;
    methode: string;
    stap: string;
    pct: number;
    code: string;
    gestartOp: string;
    geeindigdOp?: string;
    pakketSha256?: string;
  } | null;
  duiding: StroomDuidingResultaat;
  notities: StroomNotitie[];
  controlelijst: ControlelijstItem[];
  gereedheid: StroomGereedheid;
  bewijzen: StroomBewijs[];
  ketenIntegriteit: { ok: boolean; aantal: number; fouten: string[] };
  versies: StroomVersieKeuze[];
};

export type ControleNiveau = 'ok' | 'waarschuwing' | 'fout';
export type VoorcontroleControle = {
  id: string;
  niveau: ControleNiveau;
  uk: string;
  nl: string;
  details?: string[];
};
export type VoorcontroleSamenvatting = {
  versie?: number;
  tijd?: string;
  ok: boolean;
  fouten: number;
  waarschuwingen: number;
  controles: VoorcontroleControle[];
};

export type StroomAnalyseInvoer = {
  versie: string;
  actieveVersie?: string | null;
  commit?: string;
  voorbereider?: string;
  eigenaarNaam?: string;
  wijzigingen?: string;
  diffSamenvatting?: string;
  manifest?: Manifest | null;
  tests?: { geslaagd?: number | null; mislukt?: number | null; samenvatting?: string } | null;
  voorstelStatus?: string | null;
  voorstelSha256?: string | null;
  voorstelBytes?: number | null;
  voorcontrole?: VoorcontroleSamenvatting | null;
  vereisten?: VereistenAntwoord | null;
  run?: {
    id: string;
    staat: string;
    methode: string;
    code: string;
    uk?: string;
    nl?: string;
    pakketSha256?: string;
    pakketGeleverdSha256?: string;
  } | null;
  diagnose?: {
    gezond: boolean;
    problemenAantal: number;
    vrijMB: number | null;
    pathActief: boolean | null;
  } | null;
  bewijzen?: StroomBewijs[];
};

export const VERSIE_RE = /^[0-9]{8}-[0-9]{6}$/;
export const SHA256_RE = /^[0-9a-f]{64}$/;
export const SLEUTEL_RE = /^[a-z0-9][a-z0-9._:-]{1,95}$/;

export const STROOM_LIMIETEN = Object.freeze({
  maxTitel: 240,
  maxInhoud: 8000,
  maxToelichting: 1000,
  maxReden: 600,
  maxNotities: 80,
  maxControleItems: 80,
  maxBewijzen: 120,
});

// ------------------------------------------------------------------------------------------------ очищення секретів
const GEHEIME_SLEUTELS = /(password|passwd|secret|token|authorization|cookie|private[_-]?key|api[_-]?key|passphrase|credential|refresh[_-]?token|access[_-]?token)/i;

/**
 * Безпечне очищення тексту нотаток, витягів журналів та підказок ШІ від таємниць, ключів доступу й паролів.
 * Opschoning van notities, logregels en AI-opdrachten tegen geheimen, sleutels en wachtwoorden.
 */
export function zonderGeheimenUitrol(invoer: unknown, maxLen: number = STROOM_LIMIETEN.maxInhoud): string {
  const ruw = String(invoer ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  let s = ruw;
  // Приватні PEM-ключі
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[ПРИВАТНИЙ_КЛЮЧ_ПРИХОВАНО]');
  // Заголовки Bearer / Basic
  s = s.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, '$1 [ТОКЕН_ПРИХОВАНО]');
  // JWT
  s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/g, '[JWT_ПРИХОВАНО]');
  // Паролі в рядках підключення postgres://user:pass@host
  s = s.replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/]+):([^@\s/]{2,})@/gi, '$1:[ПАРОЛЬ_ПРИХОВАНО]@');
  // Відомі префікси токенів (GitHub, OpenAI/Google/Grok/Anthropic, внутрішні токени агента tvh_/agy-)
  s = s.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|xai-[A-Za-z0-9_-]{16,}|tvh_[A-Za-z0-9_-]{12,}|agy-[a-z]-[A-Za-z0-9_-]{12,})\b/g, '[КЛЮЧ_ПРИХОВАНО]');
  // Параметри запитів та змінні оточення з чутливими назвами
  s = s.replace(/([?&](?:token|key|secret|password|code|access_token|refresh_token)=)[^&\s]+/gi, '$1[ПРИХОВАНО]');
  s = s.replace(/\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|API_KEY|PEPPER)[A-Z0-9_]*)\s*[:=]\s*("[^"\n]{3,}"|'[^'\n]{3,}'|[^\s,;]{4,})/g, '$1=[СЕКРЕТ_ПРИХОВАНО]');
  return s.slice(0, maxLen).trim();
}

/** Рекурсивне очищення структури даних доказу перед збереженням або звітом (хеші sha256/hash/commit лишаються незмінними). */
export function schoonObjectVoorBewijs(waarde: unknown, diepte = 0): unknown {
  if (diepte > 6) return null;
  if (waarde === null || waarde === undefined) return null;
  if (typeof waarde === 'boolean' || typeof waarde === 'number') return Number.isFinite(waarde) || typeof waarde === 'boolean' ? waarde : null;
  if (typeof waarde === 'string') return zonderGeheimenUitrol(waarde, 1200);
  if (Array.isArray(waarde)) return waarde.slice(0, 50).map((item) => schoonObjectVoorBewijs(item, diepte + 1));
  if (typeof waarde === 'object') {
    const uit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(waarde as Record<string, unknown>).slice(0, 60)) {
      if (GEHEIME_SLEUTELS.test(k) && !/(sha256|hash|lengte|bytes|aantal|count)/i.test(k)) {
        uit[k] = '[СЕКРЕТ_ПРИХОВАНО]';
        continue;
      }
      if (/^(sha256|pakketSha256|geleverdSha256|commit|vorigeHash|bewijsHash|sqlSha256)$/i.test(k) && typeof v === 'string') {
        uit[k] = v.slice(0, 128);
        continue;
      }
      uit[k] = schoonObjectVoorBewijs(v, diepte + 1);
    }
    return uit;
  }
  return String(waarde).slice(0, 200);
}

// ------------------------------------------------------------------------------------------------ канонічне представлення для SHA-256
/** Детермінована серіалізація JSON із сортуванням ключів на всіх рівнях. */
export function kanoniekJson(waarde: unknown): string {
  if (waarde === null || typeof waarde !== 'object') return JSON.stringify(waarde);
  if (Array.isArray(waarde)) return `[${waarde.map((v) => kanoniekJson(v)).join(',')}]`;
  const obj = waarde as Record<string, unknown>;
  const sleutels = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${sleutels.map((k) => `${JSON.stringify(k)}:${kanoniekJson(obj[k])}`).join(',')}}`;
}

/** Канонічний рядок вмісту доказу, за яким обчислюється SHA-256 (bewijsHash). */
export function bewijsInhoudVoorHash(invoer: {
  versie: string;
  soort: BewijsSoort;
  bron: string;
  status: BewijsStatus;
  pakketSha256: string;
  bewijsData: Record<string, unknown>;
  vorigeHash: string;
}): string {
  return kanoniekJson({
    v: 1,
    versie: invoer.versie,
    soort: invoer.soort,
    bron: invoer.bron,
    status: invoer.status,
    pakketSha256: invoer.pakketSha256 || '',
    bewijsData: invoer.bewijsData || {},
    vorigeHash: invoer.vorigeHash || '',
  });
}

// ------------------------------------------------------------------------------------------------ допоміжні парсери
const vindControle = (vc: VoorcontroleSamenvatting | null | undefined, id: string): VoorcontroleControle | undefined =>
  vc?.controles?.find((c) => c.id === id);

const laatsteBewijs = (bewijzen: readonly StroomBewijs[] | undefined, soort: BewijsSoort): StroomBewijs | undefined => {
  if (!bewijzen?.length) return undefined;
  let beste: StroomBewijs | undefined;
  for (const b of bewijzen) if (b.soort === soort) beste = b;
  return beste;
};

const heeftNieuweMigraties = (invoer: StroomAnalyseInvoer): boolean => {
  if ((invoer.vereisten?.nieuweMigraties?.length ?? 0) > 0) return true;
  const cMig = vindControle(invoer.voorcontrole, 'migraties');
  if (cMig) {
    const t = `${cMig.uk} ${cMig.nl}`;
    if (/\b0\s+(?:нов|nieuw)|немає\s+нових|geen\s+nieuwe/i.test(t)) return false;
    if (/\b[1-9]\d*\s+(?:нов|nieuw)|руйнівн|ingrijpend/i.test(t) || cMig.niveau === 'waarschuwing') return true;
  }
  const cProef = vindControle(invoer.voorcontrole, 'migratie-proef');
  if (cProef && !/немає|geen nieuwe/i.test(`${cProef.uk} ${cProef.nl}`)) return true;
  const proefBewijs = laatsteBewijs(invoer.bewijzen, 'migratie-proef');
  if (proefBewijs && Array.isArray(proefBewijs.bewijsData?.migraties) && (proefBewijs.bewijsData.migraties as unknown[]).length > 0) return true;
  return false;
};

const heeftDestructieveSql = (invoer: StroomAnalyseInvoer): boolean => {
  const cMig = vindControle(invoer.voorcontrole, 'migraties');
  if (!cMig) return false;
  return cMig.niveau === 'waarschuwing' && /руйнівн|ingrijpend|DROP|TRUNCATE/i.test(`${cMig.uk} ${cMig.nl} ${(cMig.details || []).join(' ')}`);
};

export function bepaalGebieden(invoer: StroomAnalyseInvoer): string[] {
  const tekst = [
    invoer.wijzigingen || '',
    invoer.diffSamenvatting || '',
    invoer.manifest?.beschrijving?.uk?.samenvatting || '',
    invoer.manifest?.beschrijving?.nl?.samenvatting || '',
    ...(invoer.manifest?.beschrijving?.uk?.wijzigingen || []),
    ...(invoer.manifest?.beschrijving?.nl?.wijzigingen || []),
  ].join('\n');

  const gebieden = new Set<string>();
  if (heeftNieuweMigraties(invoer) || /migrations\/|\.sql\b|міграц|схем|postgres/i.test(tekst)) gebieden.add('database-migraties');
  if (/rls|rechten\.sql|passkey|webauthn|beveiliging|безпек|права|доступ|sleutel|role/i.test(tekst)) gebieden.add('beveiliging-rls');
  if (/backend\/|server\/|\/api\/|маршрут|сервер/i.test(tekst)) gebieden.add('backend-routes');
  if (/src\/|\.tsx\b|\.css\b|інтерфейс|сторінк|вкладк|стил/i.test(tekst)) gebieden.add('frontend-ui');
  if (/deploy\/|\.sh\b|systemd|caddy|розгортан|скрипт/i.test(tekst)) gebieden.add('deploy-scripts');
  if (/tests\/|\.test\.ts|тест/i.test(tekst)) gebieden.add('tests');
  if (gebieden.size === 0) gebieden.add('algemeen');
  return [...gebieden];
}

// ------------------------------------------------------------------------------------------------ інтелектуальний аналіз
/**
 * Детермінований інтелектуальний аналіз потоку розгортання без витоку таємниць і без зовнішньої мережі.
 * Deterministische intelligente duiding van de uitrolstroom zonder geheimen en zonder extern netwerk.
 */
export function analyseerUitrolStroom(invoer: StroomAnalyseInvoer): StroomDuidingResultaat {
  const factoren: StroomDuidingFactor[] = [];
  const gebieden = bepaalGebieden(invoer);
  let score = 15; // базовий бал стандартного оновлення
  let heeftKritiek = false;
  let heeftVerhoogd = false;

  const voegFactor = (ernst: StroomDuidingFactor['ernst'], punten: number, uk: string, nl: string) => {
    factoren.push({ ernst, uk, nl });
    score += punten;
    if (ernst === 'kritiek') heeftKritiek = true;
    if (ernst === 'waarschuwing') heeftVerhoogd = true;
  };

  // 1. Попередня перевірка та цілісність
  const vc = invoer.voorcontrole;
  if (vc) {
    if (!vc.ok || vc.fouten > 0) {
      voegFactor('kritiek', 55, `Попередня перевірка сайту виявила критичні помилки (${vc.fouten}). Встановлення заблоковано до виправлення.`, `De voorcontrole van de site vond kritieke fouten (${vc.fouten}). Installatie is geblokkeerd totdat dit hersteld is.`);
    } else if (vc.waarschuwingen > 0) {
      voegFactor('waarschuwing', 15, `Попередня перевірка сайту пройшла з попередженнями (${vc.waarschuwingen}).`, `De voorcontrole van de site slaagde met waarschuwingen (${vc.waarschuwingen}).`);
    } else {
      voegFactor('info', -5, 'Попередня перевірка сайту пройшла без зауважень.', 'De voorcontrole van de site slaagde zonder opmerkingen.');
    }
  }

  // 2. Міграції та проба міграцій
  const nieuweMig = heeftNieuweMigraties(invoer);
  const destructief = heeftDestructieveSql(invoer);
  const cProef = vindControle(vc, 'migratie-proef');
  const bProef = laatsteBewijs(invoer.bewijzen, 'migratie-proef');
  if (nieuweMig) {
    if (destructief) {
      voegFactor('waarschuwing', 28, 'Нові SQL-міграції містять руйнівні операції (DROP/TRUNCATE). При відкаті схема бази НЕ відкочується.', 'Nieuwe SQL-migraties bevatten ingrijpende opdrachten (DROP/TRUNCATE). Bij terugdraaien wordt het databaseschema NIET teruggedraaid.');
    } else {
      voegFactor('info', 10, 'Пакет містить нові SQL-міграції схеми бази даних.', 'Het pakket bevat nieuwe SQL-migraties voor het databaseschema.');
    }
    if (cProef?.niveau === 'fout' || bProef?.status === 'mislukt') {
      voegFactor('kritiek', 40, 'Проба міграцій на копії схеми зазнала невдачі або SHA-256 SQL не збігається з архівом.', 'De migratieproef op een kopie van het schema mislukte of de SQL-SHA-256 wijkt af van het archief.');
    } else if (bProef?.status === 'geslaagd' || cProef?.niveau === 'ok') {
      voegFactor('info', -5, 'Проба нових міграцій на тимчасовій копії схеми пройдена й прив’язана до SHA-256.', 'De proef van de nieuwe migraties op een tijdelijke schemakopie is geslaagd en aan SHA-256 gebonden.');
    } else {
      voegFactor('waarschuwing', 15, 'Проба нових міграцій ще не зафіксована — root виконає її першим кроком, але краще перевірити заздалегідь.', 'De proef van nieuwe migraties is nog niet vastgelegd — root doet dat als eerste stap, maar vooraf testen is veiliger.');
    }
  }

  // 3. Походження, коміт і TRACE-001 (ONTWIKKELARCHIEF)
  const commit = String(invoer.commit || '');
  if (!commit || /^zonder-git:/.test(commit)) {
    voegFactor('waarschuwing', 15, 'Коміт відсутній або зібрано поза git (zonder-git) — знижена відтворюваність коду.', 'Commit ontbreekt of buiten git gebouwd (zonder-git) — lagere herleidbaarheid van de code.');
  }
  const cArch = vindControle(vc, 'ontwikkelarchief') || vindControle(vc, 'github');
  const bArch = laatsteBewijs(invoer.bewijzen, 'ontwikkelarchief');
  if (cArch?.niveau === 'fout' || bArch?.status === 'mislukt') {
    voegFactor('kritiek', 35, 'Не підтверджено походження TRACE-001 (ONTWIKKELARCHIEF або GitHub Release SHA-256).', 'Herkomst TRACE-001 (ONTWIKKELARCHIEF of GitHub Release SHA-256) niet bevestigd.');
  } else if (cArch?.niveau === 'waarschuwing' || bArch?.status === 'waarschuwing') {
    voegFactor('waarschuwing', 12, 'Перевірка походження на GitHub завершилась із попередженням (можлива тимчасова недоступність мережі).', 'De herkomstcontrole op GitHub gaf een waarschuwing (mogelijk tijdelijk netwerkprobleem).');
  }

  // 4. Таємниці у пакеті
  const cGeheim = vindControle(vc, 'geheimen');
  if (cGeheim && cGeheim.niveau !== 'ok') {
    voegFactor('kritiek', 45, 'У вмісті пакета виявлено ознаки секретів (.env, приватні ключі або токени). Необхідна перевірка перед схваленням!', 'In de pakketinhoud zijn tekenen van geheimen gevonden (.env, privésleutels of tokens). Controle vóór goedkeuring vereist!');
  }

  // 5. Результати тестів
  const misluktTests = invoer.tests?.mislukt;
  const geslaagdTests = invoer.tests?.geslaagd;
  if (typeof misluktTests === 'number' && misluktTests > 0) {
    voegFactor('waarschuwing', 22, `У звіті тестів є невдалі тести (${misluktTests}). Перевірте, чи це нові збої порівняно з базою.`, `Het testrapport bevat mislukte tests (${misluktTests}). Controleer of het nieuwe fouten zijn ten opzichte van de basis.`);
  } else if (geslaagdTests == null && (!vc || vindControle(vc, 'tests')?.niveau === 'waarschuwing')) {
    voegFactor('waarschuwing', 10, 'Підготовник не додав кількісний звіт тестів (TESTRESULTATEN).', 'De voorbereider voegde geen testtelling toe (TESTRESULTATEN).');
  } else if (typeof geslaagdTests === 'number' && geslaagdTests > 0 && (misluktTests ?? 0) === 0) {
    voegFactor('info', -5, `Усі повідомлені тести пройдено (${geslaagdTests}).`, `Alle gemelde tests geslaagd (${geslaagdTests}).`);
  }

  // 6. Хід або результат встановлення (run) та стан сервера
  if (invoer.run) {
    if (invoer.run.staat === 'mislukt' || invoer.run.staat === 'geweigerd') {
      voegFactor('kritiek', 40, `Останній запуск завершився відмовою або збоєм (${invoer.run.code || invoer.run.staat}).`, `De laatste run eindigde met weigering of fout (${invoer.run.code || invoer.run.staat}).`);
    } else if (invoer.run.staat === 'afgebroken') {
      voegFactor('waarschuwing', 20, `Запуск був перерваний (${invoer.run.code || 'AFGEBROKEN'}).`, `De run is afgebroken (${invoer.run.code || 'AFGEBROKEN'}).`);
    } else if (invoer.run.staat === 'klaar') {
      voegFactor('info', -8, 'Випуск успішно встановлено й активовано на сервері.', 'De release is succesvol geïnstalleerd en op de server geactiveerd.');
    }
  }
  if (invoer.diagnose) {
    if (!invoer.diagnose.gezond || invoer.diagnose.problemenAantal > 0) {
      voegFactor('waarschuwing', 18, `У діагностиці сервера є активні проблеми (${invoer.diagnose.problemenAantal}).`, `De serverdiagnose meldt actieve problemen (${invoer.diagnose.problemenAantal}).`);
    }
    if (invoer.diagnose.vrijMB !== null && invoer.diagnose.vrijMB < 1024) {
      voegFactor('waarschuwing', 18, `Мало вільного місця на диску (${invoer.diagnose.vrijMB} МБ).`, `Weinig vrije schijfruimte (${invoer.diagnose.vrijMB} MB).`);
    }
  }
  if (gebieden.includes('deploy-scripts') || gebieden.includes('beveiliging-rls')) {
    score += 10;
  }

  const begrensdeScore = Math.max(5, Math.min(100, score));
  const risico: StroomRisico = heeftKritiek || begrensdeScore >= 70
    ? 'kritiek'
    : heeftVerhoogd || begrensdeScore >= 40
      ? 'verhoogd'
      : gebieden.length === 1 && gebieden[0] === 'frontend-ui' && !nieuweMig && begrensdeScore <= 18
        ? 'laag'
        : 'normaal';

  const gebiedNamenUk: Record<string, string> = {
    'database-migraties': 'База даних і міграції',
    'beveiliging-rls': 'Безпека, RLS і доступ',
    'backend-routes': 'Серверна логіка й API',
    'frontend-ui': 'Інтерфейс і стилі',
    'deploy-scripts': 'Скрипти розгортання',
    tests: 'Модульні тести',
    algemeen: 'Загальні зміни',
  };
  const gebiedNamenNl: Record<string, string> = {
    'database-migraties': 'Database en migraties',
    'beveiliging-rls': 'Beveiliging, RLS en toegang',
    'backend-routes': 'Serverlogica en API',
    'frontend-ui': 'Interface en stijlen',
    'deploy-scripts': 'Uitrolscripts',
    tests: 'Eenheidstests',
    algemeen: 'Algemene wijzigingen',
  };

  const risicoLabelUk: Record<StroomRisico, string> = {
    laag: 'Низький ризик',
    normaal: 'Стандартний ризик',
    verhoogd: 'Підвищений ризик',
    kritiek: 'Критичний ризик',
  };
  const risicoLabelNl: Record<StroomRisico, string> = {
    laag: 'Laag risico',
    normaal: 'Normaal risico',
    verhoogd: 'Verhoogd risico',
    kritiek: 'Kritiek risico',
  };

  const gUk = gebieden.map((g) => gebiedNamenUk[g] || g).join(', ');
  const gNl = gebieden.map((g) => gebiedNamenNl[g] || g).join(', ');

  const titelUk = `Інтелектуальний розбір версії ${invoer.versie}: ${risicoLabelUk[risico]}`;
  const titelNl = `Intelligente duiding van versie ${invoer.versie}: ${risicoLabelNl[risico]}`;

  const manifestSamenvattingUk = invoer.manifest?.beschrijving?.uk?.samenvatting || '';
  const manifestSamenvattingNl = invoer.manifest?.beschrijving?.nl?.samenvatting || '';
  const kortBronUk = manifestSamenvattingUk || zonderGeheimenUitrol(invoer.wijzigingen || '', 360) || 'Опис змін у пакеті не наведено.';
  const kortBronNl = manifestSamenvattingNl || zonderGeheimenUitrol(invoer.wijzigingen || '', 360) || 'Geen wijzigingsbeschrijving in het pakket opgegeven.';

  const samenvattingUk = `Порушені контури: ${gUk}. Оцінка ризику: ${begrensdeScore}/100 (${risicoLabelUk[risico]}). Зміст випуску: ${kortBronUk}`;
  const samenvattingNl = `Betrokken onderdelen: ${gNl}. Risicoscore: ${begrensdeScore}/100 (${risicoLabelNl[risico]}). Inhoud: ${kortBronNl}`;

  const aanbevelingenUk: string[] = [];
  const aanbevelingenNl: string[] = [];
  if (heeftKritiek) {
    aanbevelingenUk.push('Зупиніть схвалення до усунення критичних зауважень у доказах та контрольній перевірці.');
    aanbevelingenNl.push('Stel goedkeuring uit totdat alle kritieke bevindingen in bewijs en voorcontrole zijn opgelost.');
  }
  if (nieuweMig) {
    aanbevelingenUk.push('Переконайтеся, що проба міграцій на копії схеми пройдена, а нові таблиці захищено RLS і правами в rechten.sql.');
    aanbevelingenNl.push('Controleer of de migratieproef op een schemakopie is geslaagd en nieuwe tabellen RLS en rechten in rechten.sql hebben.');
  }
  if (destructief) {
    aanbevelingenUk.push('Підтвердьте вручну сумісність попереднього релізу з новою схемою БД на випадок відкату.');
    aanbevelingenNl.push('Bevestig handmatig dat de vorige release met het nieuwe schema werkt bij een eventuele terugdraai.');
  }
  if (typeof misluktTests === 'number' && misluktTests > 0) {
    aanbevelingenUk.push('Перегляньте список невдалих тестів у TESTRESULTATEN перед натисканням Passkey.');
    aanbevelingenNl.push('Bekijk de lijst met mislukte tests in TESTRESULTATEN voordat u met uw passkey goedkeurt.');
  }
  if (!aanbevelingenUk.length) {
    aanbevelingenUk.push('Перегляньте зібрані автоматичні докази та завершіть ручні пункти контрольного списку перед схваленням або після запуску.');
    aanbevelingenNl.push('Controleer het verzamelde automatische bewijs en rond openstaande handmatige controlelijstpunten af.');
  }

  const schoonPromptTekst = zonderGeheimenUitrol(
    [
      `Версія / Versie: ${invoer.versie} (активна / actief: ${invoer.actieveVersie || 'невідомо'})`,
      `Ризик / Risico: ${risico} (${begrensdeScore}/100)`,
      `Контури / Gebieden: ${gebieden.join(', ')}`,
      `Опис змін / Wijzigingen: ${kortBronUk}`,
      `Фактори / Factoren: ${factoren.map((f) => `[${f.ernst}] ${f.uk}`).join('; ')}`,
    ].join('\n'),
    3000,
  );

  return {
    risico,
    score: begrensdeScore,
    gebieden,
    factoren,
    titelUk,
    titelNl,
    samenvattingUk,
    samenvattingNl,
    aanbevelingenUk,
    aanbevelingenNl,
    aiPrompt: {
      systeem: 'Ти помічник оператора Mijn Ruimte для аналізу розгортань. Дані вже очищено від таємниць; не вигадуй фактів поза наданим контекстом.',
      vraag: `Оціни безпечність випуску та підкажи, що перевірити перед або після встановлення:\n${schoonPromptTekst}`,
    },
  };
}

// ------------------------------------------------------------------------------------------------ контекстний контрольний список
export type ControlelijstSjabloon = {
  sleutel: string;
  groep: ControlelijstGroep;
  herkomst: ControlelijstHerkomst;
  verplicht: boolean;
  handmatigBevestigen: boolean;
  titelUk: string;
  titelNl: string;
  toelichtingUk: string;
  toelichtingNl: string;
  status: ControlelijstStatus;
  bewijsSoort: string;
  volgorde: number;
};

const statusUitBewijs = (b: StroomBewijs | undefined, fallback: ControlelijstStatus = 'open'): ControlelijstStatus => {
  if (!b) return fallback;
  if (b.status === 'geslaagd') return 'geslaagd';
  if (b.status === 'waarschuwing') return 'waarschuwing';
  if (b.status === 'mislukt') return 'mislukt';
  return 'overgeslagen';
};

const statusUitControle = (c: VoorcontroleControle | undefined, fallback: ControlelijstStatus = 'open'): ControlelijstStatus => {
  if (!c) return fallback;
  if (c.niveau === 'ok') return 'geslaagd';
  if (c.niveau === 'waarschuwing') return 'waarschuwing';
  return 'mislukt';
};

/**
 * Генерує контекстний контрольний список саме для цього випуску та поточного етапу.
 * Bouwt een contextafhankelijke controlelijst op maat van deze release en fase.
 */
export function bouwContextControlelijst(invoer: StroomAnalyseInvoer): ControlelijstSjabloon[] {
  const vc = invoer.voorcontrole;
  const bew = invoer.bewijzen || [];
  const nieuweMig = heeftNieuweMigraties(invoer);
  const destructief = heeftDestructieveSql(invoer);
  const eigenVoorbereider = !!invoer.voorbereider && !!invoer.eigenaarNaam && invoer.voorbereider === invoer.eigenaarNaam;

  const bIntegriteit = laatsteBewijs(bew, 'pakket-integriteit');
  const bProef = laatsteBewijs(bew, 'migratie-proef');
  const bVc = laatsteBewijs(bew, 'voorcontrole');
  const bArch = laatsteBewijs(bew, 'ontwikkelarchief');
  const bTests = laatsteBewijs(bew, 'testresultaten');
  const bPasskey = laatsteBewijs(bew, 'goedkeuring-passkey');
  const bRun = laatsteBewijs(bew, 'installatie-uitvoering');
  const bDiag = laatsteBewijs(bew, 'server-diagnose');

  const lijst: ControlelijstSjabloon[] = [
    {
      sleutel: 'pakket.integriteit',
      groep: 'voorbereiding',
      herkomst: 'systeem',
      verplicht: true,
      handmatigBevestigen: false,
      titelUk: 'Цілісність архіву та збіг SHA-256',
      titelNl: 'Integriteit van het archief en SHA-256-controle',
      toelichtingUk: 'Перевірено формат .tar.gz, єдину кореневу теку та незмінність контрольної суми пакета.',
      toelichtingNl: 'Formaat .tar.gz, enkele hoofdmap en ongewijzigde controlesom van het pakket gecontroleerd.',
      status: statusUitBewijs(bIntegriteit, invoer.voorstelSha256 || invoer.run?.pakketSha256 ? 'geslaagd' : statusUitControle(vindControle(vc, 'structuur'))),
      bewijsSoort: 'pakket-integriteit',
      volgorde: 10,
    },
    {
      sleutel: 'pakket.manifest',
      groep: 'voorbereiding',
      herkomst: 'systeem',
      verplicht: false,
      handmatigBevestigen: false,
      titelUk: 'Двомовний маніфест (uk + nl) і реєстр учасників',
      titelNl: 'Tweetalig manifest (uk + nl) en deelnemerslijst',
      toelichtingUk: 'UITROL-MANIFEST.json описує суть змін двома мовами та учасників підготовки.',
      toelichtingNl: 'UITROL-MANIFEST.json beschrijft de wijzigingen in beide talen en de deelnemers.',
      status: statusUitControle(vindControle(vc, 'manifest'), invoer.manifest ? 'geslaagd' : 'open'),
      bewijsSoort: 'voorcontrole',
      volgorde: 20,
    },
    {
      sleutel: 'pakket.ontwikkelarchief',
      groep: 'voorbereiding',
      herkomst: 'systeem',
      verplicht: true,
      handmatigBevestigen: false,
      titelUk: 'Походження TRACE-001 (ONTWIKKELARCHIEF і GitHub Release)',
      titelNl: 'Herkomst TRACE-001 (ONTWIKKELARCHIEF en GitHub Release)',
      toelichtingUk: 'Фіксація змін, гілка та SHA-256 архіву на GitHub мають збігатися з пакетом.',
      toelichtingNl: 'Commit, tak en SHA-256 van het archief op GitHub moeten overeenkomen met het pakket.',
      status: bArch ? statusUitBewijs(bArch) : statusUitControle(vindControle(vc, 'ontwikkelarchief') || vindControle(vc, 'github')),
      bewijsSoort: 'ontwikkelarchief',
      volgorde: 30,
    },
    {
      sleutel: 'pakket.testen',
      groep: 'voorbereiding',
      herkomst: 'systeem',
      verplicht: false,
      handmatigBevestigen: false,
      titelUk: 'Підсумок модульних перевірок (TESTRESULTATEN)',
      titelNl: 'Resultaat van eenheidstests (TESTRESULTATEN)',
      toelichtingUk: 'Показано кількість успішних і невдалих тестів у порівнянні з базовою версією.',
      toelichtingNl: 'Toont geslaagde en mislukte tests vergeleken met de basisversie.',
      status: bTests
        ? statusUitBewijs(bTests)
        : invoer.tests?.mislukt != null && invoer.tests.mislukt > 0
          ? 'waarschuwing'
          : invoer.tests?.geslaagd != null && invoer.tests.geslaagd > 0
            ? 'geslaagd'
            : statusUitControle(vindControle(vc, 'tests')),
      bewijsSoort: 'testresultaten',
      volgorde: 40,
    },
    {
      sleutel: 'veiligheid.geheimen',
      groep: 'veiligheid',
      herkomst: 'systeem',
      verplicht: true,
      handmatigBevestigen: false,
      titelUk: 'Перевірка пакету на випадкові таємниці та ключі',
      titelNl: 'Controle van het pakket op onbedoelde geheimen en sleutels',
      toelichtingUk: 'Автоматичний пошук файлів .env, приватних ключів і токенів у вмісті архіву.',
      toelichtingNl: 'Automatisch zoeken naar .env-bestanden, privésleutels en tokens in het archief.',
      status: statusUitControle(vindControle(vc, 'geheimen')),
      bewijsSoort: 'voorcontrole',
      volgorde: 50,
    },
    {
      sleutel: 'veiligheid.herkomst_review',
      groep: 'veiligheid',
      herkomst: 'ai',
      verplicht: !eigenVoorbereider || !invoer.commit || /^zonder-git:/.test(invoer.commit),
      handmatigBevestigen: true,
      titelUk: 'Підтвердження походження, автора та складу змін',
      titelNl: 'Bevestiging van herkomst, auteur en samenstelling van wijzigingen',
      toelichtingUk: eigenVoorbereider
        ? 'Підготовлено вашим акаунтом; перегляньте зміни та агента перед схваленням.'
        : 'Пакет підготував інший підготовник або агент — перевірте зміни й ONTWIKKELARCHIEF вручну.',
      toelichtingNl: eigenVoorbereider
        ? 'Voorbereid door uw eigen account; bekijk wijzigingen en agent vóór goedkeuring.'
        : 'Pakket voorbereid door een andere voorbereider of agent — controleer wijzigingen en ONTWIKKELARCHIEF handmatig.',
      status: 'open',
      bewijsSoort: 'ontwikkelarchief',
      volgorde: 60,
    },
    {
      sleutel: 'veiligheid.server',
      groep: 'veiligheid',
      herkomst: 'systeem',
      verplicht: false,
      handmatigBevestigen: false,
      titelUk: 'Готовність сервера, диска й служби root',
      titelNl: 'Gereedheid van server, schijf en root-dienst',
      toelichtingUk: 'Свіжість діагностики root, наявність вільного місця та активний inbox-спостерігач.',
      toelichtingNl: 'Versheid van root-diagnose, vrije schijfruimte en actieve inbox-bewaker.',
      status: bDiag
        ? statusUitBewijs(bDiag)
        : invoer.diagnose
          ? (invoer.diagnose.gezond && (invoer.diagnose.vrijMB ?? 1025) >= 800 && invoer.diagnose.pathActief !== false ? 'geslaagd' : 'waarschuwing')
          : 'open',
      bewijsSoort: 'server-diagnose',
      volgorde: 70,
    },
  ];

  if (nieuweMig) {
    lijst.push(
      {
        sleutel: 'migraties.proef',
        groep: 'migraties',
        herkomst: 'systeem',
        verplicht: true,
        handmatigBevestigen: false,
        titelUk: 'Проба нових SQL-міграцій на копії схеми (SHA-256)',
        titelNl: 'Proef van nieuwe SQL-migraties op een schemakopie (SHA-256)',
        toelichtingUk: 'Тимчасова проба доводить сумісність SQL із поточною базою без ризику для живих даних.',
        toelichtingNl: 'Tijdelijke proef bewijst dat de SQL compatibel is met de actuele database zonder risico.',
        status: bProef ? statusUitBewijs(bProef) : statusUitControle(vindControle(vc, 'migratie-proef')),
        bewijsSoort: 'migratie-proef',
        volgorde: 80,
      },
      {
        sleutel: 'migraties.rls_en_rechten',
        groep: 'migraties',
        herkomst: 'ai',
        verplicht: true,
        handmatigBevestigen: true,
        titelUk: 'Перевірено RLS та права ролей у migrations/rechten.sql',
        titelNl: 'RLS en rolrechten in migrations/rechten.sql gecontroleerd',
        toelichtingUk: 'Для нових таблиць мають бути ввімкнені ENABLE/FORCE ROW LEVEL SECURITY і права mijnruimte_app/system.',
        toelichtingNl: 'Voor nieuwe tabellen moeten ENABLE/FORCE ROW LEVEL SECURITY en rechten voor mijnruimte_app/system kloppen.',
        status: 'open',
        bewijsSoort: 'migratie-proef',
        volgorde: 90,
      },
    );
  }

  if (destructief) {
    lijst.push({
      sleutel: 'migraties.onomkeerbaar_bevestigd',
      groep: 'migraties',
      herkomst: 'ai',
      verplicht: true,
      handmatigBevestigen: true,
      titelUk: 'Підтверджую незворотність змін схеми БД при можливому відкаті',
      titelNl: 'Ik bevestig dat schemawijzigingen bij terugdraaien niet terugkeren',
      toelichtingUk: 'Виявлено команди DROP або TRUNCATE. Попередня версія коду має безпечно працювати з новою схемою.',
      toelichtingNl: 'Er zijn DROP- of TRUNCATE-opdrachten gevonden. De vorige code moet veilig met het nieuwe schema werken.',
      status: 'open',
      bewijsSoort: 'voorcontrole',
      volgorde: 95,
    });
  }

  lijst.push(
    {
      sleutel: 'goedkeuring.voorcontrole',
      groep: 'goedkeuring',
      herkomst: 'systeem',
      verplicht: true,
      handmatigBevestigen: false,
      titelUk: 'Попередня перевірка сайту завершена без критичних помилок',
      titelNl: 'Voorcontrole van de site afgerond zonder fouten',
      toelichtingUk: 'Усі статичні перевірки (структура, скрипти, збірка, міграції) без статусу «помилка».',
      toelichtingNl: 'Alle statische controles (structuur, scripts, bouwen, migraties) zijn zonder foutstatus.',
      status: bVc ? statusUitBewijs(bVc) : vc ? (vc.ok ? (vc.waarschuwingen > 0 ? 'waarschuwing' : 'geslaagd') : 'mislukt') : 'open',
      bewijsSoort: 'voorcontrole',
      volgorde: 100,
    },
    {
      sleutel: 'goedkeuring.passkey',
      groep: 'goedkeuring',
      herkomst: 'systeem',
      verplicht: true,
      handmatigBevestigen: false,
      titelUk: 'Схвалення власником (Passkey WebAuthn або SSH)',
      titelNl: 'Goedkeuring door de eigenaar (Passkey WebAuthn of SSH)',
      toelichtingUk: 'Підпис власника на сайті (passkey) або прямий запуск через SSH фіксує дозвіл на встановлення.',
      toelichtingNl: 'Handtekening van de eigenaar (passkey) of rechtstreekse SSH-opdracht legt de toestemming vast.',
      status: bPasskey
        ? statusUitBewijs(bPasskey)
        : invoer.voorstelStatus === 'goedgekeurd' || invoer.voorstelStatus === 'geinstalleerd' || invoer.run?.staat === 'klaar'
          ? 'geslaagd'
          : invoer.voorstelStatus === 'afgewezen'
            ? 'mislukt'
            : 'open',
      bewijsSoort: 'goedkeuring-passkey',
      volgorde: 110,
    },
    {
      sleutel: 'nazorg.installatie',
      groep: 'nazorg',
      herkomst: 'systeem',
      verplicht: false,
      handmatigBevestigen: false,
      titelUk: 'Виконання встановлення на сервері та запуск служб',
      titelNl: 'Uitvoering van installatie op de server en herstart van diensten',
      toelichtingUk: 'Синхронізований статус із таблиці запусків root (кроки копіювання, збірки, міграцій і активації).',
      toelichtingNl: 'Gesynchroniseerde status uit de root-runs (stappen kopiëren, bouwen, migraties en activeren).',
      status: bRun
        ? statusUitBewijs(bRun)
        : invoer.run
          ? (invoer.run.staat === 'klaar' ? 'geslaagd' : invoer.run.staat === 'bezig' ? 'open' : 'mislukt')
          : 'open',
      bewijsSoort: 'installatie-uitvoering',
      volgorde: 120,
    },
  );

  if (invoer.run) {
    lijst.push({
      sleutel: 'nazorg.rook_en_herstel',
      groep: 'nazorg',
      herkomst: 'systeem',
      verplicht: false,
      handmatigBevestigen: true,
      titelUk: 'Підсумкова перевірка живого сайту після встановлення',
      titelNl: 'Eindcontrole van de draaiende site na installatie',
      toelichtingUk: 'Перевірте сторінки після оновлення, сповіщення пост-контролю та збереження резервної копії.',
      toelichtingNl: 'Controleer de pagina’s na de update, nazorgmeldingen en het bewaren van het archief.',
      status: invoer.run.staat === 'klaar' ? 'open' : invoer.run.staat === 'mislukt' || invoer.run.staat === 'geweigerd' ? 'waarschuwing' : 'open',
      bewijsSoort: 'installatie-uitvoering',
      volgorde: 130,
    });
  }

  return lijst;
}

/** Обчислення зведеної готовності контрольного списку. */
export function berekenGereedheid(items: readonly ControlelijstItem[]): StroomGereedheid {
  const totaal = items.length;
  let afgerond = 0;
  let openVerplicht = 0;
  let mislukt = 0;
  let waarschuwing = 0;

  for (const item of items) {
    if (item.status === 'geslaagd' || item.status === 'afgevinkt' || item.status === 'overgeslagen') {
      afgerond++;
    }
    if (item.status === 'mislukt') {
      mislukt++;
      if (item.verplicht) openVerplicht++;
    } else if (item.status === 'open' || item.status === 'waarschuwing') {
      if (item.status === 'waarschuwing') waarschuwing++;
      if (item.verplicht && item.status === 'open') openVerplicht++;
      // Якщо обов'язковий пункт у статусі waarschuwing і вимагає ручного підтвердження або ще не підтверджений
      if (item.verplicht && item.status === 'waarschuwing' && item.handmatigBevestigen) openVerplicht++;
    }
  }

  const geblokkeerd = mislukt > 0 || openVerplicht > 0;
  const voortgangPct = totaal > 0 ? Math.round((afgerond / totaal) * 100) : 0;
  return { totaal, afgerond, openVerplicht, mislukt, waarschuwing, geblokkeerd, voortgangPct };
}

// ------------------------------------------------------------------------------------------------ експорт доказового звіту
/** Формує очищений двомовний або обраномовно-орієнтований доказовий звіт розгортання у форматі Markdown. */
export function bouwBewijsRapportMarkdown(o: StroomOverzicht, lang: StroomTaal = 'uk'): string {
  const u = lang === 'uk';
  const r = o.gereedheid;
  const lijnen: string[] = [
    u ? `# Доказовий звіт потоку розгортання ${o.versie}` : `# Bewijsrapport van de uitrolstroom ${o.versie}`,
    '',
    `- **${u ? 'Версія випуску' : 'Uitrolversie'}:** \`${o.versie}\``,
    `- **${u ? 'Активна версія на сервері' : 'Actieve versie op de server'}:** \`${o.actieveVersie || '—'}\``,
    `- **${u ? 'Цілісність ланцюжка доказів' : 'Integriteit van de bewijsketen'}:** ${o.ketenIntegriteit.ok ? (u ? 'ПІДТВЕРДЖЕНО' : 'BEVESTIGD') : (u ? 'ПОРУШЕНО' : 'GESCHONDEN')} (${o.ketenIntegriteit.aantal})`,
    `- **${u ? 'Готовність контрольного списку' : 'Gereedheid controlelijst'}:** ${r.afgerond}/${r.totaal} (${r.voortgangPct}%), ${u ? 'блокувальних відкритих' : 'open verplicht'}: ${r.openVerplicht}, ${u ? 'помилок' : 'mislukt'}: ${r.mislukt}`,
    '',
    `## ${u ? 'Інтелектуальний розбір ризику' : 'Intelligente risicoanalyse'}`,
    `- **${u ? 'Рівень ризику' : 'Risiconiveau'}:** \`${o.duiding.risico}\` (${o.duiding.score}/100)`,
    `- **${u ? 'Підсумок' : 'Samenvatting'}:** ${zonderGeheimenUitrol(u ? o.duiding.samenvattingUk : o.duiding.samenvattingNl)}`,
    '',
    `## ${u ? 'Автоматичні докази перевірок' : 'Automatisch bewijs van controles'}`,
    '',
  ];

  if (!o.bewijzen.length) {
    lijnen.push(u ? '_Автоматичних доказів для цієї версії ще не зібрано._' : '_Nog geen automatisch bewijs verzameld voor deze versie._');
  } else {
    for (const b of o.bewijzen) {
      lijnen.push(`- **[${b.status}] \`${b.soort}\`** (${b.bron}, ${b.aangemaaktOp})`);
      lijnen.push(`  - ${zonderGeheimenUitrol(u ? b.samenvattingUk : b.samenvattingNl)}`);
      lijnen.push(`  - \`bewijs_hash\`: \`${b.bewijsHash}\`${b.vorigeHash ? ` · \`vorige_hash\`: \`${b.vorigeHash.slice(0, 16)}…\`` : ''}${b.integriteitOk === false ? ' ⚠️ **HASH_MISMATCH**' : ''}`);
    }
  }

  lijnen.push('', `## ${u ? 'Контекстний контрольний список' : 'Contextafhankelijke controlelijst'}`, '');
  for (const c of o.controlelijst) {
    const merk = c.status === 'geslaagd' || c.status === 'afgevinkt' ? 'x' : ' ';
    lijnen.push(`- [${merk}] **(${c.groep}${c.verplicht ? (u ? ', обов’язковий' : ', verplicht') : ''})** ${zonderGeheimenUitrol(u ? c.titelUk : c.titelNl)} — \`${c.status}\`${c.reden ? ` (${zonderGeheimenUitrol(c.reden, 200)})` : ''}`);
  }

  lijnen.push('', `## ${u ? 'Нотатки розгортання' : 'Uitrolnotities'}`, '');
  if (!o.notities.length) {
    lijnen.push(u ? '_Нотаток ще немає._' : '_Nog geen notities._');
  } else {
    for (const n of o.notities) {
      lijnen.push(`### ${n.vastgepind ? '📌 ' : ''}[${n.soort}] ${zonderGeheimenUitrol(u ? n.titelUk : n.titelNl, 240)}`);
      lijnen.push(zonderGeheimenUitrol(u ? n.inhoudUk : n.inhoudNl, 2000), '');
    }
  }

  return lijnen.join('\n');
}
