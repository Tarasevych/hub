> 🌐 **Taal:** [Українська](ВИПРОБУВАННЯ-СТОРИНКИ-ПОВЕРНЕННЯ-GOOGLE-HERSTEL-001.uk.md) · **Nederlands**

# Verificatieproeven van de Google-terugkeerpagina (`id.tarasevych.com`, `STATE_EXPIRED`) — `HERSTEL-001`

Dit document legt de analyse vast van de mobiele schermafdruk `Screenshot_20261125_125840_com.android.chrome.jpg` (`id.tarasevych.com`, mislukte afronding van Google-aanmelding met code `STATE_EXPIRED · HTTP 400`) en de verificatieproeven voor de 4 vastgestelde deelgebreken (`GOOG-1`..`GOOG-4`).

Geautomatiseerde eenheidsproef: [`tests/eenheid/herstel-001-google-terugkeer-staat-verlopen.test.ts`](../../tests/eenheid/herstel-001-google-terugkeer-staat-verlopen.test.ts).

---

## 1. `GOOG-1` — Ontwerp van de terugkeerpagina `id.tarasevych.com` zelf

### Waarneming op de schermafdruk
- Op schermafdruk `12:58:40` ziet de gebruiker na terugkeer van Google op `id.tarasevych.com` een volledig leeg wit scherm zonder Mijn Ruimte-kaart, zonder bovenbalk, zonder Mijn Ruimte-teken of Google-pictogram uit het merkregister `src/merk`, en zonder taal- of themaschakelaar.
- De koppeling **«Terug»** (`Назад`) ziet eruit als een gewoon zwart woord midden in de tekst, zonder rand, zonder knopvlak, zonder pijl (`←`) en zonder aanraakhoogte van `44 px` — het is visueel niet herkenbaar als actieknop.

