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
  { id: 'uitrol', uk: 'Оновлення сайту', nl: 'Uitrol', patroon: '^(uitrol_|owner\\.uitrol\\.|goedkeur_|owner\\.admin\\.updates)' },
  { id: 'tech', uk: 'Технічний профіль', nl: 'Technisch profiel', patroon: '^(owner\\.tech\\.|owner\\.ruimte\\.|owner\\.flags\\.|owner\\.ondersteuning\\.|owner\\.impersonatie\\.)' },
  { id: 'geheimen', uk: 'Секрети та ключі', nl: 'Geheimen en sleutels', patroon: '(^secret\\.|vault|google-contour|owner\\.app\\.geheim|owner\\.api\\.|api-platform|mcp_(console|backup|archive))' },
  { id: 'ai', uk: 'ШІ та агенти', nl: 'AI en agenten', patroon: '^(ai_|owner\\.mcp\\.|owner\\.ai\\.|owner\\.agent\\.|agent\\.(grant|policy)\\.|owner\\.connector|agent_|agent\\.|beheer\\.agent\\.|browser\\.invoke|ai_beleid|owner\\.extensie\\.)' },
  { id: 'apparaten', uk: 'Пристрої та термінал', nl: 'Apparaten en terminal', patroon: '^(owner\\.terminal\\.|owner\\.ssh-ca\\.|owner\\.browser\\.(enabled|grant)|owner\\.admin\\.device)' },
  { id: 'diagnose', uk: 'Діагностика', nl: 'Diagnose', patroon: '^(diag\\.|admin\\.diagnostiek|owner\\.diagnose|owner\\.admin\\.diagnostics|owner\\.siem)' },
  { id: 'beheer', uk: 'Адміністрування', nl: 'Beheer', patroon: '^(admin_|admin\\.|account_|workspace_|owner_role|owner\\.admin\\.|owner\\.role\\.|owner\\.identity\\.|owner\\.access\\.requested|account\\.definitief)' },
  { id: 'toegang', uk: 'Способи входу та доступ', nl: 'Aanmeldmethoden en toegang', patroon: '^(access\\.|owner\\.step_up|passkey_|toegang|toegangscode_|gast_)' },
  { id: 'sessie', uk: 'Входи та сесії', nl: 'Aanmeldingen en sessies', patroon: '^(sign_in|identity_linked|email_conflict|service_handoff|owner\\.(session|tab|redirect|auth|account|account-menu|security|browser)\\.|owner\\.browser\\.|GOOGLE_|LOGIN_|TRANSACTION_|PRIMARY_REDIRECT_|POPUP_|IDENTITY_|SERVICE_SESSION_)' },
  { id: 'mail', uk: 'Пошта', nl: 'E-mail', patroon: '^owner\\.mail\\.' },
  { id: 'integraties', uk: 'Інтеграції', nl: 'Integraties', patroon: '^(integration\\.|owner\\.(connectors|github|cloud|google|calendar|hub)|connector_|connectors\\.)' },
  { id: 'privacy', uk: 'Приватність', nl: 'Privacy', patroon: '^(owner\\.privacy|owner\\.profile|owner\\.notifications|owner\\.ui)' },
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
export const RUIS_PATROON = '^(owner\\.admin\\.bootstrap|owner\\.admin\\.audit\\.viewed|owner\\.notifications\\.read|owner\\.session\\.rotated|owner\\.session\\.refresh|owner\\.browser\\.grant\\.(used|cookie)|owner\\.diagnose\\.gelezen|owner\\.admin\\.diagnostics\\.read|owner\\.ui\\.|GOOGLE_REDIRECT|GOOGLE_CALLBACK|LOGIN_CLICK|POPUP_|PRIMARY_REDIRECT_|TRANSACTION_|IDENTITY_LOADED|SERVICE_SESSION_CREATED|owner\\.redirect\\.session)';
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
  'owner.admin.sso-policy.updated': ['Змінено політику SSO', 'SSO-beleid gewijzigd'],
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
  'gast_actie': ['Дія гостя', 'Actie van gast'],
  'gast_geweigerd': ['Дію гостя відхилено', 'Actie van gast geweigerd'],
  'gast_sessie_ingetrokken': ['Відкликано гостьову сесію', 'Gastsessie ingetrokken'],
  'toegang_wijziging_ongedaan': ['Скасовано зміну доступу', 'Toegangswijziging ongedaan gemaakt'],
  'owner.step_up.google': ['Підтвердження входу через Google', 'Stap-op bevestigd via Google'],
  'owner.beleid.geweigerd': ['Дію відхилено політикою', 'Actie geweigerd door beleid'],
  'owner.diagnose.gemeld': ['Надіслано діагностичне повідомлення', 'Diagnosemelding verstuurd'],
  'admin.diagnostiek.uitgevoerd': ['Виконано діагностичну перевірку', 'Diagnostische controle uitgevoerd'],
  'admin.beveiliging.aan': ['Увімкнено захист (passkey, тех. профіль)', 'Bescherming aangezet (passkey, technisch profiel)'],
  'admin.beveiliging.uit': ['Вимкнено захист', 'Bescherming uitgezet'],
  'admin.beveiliging.zekering': ['Захист автоматично вимкнено запобіжником (сплеск помилок)', 'Bescherming automatisch uitgezet door de zekering (piek in fouten)'],
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
  'integration.test': ['Перевірено стан інтеграції', 'Status van integratie gecontroleerd'],
  'integration.disconnect': ['Інтеграцію відключено', 'Integratie losgekoppeld'],
  'integration.wizard.test': ['Майстер підключень: перевірено облікові дані у зовнішнього сервісу', 'Koppelwizard: gegevens bij de externe dienst gecontroleerd'],
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
  return /^(claude|gpt|grok|gemini|copilot|cursor|antigravity|autoclaw)$/i.test(t) || /claude|chatgpt|openai|grok|gemini|copilot|cursor|antigravity|jetski|autoclaw|openclaw|zhipu|chatglm|\bglm\b/i.test(t) ? t : (typeof d.agent === 'string' ? t : '');
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
