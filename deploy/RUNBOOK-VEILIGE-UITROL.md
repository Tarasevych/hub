# Runbook: beheer op afstand zonder pad van de app naar root (drie methoden, één sleutel)

Stand: 2026-10-08, branch `veilig-agenten-0.4`. Vervangt de oude "deur" (`mijn-ruimte-mcp-doen` + sudo-regel + `patch-*.py`-lader).

## 0. De drie methoden en hoe ze samenhangen

Een AI (Grok, Claude, een agent) of jij zelf kan de server op afstand beheren, maar **niets** wat de app (gebruiker `mijnruimte`)
kan schrijven, wordt ooit als root uitgevoerd. Nieuwe code komt er alleen in als die met **jouw** ed25519-sleutel
(`T:\mijn-ruimte\geheim\uitrol-sleutel`, met wachtwoordzin) is ondertekend.

| | Methode 1: GitOps-pull | Methode 2: ondertekend pakket | Methode 3: gepantserde opdracht |
|---|---|---|---|
| Wie start | root-timer op de VM, elke 5 min | path-unit zodra er een pakket in de inbox ligt | de app: `systemctl start mijn-ruimte-opdracht@<werkwoord>.service` |
| Invoer | ondertekende tag `uitrol-JJJJMMDD-UUMM` in GitHub | `mijn-ruimte-<versie>.tar.gz` + `.sig` (via Grok of SSH) | één werkwoord uit een vaste lijst |
| Controle | `git verify-tag` (gpg.format=ssh) met `/etc/mijn-ruimte/uitrol-ondertekenaars` | `ssh-keygen -Y verify` met hetzelfde bestand | polkit (alleen 5 units, alleen `start`) + het root-script |
| Kan nieuwe code installeren | ja, alleen ondertekend | ja, alleen ondertekend | **nee**; `uitrol-nu` start alleen methode 1 en 2 |
| Schakelaar | `"gitops"` (standaard uit) | `"uitrol"` (standaard uit) | `"opdracht": {…}` per werkwoord |
| Script (root) | `/usr/local/sbin/mijn-ruimte-gitops` | `/usr/local/sbin/mijn-ruimte-uitrol` | `/usr/local/sbin/mijn-ruimte-opdracht` |

Alle schakelaars staan in **één root-bestand**: `/etc/mijn-ruimte/mcp-rechten.json` (`root:mijnruimte 0640`; de app kan het lezen, niet wijzigen).
Alle uitkomsten staan in `/var/lib/mijn-ruimte-uitrol-status/` (`root:mijnruimte 0750`): `status.json` (methode 2), `gitops.json` (methode 1),
`opdracht-<werkwoord>.json` (methode 3) en `gebeurtenissen.jsonl`. De app neemt `gebeurtenissen.jsonl` elke 5 minuten op in de audit
(actie `server.gitops.*` / `server.opdracht.*`); root leest nooit iets terug van de app.

```
PC eigenaar: uitrol-sleutel (T:\mijn-ruimte\geheim, wachtwoordzin via ssh-agent)
 ├─ scripts\onderteken-uitrol.ps1 → git tag -s uitrol-… → GitHub ──(alleen-lezen deploy key)──► mijn-ruimte-gitops.timer (root)
 │                                                                                                 verify-tag → git archive → installeer-app.sh
 └─ deploy\uitrol\maak-uitrolpakket.ps1 → pakket + .sig → Grok/SSH → uitrol-inbox ─────────────────► mijn-ruimte-uitrol.path (root)
                                                                                                   ssh-keygen -Y verify → installeer-app.sh
Site/agent (mijnruimte, NoNewPrivileges=yes) ── systemctl start mijn-ruimte-opdracht@{status|releases|backup|uitrol-nu|terugdraaien}
                                               └─ polkit: alleen deze 5 units ─► mijn-ruimte-opdracht (root, vaste lijst, geen invoer)
```

**Wat een aanvaller met volledige controle over de app wél kan:** de vijf opdrachten starten (voor zover aan): status lezen, een back-up
starten (die draait als `mijnruimte`), een controle op ondertekende releases starten, en (alleen als `"terugdraaien": true`) hooguit één keer
per 10 minuten terug naar de vorige, al geïnstalleerde release. Dat is hooguit hinder of een terugrol naar eerdere eigen code, **nooit eigen
code als root**. Daarom staat `terugdraaien` standaard uit. polkit kan de app en de MCP-deur niet uit elkaar houden (beide draaien als
`mijnruimte`); de deur gebruikt de opdrachten niet, maar de grens is dezelfde.

**Aanvulling (branch `passkey-schvalennya`): methode 2b, goedkeuren met de passkey van de eigenaar.** Naast methode 2 (pakket ondertekend
op de PC) kan een voorbereider (agent of account met een tijdelijke grant) een **onondertekend** pakket uploaden; het wordt pas geïnstalleerd
als de eigenaar het op zijn telefoon met een passkey goedkeurt, en root controleert die passkey-handtekening zelf. Zie §13. Schakelaar
`"passkey-goedkeuring"` (standaard `false`). Methode 2 blijft ongewijzigd werken.

## 1. Wat er veranderd is ten opzichte van de oude deur (en waarom)

| Vroeger (audit C1/C3/C4) | Nu |
|---|---|
| `mijnruimte ALL=(root) NOPASSWD: /usr/local/sbin/mijn-ruimte-mcp-doen *` | **geen sudo-regel**; de installer zet een oude regel in quarantaine en waarschuwt als er nog een NOPASSWD-regel voor `mijnruimte` staat |
| root-hulp met werkwoorden die gestagede code uitvoerden (`kit`, `povnyj-arkhiv`, `patch-*.py` via runpy) | **geen enkel werkwoord**; de MCP-dienst kan alleen een pakket + losse handtekening in een inbox zetten |
| toestemmingen in `/srv/data/uploads/mcp-permissions.json` (schrijfbaar voor de app) | `/etc/mijn-ruimte/mcp-rechten.json`, eigendom van root (`root:mijnruimte 0640`); alleen via SSH te wijzigen |
| drop-in `mijn-ruimte-mcp.service.d/write.conf` met `NoNewPrivileges=no` | weg; de unit heeft `NoNewPrivileges=yes`, `RestrictSUIDSGID=yes`; de drop-in gaat bij het installeren naar quarantaine |
| archief deels leesbaar (code, units, sudoers, git) in een app-map | **hele archief age-versleuteld**, in een root-map, vaste naam, download alleen door de eigenaar na step-up via een eenmalige id |
| beheer via `sudo` vanuit de app | **methode 3**: polkit + `mijn-ruimte-opdracht@.service`, app houdt `NoNewPrivileges=yes` |
| geen automatische uitrol uit git | **methode 1**: root-timer, alleen ondertekende tags, alleen-lezen deploy key |
| OAuth-tokens van de deur in klare tekst, vaste client `grok`, 30 dagen | alleen sha256-hashes, toegang 1 uur, refresh 14 dagen met rotatie + hergebruikdetectie, `/oauth/revoke`, DCR met unieke client-id |

## 2. Eenmalig: ondertekeningssleutel maken op Windows (`T:\mijn-ruimte\geheim\uitrol-sleutel`)

PowerShell (gewone gebruiker):

```powershell
New-Item -ItemType Directory -Force T:\mijn-ruimte\geheim | Out-Null
ssh-keygen -t ed25519 -a 100 -C "uitrol@mijn-ruimte" -f T:\mijn-ruimte\geheim\uitrol-sleutel
#   → vraagt twee keer een wachtwoordzin: kies een lange (≥ 5 woorden), bewaar die in je wachtwoordbeheerder, NIET op T:\
Get-Content T:\mijn-ruimte\geheim\uitrol-sleutel.pub
```

Eenmalig de Windows-ssh-agent aanzetten (PowerShell **als beheerder**), zodat de wachtwoordzin per sessie maar één keer nodig is:

```powershell
Set-Service ssh-agent -StartupType Manual
Start-Service ssh-agent
```

- `uitrol-sleutel` (privé) blijft op T:\ en gaat nooit naar de VM, naar Grok, naar GitHub of in een repo. Haal de wachtwoordzin er nooit af.
- Maak een tweede kopie van `T:\mijn-ruimte\geheim` op een offline schijf (zelfde wachtwoordzin).
- Leg `UITLEG-LEESMIJ.txt` naast de sleutel: de tekst staat in `deploy/pc-uitleg/T-geheim-uitrol-sleutel-UITLEG-LEESMIJ.txt` (Oekraïens, daarna Nederlands).
- Een oude sleutel op `T:\mijn-ruimte-uitrol\uitrolsleutel` mag blijven werken (zelfde publieke sleutel op de VM) of je maakt een nieuwe en
  vervangt de regel op de VM (§10).

## 3. Eenmalig op de VM (via SSH, als root)

```bash
# 1. publieke sleutel als enige ondertekenaar, voor pakketten (mijn-ruimte-uitrol) EN tags (git)
install -d -o root -g root -m 0755 /etc/mijn-ruimte
printf 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol,git" %s\n' 'ssh-ed25519 AAAA…' > /etc/mijn-ruimte/uitrol-ondertekenaars
chown root:root /etc/mijn-ruimte/uitrol-ondertekenaars && chmod 0644 /etc/mijn-ruimte/uitrol-ondertekenaars
#    (alleen "ssh-ed25519 AAAA…" uit uitrol-sleutel.pub; het commentaar mag weg)

# 2. polkit aanwezig? (Ubuntu 24.04: polkitd 124 met JavaScript-regels)
pkaction --version || apt install -y polkitd
```

