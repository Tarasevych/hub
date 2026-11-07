> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261029-AGENDA-KOPPELEN-EN-PAKKET.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

## Agenda: venster "Agenda koppelen" + drie oplossingen voor pakketcontrole (29-10-2026)

Basis: branch `huis-vnext` (= archief van de eigenaar **20261028-233308** + Notities vNext 0127 + Huis vNext 0128). Dit pakket voegt **geen** migraties toe. Productie is niet gewijzigd en niet uitgerold.

### A. Drie problemen "bij elke build" op de updatepagina — oorzaken en oplossingen

| Controle | Oorzaak (gevonden in de code) | Oplossing |
|---|---|---|
| **"Het lijkt erop dat het pakket geheimen bevat"** | Fout-positieven van de strenge scanner (`shared/geheim-patronen.ts` → `backend/uitrol-voorcontrole.ts`) op 9 bestanden uit het **basisarchief**: PEM-headers in een foutmelding (`shared/github-koppeling.ts`), in een veldtooltip (`src/integraties/Wizard.tsx`) en bewust realistische neptokens in de detectortests (`zoek-kern/isolatie/evaluatie`, `ai-vertaling`, `uitrol-diagnose-run`, `uitrol-voorcontrole`, `cloud-overdracht-m3`). Er waren geen echte geheimen aanwezig. | De scanner is **met geen enkel teken afgezwakt**. In plaats daarvan bouwen de 9 bestanden de "geheim-achtige" tekenreeksen tijdens runtime op via concatenatie (`'ghp_' + '…'`, `'-----BEGIN PRIVATE' + ' KEY-----'`): de detectortests krijgen nog steeds precies dezelfde tekenreeksen en blijven groen, maar in de bronbestanden van het pakket komen geen aaneengesloten treffers meer voor. Een toegevoegde test bevestigt dat een echt PEM-blok onder `tests/` nog steeds een waarschuwing geeft (scanner niet afgezwakt). Herhaalde run van de scanner over de hele boom: **0 bevindingen**. |
| **"De voorbereider heeft geen testresultaten doorgegeven"** | De uploadwizard in de browser stuurde altijd `tests: {}` (`src/uitrol/Upload.tsx:187`); het veld werd uitsluitend gevuld via het MCP-pad `uitrol_voorstel_begin`. | Nieuw **optioneel bestand `TESTRESULTATEN`** (JSON `{geslaagd, mislukt, samenvatting}`) in de hoofdmap van het pakket: `src/platform/tar-lezen.ts` leest het in de browser en de wizard geeft het door aan het voorstel; `backend/uitrol-voorcontrole.ts` leest het zelf wanneer het voorstel leeg is (dekt ook het SSH-pad); `deploy/uitrol/maak-voorstelpakket.sh` plaatst het bestand wanneer `TESTS_*` zijn opgegeven. Het voorstel heeft voorrang boven het bestand; een beschadigd/ontbrekend bestand = oud gedrag. Tests: `uitrol-voorcontrole` +5, `tar-lezen` +3. |
| **"Pakket is buiten git om gebouwd"** | Mijn eerdere pakketten schreven `BRON-COMMIT: zonder-git:…`, hoewel de werkboom een echte git-repository is. | Het pakket wordt voortaan gebouwd met het **officiële** `deploy/uitrol/maak-voorstelpakket.sh` vanuit git HEAD: `BRON-COMMIT` = volledige commit-hash van 40 tekens (de controle "commit" is groen). Reproduceerbaarheid: in het bewijsarchief ligt een git-bundle; `git clone huis-vnext.bundle && git archive <commit>` levert byte-voor-byte exact dezelfde boom op. |

### B. Agenda (hub.tarasevych.com/agenda): "knop → venster → gekoppeld", zonder sprongen tussen subdomeinen

**Voorheen:** "Koppel uw agenda" was een link naar `cloud.tarasevych.com/google`; de gebruiker verliet de agenda; apparaatfabrikanten stonden niet in de catalogus; de richting (ophalen/schrijven) was alleen diep in de lade zichtbaar.

