> 🌐 **Taal / Мова:** [Українська](ДОСЬЄ-ПАНЕЛІ-СПОВІЩЕНЬ.uk.md) · **Nederlands** | [Start](../../README.md)

# MELDPANEEL-001 — dossier van het meldingenpaneel (18.11.2026)

Eén plek met de hele geschiedenis van het meldingenpaneel. De volledige tekst (tabellen, tijdlijn, ontwerp) staat in het [Oekraïense dossier](ДОСЬЄ-ПАНЕЛІ-СПОВІЩЕНЬ.uk.md); hier de kern.

Basis: `feature/upd-004-uitgave-20261117-225600` (697c7374). Werktak: `feature/meldpaneel-001-20261118-082300`.

## Nu

- Drie weergaven van één paneel: «klassiek» (`MeldingenpaneelInhoud`, zonder vlag), **compact bij de bel** (`src/meldingen/v2`, vlag `meldingen-v2`) en **groot venster** (`src/meldingen/ecosysteem`, GEMINI-002).
- Drie plekken voor instellingen: regels v2 (`MeldingVoorkeurenPaneel`), pagina `/melding` (migratie 0278) en stille uren.

## Geschiedenis (agent · model)

- 09.10 Menu v2 · claude. 29.10 UI-007 compact paneel v2 · claude.
- 02.11 notif-b, 03.11 INTEG-001 (12 commits) · claude · Claude Haiku 5.5.
- 14.11 IDENTITEIT-013…015 · claude · Claude Opus 5.5.
- 15.11 GEMINI-002 groot venster, bijlageviewer, AI-duiding, `/melding` · gemini · Gemini 4 Hydrogen Extra.
- 15–16.11 MELDINGEN-UX-001 schakelaar «Venster ↔ Compact», één getal op de bel · claude · Claude Opus 5.5 en Claude Fable 5.2.
- 16.11 MELDLINK-001, ELDERS-001; 17.11 MELDCAT-001 register, X4-ontwerp · claude · Claude Opus 5.5.

Alle 227 takken zijn vergeleken, ook de 37 takken met de oude geschiedenis van vóór 30.10 (oude bestandsnamen `NotificationPanelBody.tsx`, 07.10 · Claude Sonnet 5.5). Echt verloren: in `wip/hub-voor-integratie-20261103` (0ca4cad3) «als ongelezen markeren», eerste/laatste keer en aantal bij samengevoegde meldingen, «opnieuw openen», «standaard herstellen»; en uit het klassieke paneel duur, begin en einde van een actie en «Wijziging bekijken».

## Tegenstrijdigheden

1. Andere getallen op de bel (compact 2, venster 3 bij dezelfde gegevens).
2. Twee opslagplaatsen voor status; «uitgesteld» uit het venster komt niet in het compacte paneel.
3. Drie instellingenplekken met deels dezelfde schakelaars.
4. Andere woorden voor hetzelfde («Очистити» en «Перенести в архів», 30 min of 1 uur uitstellen).

## Ontwerp: één paneel, twee maten

Hetzelfde paneel bij de bel en uitgeklapt als venster: dezelfde kop, tabbladen «Нові · Відкладені · Прочитані · Архів», kanaalchips met logo's, gevaar bovenaan als X4-kaart, compacte rijen met «⋯»-menu, in het venster lijst links en details rechts (X4-strook, bijlagen, AI-duiding), op de telefoon een blad met vegen. Eén getal, één statusopslag, één regelspagina. Schermafdrukken: `/mnt/project-files/meldpaneel-001/ontwerp/`.

## Realisatie MELDPANEEL-002 — «Aandachts-, Rust- en Actiepuls» (22.11.2026)

Na beoordeling van de visuele vergelijkingen heeft de eigenaar (Pavlo Tarasevych) de uitvoering van één modern paneel in twee groottes (`compactBijBel` bij de bel en uitgeklapt tweekolomsvenster) goedgekeurd, met luchtig minimalisme, onmiddellijke visuele herkenning voor verstrooide aandacht en officiële merktekens uit `src/merk/` plus semantische bestandspictogrammen in plaats van kale tekstlabels.

Uitgevoerd in `shared/meldingen-puls/`, `src/meldingen/puls/`, `src/meldingen/ecosysteem/` en `src/CanoniekMeldingencentrum.tsx`:

1. **Één paneel in twee groottes en één getal op de bel:** compact bij de bel én breed venster delen dezelfde stroom, statusopslag en schakelaar «Venster ↔ Compact», met behoud van alle bestaande mogelijkheden.
2. **Visuele ankers uit het merkregister (`REESTR-LOGO-001`):** alle 14 AI-agenten en bekende diensten gebruiken `<Merk>` zonder gissingen bij onbekende afzenders; bijlagen tonen kleur- en formaatankers (`XLSX/CSV`, `PDF`, `IMG/SVG`, `DIFF`, `AUD`, `VID`, `ICS`, `VCF`, `JSON`, `ARCHIEF`).
3. **Onvervalsbaar Klimop-kernzegel (`data-puls-zegel="klimop"`):** uitsluitend voor authentieke interne systeem- en beveiligingsgebeurtenissen, nooit voor inkomende post.
4. **Oorzaakketens (`PulsOorzaakKetenKaart`):** samenhangende storingen van dezelfde bron worden gebundeld tot één herstelknoop met logo’s van alle getroffen onderdelen.
5. **AI-mandaatstraal (`PulsMandaatStraalBlok`):** toont direct op de kaart wat wel wordt opengesteld, wat strikt afgeschermd blijft en de mandaatduur («Slechts 1 keer» / «15 min»).
6. **Rustig 15-secondenoverzicht, voorwaardelijk uitstel en respect voor typstroom:** achtergrondtaken in 1 klik opruimen, 6 uitstelvoorwaarden (computer, onderdeel, na taak, morgen 09:00, 30 min, 1 uur), 5-seconden ongedaan maken (`Ctrl+Z`), toetsenbordbesturing (`↑↓`, `Spatie`, `S`, `E`), stille voortgangspil bij de bel, uitstel van niet-kritieke pop-ups tijdens typen en slimme stiltesuggestie na drie keer wegklikken zonder openen.

