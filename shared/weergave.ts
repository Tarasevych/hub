// Weergave per account (architectuur 13.10.2026, etap 3): «простий» en «розширений» режим, en de twee richtingen van ШІ.
//
// Waarom zo (en niet anders):
//  - De modus is ALLEEN weergave. Rechten blijven op de server (sessie, rollen, technisch profiel). Een verborgen tabblad is dus geen
//    beveiliging, en een zichtbaar tabblad geeft niets extra. Alternatief «rechten per modus» afgewezen: dan wordt een UI-schakelaar
//    een autorisatiebron, en dat hoort bij de server (OPA, later).
//  - Eén modus per account (server), niet per apparaat: wie op de telefoon «простий» kiest, ziet dat ook op de pc. localStorage is
//    alleen een snelle kopie tegen flikkeren.
//  - Standaard zonder keuze: eigenaar «розширений» (niets verdwijnt bij wie alles al gebruikte), iedereen anders «простий».
//  - Twee richtingen met vaste namen: ai.* = «ШІ для вас» (сайт → провайдер ШІ), mcp.* = «Міст ШІ → сайт» (зовнішній ШІ → ваш сайт).
//    Dezelfde woorden overal (menu, kop van de pagina, uitleg «?»), zodat ze niet meer door elkaar lopen.
import type { HelpLagen, Tekst } from './tech-rollen';

export const MODI = ['eenvoudig', 'expert'] as const;
export type Modus = typeof MODI[number];
export const isModus = (v: unknown): v is Modus => typeof v === 'string' && (MODI as readonly string[]).includes(v);
export const standaardModus = (eigenaar: boolean): Modus => (eigenaar ? 'expert' : 'eenvoudig');

/** Tabbladen van mcp.* die in «простий» zichtbaar zijn; de rest alleen in «розширений». */
export const MCP_EENVOUDIG = ['overview', 'agents', 'connect', 'apps'] as const;
export const MCP_EXPERT = ['dashboard', 'services', 'tools', 'board', 'playground', 'traffic', 'roadmap', 'download', 'verbindingen'] as const;
export const isExpertTab = (service: string, tab: string) => service === 'mcp' && (MCP_EXPERT as readonly string[]).includes(tab);
export const zichtbaar = (service: string, tab: string, modus: Modus) => modus === 'expert' || !isExpertTab(service, tab);

export const MODUS_NAAM: Record<Modus, Tekst> = { eenvoudig: ['Простий', 'Eenvoudig'], expert: ['Розширений', 'Uitgebreid'] };

