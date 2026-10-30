# Inventaris integraties (UI-013, gegenereerd)

Bron: `shared/integraties-register.ts` (machineleesbaar) + `shared/integraties-catalogus.ts`. Niet met de hand bewerken: `npx tsx scripts/integraties-inventaris.ts`.

Totaal: **160** posities. Uitvoering in de code: werkend 21, basis 12, geen 127.
Groep zonder gekoppeld account: Vragen aandacht 0, Gekoppeld 0, Klaar om te koppelen 21, Instellen nodig 12, In ontwikkeling 127.

«werkend» = er bestaat een volledige stroom op een pagina van de site (koppelen, controleren, ontkoppelen). Dat is NIET hetzelfde als «getest met een echt account»: dat is in UI-013 niet gebeurd (geen echte accounts/geheimen).

Prioriteit: 1 = infrastructuur en officiële interface aanwezig, eerst doen; 2 = daarna; 3 = afhankelijk van derden (betaalde API, app-review, hardware) of geen publieke interface.

## E-mail (7)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| gmail | Gmail | klaar | werkend | Klaar om te koppelen | Google OAuth 2.0 + Gmail API | mail | 1 | — |  | `backend/google-suite-inrichting.ts` |
| outlook-mail | Outlook | binnenkort | basis | Instellen nodig | Microsoft Graph (OAuth) of IMAP met OAuth2 | mail | 1 | Microsoft-sleutels van de eigenaar, daarna controle. | Microsoft heeft gewone wachtwoorden voor IMAP uitgezet. | `backend/mail-imap.ts` `shared/mail-aanbieders.ts` |
| yahoo-mail | Yahoo Mail | binnenkort | werkend | Klaar om te koppelen | IMAP/SMTP met app-wachtwoord (OAuth alleen na partnerakkoord) | mail | 1 | Yahoo-OAuth vereist een akkoord met Yahoo. |  | `backend/mail-imap.ts` `shared/mail-aanbieders.ts` `src/mail/MailKoppelVenster.tsx` |
| icloud-mail | iCloud Mail | binnenkort | werkend | Klaar om te koppelen | IMAP/SMTP met app-specifiek wachtwoord | mail | 1 | — | Apple heeft geen OAuth voor mail. | `backend/mail-imap.ts` `shared/mail-aanbieders.ts` `src/mail/MailKoppelVenster.tsx` |
| proton-mail | Proton Mail | binnenkort | basis | Instellen nodig | Proton Mail Bridge (lokale IMAP/SMTP) | mail | 2 | Uitleg voor Bridge in de wizard. | Proton heeft geen openbare mail-API. | `backend/mail-imap.ts` `shared/mail-aanbieders.ts` `src/mail/MailKoppelVenster.tsx` |
| fastmail | Fastmail | binnenkort | basis | Instellen nodig | IMAP/SMTP + CalDAV met app-wachtwoord; JMAP | mail | 1 | Fastmail toevoegen aan de IMAP-aanbieders. |  | `backend/agenda-caldav.ts` |
| imap | IMAP / SMTP | binnenkort | werkend | Klaar om te koppelen | IMAP4rev2 (RFC 9051) + SMTP | mail | 1 | Status in de globale catalogus tonen (gedaan in UI-013, vlag). |  | `backend/mail-imap.ts` `shared/mail-aanbieders.ts` `src/mail/MailKoppelVenster.tsx` |

