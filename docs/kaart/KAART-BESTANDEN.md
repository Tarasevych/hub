# Карта файлів «що де» — перейменування нідерландською, 24.10.2026

Усі англійські назви файлів коду сайту (src, backend, shared, server, tests, scripts) перейменовано нідерландською за одним словником: **531 файлів**, ще **29** свідомо лишились зі старою назвою (нижче). Вміст файлів не змінювався — лише шляхи імпортів і посилання на шляхи. Машинна версія цієї карти — `docs/kaart/bestandskaart.json`; збірка (`npm run build`) запускає `scripts/kaart-controle.mjs`, який перевіряє, що кожен новий шлях існує, жоден старий не повернувся і в коді, тестах та документах немає посилань на старі шляхи. Нова англійська назва файлу дає попередження з підказкою нідерландською.

**Як знайти файл за старою назвою:** пошук старої назви на цій сторінці або в `bestandskaart.json` (поле `oud`).

**Мапи:** `src/search` → `src/zoek`, `src/flags` → `src/vlaggen`, `src/remote` → `src/extern`.

**Нові файли після перейменування** — в останньому розділі («Додані після перейменування»); вони теж у `bestandskaart.json` (поле `toegevoegd`), і збірка зупиняється, якщо такого файла більше немає.

## Словник (найчастіші слова)

| EN | NL | файлів |
|---|---|---|
| editor | bewerker | 38 |
| preview | voorbeeld | 36 |
| capabilities | mogelijkheden | 32 |
| content | inhoud | 32 |
| view | weergave | 28 |
| admin | beheer | 22 |
| canonical | canoniek | 19 |
| search | zoek | 17 |
| reader | lezer | 16 |
| store | opslag | 11 |
| compose | opstel | 10 |
| panel | paneel | 10 |
| attachment | bijlage | 10 |
| dialog | dialoog | 10 |
| message | bericht | 10 |
| extension | extensie | 9 |
| settings | instellingen | 9 |
| tools | hulpmiddelen | 8 |
| data | gegevens | 8 |
| security | beveiliging | 7 |
| service | dienst | 7 |
| notification | melding | 7 |
| access | toegang | 6 |
| vault | kluis | 6 |
| commands | opdrachten | 6 |
| flags | vlaggen | 6 |
| layout | indeling | 6 |
| preferences | voorkeuren | 6 |
| remote | extern | 6 |
| row | rij | 6 |
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
| state | toestand | 5 |
| calendar | agenda | 4 |
| center | centrum | 4 |
| workspace | werkruimte | 4 |
| card | kaart | 4 |
| finance | financien | 4 |
| font | lettertype | 4 |

Незмінні: назви сервісів і форматів (Google, GitHub, MCP, AI, PDF, CalDAV…), загальновживані в нідерландському ІТ слова (mail, menu, account, browser, server, agent, app, chat, cloud, tab, model, context, platform, media, document, database, site, hub, dashboard, connector, console, widget, client) і кодові умовності (`use…` для хуків React, `index`, `main`, `App`).

## Що не перейменовано і чому

| Файл | Причина |
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

Також без змін: `migrations/` (назви міграцій записані в базі), таймери systemd і назви завдань у `cron.json`, `public/`, `extension/` (окремий пакет розширення), `index.html`, `vite.config.ts`, назви npm-команд (`npm run build` тощо), вихідні файли `dist-server/*.mjs` (їх викликає інсталятор).

## Пошта — переглядач листа («Adaptive Mail Canvas») (33)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/mail-uitstel.ts` | `backend/mail-snooze.ts` | експорт: `createMailSnoozeRoutes` |
| `src/GoogleMailWerkruimte.tsx` | `src/GoogleMailWorkspace.tsx` | експорт: `GoogleMailWorkspace (default)` |
| `src/MailBerichtTekst.tsx` | `src/MailMessageBody.tsx` | експорт: `MailMessageBody (default)` |
| `src/MailDichtheidProfielBewerker.tsx` | `src/MailDensityProfileEditor.tsx` | експорт: `MailDensityProfileEditor (default)` |
| `src/MailGeminimaliseerdeViewer.tsx` | `src/MailMinimizedViewer.tsx` | експорт: `MailMinimizedViewer (default)` |
| `src/MailGeordendDichtheidBlokken.tsx` | `src/MailOrderedDensityBlocks.tsx` | експорт: `MailOrderedDensityBlocks (default)` |
| `src/MailGesprekInhoud.tsx` | `src/MailThreadContent.tsx` | експорт: `MailThreadContent (default)` |
| `src/MailLezerAi.tsx` | `src/MailReaderAi.tsx` | експорт: `MailReaderAi (default)` |
| `src/MailLezerN09Dialoog.tsx` | `src/MailReaderN09Dialog.tsx` | експорт: `MailReaderN09Dialog (default)` |
| `src/MailLezerN10Dialoog.tsx` | `src/MailReaderN10Dialog.tsx` | експорт: `MailReaderN10Dialog (default)` |
| `src/MailLezerOrdenDialoog.tsx` | `src/MailReaderOrganizeDialog.tsx` | експорт: `MailReaderOrganizeDialog (default)` |
| `src/MailLezerWerkbalk.tsx` | `src/MailReaderToolbar.tsx` | експорт: `MailReaderToolbar (default)` |
| `src/MailLezerZoekNavigator.tsx` | `src/MailReaderSearchNavigator.tsx` | експорт: `MailReaderSearchNavigator (default)` |
| `src/MailUitstelBediening.tsx` | `src/MailSnoozeControl.tsx` | експорт: `MailSnoozeControl (default)` |
| `src/MailVertalingBalk.tsx` | `src/MailTranslationBar.tsx` | експорт: `MailTranslationBar (default)` |
| `src/google-mail-werkruimte.css` | `src/google-mail-workspace.css` |  |
| `src/lezer-venster.ts` | `src/reader-venster.ts` | експорт: `readerZwevend`, `pasToe`, `wissel`, `koppel` — 2.1: «Зменшити вікно» для перегляду листа — лист стає вільним вікном поверх пошти: перетягується за верхню панель, |
| `src/mail-bericht-tekst.css` | `src/mail-message-body.css` |  |
| `src/mail-dichtheid-profiel-bewerker.css` | `src/mail-density-profile-editor.css` |  |
| `src/mail-dichtheid-profiel.ts` | `src/mail-density-profile.ts` | експорт: `defaultMailRowBlockOrder`, `defaultMailDensityProfiles`, `normalizeMailDensityProfile`, `normalizeMailDensityProfiles` |
| `src/mail-dichtheid-vloeiend.ts` | `src/mail-density-fluid.ts` | експорт: `fluidMailLength` |
| `src/mail-geminimaliseerde-viewer.css` | `src/mail-minimized-viewer.css` |  |
| `src/mail-gesprek-bewerker.css` | `src/mail-thread-editor.css` |  |
| `src/mail-lezer-ai.css` | `src/mail-reader-ai.css` | ШІ-balk in de geopende brief (punt 14, 19.10.2026). |
| `src/mail-lezer-document.ts` | `src/mail-reader-document.ts` | експорт: `buildMailReaderDocument`, `openMailReaderDocument` |
| `src/mail-lezer-n09-dialoog.css` | `src/mail-reader-n09-dialog.css` |  |
| `src/mail-lezer-n10-dialoog.css` | `src/mail-reader-n10-dialog.css` |  |
| `src/mail-lezer-orden-dialoog.css` | `src/mail-reader-organize-dialog.css` |  |
| `src/mail-lezer-verbeteringen.css` | `src/mail-reader-enhancements.css` |  |
| `src/mail-lezer-werkbalk.css` | `src/mail-reader-toolbar.css` |  |
| `src/mail-lezer-zoek.css` | `src/mail-reader-search.css` |  |
| `src/mail-uitstel-bediening.css` | `src/mail-snooze-control.css` |  |
| `src/mail-vertaling-balk.css` | `src/mail-translation-bar.css` |  |

