# Werkblad «Blokken» — integratie in Werkblad v3

Stand: 28-10-2026. Vlag `werkblad-blokken` (standaard **uit**; werkt alleen samen met `werkblad-v3`).

## Wat nu via blokken loopt (vlag aan)
- Widget **«Швидкий доступ»** (`wdg:snel-toegang`): de tegels worden door `BlokWeergave` getekend. Zonder bewaard blok
  is er een standaardblok met dezelfde tegels en volgorde als de widget (`koppeling.ts`, `standaardSnelToegang`).
- **Mappen** op het werkblad: de inhoud van de map is een blok (raster, automatische maten).
- Bewerkmodus: kiezen (klik, Shift+klik), eigenschappenpaneel (zijpaneel; onderblad op de telefoon), vertraagd bewaren
  (400 ms), versieconflict (409 → nieuwste versie laden + melding), groeperen in rij/kolom, ontgroeperen, icoon of blok
  toevoegen, icoon vervangen, verwijderen, slepen (blok↔blok, blok→werkblad met stijl in `config.blokStijl`,
  werkblad→blok, blok→menu), «Перемістити в…» (knop of M/F2), Ctrl+Z / Ctrl+Shift+Z.
- De server controleert elke wijziging opnieuw (register, ruimte: technische items alleen in de technische ruimte).

## Vlag uit
Alles is zoals vóór de integratie (pixelgelijk gecontroleerd op 1280 en 390 px, licht en donker).

## Andere vensters (volgende stap, nu niet omgezet)
Deze delen gebruiken nog hun eigen weergave. Ze werken ongewijzigd met de vlag aan en uit:
- andere widgets op het werkblad (Календар, Нещодавні, Хмарне сховище, Статус служб, Системна інформація, Швидкі дії, ШІ для вас …);
- het menu (zijbalk/dock): ontvangt alleen sleepacties uit blokken via de gewone menuregels;
- bibliotheek «Мій ярлик», mappaneel bij vlag uit, admin- en id-sites (geen werkblad).
Volgende stap per venster: een standaardblok afleiden (zoals `standaardSnelToegang`), `vakVoor` gebruiken in de widget,
en een E2E-stap toevoegen in `scripts/lokaal-e2e/werkblad-blokken-integratie.mjs`.

## Bekende beperkingen
- Blokken horen bij een **apparaatlaag** (computer/tablet/telefoon). Wordt het werkgebied smaller dan de computerbreedte
  (bijv. door een breder menu), dan toont het werkblad de tabletlaag — met zijn eigen (standaard)blok.
- `svc:mcp` heet in het blok «Міст ШІ → сайт» (registernaam) in plaats van de widgetnaam.
- Het voorbeeldicoon in het eigenschappenpaneel is algemeen.
