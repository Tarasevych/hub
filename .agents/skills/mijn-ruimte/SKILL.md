---
name: mijn-ruimte
description: Bidirectional Google Antigravity plugin and MCP connector for Mijn Ruimte (*.tarasevych.com) — build and manage the site, control the browser extension, manage the local PC (agent.mjs), and administer the server and multi-agent coordination via https://mcp.tarasevych.com/antigravity.
---

# Mijn Ruimte — Google Antigravity Plugin & Bidirectional Bridge (`/antigravity`)

This skill equips **Google Antigravity** with a dedicated bidirectional connector (`https://mcp.tarasevych.com/antigravity`) and CLI bridge (`<path/to/this/skill>/scripts/mijn-ruimte`) to work with the **Mijn Ruimte** (`*.tarasevych.com`) platform across four live channels:

1. **Site & Multi-Agent Coordination (`site` / `orch`)** — Read/write mail, calendar, cloud files, kanban board, GitHub repositories, and coordinate tasks across AI agents (`orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_*`).
2. **Browser Extension (`browser`)** — Control the Mijn Ruimte Chrome/Firefox extension in real time across private (`_gebruiker`) and technical (`_beheer`) tab slots (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_screenshot`, `browser_console`, `browser_network`, `browser_get_deep_diagnostics`, `browser_script`).
3. **Local PC / Computer (`pc` via `agent.mjs`)** — Inspect and manage the paired computer (`machine_status`, `machine_processes`, `machine_read_file`, `machine_write_file`, `machine_list_dir`, `machine_exec`, `machine_docker`) in `_gebruiker` (personal PC) or `_beheer` (technical host).
4. **Server & Releases (`server` in `_beheer`)** — Monitor and manage the production server while the owner's technical space is active (`server_health`, `deploy_status`, `deploy_logs`, `deploy_release`, `db_query_readonly`, `audit_tail`, `security_overview`).

## Canonical Endpoint & Tool Naming

- **Dedicated MCP Endpoint**: `https://mcp.tarasevych.com/antigravity`
- **OAuth Protected Resource Metadata (RFC 9728)**: `https://mcp.tarasevych.com/.well-known/oauth-protected-resource/antigravity`
- **Web Control Panel**: `https://mcp.tarasevych.com/agenten#agent/antigravity`
- **v2 Tool Name Pattern**: `<essentie>_antigravity_<subdomein>[_<dienst>]_tarasevych_com_<gebruiker|beheer>` (always `<= 64` characters).
  - Tools ending in `_gebruiker` operate in the user's **private space**.
  - Tools ending in `_beheer` operate in the **technical space** (visible and callable only while the owner's technical profile is active and delegated).

## CLI Commands (`<path/to/this/skill>/scripts/mijn-ruimte`)

Always invoke the bundled CLI script using `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte <Command> [flags]`:

### 1. Configure & Test Connection
```bash
# Save endpoint & configure ~/.gemini/settings.json for Antigravity
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/antigravity [--token <BEARER_TOKEN>]

# Check live RFC 9728 PRM metadata, MCP session status, and visible tools per channel
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Status

# List all granted tools (optionally filtered by --groep or --kant gebruiker|beheer)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Lijst [--kant gebruiker|beheer]
```

### 2. Bidirectional Site & Multi-Agent Coordination (`orch_*`)
```bash
# Fetch live multi-agent orchestration overview from the site
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchOverzicht

# Fetch compact rules context (CONTEXT-COMPACT.md + lock hash)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchContext

# Register a new task in orchestration via MCP
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchTaakStart --id AGPLUGIN-002 --samenvatting "Опис задачі"
```

### 3. Bidirectional Browser Control (`browser_*`)
```bash
# List open tabs in the unlocked browser slot
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserTabs [--kant gebruiker|beheer]

# Open a URL in the browser slot
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserOpen --doelUrl https://tarasevych.com [--kant gebruiker]

# Capture DOM snapshot of the active tab
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSnapshot [--kant gebruiker]

# Click or type in the active tab
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserKlik --selector "button[data-agent-terug]"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserTyp --selector "input[name=q]" --tekst "Antigravity"

# Take a screenshot or run deep Chrome Debugger diagnostics (_beheer)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSchermafdruk [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserDiagnose
```

### 4. Bidirectional Local PC Control (`machine_*`)
```bash
# System status (CPU, RAM, OS, uptime) of paired PC
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcStatus [--kant gebruiker]

# List or read files in allowed roots on the PC
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcBestanden --pad . [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcLees --pad README.md [--kant gebruiker]

# Write a file or run an allowlisted command on the PC
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcSchrijf --pad notes.txt --inhoud "Тест"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcOpdracht --opdracht "git status"

# Inspect Docker containers on the PC or server
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcDocker [--kant gebruiker|beheer]
```

### 5. Bidirectional Server & Release Administration (`_beheer`)
```bash
# Check server health, services, and database status
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerGezondheid

# Check deployment status and service logs
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerUitrolStatus
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerLogs --dienst hub --regels 100

# Run a read-only SQL query or tail the audit log
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerSql --query "SELECT count(*) FROM app.mcp_oauth_tokens WHERE agent = 'antigravity'"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerAudit --limiet 25
```

### 6. Generic Tool Call & Stdio MCP Bridge
```bash
# Call any v2 tool directly by name or short id
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte RoepAan --hulpmiddel <tool_name> --args '{"key":"value"}'

# Run as a standard MCP stdio server bridging to https://mcp.tarasevych.com/antigravity
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte McpStdio
```

## Safety & Governance Rules
- **Pending Approvals**: When a write/action tool returns `status: "pending"`, the site is waiting for the user's click in `BevestigingenPaneel` at `https://mcp.tarasevych.com/agenten#agent/antigravity`. Inform the user and do not retry in a loop.
- **Technical Space (`_beheer`)**: If a `_beheer` tool returns `TECH_PROFILE_OFF`, ask the owner to enable or delegate the technical session on `https://mcp.tarasevych.com/agenten#agent/antigravity`.
- **Repository Rules**: Always follow `AGENTS.md` and `ANTIGRAVITY.md` when modifying code in `Tarasevych/hub`.
