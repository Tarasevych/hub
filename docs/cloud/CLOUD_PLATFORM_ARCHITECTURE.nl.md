> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD_PLATFORM_ARCHITECTURE.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD_PLATFORM_ARCHITECTURE.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Cloud-platformarchitectuur — Werkruimtefunctionaliteit v1

## 1. Doel

`cloud.tarasevych.com` is een neuro-inclusieve werkruimte voor digitale middelen, geen conventionele mappenbrowser. De primaire verantwoordelijkheid is het externaliseren van een deel van de executieve functies van de gebruiker: eerst vastleggen, context behouden, naamgevingsbeslissingen beperken en hervatten vanzelfsprekend maken.

## 2. Architecturale grens

Cloud is een benoemde servicecontext binnen het bestaande ecosysteem en hergebruikt de volgende onderdelen, maar is er geen eigenaar van:

- CanonicalChrome;
- CanonicalAccountMenu;
- canonieke Identity en tabbladgebonden sessiebeleid (`tab-scoped`);
- taal- en themacontrollers;
- goedkeuringspoort voor de eigenaar (`owner approval gate`).

Cloud beheert een afzonderlijk domeinmodel. Bestaande Hub-`workspaces` blijven werkruimtes voor dashboardsamenstelling en MOGEN NIET worden hergebruikt als Cloud-projectwerkruimtes. Cloud-records gebruiken de `cloud_*_v1`-namespace om semantische en autorisatielekkage te voorkomen.

## 3. Contextdiagram

```text
Browser / CanonicalChrome
        |
        | canonical cloud session (ownerRequireSession)
        v
Cloud Functional UI
        |
        | owner-scoped Unified Cloud API
        v
Cloud Domain Service
  |          |             |             |
  v          v             v             v
Metadata DB  Private Blob  AI Facade     Audit / Resume
             Storage       (bounded)     State

Future provider boundary:
Cloud Domain Service -> Provider Registry -> OAuth Token Vault -> Adapter Worker
                                            |-> Google Drive
                                            |-> Microsoft Graph / OneDrive
                                            `-> Dropbox
```

## 4. Kernaggregaten

### CloudWorkspace
Een contextdragend project, onderwerp of levensgebied. Het bevat een stabiel sjabloon en ondiepe visuele secties, geen door de gebruiker onderhouden mappenstructuur.

### CloudItem
Een vastgelegde notitie, link of opgeslagen bestand. Het kan voor onbepaalde tijd in Quick Capture (`workspaceId = ''`) blijven staan. Plaatsing is optioneel en omkeerbaar.

### CloudResume
Eén aan de eigenaar gebonden voortzettingswijzer: huidige werkruimte, huidig item, focusstatus en energiemodus.

### CloudAiDecision
Een inhoudsloos auditrecord van AI-/fallback-metadatabeslissingen. Ruwe gebruikersinhoud wordt niet naar deze tabel gedupliceerd.

## 5. Smart Capture-pijplijn

```text
User selects note/link/file
  -> strict validation and safe-type policy
  -> private object write (file only)
  -> deterministic fallback title
  -> bounded AI metadata extraction
       - title
       - short description
       - tags / explicit people
       - existing workspace suggestion
  -> validate AI output against owner-visible workspace IDs
  -> persist owner-scoped item
  -> persist decision fingerprint/status
  -> update Resume
  -> return calm success or fallback message
