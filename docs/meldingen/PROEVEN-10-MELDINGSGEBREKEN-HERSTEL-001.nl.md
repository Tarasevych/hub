> 🌐 **Taal:** [Українська](ВИПРОБУВАННЯ-10-ВАД-СПОВІЩЕНЬ-HERSTEL-001.uk.md) · **Nederlands**

# Protocol en verificatieproeven van 10 meldingsgebreken (`MELD-1`..`MELD-10`) — `HERSTEL-001`

Dit document legt de volledige analyse vast van 9 mobiele schermafdrukken van het meldingensysteem (`Screenshot_20261125_132441_com.android.chrome.jpg` .. `Screenshot_20261125_132803_com.android.chrome.jpg`) — de menuvensters `.menu-bellen` en het meldingencentrum (`MeldingenPortaal`), inclusief uiterlijk, interactiegedrag, gebruikersverwachtingen en ontbrekende of defecte vervolgacties.

Geautomatiseerde eenheidsproef: [`tests/eenheid/herstel-001-meldingen-tien-gebreken.test.ts`](../../tests/eenheid/herstel-001-meldingen-tien-gebreken.test.ts).

---

## 1. `MELD-1` — Reusachtige lege witte kolom over het hele scherm (`min-height: 100svh`) in plaats van een knop-tooltip (`puls-icoon-tip`) en blokkering van de eerste aanraking op smartphone

- **Schermafdrukken:** `13:27:07`, `13:27:13`, `13:27:21`, `13:27:25`, `13:27:42`, `13:27:49`
- **Interactie en gebruikersverwachting:**
  - De gebruiker tikt op de bedieningsknoppen in de kop van het meldingenvenster (`Zoeken`, `Snelle instellingen`, `Niet storen`, `Compact paneel`) of op de filtertabbladen, in de verwachting dat de actie direct wordt uitgevoerd of een kleine capsule-tooltip verschijnt.
  - In plaats daarvan blokkeert de eerste aanraking op elke knop met `modus === 'actie'` de actie zelf zonder uitleg dat een tweede tik nodig is, en opent een **lege witte rechthoek over de volledige schermhoogte van de telefoon (`100svh`)** die 70% van de meldingenlijst bedekt.
- **Oorzaak in de broncode:**
  - In [`src/meldingen/IcoonActieKnop.tsx`](../../src/meldingen/IcoonActieKnop.tsx) (regels 85–93 en 354) voegt `leesActieveThemaKlassen()` de klasse `.theme-light` (of `.theme-dark`) rechtstreeks toe aan het tooltip-element `<div className="puls-icoon-tip theme-light">`.
  - In [`src/index.css`](../../src/index.css) (regel 18) dwingt de regel `.theme-dark, .theme-light { min-height: 100svh; background: var(--bg); color: var(--text); }` elk element met `.theme-light` tot een minimale hoogte van **`100svh`**.
- **Hersteleis:**
  - Zet op `.puls-icoon-tip` expliciet `min-height: 0; height: max-content; width: max-content` (en plaats geen paginabrede `.theme-light`-klasse met `min-height: 100svh` op de tooltip zelf), en voer directe bedieningsknoppen in de kop op aanraakschermen bij de eerste aanraking uit.

---

## 2. `MELD-2` — Niet-werkende omschakeling «Compact paneel / Venster» op smartphone (`<= 768 px`)

- **Schermafdruk:** `13:27:07`
- **Interactie, ontwerpbesluit van de eigenaar en gebruikersverwachting:**
  - *Architecturaal uitgangspunt van de eigenaar:* op de mobiele versie staat de meldingenbel **bewust in het menu** om meer werkruimte op het scherm vrij te houden en het scherm niet te belasten met extra functieknoppen die altijd in het menu bereikbaar zijn.
  - Tegelijkertijd belooft de tooltip van knop `[◨]` in het geopende meldingenvenster: *«Compact paneel bij de bel. Terug met „Venster“.»*. De gebruiker verwacht dat het venster na tikken omschakelt naar het compacte paneel en dat de knop «Venster» verschijnt.
- **Oorzaak in de broncode:**
  - In [`src/meldingen/ecosysteem/MeldingenPortaal.tsx`](../../src/meldingen/ecosysteem/MeldingenPortaal.tsx) (regels 323–326) bevat `isMobielLangscroll` de voorwaarde `(!compactBijBel || geo.modus === 'volledig' || profiel.geometrie.modus === 'volledig')`. Wanneer `modus === 'volledig'` in het profiel staat, schakelt `compactBijBel` de schermvullende mobiele weergave niet uit.