`installeer-app.sh installeren` zet daarna zelf neer: de drie root-scripts, de units (`mijn-ruimte-uitrol.{path,service}`,
`mijn-ruimte-gitops.{service,timer}`, `mijn-ruimte-opdracht@.service`), de polkit-regel
`/etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules`, de root-kopie `/usr/local/sbin/mijn-ruimte-installeer`, de mappen
(`/var/lib/mijn-ruimte/{gitops,opdracht}` root 0700) en een standaard `mcp-rechten.json`. De ondertekenaarslijst, `gitops.env` en de
schakelaars komen **nooit** uit een pakket of tag.

Na het bouwen haalt de installer `deploy/` opnieuw uit de (gecontroleerde) bron: wat een npm-script tijdens de build in `deploy/` zou wijzigen,
wordt nooit als root-script, unit of polkit-regel geïnstalleerd.

### Controleren dat het oude root-pad weg is

```bash
ls -l /etc/sudoers.d/                         # geen mijn-ruimte-mcp (en geen mijn-ruimte-opdracht: polkit, geen sudo)
sudo -l -U mijnruimte                         # "is not allowed to run sudo"
ls /usr/local/sbin/ | grep -E 'mcp-doen|povnyj' || echo "weg"
systemctl cat mijn-ruimte-mcp.service | grep -E 'NoNewPrivileges'   # alleen NoNewPrivileges=yes, geen drop-in write.conf
ls -A /srv/mijn-ruimte/mcp-staging 2>/dev/null || echo "staging weg"
ls -ld /var/lib/mijn-ruimte-quarantaine/*     # wat de installer heeft weggezet (bewijsmateriaal; niet wissen vóór het onderzoek)
```

`oude_deur_opruimen` verplaatst `/etc/sudoers.d/mijn-ruimte-mcp`, `/usr/local/sbin/mijn-ruimte-mcp-doen`, `/usr/local/sbin/mijn-ruimte-povnyj-arkhiv`,
de drop-in `/etc/systemd/system/mijn-ruimte-mcp.service.d/write.conf` (`NoNewPrivileges=no`), `/srv/mijn-ruimte/mcp-staging` en de oude
app-schrijfbare schakelaars naar `/var/lib/mijn-ruimte-quarantaine/<tijd>/` (root 0700) en doet `daemon-reload`.

## 4. Methode 1: GitOps-pull (ondertekende tags uit GitHub)

### 4.1 Alleen-lezen toegang tot GitHub (nooit je persoonlijke token)

**Voorkeur: deploy key** (alleen deze repository, alleen lezen):

```bash
# op de VM, als root; zonder wachtwoordzin (de timer draait onbeheerd), maar alleen leesrecht op één repository
ssh-keygen -t ed25519 -N '' -C 'gitops@mijn-ruimte (alleen lezen)' -f /etc/mijn-ruimte/gitops-deploykey
chown root:root /etc/mijn-ruimte/gitops-deploykey*; chmod 0600 /etc/mijn-ruimte/gitops-deploykey; chmod 0644 /etc/mijn-ruimte/gitops-deploykey.pub
cat /etc/mijn-ruimte/gitops-deploykey.pub
```

GitHub → repository **Tarasevych/hub** → *Settings* → *Deploy keys* → *Add deploy key*: titel `mijn-ruimte VM (alleen lezen)`, plak de `.pub`,
laat **"Allow write access" UIT**. Daarna:

```bash
cat > /etc/mijn-ruimte/gitops.env <<'EOT'
GITOPS_REPO=git@github.com:Tarasevych/hub.git
GITOPS_SSH_SLEUTEL=/etc/mijn-ruimte/gitops-deploykey
EOT
chown root:root /etc/mijn-ruimte/gitops.env && chmod 0600 /etc/mijn-ruimte/gitops.env
```

`/etc/mijn-ruimte/gitops-known_hosts` (hostsleutels van github.com) zet de installer neer; vingerafdruk Ed25519
`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` (zie GitHub-documentatie "GitHub's SSH key fingerprints").

**Alternatief: fine-grained token** (GitHub → *Settings* → *Developer settings* → *Fine-grained tokens*): *Resource owner* Tarasevych,
*Repository access* → **Only select repositories** → `hub`, *Permissions* → *Repository* → **Contents: Read-only** (Metadata: read gaat vanzelf),
vervaldatum ≤ 1 jaar. In `gitops.env`:

```
GITOPS_REPO=https://github.com/Tarasevych/hub.git
GITOPS_TOKEN=github_pat_…
```

Het token gaat via de omgeving naar git (niet zichtbaar in `ps`), alleen naar github.com. `gitops.env` wordt niet als shell uitgevoerd: alleen
de drie sleutels hierboven worden gelezen; root 0600 is verplicht, anders weigert het script.

### 4.2 Aanzetten en controleren

```bash
# in /etc/mijn-ruimte/mcp-rechten.json: "gitops": true   (zie §7)
systemctl enable --now mijn-ruimte-gitops.timer
systemctl start mijn-ruimte-gitops.service            # meteen één ronde
journalctl -u mijn-ruimte-gitops -n 30
cat /var/lib/mijn-ruimte-uitrol-status/gitops.json
```

Bij het eerste installeren schrijft de installer `/var/lib/mijn-ruimte/gitops/laatste-tag` = `uitrol-<nu in UTC>`: alleen tags die daarna
gemaakt zijn, komen in aanmerking.

### 4.3 Een tag ondertekenen en pushen (PC)

```powershell
cd C:\pad\naar\repo      # schone checkout op de commit die je wilt uitrollen
powershell -ExecutionPolicy Bypass -File scripts\onderteken-uitrol.ps1            # of: -Ref <commit>  -ZonderPush
```

Het script: controleert de werkmap, laat `ssh-add -t 600` om de wachtwoordzin vragen (het script ziet of bewaart hem nooit), maakt
`git tag -s uitrol-JJJJMMDD-UUMM` (UTC) met `gpg.format=ssh`, controleert de handtekening zelf met `verify-tag`, pusht de tag met
je eigen git-toegang op de pc en haalt de sleutel weer uit de agent.

Handmatig kan ook:

```powershell
ssh-add -t 600 T:\mijn-ruimte\geheim\uitrol-sleutel
$tag = 'uitrol-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm')
git -c gpg.format=ssh -c user.signingkey=T:\mijn-ruimte\geheim\uitrol-sleutel.pub -c gpg.ssh.program=C:\Windows\System32\OpenSSH\ssh-keygen.exe tag -s $tag -m "Uitrol $tag"
git push origin "refs/tags/${tag}:refs/tags/${tag}"
```

### 4.4 Wat de server controleert

1. alleen refs `refs/tags/uitrol-*` worden opgehaald (kale spiegel in `/var/lib/mijn-ruimte/gitops`, hooks uit, `transfer.fsckObjects`,
   alleen https/ssh);
2. kandidaten: `uitrol-JJJJMMDD-UUMM` **nieuwer** dan `laatste-tag`, nieuwste eerst;
3. geannoteerde tag; de naam **in** het ondertekende tag-object moet gelijk zijn aan de ref (een oude ondertekende tag kan niet onder een nieuwe
   naam worden teruggezet); doel is een commit;
4. `git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile=/etc/mijn-ruimte/uitrol-ondertekenaars verify-tag` moet
   `Good "git" signature for uitrol@mijn-ruimte` geven;
5. `git archive` van die commit → uitpakken in een root-map met het tarfile-filter `data`, alleen gewone bestanden en mappen;
6. `installeer-app.sh installeren` uit die bron. Mislukt dat, dan blijft de huidige release actief en wordt die tag niet opnieuw geprobeerd.

Codes (`gitops.json` en audit): `UIT`, `GEEN_SLEUTEL`, `ENV_RECHTEN`, `REPO_ONGELDIG`, `TOKEN_ONGELDIG`, `SLEUTEL_RECHTEN`, `KNOWN_HOSTS`,
`OPHALEN_MISLUKT`, `NIET_ONDERTEKEND`, `NAAM_VERSCHILT`, `GEEN_COMMIT`, `HANDTEKENING_ONGELDIG`, `INHOUD_ONVEILIG`, `TE_GROOT`,
`GEEN_INSTALLER`, `INSTALLATIE_MISLUKT`, `GEEN_NIEUWE`, `OK`. Een geweigerde tag wordt één keer gemeld en daarna genegeerd.

## 5. Methode 2: ondertekend pakket (Grok of SSH)

### 5.1 Pakket maken (PC)

```powershell
cd C:\pad\naar\repo
powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 -Uit $env:USERPROFILE\Desktop
#   standaard -Sleutel T:\mijn-ruimte\geheim\uitrol-sleutel; vraagt de wachtwoordzin en controleert de handtekening zelf
```

Resultaat: `mijn-ruimte-<versie>.tar.gz`, `.tar.gz.sig`, `mijn-ruimte-<versie>.txt` (versie, bytes, sha256).

### 5.2 Uitrollen

**A. Via Grok (mcp.tarasevych.com)**, alleen als `"uitrol": true`:
1. Geef Grok het pakket, de `.sig`-tekst en de waarden uit `.txt`.
2. Grok roept `rollout_upload_begin {version, bytes, sha256}`, dan `rollout_upload_chunk` (stukken ≤ 512 KiB) en `rollout_upload_finish {version, signature}`.
3. `rollout_status` toont: `bezig` → `klaar` of `geweigerd`/`mislukt` met een code.
4. Zet daarna `"uitrol": false` terug (aanbevolen).

