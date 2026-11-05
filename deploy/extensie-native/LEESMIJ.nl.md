> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./LEESMIJ.uk.md) · **🇳🇱 Nederlands** ([origineel](./LEESMIJ.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Lokale agent voor de extensie «Mijn Ruimte» (0.5.0)

Optioneel **tweede kanaal** tussen de browserextensie en een AI-agent op **uw eigen computer** (Claude Desktop of
Claude Code via MCP stdio). Het hoofdkanaal verandert niet: een beveiligde WebSocket via de server `mcp.tarasevych.com`.

```
Claude Desktop / Claude Code ⇄ mr-native-mcp.mjs ⇄ lokale socket (alleen u) ⇄ mr-native-host.mjs ⇄ Chrome Native Messaging ⇄ extensie
```

## Wat hij doet

- Geeft een lokale AI **alleen-lezen** toegang tot pagina's van «Mijn Ruimte» die in uw browser geopend zijn. Zes hulpmiddelen:

  | MCP-hulpmiddel     | Extensie-opdracht      | Wat het teruggeeft |
  |--------------------|------------------------|--------------------|
  | `lokaal_status`    | `browser.self_test`    | status van de extensie (vergrendeld/ontgrendeld, tot wanneer, rechten) en zelftest |
  | `lokaal_snapshot`  | `browser.snapshot`     | adres (zonder query), titel, zichtbare tekst, namen van elementen |
  | `lokaal_diagnose`  | `browser.diagnostics`  | JavaScript-fouten, consolemeldingen, mislukte verzoeken, basismetrieken |
  | `lokaal_console`   | `browser.console`      | laatste consoleberichten (`types`: error, warn, log, info, debug) |
  | `lokaal_netwerk`   | `browser.network`      | laatste verzoeken: methode, adres zonder query, status, duur (`failed_only`) |
  | `lokaal_audit`     | `browser.audit`        | prestaties, beveiligingsbevindingen, DOM-structuur (`soort`: alles, prestaties, beveiliging, dom) |

- Werkt **uitsluitend** na ontgrendeling op de site met uw passkey en het vinkje **«lokale agent»**, en alleen tot het einde van de gekozen tijdsduur
  (of tot vergrendeling, einde van de technische activering, uitloggen of herstarten van de browser). Na vergrendeling sluit de extensie het kanaal,
  stopt Chrome de host en wordt het token verwijderd.
- De pagina-inhoud in antwoorden is gemarkeerd als **onvertrouwde gegevens** (`<untrusted-data …>`): het zijn gegevens, nooit instructies.

## Wat hij nooit doet

- Klikt nooit, typt nooit, navigeert niet naar adressen, maakt geen schermafbeeldingen en schakelt de debugger niet in — uitsluitend 6 leesopdrachten
  (witte lijst in zowel de host als de extensie; de extensie controleert nogmaals de ontgrendeling, het recht `browser.read`, de domeinen en het account).
- Geeft nooit sleutels, tokens, cookies, veldwaarden, wachtwoorden of querystrings door. Naar de host gaan alleen `{staat, exp, caps}`.
- Opent geen netwerkpoorten: alleen een named pipe `\\.\pipe\mijn-ruimte-extensie-<gebruiker>` (Windows) of een unix-socket
  `$XDG_RUNTIME_DIR/mijn-ruimte-extensie.sock` of `~/.mijn-ruimte/extensie.sock` met rechten `0600`.
- Laat geen vreemden toe: de client moet via HMAC bewijzen dat hij het token uit `~/.mijn-ruimte/extensie-token` kent (32 willekeurige bytes, nieuw bij elke
  start van de host, bestand alleen voor u leesbaar); het token zelf gaat nooit over de socket, en ook de host bewijst dat hij het token kent.
  Slechts één client tegelijk, één opdracht tegelijk, maximaal 30 opdrachten per minuut, time-out van 30 s, berichten tot 1 MB.
- Schrijft niets van pagina's naar logboeken: de host en de MCP-server loggen op `stderr` alleen het opdrachttype, ok/fout en de duur.

## Installatie

Vereist: Node.js 18+ en de extensie «Mijn Ruimte» 0.5.0 (id `ofpffonakgjioahgfejmiblfmbkobmmi`).

### Windows (zonder beheerdersrechten)

```powershell
cd <map met deze bestanden>
powershell -ExecutionPolicy Bypass -File .\installeer-windows.ps1 -ClaudeDesktop
```

Het script zoekt `node.exe` (of gebruik `-NodePad 'C:\pad\node.exe'`), kopieert de bestanden naar `%LOCALAPPDATA%\MijnRuimte\extensie-native`,
maakt `mr-native-host.cmd` en `com.tarasevych.mijnruimte.json` aan, registreert de host onder
`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.tarasevych.mijnruimte` (en ook voor Edge en Chromium), beperkt de toegang tot
`%USERPROFILE%\.mijn-ruimte` (alleen u en SYSTEM) en voegt met `-ClaudeDesktop` de server toe aan `%APPDATA%\Claude\claude_desktop_config.json`
(met een `.bak`-kopie). Zonder `-ClaudeDesktop` toont het alleen wat u moet invullen.

Verwijderen: `powershell -ExecutionPolicy Bypass -File .\verwijder-windows.ps1 -ClaudeDesktop`

### Linux / macOS

```sh
sh installeer-unix.sh            # of: sh installeer-unix.sh --node /opt/node/bin/node
```

Linux: bestanden in `~/.local/share/mijn-ruimte/extensie-native`, manifest in `~/.config/google-chrome/NativeMessagingHosts`
(en `chromium`, `microsoft-edge`, Brave, indien aanwezig). macOS: `~/Library/Application Support/MijnRuimte/extensie-native` en
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts` (en Chromium, Edge, Brave). Verwijderen: `sh verwijder-unix.sh`.

### Na installatie

1. Herstart de browser.
2. Schakel in de instellingen van de extensie **«Native berichten»** in (Chrome vraagt om de toestemming `nativeMessaging`).
3. Op de site: technisch profiel actief → «Extensie ontgrendelen» → vink **«lokale agent»** aan → bevestig met passkey.
4. In Claude moet `lokaal_status` nu `"staat": "ontgrendeld"` tonen.

## MCP-configuratie

**Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json` (Windows) of
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "mijn-ruimte-lokaal": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\<u >\\AppData\\Local\\MijnRuimte\\extensie-native\\mr-native-mcp.mjs"]
    }
  }
}
```

**Claude Code**:

```sh
# Windows (PowerShell):
claude mcp add mijn-ruimte-lokaal -- "C:\Program Files\nodejs\node.exe" "$env:LOCALAPPDATA\MijnRuimte\extensie-native\mr-native-mcp.mjs"
# Linux/macOS:
claude mcp add mijn-ruimte-lokaal -- node ~/.local/share/mijn-ruimte/extensie-native/mr-native-mcp.mjs
```

De installer drukt deze regels af met de exacte paden op uw computer.

## Als het niet werkt

| Melding | Oorzaak / wat te doen |
|---|---|
| `GEEN_HOST` | de extensie heeft de host niet gestart: niet ontgrendeld met «lokale agent», «Native berichten» staat uit, of de host is niet geïnstalleerd (herstart de browser na installatie) |
| `EXTENSIE_VERGRENDELD` | de ontgrendelingstijd is verstreken of de toegang is ingetrokken — ontgrendel opnieuw op de site |
| `LOKAAL_GEWEIGERD` | opdracht staat niet op de witte lijst (de lokale agent kan alleen lezen) |
| `LOKAAL_TE_SNEL` / `LOKAAL_BEZIG` | meer dan 30 opdrachten per minuut / de vorige opdracht is nog bezig |
| `BEZET` | er is al een andere lokale agent verbonden, of de host draait al voor een andere browser of een ander profiel (slechts één tegelijk) |
| `HOST_ONECHT` | iets anders luistert op de socketnaam en kent het token niet — verbinding verbroken; controleer wie de pipe/socket heeft aangemaakt |

## Bestanden

- `mr-native-host.mjs` — Native Messaging-host (wordt gestart door Chrome; argument is de origin van de extensie, andere worden geweigerd).
- `mr-native-mcp.mjs` — MCP-server via stdio (JSON-RPC 2.0, protocol 2025-06-18; ook 2025-11-25 en 2025-03-26).
- `mr-native-gemeen.mjs` — gedeelde code: framing, paden, token, wederzijdse authenticatie.
- `com.tarasevych.mijnruimte.json` — sjabloon voor het hostmanifest (`allowed_origins` exact `chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi/`).
- `installeer-windows.ps1`, `verwijder-windows.ps1`, `installeer-unix.sh`, `verwijder-unix.sh`.
- In de extensie: `extension/native.js`. Test: `tests/eenheid/extensie-native.test.ts`.
