// Beheerlogboek (admin.tarasevych.com/audit): gedeelde, PURE regels voor server, scherm, export en tests.
//
// CONTRACT VAN EEN JOURNAALREGEL (voor iedereen die een gebeurtenis schrijft; de tabel is app.audit, migratie 0006):
//   ownerId  = het account WAAROP het effect zit (de keten is per ownerId);
//   actorId  = WIE het deed (een gebruiker; bij een AI-agent: de eigenaar die de agent machtigde + details.agent);
//   action   = stabiele code, bij voorkeur «owner.<gebied>.<werkwoord>» of «<gebied>_<werkwoord>» (zie ACTIE_LABELS);
//   result   = success | ok | klaar | denied | geweigerd | failure | error | mislukt | …  (zie resultaatKlasse);
//   details  = vrije JSON (nooit geheimen!) met bij voorkeur deze vaste velden, zodat het scherm ze zonder gokken toont:
//       doel      { soort, id?, naam? }   WIE/WAT het betreft (account, agent, token, sleutel, app, geheim, rol, beleid, pakket, apparaat…)
//       wijziging { van?, naar?, velden? } voor/na, kort (scalairen of kleine objecten)
//       reden     tekst (verplicht bij intrekken/weigeren)
//       agent     slug van de AI-agent (claude, gpt, grok, gemini, copilot, cursor) als er een agent in het spel is
//   Zonder deze velden probeert doelVan()/wijzigingVan() ze nog uit de oude veldnamen te halen (agent, klant, onderwerp, email, …),
//   zodat ook oudere regels leesbaar zijn. Schrijf nieuwe regels met backend/beheer-journaal.ts → journaalSchrijf().

export type Taal = 'uk' | 'nl';
export type CategorieId = 'sessie' | 'toegang' | 'beheer' | 'ai' | 'uitrol' | 'geheimen' | 'tech' | 'apparaten' | 'mail' | 'integraties' | 'diagnose' | 'privacy' | 'overig';
export type Categorie = { id: CategorieId; uk: string; nl: string; patroon: string };

/** Volgorde telt: de eerste die past wint. Patronen zijn bewust eenvoudig (werken identiek in JS en in PostgreSQL ~). */
export const CATEGORIEEN: readonly Categorie[] = [
  { id: 'uitrol', uk: 'Оновлення сайту', nl: 'Uitrol', patroon: '^(uitrol_|uitrol\\.|owner\\.uitrol\\.|goedkeur_|owner\\.admin\\.updates)' },
  { id: 'tech', uk: 'Технічний профіль', nl: 'Technisch profiel', patroon: '^(owner\\.tech\\.|owner\\.ruimte\\.|owner\\.flags\\.|owner\\.ondersteuning\\.|owner\\.impersonatie\\.|klimop_|orch_|eigenaar_besluit_|owner\\.beleid\\.)' },
  { id: 'geheimen', uk: 'Секрети та ключі', nl: 'Geheimen en sleutels', patroon: '(^secret\\.|^sleutelkluis\\.|vault|google-contour|owner\\.app\\.geheim|owner\\.api\\.|api-platform|mcp_(console|backup|archive))' },
  { id: 'ai', uk: 'ШІ та агенти', nl: 'AI en agenten', patroon: '^(ai_|owner\\.mcp\\.|owner\\.ai\\.|owner\\.agent\\.|agent\\.(grant|policy)\\.|owner\\.connector|agent_|agent\\.|beheer\\.agent\\.|browser\\.invoke|ai_beleid|owner\\.extensie\\.|owner\\.vaardigheden\\.|koppeling_gewijzigd$)' },
  { id: 'apparaten', uk: 'Пристрої та термінал', nl: 'Apparaten en terminal', patroon: '^(owner\\.terminal\\.|owner\\.remote\\.|owner\\.apparaat\\.|apparaat\\.|owner\\.ssh-ca\\.|owner\\.browser\\.(enabled|grant)|owner\\.admin\\.device)' },
  { id: 'diagnose', uk: 'Діагностика', nl: 'Diagnose', patroon: '^(diag\\.|admin\\.diagnostiek|owner\\.diagnose|owner\\.admin\\.diagnostics|owner\\.siem|zoek\\.index\\.|owner\\.systeem\\.verbinding\\.|server_storing$|netwerk_offline$|verbinding_hersteld$)' },
  { id: 'beheer', uk: 'Адміністрування', nl: 'Beheer', patroon: '^(admin_|admin\\.|rbac\\.|account_|workspace_|owner_role|owner\\.rol\\.|owner\\.admin\\.|owner\\.role\\.|owner\\.identity\\.|owner\\.access\\.requested|account\\.definitief)' },
  { id: 'toegang', uk: 'Способи входу та доступ', nl: 'Aanmeldmethoden en toegang', patroon: '^(access\\.|aanmeld\\.|aanmelden\\.|bevestigen\\.|beveiliging\\.|code\\.|inlog\\.|koppelen\\.|koppeling\\.|matrix\\.gewijzigd$|niet-ik$|fout-symbool$|plaats-eis\\.|stap-op$|telegram-sterk$|telegram\\.|venster\\.geopend$|widget\\.|wijziging\\.|owner\\.step_up|passkey_|toegang|toegangscode_|gast_)' },
  { id: 'sessie', uk: 'Входи та сесії', nl: 'Aanmeldingen en sessies', patroon: '^(sign_in|owner_sign_in_|sessie\\.|identity_linked|email_conflict|service_handoff|owner\\.(session|tab|redirect|auth|account|account-menu|security|browser)\\.|owner\\.browser\\.|GOOGLE_|LOGIN_|TRANSACTION_|PRIMARY_REDIRECT_|POPUP_|IDENTITY_|SERVICE_SESSION_)' },
  { id: 'mail', uk: 'Пошта', nl: 'E-mail', patroon: '^(owner\\.mail\\.|mail\\.)' },
  { id: 'integraties', uk: 'Інтеграції', nl: 'Integraties', patroon: '^(integration\\.|owner\\.(connectors|github|cloud|google|calendar|hub|klantrelatie|social)|cloud\\.|agenda\\.|huis\\.|notitie\\.|connector_|connectors\\.)' },
  { id: 'privacy', uk: 'Приватність', nl: 'Privacy', patroon: '^(owner\\.privacy|privacy\\.|owner\\.profile|owner\\.notifications|owner\\.meldingen\\.|owner\\.ui)' },
];
export const CATEGORIE_OVERIG: Categorie = { id: 'overig', uk: 'Інше', nl: 'Overig', patroon: '' };
export const ALLE_CATEGORIEEN: readonly Categorie[] = [...CATEGORIEEN, CATEGORIE_OVERIG];

const REGEXEN = CATEGORIEEN.map((c) => ({ id: c.id, re: new RegExp(c.patroon) }));
export function categorieVan(action: string): CategorieId {
  for (const c of REGEXEN) if (c.re.test(action)) return c.id;
  return 'overig';
}
export const categorieNaam = (id: string, lang: Taal): string => { const c = ALLE_CATEGORIEEN.find((x) => x.id === id); return c ? c[lang] : id; };

