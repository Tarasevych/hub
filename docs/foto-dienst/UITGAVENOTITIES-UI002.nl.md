> 🌐 **Taal / Мова:** [Українська](ПРИМІТКИ-ВИПУСКУ-УІ002.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Release-notities UI-002 — «Фото» en «Календар» in «Мій простір»

Datum: 29.10.2026 · Basis: mijn-ruimte-20261029-131639 · Migratie: 0153 · Niet uitgerold.

## Vlaggen (standaard UIT)
- `foto-dienst` — nieuwe fotodienst op hub/photos (UI + `/api/owner/foto/*`; UIT → API 404 `FOTO_DIENST_UIT`).
- `menu-kalender-foto-eigen` — Календар en Фото uit het cloudmenu naar «Мій простір»; cloud/calendar → hub/calendar, cloud/photos → hub/photos (behalve `?kiezer=1` voor de Google Photos-kiezer). Bestaande agenda wordt hergebruikt.

## Gebouwd en getest
- Tijdlijn per maand, albums (nieuw/hernoem/verwijder), collecties per bron en jaar, zoeken, filters + chips, favorieten, tags, verbergen.
- Exacte duplicaten (sha256) en gelijkende foto's (dHash), herkomst per bron gekoppeld i.p.v. dubbel opgeslagen.
- Kijker (portal): foto + video, toetsenbord/vegen, info (datum, bestand, herkomst, opslag/back-upstatus), download origineel, Web Share, eigen kopie controleren.
- Import: ZIP-archieven Google Takeout, Instagram, Facebook, Telegram, Flickr, generiek (VK/OK via generiek ZIP); losse bestanden; EXIF-datum/camera/GPS; metadata uit JSON-zijbestanden; mojibake-herstel.
- Indexeren van bestaande cloudbestanden (virtueel, met sha/EXIF voor ≤64 MB).
- Export ZIP met originelen; eigen kopie maken; «wissen» alleen voor eigen kopieën met bevestiging WISSEN. Nooit wissen bij externe diensten.

## Alleen ontworpen / niet gebouwd
Kaartweergave, gezichtsherkenning, externe deellinks, live Drive/OneDrive/Dropbox/WebDAV, server-miniaturen voor HEIC/RAW/video, streaming >64 MB. ZIP-import houdt media in browsergeheugen. Geen synchronisatie beloofd.

## Tests
- Eenheid: `foto-dienst-20261029` 54/54. Volledige suite: zie rapport (vooraf bestaande fouten, ook op basis).
- E2E (lokaal, Chrome): `scripts/lokaal-e2e/foto-dienst-ui.mjs` 24/24.
- `NODE_ENV=production npm run build` exit 0. Migraties op lege DB t/m 0153 OK.
