# Meting van de hoofdroutes (lokale bouw, uitgave 20261110-141448)

Basisvastlegging: `b0d69f8d`. Lokale server, Chrome met host-omleiding naar 127.0.0.1; de echte site is niet aangeroepen.
Twee standen: **met** de brede regel `max-width:100%` in `mobiel.css` (zoals in de uitgave), en **zonder** die ene regel (alleen een CSS-overschrijving uit `dist`, geen wijziging van de productcode).
Schermen: **412×915** (telefoon) en **1280×800**. Geheugen = hoogste RSS van het Chrome-rendererproces (MB). Lay-outtijd en -aantal uit CDP `Performance.getMetrics`. Stabiel = eerste moment waarop `LayoutCount` twee seconden onveranderd bleef.

## Routes uit de router (alle tabbladen)

Uit `public/canonical-service.js`. Gemeten zijn de hoofdroutes (standaardpagina's, alle zichtbare agenten-hashes, en de onderscheidende pagina's). Tabbladen van dezelfde schil (bijvoorbeeld alle mappen van de post naast inbox/instellingen/contacten) zijn hieronder wél genoemd, maar niet elk afzonderlijk gemeten.

- **hub**: `overview`, `recent`, `tasks`, `calendar`, `notes`, `zoek`, `photos`
- **ai**: `workspace`, `agents`, `runs`, `workflows`, `verbindingen`
- **mail**: `inbox`, `starred`, `snoozed`, `sent`, `drafts`, `archive`, `labels`, `accounts`, `local`, `unread`, `all`, `important`, `spam`, `trash`, `subscriptions`, `scheduled`, `settings`, `contacts`
- **cloud**: `overview`, `files`, `workspaces`, `capture`, `inbox`, `search`, `recent`, `calendar`, `photos`, `accounts`, `google`, `onedrive`, `dropbox`
- **github**: `overview`, `repositories`, `projects`, `documentation`, `research`, `accounts`, `activity`
- **huis**: `overview`, `rooms`, `devices`, `scenes`, `automations`, `security`, `energy`, `activity`, `integrations`, `assistant`, `settings`, `showroom`, `planner`
- **identity**: `personalization`, `menu`, `themes`, `languages`, `widgets`, `sharing`, `identity`, `account`, `sessions`, `methods`, `security`, `recovery`
- **api**: `verbindingen`, `vault`, `access`, `reconciliation`
- **admin**: `overview`, `access`, `ai`, `contour`, `updates`, `apps`, `devices`, `sso`, `directories`, `roles`, `diagnostics`, `audit`
- **mcp**: `overview`, `dashboard`, `services`, `tools`, `board`, `agents`, `apps`, `playground`, `traffic`, `connect`, `roadmap`, `download`, `verbindingen`
- **agenten** (pad `/agenten` op mcp): `#overzicht`, `#connectors`, `#ai`, `#extern`, `#orch`, `#extensie`, `#browser`, `#apparaten`, `#tokens`, `#toegang`, `#journaal`
- **aanmelden**: `https://id.tarasevych.com/`

Aantal voltooide metingen in deze run: **180**.

## Zwaarste routes op 412 px MET de regel

| Route | Max. RSS (MB) | Lay-out (s) | Aantal lay-outs | Stabiel (ms) | Afgebroken |
|---|---:|---:|---:|---:|---|
| `agenten-connectors` | 3727 | 7.659 | 13 | — | grens 2800 MB na 8142 ms |
| `agenten-toegang` | 3623 | 4.754 | 12 | — | grens 2800 MB na 9229 ms |
| `ai-verbindingen` | 3510 | 6.91 | 19 | — | grens 2800 MB na 9527 ms |
| `agenten-overzicht` | 3444 | 6.654 | 10 | — | grens 2800 MB na 7209 ms |
| `agenten-orch` | 3386 | 2.782 | 10 | — | grens 2800 MB na 7166 ms |
| `agenten-apparaten` | 3379 | 0.252 | 7 | — | grens 2800 MB na 8639 ms |
| `agenten-ai` | 3371 | 8.577 | 14 | — | grens 2800 MB na 11174 ms |
| `agenten-tokens` | 3352 | — | — | — | grens 2800 MB na 8084 ms |
| `mcp-overzicht` | 3345 | 7.78 | 16 | — | grens 2800 MB na 8400 ms |
| `agenten-extern` | 3276 | 6.066 | 12 | — | grens 2800 MB na 6432 ms |
| `agenten-browser` | 3242 | 6.3 | 10 | — | grens 2800 MB na 6982 ms |
| `agenten-extensie` | 3089 | 4.938 | 11 | — | grens 2800 MB na 7303 ms |
| `agenten-journaal` | 2941 | 3.673 | 10 | — | grens 2800 MB na 8085 ms |
| `mail-accounts` | 262 | 0.067 | 10 | 1555 | — |
| `mail-inbox` | 258 | 0.045 | 9 | 1035 | — |

