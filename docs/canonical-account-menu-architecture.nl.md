> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./canonical-account-menu-architecture.uk.md) · **🇳🇱 Nederlands** ([origineel](./canonical-account-menu-architecture.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# CanonicalAccountMenu: toestandsarchitectuur en contracten

## 1. Doel

`CanonicalAccountMenu` is de canonieke presentatielaag voor het selecteren van een reeds bekend account, het starten van een nieuwe aanmelding, het beëindigen van de huidige sessie en het beheren van de profielfoto. De component bepaalt geen authenticatiebeleid en creëert geen eigen account- of sessiebronnen.

De architectuur is opgedeeld in:

- `src/CanoniekAccountMenu.tsx` — openen/sluiten, uitgeklapte/ingeklapte UI, aanroepen van doorgegeven gebruikersacties en weergave (rendering);
- `src/canoniek-account-menu-model.ts` — identiteit, ontdubbeling (deduplication), classificatie, MRU, zichtbaarheid, voorvertoningskandidaten en fotoresolutie;
- `src/canoniek-account-menu.css` — uitsluitend de stijlen voor CanonicalAccountMenu;
- backend-sessie-eindpunten — gezaghebbende status van browser-grants en actieve sessies.

## 2. Overzicht van gegevensbronnen

| Gegevens | Bron | Gezaghebbendheid | Gebruik |
|---|---|---:|---|
| Huidig account | actieve tab-/sessie-payload (`user`) | hoogste | uitsluitend de menukop (header) |
| Bekende accounts | `/api/owner/session/accounts → accounts` | gezaghebbend | classificaties voor known/signed-in/reauth |
| `snapshot.previews` | backend-projectie van dezelfde browser-grants | verouderd (legacy), geen aparte bron | behouden voor compatibiliteit, niet gebruikt als providerkandidaat |
| Externe kandidaten | `externalCandidates` met expliciete `source: provider of browser` | alleen gezaghebbend bij een echte feed | voorvertoning voor account toevoegen |
| Lokale geschiedenis | `tsv-recent-account-previews-v1` (legacy `tsv_recent_account_previews_v1` wordt eenmalig gemigreerd en verwijderd) | ondersteunend | verfijnt uitsluitend de MRU van reeds gezaghebbende identiteiten |
| Aangepaste foto | `user.customPicture === true` + `user.picture`, of `customPhoto/customPicture`-URL | gezaghebbend voor weergave | eerste fotoprioriteit |
| Providerfoto | `providerPicture` of standaard `picture` | secundair | tweede fotoprioriteit |

De geschiedenis maakt geen `knownAccounts`, `signedInAccounts`, `reauthAccounts` of `externalConnectableCandidates` aan.

## 3. Eerdere duplicatie en oplossing

Vóór de consolidatie stelde `CanoniekAccountMenu.tsx` afzonderlijk het volgende samen:

1. `previewCandidates` uit `accounts + previews + history`;
2. `quickPreviews` via herhaalde status-/grant-filtering;
3. `connectionPreviews` via een tweede, tegenstrijdige status-/geschiedenisfiltering;
4. `authorizedAccountCount` via een derde identiteits-/statusfiltering;
5. `accountRows = snapshot.accounts`, waardoor het huidige account opnieuw in de uitgeklapte lijst werd getoond.

`App.tsx` en `VerenigdDienstApp.tsx` vervingen bovendien ontbrekende `previews` door de array `accounts`, waardoor nog een parallel voorvertoningsmodel ontstond.

Bewijs dat de oude connection-preview-logica niet gezaghebbend was: de backend-functie `ownerGrantMenuData` vormde `accounts` en `previews` uit dezelfde set browser-grant-cookies. `previews` verschilde uitsluitend in de zichtbaarheidsregel voor het menu en de limiet, maar was geen ontdekkingsfeed (discovery feed) van de provider of browser. Daarom kan het geen bron zijn voor `externalConnectableCandidates`.

## 4. Identiteit en ontdubbeling (deduplication)

Het enige contract is `isSameAccount(left, right)`:

1. als beide zijden een stabiel `id/accountId` hebben, worden uitsluitend deze ID's vergeleken;
2. het genormaliseerde e-mailadres wordt alleen gebruikt wanneer een stabiel ID aan ten minste één zijde ontbreekt;
3. er zijn geen accountspecifieke uitzonderingen.

`accountIdentityKey` wordt uitsluitend gebruikt als stabiele React-sleutel (`key`) en als ondersteunende deterministische tie-breaker. Alle arrays worden ontdubbeld via `isSameAccount`.

## 5. Uniform model

`buildCanonicalAccountMenuModel` retourneert:

- `currentAccount`;
- `knownAccounts`;
- `otherKnownAccounts`;
- `signedInAccounts`;
- `otherSignedInAccounts`;
- `reauthAccounts`;
- `visibleExpandedAccounts`;
- `externalConnectableCandidates`;
- `collapsedSwitchPreviewAccounts`;
- `expandedAddPreviewAccounts`;
- `shouldShowOtherAccountsToggle`;
- `shouldShowLogoutAll`;
- `isFirstLogin`.

### Onschendbare invarianten

1. `currentAccount` wordt uitsluitend in de header gerenderd.
2. `otherKnownAccounts = knownAccounts - currentAccount` via `isSameAccount`.
3. `signedInAccounts` bevat uitsluitend `active` of `signed_in`.
4. `externalConnectableCandidates` is uitsluitend afkomstig uit een expliciete externe feed, niet uit geschiedenis, grants-preview of de reauth-lijst.
5. De voorvertoning dupliceert nooit een huidige of bekende identiteit.
6. MRU-sortering verloopt uitsluitend via `sortAccountsByMru`.
7. Identiteitsvergelijking verloopt uitsluitend via `isSameAccount`.
8. Alle avatars gebruiken `resolveAccountPhoto`.

## 6. Toestandsmachine (state machine) en zichtbaarheid

### Menustatus

- `closed` — paneel is niet gemount;
- `open/collapsed` — paneel is geopend, de lijst met overige accounts is ingeklapt;
- `open/expanded` — paneel is geopend, `visibleExpandedAccounts` wordt weergegeven.

Wanneer `shouldShowOtherAccountsToggle === false`, wordt `expanded` geforceerd teruggezet naar `false`.

### Accountscenario's

| Scenario | Gedrag |
|---|---|
| `currentAccount === null && knownAccounts.length === 0` | CTA `Увійти в обліковий запис через` (Inloggen op account via); schakelknop en voorvertoning ontbreken |
| Eén huidig account | schakelknop ontbreekt |
| Huidig + minimaal één ander bekend account | schakelknop zichtbaar |
| Uitgeklapt (`expanded`) | lijst bevat uitsluitend `otherKnownAccounts` |
| Twee of meer ingelogde identiteiten | `Вийти з усіх облікових записів` (Uitloggen bij alle accounts) zichtbaar |
| Alleen reauth-/geschiedenis-identiteiten | verhoogt het aantal ingelogde accounts niet |

## 7. Voorvertoningsregels (preview rules)

- Ingeklapte schakelvoorvertoning: `otherSignedInAccounts`, MRU, maximaal `MAX_PREVIEW_ACCOUNTS = 3`.
- Uitgeklapte toevoegvoorvertoning: uitsluitend `externalConnectableCandidates`, MRU, maximaal 3.
- `reauthAccounts`, `knownAccounts`, `signedInAccounts`, verouderde `previews` en geschiedenis mogen niet worden gebruikt voor de toevoegvoorvertoning.
- Als er geen kandidaten zijn, wordt de voorvertonings-JSX niet gemount.
- Ingeklapte en uitgeklapte voorvertoningen sluiten elkaar wederzijds uit in JSX; CSS verbergt geen overtollige DOM-elementen.

Zolang de backend geen geverifieerde ontdekkingsfeed van provider of browser heeft, retourneert deze `externalCandidates: []`. Dit is een bewust fail-closed-contract: het is beter om geen illustratie te tonen dan om geschiedenis of een grant voor te stellen als een beschikbaar extern account.

## 8. Fototerugval (photo fallback)

`resolveAccountPhoto(account)` hanteert één vaste volgorde:

1. aangepaste foto (`custom photo`);
2. providerfoto (`provider photo`);
3. initialen (`initials`).

De URL wordt verwerkt via `normalizeAvatarUrl`. Het renderen van afbeeldingen gebeurt met `StableAvatar`, dat het laden vooraf verifieert. Een mislukte afbeelding valt terug op initialen zonder gebroken-afbeeldingsicoon van de browser en zonder oneindige `onError`-lus.

## 9. Camerabediening

Het bestandskiezercontract is ongewijzigd:

- `image/jpeg`;
- `image/png`;
- `image/webp`.

De cameraknop heeft een vaste afmeting, `aria-label`, systeemeigen tooltip (`title`), `aria-busy`, uitgeschakelde/bezige status, `:focus-visible`-omlijning en expliciete contrastvariabelen voor de thema's light, dark, plum-light en plum-dark.

De backend controleert zoals voorheen het MIME-type, de magic bytes en de bestandsgrootte, slaat de aangepaste foto op en overschrijft deze niet bij een volgende Google-aanmelding.

## 10. Risico's en grenzen

- De externe toevoegvoorvertoning is bewust leeg totdat er een afzonderlijke, geverifieerde provider-/browserfeed beschikbaar is.
- Verouderde `snapshot.previews` is niet verwijderd uit het transporttype om de compatibiliteit niet te verbreken; het model negeert dit veld.
- De stromen voor authenticatie, onthouden accountwissel, huidig account uitloggen, account in browser uitloggen en overal uitloggen blijven ongewijzigd.
- Het menu voert geen netwerkpolling uit en slaat geen authenticatietokens op.

## 11. Regressiematrix

Blokkerende tests en audits dekken het volgende af:

1. eerste start;
2. één account;
3. twee accounts — ingeklapt (`collapsed`);
4. twee accounts — uitgeklapt (`expanded`);
5. zichtbaarheid van overal uitloggen (`logout-all`);
6. 3–4 accounts en MRU-limiet/volgorde;
7. kapotte providerfoto → initialen;
8. prioriteit van aangepaste foto;
9. uitsluitend externe kandidaten voor toevoegvoorvertoning;
10. huidig account uitsluitend in de header;
11. wederzijds uitsluitende voorvertonings-JSX;
12. mobiele viewport;
13. contrast-, focus- en busy-contracten van de cameraknop;
14. release- en rollback-metadata.
