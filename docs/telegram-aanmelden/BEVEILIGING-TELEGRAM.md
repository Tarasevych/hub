# Beveiliging — Aanmelden en bevestigen via Telegram (TELEGRAM-AANMELDEN v1)

Basis: release 20261109-105221 (commit 22742811). Vlag `telegram-aanmelden-v1` (migratie 0201), **standaard UIT**.
Taal van de site en de bot: alleen **Oekraïens (uk)** en **Nederlands (nl)**.

## 1. Dreigingsmodel en antwoord

| Dreiging | Maatregel |
|---|---|
| Iemand koppelt zijn eigen Telegram aan uw account | Koppelen vraagt een **passkey-step-up** op de site; de bot vraagt het **eigen telefoonnummer via `request_contact`**. Een getypt nummer of het contact van iemand anders (`contact.user_id ≠ from.id`) wordt geweigerd. Daarna ziet u de **volledige identiteit** (nummer, @gebruikersnaam, naam, Telegram-ID, foto) en bevestigt u met vinkje + aftelling + passkey. |
| Telegram-account gekaapt (sim-swap, sessiediefstal) | Een kaper verandert eerst nick/naam/foto/nummer. Elke afwijking van de bij het koppelen vastgelegde **vingerafdruk** zet de koppeling op **«призупинено»/gepauzeerd**: geen aanmelden, geen bevestigen. «Так» in Telegram alléén heft dat **nooit** op; daarvoor is de site + passkey nodig (actie `wijziging-bevestigen`, minimum passkey). Ander **telefoonnummer = opnieuw koppelen**. Afwijkend Telegram-ID = vervalsing → koppeling uit + melding. Geen antwoord binnen 24 u → koppeling uit. |
| Gekaapte Telegram gebruikt om verder te komen | Gevoelige acties (koppelen/ontkoppelen, rechten, aanmeldmethoden, telefoon, e-mail/wachtwoord, geheime code, bevestigingstabel, betalingen, beheerinstellingen, botsleutel) hebben **minimum passkey**: de tabel kan daar nooit «alleen Telegram» kiezen (server- én UI-zijde, `keuzeToegestaan`). |
| «Ja» en «Nee» tegelijk | **«Ні» wint altijd**, ongeacht volgorde of kanaal; het conflict wordt aan de eigenaar getoond («Ні» діє одразу й завжди переважає). |
| Per ongeluk/automatisch tikken | «Так, це я»-knoppen pas actief na een **aftelling** (standaard 5 s; 10 s + vinkje bij ernstige wijzigingen/nieuw apparaat). Afgedwongen **op de server** (`aftel_sec` per knop; te vroeg = melding, geen claim) én zichtbaar (⏳ in de knop). |
| Dubbele tik / herhaalde updates | Knoppen zijn eenmalig: HMAC-ondertekend, claim `nieuw→bezig→klaar` in één SQL-update. `update_id` wordt ontdubbeld (`tg_updates`). Frontend: `useEenmalig`. |
| Vervalste webhook | Geheime kop `X-Telegram-Bot-Api-Secret-Token`, tijdconstante vergelijking; zonder geldig geheim: 401 en niets verwerkt. Groepen/kanalen worden genegeerd (bot: joingroups uit, privacy aan). |
| Vervalste Login Widget-data | HMAC-SHA256 met SHA256(botsleutel), alleen de bekende velden, `auth_date` ≤ 5 min oud, tijdconstante vergelijking. Widget alleen in **redirect-modus** op een eigen minipagina met een smalle CSP (alleen `telegram.org`). |
| Statusvraag door een ander tabblad/apparaat | Aanmeldstatus alleen met het **geheim van het eigen verzoek** (gehasht opgeslagen). |
| Brute force geheime code | scrypt-hash met pepper; pauze na 3 fouten (15 min), uit na 5 (herstel alleen met passkey). Sterktemeter weigert reeksen, herhalingen, telefoonnummer-delen. |
| Dwang | Optionele **alarmcode**: wordt «aanvaard» zonder waarschuwing, maar opent níets en alarmeert de eigenaar. |
| Lek van de botsleutel | Sleutel wordt **nooit gevraagd** (niet door agenten, documentatie of bot). Alleen de eigenaar voert hem in het beheerpaneel in (passkey); direct in de versleutelde eigenaarskluis (AES-256-GCM), invoerveld wordt gewist, **nooit getoond**, gelogd of geaudit (hoogstens «aanwezig» + publiek bot-ID). Wissel zonder onderbreking: nieuwe sleutel eerst `getMe`, pas daarna actief. |
| Verkeerde bot | «Налаштувати бота» vergelijkt `getMe.username` met de ingestelde gebruikersnaam (standaard `MijnRuimte_Bot`); bij verschil **waarschuwing** `ANDERE_BOT` en niets opgeslagen, tenzij de beheerder bewust «Все одно використати цього бота» kiest (geaudit). |
| Uitval van Telegram | Statusdienst (elke minuut `getMe` + webhook-signalen) classificeert **tijdelijk / lang (>10 min) / vast**; site toont dat eerlijk en biedt de andere aanmeldmethoden. Noodschakelaar: alles uit, zonder passkey (uitzetten mag altijd snel). |

