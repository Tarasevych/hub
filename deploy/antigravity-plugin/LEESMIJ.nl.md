> 🌐 **Taal / Мова:** [Українська](ОГЛЯД-РОЗШИРЕННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../../docs/INDEX.nl.md)

> 🇳🇱 **Nederlandse versie** · 🇺🇦 [Українська (канонічна)](ОГЛЯД-РОЗШИРЕННЯ.uk.md)

# Plug-in en tweerichtingsconnector van Google Antigravity (`mijn-ruimte`)

Officieel integratiepakket van **Google Antigravity** met het **Mijn Ruimte**-platform (`*.tarasevych.com`).

## 1. Eigen adres van connector v2

- **MCP (streamable HTTP en server-sent events)**: `https://mcp.tarasevych.com/antigravity`
- **OAuth-metadata voor beveiligde bronnen (RFC 9728)**: `https://mcp.tarasevych.com/.well-known/oauth-protected-resource/antigravity`
- **Webbeheerinterface**: `https://mcp.tarasevych.com/agenten#agent/antigravity`

## 2. Vier tweerichtingskanalen voor beheer

1. **Site en coördinatie (`site` / `orch_*`)** — de site bouwen en bijwerken, werken met e-mail, agenda, cloudbestanden, taakbord, GitHub en multi-agentorkestratie (`orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_*`).
2. **Browser (`browser_*`)** — tabbladen aansturen via de **Mijn Ruimte**-extensie in het privé- (`_gebruiker`) en technische (`_beheer`) slot (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_screenshot`, `browser_get_deep_diagnostics`, `browser_script`).
3. **Lokale pc / computer (`pc` via `deploy/agent/agent.mjs`)** — tweerichtingsbrug met de pc van de eigenaar (`machine_status`, `machine_processes`, `machine_list_dir`, `machine_read_file`, `machine_write_file`, `machine_exec`, `machine_docker`).
4. **Server en uitgaven (`_beheer`)** — status van diensten (`server_health`), uitgaven (`deploy_status`, `deploy_logs`, `deploy_release`), veilige leesopdrachten (`db_query_readonly`) en auditlogboek (`audit_tail`).

## 3. Snelstart in Google Antigravity

```bash
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/antigravity
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Status
```
