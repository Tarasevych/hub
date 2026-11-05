> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./LEESMIJ.uk.md) · **🇳🇱 Nederlands** ([origineel](./LEESMIJ.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Hub Agent (Local Machine Connector) — 0.8.0

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

## Deze server als apparaat (0.5.1+)

Op de site: mcp.* → «Додатки» of «Агенти → Пристрої → Цей сервер» maakt de koppelcodes en ÉÉN commando, bv.:

```
sudo /usr/local/sbin/mijn-ruimte-installeer beheer-koppelen <CODE> --gebruiker beheer --root '/home/beheer' --readonly-root /srv/mijn-ruimte/current --allow git
```

De agent draait dan als `beheer` (systemd `mijn-ruimte-agent-beheer.service`) met `NoNewPrivileges=yes` (geen sudo, ook niet via
node/python), `ProtectSystem=strict` en schrijven alleen in de gekozen mappen. De eerste koppeling gebeurt bewust in de
console: de site geeft zichzelf geen toegang tot haar eigen host. Daarna regelt de eigenaar alles op de site. Bij elke
release (`installeren`) werkt de installer de agent op de server bij en herstart hem (`agenten_bijwerken`).

## Rechten per opdracht (0.7.0)

Elke opdracht die de agent kan uitvoeren, kunt u apart aan- of uitzetten. Zo houdt u alleen over wat u wilt.

```
node agent.mjs rechten                       # overzicht: aan / uit per opdracht
node agent.mjs rechten set exec off          # zet één opdracht uit
node agent.mjs rechten set exec on
```

- Bestand: `~/.hub-agent/rechten.json` (0600). Voorbeeld met alle sleutels: `deploy/agent/rechten-voorbeeld.json`.
- Een ontbrekende sleutel = aan (zoals vóór 0.7.0). `false` = uit: de opdracht verdwijnt uit de lijst van de agent en wordt geweigerd.
- De agent leest het bestand bij elke verbinding; na een wijziging herstart u de agent (`node agent.mjs run`).
- Sleutels: `sys.info`, `sys.metrics`, `fs.list`, `fs.stat`, `fs.search`, `fs.read`, `fs.write`, `exec`, `docker.ps`, `docker.manage`.
  De apps- en terminalopdrachten hebben hun eigen aan/uit (`apps-config`, `terminal-config`).
- Nieuw in 0.7.0 (alleen lezen): `fs.stat` (grootte, datum, type van één pad) en `fs.search` (zoeken op naam, optioneel in tekst;
  max. 200 treffers, 5000 items, diepte 8, tekstbestanden tot 256 KB; geen symlinks, geheime plekken overgeslagen).

Bewust NIET toegevoegd (ook niet met rechten.json aan te zetten):
- Shells (`cmd`, `powershell`, `bash`, `sudo`, `runas`, …) en interpreters met code-vlaggen (`node -e`, `python -c`): daarmee kan elk pad om de mapgrenzen heen.
- Bestanden verwijderen of hernoemen: geen opdracht ervoor. Een verwijderopdracht zou eerst een verse goedkeuring op de site vragen.
- Het wijzigen van de agent, zijn rechten of zijn toegangsbeleid vanaf de site: dat blijft bij de eigenaar op het apparaat.

## Terminal in de browser (0.6.0+)

Een shell draait NOOIT op het apparaat zelf (shells blijven verboden op de allow-list), alleen in een wegwerpcontainer:
rootless podman (of docker), `--network none`, `--cap-drop ALL`, `no-new-privileges`, `--read-only`, limieten (512 MB, 128 processen),
één toegestane root op `/werk` (standaard alleen-lezen), geheime plekken binnen die root afgedekt (tmpfs of `/dev/null`).
Uitvoer wordt op de site opgenomen (asciicast), invoer niet. Openen alleen vanuit een technisch profiel met terminalrecht, met reden
en verse bevestiging van de aanmelding, en alleen op EIGEN apparaten; een AI kan geen terminal openen.

```
node agent.mjs terminal-config on [--runtime podman|docker] [--image docker.io/library/debian:12-slim] [--max-minuten 60] [--test]
node agent.mjs terminal-config off
```

`--test` (0.7.1) markeert het apparaat als testmachine. Wie mag openen:
- rol met `terminal.servers` (Адміністратор, Власник): elk eigen apparaat;
- rol met alleen `terminal.test` (Розробник): alleen testmachines. Zonder `--test` is het apparaat een server.

Vlaggen zonder waarde (`--test`, `--disable`) nemen sinds 0.7.1 het volgende woord niet meer als waarde. Daardoor werkt
`apps-config --disable` nu echt (daarvoor bleven de apps aan).

Op de server van «Mijn Ruimte» (apps-agent als `mr-apps`): `sudo /usr/local/sbin/mijn-ruimte-installeer apps-terminal on|off`.

## Opdracht-terminal op het apparaat zelf en PowerShell (0.8.0, zone G 22.10.2026)

Naast de container kan de «Термінал» van het technisch profiel nu ÉÉN programma per regel op dit apparaat zelf uitvoeren, als de
gebruiker van de agent (op de server: `beheer`, zonder sudo). Geen shell: de site splitst de regel in programma + argumenten
(`shared/terminal-opdrachten.ts`; `| ; && > <` buiten aanhalingstekens worden geweigerd), de agent voert `term.exec` uit met dezelfde
grenzen als `exec` (allow-lijst, geen shells, geen `node -e`/`python -c`, werkmap binnen de roots, nooit geheime plekken). Verschil met
`exec`: een alleen-lezen root mag werkmap zijn voor een LEZENDE opdracht (`git log` in `/srv/mijn-ruimte`); de tabel «lezend/wijzigend»
(`LEZEND`) is een spiegel van die op de site. Wijzigende opdrachten vragen op de site eerst een bevestiging; alle uitvoer wordt opgenomen
(`app.terminal_opdrachten`). `cd <map>` wisselt de werkmap (binnen de roots).

```
node agent.mjs terminal-config on --opdrachten [--geen-container]        # vereist een allow-lijst (pair … --allow git,systemctl,…)
node agent.mjs terminal-config on --powershell [--geen-container]        # Windows: de regel gaat als -Command-tekst naar powershell.exe
node agent.mjs terminal-config on --opdrachten --powershell              # beide
node agent.mjs pair … --code -                                           # koppelcode van stdin (installer: nooit in de procestabel)
```

- **PowerShell** is de enige «shell» die kan, en alleen als vast programma: `powershell.exe -NoProfile -NonInteractive -Command <tekst>`
  (op Linux/macOS `pwsh`), `shell:false`, nooit via `cmd.exe`; de hele regel is één argument. Binnen PowerShell is de tekst willekeurig —
  daarom bevestigt de site ELKE PowerShell-opdracht, ook via de AI-weg (`uitvoeren_opdracht`/`machine_exec` met `command: "powershell"`
  gaat door dezelfde `exec` en vraagt altijd goedkeuring — de server forceert dat in `submitCommand`, ook met een «altijd»-grant). Zonder `--powershell` blijven `powershell`/`pwsh` geweigerd zoals alle shells.
  Stap voor stap voor Windows: `deploy/agent/WINDOWS-POWERSHELL.md`.
- **De server als apparaat zonder code overtypen**: `sudo mijn-ruimte-installeer terminal-inrichten` (ook stil aan het einde van
  `installeren`, alleen de eerste keer). De installer vraagt als dienstgebruiker een koppelcode voor de eigenaar
  (`dist-server/apparaat-koppelcode.mjs`, ruimte «technisch»), geeft hem via stdin aan `pair --code -` als `beheer`, zet
  `terminal-config on --opdrachten --geen-container` en start `mijn-ruimte-apparaat.service` (User=beheer, NoNewPrivileges,
  ProtectSystem=strict; sjabloon `deploy/mijn-ruimte-apparaat.service`). Standaard roots: `/home/beheer` (schrijven), `/srv/mijn-ruimte`
  en `/var/log` (alleen lezen); standaard allow-lijst: `STANDAARD_ALLOW_SERVER` in `shared/terminal-opdrachten.ts`. Dit vervangt
  `beheer-koppelen` voor dezelfde gebruiker (die unit wordt uitgezet).
- Capabilities melden nu ook `gebruiker` en `host` (statusregel «підключено як beheer@host») en `terminal.{container,opdrachten,powershell}`.

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
- Zelftest zonder server: `node agent.mjs selftest --root <lege map>` (ook in `tests/eenheid/agent-opdrachten.test.ts`).
- Op Windows kunnen `.cmd`-scripts (`npm`, `npx`) niet zonder shell worden gestart; gebruik `node`, `git`, `python`. Voor `npm` op Windows: de opdracht-terminal met `--powershell` (`powershell npm ls`, bevestigd).

## Server

- WebSocket: `wss://<app-host>/agent/ws` (alleen bekende hostnamen uit `SERVICE_HOSTS`), afgehandeld in
  `backend/connectors-gateway.ts`. Agents gebruiken `mcp.tarasevych.com` (rol van dit domein: MCP-instellingen,
  agenten, sleutels en tools). Daarvoor splitst de tunnel die hostnaam op pad: de MCP-brug (poort 8091, alleen-lezen)
  houdt zijn eigen paden, al het andere (schermen, `/api/*`, `wss://…/agent/ws`) gaat naar de hoofdapp op 8080.
  Zie `deploy/cloudflared-config.yml` en `deploy/MCP-SERVICE.txt`. Eerst testen, daarna pas de live-config vervangen.
- Verbindingen leven in het geheugen van het proces: draai één app-proces (zoals nu).
- Migratie `0009_agents.sql` (+ rechten in `rechten.sql`), nieuwe runtime-afhankelijkheid: `ws`.