/** SQL-uitdrukking (PostgreSQL) die dezelfde indeling geeft; `kolom` is de actiekolom. Patronen zijn constanten uit deze module. */
export function categorieSql(kolom = 'action'): string {
  const esc = (s: string) => s.replace(/'/g, "''");
  return `CASE ${CATEGORIEEN.map((c) => `WHEN ${kolom} ~ '${esc(c.patroon)}' THEN '${c.id}'`).join(' ')} ELSE 'overig' END`;
}

/** Technische ruis: gebeurtenissen die elke paginalading of aanmeldstap schrijft. Standaard verborgen, nooit verwijderd. */
export const RUIS_PATROON = '^(owner\\.admin\\.bootstrap|owner\\.admin\\.audit\\.viewed|owner\\.notifications\\.read|owner\\.meldingen\\.(ecosysteem\\.(actie|profiel|ontvangst|aflevering_overzicht)|bijlage\\.telegram)|owner\\.session\\.rotated|owner\\.session\\.refresh|owner\\.browser\\.grant\\.(used|cookie)|owner\\.diagnose\\.gelezen|owner\\.admin\\.diagnostics\\.read|owner\\.mcp\\.tools\\.list|owner\\.extensie\\.beheer\\.bekeken|owner\\.terminal\\.opdrachten\\.bekeken|klimop_(overzicht|dubbel_logboek|quorum_logboek|spiegel_logboek)|owner\\.ui\\.|GOOGLE_REDIRECT|GOOGLE_CALLBACK|LOGIN_CLICK|POPUP_|PRIMARY_REDIRECT_|TRANSACTION_|IDENTITY_LOADED|SERVICE_SESSION_CREATED|owner\\.redirect\\.session)';
const RUIS_RE = new RegExp(RUIS_PATROON);
export const isRuis = (action: string) => RUIS_RE.test(action);

export type ResultaatKlasse = 'ok' | 'geweigerd' | 'fout' | 'info';
const OK_RE = /^(success|ok|klaar|approved|goedgekeurd|created|complete|completed|consumed|granted|valid|passed|geslaagd)$/i;
const GEWEIGERD_RE = /^(denied|geweigerd|blocked|rejected|afgewezen|forbidden|refused|ingetrokken|revoked)$/i;
const FOUT_RE = /^(fail|failed|failure|error|fout|mislukt|timeout|invalid|aborted|afgebroken)$/i;
export function resultaatKlasse(result: string): ResultaatKlasse {
  const r = String(result || '').trim();
  if (OK_RE.test(r)) return 'ok';
  if (GEWEIGERD_RE.test(r)) return 'geweigerd';
  if (FOUT_RE.test(r)) return 'fout';
  return 'info';
}
/** Zelfde indeling in PostgreSQL (kolom `result`). */
export function resultaatSql(kolom = 'result'): string {
  const bron = (re: RegExp) => re.source;
  return `CASE WHEN ${kolom} ~* '${bron(OK_RE)}' THEN 'ok' WHEN ${kolom} ~* '${bron(GEWEIGERD_RE)}' THEN 'geweigerd' WHEN ${kolom} ~* '${bron(FOUT_RE)}' THEN 'fout' ELSE 'info' END`;
}
export const RESULTAAT_NAMEN: Record<ResultaatKlasse, { uk: string; nl: string }> = {
  ok: { uk: 'Успішно', nl: 'Gelukt' }, geweigerd: { uk: 'Відхилено', nl: 'Geweigerd' }, fout: { uk: 'Помилка', nl: 'Fout' }, info: { uk: 'Подія', nl: 'Gebeurtenis' },
};

// ------------------------------------------------------------------------------------------------ labels
// [uk, nl]. Alleen exacte codes; voor de rest valt actieLabel() terug op een leesbare vorm van de code.
export const ACTIE_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  // 23.10 (zone E): het ene scherm «Браузер і агенти» (mcp.* → Підключення ШІ) en het zijpaneel van de extensie 0.7.0.
  'owner.extensie.matrix': ['Змінено дозволи «Браузер і агенти»', 'Rechten «Browser en agenten» gewijzigd'],
  'owner.extensie.matrix.modi': ['Змінено режими інструментів «Браузер і агенти»', 'Modi van hulpmiddelen «Browser en agenten» gewijzigd'],
  'owner.extensie.zijpaneel.chat': ['Чат у боковій панелі розширення', 'Chat in het zijpaneel van de extensie'],
  'owner.admin.role.updated': ['Змінено адміністративну роль', 'Beheerdersrol gewijzigd'],
  'owner.admin.user.updated': ['Змінено користувача', 'Gebruiker gewijzigd'],
  'owner.admin.user.deleted': ['Видалено користувача', 'Gebruiker verwijderd'],
  'owner.admin.user.recovered': ['Відновлено користувача', 'Gebruiker hersteld'],
  'owner.admin.sso-policy.updated': ['Змінено політику єдиного входу', 'Beleid voor eenmalige aanmelding gewijzigd'],
  'owner.admin.oauth-policy.updated': ['Змінено політику OAuth', 'OAuth-beleid gewijzigd'],
  'owner.admin.directory-config.updated': ['Змінено налаштування каталогу', 'Directory-instelling gewijzigd'],
  'owner.admin.access-request.decided': ['Рішення щодо запиту на доступ', 'Besluit over toegangsverzoek'],
  'owner.admin.bootstrap': ['Відкрито панель адміністрування', 'Beheerpaneel geopend'],
  'owner.admin.audit.viewed': ['Переглянуто журнал', 'Logboek bekeken'],
  'owner.admin.audit.exported': ['Експортовано журнал', 'Logboek geëxporteerd'],
  'owner.admin.audit.chain_checked': ['Перевірено ланцюжок журналу', 'Logboekketen gecontroleerd'],
  'owner.admin.diagnostics.read': ['Відкрито діагностику', 'Diagnose geopend'],
  'owner.tech.toegekend': ['Надано технічний профіль', 'Technisch profiel toegekend'],
  'owner.tech.ingetrokken': ['Відкликано технічний профіль', 'Technisch profiel ingetrokken'],
  'owner.tech.geactiveerd': ['Активовано технічний профіль', 'Technisch profiel geactiveerd'],
  'owner.tech.beeindigd': ['Завершено технічний профіль', 'Technisch profiel beëindigd'],
  'owner.tech.band': ['Змінено вигляд смуги профілю', 'Profielband aangepast'],
  'owner.tech.browser': ['Дія ШІ в браузері (технічний слот)', 'AI-browseractie (technisch slot)'],
  'owner.tech.erven_keuze': ['Змінено, чи нові вкладки технічні', 'Nieuwe tabbladen technisch of niet'],
  // Gescheiden gegevensruimtes (migratie 0082, shared/ruimte-scheiding.ts → JOURNAAL).
  'owner.ruimte.keuze': ['Обрано, як розділені простори', 'Keuze gemaakt over gescheiden ruimtes'],
  'owner.ruimte.verbonden': ['Під’єднано службу до технічного простору', 'Dienst verbonden met de technische ruimte'],
  'owner.ruimte.ontkoppeld': ['Від’єднано службу від технічного простору', 'Dienst losgemaakt van de technische ruimte'],
  'owner.ruimte.bevroren': ['Заморожено технічний простір служби', 'Technische ruimte van de dienst bevroren'],
  'owner.ruimte.besluit': ['Рішення власника щодо заморожених даних', 'Besluit van de eigenaar over bevroren gegevens'],
  'owner.ruimte.geweigerd': ['Відмовлено в доступі до технічного простору', 'Toegang tot de technische ruimte geweigerd'],
  'owner.flags.gewijzigd': ['Змінено прапорець', 'Vlag gewijzigd'],
  'owner.flags.verwijderd': ['Видалено прапорець', 'Vlag verwijderd'],
  'owner.flags.getest': ['Протестовано прапорець', 'Vlag getest'],
  'owner.flags.via_ai': ['Змінено прапорець через ШІ (підтверджено на сайті)', 'Vlag gewijzigd via AI (bevestigd op de site)'],
  'owner.ondersteuning.toegestaan': ['Дозволено перегляд підтримкою', 'Weergave door ondersteuning toegestaan'],
  'owner.ondersteuning.bekeken': ['Підтримка переглянула дані', 'Ondersteuning bekeek gegevens'],
  'owner.ondersteuning.beeindigd': ['Завершено сеанс підтримки', 'Ondersteuningssessie beëindigd'],
  'owner.ondersteuning.nood': ['Аварійний доступ підтримки', 'Noodtoegang ondersteuning'],
  'owner.impersonatie.gevraagd': ['Запит «Подивитися як користувач»', 'Verzoek «Bekijken als gebruiker»'],
  'owner.impersonatie.toegestaan': ['Дозволено перегляд як користувач', 'Bekijken als gebruiker toegestaan'],
  'owner.impersonatie.geweigerd': ['Відхилено перегляд як користувач', 'Bekijken als gebruiker geweigerd'],
  'owner.impersonatie.bekeken': ['Адміністратор переглянув від імені', 'Beheerder bekeek namens gebruiker'],
  'owner.impersonatie.actie': ['Дія адміністратора від імені', 'Actie van beheerder namens gebruiker'],
  'owner.impersonatie.geweigerd-route': ['Заблоковано дію під час перегляду', 'Actie geblokkeerd tijdens bekijken'],
  'owner.impersonatie.beeindigd': ['Завершено перегляд як користувач', 'Bekijken als gebruiker beëindigd'],
  'uitrol_voorbereider_gegeven': ['Надано право готувати оновлення', 'Recht om updates voor te bereiden gegeven'],
  'uitrol_voorbereider_ingetrokken': ['Відкликано право готувати оновлення', 'Recht om updates voor te bereiden ingetrokken'],
  'uitrol_voorstel_begonnen': ['Почато завантаження пакета', 'Pakket-upload gestart'],
  'uitrol_voorstel_klaar': ['Пакет завантажено й перевірено', 'Pakket geüpload en gecontroleerd'],
  'uitrol_voorstel_voorcontrole_mislukt': ['Перевірку пакета не пройдено', 'Voorcontrole pakket mislukt'],
  // 0081: een poging die niet tot een installatie kwam — ook een afbreking die alleen de browser zag (details.gemeldDoor).
  'uitrol_poging_afgebroken': ['Спробу розгортання перервано', 'Uitrolpoging afgebroken'],
  'uitrol_voorstel_goedgekeurd': ['Схвалено оновлення (passkey)', 'Update goedgekeurd (passkey)'],
  'uitrol_voorstel_goedkeuring_geweigerd': ['Схвалення оновлення відхилено', 'Goedkeuring update geweigerd'],
  'uitrol_voorstel_afgewezen': ['Відхилено оновлення', 'Update afgewezen'],
  'uitrol_passkey_aangemeld': ['Зареєстровано passkey для оновлень', 'Passkey voor updates geregistreerd'],
  'uitrol_passkey_aanmelding_ingetrokken': ['Скасовано реєстрацію passkey', 'Passkey-aanmelding ingetrokken'],
  'uitrol_passkey_toevoegen_gevraagd': ['Запит на додавання passkey', 'Verzoek passkey toevoegen'],
  'uitrol_passkey_verwijderen_gevraagd': ['Запит на видалення passkey', 'Verzoek passkey verwijderen'],
  'uitrol_passkey_intrekken_gevraagd': ['Запит на відкликання passkey', 'Verzoek passkey intrekken'],
  'owner.uitrol.diagnose.uitgevoerd': ['Виконано діагностику оновлень', 'Uitrol-diagnose uitgevoerd'],
  'owner.uitrol.pakket.gedownload': ['Завантажено архів випуску', 'Release-archief gedownload'],
  'owner.uitrol.pakket.opgeruimd': ['Видалено старі архіви випусків', 'Oude release-archieven verwijderd'],
  'owner.uitrol.github.gepubliceerd': ['Випуск опубліковано на GitHub', 'Release gepubliceerd op GitHub'],
  'owner.uitrol.github.mislukt': ['Публікацію на GitHub не виконано', 'Publicatie op GitHub niet gelukt'],
  'owner.uitrol.github.instellingen': ['Змінено налаштування GitHub для випусків', 'GitHub-instellingen voor releases gewijzigd'],
  'ai_grant_added': ['Надано дозвіл ШІ', 'AI-recht gegeven'],
  'ai_grant_always_enabled': ['Дозвіл ШІ «завжди»', 'AI-recht «altijd»'],
  'ai_grants_revoked': ['Відкликано дозволи ШІ', 'AI-rechten ingetrokken'],
  'ai_capabilities_changed': ['Змінено можливості ШІ', 'AI-mogelijkheden gewijzigd'],
  'ai_user_blocked': ['Заблоковано ШІ для користувача', 'AI geblokkeerd voor gebruiker'],
  'ai_user_unblocked': ['Розблоковано ШІ для користувача', 'AI gedeblokkeerd voor gebruiker'],
  'ai_stop_all': ['Зупинено весь доступ ШІ', 'Alle AI-toegang gestopt'],
  'ai_beleid_gewijzigd': ['Змінено політику ШІ', 'AI-beleid gewijzigd'],
  'ai_beleid_geweigerd': ['Зміну політики ШІ відхилено', 'Wijziging AI-beleid geweigerd'],
  'agent_session_exchanged': ['Агент отримав сесію', 'Agent kreeg sessie'],
  'agent_session_token_issued': ['Видано токен агента', 'Agenttoken uitgegeven'],
  'owner.connector.v2.gewijzigd': ['Змінено права агента', 'Agentrechten gewijzigd'],
  'owner.connector.v2.massa': ['Масова зміна прав агентів', 'Bulkwijziging agentrechten'],
  'owner.connector.v2.herverbinden': ['Перепідключено агента', 'Agent opnieuw verbonden'],
  'owner.connector.v2.instellingen': ['Змінено налаштування конектора', 'Connectorinstellingen gewijzigd'],
  'owner.mcp.grant.approved': ['Схвалено підключення ШІ', 'AI-verbinding goedgekeurd'],
  'owner.mcp.cimd.denied': ['MCP: відхилено документ метаданих клієнта (CIMD)', 'MCP: metadatadocument van de klant (CIMD) geweigerd'],
  'owner.mcp.cimd.verouderd': ['MCP: сервер зайнятий — для відомого клієнта взято попередню перевірену копію документа (CIMD)', 'MCP: server bezet — eerder gecontroleerde kopie van het document van een bekende klant gebruikt (CIMD)'],
  'owner.mcp.origin.denied': ['MCP: відхилено запит з недозволеного походження (Origin)', 'MCP: verzoek van niet-toegestane herkomst (Origin) geweigerd'],
  'owner.mcp.grant.denied': ['Відхилено підключення ШІ', 'AI-verbinding afgewezen'],
  'owner.mcp.grant.revoked': ['Відкликано підключення ШІ', 'AI-verbinding ingetrokken'],
  'owner.mcp.grant.connected': ['Підключено ШІ', 'AI verbonden'],
  'owner.mcp.deur.approved': ['Відкрито «двері» для ШІ', 'AI-deur geopend'],
  'owner.mcp.deur.denied': ['Відхилено «двері» для ШІ', 'AI-deur geweigerd'],
  'owner.mcp.deur.revoked': ['Закрито «двері» для ШІ', 'AI-deur gesloten'],
  'owner.mcp.tool': ['Виклик інструмента ШІ', 'AI-toolaanroep'],
  'owner.mcp.tool.setting': ['Змінено режим інструмента ШІ', 'Toolmodus gewijzigd'],
  'owner.mcp.tool.setting_all': ['Змінено режим групи інструментів', 'Toolgroep gewijzigd'],
  'owner.mcp.tool.approved': ['Схвалено дію інструмента', 'Toolactie goedgekeurd'],
  'owner.mcp.tool.rejected': ['Відхилено дію інструмента', 'Toolactie afgewezen'],
  'owner.mcp.duur.setting': ['Змінено строк дії підключення', 'Looptijd verbinding gewijzigd'],
  'owner.mcp.toegang.gezet': ['Встановлено доступ агента', 'Agenttoegang ingesteld'],
  'owner.mcp.toegang.beheer': ['Змінено технічний доступ агента', 'Technische agenttoegang gewijzigd'],
  'owner.ai.site.schakelaar': ['Перемикач сайту для ШІ', 'Site-schakelaar voor AI'],
  'owner.ai.bevestiging.gevraagd': ['ШІ попросив підтвердження на сайті', 'AI vroeg een bevestiging op de site'],
  'owner.ai.bevestiging.bevestigd': ['Запит ШІ підтверджено', 'AI-verzoek bevestigd'],
  'owner.ai.bevestiging.uitgevoerd': ['Підтверджену дію ШІ виконано', 'Bevestigde AI-actie uitgevoerd'],
  'owner.ai.bevestiging.mislukt': ['Підтверджену дію ШІ не виконано', 'Bevestigde AI-actie mislukt'],
  'owner.ai.bevestiging.geweigerd': ['Запит ШІ відхилено', 'AI-verzoek geweigerd'],
  'owner.ai.bevestiging.verlopen': ['Запит ШІ прострочено (30 хв)', 'AI-verzoek verlopen (30 min)'],
  'owner.ai.bevestiging.ingetrokken': ['Запит ШІ скасовано', 'AI-verzoek ingetrokken'],
  'owner.ai.bevestiging.poging-geweigerd': ['Спробу підтвердити запит ШІ відхилено', 'Poging om een AI-verzoek te bevestigen geweigerd'],
  'owner.ai.bord.token': ['Видано токен дошки', 'Bordtoken uitgegeven'],
  'owner.ai.bord.modus': ['Змінено режим дошки ШІ', 'Bordmodus gewijzigd'],
  'agent.namens.aangemaakt': ['Власник дозволив агенту діяти від свого імені (passkey)', 'Eigenaar gaf een agent toestemming namens hem (passkey)'],
  'agent.namens.ingetrokken': ['Дозвіл агенту діяти від імені власника відкликано', 'Toestemming voor agent namens de eigenaar ingetrokken'],
  'agent.namens.geweigerd': ['Спробу видати дозвіл «від імені» відхилено', 'Poging tot toestemming «namens» geweigerd'],
  'agent.namens.spoken_opgeruimd': ['Примарні сесії агентів видалено назавжди', 'Spooksessies van agents definitief verwijderd'],
  'agent.sessie_tool.geweigerd': ['Агент спробував отримати сесію власника — відхилено', 'Agent probeerde een eigenaarssessie te krijgen — geweigerd'],
  'agent.grant.gegeven': ['Надано агенту право готувати оновлення', 'Agent kreeg recht om updates voor te bereiden'],
  'agent.grant.ingetrokken': ['Відкликано право агента готувати оновлення', 'Recht van agent om updates voor te bereiden ingetrokken'],
  'agent.grant.termijn': ['Змінено термін права агента', 'Termijn van agentrecht gewijzigd'],
  'agent.grant.auto_gegeven': ['Право агента створено автоматично (політика ШІ)', 'Agentrecht automatisch aangemaakt (AI-beleid)'],
  'agent.grant.auto_ingetrokken': ['Право агента знято автоматично (політика ШІ)', 'Agentrecht automatisch ingetrokken (AI-beleid)'],
  'agent.policy.gewijzigd': ['Змінено політику ШІ', 'AI-beleid gewijzigd'],
  'agent.policy.geweigerd': ['Зміну політики ШІ відхилено', 'Wijziging AI-beleid geweigerd'],
  'agent.policy.aangeboden': ['Запропоновано зміну політики ШІ', 'Wijziging AI-beleid aangeboden'],
  'owner.agent.paired': ['Пристрій агента підключено', 'Agentapparaat gekoppeld'],
  'owner.agent.revoked': ['Агента відкликано', 'Agent ingetrokken'],
  'owner.agent.opgeruimd': ['Прибрано відключені пристрої й браузери', 'Losgekoppelde apparaten en browsers opgeruimd'],
  'owner.agent.policy': ['Змінено політику агента', 'Agentbeleid gewijzigd'],
  'owner.agent.command': ['Команда агента', 'Agentopdracht'],
  'owner.agent.command.approved': ['Схвалено команду агента', 'Agentopdracht goedgekeurd'],
  'owner.agent.command.rejected': ['Відхилено команду агента', 'Agentopdracht afgewezen'],
  'owner.api.vault.created': ['Додано секрет', 'Geheim toegevoegd'],
  'owner.api.vault.updated': ['Змінено секрет', 'Geheim gewijzigd'],
  'owner.api.vault.deleted': ['Видалено секрет', 'Geheim verwijderd'],
  'owner.api.vault.renamed': ['Перейменовано секрет', 'Geheim hernoemd'],
  'owner.api.vault.revealed': ['Показано секрет', 'Geheim getoond'],
  'owner.api.vault.meta': ['Змінено опис секрету', 'Geheim-metadata gewijzigd'],
  'owner.api.vault.denied': ['Спробу дії з секретом відхилено', 'Poging met geheim geweigerd'],
  'secret.toegang.geweigerd': ['Відмовлено у доступі до секретів', 'Toegang tot geheimen geweigerd'],
  'secret.overzicht.bekeken': ['Відкрито перелік секретів', 'Overzicht van geheimen geopend'],
  'access.google-contour.save': ['Збережено ключі Google-контуру', 'Google-contoursleutels opgeslagen'],
  'access.google-contour.delete': ['Видалено ключі Google-контуру', 'Google-contoursleutels verwijderd'],
  'access.google-contour.reveal': ['Показано ключі Google-контуру', 'Google-contoursleutels getoond'],
  'owner.terminal.geopend': ['Відкрито термінал', 'Terminal geopend'],
  'owner.terminal.gesloten': ['Закрито термінал', 'Terminal gesloten'],
  'owner.terminal.opname.bekeken': ['Переглянуто запис терміналу', 'Terminalopname bekeken'],
  'owner.remote.geopend': ['Відкрито віддалений стіл', 'Extern bureaublad geopend'],
  'owner.remote.verbonden': ['Віддалений стіл під’єднано', 'Extern bureaublad verbonden'],
  'owner.remote.mislukt': ['Віддалений стіл: не вдалося під’єднатися', 'Extern bureaublad: verbinden mislukt'],
  'owner.remote.gesloten': ['Закрито віддалений стіл', 'Extern bureaublad gesloten'],
  'owner.remote.verbinding.toegevoegd': ['Додано підключення віддаленого столу', 'Verbinding extern bureaublad toegevoegd'],
  'owner.remote.verbinding.gewijzigd': ['Змінено підключення віддаленого столу', 'Verbinding extern bureaublad gewijzigd'],
  'owner.remote.verbinding.verwijderd': ['Видалено підключення віддаленого столу', 'Verbinding extern bureaublad verwijderd'],
  'owner.remote.hosts.gewijzigd': ['Змінено дозволені хости віддаленого столу', 'Toegestane hosts extern bureaublad gewijzigd'],
  'owner.ssh-ca.uitgegeven': ['Видано SSH-сертифікат', 'SSH-certificaat uitgegeven'],
  'owner.ssh-ca.geweigerd': ['Відхилено SSH-сертифікат', 'SSH-certificaat geweigerd'],
  'owner.ssh-ca.inrichten': ['SSH-CA підготовлено (CA, KRL, довіра sshd)', 'SSH-CA voorbereid (CA, KRL, sshd-vertrouwen)'],
  'owner.ssh-ca.aan': ['Підпис SSH-сертифікатів увімкнено', 'Ondertekenen van SSH-certificaten aangezet'],
  'owner.ssh-ca.uit': ['Підпис SSH-сертифікатів вимкнено', 'Ondertekenen van SSH-certificaten uitgezet'],
  'owner.ssh-ca.ontmantelen': ['Довіру sshd до SSH-CA прибрано', 'sshd-vertrouwen in de SSH-CA weggehaald'],
  'owner.ssh-ca.ingetrokken': ['Відкликано SSH-сертифікат (KRL)', 'SSH-certificaat ingetrokken (KRL)'],
  'owner.ssh-ca.beheer.geweigerd': ['Відхилено дію з SSH-CA', 'Actie op de SSH-CA geweigerd'],
  'owner.session.revoked.one': ['Завершено сесію', 'Sessie beëindigd'],
  'owner.session.logout.tab': ['Вихід з вкладки', 'Afgemeld in tabblad'],
  'owner.security.revoke-all': ['Завершено всі сесії', 'Alle sessies beëindigd'],
  'owner.security.revoke-others': ['Завершено інші сесії', 'Overige sessies beëindigd'],
  'owner.security.emergency-kill-switch': ['Аварійне вимкнення доступу', 'Noodstop toegang'],
  'owner.account.logout-everywhere': ['Вихід усюди', 'Overal afgemeld'],
  'owner.browser.logout-all': ['Вихід з усіх браузерів', 'Alle browsers afgemeld'],
  'owner.browser.grant.created': ['Запам’ятано браузер', 'Browser onthouden'],
  'owner.browser.grant.revoked': ['Забуто браузер', 'Browser vergeten'],
  'owner.access.requested': ['Запит на доступ', 'Toegangsverzoek'],
  'owner.identity.account.delete': ['Видалено обліковий запис', 'Account verwijderd'],
  'owner.identity.workspace.restored': ['Відновлено простір', 'Werkruimte hersteld'],
  'account.definitief_gewist': ['Остаточно стерто акаунт', 'Account definitief gewist'],
  'access.password.set': ['Встановлено пароль', 'Wachtwoord ingesteld'],
  'access.password.remove': ['Видалено пароль', 'Wachtwoord verwijderd'],
  'access.totp.disable': ['Вимкнено TOTP', 'TOTP uitgeschakeld'],
  'access.totp.replace': ['Замінено TOTP', 'TOTP vervangen'],
  'access.webauthn.remove': ['Видалено passkey', 'Passkey verwijderd'],
  'access.recovery.rotate': ['Нові коди відновлення', 'Nieuwe herstelcodes'],
  'access.recovery.revoke': ['Відкликано коди відновлення', 'Herstelcodes ingetrokken'],
  'access.recovery.bekeken': ['Переглянуто коди відновлення', 'Herstelcodes bekeken'],
  'access.policy.save': ['Змінено політику входу', 'Aanmeldbeleid gewijzigd'],
  'access.step-up': ['Підтверджено дію (step-up)', 'Actie bevestigd (step-up)'],
  'passkey_toegevoegd': ['Додано passkey', 'Passkey toegevoegd'],
  'passkey_stap_op': ['Підтвердження passkey', 'Passkey-bevestiging'],
  'toegangscode_aangemaakt': ['Створено код доступу', 'Toegangscode aangemaakt'],
  'toegangscode_ingetrokken': ['Відкликано код доступу', 'Toegangscode ingetrokken'],
  'toegangscode_ingewisseld': ['Використано код доступу', 'Toegangscode ingewisseld'],
  'toegangscode_gewijzigd': ['Змінено код доступу', 'Toegangscode gewijzigd'],
  'owner.mail.send.committed': ['Надіслано лист', 'E-mail verzonden'],
  'owner.mail.account.disconnected': ['Відключено поштовий акаунт', 'Mailaccount ontkoppeld'],
  // Afzenders per account (audit 18.10.2026): alleen domein + korte hash van het adres in het logboek.
  'owner.mail.afzender.geverifieerd': ['Відправника підтверджено вручну', 'Afzender handmatig bevestigd'],
  'owner.mail.afzender.ingetrokken': ['Підтвердження відправника відкликано', 'Bevestiging van afzender ingetrokken'],
  'owner.mail.afzender.bijgewerkt': ['Дані відправника змінено', 'Afzendergegevens gewijzigd'],
  'owner.mail.afzender.vervangen': ['Адресу відправника замінено', 'Afzenderadres vervangen'],
  'owner.mail.afzender.verwijderd': ['Відправника видалено з бази', 'Afzender uit de database verwijderd'],
  'owner.mail.afzender.audit.gestart': ['Почато аудит відправників', 'Controle van afzenders gestart'],
  'owner.mail.afzender.audit.klaar': ['Аудит відправників завершено', 'Controle van afzenders voltooid'],
  'owner.privacy.export': ['Експорт даних користувача', 'Gegevensexport'],
  'owner.profile.photo.updated': ['Змінено фото профілю', 'Profielfoto gewijzigd'],
  'owner.ui.menu.updated': ['Змінено меню', 'Menu gewijzigd'],
  'ai_beleid_aangeboden': ['Запропоновано зміну політики ШІ', 'Wijziging AI-beleid aangeboden'],
  'owner.agent.tool': ['Змінено права інструмента агента', 'Toolrecht van agent gewijzigd'],
  'owner.agent.updated': ['Оновлено агента', 'Agent bijgewerkt'],
  'owner.agent.pairing_code': ['Створено код підключення агента', 'Koppelcode voor agent gemaakt'],
  'owner.api.token.created': ['Створено API-токен', 'API-token aangemaakt'],
  'owner.api.token.revoked': ['Відкликано API-токен', 'API-token ingetrokken'],
  'owner.api.connection.status': ['Змінено статус API-підключення', 'Status API-koppeling gewijzigd'],
  'mcp_console_token_issued': ['Видано токен ШІ-консолі', 'Token voor AI-console uitgegeven'],
  'mcp_console_token_revoked': ['Відкликано токен ШІ-консолі', 'Token voor AI-console ingetrokken'],
  'mcp_archive_requested': ['Замовлено архів', 'Archief aangevraagd'],
  'mcp_archive_download_link': ['Створено посилання на архів', 'Downloadlink archief gemaakt'],
  'mcp_backup_download_link': ['Створено посилання на резервну копію', 'Downloadlink back-up gemaakt'],
  'access.binding.unbind': ['Відв’язано спосіб входу', 'Aanmeldmethode ontkoppeld'],
  'access.method.unbind': ['Відв’язано спосіб входу', 'Aanmeldmethode ontkoppeld'],
  'access.method.restore': ['Відновлено спосіб входу', 'Aanmeldmethode hersteld'],
  'access.phone.save': ['Збережено телефон для входу', 'Telefoon voor aanmelden opgeslagen'],
  'access.totp.replace.start': ['Розпочато заміну TOTP', 'Vervanging TOTP gestart'],
  'access.user.method': ['Змінено спосіб входу користувача', 'Aanmeldmethode van gebruiker gewijzigd'],
  'access.user.reset-password': ['Скинуто пароль користувача', 'Wachtwoord van gebruiker gereset'],
  'admin_access_request_decided': ['Рішення за запитом доступу', 'Besluit over toegangsverzoek'],
  'admin_user_access_changed': ['Змінено доступ користувача', 'Toegang van gebruiker gewijzigd'],
  'admin_user_deleted_recoverably': ['Видалено користувача (можна відновити)', 'Gebruiker verwijderd (herstelbaar)'],
  'admin_user_recovered': ['Відновлено користувача', 'Gebruiker hersteld'],
  'account_created': ['Створено акаунт', 'Account aangemaakt'],
  'account_deleted_recoverably': ['Видалено акаунт (можна відновити)', 'Account verwijderd (herstelbaar)'],
  'account_recovered': ['Відновлено акаунт', 'Account hersteld'],
  'account_retired': ['Акаунт виведено з обігу', 'Account buiten gebruik gesteld'],
  'identity_linked': ['Прив’язано ідентичність', 'Identiteit gekoppeld'],
  'sign_in_refused_blocked': ['Вхід відхилено (акаунт заблоковано)', 'Aanmelding geweigerd (account geblokkeerd)'],
  'owner_role_demoted_stale': ['Знижено застарілу роль власника', 'Verouderde eigenaarsrol verlaagd'],
  'owner.role.demoted-stale': ['Знижено застарілу роль власника', 'Verouderde eigenaarsrol verlaagd'],
  'workspace_shared': ['Надано спільний доступ до простору', 'Werkruimte gedeeld'],
  'workspace_share_link_created': ['Створено посилання для спільного доступу', 'Deellink gemaakt'],
  'workspace_share_link_revoked': ['Відкликано посилання для спільного доступу', 'Deellink ingetrokken'],
  'workspace_share_joined': ['Приєднано за посиланням', 'Via deellink toegetreden'],
  'workspace_member_revoked': ['Вилучено учасника простору', 'Lid uit werkruimte verwijderd'],
  'workspace_member_role_changed': ['Змінено роль учасника простору', 'Rol van lid gewijzigd'],
  'workspace_invite_accepted': ['Прийнято запрошення до простору', 'Uitnodiging voor werkruimte aangenomen'],
  'workspace_invite_inviter_not_allowed': ['Запрошення не активовано: той, хто запросив, уже не може ділитися простором', 'Uitnodiging niet geactiveerd: de uitnodiger mag de werkruimte niet meer delen'],
  'gast_actie': ['Дія гостя', 'Actie van gast'],
  'gast_geweigerd': ['Дію гостя відхилено', 'Actie van gast geweigerd'],
  'gast_sessie_ingetrokken': ['Відкликано гостьову сесію', 'Gastsessie ingetrokken'],
  'toegang_wijziging_ongedaan': ['Скасовано зміну доступу', 'Toegangswijziging ongedaan gemaakt'],
  'owner.step_up.google': ['Підтвердження входу через Google', 'Stap-op bevestigd via Google'],
  'owner.beleid.geweigerd': ['Дію відхилено політикою', 'Actie geweigerd door beleid'],
  'rbac.geweigerd': ['Дію відхилено: недостатньо прав (наприклад, роль «лише перегляд»)', 'Actie geweigerd: onvoldoende rechten (bijv. de rol «alleen bekijken»)'],
  'owner.diagnose.gemeld': ['Надіслано діагностичне повідомлення', 'Diagnosemelding verstuurd'],
  'admin.diagnostiek.uitgevoerd': ['Виконано діагностичну перевірку', 'Diagnostische controle uitgevoerd'],
  'admin.beveiliging.aan': ['Увімкнено захист (passkey, тех. профіль)', 'Bescherming aangezet (passkey, technisch profiel)'],
  'admin.beveiliging.uit': ['Вимкнено захист', 'Bescherming uitgezet'],
  'admin.beveiliging.zekering': ['Захист автоматично вимкнено запобіжником (помилки самого захисту)', 'Bescherming automatisch uitgezet door de zekering (fouten van de bescherming zelf)'],
  'admin.beveiliging.zekering-voorstel': ['Запобіжник пропонує перевірити захист (сплеск помилок, захист не вимкнено)', 'Zekering stelt voor de bescherming te controleren (piek in fouten, bescherming blijft aan)'],
  'admin.beveiliging.geweigerd': ['Спробу змінити захист відхилено', 'Poging om een bescherming te wijzigen geweigerd'],
  'admin.beveiliging.app_rol': ['Запущено створення ролі застосунку для RLS', 'Aanmaken van de app-rol voor RLS gestart'],
  'diag.uitgevoerd': ['Виконано діагностичні перевірки', 'Diagnosecontroles uitgevoerd'],
  'diag.storing': ['Виявлено збій сервісу', 'Storing van een dienst vastgesteld'],
  'diag.hersteld': ['Сервіс знову працює', 'Dienst werkt weer'],
  'diag.gebruiker.bekeken': ['Перевірено стан користувача (скарга)', 'Gebruiker doorgelicht (klacht)'],
  'diag.account.bekeken': ['Переглянуто стан служб акаунта', 'Stand van de accountdiensten bekeken'],
  'diag.account.uitgevoerd': ['Перевірено служби акаунта', 'Accountdiensten gecontroleerd'],
  'diag.account.zelf': ['Користувач перевірив стан своїх служб', 'Gebruiker controleerde de eigen diensten'],
  'owner.admin.user.history.viewed': ['Переглянуто історію користувача', 'Geschiedenis van gebruiker bekeken'],
  'owner.app.geheim': ['Дія із секретом застосунку', 'Actie op appgeheim'],
  'owner.browser.account.logout': ['Вихід з акаунта в цьому браузері', 'Afgemeld in deze browser'],
  'owner.tab.session.revoked.one': ['Завершено сесію', 'Sessie beëindigd'],
  'owner.account-menu.account-forgotten': ['Забуто акаунт у цьому браузері', 'Account vergeten in deze browser'],
  'integration.beleid.aan': ['Інтеграцію відкрито для користувачів', 'Integratie beschikbaar gemaakt voor gebruikers'],
  'integration.beleid.uit': ['Інтеграцію закрито для користувачів', 'Integratie niet meer beschikbaar voor gebruikers'],
  'integration.beleid.geweigerd': ['Відхилено зміну доступності інтеграції', 'Wijziging van beschikbaarheid integratie geweigerd'],
  'integration.merk-eigen.gezet': ['Додано власний логотип сервісу (офіційний файл)', 'Eigen logo van een dienst toegevoegd (officieel bestand)'],
  'integration.merk-eigen.gewist': ['Власний логотип сервісу видалено', 'Eigen logo van een dienst gewist'],
  'integration.merk-eigen.geweigerd': ['Відхилено зміну власного логотипа', 'Wijziging van een eigen logo geweigerd'],
  'owner.ui.merk.gezet': ['Користувач призначив свій логотип сервісу (діє лише для нього)', 'Gebruiker koos een eigen logo voor een dienst (alleen voor hem)'],
  'owner.ui.merk.gewist': ['Користувач прибрав свій логотип — знову системний', 'Gebruiker wiste zijn eigen logo — weer het systeemlogo'],
  'integration.test': ['Перевірено стан інтеграції', 'Status van integratie gecontroleerd'],
  'integration.disconnect': ['Інтеграцію відключено', 'Integratie losgekoppeld'],
  'integration.wizard.test': ['Майстер підключень: перевірено облікові дані у зовнішнього сервісу', 'Koppelwizard: gegevens bij de externe dienst gecontroleerd'],
  'integration.adapter.test': ['Перевірено перехідник зовнішньої служби', 'Adapter van externe dienst getest'],
  'integration.media-generator.opgeslagen': ['Збережено налаштування генератора медіа', 'Instellingen van mediagenerator opgeslagen'],
  'integration.merk-bron.gezet': ['Оновлено джерело офіційного логотипа сервісу', 'Bron van officieel dienstlogo ingesteld'],
  'integration.merk-bron.vernieuwd': ['Оновлено відбиток офіційного логотипа сервісу', 'Officieel dienstlogo vernieuwd'],
  // MELDINGEN-REGISTER-001: повне покриття всіх серверних кодів дій для єдиної бази сповіщень і журналу
  'aanmeld.koppeling': ['Пов’язано спосіб входу з обліковим записом', 'Aanmeldmethode aan account gekoppeld'],
  'aanmeld.ontkoppeling': ['Від’єднано спосіб входу від облікового запису', 'Aanmeldmethode losgekoppeld van account'],
  'aanmeld.zelftest': ['Виконано самоперевірку контуру входу', 'Zelftest van aanmeldcontour uitgevoerd'],
  'aanmelden.fout-symbool': ['Вхід відхилено: обрано хибний контрольний символ', 'Aanmelding geweigerd: verkeerd controlesymbool gekozen'],
  'aanmelden.goedgekeurd': ['Вхід підтверджено на довіреному пристрої', 'Aanmelding bevestigd op vertrouwd apparaat'],
  'aanmelden.niet-ik': ['Тривога входу: власник натиснув «Це не я»', 'Aanmeldalarm: eigenaar koos «Dit ben ik niet»'],
  'aanmelden.passkey': ['Вхід за ключем доступу', 'Aangemeld met toegangssleutel'],
  'aanmelden.passkey-nodig': ['Для входу потрібне підтвердження ключем доступу', 'Bevestiging met toegangssleutel vereist voor aanmelding'],
  'aanmelden.password': ['Вхід за паролем облікового запису', 'Aangemeld met accountwachtwoord'],
  'aanmelden.plaats-nodig': ['Вхід призупинено: потрібне підтвердження нового місця', 'Aanmelding gepauzeerd: bevestiging van nieuwe locatie vereist'],
  'aanmelden.plaatsing': ['Оновлено перевірене місце входу', 'Gecontroleerde aanmeldlocatie bijgewerkt'],
  'access.password.reset-door-beheer': ['Адміністратор скинув пароль облікового запису', 'Wachtwoord van account gereset door beheerder'],
  'access.phone.code': ['Надіслано код підтвердження на телефон', 'Bevestigingscode naar telefoon verzonden'],
  'access.phone.verified': ['Номер телефону підтверджено', 'Telefoonnummer bevestigd'],
  'access.phone.verify': ['Перевірка коду підтвердження телефону', 'Controle van telefoonbevestigingscode'],
  'access.step-up.onthouden': ['Додаткове підтвердження запам’ятовано для цього пристрою', 'Extra bevestiging onthouden voor dit apparaat'],
  'admin_user_deleted': ['Обліковий запис користувача видалено адміністратором', 'Gebruikersaccount verwijderd door beheerder'],
  'agenda.caldav.afgekapt': ['Синхронізацію CalDAV обмежено через надмірний розмір відповіді', 'CalDAV-synchronisatie begrensd wegens te groot antwoord'],
  'agenda.caldav.opgeslagen': ['Збережено подію у зовнішньому календарі CalDAV', 'Afspraak opgeslagen in externe CalDAV-agenda'],
  'agenda.caldav.verwijderd': ['Видалено подію із зовнішнього календаря CalDAV', 'Afspraak verwijderd uit externe CalDAV-agenda'],
  'agenda.extern.status_ongeldig': ['Зовнішній календар повернув неочікуваний стан', 'Externe agenda gaf een ongeldige status terug'],
  'agenda.ics.geexporteerd': ['Вивантажено файл події календаря (ICS)', 'Agendabestand (ICS) uitgevoerd'],
  'agenda.tempo.geweigerd': ['Занадто часті запити до календаря призупинено', 'Te frequente agendaverzoeken tijdelijk begrensd'],
  'apparaat.gedeblokkeerd': ['Знято блокування пристрою після перевірки власником', 'Blokkering van apparaat opgeheven na controle door eigenaar'],
  'beveiliging.json-vereist': ['Запит відхилено захистом формату даних (очікувався JSON)', 'Verzoek geweigerd door formaatbeveiliging (JSON vereist)'],
  'bevestigen.aangevraagd': ['Надіслано запит на підтвердження чутливої дії', 'Bevestiging voor gevoelige handeling aangevraagd'],
  'bevestigen.code': ['Введено код підтвердження дії', 'Bevestigingscode voor handeling ingevoerd'],
  'bevestigen.fout-symbool': ['Підтвердження дії відхилено: обрано хибний символ', 'Actiebevestiging geweigerd: onjuist symbool gekozen'],
  'bevestigen.niet-ik': ['Тривога безпеки: чужу спробу дії заблоковано кнопкою «Це не я»', 'Beveiligingsalarm: poging geblokkeerd via «Dit ben ik niet»'],
  'bevestigen.telegram': ['Чутливу дію підтверджено через Telegram', 'Gevoelige handeling bevestigd via Telegram'],
  'cloud.automatisering.aangemaakt': ['Створено правило автоматичного впорядкування файлів у сховищі', 'Automatiseringsregel voor bestanden in opslag aangemaakt'],
  'cloud.automatisering.uitgevoerd': ['Виконано правило автоматичного впорядкування файлів у сховищі', 'Automatiseringsregel voor bestanden in opslag uitgevoerd'],
  'cloud.automatisering.verwijderd': ['Видалено правило автоматичного впорядкування файлів у сховищі', 'Automatiseringsregel voor bestanden uit opslag verwijderd'],
  'cloud.google-drive.account.selected': ['Обрано обліковий запис Google Диску для сховища', 'Google Drive-account gekozen voor opslag'],
  'cloud.google-drive.disconnected': ['Google Диск від’єднано від сховища', 'Google Drive losgekoppeld van opslag'],
  'cloud.google-suite.consent.completed': ['Надано дозвіл доступу до служб Google', 'Toestemming voor Google-diensten voltooid'],
  'cloud.google-suite.consent.started': ['Розпочато підключення служб Google', 'Koppeling van Google-diensten gestart'],
  'cloud.google-suite.legacy-refresh-copies.removed': ['Очищено застарілі дублікати маркерів оновлення Google', 'Verouderde kopieën van Google-vernieuwingstokens verwijderd'],
  'cloud.webdav.gekoppeld': ['Підключено зовнішнє хмарне сховище за захищеним протоколом', 'Externe cloudopslag via beveiligd protocol gekoppeld'],
  'cloud.webdav.ontkoppeld': ['Від’єднано зовнішнє хмарне сховище', 'Externe cloudopslag losgekoppeld'],
  'code.alarm': ['Спрацювало попередження безпеки для персонального коду', 'Beveiligingswaarschuwing voor persoonlijke code geactiveerd'],
  'code.hersteld': ['Персональний код безпеки відновлено', 'Persoonlijke beveiligingscode hersteld'],
  'code.in-chat': ['Виявлено спробу передати код у відкритій бесіді — захист спрацював', 'Poging om code in chat te delen gedetecteerd — bescherming actief'],
  'code.ingesteld': ['Встановлено персональний код підтвердження', 'Persoonlijke bevestigingscode ingesteld'],
  'code.pauze': ['Дію персонального коду тимчасово призупинено', 'Persoonlijke code tijdelijk gepauzeerd'],
  'code.uitgeschakeld': ['Персональний код підтвердження вимкнено', 'Persoonlijke bevestigingscode uitgeschakeld'],
  'code.verwijderd': ['Персональний код підтвердження видалено', 'Persoonlijke bevestigingscode verwijderd'],
  'eigenaar_besluit_gestart': ['Розпочато підписання рішення власника ключем доступу', 'Ondertekening van eigenaarsbesluit met toegangssleutel gestart'],
  'eigenaar_besluit_geweigerd': ['Підписання рішення власника відхилено', 'Ondertekening van eigenaarsbesluit geweigerd'],
  'eigenaar_besluit_mislukt': ['Не вдалося перевірити підпис рішення власника', 'Controle van eigenaarsbesluit mislukt'],
  'eigenaar_besluit_ondertekend': ['Рішення власника успішно підписано ключем доступу', 'Eigenaarsbesluit ondertekend met toegangssleutel'],
  'email_conflict_signin': ['Вхід зупинено через збіг електронної адреси з іншим обліковим записом', 'Aanmelding gestopt wegens e-mailconflict met ander account'],
  'fout-symbool': ['Відхилено підтвердження пристрою: хибний символ на екрані', 'Apparaatbevestiging geweigerd: onjuist symbool'],
  'huis.opdracht': ['Виконано команду керування розумною оселею', 'Opdracht voor slimme woning uitgevoerd'],
  'huis.vertrouwd-toestel.toegevoegd': ['Додано довірений пристрій розумної оселі', 'Vertrouwd toestel voor slimme woning toegevoegd'],
  'huis.vertrouwd-toestel.verwijderd': ['Прибрано довірений пристрій розумної оселі', 'Vertrouwd toestel voor slimme woning verwijderd'],
  'inlog.plaats': ['Перевірено географічне місце входу', 'Aanmeldlocatie gecontroleerd'],
  'klimop_architectuur_toets': ['Екосистема «Плющ»: виконано 15-пунктову архітектурну перевірку', 'Ecosysteem «Klimop»: 15-punts architectuurcontrole uitgevoerd'],
  'klimop_dubbel_logboek': ['Екосистема «Плющ»: переглянуто журнал подвійного запису', 'Ecosysteem «Klimop»: logboek van dubbel schrijven geraadpleegd'],
  'klimop_dubbel_schrijven': ['Екосистема «Плющ»: виконано перевірку подвійного запису', 'Ecosysteem «Klimop»: proef met dubbel schrijven uitgevoerd'],
  'klimop_overdracht_schakelaar': ['Екосистема «Плющ»: перемкнуто сходинку безпечного перенесення', 'Ecosysteem «Klimop»: trede van veilige overdracht geschakeld'],
  'klimop_overzicht': ['Екосистема «Плющ»: переглянуто зведений стан вузлів', 'Ecosysteem «Klimop»: knooppuntoverzicht geraadpleegd'],
  'klimop_passieve_spiegel': ['Екосистема «Плющ»: оновлено стан пасивного дзеркала', 'Ecosysteem «Klimop»: status van passieve spiegel bijgewerkt'],
  'klimop_quorum_attest': ['Екосистема «Плющ»: сформовано кворумне засвідчення стану', 'Ecosysteem «Klimop»: quorum-attestatie opgesteld'],
  'klimop_quorum_logboek': ['Екосистема «Плющ»: переглянуто журнал кворуму', 'Ecosysteem «Klimop»: quorumlogboek geraadpleegd'],
  'klimop_spiegel_controle': ['Екосистема «Плющ»: звірено цілісність пасивного дзеркала', 'Ecosysteem «Klimop»: integriteit van passieve spiegel gecontroleerd'],
  'klimop_spiegel_logboek': ['Екосистема «Плющ»: переглянуто журнал дзеркала', 'Ecosysteem «Klimop»: spiegellogboek geraadpleegd'],
  'koppelen.klaar': ['Telegram успішно прив’язано до облікового запису', 'Telegram gekoppeld aan het account'],
  'koppelen.start': ['Розпочато прив’язку Telegram до облікового запису', 'Koppeling van Telegram aan account gestart'],
  'koppeling.aangepast': ['Змінено параметри прив’язки Telegram', 'Telegram-koppelingsinstellingen aangepast'],
  'koppeling_gewijzigd': ['Змінено прив’язку навичок між агентами ШІ', 'Vaardigheidskoppeling voor AI-agenten gewijzigd'],
  'mail.google.account.disconnected': ['Поштову скриньку Gmail від’єднано', 'Gmail-postvak losgekoppeld'],
  'mail.google.account.selected': ['Обрано основну скриньку Gmail', 'Hoofdpostvak van Gmail geselecteerd'],
  'mail.google.service-grant-projection.repaired': ['Відновлено узгодженість дозволів поштової скриньки Gmail', 'Toestemmingsprojectie van Gmail-postvak hersteld'],
  'matrix.gewijzigd': ['Оновлено матрицю вимог підтвердження входу', 'Matrix van aanmeldvereisten bijgewerkt'],
  'mcp_console_legacy_imported': ['Перенесено попередні ключі доступу консолі MCP', 'Eerdere MCP-consolesleutels overgezet'],
  'niet-ik': ['Тривога пристрою: невідому спробу відхилено кнопкою «Це не я»', 'Apparaatalarm: onbekende poging afgewezen met «Dit ben ik niet»'],
  'notitie.aangemaakt': ['Створено нову нотатку', 'Nieuwe notitie aangemaakt'],
  'notitie.agenda.afspraak_gemaakt': ['Створено подію календаря з нотатки за підтвердженням', 'Agenda-afspraak vanuit notitie na bevestiging aangemaakt'],
  'notitie.agenda.gekoppeld': ['Пов’язано нотатку з подією календаря', 'Notitie gekoppeld aan agenda-afspraak'],
  'notitie.agenda.ontkoppeld': ['Від’єднано нотатку від події календаря', 'Notitie losgekoppeld van agenda-afspraak'],
  'notitie.import': ['Імпортовано набір нотаток', 'Notities geïmporteerd'],
  'notitie.taak.aangemaakt': ['Створено завдання простору з нотатки', 'Ruimtetaak vanuit notitie aangemaakt'],
  'notitie.zoeken.te_zwaar': ['Пошуковий запит у нотатках обмежено через надмірну складність', 'Zoekopdracht in notities begrensd wegens omvang'],
  'orch_inlevering': ['Координація ШІ: прийнято передачу роботи агента в чергу', 'AI-coördinatie: werkoverdracht van agent in wachtrij geplaatst'],
  'orch_inlevering_begonnen': ['Координація ШІ: розпочато перевірку передачі агента', 'AI-coördinatie: controle van werkoverdracht gestart'],
  'orch_regels_toegepast': ['Координація ШІ: застосовано оновлені правила агентів', 'AI-coördinatie: bijgewerkte agentregels toegepast'],
  'orch_regels_toepassen_geweigerd': ['Координація ШІ: відхилено застосування правил без підтвердження власника', 'AI-coördinatie: toepassen van regels zonder bevestiging geweigerd'],
  'orch_regels_voorstel': ['Координація ШІ: перевірено пропозицію зміни правил агентів', 'AI-coördinatie: regelvoorstel gecontroleerd'],
  'orch_taak_gestart': ['Координація ШІ: зареєстровано нове завдання агента', 'AI-coördinatie: nieuwe agenttaak geregistreerd'],
  'owner.agent.chat': ['Повідомлення у бесіді з підключеним агентом ШІ', 'Bericht in gesprek met gekoppelde AI-agent'],
  'owner.agent.grant.termijn': ['Змінено строк дії дозволу агента ШІ', 'Geldigheidsduur van AI-agenttoestemming gewijzigd'],
  'owner.ai.dienst_motor.bewaar': ['Збережено налаштування спільного рушія ШІ', 'Instellingen van gedeelde AI-motor opgeslagen'],
  'owner.ai.dienst_motor.test': ['Перевірено з’єднання зі спільним рушієм ШІ', 'Verbinding met gedeelde AI-motor getest'],
  'owner.ai.dienst_motor.verwijder': ['Видалено спільний рушій ШІ', 'Gedeelde AI-motor verwijderd'],
  'owner.ai.dienst_motor.zet': ['Обрано активний рушій ШІ для служби', 'Actieve AI-motor voor dienst ingesteld'],
  'owner.ai.ecosysteem.context.opslaan': ['Збережено спільний контекст середовища ШІ', 'Gedeelde context van AI-ecosysteem opgeslagen'],
  'owner.ai.ecosysteem.overdracht.aanmaken': ['Створено картку передачі контексту між агентами ШІ', 'Contextoverdracht tussen AI-agenten aangemaakt'],
  'owner.ai.ecosysteem.uitbreiding.opslaan': ['Оновлено модуль розширення середовища ШІ', 'Uitbreidingsmodule van AI-ecosysteem opgeslagen'],
  'owner.ai.ecosysteem.werkruimte.opslaan': ['Збережено робочий простір ШІ', 'AI-werkruimte opgeslagen'],
  'owner.ai.ecosysteem.werkruimte.verwijderen': ['Видалено робочий простір ШІ', 'AI-werkruimte verwijderd'],
  'owner.ai.geheugen.bots.bezorgen': ['Доставлено доручення до бота пам’яті ШІ', 'Opdracht afgeleverd bij AI-geheugenbot'],
  'owner.ai.geheugen.bots.gesprek_invoeren': ['Додано запис розмови до пам’яті ШІ', 'Gesprek ingevoerd in AI-geheugen'],
  'owner.ai.geheugen.bots.opnieuw': ['Повторно запущено обробку у боті пам’яті ШІ', 'Verwerking van AI-geheugenbot herstart'],
  'owner.ai.geheugen.bots.opslaan': ['Збережено налаштування бота пам’яті ШІ', 'Instellingen van AI-geheugenbot opgeslagen'],
  'owner.ai.geheugen.bots.status': ['Оновлено стан бота пам’яті ШІ', 'Status van AI-geheugenbot bijgewerkt'],
  'owner.ai.geheugen.bots.testen': ['Виконано перевірку бота пам’яті ШІ', 'AI-geheugenbot getest'],
  'owner.ai.geheugen.bots.verwijderen': ['Видалено бота пам’яті ШІ', 'AI-geheugenbot verwijderd'],
  'owner.ai.geheugen.opslaan': ['Збережено вузол довготривалої пам’яті ШІ', 'Onderdeel van AI-geheugen opgeslagen'],
  'owner.ai.geheugen.relatie': ['Оновлено зв’язок між записами пам’яті ШІ', 'Koppeling in AI-geheugen bijgewerkt'],
  'owner.ai.geheugen.status': ['Змінено стан запису пам’яті ШІ', 'Status van AI-geheugenitem gewijzigd'],
  'owner.ai.geheugen.taken.opslaan': ['Збережено завдання у пам’яті агентів ШІ', 'Taak in AI-agentgeheugen opgeslagen'],
  'owner.ai.geheugen.taken.overdragen': ['Передано завдання іншому агентові ШІ', 'Taak overgedragen aan andere AI-agent'],
  'owner.ai.geheugen.taken.stap': ['Зафіксовано крок виконання завдання ШІ', 'Uitvoeringsstap van AI-taak vastgelegd'],
  'owner.ai.werkruimte.chat': ['Надіслано запит у робочому просторі ШІ', 'Bericht in AI-werkruimte verzonden'],
  'owner.apparaat.bevestigd': ['Новий пристрій підтверджено власником', 'Nieuw apparaat bevestigd door eigenaar'],
  'owner.apparaat.melding': ['Надіслано сповіщення про вхід із нового пристрою', 'Melding over aanmelding vanaf nieuw apparaat verzonden'],
  'owner.apparaat.nieuw': ['Виявлено вхід із нового незнайомого пристрою', 'Aanmelding vanaf nieuw onbekend apparaat gedetecteerd'],
  'owner.apparaat.vergeten': ['Пристрій вилучено зі списку довірених', 'Apparaat verwijderd uit vertrouwde lijst'],
  'owner.browser.enabled': ['Надано дозвіл ШІ працювати з вкладкою оглядача', 'AI-toegang tot browsertabblad ingeschakeld'],
  'owner.connector.v2.tech_actief': ['Перемкнуто дозвіл з’єднувача ШІ для технічного простору', 'Connectorrecht voor technische ruimte gewijzigd'],
  'owner.connector.v2.toegepast': ['Застосовано шаблон прав з’єднувача ШІ', 'Rechtensjabloon op AI-connector toegepast'],
  'owner.diagnose.melden_begrensd': ['Обмежено потік повторюваних діагностичних звернень', 'Herhaalde diagnosemeldingen begrensd'],
  'owner.extensie.beheer.bekeken': ['Переглянуто стан розширення оглядача в адмініструванні', 'Status van browserextensie bekeken in beheer'],
  'owner.extensie.beheer.geweigerd': ['Відхилено адміністративну дію для розширення оглядача', 'Beheeractie voor browserextensie geweigerd'],
  'owner.extensie.beheer.ingetrokken': ['Адміністратор закрив сеанс розширення оглядача', 'Sessie van browserextensie ingetrokken door beheerder'],
  'owner.extensie.beleid': ['Оновлено політику безпеки розширення оглядача', 'Beveiligingsbeleid van browserextensie bijgewerkt'],
  'owner.extensie.caps-herzien': ['Звужено перелік дозволів розширення оглядача', 'Machtigingen van browserextensie ingeperkt'],
  'owner.extensie.geweigerd': ['Розширенню оглядача відмовлено в доступі', 'Toegang voor browserextensie geweigerd'],
  'owner.extensie.ingetrokken': ['Доступ розширення оглядача відкликано', 'Toegang van browserextensie ingetrokken'],
  'owner.extensie.ontgrendeld': ['Розширення оглядача розблоковано ключем власника', 'Browserextensie ontgrendeld door eigenaar'],
  'owner.extensie.verlengd': ['Подовжено час роботи розширення оглядача', 'Sessie van browserextensie verlengd'],
  'owner.extensie.vernieuwd': ['Оновлено маркер сеансу розширення оглядача', 'Sessietoken van browserextensie vernieuwd'],
  'owner.extensie.vernieuwing-geblokkeerd': ['Поновлення сеансу розширення оглядача заблоковано', 'Vernieuwing van browserextensiesessie geblokkeerd'],
  'owner.flags.archief': ['Прапорець можливості перенесено до архіву', 'Functievlag gearchiveerd'],
  'owner.flags.stand': ['Змінено стан прапорця можливості', 'Stand van functievlag gewijzigd'],
  'owner.github.app.verbinden': ['Підключено застосунок GitHub до простору', 'GitHub-toepassing gekoppeld aan werkruimte'],
  'owner.github.eenklik.callback': ['Завершено швидке підключення сховища GitHub', 'Snelle GitHub-koppeling voltooid'],
  'owner.github.eenklik.start': ['Розпочато швидке підключення сховища GitHub', 'Snelle GitHub-koppeling gestart'],
  'owner.github.oauth.callback': ['Підтверджено вхід і доступ до GitHub (OAuth)', 'GitHub-toegang bevestigd (OAuth)'],
  'owner.github.oauth.start': ['Розпочато авторизацію GitHub (OAuth)', 'GitHub-autorisatie gestart (OAuth)'],
  'owner.github.oauth.vernieuwen': ['Оновлено маркер доступу GitHub', 'GitHub-toegangstoken vernieuwd'],
  'owner.github.ontkoppelen': ['Сховище GitHub від’єднано від простору', 'GitHub losgekoppeld van werkruimte'],
  'owner.github.webhook.uitgeschakeld': ['Вхідні сповіщення подій GitHub вимкнено', 'GitHub-webhook uitgeschakeld'],
  'owner.mail.ai_vertaling.dienst_akkoord': ['Оновлено згоду на використання рушія перекладу в пошті', 'Toestemming voor vertaalmotor in e-mail bijgewerkt'],
  'owner.mail.ai_vertaling.settings': ['Змінено налаштування перекладу та ШІ у пошті', 'Instellingen voor AI-vertaling in e-mail gewijzigd'],
  'owner.mail.compose.cancelled': ['Скасовано відкладене надсилання листа', 'Geplande verzending van e-mail geannuleerd'],
  'owner.mail.compose.scheduled': ['Заплановано відкладене надсилання листа', 'Verzending van e-mail ingepland'],
  'owner.mail.compose.send': ['Лист успішно надіслано зі скриньки', 'E-mail verzonden vanuit postvak'],
  'owner.mcp.deur.binding': ['Прив’язано вхідний шлюз MCP до облікового запису', 'MCP-toegangsdeur gekoppeld aan account'],
  'owner.mcp.deur.token': ['Випущено маркер доступу для шлюзу MCP', 'Toegangstoken voor MCP-deur uitgegeven'],
  'owner.mcp.grant.binding': ['Прив’язано дозвіл з’єднувача MCP до простору', 'MCP-toestemming gekoppeld aan ruimte'],
  'owner.mcp.grant.expired': ['Строк дії дозволу з’єднувача MCP завершився', 'MCP-toestemming verlopen'],
  'owner.mcp.toegang.geblokkeerd': ['Запит агента через MCP зупинено правилами доступу', 'MCP-verzoek van agent geblokkeerd door toegangsregels'],
  'owner.mcp.tools.list': ['Агент ШІ отримав перелік дозволених інструментів MCP', 'AI-agent vroeg lijst met toegestane MCP-hulpmiddelen op'],
  'owner.meldingen.ecosysteem.actie': ['Оновлено стан картки у Пульті сповіщень', 'Kaartstatus bijgewerkt in meldingenpaneel'],
  'owner.meldingen.ecosysteem.aflevering_overzicht': ['Переглянуто звіт доставки й прочитання сповіщень у панелі', 'Aflever- en leesoverzicht van meldingen bekeken'],
  'owner.meldingen.ecosysteem.ontvangst': ['Зафіксовано квитанцію доставки або перегляду сповіщення', 'Aflever- of leesbevestiging van melding vastgelegd'],
  'owner.meldingen.ecosysteem.profiel': ['Збережено вподобання вигляду Пульта сповіщень', 'Weergavevoorkeuren van meldingenpaneel opgeslagen'],
  'owner.remote.tunnel.geweigerd': ['Тунель віддаленого доступу відхилено захистом', 'Tunnel voor externe toegang geweigerd'],
  'owner.rol.hersteld': ['Відновлено основну роль власника простору', 'Rol van eigenaar hersteld'],
  'owner.session.handoff.redeemed': ['Сеанс безпечно передано між службами простору', 'Sessie veilig overgedragen tussen diensten'],
  'owner.session.handoff.reused': ['Відхилено повторне використання одноразового квитка переходу', 'Hergebruik van eenmalig sessieticket geweigerd'],
  'owner.session.handoff.unbound': ['Відхилено квиток переходу через невідповідність сеансу', 'Sessieticket geweigerd wegens afwijkende sessiebinding'],
  'owner.tech.gedeeld': ['Увімкнено спільний технічний режим між вкладками', 'Gedeelde technische modus tussen tabbladen aangezet'],
  'owner.tech.geerfd': ['Нова вкладка успадкувала активний технічний простір', 'Nieuw tabblad erfde de actieve technische ruimte'],
  'owner.tech.ruimte.ai': ['Надано тимчасовий мандат ШІ в технічному просторі', 'Tijdelijk AI-mandaat in technische ruimte verleend'],
  'owner.tech.ruimte.ai.ingetrokken': ['Відкликано мандат ШІ в технічному просторі', 'AI-mandaat in technische ruimte ingetrokken'],
  'owner.tech.ruimte.beeindigd': ['Сеанс технічного простору завершено', 'Sessie in technische ruimte beëindigd'],
  'owner.tech.ruimte.gestart': ['Розпочато захищений сеанс технічного простору', 'Beveiligde sessie in technische ruimte gestart'],
  'owner.tech.ruimte.pauze': ['Сеанс технічного простору поставлено на паузу', 'Sessie in technische ruimte gepauzeerd'],
  'owner.tech.ruimte.verlengd': ['Подовжено тривалість сеансу технічного простору', 'Duur van technische sessie verlengd'],
  'owner.tech.ruimte.weergave': ['Оновлено налаштування смуги технічного простору', 'Weergave van technische ruimtebalk aangepast'],
  'owner.tech.schaduw.verschil': ['Тіньова звірка виявила розбіжність між просторами', 'Schaduwcontrole meldde een verschil tussen ruimtes'],
  'owner.tech.snelkoppelingen': ['Оновлено швидкі переходи технічної смуги', 'Snelkoppelingen van technische balk bijgewerkt'],
  'owner.terminal.geweigerd': ['Доступ до вебтермінала відхилено правилами безпеки', 'Toegang tot webterminal geweigerd'],
  'owner.terminal.instelling': ['Змінено налаштування захищеного термінала', 'Instellingen van beveiligde terminal gewijzigd'],
  'owner.terminal.opdracht': ['Виконано команду в захищеному терміналі', 'Opdracht uitgevoerd in beveiligde terminal'],
  'owner.terminal.opdrachten.bekeken': ['Переглянуто журнал команд термінала', 'Opdrachtenlogboek van terminal bekeken'],
  'owner.uitrol.bron.ingesteld': ['Змінено довірене джерело пакунків оновлення', 'Vertrouwde bron voor uitrolpakketten ingesteld'],
  'owner.uitrol.github.ontvangen': ['Отримано пакунок випуску з GitHub Releases', 'Uitgavepakket ontvangen uit GitHub Releases'],
  'owner.uitrol.github.ontvangst.instellingen': ['Оновлено параметри приймання випусків із GitHub', 'Ontvangstinstellingen voor GitHub-releases bijgewerkt'],
  'owner.uitrol.telegram.gearchiveerd': ['Архівовано вхідний пакунок оновлення з Telegram', 'Ontvangen uitrolpakket uit Telegram gearchiveerd'],
  'owner.uitrol.telegram.gepubliceerd': ['Опубліковано двомовне пояснення випуску в Telegram', 'Tweetalige uitleg van de uitgave in Telegram gepubliceerd'],
  'owner.uitrol.telegram.hersteld': ['Відновлено пакунок оновлення з архіву Telegram', 'Uitrolpakket uit Telegram-archief hersteld'],
  'owner.uitrol.telegram.instellingen': ['Змінено налаштування приймання пакунків через Telegram', 'Telegram-ontvangstinstellingen voor uitrol gewijzigd'],
  'owner.uitrol.telegram.mislukt': ['Не вдалося прийняти пакунок оновлення через Telegram', 'Ontvangst van uitrolpakket via Telegram mislukt'],
  'owner.uitrol.telegram.test': ['Виконано перевірку каналу оновлень у Telegram', 'Telegram-uitrolkanaal getest'],
  'owner.uitrol.telegram.webhook': ['Оброблено вхідне повідомлення бота оновлень Telegram', 'Inkomend bericht van Telegram-uitrolbot verwerkt'],
  'owner.vaardigheden.herstellen': ['Відновлено початковий стан навички ШІ', 'Standaardversie van AI-vaardigheid hersteld'],
  'owner.vaardigheden.importeren': ['Імпортовано нову навичку для агентів ШІ', 'Nieuwe AI-vaardigheid geïmporteerd'],
  'owner.vaardigheden.koppelen': ['Прив’язано навичку до вибраних агентів ШІ', 'Vaardigheid gekoppeld aan geselecteerde AI-agenten'],
  'owner.vaardigheden.opslaan': ['Збережено навичку в каталозі ШІ', 'AI-vaardigheid opgeslagen in catalogus'],
  'owner.vaardigheden.verwijderen': ['Видалено власну навичку ШІ', 'Aangepaste AI-vaardigheid verwijderd'],
  'owner_role_restored': ['Відновлено права власника системи', 'Eigenaarsrechten hersteld'],
  'owner_sign_in_refused_identity_mismatch': ['Вхід відхилено: обліковий запис провайдера не збігається з власником', 'Aanmelding geweigerd: identiteit komt niet overeen met eigenaar'],
  'plaats-eis.gewijzigd': ['Змінено вимогу перевірки місця під час входу', 'Locatievereiste voor aanmelding gewijzigd'],
  'telegram.rechtstreeks-bevestigen': ['Змінено дозвіл прямого підтвердження входу в боті Telegram', 'Toestemming voor rechtstreekse aanmeldbevestiging in Telegram-bot gewijzigd'],
  'privacy.afronden_mislukt': ['Не вдалося завершити операцію центру приватності', 'Afronden van privacybewerking mislukt'],
  'service_handoff_created': ['Підготовлено захищений перехід між піддоменами', 'Beveiligde overgang tussen subdomeinen voorbereid'],
  'sessie.ingetrokken.bot': ['Сеанс негайно закрито власником через бота безпеки Telegram', 'Sessie direct ingetrokken via Telegram-beveiligingsbot'],
  'sleutelkluis.apparaat_onthouden': ['Сховище ключів: цей пристрій додано до запам’ятованих', 'Sleutelkluis: dit apparaat onthouden'],
  'sleutelkluis.apparaat_vergeten': ['Сховище ключів: пристрій вилучено із запам’ятованих', 'Sleutelkluis: onthouden apparaat verwijderd'],
  'sleutelkluis.herstelcode_bevestigd': ['Сховище ключів: резервний код відновлення підтверджено', 'Sleutelkluis: herstelcode bevestigd'],
  'sleutelkluis.herstelcode_vernieuwd': ['Сховище ключів: створено новий резервний код відновлення', 'Sleutelkluis: herstelcode vernieuwd'],
  'sleutelkluis.herversleuteld': ['Сховище ключів: дані перешифровано новим головним ключем', 'Sleutelkluis: inhoud opnieuw versleuteld met nieuwe sleutel'],
  'sleutelkluis.ingeschakeld': ['Сховище ключів активовано та захищено шифруванням', 'Sleutelkluis ingeschakeld en versleuteld'],
  'sleutelkluis.ontgrendeld': ['Сховище ключів розблоковано для поточного сеансу', 'Sleutelkluis ontgrendeld voor huidige sessie'],
  'sleutelkluis.passkey_aanmelden_omslag': ['Сховище ключів: додано обгортку розблокування ключем входу', 'Sleutelkluis: ontgrendeling met aanmeldsleutel gekoppeld'],
  'sleutelkluis.passkey_gekoppeld': ['Сховище ключів: прив’язано апаратний ключ доступу', 'Sleutelkluis: toegangssleutel gekoppeld'],
  'sleutelkluis.te_vaak': ['Сховище ключів тимчасово затримало спроби через перевищення ліміту', 'Sleutelkluis vertraagde pogingen wegens te veel aanvragen'],
  'sleutelkluis.wachtwoord_omslag': ['Сховище ключів: оновлено захисну обгортку пароля', 'Sleutelkluis: wachtwoordomslag bijgewerkt'],
  'sleutelkluis.wachtwoord_opent': ['Сховище ключів відкрито за допомогою пароля власника', 'Sleutelkluis geopend met wachtwoord'],
  'sleutelkluis.zonder_omslag_hersteld': ['Сховище ключів відновлено за резервним кодом', 'Sleutelkluis hersteld met herstelcode'],
  'stap-op': ['Виконано додаткове підтвердження особи для чутливої дії', 'Extra identiteitsbevestiging (stap-op) voltooid'],
  'telegram-sterk': ['Підтверджено посилену перевірку входу через Telegram', 'Sterke aanmeldcontrole via Telegram bevestigd'],
  'telegram.foto-gewijzigd': ['Оновлено світлину профілю з підключеного Telegram', 'Profielfoto bijgewerkt vanuit gekoppelde Telegram'],
  'uitrol.release.selectief_aangevraagd': ['Створено запит на вибіркове повернення окремого випуску', 'Selectief terugdraaien van specifieke uitgave aangevraagd'],
  'uitrol.sleutel.aangemaakt': ['Створено новий персональний ключ підпису оновлень', 'Nieuwe ondertekeningssleutel voor uitrol aangemaakt'],
  'uitrol.sleutel.geroteerd': ['Виконано планову заміну ключа підпису оновлень', 'Ondertekeningssleutel voor uitrol geroteerd'],
  'uitrol.sleutel.gesynchroniseerd': ['Узгоджено перелік ключів підпису зі службою встановлення', 'Uitrolsleutels gesynchroniseerd met installatiedienst'],
  'uitrol.sleutel.ingetrokken': ['Ключ підпису оновлень відкликано', 'Ondertekeningssleutel voor uitrol ingetrokken'],
  'uitrol_migratieproef': ['Виконано пробний прогін міграцій бази даних перед оновленням', 'Migratieproef van database vóór uitrol uitgevoerd'],
  'uitrol_migratieproef_aangevraagd': ['Запущено перевірку міграцій бази даних для пакунка', 'Migratieproef voor uitrolpakket aangevraagd'],
  'uitrol_stroom_bewijs_verzameld': ['Зібрано контрольні докази у потоці розгортання', 'Bewijsstukken verzameld in uitrolstroom'],
  'uitrol_stroom_controle_status': ['Оновлено стан пункту перевірки розгортання', 'Controlestatus in uitrolstroom bijgewerkt'],
  'uitrol_stroom_controle_toegevoegd': ['Додано пункт перевірки до списку розгортання', 'Controlepunt toegevoegd aan uitrolstroom'],
  'uitrol_stroom_controle_verwijderd': ['Прибрано пункт перевірки зі списку розгортання', 'Controlepunt verwijderd uit uitrolstroom'],
  'uitrol_stroom_notitie_aangemaakt': ['Додано примітку інженера до потоку розгортання', 'Notitie toegevoegd aan uitrolstroom'],
  'uitrol_stroom_notitie_bijgewerkt': ['Оновлено примітку у потоці розгортання', 'Notitie in uitrolstroom bijgewerkt'],
  'uitrol_stroom_notitie_verwijderd': ['Видалено примітку з потоку розгортання', 'Notitie verwijderd uit uitrolstroom'],
  'uitrol_stroom_rapport_geexporteerd': ['Експортовано підсумковий звіт розгортання', 'Eindrapport van uitrol geëxporteerd'],
  'uitrol_vereisten_gecontroleerd': ['Перевірено готовність середовища сервера до оновлення', 'Serververeisten voor uitrol gecontroleerd'],
  'venster.geopend': ['Відкрито захищене вікно підтвердження входу через Telegram', 'Beveiligd Telegram-aanmeldvenster geopend'],
  'widget.andere-browser': ['Виявлено спробу використати квиток Telegram з іншого оглядача', 'Telegram-aanmelding vanuit andere browser geweigerd'],
  'widget.handtekening': ['Перевірено криптографічний підпис входу через Telegram', 'Cryptografische handtekening van Telegram-aanmelding gecontroleerd'],
  'wijziging.gezien': ['Переглянуто запит на зміну налаштувань безпеки', 'Wijzigingsverzoek voor beveiliging bekeken'],
  'wijziging.verlopen': ['Строк очікування підтвердження зміни минув', 'Bevestigingstermijn voor wijziging verlopen'],
  'workspace_share_rate_limited': ['Тимчасово обмежено занадто часті запрошення до спільного простору', 'Uitnodigingen voor gedeelde ruimte tijdelijk begrensd'],
  'zoek.index.starten': ['Запущено оновлення пошукового покажчика', 'Opbouw van zoekindex gestart'],
  'zoek.index.stoppen': ['Зупинено фонову побудову пошукового покажчика', 'Opbouw van zoekindex gestopt'],
  'owner.meldingen.bijlage.telegram': ['Надіслано картку вкладення у Telegram', 'Bijlagekaart naar Telegram verzonden'],
  'owner.klantrelatie.klant': ['Створено досьє клієнта', 'Klantdossier aangemaakt'],
  'owner.klantrelatie.aanvraag': ['Зафіксовано нове звернення клієнта', 'Nieuwe klantaanvraag vastgelegd'],
  'owner.klantrelatie.wijzig': ['Оновлено досьє клієнта', 'Klantdossier bijgewerkt'],
  'owner.klantrelatie.wissen': ['Видалено досьє клієнта', 'Klantdossier verwijderd'],
  'owner.klantrelatie.kans': ['Створено угоду в клієнтських взаєминах', 'Verkoopkans aangemaakt'],
  'owner.klantrelatie.fase': ['Змінено етап угоди з клієнтом', 'Fase van verkoopkans gewijzigd'],
  'owner.klantrelatie.contact': ['Записано взаємодію з клієнтом', 'Contactmoment vastgelegd'],
  'owner.klantrelatie.taak': ['Додано завдання щодо клієнта', 'Vervolgtaak voor klant toegevoegd'],
  'owner.klantrelatie.afronden': ['Завершено завдання щодо клієнта', 'Vervolgtaak voor klant afgerond'],
  'owner.klantrelatie.afspraak': ['Заплановано зустріч із клієнтом у календарі', 'Afspraak met klant ingepland in agenda'],
  'owner.klantrelatie.hulp': ['Підготовлено чернетку за досьє клієнта', 'Tekstvoorstel voor klantdossier voorbereid'],
  'integration.adapter.bewaard': ['Збережено зашифроване підключення перехідника зовнішньої служби', 'Versleutelde adapterkoppeling van externe dienst opgeslagen'],
  'owner.cloud.verbinding.gecontroleerd': ['Перевірено стан хмарного підключення у Центрі підключень', 'Status van cloudkoppeling gecontroleerd in Verbindingencentrum'],
  'owner.cloud.verbinding.ontkoppeld': ['Від’єднано хмарне підключення у Центрі підключень', 'Cloudkoppeling losgekoppeld in Verbindingencentrum'],
  'owner.social.profiel.opslaan': ['Збережено канал або профіль у службі «Соціальні мережі»', 'Kanaal of profiel opgeslagen in dienst «Sociale netwerken»'],
  'owner.social.profiel.verwijderen': ['Видалено канал або профіль у службі «Соціальні мережі»', 'Kanaal of profiel verwijderd in dienst «Sociale netwerken»'],
  'owner.social.bericht.opslaan': ['Збережено чернетку або допис у службі «Соціальні мережі»', 'Concept of bericht opgeslagen in dienst «Sociale netwerken»'],
  'owner.social.bericht.verwijderen': ['Видалено чернетку або допис у службі «Соціальні мережі»', 'Concept of bericht verwijderd in dienst «Sociale netwerken»'],
  'owner.systeem.verbinding.storing': ['Перерва зв’язку сторінки з сервером (зафіксовано доказ клієнта)', 'Verbindingsonderbreking met de server (clientbewijs vastgelegd)'],
  'owner.systeem.verbinding.offline': ['Втрата мережевого з’єднання пристрою (зафіксовано доказ клієнта)', 'Verlies van netwerkverbinding op het apparaat (clientbewijs vastgelegd)'],
  'owner.systeem.verbinding.hersteld': ['Зв’язок із сервером відновлено та внесено до хронології', 'Verbinding met de server hersteld en opgeslagen in de tijdlijn'],
  'telegram.status.hersteld': ['Зв’язок зі службою входу Telegram відновлено після тривалого збою', 'Verbinding met Telegram-aanmelddienst hersteld na langdurige storing'],
  'telegram.alarm.status-lang': ['Тривалий збій зв’язку зі службою входу Telegram (понад 10 хвилин)', 'Langdurige verbindingsstoring bij aanmelden met Telegram (meer dan 10 minuten)'],
  'telegram.alarm.status-vast': ['Стійка помилка ключа або доступу бота входу Telegram', 'Blijvende sleutel- of toegangsfout van Telegram-aanmeldbot'],
  'telegram.alarm.status-hersteld': ['Історичне сповіщення про відновлення входу через Telegram', 'Historische herstelmelding van aanmelden met Telegram'],
};

