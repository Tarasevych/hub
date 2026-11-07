> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261026-БЛОК1.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

## AX. Blok 1 "snelle oplossingen" (26-10-2026)

Het eerste van acht blokken uit het plan `PLAN-8-BLOKIV-2026-10-25.md` (punten 1.1–1.4, 2.5, 6.1, 6.3, 8.1–8.3, 8.6). Samenvatting uit `concept-AX.md`. Basis: `374dde7` (`werk-20261024`).

Mailacties vanuit één register, rijpaneel binnen de rijgrenzen, "Voorbeeld" (`Перегляд`) als eerste actie, geminimaliseerde berichten zonder `bottom !important`, bijlagen groeien niet in de rij, vensterkoppen nemen de gemeten `--plaats-boven-reserve` over, ChatGPT-instructies binnen de eerste 512 tekens, en het venster "Toegang bevestigen" (`Підтвердіть доступ`) rekt het selectievakje niet uit.

### Controles ({{PEREVIRKY}})

Vervangende omgeving: Node v22.23.3 (de repository vraagt ≥ 24; `npm ci` slaagde met de waarschuwing EBADENGINE). Postgres is niet aanwezig in deze omgeving.

| Testset | Resultaat |
| --- | --- |
| `bevestig-toegang-opmaak-20261025` | 19/19 |
| `connector-instructies-20261025` | alle genoemde controles OK (samen met de rest van het filter `20261025`) |
| `mail-acties-20261025` | 52/52 |
| `mail-geminimaliseerd-20261025` | 39/39 |
| `plaatsing-20261025` | 68/68 na het toestaan van de oude reserve in `scripts/plaatsing-vaste-elementen.json` → `kopReserves` |
| `agent-verbinden-20261020` | 65/65 |
| `lees-venster-20261024` | 46/46 |
| `mail-rij-mobiel-20261021` | 34/34 |
| `mail-ux-beoordeling-20261021` | 47/47 |
| `rls.test` en `audit-rls` | OVERGESLAGEN: geen `DATABASE_URL_APP` en Postgres-rollen. Dit is geen bewijs van RLS. |

De volledige `eenheidstests.mjs` zonder filter en de testopstelling (`keten-b1.sh`) zijn hier niet uitgevoerd: de testopstelling, Playwright en Postgres 55432 ontbreken in de aangeleverde archieven. Het bestand `keten-b1.voortgang` brak af bij `blok1-voor`; de screenshotmappen `uit-na` / `uit-voor` zijn niet meegeleverd, dus er zijn geen "voor/na"-afbeeldingen van de testopstelling.

Oplossing tijdens deze controle: één vermelding in `kopReserves` voor de oude `padding-right:4rem` van de kop van de bijlagenwerkruimte. Zonder deze vermelding faalde `plaatsing-20261025` op controle K (1 van 68).
