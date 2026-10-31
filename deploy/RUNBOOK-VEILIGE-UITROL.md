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
  "terugdraaien-passkey": true,
  "externe-hosts-passkey": true,
  "externeMcpHosts": [],
  "opdracht": { "status": true, "releases": true, "backup": true, "uitrol-nu": true, "terugdraaien": false }
}
```

`terugdraaien-passkey`, `externe-hosts-passkey` en `externeMcpHosts` horen bij de **besluiten van de eigenaar met passkey** (§15):
ontbreekt een `…-passkey`-sleutel, dan is dat kanaal OPEN (de passkey-handtekening is de poort); `false` sluit het. `externeMcpHosts`
schrijft root zelf op zo'n besluit; met de hand bewerken mag ook.

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
   Sinds 22.10.2026 ook als de pagina's **niet renderen** terwijl HTTP 200 is — zie §8a (rendercontrole).
2. **Via de site met een passkey-besluit** (22.10.2026, §15, standaard AAN): mcp → Панель розгортання → *Відкат до попереднього* →
   de wizard toont van → naar, u tekent met uw passkey, root controleert de handtekening zelf en voert de terugdraaiing uit (1× per 10 min).
   De oude directe knop (methode 3, alleen als `"opdracht": {"terugdraaien": true}`) bestaat nog, maar is niet meer nodig.
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

## 8a. Rendercontrole en automatisch terugdraaien bij een witte pagina (22.10.2026)

**Wat er misging.** Release 20261021-221718 deed `Buffer.from(…)` op moduleniveau in de technische bundel (`shared/merk-eigen.ts`). De browser
kent geen `Buffer`: de technische bundel gooide «Buffer is not defined» en ELKE admin.*-pagina (ook /updates) bleef wit. `/__gezondheid` was
groen, «HTTP 200» was groen, de nabewaking en de nazorg zagen niets, «Діагностика» zei «Сторінка «Оновлення» HTTP 200 · Справно» — en de
beloofde autoterugdraai bleef uit. De eigenaar moest via SSH een pakket installeren.

**Wat er nu gebeurt bij elke installatie** (`installeer-app.sh installeren` → `activeren`):

1. omzetten → herstart → `/__gezondheid` → nabewaking (zoals vroeger);
2. **rendercontrole** (`scripts/rook-controle.mjs`, stap «rook 97 %»):
   - met een browser op de server: een **wegwerpkopie** van de nieuwe release wordt gestart (`dist-server/rook.mjs`) op een eigen,
     lege database `mijnruimte_rook_<stempel>` (aangemaakt als postgres met de migratierol als eigenaar; migraties van de release erin;
     daarna `DROP DATABASE`). Daarin wordt een testeigenaar aangemeld (nagebootste Google, alles in het proces) met een actief technisch
     profiel, en een headless Chromium (alleen loopback, `--host-resolver-rules` → ~NOTFOUND voor al het andere) opent de sleutelpagina's:
     hub /overzicht /zoek, mail /postvak-in, cloud /overzicht, admin /overzicht /updates /diagnostiek /toegang, mcp /dashboard /agenten,
     id (aanmelden, zonder cookies), github /overzicht, ai. Daarna wordt **elke bundel** uit `dist/assets/**` in de browser geïmporteerd.
     Een pagina is **kapot** bij: pageerror/onopgevangen fout, `console.error` met ReferenceError/TypeError, `#root` leeg of alleen een
     strook (geen main/sectie/formulier), een JS-bundel ≠ 200, tekst «Internal server error». De productiedatabase wordt nooit geraakt:
     `rook.mjs` weigert elke databasenaam die niet met `mijnruimte_rook_` begint. Alles draait als `mijnruimte` (systemd-run,
     NoNewPrivileges, ProtectSystem=strict), nooit als root;
   - zonder browser: alleen de **modulecontrole** in Node — elke bundel wordt als ES-module uitgevoerd in een vm-context zonder
     `Buffer`/`process`/`require` (met een lichte DOM-schim). Dat vangt precies de fout van 20261021 in het «paginaskelet» (entry,
     lazy routes van het eerste niveau, tech-chunks en wat die statisch importeren); een lazy bibliotheek dieper (bv. `mdb-reader` bij het
     openen van een Access-bijlage) is een **waarschuwing**, geen terugdraai. Het logboek en «Діагностика» zeggen dan eerlijk
     «рендеринг не перевірено (встановіть browser-controle)»;
3. uitkomst **0** (in orde) → «actief»; **2** (niet uitgevoerd: geen browser, geen postgres-rol, time-out) → ook actief, met een duidelijke
   waarschuwing — nooit terugdraaien op een infrastructuurfout; **1** (kapot) → **automatisch terug** naar de vorige release, herstart,
   gezondheidscontrole, gebeurtenis `ROOK_TERUGGEDRAAID` (warn) met de reden («сторінка admin-updates не рендериться (pageerror: Error:
   Buffer is not defined)») in `gebeurtenissen.jsonl` → zichtbaar op «Оновлення» als «Відкочено автоматично: сторінка не рендериться», en
   de installatie eindigt met `FOUT: installatie van … mislukt: rendercontrole — …` (bij passkey/handtekening neemt `mijn-ruimte-uitrol.sh`
   die regel over als oorzaak: stap «рендер-контроль», code INSTALLATIE_MISLUKT).
4. **Geen lus**: de vorige release wordt na de terugdraai nog **één keer live** nagekeken (publieke pagina's, geen aanmelding) — alleen
   gemeld (`ROOK_MISLUKT` als ook die kapot is), nooit nog een terugdraai. Zonder vorige release: `ROOK_MISLUKT` (error) met de SSH-aanwijzing.
5. **Migraties worden niet teruggedraaid** (zoals altijd: het schema blijft op de nieuwste stand; de rook-stand gebruikt een eigen database
   en laat het productieschema met rust). Houd migraties dus uitbreidend.

**Nazorg (`mijn-ruimte-nazorg.sh`, root, elke minuut).** Naast de gezondheidscontrole: 120 s na de activering (`NAZORG_ROOK_NA`) één keer
`mijn-ruimte-installeer rook-controle --live` tegen de draaiende dienst (publieke pagina's + publieke bundels, via een lokale TLS-proxy omdat
de app-CSP `upgrade-insecure-requests` heeft). Kapot = storing → dezelfde terugdraai als bij drie gezondheidsfouten, gebeurtenis
`NAZORG_TERUGGEDRAAID` met `reden: rook`. Nooit twee keer (markering `nazorg-rook`).

**«Діагностика» → «Сторінки й маршрути».** Elke pagina-controle toont naast de HTTP-schil wat de laatste browsercontrole over DIE pagina zei
(`рендеринг ок у браузері (tijd)` / `рендеринг ЗЛАМАНО: …` → fout ROOK_KAPOT / `лише HTTP, рендеринг не перевірено (встановіть
browser-controle)`). Het item «Рендеринг сторінок» leest `/var/lib/mijn-ruimte-uitrol-status/rook-controle.json` (ok / kapot / verouderd /
niet gecontroleerd / nooit). De knop «Перевірити рендеринг» zet een **leeg** verzoekbestand in de goedkeur-inbox; de nazorg-timer ziet dat,
verwijdert het en voert `rook-controle` uit (stand met testeigenaar; hoogstens 1× per 10 min; nooit terugdraaien). De site start zelf geen browser.
Een kapotte uitslag blijft apart bewaard als `rook-controle-kapot.json`.

**Browser installeren (eenmalig, BYOS):**
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle            # apt-bibliotheken + chrome-headless-shell 156.0.8078.47 (SHA-256) in /srv/mijn-ruimte/browser
sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle --controleer
sudo /usr/local/sbin/mijn-ruimte-installeer rook-controle               # handmatig: stand met testeigenaar (1–2 min), schrijft rook-controle.json
sudo /usr/local/sbin/mijn-ruimte-installeer rook-controle --live        # alleen publieke pagina's van de draaiende dienst
```
Geen `curl | bash`, geen snap: één vastgepind archief met bekende hash, root-eigen, leesbaar voor de dienst. Een distributie-Chromium op
`/usr/bin/chromium` wordt ook gevonden (op Ubuntu is dat een snap die onder systemd niet werkt — gebruik het script).
Omgeving van de installer: `ROOK_UIT=1` (overslaan), `ROOK_CHROMIUM`, `ROOK_GEHEUGEN_MAX` (1500M), `ROOK_TIJD_SEC` (600), `ROOK_PAGINA_SEC` (20).

Tests: `tests/eenheid/rook-controle-20261022.test.ts` (beoordeling, modulecontrole op een synthetische dist met `Buffer.from` → kapot),
`uitrol-rook-terugdraai-20261022.test.ts` (bash-logica van activeren/terugdraaien met nagebootste commando's), `uitrol-nazorg-rook-20261022.test.ts`,
`beheer-diagnostiek-rook-20261022.test.ts`.

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

**De pagina** (`src/agenten/`, de ingang `src/McpAgentenHub.tsx` blijft) heeft deze tabbladen, adresseerbaar via de
hash:

| Hash | Tabblad |
|---|---|
| `#overzicht` | Огляд / Overzicht |
| `#ai` | Підключені ШІ / Verbonden AI |
| `#apparaten` | Пристрої й браузери / Apparaten en browsers |
| `#tokens` | Токени / Tokens (двері сервера — на mcp/verbindingen, технічний профіль) |
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

### 14.2 Fase B3 + B2 (9-10-2026) — ⚙ in de werkbalk, «levend» menu (badges + sms-bellen)

**Geen migratie.** Nieuwe recordtabel `menu_tellers_v1` (generieke RLS op `data.userId`, zoals migratie 0007), twee nieuwe routes:
- `POST /api/owner/menu/tellers` — eigen tellers lezen; alleen goedgekeurde sessie (anders 403 `OWNER_APPROVED_SESSION_REQUIRED`).
- `POST /api/owner/menu/tellers/zet` — `{bron:'mail', ongelezen:<geheel getal 0…99999>}`; alleen goedgekeurd, alleen vanaf
  mail.tarasevych.com (de dienst wordt aan de host gebonden door `ownerService`), anders 400 `MENU_TELLER_BRON_ONGELDIG` /
  `MENU_TELLER_WAARDE_ONGELDIG`. Er wordt ALLEEN een getal opgeslagen (geen onderwerpen, afzenders of inhoud); één rij per gebruiker,
  alleen geschreven bij een wijziging (E-mail bundelt 1,2 s).

B3 — ⚙ (`Settings2`) als 4e knop in de werkbalk (breed én in het smalle paneel), een echte link naar
`https://id.tarasevych.com/menu#menu-meldingen` (op id.* zelf: binnen de pagina naar de sectie). Налаштування → Меню kreeg de sectie
«Сповіщення в меню»: aan/uit, getal of gekleurde stip, bellen bij aanwijzen, «aandacht voor nieuw» (puls), herinneren (nooit/15/30/60/120
min), stille uren (geen puls/herinnering, badges blijven), per soort aan/uit (Пошта, Безпека, Доступ і запити, Спільний доступ, ШІ та
агенти, Система). Opgeslagen in het bestaande `sidebar`-veld (`meldingen`, strikt genormaliseerd op browser én server).

B2 — bronnen: de bestaande bel-meldingen (`site_notifications`, alleen ongelezen) + de e-mailteller. Soort → menu-item en kleur
(`shared/menu-meldingen.ts`): access_request → Адмін › Доступ (oranje), account_email_conflict → Налаштування › Акаунт (rood),
workspace_share → Мій простір › Огляд (groen), google_login_config → Адмін › Контур (grijs), ongelezen e-mail → Пошта › Вхідні (blauw).
Een badge op een pagina telt ook op het hoofditem. Aanwijzen/focus → bellen (max. 5, nieuwste eerst; tekst via React, geen HTML);
× bij een servermelding = «gelezen» via de bestaande route `notifications/read` (met id, nooit «alles»); × bij de e-mailteller =
verbergen in deze browser tot er MEER ongelezen zijn. Links in bellen alleen https op *.tarasevych.com of een relatief pad.
Toetsenbord: Tab op een item opent de bellen, → gaat erin, Esc terug. `prefers-reduced-motion` zet alle animaties uit.

Afscherming: badges/bellen alleen bij een goedgekeurde sessie (`zijbalkServerDienst() !== ''`); aria-label bevat alleen het aantal;
gasten (toegangscodes, `/toegang`, cookie `tsv_gast`) hebben geen menu en geen `/api/owner`-toegang en krijgen dus niets
(e2e gast-toegang blijft groen). Beperkingen: de e-mailteller wordt alleen bijgewerkt wanneer E-mail open is geweest; in de mobiele
lade staat geen werkbalk en dus geen ⚙ (Налаштування → Меню blijft bereikbaar via het menu).

Tests: `tests/eenheid/menu-meldingen.test.ts` (35: normalisatie, stille uren, doel/links, badges, routes incl. weigeringen en isolatie),
`tests/e2e/menu-v2-meldingen.e2e.ts` (30; screenshots menu-20…menu-24). Opruimen op exact e-mailadres.

Controle na uitrol: Ctrl+F5 → werkbalk: ⚙ zichtbaar → klik → «Сповіщення в меню». E-mail openen → badge op Пошта met het aantal
ongelezen; op een andere dienst aanwijzen → bel «Непрочитані листи: N» → × → badge weg.

### 14.3 Fase B1 (9-10-2026) — snelle overgangen, leescache, vooruitladen, versleutelde concepten

Wat er verandert:

- **Voortgangsbalk** (`src/navigatie-snel.ts`, `#tsv-voortgang`): dunne balk bovenaan in de kleur van het onderdeel
  waar je heen gaat (lichte/donkere tint). Start via de Navigation API (`navigate`-event) of bij een klik in het menu;
  wordt pas na 120 ms zichtbaar (geen geflikker); binnen een onderdeel klaar zodra er ≥ 220 ms geen API-verzoek meer
  loopt; bij een wissel naar een ander subdomein blijft hij lopen tot de pagina wisselt (max. 12 s).
- **Overgangen binnen een onderdeel**: `document.startViewTransition` alleen op de werkruimte
  (`view-transition-name: tsv-werkruimte`), niet bij «minder beweging». Tussen subdomeinen kan dat niet (andere origin);
  daar voorkomen `html{background:var(--boot-bg)}` en vooruitladen de witte flits.
- **Leescache + afbreken** (`src/lees-cache.ts`, `src/platform/client.ts`): stale-while-revalidate, alleen in het
  geheugen, per account (wisselt het account, dan wordt de cache gewist), max. 40 items / 10 min, alleen
  `/api/owner/...`-leesroutes. Toegangscodes, passkeys en sessies tonen direct de vorige stand en verversen op de
  achtergrond; bij het verlaten van een pagina wordt het lopende verzoek afgebroken (`AbortController`).
- **Vooruitladen tussen subdomeinen**: HTTP-header `Speculation-Rules: "/speculatie.json"` op HTML-antwoorden
  (géén inline-script, dus de CSP blijft exact `script-src 'self' 'wasm-unsafe-eval'`). De regels werken alleen op
  onzichtbare links met `data-tsv-vooruit` in `#tsv-vooruit`; die maakt de app bij aanwijzen (90 ms) of focus van een
  menu-item. Alleen `https`, alleen eigen hosts, nooit links met `code/state/token/proof/transaction/redeem/handoff/
  auth_broker/oauth_*/consent/invite`. HTML krijgt ook `Supports-Loading-Mode: credentialed-prerender`
  (nodig voor prerender over subdomeinen). API-antwoorden krijgen deze headers niet.
- **Service worker v10**: bij installatie worden de JS/CSS-ingangsbestanden uit de start-HTML in de cache gezet
  (max. 24). Oude caches (v9 enz.) worden bij activeren opgeruimd zoals voorheen.
- **Versleutelde concepten** (`src/concepten.ts`): alleen velden met `data-concept` (AI-chat, mailantwoord,
  GitHub-issue, MCP-bord, notitie bij toegangscode); nooit wachtwoord- of eenmalige-codevelden. AES-GCM 256 met een
  **niet-exporteerbare** sleutel in IndexedDB `tsv-concepten`, per account (rij-id = eerste 32 hex van
  SHA-256(`tsv-concept|<id>`), dus geen e-mail/id in de opslag), AAD = rij-id, IV 12 bytes, 7 dagen geldig,
  max. 50 concepten / 20 000 tekens. Herstel na herladen met melding «Чернетку відновлено» en knop «Відкинути».
  Uitzetten wist alle concepten én sleutels. Niets gaat naar de server.

Instellingen (Налаштування → Меню → «Швидкість переходів і чернетки», `#menu-snelheid`, opgeslagen in de zijbalk-
voorkeur `snelheid`):

