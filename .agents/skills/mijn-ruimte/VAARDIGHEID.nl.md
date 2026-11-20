---
name: mijn-ruimte
description: Tweerichtingsplug-in en MCP-connector van Google Antigravity voor Mijn Ruimte (*.tarasevych.com) — de site bouwen, browser, lokale pc, server en coördinatie beheren. Двосторонній з’єднувач MCP Google Antigravity для Mijn Ruimte (*.tarasevych.com).
---

> 🌐 **Taal / Мова:** [Українська](НАВИЧКА.uk.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../../docs/INDEX.nl.md)

> 🇳🇱 **Nederlandse versie** · 🇺🇦 [Українська (канонічна)](./НАВИЧКА-МІЙ-ПРОСТІР.uk.md)

# Mijn Ruimte — Google Antigravity-plug-in en tweerichtingsbrug (`/antigravity`)

Deze vaardigheid voorziet **Google Antigravity** van een toegewijde tweerichtingsconnector (`https://mcp.tarasevych.com/antigravity`) en opdrachtregelbrug (`<pad-naar-vaardigheid>/scripts/mijn-ruimte`) om via vier actieve kanalen met het **Mijn Ruimte**-platform (`*.tarasevych.com`) te werken:

1. **Site, vaardigheden en multi-agentcoördinatie (`site` / `orch` / `vaardigheden`)** — e-mail, agenda, cloudbestanden, taakbord, GitHub-opslagplaatsen en gedeelde context lezen en schrijven, en taken tussen AI-agenten coördineren (`v2_whoami`, `site_search`, `list_services`, `orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_begin`, `orch_inleveren_stuk`, `orch_inleveren_klaar`, `vaardigheden_aanbevelen`, `vaardigheden_opslaan`, `ecosysteem_context_list`, `ecosysteem_context_save`).
2. **Browserextensie (`browser`)** — de Mijn Ruimte-extensie voor Chrome en Firefox rechtstreeks aansturen in privé- (`_gebruiker`) en technische (`_beheer`) tabbladsloten (`browser_list_tabs`, `browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_screenshot`, `browser_console`, `browser_network`, `browser_audit`, `browser_get_deep_diagnostics`, `browser_script`).
3. **Lokale pc / computer en containers (`pc` via `agent.mjs`)** — de gekoppelde computer inspecteren en beheren in `_gebruiker` (persoonlijke pc) of `_beheer` (technische host) (`machine_list`, `machine_info`, `machine_list_dir`, `machine_read_file`, `machine_file_info`, `machine_search_files`, `system_metrics`, `machine_write_file`, `machine_exec`, `docker_list_containers`, `docker_manage_container`).
4. **Server en uitgaven (`server` in `_beheer`)** — de productieserver bewaken en beheren zolang de technische ruimte van de eigenaar actief is (`get_system_health`, `get_live_release`, `list_releases`, `read_release_file`, `uitrol_voorstel_status`, `uitrol_voorstel_begin`, `uitrol_voorstel_stuk`, `uitrol_voorstel_klaar`, `app_deploy_status`, `app_logs`, `get_admin_view`, `audit_read`, `siem_status`).

## Canoniek eindpunt en naamgeving van hulpmiddelen

- **Toegewijd MCP-eindpunt**: `https://mcp.tarasevych.com/antigravity`
- **OAuth-metadata voor beveiligde bronnen (RFC 9728)**: `https://mcp.tarasevych.com/.well-known/oauth-protected-resource/antigravity`
- **Webbedieningspaneel**: `https://mcp.tarasevych.com/agenten#agent/antigravity`
- **Naampatroon voor v2-hulpmiddelen**: `<essentie>_antigravity_<subdomein>[_<dienst>]_tarasevych_com_<gebruiker|beheer>` (altijd `<= 64` tekens).
  - Hulpmiddelen die eindigen op `_gebruiker` werken in de **privéruimte** van de gebruiker.
  - Hulpmiddelen die eindigen op `_beheer` werken in de **technische ruimte** (alleen zichtbaar en aanroepbaar wanneer het technische profiel van de eigenaar actief en gedelegeerd is).
- Deze vaardigheid verleent zelf geen toegangsrechten: de actieve machtigingen en eigenaarscontroles blijven beslissend.

## Opdrachtregelcommando's (`<pad-naar-vaardigheid>/scripts/mijn-ruimte`)

Roep het meegeleverde script altijd aan met `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte <Opdracht> [vlaggen]`:

### 1. Verbinding instellen en controleren
```bash
# Eindpunt opslaan en ~/.gemini/settings.json voor Antigravity instellen
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/antigravity [--token <TOKEN>]

# RFC 9728-metadata, MCP-sessiestatus en zichtbare hulpmiddelen per kanaal controleren
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Status

# Alle toegekende hulpmiddelen tonen (optioneel gefilterd met --groep of --kant gebruiker|beheer)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Lijst [--kant gebruiker|beheer]
```

