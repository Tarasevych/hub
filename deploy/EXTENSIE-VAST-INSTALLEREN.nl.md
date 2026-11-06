> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./EXTENSIE-VAST-INSTALLEREN.uk.md) · **🇳🇱 Nederlands** ([origineel](./EXTENSIE-VAST-INSTALLEREN.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Extensie blijft staan na een herstart van Chrome

UI-011 / BUG-005 · 29.10.2026 · extensie 0.8.0

## In het kort (eenvoudig)

**Waarom de extensie verdween.** De extensie «Mijn Ruimte» wordt geïnstalleerd als «uitgepakt» (een map met bestanden). Chrome onthoudt alleen **het pad naar deze map**. Als die map bij het starten van Chrome ontbreekt (verwijderd, verplaatst, uitgepakt in «Downloads» of een tijdelijke map, of op een netwerk-, USB-, OneDrive- of versleutelde schijf die pas later wordt aangekoppeld), **verwijdert Chrome de extensie stilzwijgend uit de lijst**. We hebben dit getest in een echte Chrome: map aanwezig — extensie blijft na 5 herstarts staan; map weg — na de allereerste herstart is de extensie volledig verdwenen.

Nog een oorzaak: als u het pakket «diagnose» of een nieuwe versie laadt vanuit een **andere** map, onthoudt Chrome voortaan die nieuwe map (het id is hetzelfde). Wordt die nieuwe map later opgeruimd, dan verdwijnt de extensie.

**Wat u moet doen (eenmalig).**
1. Download `mijn-ruimte-extension.zip` van de site.
2. Voer uit in PowerShell: `powershell -ExecutionPolicy Bypass -File .\installeer-extensie-vast-windows.ps1 -Zip "$env:USERPROFILE\Downloads\mijn-ruimte-extension.zip"` — de bestanden komen in de vaste map `%LOCALAPPDATA%\MijnRuimte\extensie`.
3. `chrome://extensions` → «Ontwikkelaarsmodus» aanzetten → «Uitgepakte extensie laden» → kies precies deze map.
4. Bijwerken: hetzelfde script naar dezelfde map uitvoeren, daarna op ↻ klikken in `chrome://extensions`. Het id verandert niet.

Schakel «Ontwikkelaarsmodus» niet uit: Chrome schakelt uitgepakte extensies dan uit (maar verwijdert ze niet).

**Controle op uw computer (alleen lezen, wijzigt niets):** `powershell -ExecutionPolicy Bypass -File .\extensie-diagnose-windows.ps1` — op het bureaublad verschijnt `MijnRuimte-extensie-diagnose.txt`. Daarin is te zien vanuit welke map Chrome de extensie heeft geladen, of die map bestaat, op welke schijf die staat en of er beleidsregels (policies) actief zijn die de extensie blokkeren.

## Technische details en vergelijking van methoden

**Oorzaak (bewezen mechanisme).** Een uitgepakte extensie bestaat in Chrome alleen als verwijzing naar haar map. Ontbreekt die map bij de start van Chrome, dan haalt Chrome de extensie stil uit `chrome://extensions` (het item blijft in `Preferences` staan, de extensie is weg). Getest in Google Chrome 156 op Linux met een echte «Uitgepakt laden» via het mapvenster: vaste map → 5+ herstarts aanwezig; map weg → na de eerste herstart volledig verdwenen. Ontwikkelaarsmodus uit → extensie UITGESCHAKELD (`unsupportedDeveloperExtension`), niet verwijderd: dat verklaart het «helemaal weg» dus niet.

Het id is stabiel: `key` staat in `manifest.json` → altijd `ofpffonakgjioahgfejmiblfmbkobmmi`. Een tweede map met hetzelfde id (bv. het pakket «diagnose» uit Downloads) vervangt de registratie van de eerste map.

**Ondersteunde permanente methoden op Windows (eerlijk):**
| Methode | Werkt op de pc van de eigenaar? | Opmerking |
|---|---|---|
| Uitgepakt laden uit een VASTE lokale map (`%LOCALAPPDATA%\MijnRuimte\extensie`) | ja | aanbevolen; ontwikkelaarsmodus moet aan blijven |
| Eigen CRX + `ExtensionInstallForcelist` (register) | **nee**, tenzij de pc lid is van een AD-/Entra-domein of ingeschreven in Chrome Enterprise Core | Chrome-beleidsdefinitie: «On Microsoft Windows instances, apps en extensions uit outside de Chrome Web Store can alleen be forced installed if de instance is joined to … Active Directory … Azure Active Directory or enrolled in Chrome Enterprise Core.» |
| Chrome Web Store (ook «verborgen/unlisted») | ja, na publicatie | vraagt ontwikkelaarsaccount en beoordeling; `debugger` maakt de beoordeling strenger |
| CRX slepen naar `chrome://extensions` | nee | op Windows schakelt Chrome niet-Store-CRX's uit |

Scripts: `deploy/installeer-extensie-vast-windows.ps1` (zet de bestanden in de vaste map; wist nooit een vreemde map; raakt Chrome en het register niet) en `deploy/extensie-diagnose-windows.ps1` (alleen lezen).
