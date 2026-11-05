> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261026-BLOK2-6.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261026-BLOK2-6.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

## Blokken 2, 3 en 6 — deel 1 (26-10-2026)

Niet het volledige plan 2–8. Uitgevoerd is wat het gedrag al wijzigt en slaagt voor unittests zonder Postgres.

- **2.1** Zoeken in meldingen blijft op één rij. Secties en volgorde zijn ook op desktop verborgen achter "Filters" (`Фільтри`), niet alleen op de telefoon (`MeldingenpaneelInhoud.tsx`, `meldingenpaneel.css`).
- **2.2** De onderste balk van het paneel is één rij: drie icoonknoppen met tooltip; de tekst "Alles als gelezen markeren" (`Позначити все прочитаним`) blijft behouden. De globale `footer{margin}` duwt het paneel niet langer uit elkaar.
- **3 / 6.2** `shared/bijlage-voorbeeld-maat.ts` berekent de breedte van het zwevende voorbeeld. Momenteel staat de kaart nog op formaat S (zoals voorheen); het muiswiel vergroot dit naar L. Het veld in de serverinstellingen is nog niet gekoppeld. — **in het tweede deel is het veld gekoppeld.**
- **3 / 6.5** `shared/bestandsformaten.ts`: 13 families, label ≤ 5 tekens, zonder merklogo's. De oude 14 plekken in de interface kijken nog naar hun eigen tabellen. — **in het tweede deel is `FormaatTeken` toegevoegd.**
- **5** Het label `onbekend`: "Niet bevestigd" (`Не підтверджено` / `Не підтверджені`), niet "Ongecontroleerd" (`Неперевірений`).
- **6 / 8.5** Aan de lijst met extensietermijnen is "1 dag" (`1d`) toegevoegd. — **in het vierde deel wordt "Onbeperkt" vernieuwd met een nieuwe rij.**

## Blokken 2–8 — tweede deel (26-10-2026)

- **2.4** Een belletje op elke mailboxkaart. De drempelwaarde wordt als afzonderlijke rij (`accountKey`) opgeslagen en overschrijft de algemene instelling niet. Er wordt eerlijk vermeld dat er nog geen meldingen voor nieuwe e-mails zijn.
- **3 / 6.2** Veld `attachmentHoverSize` in de weergave-instellingen (client, cache en server). Snelle instellingen en volledige pagina: S/M/L/XL/Scherm. Het muiswiel tilt S nog steeds direct naar L.
- **3 / 6.5** `FormaatTeken` — kleurlabel voor 13 families bij bijlagevoorbeeld en op de zoekkaart. De oude icoontabellen op de overige plekken gebruiken nog hun eigen definities.
- **7 / en passant 5.1** Ondertitel en begroetingsdatum op het werkblad gebruiken `--text` in plaats van `--muted` (voorheen onder AA).

Nog niet gedaan: miniatuurwachtrij (6.4), één editor (7.1–7.4), controlewachtrij voor afzenders (3.1–3.5), één agentenpagina (8.4), "onbeperkt" voor de extensie met automatische verlenging (8.5), definitieve accountverwijdering en codewoord (4.1–4.4).

## Blokken 2 en 7 — derde deel (26-10-2026)

- **2.3** Het blok "Laatste e-mails uit Gmail" (onderwerpen en fragmenten) is verwijderd van `/accounts`. Op de Google-kaart staat nu "Laatste e-mail: … · gecontroleerd …" via `POST …/laatste-ontvangst` (alleen `internalDate`). IMAP: "Inkomend gecontroleerd …" vanuit de reeds bekende controle. De route `/preview` is behouden voor oudere aanroepen.
- **5.1–5.2** De werkbladachtergrond wordt getekend op `.canonical-workspace` (scrollt niet mee met de sectie). Het vastgezette menu op deze achtergrond: 64 % licht / 56 % donker, met `--faint→--muted`. Bij `prefers-reduced-transparency` en hoog contrast blijft het menu ondoorzichtig.

## Blokken 3 en 6 — vierde deel (26-10-2026)

- **8.5** De termijn `handmatig` heet nu "Onbeperkt" (`Без обмеження` / `Onbeperkt`). De rij in de database is nog steeds maximaal 366 dagen geldig. Wanneer er minder dan 30 dagen resteren en het beleid minstens één extra dag toestaat, maakt `vernieuwOnbeperkt` (vanuit `veeg`) een nieuwe `gid` aan, verstuurt deze eerst en sluit daarna de oude zonder `vergrendel` op de nieuwe. Als het beleid dit niet toelaat, volgt één waarschuwing bij 30 dagen en één bij 1 dag. Uitloggen wist zoals voorheen alles. "Verlengen" in "Mijn toegangen" stelt niet langer een einddatum voor die vóór de huidige ligt. `normBeleid` kapt 366 dagen / lange minuten niet langer af op 30 / 480. Extensie 0.7.1: tekst zonder "uiterlijk" en donkerder rood voor kleine tekst.
- **6.4** Een miniatuur in de lijst activeert geen bestandsdownload wanneer `prefetchMode()` = `off` (databesparing of 2G). Een volledige miniatuurgenerator en een aparte cache uitsluitend voor miniaturen zijn er nog niet.

