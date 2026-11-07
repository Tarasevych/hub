> 🌐 **Taal / Мова:** [Українська](ОГЛЯД-ХМАРИ-М7.uk.md) · **Nederlands** | [Hoofdpagina](LEESMIJ.md) · [Documentatie-index](docs/INDEX.nl.md)

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

Beschrijving van vertrouwensgrenzen en openstaande vragen: [`docs/WOLK-M7-PRIVACY-ARCHITECTUUR.nl.md`](./docs/WOLK-M7-PRIVACY-ARCHITECTUUR.nl.md) ([🇺🇦 UK](docs/АРХІТЕКТУРА-ПРИВАТНОСТІ-ХМАРИ-М7.uk.md)).
