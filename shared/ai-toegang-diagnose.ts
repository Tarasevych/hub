// Oorzakelijke diagnose van AI- en MCP-toegang (01.11.2026, MCP-ACCESS-001).
// Puur (geen database, geen Node, geen React): één gedeeld contract en tweetalige uitleg (uk/nl) tussen server, UI en tests.
// Maakt niets losser: verklaart precies WELKE voorwaarde een toegekend hulpmiddel nu tegenhoudt en WELKE directe actie dat oplost.
import type { AgentSlug } from './connector-v2/agenten';
import type { Kant } from './connector-v2/catalogus';
import type { DienstStand } from './ruimte-scheiding';

export type Tweetalig = { uk: string; nl: string };

export type ToegangWeigerCode =
  | 'GEEN_EIGENAAR'
  | 'GEEN_TECH_PROFIEL'
  | 'GEEN_TECH_SESSIE'
  | 'PAUZE'
  | 'VERLOPEN'
  | 'GRENS_VOORBIJ'
  | 'SITE_SESSIE_WEG'
  | 'BINDING_ONGELDIG'
  | 'AI_NIET_TOEGESTAAN'
  | 'KEUZE_ONTBREEKT'
  | 'DIENST_UIT'
  | 'BEVROREN'
  | 'BELEID_ONGELDIG'
  | 'BELEID_AGENT_ONBEKEND'
  | 'BELEID_AGENT_UIT'
  | 'BELEID_VERLOPEN'
  | 'BELEID_UIT'
  | 'VOORKEUR_WACHT_TOEPASSEN'
  | 'GITHUB_NIET_GEKOPPELD'
  | 'SITE_SCHAKELAAR_UIT'
  | 'HULPMIDDEL_MODUS_UIT';

export type VolgendeActieSoort =
  | 'start_tech_sessie'
  | 'hervat_tech_sessie'
  | 'aanmelden_site'
  | 'zet_ai_sessie_toegang'
  | 'zet_ai_dienst_aan'
  | 'ontvries_ai_dienst'
  | 'pas_voorkeur_toe'
  | 'open_ai_beleid'
  | 'koppel_github'
  | 'open_ai_schakelaars'
  | 'geen';

export type BeleidDiagnoseStaat =
  | 'niet-ingesteld'
  | 'toegestaan'
  | 'gedeeltelijk'
  | 'agent-onbekend'
  | 'agent-uit'
  | 'verlopen'
  | 'uit'
  | 'ongeldig';

export type DiagnoseLaag = 'sessie' | 'delegatie' | 'dienst' | 'beleid' | 'voorkeur' | 'github' | 'schakelaar';

export type DiagnoseBlokkade = {
  code: ToegangWeigerCode;
  laag: DiagnoseLaag;
  getroffenAantal: number;
  uitleg: Tweetalig;
  actie: VolgendeActieSoort;
  actieLabel: Tweetalig;
  url: string | null;
};

export type AgentToegangDiagnose = {
  slug: AgentSlug;
  eigenaar: boolean;
  techV2Active: boolean;
  profileSessionActive: boolean;
  profileSessionPaused: boolean;
  profileSessionEnd: number | null;
  profileSessionMode: string | null;
  aiServiceState: DienstStand;
  ruimteKeuzeGemaakt: boolean;
  aiSessionDelegationActive: boolean;
  aiSessionDelegationScope: 'verbinding' | 'alle' | 'geen' | 'niet-van-toepassing';
  aiSessionDelegationTermijn: string | null;
  aiSessionDelegationEnd: number | null;
  aiPolicyState: BeleidDiagnoseStaat;
  aiPolicyAgentId: string | null;
  aiPolicyBlockedCount: number;
  githubConnectedPrive: boolean;
  githubConnectedTechnisch: boolean;
  githubBlockedCount: number;
  siteSwitchBlockedCount: number;
  toolModeBlockedCount: number;
  connectionGranted: {
    verbonden: boolean;
    grantId: string | null;
    kanten: Kant[];
    totaal: number;
    gebruiker: number;
    beheer: number;
  };
  pendingExpansion: {
    wacht: boolean;
    toegevoegdAantal: number;
    kanten: Kant[];
  };
  effectiveTechnicalAccess: boolean;
  effectiveVisibleToolsCount: number;
  effectiveGebruikerVisibleCount: number;
  effectiveBeheerVisibleCount: number;
  denialCode: ToegangWeigerCode | null;
  blokkades: DiagnoseBlokkade[];
  nextAction: {
    actie: VolgendeActieSoort;
    label: Tweetalig;
    uitleg: Tweetalig;
    url: string | null;
  } | null;
};