## Overlooprisico op 412 px ZONDER de regel

Dit moet de veilige vervanging blijven beschermen. Opmerking: in dezelfde mediaquery staat ook `html, body { overflow-x: hidden }`, waardoor de pagina géén horizontale schuifbalk toont, ook als inhoud rechts wordt afgesneden. Daarom kijken we naar elementen waarvan de rechterrand verder reikt dan het scherm (niet in een bedoelde horizontale scroller).

Drie klassen: **echt** (rechterrand voorbij het scherm — dit moet beschermd blijven), **pad** (alleen SVG-`path` in de zijbalk, meestal geen visuele overloop van de pagina), **twijfel** (element nog op het scherm, maar buiten een afgeknipt ouder).

### Echte overloop (beschermen)

| Route | scrollWidth | binnenbreedte | Pagina-overloop | Elementen voorbij het scherm |
|---|---:|---:|---|---|
| `mail-instellingen` | 412 | 412 | nee (afgesneden) | `strong.` 349–504 px, `span.` 349–470 px, `input.` 349–470 px, `small.` 349–470 px |

### Geen pagina-overloop, wel getelde elementen

| Route | Klasse | Toelichting |
|---|---|---|
| `identity-account` | pad | 11 SVG-`path` links in de schil (rond 50–75 px), pagina `scrollWidth`=412 |
| `account-beveiliging` | pad | 11 SVG-`path` links in de schil (rond 50–75 px), pagina `scrollWidth`=412 |
| `account-sessies` | pad | 11 SVG-`path` links in de schil (rond 50–75 px), pagina `scrollWidth`=412 |
| `account-methoden` | pad | 11 SVG-`path` links in de schil (rond 50–75 px), pagina `scrollWidth`=412 |
| `account-personalisatie` | pad | 11 SVG-`path` links in de schil (rond 50–75 px), pagina `scrollWidth`=412 |
| `aanmelden` | twijfel | `span.canonical-account-avatar.avatar-hero` 351–395 px |


## Volledige tabel

| Route | 412 met RSS | 412 met lay-out (s) | 412 met stabiel (ms) | 412 zonder RSS | 412 zonder lay-out (s) | 412 zonder overloop | 1280 met RSS | 1280 zonder RSS |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| `hub-overzicht` | 185 | 0.051 | 1037 | 185 | 0.045 | nee | 206 | 216 |
| `agenten-overzicht` | 3444 | 6.654 | — | 206 | 0.09 | nee | 232 | 238 |
| `agenten-connectors` | 3727 | 7.659 | — | 224 | 0.083 | nee | 253 | 258 |
| `agenten-ai` | 3371 | 8.577 | — | 236 | 0.114 | nee | 256 | 259 |
| `agenten-extern` | 3276 | 6.066 | — | 234 | 0.107 | nee | 257 | 260 |
| `agenten-orch` | 3386 | 2.782 | — | 248 | 0.132 | nee | 269 | 272 |
| `agenten-extensie` | 3089 | 4.938 | — | 240 | 0.133 | nee | 273 | 276 |
| `agenten-browser` | 3242 | 6.3 | — | 244 | 0.126 | nee | 283 | 276 |
| `agenten-apparaten` | 3379 | 0.252 | — | 320 | 0.496 | nee | 274 | 289 |
| `agenten-tokens` | 3352 | — | — | 486 | 1.57 | nee | 282 | 286 |
| `agenten-toegang` | 3623 | 4.754 | — | 437 | 0.913 | nee | 287 | 286 |
| `agenten-journaal` | 2941 | 3.673 | — | 248 | 0.118 | nee | 286 | 288 |
| `hub-recent` | 166 | 0.033 | 1039 | 166 | 0.033 | nee | 176 | 175 |
| `hub-taken` | 162 | 0.032 | 1057 | 162 | 0.031 | nee | 170 | 169 |
| `hub-agenda` | 176 | 0.059 | 1038 | 175 | 0.059 | nee | 187 | 183 |
| `hub-notities` | 161 | 0.037 | 1040 | 161 | 0.034 | nee | 168 | 169 |
| `hub-zoek` | 166 | 0.052 | 1049 | 166 | 0.075 | nee | 175 | 175 |
| `hub-fotos` | 160 | 0.022 | 1034 | 159 | 0.025 | nee | 172 | 172 |
| `ai-werkruimte` | 172 | 0.05 | 1564 | 172 | 0.053 | nee | 190 | 187 |
| `ai-agenten` | 170 | 0.037 | 1039 | 168 | 0.04 | nee | 183 | 183 |
| `ai-verbindingen` | 3510 | 6.91 | — | 252 | 0.129 | nee | 286 | 287 |
| `mail-inbox` | 258 | 0.045 | 1035 | 245 | 0.05 | nee | 273 | 269 |
| `mail-accounts` | 262 | 0.067 | 1555 | 252 | 0.064 | nee | 280 | 283 |
| `mail-instellingen` | 230 | 0.142 | 1565 | 224 | 0.12 | echt (4) | 241 | 241 |
| `mail-contacten` | 191 | 0.045 | 1558 | 190 | 0.041 | nee | 209 | 208 |
| `mail-opstellen` | 257 | 0.049 | 1561 | 240 | 0.053 | nee | 266 | 266 |
| `cloud-overzicht` | 174 | 0.046 | 1556 | 174 | 0.05 | nee | 196 | 196 |
| `cloud-bestanden` | 174 | 0.049 | 1038 | 173 | 0.049 | nee | 197 | 197 |
| `cloud-accounts` | 175 | 0.063 | 1561 | 174 | 0.044 | nee | 197 | 197 |
| `github-overzicht` | 170 | 0.03 | 1037 | 168 | 0.032 | nee | 187 | 186 |
| `huis-overzicht` | 169 | 0.032 | 1039 | 165 | 0.034 | nee | 185 | 181 |
| `huis-kamers` | 168 | 0.029 | 1035 | 167 | 0.031 | nee | 182 | 182 |
| `huis-apparaten` | 167 | 0.033 | 1039 | 167 | 0.037 | nee | 181 | 182 |
| `huis-instellingen` | 167 | 0.032 | 1038 | 167 | 0.03 | nee | 180 | 182 |
| `huis-vitrine` | 168 | 0.033 | 1058 | 167 | 0.034 | nee | 181 | 181 |
| `identity-account` | 212 | 0.089 | 1557 | 197 | 0.071 | pad (11) | 216 | 215 |
| `account-beveiliging` | 209 | 0.092 | 1564 | 195 | 0.066 | pad (11) | 211 | 212 |
| `account-sessies` | 216 | 0.127 | 1566 | 201 | 0.095 | pad (11) | 221 | 220 |
| `account-methoden` | 211 | 0.083 | 1555 | 196 | 0.072 | pad (11) | 216 | 216 |
| `account-personalisatie` | 210 | 0.09 | 1561 | 195 | 0.074 | pad (11) | 215 | 216 |
| `api-toegang` | 166 | 0.027 | 1040 | 166 | 0.033 | nee | 183 | 184 |
| `admin-overzicht` | 167 | 0.029 | 1041 | 167 | 0.029 | nee | 188 | 184 |
| `admin-ai` | 167 | 0.03 | 1041 | 166 | 0.031 | nee | 184 | 184 |
| `mcp-overzicht` | 3345 | 7.78 | — | 225 | 0.104 | nee | 260 | 268 |
| `aanmelden` | 164 | 0.036 | 1038 | 165 | 0.032 | twijfel (1) | 178 | 179 |

