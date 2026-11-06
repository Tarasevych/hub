> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./MAIL-AUDIT-20261007.uk.md) · **🇳🇱 Nederlands** ([origineel](./MAIL-AUDIT-20261007.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Audit van de e-mailclient mail.tarasevych.com (07-10-2026)

Methode: lezen van de code (`backend/google-suite-mail-browser.ts`, `backend/index.ts`, `src/MailNewMessageDialog.tsx`, `src/MailComposeEditor.tsx`), zoekopdracht's op de live database (alleen tellers en
statussen, geen inhoud van berichten), live verzoeken namens de eigenaar naar routes op productie, en cron-logboeken. Integratie met Gmail: **officiële REST API via fetch** (de bibliotheek `googleapis`
is niet nodig en werd niet toegevoegd); IMAP/SMTP wordt niet gebruikt.

## Wat werkt
- Lezen: lijst, gesprekken, etiketten, zoeken, datumgrenzen, bijlagen (`google-suite/*`, principal-token).
- Archiveren: `message/modify` voor de actie `archive` roept `POST /gmail/v1/users/me/messages/{id}/modify` aan met `{"addLabelIds":[],"removeLabelIds":["INBOX"]}` (gecontroleerd in de code; voor de prullenbak zijn er aparte `trash/untrash`-acties). **Er hoefde niets hersteld te worden.**
- Uitstellen van een bericht («snooze», `mail-snooze.ts`) bestaat als afzonderlijke functie.
- Cron: `mail-provider-maintenance` (5 min) en `google-suite-bplus-sync` (5 min) draaien zonder fouten.

## Wat stuk was (gevonden en hersteld)
1. **E-mailsynchronisatie stond stil sinds 04-10-2026 15:20** (drie dagen). Oorzaak: de taakuitvoeringslus (`mailRunDueJobs`) las alleen de **eerste 100** taken van de eigenaar op volgorde van aanmaken; deze
   100 hadden allemaal de status `succeeded`, terwijl 293 nieuwe `queued`-taken verderop stonden en nooit in de selectie terechtkwamen (hetzelfde gold voor `mailRecoverStaleJobs`, limiet 300). Cron meldde daarbij gewoon «ok 200».
   Oplossing: selectie op status (`queued`/`retry`/`leased`), opschonen van voltooide (>3 dagen) en verouderde reservesynchronisaties (`mailPurgeJobs`), test `mail-queue` (4 controles).
   Na de uitrol: 389 taken opgeschoond, 3 uitgevoerd in één run, en de initiële synchronisatie loopt weer.
2. **Cron toonde geen fouten**: `cron.ts` beschouwde alles met `statusCode 200` als geslaagd, terwijl de body `ok:false` of een foutreden per eigenaar kon bevatten. Nu bevat `app.cron_runs.detail` de status
   en de ingekorte body, en wordt `ok:false` gemarkeerd als `error`.
3. **De knop «Написати лист» (Nieuw bericht) kon geen e-mail verzenden**: het dialoogvenster stuurde naar `/api/owner/mail/accounts/<id>/send/prepare` het account-ID van **Google-suite** (`1a4a…`), terwijl de route een account
   van het oude «mail platform» (`d497…`) zoekt → `404 MAIL_ACCOUNT_NOT_FOUND`. Zelfs met het juiste ID was het antwoord `503 MAIL_GMAIL_RUNTIME_DISABLED` (de Gmail-runtime van het oude platform is uitgeschakeld). Bevestigd met live verzoeken.
   Bovendien werd alleen platte tekst zonder opmaak verzonden. Het verzenden loopt nu via de nieuwe route `compose/send` (Gmail API `messages/send`, HTML + platte tekst, idempotent).
4. **Er waren geen concepten (drafts) op de server**: alleen `localStorage` in de browser (vertraging van 400 ms; verdwijnt bij het wissen van browsergegevens en is niet zichtbaar op een ander apparaat), en geen synchronisatie met Gmail. Nu: vertraging van 700 ms →
   PostgreSQL (`app.mail_drafts`) → Gmail `drafts.create/update`, statusweergave in het venster (opgeslagen / alleen op server / alleen in browser), herstel vanaf de server, en verwijdering van het concept na verzending.
5. **Gepland verzenden bestond niet** (alleen snooze). Nu: tabel `app.mail_queue` (migratie 0016), routes `compose/schedule|scheduled/list|cancel`, cron `mail-queue-send` elke minuut
   (`mijn-ruimte-mail-queue.timer`), `FOR UPDATE SKIP LOCKED` (wordt nooit twee keer verzonden), nieuwe pogingen met backoff tot 5 pogingen, blijvende fout → `failed`, «vastgelopen in sending >10 min» → `failed (onbekend)` zonder opnieuw
   te verzenden (om duplicaten te voorkomen). Opslag «in het geheugen» is bewust niet toegevoegd: de database is de bron van waarheid, cron draait elke minuut; geheugenopslag zou het risico op dubbele verzending geven.
6. **Ingebouwde `ai` is uitgeschakeld** (`AI_NOT_CONFIGURED`), waardoor de bestaande vertaalfunctie bij het lezen altijd 503 teruggeeft. De AI-assistent werkt nu via de **eigen Anthropic-sleutel van de gebruiker** (kluis, doel `anthropic`).

## Wat nog niet werkt of nog niet is gecontroleerd
- **Push (Pub/Sub)**: de code is aanwezig, maar in de geheimen ontbreken `GOOGLE_GMAIL_PUBSUB_TOPIC/AUDIENCE/SERVICE_ACCOUNT_EMAIL`; voor het nieuwe accounttype (grant) was push bewust uitgeschakeld (`bplus_history_fallback`).
  Deze schakelt zichzelf nu automatisch in na configuratie; zie de instructie in `deploy/MAIL-PUSH-PUBSUB.md`. Een echte push vanuit Google is **niet gecontroleerd** (vereist handelingen in Google Cloud).
- Het account in het oude platform blijft op de status `initial_sync` / `bplus_grant_waiting_initial_sync` staan (er zijn enkele cron-cycli nodig om de initiële synchronisatie af te ronden; gecontroleerd moet worden of de status naar `connected` gaat).
- Het daadwerkelijk verzenden van een e-mail vanaf productie heb ik **niet** uitgevoerd (dat is een handeling uit uw naam). Getest: MIME, concepten, wachtrij, herstelpogingen, parallelle achtergrondprocessen (25 controles met een gesimuleerde Gmail) en de AI-assistent (18 controles).
- De AI-knoppen in het opstelvenster werken alleen met uw eigen Anthropic-sleutel; zonder sleutel wordt een hint getoond. Samenvatting van een gesprek, antwoord op basis van context en toonbeoordeling zijn op de server aanwezig
  (`compose/ai/summarize|reply|tone`), maar de knoppen in het leesvenster ontbreken nog (het leesvenster is een afzonderlijke grote geminificeerde component; dit vereist een aparte stap).
- Er resteren nog 173 typefouten in de frontend (e-mailweergaven).
- Selectielimieten (`limit:`) elders in `index.ts` beperken eveneens tot de «eerste N» items; het is aan te raden ook de overige `db.list`-aanroepen voor grote tabellen na te lopen.
