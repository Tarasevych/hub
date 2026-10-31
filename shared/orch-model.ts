// ORCH-001 етап 3 (31.10.2026) · Керування координацією агентів через сайт — спільний контракт (без логіки) для
// backend/orch-opslag.ts, backend/orch-routes.ts, backend/orch-hulpmiddelen.ts (MCP), src/agenten/TabOrch.tsx і тестів.
// Логіка лишається в scripts/orch/kern.mjs (чисті функції) та scripts/orch/inleveren.mjs (той самий конвеєр, що й у CLI):
// сайт, MCP і HTTP API — лише ще один канал до ТОГО Ж конвеєра, не окремий механізм.
// Gedeeld contract voor het beheer van de agentcoördinatie via de site; de logica staat in scripts/orch/*.mjs.
import type { Tekst } from './tech-rollen';

/** Маршрути власника (лише mcp.* та admin.*, роль owner + OWNER_EMAIL). Agents komen hier nooit: zij gebruiken de MCP-hulpmiddelen orch_*. */
export const ORCH_ROUTES = Object.freeze({
  overzicht: '/api/owner/orch/overzicht',
  context: '/api/owner/orch/context',
  taakStart: '/api/owner/orch/taak/start',
  inleveringBegin: '/api/owner/orch/inlevering/begin',
  inleveringStuk: '/api/owner/orch/inlevering/stuk',
  inleveringKlaar: '/api/owner/orch/inlevering/klaar',
  inleveringAnnuleren: '/api/owner/orch/inlevering/annuleren',
  regelsOverzicht: '/api/owner/orch/regels/overzicht',
  regelsVoorstel: '/api/owner/orch/regels/voorstel',
  regelsIntrekken: '/api/owner/orch/regels/intrekken',
  regelsToepassen: '/api/owner/orch/regels/toepassen',
});

/** MCP-інструменти (kant beheer, лише технічний простір власника; backend/orch-hulpmiddeldefinities.ts). */
export const ORCH_TOOL_NAMEN = ['orch_overzicht', 'orch_context', 'orch_taak_start', 'orch_inleveren_begin', 'orch_inleveren_stuk', 'orch_inleveren_klaar'] as const;
export type OrchToolNaam = (typeof ORCH_TOOL_NAMEN)[number];

/** Межі каналу (застосунок). Root і конвеєр inleveren мають власні, суворіші перевірки. */
export const ORCH_LIMIETEN = Object.freeze({
  /** Один фрагмент завантаження (після base64-декодування), байтів. */
  stukMaxBytes: 512 * 1024,
  /** Один пакет передачі (zip/tar.gz/patch), байтів. */
  uploadMaxBytes: 300 * 1024 * 1024,
  /** Стільки завантажень може почати одна особа за годину. */
  uploadsPerUur: 20,
  /** Незавершене завантаження прибирається після стількох хвилин. */
  uploadVerloopMinuten: 120,
  /** Один файл правил у пропозиції, байтів (AGENTS.md ≈ 15 КБ). */
  regelBestandMaxBytes: 400_000,
  /** Пропозицій правил за годину. */
  voorstellenPerUur: 30,
  /** Чернетка пропозиції чинна стільки годин (далі — лише заново). */
  voorstelVerloopUur: 48,
});

export type OrchZaak = { code: string; ernst: 'fout' | 'waarschuwing'; uk: string; nl: string; [k: string]: unknown };
export type OrchTaak = {
  id: string; agent: string; tak: string; basisCommit: string; basisVersie: string; regelsVersie: string; regelsHash: string | null;
  staat: string; gestart: string; bijgewerkt: string; omschrijving: string; kanaal: string; overdrachten: string[];
  /** Афішований статус за правилами (statusAfleiden): in_progress | integrated | released | installed … */
  status: string;
  /** Чи перечитав агент чинні правила (regelsVersie задачі = чинна). */
  regelsActueel: boolean;
};
export type OrchInlevering = { id: string; taakId: string | null; agent: string | null; kanaal: string | null; tak: string | null; commit: string | null; uitkomst: 'aanvaard' | 'geweigerd'; aangemaakt: string; bestanden: number; zaken: OrchZaak[]; tests: { overgeslagen?: boolean; geslaagd: number; mislukt: number; reden?: string } | null };
export type OrchWachtrij = { integratieTak: string; integratieHoofd: string | null; bezig: unknown; wachtrij: Array<{ taakId: string; agent: string; tak: string; staat: string; ingediend: string; kanaal: string; inleveringId: string }> };
export type OrchUpload = { id: string; naam: string; grootte: number; ontvangen: number; sha256: string; taakId: string | null; kanaal: string; door: string; begonnen: string; staat: 'bezig' | 'klaar' | 'mislukt' };
export type OrchVoorstel = {
  id: string; aangemaakt: string; door: string; staat: 'ontwerp' | 'toegepast' | 'ingetrokken';
  regelsVersie: string; hash: string; kritiekHash: string; kritiekGewijzigd: boolean;
  /** Відбиток чинних правил у момент створення — застаріла пропозиція (інший lock.hash) не застосовується. */
  basisHash: string | null; basisVersie: string;
  verschil: Record<string, { toegevoegd: number; verwijderd: number; gewijzigd: boolean }>;
  toegepast?: { tak: string; commit: string; gepusht: boolean; op: string; besluit: string };
};
/** Один рядок root-файла orch-regels-bevestigd.json (mijn-ruimte-besluit.sh orch_regels). */
export type OrchBevestiging = { regelsVersie: string; hash: string; kritiekHash: string; voorstel: string; passkey: string; label?: string; door?: string; besluit: string; tijd: string };
export type OrchEigenaar = { soort?: 'passkey' | 'ssh'; kritiekHash: string; regelsVersie: string; hash?: string; passkey?: string; sleutel?: string; besluit?: string; voorstel?: string; op: string } | null;

