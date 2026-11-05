> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./ADAPTERS-LOKAAL-TESTEN.uk.md) · [🇳🇱 **Nederlandse versie**](./ADAPTERS-LOKAAL-TESTEN.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Adapters lokaal testen (UI-013 fase 2)

De adapters in `backend/verbinding-adapters/` doen alleen **leescontroles** (WebDAV PROPFIND Depth 1, S3 ListObjectsV2, MQTT CONNECT→CONNACK→DISCONNECT). Ze schrijven niets extern en bewaren geen gegevens.

## Lokale servers (alleen testwaarden)
1. WebDAV + MQTT: een klein Node-script met `webdav-server` (poort 59100) en `aedes` (poort 59200), gebruiker `proef` / `proefwachtwoord`.
2. S3: `moto_server` (Python, poort 59300), emmer `ui013-proef` met `proef.txt`, sleutel `proef` / `proefgeheim`.
   - Eerlijk: moto controleert de SigV4-handtekening niet streng. De handtekening zelf is daarom apart getoetst met de officiële AWS-referentievector (eenheidstest `integraties-fase2`).
   - De huidige MinIO-download weigert S3-bewerkingen zonder licentie; daarom is moto gebruikt.

## Uitvoeren
```
WEBDAV_URL=http://127.0.0.1:59100/ WEBDAV_GEBRUIKER=proef WEBDAV_WACHTWOORD=proefwachtwoord \
S3_URL=http://127.0.0.1:59300 S3_EMMER=ui013-proef S3_ID=proef S3_GEHEIM=proefgeheim \
MQTT_POORT=59200 MQTT_GEBRUIKER=proef MQTT_WACHTWOORD=proefwachtwoord \
npx tsx tests/lokaal/verbinding-adapters-lokaal.ts
```
Verwacht: `8/8 geslaagd`. Stop de servers daarna via hun eigen pid (nooit `pkill` op patroon).

## Niet getest
Echte Nextcloud, echte MinIO/AWS (strenge handtekeningcontrole), MQTT over TLS met een echte broker in het LAN, Outlook/Graph (потребує ключів власника).
