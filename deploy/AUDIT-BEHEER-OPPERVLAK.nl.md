> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./AUDIT-BEHEER-OPPERVLAK.uk.md) · **🇳🇱 Nederlands** ([origineel](./AUDIT-BEHEER-OPPERVLAK.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Audit: wat op de site beheer is en wat bij het account hoort

Datum: 14.10.2026. Omvang: alle subdomeinen (admin, ai, api, cloud, dashboard, github, hub, huis, id, mail, mcp), alle tabbladen en
secties van elke pagina — op inhoud beoordeeld, niet alleen op adres. Doel: alles wat met het beheer van de site te maken heeft, leeft uitsluitend in het
technische profiel; het account toont alleen gebruikersfuncties.

Grens: zichtbaarheid is enkel weergave. Rechten blijven op de server afgedwongen (sessie, rollen, ondertekend AI-beleid, eigenaarsroutes).
Kritieke acties (passkey-goedkeuring van een release, terugdraaien, back-ups, beleidswijziging) blijven zoals voorheen uitsluitend voor de eigenaar, op de site zelf.

## Samenvatting per subdomein

| Subdomein | Gebruikersfuncties (blijft in het account) | Sitebeheer (alleen technisch profiel) |
| --- | --- | --- |
| hub | Ruimte, blokken, gedeelde toegang tot de ruimte, taken, agenda, notities, eigen account (archief, eigen account verwijderen) | Dode code «Beheerpaneel» (registratieverzoeken, gebruikers, rollen) — verwijderd uit hub; leeft in admin → Toegang |
| ai | AI-chat en werkruimte met eigen sleutel | — |
| mail, cloud, github, huis | E-mail, opslag, repository's, huis | — |
| id (Instellingen) | Profiel, menu, thema's, talen, widgets, gedeelde toegang, sessies en apparaten, aanmelden (wachtwoord, passkey), tweefactorauthenticatie, herstelcodes, toegangscodes voor anderen (eigen inhoud delen), «Technisch profiel» als toegangspoort naar de sectie | Passkey-recht «mag serverupdates goedkeuren» (elke sleutel, serverschakelaar, onbekende root-sleutels) — alleen in het technische profiel: Beheer → Updates |
| mcp | Overzicht, diensten, hulpmiddelen, bord, sandbox, verkeer, verbinden, wat volgt; agenten: overzicht, gekoppelde AI's, apparaten en browsers (pc, extensie), tokens en deur-toegangen, logboek van eigen gebeurtenissen | Uitrolpaneel (terugdraaien, back-up, releasecontrole, deurschakelaars), apps op de server (BYOS-containers, koppeling van deze server), archief naar pc (volledig sitearchief, nachtelijke kopieën). Uit agenten verwijderd: «Ondertekende AI-toegang» → admin → AI-toegang; «Deze server» → mcp/apps; deurschakelaars → mcp/dashboard |
| dashboard | — (doorverwijzing naar mcp/dashboard) | Hetzelfde uitrolpaneel achter de poort van het technische profiel |
| api | — | De volledige sectie (API-platform van de eigenaar) |
| admin | — | De volledige sectie; nieuw tabblad «AI-toegang» (ondertekend AI-beleid) |

## Twee webruimtes

Tweede iteratie (14.10, avond): de scheiding werkt in twee richtingen.

- Accountruimte (zonder technisch profiel, of elke gebruikerspagina): accountmenu, gebruikerstabbladen. Beheer verschijnt hier nooit — zelfs niet wanneer het technische profiel ingeschakeld is. Beheerpagina's zijn alleen bereikbaar via de profielbalk.
- Technische ruimte (profiel ingeschakeld én admin, api of een mcp-beheerpagina geopend): het zijmenu bevat alleen «Beheer», «API» en «Server en uitrol» (dashboard, apps, download); tabbladen zijn uitsluitend voor beheer; de modus «eenvoudig/uitgebreid» heeft geen invloed. Gebruikersdiensten staan niet in dit menu.
- Wisselen tussen ruimtes: de profielbalk («Account» ↔ «Beheer», «API», «Uitrol», «AI-toegang»).

## Ruimtes voor AI en meldingen (derde iteratie, 14.10, nacht)

- Meldingen: het belletje filtert servermeldingen per ruimte (`shared/meldingen-ruimte.ts`: type + link). In de accountruimte — alleen wat de gebruiker aangaat (beveiliging, aanmeldmethoden, herstel, gedeelde toegang, ondersteuning); in de technische ruimte — alleen beheer (toegangsverzoek, Google-omgeving, app-geheim, kluissleutel, updates, server). Aparte sleutel «bekeken» (`…:technisch`), geen e-mailtellers in de technische ruimte; «Alles als gelezen markeren» markeert alleen wat zichtbaar is.
- AI-koppelingen: elke grant, elk token en elk apparaat heeft een `ruimte` (`0042_ai_ruimte.sql`). De accountruimte (mcp/agents) toont en maakt uitsluitend privékoppelingen — alleen de connector `/mcp`, zonder deuren. De technische ruimte heeft de pagina **mcp/verbindingen «Technische verbindingen»** (`TechVerbindingen`) gekregen: serverdeuren of technische connector, technische grants en tokens, lijst van deur-toegangen (verplaatst vanuit «Tokens en deuren»), agenten op de server. Het venster «Toestaan» kent de ruimte van de pagina en stuurt die mee; een deurverzoek in de accountruimte kan alleen in de technische ruimte worden geopend.
- Server: `tools/list` toont alleen hulpmiddelen van de ruimte, `tools/call` buiten de ruimte → `SPACE_SEPARATED`; apparaten worden gefilterd op ruimte; het recht «updates voorbereiden» hoort alleen bij technische verbindingen; de technische ruimte wordt alleen aangemaakt door de eigenaar met een actief technisch profiel (`backend/ai-ruimte-poort.ts`). Details — `deploy/MCP-CONNECTOR.md`, sectie «Twee ruimtes».

## Wat er precies is gewijzigd

- `shared/beheer-paginas.ts`: gedeelde lijst van beheerpagina's binnen gebruikersdiensten (`mcp: dashboard, apps, download`). Het zijmenu, de tabbladenlijst en de pagina-inhoud lezen deze lijst, zodat ze niet uit elkaar lopen.
- Zijmenu (`CanonicalChrome`, prop `oppervlak`): in de accountruimte verdwijnen deze pagina's en hun kopieën uit alle lijsten; in de technische ruimte blijven alleen de beheerregels over en heet mcp «Server en uitrol».
- Tabbladen en inhoud (`UnifiedServiceApp`): accountpagina's tonen alleen gebruikerstabbladen, technische pagina's alleen beheertabbladen; een rechtstreeks adres naar een beheerpagina zonder profiel opent de poort «Sitebeheer» (`TechPoort`), net als voor admin en api.
- Agenten (`AgentenPagina`, `TabApparaten`, `TabTokens`): het tabblad «Ondertekende AI-toegang», de knop «Deze server» en de tabel met deurschakelaars zijn verwijderd; `#beleid` verwijst door naar admin → AI-toegang; deurschakelaars staan nu op het uitrolpaneel (`DeurSchakelaars`); de serverkoppeling staat op mcp/apps, waar die al aanwezig was.
- Beheer: tabblad «AI-toegang» (`AdminAiBeleidView`, `dienst='admin'`) — de enige plek voor het ondertekende beleid.
- Passkey (`PasskeysSection`, prop `beheer`): in Instellingen alleen aanmelden; het recht om serverupdates goed te keuren is alleen zichtbaar in Beheer → Updates (`UitrolMeester`).
- Hub (`App.tsx`): het dode modale venster van het beheerpaneel met gebruikersbeheer is samen met de bijbehorende functies en status verwijderd.
- Balk van het technische profiel (`TechLaag`): knoppen «Beheer», «API», «Uitrol», «AI-toegang», «Account».
- Teksten: deuren, menubewerker, uitleg van de modi («apps» hoort niet meer bij «eenvoudig», want dat is beheer).

## Bewust ongewijzigd gelaten

- Agentenlogboek: geschiedenis van toegang tot eigen gegevens; blijft bij de gebruiker (het beheerlogboek van de site staat in admin → Logboek).
- Toegangscodes voor anderen: de eigenaar deelt eigen pagina's met gasten — dat is gedeelde toegang, geen sitebeheer; de server accepteert ze sowieso alleen vanaf id.*.
- Diagnostiek: systeemplaten zijn al afgeschermd met `techMag`; geen wijzigingen nodig.
- De modus eenvoudig/uitgebreid wordt geen beveiligingsgrens; deze release schakelt de root-schakelaar `beheer-alleen-tech` niet in.
