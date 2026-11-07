> 🌐 **Taal / Мова:** [Українська](МОНІТОРИНГ-ПОДІЙ-БЕЗПЕКИ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Logboek → uw SIEM (etappe E)

Elke regel in het beveiligingslogboek (`app.audit`) heeft nu drie contextvelden:

| Veld | Betekenis | Herkomst |
|---|---|---|
| `profiel` | actie uitgevoerd vanuit het **technisch profiel** (`tech-…`) dat actief is in dit tabblad | server, automatisch |
| `namens` | meekijken **namens** een gebruiker (ondersteuningsverzoek, alleen met toestemming) | ondersteuningsmodule |
| `ruimte` | werk**ruimte** waarop de actie betrekking heeft | actiegegevens (`workspaceId`) |

De velden staan in `details._ctx`, dus **onder dezelfde hashketen** als de hele regel: ongemerkt wijzigen kan niet.
Voor filters in de database zijn er afgeleide kolommen `ctx_profiel`, `ctx_namens`, `ctx_ruimte` (migratie 0039). Op de site worden zulke regels in het logboek
(«Agenten → Logboek») gemarkeerd met «TECH» (geel) en «namens» (rood).

## Export naar SIEM op dezelfde server

Standaard **uitgeschakeld**. Er gaat niets naar buiten: er zijn slechts twee bestemmingen, beide op deze machine.

1. **NDJSON-bestand** `/var/log/mijn-ruimte/audit.ndjson`: één JSON per regel. Dit wordt gelezen door de agent van uw SIEM (Wazuh agent,
   Promtail/Grafana Alloy, Vector, Fluent Bit). Map `2750`, groep `adm` (indien aanwezig), logrotate dagelijks, 30 dagen.
2. **Loki** via de push-API, **alleen** `http://127.0.0.1`, `localhost` of `[::1]`. Elk ander adres wordt geweigerd door zowel de installer als de site.
   Om het logboek naar een andere machine te sturen, plaatst u daar een agent die het bestand uit punt 1 leest.

### Inschakelen (als beheer, na installatie van deze release)
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --bestand
# of Loki op deze server:
sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --loki http://127.0.0.1:3100
# beide tegelijk; --vanaf-begin = ook de volledige bestaande historie (standaard alleen nieuwe regels)
sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --bestand --loki http://127.0.0.1:3100
```
De opdracht schrijft in `/etc/mijn-ruimte/siem.env` alleen `SIEM_…`-regels (root:mijnruimte, 0640) en herstart de site.

### Uitschakelen
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer siem uit
```
Verwijdert alleen `siem.env`. Bestaande bestanden in `/var/log/mijn-ruimte` blijven staan.

### Status
Technisch profiel met leesrecht op het logboek (Beheerder, Auditor, Eigenaar) → «Werkt er iets niet? Controle» → «Logboek en SIEM»:
hoeveel verzonden, hoeveel in de wachtrij, laatste fout. Elke bestemming heeft een eigen cursor: als Loki onbereikbaar is, loopt het bestand gewoon door.
Na herstel ontvangt Loki dezelfde regels zonder hiaten. Elke regel bevat `id` en `hash`, zodat het SIEM duplicaten herkent.

## Regelopmaak
```json
{"@timestamp":"2026-10-14T09:12:28.123Z","host":"mijn-ruimte-webserver","bron":"mijn-ruimte","id":"81234","seq":512,
 "hash":"…","prev_hash":"…","event":{"action":"owner.flags.gewijzigd","category":"beveiliging","outcome":"success"},
 "owner":"…","actor":"…","service":"mcp","device":"Chrome/Windows","ip_hash":"…",
 "profiel":"tech-3f9a1c0b7e2d","activatie":"…","namens":null,"ruimte":null,"details":{"sleutel":"nieuwe-editor","aan":true}}
```
Worden nooit geëxporteerd:
- velden die op geheimen lijken (`token`, `secret`, `password`, `key`, `code`, `cookie`, `ticket`, `signature`, `nonce`, `pkce` — ook genest);
- IP-adres in platte tekst (alleen de HMAC-hash, net als in het logboek zelf).

## Voorbeelden voor veelgebruikte SIEM-systemen
- **Wazuh agent** (`/var/ossec/etc/ossec.conf`):
  ```xml
  <localfile><log_format>json</log_format><location>/var/log/mijn-ruimte/audit.ndjson</location></localfile>
  ```
  De gebruiker `wazuh` moet in de groep `adm` zitten.
- **Promtail** (naar Loki): `job_name: mijn-ruimte`, `__path__: /var/log/mijn-ruimte/audit.ndjson`, `pipeline_stages: [json: {expressions: {action: event.action}}]`.
- **Loki rechtstreeks**: `--loki http://127.0.0.1:3100`; etiketten `app="mijn-ruimte"`, `bron="audit"`, `categorie=<type>`.
  Zoekopdracht: `{app="mijn-ruimte"} | json | profiel != ""` — acties vanuit een technisch profiel.

## Waarom zo
- Geen externe clouds (BYOS): export vindt uitsluitend op deze machine plaats; doorsturen is de keuze van de eigenaar en diens agent.
- Het logboek op de site blijft leidend (hashketen, verwijderen alleen via `audit_verwijderen`); het SIEM is een kopie voor zoeken,
  correlatie en opslag buiten de database van de site.
- Nieuwe velden veranderen `app.audit_hash` niet: oude en nieuwe regels worden op dezelfde manier gecontroleerd.
