> 🌐 **Taal / Мова:** [Українська](ПЛЮЩ-ЕТАП-4-РОЗПОДІЛЕНІ-КЛЮЧІ-ТА-ПОРОГОВІ-ПІДПИСИ.uk.md) · **Nederlands** | [Startpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md) · [Hoofdarchitectuurmanifest «Klimop»](ARCHITECTUURMANIFEST-KLIMOP.nl.md) · [Fase 1 — Kern en uitgaveplan](KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md) · [Fase 2 — «Stengels»](KLIMOP-FASE-2-BEPROEVINGSNETWERK-EN-STENGELS.nl.md) · [Fase 3 — Versleuteling en opslag](KLIMOP-FASE-3-VERSLEUTELING-EN-VERDEELDE-OPSLAG.nl.md)

# Fase 4 van het ecosysteem «Klimop» — Gedistribueerde sleutels, verifieerbare geheimdeling (Feldman/Pedersen), proactieve epochen en FROST-drempelhandtekeningen (`KLIMOP-005`)

- **Uitvoeringsdatum:** 20-11-2026
- **Coördinatietaak:** `KLIMOP-005` (bouwt voort op het in `integratie` samengevoegde verzoek nr. 186 `KLIMOP-004`, samenvoeging `1edf8bf471b6a9e25682ecfb5beae8842708f080`)
- **Programmatische realisatie:**
  - `Ed25519 (RFC 8032)`-groep, Feldman- en Pedersen-VSS, tweefasige proactieve epocheverversing, dealerloze `DKG` en tweeronde-drempelhandtekeningen `FROST(Ed25519, SHA-512)` volgens `RFC 9591`: [`shared/klimop/drempelsleutels.ts`](../../shared/klimop/drempelsleutels.ts)
  - Netwerkcoördinator voor drempeloperaties boven op «Stengels»: [`backend/klimop-drempel-client.ts`](../../backend/klimop-drempel-client.ts)
  - Geïsoleerde knoopafhandeling voor drempeldelen en eenmalige nonces: [`backend/klimop-knooppunt-agent.ts`](../../backend/klimop-knooppunt-agent.ts)
  - Herhaalbaar Fase 4-proefscenario (`NL`, `CH`, `UA`): [`scripts/klimop-etappe4-frost-proef.mjs`](../../scripts/klimop-etappe4-frost-proef.mjs)
- **Normatieve grondslag:** hoofdstukken `§7`, `§8`, `§9`, `§10`, `§36 (Fase 4)`, `§38`, `§42–§44` van het [Hoofdarchitectuurmanifest «Klimop»](ARCHITECTUURMANIFEST-KLIMOP.nl.md)
- **Machtigingsgrens:** de drempellaag draait in de geïsoleerde proefketen zonder wijziging aan de actieve productieserver `*.tarasevych.com`, `systemd`-diensten of productie-`PostgreSQL 18.6`; bestaande handtekeningen van de eigenaar blijven parallel geldig.

---

## 1. Verifieerbare geheimdeling: onderscheid tussen Feldman en Pedersen (§7–§8)

Ter uitvoering van §8 van het manifest zijn in [`shared/klimop/drempelsleutels.ts`](../../shared/klimop/drempelsleutels.ts) beide gestandaardiseerde verifieerbare drempelschema's boven de priemondergroep van orde $\ell = 2^{252} + 27742317777372353535851937790883648493$ op `Ed25519` gerealiseerd:

| Schema | Toezeggingen | Deelcontrole door deelnemer $i$ zonder onthulling | Geheimhoudingseigenschap en rol in «Klimop» |
|---|---|---|---|
| **Feldman (`splitsMetFeldmanVss`)** | $C_j = a_j B$ ($j = 0 \dots t-1$) | $s_i B \stackrel{?}{=} \sum_{j=0}^{t-1} i^j C_j$ (`verifieerFeldmanDeel`) | **Rekenkundig verhullend** ($C_0 = s B$ vormt de publieke groepssleutel). Bestemd voor dealerloze `DKG` en `FROST`-ondertekeningssleutels waarbij $Y = C_0$ publiek verifieerbaar moet zijn. |
| **Pedersen (`splitsMetPedersenVss`)** | $P_j = a_j B + b_j H$ ($H$ onafhankelijk afgeleid zonder bekende $\log_B H$) | $s_i B + r_i H \stackrel{?}{=} \sum_{j=0}^{t-1} i^j P_j$ (`verifieerPedersenDeel`) | **Informatietheoretisch verhullend** ($P_0$ onthult nul informatie over $s$, zelfs tegen een onbeperkte aanvaller). Bestemd voor het splitsen van wortelgeheimen voor toegangsherstel. |

