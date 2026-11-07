> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261017-DIAGNOSTIEK.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261017-DIAGNOSTIEK.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Діагностика (/diagnostiek) — wijzigingen 17 oktober 2026

Admin → «Діагностика» is een pagina met controles per categorie (src/diagnostiek/, backend/admin-diagnostiek.ts, shared/admin-diagnostiek.ts; migratie 0056).

## Wat er nu is
- 11 categorieën, 42 alleen-lezen controles: Сервіси (9 subdomeinen), Сторінки (6 adminpagina's, interfacebestand, API), Під'єднання (Google, GitHub, OAuth, MCP-deur), **Пошта** (Gmail-API, wachtrij), **Хмара й Drive** (opslag, Drive-API), **ШІ-агенти й MCP** (OAuth-verbindingen, toestemmingen «Хто готує оновлення» — vindt «weesgrants»), **Пристрої** (lokale agenten, hun opdrachten), Дані, Сервер, Мережа й сертифікати, Фонові завдання (met link naar «Оновлення»).
- Per controle: «Перевірити» (één, categorie, alles), status, reactietijd, wat is gecontroleerd, waarom het nodig is, oorzaak van de fout, stappen om het op te lossen, geschiedenis.
- «Потребує уваги» bovenaan: storingen → waarschuwingen → «recent gefaald, nu weer in orde»; nooit uitgevoerd staat er niet in (geen verzonnen groen).
- **Storingsgeschiedenis + trend**: 14 dagen balkjes, weektotalen, «faalde het vaakst», sinds wanneer iets faalt, laatste succes. Bewaartermijn 30 dagen.
- **«Скарга користувача»**: zoek een gebruiker op naam/e-mail en zie wat die op de site ervaart — sessies, mislukte acties (alleen etiketten), koppelingen, mail-wachtrij, en de diagnosestand van de diensten die hij de laatste 24 uur gebruikte, met advies. Geen mailtekst, bestanden, IP of tokens.
- Logboek (admin /audit): `diag.uitgevoerd` (per klik), `diag.storing` en `diag.hersteld` (bij overgang), `diag.gebruiker.bekeken` (elke inzage in een gebruiker).

## Veiligheid
Alleen vaste controle-id's uit het register (geen URL/opdracht van de browser); uitgaand verkeer alleen naar eigen subdomeinen, 127.0.0.1, accounts.google.com, www.googleapis.com en api.github.com, met time-outs en zonder redirects; geen shell; geheimen worden gemaskeerd; één batch tegelijk en een limiet per gebruiker.

## Getest
`admin-diagnostiek` 94/94 (database, routes, nieuwe categorieën, overgangen, gebruiker). Browser (Chromium, uk/nl, licht/donker, 390 px): 69/69.
## Niet bewezen
Gedrag tegen de echte subdomeinen, TLS en Google op de productieserver; de controles zijn hier met nagebootste netwerkantwoorden getest.