const TOKEN_UK: Record<string, string> = { owner: '', admin: 'Адмін', mcp: 'ШІ', tool: 'інструмент', grant: 'дозвіл', created: 'створено', updated: 'змінено', deleted: 'видалено', revoked: 'відкликано', approved: 'схвалено', denied: 'відхилено', opened: 'відкрито', closed: 'закрито', login: 'вхід', logout: 'вихід' };
/** Leesbaar label: exacte vertaling, anders de code zelf netjes gemaakt (nooit leeg). */
export function actieLabel(action: string, lang: Taal): string {
  const a = ACTIE_LABELS[action];
  if (a) return a[lang === 'uk' ? 0 : 1];
  const delen = String(action || '').replace(/^owner\./, '').split(/[._-]+/).filter(Boolean);
  if (!delen.length) return '—';
  if (lang === 'uk') { const v = delen.map((d) => TOKEN_UK[d.toLowerCase()] ?? d).filter(Boolean).join(' · '); return v.charAt(0).toUpperCase() + v.slice(1); }
  const v = delen.join(' · '); return v.charAt(0).toUpperCase() + v.slice(1);
}

// ------------------------------------------------------------------------------------------------ doel en wijziging
export type Doel = { soort: string; id?: string; naam?: string };
export type Wijziging = { van?: unknown; naar?: unknown; velden?: string[] };
const str = (v: unknown, n = 160) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Het doel van een regel: eerst details.doel; anders uit de gebruikelijke oude veldnamen. */
export function doelVan(details: unknown, _action = ''): Doel | null {
  const d = obj(details);
  const doel = obj(d.doel);
  if (str(doel.soort) || str(doel.id) || str(doel.naam)) return { soort: str(doel.soort, 40) || 'onderwerp', id: str(doel.id) || undefined, naam: str(doel.naam) || undefined };
  // vaste vorm van backend/agent-audit.ts: details.target = { type, id, label }
  const tg = obj(d.target);
  if (str(tg.type) || str(tg.id) || str(tg.label)) {
    const soort = str(tg.type, 40) === 'mcp-koppeling' ? 'verbinding' : str(tg.type, 40) === 'agenttoken' ? 'token' : (str(tg.type, 40) || 'onderwerp');
    return { soort, id: str(tg.id) || undefined, naam: str(tg.label) || str(tg.id) || undefined };
  }
  const kandidaten: Array<[string, string]> = [
    ['agent', 'agent'], ['klant', 'agent'], ['clientName', 'agent'], ['agenten', 'agent'], ['targetEmail', 'account'], ['email', 'account'], ['account', 'account'], ['userId', 'account'],
    ['gebruiker', 'account'], ['tool', 'tool'], ['sleutel', 'schakelaar'], ['naam', 'onderwerp'], ['label', 'onderwerp'], ['voorstel', 'pakket'], ['versie', 'pakket'],
    ['grantId', 'toestemming'], ['verbinding', 'verbinding'], ['onderwerp', 'onderwerp'], ['deur', 'deur'], ['rol', 'rol'], ['vingerafdruk', 'passkey'],
  ];
  for (const [k, soort] of kandidaten) {
    const v = d[k];
    const t = Array.isArray(v) ? v.map((x) => str(x, 40)).filter(Boolean).slice(0, 4).join(', ') : str(v);
    if (t) return { soort, naam: t };
  }
  return null;
}
export function wijzigingVan(details: unknown): Wijziging | null {
  const d = obj(details);
  const w = obj(d.wijziging);
  if ('van' in w || 'naar' in w || Array.isArray(w.velden)) return { van: w.van, naar: w.naar, velden: Array.isArray(w.velden) ? w.velden.map((x) => str(x, 60)).filter(Boolean) : undefined };
  if ('van' in d || 'naar' in d) return { van: d.van, naar: d.naar };
  if ('from' in d || 'to' in d) return { van: d.from, naar: d.to };
  if ('before' in d || 'after' in d) return { van: d.before, naar: d.after };
  if (typeof d.aan === 'boolean') return { naar: d.aan ? 'aan' : 'uit' };
  if (d.mode !== undefined && typeof d.mode !== 'object') return { naar: d.mode };
  if (d.duur !== undefined && typeof d.duur !== 'object') return { naar: d.duur };
  if (d.dagen !== undefined && typeof d.dagen !== 'object') return { naar: `${d.dagen} d` };
  if (d.modus !== undefined && typeof d.modus !== 'object') return { naar: d.modus };
  return null;
}
export const redenVan = (details: unknown): string => { const d = obj(details); return str(d.reden, 300) || str(d.reason, 300) || str(d.notitie, 300); };
/** AI-agent in de regel (slug of ruwe naam) — het scherm zet dit met agentSlugVan() om in een logo. */
export function agentVan(details: unknown): string {
  const d = obj(details);
  const v = d.agent ?? d.klant ?? d.clientName ?? obj(d.doel).id;
  if (Array.isArray(v)) return str(v[0], 60);
  const t = str(v, 60);
  return /^(claude|gpt|codex|grok|gemini|copilot|cursor|antigravity|autoclaw|windsurf|cline|devin|opencode|mscopilot)$/i.test(t) || /claude|chatgpt|openai|codex|grok|gemini|copilot|cursor|antigravity|jetski|autoclaw|openclaw|zhipu|chatglm|\bglm\b|windsurf|codeium|cline|roocode|devin|cognition|opencode/i.test(t) ? t : (typeof d.agent === 'string' ? t : '');
}
const kort = (v: unknown): string => { if (v === undefined || v === null || v === '') return '—'; if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 120); } catch { return '…'; } } return String(v).slice(0, 120); };
export const wijzigingTekst = (w: Wijziging | null): string => !w ? '' : ('van' in w && w.van !== undefined ? `${kort(w.van)} → ${kort(w.naar)}` : `→ ${kort(w.naar)}`);

/** Filters (server en scherm delen het formaat). */
export type JournaalFilter = {
  q?: string; categorieen?: string[]; resultaten?: ResultaatKlasse[]; actorId?: string; doelId?: string; actie?: string; bron?: 'nieuw' | 'oud' | 'alles';
  van?: number; tot?: number; /** rijfilter op kolom service (mcp/hub/mail/…); heet bewust `dienst`: het sessieveld `service` uit de body is NOOIT een filter (audit fase 2, L-01) */ dienst?: string; verbergRuis?: boolean; volgorde?: 'nieuw' | 'oud'; cursor?: string; limiet?: number;
};

/** CSV-veilig (RFC 4180) én beschermd tegen spreadsheet-formules (=, +, -, @). */
export function csvCel(v: unknown): string {
  let t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
