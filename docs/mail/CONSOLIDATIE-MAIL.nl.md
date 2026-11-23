# Consolidatie van de postdienst · Mijlpaal M3

[Читати українською](КОНСОЛІДАЦІЯ-ПОШТА.uk.md)

**Werkadres van de dienst — `mail.tarasevych.com`.** Dit document beschrijft de afgestemde werking van vier onderdelen van Post binnen de geconsolideerde uitgave van Mijn Ruimte: de bijlageviewer met drie weergavestanden, de beveiligde dienstbruggen naar aangrenzende diensten, de werkelijke status van vertaalmotoren en de postaanbieder Fastmail.

## 1. Drie onderling verenigbare standen van de bijlageviewer

Post ondersteunt het gelijktijdig inschakelen van de functievlaggen `bijlage-weergave-gedeeld-v1` en `bijlage-viewer-v2` zonder dat de ene weergave de andere verdringt. Conform het architectuurbesluit van de eigenaar opent standaard de gedeelde bijlageviewer, terwijl de gebruiker op elk gewenst moment via het menu met aanvullende handelingen van kopweergave kan wisselen:

| Weergavestand | Moduscode | Doel en gedrag |
| --- | --- | --- |
| Gedeelde weergave | `gedeeld` | Standaardweergave wanneer `bijlage-weergave-gedeeld-v1` actief is. Biedt vertrouwenscontrole op de afzender, weergave binnen een zwevend leesvenster, zoeken en tekstherkenning in bijlagen en donkere documentpagina’s |
| Compact paneel v2 | `v2` | Beschikbaar wanneer `bijlage-viewer-v2` actief is. Toont de compacte adaptieve werkbalk `BijlageV2Kop` en activeert de PDF-context van versie 2 |
| Klassiek | `klassiek` | Altijd beschikbare terugvalweergave met de oorspronkelijke werkbankkop en behoud van alle functies voor bewerken, ondertekenen, afdrukken en downloaden |

De gekozen stand wordt lokaal bewaard onder de sleutel `tsv:bijlage-weergave-modus` en direct tussen geopende tabbladen gesynchroniseerd via de gebeurtenis `mr:bijlage-weergave-modus`. Vanuit alle drie standen kan de gebruiker tevens rechtstreeks een notitie uit de geopende bijlage aanmaken.

## 2. Dienstbruggen zonder inhoud in de adresbalk

Vanuit het contextpaneel van een geopend bericht, vanuit het blok met gevonden actiepunten en vanuit de bijlageviewer kan de gebruiker een gestructureerde handeling doorzetten naar aangrenzende diensten binnen dezelfde geïsoleerde gegevensruimte (`prive` of `technisch`). Geen enkele route plaatst onderwerp, afzender of berichttekst in de adresbalk: de browser verstuurt de gegevens via een beveiligd `POST`-verzoek en ontvangt uitsluitend een ondoorzichtige verwijzing terug.

| Handeling in het bericht | Serverroute | Doeldienst en beveiligingsgrens |
| --- | --- | --- |
| Naar Notities | `POST /api/owner/mail/bruggen/notitie` | Maakt een notitie in `app.notities` en bijbehorende bordspiegel aan; geeft een veilige verwijzing `hub.tarasevych.com/notities?open_item_id=<uuid>` terug |
| Naar Taken / Afstemming | `POST /api/owner/mail/bruggen/taak` | Maakt een taak in `app.mcp_console_items` binnen dezelfde ruimte aan of verwijst veilig naar `api.tarasevych.com/afstemming` |
| Naar Agenda | `POST /api/owner/mail/bruggen/agenda` | Legt via `gebeurtenisAanmaken` een afspraak vast wanneer `calendar.write` aanwezig is; meldt eerlijk wanneer schrijftoegang tot de agenda ontbreekt |
| Klantkaart | `POST /api/owner/mail/bruggen/klantkaart` | Zoekt bij ingeschakelde vlag `klantrelatiebeheer-v1` en geopende gegevenssleutelkluis de afzender op of maakt een versleutelde `dek1.`-kaart in `app.klantrelatieboek`; geeft bij gesloten kluis status `423` met ontgrendelverwijzing terug |

De herhaalbestendigheidstabel `app.mail_dienstbruggen` (migratie `0313_mail_bruggen_vlag.sql`) wordt afgedwongen met `ENABLE ROW LEVEL SECURITY` en `FORCE ROW LEVEL SECURITY` op zowel gebruikers-ID (`app.user_id`) als ruimte (`app.ruimte`). Een herhaalde klik met dezelfde opdrachtsleutel levert het eerder aangemaakte doel-ID op zonder duplicaten. In het beveiligingslogboek worden uitsluitend actiecodes en doel-ID’s vastgelegd, nooit berichtinhoud.

## 3. Eerlijke status van vertaaldiensten

De catalogus van vertaalmotoren in `shared/ai-vertaling.ts` en de serverroute `POST /api/owner/mail/ai-vertaling/state` leiden de status van elke motor af uit daadwerkelijk aanwezige koppelingen:

- **LibreTranslate** (`libretranslate`), **Google Cloud Translation** (`google-vertaling`), **Microsoft Azure AI Translator** (`microsoft-vertaling`) en **DeepL** (`deepl`) staan op `aansluiten` («Koppelen vereist») zolang de gebruiker nog geen eigen sleutel in de sleutelkluis heeft opgeslagen en nog geen akkoord heeft gegeven op een actieve gedeelde motor in `app.ai_dienst_motoren`.
- De adapter `vertaalMicrosoftTranslateReeks` in `backend/vertaal-adapters.ts` ondersteunt het officiële Microsoft Translator v3-protocol (inclusief regionale Azure-sleutels), controleert vóór elk netwerkverzoek `VertaalPrivacyModus`, weigert externe verzending in `lokaal-alleen` en `eigen-server` en verwijdert toegangssleutels, wachtwoorden en IBAN-nummers in `extern-gezuiverd`.

## 4. Postaanbieder Fastmail

Aan het centrale overzicht `shared/mail-aanbieders.ts` is **Fastmail** toegevoegd (`imap.fastmail.com:993` en `smtp.fastmail.com:465` met verplichte TLS-versleuteling en een afzonderlijk app-wachtwoord). Het app-wachtwoord wordt gezuiverd van stuurtekens en uitsluitend met AES-256-GCM versleuteld bewaard, cryptografisch gebonden (`mailImapAad`) aan gebruiker, koppelrij en gegevensruimte (`prive` of `technisch`).
