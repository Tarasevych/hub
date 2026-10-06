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
   Voor Docker-gereedschap (`docker_list_containers`, `docker_manage_container`) voegt u `docker` toe aan `--allow` (bijv. `--allow git,node,docker`). `system_metrics` heeft geen extra rechten nodig; containers starten/stoppen vraagt altijd uw goedkeuring op de site.
3. Status verschijnt als Connected in de UI. Schrijven en commando's uitvoeren wachten op uw goedkeuring op de site.

## Veiligheid

- Agenttoken: alleen de sha256-hash staat in de database; het token zelf in `~/.hub-agent/config.json` (modus 0600).
- Koppelcode: gehasht, één keer bruikbaar, 10 minuten, maximaal 5 per 10 minuten per gebruiker.
- De agent controleert zelf mappen (realpath, geen symlink-ontsnapping) en commando's (geen shell; programma + argumenten).
- Op Windows kunnen `.cmd`-scripts (`npm`, `npx`) niet zonder shell worden gestart; gebruik `node`, `git`, `python`.

## Server

- WebSocket: `wss://<app-host>/agent/ws` (alleen bekende hostnamen uit `SERVICE_HOSTS`), afgehandeld in
  `backend/connectors-gateway.ts`. Agents gebruiken `mcp.tarasevych.com` (rol van dit domein: MCP-instellingen,
  agenten, sleutels en tools). Daarvoor splitst de tunnel die hostnaam op pad: de MCP-brug (poort 8091, alleen-lezen)
  houdt zijn eigen paden, al het andere (schermen, `/api/*`, `wss://…/agent/ws`) gaat naar de hoofdapp op 8080.
  Zie `deploy/cloudflared-config.yml` en `deploy/MCP-SERVICE.txt`. Eerst testen, daarna pas de live-config vervangen.
- Verbindingen leven in het geheugen van het proces: draai één app-proces (zoals nu).
- Migratie `0009_agents.sql` (+ rechten in `rechten.sql`), nieuwe runtime-afhankelijkheid: `ws`.
