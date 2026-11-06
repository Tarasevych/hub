> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./TERMINAL.uk.md) · **🇳🇱 Nederlands** ([origineel](./TERMINAL.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Terminal van het technisch profiel (zone G, 22.10.2026)

## Wat het is
De «Terminal» in de technische band (⋯ → Terminal) heeft twee modi in één venster:

1. **Opdracht-terminal** (standaard) — opent **meteen** op het apparaat van de technische ruimte (uw server als gebruiker `beheer`, of een
   Windows-pc met PowerShell), al aangemeld: statusregel «verbonden als beheer@\<host\>, map …, toegestaan: …, ● opname van uitvoer, bevestiging:
   wijzigende opdrachten». Eén regel = **één programma** uit de toegestane lijst van het apparaat, zonder shell (`| ; && > < $( \`` werken niet — de site
   weigert eerlijk; tussen aanhalingstekens gaan tekens letterlijk mee als argument). `cd <map>` wijzigt de werkmap (alleen binnen de toegestane mappen).
   Tab voor aanvullen (programma's en hun «lezende» subopdrachten), ↑/↓ voor geschiedenis, Ctrl+L om te wissen, knop «Kopiëren» bij elke
   uitvoer, «Geschiedenis» met al uw opdrachten en uitvoer (Auditor/Eigenaar: van iedereen).
2. **Container** — zoals voorheen: interactieve shell in een wegwerpcontainer op een apparaat met podman (zonder netwerk, alleen `/werk`).

Als er geen enkel apparaat is — in plaats van een droge melding de **wizard «Server als apparaat koppelen»** met de exacte opdracht
`sudo mijn-ruimte-installeer terminal-inrichten` en de knop «Stand controleren».

## Lezen / wijzigen en bevestiging
Elke opdracht wordt geclassificeerd (`shared/terminal-opdrachten.ts`, tabel `LEZEND`):
- **lezen** (meteen): `ls cat tail head df free uptime whoami id stat wc du ps uname pwd grep nproc lscpu lsblk diff cut`,
  `hostname` (zonder naam), `date` (zonder `-s`), `find` (zonder `-exec/-execdir/-ok/-delete/-fprint…`), `sort` (zonder `-o/--output/--compress-program`),
  `ss` (zonder `-K`), `ip a|route|link show…` (zonder `set/add/del/flush/exec…`), `dmesg` (zonder `-C/-c/-D/-E/-n`), `tree` (zonder `-o`), `file` (zonder `-C`),
  `git status|log|diff|show|branch|remote -v|ls-files|reflog|…` (zonder `--output=`), `systemctl status|is-active|list-units|list-timers|show|cat`,
  `journalctl …` (zonder `--vacuum/--rotate/--flush/--setup-keys`), `npm ls|view|outdated|version` (zonder argument), `node -v`,
  `podman ps|images|logs|inspect|stats`, `tar -t…` (zonder `-I/--checkpoint-action/--to-command`), `mijn-ruimte-installeer lijst|apps-status`,
  `apt list|search|show`;
- **wijzigen** (eerst bevestiging in het venster): al het andere — `git pull/push/checkout`, `systemctl restart/start/stop/enable`,
  `npm install/run/version patch`, `node script.js`, `podman rm`, `tar -x`, `sed` (altijd: opdrachten `e`/`w` in GNU sed voeren uit of schrijven),
  `uniq invoer uitvoer`, een onbekend programma of onbekende subopdracht (liever een klik extra). Regel: alles wat via een vlag code start of een bestand schrijft,
  is nooit «lezen» — want lezen loopt zonder klik.
- **PowerShell** — altijd bevestiging (de tekst binnenin is vrij).
In de «Instellingen» van het apparaat (in het terminalvenster, met step-up) kan «elke opdracht» gekozen worden. Alle opdrachten komen in het journaal
(`owner.terminal.opdracht`), en de uitvoer wordt bewaard in `app.terminal_opdrachten` (tot 256 KB per opdracht).

## Veiligheidsgrens
De agent draait **zonder sudo** (`NoNewPrivileges`), als gebruiker `beheer`; `ProtectSystem=strict`. De terminal kan dus precies zoveel als
`beheer` — niet meer. `sudo`, shells (`bash`, `sh`, `cmd`, `wsl`), `node -e`, `python -c` — nooit, zelfs niet in de allow-lijst.
De werkmap blijft altijd binnen de mappen van de agent (`/home/beheer` voor schrijven; `/srv/mijn-ruimte`, `/var/log` voor lezen; in een «alleen-lezen» map
zijn alleen lezende opdrachten toegestaan). Geheime plekken (`.ssh`, `.env`, `*.pem`, `.hub-agent`, `geheim/`) zijn ontoegankelijk. Bestanden van releases lezen
(`/srv/mijn-ruimte/releases`, `0750 root:mijnruimte`) kan `beheer` niet — dat is bewust: releases en geheimen horen bij root/de dienst.
Wat root vereist (dienst herstarten, `mijn-ruimte-installeer installeren`) blijft op de SSH-console of in de bestaande beveiligde kanalen
(passkey-goedkeuring van updates, besluit van de eigenaar). De terminal is bedoeld voor diagnose en beheer binnen de grenzen van `beheer`.

## De server als apparaat: `sudo mijn-ruimte-installeer terminal-inrichten`
Één stap op de console (SSH als `beheer`). De installer (root):
1. draait als **effectieve dienstgebruiker** (`systemd-run -p User=mijnruimte`, dienstgeheimen) `dist-server/apparaat-koppelcode.mjs`:
   dezelfde eenmalige koppelcode als op `mcp.*` → Apparaten (5 min, in de database alleen de hash, ruimte «technisch», voor het account van
   `OWNER_EMAIL` — dat moet minstens één keer op de site aangemeld zijn geweest);
2. geeft de code **via stdin** (`agent.mjs pair --code -`; nooit als argument, nooit in het logboek) aan de agent namens `beheer`
   met de mappen `/home/beheer` (schrijven), `/srv/mijn-ruimte`, `/var/log` (lezen) en de lijst `STANDAARD_ALLOW_SERVER`;
3. voert `terminal-config on --opdrachten --geen-container` uit;
4. schrijft `mijn-ruimte-apparaat.service` uit het sjabloon `deploy/mijn-ruimte-apparaat.service` (`User=beheer`, `NoNewPrivileges`, `ProtectSystem=strict`,
   `ReadWritePaths` alleen `~/.hub-agent` en de schrijfmappen) en start die; de oude unit `mijn-ruimte-agent-beheer.service` (`beheer-koppelen`) wordt uitgeschakeld.
Dezelfde stap wordt **automatisch en stil** uitgevoerd aan het einde van `mijn-ruimte-installeer installeren` — alleen als het nog niet is ingericht en de gebruiker
`beheer` bestaat; een fout daar breekt de installatie nooit af (alleen een waarschuwing met uitleg).
Opties: `--gebruiker <naam>`, `--naam`, `--allow a,b,c`, `--root DIR`, `--readonly-root DIR`, `--server https://mcp.<domein>`, `--opnieuw`,
`--status`, `--uit`.

**Waarom niet volledig zonder console:** de koppeling bindt het apparaat aan het account van de eigenaar en geeft de site opdrachten op haar eigen host; zo'n
besluit hoort bij wie root heeft op de machine (dezelfde grens als bij de passkey-goedkeuring van updates, die door root gecontroleerd wordt). Één stap —
en daarna gaat alles via de site.

## Windows-pc (PowerShell)
Volledige handleiding: `deploy/agent/WINDOWS-POWERSHELL.md` (Node op Windows, `pair` met de code uit `mcp.*` → Apparaten in de technische ruimte,
`terminal-config on --powershell --geen-container`, starten via Taakplanner — `sc.exe` is ongeschikt omdat Node/PowerShell geen Windows-service is). In de terminal: apparaatkeuze «server / pc»,
statusregel «PowerShell op \<pc\>», prompt `PS C:\…>`. Via de AI-connector (`uitvoeren_opdracht`, `command: "powershell"`) — dezelfde
vaste start `-NoProfile -NonInteractive -Command`, dezelfde bevestiging op de site — **altijd**, zelfs als voor het apparaat de toestemming «altijd»
of de matrix «zonder bevestiging» aanstaat (`backend/connectors-opdrachten.ts` → `isPowershellOpdracht`).

## Technisch
- Routes: `POST /api/terminal/apparaten` (modi, allow, gebruiker@host, bevestiging), `/opdracht` (geeft `{bevestiging:true}` of
  resultaatrij terug; na 20 s — `{klaar:false,id}` + `/opdracht-stand`), `/opdrachten` (geschiedenis), `/instelling` (extra bevestiging).
- Server → agent: met HMAC ondertekende opdracht `term.exec` (`connectors-gateway.stuurTerminalOpdracht`), niet via de AI-wachtrij (`app.agent_commands`).
- Agent: `handlers['term.exec']` (0.8.0), `LEZEND` is een spiegel van de sitetabel (een test houdt ze gelijk).
- Migratie `0113_terminal_opdrachten.sql` (RLS: alleen eigen rijen; schrijven alleen door de systeemrol).
- Tests: `tests/eenheid/terminal-opdrachten-20261022.test.ts`, `tests/eenheid/apparaat-inrichten-20261022.test.ts`; stand `terminal-*`.
