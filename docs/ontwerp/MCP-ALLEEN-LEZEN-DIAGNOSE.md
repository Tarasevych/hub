> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./MCP-ALLEEN-LEZEN-DIAGNOSE.uk.md) · [🇳🇱 **Nederlandse versie**](./MCP-ALLEEN-LEZEN-DIAGNOSE.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Ontwerpvoorstel: Tijdelijke Alleen-Lezen Technische Diagnose voor MCP (`MCP-ALLEEN-LEZEN-DIAGNOSE`)

**Status:** Ontwerpvoorstel (standaard **UIT** — wordt **niet** geactiveerd zonder expliciet besluit van de eigenaar)  
**Datum:** 01.11.2026  
**Taak:** `MCP-ACCESS-001` (§6 — optionele read-only diagnostische autorisatie voor betrouwbare agentaudits)

---

## 1. Probleemstelling

Externe AI-agents in de cloud (zoals Cursor Cloud Agents, ChatGPT of Claude Web) draaien vaak asynchroon voor onafhankelijke code- en release-audits (bijv. het controleren van de huidige productieversie, GitHub PR-status of read-only systeemgezondheid), op momenten dat de eigenaar geen interactieve technische browsersessie open heeft staan.

In het huidige beveiligingsmodel gelden voor `_beheer`-hulpmiddelen terecht vier gelijktijdige voorwaarden:
1. Actieve, niet-gepauzeerde technische sessie van de eigenaar (`tech-ruimtes-v2` / `tech-profiel`);
2. Per-verbinding AI-sessiedelegatie (`app.tech_ruimte_ai` op `verbinding_id`);
3. Ingeschakelde dienst `ai` in de technische gegevensruimte (`ruimte-scheiding`);
4. Toestemming in het ondertekende AI-beleidsplafond (`keten.json` op `admin/ai`).

Zodra de eigenaar zijn browser sluit of naar de persoonlijke ruimte wisselt (`PAUZE`), vervallen alle `_beheer`-hulpmiddelen onmiddellijk — inclusief zuiver **alleen-lezen** inspectiehulpmiddelen (zoals versielijst, PR/audit-status en read-only systeemdiagnose).

---

## 2. Voorgesteld Model (Standaard Uitgeschakeld)

Een afzonderlijke, strikt begrensde modus **`technisch_alleen_lezen_diagnose`** per individuele MCP-verbinding (`verbinding_id`), die **uitsluitend** na expliciete WebAuthn/Passkey step-up door de servereigenaar voor een vaste eindtijd kan worden afgegeven.

### 2.1 Harde Veiligheidsgrenzen

1. **Standaard UIT (`default: off`):** Geen enkele bestaande of nieuwe OAuth-koppeling krijgt deze modus automatisch.
2. **Alleen per `verbinding_id` (nooit `'*'`):** De autorisatie is gebonden aan één specifieke OAuth-grant (`connector_v2_rechten.grant_id`) en één `AgentSlug`. Geen enkel ander AI-kanaal erft deze toestemming.
3. **Verplichte Passkey Step-Up + Maximale Duur:** Afgifte vereist `OWNER_REQUIRED` + verse passkey-bevestiging (`stepUp`) en een harde vervaltijd (`expires_at`, bijv. 1 uur, 4 uur of max. 24 uur voor een nachtelijke audit — **nooit** `tot-intrekken` zonder eindtijd).
4. **Strikte Witte Lijst van Zuiver Alleen-Lezen Hulpmiddelen:**
   - Uitsluitend hulpmiddelen die in `shared/connector-v2/catalogus.ts` zowel `actie: 'lezen'` als een expliciete vlag `diagnoseAlleenLezenToegestaan: true` dragen (bijv. productieversie/gezondheid lezen, orchestratiestatus lezen, GitHub PR/checks lezen zonder secrets).
   - **Absoluut uitgesloten (nooit beschikbaar zonder volledige live technische sessie):**
     - Alle schrijf-, wijzig- of verwijderacties (`actie !== 'lezen'`);
     - Uitrol, herstart, SSH, terminal, containers, vlaggen wijzigen, gebruikersbeheer (`users_manage`, `flags_manage`);
     - Lezen van geheimen, tokens, kluiswaarden, ruwe e-mailinhoud of sessiesleutels.
5. **Ondertekend AI-Beleid (`keten.json`) Blijft Plafond:** Zelfs met een actieve read-only diagnosegrant blijft `controleerAiBeleid()` leidend — als `admin/ai` een hulpmiddel of agent verbiedt, blijft het hulpmiddel gesloten.
6. **Direct Intrekbaar & Volledig Geaudit:**
   - Één klik op `«Стоп ШІ»` (`AiStopKnop`), `«Відкликати»` op `#agent/<slug>` of het verstrijken van `expires_at` trekt de modus onmiddellijk in en stuurt `notifications/tools/list_changed`.
   - Elke aanroep onder deze modus schrijft een auditregel met `modus: 'alleen_lezen_diagnose'`, `verbindingId` en `agent`.

---

## 3. Benodigde Beslissing van de Eigenaar vóór Implementatie

Dit voorstel is in `MCP-ACCESS-001` **bewust alleen als ontwerp gedocumenteerd** en niet in productiecode ingeschakeld. Als de eigenaar deze modus in een vervolgtaak wil laten bouwen, volstaat een keuze op drie punten:
1. Maximale toegestane duur per afgifte (aanbevolen plafond: **4 uur** of **12 uur**);
2. Exacte lijst van toegestane read-only `_beheer`-sleutels (aanbevolen: versie/gezondheid, `orch`-status lezen, read-only auditlog-samenvatting en GitHub PR-lezen);
3. Of elke afgifte naast Passkey step-up ook een directe zichtbare banner in de bovenbalk moet tonen zolang een cloud-agent een lopend read-only diagnosevenster heeft.