**B. Via SSH (zonder Grok)**:
```bash
scp mijn-ruimte-<versie>.tar.gz{,.sig} beheer@10.77.0.10:/tmp/
ssh beheer@10.77.0.10
sudo install -o mijnruimte -g mijnruimte -m 0640 /tmp/mijn-ruimte-<versie>.tar.gz{,.sig} /srv/mijn-ruimte/uitrol-inbox/
sudo -u mijnruimte touch /srv/mijn-ruimte/uitrol-inbox/aanvraag
journalctl -fu mijn-ruimte-uitrol.service
cat /var/lib/mijn-ruimte-uitrol-status/status.json
```

Statuscodes: `SIG_ONTBREEKT`, `HANDTEKENING_ONGELDIG`, `GEEN_SLEUTEL`, `INHOUD_ONVEILIG`, `VERSIE_VERSCHILT`, `NIET_NIEUWER`,
`TE_GROOT`, `GEEN_INSTALLER`, `INSTALLATIE_MISLUKT`. Een geweigerd pakket wordt uit de inbox verwijderd en nooit uitgevoerd.

## 6. Methode 3: gepantserde opdracht (polkit + `mijn-ruimte-opdracht@.service`)

| Werkwoord | Wat root doet | Standaard | Op de site |
|---|---|---|---|
| `status` | actieve/vorige release, stand van de diensten, laatste uitkomst van methode 1 en 2 | aan | eigenaar (alleen lezen) |
| `releases` | lijst van releases met commit | aan | eigenaar (alleen lezen) |
| `backup` | `systemctl start mijn-ruimte-backup.service` (draait als mijnruimte) | aan | eigenaar |
| `uitrol-nu` | `systemctl start mijn-ruimte-gitops.service` en `mijn-ruimte-uitrol.service` (installeren alleen ondertekende code) | aan | eigenaar + **step-up** |
| `terugdraaien` | `/usr/local/sbin/mijn-ruimte-installeer terugdraaien` (vorige release), hooguit 1× per 10 min | **uit** | eigenaar + **step-up** + bevestiging |

- Het script (`/usr/local/sbin/mijn-ruimte-opdracht`, root 0755) neemt precies één argument uit deze lijst, wist de hele omgeving, leest geen
  stdin en leest geen enkel bestand of map die de app kan schrijven (geen uploads, geen inbox, geen staging; een release die nog gebouwd wordt
  en dus van `mijnruimte` is, wordt overgeslagen). Uitkomst: `/var/lib/mijn-ruimte-uitrol-status/opdracht-<werkwoord>.json`.
- `terugdraaien` voert nooit iets uit `/srv/mijn-ruimte/…/deploy` uit, maar de root-kopie van de installer die bij het installeren
  (uit de gecontroleerde bron) naar `/usr/local/sbin/mijn-ruimte-installeer` is gezet. Stempel: `/var/lib/mijn-ruimte/opdracht/terugdraaien.stempel`.
- De polkit-regel `/etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules` geeft `mijnruimte` alleen `start` op precies die vijf units; elke
  andere systemd-actie van `mijnruimte` (stop, restart, enable, daemon-reload, set-environment, andere units) krijgt uitdrukkelijk **nee**.
- Op de site: MCP → kaart **Serverbeheer**. Voor agents: hulpmiddelen `server_status` en `server_releases` (alleen lezen); schrijvende opdrachten
  gaan nooit via een agenttoken, alleen via de site met step-up.

Controleren (als root, onder dezelfde beperkingen als de app):

```bash
systemd-run --uid=mijnruimte --gid=mijnruimte -p NoNewPrivileges=yes --pipe --wait \
  systemctl start --no-ask-password mijn-ruimte-opdracht@status.service && cat /var/lib/mijn-ruimte-uitrol-status/opdracht-status.json
systemd-run --uid=mijnruimte --gid=mijnruimte -p NoNewPrivileges=yes --pipe --wait \
  systemctl restart --no-ask-password ssh.service          # moet "Access denied" geven
journalctl -u 'mijn-ruimte-opdracht@*' -n 20
```

## 7. Schakelaars (aan/uit)

Alles in `/etc/mijn-ruimte/mcp-rechten.json` (root:mijnruimte 0640). Volledig voorbeeld met de standaardwaarden:

```json
{
  "read": true,
  "uitrol": false,
  "gitops": false,
  "passkey-goedkeuring": false,
  "opdracht": { "status": true, "releases": true, "backup": true, "uitrol-nu": true, "terugdraaien": false }
}
```

```bash
nano /etc/mijn-ruimte/mcp-rechten.json && python3 -m json.tool /etc/mijn-ruimte/mcp-rechten.json >/dev/null && echo geldig
chown root:mijnruimte /etc/mijn-ruimte/mcp-rechten.json && chmod 0640 /etc/mijn-ruimte/mcp-rechten.json
date +%s%3N > /etc/mijn-ruimte/mcp-intrekken      # alle sessies van de MCP-deur in één keer intrekken
```

Wijzigingen gelden meteen (de scripts lezen het bestand bij elke start). Is het bestand onleesbaar of niet van root, dan weigert methode 1 en
staat methode 3 alleen `status` en `releases` toe. Alles uit in één keer: `"uitrol": false, "gitops": false` en alle opdrachten `false`;
of `systemctl disable --now mijn-ruimte-gitops.timer mijn-ruimte-uitrol.path` en de polkit-regel weghalen.

## 8. Terugdraaien (rollback)

1. **Automatisch**: mislukt de gezondheidscontrole na het activeren, dan zet `installeer-app.sh` zelf de vorige release terug (methode 1 en 2).
2. **Via de site** (methode 3, als `"terugdraaien": true`): MCP → Serverbeheer → *Terug naar de vorige* (step-up + bevestiging; 1× per 10 minuten).
3. **Via SSH**:
   ```bash
   ssh beheer@10.77.0.10
   sudo /usr/local/sbin/mijn-ruimte-installeer terugdraaien              # vorige release
   sudo /usr/local/sbin/mijn-ruimte-installeer terugdraaien 20261008-193000   # of een genoemde release
   sudo /usr/local/sbin/mijn-ruimte-installeer lijst
   curl -fsS http://127.0.0.1:8080/__gezondheid
   ```

Een oudere versie opnieuw via een tag of pakket uitrollen kan niet (`NIET_NIEUWER` / niet nieuwer dan `laatste-tag`). Wil je oude code als nieuwe
release, onderteken dan een **nieuwe** tag op die oude commit (`onderteken-uitrol.ps1 -Ref <commit>`).
Databasemigraties zijn vooruit-only; bij een terugrol blijven nieuwe tabellen bestaan (ze zijn additief).

## 9. Waarom polkit en geen sudo (en de noodoplossing)

`sudo` werkt niet onder `NoNewPrivileges=yes` (setuid wordt genegeerd). Met sudo zou de app-dienst `NoNewPrivileges=no` nodig hebben, en daarmee
werkt elke setuid-binary weer voor een aanvaller in de app. Met polkit vraagt de app via D-Bus aan systemd (dat al root is) om een vaste unit te
starten; de app houdt `NoNewPrivileges=yes`, `RestrictSUIDSGID=yes` en een lege `CapabilityBoundingSet`. Ubuntu 24.04 heeft polkitd 124 met
JavaScript-regels, dus polkit is hier geschikt; de installer installeert **geen** sudo-regel.

Alleen als polkit op de VM echt niet bruikbaar is: `deploy/opdracht/mijn-ruimte-opdracht.sudoers` (exact vijf commando's met elk één vast
werkwoord, `env_reset`, `secure_path`):

```bash
install -m 0440 -o root -g root deploy/opdracht/mijn-ruimte-opdracht.sudoers /etc/sudoers.d/mijn-ruimte-opdracht && visudo -c
```

Daarna roept de app `sudo -n /usr/local/sbin/mijn-ruimte-opdracht <werkwoord>` aan; dat vraagt een drop-in met `NoNewPrivileges=no` voor
`mijn-ruimte.service` (en de app-code zou daarop moeten worden aangepast). Dit is een bewuste verzwakking; liever polkitd installeren.

## 10. Sleutel kwijt of gelekt

1. Nieuw sleutelpaar maken (§2).
2. Op de VM `/etc/mijn-ruimte/uitrol-ondertekenaars` vervangen door de nieuwe publieke sleutel (oude regel weg).
3. `date +%s%3N > /etc/mijn-ruimte/mcp-intrekken`, `"uitrol": false` en `"gitops": false` tot je klaar bent.
4. Deploy key gelekt: in GitHub (*Settings* → *Deploy keys*) verwijderen, nieuwe maken (§4.1). Token gelekt: intrekken in GitHub.

## 11. Definitieve stappen op de VM (eerste installatie van deze branch)

De eerste keer gaat via SSH (het oude root-pad bestaat dan nog en wordt door deze installatie weggezet):

