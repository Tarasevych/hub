> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./RUNBOOK-TECH-RUIMTES-UI.uk.md) · [🇳🇱 **Nederlandse versie**](./RUNBOOK-TECH-RUIMTES-UI.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# RUNBOOK — Twee ruimtes: gebruikersinterface (vlag `tech-ruimtes-v2`)

Werker T-UI, 27.10.2026. Hoort bij de backend van werker T-BACKEND (`backend/tech-ruimtes.ts`, contract
`docs/ontwerp/TECH-RUIMTES-API.md`). Dit bestand is bewust apart gehouden van `RUNBOOK-VEILIGE-UITROL.md` (geen samenvoegconflicten).

## 1. Wat verandert er (alleen met de vlag AAN)
- **Wisselknop** «Звичайний простір | Технічний простір» in het accountmenu en in de technische band. Wisselen gebeurt in het
  tabblad zelf (geen herladen; getypte tekst en open vensters blijven). Naar «Звичайний» = de technische sessie **pauzeert**.
  Toetsenbord: ←/→, Home/End; één tab-stop.
- **Startvenster** «Вхід у технічний простір» met precies drie termijnen:
  «На час (до HH:MM)», «До завершення технічного сеансу», «До виходу з акаунта на сайті» (NL: «Voor een tijd (tot HH:MM)»,
  «Tot het einde van de technische sessie», «Tot afmelden van het account op de site»), elk met één regel uitleg.
  Niet-beschikbare keuzes blijven zichtbaar, uitgegrijsd, met de reden van de server. Loopt er al een sessie: «Змінити термін»
  (telt vanaf nu) of «Додати час» (bijtellen) — het woord «Подовжити» verdwijnt.
- **Eén pagina «Доступ і терміни»** (venster met tabbladen: Мій технічний доступ / Вхід і підтвердження / Доступ ШІ /
  Люди з технічним доступом / Коди доступу і гості / Прапорці-тести), gevoed door `…/ruimtes/toegang`. AI heeft één
  termijnenset (1 година … «До відкликання вручну»). Laatst gekozen tabblad blijft bewaard.
- **Uitloggen in drie duidelijke keuzes** met gevolg: «Вийти з технічного сеансу» (blijft aangemeld; extensie-ontgrendelingen
  blijven), «Вийти з акаунта на сайті» (sluit ook technisch; extensie-ontgrendelingen in deze browser vervallen), «Вийти всюди»
  (opent Безпека → Сесії om te bevestigen). Plus: «Закриття однієї вкладки не знімає довгі дозволи розширення» (besluit t330u).
- **Woorden** (audit): band en Сесії zeggen «до виходу з акаунта на сайті» / «до завершення технічного сеансу»; het
  bevestigvenster zegt «Не питати знову, доки я не вийду з акаунта на сайті (не довше N год)».
- Versheid tussen subdomeinen: status elke 15 s zolang het tabblad zichtbaar is + meteen bij focus/zichtbaar (was tot 60 s).

Met de vlag **UIT** is alles precies zoals vóór deze wijziging (oude venster, oude woorden, oude knoppen).

## 2. Bestanden
- `src/tech/ruimtes-api.ts` — getypeerde client; `src/tech/ruimtes-contract.ts` — types + pure omzetting van het serverantwoord (ISO-tijden → ms, `toegang` → rijen per tabblad).
- `src/tech/ruimtes/teksten.ts` (UA+NL + pure hulpfuncties), `ruimtes-opslag.ts`, `ruimtes-vlag.ts`, `RuimteWissel.tsx`,
  `StartVenster.tsx`, `ToegangPagina.tsx`, `UitloggenKeuze.tsx`, `ruimtes.css`.
- Kleine haken: `src/tech/TechLaag.tsx`, `src/tech/tech-opslag.ts` (venstertypes), `src/CanoniekAccountMenu.tsx`,
  `src/BeveiligingSessiesPaneel.tsx`, `src/platform/bevestig-toegang.tsx`.
- Tests: `tests/eenheid/tech-ruimtes-ui.test.ts`, `tests/e2e/tech-ruimtes-ui.e2e.ts`, stand `tests/e2e/hulp/ruimtes-stand/`,
  starter `scripts/e2e-tech-ruimtes-ui.mjs`.
- `src/tech/ruimtes/` staat NIET in de technische bundels (`shared/tech-bundels.ts`): het startvenster moet werken vóór er een
  technische sessie is. De vlag wordt via OFREP gelezen (`/api/ofrep/v1/evaluate/flags/tech-ruimtes-v2`), niet via `src/vlaggen/`.

## 3. Aanzetten (na uitrol van UI + backend)
1. Uitrollen zoals gewoonlijk; `npm run migrate` (de backend levert de vlag aan, standaard UIT).
2. «Прапорці» → `tech-ruimtes-v2` → «Тест: так» (alleen voor u), Ctrl+F5.
3. Controle: accountmenu toont de wisselknop; klik «Технічний простір» → startvenster met drie termijnen.
4. Terug: vlag uit → oude weergave, zonder gegevensverlies.

## 4. Tests (alleen lokaal)
- `node scripts/eenheidstests.mjs tech-ruimtes-ui` (geen DB nodig).
- `node scripts/e2e-tech-ruimtes-ui.mjs` — echte TechLaag in Chrome tegen een nepserver in het geheugen; elk verzoek naar een
  andere host wordt afgebroken en geteld (eis 0). Screenshots: `E2E_SCREENSHOTS` (standaard `/workspace/audit-technisch/ui-*.png`).

## 5. Bekende grenzen
- De stand gebruikt een vereenvoudigd accountmenu; het echte `CanoniekAccountMenu` is alleen via typecontrole en build gedekt.
- De e2e draait tegen de nep-implementatie van het contract; tegen de echte backend opnieuw draaien zodra die er is.
- «Технічний простір ще порожній» (aparte gegevens): backendzaak (ruimtepoort); de UI toont nu dezelfde gegevens zodra de server
  dat doet, maar `RuimteStrook.tsx` is ongewijzigd gelaten.
