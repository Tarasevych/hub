> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261017-ПАНЕЛЬ-РОЗГОРТАННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# «Оновлення» (Updates): live dashboard, geschiedenis in de database, diagnostiek — 17 oktober 2026

Doel: zorgen dat installeren via de interface **zichtbaar** is (elke stap en elke terminalregel in realtime), **traceerbaar** (volledige geschiedenis in
de database met filters en logboeken) en **diagnosticeerbaar** (direct zichtbaar op welke schakel de keten is gestopt, zonder zoeken via SSH). Alle functies van de oude
pagina (passkey, SSH-bevestiging, AI-toegang, wie voorbereidt, archief uploaden, goedkeuring, geschiedenis) zijn samengebracht in één nieuwe interface.

## Waarom installeren via de interface niet werkte (wat bewezen is en wat niet)
Bewezen in code en tests (gerepareerd in het vorige pakket 20261017-131800):
1. Na een geslaagde installatie stopte het root-script met een fout door `set -e` (lege `ls | tail | xargs`) nog vóór het wegschrijven van het resultaat — de site bleef eeuwig «INSTALLEREN» zien.
2. De site las het logboek uit een map die voor de applicatie ontoegankelijk was en slikte fouten in; daardoor stonden er op de pagina noch stappen, noch uitvoer.
3. De versie was `UNIQUE` over alle statussen heen en afgebroken uploads hielden de limiet bezet — een nieuwe poging gaf `VERSIE_BESTAAT_AL` / `TE_VEEL_OPEN`.

Niet bewezen (vereist serverlogboek): waarom root na de goedkeuring van 20261017-131800 **geen enkele regel heeft achtergelaten**. Deze release gokt niet, maar
meet: root schrijft elke minuut `diagnose.json` (status van de path-unit, de dienst, de vergrendeling `uitrol.lock`, inbox, schijf, logboek), een waakhond-timer
start zelf de verwerking als een pakket roerloos blijft liggen, en de site noemt op het tabblad «Діагностика» (Diagnostiek) de eerste vastgestelde oorzaak.
Alleen-lezen commando's voor handmatige bevestiging (wijzigen niets):
`systemctl status mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeuring.service --no-pager`, `journalctl -u mijn-ruimte-goedkeuring -n 80 --no-pager`,
`ls -la /srv/mijn-ruimte/goedkeur-inbox`, `sudo mijn-ruimte-passkey lijst`.

## Wat er nieuw is

### «Programma» dat stappen uit de terminal leest → database → site
- `deploy/uitrol/mijn-ruimte-uitrol.sh` (root) schrijft nu gestructureerde stappen naar `stappen.jsonl` (ontvangst → kopie → authenticiteit → inhoud →
  installatie → klaar; percentage, uk/nl-tekst) en het **volledige logboek** van elke run naar `runs/<run>.log` (geheimen gemaskeerd). De uitvoer van `installeer-app.sh`
  wordt aan hetzelfde logboek toegevoegd, zodat de regelnummering stabiel blijft.
- `backend/uitrol-runs.ts` synchroniseert deze bestanden naar de database (`app.uitrol_runs`, `app.uitrol_run_regels`, migratie **0047**): incrementeel, met herkenning
  van de deelstappen van de installatie (code kopiëren, bouwen, back-up, migraties, activering) en een oplopend percentage van 42→97; verouderde runs → «Onderbroken» («Перервано»);
  SSH-installaties en oude gebeurtenissen worden meegenomen in de geschiedenis; pakketgegevens (sha256, commit, wie voorbereidde/goedkeurde, wat er is gewijzigd) worden aan de run gekoppeld en
  bewaard, zelfs na het opschonen van voorstellen.
- API (alleen eigenaar): `/api/owner/uitrol/live` (polling met cursor — nieuwe terminalregels), `/runs` (zoeken, filters, paginering), `/run`, `/run/regels`, `/diagnose`.
  Dit pollt elke ~1,5 s tijdens een installatie in plaats van SSE — eenvoudiger en betrouwbaar achter een proxy.

