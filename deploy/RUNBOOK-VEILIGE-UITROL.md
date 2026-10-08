# Runbook: veilige uitrol via mcp.tarasevych.com (ondertekende pakketten, geen pad van de app naar root)

Stand: 2026-10-08, branch `veilig-agenten-0.4`. Vervangt de oude "deur" (`mijn-ruimte-mcp-doen` + sudo-regel + `patch-*.py`-lader).

## 1. Wat er veranderd is (en waarom)

| Vroeger (audit C1/C3/C4) | Nu |
|---|---|
| `mijnruimte ALL=(root) NOPASSWD: /usr/local/sbin/mijn-ruimte-mcp-doen *` | **geen sudo-regel**; de installer zet een oude regel in quarantaine en waarschuwt als er nog een NOPASSWD-regel voor `mijnruimte` staat |
| root-hulp met werkwoorden die gestagede code uitvoerden (`kit`, `povnyj-arkhiv`, `patch-*.py` via runpy) | **geen enkel werkwoord**; de MCP-dienst kan alleen een pakket + losse handtekening in een inbox zetten |
| toestemmingen in `/srv/data/uploads/mcp-permissions.json` (schrijfbaar voor de app) | `/etc/mijn-ruimte/mcp-rechten.json`, eigendom van root (`root:mijnruimte 0640`); alleen via SSH te wijzigen |
| drop-in `mijn-ruimte-mcp.service.d/write.conf` met `NoNewPrivileges=no` | weg; de unit heeft `NoNewPrivileges=yes`, `RestrictSUIDSGID=yes`; de drop-in gaat bij het installeren naar quarantaine |
| archief deels leesbaar (code, units, sudoers, git) in een app-map | **hele archief age-versleuteld**, in een root-map, vaste naam, download alleen door de eigenaar na step-up via een eenmalige id |
| OAuth-tokens van de deur in klare tekst, vaste client `grok`, 30 dagen | alleen sha256-hashes, toegang 1 uur, refresh 14 dagen met rotatie + hergebruikdetectie, `/oauth/revoke`, DCR met unieke client-id |

De keten is nu:

```
PC eigenaar (privésleutel op T:\, wachtwoordzin)
  └─ maak-uitrolpakket.ps1  →  mijn-ruimte-<versie>.tar.gz + .sig
        └─ Grok → mcp.tarasevych.com → rollout_upload_begin/chunk/finish   (dienst mijnruimte-mcp, geen root, NoNewPrivileges)
              └─ /srv/mijn-ruimte/uitrol-inbox/{pakket, .sig, aanvraag}
                    └─ mijn-ruimte-uitrol.path  →  mijn-ruimte-uitrol.service (root)
                          1. kopie naar /var/lib/mijn-ruimte-uitrol/pakket.XXXX (root 0700) — pas daarna controleren (geen TOCTOU)
                          2. ssh-keygen -Y verify met /etc/mijn-ruimte/uitrol-ondertekenaars (root, niet groeps-/wereldschrijfbaar)
                          3. tar-inhoud: alleen gewone bestanden/mappen, geen symlinks/hardlinks/apparaten, geen "..", geen absolute paden
                          4. UITROL-VERSIE == versie in de bestandsnaam, en nieuwer dan /var/lib/mijn-ruimte-uitrol/laatste-versie
                          5. deploy/installeer-app.sh installeren <gecontroleerde kopie>  (back-up, migraties, gezondheidscheck, automatisch terug bij falen)
```

De app (`mijnruimte`) kan alleen een *verzoek* neerleggen. Wat er als root draait, is uitsluitend code die met jouw privésleutel ondertekend is.

## 2. Eenmalig: ondertekeningssleutel maken op Windows (sleutel op T:\)

PowerShell (gewone gebruiker, geen beheerder nodig):

```powershell
New-Item -ItemType Directory -Force T:\mijn-ruimte-uitrol | Out-Null
ssh-keygen -t ed25519 -a 100 -C "uitrol@mijn-ruimte" -f T:\mijn-ruimte-uitrol\uitrolsleutel
#   → vraagt twee keer een wachtwoordzin: kies een lange (≥ 5 woorden), bewaar die in je wachtwoordbeheerder, NIET op T:\
Get-Content T:\mijn-ruimte-uitrol\uitrolsleutel.pub
```

