> 🌐 **Мова / Taal:** **🇺🇦 Українська (поточна)** ([`INDEX.md`](./INDEX.md) · [`INDEX.uk.md`](./INDEX.uk.md)) · [🇳🇱 **Nederlandse versie (`INDEX.nl.md`)**](./INDEX.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md)

# 📚 Повний двомовний каталог документації проєкту «Мій простір · Mijn Ruimte» (`Tarasevych/hub`)

Усі статті, специфікації, журнали змін (wijzigingen), інструкції розгортання (runbooks) та архітектурні документи репозиторію представлені у **двох мовних версіях** — **українській (`🇺🇦 .uk.md`)** та **нідерландській (`🇳🇱 .nl.md`)** із взаємними перехресними посиланнями у верхній навігаційній панелі кожної сторінки.

---

## Зміст каталогу

1. [Головні та тематичні сторінки Хабу (Кореневі документи та `docs/hub/`)](#1-головні-та-тематичні-сторінки-хабу-кореневі-документи-та-docshub)
2. [Правила координації ШІ-агентів (`ORCH-001` та `orchestratie/`)](#2-правила-координації-ші-агентів-orch-001-та-orchestratie)
3. [Розгортання, безпека сервера, конектори та Runbooks (`deploy/`)](#3-розгортання-безпека-сервера-конектори-та-runbooks-deploy)
4. [Журнали змін випусків (`deploy/WIJZIGINGEN-*.md`)](#4-журнали-змін-випусків-deploywijzigingen-md)
5. [Архітектура Хмари (`Cloud vNext M1–M11`), Пошти (`Mail`) та Ідентичності (`docs/cloud/`, `docs/mail/`, `docs/identity/`)](#5-архітектура-хмари-cloud-vnext-m1m11-пошти-mail-та-ідентичності-docscloud-docsmail-docsidentity)
6. [Проєктування просторів, Робочого столу, Пошуку `/zoek`, Інтеграцій та Безпеки (`docs/*`)](#6-проєктування-просторів-робочого-столу-пошуку-zoek-інтеграцій-та-безпеки-docs)

---

## 1. Головні та тематичні сторінки Хабу (Кореневі документи та `docs/hub/`)

| Стаття / Сторінка | Опис | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія | Оригінал |
|---|---|---|---|---|
| **Головна сторінка проєкту** | Повний огляд платформи, архітектури, історії, 71 гілки, 27 PR, 18 релізів та змінних середовища | [🇺🇦 `README.uk.md`](../README.uk.md) | [🇳🇱 `LEESMIJ.md`](../LEESMIJ.md) · [`README.nl.md`](../README.nl.md) | [`README.md`](../README.md) |
| **Повний каталог статей** | Цей зведений індекс усіх 140+ документів репозиторію | [🇺🇦 `INDEX.uk.md`](./INDEX.uk.md) | [🇳🇱 `INDEX.nl.md`](./INDEX.nl.md) | [`INDEX.md`](./INDEX.md) |
| **1. Архітектура та 11 піддоменів** | Детальний опис 11 сервісів `*.tarasevych.com`, маршрутизації, сесій, ролей та сховища | [🇺🇦 `ARCHITECTUUR.uk.md`](./hub/ARCHITECTUUR.uk.md) | [🇳🇱 `ARCHITECTUUR.nl.md`](./hub/ARCHITECTUUR.nl.md) | [`ARCHITECTUUR.md`](./hub/ARCHITECTUUR.md) |
| **2. Історія розвитку проєкту** | Хронологія Етапів I–VI: від AppDeploy і Фаз 1–3 до `ORCH-001`, `INTEG-001`, `TRACE-001`, `B-009` | [🇺🇦 `GESCHIEDENIS.uk.md`](./hub/GESCHIEDENIS.uk.md) | [🇳🇱 `GESCHIEDENIS.nl.md`](./hub/GESCHIEDENIS.nl.md) | [`GESCHIEDENIS.md`](./hub/GESCHIEDENIS.md) |
| **3. Гілки (71), PR (#1–#27) та Релізи** | Класифікований путівник по всіх 71 гілці GitHub, Pull Requests та випусках | [🇺🇦 `TAKKEN-EN-PRS.uk.md`](./hub/TAKKEN-EN-PRS.uk.md) | [🇳🇱 `TAKKEN-EN-PRS.nl.md`](./hub/TAKKEN-EN-PRS.nl.md) | [`TAKKEN-EN-PRS.md`](./hub/TAKKEN-EN-PRS.md) |
| **4. Структура репозиторію та карта коду** | Дерево директорій `server/`, `backend/`, `src/`, `shared/`, `migrations/`, `deploy/` | [🇺🇦 `MAP-STRUCTUUR.uk.md`](./hub/MAP-STRUCTUUR.uk.md) | [🇳🇱 `MAP-STRUCTUUR.nl.md`](./hub/MAP-STRUCTUUR.nl.md) | [`MAP-STRUCTUUR.md`](./hub/MAP-STRUCTUUR.md) |
| **5. Змінні середовища (Огляд Хабу)** | Систематизований довідник змінних середовища, секретів та інтеграцій | [🇺🇦 `OMGEVINGSVARIABELEN.uk.md`](./hub/OMGEVINGSVARIABELEN.uk.md) | [🇳🇱 `OMGEVINGSVARIABELEN.nl.md`](./hub/OMGEVINGSVARIABELEN.nl.md) | [`OMGEVINGSVARIABELEN.md`](./hub/OMGEVINGSVARIABELEN.md) |
| **6. Оркестрація та Розгортання** | Протокол `ORCH-001`, телеметрія `TRACE-001`, стек `B-009` (`Ubuntu 26.04.1 LTS`) та cron | [🇺🇦 `ORCHESTRATIE-EN-UITROL.uk.md`](./hub/ORCHESTRATIE-EN-UITROL.uk.md) | [🇳🇱 `ORCHESTRATIE-EN-UITROL.nl.md`](./hub/ORCHESTRATIE-EN-UITROL.nl.md) | [`ORCHESTRATIE-EN-UITROL.md`](./hub/ORCHESTRATIE-EN-UITROL.md) |
| **Змінні середовища (`ENV-VARS`)** | Повний реєстр змінних `/etc/mijn-ruimte/geheimen.env` та `migratie.env` | [🇺🇦 `ENV-VARS.uk.md`](../ENV-VARS.uk.md) | [🇳🇱 `ENV-VARS.nl.md`](../ENV-VARS.nl.md) | [`ENV-VARS.md`](../ENV-VARS.md) |
| **Нотатки з безпеки (`SECURITY-NOTES`)** | Звіт аудиту безпеки, виправлення фаз A/B/1/2/3/Audit/Zoek/Werkblad | [🇺🇦 `SECURITY-NOTES.uk.md`](../SECURITY-NOTES.uk.md) | [🇳🇱 `SECURITY-NOTES.nl.md`](../SECURITY-NOTES.nl.md) | [`SECURITY-NOTES.md`](../SECURITY-NOTES.md) |
| **План портування (`PORTEERPLAN`)** | Архітектурний план переходу з AppDeploy на власний сервер (BYOS) | [🇺🇦 `PORTEERPLAN.uk.md`](../PORTEERPLAN.uk.md) | [🇳🇱 `PORTEERPLAN.nl.md`](../PORTEERPLAN.nl.md) | [`PORTEERPLAN.md`](../PORTEERPLAN.md) |
| **Cloud M7 Security DevKit (`README-M7`)** | Набір розробки криптографічного захисту власника даних M7 | [🇺🇦 `README-M7.uk.md`](../README-M7.uk.md) | [🇳🇱 `README-M7.nl.md`](../README-M7.nl.md) | [`README-M7-UK.md`](../README-M7-UK.md) |

---

## 2. Правила координації ШІ-агентів (`ORCH-001` та `orchestratie/`)

| Стаття / Сторінка | Опис | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія | Канонічний файл (підписаний `regels.lock.json`) |
|---|---|---|---|---|
| **Правила агентів (`AGENTS.md`)** | Єдине джерело правил для всіх 8 ШІ-агентів (`ORCH-001`, `TRACE-001`, `B-009`) | [🇺🇦 `AGENTS.uk.md`](../AGENTS.uk.md) | [🇳🇱 `AGENTS.nl.md`](../AGENTS.nl.md) | [`AGENTS.md`](../AGENTS.md) *(двомовний канон)* |
| **Реєстр рішень (`BESLUITEN.md`)** | Append-only журнал архітектурних і організаційних рішень `B-001`–`B-011` | [🇺🇦 `BESLUITEN.uk.md`](../orchestratie/BESLUITEN.uk.md) | [🇳🇱 `BESLUITEN.nl.md`](../orchestratie/BESLUITEN.nl.md) | [`orchestratie/BESLUITEN.md`](../orchestratie/BESLUITEN.md) |
| **Компактний контекст (`CONTEXT-COMPACT.md`)** | Автогенерований двомовний контекст для агентів без прямого доступу до GitHub | [🇺🇦/🇳🇱 `CONTEXT-COMPACT.md`](../orchestratie/CONTEXT-COMPACT.md) | [🇳🇱/🇺🇦 `CONTEXT-COMPACT.md`](../orchestratie/CONTEXT-COMPACT.md) | [`orchestratie/CONTEXT-COMPACT.md`](../orchestratie/CONTEXT-COMPACT.md) |

---

## 3. Розгортання, безпека сервера, конектори та Runbooks (`deploy/`)

| Стаття / Сторінка | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія | Оригінал |
|---|---|---|---|
| **Огляд файлів розгортання (`deploy/LEESMIJ`)** | [🇺🇦 `LEESMIJ.uk.md`](../deploy/LEESMIJ.uk.md) | [🇳🇱 `LEESMIJ.nl.md`](../deploy/LEESMIJ.nl.md) | [`deploy/LEESMIJ.md`](../deploy/LEESMIJ.md) |
| **Правила пакета оновлення (`REGELS-UITROLPAKKET`)** | [🇺🇦 `REGELS-UITROLPAKKET.uk.md`](../deploy/REGELS-UITROLPAKKET.uk.md) | [🇳🇱 `REGELS-UITROLPAKKET.nl.md`](../deploy/REGELS-UITROLPAKKET.nl.md) | [`deploy/REGELS-UITROLPAKKET.md`](../deploy/REGELS-UITROLPAKKET.md) |
| **Runbook: Безпечне розгортання без шляху до root (`RUNBOOK-VEILIGE-UITROL`)** | [🇺🇦 `RUNBOOK-VEILIGE-UITROL.uk.md`](../deploy/RUNBOOK-VEILIGE-UITROL.uk.md) | [🇳🇱 `RUNBOOK-VEILIGE-UITROL.nl.md`](../deploy/RUNBOOK-VEILIGE-UITROL.nl.md) | [`deploy/RUNBOOK-VEILIGE-UITROL.md`](../deploy/RUNBOOK-VEILIGE-UITROL.md) |
| **Відновлення після втрати ВМ (`HERSTEL`)** | [🇺🇦 `HERSTEL.uk.md`](../deploy/HERSTEL.uk.md) | [🇳🇱 `HERSTEL.nl.md`](../deploy/HERSTEL.nl.md) | [`deploy/HERSTEL.md`](../deploy/HERSTEL.md) |
| **Повна копія та відновлення (`VOLLEDIGA-KOPIYA-VIDNOVLENNYA`)** | [🇺🇦 `VOLLEDIGA-KOPIYA-VIDNOVLENNYA.uk.md`](../deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.uk.md) | [🇳🇱 `VOLLEDIGA-KOPIYA-VIDNOVLENNYA.nl.md`](../deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.nl.md) | [`deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.md`](../deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.md) |
| **Реєстр секретів (`GEHEIMEN-REGISTER`)** | [🇺🇦 `GEHEIMEN-REGISTER.uk.md`](../deploy/GEHEIMEN-REGISTER.uk.md) | [🇳🇱 `GEHEIMEN-REGISTER.nl.md`](../deploy/GEHEIMEN-REGISTER.nl.md) | [`deploy/GEHEIMEN-REGISTER.md`](../deploy/GEHEIMEN-REGISTER.md) |
| **Ключі й шифрування (`KLYUCHI-I-SHYFRUVANNYA`)** | [🇺🇦 `KLYUCHI-I-SHYFRUVANNYA.uk.md`](../deploy/KLYUCHI-I-SHYFRUVANNYA.uk.md) | [🇳🇱 `KLYUCHI-I-SHYFRUVANNYA.nl.md`](../deploy/KLYUCHI-I-SHYFRUVANNYA.nl.md) | [`deploy/KLYUCHI-I-SHYFRUVANNYA.md`](../deploy/KLYUCHI-I-SHYFRUVANNYA.md) |
| **Аудит поверхні управління (`AUDIT-BEHEER-OPPERVLAK`)** | [🇺🇦 `AUDIT-BEHEER-OPPERVLAK.uk.md`](../deploy/AUDIT-BEHEER-OPPERVLAK.uk.md) | [🇳🇱 `AUDIT-BEHEER-OPPERVLAK.nl.md`](../deploy/AUDIT-BEHEER-OPPERVLAK.nl.md) | [`deploy/AUDIT-BEHEER-OPPERVLAK.md`](../deploy/AUDIT-BEHEER-OPPERVLAK.md) |
| **Адмін-права лише в техпрофілі (`BEHEER-ALLEEN-TECH`)** | [🇺🇦 `BEHEER-ALLEEN-TECH.uk.md`](../deploy/BEHEER-ALLEEN-TECH.uk.md) | [🇳🇱 `BEHEER-ALLEEN-TECH.nl.md`](../deploy/BEHEER-ALLEEN-TECH.nl.md) | [`deploy/BEHEER-ALLEEN-TECH.md`](../deploy/BEHEER-ALLEEN-TECH.md) |
| **Розширення браузера (`BROWSER-EXTENSIE`)** | [🇺🇦 `BROWSER-EXTENSIE.uk.md`](../deploy/BROWSER-EXTENSIE.uk.md) | [🇳🇱 `BROWSER-EXTENSIE.nl.md`](../deploy/BROWSER-EXTENSIE.nl.md) | [`deploy/BROWSER-EXTENSIE.md`](../deploy/BROWSER-EXTENSIE.md) |
| **Публікація у Chrome Web Store (`CHROME-WEB-STORE`)** | [🇺🇦 `CHROME-WEB-STORE.uk.md`](../deploy/CHROME-WEB-STORE.uk.md) | [🇳🇱 `CHROME-WEB-STORE.nl.md`](../deploy/CHROME-WEB-STORE.nl.md) | [`deploy/CHROME-WEB-STORE.md`](../deploy/CHROME-WEB-STORE.md) |
| **Оновлення розширення (`EXTENSIE-BIJWERKEN`)** | [🇺🇦 `EXTENSIE-BIJWERKEN.uk.md`](../deploy/EXTENSIE-BIJWERKEN.uk.md) | [🇳🇱 `EXTENSIE-BIJWERKEN.nl.md`](../deploy/EXTENSIE-BIJWERKEN.nl.md) | [`deploy/EXTENSIE-BIJWERKEN.md`](../deploy/EXTENSIE-BIJWERKEN.md) |
| **Постійне встановлення розширення (`EXTENSIE-VAST-INSTALLEREN`)** | [🇺🇦 `EXTENSIE-VAST-INSTALLEREN.uk.md`](../deploy/EXTENSIE-VAST-INSTALLEREN.uk.md) | [🇳🇱 `EXTENSIE-VAST-INSTALLEREN.nl.md`](../deploy/EXTENSIE-VAST-INSTALLEREN.nl.md) | [`deploy/EXTENSIE-VAST-INSTALLEREN.md`](../deploy/EXTENSIE-VAST-INSTALLEREN.md) |
| **План розширення браузера (`PLAN-BROWSER-EXTENSIE`)** | [🇺🇦 `PLAN-BROWSER-EXTENSIE.uk.md`](../deploy/PLAN-BROWSER-EXTENSIE.uk.md) | [🇳🇱 `PLAN-BROWSER-EXTENSIE.nl.md`](../deploy/PLAN-BROWSER-EXTENSIE.nl.md) | [`deploy/PLAN-BROWSER-EXTENSIE.md`](../deploy/PLAN-BROWSER-EXTENSIE.md) |
| **Єдина адреса конектора на ШІ (`CONNECTOR-EEN-PAD`)** | [🇺🇦 `CONNECTOR-EEN-PAD.uk.md`](../deploy/CONNECTOR-EEN-PAD.uk.md) | [🇳🇱 `CONNECTOR-EEN-PAD.nl.md`](../deploy/CONNECTOR-EEN-PAD.nl.md) | [`deploy/CONNECTOR-EEN-PAD.md`](../deploy/CONNECTOR-EEN-PAD.md) |
| **Конектори ШІ v2 (`CONNECTOR-V2`)** | [🇺🇦 `CONNECTOR-V2.uk.md`](../deploy/CONNECTOR-V2.uk.md) | [🇳🇱 `CONNECTOR-V2.nl.md`](../deploy/CONNECTOR-V2.nl.md) | [`deploy/CONNECTOR-V2.md`](../deploy/CONNECTOR-V2.md) |
| **MCP-конектор для Claude (`MCP-CONNECTOR`)** | [🇺🇦 `MCP-CONNECTOR.uk.md`](../deploy/MCP-CONNECTOR.uk.md) | [🇳🇱 `MCP-CONNECTOR.nl.md`](../deploy/MCP-CONNECTOR.nl.md) | [`deploy/MCP-CONNECTOR.md`](../deploy/MCP-CONNECTOR.md) |
| **Звіт D: Безпека облікового запису (`D-account-veiligheid`)** | [🇺🇦 `D-account-veiligheid.uk.md`](../deploy/D-account-veiligheid.uk.md) | [🇳🇱 `D-account-veiligheid.nl.md`](../deploy/D-account-veiligheid.nl.md) | [`deploy/D-account-veiligheid.md`](../deploy/D-account-veiligheid.md) |
| **Звіт G: Редактори (`G-editors`)** | [🇺🇦 `G-editors.uk.md`](../deploy/G-editors.uk.md) | [🇳🇱 `G-editors.nl.md`](../deploy/G-editors.nl.md) | [`deploy/G-editors.md`](../deploy/G-editors.md) |
| **Аудит поштового клієнта (`MAIL-AUDIT-20261007`)** | [🇺🇦 `MAIL-AUDIT-20261007.uk.md`](../deploy/MAIL-AUDIT-20261007.uk.md) | [🇳🇱 `MAIL-AUDIT-20261007.nl.md`](../deploy/MAIL-AUDIT-20261007.nl.md) | [`deploy/MAIL-AUDIT-20261007.md`](../deploy/MAIL-AUDIT-20261007.md) |
| **Push-синхронізація Gmail Pub/Sub (`MAIL-PUSH-PUBSUB`)** | [🇺🇦 `MAIL-PUSH-PUBSUB.uk.md`](../deploy/MAIL-PUSH-PUBSUB.uk.md) | [🇳🇱 `MAIL-PUSH-PUBSUB.nl.md`](../deploy/MAIL-PUSH-PUBSUB.nl.md) | [`deploy/MAIL-PUSH-PUBSUB.md`](../deploy/MAIL-PUSH-PUBSUB.md) |
| **Release-notities: Технічні простори v2 (`RELEASE-NOTITIES-TECH-RUIMTES-V2`)** | [🇺🇦 `RELEASE-NOTITIES-TECH-RUIMTES-V2.uk.md`](../deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.uk.md) | [🇳🇱 `RELEASE-NOTITIES-TECH-RUIMTES-V2.nl.md`](../deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.nl.md) | [`deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.md`](../deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.md) |
| **Release-notities: Werkblad v3 (`RELEASE-NOTITIES-WERKBLAD-V3`)** | [🇺🇦 `RELEASE-NOTITIES-WERKBLAD-V3.uk.md`](../deploy/RELEASE-NOTITIES-WERKBLAD-V3.uk.md) | [🇳🇱 `RELEASE-NOTITIES-WERKBLAD-V3.nl.md`](../deploy/RELEASE-NOTITIES-WERKBLAD-V3.nl.md) | [`deploy/RELEASE-NOTITIES-WERKBLAD-V3.md`](../deploy/RELEASE-NOTITIES-WERKBLAD-V3.md) |
| **Перевірка RLS (`RLS-PROEF-20261026`)** | [🇺🇦 `RLS-PROEF-20261026.uk.md`](../deploy/RLS-PROEF-20261026.uk.md) | [🇳🇱 `RLS-PROEF-20261026.nl.md`](../deploy/RLS-PROEF-20261026.nl.md) | [`deploy/RLS-PROEF-20261026.md`](../deploy/RLS-PROEF-20261026.md) |
| **Runbook: Безпечні агенти 0.4 (`RUNBOOK-AGENTEN-0.4`)** | [🇺🇦 `RUNBOOK-AGENTEN-0.4.uk.md`](../deploy/RUNBOOK-AGENTEN-0.4.uk.md) | [🇳🇱 `RUNBOOK-AGENTEN-0.4.nl.md`](../deploy/RUNBOOK-AGENTEN-0.4.nl.md) | [`deploy/RUNBOOK-AGENTEN-0.4.md`](../deploy/RUNBOOK-AGENTEN-0.4.md) |
| **Runbook: Local Machine Connector (`RUNBOOK-AGENTS`)** | [🇺🇦 `RUNBOOK-AGENTS.uk.md`](../deploy/RUNBOOK-AGENTS.uk.md) | [🇳🇱 `RUNBOOK-AGENTS.nl.md`](../deploy/RUNBOOK-AGENTS.nl.md) | [`deploy/RUNBOOK-AGENTS.md`](../deploy/RUNBOOK-AGENTS.md) |
| **Runbook: Виправлення аудиту (`RUNBOOK-AUDIT-FIXES`)** | [🇺🇦 `RUNBOOK-AUDIT-FIXES.uk.md`](../deploy/RUNBOOK-AUDIT-FIXES.uk.md) | [🇳🇱 `RUNBOOK-AUDIT-FIXES.nl.md`](../deploy/RUNBOOK-AUDIT-FIXES.nl.md) | [`deploy/RUNBOOK-AUDIT-FIXES.md`](../deploy/RUNBOOK-AUDIT-FIXES.md) |
| **Runbook: Безпека фази 2 + 3 (`RUNBOOK-FASE-2-3`)** | [🇺🇦 `RUNBOOK-FASE-2-3.uk.md`](../deploy/RUNBOOK-FASE-2-3.uk.md) | [🇳🇱 `RUNBOOK-FASE-2-3.nl.md`](../deploy/RUNBOOK-FASE-2-3.nl.md) | [`deploy/RUNBOOK-FASE-2-3.md`](../deploy/RUNBOOK-FASE-2-3.md) |
| **Runbook: Два простори UI (`RUNBOOK-TECH-RUIMTES-UI`)** | [🇺🇦 `RUNBOOK-TECH-RUIMTES-UI.uk.md`](../deploy/RUNBOOK-TECH-RUIMTES-UI.uk.md) | [🇳🇱 `RUNBOOK-TECH-RUIMTES-UI.nl.md`](../deploy/RUNBOOK-TECH-RUIMTES-UI.nl.md) | [`deploy/RUNBOOK-TECH-RUIMTES-UI.md`](../deploy/RUNBOOK-TECH-RUIMTES-UI.md) |
| **Runbook: Полотно Werkblad v3 (`RUNBOOK-WERKBLAD-V3-CANVAS`)** | [🇺🇦 `RUNBOOK-WERKBLAD-V3-CANVAS.uk.md`](../deploy/RUNBOOK-WERKBLAD-V3-CANVAS.uk.md) | [🇳🇱 `RUNBOOK-WERKBLAD-V3-CANVAS.nl.md`](../deploy/RUNBOOK-WERKBLAD-V3-CANVAS.nl.md) | [`deploy/RUNBOOK-WERKBLAD-V3-CANVAS.md`](../deploy/RUNBOOK-WERKBLAD-V3-CANVAS.md) |
| **Експорт журналу в SIEM (`SIEM`)** | [🇺🇦 `SIEM.uk.md`](../deploy/SIEM.uk.md) | [🇳🇱 `SIEM.nl.md`](../deploy/SIEM.nl.md) | [`deploy/SIEM.md`](../deploy/SIEM.md) |
| **SSH-сертифікати на 1 годину (`SSH-CA`)** | [🇺🇦 `SSH-CA.uk.md`](../deploy/SSH-CA.uk.md) | [🇳🇱 `SSH-CA.nl.md`](../deploy/SSH-CA.nl.md) | [`deploy/SSH-CA.md`](../deploy/SSH-CA.md) |
| **Статус впровадження (`STATUS-ROBOTA-20261007`)** | [🇺🇦 `STATUS-ROBOTA-20261007.uk.md`](../deploy/STATUS-ROBOTA-20261007.uk.md) | [🇳🇱 `STATUS-ROBOTA-20261007.nl.md`](../deploy/STATUS-ROBOTA-20261007.nl.md) | [`deploy/STATUS-ROBOTA-20261007.md`](../deploy/STATUS-ROBOTA-20261007.md) |
| **Локальний агент ПК (`deploy/agent/LEESMIJ`)** | [🇺🇦 `LEESMIJ.uk.md`](../deploy/agent/LEESMIJ.uk.md) | [🇳🇱 `LEESMIJ.nl.md`](../deploy/agent/LEESMIJ.nl.md) | [`deploy/agent/LEESMIJ.md`](../deploy/agent/LEESMIJ.md) |
| **PowerShell на Windows через Термінал (`WINDOWS-POWERSHELL`)** | [🇺🇦 `WINDOWS-POWERSHELL.uk.md`](../deploy/agent/WINDOWS-POWERSHELL.uk.md) | [🇳🇱 `WINDOWS-POWERSHELL.nl.md`](../deploy/agent/WINDOWS-POWERSHELL.nl.md) | [`deploy/agent/WINDOWS-POWERSHELL.md`](../deploy/agent/WINDOWS-POWERSHELL.md) |
| **Нативний хост розширення (`deploy/extensie-native/LEESMIJ`)** | [🇺🇦 `LEESMIJ.uk.md`](../deploy/extensie-native/LEESMIJ.uk.md) | [🇳🇱 `LEESMIJ.nl.md`](../deploy/extensie-native/LEESMIJ.nl.md) | [`deploy/extensie-native/LEESMIJ.md`](../deploy/extensie-native/LEESMIJ.md) |

---

## 4. Журнали змін випусків (`deploy/WIJZIGINGEN-*.md`)

| Стаття / Журнал змін | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія | Оригінал |
|---|---|---|---|
| **SSH-сертифікат (`WIJZIGINGEN-20261014-B-SSH`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261014-B-SSH.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261014-B-SSH.nl.md) | [`WIJZIGINGEN-20261014-B-SSH.md`](../deploy/WIJZIGINGEN-20261014-B-SSH.md) |
| **MCP після етапу B (`WIJZIGINGEN-20261014-MCP-NA-B`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261014-MCP-NA-B.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261014-MCP-NA-B.nl.md) | [`WIJZIGINGEN-20261014-MCP-NA-B.md`](../deploy/WIJZIGINGEN-20261014-MCP-NA-B.md) |
| **Злиття паралельних робіт (`WIJZIGINGEN-20261014-SAMENVOEGING`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261014-SAMENVOEGING.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261014-SAMENVOEGING.nl.md) | [`WIJZIGINGEN-20261014-SAMENVOEGING.md`](../deploy/WIJZIGINGEN-20261014-SAMENVOEGING.md) |
| **Конектори ШІ v2 (`WIJZIGINGEN-20261015-CONNECTOR-V2`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261015-CONNECTOR-V2.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261015-CONNECTOR-V2.nl.md) | [`WIJZIGINGEN-20261015-CONNECTOR-V2.md`](../deploy/WIJZIGINGEN-20261015-CONNECTOR-V2.md) |
| **Адмін-пакет: 15 пунктів (`WIJZIGINGEN-20261017-ADMIN-15-PUNTEN`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.nl.md) | [`WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.md`](../deploy/WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.md) |
| **Діагностика `/diagnostiek` (`WIJZIGINGEN-20261017-DIAGNOSTIEK`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-DIAGNOSTIEK.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-DIAGNOSTIEK.nl.md) | [`WIJZIGINGEN-20261017-DIAGNOSTIEK.md`](../deploy/WIJZIGINGEN-20261017-DIAGNOSTIEK.md) |
| **Інтеграції Admin (`WIJZIGINGEN-20261017-INTEGRATIES`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-INTEGRATIES.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-INTEGRATIES.nl.md) | [`WIJZIGINGEN-20261017-INTEGRATIES.md`](../deploy/WIJZIGINGEN-20261017-INTEGRATIES.md) |
| **Панель керування оновлень (`WIJZIGINGEN-20261017-UITROL-DASHBOARD`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-UITROL-DASHBOARD.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-UITROL-DASHBOARD.nl.md) | [`WIJZIGINGEN-20261017-UITROL-DASHBOARD.md`](../deploy/WIJZIGINGEN-20261017-UITROL-DASHBOARD.md) |
| **Відновлення оновлень (`WIJZIGINGEN-20261017-UITROL-HERSTEL`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-UITROL-HERSTEL.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-UITROL-HERSTEL.nl.md) | [`WIJZIGINGEN-20261017-UITROL-HERSTEL.md`](../deploy/WIJZIGINGEN-20261017-UITROL-HERSTEL.md) |
| **Майстер оновлень (`WIJZIGINGEN-20261017-UITROL-WIZARD`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-UITROL-WIZARD.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-UITROL-WIZARD.nl.md) | [`WIJZIGINGEN-20261017-UITROL-WIZARD.md`](../deploy/WIJZIGINGEN-20261017-UITROL-WIZARD.md) |
| **Виправлення аудиту 18.10 (`WIJZIGINGEN-20261018-AUDIT-FIXES`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261018-AUDIT-FIXES.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261018-AUDIT-FIXES.nl.md) | [`WIJZIGINGEN-20261018-AUDIT-FIXES.md`](../deploy/WIJZIGINGEN-20261018-AUDIT-FIXES.md) |
| **Зміни пошти 18.10 (`WIJZIGINGEN-20261018-MAIL`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261018-MAIL.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261018-MAIL.nl.md) | [`WIJZIGINGEN-20261018-MAIL.md`](../deploy/WIJZIGINGEN-20261018-MAIL.md) |
| **Завершення техпрофілю (`WIJZIGINGEN-20261018-TECH-AFRONDING`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.nl.md) | [`WIJZIGINGEN-20261018-TECH-AFRONDING.md`](../deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.md) |
| **Блок 1 швидких виправлень (`WIJZIGINGEN-20261026-BLOK1`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261026-BLOK1.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261026-BLOK1.nl.md) | [`WIJZIGINGEN-20261026-BLOK1.md`](../deploy/WIJZIGINGEN-20261026-BLOK1.md) |
| **Блоки 2, 3 і 6 (`WIJZIGINGEN-20261026-BLOK2-6`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261026-BLOK2-6.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261026-BLOK2-6.nl.md) | [`WIJZIGINGEN-20261026-BLOK2-6.md`](../deploy/WIJZIGINGEN-20261026-BLOK2-6.md) |
| **Розумний дім Huis vNext (`WIJZIGINGEN-20261028-HUIS-VNEXT`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261028-HUIS-VNEXT.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261028-HUIS-VNEXT.nl.md) | [`WIJZIGINGEN-20261028-HUIS-VNEXT.md`](../deploy/WIJZIGINGEN-20261028-HUIS-VNEXT.md) |
| **Нотатки Notities vNext (`WIJZIGINGEN-20261028-NOTITIES-VNEXT`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261028-NOTITIES-VNEXT.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261028-NOTITIES-VNEXT.nl.md) | [`WIJZIGINGEN-20261028-NOTITIES-VNEXT.md`](../deploy/WIJZIGINGEN-20261028-NOTITIES-VNEXT.md) |
| **Під'єднання календаря та пакет (`WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.nl.md) | [`WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.md`](../deploy/WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.md) |
| **Хмарний сервіс Cloud vNext (`WIJZIGINGEN-20261029-CLOUD-VNEXT`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261029-CLOUD-VNEXT.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261029-CLOUD-VNEXT.nl.md) | [`WIJZIGINGEN-20261029-CLOUD-VNEXT.md`](../deploy/WIJZIGINGEN-20261029-CLOUD-VNEXT.md) |
| **Способи входу UI-015 (`WIJZIGINGEN-20261030-AANMELD-UI015`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261030-AANMELD-UI015.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261030-AANMELD-UI015.nl.md) | [`WIJZIGINGEN-20261030-AANMELD-UI015.md`](../deploy/WIJZIGINGEN-20261030-AANMELD-UI015.md) |
| **Звірка та розвиток UI-014 (`WIJZIGINGEN-20261030-AFSTEMMING-UI014`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261030-AFSTEMMING-UI014.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261030-AFSTEMMING-UI014.nl.md) | [`WIJZIGINGEN-20261030-AFSTEMMING-UI014.md`](../deploy/WIJZIGINGEN-20261030-AFSTEMMING-UI014.md) |
| **Система координації ORCH-001 (`WIJZIGINGEN-20261031-ORCH-001`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261031-ORCH-001.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261031-ORCH-001.nl.md) | [`WIJZIGINGEN-20261031-ORCH-001.md`](../deploy/WIJZIGINGEN-20261031-ORCH-001.md) |
| **Поверхня меню (`WIJZIGINGEN-MENU-OPPERVLAK`)** | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-MENU-OPPERVLAK.uk.md) | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-MENU-OPPERVLAK.nl.md) | [`WIJZIGINGEN-MENU-OPPERVLAK.md`](../deploy/WIJZIGINGEN-MENU-OPPERVLAK.md) |

---

## 5. Архітектура Хмари (`Cloud vNext M1–M11`), Пошти (`Mail`) та Ідентичності (`docs/cloud/`, `docs/mail/`, `docs/identity/`)

| Стаття / Специфікація | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія | Оригінал |
|---|---|---|---|
| **Звіт реалізації Cloud M5 (`CLOUD-M5-IMPLEMENTATION-REPORT`)** | [🇺🇦 `.uk.md`](./CLOUD-M5-IMPLEMENTATION-REPORT.uk.md) | [🇳🇱 `.nl.md`](./CLOUD-M5-IMPLEMENTATION-REPORT.nl.md) | [`CLOUD-M5-IMPLEMENTATION-REPORT.md`](./CLOUD-M5-IMPLEMENTATION-REPORT.md) |
| **Архітектура приватності Cloud M7 (`CLOUD-M7-PRIVACY-ARCHITECTURE`)** | [🇺🇦 `.uk.md`](./CLOUD-M7-PRIVACY-ARCHITECTURE.uk.md) | [🇳🇱 `.nl.md`](./CLOUD-M7-PRIVACY-ARCHITECTURE.nl.md) | [`CLOUD-M7-PRIVACY-ARCHITECTURE.md`](./CLOUD-M7-PRIVACY-ARCHITECTURE.md) |
| **Реалізація Cloud M9 (`CLOUD-M9-IMPLEMENTATION-20261028`)** | [🇺🇦 `.uk.md`](./CLOUD-M9-IMPLEMENTATION-20261028.uk.md) | [🇳🇱 `.nl.md`](./CLOUD-M9-IMPLEMENTATION-20261028.nl.md) | [`CLOUD-M9-IMPLEMENTATION-20261028.md`](./CLOUD-M9-IMPLEMENTATION-20261028.md) |
| **Драйвери Cloud M5 (`README-M5`)** | [🇺🇦 `.uk.md`](./README-M5.uk.md) | [🇳🇱 `.nl.md`](./README-M5.nl.md) | [`README-M5.md`](./README-M5.md) |
| **Cloud Full Integration M1 (`CLOUD-FULL-INTEGRATION-M1`)** | [🇺🇦 `.uk.md`](./cloud/CLOUD-FULL-INTEGRATION-M1.uk.md) | [🇳🇱 `.nl.md`](./cloud/CLOUD-FULL-INTEGRATION-M1.nl.md) | [`CLOUD-FULL-INTEGRATION-M1.md`](./cloud/CLOUD-FULL-INTEGRATION-M1.md) |
| **Схема БД Хмари (`CLOUD_DATABASE_SCHEMA`)** | [🇺🇦 `.uk.md`](./cloud/CLOUD_DATABASE_SCHEMA.uk.md) | [🇳🇱 `.nl.md`](./cloud/CLOUD_DATABASE_SCHEMA.nl.md) | [`CLOUD_DATABASE_SCHEMA.md`](./cloud/CLOUD_DATABASE_SCHEMA.md) |
| **Провайдер Google Drive (`CLOUD_GOOGLE_DRIVE_PROVIDER`)** | [🇺🇦 `.uk.md`](./cloud/CLOUD_GOOGLE_DRIVE_PROVIDER.uk.md) | [🇳🇱 `.nl.md`](./cloud/CLOUD_GOOGLE_DRIVE_PROVIDER.nl.md) | [`CLOUD_GOOGLE_DRIVE_PROVIDER.md`](./cloud/CLOUD_GOOGLE_DRIVE_PROVIDER.md) |
| **Технічна специфікація Хмари (`CLOUD_IMPLEMENTATION_SPEC`)** | [🇺🇦 `.uk.md`](./cloud/CLOUD_IMPLEMENTATION_SPEC.uk.md) | [🇳🇱 `.nl.md`](./cloud/CLOUD_IMPLEMENTATION_SPEC.nl.md) | [`CLOUD_IMPLEMENTATION_SPEC.md`](./cloud/CLOUD_IMPLEMENTATION_SPEC.md) |
| **Архітектура платформи Хмари (`CLOUD_PLATFORM_ARCHITECTURE`)** | [🇺🇦 `.uk.md`](./cloud/CLOUD_PLATFORM_ARCHITECTURE.uk.md) | [🇳🇱 `.nl.md`](./cloud/CLOUD_PLATFORM_ARCHITECTURE.nl.md) | [`CLOUD_PLATFORM_ARCHITECTURE.md`](./cloud/CLOUD_PLATFORM_ARCHITECTURE.md) |
| **Оркестратор Google Suite (`GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR`)** | [🇺🇦 `.uk.md`](./cloud/GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.uk.md) | [🇳🇱 `.nl.md`](./cloud/GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.nl.md) | [`GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.md`](./cloud/GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.md) |
| **Багатооблікова інтеграція M4 (`M4_MULTI_ACCOUNT_INTEGRATION`)** | [🇺🇦 `.uk.md`](./cloud/M4_MULTI_ACCOUNT_INTEGRATION.uk.md) | [🇳🇱 `.nl.md`](./cloud/M4_MULTI_ACCOUNT_INTEGRATION.nl.md) | [`M4_MULTI_ACCOUNT_INTEGRATION.md`](./cloud/M4_MULTI_ACCOUNT_INTEGRATION.md) |
| **Архітектура облікових записів провайдерів (`PROVIDER_ACCOUNT_ARCHITECTURE`)** | [🇺🇦 `.uk.md`](./cloud/PROVIDER_ACCOUNT_ARCHITECTURE.uk.md) | [🇳🇱 `.nl.md`](./cloud/PROVIDER_ACCOUNT_ARCHITECTURE.nl.md) | [`PROVIDER_ACCOUNT_ARCHITECTURE.md`](./cloud/PROVIDER_ACCOUNT_ARCHITECTURE.md) |
| **Прийняття ризиків випуску M11 (`RELEASE-M11-RISK-ACCEPTANCE-20261028`)** | [🇺🇦 `.uk.md`](./cloud/RELEASE-M11-RISK-ACCEPTANCE-20261028.uk.md) | [🇳🇱 `.nl.md`](./cloud/RELEASE-M11-RISK-ACCEPTANCE-20261028.nl.md) | [`RELEASE-M11-RISK-ACCEPTANCE-20261028.md`](./cloud/RELEASE-M11-RISK-ACCEPTANCE-20261028.md) |
| **Схема БД Пошти (`MAIL_DATABASE_SCHEMA`)** | [🇺🇦 `.uk.md`](./mail/MAIL_DATABASE_SCHEMA.uk.md) | [🇳🇱 `.nl.md`](./mail/MAIL_DATABASE_SCHEMA.nl.md) | [`MAIL_DATABASE_SCHEMA.md`](./mail/MAIL_DATABASE_SCHEMA.md) |
| **Технічна специфікація Пошти (`MAIL_IMPLEMENTATION_SPEC`)** | [🇺🇦 `.uk.md`](./mail/MAIL_IMPLEMENTATION_SPEC.uk.md) | [🇳🇱 `.nl.md`](./mail/MAIL_IMPLEMENTATION_SPEC.nl.md) | [`MAIL_IMPLEMENTATION_SPEC.md`](./mail/MAIL_IMPLEMENTATION_SPEC.md) |
| **Архітектура платформи Пошти (`MAIL_PLATFORM_ARCHITECTURE`)** | [🇺🇦 `.uk.md`](./mail/MAIL_PLATFORM_ARCHITECTURE.uk.md) | [🇳🇱 `.nl.md`](./mail/MAIL_PLATFORM_ARCHITECTURE.nl.md) | [`MAIL_PLATFORM_ARCHITECTURE.md`](./mail/MAIL_PLATFORM_ARCHITECTURE.md) |
| **Конвеєр синхронізації Пошти (`MAIL_SYNC_PIPELINE`)** | [🇺🇦 `.uk.md`](./mail/MAIL_SYNC_PIPELINE.uk.md) | [🇳🇱 `.nl.md`](./mail/MAIL_SYNC_PIPELINE.nl.md) | [`MAIL_SYNC_PIPELINE.md`](./mail/MAIL_SYNC_PIPELINE.md) |
| **Матриця станів провайдерів Пошти (`PROVIDER_STATE_MATRIX`)** | [🇺🇦 `.uk.md`](./mail/PROVIDER_STATE_MATRIX.uk.md) | [🇳🇱 `.nl.md`](./mail/PROVIDER_STATE_MATRIX.nl.md) | [`PROVIDER_STATE_MATRIX.md`](./mail/PROVIDER_STATE_MATRIX.md) |
| **Інвентар розширеного пошуку в Пошті (`INVENTARIS-UI-009`)** | [🇺🇦 `.uk.md`](./mail-zoeken-v2/INVENTARIS-UI-009.uk.md) | [🇳🇱 `.nl.md`](./mail-zoeken-v2/INVENTARIS-UI-009.nl.md) | [`INVENTARIS-UI-009.md`](./mail-zoeken-v2/INVENTARIS-UI-009.md) |
| **Підсумковий звіт пошуку в Пошті (`RAPPORT-UI-009`)** | [🇺🇦 `.uk.md`](./mail-zoeken-v2/RAPPORT-UI-009.uk.md) | [🇳🇱 `.nl.md`](./mail-zoeken-v2/RAPPORT-UI-009.nl.md) | [`RAPPORT-UI-009.md`](./mail-zoeken-v2/RAPPORT-UI-009.md) |
| **Єдиний контур входу (`ACCESS_PLANE_V1`)** | [🇺🇦 `.uk.md`](./identity/ACCESS_PLANE_V1.uk.md) | [🇳🇱 `.nl.md`](./identity/ACCESS_PLANE_V1.nl.md) | [`ACCESS_PLANE_V1.md`](./identity/ACCESS_PLANE_V1.md) |
| **Права та привілеї ідентичності (`IDENTITY_ENTITLEMENTS_V1`)** | [🇺🇦 `.uk.md`](./identity/IDENTITY_ENTITLEMENTS_V1.uk.md) | [🇳🇱 `.nl.md`](./identity/IDENTITY_ENTITLEMENTS_V1.nl.md) | [`IDENTITY_ENTITLEMENTS_V1.md`](./identity/IDENTITY_ENTITLEMENTS_V1.md) |
| **Архітектура меню облікових записів (`canonical-account-menu-architecture`)** | [🇺🇦 `.uk.md`](./canonical-account-menu-architecture.uk.md) | [🇳🇱 `.nl.md`](./canonical-account-menu-architecture.nl.md) | [`canonical-account-menu-architecture.md`](./canonical-account-menu-architecture.md) |
| **Контракт SSO-навігації (`ECOSYSTEM_SSO_NAVIGATION_V1`)** | [🇺🇦 `.uk.md`](./contracts/ECOSYSTEM_SSO_NAVIGATION_V1.uk.md) | [🇳🇱 `.nl.md`](./contracts/ECOSYSTEM_SSO_NAVIGATION_V1.nl.md) | [`ECOSYSTEM_SSO_NAVIGATION_V1.md`](./contracts/ECOSYSTEM_SSO_NAVIGATION_V1.md) |
| **Контракт адмін-мосту ідентичності (`IDENTITY_ADMIN_BRIDGE_V1`)** | [🇺🇦 `.uk.md`](./contracts/IDENTITY_ADMIN_BRIDGE_V1.uk.md) | [🇳🇱 `.nl.md`](./contracts/IDENTITY_ADMIN_BRIDGE_V1.nl.md) | [`IDENTITY_ADMIN_BRIDGE_V1.md`](./contracts/IDENTITY_ADMIN_BRIDGE_V1.md) |
| **Контрольна точка Identity Admin Bridge (`2026-07-28_IDENTITY_ADMIN_BRIDGE_V1`)** | [🇺🇦 `.uk.md`](./checkpoints/2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.uk.md) | [🇳🇱 `.nl.md`](./checkpoints/2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.nl.md) | [`2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.md`](./checkpoints/2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.md) |
| **Приймання браузера власника v52 (`2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52`)** | [🇺🇦 `.uk.md`](./checkpoints/2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.uk.md) | [🇳🇱 `.nl.md`](./checkpoints/2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.nl.md) | [`2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.md`](./checkpoints/2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.md) |

---

## 6. Проєктування просторів, Робочого столу, Пошуку `/zoek`, Інтеграцій та Безпеки (`docs/*`)

| Стаття / Документ | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія | Оригінал |
|---|---|---|---|
| **Карта файлів EN → NL (`KAART-BESTANDEN`)** | [🇺🇦 `.uk.md`](./kaart/KAART-BESTANDEN.uk.md) | [🇳🇱 `.nl.md`](./kaart/KAART-BESTANDEN.nl.md) | [`KAART-BESTANDEN.md`](./kaart/KAART-BESTANDEN.md) |
| **ADR N-11: Рукописне введення та IME (`ADR-N11-HANDWRITING-IME`)** | [🇺🇦 `.uk.md`](./ADR-N11-HANDWRITING-IME.uk.md) | [🇳🇱 `.nl.md`](./ADR-N11-HANDWRITING-IME.nl.md) | [`ADR-N11-HANDWRITING-IME.md`](./ADR-N11-HANDWRITING-IME.md) |
| **Беклог 10.10.2026 (`BACKLOG-2026-10-10`)** | [🇺🇦 `.uk.md`](./BACKLOG-2026-10-10.uk.md) | [🇳🇱 `.nl.md`](./BACKLOG-2026-10-10.nl.md) | [`BACKLOG-2026-10-10.md`](./BACKLOG-2026-10-10.md) |
| **Браузер через конектор для ШІ (`BROWSER-VIA-CONNECTOR`)** | [🇺🇦 `.uk.md`](./agenten/BROWSER-VIA-CONNECTOR.uk.md) | [🇳🇱 `.nl.md`](./agenten/BROWSER-VIA-CONNECTOR.nl.md) | [`BROWSER-VIA-CONNECTOR.md`](./agenten/BROWSER-VIA-CONNECTOR.md) |
| **Заходи безпеки за маршрутами (`MAATREGELEN-PER-ROUTE-20261022`)** | [🇺🇦 `.uk.md`](./beveiliging/MAATREGELEN-PER-ROUTE-20261022.uk.md) | [🇳🇱 `.nl.md`](./beveiliging/MAATREGELEN-PER-ROUTE-20261022.nl.md) | [`MAATREGELEN-PER-ROUTE-20261022.md`](./beveiliging/MAATREGELEN-PER-ROUTE-20261022.md) |
| **Переглядач вкладень v2 (`bijlage-viewer-v2/INVENTARIS`)** | [🇺🇦 `.uk.md`](./bijlage-viewer-v2/INVENTARIS.uk.md) | [🇳🇱 `.nl.md`](./bijlage-viewer-v2/INVENTARIS.nl.md) | [`INVENTARIS.md`](./bijlage-viewer-v2/INVENTARIS.md) |
| **Журнал BUG-002 (`bug002/LOGBOEK`)** | [🇺🇦 `.uk.md`](./bug002/LOGBOEK.uk.md) | [🇳🇱 `.nl.md`](./bug002/LOGBOEK.nl.md) | [`LOGBOEK.md`](./bug002/LOGBOEK.md) |
| **Фото-сервіс UI-002: Проєкт (`foto-dienst/ONTWERP`)** | [🇺🇦 `.uk.md`](./foto-dienst/ONTWERP.uk.md) | [🇳🇱 `.nl.md`](./foto-dienst/ONTWERP.nl.md) | [`ONTWERP.md`](./foto-dienst/ONTWERP.md) |
| **Фото-сервіс UI-002: Нотатки випуску (`RELEASE-NOTITIES-UI002`)** | [🇺🇦 `.uk.md`](./foto-dienst/RELEASE-NOTITIES-UI002.uk.md) | [🇳🇱 `.nl.md`](./foto-dienst/RELEASE-NOTITIES-UI002.nl.md) | [`RELEASE-NOTITIES-UI002.md`](./foto-dienst/RELEASE-NOTITIES-UI002.md) |
| **Фото-сервіс UI-002: Інструкція (`ІНСТРУКЦІЯ-UI002`)** | [🇺🇦 `.uk.md`](./foto-dienst/ІНСТРУКЦІЯ-UI002.uk.md) | [🇳🇱 `.nl.md`](./foto-dienst/ІНСТРУКЦІЯ-UI002.nl.md) | [`ІНСТРУКЦІЯ-UI002.md`](./foto-dienst/ІНСТРУКЦІЯ-UI002.md) |
| **Головна інтеграція 10 пакетів (`RELEASE-NOTITIES-HOOFD`)** | [🇺🇦 `.uk.md`](./integratie-hoofd/RELEASE-NOTITIES-HOOFD.uk.md) | [🇳🇱 `.nl.md`](./integratie-hoofd/RELEASE-NOTITIES-HOOFD.nl.md) | [`RELEASE-NOTITIES-HOOFD.md`](./integratie-hoofd/RELEASE-NOTITIES-HOOFD.md) |
| **Перелік перевірки нових функцій (`ПЕРЕЛІК-ПЕРЕВІРКИ`)** | [🇺🇦 `.uk.md`](./integratie-hoofd/ПЕРЕЛІК-ПЕРЕВІРКИ.uk.md) | [🇳🇱 `.nl.md`](./integratie-hoofd/ПЕРЕЛІК-ПЕРЕВІРКИ.nl.md) | [`ПЕРЕЛІК-ПЕРЕВІРКИ.md`](./integratie-hoofd/ПЕРЕЛІК-ПЕРЕВІРКИ.md) |
| **Локальне тестування адаптерів (`ADAPTERS-LOKAAL-TESTEN`)** | [🇺🇦 `.uk.md`](./integraties/ADAPTERS-LOKAAL-TESTEN.uk.md) | [🇳🇱 `.nl.md`](./integraties/ADAPTERS-LOKAAL-TESTEN.nl.md) | [`ADAPTERS-LOKAAL-TESTEN.md`](./integraties/ADAPTERS-LOKAAL-TESTEN.md) |
| **Архітектура під'єднань UI-013 (`ARCHITECTUUR-UI013`)** | [🇺🇦 `.uk.md`](./integraties/ARCHITECTUUR-UI013.uk.md) | [🇳🇱 `.nl.md`](./integraties/ARCHITECTUUR-UI013.nl.md) | [`ARCHITECTUUR-UI013.md`](./integraties/ARCHITECTUUR-UI013.md) |
| **Інвентар 160 інтеграцій (`integraties/INVENTARIS`)** | [🇺🇦 `.uk.md`](./integraties/INVENTARIS.uk.md) | [🇳🇱 `.nl.md`](./integraties/INVENTARIS.nl.md) | [`INVENTARIS.md`](./integraties/INVENTARIS.md) |
| **Нотатки випуску UI-013 (`RELEASE-NOTITIES-UI013`)** | [🇺🇦 `.uk.md`](./integraties/RELEASE-NOTITIES-UI013.uk.md) | [🇳🇱 `.nl.md`](./integraties/RELEASE-NOTITIES-UI013.nl.md) | [`RELEASE-NOTITIES-UI013.md`](./integraties/RELEASE-NOTITIES-UI013.md) |
| **Інструкція каталогу інтеграцій (`ІНСТРУКЦІЯ-UI013`)** | [🇺🇦 `.uk.md`](./integraties/ІНСТРУКЦІЯ-UI013.uk.md) | [🇳🇱 `.nl.md`](./integraties/ІНСТРУКЦІЯ-UI013.nl.md) | [`ІНСТРУКЦІЯ-UI013.md`](./integraties/ІНСТРУКЦІЯ-UI013.md) |
| **Центр сповіщень UI-007 (`INVENTARIS-EN-OORZAKEN`)** | [🇺🇦 `.uk.md`](./meldingen-v2/INVENTARIS-EN-OORZAKEN.uk.md) | [🇳🇱 `.nl.md`](./meldingen-v2/INVENTARIS-EN-OORZAKEN.nl.md) | [`INVENTARIS-EN-OORZAKEN.md`](./meldingen-v2/INVENTARIS-EN-OORZAKEN.md) |
| **Темна тема пошти (`MAIL-DONKER`)** | [🇺🇦 `.uk.md`](./ontwerp/MAIL-DONKER.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/MAIL-DONKER.nl.md) | [`MAIL-DONKER.md`](./ontwerp/MAIL-DONKER.md) |
| **Тимчасова read-only діагностика MCP (`MCP-ALLEEN-LEZEN-DIAGNOSE`)** | [🇺🇦 `.uk.md`](./ontwerp/MCP-ALLEEN-LEZEN-DIAGNOSE.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/MCP-ALLEEN-LEZEN-DIAGNOSE.nl.md) | [`MCP-ALLEEN-LEZEN-DIAGNOSE.md`](./ontwerp/MCP-ALLEEN-LEZEN-DIAGNOSE.md) |
| **Проєкт: Облікові записи, ідентичності та безпека (`ONTWERP-ACCOUNTS-EN-BEVEILIGING`)** | [🇺🇦 `.uk.md`](./ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.nl.md) | [`ONTWERP-ACCOUNTS-EN-BEVEILIGING.md`](./ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md) |
| **Сумісність просторів з розширенням і MCP (`RUIMTES-COMPATIBILITEIT`)** | [🇺🇦 `.uk.md`](./ontwerp/RUIMTES-COMPATIBILITEIT.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/RUIMTES-COMPATIBILITEIT.nl.md) | [`RUIMTES-COMPATIBILITEIT.md`](./ontwerp/RUIMTES-COMPATIBILITEIT.md) |
| **Ізоляція просторів `prive` ↔ `technisch` (`RUIMTES-ISOLATIE`)** | [🇺🇦 `.uk.md`](./ontwerp/RUIMTES-ISOLATIE.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/RUIMTES-ISOLATIE.nl.md) | [`RUIMTES-ISOLATIE.md`](./ontwerp/RUIMTES-ISOLATIE.md) |
| **Тестування просторів (`RUIMTES-TESTEN`)** | [🇺🇦 `.uk.md`](./ontwerp/RUIMTES-TESTEN.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/RUIMTES-TESTEN.nl.md) | [`RUIMTES-TESTEN.md`](./ontwerp/RUIMTES-TESTEN.md) |
| **API-контракт технічних просторів v2 (`TECH-RUIMTES-API`)** | [🇺🇦 `.uk.md`](./ontwerp/TECH-RUIMTES-API.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/TECH-RUIMTES-API.nl.md) | [`TECH-RUIMTES-API.md`](./ontwerp/TECH-RUIMTES-API.md) |
| **Блоки робочого столу (`WERKBLAD-BLOKKEN`)** | [🇺🇦 `.uk.md`](./ontwerp/WERKBLAD-BLOKKEN.uk.md) | [🇳🇱 `.nl.md`](./ontwerp/WERKBLAD-BLOKKEN.nl.md) | [`WERKBLAD-BLOKKEN.md`](./ontwerp/WERKBLAD-BLOKKEN.md) |
| **Термінал технічного профілю (`terminal/TERMINAL`)** | [🇺🇦 `.uk.md`](./terminal/TERMINAL.uk.md) | [🇳🇱 `.nl.md`](./terminal/TERMINAL.nl.md) | [`TERMINAL.md`](./terminal/TERMINAL.md) |
| **Universal File Workspace v0.3 (`INTEGRATIE-20261027`)** | [🇺🇦 `.uk.md`](./universele-bestanden/INTEGRATIE-20261027.uk.md) | [🇳🇱 `.nl.md`](./universele-bestanden/INTEGRATIE-20261027.nl.md) | [`INTEGRATIE-20261027.md`](./universele-bestanden/INTEGRATIE-20261027.md) |
| **Інтеграція блоків у Werkblad v3 (`BLOKKEN-INTEGRATIE`)** | [🇺🇦 `.uk.md`](./werkblad/BLOKKEN-INTEGRATIE.uk.md) | [🇳🇱 `.nl.md`](./werkblad/BLOKKEN-INTEGRATIE.nl.md) | [`BLOKKEN-INTEGRATIE.md`](./werkblad/BLOKKEN-INTEGRATIE.md) |
| **Робочий стіл Werkblad (`werkblad/WERKBLAD`)** | [🇺🇦 `.uk.md`](./werkblad/WERKBLAD.uk.md) | [🇳🇱 `.nl.md`](./werkblad/WERKBLAD.nl.md) | [`WERKBLAD.md`](./werkblad/WERKBLAD.md) |
| **Глобальний пошук `/zoek`: Архітектура (`zoek/ZOEKEN`)** | [🇺🇦 `.uk.md`](./zoek/ZOEKEN.uk.md) | [🇳🇱 `.nl.md`](./zoek/ZOEKEN.nl.md) | [`ZOEKEN.md`](./zoek/ZOEKEN.md) |
| **Пошук `/zoek`: Експлуатація (`zoek/ZOEK-BEHEER`)** | [🇺🇦 `.uk.md`](./zoek/ZOEK-BEHEER.uk.md) | [🇳🇱 `.nl.md`](./zoek/ZOEK-BEHEER.nl.md) | [`ZOEK-BEHEER.md`](./zoek/ZOEK-BEHEER.md) |
| **Пошук `/zoek`: Ізоляція й безпека (`zoek/ZOEK-BEVEILIGING`)** | [🇺🇦 `.uk.md`](./zoek/ZOEK-BEVEILIGING.uk.md) | [🇳🇱 `.nl.md`](./zoek/ZOEK-BEVEILIGING.nl.md) | [`ZOEK-BEVEILIGING.md`](./zoek/ZOEK-BEVEILIGING.md) |
| **Пошук `/zoek`: Тестування (`zoek/ZOEK-TESTEN`)** | [🇺🇦 `.uk.md`](./zoek/ZOEK-TESTEN.uk.md) | [🇳🇱 `.nl.md`](./zoek/ZOEK-TESTEN.nl.md) | [`ZOEK-TESTEN.md`](./zoek/ZOEK-TESTEN.md) |
| **Пошук `/zoek`: Розширення джерел (`zoek/ZOEK-UITBREIDEN`)** | [🇺🇦 `.uk.md`](./zoek/ZOEK-UITBREIDEN.uk.md) | [🇳🇱 `.nl.md`](./zoek/ZOEK-UITBREIDEN.nl.md) | [`ZOEK-UITBREIDEN.md`](./zoek/ZOEK-UITBREIDEN.md) |
| **Ядро Universal File Workspace v0.2 (`integrations/.../README`)** | [🇺🇦 `.uk.md`](../integrations/universal-file-workspace-core-v0.2/README.uk.md) | [🇳🇱 `.nl.md`](../integrations/universal-file-workspace-core-v0.2/README.nl.md) | [`README.md`](../integrations/universal-file-workspace-core-v0.2/README.md) |
| **Локальні браузерні тести Playwright (`scripts/lokaal-e2e/LEESMIJ`)** | [🇺🇦 `.uk.md`](../scripts/lokaal-e2e/LEESMIJ.uk.md) | [🇳🇱 `.nl.md`](../scripts/lokaal-e2e/LEESMIJ.nl.md) | [`LEESMIJ.md`](../scripts/lokaal-e2e/LEESMIJ.md) |
