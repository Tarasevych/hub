> 🌐 **Taal / Мова:** [Українська](КОНСОЛІДАЦІЯ-НОТАТКИ.uk.md) · **Nederlands** | [Startpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Consolidatie van de dienst «Notities» (`notities-vnext` · Brug met Agenda, Taken en Opslag)

## 1. Doel en architectuurgrenzen

De dienst «Notities» (`hub.tarasevych.com/notities`) verbindt het eigen domeinmodel in `app.notities` met de synchrone bordspiegel in `app.mcp_console_items`, zodat de webpagina, AI-hulpmiddelen en eerdere uitgaven na terugdraaien dezelfde gegevens zonder verlies blijven lezen.

Binnen deze consolidatie is de vroegere melding over een ontbrekende agendakoppeling opgeheven en vervangen door een volwaardige tweerichtingsbrug binnen dezelfde gegevensruimte (`prive` of `technisch`):

1. **Tweerichtingskoppeling tussen notitie en agenda-afspraak** (`app.notities_agenda_koppelingen`, migratie `0316_notities_agenda_brug.sql`);
2. **Aanmaken van ruimtetaken vanuit een notitie of openstaande lijstpunten** met een blijvende terugverwijzing `bronNotitie` naar de bronnotitie;
3. **Koppelen van verwijzingen naar eigen bestanden in Opslag** (`cloud-vnext`) zonder fysieke bytes op schijf te verdubbelen.

## 2. Beveiliging, afgedwongen rijbeveiliging en ruimtescheiding

- De tabellen `app.notities`, `app.notities_mappen`, `app.notities_revisies` en `app.notities_agenda_koppelingen` draaien onder afgedwongen rijbeveiliging van PostgreSQL (`ENABLE ROW LEVEL SECURITY` én `FORCE ROW LEVEL SECURITY`).
- Elke opdracht loopt binnen een transactie van `mijnruimte_app` met `app.user_id` en `app.ruimte` uit de gecontroleerde tabbladpoort (`bordLade`), nooit uit het aanvraaglichaam.
- Bij het koppelen van een notitie aan een afspraak toetst de server dat zowel de notitie als de afspraak aan dezelfde eigenaar én dezelfde ruimte toebehoort; gegevens van een ander account of een andere ruimte worden geweigerd.
- Elke schrijfactie richting de agenda vereist uitdrukkelijke menselijke bevestiging (`bevestigd === true`) en een herhaalbestendige sleutel (`idempotentieSleutel`).
- Het beveiligingslogboek (`auditToevoegen`) legt uitsluitend samenhangs-ID's en actiecodes vast (`notitie.agenda.gekoppeld`, `notitie.agenda.afspraak_gemaakt`, `notitie.agenda.ontkoppeld`, `notitie.taak.aangemaakt`, `notitie.bestand.gekoppeld`, `notitie.bestand.ontkoppeld`) — nooit notitie-inhoud, bestandsnamen of geheimen.

## 3. Serverroutes van de Notities-brug

| Route | Doel | Beveiliging en herhaalbestendigheid |
|---|---|---|
| `POST /api/notities/koppelingen` | Ophalen van gekoppelde agenda-afspraken, aangemaakte taken, gekoppelde Opslag-bestanden en beschikbare afspraken in de ruimte | Sessie + `bordLade` + `FORCE RLS` |
| `POST /api/notities/agenda/koppel` | Tweerichtingskoppeling van een bestaande agenda-afspraak aan een notitie | `workspace.write` + `bevestigd: true` + `idempotentieSleutel` |
| `POST /api/notities/agenda/afspraak` | Nieuwe afspraak in de agenda aanmaken vanuit een notitie en direct koppelen | `workspace.write` + `bevestigd: true` + `idempotentieSleutel` |
| `POST /api/notities/agenda/ontkoppel` | Loskoppelen van een agenda-afspraak van een notitie | `workspace.write` + `bordLade` |
| `POST /api/notities/taak/maak` | Notitie of openstaande punten `- [ ]` omzetten naar ruimtetaken | `workspace.write` + bijwerken van de bordspiegel |
| `POST /api/notities/bestanden/zoek` | Eigen bestanden van de actieve ruimte in Opslag zoeken zonder bytes te lezen | Sessie + ruimtepoort van Opslag |
| `POST /api/notities/bestanden/koppel` | Verwijzing naar een eigen Opslag-bestand koppelen of loskoppelen | `workspace.write` + bijwerken van de bordspiegel |

## 4. Compatibiliteit bij terugdraaien naar een vorige uitgave

Migratie `0316_notities_agenda_brug.sql` voegt uitsluitend kolommen en één koppeltabel toe; er wordt niets verwijderd of hernoemd. De functievlag `notities-agenda-brug-v1` staat in de aanlegmigratie uit (`false, false`), en alle schrijfacties houden de spiegel in `app.mcp_console_items` synchroon. Bij terugdraaien naar een oudere uitgave blijven alle notities, taken en Opslag-bestanden onverminderd leesbaar.