- **Hersteleis:**
  - Behoud de bel in het mobiele menu zonder extra knoppen op het werkblad en zorg dat schakelen tussen compacte en venstermodus op mobiele schermen daadwerkelijk de modus wisselt en de terugkeerknop «Venster» toont.

---

## 3. `MELD-3` — Misleidend onderschrift «1 van 14 getoond» (`Показано 1 із 14`) voor de ene tellerkaart «Ongelezen e-mails: 14» in het menuvenster «E-mail» en ontbreken ervan in het meldingencentrum

- **Schermafdruk:** `13:25:44`
- **Interactie en gebruikersverwachting:**
  - In het venster **«Пошта 14 сповіщень»** staat slechts 1 samengevoegde kaart **«Непрочитані листи: 14»**, maar onderaan staat **«Показано 1 із 14»**, waardoor de gebruiker 13 verborgen kaarten verwacht. Wanneer de gebruiker op `[🔔]` («Alle meldingen») tikt, ontbreekt deze mailteller volledig in het hoofdmeldingencentrum.
- **Oorzaak in de broncode:**
  - In [`shared/menu-meldingen.ts`](../../shared/menu-meldingen.ts) (regels 64–70) maakt `vanTellers` één item met `bron: 'teller'` en `aantal: 14`, en in [`src/MenuMeldingen.tsx`](../../src/MenuMeldingen.tsx) (regels 354–356) controleert `voetStatus` alleen `badge.aantal > badge.meldingen.length` zonder rekening te houden met `bron === 'teller'`.
- **Hersteleis:**
  - Toon geen «1 van N getoond» voor een samengevoegde tellerkaart (`bron === 'teller'`), maar geef een eerlijke samenvatting van het aantal ongelezen e-mails en neem het signaal op in het meldingencentrum.

---

## 4. `MELD-4` — Onofficieel eenkleurig duplicaat-logo van `Gmail` (enkel rode letter `M` uit `merk-logos.ts` in plaats van het officiële meerkleurige teken uit `src/merk/officieel/`) en foutief opschrift `Gmail · Вхід і пристрій` bij beveiligingsmeldingen

- **Schermafdruk:** `13:24:41`
- **Interactie, regel `REESTR-LOGO-001` en gebruikersverwachting:**
  1. Op schermafdruk `13:24:41` wordt een eenkleurige rode letter `M` getoond die niet overeenkomt met het echte vierkleurige Gmail-logo. Volgens `REESTR-LOGO-001` moeten alle logo’s uit één bron (`src/merk/officieel/`) komen, waar `google`, `googledrive`, `googlekeep` en `gemini` al als officiële meerkleurige logo’s staan, maar `gmail` ontbreekt in `KEUZE` van [`scripts/merk-officieel-maken.mjs`](../../scripts/merk-officieel-maken.mjs) en staat nog als eenkleurig duplicaat in [`src/merk/merk-logos.ts`](../../src/merk/merk-logos.ts) (regel 41).
  2. Drie beveiligingswaarschuwingen over aanmelding bij Mijn Ruimte dragen het opschrift **`Gmail · Вхід і пристрій`**, terwijl de gebeurtenis over een aanmelding bij Mijn Ruimte (methode: `Google`) gaat en niet over een Gmail-postvak.
- **Oorzaak in de broncode:**
  - Ontbreken van het officiële vierkleurige `gmail.svg` (`google-gmail-2020` uit `@iconify-json/logos`) in `src/merk/officieel/` en aanwezigheid van de oude eenkleurige rij `"gmail"` in `src/merk/merk-logos.ts`.
  - In [`src/MenuMeldingen.tsx`](../../src/MenuMeldingen.tsx) (regels 64, 70, 76–90) doorzoekt `zoekMerkInTekst` de volledige berichttekst inclusief het e-mailadres `olesia.koval@gmail.com`; het patroon `/\bgmail\b/i` matcht op `@gmail.com` vóór `/\bgoogle\b/i`.
- **Hersteleis:**
  - Voeg het officiële vierkleurige `gmail`-teken (`google-gmail-2020`) toe aan `src/merk/officieel/` via `scripts/merk-officieel-maken.mjs`, verwijder het eenkleurige duplicaat uit `src/merk/merk-logos.ts`, negeer e-mailadressen bij merkherkenning in `zoekMerkInTekst` en toon voor aanmeldbeveiliging de daadwerkelijke aanmeldmethode (`Google`, `Telegram`, `Toegangssleutel`).

---

## 5. `MELD-5` — Afgekorte tekst zonder aanmeldmethode en tijdstip en ontbreken van knoppen «Dit was ik» / «Dit was ik niet» in het menuvenster «Instellingen 3 meldingen»