Elk gedecodeerd punt wordt gecontroleerd op lidmaatschap van de priemondergroep van orde $\ell$ ($\ell \cdot P = \mathcal{O}$ en $P \ne \mathcal{O}$) tegen kleine-ondergroepaanvallen.

---

## 2. Proactieve epocheverversing met bescherming tegen afgebroken rotatie (§9, §38)

Om te verhinderen dat een aanvaller gedurende lange tijd één voor één gestolen delen verzamelt, werkt epocheverversing tweefasig (Herzberg et al.):

```mermaid
sequenceDiagram
  participant C as "Coördinator (zonder geheimen)"
  participant N as "Knooppunten 1..n (epoche e)"

  C->>N: "1. ververs_maak_nulbijdrage — elk knooppunt k kiest polynoom delta_k(0) = 0 en toezeggingen Delta_{k,1..t-1}"
  C->>N: "2. ververs_voorbereiden — controle op vrije term 0*B; opslag in voorbereidingsbuffer (deel van epoche e blijft bewaard!)"
  alt "Alle knooppunten voorbereid"
    C->>N: "3a. ververs_afronden(bevestig) — overstap naar epoche e + 1; oude delen vervallen; groepssleutel C_0 blijft identiek"
  else "Verbindingsfout of vervalste bijdrage"
    C->>N: "3b. ververs_afronden(afbreken) — veilig terugrollen naar consistente epoche e zonder sleutelverlies"
  end
```

- **Behoud van de groepssleutel:** omdat elke verversingsbijdrage vrije term $0$ heeft ($\Delta_{k,0} = \mathcal{O}$), blijft het groepsgeheim en de publieke sleutel $Y = C_0$ ongewijzigd, terwijl oude delen uit epoche $e$ niet meer te combineren zijn met nieuwe delen uit epoche $e + 1$ (`EPOCHE_VAN_DELEN_VERSCHILT`).
- **Eerlijke grens (§9):** epocheverversing maakt losse oudere delen onbruikbaar, maar beschermt niet wanneer een aanvaller binnen één en dezelfde epoche al $\ge t$ geldige delen heeft bemachtigd.

---

## 3. Dealerloze sleutelopwekking (`DKG`) en `FROST(Ed25519, SHA-512)` volgens `RFC 9591` (§10)

Conform §10 en §43 punt 5 wordt de volledige privésleutel nooit op één plek opgebouwd en geldt een drempelhandtekening voor **kritieke besluiten en uitgaveondertekening (niet als algemene gegevensversleuteling)**:

1. **Dealerloze `DKG` (`voerNetwerkDkgUit`):** na controle van jurisdictie- en aanbiedersspreiding genereert elk van de $n$ onafhankelijke knooppunten een eigen polynoom en berekent zijn uiteindelijke aandeel $s_i$ uitsluitend in eigen geheugen. De volledige groepsprivésleutel $s$ bestaat op geen enkel moment op één apparaat of server.
2. **Tweeronde-`FROST` (`RFC 9591`):**
   - **Ronde 1 (`frostRonde1MaakToezegging`):** eenmalige nonces $(d_i, e_i)$ met hergebruikblokkade (`FROST_NONCE_REEDS_VERBRUIKT`) en directe geheugenwissing in `finally`.
   - **Ronde 2 (`frostRonde2TekenDeel`):** berekening van deelhandtekening $z_i$ zonder het geheime aandeel $s_i$ over het netwerk te sturen.
   - **Individuele foutopsporing en standaardverenigbaarheid (`frostVoegHandtekeningSamen`):** elke deelhandtekening wordt afzonderlijk getoetst aan $z_i B \stackrel{?}{=} D_i + \rho_i E_i + (\lambda_i c) Y_i$ (zodat een kwaadwillende knoop in `verdachteDeelnemers` wordt aangewezen), en het resulterende 64-byte resultaat is een **standaard `Ed25519 (RFC 8032)`-handtekening** die rechtstreeks slaagt in `node:crypto.verify`.

---

## 4. Herhaalbare verificatie van Fase 4 en de 15 architectuurvragen (§42)

Lokale proefopdracht (3 onafhankelijke knooppunten `NL`, `CH`, `UA` op `127.0.0.1`):
```bash
node scripts/klimop-etappe4-frost-proef.mjs
```
Bewijst dealerloze `DKG` `2-van-3`, `FROST`-ondertekening bij uitgeschakeld knooppunt `CH`, veilig terugrollen bij afgebroken rotatie, overstap naar epoche 2 en `FROST`-ondertekening door `CH + UA` met verificatie in `node:crypto.verify`. Alle §38-proeven en de 15 vragen uit §42 worden automatisch getoetst in [`tests/eenheid/klimop-005-etappe4-drempelsleutels-20261120.test.ts`](../../tests/eenheid/klimop-005-etappe4-drempelsleutels-20261120.test.ts).
