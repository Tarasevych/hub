> 🌐 **Мова:** **Українська** · [Nederlands](CURSOR.nl.md) | [Головна](README.md) · [Покажчик документації](docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

<!-- orch-adapter -->
# Перехідник для Cursor (.cursorrules та з’єднувач MCP mcp.tarasevych.com/cursor) · Adapter voor Cursor (.cursorrules en MCP-verbinder mcp.tarasevych.com/cursor)

Цей файл і `.cursorrules` — лише вказівники. Усі правила — в **AGENTS.md** (канонічне джерело) і `orchestratie/beleid.json`. Тут нічого не додається й не скасовується.
Dit bestand en `.cursorrules` zijn alleen verwijzingen. Alle regels staan in **AGENTS.md** (`AGENTENREGELS.nl.md`) en `orchestratie/beleid.json`.

1. Прочитай **AGENTS.md** повністю (без доступу до сховища — `orchestratie/CONTEXT-COMPACT.md`); власна адреса з’єднувача MCP: `https://mcp.tarasevych.com/cursor`.
2. Ідентифікатор агента для кодів завдань, пакунків випуску й поля `AGENT`: `cursor`.
3. Перший крок сеансу: `node scripts/orch.mjs begin --agent cursor` — правила, навички (зокрема `klimop-architectuur`), досьє функції та паралельні задачі (AGENTS.md §9). Перед початком: `controleer` і `versheid --taak <ID> --fase start`. Перед передаванням: `orch bijdrage`, `versheid --fase overdracht` + `ORCH-OVERDRACHT.json`.
4. **Цільова архітектура «Плющ» (`KLIMOP-001`, AGENTS.md §3б, §10, `docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`):** маніфест НЕ є дозволом на негайну зміну робочої інфраструктури; кожну зміну перевіряй за 15 питаннями архітектурної перевірки (§10.4) без заборонених спрощень (§10.5).
5. Мови (Абсолютний мовний закон): відповіді та звіти — чистою українською (`uk`); коментарі, інтерфейс і документація — українською (`uk`) та нідерландською (`nl`) без русизмів, суржику й техно-сленгу. Повний канонічний текст закону й таблиця питомих відповідників: спільна навичка [`.agents/skills/movnyi-zakon/SKILL.md`](.agents/skills/movnyi-zakon/SKILL.md) (`mr://skills/movnyi-zakon`).
6. Жодних змін у робочому середовищі, гілках `voornaamst`, `integratie`, `release/*`, чужих гілках чи резервних копіях без явного погодження власника.
