> 🌐 **Taal / Мова:** [Українська](АРХІТЕКТУРА-ПЛАТФОРМИ-ПОШТИ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Architectuur van het Mailplatform v1

## 1. Doel en afbakening

Dit document definieert de productie-doelarchitectuur van het echte mailplatform `mail.tarasevych.com`, geïntegreerd met het canonieke identiteits- en sessiemodel. De huidige Mail Fase 1 blijft een eerlijke handmatige/QA-omgeving. Deze release activeert geen Gmail- of Microsoft-OAuth, slaat geen providertokens op en verklaart push/synchronisatie niet als verbonden.

Het centrale productmodel is **Inbox Functional**: het systeem vermindert uitvoeringsfrictie in plaats van Inbox Zero af te dwingen. Synchronisatie levert betrouwbare providergegevens; de neuro-inclusieve laag zet deze om in één eerstvolgende actie, een samenvatting met broncitaten (cited samenvatting), stille opslag van de hervattingscontext (silent resume-context persistence) en een energiebewuste interface.

## 2. Architecturale invarianten

1. De canonieke ecosysteemsessie en mailboxautorisatie zijn verschillende mogelijkheden (capabilities). Inloggen via Google Identity betekent geen toegang tot Gmail.
2. Elk mailboxrecord heeft een `owner_user_id`; een provider-payload kan nooit de eigenaar bepalen.
3. Refresh-tokens worden uitsluitend aan serverzijde opgeslagen in een AES-256-GCM-envelop; access-tokens komen nooit terecht in browseropslag, URL's, logs of auditdetails.
4. De callback-status van de aanbieder is eenmalig bruikbaar (single-use), kortlevend en gekoppeld aan de eigenaar, het mailaccount, de aanbieder, de initiërende service, de taal (locale) en het veilige terugkeerpad.
5. Een webhook/push is slechts een signaal. De gezaghebbende status wordt opgehaald via Gmail History of Microsoft Delta.
6. Elke inname- (ingestion) en mutatie-operatie heeft een idempotentiesleutel.
7. De synchronisatiecursor schuift pas op na een duurzame vastlegging (commit) van alle bijbehorende wijzigingen.
8. Hoog-risico verzenden verloopt uitsluitend via prepare → expliciete confirm → commit, met idempotentie en audit.
9. Externe e-mail-HTML, bijlagen en AI-uitvoer worden als onvertrouwd beschouwd.
10. AI voert geen instructies uit e-mails uit, verstuurt geen berichten en verbergt nooit de bron.
11. Een geciteerde samenvatting behoudt de herkomst (provenance) tot op specifieke berichtonderdelen en tekstfragmenten.
12. De lage-energiemodus vermindert het aantal beslissingen; het is niet slechts een visueel thema.
13. Geen bestraffende formuleringen over ongelezen, achterstallige of gemiste berichten.
14. Handmatige import blijft een afzonderlijk brontype tot aan een aparte migratiepoort; het wordt niet vermengd met de waarheid van de provider.

## 3. Componenten

### 3.1 Canonieke Mail-API

Op eigenaar afgebakende (owner-scoped) facade bovenop de provideradapters:

- accounts en verbindingsstatus;
- berichten, conversaties (gesprekken) en etiketten;
- levenscyclus van concept- en verzendopdrachten;
- synchronisatiegezondheid;
- neuro-inclusieve status;
- entiteitsupdates via websocket.

Publiek productcontract:

- `GET /mail/accounts`
- `GET /mail/{accountId}/messages`
- `GET /mail/{accountId}/threads`
- `POST /mail/{accountId}/send`
- `POST /mail/{accountId}/labels`

In de huidige AppDeploy-runtime wordt de sessiecontext van de eigenaar doorgegeven via een canonieke POST-body. Daarom kunnen adapterroutes tijdelijk de vorm `/api/owner/mail/...` hebben zonder het productcontract te wijzigen. De GET-facade wordt pas geïntroduceerd nadat veilige resolutie van de sessiecontext voor GET is aangetoond.

### 3.2 Providerregister

Eén register beschrijft `google_gmail` en `microsoft_graph`:

- scopes;
- OAuth-eindpunten;
- identiteits-/profielresolver;
- tokenverversing;
- levenscyclus van watch/abonnement;
- initiële synchronisatie;
- incrementele synchronisatie;
- normalisatie van berichten, conversaties en etiketten;
- mogelijkheden voor verzenden en wijzigen;
- classificatie van provider-specifieke rate-limits;
- ontkoppelen/intrekken (disconnect/revoke).

Providerspecifieke code wordt niet aangeroepen zonder de mogelijkheidsstatus `configured` en een actieve accounttoekenning.

### 3.3 Tokenkluis

Envelopformaat:

- `ciphertext`;
- willekeurige `iv` van 12 bytes;
- GCM `auth_tag`;
- `key_version`;
- `algorithm = AES-256-GCM`;
- AAD: `owner_user_id | mail_account_id | provider | token_kind`.

`MAIL_TOKEN_ENCRYPTION_KEY_V1` wordt bewaard als AppDeploy-geheim of door KMS ondersteunde sleutel. Een ontbrekende of ongeldige sleutel blokkeert elke providerverbinding. Tokenverversing maakt gebruik van een lease op accountniveau, sleutelrotatie en vergelijking-vóór-schrijven (compare-before-write).

### 3.4 Push-invoer

#### Gmail

Geauthenticeerd push-eindpunt voor Google Pub/Sub:

- controleert uitgever (issuer), doelgroep (audience) en verloopdatum van de OIDC-bearer-JWT;
- controleert de op een witte lijst geplaatste identiteit van abonnement en topic;
- decodeert de Pub/Sub-envelop;
- ontdubbelt `messageId`;
- vergelijkt `emailAddress` met het verbonden account;
- maakt een samengevoegde (coalesced) taak aan voor incrementele synchronisatie;
- antwoordt snel, zonder gegevens bij de aanbieder op te halen binnen het verzoekpad.

#### Microsoft

Graph-webhookeindpunt:

- retourneert het validatietoken als platte tekst tijdens de aanmaakvalidatie;
- controleert `clientState` in constante tijd;
- ontdubbelt de meldingsidentiteit;
- ondersteunt levenscyclusmeldingen (lifecycle notifications);
- plaatst een delta-synchronisatietaak in de wachtrij en laadt de mailbox niet tijdens het webhookverzoek.

### 3.5 Duurzame wachtrij en achtergrondprocessen

Taaktypen:

- `token.refresh`
- `provider.watch.renew`
- `provider.webhook.ingest`
- `provider.sync.initial`
- `provider.sync.incremental`
- `provider.message.fetch`
- `provider.attachment.fetch`
- `provider.labels.sync`
- `provider.thread.rebuild`
- `neuro.triage`
- `neuro.summary`
- `notification.evaluate`
- `send.prepare`
- `send.commit`
- `provider.disconnect.cleanup`

Elke taak heeft een idempotentiesleutel, lease, pogingenteller, exponentiële backoff met jitter, `available_at`, eindstatus en dead-letter-reden. Gmail-gebeurtenissen worden per account samengevoegd omdat de meldingsfrequentie begrensd is en meldingen kunnen wegvallen. Periodieke terugvalsynchronisatie is verplicht.

### 3.6 Opslag

- Metadata, cursors, opdrachten, triage en citaten: relationele database.
- Opgeschoonde platte tekst en begrensde HTML: database of gecomprimeerde objectopslag volgens het groottebeleid.
- Bijlagen: besloten objectopslag, pad op basis van eigenaar/account/bericht, inhoudshash en malwarescanstatus.
- Ruwe provider-payload: korte versleutelde/debug-bewaring uitsluitend bij expliciet beleid; standaard worden alleen genormaliseerde velden bewaard en geen permanent ruw archief.

### 3.7 Realtime UI-bijwerking

1. Initiële HTTP-bootstrap.
2. Frontend zet een AppDeploy WS-verbinding op.
3. Abonneert zich op `mail_account:{accountId}` of de mailfeed op eigenaarsniveau.
4. Na een commit verstuurt de achtergrondproces `entity.update` met revisie/cursor, zonder de volledige gevoelige payload.
5. Frontend maakt de op eigenaar afgebakende API ongeldig en haalt deze opnieuw op, of past een begrensde genormaliseerde delta toe.
6. Afmelden (unsubscribe) bij het verlaten van de Mail-weergave; de socket wordt niet bij elk tabblad opnieuw opgebouwd.

## 4. Google-adapter

### 4.1 Toestemming

Mailbox-OAuth is een afzonderlijke incrementele autorisatietransactie. Beoogd scopecontract:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.labels`

`gmail.modify` overlapt een groot deel van de leesmachtiging, maar de runtime beperkt het door de gebruiker gevraagde scopecontract niet zonder een afzonderlijk toestemmings- of verificatiebesluit. Beperkte scopes (restricted scopes) vereisen Google-verificatie en, afhankelijk van de uitrol, een beveiligingsbeoordeling.

Autorisatie maakt gebruik van offline-toegang; het ontbreken van een refresh-token na herhaalde toestemming overschrijft een bestaand geldig token niet. De identiteit van de providermailbox wordt vóór activering bevestigd via het Gmail-profiel.

### 4.2 Watch

Na het vastleggen van het token:

1. account aanmaken of bijwerken;
2. labels-bootstrap uitvoeren;
3. Gmail `users.watch` aanroepen;
4. geretourneerde `historyId` en verloopdatum opslaan;
5. initiële synchronisatie inplannen;
6. watch dagelijks en verplicht vóór de verloopdatum verlengen;
7. periodieke geschiedenisterugval (history fallback) aanhouden.

### 4.3 Initiële synchronisatie

- lijst met etiketten ophalen;
- gepagineerde berichtenlijst ophalen volgens begrensd beleid;
- berichtmetadata en volledige MIME ophalen;
- headers, inhoudsdelen en bijlagen normaliseren;
- berichten upserten;
- conversatielidmaatschap opbouwen;
- etiketten koppelen;
- downloads van bijlagen in de wachtrij plaatsen volgens beleid;
- initiële cursor vastleggen;
- triage en samenvatting alleen in de wachtrij plaatsen voor nieuwe of gewijzigde inhoud.

### 4.4 Incrementele synchronisatie

- opgeslagen geschiedeniscursor lezen;
- geschiedenislijst aanroepen;
- toegevoegde/verwijderde berichten en toegevoegde/verwijderde etiketten verwerken;
- gewijzigde berichten ophalen;
- wijzigingen en de volgende cursor atomair vastleggen;
- bij een ongeldige of verlopen cursor een begrensde herstel-bootstrap uitvoeren;
- de cursor nooit vooruitzetten na een gedeeltelijke fout.

## 5. Microsoft-adapter

- Authorization Code + PKCE + offline-toegang.
- Gedelegeerde scopes: `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`.
- Mailboxidentiteit vaststellen via Graph `/me`.
- Initiële synchronisatie gebruikt de mappeninventaris plus gepagineerde berichten/delta.
- Delta-links per account en map opslaan.
- Webhookmelding plant een deltasynchronisatie in.
- Abonnementen vóór de verloopdatum verlengen; levenscyclusgebeurtenissen afhandelen.
- Conversatiekoppeling gebruikt Graph-conversatie-ID's, maar behoudt de berichtidentiteit van de provider.

## 6. Neuro-inclusieve verwerkingsgrens

Pijplijn na het vastleggen van een genormaliseerd bericht:

1. deterministische extractie van ruis, risico's en headers;
2. triagesuggestie in vier klassen (`action`, `waiting`, `info`, `later`);
3. bronsegmentatie en citaatankers;
4. optionele AI-samenvatting op basis van opgeschoonde, onvertrouwde tekst;
5. validatie van het uitvoerschema en de citaatverwijzingen;
6. opslaan van betrouwbaarheidsscore (confidence), model/versie, bronhash en de vlag `requires_review`;
7. afleiden van één eerstvolgende stap;
8. beoordelen van de drempel voor rustige meldingen (calm notifications);
9. publiceren van de UI-revisie.

Lage energie: maximaal 2–3 veilige opties, geen batchdruk. Gemiddelde energie: samenvatting, concept en onderbouwing. Hoge energie: achterstand wegwerken (backlog rescue), regels en batchverwerking. AI roept nooit rechtstreeks verzend- of labeltools van de aanbieder aan.

## 7. Beveiliging en gegevensbescherming

- minimale rechten (least privilege) en expliciete mailboxtoestemming;
- versleuteling van providertokens en sleutelrotatie;
- validatie van webhook-JWT en `clientState`;
- afbakening op account en eigenaar bij elke lees- en schrijfactie;
- standaard HTML-opschoning en blokkering van externe afbeeldingen;
- limieten op MIME-diepte en -grootte en bescherming tegen zip-bommen;
- witte lijst voor bijlagetypen en -groottes en malwarescanstatus;
- isolatie tegen prompt-injectie;
- maskering van gevoelige gegevens in logs (log redaction);
- onveranderlijk auditlog voor verbinden, verversen, scopewijziging, synchronisatie, labelmutatie, concept en verzenden;
- ontkoppelen trekt waar ondersteund het providertoken in, stopt watch/abonnement, verwijdert lokale tokens en plant opschoning volgens het bewaarbeleid;
- pad voor privacy-export en -verwijdering.

## 8. Mogelijkheidsgrens van AppDeploy

De AppDeploy-database is geschikt voor het huidige besturingsvlak en begrensde fundamentrecords, maar bewijst op zichzelf geen SQL-uniciteit, referentiële integriteit (foreign sleutels), transactionele commits van cursor+bericht, duurzame wachtrijen met hoge doorvoer of mailboxschaal op productieniveau. Het productiedoel vereist daarom ofwel:

- een beheerde relationele database + duurzame wachtrij/objectopslag; ofwel
- een expliciet geverifieerde AppDeploy-implementatie die gelijkwaardige garanties biedt voor idempotentie, leases en foutafhandeling.

Zolang dat bewijs ontbreekt, blijft de UI-status `not_connected`/`foundation_only`, en niet `production_ready`.

## 9. Faalscenario's

- ontbrekende versleutelingssleutel → verbinding geblokkeerd;
- toestemming geweigerd → account blijft op `authorization_required` staan;
- refresh-token ingetrokken → status `reauth_required`, geen destructieve opschoning;
- rate-limit → opnieuw proberen met providerbewuste backoff;
- ongeldige geschiedenis-/deltacursor → begrensde herstelsynchronisatie;
- dubbele webhooks → idempotente no-op;
- hiaat in pushmeldingen → periodieke terugvalsynchronisatie haalt achterstand in;
- beschadigde MIME → parsinresultaat in quarantaine plaatsen, metadata van aanbieder behouden;
- fout bij malwarescan van bijlage → niet beschikbaar maken, nooit automatisch openen;
- onduidelijkheid bij verzenden → idempotentiecontrole vóór opnieuw proberen;
- ontkoppeling van aanbieder → verlengingen en synchronisatie onmiddellijk stopzetten.

## 10. Definitie van Gereed

Een aanbieder heeft pas de status `connected` wanneer de tests voor toestemming, versleutelde opslag van het refresh-token, verificatie van de mailboxidentiteit, aanmaken van watch/abonnement, initiële synchronisatie, incrementele terugval en ontkoppeling zijn geslaagd. Geautomatiseerde tests vervangen nooit de echte OAuth-acceptatie in Chrome of het bewijs van cloud-webhooks.