```bash
ssh beheer@10.77.0.10
# 0. vooraf: back-up en polkit
sudo systemctl start mijn-ruimte-backup.service
pkaction --version || sudo apt install -y polkitd
# 1. bron op de VM: schone checkout van de gereviewde en daarna gepushte commit (NIET via de app)
sudo git clone --branch veilig-agenten-0.4 https://github.com/Tarasevych/hub.git /root/hub-veilig && cd /root/hub-veilig && git log -1
# 2. ondertekenaarsbestand (§3), daarna installeren
sudo bash deploy/installeer-app.sh installeren /root/hub-veilig
# 3. controleren dat het oude root-pad weg is (§3) en dat de nieuwe units er zijn
systemctl list-unit-files 'mijn-ruimte-*' | grep -E 'gitops|opdracht|uitrol'
ls -l /etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules /usr/local/sbin/mijn-ruimte-{gitops,opdracht,installeer,uitrol}
# 4. methode 3 testen (§6), daarna desgewenst GitOps inrichten (§4) en aanzetten (§7)
```

## 12. Tekst voor `T:\mijn-ruimte\geheim\UITLEG-LEESMIJ.txt`

Zie `deploy/pc-uitleg/T-geheim-uitrol-sleutel-UITLEG-LEESMIJ.txt` (eerst Oekraïens, daarna Nederlands). Kopieer dat bestand als
`UITLEG-LEESMIJ.txt` naast de sleutel.

## 13. Updates goedkeuren met een passkey op de telefoon (methode 2b)

### 13.1 Hoe het werkt

```
Voorbereider (agent tvh_…, MCP-koppeling of account met grant «Кому дозволено», ≤ 30 dagen, intrekbaar)
  └─ deploy/uitrol/maak-voorstelpakket.sh → MCP uitrol_voorstel_begin/stuk/klaar (of POST /api/uitrol/voorstel/*)
       → /srv/data/uploads/uitrol-voorstellen/<id>.tar.gz, status 'wacht-op-goedkeuring' (installeert NIETS)
Eigenaar: admin.tarasevych.com → «Оновлення» / «Updates» → «Схвалити й встановити»
  └─ challenge = sha256("mijn-ruimte-goedkeuring/v1", "goedkeuren", voorstel-id, versie, sha256, nonce, vervaltijd ≤ 5 min), eenmalig
  └─ navigator.credentials.get(userVerification: required) → telefoon: vingerafdruk/gezicht/pincode
  └─ app controleert vooraf (snelle melding) en legt pakket + .goedkeuring.json in /srv/mijn-ruimte/goedkeur-inbox, tikt `aanvraag` aan
mijn-ruimte-goedkeuring.path (root) → mijn-ruimte-uitrol --goedkeuring
  └─ kopie van het pakket naar de root-werkmap → mijn-ruimte-passkey verifieer-goedkeuring (root, omgeving gewist):
       sleutel uit /etc/mijn-ruimte/goedkeur-passkeys.json (root), sha256 van root's EIGEN kopie, rpId, origin, UV, vervaltijd,
       nonce nooit eerder gezien (/var/lib/mijn-ruimte/goedkeuring/staat.json, 0600), signCount
  └─ daarna precies dezelfde stappen als methode 2: inhoudscontrole, uitpakken, installeer-app.sh, gezondheid, rollback
```

* **Root vertrouwt de app niet.** Alles wat de app schrijft (pakket, `.goedkeuring.json`, aanmeldingen) is invoer. De sha256 komt uit root's
  eigen kopie, de publieke sleutels uit het root-bestand, de replay-opslag staat in een root-map. Een gecompromitteerde app kan dus geen
  pakket laten installeren (geen passkey-handtekening over díe sha256) en geen sleutel toevoegen (het root-bestand is alleen-lezen voor de app;
  een nieuwe sleutel vraagt een assertie van een bestaande sleutel of SSH). Wat ze wél kan: verzoeken weggooien of weigeren (hinder).
* **Eenmalig en gebonden.** De challenge bevat voorstel-id, versie, sha256, nonce en vervaltijd (≤ 5 min, CHECK in de database). De app
  verbruikt de challenge atomisch; root registreert de nonce vóór de installatie. Dezelfde assertie werkt nooit twee keer, ook niet na een
  mislukte installatie.
* **Alleen de eigenaar.** Goedkeuren: sessie op admin.tarasevych.com + rol owner + OWNER_EMAIL. Passkeys registreert elke gebruiker
  zelf in Instellingen → «Способи входу» (§13.6, step-up); alleen de eigenaar ziet daar per passkey «Може схвалювати оновлення сервера»
  (alleen op id./admin.). Grants geven vraagt step-up. Agents (MCP-console `/api/mcp/agent` en de MCP-connector) zien alleen `uitrol_voorstel_begin|stuk|klaar|status|annuleren`, en
  alleen met een geldige grant; elke naam die op goedkeuren lijkt, wordt geweigerd (`ALLEEN_EIGENAAR_MET_PASSKEY`).
* **rpId = `tarasevych.com`** (sinds branch `aanmeldmethoden`; daarvoor `admin.tarasevych.com`). Eén passkey werkt zo op
  id.tarasevych.com («Способи входу») én admin.tarasevych.com («Оновлення»). De app accepteert origins id/admin/hub; **root accepteert alleen
  `https://admin.tarasevych.com` en `https://id.tarasevych.com`** (hub hoeft nooit iets bij root te bevestigen: kleiner oppervlak). Instelbaar
  in het root-bestand (`rpId`, `origins`; origins buiten het rpId-domein, met poort of zonder https worden genegeerd). Een passkey is aan
  zijn rpId gebonden: sleutels van de oude rpId werken niet meer (zie §13.6 voor de overgang).
* Attestation = `none`: het type authenticator wordt niet gecontroleerd; het vertrouwen komt uit de bevestiging via SSH (eerste sleutel) of
  een bestaande sleutel. Gesynchroniseerde passkeys (iCloud/Google) geven vaak signCount 0; dat is toegestaan (0/0).

### 13.2 Eenmalig: installeren en de eerste passkey (bootstrap)

```bash
ssh beheer@10.77.0.10
sudo git clone --branch aanmeldmethoden https://github.com/Tarasevych/hub.git /root/hub-passkey && cd /root/hub-passkey && git log -1
sudo bash deploy/installeer-app.sh installeren /root/hub-passkey        # migraties 0022-0023, units, hulp, leeg sleutelbestand (rpId tarasevych.com)
systemctl status mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeur-sleutels.path --no-pager
sudo mijn-ruimte-passkey lijst                                          # rpId tarasevych.com, schakelaar uit, (geen sleutels)
```

Daarna op de **telefoon** (ingelogd als eigenaar): `id.tarasevych.com/methods` = **«Налаштування → Способи входу»** → «Passkeys» → naam
invullen → «Додати passkey» (step-up: TOTP of opnieuw Google) → passkey maken met vingerafdruk/gezicht. De passkey staat dan als «Лише вхід».
Vink bij die passkey «Може схвалювати оновлення сервера» aan (step-up): status «Чекає підтвердження сервером», met de **vingerafdruk**
(`ab12 cd34 …`) en de SSH-opdracht. Op de VM:

```bash
sudo mijn-ruimte-passkey wachtend                    # root rekent de vingerafdruk zelf uit uit de publieke sleutel
sudo mijn-ruimte-passkey toevoegen ab12cd34ef56…     # ≥ 16 hex-tekens, ZOALS OP DE TELEFOON; alleen bij exact één treffer
sudo nano /etc/mijn-ruimte/mcp-rechten.json          # "passkey-goedkeuring": true
```

Vergelijk de vingerafdruk op de telefoon met die van `wachtend`. **Beperking:** tijdens deze ene stap vertrouw je erop dat de pagina op de
telefoon echt is (een al gecompromitteerde app zou een eigen sleutel met een eigen vingerafdruk kunnen tonen). Doe de bootstrap dus direct
na een installatie uit een gereviewde commit, of controleer met `wachtend` dat er precies één aanmelding is met het label dat je net invoerde.

Daarna toont «Способи входу» bij die passkey «Може схвалювати оновлення». Volgende passkeys (tweede telefoon, laptop): «Додати passkey»,
vinkje «Може схвалювати оновлення сервера», dan «Підтвердити ключем, що вже може схвалювати» — geen SSH meer nodig; root voegt hem toe na
een assertie van een al bekende sleutel (`mijn-ruimte-goedkeur-sleutels.path`). Advies: minstens twee passkeys met dit recht.

### 13.3 Voorbereiders toestaan of intrekken

Admin → «Оновлення» → «Кому дозволено готувати оновлення»: soort (акаунт / токен агента / MCP-підключення), wie, aantal dagen (1–30),
«Дозволити» (step-up). «Відкликати» trekt meteen in en breekt lopende uploads af. Alles staat in de audit (`uitrol_voorbereider_*`). Een
grant vervalt ook als het account geblokkeerd of met pensioen is of als AI voor dat account geblokkeerd is.

Voor een agent: pakket maken met `deploy/uitrol/maak-voorstelpakket.sh` (geen sleutel nodig), dan `uitrol_voorstel_begin` met de inhoud
van `.voorstel.json`, `uitrol_voorstel_stuk` (base64, ≤ 512 KiB per stuk, offset = ontvangen bytes) en `uitrol_voorstel_klaar`.
Grenzen: 300 MB, 3 open voorstellen per grant, uploads verlopen na 24 uur, wachtende voorstellen na 7 dagen.

### 13.4 Intrekken en telefoon kwijt

* **Recht intrekken (je hebt nog een andere):** «Способи входу» → bij de passkey «Забрати право схвалювати» en bevestigen met een
  passkey die het recht heeft; root verwerkt het. Pas daarna kan «Видалити» (de app weigert een passkey te verwijderen die root nog vertrouwt).
