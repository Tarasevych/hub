> 🌐 **Taal / Мова:** [Українська](ЦЕНТР-СЕРТИФІКАЦІЇ-БЕЗПЕЧНОЇ-ОБОЛОНКИ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# SSH-certificaat voor één uur (etappe C, deel 2)

Inloggen via SSH op de server van «Mijn Ruimte» zonder permanente sleutel. De site **vraagt** alleen aan, en **root ondertekent** het certificaat:
- alleen voor de gebruiker `beheer`;
- alleen terminal (`permit-pty`): geen poortforwarding, agentforwarding of X11;
- voor 60 minuten (plus 5 minuten marge voor klokverschillen).

De privésleutel verlaat uw computer nooit: op de site plakt u alleen de publieke regel `ssh-ed25519 …`.

## Wie kan een certificaat krijgen
Aan **alle vier** de voorwaarden moet zijn voldaan:
1. Een actief technisch profiel in dit tabblad met het recht **`ssh.host`**. Alleen de rol **Eigenaar** heeft dit: SSH als `beheer` betekent toegang
   tot de server zelf, en dat gaat verder dan een terminal in een container zonder netwerk. Daarom krijgt de rol «Beheerder» (`terminal.servers`) geen certificaat.
2. Een verse bevestiging van de aanmelding (passkey of Google) **én** — sinds SEC-002 — een **passkey van de eigenaar over precies dit
   certificaat** (publieke sleutel, principal, duur; eenmalig, hoogstens 5 minuten geldig). Root controleert die passkey zelf tegen
   `/etc/mijn-ruimte/goedkeur-passkeys.json`; een verzoek van de site alleen is niet meer genoeg. Zie «Passkey van de eigenaar» hieronder.
3. Root heeft de schakelaar `"ssh-ca": true` aangezet in `/etc/mijn-ruimte/mcp-rechten.json`. Standaard staat deze op `false` en de installer wijzigt dit niet.
4. De feature-flag `ssh-certificaat` staat aan. Deze **toont alleen de knop** en verleent geen rechten.

## Passkey van de eigenaar (SEC-002, server-uitrol-06)
Root tekent een certificaat alleen als de eigenaar het **op de site met een passkey** heeft bevestigd. Zo krijgt iemand die code kan
uitvoeren met de rechten van de app (een inbreker in de app) **geen** shell op de server zonder de passkey van de eigenaar.

**Wat u na de installatie ziet.** Zolang er in `/etc/mijn-ruimte/goedkeur-passkeys.json` nog geen passkey van de eigenaar staat, tekent
root **niets**: de site toont «На сервері ще немає passkey власника для схвалень» (`GEEN_PASSKEY`). Dat is de veilige stand, geen storing.

**Passkey toevoegen (eenmalig).** Dezelfde passkey als voor het goedkeuren van updates (`deploy/DRAAIBOEK-VEILIGE-UITROL.nl.md` §13.2):
1. Op de telefoon of laptop, aangemeld als eigenaar: «Налаштування → Способи входу» → «Passkeys» → «Додати passkey»; daarna bij die passkey
   «Може схвалювати оновлення сервера» aanvinken. De site toont de vingerafdruk (`ab12 cd34 …`).
2. Op de server: `sudo mijn-ruimte-passkey wachtend` (vergelijk de vingerafdruk) en `sudo mijn-ruimte-passkey toevoegen <eerste 16 of meer
   tekens>`. Hebt u al een passkey die updates mag goedkeuren, dan is er niets te doen: die telt ook voor SSH-certificaten.
3. Een certificaat vraagt u daarna aan op **https://admin.tarasevych.com** of **https://id.tarasevych.com** (alleen op die adressen aanvaardt
   root de passkey): technisch profiel van de Eigenaar → «SSH-certificaat» → publieke sleutel plakken → passkey bevestigen.

**De schakelaar `"ssh-ca-teken-passkey"` in `/etc/mijn-ruimte/mcp-rechten.json`** (alleen root kan dit bestand schrijven):

| Waarde | Betekenis |
|---|---|
| ontbreekt (standaard) | Passkey verplicht zodra het sleutelbestand bestaat (de installer maakt het altijd aan). Geen passkey in het bestand → geweigerd, nooit stil getekend. |
| `true` | Altijd verplicht. |
| `false` **(!)** | **Niet** verplicht. **Risico:** elk verzoek van de app wordt weer getekend — wie de app overneemt, krijgt een shell op de server als `beheer`. Elke handtekening zonder passkey staat met een waarschuwing in het journaal van root. Zet dit niet; alleen tijdelijk als u de passkey kwijt bent en via de console werkt, en daarna meteen terug. |

