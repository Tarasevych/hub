> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./README-M7.uk.md) · [🇳🇱 **Nederlandse versie**](./README-M7.nl.md) · [🏠 Hoofdpagina (NL)](./LEESMIJ.md) · [🏠 Головна (UK)](./README.md) · [📚 Documentatie-index](./docs/INDEX.nl.md)

# Volledige Cloud-integratie M7 · Security-first ontwikkelkit

Basis: M6 DevKit uit het werkarchief `20261027-212158` (geen bevestiging van de huidige productieversie).

## Controleren

```bash
node --test tests/eenheid/cloud-*mjs
node scripts/cloud-volledige-uitgave-poort.mjs
node scripts/kaart-controle.mjs --stil
```

Verwacht resultaat: eenheidstests slagen; de vrijgavepoort (release gate) geeft `BLOCKED` terug (exitcode `2`); de bestandskaartcontrole geeft geen fouten.

**Niet installeren** in productie, GitHub `main`/`voornaamst` niet bijwerken en geen migraties toepassen zonder staging. Zet de herstelsleutel van de gebruiker (gebruiker recovery sleutel) of de WebAuthn PRF-uitvoer nooit in een log, analyse, netwerkverzoek of door de server gegenereerde HTML.

Beschrijving van vertrouwensgrenzen en openstaande vragen: [`docs/CLOUD-M7-PRIVACY-ARCHITECTURE.nl.md`](./docs/CLOUD-M7-PRIVACY-ARCHITECTURE.nl.md) ([🇺🇦 UK](./docs/CLOUD-M7-PRIVACY-ARCHITECTURE.uk.md)).
