> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RELEASE-NOTITIES-WERKBLAD-V3.uk.md) · **🇳🇱 Nederlands** ([origineel](./RELEASE-NOTITIES-WERKBLAD-V3.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Release-notities — Werkblad v3 (mijn-ruimte-20261027-163821)

**Bron-commit:** `1f9028a36b54c0cdfd6438902223d7f0e7cd4582` (branch `master`, /workspace/werkblad-v3). **Niet uitgerold.** Productie is niet aangeraakt;
uitrol alleen na de exacte owner-bevestiging en passkey volgens het runbook.

## Wat er verandert
- **Poort v2/v3** (`src/werkblad/Werkblad.tsx`): vlag `werkblad-v3` uit → exact de bestaande v2-code (ongewijzigd, eigen functie
  `WerkbladV2`); vlag aan → `src/werkblad/WerkbladV3.tsx` (aparte JS-chunk, alleen dan geladen). Eén extra verzoek `v3/laden`
  dat met de vlag uit alleen `{aan:false}` antwoordt en niets wijzigt.
- **Vrij canvas**: elk object (widget, snelkoppeling, map) heeft eigen x/y/w/h/z in logische px; geen raster van 96 px, geen
  auto-compactie. Slepen (muis na 5 px, aanraken na ±500 ms vasthouden), formaat aan alle randen/hoeken, toetsenbord (pijltjes,
  Shift, Enter-menu, Delete, Ctrl+Z/Y), één bewaaractie per afgerond gebaar; Escape/pointercancel bewaart niets.
- **Drie indelingen**: computer/tablet/telefoon volgens de ECHTE containerbreedte (ResizeObserver). Ontbreekt een laag, dan één
  keer afgeleid van de computerindeling (telefoon in flow-modus = geen overlap) en daarna onafhankelijk.
- **Bibliotheek «Все на сайті»** (werkbalk «Налаштувати робочий стіл» → «Бібліотека»): 131 items — 14 diensten, 90 pagina's
  (alle menu-items incl. subpagina's), 7 veilige opdrachten, 19 widgets, map; zoeken UA/NL, categorieën; planned/denied zichtbaar
  maar niet toe te voegen. Toevoegen met knop, toetsenbord of slepen naar het canvas.
- **Mappen**: snelkoppeling op een map neerzetten = in de map; «Вийняти» haalt hem eruit; map verwijderen zet de inhoud terug.
- **Eigen snelkoppelingen (usr:)**: eigen naam/icoon op een bestaand item, bewaard op de server zodra ze op het werkblad staan.
- **Live widgets**: dezelfde widgets en gegevensbronnen als v2 (lui geladen); planned/geweigerde widgets tonen de reden.
- **Versiecontrole**: versie per laag; een ander tabblad/apparaat dat sneller was → 409, conflictbalk «Перезавантажити»,
  niets overschreven. Netwerkfout → «Повторити».
- **Instellingen** (in de instelmodus «Параметри»): achtergrond; «Скинути стіл» (met bevestiging: v3 wissen en opnieuw overzetten
  uit v2); voor de eigenaar «Повернути розкладку v2» (met bevestiging: v2-backup terug in v2, v3 blijft).
- **Server**: `createWerkbladV3Routes` krijgt het register (`REGISTER_V3_HAKEN`): onbekende id's, vrije URL's, verkeerde soort,
  technische items in de privéruimte en `usr:` zonder geldige basis vallen weg; w/h binnen de registergrenzen; een minimum dat
  breder is dan het canvas wordt de canvasbreedte (v2-widgets op 390 px bleven anders buiten beeld).
- **Opdrachten** (`cmd:`) openen de doelsectie via de canonieke router met `?actie=<actionId>`; er wordt niets uitgevoerd.
- **Telefoon**: kleine tegels — lange UA-namen afgebroken binnen de tegel, kleiner icoon, volledige naam in `title` (ook mappen).
- Klein: ongebruikte variabele in `src/MailOpstelBewerker.tsx` weg (typecheck van de client is nu schoon).

## Uitrol
1. Normale uitrol van het archief. **Migratie 0114** (`migrations/0114_werkblad_v3.sql`) draait mee bij `npm run migrate`
   (of het installatiescript): drie tabellen onder RLS + vlag `werkblad-v3` met `aan=false`. Idempotent (tweemaal draaien
   verandert niets); raakt `app.werkblad_indeling` (v2) niet aan. Geen nieuwe omgevingsvariabelen.
2. Controle: `SELECT sleutel, aan FROM app.feature_flags WHERE sleutel='werkblad-v3';` → `f`;
   `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('werkblad_v3_lade','werkblad_layout','werkblad_items');` → 3× `t`.
3. Na de uitrol ziet iedereen nog v2 (vlag uit).

## Aanzetten voor één persoon
In «Прапорці» (technisch profiel met diensten.beheren) de gebruiker toevoegen aan `werkblad-v3`, of:
`UPDATE app.feature_flags SET aan=true, gebruikers=ARRAY['<user-id>'] WHERE sleutel='werkblad-v3';`
Bij het eerste bezoek wordt de v2-indeling eenmalig overgezet (per lade, in één transactie); de v2-rij blijft ongewijzigd en er
wordt een kopie bewaard (`werkblad_v3_lade.v2_backup`).

## Terugdraaien
- **Per persoon, direct**: vlag uit voor die persoon → v2 verschijnt meteen; v3-gegevens blijven (weer aan = zoals achtergelaten).
- **v2-indeling herstellen**: in v3 «Параметри» → «Повернути розкладку v2» (eigenaar) of `POST /api/owner/hub/werkblad/v3/terugdraaien`
  (werkt ook met de vlag uit).
- **Alles**: vlag uit (volstaat altijd). Alleen als het echt moet: tabellen van 0114 droppen (zie runbook §16) — v2 blijft werken.
- **Code**: het vorige archief (20261026-161349) terugzetten; 0114 kan blijven staan (wordt door die versie niet gebruikt).

## Bekende beperkingen
- Doelpagina's lezen `?actie=` nog niet: een opdracht-snelkoppeling opent de juiste sectie, niet de specifieke functie (bv. de opsteller).
- Eigen snelkoppelingen die nog NIET op het werkblad staan bewaart alleen de browser (localStorage); geplaatste staan op de server.
- Mappen: één niveau; in een map stoppen gaat door slepen op de map (op de telefoon in flow-modus kan dat niet, want daar mag niets
  overlappen — gebruik de computer/tablet of plaats de map naast de snelkoppeling). Een map hernoemen heeft nog geen knop.
- De eigen achtergrondafbeelding blijft in de v2-kolom; in v3 kan de keuze «Власне» alleen als die afbeelding al bestaat
  (uploaden gebeurt nog in v2).
- Voorbeeld van een ander apparaat (preview) in de instelmodus is niet gebouwd (optioneel in de opdracht).
- Ongedaan/opnieuw alleen met Ctrl+Z / Ctrl+Y (geen knoppen); toevoegen uit de bibliotheek valt niet onder ongedaan maken.
- Server-rechten: de server controleert register, soort, ruimte en apparaat; de rechten mcp/api-platform worden bij elke klik
  gecontroleerd (en door de doeldienst), niet bij het bewaren van een positie.

## Testresultaten (lokaal, 27.10.2026, Node 24, PostgreSQL 17, eigen database `wb3d`)
- Eenheidstests: werkblad-canvas-kern 53/53, werkblad-indeling 69/69, werkblad-register 34/34 (4 nieuw: serverhaken, ruimtescheiding,
  grenzen, minimum ≤ canvas), werkblad-routes (v2) 29/29, werkblad-v3-normalisatie 37/37, werkblad-v3-routes 52/52 (echte router + DB;
  3 nieuw: register op de server, grenzen, persistentie van map/mapinhoud/usr:), menu-* 232/232 (8 bestanden), plaatsing 68/68.
- E2E van de werkers (vite-stand, geen backend): werkblad-canvas 57/57, werkblad-bibliotheek 25/25.
- **Interactieve E2E tegen de echte server + DB** (`scripts/lokaal-e2e/werkblad-v3-integratie.mjs`): **32 OK, 0 FOUT, 1 niet
  geverifieerd**. Gedekt: vlag uit = v2 + niets overgezet; overzetting v2→v3 (13 widgets, 3 lagen, backup); PC-drag naar exacte x/y
  (±1 px) met buren onaangeroerd + F5 behoudt; formaat zonder 96-px-stap (Δ52×36) en registermin/-max; Escape bewaart niets;
  bibliotheek 131/131 (14/14 diensten, 90/90 pagina's), planned/denied, zoeken, toevoegen met knop en HTML5-slepen, map + parent +
  F5; opdracht opent mail met `?actie=`; twee contexten → 409 + conflictbalk, DB = eerste schrijver, herladen toont serverversie;
  kleinere container en zoom 200 % wijzigen niets in de DB; telefoon 390: eerste bezoek afgeleid + één keer bewaard, vegen scrolt zonder
  drag, lang indrukken → drag + één bewaren (PC onaangeroerd), touchcancel bewaart niets, formaat met de vinger, DOM = DB × schaal en
  geen overlap, lange UA-namen binnen de tegel; tablet staand/liggend alles zichtbaar; reset met bevestiging; «Повернути розкладку v2»;
  vlag uit → v2 werkt; vlag weer aan → zoals achtergelaten; 0 JS-fouten; 0 verzoeken buiten de lokale keten.
  Niet geverifieerd: de echte zijbalk-knop (bij 1440 px niet zichtbaar in deze modus) — gedekt door de containerbreedte-test.
  Schermafdrukken: `/workspace/audit-werkblad/int-*.png`, uitslag `int-uitslag.json`.
- Bestaande lokale browsertest (`scripts/lokaal-e2e/e2e.mjs`): 10/10.
- Typecheck client (`tsc -p tsconfig.json`): 0 fouten. `npm run build` (incl. kaart-, plaatsing-, contrast- en bundelcontroles): geslaagd.
- Typecheck server (`tsc -p tsconfig.server.json`) heeft BESTAANDE fouten in `backend/index.ts` (gmail-/mail-symbolen) en
  `backend/mail-afzenders.ts` — niet van dit werk, geen enkele in werkblad-bestanden; de server-build (esbuild) slaagt.

## Niet geverifieerd
- Niets op productie of staging (bewust). Geen echte Google-aanmelding (sessie gezaaid zoals de bestaande e2e).
- Echte apparaten (iOS/Android, stylus), echte Ctrl+plus-zoom (gesimuleerd als halve CSS-viewport), schermlezers.
- Prestaties met 400 objecten in de browser (alleen server-limiet getest).
- Technische ruimte in de browser (wel in de route-eenheidstests: eigen lade, technische widget alleen daar, RLS).