export type OrchOverzicht = {
  repo: { aanwezig: boolean; wortel: string; tak: string; hoofd: string; schoon: boolean; origin: string; code: string };
  regels: { regelsVersie: string; hash: string; kritiekHash: string; eigenaar: OrchEigenaar; eigenaarStatus: OrchZaak | null; regelBestanden: string[]; bijgewerkt: string } | null;
  basis: { versie: string; bronCommit: string; verificatie: string } | null;
  integratie: { tak: string; basisTak: string } | null;
  geinstalleerd: { versie: string; bronCommit: string; op?: string } | null;
  agenten: Array<{ id: string; naam?: string; kanalen: string[]; adapter?: string; taken: number }>;
  taken: OrchTaak[];
  wachtrij: OrchWachtrij | null;
  inleveringen: OrchInlevering[];
  uploads: OrchUpload[];
  voorstellen: OrchVoorstel[];
  bevestigingen: OrchBevestiging[];
  controleer: { code: number; regels: string[] } | null;
  kanalen: string[];
  tools: readonly string[];
  limieten: typeof ORCH_LIMIETEN;
  schakelaar: { orchRegelsPasskey: boolean };
};

export type OrchRegelsOverzicht = {
  regelsVersie: string; hash: string; kritiekHash: string; eigenaar: OrchEigenaar; eigenaarStatus: OrchZaak | null;
  bestanden: Record<string, string>; voorstellen: OrchVoorstel[]; bevestigingen: OrchBevestiging[];
  schakelaar: { orchRegelsPasskey: boolean }; repo: OrchOverzicht['repo'];
};

