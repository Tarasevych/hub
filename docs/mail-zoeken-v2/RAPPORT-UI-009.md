# UI-009 — Eindrapport geavanceerd zoeken en filters in Mail

Basis: 20261029-131639 (claude). Vlag: `mail-zoeken-v2` (migratie **0150**, standaard UIT). Inventaris en diagnose: `INVENTARIS-UI-009.md` (fase 1).

## Wat er verandert (alleen met vlag AAN)
De filterknop in de zoekbalk en «Ще умови» openen hetzelfde, nieuwe paneel `src/mail-zoeken-v2/MailZoekenV2.tsx`:
1. **Kop** (titel, terug, sluiten) · **actieve chips** van het concept (elk apart weg, «Очистити все» wist het concept) · **één scrollend werkgebied** · **voet** «Скинути / Зберегти / Шукати» blijft altijd zichtbaar.
2. **Overzicht**: zoekveld met operator-aanvulling en geschiedenis, snelfilters (segment Усі/Непрочитані/Прочитані, ★, 📎) en vijf groepen: *Текст і учасники* (Текст, Люди, Тема), *Стан і місце листа* (Стан, Тека/мітка, Область), *Час* (Період), *Файли* (Вкладення і тип вмісту, Розмір), *Додатково* (Збережені). Een rij toont alleen een korte waarde als er iets gekozen is.
3. **Concept-model**: elke keuze verandert alleen het concept; precies **één** zoekopdracht bij «Шукати» (of Enter). Waarden blijven bewaard bij wisselen van editor. Sluiten (✕/Esc/buiten) = concept weggooien, zoals V1.
4. **Editors**
   - Текст: Gmail-operators (aanvulling `from:`, `has:attachment`… met ↑/↓/Enter), «усі слова», «не містить», recente zoekopdrachten als compacte lijst met markering en «Очистити», onderwerp-suggesties; syntaxisuitleg achter ⓘ.
   - Люди: segment «Від кого / Кому» met teller, korte uitleg van het verschil, doorzoekbare lijst met avatar, naam, e-mail (wrapt), aantal; Enter voegt een eigen adres toe (nu ook voor «Кому»); gekozen adressen als chips.
   - Тема: zoek/eigen invoer, lijst met markering, vinkje bij selectie, datum/aantal secundair.
   - Стан: exclusief segment + slanke schakelaar «лише із зірочкою».
   - Період: gekozen periode bovenaan, presets Будь-коли/7/30 днів/Пів року/Рік, Від/До + kalender **altijd bruikbaar**; grenzen beperken alleen als ze bevestigd zijn; grensstatus in één regel met vernieuwen; maand/jaar/kwartaal/seizoen pas na uitklappen.
   - Тека/мітка: zoeken, groepen «Теки» (eigen pictogrammen) en «Мої мітки»; geen herhaald «Системна тека»; lange namen wrappen.
   - Вкладення і тип вмісту: schakelaar, segment inhoudstype, bestandsnaam, formaten als compact raster met pictogram en teller (multi), gekozen formaten als chips, beperking (inhoud niet geïndexeerd) achter ⓘ.
   - Розмір: segment Будь-який/Більше/Менше + getal + eenheid in één groep; validatie (leeg, ≤0, tekst), komma wordt punt; «Шукати» uit bij ongeldige waarde.
   - Область: segment Поточний розділ/Уся пошта met één zin uitleg, schakelaars «Без Спаму/Кошика».
   - Збережені: starten (= zoeken), **hernoemen** (bestaande opslagfunctie), verwijderen; compacte lege staat zonder knoppen.
5. **Ruimte**: hoogte volgt de inhoud tot `min(720px, 100dvh − 72px)`; lijsten hebben geen eigen scroll; geen horizontale scroll; telefoon: volle breedte, «Шукати» bovenaan de voet over de volle breedte, tikdoelen 36–44 px.

