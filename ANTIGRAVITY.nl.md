> 🌐 **Taal / Мова:** [Українська](АДАПТЕР-АНТИГРАВІТІ.uk.md) · **Nederlands** | [Hoofdpagina](LEESMIJ.md) · [Documentatie-index](docs/INDEX.nl.md)

<!-- orch-adapter -->
# Adapter voor Google Antigravity (MCP-verbinder mcp.tarasevych.com/antigravity) · Перехідник для Google Antigravity (з'єднувач MCP mcp.tarasevych.com/antigravity)

Dit bestand is uitsluitend een verwijzing. Alle regels staan in **AGENTS.md** (Nederlandse weergave: `AGENTENREGELS.nl.md`) en `orchestratie/beleid.json`. Hier wordt niets toegevoegd of opgeheven.

1. Lees **AGENTS.md** / `AGENTENREGELS.nl.md` volledig (zonder opslagplaatstoegang: `orchestratie/CONTEXT-COMPACT.md`); eigen MCP-verbinderadres: `https://mcp.tarasevych.com/antigravity`.
2. Agent-identificatie voor taak-ID's, uitgavepakketten en het veld `AGENT`: `antigravity`.
3. Eerste stap van elke sessie: `node scripts/orch.mjs begin --agent antigravity` — regels, vaardigheden (waaronder `klimop-architectuur`), functiedossier en parallel werk (`AGENTENREGELS.nl.md` §9). Vóór aanvang: `controleer` en `versheid --taak <ID> --fase start`. Vóór overdracht: auteurschapsregistratie `orch bijdrage`, `versheid --fase overdracht` + `ORCH-OVERDRACHT.json`.
4. **Doelarchitectuur «Klimop» (`KLIMOP-001`, `AGENTENREGELS.nl.md` §3b, §10, `docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`):** het manifest is een doelarchitectuur en GEEN toestemming voor onmiddellijke wijziging van de productie-infrastructuur of uitschakeling van bestaande servers en PostgreSQL; toets elke wijziging aan de 15 architectuurcontrolevragen (§10.4) zonder verboden vereenvoudigingen (§10.5).
5. Talen (Absolute Taalwet): communicatie en verslagen in zuiver Oekraïens (`uk`); codecommentaar, gebruikersinterface en documentatie uitsluitend in zuiver Oekraïens (`uk`) en zuiver Nederlands (`nl`).
6. Geen wijzigingen in de productieomgeving, `voornaamst`, `integratie`, `release/*`, andermans takken of reservekopieën zonder uitdrukkelijke goedkeuring van de eigenaar.