| Schakelaar | Standaard |
|---|---|
| Смужка завантаження (voortgang) | aan |
| Плавна зміна сторінок (overgangen) | aan |
| Підвантажувати розділ при наведенні (vooruitladen) | aan |
| Повністю готувати розділ заздалегідь (prerender) — experimenteel | **uit** |
| Зберігати чернетки (зашифровано) (concepten) — experimenteel | **uit** |

Beperkingen: geen View Transition tussen subdomeinen; vooruitladen kan in oudere Chrome-versies vervallen als de doelpagina
een service worker heeft; concepten alleen voor de 5 gemarkeerde velden (niet de Gmail-editor) en per subdomein
(IndexedDB is per origin); Firefox/Safari zonder Speculation Rules laden gewoon zonder vooruitladen.

Controle na uitrol:

1. `curl -sI https://id.tarasevych.com/menu | grep -i -E 'speculation-rules|supports-loading-mode|content-security'` →
   `"/speculatie.json"`, `credentialed-prerender`, CSP ongewijzigd.
2. `curl -sI https://id.tarasevych.com/speculatie.json` → `application/speculationrules+json`.
3. `curl -s https://id.tarasevych.com/service-worker.js | grep "VERSION='v10'"`.
4. In de browser: klik Налаштування → Мови: balk in grijs; aanwijzen Пошта → in DevTools (Application → Speculative
   loads) staat mail.tarasevych.com als prefetch; daarna openen = direct en aangemeld.
