> 🌐 **Taal:** [Українська](ПЕРЕБІГ-РОБІТ.uk.md) · **Nederlands**

# SITE-001 — gereedheid van de site Mijn Ruimte: voortgang

- **Taak:** SITE-001 · agent `antigravity` · vertakking `feature/site-001-20261125-232500`
- **Basis:** `origin/integratie` `8890f85a1c34c9f12e945eb78bd2e8588cceb56a` · regels `1.8.0`
- **Toestemming van de eigenaar:** samenvoegen in `integratie` na groene controles (25.11.2026).
- **Schermafdrukken «voor» en «na»:** [`schermafdrukken/`](schermafdrukken/) — lokale bouw van de site, Chromium zonder venster.

## Hoe een andere agent het werk voortzet

1. `git fetch origin && git switch feature/site-001-20261125-232500`
2. Lees dit bestand: de tabel hieronder toont welk punt klaar is en welk het volgende is.
3. Neem het eerste punt met de status «wacht» of «bezig», maak een schermafdruk «voor», de verbetering, een schermafdruk «na», een vastlegging en een verzending.
4. Werk na elk punt de tabel en het logboek onderaan bij.

## Status per punt

| Nr. | Punt | Status | Samenvatting |
|---|---|---|---|
| 1 | Privacybeleid | ✅ klaar | Bestaande `/privacy` gecontroleerd (13 delen, uk + nl); taalzuivering, `meta description`, canonieke adres, pictogram, contactplaatshouder hersteld |
| 2 | Gebruiksvoorwaarden | ✅ klaar | Bestaande `/terms` gecontroleerd; punt «Wijziging van de voorwaarden» toegevoegd (uk + nl), naam van de eigenaar in de Oekraïense versie, taalzuivering |
| 3 | Openliggende sleutels en geheimen verwijderen | ✅ klaar | Geen echte geheimen in de boom of de geschiedenis (1063 vastleggingen); `.gitleaks.toml` + werkstroom «Geheimscan» |
| 4 | HTTPS | ✅ klaar | Alle 11 subdomeinen: http → 301 naar https, HSTS voor een jaar met subdomeinen, alleen TLS 1.3, certificaat tot 21.02.2027; geen codewijziging nodig |
| 5 | Toestemmingsbalk voor cookies | ✅ klaar | Nieuwe toestemmingsbalk met twee gelijkwaardige knoppen op alle pagina's, uk + nl, opnieuw te openen vanaf de aanmeldpagina; 24/24 tests |
| 6 | Paginatitels en `meta description` | ✅ klaar | Alle tabbladtitels «<розділ> — Мій простір» / «<onderdeel> — Mijn Ruimte» (was «— Tarasevych», «Tarasevych-beheer», «Mijn ruimte», «— Mijn Ruimte» in het Oekraïens) |
| 7 | Voorbeeldafbeelding voor sociale netwerken | ✅ klaar | `public/og-afbeelding.png` 1200×630 (61 kB), `og:image` met alternatieve tekst en `twitter:card` in de toepassing en op de juridische pagina's |
| 8 | Sitepictogram (favicon) | ✅ klaar | **Fout op de productiesite:** `favicon-192.png` en `favicon-512.png` beschadigd; alle pictogrammen opnieuw getekend uit `favicon.svg`, `favicon.ico` toegevoegd, manifest met «any» en «maskable» |
| 9 | `sitemap.xml` en `robots.txt` | ✅ klaar | `sitemap.xml` met alleen `/privacy` en `/terms`; `robots.txt` met `Sitemap:`-regel en toegang tot pictogrammen en voorbeeldafbeelding, rest van de site gesloten |
| 10 | Alternatieve teksten bij afbeeldingen | ✅ klaar | Alle 51 afbeeldingen hebben `alt`; vlag en wapen van een plaats kregen een beschrijvende tekst; bewakingstest 4/4 |
| 11 | Afbeeldingen comprimeren | ✅ klaar | PNG-pictogrammen en voorbeeldafbeelding: 69 319 → 47 395 B (−32 %); 1744 webp al gecomprimeerd; officiële logo's onveranderd (SHA-256) |
| 12 | Laadsnelheid | ✅ klaar | Kern `App` losgekoppeld van `/toegang` (666 → 220 kB, −67 %), `TechLaag` en `MeldingenPortaal` uitgesteld zonder sessie (`id/`: 1013 → 873 kB, LCP 572 → 308 ms, netwerkstilte 15,5 → 1,48 s, 4xx: 2 → 0, CPU-blokkering op telefoon −72 %); bewakingstest 9/9 |
| 13 | Kleurcontrast | ✅ klaar | Bewaker groen (2190 paren); axe-core vond 22 knooppunten op `/privacy` en `/terms`; verholpen, nu 0 in lichte en donkere weergave |
| 14 | Geschiktheid voor mobiel | ✅ klaar | 174 → 0 fouten op breedtes 320–768: zijwaarts schuiven van juridische pagina's, te kleine tekst, te kleine aanraakdoelen; Fastmail kreeg een plek op de e-mailbaan; test 18/18 |
| 15 | Eigen 404-pagina | ✅ klaar | Echte statuscode 404 voor onbekende adressen (was 200); zonder aanmelding een losse pagina zonder menu; pad gedecodeerd; test 24/24; axe 0 |
| 16 | Kapotte koppelingen | ✅ klaar | 305 interne en 3 externe adressen: één echt kapotte koppeling (bevestigingsvenster op mcp/api leidde naar 404) — verholpen; naam «Умови використання» gelijkgetrokken; bewakingstest 6/6 |
| 17 | Validatie van alle formulieren | ✅ klaar | Server: 400 kapotte verzoeken op 50 openbare formulieren — 0 crashes. Browser: 7 fouten (Cyrillische dubbelgangers in de gastcode, fouten niet aan velden gekoppeld, focus ging verloren) — alle verholpen; bewakingstest 22/22 |
| 18 | Bescherming tegen spam | ✅ klaar | 56 openbare POST-routes: 23 met een strikte limiet per IP, 33 met eigen bescherming (pogingenteller, handtekening, toegangstoken); live controle — 6 van 6 limieten werken exact; nieuwe bewakingstest 50/50 laat geen nieuwe route zonder bescherming door |
| 19 | Siteanalyse | ✅ klaar | Eigen anonieme analyse werkt nu echt en alleen met toestemming; tabblad «Bezoeken» voor de beheerder; 12/12 tests |
| 20 | Één duidelijke oproep tot actie | ✅ klaar | Op 6 kernschermen precies 1 hoofdactie: bij een bewaard account op het toestel is de gebruikerskaart de hoofdactie en wordt de Google-knop rustig secundair; op `/privacy` en `/terms` een duidelijke terugkeerknop naar de ruimte toegevoegd; bewakingstest 8/8 |
| 21 | Knoppen en interactieve elementen | ✅ klaar | 4 → 0 fouten in live controle zonder en met aanmelding (`knoppen.mjs`): `aria-label` van taalwisselaar op `/toegang`, 404 op `/api/owner/workspaces/list` verholpen, `document.title` werkt bij na aanmelden, kaart en knoppen voor leeg werkblad in `WerkbladV3`; bewakingstest 7/7 |
| 22 | Foutregistratie en bewaking | wacht | — |
| 23 | Reservekopieën van de database | wacht | `deploy/backup-maken.sh`, `mijn-ruimte-backup.timer` — controleren |
| 24 | Beveiligingskoppen en aanvraagbeperking | wacht | `server/start.ts`, `rateLimit` — controleren |
| 25 | Registratie, aanmelding en wachtwoordherstel | wacht | — |

