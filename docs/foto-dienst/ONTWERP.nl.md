> 🌐 **Taal / Мова:** [Українська](ПРОЄКТ-ФОТОСЛУЖБИ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# UI-002 — «Фото» en de verhuizing van «Календар»/«Фото» naar «Мій простір»

## 1. Inventaris (basis 131639)
- «Мій простір» (hub) had al een tabblad **calendar** (`src/App.tsx` → `src/agenda/*`, agenda v3). Er is dus geen tweede kalender
  nodig: de verhuizing is alleen menu + doorverwijzing.
- «Хмарне сховище» had tabbladen **calendar** en **photos** (`src/cloud-vnext/onderdelen/AgendaFotos.tsx` en de oude
  `CloudFunctioneelWeergave`), beide schil om `src/GoogleSuiteMediaWeergave.tsx`.
- Google Photos: alleen de officiële **Picker API** (`backend/google-suite-agenda-fotos.ts`), die gekozen beelden in de cloud
  (`cloud_items_v1`) bewaart. Volledig lezen van een Google Photos-bibliotheek kan voor derden niet meer (Google, 31.03.2025).
- Bestandsopslag: `server/platform/opslag.ts`; cloudrecords `cloud_items_v1`; lades (prive/technisch) via `backend/ruimte-cloud-agenda.ts`.
- `fflate` zit al in de afhankelijkheden (ZIP lezen/schrijven in de browser).
- UFW-bestanden (src/DriveBrowser.tsx, src/bestand/*, integrations/…) zijn NIET aangeraakt.

## 2. Vlaggen (migratie 0153, beide standaard UIT)
| vlag | AAN | UIT |
|---|---|---|
| `menu-kalender-foto-eigen` | cloudmenu zonder Календар/Фото; hub krijgt «Фото»; `cloud/calendar` → `hub/calendar`, `cloud/photos` → `hub/photos` (behalve `?kiezer=1`, de Google-kiezer) | menu zoals nu |
| `foto-dienst` | hub/photos = de nieuwe fotodienst; server-API `/api/owner/foto/*` open | API antwoordt 404 `FOTO_DIENST_UIT`; tabblad verborgen |

Menu: `paginaVerborgen()` (src/foto/foto-vlaggen.ts) filtert in `CanoniekOmlijsting` (menu v2), in de tabbladen van
`VerenigdDienstApp` (cloud) en in de mobiele «Ще»-lijst van `CloudPagina`. `hub/photos` staat in `MENU_PAGINAS` en
`public/canonical-service.js` (de route moet bestaan), maar is verborgen zolang beide vlaggen UIT staan.

## 3. Model
Items (geen nieuwe tabellen): `foto_media_v1`, `foto_albums_v1`, `foto_import_v1`. Bytes: bestaande opslag, pad
`<cloudvoorvoegsel>/foto-<uuid>.<ext>`. Twee soorten items:
- **eigen** — kopie op deze server (upload, archiefimport, of «Зберегти власну копію» van een cloudfoto);
- **cloud** — virtueel: verwijst naar `cloud_items_v1`, geen kopie. Beschikbaarheid volgt de cloud (prullenbak = niet beschikbaar).

Eén inhoud = één item (sha256). Een tweede import van dezelfde bytes schrijft alleen **herkomst** bij (bron, pad, archief, tijd),
voegt albums toe en vult ontbrekende metadata aan; overschrijft nooit.

## 4. Bronnen — eerlijk per bron (wat vandaag in de code zit)
| bron | vandaag | niet beloofd |
|---|---|---|
| Mijn Ruimte (upload) | live | — |
| Хмарне сховище | live (virtueel, EXIF en sha door de server gelezen bij indexeren, ≤64 MB, ≤300 per keer) | — |
| Google Photos | kiezer (bestaande Picker → cloud → Фото) + Takeout-import (datum, plaats, beschrijving, albums uit JSON) | automatische synchronisatie van de hele bibliotheek (Google staat dat niet toe) |
| Google Drive | Takeout/ZIP/map | live indexeren via bestaande Google-koppeling: gepland |
| OneDrive, Dropbox | map/ZIP | live: gepland (sleutels van de eigenaar nodig) |
| iCloud | archief (privacy.apple.com) | live: geen publieke API |
| Nextcloud, NAS | map/ZIP | WebDAV/SMB: gepland |
| Instagram, Facebook | archief (JSON-export, Meta-mojibake hersteld) | API voor persoonlijke accounts bestaat niet meer |
| Pinterest, archieven van sociale media | archief/map (album = mapnaam, datum uit EXIF) | API: gepland/niet |
| Flickr | archief (titel, datum, tags, albums, geo) | API: gepland |
| Telegram | Desktop-export JSON (chat = album, datum, tekst) | — |

## 5. Import (browser)
`src/foto/foto-import.ts`: ZIP (stromend uitgepakt), map (`webkitdirectory`) of losse bestanden → archief herkennen →
metadata uit sidecars → EXIF → miniatuur ≤24 KB + dHash (canvas) → sha256 → `begin` (al bekend? klaar) → stukken van 4 MB → `klaar`.
Beperking: bij ZIP blijven de uitgepakte media tot hun upload in het geheugen; grote archieven (>2 GB) beter uitpakken en als map importeren (de UI zegt dat).

## 6. Veiligheid
- Geen enkele schrijfweg naar een externe dienst. «Прибрати з бібліотеки» = ontkoppelen (cloudbestand blijft).
- Een eigen kopie kan niet «ontkoppeld» worden (anders weesbestand); wissen vraagt het woord `WISSEN` en raakt alleen de eigen kopie.
- Alles per lade; dubbele `hoortBij`-controle; server-poort op de vlag.

## 7. UI
Segment: Стрічка · Альбоми · Джерела · Упорядкувати. Zoekveld + één knop «Фільтри» (jaar, maand, bron, soort, formaat, camera,
van/tot, volgorde, обране, з місцем, без дати, приховані), actieve filters als chips. Tijdlijn per maand, tegels 1:1, selectie
(vinkje, rechtsklik) met balk: обране, альбом, експорт ZIP (originelen + metadata.json), власні копії, приховати.
Viewer op volledig scherm (pijlen, veeg, Esc), paneel «Про файл»: datum + waar die vandaan komt, camera, plaats (OSM-link),
herkomst, bewaring/back-up, albums, tags.

## 8. Gepland (niet gebouwd)
Kaartweergave, gezichten/objecten (AI), deellinks naar buiten (nu: Web Share van het apparaat en ZIP-export), live koppelingen
Drive/OneDrive/Dropbox/WebDAV, server-miniaturen voor HEIC/RAW/video (nu: icoon), stromende download >64 MB.