5. Concepten blijven uit tot ze in de instellingen worden aangezet.

### 14.4 Stage 2 (9-10-2026) — indeling van het menu, dock rechts/boven/onder, bewerkmodus

Wat er is:
- **Plaatsen**: «Швидкий доступ» (snelbalk, boven in het menu), het hoofdmenu, de secties (submenu per onderdeel) en «Стартова
  сторінка» (snelkoppelingen op Мій простір → Огляд). Onderdelen (`svc:`) alleen op het bovenste niveau; pagina's (`pg:`) overal.
  Alleen onderdelen waartoe de gebruiker toegang heeft verschijnen (ook kopieën). Logica: `shared/menu-indeling.ts` (puur, getest).
- **Bewerkmodus** (✎ in de werkbalk, in de lade op mobiel, of Налаштування → Меню → «Редагувати меню»): slepen met de muis,
  op aanraakschermen lang indrukken (450 ms); Alt/Ctrl/⌘ tijdens slepen = kopie (geest toont «+»), Esc = annuleren.
  Klik/Enter op een item = actiemenu (Вище/Нижче, «Перемістити до…», «Дублювати до…», kopie verwijderen, terugzetten);
  Alt+pijltjes = verplaatsen, Ctrl/⌘+Z = ongedaan maken. Elke wijziging: melding met «Скасувати» + schermlezerstatus.
- **Kopieën** houden de kleur van hun herkomst-onderdeel (`itemAccent`) en tonen de herkomst als label.
- **Terugzetten**: per item (override + alle kopieën weg) in het actiemenu en in Налаштування → Меню («Змінені пункти»);
  «Скинути все» zet ook de positie/het dock terug. Beide met «Скасувати».
- **Positie** (Налаштування → Меню → «Розташування й порядок меню»): Ліворуч / Праворуч (gespiegeld) / Вгорі / Внизу.
  Boven/onder = zwevend dock (iconen) met transparantie 0–60 % (met vervaging) en optionele vergroting zoals macOS
  (alleen muis; niet bij «minder beweging», niet tijdens bewerken). Klik op het actieve onderdeel opent een paneel met de
  pagina's. Op een telefoon (≤ 700 px) blijft het altijd de lade links.
- Bewaard in `owner_ui_preferences_v1.sidebar` (`items`, `kopieen`, `dock`), genormaliseerd op server en browser; de server wint.

E2E alleen lokaal (eis Pavlo): `scripts/e2e-lokaal.mjs` weigert e2e-bestanden met Playwright-API-verzoeken vanuit Node
(`ctx.request`/`page.request`/`request.newContext`) of zonder `chromeArgs()`, en blokkeert in het testproces elke socket/DNS
buiten loopback. Chrome krijgt `chromeArgs()` uit `tests/e2e/server.ts`: `*.tarasevych.com` (alle poorten) → 127.0.0.1:<poort>,
al het andere `~NOTFOUND`. De nieuwe test controleert daarnaast dat elk paginaverzoek naar *.tarasevych.com (= lokaal) gaat.

Na de uitrol controleren:
1. Налаштування → Меню: blok «Розташування й порядок меню»; kies «Внизу» → dock onderaan; schuif transparantie; vergroting aan.
2. ✎ → sleep een item; melding «Скасувати» werkt; Ctrl+slepen van een pagina naar «Швидкий доступ» = kopie in de kleur van
   het onderdeel; «Скинути все» → standaard.
3. Op de telefoon: lade, ✎ in de kop, lang indrukken + slepen; lade sluiten = bewerkmodus uit.

Datamodel stage 2: `shared/menu-model.ts` — stabiele ids `svc:<dienst>` / `pg:<dienst>/<pagina>`, standaardplaatsing uit
`MENU_PAGINAS` (gelijk aan `canonical-service.js`, door een test bewaakt), overrides per item (`zichtbaar`, `volgorde`, `plaats`,
`ouder`, `icoon`), kopieën (`k-…` → `zijbalk`/`snelbalk`/`start`), dock (`links|rechts|boven|onder`, transparantie 0–60, vergroting),
`itemTerugzetten`, `allesTerugzetten`, `menuSamenstellen`.

## 15. Besluiten van de eigenaar met een passkey-handtekening: terugdraaien en externe MCP-hosts zonder SSH (22.10.2026)

**Waarom.** «Відкат до попереднього» op mcp.*/dashboard werkte alleen met `"opdracht": {"terugdraaien": true}` in het root-bestand
(standaard uit, met reden: een gekaapte app mag de site niet terugdraaien), en de witte lijst van externe MCP-hosts (`externeMcpHosts`)
was alleen via SSH te wijzigen. De eigenaar wil beide beslissen op de site — met dezelfde zekerheid als het goedkeuren van updates (§13).

**Principe.** `/etc/mijn-ruimte/mcp-rechten.json` blijft van root en wordt NIET schrijfbaar voor de app. Een besluit gaat hetzelfde pad als
een update-goedkeuring:

```
browser (mcp.*)  ── WebAuthn-assertie over challenge = H(doel 'eigenaar-besluit', sha256(canonieke inhoud), nonce, verloopt ≤ 5 min)
   │   POST /api/owner/besluit/starten → app.eigenaar_besluiten (0105, ontwerp) + app.goedkeur_uitdagingen (eenmalig)
   │   POST /api/owner/besluit/ondertekenen → voorcontrole in de app → /srv/mijn-ruimte/besluit-inbox/besluit-<id>.json + `aanvraag`
   ▼
mijn-ruimte-besluit.path ─► mijn-ruimte-besluit.service ─► /usr/local/sbin/mijn-ruimte-besluit verwerk (root)
   │   1. mijn-ruimte-passkey verifieer-besluit <bestand>: hash ZELF herberekend (besluit-kern.mjs), schakelaar van dit soort open,
   │      assertie tegen /etc/mijn-ruimte/goedkeur-passkeys.json (rpId/origin admin|id|mcp, UV, ≤ 5 min, nonce nooit eerder gezien)
   │   2. terugdraaien: actieve release == `van`, `naar` bestaat en is bruikbaar, ≤ 1× per 10 min → mijn-ruimte-installeer terugdraaien <naar>
   │      externe-hosts: sleutel externeMcpHosts vervangen (tmp + rename, zelfde eigenaar/rechten, reservekopie, teruglezen + JSON-controle)
   ▼
/var/lib/mijn-ruimte-uitrol-status/besluit-<id>.json (root:mijnruimte 0640) ◄── POST /api/owner/besluit/status (de pagina leest live)
gebeurtenissen.jsonl (bron «besluit»), /var/lib/mijn-ruimte/besluit/journaal.jsonl (root), app.audit (eigenaar_besluit_*)
```

Zonder de passkey van de eigenaar gebeurt er niets: een gecompromitteerde app kan hoogstens een bestand in de inbox leggen dat root
weigert (SLEUTEL_ONBEKEND, HANDTEKENING_ONGELDIG, UITDAGING_ONJUIST bij gewijzigde inhoud, HERGEBRUIKT bij een tweede keer, VERLOPEN).
Root leest nooit iets anders uit de inbox dan dat ene JSON-bestand (geen symlinks, ≤ 64 KiB), haalt het eerst uit de inbox en vertrouwt
alleen zijn eigen normalisatie van de inhoud.

### 15.1 Drie standen voor terugdraaien (mcp-rechten.json)

| `"opdracht": {"terugdraaien": …}` | `"terugdraaien-passkey"` | Gevolg |
|---|---|---|
| `true` | ontbreekt of `true` | de oude directe knop (step-up) werkt **én** het passkey-besluit |
| ontbreekt / `false` (standaard) | ontbreekt of `true` (standaard) | **alleen via het passkey-besluit** (de wizard op mcp.*/dashboard) |
| (wat dan ook) | `false` | terugdraaien vanaf de site is **dicht**; alleen SSH (`mijn-ruimte-installeer terugdraaien`) |

Voor de witte lijst: `"externe-hosts-passkey": false` sluit het kanaal; anders open. Migraties worden bij geen enkele terugdraaiing
teruggedraaid (zie §8); de wizard zegt dat er expliciet bij.

### 15.2 Bediening

- **mcp.*/dashboard → Керування сервером → «Відкат до попереднього»**: wizard met «Зараз активний» → «Повернути на» (standaard de vorige,
  elke volledige release uit `/srv/mijn-ruimte/releases` kan), waarschuwing over migraties en de 10-minutenlimiet, «Підписати passkey й
  відкотити» → «Рішення передано, root перевіряє підпис…» → live stand (de dienst herstart; de pagina wacht daar doorheen) →
  «Виконано» / «Відхилено root-ом» met code en reden / «Не вдалося».
- **mcp.*/agenten → Зовнішні MCP → «Дозволені хости»**: de lijst uit het bestand (chips), hosts uit `EXTERNE_MCP_HOSTS` apart
  (niet te wijzigen), toevoegen/weghalen, «Підписати passkey й зберегти список» → root schrijft → de pagina herlaadt de witte lijst.
- Beide tonen eerlijk waarom het niet kan: `BESLUIT_UIT` (schakelaar), `GEEN_PASSKEY` (geen root-passkey; «Способи входу» → «Може
  схвалювати оновлення сервера»), geen passkey-browser, geen andere volledige release.

### 15.3 Bestanden, units, omgeving

- `deploy/goedkeuring/besluit-kern.mjs` (normalisatie + hash, gedeeld door app en root; geïnstalleerd naast de WebAuthn-kern in
  `/usr/local/lib/mijn-ruimte/goedkeuring/`), `goedkeur-hulp.mjs verifieer-besluit`, `webauthn-kern.mjs` doel `eigenaar-besluit`;
- `deploy/besluit/mijn-ruimte-besluit.sh` → `/usr/local/sbin/mijn-ruimte-besluit` (`verwerk` | `status`), units `mijn-ruimte-besluit.path`
  (PathChanged `/srv/mijn-ruimte/besluit-inbox/aanvraag`) en `mijn-ruimte-besluit.service`; de installer (`besluit_inrichten`) zet alles
  neer en maakt `/srv/mijn-ruimte/besluit-inbox` (mijnruimte 0750) en `/var/lib/mijn-ruimte/besluit` (root 0700: journaal, stempel,
  reservekopieën `mcp-rechten.<tijd>.<id>.bak`, installerlogs);
- `backend/eigenaar-besluit.ts` (routes `/api/owner/besluit/{overzicht,starten,ondertekenen,status}`, alleen eigenaar op mcp/admin),
  migratie `0105_eigenaar_besluiten.sql` (RLS: eigen rijen; app-rol alleen lezen), `shared/eigenaar-besluit.ts` (teksten, «?»),
  `src/besluit/*` (wizard, hosts), `src/McpServerBeheerKaart.tsx`, `src/agenten/TabExternMcp.tsx`;
- omgeving (alleen tests/stand): `BESLUIT_INBOX`, `BESLUIT_APP_ROOT`, `OPDRACHT_STATUS_DIR`, `MCP_RECHTEN_PAD`, `GOEDKEUR_SLEUTELS`;
  root-script buiten root: `BESLUIT_*` alleen met paden onder /tmp.
- Terugdraaien op een besluit schrijft de installer als `TERUG_OK` met herkomst `besluit` (wie = `passkey`); in «Історія» staat die als
  methode «Опрацювання завдання» met «Відкочено».

### 15.4 Controle en problemen

```bash
systemctl status mijn-ruimte-besluit.path; journalctl -u mijn-ruimte-besluit -n 50 --no-pager
sudo mijn-ruimte-besluit status && sudo cat /var/lib/mijn-ruimte-uitrol-status/besluit-stand.json
sudo tail -n 5 /var/lib/mijn-ruimte/besluit/journaal.jsonl
```

Geen antwoord binnen 15 min → de site sluit het besluit af als «verlopen / GEEN_UITKOMST» en noemt deze opdrachten. Tests:
`besluit-root-20261022.test.ts` (echte root-hulp + root-script met testpaden en een installer-stub; 47 aanvallen en goede wegen),
`besluit-app-20261022.test.ts` (routes, RLS), `uitrol-geschiedenis-tijdlijn-20261022.test.ts`; stand `besluit-*` (virtuele passkey via CDP).

## 16. Werkblad v3 — data

Etappe A (data-laag) van het vrije werkblad. Bestanden: `migrations/0114_werkblad_v3.sql`, `shared/werkblad-v3.ts`,
`backend/werkblad-v3.ts`, `src/werkblad/api-v3.ts`, tests `tests/eenheid/werkblad-v3-*.test.ts`.

**Wat 0114 doet.** Drie nieuwe tabellen onder RLS (zelfde vorm als 0112): `app.werkblad_v3_lade` (per user_id + ruimte:
achtergrond, herkomst, `v2_backup`), `app.werkblad_layout` (per user_id + ruimte + apparaat: modus, canvasmaat, versie) en
`app.werkblad_items` (één rij per object: x, y, w, h, z, kind, item_id, overrides, config ≤ 6000 bytes). Hoogstens 400 objecten
per laag. Voegt de vlag `werkblad-v3` toe met `aan=false`. Raakt `app.werkblad_indeling` (v2) niet aan. Idempotent.

**Vlag.** `werkblad-v3` staat standaard UIT. Uit = de v3-routes doen niets (laden → `{aan:false}`, bewaren → 403
`WERKBLAD_V3_UIT`), het werkblad werkt exact als v2. Aanzetten voor één persoon: in «Прапорці» de gebruiker toevoegen
(of `UPDATE app.feature_flags SET aan=true, gebruikers=ARRAY['<user-id>'] WHERE sleutel='werkblad-v3'`).
Uitzetten wist GEEN v3-gegevens; weer aanzetten toont precies wat er stond.

