> 🌐 **Taal / Мова:** [Українська](РЕЄСТР-ПЕРЕГЛЯДАЧА-ВКЛАДЕНЬ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Bijlageviewer mail.* — inventaris en ontwerp v2 (UI-006 / BUG-003, 29.10.2026)

Vlag: `bijlage-viewer-v2` (migratie 0134, standaard UIT). Uit = de oude kop en PDF-balk, ongewijzigd.
Plaats in de code: de werkbank in `src/GoogleMailWerkruimte.tsx` (`<article class="google-mail-attachment-preview">`, kop + `.mail-viewer-stage`),
de PDF-engine `src/MailPdfVoorbeeld.tsx` (pdf.js), de inhoud `MailAttachmentPreviewBody` in `src/MailBijlageVoorbeeld.tsx` (UFW, niet gewijzigd),
met daarin `AiVertalingBalk` (ШІ/vertaling) en per formaat de voorbeeldcomponent (`MailGrafischVoorbeeld`, …).
`src/MailBijlageVensters.tsx` (UFW, losse platformvensters) is NIET gewijzigd; v2 geldt alleen voor de werkbank.

## 1. Inventaris van de bestaande bediening (vóór v2)

| # | Element (oud) | Waar | Functie | Groep v2 | Prioriteit | Staten | Gedrag per breedte (oud) |
|---|---|---|---|---|---|---|---|
| 1 | Bestandsnaam `<strong>` | kop | titel | titel | 1 | — | eigen regel op telefoon (kop werd 3–4 regels) |
| 2 | Badge «Похідна копія / Лише перегляд…» | kop | soort bewerkingsresultaat (technisch) | ⓘ-paneel «Про файл» | 4 | — | altijd zichtbaar |
| 3 | ‹ / «1 / 3» / › | kop | vorige/volgende bijlage | bijlagen | 1 | uitgeschakeld aan de randen | grote omrande knoppen |
| 4 | Zoom − / «Вписано» / + | kop (alleen afbeelding) | zoom 50–250 %, waarde = terug naar passend | zoom | 2 | — | drie losse knoppen |
| 5 | «Сторінка · авто» e.d. | kop (overige) | alleen tekst (weergavemodus) | ⓘ-paneel | 5 | — | tekst in de kop |
| 6 | «Поділитися» | kop (afbeelding) + ••• | Web Share | download ▾ | 3 | — | dubbel (kop én •••) |
| 7 | «PDF: анотації / форми» / «Редагувати …» (≈30 varianten) | kop | bewerker openen | gereedschap | 2 | — | lange tekstknop |
| 8 | «Друк» | kop + ••• | afdrukken | bestand | 3 | — | dubbel |
| 9 | «Зберегти» | kop + ••• | opslaan in opslag (dialoog) | download ▾ | 2 | — | dubbel |
| 10 | «Завантажити» | kop + ••• | download origineel | download (hoofdactie) | 1 | — | dubbel |
| 11 | ••• (`<details>`) | kop | bevat 6/8/9/10 opnieuw | ••• (alleen smal) | — | open/dicht | op computer verborgen via CSS, op telefoon zichtbaar |
| 12 | «Згорнути» (tekst + pictogram) | kop | minimaliseren naar de strook | venster | 1 | — | grote tekstknop |
| 13 | «Закрити» (tekst + pictogram) | kop | sluiten | venster | 1 | — | grote tekstknop |
| 14 | ШІ-аналіз і переклад (`AiVertalingBalk`) | inhoud, boven het document | AI/vertaling | ШІ (paneel op verzoek) | 3 | in-/uitgeklapt | altijd een balk boven het document |
| 15 | PDF ↑ / «1 / 6» / ↓ | PDF-balk | vorige/volgende pagina | pagina’s | 1 | uitgeschakeld aan de randen | teller niet bewerkbaar |
| 16 | «По ширині» / «Вся сторінка» / «100%» | PDF-balk | passend maken (aria-pressed) | modus (segment) | 1 | actief | drie tekstknoppen |
| 17 | PDF − / «100%» / + | PDF-balk | extra zoomfactor bovenop de modus | zoom | 1 | — | waarde = factor, niet het werkelijke % |
| 18 | PDF-profiel/handtekening (`MailPdfProfileBanner`) | inhoud | XMP/handtekening-bewijs (technisch) | ⓘ-paneel | 4 | — | altijd zichtbaar |
| 19 | Grafisch: «PNG / Питомий decode оглядача» + Format/Bytes/Width/Height | inhoud (afbeelding) | technische metadata | ⓘ-paneel | 5 | — | altijd zichtbaar |
| 20 | Klik naast de inhoud / op de achtergrond | stage/backdrop | minimaliseren | ongewijzigd | — | — | — |

## 2. Ontwerp v2 (document eerst)

Kop (één regel, 53 px): `[naam][ⓘ]  [‹ 2/3 ›] [− 100% +]* | [✦ ШІ] [✎] | [⬇ Завантажити ▾] | [🖶] | [⤡] [×]`  (*alleen afbeelding)

* Groepen met een dunne scheidingslijn; pictogrammen 17–18 px in een raakvlak van 44×44 px.
* Tooltip: muis (na 350 ms), toetsenbordfocus, en op aanraakscherm lang indrukken (500 ms) — dan wordt de actie NIET uitgevoerd.
  Elke knop heeft `aria-label` + `aria-describedby` (tooltip); sneltoets in de tooltip waar die bestaat (Esc).
* Kleur: hoofdactie (downloaden) merkaccent; ШІ eigen paarse accent; sluiten rood bij aanwijzen; overige gedempt. Status ook zonder kleur
  (✓ bij succes, ! bij fout, draaiend teken bij bezig, `aria-busy`).
* Split-knop: «Завантажити» = één klik; ▾ = «Завантажити оригінал», «Зберегти в сховище…», «Поділитися» (afbeelding). Geen dubbele knoppen meer.
* PDF-balk (zwevend, blijft bovenaan): `[↑ [3] / 6 ↓] [↔ | ▯ | 1:1] [− 118% +] [⇈] [verbergen]`.
  - Paginateller is een invoerveld (Enter springt). Segmenten = radiogroep (pijltjestoetsen, Home/End), glijdende markering.
  - Zoomwaarde = het WERKELIJKE percentage van de huidige pagina. +/− of een precieze waarde zetten de modus op handmatig
    (`fit=actual`, factor = gekozen %) — geen segment actief; passend maken en handmatig zoomen botsen dus nooit.
  - Modus, zoom en «balk verborgen» worden per apparaat bewaard (localStorage `mr-bijlage-v2-weergave`, alleen weergave).
* Gedeeld paneel (rechts 360 px op computer, onderblad op telefoon ≤ 760 px): «ШІ і переклад» (de echte `AiVertalingBalk` wordt erin geplaatst)
  of «Про файл» (naam, type, grootte, weergave, bewerkingssoort, plus PDF-profiel en grafische metadata). Esc sluit eerst menu, dan paneel.
* Breedteniveaus (gemeten op de kop, niet op het scherm): ≥ 900 px met etiket «Завантажити»; 620–899 px alleen pictogrammen;
  < 620 px: ⓘ, ШІ, bewerken, afdrukken, opslaan, delen (en bij afbeeldingen ook minimaliseren) naar «•••», zoom van afbeeldingen compact
  (alleen de waarde, − en + in het venster), teller naast de naam. Nooit een tweede regel.
* `prefers-reduced-motion`: alle animaties/overgangen uit.
* Formaten: PDF (PDF-balk), afbeelding (zoomgroep in de kop), video/audio/tekst/Office/overige (alleen kop; hun eigen bediening blijft in de inhoud).

## 3. BUG-003 — scrollen met twee vingers (bewezen oorzaak)

Gemeten in de stand (zie test): onder de cursor/vinger zat `.mail-pdf-preview` met `overflow:auto; overscroll-behavior:contain; height:100%`
(regel uit `src/mail-lezer-verbeteringen.css`). In de werkbank is die hoogte niet bepaald, dus het blok groeit mee (scrollruimte 0) en is
toch een scrollcontainer; `contain` verbiedt het doorgeven aan de echte scroller `.mail-viewer-preview-cache`. Gevolg: muiswiel, twee vingers
op het touchpad (wheel-events) en vegen op het aanraakscherm deden niets boven het document (alleen de schuifbalk werkte).
Geen wheel/touch-handler met `preventDefault` betrokken (gecontroleerd: `defaultPrevented=false`), geen `touch-action:none` in de keten.
Oplossing (zonder vlag, bugfix): `src/bijlage-v2/bijlage-scroll-fix.css` — in de werkbank is `.mail-pdf-preview` geen scroller meer
(`height:auto; overflow:visible; overscroll-behavior:auto`); de stage krijgt `touch-action: pan-x pan-y pinch-zoom`.
De sleepbare vensters (`platform/vensters`) gebruiken alleen de greep in de kop (`touch-action:none` op `.venster-kop`) — geen conflict.

## 4. Tests

`tests/e2e/bijlage-viewer-v2.e2e.ts` (stand `tests/e2e/hulp/bijlage-stand`, echte inhoud en PDF-engine, touch-emulatie via CDP) en
`tests/eenheid/bijlage-viewer-v2-20261029.test.ts`.