- `uitrolsleutel` (privé) blijft op T:\ en gaat nooit naar de VM, naar Grok of in een repo.
- Maak een tweede kopie van T:\mijn-ruimte-uitrol op een offline schijf (zelfde wachtwoordzin).
- Leg het bestand `UITLEG-LEESMIJ.txt` (tekst in §8) naast de sleutel.

## 3. Eenmalig op de VM (via SSH, als root)

```bash
# publieke sleutel als enige toegestane ondertekenaar (plak de regel uit uitrolsleutel.pub achter de namespaces-optie)
install -d -o root -g root -m 0755 /etc/mijn-ruimte
printf 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol" %s\n' 'ssh-ed25519 AAAA…  uitrol@mijn-ruimte' > /etc/mijn-ruimte/uitrol-ondertekenaars
chown root:root /etc/mijn-ruimte/uitrol-ondertekenaars && chmod 0644 /etc/mijn-ruimte/uitrol-ondertekenaars

# schakelaars van de MCP-deur (root-bestand; standaard alleen lezen)
cat /etc/mijn-ruimte/mcp-rechten.json            # {"read": true, "uitrol": false}
# uitrol aanzetten wanneer je Grok een pakket wilt laten afleveren:
printf '%s\n' '{"read": true, "uitrol": true}' > /etc/mijn-ruimte/mcp-rechten.json
# alle sessies van de deur in één keer intrekken (bv. na een verdacht gesprek):
date +%s%3N > /etc/mijn-ruimte/mcp-intrekken
```

De installer (`installeer-app.sh installeren`) zet het script `/usr/local/sbin/mijn-ruimte-uitrol`, de units `mijn-ruimte-uitrol.{path,service}`
en de mappen neer, en zet de path-unit pas aan als `/etc/mijn-ruimte/uitrol-ondertekenaars` bestaat. De ondertekenaarslijst komt **nooit** uit een pakket.

### Controleren dat het oude root-pad weg is

```bash
ls -l /etc/sudoers.d/                         # geen mijn-ruimte-mcp
sudo -l -U mijnruimte                         # "is not allowed to run sudo" (of geen enkele NOPASSWD-regel)
ls /usr/local/sbin/ | grep -E 'mcp-doen|povnyj' || echo "weg"
systemctl cat mijn-ruimte-mcp.service | grep -E 'NoNewPrivileges'   # alleen NoNewPrivileges=yes, geen drop-in write.conf
ls -ld /var/lib/mijn-ruimte-quarantaine/*     # wat de installer heeft weggezet (bewijsmateriaal; niet wissen vóór het onderzoek)
```

De drop-in `/etc/systemd/system/mijn-ruimte-mcp.service.d/write.conf` (`NoNewPrivileges=no`) stond nooit in de repo als bestand dat
geïnstalleerd hoort te worden en is uit alle installers verwijderd; `oude_deur_opruimen` verplaatst hem naar quarantaine en doet `daemon-reload`.
Handmatig: `mv /etc/systemd/system/mijn-ruimte-mcp.service.d/write.conf /root/ && systemctl daemon-reload && systemctl restart mijn-ruimte-mcp`.

## 4. Een release maken en ondertekenen (PC)

```powershell
cd C:\pad\naar\repo        # schone checkout van de branch die je wilt uitrollen
git status                 # niets ongecommit
powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 -Sleutel T:\mijn-ruimte-uitrol\uitrolsleutel -Uit $env:USERPROFILE\Desktop
#   → wachtwoordzin; daarna controleert het script de handtekening zelf
```

Resultaat op het bureaublad: `mijn-ruimte-<versie>.tar.gz`, `.tar.gz.sig`, `mijn-ruimte-<versie>.txt` (versie, bytes, sha256).

## 5. Uitrollen

**A. Via Grok (mcp.tarasevych.com)** — alleen als `"uitrol": true`:
1. Geef Grok het pakket, de `.sig`-tekst en de waarden uit `.txt`.
2. Grok roept `rollout_upload_begin {version, bytes, sha256}`, dan `rollout_upload_chunk` (stukken ≤ 512 KiB) en `rollout_upload_finish {version, signature}`.
3. `rollout_status` toont: `bezig` → `klaar` of `geweigerd`/`mislukt` met een code (zie hieronder).
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