const T = (uk: string, nl: string): Tekst => [uk, nl];
/** Коди застосунку (маршрути) — root і конвеєр дають власні uk/nl у «zaken». */
export const ORCH_CODES: Readonly<Record<string, Tekst>> = Object.freeze({
  ORCH_GEEN_REPO: T('На сервері немає робочої копії репозиторію координації (ORCH_WORTEL). Налаштуйте її за RUNBOOK §18.', 'Op de server staat geen werkkopie van de coördinatierepository (ORCH_WORTEL). Richt die in volgens RUNBOOK §18.'),
  ORCH_REPO_VUIL: T('У робочій копії координації є незакомічені зміни — спершу наведіть лад через SSH (git status).', 'De werkkopie van de coördinatie heeft niet-gecommitte wijzigingen — ruim eerst op via SSH (git status).'),
  TESTS_NIET_GEISOLEERD: T('Тести імпортованого коду не можна запускати на сервері застосунку; потрібен ізольований CI.', 'Tests van geïmporteerde code mogen niet op de appserver draaien; geïsoleerde CI is vereist.'),
  UPLOAD_ONBEKEND: T('Такого завантаження немає (завершено, скасовано або минув строк).', 'Deze upload bestaat niet (afgerond, geannuleerd of verlopen).'),
  UPLOAD_NAAM: T('Назва файла має бути .zip, .tar.gz або .patch без шляхів.', 'De bestandsnaam moet .zip, .tar.gz of .patch zijn, zonder paden.'),
  UPLOAD_TE_GROOT: T('Пакет більший за дозволені 300 МіБ.', 'Het pakket is groter dan de toegestane 300 MiB.'),
  UPLOAD_STUK_TE_GROOT: T('Фрагмент більший за 512 КіБ.', 'Het stuk is groter dan 512 KiB.'),
  UPLOAD_OFFSET: T('Зміщення не збігається з уже отриманими байтами — надішліть фрагмент ще раз із правильним зміщенням.', 'De offset komt niet overeen met de al ontvangen bytes — stuur het stuk opnieuw met de juiste offset.'),
  UPLOAD_ONVOLLEDIG: T('Отримано менше байтів, ніж заявлено.', 'Er zijn minder bytes ontvangen dan opgegeven.'),
  UPLOAD_SHA_VERSCHILT: T('SHA-256 отриманого файла не збігається з заявленою — файл пошкоджено дорогою.', 'De SHA-256 van het ontvangen bestand komt niet overeen met de opgegeven waarde — het bestand is onderweg beschadigd.'),
  UPLOAD_BEZIG: T('Завантаження ще не завершене.', 'De upload is nog niet afgerond.'),
  RATE_LIMITED: T('Забагато дій за годину. Зачекайте.', 'Te veel acties in een uur. Wacht even.'),
  TAAK_BESTAAT: T('Задача з таким ідентифікатором уже зареєстрована.', 'Een taak met dit id is al geregistreerd.'),
  TAAK_ONGELDIG: T('Задача не проходить правила (див. zaken).', 'De taak voldoet niet aan de regels (zie zaken).'),
  GEEN_VOORSTEL: T('Пропозиції правил з таким ідентифікатором немає (застосована, відкликана або минув строк).', 'Er is geen regelvoorstel met dit id (toegepast, ingetrokken of verlopen).'),
  VOORSTEL_VEROUDERD: T('Чинні правила змінилися після створення пропозиції — створіть її заново.', 'De geldende regels zijn na het maken van het voorstel veranderd — maak het opnieuw.'),
  VOORSTEL_ONGELDIG: T('Пропозиція не проходить правила (див. zaken).', 'Het voorstel voldoet niet aan de regels (zie zaken).'),
  GEEN_BESLUIT: T('Немає виконаного рішення власника «orch-regels» для цієї пропозиції. Спершу підпишіть пропозицію passkey.', 'Er is geen uitgevoerd besluit «orch-regels» van de eigenaar voor dit voorstel. Onderteken het voorstel eerst met de passkey.'),
  BESLUIT_PAST_NIET: T('Рішення власника стосується іншої пропозиції або інших правил.', 'Het besluit van de eigenaar hoort bij een ander voorstel of andere regels.'),
  NIET_BEVESTIGD_DOOR_ROOT: T('Служба root ще не записала підтвердження для цієї пропозиції (orch-regels-bevestigd.json). Зачекайте кілька секунд або перевірте службу mijn-ruimte-besluit.', 'Root heeft de bevestiging voor dit voorstel nog niet vastgelegd (orch-regels-bevestigd.json). Wacht enkele seconden of controleer de dienst mijn-ruimte-besluit.'),
  CONTROLE_MISLUKT: T('Після застосування node scripts/orch.mjs controleer дав помилки — зміни відкинуто.', 'Na het toepassen gaf node scripts/orch.mjs controleer fouten — de wijziging is teruggedraaid.'),
  GIT_FOUT: T('Операція git у робочій копії координації не вдалася (подробиці нижче).', 'De git-bewerking in de werkkopie van de coördinatie is mislukt (zie detail).'),
  PUSH_MISLUKT: T('Гілку створено й закомічено локально, але не вдалося відправити у віддалений репозиторій. Відправте через SSH: git push -u origin <tak>.', 'De tak is lokaal gemaakt en gecommit, maar kon niet naar origin worden gestuurd. Stuur via SSH: git push -u origin <tak>.'),
  INHOUD_ONGELDIG: T('Вхідні дані неповні або в недопустимій формі.', 'De invoer is onvolledig of heeft een onjuiste vorm.'),
});
export const orchCodeTekst = (lang: 'uk' | 'nl', code: string): string => { const t = ORCH_CODES[code]; return t ? (lang === 'uk' ? t[0] : t[1]) : code; };

