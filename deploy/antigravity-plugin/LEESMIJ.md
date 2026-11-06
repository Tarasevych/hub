# Плагін і двосторонній конектор Google Antigravity (`mijn-ruimte`)

Офіційний пакет інтеграції **Google Antigravity** із платформою **Mijn Ruimte** (`*.tarasevych.com`).

## 1. Власна адреса конектора v2

- **MCP (Streamable HTTP + SSE)**: `https://mcp.tarasevych.com/antigravity`
- **OAuth Protected Resource Metadata (RFC 9728)**: `https://mcp.tarasevych.com/.well-known/oauth-protected-resource/antigravity`
- **Веб-інтерфейс керування**: `https://mcp.tarasevych.com/agenten#agent/antigravity`

## 2. Чотири двосторонні канали керування

1. **Сайт і координація (`site` / `orch_*`)** — створення та оновлення сайту, робота з поштою, календарем, хмарними файлами, дошкою, GitHub та мультиагентною оркестрацією (`orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_*`).
2. **Браузер (`browser_*`)** — керування вкладками через розширення **Mijn Ruimte** у приватному (`_gebruiker`) та технічному (`_beheer`) слотах (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_screenshot`, `browser_get_deep_diagnostics`, `browser_script`).
3. **Локальний ПК / Комп'ютер (`pc` через `deploy/agent/agent.mjs`)** — двосторонній міст із ПК власника (`machine_status`, `machine_processes`, `machine_list_dir`, `machine_read_file`, `machine_write_file`, `machine_exec`, `machine_docker`).
4. **Сервер і випуски (`_beheer`)** — стан служб (`server_health`), випуски (`deploy_status`, `deploy_logs`, `deploy_release`), безпечні запити `SELECT` (`db_query_readonly`) і журнал аудиту (`audit_tail`).

## 3. Швидкий старт у Google Antigravity

```bash
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/antigravity
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Status
```
