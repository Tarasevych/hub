> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD_IMPLEMENTATION_SPEC.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD_IMPLEMENTATION_SPEC.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Technische specificatie Cloud — Werkruimtefunctionaliteit

## 1. Bereik van Fase 1

### Geïmplementeerde kern

- afzonderlijk Cloud-werkruimteaggregaat;
- Project Starter met vier sjablonen en gegenereerde ondiepe secties;
- Smart Capture voor notities, links en veilige bestanden;
- optionele plaatsing: Quick Capture is de standaard;
- AI-naamgeving, metadata en suggestie voor bestaande werkruimtes;
- deterministische terugvaloptie wanneer AI niet beschikbaar is;
- eigen private objectopslag;
- plaatsing met één klik vanuit Quick Capture;
- itemstatussen: opgeslagen (`captured`), wacht op beoordeling (`waiting_review`), in uitvoering (`in_progress`), gereed (`done`);
- gewogen contextueel zoeken;
- Resume-wijzer (hervattingspunt);
- lage/gemiddelde/hoge energiedichtheid;
- Focusmodus voor werkruimtes geïntegreerd met CanonicalChrome;
- eerlijke grens voor provideraccounts.

### Expliciet niet actief

- OAuth/synchronisatie voor Google Drive, OneDrive of Dropbox;
- achtergrondworkers voor diepe inhoudsanalyse;
- OCR en fotosortering;
- vectorembeddings;
- delen (sharing);
- herinneringen/meldingen;
- UI voor versiegeschiedenis;
- destructieve verwijdering.

## 2. Uniforme Cloud API

Alle verzoeken gebruiken de canonieke Cloud-sessiecontext en POST-transport om het bestaande ecosysteemcontract te behouden.

| Endpoint | Doel |
|---|---|
| `/api/owner/cloud/bootstrap` | aan eigenaar gebonden werkruimtes, items, Quick Capture, Resume en eerlijke mogelijkheden (capabilities) |
| `/api/owner/cloud/workspaces/create` | werkruimte en sjabloonsecties aanmaken |
| `/api/owner/cloud/capture` | notitie/link/bestand vastleggen; AI + fallback-metadata |
| `/api/owner/cloud/items/:id/place` | plaatsing in werkruimte bevestigen |
| `/api/owner/cloud/items/:id/status` | functionele status bijwerken |
| `/api/owner/cloud/items/:id/open` | Resume bijwerken en ondertekende bestands-URL uitgeven of notitie/link retourneren |
| `/api/owner/cloud/search` | gewogen contextueel zoeken |
| `/api/owner/cloud/resume` | context voor werkruimte/item/focus/energie vastleggen |
| `/api/owner/cloud/platform-status` | bewijsgericht contract voor de werkelijke status |

## 3. Validatie- en foutcontract

Stabiele foutcodes omvatten:

- `OWNER_CLOUD_SESSION_REQUIRED`;
- `CLOUD_WORKSPACE_TITLE_REQUIRED`;
- `CLOUD_WORKSPACE_ALREADY_EXISTS`;
- `CLOUD_WORKSPACE_LIMIT_REACHED`;
- `CLOUD_WORKSPACE_NOT_FOUND`;
- `CLOUD_CAPTURE_TEXT_REQUIRED`;
- `CLOUD_CAPTURE_URL_INVALID`;
- `CLOUD_CAPTURE_FILE_UNSUPPORTED`;
- `CLOUD_CAPTURE_FILE_SIZE`;
- `CLOUD_STORAGE_WRITE_FAILED`;
- `CLOUD_ITEM_NOT_FOUND`;
- `CLOUD_ITEM_STATUS_INVALID`;
- `CLOUD_SEARCH_QUERY_REQUIRED`.

Gebruikersgerichte teksten vertalen storingen naar kalme, niet-bestraffende meldingen en bevestigen dat invoer/gegevens niet verloren zijn gegaan wanneer dat waar is.

## 4. UX-informatiearchitectuur

Canonieke lokale tabbladen:

1. Overzicht (Overzicht);
2. Werkruimtes (Workspaces);
3. Slim vastleggen (Smart Capture);
4. Snel vastleggen (Quick Capture);
5. Zoeken (Zoeken);
6. Recent (Recent);
7. Accounts.

De lage-energiemodus verwijdert secundaire statistieken en beperkt de zichtbare context. De focusmodus verbergt uitsluitend de Canonical-zijbalk terwijl de bedieningselementen voor account en sessie behouden blijven.

## 5. Toegankelijkheidseisen

- etiketten of expliciete toegankelijke namen op elk invoerveld/bedieningselement;
- zichtbare toetsenbordfocus;
- `role=alert` voor geïdentificeerde fouten en `role=status` voor succes;
- geen statuscommunicatie uitsluitend op basis van kleur;
- minimale aanraakdoelgrootte volgt de maatvoering van de canonieke shell;
- dialoogvensters zijn modaal, gelabeld en sluitbaar;
- voorkeur voor verminderde beweging (`reduced-motion`) schakelt niet-essentiële animatie uit;
- consistente plaatsing en tweetalige UA/NL-teksten;
- geen verplichte naamgeving of werkruimteselectie tijdens het vastleggen.

## 6. Acceptatietests

### Basiscontrole (Core sanity)
Maak een werkruimte aan, leg een notitie vast zonder plaatsing, bekijk een AI-/fallback-titel en plaats deze met één actie.

### Hervatten (Resume)
Open een item, vernieuw de pagina, gebruik “Je bent hier gebleven” (“U stopped hier”) en keer terug naar hetzelfde item en dezelfde werkruimte.

### Begrenzing (Guardrail)
Probeer een niet-ondersteund of te groot bestand vast te leggen; toon een kalme foutmelding en maak geen item aan.

### Isolatieregressie (Isolation regression)
Cloud-wijzigingen mogen geen wijzigingen aanbrengen in Mail-routes, Mail-bronmodules, providertokentabellen, CanonicalChrome, AccountMenu of OAuth-gedrag.

### Responsiviteit en toegankelijkheid (Responsive/accessibility)
Op 375×667 blijven Smart Capture, het aanmaken van werkruimtes, plaatsing vanuit Quick Capture, het verlaten van de focusmodus en accountbeheer bereikbaar via toetsenbord en aanraking.

## 7. Uitrolpoorten

1. broncodevalidatie en TypeScript-build;
2. geautomatiseerde E2E-terminalslag;
3. nul runtimefouten in frontend en backend;
4. rollback-Version ID geregistreerd;
5. browsercontrole door de eigenaar op `cloud.tarasevych.com`;
6. provider-OAuth blijft uitgeschakeld tot een afzonderlijk geaccepteerd onderdeel.
