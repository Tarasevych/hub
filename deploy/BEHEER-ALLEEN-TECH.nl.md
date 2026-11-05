> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./BEHEER-ALLEEN-TECH.uk.md) · **🇳🇱 Nederlands** ([origineel](./BEHEER-ALLEEN-TECH.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Beheerrechten alleen in een actief technisch profiel (fase B)

**Waarom.** Als iemand een gewone sessie steelt (zelfs die van de eigenaar of een beheerder), levert de beheerconsole niets op:
een beheeractie wordt uitsluitend uitgevoerd vanuit een **actief technisch profiel in ditzelfde tabblad**, met het specifieke recht dat voor die actie vereist is.

**Status na installatie:** de schakelaar staat **UIT**. De site werkt zoals voorheen en OPA berekent alleen in de schaduw wat er zou veranderen.

## Welk recht nodig is voor welke actie
| Beheeractie | Vereist recht in het technische profiel | Rollen die dit hebben |
|---|---|---|
| console bekijken (`admin.read`) | elk actief profiel | allemaal |
| gebruikers (`users.manage`), mappen/directory's (`directories.manage`) | `users.manage` | Beheerder, Eigenaar |
| rollen (`roles.manage`) | `roles.delegate` | Beheerder, Eigenaar |
| logboek (`audit.read`) | `journaal.lezen` | Beheerder, Auditor, Eigenaar |
| apparaten (`devices.read`) | `diagnose.lezen` | allemaal, behalve Auditor |
| applicaties, SSO (`apps.manage`, `sso.manage`) | `diensten.beheren` | Beheerder, Eigenaar |

De tabel komt overeen met `deploy/opa/beleid/data.json` (`doel_tech`); de test `beleid-afdwingen` houdt de site en OPA gelijk.

## Wanneer inschakelen
Technisch profiel (Beheerder of Eigenaar) → «Werkt er iets niet? Controle» → «Regels (OPA)»:
- «Dienst draait»;
- **«Afwijking» = 0** — de site en OPA nemen exact dezelfde beslissing;
- **«Zonder tech. profiel» ≈ 0** gedurende enkele dagen — u bent gewend het technische profiel in te schakelen vóór beheerwerk.

## Inschakelen (op de server, als beheer)
```bash
sudo systemctl status mijn-ruimte-opa            # dienst moet draaien (127.0.0.1:8181)
sudo nano /etc/mijn-ruimte/mcp-rechten.json      # toevoegen of wijzigen: "beheer-alleen-tech": true
```
De site leest het bestand elke 10 seconden; herstarten is niet nodig. Alleen de booleaanse waarde `true` zet de schakelaar aan: de tekst `"true"` geldt als uitgeschakeld.

## Wat er verandert wanneer dit aanstaat
- Zonder actief technisch profiel in dit tabblad toont de beheerconsole: «Beheerrechten werken alleen in een actief technisch profiel…».
- Als OPA niet antwoordt (800 ms), wordt de beheeractie **geweigerd** («Regeldienst (OPA) antwoordde niet…»). Dit is opzettelijk: fail-closed.
- Elke dergelijke weigering wordt vastgelegd in het logboek («Agenten → Logboek», sectie «Toegang»).
- Gewone functies van de site (e-mail, bestanden, AI) **veranderen niet**: dit geldt uitsluitend voor de beheerconsole.

## Uitschakelen of noodherstel van toegang
```bash
sudo nano /etc/mijn-ruimte/mcp-rechten.json      # "beheer-alleen-tech": false
# of, als het aan OPA ligt:
sudo systemctl restart mijn-ruimte-opa
```
De site zelf kan deze schakelaar niet wijzigen, en een feature-flag evenmin: alleen root op de server kan dit omschakelen.

## Waarom op deze manier
- Recht op het moment van de actie in plaats van «voor altijd» (just-in-time): een gestolen sessie zonder technisch profiel levert niets op.
- Twee onafhankelijke beslissers (de siteregel en OPA), en beide moeten toestemming geven. Een fout in één van beide opent geen toegang.
- Fail-closed geldt uitsluitend voor de beheerconsole; herstel is één aanpassing in een root-bestand, zonder nieuwe release.
