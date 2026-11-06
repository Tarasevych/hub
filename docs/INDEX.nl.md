> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія (`INDEX.md`)**](./INDEX.md) ([`INDEX.uk.md`](./INDEX.uk.md)) · **🇳🇱 Nederlands (huidig)** ([`INDEX.nl.md`](./INDEX.nl.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md)

# 📚 Volledige tweetalige documentatie-index van «Mijn Ruimte · Мій простір» (`Tarasevych/hub`)

Alle artikelen, specificaties, wijzigingslogboeken (wijzigingen), uitrolhandleidingen (runbooks) en architectuurdocumenten in de repository zijn beschikbaar in **twee taalversies** — **Nederlands (`🇳🇱 .nl.md`)** en **Oekraïens (`🇺🇦 .uk.md`)** met wederzijdse kruisverwijzingen in de navigatiebalk bovenaan elke pagina.

---

## Inhoud van de catalogus

1. [Hoofd- en themapagina's van de Hub (Worteldocumenten en `docs/hub/`)](#1-hoofd--en-themapaginas-van-de-hub-worteldocumenten-en-docshub)
2. [Regels voor coördinatie van AI-agenten (`ORCH-001` en `orchestratie/`)](#2-regels-voor-coördinatie-van-ai-agenten-orch-001-en-orchestratie)
3. [Uitrol, serverbeveiliging, connectors en Runbooks (`deploy/`)](#3-uitrol-serverbeveiliging-connectors-en-runbooks-deploy)
4. [Wijzigingslogboeken van releases (`deploy/WIJZIGINGEN-*.md`)](#4-wijzigingslogboeken-van-releases-deploywijzigingen-md)
5. [Architectuur van Cloud (`Cloud vNext M1–M11`), Mail en Identiteit (`docs/cloud/`, `docs/mail/`, `docs/identity/`)](#5-architectuur-van-cloud-cloud-vnext-m1m11-mail-en-identiteit-docscloud-docsmail-docsidentity)
6. [Ontwerp van ruimtes, Werkblad, Zoeken `/zoek`, Integraties en Beveiliging (`docs/*`)](#6-ontwerp-van-ruimtes-werkblad-zoeken-zoek-integraties-en-beveiliging-docs)

---

## 1. Hoofd- en themapagina's van de Hub (Worteldocumenten en `docs/hub/`)

| Artikel / Pagina | Beschrijving | 🇳🇱 Nederlandse versie | 🇺🇦 Oekraïense versie | Origineel |
|---|---|---|---|---|
| **Hoofdpagina van het project** | Volledig overzicht van het platform, architectuur, geschiedenis, 71 takken, 27 PR's, 18 releases en omgevingsvariabelen | [🇳🇱 `LEESMIJ.md`](../LEESMIJ.md) · [`README.nl.md`](../README.nl.md) | [🇺🇦 `README.uk.md`](../README.uk.md) | [`README.md`](../README.md) |
| **Volledige artikelcatalogus** | Deze samengevoegde index van alle 140+ documenten in de repository | [🇳🇱 `INDEX.nl.md`](./INDEX.nl.md) | [🇺🇦 `INDEX.uk.md`](./INDEX.uk.md) | [`INDEX.md`](./INDEX.md) |
| **1. Architectuur en 11 subdomeinen** | Gedetailleerde beschrijving van 11 diensten `*.tarasevych.com`, routering, sessies, rollen en opslag | [🇳🇱 `ARCHITECTUUR.nl.md`](./hub/ARCHITECTUUR.nl.md) | [🇺🇦 `ARCHITECTUUR.uk.md`](./hub/ARCHITECTUUR.uk.md) | [`ARCHITECTUUR.md`](./hub/ARCHITECTUUR.md) |
| **2. Ontwikkelingsgeschiedenis van het project** | Chronologie van Fasen I–VI: van AppDeploy en Fasen 1–3 tot `ORCH-001`, `INTEG-001`, `TRACE-001`, `B-009` | [🇳🇱 `GESCHIEDENIS.nl.md`](./hub/GESCHIEDENIS.nl.md) | [🇺🇦 `GESCHIEDENIS.uk.md`](./hub/GESCHIEDENIS.uk.md) | [`GESCHIEDENIS.md`](./hub/GESCHIEDENIS.md) |
| **3. Takken (71), PR's (#1–#27) en Releases** | Geclassificeerde gids voor alle 71 GitHub-takken, Pull Requests en uitgaven | [🇳🇱 `TAKKEN-EN-PRS.nl.md`](./hub/TAKKEN-EN-PRS.nl.md) | [🇺🇦 `TAKKEN-EN-PRS.uk.md`](./hub/TAKKEN-EN-PRS.uk.md) | [`TAKKEN-EN-PRS.md`](./hub/TAKKEN-EN-PRS.md) |
| **4. Repositorystructuur en codekaart** | Mapboom van `server/`, `backend/`, `src/`, `shared/`, `migrations/`, `deploy/` | [🇳🇱 `MAP-STRUCTUUR.nl.md`](./hub/MAP-STRUCTUUR.nl.md) | [🇺🇦 `MAP-STRUCTUUR.uk.md`](./hub/MAP-STRUCTUUR.uk.md) | [`MAP-STRUCTUUR.md`](./hub/MAP-STRUCTUUR.md) |
| **5. Omgevingsvariabelen (Hub-overzicht)** | Systematische gids voor omgevingsvariabelen, geheimen en integraties | [🇳🇱 `OMGEVINGSVARIABELEN.nl.md`](./hub/OMGEVINGSVARIABELEN.nl.md) | [🇺🇦 `OMGEVINGSVARIABELEN.uk.md`](./hub/OMGEVINGSVARIABELEN.uk.md) | [`OMGEVINGSVARIABELEN.md`](./hub/OMGEVINGSVARIABELEN.md) |
| **6. Coördinatie en Uitrol** | Protocol `ORCH-001`, telemetrie `TRACE-001`, stack `B-009` (`Ubuntu 26.04.1 LTS`) en cron | [🇳🇱 `ORCHESTRATIE-EN-UITROL.nl.md`](./hub/ORCHESTRATIE-EN-UITROL.nl.md) | [🇺🇦 `ORCHESTRATIE-EN-UITROL.uk.md`](./hub/ORCHESTRATIE-EN-UITROL.uk.md) | [`ORCHESTRATIE-EN-UITROL.md`](./hub/ORCHESTRATIE-EN-UITROL.md) |
| **Omgevingsvariabelen (`ENV-VARS`)** | Volledig register van variabelen in `/etc/mijn-ruimte/geheimen.env` en `migratie.env` | [🇳🇱 `ENV-VARS.nl.md`](../ENV-VARS.nl.md) | [🇺🇦 `ENV-VARS.uk.md`](../ENV-VARS.uk.md) | [`ENV-VARS.md`](../ENV-VARS.md) |
| **Beveiligingsnotities (`SECURITY-NOTES`)** | Beveiligingsauditrapport, herstelmaatregelen van fasen A/B/1/2/3/Audit/Zoek/Werkblad | [🇳🇱 `SECURITY-NOTES.nl.md`](../SECURITY-NOTES.nl.md) | [🇺🇦 `SECURITY-NOTES.uk.md`](../SECURITY-NOTES.uk.md) | [`SECURITY-NOTES.md`](../SECURITY-NOTES.md) |
| **Porteerplan (`PORTEERPLAN`)** | Architectuurplan voor de overstap van AppDeploy naar een eigen server (BYOS) | [🇳🇱 `PORTEERPLAN.nl.md`](../PORTEERPLAN.nl.md) | [🇺🇦 `PORTEERPLAN.uk.md`](../PORTEERPLAN.uk.md) | [`PORTEERPLAN.md`](../PORTEERPLAN.md) |
| **Cloud M7 Beveiliging DevKit (`README-M7`)** | Ontwikkelkit voor cryptografische gegevensbescherming M7 | [🇳🇱 `README-M7.nl.md`](../README-M7.nl.md) | [🇺🇦 `README-M7.uk.md`](../README-M7.uk.md) | [`README-M7-UK.md`](../README-M7-UK.md) |

---

## 2. Regels voor coördinatie van AI-agenten (`ORCH-001` en `orchestratie/`)

| Artikel / Pagina | Beschrijving | 🇳🇱 Nederlandse versie | 🇺🇦 Oekraïense versie | Canoniek bestand (vergrendeld via `regels.lock.json`) |
|---|---|---|---|---|
| **Agentregels (`AGENTS.md`)** | Enige regelbron voor alle 8 AI-agenten (`ORCH-001`, `TRACE-001`, `B-009`, `B-013`) | [🇳🇱 `AGENTS.nl.md`](../AGENTS.nl.md) | [🇺🇦 `AGENTS.uk.md`](../AGENTS.uk.md) | [`AGENTS.md`](../AGENTS.md) *(tweetalige canon)* |
| **Besluitenregister (`BESLUITEN.md`)** | Append-only register van architectuur- en organisatiebesluiten `B-001`–`B-013` | [🇳🇱 `BESLUITEN.nl.md`](../orchestratie/BESLUITEN.nl.md) | [🇺🇦 `BESLUITEN.uk.md`](../orchestratie/BESLUITEN.uk.md) | [`orchestratie/BESLUITEN.md`](../orchestratie/BESLUITEN.md) |
| **Compacte context (`CONTEXT-COMPACT.md`)** | Automatisch gegenereerde tweetalige context voor agenten zonder directe GitHub-toegang | [🇳🇱/🇺🇦 `CONTEXT-COMPACT.md`](../orchestratie/CONTEXT-COMPACT.md) | [🇺🇦/🇳🇱 `CONTEXT-COMPACT.md`](../orchestratie/CONTEXT-COMPACT.md) | [`orchestratie/CONTEXT-COMPACT.md`](../orchestratie/CONTEXT-COMPACT.md) |

---

## 3. Uitrol, serverbeveiliging, connectors en Runbooks (`deploy/`)

| Artikel / Pagina | 🇳🇱 Nederlandse versie | 🇺🇦 Oekraïense versie | Origineel |
|---|---|---|---|
| **Overzicht uitrolbestanden (`deploy/LEESMIJ`)** | [🇳🇱 `LEESMIJ.nl.md`](../deploy/LEESMIJ.nl.md) | [🇺🇦 `LEESMIJ.uk.md`](../deploy/LEESMIJ.uk.md) | [`deploy/LEESMIJ.md`](../deploy/LEESMIJ.md) |
| **Regels voor een uitrolpakket (`REGELS-UITROLPAKKET`)** | [🇳🇱 `REGELS-UITROLPAKKET.nl.md`](../deploy/REGELS-UITROLPAKKET.nl.md) | [🇺🇦 `REGELS-UITROLPAKKET.uk.md`](../deploy/REGELS-UITROLPAKKET.uk.md) | [`deploy/REGELS-UITROLPAKKET.md`](../deploy/REGELS-UITROLPAKKET.md) |
| **Runbook: Veilige uitrol zonder pad naar root (`RUNBOOK-VEILIGE-UITROL`)** | [🇳🇱 `RUNBOOK-VEILIGE-UITROL.nl.md`](../deploy/RUNBOOK-VEILIGE-UITROL.nl.md) | [🇺🇦 `RUNBOOK-VEILIGE-UITROL.uk.md`](../deploy/RUNBOOK-VEILIGE-UITROL.uk.md) | [`deploy/RUNBOOK-VEILIGE-UITROL.md`](../deploy/RUNBOOK-VEILIGE-UITROL.md) |
| **Herstel na verlies van de VM (`HERSTEL`)** | [🇳🇱 `HERSTEL.nl.md`](../deploy/HERSTEL.nl.md) | [🇺🇦 `HERSTEL.uk.md`](../deploy/HERSTEL.uk.md) | [`deploy/HERSTEL.md`](../deploy/HERSTEL.md) |
| **Volledige kopie en herstel (`VOLLEDIGA-KOPIYA-VIDNOVLENNYA`)** | [🇳🇱 `VOLLEDIGA-KOPIYA-VIDNOVLENNYA.nl.md`](../deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.nl.md) | [🇺🇦 `VOLLEDIGA-KOPIYA-VIDNOVLENNYA.uk.md`](../deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.uk.md) | [`deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.md`](../deploy/VOLLEDIGA-KOPIYA-VIDNOVLENNYA.md) |
| **Geheimenregister (`GEHEIMEN-REGISTER`)** | [🇳🇱 `GEHEIMEN-REGISTER.nl.md`](../deploy/GEHEIMEN-REGISTER.nl.md) | [🇺🇦 `GEHEIMEN-REGISTER.uk.md`](../deploy/GEHEIMEN-REGISTER.uk.md) | [`deploy/GEHEIMEN-REGISTER.md`](../deploy/GEHEIMEN-REGISTER.md) |
| **Sleutels en versleuteling (`KLYUCHI-I-SHYFRUVANNYA`)** | [🇳🇱 `KLYUCHI-I-SHYFRUVANNYA.nl.md`](../deploy/KLYUCHI-I-SHYFRUVANNYA.nl.md) | [🇺🇦 `KLYUCHI-I-SHYFRUVANNYA.uk.md`](../deploy/KLYUCHI-I-SHYFRUVANNYA.uk.md) | [`deploy/KLYUCHI-I-SHYFRUVANNYA.md`](../deploy/KLYUCHI-I-SHYFRUVANNYA.md) |
| **Audit van het beheeroppervlak (`AUDIT-BEHEER-OPPERVLAK`)** | [🇳🇱 `AUDIT-BEHEER-OPPERVLAK.nl.md`](../deploy/AUDIT-BEHEER-OPPERVLAK.nl.md) | [🇺🇦 `AUDIT-BEHEER-OPPERVLAK.uk.md`](../deploy/AUDIT-BEHEER-OPPERVLAK.uk.md) | [`deploy/AUDIT-BEHEER-OPPERVLAK.md`](../deploy/AUDIT-BEHEER-OPPERVLAK.md) |
| **Beheerrechten alleen in technisch profiel (`BEHEER-ALLEEN-TECH`)** | [🇳🇱 `BEHEER-ALLEEN-TECH.nl.md`](../deploy/BEHEER-ALLEEN-TECH.nl.md) | [🇺🇦 `BEHEER-ALLEEN-TECH.uk.md`](../deploy/BEHEER-ALLEEN-TECH.uk.md) | [`deploy/BEHEER-ALLEEN-TECH.md`](../deploy/BEHEER-ALLEEN-TECH.md) |
| **Browserextensie (`BROWSER-EXTENSIE`)** | [🇳🇱 `BROWSER-EXTENSIE.nl.md`](../deploy/BROWSER-EXTENSIE.nl.md) | [🇺🇦 `BROWSER-EXTENSIE.uk.md`](../deploy/BROWSER-EXTENSIE.uk.md) | [`deploy/BROWSER-EXTENSIE.md`](../deploy/BROWSER-EXTENSIE.md) |
| **Publicatie in Chrome Web Store (`CHROME-WEB-STORE`)** | [🇳🇱 `CHROME-WEB-STORE.nl.md`](../deploy/CHROME-WEB-STORE.nl.md) | [🇺🇦 `CHROME-WEB-STORE.uk.md`](../deploy/CHROME-WEB-STORE.uk.md) | [`deploy/CHROME-WEB-STORE.md`](../deploy/CHROME-WEB-STORE.md) |
| **Browserextensie bijwerken (`EXTENSIE-BIJWERKEN`)** | [🇳🇱 `EXTENSIE-BIJWERKEN.nl.md`](../deploy/EXTENSIE-BIJWERKEN.nl.md) | [🇺🇦 `EXTENSIE-BIJWERKEN.uk.md`](../deploy/EXTENSIE-BIJWERKEN.uk.md) | [`deploy/EXTENSIE-BIJWERKEN.md`](../deploy/EXTENSIE-BIJWERKEN.md) |
| **Extensie vast installeren (`EXTENSIE-VAST-INSTALLEREN`)** | [🇳🇱 `EXTENSIE-VAST-INSTALLEREN.nl.md`](../deploy/EXTENSIE-VAST-INSTALLEREN.nl.md) | [🇺🇦 `EXTENSIE-VAST-INSTALLEREN.uk.md`](../deploy/EXTENSIE-VAST-INSTALLEREN.uk.md) | [`deploy/EXTENSIE-VAST-INSTALLEREN.md`](../deploy/EXTENSIE-VAST-INSTALLEREN.md) |
| **Plan voor browserextensie (`PLAN-BROWSER-EXTENSIE`)** | [🇳🇱 `PLAN-BROWSER-EXTENSIE.nl.md`](../deploy/PLAN-BROWSER-EXTENSIE.nl.md) | [🇺🇦 `PLAN-BROWSER-EXTENSIE.uk.md`](../deploy/PLAN-BROWSER-EXTENSIE.uk.md) | [`deploy/PLAN-BROWSER-EXTENSIE.md`](../deploy/PLAN-BROWSER-EXTENSIE.md) |
| **Één connectoradres per AI (`CONNECTOR-EEN-PAD`)** | [🇳🇱 `CONNECTOR-EEN-PAD.nl.md`](../deploy/CONNECTOR-EEN-PAD.nl.md) | [🇺🇦 `CONNECTOR-EEN-PAD.uk.md`](../deploy/CONNECTOR-EEN-PAD.uk.md) | [`deploy/CONNECTOR-EEN-PAD.md`](../deploy/CONNECTOR-EEN-PAD.md) |
| **AI-connectors v2 (`CONNECTOR-V2`)** | [🇳🇱 `CONNECTOR-V2.nl.md`](../deploy/CONNECTOR-V2.nl.md) | [🇺🇦 `CONNECTOR-V2.uk.md`](../deploy/CONNECTOR-V2.uk.md) | [`deploy/CONNECTOR-V2.md`](../deploy/CONNECTOR-V2.md) |
| **MCP-connector voor Claude (`MCP-CONNECTOR`)** | [🇳🇱 `MCP-CONNECTOR.nl.md`](../deploy/MCP-CONNECTOR.nl.md) | [🇺🇦 `MCP-CONNECTOR.uk.md`](../deploy/MCP-CONNECTOR.uk.md) | [`deploy/MCP-CONNECTOR.md`](../deploy/MCP-CONNECTOR.md) |
| **Rapport D: Accountveiligheid (`D-account-veiligheid`)** | [🇳🇱 `D-account-veiligheid.nl.md`](../deploy/D-account-veiligheid.nl.md) | [🇺🇦 `D-account-veiligheid.uk.md`](../deploy/D-account-veiligheid.uk.md) | [`deploy/D-account-veiligheid.md`](../deploy/D-account-veiligheid.md) |
| **Rapport G: Editors (`G-editors`)** | [🇳🇱 `G-editors.nl.md`](../deploy/G-editors.nl.md) | [🇺🇦 `G-editors.uk.md`](../deploy/G-editors.uk.md) | [`deploy/G-editors.md`](../deploy/G-editors.md) |
| **Audit van de mailclient (`MAIL-AUDIT-20261007`)** | [🇳🇱 `MAIL-AUDIT-20261007.nl.md`](../deploy/MAIL-AUDIT-20261007.nl.md) | [🇺🇦 `MAIL-AUDIT-20261007.uk.md`](../deploy/MAIL-AUDIT-20261007.uk.md) | [`deploy/MAIL-AUDIT-20261007.md`](../deploy/MAIL-AUDIT-20261007.md) |
| **Gmail push-synchronisatie Pub/Sub (`MAIL-PUSH-PUBSUB`)** | [🇳🇱 `MAIL-PUSH-PUBSUB.nl.md`](../deploy/MAIL-PUSH-PUBSUB.nl.md) | [🇺🇦 `MAIL-PUSH-PUBSUB.uk.md`](../deploy/MAIL-PUSH-PUBSUB.uk.md) | [`deploy/MAIL-PUSH-PUBSUB.md`](../deploy/MAIL-PUSH-PUBSUB.md) |
| **Release-notities: Technische ruimtes v2 (`RELEASE-NOTITIES-TECH-RUIMTES-V2`)** | [🇳🇱 `RELEASE-NOTITIES-TECH-RUIMTES-V2.nl.md`](../deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.nl.md) | [🇺🇦 `RELEASE-NOTITIES-TECH-RUIMTES-V2.uk.md`](../deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.uk.md) | [`deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.md`](../deploy/RELEASE-NOTITIES-TECH-RUIMTES-V2.md) |
| **Release-notities: Werkblad v3 (`RELEASE-NOTITIES-WERKBLAD-V3`)** | [🇳🇱 `RELEASE-NOTITIES-WERKBLAD-V3.nl.md`](../deploy/RELEASE-NOTITIES-WERKBLAD-V3.nl.md) | [🇺🇦 `RELEASE-NOTITIES-WERKBLAD-V3.uk.md`](../deploy/RELEASE-NOTITIES-WERKBLAD-V3.uk.md) | [`deploy/RELEASE-NOTITIES-WERKBLAD-V3.md`](../deploy/RELEASE-NOTITIES-WERKBLAD-V3.md) |
| **RLS-proef (`RLS-PROEF-20261026`)** | [🇳🇱 `RLS-PROEF-20261026.nl.md`](../deploy/RLS-PROEF-20261026.nl.md) | [🇺🇦 `RLS-PROEF-20261026.uk.md`](../deploy/RLS-PROEF-20261026.uk.md) | [`deploy/RLS-PROEF-20261026.md`](../deploy/RLS-PROEF-20261026.md) |
| **Runbook: Veilige agenten 0.4 (`RUNBOOK-AGENTEN-0.4`)** | [🇳🇱 `RUNBOOK-AGENTEN-0.4.nl.md`](../deploy/RUNBOOK-AGENTEN-0.4.nl.md) | [🇺🇦 `RUNBOOK-AGENTEN-0.4.uk.md`](../deploy/RUNBOOK-AGENTEN-0.4.uk.md) | [`deploy/RUNBOOK-AGENTEN-0.4.md`](../deploy/RUNBOOK-AGENTEN-0.4.md) |
| **Runbook: Local Machine Connector (`RUNBOOK-AGENTS`)** | [🇳🇱 `RUNBOOK-AGENTS.nl.md`](../deploy/RUNBOOK-AGENTS.nl.md) | [🇺🇦 `RUNBOOK-AGENTS.uk.md`](../deploy/RUNBOOK-AGENTS.uk.md) | [`deploy/RUNBOOK-AGENTS.md`](../deploy/RUNBOOK-AGENTS.md) |
| **Runbook: Audit-fixes (`RUNBOOK-AUDIT-FIXES`)** | [🇳🇱 `RUNBOOK-AUDIT-FIXES.nl.md`](../deploy/RUNBOOK-AUDIT-FIXES.nl.md) | [🇺🇦 `RUNBOOK-AUDIT-FIXES.uk.md`](../deploy/RUNBOOK-AUDIT-FIXES.uk.md) | [`deploy/RUNBOOK-AUDIT-FIXES.md`](../deploy/RUNBOOK-AUDIT-FIXES.md) |
| **Runbook: Beveiliging fase 2 + 3 (`RUNBOOK-FASE-2-3`)** | [🇳🇱 `RUNBOOK-FASE-2-3.nl.md`](../deploy/RUNBOOK-FASE-2-3.nl.md) | [🇺🇦 `RUNBOOK-FASE-2-3.uk.md`](../deploy/RUNBOOK-FASE-2-3.uk.md) | [`deploy/RUNBOOK-FASE-2-3.md`](../deploy/RUNBOOK-FASE-2-3.md) |
| **Runbook: Twee ruimtes UI (`RUNBOOK-TECH-RUIMTES-UI`)** | [🇳🇱 `RUNBOOK-TECH-RUIMTES-UI.nl.md`](../deploy/RUNBOOK-TECH-RUIMTES-UI.nl.md) | [🇺🇦 `RUNBOOK-TECH-RUIMTES-UI.uk.md`](../deploy/RUNBOOK-TECH-RUIMTES-UI.uk.md) | [`deploy/RUNBOOK-TECH-RUIMTES-UI.md`](../deploy/RUNBOOK-TECH-RUIMTES-UI.md) |
| **Runbook: Werkblad v3 canvas (`RUNBOOK-WERKBLAD-V3-CANVAS`)** | [🇳🇱 `RUNBOOK-WERKBLAD-V3-CANVAS.nl.md`](../deploy/RUNBOOK-WERKBLAD-V3-CANVAS.nl.md) | [🇺🇦 `RUNBOOK-WERKBLAD-V3-CANVAS.uk.md`](../deploy/RUNBOOK-WERKBLAD-V3-CANVAS.uk.md) | [`deploy/RUNBOOK-WERKBLAD-V3-CANVAS.md`](../deploy/RUNBOOK-WERKBLAD-V3-CANVAS.md) |
| **Logboek naar uw SIEM (`SIEM`)** | [🇳🇱 `SIEM.nl.md`](../deploy/SIEM.nl.md) | [🇺🇦 `SIEM.uk.md`](../deploy/SIEM.uk.md) | [`deploy/SIEM.md`](../deploy/SIEM.md) |
| **SSH-certificaten voor 1 uur (`SSH-CA`)** | [🇳🇱 `SSH-CA.nl.md`](../deploy/SSH-CA.nl.md) | [🇺🇦 `SSH-CA.uk.md`](../deploy/SSH-CA.uk.md) | [`deploy/SSH-CA.md`](../deploy/SSH-CA.md) |
| **Status van invoering (`STATUS-ROBOTA-20261007`)** | [🇳🇱 `STATUS-ROBOTA-20261007.nl.md`](../deploy/STATUS-ROBOTA-20261007.nl.md) | [🇺🇦 `STATUS-ROBOTA-20261007.uk.md`](../deploy/STATUS-ROBOTA-20261007.uk.md) | [`deploy/STATUS-ROBOTA-20261007.md`](../deploy/STATUS-ROBOTA-20261007.md) |
| **Lokale pc-agent (`deploy/agent/LEESMIJ`)** | [🇳🇱 `LEESMIJ.nl.md`](../deploy/agent/LEESMIJ.nl.md) | [🇺🇦 `LEESMIJ.uk.md`](../deploy/agent/LEESMIJ.uk.md) | [`deploy/agent/LEESMIJ.md`](../deploy/agent/LEESMIJ.md) |
| **PowerShell op Windows via Terminal (`WINDOWS-POWERSHELL`)** | [🇳🇱 `WINDOWS-POWERSHELL.nl.md`](../deploy/agent/WINDOWS-POWERSHELL.nl.md) | [🇺🇦 `WINDOWS-POWERSHELL.uk.md`](../deploy/agent/WINDOWS-POWERSHELL.uk.md) | [`deploy/agent/WINDOWS-POWERSHELL.md`](../deploy/agent/WINDOWS-POWERSHELL.md) |
| **Lokale host voor extensie (`deploy/extensie-native/LEESMIJ`)** | [🇳🇱 `LEESMIJ.nl.md`](../deploy/extensie-native/LEESMIJ.nl.md) | [🇺🇦 `LEESMIJ.uk.md`](../deploy/extensie-native/LEESMIJ.uk.md) | [`deploy/extensie-native/LEESMIJ.md`](../deploy/extensie-native/LEESMIJ.md) |

---

## 4. Wijzigingslogboeken van releases (`deploy/WIJZIGINGEN-*.md`)

| Artikel / Wijzigingslogboek | 🇳🇱 Nederlandse versie | 🇺🇦 Oekraïense versie | Origineel |
|---|---|---|---|
| **SSH-certificaat (`WIJZIGINGEN-20261014-B-SSH`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261014-B-SSH.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261014-B-SSH.uk.md) | [`WIJZIGINGEN-20261014-B-SSH.md`](../deploy/WIJZIGINGEN-20261014-B-SSH.md) |
| **MCP na fase B (`WIJZIGINGEN-20261014-MCP-NA-B`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261014-MCP-NA-B.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261014-MCP-NA-B.uk.md) | [`WIJZIGINGEN-20261014-MCP-NA-B.md`](../deploy/WIJZIGINGEN-20261014-MCP-NA-B.md) |
| **Samenvoeging van parallel werk (`WIJZIGINGEN-20261014-SAMENVOEGING`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261014-SAMENVOEGING.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261014-SAMENVOEGING.uk.md) | [`WIJZIGINGEN-20261014-SAMENVOEGING.md`](../deploy/WIJZIGINGEN-20261014-SAMENVOEGING.md) |
| **AI-connectors v2 (`WIJZIGINGEN-20261015-CONNECTOR-V2`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261015-CONNECTOR-V2.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261015-CONNECTOR-V2.uk.md) | [`WIJZIGINGEN-20261015-CONNECTOR-V2.md`](../deploy/WIJZIGINGEN-20261015-CONNECTOR-V2.md) |
| **Admin-pakket: 15 punten (`WIJZIGINGEN-20261017-ADMIN-15-PUNTEN`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.uk.md) | [`WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.md`](../deploy/WIJZIGINGEN-20261017-ADMIN-15-PUNTEN.md) |
| **Diagnostiek `/diagnostiek` (`WIJZIGINGEN-20261017-DIAGNOSTIEK`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-DIAGNOSTIEK.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-DIAGNOSTIEK.uk.md) | [`WIJZIGINGEN-20261017-DIAGNOSTIEK.md`](../deploy/WIJZIGINGEN-20261017-DIAGNOSTIEK.md) |
| **Admin-integraties (`WIJZIGINGEN-20261017-INTEGRATIES`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-INTEGRATIES.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-INTEGRATIES.uk.md) | [`WIJZIGINGEN-20261017-INTEGRATIES.md`](../deploy/WIJZIGINGEN-20261017-INTEGRATIES.md) |
| **Uitrol-dashboard (`WIJZIGINGEN-20261017-UITROL-DASHBOARD`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-UITROL-DASHBOARD.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-UITROL-DASHBOARD.uk.md) | [`WIJZIGINGEN-20261017-UITROL-DASHBOARD.md`](../deploy/WIJZIGINGEN-20261017-UITROL-DASHBOARD.md) |
| **Herstel van de uitrol (`WIJZIGINGEN-20261017-UITROL-HERSTEL`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-UITROL-HERSTEL.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-UITROL-HERSTEL.uk.md) | [`WIJZIGINGEN-20261017-UITROL-HERSTEL.md`](../deploy/WIJZIGINGEN-20261017-UITROL-HERSTEL.md) |
| **Uitrol-wizard (`WIJZIGINGEN-20261017-UITROL-WIZARD`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261017-UITROL-WIZARD.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261017-UITROL-WIZARD.uk.md) | [`WIJZIGINGEN-20261017-UITROL-WIZARD.md`](../deploy/WIJZIGINGEN-20261017-UITROL-WIZARD.md) |
| **Audit-fixes 18.10 (`WIJZIGINGEN-20261018-AUDIT-FIXES`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261018-AUDIT-FIXES.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261018-AUDIT-FIXES.uk.md) | [`WIJZIGINGEN-20261018-AUDIT-FIXES.md`](../deploy/WIJZIGINGEN-20261018-AUDIT-FIXES.md) |
| **Mail-wijzigingen 18.10 (`WIJZIGINGEN-20261018-MAIL`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261018-MAIL.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261018-MAIL.uk.md) | [`WIJZIGINGEN-20261018-MAIL.md`](../deploy/WIJZIGINGEN-20261018-MAIL.md) |
| **Afronding technisch profiel (`WIJZIGINGEN-20261018-TECH-AFRONDING`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.uk.md) | [`WIJZIGINGEN-20261018-TECH-AFRONDING.md`](../deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.md) |
| **Blok 1 snelle fixes (`WIJZIGINGEN-20261026-BLOK1`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261026-BLOK1.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261026-BLOK1.uk.md) | [`WIJZIGINGEN-20261026-BLOK1.md`](../deploy/WIJZIGINGEN-20261026-BLOK1.md) |
| **Blokken 2, 3 en 6 (`WIJZIGINGEN-20261026-BLOK2-6`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261026-BLOK2-6.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261026-BLOK2-6.uk.md) | [`WIJZIGINGEN-20261026-BLOK2-6.md`](../deploy/WIJZIGINGEN-20261026-BLOK2-6.md) |
| **Slim huis Huis vNext (`WIJZIGINGEN-20261028-HUIS-VNEXT`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261028-HUIS-VNEXT.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261028-HUIS-VNEXT.uk.md) | [`WIJZIGINGEN-20261028-HUIS-VNEXT.md`](../deploy/WIJZIGINGEN-20261028-HUIS-VNEXT.md) |
| **Notities vNext (`WIJZIGINGEN-20261028-NOTITIES-VNEXT`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261028-NOTITIES-VNEXT.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261028-NOTITIES-VNEXT.uk.md) | [`WIJZIGINGEN-20261028-NOTITIES-VNEXT.md`](../deploy/WIJZIGINGEN-20261028-NOTITIES-VNEXT.md) |
| **Agenda koppelen en pakket (`WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.uk.md) | [`WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.md`](../deploy/WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.md) |
| **Clouddienst Cloud vNext (`WIJZIGINGEN-20261029-CLOUD-VNEXT`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261029-CLOUD-VNEXT.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261029-CLOUD-VNEXT.uk.md) | [`WIJZIGINGEN-20261029-CLOUD-VNEXT.md`](../deploy/WIJZIGINGEN-20261029-CLOUD-VNEXT.md) |
| **Aanmeldmethoden UI-015 (`WIJZIGINGEN-20261030-AANMELD-UI015`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261030-AANMELD-UI015.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261030-AANMELD-UI015.uk.md) | [`WIJZIGINGEN-20261030-AANMELD-UI015.md`](../deploy/WIJZIGINGEN-20261030-AANMELD-UI015.md) |
| **Afstemming vNext UI-014 (`WIJZIGINGEN-20261030-AFSTEMMING-UI014`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261030-AFSTEMMING-UI014.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261030-AFSTEMMING-UI014.uk.md) | [`WIJZIGINGEN-20261030-AFSTEMMING-UI014.md`](../deploy/WIJZIGINGEN-20261030-AFSTEMMING-UI014.md) |
| **Coördinatiesysteem ORCH-001 (`WIJZIGINGEN-20261031-ORCH-001`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-20261031-ORCH-001.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-20261031-ORCH-001.uk.md) | [`WIJZIGINGEN-20261031-ORCH-001.md`](../deploy/WIJZIGINGEN-20261031-ORCH-001.md) |
| **Menu-oppervlak (`WIJZIGINGEN-MENU-OPPERVLAK`)** | [🇳🇱 `.nl.md`](../deploy/WIJZIGINGEN-MENU-OPPERVLAK.nl.md) | [🇺🇦 `.uk.md`](../deploy/WIJZIGINGEN-MENU-OPPERVLAK.uk.md) | [`WIJZIGINGEN-MENU-OPPERVLAK.md`](../deploy/WIJZIGINGEN-MENU-OPPERVLAK.md) |

---

## 5. Architectuur van Cloud (`Cloud vNext M1–M11`), Mail en Identiteit (`docs/cloud/`, `docs/mail/`, `docs/identity/`)

| Artikel / Specificatie | 🇳🇱 Nederlandse versie | 🇺🇦 Oekraïense versie | Origineel |
|---|---|---|---|
| **Implementatierapport Cloud M5 (`CLOUD-M5-IMPLEMENTATION-REPORT`)** | [🇳🇱 `.nl.md`](./CLOUD-M5-IMPLEMENTATION-REPORT.nl.md) | [🇺🇦 `.uk.md`](./CLOUD-M5-IMPLEMENTATION-REPORT.uk.md) | [`CLOUD-M5-IMPLEMENTATION-REPORT.md`](./CLOUD-M5-IMPLEMENTATION-REPORT.md) |
| **Privacyarchitectuur Cloud M7 (`CLOUD-M7-PRIVACY-ARCHITECTURE`)** | [🇳🇱 `.nl.md`](./CLOUD-M7-PRIVACY-ARCHITECTURE.nl.md) | [🇺🇦 `.uk.md`](./CLOUD-M7-PRIVACY-ARCHITECTURE.uk.md) | [`CLOUD-M7-PRIVACY-ARCHITECTURE.md`](./CLOUD-M7-PRIVACY-ARCHITECTURE.md) |
| **Implementatie Cloud M9 (`CLOUD-M9-IMPLEMENTATION-20261028`)** | [🇳🇱 `.nl.md`](./CLOUD-M9-IMPLEMENTATION-20261028.nl.md) | [🇺🇦 `.uk.md`](./CLOUD-M9-IMPLEMENTATION-20261028.uk.md) | [`CLOUD-M9-IMPLEMENTATION-20261028.md`](./CLOUD-M9-IMPLEMENTATION-20261028.md) |
| **Cloud M5-drivers (`README-M5`)** | [🇳🇱 `.nl.md`](./README-M5.nl.md) | [🇺🇦 `.uk.md`](./README-M5.uk.md) | [`README-M5.md`](./README-M5.md) |
| **Volledige Cloud-integratie M1 (`CLOUD-FULL-INTEGRATION-M1`)** | [🇳🇱 `.nl.md`](./cloud/CLOUD-FULL-INTEGRATION-M1.nl.md) | [🇺🇦 `.uk.md`](./cloud/CLOUD-FULL-INTEGRATION-M1.uk.md) | [`CLOUD-FULL-INTEGRATION-M1.md`](./cloud/CLOUD-FULL-INTEGRATION-M1.md) |
| **Cloud-databaseschema (`CLOUD_DATABASE_SCHEMA`)** | [🇳🇱 `.nl.md`](./cloud/CLOUD_DATABASE_SCHEMA.nl.md) | [🇺🇦 `.uk.md`](./cloud/CLOUD_DATABASE_SCHEMA.uk.md) | [`CLOUD_DATABASE_SCHEMA.md`](./cloud/CLOUD_DATABASE_SCHEMA.md) |
| **Google Drive-provider (`CLOUD_GOOGLE_DRIVE_PROVIDER`)** | [🇳🇱 `.nl.md`](./cloud/CLOUD_GOOGLE_DRIVE_PROVIDER.nl.md) | [🇺🇦 `.uk.md`](./cloud/CLOUD_GOOGLE_DRIVE_PROVIDER.uk.md) | [`CLOUD_GOOGLE_DRIVE_PROVIDER.md`](./cloud/CLOUD_GOOGLE_DRIVE_PROVIDER.md) |
| **Technische specificatie Cloud (`CLOUD_IMPLEMENTATION_SPEC`)** | [🇳🇱 `.nl.md`](./cloud/CLOUD_IMPLEMENTATION_SPEC.nl.md) | [🇺🇦 `.uk.md`](./cloud/CLOUD_IMPLEMENTATION_SPEC.uk.md) | [`CLOUD_IMPLEMENTATION_SPEC.md`](./cloud/CLOUD_IMPLEMENTATION_SPEC.md) |
| **Platformarchitectuur Cloud (`CLOUD_PLATFORM_ARCHITECTURE`)** | [🇳🇱 `.nl.md`](./cloud/CLOUD_PLATFORM_ARCHITECTURE.nl.md) | [🇺🇦 `.uk.md`](./cloud/CLOUD_PLATFORM_ARCHITECTURE.uk.md) | [`CLOUD_PLATFORM_ARCHITECTURE.md`](./cloud/CLOUD_PLATFORM_ARCHITECTURE.md) |
| **Google Suite-onboardingorchestrator (`GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR`)** | [🇳🇱 `.nl.md`](./cloud/GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.nl.md) | [🇺🇦 `.uk.md`](./cloud/GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.uk.md) | [`GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.md`](./cloud/GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.md) |
| **Multi-accountintegratie M4 (`M4_MULTI_ACCOUNT_INTEGRATION`)** | [🇳🇱 `.nl.md`](./cloud/M4_MULTI_ACCOUNT_INTEGRATION.nl.md) | [🇺🇦 `.uk.md`](./cloud/M4_MULTI_ACCOUNT_INTEGRATION.uk.md) | [`M4_MULTI_ACCOUNT_INTEGRATION.md`](./cloud/M4_MULTI_ACCOUNT_INTEGRATION.md) |
| **Provider-accountarchitectuur (`PROVIDER_ACCOUNT_ARCHITECTURE`)** | [🇳🇱 `.nl.md`](./cloud/PROVIDER_ACCOUNT_ARCHITECTURE.nl.md) | [🇺🇦 `.uk.md`](./cloud/PROVIDER_ACCOUNT_ARCHITECTURE.uk.md) | [`PROVIDER_ACCOUNT_ARCHITECTURE.md`](./cloud/PROVIDER_ACCOUNT_ARCHITECTURE.md) |
| **Risicoacceptatie release M11 (`RELEASE-M11-RISK-ACCEPTANCE-20261028`)** | [🇳🇱 `.nl.md`](./cloud/RELEASE-M11-RISK-ACCEPTANCE-20261028.nl.md) | [🇺🇦 `.uk.md`](./cloud/RELEASE-M11-RISK-ACCEPTANCE-20261028.uk.md) | [`RELEASE-M11-RISK-ACCEPTANCE-20261028.md`](./cloud/RELEASE-M11-RISK-ACCEPTANCE-20261028.md) |
| **Mail-databaseschema (`MAIL_DATABASE_SCHEMA`)** | [🇳🇱 `.nl.md`](./mail/MAIL_DATABASE_SCHEMA.nl.md) | [🇺🇦 `.uk.md`](./mail/MAIL_DATABASE_SCHEMA.uk.md) | [`MAIL_DATABASE_SCHEMA.md`](./mail/MAIL_DATABASE_SCHEMA.md) |
| **Technische specificatie Mail (`MAIL_IMPLEMENTATION_SPEC`)** | [🇳🇱 `.nl.md`](./mail/MAIL_IMPLEMENTATION_SPEC.nl.md) | [🇺🇦 `.uk.md`](./mail/MAIL_IMPLEMENTATION_SPEC.uk.md) | [`MAIL_IMPLEMENTATION_SPEC.md`](./mail/MAIL_IMPLEMENTATION_SPEC.md) |
| **Platformarchitectuur Mail (`MAIL_PLATFORM_ARCHITECTURE`)** | [🇳🇱 `.nl.md`](./mail/MAIL_PLATFORM_ARCHITECTURE.nl.md) | [🇺🇦 `.uk.md`](./mail/MAIL_PLATFORM_ARCHITECTURE.uk.md) | [`MAIL_PLATFORM_ARCHITECTURE.md`](./mail/MAIL_PLATFORM_ARCHITECTURE.md) |
| **Synchronisatiepijplijn Mail (`MAIL_SYNC_PIPELINE`)** | [🇳🇱 `.nl.md`](./mail/MAIL_SYNC_PIPELINE.nl.md) | [🇺🇦 `.uk.md`](./mail/MAIL_SYNC_PIPELINE.uk.md) | [`MAIL_SYNC_PIPELINE.md`](./mail/MAIL_SYNC_PIPELINE.md) |
| **Statusmatrix mailproviders (`PROVIDER_STATE_MATRIX`)** | [🇳🇱 `.nl.md`](./mail/PROVIDER_STATE_MATRIX.nl.md) | [🇺🇦 `.uk.md`](./mail/PROVIDER_STATE_MATRIX.uk.md) | [`PROVIDER_STATE_MATRIX.md`](./mail/PROVIDER_STATE_MATRIX.md) |
| **Inventaris geavanceerd zoeken in Mail (`INVENTARIS-UI-009`)** | [🇳🇱 `.nl.md`](./mail-zoeken-v2/INVENTARIS-UI-009.nl.md) | [🇺🇦 `.uk.md`](./mail-zoeken-v2/INVENTARIS-UI-009.uk.md) | [`INVENTARIS-UI-009.md`](./mail-zoeken-v2/INVENTARIS-UI-009.md) |
| **Eindrapport geavanceerd zoeken in Mail (`RAPPORT-UI-009`)** | [🇳🇱 `.nl.md`](./mail-zoeken-v2/RAPPORT-UI-009.nl.md) | [🇺🇦 `.uk.md`](./mail-zoeken-v2/RAPPORT-UI-009.uk.md) | [`RAPPORT-UI-009.md`](./mail-zoeken-v2/RAPPORT-UI-009.md) |
| **Uniforme toegangslaag (`ACCESS_PLANE_V1`)** | [🇳🇱 `.nl.md`](./identity/ACCESS_PLANE_V1.nl.md) | [🇺🇦 `.uk.md`](./identity/ACCESS_PLANE_V1.uk.md) | [`ACCESS_PLANE_V1.md`](./identity/ACCESS_PLANE_V1.md) |
| **Identiteitsrechten (`IDENTITY_ENTITLEMENTS_V1`)** | [🇳🇱 `.nl.md`](./identity/IDENTITY_ENTITLEMENTS_V1.nl.md) | [🇺🇦 `.uk.md`](./identity/IDENTITY_ENTITLEMENTS_V1.uk.md) | [`IDENTITY_ENTITLEMENTS_V1.md`](./identity/IDENTITY_ENTITLEMENTS_V1.md) |
| **Architectuur van het accountmenu (`canonical-account-menu-architecture`)** | [🇳🇱 `.nl.md`](./canonical-account-menu-architecture.nl.md) | [🇺🇦 `.uk.md`](./canonical-account-menu-architecture.uk.md) | [`canonical-account-menu-architecture.md`](./canonical-account-menu-architecture.md) |
| **Contract voor SSO-navigatie (`ECOSYSTEM_SSO_NAVIGATION_V1`)** | [🇳🇱 `.nl.md`](./contracts/ECOSYSTEM_SSO_NAVIGATION_V1.nl.md) | [🇺🇦 `.uk.md`](./contracts/ECOSYSTEM_SSO_NAVIGATION_V1.uk.md) | [`ECOSYSTEM_SSO_NAVIGATION_V1.md`](./contracts/ECOSYSTEM_SSO_NAVIGATION_V1.md) |
| **Contract voor Identity Admin Bridge (`IDENTITY_ADMIN_BRIDGE_V1`)** | [🇳🇱 `.nl.md`](./contracts/IDENTITY_ADMIN_BRIDGE_V1.nl.md) | [🇺🇦 `.uk.md`](./contracts/IDENTITY_ADMIN_BRIDGE_V1.uk.md) | [`IDENTITY_ADMIN_BRIDGE_V1.md`](./contracts/IDENTITY_ADMIN_BRIDGE_V1.md) |
| **Checkpoint Identity Admin Bridge (`2026-07-28_IDENTITY_ADMIN_BRIDGE_V1`)** | [🇳🇱 `.nl.md`](./checkpoints/2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.nl.md) | [🇺🇦 `.uk.md`](./checkpoints/2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.uk.md) | [`2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.md`](./checkpoints/2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.md) |
| **Browseracceptatie eigenaar v52 (`2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52`)** | [🇳🇱 `.nl.md`](./checkpoints/2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.nl.md) | [🇺🇦 `.uk.md`](./checkpoints/2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.uk.md) | [`2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.md`](./checkpoints/2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.md) |

---

## 6. Ontwerp van ruimtes, Werkblad, Zoeken `/zoek`, Integraties en Beveiliging (`docs/*`)

| Artikel / Document | 🇳🇱 Nederlandse versie | 🇺🇦 Oekraïense versie | Origineel |
|---|---|---|---|
| **Bestandskaart EN → NL (`KAART-BESTANDEN`)** | [🇳🇱 `.nl.md`](./kaart/KAART-BESTANDEN.nl.md) | [🇺🇦 `.uk.md`](./kaart/KAART-BESTANDEN.uk.md) | [`KAART-BESTANDEN.md`](./kaart/KAART-BESTANDEN.md) |
| **ADR N-11: Handschriftinvoer en IME (`ADR-N11-HANDWRITING-IME`)** | [🇳🇱 `.nl.md`](./ADR-N11-HANDWRITING-IME.nl.md) | [🇺🇦 `.uk.md`](./ADR-N11-HANDWRITING-IME.uk.md) | [`ADR-N11-HANDWRITING-IME.md`](./ADR-N11-HANDWRITING-IME.md) |
| **Backlog 10.10.2026 (`BACKLOG-2026-10-10`)** | [🇳🇱 `.nl.md`](./BACKLOG-2026-10-10.nl.md) | [🇺🇦 `.uk.md`](./BACKLOG-2026-10-10.uk.md) | [`BACKLOG-2026-10-10.md`](./BACKLOG-2026-10-10.md) |
| **Browser via connector voor AI (`BROWSER-VIA-CONNECTOR`)** | [🇳🇱 `.nl.md`](./agenten/BROWSER-VIA-CONNECTOR.nl.md) | [🇺🇦 `.uk.md`](./agenten/BROWSER-VIA-CONNECTOR.uk.md) | [`BROWSER-VIA-CONNECTOR.md`](./agenten/BROWSER-VIA-CONNECTOR.md) |
| **Beveiligingsmaatregelen per route (`MAATREGELEN-PER-ROUTE-20261022`)** | [🇳🇱 `.nl.md`](./beveiliging/MAATREGELEN-PER-ROUTE-20261022.nl.md) | [🇺🇦 `.uk.md`](./beveiliging/MAATREGELEN-PER-ROUTE-20261022.uk.md) | [`MAATREGELEN-PER-ROUTE-20261022.md`](./beveiliging/MAATREGELEN-PER-ROUTE-20261022.md) |
| **Bijlageviewer v2 (`bijlage-viewer-v2/INVENTARIS`)** | [🇳🇱 `.nl.md`](./bijlage-viewer-v2/INVENTARIS.nl.md) | [🇺🇦 `.uk.md`](./bijlage-viewer-v2/INVENTARIS.uk.md) | [`INVENTARIS.md`](./bijlage-viewer-v2/INVENTARIS.md) |
| **Logboek BUG-002 (`bug002/LOGBOEK`)** | [🇳🇱 `.nl.md`](./bug002/LOGBOEK.nl.md) | [🇺🇦 `.uk.md`](./bug002/LOGBOEK.uk.md) | [`LOGBOEK.md`](./bug002/LOGBOEK.md) |
| **Fotodienst UI-002: Ontwerp (`foto-dienst/ONTWERP`)** | [🇳🇱 `.nl.md`](./foto-dienst/ONTWERP.nl.md) | [🇺🇦 `.uk.md`](./foto-dienst/ONTWERP.uk.md) | [`ONTWERP.md`](./foto-dienst/ONTWERP.md) |
| **Fotodienst UI-002: Release-notities (`RELEASE-NOTITIES-UI002`)** | [🇳🇱 `.nl.md`](./foto-dienst/RELEASE-NOTITIES-UI002.nl.md) | [🇺🇦 `.uk.md`](./foto-dienst/RELEASE-NOTITIES-UI002.uk.md) | [`RELEASE-NOTITIES-UI002.md`](./foto-dienst/RELEASE-NOTITIES-UI002.md) |
| **Fotodienst UI-002: Instructie (`ІНСТРУКЦІЯ-UI002`)** | [🇳🇱 `.nl.md`](./foto-dienst/ІНСТРУКЦІЯ-UI002.nl.md) | [🇺🇦 `.uk.md`](./foto-dienst/ІНСТРУКЦІЯ-UI002.uk.md) | [`ІНСТРУКЦІЯ-UI002.md`](./foto-dienst/ІНСТРУКЦІЯ-UI002.md) |
| **Hoofdintegratie van 10 pakketten (`RELEASE-NOTITIES-HOOFD`)** | [🇳🇱 `.nl.md`](./integratie-hoofd/RELEASE-NOTITIES-HOOFD.nl.md) | [🇺🇦 `.uk.md`](./integratie-hoofd/RELEASE-NOTITIES-HOOFD.uk.md) | [`RELEASE-NOTITIES-HOOFD.md`](./integratie-hoofd/RELEASE-NOTITIES-HOOFD.md) |
| **Controlelijst nieuwe functies (`ПЕРЕЛІК-ПЕРЕВІРКИ`)** | [🇳🇱 `.nl.md`](./integratie-hoofd/ПЕРЕЛІК-ПЕРЕВІРКИ.nl.md) | [🇺🇦 `.uk.md`](./integratie-hoofd/ПЕРЕЛІК-ПЕРЕВІРКИ.uk.md) | [`ПЕРЕЛІК-ПЕРЕВІРКИ.md`](./integratie-hoofd/ПЕРЕЛІК-ПЕРЕВІРКИ.md) |
| **Adapters lokaal testen (`ADAPTERS-LOKAAL-TESTEN`)** | [🇳🇱 `.nl.md`](./integraties/ADAPTERS-LOKAAL-TESTEN.nl.md) | [🇺🇦 `.uk.md`](./integraties/ADAPTERS-LOKAAL-TESTEN.uk.md) | [`ADAPTERS-LOKAAL-TESTEN.md`](./integraties/ADAPTERS-LOKAAL-TESTEN.md) |
| **Verbindingsarchitectuur UI-013 (`ARCHITECTUUR-UI013`)** | [🇳🇱 `.nl.md`](./integraties/ARCHITECTUUR-UI013.nl.md) | [🇺🇦 `.uk.md`](./integraties/ARCHITECTUUR-UI013.uk.md) | [`ARCHITECTUUR-UI013.md`](./integraties/ARCHITECTUUR-UI013.md) |
| **Inventaris van 160 integraties (`integraties/INVENTARIS`)** | [🇳🇱 `.nl.md`](./integraties/INVENTARIS.nl.md) | [🇺🇦 `.uk.md`](./integraties/INVENTARIS.uk.md) | [`INVENTARIS.md`](./integraties/INVENTARIS.md) |
| **Release-notities UI-013 (`RELEASE-NOTITIES-UI013`)** | [🇳🇱 `.nl.md`](./integraties/RELEASE-NOTITIES-UI013.nl.md) | [🇺🇦 `.uk.md`](./integraties/RELEASE-NOTITIES-UI013.uk.md) | [`RELEASE-NOTITIES-UI013.md`](./integraties/RELEASE-NOTITIES-UI013.md) |
| **Instructie integratiecatalogus (`ІНСТРУКЦІЯ-UI013`)** | [🇳🇱 `.nl.md`](./integraties/ІНСТРУКЦІЯ-UI013.nl.md) | [🇺🇦 `.uk.md`](./integraties/ІНСТРУКЦІЯ-UI013.uk.md) | [`ІНСТРУКЦІЯ-UI013.md`](./integraties/ІНСТРУКЦІЯ-UI013.md) |
| **Meldingencentrum UI-007 (`INVENTARIS-EN-OORZAKEN`)** | [🇳🇱 `.nl.md`](./meldingen-v2/INVENTARIS-EN-OORZAKEN.nl.md) | [🇺🇦 `.uk.md`](./meldingen-v2/INVENTARIS-EN-OORZAKEN.uk.md) | [`INVENTARIS-EN-OORZAKEN.md`](./meldingen-v2/INVENTARIS-EN-OORZAKEN.md) |
| **Donkere mailweergave (`MAIL-DONKER`)** | [🇳🇱 `.nl.md`](./ontwerp/MAIL-DONKER.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/MAIL-DONKER.uk.md) | [`MAIL-DONKER.md`](./ontwerp/MAIL-DONKER.md) |
| **Tijdelijke alleen-lezen diagnose MCP (`MCP-ALLEEN-LEZEN-DIAGNOSE`)** | [🇳🇱 `.nl.md`](./ontwerp/MCP-ALLEEN-LEZEN-DIAGNOSE.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/MCP-ALLEEN-LEZEN-DIAGNOSE.uk.md) | [`MCP-ALLEEN-LEZEN-DIAGNOSE.md`](./ontwerp/MCP-ALLEEN-LEZEN-DIAGNOSE.md) |
| **Ontwerp: Accounts, identiteiten en beveiliging (`ONTWERP-ACCOUNTS-EN-BEVEILIGING`)** | [🇳🇱 `.nl.md`](./ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.uk.md) | [`ONTWERP-ACCOUNTS-EN-BEVEILIGING.md`](./ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md) |
| **Ruimtes-compatibiliteit met extensie en MCP (`RUIMTES-COMPATIBILITEIT`)** | [🇳🇱 `.nl.md`](./ontwerp/RUIMTES-COMPATIBILITEIT.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/RUIMTES-COMPATIBILITEIT.uk.md) | [`RUIMTES-COMPATIBILITEIT.md`](./ontwerp/RUIMTES-COMPATIBILITEIT.md) |
| **Ruimtes-isolatie `prive` ↔ `technisch` (`RUIMTES-ISOLATIE`)** | [🇳🇱 `.nl.md`](./ontwerp/RUIMTES-ISOLATIE.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/RUIMTES-ISOLATIE.uk.md) | [`RUIMTES-ISOLATIE.md`](./ontwerp/RUIMTES-ISOLATIE.md) |
| **Ruimtes testen (`RUIMTES-TESTEN`)** | [🇳🇱 `.nl.md`](./ontwerp/RUIMTES-TESTEN.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/RUIMTES-TESTEN.uk.md) | [`RUIMTES-TESTEN.md`](./ontwerp/RUIMTES-TESTEN.md) |
| **API-contract technische ruimtes v2 (`TECH-RUIMTES-API`)** | [🇳🇱 `.nl.md`](./ontwerp/TECH-RUIMTES-API.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/TECH-RUIMTES-API.uk.md) | [`TECH-RUIMTES-API.md`](./ontwerp/TECH-RUIMTES-API.md) |
| **Werkblad-blokken (`WERKBLAD-BLOKKEN`)** | [🇳🇱 `.nl.md`](./ontwerp/WERKBLAD-BLOKKEN.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/WERKBLAD-BLOKKEN.uk.md) | [`WERKBLAD-BLOKKEN.md`](./ontwerp/WERKBLAD-BLOKKEN.md) |
| **Account Identity: Ontwerpoverzicht (`identity-account/README-account`)** | [🇳🇱 `.nl.md`](./ontwerp/identity-account/README-account.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/identity-account/README-account.uk.md) | [`README-account.md`](./ontwerp/identity-account/README-account.md) |
| **Account Identity: Technische specificatie (`TZ-account-2026-11-04`)** | [🇳🇱 `.nl.md`](./ontwerp/identity-account/TZ-account-2026-11-04.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/identity-account/TZ-account-2026-11-04.uk.md) | [`TZ-account-2026-11-04.md`](./ontwerp/identity-account/TZ-account-2026-11-04.md) |
| **Account Identity: Dekkingsmatrix 12/12 (`identity-coverage`)** | [🇳🇱 `.nl.md`](./ontwerp/identity-account/identity-coverage.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/identity-account/identity-coverage.uk.md) | [`identity-coverage.md`](./ontwerp/identity-account/identity-coverage.md) |
| **Account Identity: Ontwerpsamenvatting (`ontwerp-account-samenvatting`)** | [🇳🇱 `.nl.md`](./ontwerp/identity-account/ontwerp-account-samenvatting.nl.md) | [🇺🇦 `.uk.md`](./ontwerp/identity-account/ontwerp-account-samenvatting.uk.md) | [`ontwerp-account-samenvatting.md`](./ontwerp/identity-account/ontwerp-account-samenvatting.md) |
| **Terminal van het technisch profiel (`terminal/TERMINAL`)** | [🇳🇱 `.nl.md`](./terminal/TERMINAL.nl.md) | [🇺🇦 `.uk.md`](./terminal/TERMINAL.uk.md) | [`TERMINAL.md`](./terminal/TERMINAL.md) |
| **Universal Bestand Workspace v0.3 (`INTEGRATIE-20261027`)** | [🇳🇱 `.nl.md`](./universele-bestanden/INTEGRATIE-20261027.nl.md) | [🇺🇦 `.uk.md`](./universele-bestanden/INTEGRATIE-20261027.uk.md) | [`INTEGRATIE-20261027.md`](./universele-bestanden/INTEGRATIE-20261027.md) |
| **Integratie van blokken in Werkblad v3 (`BLOKKEN-INTEGRATIE`)** | [🇳🇱 `.nl.md`](./werkblad/BLOKKEN-INTEGRATIE.nl.md) | [🇺🇦 `.uk.md`](./werkblad/BLOKKEN-INTEGRATIE.uk.md) | [`BLOKKEN-INTEGRATIE.md`](./werkblad/BLOKKEN-INTEGRATIE.md) |
| **Werkblad (`werkblad/WERKBLAD`)** | [🇳🇱 `.nl.md`](./werkblad/WERKBLAD.nl.md) | [🇺🇦 `.uk.md`](./werkblad/WERKBLAD.uk.md) | [`WERKBLAD.md`](./werkblad/WERKBLAD.md) |
| **Globaal zoeken `/zoek`: Architectuur (`zoek/ZOEKEN`)** | [🇳🇱 `.nl.md`](./zoek/ZOEKEN.nl.md) | [🇺🇦 `.uk.md`](./zoek/ZOEKEN.uk.md) | [`ZOEKEN.md`](./zoek/ZOEKEN.md) |
| **Zoeken `/zoek`: Beheer en exploitatie (`zoek/ZOEK-BEHEER`)** | [🇳🇱 `.nl.md`](./zoek/ZOEK-BEHEER.nl.md) | [🇺🇦 `.uk.md`](./zoek/ZOEK-BEHEER.uk.md) | [`ZOEK-BEHEER.md`](./zoek/ZOEK-BEHEER.md) |
| **Zoeken `/zoek`: Isolatie en beveiliging (`zoek/ZOEK-BEVEILIGING`)** | [🇳🇱 `.nl.md`](./zoek/ZOEK-BEVEILIGING.nl.md) | [🇺🇦 `.uk.md`](./zoek/ZOEK-BEVEILIGING.uk.md) | [`ZOEK-BEVEILIGING.md`](./zoek/ZOEK-BEVEILIGING.md) |
| **Zoeken `/zoek`: Testen (`zoek/ZOEK-TESTEN`)** | [🇳🇱 `.nl.md`](./zoek/ZOEK-TESTEN.nl.md) | [🇺🇦 `.uk.md`](./zoek/ZOEK-TESTEN.uk.md) | [`ZOEK-TESTEN.md`](./zoek/ZOEK-TESTEN.md) |
| **Zoeken `/zoek`: Bronnen uitbreiden (`zoek/ZOEK-UITBREIDEN`)** | [🇳🇱 `.nl.md`](./zoek/ZOEK-UITBREIDEN.nl.md) | [🇺🇦 `.uk.md`](./zoek/ZOEK-UITBREIDEN.uk.md) | [`ZOEK-UITBREIDEN.md`](./zoek/ZOEK-UITBREIDEN.md) |
| **Universal Bestand Workspace-kern v0.2 (`integrations/.../README`)** | [🇳🇱 `.nl.md`](../integrations/universal-file-workspace-core-v0.2/README.nl.md) | [🇺🇦 `.uk.md`](../integrations/universal-file-workspace-core-v0.2/README.uk.md) | [`README.md`](../integrations/universal-file-workspace-core-v0.2/README.md) |
| **Lokale Playwright-browsertests (`scripts/lokaal-e2e/LEESMIJ`)** | [🇳🇱 `.nl.md`](../scripts/lokaal-e2e/LEESMIJ.nl.md) | [🇺🇦 `.uk.md`](../scripts/lokaal-e2e/LEESMIJ.uk.md) | [`LEESMIJ.md`](../scripts/lokaal-e2e/LEESMIJ.md) |
