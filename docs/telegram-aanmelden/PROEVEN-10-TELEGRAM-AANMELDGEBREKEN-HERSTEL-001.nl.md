> 🌐 **Taal / Мова:** [Українська](ВИПРОБУВАННЯ-10-ВАД-ВХОДУ-ТЕЛЕГРАМ-HERSTEL-001.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Verificatieproeven voor tien Telegram-aanmeld- en bevestigingsvenstergebreken (`HERSTEL-001`)

## Doel

Dit document legt de volledige analyse en de verificatieproeven vast voor tien weergave- en stroomgebreken van het aanmelden via Telegram (`hub.tarasevych.com` en het beveiligde venster op `id.tarasevych.com`), vastgesteld aan de hand van acht schermafbeeldingen van de eigenaar van `25.11.2026` (`11:21:12`–`11:25:32`). Het geautomatiseerde eenheidscontract staat in `tests/eenheid/herstel-001-telegram-aanmelden-tien-gebreken.test.ts`.

---

## Overzicht van de 10 vastgestelde gebreken en verificatiecontracten (`TG-1`..`TG-10`)

### 1. Proef `TG-1` — De browser toont geen systeemvraag voor de locatie van het apparaat en de site legt meteen een weigering vast (opnamen `11:21:12`, `11:21:25`, `11:22:24`, `11:23:17`, `11:24:51`, `11:25:32`)

- **Gebrek:** in de Chrome-instellingen op Android (`11:22:24`) staat «Sites kunnen om uw locatie vragen» ingeschakeld, maar er verschijnt geen toestemmingsvenster van de browser. In plaats daarvan meldt de site direct «Geen toegang tot de locatie gegeven» (`11:23:17`) of de rode foutmelding dat de plaats ontbreekt (`11:21:25`, `11:25:32`), en in het beveiligde venster (`11:24:51`) staat bij «Apparaat meldt» `geen toestemming gegeven`.
- **Oorzaak:** in `src/telegram-aanmelden/AanmeldTelegram.tsx` wordt `plaatsDelen(lopend)` bij `geoVereist === true` automatisch aangeroepen vanuit een achtergrond-`useEffect` (na een periodieke `/api/aanmelden/telegram/status`-peiling, zonder gebruikersgebaar en terwijl het Chrome-tabblad op de achtergrond staat omdat de gebruiker in Telegram werkt). Mobiele Chrome weigert een achtergrondaanroep van `navigator.geolocation.getCurrentPosition()` zonder gebruikersactie met `PERMISSION_DENIED`, waarna `plaatsDelen` ten onrechte `stand: 'geweigerd'` naar de server stuurt. Bovendien gebruikt `start()` geen `plaatsVoorStart()` uit `src/aanmelden/plaats.ts`.
- **Hersteleis:** `navigator.geolocation.getCurrentPosition` mag uitsluitend vanuit een directe gebruikersactie op een zichtbaar tabblad worden aangeroepen; een achtergrondpeiling met `geoVereist: true` mag nooit op de achtergrond `getCurrentPosition` starten en een valse `geweigerd` vastleggen, en vóór een foutmelding over geblokkeerde browserinstellingen wordt de werkelijke toestemmingsstaat via `navigator.permissions.query({ name: 'geolocation' })` gecontroleerd.

### 2. Proef `TG-2` — Aanmelding rechtstreeks in Telegram oproepen en bevestigen zonder verplichte omleidingslink vanaf de site, achter een standaard uitgeschakelde beveiligingsschakelaar (opnamen `11:21:12`, `11:22:53`)

- **Gebrek:** momenteel verschijnt het bevestigingsverzoek in Telegram alleen wanneer men op de site op «Telegram openen» (`t.me/<bot>?start=i_<id>`) klikt of het officiële aanmeldvenster van Telegram gebruikt. Wie de bot rechtstreeks in Telegram opent, heeft daar geen knop om het lopende aanmeldverzoek op te roepen en te bevestigen.
- **Oorzaak:** in `backend/telegram-aanmelden/inloggen.ts` en `backend/telegram-aanmelden/webhook.ts` wordt een aanmeldverzoek uitsluitend via `/start i_<id>` aan de Telegram-gebruiker gekoppeld.
- **Hersteleis:**
  1. Voeg de mogelijkheid toe om een lopend aanmeldverzoek rechtstreeks in de Telegram-bot op te roepen en te bevestigen (met een bevestigingsknop in Telegram die het verzoek en de pictogramkeuze toont zonder dat men via de sitelink hoeft over te stappen).
  2. Ter bescherming tegen telefoonoplichting staat deze mogelijkheid **standaard UITGESCHAKELD**. Voeg in de sectie «Aanmeldmethoden» → `Telegram` (`src/telegram-aanmelden/TelegramSectie.tsx`) een afzonderlijke schakelaar met een duidelijke beveiligingswaarschuwing toe.
  3. Behoud op het aanmeldscherm de link «Telegram op een ander apparaat? Aanmelden via het officiële aanmeldvenster van Telegram» als vast alternatief.

### 3. Proef `TG-3` — Gebroken opmaak van de knop `📍 Надати місце пристрою` binnen het rode foutkader (opnamen `11:21:25`, `11:25:32`)

- **Gebrek:** in het rode kader «❗ Dit account eist de plaats van het apparaat» is de grote knop «📍 Plaats van het apparaat delen» voor `85%` rechts leeg, terwijl het speldpictogram `📍` en de drie woorden in een smalle kolom van `34 px` links tegen en over de ronde rand worden samengedrukt.
- **Oorzaak:** in `src/telegram-aanmelden/AanmeldTelegram.tsx` heeft deze knop `className='tga-aanmeld-knop'` met slechts één tekstknoop, terwijl `src/aanmeld-herontwerp.css` op `.canonical-signed-out.mr-sign-in .tga-aanmeld-knop` een driekolomsrooster `grid-template-columns: 34px minmax(0,1fr) 34px` (`30px minmax(0,1fr) 24px` bij `<= 380 px`) toepast.
- **Hersteleis:** de knop «📍 Plaats van het apparaat delen» gebruikt ofwel drie roostercellen (`.tga-aanmeld-logo`, `.tga-aanmeld-tekst`, `.tga-aanmeld-eind`), ofwel een gecentreerde enkelkolomsopmaak over de volledige knopbreedte.

### 4. Proef `TG-4` — Knoppen rechtsboven `[🇺🇦 укр.] [☀️] [👤]` zweven bij scrollen over de koppen en tekst van de aanmeldkaart (opnamen `11:21:25`, `11:23:17`, `11:25:32`)

- **Gebrek:** wanneer de kaart «Aanmelden met Telegram» uitgeklapt is en de pagina omlaag wordt gescrold, zweven de vaste knoppen `[🇺🇦 укр.]`, `[☀️]` en `[👤]` zonder achtergrond midden over de koptekst (`11:21:25`), de uitlegregels (`11:23:17`) of de pictogramtegel (`11:25:32`).
- **Oorzaak:** in `src/aanmeld-herontwerp.css` en `src/account-afgemeld-menu.css` blijft `.canonical-account-anchor` `position: fixed` boven een transparante `.canonical-topbar`.
- **Hersteleis:** op het aanmeldscherm mag de bedieningsgroep rechtsboven bij scrollen nooit door de tekst van de aanmeldkaart heen lopen.

### 5. Proef `TG-5` — Ontbrekende land- en plaatsnaam in de rij «Звідки / Vanwaar» van het beveiligde venster (opname `11:24:51`)

- **Gebrek:** in het uitgeklapte blok «Details van verzoek en Telegram» van het beveiligde venster (`id.tarasevych.com`) staat naast «Vanwaar» geen vlag of landnaam (`🇧🇪 België`), maar uitsluitend de kleine toelichting `Bepaald via het IP-adres — bij benadering`.
- **Oorzaak:** in `backend/telegram-aanmelden/venster.ts` ontbreekt in de voorwaardelijke expressie `w.plaats || w.land` de weergave van `${logo(vlag(w.land), w.land, 'vlag')} ${esc(plaats)}` vóór `<small class="bron">`.
- **Hersteleis:** de rij «Vanwaar» in `backend/telegram-aanmelden/venster.ts` toont de vlag en de plaatsnaam (`plaats`), gevolgd door de brontoelichting.

### 6. Proef `TG-6` — Dubbele gegevens in «Details van verzoek en Telegram», tautologie in «Wat», zwevende punt in `.meta-chips` en ontbrekend doeldomein (opnamen `11:21:12`, `11:24:12`, `11:24:51`)

- **Gebrek:**
  1. Bovenin de kaart van het beveiligde venster staan al foto, naam en e-mail van het site-account, de handeling, het toestel en het tijdstip; bij het openklappen van «Details van verzoek en Telegram» (`11:24:51`) worden al deze velden letterlijk herhaald, inclusief de tautologie `Aanmeldverzoek: aanmelden op «Mijn Ruimte»`.
  2. In `.meta-chips` blijft achter `🇧🇪 België ·` een losse scheidingspunt aan het einde van de eerste regel hangen wanneer de datum naar de tweede regel breekt.
  3. Het doeldomein van de aanmelding (bijvoorbeeld `hub.tarasevych.com`) ontbreekt.
- **Hersteleis:** verwijder de dubbele velden en tautologie in `backend/telegram-aanmelden/venster.ts`, toon het doeldomein van de aanmelding en voorkom een zwevende scheidingspunt bij regelafbraak in `.meta-chips`.

### 7. Proef `TG-7` — Geen actieknop in het beveiligde venster bij vereiste apparaatlocatie en tijdverlies door opnieuw kiezen van het pictogram (opnamen `11:21:12`, `11:21:25`, `11:24:12`, `11:24:51`, `11:25:32`)

- **Gebrek:** wanneer de gebruiker in het beveiligde venster het juiste pictogram kiest terwijl het account de apparaatlocatie eist, verschijnt alleen de rode tekst «Ga terug naar de site, geef de browser toegang tot de locatie en kies het pictogram opnieuw» met daaronder enkel de weigerknop `⛔ Dit ben ik niet`. Door het heen en weer schakelen loopt de teller van 3 minuten bijna af (`0:05` op `11:21:25`, `0:07` op `11:25:32`).
- **Oorzaak:** in `backend/telegram-aanmelden/venster.ts` en `backend/telegram-aanmelden/inloggen.ts` biedt het venster bij `plaats-nodig` geen directe vervolgactie en wordt het reeds juist gekozen pictogram niet onthouden.
- **Hersteleis:** bied een directe vervolgactie om de locatie te delen en rond de aanmelding af zonder dat een reeds juist gekozen pictogram opnieuw handmatig moet worden aangetikt.

### 8. Proef `TG-8` — Onvolledige driekolomsopbouw van de knop «Telegram openen» en afwijkende knopnaam in het botbericht (opnamen `11:21:25`, `11:22:53`, `11:23:17`, `11:25:32`)

- **Gebrek:**
  1. De knop «Telegram openen» in de pictogramweergave (`src/telegram-aanmelden/AanmeldTelegram.tsx`, regel 357) heeft slechts twee kind-elementen (`<TelegramLogo maat={20} /><span>Telegram openen</span>`) zonder `.tga-aanmeld-logo` en zonder `.tga-aanmeld-eind` (`↗`), in tegenstelling tot regel 392.
  2. Het botbericht in `backend/telegram-aanmelden/inloggen.ts` (regel 393) noemt de knop `«Перевірити й увійти»`, terwijl de knop zelf en de site haar `«Підтвердити вхід»` (`TEKST.knopVensterInlog`) noemen.
- **Hersteleis:** gebruik ook op regel 357 van `src/telegram-aanmelden/AanmeldTelegram.tsx` de volledige driekolomsstructuur en stem de knopnaam in het botbericht (`backend/telegram-aanmelden/inloggen.ts`) af op `TEKST.knopVensterInlog`.

### 9. Proef `TG-9` — Taalwetschending (`репозиторіїв`) en interne beheerdersuitleg over vlaggen in «Andere aanmeldmethoden» (opnamen `11:22:53`, `11:23:17`)

- **Gebrek:** in de uitgeklapte lijst «Andere aanmeldmethoden» (`src/AanmeldAndereOpties.tsx`, regel 36) staat in de Oekraïense tekst voor GitHub het verboden leenwoord **`репозиторіїв`** (in plaats van **`сховищ коду`**), en bij Apple, Microsoft en de toegangssleutel worden interne beheerinstructies over feature-vlaggen en zelftests aan de bezoeker getoond.
- **Hersteleis:** vervang `репозиторіїв` door `сховищ коду` in `src/AanmeldAndereOpties.tsx` en houd de gebruikerstoelichting in «Andere aanmeldmethoden» helder en vrij van intern vlagjargon.

### 10. Proef `TG-10` — Overbodige stijlwisselaar `Вигляд: Компактний | Студійний` op de publieke aanmeldkaart en zwevende knop `↑` (opnamen `11:22:53`, `11:23:17`)

- **Gebrek:**
  1. Op opname `11:22:53` staat midden in de geopende aanmeldkaart «Aanmelden met Telegram» tijdens het aftellen de stijlwisselaar `Вигляд: [ Компактний | Студійний ]` (`<TelegramStijlKiezer />` in `src/telegram-aanmelden/AanmeldTelegram.tsx`, regel 341), terwijl deze instelling al bij «Aanmeldmethoden» → `Telegram` staat.
  2. Op opname `11:23:17` zweeft rechtsonder de ronde scroll-naar-boven-knop `↑` (`.canonical-scroll-top`) over de kaart van de aanmeldmethoden.
- **Hersteleis:** houd `<TelegramStijlKiezer />` uitsluitend in de instellingensectie van Telegram (niet op de publieke aanmeldkaart) en verberg `.canonical-scroll-top` op het aanmeldscherm (`.canonical-chrome:has(.mr-sign-in)`).