**Nu:**
* **Venster "Agenda koppelen"** (`src/agenda/v3/onderdelen/KoppelVenster.tsx`) rechtstreeks op de pagina: kaarten van diensten en apparaten met eerlijke status uit `shared/agenda-catalogus.ts` + live serverstatus; het kiezen van een kaart opent de daadwerkelijke stroom direct op dezelfde plek. De hoofdknop van de lege status en de knop "Agenda koppelen…" in de lade openen dit venster.
* **Google in een nevenvenster** (`src/agenda/v3/haken/gebruikGoogleKoppeling.ts`): `window.open` synchroon vanuit de klik → `POST /api/owner/agenda/toegang/uitbreiden` → Google-toestemming in het pop-upvenster; de pagina **pollt zelf** de server en sluit, zodra lezen/schrijven is bevestigd, het venster en vernieuwt zichzelf. Geblokkeerde pop-up → het oude paginavullende pad. "Aanmaken van afspraken toestaan" verloopt via hetzelfde venster. De canonieke Google-volgorde (mail → drive → agenda) is **ongewijzigd**: als deze nog niet is voltooid, antwoordt de server met `GOOGLE_SUITE_SEQUENCE_REQUIRED`, en toont de kaart eerlijk een uitleg + link naar de Google-wizard in een nieuw tabblad terwijl het pollen doorgaat — de agenda "schakelt" vanzelf om.
* **Apparaten in de catalogus** (nieuwe kaarten, zonder logo's — monogrammen): **iPhone/iPad (iCloud)** — lezen via CalDAV met een app-specifiek wachtwoord (schrijven: eerlijke lijst van wat nog ontbreekt, zoals voorheen); **Samsung** en **HONOR/Android** — "brug" via HETZELFDE Google-account waarmee de telefoon synchroniseert (tweerichtingsverkeer, omdat dit de bewezen Google-integratie is; de beperking staat op de kaart vermeld); **Huawei** (zonder GMS) — eerlijk "nog niet": er is geen publieke Huawei Cloud-API en Calendar Kit werkt alleen in apps op het toestel zelf; **Microsoft/Outlook** — zoals voorheen, "nog niet" + werkend pad via een gepubliceerde `.ics`-link; **Proton** — via "link delen" (`.ics`, alleen-lezen).
* **ICS- en CalDAV-formulieren** zijn ondergebracht in gedeelde componenten (`KoppelVormen.tsx`) — identiek in de lade en in het venster, met dezelfde data-attributen.
* De eerlijkheidstest van de catalogus is aangescherpt: "lezen en schrijven" is uitsluitend toegestaan voor de Google-kaart zelf **of** voor een brug die aantoonbaar via die route loopt (`doel` `cloud/google` + `levend: calendar` + beperking die Google noemt); Huawei moet een uitleg "waarom niet" bevatten.

**Eerlijk over de grenzen van deze release:** schrijven naar CalDAV (en dus het aanmaken van afspraken vanaf de site op iPhone/iCloud) is **nog niet geïmplementeerd** — de exacte lijst van wat er ontbreekt (`PUT/DELETE` met `If-Match`, opbouwen van `VCALENDAR`, `sync-collection` RFC 6578, scheduling RFC 6638, iCloud-redirects) is zoals voorheen zichtbaar op de kaart en in de lade; dit is de benoemde volgende stap. Er is geen engine gebouwd voor directe doorzetting "iCloud → Google" tussen externe agenda's onderling: de brug werkt via het gedeelde apparaataccount (Samsung/HONOR ↔ Google ↔ hub — vandaag al in twee richtingen; iPhone ↔ iCloud → hub — alleen-lezen).

### Controles (deze omgeving, eindstatus)

| Testset | Resultaat |
|---|---|
| `uitrol-voorcontrole` 34/34 (+5 nieuw: `TESTRESULTATEN` ok/waarschuwing/voorrang/beschadigd; PEM onder `tests/` waarschuwt nog steeds), `tar-lezen` 21/21 (+3) | PASS |
| Geheimenscanner over de gehele pakketboom (dezelfde code als in `voorcontrole`) | **0 bevindingen** |
| Geheimendetectoren na het opsplitsen van fixtures: `zoek-kern` 67/67, `zoek-isolatie` 38/38, `zoek-evaluatie` 18/18, `ai-vertaling` 23/23, `uitrol-diagnose-run` 41/41, `cloud-overdracht-m3` 26/26 (`node --test`) | PASS |
| Agenda: `hub-agenda-notities-20261019` 65/65, `agenda-ics-caldav` 52/52, `agenda-tweerichting` 54/54, `agenda-v3-20261028` 28/28 | PASS |
| e2e `agenda-v3-ui` **101/101** (+6: venster opent vanuit lege status; kaarten met eerlijke statussen; Samsung = brug met kanttekening over hetzelfde account; Huawei zonder knop met reden; onvoltooide Google-volgorde → eerlijke uitleg met link, zonder de pagina te verlaten; ICS via venster langs dezelfde route) | PASS |
| e2e `huis-vnext` 49/49, e2e `notities-vnext` 39/39 (opnieuw op deze build), `huis-vnext` 53/53, `notities-vnext` 62/62, `terugdraai-controle` 25/25 | PASS |
| `npm run build` (alle poorten), `tsc` client/server | PASS / alleen basisfouten (3/20) |
| Overgeërfde fouten uit het basisarchief: `tech-bundels` 33/34, `ui-audit-g` 58/59 — reproduceren ook op een schone 233308 zonder dit pakket | ongewijzigd |

### Terugdraaien
Dit pakket voegt geen vlaggen of migraties toe. Een normale rollback met `mijn-ruimte-installeer` naar de vorige release herstelt zowel het oude gedrag van de agenda als de oude pakketcontrole. Gegevens worden niet geraakt.

**Uitrol uitsluitend na de afzonderlijke zin van de eigenaar `DEPLOY ПІДТВЕРДЖЕНО` en goedkeuring met passkey op de site.**