### Oorzaak in de broncode
- In [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (regel 108) tekent `OwnerIdentityCallback` een kale `<main>` en `<section>` met ingebedde stijlen (`background: 'var(--bg,#f5f7f6)'`, `color: 'var(--text,#173b3d)'`) en een kale koppeling `<a href={backTo} style={{color:'var(--accent,#146b6d)',fontWeight:700}}>{copy(locale).back}</a>`, die door de globale stijlreset in `src/index.css` als gewone zwarte tekst wordt weergegeven.

### Verificatie-eis (`GOOG-1`)
- Geef de terugkeerpagina `id.tarasevych.com` vorm als een volwaardige aanmeldstatuskaart van Mijn Ruimte met ondersteuning voor licht en donker thema, merk uit `src/merk` en duidelijke actieknoppen van ten minste `44 px` hoog.

---

## 2. `GOOG-2` — Interactie met de foutcode (`Код збою: STATE_EXPIRED · HTTP 400`)

### Waarneming op de schermafdruk
- Onderaan onder het woord «Назад» staat een grijze regel `Код збою: STATE_EXPIRED · HTTP 400` die oogt als dode statische tekst zonder uitklappijl, zonder knop om de code snel te kopiëren en zonder menselijke uitleg van de code `STATE_EXPIRED`.

### Oorzaak in de broncode
- In [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (regel 108) toont `<details><summary>` de ruwe technische code zonder visuele strook of knop «Code kopiëren», en bij uitklappen verschijnt alleen de algemene opmerking voor ontwikkelaars zonder verklaring van de foutcode zelf.

### Verificatie-eis (`GOOG-2`)
- Geef het foutcodeblok vorm als een duidelijke interactieve strook met zichtbare uitklap, een knop «Code kopiëren» met terugkoppeling («Gekopieerd») en een korte menselijke uitleg van de technische code.

---

## 3. `GOOG-3` — Antwoord voor de gebruiker (servercode `STATE_EXPIRED` wordt niet herkend door de client)

### Waarneming op de schermafdruk
- Het scherm toont de algemene zin: **«De Google-aanmelding kon niet worden voltooid. Ga terug en probeer het opnieuw.»** (`Не вдалося завершити вхід Google. Поверніться назад і спробуйте ще раз.`), terwijl de server de exacte oorzaakcode `STATE_EXPIRED` teruggaf (de wachttijd van de beveiligde aanmeldpoging is verstreken of de terugkeerpagina is opnieuw geopend vanuit de geschiedenis).

### Oorzaak in de broncode
1. In [`backend/index.ts`](../../backend/index.ts) (regel 669) geeft `ownerGoogleCallbackPost` de codes `STATE_EXPIRED`, `STATE_NOT_FOUND`, `TIMEOUT`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_NOT_ATTACHED` en `STATE_TRANSACTION_MISMATCH` terug.
2. In [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (regels 15 en 46–77) controleren `failureCopy` en `callbackUitleg` echter alleen de e-mailkoppelcodes `GOOGLE_SUITE_STATE_EXPIRED`, `GOOGLE_SUITE_STATE_NOT_FOUND` en het niet-bestaande `OWNER_OAUTH_EXPIRED`. Daardoor valt `STATE_EXPIRED` terug op de algemene tekst `c.failed`.
3. Bovendien verwijst `c.expired` in [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (regel 14) uitsluitend naar «E-mail → Accounts», wat onjuist is bij een gewone aanmelding op Mijn Ruimte.

### Verificatie-eis (`GOOG-3`)
- Voeg in `callbackUitleg` en `failureCopy` nauwkeurige tweetalige (`uk` / `nl`) verklaringen toe voor `STATE_EXPIRED`, `STATE_NOT_FOUND`, `TIMEOUT`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_NOT_ATTACHED` en `STATE_TRANSACTION_MISMATCH`:
  - wat er precies is gebeurd (de geldigheidsduur van 10 minuten voor de beveiligde Google-aanmelding is verstreken of het terugkeerscherm is opnieuw geopend);
  - dat het account veilig is en er niets is gewijzigd;
  - welke vervolgstap de gebruiker direct kan zetten.

---

## 4. `GOOG-4` — Vervolgstappen starten met oorzaak (`returnTo`, `?aanmeld_fout` en knop voor nieuwe poging)

### Waarneming en gedrag
- Wanneer de gebruiker op «Terug» tikt, gaat de oorspronkelijke pagina of het subdomein van waaruit de aanmelding begon verloren, en op de aanmeldpagina `hub.tarasevych.com` verschijnt geen melding over de reden van de afgebroken aanmelding en geen directe actie voor een nieuwe poging.

### Oorzaak in de broncode
1. In [`backend/index.ts`](../../backend/index.ts) (regel 669) geeft de server bij `STATE_EXPIRED` of `STATE_NOT_FOUND` direct `respond(false, '', stateLocale, 400, '', { reasonCode: ... })` terug zonder `returnTo` en `sourceOrigin`, hoewel `ownerTransactionRecordId` beschikbaar is in zowel `oauthState` als in de gestructureerde `state`-parameter (`ownerStateParts(state)`).
2. In [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (regels 102–108) wordt `?aanmeld_fout=<CODE>` alleen bij `PLAATS_NODIG` aan het terugkeeradres toegevoegd, maar niet bij `STATE_EXPIRED` en andere OAuth-fouten.
3. In de woordenlijst [`AANMELDEN` in `src/weigeringen.ts`](../../src/weigeringen.ts) (regels 170–200), die door `useTerugFout` op de aanmeldpagina wordt gelezen, ontbreken de codes `STATE_EXPIRED`, `STATE_NOT_FOUND`, `TIMEOUT` en `TRANSACTION_NOT_FOUND`.

### Verificatie-eis (`GOOG-4`)
- Haal op de server in `ownerGoogleCallbackPost` bij `STATE_EXPIRED` / `STATE_NOT_FOUND` de `OwnerTx`-transactie op (via `oauthState.ownerTransactionRecordId` of `ownerStateParts(state)?.transactionRecordId`) en geef de opgeslagen `returnTo` en `sourceOrigin` terug.
- Bied op de terugkeerpagina `OwnerIdentityCallback` een primaire actieknop **«Terugkeren en opnieuw aanmelden»** (met doorgifte van `?aanmeld_fout=<CODE>` naar de aanmeldpagina) en voeg de bijbehorende codes toe aan `AANMELDEN` in `src/weigeringen.ts`.
