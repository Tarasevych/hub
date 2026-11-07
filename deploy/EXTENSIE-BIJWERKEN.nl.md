> 🌐 **Taal / Мова:** [Українська](ОНОВЛЕННЯ-РОЗШИРЕННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Browserextensie bijwerken

Stand 18.10.2026 (audit, punt 9)

**Wat was er.** De extensiecode op de site had versie 0.4.0, terwijl het gepubliceerde ondertekende pakket (CRX) op 0.3.4 stond. De build (`scripts/bouw-extensie.mjs`) publiceerde de verouderde CRX terecht niet, maar vermeldde niet waarom; de site toonde niet dat er een nieuwe versie beschikbaar was. Het ondertekenscript maakte stilzwijgend een **nieuwe** sleutel aan als de oude niet aanwezig was — dat zou een ander extensie-id opleveren, waardoor alle bestaande installaties nooit meer een update zouden krijgen.

**Wat is er nu.**
- De extensieversie is **0.4.1** (opdracht `UPDATE_CHECK`, eigen versiecontrole, badge «↑»). De minimale werkende versie is **0.4.0** (`shared/extensie-update.ts`, `EXT_MIN_VERSIE`; één bron voor zowel site als build).
- `extension-version.json` bevat nu `minVersion`, `crxStatus` (`actueel` / `verouderd` / `ontbreekt` / `ongeldig`) en `ondertekendeVersie`. Verouderde bestanden `mijn-ruimte-extension.crx` en `updates.xml` uit een eerdere build worden verwijderd, zodat Chrome niet «bijwerkt» naar een oude versie.
- Op elke pagina van de site verschijnt, wanneer de geïnstalleerde extensie ouder is dan de gepubliceerde versie, de strook **«Update van de extensie beschikbaar X → Y»**:
  - **«Automatisch bijwerken»** — alleen als de extensie is geïnstalleerd vanuit onze CRX (er staat een `update_url` in het manifest) en de gepubliceerde CRX nieuwer is. De extensie vraagt Chrome om op updates te controleren (`chrome.runtime.requestUpdateCheck`) en herstart. Er wordt niets geïnstalleerd zonder klik.
  - **«Handmatig bijwerken»** — stappen voor «Uitgepakt laden»: zip downloaden, bestanden in dezelfde map vervangen en in `chrome://extensions` op ↻ klikken.
  - **«Later herinneren»** — verbergt de melding voor 24 uur. Bij een verplichte update (lager dan 0.4.0) ontbreekt deze knop.
- De extensie zelf leest elke 6 uur `https://mcp.tarasevych.com/downloads/extension-version.json` en toont «↑» op het pictogram met een toelichting.

**Wat nodig is van de eigenaar (eenmalig, op de pc met de sleutel).** De ondertekensleutel staat niet in de repository (en hoort daar ook niet). Om automatisch bijwerken voor 0.4.1 te laten werken:
```
node scripts/onderteken-extensie.mjs T:\mijn-ruimte\geheim\extension-signing-key.pem
```
Het script controleert dat de sleutel hetzelfde id `ofpffonakgjioahgfejmiblfmbkobmmi` oplevert; anders schrijft het niets weg (exit 3). Zonder sleutel volgt exit 2 met uitleg. Een nieuwe sleutel aanmaken kan alleen bewust met `--nieuwe-sleutel` (bestaande installaties krijgen dan geen updates meer). Na het ondertekenen een nieuw pakket bouwen: `extension/signed/*` gaat mee in de build, `crx` en `updates.xml` verschijnen, en `crxStatus: actueel`.

Wie nu 0.3.4 vanuit de CRX heeft: Chrome werkt automatisch bij zodra CRX 0.4.1 is gepubliceiseerd (`update_url` in het oude pakket verwijst naar dezelfde `updates.xml`). Wie een «uitgepakte» 0.4.0 heeft: de strook toont de handmatige stappen.

Tests: `tests/eenheid/ui-audit-g.test.ts` (updatebeleid, consistentie build ↔ manifest, ondertekenscript), `browser-extensie`, `extensie-toestand`; harness `/tmp/h-G/test.py` (strook in uk/nl, licht/donker, 390 px).