### Nieuwe interface (tabbladen)
- **Огляд (Overzicht)**: live-kaart (vier fasen Voorbereiding → Goedkeuring → Controles → Uitrol; 9 deelstappen; totale voortgang; duur; live-terminal met
  kleuren, kopiëren en downloaden), uploaden van een `.tar.gz`-archief (werkt vanaf de telefoon, zonder extensiefilter voor Android), passkey-goedkeuring,
  recente uitrollen, rechterkolom «Стан системи» (Systeemstatus) / «Швидкі дії» (Snelle acties) / «Хто готує оновлення» (Wie bereidt updates voor).
  Als root na goedkeuring langer dan 60 s zwijgt — rode waarschuwing met directe link naar «Діагностика».
- **Історія (Geschiedenis)**: alle installaties (passkey, SSH, handtekening) met zoeken, filters op status / methode / datum, paginering; detailpaneel: resultaat en oorzaak,
  stappen met tijdsduur, pakket (sha256, commit, wie goedkeurde, wijzigingen), gebeurtenissen, volledig logboek (kopiëren / downloaden). Daaronder — pakketten die niet tot installatie kwamen
  (geweigerd, verlopen, geannuleerd).
- **Журнал (Logboek)**: volledig logboek van de geselecteerde run.
- **Діагностика (Diagnostiek)**: status van units, vergrendeling, inbox, schijf, dienstlogboek, lijst van problemen met uitleg, alleen-lezen SSH-commando's.
- **Налаштування (Instellingen)**: stap 1 passkey, 2 SSH-bevestiging, 3 AI-toegang, 4 wie voorbereidt + rechtenbeheer (intrekken met reden).
- De oude «moderne» kaart die secties dupliceerde is verwijderd; licht/donker thema, mobiele weergave zonder horizontaal scrollen.

### Overig
- `deploy/uitrol/mijn-ruimte-uitrol-diagnose.sh` + `mijn-ruimte-diagnose.timer`, `mijn-ruimte-goedkeuring-wacht.timer` (waakhond) — worden geïnstalleerd door `installeer-app.sh`.
- De site laat een goedgekeurd voorstel niet meer «in de lucht hangen»: het resultaat komt uit de runs in de database; zonder resultaat na 30 min → «Verlopen» («Минув термін») met verwijzing naar «Діагностика».

### Archief uploaden: herhaalpogingen, hervatten, duidelijke fouten
De eerdere upload 143915 stopte na het eerste deel (524.288 van 3.568.107 bytes) en het pakket werd nooit geïnstalleerd — daarom veranderde de interface niet.
De exacte oorzaak van het falen van het tweede deel is zonder browser-/serverlogboeken niet te bewijzen (waarschijnlijk netwerk/proxy op de werk-pc). Daarom:
- elk deel wordt tot 5 keer met een pauze verzonden; bij desynchronisatie (`OFFSET_ONJUIST`) wordt de offset overgenomen uit de serverstatus;
- een onderbroken upload van hetzelfde bestand (versie + sha256 + grootte) **wordt hervat**, knop «Продовжити завантаження» (Upload hervatten); onvoltooide uploads kunnen worden geannuleerd;
- de uiteindelijke foutmelding toont de oorzaak en het percentage: «Завантаження перервано на 15 % — мережева помилка» (Upload onderbroken op 15% — netwerkfout, in plaats van een algemeen «fout»).

### Sitemeldingen: de kern van de zaak, niet alleen het feit dat er een fout is
Voorheen werd een mislukte AI-actie op de site getoond als «Дія на сайті: mcp tool — помилка». Nu:
- het logboek (`owner.mcp.tool`) bewaart bij een fout een **korte, veilige oorzaakcode** (`fout`, bijv. `SPIEGEL_FOUT`, `PATH_SECRET`, `AI_UIT`) — alleen een code, nooit tekst of bestandsinhoud;
- de melding (toast en meldingencentrum) toont: **wie → wat → waarop → status → oorzaak**, bijv. «Claude: Bestand src/X.tsx gelezen: fout — bestand niet gevonden in de actieve release op de server»;
- «geweigerd» (toegangsregels / andere ruimte) wordt onderscheiden van «fout» (uitgevoerd, maar mislukt); de kaart bevat de regels «Причина» (Oorzaak) en «Інструмент» (Hulpmiddel);
- als de server geen oorzaak heeft doorgegeven, vermeldt de melding dat expliciet in plaats van te zwijgen;
- bestanden: `shared/mcp-acties.ts` (`foutCodeUit`, `foutUitleg`, `siteTool*`), `backend/mcp-connector.ts`, `backend/site-activity.ts`, `src/connector-activity.ts`, `src/NotificationPanelBody.tsx`; tests — `tests/eenheid/site-activity.test.ts` (10/10).
Oude logboekregels zonder `fout` tonen het hulpmiddel en het doel, en de oorzaak alleen als die al in `reden` stond.