Limiet: maximaal 12 certificaten per uur voor de hele server. Elke uitgifte en weigering wordt vastgelegd in het logboek van de site
(alleen de vingerafdruk, zonder het certificaat zelf) en in het logboek van root (`gebeurtenissen.jsonl`).

## Inschakelen (eenmalig, op de server; console of werkende SSH-sleutel vereist)
Installeer eerst een release met deze functie (`mijn-ruimte-installeer installeren …`). De installer plaatst het script `/usr/local/sbin/mijn-ruimte-ssh-ca`,
maakt de mappen aan en voegt de polkit-regel toe. Hij maakt **geen** sleutel aan, past `sshd` **niet** aan en zet de schakelaar **niet** aan.

```bash
# 1. CA-sleutel aanmaken (alleen root; opnieuw uitvoeren overschrijft een bestaande sleutel niet)
sudo /usr/local/sbin/mijn-ruimte-ssh-ca inrichten

# 2. Regels voor sshd tonen
sudo /usr/local/sbin/mijn-ruimte-ssh-ca publiek

# 3. Principal beheer toestaan
sudo install -d -m 0755 /etc/ssh/auth_principals
echo beheer | sudo tee /etc/ssh/auth_principals/beheer >/dev/null

# 4. CA vertrouwen in sshd (in een apart bestand; uw bestaande toegang met sleutel blijft werken)
printf '%s\n' 'TrustedUserCAKeys /etc/mijn-ruimte/ssh-ca/ca.pub' 'AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u' \
  | sudo tee /etc/ssh/sshd_config.d/60-mijn-ruimte-ssh-ca.conf >/dev/null
sudo sshd -t && sudo systemctl reload ssh

# 5. Schakelaar aanzetten (alleen root kan dit bestand schrijven)
sudo nano /etc/mijn-ruimte/mcp-rechten.json        # "ssh-ca": true

# 6. (Optioneel) path-unit als terugvaloptie; de site start de ondertekeningsdienst sowieso via polkit
sudo systemctl enable --now mijn-ruimte-ssh-ca.path
```
Daarna op de site: technisch profiel van de Eigenaar → «Vlaggen» → `ssh-certificaat` → aanzetten.

**Sluit uw huidige SSH-sessie niet voordat u de nieuwe aanmelding hebt getest.** `AuthorizedPrincipalsFile` geldt alleen voor aanmelden met een
certificaat: gewone sleutels in `authorized_keys` blijven werken zoals voorheen.

## Gebruik (op uw computer)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519      # als u nog geen sleutel hebt
cat ~/.ssh/id_ed25519.pub                         # plak deze regel op de site: balk technisch profiel → «SSH-certificaat»
# sla het certificaat van de site op naast de sleutel:
#   ~/.ssh/id_ed25519-cert.pub
ssh beheer@<VM-IP>                              # SSH pakt het certificaat automatisch; na een uur verloopt het
ssh-keygen -L -f ~/.ssh/id_ed25519-cert.pub       # controleren: Principals beheer, Extensions permit-pty, Valid …
```

## Uitschakelen
```bash
sudo nano /etc/mijn-ruimte/mcp-rechten.json        # "ssh-ca": false  — er worden geen nieuwe certificaten meer uitgegeven
# volledig: vertrouwen in sshd weghalen
sudo rm /etc/ssh/sshd_config.d/60-mijn-ruimte-ssh-ca.conf && sudo sshd -t && sudo systemctl reload ssh
sudo systemctl disable --now mijn-ruimte-ssh-ca.path
```
Reeds uitgegeven certificaten verlopen vanzelf na uiterlijk 65 minuten. Om alle certificaten direct in te trekken, verwijdert u het vertrouwen in `sshd`.

## Waarom zo
- Geen permanente sleutels: toegang is eenmalig, tijdelijk en gekoppeld aan een persoon (Sleutel ID = naam uit e-mail, zichtbaar in het logboek van `sshd`).
- Het root-script kiest zelf de principal, geldigheidsduur en opties; het verzoek van de site heeft daar geen invloed op.
- Het script bewerkt `sshd` nooit en zet de schakelaar niet aan: het vertrouwen wordt uitsluitend handmatig door de eigenaar ingesteld.
- Alleen toegankelijk vanuit het profiel van de Eigenaar: toegang tot de host gaat verder dan een terminal in een container (etappe C, deel 1).