**Overzetting v2 → v3.** Lui en eenmalig: bij het eerste `v3/laden` met de vlag aan, per lade, in één transactie
(`INSERT … ON CONFLICT DO NOTHING`). De v2-rij blijft ongewijzigd; een kopie staat in `werkblad_v3_lade.v2_backup`.
Computer = `plaatsen(v2.items, 12)` omgerekend naar px (canvas 1280), tablet = eigen laag op 768 px (6 kolommen),
telefoon = eigen flow-laag op 390 px.

**Terugdraaien (per persoon).** `POST /api/owner/hub/werkblad/v3/terugdraaien` (werkt ook met de vlag uit): zet de
v2-backup terug in `app.werkblad_indeling` (versie +1). Met `{"v3Wissen":true}` ook de v3-lade van die ruimte wissen;
dan wordt bij het volgende laden opnieuw eenmalig overgezet.

**Terugdraaien (alles).** 1) vlag uit (volstaat altijd); 2) alleen als het echt moet:
`DROP TABLE app.werkblad_items, app.werkblad_layout, app.werkblad_v3_lade; DROP FUNCTION app.werkblad_items_limiet();
DELETE FROM app.feature_flags WHERE sleutel='werkblad-v3';` en de rij `0114_werkblad_v3` uit `app.schema_migrations`. v2 blijft werken.

**Controle na uitrol.** `SELECT sleutel, aan FROM app.feature_flags WHERE sleutel='werkblad-v3';` → `werkblad-v3 | f`.
`SELECT relrowsecurity FROM pg_class WHERE relname IN ('werkblad_v3_lade','werkblad_layout','werkblad_items');` → drie keer `t`.
Eenheidstests: `node scripts/eenheidstests.mjs werkblad-v3`.

**Bekende grenzen.** De eigen achtergrondafbeelding blijft in de v2-tabel (`achtergrond_eigen`); v3 bewaart alleen de keuze.
Sinds etappe D (integratie) geeft `backend/index.ts` het register mee (`REGISTER_V3_HAKEN` uit `shared/werkblad-register.ts`):
de server bewaart alleen items die in het register bestaan, met de juiste soort, in de juiste ruimte en voor het apparaat (zie §16-D).
## Werkblad v3 — bibliotheek

**Wat:** het register «Все на сайті / Alles op de site» (`shared/werkblad-register.ts`) en de bibliotheek-UI (`src/werkblad/bibliotheek/*`).
Nog NIET aangesloten op `/overzicht`: het canvas (Etappe C) en de datalaag (Etappe A) koppelen het achter de vlag `werkblad-v3`.

