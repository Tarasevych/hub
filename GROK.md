> 🌐 **Мова:** **Українська** · [Nederlands](GROK.nl.md) | [Головна](README.md) · [Покажчик документації](docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

<!-- orch-adapter -->
# Перехідник для Grok (MCP-з'єднувач, ZIP/TAR.GZ) · Adapter voor Grok (MCP-з'єднувач, ZIP/TAR.GZ)

Цей файл — лише вказівник. Усі правила — в **AGENTS.md** (канонічне джерело) і `orchestratie/beleid.json`. Тут нічого не додається й не скасовується.
Dit bestand is alleen een verwijzing. Alle regels staan in **AGENTS.md** en `orchestratie/beleid.json`.

1. Прочитай AGENTS.md повністю (без доступу до репозиторію — `orchestratie/CONTEXT-COMPACT.md`).
2. Ідентифікатор агента для Task ID, пакетів і `AGENT`: `grok`.
3. Перед початком: `node scripts/orch.mjs controleer` і `versheid --taak <ID> --fase start`. Перед передаванням: `versheid --fase overdracht` + `ORCH-OVERDRACHT.json`.
4. Мова відповідей і звітів — українська; коментарі в коді — українська/нідерландська; UI — українська/нідерландська.
5. Жодних змін у production, `voornaamst`, `integratie`, `release/*`, чужих гілках чи резервних копіях без явного погодження власника.
