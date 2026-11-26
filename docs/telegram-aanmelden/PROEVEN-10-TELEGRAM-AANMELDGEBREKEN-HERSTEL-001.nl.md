> 🌐 **Taal / Мова:** [Українська](ВИПРОБУВАННЯ-10-ВАД-ВХОДУ-ТЕЛЕГРАМ-HERSTEL-001.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Verificatieproeven voor tien Telegram-aanmeld- en bevestigingsvenstergebreken (`HERSTEL-001`)

## Doel

Dit document legt de volledige analyse en de verificatieproeven vast voor tien weergave- en stroomgebreken van het aanmelden via Telegram (`hub.tarasevych.com` en het beveiligde venster op `id.tarasevych.com`), vastgesteld aan de hand van acht schermafbeeldingen van de eigenaar van `25.11.2026` (`11:21:12`–`11:25:32`), evenals de schone éénschermsweergave van de bevestigingskaart met het hulpvenster achter de ronde knop `i` (`TG-CLEAN`, technische verbeteringen `K2-1`..`K2-3`). Het geautomatiseerde eenheidscontract staat in `tests/eenheid/herstel-001-telegram-aanmelden-tien-gebreken.test.ts`.

---

## Schone éénschermsweergave en hulpvenster achter de knop «i» (`TG-CLEAN`, `K2-1`..`K2-3`)

- **Gebrek:** de geopende wachtkaart voor aanmelden met Telegram (`.tga-aanmeld-open` in `src/telegram-aanmelden/AanmeldTelegram.tsx`) toonde op het hoofdscherm vier lange alinea's en een genummerde lijst, waardoor de kaart bijna twee mobiele schermen hoog werd (`~940 px`) en de aandacht verstrooide.
- **Hersteleis:**
  1. Op het hoofdscherm van de geopende kaart (`data-tg-schone-kaart='1'`, hoogte circa `412 px`) staan uitsluitend een compacte kop met de tijdpil `.tga-tijd-pil` en de voortgangsbalk van `4 px` (`<TelegramTijdBalk />`), één hoofdaccent — de grote tegel van het gekozen pictogram `.tg2-held`, de korte regel `Kies hetzelfde pictogram in Telegram` met de ronde knop `i` ernaast, de driekoloms hoofdknop `Telegram openen` (`<TelegramLogo maat={34} />`) en een rustige knop `Annuleren` (het verplichte locatiekader `data-tg-plaats-eis` verschijnt alleen wanneer `geoVereist && geo !== 'gegeven'`).
  2. Een tik op de ronde knop `i` (`button.tg2-info-knop.is-icoon`, zichtbare cirkel `28×28 px`, specificiteit `(0,4,1)` zonder geforceerde overschrijving, aanraakgebied `44×44 px` — `K2-2`) opent boven de volledige sluier `.tg2-info-sluier` (`100% × 100%`, geregistreerd in `scripts/plaatsing-vaste-elementen.json` — `K2-1`) het dialoogblad `.tg2-info-blad` (`role='dialog'`, `aria-modal='true'`, gesloten toetsenbordlus met `Tab` inclusief `<summary>` en focusterugkeer bij `Escape` — `K2-3`) met drie korte visuele stappen zonder lange alinea's:
     - medaillon `<TelegramLogo maat={22} />` → `Tik op «Aanmelding bevestigen»`;
     - drietal minitegels `MiniDriePictogrammen` (het huidige pictogram in het midden uitgelicht) → `Kies hetzelfde pictogram «…»`;
     - telefoonmedaillon `<Smartphone size={20} />` → `De pagina opent vanzelf`.
  3. Aanvullende handelingen (aanmelden vanaf een ander apparaat via `lopend.widgetUrl`, vrijwillige locatiecontrole en het voorbeeldbericht `<TelegramBotVoorbeeld />` in de uitgebreide weergave) zitten netjes ingeklapt onder `<details className='tg2-info-extra'>` (`min-height: 44px` op `<summary>`) onderaan het `i`-venster.

---

## Overzicht van de 10 vastgestelde gebreken en verificatiecontracten (`TG-1`..`TG-10`)

### 1. Proef `TG-1` — De browser toont geen systeemvraag voor de locatie van het apparaat en de site legt meteen een weigering vast (opnamen `11:21:12`, `11:21:25`, `11:22:24`, `11:23:17`, `11:24:51`, `11:25:32`)

- **Gebrek:** in de Chrome-instellingen op Android (`11:22:24`) staat «Sites kunnen om uw locatie vragen» ingeschakeld, maar er verschijnt geen toestemmingsvenster van de browser. In plaats daarvan meldt de site direct «Geen toegang tot de locatie gegeven» (`11:23:17`) of de rode foutmelding dat de plaats ontbreekt (`11:21:25`, `11:25:32`), en in het beveiligde venster (`11:24:51`) staat bij «Apparaat meldt» `geen toestemming gegeven`.
- **Oorzaak:** in `src/telegram-aanmelden/AanmeldTelegram.tsx` werd `plaatsDelen(lopend)` bij `geoVereist === true` automatisch aangeroepen vanuit een achtergrond-`useEffect` (na een periodieke `/api/aanmelden/telegram/status`-peiling, zonder gebruikersgebaar en terwijl het Chrome-tabblad op de achtergrond stond omdat de gebruiker in Telegram werkte). Mobiele Chrome weigert een achtergrondaanroep van `navigator.geolocation.getCurrentPosition()` zonder gebruikersactie met `PERMISSION_DENIED`, waarna `plaatsDelen` ten onrechte `stand: 'geweigerd'` naar de server stuurde. Bovendien gebruikte `start()` geen `plaatsVoorStart()` uit `src/aanmelden/plaats.ts`.
- **Hersteleis:** `navigator.geolocation.getCurrentPosition` wordt uitsluitend vanuit een directe gebruikersactie op een zichtbaar tabblad aangeroepen via `plaatsVragen()`; bij de start van het aanmelden controleert `plaatsVoorStart()` stil of er al toestemming is gegeven, en na `PERMISSION_DENIED` wordt `plaatsToestemming()` geraadpleegd zodat de staat `'prompt'` als `'mislukt'` wordt opgeslagen en nooit als een valse blijvende weigering `'geweigerd'`.

### 2. Proef `TG-2` — Aanmelding rechtstreeks in Telegram oproepen en bevestigen zonder verplichte omleidingslink vanaf de site, achter een standaard uitgeschakelde beveiligingsschakelaar (opnamen `11:21:12`, `11:22:53`)

- **Gebrek:** voorheen verscheen het bevestigingsverzoek in Telegram alleen wanneer men op de site op «Telegram openen» (`t.me/<bot>?start=i_<id>`) klikte of het officiële aanmeldvenster van Telegram gebruikte. Wie de bot rechtstreeks in Telegram opende, had daar geen knop om het lopende aanmeldverzoek op te roepen en te bevestigen.
- **Oorzaak:** in `backend/telegram-aanmelden/inloggen.ts` en `backend/telegram-aanmelden/webhook.ts` werd een aanmeldverzoek uitsluitend via `/start i_<id>` aan de Telegram-gebruiker gekoppeld.
- **Hersteleis:**
  1. Voeg de mogelijkheid toe om een lopend aanmeldverzoek rechtstreeks in de Telegram-bot op te roepen en te bevestigen (`inlogRechtstreeksVanBot`, de opdracht `/inloggen` en de knop bij `/start` zonder verplichte linkoverstap).
  2. Ter bescherming tegen telefoonoplichting staat deze mogelijkheid **standaard UITGESCHAKELD** (`DEFAULT false` in migratie `0342`). In de sectie «Aanmeldmethoden» → `Telegram` (`src/telegram-aanmelden/TelegramSectie.tsx`) staat een afzonderlijke schakelaar `RechtstreeksBevestigen` met een duidelijke beveiligingswaarschuwing.
  3. Behoud de verwijzing naar het aanmeldvenster voor een ander apparaat (`lopend.widgetUrl`) in het inklapbare voetblok van het hulpvenster `i`.

### 3. Proef `TG-3` — Gebroken opmaak van de knop `📍 Надати місце пристрою` binnen het rode foutkader (opnamen `11:21:25`, `11:25:32`)

- **Gebrek:** in het rode kader «❗ Dit account eist de plaats van het apparaat» was de grote knop «📍 Plaats van het apparaat delen» voor `85%` rechts leeg, terwijl het speldpictogram `📍` en de drie woorden in een smalle kolom van `34 px` links tegen en over de ronde rand werden samengedrukt.
- **Oorzaak:** in `src/telegram-aanmelden/AanmeldTelegram.tsx` had deze knop `className='tga-aanmeld-knop'` met slechts één tekstknoop, terwijl `src/aanmeld-herontwerp.css` op `.canonical-signed-out.mr-sign-in .tga-aanmeld-knop` een driekolomsrooster `grid-template-columns: 34px minmax(0,1fr) 34px` (`30px minmax(0,1fr) 24px` bij `<= 380 px`) toepast.
- **Hersteleis:** de knop «Plaats van het apparaat delen» (`tga-plaats-knop`) gebruikt de volledige driekolomsopmaak (`.tga-aanmeld-logo` met `<MapPin size={18} />`, `.tga-aanmeld-tekst`, `.tga-aanmeld-eind` met `<ArrowRight size={18} />`) en een beknopte toelichting.

### 4. Proef `TG-4` — Knoppen rechtsboven `[🇺🇦 укр.] [☀️] [👤]` zweven bij het verschuiven over de koppen en tekst van de aanmeldkaart (opnamen `11:21:25`, `11:23:17`, `11:25:32`)

- **Gebrek:** wanneer de kaart «Aanmelden met Telegram» uitgeklapt was en de pagina omlaag werd verschoven, zweefden de vaste knoppen `[🇺🇦 укр.]`, `[☀️]` en `[👤]` zonder achtergrond midden over de koptekst (`11:21:25`), de uitlegregels (`11:23:17`) of de pictogramtegel (`11:25:32`).
- **Oorzaak:** in `src/aanmeld-herontwerp.css` en `src/account-afgemeld-menu.css` bleef `.canonical-account-anchor` `position: fixed` boven een transparante `.canonical-topbar`.
- **Hersteleis:** op het aanmeldscherm heeft de bedieningsgroep rechtsboven `position: absolute` (zodat zij met de bovenkant van de pagina meebeweegt zonder tekst te bedekken), en wanneer het dialoogvenster `i` geopend is wordt zij gedempt en afgedekt door de sluier `.tg2-info-sluier` (`z-index: 1400`).

### 5. Proef `TG-5` — Ontbrekende land- en plaatsnaam in de rij «Звідки / Vanwaar» van het beveiligde venster (opname `11:24:51`)

- **Gebrek:** in het uitgeklapte blok «Details van verzoek en Telegram» van het beveiligde venster (`id.tarasevych.com`) stond naast «Vanwaar» geen vlag of plaatsnaam (`🇧🇪 Brussel, België`), maar uitsluitend de kleine toelichting `Bepaald via het IP-adres — bij benadering`.
- **Oorzaak:** in `backend/telegram-aanmelden/venster.ts` ontbrak in de voorwaardelijke expressie `w.plaats || w.land` de weergave van de plaatsnaam vóór `<small class="bron">`.
- **Hersteleis:** in `.meta-chips` staat een compacte capsule met de landvlag en `via IP` / `за IP` zonder herhaling van de stadsnaam, terwijl de volledige plaatsnaam (`bekendePlaats`) precies één keer op de rij «Vanwaar» staat met daaronder de brontoelichting (en `'plaats onbekend'` / `'місце невідоме'` zonder bronbewering wanneer plaats en land leeg zijn).

### 6. Proef `TG-6` — Dubbele gegevens in «Details van verzoek en Telegram», tautologie in «Wat», zwevende punt in `.meta-chips` en ontbrekend doeldomein (opnamen `11:21:12`, `11:24:12`, `11:24:51`)

- **Gebrek:**
  1. Bovenin de kaart van het beveiligde venster stonden al foto, naam en e-mail van het site-account, de handeling, het toestel en het tijdstip; bij het openklappen van «Details van verzoek en Telegram» (`11:24:51`) werden al deze velden letterlijk herhaald, inclusief de tautologie `Aanmeldverzoek: aanmelden op «Mijn Ruimte»`.
  2. In `.meta-chips` bleef achter de landnaam een losse scheidingspunt aan het einde van de eerste regel hangen wanneer de datum naar de tweede regel brak.
  3. Het doeldomein van de aanmelding (bijvoorbeeld `hub.tarasevych.com`) ontbrak en het tijdstip werd berekend op het moment van weergave in plaats van het aanmaaktijdstip van het verzoek.
- **Hersteleis:** verwijder de dubbele velden en tautologie in `backend/telegram-aanmelden/venster.ts`, toon de doelpagina (`Doelpagina`), geef het werkelijke aanmaaktijdstip `aangemaaktOp` vanuit `inlogVoorVenster` door en vorm `.meta-chips` als afzonderlijke `.meta-chip`-capsules zonder losse scheidingspunten.

### 7. Proef `TG-7` — Geen actieknop in het beveiligde venster bij vereiste apparaatlocatie en tijdverlies door opnieuw kiezen van het pictogram (opnamen `11:21:12`, `11:21:25`, `11:24:12`, `11:24:51`, `11:25:32`)

- **Gebrek:** wanneer de gebruiker in het beveiligde venster het juiste pictogram koos terwijl het account de apparaatlocatie eiste, verscheen alleen de rode tekst «Ga terug naar de site, geef de browser toegang tot de locatie en kies het pictogram opnieuw» met daaronder enkel de weigerknop `⛔ Dit ben ik niet`. Door het heen en weer schakelen liep de teller van 3 minuten bijna af (`0:05` op `11:21:25`, `0:07` op `11:25:32`).
- **Oorzaak:** in `backend/telegram-aanmelden/venster.ts` en `backend/telegram-aanmelden/inloggen.ts` bood het venster bij `plaats-nodig` geen directe vervolgactie en werd het gekozen pictogram niet in `sessionStorage` van het beveiligde venster bewaard.
- **Hersteleis:** controleer eerst of het pictogram juist is vóór `plaats-nodig` (zonder het verzoek te sluiten en met behoud van `symboolOk === false` tot de locatie binnenkomt), bewaar de gekozen tegelpositie en het account veilig in `sessionStorage` van `VENSTER_JS` en toon `#plaats-acties` met de knoppen `✅ Locatie op de site gedeeld — aanmelding afronden` en `↩️ Aanmeldpagina openen om locatie te delen`, zodat één tik volstaat zonder het pictogram opnieuw te moeten onthouden.

### 8. Proef `TG-8` — Onvolledige driekolomsopbouw van de knop «Telegram openen» en afwijkende knopnaam in het botbericht (opnamen `11:21:25`, `11:22:53`, `11:23:17`, `11:25:32`)

- **Gebrek:**
  1. De knop «Telegram openen» in `src/telegram-aanmelden/AanmeldTelegram.tsx` had een onvolledige opbouw of een afwijkende logomaat in de terugvaltak zonder venster.
  2. Het botbericht in `backend/telegram-aanmelden/inloggen.ts` noemde de knop `«Перевірити й увійти»`, terwijl de knop zelf en de site haar `«Підтвердити вхід»` (`TEKST.knopVensterInlog`) noemden.
- **Hersteleis:** gebruik voor alle knoppen «Telegram openen» en «Aanmelden met Telegram» de volledige driekolomsstructuur met `<TelegramLogo maat={34} />` (en `<ArrowRight size={18} />` op de startknop) en stem de knopnaam in het botbericht (`backend/telegram-aanmelden/inloggen.ts`) af op `TEKST.knopVensterInlog`.

### 9. Proef `TG-9` — Taalwetschending (`репозиторіїв`) en interne beheerdersuitleg over vlaggen in «Andere aanmeldmethoden» (opnamen `11:22:53`, `11:23:17`)

- **Gebrek:** in de uitgeklapte lijst «Andere aanmeldmethoden» (`src/AanmeldAndereOpties.tsx`) stond in de Oekraïense tekst voor GitHub het verboden leenwoord **`репозиторіїв`** (in plaats van **`сховищ коду`**), en bij Apple, Microsoft en de toegangssleutel werden interne beheerinstructies over functievlaggen en zelftests aan de bezoeker getoond.
- **Hersteleis:** vervang `репозиторіїв` door `сховищ коду` in `src/AanmeldAndereOpties.tsx` en houd de gebruikerstoelichting in «Andere aanmeldmethoden» helder en vrij van interne vlagverwijzingen.

### 10. Proef `TG-10` — Overbodige stijlwisselaar `Вигляд: Компактний | Студійний` op de publieke aanmeldkaart en zwevende knop `↑` (opnamen `11:22:53`, `11:23:17`)

- **Gebrek:**
  1. Op opname `11:22:53` stond midden in de geopende aanmeldkaart «Aanmelden met Telegram» tijdens het aftellen de stijlwisselaar `Вигляд: [ Компактний | Студійний ]` (`<TelegramStijlKiezer />`), terwijl deze instelling al bij «Aanmeldmethoden» → `Telegram` staat.
  2. Op opname `11:23:17` zweefde rechtsonder de ronde knop om naar boven te schuiven `↑` (`.canonical-scroll-top`) over de kaart van de aanmeldmethoden.
- **Hersteleis:** houd `<TelegramStijlKiezer />` uitsluitend in de instellingensectie van Telegram (verwijder haar en `<TelegramStappenBalk />` van de publieke aanmeldkaart en plaats `<TelegramBotVoorbeeld />` in het inklapbare voetblok van het `i`-venster) en verberg `.canonical-scroll-top` op het aanmeldscherm (`.canonical-chrome:has(.mr-sign-in)`).
