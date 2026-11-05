> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./INTEGRATIE-20261027.uk.md) · **🇳🇱 Nederlands** ([origineel](./INTEGRATIE-20261027.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Mijn Ruimte · Universal File Workspace v0.3 · integratie boven op release 2026-10-27 21:14:25

**Bron:** door de eigenaar aangeleverde archief `mijn-ruimte-20261027-211425.tar.gz`. **Modus:** nieuwe kandidaat-build zonder uitrol op de server.

## 0. Auditconclusie

In de nieuwste build bestaat al een uitgebreide bestandsweergave voor talloze formaten. Daarom is het oude idee «PDF-/Office-/archiefviewers vanaf nul bouwen» geschrapt. Formaatdefinities en renderers zijn **niet overschreven**. Van de oude UFW v0.2 zijn de contracten en tests ondergebracht in het geïsoleerde `integrations/universal-file-workspace-core-v0.2/`, en de integratielaag v0.3 hergebruikt de bestaande renderers.

Bevestigd door de code van het laatste archief:

- `src/MailBijlageVoorbeeld.tsx` — grote formaatdispatcher; afzonderlijke renderers voor PDF, DOCX, spreadsheet, presentatie, archief, handtekening, media en gespecialiseerde formaten.
- `src/MailBijlageVensters.tsx` — afzonderlijke versleepbare/herschaalbare Mail-vensters met het systeem `platform/vensters`.
- `src/DriveBrowser.tsx` — Google Drive **hergebruikt al** `loadMailAttachmentPreviewFromBlob` en `MailAttachmentPreviewBody`.
- `shared/bestandsformaten.ts` — gedeelde taxonomie van 13 bestandsfamilies voor de UI.
- `src/platform/vensters.tsx` — centrale vensterbeheerder, dock, prioriteiten en geometrie.
- `src/mail-bijlage-lader.ts` — lezen van e-mailbijlage-chunks, limiet van 32 MiB, cache en gelijktijdigheidslimiet.
- `package.json` — bevat al `pdfjs-dist`, `pdf-lib`, `officeparser`, `xlsx`, `fflate`, `tesseract.js` en andere bibliotheken.

Let op: de aanwezigheid van bronmodules **bewijst niet** dat alle afzonderlijke formaten in een echte browser en met een echt bestand werken. Voor die scenario's zijn er afzonderlijke acceptatietests.

### Identiteitswijziging (belangrijk)

In het nieuwe `backend/deployment-identity.ts` is de canonieke toestand **self-hosted**, `APP_ID='migrated-bg2v4h'`, `API_COOKIE_PATH='/'`, subdomeinen `*.tarasevych.com`. Historische waarden `app-8ppuax` en `c28444ec7eb73654e9` **niet terugzetten**. Bestanden voor authenticatie, OAuth, beleid, proxyconfiguratie, DB-migraties, Service Worker en de installer zelf zijn ongewijzigd gebleven.

## 1. Wijzigingen in v0.3

| Bestand | Actie | Gevolg |
|---|---|---|
| `src/bestand/universeel-bestand.ts` | Toegevoegd | Centrale `openUniverseelBestand()` voor geautoriseerde `Blob`, bronnenlijst, lazy-mount-wachtrij, voorvertoningslimiet van 32 MiB, max. 4 vensters, opschonen van wachtende blobs bij sessiewissel |
| `src/bestand/UniverseelBestandVenster.tsx` | Toegevoegd | Gedeeld adaptief venster in het **bestaande** systeem `Venster`, `MailAttachmentPreviewContent`, bron, grootte, download, lokale bestandskiezer |
| `src/bestand/universeel-bestand.css` | Toegevoegd | Geïsoleerde klassen, mobiele aanpassing, zonder `!important` |
| `src/MailBijlageVoorbeeld.tsx` | 1 export | Bestaande zuivere `MailAttachmentPreviewContent` opengesteld voor andere diensten; geen enkele algoritmewijziging |
| `src/DriveBrowser.tsx` | 1 UI-knop | `У спільному вікні / In gedeeld venster` in de al bestaande Google Drive-voorvertoning: hergebruik van de reeds geautoriseerde `preview.blob` |
| `src/MailBijlageVensters.tsx` | Adapter voorbereid | Legacy Mail blijft actief, overstap naar gedeeld venster is tot QA geblokkeerd met de conservatieve vlag `UNIVERSELE_MAIL_ENABLED=false` |
| `integrations/universal-file-workspace-core-v0.2/` | Toegevoegd, geïsoleerd | v0.2-bronregister, engineregister, getypeerde contracten, sniff en zelfstandig testpakket: in productie nog NIET ingeschakeld |

**Niet uitgevoerd:** backend-endpoint `/api/owner/universal-files/v1/*`; server-side bronadapters voor GitHub/Dropbox/OneDrive; engine-instellingen met een echt register van geïnstalleerde renderer-implementaties; conversie, samenvoegen, splitsen, cryptografische handtekeningvalidatie; productie-uitrol. Bestaande externe viewerpakketten zijn niet vervangen door verzonnen equivalenten.

## 2. Contract voor andere componenten

```tsx
import {openUniverseelBestand} from '../bestand/universeel-bestand';

// Controleer in de betreffende dienst eerst sessie, owner/space, connector-rechten,
// account en bijbehorende provider-autorisatie, en haal de Blob op via de bestaande backend.
openUniverseelBestand({
  bron: 'github', // ook 'mail'|'google-drive'|'private-cloud'|'browser-file' en andere
  bestand: alreadyAuthorizedBlob,
  bestandsnaam: 'README.md',
  contentType: 'text/markdown',
  bronLabel: 'GitHub',
});
```

Geef nooit een OAuth-geheim, token, cookie, ondertekende URL, bestandssysteempad of willekeurig extern adres mee. De viewer mag zelf geen URL's uit `intent` downloaden. Deze API is uitsluitend bedoeld voor een `Blob` die al rechtmatig door de bron is opgehaald. Gebruik voor server-side handle-scenario's na de volgende fase een afzonderlijk gecontroleerd ACL-endpoint.

## 3. Controleren en inschakelen

1. Rol de kandidaat **alleen in staging** uit na SHA256-controle, zonder automatische productie-overschrijving.
2. Gebruik Node.js **24+** (vereiste van dit specifieke `package.json`), installeer afhankelijkheden met `npm ci`, en voer `npm run build` en `npm run typecheck:server` uit.
3. Chrome-E2E met echte authenticatie: open PDF/DOCX/XLSX/PPTX, ZIP/ASiC, P7S, ICS/VCF, onbekend formaat, leeg/beschadigd/zeer groot bestand, mobiel/pc-venster; controleer bestaande inline voorvertoningen en upload/download.
4. Controleer de nieuwe knop in Google Drive: deze gebruikt **dezelfde bytes**, maakt nooit een nieuwe OAuth-grant aan; terugnavigatie en scrollpositie blijven behouden.
5. Controleer dat er geen lek is tussen 2 Gmail/Drive-accounts, tussen persoonlijke en technische ruimte, bij uitloggen, wisselen van tabblad, cache-TTL en dat er geen ruwe gegevens in `localStorage` terechtkomen.
6. Zet pas na QA `UNIVERSELE_MAIL_ENABLED` op `true` en herhaal de volledige reeks mail-regressie-E2E-tests; tot die tijd werken de bestaande mailvensters ongewijzigd.
7. Sluit na een geslaagde gefaseerde uitrol geleidelijk extra bronnen aan via hun bestaande ACL-backend-endpoints, zonder universeel SSRF-fetch-endpoint.

## 4. Verdeling van parallelle agenten

- **Agent A — inventaris:** controleer verplicht alle huidige `*Voorbeeld`-modules, MIME/magic-bytes, rechten, cache, asynchrone chunks en regressie van oude voorvertoningen. Niets herschrijven.
- **Agent B — adapters:** bronnen Google Drive, privé-Cloud, GitHub, OneDrive/Dropbox uitsluitend waar geautoriseerde provider-endpoints bestaan. Geen ruwe URL's of tokens in client-side `FileRef`.
- **Agent C — UX:** integratie-`Venster`, modi narrow/mobile/wide, bronvermelding, toegangsstaten, afmetingen, meerdere vensters, toetsenbord, schermlezers en ongewijzigde `CanonicalChrome`.
- **Agent D — engines/QA:** diagnosticeer feitelijke voorvertoningsimplementaties, formaten, schadelijke macro's/HTML/SVG, ZIP-bommen, terugval en limieten, licentiebeperkingen; voeg het engineregister pas toe nadat de uitvoerbare pakketten zijn geïdentificeerd.
- **Integrator:** eigenaar van de enige basisbranch en het releasemanifest, synchronisatie van merges; geen enkele parallelle aftakking mag nieuwere productiebestanden vervangen door oudere.

## 5. Bekende beperkingen van controles in de voorbereidingsomgeving

- ✅ v0.2 geïsoleerde kern: 34/34 eenheidstests.
- ✅ v0.3 brug: 15/15 invarianten.
- ✅ `node scripts/kaart-controle.mjs --stil` — geslaagd, één **reeds bestaande waarschuwing** over de naam `bewerker-schil-20261026.test.ts`.
- ✅ TypeScript `transpileModule` heeft de syntaxis van de 5 betrokken gewijzigde/nieuwe bestanden gecontroleerd.
- ⚠️ Volledige Vite/React-build en E2E **niet uitgevoerd**: aanwezige Node.js is 22.16.0 terwijl de app 24+ vereist, `npm ci` is niet voltooid, benodigde afhankelijkheden ontbreken.
- ⚠️ `plaatsing-controle.mjs` kon niet worden uitgevoerd wegens een ontbrekende afhankelijkheid; dit bewijst geen defect in de code zelf.
- ⚠️ `universal-file-workspace-core-v0.2` is runtime nog niet aangesloten als bron van waarheid: het pakket is bewaard voor een gecontroleerde, stapsgewijze migratie.

Noem dit archief niet deployed of klaar voor productie: het is een **kandidaat in afwachting van een volledige build en QA**.