/** Veilige, minimale samenvatting voor een externe MCP-klant in v2_whoami (zonder interne sessie-id's, e-mail of vingerafdrukken). */
export type ExterneVeiligeDiagnose = {
  effectiveToolsNow: number;
  grantedToolsTotal: number;
  technicalAccessNow: boolean;
  pendingPermissionExpansion: boolean;
  statusCode: 'OK' | ToegangWeigerCode;
  summary: string;
  manageUrl: string;
};

export const WEIGER_UITLEG: Readonly<Record<ToegangWeigerCode, Tweetalig>> = Object.freeze({
  GEEN_EIGENAAR: {
    uk: 'Технічні інструменти (_beheer) доступні лише власнику сервера.',
    nl: 'Technische hulpmiddelen (_beheer) zijn alleen beschikbaar voor de eigenaar van de server.',
  },
  GEEN_TECH_PROFIEL: {
    uk: 'Для цього акаунта немає чинного технічного профілю.',
    nl: 'Voor dit account is er geen geldig technisch profiel.',
  },
  GEEN_TECH_SESSIE: {
    uk: 'Технічний сеанс власника зараз не запущений — усі інструменти _beheer тимчасово приховані.',
    nl: 'De technische sessie van de eigenaar draait nu niet — alle _beheer-hulpmiddelen zijn tijdelijk verborgen.',
  },
  PAUZE: {
    uk: 'Технічний простір власника зараз на паузі (активний особистий режим).',
    nl: 'De technische ruimte van de eigenaar staat nu op pauze (persoonlijke stand actief).',
  },
  VERLOPEN: {
    uk: 'Час попереднього технічного сеансу минув — запустіть новий технічний сеанс.',
    nl: 'De tijd van de vorige technische sessie is verstreken — start een nieuwe technische sessie.',
  },
  GRENS_VOORBIJ: {
    uk: 'Граничний термін технічного сеансу минув — запустіть новий технічний сеанс.',
    nl: 'De uiterste grens van de technische sessie is voorbij — start een nieuwe technische sessie.',
  },
  SITE_SESSIE_WEG: {
    uk: 'Сеанс входу на сайт завершився або ви вийшли з акаунта — увійдіть на сайт і запустіть технічний простір.',
    nl: 'De aanmeldsessie op de site is beëindigd of u bent uitgelogd — meld opnieuw aan en start de technische ruimte.',
  },
  BINDING_ONGELDIG: {
    uk: 'Прив’язка технічного сеансу до сесії входу застаріла — перезапустіть технічний сеанс.',
    nl: 'De binding van de technische sessie aan de aanmeldsessie is verouderd — herstart de technische sessie.',
  },
  AI_NIET_TOEGESTAAN: {
    uk: 'Технічний сеанс власника активний, але для цього підключення ШІ ще не увімкнено делегування технічного простору на поточний сеанс.',
    nl: 'De technische sessie van de eigenaar is actief, maar voor deze AI-koppeling staat technische toegang voor de huidige sessie nog niet aan.',
  },
  KEUZE_ONTBREEKT: {
    uk: 'Ще не зроблено одноразовий вибір режиму служби «Підключення ШІ» у технічному просторі даних (окремо чи спільно).',
    nl: 'De eenmalige keuze voor de dienst «AI-koppelingen» in de technische gegevensruimte (eigen of gedeeld) ontbreekt nog.',
  },
  DIENST_UIT: {
    uk: 'Службу «Підключення ШІ» вимкнено в технічному просторі даних власника.',
    nl: 'De dienst «AI-koppelingen» staat uit in de technische gegevensruimte van de eigenaar.',
  },
  BEVROREN: {
    uk: 'Технічну скриньку служби «Підключення ШІ» заморожено до рішення власника сервера.',
    nl: 'De technische lade van de dienst «AI-koppelingen» is bevroren in afwachting van een besluit van de eigenaar.',
  },
  BELEID_ONGELDIG: {
    uk: 'Підписаний ланцюжок політики «Доступ ШІ» (keten.json) не пройшов перевірку — усі дії ШІ заблоковано з міркувань безпеки.',
    nl: 'De ondertekende keten van het AI-beleid (keten.json) kon niet worden geverifieerd — alle AI-acties zijn veilig geblokkeerd.',
  },
  BELEID_AGENT_ONBEKEND: {
    uk: 'Цього агента ще не додано до підписаної політики «Доступ ШІ» власника, тому політика-стеля приховує його робочі інструменти.',
    nl: 'Deze agent staat nog niet in het ondertekende AI-beleid van de eigenaar, waardoor het beleidsplafond zijn hulpmiddelen verbergt.',
  },
  BELEID_AGENT_UIT: {
    uk: 'Цього агента вимкнено у підписаній політиці «Доступ ШІ» власника.',
    nl: 'Deze agent staat uit in het ondertekende AI-beleid van de eigenaar.',
  },
  BELEID_VERLOPEN: {
    uk: 'Тимчасовий дозвіл у підписаній політиці «Доступ ШІ» закінчився — робочі інструменти знову закриті політикою-стелею.',
    nl: 'De tijdelijke toestemming in het ondertekende AI-beleid is verlopen — de hulpmiddelen zijn weer gesloten door het beleidsplafond.',
  },
  BELEID_UIT: {
    uk: 'Підписана політика «Доступ ШІ» зараз забороняє частину або всі вибрані інструменти для цього агента.',
    nl: 'Het ondertekende AI-beleid verbiedt momenteel een deel van of alle gekozen hulpmiddelen voor deze agent.',
  },
  VOORKEUR_WACHT_TOEPASSEN: {
    uk: 'Нові дозволи збережено в чернетці, але ще не застосовано до активного токена цього агента.',
    nl: 'Nieuwe rechten zijn opgeslagen als voorkeur, maar nog niet toegepast op het actieve token van deze agent.',
  },
  GITHUB_NIET_GEKOPPELD: {
    uk: 'Інструменти GitHub вибрано в дозволах, але токен GitHub не підключено у відповідному просторі даних.',
    nl: 'GitHub-hulpmiddelen zijn aangevinkt in de rechten, maar er is geen GitHub-token gekoppeld in deze gegevensruimte.',
  },
  SITE_SCHAKELAAR_UIT: {
    uk: 'Частину приватних інструментів вимкнено глобальним або користувацьким перемикачем доступів ШІ.',
    nl: 'Een deel van de privéhulpmiddelen staat uit door een site- of gebruikersschakelaar voor AI-toegang.',
  },
  HULPMIDDEL_MODUS_UIT: {
    uk: 'Частину ризикованих інструментів вимкнено в режимах інструментів («Інструменти й дозволи»).',
    nl: 'Een deel van de risicovolle hulpmiddelen staat op «uit» in de hulpmiddelmodi («Hulpmiddelen en rechten»).',
  },
});