## Пошта — вкладення і переглядачі форматів (147)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `src/MailArchiefBewerker.tsx` | `src/MailArchiveEditor.tsx` | експорт: `MailArchiveEditor (default)` |
| `src/MailArchiefVoorbeeld.tsx` | `src/MailArchivePreview.tsx` | експорт: `MailArchivePreview (default)` |
| `src/MailBerichtBewerker.tsx` | `src/MailMessageEditor.tsx` | експорт: `MailMessageEditor (default)` |
| `src/MailBerichtVoorbeeld.tsx` | `src/MailMessagePreview.tsx` | експорт: `MailMessagePreview (default)` |
| `src/MailBeveiligingBewerker.tsx` | `src/MailSecurityEditor.tsx` | експорт: `MailSecurityEditor (default)` |
| `src/MailBeveiligingVoorbeeld.tsx` | `src/MailSecurityPreview.tsx` | експорт: `MailSecurityPreview (default)` |
| `src/MailBijlageKaart.tsx` | `src/MailAttachmentCard.tsx` | експорт: `MailAttachmentCard (default)` |
| `src/MailBijlageMiniatuur.tsx` | `src/MailAttachmentMiniature.tsx` | експорт: `MailAttachmentMiniature (default)` |
| `src/MailBijlageVoorbeeld.tsx` | `src/MailAttachmentPreview.tsx` | експорт: `describeMailAttachment`, `formatMailAttachmentSize`, `loadMailAttachmentPreview`, `loadMailAttachmentPreviewFromBlob` +4 |
| `src/MailBioinformaticaBewerker.tsx` | `src/MailBioinformaticsEditor.tsx` | експорт: `MailBioinformaticsEditor (default)` |
| `src/MailBioinformaticaVoorbeeld.tsx` | `src/MailBioinformaticsPreview.tsx` | експорт: `MailBioinformaticsPreview (default)` |
| `src/MailCadBewerker.tsx` | `src/MailCadEditor.tsx` | експорт: `MailCadEditor (default)` |
| `src/MailCadVoorbeeld.tsx` | `src/MailCadPreview.tsx` | експорт: `MailCadPreview (default)` |
| `src/MailDatabaseBewerker.tsx` | `src/MailDatabaseEditor.tsx` | експорт: `MailDatabaseEditor (default)` |
| `src/MailDatabaseVoorbeeld.tsx` | `src/MailDatabasePreview.tsx` | експорт: `MailDatabasePreview (default)` |
| `src/MailDevOpsBewerker.tsx` | `src/MailDevOpsEditor.tsx` | експорт: `MailDevOpsEditor (default)` |
| `src/MailDevOpsVoorbeeld.tsx` | `src/MailDevOpsPreview.tsx` | експорт: `MailDevOpsPreview (default)` |
| `src/MailDocumentBewerker.tsx` | `src/MailDocumentEditor.tsx` | експорт: `MailDocumentEditor (default)` |
| `src/MailDoorstuurBijlageDialoog.tsx` | `src/MailForwardAttachmentDialog.tsx` | експорт: `MailForwardAttachmentDialog (default)` |
| `src/MailDreigingBewerker.tsx` | `src/MailThreatEditor.tsx` | експорт: `MailThreatEditor (default)` |
| `src/MailDreigingVoorbeeld.tsx` | `src/MailThreatPreview.tsx` | експорт: `MailThreatPreview (default)` |
| `src/MailDrukvoorbereidingBewerker.tsx` | `src/MailPrepressEditor.tsx` | експорт: `MailPrepressEditor (default)` |
| `src/MailDrukvoorbereidingVoorbeeld.tsx` | `src/MailPrepressPreview.tsx` | експорт: `MailPrepressPreview (default)` |
| `src/MailEbookBewerker.tsx` | `src/MailEbookEditor.tsx` | експорт: `MailEbookEditor (default)` |
| `src/MailEbookVoorbeeld.tsx` | `src/MailEbookPreview.tsx` | експорт: `MailEbookPreview (default)` |
| `src/MailFinancienBewerker.tsx` | `src/MailFinanceEditor.tsx` | експорт: `MailFinanceEditor (default)` |
| `src/MailFinancienVoorbeeld.tsx` | `src/MailFinancePreview.tsx` | експорт: `MailFinancePreview (default)` |
| `src/MailGrafischBewerker.tsx` | `src/MailGraphicsEditor.tsx` | експорт: `MailGraphicsEditor (default)` |
| `src/MailGrafischVoorbeeld.tsx` | `src/MailGraphicsPreview.tsx` | експорт: `MailGraphicsPreview (default)` |
| `src/MailInstellingenVoorbeeld.tsx` | `src/MailSettingsPreview.tsx` | експорт: `MailSettingsPreview (default)` |
| `src/MailLettertypeBewerker.tsx` | `src/MailFontEditor.tsx` | експорт: `MailFontEditor (default)` |
| `src/MailLettertypeVoorbeeld.tsx` | `src/MailFontPreview.tsx` | експорт: `MailFontPreview (default)` |
| `src/MailLogistiekBewerker.tsx` | `src/MailLogisticsEditor.tsx` | експорт: `MailLogisticsEditor (default)` |
| `src/MailLogistiekVoorbeeld.tsx` | `src/MailLogisticsPreview.tsx` | експорт: `MailLogisticsPreview (default)` |
| `src/MailMediaDocumentBewerker.tsx` | `src/MailMediaDocumentEditor.tsx` | експорт: `MailMediaDocumentEditor (default)` |
| `src/MailMediaDocumentVoorbeeld.tsx` | `src/MailMediaDocumentPreview.tsx` | експорт: `MailMediaDocumentPreview (default)` |
| `src/MailMedischBewerker.tsx` | `src/MailMedicalEditor.tsx` | експорт: `MailMedicalEditor (default)` |
| `src/MailMedischVoorbeeld.tsx` | `src/MailMedicalPreview.tsx` | експорт: `MailMedicalPreview (default)` |
| `src/MailMlBewerker.tsx` | `src/MailMlEditor.tsx` | експорт: `MailMlEditor (default)` |
| `src/MailMlVoorbeeld.tsx` | `src/MailMlPreview.tsx` | експорт: `MailMlPreview (default)` |
| `src/MailMuziekBewerker.tsx` | `src/MailMusicEditor.tsx` | експорт: `MailMusicEditor (default)` |
| `src/MailMuziekVoorbeeld.tsx` | `src/MailMusicPreview.tsx` | експорт: `MailMusicPreview (default)` |
| `src/MailMuziekWerkbank.tsx` | `src/MailMusicWorkbench.tsx` | експорт: `MailMusicWorkbench (default)` |
| `src/MailNavigatieBewerker.tsx` | `src/MailNavigationEditor.tsx` | експорт: `MailNavigationEditor (default)` |
| `src/MailNetwerkBewerker.tsx` | `src/MailNetworkEditor.tsx` | експорт: `MailNetworkEditor (default)` |
| `src/MailNetwerkVoorbeeld.tsx` | `src/MailNetworkPreview.tsx` | експорт: `MailNetworkPreview (default)` |
| `src/MailOpgemaaktDocumentVoorbeeld.tsx` | `src/MailRichDocumentPreview.tsx` | експорт: `MailRichDocumentPreview (default)` |
| `src/MailOpstelBewerker.tsx` | `src/MailComposeEditor.tsx` | експорт: `MailComposeEditor (default)` |
| `src/MailOverheidBewerker.tsx` | `src/MailGovernmentEditor.tsx` | експорт: `MailGovernmentEditor (default)` |
| `src/MailOverheidVoorbeeld.tsx` | `src/MailGovernmentPreview.tsx` | експорт: `MailGovernmentPreview (default)` |
| `src/MailPdfVoorbeeld.tsx` | `src/MailPdfPreview.tsx` | експорт: `MailPdfPreview (default)` |
| `src/MailPersoonsgegevensBewerker.tsx` | `src/MailPersonalDataEditor.tsx` | експорт: `MailPersonalDataEditor (default)` |
| `src/MailPersoonsgegevensVoorbeeld.tsx` | `src/MailPersonalDataPreview.tsx` | експорт: `MailPersonalDataPreview (default)` |
| `src/MailPresentatieBewerker.tsx` | `src/MailPresentationEditor.tsx` | експорт: `MailPresentationEditor (default)` |
| `src/MailPresentatieVoorbeeld.tsx` | `src/MailPresentationPreview.tsx` | експорт: `MailPresentationPreview (default)` |
| `src/MailRekenbladBewerker.tsx` | `src/MailSpreadsheetEditor.tsx` | експорт: `MailSpreadsheetEditor (default)` |
| `src/MailRekenbladVoorbeeld.tsx` | `src/MailSpreadsheetPreview.tsx` | експорт: `MailSpreadsheetPreview (default)` |
| `src/MailSpelontwikkelingBewerker.tsx` | `src/MailGameDevEditor.tsx` | експорт: `MailGameDevEditor (default)` |
| `src/MailSpelontwikkelingVoorbeeld.tsx` | `src/MailGameDevPreview.tsx` | експорт: `MailGameDevPreview (default)` |
| `src/MailTaalkundeBewerker.tsx` | `src/MailLinguisticsEditor.tsx` | експорт: `MailLinguisticsEditor (default)` |
| `src/MailTaalkundeVoorbeeld.tsx` | `src/MailLinguisticsPreview.tsx` | експорт: `MailLinguisticsPreview (default)` |
| `src/MailTechniekBewerker.tsx` | `src/MailEngineeringEditor.tsx` | експорт: `MailEngineeringEditor (default)` |
| `src/MailTechniekVoorbeeld.tsx` | `src/MailEngineeringPreview.tsx` | експорт: `MailEngineeringPreview (default)` |
| `src/MailVasteIndelingBewerker.tsx` | `src/MailFixedLayoutEditor.tsx` | експорт: `MailFixedLayoutEditor (default)` |
| `src/MailVasteIndelingVoorbeeld.tsx` | `src/MailFixedLayoutPreview.tsx` | експорт: `MailFixedLayoutPreview (default)` |
| `src/MailVttRpgBewerker.tsx` | `src/MailVttRpgEditor.tsx` | експорт: `MailVttRpgEditor (default)` |
| `src/MailVttRpgVoorbeeld.tsx` | `src/MailVttRpgPreview.tsx` | експорт: `MailVttRpgPreview (default)` |
| `src/MailWetenschappelijkBewerker.tsx` | `src/MailScientificEditor.tsx` | експорт: `MailScientificEditor (default)` |
| `src/MailWetenschappelijkVoorbeeld.tsx` | `src/MailScientificPreview.tsx` | експорт: `MailScientificPreview (default)` |
| `src/mail-archief-inhoud.ts` | `src/mail-archive-content.ts` | експорт: `inspectMailZipDirectory`, `readMailZipEntry`, `detectMailArchiveContentType`, `loadMailArchiveContent` +3 |
| `src/mail-archief-mogelijkheden.ts` | `src/mail-archive-capabilities.ts` | експорт: `mailArchiveCapability`, `isMailArchiveAttachment` |
| `src/mail-begrensd-gzip.ts` | `src/mail-bounded-gzip.ts` | експорт: `gunzipBounded` |
| `src/mail-begrensd-zip.ts` | `src/mail-bounded-zip.ts` | експорт: `unzipMailPackageBounded` |
| `src/mail-bericht-inhoud.ts` | `src/mail-message-content.ts` | експорт: `detectMailMessageContentType`, `loadMailMessageContent`, `validateMailMessageSource`, `exportMailMessage` |
| `src/mail-bericht-mogelijkheden.ts` | `src/mail-message-capabilities.ts` | експорт: `mailMessageCapability`, `isMailMessageAttachment` |
| `src/mail-beveiliging-inhoud.ts` | `src/mail-security-content.ts` | експорт: `detectMailSecurityContentType`, `loadMailSecurityContent`, `validateMailSecuritySource`, `exportMailSecurity` +1 |
| `src/mail-beveiliging-mogelijkheden.ts` | `src/mail-security-capabilities.ts` | експорт: `mailSecurityCapability`, `isMailSecurityAttachment` |
| `src/mail-bijlage-cache.ts` | `src/mail-attachment-cache.ts` | експорт: `mailCacheScope`, `setMailPrivateCacheRemembered`, `endMailPrivateCacheSession`, `forgetMailPrivateCacheOwner` +21 — Beveiligingsreview 21.10.2026: de lokale concepten (src/mail-concept-lokaal.ts, platte tekst in localStorage) volgen dezelfde regel |
| `src/mail-bijlage-lader.ts` | `src/mail-attachment-loader.ts` | експорт: `MAIL_ATTACHMENT_PREVIEW_MAX_BYTES`, `loadMailAttachmentBlob`, `preloadMailAttachmentBlob` |
| `src/mail-bijlage-strook.css` | `src/mail-attachment-strip.css` |  |
| `src/mail-bijlage-werkbank.css` | `src/mail-attachment-workbench.css` |  |
| `src/mail-bijlage-werkbank.ts` | `src/mail-attachment-workbench.ts` | експорт: `resolveMailAttachmentWorkbench`, `mailAttachmentEditSemanticsLabel`, `mailAttachmentViewModeLabel` |
| `src/mail-bioinformatica-inhoud.ts` | `src/mail-bioinformatics-content.ts` | експорт: `detectMailBioinformaticsContentType`, `loadMailBioinformaticsContent`, `validateMailBioinformaticsSource`, `exportMailBioinformatics` |
| `src/mail-bioinformatica-mogelijkheden.ts` | `src/mail-bioinformatics-capabilities.ts` | експорт: `mailBioinformaticsCapability`, `isMailBioinformaticsAttachment` |
| `src/mail-cad-inhoud.ts` | `src/mail-cad-content.ts` | експорт: `loadMailCadContent`, `exportMailCad`, `exportMailCadGeometry` |
| `src/mail-cad-mogelijkheden.ts` | `src/mail-cad-capabilities.ts` | експорт: `mailCadCapability`, `isMailCadAttachment` |
| `src/mail-database-binair.ts` | `src/mail-database-binary.ts` | експорт: `detectMailDatabaseBinaryType`, `inspectMailDatabaseBinary` |
| `src/mail-database-inhoud.ts` | `src/mail-database-content.ts` | експорт: `loadMailDatabaseContent`, `exportMailDatabaseTable`, `detectMailDatabaseContentType`, `validateMailDatabaseSource` +1 |
| `src/mail-database-mogelijkheden.ts` | `src/mail-database-capabilities.ts` | експорт: `mailDatabaseCapability`, `isMailDatabaseAttachment` |
| `src/mail-devops-inhoud.ts` | `src/mail-devops-content.ts` | експорт: `detectMailDevOpsContentType`, `loadMailDevOpsContent`, `validateMailDevOpsSource`, `exportMailDevOps` |
| `src/mail-devops-mogelijkheden.ts` | `src/mail-devops-capabilities.ts` | експорт: `mailDevOpsCapability`, `isMailDevOpsAttachment` |
| `src/mail-devops-serialisatie.ts` | `src/mail-devops-serialization.ts` | експорт: `isSerializationParser`, `isSerializationBinaryParser`, `serializationSourceKind`, `detectSerializationSource` +4 |
| `src/mail-document-inhoud.ts` | `src/mail-document-content.ts` | експорт: `sanitizeMailDocumentHtml`, `loadMailDocumentContent`, `exportMailDocumentContent` |
| `src/mail-document-mogelijkheden.ts` | `src/mail-document-capabilities.ts` | експорт: `mailDocumentCapability`, `isMailDocumentAttachment` |
| `src/mail-docx-kopie.ts` | `src/mail-docx-copy.ts` | експорт: `inspectMailDocxCopy`, `exportMailDocxCopy` |
| `src/mail-doorstuur-bijlage-dialoog.css` | `src/mail-forward-attachment-dialog.css` |  |
| `src/mail-dreiging-inhoud.ts` | `src/mail-threat-content.ts` | експорт: `detectMailThreatContentType`, `loadMailThreatContent`, `validateMailThreatSource`, `exportMailThreat` |
| `src/mail-dreiging-mogelijkheden.ts` | `src/mail-threat-capabilities.ts` | експорт: `mailThreatCapability`, `isMailThreatAttachment` |
| `src/mail-drukvoorbereiding-inhoud.ts` | `src/mail-prepress-content.ts` | експорт: `validateMailPrepressSource`, `detectMailPrepressContentType`, `loadMailPrepressContent`, `exportMailPrepress` |
| `src/mail-drukvoorbereiding-mogelijkheden.ts` | `src/mail-prepress-capabilities.ts` | експорт: `mailPrepressCapability`, `isMailPrepressAttachment` |
| `src/mail-ebook-inhoud.ts` | `src/mail-ebook-content.ts` | експорт: `loadMailEbookContent`, `exportMailEbook` |
| `src/mail-ebook-mogelijkheden.ts` | `src/mail-ebook-capabilities.ts` | експорт: `mailEbookCapability`, `isMailEbookAttachment` |
| `src/mail-financien-inhoud.ts` | `src/mail-finance-content.ts` | експорт: `detectMailFinanceContentType`, `loadMailFinanceContent`, `validateMailFinanceSource`, `exportMailFinance` |
| `src/mail-financien-mogelijkheden.ts` | `src/mail-finance-capabilities.ts` | експорт: `mailFinanceCapability`, `isMailFinanceAttachment` |
| `src/mail-geo-uitgebreid.ts` | `src/mail-geospatial-extended.ts` | експорт: `detectGeospatialSource`, `validateGeospatialSource`, `geospatialSourceKind`, `geospatialSourceRows` +2 |
| `src/mail-grafisch-inhoud.ts` | `src/mail-graphics-content.ts` | експорт: `sanitizeMailSvgSource`, `loadMailGraphicsContent`, `validateMailGraphicsSource`, `exportMailGraphicsSource` |
| `src/mail-grafisch-mogelijkheden.ts` | `src/mail-graphics-capabilities.ts` | експорт: `mailGraphicsCapability`, `isMailGraphicsAttachment` |
| `src/mail-juridisch-archief-uitgebreid.ts` | `src/mail-legal-archive-extended.ts` | експорт: `detectLegalArchiveSource`, `validateLegalArchiveSource`, `readLegalArchiveSource`, `legalArchiveSourceKind` +3 |
| `src/mail-lettertype-inhoud.ts` | `src/mail-font-content.ts` | експорт: `detectMailFontContentType`, `validateMailFontSource`, `exportMailFontSource`, `loadMailFontContent` |
| `src/mail-lettertype-mogelijkheden.ts` | `src/mail-font-capabilities.ts` | експорт: `mailFontCapability`, `isMailFontAttachment` |
| `src/mail-logistiek-inhoud.ts` | `src/mail-logistics-content.ts` | експорт: `detectMailLogisticsContentType`, `loadMailLogisticsContent`, `validateMailLogisticsSource`, `exportMailLogistics` |
| `src/mail-logistiek-mogelijkheden.ts` | `src/mail-logistics-capabilities.ts` | експорт: `mailLogisticsCapability`, `isMailLogisticsAttachment` |
| `src/mail-mdb-lezer.ts` | `src/mail-mdb-reader.ts` | mdb-reader met de Node-shim ervoor (zie src/platform/node-shim.ts): de import-volgorde is de uitvoervolgorde — eerst de shim, dan de bibliotheek. |
| `src/mail-media-document-inhoud.ts` | `src/mail-media-document-content.ts` | експорт: `validateMailMediaDocumentSource`, `validateMailBwfMetadata`, `loadMailMediaDocumentContent`, `exportMailMediaDocument` |
| `src/mail-media-document-mogelijkheden.ts` | `src/mail-media-document-capabilities.ts` | експорт: `mailMediaDocumentCapability`, `isMailMediaDocumentAttachment` |
| `src/mail-medisch-inhoud.ts` | `src/mail-medical-content.ts` | експорт: `detectMailMedicalContentType`, `loadMailMedicalContent`, `validateMailMedicalSource`, `exportMailMedical` |
| `src/mail-medisch-mogelijkheden.ts` | `src/mail-medical-capabilities.ts` | експорт: `mailMedicalCapability`, `isMailMedicalAttachment` |
| `src/mail-ml-inhoud.ts` | `src/mail-ml-content.ts` | експорт: `detectMailMlContentType`, `loadMailMlContent`, `validateMailMlSource`, `exportMailMl` |
| `src/mail-ml-mogelijkheden.ts` | `src/mail-ml-capabilities.ts` | експорт: `mailMlCapability`, `isMailMlAttachment` |
| `src/mail-muziek-inhoud.ts` | `src/mail-music-content.ts` | експорт: `detectMailMusicContentType`, `loadMailMusicContent`, `validateMailMusicSource`, `exportMailMusic` |
| `src/mail-muziek-mogelijkheden.ts` | `src/mail-music-capabilities.ts` | експорт: `mailMusicCapability`, `isMailMusicAttachment` |
| `src/mail-muziek-werkbank.css` | `src/mail-music-workbench.css` |  |
| `src/mail-netwerk-inhoud.ts` | `src/mail-network-content.ts` | експорт: `detectMailNetworkContentType`, `loadMailNetworkContent`, `validateMailNetworkSource`, `exportMailNetwork` |
| `src/mail-netwerk-mogelijkheden.ts` | `src/mail-network-capabilities.ts` | експорт: `mailNetworkCapability`, `isMailNetworkAttachment` |
| `src/mail-overheid-inhoud.ts` | `src/mail-government-content.ts` | експорт: `detectMailGovernmentContentType`, `loadMailGovernmentContent`, `validateMailGovernmentSource`, `exportMailGovernment` |
| `src/mail-overheid-mogelijkheden.ts` | `src/mail-government-capabilities.ts` | експорт: `mailGovernmentCapability`, `isMailGovernmentAttachment` |
| `src/mail-persoonsgegevens-inhoud.ts` | `src/mail-personal-data-content.ts` | експорт: `detectMailPersonalDataContentType`, `loadMailPersonalDataContent`, `validateMailPersonalDataSource`, `exportMailPersonalData` |
| `src/mail-persoonsgegevens-mogelijkheden.ts` | `src/mail-personal-data-capabilities.ts` | експорт: `mailPersonalDataCapability`, `isMailPersonalDataAttachment` |
| `src/mail-presentatie-inhoud.ts` | `src/mail-presentation-content.ts` | експорт: `loadMailPresentationContent`, `exportMailPresentationPptx` |
| `src/mail-presentatie-mogelijkheden.ts` | `src/mail-presentation-capabilities.ts` | експорт: `mailPresentationCapability`, `isMailPresentationAttachment` |
| `src/mail-rekenblad-inhoud.ts` | `src/mail-spreadsheet-content.ts` | експорт: `loadMailSpreadsheetContent`, `exportMailSpreadsheet` |
| `src/mail-rekenblad-mogelijkheden.ts` | `src/mail-spreadsheet-capabilities.ts` | експорт: `mailSpreadsheetCapability`, `isMailSpreadsheetAttachment` |
| `src/mail-ruim-raster.ts` | `src/mail-bulky-raster.ts` | експорт: `mailBulkyRaster`, `BULKY_MIN_TEKST`, `BULKY_AVATAR` — Режим «Громіздкий» (аудит пошти 18.10.2026, тред «Задача: привести до ладу режим Громіздкий»). |
| `src/mail-ruim-voorbeeld-voorladen.ts` | `src/mail-bulky-preview-prefetch.ts` | експорт: `queueMailBulkyPreview`, `cancelMailBulkyPreviewGroup` |
| `src/mail-spelontwikkeling-inhoud.ts` | `src/mail-gamedev-content.ts` | експорт: `detectMailGameDevContentType`, `loadMailGameDevContent`, `validateMailGameDevSource`, `exportMailGameDev` |
| `src/mail-spelontwikkeling-mogelijkheden.ts` | `src/mail-gamedev-capabilities.ts` | експорт: `mailGameDevCapability`, `isMailGameDevAttachment` |
| `src/mail-taalkunde-inhoud.ts` | `src/mail-linguistics-content.ts` | експорт: `detectMailLinguisticsContentType`, `loadMailLinguisticsContent`, `validateMailLinguisticsSource`, `exportMailLinguistics` |
| `src/mail-taalkunde-mogelijkheden.ts` | `src/mail-linguistics-capabilities.ts` | експорт: `mailLinguisticsCapability`, `isMailLinguisticsAttachment` |
| `src/mail-techniek-inhoud.ts` | `src/mail-engineering-content.ts` | експорт: `detectMailEngineeringContentType`, `loadMailEngineeringContent`, `validateMailEngineeringSource`, `exportMailEngineering` |
| `src/mail-techniek-mogelijkheden.ts` | `src/mail-engineering-capabilities.ts` | експорт: `mailEngineeringCapability`, `isMailEngineeringAttachment` |
| `src/mail-vaste-indeling-inhoud.ts` | `src/mail-fixed-layout-content.ts` | експорт: `loadMailFixedLayoutContent`, `exportMailFixedLayoutPdf` |
| `src/mail-vaste-indeling-mogelijkheden.ts` | `src/mail-fixed-layout-capabilities.ts` | експорт: `mailFixedLayoutCapability`, `isMailFixedLayoutAttachment` |
| `src/mail-vtt-rpg-inhoud.ts` | `src/mail-vtt-rpg-content.ts` | експорт: `detectMailVttRpgContentType`, `loadMailVttRpgContent`, `validateMailVttRpgSource`, `exportMailVttRpg` |
| `src/mail-vtt-rpg-mogelijkheden.ts` | `src/mail-vtt-rpg-capabilities.ts` | експорт: `mailVttRpgCapability`, `isMailVttRpgAttachment` |
| `src/mail-wetenschappelijk-inhoud.ts` | `src/mail-scientific-content.ts` | експорт: `detectMailScientificContentType`, `loadMailScientificContent`, `validateMailScientificSource`, `exportMailScientific` |
| `src/mail-wetenschappelijk-mogelijkheden.ts` | `src/mail-scientific-capabilities.ts` | експорт: `mailScientificCapability`, `isMailScientificAttachment` |
| `src/mail-wetenschappelijk-uitgebreid.ts` | `src/mail-scientific-extended.ts` | експорт: `detectExtendedScientificSource`, `validateExtendedScientificSource`, `extendedScientificSourceKind`, `extendedScientificSourceRows` +3 |

