> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261029-CLOUD-VNEXT.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261029-CLOUD-VNEXT.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Cloud vNext — modernisering van de clouddienst (29-10-2026)

Featureflag: `cloud-vnext` (migratie `0130_cloud_vnext.sql` — alleen de rij voor de vlag, raakt geen gegevens aan).
Vlag AAN → nieuwe pagina in dezelfde canonieke schil; UIT → oude pagina zonder enige wijziging.
Beide lezen dezelfde items (`app.records: cloud_items_v1` + nieuwe collectie `cloud_mappen_v1`, bytes via
`server/platform/opslag.ts`) — in- en uitschakelen kan op elk moment veilig gebeuren.

## Wat is er nieuw (achter de vlag)

**"Mijn bestanden" — volwaardig bestandsbeheer.** Mappen (tot 12 niveaus), kruimelpad, tegel-/lijstweergave,
sorteren, filters op type (13 typen), tags, favorieten en ruimte; meervoudige selectie; slepen naar een map
en naar het kruimelpad + verplaatsen via mapkeuze; contextmenu; detailpaneel met voorbeeldweergave, hernoemen,
tags en versies. Prullenbak: zachte verwijdering voor 30 dagen, herstellen, definitief verwijderen alleen na expliciete bevestiging.
Versies: het vervangen van een bestand met dezelfde naam bewaart de eerdere inhoud (tot 20 versies) met herstel- en downloadmogelijkheid.
Uploaden in blokken van 4 MiB (bestanden tot 64 MiB) met sha-256-controle, uploadwachtrij en annuleren;
downloaden tot 32 MiB. Lijsten worden gepagineerd gelezen — de oude limiet van 100 items is in het nieuwe gedeelte opgeheven.

**Overzicht.** Live tellers (bestanden, omvang, favorieten, prullenbak), verdeling per type, recente en favoriete bestanden,
snelle acties. Geen verzonnen cijfers — uitsluitend afkomstig uit de echte backend.

**Integratiecentrum — eerlijk.** 12 aanbieders met hun werkelijke status van vandaag:
- **werkt**: Google Drive (lezen+schrijven, multi-account), Google Photos (officiële Picker), Gmail-bijlagen;
- **sleutels van eigenaar vereist**: OneDrive, Dropbox, Box — de code is aanwezig (M4), de kaart toont een checklist van env-sleutels
  (live ✓/✗ vanaf de server); zonder sleutels is er eerlijk geen koppelknop;
- **gepland**: Nextcloud, pCloud, MEGA, NAS (WebDAV);
- **onmogelijk vanuit het web**: iCloud Drive, Proton Drive — met uitleg en een eerlijke omweg.
Live statusblok: Google-accounts, achtergrondsynchronisatie, tokenversleuteling. Monogrammen in plaats van externe merklogo's.

**Zoeken.** Echte `/api/owner/zoek` (eigen bestanden + Drive-projectie, OCR-index), markering van treffers,
eerlijke lege statussen. **Snel opslaan** (notitie/link/bestand) en **werkruimtes** — op de oude,
beproefde routes. **Agenda/Foto's** — dezelfde Google-weergaven, zonder dubbele implementatie.

**Mobiele modus.** Onderste balk (Overzicht/Bestanden/Zoeken/Integraties + "+" voor snel opslaan + "Meer"),
tikdoelen ≥44 px, details op volledig scherm, 320–1440 px zonder horizontale scroll, licht/donker thema.

## Slimme overdrachten (tweede golf, 29-10-2026, bovenop tussentijds archief 121947)

**Bestendigheid.** Een uploadsessie leeft op de SCHIJF van de server (`.vnext-sessies/`): een herstart van de server, een gesloten
tabblad of een netwerkonderbreking betekent geen verlies, maar een pauze. Hervatten gebeurt precies vanaf de ontbrekende blokken (`status`/`zoek`);
na het herladen van de pagina volstaat het om hetzelfde bestand opnieuw te kiezen — alleen de ontbrekende blokken worden nagehaald
(geverifieerd met een end-to-end-test in een echte browser: onderbreking → automatische herhaling; pagina herladen → 1 van de 3 blokken nagehaald).

