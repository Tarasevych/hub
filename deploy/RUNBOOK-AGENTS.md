> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./RUNBOOK-AGENTS.uk.md) · [🇳🇱 **Nederlandse versie**](./RUNBOOK-AGENTS.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# Runbook: Local Machine Connector (agents) uitrollen

Dit runbook rolt migratie `0009_agents.sql`, het WebSocket-kanaal `/agent/ws`, de API `/api/owner/agents/*` en het
scherm **Agenten** op `mcp.tarasevych.com` uit, met het gewone `deploy/installeer-app.sh`. Het is geschreven voor
een uitrol door de eigenaar, met een eerste test op een eigen apparaat.

Er zijn **geen nieuwe geheimen of omgevingsvariabelen**. Nieuw zijn: de tabellen `app.agents`, `app.agent_pairing_codes`,
`app.agent_commands`, de runtime-afhankelijkheid `ws` (komt via `npm ci` uit `package-lock.json`) en een tunnelregel.

**Volgorde:** (0) tarball maken op de pc → (1) controles op de VM → (2) app installeren → (3) app lokaal controleren →
(4) pas daarna de tunnel wijzigen → (5) test van begin tot eind → (6) zo nodig terugdraaien. De app gaat dus **vóór**
de tunnel live: zolang de tunnel niet is aangepast verandert er voor `mcp.*` niets (die host wijst nog naar de brug op 8091).

Rollback in één regel: app `installeer-app.sh terugdraaien`, tunnel `cp` van de back-up + `systemctl restart cloudflared`.
Migratie 0009 voegt alleen tabellen toe; de vorige release draait er ongestoord naast (zie §6).

---

## 0. Op de pc: tarball maken (alles op T:)

Alleen de **gecommitte** stand telt. Controleer eerst of de branch op GitHub staat en niets openstaat.

```powershell
cd T:\mijn-ruimte\ontwikkeling\hub
git status --short                       # moet leeg zijn
git log --oneline -3
git fetch origin; git status -sb         # "ahead 0"? anders eerst: git push origin feature/connectors-agent
```

```powershell
$sha   = git rev-parse HEAD
$kort  = git rev-parse --short HEAD
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$naam  = "mijn-ruimte-agents-$stamp-$kort.tar.gz"
$stage = "T:\mijn-ruimte\ontwikkeling\staging\$stamp"
New-Item -ItemType Directory -Force $stage | Out-Null
Set-Content -Path "$stage\BRON-COMMIT" -Value $sha -Encoding ascii -NoNewline
# Eén git archive: bewaart de uitvoerbare bits (.sh) en geeft geen binaire data via een PowerShell-pipe.
git archive --format=tar.gz --prefix=mijn-ruimte/ --add-file="$stage\BRON-COMMIT" -o "T:\mijn-ruimte\uitrol\$naam" HEAD
$hash = (Get-FileHash "T:\mijn-ruimte\uitrol\$naam" -Algorithm SHA256).Hash.ToLower()
"$hash  $naam" | Set-Content "T:\mijn-ruimte\uitrol\$naam.sha256" -Encoding ascii
$naam
```

`BRON-COMMIT` zorgt dat de release het juiste commit-label krijgt (zonder dat bestand wordt het "onbekend").
Controle vóór het versturen (optioneel): `tar -tvzf T:\mijn-ruimte\uitrol\$naam | Select-String 'installeer-app.sh$'`
moet `-rwxr-xr-x`/`-rwxrwxr-x` tonen. Maak het archief **niet** door het uit te pakken en opnieuw in te pakken op Windows:
dan gaan de uitvoerbare bits verloren.

Naar de VM (zoals bij de vorige uitrol):

```powershell
$sleutel = 'T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver'
scp -i $sleutel "T:\mijn-ruimte\uitrol\$naam" "T:\mijn-ruimte\uitrol\$naam.sha256" beheer@203.0.113.10:/tmp/
ssh -i $sleutel beheer@203.0.113.10
```

## 1. Op de VM: voorcontroles

```bash
cd /tmp && sha256sum -c mijn-ruimte-agents-*.tar.gz.sha256        # moet "OK" geven, anders STOP
sudo -i
/srv/mijn-ruimte/current/deploy/installeer-app.sh lijst           # noteer de actieve release = terugdraaipunt
node -v                                                           # >= v24
df -h /srv /var | tail -n +2                                      # genoeg ruimte (build ~1 GB)
free -m | head -2                                                 # de build gebruikt max. 3 GB (cgroup)
curl -sI https://registry.npmjs.org/ws | head -1                  # HTTP/2 200: npm ci moet 'ws' kunnen halen
bash /srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status   # rollen aanwezig, 'afdwingen=uit' of 'aan' (beide goed)
systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 12 --no-pager
```

Controleer dat de back-up zonder fout klaar is. `installeren` maakt er ook een vóór de migratie
(`ZONDER_BACKUP=1` slaat dat over; doe dat niet).

## 2. App installeren

```bash
mkdir -p /root/bron-agents && tar -xzf /tmp/mijn-ruimte-agents-*.tar.gz -C /root/bron-agents
bash /root/bron-agents/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-agents/mijn-ruimte
```

Wat er gebeurt (in deze volgorde): bron kopiëren → bouwen als gebruiker `mijnruimte` (`npm ci`, audits, vite,
server-bundel; enkele minuten) → back-up → migraties (`0009_agents` + `rechten.sql`) als `mijnruimte_migrator` →
`current` atomair omzetten → herstart → gezondheidscontrole. Mislukt die controle, dan draait het script **zelf terug**
naar de vorige release. Een mislukte build of migratie laat de actieve release ongemoeid.

Verwachte slotregel: `[installeer] klaar: release <stempel> (commit <sha>)`.

## 3. Controle van de app (nog zonder tunnel)

```bash
curl -s http://127.0.0.1:8080/__gezondheid ; echo                  # {"ok":true,"db":true}
journalctl -u mijn-ruimte -n 25 --no-pager                         # geen fouten; "luistert op http://127.0.0.1:8080"
sudo -u postgres psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1 desc limit 2"   # ...0009_agents
sudo -u postgres psql -d mijnruimte -Atc "select tablename||' '||tableowner from pg_tables where tablename like 'agent%' order by 1"
sudo -u postgres psql -d mijnruimte -Atc "select has_table_privilege('mijnruimte_app','app.agents','INSERT'), (select relrowsecurity from pg_class where oid='app.agents'::regclass)"   # t|t
```

Drie tabellen met eigenaar `mijnruimte_migrator`, `t|t` bij de laatste.

Het kanaal en de publieke route, rechtstreeks op de app (poort 8080, met de juiste Host-header):

```bash
H='Host: mcp.tarasevych.com'
# 1. ongeldige koppelcode -> 400 PAIRING_CODE_INVALID (route is publiek, maar weigert zonder geldige code)
curl -s -w ' %{http_code}\n' -X POST -H "$H" -H 'Content-Type: application/json' -d '{"code":"AAAAAAAA"}' http://127.0.0.1:8080/api/owner/agents/pair
# 2. WebSocket-upgrade -> HTTP/1.1 101 (curl wacht daarna; --max-time sluit af, exitcode 28 is normaal)
curl -s -i -N --max-time 3 -H "$H" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8080/agent/ws | head -1
# 3. onbekende host en onbekend pad -> geen upgrade
curl -s -i -N --max-time 3 -H 'Host: kwaad.example.com' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8080/agent/ws | head -1
curl -s -i -N --max-time 3 -H "$H" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8080/agent/anders | head -1
# 4. zonder sessie geen toegang tot de beheerroutes
curl -s -w ' %{http_code}\n' -X POST -H "$H" -H 'Origin: https://mcp.tarasevych.com' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8080/api/owner/agents/list
```

Verwacht: (1) `{"error":"PAIRING_CODE_INVALID"} 400`; (2) `HTTP/1.1 101 Switching Protocols`; (3) `HTTP/1.1 404 Not Found`
twee keer; (4) 401 of 403, nooit 200.

Als iets hier niet klopt: **niet** verder naar de tunnel. Terugdraaien (§6) of eerst de oorzaak vinden.

## 4. Tunnel: `mcp.tarasevych.com` op pad splitsen

Waarom: de hostnaam `mcp.` heeft de rol "MCP-instellingen, agenten, sleutels en tools". Nu wijst hij helemaal naar de
alleen-lezen MCP-brug (poort 8091). Na de splitsing blijven de deuren van de brug daar, en gaat al het andere
(schermen, `/api/*`, WSS `/agent/ws`) naar de hoofdapp (8080).

> **Stand 2026-10-06:** op de VM is deze splitsing al actief (back-ups: `config.yml.bak-mcp`, `config.yml.bak-mcp-ui`).
> Een eerste versie matchte `Grok` alleen met een hoofdletter, waardoor `/grok` bij de app (200, SPA) uitkwam in plaats
> van bij de brug. Dat is om 21:37 hoofdletterongevoelig gemaakt (back-up `config.yml.voor-hoofdletters-20261006-213725`)
> en na de herstart publiek gecontroleerd: `/Grok` en `/grok` -> 401 (brug), `/agents` -> 200, WSS `/agent/ws` -> 4401.
> Gebruik dit hoofdstuk daarom vooral om te **controleren** (en bij een nieuwe VM om in te richten).

**Pas dit pas toe nadat §3 groen is, en bekijk eerst uw echte `/etc/cloudflared/config.yml`:** het sjabloon in de
repo is niet per se gelijk aan de live-configuratie.

```bash
cp -a /etc/cloudflared/config.yml /etc/cloudflared/config.yml.voor-agents-$(date +%F)
grep -n -B1 -A3 'mcp' /etc/cloudflared/config.yml        # huidige regel(s) voor mcp.tarasevych.com
```

De bestaande `mcp.tarasevych.com`-regel (naar `http://127.0.0.1:8091`) vervangt u door **deze twee, in deze volgorde**,
vóór de afsluitende `http_status:404`:

```yaml
  - hostname: mcp.tarasevych.com
    path: ^/((?i:grok|claude|chatgpt|gemini|copilot)|oauth|health|\.well-known)(/|$)
    service: http://127.0.0.1:8091
  - hostname: mcp.tarasevych.com
    service: http://127.0.0.1:8080
```

Controleer **zonder iets te herstarten** welke regel elk pad krijgt. De uitvoer noemt de gevonden regel en de dienst:

```bash
CF='cloudflared tunnel --config /etc/cloudflared/config.yml ingress'
$CF validate                                                    # "OK"
for p in Grok grok claude chatgpt gemini copilot health oauth/token oauth/authorize .well-known/oauth-authorization-server .well-known/oauth-protected-resource; do
  printf '%-52s ' "/$p"; $CF rule "https://mcp.tarasevych.com/$p" | grep -E '^Matched|service' | tr '\n' ' '; echo
done
echo ---; for p in '' overview agents access connect tools api/owner/agents/pair api/owner/agents/list agent/ws assets/index.js; do
  printf '%-52s ' "/$p"; $CF rule "https://mcp.tarasevych.com/$p" | grep -E '^Matched|service' | tr '\n' ' '; echo
done
```

| Pad | Moet naar |
|---|---|
| `/Grok`, `/grok`, `/claude`, `/chatgpt`, `/gemini`, `/copilot`, `/health`, `/oauth/*`, `/.well-known/*` | **8091** (brug) |
| `/`, `/overview`, `/agents`, `/access`, `/connect`, `/tools`, `/api/*`, `/agent/ws`, `/assets/*` | **8080** (hoofdapp) |

Eén pad naar de verkeerde poort of een fout bij `validate`: **niet herstarten**; pas de regex of de volgorde aan en herhaal.
(De regex is Go-RE2; alleen `cloudflared` zelf kan hem bevestigen, vandaar deze controle.)

Pas toe (alle hostnamen herverbinden kort, enkele seconden):

```bash
systemctl restart cloudflared && sleep 4
systemctl status cloudflared --no-pager | head -6
journalctl -u cloudflared -n 15 --no-pager | grep -iE 'registered|connection|error|ERR' | tail -8   # "Registered tunnel connection"
```

Terugdraaien van alleen de tunnel:

```bash
cp -a /etc/cloudflared/config.yml.voor-agents-<datum> /etc/cloudflared/config.yml && systemctl restart cloudflared
```

## 5. Test van begin tot eind

### 5a. Extern, via Cloudflare (nog op de VM; de verbinding loopt VM → Cloudflare → tunnel → VM)

```bash
# De brug werkt nog (poort 8091): /health, een deur zonder token = 401 met www-authenticate, OAuth-metadata
curl -s -w ' %{http_code}\n' https://mcp.tarasevych.com/health
curl -s -i https://mcp.tarasevych.com/Grok | sed -n '1p;/^www-authenticate/Ip'
curl -s -w ' %{http_code}\n' https://mcp.tarasevych.com/.well-known/oauth-authorization-server | tail -c 80
# De hoofdapp bereikbaar op dezelfde host
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://mcp.tarasevych.com/agents                  # 200 text/html
curl -s -w ' %{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{"code":"AAAAAAAA"}' https://mcp.tarasevych.com/api/owner/agents/pair   # PAIRING_CODE_INVALID 400
# WSS door de tunnel: "open", na ~5 s "close code=4401 reason=auth timeout", exit 0
node /srv/mijn-ruimte/current/deploy/agent/ws-check.mjs wss://mcp.tarasevych.com/agent/ws ; echo "exit=$?"
```

`/health` → `{"ok":true,"service":"mijn-ruimte-mcp"} 200`; `/Grok` → `401` met `www-authenticate: Bearer …`.
**Is de brug niet meer bereikbaar** (bijv. 404 of HTML van de SPA bij `/Grok`): de tunnelregel in §4 is verkeerd.
Direct terugzetten (§4, "Terugdraaien van alleen de tunnel") en Grok-toegang opnieuw controleren.

Dezelfde WSS-controle kan op de pc: `node T:\mijn-ruimte\ontwikkeling\hub\deploy\agent\ws-check.mjs` (met de
portable Node in `T:\mijn-ruimte\hulpmiddelen\node`).

### 5b. Het scherm en een echt apparaat (pc), alles op T:

1. Log in op `https://mcp.tarasevych.com/agents` als eigenaar. Verwacht: scherm **Agenten** met het blok
   *Mijn apparaten*, lijst leeg.
2. Op de pc: testmap en een eigen config, **niets op C:**. Begin met de lokale beveiligingstest van de agent
   (16 controles: uitbreken met `..`, absoluut pad, naastgelegen map met dezelfde prefix, symlink/junction,
   allow-list, groottelimieten; ruimt zichzelf op):

   ```powershell
   . T:\mijn-ruimte\hulpmiddelen\node\env.ps1
   $t = 'T:\mijn-ruimte\ontwikkeling\agent-test'
   New-Item -ItemType Directory -Force $t | Out-Null
   Copy-Item T:\mijn-ruimte\ontwikkeling\hub\deploy\agent\agent.mjs $t\agent.mjs
   node $t\agent.mjs selftest --root $t                    # moet eindigen met "alles OK" en exit 0
   $env:HUB_AGENT_CONFIG = "$t\agent-config.json"        # standaard zou dit onder C:\Users\... komen
   ```
3. In de UI: **+ Pc of virtuele machine koppelen** → code verschijnt (10 min). Op de pc:

   ```powershell
   node $t\agent.mjs pair --server https://mcp.tarasevych.com --code <CODE> --name "Test-pc" --root $t --allow node,git
   node $t\agent.mjs run
   ```
   Verwacht: `Paired. …` en daarna `[agent] connected as <id>`. In de UI springt het apparaat binnen ~4 s op **Connected**.
   Het configuratiebestand bevat het agenttoken: laat het in `$t`, deel het niet.
4. **Verbinding testen** → *Laatste actie* wordt `sys.info · succeeded` met hostnaam, platform en uw map (leesopdracht, direct).
   *Agent 0.2.0:* extra opdrachten `sys.metrics` (direct), `docker.ps` (direct, vereist `--allow docker`) en `docker.manage` (altijd goedkeuring); migratie 0011 breidt het CHECK-type uit.
5. **Test goedkeuring** → onder *Wachten op uw goedkeuring* verschijnt `fs.write` met pad `hub-agent-test.txt`.
   Eerst **Weigeren** (herhaal stap 5 om opnieuw een verzoek te krijgen): status `rejected`, geen bestand.
   Dan **Toestaan**: status `succeeded` en `T:\mijn-ruimte\ontwikkeling\agent-test\hub-agent-test.txt` bestaat.
   Als `failed` met een fout over schrijfrechten: de Windows-bescherming op T: blokkeert `node.exe`; dat is de beveiliging,
   geen fout in de app.
6. **Herstart**: `systemctl restart mijn-ruimte` op de VM. De agent meldt `[agent] disconnected (<code>), retry in 1s`
   (de wachttijd loopt op tot 30 s) en verbindt daarna zelf opnieuw; de UI toont kort Disconnected en dan weer Connected.
7. **Intrekken**: klik **Intrekken**. De agent meldt `токен відкликано або недійсний. Виконайте pair заново.` en stopt.
   Het apparaat verdwijnt uit de lijst. Start `node $t\agent.mjs run` nogmaals: hetzelfde bericht (de server sluit met 4403).
8. **Limiet**: vraag 6 koppelcodes binnen 10 minuten aan; de 6e geeft de melding over de limiet (5 per 10 minuten per gebruiker).

Uitbreken uit de map kan de UI niet uitlokken (de knoppen sturen vaste, veilige opdrachten); dat dekt de `selftest` in stap 2.
De AI-tools (`machine_*`) zijn onder een sessie bereikbaar via `/api/owner/agents/tools/call`, maar hebben nog geen scherm.

### 5c. Controle op de VM na de test

```bash
journalctl -u mijn-ruimte --since '-30 min' --no-pager | grep -iE 'agent|upgrade|error' | tail -15
sudo -u postgres psql -d mijnruimte -Atc "select name, status, platform, revoked_at is not null as ingetrokken from app.agents order by created_at"
sudo -u postgres psql -d mijnruimte -Atc "select type, status, to_char(created_at,'HH24:MI:SS') from app.agent_commands order by created_at desc limit 8"
```

Het audit-spoor (`owner.agent.paired`, `owner.agent.command`, `.approved`, `.rejected`, `.revoked`) staat in de beheer-auditweergave.

## 6. Terugdraaien

| Wat | Hoe | Opmerking |
|---|---|---|
| Alleen de tunnel | `cp -a /etc/cloudflared/config.yml.voor-agents-<datum> /etc/cloudflared/config.yml && systemctl restart cloudflared` | `mcp.*` wijst weer volledig naar 8091 |
| De app | `/srv/mijn-ruimte/current/deploy/installeer-app.sh terugdraaien` | Migraties worden niet teruggedraaid; 0009 voegt alleen tabellen toe, de vorige release negeert ze |
| Eén apparaat | UI → Intrekken | Token onmiddellijk ongeldig, verbinding wordt gesloten |
| Alle agents uitzetten | `UPDATE app.agents SET revoked_at = now()` als `mijnruimte_system`; daarna `systemctl restart mijn-ruimte` | Nodig bij een verdenking van een gelekt token |
| Tabellen verwijderen | Alleen op expliciet verzoek, als `mijnruimte_migrator`: `DROP TABLE app.agent_commands, app.agents, app.agent_pairing_codes` | Verwijder dan ook de regel `0009_agents` uit `app.schema_migrations`, anders wordt hij niet opnieuw aangemaakt |

## 7. Bekende beperkingen

- De WebSocket-verbindingen leven in het geheugen van **één** app-proces (zoals nu). Meer processen vragen LISTEN/NOTIFY.
- Cloudflare breekt HTTP-verzoeken na 100 s af. Wachten op goedkeuring door een AI-tool duurt daarom maximaal 60 s; daarna
  meldt de tool dat er een goedkeuring openstaat. De WebSocket zelf is niet beperkt.
- Op Windows kunnen `.cmd`-scripts (`npm`, `npx`) niet zonder shell worden gestart; sta alleen `node`, `git`, `python` toe.
- Niet in deze uitrol: OAuth-koppelingen (Gmail, Notion, Slack, …) en token-refresh. Google loopt via de bestaande grants.
- De AI-tools (`machine_*`, `github_get`) zijn bereikbaar via `/api/owner/agents/tools/*` onder een sessie; externe
  MCP-clients (Grok enz.) krijgen ze nog niet. Dat vraagt eigen toegangstokens.

## 8. Afvinklijst

- [ ] Tarball gemaakt, sha256 op de VM `OK`
- [ ] Back-up vóór de uitrol gelukt
- [ ] `installeren` klaar, `0009_agents` in `schema_migrations`
- [ ] §3: 400 / 101 / 404 / 404 / 401-of-403
- [ ] Tunnelconfig gekopieerd, `validate` OK, alle paden in de tabel naar de juiste poort
- [ ] §5a: `/health` 200, `/Grok` 401, `/agents` 200, WSS `4401` en exit 0
- [ ] §5b: `selftest` alles OK, pairing, Connected, `sys.info`, weigeren, toestaan, herstart, intrekken, limiet
- [ ] Grok-toegang tot de brug nog werkend (de bestaande werkwijze)
