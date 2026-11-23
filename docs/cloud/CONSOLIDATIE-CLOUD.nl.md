> 🌐 **Taal:** [Українська](КОНСОЛІДАЦІЯ-ХМАРА.uk.md) · **Nederlands**

# Consolidatie van Cloudopslag: vlaggen M4–M11, beveiligde WebDAV en overdrachtsregels

## 1. Doel en afbakening

Dit document beschrijft de consolidatie van Cloudopslag (taken **P-1..P-7** en **Z-13**, migratie `0317_cloud_bruggen_vlag.sql`):

1. Overgang van de serverbruggen voor externe aanbieders **M4, M5, M6, M8, M10 en M11** van handmatige omgevingsvariabelen `CLOUD_M*_STAGING` naar beheerde functievlaggen in `app.feature_flags`, met volledig behoud van achterwaartse compatibiliteit met omgevingsvariabelen voor eenheidstests.
2. Beveiligde koppeling van eigen **Nextcloud**- en **NAS**-opslag (Synology, QNAP, TrueNAS) via **WebDAV over HTTPS** per gebruikersruimte (`prive` of `technisch`).
3. Automatiseringsregels voor bestandsoverdracht tussen de eigen opslag en gekoppelde Google Drive ter vervanging van de statische aanduiding «gepland».

## 2. Register van functievlaggen (migratie 0317)

| Vlagsleutel | Servermodule | Voormalige omgevingsvariabele | Doel |
| --- | --- | --- | --- |
| `cloud-m4-koppelingen-v1` | `backend/cloud-verbinding-m4-routes.ts`, `backend/cloud-overdracht-credentials.ts` | `CLOUD_M4_CONNECTIONS_STAGING` | Beheer van meerdere OAuth-koppelingen (OneDrive, Dropbox, Box) |
| `cloud-m5-catalogus-v1` | `backend/cloud-m5-catalogue-routes.ts` | `CLOUD_M5_CATALOGUE_STAGING` | Inzien van de gereedheidscatalogus van externe cloudaanbieders |
| `cloud-m6-beheer-v1` | `backend/cloud-m6-beheer-routes.ts` | `CLOUD_M6_ADMIN_STAGING` | Beheerbeleid voor cloudaanbieders in het technisch profiel van de eigenaar |
| `cloud-m8-mappen-v1` | `backend/cloud-m8-routes.ts` | `CLOUD_M8_DIRECTORY_STAGING` | Uniform mappenoverzicht van gekoppelde opslag met versleutelde paginawijzer |
| `cloud-m10-beheer-v1` | `backend/cloud-m10-beheer-brug.ts` | `CLOUD_M10_ADMIN_STAGING` | Beheerbrug op `admin.tarasevych.com` met sterke bevestiging |
| `cloud-m10-omgeving-v1` | `backend/cloud-m10-runtime.ts` | `CLOUD_M10_STAGING_RUNTIME` | Luie samenstelling van de M8-mappenomgeving en M11-voorbeeldservice |
| `cloud-m11-voorbeeld-v1` | `backend/cloud-m11-voorbeeld-routes.ts` | `CLOUD_M11_PREVIEW_STAGING` | Beveiligde voorbeeldweergave van bestandsbytes met revisie- en somcontrole |
| `cloud-webdav-v1` | `backend/cloud-vnext-webdav.ts` | — | Beveiligde koppeling van Nextcloud en NAS via WebDAV (HTTPS) |

Conform **VLAG-001** worden alle nieuwe vlaggen geregistreerd met `aan = false, standaard = false`. Een functievlag verleent nooit toegangsrechten: controle van sessie, ruimte, eigenaarsrol, actief technisch tabblad en sterke bevestiging verloopt uitsluitend op de server.

## 3. Beveiliging van WebDAV-koppelingen (Nextcloud en NAS)

1. **Adreskeuring (`veiligWebdavAdres`):** uitsluitend `https://` op toegestane poorten (`443`, `5006`, `8443`), zonder ingebedde inloggegevens, zoekparameters of ankers. Lokale namen (`localhost`, `*.local`, `*.internal`, `*.arpa`) en alle niet-publieke IPv4- en IPv6-reeksen (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `::1`, `fc00::/7`, `fe80::/10`, inclusief IPv4-in-IPv6) worden onmiddellijk geweigerd.
2. **Netwerkafscherming (`pinnedFetch`):** elk `PROPFIND`-verzoek gebruikt DNS-vastzetting op de socket zelf tegen DNS-herkoppeling, met een tijdslimiet van 15 seconden, een bovengrens van 512 KB en volledige weigering van `3xx`-omleidingen.
3. **XML-bescherming:** declaraties `<!DOCTYPE` en `<!ENTITY` worden vóór het ontleden afgewezen, het antwoord doorloopt `ontleedDavXml` en elke `<d:href>` moet binnen dezelfde oorsprong en mapwortel vallen.
4. **Versleuteling en ruimte-isolatie:** toepassingswachtwoorden worden versleuteld via de sleutelkluis (`verzegel` / `ontzegel` in `backend/sleutelkluis.ts`) met AAD `cloud-webdav|<ruimte>|<userId>|<id>`, bewaard in `app.cloud_webdav_koppelingen` onder `ENABLE` + `FORCE ROW LEVEL SECURITY` en nooit naar de client of logboeken gestuurd.

## 4. Toetsing aan de 15 vragen van architectuur «Klimop» (KLIMOP-001)

- Geen nieuw enkel uitvalpunt of verborgen bevoegdheid: elke externe koppeling draait geïsoleerd per ruimte; een storing bij één aanbieder raakt de eigen opslag of andere koppelingen niet.
- Directe intrekbaarheid: loskoppelen van een WebDAV- of M4-account blokkeert vervolgaanroepen in die ruimte onmiddellijk.
- Veilig terugdraaien: uitschakelen van een vlag herstelt direct het vorige gedrag zonder verlies van opgeslagen gegevens.
