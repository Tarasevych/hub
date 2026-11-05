> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./MAIL_IMPLEMENTATION_SPEC.uk.md) · **🇳🇱 Nederlands** ([origineel](./MAIL_IMPLEMENTATION_SPEC.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Technische Specificatie Mailplatform v1

## 1. Statusvocabularium

- `confirmed`: ondersteund door toegepaste broncode en bewijs uit het besturingsvlak (control-plane).
- `partial`: implementatie bestaat, maar extern bewijs of browserbewijs is onvolledig.
- `unverified`: doel of configuratie is nog niet in de praktijk beproefd.
- `blocked`: vereiste externe configuratie of beveiligingspoort (security gate) ontbreekt.
- `deprecated`: uitsluitend behouden voor terugdraaien (rollback) of migratie.

Huidige basislijn (baseline):

- Mail Fase 1 handmatige/QA-UI: confirmed.
- M-110 providerregister/gereedheid, AES-256-GCM envelop-zelftests en op eigenaar afgebakende (owner-scoped) lege uniforme leesfacade: confirmed.
- Geauthenticeerde Gmail Pub/Sub-invoer, deduplicatie/samenvoeging (coalescing), tokenverversing, watch-verlenging, begrensde initiële/historische leessynchronisatie en provider-naar-Inbox-projectie: geïmplementeerd achter runtime- en externe-eindpuntpoorten; nog niet extern beproefd.
- Duurzame externe taakplanner (scheduler) en gegevensinname (ingestion) vanaf de provider: niet actief.
- Broncodepad voor Google-mailbox OAuth-status/PKCE/offline-toestemming/callback/tokenvastlegging: geïmplementeerd achter fail-closed productiepoorten; externe toestemming nog niet beproefd.
- Op eigenaar afgebakende Gmail-labelmutatie en expliciete tweefasige verzendopdracht-broncodepaden: geïmplementeerd achter verbonden-runtimepoorten; schrijfgedrag bij de provider nog niet extern beproefd.
- Microsoft Graph OAuth, versleutelde vastlegging van refresh-tokens, `/me`-mailboxverificatie, webhookvalidatie/`clientState`, delta-linksynchronisatie en via de provider verstuurde labels/berichten: geïmplementeerd achter fail-closed externe/runtimepoorten; nog niet extern beproefd.
- Providerspecifieke runtime-/scope-afhandeling, ontkoppeling/intrekking (disconnect/revocation), opschoning van tokens/abonnementen, synchronisatiegezondheid, herstel van verlopen leases (stale-lease recovery), onderhoudsplanningsconventie en migratie-inventaris voor handmatige/providergegevens: geïmplementeerd. Bestaande handmatige/QA-records blijven behouden tot acceptatie met een echte provider.
- Provider-tokenkluis (token vault): niet actief.
- Gmail watch/Pub/Sub: niet actief.
- Microsoft Graph webhooks/delta: niet actief.
- Hoog-risico verzenden: uitgeschakeld.

## 2. Werkpakketten

### M-100 Architectuur en contracten

Opleveringen (Deliverables):

- platformarchitectuur;
- databaseschema;
- synchronisatiepijplijn (sync pipeline);
- provider- en beveiligingscontracten;
- implementatieplan en acceptatiepoorten;
- blokkerende build-audit.

Acceptatiecriteria:

- documentatie is aanwezig in de repository;
- releasemanifest vermeldt naar waarheid dat de providerruntime inactief is;
- terugdraaiactie (rollback) verwijst naar de vorige toegepaste versie;
- geen gedragsveranderingen in authenticatie, sessie of UI;
- terminalbewijs van build/E2E is vastgelegd.

### M-110 Fundament voor mailproviders

Opleveringen:

- typen voor het providerregister;
- accountstatusmodel;
- evaluator voor geheimen en gereedheid;
- AES-256-GCM token-envelophelper met deterministische zelftests;
- op eigenaar afgebakend wachtrijrecord en idempotentiehelper;
- uniforme lees-API-facade bovenop de huidige gegevens;
- beheerders-/systeemoverzicht voor feitelijke gereedheid.

Acceptatiecriteria:

- ontbrekend versleutelingsgeheim faalt veilig gesloten (fails closed);
- er verschijnt nooit een ruw token in de DB, publieke respons of auditlog;
- eigenaar A kan geen account of bericht van eigenaar B lezen;
- een dubbele idempotentiesleutel voor een taak levert slechts één logische taak op;
- de huidige handmatige Fase 1 blijft functioneel;
- de providerstatus wordt nooit `connected` zonder bewijs van een token, abonnement en synchronisatie.

### M-120 Google-mailbox OAuth

Opleveringen:

- afzonderlijke provider-OAuth-status, gescheiden van de identiteitsstatus;
- exacte Gmail-scopes;
- PKCE, state, veilige terugkeerroute (safe return), offline-toegang;
- server-side uitwisseling van autorisatiecode;
- verificatie van het providerprofiel;
- versleutelde opslag van het refresh-token;
- opslag van toegekende scopes;
- intrekken/ontkoppelen (revoke/disconnect);
- knop gekoppeld vanuit Mailaccounts (Mail Accounts).

Acceptatiecriteria:

- een expliciete gebruikersklik is de enige starttrigger;
- één klik maakt precies één statusrecord aan;
- herhaalde aanroep van de callback (replay) is idempotent;
- afwijkende status, verlopen geldigheid of verkeerde eigenaar wordt geweigerd;
- refresh-token is versleuteld met een geldige GCM-tag en AAD;
- de browser ontvangt geen enkel token;
- weigering van toestemming laat de status op `authorization_required` staan;
- echte toestemming en terugkeer in Chrome zijn geaccepteerd door de eigenaar;
- verificatiestatus van beperkte Google-scopes (restricted scopes) is gedocumenteerd.

Externe randvoorwaarden:

- OAuth-client staat de exacte callback-URL toe;
- toestemmingsscherm en scopes zijn geconfigureerd;
- verificatie van beperkte scopes / beveiligingsbeoordeling is uitgevoerd zoals vereist;
- `MAIL_TOKEN_ENCRYPTION_KEY_V1` is geconfigureerd.

### M-130 Gmail watch en Pub/Sub

Opleveringen:

- configuratierecords voor topic en abonnement (subscription);
- geauthenticeerd push-eindpunt;
- validatie van JWT-doelgroep (audience) en uitgever (issuer);
- deduplicatie van Pub/Sub-berichten;
- aanmaken/verlengen/stoppen van `users.watch`;
- dagelijkse cron voor verlenging;
- terugval-cron voor synchronisatie (fallback sync);
- gezondheids- en gereedheidsstatus.

Acceptatiecriteria:

- vervalste, niet-ondertekende of voor een verkeerde doelgroep bestemde push wordt geweigerd;
- een geldige test-push plaatst één samengevoegde (coalesced) accounttaak in de wachtrij;
- een dubbel `messageId` heeft geen neveneffecten (no-op);
- de webhookhandler voert geen directe (inline) mailbox-ophaalactie uit;
- de verloopdatum van de watch wordt opgeslagen en tijdig verlengd;
- een hiaat in pushmeldingen wordt opgevangen door de terugvalsynchronisatie;
- daadwerkelijke aflevering via Google Pub/Sub is waargenomen.

Externe randvoorwaarden:

- Google Cloud-project en -topic;
- publicatierechten voor het Gmail-serviceaccount;
- geauthenticeerd push-abonnement en bijbehorende audience;
- externe POST-route op AppDeploy/eigen domein is geverifieerd.

### M-140 Gmail-synchronisatieworkers

Opleveringen:

- lease voor tokenverversing;
- labelsynchronisatie;
- initiële berichtpaginering;
- incrementele geschiedenissynchronisatie (history sync);
- MIME-parser;
- upsert van berichten, conversaties en labels;
- metadata en download van bijlagen;
- herstel-reset van de cursor;
- revisiemelding via websocket.

Acceptatiecriteria:

- herstarten tijdens het verwerken van een pagina is idempotent;
- de cursor schuift pas op nadat wijzigingen duurzaam zijn vastgelegd (commit);
- dubbele provider-ID's leiden niet tot dubbele records;
- toevoegen/verwijderen van labels en verwijderen van berichten worden correct doorgevoerd;
- ongeldige MIME laat de accountsynchronisatie niet crashen;
- een ongeldige geschiedeniscursor activeert een begrensd herstelproces;
- negatieve tests op eigenaarsafbakening slagen;
- de UI ontvangt een echt bericht zonder handmatige import.

### M-150 Uniforme Mail-API

Normatieve operaties:

- accounts oplijsten;
- berichten oplijsten/ophalen;
- conversaties (threads) oplijsten/ophalen;
- labels oplijsten;
- providerlabels/leesstatus wijzigen;
- concept opslaan;
- verzenden voorbereiden/bevestigen;
- account ontkoppelen;
- synchronisatiegezondheid opvragen.

Acceptatiecriteria:

- pagineringscursors zijn ondoorzichtig (opaque) en gebonden aan de eigenaar;
- account-ID's kunnen niet tussen eigenaren worden uitgewisseld;
- queryfilters zijn begrensd en gecontroleerd via een witte lijst (allowlisted);
- mutaties zijn idempotent en worden vastgelegd in het auditlog;
- verzenden vereist een expliciete, kortlevende bevestiging;
- API-fouten gebruiken stabiele redencodes en geven nooit providertokens prijs.

### M-160 Inbox Functional met echte gegevens

Opleveringen:

- huidige Fase 1 wordt gekoppeld aan canonieke, echte berichten en conversaties;
- Focusweergave (Focus View), triage met vier statussen, geciteerde vertrouwenslaag (Trust Layer) en stille opslag van de hervattingscontext werken op providergegevens;
- handmatige bron blijft zichtbaar onderscheiden;
- verversing via websocket;
- energiebewuste weergaveprojectie;
- geschiktheidsbepaling voor rustige meldingen (calm notifications).

Acceptatiecriteria:

- onderwerp, inhoud en broncitaten van de provider komen overeen met het origineel;
- de huidige accountcontext blijft stabiel bij verversen en wisselen;
- er treedt geen lay-outverschuiving (layout shift) op;
- weergave voor lage energie toont hooguit drie primaire acties;
- geen bestraffende tellers of teksten;
- bij afwezigheid van AI valt het systeem terug op deterministische geciteerde uitvoer;
- externe inhoud kan nooit een tool- of verzendactie activeren.

### M-170 Microsoft Graph

Opleveringen:

- configuratie van de Microsoft-appregistratie;
- kluis voor OAuth/PKCE/offline-tokens;
- identiteitsverificatie via `/me`;
- delta-synchronisatie voor mappen en berichten;
- validatie van webhooks, `clientState` en levenscyclus;
- verlenging van abonnementen;
- koppeling voor verzenden en labels/mappen via Graph;
- ontkoppelen van het account.

Acceptatiecriteria weerspiegelen de beveiligings-, eigenaars- en idempotentiepoorten van Google, aangevuld met echt bewijs van Graph-webhooks en deltasynchronisatie.

### M-180 Opschoning en migratie

Opleveringen:

- migratieplan voor handmatige records in `mail_items_v1`;
- compatibiliteitsleesacties;
- feature-vlaggen;
- inventarisatie van dode code;
- gegevensbewaring, export en verwijdering;
- oefening voor terugdraaien (rollback rehearsal).

Acceptatiecriteria:

- geen gegevensverlies;
- handmatige records blijven onderscheidbaar;
- oude routes worden pas verwijderd na een gebruiks- en bewijsaudit;
- terugdraaien herstelt de vorige code zonder nieuwe records te beschadigen.

## 3. API-contract

### Accounts

```text
GET /mail/accounts
POST /mail/accounts/{id}/connect
POST /mail/accounts/{id}/disconnect
GET /mail/accounts/{id}/sync-health
```

De accountrespons bevat uitsluitend veilige mogelijkheidsstatussen:

- id/provider/e-mailadres/weergavenaam;
- namen van toegekende scopes;
- status;
- laatste synchronisatietijdstip;
- verloopdatum van watch/abonnement;
- redencode voor herautorisatie of fout;
- nooit een token, ciphertext, IV of authenticatietag.

### Berichten en conversaties (Messages and threads)

```text
GET /mail/{accountId}/messages?cursor=&triage=&label=&unread=
GET /mail/{accountId}/messages/{messageId}
GET /mail/{accountId}/threads?cursor=
GET /mail/{accountId}/threads/{threadId}
```

De pagineringscursor is ondertekend/ondoorzichtig en bevat een vingerafdruk van eigenaar, account en filters.

### Labels

```text
POST /mail/{accountId}/labels
{
  "messageIds": ["..."],
  "add": ["..."],
  "remove": ["..."],
  "idempotencyKey": "..."
}
```

### Verzenden (Send)

Normatieve veilige stroom:

```text
POST /mail/{accountId}/send/prepare
POST /mail/{accountId}/send/confirm
```

Het gevraagde enkelvoudige eindpunt `/mail/{accountId}/send` mag als facade worden aangeboden, maar moet aanroepen weigeren die geen geldige voorbereide opdracht en expliciete bevestiging bevatten. AI kan nooit een bevestiging leveren.

## 4. Interface van het providerregister

```ts
interface MailProviderAdapter {
  provider: 'google_gmail' | 'microsoft_graph';
  authorizationUrl(input: ProviderAuthorizationInput): Promise<ProviderAuthorizationResult>;
  exchangeCode(input: ProviderCallbackInput): Promise<ProviderTokenSet>;
  refreshToken(input: RefreshInput): Promise<ProviderAccessToken>;
  verifyMailbox(accessToken: string): Promise<ProviderMailboxIdentity>;
  createSubscription(ctx: ProviderContext): Promise<ProviderSubscription>;
  renewSubscription(ctx: ProviderContext): Promise<ProviderSubscription>;
  stopSubscription(ctx: ProviderContext): Promise<void>;
  initialSync(ctx: SyncContext): Promise<SyncPage>;
  incrementalSync(ctx: SyncContext): Promise<SyncPage>;
  fetchMessage(ctx: MessageFetchContext): Promise<ProviderMessage>;
  fetchAttachment(ctx: AttachmentFetchContext): Promise<ProviderAttachmentStream>;
  applyLabels(ctx: LabelMutationContext): Promise<ProviderMutationResult>;
  send(ctx: SendContext): Promise<ProviderSendResult>;
  revoke(ctx: ProviderContext): Promise<void>;
}
```

Adapters retourneren providerneutrale waarden en een stabiele foutclassificatie; ze schrijven nooit rechtstreeks naar de UI-status.

## 5. Beveiligingsacceptatiesuite

Vereiste negatieve tests:

- verkeerde eigenaar-/account-ID;
- ontbrekende canonieke Mailsessie;
- hergebruik (replay), verlopen of manipulatie van de OAuth-status;
- verkeerde callback-origin of terugkeerpad;
- ontbrekende of ongeldige versleutelingssleutel;
- afwijkende GCM-AAD;
- gelijktijdigheidsconflict (race condition) bij tokenverversing;
- vervalste Pub/Sub-JWT;
- verkeerde `clientState` bij Graph;
- dubbel webhook-event;
- herstel na ongeldige cursor;
- overschrijding van maximale MIME-diepte of -grootte;
- opschoning (sanitization) van HTML-scripts en externe afbeeldingen;
- afwijkende grootte, type of hash van een bijlage;
- prompt-injectie die AI vraagt berichten te verzenden of geheimen prijs te geven;
- verzenden zonder bevestiging;
- dubbele verzendbevestiging;
- ontkoppelen tijdens een in de wachtrij geplaatste synchronisatie.

## 6. Testmatrix

1. Eerste Gmail-koppeling: geslaagd / geannuleerd / geweigerd.
2. Bestaand identiteitsaccount vereist nog steeds expliciete mailboxtoestemming.
3. Twee Gmail-accounts voor één eigenaar.
4. Hetzelfde e-mailadres bij een provider kan niet dubbel worden toegevoegd.
5. Eigenaar A heeft geen toegang tot account, bericht, token of taak van Eigenaar B.
6. Initiële synchronisatie pagineert en hervat na een herstart van de worker.
7. Dubbele Gmail-push, hiaat in meldingen en ongeldige geschiedeniscursor.
8. Verlenging en verlopen van een watch.
9. Beschadigde MIME en grote bijlage.
10. Afstemming (reconciliation) van conversaties en labels.
11. Focusweergave (Focus View) op echte Gmail-gegevens.
12. Citaatkoppelingen verwijzen naar de oorspronkelijke bronsegmenten.
13. Projecties voor lage, gemiddelde en hoge energie.
14. Hervatten na F5 en navigatie tussen services.
15. Concept opslaan versus expliciete verzendbevestiging.
16. Provider 429/5xx, backoff en dead-letter-afhandeling.
17. Ontkoppelen en opnieuw autoriseren.
18. Microsoft-validatietoken, `clientState`, delta en abonnementsverlenging.
19. Mobiel 375×667 en desktop 1280×800.
20. Schone FE-, BE- en netwerklogs na een volledige E2E-run.

## 7. Chrome-acceptatiechecklist per providerrelease

- harde verversing (hard refresh) van Mailaccounts;
- verbinden via één expliciete klik;
- exacte toestemmingsscopes controleren;
- annuleren en opnieuw proberen;
- terugkeren naar dezelfde Mail-accountcontext;
- controleren dat er geen token of code achterblijft in de URL of browseropslag;
- voortgangsstatus van het account verifiëren;
- een echte testmail ontvangen;
- UI-bijwerking waarnemen zonder handmatige import;
- F5 en stille hervatting van de context zonder ongevraagde melding;
- van account wisselen en isolatie bevestigen;
- ontkoppelen en verifiëren dat de synchronisatie stopt;
- herhalen in een smalle viewport;
- Network/Console en afleverbewijs in het providerdashboard controleren.

## 8. Uitrolpoorten (Rollout gates)

- Feature-vlaggen per provider en per account.
- Fundament → canary voor eigenaar → begrensde echte mailbox → bredere activering.
- Elke stap heeft een directe Version ID voor terugdraaien (rollback).
- Databasemigraties zijn voorwaarts compatibel en waar mogelijk omkeerbaar.
- Schrijven/verzenden bij de provider blijft uitgeschakeld totdat het bewijs voor leessynchronisatie en isolatie is geleverd.
- Microsoft start pas nadat het lees-/synchronisatiepad van Google stabiel is, tenzij volledig geïsoleerd achter een onafhankelijke vlag.

## 9. Huidige blokkades vóór live Gmail

- toegewijd versleutelingsgeheim voor de mailbox;
- exacte verificatiestatus van het Google-toestemmingsscherm en de beperkte scopes;
- Pub/Sub-project, -topic, -abonnement en geauthenticeerde push-audience;
- bewijs van een extern bereikbare push-route;
- productiewaardige duurzame DB-/wachtrij-equivalentie of beheerde infrastructuur;
- Chrome-acceptatie door de eigenaar.

Deze blokkades staan de implementatie van zuivere contracten, token-enveloptests, het op eigenaar afgebakende wachtrijfundament en eerlijke gereedheids-API's niet in de weg. Ze verhinderen wél een eerlijke claim dat de status `connected` is.
