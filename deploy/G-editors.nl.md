> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./G-editors.uk.md) · **🇳🇱 Nederlands** ([origineel](./G-editors.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Rapport G: editors (7.1–7.4)

Codecontrole. Browser en e2e **zijn niet gedraaid**. Unittest — `node scripts/eenheidstests.mjs bewerker-schil-20261026`.

De kern blijft `src/MailOpstelBewerker.tsx` (ProseMirror, `data-mail-compose-model='prosemirror'`). `Opsteller` zet `data-opsteller*` op de bestaande `<section>` via `cloneElement`. De mogelijkheden `link`, `image`, `background`, `shortcuts` staan aan zonder feature-flag. Drie schermen (nieuw bericht, antwoord, document) zijn nog steeds gescheiden; de tekst loopt via dezelfde `MailComposeEditor`.

## 7.4

**In de code, zonder testopstelling:**

1. Link: klasse `mail-compose-link-editor`, `position:fixed` in `src/editor/opsteller.css`.
2. Cursor: `emittedHtmlRef` en `TextSelection`, geen sprong naar het begin na eigen HTML-uitvoer.
3. Ctrl/Cmd+B, I, Z in `editorPlugins()` zowel bij het aanmaken als bij het synchroniseren van `value`.
4. Afbeelding: bestand in «Nieuw bericht» (`onChange`, tot 4 MB, data-URL) en `plakBeeld` bij paste/drop. Als `files` leeg is, wordt `clipboardData.items` / `dataTransfer.items` genomen via `getAsFile()` (één doorgang, zonder tweede `getAsFile` op dezelfde buffer). Tekst zonder afbeelding wordt niet onderschept.
5. Achtergrond: `data-mail-bg`, `leesBriefAchtergrond` neemt de citaatkleur niet over.

## 7.1 Concept

`losConceptOp`:

- het laatste bericht in de gesprek zonder `DRAFT` — antwoord daarop;
- als de gesprek leeg is of geen bovenliggend bericht heeft, maar de client al een ander id kent (`ouderId` uit de zichtbare rij van dezelfde `threadId`) — eveneens een antwoord;
- een `ouderId` dat gelijk is aan het concept zelf, wordt geen antwoord;
- anders `mail:open-concept` en de lezer van het concept zelf wordt niet geopend.

`GoogleMailWerkruimte` vult na `loadThread` het `ouderId` aan vanuit `visibleMessages`, uitsluitend als er in de gesprek geen bovenliggend bericht zit. Er is geen aparte Gmail `drafts.get`. Als zowel de gesprek als de huidige lijst geen bovenliggend bericht bevat (typisch het tabblad «Concepten»), opent het bericht nog steeds als nieuw bericht. Op een live Gmail-omgeving is dit niet vastgelegd.

## 7.2–7.3

Sjablonen: `height:auto!important` buiten `@media`, actie «Invoegen». De rechtermuisknop wordt niet meer onderdrukt; `data-native-context='1'`.

## Wat nog openstaat

- Geen browser- en e2e-run: het linkportaal, het cursorgedrag en de sjabloonhoogte zijn alleen in een live DOM zichtbaar.
- Geen `drafts.get`. Een bovenliggend bericht dat noch in de gesprek noch in de huidige lijst voorkomt, opent als een nieuw bericht.
- De drie opstelschermen zijn niet samengevoegd tot één enkel product.
