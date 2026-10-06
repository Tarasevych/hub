import { useState } from "react";
import "./mcp-bridge.css";

type Lang = "uk" | "nl";
type Props = { lang: Lang; tab: string };

const services: Array<[string, string, string, string]> = [
  ["Хаб", "Hub", "hub.tarasevych.com", "Дім простору. Огляд роботи."],
  ["Ідентичність", "Identiteit", "id.tarasevych.com", "Хто входить. Сесії й персоналізація."],
  ["Адмін", "Beheer", "admin.tarasevych.com", "Видача і відкликання доступів."],
  ["API", "API", "api.tarasevych.com", "Машинні контракти маєтку."],
  ["Панель", "Paneel", "dashboard.tarasevych.com", "Випуски, ресурси, відкат."],
  ["ШІ", "AI", "ai.tarasevych.com", "Робочий простір моделей."],
  ["Пошта", "E-mail", "mail.tarasevych.com", "Скринька. Агент не надсилає листів без окремого дозволу."],
  ["Хмара", "Cloud", "cloud.tarasevych.com", "Календар і файли."],
  ["Git", "Git", "github.tarasevych.com", "Код, з якого збирається цей випуск."],
  ["Дім", "Huis", "huis.tarasevych.com", "Кімнати й пристрої. Ще без живого шлюзу."],
  ["Міст", "Brug", "mcp.tarasevych.com", "Ця консоль для людини і двері для агентів."],
];

const liveTools = [
  ["site_health", "Стан сайту на порту 8080.", "Status van de site op poort 8080."],
  ["release_info", "Поточний випуск і коміт.", "Huidige release en commit."],
  ["list_dir", "Файли випуску.", "Bestanden van de release."],
  ["read_file", "Текст файлу. Секрети відхиляє.", "Tekst van een bestand. Geheimen worden geweigerd."],
  ["host_status", "Сайт, тунель і міст.", "Site, tunnel en brug."],
  ["list_releases", "Назви випусків.", "Releasenamen."],
  ["start_backup", "Зашифрована копія. Вміст дампа не повертає.", "Versleutelde kopie. De dump zelf komt niet terug."],
  ["write_staging", "Запис лише в теку mcp-staging.", "Schrijven alleen in de map mcp-staging."],
];

const catalogTools = [
  "list_services", "get_service", "health_check", "get_architecture", "get_roadmap",
  "estate_search", "hub_overview", "id_profile", "issue_agent_token", "admin_list_access",
  "admin_grant", "api_describe", "dashboard_usage", "ai_status", "mail_inbox_summary",
  "cloud_calendar_today", "github_repos", "huis_status", "list_tasks", "upsert_task",
  "list_notes", "upsert_note", "agent_handshake",
];

const agents = [
  ["Grok", "https://mcp.tarasevych.com/Grok", "Підключено", "Verbonden"],
  ["Claude", "https://mcp.tarasevych.com/claude", "Шлях є, вхід ще закритий", "Pad bestaat, ingang nog dicht"],
  ["ChatGPT", "https://mcp.tarasevych.com/chatgpt", "Шлях є, вхід ще закритий", "Pad bestaat, ingang nog dicht"],
  ["Gemini", "https://mcp.tarasevych.com/gemini", "Шлях є, вхід ще закритий", "Pad bestaat, ingang nog dicht"],
  ["Copilot", "https://mcp.tarasevych.com/copilot", "Шлях є, вхід ще закритий", "Pad bestaat, ingang nog dicht"],
];

const columns = [
  ["backlog", "Черга", "Wachtrij"],
  ["doing", "В роботі", "Bezig"],
  ["blocked", "Заблоковано", "Geblokkeerd"],
  ["done", "Готово", "Klaar"],
];

