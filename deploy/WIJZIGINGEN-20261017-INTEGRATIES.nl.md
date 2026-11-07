> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261017-ІНТЕГРАЦІЇ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Admin → /mappen «Інтеграції» (17 oktober 2026)

De tab `directories` (URL /mappen) is een integratiecentrum geworden: 160 kaarten in 21 categorieën, met zoeken, filters en een detailvenster.

## Wat er staat
- `shared/integraties-catalogus.ts`: 160 integraties (id, naam, categorie, methoden, uk/nl-tekst, site, status `klaar` / `instellen` / `binnenkort`).
  **Eerlijk:** alleen wat werkelijk bestaat is `klaar` (19: Google Gmail/Agenda/Drive/Foto's/SSO, Telegram, GitHub, Home Assistant, Anthropic-sleutel, de zes AI-agenten, eigen MCP-client, webhooks, REST-API, OAuth-apps) of `instellen` (2: Entra, SCIM). De overige 139 zijn «Скоро»: de knop is uitgeschakeld en er staan geen verzonnen scopes of stappen.
- `shared/integraties-detail.ts`: rechten, stappen, documentatielink per bestaande koppeling; filters «Популярні» (34) en «Нові» (de zes agenten + MCP-client); servercodes → uk/nl-tekst.
- `src/integraties/`: `Integraties.tsx` (catalogus, «Мої під'єднання», «Зовнішні каталоги»), `Detail.tsx` (venster), `Logo.tsx`, `logos.ts`, `integraties.css`.
- `backend/admin-integraties.ts` + migratie `0055_integraties.sql`: routes `admin/integraties/{stand,beleid,controleer,loskoppelen}` en `integraties/beschikbaar` (voor gewone gebruikers: alleen de id's die de beheerder opende).
- Elke wijziging komt in het beheerlogboek (`integration.beleid.aan|uit|geweigerd`, `integration.test`, `integration.disconnect`), met wie/wat/van→naar.

## Logo's
Merklogo's uit simple-icons (CC0), 137 stuks, 105 kB (44 kB gzip), pas geladen als de pagina opent. Een eerdere versie had paden stuk-afgerond (56 van 137 corrupt); nu via `scripts/integraties-logos-maken.mjs` (svgo, 2 decimalen; 11 merken 3). De test controleert de padstructuur en dekt die fout af. 16 kaarten hebben geen simple-icons-logo (o.a. Outlook, OneDrive, Teams, Azure, Mollie — Microsoft-merken staan niet in de set) en krijgen een monogram in een eigen tint. Merknamen en -logo's zijn van hun eigenaars.

## Wat «Під'єднати», «Перевірити стан» en «Вимкнути» werkelijk doen
- «Під'єднати»: opent de bestaande pagina van die koppeling (OAuth, MCP-adres of kluis). Er is geen tweede OAuth-stroom gebouwd.
- «Перевірити стан»: configuratiecontrole op de site (bestaat er een sleutel/koppeling, is hij ingetrokken). Er gaat **geen** verzoek naar de externe dienst en een sleutel in de kluis geeft «let op: niet geverifieerd», nooit «ok».
- «Вимкнути» (alleen sleutels in de kluis en eigen AI-koppelingen, met bevestiging): trekt de koppeling in; de waarde blijft in de kluis tot u haar daar verwijdert (met passkey).
- Het schakelaartje «Voor gebruikers» zet een bestaande koppeling open voor gebruikers (`apps.manage`); `binnenkort` wordt geweigerd.

## Niet gedaan / niet bewezen
- Een gebruikerspagina die `integraties/beschikbaar` toont is niet gebouwd; de route en de beheerschakelaar zijn er.
- Levende toestand van Google-koppelingen komt uit de bestaande diagnose; die van agenten en sleutels voor het account van de aanroeper.
- Tests: `admin-integraties` 33, `integraties-catalogus` 21 (incl. padstructuur); browser (Chromium, uk/nl, licht/donker, 390 px) 60 controles. De migratie is op een lokale PG16 toegepast, niet op de echte server.