export type Richting = 'ai' | 'mcp';
export const RICHTING: Record<Richting, { naam: Tekst; pijl: [Tekst, Tekst, Tekst]; kort: Tekst; ander: Richting; anderVraag: Tekst; help: HelpLagen }> = {
  ai: {
    naam: ['ШІ для вас', 'AI voor u'],
    pijl: [['Ви', 'U'], ['цей сайт', 'deze site'], ['провайдер ШІ (ваш ключ)', 'AI-aanbieder (uw sleutel)']],
    kort: ['Сайт сам звертається до ШІ від вашого імені: чат, підсумки, дії на ваших пристроях.', 'De site vraagt zelf de AI namens u: chat, samenvattingen, acties op uw apparaten.'],
    ander: 'mcp',
    anderVraag: ['Хочете, щоб Claude, Grok чи Cursor самі заходили на сайт? Це — міст ШІ → сайт.', 'Wilt u dat Claude, Grok of Cursor zelf de site gebruiken? Dat is de brug AI → site.'],
    help: {
      wat: ['Напрямок «сайт → ШІ». Ви працюєте тут, а сайт надсилає запити провайдеру ШІ з вашим ключем.', 'Richting «site → AI». U werkt hier; de site stuurt vragen naar de AI-aanbieder met uw sleutel.'],
      gevolg: ['Платите провайдеру за своїм ключем; ключ зберігається у сховищі сайту, у браузер не потрапляє.', 'U betaalt de aanbieder via uw sleutel; de sleutel staat in de kluis van de site, niet in de browser.'],
      risico: ['Ключ дає витрачати ваш баланс у провайдера — давайте сайту окремий ключ з лімітом.', 'Met de sleutel kan uw tegoed bij de aanbieder worden gebruikt — geef de site een aparte sleutel met een limiet.'],
      dev: ['Вихідний трафік із сервера (backend → API провайдера). Протилежність mcp.* (вхідний JSON-RPC від чужого клієнта). Окремі піддомени, щоб cookie, CORS і журнали не змішувались; альтернатива «все на одному хості з перемикачем» відкинута — плутанина в правах і журналі.', 'Uitgaand verkeer van de server (backend → API van de aanbieder). Tegenovergestelde van mcp.* (inkomende JSON-RPC van een vreemde client). Aparte subdomeinen houden cookies, CORS en logboek gescheiden; «alles op één host met een schakelaar» afgewezen.'],
    },
  },
  mcp: {
    naam: ['Міст ШІ → сайт', 'Brug AI → site'],
    pijl: [['ШІ-клієнт (Claude, Grok, Cursor…)', 'AI-client (Claude, Grok, Cursor…)'], ['двері MCP', 'MCP-deur'], ['ваш сайт і пристрої', 'uw site en apparaten']],
    kort: ['Зовнішній ШІ заходить на ваш сайт лише з вашого дозволу, на обраний час і з обраними правами.', 'Een externe AI komt uw site binnen, alleen met uw toestemming, voor de gekozen tijd en met gekozen rechten.'],
    ander: 'ai',
    anderVraag: ['Хочете поговорити з ШІ прямо тут, на сайті? Це — «ШІ для вас».', 'Wilt u hier op de site met AI praten? Dat is «AI voor u».'],
    help: {
      wat: ['Напрямок «ШІ → сайт». Ваш ШІ-клієнт підключається до дверей MCP і бачить лише дозволені інструменти.', 'Richting «AI → site». Uw AI-client verbindt met de MCP-deur en ziet alleen toegestane hulpmiddelen.'],
      gevolg: ['Кожен доступ має термін і видно в «Агенти → Журнал»; будь-який можна відкликати.', 'Elke toegang heeft een termijn en staat in «Agenten → Logboek»; elke toegang kunt u intrekken.'],
      risico: ['Дозволяйте лише ті ШІ й ті права, які справді потрібні; запис і команди — найризикованіші.', 'Sta alleen de AI en rechten toe die echt nodig zijn; schrijven en opdrachten zijn het riskantst.'],
      dev: ['Вхідний трафік: OAuth 2.1 + PKCE, RFC 9728 (resource на кожні двері), токен прив’язаний до дверей і терміну. Протилежність ai.* (вихідні виклики). Модель «нуль довіри»: кожен виклик інструмента перевіряється на сервері й пишеться в журнал.', 'Inkomend verkeer: OAuth 2.1 + PKCE, RFC 9728 (resource per deur), token gebonden aan deur en termijn. Tegenovergestelde van ai.* (uitgaande aanroepen). Zero trust: elke aanroep wordt op de server gecontroleerd en gelogd.'],
    },
  },
};

export const HELP_MODUS: HelpLagen = {
  wat: ['«Простий» показує лише основне: огляд, підключення ШІ та агентів. «Розширений» — усі розділи. Сторінки управління сайтом (розгортання, додатки на сервері, архів) в обох режимах видно лише в технічному профілі.', '«Eenvoudig» toont alleen de basis: overzicht, AI verbinden en agenten. «Uitgebreid» toont alle onderdelen. Sitebeheer (uitrol, apps op de server, archief) is in beide modi alleen zichtbaar in het technisch profiel.'],
  gevolg: ['Змінюється лише те, що видно. Права не змінюються: прихований розділ не стає забороненим, а видимий — дозволеним.', 'Alleen wat zichtbaar is verandert. Rechten niet: een verborgen onderdeel wordt niet verboden, een zichtbaar niet toegestaan.'],
  dev: ['Збережено на сервері (app.ui_weergave), щоб вибір діяв на всіх пристроях; localStorage — лише кеш проти мерехтіння. Режим НЕ є межею безпеки — права перевіряє бекенд. Типово: власник «розширений» (нічого не зникає), інші «простий» (поступове розкриття, progressive disclosure).', 'Bewaard op de server (app.ui_weergave), zodat de keuze op elk apparaat geldt; localStorage is alleen een cache tegen flikkeren. De modus is GEEN beveiligingsgrens — rechten controleert de backend. Standaard: eigenaar «uitgebreid», anderen «eenvoudig» (progressive disclosure).'],
};
