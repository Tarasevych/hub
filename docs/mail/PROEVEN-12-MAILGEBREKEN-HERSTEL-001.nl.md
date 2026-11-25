> 🌐 **Taal:** [Українська](ВИПРОБУВАННЯ-12-ВАД-ПОШТИ-HERSTEL-001.uk.md) · **Nederlands**

# Verificatieproeven voor 12 gebreken in berichtweergave en context van Post (`HERSTEL-001` · `MAIL-1`..`MAIL-12`)

Dit document legt het diagnoseprotocol en de verificatieproeven vast voor 12 visuele, technische, taalkundige en interactiegebreken in het leesvenster van `mail.tarasevych.com`, vastgesteld op basis van elf mobiele schermafdrukken van de eigenaar (`Screenshot_20261125_134333` .. `Screenshot_20261125_134722`).

---

## 1. Overzicht van de 12 vastgestelde gebreken (`MAIL-1`..`MAIL-12`)

1. **`MAIL-1` — Ruwe HTML-code `<a href="...">Open in Maps</a>` zichtbaar als platte tekst in «Wat wordt er van u verwacht? → KORT» (`13:44:59`):**
   - `eenvoudigeOntleding` in `shared/ai-bronnen.ts` en `PuntRegel` in `src/mail/WatNodigBlok.tsx` tonen ruwe `<a href="...">`-tags uit `plainText` zonder opschoning of omzetting naar een klikbare kaartkoppeling.
2. **`MAIL-2` — Onterechte markering van een automatisch `no-reply@toogoodtogo.com`-bericht als «Wacht op uw antwoord» (`13:43:33`..`13:44:59`):**
   - `antwoordNodig` en `VERZOEK` in `shared/ai-bronnen.ts` reageren op `please` / `remember to` zonder `no-reply@` / `noreply@`-afzenders uit te sluiten, waardoor een antwoordformulier naar `no-reply@toogoodtogo.com` wordt aangeboden.
3. **`MAIL-3` — Interactiefout bij het `[✨ AI]`-paneel in het antwoordblok en blijvend zwevende zwarte knopinfo (`data-tooltip`) over de onderste actiebalk tijdens scrollen (`13:43:39`..`13:44:31`, `13:47:22`):**
   - Op smalle schermen (`≤ 430 px` in `src/mail-mobiel-passend.css`) verdwijnen de tekstlabels van `Samenvatting` en `Antwoordconcept`, activeert focus op `button.mra-toggle` in `src/MailLezerAi.tsx` de knopinfo op aanraakschermen, en klemt `ViewportKnopinfoLaag.tsx` (`top = Math.max(minTop, Math.min(rawTop, maxTop))`) de zwarte knopinfo vast bovenop de onderste balk (`Archief · Uitstellen · Prullenbak · Meer`) wanneer de knop zelf buiten beeld is gescrold.
4. **`MAIL-4` — Afgekapte tekst `iCalendar / зайнятіст` in de `64×64 px`-miniatuur van `.ics`-bijlagekaarten en 5 naamloze actieknoppen (`13:43:33`, `13:44:21`):**
   - `mailPersonalDataCapability` in `src/mail-persoonsgegevens-mogelijkheden.ts` gebruikt het lange label `'iCalendar / зайнятість'` in plaats van `'ICS'`, dat in `MailBijlageMiniatuur.tsx` binnen het `64×64 px`-symbool wordt afgekapt en het onderschrift rechts ernaast verdubbelt.
5. **`MAIL-5` — Overtreding van de Absolute Taalwet: Nederlandse calque `В Агенду` in plaats van Oekraïens `У Календар` (`13:43:33`, `13:44:12`, `13:44:21`, `13:44:59`):**
   - In `src/mail/WatNodigBlok.tsx`, `src/mail/ContextPaneel.tsx` en `src/MailGesprekInhoud.tsx` staat in het Oekraïens `В Агенду` terwijl de dienst in het Oekraïense menu `Календар` heet.
