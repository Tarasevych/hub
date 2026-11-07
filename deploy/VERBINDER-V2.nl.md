> 🌐 **Taal / Мова:** [Українська](ЗЄДНУВАЧ-В2.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# AI-connectors v2: een eigen adres voor elke agent (fase 1, 15.10.2026)

> **Bijgewerkt op 20.10.2026 — fase 2 voltooid.** De adressen zijn nu kort: `https://mcp.tarasevych.com/<agent>` (`/claude`, `/gpt`,
> `/grok`, `/gemini`, `/copilot`, `/cursor`). De oude `/ai/<agent>`-paden antwoorden met een **308 Permanent Redirect** naar de korte paden (308 en niet
> 301/302: MCP werkt via POST, en bij 301/302 mag een client dat omzetten in GET). Rechten worden niet langer vastgelegd in de grant:
> één connector toont zowel privé- als technische hulpmiddelen, en wat er precies beschikbaar is wordt bij elke aanroep bepaald op basis van
> de actuele status van de gebruiker. Alles over de uitrol: **`deploy/VERBINDER-EEN-PAD.nl.md`**. Hieronder staat de beschrijving van fase 1; waar
> `/ai/<agent>` staat, leest u `/<agent>`.

## Wat het is
- **Een eigen adres voor elke AI**:

  | Agent | Connectoradres |
  |---|---|
  | Claude | `https://mcp.tarasevych.com/ai/claude` |
  | ChatGPT | `https://mcp.tarasevych.com/ai/gpt` |
  | Grok | `https://mcp.tarasevych.com/ai/grok` |
  | Gemini | `https://mcp.tarasevych.com/ai/gemini` |
  | Copilot | `https://mcp.tarasevych.com/ai/copilot` |
  | Cursor | `https://mcp.tarasevych.com/ai/cursor` |

  Een token dat voor het ene adres is uitgegeven, werkt niet op een ander adres en werkt niet op het oude `/mcp`. Dit wordt gecontroleerd aan de hand van zowel het
  terugkeeradres (claude.ai kan niet koppelen op `/ai/grok`) als door de server bij elke aanroep. Elke poging wordt vastgelegd in het logboek.
- ~~**Waarom `/ai/<agent>` en niet `/grok`**: de adressen `/grok`, `/claude`, `/chatgpt`, `/gemini`, `/copilot` zijn al bezet door de technische
  «deuren» van de server (brug op poort 8091).~~ **Voltooid op 20.10.2026**: `AGENT_PAD_PREFIX` in `shared/connector-v2/agenten.ts` is nu
  leeg, de korte paden worden bediend door de hoofdapplicatie, en de deuren houden alleen `/oauth/*` en `/health` totdat ze worden uitgeschakeld
  (`deploy/VERBINDER-EEN-PAD.nl.md`).
- **Hulpmiddelnamen in het Nederlands** (`shared/connector-v2/catalogus.ts`):
  `<kern, ≤5 woorden>_<agent>_<subdomein>[_<dienst>]_tarasevych_com_<gebruiker|beheer>`.
  Bijvoorbeeld: `lezen_bericht_grok_mail_gmail_tarasevych_com_gebruiker`, `tonen_live_release_gpt_admin_tarasevych_com_beheer`.
  - Alleen `a-z`, `0-9` en `_`, maximaal 64 tekens: dit wordt vereist door Claude, ChatGPT en de MCP-specificatie. Daarom staat er `creeren` in de naam, maar
    «creëren» op het scherm. Een test controleert elke naam voor elke agent.
  - De dienst wordt weggelaten als die samenvalt met het subdomein (`…_github_tarasevych_com_…`, en niet `…_github_github_…`).
  - Het voorbeeld `creëren_nieuw_bestand_grok_mail_gmail_…` is `creeren_bestand_grok_cloud_gdrive_tarasevych_com_gebruiker` geworden:
    het aanmaken van een bestand hoort bij Drive (cloud/gdrive), niet bij e-mail, en zo past de naam voor alle agenten binnen 64 tekens.
- **Ruimtes**:
  - `_gebruiker` — privéruimte: uw e-mail, bestanden, bord, uw apparaten;
  - `_beheer` — technische toegang: site en server, alleen voor de eigenaar met een actief technisch profiel.
  - Apparaten en apps bestaan in beide ruimtes: `_gebruiker` betekent uw pc, `_beheer` betekent de server zelf.
  - De ruimte waarin de aanroep wordt uitgevoerd, wordt bepaald door het achtervoegsel in de naam van het hulpmiddel. Daardoor werkt een `_beheer`-recht nooit in
    de privéruimte, en andersom.
- **Rechten per hulpmiddel** (`app.connector_v2_rechten`):
  - **Standaard** staat alleen het veilige aan: lezen, laag risico, niet-gevoelige gegevens, privéruimte. E-mail, schrijven en
    verwijderen staan standaard uit.
  - **Modi** per groep, per ruimte of voor alles: alle acties / alleen lezen / lezen en schrijven / alleen schrijven / geen.
  - Aparte schakelaar voor elk hulpmiddel, categorie in- en uitschakelen, zoeken.
  - De scopelaag (0044) wordt door de server automatisch bijgewerkt zodat die overeenkomt met de gekozen hulpmiddelen.

## Verbinden (stappenvenster op mcp.*/agents)
1. **Bevestiging**: wie vraagt toegang, terugkeeradres, connectoradres. Als de client zich uitgeeft voor een andere agent, ziet u een
   waarschuwing.
2. **Beveiliging** — alleen als u «Extra bevestiging bij elke nieuwe verbinding» hebt ingeschakeld. Dan is een passkey of een code uit de
   authenticator-app nodig. Als u net bent aangemeld, zijn er geen extra stappen. De gewone aanmeldbevestiging (H4) werkt zoals voorheen.
3. **Account**: het huidige account of «Een ander account koppelen». Na het aanmelden blijft het verzoek bewaard.
4. **Ruimte** (alleen eigenaar): privé, technisch of beide. Voor technisch is een actief technisch profiel in dit tabblad vereist.
5. **Rechten**:
   - groepen met pictogrammen;
   - de schakelaar bij elke regel heeft een kleur en symbool (✓ aan, × uit, steeksleutel voor technische toegang, wegafzetting
     voor «in ontwikkeling»);
   - elke regel heeft risicolabels en de samenvatting toont het hoogste risico binnen uw selectie;
   - een uitgeklapte regel toont wat het hulpmiddel doet, wat dit voor u betekent, waar u op moet letten, het schema «AI → actie → waar» en het adres
     van het hulpmiddel met een kopieerknop;
   - onderdelen «in ontwikkeling» zijn zichtbaar, maar kunnen niet worden ingeschakeld.
   - Bij opnieuw verbinden zijn er drie secties: «Wordt toegevoegd», «Was al actief», «Wordt niet toegevoegd». De keuze kan daar direct worden aangepast.

## Beheer (tabblad «Connectors»)
Het tabblad staat op mcp.*/agents, en bij een actief technisch profiel op mcp.*/verbindingen.
- Voor elke agent zijn het adres met kopieerknop, de verbindingen, het aantal rechten en het bijbehorende risico zichtbaar.
- Knoppen: «Rechten», «Opnieuw verbinden», «Intrekken».
- **Inperken werkt direct** voor alle actieve verbindingen van deze agent. Dat is de veilige richting.
- **Uitbreiden** wordt onthouden en wacht op opnieuw verbinden:
  1. u klikt op «Opnieuw verbinden»;
  2. de site sluit de verbinding;
  3. de AI-client krijgt 401 en opent zelf het toestemmingsvenster;
  4. in het venster is te zien wat er verandert;
  5. uw keuze gaat niet verloren totdat u bevestigt.
- **Intrekken** sluit de toegang onmiddellijk. Koppel de agent opnieuw om verder te werken.

## Wat hetzelfde is gebleven
- De oude connector `https://mcp.tarasevych.com/mcp` en de serverdeuren (`/Grok`, `/claude`, …) werken zoals voorheen. Reeds gekoppelde AI's
  merken niets.
- Het ondertekende AI-beleid, de siteschakelaars, het voorbereiden van updates en de passkey-goedkeuring daarvan blijven het plafond. Connector v2 gaat door
  dezelfde poorten als `/mcp`.

## Na installatie (als beheer)
```bash
scp mijn-ruimte-<sha>.tar.gz mijn-ruimte-<sha>.tar.gz.sha256 beheer@<server>:/tmp/
ssh beheer@<server>
cd /tmp && sha256sum -c mijn-ruimte-<sha>.tar.gz.sha256
mkdir -p ~/releases && tar -xzf mijn-ruimte-<sha>.tar.gz -C ~/releases
sudo /usr/local/sbin/mijn-ruimte-installeer installeren ~/releases/hub-<sha>
```
Migratie 0045 draait automatisch. Controle: `curl -sI https://mcp.tarasevych.com/ai/claude -X POST` moet `401` teruggeven
en `WWW-Authenticate` met `…/ai/claude/.well-known/oauth-protected-resource`.

**Optioneel** (cloudflared, root-config). Zodat clients die eerst het standaardpad
`/.well-known/oauth-protected-resource/ai/<agent>` proberen de metadata meteen vinden, kan de eerste regel voor mcp in
`/etc/cloudflared/config.yml` worden vervangen door de regel uit het sjabloon `deploy/cloudflared-config.yml`:
```
    path: ^/\.well-known/(oauth-protected-resource/(mcp|ai/(claude|gpt|grok|gemini|copilot|cursor))|oauth-authorization-server/oauth2)$
```
Voer daarna `sudo systemctl restart cloudflared` uit. Ook zonder deze wijziging werkt alles: het 401-antwoord wijst direct het juiste adres aan.

## Wat volgt (fase 3+)
- ~~De serverdeuren verplaatsen en `/grok`, `/gpt`, … aan de connectors geven.~~ **Voltooid op 20.10.2026** (`deploy/VERBINDER-EEN-PAD.nl.md`).
- `/mcp` en het deurproces zelf verwijderen zodra er geen verbindingen zonder agent en geen `tvh_…`-tokens meer over zijn (zoekopdracht's staan in datzelfde bestand).
- Schakelaar op domeinniveau «agent volledig uitschakelen». Nu werken intrekken en siteschakelaars op verbindingsniveau.
- Echte functies voor onderdelen «in ontwikkeling»: e-mail verzenden met bevestiging, bestanden aanmaken en uploaden naar Drive, foto's,
  iCloud, pull requests, beveiligingslogboek, beheer van gebruikers en feature-flags met passkey, genereren van afbeeldingen en schema's, Stripe.
- Handmatige tokens (`tvh_…`) voor v2: momenteel accepteert v2 alleen OAuth-verbindingen die aan het adres zijn gebonden.
