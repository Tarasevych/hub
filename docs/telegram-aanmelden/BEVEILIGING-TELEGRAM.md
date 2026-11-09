# Beveiliging — Aanmelden en bevestigen via Telegram (TELEGRAM-AANMELDEN v1)

Basis: uitgave 20261109-105221 (vastlegging 22742811). Vlag `telegram-aanmelden-v1` (migratie 0201), **standaard UIT**.
Taal van de site en de bot: alleen **Oekraïens (uk)** en **Nederlands (nl)**.

## 1. Dreigingsmodel en antwoord

| Dreiging | Maatregel |
|---|---|
| Iemand koppelt zijn eigen Telegram aan uw account | Koppelen vraagt een **extra bevestiging met toegangssleutel** op de site; de bot vraagt het **eigen telefoonnummer via `request_contact`**. Een getypt nummer of het contact van iemand anders (`contact.user_id ≠ from.id`) wordt geweigerd. Daarna ziet u de **volledige identiteit** (nummer, @gebruikersnaam, naam, Telegram-ID, foto) en bevestigt u met vinkje + aftelling + toegangssleutel. |
| Telegram-account gekaapt (sim-swap, sessiediefstal) | Een kaper verandert eerst gebruikersnaam/naam/foto/nummer. Elke afwijking van de bij het koppelen vastgelegde **vingerafdruk** zet de koppeling op **«призупинено»/gepauzeerd**: geen aanmelden, geen bevestigen. «Так» in Telegram alléén heft dat **nooit** op; daarvoor is de site + toegangssleutel nodig (actie `wijziging-bevestigen`, minimum toegangssleutel). Ander **telefoonnummer = opnieuw koppelen**. Afwijkend Telegram-ID = vervalsing → koppeling uit + melding. Geen antwoord binnen 24 u → koppeling uit. |
| Gekaapte Telegram gebruikt om verder te komen | Gevoelige acties (koppelen/ontkoppelen, rechten, aanmeldmethoden, telefoon, e-mail/wachtwoord, geheime code, bevestigingstabel, betalingen, beheerinstellingen, botsleutel) hebben **minimum toegangssleutel**: de tabel kan daar nooit «alleen Telegram» kiezen (op de server én in de interface, `keuzeToegestaan`). |
| «Ja» en «Nee» tegelijk | **«Ні» wint altijd**, ongeacht volgorde of kanaal; het conflict wordt aan de eigenaar getoond («Ні» діє одразу й завжди переважає). |
| Per ongeluk/automatisch tikken | «Так, це я»-knoppen pas actief na een **aftelling** (standaard 5 s; 10 s + vinkje bij ernstige wijzigingen/nieuw apparaat). Afgedwongen **op de server** (`aftel_sec` per knop; te vroeg = melding, geen claim) én zichtbaar (⏳ in de knop). |
| Dubbele tik / herhaalde updates | Knoppen zijn eenmalig: HMAC-ondertekend, claim `nieuw→bezig→klaar` in één SQL-update. `update_id` wordt ontdubbeld (`tg_updates`). In de browser: `useEenmalig`. |
| Vervalst terugroepverzoek | Geheime kop `X-Telegram-Bot-Api-Secret-Token`, tijdconstante vergelijking; zonder geldig geheim: 401 en niets verwerkt. Groepen/kanalen worden genegeerd (bot: groepen verboden, privacymodus aan). |
| Vervalste gegevens uit het aanmeldvenster | HMAC-SHA256 met SHA256(botsleutel), alleen de bekende velden, `auth_date` ≤ 5 min oud, tijdconstante vergelijking. Het aanmeldvenster alleen in **omleidingsmodus** op een eigen minipagina met een smalle CSP (alleen `telegram.org`). |
| Statusvraag door een ander tabblad/apparaat | Aanmeldstatus alleen met het **geheim van het eigen verzoek** (gehasht opgeslagen). |
| Brute force geheime code | scrypt-hash met pepper; pauze na 3 fouten (15 min), uit na 5 (herstel alleen met toegangssleutel). Sterktemeter weigert reeksen, herhalingen, telefoonnummer-delen. |
| Dwang | Optionele **alarmcode**: wordt «aanvaard» zonder waarschuwing, maar opent níets en alarmeert de eigenaar. |
| Lek van de botsleutel | Sleutel wordt **nooit gevraagd** (niet door agenten, documentatie of bot). Alleen de eigenaar voert hem in het beheerpaneel in (toegangssleutel); direct in de versleutelde eigenaarskluis (AES-256-GCM), invoerveld wordt gewist, **nooit getoond**, gelogd of geaudit (hoogstens «aanwezig» + publiek bot-ID). Wissel zonder onderbreking: nieuwe sleutel eerst bij Telegram gecontroleerd, pas daarna actief. |
| Verkeerde bot | «Налаштувати бота» vergelijkt `getMe.username` met de ingestelde gebruikersnaam (standaard `MijnRuimte_Bot`); bij verschil **waarschuwing** `ANDERE_BOT` en niets opgeslagen, tenzij de beheerder bewust «Все одно використати цього бота» kiest (geaudit). |
| Uitval van Telegram | Standdienst (elke minuut een controle bij Telegram + signalen van het terugroepadres) classificeert **tijdelijk / lang (>10 min) / vast**; site toont dat eerlijk en biedt de andere aanmeldmethoden. Noodschakelaar: alles uit, zonder toegangssleutel (uitzetten mag altijd snel). |

