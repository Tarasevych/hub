> 🌐 **Taal:** [Українська](ВИПРОБУВАННЯ-12-ВАД-ПОШТИ-HERSTEL-001.uk.md) · **Nederlands**

# Verificatieproeven voor 20 gebreken in berichtweergave, dynamische ruimte, interpretatie en herkomst van Post (`HERSTEL-001` · `MAIL-1`..`MAIL-20`)

Dit document legt het volledige diagnoseprotocol en de verificatieproeven vast voor 20 visuele, ruimtelijke, technische, taalkundige en interactiegebreken in het leesvenster van `mail.tarasevych.com`, vastgesteld op basis van elf mobiele schermafdrukken van de eigenaar (`Screenshot_20261125_134333` .. `Screenshot_20261125_134722`).

---

## 1. Overzicht van de 20 vastgestelde gebreken (`MAIL-1`..`MAIL-20`)

1. **`MAIL-1` — Ruwe HTML-code `<a href="...">Open in Maps</a>` zichtbaar als platte tekst in «Wat wordt er van u verwacht? → KORT» (`13:44:59`).**
2. **`MAIL-2` — Onterechte markering van een automatisch `no-reply@toogoodtogo.com`-bericht als «Wacht op uw antwoord» (`13:43:33`..`13:44:59`).**
3. **`MAIL-3` — Interactiefout bij het `[✨ AI]`-paneel in het antwoordblok en blijvend zwevende zwarte knopinfo (`data-tooltip`) over de onderste actiebalk tijdens scrollen (`13:43:39`..`13:44:31`, `13:47:22`).**
4. **`MAIL-4` — Afgekapte tekst `iCalendar / зайнятіст` in de `64×64 px`-miniatuur van `.ics`-bijlagekaarten en 5 naamloze actieknoppen (`13:43:33`, `13:44:21`).**
5. **`MAIL-5` — Overtreding van de Absolute Taalwet: Nederlandse calque `В Агенду` in plaats van Oekraïens `У Календар` (`13:43:33`, `13:44:12`, `13:44:21`, `13:44:59`).**
6. **`MAIL-6` — Vervorming van de Engelse aanhef `Hi Pavlo Tarasevych` tot de Oekraïense ontkenning `Ні Павло Тарасевич` in de tijdlijn (`13:45:16`, `13:45:42`).**
7. **`MAIL-7` — Ontbrekende aanwijzing voor eerdere berichten in «Context → Tijdlijn», omgekeerde volgorde op 15 oktober en geblokkeerde scroll-schermafdruk (`13:45:16`, `13:45:21`, `13:45:42`).**
8. **`MAIL-8` — Vijfde tabblad «Afzender» valt op een tweede regel in het contextblad en afgekapt afspraakonderwerp (`13:45:16`, `13:45:21`, `13:45:42`).**
9. **`MAIL-9` — Drie verdiepingen hoge, gebroken bovenbalk van het leesvenster (`> 170 px`), `64 px` lege ruimte rechts en dubbele sluitknoppen `[ < ]` en `[ ✕ ]` (`13:43:33`..`13:47:22`).**
10. **`MAIL-10` — Drievoudige verdubbeling van berichtacties en actief blijvende zwarte knop `↩ Beantwoorden` in de onderbalk terwijl het antwoordveld al openstaat (`13:43:33`, `13:43:39`, `13:43:53`).**
11. **`MAIL-11` — Ontbrekende kop en sluitknop `[✕]` op het weergaveblad, misleidende knop `↙↗ Bericht minimaliseren` onderaan de weergave-instellingen en gemengde eenheden `МБ` tegenover `KB` (`13:43:33`, `13:47:22`).**
12. **`MAIL-12` — Visuele afkapping van de HTML-berichtinhoud onder de drielaagse bovenbalk en lege beige strook boven het bericht (`13:43:33`, `13:44:21`, `13:44:31`).**
13. **`MAIL-13` — Ontbreken van slim verbergen van werkbalken bij omlaag scrollen en opnieuw tonen bij omhoog scrollen (`scroll-driven hide/reveal`) (`13:43:33`..`13:44:31`):**
    - In `src/mail/LeesVenster.tsx`, `src/MailLezerWerkbalk.tsx` en `src/MailGesprekInhoud.tsx` blijven boven- en onderbalk altijd vaststaan en nemen ze ~40% van de schermhoogte in tijdens het lezen.
