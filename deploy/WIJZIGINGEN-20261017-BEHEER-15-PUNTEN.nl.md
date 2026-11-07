> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261017-АДМІНІСТРУВАННЯ-15-ПУНКТІВ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Admin-pakket: 15 punten (17 oktober 2026, derde pakket)

Bouwt voort op `WIJZIGINGEN-20261017-UITROL-WIZARD.md`. Gedetailleerde notities per onderdeel: `WIJZIGINGEN-20261017-INTEGRATIES.md`, `WIJZIGINGEN-20261017-DIAGNOSTIEK.md`.

1. **Wie bereidt updates voor** (`Voorbereiders.tsx`, `Persoon.tsx`): vaste layout, foto/naam/e-mail van het account (initialen zonder foto); alleen wie echt recht heeft; verweesde en door AI-beleid geblokkeerde rechten apart.
2–6. **/updates**: uploadwizard bovenaan; «Чекають схвалення» alleen als er iets wacht; max. 5 recente + «Уся історія»; fasenblok en wizard leeg na 30 s; terminal pas zichtbaar zodra de installatie begint, weg 30 s na afloop.
7. **Instellingen**: kaart «Розгортання з телефона» met drie stappen en statuschips.
8. **Agent toevoegen**: merklogo's (`public/agent-logos`, ±7 kB), looptijd 1/7/30 dagen of «до відкликання» (migratie 0052), eerlijke uitleg bij lege lijst van privé-koppelingen; sluitknoppen overal gecentreerd (`platform/sluitknop.css`).
9. **Доступ ШІ**: logo's; «Розгортати сайт» ⇄ recht «agent» automatisch (alleen automatische rechten worden ingetrokken; handmatige nooit).
10. **Logboek (/audit)**: alle rechtenwijzigingen (`agent.grant.*`, `agent.policy.*`) met wie/aan wie/voor→na/looptijd/reden; filters, zoeken, datum, groepering, export, hash-keten. Hulpfunctie `backend/audit-gebeurtenis.ts` (`schrijfBeheerAudit`).
11. **Technische balk**: past zich aan de beschikbare breedte aan (incl. zijmenu), laatste stap «⋯»-menu.
12. **/contour → «Секрети й ключі»**: inventaris, tonen/wijzigen/verwijderen alleen met step-up (passkey/app-code/herstelcode), waarde 30 s zichtbaar, mislukte pogingen en overzicht gelogd.
13. **/mappen**: integratiecentrum met 160 kaarten (19 klaar, 2 instellen, 139 «Скоро» — eerlijk), categorieën, zoeken, filters, detail, test, loskoppelen, schakelaar voor gebruikers (migratie 0055).
14. **/diagnostiek**: 42 controles in 11 categorieën, «Потребує уваги», storingshistorie en trend (migratie 0056), gebruikersklacht-tab, alles gelogd.
15. **/overzicht**: 13 widgets, verslepen/formaat/verbergen/herstellen (per beheerder opgeslagen, migratie 0057), snapshots elk uur/dag, gebruikersgeschiedenis zonder vertrouwelijke gegevens (migratie 0058).

## Migraties
0052, 0053, 0055, 0056, 0057, 0058 (nummers 0051 en 0054 bestaan niet — dat is bewust, de volgorde blijft alfabetisch).

## Niet bewezen
Echte passkey/WebAuthn in Chrome, echte serverchecks (subdomeinen/TLS/Google), 90-dagen snapshotgeschiedenis (vult zich met de tijd), de nazorg-timer op systemd. Gebruikerspagina die `integraties/beschikbaar` toont bestaat nog niet.
Bekende tests die ook vóór deze wijziging faalden: `tech-profiel` (2), `uitrol-goedkeuring` «db: mijnruimte_app», 4× RLS in `toegang-context`.
