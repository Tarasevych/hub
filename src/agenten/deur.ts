// Uitleg bij de schakelaars van de MCP-deur (/etc/mijn-ruimte/mcp-rechten.json, alleen root wijzigt ze; de site toont ze alleen).
export type DeurSchakelaar = { id: string; uk: string; nl: string; onUk: string; offUk: string; onNl: string; offNl: string; group?: string };
const effect = (onUk: string, offUk: string, onNl: string, offNl: string) => ({ onUk, offUk, onNl, offNl });
// Bron: vroeger in McpServiceView. De schakelaars staan in /etc/mijn-ruimte/mcp-rechten.json op de server (alleen de eigenaar met root wijzigt ze); de site toont ze alleen.
export const SWITCHES: DeurSchakelaar[] = [
  { id: "read", group: "agent", uk: "Читати сайт і код", nl: "Site en code lezen", ...effect("агент бачить випуск, здоров’я сайту і файли.", "двері відмовляють читати. Список і здоров’я недоступні.", "de agent ziet de release, de gezondheid en de bestanden.", "de deur weigert lezen. Lijst en gezondheid zijn dicht.") },
  { id: "board", group: "agent", uk: "Писати дошку", nl: "Bord schrijven", ...effect("ваші задачі й нотатки (у кожного своя дошка).", "нові записи й переміщення відмовляються.", "uw taken en notities (iedereen heeft een eigen bord).", "nieuwe regels en verplaatsingen worden geweigerd.") },
  { id: "tokens", group: "agent", uk: "Випускати токени агентів", nl: "Agenttokens uitgeven", ...effect("ключ видно один раз, діє 30 днів, потрібне повторне підтвердження входу.", "випуск ключа відмовляється.", "de sleutel verschijnt één keer, geldt 30 dagen en vraagt een nieuwe bevestiging van de aanmelding.", "uitgeven wordt geweigerd.") },
  { id: "uitrol", group: "release", uk: "Викладати підписаний випуск", nl: "Ondertekende release plaatsen", ...effect("двері приймають лише пакет, підписаний вашим ключем на ПК; встановлює його root-служба.", "двері відмовляють приймати пакет. Поточний сайт лишається.", "de deur neemt alleen een pakket aan dat met uw sleutel op de pc is ondertekend; een root-dienst installeert het.", "de deur weigert pakketten. De huidige site blijft.") },
  { id: "session", group: "agent", uk: "Сесійна авторизація агента", nl: "Sessie-autorisatie voor agent", ...effect("агент отримує довгоживучий токен і діє від імені акаунта (повні права, журнал).", "сесійний токен не видається.", "de agent krijgt een langlevend token en handelt namens het account (volledige rechten, journaal).", "sessietoken wordt niet uitgegeven.") },
];