14. **`MAIL-14` — Niet verbergen van inactieve werkbalken tijdens interactie met pop-upbladen («Wat wordt er van u verwacht?», «Context», «Weergave») of de geopende antwoordeditor (`13:43:39`, `13:44:59`..`13:47:22`):**
    - De drielaagse bovenbalk (`172 px`) en de onderste actiebalk (`60 px`) blijven zichtbaar en klemmen het actieve blad of het antwoordveld in een smalle strook.
15. **`MAIL-15` — Halfdoorzichtige achtergrond van het modale contextblad (`.ctx-paneel`), waardoor het groene logo `TOO GOOD TO GO` en de berichttekst eronder doorschijnen (`13:45:16`, `13:45:21`, `13:45:42`):**
    - `.ctx-paneel` in `src/mail/context-paneel.css` gebruikt een deels transparante `background: var(--panel)`.
16. **`MAIL-16` — Chaotische spreiding en onverenigbare vormen van knoppen, 7-laagse kop van het antwoordblok (`> 360 px` hoog) met lege stroken en dubbele rand rond de toonkeuze `Zoals gewoonlijk` (`13:43:33`, `13:43:39`, `13:43:53`, `13:44:12`):**
    - Onverenigbare knopgeometrieën, zeven afzonderlijke rijen vóór het tekstveld in `.mail-thread-reply` en dubbele omlijning van `label.mra-veld` + `<select>` in `src/MailLezerAi.tsx` en `src/mail-lezer-ai.css`.
17. **`MAIL-17` — Twee grote dubbele kaarten onder elkaar voor één `pickup-reminder.ics`-bestand en zinloze knop `[↩]` («Aan antwoord toevoegen») bij een herinnering van `no-reply@` (`13:43:33`, `13:44:21`):**
    - Zowel een volledige bijlagekaart met 5 knoppen als een afspraakkaart (`BriefAfspraken`) worden onder elkaar getekend in `src/MailGesprekInhoud.tsx`.
18. **`MAIL-18` — Foute taalherkenning van het bericht: een volledig Engels bericht wordt als Oekraïens (`uk`) bestempeld vanwege de Cyrillische ontvangersnaam `Павло Тарасевич` in `taalVan`, waardoor de vertaalstrook (`VertaalStrook`) volledig wegblijft (`13:43:33`..`13:47:22`):**
    - `taalVan` in `shared/ai-bronnen.ts` geeft `'uk'` terug zodra één Cyrillisch teken (`/[іїєґІЇЄҐ]/`) wordt aangetroffen, waardoor `taalStrookMogelijk` in `src/MailGesprekInhoud.tsx` `false` wordt.
19. **`MAIL-19` — Tegenstrijdige en onjuiste weergave van de volledige afzenderherkomst: gelijktijdige weergave van het officiële merklogo `Too Good To Go` (links afgekapt in de avatar) en het waarschuwingsschild `[🛡️?]` («Niet bevestigd») ondanks geldige `SPF / DKIM / DMARC` (`13:44:31`):**
    - `classificeer` in `shared/mail-afzenders.ts` negeert cryptografisch geslaagde domeinverificatie buiten de handmatige lijst `BEKENDE_DIENSTEN`, en `.mail-row-avatar[data-afzender-foto="merk"] .avatar-img { object-fit: contain; padding: 14% }` in `src/afzenders/afzenders.css` ontbreekt voor `.mail-thread-avatar .afz-foto`.
20. **`MAIL-20` — Verlies van opmaak en interpretatie van de HTML-berichtinhoud: `flattenStyles` vernietigt alle `@media`-regels, waardoor een tweede (verborgen) `TOO GOOD TO GO`-logo schermbreed wordt opgeblazen en de eigenlijke besteltekst wegvalt (`13:43:33`, `13:44:21`, `13:44:31`, `13:44:59`):**
    - `flattenStyles` in `src/MailBerichtTekst.tsx` verwerpt alle `CSSMediaRule`-blokken en overschrijft afbeeldingen met `height: auto`, waardoor verborgen varianten zichtbaar en opgeblazen worden.

---

## 2. Geautomatiseerde eenheidstest

De verificatie van alle 20 contracten wordt uitgevoerd door [`tests/eenheid/herstel-001-mail-weergave-twaalf-gebreken.test.ts`](../../tests/eenheid/herstel-001-mail-weergave-twaalf-gebreken.test.ts).
