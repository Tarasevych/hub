> 🌐 **Taal / Мова:** [Українська](КОНСОЛІДАЦІЯ-КАЛЕНДАР.uk.md) · **Nederlands** | [Startpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Consolidatie van de dienst «Agenda» (`agenda-v3` · Tweerichtings-CalDAV, `.ics` en veilige sprongen)

## 1. Doel en architectuurgrenzen

De dienst «Agenda» (`hub.tarasevych.com/agenda`) brengt afspraken uit Google Calendar, `.ics`-abonnementen en externe `CalDAV`-agenda's (`RFC 4791`: Apple iCloud, Fastmail, Nextcloud) samen binnen één weergave, met strikte scheiding tussen de persoonlijke (`prive`) en technische (`technisch`) gegevensruimte.

Binnen deze consolidatie zijn vier kernmogelijkheden toegevoegd achter de functievlag `agenda-koppelingen-v1` (migratie `0315_agenda_koppelingen_vlag.sql`):

1. **Opbouwer van geldige iCalendar-bestanden (`RFC 5545`)** `bouwIcsGebeurtenis()` met UTF-8-regelvouwing op 75 octetten zonder meerbytes-tekens te breken en volledige kringloop-compatibiliteit met `ontleedIcs()`;
2. **Tweerichtingsschrijven naar externe CalDAV-agenda's** (`PUT` en `DELETE` met `If-None-Match: *` en `If-Match`, voorafgaande voorrechtcontrole via `current-user-privilege-set` en teruggave van de actuele serverversie bij een `412`-botsing);
3. **Eénkliks-uitvoer van elke afspraak naar een `.ics`-bestand** als zelfstandige overdracht of eerlijke uitweg bij alleen-lezen agenda's;
4. **Inhoudsloze snelle sprongen vanuit de afspraakkaart** naar berichten van een deelnemer in Post, de bijbehorende contactkaart in «Contacten en afzenders» en gekoppelde gespreksnotities.

## 2. Netwerkbeveiliging, rijbeveiliging en adresbescherming

- Alle uitgaande CalDAV-verzoeken (`PROPFIND`, `REPORT`, `GET`, `PUT`, `DELETE`) lopen uitsluitend via `pinnedFetch` (`backend/veilige-fetch.ts`): alleen `https:`, DNS-vastzetting tegen vervalste serververzoeken, geen automatische omleidingen, vaste tijdslimiet en bovengrens op antwoordgrootte.
- Elk doeladres van een `.ics`-item wordt getoetst door `caldavAbsoluut()`, dat enkel dezelfde host van het gekoppelde account (of een geldige `pNN-caldav.icloud.com`-partitiehost bij iCloud) toestaat.
- De tabellen `app.agenda_koppeling`, `app.agenda_abonnement` en `app.agenda_externe_gebeurtenis` draaien onder `ENABLE ROW LEVEL SECURITY` én `FORCE ROW LEVEL SECURITY` per eigenaar en ruimte.
- App-wachtwoorden voor CalDAV blijven versleuteld met `AES-256-GCM` en aanvullende geauthenticeerde gegevens per eigenaar, adres en ruimte (`aad`).
- Bij snelle sprongen van een deelnemer naar Post of Contacten **komt nooit een e-mailadres of afspraaktitel in de adresbalk terecht**:
  - de sprong naar berichten bewaart de zoekopdracht op de server en opent `/all?resume_context=1`;
  - de sprong naar de contactkaart maakt een eenmalig kortlevend kaartje `/contacts?contact_sprong=<uuid>` aan, dat direct uit de adresbalk wordt gewist en op de server eenmalig wordt ingewisseld binnen dezelfde eigenaar en ruimte.

## 3. Serverroutes van de geconsolideerde Agenda

| Route | Doel | Beveiliging en versiebeheer |
|---|---|---|
| `POST /api/owner/agenda/caldav/schrijf-proef` | Schrijfrecht op een CalDAV-collectie toetsen via `PROPFIND Depth:0` | `ladePoort('agenda')` + `calendar.write` + functievlag |
| `POST /api/owner/agenda/caldav/bewaar-item` | CalDAV-afspraak aanmaken of bijwerken via `PUT` met `If-None-Match` / `If-Match` | Herhaalbestendige sleutel + `412`-conflictafhandeling |
| `POST /api/owner/agenda/caldav/wis-item` | CalDAV-afspraak wissen via `DELETE` met `If-Match`-controle | Herhaalbestendige sleutel + bijwerken van spiegel |
| `POST /api/owner/agenda/afspraak/export-ics` | Geldig `.ics`-bestand (`RFC 5545`) opbouwen voor een gekozen afspraak | `ladePoort('agenda')` + inhoudsloze auditregel |
| `POST /api/owner/agenda/deelnemer/sprong` | Inhoudsloze sprong naar berichten of contactkaart van deelnemer voorbereiden | Eigenaarscontrole en ruimtescheiding |
| `POST /api/owner/agenda/deelnemer/sprong-lees` | Eenmalig inwisselen van een `contact_sprong`-kaartje voor het adres | Controle op eigenaar, ruimte en geldigheidsduur |
| `POST /api/owner/agenda/notities/lijst` | Gekoppelde gespreksnotities bij een afspraak in de actieve ruimte ophalen | `ladePoort('agenda')` + `FORCE RLS` |
| `POST /api/owner/agenda/notities/koppelen` | Bestaande of nieuwe gespreksnotitie met bevestiging aan afspraak koppelen | `workspace.write` + `bevestigd: true` + herhaalbestendigheid |
| `POST /api/owner/agenda/notities/ontkoppelen` | Notitie loskoppelen van een agenda-afspraak | `workspace.write` + `ladePoort('agenda')` |

## 4. Eerlijk gedrag bij weigeringen en compatibiliteit bij terugdraaien

Wanneer een externe CalDAV-server geen schrijfrecht verleent (`403` of ontbrekend schrijfrecht in `current-user-privilege-set`), meldt het scherm eerlijk dat de agenda alleen-lezen is en biedt het direct `.ics`-uitvoer aan. Is een afspraak intussen elders gewijzigd (`412 Precondition Failed`), dan overschrijft de server niets maar haalt zij de actuele versie op zodat de mens bewust kiest. Wordt de functievlag `agenda-koppelingen-v1` uitgezet, dan keren externe CalDAV-agenda's onmiddellijk terug naar de leesstand zonder verlies van koppelingen of gesynchroniseerde afspraken.