Nog niet gedaan: volledige miniatuurwachtrij (6.4), één editor (7.1–7.4), controlewachtrij voor afzenders (3.1–3.5), definitieve accountverwijdering en codewoord (4.1–4.4). Eén lange agentenpagina (alle secties tegelijk, lazy mounting) is er nog niet: e2e-kliks verwachten één tabblad en een hash.

## Blok 6 — vijfde deel (26-10-2026)

- **8.4, gebroken ankers.** `#extension-lokaal` opent het tabblad "Extensie" en het anker op het verbindingsblok (voorheen werd dit "Overzicht" en bestond het anker alleen binnen een ingeklapte sectie). `#ruimte` opent "Technisch" en het anker op de ruimtescheiding (of op de uitleg als het profiel niet actief is). `?ontgrendelen=prive|technisch` opent "Browser en agenten", selecteert dat slot en zet de focus op de termijnkeuze. De tabbladenrij is sticky binnen de pagina (`position: sticky`, niet `fixed`). Het kiezen van een tabblad schrijft nog steeds de hash en `aria-selected` — scrollen verandert deze niet.

## Blokken 3, 4, 5 en 8 — zesde deel (26-10-2026)

- **6.4** `shared/miniatuur-beleid.ts`: Auto / Altijd / Op aanvraag in de snelle instellingen (alleen deze browser). Databesparing en 2G downloaden niet automatisch; "Altijd" gaat tot 8 MB. Afbeeldingen uit de cache worden gecomprimeerd naar WebP van circa 320 px. PDF, zip en een aparte downloadwachtrij voor volledige bestanden zijn er nog niet.
- **7.3–7.4** Rechtermuisklik in de berichttekst opent weer het browsermenu. De opmaakballon blijft behouden. Ctrl/Cmd+B, I, Z. Sjabloonitems zijn niet langer vastgezet op 38 px. Klikken op een Gmail-concept opent nog steeds de lezer.
- **3.1–3.2** De knoppen "Ongecontroleerde voortzetten", "Rest controleren" en "Verdachte opnieuw proberen" verwerken batches van 25 op basis van opgeslagen bewijs. Deze wachtrij roept Gmail niet aan. Automatische verdenking wijkt voor een nieuwe controle; handmatige verdenking blijft staan.
- **4.1–4.3** Accountverwijdering wist gegevens direct en laat een tombstone zonder e-mailadres achter. De servereigenaar krijgt `OWNER_NIET_WISSEN`. Het codewoord (`scrypt`) is alleen verplicht als het al is ingesteld. Een schermtoetsenbord en een tweede inlogstap met dit codewoord zijn er nog niet.

Nog niet gedaan: PDF/zip-miniaturen (6.4), Gmail-concept in de editor en één ProseMirror-schil (7.1, 7.4), contactfoto's en BIMI (3.4–3.5), schermtoetsenbord (4.4), één lange agentenpagina (8.4).

## Zevende deel (26-10-2026)

- **7.1** Klikken op een Gmail-concept opent, als de tekst al in de cache staat, "Opstellen" (`mail:open-concept` met `detail.gmail`) in plaats van de lezer. Een concept zonder tekst in de cache opent nog steeds als bericht: een aparte aanroep naar Gmail `drafts.get` bestaat niet en is niet verzonnen.
- **6.4** `MailPdfVoorbeeld` roept `pdf.js` aan met `isEvalSupported:false`. De eerste pagina wordt nog steeds een WebP in het miniatuurgeheugen. Er is geen aparte zip-wachtrij.
- **4.4** `GeheimInvoer` en `SchermToetsenbord` (UKR/NL, letters, cijfers, tekens) staan bij het codewoord in de drie verwijdervensters. Toetsen reageren alleen op pointer-events en hebben `tabIndex={-1}`, zodat AI-extensies ze niet als invoerveld "indrukken". Andere geheime velden (integratiewachtwoorden, CalDAV) gebruiken nog het gewone `type=password`.

Nog open: één ProseMirror-schil (7.4), één lange agentenpagina (8.4), zip-wachtrij, en PEM in het meerregelige SSH-veld is nog platte tekst.

## Achtste deel (26-10-2026)

