> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261014-B-SSH.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261014-B-SSH.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Release 14.10.2026 (na 6660758): SSH-certificaat (C dl. 2, andere agent + reparaties) en schakelaar B

## Werk van de andere agent (archief mijn-ruimte-20261014-090544, commit f39718b in de tak)
Een andere agent werkte al bovenop 6660758 (al mijn wijzigingen zitten daarin) en voegde fase C, deel 2 toe: een SSH-certificaat voor één uur.
- root-script `deploy/ssh-ca/mijn-ruimte-ssh-ca.sh` (`inrichten | publiek | verwerk | tekenen <id>`): ed25519 → certificaat alleen voor
  `beheer`, alleen `permit-pty`, `-V -5m:+60m`, controle van het voltooide certificaat (`ssh-keygen -L`), limiet van 12 per uur, schakelaar `ssh-ca`
  in `mcp-rechten.json` (standaard `false`), sshd wordt niet gewijzigd;
- dienst `mijn-ruimte-ssh-ca.service` (oneshot, ProtectSystem=strict) en `.path` (de installer zet deze **niet** aan);
- polkit: de applicatie mag alleen deze ene dienst **starten**;
- site: `POST /api/ssh-ca/uitgifte` (bevestiging van aanmelding), venster «Сертифікат SSH» (SSH-certificaat), vlag `ssh-certificaat` (migratie 0041, uitgeschakeld),
  die alleen de knop toont;
- tests `ssh-ca` (29).

## Wat ik heb gerepareerd
1. **Echte certificaten kwamen niet door de controle van de site.** Zonder commentaar voegt `ssh-keygen` het pad naar het invoerbestand toe
   (`/var/lib/mijn-ruimte/ssh-ca/<id>.pub`). Dit pad kwam in het antwoord terecht en de site weigerde **elk** echt certificaat
   (`SSH_CA_CONTROLE`). Eenheidstests controleerden alleen een kunstmatige tekenreeks. Nu geeft het script precies «type sleutel» terug; een nieuwe test haalt
   de echte uitvoer van root door de controle van de site, en e2e geeft het certificaat van begin tot eind uit.
2. **Root-logboek.** Het script schreef bij in `gebeurtenissen.jsonl` zonder vergrendeling, terwijl uitrol, gitops en opdracht dit bestand
   onder `flock` herschrijven. Een regel kon verloren gaan, en als het bestand door het script zelf werd aangemaakt, kreeg het `0600 root` en kon de site het niet lezen. Nu
   wordt dezelfde `flock` en herschrijving met rechten `0640 root:mijnruimte` gebruikt.
3. **Wachtrij.** `verwerk` verwerkte slechts één verzoek per run. Een tweede verzoek dat binnenkwam terwijl de dienst draaide, bleef liggen tot het
   «verouderde». Nu worden alle verzoeken verwerkt (tot 20 per ronde).
4. **Wie het certificaat krijgt.** Was: iedereen met `terminal.servers`, dus ook «Beheerder» (Адміністратор). Maar SSH als `beheer` betekent inloggen op de
   server zelf, en dat is meer dan een terminal in een container zonder netwerk. Nu is het nieuwe recht `ssh.host` vereist, dat alleen de rol **Eigenaar** (Власник) heeft.
5. Sitelogboek: `owner.ssh-ca.uitgegeven` en `owner.ssh-ca.geweigerd` onder «Доступ» (Toegang) met een leesbare omschrijving.
6. Venster: duidelijke hint (`~/.ssh/id_ed25519-cert.pub`, `ssh beheer@…`), fouten worden voorgelezen (`role="alert"`).
7. Test `ssh-ca`: onder root negeert het script bewust testpaden, waardoor de test naar het echte `/etc/mijn-ruimte/ssh-ca` schreef. Nu draait
   het script onder root als `nobody`.
8. Handleiding `deploy/SSH-CA.md`: stap voor stap inschakelen, testen zonder de huidige sessie te verliezen, uitschakelen.

## Wat ik heb toegevoegd (plan)
- **B — «beheerrechten alleen in een actief technisch profiel»**: root-schakelaar `"beheer-alleen-tech": true` in `mcp-rechten.json`,
  **standaard uitgeschakeld**. Wanneer ingeschakeld, wordt een beheeractie alleen uitgevoerd met een actief profiel in dit tabblad met het vereiste recht;
  zowel de siteregel als OPA moeten toestemming geven; als OPA onbereikbaar is, wordt de actie geweigerd (fail-closed); elke weigering komt in het logboek.
  De status van de schakelaar wordt getoond op het tabblad «Правила (OPA)» (Regels (OPA)). Handleiding: `deploy/BEHEER-ALLEEN-TECH.md`.
- **Testhygiëne**: elke e2e overschreef het e-mailadres van de eigenaar, waardoor de eigenaar van de eenheidstests zijn rol verloor. Vandaar dubbele gebruikers en
  «36/37» in `tech-profiel`. Nu zet de e2e-server bij het stoppen de rollen terug zoals ze waren.

## Controles
- Eenheidstests: ssh-ca 33/33, beleid-afdwingen 15/15 (site en echte OPA identiek in alle 64 combinaties), overige suites groen.
- E2E Chrome: ssh-ca 11/11 (knop alleen met vlag; bij uitgeschakelde schakelaar — duidelijke melding; bij ingeschakelde schakelaar geeft het echte
  script een certificaat uit: alleen `beheer`, alleen `permit-pty`, ondertekend door de CA van de server; logboek zonder het certificaat zelf).