6. **`MAIL-6` — Vervorming van de Engelse aanhef `Hi Pavlo Tarasevych` tot de Oekraïense ontkenning `Ні Павло Тарасевич` in de tijdlijn (`13:45:16`, `13:45:42`):**
   - Het uittreksel (`snippet`) in `tijdlijn` (`src/mail/gesprek-context.ts`) toont `Ні Павло Тарасевич,` in plaats van `Hi Павло Тарасевич,`.
7. **`MAIL-7` — Ontbrekende aanwijzing voor eerdere berichten in «Context → Tijdlijn», omgekeerde volgorde van het welkomstbericht op 15 oktober en geblokkeerde scroll-schermafdruk (`13:45:16`, `13:45:21`, `13:45:42`):**
   - Het modale blad `.ctx-paneel` (`src/mail/context-paneel.css`) gebruikt een intern scrollvak (`max-height: min(84%, 680px); overflow: auto`), waardoor Android meldt dat het scherm geen scrollende schermafdruk ondersteunt.
8. **`MAIL-8` — Vijfde tabblad «Afzender» valt op een tweede regel in het contextblad en afgekapt afspraakonderwerp (`13:45:16`, `13:45:21`, `13:45:42`):**
   - `.ctx-tabs` (`src/mail/context-paneel.css`) breekt het vijfde tabblad af naar een tweede rij van `44 px`, het actieve tabblad heeft te weinig contrast, en `.ctx-tl-tekst strong` kapt de titel van de komende afspraak af op één regel.
9. **`MAIL-9` — Drie verdiepingen hoge, gebroken bovenbalk van het leesvenster (`> 170 px`), `64 px` lege ruimte rechts en dubbele sluitknoppen `[ < ]` en `[ ✕ ]` (`13:43:33`..`13:47:22`):**
   - In `src/mail/mail-lezer-compact-kop.css` duwt `.mail-reader-kop-opties` (`flex: 1 0 100%`) de hele `.mail-reader-toolbar` naar een tweede verdieping onder `[ < ]` en zichzelf naar een derde verdieping, terwijl `padding-right` in `src/mail/lees-venster.css` niet wordt teruggezet voor `[data-lees-modus='telefoon']`.
10. **`MAIL-10` — Drievoudige verdubbeling van berichtacties en actief blijvende zwarte knop `↩ Beantwoorden` in de onderbalk terwijl het antwoordveld al openstaat (`13:43:33`, `13:43:39`, `13:43:53`):**
    - `.mail-reader-onderbalk` in `src/MailLezerWerkbalk.tsx` blijft de primaire knop `↩ Beantwoorden` tonen wanneer `.mail-thread-reply` al geopend erboven staat.
11. **`MAIL-11` — Ontbrekende kop en sluitknop `[✕]` op het weergaveblad, misleidende knop `↙↗ Bericht minimaliseren` onderaan de weergave-instellingen en gemengde eenheden `МБ` tegenover `KB` (`13:43:33`, `13:47:22`):**
    - De groep `venster` (`Згорнути лист`) staat onderaan `.mail-reader-overflow-panel` direct onder `WeergaveBlok`, en `formatMailAttachmentSize` in `src/MailBijlageVoorbeeld.tsx` gebruikt vaste Latijnse eenheden `['B','KB','MB','GB']`.
12. **`MAIL-12` — Visuele afkapping van de HTML-berichtinhoud onder de drielaagse bovenbalk en lege beige strook boven het bericht (`13:43:33`, `13:44:21`, `13:44:31`):**
    - De drielaagse kop en binnenmarges van `.mail-message-html-paper` beperken de bruikbare leeshoogte op smartphones.

---

## 2. Geautomatiseerde eenheidstest

De verificatie wordt uitgevoerd door [`tests/eenheid/herstel-001-mail-weergave-twaalf-gebreken.test.ts`](../../tests/eenheid/herstel-001-mail-weergave-twaalf-gebreken.test.ts).