```

Storingsbeleid:

- vastleggen blijft functioneel wanneer AI uitvalt;
- een geschreven object wordt teruggedraaid als het opslaan van metadata mislukt;
- niet-ondersteunde of te grote bestanden worden vóór opslag afgewezen;
- providerinhoud wordt nooit als instructies behandeld;
- de AI kan geen machtigingen aanmaken, tools uitvoeren, gegevens tussen eigenaren verplaatsen of werkruimte-ID's verzinnen.

## 6. Zoekarchitectuur

Fase 1 gebruikt een deterministische gewogen metadata-index over:

- titel (`title`);
- tags (`tags`);
- expliciet genoemde personen (`explicit people`);
- werkruimtetitel (`workspace title`);
- beschrijving (`description`);
- bronbestandsnaam/URL (`source filename/URL`);
- notitietekst (`note text`).

De API retourneert een gedeclareerde modus `weighted-metadata-v1`; deze claimt geen vector- of semantische indexering. Toekomstige diepe indexering voegt geëxtraheerde tekst, embeddings en gekoppelde opnames toe via asynchrone taken zonder het Unified Cloud API-contract te wijzigen.

## 7. Opslagarchitectuur

Eigen bestanden worden weggeschreven naar de private objectopslag van AppDeploy onder een ondoorzichtige eigenaar-hash en een willekeurige objectsleutel. Metadata slaat het objectpad uitsluitend aan de serverzijde op. De browser ontvangt pas een kortlevende ondertekende URL na een aan de eigenaar gebonden openingsverzoek.

Beleid voor veilige bestandstypen in Fase 1:

- JPEG, PNG, WebP, GIF;
- PDF;
- platte tekst, CSV, Markdown;
- ZIP;
- Office Open XML- en OpenDocument-bestanden;
- maximaal 6 MB.

HTML, SVG en uitvoerbare indelingen zijn opzettelijk uitgesloten totdat malwarescanning en `content-disposition`-controles zijn bewezen.

## 8. Beveiliging en tenancy

Elk afgeschermd verzoek moet aan alle onderstaande voorwaarden voldoen:

1. er bestaat een canonieke sessie;
2. de sessieservice is `cloud`;
3. de gebruikersstatus is `approved`;
4. elke DB-opzoekactie valideert `ownerUserId`;
5. elke relatie tussen werkruimte en item wordt aan de serverzijde opnieuw gevalideerd;
6. opslagpaden zijn nooit afkomstig van de client;
7. externe URL's staan alleen HTTP(S) toe, weigeren inloggegevens en verwijderen fragmenten (`#...`);
8. risicovolle deel-/providermutaties blijven uitgeschakeld.

Delen is geblokkeerd totdat er vijandige isolatietests (Actor A / Actor B) bestaan. Provider-OAuth is geblokkeerd totdat de tokenkluis, least-privilege scopes, intrekking, webhookvalidatie, synchronisatiecursors en rollback zijn geaccepteerd.

## 9. Evolutie van de AI-pijplijn

### Fase 1 — actief
- synchrone, begrensde naamgeving en suggestie voor een bestaande werkruimte;
- deterministische terugvaloptie (fallback);
- uitvoervalidatie en beslissingsvingerafdruk (`decision fingerprint`).

### Fase 2 — geplande worker-runtime
- `cloud_jobs_v1`-wachtrij;
- MIME-bewuste tekstextractie;
- opdeling in fragmenten (chunking) en inhoudsvingerafdrukken;
- hybride index met embeddings en lexicale zoekfunctie;
- detectie van duplicaten en gekoppelde opnames;
- fotogroepering en beoordelingsbatches.

### Fase 3 — gecontroleerde ondersteuning
- zachte check-ins;
- projectstarter-wizard op basis van vastgelegde context;
- herinneringen op basis van expliciete itemstatussen;
- geen autonome externe schrijfacties of deelacties.

## 10. Neuro-inclusieve releasepoorten

Een release wordt afgekeurd wanneer deze het volgende introduceert:

- verplichte ordening tijdens het vastleggen;
- diepe mappennavigatie als primair pad;
- taalgebruik rond schaamte, achterstand, falen of reeksen (streaks);
- meer dan één dominante eerstvolgende actie in de lage-energiemodus;
- verlies van Resume na vernieuwen van de pagina;
- ontoegankelijke labels, toetsenbordfocus of foutidentificatie;
- gesimuleerde providerconnectiviteit;
- verborgen fouten in de eigenaar-afbakening (`owner-scope`).

## 11. Gelijktijdigheid en uitrolisolatie

Cloud-ontwikkeling is geïsoleerd van de parallelle Mail-implementatie:

- Cloud-modules gebruiken `cloud-*` bestands- en tabelnamespaces;
- geen enkel `mail-*` bronbestand, tabel of route wordt gewijzigd;
- bewerkingen in gedeelde bestanden zijn uitsluitend contextrijke, chirurgische diffs;
- de nieuwste toegepaste snapshot wordt vóór uitrol opnieuw ingelezen;
- een gewijzigd gedeeld anker leidt tot een rebase/fail-safe en nooit tot het overschrijven van het hele bestand;
- rollback vindt plaats naar het direct voorafgaande toegepaste Version ID.
