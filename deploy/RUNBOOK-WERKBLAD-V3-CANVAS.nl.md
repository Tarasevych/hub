> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RUNBOOK-WERKBLAD-V3-CANVAS.uk.md) · **🇳🇱 Nederlands** ([origineel](./RUNBOOK-WERKBLAD-V3-CANVAS.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Werkblad v3 — canvas

Interactielaag van het vrije werkblad (Etappe C). Nog NIET aangesloten op `src/werkblad/Werkblad.tsx` — dat doet de integrator
achter de feature-flag `werkblad-v3`. Niets in dit onderdeel praat met de server; opslaan loopt via `onCommit` van de ouder.

## Bestanden
- `src/werkblad/canvas/kern.ts` — pure kern (geen React/DOM): slepen, formaat (8 randen), klemmen, raster, overlapbeleid,
  z-volgorde, vergrendelen, verwijderen, «Розмістити тут…», toetsenbordstappen, ongedaan/opnieuw, apparaatklasse, aanpassen
  van de computerindeling naar tablet/telefoon, teksten uk/nl.
- `src/werkblad/canvas/hooks.ts` — `useContainerBreedte` (ResizeObserver op de echte container) en `usePointerGestures`.
- `src/werkblad/canvas/Canvas.tsx` + `canvas.css` — de component.
- Tests: `tests/eenheid/werkblad-canvas-kern.test.ts`, `tests/e2e/werkblad-canvas.e2e.ts`, stand `tests/e2e/hulp/canvas-stand/`.

## Component
```tsx
<Canvas layout={CanvasLayout} render={(entry, { bewerken, schaal }) => …} limieten={(itemId) => ({ minW, minH, maxW, maxH })}
  onCommit={(layout) => …} editMode={bool} onRequestAdd={(plek?) => …}
  status="idle|saving|error|conflict" onRetry onReload lang="uk|nl" beleid={{ snap, raster, overlap }}
  titel={(entry) => string} onApparaat={(klasse, breedte) => …} />
```
- `onCommit` komt precies één keer per afgeronde wijziging: pointerup, menu-actie, ongedaan/opnieuw, of 600 ms na de laatste
  pijltjestoets. Escape, pointercancel, touchCancel, verloren pointer capture of instelmodus uit midden in een gebaar → geen commit.
- De commit wordt berekend uit het synchrone gebaarobject (`Gebaar`), nooit uit React-state (de race van v2 `eindMaat`).
- Beleid uit `layout.mode`: `free` = overlap mag (gesleepte tegel komt bovenop), `snap` = raster 8 px + geen overlap,
  `flow` = geen overlap. Bij «geen overlap» gaat een verplaatsing naar de dichtstbijzijnde vrije plek; een formaat dat tegen een
  buur loopt veert terug. Buren worden nooit verschoven (geen auto-compactie).
- Posities zijn logische px van `layout.canvasWidth`; op het scherm × `schaal` (= containerbreedte / canvasWidth). Zoom, zijbalk
  en draaien veranderen de opgeslagen waarden dus niet.
- Apparaatklasse uit de containerbreedte: < 600 telefoon, < 1024 tablet, anders computer. Heeft een klasse nog geen eigen indeling,
  dan maakt de ouder er één met `aanpassenVanaf(computerLayout, STANDAARD_CANVASBREEDTE[klasse], limieten)` (alleen de eerste keer).

## Bediening
- Muis: slepen na 5 px. Aanraken/pen: 500 ms stil houden (≤ 8 px), eerder bewegen = gewoon scrollen. Lang houden zonder bewegen
  of rechtermuisknop → menu «Додати / Розмістити тут… / Змінити розмір / Вперед / На передній план / Зафіксувати / Видалити».
- Grepen alleen in de instelmodus, tikvlak 44 px. Buiten de instelmodus geen gebaren: de inhoud werkt gewoon (links, scroll).
- Toetsenbord (WCAG 2.5.7): pijltjes = 8 px (raster bij snap), Ctrl = 1 px, Shift = formaat, Enter / Shift+F10 / menutoets = menu,
  Verwijderen = verwijderen, PageUp = vooruit, Ctrl+Z / Ctrl+Y = ongedaan/opnieuw, Escape = annuleren. Aankondigingen via aria-live.

## z-index
Alles binnen `.wbc` (`isolation:isolate`): items 1…n, geest 8000, gesleept item 8100, menu 9000, statusbalk 9100. Het canvas is
als geheel één laag; CanonicalChrome en dialogen liggen erboven. Geen `position:fixed` (plaatsing-controle).

## Tests draaien
```bash
export PATH=/opt/node24/bin:$PATH
node scripts/eenheidstests.mjs werkblad-canvas            # kern, geen DB nodig
PLAYWRIGHT_CORE=/pad/naar/playwright-core E2E_SCREENSHOTS=/workspace/audit-werkblad \
  node scripts/e2e-lokaal.mjs werkblad-canvas              # vite op 127.0.0.1:5391 + Chrome, alleen lokaal
```
De e2e start geen backend en geen database; Chrome krijgt `chromeArgs()` (alles behalve loopback → ~NOTFOUND) en een route-slot.

## Beperkingen
- Meervoudige selectie zit er niet in (één geselecteerd item tegelijk).
- Mappen (`parent`) worden niet op het canvas getekend; de map-tegel zelf wel (inhoud: Etappe B).
- Zoom 200 % is getest als gehalveerde CSS-viewport (zo werkt Chrome-zoom) en apart DPR 2; echte Ctrl+plus is in headless niet te sturen.