## Toelichting bij de meting

- Op 412×915 **met** de regel ontploft het geheugen alleen op zware pagina's: alle elf tabbladen van «Agenten», plus `ai-verbindingen` en `mcp-overzicht`. Die laatste opent feitelijk `/agenten` (zelfde schil). De renderer overschreed de veiligheidsgrens van 2800 MB na 6–11 s (hoogste waarneming 3727 MB) en werd toen gestopt; de piek op een echte telefoon kan nog hoger liggen (eerder 3,5–7 GB). Tot een stabiele lay-out is het daar niet gekomen. Bij `agenten-tokens` ontbraken de CDP-cijfers onder die druk.
- Dezelfde routes **zonder** die ene regel blijven licht: typisch 200–250 MB, `agenten-tokens` 486 MB, stabiel binnen 1–3,5 s, lay-out meestal onder 0,2 s (tokens 1,57 s).
- Overige hoofdroutes (hub, post, wolk, huis, github, identiteit, admin, aanmelden, `ai-werkruimte`) blijven op 412 px met de regel rond 160–260 MB — vergelijkbaar met de stand zonder regel. De regel is globaal, de ontploffing is dat niet: ze doet zich voor waar de DOM zwaar is.
- Op 1280×800 grijpt `@media (max-width:700px)` niet in. RSS blijft 180–280 MB, met of zonder regel, geen afgebroken meting.
- `hub-overzicht` op 412 px «met» komt uit de korte proef (5 s in plaats van 10 s); de lay-out was al na 1 s stabiel bij 185 MB.
- Huis-pagina's zijn gemeten op de basis 141448, **zonder** de samenvoeging van verzoek №61.
- Niet elk tabblad van de router is afzonderlijk gemeten (bijvoorbeeld alle postmappen, alle admin-rubrieken): die delen dezelfde schil als de gemeten hoofdpagina van die dienst.
- De echte site is niet geladen. Er is niet op een fysieke telefoon gemeten. DevTools-opnamen zijn niet gebruikt (die bevroren eerder de lokale browser).

Ruwe reeksen: `ruw/reeksen.jsonl`. Ruwe rijen: `ruw/resultaat.json`. Grafiek: `METING-ROUTES.png`.
