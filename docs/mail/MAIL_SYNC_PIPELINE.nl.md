> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./MAIL_SYNC_PIPELINE.uk.md) · **🇳🇱 Nederlands** ([origineel](./MAIL_SYNC_PIPELINE.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Mail-synchronisatiepijplijn v1

## 1. Toestandsmachine (State machine)

```text
authorization_required
→ connecting
→ initial_sync
→ connected
↘ degraded / reauth_required / error
→ disconnected
```

De status `connected` vereist: een geverifieerde provideridentiteit, een versleuteld refresh-token, een actieve watch of actief abonnement, een voltooide initiële synchronisatie en een geldige cursor.

## 2. Pijplijn voor providerverbinding

1. De gebruiker klikt expliciet op Verbinden met Gmail/Microsoft.
2. De backend valideert de canonieke Mailsessie en het eigenaarschap van het account.
3. De gereedheidspoort (readiness gate) controleert clientconfiguratie, versleutelingssleutel, witte lijst voor callbacks en het providerbeleid.
4. Er wordt een gehashte, tijdelijk geldige provider-OAuth-status aangemaakt met PKCE en exacte scopes.
5. Navigatie in hetzelfde tabblad of een goedgekeurde pop-up start de toestemmingsstroom bij de provider; er staat geen token of bewijs in de URL behalve de code en status van de provider.
6. De callback claimt de status met een verwerkingslease (processing lease).
7. De autorisatiecode wordt aan serverzijde ingewisseld.
8. Er wordt gecontroleerd of de provideridentiteit overeenkomt met het beleid voor het geselecteerde of nieuwe account.
9. Het refresh-token wordt versleuteld met AES-256-GCM en AAD.
10. Accountscopes, status en token worden atomair vastgelegd.
11. De watch of het abonnement wordt aangemaakt.
12. De initiële synchronisatie wordt in de wachtrij geplaatst.
13. De gebruiker keert terug naar Mailaccounts (Mail Accounts) met een eerlijke voortgangsstatus.
14. De accountrevisie wordt via websocket gepubliceerd.

Een fout vóór het vastleggen van het token laat het account op `authorization_required` staan; een fout ná het vastleggen van het token maar vóór de synchronisatie laat de status op `degraded`/`initial_sync` staan, nooit ten onrechte op `connected`.

## 3. Gmail push → UI

```text
Gmail mailbox change
→ Gmail API publishes Pub/Sub message
→ authenticated Pub/Sub push POST
→ validate OIDC JWT audience/issuer/expiry
→ decode envelope and validate emailAddress/historyId
→ dedupe provider messageId
→ resolve owner-scoped mail_account
→ enqueue/coalesce provider.sync.incremental
→ return 2xx

worker claims incremental job
→ refresh access token under account lease
→ users.history.list(startHistoryId=stored cursor)
→ collect added/deleted/label deltas
→ fetch changed messages
→ parse MIME with bounded limits
→ upsert messages, bodies, labels, attachments, threads
→ commit next historyId only after all durable writes
→ enqueue neuro jobs for changed content hash
→ evaluate calm notification threshold
→ publish entity.update revision
→ UI refetches normalized owner-scoped data
```

De body van een pushmelding wordt niet behandeld als berichtinhoud. Dubbele of buiten volgorde ontvangen meldingen zijn veilig omdat de synchronisatie start vanaf de opgeslagen cursor en alle schrijfacties idempotent zijn.

## 4. Initiële Gmail-synchronisatie

### 4.1 Voorbereiding

- accountstatus staat op `initial_sync`;
- eerst een watch instellen of verlengen om het wijzigingshiaat te verkleinen;
- verloopdatum van de watch en de geschiedenis-basislijn (history baseline) opslaan;
- één taak voor initiële synchronisatie aanmaken met de idempotentiesleutel van het account.

### 4.2 Labels

- labels ophalen;
- systeem- en gebruikerslabels van de provider koppelen;
- upserten op `(account, provider_label_id)`;
- onbekende providerlabels behouden in plaats van ze weg te gooien.

### 4.3 Berichten

- bericht-ID's pagineren met een begrensde paginagrootte;
- het paginatoken apart van de uiteindelijke geschiedeniscursor als controlepunt (checkpoint) opslaan;
- berichtinhoud ophalen met gelijktijdigheids- en rate-limitbeperkingen;
- headers en adressen normaliseren;
- MIME recursief parsen met limieten op diepte, aantal onderdelen en gedecodeerde grootte;
- voorkeur geven aan `text/plain`; HTML opschonen; externe afbeeldingen blokkeren;
- bijlagemetadata vastleggen; bytes van grote bijlagen worden verwerkt via uitgestelde (lazy) taken;
- bericht upserten op basis van provider-ID;
- koppelen aan de conversatie (thread) van de provider;
- labels toewijzen;
- aantallen en tijdstempel van het nieuwste bericht in de conversatie bijwerken.

### 4.4 Voltooiing

- alle pagina's verwerken;
- verwijderingen alleen afstemmen binnen het expliciete synchronisatiebereik;
- initiële cursor en voltooiingstijdstip vastleggen;
- account op `connected` zetten als de watch nog geldig is;
- neurotaken alleen in de wachtrij plaatsen voor gewijzigde inhoudshashes;
- revisie publiceren.

Herstartveiligheid: de taak kan een pagina opnieuw verwerken zonder dubbele berichten aan te maken, omdat provider-ID's en idempotentiesleutels uniek zijn.

## 5. Details van incrementele Gmail-synchronisatie

Afgehandelde geschiedeniswijzigingen:

- `messagesAdded`: volledige metadata en inhoud ophalen en upserten;
- `messagesDeleted`: verwijdering bij provider / tombstone markeren;
- `labelsAdded`: relatie upserten;
- `labelsRemoved`: relatie verwijderen;
- wijzigingen met alleen een bericht-ID: huidige status bij de provider ophalen.

Cursorregels:

- één actieve lease per account;
- geschiedenispagina's worden op volgorde verwerkt;
- de cursor wordt niet vooruitgezet bij een mislukte pagina;
- de uiteindelijke cursor gebruikt het gezaghebbende resultaat uit de geschiedenisrespons;
- een ongeldige `startHistoryId` zet de herstelvlag en plant een begrensde her-bootstrap in;
- periodieke terugvalsynchronisatie (fallback) draait zelfs wanneer push actief is.

## 6. Levenscyclus van Gmail watch

- `users.watch` wordt aangemaakt na toestemming en het vastleggen van het token;
- de verloopdatum wordt opgeslagen;
- dagelijkse verlengingstaak;
- urgente verlenging wanneer de verloopdatum nadert;
- `users.stop` bij ontkoppelen waar van toepassing;
- een watch-fout verwijdert nooit mailboxgegevens;
- een verlopen watch wijzigt de status naar `degraded`, terwijl de terugvalsynchronisatie gewoon doorgaat.

## 7. Microsoft-melding → UI

```text
Graph change notification
→ HTTPS webhook
→ validationToken branch returns exact plain text
→ normal branch validates clientState and subscription
→ dedupe notification
→ enqueue account/folder delta job
→ 2xx

worker
→ refresh token
→ follow stored deltaLink
→ page through changes
→ upsert/delete messages and folders
→ persist nextLink while paging
→ commit final deltaLink after durable completion
→ neuro jobs + notifications + websocket revision
```

Abonnementen worden vóór de verloopdatum verlengd. Levenscyclusgebeurtenissen starten waar nodig een herautorisatie of het opnieuw aanmaken van het abonnement.

## 8. Contract van de MIME-parser

Invoer wordt als onvertrouwd (untrusted) beschouwd. Limieten:

- maximaal aantal ruwe berichtbytes;
- maximale MIME-diepte;
- maximaal aantal onderdelen (parts);
- maximale gedecodeerde onderdeelgrootte;
- begrensd aantal en begrensde lengte van headers;
- witte lijst voor tekensets (charset allowlist) met terugvaloptie;
- geen uitvoering van scripts;
- HTML-opschoner (sanitizer);
- externe afbeeldingen standaard geblokkeerd;
- `cid:`-verwijzingen worden uitsluitend herschreven naar gescande lokale bijlagen;
- gevaarlijke bestandsnamen worden genormaliseerd;
- uitpakken van archieven is uitgeschakeld tijdens gegevensinname.

Het parsinresultaat slaat waarschuwingen op. Een beschadigde berichtinhoud gooit de basisgegevens zoals afzender, onderwerp, datum en provideridentiteit niet weg.

## 9. Conversatiebouwer (Thread builder)

De primaire sleutel is de conversatie- of thread-ID van de provider. De interne bouwer:

- voert een upsert uit van de conversatie;
- koppelt berichten;
- berekent het nieuwste tijdstempel, het aantal ongelezen/totale berichten en de deelnemers;
- behoudt de semantiek van de provider;
- voegt niet-gerelateerde providerconversaties nooit heuristisch samen;
- handmatig geïmporteerde berichten kunnen een afzonderlijke synthetische conversatie-ID gebruiken.

## 10. Labelkoppelaar (Label mapper)

Interne labels behouden de identiteit van de provider en bieden genormaliseerde mogelijkheden:

- postvak IN (inbox);
- ongelezen/gelezen (unread/read);
- verzonden (sent);
- concept (draft);
- prullenbak/verwijderd (trash/deleted);
- spam/ongewenst (spam/junk);
- met ster/vlag (starred/flagged);
- gebruikerslabel, map of categorie.

Schrijfacties naar de provider zijn adapteropdrachten met idempotentie en audit. Triage in de UI staat los van providerlabels, tenzij de gebruiker expliciet een koppelingsregel inschakelt.

## 11. Bijlagepijplijn (Attachment pipeline)

1. Metadata opslaan tijdens het parsen van het bericht.
2. Beleid bepaalt directe (eager) versus uitgestelde (lazy) download.
3. Downloadworker valideert eigenaarschap van account en bericht evenals het token.
4. Streamen met groottelimiet; SHA-256 berekenen.
5. Opslaan in een besloten objectpad.
6. Scannen en classificeren; markeren als `clean`, `blocked` of `unsupported`.
7. De UI geeft nooit bytes vrij vóórdat een veilige status is bereikt.
8. Opschoning bij ontkoppelen of volgens bewaarbeleid verwijdert objecten op idempotente wijze.

## 12. Neuro-inclusieve pijplijn

### 12.1 Deterministische verwerkingsslag

- ruisindicatoren;
- extractie van afzender en context;
- datums en actiefasen;
- deterministische citaatsegmenten;
- conservatieve triagesuggestie;
- inhoudshash.

### 12.2 AI-verwerkingsslag (AI pass)

Uitsluitend op gewijzigde, opgeschoonde en begrensde tekst:

- systeeminstructie behandelt e-mail als gegevens, nooit als opdrachten;
- schema-uitvoer bevat wie/wat/wanneer/volgende actie, betrouwbaarheidsscore en citaatverwijzingen;
- verwijzingen moeten herleidbaar zijn naar opgeslagen bronsegmenten;
- ongeldige citaten leiden tot afwijzing van het artefact;
- uitvoer heeft altijd `requires_review=true`;
- er zijn geen tools beschikbaar voor mutaties bij de provider.

### 12.3 UI-projectie

- Focusweergave (Focus View) toont één bericht tegelijk;
- lage energie toont uitsluitend beantwoorden, taak maken of uitstellen (snooze);
- stille opslag van de hervattingscontext bewaart de exacte bericht-, conversatie- en paneelcontext zonder ongevraagde melding of zijbalk;
- Action/Waiting/Info/Later blijft door de gebruiker corrigeerbaar;
- zachte herinneringen gebruiken rustige drempelwaarden;
- geen rode achterstandstellers.

## 13. Verzendpijplijn (Send pipeline)

```text
user edits draft
→ save local/provider draft
→ POST send/prepare
→ validate recipients, account capability, draft revision
→ render exact preview and compute payload hash
→ create short-lived prepared command
→ UI asks explicit confirmation
→ POST send/confirm with command id + confirmation token/hash
→ claim command once
→ provider send with idempotency strategy
→ reconcile provider result
→ store sent message/thread update
→ audit and publish revision
```

Een time-out na een provideraanroep is dubbelzinnig: de worker controleert eerst het bericht en het idempotentiebewijs bij de provider voordat een nieuwe poging wordt ondernomen. Er vindt nooit automatische verzending plaats vanuit AI, herinneringen, achtergrondwachtrijen of snelkoppelingen voor lage energie.

## 14. Beleid voor herhaling en rate-limits (Retry and rate-limit policy)

- providerspecifieke classificatie (`401`, `403`, `404 cursor`, `409`, `429`, `5xx`);
- exponentiële backoff + jitter;
- `Retry-After`-header respecteren;
- gelijktijdigheidslimieten op accountniveau;
- vergrendeling (lock) bij tokenverversing;
- lichte synchronisatie scheiden van AI-verrijking;
- verouderde UI blijft leesbaar tijdens een storing bij de provider;
- dead-letter-records bewaren alleen een veilige foutcode, nooit berichtinhoud of tokens.

## 15. Herstelmatrix (Recovery matrix)

| Storing | Herstelactie |
|---|---|
| Dubbele webhook | Ontdubbelen en succes retourneren |
| Weggevallen Gmail-push | Periodieke geschiedenisterugval (history fallback) |
| Ongeldige Gmail-geschiedeniscursor | Herstellende initiële synchronisatie |
| Verlopen Graph `deltaLink` | Her-bootstrap op mapniveau |
| Ingetrokken refresh-token | Status `reauth_required` |
| Watch/abonnement verlopen | Opnieuw aanmaken; gegevens behouden |
| Fout bij MIME-parsen | Record met alleen metadata + waarschuwing |
| AI niet beschikbaar | Deterministische geciteerde samenvatting blijft beschikbaar |
| Crash van wachtrijworker | Verlopen van lease en nieuwe poging |
| Verzending onzeker | Afstemming met provider, niet blind opnieuw proberen |
| Ontkoppelen | Abonnement stoppen, token intrekken/verwijderen, taken opschonen |

## 16. Waarneembaarheid (Observability)

Per account:

- laatste push en laatste terugvalsynchronisatie;
- verloopdatum van watch/abonnement;
- ouderdom van de cursor;
- wachtrijdiepte, herhaalpogingen en vastgelopen taken (dead jobs);
- aantal gewijzigde berichten;
- parsinwaarschuwingen;
- resultaat van tokenverversing;
- rate-limitstatus;
- websocket-revisie;
- tellers voor meldingsgeschiktheid zonder bestraffende teksten richting de gebruiker.

Operationele statistieken zijn strikt gescheiden van de empathische UI-teksten.