- **3.3** "Opslaan in contacten" zet `in_contacten` en het geschiedenisitem "toegevoegd aan contacten", zodat het adres verschijnt in het filter "Mijn contacten". Het laatste geschiedenisitem blijft "handmatig bevestigd".
- **3.4** Op de contactenpagina is er een weergave "Kaarten": foto, naam, vertrouwen. "Lijst" blijft de standaard zodat rijcontroles niet veranderen. De keuze van deze browser wordt onthouden.
- **3.5** Geschiedenis van maximaal vijf foto's — uitsluitend foto's die de server in dit tabblad al heeft geleverd (BIMI, favicon, Google, Gravatar, vCard). Er worden geen nieuwe verzoeken naar externe domeinen gedaan. Het uitschakelen van een bron vergeet deze geschiedenis.
- **4.4** `GeheimInvoer` staat nu op de overige enkelregelige geheimen: inlogwachtwoord, sleutelkluis, API-kluis, MCP-token, app-geheim, CalDAV, iCloud, extern bureaublad, IMAP en sleutels in de integratiewizard. Het SSH-sleutelveld (meerdere regels) is tekst gebleven.

## Negende deel (26-10-2026)

- **3.5** "Eigen foto": in de contactdetails zit de knop "Eigen foto" (`Своє фото` / `Eigen foto`). De browser verkleint de afbeelding naar ≤ 320 px WebP en stuurt een data-URI. De server slaat deze op onder de bron `eigen` (voorrang boven Google/vCard/Gravatar). "Eigen foto verwijderen" verwijdert alleen deze rij. Geen nieuwe verzoeken naar externe domeinen.
- **4.3** Codewoord als manier om toegang te bevestigen (step-up). Indien ingesteld, verschijnt het in het venster "Toegang bevestigen" naast passkey/TOTP/herstelcode. Werkt ook voor zware acties. Tweede inlogstap nog niet.

## Tiende deel (26-10-2026)

- **4.3, tweede inlogstap.** Als er een codewoord is ingesteld en deze sessie dat nog niet heeft opgegeven, antwoordt `ownerRequireSession` met `CODEWOORD_POORT` en wordt de handler niet uitgevoerd. De bootstrap vóór het codewoord geeft alleen de gebruikerskaart terug, zonder meldingen en ruimtes. Vrij toegankelijk zijn alleen bootstrap, het codewoordvenster zelf, de accountlijst en uitloggen. De MCP-agent (`mcp-gedelegeerd`) en de weergave "als gebruiker" krijgen dit venster niet. De bevestiging blijft gekoppeld aan de sessie-id tot 30 dagen (net als de sessie zelf). Na uitloggen vraagt een nieuwe sessie opnieuw om het codewoord. `<dialog>`-venster zonder nieuwe `position:fixed`.
- **4.4** De PEM van de GitHub App-sleutel en het SSH-veld (wachtwoord of PEM) gebruiken nu een meerregelige `GeheimInvoer`. PEM blijft zichtbaar zodat BEGIN/END leesbaar zijn; het SSH-wachtwoord wordt verborgen. Hetzelfde schermtoetsenbord.
- **6.4** Als een zip-bestand al in de bijlagecache staat, leest de miniatuur alleen het einde (de namenlijst, zonder uitpakken) en slechts één tegelijk. Het bestand zelf wordt niet speciaal voor de miniatuur gedownload. `../` en zip64 worden niet als inhoud getoond.

Nog open: één ProseMirror-schil in plaats van de reeds enige berichteditor (7.4) — er is geen tweede editor bijgekomen, dus er valt niets samen te voegen. Eén lange agentenpagina (8.4) blijft werken met tabbladen: e2e-kliks verwachten de hash en `aria-selected`.





## 26-10 — oogicoon "Voorbeeld" en schilachtergrond op andere pagina's

- **Bug uit de screenshots.** Het oogicoon bij de berichtdatum zette een native `title` vanuit de lange registernaam ("Voorbeeldweergave: tekst, afbeeldingen, bijlagen"). De browser tekende een witte systeemtooltip precies naast het blauwe ongelezen-puntje (`.mail-row-unread-dot`). In het actiepaneel had dezelfde actie al een korte zwarte tooltip "Voorbeeld" (`Перегляд`). Nu heeft het oogicoon bij de datum ook `data-tooltip` = korte vorm, blijft `aria-label` lang en is `title` verwijderd. Met de muis (≥721 px), wanneer het paneel "Voorbeeld" al bevat, wordt het oogicoon bij de datum verborgen; via toetsenbord en op touchscreens blijft het zichtbaar. De klikzone van de minimale rij steekt niet langer 10 px naar rechts uit over het puntje.
- **5.1.** De achtergrond werd al getekend op `.canonical-chrome`, maar het effect in "Werkblad" verwijderde `data-achtergrond` bij het verlaten van de pagina. Nu zet `src/werkblad/pagina-achtergrond.ts` het attribuut vanuit de cache `tsv:werkblad-v2:*` op de gehele schil en wist het niet bij paginanavigatie. Menu 64 % / 56 % en `prefers-reduced-transparency` stonden al in `menu-naadloos.css`.

Nog open na dit pakket: 7.2–7.4 (editors), volledige agentenpagina 8.4 (tabbladen en `aria-selected` zijn gebleven), wachtrij 3.1–3.5, RLS (geen Postgres). Rapporten: `overdracht/onderzoek/D-account-veiligheid.md`, `G-editors.md`.
