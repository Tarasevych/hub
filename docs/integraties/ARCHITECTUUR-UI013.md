# UI-013 — verspreid verbindingssysteem: architectuur, oorzaken en plan (fase 1)

## Eén model (etappe B)
- **Aanbieders/posities**: `shared/integraties-catalogus.ts` (160, ongewijzigd) = enige bron van waarheid voor wat er bestaat.
- **Register**: `shared/integraties-register.ts` — per positie: `uitvoering` (werkend/basis/geen) met bewijsbestanden, officiële wijze,
  vereisten, operaties, nog te doen, beperking van de aanbieder, doeldienst, prioriteit. Inventaris: `docs/integraties/INVENTARIS.md` (gegenereerd).
- **Accounts/stand**: bestaande serverroutes, geen nieuwe tokenopslag: `POST /api/owner/admin/integraties/stand` (kluis, AI-agenten, beleid,
  laatste controles), nieuw `POST /api/owner/admin/integraties/google-stand` (alleen de canonieke Google-grant), `…/controleer`, `…/loskoppelen`.
- **Groep** (`groepVan`): fout → «Потребують уваги»; verbonden → «Підключені»; sleutel aanwezig maar niet gecontroleerd → «Потребують налаштування»;
  klaar of werkende stroom elders → «Можна підключити»; basis aanwezig → «Потребують налаштування»; anders «У розробці». Nooit «Працює».
- **Hoofdactie** (`actieVan`): Підключити / Керувати / Відновити / Налаштувати / План (in plaats van de uitgeschakelde «Скоро»).
- **Levenscyclus** (doel): Доступна → Налаштовується → Авторизується → Перевіряється → Підключена → Працює / Потребує уваги / Відключена.
  Fase 1 dekt: Доступна, Підключена (gelezen), Потребує уваги (fout), Налаштовується (sleutel zonder controle). De rest volgt met de wizard (fase 3).
- **Synchronisatie tussen tabbladen**: `BroadcastChannel('mr-integraties-stand')` — na elk vernieuwen lezen andere open catalogustabbladen opnieuw;
  het bericht bevat geen gegevens.

## Oorzaak «Стан Google-підключень не вдалося прочитати» (BUG, direct opgelost, geen vlag)
Vastgesteld uit de code (niet in productie gereproduceerd — geen toegang tot *.tarasevych.com, bewust):
1. De catalogus las de Google-stand uit `POST /api/owner/admin/diagnostics` (backend/index.ts).
2. Die route doet `Promise.all([mailPlatformStatus(), googleSuiteOnboardingSnapshot(), adminLatest(cron)])` plus een auditregel.
3. `mailPlatformStatus()` → `mailEndpointVerification()` doet **externe HTTP-probes** naar het Gmail-push- en Microsoft-webhookadres (met time-out)
   en **schrijft** in `mail_endpoint_verifications_v1`. Een time-out, een geweigerde schrijfactie (RLS/rol) of een ontbrekende tabel laat de hele
   `Promise.all` falen → HTTP 500 → de catalogus toonde «Google onleesbaar», ook als de Google-grant zelf leesbaar was.
4. Oplossing: aparte, lichte route `/api/owner/admin/integraties/google-stand` (admin.read) die alleen `googleSuiteOnboardingSnapshot()` aanroept,
   zonder externe aanroep en zonder schrijven. Faalt ook die, dan valt de pagina terug op de diagnostiek, en de melding toont nu de code
   (`GOOGLE_STAND_ONLEESBAAR` / `GOOGLE_STAND_ROUTE_FOUT`) zodat de echte oorzaak in productie zichtbaar wordt.
Niet bewezen: welk van de drie onderdelen in productie precies faalt. Dat toont de code na uitrol, of de serverlog (`[admin-integraties] google-stand`).

## Gevonden tegenstrijdigheden (audit, etappe A)
- IMAP/SMTP, iCloud Mail en Yahoo Mail hebben een **volledige** stroom (backend/mail-imap.ts: inloggen IMAP+SMTP vóór opslaan, AES-GCM, controleren,
  ontkoppelen) maar de catalogus noemde ze «Скоро». In de nieuwe weergave staan ze bij «Можна підключити» met een link naar Пошта → Акаунти.
- OneDrive/Dropbox/Box: leesadapter bestaat (cloud-verbinding-m4-*), alleen app-sleutels van de aanbieder ontbreken → «Потребують налаштування».
- Apple Calendar/Fastmail: CalDAV-lezen bestaat (backend/agenda-caldav.ts); schrijven niet.
- Nextcloud/S3: basis in cloud-integratie-routes; geen wizard/controle.
- Twee catalogi naast elkaar: admin `/mappen` (160) en cloud-vnext `AANBIEDERS` (shared/cloud-vnext-model.ts, opslag). Fase 2: cloud-vnext leest
  zijn stand uit het register i.p.v. eigen `stand`-velden.

## Geprioriteerd plan
| Prio | Wat | Afhankelijkheid |
|---|---|---|
| 1 | IMAP-stand (mail_imap) in `/integraties/stand`, zodat IMAP/iCloud/Yahoo «Підключені» kunnen worden | geen (code-only) |
| 1 | Nextcloud/WebDAV-wizard + PROPFIND-controle, S3 + ListObjectsV2-controle (testen tegen lokale WebDAV/MinIO) | geen |
| 1 | Fastmail aan de IMAP-aanbieders | geen |
| 1 | OneDrive/Dropbox/Box: wizard → bestaande kluis | app-sleutels van de eigenaar |
| 1 | Outlook-mail/agenda via Graph | Microsoft-app-registratie |
| 2 | Gedeelde `IntegratieStrook` op themapagina's (Пошта, Хмара, Фото, Агенда, ШІ, Будинок, GitHub) op dit register | — |
| 2 | Wizard: stappen Kies → Wijze → Autorisatie → Controle → Rechten → Klaar, met terug/annuleren/herstel | — |
| 2 | MQTT/Zigbee2MQTT-adapter voor Huis (testen tegen lokale broker) | broker van de eigenaar |
| 2 | Periodieke controle met frequentiegrens (cron, 1×/uur per koppeling) | — |
| 3 | WhatsApp, Instagram/Facebook, X, TikTok, Signal, iCloud Drive, HomeKit | betaald/app-review/geen publieke API (zie register) |
