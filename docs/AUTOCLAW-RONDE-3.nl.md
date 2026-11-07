> 🌐 **Taal / Мова:** [Українська](КОНКУРС-АВТОКЛО-РАУНД-3.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](INDEX.nl.md)

# Begeleiding en inzending voor «Built with AutoClaw — Ronde 3» (5–20 november 2026)

Dit document bevat de volledige technische beschrijving van de in **Mijn Ruimte** gebouwde ondersteuning voor **AutoClaw (`GLM-5.3-flashX-Legal` / `Z.ai`)**, de demonstratie-opdrachten en kant-en-klare teksten voor deelname aan **Built with AutoClaw — Round 3**.

---

## 1. Wat er in Mijn Ruimte is gebouwd voor AutoClaw (GLM)

1. **Eersteklas registratie van agent `autoclaw` in alle lagen van het platform:**
   - **Merkregister en embleem (`src/merk/merk-register.ts`, `src/merk/merk-tabel.ts`, `extension/merk-agenten.js`):** canonieke sleutel `autoclaw` (aliassen: `openclaw`, `glm`, `chatglm`, `zhipu`, `zhipuai`, `zai`, `z.ai`, `glm-5.3-flashx-legal`) met het officiële Z.ai-vectorembleem (`#FFFFFF` op `#2563EB`, contrast > 5.1:1).
   - **Eigen geïsoleerd MCP v2-eindpunt (`shared/connector-v2/agenten.ts`, `deploy/mcp/server.mjs`):** `https://mcp.tarasevych.com/autoclaw` met OAuth 2.0 + PKCE (RFC 9728) en strikte scheiding tussen privéruimte (`_gebruiker`) en technische ruimte (`_beheer`).
   - **Kleurmarkering en browserextensie (`shared/markering-agenten.ts`, `extension/markering-agenten.js`):** accentkleur `groen` voor directe visuele herkenning van tabbladen die door AutoClaw worden bediend.
   - **Orkestratie en cryptografisch vergrendeld beleid (`orchestratie/beleid.json`, `AUTOCLAW.md`):** `autoclaw` is geregistreerd als ondersteunde orkestratie-agent (`github_pr`, `mcp`, `zip`, `tar_gz`, `git_patch`).
   - **Geheimenkluis (`shared/geheimen.ts`):** automatische herkenning van `ZAI_*`, `AUTOCLAW_*`, `ZHIPU_*` en `GLM_*` als AI-referenties.

2. **Juridische broncontrole, anonimisering en bewijsregister (`shared/ai-bronnen.ts`, `src/agenten/AgentPagina.tsx`):**
   - Functie **`anonimiseerTekst(tekst, lang)`** verbergt gevoelige persoons- en betaalgegevens vóór overdracht of publicatie: e-mailadressen (`[VERBORGEN_E_MAIL]`), IBAN-rekeningen (`[VERBORGEN_REKENING]`), telefoonnummers (`[VERBORGEN_TELEFOON]`) en KvK/BSN/BTW-nummers (`[VERBORGEN_NUMMER]`).
   - Functie **`bouwBewijsIndex(brieven, lang)`** verdeelt contracten en brieven in genummerde alinea's (`§1, §2…`), controleert elke verplichting, vraag, termijn en elk bedrag **letterlijk in het origineel** (zonder hallucinaties of vertaalverschuiving), bouwt een chronologische tijdlijn en levert een kant-en-klaar Markdown-bewijsregister.
   - Op **`https://mcp.tarasevych.com/agenten#agent/autoclaw`** staat het interactieve kanaal **«5. Juridische broncontrole en bewijsregister (GLM-5.3-flashX-Legal)»** waarmee contractteksten direct gecontroleerd en als Markdown-register gekopieerd kunnen worden.

3. **CLI-opdrachten (`.agents/skills/mijn-ruimte/scripts/mijn-ruimte`):**
   - `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/autoclaw` — verbindt AutoClaw met de 4-kanaalsbrug.
   - `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte JuridischControleer --taal nl` — voert direct letterlijke broncontrole, anonimisering en opbouw van het bewijsregister uit.
   - `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte AutoClawPakket --taal nl` — toont het volledige overzicht en de controlelijst voor indiening in Ronde 3.

---

## 2. Keuze van het spoor voor maximale beloning

| Spoor | Basisbeloning | Kwaliteitsprijs | Hoofdprijs | Totaal | Wat wij met Mijn Ruimte tonen |
| --- | --- | --- | --- | --- | --- |
| **Spoor 1: Rechtspraktijk (Legal Practice — Hoofdspoor)** | **4.000 kredieten** | +4.000 kredieten | +52.000 kredieten | **tot 56.000 kredieten** | Letterlijke citaat- en termijncontrole per alinea (`bericht 1 · §2`), automatische anonimisering van persoonsgegevens (`anonimiseerTekst`) en chronologisch bewijsregister (`bouwBewijsIndex`) met `GLM-5.3-flashX-Legal` en `/autoclaw`. |
| **Spoor 3: Vrije ontwikkeling (Open Creation)** | **2.000 kredieten** | +2.000 kredieten | +26.000 kredieten | **tot 28.000 kredieten** | Multi-agentcoördinatie (`orch.mjs`, `TRACE-001`), cryptografisch vergrendeld beleid (`regels.lock.json`, Passkey / SSH) en de 4-kanaals MCP-brug (`/autoclaw` ↔ Site, Browser, Pc, Server). |

---

## 3. Controlelijst voor het indienen van Ronde 3

1. **Volg het officiële account:** open `https://x.com/AutoClawAIer`, volg het account en maak een schermafdruk.
2. **Maak schermafdrukken van Mijn Ruimte:**
   - Open `https://mcp.tarasevych.com/agenten#agent/autoclaw` met het AutoClaw-embleem, het eigen adres `/autoclaw` en het tabblad **«5. Juridische broncontrole en bewijsregister (GLM-5.3-flashX-Legal)»**.
   - Of voer in de terminal uit:
     ```bash
     node .agents/skills/mijn-ruimte/scripts/mijn-ruimte JuridischControleer --taal nl
     ```
3. **Publiceer het openbare X-bericht** (uiterlijk **20 november 2026, 23:59 UTC+8**) met `@AutoClawAIer` en `#BuiltWithAutoClaw` (zonder uw e-mailadres in het openbare bericht).
4. **Vul het Ronde 3-formulier in:** `https://docs.google.com/forms/d/e/1FAIpQLScuGx-yxeaZmyNK7zH1p8eSiGG0h6ke5rS2DVXOyJrNXdxeFQ/viewform` met productkoppeling `https://github.com/Tarasevych/hub` of `https://mcp.tarasevych.com/agenten#agent/autoclaw`.
