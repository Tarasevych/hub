> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./MAIL-PUSH-PUBSUB.uk.md) · **🇳🇱 Nederlands** ([origineel](./MAIL-PUSH-PUBSUB.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Gmail push-synchronisatie via Google Cloud Pub/Sub

Status op 07-10-2026: de push-code **is aanwezig** (`backend/index.ts`: `mailGoogleWatch`, `mailGooglePush`, controle van de JWT-handtekening, route
`POST /api/owner/mail/google/pubsub/push`), maar op de server zijn drie geheimen **nog niet ingesteld**, waardoor het systeem op de terugvaloptie draait
(Gmail-geschiedenis + controle elke 15 minuten, cron `mail-provider-maintenance`). Voor een account met de nieuwe toestemming
(`google_oauth_grant_v1`) wordt push nu automatisch ingeschakeld zodra de geheimen aanwezig zijn (`mailPushConfigured()`); tot die tijd verandert er niets.

Alles in de Google Cloud Console wordt door de eigenaar uitgevoerd (uw Google-account is vereist; deel geen wachtwoord of tokens met mij).

## 1. API's inschakelen
In het project waarin de OAuth-client `google_suite_web_oauth_client` is aangemaakt: **APIs & Services → Library**: schakel **Gmail API** en **Cloud Pub/Sub API** in.
Controleer de OAuth-toestemming: scope `https://www.googleapis.com/auth/gmail.modify` (dekt lezen, archiveren, concepten en watch), `gmail.send`, `gmail.labels`.
Volledige toegang `https://mail.google.com/` is **niet nodig** en wordt afgeraden (ruimer dan nodig).

## 2. Pub/Sub-onderwerp (Topic)
Pub/Sub → **Topics → Create topic**: bijvoorbeeld `gmail-push`. Volledige naam: `projects/<PROJECT_ID>/topics/gmail-push`.
Geef Gmail het recht om te publiceren: kies in het topic **Permissions → Add principal** `gmail-api-push@system.gserviceaccount.com`, rol **Pub/Sub Publisher**.

## 3. Push-abonnement (Subscription)
Pub/Sub → **Subscriptions → Create**: topic `gmail-push`, **Delivery type = Push**, endpoint:
`https://mail.tarasevych.com/api/owner/mail/google/pubsub/push`.
Schakel **Authentication** (OIDC-token) in: selecteer of maak een service account aan (bijvoorbeeld `gmail-push-sender@<PROJECT_ID>.iam.gserviceaccount.com`),
**Audience** = exact `https://mail.tarasevych.com/api/owner/mail/google/pubsub/push`.
Google vereist dat het service account de rol **Service Account Token Creator** heeft voor de Pub/Sub-serviceagent (de Console geeft dit aan).

## 4. Geheimen op de server
Voeg toe aan `/etc/mijn-ruimte/geheimen.env` (script `deploy/geheimen-aanvullen.sh`, de waarden voert u zelf in):

```
GOOGLE_GMAIL_PUBSUB_TOPIC=projects/<PROJECT_ID>/topics/gmail-push
GOOGLE_GMAIL_PUBSUB_AUDIENCE=https://mail.tarasevych.com/api/owner/mail/google/pubsub/push
GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL=gmail-push-sender@<PROJECT_ID>.iam.gserviceaccount.com
```

Voer daarna `sudo systemctl restart mijn-ruimte` uit. Cloudflare mag verzoeken van Google op dit pad niet blokkeren (WAF/Bot Fight: maak een Skip-regel voor `/api/owner/mail/google/pubsub/push`).

## 5. Controle
- Binnen 5 minuten maakt cron de taak `provider.watch.renew` aan; in `app.records` (`tbl='mail_subscriptions_v2'`) verschijnt een record met `status=active` en `expiresAt` (een watch is 7 dagen geldig en wordt elke 12 uur vóór afloop vernieuwd).
- Stuur uzelf een e-mail: in het logboek `journalctl -u mijn-ruimte` moet `POST mail.tarasevych.com /api/owner/mail/google/pubsub/push 200` verschijnen, en de synchronisatie loopt binnen enkele seconden in plaats van na 15 minuten.
- De terugvaloptie (elke 15 min) blijft actief als vangnet.

## Wat ik NIET heb gecontroleerd
Een echte push vanuit Google (vereist stap 1–4 in uw Google Cloud). Alleen gecontroleerd dat er zonder configuratie niets verandert en dat de synchronisatie werkt (zie `deploy/MAIL-AUDIT-20261007.md`).