### Waarom de interface «niet veranderde» na installatie van 143915 en 151920 (bewezen)
In de terminal werd `tar -xzf mijn-ruimte-…-151920.tar.gz && cd mijn-ruimte-20261017-131800 && … installeren .` uitgevoerd: het archief pakt uit naar een **nieuwe** map met de naam van
het archief, maar `cd` ging naar de **oude** map 131800. Daardoor werd beide keren de oude code geïnstalleerd (in de uitvoer dezelfde commit; `20261017-154546`/`-162341` is het installatietijdstip, niet de pakketversie).
Controle via de site: `versie` van de live release = `20261017-131800`. Juist is: `cd mijn-ruimte-<versie uit archiefnaam> && cat UITROL-VERSIE`.
`deploy/installeer-app.sh installeren` print nu aan het begin de map, de `UITROL-VERSIE` daarin en de actieve versie, en als de map **niet nieuwer** is dan de actieve versie, waarschuwt het script en wacht het 8 s (Ctrl+C breekt af).

### Lege terminal en «bevroren» fasen tijdens installatie 155619 (live waargenomen)
Installatie 155619 via de interface slaagde (3 min 19 s, root: `klaar/OK`), maar op de pagina bleef de terminal leeg en stond de voortgang stil op 42%.
- **Oorzaak van de lege terminal (gevonden in de code, bevestigd door de symptomen: in de geschiedenis «Повний журнал (0 рядків)», deelstappen zonder tijd).** Het root-script kopieerde
  `runs/<run>.log` met `cp`, en `cp` maakt een nieuw bestand aan met groep **root** (de groep van de bron wordt niet overgenomen). De site draait niet als root en kon het bestand niet lezen,
  waardoor de regels niet in de database kwamen en het percentage (dat meegroeit met de logboekregels) op 42% bleef staan. Opgelost: na `cp` worden groep en rechten op `0640` gezet.
  Hetzelfde is bevestigd op een kopie: `cp` naar een nieuw bestand geeft `root:root`.
- **Terugvalroute in de site zelf (werkt al vanaf de volgende installatie, zonder het root-script bij te werken).** Als `runs/<run>.log` onleesbaar is, leest de site `installeer.log`
  (dat door root met de juiste groep wordt geschreven), maar **alleen als de eerste regel `[uitrol] run <id>` daarin precies deze run is**. Daardoor verschijnt het logboek van de reeds uitgevoerde 155619 vanzelf in de geschiedenis,
  zolang geen nieuwere run `installeer.log` heeft overschreven.
- **«Alles groen op 100%» direct na goedkeuring.** Zolang root nog geen enkele stap van het nieuwe pakket had geschreven, was de nieuwste run in de database de vorige (SSH, 100%) en toonde de kaart
  die als de huidige. Nu wordt zo'n run genegeerd: de fasen tonen «Voorbereiding ✓, Goedkeuring ✓, Controles (actief)», met het bijschrift «server pakt het pakket op…».
- Onder de actieve fase is nu zichtbaar welke deelstap precies draait (bijvoorbeeld «Bouwen (npm ci + vite)»).
- Tests: `uitrol-runs` 39/39 (+3 voor de terugvalroute, met name dat een vreemd `installeer.log` nooit wordt gebruikt), `uitrol-herstel` 25/25, Chromium-run van de interface 25/25 (+2: status «goedgekeurd, wachten»).