* **Telefoon kwijt (en geen andere passkey):** via SSH:
  ```bash
  sudo mijn-ruimte-passkey lijst
  sudo mijn-ruimte-passkey verwijderen <≥16 hex-tekens van de vingerafdruk>
  sudo mijn-ruimte-passkey alles-intrekken             # alles weg; daarna opnieuw §13.2
  ```
  Goedkeuren is daarna onmogelijk tot er weer een sleutel is; methode 2 (PC-ondertekening) blijft werken.
* **Alles uit:** `"passkey-goedkeuring": false` in `mcp-rechten.json` (meteen), of
  `systemctl disable --now mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeur-sleutels.path`.

### 13.5 Bestanden

| Pad | Eigenaar / modus | Wie schrijft |
|---|---|---|
| `/etc/mijn-ruimte/goedkeur-passkeys.json` | root:mijnruimte 0640 | alleen root (`mijn-ruimte-passkey`) |
| `/var/lib/mijn-ruimte/goedkeuring/staat.json` | root 0600 (map 0700) | alleen root (nonces 24 u, tellers) |
| `/srv/mijn-ruimte/goedkeur-inbox/` | mijnruimte 0750 | de app (onbetrouwbaar voor root) |
| `/srv/data/uploads/uitrol-voorstellen/` | mijnruimte | de app (uploads van voorbereiders) |
| `/usr/local/lib/mijn-ruimte/goedkeuring/{webauthn-kern,goedkeur-hulp}.mjs` | root 0644 | installer |
| `/usr/local/sbin/mijn-ruimte-passkey` | root 0755 | installer |
| `/var/lib/mijn-ruimte-uitrol-status/{status.json,goedkeur-sleutels.json,gebeurtenissen.jsonl}` | root:mijnruimte 0640 | root |

Database (migratie 0023, RLS per gebruiker): `app.passkeys` (publieke sleutel, naam, AAGUID, BE/BS, teller, laatst gebruikt) en
`app.passkey_uitdagingen` (≤ 5 min, eenmalig, per gebruiker én sessie). Deze tabellen bepalen **niet** wie mag goedkeuren; dat doet alleen
het root-bestand.

Uitleg voor op de PC (geen geheimen): `deploy/pc-uitleg/passkey-goedkeuring-UITLEG-LEESMIJ.txt`.

### 13.6 «Способи входу» / «Aanmeldmethoden» en de overgang naar rpId tarasevych.com

**Pagina.** Ідентичність → «Способи входу» (`id.tarasevych.com/methods`; menu «Налаштування → Способи входу»). Eén pagina zoals bij GitHub:
e-mail en Google (alleen lezen), passkeys (toevoegen met `residentKey: preferred` + UV verplicht, hernoemen, verwijderen met step-up; per
passkey aanbieder (AAGUID-hint), «синхронізується» (BE/BS), toegevoegd, laatst gebruikt), tweefactor (TOTP instellen/uitschakelen; geen
sms) en herstelcodes (status «збережено», nieuwe codes met TOTP-code of een verse passkey-bevestiging, eenmalig getoond). De tabbladen
«Безпека» en «Відновлення» tonen dezelfde pagina, gescrold naar hun sectie. Admin «Оновлення» toont alleen nog de stand en een link.

**Step-up: venster «Підтвердіть доступ» / «Toegang bevestigen».** Elke gevoelige actie die 403 `STEP_UP_REQUIRED` geeft, opent een eigen
venster (zoals GitHub «Confirm access»), nooit meer `window.prompt/alert/confirm`. Eén taal tegelijk (de taal van de pagina), met
«Ви ввійшли як <e-mail>» en alleen de manieren die de gebruiker heeft (`POST /api/owner/access/stap-op/methoden`, alleen ja/nee):
passkey (grote knop), code uit de authenticator-app, herstelcode (`POST /api/owner/access/stap-op` met `methode: 'herstelcode'`:
eenmalig verbruikt, zelfde lockout als TOTP, melding naar de gebruiker) en altijd «Підтвердити повторним входом через Google»
(`prompt=login`, `max_age=0`, auth_time verplicht). Wie alleen Google heeft, krijgt meteen de Google-knop met uitleg. De bevestiging
geldt 5 minuten en alleen voor die sessie. Niet verzwakt: herstelcodes vervangen met TOTP vraagt nog steeds de TOTP-code of een verse
passkey; TOTP uitschakelen vraagt de TOTP-code of een herstelcode.

**Hervatten na Google.** Vóór het doorsturen bewaart de pagina in `sessionStorage` alleen de actie (bv. `passkey-toevoegen` met de
gekozen naam, `herstelcodes-maken`), nooit codes of wachtwoorden; 10 minuten geldig, alleen op hetzelfde pad. Een step-up vanaf
`id.tarasevych.com` komt terug op dezelfde pagina (vroeger: hub); de server controleert dat het dezelfde origin is. Na terugkeer voert
de pagina de actie zelf opnieuw uit. Andere acties: korte melding «Доступ підтверджено — повторіть дію».

**Passkeys op de telefoon (QR / hybrid).** Registratie zonder `authenticatorAttachment`, `residentKey: preferred`,
`hints: ['client-device','hybrid']`; bij bevestigen krijgt elke sleutel zijn opgeslagen transports plus `hybrid`, zodat Windows/Chrome
«Використовувати телефон або планшет» met een QR-code toont (Bluetooth aan). Per passkey: soort (wachtwoordbeheerder, telefoon,
beveiligingssleutel, apparaat), «Синхронізовано» (BE/BS), toegevoegd, laatst gebruikt. De kern (ook root) leest BE/BS alleen als
informatie; UP en UV blijven verplicht, teller 0 → 0 (gesynchroniseerde passkeys) is geldig.

**Inloggen met alleen een passkey: (nog) niet.** Bewust: de sessie-opbouw (tabbladen, overdracht, login-CSRF-binding) is complex en niet op
echte toestellen te testen, en minder vaak een passkey aanraken verkleint de kans dat een gekaapte pagina een goedkeur-challenge in een
gewone aanmelding verstopt. Passkeys dienen nu voor bevestigen en voor updates goedkeuren; Google blijft de aanmelding.

**Overgang op de VM (eenmalig, als root):**
```bash
sudo mijn-ruimte-passkey lijst          # staat er nog rpId admin.tarasevych.com?
sudo mijn-ruimte-passkey rp-bijwerken   # leeg bestand → rpId tarasevych.com + origins admin/id (de installer doet dit ook)
```
`rp-bijwerken` weigert (exit 1) als er al sleutels voor de oude rpId in staan: die werken met de nieuwe pagina niet meer. Dan eerst
`sudo mijn-ruimte-passkey alles-intrekken` (of `verwijderen <vingerafdruk>` per sleutel), daarna `rp-bijwerken`, en §13.2 opnieuw vanaf
«Способи входу». Tot dan toont de pagina bij de eigenaar een waarschuwing dat root nog op de oude rpId staat.



### 13.7 «Додати passkey» → «Продовжити» deed niets (release 20261009-052551) en de e2e-test