- **Schermafdruk:** `13:24:41`
- **Interactie en gebruikersverwachting:**
  - De meldingstekst van `Новий вхід на новому пристрої` vraagt expliciet: *«Was u dit: klik op „Dit was ik“. Zo niet: beëindig de sessie en wijzig de toegang.»*, maar in `.menu-bellen` wordt de tekst na 2 regels afgekapt vóór het tijdstip en de aanmeldmethode, en ontbreken de knoppen **«Dit was ik»** en **«Dit was ik niet»** volledig. Tikken op `[✓]` («Opruimen») verbergt alleen de melding zonder het apparaat op de server te bevestigen.
- **Oorzaak in de broncode:**
  - In [`src/MenuMeldingen.tsx`](../../src/MenuMeldingen.tsx) (regels 371–389) biedt de kaart geen apparaatbevestigingsknoppen, en in [`backend/nieuw-apparaat.ts`](../../backend/nieuw-apparaat.ts) (regel 41) staan tijdstip en methode achteraan na het e-mailadres.
- **Hersteleis:**
  - Toon aanmeldmethode en tijdstip vooraan op de kaart en voeg directe actieknoppen «Dit was ik» (met aanroep van `POST /api/meldingen/apparaat-bekend`) en «Dit was ik niet» toe.

---

## 6. `MELD-6` — Verlies van knoppen «Dit was ik niet» / «Dit was ik» onder kaarten «Aanmelding vanaf nieuw onbekend apparaat gedetecteerd», ontbreken van `/api/meldingen/apparaat-bekend` bij «Dit was ik» en duplicatie

- **Schermafdrukken:** `13:24:41`, `13:27:07`, `13:27:49`, `13:28:03`
- **Interactie en gebruikersverwachting:**
  - Onder de kaarten `Виявлено вхід із нового незнайомого ...` op schermafdruk `13:28:03` ontbreken de knoppen `[🛡️ Це не я]` en `[🛡️ Це я]` (terwijl ze onder `Сховище ключів` wel staan).
  - Zelfs wanneer de gebruiker in `MeldingVeegKaart.tsx` op **`Це я`** («Dit was ik») tikt, zet die knop alleen de kaartstatus op `opgelost`, maar **roept nooit `POST /api/meldingen/apparaat-bekend` aan**, waardoor het apparaat onbevestigd blijft!
- **Oorzaak in de broncode:**
  - In [`shared/meldingen-ecosysteem/tolk.ts`](../../shared/meldingen-ecosysteem/tolk.ts) (regels 56, 67, 81) wordt `owner.apparaat.nieuw` door het woord `apparaat` ingedeeld onder `subdomein: 'mcp'`, `kanaal: 'mcp'`, `prioriteit: 'laag'` en krijgt `niveau: 'gewoon'`.
  - In [`src/meldingen/ecosysteem/MeldingVeegKaart.tsx`](../../src/meldingen/ecosysteem/MeldingVeegKaart.tsx) (regels 657 en 941) roept de knop «Dit was ik» `/api/meldingen/apparaat-bekend` niet aan.
- **Hersteleis:**
  - Classificeer `owner.apparaat.nieuw` als beveiligingsgebeurtenis (`kanaal: 'beveiliging'`, `subdomein: 'id'`, `niveau: 'gevaar'`), ontdubbel met `site_notifications` en roep `POST /api/meldingen/apparaat-bekend` aan bij «Dit was ik».

---

## 7. `MELD-7` — Verschil tussen tellers (`99+` op de bel, `18` bij «Nieuwe meldingen», `Gebeurtenissen: 212` bij «Actief · Vragen aandacht») en vervuiling van het actieve tabblad met reeds gelezen gebeurtenissen

- **Schermafdrukken:** `13:24:41`, `13:25:44`, `13:27:42`, `13:28:03`
- **Interactie en gebruikersverwachting:**
  - Op de bel in het menu staat `99+`, op het tabblad «Nieuwe meldingen» `18`, en op het tabblad «Actief · Vragen aandacht» staan `212` gebeurtenissen waarvan het merendeel al gelezen is (`✓✓`) en zelfs na tikken op `[✓✓]` («Alles als gelezen markeren») niet verdwijnt.
- **Oorzaak in de broncode:**
  - In [`src/meldingen/ecosysteem/MeldingenPortaal.tsx`](../../src/meldingen/ecosysteem/MeldingenPortaal.tsx) (regel 912) laat `statusFilter === 'actief'` alle gebeurtenissen met `status === 'gelezen'` staan, ook als het gewone informatieve gebeurtenissen (`niveau === 'gewoon'`) zijn die geen enkele actie vragen.