**Bronnen (niets met de hand):** diensten/pagina's uit `shared/menu-model.ts` (14 diensten, 90 pagina's) + `shared/beheer-paginas.ts`;
widgets uit `shared/werkblad-indeling.ts` (21, zelfde id's met voorvoegsel `wdg:`); 7 veilige opdrachten (`cmd:`) die alleen de plek
openen waar je iets doet (geen verzenden/verwijderen); persoonlijke snelkoppelingen `usr:` (eigen naam/icoon op een bestaand item);
mappen `map:` (één niveau). Een nieuwe menupagina komt automatisch in het register; de eenheidstest faalt als een icoon of titel ontbreekt.

**Veiligheid:** geen enkel item heeft een URL. `launchDoel()` geeft `{dienst, tab}`; de browser maakt het adres met de canonieke router.
`toegestaanVoor()` wordt bij tonen, toevoegen én bij elke klik opnieuw berekend (zelfde regel als `dienstToegestaan`): api/admin en
beheerpagina's alleen in de technische ruimte, mcp alleen met recht `api-platform` of technisch profiel. `planned`/`denied` blijven
zichtbaar met reden maar zijn niet toe te voegen of te openen. Eigen iconen alleen uit `ICOON_PRESETS`. De server moet elk v3-item
opnieuw tegen `registerItem()` + `toegestaanVoor()` valideren (taak van Etappe A).

**Contract naar het canvas:** `CustomEvent('werkblad-bibliotheek:toevoegen', {detail:{itemId, kind, point?}})` op `window`, en bij slepen
`dataTransfer` type `application/x-werkblad-bibliotheek` (zelfde JSON, zonder point). Lezen altijd met `leesVerzoek()` (strikt).

**Testen (alleen lokaal):**
- `node scripts/eenheidstests.mjs werkblad-register` — 30 controles.
- `node scripts/e2e-werkblad-bibliotheek.mjs` — Playwright op een eigen 127.0.0.1-server met de ontwikkelstand
  `src/werkblad/bibliotheek/stand.tsx`; elk verzoek naar een andere host wordt afgebroken en geteld (eis 0). Schermafdrukken
  `bib-*.png` in `E2E_SCREENSHOTS` (standaard `/workspace/audit-werkblad`).

**Terugdraaien:** de bibliotheek wordt alleen gebruikt achter de vlag `werkblad-v3`; vlag uit = oude werkblad v2, niets te migreren.

## 16-D. Werkblad v3 — integratie (etappe D)

**Wat.** `src/werkblad/Werkblad.tsx` is nu een poort: vlag `werkblad-v3` uit → exact de v2-code (`WerkbladV2`, ongewijzigd);
vlag aan → `src/werkblad/WerkbladV3.tsx` (aparte chunk, alleen dan geladen). De poort vraagt `v3/laden` (vlag uit → `{aan:false}`,
niets overgezet) en onthoudt de uitkomst per gebruiker in `localStorage` (`tsv:werkblad-v3-aan:<id>`) tegen knipperen.

**WerkbladV3.** Apparaatklasse uit de echte containerbreedte (ResizeObserver; < 600 telefoon, < 1024 tablet). Elke klasse een eigen
laag; ontbreekt die (bijv. na `v3Wissen`), dan één keer `aanpassenVanaf(PC)` (telefoon in flow-modus) en bewaren. Canvas met de live
v2-widgets (zelfde `Inhoud`, lui), `ShortcutTegel`, `MapTegel`. Werkbalk «Налаштувати робочий стіл» → «Бібліотека», «Параметри»
(achtergrond, reset met bevestiging, eigenaar: «Повернути розкладку v2»), «Готово». Toevoegen via het contract
`werkblad-bibliotheek:toevoegen` (knop/toetsenbord) en HTML5-slepen uit het paneel. Bewaren: één keten, versie per laag;
409 → conflictbalk «Перезавантажити», niets overschreven; netwerkfout → «Повторити».

**Servervalidatie.** `REGISTER_V3_HAKEN`: `map:<naam>` = map (sjabloon `map:nieuw`), `usr:<id>` alleen met `config.basis` = bestaande
snelkoppeling, overige id's moeten in het register staan; soort, ruimte (privé/technisch) en apparaat moeten kloppen; w/h binnen
de registergrenzen (minimum nooit breder dan het canvas). planned/legacy-items blijven bewaard (getoond als «скоро»/oud);
persoonlijke rechten (mcp/api-platform) worden bij elke klik gecontroleerd en door de doeldienst zelf — een plek op het werkblad is geen recht.

**Mappen en eigen snelkoppelingen.** Een snelkoppeling die op een map wordt neergezet krijgt `parent` (bewaard in `werkblad_items.parent`);
«Вийняти» in de geopende map zet hem terug. Map weg → inhoud terug op het werkblad. Eigen snelkoppelingen (`usr:`) worden bewaard
zodra ze op het werkblad staan (`titleOverride`, `iconOverride`, `config.basis`); nog niet geplaatste alleen lokaal in de browser.

**Testen (alleen lokaal).** Eenheid: `node scripts/eenheidstests.mjs werkblad` (incl. routes met register op de echte router + DB).
Interactief tegen de echte server + DB: start server/proxy zoals `scripts/lokaal-e2e/test-alles.sh` (eigen db, poort), dan
`PLAYWRIGHT_CORE=… PROXY_PORT=… DATABASE_URL=… node scripts/lokaal-e2e/werkblad-v3-integratie.mjs` (zaait een testaccount + sessie,
zet de vlag alleen voor dat account, ruimt alles op; elk verzoek buiten *.tarasevych.com→127.0.0.1 wordt geblokkeerd en geteld).

**Aanzetten voor één persoon.** `UPDATE app.feature_flags SET aan=true, gebruikers=ARRAY['<user-id>'] WHERE sleutel='werkblad-v3';`
(of via «Прапорці»). Uitzetten: `aan=false` / persoon uit de lijst — v2 werkt meteen weer, v3-gegevens blijven.

## 17. Technische ruimtes v2 (vlag `tech-ruimtes-v2`, migratie 0115)

Wat: twee parallelle ruimtes van één account («Звичайний» / «Технічний»), drie termijnen (`tijd`, `tot-technisch-einde`,
`tot-site-uitloggen`), pauze (wisselen zonder opnieuw aanmelden), één beslisfunctie (`shared/ruimte-toegang.ts`) voor site, AI/MCP en
extensie. Contract: `docs/ontwerp/TECH-RUIMTES-API.md`. Vlag UIT = exact het oude gedrag.

### 17.1 Uitrol
1. Archief uitrollen zoals gewoonlijk; `npm run migrate` voert `0115_tech_ruimtes_v2` uit (idempotent, mag opnieuw).
   Controle: `SELECT sleutel, aan FROM app.feature_flags WHERE sleutel LIKE 'tech-ruimtes-v2%';` → twee rijen, beide `false`.
2. Er verandert niets tot een vlag aangaat.

### 17.2 Stap 0 — schaduw (aanbevolen eerst, enkele dagen)
- Zet `tech-ruimtes-v2-schaduw` aan (venster «Прапорці» → «Змінити» → hoofdschakelaar aan) of env `TECH_RUIMTES_V2_SCHADUW=1`.
- Gedrag blijft het oude. Verschillen tussen de oude controles en de strenge regel komen in het logboek als
  `owner.tech.schaduw.verschil` (punt: `tab-zonder-sessie`, `mcp-account-breed`, `eigenaar-definitie`), hoogstens één per 10 min per soort.
- Controle: `SELECT details, created_at FROM app.audit WHERE action = 'owner.tech.schaduw.verschil' ORDER BY id DESC LIMIT 50;`

### 17.3 Aanzetten — eerst alleen voor de eigenaar
- `UPDATE app.feature_flags SET aan = true, gebruikers = ARRAY['<user-id eigenaar>'] WHERE sleutel = 'tech-ruimtes-v2';`
  (of «Прапорці» → `tech-ruimtes-v2` → «Тест: так» = alleen voor u tot 03:00 / einde technisch profiel).
- Gevolgen voor wie de vlag heeft:
  - `/api/owner/tech/activeren` → 409 `GEBRUIK_RUIMTES_V2`; starten via de nieuwe UI (`/api/owner/hub/tech/ruimtes/starten`).
  - Lopende OUDE activeringen tellen niet meer: na aanzetten opnieuw starten.
  - AI/MCP is pas technisch na een expliciete keuze in «Доступ і терміни» (`ai-zetten`) én met een lopende, niet-gepauzeerde sessie.
  - Uitloggen in één tabblad laat ontgrendelingen van de extensie staan; uitloggen van de site / «вийти всюди» trekt ze in.
- De root-schakelaar `beheer-alleen-tech` en de noodschakelaar blijven precies zoals ze zijn; v2 leest bij afdwingen alleen de nieuwe sessie.
  De eigenaar kan zijn profiel niet verliezen en mag altijd starten.

### 17.4 Terugdraaien
- `UPDATE app.feature_flags SET aan = false, gebruikers = '{}' WHERE sleutel = 'tech-ruimtes-v2';` → binnen 3 s weer het oude gedrag
  (cache per gebruiker). Rijen in `app.tech_ruimte_*` blijven staan maar worden niet gelezen; opnieuw technisch = oude activering.
- Volledig verwijderen is niet nodig. Indien toch: `DROP TABLE app.tech_ruimte_tabs, app.tech_ruimte_ai, app.tech_ruimte_sessies;`
  en `DELETE FROM app.feature_flags WHERE sleutel LIKE 'tech-ruimtes-v2%';` (eerst de vlag uit).

### 17.5 Bekende grenzen
- Pauze geldt per aanmelding (alle tabbladen van die browser-aanmelding samen), niet per tabblad.
- AI-instelling `verbindingId` wordt nu per account toegepast (de MCP-poort kent de verbinding-id niet); per verbinding = volgende stap.
- Adminpagina's vragen de technische ruimte alleen als de bestaande afdwinging (root/site-schakelaar, §OPA) aan staat.

## 18. Coördinatie van AI-agenten op de server (ORCH-001 etappe 3, 31.10.2026)

**Waarom.** De coördinatie (taken, wachtrij, inleveringen, regels — `AGENTS.md`, `orchestratie/*`, `scripts/orch.mjs`) was alleen vanaf de
opdrachtregel te bedienen en de regels alleen via git + SSH-handtekening op de pc van de eigenaar te wijzigen. De eigenaar wil het overzicht
op de site, pakketten van agenten zonder SSH aannemen en regels wijzigen met dezelfde zekerheid als het goedkeuren van updates (§13, §15).

**Principe.** Site, HTTP en MCP hebben géén eigen logica: `backend/orch-opslag.ts` roept dezelfde functies aan als de CLI
(`scripts/orch/inleveren.mjs` → `inleveren`, `scripts/orch/kern.mjs` → `beoordeelVoorstel`, `vergrendel`, `compacteContext`). De app werkt
op een eigen werkkopie van de repository en schrijft nooit naar `/etc`, `/var/lib/mijn-ruimte` of de productie-release.

```
agent / eigenaar ── mcp.*/agents «Координація» · /api/owner/orch/* (alleen eigenaar) · MCP orch_* (zie beleid.json → site)
   │   overzicht/context/taak-start → leest ORCH_WORTEL; inleveren: stukken van 512 KiB → ORCH_INBOX → SHA-256 → `inleveren` (zelfde pijplijn)
   │   regels: voorstel (beoordeelVoorstel) → POST /api/owner/besluit/starten soort «orch-regels» → passkey (§15)
   ▼
mijn-ruimte-besluit (root): verifieert de assertie en schrijft ALLEEN
   │   /var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl (root, 0600; bron van waarheid)
   │   /var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json (root:mijnruimte 0640; laatste 50, kopie voor de app)
   ▼
app (regels/toepassen): bevestiging aanwezig + voorstel past + werkkopie schoon → tak regels/<versie>-<tijd>: regelbestanden, regels.lock.json
   (eigenaar.soort = passkey, besluit, passkey), CONTEXT-COMPACT.md → `orch controleer` (fout = alles weg) → commit → git push -u origin
gitops-ophalen.sh (root): vertrouwt een passkey-lock alleen als dezelfde regel (besluit/regelsVersie/hash/kritiekHash/voorstel) in het root-journaal staat
```

### 18.1 Eenmalig inrichten (eigenaar, via SSH)
1. Werkkopie van de coördinatie (de installer maakt die bewust niet: hij heeft geen sleutel en hoort die niet te hebben):
   ```bash
   sudo -u mijnruimte git clone --branch integratie git@github.com:Tarasevych/hub.git /srv/mijn-ruimte/orch-repo
   sudo -u mijnruimte git -C /srv/mijn-ruimte/orch-repo config user.name "Mijn Ruimte orch" && sudo -u mijnruimte git -C /srv/mijn-ruimte/orch-repo config user.email "orch@tarasevych.com"
   ```
   Gebruik een **deploy key met schrijfrecht** (GitHub → repo → Settings → Deploy keys) voor de gebruiker `mijnruimte`, nooit de persoonlijke
   sleutel van de eigenaar. Zonder schrijfrecht blijft alles werken, maar de tak `regels/*` blijft op de server staan (`gepusht: false`,
   `PUSH_MISLUKT`) tot u hem zelf pusht. Zonder werkkopie toont de site eerlijk `ORCH_GEEN_REPO` en doet niets alsof.
2. Inbox voor uploads: `install -d -o mijnruimte -g mijnruimte -m 0750 /srv/mijn-ruimte/orch-inbox` (de installer `installeer-app.sh` doet dit
   ook, `orch_inrichten`).
3. Omgevingsvariabelen van de app (alleen als de paden afwijken): `ORCH_WORTEL`, `ORCH_INBOX`; de app leest verder `OPDRACHT_STATUS_DIR`
   (standaard `/var/lib/mijn-ruimte-uitrol-status`) en `MCP_RECHTEN_PAD` (`/etc/mijn-ruimte/mcp-rechten.json`), beide alleen lezen.
4. De besluit-dienst (§15) kent het soort `orch-regels` na het uitrollen van `deploy/besluit/mijn-ruimte-besluit.sh` en `besluit-kern.mjs`.
   Schakelaar in `/etc/mijn-ruimte/mcp-rechten.json`: `"orch-regels-passkey": false` zet alleen de regelbevestiging dicht (standaard open;
   de pagina toont dan `BESLUIT_UIT`). `terugdraaien` en `externe-hosts` blijven onafhankelijk.
5. **Publieke sleutels van de eigenaar voor de regels — root-kopie (verplicht voor GitOps met SSH-handtekening).** Sinds de onafhankelijke
   review van 31.10.2026 verifieert `gitops-ophalen.sh` een SSH-ondertekende `regels.lock.json` (eigenaar zonder passkey) écht:
   `ssh-keygen -Y find-principals` + `ssh-keygen -Y verify -n mijn-ruimte-regels` tegen `/etc/mijn-ruimte/eigenaar-ondertekenaars` — nooit tegen
   `orchestratie/eigenaar-ondertekenaars` uit de release, want dat bestand kan een agent meesturen. Zet het bestand zelf, net als §3; de
   installer kopieert het bewust niet uit het pakket:
   ```bash
   printf 'eigenaar@mijn-ruimte namespaces="mijn-ruimte-regels" %s\n' 'ssh-ed25519 AAAA…' > /etc/mijn-ruimte/eigenaar-ondertekenaars
   chown root:root /etc/mijn-ruimte/eigenaar-ondertekenaars && chmod 0644 /etc/mijn-ruimte/eigenaar-ondertekenaars
   ```
   Zonder dit bestand weigert GitOps automatisch installeren met «eigenaar-ondertekenaars op de server ontbreekt»; de passkey-weg
   (root-journaal, stap 4) heeft het niet nodig. Dezelfde regels (`namespaces="mijn-ruimte-regels"`, geen `cert-authority`) gelden voor
   `node scripts/orch.mjs controleer` en `bevestig` op de pc van de eigenaar.
6. **Schrijfrechten van de app-dienst.** `deploy/mijn-ruimte.service` draait met `ProtectSystem=strict`; sinds de adversariële review van
   31.10.2026 staan `ReadWritePaths=-/srv/mijn-ruimte/orch-inbox` en `ReadWritePaths=-/srv/mijn-ruimte/orch-repo` erin (zonder: de eerste upload
   faalt met `EROFS`). De installer zet de unit mee neer; bij een eigen kopie van de unit: beide regels toevoegen en
   `systemctl daemon-reload && systemctl restart mijn-ruimte`. Controle: `systemctl show mijn-ruimte -p ReadWritePaths`.

### 18.2 Dagelijks gebruik
- **Overzicht**: regelsversie + lock, basis, integratietak, geïnstalleerde versie, agenten, taken (met «regels verouderd»), wachtrij, laatste
  inleveringen, uitslag van `controleer`. MCP: `orch_overzicht`, `orch_context` (de compacte context voor een agent zonder GitHub).
- **Inleveren vanaf de site**: pakket `mijn-ruimte-<versie>-<agent>-overdracht.zip`, zip/tar.gz met `ORCH-OVERDRACHT.json` of git patch
  (≤ 300 MiB, 20 uploads per uur per persoon). Dezelfde pijplijn als `node scripts/orch.mjs inleveren --kanaal web_upload|mcp`: tak vanaf de
  basis, regels, conflicten met `integratie`, tests, record in `orchestratie/inleveringen/`, wachtrij. Er wordt niets samengevoegd of
  geïnstalleerd. Een geweigerde inlevering laat geen tak achter (wel het record).
  **Veiligheid van de inlevering (review 31.10.2026).** Via de site en MCP voert de server nooit code uit het pakket en nooit opgegeven
  shell-opdrachten uit: als «test» draait alleen `node scripts/orch.mjs controleer` uit de **eigen werkkopie** (`--wortel` wijst naar het
  tijdelijke werkboom van de inlevering) in een schone omgeving zonder `DATABASE_URL`, sleutels of pepers. Een `tests`-parameter met iets
  anders geeft `TESTS_NIET_TOEGESTAAN` (400). Archieven worden vóór het uitpakken gecontroleerd — symlinks, speciale bestanden, `..`,
  absolute paden of een `.git`-map geven `INHOUD_ONVEILIG`; een `github_pr`-bron die met «-» begint geeft `REF_ONGELDIG`. Een upload hoort bij
  wie hem begon (de eigenaar via de site, of een agent via zijn MCP-verbinding — client, agent én grant-id, dus niet een tweede verbinding met
  dezelfde naam): een ander krijgt op `stuk`, `klaar` en `annuleren` `UPLOAD_ONBEKEND`, alsof de upload niet bestaat.
  **Aanvullingen na de adversariële review (31.10.2026).**
  - De vertrouwde `controleer` draait **altijd**, ook met `zonderTests` / `--zonder-tests`: die notitie slaat alleen de tests van de agent over
    (het record toont «agenttests overgeslagen» naast de uitslag van de regelcontrole). Een pakket dat `AGENTS.md` wijzigt zonder nieuwe lock
    wordt dus altijd geweigerd (`TESTS_MISLUKT`, regelcontrole).
  - **CLI op uw pc**: `node scripts/orch.mjs inleveren` voert standaard ALLEEN die vertrouwde `controleer` uit — geen code uit het pakket.
    Shell-tests (`--tests "cmd"` of `--standaardtests` = `beleid.inlevering.standaardTests`) draaien code UIT HET PAKKET met uw `HOME`
    (wel zonder `DATABASE_URL`, sleutels en pepers); de CLI waarschuwt dan («LET OP: виконую КОД ІЗ ПАКЕТА АГЕНТА»). Gebruik ze alleen voor
    pakketten die u vertrouwt, liefst in een wegwerp-VM. Is de inlevering al geweigerd (conflict, verouderde basis/regels), dan draait er niets.
  - **Archiefbommen**: per archief hoogstens 1 GiB uitgepakt (`INHOUD_TE_GROOT`). Gemeten worden de **werkelijke** bytes (stroom via
    `unzip -p` / `gzip -dc`, niets op schijf) — vervalste groottes in zip-koppen helpen niet — plus de groottes uit de tar-koppen (sparse
    bestanden met hun volle grootte), en na het uitpakken nog eens de zichtbare omvang van alle bestanden.
  - **Agent op eigen naam**: een MCP-verbinding van agent X kan geen taak voor agent Y registreren en geen pakket met `"agent": "Y"` in
    `ORCH-OVERDRACHT.json` inleveren (`AGENT_VERSCHILT`); het record bewaart `door` (wie het werkelijk deed, met grant-id).
  - **MCP-limiet**: `orch_inleveren_begin` en `orch_inleveren_klaar` elk hoogstens 20 per uur per eigenaar over al zijn MCP-verbindingen
    (`RATE_LIMITED`); teller in het geheugen van de app, los van de HTTP-teller, leeg na een herstart. `klaar` blokkeert de app zolang de
    pijplijn loopt (git + `controleer`, gewoonlijk seconden, hoogstens 120 s) — bekend en bewust, de limiet begrenst het.
  - **`orch_overzicht` voor agenten**: alleen eigen uploads; het e-mailadres van de eigenaar wordt «eigenaar», grant-id's van andere
    verbindingen vallen weg, bevestigingen tonen geen passkey-vingerafdruk, label of besluit-id.
- **Regels wijzigen**: «Regels wijzigen» → bewerk `AGENTS.md` / `orchestratie/beleid.json` / `orchestratie/BESLUITEN.md` → «Voorstel controleren»
  (codes: `GEEN_WIJZIGING`, `VERSIE_NIET_VERHOOGD`, `BESLUIT_ONTBREEKT`, `BELEID_JSON`, `REGELBESTANDEN_GEWIJZIGD`) → «Ondertekenen met passkey
  en tak maken». Bij gewijzigde `kritiek`-regels toont de pagina een waarschuwing: uw passkey bevestigt precies die. Daarna: de tak
  `regels/<versie>-<tijd>` staat in GitHub (link naar de compare-pagina) — samenvoegen in `integratie` doet u zelf; agenten met de oude
  `regelsVersie` krijgen `REGELS_VEROUDERD` en moeten `taak-herlees` uitvoeren.

### 18.3 Controle en storingen
- Journaal root: `sudo tail -n 5 /var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl`; gebeurtenis `BESLUIT_ORCH_REGELS_OK` in
  `gebeurtenissen.jsonl`; app-audit `eigenaar_besluit_*` en `orch.*`.
- `ORCH_GEEN_REPO` — geen werkkopie op `ORCH_WORTEL` (stap 18.1.1). `ORCH_REPO_VUIL` — niet-gecommitte wijzigingen in de werkkopie: opruimen
  via SSH (`git status`), de app ruimt nooit zelf op.
- `NIET_BEVESTIGD_DOOR_ROOT` — het besluit is ondertekend maar root heeft (nog) niet geschreven: controleer `systemctl status
  mijn-ruimte-besluit.path` en het journaal; de pagina probeert het zelf opnieuw zolang het besluit niet verlopen is.
- `BESLUIT_PAST_NIET` / `VOORSTEL_VEROUDERD` — de regels zijn intussen gewijzigd (andere `hash`): maak een nieuw voorstel; een oude bevestiging
  is nooit herbruikbaar (root-journaal is per `voorstel`).
- GitOps weigert met «passkey-bevestiging staat niet in het root-journaal» — iemand heeft `regels.lock.json` met de hand bewerkt of het
  journaal ontbreekt op deze server: alleen een echte bevestiging via de site (of een SSH-handtekening) maakt de lock weer geldig.
- GitOps weigert met «eigenaar-ondertekenaars op de server ontbreekt» — stap 18.1.5 is niet gedaan; met «SSH-handtekening van eigenaar voor
  mijn-ruimte-regels is ongeldig» — de handtekening hoort bij een andere `regelsVersie`/`kritiekHash` of bij een sleutel die niet (met
  `namespaces="mijn-ruimte-regels"`) in het root-bestand staat: onderteken opnieuw (`node scripts/orch.mjs bevestig`).
- `NIET_BEVESTIGD_DOOR_ROOT` terwijl het journaal wél een regel heeft — het besluit-id van de pagina moet exact het id in het root-journaal
  zijn (een tweede besluit voor hetzelfde voorstel telt niet); start de bevestiging opnieuw vanaf de pagina.
- Een regelwijziging via de site gebeurt in een tijdelijke `git worktree`: `ORCH_WORTEL` blijft op `integratie` en wordt nooit omgeschakeld;
  blijft er na een storing een `regels/*`-tak zonder commit achter, verwijder die via SSH (`git branch -D`, `git worktree prune`).
- `TESTS_NIET_TOEGESTAAN` — een client stuurde eigen testopdrachten mee (zie 18.2); `INHOUD_ONVEILIG` — het archief is vóór het uitpakken
  geweigerd (record met de reden, geen tak); `UPLOAD_ONBEKEND` op een bestaand id — een andere actor dan de starter probeert de upload te
  gebruiken.
- `INHOUD_TE_GROOT` — het archief pakt uit tot meer dan 1 GiB (of een sparse bestand is groter): splits het pakket of stuur alleen de
  gewijzigde bestanden. `AGENT_VERSCHILT` — de MCP-verbinding van één agent probeert iets op naam van een andere agent; de agent moet zijn eigen
  verbinding gebruiken. `CONTEXT_PAD` — `compactContext.bestand` in `beleid.json` moet `orchestratie/<naam>.md` zijn (orch schrijft dat bestand).
- GitOps weigert met «kritieke regels in beleid.json wijken af van regels.lock.json (kritiekHash)» — iemand heeft `kritiek` in `beleid.json`
  gewijzigd onder een eerder bevestigde lock; met «regels gewijzigd zonder lock bij te werken: …» — `AGENTS.md`/`BESLUITEN.md`/`beleid.json`
  wijken af van `lock.hash`; met «regelsVersie van de lock … wijkt af» — versie niet doorgevoerd. Sinds 31.10.2026 vergelijkt GitOps (net als
  de root-installer) de lock met de werkelijke bestanden van de release; oplossing: `vergrendel`, en bij gewijzigde `kritiek` opnieuw bevestigen.
- Terugdraaien van een regelwijziging = de tak `regels/*` niet samenvoegen (of een nieuw voorstel met hogere versie). Niets op de server
  verandert tot de tak in `integratie` zit en een pakket is geïnstalleerd.
- Tests die dit afdekken: `node scripts/eenheidstests.mjs orch-site` (74, echte git-repo's + routes + MCP), `orch-besluit-root` (49, het echte
  root-script onder een onbevoorrechte gebruiker + de GitOps-controle, met echte `ssh-keygen`-handtekeningen en een echte release: lock ↔
  bestanden), `besluit-root` (47), `orch-beoordeling` (49, de regressietests van de onafhankelijke en de adversariële review van 31.10.2026:
  RCE-blokkade, schone omgeving, SEC-001-05, zoekcatalogus, SSHSIG, archief-voorcontrole en archiefbommen, actor-binding van uploads, agent op
  eigen naam, MCP-limiet en maskering, zonderTests, besluit-id, worktree en opruimen bij regels/toepassen), `orch-inleveren` (41, o.a. CLI zonder
  pakketcode).

### 18.4 Acceptatietests (etappe 4) en wat ze over de werking vastleggen
`node scripts/eenheidstests.mjs orch-acceptatie` (47) speelt de acht scenario's uit de opdracht na op echte repo's en de echte root-scripts:
parallelle agenten, git-conflicten bij inleveren én bij samenvoegen (herstel via rebase), verouderde release (`BASIS_VEROUDERD` bij root én
`pakket-controleer`), import zonder git, beleidswijziging (`REGELS_VEROUDERD` → `taak-herlees`), bevroren agent (`terugtrekken` + `taak-staat bevroren`,
wachtrij loopt door), gelijktijdige installaties, terugdraaien. Twee gedragsregels die daaruit volgen en die u mag verwachten:
- **Gelijktijdige installaties**: `mijn-ruimte-uitrol.sh` houdt een `flock`; een tweede start tijdens een installatie logt «er loopt al een uitrol»
  en doet niets. Na een geslaagde installatie ruimt het script alleen pakketten op die **niet nieuwer** zijn dan de zojuist geïnstalleerde versie;
  een nieuwer pakket dat intussen in de inbox kwam blijft staan en wordt in de volgende ronde gewoon gecontroleerd (versie, `UITROL-BASIS`,
  regels). Vóór 31.10.2026 werd zo'n pakket stil gewist.
- **Terugdraaien en de coördinatie**: na `terugdraaien` schrijft de installer/eigenaar `orchestratie/geinstalleerd.json` terug naar de vorige
  basis; `orch status` toont de taken van de teruggedraaide release dan weer als `released` (niet `installed`), en hetzelfde pakket is opnieuw
  installeerbaar zonder herbouw (`pakket-controleer` OK).
