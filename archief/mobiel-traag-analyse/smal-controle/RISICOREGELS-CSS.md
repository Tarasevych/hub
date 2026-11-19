# Risicoregels in CSS — brede afstammelingen in smalle mediaquery's

Bron: `src/**/*.css` van vastlegging `b0d69f8d` (uitgave 20261110-141448). Geen wijziging in de code.
«Smal» betekent hier: `max-width` of `max-device-width` tot en met 900 px, of `hover:none` / `pointer:coarse`.
Alleen regels met lay-out-eigenschappen en een breedtescore van minstens 6. Niets is hier hersteld.

## Bekende oorzaak (ter referentie)

In `src/ontwerp/mobiel.css` rond regel 17, binnen `@media (max-width:700px)`:

```css
:where(.canonical-content, .venster-inhoud, .modal, .page, .auth-card, .mcp-consent-dialog)
  :where(div, section, article, header, footer, main, nav, aside, form, fieldset, ul, ol, dl, table, pre, figure)
{ max-width: 100%; }
```

Dit is de bewezen oorzaak van het trage telefoonbeeld: de lay-outmotor moet bij ≤700 px alle nakomelingen in die typen herberekenen. Versterker daarnaast: `useOnderbalken` in `src/plaatsing/Plek.tsx` (MutationObserver op `document.body`).

## Overige brede regels in smalle mediaquery's (18 stuks)

| Plaats | Media | Selector | Waarom breed | Eigenschappen | Score |
|---|---|---|---|---|---|
| `src/ontwerp/mobiel.css:16` | max-width 700 px | `/* жоден блок усередині робочої області не ширший за viewport */ :where(.canonical-content, .venster-inhoud, .modal, .page, .auth-card, .mcp-consent-dialog) :where(div, section, article, header, footer, main, nav, asi…` | :where/:is met 6 leden; :where/:is met 16 leden; 16 typen elementen; brede afstammeling (spatie); kommaselector (21) | `max-width` | 39 |
| `src/ontwerp/mobiel.css:25` | max-width 700 px | `:where(button, [role=button], a.knop, .knop, .knop-primair, .knop-secundair, .knop-stil, .knop-gevaar, select, input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=hidden]), textarea…` | :where/:is met 17 leden; kommaselector (17) | `max-width` | 20 |
| `src/ontwerp/mobiel.css:26` | max-width 700 px | `:where(button, [role=button], a.knop, .knop, .knop-primair, .knop-secundair, .knop-stil, .knop-gevaar, select, input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=hidden]), textarea…` | :where/:is met 17 leden; kommaselector (19) | `min-height` | 20 |
| `src/index.css:157` | max-width 700 px | `/* старі класи кнопок (.secondary 36 px, .small 33 px) і посилання внизу блока (16 px) */ :is(.primary,.secondary,.ghost,.success,.warning,.footer-button,.small):where(button,a,label,[role=button],input,select,summary)` | :where/:is met 7 leden; :where/:is met 7 leden; kommaselector (13) | `min-height` | 18 |
| `src/mail-mobiel-passend.css:106` | max-width 720 px | `html body .ai-vertaling-balk .ai-vb-main-row > *` | universele *; brede afstammeling (spatie) | `max-width, min-width` | 11 |
| `src/mail-mobiel-passend.css:111` | max-width 720 px | `html body .ai-vertaling-balk .ai-vb-modes > *` | universele *; brede afstammeling (spatie) | `flex, white-space` | 11 |
| `src/ontwerp/mobiel.css:18` | max-width 700 px | `/* фіксовані ширини в px у сторінках стають «не більше за екран» */ :where(.canonical-content, .venster-inhoud, .modal) :where([style*="width"])` | brede afstammeling (spatie); attribuutkiezer [style*=] | `max-width` | 9 |
| `src/ontwerp/mobiel.css:38` | max-width 700 px | `:where(select, textarea, input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=hidden]))` | :where/:is met 8 leden | `width` | 8 |
| `src/ontwerp/mobiel.css:43` | max-width 700 px | `/* довгі ідентифікатори/адреси переносяться, а не розтягують блок */ :where(code, kbd, pre, a[href^="http"], .id, .mono, [data-code], [data-id])` | :where/:is met 8 leden | `overflow-wrap, word-break` | 8 |
| `src/afstemming-vnext/afstemming-mobiel.css:26` | pointer:coarse | `[data-afv-controles] [role='list'] > *, [data-afv-releases] [role='list'] > *` | universele * | `min-height` | 6 |
| `src/agenten/agenten-tabs-2.css:80` | max-width 560 px | `.ag2-werkbalk>*,.ag2-filters>*` | universele * | `flex` | 6 |
| `src/cloud-vnext/cloud-vnext-mobiel.css:20` | max-width 760 px, pointer:coarse | `.cvn-werkbalk > *` | universele * | `flex, min-width` | 6 |
| `src/cloud-vnext/cloud-vnext-mobiel.css:22` | max-width 760 px, pointer:coarse | `.cvn-werkbalk.is-scrol > *` | universele * | `flex` | 6 |
| `src/cloud-vnext/cloud-vnext-mobiel.css:30` | max-width 760 px, pointer:coarse | `.cvn-kruimels > *` | universele * | `flex` | 6 |
| `src/index.css:146` | max-width 640 px | `.hero-actions > *` | universele * | `flex` | 6 |
| `src/mail-qa-2026-10.css:53` | max-width 560 px | `html body .mail-new-message>footer>*` | universele * | `flex, margin, width` | 6 |
| `src/ontwerp/mobiel.css:23` | max-width 700 px | `/* ряди кнопок переносяться; кнопки не тонші за 44px і не ширші за екран */ :where(.knoppen, .acties, .form-actions, [class$="-acties"], [class$="-actions"], [class$="-knoppen"])` | :where/:is met 6 leden | `flex-wrap` | 6 |
| `src/telegram-aanmelden/telegram.css:70` | max-width 640 px | `.tga-sectie *` | universele * | `min-width` | 6 |

