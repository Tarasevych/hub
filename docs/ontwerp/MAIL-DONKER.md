# Donkere mailweergave (MAIL-DONKER)

**Коротко українською.** У темній темі листи більше не показуються на білому аркуші. Модуль `shared/mail-donker.ts` перефарбовує
лист: білі й майже білі фони стають темними (як фон сайту), світлі пастельні — темними того ж відтінку, фірмові кольори кнопок
залишаються. Колір тексту, посилань, рамок цитат підбирається за WCAG (≥ 4,5:1, великий текст ≥ 3:1). Розміри й розташування
не змінюються ніколи — лише кольори. Логотипи отримують світлу підкладку, якщо можуть бути прозорими (не інвертуються). Листи з
власним темним дизайном (`color-scheme: dark`, `prefers-color-scheme: dark`) показуються у своєму дизайні. Над листом є перемикач
«Оригінал / Темний вигляд» (запам'ятовується для кожного листа). Якщо перетворення не вдалося — показується простий текст.
У світлій темі нічого не змінюється.

## Waar

| Bestand | Wat |
|---|---|
| `shared/mail-donker.ts` | zuivere kleurwiskunde (`leesKleur`, `contrast`, `pasTekstAan`, `donkereAchtergrond`, `donkerVerloop`, `heeftEigenDonkerOntwerp`) en de omzetting `maakMailDonker(doc, opties, eigenDonker)` |
| `src/mail-donker/logo-toets.ts` | na het laden: pixels van een beeld meten (zelfde oorsprong: data:/blob:) → plaatje weg bij foto's en lichte logo's |
| `src/mail-donker/weergave.ts` | `useDonkerThema`, keuze per bericht (`localStorage` `mail-donker-weergave:<id>`), themakleuren |
| `src/mail-donker/mail-donker.css` | donker kader i.p.v. wit papier, de wissel, en de veiligheidsstrook (tekst breekt af, niets meer afgekapt) |
| `src/MailBerichtTekst.tsx` | `prepareHtml(bron, label, donker)` roept de omzetting aan ná alle opschoning (DOMPurify, stijl-inline, beelden via server) |
| `tests/hulp/mails/*.html` | 26 synthetische brieven (geen echte post) |

Volgorde in `prepareHtml`: opschonen → (eigen donker ontwerp: `@media (prefers-color-scheme: dark)`-regels verzamelen) →
stijlen inline → veiligheid → citaten → **omzetting**. De iframe blijft `sandbox` zonder `allow-scripts`; de module voegt geen
scripts, bronnen of URL's toe.

## Regels van de omzetting

- Achtergrond (inline, `bgcolor`, verloopstops): licht (luminantie ≥ 0,4, niet fel-verzadigd) → donker; (bijna-)wit → precies `--panel`.
- Tekst: eigen kleur, `<font color>`, koppelingen (zonder kleur → lichtblauw), en geërfde kleur waar de achtergrond verandert.
  Gewone grijze/zwarte tekst → `--text`; gekleurde tekst → kleinste lichtheidsverschuiving in dezelfde tint (+0,15 marge).
- Randen ≥ 3:1 (citaatbalken), witte scheidingslijnen worden donker.
- Tekst op een achtergrondafbeelding die licht gemaakt moest worden → `text-shadow` (scrim), de afbeelding blijft.
- `img` (geen jpeg): lichte achtergrondkleur + `border-radius` (geen maat); de logo-toets haalt hem weg als hij niet nodig is.
- Lineair: één doorloop zonder `getComputedStyle`; 1 MB ≈ 90–140 ms (omzetting), ≈ 350 ms hele voorbereiding incl. DOMPurify.

## Visuele controle — `scripts/visueel-mail.mjs` (ook voor agent 4)

```
node scripts/visueel-mail.mjs                 # meten + vergelijken met de basislijn (exit 1 bij fout)
node scripts/visueel-mail.mjs --bijwerken     # basislijn vastleggen
  --breedtes 390,768,1440   --themas licht,donker   --filter 05-knop
  --uit /workspace/audit-ruimtes   --basislijn <map> (standaard <uit>/mail-basislijn)
  --drempel 0.5   (% pixels anders)   --json rapport.json   --zonder-afdrukken
```

Per brief × breedte: schermafdruk `mail-<brief>-<breedte>-<thema>.png`, WCAG-contrast van alle zichtbare tekst (donker),
vakken (x/y/breedte/hoogte) van alle elementen licht ↔ donker identiek, pixelvergelijking met de basislijn, en snelheid (1 MB).
Alleen lokaal: alle verzoeken buiten `data:`/`blob:`/`about:` worden geblokkeerd. Programmatisch: `import { meet } from './visueel-mail.mjs'`.

Tests: `node scripts/eenheidstests.mjs mail-donker` (kleurwiskunde + browsertest over het hele corpus).

## Grenzen

- Contrast voor grote tekst gebruikt alleen inline `font-size`/vet; onbekend → strengste doel (4,5:1).
- Tekst over een externe achtergrondafbeelding: beeld niet gemeten (alleen scrim als de tekst licht werd).
- Logo-toets alleen voor beelden van dezelfde oorsprong; anders blijft het lichte plaatje (veilig).
- Eigen donker ontwerp: alleen eenvoudige regels uit de media-query (geen geneste `@supports`).