## Пошта — інше (список, пошук, налаштування, написання) (114)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/ai-mail-assistent.ts` | `backend/ai-mail-assistant.ts` | експорт: `TRANSFORM_ACTIONS`, `TEMPLATES`, `LANGUAGES`, `setAssistantDeps` +8 — ШІ-помічник у пошті: відповідь за контекстом потоку, стислий зміст довгого ланцюжка, перевірка тону перед відправкою та інструмент для тексту |
| `backend/mail-handschrift.ts` | `backend/mail-handwriting.ts` | експорт: `createMailHandwritingRoutes` |
| `backend/mail-opdrachten.ts` | `backend/mail-commands.ts` | експорт: `normalizeMailRecipients`, `normalizeMailSendInput`, `mailSendPayloadHash`, `buildGmailRawMessage` +1 |
| `backend/mail-opstel-html.ts` | `backend/mail-compose-html.ts` | експорт: `safeStyle`, `normalizeOutboundMailHtml`, `mailHtmlToPlainText` — Uitgaande HTML van E-mail (versturen, concepten in Gmail, AI): veilig maken MET behoud van de opmaak. |
| `backend/mail-opstel.ts` | `backend/mail-compose.ts` | експорт: `ProviderError`, `gmailTransport`, `setMailTransport`, `saveDraft` +10 — Opstellen van mail op de server: concepten (eerst lokaal in PostgreSQL, daarna naar Gmail gesynchroniseerd), direct verzenden en uitgestelde |
| `backend/mail-periode-grenzen-cache.ts` | `backend/mail-period-bounds-cache.ts` | експорт: `MAIL_PERIOD_BOUNDS_RESOURCE`, `MAIL_PERIOD_BOUNDS_TABLE_PREFIX`, `periodBoundsTable`, `invalidateMailPeriodBounds` |
| `backend/mail-pmid-opstart.ts` | `backend/mail-pmid-bootstrap.ts` | експорт: `runMailPmidBootstrapPage` |
| `backend/mail-tekst-normalisatie.ts` | `backend/mail-text-normalization.ts` | експорт: `normalizeMailDisplayText`, `normalizeMailRawHtml`, `decodeMailPartText` |
| `backend/mail-weergave-voorkeuren.ts` | `backend/mail-view-preferences.ts` | експорт: `createMailViewPreferenceRoutes` |
| `backend/mail-zoek-duurzaam.ts` | `backend/mail-search-durable.ts` | експорт: `pmidShard`, `mailSearchDurableRetryAt`, `prepareMailSearchDurableIndex`, `readMailSearchDurableContext` +8 |
| `backend/mail-zoek-relevantie.ts` | `backend/mail-search-relevance.ts` | експорт: `evaluateMailSearch`, `suggestMailSearch` |
| `backend/mail-zoek.ts` | `backend/mail-search.ts` | експорт: `createMailAdvancedSearchRoutes` |
| `scripts/mail-slimme-inbox-audit.mjs` | `scripts/mail-smart-inbox-audit.mjs` |  |
| `shared/mail-slimme-inbox.ts` | `shared/mail-smart-inbox.ts` | експорт: `classifyMailMessage` |
| `shared/mail-zoekopdracht.ts` | `shared/mail-search-query.ts` | експорт: `normalizeMailSearchQueryText`, `mailSearchQueryUnits`, `mailSearchFieldUnits`, `parseMailSearchQuery` +1 |
| `src/MailAbonnementenWeergave.tsx` | `src/MailSubscriptionsView.tsx` | експорт: `MailSubscriptionsView (default)` |
| `src/MailAccountWisselaar.tsx` | `src/MailAccountSwitcher.tsx` | експорт: `MailAccountSwitcher (default)` |
| `src/MailAiWerkbalk.tsx` | `src/MailAiToolbar.tsx` | експорт: `MailAiToolbar (default)` |
| `src/MailBerichtRij.tsx` | `src/MailMessageRow.tsx` | експорт: `MailMessageRow (default)` |
| `src/MailBronWerkruimte.tsx` | `src/MailSourceWorkspace.tsx` | експорт: `MailSourceWorkspace (default)` |
| `src/MailDatumKalender.tsx` | `src/MailDateCalendar.tsx` | експорт: `MailDateCalendar (default)` |
| `src/MailDriveKnop.tsx` | `src/MailDiskKnop.tsx` | експорт: `MailDiskKnop (default)` — 3.1: Google Диск прямо в листі. Кнопка в нижньому рядку: якщо Диск підключено — список файлів із пошуком, клік вставляє в лист |
| `src/MailExternOpslaanDialoog.tsx` | `src/MailExternalSaveDialog.tsx` | експорт: `MailExternalSaveDialog (default)` |
| `src/MailFunctioneelWeergave.tsx` | `src/MailFunctionalView.tsx` | експорт: `MailFunctionalView (default)` |
| `src/MailGeavanceerdZoeken.tsx` | `src/MailAdvancedSearch.tsx` | експорт: `MailAdvancedSearch (default)` |
| `src/MailGeoKaart.tsx` | `src/MailGeospatialMap.tsx` | експорт: `MailGeospatialMap (default)` |
| `src/MailHandschriftInvoer.tsx` | `src/MailHandwritingInput.tsx` | експорт: `MailHandwritingInput (default)` |
| `src/MailInstellingenGeraamte.tsx` | `src/MailSettingsScaffold.tsx` | експорт: `MailSettingsScaffold (default)` |
| `src/MailInvoerHulpmiddelen.tsx` | `src/MailInputTools.tsx` | експорт: `MailInputTools (default)` |
| `src/MailKleurstalen.tsx` | `src/MailColorSwatches.tsx` | експорт: `MailColorSwatches (default)` |
| `src/MailMinimumBerichtRij.tsx` | `src/MailMinimumMessageRow.tsx` | експорт: `MailMinimumMessageRow (default)` |
| `src/MailNieuwBerichtDialoog.tsx` | `src/MailNewMessageDialog.tsx` | експорт: `NIEUW_BERICHT_VENSTER`, `MailNewMessageDialog (default)` |
| `src/MailOpstelZwevend.tsx` | `src/MailComposeFloat.tsx` | експорт: `MailComposeFloat (default)` |
| `src/MailPdfProfielBand.tsx` | `src/MailPdfProfileBanner.tsx` | експорт: `MailPdfProfileBanner (default)` |
| `src/MailPeriodeKiezer.tsx` | `src/MailPeriodPicker.tsx` | експорт: `MailPeriodPicker (default)` |
| `src/MailPlanningMenu.tsx` | `src/MailScheduleMenu.tsx` | експорт: `MailScheduleMenu (default)` |
| `src/MailRijSnelleActieInstellingen.tsx` | `src/MailRowQuickActionSettings.tsx` | експорт: `MailRowQuickActionSettings (default)` |
| `src/MailRijSnelleActies.tsx` | `src/MailRowQuickActions.tsx` | експорт: `MailRowQuickActions (default)` |
| `src/MailSectieKeuze.tsx` | `src/MailSectionSelect.tsx` | експорт: `MailSectionSelect (default)` |
| `src/MailSectieMenu.tsx` | `src/MailSectionMenu.tsx` | експорт: `MailSectionMenu (default)`, `MailSectionHeaderNav`, `MailSectionPager`, `MailCategoryPager` +1 |
| `src/MailSelectieWerkbalk.tsx` | `src/MailSelectionToolbar.tsx` | експорт: `MailSelectionToolbar (default)` |
| `src/MailSnelleInstellingen.tsx` | `src/MailQuickSettings.tsx` | експорт: `mailInboxPriorityIds`, `mailReaderToolbarActionIds`, `defaultMailReaderToolbarPreference`, `mailRowQuickActionIds` +10 |
| `src/MailSpecialistVerkenner.tsx` | `src/MailSpecialistExplorer.tsx` | експорт: `MailSpecialistExplorer (default)` |
| `src/MailSysteemAandachtGroepen.tsx` | `src/MailSystemAttentionBuckets.tsx` | експорт: `MailSystemAttentionBuckets (default)` |
| `src/MailZijbalkNavigatie.tsx` | `src/MailSidebarNavigation.tsx` | експорт: `MailSidebarNavigation (default)` — Audit 18.10.2026 (8b): de zwevende «Написати лист»-knop en het berichtvenster leven alleen nog in MailOpstelZwevend.tsx (één knop, één zone 'mail-comp… |
| `src/MailZoekActiefChips.tsx` | `src/MailSearchActiveChips.tsx` | експорт: `MailSearchActiveChips (default)` |
| `src/MailZoekFilters.tsx` | `src/MailSearchFilters.tsx` | експорт: `MailSearchFilters (default)` |
| `src/MailZoekVeld.tsx` | `src/MailSearchField.tsx` | експорт: `MAIL_ZOEK_SMAL`, `MailSearchField (default)` |
| `src/mail-aanbieder-toestand.ts` | `src/mail-provider-state.ts` | експорт: `loadMailProviderLabelSnapshot`, `subscribeMailProviderLabelSnapshots` |
| `src/mail-abonnementen.css` | `src/mail-subscriptions.css` |  |
| `src/mail-agenda-contact.ts` | `src/mail-calendar-contact.ts` | експорт: `formatIcsDate`, `parseIcsEvents`, `parseVcard` — Snelle voorvertoning van agenda- (.ics) en contactbijlagen (.vcf): alleen lezen, nooit uitvoeren, alles ingekort. |
| `src/mail-ai-werkbalk.css` | `src/mail-ai-toolbar.css` |  |
| `src/mail-beveiliging.css` | `src/mail-security.css` |  |
| `src/mail-bioinformatica.css` | `src/mail-bioinformatics.css` |  |
| `src/mail-bron-werkruimte.css` | `src/mail-source-workspace.css` |  |
| `src/mail-compact-lees-opties.css` | `src/mail-compact-reading-options.css` |  |
| `src/mail-datum-periodes.css` | `src/mail-date-periods.css` |  |
| `src/mail-datum-periodes.ts` | `src/mail-date-periods.ts` | експорт: `mailLocalIso`, `mailQuickPeriods`, `mailQuarterRange`, `mailSeasonRange` +1 |
| `src/mail-document-bron.ts` | `src/mail-document-source.ts` | експорт: `renderMailDocumentSourcePreview`, `validateMailDocumentSource`, `readMailDocumentSource`, `exportMailDocumentSource` +1 |
| `src/mail-doorstuur-pdf.ts` | `src/mail-forward-pdf.ts` | експорт: `buildForwardPdf` |
| `src/mail-dreiging.css` | `src/mail-threat.css` |  |
| `src/mail-drukvoorbereiding.css` | `src/mail-prepress.css` |  |
| `src/mail-formaat-catalogus.ts` | `src/mail-format-catalog.ts` | експорт: `MAIL_FORMAT_CATEGORIES`, `mailFormatCategory`, `mailFormatQaId` |
| `src/mail-formaat-qa.ts` | `src/mail-format-qa.ts` | експорт: `runMailFormatQa` |
| `src/mail-functioneel.css` | `src/mail-functional.css` |  |
| `src/mail-geavanceerd-zoeken.css` | `src/mail-advanced-search.css` |  |
| `src/mail-gelaagde-inbox.css` | `src/mail-layered-inbox.css` |  |
| `src/mail-geo-kaart.css` | `src/mail-geospatial-map.css` |  |
| `src/mail-grafisch.css` | `src/mail-graphics.css` |  |
| `src/mail-html-opschonen.ts` | `src/mail-html-sanitize.ts` | експорт: `sanitizeDocumentHtml`, `sanitizeMailHtml` — HTML-sanitizing met DOMPurify voor mailvoorbeelden (fase B). |
| `src/mail-instellingen-geraamte.css` | `src/mail-settings-scaffold.css` |  |
| `src/mail-instellingen-voorbeeld.css` | `src/mail-settings-preview.css` |  |
| `src/mail-invoer-hulpmiddelen.css` | `src/mail-input-tools.css` |  |
| `src/mail-kleur-palet.ts` | `src/mail-color-palette.ts` | експорт: `mailColorPairs`, `isMailPresetColor` |
| `src/mail-kleurstalen.css` | `src/mail-color-swatches.css` |  |
| `src/mail-medisch.css` | `src/mail-medical.css` |  |
| `src/mail-minimum-rij.css` | `src/mail-minimum-row.css` |  |
| `src/mail-mobiel.css` | `src/mail-mobile.css` | Мобільний вигляд списку листів (як у сервісів Google): велике фото ліворуч на всю висоту блоку, ім'я й час у першому рядку (час праворуч, біля краю), |
| `src/mail-navigatie-bewerker.css` | `src/mail-navigation-editor.css` |  |
| `src/mail-netwerk.css` | `src/mail-network.css` |  |
| `src/mail-nieuw-bericht.css` | `src/mail-new-message.css` |  |
| `src/mail-ongelezen-focus.css` | `src/mail-unread-focus.css` |  |
| `src/mail-opstel-api.ts` | `src/mail-compose-api.ts` | експорт: `composeErrorText`, `saveDraftRemote`, `listDraftsRemote`, `getDraftRemote` +10 |
| `src/mail-opstel-bewerker.css` | `src/mail-compose-editor.css` |  |
| `src/mail-opstel-menu-plaats.ts` | `src/mail-compose-menu-plaats.ts` | експорт: `MENU_MARGE`, `MENU_AFSTAND`, `MENU_MIN_HOOGTE`, `menuPlaats` +1 — Waar een uitklapmenu van de editorbalk («Стиль», «Список», «⋯») op het scherm komt — zuiver, met tests |
| `src/mail-opstel-plaats.ts` | `src/mail-compose-plaats.ts` | експорт: `GAT`, `RAND`, `BEL`, `BEL_RAND` +5 — Plaats van de zwevende «Написати лист»-knop (FAB) ten opzichte van de meldingenbel. |
| `src/mail-overlay-oppervlak.css` | `src/mail-overlay-surface.css` |  |
| `src/mail-pdf-profiel.ts` | `src/mail-pdf-profile.ts` | експорт: `readPdfProfileClaims` |
| `src/mail-periode-cache.ts` | `src/mail-period-cache.ts` | експорт: `mailPeriodAccountKey`, `readMailPeriodCache`, `writeMailPeriodCache`, `clearMailPeriodCache` +5 |
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
| `src/mail-tekst-passend.ts` | `src/mail-body-passend.ts` | експорт: `MAIL_BODY_MIN_SCHAAL`, `mailBodySchaal`, `mailDocumentHoogte`, `pasMailDocumentAan` — Passend maken van HTML-mail in het leeskader (mobiele pass 19.10.2026). |
| `src/mail-toestand-intenties.ts` | `src/mail-state-intents.ts` | експорт: `createMailStateIntentId`, `submitMailStateIntent`, `waitMailStateIntent`, `createMailBulkRequestId` +2 |
| `src/mail-ux-beoordeling-20261021.css` | `src/mail-ux-review-20261021.css` | РЕЦЕНЗІЯ UX ПОШТИ (21.10.2026) — свіже око після чотирьох агентів (сповіщення, «Новий лист», рядки, акаунти). |
| `src/mail-vaste-indeling.css` | `src/mail-fixed-layout.css` |  |
| `src/mail-weergave-voorkeuren-cache.ts` | `src/mail-view-preferences-cache.ts` | експорт: `normalizeMailViewPreferences`, `hasMailViewPreferencesMirror`, `readMailViewPreferences`, `writeMailViewPreferences` |
| `src/mail-weergave-voorkeuren-server.ts` | `src/mail-view-preferences-server.ts` | експорт: `loadMailViewPreferencesServer`, `publishMailViewPreferencesServer` |
| `src/mail-zijbalk-navigatie.css` | `src/mail-sidebar-navigation.css` |  |
| `src/mail-zoek-cache.ts` | `src/mail-search-cache.ts` | експорт: `readMailSavedSearches`, `saveMailSavedSearch`, `removeMailSavedSearch`, `readMailRecentSearches` +4 |
| `src/mail-zoek-versoepeling.ts` | `src/mail-search-relaxation.ts` | експорт: `mailSearchRelaxationPlans` |
| `src/mail-zoek.ts` | `src/mail-search.ts` | експорт: `ARCHIVE_QUERY_PARTS`, `ARCHIVE_QUERY`, `mailAttachmentGroupExtensions`, `defaultMailSearchCriteria` +16 |
| `tests/e2e/mail-opstel-venster.e2e.ts` | `tests/e2e/mail-compose-venster.e2e.ts` | експорт: `main` — E2E (Chrome) venster «Новий лист» (10.10): knoppen _ □ × zoals in Windows, compacte velden (Копія/прихована op de regel |
| `tests/eenheid/ai-mail-assistent.test.ts` | `tests/eenheid/ai-mail-assistant.test.ts` | експорт: `main` — ШІ-помічник у пошті: безпека проти prompt injection (недовірені листи), правильні промпти для кожної дії, обробка помилок провайдера. |
| `tests/eenheid/mail-opstel.test.ts` | `tests/eenheid/mail-compose.test.ts` | експорт: `main` — Mail opstellen op de server: MIME, concepten (eerst lokaal, daarna Gmail), direct verzenden, uitgestelde verzending en de wachtrij. |
| `tests/eenheid/mail-ux-beoordeling-20261021.test.ts` | `tests/eenheid/mail-ux-review-20261021.test.ts` | експорт: `main`, `AI_BALK_KLEIN_SCHERM`, `MAIL_ZOEK_SMAL` — Eenheidstest 21.10.2026 (рецензент UX, свіже око після чотирьох агентів) — пошта на телефоні (360/390 px) і в альбомній |
| `tests/eenheid/mail-wachtrij.test.ts` | `tests/eenheid/mail-queue.test.ts` | експорт: `main` — Mailtaken (provider.sync.*): de uitvoerlus mag niet blijven hangen op de eerste (oudste) 100 jobs van een eigenaar, en klaar-jobs worden opgeruimd. |

## Оболонка сайту, меню, сповіщення (52)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/eigenaar-sessie-overdracht.ts` | `backend/owner-session-handoff.ts` | експорт: `createOwnerHandoffRoutes` |
| `shared/ai-beleid/canoniek.ts` | `shared/ai-beleid/canonical.ts` | експорт: `CanonicalError`, `canonicalize`, `toBase64Url`, `fromBase64Url` +6 — * Канонічний JSON і base64url — однаково працюють у Node і в браузері. |
| `src/CanoniekAccountMenu.tsx` | `src/CanonicalAccountMenu.tsx` | експорт: `accountWisselMelding`, `rememberedAccountStatusLabel`, `CanonicalAccountMenu (default)` |
| `src/CanoniekConsolidatieWeergave.tsx` | `src/CanonicalConsolidationView.tsx` | експорт: `CanonicalConsolidationView (default)` |
| `src/CanoniekImplementatieWaarheidMatrix.tsx` | `src/CanonicalImplementationTruthMatrix.tsx` | експорт: `CanonicalImplementationTruthMatrix (default)` |
| `src/CanoniekMeldingencentrum.tsx` | `src/CanonicalNotificationCenter.tsx` | експорт: `CanonicalNotificationCenter (default)` |
| `src/CanoniekOmlijsting.tsx` | `src/CanonicalChrome.tsx` | експорт: `SignedOutCenter`, `CanonicalChrome (default)` |
| `src/CanoniekVerbindingBand.tsx` | `src/CanonicalConnectionBanner.tsx` | експорт: `CanonicalConnectionBanner (default)` — Plakkaat «verbinding» — punt 3 van de audit 19.10.2026. |
| `src/DienstWeergaven.tsx` | `src/ServiceViews.tsx` | експорт: `GitHubServiceView`, `ApiServiceView` |
| `src/MeldingenpaneelInhoud.tsx` | `src/NotificationPanelBody.tsx` | експорт: `NotificationPanelBody (default)` |
| `src/MenuAanpasser.tsx` | `src/MenuCustomizer.tsx` | експорт: `MenuCustomizer (default)` |
| `src/ProductLegeToestand.tsx` | `src/ProductEmptyState.tsx` | експорт: `ProductEmptyState (default)` |
| `src/StabielAvatar.tsx` | `src/StableAvatar.tsx` | експорт: `StableAvatar (default)`, `PresentationAvatar` |
| `src/TaalVlag.tsx` | `src/LanguageFlag.tsx` | експорт: `LanguageFlag (default)` |
| `src/VerenigdDienstApp.tsx` | `src/UnifiedServiceApp.tsx` | експорт: `UnifiedServiceApp (default)` |
| `src/ViewportKnopinfoLaag.tsx` | `src/ViewportTooltipLayer.tsx` | експорт: `ViewportTooltipLayer (default)` |
| `src/canoniek-account-menu-model.ts` | `src/canonical-account-menu-model.ts` | експорт: `MAX_PREVIEW_ACCOUNTS`, `accountIdentityKey`, `isSameAccount`, `rememberedAccountStatus` +4 |
| `src/canoniek-account-menu.css` | `src/canonical-account-menu.css` |  |
| `src/canoniek-bestuur.css` | `src/canonical-governance.css` |  |
| `src/canoniek-dienst.ts` | `src/canonical-service.ts` | експорт: `serviceIds`, `publicServiceIds`, `domains`, `defaults` +7 |
| `src/canoniek-gebeurtenissen.ts` | `src/canonical-events.ts` | експорт: `CANONICAL_AUTH_CHANGE`, `broadcastCanonicalAuthChange`, `listenCanonicalAuthChanges` |
| `src/canoniek-implementatie-waarheid.css` | `src/canonical-implementation-truth.css` |  |
| `src/canoniek-meldingen.ts` | `src/canonical-notifications.ts` | експорт: `registerCanonicalNoticeAction`, `resolveCanonicalNoticeAction`, `releaseCanonicalNoticeAction`, `CANONICAL_NOTICE_EVENT` +3 |
| `src/canoniek-meldingencentrum.css` | `src/canonical-notification-center.css` |  |
| `src/canoniek-navigatie.ts` | `src/canonical-navigation.ts` | експорт: `sharedRouteSnapshot`, `serviceFromLocation`, `sessieDienst`, `routeLang` +11 |
| `src/canoniek-omlijsting.css` | `src/canonical-chrome.css` |  |
| `src/canoniek-teksten.ts` | `src/canonical-copy.ts` | експорт: `createCanonicalT`, `canonicalBuild`, `canonicalLineage` |
| `src/dienst-tab-labels.ts` | `src/service-tab-labels.ts` | експорт: `serviceTabLabel` — Namen van de pagina's (tabs) van elke dienst, zodat het zijmenu de pagina's van een ANDERE dienst kan tonen |
| `src/domein-weergave-cache.ts` | `src/domain-view-cache.ts` | експорт: `stableSignature`, `applyIfChanged`, `makeViewCacheKey`, `readCachedViewModel` +8 |
| `src/gedeelde-voorkeuren.ts` | `src/shared-preferences.ts` | експорт: `HUB_LAYOUTS_STORAGE_KEY`, `WEERGAVE_ACCOUNT_HINT`, `MAX_COOKIE`, `sleutelVoor` +28 — Gedeelde weergavevoorkeuren van alle subdomeinen — PER ACCOUNT en PER WEBRUIMTE (profiel). Punt 2 en punt 4, audit 20.10.2026. |
| `src/melding-positie.ts` | `src/notification-position.ts` | експорт: `placeNear` — Slimme plaatsing van het meldingenvenster en de pop-up bij de bel: altijd volledig binnen het scherm, aan de kant met de meeste ruimte (boven of onder… |
| `src/melding-stijl.tsx` | `src/notification-style.tsx` | експорт: `styleOf`, `sectionLabel`, `allSections` |
| `src/meldingenpaneel.css` | `src/notification-panel.css` | Meldingencentrum: brede, rustige lijst met zoeken, filters, groepering per dag, stand en duur. Op een telefoon een volle onderlade. |
| `src/menu-meldingen-opslag.ts` | `src/menu-meldingen-store.ts` | експорт: `menuTellers`, `useMenuTellers`, `tellersScope`, `tellersOphalen` +3 — Tellers voor het «levende» menu (fase B2). E-mail publiceert het aantal ongelezen in Вхідні (alleen het getal); dat gaat — gebundeld |
| `src/menu-voorkeuren.tsx` | `src/menu-preferences.tsx` | експорт: `MENU_CATALOG`, `MENU_ICON_OPTIONS`, `defaultMenuPreferences`, `normalizeMenuPreferences` +13 |
| `src/mobiel-ux.css` | `src/mobile-ux.css` | Загальні мобільні покращення оболонки. |
| `src/opstart-schil.ts` | `src/boot-shell.ts` | експорт: `releaseBootShell` |
| `src/product-lege-toestand.css` | `src/product-empty-state.css` |  |
| `src/sessie-overdracht.ts` | `src/session-handoff.ts` | експорт: `consumeSessionHandoff`, `consumeQueryHandoff`, `assignCanonicalService` |
| `src/stabiel-toestand.ts` | `src/stable-state.ts` | експорт: `retainEqual` |
| `src/taal-controller.ts` | `src/language-controller.ts` | експорт: `hasExplicitTabLanguage`, `resolveInitialLanguage`, `resolveAccountLanguage`, `persistBrowserLanguage` +1 |
| `src/taal-vlag.css` | `src/language-flag.css` |  |
| `src/tech/band-inschuiven.ts` | `src/tech/band-headroom.ts` | експорт: `DREMPEL_PX`, `MIN_TUSSEN_MS`, `OVERGANG_MS`, `RAND_PX` +7 — Technische band: verbergen bij naar beneden scrollen, tonen bij naar boven scrollen («headroom»), 18.10.2026. |
| `src/use-extern-rechthoek.ts` | `src/use-external-rect.ts` | експорт: `useExternalRectGetter` |
| `src/useCanoniekHubAuth.ts` | `src/useCanonicalHubAuth.ts` | експорт: `hubTabContext`, `hubAuthBody`, `useCanonicalHubAuth (default)` |
| `src/useStabielWeergaveModel.ts` | `src/useStableViewModel.ts` | експорт: `useStableViewModel` |
| `src/verenigd-dienst-inhoud.css` | `src/unified-service-content.css` |  |
| `src/viewport-knopinfo.css` | `src/viewport-tooltip.css` |  |
| `src/zichtbaar-voorladen.ts` | `src/visible-prefetch.ts` | експорт: `prefetchMode`, `prefetchBudgetAllows`, `prefetchData`, `cancelPrefetchData` +5 |
| `src/zwevend-ontwijking.ts` | `src/floating-avoidance.ts` | експорт: `rectsOverlap`, `registerZone`, `subscribeAvoidance`, `queueRecompute` +2 |
| `tests/eenheid/band-inschuiven.test.ts` | `tests/eenheid/band-headroom.test.ts` | експорт: `main` — Technische band «headroom» (18.10.2026). Live gaf de eerste versie 305 wissels in 15 s: verbergen veranderde de geometrie (top van |
| `tests/eenheid/melding-positie.test.ts` | `tests/eenheid/notification-position.test.ts` | експорт: `main` — Plaatsing van het meldingenvenster: altijd binnen het scherm, aan de kant met de meeste ruimte. |

## Доступ, безпека, ідентичність (28)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/api-platform-kluis.ts` | `backend/api-platform-vault.ts` | експорт: `OWNER_VAULT_TABLE`, `OWNER_VAULT_PURPOSES`, `vaultEncryptionReady`, `apiPlatformVaultItems` +6 |
| `backend/toegangslaag.ts` | `backend/access-plane.ts` | експорт: `METHOD_IDS`, `herstelOverzicht`, `herstelSetSleutel`, `HERSTEL_MS` +5 |
| `backend/toegangssleutels.ts` | `backend/passkeys.ts` | експорт: `PASSKEY_LIMIETEN`, `passkeyRp`, `stapOpOrigins`, `AAGUID_NAMEN` +24 — Passkeys per gebruiker — Instellingen → «Способи входу» / «Aanmeldmethoden» (id.tarasevych.com/methods). |
| `scripts/beveiliging-bouw.mjs` | `scripts/security-build.mjs` | експорт: `externalizeInline`, `securityBuildPlugin` — Security-build: haalt de inline <script>/<style>-blokken uit index.html en zet ze in |
| `shared/kluis-meta.ts` | `shared/vault-meta.ts` | експорт: `VAULT_SOORTEN`, `VAULT_TZ`, `BIJNA_DAGEN`, `leegMeta` +8 — Metadata van een sleutel in de kluis (api.* → Сховище секретів, admin.* → Ключі): wanneer hij begint en eindigt, aan wie hij |
| `src/BeheerSleutelsWeergave.tsx` | `src/AdminKeysView.tsx` | експорт: `AdminKeysView (default)` |
| `src/BeveiligingSessiesPaneel.tsx` | `src/SecuritySessionsPanel.tsx` | експорт: `SecuritySessionsPanel (default)` — «Керування входами й пристроями»: входи згруповано за ФІЗИЧНИМ пристроєм (User-Agent + мережа; IPv4 та IPv6 одного пристрою |
| `src/EigenaarIdentiteitAutoriseer.tsx` | `src/OwnerIdentityAuthorize.tsx` | експорт: `OwnerIdentityAuthorize (default)` |
| `src/EigenaarIdentiteitTerug.tsx` | `src/OwnerIdentityCallback.tsx` | експорт: `OwnerIdentityCallback (default)` |
| `src/IdentiteitBeheerWeergave.tsx` | `src/IdentityAdminView.tsx` | експорт: `IdentityAdminView (default)` |
| `src/KluisMeta.tsx` | `src/VaultMeta.tsx` | експорт: `VaultMetaRegel`, `VaultMetaVelden`, `VaultMetaBewerker` — Termijn, eigenaar en verantwoordelijke van een sleutel in de kluis (shared/kluis-meta.ts). Gebruikt in admin.*/contour en |
| `src/McpToestemmingVenster.tsx` | `src/McpConsentModal.tsx` | експорт: `consentPlek`, `ConsentTechPoort`, `ConsentRuimteRegel`, `McpConsentModal (default)` |
| `src/ToegangslaagWeergave.tsx` | `src/AccessPlaneView.tsx` | експорт: `AccessPlaneView (default)` |
| `src/ToegangssleutelsSectie.tsx` | `src/PasskeysSection.tsx` | експорт: `soortTekst`, `QR_HINT`, `PasskeysSection` — Instellingen → «Способи входу» → Passkeys (RUNBOOK-VEILIGE-UITROL.md §13). Voor elke gebruiker: passkeys toevoegen, |
| `src/aanmeld-omleiding.ts` | `src/redirect-login.ts` | експорт: `cleanRedirectReturnTo`, `redirectStartReason`, `startPrimaryRedirectLogin` |
| `src/auth-stroom-beleid.ts` | `src/auth-flow-policy.ts` | експорт: `AUTH_RESTART_GRACE_MS`, `AUTH_CANCEL_RESTART`, `AUTH_CANCEL_USER` |
| `src/kluis-meta.css` | `src/vault-meta.css` | Termijn/eigenaar van sleutels in de kluis (KluisMeta.tsx). Eigen kleuren: tekst ≥ 4.5:1 in licht en donker. |
| `src/mcp-toestemming-opslag.ts` | `src/mcp-consent-store.ts` | експорт: `captureConsentFromUrl`, `getPendingConsent`, `clearPendingConsent` — Onthoudt een openstaand toestemmingsverzoek van Claude (?consent=<id>), ook als de gebruiker nog niet is ingelogd. |
| `src/mcp-toestemming-venster.css` | `src/mcp-consent-modal.css` | Екран згоди (mcp.tarasevych.com/claude, McpToestemmingVenster.tsx). 20.10.2026: лише токени фундаменту (src/ontwerp/tokens.css). |
| `src/toegang-afgemeld.css` | `src/access-signed-out.css` |  |
| `src/toegangslaag-panelen.tsx` | `src/access-plane-panels.tsx` | експорт: `naarSectie`, `AccessPlanePanels` — Instellingen → «Способи входу» / «Aanmeldmethoden»: één pagina zoals bij GitHub (RUNBOOK-VEILIGE-UITROL.md §13). |
| `src/toegangslaag-teksten.ts` | `src/access-plane-copy.ts` | експорт: `t` |
| `src/toegangslaag.css` | `src/access-plane.css` |  |
| `tests/e2e/kluis-meta.e2e.ts` | `tests/e2e/vault-meta.e2e.ts` | експорт: `main` — E2E kluis: sleutel met termijn, eigenaar en verantwoordelijke (api.*/vault en admin.*/contour) met een echte Chrome. |
| `tests/eenheid/hulp/nep-toegangssleutel.ts` | `tests/eenheid/hulp/nep-passkey.ts` | експорт: `cbor`, `nieuwePasskey`, `NEP_RP`, `registreer` +1 — Software-"passkey" voor tests: maakt echte WebAuthn-registraties en -asserties (ES256 of Ed25519) zoals een telefoon, |
| `tests/eenheid/kluis-meta.test.ts` | `tests/eenheid/vault-meta.test.ts` | експорт: `main` — Kluis: metadata per sleutel (termijn, van wie, verantwoordelijke) en meldingen «скоро закінчиться» / «строк вийшов» — |
| `tests/eenheid/toegangssleutels.test.ts` | `tests/eenheid/passkeys.test.ts` | експорт: `main` — Passkeys per gebruiker — Instellingen → «Способи входу» (backend/toegangssleutels.ts, migratie 0023, RUNBOOK §13). |
| `tests/eenheid/toestemming-ruimte-cyclus-20261020.test.ts` | `tests/eenheid/consent-ruimte-cyclus-20261020.test.ts` | експорт: `main` — Цикл у вікні згоди «Доступ для Claude» (скарга власника 20.10.2026: «почали підключати конектор і не завершили — застрягло»). |

## Технічний простір і адміністрування (55)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/beheer-diagnostiek-gebruiker.ts` | `backend/admin-diagnostiek-gebruiker.ts` | експорт: `beoordeelGebruiker`, `zoekGebruikers`, `gebruikerControle` — Admin → «Діагностика» → «Скарга користувача»: de beheerder kiest een gebruiker en ziet wat die gebruiker op de site ervaart, ZONDER inhoud. |
| `backend/beheer-diagnostiek.ts` | `backend/admin-diagnostiek.ts` | експорт: `DOMEIN`, `hostVan`, `httpStand`, `tlsStand` +20 — Admin → «Діагностика» (/diagnostiek): alleen-lezen controles van diensten, pagina's, koppelingen, data, server, netwerk en taken. |
| `backend/beheer-integraties.ts` | `backend/admin-integraties.ts` | експорт: `levendVoor`, `zetBeleid`, `standUitLevend`, `adminIntegratieRoutes` — Admin → /mappen «Інтеграції»: levende toestand, beschikbaarheid voor gebruikers, statuscontrole en loskoppelen. |
| `backend/beheer-overzicht-kern.ts` | `backend/admin-overzicht-kern.ts` | експорт: `FAIL_RE`, `RUIS_BRON`, `isGebeurtenis`, `sectieVan` +12 — Kern van het live-overzicht van het beheerpaneel: PUUR (geen database, geen netwerk), zodat het volledig te testen is. |
| `backend/beheer-overzicht-momentopnamen.ts` | `backend/admin-overzicht-momentopnamen.ts` | експорт: `BEWAAR_DAGEN`, `getalSchoon`, `maakMomentopname`, `leesMomentopname` +4 — Momentopnamen van het beheeroverzicht: elk uur en elke dag een klein document met alleen TELLERS (tabel app.admin_overzicht_momentopnamen, |
| `backend/beheer-overzicht.ts` | `backend/admin-overzicht.ts` | експорт: `CACHE_MS`, `laadInvoer`, `invoerGecached`, `cacheLegen` +7 — Routes van het live-overzicht (admin.* → Огляд): aggregaties, gebruikerskaart en de indeling per beheerder. |
| `backend/extern-routes.ts` | `backend/remote-routes.ts` | експорт: `remoteRoutes` — Routes van het externe bureaublad (backend/remote-bureaublad.ts). Alleen de eigenaar. Verbindingen wijzigen, toegestane hosts |
| `backend/site-aanroep.ts` | `backend/site-dispatch.ts` | експорт: `gedelegeerdeSessie`, `TOEGESTANE_ROUTES`, `echteAanroepZonderHekVoorTest`, `zetSiteAanroeper` +2 — Interne aanroep van routes van de site zelf namens een gebruiker (voor de MCP-hulpmiddelen van mail, agenda, schijf, zoeken, ...). |
| `backend/site-activiteit.ts` | `backend/site-activity.ts` | експорт: `SITE_RUIS`, `sourceOfAudit`, `siteEventsFromAudit` — Alles wat de gebruiker op de site doet, als meldingen: het auditlogboek (app.audit) omgezet naar gebeurtenissen met een sectie en dienst. |
| `backend/site-hulpmiddelen.ts` | `backend/site-tools.ts` | експорт: `compact`, `SITE_TOOLS`, `ADMIN_VIEW_ROUTES`, `SITE_TOOL_BY_NAME` +1 — MCP-hulpmiddelen voor wat de site zelf kan: zoeken, mail, agenda en schijf (Google Suite). Elk hulpmiddel is een dunne laag op een bestaande |
| `backend/tech-bundels.ts` | `backend/tech-assets.ts` | експорт: `sleutelUitCookie`, `wisCookie`, `_assetCacheLeeg`, `assetToegestaan` +2 — Toegang tot de technische bundels (/assets/tech/*, zie shared/tech-bundels.ts) — alleen met een actieve technische activering. |
| `backend/uitgave-info.ts` | `backend/release-info.ts` | експорт: `releaseInfo`, `_resetReleaseInfo` — Прозорість випуску: /api/version віддає, який саме випуск зараз працює (версія, коміт, автор, агент, підсумок). |
| `backend/vlaggen.ts` | `backend/flags.ts` | експорт: `berekenen`, `beheerLijst`, `zetten`, `verwijderen` +2 — Feature flags (etap F): opslag, berekening per gebruiker, beheer en tests. Zie shared/vlaggen.ts voor het waarom. |
| `scripts/tech-bundels-controle.mjs` | `scripts/tech-assets-controle.mjs` | експорт: `statischeTechImports`, `controleer` |
| `shared/beheer-diagnostiek.ts` | `shared/admin-diagnostiek.ts` | експорт: `CATEGORIEEN`, `DIENST_HOSTS`, `PAGINA_SLUGS`, `CONTROLES` +15 — Admin → «Діагностика» (/diagnostiek): register van alleen-lezen controles per categorie, gedeeld door server en browser. |
| `shared/extern-bureaublad.ts` | `shared/remote-bureaublad.ts` | експорт: `REMOTE_PROTOCOLLEN`, `STANDAARD_POORT`, `REMOTE_TICKET_MS`, `REMOTE_INACTIEF_MS` +19 — Віддалений стіл (RDP/VNC/SSH через Apache Guacamole) — zuivere regels, gedeeld door server en browser. |
| `shared/tech-bundels.ts` | `shared/tech-assets.ts` | експорт: `TECH_MAPPEN`, `TECH_BESTANDEN`, `TECH_MARKERING`, `bronPad` +4 — Welke frontendcode is «technisch» (alleen voor een sessie met actief technisch profiel)? |
| `shared/uitrol-diagnose-controles.ts` | `shared/uitrol-diagnose-checks.ts` | експорт: `CHECK_GROEPEN`, `CHECKS`, `CHECK_IDS`, `checkInfo` — Catalogus van de ALLEEN-LEZENDE controles in Admin → «Оновлення» → «Діагностика» → «Перевірки». |
| `shared/vlaggen.ts` | `shared/flags.ts` | експорт: `SLEUTEL_RE`, `MAX_GEBRUIKERS`, `emmer`, `evalueer` +2 — Feature flags (architectuur 13.10.2026, etap F). Eigen tabel op de eigen server, antwoord in de vorm van OpenFeature (OFREP). |
| `src/ApparatenWeergave.tsx` | `src/DevicesView.tsx` | експорт: `PendingList`, `DeviceDetail` |
| `src/BeheerAiBeleidWeergave.tsx` | `src/AdminAiBeleidView.tsx` | експорт: `deelFoutTekst`, `verwachteUitdaging`, `AdminAiBeleidView (default)` — Beheer → «Доступ ШІ» / «AI-toegang» (§13.12): wat elke AI mag, met timers die de SERVER afdwingt, gewijzigd alleen met de |
| `src/BeheerConsoleWeergave.tsx` | `src/AdminConsoleView.tsx` | експорт: `AdminConsoleView (default)` |
| `src/BeheerDiagnostiekWeergave.tsx` | `src/AdminDiagnosticsView.tsx` | експорт: `AdminDiagnosticsView (default)` |
| `src/BeheerOverzichtWeergave.tsx` | `src/AdminOverviewView.tsx` | експорт: `AdminOverviewView (default)` — «Огляд» van het beheerpaneel (vervangt het statische blok in AdminConsoleView): een live, instelbaar dashboard. |
| `src/BeheerUitrolWeergave.tsx` | `src/AdminUitrolView.tsx` | експорт: `AdminUitrolView (default)` — Admin → «Оновлення» / «Updates»: één dashboard voor het hele uitrolproces (RUNBOOK-VEILIGE-UITROL.md §13). |
| `src/ai-site-acties.ts` | `src/ai-site-actions.ts` | експорт: `registerSiteActions` — Acties en diagnose die Mijn Ruimte zelf aanbiedt aan AI-assistenten. |
| `src/beheer-ai-beleid.css` | `src/admin-ai-beleid.css` | Beheer → «Доступ ШІ» (§13.12) en alleen-lezen op mcp/agents#beleid. Zelfstandig: werkt ook buiten beheer-console.css. |
| `src/beheer-console.css` | `src/admin-console.css` |  |
| `src/beheer-termen.tsx` | `src/admin-terms.tsx` | експорт: `termLabel`, `termKnown`, `Term`, `TermList` +1 |
| `src/beheer-uitrol.css` | `src/admin-uitrol.css` | Admin → «Оновлення» / «Updates» (passkey-goedkeuring) |
| `src/extensie-map-installeer.ts` | `src/extension-folder-install.ts` | експорт: `PickerFailure`, `folderPickerSupported`, `SUBFOLDER`, `installExtensionToPickedFolder` — Встановлення розширення прямо з браузера в папку, яку користувач обирає сам у рідному вікні (File System Access API, Chromium). |
| `src/extern/ExternBureaublad.tsx` | `src/remote/RemoteBureaublad.tsx` | експорт: `RemoteBureaublad (default)`, `RemoteSessie` — «Віддалений стіл» (technisch profiel, alleen eigenaar): RDP/VNC/SSH via Apache Guacamole. Eigen chunk (lazyTech in TechLaag); |
| `src/extern/extern-opslag.ts` | `src/remote/remote-store.ts` | експорт: `remoteSessieBegin`, `remoteAantal`, `useRemoteAantal` — Hoeveel externe-bureaubladsessies dit tabblad open heeft — voor de aanduiding «активний віддалений сеанс» op de technische band. |
| `src/extern/extern.css` | `src/remote/remote.css` | «Віддалений стіл» (src/extern/ExternBureaublad.tsx). Lichte en donkere thema's (html.theme-dark / theme-plum-dark), 390 px. |
| `src/extern/guacamole.d.ts` | `src/remote/guacamole.d.ts` | експорт: `Guacamole (default)` — Minimale typen voor guacamole-common-js 1.5.0 (het pakket heeft er zelf geen). Alleen wat src/extern gebruikt. |
| `src/installeer-opdrachten.ts` | `src/install-commands.ts` | експорт: `guessArch`, `nodeInstallMethods`, `extensionInstallCommands` — Опції встановлення за зразком nodejs.org/download: система, архітектура, спосіб; відповідно змінюються команди й підказки. |
| `src/meldingen/tech-meldingen-opslag.ts` | `src/meldingen/tech-meldingen-store.ts` | експорт: `zetTechMeldingen`, `zetTechActiviteit`, `ongelezenTechActiviteit`, `techMeldingenStaat` +5 — Technische meldingen voor het paneel in de technische band (18.10.2026, verzoek eigenaar: meldingen voor de gebruiker los van de |
| `src/tech/tech-opslag.ts` | `src/tech/tech-store.ts` | експорт: `PROFIEL_META`, `profielVan`, `profielMetaBijwerken`, `techToestand` +19 — Toestand van het technisch profiel in DIT tabblad (één bron voor de band, het accountmenu en de «?»-uitleg). |
| `src/vlaggen/Vlaggen.tsx` | `src/flags/Vlaggen.tsx` | експорт: `VlaggenVenster (default)` — Venster «Прапорці» in de band van het technisch profiel (etap F). |
| `src/vlaggen/vlaggen-api.ts` | `src/flags/flags.ts` | експорт: `laadVlaggen`, `vlaggenVernieuwen`, `useVlag` — Feature flags in de browser (etap F). Eén verzoek per pagina (POST /api/flags), daarna uit het geheugen. |
| `src/vlaggen/vlaggen.css` | `src/flags/flags.css` | Venster «Прапорці» (Vlaggen.tsx): bouwt op .tech-venster / .tech-lijst; alleen de testknoppen en het tekstvak zijn eigen. |
| `tests/e2e/tech-bundels.e2e.ts` | `tests/e2e/tech-assets.e2e.ts` | експорт: `main` — E2E (echte Chrome, lokale build): technische bundels alleen voor een sessie met actief technisch profiel. |
| `tests/e2e/vlaggen.e2e.ts` | `tests/e2e/flags.e2e.ts` | експорт: `main` — E2E feature flags (etap F, 14.10.2026) in een echte Chrome: eigenaar → technisch profiel → «Прапорці» → nieuwe vlag (uit voor iedereen |
| `tests/eenheid/beheer-diagnostiek-rook-20261022.test.ts` | `tests/eenheid/admin-diagnostiek-rook-20261022.test.ts` | експорт: `main` — «Діагностика» + RENDERCONTROLE + ZOEKINDEX (zone A, 22.10.2026). Vroeger stond «Сторінка «Оновлення» HTTP 200 · Справно» terwijl de pagina wit |
| `tests/eenheid/beheer-diagnostiek.test.ts` | `tests/eenheid/admin-diagnostiek.test.ts` | експорт: `main` — Admin → «Діагностика» (/diagnostiek): register ↔ uitvoerders, zuivere beoordelingen, sortering van «Потребує уваги», whitelist van de route, |
| `tests/eenheid/beheer-integraties.test.ts` | `tests/eenheid/admin-integraties.test.ts` | експорт: `main` — Admin → /mappen «Інтеграції»: detailgegevens (eerlijk), populair/nieuw, beleid voor gebruikers, statuscontrole, loskoppelen, toegang en logboek. |
| `tests/eenheid/beheer-overzicht.test.ts` | `tests/eenheid/admin-overzicht.test.ts` | експорт: `main` — Admin → «Огляд» (/overzicht): widgets/indeling (normalisatie, verplaatsen, formaat), privacy van gebeurtenissen en gebruikersgeschiedenis, |
| `tests/eenheid/extensie-map-installeer.test.ts` | `tests/eenheid/extension-folder-install.test.ts` | експорт: `main` — Встановлення розширення через рідний вибір папки: запис лише після перевірки SHA-256, захист від небезпечних шляхів, скасування. |
| `tests/eenheid/extern-bureaublad.test.ts` | `tests/eenheid/remote-bureaublad.test.ts` | експорт: `main` — Extern bureaublad via Apache Guacamole (uitvoerder D, 18.10.2026). Melding van de eigenaar: «Guacamole (RDP/VNC) — не впроваджено, |
| `tests/eenheid/installeer-opdrachten.test.ts` | `tests/eenheid/install-commands.test.ts` | експорт: `main` — Opties voor Node.js per systeem/architectuur en de installatiecommando's voor de extensie (zonder .cmd/.ps1-download: Smart App Control blokkeert die)… |
| `tests/eenheid/site-activiteit.test.ts` | `tests/eenheid/site-activity.test.ts` | експорт: `main` — Auditlogboek -> meldingen: juiste sectie/dienst per actie, ruis eruit, mislukkingen herkenbaar. |
| `tests/eenheid/site-hulpmiddelen.test.ts` | `tests/eenheid/site-tools.test.ts` | експорт: `main` — Site-hulpmiddelen van de MCP-connector (mail, agenda, schijf, zoeken), modi per hulpmiddel (always / ask / off), de wachtrij voor |
| `tests/eenheid/tech-bundels.test.ts` | `tests/eenheid/tech-assets.test.ts` | експорт: `main`, `geheimeBeheercode` — Technische bundels alleen voor een sessie met actief technisch profiel (verslag van de eigenaar 18.10.2026: «Технічні ассети лише |
| `tests/eenheid/uitgave-info.test.ts` | `tests/eenheid/release-info.test.ts` | експорт: `main` — /api/version: backend/uitgave-info.ts leest de releasemetadata (versie, commit, auteur, agent, samenvatting) uit de |
| `tests/eenheid/vlaggen.test.ts` | `tests/eenheid/flags.test.ts` | експорт: `main` — Etap F (14.10.2026): feature flags. Pure berekening (shared/vlaggen.ts) en echte database + regels (backend/vlaggen.ts). |

## ШІ, агенти, MCP, розширення браузера (46)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/ai-beheer-hulpmiddeldefinities.ts` | `backend/ai-beheer-tooldefs.ts` | експорт: `AUDIT_READ`, `SIEM_STATUS`, `USERS_MANAGE`, `FLAGS_MANAGE` +9 — Definities (alleen de vorm voor tools/list) van de vier TECHNISCHE beheerhulpmiddelen die tot 21.10.2026 «in ontwikkeling» |
| `backend/ai-beheer-hulpmiddelen.ts` | `backend/ai-beheer-tools.ts` | експорт: `maskeerEmail`, `ipPseudoniem`, `maskeerTekst`, `GEHEIME_SLEUTEL` +13 — De vier TECHNISCHE beheerhulpmiddelen van connector v2 (kant 'beheer'), sinds 21.10.2026 echt (besluit van de eigenaar: «дозволи, |
| `backend/ai-toestemmingen.ts` | `backend/ai-grants.ts` | експорт: `CAPABILITIES`, `isCapability`, `DESTRUCTIVE`, `TYPE_CAPABILITY` +25 — Toestemmingen (grants) voor agents per gebruiker (veilig-agenten-0.4, migratie 0017). |
| `backend/browser-mogelijkheden.ts` | `backend/browser-capabilities.ts` | експорт: `BROWSER_TYPES`, `BROWSER_DEFAULT_ENABLED`, `BROWSER_AUTO_APPROVABLE`, `BROWSER_DEFAULT_AUTO` +2 — Mogelijkheden van de browserextensie (opdrachttypes) en hun standaardinstellingen. Eén bron voor server, tools, routes en tests. |
| `backend/connector-v2-opslag.ts` | `backend/connector-v2-store.ts` | експорт: `normaliseerKeuze`, `scopesVoor`, `leesRechten`, `zetRechten` +7 — Connector v2 — opslag (0045): rechten per koppeling, geheugen per gebruiker × agent, instellingen per gebruiker. |
| `backend/connectors-hulpmiddelen.ts` | `backend/connectors-tools.ts` | експорт: `V2_ALLEEN`, `AUDIT_SOORTEN`, `scriptExpressie`, `DEVTOOLS_ALIASES` +19 — Brug "connectors -> AI-tools" in het formaat van het Model Context Protocol (name / title / description / inputSchema / |
| `backend/connectors-opdrachten.ts` | `backend/connectors-commands.ts` | експорт: `isPowershellOpdracht`, `CommandRefused`, `submitCommand`, `requireFreshApproval` +3 — Opdrachten voor een agent: aanmaken volgens de toestemmingen (grants) van de gebruiker, goedkeuren, en wachten op het resultaat. |
| `backend/connectors-opslag.ts` | `backend/connectors-store.ts` | експорт: `AGENT_LIMITS`, `createPairingCode`, `countAgents`, `listAgents` +45 — Local Machine Connector: databasetoegang voor app.agents, app.agent_pairing_codes en app.agent_commands (0009). |
| `backend/dev-gebruiker-hulpmiddeldefinities.ts` | `backend/dev-gebruiker-tooldefs.ts` | експорт: `BEVESTIGING_ID`, `UPLOAD_MAX_BYTES`, `UPLOAD_MULTIPART_MAX`, `UPLOAD_TYPES` +6 — Definities (alleen de vorm voor tools/list) van de zes PRIVÉ-hulpmiddelen die tot 21.10.2026 «у розробці» stonden |
| `backend/mcp-connector-opslag.ts` | `backend/mcp-connector-store.ts` | експорт: `LIMITS`, `countClients`, `insertClient`, `getClient` +16 — MCP-connector voor Claude: databasetoegang voor app.mcp_oauth_clients, app.mcp_oauth_auth en app.mcp_oauth_tokens (0010). |
| `backend/mcp-klant-opslag.ts` | `backend/mcp-klant-store.ts` | експорт: `lijst`, `een`, `viaSleutel`, `toevoegen` +13 — Het REGISTER van vreemde MCP-servers per gebruiker (migratie 0078) en hun gekeurde lijst met hulpmiddelen. |
| `scripts/bouw-extensie.mjs` | `scripts/build-extension.mjs` | Bouwt de downloads van de browserextensie in dist/downloads/: |
| `scripts/extensie-lib.mjs` | `scripts/extension-lib.mjs` | експорт: `SITE`, `UPDATE_URL`, `CRX_URL`, `walk` +7 — Gedeelde functies voor het bouwen van het extensiepakket (ZIP) en het ondertekenen van het CRX3-pakket. |
| `scripts/onderteken-extensie.mjs` | `scripts/sign-extension.mjs` | Ondertekent de extensie als CRX3 met een EIGEN sleutel (alleen lokaal draaien; de privésleutel staat NIET in de repository). |
| `shared/ai-beleid/catalogus.ts` | `shared/ai-beleid/catalog.ts` | експорт: `CAPABILITIES`, `capabilityInfo`, `isKnownCapability`, `isOwnerOnly` +6 — * Каталог можливостей (capabilities), інструментів і типів дій. |
| `shared/ai-beleid/tijd.ts` | `shared/ai-beleid/time.ts` | експорт: `DEFAULT_TZ`, `SECOND`, `MINUTE`, `HOUR` +18 — * Час доступу: шаблони, «до години», власна тривалість і справжній зворотний відлік. |
| `src/AIDienstWeergave.tsx` | `src/AIServiceView.tsx` | експорт: `openIntegrations`, `openVault`, `hubUrl`, `AIServiceView (default)` |
| `src/AgentInrichtingWizard.tsx` | `src/AgentSetupWizard.tsx` | експорт: `PairCard` |
| `src/AgentenPaneel.tsx` | `src/AgentsPanel.tsx` | експорт: `AgentsPanel (default)` |
| `src/BrowserExtensiePaneel.tsx` | `src/BrowserExtensionPanel.tsx` | експорт: `BrowserExtensionPanel (default)` |
| `src/ExtensieWizard.tsx` | `src/ExtensionWizard.tsx` | експорт: `ExtensionWizard (default)` |
| `src/McpAgentenHub.tsx` | `src/McpAgentsHub.tsx` | De beheerpagina mcp.*/agents staat nu in ./agenten (tabbladen in GitHub-stijl). Dit bestand blijft als ingang voor bestaande imports. |
| `src/McpAppsWeergave.tsx` | `src/McpAppsView.tsx` | експорт: `McpAppsView (default)` — mcp.*/apps — «Додатки на вашому залізі» (BYOS-PaaS). Eén plek voor de eigenaar: |
| `src/McpBackupsKaart.tsx` | `src/McpBackupsCard.tsx` | експорт: `McpBackupsCard (default)` |
| `src/McpConnectorPaneel.tsx` | `src/McpConnectorPanel.tsx` | експорт: `McpConnectorPanel (default)` |
| `src/McpDienstWeergave.tsx` | `src/McpServiceView.tsx` | експорт: `ingangAdres`, `McpServiceView (default)` |
| `src/McpHulpmiddelenPaneel.tsx` | `src/McpToolsPanel.tsx` | експорт: `ToolApprovals`, `McpToolsPanel (default)` |
| `src/McpServerBeheerKaart.tsx` | `src/McpServerBeheerCard.tsx` | експорт: `McpServerBeheerCard (default)` |
| `src/agent-opdrachten.ts` | `src/agent-commands.ts` | експорт: `winQuote`, `posixQuote`, `looksLikePlaceholder`, `buildAgentCommands` +1 — Opdrachten voor het koppelen van een pc of VM, per shell correct gequoot (zuivere functies; getest in tests/eenheid/agent-opdrachten.test.ts). |
| `src/agenten-gegevens.ts` | `src/agents-data.ts` | експорт: `sessionBody`, `COMMAND_LABELS`, `commandLabel`, `STATUS_LABELS` +8 |
| `src/agenten-paneel.css` | `src/agents-panel.css` |  |
| `src/agenten/gegevens.ts` | `src/agenten/data.ts` | експорт: `inRuimte`, `useOverzicht`, `useV2Overzicht`, `useDeurTokens` +5 — Gegevens voor /agents. Eén poller voor apparaten en wachtende acties (agents-data), de rest alleen bij openen, na een actie |
| `src/browser-agent-hartslag.ts` | `src/browser-agent-heartbeat.ts` | експорт: `HEARTBEAT_EVENT`, `heartbeatToestand` — Houdt een door de gebruiker aangezette browserextensie actief zolang er een INGELOGDE pagina van de site open is. |
| `src/browser-mogelijkheden-ui.ts` | `src/browser-capabilities-ui.ts` | експорт: `GROUPS`, `CAPABILITIES`, `DEFAULT_ENABLED`, `AUTO_HELP` — Mogelijkheden van de browserextensie zoals de gebruiker ze in het kabinet ziet: naam, groep en een uitleg voor AAN en UIT. |
| `src/connector-activiteit.ts` | `src/connector-activity.ts` | експорт: `statusInfo`, `activityTitle`, `activityLink`, `sourceLabel` +4 |
| `src/extensie-welkom-opslag.ts` | `src/extension-welcome-store.ts` | експорт: `captureWelcomeFromUrl`, `welcomePending`, `clearWelcome`, `isExtensiePagina` +3 — Onthoudt dat de extensie na het installeren de site opende met ?extension=welcome, ook als de gebruiker nog niet is ingelogd. |
| `src/extensie-wizard.css` | `src/extension-wizard.css` |  |
| `src/mcp-backups-kaart.css` | `src/mcp-backups-card.css` |  |
| `src/mcp-brug.css` | `src/mcp-bridge.css` |  |
| `src/mcp-catalogus.ts` | `src/mcp-catalog.ts` | експорт: `MCP_TABS`, `ESTATE`, `DOOR_TOOLS`, `TOOL_HELP` +1 |
| `src/mcp-domein.css` | `src/mcp-estate.css` |  |
| `src/mcp-teksten.ts` | `src/mcp-texts.ts` | експорт: `TOOL_TEXTS`, `textOf` — Alle zichtbare teksten per MCP-hulpmiddel in het Oekraïens en Nederlands (de Engelse beschrijving is alleen voor Claude zelf en verschijnt nooit op de… |
| `tests/eenheid/agent-opdrachten.test.ts` | `tests/eenheid/agent-commands.test.ts` | експорт: `main` — Koppelopdrachten voor de agent: correct gequoot per shell, geen punthaken, drive-root met backslash, startbestanden. |
| `tests/eenheid/agenten.test.ts` | `tests/eenheid/agents.test.ts` | експорт: `main` — Regressietests Local Machine Connector (migrations/0009_agents.sql, backend/connectors-*.ts): |
| `tests/eenheid/ai-toestemmingen-contract.test.ts` | `tests/eenheid/ai-grants-contract.test.ts` | експорт: `main` — De 8 contracttests van het toestemmingsmodel (grants) uit de opdracht "veilige agenten 0.4", tegen een echte Postgres: |
| `tests/eenheid/hulpmiddelen-tweetalig-20261020.test.ts` | `tests/eenheid/tools-tweetalig-20261020.test.ts` | експорт: `main` — Hulpmiddelen tweetalig (20.10.2026, eigenaar): de lijst van hulpmiddelen in de Claude-app toonde ENGELSE namen («Start, stop, |

## Хаб, хмара, медіа, GitHub, пошук по сайту (36)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/cognitief-context.ts` | `backend/cognitive-context.ts` | експорт: `createCognitiveContextRoutes` |
| `backend/globaal-zoek.ts` | `backend/global-search.ts` | експорт: `ladeGroepen`, `createGlobalSearchRoutes` |
| `backend/google-suite-agenda-fotos.ts` | `backend/google-suite-calendar-photos.ts` | експорт: `createGoogleSuiteCalendarPhotosRoutes` |
| `backend/google-suite-agenda-sync.ts` | `backend/google-suite-calendar-sync.ts` | експорт: `synchroniseerAgendaVoorPrincipal`, `synchroniseerAgendaVoorEigenaar`, `runGoogleSuiteCalendarSync` — Google Calendar → de spiegel van de hub: INCREMENTELE synchronisatie per agenda. |
| `backend/hub-blok-gegevens.ts` | `backend/hub-block-data.ts` | експорт: `createHubBlockDataRoutes` |
| `backend/hub-indeling-voorkeuren.ts` | `backend/hub-layout-preferences.ts` | експорт: `createHubLayoutPreferenceRoutes` — Blokvoorkeuren van de hub (formaat/ingeklapt per blok). Onderdeel van de dienst «bord» (migratie 0086): ze horen bij de |
| `src/CloudFunctioneelWeergave.tsx` | `src/CloudFunctionalView.tsx` | експорт: `normaliseerBootstrap`, `CloudFunctionalView (default)` |
| `src/CognitiefContext.tsx` | `src/CognitiveContext.tsx` | експорт: `loadCognitiveResume`, `saveCognitiveResume`, `ServiceContextBar` |
| `src/DomoticaWeergave.tsx` | `src/SmartHomeView.tsx` | експорт: `SmartHomeView (default)` |
| `src/GitHubWeergave.tsx` | `src/GitHubView.tsx` | експорт: `GitHubView (default)` |
| `src/GlobaalZoekPaneel.tsx` | `src/GlobalSearchPanel.tsx` | експорт: `GlobalSearchPanel (default)` — «Пошук усюди» (oud paneel) → dunne schil over het nieuwe palet ⌘K (src/zoek/ZoekGlobaal.tsx, gemonteerd in CanonicalChrome). |
| `src/GoogleSuiteMediaWeergave.tsx` | `src/GoogleSuiteMediaView.tsx` | експорт: `GoogleCalendarView`, `GooglePhotosView` |
| `src/HubBlokWidget.tsx` | `src/HubBlockWidget.tsx` | експорт: `HubBlockWidget (default)` |
| `src/HubNotities.tsx` | `src/HubNotes.tsx` | експорт: `hubNotities`, `HubNotes (default)` — Hub → tabblad «Нотатки»: ECHTE notities, dezelfde als het MCP-hulpmiddel manage_hub_notes (bord-items kind 'note' |
| `src/cloud-aanbieder-i18n.ts` | `src/cloud-provider-i18n.ts` | експорт: `cloudProviderText` |
| `src/cloud-functioneel.css` | `src/cloud-functional.css` |  |
| `src/cognitief-context.css` | `src/cognitive-context.css` |  |
| `src/domotica.css` | `src/smart-home.css` |  |
| `src/github-weergave.css` | `src/github-view.css` |  |
| `src/globaal-zoek.css` | `src/global-search.css` | «Пошук усюди» (Z4, 22.10.2026): het oude paneel is vervangen door het palet ⌘K (src/zoek/ZoekGlobaal.tsx); alleen de knop in de |
| `src/hub-blok-gegevens.ts` | `src/hub-block-data.ts` | експорт: `readHubBlockDataCache`, `loadHubBlockData` |
| `src/hub-functioneel-blokken.css` | `src/hub-functional-blocks.css` |  |
| `src/hub-notities.css` | `src/hub-notes.css` | Hub → «Нотатки» (echte notities) |
| `src/zoek/ZoekCategorieIcoon.ts` | `src/search/ZoekCategorieIcoon.ts` | експорт: `CATEGORIE_ICOON` — /zoek — icoon per categorie (zone D, 22.10.2026): voor de groepskoppen «за джерелами» op de pagina. Alleen lucide-vormen; |
| `src/zoek/ZoekFilters.tsx` | `src/search/ZoekFilters.tsx` | експорт: `ZoekFilters (default)` — /zoek — het filterpaneel (specificatie §11): bron, type, formaat, taal, datum (presets + eigen periode), minimale |
| `src/zoek/ZoekGlobaal.tsx` | `src/search/ZoekGlobaal.tsx` | експорт: `PALET_EVENT`, `openZoekPalet`, `zoekPaginaUrl`, `ZoekMenuKnop` +1 — HET GLOBALE ZOEKVELD IN DE BOVENBALK + HET PALET ⌘K (zone Z4, 22.10.2026; specificatie §11 «верхня панель»). |
| `src/zoek/ZoekIndexVenster.tsx` | `src/search/ZoekIndexVenster.tsx` | експорт: `INDEX_VENSTER_ID`, `ZoekIndexVenster (default)` — — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts). |
| `src/zoek/ZoekKaart.tsx` | `src/search/ZoekKaart.tsx` | експорт: `KaartIcoon`, `UITLEG_METHODE`, `fmtDatum`, `Stukken` +1 — /zoek — de resultaatkaart (specificatie §11): ronde typeicoon, titel, bron › pad, fragment met de markering van de SERVER |
| `src/zoek/ZoekPagina.tsx` | `src/search/ZoekPagina.tsx` | експорт: `DEBOUNCE_MS`, `ZoekPagina (default)` — hub.*/zoek — DE ZOEKPAGINA (zone Z4, 22.10.2026; specificatie §6.1, §6.2, §10, §11, §12). Binnen de hub-shell |
| `src/zoek/ZoekVeld.tsx` | `src/search/ZoekVeld.tsx` | експорт: `SUGGESTIE_LABEL`, `Hl`, `ZoekVeld (default)` — /zoek — het zoekveld met autodoploen (specificatie 6.1), gedeeld door de pagina /zoek (groot) en het palet ⌘K (compact). |
| `src/zoek/zoek-api.ts` | `src/search/zoek-api.ts` | експорт: `ZOEK_HOSTS`, `leesRoute`, `leesTreffer`, `leesSuggestie` +13 — /zoek — de clientkant van het contract (shared/zoek-model.ts, scratchpad/zoek-API.md). Zone Z4, 22.10.2026. |
| `src/zoek/zoek-index-api.ts` | `src/search/zoek-index-api.ts` | експорт: `indexStarten`, `indexStand`, `indexStoppen`, `indexGeschiedenis` — — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts). |
| `src/zoek/zoek-index-logica.ts` | `src/search/zoek-index-logic.ts` | експорт: `INDEX_BRONNEN`, `ACTIEF`, `isActief`, `leesBronStand` +8 — — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts). |
| `src/zoek/zoek-kern.ts` | `src/search/zoek-core.ts` | експорт: `norm`, `stukkenUitPosities`, `highlightParts`, `levenshtein` +7 — /zoek — zuivere kern voor de pagina en het palet (Z4, 22.10.2026): veilige markering (posities van de server → stukken |
| `src/zoek/zoek-logica.ts` | `src/search/zoek-logic.ts` | експорт: `CATEGORIEEN`, `CATEGORIE_BRONNEN`, `CATEGORIE_NAAM`, `SOORT_NAAM` +32 — /zoek — zuivere logica zonder DOM/React (Z4, 22.10.2026): categorieën ↔ bronnen, filters ↔ serververzoek (ZoekVraag), |
| `src/zoek/zoek.css` | `src/search/zoek.css` | /zoek — zone Z4 (22.10.2026). Alleen tokens uit src/ontwerp/tokens.css (geen hex, geen prefers-color-scheme: de thema's komen |

## Інше (20)

| Нова назва | Була | Що всередині (експорти; перший рядок коментаря) |
|---|---|---|
| `backend/api-platform-verbindingen.ts` | `backend/api-platform-connections.ts` | експорт: `OWNER_CONNECTIONS_TABLE`, `API_PLATFORM_CONNECTIONS`, `apiPlatformConnectionCards`, `zetVerbindingStatus` +2 |
| `backend/google-suite-inrichting.ts` | `backend/google-suite-onboarding.ts` | експорт: `AGENDA_LEES_SCOPE`, `AGENDA_SCHRIJF_SCOPE`, `googleGrantNogServerSleutel`, `googleSuiteMailSearchScopeStatus` +27 |
| `backend/overdracht-binding.ts` | `backend/handoff-binding.ts` | експорт: `HANDOFF_BINDING_COOKIE`, `handoffBindingVoorAanmaken`, `handoffBindingVanBrowser`, `metBindingCookie` — Browserbinding voor sessie-handoffs (?handoff=<code>), tegen login-CSRF. |
| `server/platform/geheimen.ts` | `server/platform/secrets.ts` | експорт: `SECRET_ALLOW_LIST`, `secrets` — Compatibiliteitslaag voor de vroegere AppDeploy 'secrets'-API. |
| `server/platform/opslag.ts` | `server/platform/storage.ts` | експорт: `resolveStoragePath`, `padHoortBijAnder`, `storage`, `storageReady` — Compatibiliteitslaag voor de vroegere AppDeploy 'storage'-API, op het lokale bestandssysteem |
| `server/platform/uitnodigingen.ts` | `server/platform/invites.ts` | експорт: `InviteError`, `isInviteError`, `invites` — Compatibiliteitslaag voor de vroegere AppDeploy 'invites'-API (tabel app.invites). |
| `src/ApiPlatformWeergave.tsx` | `src/ApiPlatformView.tsx` | експорт: `ApiPlatformView (default)` |
| `src/InstellingencentrumWeergave.tsx` | `src/SettingsCenterView.tsx` | експорт: `SettingsCenterView (default)` |
| `src/SnelleToegangBewerker.tsx` | `src/SnelleToegangEditor.tsx` | експорт: `SnelleToegangEditor (default)` — «Швидкий доступ» / «Snelle toegang» — een UITDRUKKELIJKE bewerker (punt 17, audit 19.10.2026). |
| `src/account-voorbeeld-geschiedenis.ts` | `src/account-preview-history.ts` | експорт: `accountPreviewKey`, `readAccountPreviewHistory`, `rememberAccountPreviewHistory`, `forgetAccountPreviewHistory` |
| `src/api-platform-weergave.css` | `src/api-platform-view.css` |  |
| `src/chat-paneel.css` | `src/chat-panel.css` |  |
| `src/ecosysteem-productie.css` | `src/ecosystem-production.css` |  |
| `src/ext-rechten.css` | `src/ext-permissions.css` |  |
| `src/instellingencentrum.css` | `src/settings-center.css` |  |
| `src/weergave/weergave-opslag.ts` | `src/weergave/weergave-store.ts` | експорт: `useWeergave`, `huidigeModus`, `weergaveVernieuwen`, `modusKiezen` +1 — «Простий / розширений» режим van dit account (zie shared/weergave.ts). De server is de bron; localStorage is alleen een kopie zodat |
| `tests/eenheid/beveiliging-beoordeling-20261021.test.ts` | `tests/eenheid/beveiliging-review-20261021.test.ts` | експорт: `main` — ONAFHANKELIJKE BEVEILIGINGSREVIEW van de wijzigingen van 21.10.2026 (bovenop 6aabff9). Elke «FOUT»-check hieronder is een AANVAL |
| `tests/eenheid/mededeling-ontdubbelen.test.ts` | `tests/eenheid/notice-dedupe.test.ts` | експорт: `main` — Dubbele meldingen (meerdere tabbladen, wisselende staat) verschijnen één keer; meldingen met een knop nooit onderdrukt. |
| `tests/eenheid/zoek-bronnen-etappe-c-20261021.test.ts` | `tests/eenheid/zoek-bronnen-etap-c-20261021.test.ts` | експорт: `main` — Zoeken etappe C (21.10.2026): veilig archieven uitpakken, tekst/OCR met sha256-cache, inhoud → delen, bronadapters, |
| `tests/eenheid/zoek-etappe-d-20261021.test.ts` | `tests/eenheid/zoek-etap-d-20261021.test.ts` | експорт: `main` — Etap D (/zoek): pure zoeklogica (categorieën, filters, URL-staat, markering) + route 'zoek' in beide tabbladlijsten. |

## Додані після перейменування (57)

Нові файли з'являються одразу з нідерландськими назвами; карта знає, де вони і що в них (`toegevoegd` у `bestandskaart.json`).

| Файл | Що всередині | Відколи |
|---|---|---|
| `scripts/kaart-controle.mjs` | Перевірка цієї карти під час збірки (перший крок `npm run build`): старі шляхи, відсутні нові, англійські назви, відсутні додані файли. | 86fd409 |
| `tests/eenheid/bestandskaart-20261024.test.ts` | Тест карти й `kaart-controle`. | 86fd409 |
| `src/mail/lees-modus.ts` | Вікно листа — правила без DOM: яка форма (повний / праворуч / знизу / плаваюче / телефон), роль для читача екрана, фокус, Escape, «Назад», межі поруч із меню й доком, «priority+» шапки. | пакет 1 «Adaptive Mail Canvas» |
| `src/mail/LeesVenster.tsx` | Вікно листа — рамка навколо відкритого листа: одна для всіх форм; дає панелі дій (`MailLezerWerkbalk`) форму, плаваюче вікно й Escape. | пакет 1 «Adaptive Mail Canvas» |
| `src/mail/lees-venster.css` | Вікно листа — CSS за формою (`data-lees-modus`, `data-lees-breedte`): шапка «priority+», «знизу» без окремої прокрутки, ручка плаваючого вікна. | пакет 1 «Adaptive Mail Canvas» |
| `tests/eenheid/lees-venster-20261024.test.ts` | Тест вікна листа: правила, структура в кожній формі, джерело, CSS. | пакет 1 «Adaptive Mail Canvas» |
| `tests/e2e/hulp/stand-lezer.ts` | Стенд `mail-lezer-*`: геометрія й поведінка вікна листа в кожній формі й розмірі, меню праворуч і док. | пакет 1 «Adaptive Mail Canvas» |
| `src/mail/gesprek-context.ts` | Контекст гілки — правила без DOM і без ШІ: версії вкладень, хронологія, пов'язані листи з причиною, перевірка відправника (SPF/DKIM/DMARC), «N попередні листи», кому/копія, підрахунок зовнішніх зображень і пікселів, час із .ics з TZID. | pakket 2 «Adaptive Mail Canvas» |
| `tests/eenheid/gesprek-context-20261024.test.ts` | Тест правил контексту гілки: версії, хронологія, пов'язані листи, перевірка відправника, отримувачі. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/ContextPaneel.tsx` | Панель контексту відкритого листа: колонка поруч (≥ 1100 px) або аркуш із вкладками; Хронологія · Вкладення (групи версій) · Зв'язки (пошук у цій скриньці, «без ШІ») · Завдання й події (.ics → «В Агенду») · Відправник (перевірка + колір контакту) · Безпека. Пакет 3: «Порівняти» в кожній групі версій і пункти «Що від вас потрібно?» (з джерелом) у «Завдання й події». | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/context-paneel.css` | CSS панелі контексту: фіксовані рядки вікна листа, колонка (368 px) і аркуш (збоку/знизу), хронологія, версії, кольори, безпека; лише токени. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/gesprek-opmaak.css` | CSS листів і шапки вікна (пакет 2): фото й колір контакту, кому/копія, ↩, «N попередні листи», версія на картці, подія з .ics, «Вигляд» (щільність/розмір), ∧ N з M ∨, «Відповісти», панель дій телефона. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/ics-gebeurtenissen.ts` | Події з вкладень .ics: читання один раз на вкладення (спільне для картки в листі й панелі контексту), час із TZID, читабельний час. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/SneltoetsenHulp.tsx` | Довідка клавіш у відкритому листі («?»): R, A, F, E, J/K, F6, Esc, ?. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/WeergaveKeuze.tsx` | «Вигляд» листа: щільність (компактно/звичайно/просторо) і розмір тексту (90–130 %), кнопкою в шапці та блоком у ⋮ на телефоні. Пакет 3: «Мова листа» (оригінал або переклад приватним агентом під час відкриття). | pakket 2 «Adaptive Mail Canvas» |
| `tests/eenheid/lezer-context-20261024.test.ts` | Тест пакета 2: форма контексту, «Вигляд», клавіші (і українська розкладка), зображення/.ics/розмір тексту, структура панелі й шапки, джерело, CSS. | pakket 2 «Adaptive Mail Canvas» |
| `src/mail/beelden-toestemming.ts` | Зовнішні зображення для відправника на цьому пристрої («Завжди від цього відправника»): до 300 адрес у localStorage, хук React стежить за змінами (і з інших вкладок). | пакет 2 «Adaptive Mail Canvas» |
| `shared/ai-bronnen.ts` | Джерела пунктів ШІ — правила без DOM (у браузері й на сервері): абзаци листа (§1, §2 …), дослівний пошук цитати, перевірка пунктів і термінів за ОРИГІНАЛОМ, дати, простий розбір без моделі, «Потребує відповіді», виділення в оригінальному тексті. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/ai-staat.ts` | Який приватний ШІ-агент може читати пошту (один запит на контекст, спільний), чесні тексти помилок, виклик /ai-vertaling/run; останній завантажений стан для «Вигляду». | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/alinea-aanwijzen.ts` | «Показати абзац у листі»: цитату пункту видно в самому листі (iframe або текст) — рамка й CSS Custom Highlight, текст не змінюється. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/WatNodigBlok.tsx` | Блок «Що від вас потрібно?» над листами: простий розбір у браузері або (після натискання) приватний агент; кожен пункт із чипом джерела й терміном, лише те, що дослівно є в листі; Чернетка відповіді · До завдань · В Агенду. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/BronBlad.tsx` | Аркуш «Звідки це?»: пункт, оригінальний абзац із виділеною цитатою, переклад абзацу (лише з агентом), результат перевірки, «Показати абзац у листі» й «Пункт хибний — прибрати». | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/VertaalStrook.tsx` | Смуга перекладу в листі: «Оригінал / Переклад / Порівняти»; без агента — лише оригінал (і чому). | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/VergelijkTabel.tsx` | «Порівняти»: лист таблицею по абзацах (оригінал ↔ переклад), абзац-джерело пунктів виділено; на телефоні — одне під одним. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/ai-blok.css` | CSS ШІ в листі: блок, чипи, терміни, рядок теми, смуга перекладу, таблиця порівняння, аркуш «Звідки це?», рядок відповіді; лише токени (--info = ШІ). | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/VersieVergelijk.tsx` | Вікно «Порівняти версії» (з панелі контексту): дві версії вкладення, лише текст, різниця за абзацами й реченнями з виділеними словами; чесні повідомлення. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/versie-vergelijk.css` | CSS «Порівняти версії»: шар над вікном листа, поруч або одне під одним (container query), лише токени. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/tekst-verschil.ts` | Різниця двох текстів без DOM: блоки (абзаци, пункти списку, речення), LCS з якорями, переміщені й змінені блоки, різниця слів. | пакет 3 «Adaptive Mail Canvas» |
| `src/mail/bijlage-tekst.ts` | Текст із вкладення для «Порівняти версії»: PDF через pdf.js (до 60 сторінок, без колонтитулів), текст/CSV із декодуванням, DOCX/ODT/RTF через наявний завантажувач документів. | пакет 3 «Adaptive Mail Canvas» |
| `tests/eenheid/ai-bronnen-20261024.test.ts` | Тест shared/ai-bronnen.ts: абзаци, дослівний пошук, перевірка, дати й терміни (nl/uk/en/pl), простий розбір, «Потребує відповіді», виділення. | пакет 3 «Adaptive Mail Canvas» |
| `tests/eenheid/lezer-ai-20261024.test.ts` | Тест ШІ у вікні листа: блок, аркуш «Звідки це?», смуга перекладу, таблиця, панель контексту («Порівняти», пункти), «Мова листа», зв'язки й CSS. | пакет 3 «Adaptive Mail Canvas» |
| `tests/eenheid/ai-acties-20261024.test.ts` | Тест серверного режиму «acties» у /ai-vertaling/run: вхід, перевірка за оригіналом, чесні відмови, кеш. | пакет 3 «Adaptive Mail Canvas» |
| `tests/eenheid/versie-vergelijk-20261024.test.ts` | Тест «Порівняти версії»: різниця, текст із вкладень (і справжній pdf), структура вікна, CSS. | пакет 3 «Adaptive Mail Canvas» |
| `tests/e2e/hulp/stand-lezer-ai.ts` | Стенд `mail-lezer-ai-*`: ШІ в листі з імітованим приватним агентом (один пункт вигаданий) — блок, «Звідки це?», «Показати абзац у листі», смуга перекладу й «Порівняти», панель контексту (пункти, «Порівняти версії» зі справжніми PDF), рядок відповіді, «Мова листа», axe. | пакет 3 «Adaptive Mail Canvas» |
| `shared/plaatsing.ts` | Плаваючі кнопки — модель без DOM: зони (верхня панель, шапка меню, список меню, стос дій), гнізда для телефона / планшета / комп'ютера, типові місця, розкладка, перенесення з відмовою, якщо зона повна, повернення на типове місце, розміри стосу, тексти uk/nl. | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `src/plaatsing/plaatsing-staat.ts` | Спільний стан зон і гнізд: розкладка від оболонки, гнізда кнопок, перенесення, меню «Перемістити до…», лічильник дзвоника для ☰, висота нижніх смуг. | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `src/plaatsing/Plek.tsx` | Зони й гнізда в React: `useZone`, `<Gniezda>`, `<Plek knop>` (кнопка малюється у своєму гнізді), `<Actiestapel>` (над нижніми смугами), `<PlaatsActies>` («Перемістити до…», клавіатура, повернення), тип пристрою за шириною. | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `src/plaatsing/plaats-slepen.ts` | Розставлення: утримання 0,45 с (дотик) або 5 px мишею, «привид», зони з лічильником, повна зона відмовляє з підказкою, меню розгортається на ☰, Esc / скасування, права кнопка / клавіша меню → «Перемістити до…». | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `src/plaatsing/plaats-flip.ts` | Плавне розсування сусідів у зоні під час перенесення (160 мс; без руху при «зменшити анімацію»). | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `src/plaatsing/plaatsing.css` | Один шар CSS для плаваючих кнопок: зони, гнізда, стос дій (розміри = модель), вікна над зонами (visibility), спливаюче сповіщення вгорі на телефоні, лічильник на ☰, перенесення, «Перемістити до…». | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `src/plaatsing/melding-plek.ts` | Місце спливаючого сповіщення: кандидати за порядком (комп'ютер — під дзвоником, унизу чи вгорі посередині; телефон — угорі під панеллю чи над стосом), перемагає перший, під яким немає малої кнопки (QA 12.10 №11). | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `scripts/plaatsing-controle.mjs` | Перевірка під час збірки: каталог і місткість для кожного типу пристрою, розміри CSS = модель, кожна кнопка рівно один `<Plek>`, жодного нового `position:fixed` поза шаром. | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `scripts/plaatsing-vaste-elementen.json` | Список CSS-правил із `position:fixed`, що були до шару (25.10.2026), і дозволені вікна/смуги з причиною — для `plaatsing-controle`. | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `tests/eenheid/plaatsing-20261025.test.ts` | Тест моделі й перевірки збірки: типи пристроїв, типові місця, місткість (43 200 комбінацій), перенесення й відмови, нормалізація, повернення, розміри, тексти, налаштування меню. | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `tests/e2e/hulp/stand-plaatsing.ts` | Стенд `plaatsing-*`: виміри «до» (`plaatsing-nu`) і приймання «після» (`plaatsing-na`): прокрутка, адресний рядок, «Вгору», свайп, зум, комп'ютер → телефон, перезавантаження, перенесення, повна зона, розгортання меню, «Перемістити до…», вільне місце сповіщення; `plaatsing-dok` (док праворуч / угорі / унизу) і `plaatsing-lagen` (лічильники, підказка й меню у світлій і темній темі, з axe). | плаваючі кнопки «зони й гнізда» (25.10.2026) |
| `shared/mail-acties.ts` | Один реєстр усіх дій з листами (39): група, тон, тексти uk/nl у шести формах, клавіша й стани; джерело для панелі рядка, меню ⋮, панелі виділення, вікна листа, нижньої смуги телефона, свайпу й підказки клавіш. | блок 1 «швидкі виправлення» (25.10.2026) |
| `src/mail/MailActieKnop.tsx` | Піктограми й кнопка дії з реєстру (data-mail-actie, data-toon). | блок 1 «швидкі виправлення» (25.10.2026) |
| `src/mail/mail-acties.css` | Єдине місце, де тон стає кольором (небезпека → --fout, інфо → --info, увага → --warn …) для всіх поверхонь. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/eenheid/mail-acties-20261025.test.ts` | Тест реєстру дій: кожна поверхня бере дії з реєстру, жодних кольорів за aria-label, тони у світлій і темній темах. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/eenheid/mail-geminimaliseerd-20261025.test.ts` | Тест згорнутих листів: місце з природною висотою, data-geplaatst, жодного розтягування, значок «+N», картка вкладення не росте в рядку. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/eenheid/connector-instructies-20261025.test.ts` | Тест інструкцій конектора: перші 512 знаків самодостатні (п'ять правил, повні речення) для кожного агента й стану; PERMISSION_OFF веде на /agenten#agent/<агент>. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/eenheid/bevestig-toegang-opmaak-20261025.test.ts` | Тест вікна «Підтвердіть доступ» і чипів згоди: прапорець не розтягнуто, підпис у межах вікна, контраст підпису й пояснення на всіх 26 палітрах. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1.ts` | Стенд блоку 1: збирає кроки blok1-* чотирьох команд (кожна у своєму файлі). | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-acties.ts` | Стенд blok1-acties-*: панель у межах рядка в кожній густині, нічого не перекрито; однаковий колір дії на всіх поверхнях (світла й темна). | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-geminimaliseerd.ts` | Стенд blok1-geminimaliseerd-*: док ≤ 60 px згорнутим, перетягування без розтягування, F5; картка не росте від колеса, список прокручується, спливаючий перегляд більшає. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-vensters.ts` | Стенд blok1-vensters: кожна кнопка кожного вікна (лист у чотирьох режимах, вкладення, «Новий лист», вікно платформи) і кожна [data-plaats-knop] «влучає» в себе за будь-якого місця дзвоника. | блок 1 «швидкі виправлення» (25.10.2026) |
| `tests/e2e/hulp/stand-blok1-toegang.ts` | Стенд blok1-toegang-*: вікно «Підтвердіть доступ» (підпис у межах, контраст), чипи згоди на 390 px, сторінка ChatGPT з новими кроками й попередженням про план. | блок 1 «швидкі виправлення» (25.10.2026) |