export default function McpServiceView({ lang, tab }: Props) {
  const t = (uk: string, nl: string) => (lang === "uk" ? uk : nl);
  const section = ["overview", "services", "tools", "board", "agents", "playground", "traffic", "connect", "roadmap", "download"].includes(tab) ? tab : "overview";
  const [task, setTask] = useState("");
  const [column, setColumn] = useState("backlog");
  const [board, setBoard] = useState<Array<{ title: string; column: string }>>([]);
  const [tool, setTool] = useState(liveTools[0][0]);
  const [callNote, setCallNote] = useState("");

  return (
    <main className="mcp-console" data-mcp-tab={section}>
      {section === "overview" && (
        <>
          <header className="mcp-hero">
            <p>MCP · {t("міст до ШІ", "brug naar AI")}</p>
            <h1>{t("Будь-який агент заходить сюди. Не в браузер.", "Elke agent komt hier binnen. Niet via de browser.")}</h1>
            <p>{t(
              "Пошта, хаб і решта вже живі на віртуальній машині, за вашим входом. Агент не логіниться як людина. Ця сторінка — консоль моста: двері, інструменти, дошка роботи.",
              "E-mail, hub en de rest draaien al op de virtuele machine, achter uw aanmelding. Een agent meldt zich niet aan als een mens. Deze pagina is de console van de brug: deuren, hulpmiddelen, een werkbord.",
            )}</p>
          </header>
          <section className="mcp-stats">
            <article><strong>11</strong><span>{t("хостів маєтку", "hosts van het domein")}</span></article>
            <article><strong>8</strong><span>{t("живих інструментів", "live hulpmiddelen")}</span></article>
            <article><strong>/Grok</strong><span>{t("двері, які вже відповідають", "deur die al antwoordt")}</span></article>
          </section>
          <section className="mcp-split">
            <article>
              <h2>{t("Шар мосту", "Laag van de brug")}</h2>
              <ol>
                <li>{t("Людина працює в цій консолі й у пошті, хабі, панелі.", "De mens werkt in deze console en in e-mail, hub, paneel.")}</li>
                <li>{t("Агент іде на свій шлях: Grok на /Grok.", "De agent gaat naar zijn pad: Grok op /Grok.")}</li>
                <li>{t("Той шлях читає випуск на VM. Секрети й база туди не входять.", "Dat pad leest de release op de VM. Geheimen en de database gaan daar niet in.")}</li>
              </ol>
            </article>
            <article>
              <h2>{t("Чому агент не бачить сайт як ви", "Waarom een agent de site niet ziet zoals u")}</h2>
              <p>{t(
                "Браузерний вхід — для людини. Агенту потрібен контракт: JSON-RPC, окремі двері, журнал. Саме це тримає mcp.tarasevych.com.",
                "Aanmelden in de browser is voor een mens. Een agent heeft een contract nodig: JSON-RPC, een eigen deur, een logboek. Dat is mcp.tarasevych.com.",
              )}</p>
            </article>
          </section>
        </>
      )}

      {section === "services" && (
        <>
          <header className="mcp-hero"><h1>{t("Сервіси", "Diensten")}</h1><p>{t("Ті самі адреси, що в меню зліва. Міст їх не замінює.", "Dezelfde adressen als in het menu links. De brug vervangt ze niet.")}</p></header>
          <section className="mcp-cards">
            {services.map(([uk, nl, host, role]) => (
              <article key={host}>
                <h2>{t(uk, nl)}</h2>
                <code>{host}</code>
                <p>{role}</p>
              </article>
            ))}
          </section>
        </>
      )}

      {section === "tools" && (
        <>
          <header className="mcp-hero">
            <h1>{t("Інструменти", "Hulpmiddelen")}</h1>
            <p>{t("Зверху те, що Grok уже може викликати. Нижче каталог із консолі, який на двері ще не виставлено.", "Boven wat Grok al kan aanroepen. Daaronder de catalogus uit de console, die nog niet op de deur staat.")}</p>
          </header>
          <section className="mcp-cards">
            {liveTools.map(([name, uk, nl]) => (
              <article key={name}><h2>{name}</h2><p>{t(uk, nl)}</p><small>{t("на дверях", "op de deur")}</small></article>
            ))}
          </section>
          <h2 className="mcp-sub">{t("Каталог консолі, ще не на дверях", "Catalogus van de console, nog niet op de deur")}</h2>
          <ul className="mcp-pills">{catalogTools.map((name) => <li key={name}>{name}</li>)}</ul>
        </>
      )}

      {section === "agents" && (
        <>
          <header className="mcp-hero"><h1>{t("Агенти", "Agenten")}</h1><p>{t("Кожен агент має свої двері. Токен у цю сторінку не вставляється.", "Elke agent heeft een eigen deur. Een token hoort niet op deze pagina.")}</p></header>
          <section className="mcp-cards">
            {agents.map(([name, url, uk, nl]) => (
              <article key={name}><h2>{name}</h2><code>{url}</code><small>{t(uk, nl)}</small></article>
            ))}
          </section>
        </>
      )}

      {section === "connect" && (
        <>
          <header className="mcp-hero"><h1>{t("Підключити", "Verbinden")}</h1><p>{t("У клієнт Grok ставиться лише ця адреса. Старого /mcp немає.", "In de Grok-client hoort alleen dit adres. Het oude /mcp bestaat niet.")}</p></header>
          <article className="mcp-callout"><code>https://mcp.tarasevych.com/Grok</code></article>
          <p className="mcp-note">{t("Дозвіл підтверджується токеном на сервері. Відкликання — заміна того файлу, не кнопка на цій сторінці.", "Toestemming wordt bevestigd met het token op de server. Intrekken is het vervangen van dat bestand, geen knop op deze pagina.")}</p>
        </>
      )}

      {section === "board" && (
        <>
          <header className="mcp-hero"><h1>{t("Дошка", "Bord")}</h1><p>{t("Спільна черга роботи. Поки зберігається в цьому вікні браузера, не на сервері.", "Een gedeelde werkwachtrij. Voorlopig alleen in dit browservenster, niet op de server.")}</p></header>
          <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); if (!task.trim()) return; setBoard((rows) => [...rows, { title: task.trim(), column }]); setTask(""); }}>
            <input value={task} onChange={(event) => setTask(event.target.value)} placeholder={t("Назва задачі", "Naam van de taak")} />
            <select value={column} onChange={(event) => setColumn(event.target.value)}>{columns.map(([id, uk, nl]) => <option key={id} value={id}>{t(uk, nl)}</option>)}</select>
            <button type="submit">{t("Додати", "Toevoegen")}</button>
          </form>
          <section className="mcp-board">
            {columns.map(([id, uk, nl]) => (
              <article key={id}>
                <h2>{t(uk, nl)}</h2>
                {board.filter((row) => row.column === id).map((row) => <p key={row.title}>{row.title}</p>)}
              </article>
            ))}
          </section>
        </>
      )}

      {section === "playground" && (
        <>
          <header className="mcp-hero"><h1>{t("Пісочниця", "Zandbak")}</h1><p>{t("Тут видно, який інструмент піде агенту. Сам виклик робить підключений клієнт, не ця форма.", "Hier ziet u welk hulpmiddel naar de agent gaat. De aanroep doet de verbonden client, niet dit formulier.")}</p></header>
          <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); setCallNote(tool); }}>
            <select value={tool} onChange={(event) => setTool(event.target.value)}>{liveTools.map(([name]) => <option key={name}>{name}</option>)}</select>
            <button type="submit">{t("Показати виклик", "Aanroep tonen")}</button>
          </form>
          {callNote ? <article className="mcp-callout"><code>{`tools/call  ${callNote}`}</code></article> : null}
        </>
      )}

      {section === "traffic" && (
        <>
          <header className="mcp-hero"><h1>{t("Трафік", "Verkeer")}</h1><p>{t("Журнал викликів агентів на цю консоль ще не пишеться. Живий стан сайту лишається на панелі випусків.", "Een logboek van agentaanroepen wordt hier nog niet bijgehouden. De livestatus van de site blijft op het releasepaneel.")}</p></header>
          <article className="mcp-callout"><a href="https://dashboard.tarasevych.com/releases.html">dashboard.tarasevych.com/releases.html</a></article>
        </>
      )}

      {section === "roadmap" && (
        <>
          <header className="mcp-hero"><h1>{t("Що далі", "Wat hierna")}</h1></header>
          <section className="mcp-split">
            <article>
              <h2>{t("Уже є", "Er is al")}</h2>
              <ul>
                <li>{t("Консоль на mcp.tarasevych.com у тій самій програмі, що пошта.", "Console op mcp.tarasevych.com in hetzelfde programma als e-mail.")}</li>
                <li>{t("Двері /Grok і читання випуску.", "Deur /Grok en het lezen van de release.")}</li>
                <li>{t("Перепустка, яка переживає перезапуск моста.", "Een pas die een herstart van de brug overleeft.")}</li>
              </ul>
            </article>
            <article>
              <h2>{t("Ще не виставлено на двері", "Nog niet op de deur")}</h2>
              <ul>
                <li>{t("Каталог пошти, календаря, git і панелі як інструменти агента.", "Catalogus van e-mail, agenda, git en paneel als hulpmiddelen van de agent.")}</li>
                <li>{t("Окремий вхід для Claude, ChatGPT, Gemini, Copilot.", "Een eigen ingang voor Claude, ChatGPT, Gemini, Copilot.")}</li>
                <li>{t("Дошка й журнал, які зберігаються на сервері.", "Bord en logboek die op de server blijven staan.")}</li>
              </ul>
            </article>
          </section>
        </>
      )}

      {section === "download" && (
        <>
          <header className="mcp-hero">
            <h1>{t("Архів на ПК", "Archief op de pc")}</h1>
            <p>{t(
              "Робоча копія випуску лежить на диску T:, запасна — на R:. Сайт звідти не відкривається: його слухає лише віртуальна машина.",
              "De werkkopie van de release staat op schijf T:, de reservekopie op R:. De site opent daar niet vandaan: alleen de virtuele machine luistert.",
            )}</p>
          </header>
          <section className="mcp-cards">
            <article>
              <h2>T:\</h2>
              <code>T:\mijn-ruimte\broncode\zelf-hosten\20261004-mcp\</code>
            </article>
            <article>
              <h2>R:\</h2>
              <code>R:\mijn-ruimte-reservekopie\broncode\zelf-hosten\20261004-mcp\</code>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