export const ACTIE_BIJ_CODE: Readonly<Record<ToegangWeigerCode, { actie: VolgendeActieSoort; label: Tweetalig; pad: (hosts: { admin: string; mcp: string; hub: string }, slug: AgentSlug) => string | null }>> = Object.freeze({
  GEEN_EIGENAAR: { actie: 'geen', label: { uk: 'Лише для власника', nl: 'Alleen voor eigenaar' }, pad: () => null },
  GEEN_TECH_PROFIEL: { actie: 'geen', label: { uk: 'Профіль відсутній', nl: 'Geen profiel' }, pad: () => null },
  GEEN_TECH_SESSIE: {
    actie: 'start_tech_sessie',
    label: { uk: 'Увімкнути технічний простір', nl: 'Technische ruimte aanzetten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  PAUZE: {
    actie: 'hervat_tech_sessie',
    label: { uk: 'Відновити технічний сеанс з паузи', nl: 'Technische sessie hervatten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  VERLOPEN: {
    actie: 'start_tech_sessie',
    label: { uk: 'Запустити новий технічний сеанс', nl: 'Nieuwe technische sessie starten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  GRENS_VOORBIJ: {
    actie: 'start_tech_sessie',
    label: { uk: 'Запустити новий технічний сеанс', nl: 'Nieuwe technische sessie starten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  SITE_SESSIE_WEG: {
    actie: 'aanmelden_site',
    label: { uk: 'Увійти на сайт і відкрити технічний простір', nl: 'Aanmelden en technische ruimte openen' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  BINDING_ONGELDIG: {
    actie: 'start_tech_sessie',
    label: { uk: 'Перезапустити технічний сеанс', nl: 'Technische sessie herstarten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  AI_NIET_TOEGESTAAN: {
    actie: 'zet_ai_sessie_toegang',
    label: { uk: 'Дозволити технічний простір для цього ШІ на сеанс', nl: 'Technische ruimte voor deze AI in deze sessie toestaan' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  KEUZE_ONTBREEKT: {
    actie: 'zet_ai_dienst_aan',
    label: { uk: 'Увімкнути службу «Підключення ШІ» в технічному просторі', nl: 'Dienst «AI-koppelingen» in technische ruimte aanzetten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  DIENST_UIT: {
    actie: 'zet_ai_dienst_aan',
    label: { uk: 'Увімкнути службу «Підключення ШІ» в технічному просторі', nl: 'Dienst «AI-koppelingen» in technische ruimte aanzetten' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  BEVROREN: {
    actie: 'ontvries_ai_dienst',
    label: { uk: 'Розморозити технічні дані «Підключення ШІ»', nl: 'Technische gegevens «AI-koppelingen» ontvriezen' },
    pad: (h) => `https://${h.hub}/`,
  },
  BELEID_ONGELDIG: {
    actie: 'open_ai_beleid',
    label: { uk: 'Перевірити підписану політику «Доступ ШІ»', nl: 'Ondertekend AI-beleid controleren' },
    pad: (h) => `https://${h.admin}/ai`,
  },
  BELEID_AGENT_ONBEKEND: {
    actie: 'open_ai_beleid',
    label: { uk: 'Додати агента у підписаній політиці «Доступ ШІ»', nl: 'Agent toevoegen in ondertekend AI-beleid' },
    pad: (h) => `https://${h.admin}/ai`,
  },
  BELEID_AGENT_UIT: {
    actie: 'open_ai_beleid',
    label: { uk: 'Увімкнути агента у підписаній політиці «Доступ ШІ»', nl: 'Agent aanzetten in ondertekend AI-beleid' },
    pad: (h) => `https://${h.admin}/ai`,
  },
  BELEID_VERLOPEN: {
    actie: 'open_ai_beleid',
    label: { uk: 'Подовжити доступ у підписаній політиці «Доступ ШІ»', nl: 'Toegang verlengen in ondertekend AI-beleid' },
    pad: (h) => `https://${h.admin}/ai`,
  },
  BELEID_UIT: {
    actie: 'open_ai_beleid',
    label: { uk: 'Налаштувати підписану політику «Доступ ШІ»', nl: 'Ondertekend AI-beleid instellen' },
    pad: (h) => `https://${h.admin}/ai`,
  },
  VOORKEUR_WACHT_TOEPASSEN: {
    actie: 'pas_voorkeur_toe',
    label: { uk: 'Застосувати збережені дозволи зараз (без розриву чату)', nl: 'Opgeslagen rechten nu toepassen (zonder verbreken)' },
    pad: (h, slug) => `https://${h.mcp}/agents#agent/${slug}`,
  },
  GITHUB_NIET_GEKOPPELD: {
    actie: 'koppel_github',
    label: { uk: 'Підключити GitHub для цього простору', nl: 'GitHub koppelen voor deze ruimte' },
    pad: (h) => `https://${h.hub.replace(/^hub\./, 'github.')}/accounts`,
  },
  SITE_SCHAKELAAR_UIT: {
    actie: 'open_ai_schakelaars',
    label: { uk: 'Перевірити перемикачі доступів ШІ', nl: 'AI-toegangsschakelaars controleren' },
    pad: (h) => `https://${h.mcp}/agents#toegang`,
  },
  HULPMIDDEL_MODUS_UIT: {
    actie: 'open_ai_schakelaars',
    label: { uk: 'Перевірити режими інструментів', nl: 'Hulpmiddelmodi controleren' },
    pad: (h) => `https://${h.mcp}/agents#rechten`,
  },
});

const EXTERNE_SAMENVATTING: Readonly<Record<ToegangWeigerCode, string>> = Object.freeze({
  GEEN_EIGENAAR: 'Technical (_beheer) tools require the server owner account.',
  GEEN_TECH_PROFIEL: 'No active technical profile exists on this account.',
  GEEN_TECH_SESSIE: 'The owner technical session is currently not started.',
  PAUZE: 'The owner technical space is currently paused (switched to personal mode).',
  VERLOPEN: 'The owner timed technical session has expired.',
  GRENS_VOORBIJ: 'The owner technical session boundary has expired.',
  SITE_SESSIE_WEG: 'The owner website login session ended; sign in again on the website.',
  BINDING_ONGELDIG: 'The owner technical session binding needs to be restarted on the website.',
  AI_NIET_TOEGESTAAN: 'The owner technical session is active, but technical AI delegation for this connection is not enabled yet.',
  KEUZE_ONTBREEKT: 'The one-time data-space choice for service "AI connections" has not been made yet.',
  DIENST_UIT: 'The service "AI connections" is currently turned off in the owner technical data space.',
  BEVROREN: 'The technical data space for "AI connections" is currently frozen awaiting an owner decision.',
  BELEID_ONGELDIG: 'The signed AI policy chain could not be verified (fail-closed).',
  BELEID_AGENT_ONBEKEND: 'This AI agent is not listed in the owner signed AI policy (admin → AI access).',
  BELEID_AGENT_UIT: 'This AI agent is disabled in the owner signed AI policy (admin → AI access).',
  BELEID_VERLOPEN: 'The timed grant in the owner signed AI policy has expired (admin → AI access).',
  BELEID_UIT: 'The owner signed AI policy currently blocks one or more granted tools (admin → AI access).',
  VOORKEUR_WACHT_TOEPASSEN: 'Newly saved permissions are waiting to be applied on the agent page.',
  GITHUB_NIET_GEKOPPELD: 'GitHub tools are granted, but no GitHub token is connected in the active data space.',
  SITE_SCHAKELAAR_UIT: 'One or more private tools are turned off by an account or site AI switch.',
  HULPMIDDEL_MODUS_UIT: 'One or more risky tools are set to off in tool modes.',
});

export function maakBlokkade(
  code: ToegangWeigerCode,
  laag: DiagnoseLaag,
  getroffenAantal: number,
  hosts: { admin: string; mcp: string; hub: string },
  slug: AgentSlug,
): DiagnoseBlokkade {
  const meta = ACTIE_BIJ_CODE[code];
  return {
    code,
    laag,
    getroffenAantal,
    uitleg: WEIGER_UITLEG[code],
    actie: meta.actie,
    actieLabel: meta.label,
    url: meta.pad(hosts, slug),
  };
}

export function veiligeExterneDiagnose(d: AgentToegangDiagnose, manageUrl: string): ExterneVeiligeDiagnose {
  const statusCode: 'OK' | ToegangWeigerCode = d.denialCode ?? 'OK';
  const summary = d.denialCode
    ? `${EXTERNE_SAMENVATTING[d.denialCode]} Direct management page: ${manageUrl}`
    : `All active permissions are available (${d.effectiveVisibleToolsCount} tools visible).`;
  return {
    effectiveToolsNow: d.effectiveVisibleToolsCount,
    grantedToolsTotal: d.connectionGranted.totaal,
    technicalAccessNow: d.effectiveTechnicalAccess,
    pendingPermissionExpansion: d.pendingExpansion.wacht,
    statusCode,
    summary,
    manageUrl,
  };
}
