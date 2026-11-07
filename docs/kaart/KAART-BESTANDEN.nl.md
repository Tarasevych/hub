> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./KAART-BESTANDEN.uk.md) · **🇳🇱 Nederlands** ([origineel](./KAART-BESTANDEN.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Bestandskaart «wat staat waar» — hernoeming naar het Nederlands, 24.10.2026

Alle Engelse bestandsnamen van de sitecode (src, backend, shared, server, tests, scripts) zijn volgens één woordenlijst naar het Nederlands hernoemd: **531 bestanden**, terwijl **29** bestanden bewust hun oude naam hebben behouden (zie hieronder). De inhoud van de bestanden is niet gewijzigd — alleen importpaden en padverwijzingen. De machineleesbare versie van deze kaart is `docs/kaart/bestandskaart.json`; de build (`npm run build`) voert `scripts/kaart-controle.mjs` uit, dat controleert of elk nieuw pad bestaat, er geen oud pad is teruggekeerd en er in code, tests en documenten geen verwijzingen naar oude paden staan. Een nieuwe Engelse bestandsnaam geeft een waarschuwing met een Nederlandse suggestie.

**Hoe vind je een bestand op de oude naam:** zoek de oude naam op deze pagina of in `bestandskaart.json` (veld `oud`).

**Mappen:** `src/search` → `src/zoek`, `src/flags` → `src/vlaggen`, `src/remote` → `src/extern`.

**Nieuwe bestanden na de hernoeming** staan in de laatste sectie («Toegevoegd na de hernoeming»); ze staan ook in `bestandskaart.json` (veld `toegevoegd`), en de build stopt als zo'n bestand niet meer bestaat.

## Woordenlijst (meest voorkomende woorden)

| EN | NL | bestanden |
|---|---|---|
| editor | bewerker | 38 |
| preview | voorbeeld | 36 |
| capabilities | mogelijkheden | 32 |
| content | inhoud | 32 |
| view | weergave | 28 |
| admin | beheer | 22 |
| canonical | canoniek | 19 |
| zoeken | zoek | 17 |
| reader | lezer | 16 |
| store | opslag | 11 |
| compose | opstel | 10 |
| paneel | paneel | 10 |
| bijlage | bijlage | 10 |
| dialog | dialoog | 10 |
| bericht | bericht | 10 |
| extension | extensie | 9 |
| settings | instellingen | 9 |
| tools | hulpmiddelen | 8 |
| data | gegevens | 8 |
| beveiliging | beveiliging | 7 |
| service | dienst | 7 |
| notification | melding | 7 |
| access | toegang | 6 |
| vault | kluis | 6 |
| opdrachten | opdrachten | 6 |
| flags | vlaggen | 6 |
| layout | indeling | 6 |
| preferences | voorkeuren | 6 |
| remote | extern | 6 |
| rij | rij | 6 |
| music | muziek | 6 |
| plane | laag | 5 |
| assets | bundels | 5 |
| smart | slim | 5 |
| agents | agenten | 5 |
| functional | functioneel | 5 |
| toolbar | werkbalk | 5 |
| archive | archief | 5 |
| bioinformatics | bioinformatica | 5 |
| density | dichtheid | 5 |
| profile | profiel | 5 |
| engineering | techniek | 5 |
| fixed | vast | 5 |
| graphics | grafisch | 5 |
| medical | medisch | 5 |
| navigation | navigatie | 5 |
| network | netwerk | 5 |
| prepress | drukvoorbereiding | 5 |
| presentation | presentatie | 5 |
| quick | snel | 5 |
| scientific | wetenschappelijk | 5 |
| spreadsheet | rekenblad | 5 |
| threat | dreiging | 5 |
| toestand | toestand | 5 |
| calendar | agenda | 4 |
| center | centrum | 4 |
| workspace | werkruimte | 4 |
| kaart | kaart | 4 |
| finance | financien | 4 |
| font | lettertype | 4 |

Ongewijzigd: namen van diensten en formaten (Google, GitHub, MCP, AI, PDF, CalDAV…), in de Nederlandse IT gangbare woorden (mail, menu, account, browser, server, agent, app, chat, cloud, tab, model, context, platform, media, document, database, site, hub, dashboard, connector, console, widget, client) en codeconventies (`use…` voor React-hooks, `index`, `main`, `App`).

## Wat niet is hernoemd en waarom

| Bestand | Reden |
|---|---|
| `backend/ai-beleid.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/beleid.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/connector-v2.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/connectors-crypto.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/deployment-identity.ts` | installeer-app.sh en apparaat-inrichten.sh lezen PUBLIC_DOMAIN uit dit bestand |
| `backend/eigenaar-besluit.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/index.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/remote-bureaublad.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/server-beheer.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/uitrol-github.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/uitrol-goedkeuring.ts` | genoemd in deploy/ (scripts, units, agent) |
| `backend/zoek/bronnen.ts` | genoemd in deploy/ (scripts, units, agent) |
| `scripts/build-server.mjs` | de voorcontrole van de geïnstalleerde versie eist dit bestand in elk pakket |
| `scripts/google-login-instellen.ps1` | genoemd in deploy/ (scripts, units, agent) |
| `scripts/installer/Install-MijnRuimte.cmd` | download voor gebruikers (naam zichtbaar) |
| `scripts/installer/install-mijn-ruimte.sh` | download voor gebruikers (naam zichtbaar) |
| `scripts/rook-controle.mjs` | aangeroepen door de installer op de server |
| `server/apparaat-koppelcode.ts` | genoemd in deploy/ (scripts, units, agent) |
| `server/migrate.ts` | de voorcontrole van de geïnstalleerde versie eist dit bestand in elk pakket |
| `server/pg-versie.ts` | genoemd in deploy/ (scripts, units, agent) |
| `shared/ai-beleid/model.ts` | genoemd in deploy/ (scripts, units, agent) |
| `shared/ai-ruimte.ts` | genoemd in deploy/ (scripts, units, agent) |
| `shared/ai-verbinding.ts` | genoemd in deploy/ (scripts, units, agent) |
| `shared/mcp-klant-model.ts` | genoemd in deploy/ (scripts, units, agent) |
| `shared/terminal-opdrachten.ts` | genoemd in deploy/ (scripts, units, agent) |
| `shared/uitrol-codes.ts` | genoemd in deploy/ (scripts, units, agent) |
| `src/App.tsx` | conventie |
| `src/index.css` | conventie |
| `src/main.tsx` | ingang (index.html) |

Eveneens ongewijzigd: `migrations/` (migratienamen zijn vastgelegd in de database), systemd-timers en taaknamen in `cron.json`, `public/`, `extension/` (afzonderlijk extensiepakket), `index.html`, `vite.config.ts`, namen van npm-commando's (`npm run build` enz.), en de uitvoerbestanden `dist-server/*.mjs` (deze worden aangeroepen door de installer).

## E-mail — berichtlezer («Adaptive Mail Canvas») (33)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/mail-uitstel.ts` | `backend/mail-snooze.ts` | export: `createMailSnoozeRoutes` |
| `src/GoogleMailWerkruimte.tsx` | `src/GoogleMailWorkspace.tsx` | export: `GoogleMailWorkspace (default)` |
| `src/MailBerichtTekst.tsx` | `src/MailMessageBody.tsx` | export: `MailMessageBody (default)` |
| `src/MailDichtheidProfielBewerker.tsx` | `src/MailDensityProfileEditor.tsx` | export: `MailDensityProfileEditor (default)` |
| `src/MailGeminimaliseerdeViewer.tsx` | `src/MailMinimizedViewer.tsx` | export: `MailMinimizedViewer (default)` |
| `src/MailGeordendDichtheidBlokken.tsx` | `src/MailOrderedDensityBlocks.tsx` | export: `MailOrderedDensityBlocks (default)` |
| `src/MailGesprekInhoud.tsx` | `src/MailThreadContent.tsx` | export: `MailThreadContent (default)` |
| `src/MailLezerAi.tsx` | `src/MailReaderAi.tsx` | export: `MailReaderAi (default)` |
| `src/MailLezerN09Dialoog.tsx` | `src/MailReaderN09Dialog.tsx` | export: `MailReaderN09Dialog (default)` |
| `src/MailLezerN10Dialoog.tsx` | `src/MailReaderN10Dialog.tsx` | export: `MailReaderN10Dialog (default)` |
| `src/MailLezerOrdenDialoog.tsx` | `src/MailReaderOrganizeDialog.tsx` | export: `MailReaderOrganizeDialog (default)` |
| `src/MailLezerWerkbalk.tsx` | `src/MailReaderToolbar.tsx` | export: `MailReaderToolbar (default)` |
| `src/MailLezerZoekNavigator.tsx` | `src/MailReaderSearchNavigator.tsx` | export: `MailReaderSearchNavigator (default)` |
| `src/MailUitstelBediening.tsx` | `src/MailSnoozeControl.tsx` | export: `MailSnoozeControl (default)` |
| `src/MailVertalingBalk.tsx` | `src/MailTranslationBar.tsx` | export: `MailTranslationBar (default)` |
| `src/google-mail-werkruimte.css` | `src/google-mail-workspace.css` |  |
| `src/lezer-venster.ts` | `src/reader-venster.ts` | export: `readerZwevend`, `pasToe`, `wissel`, `koppel` — 2.1: «Venster verkleinen» voor de berichtweergave — het bericht wordt een zwevend venster boven de e-mail: versleepbaar via de bovenbalk, |
| `src/mail-bericht-tekst.css` | `src/mail-message-body.css` |  |
| `src/mail-dichtheid-profiel-bewerker.css` | `src/mail-density-profile-editor.css` |  |
| `src/mail-dichtheid-profiel.ts` | `src/mail-density-profile.ts` | export: `defaultMailRowBlockOrder`, `defaultMailDensityProfiles`, `normalizeMailDensityProfile`, `normalizeMailDensityProfiles` |
| `src/mail-dichtheid-vloeiend.ts` | `src/mail-density-fluid.ts` | export: `fluidMailLength` |
| `src/mail-geminimaliseerde-viewer.css` | `src/mail-minimized-viewer.css` |  |
| `src/mail-gesprek-bewerker.css` | `src/mail-thread-editor.css` |  |
| `src/mail-lezer-ai.css` | `src/mail-reader-ai.css` | AI-balk in het geopende bericht (punt 14, 19.10.2026). |
| `src/mail-lezer-document.ts` | `src/mail-reader-document.ts` | export: `buildMailReaderDocument`, `openMailReaderDocument` |
| `src/mail-lezer-n09-dialoog.css` | `src/mail-reader-n09-dialog.css` |  |
| `src/mail-lezer-n10-dialoog.css` | `src/mail-reader-n10-dialog.css` |  |
| `src/mail-lezer-orden-dialoog.css` | `src/mail-reader-organize-dialog.css` |  |
| `src/mail-lezer-verbeteringen.css` | `src/mail-reader-enhancements.css` |  |
| `src/mail-lezer-werkbalk.css` | `src/mail-reader-toolbar.css` |  |
| `src/mail-lezer-zoek.css` | `src/mail-reader-search.css` |  |
| `src/mail-uitstel-bediening.css` | `src/mail-snooze-control.css` |  |
| `src/mail-vertaling-balk.css` | `src/mail-translation-bar.css` |  |

## E-mail — bijlagen en formaatvoorbeelden (147)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `src/MailArchiefBewerker.tsx` | `src/MailArchiveEditor.tsx` | export: `MailArchiveEditor (default)` |
| `src/MailArchiefVoorbeeld.tsx` | `src/MailArchivePreview.tsx` | export: `MailArchivePreview (default)` |
| `src/MailBerichtBewerker.tsx` | `src/MailMessageEditor.tsx` | export: `MailMessageEditor (default)` |
| `src/MailBerichtVoorbeeld.tsx` | `src/MailMessagePreview.tsx` | export: `MailMessagePreview (default)` |
| `src/MailBeveiligingBewerker.tsx` | `src/MailSecurityEditor.tsx` | export: `MailSecurityEditor (default)` |
| `src/MailBeveiligingVoorbeeld.tsx` | `src/MailSecurityPreview.tsx` | export: `MailSecurityPreview (default)` |
| `src/MailBijlageKaart.tsx` | `src/MailAttachmentCard.tsx` | export: `MailAttachmentCard (default)` |
| `src/MailBijlageMiniatuur.tsx` | `src/MailAttachmentMiniature.tsx` | export: `MailAttachmentMiniature (default)` |
| `src/MailBijlageVoorbeeld.tsx` | `src/MailAttachmentPreview.tsx` | export: `describeMailAttachment`, `formatMailAttachmentSize`, `loadMailAttachmentPreview`, `loadMailAttachmentPreviewFromBlob` +4 |
| `src/MailBioinformaticaBewerker.tsx` | `src/MailBioinformaticsEditor.tsx` | export: `MailBioinformaticsEditor (default)` |
| `src/MailBioinformaticaVoorbeeld.tsx` | `src/MailBioinformaticsPreview.tsx` | export: `MailBioinformaticsPreview (default)` |
| `src/MailCadBewerker.tsx` | `src/MailCadEditor.tsx` | export: `MailCadEditor (default)` |
| `src/MailCadVoorbeeld.tsx` | `src/MailCadPreview.tsx` | export: `MailCadPreview (default)` |
| `src/MailDatabaseBewerker.tsx` | `src/MailDatabaseEditor.tsx` | export: `MailDatabaseEditor (default)` |
| `src/MailDatabaseVoorbeeld.tsx` | `src/MailDatabasePreview.tsx` | export: `MailDatabasePreview (default)` |
| `src/MailDevOpsBewerker.tsx` | `src/MailDevOpsEditor.tsx` | export: `MailDevOpsEditor (default)` |
| `src/MailDevOpsVoorbeeld.tsx` | `src/MailDevOpsPreview.tsx` | export: `MailDevOpsPreview (default)` |
| `src/MailDocumentBewerker.tsx` | `src/MailDocumentEditor.tsx` | export: `MailDocumentEditor (default)` |
| `src/MailDoorstuurBijlageDialoog.tsx` | `src/MailForwardAttachmentDialog.tsx` | export: `MailForwardAttachmentDialog (default)` |
| `src/MailDreigingBewerker.tsx` | `src/MailThreatEditor.tsx` | export: `MailThreatEditor (default)` |
| `src/MailDreigingVoorbeeld.tsx` | `src/MailThreatPreview.tsx` | export: `MailThreatPreview (default)` |
| `src/MailDrukvoorbereidingBewerker.tsx` | `src/MailPrepressEditor.tsx` | export: `MailPrepressEditor (default)` |
| `src/MailDrukvoorbereidingVoorbeeld.tsx` | `src/MailPrepressPreview.tsx` | export: `MailPrepressPreview (default)` |
| `src/MailEbookBewerker.tsx` | `src/MailEbookEditor.tsx` | export: `MailEbookEditor (default)` |
| `src/MailEbookVoorbeeld.tsx` | `src/MailEbookPreview.tsx` | export: `MailEbookPreview (default)` |
| `src/MailFinancienBewerker.tsx` | `src/MailFinanceEditor.tsx` | export: `MailFinanceEditor (default)` |
| `src/MailFinancienVoorbeeld.tsx` | `src/MailFinancePreview.tsx` | export: `MailFinancePreview (default)` |
| `src/MailGrafischBewerker.tsx` | `src/MailGraphicsEditor.tsx` | export: `MailGraphicsEditor (default)` |
| `src/MailGrafischVoorbeeld.tsx` | `src/MailGraphicsPreview.tsx` | export: `MailGraphicsPreview (default)` |
| `src/MailInstellingenVoorbeeld.tsx` | `src/MailSettingsPreview.tsx` | export: `MailSettingsPreview (default)` |
| `src/MailLettertypeBewerker.tsx` | `src/MailFontEditor.tsx` | export: `MailFontEditor (default)` |
| `src/MailLettertypeVoorbeeld.tsx` | `src/MailFontPreview.tsx` | export: `MailFontPreview (default)` |
| `src/MailLogistiekBewerker.tsx` | `src/MailLogisticsEditor.tsx` | export: `MailLogisticsEditor (default)` |
| `src/MailLogistiekVoorbeeld.tsx` | `src/MailLogisticsPreview.tsx` | export: `MailLogisticsPreview (default)` |
| `src/MailMediaDocumentBewerker.tsx` | `src/MailMediaDocumentEditor.tsx` | export: `MailMediaDocumentEditor (default)` |
| `src/MailMediaDocumentVoorbeeld.tsx` | `src/MailMediaDocumentPreview.tsx` | export: `MailMediaDocumentPreview (default)` |
| `src/MailMedischBewerker.tsx` | `src/MailMedicalEditor.tsx` | export: `MailMedicalEditor (default)` |
| `src/MailMedischVoorbeeld.tsx` | `src/MailMedicalPreview.tsx` | export: `MailMedicalPreview (default)` |
| `src/MailMlBewerker.tsx` | `src/MailMlEditor.tsx` | export: `MailMlEditor (default)` |
| `src/MailMlVoorbeeld.tsx` | `src/MailMlPreview.tsx` | export: `MailMlPreview (default)` |
| `src/MailMuziekBewerker.tsx` | `src/MailMusicEditor.tsx` | export: `MailMusicEditor (default)` |
| `src/MailMuziekVoorbeeld.tsx` | `src/MailMusicPreview.tsx` | export: `MailMusicPreview (default)` |
| `src/MailMuziekWerkbank.tsx` | `src/MailMusicWorkbench.tsx` | export: `MailMusicWorkbench (default)` |
| `src/MailNavigatieBewerker.tsx` | `src/MailNavigationEditor.tsx` | export: `MailNavigationEditor (default)` |
| `src/MailNetwerkBewerker.tsx` | `src/MailNetworkEditor.tsx` | export: `MailNetworkEditor (default)` |
| `src/MailNetwerkVoorbeeld.tsx` | `src/MailNetworkPreview.tsx` | export: `MailNetworkPreview (default)` |
| `src/MailOpgemaaktDocumentVoorbeeld.tsx` | `src/MailRichDocumentPreview.tsx` | export: `MailRichDocumentPreview (default)` |
| `src/MailOpstelBewerker.tsx` | `src/MailComposeEditor.tsx` | export: `MailComposeEditor (default)` |
| `src/MailOverheidBewerker.tsx` | `src/MailGovernmentEditor.tsx` | export: `MailGovernmentEditor (default)` |
| `src/MailOverheidVoorbeeld.tsx` | `src/MailGovernmentPreview.tsx` | export: `MailGovernmentPreview (default)` |
| `src/MailPdfVoorbeeld.tsx` | `src/MailPdfPreview.tsx` | export: `MailPdfPreview (default)` |
| `src/MailPersoonsgegevensBewerker.tsx` | `src/MailPersonalDataEditor.tsx` | export: `MailPersonalDataEditor (default)` |
| `src/MailPersoonsgegevensVoorbeeld.tsx` | `src/MailPersonalDataPreview.tsx` | export: `MailPersonalDataPreview (default)` |
| `src/MailPresentatieBewerker.tsx` | `src/MailPresentationEditor.tsx` | export: `MailPresentationEditor (default)` |
| `src/MailPresentatieVoorbeeld.tsx` | `src/MailPresentationPreview.tsx` | export: `MailPresentationPreview (default)` |
| `src/MailRekenbladBewerker.tsx` | `src/MailSpreadsheetEditor.tsx` | export: `MailSpreadsheetEditor (default)` |
| `src/MailRekenbladVoorbeeld.tsx` | `src/MailSpreadsheetPreview.tsx` | export: `MailSpreadsheetPreview (default)` |
| `src/MailSpelontwikkelingBewerker.tsx` | `src/MailGameDevEditor.tsx` | export: `MailGameDevEditor (default)` |
| `src/MailSpelontwikkelingVoorbeeld.tsx` | `src/MailGameDevPreview.tsx` | export: `MailGameDevPreview (default)` |
| `src/MailTaalkundeBewerker.tsx` | `src/MailLinguisticsEditor.tsx` | export: `MailLinguisticsEditor (default)` |
| `src/MailTaalkundeVoorbeeld.tsx` | `src/MailLinguisticsPreview.tsx` | export: `MailLinguisticsPreview (default)` |
| `src/MailTechniekBewerker.tsx` | `src/MailEngineeringEditor.tsx` | export: `MailEngineeringEditor (default)` |
| `src/MailTechniekVoorbeeld.tsx` | `src/MailEngineeringPreview.tsx` | export: `MailEngineeringPreview (default)` |
| `src/MailVasteIndelingBewerker.tsx` | `src/MailFixedLayoutEditor.tsx` | export: `MailFixedLayoutEditor (default)` |
| `src/MailVasteIndelingVoorbeeld.tsx` | `src/MailFixedLayoutPreview.tsx` | export: `MailFixedLayoutPreview (default)` |
| `src/MailVttRpgBewerker.tsx` | `src/MailVttRpgEditor.tsx` | export: `MailVttRpgEditor (default)` |
| `src/MailVttRpgVoorbeeld.tsx` | `src/MailVttRpgPreview.tsx` | export: `MailVttRpgPreview (default)` |
| `src/MailWetenschappelijkBewerker.tsx` | `src/MailScientificEditor.tsx` | export: `MailScientificEditor (default)` |
| `src/MailWetenschappelijkVoorbeeld.tsx` | `src/MailScientificPreview.tsx` | export: `MailScientificPreview (default)` |
| `src/mail-archief-inhoud.ts` | `src/mail-archive-content.ts` | export: `inspectMailZipDirectory`, `readMailZipEntry`, `detectMailArchiveContentType`, `loadMailArchiveContent` +3 |
| `src/mail-archief-mogelijkheden.ts` | `src/mail-archive-capabilities.ts` | export: `mailArchiveCapability`, `isMailArchiveAttachment` |
| `src/mail-begrensd-gzip.ts` | `src/mail-bounded-gzip.ts` | export: `gunzipBounded` |
| `src/mail-begrensd-zip.ts` | `src/mail-bounded-zip.ts` | export: `unzipMailPackageBounded` |
| `src/mail-bericht-inhoud.ts` | `src/mail-message-content.ts` | export: `detectMailMessageContentType`, `loadMailMessageContent`, `validateMailMessageSource`, `exportMailMessage` |
| `src/mail-bericht-mogelijkheden.ts` | `src/mail-message-capabilities.ts` | export: `mailMessageCapability`, `isMailMessageAttachment` |
| `src/mail-beveiliging-inhoud.ts` | `src/mail-security-content.ts` | export: `detectMailSecurityContentType`, `loadMailSecurityContent`, `validateMailSecuritySource`, `exportMailSecurity` +1 |
| `src/mail-beveiliging-mogelijkheden.ts` | `src/mail-security-capabilities.ts` | export: `mailSecurityCapability`, `isMailSecurityAttachment` |
| `src/mail-bijlage-cache.ts` | `src/mail-attachment-cache.ts` | export: `mailCacheScope`, `setMailPrivateCacheRemembered`, `endMailPrivateCacheSession`, `forgetMailPrivateCacheOwner` +21 — Beveiligingsreview 21.10.2026: de lokale concepten (src/mail-concept-lokaal.ts, platte tekst in localStorage) volgen dezelfde regel |
| `src/mail-bijlage-lader.ts` | `src/mail-attachment-loader.ts` | export: `MAIL_ATTACHMENT_PREVIEW_MAX_BYTES`, `loadMailAttachmentBlob`, `preloadMailAttachmentBlob` |
| `src/mail-bijlage-strook.css` | `src/mail-attachment-strip.css` |  |
| `src/mail-bijlage-werkbank.css` | `src/mail-attachment-workbench.css` |  |
| `src/mail-bijlage-werkbank.ts` | `src/mail-attachment-workbench.ts` | export: `resolveMailAttachmentWorkbench`, `mailAttachmentEditSemanticsLabel`, `mailAttachmentViewModeLabel` |
| `src/mail-bioinformatica-inhoud.ts` | `src/mail-bioinformatics-content.ts` | export: `detectMailBioinformaticsContentType`, `loadMailBioinformaticsContent`, `validateMailBioinformaticsSource`, `exportMailBioinformatics` |
| `src/mail-bioinformatica-mogelijkheden.ts` | `src/mail-bioinformatics-capabilities.ts` | export: `mailBioinformaticsCapability`, `isMailBioinformaticsAttachment` |
| `src/mail-cad-inhoud.ts` | `src/mail-cad-content.ts` | export: `loadMailCadContent`, `exportMailCad`, `exportMailCadGeometry` |
| `src/mail-cad-mogelijkheden.ts` | `src/mail-cad-capabilities.ts` | export: `mailCadCapability`, `isMailCadAttachment` |
| `src/mail-database-binair.ts` | `src/mail-database-binary.ts` | export: `detectMailDatabaseBinaryType`, `inspectMailDatabaseBinary` |
| `src/mail-database-inhoud.ts` | `src/mail-database-content.ts` | export: `loadMailDatabaseContent`, `exportMailDatabaseTable`, `detectMailDatabaseContentType`, `validateMailDatabaseSource` +1 |
| `src/mail-database-mogelijkheden.ts` | `src/mail-database-capabilities.ts` | export: `mailDatabaseCapability`, `isMailDatabaseAttachment` |
| `src/mail-devops-inhoud.ts` | `src/mail-devops-content.ts` | export: `detectMailDevOpsContentType`, `loadMailDevOpsContent`, `validateMailDevOpsSource`, `exportMailDevOps` |
| `src/mail-devops-mogelijkheden.ts` | `src/mail-devops-capabilities.ts` | export: `mailDevOpsCapability`, `isMailDevOpsAttachment` |
| `src/mail-devops-serialisatie.ts` | `src/mail-devops-serialization.ts` | export: `isSerializationParser`, `isSerializationBinaryParser`, `serializationSourceKind`, `detectSerializationSource` +4 |
| `src/mail-document-inhoud.ts` | `src/mail-document-content.ts` | export: `sanitizeMailDocumentHtml`, `loadMailDocumentContent`, `exportMailDocumentContent` |
| `src/mail-document-mogelijkheden.ts` | `src/mail-document-capabilities.ts` | export: `mailDocumentCapability`, `isMailDocumentAttachment` |
| `src/mail-docx-kopie.ts` | `src/mail-docx-copy.ts` | export: `inspectMailDocxCopy`, `exportMailDocxCopy` |
| `src/mail-doorstuur-bijlage-dialoog.css` | `src/mail-forward-attachment-dialog.css` |  |
| `src/mail-dreiging-inhoud.ts` | `src/mail-threat-content.ts` | export: `detectMailThreatContentType`, `loadMailThreatContent`, `validateMailThreatSource`, `exportMailThreat` |
| `src/mail-dreiging-mogelijkheden.ts` | `src/mail-threat-capabilities.ts` | export: `mailThreatCapability`, `isMailThreatAttachment` |
| `src/mail-drukvoorbereiding-inhoud.ts` | `src/mail-prepress-content.ts` | export: `validateMailPrepressSource`, `detectMailPrepressContentType`, `loadMailPrepressContent`, `exportMailPrepress` |
| `src/mail-drukvoorbereiding-mogelijkheden.ts` | `src/mail-prepress-capabilities.ts` | export: `mailPrepressCapability`, `isMailPrepressAttachment` |
| `src/mail-ebook-inhoud.ts` | `src/mail-ebook-content.ts` | export: `loadMailEbookContent`, `exportMailEbook` |
| `src/mail-ebook-mogelijkheden.ts` | `src/mail-ebook-capabilities.ts` | export: `mailEbookCapability`, `isMailEbookAttachment` |
| `src/mail-financien-inhoud.ts` | `src/mail-finance-content.ts` | export: `detectMailFinanceContentType`, `loadMailFinanceContent`, `validateMailFinanceSource`, `exportMailFinance` |
| `src/mail-financien-mogelijkheden.ts` | `src/mail-finance-capabilities.ts` | export: `mailFinanceCapability`, `isMailFinanceAttachment` |
| `src/mail-geo-uitgebreid.ts` | `src/mail-geospatial-extended.ts` | export: `detectGeospatialSource`, `validateGeospatialSource`, `geospatialSourceKind`, `geospatialSourceRows` +2 |
| `src/mail-grafisch-inhoud.ts` | `src/mail-graphics-content.ts` | export: `sanitizeMailSvgSource`, `loadMailGraphicsContent`, `validateMailGraphicsSource`, `exportMailGraphicsSource` |
| `src/mail-grafisch-mogelijkheden.ts` | `src/mail-graphics-capabilities.ts` | export: `mailGraphicsCapability`, `isMailGraphicsAttachment` |
| `src/mail-juridisch-archief-uitgebreid.ts` | `src/mail-legal-archive-extended.ts` | export: `detectLegalArchiveSource`, `validateLegalArchiveSource`, `readLegalArchiveSource`, `legalArchiveSourceKind` +3 |
| `src/mail-lettertype-inhoud.ts` | `src/mail-font-content.ts` | export: `detectMailFontContentType`, `validateMailFontSource`, `exportMailFontSource`, `loadMailFontContent` |
| `src/mail-lettertype-mogelijkheden.ts` | `src/mail-font-capabilities.ts` | export: `mailFontCapability`, `isMailFontAttachment` |
| `src/mail-logistiek-inhoud.ts` | `src/mail-logistics-content.ts` | export: `detectMailLogisticsContentType`, `loadMailLogisticsContent`, `validateMailLogisticsSource`, `exportMailLogistics` |
| `src/mail-logistiek-mogelijkheden.ts` | `src/mail-logistics-capabilities.ts` | export: `mailLogisticsCapability`, `isMailLogisticsAttachment` |
| `src/mail-mdb-lezer.ts` | `src/mail-mdb-reader.ts` | mdb-reader met de Node-shim ervoor (zie src/platform/node-shim.ts): de import-volgorde is de uitvoervolgorde — eerst de shim, dan de bibliotheek. |
| `src/mail-media-document-inhoud.ts` | `src/mail-media-document-content.ts` | export: `validateMailMediaDocumentSource`, `validateMailBwfMetadata`, `loadMailMediaDocumentContent`, `exportMailMediaDocument` |
| `src/mail-media-document-mogelijkheden.ts` | `src/mail-media-document-capabilities.ts` | export: `mailMediaDocumentCapability`, `isMailMediaDocumentAttachment` |
| `src/mail-medisch-inhoud.ts` | `src/mail-medical-content.ts` | export: `detectMailMedicalContentType`, `loadMailMedicalContent`, `validateMailMedicalSource`, `exportMailMedical` |
| `src/mail-medisch-mogelijkheden.ts` | `src/mail-medical-capabilities.ts` | export: `mailMedicalCapability`, `isMailMedicalAttachment` |
| `src/mail-ml-inhoud.ts` | `src/mail-ml-content.ts` | export: `detectMailMlContentType`, `loadMailMlContent`, `validateMailMlSource`, `exportMailMl` |
| `src/mail-ml-mogelijkheden.ts` | `src/mail-ml-capabilities.ts` | export: `mailMlCapability`, `isMailMlAttachment` |
| `src/mail-muziek-inhoud.ts` | `src/mail-music-content.ts` | export: `detectMailMusicContentType`, `loadMailMusicContent`, `validateMailMusicSource`, `exportMailMusic` |
| `src/mail-muziek-mogelijkheden.ts` | `src/mail-music-capabilities.ts` | export: `mailMusicCapability`, `isMailMusicAttachment` |
| `src/mail-muziek-werkbank.css` | `src/mail-music-workbench.css` |  |
| `src/mail-netwerk-inhoud.ts` | `src/mail-network-content.ts` | export: `detectMailNetworkContentType`, `loadMailNetworkContent`, `validateMailNetworkSource`, `exportMailNetwork` |
| `src/mail-netwerk-mogelijkheden.ts` | `src/mail-network-capabilities.ts` | export: `mailNetworkCapability`, `isMailNetworkAttachment` |
| `src/mail-overheid-inhoud.ts` | `src/mail-government-content.ts` | export: `detectMailGovernmentContentType`, `loadMailGovernmentContent`, `validateMailGovernmentSource`, `exportMailGovernment` |
| `src/mail-overheid-mogelijkheden.ts` | `src/mail-government-capabilities.ts` | export: `mailGovernmentCapability`, `isMailGovernmentAttachment` |
| `src/mail-persoonsgegevens-inhoud.ts` | `src/mail-personal-data-content.ts` | export: `detectMailPersonalDataContentType`, `loadMailPersonalDataContent`, `validateMailPersonalDataSource`, `exportMailPersonalData` |
| `src/mail-persoonsgegevens-mogelijkheden.ts` | `src/mail-personal-data-capabilities.ts` | export: `mailPersonalDataCapability`, `isMailPersonalDataAttachment` |
| `src/mail-presentatie-inhoud.ts` | `src/mail-presentation-content.ts` | export: `loadMailPresentationContent`, `exportMailPresentationPptx` |
| `src/mail-presentatie-mogelijkheden.ts` | `src/mail-presentation-capabilities.ts` | export: `mailPresentationCapability`, `isMailPresentationAttachment` |
| `src/mail-rekenblad-inhoud.ts` | `src/mail-spreadsheet-content.ts` | export: `loadMailSpreadsheetContent`, `exportMailSpreadsheet` |
| `src/mail-rekenblad-mogelijkheden.ts` | `src/mail-spreadsheet-capabilities.ts` | export: `mailSpreadsheetCapability`, `isMailSpreadsheetAttachment` |
| `src/mail-ruim-raster.ts` | `src/mail-bulky-raster.ts` | export: `mailBulkyRaster`, `BULKY_MIN_TEKST`, `BULKY_AVATAR` — Modus «Ruim» (mailaudit 18.10.2026, gesprek «Taak: modus Ruim op orde brengen»). |
| `src/mail-ruim-voorbeeld-voorladen.ts` | `src/mail-bulky-preview-prefetch.ts` | export: `queueMailBulkyPreview`, `cancelMailBulkyPreviewGroup` |
| `src/mail-spelontwikkeling-inhoud.ts` | `src/mail-gamedev-content.ts` | export: `detectMailGameDevContentType`, `loadMailGameDevContent`, `validateMailGameDevSource`, `exportMailGameDev` |
| `src/mail-spelontwikkeling-mogelijkheden.ts` | `src/mail-gamedev-capabilities.ts` | export: `mailGameDevCapability`, `isMailGameDevAttachment` |
| `src/mail-taalkunde-inhoud.ts` | `src/mail-linguistics-content.ts` | export: `detectMailLinguisticsContentType`, `loadMailLinguisticsContent`, `validateMailLinguisticsSource`, `exportMailLinguistics` |
| `src/mail-taalkunde-mogelijkheden.ts` | `src/mail-linguistics-capabilities.ts` | export: `mailLinguisticsCapability`, `isMailLinguisticsAttachment` |
| `src/mail-techniek-inhoud.ts` | `src/mail-engineering-content.ts` | export: `detectMailEngineeringContentType`, `loadMailEngineeringContent`, `validateMailEngineeringSource`, `exportMailEngineering` |
| `src/mail-techniek-mogelijkheden.ts` | `src/mail-engineering-capabilities.ts` | export: `mailEngineeringCapability`, `isMailEngineeringAttachment` |
| `src/mail-vaste-indeling-inhoud.ts` | `src/mail-fixed-layout-content.ts` | export: `loadMailFixedLayoutContent`, `exportMailFixedLayoutPdf` |
| `src/mail-vaste-indeling-mogelijkheden.ts` | `src/mail-fixed-layout-capabilities.ts` | export: `mailFixedLayoutCapability`, `isMailFixedLayoutAttachment` |
| `src/mail-vtt-rpg-inhoud.ts` | `src/mail-vtt-rpg-content.ts` | export: `detectMailVttRpgContentType`, `loadMailVttRpgContent`, `validateMailVttRpgSource`, `exportMailVttRpg` |
| `src/mail-vtt-rpg-mogelijkheden.ts` | `src/mail-vtt-rpg-capabilities.ts` | export: `mailVttRpgCapability`, `isMailVttRpgAttachment` |
| `src/mail-wetenschappelijk-inhoud.ts` | `src/mail-scientific-content.ts` | export: `detectMailScientificContentType`, `loadMailScientificContent`, `validateMailScientificSource`, `exportMailScientific` |
| `src/mail-wetenschappelijk-mogelijkheden.ts` | `src/mail-scientific-capabilities.ts` | export: `mailScientificCapability`, `isMailScientificAttachment` |
| `src/mail-wetenschappelijk-uitgebreid.ts` | `src/mail-scientific-extended.ts` | export: `detectExtendedScientificSource`, `validateExtendedScientificSource`, `extendedScientificSourceKind`, `extendedScientificSourceRows` +3 |

## E-mail — overig (lijst, zoeken, instellingen, opstellen) (114)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/ai-mail-assistent.ts` | `backend/ai-mail-assistant.ts` | export: `TRANSFORM_ACTIONS`, `TEMPLATES`, `LANGUAGES`, `setAssistantDeps` +8 — AI-assistent in e-mail: antwoord op basis van gesprekscontext, samenvatting van een lange keten, tooncontrole vóór verzending en teksthulpmiddel |
| `backend/mail-handschrift.ts` | `backend/mail-handwriting.ts` | export: `createMailHandwritingRoutes` |
| `backend/mail-opdrachten.ts` | `backend/mail-commands.ts` | export: `normalizeMailRecipients`, `normalizeMailSendInput`, `mailSendPayloadHash`, `buildGmailRawMessage` +1 |
| `backend/mail-opstel-html.ts` | `backend/mail-compose-html.ts` | export: `safeStyle`, `normalizeOutboundMailHtml`, `mailHtmlToPlainText` — Uitgaande HTML van E-mail (versturen, concepten in Gmail, AI): veilig maken MET behoud van de opmaak. |
| `backend/mail-opstel.ts` | `backend/mail-compose.ts` | export: `ProviderError`, `gmailTransport`, `setMailTransport`, `saveDraft` +10 — Opstellen van mail op de server: concepten (eerst lokaal in PostgreSQL, daarna naar Gmail gesynchroniseerd), direct verzenden en uitgestelde |
| `backend/mail-periode-grenzen-cache.ts` | `backend/mail-period-bounds-cache.ts` | export: `MAIL_PERIOD_BOUNDS_RESOURCE`, `MAIL_PERIOD_BOUNDS_TABLE_PREFIX`, `periodBoundsTable`, `invalidateMailPeriodBounds` |
| `backend/mail-pmid-opstart.ts` | `backend/mail-pmid-bootstrap.ts` | export: `runMailPmidBootstrapPage` |
| `backend/mail-tekst-normalisatie.ts` | `backend/mail-text-normalization.ts` | export: `normalizeMailDisplayText`, `normalizeMailRawHtml`, `decodeMailPartText` |
| `backend/mail-weergave-voorkeuren.ts` | `backend/mail-view-preferences.ts` | export: `createMailViewPreferenceRoutes` |
| `backend/mail-zoek-duurzaam.ts` | `backend/mail-search-durable.ts` | export: `pmidShard`, `mailSearchDurableRetryAt`, `prepareMailSearchDurableIndex`, `readMailSearchDurableContext` +8 |
| `backend/mail-zoek-relevantie.ts` | `backend/mail-search-relevance.ts` | export: `evaluateMailSearch`, `suggestMailSearch` |
| `backend/mail-zoek.ts` | `backend/mail-search.ts` | export: `createMailAdvancedSearchRoutes` |
| `scripts/mail-slimme-inbox-audit.mjs` | `scripts/mail-smart-inbox-audit.mjs` |  |
| `shared/mail-slimme-inbox.ts` | `shared/mail-smart-inbox.ts` | export: `classifyMailMessage` |
| `shared/mail-zoekopdracht.ts` | `shared/mail-search-query.ts` | export: `normalizeMailSearchQueryText`, `mailSearchQueryUnits`, `mailSearchFieldUnits`, `parseMailSearchQuery` +1 |
| `src/MailAbonnementenWeergave.tsx` | `src/MailSubscriptionsView.tsx` | export: `MailSubscriptionsView (default)` |
| `src/MailAccountWisselaar.tsx` | `src/MailAccountSwitcher.tsx` | export: `MailAccountSwitcher (default)` |
| `src/MailAiWerkbalk.tsx` | `src/MailAiToolbar.tsx` | export: `MailAiToolbar (default)` |
| `src/MailBerichtRij.tsx` | `src/MailMessageRow.tsx` | export: `MailMessageRow (default)` |
| `src/MailBronWerkruimte.tsx` | `src/MailSourceWorkspace.tsx` | export: `MailSourceWorkspace (default)` |
| `src/MailDatumKalender.tsx` | `src/MailDateCalendar.tsx` | export: `MailDateCalendar (default)` |
| `src/MailDriveKnop.tsx` | `src/MailDiskKnop.tsx` | export: `MailDiskKnop (default)` — 3.1: Google Drive direct in het bericht. Knop in de onderste balk: als Drive is gekoppeld — bestandenlijst met zoekfunctie, klik voegt toe aan het bericht |
| `src/MailExternOpslaanDialoog.tsx` | `src/MailExternalSaveDialog.tsx` | export: `MailExternalSaveDialog (default)` |
| `src/MailFunctioneelWeergave.tsx` | `src/MailFunctionalView.tsx` | export: `MailFunctionalView (default)` |
| `src/MailGeavanceerdZoeken.tsx` | `src/MailAdvancedSearch.tsx` | export: `MailAdvancedSearch (default)` |
| `src/MailGeoKaart.tsx` | `src/MailGeospatialMap.tsx` | export: `MailGeospatialMap (default)` |
| `src/MailHandschriftInvoer.tsx` | `src/MailHandwritingInput.tsx` | export: `MailHandwritingInput (default)` |
| `src/MailInstellingenGeraamte.tsx` | `src/MailSettingsScaffold.tsx` | export: `MailSettingsScaffold (default)` |
| `src/MailInvoerHulpmiddelen.tsx` | `src/MailInputTools.tsx` | export: `MailInputTools (default)` |
| `src/MailKleurstalen.tsx` | `src/MailColorSwatches.tsx` | export: `MailColorSwatches (default)` |
| `src/MailMinimumBerichtRij.tsx` | `src/MailMinimumMessageRow.tsx` | export: `MailMinimumMessageRow (default)` |
| `src/MailNieuwBerichtDialoog.tsx` | `src/MailNewMessageDialog.tsx` | export: `NIEUW_BERICHT_VENSTER`, `MailNewMessageDialog (default)` |
| `src/MailOpstelZwevend.tsx` | `src/MailComposeFloat.tsx` | export: `MailComposeFloat (default)` |
| `src/MailPdfProfielBand.tsx` | `src/MailPdfProfileBanner.tsx` | export: `MailPdfProfileBanner (default)` |
| `src/MailPeriodeKiezer.tsx` | `src/MailPeriodPicker.tsx` | export: `MailPeriodPicker (default)` |
| `src/MailPlanningMenu.tsx` | `src/MailScheduleMenu.tsx` | export: `MailScheduleMenu (default)` |
| `src/MailRijSnelleActieInstellingen.tsx` | `src/MailRowQuickActionSettings.tsx` | export: `MailRowQuickActionSettings (default)` |
| `src/MailRijSnelleActies.tsx` | `src/MailRowQuickActions.tsx` | export: `MailRowQuickActions (default)` |
| `src/MailSectieKeuze.tsx` | `src/MailSectionSelect.tsx` | export: `MailSectionSelect (default)` |
| `src/MailSectieMenu.tsx` | `src/MailSectionMenu.tsx` | export: `MailSectionMenu (default)`, `MailSectionHeaderNav`, `MailSectionPager`, `MailCategoryPager` +1 |
| `src/MailSelectieWerkbalk.tsx` | `src/MailSelectionToolbar.tsx` | export: `MailSelectionToolbar (default)` |
| `src/MailSnelleInstellingen.tsx` | `src/MailQuickSettings.tsx` | export: `mailInboxPriorityIds`, `mailReaderToolbarActionIds`, `defaultMailReaderToolbarPreference`, `mailRowQuickActionIds` +10 |
| `src/MailSpecialistVerkenner.tsx` | `src/MailSpecialistExplorer.tsx` | export: `MailSpecialistExplorer (default)` |
| `src/MailSysteemAandachtGroepen.tsx` | `src/MailSystemAttentionBuckets.tsx` | export: `MailSystemAttentionBuckets (default)` |
| `src/MailZijbalkNavigatie.tsx` | `src/MailSidebarNavigation.tsx` | export: `MailSidebarNavigation (default)` — Audit 18.10.2026 (8b): de zwevende knop «Bericht opstellen» en het berichtvenster leven alleen nog in MailOpstelZwevend.tsx (één knop, één zone 'mail-comp… |
| `src/MailZoekActiefChips.tsx` | `src/MailSearchActiveChips.tsx` | export: `MailSearchActiveChips (default)` |
| `src/MailZoekFilters.tsx` | `src/MailSearchFilters.tsx` | export: `MailSearchFilters (default)` |
| `src/MailZoekVeld.tsx` | `src/MailSearchField.tsx` | export: `MAIL_ZOEK_SMAL`, `MailSearchField (default)` |
| `src/mail-aanbieder-toestand.ts` | `src/mail-provider-state.ts` | export: `loadMailProviderLabelSnapshot`, `subscribeMailProviderLabelSnapshots` |
| `src/mail-abonnementen.css` | `src/mail-subscriptions.css` |  |
| `src/mail-agenda-contact.ts` | `src/mail-calendar-contact.ts` | export: `formatIcsDate`, `parseIcsEvents`, `parseVcard` — Snelle voorvertoning van agenda- (.ics) en contactbijlagen (.vcf): alleen lezen, nooit uitvoeren, alles ingekort. |
| `src/mail-ai-werkbalk.css` | `src/mail-ai-toolbar.css` |  |
| `src/mail-beveiliging.css` | `src/mail-security.css` |  |
| `src/mail-bioinformatica.css` | `src/mail-bioinformatics.css` |  |
| `src/mail-bron-werkruimte.css` | `src/mail-source-workspace.css` |  |
| `src/mail-compact-lees-opties.css` | `src/mail-compact-reading-options.css` |  |
| `src/mail-datum-periodes.css` | `src/mail-date-periods.css` |  |
| `src/mail-datum-periodes.ts` | `src/mail-date-periods.ts` | export: `mailLocalIso`, `mailQuickPeriods`, `mailQuarterRange`, `mailSeasonRange` +1 |
| `src/mail-document-bron.ts` | `src/mail-document-source.ts` | export: `renderMailDocumentSourcePreview`, `validateMailDocumentSource`, `readMailDocumentSource`, `exportMailDocumentSource` +1 |
| `src/mail-doorstuur-pdf.ts` | `src/mail-forward-pdf.ts` | export: `buildForwardPdf` |
| `src/mail-dreiging.css` | `src/mail-threat.css` |  |
| `src/mail-drukvoorbereiding.css` | `src/mail-prepress.css` |  |
| `src/mail-formaat-catalogus.ts` | `src/mail-format-catalog.ts` | export: `MAIL_FORMAT_CATEGORIES`, `mailFormatCategory`, `mailFormatQaId` |
| `src/mail-formaat-qa.ts` | `src/mail-format-qa.ts` | export: `runMailFormatQa` |
| `src/mail-functioneel.css` | `src/mail-functional.css` |  |
| `src/mail-geavanceerd-zoeken.css` | `src/mail-advanced-search.css` |  |
| `src/mail-gelaagde-inbox.css` | `src/mail-layered-inbox.css` |  |
| `src/mail-geo-kaart.css` | `src/mail-geospatial-map.css` |  |
| `src/mail-grafisch.css` | `src/mail-graphics.css` |  |
| `src/mail-html-opschonen.ts` | `src/mail-html-sanitize.ts` | export: `sanitizeDocumentHtml`, `sanitizeMailHtml` — HTML-sanitizing met DOMPurify voor mailvoorbeelden (fase B). |
| `src/mail-instellingen-geraamte.css` | `src/mail-settings-scaffold.css` |  |
| `src/mail-instellingen-voorbeeld.css` | `src/mail-settings-preview.css` |  |
| `src/mail-invoer-hulpmiddelen.css` | `src/mail-input-tools.css` |  |
| `src/mail-kleur-palet.ts` | `src/mail-color-palette.ts` | export: `mailColorPairs`, `isMailPresetColor` |
| `src/mail-kleurstalen.css` | `src/mail-color-swatches.css` |  |
| `src/mail-medisch.css` | `src/mail-medical.css` |  |
| `src/mail-minimum-rij.css` | `src/mail-minimum-row.css` |  |
| `src/mail-mobiel.css` | `src/mail-mobile.css` | Mobiele weergave van de berichtenlijst (zoals bij Google-diensten): grote foto links over de volledige blokhoogte, naam en tijd op de eerste regel (tijd rechts, aan de rand), |
| `src/mail-navigatie-bewerker.css` | `src/mail-navigation-editor.css` |  |
| `src/mail-netwerk.css` | `src/mail-network.css` |  |
| `src/mail-nieuw-bericht.css` | `src/mail-new-message.css` |  |
| `src/mail-ongelezen-focus.css` | `src/mail-unread-focus.css` |  |
| `src/mail-opstel-api.ts` | `src/mail-compose-api.ts` | export: `composeErrorText`, `saveDraftRemote`, `listDraftsRemote`, `getDraftRemote` +10 |
| `src/mail-opstel-bewerker.css` | `src/mail-compose-editor.css` |  |
| `src/mail-opstel-menu-plaats.ts` | `src/mail-compose-menu-plaats.ts` | export: `MENU_MARGE`, `MENU_AFSTAND`, `MENU_MIN_HOOGTE`, `menuPlaats` +1 — Waar een uitklapmenu van de editorbalk («Stijl», «Lijst», «⋯») op het scherm komt — zuiver, met tests |
| `src/mail-opstel-plaats.ts` | `src/mail-compose-plaats.ts` | export: `GAT`, `RAND`, `BEL`, `BEL_RAND` +5 — Plaats van de zwevende knop «Bericht opstellen» (FAB) ten opzichte van de meldingenbel. |
| `src/mail-overlay-oppervlak.css` | `src/mail-overlay-surface.css` |  |
| `src/mail-pdf-profiel.ts` | `src/mail-pdf-profile.ts` | export: `readPdfProfileClaims` |
| `src/mail-periode-cache.ts` | `src/mail-period-cache.ts` | export: `mailPeriodAccountKey`, `readMailPeriodCache`, `writeMailPeriodCache`, `clearMailPeriodCache` +5 |
| `src/mail-planning-menu.css` | `src/mail-schedule-menu.css` |  |
| `src/mail-presentatie.css` | `src/mail-presentation.css` |  |
| `src/mail-rekenblad.css` | `src/mail-spreadsheet.css` |  |
| `src/mail-rij-snelle-acties.css` | `src/mail-row-quick-actions.css` |  |
| `src/mail-sectie-menu.css` | `src/mail-section-menu.css` |  |
| `src/mail-slimme-inbox.ts` | `src/mail-smart-inbox.ts` |  |
| `src/mail-snelle-instellingen.css` | `src/mail-quick-settings.css` |  |
| `src/mail-specialist-verkenner.css` | `src/mail-specialist-explorer.css` |  |
| `src/mail-systeem-aandacht.css` | `src/mail-system-attention.css` |  |
| `src/mail-techniek.css` | `src/mail-engineering.css` |  |
| `src/mail-tekst-passend.ts` | `src/mail-body-passend.ts` | export: `MAIL_BODY_MIN_SCHAAL`, `mailBodySchaal`, `mailDocumentHoogte`, `pasMailDocumentAan` — Passend maken van HTML-mail in het leeskader (mobiele pass 19.10.2026). |
| `src/mail-toestand-intenties.ts` | `src/mail-state-intents.ts` | export: `createMailStateIntentId`, `submitMailStateIntent`, `waitMailStateIntent`, `createMailBulkRequestId` +2 |
| `src/mail-ux-beoordeling-20261021.css` | `src/mail-ux-review-20261021.css` | UX-BEOORDELING E-MAIL (21.10.2026) — frisse blik na vier agenten (meldingen, «Nieuw bericht», rijen, accounts). |
| `src/mail-vaste-indeling.css` | `src/mail-fixed-layout.css` |  |
| `src/mail-weergave-voorkeuren-cache.ts` | `src/mail-view-preferences-cache.ts` | export: `normalizeMailViewPreferences`, `hasMailViewPreferencesMirror`, `readMailViewPreferences`, `writeMailViewPreferences` |
| `src/mail-weergave-voorkeuren-server.ts` | `src/mail-view-preferences-server.ts` | export: `loadMailViewPreferencesServer`, `publishMailViewPreferencesServer` |
| `src/mail-zijbalk-navigatie.css` | `src/mail-sidebar-navigation.css` |  |
| `src/mail-zoek-cache.ts` | `src/mail-search-cache.ts` | export: `readMailSavedSearches`, `saveMailSavedSearch`, `removeMailSavedSearch`, `readMailRecentSearches` +4 |
| `src/mail-zoek-versoepeling.ts` | `src/mail-search-relaxation.ts` | export: `mailSearchRelaxationPlans` |
| `src/mail-zoek.ts` | `src/mail-search.ts` | export: `ARCHIVE_QUERY_PARTS`, `ARCHIVE_QUERY`, `mailAttachmentGroupExtensions`, `defaultMailSearchCriteria` +16 |
| `tests/e2e/mail-opstel-venster.e2e.ts` | `tests/e2e/mail-compose-venster.e2e.ts` | export: `main` — E2E (Chrome) venster «Nieuw bericht» (10.10): knoppen _ □ × zoals in Windows, compacte velden (Cc/Bcc op dezelfde regel |
| `tests/eenheid/ai-mail-assistent.test.ts` | `tests/eenheid/ai-mail-assistant.test.ts` | export: `main` — AI-assistent in e-mail: beveiliging tegen prompt injection (onvertrouwde e-mails), juiste prompts per actie, afhandeling van providerfouten. |
| `tests/eenheid/mail-opstel.test.ts` | `tests/eenheid/mail-compose.test.ts` | export: `main` — Mail opstellen op de server: MIME, concepten (eerst lokaal, daarna Gmail), direct verzenden, uitgestelde verzending en de wachtrij. |
| `tests/eenheid/mail-ux-beoordeling-20261021.test.ts` | `tests/eenheid/mail-ux-review-20261021.test.ts` | export: `main`, `AI_BALK_KLEIN_SCHERM`, `MAIL_ZOEK_SMAL` — Eenheidstest 21.10.2026 (UX-beoordelaar, frisse blik na vier agenten) — e-mail op telefoon (360/390 px) en in liggende stand |
| `tests/eenheid/mail-wachtrij.test.ts` | `tests/eenheid/mail-queue.test.ts` | export: `main` — Mailtaken (provider.sync.*): de uitvoerlus mag niet blijven hangen op de eerste (oudste) 100 taken van een eigenaar, en klaar-jobs worden opgeruimd. |

## Siteschil, menu, meldingen (52)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/eigenaar-sessie-overdracht.ts` | `backend/owner-session-handoff.ts` | export: `createOwnerHandoffRoutes` |
| `shared/ai-beleid/canoniek.ts` | `shared/ai-beleid/canonical.ts` | export: `CanonicalError`, `canonicalize`, `toBase64Url`, `fromBase64Url` +6 — * Canonieke JSON en base64url — werken identiek in Node en in de browser. |
| `src/CanoniekAccountMenu.tsx` | `src/CanonicalAccountMenu.tsx` | export: `accountWisselMelding`, `rememberedAccountStatusLabel`, `CanonicalAccountMenu (default)` |
| `src/CanoniekConsolidatieWeergave.tsx` | `src/CanonicalConsolidationView.tsx` | export: `CanonicalConsolidationView (default)` |
| `src/CanoniekImplementatieWaarheidMatrix.tsx` | `src/CanonicalImplementationTruthMatrix.tsx` | export: `CanonicalImplementationTruthMatrix (default)` |
| `src/CanoniekMeldingencentrum.tsx` | `src/CanonicalNotificationCenter.tsx` | export: `CanonicalNotificationCenter (default)` |
| `src/CanoniekOmlijsting.tsx` | `src/CanonicalChrome.tsx` | export: `SignedOutCenter`, `CanonicalChrome (default)` |
| `src/CanoniekVerbindingBand.tsx` | `src/CanonicalConnectionBanner.tsx` | export: `CanonicalConnectionBanner (default)` — Plakkaat «verbinding» — punt 3 van de audit 19.10.2026. |
| `src/DienstWeergaven.tsx` | `src/ServiceViews.tsx` | export: `GitHubServiceView`, `ApiServiceView` |
| `src/MeldingenpaneelInhoud.tsx` | `src/NotificationPanelBody.tsx` | export: `NotificationPanelBody (default)` |
| `src/MenuAanpasser.tsx` | `src/MenuCustomizer.tsx` | export: `MenuCustomizer (default)` |
| `src/ProductLegeToestand.tsx` | `src/ProductEmptyState.tsx` | export: `ProductEmptyState (default)` |
| `src/StabielAvatar.tsx` | `src/StableAvatar.tsx` | export: `StableAvatar (default)`, `PresentationAvatar` |
| `src/TaalVlag.tsx` | `src/LanguageFlag.tsx` | export: `LanguageFlag (default)` |
| `src/VerenigdDienstApp.tsx` | `src/UnifiedServiceApp.tsx` | export: `UnifiedServiceApp (default)` |
| `src/ViewportKnopinfoLaag.tsx` | `src/ViewportTooltipLayer.tsx` | export: `ViewportTooltipLayer (default)` |
| `src/canoniek-account-menu-model.ts` | `src/canonical-account-menu-model.ts` | export: `MAX_PREVIEW_ACCOUNTS`, `accountIdentityKey`, `isSameAccount`, `rememberedAccountStatus` +4 |
| `src/canoniek-account-menu.css` | `src/canonical-account-menu.css` |  |
| `src/canoniek-bestuur.css` | `src/canonical-governance.css` |  |
| `src/canoniek-dienst.ts` | `src/canonical-service.ts` | export: `serviceIds`, `publicServiceIds`, `domains`, `defaults` +7 |
| `src/canoniek-gebeurtenissen.ts` | `src/canonical-events.ts` | export: `CANONICAL_AUTH_CHANGE`, `broadcastCanonicalAuthChange`, `listenCanonicalAuthChanges` |
| `src/canoniek-implementatie-waarheid.css` | `src/canonical-implementation-truth.css` |  |
| `src/canoniek-meldingen.ts` | `src/canonical-notifications.ts` | export: `registerCanonicalNoticeAction`, `resolveCanonicalNoticeAction`, `releaseCanonicalNoticeAction`, `CANONICAL_NOTICE_EVENT` +3 |
| `src/canoniek-meldingencentrum.css` | `src/canonical-notification-center.css` |  |
| `src/canoniek-navigatie.ts` | `src/canonical-navigation.ts` | export: `sharedRouteSnapshot`, `serviceFromLocation`, `sessieDienst`, `routeLang` +11 |
| `src/canoniek-omlijsting.css` | `src/canonical-chrome.css` |  |
| `src/canoniek-teksten.ts` | `src/canonical-copy.ts` | export: `createCanonicalT`, `canonicalBuild`, `canonicalLineage` |
| `src/dienst-tab-labels.ts` | `src/service-tab-labels.ts` | export: `serviceTabLabel` — Namen van de pagina's (tabs) van elke dienst, zodat het zijmenu de pagina's van een ANDERE dienst kan tonen |
| `src/domein-weergave-cache.ts` | `src/domain-view-cache.ts` | export: `stableSignature`, `applyIfChanged`, `makeViewCacheKey`, `readCachedViewModel` +8 |
| `src/gedeelde-voorkeuren.ts` | `src/shared-preferences.ts` | export: `HUB_LAYOUTS_STORAGE_KEY`, `WEERGAVE_ACCOUNT_HINT`, `MAX_COOKIE`, `sleutelVoor` +28 — Gedeelde weergavevoorkeuren van alle subdomeinen — PER ACCOUNT en PER WEBRUIMTE (profiel). Punt 2 en punt 4, audit 20.10.2026. |
| `src/melding-positie.ts` | `src/notification-position.ts` | export: `placeNear` — Slimme plaatsing van het meldingenvenster en de pop-up bij de bel: altijd volledig binnen het scherm, aan de kant met de meeste ruimte (boven of onder… |
| `src/melding-stijl.tsx` | `src/notification-style.tsx` | export: `styleOf`, `sectionLabel`, `allSections` |
| `src/meldingenpaneel.css` | `src/notification-panel.css` | Meldingencentrum: brede, rustige lijst met zoeken, filters, groepering per dag, stand en duur. Op een telefoon een volle onderlade. |
| `src/menu-meldingen-opslag.ts` | `src/menu-meldingen-store.ts` | export: `menuTellers`, `useMenuTellers`, `tellersScope`, `tellersOphalen` +3 — Tellers voor het «levende» menu (fase B2). E-mail publiceert het aantal ongelezen in Postvak IN (alleen het getal); dat gaat — gebundeld |
| `src/menu-voorkeuren.tsx` | `src/menu-preferences.tsx` | export: `MENU_CATALOG`, `MENU_ICON_OPTIONS`, `defaultMenuPreferences`, `normalizeMenuPreferences` +13 |
| `src/mobiel-ux.css` | `src/mobile-ux.css` | Algemene mobiele verbeteringen van de siteschil. |
| `src/opstart-schil.ts` | `src/boot-shell.ts` | export: `releaseBootShell` |
| `src/product-lege-toestand.css` | `src/product-empty-state.css` |  |
| `src/sessie-overdracht.ts` | `src/session-handoff.ts` | export: `consumeSessionHandoff`, `consumeQueryHandoff`, `assignCanonicalService` |
| `src/stabiel-toestand.ts` | `src/stable-state.ts` | export: `retainEqual` |
| `src/taal-controller.ts` | `src/language-controller.ts` | export: `hasExplicitTabLanguage`, `resolveInitialLanguage`, `resolveAccountLanguage`, `persistBrowserLanguage` +1 |
| `src/taal-vlag.css` | `src/language-flag.css` |  |
| `src/tech/band-inschuiven.ts` | `src/tech/band-headroom.ts` | export: `DREMPEL_PX`, `MIN_TUSSEN_MS`, `OVERGANG_MS`, `RAND_PX` +7 — Technische band: verbergen bij naar beneden scrollen, tonen bij naar boven scrollen («headroom»), 18.10.2026. |
| `src/use-extern-rechthoek.ts` | `src/use-external-rect.ts` | export: `useExternalRectGetter` |
| `src/useCanoniekHubAuth.ts` | `src/useCanonicalHubAuth.ts` | export: `hubTabContext`, `hubAuthBody`, `useCanonicalHubAuth (default)` |
| `src/useStabielWeergaveModel.ts` | `src/useStableViewModel.ts` | export: `useStableViewModel` |
| `src/verenigd-dienst-inhoud.css` | `src/unified-service-content.css` |  |
| `src/viewport-knopinfo.css` | `src/viewport-tooltip.css` |  |
| `src/zichtbaar-voorladen.ts` | `src/visible-prefetch.ts` | export: `prefetchMode`, `prefetchBudgetAllows`, `prefetchData`, `cancelPrefetchData` +5 |
| `src/zwevend-ontwijking.ts` | `src/floating-avoidance.ts` | export: `rectsOverlap`, `registerZone`, `subscribeAvoidance`, `queueRecompute` +2 |
| `tests/eenheid/band-inschuiven.test.ts` | `tests/eenheid/band-headroom.test.ts` | export: `main` — Technische band «headroom» (18.10.2026). Live gaf de eerste versie 305 wissels in 15 s: verbergen veranderde de geometrie (top van |
| `tests/eenheid/melding-positie.test.ts` | `tests/eenheid/notification-position.test.ts` | export: `main` — Plaatsing van het meldingenvenster: altijd binnen het scherm, aan de kant met de meeste ruimte. |

## Toegang, beveiliging, identiteit (28)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/api-platform-kluis.ts` | `backend/api-platform-vault.ts` | export: `OWNER_VAULT_TABLE`, `OWNER_VAULT_PURPOSES`, `vaultEncryptionReady`, `apiPlatformVaultItems` +6 |
| `backend/toegangslaag.ts` | `backend/access-plane.ts` | export: `METHOD_IDS`, `herstelOverzicht`, `herstelSetSleutel`, `HERSTEL_MS` +5 |
| `backend/toegangssleutels.ts` | `backend/passkeys.ts` | export: `PASSKEY_LIMIETEN`, `passkeyRp`, `stapOpOrigins`, `AAGUID_NAMEN` +24 — Passkeys per gebruiker — Instellingen → «Aanmeldmethoden» (id.tarasevych.com/methods). |
| `scripts/beveiliging-bouw.mjs` | `scripts/security-build.mjs` | export: `externalizeInline`, `securityBuildPlugin` — Security-build: haalt de inline <script>/<style>-blokken uit index.html en zet ze in |
| `shared/kluis-meta.ts` | `shared/vault-meta.ts` | export: `VAULT_SOORTEN`, `VAULT_TZ`, `BIJNA_DAGEN`, `leegMeta` +8 — Metadata van een sleutel in de kluis (api.* → Geheimenkluis, admin.* → Sleutels): wanneer hij begint en eindigt, aan wie hij |
| `src/BeheerSleutelsWeergave.tsx` | `src/AdminKeysView.tsx` | export: `AdminKeysView (default)` |
| `src/BeveiligingSessiesPaneel.tsx` | `src/SecuritySessionsPanel.tsx` | export: `SecuritySessionsPanel (default)` — «Aanmeldingen en apparaten beheren»: aanmeldingen gegroepeerd per FYSIEK apparaat (User-Agent + netwerk; IPv4 en IPv6 van hetzelfde apparaat |
| `src/EigenaarIdentiteitAutoriseer.tsx` | `src/OwnerIdentityAuthorize.tsx` | export: `OwnerIdentityAuthorize (default)` |
| `src/EigenaarIdentiteitTerug.tsx` | `src/OwnerIdentityCallback.tsx` | export: `OwnerIdentityCallback (default)` |
| `src/IdentiteitBeheerWeergave.tsx` | `src/IdentityAdminView.tsx` | export: `IdentityAdminView (default)` |
| `src/KluisMeta.tsx` | `src/VaultMeta.tsx` | export: `VaultMetaRegel`, `VaultMetaVelden`, `VaultMetaBewerker` — Termijn, eigenaar en verantwoordelijke van een sleutel in de kluis (shared/kluis-meta.ts). Gebruikt in admin.*/contour en |
| `src/McpToestemmingVenster.tsx` | `src/McpConsentModal.tsx` | export: `consentPlek`, `ConsentTechPoort`, `ConsentRuimteRegel`, `McpConsentModal (default)` |
| `src/ToegangslaagWeergave.tsx` | `src/AccessPlaneView.tsx` | export: `AccessPlaneView (default)` |
| `src/ToegangssleutelsSectie.tsx` | `src/PasskeysSection.tsx` | export: `soortTekst`, `QR_HINT`, `PasskeysSection` — Instellingen → «Aanmeldmethoden» → Passkeys (RUNBOOK-VEILIGE-UITROL.md §13). Voor elke gebruiker: passkeys toevoegen, |
| `src/aanmeld-omleiding.ts` | `src/redirect-login.ts` | export: `cleanRedirectReturnTo`, `redirectStartReason`, `startPrimaryRedirectLogin` |
| `src/auth-stroom-beleid.ts` | `src/auth-flow-policy.ts` | export: `AUTH_RESTART_GRACE_MS`, `AUTH_CANCEL_RESTART`, `AUTH_CANCEL_USER` |
| `src/kluis-meta.css` | `src/vault-meta.css` | Termijn/eigenaar van sleutels in de kluis (KluisMeta.tsx). Eigen kleuren: tekst ≥ 4.5:1 in licht en donker. |
| `src/mcp-toestemming-opslag.ts` | `src/mcp-consent-store.ts` | export: `captureConsentFromUrl`, `getPendingConsent`, `clearPendingConsent` — Onthoudt een openstaand toestemmingsverzoek van Claude (?consent=<id>), ook als de gebruiker nog niet is ingelogd. |
| `src/mcp-toestemming-venster.css` | `src/mcp-consent-modal.css` | Toestemmingsscherm (mcp.tarasevych.com/claude, McpToestemmingVenster.tsx). 20.10.2026: alleen fundamenttokens (src/ontwerp/tokens.css). |
| `src/toegang-afgemeld.css` | `src/access-signed-out.css` |  |
| `src/toegangslaag-panelen.tsx` | `src/access-plane-panels.tsx` | export: `naarSectie`, `AccessPlanePanels` — Instellingen → «Aanmeldmethoden»: één pagina zoals bij GitHub (RUNBOOK-VEILIGE-UITROL.md §13). |
| `src/toegangslaag-teksten.ts` | `src/access-plane-copy.ts` | export: `t` |
| `src/toegangslaag.css` | `src/access-plane.css` |  |
| `tests/e2e/kluis-meta.e2e.ts` | `tests/e2e/vault-meta.e2e.ts` | export: `main` — E2E kluis: sleutel met termijn, eigenaar en verantwoordelijke (api.*/vault en admin.*/contour) met een echte Chrome. |
| `tests/eenheid/hulp/nep-toegangssleutel.ts` | `tests/eenheid/hulp/nep-passkey.ts` | export: `cbor`, `nieuwePasskey`, `NEP_RP`, `registreer` +1 — Software-"passkey" voor tests: maakt echte WebAuthn-registraties en -asserties (ES256 of Ed25519) zoals een telefoon, |
| `tests/eenheid/kluis-meta.test.ts` | `tests/eenheid/vault-meta.test.ts` | export: `main` — Kluis: metadata per sleutel (termijn, van wie, verantwoordelijke) en meldingen «verloopt binnenkort» / «verlopen» — |
| `tests/eenheid/toegangssleutels.test.ts` | `tests/eenheid/passkeys.test.ts` | export: `main` — Passkeys per gebruiker — Instellingen → «Aanmeldmethoden» (backend/toegangssleutels.ts, migratie 0023, RUNBOOK §13). |
| `tests/eenheid/toestemming-ruimte-cyclus-20261020.test.ts` | `tests/eenheid/consent-ruimte-cyclus-20261020.test.ts` | export: `main` — Cyclus in het toestemmingsvenster «Toegang voor Claude» (klacht van de eigenaar 20.10.2026: «begonnen met koppelen van de connector en niet afgerond — vastgelopen»). |

## Technische ruimte en beheer (55)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/beheer-diagnostiek-gebruiker.ts` | `backend/admin-diagnostiek-gebruiker.ts` | export: `beoordeelGebruiker`, `zoekGebruikers`, `gebruikerControle` — Admin → «Diagnostiek» → «Klacht van gebruiker»: de beheerder kiest een gebruiker en ziet wat die gebruiker op de site ervaart, ZONDER inhoud. |
| `backend/beheer-diagnostiek.ts` | `backend/admin-diagnostiek.ts` | export: `DOMEIN`, `hostVan`, `httpStand`, `tlsStand` +20 — Admin → «Diagnostiek» (/diagnostiek): alleen-lezen controles van diensten, pagina's, koppelingen, data, server, netwerk en taken. |
| `backend/beheer-integraties.ts` | `backend/admin-integraties.ts` | export: `levendVoor`, `zetBeleid`, `standUitLevend`, `adminIntegratieRoutes` — Admin → /mappen «Integraties»: levende toestand, beschikbaarheid voor gebruikers, statuscontrole en loskoppelen. |
| `backend/beheer-overzicht-kern.ts` | `backend/admin-overzicht-kern.ts` | export: `FAIL_RE`, `RUIS_BRON`, `isGebeurtenis`, `sectieVan` +12 — Kern van het live-overzicht van het beheerpaneel: PUUR (geen database, geen netwerk), zodat het volledig te testen is. |
| `backend/beheer-overzicht-momentopnamen.ts` | `backend/admin-overzicht-momentopnamen.ts` | export: `BEWAAR_DAGEN`, `getalSchoon`, `maakMomentopname`, `leesMomentopname` +4 — Momentopnamen van het beheeroverzicht: elk uur en elke dag een klein document met alleen TELLERS (tabel app.admin_overzicht_momentopnamen, |
| `backend/beheer-overzicht.ts` | `backend/admin-overzicht.ts` | export: `CACHE_MS`, `laadInvoer`, `invoerGecached`, `cacheLegen` +7 — Routes van het live-overzicht (admin.* → Overzicht): aggregaties, gebruikerskaart en de indeling per beheerder. |
| `backend/extern-routes.ts` | `backend/remote-routes.ts` | export: `remoteRoutes` — Routes van het externe bureaublad (backend/remote-bureaublad.ts). Alleen de eigenaar. Verbindingen wijzigen, toegestane hosts |
| `backend/site-aanroep.ts` | `backend/site-dispatch.ts` | export: `gedelegeerdeSessie`, `TOEGESTANE_ROUTES`, `echteAanroepZonderHekVoorTest`, `zetSiteAanroeper` +2 — Interne aanroep van routes van de site zelf namens een gebruiker (voor de MCP-hulpmiddelen van mail, agenda, schijf, zoeken, ...). |
| `backend/site-activiteit.ts` | `backend/site-activity.ts` | export: `SITE_RUIS`, `sourceOfAudit`, `siteEventsFromAudit` — Alles wat de gebruiker op de site doet, als meldingen: het auditlogboek (app.audit) omgezet naar gebeurtenissen met een sectie en dienst. |
| `backend/site-hulpmiddelen.ts` | `backend/site-tools.ts` | export: `compact`, `SITE_TOOLS`, `ADMIN_VIEW_ROUTES`, `SITE_TOOL_BY_NAME` +1 — MCP-hulpmiddelen voor wat de site zelf kan: zoeken, mail, agenda en schijf (Google Suite). Elk hulpmiddel is een dunne laag op een bestaande |
| `backend/tech-bundels.ts` | `backend/tech-assets.ts` | export: `sleutelUitCookie`, `wisCookie`, `_assetCacheLeeg`, `assetToegestaan` +2 — Toegang tot de technische bundels (/assets/tech/*, zie shared/tech-bundels.ts) — alleen met een actieve technische activering. |
| `backend/uitgave-info.ts` | `backend/release-info.ts` | export: `releaseInfo`, `_resetReleaseInfo` — Transparantie van de release: /api/version geeft terug welke release momenteel draait (versie, commit, auteur, agent, samenvatting). |
| `backend/vlaggen.ts` | `backend/flags.ts` | export: `berekenen`, `beheerLijst`, `zetten`, `verwijderen` +2 — Feature flags (etap F): opslag, berekening per gebruiker, beheer en tests. Zie shared/vlaggen.ts voor het waarom. |
| `scripts/tech-bundels-controle.mjs` | `scripts/tech-assets-controle.mjs` | export: `statischeTechImports`, `controleer` |
| `shared/beheer-diagnostiek.ts` | `shared/admin-diagnostiek.ts` | export: `CATEGORIEEN`, `DIENST_HOSTS`, `PAGINA_SLUGS`, `CONTROLES` +15 — Admin → «Diagnostiek» (/diagnostiek): register van alleen-lezen controles per categorie, gedeeld door server en browser. |
| `shared/extern-bureaublad.ts` | `shared/remote-bureaublad.ts` | export: `REMOTE_PROTOCOLLEN`, `STANDAARD_POORT`, `REMOTE_TICKET_MS`, `REMOTE_INACTIEF_MS` +19 — Extern bureaublad (RDP/VNC/SSH via Apache Guacamole) — zuivere regels, gedeeld door server en browser. |
| `shared/tech-bundels.ts` | `shared/tech-assets.ts` | export: `TECH_MAPPEN`, `TECH_BESTANDEN`, `TECH_MARKERING`, `bronPad` +4 — Welke frontendcode is «technisch» (alleen voor een sessie met actief technisch profiel)? |
| `shared/uitrol-diagnose-controles.ts` | `shared/uitrol-diagnose-checks.ts` | export: `CHECK_GROEPEN`, `CHECKS`, `CHECK_IDS`, `checkInfo` — Catalogus van de ALLEEN-LEZENDE controles in Admin → «Updates» → «Diagnostiek» → «Controles». |
| `shared/vlaggen.ts` | `shared/flags.ts` | export: `SLEUTEL_RE`, `MAX_GEBRUIKERS`, `emmer`, `evalueer` +2 — Feature flags (architectuur 13.10.2026, etap F). Eigen tabel op de eigen server, antwoord in de vorm van OpenFeature (OFREP). |
| `src/ApparatenWeergave.tsx` | `src/DevicesView.tsx` | export: `PendingList`, `DeviceDetail` |
| `src/BeheerAiBeleidWeergave.tsx` | `src/AdminAiBeleidView.tsx` | export: `deelFoutTekst`, `verwachteUitdaging`, `AdminAiBeleidView (default)` — Beheer → «AI-toegang» (§13.12): wat elke AI mag, met timers die de SERVER afdwingt, gewijzigd alleen met de |
| `src/BeheerConsoleWeergave.tsx` | `src/AdminConsoleView.tsx` | export: `AdminConsoleView (default)` |
| `src/BeheerDiagnostiekWeergave.tsx` | `src/AdminDiagnosticsView.tsx` | export: `AdminDiagnosticsView (default)` |
| `src/BeheerOverzichtWeergave.tsx` | `src/AdminOverviewView.tsx` | export: `AdminOverviewView (default)` — «Overzicht» van het beheerpaneel (vervangt het statische blok in AdminConsoleView): een live, instelbaar dashboard. |
| `src/BeheerUitrolWeergave.tsx` | `src/AdminUitrolView.tsx` | export: `AdminUitrolView (default)` — Admin → «Updates»: één dashboard voor het hele uitrolproces (RUNBOOK-VEILIGE-UITROL.md §13). |
| `src/ai-site-acties.ts` | `src/ai-site-actions.ts` | export: `registerSiteActions` — Acties en diagnose die Mijn Ruimte zelf aanbiedt aan AI-assistenten. |
| `src/beheer-ai-beleid.css` | `src/admin-ai-beleid.css` | Beheer → «AI-toegang» (§13.12) en alleen-lezen op mcp/agents#beleid. Zelfstandig: werkt ook buiten beheer-console.css. |
| `src/beheer-console.css` | `src/admin-console.css` |  |
| `src/beheer-termen.tsx` | `src/admin-terms.tsx` | export: `termLabel`, `termKnown`, `Term`, `TermList` +1 |
| `src/beheer-uitrol.css` | `src/admin-uitrol.css` | Admin → «Updates» (passkey-goedkeuring) |
| `src/extensie-map-installeer.ts` | `src/extension-folder-install.ts` | export: `PickerFailure`, `folderPickerSupported`, `SUBFOLDER`, `installExtensionToPickedFolder` — Installatie van de extensie rechtstreeks vanuit de browser in een map die de gebruiker zelf kiest in het systeemvenster (Bestand System Access API, Chromium). |
| `src/extern/ExternBureaublad.tsx` | `src/remote/RemoteBureaublad.tsx` | export: `RemoteBureaublad (default)`, `RemoteSessie` — «Extern bureaublad» (technisch profiel, alleen eigenaar): RDP/VNC/SSH via Apache Guacamole. Eigen chunk (lazyTech in TechLaag); |
| `src/extern/extern-opslag.ts` | `src/remote/remote-store.ts` | export: `remoteSessieBegin`, `remoteAantal`, `useRemoteAantal` — Hoeveel externe-bureaubladsessies dit tabblad open heeft — voor de aanduiding «actieve externe sessie» op de technische band. |
| `src/extern/extern.css` | `src/remote/remote.css` | «Extern bureaublad» (src/extern/ExternBureaublad.tsx). Lichte en donkere thema's (html.theme-dark / theme-plum-dark), 390 px. |
| `src/extern/guacamole.d.ts` | `src/remote/guacamole.d.ts` | export: `Guacamole (default)` — Minimale typen voor guacamole-common-js 1.5.0 (het pakket heeft er zelf geen). Alleen wat src/extern gebruikt. |
| `src/installeer-opdrachten.ts` | `src/install-commands.ts` | export: `guessArch`, `nodeInstallMethods`, `extensionInstallCommands` — Installatie-opties naar het voorbeeld van nodejs.org/download: besturingssysteem, architectuur, methode; de opdrachten en hints passen zich overeenkomstig aan. |
| `src/meldingen/tech-meldingen-opslag.ts` | `src/meldingen/tech-meldingen-store.ts` | export: `zetTechMeldingen`, `zetTechActiviteit`, `ongelezenTechActiviteit`, `techMeldingenStaat` +5 — Technische meldingen voor het paneel in de technische band (18.10.2026, verzoek eigenaar: meldingen voor de gebruiker los van de |
| `src/tech/tech-opslag.ts` | `src/tech/tech-store.ts` | export: `PROFIEL_META`, `profielVan`, `profielMetaBijwerken`, `techToestand` +19 — Toestand van het technisch profiel in DIT tabblad (één bron voor de band, het accountmenu en de «?»-uitleg). |
| `src/vlaggen/Vlaggen.tsx` | `src/flags/Vlaggen.tsx` | export: `VlaggenVenster (default)` — Venster «Vlaggen» in de band van het technisch profiel (etap F). |
| `src/vlaggen/vlaggen-api.ts` | `src/flags/flags.ts` | export: `laadVlaggen`, `vlaggenVernieuwen`, `useVlag` — Feature flags in de browser (etap F). Eén verzoek per pagina (POST /api/flags), daarna uit het geheugen. |
| `src/vlaggen/vlaggen.css` | `src/flags/flags.css` | Venster «Vlaggen» (Vlaggen.tsx): bouwt op .tech-venster / .tech-lijst; alleen de testknoppen en het tekstvak zijn eigen. |
| `tests/e2e/tech-bundels.e2e.ts` | `tests/e2e/tech-assets.e2e.ts` | export: `main` — E2E (echte Chrome, lokale build): technische bundels alleen voor een sessie met actief technisch profiel. |
| `tests/e2e/vlaggen.e2e.ts` | `tests/e2e/flags.e2e.ts` | export: `main` — E2E feature flags (etap F, 14.10.2026) in een echte Chrome: eigenaar → technisch profiel → «Vlaggen» → nieuwe vlag (uit voor iedereen |
| `tests/eenheid/beheer-diagnostiek-rook-20261022.test.ts` | `tests/eenheid/admin-diagnostiek-rook-20261022.test.ts` | export: `main` — «Diagnostiek» + RENDERCONTROLE + ZOEKINDEX (zone A, 22.10.2026). Vroeger stond er «Pagina 'Updates' HTTP 200 · Gezond» terwijl de pagina wit |
| `tests/eenheid/beheer-diagnostiek.test.ts` | `tests/eenheid/admin-diagnostiek.test.ts` | export: `main` — Admin → «Diagnostiek» (/diagnostiek): register ↔ uitvoerders, zuivere beoordelingen, sortering van «Aandacht vereist», whitelist van de route, |
| `tests/eenheid/beheer-integraties.test.ts` | `tests/eenheid/admin-integraties.test.ts` | export: `main` — Admin → /mappen «Integraties»: detailgegevens (eerlijk), populair/nieuw, beleid voor gebruikers, statuscontrole, loskoppelen, toegang en logboek. |
| `tests/eenheid/beheer-overzicht.test.ts` | `tests/eenheid/admin-overzicht.test.ts` | export: `main` — Admin → «Overzicht» (/overzicht): widgets/indeling (normalisatie, verplaatsen, formaat), gegevensbescherming van gebeurtenissen en gebruikersgeschiedenis, |
| `tests/eenheid/extensie-map-installeer.test.ts` | `tests/eenheid/extension-folder-install.test.ts` | export: `main` — Installatie van de extensie via de systeemeigen mapkiezer: schrijven pas na SHA-256-controle, bescherming tegen onveilige paden, annuleren. |
| `tests/eenheid/extern-bureaublad.test.ts` | `tests/eenheid/remote-bureaublad.test.ts` | export: `main` — Extern bureaublad via Apache Guacamole (uitvoerder D, 18.10.2026). Melding van de eigenaar: «Guacamole (RDP/VNC) — niet geïmplementeerd, |
| `tests/eenheid/installeer-opdrachten.test.ts` | `tests/eenheid/install-commands.test.ts` | export: `main` — Opties voor Node.js per systeem/architectuur en de installatiecommando's voor de extensie (zonder .cmd/.ps1-download: Smart App Control blokkeert die)… |
| `tests/eenheid/site-activiteit.test.ts` | `tests/eenheid/site-activity.test.ts` | export: `main` — Auditlogboek -> meldingen: juiste sectie/dienst per actie, ruis eruit, mislukkingen herkenbaar. |
| `tests/eenheid/site-hulpmiddelen.test.ts` | `tests/eenheid/site-tools.test.ts` | export: `main` — Site-hulpmiddelen van de MCP-connector (mail, agenda, schijf, zoeken), modi per hulpmiddel (altijd / ask / off), de wachtrij voor |
| `tests/eenheid/tech-bundels.test.ts` | `tests/eenheid/tech-assets.test.ts` | export: `main`, `geheimeBeheercode` — Technische bundels alleen voor een sessie met actief technisch profiel (verslag van de eigenaar 18.10.2026: «Technische assets alleen |
| `tests/eenheid/uitgave-info.test.ts` | `tests/eenheid/release-info.test.ts` | export: `main` — /api/version: backend/uitgave-info.ts leest de releasemetadata (versie, commit, auteur, agent, samenvatting) uit de |
| `tests/eenheid/vlaggen.test.ts` | `tests/eenheid/flags.test.ts` | export: `main` — Etap F (14.10.2026): feature flags. Pure berekening (shared/vlaggen.ts) en echte database + regels (backend/vlaggen.ts). |

## AI, agenten, MCP, browserextensie (46)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/ai-beheer-hulpmiddeldefinities.ts` | `backend/ai-beheer-tooldefs.ts` | export: `AUDIT_READ`, `SIEM_STATUS`, `USERS_MANAGE`, `FLAGS_MANAGE` +9 — Definities (alleen de vorm voor tools/list) van de vier TECHNISCHE beheerhulpmiddelen die tot 21.10.2026 «in ontwikkeling» |
| `backend/ai-beheer-hulpmiddelen.ts` | `backend/ai-beheer-tools.ts` | export: `maskeerEmail`, `ipPseudoniem`, `maskeerTekst`, `GEHEIME_SLEUTEL` +13 — De vier TECHNISCHE beheerhulpmiddelen van connector v2 (kant 'beheer'), sinds 21.10.2026 echt (besluit van de eigenaar: «rechten, |
| `backend/ai-toestemmingen.ts` | `backend/ai-grants.ts` | export: `CAPABILITIES`, `isCapability`, `DESTRUCTIVE`, `TYPE_CAPABILITY` +25 — Toestemmingen (grants) voor agents per gebruiker (veilig-agenten-0.4, migratie 0017). |
| `backend/browser-mogelijkheden.ts` | `backend/browser-capabilities.ts` | export: `BROWSER_TYPES`, `BROWSER_DEFAULT_ENABLED`, `BROWSER_AUTO_APPROVABLE`, `BROWSER_DEFAULT_AUTO` +2 — Mogelijkheden van de browserextensie (opdrachttypes) en hun standaardinstellingen. Eén bron voor server, tools, routes en tests. |
| `backend/connector-v2-opslag.ts` | `backend/connector-v2-store.ts` | export: `normaliseerKeuze`, `scopesVoor`, `leesRechten`, `zetRechten` +7 — Connector v2 — opslag (0045): rechten per koppeling, geheugen per gebruiker × agent, instellingen per gebruiker. |
| `backend/connectors-hulpmiddelen.ts` | `backend/connectors-tools.ts` | export: `V2_ALLEEN`, `AUDIT_SOORTEN`, `scriptExpressie`, `DEVTOOLS_ALIASES` +19 — Brug "connectors -> AI-tools" in het formaat van het Model Context Protocol (name / title / description / inputSchema / |
| `backend/connectors-opdrachten.ts` | `backend/connectors-commands.ts` | export: `isPowershellOpdracht`, `CommandRefused`, `submitCommand`, `requireFreshApproval` +3 — Opdrachten voor een agent: aanmaken volgens de toestemmingen (grants) van de gebruiker, goedkeuren, en wachten op het resultaat. |
| `backend/connectors-opslag.ts` | `backend/connectors-store.ts` | export: `AGENT_LIMITS`, `createPairingCode`, `countAgents`, `listAgents` +45 — Local Machine Connector: databasetoegang voor app.agents, app.agent_pairing_codes en app.agent_commands (0009). |
| `backend/dev-gebruiker-hulpmiddeldefinities.ts` | `backend/dev-gebruiker-tooldefs.ts` | export: `BEVESTIGING_ID`, `UPLOAD_MAX_BYTES`, `UPLOAD_MULTIPART_MAX`, `UPLOAD_TYPES` +6 — Definities (alleen de vorm voor tools/list) van de zes PRIVÉ-hulpmiddelen die tot 21.10.2026 «in ontwikkeling» stonden |
| `backend/mcp-connector-opslag.ts` | `backend/mcp-connector-store.ts` | export: `LIMITS`, `countClients`, `insertClient`, `getClient` +16 — MCP-connector voor Claude: databasetoegang voor app.mcp_oauth_clients, app.mcp_oauth_auth en app.mcp_oauth_tokens (0010). |
| `backend/mcp-klant-opslag.ts` | `backend/mcp-klant-store.ts` | export: `lijst`, `een`, `viaSleutel`, `toevoegen` +13 — Het REGISTER van vreemde MCP-servers per gebruiker (migratie 0078) en hun gekeurde lijst met hulpmiddelen. |
| `scripts/bouw-extensie.mjs` | `scripts/build-extension.mjs` | Bouwt de downloads van de browserextensie in dist/downloads/: |
| `scripts/extensie-lib.mjs` | `scripts/extension-lib.mjs` | export: `SITE`, `UPDATE_URL`, `CRX_URL`, `walk` +7 — Gedeelde functies voor het bouwen van het extensiepakket (ZIP) en het ondertekenen van het CRX3-pakket. |
| `scripts/onderteken-extensie.mjs` | `scripts/sign-extension.mjs` | Ondertekent de extensie als CRX3 met een EIGEN sleutel (alleen lokaal draaien; de privésleutel staat NIET in de repository). |
| `shared/ai-beleid/catalogus.ts` | `shared/ai-beleid/catalog.ts` | export: `CAPABILITIES`, `capabilityInfo`, `isKnownCapability`, `isOwnerOnly` +6 — * Catalogus van mogelijkheden (capabilities), hulpmiddelen en actietypes. |
| `shared/ai-beleid/tijd.ts` | `shared/ai-beleid/time.ts` | export: `DEFAULT_TZ`, `SECOND`, `MINUTE`, `HOUR` +18 — * Toegangstijd: sjablonen, «tot het hele uur», eigen duur en echte aftelling. |
| `src/AIDienstWeergave.tsx` | `src/AIServiceView.tsx` | export: `openIntegrations`, `openVault`, `hubUrl`, `AIServiceView (default)` |
| `src/AgentInrichtingWizard.tsx` | `src/AgentSetupWizard.tsx` | export: `PairCard` |
| `src/AgentenPaneel.tsx` | `src/AgentsPanel.tsx` | export: `AgentsPanel (default)` |
| `src/BrowserExtensiePaneel.tsx` | `src/BrowserExtensionPanel.tsx` | export: `BrowserExtensionPanel (default)` |
| `src/ExtensieWizard.tsx` | `src/ExtensionWizard.tsx` | export: `ExtensionWizard (default)` |
| `src/McpAgentenHub.tsx` | `src/McpAgentsHub.tsx` | De beheerpagina mcp.*/agents staat nu in ./agenten (tabbladen in GitHub-stijl). Dit bestand blijft als ingang voor bestaande imports. |
| `src/McpAppsWeergave.tsx` | `src/McpAppsView.tsx` | export: `McpAppsView (default)` — mcp.*/apps — «Applicaties op uw eigen hardware» (BYOS-PaaS). Eén plek voor de eigenaar: |
| `src/McpBackupsKaart.tsx` | `src/McpBackupsCard.tsx` | export: `McpBackupsCard (default)` |
| `src/McpConnectorPaneel.tsx` | `src/McpConnectorPanel.tsx` | export: `McpConnectorPanel (default)` |
| `src/McpDienstWeergave.tsx` | `src/McpServiceView.tsx` | export: `ingangAdres`, `McpServiceView (default)` |
| `src/McpHulpmiddelenPaneel.tsx` | `src/McpToolsPanel.tsx` | export: `ToolApprovals`, `McpToolsPanel (default)` |
| `src/McpServerBeheerKaart.tsx` | `src/McpServerBeheerCard.tsx` | export: `McpServerBeheerCard (default)` |
| `src/agent-opdrachten.ts` | `src/agent-commands.ts` | export: `winQuote`, `posixQuote`, `looksLikePlaceholder`, `buildAgentCommands` +1 — Opdrachten voor het koppelen van een pc of VM, per shell correct gequoot (zuivere functies; getest in tests/eenheid/agent-opdrachten.test.ts). |
| `src/agenten-gegevens.ts` | `src/agents-data.ts` | export: `sessionBody`, `COMMAND_LABELS`, `commandLabel`, `STATUS_LABELS` +8 |
| `src/agenten-paneel.css` | `src/agents-panel.css` |  |
| `src/agenten/gegevens.ts` | `src/agenten/data.ts` | export: `inRuimte`, `useOverzicht`, `useV2Overzicht`, `useDeurTokens` +5 — Gegevens voor /agents. Eén poller voor apparaten en wachtende acties (agents-data), de rest alleen bij openen, na een actie |
| `src/browser-agent-hartslag.ts` | `src/browser-agent-heartbeat.ts` | export: `HEARTBEAT_EVENT`, `heartbeatToestand` — Houdt een door de gebruiker aangezette browserextensie actief zolang er een INGELOGDE pagina van de site open is. |
| `src/browser-mogelijkheden-ui.ts` | `src/browser-capabilities-ui.ts` | export: `GROUPS`, `CAPABILITIES`, `DEFAULT_ENABLED`, `AUTO_HELP` — Mogelijkheden van de browserextensie zoals de gebruiker ze in het kabinet ziet: naam, groep en een uitleg voor AAN en UIT. |
| `src/connector-activiteit.ts` | `src/connector-activity.ts` | export: `statusInfo`, `activityTitle`, `activityLink`, `sourceLabel` +4 |
| `src/extensie-welkom-opslag.ts` | `src/extension-welcome-store.ts` | export: `captureWelcomeFromUrl`, `welcomePending`, `clearWelcome`, `isExtensiePagina` +3 — Onthoudt dat de extensie na het installeren de site opende met ?extension=welcome, ook als de gebruiker nog niet is ingelogd. |
| `src/extensie-wizard.css` | `src/extension-wizard.css` |  |
| `src/mcp-backups-kaart.css` | `src/mcp-backups-card.css` |  |
| `src/mcp-brug.css` | `src/mcp-bridge.css` |  |
| `src/mcp-catalogus.ts` | `src/mcp-catalog.ts` | export: `MCP_TABS`, `ESTATE`, `DOOR_TOOLS`, `TOOL_HELP` +1 |
| `src/mcp-domein.css` | `src/mcp-estate.css` |  |
| `src/mcp-teksten.ts` | `src/mcp-texts.ts` | export: `TOOL_TEXTS`, `textOf` — Alle zichtbare teksten per MCP-hulpmiddel in het Oekraïens en Nederlands (de Engelse beschrijving is alleen voor Claude zelf en verschijnt nooit op de… |
| `tests/eenheid/agent-opdrachten.test.ts` | `tests/eenheid/agent-commands.test.ts` | export: `main` — Koppelopdrachten voor de agent: correct gequoot per shell, geen punthaken, drive-root met backslash, startbestanden. |
| `tests/eenheid/agenten.test.ts` | `tests/eenheid/agents.test.ts` | export: `main` — Regressietests Local Machine Connector (migrations/0009_agents.sql, backend/connectors-*.ts): |
| `tests/eenheid/ai-toestemmingen-contract.test.ts` | `tests/eenheid/ai-grants-contract.test.ts` | export: `main` — De 8 contracttests van het toestemmingsmodel (grants) uit de opdracht "veilige agenten 0.4", tegen een echte Postgres: |
| `tests/eenheid/hulpmiddelen-tweetalig-20261020.test.ts` | `tests/eenheid/tools-tweetalig-20261020.test.ts` | export: `main` — Hulpmiddelen tweetalig (20.10.2026, eigenaar): de lijst van hulpmiddelen in de Claude-app toonde ENGELSE namen («Start, stop, |

## Hub, cloud, media, GitHub, zoeken op de site (36)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/cognitief-context.ts` | `backend/cognitive-context.ts` | export: `createCognitiveContextRoutes` |
| `backend/globaal-zoek.ts` | `backend/global-search.ts` | export: `ladeGroepen`, `createGlobalSearchRoutes` |
| `backend/google-suite-agenda-fotos.ts` | `backend/google-suite-calendar-photos.ts` | export: `createGoogleSuiteCalendarPhotosRoutes` |
| `backend/google-suite-agenda-sync.ts` | `backend/google-suite-calendar-sync.ts` | export: `synchroniseerAgendaVoorPrincipal`, `synchroniseerAgendaVoorEigenaar`, `runGoogleSuiteCalendarSync` — Google Calendar → de spiegel van de hub: INCREMENTELE synchronisatie per agenda. |
| `backend/hub-blok-gegevens.ts` | `backend/hub-block-data.ts` | export: `createHubBlockDataRoutes` |
| `backend/hub-indeling-voorkeuren.ts` | `backend/hub-layout-preferences.ts` | export: `createHubLayoutPreferenceRoutes` — Blokvoorkeuren van de hub (formaat/ingeklapt per blok). Onderdeel van de dienst «bord» (migratie 0086): ze horen bij de |
| `src/CloudFunctioneelWeergave.tsx` | `src/CloudFunctionalView.tsx` | export: `normaliseerBootstrap`, `CloudFunctionalView (default)` |
| `src/CognitiefContext.tsx` | `src/CognitiveContext.tsx` | export: `loadCognitiveResume`, `saveCognitiveResume`, `ServiceContextBar` |
| `src/DomoticaWeergave.tsx` | `src/SmartHomeView.tsx` | export: `SmartHomeView (default)` |
| `src/GitHubWeergave.tsx` | `src/GitHubView.tsx` | export: `GitHubView (default)` |
| `src/GlobaalZoekPaneel.tsx` | `src/GlobalSearchPanel.tsx` | export: `GlobalSearchPanel (default)` — «Overal zoeken» (oud paneel) → dunne schil over het nieuwe palet ⌘K (src/zoek/ZoekGlobaal.tsx, gemonteerd in CanonicalChrome). |
| `src/GoogleSuiteMediaWeergave.tsx` | `src/GoogleSuiteMediaView.tsx` | export: `GoogleCalendarView`, `GooglePhotosView` |
| `src/HubBlokWidget.tsx` | `src/HubBlockWidget.tsx` | export: `HubBlockWidget (default)` |
| `src/HubNotities.tsx` | `src/HubNotes.tsx` | export: `hubNotities`, `HubNotes (default)` — Hub → tabblad «Notities»: ECHTE notities, dezelfde als het MCP-hulpmiddel manage_hub_notes (bord-items kind 'note' |
| `src/cloud-aanbieder-i18n.ts` | `src/cloud-provider-i18n.ts` | export: `cloudProviderText` |
| `src/cloud-functioneel.css` | `src/cloud-functional.css` |  |
| `src/cognitief-context.css` | `src/cognitive-context.css` |  |
| `src/domotica.css` | `src/smart-home.css` |  |
| `src/github-weergave.css` | `src/github-view.css` |  |
| `src/globaal-zoek.css` | `src/global-search.css` | «Overal zoeken» (Z4, 22.10.2026): het oude paneel is vervangen door het palet ⌘K (src/zoek/ZoekGlobaal.tsx); alleen de knop in de |
| `src/hub-blok-gegevens.ts` | `src/hub-block-data.ts` | export: `readHubBlockDataCache`, `loadHubBlockData` |
| `src/hub-functioneel-blokken.css` | `src/hub-functional-blocks.css` |  |
| `src/hub-notities.css` | `src/hub-notes.css` | Hub → «Notities» (echte notities) |
| `src/zoek/ZoekCategorieIcoon.ts` | `src/search/ZoekCategorieIcoon.ts` | export: `CATEGORIE_ICOON` — /zoek — icoon per categorie (zone D, 22.10.2026): voor de groepskoppen «per bron» op de pagina. Alleen lucide-vormen; |
| `src/zoek/ZoekFilters.tsx` | `src/search/ZoekFilters.tsx` | export: `ZoekFilters (default)` — /zoek — het filterpaneel (specificatie §11): bron, type, formaat, taal, datum (presets + eigen periode), minimale |
| `src/zoek/ZoekGlobaal.tsx` | `src/search/ZoekGlobaal.tsx` | export: `PALET_EVENT`, `openZoekPalet`, `zoekPaginaUrl`, `ZoekMenuKnop` +1 — HET GLOBALE ZOEKVELD IN DE BOVENBALK + HET PALET ⌘K (zone Z4, 22.10.2026; specificatie §11 «bovenbalk»). |
| `src/zoek/ZoekIndexVenster.tsx` | `src/search/ZoekIndexVenster.tsx` | export: `INDEX_VENSTER_ID`, `ZoekIndexVenster (default)` — — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts). |
| `src/zoek/ZoekKaart.tsx` | `src/search/ZoekKaart.tsx` | export: `KaartIcoon`, `UITLEG_METHODE`, `fmtDatum`, `Stukken` +1 — /zoek — de resultaatkaart (specificatie §11): ronde typeicoon, titel, bron › pad, fragment met de markering van de SERVER |
| `src/zoek/ZoekPagina.tsx` | `src/search/ZoekPagina.tsx` | export: `DEBOUNCE_MS`, `ZoekPagina (default)` — hub.*/zoek — DE ZOEKPAGINA (zone Z4, 22.10.2026; specificatie §6.1, §6.2, §10, §11, §12). Binnen de hub-shell |
| `src/zoek/ZoekVeld.tsx` | `src/search/ZoekVeld.tsx` | export: `SUGGESTIE_LABEL`, `Hl`, `ZoekVeld (default)` — /zoek — het zoekveld met aanvulling (specificatie 6.1), gedeeld door de pagina /zoek (groot) en het palet ⌘K (compact). |
| `src/zoek/zoek-api.ts` | `src/search/zoek-api.ts` | export: `ZOEK_HOSTS`, `leesRoute`, `leesTreffer`, `leesSuggestie` +13 — /zoek — de clientkant van het contract (shared/zoek-model.ts, scratchpad/zoek-API.md). Zone Z4, 22.10.2026. |
| `src/zoek/zoek-index-api.ts` | `src/search/zoek-index-api.ts` | export: `indexStarten`, `indexStand`, `indexStoppen`, `indexGeschiedenis` — — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts). |
| `src/zoek/zoek-index-logica.ts` | `src/search/zoek-index-logic.ts` | export: `INDEX_BRONNEN`, `ACTIEF`, `isActief`, `leesBronStand` +8 — — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts). |
| `src/zoek/zoek-kern.ts` | `src/search/zoek-core.ts` | export: `norm`, `stukkenUitPosities`, `highlightParts`, `levenshtein` +7 — /zoek — zuivere kern voor de pagina en het palet (Z4, 22.10.2026): veilige markering (posities van de server → stukken |
| `src/zoek/zoek-logica.ts` | `src/search/zoek-logic.ts` | export: `CATEGORIEEN`, `CATEGORIE_BRONNEN`, `CATEGORIE_NAAM`, `SOORT_NAAM` +32 — /zoek — zuivere logica zonder DOM/React (Z4, 22.10.2026): categorieën ↔ bronnen, filters ↔ serververzoek (ZoekVraag), |
| `src/zoek/zoek.css` | `src/search/zoek.css` | /zoek — zone Z4 (22.10.2026). Alleen tokens uit src/ontwerp/tokens.css (geen hex, geen prefers-color-scheme: de thema's komen |

## Overig (20)

| Nieuwe naam | Oude naam | Inhoud (exports; eerste regel van commentaar) |
|---|---|---|
| `backend/api-platform-verbindingen.ts` | `backend/api-platform-connections.ts` | export: `OWNER_CONNECTIONS_TABLE`, `API_PLATFORM_CONNECTIONS`, `apiPlatformConnectionCards`, `zetVerbindingStatus` +2 |
| `backend/google-suite-inrichting.ts` | `backend/google-suite-onboarding.ts` | export: `AGENDA_LEES_SCOPE`, `AGENDA_SCHRIJF_SCOPE`, `googleGrantNogServerSleutel`, `googleSuiteMailSearchScopeStatus` +27 |
| `backend/overdracht-binding.ts` | `backend/handoff-binding.ts` | export: `HANDOFF_BINDING_COOKIE`, `handoffBindingVoorAanmaken`, `handoffBindingVanBrowser`, `metBindingCookie` — Browserbinding voor sessie-handoffs (?handoff=<code>), tegen login-CSRF. |
| `server/platform/geheimen.ts` | `server/platform/secrets.ts` | export: `SECRET_ALLOW_LIST`, `secrets` — Compatibiliteitslaag voor de vroegere AppDeploy 'geheimen'-API. |
| `server/platform/opslag.ts` | `server/platform/storage.ts` | export: `resolveStoragePath`, `padHoortBijAnder`, `storage`, `storageReady` — Compatibiliteitslaag voor de vroegere AppDeploy 'storage'-API, op het lokale bestandssysteem |
| `server/platform/uitnodigingen.ts` | `server/platform/invites.ts` | export: `InviteError`, `isInviteError`, `invites` — Compatibiliteitslaag voor de vroegere AppDeploy 'invites'-API (tabel app.invites). |
| `src/ApiPlatformWeergave.tsx` | `src/ApiPlatformView.tsx` | export: `ApiPlatformView (default)` |
| `src/InstellingencentrumWeergave.tsx` | `src/SettingsCenterView.tsx` | export: `SettingsCenterView (default)` |
| `src/SnelleToegangBewerker.tsx` | `src/SnelleToegangEditor.tsx` | export: `SnelleToegangEditor (default)` — «Snelle toegang» — een UITDRUKKELIJKE bewerker (punt 17, audit 19.10.2026). |
| `src/account-voorbeeld-geschiedenis.ts` | `src/account-preview-history.ts` | export: `accountPreviewKey`, `readAccountPreviewHistory`, `rememberAccountPreviewHistory`, `forgetAccountPreviewHistory` |
| `src/api-platform-weergave.css` | `src/api-platform-view.css` |  |
| `src/chat-paneel.css` | `src/chat-panel.css` |  |
| `src/ecosysteem-productie.css` | `src/ecosystem-production.css` |  |
| `src/ext-rechten.css` | `src/ext-permissions.css` |  |
| `src/instellingencentrum.css` | `src/settings-center.css` |  |
| `src/weergave/weergave-opslag.ts` | `src/weergave/weergave-store.ts` | export: `useWeergave`, `huidigeModus`, `weergaveVernieuwen`, `modusKiezen` +1 — Modus «Eenvoudig / uitgebreid» van dit account (zie shared/weergave.ts). De server is de bron; localStorage is alleen een kopie zodat |
| `tests/eenheid/beveiliging-beoordeling-20261021.test.ts` | `tests/eenheid/beveiliging-review-20261021.test.ts` | export: `main` — ONAFHANKELIJKE BEVEILIGINGSREVIEW van de wijzigingen van 21.10.2026 (bovenop 6aabff9). Elke «FOUT»-check hieronder is een AANVAL |
| `tests/eenheid/mededeling-ontdubbelen.test.ts` | `tests/eenheid/notice-dedupe.test.ts` | export: `main` — Dubbele meldingen (meerdere tabbladen, wisselende staat) verschijnen één keer; meldingen met een knop nooit onderdrukt. |
| `tests/eenheid/zoek-bronnen-etappe-c-20261021.test.ts` | `tests/eenheid/zoek-bronnen-etap-c-20261021.test.ts` | export: `main` — Zoeken etappe C (21.10.2026): veilig archieven uitpakken, tekst/OCR met sha256-cache, inhoud → delen, bronadapters, |
| `tests/eenheid/zoek-etappe-d-20261021.test.ts` | `tests/eenheid/zoek-etap-d-20261021.test.ts` | export: `main` — Etap D (/zoek): pure zoeklogica (categorieën, filters, URL-staat, markering) + route 'zoek' in beide tabbladlijsten. |

## Toegevoegd na de hernoeming (57)

Nieuwe bestanden verschijnen direct met Nederlandse namen; de kaart weet waar ze staan en wat erin zit (`toegevoegd` in `bestandskaart.json`).

| Bestand | Inhoud | Sinds |
|---|---|---|
| `scripts/kaart-controle.mjs` | Controle van deze kaart tijdens de build (eerste stap van `npm run build`): oude paden, ontbrekende nieuwe paden, Engelse namen, ontbrekende toegevoegde bestanden. | 86fd409 |
| `tests/eenheid/bestandskaart-20261024.test.ts` | Test van de bestandskaart en `kaart-controle`. | 86fd409 |
| `src/mail/lees-modus.ts` | Leesvenster — regels zonder DOM: welke vorm (volledig / rechts / onder / zwevend / telefoon), rol voor schermlezer, focus, Escape, «Terug», grenzen naast menu en dock, «priority+» van de kop. | pakket 1 «Adaptive Mail Canvas» |
| `src/mail/LeesVenster.tsx` | Leesvenster — kader rond het geopende bericht: één voor alle vormen; geeft de actiebalk (`MailLezerWerkbalk`) de vorm, het zwevende venster en Escape. | pakket 1 «Adaptive Mail Canvas» |
| `src/mail/lees-venster.css` | Leesvenster — CSS per vorm (`data-lees-modus`, `data-lees-breedte`): kop «priority+», «onder» zonder apart scrollen, greep van het zwevende venster. | pakket 1 «Adaptive Mail Canvas» |
| `tests/eenheid/lees-venster-20261024.test.ts` | Test van het leesvenster: regels, structuur in elke vorm, broncode, CSS. | pakket 1 «Adaptive Mail Canvas» |
| `tests/e2e/hulp/stand-lezer.ts` | Testopstelling `mail-lezer-*`: geometrie en gedrag van het leesvenster in elke vorm en afmeting, menu rechts en dock. | pakket 1 «Adaptive Mail Canvas» |
| `src/mail/gesprek-context.ts` | Gesprekscontext — regels zonder DOM en zonder AI: bijlageversies, tijdlijn, gerelateerde berichten met reden, afzendercontrole (SPF/DKIM/DMARC), «N eerdere berichten», aan/cc, telling van externe afbeeldingen en trackingpixels, tijd uit .ics met TZID. | pakket 2 «Adaptive Mail Canvas» |
| `tests/eenheid/gesprek-context-20261024.test.ts` | Test van de gesprekscontextregels: versies, tijdlijn, gerelateerde berichten, afzendercontrole, ontvangers. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/ContextPaneel.tsx` | Contextpaneel van het geopende bericht: kolom ernaast (≥ 1100 px) of blad met tabbladen; Tijdlijn · Bijlagen (versiegroepen) · Relaties (zoeken in deze mailbox, «zonder AI») · Taken en afspraken (.ics → «Naar Agenda») · Afzender (controle + contactkleur) · Beveiliging. Pakket 3: «Vergelijken» in elke versiegroep en punten uit «Wat wordt er van u verwacht?» (met bron) in «Taken en afspraken». | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/context-paneel.css` | CSS van het contextpaneel: vaste rijen van het leesvenster, kolom (368 px) en blad (zijkant/onderkant), tijdlijn, versies, kleuren, beveiliging; alleen tokens. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/gesprek-opmaak.css` | CSS van berichten en vensterkop (pakket 2): foto en contactkleur, aan/cc, ↩, «N eerdere berichten», versie op de kaart, afspraak uit .ics, «Weergave» (dichtheid/tekstgrootte), ∧ N van M ∨, «Beantwoorden», actiebalk op telefoon. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/ics-gebeurtenissen.ts` | Afspraken uit .ics-bijlagen: één keer lezen per bijlage (gedeeld door de kaart in het bericht en het contextpaneel), tijd met TZID, leesbare tijdweergave. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/SneltoetsenHulp.tsx` | Sneltoetshulp in het geopende bericht («?»): R, A, F, E, J/K, F6, Esc, ?. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/WeergaveKeuze.tsx` | «Weergave» van het bericht: dichtheid (compact/normaal/ruim) en tekstgrootte (90–130 %), via een knop in de kop en een blok onder ⋮ op telefoon. Pakket 3: «Taal van het bericht» (origineel of vertaling door privé-agent bij het openen). | pakket 2 «Adaptive Mail Canvas» |
| `tests/eenheid/lezer-context-20261024.test.ts` | Test van pakket 2: contextvorm, «Weergave», sneltoetsen (ook Oekraïense toetsenbordindeling), afbeeldingen/.ics/tekstgrootte, structuur van paneel en kop, broncode, CSS. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/beelden-toestemming.ts` | Externe afbeeldingen per afzender op dit apparaat («Altijd van deze afzender»): tot 300 adressen in localStorage, React-hook volgt wijzigingen (ook vanuit andere tabbladen). | pakket 2 «Adaptive Mail Canvas» |
| `shared/ai-bronnen.ts` | Bronnen van AI-punten — regels zonder DOM (in browser en op server): alinea's van het bericht (§1, §2 …), letterlijk zoeken van citaten, controle van punten en deadlines aan de hand van het ORIGINEEL, datums, eenvoudige analyse zonder model, «Antwoord verwacht», markering in de originele tekst. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/ai-staat.ts` | Welke privé-AI-agent e-mail mag lezen (één gedeeld verzoek per context), eerlijke foutmeldingen, aanroep van /ai-vertaling/run; laatst geladen status voor «Weergave». | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/alinea-aanwijzen.ts` | «Toon alinea in bericht»: het citaat van een punt wordt zichtbaar in het bericht zelf (iframe of tekst) — kader en CSS Custom Highlight, de tekst zelf verandert niet. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/WatNodigBlok.tsx` | Blok «Wat wordt er van u verwacht?» boven berichten: eenvoudige analyse in de browser of (na klikken) privé-agent; elk punt met bronchip en deadline, uitsluitend wat letterlijk in het bericht staat; Conceptantwoord · Naar taken · Naar Agenda. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/BronBlad.tsx` | Blad «Waar komt dit vandaan?»: punt, originele alinea met gemarkeerd citaat, vertaling van de alinea (alleen met agent), controleresultaat, «Toon alinea in bericht» en «Punt klopt niet — verwijderen». | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/VertaalStrook.tsx` | Vertaalstrook in het bericht: «Origineel / Vertaling / Vergelijken»; zonder agent alleen het origineel (en uitleg waarom). | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/VergelijkTabel.tsx` | «Vergelijken»: bericht als tabel per alinea (origineel ↔ vertaling), de bronalinea van punten gemarkeerd; op telefoon onder elkaar. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/ai-blok.css` | CSS voor AI in het bericht: blok, chips, deadlines, onderwerpregel, vertaalstrook, vergelijkingstabel, blad «Waar komt dit vandaan?», antwoordregel; alleen tokens (--info = AI). | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/VersieVergelijk.tsx` | Venster «Versies vergelijken» (vanuit het contextpaneel): twee versies van een bijlage, alleen tekst, verschil per alinea en zin met gemarkeerde woorden; eerlijke meldingen. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/versie-vergelijk.css` | CSS «Versies vergelijken»: laag boven het leesvenster, naast of onder elkaar (container zoekopdracht), alleen tokens. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/tekst-verschil.ts` | Verschil tussen twee teksten zonder DOM: blokken (alinea's, lijstitems, zinnen), LCS met ankers, verplaatste en gewijzigde blokken, woordverschil. | pakket 3 «Adaptive Mail Canvas» |
| `src/mail/bijlage-tekst.ts` | Tekst uit een bijlage voor «Versies vergelijken»: PDF via pdf.js (tot 60 pagina's, zonder kop-/voetteksten), tekst/CSV met decodering, DOCX/ODT/RTF via de bestaande documentlader. | pakket 3 «Adaptive Mail Canvas» |
| `tests/eenheid/ai-bronnen-20261024.test.ts` | Test van shared/ai-bronnen.ts: alinea's, letterlijk zoeken, controle, datums en deadlines (nl/uk/en/pl), eenvoudige analyse, «Antwoord verwacht», markering. | pakket 3 «Adaptive Mail Canvas» |
| `tests/eenheid/lezer-ai-20261024.test.ts` | Test van AI in het leesvenster: blok, blad «Waar komt dit vandaan?», vertaalstrook, tabel, contextpaneel («Vergelijken», punten), «Taal van het bericht», relaties en CSS. | pakket 3 «Adaptive Mail Canvas» |
| `tests/eenheid/ai-acties-20261024.test.ts` | Test van de servermodus «acties» in /ai-vertaling/run: invoer, controle aan de hand van het origineel, eerlijke weigeringen, cache. | pakket 3 «Adaptive Mail Canvas» |
| `tests/eenheid/versie-vergelijk-20261024.test.ts` | Test van «Versies vergelijken»: verschilberekening, tekst uit bijlagen (inclusief echte pdf), vensterstructuur, CSS. | pakket 3 «Adaptive Mail Canvas» |
| `tests/e2e/hulp/stand-lezer-ai.ts` | Testopstelling `mail-lezer-ai-*`: AI in het bericht met gesimuleerde privé-agent (één verzonnen punt) — blok, «Waar komt dit vandaan?», «Toon alinea in bericht», vertaalstrook en «Vergelijken», contextpaneel (punten, «Versies vergelijken» met echte PDF's), antwoordregel, «Taal van het bericht», axe. | pakket 3 «Adaptive Mail Canvas» |
| `shared/plaatsing.ts` | Zwevende knoppen — model zonder DOM: zones (bovenbalk, menukop, menulijst, actiestapel), slots voor telefoon / tablet / pc, standaardplaatsen, indeling, verplaatsen met weigering als een zone vol is, terugzetten naar de standaardplaats, stapelafmetingen, teksten uk/nl. | zwevende knoppen «zones en slots» (25.10.2026) |
| `src/plaatsing/plaatsing-staat.ts` | Gedeelde staat van zones en slots: indeling vanuit de schil, knopslots, verplaatsen, menu «Verplaatsen naar…», belteller voor ☰, hoogte van onderste balken. | zwevende knoppen «zones en slots» (25.10.2026) |
| `src/plaatsing/Plek.tsx` | Zones en slots in React: `useZone`, `<Gniezda>`, `<Plek knop>` (knop wordt in zijn eigen slot getekend), `<Actiestapel>` (boven de onderste balken), `<PlaatsActies>` («Verplaatsen naar…», toetsenbord, terugzetten), apparaattype op basis van breedte. | zwevende knoppen «zones en slots» (25.10.2026) |
| `src/plaatsing/plaats-slepen.ts` | Verplaatsen door slepen: 0,45 s ingedrukt houden (aanraken) of 5 px met de muis, «spookbeeld», zones met teller, volle zone weigert met hint, menu klapt open op ☰, Esc / annuleren, rechtermuisknop / menutoets → «Verplaatsen naar…». | zwevende knoppen «zones en slots» (25.10.2026) |
| `src/plaatsing/plaats-flip.ts` | Vloeiend opschuiven van buren in een zone tijdens het verplaatsen (160 ms; geen beweging bij «animaties verminderen»). | zwevende knoppen «zones en slots» (25.10.2026) |
| `src/plaatsing/plaatsing.css` | Eén CSS-laag voor zwevende knoppen: zones, slots, actiestapel (afmetingen = model), vensters boven zones (visibility), pop-upmelding bovenaan op telefoon, teller op ☰, verplaatsen, «Verplaatsen naar…». | zwevende knoppen «zones en slots» (25.10.2026) |
| `src/plaatsing/melding-plek.ts` | Plaats van een pop-upmelding: kandidaten op volgorde (pc — onder de bel, onderaan of bovenaan in het midden; telefoon — bovenaan onder de balk of boven de stapel), de eerste plaats zonder kleine knop eronder wint (QA 12.10 nr. 11). | zwevende knoppen «zones en slots» (25.10.2026) |
| `scripts/plaatsing-controle.mjs` | Controle tijdens de build: catalogus en capaciteit per apparaattype, CSS-afmetingen = model, elke knop precies één `<Plek>`, geen nieuwe `position:fixed` buiten de laag. | zwevende knoppen «zones en slots» (25.10.2026) |
| `scripts/plaatsing-vaste-elementen.json` | Lijst van CSS-regels met `position:fixed` van vóór deze laag (25.10.2026) en toegestane vensters/balken met reden — voor `plaatsing-controle`. | zwevende knoppen «zones en slots» (25.10.2026) |
| `tests/eenheid/plaatsing-20261025.test.ts` | Test van het model en de buildcontrole: apparaattypen, standaardplaatsen, capaciteit (43 200 combinaties), verplaatsen en weigeringen, normalisatie, terugzetten, afmetingen, teksten, menu-instellingen. | zwevende knoppen «zones en slots» (25.10.2026) |
| `tests/e2e/hulp/stand-plaatsing.ts` | Testopstelling `plaatsing-*`: metingen «voor» (`plaatsing-nu`) en acceptatie «na» (`plaatsing-na`): scrollen, adresbalk, «Naar boven», swipen, zoomen, pc → telefoon, herladen, verplaatsen, volle zone, menu openklappen, «Verplaatsen naar…», vrije ruimte voor melding; `plaatsing-dok` (dock rechts / boven / onder) en `plaatsing-lagen` (tellers, hint en menu in licht en donker thema, met axe). | zwevende knoppen «zones en slots» (25.10.2026) |
| `shared/mail-acties.ts` | Eén register van alle e-mailacties (39): groep, toon, teksten uk/nl in zes vormen, sneltoets en toestanden; bron voor de rijbalk, het ⋮-menu, de selectiebalk, het leesvenster, de onderste balk op telefoon, swipe en sneltoetshulp. | blok 1 «snelle fixes» (25.10.2026) |
| `src/mail/MailActieKnop.tsx` | Iconen en actieknop vanuit het register (data-mail-actie, data-toon). | blok 1 «snelle fixes» (25.10.2026) |
| `src/mail/mail-acties.css` | De enige plek waar toon kleur wordt (gevaar → --fout, info → --info, waarschuwing → --warn …) voor alle oppervlakken. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/eenheid/mail-acties-20261025.test.ts` | Test van het actieregister: elk oppervlak haalt acties uit het register, geen kleuren op basis van aria-label, tonen in licht en donker thema. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/eenheid/mail-geminimaliseerd-20261025.test.ts` | Test van geminimaliseerde berichten: plaats met natuurlijke hoogte, data-geplaatst, geen uitrekken, badge «+N», bijlagekaart groeit niet in de rij. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/eenheid/connector-instructies-20261025.test.ts` | Test van connectorinstructies: de eerste 512 tekens zijn zelfstandig leesbaar (vijf regels, volledige zinnen) voor elke agent en status; PERMISSION_OFF verwijst naar /agenten#agent/<agent>. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/eenheid/bevestig-toegang-opmaak-20261025.test.ts` | Test van het venster «Bevestig toegang» en toestemmingschips: selectievakje niet uitgerekt, bijschrift binnen het venster, contrast van bijschrift en toelichting in alle 26 paletten. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1.ts` | Testopstelling blok 1: bundelt de stappen blok1-* van vier teams (elk in een eigen bestand). | blok 1 «snelle fixes» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-acties.ts` | Testopstelling blok1-acties-*: balk binnen de rij in elke dichtheid, niets overlapt; dezelfde actiekleur op alle oppervlakken (licht en donker). | blok 1 «snelle fixes» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-geminimaliseerd.ts` | Testopstelling blok1-geminimaliseerd-*: dock ≤ 60 px wanneer ingeklapt, slepen zonder uitrekken, F5; kaart groeit niet door het muiswiel, lijst scrollt, pop-upvoorbeeld wordt groter. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-vensters.ts` | Testopstelling blok1-vensters: elke knop van elk venster (bericht in vier modi, bijlage, «Nieuw bericht», platformvenster) en elke [data-plaats-knop] raakt zichzelf bij elke positie van de bel. | blok 1 «snelle fixes» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-toegang.ts` | Testopstelling blok1-toegang-*: venster «Bevestig toegang» (bijschrift binnen het kader, contrast), toestemmingschips op 390 px, ChatGPT-pagina met nieuwe stappen en planwaarschuwing. | blok 1 «snelle fixes» (25.10.2026) |