## 2. Transparantie — niets gemaskeerd
De eigenaar en de beheerder zien de identiteit **volledig**: telefoonnummer tot het laatste cijfer, @gebruikersnaam, voor- en achternaam,
Telegram-ID, foto. Kaarten in Telegram tonen apparaat, browser, plaats en tijd van het verzoek. Elke stap legt uit **waarom** hij gevraagd wordt.
De enige waarde die nooit verschijnt is het **geheim** van de botsleutel (het publieke bot-ID wel).

## 3. Bevestigingstabel (matrix)
Keuzes per actie (interne codes): `telegram`, `passkey`, `telegram-of-passkey`, `telegram-en-passkey`, `telegram-en-code`, `telegram-en-code-of-passkey`, `passkey-en-code`, `alles`. Elke actie heeft een
**minimum** dat de gebruiker niet kan verlagen; de server evalueert (`eisVoor`) en weigert met `STEP_UP_PASSKEY_REQUIRED` of
`TELEGRAM_BEVESTIGING_NODIG`. De browser vraagt dan exact die stap (venster voor de toegangssleutel of Telegram-venster dat elke 2 s de stand opvraagt).

## 4. Routes
- Openbaar (vóór aanmelden): `GET /api/aanmelden/telegram/{config,widget,widget-terug}`, `POST /api/aanmelden/telegram/{start,status,code,voltooien}`,
  `POST /api/telegram/webhook`. Allemaal in `PUBLIEKE_ROUTES` en door een test vergeleken met de routemarkering.
- Alleen met sessie / bewaakt door de matrix: alle `POST /api/owner/telegram/*` (o.a. `deblokkeren` = `koppeling-wijzigen`).
- Beheer: `POST /api/owner/telegram/beheer/*` — beheerrol + toegangssleutel voor wijzigingen; `nood-uit` zonder toegangssleutel.
- Met de vlag UIT antwoorden de routes «niet beschikbaar» (404 `NIET_GEVONDEN`; `config` meldt `zichtbaar: false`), de knop ontbreekt en de statusdienst slaapt.

## 5. Gegevens en bewaartermijnen
Tabellen `app.tg_*` (migratie 0202). Opruimen: updates/eenmalig 2 d, knoppen 7 d, koppelverzoeken 30 d, aanmeldverzoeken 90 d.
Account wissen: alle `tg_*`-rijen van de gebruiker gaan mee (`shared/account-wissen.ts`); uitzondering `tg_instellingen.door`
(site-instelling, geen accountgegeven) is gemotiveerd geregistreerd.

## 6. Testbewijs
- `tests/eenheid/telegram-aanmelden-20261109.test.ts` — 59 OK (beleid, matrix, wijzigingen, «Ні» wint, vervalsing, code, HMAC, routes, CSP, broncontroles: geen sleutelweergave, geen maskering, officieel logo, alleen uk/nl).
- `tests/eenheid/telegram-aanmelden-stroom-20261109.test.ts` — 28 OK, volledige stroom tegen PostgreSQL met een nep-Bot-API
  (eigen nummer verplicht, aftelling, 3 snelle tikken = 1, «Ні» blokkeert apparaat, wijziging van de gebruikersnaam pauzeert, «Так» alleen heft niet op, geen `parse_mode`).

## 7. Restrisico’s (eerlijk)
- Telegram zelf ziet dat u zich aanmeldt (metadata bij Telegram). Wie dat niet wil: gebruik toegangssleutel.
- Wie zowel uw ontgrendelde telefoon met Telegram als het apparaat met uw toegangssleutel heeft, heeft alles; daarom vragen gevoelige acties altijd de toegangssleutel.
- Foto-wijziging wordt herkend aan `file_unique_id`; Telegram kan dit in zeldzame gevallen zelf vernieuwen → u krijgt dan een (onschuldige) wijzigingskaart.

## 8. Plaatsing van de aanmeldmethoden (migratie 0203)
- Alleen eigenaar/beheerder, met verse toegangssleutel (poort `beheer-instellingen`), elke wijziging en elke weigering in het journaal.
- **Geen buitensluiten:** opslaan wordt geweigerd (`GEEN_WERKENDE_METHODE`) als alle werkende methoden verborgen zijn; een methode die
  niet werkt (bijv. Telegram zonder botsleutel) verschijnt nooit op het hoofdscherm; is er toch geen werkende methode zichtbaar, dan toont
  het aanmeldscherm Google (noodweg).
- De openbare configuratie bevat alleen methode-namen en plaatsen, geen geheimen; met de vlag uit wordt er geen plaatsing gestuurd en is
  het aanmeldscherm exact dat van 20261109-105221.
