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
scp mijn-ruimte-<versie>.tar.gz{,.sig} beheer@203.0.113.10:/tmp/
ssh beheer@203.0.113.10
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
   ssh beheer@203.0.113.10
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
ssh beheer@203.0.113.10
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