### Pagina «З'єднувачі ШІ» (AI-connectoren: mcp → Agenten → Connectoren) herschreven
- Agentkaarten met logo's (Claude, ChatGPT, Grok, Gemini, Copilot, Cursor): status, «Acties voor agent: 41 van 83 ingeschakeld», risiconiveau, ruimtes, «laatste actie».
- Filters Alle / Verbonden / Beschikbaar / Wachten op herverbinding, zoeken, sorteren (standaard — **op laatste actie, nieuwste bovenaan**; ook op naam, aantal toestemmingen, risico).
- Rechterkolom «Пришвидшене керування» (Versneld beheer): **Alle agenten inschakelen** (of alleen de aangevinkte), **Alle acties toestaan**, niveau (alleen lezen / lezen en schrijven / alleen schrijven / geen), categorie, ruimte (privé/technisch — technisch alleen voor de eigenaar);
  «Toestemmingsgroepen» (Mail-lezen, Mail-volledige toegang, Agenda, Bestanden, Bord, GitHub, Alles-alleen lezen, Alles uitschakelen) en «Laatste acties» (nieuwste bovenaan, fouten/weigeringen gemarkeerd).
- Vóór toepassen — samenvattingsvenster per agent: +wordt toegevoegd / −verdwijnt / totaal / risico, aantal risicovolle en gevoelige toestemmingen. **Uitbreiden van toestemmingen en «Alle acties toestaan» vereisen bevestiging met passkey** (`STEP_UP_REQUIRED`); beperken («Alles uitschakelen», «alleen lezen») werkt zonder passkey.
- Server: `POST /api/owner/connector-v2/massa` (`voorbeeld:true` — alleen berekening; anders opslaan via hetzelfde pad als voor één agent: beperkingen werken direct, uitbreidingen na opnieuw verbinden), auditregel `owner.connector.v2.massa`.
- Één gedeelde rekenfunctie `shared/connector-v2/massa.ts` voor browser en server (samenvatting = wat er wordt opgeslagen). Tests: `connector-v2-massa` 10/10, `connector-v2` 46/46.

## Controles
- Types: `tsc` (frontend en server) — foutloos; `vite build` — geslaagd.
- Nieuwe/bijgewerkte tests: `uitrol-runs` 36/36, `uitrol-herstel` 25/25, `uitrol-goedkeuring` 157/158 (enige fout — rol `mijnruimte_app` ontbreekt in de lokale database, staat los van de wijzigingen).
  Aangrenzende suites (`mcp-backups`, `beleid*`, `connector-v2`, `mcp-connector`, `toegang-context`, `toegangscodes`, `tar-lezen`) geven dezelfde resultaten als het originele pakket;
  suites die `ssh-keygen`/DB-rollen vereisen, worden in deze omgeving net als op het origineel overgeslagen.
- Interface gedraaid in echte Chromium met gesimuleerde serverantwoorden (22/22): tabbladen, live-installatie tot 100% (12 terminalregels, 9 deelstappen),
  geschiedenisfilters, details, logboek, diagnostiek, instellingen, telefoon 390 px, donker thema, geen JS-fouten en geen horizontale scroll.
- `tests/e2e/uitrol-meester.e2e.ts` is aangepast aan de nieuwe tabbladen, maar **niet uitgevoerd** (vereist een volledige lokale opstelling met Chrome).

## Hoe uit te rollen
1. Dit pakket moet **eenmalig via SSH** worden geïnstalleerd (het interfacepad dat niet reageert heeft de nieuwe timers nog niet): `sudo bash deploy/installeer-app.sh installeren /pad/naar/uitgepakte/map`
   (zoals in `RUNBOOK-VEILIGE-UITROL.md`, methode SSH). Migratie 0047 draait automatisch; de installer schakelt `mijn-ruimte-diagnose.timer` en `mijn-ruimte-goedkeuring-wacht.timer` in.
2. Open «Оновлення» → «Діагностика»: binnen een minuut moet er een vers rapport van root verschijnen.
3. Volgende updates — vanaf de telefoon: «Огляд» → kies `.tar.gz` → «Завантажити на сервер» → «Схвалити й встановити» (passkey) → volg de live-kaart.

## Niet gewijzigd / bekende grenzen
- Er zijn geen CPU-/RAM-meters: daarvoor is een aparte gegevensbron nodig (in het ontwerp zaten ze wel); de kaart «Стан системи» toont wat root daadwerkelijk weet over de updateketen.
- Voor SSH-installaties is alleen het resultaat (`SSH_OK`) zichtbaar en niet elke losse stap; het volledige logboek staat op de server.
- De modi van het technisch profiel «tot uitloggen» / «tot verlaten van het profiel» blijven begrensd op 8 uur (`CHECK` in de database).