## Agenda en vergaderen (8)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| google-calendar | Google Calendar | klaar | werkend | Klaar om te koppelen | Google OAuth 2.0 + Calendar API | agenda | 1 | — |  | `backend/google-suite-inrichting.ts` |
| outlook-calendar | Outlook Calendar | binnenkort | basis | Instellen nodig | Microsoft Graph Calendar (OAuth) of ICS-publicatie | agenda | 1 | Graph-agenda na Microsoft-sleutels. |  | `backend/agenda-ics.ts` |
| apple-calendar | Apple Calendar | binnenkort | basis | Instellen nodig | CalDAV (RFC 4791) met app-wachtwoord | agenda | 1 | Schrijven (PUT/DELETE met If-Match). |  | `backend/agenda-caldav.ts` `backend/agenda-ics.ts` |
| calendly | Calendly | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / Webhook | agenda | 1 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| cal-com | Cal.com | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | agenda | 1 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| zoom | Zoom | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | agenda | 1 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| google-meet | Google Meet | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | agenda | 1 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| microsoft-teams | Microsoft Teams | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | agenda | 1 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Bestandsopslag (9)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| google-drive | Google Drive | klaar | werkend | Klaar om te koppelen | Google OAuth 2.0 + Drive API | cloud | 1 | — |  | `backend/google-suite-inrichting.ts` |
| google-photos | Google Photos | klaar | werkend | Klaar om te koppelen | Google Photos Picker API | foto | 1 | — | Google staat alleen handmatige keuze toe (Picker), niet de hele bibliotheek. | `backend/google-suite-inrichting.ts` |
| onedrive | OneDrive | binnenkort | basis | Instellen nodig | Microsoft Graph Files (OAuth + PKCE) | cloud | 1 | Sleutels van de eigenaar, daarna echte controle. |  | `backend/cloud-verbinding-m4-providers.ts` `backend/cloud-verbinding-m4-routes.ts` `shared/cloud-vnext-model.ts` |
| dropbox | Dropbox | binnenkort | basis | Instellen nodig | Dropbox API v2 (OAuth + PKCE) | cloud | 1 | Sleutels van de eigenaar. |  | `backend/cloud-verbinding-m4-providers.ts` `backend/cloud-verbinding-m4-routes.ts` `shared/cloud-vnext-model.ts` |
| box | Box | binnenkort | basis | Instellen nodig | Box API (OAuth 2.0) | cloud | 1 | Sleutels van de eigenaar. |  | `backend/cloud-verbinding-m4-providers.ts` `backend/cloud-verbinding-m4-routes.ts` `shared/cloud-vnext-model.ts` |
| icloud-drive | iCloud Drive | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | Apple heeft geen openbare API voor iCloud Drive. |  |
| nextcloud | Nextcloud | binnenkort | basis | Instellen nodig | WebDAV + Login Flow v2 (app-wachtwoord) | cloud | 1 | Koppelwizard en PROPFIND-controle. |  | `backend/cloud-integratie-routes.ts` `backend/cloud-overdracht-m3-providers.ts` |
| mega | MEGA | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | cloud | 1 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| s3 | S3-сумісне сховище | binnenkort | basis | Instellen nodig | S3 API (Signature V4, toegangssleutel) | cloud | 1 | Wizard en ListObjectsV2-controle. |  | `backend/cloud-integratie-routes.ts` `backend/cloud-m9-xml.ts` |

## Communicatie (8)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| telegram | Telegram | klaar | werkend | Klaar om te koppelen | Telegram Bot API (token) | api | 2 | — |  | `backend/api-platform-verbindingen.ts` |
| slack | Slack | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / Webhook | api | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| discord | Discord | binnenkort | geen | In ontwikkeling | Webhook / API-sleutel | api | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| whatsapp | WhatsApp Business | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | WhatsApp Business API nodig (Meta, betaald, bedrijfsverificatie). |  |
| signal | Signal | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | Signal heeft geen officiële API voor derde apps. |  |
| matrix | Matrix | binnenkort | geen | In ontwikkeling | API-sleutel | api | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mattermost | Mattermost | binnenkort | geen | In ontwikkeling | Webhook / API-sleutel | api | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| twilio | Twilio | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | api | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## AI-agenten en modellen (13)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| claude | Claude | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |
| chatgpt | ChatGPT | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |
| grok | Grok | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |
| gemini | Gemini | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |
| copilot | GitHub Copilot | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |
| cursor | Cursor | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |
| anthropic-api | Anthropic API (BYOK) | klaar | werkend | Klaar om te koppelen | Anthropic API (sleutel) | ai | 2 | — |  | `backend/api-platform-verbindingen.ts` |
| openai-api | OpenAI API | binnenkort | geen | In ontwikkeling | API-sleutel | ai | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mistral | Mistral AI | binnenkort | geen | In ontwikkeling | API-sleutel | ai | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| perplexity | Perplexity | binnenkort | geen | In ontwikkeling | API-sleutel | ai | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| huggingface | Hugging Face | binnenkort | geen | In ontwikkeling | API-sleutel | ai | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| ollama | Ollama | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | ai | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mcp-server | Власний MCP-клієнт | klaar | werkend | Klaar om te koppelen | MCP (Model Context Protocol) + OAuth | ai | 2 | — |  | `backend/connector-v2-opslag.ts` `shared/connector-v2/agenten.ts` |