- **Hersteleis:**
  - Toon op het tabblad «Actief · Vragen aandacht» alleen ongelezen gebeurtenissen en gebeurtenissen die daadwerkelijk een besluit of beveiligingsbevestiging vereisen (`vereistBevestiging`), en synchroniseer de belteller.

---

## 8. `MELD-8` — 10 nieuwe meldingen met terugvaltekst «...: gebeurtenis zonder omschrijving (code onder „Technische details“)» zonder blok «Technische details» en afkapping van capsuletitels

- **Schermafdrukken:** `13:27:42`, `13:27:49`, `13:28:03`
- **Interactie en gebruikersverwachting:**
  - Op schermafdruk `13:27:42` heeft een groep van 10 nieuwe meldingen de titel `... без опису (код — у ...`, die verwijst naar een sectie «Technische details» die in `MeldingVeegKaart` helemaal niet bestaat. Daarnaast worden capsuletitels in de mobiele lijst op één regel afgekapt vóór het doelobject.
- **Oorzaak in de broncode:**
  - In [`src/melding-stijl.tsx`](../../src/melding-stijl.tsx) (regels 171–189) geeft `siteActieTekst` een terugvaltekst voor onbekende auditcodes, terwijl de code zelf niet in de beschrijving wordt meegegeven.
- **Hersteleis:**
  - Voorzie alle auditacties van duidelijke menselijke titels zonder de terugvaltekst «gebeurtenis zonder omschrijving» en toon de kerncontext zichtbaar in de capsule.

---

## 9. `MELD-9` — Overlapping van zijbalkitems door `.menu-bellen` en blokkering van de eerste tik op «Openen» / «Opruimen» op smartphone

- **Schermafdrukken:** `13:24:41`, `13:25:44`
- **Interactie en gebruikersverwachting:**
  - Het venster `.menu-bellen` bedekt op een smartphone het gekozen menu-item zelf zonder aanwijspijl, en de knoppen `[↗]` («Openen») en `[✓]` («Opruimen») werken door `icoonKnopHandlers` pas bij een tweede aanraking.
- **Oorzaak in de broncode:**
  - In [`src/MenuMeldingen.tsx`](../../src/MenuMeldingen.tsx) (regels 261–273 en 327–343) houdt de positionering op smalle schermen het gekozen menu-item niet vrij en eist `icoonKnopHandlers` een dubbele tik op aanraakschermen.
- **Hersteleis:**
  - Positioneer `.menu-bellen` boven of onder het gekozen menu-item met zichtbare koppeling en voer kaartacties direct bij de eerste aanraking uit.

---

## 10. `MELD-10` — Ontbreken van zichtbare naam van het actieve tabblad in de balk met 6 pictogramtabbladen en desktop-toetsaanwijzingen (`toets /`) op smartphone

- **Schermafdrukken:** `13:27:25`, `13:27:42`, `13:27:49`, `13:28:03`
- **Interactie en gebruikersverwachting:**
  - In `.puls-tabs` worden alle 6 tabbladen uitsluitend als pictogrammen weergegeven zonder tekstlabel van het actieve tabblad, zodat de gebruiker op een smartphone niet ziet welk filter actief is, en de zoektooltip verwijst naar een fysieke toets `/`.
- **Oorzaak in de broncode:**
  - In [`src/meldingen/ecosysteem/MeldingenPortaal.tsx`](../../src/meldingen/ecosysteem/MeldingenPortaal.tsx) (regels 1238 en 1417–1454) tonen de tabbladen geen zichtbare naam van het actieve filter en houdt de zoektooltip geen rekening met aanraakapparaten.
- **Hersteleis:**
  - Toon de naam van het actieve tabblad direct in de filterbalk en verberg toetsenbordaanwijzingen op aanraakschermen.

---

## 11. Samenvatting van uitvoering en verificatie (Etappe 4 `HERSTEL-001`)

Alle 10 punten (`MELD-1`..`MELD-10`) zijn volledig uitgewerkt en bevestigd door geautomatiseerde controles:

1. **`MELD-1`:** in [`src/index.css`](../../src/index.css), [`src/meldingen/IcoonActieKnop.tsx`](../../src/meldingen/IcoonActieKnop.tsx) en [`src/meldingen/ecosysteem/meldingen-ecosysteem.css`](../../src/meldingen/ecosysteem/meldingen-ecosysteem.css) erft `.puls-icoon-tip` geen `min-height: 100svh` meer (`min-height: 0; height: max-content; width: max-content`), en bedieningsknoppen werken direct bij de eerste aanraking (lang indrukken van `420` ms opent de uitlegcapsule).
2. **`MELD-2`:** de meldingenbel blijft op haar canonieke plaats in het mobiele menu (`lade-kop`), en in [`src/meldingen/ecosysteem/MeldingenPortaal.tsx`](../../src/meldingen/ecosysteem/MeldingenPortaal.tsx) schakelt `compactBijBel` op smalle schermen correct om met een zachte achtergrondsluier en een zichtbare terugkeerknop **«Venster»**.
3. **`MELD-3`:** in [`shared/menu-meldingen.ts`](../../shared/menu-meldingen.ts), [`src/MenuMeldingen.tsx`](../../src/MenuMeldingen.tsx), [`src/meldingen/ecosysteem/ecosysteem-opslag.ts`](../../src/meldingen/ecosysteem/ecosysteem-opslag.ts) en [`src/CanoniekMeldingencentrum.tsx`](../../src/CanoniekMeldingencentrum.tsx) is het misleidende onderschrift «1 van 14 getoond» vervangen door een duidelijke tellersamenvatting en wordt `teller:mail` doorgegeven aan het meldingencentrum.
4. **`MELD-4`:** via [`scripts/merk-officieel-maken.mjs`](../../scripts/merk-officieel-maken.mjs) is het officiële vierkleurige Gmail-beeldmerk (`CC0-1.0`) toegevoegd aan `src/merk/officieel/gmail.svg`, is het eenkleurige duplicaat uit `src/merk/merk-logos.ts` verwijderd en worden e-mailadressen genegeerd bij merkherkenning in beveiligingsmeldingen.
5. **`MELD-5`:** in [`backend/nieuw-apparaat.ts`](../../backend/nieuw-apparaat.ts) staan aanmeldmethode en tijdstip nu vooraan, en `.menu-bellen` biedt directe knoppen **«Dit was ik niet»** en **«Dit was ik»** (`POST /api/meldingen/apparaat-bekend`).
6. **`MELD-6`:** in [`shared/meldingen-ecosysteem/tolk.ts`](../../shared/meldingen-ecosysteem/tolk.ts), [`backend/site-activiteit.ts`](../../backend/site-activiteit.ts), [`src/meldingen/ecosysteem/ecosysteem-opslag.ts`](../../src/meldingen/ecosysteem/ecosysteem-opslag.ts) en [`src/meldingen/ecosysteem/MeldingVeegKaart.tsx`](../../src/meldingen/ecosysteem/MeldingVeegKaart.tsx) valt `owner.apparaat.nieuw` onder `id / beveiliging / gevaar`, worden gekoppelde rijen ontdubbeld en roept «Dit was ik» `POST /api/meldingen/apparaat-bekend` aan.
7. **`MELD-7`:** het tabblad **«Actief · Vragen aandacht»** toont uitsluitend nieuwe gebeurtenissen en gebeurtenissen die om een besluit of beveiligingsbevestiging vragen (`vereistBevestiging`), zonder vervuiling door reeds gelezen informatieve meldingen.
8. **`MELD-8`:** in [`shared/beheer-journaal.ts`](../../shared/beheer-journaal.ts) en [`scripts/meldingen-register-controle.mjs`](../../scripts/meldingen-register-controle.mjs) hebben alle serveractiecodes een menselijke titel in `ACTIE_LABELS` (`0` onder `'overig'`), is de blinde terugvaltekst in [`src/melding-stijl.tsx`](../../src/melding-stijl.tsx) vervangen en zijn in [`src/meldingen/ecosysteem/MeldingVeegKaart.tsx`](../../src/meldingen/ecosysteem/MeldingVeegKaart.tsx) de tweede capsuleregel `.puls-kapsel-sub` en het uitklapblok **«ⓘ Technische details»** toegevoegd.
9. **`MELD-9`:** in [`src/MenuMeldingen.tsx`](../../src/MenuMeldingen.tsx), [`src/menu-v2.css`](../../src/menu-v2.css) en [`src/CanoniekOmlijsting.tsx`](../../src/CanoniekOmlijsting.tsx) overlapt `.menu-bellen` het gekozen menu-item niet meer, wijst een pijl naar het anker, werken knoppen bij de eerste tik en sluit de mobiele menulade automatisch bij het openen van het hoofdmeldingencentrum.
10. **`MELD-10`:** in `.puls-tabs` staat de zichtbare naam van het actieve tabblad (`.puls-actieve-tab-naam`), en toetsenbordaanwijzingen (`toets /`, `Ctrl+Z`) blijven verborgen op aanraakschermen.

