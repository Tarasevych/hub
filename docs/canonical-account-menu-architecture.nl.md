> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./canonical-account-menu-architecture.uk.md) · **🇳🇱 Nederlands** ([origineel](./canonical-account-menu-architecture.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# CanonicalAccountMenu: toestandsarchitectuur en contracten

## 1. Doel

`CanonicalAccountMenu` is de canonieke presentatielaag voor het selecteren van een reeds bekend account, het starten van een nieuwe aanmelding, het beëindigen van de huidige sessie en het beheren van de profielfoto. De component bepaalt geen authenticatiebeleid en creëert geen eigen account- of sessiebronnen.

De architectuur is opgedeeld in:

- `src/CanoniekAccountMenu.tsx` — openen en sluiten, uitgeklapte en ingeklapte weergave, aanroepen van doorgegeven gebruikersacties en opbouw van de weergave;
- `src/canoniek-account-menu-model.ts` — identiteit, ontdubbeling, classificatie, `MRU`-volgorde, zichtbaarheid, voorvertoningskandidaten en fotoresolutie;
- `src/canoniek-account-menu.css` — uitsluitend de stijlen voor `CanonicalAccountMenu`;
- sessie-eindpunten van de backend — gezaghebbende status van browsertoekenningen en actieve sessies.

## 2. Overzicht van gegevensbronnen

| Gegevens | Bron | Gezaghebbendheid | Gebruik |
|---|---|---:|---|
| Huidig account | actieve tab- en sessiegegevens (`user`) | hoogste | uitsluitend de menukop |
| Bekende accounts | `/api/owner/session/accounts → accounts` | gezaghebbend | classificaties voor bekend, aangemeld en herauthenticatie |
| `snapshot.previews` | backend-projectie van dezelfde browsertoekenningen | verouderd, geen aparte bron | behouden voor compatibiliteit, niet gebruikt als providerkandidaat |
| Externe kandidaten | `externalCandidates` met expliciete bron van aanbieder of browser | alleen gezaghebbend bij een echte feed | voorvertoning voor account toevoegen |
| Lokale geschiedenis | `tsv-recent-account-previews-v1` (verouderde `tsv_recent_account_previews_v1` wordt eenmalig gemigreerd en verwijderd) | ondersteunend | verfijnt uitsluitend de `MRU`-volgorde van reeds gezaghebbende identiteiten |
| Aangepaste foto | `user.customPicture === true` + `user.picture`, of `customPhoto`/`customPicture`-URL | gezaghebbend voor weergave | eerste fotoprioriteit |
| Foto van aanbieder | `providerPicture` of standaard `picture` | secundair | tweede fotoprioriteit |

De geschiedenis maakt geen `knownAccounts`, `signedInAccounts`, `reauthAccounts` of `externalConnectableCandidates` aan.

## 3. Eerdere duplicatie en oplossing

Vóór de consolidatie stelde `CanoniekAccountMenu.tsx` afzonderlijk het volgende samen:

1. `previewCandidates` uit `accounts + previews + history`;
2. `quickPreviews` via herhaalde status- en toestemmingsfiltering;
3. `connectionPreviews` via een tweede, tegenstrijdige status- en geschiedenisfiltering;
4. `authorizedAccountCount` via een derde identiteits- en statusfiltering;
5. `accountRows = snapshot.accounts`, waardoor het huidige account opnieuw in de uitgeklapte lijst werd getoond.

`App.tsx` en `VerenigdDienstApp.tsx` vervingen bovendien ontbrekende `previews` door de reeks `accounts`, waardoor nog een parallel voorvertoningsmodel ontstond.

Bewijs dat de oude logica voor verbindingsvoorvertoning niet gezaghebbend was: de backend-functie `ownerGrantMenuData` vormde `accounts` en `previews` uit dezelfde set browser-toestemmingscookies. `previews` verschilde uitsluitend in de zichtbaarheidsregel voor het menu en de limiet, maar was geen ontdekkingsstroom van de aanbieder of browser. Daarom kan het geen bron zijn voor `externalConnectableCandidates`.

## 4. Identiteit en ontdubbeling

Het enige contract is `isSameAccount(left, right)`:

1. als beide zijden een stabiel `id`/`accountId` hebben, worden uitsluitend deze identificaties vergeleken;
2. het genormaliseerde e-mailadres wordt alleen gebruikt wanneer een stabiele identificatie aan ten minste één zijde ontbreekt;
3. er zijn geen accountspecifieke uitzonderingen.

`accountIdentityKey` wordt uitsluitend gebruikt als stabiele React-sleutel (`key`) en als ondersteunend deterministisch volgordecriterium. Alle reeksen worden ontdubbeld via `isSameAccount`.

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

1. `currentAccount` wordt uitsluitend in de menukop weergegeven.
2. `otherKnownAccounts = knownAccounts - currentAccount` via `isSameAccount`.
3. `signedInAccounts` bevat uitsluitend `active` of `signed_in`.
4. `externalConnectableCandidates` is uitsluitend afkomstig uit een expliciete externe stroom, niet uit geschiedenis, toestemmingsvoorvertoning of de herauthenticatielijst.
5. De voorvertoning dupliceert nooit een huidige of bekende identiteit.
6. `MRU`-sortering verloopt uitsluitend via `sortAccountsByMru`.
7. Identiteitsvergelijking verloopt uitsluitend via `isSameAccount`.
8. Alle profielafbeeldingen gebruiken `resolveAccountPhoto`.

## 6. Toestandsautomaat en zichtbaarheid

### Menustatus

- `closed` — paneel is niet aangekoppeld;
- `open/collapsed` — paneel is geopend, de lijst met overige accounts is ingeklapt;
- `open/expanded` — paneel is geopend, `visibleExpandedAccounts` wordt weergegeven.

Wanneer `shouldShowOtherAccountsToggle === false`, wordt `expanded` geforceerd teruggezet naar `false`.

### Accountscenario's

| Scenario | Gedrag |
|---|---|
| `currentAccount === null && knownAccounts.length === 0` | actieknop voor aanmelden via aanbieder; schakelknop en voorvertoning ontbreken |
| Eén huidig account | schakelknop ontbreekt |
| Huidig + minimaal één ander bekend account | schakelknop zichtbaar |
| Uitgeklapte toestand | lijst bevat uitsluitend `otherKnownAccounts` |
| Twee of meer aangemelde identiteiten | knop om bij alle accounts af te melden zichtbaar |
| Alleen herauthenticatie- of geschiedenis-identiteiten | verhoogt het aantal aangemelde accounts niet |

## 7. Voorvertoningsregels

- Ingeklapte schakelvoorvertoning: `otherSignedInAccounts`, `MRU`-volgorde, maximaal `MAX_PREVIEW_ACCOUNTS = 3`.
- Uitgeklapte toevoegvoorvertoning: uitsluitend `externalConnectableCandidates`, `MRU`-volgorde, maximaal 3.
- `reauthAccounts`, `knownAccounts`, `signedInAccounts`, verouderde `previews` en geschiedenis mogen niet worden gebruikt voor de toevoegvoorvertoning.
- Als er geen kandidaten zijn, wordt de voorvertonings-`JSX` niet aangekoppeld.
- Ingeklapte en uitgeklapte voorvertoningen sluiten elkaar wederzijds uit in `JSX`; `CSS` verbergt geen overtollige `DOM`-elementen.

Zolang de backend geen geverifieerde ontdekkingsstroom van aanbieder of browser heeft, retourneert deze `externalCandidates: []`. Dit is een bewust veilig-gesloten contract: het is beter om geen illustratie te tonen dan om geschiedenis of een toekenning voor te stellen als een beschikbaar extern account.

## 8. Fototerugval

`resolveAccountPhoto(account)` hanteert één vaste volgorde:

1. aangepaste profielfoto;
2. profielfoto van de aanbieder;
3. initialen.

De URL wordt verwerkt via `normalizeAvatarUrl`. De weergave van afbeeldingen gebeurt met `StableAvatar`, dat het laden vooraf verifieert. Een mislukte afbeelding valt terug op initialen zonder gebroken-afbeeldingsicoon van de browser en zonder oneindige `onError`-lus.

## 9. Camerabediening

Het bestandskiezercontract is ongewijzigd:

- `image/jpeg`;
- `image/png`;
- `image/webp`.

De cameraknop heeft een vaste afmeting, `aria-label`, systeemeigen scherminfo (`title`), `aria-busy`, uitgeschakelde en bezige toestand, `:focus-visible`-omlijning en expliciete contrastvariabelen voor het lichte, donkere, pruim-lichte en pruim-donkere thema.

De backend controleert zoals voorheen het `MIME`-type, de bestandskenmerken en de bestandsgrootte, slaat de aangepaste foto op en overschrijft deze niet bij een volgende Google-aanmelding.

## 10. Risico's en grenzen

- De externe toevoegvoorvertoning is bewust leeg totdat er een afzonderlijke, geverifieerde stroom van aanbieder of browser beschikbaar is.
- Verouderde `snapshot.previews` is niet verwijderd uit het transporttype om de compatibiliteit niet te verbreken; het model negeert dit veld.
- De stromen voor authenticatie, onthouden accountwissel, huidig account afmelden, account in browser vergeten en overal afmelden blijven ongewijzigd.
- Het menu voert geen netwerkpeiling uit en slaat geen authenticatietokens op.

## 11. Regressiematrix

Blokkerende tests en audits dekken het volgende af:

1. eerste start;
2. één account;
3. twee accounts — ingeklapte toestand;
4. twee accounts — uitgeklapte toestand;
5. zichtbaarheid van overal afmelden;
6. 3–4 accounts en `MRU`-limiet en -volgorde;
7. kapotte foto van aanbieder → initialen;
8. prioriteit van aangepaste foto;
9. uitsluitend externe kandidaten voor toevoegvoorvertoning;
10. huidig account uitsluitend in de menukop;
11. wederzijds uitsluitende voorvertonings-`JSX`;
12. mobiel weergavevenster;
13. contrast-, focus- en bezetcontracten van de cameraknop;
14. vrijgave- en terugdraaimetadata.