// ---------------------------------------------------------------- «?» (shared/hulp-register.ts)
type HulpItem = { wat: Tekst; gevolg: Tekst; risico: Tekst; dev: Tekst; bron: string };
const item = (bron: string, wat: Tekst, gevolg: Tekst, risico: Tekst, dev: Tekst): HulpItem => ({ wat, gevolg, risico, dev, bron });
export const HELP_ORCH: Readonly<Record<string, HulpItem>> = Object.freeze({
  'orch.overzicht': item('src/agenten/TabOrch.tsx',
    T('Одна картина для всіх ШІ-агентів: чинна версія правил, база коду, задачі з їхнім статусом, черга інтеграції, передачі.', 'Eén beeld voor alle AI-agenten: de geldende regelversie, de codebasis, taken met status, de integratiewachtrij, overdrachten.'),
    T('Дані читаються з робочої копії репозиторію координації на сервері (ORCH_WORTEL) — тієї ж, що й node scripts/orch.mjs.', 'De gegevens komen uit de werkkopie van de coördinatierepository op de server (ORCH_WORTEL) — dezelfde als node scripts/orch.mjs.'),
    T('Лише читання. Задача зі старою regelsVersie позначена: агент має перечитати правила (taak-herlees) перед передачею.', 'Alleen lezen. Een taak met een oude regelsVersie is gemarkeerd: de agent moet de regels herlezen (taak-herlees) vóór de overdracht.'),
    T('POST /api/owner/orch/overzicht → backend/orch-opslag.ts overzicht(); MCP: orch_overzicht.', 'POST /api/owner/orch/overzicht → backend/orch-opslag.ts overzicht(); MCP: orch_overzicht.')),
  'orch.inlevering': item('src/agenten/TabOrch.tsx',
    T('Передати результат агента з цього пристрою: пакет mijn-ruimte-<versie>-<agent>-overdracht.zip, zip/tar.gz з ORCH-OVERDRACHT.json або git patch.', 'Het resultaat van een agent vanaf dit apparaat inleveren: een pakket mijn-ruimte-<versie>-<agent>-overdracht.zip, een zip/tar.gz met ORCH-OVERDRACHT.json of een git patch.'),
    T('Файл іде фрагментами по 512 КіБ, звіряється SHA-256, і потрапляє в ТОЙ САМИЙ конвеєр, що й node scripts/orch.mjs inleveren: власна гілка від бази, звірка правил і бази, конфлікти з integratie, тести, запис, черга.', 'Het bestand gaat in stukken van 512 KiB, de SHA-256 wordt vergeleken, en het komt in DEZELFDE pijplijn als node scripts/orch.mjs inleveren: eigen tak vanaf de basis, controle van regels en basis, conflicten met integratie, tests, record, wachtrij.'),
    T('Відхилена передача не створює гілки й не торкається integratie. Прийнята — лише гілка й місце в черзі; злиття робить людина (wachtrij klaar).', 'Een geweigerde overdracht maakt geen tak en raakt integratie niet. Een aanvaarde geeft alleen een tak en een plek in de wachtrij; het samenvoegen doet een mens (wachtrij klaar).'),
    T('POST /api/owner/orch/inlevering/{begin,stuk,klaar}; backend/orch-opslag.ts → scripts/orch/inleveren.mjs inleveren()+registreerInlevering(); MCP: orch_inleveren_*.', 'POST /api/owner/orch/inlevering/{begin,stuk,klaar}; backend/orch-opslag.ts → scripts/orch/inleveren.mjs inleveren()+registreerInlevering(); MCP: orch_inleveren_*.')),
  'orch.regels': item('src/agenten/TabOrch.tsx',
    T('Змінити правила координації (AGENTS.md, orchestratie/beleid.json, BESLUITEN.md) з сайту: редагування → перевірка → підпис passkey → синхронізація в GitHub і до агентів.', 'De coördinatieregels (AGENTS.md, orchestratie/beleid.json, BESLUITEN.md) vanaf de site wijzigen: bewerken → controle → passkey-handtekening → synchronisatie naar GitHub en de agenten.'),
    T('Пропозиція має підвищити regelsVersie і мати запис у BESLUITEN.md; підпис passkey перевіряє root і записує підтвердження; застосунок створює git-гілку regels/<versie>-<час> з новим regels.lock.json (eigenaar: passkey) і CONTEXT-COMPACT.md, відправляє її в origin і дає посилання на PR. Агенти бачать нову версію через CONTEXT-COMPACT.md / taak-herlees.', 'Het voorstel moet regelsVersie verhogen en een regel in BESLUITEN.md hebben; root controleert de passkey-handtekening en legt de bevestiging vast; de app maakt een git-tak regels/<versie>-<tijd> met de nieuwe regels.lock.json (eigenaar: passkey) en CONTEXT-COMPACT.md, stuurt hem naar origin en geeft de PR-link. Agenten zien de nieuwe versie via CONTEXT-COMPACT.md / taak-herlees.'),
    T('Критичні політики (kritiek) змінюють kritiekHash: їх підтвердження відкриває дорогу автоматичній установці, якщо вона дозволена. Гілка не зливається сама — злиття в integratie лишається за людиною.', 'Kritieke regels (kritiek) veranderen de kritiekHash: hun bevestiging opent de weg naar automatische installatie als die is toegestaan. De tak wordt niet vanzelf samengevoegd — het samenvoegen in integratie blijft aan een mens.'),
    T('POST /api/owner/orch/regels/{voorstel,toepassen}; besluit soort "orch-regels" (besluit-kern.mjs); root: mijn-ruimte-besluit.sh orch_regels; kern: beoordeelVoorstel, bevestigMetPasskey.', 'POST /api/owner/orch/regels/{voorstel,toepassen}; besluit soort "orch-regels" (besluit-kern.mjs); root: mijn-ruimte-besluit.sh orch_regels; kern: beoordeelVoorstel, bevestigMetPasskey.')),
});
