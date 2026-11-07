> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261014-ОБЄДНАННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Release 14.10.2026 — samenvoeging van twee parallelle werkzaamheden

Deze release bundelt:
- het werk van een andere agent, archief `mijn-ruimte-20261013-195546.tar.gz` (UITROL-VERSIE 20261013-195546, BRON-COMMIT 8ea046a — deze commit staat niet op GitHub);
- mijn releases van 13.10: `ac6b3a3` (terminal in de browser) en `4c3e7da` (agent 0.7.0: toestemmingen per stuk, zoeken en bestandsinformatie).

De basis van het archief van de andere agent is een tussenstand van de fase «terminal» (het dichtst bij `ac6b3a3`: 942 bestanden identiek, 28 gewijzigd, 1 toegevoegd).
Agent 0.7.0, migratie 0037 en twee nieuwe MCP-hulpmiddelen ontbreken daarin: het werk liep parallel.

## Wat de andere agent heeft gedaan en wat daarvan is overgenomen

Ongewijzigd overgenomen (uitrolpijplijn, installatie-audit):
- `deploy/installeer-app.sh` — `noteer_ssh`: een handmatige installatie of terugdraai via SSH schrijft een auditregel
  (`SSH_OK` / `SSH_TERUG`): wie (`SUDO_USER`), vanaf welk adres (`SSH_CONNECTION`), pakket, commit. Het test-subcommando
  `noteer-proef` werkt alleen als niet-root en alleen met `INSTALLEER_NOTEER_PROEF=1`.
- `deploy/uitrol/mijn-ruimte-uitrol.sh` — audit nu ook voor installaties met een ondertekende releasesleutel (voorheen alleen passkey);
  ook een weigering komt altijd in de audit; de installer krijgt `MIJN_RUIMTE_UITROL_MODUS` mee.
- `deploy/gitops/gitops-ophalen.sh`, `deploy/opdracht/mijn-ruimte-opdracht.sh` — geven hun modus door aan de installer,
  zodat er geen dubbele handmatige SSH-regel ontstaat.
- `backend/server-beheer.ts` — velden `herkomst`, `wie`, `pakket`, `release`, `commit`, `adres` (elk gevalideerd met een regex);
  `toonbareInstallaties`.
- `backend/uitrol-goedkeuring.ts`, `src/AdminUitrolView.tsx` — «Оновлення → Історія» (Updates → Geschiedenis) toont installaties via SSH en met handtekening.
- Tests: `server-beheer`, `uitrol-deur`, `uitrol-goedkeuring` (nieuwe auditcontroles).

Als idee overgenomen, herschreven in onze terminalimplementatie:
- vlag `--test` (testmachine). Bij ons: `terminal.servers` (Beheerder, Eigenaar) — elk eigen apparaat;
  `terminal.test` (Ontwikkelaar) — alleen een machine met `--test`. Voorheen kon een Ontwikkelaar ook op een server een terminal openen.

NIET overgenomen (de eigen terminalversie van de andere agent), omdat die afwijkt van de afgesproken architectuur:
- De Eigenaar opende de terminal en bekeek opnames **zonder actief technisch profiel** (`isEigenaar`-omzeiling).
  Afgesproken: rechten gelden alleen tijdens activering in dit tabblad, ook voor de Eigenaar.
- De duur werd niet begrensd door de resterende tijd van het technisch profiel.
- De container werd niet gesloten als de browser niet binnen 30 s verbinding maakte.
- Uitvoer werd als platte tekst (zonder base64) verstuurd: binaire en afgebroken UTF-8-reeksen zouden beschadigd raken.
- Terminalopnames waren verwijderd uit het onderdeel «Доступ» (Toegang) van het logboek.
- De e2e-test van de terminal was verwijderd.

## Wat ik daarbovenop heb toegevoegd

- Agent **0.7.1**:
  - `--test` voor `terminal-config on`;
  - **bug opgelost**: vlaggen zonder waarde (`--test`, `--disable`) slikken het volgende woord niet meer in.
    Voorheen schakelde `node agent.mjs apps-config --disable` de applicaties **niet** uit, en at `--test --runtime podman`
    de vlag `--runtime` op.
- Server: regel `magApparaat` (`shared/terminal.ts`), weigering `TERMINAL_ALLEEN_TESTMACHINE`; in het terminalvenster is een voor de rol
  onbeschikbare machine wel zichtbaar maar uitgeschakeld met uitleg, en een testmachine is gemarkeerd als «тестова» (test).
- SSH-audit: een ongeldige gebruikersnaam wordt nu vastgelegd als `onbekend` in plaats van `root` (`root` geldt alleen wanneer `SUDO_USER` leeg is).
- Test `uitrol-deur`: het ongecontroleerd lezen van het modusbestand liet de hele suite crashen; nu is dit een gewone testcontrole.
- Nieuwe eenheidstests: regel testmachine/server, echte CLI-aanroepen `terminal-config on --test --runtime podman` en `apps-config --disable`.

## Controles

- `tsc` (site en server) foutloos; zelftest van de agent — alles OK.
- Eenheidstests: terminal 25/25, tech-profiel 37/37, diagnose 21/21, ondersteuning 24/24, weergave 16/16, rls-groepen 20/20, beleid 17/17,
  ai-beleid 23/23, mcp-connector 65/65, site-tools 27/27, agents 38/38, agent-commands 10/10, agent-apps 27/27, install-commands 6/6.
- E2E (Chrome): terminal 14/14, tech-profiel 26/26, uitrol-meester 18/18, mcp-een-klik 24/24.
- SSH-audit rechtstreeks getest (als niet-geprivilegieerde gebruiker): juiste regel en `status.json`;
  pogingen tot commando-injectie via `SUDO_USER` / `SSH_CONNECTION` voerden niets uit; root start het test-subcommando niet.
- Net als vóór de samenvoeging slagen `uitrol-deur`, `server-beheer` en 1 controle in `uitrol-goedkeuring` niet in deze omgeving
  (geen `/etc/mijn-ruimte`, systemd-diensten en ondertekende tags). Hetzelfde geldt op basis `4c3e7da` en in de boom van de andere agent.
- Testhygiëne (los van de samenvoeging): na e2e blijft er in de testdatabase een gebruiker met het e-mailadres van de eigenaar achter; daardoor toont de eenheidstest `tech-profiel`
  na e2e 36/37. Aparte taak.
