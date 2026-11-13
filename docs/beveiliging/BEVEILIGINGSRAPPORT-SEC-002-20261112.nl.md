> 🌐 **Taal / Мова:** [Українська](ЗВІТ-БЕЗПЕКИ-SEC-002-20261112.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Beveiligingsrapport SEC-002 (12-11-2026): gevonden kwetsbaarheden en hun herstel

Dit rapport beschrijft openlijk de kwetsbaarheden die bij een diepe beveiligingsaudit van de hele repository «Mijn Ruimte» (taak SEC-002) zijn gevonden, en hoe ze zijn hersteld. De beschrijving verschijnt tegelijk met de patches en het releasearchief, zodat iedereen die het project zelf draait van het gevaar weet en bijwerkt. Er staan geen waarden van geheimen, geen privégegevens en geen stapsgewijze aanvalsrecepten in: alleen de kern van elke fout, wie die kon misbruiken, het gevolg en wat er is veranderd. Aantal vermeldingen: **249**.

Dit document is gemaakt door het script `scripts/sec-002-verslag.mjs` uit het gegevensbestand [`sec-002-gegevens.json`](sec-002-gegevens.json); bewerk het niet met de hand.

## Voor wie dit rapport is en wat te doen

1. **Werk bij naar de release SEC-002:** _het adres wordt bij de release toegevoegd_. Eerdere versies bevatten de hieronder beschreven kwetsbaarheden.
2. De nieuwe databasemigraties van deze release worden bij een gewone installatie van de update toegepast; er zijn geen aparte stappen nodig.
3. Werk de browserextensie bij naar versie 0.9.3 (daarin is de bescherming tegen AI-acties en het verbergen van geheimen gewijzigd).
4. Bekijk na de update «Sessies» en de AI-koppelingen en trek alles in wat u niet kent; controleer de pagina «Beveiliging» — daar ziet u of extra aanmeldbevestigingen niet zijn uitgeschakeld.
5. Draaiden er op uw server andere lokale gebruikers of AI-agenten die opdrachten mogen uitvoeren, wijzig dan het wachtwoord van de systeemrol van de database (zie server-uitrol-07). Gaf u het recht «update voorbereiden» aan externe accounts of een AI, overweeg dan de geheimen van de dienst te roteren volgens de procedure in het sleutelregister (zie server-uitrol-01).

Bijwerken is vooral belangrijk als:

- uw site vanaf internet of een ander netwerk bereikbaar is;
- de site meerdere gebruikers heeft (gezin, collega's, gasten);
- u AI-agenten koppelt (MCP, tokens, agenten op apparaten);
- u de browserextensie voor AI gebruikt.

## Korte samenvatting in cijfers

| Kenmerk | Aantal |
| --- | --- |
| Bevindingen van de audit | 144 (hoofdaudit 126, aanvullend onderzoek 18) |
| — met ernst «hoog» | 26 |
| — met ernst «middel» | 63 |
| — met ernst «laag» | 55 |
| — opgelost | 142 |
| — gedeeltelijk opgelost | 2 |
| — weerlegd | 0 |
| — uitgesteld | 0 |
| Nieuwe fouten die onafhankelijke controleurs in patches en naburige code vonden | 105 (waarvan regressies door patches zonder direct beveiligingsgevolg: 22; oude fouten uit de basis zonder beveiligingsgevolg: 1) |
| — nieuwe fouten: opgelost | 104 |
| — nieuwe fouten: gedeeltelijk opgelost | 1 |
| — nieuwe fouten: weerlegd | 0 |
| — nieuwe fouten: uitgesteld | 0 |

Een deel van de bevindingen beschrijft dezelfde grondoorzaak vanuit verschillende gebieden (10 zulke groepen); in de vermeldingen staat dat bij «Dezelfde grondoorzaak».

## Tabel per gebied

| Gebied | Bevindingen | Hoog | Middel | Laag | Opgelost | Gedeeltelijk | Uitgesteld | Nieuwe fouten van controleurs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Aanmelden en sessies | 10 | 2 | 5 | 3 | 10 | 0 | 0 | 5 |
| Rechten en RLS | 11 | 2 | 6 | 3 | 11 | 0 | 0 | 10 |
| HTTP-grens | 10 | 2 | 5 | 3 | 10 | 0 | 0 | 6 |
| Geheimen | 8 | 0 | 4 | 4 | 7 | 1 | 0 | 2 |
| AI-agenten en MCP | 14 | 3 | 8 | 3 | 13 | 1 | 0 | 4 |
| Terminal en uitrol | 11 | 2 | 5 | 4 | 11 | 0 | 0 | 11 |
| E-mail | 16 | 3 | 7 | 6 | 16 | 0 | 0 | 5 |
| Cloudopslag | 15 | 1 | 5 | 9 | 15 | 0 | 0 | 16 |
| Integraties | 14 | 4 | 4 | 6 | 14 | 0 | 0 | 12 |
| Gebruikersinterface | 9 | 1 | 3 | 5 | 9 | 0 | 0 | 5 |
| Browserextensie | 9 | 2 | 5 | 2 | 9 | 0 | 0 | 5 |
| Toeleveringsketen en configuratie | 8 | 2 | 3 | 3 | 8 | 0 | 0 | 8 |
| Privacy en logboeken | 9 | 2 | 3 | 4 | 9 | 0 | 0 | 16 |
| **Totaal** | **144** | **26** | **63** | **55** | **142** | **2** | **0** | **105** |

## Belangrijkste herstelwerk (alles met ernst hoog)

Volledige beschrijvingen staan in de onderstaande hoofdstukken.

- **aanmelden-01** — De verificatie-app (TOTP) kon zonder bevestiging van de identiteit worden ingeschakeld (opgelost). Het inschakelen en bevestigen van de verificatie-app vereist nu een verse bevestiging met een al bestaande aanmeldmethode.
- **aanmelden-02** — Een sessie beëindigen trok de ‘onthouden browser’ niet in (opgelost). Het beëindigen van een sessie trekt nu ook het bijbehorende onthouden van de browser in, samen met alle tabbladsessies die ervan afhangen.
- **aanv-gat-b-01** — AI-vertaling of -samenvatting van een e-mail kon de server stilleggen (opgelost). Invoervelden worden vóór verwerking ingekort, het splitsen in zinnen en alinea's is lineair herschreven, en de expressies hebben geen geneste herhalingen meer.
- **aanv-gat-c-01** — Zoeken in de e-mail kon de server stilleggen via een speciaal opgebouwd binnenkomend bericht (opgelost). Adressen en domeinen worden lineair en begrensd opgehaald, de vage vergelijking is in omvang begrensd, en zoeken geeft voorrang aan andere verzoeken en heeft een tijdsbudget.
- **ai-mcp-01** — Een intern argument liet een AI-client een hulpmiddel aanroepen buiten de toestemmingscontroles om (opgelost). De server haalt het doel van een aanroep niet meer uit de argumenten van de client; aliassen worden alleen via de eigen lijst van de server herleid en alle toestemmingscontroles gelden voor het werkelijke hulpmiddel.
- **ai-mcp-02** — De regel ‘PowerShell altijd met bevestiging’ was te omzeilen met een andere schrijfwijze van de programmanaam (opgelost). De programmanaam wordt nu op de server en in de agent op dezelfde manier genormaliseerd, en de agent accepteert voor PowerShell alleen de exacte bekende namen.
- **ai-mcp-03** — Eén ongeldig bericht van een gekoppelde agent legde de hele site stil (opgelost). De verwerker controleert de vorm van het bericht en vangt fouten op, en de server heeft een algemene afhandeling voor onverwachte fouten die ze vastlegt zonder dat het proces stopt.
- **autorisatie-01** — Het intrekken van een sessie kon ‘ongedaan’ raken door gelijktijdige activiteit van diezelfde sessie (opgelost). Het bijwerken van sessiegegevens is atomair en gedeeltelijk gemaakt: een al ingetrokken sessie wordt niet meer aangeraakt en het intrekkenmerk kan niet meer verdwijnen.
- **autorisatie-02** — Een blokkering of rolverlaging kon ‘ongedaan’ raken door verzoeken van de gebruiker zelf (opgelost). Deze routes wijzigen nu alleen hun eigen velden met een atomaire gedeeltelijke bijwerking en kunnen status, rol of rechten niet terugzetten.
- **extensie-01** — Eén ongeldig bericht van een gekoppelde extensie of agent stopte het serverproces (opgelost). De poort controleert de vorm van het bericht en vangt fouten van de verwerker op; de server valt niet meer om door een onafgehandelde fout.
- **extensie-02** — Een AI met het recht ‘klikken en typen’ kon zelf de toestemmingsknoppen op de AI-beheerpagina indrukken (opgelost). Knoppen voor goedkeuring, toestemming, het toekennen van rechten en AI-schakelaars reageren alleen op echte handelingen van een mens, de extensie klikt en typt niet op deze elementen, en het toekennen van AI-rechten vereist een verse bevestiging die niet wordt «onthouden».
- **http-rand-01** — Eén ongeldig WebSocket-verzoek stopte het serverproces, zonder aanmelden (opgelost). Het adres van het verzoek wordt veilig ontleed, de verwerker vangt fouten op, en een ongeldig verzoek wordt geweigerd zonder gevolgen voor het proces.
- **http-rand-02** — Een afwijkend antwoord van een vreemde server stopte het siteproces (opgelost). De statuscode wordt gecontroleerd voordat het antwoord wordt opgebouwd, en elke fout bij het verwerken van een antwoord van een vreemde server komt als gewone weigering terug.
- **integraties-01** — Het ontleden van het logo van een afzenderdomein kon de server minuten stilleggen (opgelost). Het ontleden van vreemde SVG en HTML is herschreven zodat de tijd lineair blijft, en omvang en aantal verwerkte elementen zijn begrensd.
- **integraties-02** — Het antwoord van een vreemde CalDAV-server kon de server minuten tot uren stilleggen (opgelost). Het ontleden van het CalDAV-antwoord is herschreven tot één lineaire doorloop met grenzen aan het aantal elementen en een stop bij een niet-gesloten label.
- **integraties-03** — Een afwijkende statuscode van een externe server stopte het siteproces (opgelost). De ophaalfunctie wijst een ongeldige statuscode af als gewone fout, en de integraties tonen daarvoor een vaste foutcode.
- **integraties-04** — Aanmelden via Telegram: een ‘bekend apparaat’ werd herkend aan een na te maken browsernaam (opgelost). Een bekend apparaat wordt nu herkend aan een eigen geheim browserkenmerk; een verzoek uit een browser zonder dat kenmerk wordt als nieuw apparaat getoond.
- **interface-01** — De knop ‘Toestaan’ verscheen zonder volledige beschrijving van wat er werd toegestaan (opgelost). Goedkeuringsvensters tonen nu alle parameters van de actie als aparte velden in een logische volgorde, zonder inkorten, met een korte regel «wat precies» en zichtbare markeringen voor onzichtbare tekens.
- **keten-config-01** — Eén verzoek zonder aanmelden met een ongeldig adres beëindigde het serverproces (opgelost). De verwerker ontleedt het adres veilig en vangt alle fouten op; er is een algemene bescherming van het proces tegen onafgehandelde fouten bij gekomen.
- **keten-config-02** — Een binnenkomend bericht met speciaal opgebouwde HTML legde de server minuten tot uren stil (opgelost). De omvang van de inhoud wordt vóór verwerking begrensd, en het opschonen van HTML is vervangen door een lineaire doorloop in één keer.
- **post-01** — Eén bericht kon de hele server stilleggen (opgelost). De inhoud van het bericht wordt vóór verwerking ingekort, en het omzetten van HTML naar tekst gebeurt in één lineaire doorloop.
- **privacy-logboek-01** — Het definitief wissen van een account liet de meeste gegevens staan (opgelost). Definitief wissen volgt nu hetzelfde volledige plan als direct verwijderen, inclusief afhankelijke rijen; een mislukte poging wordt vastgelegd, herhaald en houdt andere niet tegen.
- **privacy-logboek-02** — Een auditregel mislukte door bepaalde tekens en de fout werd ingeslikt (opgelost). Tekst voor het logboek wordt van zulke tekens ontdaan en ingekort zonder tekens te breken; lukt het opslaan van details toch niet, dan wordt de regel zonder details geschreven, en het uitgeven van een AI-token zonder logregel wordt teruggedraaid.
- **server-uitrol-01** — De voorcontrole van een updatepakket kon serverbestanden buiten het archief lezen (opgelost). Een onleesbare regel in de inhoudslijst blokkeert nu het pakket; na het uitpakken en vóór de eerste leesactie wordt een pakket met koppelingen, FIFO's of apparaten geweigerd; alle leesacties blijven binnen de pakketmap en alleen voor gewone bestanden.
- **server-uitrol-02** — Root schreef het releasearchief in een map die de applicatie beheert (opgelost). Archief en controlesom worden in een eigen afgesloten map van root voorbereid en alleen via hernoemen, dat geen koppelingen volgt, naar de gedeelde map gezet; een map die een koppeling is wordt geweigerd, en bestanden uit applicatiemappen leest root alleen zonder koppelingen en met een groottegrens.
- **wolk-01** — Eén importverzoek voor notities kon de hele server stilleggen (opgelost). De gevaarlijke expressies zijn vervangen door lineaire verwerking, de lengte van velden wordt vóór verwerking gecontroleerd, en zoeken in notities heeft grenzen voor woordlengte en uitvoeringstijd.
- **eind-1** — Het vernieuwen van de eigen sessie kon de zekering de aanmeldbeveiliging laten uitschakelen _(nieuwe fout, gevonden door een controleur)_ (opgelost). Na een volledige controle markeert het vernieuwen de sessie als gecontroleerd, en de zekering schakelt de beveiliging alleen uit bij weigeringen op meerdere verschillende routes.
- **toets-g02-3** — Na de overstap op uitnodigingen kon via de site geen woningdeelnemer meer worden toegevoegd _(nieuwe fout, gevonden door een controleur)_ (opgelost). De interface kan nu uitnodigingen versturen, intrekken, aannemen en afwijzen, ook op het startscherm.
- **toets-g04-1** — Notities importeren bleef kwadratisch via de kop van het bestand _(nieuwe fout, gevonden door een controleur)_ (opgelost). De kop wordt ontleed zonder reguliere expressies met herhaling en heeft een groottegrens.
- **toets-g04-2** — Zoeken in notities met een extreem lang woord belastte de database _(nieuwe fout, gevonden door een controleur)_ (opgelost). De zoekvraag en elk woord worden ingekort, en zoeken heeft een tijdslimiet met een eigen weigeringscode.
- **toets-g10a-2** — Andere knoppen die de AI rechten geven, bleven klikbaar voor de AI _(nieuwe fout, gevonden door een controleur)_ (opgelost). De extensie handelt niet in deze zones, knoppen reageren alleen op handelingen van een mens, en het toekennen van rechten vereist een verse bevestiging.
- **toets-g10b-4** — Het nieuwe wisplan kon accounts met een bepaalde geschiedenis niet wissen _(nieuwe fout, gevonden door een controleur)_ (opgelost). Het plan verwijdert eerst afhankelijke rijen; mislukkingen worden geteld, gelogd en aan de site-eigenaar gemeld, en kandidaten zijn geordend.
- **toets-g10e-1** — De grens op gelijktijdige verzoeken brak het legitiem uploaden van mappen naar de cloud _(nieuwe fout, gevonden door een controleur)_ (opgelost). Voor anonieme en aangemelde verzoeken gelden aparte grenzen.
- **toets-g10e-7** — Het nieuwe geheugenplafond per adres brak het uploaden van mappen opnieuw _(nieuwe fout, gevonden door een controleur)_ (opgelost). De cloudcliënt verstuurt hoogstens twee bestanden tegelijk en wacht als de server daarom vraagt; de servergrenzen zijn niet verruimd.
- **toets-g10g-1** — «Sessie beëindigen» trok de «onthouden browser» niet in als er een reservesessie was _(nieuwe fout, gevonden door een controleur)_ (opgelost). Met de sessie worden altijd de onthouden browser en alle sessies en tabbladen die erop steunen ingetrokken, behalve de eigen huidige.
- **toets-g10g-3** — «Nee, dit ben ik niet» in Telegram liet de «onthouden browser» bestaan _(nieuwe fout, gevonden door een controleur)_ (opgelost). Dit antwoord voert dezelfde volledige intrekprocedure uit als «Sessies».
- **toets-zekering** — De automatische zekering kon beveiligingsfuncties van de site zelf uitschakelen _(nieuwe fout, gevonden door een controleur)_ (opgelost). De zekering schakelt een beveiligingsfunctie alleen automatisch uit op signalen van die functie zelf; een algemene piek van fouten levert de eigenaar een voorstel tot controle op, geen uitschakeling.

## Alle opgeloste bevindingen per gebied

### Aanmelden en sessies

#### aanmelden-01 · De verificatie-app (TOTP) kon zonder bevestiging van de identiteit worden ingeschakeld

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Voor het eerste inschakelen van de verificatie-app was geen verse bevestiging van de identiteit nodig, terwijl die app daarna wel als ‘sterke’ bevestiging voor gevoelige handelingen gold.
- **Wie het kon misbruiken en het gevolg.** Wie een open sessie van iemand in handen kreeg, kon zelf een verificatie-app toevoegen en daarmee het wijzigen van aanmeldmethoden en andere gevoelige handelingen bevestigen.
- **Wat is veranderd.** Het inschakelen en bevestigen van de verificatie-app vereist nu een verse bevestiging met een al bestaande aanmeldmethode.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### aanmelden-02 · Een sessie beëindigen trok de ‘onthouden browser’ niet in

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Als iemand op de pagina ‘Sessies’ een sessie beëindigde, bleef het onthouden van die browser geldig, zodat hetzelfde apparaat zonder opnieuw aanmelden een nieuwe volledige sessie kon maken.
- **Wie het kon misbruiken en het gevolg.** Na diefstal van een apparaat of cookie stopte het beëindigen van de vreemde sessie de toegang niet: die kon nog tot 30 dagen worden hersteld.
- **Wat is veranderd.** Het beëindigen van een sessie trekt nu ook het bijbehorende onthouden van de browser in, samen met alle tabbladsessies die ervan afhangen.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### aanmelden-03 · De pogingenteller van het codewoord was niet bestand tegen gelijktijdige verzoeken

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Mislukte pogingen voor het codewoord werden niet atomair geteld: veel gelijktijdige pogingen telden als één, waardoor de blokkering na vijf fouten in de praktijk niet werkte.
- **Wie het kon misbruiken en het gevolg.** Het codewoord, dat het account juist moet beschermen als een sessie is gestolen, kon veel sneller worden geraden dan de limiet toestaat.
- **Wat is veranderd.** Een poging wordt nu atomair gereserveerd vóórdat het woord wordt gecontroleerd, zodat gelijktijdige verzoeken de limiet en de blokkering niet meer omzeilen.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### aanmelden-04 · Aanmelden via Telegram was niet gebonden aan de browser die ermee begon

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een aanmeldverzoek via het Telegram-venster controleerde niet of het werd bevestigd in dezelfde browser waarin het aanmelden was gestart. Aanmelden via Telegram staat in de huidige versie standaard aan, dus dit geldt voor de meeste installaties.
- **Wie het kon misbruiken en het gevolg.** Iemand kon ertoe worden verleid om op de echte site het aanmeldverzoek van een ander te bevestigen en zo een sessie in een vreemde browser te openen.
- **Wat is veranderd.** Het Telegram-aanmeldvenster werkt alleen in de browser die precies deze poging begon; bij aanmelden via een directe link naar de bot tonen site en bot hetzelfde symbool, dat de persoon vóór het bevestigen vergelijkt.
- **Test:** [`telegram-inlog-apparaat-20261112.test.ts`](../../tests/eenheid/telegram-inlog-apparaat-20261112.test.ts)

#### aanmelden-05 · Een ‘bekend apparaat’ werd alleen herkend aan de naam van browser en systeem

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een apparaat gold als bekend wanneer de naam van de browser en het besturingssysteem uit de verzoekkop overeenkwamen, en die kop is eenvoudig na te maken.
- **Wie het kon misbruiken en het gevolg.** De regel ‘op een nieuw apparaat is een sterkere aanmeldmethode nodig’ en de melding over een aanmelding vanaf een nieuw apparaat konden worden omzeild.
- **Wat is veranderd.** Een apparaat wordt nu herkend aan een eigen willekeurig browserkenmerk dat na een geslaagde aanmelding wordt uitgegeven; de browsernaam dient alleen nog voor weergave.
- **Dezelfde grondoorzaak:** integraties-04
- **Test:** [`telegram-inlog-apparaat-20261112.test.ts`](../../tests/eenheid/telegram-inlog-apparaat-20261112.test.ts)

#### aanmelden-06 · De modus ‘bekijken als gebruiker’ met handelingsrecht liet handelingen met blijvende gevolgen door

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De lijst met verboden handelingen voor ondersteuning, die van de gebruiker tijdelijk namens hem mocht handelen, dekte het verlenen van blijvende toegang, het wijzigen van AI-toestemmingen, het codewoord en het verwijderen van het account niet af.
- **Wie het kon misbruiken en het gevolg.** Een ondersteuningsmedewerker kon in de korte toegestane tijd toegang voor zichzelf achterlaten die ook na het einde van de inzage bleef bestaan.
- **Wat is veranderd.** De modus «met actierecht» werkt nu met een lijst toegestane acties (e-mail, cloud, agenda, notities enzovoort); koppelingen, toestemmingen, delen, openbare links, aanmeldmethoden, het codewoord en het verwijderen van het account zijn daarin altijd verboden.
- **Test:** [`sec-002-g07-20261112.test.ts`](../../tests/eenheid/sec-002-g07-20261112.test.ts)

#### aanv-gat-a-03 · De controle van de geheime Telegramcode blokkeerde de hele site

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Berichten in de chat met de bot werden met zware hashing synchroon in de hoofdthread op overeenkomst met de geheime code gecontroleerd, meerdere keren per bericht.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker met gekoppeld Telegram kon met gewone berichten aan de bot de site voor iedereen seconden lang stilleggen.
- **Wat is veranderd.** Hashing gebeurt asynchroon met begrensde gelijktijdigheid, het aantal kandidaten en het hashbudget per persoon zijn begrensd, en berichten die op een code lijken worden zonder hashing uit de chat verwijderd als het budget op is.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### aanmelden-07 · De knop ‘Afmelden’ in het codewoordvenster beëindigde alleen het tabblad

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** ‘Afmelden’ in het codewoordvenster sloot alleen het huidige tabblad; de sessie in die browser bleef tot 30 dagen geldig.
- **Wie het kon misbruiken en het gevolg.** Op een gedeelde computer zag de volgende persoon van wie het account was en kon die het codewoord proberen te raden.
- **Wat is veranderd.** ‘Afmelden’ in dit venster beëindigt nu de sessie van het account in de browser volledig, inclusief het onthouden ervan.
- **Test:** [`sec-002-g06-20261112.test.ts`](../../tests/eenheid/sec-002-g06-20261112.test.ts)

#### aanmelden-08 · De aanmeldroute met wachtwoord verried welke adressen een account hebben

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De openbare aanmeldroute met wachtwoord antwoordde al vóór de wachtwoordcontrole anders voor adressen met een ingeschakelde verificatie-app, en mislukte pogingen zonder code werden niet geteld.
- **Wie het kon misbruiken en het gevolg.** Een buitenstaander kon nagaan welke adressen op de site geregistreerd zijn en dat gebruiken voor gerichte phishing.
- **Wat is veranderd.** Het antwoord is voor elk adres gelijk: een poging wordt vóór de controle geteld, voor een onbekend adres gebeurt hetzelfde rekenwerk, en wachtwoord en code worden in één verzoek gecontroleerd.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### aanmelden-09 · De controle van de geheime Telegram-code was niet bestand tegen gelijktijdige pogingen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De teller van mislukte pogingen voor de geheime Telegram-code werd bijgewerkt zonder de rij te vergrendelen, waardoor een reeks gelijktijdige pogingen langs de pauze en het uitschakelen van de code glipte.
- **Wie het kon misbruiken en het gevolg.** Een korte code kon met meer pogingen worden geraden dan bedoeld, en de server werd daarbij tijdelijk trager.
- **Wat is veranderd.** Een poging wordt nu met één voorwaardelijke schrijfactie gereserveerd vóór de controle van de code; pauze en uitschakeling gelden ook bij gelijktijdige verzoeken.
- **Dezelfde grondoorzaak:** integraties-12
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

### Rechten en RLS

#### autorisatie-01 · Het intrekken van een sessie kon ‘ongedaan’ raken door gelijktijdige activiteit van diezelfde sessie

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Elk verzoek van een sessie overschreef de sessiegegevens in de database volledig vanuit een eigen, verouderde momentopname, waardoor het kenmerk ‘ingetrokken’ kon verdwijnen als de ingetrokken sessie op dat moment actief was.
- **Wie het kon misbruiken en het gevolg.** De accounthouder koos ‘sessie beëindigen’, maar de vreemde sessie met een gestolen cookie bleef geldig en verscheen opnieuw als actief.
- **Wat is veranderd.** Het bijwerken van sessiegegevens is atomair en gedeeltelijk gemaakt: een al ingetrokken sessie wordt niet meer aangeraakt en het intrekkenmerk kan niet meer verdwijnen.
- **Test:** [`sec-002-g10h-20261112.test.ts`](../../tests/eenheid/sec-002-g10h-20261112.test.ts)

#### autorisatie-02 · Een blokkering of rolverlaging kon ‘ongedaan’ raken door verzoeken van de gebruiker zelf

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Enkele routes overschreven de gebruikersgegevens volledig vanuit een momentopname van het begin van het verzoek, waardoor een verse blokkering, rolverlaging of ingetrokken recht kon worden overschreven door een gelijktijdig verzoek van die gebruiker.
- **Wie het kon misbruiken en het gevolg.** Een deelnemer die de eigenaar had geblokkeerd of rechten had ontnomen, kon status en rechten behouden door op het moment van blokkeren verzoeken te sturen.
- **Wat is veranderd.** Deze routes wijzigen nu alleen hun eigen velden met een atomaire gedeeltelijke bijwerking en kunnen status, rol of rechten niet terugzetten.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### aanv-gat-a-01 · Een besluit over een toegangsverzoek (ook het geven van de beheerdersrol) vereiste geen verse bevestiging

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het goedkeuren van een toegangsverzoek gebeurde zonder nieuwe bevestiging van de aanmelding, zelfs voor een al beslist verzoek en zonder bescherming van geblokkeerde accounts of het account van de eigenaar.
- **Wie het kon misbruiken en het gevolg.** Wie in een open sessie van de eigenaar handelde zonder diens passkey (gestolen cookie, onbeheerde browser, AI in het tabblad), kon zichzelf de beheerdersrol geven of een geblokkeerd account deblokkeren.
- **Wat is veranderd.** Een besluit vereist een verse bevestiging, geldt alleen voor een wachtend verzoek en gebeurt atomair, werkt niet op de eigenaar en niet op geblokkeerde of verwijderde accounts, en elke weigering komt in het logboek.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### aanv-gat-a-02 · Een door de beheerder verwijderd account kon zijn verwijdering zelf ongedaan maken

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een verouderde route voor toegangsverzoeken zette een verwijderd account terug in de wachtstand, waardoor definitief wissen niet gebeurde; een geblokkeerd en daarna verwijderd account kreeg weer een sessie.
- **Wie het kon misbruiken en het gevolg.** Iemand die door de eigenaar was verwijderd of geblokkeerd, kon aan het wissen ontsnappen en weer een sessie krijgen.
- **Wat is veranderd.** Een toegangsverzoek wordt geweigerd voor geblokkeerde en verwijderde accounts, aanmelden levert voor «geblokkeerd en verwijderd» geen sessie op, en gastcodes van zo'n account werken niet.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### autorisatie-03 · Een ingetrokken API-sleutel kon weer geldig worden

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Elk gebruik van een API-sleutel overschreef de volledige gegevens ervan, waardoor een intrekking op hetzelfde moment verloren kon gaan.
- **Wie het kon misbruiken en het gevolg.** Na een gelekte sleutel zag de eigenaar ‘ingetrokken’, terwijl de sleutel tot het einde van zijn looptijd kon blijven werken.
- **Wat is veranderd.** Het bijhouden van het gebruik is een atomaire bijwerking geworden die niet werkt op een ingetrokken sleutel; een ingetrokken sleutel wordt direct geweigerd.
- **Test:** [`sec-002-g10h-20261112.test.ts`](../../tests/eenheid/sec-002-g10h-20261112.test.ts)

#### autorisatie-04 · Een voormalige deelnemer van een gedeelde ruimte kon ‘eigen’ blokken blijven wijzigen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Bij het wijzigen en verwijderen van een blok werd alleen gecontroleerd wie het had gemaakt, niet of die persoon nog toegang tot de ruimte had.
- **Wie het kon misbruiken en het gevolg.** Nadat de toegang was ingetrokken, kon de voormalige deelnemer naam, koppeling en uiterlijk van zijn blokken op het werkblad van de eigenaar blijven wijzigen of ze verwijderen.
- **Wat is veranderd.** Het wijzigen en verwijderen van een blok vereist nu een op dat moment geldig bewerkrecht in die ruimte.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### autorisatie-05 · Het overzicht ‘Sessies’ toonde alleen de eerste 100 regels

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De sessielijst las alleen de honderd oudste regels, waardoor nieuwere actieve sessies er niet in voorkwamen.
- **Wie het kon misbruiken en het gevolg.** De accounthouder kon een vreemde sessie over het hoofd zien en kon die niet afzonderlijk beëindigen.
- **Wat is veranderd.** Het overzicht leest nu alle sessies, toont de nieuwste actieve eerst en vermeldt het totaal; ook het noodbeëindigen bestrijkt alle sessies.
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### autorisatie-06 · Een niet-goedgekeurd account kon de eigenaar overspoelen met meldingen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een toegangsverzoek van een nog niet goedgekeurd account maakte elke keer een nieuwe melding voor de eigenaar en nieuwe regels in de database aan, zonder limiet.
- **Wie het kon misbruiken en het gevolg.** Iedereen die zich via Google had aangemeld, kon het meldingenpaneel van de eigenaar vullen, echte beveiligingssignalen verdringen en de database onbegrensd laten groeien.
- **Wat is veranderd.** Een herhaald toegangsverzoek maakt geen nieuwe meldingen meer aan, en het aantal verzoeken per account en per adres is begrensd.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### autorisatie-07 · Een verlopen uitnodiging met een hogere rol ‘herleefde’ via een kijklink

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Bij deelname via een link werd een oude uitnodiging voor hetzelfde adres meegeteld, ook als die al was verlopen of bij een ander account hoorde.
- **Wie het kon misbruiken en het gevolg.** Iemand met een link voor alleen bekijken kon de hogere rol uit een oude, verlopen uitnodiging krijgen.
- **Wat is veranderd.** Deelname via een link neemt de rol alleen uit de link zelf; een oude uitnodiging telt alleen mee als ze nog geldig is en bij de echte eigenaar van het adres hoort.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### autorisatie-08 · De rol ‘alleen bekijken’ gold niet voor de meeste schrijfroutes

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De beperking ‘alleen bekijken’ steunde op het raden van schrijfacties aan de hand van woorden in het routepad, waardoor veel wijzigende routes er niet onder vielen.
- **Wie het kon misbruiken en het gevolg.** Een account dat van de eigenaar alleen mocht bekijken, kon in de eigen ruimte toch berichten versturen, op het bord schrijven, tokens uitgeven en AI-functies gebruiken.
- **Wat is veranderd.** Voor de rol «alleen bekijken» geldt nu op alle routes «verboden tenzij toegestaan»: elke route is ingedeeld als lezen, eigen instellingen en afmelden, of schrijven; een test controleert of de lijst volledig is, en weigeringen worden gelogd. AI-tokens die vóór het verlagen van de rol zijn uitgegeven, kunt u het best handmatig intrekken.
- **Test:** [`sec-002-afwerking-a-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-a-20261112.test.ts)

#### autorisatie-09 · Niet-goedgekeurde accounts hadden toegang tot enkele routes buiten het wachtscherm

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Enkele groepen routes (apparaatbevestiging en de bijbehorende gebeurtenisstroom, codewoord, lijst van integraties) controleerden niet of het account al door de eigenaar was goedgekeurd.
- **Wie het kon misbruiken en het gevolg.** Gegevens van anderen kwamen niet vrij, maar niet-goedgekeurde accounts hadden onnodig veel mogelijkheden voor misbruik en het opstapelen van gegevens.
- **Wat is veranderd.** Deze routes weigeren nu niet-goedgekeurde accounts met een duidelijke code; het overdragen van een sessie had die controle al (dat onderdeel is weerlegd).
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

### HTTP-grens

#### http-rand-01 · Eén ongeldig WebSocket-verzoek stopte het serverproces, zonder aanmelden

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De verwerker van verzoeken om een WebSocket-verbinding op te zetten ving de fout bij het ontleden van een ongeldig adres niet op, waardoor het serverproces stopte.
- **Wie het kon misbruiken en het gevolg.** Iedereen op internet, zonder account, kon met herhaalde verzoeken alle sites van de installatie onbereikbaar houden.
- **Wat is veranderd.** Het adres van het verzoek wordt veilig ontleed, de verwerker vangt fouten op, en een ongeldig verzoek wordt geweigerd zonder gevolgen voor het proces.
- **Dezelfde grondoorzaak:** keten-config-01
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### http-rand-02 · Een afwijkend antwoord van een vreemde server stopte het siteproces

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De gedeelde functie voor het veilig ophalen van externe adressen viel om met een onafgehandelde fout wanneer een vreemde server antwoordde met een statuscode buiten het toegestane bereik.
- **Wie het kon misbruiken en het gevolg.** Een bericht met een afbeelding op de server van een aanvaller, of een agenda-abonnement, volstond om de site bij elke aanroep van zo'n adres voor iedereen te laten stoppen.
- **Wat is veranderd.** De statuscode wordt gecontroleerd voordat het antwoord wordt opgebouwd, en elke fout bij het verwerken van een antwoord van een vreemde server komt als gewone weigering terug.
- **Dezelfde grondoorzaak:** integraties-03
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### aanv-gat-c-02 · Een e-mailadres werd gecontroleerd vóór de lengtecontrole

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De expressie voor het controleren van een e-mailadres, met kwadratische rekentijd op bepaalde invoer, werd op meerdere plekken vóór of zelfs zonder lengtecontrole toegepast.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker (zelfs met de rol «alleen bekijken») kon met één verzoek met een zeer lang «adres» de server minutenlang stilleggen.
- **Wat is veranderd.** De gedeelde adrescontrole kijkt eerst naar de lengte en verwerkt het domein lineair; de oude expressie is overal verwijderd.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### http-rand-03 · Een gekoppelde agent of extensie stopte de server met één bericht

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De berichtverwerker voor gekoppelde apparaten ving de fout bij een bericht met een ongeldige resultaatidentificatie niet op.
- **Wie het kon misbruiken en het gevolg.** Elk account dat een apparaat of extensie kan koppelen, kon de server telkens opnieuw voor alle gebruikers laten stoppen.
- **Wat is veranderd.** De resultaatidentificatie wordt op vorm gecontroleerd, en de verwerker vangt fouten op en sluit alleen die ene verbinding.
- **Dezelfde grondoorzaak:** ai-mcp-03, keten-config-03, extensie-01
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### http-rand-04 · Een gecodeerd pad omzeilde de bescherming van technische en interne bestanden

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De server voor statische bestanden controleerde verboden paden vóór het decoderen van het adres, waardoor procentcodering van tekens de bescherming van het technische deel van de interface en het verbod op interne bestanden omzeilde.
- **Wie het kon misbruiken en het gevolg.** Een anonieme bezoeker kon de code van het beheerdeel van de interface ophalen en, bij een bepaalde bouw, interne bestanden; gegevens van gebruikers kwamen hierdoor niet vrij.
- **Wat is veranderd.** Het pad wordt nu aan het begin één keer gedecodeerd en genormaliseerd, en alle controles werken op dat genormaliseerde pad.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### http-rand-05 · Limieten werden per volledig IPv6-adres geteld

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Verzoeklimieten en aanmeldblokkeringen waren gebonden aan het volledige IPv6-adres, terwijl één abonnee doorgaans een heel bereik van zulke adressen heeft.
- **Wie het kon misbruiken en het gevolg.** Door binnen het eigen bereik van adres te wisselen, omzeilde een aanvaller de rem op het raden van wachtwoorden en andere limieten voor anonieme verzoeken.
- **Wat is veranderd.** Voor IPv6 tellen grenzen en blokkades nu per netwerkprefix /64. Een aparte teller van mislukkingen per account is bewust niet toegevoegd: daarmee zou iedereen de eigenaar het aanmelden kunnen blokkeren.
- **Test:** [`sec-002-g10h-20261112.test.ts`](../../tests/eenheid/sec-002-g10h-20261112.test.ts)

#### http-rand-06 · Grote inhoud van anonieme verzoeken werd vóór elke controle in het geheugen gebufferd

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De server nam de inhoud van een verzoek tot 12 MB in het geheugen op nog voordat route en rechten waren bepaald, zonder grens aan het aantal gelijktijdige verzoeken.
- **Wie het kon misbruiken en het gevolg.** Een anonieme aanvaller kon het servergeheugen uitputten en het proces laten omvallen, en op een thuisserver ook naburige diensten raken.
- **Wat is veranderd.** Te grote verzoeken worden geweigerd voordat de inhoud wordt gelezen, de groottelimiet hangt af van de route (klein voor anonieme routes), en het aantal gelijktijdige grote verzoeken is begrensd.
- **Dezelfde grondoorzaak:** keten-config-05
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### http-rand-07 · Paden buiten de /api-tak hadden geen limiet

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De gezondheidscontrole van de server en de ingangen voor stroomverbindingen deden bij elk anoniem verzoek een databasevraag, zonder enige limiet.
- **Wie het kon misbruiken en het gevolg.** Een stroom anonieme verzoeken kon de databaseverbindingen bezetten die nodig zijn voor aanmelden en gewoon gebruik, en de site voor iedereen vertragen.
- **Wat is veranderd.** Deze paden hebben een limiet gekregen, en het resultaat van de gezondheidscontrole wordt enkele seconden bewaard.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### http-rand-08 · De gebeurtenissenstroom voor bevestigingen sloot niet na afmelden of intrekken van de sessie

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een geopende stroom met ‘Bent u dit?’-gebeurtenissen controleerde de sessie alleen bij het openen en had geen maximale levensduur.
- **Wie het kon misbruiken en het gevolg.** Wie de stroom met een gestolen sessie had geopend, kreeg ook na ‘overal afmelden’ gegevens over handelingen van de persoon (naam van de handeling, dienst, tijd); handelen namens die persoon kon via de stroom niet.
- **Wat is veranderd.** De stroom controleert de sessie nu regelmatig opnieuw, sluit bij afmelden of intrekken en heeft een maximale levensduur.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### http-rand-09 · Een technische kop met de verwerkingstijd verried of een account bestaat

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Antwoorden van aanmeldroutes op anonieme verzoeken bevatten een kop met de exacte verwerkingstijd, en die tijd verschilde voor bestaande en niet-bestaande adressen.
- **Wie het kon misbruiken en het gevolg.** Een buitenstaander kon nagaan of een bepaald adres geregistreerd was; het wachtwoord zelf kwam zo niet vrij.
- **Wat is veranderd.** De kop met de verwerkingstijd wordt niet meer toegevoegd aan aanmeldantwoorden en weigeringen, en de antwoordtijd voor een onbekend adres is gelijkgetrokken.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

### Geheimen

#### geheimen-01 · ‘Mijn gegevens opnieuw versleutelen’ kon een deel van de gegevens met een onbruikbare sleutel versleutelen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Als de gebruiker zich tijdens een lange herversleuteling afmeldde of de kluis vergrendelde, werd de werksleutel in het geheugen gewist terwijl de bewerking met die gewiste sleutel doorliep.
- **Wie het kon misbruiken en het gevolg.** Een deel van de geheimen van de gebruiker (tokens van koppelingen, wachtwoorden van postvakken en dergelijke) kon onherstelbaar verloren gaan, en die gegevens bleken met een bekende sleutel versleuteld.
- **Wat is veranderd.** Herversleutelen werkt met een eigen kopie van de sleutel, controleert vóór elke stap of de kluis nog open is en stopt anders zonder de markering «uitgevoerd».
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### geheimen-02 · Het uitgeven van een nieuwe herstelcode kon de hele site stilleggen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het aanmaken van een nieuwe herstelcode voerde een zware sleutelberekening synchroon uit in de hoofddraad van de server en kende geen limiet.
- **Wie het kon misbruiken en het gevolg.** Elke goedgekeurde gebruiker kon de site met veel verzoeken voor iedereen onbereikbaar maken zolang die verzoeken liepen.
- **Wat is veranderd.** De berekening is uit de hoofddraad naar de achtergrond verplaatst, en het uitgeven van een nieuwe code is begrensd en gebonden aan een verse sterke bevestiging.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### geheimen-03 · Een SSH-certificaat voor toegang tot de server werd na een gewone bevestiging uitgegeven

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Voor het uitgeven van een kortlopend SSH-certificaat volstond een gewone bevestiging (opnieuw aanmelden via Google), en één bevestiging stond meerdere uitgiften toe; naburige functies voor toegang op afstand vereisten een passkey.
- **Wie het kon misbruiken en het gevolg.** Wie het Google-account of de sessie van de eigenaar in handen kreeg, kon bij een ingeschakelde functie zonder passkey toegang tot de opdrachtregel van de server krijgen.
- **Wat is veranderd.** Het uitgeven en beheren van SSH-certificaten vereist nu een sterke bevestiging, en elke uitgifte verbruikt haar eigen bevestiging.
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### geheimen-04 · Een storing op een ongelukkig moment kon de sleutelkluis van een gebruiker voorgoed afsluiten

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het inschakelen van de sleutelkluis was niet atomair, en de eenmalige herstelcode werd vervangen voordat de gebruiker de nieuwe had gezien; een manier om te herstellen bestond niet.
- **Wie het kon misbruiken en het gevolg.** Een netwerkstoring of herstart van de server precies tijdens het inschakelen of herstellen kon de gebruiker onherroepelijk de toegang tot zijn versleutelde gegevens ontnemen.
- **Wat is veranderd.** Het inschakelen gebeurt in één transactie, en de oude herstelcode blijft geldig totdat de gebruiker bevestigt dat de nieuwe is bewaard.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### geheimen-05 · Omhulsels van de gegevenssleutel werden niet verwijderd voor ingetrokken koppelingen en verwijderde passkeys

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Na het intrekken of verlopen van een AI-koppeling of het verwijderen van een passkey bleef de bijbehorende versleutelde kopie van de gegevenssleutel in de database staan, hoewel het systeem beloofde die te verwijderen.
- **Wie het kon misbruiken en het gevolg.** Een sterke aanvaller met een kopie van de database, het servergeheim en een oud token van een ingetrokken koppeling kon in theorie de gegevens van de gebruiker ontsleutelen.
- **Wat is veranderd.** Sleutelkopieën van ingetrokken en verlopen koppelingen en van verwijderde passkeys worden nu direct verwijderd en bovendien periodiek opgeruimd.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### geheimen-06 · Enkele ontsleutelplekken accepteerden een ingekort echtheidskenmerk

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Vier plekken waar AES-GCM wordt ontsleuteld, controleerden de lengte van het echtheidskenmerk en van de initialisatievector niet; eerder was dit maar in één module hersteld.
- **Wie het kon misbruiken en het gevolg.** Dit verzwakte de bescherming tegen het vervalsen van versleutelde gegevens voor een aanvaller die al in de database kan schrijven; op zichzelf is het niet te misbruiken.
- **Wat is veranderd.** Alle ontsleutelplekken eisen nu de volledige lengte van het echtheidskenmerk en de juiste lengte van de initialisatievector.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### geheimen-08 · De geheimenscripts controleerden de bestandsrechten niet en leverden een kapot register op

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het script dat geheimen aanmaakt, schreef nieuwe sleutels bij in het geheimenbestand zonder te controleren of de rechten op dat bestand te ruim waren; het registerscript maakte een kapotte tabel.
- **Wie het kon misbruiken en het gevolg.** Als het geheimenbestand ooit met te ruime rechten was teruggezet, kon een andere lokale gebruiker van de server het lezen, en de eigenaar kon de vingerafdrukken van sleutels moeilijk vergelijken.
- **Wat is veranderd.** Vóór het toevoegen van sleutels beperkt het script te ruime rechten op het geheimenbestand met een waarschuwing en maakt root eigenaar; het logboek heeft afgesloten rechten en het register maakt weer een juiste tabel en telling.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

### AI-agenten en MCP

#### ai-mcp-01 · Een intern argument liet een AI-client een hulpmiddel aanroepen buiten de toestemmingscontroles om

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Bij de oude manier van AI-koppelen vertrouwde de server op een intern argument dat de client zelf meestuurde en schakelde daarmee, ná de controles, door naar een ander intern hulpmiddel.
- **Wie het kon misbruiken en het gevolg.** Een gekoppelde AI (ook onder invloed van kwaadaardige tekst uit een bericht of pagina) kon hulpmiddelen aanroepen die de gebruiker of de eigenaar van de site had uitgezet, en die aanroepen kwamen niet onder hun echte naam in het logboek.
- **Wat is veranderd.** De server haalt het doel van een aanroep niet meer uit de argumenten van de client; aliassen worden alleen via de eigen lijst van de server herleid en alle toestemmingscontroles gelden voor het werkelijke hulpmiddel.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### ai-mcp-02 · De regel ‘PowerShell altijd met bevestiging’ was te omzeilen met een andere schrijfwijze van de programmanaam

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De server en de agent op de computer herkenden PowerShell verschillend aan de programmanaam: varianten met een andere extensie zag de server niet als PowerShell, de agent wel.
- **Wie het kon misbruiken en het gevolg.** Als de gebruiker PowerShell op het apparaat had ingeschakeld en de AI een blijvende toestemming voor opdrachten had gegeven, kon de AI willekeurige PowerShell uitvoeren zonder de afzonderlijke bevestiging waarop de gebruiker rekende.
- **Wat is veranderd.** De programmanaam wordt nu op de server en in de agent op dezelfde manier genormaliseerd, en de agent accepteert voor PowerShell alleen de exacte bekende namen.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### ai-mcp-03 · Eén ongeldig bericht van een gekoppelde agent legde de hele site stil

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De berichtverwerker voor apparaatagenten ving de fout bij een bericht met een ongeldige identificatie niet op, en de onafgehandelde fout beëindigde het serverproces.
- **Wie het kon misbruiken en het gevolg.** Elke gebruiker met een gekoppeld apparaat kon de site telkens opnieuw voor iedereen stilleggen: terminals en koppelingen vielen weg en de toestand in het geheugen ging verloren.
- **Wat is veranderd.** De verwerker controleert de vorm van het bericht en vangt fouten op, en de server heeft een algemene afhandeling voor onverwachte fouten die ze vastlegt zonder dat het proces stopt.
- **Dezelfde grondoorzaak:** keten-config-03, extensie-01, http-rand-03
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### ai-mcp-04 · Een storing bij een externe MCP-server kon het siteproces laten stoppen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** In de client voor externe MCP-servers (het oude HTTP+SSE-transport) bleef na een mislukte verzending een wachttimer achter die later een onafgehandelde fout veroorzaakte.
- **Wie het kon misbruiken en het gevolg.** Een defecte of kwaadwillende externe server van de toegestane lijst kon de site telkens opnieuw voor alle gebruikers stilleggen.
- **Wat is veranderd.** De wachttimer wordt nu bij elke verzendfout opgeruimd, en onverwachte fouten worden opgevangen door de algemene foutafhandeling van de server.
- **Test:** [`mcp-klant-stabiliteit-20261112.test.ts`](../../tests/eenheid/mcp-klant-stabiliteit-20261112.test.ts)

#### ai-mcp-05 · Een agent ‘voor de hele site’ uitschakelen werkte niet voor bestaande koppelingen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Als de eigenaar van de site een AI-agent of een koppelmethode voor iedereen uitzette, werd dat alleen bij een nieuwe koppeling gecontroleerd; bestaande koppelingen bleven werken.
- **Wie het kon misbruiken en het gevolg.** Een AI-client die de eigenaar ongewenst of gecompromitteerd achtte, hield toegang binnen de al verleende toestemming, terwijl de interface het tegendeel beweerde.
- **Wat is veranderd.** Of de agent en de methode aanstaan, wordt nu bij elke aanroep en bij elke lijst van hulpmiddelen gecontroleerd; weigeringen komen in het logboek.
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### ai-mcp-06 · Een technisch agenttoken bleef werken nadat het technische profiel was uitgezet

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een van de routes voor AI accepteerde een technisch agenttoken zonder te controleren of het technische profiel van de eigenaar op dat moment actief was en of de dienst ‘AI-koppelingen’ aanstond.
- **Wie het kon misbruiken en het gevolg.** Een AI of script met een eerder uitgegeven technisch token hield toegang tot technische gegevens van de server nadat de eigenaar de technische modus had uitgezet.
- **Wat is veranderd.** De route controleert nu bij elke aanroep de actuele staat van het technische profiel en de dienst, en weigert als de technische kant niet actief is.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### ai-mcp-07 · Een privétoken van de eigenaar werd geaccepteerd door de deur van de technische ruimte

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De tokencontrole voor het koppelen van AI aan de server maakte geen onderscheid tussen privé- en technische tokens, waardoor een privétoken van de eigenaar technische hulpmiddelen opende.
- **Wie het kon misbruiken en het gevolg.** De privé-AI van de eigenaar, of wie dat token onderschepte, kreeg technische toegang tot de server die een privékoppeling nooit hoort te hebben.
- **Wat is veranderd.** De deur van de server accepteert alleen technische tokens en alleen bij een actief technisch profiel; het intrekken van een token werkt nu sneller door.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### ai-mcp-08 · Een gebundeld AI-verzoek omzeilde de limiet op het aantal aanroepen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Eén verzoek van een AI-client kon een onbeperkt aantal aanroepen van hulpmiddelen bevatten, terwijl de limiet het als één aanroep telde.
- **Wie het kon misbruiken en het gevolg.** Een gekoppelde client of de houder van een gestolen token kon met één verzoek de database en het geheugen van de server overbelasten en de quota van externe diensten van het account opmaken.
- **Wat is veranderd.** De omvang van een bundel is begrensd, elke aanroep in de bundel telt mee voor de limiet en de aanroepen worden met weinig gelijktijdigheid uitgevoerd.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### ai-mcp-09 · De hulpmiddelen voor agentcoördinatie blokkeerden de hele site

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De hulpmiddelen voor agentcoördinatie voerden externe opdrachten synchroon uit; zolang die liepen, behandelde de server geen enkel verzoek.
- **Wie het kon misbruiken en het gevolg.** Veel aanroepen van deze hulpmiddelen (een AI met technisch recht of een automatisch verversende pagina) maakten de site seconden tot minuten onbereikbaar voor iedereen.
- **Wat is veranderd.** Alle coördinatieaanroepen, ook het afronden van een ingeleverd pakket, gebeuren asynchroon met tijdslimiet en wachtrij, het controleresultaat wordt gecachet en de aanroepfrequentie is begrensd.
- **Test:** [`sec-002-g05-20261112.test.ts`](../../tests/eenheid/sec-002-g05-20261112.test.ts)

#### ai-mcp-10 · Het registreren van nieuwe AI-clients kon voor iedereen worden geblokkeerd

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het aantal geregistreerde OAuth-clients had één gezamenlijk plafond en ongebruikte registraties werden pas na een dag opgeruimd; registreren kon iedereen, zonder aanmelden.
- **Wie het kon misbruiken en het gevolg.** Een buitenstaander kon het plafond vullen en zo alle gebruikers beletten een nieuwe AI-client te koppelen; bestaande koppelingen bleven werken.
- **Wat is veranderd.** Ongebruikte registraties worden nu veel eerder verdrongen en opgeruimd, en het aantal registraties per adres is begrensd.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### ai-mcp-11 · De looptijd van een AI-koppeling ‘tot 14 dagen’ liep in werkelijkheid nooit af

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De in het toestemmingsvenster gekozen uiterste looptijd begon na elke tokenvernieuwing opnieuw, zodat een koppeling die in gebruik bleef nooit eindigde.
- **Wie het kon misbruiken en het gevolg.** De gebruiker dacht dat de toegang van de AI na de gekozen tijd vanzelf zou verdwijnen, terwijl ‘vergeten’ koppelingen onbeperkt bleven bestaan.
- **Wat is veranderd.** De uiterste looptijd telt nu vanaf het moment van toestemming en wordt niet verlengd door tokenvernieuwing; daarna is nieuwe toestemming nodig.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### ai-mcp-12 · ‘Stop’ annuleerde de AI-verzoeken die op bevestiging wachtten niet

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De noodstop voor AI haalde verzoeken die al op een beslissing van de gebruiker wachtten niet uit de wachtrij.
- **Wie het kon misbruiken en het gevolg.** Een gebruiker die dacht dat alles was gestopt, kon zo'n verzoek later alsnog bevestigen, waarna de handeling na de noodstop werd uitgevoerd.
- **Wat is veranderd.** ‘Stop’ en het blokkeren van een gebruiker wijzen nu alle wachtende AI-verzoeken af, en vóór een goedkeuring wordt gecontroleerd of het verzoek nog geldig is.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### ai-mcp-13 · De AI-schakelaars gingen ‘open’ bij een leesfout in de database

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Als de instellingen van de AI-schakelaars (het plafond van de site en de persoonlijke schakelaars) niet uit de database konden worden gelezen, ging de server ervan uit dat alles aanstond.
- **Wie het kon misbruiken en het gevolg.** Tijdens een korte storing of overbelasting kon een AI een mogelijkheid gebruiken die de eigenaar of de gebruiker had uitgezet; de overige beschermingslagen bleven wel werken.
- **Wat is veranderd.** Bij een leesfout weigert de server nu of gebruikt hij de laatste recente bewaarde stand; ‘alles aan’ geldt alleen nog voor een tabel die nog niet bestaat.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

### Terminal en uitrol

#### server-uitrol-01 · De voorcontrole van een updatepakket kon serverbestanden buiten het archief lezen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De controle van een updatepakket las de inhoudslijst van het archief zo in dat sommige regels stil werden overgeslagen, en las daarna de vaste pakketbestanden ook als dat symbolische koppelingen naar serverbestanden waren.
- **Wie het kon misbruiken en het gevolg.** Iedereen met alleen het recht «update voorbereiden» (ook een AI-agent die door kwaadaardige tekst werd gestuurd) kon in de pakketbeschrijving de inhoud van serverbestanden krijgen, inclusief geheimen van de dienst en bestanden van andere gebruikers.
- **Wat is veranderd.** Een onleesbare regel in de inhoudslijst blokkeert nu het pakket; na het uitpakken en vóór de eerste leesactie wordt een pakket met koppelingen, FIFO's of apparaten geweigerd; alle leesacties blijven binnen de pakketmap en alleen voor gewone bestanden.
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### server-uitrol-02 · Root schreef het releasearchief in een map die de applicatie beheert

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Bij het bewaren van het releasearchief schreef root bestanden en wijzigde rechten in een map waarin de applicatie zelf kan schrijven, en volgde daarbij symbolische koppelingen.
- **Wie het kon misbruiken en het gevolg.** Code die als de applicatie draait (bijvoorbeeld via een fout in het webdeel of een kwaadaardige afhankelijkheid) kon root systeembestanden laten overschrijven of leesbaar maken en zo rootrechten krijgen.
- **Wat is veranderd.** Archief en controlesom worden in een eigen afgesloten map van root voorbereid en alleen via hernoemen, dat geen koppelingen volgt, naar de gedeelde map gezet; een map die een koppeling is wordt geweigerd, en bestanden uit applicatiemappen leest root alleen zonder koppelingen en met een groottegrens.
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### server-uitrol-03 · De tunnel van het extern bureaublad nam vóór aanmelding onbegrensd gegevens aan

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De WebSocket-tunnel van het extern bureaublad verzamelde al vóór de authenticatie onbegrensd gegevens en verwerkte telkens de hele buffer opnieuw vanaf het begin.
- **Wie het kon misbruiken en het gevolg.** Een anonieme bezoeker kon met enkele verbindingen de processor en het geheugen van de server uitputten en de site voor iedereen onbereikbaar maken.
- **Wat is veranderd.** Vóór aanmelding gelden strikte grenzen voor omvang, aantal frames en instructies; zonder open sessie van de eigenaar wordt de verbinding geweigerd, het aantal niet-aangemelde verbindingen is begrensd en na het sluiten worden geen berichten meer verwerkt.
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### server-uitrol-04 · De migratieproef voerde willekeurige SQL uit met een gedeelde rol, zonder nieuwe bevestiging

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De proefuitvoering van databasemigraties voerde ingestuurde SQL uit met de gedeelde dienstrol voor migraties en vroeg geen verse bevestiging van de aanmelding.
- **Wie het kon misbruiken en het gevolg.** Wie de sessie van de eigenaar zonder diens passkey in handen had, kon instellingen of het wachtwoord van de dienstrol voor de hele databaseserver wijzigen, volgende uitrols breken of de schijf vullen.
- **Wat is veranderd.** De proef vereist een verse bevestiging en heeft een frequentiegrens; de SQL draait onder een eenmalige rol zonder bijzondere rechten in een tijdelijke database die na de proef wordt verwijderd, en vingerafdrukken van de SQL komen in het logboek.
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### server-uitrol-05 · Het bestand met databaserechten voor root kwam uit een map die de build kon wijzigen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Bij het installeren van een update voerde root het bestand met databaserechten uit vanuit de releasemap, waarin code van afhankelijkheden tijdens hun installatie kon schrijven.
- **Wie het kon misbruiken en het gevolg.** Een gecompromitteerde afhankelijkheid kon aan dat bestand opdrachten toevoegen die daarna met de rechten van de database-superuser werden uitgevoerd.
- **Wat is veranderd.** Na de build worden de mappen met dienstscripts en migraties verwijderd en uit de ongewijzigde bron hersteld, met afgesloten rechten en weigering bij elke koppeling; de build zelf is bovendien afgeschermd onder een eigen gebruiker.
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### server-uitrol-06 · Root ondertekende een SSH-certificaat voor de server zonder eigen controle van de passkey

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De SSH-certificaatdienst ondertekende als root elk verzoek dat de applicatie in haar inbox legde en controleerde alleen de vorm van het verzoek.
- **Wie het kon misbruiken en het gevolg.** Code die als de applicatie draait op een server met ingeschakelde SSH-functie kon zichzelf een certificaat geven en als beheerder op de server inloggen.
- **Wat is veranderd.** Root controleert vóór het ondertekenen zelf de passkeybevestiging van de eigenaar voor precies deze sleutel en deze rechten, aan de hand van een eigen sleutelbestand en een eenmalige uitdaging; zonder die bevestiging komt er geen certificaat.
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### server-uitrol-07 · De back-up toonde het wachtwoord van de systeemrol van de database in de proceslijst

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het back-upscript gaf de verbindingsregel van de database, inclusief het wachtwoord van de systeemrol, als argument aan programma's mee, en argumenten zijn voor alle lokale processen zichtbaar.
- **Wie het kon misbruiken en het gevolg.** Elk lokaal proces op de server (ook een agent die opdrachten mag uitvoeren) kon tijdens een back-up het wachtwoord leren van de rol die de rijbeveiliging omzeilt, en de gegevens van alle gebruikers lezen.
- **Wat is veranderd.** De verbindingsregel wordt omgezet in omgevingsvariabelen van het proces, en de back-upprogramma's starten zonder wachtwoord in de argumenten; een ongeldige regel wordt geweigerd zonder de waarde te tonen.
- **Test:** [`sec-002-g05-20261112.test.ts`](../../tests/eenheid/sec-002-g05-20261112.test.ts)

#### server-uitrol-08 · Een onderbroken uitrol op een ongelukkig moment liet een ongecontroleerde release en een onjuiste status achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Werd een uitrol onderbroken tijdens het omschakelen naar de nieuwe release, dan bleef die actief zonder gezondheidscontrole of terugdraaien, terwijl de status meldde dat de vorige actief was.
- **Wie het kon misbruiken en het gevolg.** Een defecte release kon stil op de site blijven en de eigenaar zocht de oorzaak op de verkeerde plek; daar is geen aanvaller voor nodig, een storing of time-out volstaat.
- **Wat is veranderd.** Een onderbreking in dit venster zet de vorige release terug, en de meldingen zeggen eerlijk welke release actief is en of die gecontroleerd is.
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### server-uitrol-09 · De opdrachtterminal zag sommige schrijvende opdrachten als «lezen»

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Enkele opdrachtregelparameters die bestanden schrijven of instellingen wijzigen, werden door de terminal als veilig lezen ingedeeld — zonder bevestiging en zelfs in een «alleen-lezen»-map.
- **Wie het kon misbruiken en het gevolg.** De eigenaar of een beheerder kon een regel uitvoeren die als veilig bekijken werd voorgesteld, maar in werkelijkheid bestanden of instellingen wijzigde zonder bevestigingsvenster; de rechtengrens van het systeem bleef wel gelden.
- **Wat is veranderd.** Zulke parameters (ook verkort geschreven) gelden nu als wijzigend, gelijk op de site en in de agent, en voor sommige programma's is alleen een expliciete lijst veilige acties toegestaan.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### server-uitrol-10 · Herstel uit een archief installeerde Node.js en cloudflared zonder controlesom

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het script dat een server uit een archief herstelt, downloadde Node.js en de nieuwste cloudflared zonder controlesom en zette opdrachten samen met paden in één regel.
- **Wie het kon misbruiken en het gevolg.** Wie de download op het moment van herstel kon vervangen, kreeg code-uitvoering als root op een server waar net alle geheimen waren ontsleuteld; een ongebruikelijk pad kon opdrachten breken.
- **Wat is veranderd.** Node.js wordt vóór het uitpakken aan een controlesom getoetst, cloudflared is vastgezet op een bepaalde versie met controlesommen voor beide architecturen, en paden worden als aparte argumenten doorgegeven in plaats van binnen de opdrachtregel.
- **Test:** [`sec-002-g06-20261112.test.ts`](../../tests/eenheid/sec-002-g06-20261112.test.ts)

#### server-uitrol-11 · Hulpdiensten van root draaiden zonder systeembeperkingen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Enkele hulpprocessen die als root draaien en alleen status lezen of in een statusmap schrijven, hadden geen systemd-beperkingen voor schrijven in het bestandssysteem en het verhogen van rechten.
- **Wie het kon misbruiken en het gevolg.** Dit is verdediging in de diepte: elke fout in deze scripts zou meteen schrijven als root op elke plek van het systeem opleveren.
- **Wat is veranderd.** Deze diensten hebben nu systemd-beperkingen: geen verhoging van rechten, een alleen-lezen bestandssysteem met een lijst toegestane mappen en andere gangbare beperkingen.
- **Test:** [`sec-002-g07-20261112.test.ts`](../../tests/eenheid/sec-002-g07-20261112.test.ts)

### E-mail

#### aanv-gat-b-01 · AI-vertaling of -samenvatting van een e-mail kon de server stilleggen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De tekst van een e-mail voor AI-vertaling of -samenvatting ging zonder lengtegrens door reguliere expressies met kwadratische rekentijd in de hoofdthread.
- **Wie het kon misbruiken en het gevolg.** Elke goedgekeurde gebruiker kon met één verzoek de site minuten tot uren voor iedereen onbereikbaar maken.
- **Wat is veranderd.** Invoervelden worden vóór verwerking ingekort, het splitsen in zinnen en alinea's is lineair herschreven, en de expressies hebben geen geneste herhalingen meer.
- **Dezelfde grondoorzaak:** aanv-ronde1-03
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### aanv-gat-c-01 · Zoeken in de e-mail kon de server stilleggen via een speciaal opgebouwd binnenkomend bericht

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Bij zoeken haalde de rangschikking adressen en domeinen uit de tekst van elk bericht met expressies met kwadratische rekentijd, en de lengte van de zoekvraag was niet begrensd.
- **Wie het kon misbruiken en het gevolg.** Een buitenstaander die het e-mailadres kende, kon een bericht sturen waardoor de site voor iedereen bleef hangen zodra de gebruiker in de e-mail zocht.
- **Wat is veranderd.** Adressen en domeinen worden lineair en begrensd opgehaald, de vage vergelijking is in omvang begrensd, en zoeken geeft voorrang aan andere verzoeken en heeft een tijdsbudget.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### post-01 · Eén bericht kon de hele server stilleggen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Het omzetten van het HTML-deel van een binnenkomend bericht naar tekst had een kwadratische rekentijd en begrensde de omvang van de inhoud niet.
- **Wie het kon misbruiken en het gevolg.** Iedereen op internet, zonder account, kon een gebruiker een bericht sturen waarvan het lezen door de server de site voor iedereen blokkeerde.
- **Wat is veranderd.** De inhoud van het bericht wordt vóór verwerking ingekort, en het omzetten van HTML naar tekst gebeurt in één lineaire doorloop.
- **Dezelfde grondoorzaak:** keten-config-02
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### aanv-ronde1-02 · Het afzenderadres werd bepaald door de weergavenaam in de kop van het bericht

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het afzenderadres werd uit de eerste punthaken van de kop «Van» gehaald, en die kunnen ook in de weergavenaam staan in plaats van het echte adres.
- **Wie het kon misbruiken en het gevolg.** Een externe afzender kon zich voordoen als een belangrijk contact: «afzender blokkeren» blokkeerde het echte adres, en toestemmingen voor afbeeldingen en context werden aan de verkeerde persoon gekoppeld.
- **Wat is veranderd.** Het adres komt uit de laatste punthaken, met een lengtegrens, via dezelfde functie op server en cliënt, op alle plekken waar de afzender wordt ontleed.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### aanv-ronde1-03 · AI-vertaling van e-mail: lange tekst en onderwerp gingen door kwadratische expressies

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Dezelfde oorzaak als aanv-gat-b-01: tekst en onderwerp van een e-mail voor AI-vertaling werden zonder lengtegrens door expressies met kwadratische rekentijd verwerkt.
- **Wie het kon misbruiken en het gevolg.** Een e-mailgebruiker met een privé AI-koppeling kon met één verzoek de server voor iedereen stilleggen.
- **Wat is veranderd.** Zie aanv-gat-b-01: velden begrensd vóór verwerking en lineaire algoritmen.
- **Dezelfde grondoorzaak:** aanv-gat-b-01
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### post-02 · Het opschonen van uitgaande HTML en het ontleden van adressen blokkeerden de server

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het opschonen van HTML van een bericht dat de gebruiker bewaart of verstuurt, en het ontleden van een lange adreslijst gebeurden vóór het inkorten en hadden een kwadratische rekentijd.
- **Wie het kon misbruiken en het gevolg.** Elke goedgekeurde gebruiker kon de server met één verzoek seconden, minuten of uren voor iedereen stilleggen.
- **Wat is veranderd.** De invoer wordt eerst tot de toegestane omvang ingekort, en het opschonen van HTML en het ontleden van adressen zijn lineair herschreven.
- **Dezelfde grondoorzaak:** keten-config-04
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### post-03 · Het paneel met afzendercontrole vertrouwde op vervalste berichtkoppen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het paneel ‘Signed-by / SPF / DKIM / DMARC’ bij een geopend bericht nam de controleresultaten uit een willekeurige kop, ook uit een kop die de afzender zelf had toegevoegd.
- **Wie het kon misbruiken en het gevolg.** Een vervalst bericht kon worden getoond alsof de echtheid van de afzender was bevestigd.
- **Wat is veranderd.** De resultaten komen alleen uit de eerste kop die door de vertrouwde ontvangende mailserver is toegevoegd; al het andere wordt genegeerd.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### post-04 · Een gebruiker met alleen leesrecht kon berichten versturen en doorsturen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Wijzigende postroutes (beantwoorden, doorsturen, filters, afmelden voor nieuwsbrieven) werden niet als schrijfactie herkend en controleerden het schrijfrecht niet.
- **Wie het kon misbruiken en het gevolg.** Een account met ‘alleen bekijken’ kon vanuit het postvak berichten versturen, de inhoud naar willekeurige adressen doorsturen en blijvende filters aanmaken.
- **Wat is veranderd.** Elke wijzigende postroute eist nu uitdrukkelijk schrijfrecht, en de lijst met leesroutes is met een test vastgelegd.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### post-05 · ‘Voorbeeld’ van een bericht laadde externe afbeeldingen direct

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het voorbeeldvenster hield geen rekening met de standaardinstelling ‘vragen voordat externe afbeeldingen worden getoond’ en laadde ze meteen.
- **Wie het kon misbruiken en het gevolg.** De afzender kwam te weten dat het adres in gebruik is en wanneer het bericht werd geopend, terwijl de gebruiker daar bij gewoon lezen voor wordt gewaarschuwd.
- **Wat is veranderd.** Het voorbeeld volgt dezelfde instelling als het lezen en toont de balk over verborgen afbeeldingen.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### post-06 · Het automatisch zoeken naar een afzenderlogo maakte het volgen van de ontvanger mogelijk

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Om een logo te tonen benaderde de server zelf het domein uit het afzenderadres, ook een uniek subdomein, nog voordat het bericht was geopend.
- **Wie het kon misbruiken en het gevolg.** De afzender kon te weten komen dat het adres in gebruik is, wanneer de berichtenlijst werd getoond en vanaf welke server de post wordt gelezen, ongeacht de instelling voor externe afbeeldingen.
- **Wat is veranderd.** De server benadert geen subdomein meer dat de afzender kiest, alleen het organisatiedomein, en logo's van onbekende afzenders staan standaard uit (ze kunnen met een risicowaarschuwing in de instellingen worden ingeschakeld).
- **Test:** [`sec-002-g10h-20261112.test.ts`](../../tests/eenheid/sec-002-g10h-20261112.test.ts)

#### aanv-gat-c-04 · De wachtrij voor statuswijzigingen van e-mails liep vast na 500 regels

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De achtergrondtaak die mislukte statuswijzigingen in Gmail herhaalt (gelezen, prullenbak, spam, archief), zag alleen de 500 oudste regels, en regels werden nooit verwijderd.
- **Wie het kon misbruiken en het gevolg.** Er is geen aanvaller: een «verwijderd» phishingbericht kon in de inbox van Gmail blijven terwijl de actie op de site uitgevoerd leek, en de tabel groeide onbeperkt.
- **Wat is veranderd.** De taak kiest regels op wachtrijstatus, zet verlopen regels terug, en afgeronde regels worden opgeruimd.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### post-07 · Het filter op externe adressen in de opmaak van een bericht was te omzeilen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Bij het opschonen van de opmaak werd in de ruwe stijltekst naar verwijzingen naar externe bronnen gezocht, wat met een andere schrijfwijze te omzeilen was; externe verzoeken werden alleen nog door het inhoudsbeveiligingsbeleid tegengehouden.
- **Wie het kon misbruiken en het gevolg.** Bij een versoepeling van dat beleid kon de browser van de ontvanger een bron van de afzender rechtstreeks laden, buiten de instelling ‘vragen’ om.
- **Wat is veranderd.** De opmaak wordt gecontroleerd nadat de browser haar heeft ontleed, en eigenschappen met verwijzingen naar externe bronnen worden verwijderd.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### post-08 · Het kenmerk ‘geverifieerde afzender’ was te verkrijgen met een listige schrijfwijze van een kop

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Bij het ontleden van de kop met de uitkomsten van de echtheidscontrole werd geen rekening gehouden met commentaar en aanhalingstekens, en de herkomst van de bovenste kop werd niet gecontroleerd.
- **Wie het kon misbruiken en het gevolg.** Een phishingbericht kon het groene kenmerk van een geverifieerde afzender krijgen.
- **Wat is veranderd.** Commentaar en tekst tussen aanhalingstekens worden vóór het ontleden verwijderd, waarden worden alleen in strikte vorm aanvaard, en tegenstrijdige uitkomsten gelden als onbetrouwbaar.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### post-09 · De AI-assistent voor post kreeg de afzendernaam als vertrouwde tekst

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De afzendernaam en de datum van een bericht stonden in de opdracht aan het model buiten de kenmerken voor niet-vertrouwde inhoud.
- **Wie het kon misbruiken en het gevolg.** Een afzender kon in zijn naam aanwijzingen zetten die het model bij een samenvatting of concept eerder zou opvolgen; de gebruiker ziet het concept vóór verzending.
- **Wat is veranderd.** De berichtkoppen staan nu binnen het blok met niet-vertrouwde gegevens, en regeleinden erin worden verwijderd.
- **Test:** [`ai-mail-assistent.test.ts`](../../tests/eenheid/ai-mail-assistent.test.ts)

#### post-10 · Uitgestelde berichten werden ook na het blokkeren van een gebruiker verstuurd

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De wachtrij voor uitgesteld versturen controleerde vóór verzending niet of de gebruiker nog was goedgekeurd en schrijfrecht voor post had.
- **Wie het kon misbruiken en het gevolg.** Vooraf ingeplande verzendingen konden nog lang doorgaan nadat de eigenaar de gebruiker had geblokkeerd of het schrijfrecht had ingetrokken.
- **Wat is veranderd.** Vóór elke verzending worden status en recht van de gebruiker gecontroleerd, en bij een blokkering worden ingeplande berichten geannuleerd.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### post-11 · ‘Afmelden voor nieuwsbrief’ opende een adres uit het bericht zonder het te tonen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De afmeldknop ging naar een adres dat de afzender van het bericht had opgegeven, terwijl de gebruiker niet zag waar de koppeling heen leidde.
- **Wie het kon misbruiken en het gevolg.** Een phishingbericht kon iemand via het vertrouwde onderdeel voor abonnementenbeheer naar een nagemaakte aanmeldpagina leiden.
- **Wat is veranderd.** Vóór het openen wordt het doeldomein getoond, met een waarschuwing als het niet overeenkomt met het domein van de afzender.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

### Cloudopslag

#### wolk-01 · Eén importverzoek voor notities kon de hele server stilleggen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Het inlezen en opslaan van notities gebruikte reguliere expressies waarvan de rekentijd op speciaal opgebouwde tekst kubisch of kwadratisch toenam.
- **Wie het kon misbruiken en het gevolg.** Elk goedgekeurd account, zelfs met de rol «alleen bekijken», kon met één verzoek de site lange tijd voor iedereen onbereikbaar maken.
- **Wat is veranderd.** De gevaarlijke expressies zijn vervangen door lineaire verwerking, de lengte van velden wordt vóór verwerking gecontroleerd, en zoeken in notities heeft grenzen voor woordlengte en uitvoeringstijd.
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### aanv-ronde1-04 · Een groot bestand openen in de cloud las het volledig in het geheugen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De oude actie «Openen» in de cloud en de fotocontrole lazen een bestand volledig in het geheugen, ongeacht de werkelijke grootte.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon met enkele gelijktijdige verzoeken op grote bestanden het servergeheugen uitputten en de site stilleggen.
- **Wat is veranderd.** Lezen heeft een groottegrens en controleert eerst de werkelijke grootte; een te groot bestand wordt niet geopend maar als download aangeboden, en de fotocontrole berekent de som in delen.
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### aanv-ronde1-05 · «Ordenen» in de fotodienst blokkeerde de server bij grote bibliotheken

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het zoeken naar gelijkende foto's vergeleek alle paren foto's met elkaar en voerde per paar reguliere expressies uit.
- **Wie het kon misbruiken en het gevolg.** Een aanroep op een bibliotheek van enkele duizenden foto's bevroor de server voor iedereen ongeveer twintig seconden, en dat kon herhaald worden.
- **Wat is veranderd.** Alleen kandidaatparen uit banden van de vingerafdruk worden vergeleken, en de afstand wordt met bitbewerkingen berekend; het resultaat is hetzelfde, de tijd milliseconden.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-02 · De fotodienst begrensde uploadsessies en geheugengebruik niet

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het in delen uploaden van foto's had geen grens op het aantal sessies en het totale volume, delen konden de opgegeven grootte overschrijden, en een afgerond bestand werd volledig in het geheugen gelezen.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker die foto's mag uploaden, kon de schijf vullen of het servergeheugen uitputten en de site voor iedereen stilleggen.
- **Wat is veranderd.** Er gelden nu grenzen voor sessies en volume per persoon en in totaal, een controle van de vrije ruimte, een strikte volgorde van delen en afronden zonder het hele bestand in het geheugen te lezen.
- **Dezelfde grondoorzaak:** privacy-logboek-04
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-03 · De achtergrondverwerker van cloudoverdrachten erfde de rechten van de eerste gebruiker

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De achtergrondtimer voor bestandsoverdrachten startte in de context van het eerste verzoek na een herstart en erfde voor altijd de rechten, de ruimte en zelfs de kijkmodus van die gebruiker.
- **Wie het kon misbruiken en het gevolg.** Overdrachten van andere gebruikers konden nooit worden uitgevoerd, en acties werden in het logboek aan de verkeerde persoon toegeschreven.
- **Wat is veranderd.** De timer start buiten elk verzoek en voert elke stap uit in een eigen systeemcontext.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-04 · Eigen bestandsopslag had geen quotum en de ruimtecontrole negeerde lopende uploads

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De controle op vrije ruimte hield alleen rekening met de huidige upload en niet met al geopende uploads, en er was geen quotum per gebruiker.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde deelnemer met schrijfrecht in de cloud kon de serverschijf tot nul vullen, waarna uploads, de database en andere diensten faalden.
- **Wat is veranderd.** De ruimte wordt berekend met geopende sessies erbij, elk deel controleert de schijfreserve, er kan een quotum per gebruiker worden ingesteld en oude sessies worden volledig opgeruimd.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### aanv-ronde1-08 · Het overdragen van een technische cloudlade verloor grote bestanden en oudere versies

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Bij het overdragen van een technische cloudlade aan een nieuwe eigenaar werden grote bestanden en alle oudere versies niet meeverplaatst, terwijl hun records wel verhuisden.
- **Wie het kon misbruiken en het gevolg.** Er is geen aanvaller: bestanden werden onbereikbaar voor de nieuwe eigenaar en bleven in de map van de vorige achter.
- **Wat is veranderd.** Bestanden worden zonder in het geheugen te lezen verplaatst, met alle versies, en het bijwerken van records gebeurt in één transactie met terugdraaien bij een storing.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### aanv-ronde1-09 · Het opruimen van uploadsessies kon een net aangemaakte sessie wissen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het opruimen van uploadsessies in de nieuwe cloud, dat door elk gelijktijdig verzoek werd gestart, kon map en record wissen van een sessie die net werd aangemaakt.
- **Wie het kon misbruiken en het gevolg.** Uploads van anderen mislukten af en toe, en een deelnemer met schrijfrecht kon die kans bewust vergroten.
- **Wat is veranderd.** Een sessie wordt eerst geregistreerd, en het opruimen laat verse mappen zonder sessiebestand met rust.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-05 · Een uitgeschakelde nieuwe cloud verborg alleen de interface, niet de serverroutes

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De vlag voor de nieuwe cloud, standaard uit, verborg alleen de interface; de serverroutes werkten voor elke goedgekeurde gebruiker.
- **Wie het kon misbruiken en het gevolg.** Een gebruiker voor wie de eigenaar de nieuwe cloud niet had ingeschakeld, kon rechtstreeks grote bestanden uploaden en achtergrondoverdrachten starten waar de eigenaar niet op rekende.
- **Wat is veranderd.** De routes van de nieuwe cloud controleren de vlag nu op de server en antwoorden «niet gevonden» als die uit staat; een fout bij het lezen van de vlag geldt als uit.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-06 · Een bestand ophalen maakte gelijktijdige wijzigingen ongedaan

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Tijdens het lezen van een bestand werd het databaserecord volledig overschreven met een verouderde momentopname, waardoor gelijktijdige wijzigingen (prullenbak, hernoemen, nieuwe versie) verdwenen.
- **Wie het kon misbruiken en het gevolg.** Een bestand in de prullenbak kon «terugkomen» en een nieuwe versie kon verloren gaan; daar is geen aanvaller voor nodig.
- **Wat is veranderd.** Het bijwerken van het record is gedeeltelijk en atomair geworden: alleen de nodige velden veranderen, en velden voor eigenaar en ruimte kunnen zo niet worden gewijzigd.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-07 · Foto-import in de technische ruimte maakte een record in de persoonlijke ruimte

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een import uit Google Photos in de technische ruimte zette het bestand in de technische opslag, maar maakte het record ervan aan in de persoonlijke ruimte van dezelfde persoon.
- **Wie het kon misbruiken en het gevolg.** Namen, groottes en andere gegevens van technische bestanden verschenen in de persoonlijke cloud, zoekfunctie en fotobibliotheek, en via de fotodienst kon zelfs het bestand worden gelezen — tegen de scheiding van ruimtes in.
- **Wat is veranderd.** Het record wordt nu in dezelfde ruimte als het bestand aangemaakt, en een migratie verplaatst bestaande records en afgeleide rijen (foto's, taken, deellinks) naar de juiste ruimte.
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### wolk-08 · De rol «alleen bekijken» kon gegevens in de oude cloud wijzigen en Google koppelen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De schrijfbeveiliging raadde wijzigende routes aan de hand van woorden in het adres, waardoor enkele cloudroutes erbuiten vielen.
- **Wie het kon misbruiken en het gevolg.** Een account dat van de eigenaar alleen bekijkrechten had, kon eigen cloudrecords wijzigen, van Google-account wisselen en een koppeling met Google Drive starten.
- **Wat is veranderd.** Voor de cloud geldt een expliciete lijst leesroutes en al het andere vereist schrijfrecht nog vóór de verwerking; schrijffuncties controleren het recht ook zelf, en elke weigering laat een regel in het logboek achter.
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### wolk-09 · Het verbod op actieve bestandstypen in de cloud was te omzeilen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De controle op gevaarlijke inhoudstypen (HTML, SVG, XML) in de cloud was onvolledig, en een kopie uit Google Drive bewaarde elk type.
- **Wie het kon misbruiken en het gevolg.** Er was geen directe uitvoering, maar het verzwakte de bescherming tegen opgeslagen XSS op het hoofddomein als zo'n bestand ooit met zijn echte type zou worden geleverd.
- **Wat is veranderd.** Actieve en ongeldige typen worden geweigerd of als neutraal binair type bewaard, de XML-familie wordt als tekst geleverd, en dezelfde regel geldt voor oude records en kopieën uit Google Drive.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-10 · De nieuwe cloud toonde de cliënt de ruwe tekst van interne fouten

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De routes van de nieuwe cloud gaven de volledige tekst van interne fouten aan de browser terug, inclusief paden op de server en databasemeldingen.
- **Wie het kon misbruiken en het gevolg.** Een aangemelde gebruiker kon informatie verzamelen over de opslaglocaties en de opbouw van de database, als hulp voor verdere aanvallen.
- **Wat is veranderd.** Naar buiten gaan alleen een vaste foutcode en een incidentnummer; de volledige tekst komt alleen in het serverlogboek.
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### wolk-11 · Notities bekijken «als gebruiker» zonder actierecht eindigde altijd in een fout

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Bij meekijken als gebruiker in alleen-lezenmodus probeerde de notitielijst de prullenbak op te ruimen, en die poging bedierf de hele leestransactie.
- **Wie het kon misbruiken en het gevolg.** Er is hier geen aanvaller: de ondersteuning kon de notities niet zien hoewel de modus dat beloofde, en elke storing bij het opruimen legde de hele lijst plat.
- **Wat is veranderd.** In alleen-lezenmodus wordt de prullenbak niet opgeruimd, en elke storing bij het opruimen is zo afgeschermd dat het lezen niet breekt.
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

### Integraties

#### integraties-01 · Het ontleden van het logo van een afzenderdomein kon de server minuten stilleggen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Bij het ophalen van het logo van een afzenderdomein ontleedde de server vreemde SVG en HTML met patronen waarvan de rekentijd bij speciaal opgebouwde inhoud kwadratisch opliep.
- **Wie het kon misbruiken en het gevolg.** Een buitenstaander hoefde de gebruiker alleen een bericht vanaf een eigen domein te sturen om de site voor iedereen te laten vastlopen zodra de berichtenlijst werd geopend.
- **Wat is veranderd.** Het ontleden van vreemde SVG en HTML is herschreven zodat de tijd lineair blijft, en omvang en aantal verwerkte elementen zijn begrensd.
- **Test:** [`merk-bron-redos-20261112.test.ts`](../../tests/eenheid/merk-bron-redos-20261112.test.ts)

#### integraties-02 · Het antwoord van een vreemde CalDAV-server kon de server minuten tot uren stilleggen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Het ontleden van het antwoord van een CalDAV-agendaserver had een kwadratische rekentijd bij inhoud zonder sluitlabels.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon, door een eigen agendaserver met een speciaal antwoord te koppelen, de site voor iedereen onbereikbaar maken.
- **Wat is veranderd.** Het ontleden van het CalDAV-antwoord is herschreven tot één lineaire doorloop met grenzen aan het aantal elementen en een stop bij een niet-gesloten label.
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### integraties-03 · Een afwijkende statuscode van een externe server stopte het siteproces

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Hetzelfde gebrek in de gedeelde functie voor het ophalen van externe adressen als in bevinding http-rand-02, maar vanuit de integraties: agenda-abonnementen, CalDAV, externe MCP-servers en de controle van opslagdiensten.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon een abonnement op een eigen server toevoegen en zo herhaalde stilstand veroorzaken, omdat de planner het verzoek zelf bleef herhalen.
- **Wat is veranderd.** De ophaalfunctie wijst een ongeldige statuscode af als gewone fout, en de integraties tonen daarvoor een vaste foutcode.
- **Dezelfde grondoorzaak:** http-rand-02
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### integraties-04 · Aanmelden via Telegram: een ‘bekend apparaat’ werd herkend aan een na te maken browsernaam

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De kaart met het aanmeldverzoek in Telegram markeerde een apparaat als bekend op basis van alleen de naam van browser en systeem, die het verzoek zelf opgeeft. Dit speelt bij installaties met aanmelden via Telegram ingeschakeld.
- **Wie het kon misbruiken en het gevolg.** Een aanmeldverzoek van een ander zag er voor de persoon uit als een eigen gewone aanmelding, zonder kenmerk ‘nieuw apparaat’ en zonder eis van een sterkere aanmeldmethode.
- **Wat is veranderd.** Een bekend apparaat wordt nu herkend aan een eigen geheim browserkenmerk; een verzoek uit een browser zonder dat kenmerk wordt als nieuw apparaat getoond.
- **Dezelfde grondoorzaak:** aanmelden-05
- **Test:** [`telegram-inlog-apparaat-20261112.test.ts`](../../tests/eenheid/telegram-inlog-apparaat-20261112.test.ts)

#### integraties-05 · Slim huis: een trage server van de gebruiker kon de databaseverbindingen uitputten

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Aanroepen naar de Home Assistant-server van de gebruiker liepen binnen een databasetransactie en zonder limiet; een storing na het versturen van een opdracht kon de vastlegging ervan verloren laten gaan.
- **Wie het kon misbruiken en het gevolg.** Eén gebruiker met een opzettelijk trage server kon alle databaseverbindingen bezetten en de site voor anderen vertragen; een apparaatopdracht kon twee keer worden verstuurd.
- **Wat is veranderd.** Netwerkaanroepen zijn buiten de transacties geplaatst, een opdracht wordt vastgelegd vóór het versturen, en het aantal gelijktijdige en frequente aanroepen is begrensd.
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### integraties-06 · Een externe MCP-server kon het siteproces laten stoppen of vastlopen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De client voor externe MCP-servers verwerkte het sluiten van de stroom tijdens het versturen van een verzoek niet, en het opschonen van tekst van de server had een kwadratische rekentijd.
- **Wie het kon misbruiken en het gevolg.** De beheerder van een externe server van de toegestane lijst kon de site voor iedereen laten omvallen of vastlopen.
- **Wat is veranderd.** Elke wachtende reactie heeft nu een foutafhandeling en ruimt timers op, en tekst van de server wordt vóór het opschonen tot een veilige lengte ingekort.
- **Test:** [`mcp-klant-stabiliteit-20261112.test.ts`](../../tests/eenheid/mcp-klant-stabiliteit-20261112.test.ts)

#### integraties-07 · CalDAV: er was geen grens aan het aantal afspraken per agenda

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De synchronisatie met een vreemde agendaserver begrensde het aantal afspraken niet en schreef ze één voor één in een lange transactie naar de database.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker met een eigen server kon de site elk kwartier honderdduizenden afspraken laten wegschrijven, wat de database vertraagde en schijfruimte kostte.
- **Wat is veranderd.** Er gelden nu grenzen per agenda en per account, het wegschrijven gebeurt in pakketten en de synchronisatiefrequentie is begrensd.
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### integraties-08 · Meldingen van buitenstaanders op GitHub werden ‘taken’ die AI-agenten lezen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een melding (issue) die iemand in een gekoppelde repository aanmaakte, kwam automatisch zonder herkomstaanduiding in de takenlijst op het bord; ook de inhoud van de README kwam in de context van de AI.
- **Wie het kon misbruiken en het gevolg.** Een buitenstaander kon de AI-agenten van de gebruiker tekst voorleggen die eruitzag als een eigen taak van de gebruiker (promptinjectie).
- **Wat is veranderd.** Kaarten uit GitHub krijgen kenmerken voor herkomst en «derden», de volledige tekst wordt alleen van deelnemers aan de repository bewaard, de AI ziet ze gemarkeerd als niet-vertrouwde inhoud, en het bord heeft een aparte kolom voor binnenkomende kaarten.
- **Test:** [`github-webhook-na-ontkoppelen-20261112.test.ts`](../../tests/eenheid/github-webhook-na-ontkoppelen-20261112.test.ts)

#### aanv-ronde1-06 · De controle van Dropbox-paden kon de server blijvend laten hangen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De reguliere expressie voor het controleren van een Dropbox-pad had geneste herhalingen en eindigde op bepaalde invoer niet.
- **Wie het kon misbruiken en het gevolg.** Na het inschakelen van de Dropbox-integratielaag kon een goedgekeurde gebruiker met één verzoek de site tot een herstart stilleggen.
- **Wat is veranderd.** Het pad wordt met een eenvoudige lineaire functie gecontroleerd, met grenzen voor lengte en aantal delen, vóór elk netwerkverzoek.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### integraties-09 · Slim huis: een vreemd account kon zonder instemming aan een woning worden toegevoegd

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De eigenaar van een woning voegde een deelnemer op e-mailadres direct toe, zonder diens instemming, en het antwoord verschilde voor bestaande en niet-bestaande adressen.
- **Wie het kon misbruiken en het gevolg.** Een gebruiker kon nagaan welke adressen op het platform geregistreerd zijn en anderen een eigen woning met eigen gebeurtenissen en voorstellen opdringen.
- **Wat is veranderd.** Direct toevoegen is vervangen door een uitnodiging die pas geldt na aanvaarding; het antwoord is voor elk adres gelijk en het aantal uitnodigingen is begrensd.
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### integraties-10 · Een taknaam kon een optie van de git-opdracht op het apparaat worden

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De controle van de taknaam voor GitHub-handelingen op het apparaat liet namen door die met een streepje beginnen, en zo'n naam kwam als optie in de git-opdracht terecht.
- **Wie het kon misbruiken en het gevolg.** Na goedkeuring op het apparaat kon een geloofwaardig ogende opdracht iets vernielends doen, zoals geforceerd overschrijven van de repository.
- **Wat is veranderd.** Taknamen die met een streepje beginnen, delen met een punt bevatten of een andere ongeldige vorm hebben, worden met een eigen code geweigerd in plaats van stil vervangen.
- **Test:** [`github-werkruimte-tak-20261112.test.ts`](../../tests/eenheid/github-werkruimte-tak-20261112.test.ts)

#### integraties-11 · De controle van WebDAV/S3-opslag kon de server ongeveer een minuut stilleggen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** In de integratiewizard werd het antwoord van een vreemde opslagserver ontleed met patronen met een kwadratische rekentijd.
- **Wie het kon misbruiken en het gevolg.** Een beheerder die een adres controleerde dat door een derde wordt beheerd, kon de site onbedoeld voor iedereen laten vastlopen.
- **Wat is veranderd.** Het ontleden is vervangen door een lineaire aanpak, en de omvang van het antwoord en het aantal blokken daarin zijn begrensd.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### integraties-12 · Geheime Telegram-code: gelijktijdige pogingen werden allemaal gecontroleerd voordat de teller ingreep

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Hetzelfde gebrek als in bevinding aanmelden-09, maar vanuit het aanmelden via Telegram: de codecontrole vergrendelde de tellerrij niet, waardoor gelijktijdige pogingen de pauze omzeilden.
- **Wie het kon misbruiken en het gevolg.** Wie de Telegram van iemand al in handen had, kon vaker proberen de geheime code te raden dan het beleid toestaat.
- **Wat is veranderd.** Een poging wordt atomair gereserveerd vóór de berekening; zonder reservering wordt de code niet gecontroleerd.
- **Dezelfde grondoorzaak:** aanmelden-09
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### integraties-13 · GitHub-webhooks bleven werken nadat GitHub was ontkoppeld

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Na het ontkoppelen van GitHub, het bevriezen van de technische ruimte of het verlies van technische rechten bleven de geregistreerde webhooks en hun geheimen geldig.
- **Wie het kon misbruiken en het gevolg.** Gebeurtenissen uit de repository bleven taken toevoegen aan het bord van een gebruiker die dacht dat de integratie uit stond.
- **Wat is veranderd.** Bij het ontkoppelen worden webhooks verwijderd en hun geheimen gewist; de verwerker weigert gebeurtenissen voor ontkoppelde en bevroren ruimtes.
- **Test:** [`github-webhook-na-ontkoppelen-20261112.test.ts`](../../tests/eenheid/github-webhook-na-ontkoppelen-20261112.test.ts)

### Gebruikersinterface

#### interface-01 · De knop ‘Toestaan’ verscheen zonder volledige beschrijving van wat er werd toegestaan

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** In goedkeuringsverzoeken voor AI-handelingen waren de parameters van de handeling verborgen of afgekapt, en de volgorde van de velden kon afwijken van de werkelijke.
- **Wie het kon misbruiken en het gevolg.** Iemand kon een opdracht, het schrijven van een bestand of een publicatie goedkeuren zonder het schadelijke deel ervan te zien.
- **Wat is veranderd.** Goedkeuringsvensters tonen nu alle parameters van de actie als aparte velden in een logische volgorde, zonder inkorten, met een korte regel «wat precies» en zichtbare markeringen voor onzichtbare tekens.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### aanv-ronde1-01 · «Afdrukken» van een bijlage opende inhoud van de afzender als pagina op het domein van de site

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het afdrukken van een bijlage opende in een nieuw tabblad een bestand met het type dat de afzender opgaf (bijvoorbeeld HTML of SVG), onder het adres van de site zelf.
- **Wie het kon misbruiken en het gevolg.** Een externe afzender kon iemand op het echte adres van de site een nagemaakte pagina tonen (phishing) of een knop die namens die persoon een actie verstuurt.
- **Wat is veranderd.** Afdrukken opent het ruwe bestand niet meer: pdf en afbeeldingen verschijnen in een eigen document met een strikt inhoudsbeleid, tekst wordt geëscapet, HTML en SVG worden niet als pagina afgedrukt; bovendien aanvaardt de server verzoeken die iets wijzigen en een cookie meesturen alleen als JSON, zodat een formulier uit vreemde inhoud geen actie kan versturen.
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### interface-02 · Een goedkeuringsverzoek liet niet zien welke AI erom vroeg

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** In verzoeken en meldingen stond altijd dezelfde AI-naam, en de werkelijke aanvrager van een aanroep werd niet door de server bewaard.
- **Wie het kon misbruiken en het gevolg.** Met meerdere koppelingen kon de eigenaar een verzoek van een andere (gekraakte of misleide) koppeling goedkeuren in de veronderstelling dat het bij het eigen gesprek hoorde.
- **Wat is veranderd.** De server bewaart welke koppeling het verzoek heeft gemaakt, en het goedkeuringsvenster en de meldingen tonen de echte naam van client en koppeling.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### interface-03 · Eén klik op ‘Alle hulpmiddelen → Altijd’ haalde de goedkeuringsvraag weg bij veel schrijfhulpmiddelen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Eén knop zette zonder bevestiging en zonder melding ongeveer twintig schrijfhulpmiddelen op ‘zonder vragen’, en geen daarvan had een risicokenmerk.
- **Wie het kon misbruiken en het gevolg.** Na een onbedoelde klik, of een klik van een ander, kon elke gekoppelde AI zonder tussenkomst van de eigenaar namens hem publiceren, verwijderen en wijzigen.
- **Wat is veranderd.** Het massale «Altijd» geldt nu alleen voor lees- en navigatiehulpmiddelen; alle hulpmiddelen die wijzigen, versturen of namens de persoon handelen, zijn met «!» gemarkeerd en worden alleen afzonderlijk ingeschakeld.
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### aanv-gat-c-03 · Bijlageviewers pakten een ZIP-archief in het geheugen uit vóór de grenscontrole

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het «begrensde» uitpakken van ZIP in bijlageviewers controleerde de grens pas nadat een bestand volledig in het geheugen van het tabblad was uitgepakt.
- **Wie het kon misbruiken en het gevolg.** Een «bom»-bijlage van een buitenstaander kon het e-mail- of cloudtabblad bij het voorbeeld laten vastlopen of crashen.
- **Wat is veranderd.** Het archief wordt in kleine stukken uitgepakt met direct stoppen bij de grens, en een opgegeven grootte boven de grens wordt al vóór het uitpakken geweigerd.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### interface-04 · Riskante browserhulpmiddelen hadden geen uitleg over het risico

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Voor enkele hulpmiddelen voor browserbesturing ontbraken uitlegteksten en een risicokenmerk: de kale technische naam werd getoond en de stand ‘Altijd’ ging stilzwijgend niet aan.
- **Wie het kon misbruiken en het gevolg.** Iemand schakelde een hulpmiddel in zonder te begrijpen dat de AI dan kon handelen op pagina's met de eigen sessie.
- **Wat is veranderd.** Uitleg en risicokenmerken zijn in beide talen toegevoegd; ontbreekt een lokale tekst, dan toont het paneel de beschrijving van de server, en een niet-beschikbare stand wordt toegelicht.
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### interface-05 · De interface vertrouwde op een ‘weergavecache’ uit de vensternaam, die een externe site kan instellen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De site las de bewaarde paginatoestand uit de vensternaam van de browser, die elke externe site vooraf kan vullen, en zette daar ook de eigen cache met privégegevens in.
- **Wie het kon misbruiken en het gevolg.** Wie via een link van een externe site binnenkwam, kon onder het echte adres tijdelijk ondergeschoven inhoud zien, en de eigen cache kon bij een andere site terechtkomen.
- **Wat is veranderd.** De weergavecache wordt niet meer uit de vensternaam gelezen en er ook niet meer in geschreven; hij staat alleen nog in de opslag van de site zelf.
- **Test:** [`sec-002-g07-20261112.test.ts`](../../tests/eenheid/sec-002-g07-20261112.test.ts)

#### interface-06 · Sommige lokale postgegevens waren gedeeld tussen alle accounts in de browser

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De lijst met afzenders van wie externe afbeeldingen altijd mogen worden getoond, gold voor de hele browser, en de meldingengeschiedenis en zoekopdrachten in de post bleven na afmelden in de lokale opslag staan.
- **Wie het kon misbruiken en het gevolg.** Op een gedeelde computer erfde een andere gebruiker andermans toestemmingen voor afbeeldingen en kon die sporen van andermans postgebruik zien.
- **Wat is veranderd.** De afzenderlijst is gebonden aan account en postvak, en bij afmelden worden lokale post- en meldingsgegevens gewist.
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### interface-07 · Het venster ‘Bevestig toegang’ zei niet welke handeling werd bevestigd

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het venster voor identiteitsbevestiging was voor alle handelingen gelijk en noemde de handeling noch het gevolg; na een bevestiging gingen andere gevoelige handelingen een tijd lang zonder vraag door.
- **Wie het kon misbruiken en het gevolg.** Iemand kon blind een handeling bevestigen die hij niet zelf was begonnen, bijvoorbeeld gestart vanuit een ander tabblad of door een AI via de extensie.
- **Wat is veranderd.** Het venster toont nu in beide talen wat er wordt bevestigd en wat het gevolg is; bij een onbekende handeling verschijnt een eerlijke waarschuwing.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

### Browserextensie

#### extensie-01 · Eén ongeldig bericht van een gekoppelde extensie of agent stopte het serverproces

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De agentpoort ving de fout bij een bericht met een ongeldige identificatie niet op, en de onafgehandelde fout beëindigde het serverproces.
- **Wie het kon misbruiken en het gevolg.** Iedereen met een geldig agenttoken kon de site voor alle gebruikers stilleggen: alle koppelingen en verzoeken werden afgebroken.
- **Wat is veranderd.** De poort controleert de vorm van het bericht en vangt fouten van de verwerker op; de server valt niet meer om door een onafgehandelde fout.
- **Dezelfde grondoorzaak:** ai-mcp-03, keten-config-03, http-rand-03
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### extensie-02 · Een AI met het recht ‘klikken en typen’ kon zelf de toestemmingsknoppen op de AI-beheerpagina indrukken

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De pagina's waarop de gebruiker AI-handelingen goedkeurt, toestemming voor een koppeling geeft en rechten instelt, waren niet afgeschermd van de browserbesturing via de extensie, en een verse identiteitsbevestiging gold voor de hele sessie.
- **Wie het kon misbruiken en het gevolg.** Een AI die in de browser mocht klikken (ook onder invloed van kwaadaardige tekst) kon zijn eigen handelingen goedkeuren en zijn eigen toegang verruimen.
- **Wat is veranderd.** Knoppen voor goedkeuring, toestemming, het toekennen van rechten en AI-schakelaars reageren alleen op echte handelingen van een mens, de extensie klikt en typt niet op deze elementen, en het toekennen van AI-rechten vereist een verse bevestiging die niet wordt «onthouden».
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### extensie-03 · Een privé-AI kon een technisch tabblad zien en omleiden

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De extensie vergat bij elke adreswijziging tot welk profiel een tabblad hoorde en behandelde een tabblad met een onbekend profiel als een gebruikerstabblad.
- **Wie het kon misbruiken en het gevolg.** Een AI van de privéruimte kon titels en adressen van technische tabbladen krijgen en zo'n tabblad omleiden of sluiten.
- **Wat is veranderd.** Een tabblad met een onbekend profiel is nu voor beide soorten koppelingen ontoegankelijk, en na een adreswijziging wordt het profiel direct opnieuw vastgesteld.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### extensie-04 · Tijdens het laden gold een technisch tabblad als gebruikerstabblad

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Zolang de pagina nog geen antwoord had over de staat van het technische profiel (of als dat verzoek mislukte), behandelde de extensie het tabblad als een gewoon gebruikerstabblad.
- **Wie het kon misbruiken en het gevolg.** In die tussentijd kon een privé-AI de inhoud van het technische tabblad lezen en erin handelen.
- **Wat is veranderd.** Het profiel van een tabblad is nu ‘standaard gesloten’: zolang de staat onbekend is, is het tabblad ontoegankelijk voor AI en wordt de staat opnieuw opgevraagd.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### extensie-05 · Het verlengen van AI-toegang in de extensie vereiste geen verse bevestiging

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De beheerroutes van de extensie voor alle gebruikers (verlengen van geopende toegang, versoepelen van het beleid) werkten zonder verse identiteitsbevestiging en zonder actief technisch profiel.
- **Wie het kon misbruiken en het gevolg.** Een korte AI-toegang van minuten kon zonder extra controle tot maanden worden verlengd, ook door de AI zelf via klikken.
- **Wat is veranderd.** Verlengen van toegang en elke verruiming van het beleid vereisen nu een bevestiging die ná het openen van die toegang is gegeven (voor technische toegang een sterke), en één bevestiging levert maar één verruiming op.
- **Test:** [`sec-002-g06-20261112.test.ts`](../../tests/eenheid/sec-002-g06-20261112.test.ts)

#### extensie-06 · Het diagnosehulpmiddel van de browser bleef gekoppeld na een overgang naar een externe site

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Als een tabblad tijdens een diagnose naar een andere site ging, koppelde de extensie het foutopsporingshulpmiddel niet direct los.
- **Wie het kon misbruiken en het gevolg.** Een technische AI met diagnoserecht kon gegevens over netwerkverzoeken en fouten van een externe site in de sessie van de gebruiker krijgen.
- **Wat is veranderd.** Het foutopsporingshulpmiddel wordt nu onmiddellijk losgekoppeld zodra het tabblad de toegestane adressen verlaat, en gebeurtenissen van buiten de toegestane sites worden genegeerd.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### extensie-07 · Het bekijken van grote Google Drive-bestanden kon het servergeheugen uitputten

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De server laadde een bestand uit Google Drive volledig in het geheugen (tot 128 MB) en begrensde het aantal gelijktijdige weergaven niet.
- **Wie het kon misbruiken en het gevolg.** Enkele gelijktijdige verzoeken van één gebruiker konden het geheugen uitputten en de site voor iedereen laten herstarten.
- **Wat is veranderd.** Het aantal gelijktijdige leesacties per gebruiker en in totaal is begrensd, het bestand wordt als stroom gelezen en bij de grens afgebroken, en grote bestanden worden niet meer in hun geheel teruggegeven.
- **Test:** [`sec-002-g05-20261112.test.ts`](../../tests/eenheid/sec-002-g05-20261112.test.ts)

#### extensie-08 · De reserveroute voor het intrekken van toegang vanuit de extensie bereikte de server niet

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Als de vaste verbinding met de server was verbroken, stuurde de extensie de intrekking via een reserveroute, maar de server wees die altijd af met de bescherming tegen vervalste verzoeken.
- **Wie het kon misbruiken en het gevolg.** De gebruiker koos ‘Intrekken’ of ‘Stop’, maar op de server bleef de AI-toegang geldig en kwam die na een herstart van de browser terug.
- **Wat is veranderd.** De server accepteert het reserveverzoek voor intrekken van de extensie (het kan alleen toegang sluiten), en de extensie herhaalt mislukte intrekkingen.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### extensie-09 · Codes die op de pagina stonden, kwamen in de paginamomentopname voor AI terecht

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Eenmalige codes die als tekst werden getoond (bijvoorbeeld de koppelcode voor een apparaat) zaten in de momentopname en schermafdruk die de AI krijgt, en de code zelf werd zonder verse bevestiging uitgegeven.
- **Wie het kon misbruiken en het gevolg.** Via een AI met leesrecht op de pagina kon een buitenstaander de code bemachtigen en een eigen apparaat aan het account toevoegen.
- **Wat is veranderd.** Blokken met codes en tokens zijn als verborgen voor AI gemarkeerd en worden uit momentopnamen en schermafdrukken gehaald; het uitgeven van een koppelcode vereist een verse bevestiging.
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

### Toeleveringsketen en configuratie

#### keten-config-01 · Eén verzoek zonder aanmelden met een ongeldig adres beëindigde het serverproces

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Hetzelfde gebrek als in bevinding http-rand-01, gevonden bij de controle van de configuratie: een fout bij het ontleden van het adres in de verwerker van WebSocket-verzoeken werd niet opgevangen.
- **Wie het kon misbruiken en het gevolg.** Iedereen op internet kon met herhaalde verzoeken alle sites van de installatie onbereikbaar maken; bij elke val ging de toestand in het geheugen verloren.
- **Wat is veranderd.** De verwerker ontleedt het adres veilig en vangt alle fouten op; er is een algemene bescherming van het proces tegen onafgehandelde fouten bij gekomen.
- **Dezelfde grondoorzaak:** http-rand-01
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### keten-config-02 · Een binnenkomend bericht met speciaal opgebouwde HTML legde de server minuten tot uren stil

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Het omzetten van het HTML-deel van een bericht naar tekst gebeurde met patronen met een kwadratische rekentijd en zonder grens aan de invoer.
- **Wie het kon misbruiken en het gevolg.** Iedereen die het e-mailadres kent van een gebruiker met een gekoppeld postvak, kon de site met één bericht voor iedereen onbereikbaar maken.
- **Wat is veranderd.** De omvang van de inhoud wordt vóór verwerking begrensd, en het opschonen van HTML is vervangen door een lineaire doorloop in één keer.
- **Dezelfde grondoorzaak:** post-01
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### keten-config-03 · Een gekoppelde agent beëindigde het serverproces met één bericht

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Hetzelfde gebrek in de agentpoort als in de bevindingen ai-mcp-03 en extensie-01: een onafgehandelde fout in de asynchrone berichtverwerker.
- **Wie het kon misbruiken en het gevolg.** Elke goedgekeurde gebruiker met een gekoppeld apparaat kon de server voor iedereen laten stoppen.
- **Wat is veranderd.** De verwerker vangt fouten op en controleert de vorm van de identificatie, en het proces is beschermd met een algemene afhandeling van onafgehandelde fouten.
- **Dezelfde grondoorzaak:** ai-mcp-03, extensie-01, http-rand-03
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### keten-config-04 · Het opschonen van uitgaande HTML van een bericht kon de server tientallen minuten stilleggen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Bij het opschonen van HTML vóór bewaren of versturen werden patronen met een kwadratische rekentijd uitgevoerd op tekst tot 12 MB, en pas daarna werd ingekort.
- **Wie het kon misbruiken en het gevolg.** Eén verzoek van een postgebruiker (of een bericht van een externe afzender dat aan de AI-assistent werd doorgegeven) blokkeerde de server voor iedereen.
- **Wat is veranderd.** De tekst wordt vóór verwerking ingekort, en blokken en labels worden lineair ontleed.
- **Dezelfde grondoorzaak:** post-02
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### keten-config-05 · Het servergeheugen kon zonder aanmelden worden uitgeput

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Inhoud van verzoeken en onvoltooide WebSocket-berichten werd nog vóór de authenticatie in het geheugen gebufferd, zonder grens aan het aantal verbindingen; de dienst had geen geheugenlimiet.
- **Wie het kon misbruiken en het gevolg.** Een anonieme aanvaller kon geheugentekort veroorzaken en de site of de database laten omvallen.
- **Wat is veranderd.** Te grote inhoud wordt geweigerd voordat ze wordt gelezen, anonieme verzoeken mogen alleen kleine inhoud sturen, er geldt een gezamenlijk budget voor buffers en verbindingen, en de dienst heeft een geheugenlimiet.
- **Dezelfde grondoorzaak:** http-rand-06
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### aanv-gat-a-04 · Een noodschakelaar schakelde stil alle extra aanmeldbevestigingen uit

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een omgevingsvariabele voor noodgevallen zette alle extra bevestigingen (gewone en «sterke») onbeperkt uit, en dat was nergens zichtbaar: niet in het logboek, niet bij «Beveiliging», niet in de diagnose.
- **Wie het kon misbruiken en het gevolg.** Had de eigenaar de schakelaar ooit aangezet en vergeten, dan kon iedereen met een geldige sessie (gestolen cookie, AI in het tabblad) gevoelige acties zonder bevestiging uitvoeren.
- **Wat is veranderd.** De nieuwe vorm van de schakelaar werkt hoogstens 24 uur vanaf de eerste start en eindigt vanzelf; elke vorm is zichtbaar in het logboek, bij «Beveiliging», in de diepe controle en via een melding, en een te verre waarde schakelt niets uit.
- **Test:** [`sec-002-g07-20261112.test.ts`](../../tests/eenheid/sec-002-g07-20261112.test.ts)

#### keten-config-06 · De bouw van een uitgave op de server liep onder dezelfde gebruiker als de draaiende dienst

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Bij het installeren van een update installeerde de server afhankelijkheden, inclusief hun installatiescripts, onder het account van de draaiende dienst.
- **Wie het kon misbruiken en het gevolg.** Een gecompromitteerd pakket tussen de afhankelijkheden (ook een dat alleen voor de bouw nodig is) kon tijdens een update de geheimen van de draaiende dienst en bestanden van gebruikers lezen.
- **Wat is veranderd.** De bouw loopt onder een aparte systeemgebruiker zonder toegang tot de geheimen van de dienst, en installatiescripts van afhankelijkheden zijn uitgeschakeld, behalve de uitdrukkelijk benodigde.
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### keten-config-07 · GitHub-werkstromen hadden overbodige schrijfrechten en niet-vastgezette acties

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** In de werkstromen die uitgaven bouwen waren het schrijfrecht op de repository en de toegangssleutel voor alle stappen beschikbaar, ook voor bouw- en testcode; externe acties waren niet op een exacte versie vastgezet en de testaantallen in de uitgavebeschrijving waren met de hand ingevuld.
- **Wie het kon misbruiken en het gevolg.** Een gecompromitteerde afhankelijkheid of externe actie kon tijdens de bouw takken, labels of uitgaven vervangen, en de uitgavebeschrijving kon onjuiste testresultaten tonen.
- **Wat is veranderd.** Standaard hebben de processen alleen leesrechten; schrijfrecht heeft alleen een aparte publicatietaak die niets bouwt en het overgedragen werk controleert. Acties zijn op exacte versies vastgezet, takpatronen vervangen door exacte namen, en testaantallen komen uit de werkelijke uitvoer.
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

### Privacy en logboeken

#### privacy-logboek-01 · Het definitief wissen van een account liet de meeste gegevens staan

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Dertig dagen na verwijdering werden alleen de hoofdrecords gewist; relationele tabellen (zoekindex met e-mailtekst, notities, concepten, aanmeldmethoden enzovoort) bleven staan.
- **Wie het kon misbruiken en het gevolg.** Gegevens van iemand die het account had verwijderd, bleven onbeperkt op de server, tegen de belofte van volledig wissen in.
- **Wat is veranderd.** Definitief wissen volgt nu hetzelfde volledige plan als direct verwijderen, inclusief afhankelijke rijen; een mislukte poging wordt vastgelegd, herhaald en houdt andere niet tegen.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### privacy-logboek-02 · Een auditregel mislukte door bepaalde tekens en de fout werd ingeslikt

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Stond er in de details van een actie een nulteken of een halve emoji na inkorten, dan weigerde de database de logregel en negeerde de code die fout stil.
- **Wie het kon misbruiken en het gevolg.** Een AI-agent, iemand met een gestolen sessie of een beheerder kon een actie uitvoeren zonder spoor in het auditlogboek en in de meldingen.
- **Wat is veranderd.** Tekst voor het logboek wordt van zulke tekens ontdaan en ingekort zonder tekens te breken; lukt het opslaan van details toch niet, dan wordt de regel zonder details geschreven, en het uitgeven van een AI-token zonder logregel wordt teruggedraaid.
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### privacy-logboek-03 · Beveiligingskritieke acties kwamen niet in het meldingencentrum

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De activiteitenstroom nam maar een deel van de acties uit het logboek over, en voor sommige belangrijke gebeurtenissen (nieuw wachtwoord, authenticator uit, AI-token, sleutelkluis, inzage door een beheerder) waren er geen eigen meldingen.
- **Wie het kon misbruiken en het gevolg.** Een aanvaller met een gestolen sessie kon aanmeldmethoden wijzigen of een AI-token uitgeven zonder dat de accounteigenaar daar iets van zag.
- **Wat is veranderd.** Voor deze acties zijn tweetalige meldingen en regels in de activiteitenstroom toegevoegd; wie door een beheerder is ingezien, krijgt daarvan een melding.
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### privacy-logboek-04 · Foto's in delen uploaden kon schijf en geheugen van de server vullen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Dezelfde oorzaak als wolk-02: geen grenzen op het aantal gelijktijdige uploadsessies voor foto's en op het totale volume.
- **Wie het kon misbruiken en het gevolg.** Elke goedgekeurde gebruiker van de fotodienst kon de tijdelijke map of het geheugen vullen en de site voor iedereen stilleggen.
- **Wat is veranderd.** Zie wolk-02: grenzen voor sessies en volume, ruimtecontrole, strikte volgorde van delen.
- **Dezelfde grondoorzaak:** wolk-02
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### privacy-logboek-05 · Ondersteuningsrollen zagen details van privéacties van alle gebruikers in het beheerlogboek

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het beheerlogboek toonde ondersteunings- en beveiligingsrollen de volledige details van privéacties van anderen (bestandspaden, opdrachten, door AI bezochte pagina's), liet erop zoeken en massaal exporteren zonder nieuwe bevestiging.
- **Wie het kon misbruiken en het gevolg.** Een ondersteuningsmedewerker of een gestolen beheerssessie kon te weten komen wat de AI van anderen op hun apparaten en in hun browser deed.
- **Wat is veranderd.** Voor iedereen behalve de hoofdbeheerder worden privédetails van andermans acties gemaskeerd en niet doorzocht; exporteren vereist een verse bevestiging en heeft een frequentiegrens.
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### aanv-ronde1-07 · Notitieconcepten in de browser waren niet aan het account gekoppeld

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Niet-opgeslagen notitieconcepten stonden in de lokale opslag van de browser zonder koppeling aan account en ruimte, en werden bij afmelden niet gewist.
- **Wie het kon misbruiken en het gevolg.** Op een gedeelde computer kon de volgende persoon andermans niet-opgeslagen tekst zien en herstellen.
- **Wat is veranderd.** De sleutel van een concept bevat een kenmerk van account en ruimte, andermans concepten worden niet getoond, en bij afmelden worden concepten gewist.
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### privacy-logboek-06 · Records gingen stil verloren door tekst die midden in een emoji was ingekort

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Werd tekst midden in een emoji ingekort, dan weigerde de database het record en gaf de gedeelde schrijffunctie zonder fout of spoor «niets» terug.
- **Wie het kon misbruiken en het gevolg.** Meldingen en andere records konden ongemerkt verdwijnen; wie zulke tekst beheert (bijvoorbeeld het onderwerp van een e-mail), kon zo meldingen onderdrukken.
- **Wat is veranderd.** Tekst voor de database wordt van gebroken tekens ontdaan en bewaard, en een mislukte schrijfactie laat een spoor in het dienstlogboek achter.
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### privacy-logboek-07 · «Probleem melden» had geen frequentiegrens

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Meldingen aan de ondersteuning konden onbeperkt worden verstuurd, en elk verzoek startte bovendien een opruimactie over de hele tabel.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde deelnemer kon meldingen van andere gebruikers uit het zicht van de ondersteuning drukken en het auditlogboek laten groeien.
- **Wat is veranderd.** Meldingen zijn per persoon in frequentie begrensd, de ondersteuning ziet de nieuwste meldingen van elke persoon, en het opruimen van oude meldingen gebeurt in een achtergrondtaak.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### privacy-logboek-08 · De export van persoonsgegevens bevatte sleutelmateriaal

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Ondanks de belofte «geheimen, sleutels en versleutelde velden niet inbegrepen» bevatte de export de verpakking van de gegevenssleutel van de kluis met parameters en dienstkoppelingen van sessies.
- **Wie het kon misbruiken en het gevolg.** Wie het exportbestand kreeg, had materiaal om offline de herstelcode van de sleutelkluis te raden; die code is lang, dus het risico is laag.
- **Wat is veranderd.** Velden met sleutelmateriaal worden aan naam en vorm herkend en komen niet in de export, en diensttabellen met passkey-uitdagingen worden niet geëxporteerd.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

## Nieuwe fouten gevonden door controleurs (opgelost)

Elke patchgroep is door een onafhankelijke controleur nagekeken. Hieronder staan de fouten die hij in de patches zelf of in naburige code vond en die vóór de release zijn hersteld. Regressies zijn fouten van patches in legitiem gebruik zonder direct beveiligingsgevolg.

### Aanmelden en sessies

#### toets-g10g-1 · «Sessie beëindigen» trok de «onthouden browser» niet in als er een reservesessie was

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Het intrekken van de onthouden browser werd overgeslagen als een andere levende sessie die gebruikte, en zo'n sessie kon vooraf worden aangemaakt.
- **Wie het kon misbruiken en het gevolg.** Gestolen toegang overleefde het beëindigen van de sessie.
- **Wat is veranderd.** Met de sessie worden altijd de onthouden browser en alle sessies en tabbladen die erop steunen ingetrokken, behalve de eigen huidige.
- **Hoort bij:** aanmelden-02
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### toets-g10g-3 · «Nee, dit ben ik niet» in Telegram liet de «onthouden browser» bestaan

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Het antwoord «Nee, dit ben ik niet» in Telegram beëindigde sessies, maar trok de onthouden browser niet in.
- **Wie het kon misbruiken en het gevolg.** Vanuit dezelfde browser kon opnieuw worden aangemeld zonder Telegram en Google.
- **Wat is veranderd.** Dit antwoord voert dezelfde volledige intrekprocedure uit als «Sessies».
- **Hoort bij:** aanmelden-02
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### eind-4 · Na de update gold elke browser als nieuw apparaat bij de eerste aanmelding via Telegram

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De nieuwe herkenning van een apparaat aan een eigen browserkenmerk kende browsers van vóór de update niet, zodat de eerste aanmelding via Telegram ook een passkey vroeg.
- **Wie het kon misbruiken en het gevolg.** Iemand zonder passkey kon niet via Telegram aanmelden en begreep niet waarom.
- **Wat is veranderd.** Voor Telegram is een browser zonder eigen kenmerk, zoals voorheen, nieuw: de eerste aanmelding vraagt één keer een passkey; wie die niet heeft, krijgt van bot en site de uitleg dat één aanmelding via Google in deze browser volstaat. Een browser die van vóór de update bekend is, krijgt na de eerste aanmelding één keer een neutrale melding in plaats van het alarm «nieuw apparaat». De beveiliging is niet verzwakt.
- **Hoort bij:** integraties-04
- **Test:** [`sec-002-slot-s-20261112.test.ts`](../../tests/eenheid/sec-002-slot-s-20261112.test.ts)

#### toets-g10e-4 · Het herkennen van de geheime code in de Telegramchat was verzwakt

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Na de patch werd een code die niet vooraan in het bericht stond niet meer herkend en niet uit de chat verwijderd, en het budget raakte met een paar gewone berichten op.
- **Wie het kon misbruiken en het gevolg.** De geheime code kon zichtbaar in de chat blijven.
- **Wat is veranderd.** Alle woorden met de lengte van de code worden gecontroleerd, het budget is ruimer, en als het op is worden berichten die op een code lijken zonder controle verwijderd.
- **Hoort bij:** aanv-gat-a-03
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### toets-g10h-3 · Zonder ingeschakelde uitleg gold elke Telegram-aanmelding als nieuw apparaat

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Een bekend apparaat werd alleen vastgelegd als de vlag voor uitleg aan stond.
- **Wie het kon misbruiken en het gevolg.** Iemand zag steeds een waarschuwing voor een nieuw apparaat en moest met een passkey bevestigen.
- **Wat is veranderd.** Een bekend apparaat wordt los van de vlag vastgelegd; de vlag regelt alleen de melding.
- **Hoort bij:** integraties-04
- **Test:** [`telegram-inlog-apparaat-20261112.test.ts`](../../tests/eenheid/telegram-inlog-apparaat-20261112.test.ts)

### Rechten en RLS

#### eind-2 · De rol «alleen bekijken» kon eigen toegang niet intrekken

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het algemene schrijfverbod voor de rol «alleen bekijken» trof ook het intrekken van eigen tokens, AI-koppelingen, extensietoegang en gastcodes.
- **Wie het kon misbruiken en het gevolg.** Iemand met een verlaagde rol kon eigen, al uitgegeven toegang die mogelijk gecompromitteerd was, niet zelf intrekken.
- **Wat is veranderd.** Intrekken en ontkoppelen van eigen toegang is voor deze rol via een aparte lijst toegestaan; nieuwe toegang aanmaken blijft verboden.
- **Hoort bij:** autorisatie-08
- **Test:** [`sec-002-slot-s-20261112.test.ts`](../../tests/eenheid/sec-002-slot-s-20261112.test.ts)

#### eind-3 · De rol «alleen bekijken» kon een deel van de pagina's niet lezen

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Enkele routes die alleen lezen (diagnose, logo's in e-mail, het AI-bord, de GitHub-spiegel enzovoort) waren ten onrechte als schrijven ingedeeld.
- **Wie het kon misbruiken en het gevolg.** Iemand met de rol «alleen bekijken» kreeg een weigering waar hij alleen wilde kijken.
- **Wat is veranderd.** Deze routes staan nu met toelichting op de leeslijst; routes die echt schrijven blijven gesloten.
- **Hoort bij:** autorisatie-08
- **Test:** [`sec-002-slot-s-20261112.test.ts`](../../tests/eenheid/sec-002-slot-s-20261112.test.ts)

#### eind-13 · De rol «alleen bekijken» kon andere deelnemers uit een gedeelde ruimte verwijderen

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De toestemming om eigen toegang in te trekken voor de rol «alleen bekijken» (eind-2) liet ook routes door die op de rol binnen de ruimte zelf beslissen, zodat zo iemand, als beheerder van een andermans ruimte, andere deelnemers kon verwijderen en uitnodigingen, links en extensieontgrendelingen van anderen kon intrekken.
- **Wie het kon misbruiken en het gevolg.** Iemand met een beperkte rol kon anderen de toegang tot een gedeelde ruimte ontnemen.
- **Wat is veranderd.** Voor de rol «alleen bekijken» is alleen zelf de ruimte verlaten en het intrekken van eigen links en ontgrendelingen toegestaan; een poging iets van een ander te raken wordt met een duidelijke weigering afgewezen, gelogd en gemeld.
- **Hoort bij:** eind-2
- **Test:** [`sec-002-slot-v-20261113.test.ts`](../../tests/eenheid/sec-002-slot-v-20261113.test.ts)

#### toets-g03-2 · De rol «alleen bekijken» kon via een andere weg in de cloud schrijven

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Functies die bestanden in de cloud opslaan, werden ook aangeroepen vanuit routes buiten de cloud waar het schrijfrecht niet werd gecontroleerd.
- **Wie het kon misbruiken en het gevolg.** Een account met alleen bekijkrechten kon bestanden in de eigen cloud aanmaken.
- **Wat is veranderd.** De schrijffuncties controleren het schrijfrecht nu zelf vóór elke schrijfactie.
- **Hoort bij:** wolk-08
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### toets-g10b-5 · Een lagere rol via opnieuw «Delen» liet verweesde blokken achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Opnieuw toegang geven met een lagere rol droeg de blokken van de vroegere bewerker niet aan de eigenaar over.
- **Wie het kon misbruiken en het gevolg.** Er bleven blokken over die niemand kon wijzigen.
- **Wat is veranderd.** Blokken buiten de nieuwe rechten gaan naar de eigenaar.
- **Hoort bij:** autorisatie-04
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### toets-g10b-6 · Gastcodes van een geblokkeerd en verwijderd account werkten weer

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Gasttoegangscodes controleerden alleen de status «geblokkeerd», zodat ze na verwijdering weer werkten.
- **Wie het kon misbruiken en het gevolg.** Gasten van een geblokkeerde persoon behielden toegang tot diens gegevens.
- **Wat is veranderd.** Gastcodes en gastsessies werken niet voor verwijderde accounts tot het definitief wissen.
- **Hoort bij:** aanv-gat-a-02
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### toets-g10c-5 · Hetzelfde patroon van het overschrijven van een account bleef ernaast bestaan

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Verwijderen, herstellen en een rolwijziging van een account overschreven het record nog volledig met een momentopname.
- **Wie het kon misbruiken en het gevolg.** Een gelijktijdige blokkade kon verloren gaan.
- **Wat is veranderd.** Deze paden gebruiken nu voorwaardelijke gedeeltelijke updates, en herstellen kan alleen vanuit de status «verwijderd».
- **Hoort bij:** autorisatie-02
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### toets-g10h-2 · Terugdraaien na een interne storing herstelde net gewijzigde rijen niet meer

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De nieuwe bescherming tegen het «herleven» van ingetrokken sessies hinderde het legitieme terugdraaien van een eigen, net gemaakte wijziging.
- **Wie het kon misbruiken en het gevolg.** Na een storing kon afmelden in de browser tabbladen in een verkeerde toestand laten.
- **Wat is veranderd.** Alleen dit interne terugdraaien mag de toestand herstellen.
- **Hoort bij:** autorisatie-01
- **Test:** [`sec-002-g10h-20261112.test.ts`](../../tests/eenheid/sec-002-g10h-20261112.test.ts)

#### toets-g11-5 · Een storing tijdens een besluit over een toegangsverzoek liet het verzoek onbeslisbaar

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een niet-atomaire «overname» van het verzoek liet het na een storing voorgoed wachten, en weigeringen lieten geen spoor.
- **Wie het kon misbruiken en het gevolg.** Het verzoek kon niet worden goedgekeurd of afgewezen.
- **Wat is veranderd.** Een storing wordt gecompenseerd door de vorige toestand te herstellen, het verzoek van een geblokkeerd account kan worden gesloten, en elke weigering wordt gelogd.
- **Hoort bij:** aanv-gat-a-01
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

### HTTP-grens

#### toets-g10e-1 · De grens op gelijktijdige verzoeken brak het legitiem uploaden van mappen naar de cloud

_Ernst: hoog · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De nieuwe grens op gelijktijdige verzoeklichamen per adres gold ook voor aangemelde gebruikers, terwijl de cloudcliënt delen parallel verstuurt.
- **Wie het kon misbruiken en het gevolg.** Het uploaden van een map met meerdere bestanden bleef hangen.
- **Wat is veranderd.** Voor anonieme en aangemelde verzoeken gelden aparte grenzen.
- **Hoort bij:** http-rand-06
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### toets-g10e-7 · Het nieuwe geheugenplafond per adres brak het uploaden van mappen opnieuw

_Ernst: hoog · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Het plafond voor gebufferde bytes per adres stopte het uploaden van een map met meerdere grote bestanden, en de cliënt zag de weigering als netwerkstoring.
- **Wie het kon misbruiken en het gevolg.** Uploads van mappen naar de cloud bleven hangen.
- **Wat is veranderd.** De cloudcliënt verstuurt hoogstens twee bestanden tegelijk en wacht als de server daarom vraagt; de servergrenzen zijn niet verruimd.
- **Hoort bij:** http-rand-06
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### toets-g10e-2 · Een nepcookie hief de anonieme grenzen op verzoekgrootte op

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Aanmelding werd alleen afgeleid uit de aanwezigheid van een kop, zodat elke cookie een anonieme bezoeker de hogere grenzen gaf.
- **Wie het kon misbruiken en het gevolg.** Een anonieme bezoeker kon het hele gedeelde geheugenbudget voor verzoeken bezetten.
- **Wat is veranderd.** Hogere grenzen gelden pas na een lichte controle van een echte sessie; er is een plafond in bytes per adres, en kleine verzoeken (aanmelden) gaan altijd door.
- **Hoort bij:** http-rand-06
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### toets-g10h-1 · Het wachtwoord van een gedeelde cloudlink en toegangsverzoeken telden per volledig IPv6-adres

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Naburige tellers van pogingen bleven aan het volledige IPv6-adres gekoppeld.
- **Wie het kon misbruiken en het gevolg.** Het wachtwoord van een beschermde link kon vanaf veel adressen van één abonnee worden geraden.
- **Wat is veranderd.** Ook deze tellers rekenen per prefix /64.
- **Hoort bij:** http-rand-05
- **Test:** [`sec-002-g10h-20261112.test.ts`](../../tests/eenheid/sec-002-g10h-20261112.test.ts)

#### eind-7 · De grens op verzoeklichamen beschouwde een ingetrokken sessie als echt

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De controle op een «echte» sessie voor hogere grenzen op verzoekgrootte keek niet naar intrekking en geldigheid en kon veel databaseverzoeken doen.
- **Wie het kon misbruiken en het gevolg.** Een ingetrokken of verlopen sessie hield de hogere grenzen.
- **Wat is veranderd.** Alleen een levende sessie binnen haar termijn telt als echt; het aantal te controleren kandidaten is begrensd en resultaten worden gecachet.
- **Hoort bij:** http-rand-06
- **Test:** [`sec-002-slot-s-20261112.test.ts`](../../tests/eenheid/sec-002-slot-s-20261112.test.ts)

#### eind-10 · Een nulteken in de invoer gaf een serverfout

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een nulteken in lichaam, parameters of pad van een verzoek veroorzaakte op veel routes een interne serverfout.
- **Wie het kon misbruiken en het gevolg.** Zulke fouten vervuilden het logboek en voedden signalen van de zekering.
- **Wat is veranderd.** Uit waarden in het verzoeklichaam wordt het teken verwijderd, en bij sleutels in het lichaam, queryparameters en padparameters wordt het verzoek met een duidelijke weigering afgewezen; ondertekende webhooks blijven ongewijzigd.
- **Hoort bij:** toets-zekering
- **Test:** [`sec-002-slot-s-20261112.test.ts`](../../tests/eenheid/sec-002-slot-s-20261112.test.ts)

### Geheimen

#### toets-g10b-1 · Sleutelrotatie brak het opslaan van e-mail- en agendawachtwoorden en AI-bevestigingen

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Nieuwe versies van enveloppen kwamen niet door de beperkingen in de database, waardoor deze records na een sleutelrotatie niet werden opgeslagen.
- **Wie het kon misbruiken en het gevolg.** Na een rotatie werkten e-mail- en agendakoppelingen en AI-bevestigingen niet meer.
- **Wat is veranderd.** Een migratie staat nieuwe envelopversies toe, en tellers houden rekening met alle versies.
- **Hoort bij:** geheimen-07
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### toets-g10b-2 · De rotatie-instructie kon nieuwe records onleesbaar maken

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het register stond toe de oude sleutelversie te verwijderen, terwijl enkele modules de sleutel kozen op basis van juist die oude versie en stil op een reservesleutel overstapten.
- **Wie het kon misbruiken en het gevolg.** Na zo'n rotatie zou een deel van de versleutelde gegevens onleesbaar worden.
- **Wat is veranderd.** Register en instructie verbieden het verwijderen van de oude sleutelversie, en alle modules kiezen de sleutel met een functie die elke versie ziet. Voor oude installaties blijft de reservesleutel bestaan, zodat oude records leesbaar blijven.
- **Hoort bij:** geheimen-07
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

### AI-agenten en MCP

#### toets-g10i-1 · Een legitiem agentresultaat met een emoji op de inkortgrens verbrak de verbinding

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De agentgateway kortte foutmeldingen zelf in, brak daarbij een emoji, en de database weigerde het record.
- **Wie het kon misbruiken en het gevolg.** De opdracht bleef hangen en de agentverbinding werd verbroken.
- **Wat is veranderd.** Tekst wordt ingekort zonder tekens te breken en vóór het opslaan opgeschoond.
- **Hoort bij:** keten-config-03
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

#### toets-g05-1 · Asynchroon lezen van de repositorystatus kon coördinatieschrijfacties laten mislukken

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Het nieuwe asynchrone lezen van de git-status liep gelijk op met schrijfacties en kon een dienstvergrendeling vasthouden, waardoor schrijven stil mislukte.
- **Wie het kon misbruiken en het gevolg.** De status van coördinatietaken voor agenten kon niet worden bewaard.
- **Wat is veranderd.** Het leespad start git zonder niet-noodzakelijke vergrendelingen.
- **Hoort bij:** ai-mcp-09
- **Test:** [`sec-002-g05-20261112.test.ts`](../../tests/eenheid/sec-002-g05-20261112.test.ts)

#### toets-g10e-3 · Het nieuwe termijnvenster voor koppelingen verbrak oude koppelingen op de serverdeur massaal

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Bestaande koppelingen ouder dan het nieuwe venster werden bij de eerste vernieuwing verbroken, en na het einde van het venster slaagde vernieuwen ten onrechte.
- **Wie het kon misbruiken en het gevolg.** Onverwachte onderbrekingen van AI-koppelingen na een update.
- **Wat is veranderd.** Oude koppelingen krijgen één volledig venster vanaf de uitrol, en na het einde ervan wordt vernieuwen geweigerd.
- **Hoort bij:** ai-mcp-11
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### toets-g10e-5 · De binding van toestemming aan de browser ontbrak op de serverdeur

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De binding van het toestemmingsverzoek aan de browser was alleen op de site toegevoegd, niet op de serverdeur.
- **Wie het kon misbruiken en het gevolg.** Voor koppelingen via de serverdeur bleef de fout van ai-mcp-14 bestaan.
- **Wat is veranderd.** De deur zet dezelfde bindingscookie, en de site controleert die.
- **Hoort bij:** ai-mcp-14
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

### Terminal en uitrol

#### eind-16 · De opdrachtterminal verried de sessietoestand van de eigenaar en liet anonieme bezoekers diens plaatsen bezetten

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Bij de gereedheidscontrole bleek dat het antwoord op een WebSocket-verbinding van de terminal voor een anonieme bezoeker nog afhing van de vraag of de eigenaar de terminal opende, en enkele anonieme verbindingen de gedeelde wachtplaatsen konden bezetten.
- **Wie het kon misbruiken en het gevolg.** Een anonieme bezoeker kon te weten komen dat de eigenaar net de terminal opende en de browser van de eigenaar in die tijd buitensluiten; toegang tot de terminal gaf dat niet.
- **Wat is veranderd.** De terminal heeft dezelfde opbouw gekregen als de tunnel: de eigenaar wordt herkend aan een beschermde cookie van het technische profiel, elke weigering voor een niet-eigenaar is gelijk in inhoud en tijd ongeacht de toestand, de eigenaar heeft een eigen pool van plaatsen, en weigeringen worden gelogd en aan de eigenaar gemeld; het eenmalige ticket wordt alleen aanvaard vanuit de browser van de eigenaar van die sessie.
- **Hoort bij:** toets-g01-6
- **Test:** [`sec-002-slot-x-20261113.test.ts`](../../tests/eenheid/sec-002-slot-x-20261113.test.ts)

#### toets-g01-1 · Een pakket met afgesloten mappen liet uitgepakte inhoud op de server achter

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Mappen zonder toegangsrechten in een updatepakket verhinderden het opruimen, waardoor de inhoud van een geweigerd pakket voorgoed in de tijdelijke map van de dienst bleef.
- **Wie het kon misbruiken en het gevolg.** Wie updates voorbereidt, kon de schijf geleidelijk vullen of willekeurige bestanden op de server achterlaten.
- **Wat is veranderd.** Zulke pakketten worden al op de inhoudslijst geweigerd, en het opruimen herstelt rechten, probeert opnieuw en logt een mislukking.
- **Hoort bij:** server-uitrol-01
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### toets-g01-2 · De nieuwe verbindingsgrens van de tunnel liet een anonieme bezoeker het extern bureaublad van de eigenaar blokkeren

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De patch begrensde het aantal niet-aangemelde tunnelverbindingen, maar een anonieme bezoeker kon alle plaatsen bezetten.
- **Wie het kon misbruiken en het gevolg.** De eigenaar kon het extern bureaublad niet openen zolang anonieme verbindingen de plaatsen bezet hielden.
- **Wat is veranderd.** Er is geen anoniem pad meer: elke tunnelverbinding vereist de beschermde cookie van de eigenaar wiens sessie op verbinding wacht, zodat een anonieme bezoeker geen plaatsen kan bezetten en niets over de sessie te weten komt.
- **Hoort bij:** server-uitrol-03
- **Test:** [`sec-002-afwerking-a-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-a-20261112.test.ts)

#### toets-g09-1 · Root las na de build dienstbestanden van de releasemap via koppelingen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Na de build las en toonde root dienstbestanden uit de hoofdmap van de release, die de buildcode door een koppeling of FIFO kon vervangen.
- **Wie het kon misbruiken en het gevolg.** Inhoud van rootbestanden kon in het logboek en de status voor de applicatie terechtkomen, of root kon blijven hangen.
- **Wat is veranderd.** In de hoofdmap van de release zijn alleen gewone bestanden en mappen toegestaan, en dienstwaarden worden zonder koppelingen en in strikte vorm gelezen.
- **Hoort bij:** server-uitrol-05
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### toets-g09-2 · Root kopieerde het resultaat van de weergavecontrole uit een applicatiemap

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Root kopieerde het resultaatbestand van de controle uit een map waarin de applicatie schrijft, op een manier die koppelingen volgt.
- **Wie het kon misbruiken en het gevolg.** Applicatiecode kon root een ander bestand laten schrijven of lezen.
- **Wat is veranderd.** Het bestand wordt één keer zonder koppelingen en met een groottegrens gelezen naar een nieuwe afgesloten kopie van root.
- **Hoort bij:** server-uitrol-02
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

#### toets-g10a-1 · Verkorte parameters ontweken de indeling van terminalopdrachten

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Een verkorte schrijfwijze van lange parameters werd niet als wijzigend herkend.
- **Wie het kon misbruiken en het gevolg.** Een schrijvende opdracht kon als lezen worden voorgesteld.
- **Wat is veranderd.** Lange parameters worden op voorvoegsel vergeleken, gelijk op de site en in de agent.
- **Hoort bij:** server-uitrol-09
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### toets-g10f-1 · Het uitgeven van een SSH-certificaat met passkey mislukte op andere subdomeinen

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De passkeybevestiging voor een certificaat werd alleen vanaf twee dienstadressen aanvaard, maar de pagina liet de uitgifte ook elders starten.
- **Wie het kon misbruiken en het gevolg.** De uitgifte mislukte met een onduidelijke fout.
- **Wat is veranderd.** Vanaf andere adressen weigert de uitgifte meteen en legt uit waarheen te gaan.
- **Hoort bij:** server-uitrol-06
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### eind-6 · De bureaubladtunnel verried nog steeds de toestand van de sessie van de eigenaar

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Na het eerdere herstel verschilde het antwoord van de tunnel aan een anonieme bezoeker nog naargelang er een sessie van de eigenaar wachtte.
- **Wie het kon misbruiken en het gevolg.** Een anonieme bezoeker kon te weten komen of de eigenaar het extern bureaublad gebruikte; toegang gaf dat niet.
- **Wat is veranderd.** Voor ieder die niet heeft aangetoond de eigenaar te zijn, is het antwoord van de tunnel gelijk in inhoud, werk en tijd, ongeacht de toestand van de sessie; de browser van de eigenaar wordt aan een beschermde cookie herkend en staat niet in de gedeelde wachtrij. Dezelfde opbouw voor de opdrachtterminal staat bij eind-16.
- **Hoort bij:** toets-g01-2
- **Test:** [`sec-002-slot-t-20261112.test.ts`](../../tests/eenheid/sec-002-slot-t-20261112.test.ts)

#### toets-g01-5 · Details van een pakketweigering lieten interne serverpaden zien

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Meldingen over een geweigerd pakket bevatten volledige tijdelijke paden en de opdrachtregel.
- **Wie het kon misbruiken en het gevolg.** Wie updates voorbereidt, kreeg informatie over de inrichting van de server.
- **Wat is veranderd.** In de details staan nu een neutrale tweetalige tekst en een foutcode; de volledige tekst gaat alleen naar het dienstlogboek.
- **Hoort bij:** server-uitrol-01
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### toets-g01-6 · De verbinding van de opdrachtterminal was vóór aanmelding zwakker begrensd dan de tunnel

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De WebSocket-verbinding van de opdrachtterminal had dezelfde opbouw als de bureaubladtunnel vóór de patch.
- **Wie het kon misbruiken en het gevolg.** Het risico lijkt op dat van de gerepareerde tunnel; de terminal is alleen bereikbaar als de technische functie aan staat.
- **Wat is veranderd.** De terminal heeft grenzen voor niet-aangemelde verbindingen en dezelfde opbouw als de tunnel gekregen: elke weigering voor een niet-eigenaar is gelijk in inhoud en tijd, ongeacht de sessietoestand van de eigenaar, de eigenaar heeft een eigen pool van plaatsen, en weigeringen worden gelogd en gemeld (zie eind-16).
- **Hoort bij:** server-uitrol-03
- **Test:** [`sec-002-slot-x-20261113.test.ts`](../../tests/eenheid/sec-002-slot-x-20261113.test.ts)

#### toets-g09-4 · Na bevestiging van een release gaf een onderbreking weer een onjuiste melding

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Een onderbreking ná de bevestiging van de nieuwe release meldde dat de vorige actief was.
- **Wie het kon misbruiken en het gevolg.** De eigenaar kreeg een onjuist beeld van de toestand van de site.
- **Wat is veranderd.** De toestand «nieuwe release actief en gecontroleerd, volgende stappen niet afgerond» wordt apart herkend.
- **Hoort bij:** server-uitrol-08
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

### E-mail

#### toets-g10c-1 · Dezelfde fout bij het bepalen van het afzenderadres zat nog op zeven plekken

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Naburige code (inboxregels, zoeken, berichtcontext, AI-bronnen) haalde het adres nog uit de eerste punthaken.
- **Wie het kon misbruiken en het gevolg.** Afzenderregels en het kenmerk «mijn bericht» konden op het bericht van een aanvaller worden toegepast.
- **Wat is veranderd.** Al deze plekken gebruiken nu de gedeelde functie voor het afzenderadres.
- **Hoort bij:** aanv-ronde1-02
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### toets-g11-1 · Zoeken in e-mail kon de server nog steeds lang blokkeren

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Na het verwijderen van de kwadratische expressies bleef een dure vage vergelijking over, en het tijdsbudget werd zelden gecontroleerd.
- **Wie het kon misbruiken en het gevolg.** Eén zoekopdracht kon de server tientallen seconden blokkeren.
- **Wat is veranderd.** De omvang van de vage vergelijking is begrensd, voorrang en budget worden per bericht op tijd gecontroleerd, en de andere weg om de berichtenlijst te tonen geeft ook regelmatig voorrang aan andere verzoeken.
- **Hoort bij:** aanv-gat-c-01
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### toets-g10c-2 · Uitgestelde e-mails hielden geen rekening met de status van de e-mailruimte

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Vóór het versturen van een uitgestelde e-mail werd niet gecontroleerd of e-mail in de technische ruimte uit of bevroren was; weigeringen en annuleringen lieten geen spoor.
- **Wie het kon misbruiken en het gevolg.** E-mails konden vanuit een uitgeschakelde ruimte vertrekken.
- **Wat is veranderd.** De status van de ruimte wordt vóór het versturen gecontroleerd, en weigeringen en massale annuleringen komen in de audit en geven een melding.
- **Hoort bij:** post-10
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### toets-g10g-2 · De tweede laag voor het opschonen van e-mailstijlen was te omzeilen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Verkorte eigenschappen met variabelen en escapes kwamen door de nieuwe opschoonlaag voor stijlen.
- **Wie het kon misbruiken en het gevolg.** Bij een verzwakt inhoudsbeleid kon de browser een bron van de afzender benaderen.
- **Wat is veranderd.** Variabelen en escapes in e-mailstijlen worden verwijderd, en een verdachte stijl gaat er helemaal uit.
- **Hoort bij:** post-07
- **Test:** [`sec-002-g10g-20261112.test.ts`](../../tests/eenheid/sec-002-g10g-20261112.test.ts)

#### toets-g11-3 · De nieuwe adrescontrole weigerde legitieme lange adressen

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De nieuwe controle beperkte het lokale deel van een adres tot 64 tekens, terwijl langere adressen eerder werden aanvaard.
- **Wie het kon misbruiken en het gevolg.** Opgeslagen regels en contacten met zulke adressen werkten niet meer.
- **Wat is veranderd.** De grens op het lokale deel is weg; de algemene lengtegrens houdt het lineair.
- **Hoort bij:** aanv-gat-c-02
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

### Cloudopslag

#### toets-g04-1 · Notities importeren bleef kwadratisch via de kop van het bestand

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Na de eerste patch had het ontleden van de kop van een notitie nog steeds een kwadratische rekentijd.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon met één import de server seconden of langer stilleggen.
- **Wat is veranderd.** De kop wordt ontleed zonder reguliere expressies met herhaling en heeft een groottegrens.
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g04-2 · Zoeken in notities met een extreem lang woord belastte de database

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Zoekwoorden in notities hadden geen lengtegrens, waardoor de vergelijking in de database zeer lang duurde.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon de database bezetten en de site voor iedereen vertragen.
- **Wat is veranderd.** De zoekvraag en elk woord worden ingekort, en zoeken heeft een tijdslimiet met een eigen weigeringscode.
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g04-5 · Elk goedgekeurd account kon een serverfout veroorzaken in de notitieroutes

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Bepaalde ongeldige waarden in notitieverzoeken veroorzaakten steeds een interne serverfout.
- **Wie het kon misbruiken en het gevolg.** Naast het mislukte verzoek telde de automatische zekering voor beveiligingsfuncties zulke fouten mee (zie de aparte vermelding over de zekering).
- **Wat is veranderd.** Alle waarden worden veilig omgezet, ongeldige geven een duidelijke weigering, en resterende storingen worden opgevangen.
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g10d-1 · Een aangekondigde upload zonder gegevens kon bijna de hele schijf reserveren

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De nieuwe boekhouding van «beloofde» bytes liet één aankondiging zonder gegevens de ruimte van alle anderen innemen.
- **Wie het kon misbruiken en het gevolg.** Eén gebruiker kon uploads voor iedereen dagenlang blokkeren.
- **Wat is veranderd.** Aankondigingen van anderen tellen samen hoogstens voor de helft van de vrije ruimte, en sessies zonder gegevens verdwijnen na twee uur.
- **Hoort bij:** wolk-04
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### toets-g10d-2 · Het opslagquotum werd met gelijktijdige uploads omzeild

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Tussen de quotumcontrole en de registratie van de sessie zat een wachtmoment, zodat gelijktijdige uploads samen doorkwamen.
- **Wie het kon misbruiken en het gevolg.** Het quotum per gebruiker kon worden overschreden.
- **Wat is veranderd.** Het quotumbesluit wordt vlak vóór de registratie van de sessie synchroon herhaald.
- **Hoort bij:** wolk-04
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### eind-8 · Het omzetten van HTML en XML naar tekst voor de zoekindex had een kwadratische rekentijd

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Dezelfde soort fout als in de bevindingen over reguliere expressies zat nog in het omzetten van HTML en op XML gebaseerde documenten (docx, odt, pptx) naar tekst voor zoeken.
- **Wie het kon misbruiken en het gevolg.** Een speciaal opgebouwd bestand kon de server bij het indexeren tientallen seconden stilleggen.
- **Wat is veranderd.** Elke stap van het omzetten van HTML en XML is vervangen door een lineaire doorloop met hetzelfde resultaat; het ontleden van xlsx-tabellen is apart hersteld (eind-14).
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-slot-t-20261112.test.ts`](../../tests/eenheid/sec-002-slot-t-20261112.test.ts)

#### eind-9 · Enkele plekken in de nieuwe cloud en de zoekfunctie lazen bestanden zonder groottegrens

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Downloaden, delen, archief, overdracht naar Google Drive en indexeren vertrouwden op de grootte uit het record in plaats van op een echte leesgrens.
- **Wie het kon misbruiken en het gevolg.** Een bestand dat groter is dan opgegeven, kon veel servergeheugen innemen.
- **Wat is veranderd.** Al deze plekken lezen met een expliciete grens en geven bij overschrijding een duidelijke weigering of slaan de inhoud over.
- **Hoort bij:** aanv-ronde1-04
- **Test:** [`sec-002-slot-t-20261112.test.ts`](../../tests/eenheid/sec-002-slot-t-20261112.test.ts), [`sec-002-slot-x-20261113.test.ts`](../../tests/eenheid/sec-002-slot-x-20261113.test.ts)

#### eind-14 · Het ontleden van xlsx-tabellen voor de zoekindex had een kwadratische en slechtere rekentijd

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het lezen van tekst uit xlsx-tabellen voor zoeken gebruikte reguliere expressies waarvan de rekentijd op speciaal opgebouwde inhoud kwadratisch en slechter toenam.
- **Wie het kon misbruiken en het gevolg.** Een speciaal opgebouwde tabel die in het archief weinig ruimte inneemt, kon de server bij het indexeren seconden lang stilleggen.
- **Wat is veranderd.** Elke expressie is vervangen door een lineaire functie met dezelfde treffers in dezelfde volgorde; de grenzen op omvang zijn niet veranderd.
- **Hoort bij:** eind-8
- **Test:** [`sec-002-slot-v-20261113.test.ts`](../../tests/eenheid/sec-002-slot-v-20261113.test.ts)

#### toets-g03-1 · Het verplaatsen van technische foto's liet sporen achter in de persoonlijke fotobibliotheek

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De migratie voor wolk-07 verplaatste alleen cloudrecords; afgeleide rijen in de persoonlijke fotobibliotheek met naam, grootte en miniatuur van het technische bestand bleven staan.
- **Wie het kon misbruiken en het gevolg.** De persoonlijke ruimte zag nog steeds gegevens van technische bestanden en kon ze via de fotodienst lezen.
- **Wat is veranderd.** De migratie is uitgebreid naar de fotobibliotheek en de zoekindex.
- **Hoort bij:** wolk-07
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### toets-g03-4 · Persoonlijke taken en deellinks hielden namen van technische bestanden

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De migratie liet taken en deellinks in de persoonlijke ruimte die naar technische bestanden verwezen, ongemoeid.
- **Wie het kon misbruiken en het gevolg.** Namen van technische bestanden bleven in de persoonlijke ruimte.
- **Wat is veranderd.** De migratie verwijdert zulke taken, trekt zulke links in en verplaatst ze, en schoont gemengde selecties op.
- **Hoort bij:** wolk-07
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### toets-g04-3 · Het voorbeeld van een notitie bleef hangen op bepaalde lijstregels

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het omzetten van lijstregels naar HTML had op bepaalde invoer een kwadratische rekentijd.
- **Wie het kon misbruiken en het gevolg.** Het tabblad van wie de notitie bekeek, bleef hangen.
- **Wat is veranderd.** Het ontleden van lijstregels is lineair gemaakt.
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g04-4 · Verwerkingsstappen voor notities hadden geen grens op de invoergrootte

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Enkele lineaire maar zware verwerkingsstappen voor notities werkten zonder grens op de invoer.
- **Wie het kon misbruiken en het gevolg.** Met grote verzoeken kon de server seconden lang worden vertraagd.
- **Wat is veranderd.** Grenzen voor aantal en grootte worden vóór verwerking gecontroleerd.
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g04-6 · De lengte van notitievelden werd pas na normalisatie gecontroleerd

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De ruwe lengte van titels, labels en tekst werd pas na een zware normalisatie gecontroleerd.
- **Wie het kon misbruiken en het gevolg.** Met grote velden kon de server worden vertraagd.
- **Wat is veranderd.** De ruwe lengte wordt vóór normalisatie gecontroleerd.
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g10d-5 · Naburige cloudroutes hadden dezelfde fouten

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een deel van de routes buiten de patch gaf ruwe fouttekst terug, werkte zonder de vlag van de nieuwe cloud of leverde een bestand met zijn ruwe inhoudstype.
- **Wie het kon misbruiken en het gevolg.** Restrisico's op het lekken van dienstinformatie en op opgeslagen XSS op het hoofddomein.
- **Wat is veranderd.** De MCP-console geeft geen ruwe fouten meer terug; de oude route om een bestand te openen levert alleen een veilig inhoudstype (actieve typen als binair, XML als tekst); de beheerroutes voor delen antwoorden zonder de vlag van de nieuwe cloud «niet gevonden».
- **Hoort bij:** wolk-09
- **Test:** [`sec-002-afwerking-a-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-a-20261112.test.ts)

#### toets-g11-2 · Het terugdraaien van een cloudlade-overdracht was onvolledig

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Een storing na het verplaatsen van bestanden maar vóór het bijwerken van records werd niet teruggedraaid.
- **Wie het kon misbruiken en het gevolg.** Records en bestanden konden uit elkaar lopen.
- **Wat is veranderd.** Paden en records worden in één transactie met terugdraaien bijgewerkt.
- **Hoort bij:** aanv-ronde1-08
- **Test:** [`sec-002-g11-20261112.test.ts`](../../tests/eenheid/sec-002-g11-20261112.test.ts)

#### toets-m3-regex · Een kwadratische expressie in de laag voor externe opslag bij overdrachten

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Eén reguliere expressie in de laag voor het koppelen van externe opslag bij bestandsoverdrachten heeft op bepaalde invoer een kwadratische rekentijd.
- **Wie het kon misbruiken en het gevolg.** Een gebruiker met zo'n koppeling kon de server vertragen.
- **Wat is veranderd.** De herhalingen in de expressie zijn begrensd, waardoor de rekentijd op vijandige invoer van honderden naar enkele milliseconden is gedaald.
- **Test:** [`sec-002-afwerking-a-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-a-20261112.test.ts)

### Integraties

#### toets-g02-3 · Na de overstap op uitnodigingen kon via de site geen woningdeelnemer meer worden toegevoegd

_Ernst: hoog · Status: opgelost · Regressie door de patch · Aangetoond met een codecontrole, zonder test die vóór de patch faalt_

- **Wat er mis was.** De server ging over op uitnodigingen, maar de interface kon die nog niet versturen, tonen of aannemen.
- **Wie het kon misbruiken en het gevolg.** Het legitieme gebruik van een gedeelde woning werkte niet.
- **Wat is veranderd.** De interface kan nu uitnodigingen versturen, intrekken, aannemen en afwijzen, ook op het startscherm.
- **Hoort bij:** integraties-09
- **Test:** [`sec-002-afwerking-b-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-b-20261112.test.ts)

#### toets-g02-1 · Inkorten van apparaatnamen brak tekens en liet de synchronisatie van de woning mislukken

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De nieuwe lengtegrens voor tekst van de domoticaserver kon een emoji doormidden knippen, waarna de database de hele synchronisatie weigerde.
- **Wie het kon misbruiken en het gevolg.** Eén ongewone apparaatnaam stopte de synchronisatie van de hele woning.
- **Wat is veranderd.** Inkorten breekt geen tekens meer, en alle tekst wordt vóór het opslaan opgeschoond.
- **Hoort bij:** integraties-05
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g02-2 · De nieuwe grens op het aantal apparaten markeerde werkende apparaten als onbereikbaar

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** De grens op het aantal apparaten bij het zoeken liet een deel van de al geïmporteerde apparaten vallen, waarna de synchronisatie ze als verdwenen zag.
- **Wie het kon misbruiken en het gevolg.** Werkende apparaten stonden als «offline».
- **Wat is veranderd.** Bestaande en gekozen apparaten tellen eerst mee, en alleen een apparaat dat de bron echt niet noemt, geldt als verdwenen.
- **Hoort bij:** integraties-05
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g02-5 · Een apparaatopdracht kon voorgoed «verzonden» blijven

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Een mislukte statusregistratie na een opdracht liet die in een tussenstand staan en gaf een serverfout.
- **Wie het kon misbruiken en het gevolg.** De gebruiker zag het resultaat niet en de pagina toonde een fout.
- **Wat is veranderd.** Het vastleggen van de waarneming is afgeschermd, en de opdracht wordt na de deadline met een duidelijke status afgesloten.
- **Hoort bij:** integraties-05
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g08-1 · De grens op agenda-afspraken was te omzeilen met een fout in het laatste verzoek

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het inkorten van de agendaspiegel gebeurde alleen na een ronde zonder fouten, en die fout kon de externe server zelf veroorzaken.
- **Wie het kon misbruiken en het gevolg.** Een gebruiker met een eigen agendaserver kon een onbeperkt aantal afspraken in de database ophopen.
- **Wat is veranderd.** Na elke ronde worden overtollige rijen opgeruimd en blijft het werkelijke aantal binnen de grens.
- **Hoort bij:** integraties-07
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### toets-g10f-2 · Een tijdelijke storing bij een webhook schakelde de GitHub-integratie voorgoed uit

_Ernst: middel · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Het nieuwe besluit «integratie ontkoppeld» steunde op functies die fouten inslikken, zodat een korte databasestoring of een gesloten sleutelkluis de webhook liet verwijderen.
- **Wie het kon misbruiken en het gevolg.** De integratie stopte stil.
- **Wat is veranderd.** Het besluit kent drie toestanden — open, dicht, onbekend; bij onbekend blijft de webhook ongemoeid en wordt de levering herhaald.
- **Hoort bij:** integraties-13
- **Test:** [`github-webhook-na-ontkoppelen-20261112.test.ts`](../../tests/eenheid/github-webhook-na-ontkoppelen-20261112.test.ts)

#### toets-g02-7 · Een bezette domoticaserver «at» een goedgekeurd AI-voorstel op

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Was de domoticaserver bezet tijdens het goedkeuren van een AI-voorstel, dan stond het voorstel als goedgekeurd terwijl de opdracht niet werd verstuurd en niet kon worden herhaald.
- **Wie het kon misbruiken en het gevolg.** De opdracht ging stil verloren.
- **Wat is veranderd.** Het voorstel blijft wachten, en de sleutel van de opdracht blijft vrij voor een herhaling.
- **Hoort bij:** integraties-05
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g02-8 · Een gast met alleen bekijkrechten kon de sleutel van een toekomstige opdracht vooraf bezetten

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De voorspelbare idempotentiesleutel van een AI-voorstel kon worden gebruikt door een deelnemer zonder schrijfrecht.
- **Wie het kon misbruiken en het gevolg.** Een gast kon een opdracht hinderen die de eigenaar zou goedkeuren.
- **Wat is veranderd.** Zulke sleutels worden alleen van AI-voorstellen aanvaard, en de weigering van een gast wordt onder een willekeurige sleutel vastgelegd.
- **Hoort bij:** integraties-05
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g02-9 · Een stuurteken in een uitnodigingsadres gaf een serverfout

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een adres met een stuurteken veroorzaakte een databasefout en telde toch mee voor de grens; woninggebeurtenissen waren alleen in het Nederlands.
- **Wie het kon misbruiken en het gevolg.** Een kleine fout in robuustheid en taal.
- **Wat is veranderd.** Stuurtekens worden vóór de grens geweigerd, en gebeurtenissen worden tweetalig vastgelegd.
- **Hoort bij:** integraties-09
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g02-10 · Het herhalen van een al uitgevoerde opdracht tijdens drukte gaf onterecht «niet verzonden»

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Een herhaling met dezelfde sleutel terwijl de domoticaserver bezet was, gaf een weigering, hoewel de opdracht al was uitgevoerd.
- **Wie het kon misbruiken en het gevolg.** Scènes konden als mislukt worden gemarkeerd.
- **Wat is veranderd.** Een bestaande opdracht met dezelfde sleutel wordt teruggegeven zonder de domoticaserver te benaderen.
- **Hoort bij:** integraties-05
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g08-2 · Gelijktijdige agendasynchronisaties omzeilden de grens op afspraken

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Twee gelijktijdige synchronisatierondes van hetzelfde account telden en kortten alleen hun eigen rijen in.
- **Wie het kon misbruiken en het gevolg.** De grens op het aantal afspraken kon worden overschreden.
- **Wat is veranderd.** Een synchronisatieronde legt atomair beslag op het account, en vervangingen van één bron gebeuren na elkaar.
- **Hoort bij:** integraties-07
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### toets-g10f-3 · Hulpmiddelen van het agenttoken gaven kaarten van derden zonder markering

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een andere weg naar hetzelfde bord — de consolehulpmiddelen voor agenten — gaf titel en tekst van kaarten van derden als gewone inhoud.
- **Wie het kon misbruiken en het gevolg.** Tekst van derden kon op de AI werken als instructie.
- **Wat is veranderd.** Zulke kaarten gaan door dezelfde verpakking voor niet-vertrouwde inhoud.
- **Hoort bij:** integraties-08
- **Test:** [`github-webhook-na-ontkoppelen-20261112.test.ts`](../../tests/eenheid/github-webhook-na-ontkoppelen-20261112.test.ts)

### Gebruikersinterface

#### eind-5 · Een weigering «alleen bekijken» buiten de cloud toonde een ruwe code

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering voor de rol «alleen bekijken» had alleen in de cloud uitleg; andere onderdelen toonden een technische code, en er was geen melding.
- **Wie het kon misbruiken en het gevolg.** Iemand begreep niet waarom de actie niet werd uitgevoerd, en de accounteigenaar zag geen pogingen om gegevens te wijzigen.
- **Wat is veranderd.** Eén tweetalige uitlegtabel voor alle onderdelen en een eigen meldingssoort, hoogstens eens per uur.
- **Hoort bij:** autorisatie-08
- **Test:** [`sec-002-slot-u-20261112.test.ts`](../../tests/eenheid/sec-002-slot-u-20261112.test.ts)

#### toets-g10a-4 · Een AI-cliënt kon zich voordoen als een actie van de site zelf

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het nieuwe veld «wie vraagt» toonde een cliënt met een bepaalde zelfgekozen naam als «U (vanaf de site)».
- **Wie het kon misbruiken en het gevolg.** Iemand kon een AI-verzoek goedkeuren in de veronderstelling dat het een eigen actie was.
- **Wat is veranderd.** Een cliëntnaam wordt nooit een sitemarkering; zulke namen krijgen het voorvoegsel «AI», en een lege naam verschijnt als onbekende cliënt met waarschuwing.
- **Hoort bij:** interface-02
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### eind-11 · Nieuwe weigeringscodes hadden geen tekst, audit of melding

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een deel van de nieuwe weigeringen in deze release (verzoek niet in JSON, toestemming uit een andere browser, auditlogboek onbeschikbaar, nulteken in de invoer en andere) verscheen als ruwe code, en sommige lieten geen spoor.
- **Wie het kon misbruiken en het gevolg.** Iemand zag een onduidelijke of onjuiste oorzaak, en de eigenaar hoorde niet van pogingen.
- **Wat is veranderd.** Alle nieuwe codes hebben nu een tweetalige uitleg met advies, en weigeringen die op een omzeilingspoging wijzen worden gelogd en gemeld binnen een vaste grens.
- **Test:** [`sec-002-slot-u-20261112.test.ts`](../../tests/eenheid/sec-002-slot-u-20261112.test.ts)

#### eind-15 · Op de pagina van de geheimenkluis ging de vooraf gekozen soort geheim uit de link verloren

_Ernst: laag · Status: opgelost · Oude fout uit de basis, zonder beveiligingsgevolg_

- **Wat er mis was.** Een link die de geheimenkluis opent met een al gekozen soort geheim werkte niet: een ander mechanisme van de pagina haalde die parameter uit het adres voordat het formulier hem kon lezen. De fout zat al in de basis, vóór de patches van SEC-002.
- **Wie het kon misbruiken en het gevolg.** Iemand kwam bij een andere soort geheim uit dan verwacht; de beveiliging werd er niet door geraakt.
- **Wat is veranderd.** Het mechanisme voor zoekdoelen neemt nu alleen waarden in zijn eigen vorm, en de soort geheim blijft voor het formulier, dat nog steeds alleen bekende soorten aanvaardt.
- **Test:** [`ai-kluis-een-plek-20261101.test.ts`](../../tests/eenheid/ai-kluis-een-plek-20261101.test.ts)

#### toets-g10f-5 · Teksten in het AI-hulpmiddelenpaneel beschreven het teken «!» onjuist

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De uitleg in het paneel klopte na de patch niet met het nieuwe gedrag van risicovolle hulpmiddelen.
- **Wie het kon misbruiken en het gevolg.** Iemand kon verkeerd inschatten wat hij inschakelde.
- **Wat is veranderd.** De teksten zijn in beide talen verbeterd.
- **Hoort bij:** interface-03
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

### Browserextensie

#### toets-g10a-2 · Andere knoppen die de AI rechten geven, bleven klikbaar voor de AI

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De bescherming tegen AI-klikken dekte maar een deel van de elementen; rechtensets, bevestigingen, toegangen en AI-schakelaars op andere pagina's bleven open.
- **Wie het kon misbruiken en het gevolg.** Een AI met het recht «Klikken en typen» kon zichzelf meer toegang geven.
- **Wat is veranderd.** De extensie handelt niet in deze zones, knoppen reageren alleen op handelingen van een mens, en het toekennen van rechten vereist een verse bevestiging.
- **Hoort bij:** extensie-02
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### toets-g06-1 · Technische toegang werd verlengd met een sterke bevestiging van vóór het openen

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De regel «bevestiging na het openen» voor technische toegang keek naar het tijdstip van een gewone bevestiging, terwijl de sterke ouder kon zijn.
- **Wie het kon misbruiken en het gevolg.** Een oude sterke bevestiging kon worden gebruikt om technische toegang te verlengen.
- **Wat is veranderd.** Voor technische toegang moet juist de sterke bevestiging nieuwer zijn dan het openen.
- **Hoort bij:** extensie-05
- **Test:** [`sec-002-g06-20261112.test.ts`](../../tests/eenheid/sec-002-g06-20261112.test.ts)

#### toets-g10a-3 · Andere eenmalige geheimen op pagina's kwamen in de momentopname voor de AI

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De bescherming dekte alleen de koppelcode van een apparaat; tokens, toegangscodes, API-sleutels, geheimen van de verificatie-app en herstelcodes bleven zichtbaar voor de AI.
- **Wie het kon misbruiken en het gevolg.** Een AI die pagina's mag lezen, kon zo'n geheim krijgen.
- **Wat is veranderd.** Al zulke blokken zijn voor de AI verborgen en uit momentopnamen en schermafbeeldingen weggelaten.
- **Hoort bij:** extensie-09
- **Test:** [`sec-002-g10a-20261112.test.ts`](../../tests/eenheid/sec-002-g10a-20261112.test.ts)

#### toets-g05-2 · De wachtrij voor Google Drive-voorbeelden was oneerlijk tussen gebruikers

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het nieuwe geheugenbudget voor voorbeelden liet één gebruiker telkens de vrijgekomen ruimte innemen.
- **Wie het kon misbruiken en het gevolg.** Eén gebruiker kon anderen lange tijd verhinderen grote bestanden te bekijken.
- **Wat is veranderd.** De wachtrij helpt eerst wie lang geen beurt had, en een wachtend groot bestand krijgt een reservering.
- **Hoort bij:** extensie-07
- **Test:** [`sec-002-g05-20261112.test.ts`](../../tests/eenheid/sec-002-g05-20261112.test.ts)

#### toets-g06-2 · Eén bevestiging gaf meerdere gelijktijdige verruimingen van toegang

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Tussen het controleren en het verbruiken van een bevestiging was er geen atomiciteit, zodat gelijktijdige verzoeken één bevestiging deelden.
- **Wie het kon misbruiken en het gevolg.** Eén bevestiging kon het beleid meerdere keren verruimen.
- **Wat is veranderd.** Voor alle modules met extra bevestiging is er een gedeelde functie «controleren en verbruiken» in één stap onder vergrendeling; een mislukte actie geeft de bevestiging terug.
- **Hoort bij:** extensie-05
- **Test:** [`sec-002-afwerking-a-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-a-20261112.test.ts)

### Toeleveringsketen en configuratie

#### eind-1 · Het vernieuwen van de eigen sessie kon de zekering de aanmeldbeveiliging laten uitschakelen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De route voor het vernieuwen van een sessie markeerde de sessie niet als gecontroleerd, zodat bij ingeschakelde aanmeldbeveiliging legitieme antwoorden als weigeringen van die beveiliging telden, en enkele daarvan de automatische uitschakeling startten.
- **Wie het kon misbruiken en het gevolg.** Elke deelnemer kon met enkele vernieuwingen van de eigen sessie de net ingeschakelde aanmeldbeveiliging voor de hele site uitschakelen; ook het vernieuwen zelf werkte niet bij ingeschakelde beveiliging.
- **Wat is veranderd.** Na een volledige controle markeert het vernieuwen de sessie als gecontroleerd, en de zekering schakelt de beveiliging alleen uit bij weigeringen op meerdere verschillende routes.
- **Hoort bij:** toets-zekering
- **Test:** [`sec-002-slot-s-20261112.test.ts`](../../tests/eenheid/sec-002-slot-s-20261112.test.ts)

#### toets-zekering · De automatische zekering kon beveiligingsfuncties van de site zelf uitschakelen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** De zekering die net ingeschakelde beveiligingsfuncties bij storingen uitzet, telde alle interne serverfouten mee, ook die een gewone gebruiker opzettelijk kan veroorzaken.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon in theorie een beveiligingsfunctie laten uitschakelen die de eigenaar net had aangezet.
- **Wat is veranderd.** De zekering schakelt een beveiligingsfunctie alleen automatisch uit op signalen van die functie zelf; een algemene piek van fouten levert de eigenaar een voorstel tot controle op, geen uitschakeling.
- **Test:** [`sec-002-afwerking-a-20261112.test.ts`](../../tests/eenheid/sec-002-afwerking-a-20261112.test.ts)

#### toets-g07-1 · Een te verre einddatum van de noodschakelaar schakelde bevestigingen later stil uit

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De grens van 24 uur werd vanaf het huidige moment gerekend, zodat een waarde die eerst als te ver werd geweigerd, enkele uren later zonder nieuwe waarschuwing geldig werd.
- **Wie het kon misbruiken en het gevolg.** Extra aanmeldbevestigingen konden ongemerkt uitgaan.
- **Wat is veranderd.** De grens telt vanaf het eerste moment dat het proces de waarde zag; een te verre waarde blijft ongeldig.
- **Hoort bij:** aanv-gat-a-04
- **Test:** [`sec-002-g07-20261112.test.ts`](../../tests/eenheid/sec-002-g07-20261112.test.ts)

#### eind-12 · De audit van de e-mailclassificatie faalde tijdens de build

_Ernst: laag · Status: opgelost · Regressie door de patch_

- **Wat er mis was.** Na de patch importeert de e-mailclassificatie de gedeelde module voor het afzenderadres, maar het controlescript tijdens de build kon die niet laden.
- **Wie het kon misbruiken en het gevolg.** De releasebuild stopte.
- **Wat is veranderd.** Het controlescript laadt gedeelde modules met een eigen lader; de controle van de classificatie draait weer tijdens de build.
- **Hoort bij:** aanv-ronde1-02
- **Test:** [`mail-slimme-inbox-audit.mjs`](../../scripts/mail-slimme-inbox-audit.mjs)

#### toets-g01-3 · In oude werkprocessen stond de schrijfsleutel naast code van afhankelijkheden

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** In een deel van de oude GitHub-processen draaide de stap met de schrijfsleutel in dezelfde taak als het installeren van afhankelijkheden en de build.
- **Wie het kon misbruiken en het gevolg.** Een gecompromitteerde afhankelijkheid kon tijdens de build de schrijfsleutel voor de repository gebruiken.
- **Wat is veranderd.** Deze processen zijn gesplitst in een build zonder sleutel en een aparte publicatietaak die geen code uit de repository uitvoert en het overgedragen werk controleert.
- **Hoort bij:** keten-config-07
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### toets-g01-8 · De releasebeschrijving kon onjuiste testaantallen tonen

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Na de patch werd het testaantal gemeten, maar de toelichting hield vooraf ingevulde getallen, en één testbestand kon dubbel worden geteld.
- **Wie het kon misbruiken en het gevolg.** De releasebeschrijving kon misleiden over de controleresultaten.
- **Wat is veranderd.** De toelichting komt uit de gemeten lijst, en elk testbestand telt één keer.
- **Hoort bij:** keten-config-07
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### toets-g01-9 · Drie nieuwe werkprocessen hadden hetzelfde rechtenprobleem

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Drie releaseprocessen uit de nieuwe basis hadden schrijfrecht voor het hele proces, de sleutel in alle stappen en niet-vastgezette acties.
- **Wie het kon misbruiken en het gevolg.** Hetzelfde als bij keten-config-07.
- **Wat is veranderd.** Volgens hetzelfde patroon omgebouwd: aparte publicatietaak, vastgezette acties, gemeten testaantallen.
- **Hoort bij:** keten-config-07
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### toets-g09-5 · De thuismap van de buildgebruiker bleef tussen builds bewaard

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Een vaste thuismap van de afgeschermde buildgebruiker liet een kwaadaardige afhankelijkheid instellingen voor volgende builds achterlaten.
- **Wie het kon misbruiken en het gevolg.** Een kwaadaardige afhankelijkheid kon zich tussen updates vastzetten.
- **Wat is veranderd.** De build gebruikt elke keer een lege tijdelijke thuismap en negeert gebruikersinstellingen van npm.
- **Hoort bij:** keten-config-06
- **Test:** [`sec-002-g09-20261112.test.ts`](../../tests/eenheid/sec-002-g09-20261112.test.ts)

### Privacy en logboeken

#### toets-g10b-4 · Het nieuwe wisplan kon accounts met een bepaalde geschiedenis niet wissen

_Ernst: hoog · Status: opgelost_

- **Wat er mis was.** Externe sleutels zonder trapsgewijs verwijderen lieten de hele wistransactie mislukken, waardoor zo'n account helemaal niet werd gewist.
- **Wie het kon misbruiken en het gevolg.** Gegevens van sommige personen bleven voorgoed staan — erger dan vóór de patch.
- **Wat is veranderd.** Het plan verwijdert eerst afhankelijke rijen; mislukkingen worden geteld, gelogd en aan de site-eigenaar gemeld, en kandidaten zijn geordend.
- **Hoort bij:** privacy-logboek-01
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### eind-17 · Het verwijderen van een account liet gegevens van de persoon in een deel van de tabellen staan

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Het plan voor het verwijderen van een account dekte woninguitnodigingen en de lijst ontvangers van deellinks niet; de fout zat al in de basis, vóór de patches van SEC-002.
- **Wie het kon misbruiken en het gevolg.** Na verwijdering bleef een deel van de gegevens van de persoon op de server, en als de geadresseerde van een uitnodiging met een gewone verwijdering zou worden opgeruimd, kon de eigenaar van de woning daaruit afleiden dat bij het adres een account hoorde.
- **Wat is veranderd.** Uitnodigingen die de persoon verstuurde worden verwijderd, en als geadresseerde of ontvanger wordt de persoon onopvallend losgekoppeld van uitnodigingen en links van anderen, zonder rijen van anderen te raken; een test controleert dat het plan alle tabellen dekt. Bewust ongewijzigd blijven het beveiligingsauditlogboek, het logboek van toegangswijzigingen en de vrije tekst van meldingen aan de site-eigenaar: die zijn nodig voor onderzoek en hebben een eigen bewaartermijn.
- **Hoort bij:** privacy-logboek-01
- **Test:** [`account-wissen-db-20261113.test.ts`](../../tests/eenheid/account-wissen-db-20261113.test.ts), [`account-wissen-20261026.test.ts`](../../tests/eenheid/account-wissen-20261026.test.ts)

#### toets-g02-6 · Weigeringen en wijzigingen in woningdeelnemers lieten geen spoor achter

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** Nieuwe weigeringen door grenzen en wijzigingen in deelnemers kwamen niet in het auditlogboek, en een bereikte grens leverde niemand een melding op.
- **Wie het kon misbruiken en het gevolg.** De eigenaar van een woning zag niet wie wanneer de deelnemers wijzigde.
- **Wat is veranderd.** Er zijn auditregels voor uitnodigen, aannemen, rolwijziging, verwijderen van een deelnemer en weigeringen, plus een melding bij een bereikte grens.
- **Hoort bij:** integraties-09
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g10b-3 · Het openen van de sleutelkluis met een herstelcode gaf geen melding meer

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De nieuwe ontgrendelroute omzeilde de melding «geopend met herstelcode», en nieuwe acties gaven helemaal geen melding.
- **Wie het kon misbruiken en het gevolg.** De eigenaar zou niet merken dat de kluis met een herstelcode was geopend.
- **Wat is veranderd.** Er komen meldingen bij openen met een code, bij het bevestigen van een nieuwe code en bij het resetten van de kluis.
- **Hoort bij:** geheimen-04
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### toets-g10d-3 · Een weigering van een technisch token bij een uitgeschakeld profiel liet geen auditregel achter

_Ernst: middel · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering van een technisch token kwam alleen in het consolelogboek, niet in het auditlogboek.
- **Wie het kon misbruiken en het gevolg.** Pogingen om een technisch token na het uitschakelen van het profiel te gebruiken, bleven buiten de audit.
- **Wat is veranderd.** De weigering komt in het auditlogboek met kenmerken van cliënt en ruimte.
- **Hoort bij:** ai-mcp-06
- **Test:** [`sec-002-g10d-20261112.test.ts`](../../tests/eenheid/sec-002-g10d-20261112.test.ts)

#### eind-18 · De id van de persoon bleef in het gebeurtenissenlogboek van een andere woning en in een gedeelde functievlag

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Na het verwijderen van een account bleef de id van de persoon in het gebeurtenissenlogboek van een woning waar die deelnemer was, en in de instellingen van een gedeelde functievlag; de fout zat al in de basis.
- **Wie het kon misbruiken en het gevolg.** Een achtergebleven id van de verwijderde persoon bleef in gegevens van anderen bewaard.
- **Wat is veranderd.** De gebeurtenis in het woninglogboek blijft bestaan, maar de id van de persoon wordt eruit en uit de gedeelde vlag verwijderd. Bewust ongewijzigd blijven het beveiligingsauditlogboek, het logboek van toegangswijzigingen en de vrije tekst van meldingen aan de site-eigenaar: die zijn nodig voor onderzoek en hebben een eigen bewaartermijn.
- **Hoort bij:** privacy-logboek-01
- **Test:** [`account-wissen-db-20261113.test.ts`](../../tests/eenheid/account-wissen-db-20261113.test.ts), [`account-wissen-20261026.test.ts`](../../tests/eenheid/account-wissen-20261026.test.ts)

#### toets-g01-4 · Weigeringen van de bureaubladtunnel lieten geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Nieuwe weigeringen en verbroken tunnelverbindingen kwamen niet in het auditlogboek en niet in de meldingen.
- **Wie het kon misbruiken en het gevolg.** De eigenaar hoorde niet van pogingen om met zijn extern bureaublad te verbinden.
- **Wat is veranderd.** Elke weigering komt in het auditlogboek, en de eigenaar van een open sessie krijgt hoogstens eens per minuut een melding.
- **Hoort bij:** server-uitrol-03
- **Test:** [`sec-002-g01-20261112.test.ts`](../../tests/eenheid/sec-002-g01-20261112.test.ts)

#### toets-g02-11 · Een deelnemer kon de woning niet zelf verlaten

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Na de overstap op toestemming kon een deelnemer die niet intrekken, en lidmaatschappen die vóór de patch zonder toestemming waren ontstaan, bleven bestaan.
- **Wie het kon misbruiken en het gevolg.** Iemand kon de toegang van een andere woning tot het eigen account niet beëindigen.
- **Wat is veranderd.** Er is een actie «Woning verlaten» met een regel in het logboek van de eigenaar.
- **Hoort bij:** integraties-09
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

#### toets-g03-3 · Weigeringen voor de rol «alleen bekijken» in de cloud lieten geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Nieuwe schrijfweigeringen voor de rol «alleen bekijken» kwamen niet in het auditlogboek van de cloud.
- **Wie het kon misbruiken en het gevolg.** Schrijfpogingen bleven onopgemerkt.
- **Wat is veranderd.** Elke weigering schrijft een regel in het auditlogboek van de cloud, zonder verzoekgegevens en met een frequentiegrens.
- **Hoort bij:** wolk-08
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### toets-g03-5 · Het weigeren van een te groot bestand liet geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering om een te groot bestand in de cloud te openen, kwam niet in het auditlogboek.
- **Wie het kon misbruiken en het gevolg.** Herhaalde pogingen om de server met grote bestanden te belasten bleven onopgemerkt.
- **Wat is veranderd.** De weigering komt in het auditlogboek van de cloud met de werkelijke grootte, zonder inhoud en met een frequentiegrens.
- **Hoort bij:** aanv-ronde1-04
- **Test:** [`sec-002-g03-20261112.test.ts`](../../tests/eenheid/sec-002-g03-20261112.test.ts)

#### toets-g04-7 · De weigering «zoeken te zwaar» liet geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering door de tijdslimiet bij zoeken kwam niet in het logboek en gaf geen melding.
- **Wie het kon misbruiken en het gevolg.** Herhaalde belasting van de database bleef onopgemerkt.
- **Wat is veranderd.** Een auditregel zonder de zoektekst en een melding aan de eigenaar, hoogstens eens per uur.
- **Hoort bij:** wolk-01
- **Test:** [`sec-002-g04-20261112.test.ts`](../../tests/eenheid/sec-002-g04-20261112.test.ts)

#### toets-g08-3 · Nieuwe agendaweigeringen lieten geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Frequentiegrenzen, het inkorten van een agenda en ongeldige antwoorden van een externe server kwamen niet in het logboek en gaven geen melding.
- **Wie het kon misbruiken en het gevolg.** Gebruiker en eigenaar zagen niet dat de synchronisatie was begrensd.
- **Wat is veranderd.** Er zijn auditregels en tweetalige meldingen; in het logboek komt alleen de host van de externe server, zonder pad en inloggegevens.
- **Hoort bij:** integraties-07
- **Test:** [`sec-002-g08-20261112.test.ts`](../../tests/eenheid/sec-002-g08-20261112.test.ts)

#### toets-g10b-7 · Een weigering van «Probleem melden» door de grens liet geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering door de grens kwam niet in het logboek, en de persoon zag een ruwe code.
- **Wie het kon misbruiken en het gevolg.** Pogingen om de lijst te overspoelen bleven onopgemerkt.
- **Wat is veranderd.** De eerste weigering per venster komt in de audit, en de persoon ziet een tweetalige uitleg met wachttijd.
- **Hoort bij:** privacy-logboek-07
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### toets-g10c-3 · Een weigering door onbekende status van AI-schakelaars liet geen spoor achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering wanneer de status van AI-schakelaars niet te lezen is, kwam niet in het auditlogboek.
- **Wie het kon misbruiken en het gevolg.** De eigenaar zag niet dat de AI door een storing werd geweigerd.
- **Wat is veranderd.** De weigering komt in het auditlogboek, net als naburige weigeringen.
- **Hoort bij:** ai-mcp-13
- **Test:** [`sec-002-g10c-20261112.test.ts`](../../tests/eenheid/sec-002-g10c-20261112.test.ts)

#### toets-g10f-4 · Uitgifte en intrekking van een privé AI-token kwamen niet in de privéstroom

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** Het sferenfilter beschouwde alle acties met consoletokens als technisch.
- **Wie het kon misbruiken en het gevolg.** Iemand zag in de persoonlijke stroom niet dat er een AI-token voor hem was uitgegeven.
- **Wat is veranderd.** Acties met privétokens komen in de privéstroom, technische blijven technisch.
- **Hoort bij:** privacy-logboek-03
- **Test:** [`sec-002-g10f-20261112.test.ts`](../../tests/eenheid/sec-002-g10f-20261112.test.ts)

#### toets-g10i-2 · Een weigering op het directe adres van een AI-token liet geen auditregel achter

_Ernst: laag · Status: opgelost_

- **Wat er mis was.** De nieuwe weigering door een uitgeschakelde agent of verbindingswijze op het directe tokenadres kwam niet in het auditlogboek.
- **Wie het kon misbruiken en het gevolg.** Pogingen van een uitgeschakelde AI bleven buiten de audit.
- **Wat is veranderd.** De weigering komt in het auditlogboek.
- **Hoort bij:** ai-mcp-05
- **Test:** [`sec-002-g10i-20261112.test.ts`](../../tests/eenheid/sec-002-g10i-20261112.test.ts)

## Weerlegde bevindingen

Geen enkele bevinding is volledig weerlegd: elke bevinding is op de code van vóór de patch bevestigd — meestal met een test die de fout aantoont, een deel van het interfaceherstel met een controle van de code (zulke vermeldingen zijn gemarkeerd). Alleen enkele onderdelen van voorstellen zijn weerlegd:

- **autorisatie-09** — Het onderdeel over het overdragen van een sessie is weerlegd: die route weigerde niet-goedgekeurde accounts al voor alle diensten, behalve het wachtscherm voor goedkeuring, zoals bedoeld.
- **interface-05** — Twee onderdelen van het voorstel zijn bewust niet uitgevoerd: de hint «sessie bekend» in de vensternaam geeft geen gegevens (die bepaalt de server), en opschonen vóór navigatie is niet nodig omdat de weergavecache daar niet meer wordt geschreven.

## Gedeeltelijk opgelost en uitgesteld

Hier staat alleen de algemene kern van wat overblijft en wat u tot de volgende release kunt doen; details die een aanval zouden vergemakkelijken, zijn bewust weggelaten.

#### ai-mcp-14 · Het toestemmingsverzoek voor een AI-koppeling was niet aan de browser gebonden en de lijst met terugkeeradressen was te ruim

_Ernst: laag · Status: gedeeltelijk opgelost_

- **Wat er mis was.** Het toestemmingsvenster voor een AI-koppeling kon in een andere browser worden geopend dan die waarin de koppeling was gestart, en de toegestane terugkeeradressen omvatten alle subdomeinen en paden van enkele externe domeinen.
- **Wie het kon misbruiken en het gevolg.** Onder bepaalde extra omstandigheden aan de kant van zo'n extern domein kon iemand ertoe worden verleid een koppeling te bevestigen die in werkelijkheid van een aanvaller was.
- **Wat is veranderd.** Het toestemmingsverzoek is gebonden aan de browser die de autorisatie begon (op de site en op de serverdeur), en het toestemmingsvenster toont het volledige terugkeeradres.
- **Wat overblijft en wat te doen.** De lijst toegestane terugkeeradressen voor bekende AI-cliënten is nog ruimer dan nodig: verkleinen vraagt een besluit van de eigenaar om koppelingen niet te breken. Bevestig een AI-koppeling alleen als u die zelf net bent begonnen, en controleer het terugkeeradres in het toestemmingsvenster.
- **Test:** [`sec-002-g10e-20261112.test.ts`](../../tests/eenheid/sec-002-g10e-20261112.test.ts)

#### geheimen-07 · Er was geen manier om versleutelingssleutels te roteren

_Ernst: laag · Status: gedeeltelijk opgelost_

- **Wat er mis was.** De versleutelingssleutels van de server hadden één vaste versie, en de gegevenssleutel van een gebruiker veranderde nooit.
- **Wie het kon misbruiken en het gevolg.** Na een lek van servergeheimen of van een oude herstelcode kon de eigenaar de sleutel niet vervangen zonder gegevens en koppelingen te verliezen: de oude sleutel ontsleutelde zowel oude als nieuwe gegevens.
- **Wat is veranderd.** Er zijn versies van serversleutels ingevoerd: nieuwe records worden met de nieuwste ingestelde versie verzegeld, oude worden met hun eigen versie gelezen, en het sleutelregister beschrijft de rotatieprocedure.
- **Wat overblijft en wat te doen.** Het massaal opnieuw verzegelen van oude records met een nieuwe sleutelversie en het vervangen van de gegevenssleutel van gebruikers zijn nog niet gedaan. Verwijder na het toevoegen van een nieuwe sleutelversie geen oude, en plan een volledige rotatie met de volgende release.
- **Test:** [`sec-002-g10b-20261112.test.ts`](../../tests/eenheid/sec-002-g10b-20261112.test.ts)

#### toets-g02-4 · Delen van een ruimte verried of er een account bij een adres hoort

_Ernst: middel · Status: gedeeltelijk opgelost_

- **Wat er mis was.** Toegang geven tot een werkruimte via een adres antwoordde anders voor bestaande en onbekende accounts en had geen grens.
- **Wie het kon misbruiken en het gevolg.** Een goedgekeurde gebruiker kon nagaan welke adressen op de site geregistreerd zijn.
- **Wat is veranderd.** Het antwoord is gelijk, er geldt een uurgrens met logregel en melding, en ongeldige tekens worden geweigerd.
- **Wat overblijft en wat te doen.** Lidmaatschap van een werkruimte pas na aanvaarding van de uitnodiging vraagt een besluit van de eigenaar. Tot de volgende release kan de deelnemerslijst laten zien of iemand een account heeft; raden is begrensd tot 20 adressen per uur en wordt gelogd.
- **Hoort bij:** integraties-09
- **Test:** [`sec-002-g02-20261112.test.ts`](../../tests/eenheid/sec-002-g02-20261112.test.ts)

## Hoe is gecontroleerd

- De audit besloeg 13 gebieden; elke bevinding uit de hoofdaudit (126) en het aanvullend onderzoek (18) is over 19 patchgroepen verdeeld.
- Voor elke bevinding schreef de engineer eerst een test die de fout op de code van vóór de patch aantoont en faalt, en maakte daarna een minimale patch in de grondoorzaak; dezelfde test is na de patch groen. De code «vóór de patch» is de geïnstalleerde versie waarop het werk begon.
- Elke groep is onafhankelijk nagekeken door een aparte controleur: die toonde fouten opnieuw aan, zocht omwegen om patches heen en dezelfde fout in naburige code. Zijn opmerkingen (87 als fout erkend) bevestigde de engineer met een nieuwe test, herstelde ze en liet ze opnieuw controleren.
- Tot slot rondden 3 afrondingsstappen uitgesteld werk af dat meerdere groepen raakte (server en beveiliging, interface en teksten, toeleveringsketen en documentatie), met eigen tests en een volledige typecontrole.
- Daarna controleerden 3 overkoepelende controleurs de hele release samen (omzeiling en volledigheid, regressies in legitiem gebruik, interface en taal); wat zij vonden (vermeldingen eind-…) is vóór de release hersteld en met tests aangetoond.
- De tests die het herstel aantonen staan in de map `tests/eenheid/` (aantal testbestanden genoemd in de vermeldingen: 35); u kunt ze zelf uitvoeren. Eén herstel wordt apart aangetoond door een controlescript tijdens de build (`scripts/mail-slimme-inbox-audit.mjs`).
- Een deel van het interfaceherstel (vermeldingen gemarkeerd met «aangetoond met een codecontrole»: 1) is aangetoond met een controle van de code en statische controles, niet met een test die vóór de patch faalt.

## Wat er verandert voor legitieme gebruikers

Deze wijzigingen zijn bewust: ze kunnen in het dagelijks gebruik opvallen.

- **Nieuwe aanmeldbevestigingen.** Een verse bevestiging is nu nodig bij het eerste instellen van een verificatie-app, een besluit over een toegangsverzoek, het uitgeven van koppelcodes voor apparaten en AI-rechten, het verruimen van AI-toegang, het verlengen van extensietoegang, de migratieproef, het exporteren van het beheerlogboek en het goedkeuren van AI-acties met middelgroot risico; voor SSH-certificaten en technische acties een sterke (passkey of code uit de app). Eén bevestiging geldt voor één actie. _Waarom:_ Zo kunnen een gestolen sessie of een AI in het tabblad zichzelf geen ruimere rechten geven.
- **Frequentiegrenzen.** Nieuwe grenzen gelden voor agendasynchronisatie, domotica-opdrachten en -uitnodigingen, delen via een adres, toegangsverzoeken, het codewoord, de geheime Telegramcode, het registreren van AI-cliënten, meldingen aan de ondersteuning, kluisacties en het bekijken van agentcoördinatie. Voor IPv6 tellen grenzen per netwerk /64. Bij overschrijding legt de site uit hoe lang u moet wachten. _Waarom:_ De grenzen voorkomen dat één account of een anonieme bezoeker de site overbelast of codes en adressen raadt.
- **«Alleen bekijken» betekent alleen lezen.** Een account met de rol «alleen bekijken» kan lezen, eigen beveiligingsinstellingen wijzigen en afmelden, en ook eigen toegang intrekken en ontkoppelen (tokens, AI-koppelingen, e-mail, cloud, eigen deellinks) en zelf een gedeelde ruimte verlaten. Nieuwe toegang aanmaken, gegevens wijzigen, e-mail versturen, via AI handelen, andere deelnemers verwijderen of links van anderen intrekken kan niet — dat wordt met een duidelijke weigering afgewezen, en de accounteigenaar krijgt een logregel en een melding. _Waarom:_ Vroeger werd de beperking geraden uit de naam van de route en liet die veel wijzigingen door.
- **Eisen voor SSH-certificaten.** Een SSH-certificaat voor de server wordt alleen uitgegeven na een sterke bevestiging die root zelf aan de hand van de passkey van de eigenaar controleert, en alleen vanaf de dienstpagina's admin. en id.; op andere subdomeinen legt de kaart uit waarheen te gaan. _Waarom:_ Applicatiecode of een gestolen sessie mag niet zelf shelltoegang tot de server kunnen krijgen.
- **Sessies en de «onthouden browser».** Een sessie beëindigen bij «Sessies» of «Nee, dit ben ik niet» antwoorden in Telegram vergeet nu ook de onthouden browser — daar is opnieuw aanmelden nodig. Een apparaat wordt herkend aan een eigen browserkenmerk, dus na de update geldt elke browser één keer als nieuw (één melding). Aanmelden via Telegram werkt alleen in de browser die het begon, en site en bot tonen hetzelfde symbool. _Waarom:_ Anders kon een beëindigde of gestolen sessie zonder nieuwe aanmelding worden hersteld.
- **AI-koppelingen.** De termijn die in het toestemmingsvenster is gekozen, loopt nu echt af en wordt niet verlengd door het vernieuwen van een token; toestemming moet worden gegeven in dezelfde browser waarin de koppeling begon. Het massale «Altijd» geldt alleen voor leeshulpmiddelen. Knoppen voor rechten reageren alleen op echte handelingen van een mens, en geheimen op pagina's zijn voor de AI verborgen. Een agent uitschakelen voor de site werkt ook op bestaande koppelingen. _Waarom:_ Deze wijzigingen voorkomen dat een AI of vreemde cliënt eigen rechten verruimt of langer blijft dan iemand toestond.
- **E-mail.** Het voorbeeld van een bericht vraagt eerst voordat externe afbeeldingen worden getoond, toestemmingen voor afbeeldingen horen bij het account, «Afmelden» toont het doeladres, HTML- en SVG-bijlagen worden niet als pagina afgedrukt, logo's van onbekende afzenders staan standaard uit, en uitgestelde e-mails vertrekken niet van geblokkeerde accounts. _Waarom:_ Een afzender mag niet te weten komen dat een bericht is geopend, en geen eigen inhoud onder het adres van de site tonen.
- **Grenzen voor grootte en volume.** Anonieme verzoeken mogen maar een klein lichaam hebben, uploads naar de cloud gaan met hoogstens twee bestanden tegelijk, een bestand boven 32 MiB openen biedt een download aan, de agenda bewaart tot 2000 afspraken per agenda en 10 000 per account, voor notities en zoeken gelden grenzen voor lengte en tijd, en eigen opslag kan een quotum per gebruiker krijgen. _Waarom:_ Zonder deze grenzen kon één verzoek geheugen, schijf of database voor iedereen uitputten.
- **Woning en delen.** Iemand wordt aan een woning toegevoegd via een uitnodiging die hij zelf aanneemt, en een woning kan altijd worden verlaten. Het antwoord op delen via een adres is voor elk adres gelijk. _Waarom:_ Niemand mag zonder toestemming deelnemer worden of te weten komen welke adressen geregistreerd zijn.
- **Uitrol en serverbeheer.** De releasebuild draait onder een eigen afgeschermde gebruiker zonder installatiescripts van afhankelijkheden; hulpprocessen van root hebben systemd-beperkingen; de migratieproef draait onder een eenmalige rol; herstel installeert een vastgezette cloudflared-versie met controlesom; er is een vorm van de noodschakelaar voor bevestigingen met een termijn van hoogstens 24 uur bijgekomen; de oude onbeperkte vorm werkt nog, maar is zichtbaar in het logboek, bij «Beveiliging» en via een melding — gebruik die niet; de zekering schakelt beveiliging niet meer uit door gewone fouten, maar stelt de eigenaar een controle voor. _Waarom:_ Dit sluit wegen waarlangs code van afhankelijkheden of de applicatie rootrechten kon krijgen of beveiliging ongemerkt kon uitschakelen.
- **Privacy en logboeken.** Het definitief wissen van een account na 30 dagen wist nu echt alle gegevens; ondersteuningsrollen zien in het beheerlogboek gemaskeerde details van andermans privéacties; nieuwe weigeringen en kritieke acties laten een logregel en een melding achter. _Waarom:_ Beloften over wissen en privacy moeten worden nagekomen, en belangrijke acties moeten zichtbaar zijn voor de accounteigenaar.

<!-- sec-002-verslag: uitgave= -->
