# Wizard «Нове оновлення», voorcontrole, nazorg-bewaker, agent-grants en technisch profiel — 17 oktober 2026 (tweede pakket)

Voortbouwend op `WIJZIGINGEN-20261017-UITROL-DASHBOARD.md`. Alles hieronder is in code en test aangetoond; wat niet kon worden bewezen
(omdat het alleen op de echte server gebeurt) staat onder «Niet bewezen».

## 1. Technisch profiel (migratie 0048)
- Vaste duren: 8 uur erbij (eigenaar-plafond 480 min). Rollen met een plafond < 240 min (beheerder, 60) krijgen **geen** open einde.
- «До виходу з акаунта» en «До виходу з технічного profile» hebben geen tijdslimiet meer (technische achtervang 366 dagen in de database).
- Het profiel eindigt bij uitloggen (`beeindigenBijUitloggen`, aangeroepen bij uitloggen van deze browser/het account/overal/alle browsers).
- Het dialoogvenster toont geen «(не довше …)»-tekst meer; de balk toont «до виходу з акаунта / з профілю».

## 2. Wizard «Нове оновлення» (`src/uitrol/Upload.tsx`, vervangt «крок 5»)
Vijf stappen: Файл → Перевірка → Завантаження → Схвалення → Встановлення. Na elke afgeronde stap scrollt de pagina naar de volgende,
geeft de hoofdknop focus en pulseert de stap (met `prefers-reduced-motion`-terugval).
- Bestandskaart met pictogram, grootte, datum en een **X** om de keuze te wissen; «Почати спочатку».
- Bestandssoort wordt op de **inhoud** (magic bytes) herkend (`bestandssoort.ts`): geen tar.gz → uitleg wat het wel is (zip, 7z, rar, pdf, afbeelding, Office, programma, tekst…) en wat te doen.
- De vier fasen bovenaan (Підготовка / Схвалення / Перевірки / Розгортання) beginnen **opnieuw** voor het gekozen bestand; de vorige run is een gedempte samenvatting. Een afgeronde run krijgt «Це завершене розгортання».
- Tegels: bestand, versie, samengesteld, auteur, agent, commit, aantal bestanden, sha256, actieve versie.
- «Що змінено» is **verplicht** en komt uit het bestand `SAMENVATTING` in het archief (niet meer te typen). Ontbreekt het (of AUTEUR/AGENT), dan is installeren niet mogelijk; de uitleg en de oplossing staan erbij. Ook de server weigert (`GEEN_AGENT`/`GEEN_SAMENVATTING` in het root-script en de voorcontrole).
- «Версія не новіша» wordt al in de browser getoond (de server weigert dit ook).

## 3. Voorcontrole vóór de goedkeuring (migratie 0049, `backend/uitrol-voorcontrole.ts`)
Na het uploaden pakt de site het archief in een tijdelijke map uit en controleert (zonder iets uit te voeren): structuur, versie, AUTEUR/AGENT/SAMENVATTING,
`bash -n` van alle shell-scripts, bouwbestanden (package.json, lock, vite, serverbundel), nieuwe migraties (waarschuwing bij DROP/TRUNCATE/DELETE zonder WHERE…),
geheimen (alleen bestandsnamen), en de tests die de voorbereider meldde. Faalt het: status `afgebroken` (`VOORCONTROLE_MISLUKT`), nooit goedkeurbaar.
Het resultaat staat als lijst met pictogrammen, uitleg per controle en details in stap 4 en in «Чекають схвалення».
Bewust **niet** in de voorcontrole: `npm ci`/build (dat gebeurt geïsoleerd in de installer) en een proefrun van migraties.

## 4. Terugdraaien als u niet bij de server bent (`deploy/uitrol/mijn-ruimte-nazorg.sh`)
- `installeer-app.sh`: na activering 40 s bewaking (pid-wissel of 3 mislukte gezondheidscontroles → automatisch terugdraaien).
- Daarna 30 minuten een aparte root-timer (`mijn-ruimte-nazorg.timer`): 3 mislukte `/__gezondheid`-controles → `mijn-ruimte-installeer terugdraaien <vorige release>`; resultaat in `gebeurtenissen.jsonl` (`NAZORG_TERUGGEDRAAID` / `NAZORG_MISLUKT`) en op de pagina.
- De site kan zichzelf niet terugdraaien als hij down is; daarom is de bewaker een root-dienst buiten de site.
- **Databasemigraties worden bij terugdraaien niet teruggedraaid** (alleen de code); daarom de waarschuwing in de voorcontrole en de back-up vóór migratie.