Statuscodes: `SIG_ONTBREEKT`, `HANDTEKENING_ONGELDIG`, `GEEN_SLEUTEL`, `INHOUD_ONVEILIG` (symlink/pad-truc), `VERSIE_VERSCHILT`, `NIET_NIEUWER`,
`TE_GROOT`, `GEEN_INSTALLER`, `INSTALLATIE_MISLUKT`. Een geweigerd pakket wordt uit de inbox verwijderd en nooit uitgevoerd.

## 6. Terugdraaien (rollback)

De installer bewaart vorige releases onder `/srv/mijn-ruimte/releases/` en draait bij een mislukte gezondheidscheck zelf terug. Handmatig:

```bash
ssh beheer@203.0.113.10
sudo bash /srv/mijn-ruimte/current/deploy/installeer-app.sh terugdraaien      # vorige release activeren
curl -fsS http://127.0.0.1:8080/api/health
```

Een oudere versie opnieuw *via de inbox* uitrollen kan niet (`NIET_NIEUWER`, bescherming tegen terugrolaanvallen). Wil je oude code terug,
maak dan een **nieuw** pakket (nieuwe versie) van die oude commit (`git checkout <commit>` en §4), of draai terug via SSH zoals hierboven.
Databasemigraties zijn vooruit-only; bij een terugrol naar code van vóór een migratie blijven de nieuwe tabellen bestaan (ze zijn additief).

## 7. Sleutel kwijt of gelekt

1. Nieuw sleutelpaar maken (§2).
2. Op de VM `/etc/mijn-ruimte/uitrol-ondertekenaars` vervangen door de nieuwe publieke sleutel (oude regel weg).
3. `date +%s%3N > /etc/mijn-ruimte/mcp-intrekken` en `"uitrol": false` tot je klaar bent.

## 8. Tekst voor `T:\mijn-ruimte-uitrol\UITLEG-LEESMIJ.txt`

```
ЩО ЦЕ ЗА ТЕКА
Тут лежить ключ підпису випусків сайту Mijn Ruimte (uitrolsleutel) і його публічна частина (uitrolsleutel.pub).
Лише пакет, підписаний цим ключем, сервер погодиться встановити. Ключ захищений паролем; пароль — у менеджері паролів, не тут.

ЯК КОРИСТУВАТИСЯ
  1. У теці репозиторію:  powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 -Sleutel T:\mijn-ruimte-uitrol\uitrolsleutel
  2. Введіть пароль ключа. Скрипт створить пакет (.tar.gz), підпис (.sig) і файл з розміром і сумою (.txt).
  3. Передайте ці три речі Grok (сайт mcp.tarasevych.com) або скопіюйте через SSH (див. deploy/RUNBOOK-VEILIGE-UITROL.md).

НІКОЛИ
  - не надсилайте файл uitrolsleutel (без .pub) нікому, ні Grok, ні поштою, ні в чат;
  - не кладіть його на сервер чи в репозиторій;
  - якщо ключ міг потрапити до чужих рук: створіть новий і замініть публічний ключ на сервері (розділ 7 у RUNBOOK).

WAT IS DEZE MAP
Hier staat de ondertekeningssleutel voor releases van Mijn Ruimte (uitrolsleutel) en het publieke deel (uitrolsleutel.pub).
De server installeert alleen pakketten die met deze sleutel zijn ondertekend. De sleutel is beveiligd met een wachtwoordzin;
die staat in de wachtwoordbeheerder, niet hier.

GEBRUIK
  1. In de repomap:  powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 -Sleutel T:\mijn-ruimte-uitrol\uitrolsleutel
  2. Wachtwoordzin invoeren. Het script maakt het pakket (.tar.gz), de handtekening (.sig) en een bestand met grootte en controlesom (.txt).
  3. Geef die drie aan Grok (site mcp.tarasevych.com) of kopieer ze via SSH (zie deploy/RUNBOOK-VEILIGE-UITROL.md).

NOOIT
  - het bestand uitrolsleutel (zonder .pub) naar iemand sturen, ook niet naar Grok, per mail of in een chat;
  - het op de server of in een repository zetten;
  - als de sleutel in verkeerde handen kan zijn: maak een nieuwe en vervang de publieke sleutel op de server (§7 in het RUNBOOK).
```
