> 🌐 **Taal / Мова:** [Українська](ПЕРЕЛІК-ЗАВДАНЬ-2026-10-10.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](INDEX.nl.md)

# Backlog "Mijn Ruimte" — status op 10-10-2026

Legenda: **✅ in branch** — voltooid en met tests geverifieerd in `claude/plan-2026-10-09` (repository `Tarasevych/hub`), nog niet op de live site ·
**⏳ actie eigenaar** — vereist uw beslissing/opdracht · **◻ niet gestart**.

## A. Uitrol
| # | Taak | Status |
|---|---|---|
| A1 | Branch `claude/plan-2026-10-09` (8 commits bovenop `menu-v2`) uitrollen op de VM: `installeer-app.sh installeren` (build, back-up, migratie 0026, root-helpers) | ⏳ actie eigenaar (opdrachten hieronder) |
| A2 | Branch samenvoegen in `menu-v2` (fast-forward, geen conflicten) | ⏳ actie eigenaar (agent mag niet naar de werkbranch schrijven) |
| A3 | Ondertekend AI-beleid instellen: `sudo mijn-ruimte-passkey beleid-start <genesis.signed.json> <vingerafdruk recovery.pub>` | ⏳ na A1 |

## B. Reeds voltooid in branch (✅)
- Venster "Bevestig toegang" altijd bovenaan; vensterbeheerder (verplaatsen, formaat wijzigen, volledig scherm, minimaliseren naar "Geopende vensters", Alt+Shift+W).
- Passkey-bevestiging op alle subdomeinen (was SERVICE_NOT_ALLOWED op mcp.*).
- Beheer → "AI-toegang": timers, wijzigingswachtrij, passkey-ondertekening; mcp/agents#beleid alleen-lezen; uitrolschakelaar voor alle AI's.
- Logboek: wie (account + AI + verbinding) en wat heeft gedaan; AI-werksessies in plaats van losse regels.
- Sleutelkluis: geldigheidsduur, eigenaar, verantwoordelijke, meldingen vóór verloopdatum.
- dashboard.tarasevych.com → Beheer → Diagnostiek (`DASHBOARD_MODE=static` herstelt de oude pagina).
- PC-agent 0.3.1: submappen `T:\…`, geheime locaties verboden, alleen-lezen hoofdpaden.

## C. Infrastructuur en toegangsrechten
| # | Taak | Status |
|---|---|---|
| C1 | PC-agent: bijwerken naar 0.3.1 en opnieuw verbinden met `--root T:\ --readonly-root R:\` | ⏳ actie eigenaar (code gereed) |
| C2 | Extensie: 0.4.0 installeren; updatemechanisme in plaats van "Load unpacked" | ◻ |
| C3 | Extensie zoals bij ChatGPT/Claude: zijpaneel, duidelijke instellingen en toegangsrechten | ◻ |
| C4 | Agenda: fout GOOGLE_SUITE_CALENDAR_UNAVAILABLE | ◻ |
| C5 | GitHub: fine-grained alleen-lezen token in de sleutelkluis (doel "github") | ⏳ actie eigenaar |
| C6 | Docker op pc (ENOENT): `docker` verwijderen uit toegestane opdrachten of Docker installeren | ◻ |
| C7 | Zichtbare accountmarkering op pagina's (dashboard, mcp/agents), zodat de extensie ziet wie is ingelogd | ◻ |
| C8 | Agentacties maken geen ongelezen meldingen aan (teller 61→73) | ◻ |
| C9 | E-mailvensters overzetten naar de gedeelde vensterbeheerder | ◻ |
| C10 | Andere AI's (Grok) via /mcp met toestemming van de eigenaar; daarna oude ingang `/Grok` uitschakelen | ⏳ beslissing eigenaar |
| C11 | DNS/Cloudflare: DMARC quarantine→reject, CAA, DNSSEC, security.txt, Web Analytics uitschakelen, doorverwijzing apex/www | ⏳ actie eigenaar |
| C12 | Controle van deelnemersisolatie met een Google-testaccount | ⏳ actie eigenaar |

## D. Gebruikersinterface
| # | Taak | Status |
|---|---|---|
| D1 | Meldingen die met het kruisje zijn gesloten komen niet terug (alleen bij nieuw type of verhoging van de teller) | ◻ |
| D2 | E-maillabels "+N nieuw" sinds laatste bezoek; tellers veranderen alleen na daadwerkelijke wijziging | ◻ |
| D3 | Laadbalk in de kleur van de sectie, ook tussen subdomeinen; zonder flikkering | ◻ |
| D4 | Thema's: kleur per sectie, licht/donker op schema of zonsopgang/zonsondergang (België), puur zwart/wit, paarstinten, naam van huidig thema | ◻ |
| D5 | Concepten: synchronisatie met server, verwijderen na verzending, markering van verouderde concepten | ◻ |
| D6 | Uitgeklapt menu zoals bij Google: zonder achtergrond en schuifbalk | ◻ |
| D7 | "Menu aanpassen" op het echte menu: tonen/verbergen; één knop met twee tabbladen; pijlen en "Hoger/Lager/Verplaatsen/Dupliceren/Resetten" verwijderen | ◻ |
| D8 | id/menu: secties inklapbaar met geheugen; zijpaneelmodus moderner/lichter | ◻ |
| D9 | Sessies: groeperen per apparaat, logo's van OS/browser/provider, inlogmethode + 2FA, gemaskeerd telefoonnummer, IPv4/IPv6, vlag (offline GeoIP op server), stadswapen, "Alles op dit apparaat beëindigen"; sms doen we bewust niet | ◻ |
| D10 | Snelheid: hash in `canonical-*.js`, `defer`, Cloudflare-cacheregels, editor buiten de hoofdbundel, dubbele verzoeken verwijderen | ◻ |