## 5. Wie bereidt updates voor
- Probleem (bewezen in code): een grant van soort `mcp-koppeling` hangt aan één OAuth-tokenrij en duurt standaard 1 dag. Verbindt de AI opnieuw (of verloopt de dag), dan is het een ander token: de agent staat nog in de lijst, maar `actieveGrant` vindt niets → «GEEN_VOORBEREIDER_GRANT».
- Oplossing (migratie 0050): nieuwe soort **`agent`** (claude, gpt, grok, gemini, copilot, cursor). Geldt voor elke koppeling van die agent in de **technische** ruimte van dat account, tot hij verloopt (max. 30 dagen) of wordt uitgezet. Privé-koppelingen tellen nooit mee.
- UI: kaarten met monogram-avatar, resterende tijd, waarschuwing bij een verweesde grant, «Додати агента» (venster met agentkeuze, 1/7/30 dagen), «Вимкнути доступ» in plaats van «Відкликати» (reden blijft verplicht: het getroffen account krijgt een melding), en een uitleg «Чому агент у списку, але не може розгортати?».
- In «Останні розгортання» staat nu wie voorbereidde en de auteur/agent uit het pakket.

### Hoe wordt de agent herkend, en wat als een andere agent uploadt?
- `AUTEUR` en `AGENT` in het pakket zijn **zelf opgegeven** (tekst, `^[a-z][a-z0-9-]{1,31}$`); ze zijn informatie voor de eigenaar, geen bewijs.
- De werkelijke voorbereider komt uit de **grant** waarmee geüpload is (account, agenttoken of MCP-koppeling/agent) en staat los daarvan in de lijst («Підготував»).
- Heeft een andere agent geen grant, dan weigert de site de upload (`GEEN_VOORBEREIDER_GRANT`). Heeft hij er wel een, dan wordt zijn naam getoond; het pakket kan nog steeds een andere `AGENT` claimen — daarom beslist altijd u met de passkey.
- Goedkeuren kan **alleen** met een passkey (WebAuthn, ≤ 5 min, gebonden aan de sha256). Google-login, wachtwoord, sms of 2FA keuren geen uitrol goed; dat is bewust zo.

## 6. Overig
- Terminal: kleuren voor labels `[uitrol]`/`[installeer]`, commando's, paden, vlaggen, versies, aantallen, strings en sleutelwoorden; ANSI-codes worden omgezet (`terminal-kleur.ts`, 18 tests). Op aanraakschermen lager (geen scrollval).
- Regeltijden: een run die laat in beeld komt krijgt verdeelde tijden (geen identieke); deelstappen tonen begin en duur.
- Pagina ververst in pakketten van 2000 regels zonder wachttijd; foutmelding bij 502/503/504 («сервер перезапускається») verdwijnt vanzelf en heeft een sluitknop; succesmeldingen verdwijnen na 12 s.
- Журнал-tabblad kiest de lopende run; gebeurteniscodes (GOEDGEKEURD, OK, …) zijn vertaald.
- Dubbele «Оновити»: de bovenste knop van het beheerpaneel (herlaadt alleen paneelgegevens) is verborgen op de updates-pagina; de eigen knop herlaadt overzicht en lijst.
- «Діагностика»: Oekraïens, uitvoerbare opdrachten met «?», gekleurd logboek, whitelist-uitvoering (`backend/uitrol-diagnose-run.ts`).
- «Доступ ШІ»: nieuw ontwerp (zoeken, filters, groepsacties, controlelijst voor Розгортання).

## Tests
Nieuw/bijgewerkt: `uitrol-voorcontrole` 23, `uitrol-nazorg` 10, `terminal-kleur` 18, `uitrol-diagnose-run` 40, `uitrol-runs` 41, `uitrol-goedkeuring` 167/168, `uitrol-herstel` 31, `tar-lezen` 15, `ai-beleid` 27, `tech-profiel` 35/37.
Bestaande, niet door deze wijziging veroorzaakte fouten (ook op het basispakket): `tech-profiel` «niet aan jezelf» en «app-rol kan niet schrijven», `uitrol-goedkeuring` «db: mijnruimte_app heeft geen toegang», 4× RLS-app-rol in `toegang-context` (testomgeving zonder app-rol).
Browser (Chromium, uk/nl, licht/donker, 390 px): wizard 53 controles, dashboard 32 controles. De e2e `tests/e2e/uitrol-meester.e2e.ts` is aangepast aan de wizard maar kon hier niet draaien.

## Niet bewezen
- Gedrag op de echte server: het nazorg-timer/-script op systemd, de 40 s-bewaking met een echte crash, en de e2e met echte Chrome en passkey.
- Welke clientnaam Claude bij de OAuth-registratie gebruikt; de nieuwe agent-grant is daar onafhankelijk van (hij gebruikt de agent uit `/ai/<slug>`).
- De inhoud van het live AI-beleid.

## Uitrollen
1. `sudo bash deploy/installeer-app.sh installeren .` (migraties 0048–0050; installeert ook het nazorg-script en de timer).
2. Na de installatie: «Налаштування» → «Хто готує оновлення» → «Додати агента» → Claude (30 dagen). Verweesde oude Claude-grants uitzetten.
3. Controleren: `systemctl list-timers mijn-ruimte-nazorg.timer` en op de pagina «Діагностика».
