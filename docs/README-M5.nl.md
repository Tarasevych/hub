> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./README-M5.uk.md) · **🇳🇱 Nederlands** ([origineel](./README-M5.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# M5 Cloud Drivers — DevKit

Dit zijn uitsluitend bronbestanden en een patch voor ontwikkelaars, GEEN updatepakket voor de site.

Te gebruiken op basis van M4 uit de DevKit van de vorige fase of de bijbehorende exact geverifieerde versie.

- `cloud-full-integration-M5.patch` — uitsluitend M5-wijzigingen ten opzichte van M4.
- `changed/` — gewijzigde en nieuwe bestanden in de boomstructuur ten opzichte van de projectroot.
- `tests/eenheid/cloud-m5-aanbieder-golf.test.mjs` — moduletests en netwerkcontracttests met mock-HTTP.
- `CLOUD-M5-IMPLEMENTATION-REPORT.uk.md` — status, beperkingen, officiële API's en acceptatievereisten.

Opdrachten vanuit de hoofdmap van de repository:

```bash
node --experimental-strip-types --test tests/eenheid/cloud-m5-aanbieder-golf.test.mjs
node scripts/cloud-volledige-uitgave-poort.mjs # VERPLICHT om BLOCKED te retourneren zolang live bewijs ontbreekt
```

Kopieer geen API-sleutels naar bronbestanden, archieven of de browser; registratie van OAuth-apps en B2/S3-sleutels vindt uitsluitend plaats op een afzonderlijke staging-omgeving.
