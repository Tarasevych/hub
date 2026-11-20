> 🌐 **Мова:** **Українська** · [Nederlands](CHATGPT.nl.md) | [Головна](README.md) · [Покажчик документації](docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

<!-- orch-adapter -->
# Перехідник для ChatGPT (вебзастосунок, mcp.tarasevych.com/gpt та пакунки передачі) · Adapter voor ChatGPT (webtoepassing, mcp.tarasevych.com/gpt en overdrachtspakketten)

Цей файл — лише вказівник. Усі правила — в **AGENTS.md** (канонічне джерело) і `orchestratie/beleid.json`. Тут нічого не додається й не скасовується.
Dit bestand is alleen een verwijzing. Alle regels staan in **AGENTS.md** (`AGENTENREGELS.nl.md`) en `orchestratie/beleid.json`.

1. Прочитай **AGENTS.md** повністю (без доступу до сховища — `orchestratie/CONTEXT-COMPACT.md`); власна адреса з'єднувача MCP: `https://mcp.tarasevych.com/gpt`.
2. Ідентифікатор агента для кодів завдань, пакунків випуску й поля `AGENT`: `chatgpt`.
3. Перший крок сеансу: `node scripts/orch.mjs begin --agent chatgpt` — правила, навички (зокрема `klimop-architectuur`), досьє функції та паралельні задачі (AGENTS.md §9). Перед початком: `controleer` і `versheid --taak <ID> --fase start`. Перед передаванням: запис авторства `orch bijdrage`, `versheid --fase overdracht` + `ORCH-OVERDRACHT.json`.
4. **Цільова архітектура «Плющ» (`KLIMOP-001`, AGENTS.md §3б, §10, `docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`):** маніфест є цільовою концепцією і НЕ дозволяє негайно змінювати робочу інфраструктуру чи вимикати чинні сервери й PostgreSQL; кожну зміну перевіряй за 15 питаннями архітектурної перевірки (§10.4) та без заборонених спрощень (§10.5).
5. Мови (Абсолютний мовний закон): спілкування та звіти — виключно чистою українською (`uk`); коментарі, інтерфейс і документація — українською (`uk`) та нідерландською (`nl`) без русизмів, суржику й техно-сленгу.
6. Жодних змін у робочому середовищі, гілках `voornaamst`, `integratie`, `release/*`, чужих гілках чи резервних копіях без явного погодження власника.
