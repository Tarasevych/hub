-- SEC-002 (integraties-08, afwerking A): status «inkomend» (Вхідні / Inkomend) voor kaarten die van buiten komen (issues van derden via
-- de GitHub-webhook). Zo'n kaart staat niet meer tussen de eigen taken (backlog), maar in een eigen kolom tot de mens haar beoordeelt.
-- Статус «inkomend» для карток, що надходять ззовні (issue від сторонніх людей через вебхук GitHub): окрема колонка «Вхідні».
-- Alleen de CHECK wordt verruimd; bestaande rijen veranderen niet. Opnieuw draaien is veilig.
ALTER TABLE app.mcp_console_items DROP CONSTRAINT IF EXISTS mcp_console_items_status_check;
ALTER TABLE app.mcp_console_items ADD CONSTRAINT mcp_console_items_status_check
  CHECK (status IS NULL OR status IN ('inkomend', 'backlog', 'doing', 'blocked', 'done'));