## Bevestigde defecten → oplossing
| # | Defect (uit code) | V2 |
|---|---|---|
| 1 | Periode: datumvelden/maanden/kwartalen uit zonder bevestigde grenzen | altijd kiesbaar; grenzen alleen als beperking wanneer bevestigd (anders 1.1.2004–vandaag) |
| 2 | «Межі не підтверджені» dekt laden/fout/leeg/onbekend | `grensStand()` met vier aparte teksten, foutcode zichtbaar |
| 3 | Elke klik in een lijst = volledige zoekopdracht (e2e: 3 afzenders = 3 zoekopdrachten) | concept; 1 zoekopdracht (e2e bevestigd) |
| 4 | Deels direct, deels bij «Шукати» | overal concept |
| 5 | Twee editorsystemen | één paneel |
| 6 | Geneste scrolls (lijst 360px, chips 76/92px, jaren horizontaal) | één scrollgebied (e2e-controle op alle editors en breedtes) |
| 7 | Herhaalde labels per rij | groepering |
| 8 | «Кому» niet handmatig | Enter voegt toe |
| 9 | Opgeslagen zoekopdracht starten zoekt niet (in «Ще умови») | starten = zoeken |
| 10 | Grootte zonder validatie | validatie + melding |

Niet gewijzigd (vastgesteld juist): leessemantiek (beide = geen filter), zoekmotor, API's, facetten, grenzen-probe, `CanonicalChrome`, oude panelen zonder vlag.

## Diagnose (zie inventaris)
Gedeeltelijk afgerond zoeken: accountfout, plafond 200 Gmail-pagina's per account, gepauzeerde cursor (rate-limit), of afgebroken door een nieuwere zoekopdracht — de laatste wordt door V2 sterk verminderd. Tellers = geïndexeerde berichten (nu eerlijk benoemd in ⓘ). Filters en paginering: tijdens een zoekopdracht geen «meer laden» uit de map; resultaten komen uit de zoekrun.

## Gewijzigde bestanden
- nieuw: `src/mail-zoeken-v2/{MailZoekenV2.tsx, logica.ts, vlag.ts, mail-zoeken-v2.css}`, `migrations/0150_mail_zoeken_v2_vlag.sql`, `docs/mail-zoeken-v2/*`, `tests/eenheid/mail-zoeken-v2-20261029.test.ts`, `tests/e2e/mail-zoeken-v2.e2e.ts`, `tests/e2e/hulp/zoeken-stand/{stand.tsx,bouw.mjs}`
- gewijzigd: `src/GoogleMailWerkruimte.tsx` (2 imports, 1 hook, keuze V2/V1 achter vlag, `open` van het oude filterpaneel), `src/mail-zoek-cache.ts` (+ `clearMailRecentSearches`), `shared/vlaggen.ts` (+ uitleg vlag)
- **niet** aangeraakt: `src/MailBijlage*.tsx`, `src/DriveBrowser.tsx`, `src/bestand/*`, `docs/universele-bestanden/`, `integrations/`, oude zoekcomponenten.
- Geen nieuwe `position:fixed`-regels (positie via bestaande `.mail-advanced-search`), dus `plaatsing-vaste-elementen.json` ongewijzigd.

## Tests (echt uitgevoerd)
- Eenheid `mail-zoeken-v2-20261029`: 33/33.
- E2E-stand `mail-zoeken-v2` (echte Chrome, echte oude + nieuwe componenten, nagebootste facetten, geen server/Google): 172/172 — per editor × 390/768/1440 × licht/donker: binnen scherm, voet zichtbaar, één scrollgebied, geen horizontale scroll; tikdoelen 390; gedrag (concept, één zoekopdracht, waarden bewaard, Enter-adres, Кому, grensfout niet blokkerend, presets, uitklappen, kwartaal, grootte-validatie, operators met toetsenbord, geschiedenis wissen, ⓘ, labelgroepen, hernoemen/starten, lege staat, Esc-gedrag, nl).
- Volledige productiebuild, migraties op lege DB en serverstart: zie RELEASE-NOTITIES.

## Niet getest
Live site en echte Gmail; echte facet-/grenzen-API in de werkruimte (alleen stand); de werkruimte zelf met vlag AAN (alleen statisch: typecheck + koppelingstest); iOS Safari; schermlezers (alleen ARIA-rollen/labels gezet, geen test met NVDA/VoiceOver); samenspel met de zwevende samenvattingschips van het oude filterpaneel terwijl V2 open is.
