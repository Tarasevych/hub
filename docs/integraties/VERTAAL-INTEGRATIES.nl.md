> 🌐 **Taal:** [Українська](ІНТЕГРАЦІЯ-ПЕРЕКЛАДУ.uk.md) · **Nederlands** | [Documentatie-index](../INDEX.nl.md)

# Veilige integratie van vertaaldiensten (`UPD-012`)

## 1. Ondersteunde diensten

Via de integratiecatalogus (`/mappen`) en gedeelde motoren (`ai → Verbindingen`) worden ondersteund:
- **Google Translate (Cloud Translation API v2)** — sleutel versleuteld in `owner_vault_v1`, opschoning van trackers en geheimen vóór verzending.
- **DeepL (`api-free.deepl.com` / `api.deepl.com`)** — behoud van HTML-opmaak (`tag_handling`), sleutel via `Authorization: DeepL-Auth-Key`.
- **LibreTranslate** — eigen of gedeelde server (`POST /translate`) zonder doorgifte aan derden.
- **Eigen beveiligde vertaalknoop** — eigen HTTPS-eindpunt in het netwerk van de eigenaar.

## 2. Vier privacymodi (`privacyModus`)

1. `lokaal-alleen` — uitsluitend lokale browser-AI; externe aanroepen zijn geblokkeerd.
2. `eigen-server` — alleen eigen servers (`LibreTranslate`, `Ollama`, eigen vertaalknoop).
3. `extern-gezuiverd` *(standaard voor externe diensten)* — vooraf opgeschoond met `stripTrackingAndSecrets` (trackers, codes en geheime tokens verwijderd).
4. `extern-volledig` — volledige vertaling via externe dienst uitsluitend met uitdrukkelijke toestemming gekoppeld aan `akkoordSleutel` (elke wijziging van adres, aanbieder of privacymodus laat bestaande toestemmingen direct vervallen).

## 3. Sleutelbeveiliging

Sleutels worden nooit onversleuteld opgeslagen: opslag verloopt via `owner_vault_v1` (`AES-256-GCM`) met beveiligde invoer (`GeheimInvoer`) en zonder toegang voor AI (`data-ai-geen-actie`).