## Gevonden fouten die nog op hun punt wachten

| Fout | Waar | Punt |
|---|---|---|
| De weergavecontrole van het installatieprogramma (`server/rook.ts`) stopt met code 2: `/api/owner/tech/activeren` → 409 `GEBRUIK_RUIMTES_V2` sinds ruimtes v2 aan staan | `server/rook.ts`, `backend/tech-profiel.ts:156` | 22 |

## Verslagen per punt

### 1. Privacybeleid

De pagina `/privacy` bestond al (`backend/juridisch.ts`, server-HTML zonder JavaScript). Volledigheid volgens de AVG gecontroleerd: verantwoordelijke, doelen, grondslagen, termijnen, verwerkers, rechten, toezichthouder — alles aanwezig.
Verbeterd: Engelse leenwoorden in de Oekraïense tekst, `meta description`, canonieke adres, sitepictogram en themakleur toegevoegd, datum bijgewerkt naar 2026-11-26, contactplaatshouder zonder omgevingsvariabele nu «на запит / op aanvraag» (was tweemaal Nederlands).
Test `tests/eenheid/juridisch.test.ts`: 11/11, waarvan 2 nieuwe SITE-001-controles.

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p01-privacy-voor.webp) | ![na](schermafdrukken/p01-privacy-na.webp) |

> [!IMPORTANT]
> Ter controle door de eigenaar: de zin «AI-functies staan in de dienst momenteel uit» (punt 4) klopt mogelijk niet meer — de toepassing heeft een AI-werkruimte. De tekst is niet gewijzigd omdat het een juridische verklaring over gegevensverwerking is.

### 2. Gebruiksvoorwaarden

De pagina `/terms` bestond al. Punt «Wijziging van de voorwaarden» toegevoegd (melding minstens 14 dagen vooraf), de Oekraïense versie gelijkgetrokken met de Nederlandse (naam van de eigenaar), «spam of malware» vervangen door «ongevraagde massaberichten of schadelijke software».

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p02-voorwaarden-voor.webp) | ![na](schermafdrukken/p02-voorwaarden-na.webp) |

### 3. Openliggende sleutels en geheimen

gitleaks 8.30.1 (officiële uitgave, SHA-256 gecontroleerd): 56 treffers in de boom en 129 in de geschiedenis. Elk handmatig gecontroleerd — namen van omgevingsvariabelen, kunstmatige testwaarden, een voorbeeldsleutel uit RFC 6455, publieke AAGUID's van toegangssleutels en de publieke sleutel van de extensie. **Geen echte geheimen**; herschrijven van de geschiedenis is niet nodig.
Toegevoegd: `.gitleaks.toml` met toegelichte uitzonderingen en de werkstroom `.github/workflows/geheimen-scan.yml` die elke verzending en elk samenvoegverzoek controleert.

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p03-geheimen-voor.webp) | ![na](schermafdrukken/p03-geheimen-na.webp) |

### 4. HTTPS

