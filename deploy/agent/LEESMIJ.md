# Hub Agent (Local Machine Connector)

Het programma dat een pc of VM van een gebruiker koppelt aan de site. De agent belt zelf naar buiten (WSS via de
Cloudflare Tunnel); er hoeft geen poort open en geen router te worden ingesteld.

## Gebruik

1. mcp.tarasevych.com → Agenten → "Pc / virtuele machine koppelen": toont een code (10 minuten, één keer bruikbaar).
2. Op de machine (Node.js 22 of nieuwer, `agent.mjs` erbij):

   ```
   node agent.mjs pair --server https://mcp.tarasevych.com --code XXXXXXXX --name "Mijn pc" --root D:\projecten --allow git,node
   node agent.mjs run
   ```

   `--root` (herhaalbaar) = de enige mappen waar de agent bij kan; `--allow` = de enige programma's die hij mag starten.
   `--readonly-root` (herhaalbaar, 0.3.1+) = een map die de agent alleen mag lezen en tonen (nooit schrijven, nooit als
   werkmap voor een commando), bijvoorbeeld de back-ups: `--root T:\ --readonly-root R:\`.
   Voor Docker-gereedschap (`docker_list_containers`, `docker_manage_container`) voegt u `docker` toe aan `--allow` (bijv. `--allow git,node,docker`). `system_metrics` heeft geen extra rechten nodig; containers starten/stoppen vraagt altijd uw goedkeuring op de site.
3. Status verschijnt als Connected in de UI. Schrijven en commando's uitvoeren wachten op uw goedkeuring op de site.

## Veiligheid

- Agenttoken: alleen de sha256-hash staat in de database; het token zelf in `~/.hub-agent/config.json` (modus 0600).
- Koppelcode: gehasht, één keer bruikbaar, 10 minuten, maximaal 5 per 10 minuten per gebruiker.
- De agent controleert zelf mappen (realpath, geen symlink-ontsnapping) en commando's (geen shell; programma + argumenten).
- Een schijfwortel als root (`T:\`, `/`) werkt voor alle submappen (0.3.1; daarvoor gaf elke submap «path outside allowed roots»).
- Geheime plekken zijn nooit bereikbaar, ook niet binnen een root (0.3.1): mappen `geheim`, `geheimen`, `secrets`, `.ssh`,
  `.gnupg`, `.hub-agent`, `.aws`, `.azure`, `.kube`, `.docker` en bestanden `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.ppk`,
  `*.kdbx`, `.env*`, `id_rsa*`/`id_ed25519*`, `uitrol-sleutel*`, `recovery.key*`, `access-seal.key`. Ze staan in `fs.list`
  met `protected: true`; lezen, schrijven, werkmap of een argument dat ernaar wijst wordt geweigerd.
- Let op: `node`/`python` op de allow-list betekent dat een (goedgekeurd) script alles kan wat uw gebruikersaccount kan;
  de mapgrenzen gelden voor de agent-opdrachten, niet voor de code in zo'n script. Zet ze alleen aan als het nodig is.
- Zelftest zonder server: `node agent.mjs selftest --root <lege map>` (ook in `tests/eenheid/agent-commands.test.ts`).
- Op Windows kunnen `.cmd`-scripts (`npm`, `npx`) niet zonder shell worden gestart; gebruik `node`, `git`, `python`.

## Server

- WebSocket: `wss://<app-host>/agent/ws` (alleen bekende hostnamen uit `SERVICE_HOSTS`), afgehandeld in
  `backend/connectors-gateway.ts`. Agents gebruiken `mcp.tarasevych.com` (rol van dit domein: MCP-instellingen,
  agenten, sleutels en tools). Daarvoor splitst de tunnel die hostnaam op pad: de MCP-brug (poort 8091, alleen-lezen)
  houdt zijn eigen paden, al het andere (schermen, `/api/*`, `wss://…/agent/ws`) gaat naar de hoofdapp op 8080.
  Zie `deploy/cloudflared-config.yml` en `deploy/MCP-SERVICE.txt`. Eerst testen, daarna pas de live-config vervangen.
- Verbindingen leven in het geheugen van het proces: draai één app-proces (zoals nu).
- Migratie `0009_agents.sql` (+ rechten in `rechten.sql`), nieuwe runtime-afhankelijkheid: `ws`.