## Even brede regels buiten een mediaquery (niet hersteld, 17 stuks)

Deze gelden op elke breedte. Ze zijn geen bewezen oorzaak van de telefoontraging, maar dezelfde soort selector kan duur zijn.

| Plaats | Selector | Waarom breed | Eigenschappen | Score |
|---|---|---|---|---|
| `src/identiteit/maquette/maquette-omlijsting.css:59` | `.mr-mq.mr-mq.mr-mq.mr-mq :where(div,section,article,header,footer,main,nav,aside,form,fieldset,p,ul,ol,li,dl,dt,dd,label,table,pre,figure,details,summary,span,h1,h2,h3,h4,strong,em,small,kbd,a):where(:not(.mq-echt *))` | universele *; :where/:is met 33 leden; 29 typen elementen; kommaselector (33) | `max-width, min-width` | 34 |
| `src/identiteit/maquette/maquette-omlijsting.css:57` | `.mr-mq.mr-mq.mr-mq.mr-mq :where(blockquote,dl,dd,h1,h2,h3,h4,h5,h6,hr,figure,p,pre):where(:not(.mq-echt *))` | universele *; :where/:is met 13 leden; 12 typen elementen; kommaselector (13) | `margin` | 31 |
| `src/connector-v2/connector-v2.css:216` | `.v2-wizard :is(section,div,header,footer,label,p,ul,ol,li,form,fieldset)` | :where/:is met 11 leden; 11 typen elementen; kommaselector (11) | `min-width` | 23 |
| `src/mcp-toestemming-venster.css:53` | `.mcp-consent-dialog :is(section,div,header,footer,label,p,ul,ol,li,form,fieldset)` | :where/:is met 11 leden; 11 typen elementen; kommaselector (11) | `min-width` | 23 |
| `src/ontwerp/primitieven.css:36` | `:is(button, a, [role=button], input[type=submit], input[type=button]):where(.knop, .knop-primair, .knop-secundair, .knop-stil, .knop-gevaar, .knop-icoon, .primary, .secondary, .ghost, .success, .warning, .footer-butto…` | :where/:is met 14 leden; kommaselector (18) | `display, height, max-width, min-height, min-width, overflow-wrap, padding` | 18 |
| `src/ontwerp/primitieven.css:17` | `:where(code, kbd, samp, pre, .code, .mono, [data-code], [data-id], .id, .sleutel, .hash)` | :where/:is met 11 leden; kommaselector (11) | `overflow-wrap` | 15 |
| `src/platform/sluitknop.css:9` | `:where(button, a, summary):where([class*="-close"],[class*="close-"],[class$="close"],[class*="sluit"],[class$="-x"],[class*="-wis"],[data-venster-knop="sluit"],[data-nm-sluit]):not(:has(span))` | :where/:is met 8 leden; attribuutkiezer [class*=] op brede groep; kommaselector (10) | `display, height` | 15 |
| `src/connector-v2/connector-v2.css:10` | `:is(.v2-tab,.v2-kiezer,.v2-agenten,.v2-agent,.v2-kant,.v2-wizard,.v2-wizard-deel,.v2-agent-rechten)>*` | universele *; :where/:is met 8 leden | `min-width` | 14 |
| `src/identiteit/maquette/maquette-omlijsting.css:54` | `.mr-mq.mr-mq.mr-mq.mr-mq :where(img,svg,video,canvas,audio,iframe,embed,object):where(:not(.mq-echt *))` | universele *; :where/:is met 8 leden | `display` | 14 |
| `src/identiteit/maquette/maquette-omlijsting.css:42` | `.mr-mq.mr-mq.mr-mq.mr-mq :where(h1,h2,h3,h4,h5,h6):where(:not(.mq-echt *))` | universele *; :where/:is met 6 leden | `overflow-wrap` | 12 |
| `src/mail-nieuw-bericht.css:112` | `html body .mail-new-message > footer :is(.mail-ai-trigger, .mail-sched-trigger, .mail-nm-hulpen, .mail-nm-wis, .mail-nm-wis-vraag > button, button.primary)` | :where/:is met 6 leden; brede afstammeling (spatie) | `box-sizing, height, min-height` | 11 |
| `src/ontwerp/primitieven.css:54` | `:where(.knop, .knop-primair, .knop-secundair, .knop-stil, .knop-gevaar, .knop-icoon) svg` | :where/:is met 6 leden; brede afstammeling (spatie) | `flex, height, width` | 11 |
| `src/ontwerp/primitieven.css:53` | `:is(button, a, [role=button], input[type=submit], input[type=button]):where(.knop.is-klein, .knop-primair.is-klein, .knop-secundair.is-klein, .knop-stil.is-klein, .knop-gevaar.is-klein, .small)` | :where/:is met 6 leden; kommaselector (10) | `min-height, padding` | 10 |
| `src/beheer-uitrol.css:25` | `` (0,1,0): BEIDE schuifpijlen van de tabbalk werden zichtbaar, zonder left/right, precies op elkaar — «‹» over «›» = een kruisje in een rondje naast «Огляд». Daarom alleen nog binnen de oude containers. Zie tests/eenh…` | brede afstammeling (spatie); kommaselector (9) | `display, padding` | 9 |
| `src/mail-bijlage-werkbank.css:1` | `.google-mail-attachment-preview[data-workbench-layout='inspector'] :is(.mail-security-preview,.mail-threat-preview,.mail-scientific-preview,.mail-music-preview,.mail-linguistics-preview,.mail-vtt-rpg-preview,.mail-ml-…` | :where/:is met 9 leden | `box-sizing, max-width, width` | 9 |
| `src/mail-bijlage-werkbank.css:1` | `.google-mail-workspace .mail-sheet-editor :is(.mail-sheet-editor-grid,.mail-cad-source-editor,.mail-engineering-source-editor,.mail-security-source-editor,.mail-threat-source-editor,.mail-network-source-editor,.mail-d…` | :where/:is met 9 leden | `max-height` | 9 |
| `src/mail-bijlage-werkbank.css:1` | `.google-mail-workspace :is(.mail-cad-editor,.mail-engineering-editor,.mail-security-editor,.mail-threat-editor,.mail-network-editor,.mail-devops-editor,.mail-bio-editor,.mail-medical-editor)` | :where/:is met 8 leden | `max-width` | 8 |

## Verwante regels in dezelfde mediaquery (lagere breedtescore, wél lay-out)

Deze staan in `src/ontwerp/mobiel.css` in hetzelfde blok `@media (max-width:700px)` als de bewezen oorzaak. Ze zijn smaller, maar raken wél de lay-out. Niet hersteld in deze taak.

- Regel rond **19–20**: `:where(table) { display: block; max-width: 100%; overflow-x: auto; }` en de kinderen `thead, tbody, tfoot` als `display: table` met `min-width: max-content`. Alle tabellen krijgen een ander opmaakmodel.
- Regel rond **23**: knoppen en velden (`button`, `[role=button]`, `.knop*` , `select`, `input`, `textarea`, `summary`) krijgen `max-width: 100%` en vaak `min-height` van de tikhoogte.
- Regel rond **33–38**: vensters/dialogen op volle breedte, raster van formulieren naar één kolom, velden `width: 100%`.

Daarnaast, **buiten** de mediaquery (regel rond 21): dezelfde brede containerlijst met `min-width: 0` op nog meer typen (inclusief `p`, `li`, `a`, `code`, koppen). Dit geldt op elke schermbreedte en is een klassieke maat tegen horizontale overloop, maar het is dezelfde soort afstammelingsselector.