**Snelheid.** Blokken van 4 MiB lopen via 3 parallelle stromen en in willekeurige volgorde; sha-controle en opslag
op de server werken streaming (een groot bestand wordt nooit in zijn geheel in het geheugen gehouden).

**Achtergrondverwerking.** Overdrachten tussen diensten (eigen opslag ↔ Google Drive) zijn achtergrondtaken op de server
(`cloud_taken_v1`): u kunt direct verder werken terwijl het paneel "Overdrachten" eerlijk de voortgang toont; "verplaatsen"
verwijdert de bron pas NA een geslaagde schrijfactie naar het doel. Pauzeren/hervatten/annuleren; automatische herhaling met oplopende
wachttijd; status "wachten op netwerk" met automatische hervatting zodra de verbinding terugkeert.

**Grenzen — uitsluitend vanuit de echte bron.** Eigen opslag: de enige grens is de vrije schijfruimte (eerlijke `SCHIJF_VOL`
met cijfers; padplafond 32 GiB). Google Drive: 5 MB per keer is de grens van ONZE serververpakking (niet van Google,
dat tot 5 TB accepteert; ruimere grenzen zijn gepland via de resumable-API) — en dat vermelden de kaart en de preflight ook zo.
Past een bestand niet → het venster legt uit WIENS grens is geraakt en WAT u kunt doen (comprimeren, opsplitsen, andere dienst).
Gefaseerd downloaden (delen van 4 MiB met retries) — bestanden groter dan 32 MiB lopen niet langer vast op een antwoord-in-één-stuk.

**Rebase.** Alles is opgebouwd bovenop uw tussentijdse archief `20261029-121947` (mailmenu, hub-menu,
basis `114141`); conflicten zijn opgelost ten gunste van de tussentijdse wijzigingen van de eigenaar.

## Opgeloste fouten (buiten de vlag om, crash-fixes)

De base64-regex `(?:[A-Za-z0-9+/]{4})*` veroorzaakte een V8-stackoverflow bij inhoud vanaf ~4–8 MB
("Maximum call stack omvang exceeded") op drie plekken: de nieuwe uploadroutering,
**`server/platform/opslag.ts` (een oude bug — precies deze beperkte voorheen de oude uploads)** en
`backend/cloud-m5-github.ts`. Vervangen door een lineaire controle met exact dezelfde reeks toegestane tekens;
regressietest 2×4 MiB + download van 8 MiB byte-voor-byte.

## Tests

- Unit (704 groen samen met e2e): `cloud-vnext` backend 53, UI 74, integratiecatalogus 84, zoeken 31;
  registers `menu-v2` 35, `werkblad` 34, `menu-indeling` 32, `hub-agenda` 65; opslag `m9` 10, `overdracht` 25+26.
- E2E in een echte browser: **`cloud-vnext` 46/46 (nieuw)**, `huis` 49/49, `notities` 39/39, `agenda` 101/101.
- Bekend-oud (vóór deze wijzigingen): 1 controle in `vlaggen` (53/54) en 2 `.mjs`-sets (`m5`/`m10`) die in de testomgeving
  een globale `typescript` missen — treedt in productie niet op.

## Eerlijk niet gedaan / grenzen

- OneDrive/Dropbox/Box: worden pas actief na het instellen van de sleutels van de eigenaar (`env`) — controleer de live checklist in het centrum.
- Gedeelde toegang (buiten het bestaande Drive-delen), automatiseringen en een aparte back-up-UI zijn gepland en
  in de interface ook zo aangeduid; niets doet alsof het al klaar is.
- Uploadsessies worden in het geheugen van één proces bijgehouden (net als de rest van het platform — één proces per server).
- iCloud Drive en Proton Drive hebben geen publieke API's voor websites — de kaarten melden eerlijk "onmogelijk" met een omweg.

## Terugdraaien

Schakel de vlag `cloud-vnext` uit (de oude pagina keert onmiddellijk terug, gegevens zijn gedeeld) of installeer
de vorige release. Migratie 0130 voegt alleen de vlagrij toe — terugdraaien is veilig.