## 2. Transparantie — niets gemaskeerd
De eigenaar en de beheerder zien de identiteit **volledig**: telefoonnummer tot het laatste cijfer, @gebruikersnaam, voor- en achternaam,
Telegram-ID, foto. Kaarten in Telegram tonen apparaat, browser, plaats en tijd van het verzoek. Elke stap legt uit **waarom** hij gevraagd wordt.
De enige waarde die nooit verschijnt is het **geheim** van de botsleutel (het publieke bot-ID wel).

## 3. Bevestigingstabel (matrix)
Keuzes per actie: `telegram`, `passkey`, `telegram-of-passkey`, `telegram-en-passkey`, `telegram-en-code`, `telegram-en-code-of-passkey`, `passkey-en-code`, `alles`. Elke actie heeft een
**minimum** dat de gebruiker niet kan verlagen; de server evalueert (`eisVoor`) en weigert met `STEP_UP_PASSKEY_REQUIRED` of
`TELEGRAM_BEVESTIGING_NODIG`. De frontend vraagt dan exact die stap (passkey-venster of Telegram-venster met polling).

## 4. Routes
- Openbaar (vóór aanmelden): `GET /api/aanmelden/telegram/{config,widget,widget-terug}`, `POST /api/aanmelden/telegram/{start,status,code,voltooien}`,
  `POST /api/telegram/webhook`. Allemaal in `PUBLIEKE_ROUTES` en door een test vergeleken met de routemarkering.
- Alleen met sessie / bewaakt door de matrix: alle `POST /api/owner/telegram/*` (o.a. `deblokkeren` = `koppeling-wijzigen`).
- Beheer: `POST /api/owner/telegram/beheer/*` — beheerrol + passkey voor wijzigingen; `nood-uit` zonder passkey.
- Met de vlag UIT antwoorden de routes «niet beschikbaar» (404 `NIET_GEVONDEN`; `config` meldt `zichtbaar: false`), de knop ontbreekt en de statusdienst slaapt.

## 5. Gegevens en bewaartermijnen
Tabellen `app.tg_*` (migratie 0202). Opruimen: updates/eenmalig 2 d, knoppen 7 d, koppelverzoeken 30 d, aanmeldverzoeken 90 d.
Account wissen: alle `tg_*`-rijen van de gebruiker gaan mee (`shared/account-wissen.ts`); uitzondering `tg_instellingen.door`
(site-instelling, geen accountgegeven) is gemotiveerd geregistreerd.

## 6. Testbewijs
- `tests/eenheid/telegram-aanmelden-20261109.test.ts` — 59 OK (beleid, matrix, wijzigingen, «Ні» wint, vervalsing, code, HMAC, routes, CSP, broncontroles: geen sleutelweergave, geen maskering, officieel logo, alleen uk/nl).
- `tests/eenheid/telegram-aanmelden-stroom-20261109.test.ts` — 28 OK, volledige stroom tegen PostgreSQL met een nep-Bot-API
  (eigen nummer verplicht, aftelling, 3 snelle tikken = 1, «Ні» blokkeert apparaat, nick-wijziging pauzeert, «Так» alleen heft niet op, geen `parse_mode`).

## 7. Restrisico’s (eerlijk)
- Telegram zelf ziet dat u zich aanmeldt (metadata bij Telegram). Wie dat niet wil: gebruik passkey.
- Wie zowel uw ontgrendelde telefoon met Telegram als uw passkey-apparaat heeft, heeft alles; daarom blijven gevoelige acties passkey-plichtig.
- Foto-wijziging wordt herkend aan `file_unique_id`; Telegram kan dit in zeldzame gevallen zelf vernieuwen → u krijgt dan een (onschuldige) wijzigingskaart.
