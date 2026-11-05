> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261030-AFSTEMMING-UI014.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261030-AFSTEMMING-UI014.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# UI-014 "Afstemming / Productontwikkeling" (Afstemming vNext) — 30-10-2026

Featureflag: `afstemming-vnext` (migratie `0197` — alleen de rij voor de vlag). AAN → nieuwe kaartenbak op
`api.tarasevych.com/afstemming`; UIT → oude "Matrix van feitelijke implementatie" zonder enige wijziging (de 25 claims daarvan
staan nu in één bronbestand `backend/waarheid-claims.ts`, waaruit zowel de oude pagina als de migratie lezen).
De pagina blijft achter het technische profiel, er zijn geen nieuwe canonieke tabbladen — geen wijzigingen in de registers.

## Wat is het
Een levende kaartenbak voor productontwikkeling volgens bestek UI-014: één identificatie begeleidt een idee door de volledige cyclus
"vastgelegd → … → bevestigd op productie → geaccepteerd", met een eerlijke scheiding tussen "code geschreven / uitgerold /
werkt / door eigenaar geaccepteerd". Acht onderdelen: Overzicht, Kaartenbak, Relatiekaart, Controles, Releases, Mogelijkheden,
Geschiedenis en Bronnen.

## Belangrijkste eigenschappen
- **Twee statusassen**: levensfase en feitelijke bruikbaarheid zijn niet onderling inwisselbaar; voortgang wordt uitsluitend met tellers (`AC n/m`) weergegeven,
  zonder verzonnen percentages.
- **Append-only geschiedenis**: gebeurtenissen worden niet gewijzigd en verdwijnen niet; revisies met diff tussen willekeurig welke twee versies; optimistische
  versiebescherming (409 met weergave van de nieuwste kaart — niets wordt stilzwijgend overschreven).
- **Bewijs is de enige weg omhoog**: een criterium wordt pas `passed` met bewijs; `production_verified` alleen met
  productiebewijs; `accepted` pas na `production_verified`; een agent kan voorstellen doen en bewijs toevoegen,
  maar niets goedkeuren (`AGENT_MAG_NIET`).
- **25 legacy-claims** migreren automatisch met herkomst `waarheid-matrix-26.10.2026` en ZONDER opwaardering
  van de bewijskracht (`confirmed` zonder QA → eerlijk "onbekend").
- **Drie manieren van toevoegen**: tekst (het ruwe idee blijft behouden), bestand `.json`/`.md`/`.txt` met voorbeeldweergave,
  idempotentie (herhaalde import maakt geen duplicaat) en een lijst van vergelijkbare kaarten; HTTP-API voor agenten (`voorstel`/`bewijs`/
  `koppel stel-voor`) met actor-audit.
- **Relaties en conflicten**: 11 typen; kandidaten (lexicaal+graaf) zijn uitsluitend voorstellen, zonder auto-merge; het besluit
  van de eigenaar wordt vastgelegd als `Besluit` + gebeurtenis.
- **Releases**: worden read-only gelezen uit de echte installatiegeschiedenis (`app.uitrol_runs`); koppeling van kaarten;
  de postflight vermeldt eerlijk "uitgerold ≠ bevestigd", met regressies apart. Niets voert vanaf hier een uitrol uit.
- **Statische inventaris**: tabbladen/vlaggen/routes van de site zelf vergeleken met de kaarten → "functie zonder kaart"
  (met één klik een concept) en "kaart zonder spoor".
- **Mogelijkheden**: naslagwerk voor de gebruiker; "geverifieerd" alleen met productiebewijs (of legacy-beoordeling van de eigenaar).
- **Relatiekaart**: SVG-graaf (deterministische lay-out, zoom/pan/filters, toetsenbordtoegang), minikaart →
  doorklikken naar detail zonder contextverlies.
- Tweetalig `uk`/`nl`, 320–1440 px licht/donker, onderste balk op telefoon, details op volledig scherm.

## Eerlijk niet gedaan (in de UI aangeduid als "gepland")
MCP-wrappers `afstemming.*` (het agentpad loopt vandaag via de HTTP-API van de kaartenbak); semantisch zoeken op gelijkenis
(nu lexicaal+graaf); diff-analyse van een release voor "niet-geregistreerde wijzigingen" (het veld bestaat en is eerlijk leeg); live
read-only-probes op productie; AI-ontleding van ideetekst (de mens bepaalt de structuur); audio/video/afbeeldingen bij import;
volledige gebeurtenissenstroom van alle kaarten in één verzoek (nu: laatste gebeurtenissen + volledige geschiedenis van elke afzonderlijke kaart).

## Tests
Unit 266 (`kern` 68, `koppel` 61, `ui` 74, `zvirka` 63) + **e2e 44/44** (scenario's §14 van het bestek: vlag, legacy-25 zonder
promotie, idee→kaart, import met preview en idempotentie, revisie+diff+409, conflict+besluit eigenaar,
bewijs-gates voor criteria en fasen, echte release+postflight "niet bevestigd", graaf, scan→concept, mogelijkheden
"niet geverifieerd", rapport zonder percentages, geschiedenis, `nl`, 5×2 formaten/thema's) — 3 runs op rij stabiel.
Regressie: `cloud` 50/50, `huis` 49/49, `notities` 39/39, `agenda` 101/101; alle build-gates ok; `tsc` basis 3/20.

## Terugdraaien
Vlag UIT → direct terug naar de oude matrix; migratie 0197 voegt alleen een rij toe. Kaartgegevens blijven bewaard in
`app.records` (`afstemming_*_v1`) en wachten op een volgende inschakeling.