## Code en ontwikkeling (8)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| github | GitHub | klaar | werkend | Klaar om te koppelen | GitHub OAuth App / fine-grained token | github | 2 | — |  | `backend/api-platform-verbindingen.ts` |
| gitlab | GitLab | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| bitbucket | Bitbucket | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| gitea | Gitea | binnenkort | geen | In ontwikkeling | API-sleutel | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| codeberg | Codeberg | binnenkort | geen | In ontwikkeling | API-sleutel | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| sentry | Sentry | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| npm | npm | binnenkort | geen | In ontwikkeling | API-sleutel | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| docker-hub | Docker Hub | binnenkort | geen | In ontwikkeling | API-sleutel | github | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## CI/CD en infrastructuur (6)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| github-actions | GitHub Actions | binnenkort | geen | In ontwikkeling | Webhook / API-sleutel | github | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| circleci | CircleCI | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | github | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| jenkins | Jenkins | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | github | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| argocd | Argo CD | binnenkort | geen | In ontwikkeling | API-sleutel | github | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| terraform | Terraform | binnenkort | geen | In ontwikkeling | API-sleutel | github | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| ansible | Ansible | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | github | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Cloud en hosting (10)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| aws | Amazon Web Services | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| google-cloud | Google Cloud | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| azure | Microsoft Azure | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| cloudflare | Cloudflare | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| vercel | Vercel | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| netlify | Netlify | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| digitalocean | DigitalOcean | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| hetzner | Hetzner | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| fly | Fly.io | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| heroku | Heroku | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Databases (9)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| postgresql | PostgreSQL | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mysql | MySQL | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mongodb | MongoDB | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| redis | Redis | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| supabase | Supabase | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| firebase | Firebase | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| elasticsearch | Elasticsearch | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| bigquery | BigQuery | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| snowflake | Snowflake | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Analyse en monitoring (9)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| google-analytics | Google Analytics | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| plausible | Plausible | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| matomo | Matomo | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mixpanel | Mixpanel | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| posthog | PostHog | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| grafana | Grafana | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| prometheus | Prometheus | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| datadog | Datadog | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| uptime-kuma | Uptime Kuma | binnenkort | geen | In ontwikkeling | Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## CRM en verkoop (4)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| hubspot | HubSpot | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| salesforce | Salesforce | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| pipedrive | Pipedrive | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| zoho | Zoho CRM | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Betalen en boekhouding (6)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| stripe | Stripe | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| paypal | PayPal | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mollie | Mollie | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| wise | Wise | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| quickbooks | QuickBooks | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| xero | Xero | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Sociale media (9)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| x-twitter | X (Twitter) | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | De X-API is betaald. |  |
| facebook | Facebook | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | App-review door Meta nodig. |  |
| instagram | Instagram | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | Meta staat de API alleen toe voor bedrijfsaccounts na app-review. |  |
| linkedin | LinkedIn | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| youtube | YouTube | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| tiktok | TikTok | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | App-review door TikTok nodig. |  |
| mastodon | Mastodon | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| bluesky | Bluesky | binnenkort | geen | In ontwikkeling | API-sleutel | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| reddit | Reddit | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Slim huis (9)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| home-assistant | Home Assistant | klaar | werkend | Klaar om te koppelen | Home Assistant REST/WebSocket (long-lived token) | huis | 2 | — |  | `backend/api-platform-verbindingen.ts` `backend/huis-adapter-home-assistant.ts` |
| philips-hue | Philips Hue | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| google-home | Google Home | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| homekit | Apple Home | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | huis | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. | HomeKit werkt alleen op Apple-apparaten (geen cloud-API). |  |
| mqtt | MQTT | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| zigbee2mqtt | Zigbee2MQTT | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| tuya | Tuya | binnenkort | geen | In ontwikkeling | API-sleutel | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| shelly | Shelly | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| sonos | Sonos | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | huis | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Beveiliging en identiteit (9)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| google-signin | Вхід через Google (SSO) | klaar | werkend | Klaar om te koppelen | OpenID Connect | admin | 2 | — |  | `backend/index.ts` |
| entra | Microsoft Entra ID | instellen | basis | Instellen nodig | Microsoft Graph (directory) | admin | 2 | Echte gebruikerssynchronisatie. |  | `backend/index.ts` |
| scim | SCIM 2.0 (вхідна синхронізація) | instellen | basis | Instellen nodig | SCIM 2.0 | admin | 2 | Echte gebruikerssynchronisatie. |  | `backend/index.ts` |
| okta | Okta | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / SCIM 2.0 | admin | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| auth0 | Auth0 | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | admin | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| keycloak | Keycloak | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | admin | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| onepassword | 1Password | binnenkort | geen | In ontwikkeling | API-sleutel | admin | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| bitwarden | Bitwarden | binnenkort | geen | In ontwikkeling | API-sleutel | admin | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| vault | HashiCorp Vault | binnenkort | geen | In ontwikkeling | API-sleutel | admin | 2 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Documenten en notities (8)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| notion | Notion | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| google-docs | Google Docs | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| google-sheets | Google Sheets | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| confluence | Confluence | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| obsidian | Obsidian | binnenkort | geen | In ontwikkeling | Handmatig / standaardprotocol | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| evernote | Evernote | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| airtable | Airtable | binnenkort | geen | In ontwikkeling | API-sleutel / OAuth 2.0 (+PKCE) | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| onenote | OneNote | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | cloud | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Projecten en taken (8)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| trello | Trello | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| asana | Asana | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| jira | Jira | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| linear | Linear | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| monday | monday.com | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| clickup | ClickUp | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| todoist | Todoist | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| figma | Figma | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Automatisering en API (7)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| webhooks | Вебхуки (вхідні) | binnenkort | geen | In ontwikkeling | Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| rest-api | REST API і токени | klaar | werkend | Klaar om te koppelen | REST + OAuth-clients van deze site | api | 2 | — |  | `backend/index.ts` |
| oauth-clients | OAuth-застосунки | klaar | werkend | Klaar om te koppelen | REST + OAuth-clients van deze site | api | 2 | — |  | `backend/index.ts` |
| zapier | Zapier | binnenkort | geen | In ontwikkeling | Webhook / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| make | Make | binnenkort | geen | In ontwikkeling | Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| n8n | n8n | binnenkort | geen | In ontwikkeling | Webhook / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| ifttt | IFTTT | binnenkort | geen | In ontwikkeling | Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Klantenservice (3)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| zendesk | Zendesk | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| intercom | Intercom | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| freshdesk | Freshdesk | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Media en muziek (4)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| spotify | Spotify | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| plex | Plex | binnenkort | geen | In ontwikkeling | API-sleutel | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| jellyfin | Jellyfin | binnenkort | geen | In ontwikkeling | API-sleutel | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| youtube-music | YouTube Music | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) | foto | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |

## Websites en webshops (6)

| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |
|---|---|---|---|---|---|---|---|---|---|---|
| wordpress | WordPress | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| shopify | Shopify | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| woocommerce | WooCommerce | binnenkort | geen | In ontwikkeling | API-sleutel / Webhook | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| mailchimp | Mailchimp | binnenkort | geen | In ontwikkeling | OAuth 2.0 (+PKCE) / API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| sendgrid | SendGrid | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
| brevo | Brevo | binnenkort | geen | In ontwikkeling | API-sleutel | api | 3 | Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests. |  |  |