De productiesite is uitsluitend lezend gecontroleerd (zonder wijzigingen): alle 11 subdomeinen sturen `http://` met code 301 door naar `https://` en geven `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Het certificaat van Google Trust Services WE1 is geldig tot 21.02.2027. TLS 1.0 en 1.1 worden geweigerd; in de `openssl`-controle antwoordt alleen TLS 1.3. Er was geen codewijziging nodig, dus de schermafdruk «voor» is gelijk aan «na».
Opmerking: het hoofddomein `tarasevych.com` (zonder subdomein) antwoordt niet — dat is een kwestie van de naaminstellingen van de eigenaar, niet van de toepassing.

| Voor = na (geen wijziging nodig) |
|---|
| ![na](schermafdrukken/p04-https-na.webp) |

### 5. Toestemmingsbalk voor cookies

Er was geen toestemmingsbalk, terwijl het beleid analyse alleen met toestemming beloofde. Toegevoegd: [`src/toestemming/`](../../src/toestemming/) — een balk onderaan elke pagina (ook de aanmeldpagina zonder sessie) met twee **gelijkwaardige** knoppen «Alleen noodzakelijke» en «Analyse toestaan» (zelfde grootte en uitzicht, geen vooraf gekozen toestemming), een koppeling naar het beleid en teksten in uk + nl. De keuze wordt in de lokale opslag van de browser bewaard (`mr-toestemming-v1`), niet in een cookie; op pagina's met een sessie gaat ze ook naar de server (`POST /api/owner/privacy/toestemming`). De koppeling «Cookie-instellingen» op de aanmeldpagina opent de balk opnieuw. Delen 9 en 10 van het beleid zijn aangevuld.
Test `tests/eenheid/site-001-toestemming.test.ts`: 24/24.

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p05-toestemming-voor.webp) | ![na](schermafdrukken/p05-toestemming-na.webp) |
| ![voor](schermafdrukken/p05-toestemming-mobiel-voor.webp) | ![na](schermafdrukken/p05-toestemming-mobiel-na.webp) |
| — | ![na de keuze](schermafdrukken/p05-toestemming-gekozen-na.webp) |

### 6–9. Titels, voorbeeldafbeelding, pictogrammen, sitemap.xml en robots.txt

- **6.** De tabbladtitels hadden drie vormen: beheer — «Адміністрування — Tarasevych» / «Tarasevych-beheer», Nederlands — «Mijn ruimte», gasttoegang — «Гостьовий доступ — Mijn Ruimte» (Nederlandse naam in een Oekraïense titel). Nu overal «<розділ> — Мій простір» / «<onderdeel> — Mijn Ruimte». Het aanmeldscherm op `id.tarasevych.com/` had voor iemand zonder sessie de titel «Налаштування — Мій простір»; nu «Вхід — Мій простір» / «Aanmelden — Mijn Ruimte» (instellingenpagina's na aanmelden houden «Instellingen»). De `meta description` van 20–160 tekens per onderdeel bestond al en blijft.
- **7.** Voorbeeldafbeelding van 1200×630 met het sitemerk (dezelfde vorm als `favicon.svg`) en de naam in beide talen. Tags `og:image`, `og:image:alt`, `og:site_name`, `twitter:card` in `index.html` en op `/privacy`, `/terms` (daar ook eigen `og:title`, `og:description`, `og:url`).
- **8.** Fout gevonden die ook op de productiesite staat: `favicon-192.png` en `favicon-512.png` zijn niet te ontcijferen (beschadigde gegevensstroom), dus het app-pictogram op telefoons en in het manifest werkte niet. Alle PNG-pictogrammen opnieuw getekend uit `favicon.svg`; `favicon.ico` (16/32/48) toegevoegd omdat browsers het zelf opvragen (was 404).
- **9.** `public/sitemap.xml` met alleen de twee openbare pagina's; de site is privé, de rest blijft `Disallow`. `robots.txt` laat pictogrammen en de voorbeeldafbeelding toe, anders kunnen sociale netwerken de afbeelding niet tonen.

Test `tests/eenheid/site-001-metadata.test.ts`: 21/21 (met volledige PNG-controle op controlegetallen).

Terloops een fout uit punt 19 verholpen: het tabblad «Bezoeken» las het serverantwoord zonder het veld `data` en werd een zwarte pagina; het antwoord wordt nu juist gelezen, test `site-001-analyse` aangevuld (13/13).

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p06-09-voor.webp) | ![na](schermafdrukken/p06-09-na.webp) |
| — | ![aanmeldscherm met nieuwe titel](schermafdrukken/p06-vhid-na.webp) |
| — | ![voorbeeld](schermafdrukken/p07-og-na.webp) |
| ![voor](schermafdrukken/p08-iconen-voor.webp) | ![na](schermafdrukken/p08-iconen-na.webp) |

### 10. Alternatieve teksten bij afbeeldingen

Alle 51 JSX-afbeeldingen in `src/` en `index.html` gecontroleerd: geen afbeelding zonder `alt`-attribuut. Een lege `alt` (29 plaatsen) alleen bij decoratieve beelden (avatar naast de naam, miniatuur in een knop met `aria-label`), zoals WCAG 1.1.1 vraagt. Fout: vlag en wapen van een plaats (`src/merk/PlaatsKeten.tsx`) hadden een lege `alt`, hoewel ze inhoud dragen; nu «Vlag: <naam>» / «Wapen: <naam>».
Nieuwe bewakingstest `tests/eenheid/site-001-alt.test.ts`: 4/4 — laat geen nieuwe afbeelding zonder `alt` door.

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p10-voor.webp) | ![na](schermafdrukken/p10-na.webp) |

### 11. Afbeeldingen comprimeren

Overzicht: 1835 afbeeldingen, 8,38 MB; daarvan 1744 wapens en vlaggen in `webp` (gemiddeld 4,7 kB — al gecomprimeerd), 67 `svg`, 24 `png`. De officiële logo's `src/merk/officieel/*.png` zijn met SHA-256 in `HERKOMST.json` vastgelegd als originelen van de aanbieder — bewust niet gewijzigd. Pictogrammen en voorbeeldafbeelding gecomprimeerd met `pngquant` + `optipng` zonder zichtbaar verlies: 69 319 → 47 395 B (−32 %), voorbeeldafbeelding 61 → 43 kB.

| Na (omvangtabel) | Voorbeeldafbeelding voor / na |
|---|---|
| ![na](schermafdrukken/p11-na.webp) | ![vergelijking](schermafdrukken/p11-og-na.webp) |

### 12. Laadsnelheid van de site

**Meetopstelling en werkwijze (`prestatie-meten`).** De metingen zijn uitgevoerd op de gebouwde productiebundels (`vite build` + `dist-server` met `brotli`/`gzip` in het geheugen en `Cache-Control: public, max-age=31536000, immutable`) in twee scenario's van telkens **3 herhalingen na een opwarmronde** per adres:
1) lokaal netwerk (`1366×900`);
2) trage mobiele telefoon (`390×844`, `4×` CPU-vertraging, `150 ms` netwerkvertraging, `9 / 3 Mbit/s`).

**Vastgestelde oorzaken van vertraging:**
1. In `src/main.tsx` werd `App` statisch op het hoogste niveau geïmporteerd, waardoor de lichte gastpagina `/toegang` en het `OAuth`-terugkeervenster de volledige kern van 511 kB gecomprimeerde code (666 kB totaal) ophaalden en verwerkten.
2. Op openbare aanmeldschermen zonder sessie werden `TechLaag` + `HulpVraag` (~131 kB gecomprimeerd) en ~30 modules van het luie `MeldingenPortaal` (dat bij een gesloten paneel meteen `null` teruggaf) voortijdig geladen.
3. `regels-opslag.ts` en `uitrol-achtergrond-beheer.ts` riepen eigenaarsroutes aan zonder sessie (twee nutteloze `401`-antwoorden waardoor het netwerk 15,5 s niet stilviel) en stuurden geen `meldingLichaam()` / `tabContext` mee, wat zelfs na aanmelding `401` gaf.

**Verbeteringen:** `App` wordt dynamisch geladen (`import('./App')`) alleen in de hoofdtak; `TechLaag` wacht op sessiebevestiging (`ecosystemSessionLikely` / `wachtOpSessieHint` / `listenCanonicalAuthChanges`); `MeldingenPortaal` wordt pas gemonteerd bij het openen van het paneel of een actieve minimale pil; `meldingen/regels` en `uitrol/achtergrond` controleren eerst de sessie en sturen de tabbladcontext mee. Nieuwe bewakingstest `tests/eenheid/site-001-snelheid.test.ts` — `9/9`, `maquette-mobiel-prestatie` — `19/19`, `perf-001` — `41/41`, `tech-bundels-controle` — `OK`.

| Scenario (mediaan van 3 ronden, spreiding min–max) | Voor | Na | Verschil |
|---|---|---|---|
| `id/` · lokaal netwerk · omvang / `4xx`-fouten | `1013 kB` (`1013–1013`) / `2` | `873 kB` (`720–873`) / `0` | **−140 kB (−13,8 %)**, **`4xx`: 2 → 0** |
| `id/` · lokaal netwerk · `LCP` / netwerkstilte | `572 ms` (`508–604`) / `15 510 ms` | `308 ms` (`0–344`) / `1 475 ms` | **−46,2 % `LCP`**, **×10,5 snellere stilte** |
| `id/` · lokaal netwerk · lange taken (> 50 ms) | `2` (`262 ms`) | `2` (`148 ms`) | **−114 ms (−43,5 %)** |
| `id/` · telefoon 4G `×4` CPU · omvang / lange taken | `938 kB` (`937–1013`) / `7` (`1679 ms`) | `763 kB` (`763–763`) / `4` (`467 ms`) | **−175 kB (−18,7 %)**, **−72,2 % CPU-blokkering** |
| `id/toegang` · lokaal netwerk · omvang / `load` / `LCP` | `666 kB` / `329 ms` (`316–336`) / `352 ms` | `220 kB` / `210 ms` (`174–241`) / `236 ms` | **−446 kB (−67,0 %)**, **−36,2 % `load`** |
| `id/toegang` · lokaal netwerk · lange taken | `1` (`96 ms`) | `0` (`0 ms`) | **−100 % (0 lange taken)** |
| `id/toegang` · telefoon 4G `×4` CPU · zuivere ronde | `666 kB`, `load 2044 ms`, `LCP 2288 ms` (time-outs > 60 s) | `220 kB`, `load 1241 ms`, `LCP 1244 ms`, `FCP 664 ms` (0 time-outs) | **−39,3 % `load`**, **−45,6 % `LCP`** |
| `hub/privacy` · statische HTML · lokaal / telefoon | `32 kB`, `load 45 ms` / `711 ms` | `32 kB`, `load 73 ms` / `565 ms` | onveranderd lichte serverpagina |

*Grenzen van bewijskracht:* de metingen zijn verricht op de geïsoleerde lokale proefomgeving met een lege kunstmatige databank en `CDP`-vertraging boven een lokale `TLS`-verbinding (waarbij de planner van de headless browser in een VM zonder grafische versneller soms ~42 s timerpauze toevoegt, zichtbaar in de bovengrens van de `4G`-spreiding); deze cijfers bewijzen de kleinere netwerkomvang en lagere processorbelasting, maar vervangen geen meting over de echte tunnel van de productieserver.

| Voor | Na |
|---|---|
| ![voor: 1013 kB op aanmelden, 666 kB op /toegang](schermafdrukken/p12-kaart-voor.webp) | ![na: 873 kB op aanmelden, 220 kB op /toegang, 0 4xx-fouten](schermafdrukken/p12-kaart-na.webp) |

### 13. Kleurcontrast

De bewaker `scripts/kleur-contrast-controle.mjs` (2190 paren in 30 paletten, beide weergaven) is groen. Daarnaast zijn de weergegeven pagina's gecontroleerd met axe-core 4 (regel `color-contrast`, WCAG 2.1 AA): aanmelden met toestemmingsband, gasttoegang, pagina 404 en beheer — 0 schendingen. Op `/privacy` en `/terms` zijn twee fouten in `public/juridisch.css` gevonden:
- datum van de versie `#6a7580` op `#f7f8fa` — 4,42:1 (vereist 4,5:1) → `#5f6a75`, 5,19:1; in donkere weergave `#a3adb7`, 7,82:1;
- **in donkere weergave hadden alle koppelingen 2,64:1**: het blok `@media (prefers-color-scheme: dark)` stond boven de regel `a{color:#2f6f73}`, die het overschreef. Het blok staat nu aan het einde van het bestand — 7,15:1.

Na de correctie: 0 schendingen in lichte en donkere weergave.

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p13-voor.webp) | ![na](schermafdrukken/p13-na.webp) |
| ![voor, donker](schermafdrukken/p13-voor-donker.webp) | ![na, donker](schermafdrukken/p13-na-donker.webp) |

### 14. Geschiktheid voor mobiel

Nieuwe meting van weergegeven pagina's op breedtes van 320, 360, 390 en 768 pixels (zijwaarts schuiven, elementen voorbij de rechterrand, aanraakdoelen kleiner dan 24×24 volgens WCAG 2.2 · 2.5.8, tekst kleiner dan 12 pixels): aanmelden `id/`, gasttoegang `id/toegang`, `/privacy`, `/terms`, 404-pagina, e-mail. **Voor — 174 fouten, na — 0.** Verholpen:
- **`/privacy` en `/terms` schoven zijwaarts** op 320 (inhoudsbreedte 330 en 356 pixels): lange woorden en adressen braken niet af. Toegevoegd: `overflow-wrap:break-word` en `hyphens:auto`, voor `code` — `overflow-wrap:anywhere`; de kop `h1` schaalt met `clamp(1.4rem, 6.5vw, 1.7rem)`;
- **`code` was 11,44 pixels**: zonder uitdrukkelijke lettertypefamilie verkleint de browser het vastebreedtelettertype. Er is nu een uitdrukkelijke familie opgegeven;
- **te kleine aanraakdoelen**: de navigatiekoppelingen van de juridische pagina's, de koppelingen «Beleid» / «Voorwaarden» en het vakje «Onthouden» op het aanmeldscherm zijn nu minstens 24 pixels hoog; de taalknop — 0,76 rem;
- **Fastmail op de e-mailbaan** heeft een echte aanmeldknop (IMAP), maar had geen eigen plek en stond afgesneden in een hoek op een breed scherm. Nu staan de zeven enveloppen zonder overlapping: op een breed scherm staat Fastmail boven naast Outlook, op mobiel drie aan elke kant; de test `mail-orbit-001` controleert nu dat elk van de 7 aanbieders een plek op de baan heeft (voor de wijziging faalde hij: 16/17, nu 18/18).

Tests: `mail-orbit-001` 18/18, `mailmob-001` 22/22, `site-001-404` 24/24.

| Voor | Na |
|---|---|
| ![voor: 174 fouten](schermafdrukken/p14-kaart-voor.webp) | ![na: 0 fouten](schermafdrukken/p14-kaart-na.webp) |
| ![voor: privacy op 320](schermafdrukken/p14-privacy-320-voor.webp) | ![na](schermafdrukken/p14-privacy-320-na.webp) |
| ![voor: terms op 320](schermafdrukken/p14-terms-320-voor.webp) | ![na](schermafdrukken/p14-terms-320-na.webp) |
| ![voor: aanmelden op 320](schermafdrukken/p14-id-320-voor.webp) | ![na](schermafdrukken/p14-id-320-na.webp) |
| ![voor: Fastmail afgesneden in de hoek](schermafdrukken/p14-mail-breed-voor.webp) | ![na: Fastmail op de baan](schermafdrukken/p14-mail-breed-na.webp) |
| ![voor: e-mail, telefoon](schermafdrukken/p14-mail-mobiel-voor.webp) | ![na](schermafdrukken/p14-mail-mobiel-na.webp) |

### 15. Eigen 404-pagina

De pagina «Pagina niet gevonden» (`src/NietGevonden.tsx`) bestond al, maar had vier fouten — alle verholpen:
- **«zachte 404»:** de server antwoordde op elk onbekend adres met 200, zodat zoekmachines en koppelingscontroles het als echte pagina zagen. Nu voert `server/platform/onbekend-pad.ts` dezelfde functie `resolve` uit `canonical-service.js` uit als de browser (in een afgeschermde `vm`-context, zonder tweede lijst van tabbladen), en antwoordt de server bij een onbekend adres met **404**. Tabbladen, oude adressen en aliassen, gasttoegang `id/toegang`, OAuth-terugkeer en gedeelde cloudkoppelingen blijven 200. Bij elke fout in de controle: oud gedrag (200);
- **zonder aanmelding** zag men het hele dienstenmenu (op hub bedekte het op 1366 breed ook de kaart), en op andere diensten in plaats van 404 het aanmeldscherm. Nu staat de 404-pagina zonder aanmelding op zichzelf, gecentreerd; met aanmelding de gewone schil (geen bedekking);
- **gecodeerd pad** (`/%D1%89%D0%BE`) → getoond zoals een mens het leest (`/що`);
- titel van het tabblad — «Сторінку не знайдено — <служба>» / «Pagina niet gevonden — <dienst>».

Bewakingstest `tests/eenheid/site-001-404.test.ts` — 24/24. axe-core — 0 schendingen.

| Voor | Na |
|---|---|
| ![voor: menu bedekt de kaart](schermafdrukken/p15-voor.webp) | ![na](schermafdrukken/p15-na.webp) |
| ![voor: pad gecodeerd](schermafdrukken/p15-voor-kodovanyi.webp) | ![na: pad gedecodeerd](schermafdrukken/p15-na-kodovanyi.webp) |
| ![voor: e-mail toont aanmelden](schermafdrukken/p15-voor-mail.webp) | ![na: e-mail](schermafdrukken/p15-na-mail.webp) |
| ![voor: telefoon](schermafdrukken/p15-voor-mobiel.webp) | ![na: telefoon](schermafdrukken/p15-na-mobiel.webp) |
| ![voor: statuscodes](schermafdrukken/p15-kody-voor.webp) | ![na: statuscodes](schermafdrukken/p15-kody-na.webp) |
| | ![na: Nederlands](schermafdrukken/p15-na-nl.webp) |
| | ![na: aangemeld, zonder bedekking](schermafdrukken/p15-na-aangemeld.webp) |

### 16. Kapotte koppelingen

Een nieuw hulpmiddel doorloopt weergegeven pagina's zonder aanmelding (aanmelden, gasttoegang, `/privacy`, `/terms`, 404, e-mail), verzamelt alle `a`, `link`, `img`, `script`, leest `sitemap.xml` en voegt de vaste adressen uit de code toe (`src/`, `backend/`, `public/`, `index.html`). Gecontroleerd: 305 interne adressen op de proefopstelling en 3 externe (Google-beleidspagina, Belgische gegevensbeschermingsautoriteit) — alle externe werken.

De eerste ronde toonde 181 «kapotte» adressen, maar dat was een fout in het hulpmiddel zelf: verzoeken van Playwright negeerden de naamomleiding en gingen naar de productiesite met de oude bouw (de productiesite werd alleen gelezen). Na de verbetering bleven 9 kandidaten over, elk met de hand nagegaan:
- **echte fout:** het bevestigingsvenster (`src/platform/bevestig-toegang.tsx`) opent op elke dienst, ook mcp en api, maar de koppeling «naar aanmeldmethoden» was relatief (`/aanmeldmethoden`) — daar leidde ze naar 404. Nu is het adres absoluut `https://id.tarasevych.com/aanmeldmethoden`, zoals in `kluis-poort.tsx`;
- `/methods`, `/sharing`, `/audit`, `/ai` — niet kapot: deze onderdelen verschijnen alleen op hun eigen diensten (id en admin), waar de paden openen (200);
- `mcp.tarasevych.com/Grok`, `/claude`, `/mcp` — adressen van de aparte MCP-brug (poort 8091), die op de proefopstelling ontbreekt;
- `/bestaat-niet` — bewuste controle van de 404-pagina.

Daarnaast is de naam gelijkgetrokken: de pagina en de voetregel hadden «Умови користування», de app «Умови використання». Nu overal «Умови використання», zoals in de opdracht van de eigenaar. Zonder de variabele `MR_EIGENAAR_NAAM` belandde een tweetalige vervanging in een eentalige zin («власник — власник / eigenaar»). Nu heeft elke taal een eigen vervanging: «приватна особа» / «een particulier». Evenzo gaf het ontbreken van `MR_CONTACT_EMAIL` «…активність на на запит / op aanvraag». Nu heeft elke zin een natuurlijke vervanging in de eigen taal («meldt verdachte activiteit bij de eigenaar», «Adres op aanvraag»).

Nieuwe bewakingstest `tests/eenheid/site-001-koppelingen.test.ts` — 6/6: gedeelde onderdelen `src/platform/**` hebben geen relatieve `href`; `sitemap.xml` en `robots.txt` wijzen naar iets bestaands; elk vast bestand uit `index.html` en de juridische pagina's staat in `public/`. `juridisch.test.ts` — 12/12.

| Voor | Na |
|---|---|
| ![voor: kandidaten](schermafdrukken/p16-kaart-voor.webp) | ![na](schermafdrukken/p16-kaart-na.webp) |
| ![voor: «Умови користування», «власник — власник / eigenaar»](schermafdrukken/p16-terms-voor.webp) | ![na](schermafdrukken/p16-terms-na.webp) |

### 17. Validatie van alle formulieren

**Server.** Een nieuw hulpmiddel stuurt naar elk van de 50 openbare POST-routes (aanmelden, gasttoegang, toegangsverzoeken, registratie van aanmeldmethoden enz.) acht kapotte inhouden: geen JSON, een lijst, `null`, een tekenreeks, verkeerde typen, te lange tekenreeksen, stuurtekens, een inhoud van 2 MB — samen 400 gevallen. Geen enkele crash (500 of verbroken verbinding): 116 × 400, 100 × 413, 63 × 401, 42 × 404 (geen dergelijke poging, transactie of ingeschakelde methode), 12 × 403, 6 × 409, 1 × 429 — steeds met een redencode; 48 × 200 — alleen-lezen routes (catalogus) die de kapotte inhoud gewoon negeren. De enige 12 antwoorden 503 zijn `ACCESS_WEBAUTHN_DISABLED` op twee eigenaarsroutes waar deze mogelijkheid op de proefomgeving bewust uit staat; dat is geen fout.

**Browser.** Het hulpmiddel controleert het gastformulier en het wachtwoordformulier zoals een mens en een schermlezer ze zien. Op de oude bouw — 7 fouten:
- een gastcode getypt op een Oekraïense indeling (А, В, Е, К, М, Н, О, Р, С, Т, Х, І) werd door de server geweigerd, hoewel hij er juist uitziet;
- ongeldige tekens (bijvoorbeeld U of «!») werden pas na weigering door de server zichtbaar;
- na weigering werd het veld niet als onjuist gemarkeerd (`aria-invalid`), was de melding niet aan het veld gekoppeld (`aria-describedby`) en ging de focus verloren — hetzelfde in het wachtwoordformulier (adres en wachtwoord).

**Verbeteringen:**
- nieuwe module `src/gast-code.ts`: Cyrillische dubbelgangers worden al tijdens het typen Latijn; ongeldige tekens worden meteen met uitleg getoond (`role=alert`); teller «N van 16 ingevoerd»; de knop «Verzenden» werkt alleen bij een volledige code; een code uit de koppeling `#code=` krijgt dezelfde opschoning;
- `src/GastToegang.tsx`: het veld heeft `aria-invalid` en `aria-describedby` naar de hint, de tekenmelding en de serverfout; na weigering keren focus en selectie terug naar het veld;
- `src/aanmelden/AanmeldZonderGoogle.tsx`: de foutmelding heeft een eigen `id`, de velden adres, wachtwoord en code worden gemarkeerd en verwijzen ernaar; na weigering komt de focus in het wachtwoordveld; `src/geheim/GeheimInvoer.tsx` kreeg de eigenschap `ariaInvalid`.

Herhaalde controle in de browser — 0 fouten. Nieuwe bewakingstest `tests/eenheid/site-001-formulieren.test.ts` — 22/22.

| Voor | Na |
|---|---|
| ![voor: overzicht](schermafdrukken/p17-kaart-voor.webp) | ![na](schermafdrukken/p17-kaart-na.webp) |
| ![voor: ongeldige tekens niet zichtbaar](schermafdrukken/p17-gast-ongeldig-voor.webp) | ![na](schermafdrukken/p17-gast-ongeldig-na.webp) |
| ![voor: wachtwoordfout zonder veldmarkering](schermafdrukken/p17-wachtwoord-fout-voor.webp) | ![na](schermafdrukken/p17-wachtwoord-fout-na.webp) |

### 18. Bescherming tegen spam

De site heeft geen open formulieren voor anonieme berichten (contactformulier, vrije registratie): alles wat zonder aanmelding gegevens aanneemt, is aanmelden, de gastcode, gedeelde koppelingen, terugroepadressen van diensten en de MCP-connector. Bescherming tegen spam betekent hier dus snelheidslimieten, tellers voor mislukte pogingen en controle van handtekeningen. Een lokveld is niet nodig: er is geen formulier dat een robot zonder geheim kan invullen.

**Inventaris.** Van de 56 openbare POST-routes (zonder sessie) hebben er 23 een strikte limiet per IP in `server/start.ts` (`STRIKTE_LIMIETEN`; bij een databasestoring weigeren in plaats van doorlaten) en 33 alleen de algemene grens van 600/min. Voor elk van die 33 is uitgezocht waarom dat volstaat: een eigen teller (code in het Telegram-venster — pauze en uitschakeling; gedeelde koppelingen — code van 192 bits, 120/min per IP en 10 wachtwoordpogingen per 5 min), een verplichte handtekening (GitHub, Telegram, Google, Microsoft), een toegangstoken (extensie, agenten, MCP), alleen lezen of idempotent afmelden. Een toegangsverzoek van een nieuwe gebruiker heeft al een grens van 5/uur per account en 30/uur per IP, en de eigenaar krijgt maar één melding.

**Live controle op de proefomgeving.** De eerste ronde toonde twee limieten die «niet werkten» — de oorzaak lag bij de proefomgeving: `E2E_LOKALE_LIMIETEN=1` vermenigvuldigt de strikte limieten met 20 voor lokale browsertests. Zonder die factor, zoals op de productiesite, werken alle 6 gecontroleerde limieten precies volgens de instellingen: gastcode en oude wachtwoordaanmelding — blokkade na 5 mislukte pogingen; aanmelden met wachtwoord — 429 vanaf de 11e poging; start van aanmelden zonder Google — vanaf de 31e; registratie van een MCP-client — vanaf de 21e; gedeelde koppeling — vanaf de 121e. De vensters zijn vast (60 s), daarom zijn de reeksen 2 × de limiet plus marge lang. De mens ziet de uitleg «Te veel pogingen. Probeer het over ~N min opnieuw» (uk + nl).

**Nieuwe bewakingstest** `tests/eenheid/site-001-spam.test.ts` — 50/50. Hij leest `PUBLIEKE_ROUTES` en `STRIKTE_LIMIETEN` en eist voor elke openbare POST-route een strikte limiet of een vastgelegde eigen bescherming met een merkteken dat in de code te vinden is. Daarnaast controleert hij: raadbare geheimen (wachtwoorden, gastcode, koppelcode van een agent, Telegram-code, sessieoverdracht, MCP-registratie en -tokens) hebben juist een strikte limiet; alle strikte limieten weigeren bij een databasestoring; de factor ×20 werkt alleen bij de waarde `1` en ontbreekt in `deploy/`. Een nieuwe route zonder bescherming glipt er niet meer ongemerkt door.

| Voor | Na |
|---|---|
| ![voor: limieten niet aangetoond, geen bewaking](schermafdrukken/p18-kaart-voor.webp) | ![na: 6 van 6 limieten, bewaking 50/50](schermafdrukken/p18-kaart-na.webp) |

### 19. Siteanalyse (samen met punt 5 uitgevoerd)

De serverkant bestond al (`backend/privacy.ts`: toestemming standaard uit, anonieme dagtellers), maar de interface riep haar nooit aan en niemand las de tellers. Nu: na toestemming één gebeurtenis `bezoek.<dienst>` per tabbladsessie (zonder paginapad, id, IP of apparaat); een beheerdersroute `POST /api/owner/admin/analyse-overzicht` (`admin.read`, alleen lezen) en een tabblad «Bezoeken» in «Diagnostiek» met perioden van 7/30/90 dagen. Geen externe analysediensten — nul nieuwe kosten en geen doorgifte aan derden.
Test `tests/eenheid/site-001-analyse.test.ts`: 12/12 (met een echte PostgreSQL 18-database).

| Voor | Na |
|---|---|
| ![voor](schermafdrukken/p19-analyse-voor.webp) | ![na](schermafdrukken/p19-analyse-na.webp) |

### 20. Één duidelijke oproep tot actie

**Controle «voor».** Het hulpmiddel `cta.mjs` bekeek 6 kernschermen (`id/` nieuw toestel, `id/` met bewaard account, `mail/`, `id/toegang`, `id/bestaat-niet`, `hub/privacy`) en beoordeelde de visuele hiërarchie van de knoppen en koppelingen in het hoofdgebied (buiten de bovenbalk met taal/thema, de juridische voetregel en de wettelijk gelijkwaardige knoppen van de toestemmingsbalk). Twee fouten gevonden:
1. Op het aanmeldscherm met een bewaard account was de kaart van de gebruiker bleek en ondergeschikt, terwijl de knop «Aanmelden met Google» eronder donker gevuld bleef als hoofdactie — de nevenactie overschreeuwde het snelle aanmelden van de eigenaar van het toestel.
2. Op de openbare juridische pagina's `/privacy` en `/terms` ontbrak in de kop een herkenbare hoofdknop terug naar de ruimte (`0` hoofdacties — enkel gewone tekstkoppelingen).

**Verbeteringen:**
- In `src/CanoniekOmlijsting.tsx`, `src/aanmeld-herontwerp.css` en `src/maquette-kern/maquette-aanmelden.css` kreeg de eerste bewaarde accountkaart `data-hoofdactie="true"` en de opvallende opmaak van de hoofdknop (contrast > 10:1), terwijl de Google-knop en extra methoden eronder een rustige omlijnde weergave `data-hoofdactie="false"` krijgen. Zonder bewaard account blijft de eerste aanmeldmethode de enige hoofdactie.
- In `backend/juridisch.ts` en `public/juridisch.css` is de koppeling «Мій простір · Mijn Ruimte» in de kop vormgegeven als de enige opvallende pilknop (contrast 8,1:1 in lichte en 9,6:1 in donkere weergave; `axe-core` — 0 schendingen). Op de 404-pagina (`src/NietGevonden.tsx`) zijn hoofd- en nevenactie expliciet gemarkeerd.

Herhaalde controle met `cta.mjs` — **0 fouten** (6 van 6 schermen hebben precies 1 hoofdactie). Nieuwe bewakingstest `tests/eenheid/site-001-cta.test.ts` — `8/8`, `aanmelden-integ` — `43/43`, `juridisch` — `12/12`.

| Voor | Na |
|---|---|
| ![voor: 2 fouten bij hoofdactie](schermafdrukken/p20-kaart-voor.webp) | ![na: 0 fouten op 6 schermen](schermafdrukken/p20-kaart-na.webp) |
| ![voor: Google-knop overschreeuwt bewaard account](schermafdrukken/p20-bewaard-voor.webp) | ![na: bewaard account is de enige hoofdactie](schermafdrukken/p20-bewaard-na.webp) |
| ![voor: kop van privacybeleid zonder hoofdknop](schermafdrukken/p20-privacy-voor.webp) | ![na: duidelijke knop terug naar de ruimte](schermafdrukken/p20-privacy-na.webp) |

### Taalzuivering op besluit van de eigenaar («акаунт» → «обліковий запис»)

Op uitdrukkelijk besluit van de eigenaar is het anglicisme «акаунт» in alle naamvallen en vormen overal vervangen door het zuivere Oekraïense «обліковий запис» in de interfacecode, gedeelde modules, servermeldingen, zoekwoordenboeken en uitrolscripts (`src/`, `shared/`, `backend/`, `server/`, `public/`, `deploy/`, `index.html` — samen 852 voorkomens in 285 bestanden; het ontwerp van het accountcentrum is opnieuw opgebouwd via `scripts/identiteit-maquette/bouw.mjs` en de zoekindex `shared/zoek-ui-knoppen.generated.ts` is bijgewerkt voor 2439 elementen). Het ondertekende browserextensiepakket `extension/` versie `0.9.7` bleef bewust ongewijzigd om de geldige `CRX3`-handtekening van de eigenaar te behouden tot herondertekening.

Een vergelijkende proef van alle 638 eenheidstestbestanden ten opzichte van de basis en gerichte nacontroles bevestigden 0 regressies (daarbij zijn de 404-verwachtingen in `maquette-001-kern.test.ts` en `ui-audit-g.test.ts` gelijkgetrokken). Bewakingstest `tests/eenheid/site-001-akaunt.test.ts` (8/8) toegevoegd. Dit onderdeel werd voorbereid door `Claude Opus 5.5 (High)` via `Antigravity Google` en na onderbreking door limietuitputting gecontroleerd en afgerond door `Gemini 4 Carbon High` van `Google Antigravity`.

| Voor | Na |
|---|---|
| ![voor: 852 voorkomens in 285 bestanden](schermafdrukken/akaunt-kaart-voor.webp) | ![na: 0 voorkomens, bewaking 8/8](schermafdrukken/akaunt-kaart-na.webp) |
| ![voor: oude Oekraïense formulering op gasttoegang](schermafdrukken/akaunt-toegang-voor.webp) | ![na: zuivere Oekraïense formulering op gasttoegang](schermafdrukken/akaunt-toegang-na.webp) |

### 21. Knoppen en interactieve elementen

**Controle «voor».** Het eind-tot-eindhulpmiddel `knoppen.mjs` controleerde op de lokale proefomgeving de interactieve elementen zowel zonder aanmelding (`id/`, `/toegang`, `/privacy`, 404-pagina) als met aanmelding als eigenaar op een eenmalige `rook`-server (`id/` instellingencentrum en het mobiele werkblad `hub/` op 390×844). Vier fouten gevonden:
1. Op de gasttoegangspagina `/toegang` (`src/GastToegang.tsx`) toonde de taalwisselaar `.gast-taal` de zichtbare tekst `NL` / `UA`, maar miste die zichtbare tekst in `aria-label` — een ernstige schending van WCAG 2.5.3 (`label-content-name-mismatch` in `axe-core`, breekt spraakbediening).
2. Aangemeld in het instellingencentrum `id/` stuurde het ontwerp `src/identiteit/maquette/IdentiteitMaquette.tsx` bij elke achtergrondlezing een verzoek `POST /api/owner/workspaces/list` naar een niet-bestaande route, wat telkens een `404`-netwerkfout veroorzaakte.
3. Na bevestiging van de sessie op `id/` bleef de tabbladtitel `document.title` staan op het aanvankelijke «Вхід — Мій простір» / «Aanmelden — Mijn Ruimte» in plaats van «Налаштування — Мій простір» / «Instellingen — Mijn Ruimte» (en bij taalwisseling in andere diensten werd de titel evenmin zonder herladen bijgewerkt).
4. Op een nieuw leeg werkblad `WerkbladV3` (`src/werkblad/WerkbladV3.tsx`) werd buiten de bewerkmodus enkel een leeg canvas getekend zonder verklarende kaart of knop om widgets toe te voegen of de standaardindeling te plaatsen.

**Verbeteringen:**
- `src/GastToegang.tsx`: de toegankelijke naam `aria-label` van `.gast-taal` begint nu met het zichtbare opschrift `MOVA_NAAM` (`NL — перемкнути мову на нідерландську` / `UA — taal wisselen naar Oekraïens`).
- `src/identiteit/maquette/IdentiteitMaquette.tsx`: de aanroep `/api/owner/workspaces/list` is vervangen door het canonieke `/api/owner/session/bootstrap`, dat de lijst `workspaces` zonder enige `404`-fout teruggeeft.
- `src/VerenigdDienstApp.tsx` en `src/App.tsx`: reactieve synchronisatie van `document.title` met de sessiestatus en de gekozen taal toegevoegd (met behoud van de `[ТЕХ]` / `[TECH]`-aanduiding van de technische strook en de eigen titel van de 404-pagina).
- `src/werkblad/WerkbladV3.tsx`: op een leeg werkblad verschijnt nu de uitnodigende kaart `.wb-leeg-stol` (`data-wb-leeg="1"`, `data-wb-aantal`) met twee acties — de hoofdknop «Uit bibliotheek toevoegen» en de nevenknop «Standaardindeling» (zet de standaardset voor de huidige toestelklasse klaar en bewaart haar). De zoekindex van de interface is bijgewerkt (2440 elementen).

Herhaalde proef met `knoppen.mjs` — **0 fouten** (11 van 11 live scenario's geslaagd). Nieuwe bewakingstest `tests/eenheid/site-001-knoppen.test.ts` — `7/7`, aangrenzende tests `werkblad-hoek-20261115` (`9/9`) en `identiteit-maquette` (`56/56`) groen.

| Voor | Na |
|---|---|
| ![voor: 4 fouten bij interactieve elementen](schermafdrukken/p21-kaart-voor.webp) | ![na: 0 fouten in 11 live scenario's](schermafdrukken/p21-kaart-na.webp) |
| ![voor: leeg mobiel canvas zonder uitleg](schermafdrukken/p21-werkblad-voor.webp) | ![na: kaart voor leeg werkblad met acties](schermafdrukken/p21-werkblad-na.webp) |
| — | ![na klik op «Standaardindeling»](schermafdrukken/p21-werkblad-standaard-na.webp) |

## Logboek

- **25.11.2026 23:25** — vertakking gemaakt vanaf `integratie`, taak `SITE-001` geregistreerd, `orch controleer` groen. Eerste overzicht van bestaande onderdelen.
- **25.11.2026 23:40** — punten 1–3 klaar; lokale testomgeving (PostgreSQL 18, Node 24, Chromium) buiten de opslagplaats opgezet.
- **25.11.2026 23:58** — punt 4 gecontroleerd (geen wijziging nodig); punten 5 en 19 klaar, volledige bouw met bewakers en typecontrole van de server groen.
- **26.11.2026 00:25** — punten 6–9 klaar (titels, voorbeeldafbeelding, pictogrammen, `sitemap.xml`, `robots.txt`); zwarte pagina van het tabblad «Bezoeken» verholpen; volledige bouw groen.
- **26.11.2026 06:00** — punten 10 en 11 klaar. De eigenaar gaf opdracht «акаунт» overal in de interface te vervangen door «обліковий запис».
- **26.11.2026 06:20** — punt 13 klaar: datumkleur en koppelingen in donkere weergave op de juridische pagina's verholpen; axe-core 0 schendingen.
- **26.11.2026 06:40** — punt 15 klaar: echte 404 op de server, losse pagina zonder aanmelding, gedecodeerd pad.
- **26.11.2026 07:10** — punt 14 klaar: meting op breedtes 320–768 gaf 174 fouten, na de verbetering 0; Fastmail kreeg een plek op de e-mailbaan.
- **26.11.2026 07:30** — punt 16 klaar: één echt kapotte koppeling verholpen, naam van de voorwaarden gelijkgetrokken, nieuwe bewakingstest.
- **26.11.2026 07:55** — punt 17 klaar: de server doorstond 400 kapotte verzoeken zonder crash; 7 formulierfouten in de browser verholpen, nieuwe bewakingstest.
- **26.11.2026 08:00** — punt 18 klaar: snelheidslimieten live gecontroleerd (6 van 6), 56 openbare routes uitgezocht, nieuwe bewakingstest.
- **26.11.2026 22:55** — sessie overgenomen door `Gemini 4 Carbon High` (`Google Antigravity`) na stop door limietuitputting van `Claude Opus 5.5 (High)` (`Antigravity Google`) op vastlegging `204f9ec8`; vervanging naar «обліковий запис» in 285 bestanden afgerond met bewakingstest 8/8 en auteurschapsregistratie van beide modellen.
- **26.11.2026 23:35** — punt 12 klaar (`Gemini 4 Carbon High` · `Google Antigravity`): `/toegang` 67 % lichter (666 → 220 kB), `id/` versneld (`LCP` −46 %, netwerkstilte 15,5 → 1,48 s, CPU-blokkering op telefoon −72 %, `4xx`-fouten 2 → 0), bewakingstest 9/9 toegevoegd.
- **26.11.2026 23:52** — punt 20 klaar (`Gemini 4 Carbon High` · `Google Antigravity`): op alle 6 kernschermen precies één hoofdactie gewaarborgd (2 → 0 fouten), bewakingstest 8/8.
- **27.11.2026 00:21** — punt 21 klaar (`Gemini 4 Carbon High` · `Google Antigravity`): live controle van alle knoppen en interactieve acties zonder en met aanmelding (4 → 0 fouten: `aria-label` op `/toegang`, 404 `/api/owner/workspaces/list` verholpen, tabbladtitel na aanmelden, kaart voor leeg werkblad in `WerkbladV3`), bewakingstest 7/7.