### 2. Tweerichtingscoördinatie van site en agenten (`orch_*`)
```bash
# Actueel overzicht van multi-agentcoördinatie van de site ophalen
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchOverzicht

# Compacte regelcontext ophalen (CONTEXT-COMPACT.md + vergrendelingsafdruk)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchContext

# Nieuwe taak registreren in de coördinatie via MCP
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchTaakStart --id AGPLUGIN-002 --samenvatting "Taakomschrijving"
```

### 3. Tweerichtingsbediening van de browser (`browser_*`)
```bash
# Geopende tabbladen in het ontgrendelde browserslot tonen
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserTabs [--kant gebruiker|beheer]

# Een adres openen in het browserslot
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserOpen --doelUrl https://tarasevych.com [--kant gebruiker]

# DOM-momentopname van het actieve tabblad maken
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSnapshot [--kant gebruiker]

# Klikken of typen in het actieve tabblad
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserKlik --selector "button[data-agent-terug]"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserTyp --selector "input[name=q]" --tekst "Antigravity"

# Schermafbeelding maken of diepe debuggerdiagnose uitvoeren (_beheer)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSchermafdruk [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserDiagnose
```

### 4. Tweerichtingsbediening van de lokale pc (`machine_*`, `system_metrics`, `docker_*`)
```bash
# Systeembelasting (system_metrics: processor, geheugen, schijf) van de gekoppelde pc
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcStatus [--kant gebruiker]

# Mappen bekijken of bestanden lezen binnen toegestane hoofdmappen op de pc (machine_list_dir, machine_read_file)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcBestanden --pad . [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcLees --pad README.md [--kant gebruiker]

# Bestand schrijven of een toegestane opdracht uitvoeren op de pc (machine_write_file, machine_exec)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcSchrijf --pad notes.txt --inhoud "Test"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcOpdracht --opdracht "git status"

# Docker-containers op de pc of server inspecteren (docker_list_containers)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcDocker [--kant gebruiker|beheer]
```

### 5. Tweerichtingsbeheer van server en uitgaven (`_beheer`)
```bash
# Servergezondheid, diensten en databasestatus controleren (get_system_health)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerGezondheid

# Uitrolstatus, geïnstalleerde uitgave en dienstlogboeken controleren (uitrol_voorstel_status, get_live_release, app_logs)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerUitrolStatus
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerRelease
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerLogs --dienst hub --regels 100

# Laatste regels van het auditlogboek bekijken (audit_read)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerAudit --limiet 25
```

### 6. Algemene hulpmiddelaanroep en standaard-I/O MCP-brug
```bash
# Een v2-hulpmiddel rechtstreeks op volledige naam of korte aanduiding aanroepen
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte RoepAan --hulpmiddel <hulpmiddelnaam> --args '{"sleutel":"waarde"}'

# Draaien als standaard MCP-stdio-server gekoppeld aan https://mcp.tarasevych.com/antigravity of /autoclaw
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte McpStdio [--url https://mcp.tarasevych.com/autoclaw]
```

### 7. Rechtsbijstandscontrole en AutoClaw (`GLM-5.3-flashX-Legal` / `/autoclaw`)
```bash
# AutoClaw (GLM) verbinden met het toegewijde eindpunt /autoclaw
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/autoclaw [--token <TOKEN>]

# Letterlijke controle van overeenkomst of brief per alinea uitvoeren
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte JuridischControleer [--bestand <PAD> | --tekst "<TEKST>"] [--taal uk|nl]
```

## Veiligheids-, bestuurs- en «Klimop»-regels (`KLIMOP-001`)
- **Wachtende goedkeuringen**: wanneer een schrijf- of actiehulpmiddel `status: "pending"` teruggeeft, wacht de site op bevestiging van de gebruiker in `BevestigingenPaneel` op `https://mcp.tarasevych.com/agenten#agent/antigravity`. Meld dit aan de gebruiker en herhaal de aanroep niet in een lus.
- **Technische ruimte (`_beheer`)**: als een `_beheer`-hulpmiddel `TECH_PROFILE_OFF` teruggeeft, vraag de eigenaar dan om de technische sessie in te schakelen of te delegeren op `https://mcp.tarasevych.com/agenten#agent/antigravity`.
- **Grenzen van «Hechtranken» en doelarchitectuur «Klimop» (`AGENTENREGELS.nl.md` §3b, §10, `docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`, vaardigheid `klimop-architectuur`)**: de brug voor pc- en browserbeheer werkt uitsluitend met uitdrukkelijke, afgebakende en intrekbare machtigingen zonder verborgen achtergrondgedrag (§1.4, §5.2). Het manifest «Klimop» geeft geen toestemming voor onmiddellijke wijziging van de productie-infrastructuur zonder afzonderlijke goedkeuring van de eigenaar; toets elke wijziging aan de 15 architectuurcontrolevragen (§10.4).
- **Opslagplaatsregels**: volg altijd `AGENTS.md` (`AGENTENREGELS.nl.md`), `ANTIGRAVITY.md` en `AUTOCLAW.md` bij het aanpassen van code in `Tarasevych/hub`.
