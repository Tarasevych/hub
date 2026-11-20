> 🌐 **Taal:** [Українська](РОЗПОДІЛЕНЕ-ЗАШИФРОВАНЕ-ЗБЕРІГАННЯ.uk.md) · **Nederlands** | [Documentatie-index](../INDEX.nl.md)

# Verdeelde versleutelde opslag van databases en siteonderdelen (`k-van-n`)

**Status:** cryptografische kern en spreidingsbeleid geïmplementeerd (`UPD-012`, `shared/verdeelde-opslag.ts`); automatische spreiding over externe knopen volgt in de volgende fase (`orchestratie/onderwerpen/verdeelde-versleutelde-opslag.json`).

## 1. Doel en dreigingsmodel

Zelfs als een aanvaller of derde partij volledige fysieke of beheerderstoegang krijgt tot één server, één cloudplatform of alle servers binnen één land, mag deze **geen database- of klantgegevens kunnen ontsleutelen** zonder fysieke toegang tot de overige onafhankelijke delen.

## 2. Tweelaags beveiligingsmodel

1. **Gegevenslaag (versleuteling aan de vertrouwde zijde):**
   - Gebruikersgegevens worden versleuteld met een eigen `DEK` per gebruiker en ruimte (`shared/sleutelkluis.ts`), en serverback-ups met `age` (`deploy/backup-maken.sh`) zonder privésleutel op de server.
   - Grote archieven worden opgedeeld in geauthenticeerde blokken (tot 4 MiB) met SHA-256-controlesommen en een monotoon revisienummer tegen terugdraaiaanvallen.
2. **Sleutellaag (Shamir-drempelschema `k-van-n` over `GF(256)`):**
   - Geïmplementeerd in `shared/verdeelde-opslag.ts` (`splitsGeheim`, `herstelGeheim`).
   - Een sleutel wordt gesplitst in `n` delen (bijv. `3-van-5`): elke verzameling van `k-1` delen geeft **informatietheoretisch nul** kennis over de sleutel; elke `k` geldige delen herstellen de sleutel exact.

## 3. Beleid voor land- en aanbiederspreiding

`controleerSpreiding()` in `shared/verdeelde-opslag.ts` weigert elke opstelling waarin één land of één aanbieder `≥ k` delen bewaart, of waarin minder dan `n` actieve onafhankelijke knopen beschikbaar zijn.

## 4. Continuïteit tussen agenten

Alle besluiten, actieve en geplande mogelijkheden en eisen van de eigenaar liggen vast in `orchestratie/onderwerpen/verdeelde-versleutelde-opslag.json`, zodat elke volgende agent via `node scripts/orch.mjs begin` zonder verlies kan voortbouwen.
