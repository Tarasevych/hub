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

## Apps (0.5+, «Додатки», BYOS)

Optioneel: de agent kan webapps bouwen en draaien op dit apparaat, voor een AI die de eigenaar daarvoor toestemming gaf
(MCP-hulpmiddelen `app_*`, standaard uit). Alles blijft op de eigen hardware; er is geen externe hosting.

```
node agent.mjs apps-config --apps-root ./apps --runtime podman [--domain "{app}.apps.example.com"] [--caddy-admin unix:/run/caddy/admin.sock] [--caddy-server srv0] [--memory 512m]
node agent.mjs apps-config --disable
```

- Containers: rootless Podman (aanbevolen; de docker-groep staat gelijk aan root), `--cap-drop ALL`, `no-new-privileges`,
  geheugen- en proceslimiet, poort alleen op `127.0.0.1` (20000–20999).
- Elke uitrol: snapshot (tar.gz) + image per versie, laatste 5 bewaard; start de nieuwe versie niet binnen 30 s, dan komt de
  vorige automatisch terug. `apps.rollback` zet een eerdere versie terug zonder te bouwen.
- Bestanden van een uitrol en waarden van geheimen staan nooit in de opdracht (die bewaart de server): de agent haalt ze één
  keer op met zijn eigen token (`POST /api/owner/agents/overdracht`, eenmalig ticket, 10 min, alleen voor deze agent).
- Geheimen: `<apps-root>/secrets/<app>.env` (0600), als omgevingsvariabelen aan de container; waarden worden in logboeken
  gemaskeerd (`***`) en nooit teruggegeven. De eigenaar typt ze zelf op `mcp.*/apps?geheim=…`.
- Caddy (optioneel): routes via de admin-API (unix-socket of lokaal), vooraan ingevoegd, na een herstart van Caddy elke
  5 minuten teruggezet. Zonder Caddy blijft een app alleen lokaal bereikbaar.
- Op de server van «Mijn Ruimte» richt de installer dit in: `sudo /usr/local/sbin/mijn-ruimte-installeer apps-inrichten
  /srv/mijn-ruimte/current --caddy tunnel` en daarna `... apps-koppelen <KOPPELCODE> --domein '{app}.apps.<domein>'`.

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
