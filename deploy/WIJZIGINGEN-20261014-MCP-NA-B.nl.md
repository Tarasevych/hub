> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261014-MCP-NA-B.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261014-MCP-NA-B.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Release na e6cbf73: MCP-spiegel van de deuren, zonder terugdraaien van SSH en schakelaar B

Het nummer in de naam is een tijdstempel, geen «nieuwere code». De server installeert een pakket alleen als `UITROL-VERSIE` lexicografisch groter is dan de reeds geïnstalleerde versie (`NIET_NIEUWER`). De server heeft release `20261014-185909` geweigerd omdat op de site al `20261014-201957` staat (commit `e6cbf73`, geïnstalleerd om 20:31). De code in `185909` is inhoudelijk nieuwer, maar de tijdstempel is eerder, waardoor de installatie niet werd gestart en de live release `20261014-201957` bleef. Dit archief heeft een tijdstempel ná `20261014-201957`. Upload het bestand `185909` niet opnieuw.

Peildatum: 14.10.2026. De live site is publiek uitgelezen (pagina's, luie scripts, aanwezigheid van routes). De connector van deze verbinding staat niet in het ondertekende AI-beleid, dus `uitrol_voorstel_status` antwoordde met een beleidsweigering. Er is geen omweg gebruikt.

## Wat er al op de site staat

De vingerafdruk van de live frontend en de routes komt overeen met de tak `claude/tech-profiel-2026-10-13` op commit `e6cbf73` (archief van die agent: `mijn-ruimte-e6cbf73.tar.gz`, UITROL-VERSIE `20261014-201957`):

- Het SSH-certificaat voor één uur zit in de interface (`Сертифікат SSH`, recht `ssh.host`). De route `POST /api/ssh-ca/uitgifte` bestaat (antwoordt zonder sessie met `OWNER_SESSION_CONTEXT_REQUIRED`, niet met 404).
- Schakelaar B is aanwezig: in de scripts van de beheeromgeving en het technisch profiel zitten `beheer-alleen-tech` en de formulering over beheerrechten uitsluitend in een actief technisch profiel.
- De diagnostiektabbladen «Журнал і SIEM» (Logboek en SIEM), «Правила (OPA)» (Regels (OPA)) en «Ізоляція даних» (Gegevensisolatie) zijn aanwezig. De vlaggenroute `POST /api/flags` bestaat.
- OAuth van de connector is live: `https://mcp.tarasevych.com/mcp` vereist aanmelding, scope `machines`.

Eerdere archieven zijn als voorouders in deze release opgenomen; hun code is niet weggesneden:

- `mijn-ruimte-20261013-173658.tar.gz` en `mijn-ruimte-20261013-195546.tar.gz` — eerdere lijnen richting het profiel.
- `mijn-ruimte-20261014-090544.tar.gz` — SSH-certificaat, commit `f39718b`, daarna gerepareerd in `c4be691` en opgenomen in `e6cbf73`.

## Wat er niet op de site staat

`mijn-ruimte-20261014-165748.tar.gz` (commit `5434447`) is niet op de server geïnstalleerd. Dat wordt bevestigd door de routes:

- `POST /api/mcp/spiegel/release/live` en `POST /api/mcp/spiegel/services` antwoorden met 404.
- `POST /api/mcp/board/search` antwoordt met 404.
- In de gebouwde interface ontbreken de teksten «Живий випуск» (Live release) en «Карта сервісів» (Dienstenkaart).

De spiegelhulpmiddelen van de deuren (release, bord, dienstenkaart, concepten met bevestiging, GitHub Projects op token) staan dus alleen op GitHub in de tak `cursor/mcp-spiegel-tools-8d4d`, niet in de live boom.

## Wat dit archief toevoegt

De basis is `e6cbf73`. Daarbovenop liggen dezelfde wijzigingen uit `5434447`, zonder bestandsconflicten (schakelaar B raakte andere bestanden). Het AI-beleid krijgt geen nieuwe rechten.

Toegevoegde connectorhulpmiddelen: `get_live_release`, `list_releases`, `read_release_file`, `get_system_health`, `search_board`, `create_task`, `update_task_status`, `update_board_item`, `delete_board_item`, `list_services`, `get_service`, `get_hub_overview`, `get_github_projects` (alleen als er een `github`- of `github-app`-token is), `draft_email_reply`, `draft_calendar_event`, `manage_hub_notes`, `get_connector_stats`.

Via de connector blijft verboden: goedkeuren van een release met een sleutel, terugdraaien, back-up, beleidswijziging, uploaden van een archief naar de chat, waarden van geheimen.

## Wat de installatie niet wist

De installer zet de symlink `current` om naar de nieuwe releasemap. De code van SSH, schakelaar B, SIEM, vlaggen en het technisch profiel zit in deze nieuwe map, omdat die is opgebouwd uit `e6cbf73` plus de connector. Oude archieven op GitHub (`cursor/release-tar-8d4d`) worden niet verwijderd. Op de server bewaart de installer nog steeds de 5 nieuwste releasemappen, inclusief de actieve en de vorige (`BEWAAR_RELEASES`, standaard 5). Terugdraaien: `sudo /usr/local/sbin/mijn-ruimte-installeer terugdraaien`.