**Oorzaak.** Na «Продовжити» haalt de pagina de registratie-opties op en roept `navigator.credentials.create()` aan. Was de
step-up nog geldig (verse Google-aanmelding < 5 min, bv. direct na de uitrol), dan verschijnt er terecht geen venster
«Підтвердіть доступ» en wacht de pagina op het passkey-venster van de browser/Windows. Verscheen dat venster niet (of hing
het; de registratie-opties droegen `hints: ['client-device','hybrid']`), dan bleef de pagina zonder melding, zonder
«Скасувати» en zonder tijdslimiet op die belofte wachten: de knop was `disabled` en in het donkere thema (lichte
`--boot-accent` #8dbab7 met witte tekst) zag hij er al bleek/uitgeschakeld uit. Elke fout in het laden van het venster zelf
(chunk na een nieuwe release, renderfout) werd bovendien stil `false`.

**Herstel.**
- Tijdens het wachten staat er een statusregel («Готуємо запит…» → «Відкрито вікно passkey браузера або Windows…», na 25 s
  een hint) met een werkende «Скасувати» (AbortController → «Додавання passkey скасовано.»). Elke fout komt als melding in
  de sectie en in de console.
- Kan «Підтвердіть доступ» niet openen, dan geeft `client.ts` de fout `STAP_OP_VENSTER_FOUT` («оновіть сторінку»); een
  renderfout in het venster wordt opgevangen (error boundary) en niet stil geslikt.
- Geen `hints` meer in de registratie-opties: de browser toont zijn volledige keuze (dit apparaat, telefoon via QR,
  beveiligingssleutel).
- Accentknoppen hebben in de donkere thema's donkere tekst (`--ap-op-accent`).
- `deploy/installeer-app.sh` bouwt nu met `NODE_ENV=production` (alleen `npm ci` draait met development). Tot en met
  20261009-052551 bevatte productie de ontwikkelversie van React.

**Indeling.** Passkeys staan op één plek (onder «Вхід»), met per passkey de eigenaarsschakelaar «Може схвалювати
оновлення сервера». Onder 2FA staan alleen de authenticator-app en een regel dat passkeys ook tellen; de herstelcodes
hebben een eigen sectie. Uitleg en de QR-hint staan in een (?) naast de titel (`src/InfoTip.tsx`, popover met
role=tooltip/aria-describedby, hover/focus/tik, Esc).

**E2E.** `npx vite build && node scripts/e2e-lokaal.mjs` met dezelfde omgeving als de eenheidstests, plus
playwright-core (`PLAYWRIGHT_CORE`), Chrome (`CHROME`) en een test-CA in `$HOME/.pki/nssdb` met een certificaat voor
`*.tarasevych.com` (`E2E_TLS`: srv.key/srv.crt). Echte Chrome headless, `--host-resolver-rules` naar de lokale server, CDP
virtual authenticator (internal, usb, hybrid/cable), Google gestubd via `page.route`. Screenshots naar `E2E_SCREENSHOTS`.
De test ruimt zijn gebruikers op (de unieke index `records_een_eigenaar`).

### 13.8 Google-step-up: lus «Підтвердіть доступ» na terugkeer (release 20261009-055320) en herstelcodes

**Oorzaak van de lus.** De step-up-URL vroeg `prompt=login` + `max_age=0` + een claims-verzoek om `auth_time`. Google
kent `prompt=login` niet en dwingt geen nieuw wachtwoord af: met een bestaande Google-sessie toont het alleen de
accountkiezer en levert het een id_token met de **oude** `auth_time` (of zonder `auth_time` als «session age claims» in de
OAuth-client uitstaan). De server telde de step-up alleen bij een `auth_time` jonger dan 5 minuten en sloeg hem anders
**stil** niet op; de callback meldde gewoon «aangemeld». Terug op `/methods` hervatte de pagina de actie, kreeg weer
`403 STEP_UP_REQUIRED` en opende hetzelfde venster: eindeloze lus zonder melding.

**Nieuwe regel (backend/index.ts `ownerStapOpAuthTijd`, backend/stap-op.ts `googleUitgifteVoorStapOpVers`).** Een
Google-step-up telt als:
1. `auth_time` uit het ondertekende id_token jonger is dan 5 minuten (zoals voorheen; blijft de sterkste vorm), **of**
2. het om een **expliciete step-up-transactie** gaat (gestart vanuit het venster, `intent: step-up`, alleen met een
   levende sessie) én:
   - het id_token **net is uitgegeven**: `iat` ≤ 2 minuten oud, niet vóór de klik (start van de transactie, 60 s
     klokspeling) en de transactie zelf < 10 minuten oud;
   - de **nonce** klopt met de nonce die bij de klik voor déze transactie is gemaakt en server-side bewaard
     (`takeOAuthMaterial`, eenmalig), samen met de eenmalige `state`, PKCE-verifier en de aanmeld-binding-cookie (zelfde
     browser);
   - het Google-**subject** (`sub`) hoort bij het account dat de step-up startte (`account_identities`, anders `users.sub`);
   - `email_verified` waar is (verifyGoogle/ensureUser eisen dat al).

De step-up geldt dan 5 minuten vanaf het afronden, alleen voor die sessie (tab-overlay/anker), zoals TOTP en passkey.

**Waarom dit verantwoord is.** Google biedt geen manier om opnieuw het wachtwoord af te dwingen; ook GitHub e.d. kunnen bij
een externe IdP niet meer bewijzen dan «de gebruiker heeft nu, in deze browser, actief dit Google-account gekozen». Dat
bewijzen punt 2a–d: zonder klik in de accountkiezer komt er geen code terug; een oude code of een id_token uit een andere
transactie faalt op state/nonce/PKCE/iat; een ander Google-account faalt op `sub`. Wat het níet bewijst is dat de persoon
het Google-wachtwoord kent als Google al aangemeld was — dezelfde grens als bij de gewone aanmelding. Voor acties waar dat
te zwak is blijven de strengere paden: passkey-step-up (`passkeyStapOpGeldig`, root-goedkeuring), TOTP-code bij herstelcodes
vervangen en TOTP uitschakelen (die accepteren Google bewust niet). Een gewone aanmelding (geen step-up-transactie) met een
vers `iat` telt nog steeds **niet** (alleen `auth_time`). Noodpad `STAP_OP_GOOGLE_ZONDER_AUTH_TIME=1` blijft bestaan maar is
niet meer nodig. De autorisatie-URL gebruikt nu altijd `prompt=select_account` (+ `max_age=0` en het claims-verzoek bij
step-up).

**Nooit stil.**
- Ander Google-account: `STEP_UP_ACCOUNT_MISMATCH` vóór `ensureUser` — geen nieuw account, geen sessiewissel, audit
  `owner.step_up.google rejected`. Geen verse bevestiging: `STEP_UP_NOT_FRESH`.
- De callback-antwoorden van een step-up dragen `stepUp: true`; bij een fout zet `OwnerIdentityCallback` de reden in
  `sessionStorage` (`mijn-ruimte-stap-op-fout`, alleen een foutcode) en stuurt terug naar de pagina. Het venster toont de
  reden («Ви вибрали інший акаунт Google…», «Google не підтвердив новий вхід…»). Opent het venster opnieuw direct na een
  hervatting zonder bewaarde reden, dan toont het «Повторний вхід через Google не підтвердив доступ…».

**Herstelcodes (GitHub-achtig).**
- Na het maken één keer de codes (`XXXX-XXXX-XXXX`) met Завантажити (.txt), Копіювати, Друкувати en «Я зберіг коди» →
  «Готово» (zet `bekekenOp`).
- Daarna alleen `POST /api/owner/access/recovery/overzicht`: per code volgnummer, de laatste 2 tekens (hint), status
  (`ongebruikt` / `gebruikt` + datum / `ingetrokken`), «Залишилося N з 10». De codes zelf blijven alleen als HMAC met pepper
  bewaard; de hint verkleint de zoekruimte van 2^48 naar 2^40 per code, met lockout ruim voldoende. Nooit hashes in een
  antwoord.
- «Відкликати всі»: `POST /api/owner/access/recovery/intrekken` (step-up vereist) → `hashes: []`, `remaining: 0`,
  `ingetrokkenOp`; alle wegen (aanmelden met wachtwoord+code, step-up, TOTP uitschakelen) gebruiken `herstelcodeGebruiken`,
  dat ingetrokken sets weigert. Melding aan de gebruiker.
- «Створити нові» vervangt de set (oude vervallen meteen; melding als er nog ongebruikte waren).
- Gebruik wordt atomisch vastgelegd: `takeArrayValue` (hash weg, teller) en daarna `zetEenmaligInMap` (`gebruikt[hash] = tijd`),
  zonder de rest van het record te overschrijven.
- Invoer mag streepjes, spaties en kleine letters bevatten.
- Geen migratie nodig: alles staat in het bestaande jsonb-record `identity_recovery_codes_v1`. Oude sets (zonder
  `overzicht`) tonen alleen de teller met de hint «створіть нові, щоб бачити стан кожного коду».
- `/recovery/overzicht` valt niet onder de strikte MFA-limiet (10/min per IP); de andere herstelcode-routes wel.

**E2E.** `tests/e2e/herstelcodes.e2e.ts`: step-up met oude `auth_time` maar vers `iat` → codes gemaakt; downloaden,
kopiëren, afdrukken, bevestigen; code gebruiken in het venster (andere sessie) → doorgestreept, teller 9; intrekken →
onbruikbaar; ander account → melding in het venster; oud `iat` → melding.

### 13.9 mcp.*/agents opnieuw opgezet (GitHub-stijl) en de losse «RATE_LIMITED» boven de titel

**Oorzaak van «RATE_LIMITED».** Een renderlus op de oude agentenpagina. `AiToestemmingen` laadde
`/api/owner/ai/grants/list` in een `useEffect` met `onChange` als afhankelijkheid. De ouder
(`BrowserExtensionPanel`/`McpAgentsHub`) gaf bij elke render een nieuwe `onChange` mee en zette daarin state. Dat gaf
een nieuwe render, een nieuwe `onChange` en een nieuwe aanvraag, zonder einde: met een browseragent open waren dat
honderden aanvragen per minuut. De algemene limiet (`API_RATE_LIMIT_PER_MIN`, 600/min per IP) gaf daarna 429
`{error:'RATE_LIMITED'}` op álle `/api/*` van die browser, ook op `/api/mcp/tokens/list` en `/api/mcp/permissions`.
Die twee werden geladen door `McpServiceView` (`run('agents', loadTokens)`). Die toonde de kale foutcode in
`<p class="mcp-lead">{error}</p>` boven de titel.

**Herstel.**
- `onChange` loopt via een ref. Laden hangt alleen af van `agentId`/`versie`, en state verandert alleen als de waarde
  echt verandert.
- `BrowserExtensionPanel.onGrants` is een stabiele `useCallback`.
- Er is nog één poller (apparaten en wachtende acties, 5 s). De rest laadt bij openen, na een actie en daarna rustig
  (60 s, alleen een zichtbaar tabblad). Het journaal ververst elke 30 s, alleen op het open tabblad.
- `McpServiceView` laadt voor «agents» niets meer zelf en toont fouten via `foutTekst()` (`src/agenten/fouten.ts`).
  Bij een 429 staat er een zin met de wachttijd, zonder code. Voor andere fouten staat de code klein erachter.
- De e2e-test meet dit: met een apparaat open komen er in 8 s hoogstens 3 aanvragen naar `grants/list`.

**De pagina** (`src/agenten/`, de ingang `src/McpAgentsHub.tsx` blijft) heeft deze tabbladen, adresseerbaar via de
hash:

| Hash | Tabblad |
|---|---|
| `#overzicht` | Огляд / Overzicht |
| `#ai` | Підключені ШІ / Verbonden AI |
| `#apparaten` | Пристрої й браузери / Apparaten en browsers |
| `#tokens` | Токени й двері / Tokens en deuren |
| `#journaal` | Журнал / Logboek |

- Een open rij staat ook in de hash, bijvoorbeeld `#apparaten/dev:<id>` of `#ai/oauth:<id>`.
- Oude adressen worden omgezet:

  | Oud adres | Nieuw adres |
  |---|---|
  | `#overview`, `#pending` | `#overzicht` |
  | `#claude` | `#ai` |
  | `#tools` | `#ai/hulpmiddelen` |
  | `#extension` | `#apparaten/extensie` |
  | `#doors` | `#tokens` |
  | `#pair` | `#apparaten/koppelen` |
  | `#dev:<id>` | `#apparaten/dev:<id>` |

- `?extension=welcome` blijft werken.
- Rijen zijn standaard dicht: titel, één statusregel en een knop rechts. Open zie je alle technische gegevens.
- Acties die iets weghalen, vragen eerst om een bevestiging op de pagina (geen `window.confirm`). Daarna volgen een
  spinner en een melding met wat er veranderde en hoe laat.
- Ingetrokken of losgekoppelde items blijven zichtbaar in een dichte groep «Відкликані / Відключені» (90 dagen).

**Nieuwe server-endpoints** (eigenaar, `ownerGate`):
- `POST /api/owner/agents/overzicht` geeft:
  - OAuth-verbindingen met hun status (`active`/`revoked`/`expired`);
  - losgekoppelde agents van de laatste 90 dagen, met hun reden (`user`/`repaired`/`blocked`);
  - het aantal toestemmingen per agent;
  - de MCP-URL.
- `POST /api/owner/agents/journaal` met body `{soort, onderwerp, voor, limit}` geeft één tijdlijn uit `app.audit`.
  - De regels gaan door `JOURNAAL_ACTIES` en `journaalItem()`: velden die op een geheim lijken (token, hash, cookie,
    nonce, code, key…) vallen weg, en het IP staat er alleen als een hash van 12 tekens.
  - Verlopen toestemmingen en verlopen OAuth-verbindingen zijn **afgeleid**, niet opgeslagen. Ze staan alleen op de
    eerste pagina (90 dagen).
- `auditLijst()` kent nu een filter `acties: string[]`.
- `POST /api/owner/agents/:id/revoke` geeft nu `revokedAt` terug.

**Nieuwe of aangevulde auditregels:**

| Actie | Wanneer of wat |
|---|---|
| `owner.mcp.grant.connected` | Een OAuth-client krijgt tokens. |
| `owner.mcp.grant.revoked` | Nu met de clientnaam en een reden: `user`, `client` (de client trok zelf in) of `refresh_reuse` (automatisch, bij hergebruik van een refresh-token). |
| `owner.agent.updated` | Een pc-agent of extensie meldt een andere versie bij het verbinden (`from` → `to`). |
| `owner.agent.paired` | Nu met naam, versie en `replacedIds`: een herinstallatie is zichtbaar als «Перевстановлено». |
| `owner.agent.revoked` | Nu met naam, platform, versie en `reason: 'user'`. In de tabel staat nu ook `revoke_reason = 'user'`. |
| `mcp_console_token_revoked` | Nu met naam en prefix. |

**Beperkingen.**
- Het verwijderen van de browserextensie ziet de server niet. Je merkt het pas als het token wordt ingetrokken of
  geweigerd, of als de extensie offline blijft.
- Het land wordt niet opgeslagen, alleen de IP-hash.
- «Відкликати всі» trekt de items één voor één in via de bestaande endpoints (er is geen endpoint dat alles in één
  keer doet). Lukt er één niet, dan stopt het daar. De lijst wordt bijgewerkt, en wat al was ingetrokken staat bij
  «Відкликані».

**Tests.**
- Eenheidstest: `tests/eenheid/agenten-journaal.test.ts`. Die toetst het weglaten van geheimen, de onderwerpen, het
  `acties`-filter, de geschiedenis met reden, de foutteksten en de broncontrole tegen de lus.
- E2E: `tests/e2e/agenten.e2e.ts`. Die toetst:
  - tabbladen en oude deep links;
  - dichte rijen en uitklappen;
  - intrekken (bevestigen, spinner, melding, groep «Відкликані», zonder herladen);
  - loskoppelen met de geschiedenis «Перевстановлено»;
  - het journaal met filters;
  - een nagebootste 429 (vriendelijke tekst, nergens `RATE_LIMITED`);
  - 390 px zonder overloop, en licht en donker.

### 13.10 Toegang in context: gebruik, notities, intrekken met reden, «Це був не я» (migratie 0024)

**Gebruik.** Elke herstelcode en elk passkey-gebruik wordt vastgelegd in `app.toegang_gebruik` (RLS: alleen de eigen rijen):
actie (vaste lijst `ACTIES` in `backend/toegang-context.ts`, onbekend → `bevestigen`), host, apparaat (browser · OS uit de
User-Agent), korte IP-hash (`AUDIT_IP_PEPPER`, nooit het IP zelf). De step-up stuurt een actielabel mee (`actieVoorUrl` in
`src/platform/stap-op.ts`); de server accepteert alleen labels uit de allowlist. Per sleutel de laatste 20, uitklapbaar.

**Notities.** Privé, ≤ 500 tekens, `app.toegang_notities` (RLS), voor passkeys, codesets, losse codes en (later) toegangscodes.
Route `POST /api/owner/access/notities/{lijst,opslaan}`.

**Recht intrekken / goedkeur-passkey verwijderen.** Alleen de eigenaar. Reden ≥ 10 tekens verplicht en een *sterke* step-up
(passkey, TOTP of herstelcode); Google alleen volstaat niet zodra de gebruiker iets sterkers heeft (403
`STEP_UP_STRONG_REQUIRED`, het venster toont dan geen Google-knop). Vastgelegd in `app.toegang_wijzigingen` + audit: wie,
sessie, apparaat, IP-hash, wanneer, reden, sleutel, hoe bevestigd. Melding in de bel («Це були ви?», link
`/methods?wijziging=<id>`), op /agents → Журнал onder «Права й ключі». Voorbereiders (admin → Uitrol) volgen dezelfde regel;
de betrokken gebruiker krijgt een melding en geschiedenis.

**Hoe het intrekken bij root komt.** De app schrijft `sleutel-intrekken-<fp32>.json` in de inbox (geen assertion nodig:
verwijderen is de veilige richting). `mijn-ruimte-goedkeur-sleutels.path` ziet het bestand en start `goedkeur-hulp.mjs verwerk`
als root: die controleert reden en vingerafdruk, noteert `staat.ingetrokken[fp] = {op, door, sessie, wijziging, reden}`,
haalt de sleutel uit `/etc/mijn-ruimte/goedkeur-passkeys.json`, schrijft de status en de gebeurtenis `PASSKEY_INGETROKKEN`.
Een eenmaal ingetrokken vingerafdruk kan **niet** via de app (assertion) terugkomen (`OPNIEUW_VIA_SSH`), alleen met
`sudo mijn-ruimte-passkey toevoegen <fp>` — dat wist de markering.

**«Це був не я — скасувати та захистити акаунт».** Sterke step-up. Ligt het verzoek nog in de inbox: verzoek weg, recht
blijft. Heeft root al verwerkt: nieuwe aanmelding + de UI toont eerlijk de SSH-opdracht. Een verwijderde passkey wordt in de
app hersteld. De sessie die de wijziging deed wordt beëindigd (tenzij het de huidige is). Alles in audit + geschiedenis.

**E-mail.** Er is geen systeem-mailer: mail kan alleen via de eigen Gmail-koppeling van een gebruiker. De melding staat dus
altijd in de bel; e-mail wordt (nog) niet verstuurd.

Tests: `tests/eenheid/toegang-context.test.ts`, `uitrol-goedkeuring`, `passkeys`; e2e `tests/e2e/toegang-context.e2e.ts`
(screenshots `notities-*.png`, `intrekken-*.png`). Let op: de step-up-limiet is per IP — draai de e2e-bestanden met een
pauze (≥ 2 min) of los, anders 429 op `/api/owner/access/stap-op`.

### 13.11 Коди доступу для інших / toegangscodes, gastsessies en «Сесії» (migratie 0025)

**Wat.** Op `id.tarasevych.com/methods` staat de sectie «Коди доступу для інших» (alleen de eigenaar; anderen krijgen
`OWNER_REQUIRED` en zien de sectie niet). «Створити код доступу» vraagt naam, privénotitie, wat de gast mag bekijken,
geldigheid (безстроково / 1 uur / 1 dag / 7 dagen / 30 dagen / eigen datum + tijd, ≥ 5 min en ≤ 366 dagen) en eenmalig of
herbruikbaar (optioneel max. 1–1000×). Aanmaken vraagt een **sterke** step-up (passkey, app-code of herstelcode; een verse
Google-step-up volstaat niet → `STEP_UP_STRONG_REQUIRED`). Maximaal 50 codes per eigenaar, 20 aanmaakpogingen per uur.

**Scopes (allowlist in `backend/toegangscodes.ts`, alleen lezen, standaard weigeren):**
`profiel.lezen` (naam + Google-foto, nooit e-mail), `apparaten.lezen` (naam, platform, laatst gezien, actief),
`journaal.lezen` (agentjournaal **zonder** regels over rechten/sleutels/codes/tokens). Bij het laden van de module wordt
gecontroleerd dat elke scope op `.lezen` eindigt en niets uit de lijst «nooit» raakt: aanmeldmethoden, passkeys,
goedkeurrechten, beheer/admin, tokens, root/updates, account verwijderen/exporteren. Een onbekende scope → `SCOPE_NIET_TOEGESTAAN`.

**Code.** 80 bits (Crockford base32, `XXXX-XXXX-XXXX-XXXX`; O→0, I/L→1, spaties/kleine letters toegestaan). Eén keer getoond
met kopiëren / QR / delen; de deellink is `https://id.tarasevych.com/toegang#code=…` (fragment → komt nooit in serverlogs; de
pagina haalt het meteen uit de adresbalk). In de database alleen `sha256('mijn-ruimte-toegangscode\0'+code)` + 4 tekens hint.

**Gastsessie (isolatie).** `/api/gast/inwisselen` geeft een aparte cookie `tsv_gast` (HttpOnly, Secure, SameSite=Strict,
**Path=/api/gast**, alleen host `id.tarasevych.com`; Origin moet `https://id.tarasevych.com` zijn). Het is nooit de sessie
van de eigenaar: geen enkele `/api/owner/*`-route leest deze cookie (getest: 401). Elk gastverzoek controleert opnieuw sessie,
code (ingetrokken? verlopen?) en eigenaar (geblokkeerd?) → intrekken/verkorten/verlopen werkt meteen. Een gastsessie duurt
hoogstens tot het verloop van de code en nooit langer dan **24 uur** per inwisseling. Elke gastactie (bekeken / geweigerd)
staat in `app.toegangscode_log` en in de audit met actor `gast:<code-id>`; het journaal op /agents toont ze onder «Права й ключі».
Bij het **eerste** gebruik van een code krijgt de eigenaar een melding in de bel (link naar de code). Er is **geen e-mail**
(geen systeem-mailer, zie §13.10).

**Raden/limieten.** Per IP strikte bucket `gast-inwisselen` 10/min (Postgres) + blokkade na 5 mislukte pogingen
(`gast-inwisselen:<ip-hash>`, 15 min, verdubbelend) → 429 `GAST_GEBLOKKEERD`, ook met een geldige code. Foutmelding is altijd
algemeen (`CODE_ONGELDIG`); pogingen op een bestaande code worden bij die code gelogd als «geweigerd».

**Beheer.** Lijst met status Діє / Використано / Закінчився / Відкликано, gebruik (x з max), laatste gebruik (tijd, apparaat,
IP-hash) en een uitklapbare geschiedenis. «Відкликати» vraagt een reden (≥ 10 tekens, geen step-up: veilige richting) en
beëindigt alle gastsessies van die code meteen. «Змінити строк»: inkorten mag zonder step-up (lopende gastsessies worden ook
korter), verlengen of безстроково vraagt een sterke step-up.

**«Сесії та пристрої»** (`id.tarasevych.com/sessions`, geen nieuw menu-item): eigen sessies tonen nu de echte aanmeldmethode
(`authMethod`; tot passkey-aanmelden bestaat is dat meestal Google) en de duur; daaronder «Гостьові сесії» (code-naam, apparaat,
gestart, laatst actief, duur, IP-hash) met per sessie «Завершити гостьову сесію». «Завершити всі інші» →
`POST /api/owner/identity/security/revoke-others {gast:true}`: alle andere eigen sessies, tabbladen buiten deze sessie,
onthouden browsers en alle levende gastsessies; deze aanmelding blijft.

**Ook.** «Відхилити» bij een updatevoorstel (admin «Оновлення») gebruikt nu een inline redenveld i.p.v. `window.prompt`.
Nieuwe afhankelijkheid: `qrcode-generator@2.0.4` (MIT, zonder afhankelijkheden) voor de QR (SVG-paden, geen innerHTML).

**Database (0025).** `app.toegangscodes`, `app.gast_sessies`, `app.toegangscode_log`, met RLS `user_id = app.huidige_gebruiker()`
voor `mijnruimte_app`; de app-rol heeft alleen SELECT (schrijven via de systeemrol). Uitrol: `migreer` vóór de herstart.

**Tests.** `tests/eenheid/toegangscodes.test.ts`; e2e `tests/e2e/gast-toegang.e2e.ts` (screenshots `gast-*.png`).
De e2e-server zet `E2E_LOKALE_LIMIETEN=1` (alleen `tests/e2e/server.ts`): dan zijn de strikte per-IP-buckets ×20, zodat
e2e-bestanden achter elkaar kunnen draaien zonder 429 op `/api/owner/access/stap-op`. De server logt een waarschuwing als dit
aan staat; **nooit** in productie zetten (`/etc/mijn-ruimte/*.env` bevat het niet).

## 14. Menu v2 (branch `menu-v2`) — zijbalk stage 1 + datamodel stage 2

**Geen migratie.** De voorkeuren staan als JSON-veld `sidebar` in de bestaande rij van `owner_ui_preferences_v1`
(bootstrap → `uiPreferences.sidebar`; opslaan via `POST /api/owner/ui/sidebar/save`, alleen goedgekeurde sessie,
max. 20 000 tekens → anders `413 SIDEBAR_TOO_LARGE`; de server normaliseert alles met `normaliseerZijbalk`).
Zonder goedgekeurd account: alleen `localStorage` (`tsv-zijbalk-v2`).

Wat verandert voor de gebruiker:
- Werkbalk bovenin de zijbalk: **Завжди розгорнута** / **Завжди згорнута** (nieuw: nooit openklappen bij aanwijzen) / **Автоматично**.
  Smal: één knop die een paneeltje opent. Mobiel (≤ 700 px) blijft de hamburger + lade.
- Scrollpijlen ▲/▼ met vervaging, alleen als er meer is; klik = vloeiend een stuk, ingedrukt houden = doorlopend.
- Smalle rail 60 px, zonder zichtbare scrollbalk (de pijlen zijn de aanwijzing); cirkels als markering; brede stand: pil om icoon+tekst.
- Site-tooltips (rechts) op elk item in de smalle stand, ook bij toetsenbordfocus; geen native `title`.
- Instellingen → Меню: **Стиль іконок** (Класичний / Кольоровий) en de zijbalkmodus.
- Nieuwe standaardiconen (Налаштування = tandwiel, MCP = kabel); een bewust gekozen icoon blijft.

Controle na uitrol: `/menu` openen → «Кольоровий» kiezen → in een tweede browser hetzelfde account → kleur staat er ook.

### 14.1 Fase A (na review van Pavlo, 9-10-2026) — cirkels, e-mailsubmenu, kleuren per onderdeel

**Geen migratie, geen serverwijziging** (alleen CSS/TS in de frontend + tests).
- Smal: ELK item is een cirkel zonder tekst — ook het actieve subitem en «Написати лист» (36 px, gevuld in de kleur van E-mail;
  de animatie envelop → pen bij aanwijzen blijft). Oorzaak van de oude «pil met afgekapte tekst»: de e-mailknop had geen smalle stand.
- Smal: de iconen van het e-mailsubmenu waren verborgen (CSS verborg elk kind behalve `.canonical-menu-icon-slot`) en stonden
  verschoven (de 119 px brede knop maakte de kolom breder). Nu: alleen tekst/tellers verborgen, icoon gecentreerd in de strook.
- Kleuren per onderdeel (conventies): Мій простір teal, ШІ violet, Пошта blauw, Хмара hemelsblauw, GitHub grafiet (donker: lichtgrijs),
  Розумний будинок oranje, MCP groen, Налаштування grijs, API roze, Адміністрування rood (+ taken limoen, agenda indigo, notities oker).
  Bron: `ACCENT_KLEUREN` in `shared/menu-model.ts` (= palet in `src/menu-v2.css`, test bewaakt), `--a` hoofd, `--a2` sub (lichtere tint).
  Класичний: kleur alleen bij aanwijzen en actief; Кольоровий: altijd. Kleur hoort bij de HERKOMST (`itemAccent(id)`), dus kopieën
  en verplaatste items houden in fase 2 hun oorspronkelijke kleur.
- Breed: de verbindingslijn van submenu's is 2 px in een tint van het onderdeel, nu ook bij E-mail.
- Tests: `tests/eenheid/menu-v2.test.ts` (contrast ≥ 3:1 licht/donker, CIEDE2000 ≥ 12 tussen hoofdonderdelen en ≥ 7 tussen alle,
  zelfde kleurtoon sub/hoofd, herkomst), `tests/e2e/menu-v2-kleuren.e2e.ts` (cirkels ≤ 44 px binnen de rail, iconen zichtbaar en
  gecentreerd, geen tekst, kleuren uit het model; screenshots menu-12…menu-18).

Controle na uitrol: Ctrl+F5 → menu «Завжди згорнута» → Пошта: alle subitems als cirkels met icoon; «Налаштування → Меню» → Кольоровий.

Stage 2 (nog geen UI): `shared/menu-model.ts` — stabiele ids `svc:<dienst>` / `pg:<dienst>/<pagina>`, standaardplaatsing uit
`MENU_PAGINAS` (gelijk aan `canonical-service.js`, door een test bewaakt), overrides per item (`zichtbaar`, `volgorde`, `plaats`,
`ouder`, `icoon`), kopieën (`k-…` → `zijbalk`/`snelbalk`/`start`), dock (`links|rechts|boven|onder`, transparantie 0–60, vergroting),
`itemTerugzetten`, `allesTerugzetten`, `menuSamenstellen`.
