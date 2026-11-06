> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261030-AANMELD-UI015.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261030-AANMELD-UI015.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# UI-015 "Aanmeldmethoden" (Aanmeldmethoden vNext) — 30-10-2026

Featureflag: `aanmeldmethoden-vnext` (migratie `0198` — alleen de rij voor de vlag, uitgeschakeld). AAN → nieuwe
pagina `id.tarasevych.com/aanmeldmethoden` (tabblad "Aanmeldmethoden"); UIT → oud formulier zonder enige wijziging.
De tabbladen "Beveiliging" en "Herstel" blijven in beide standen op het bestaande formulier — deeplinks
(`#aanmeldmethoden-2fa`, `…-herstel`, `…-passkeys`, `…-sleutelkluis`, `…-google`) werken en openen het detailpaneel.

## Wat is het

Een volledige herziening van de pagina volgens bestek UI-015: hero-banner zonder verzonnen cijfers, gegroepeerde methodekaarten
(Aanmelden / Passkey / Bescherming / Toegang voor anderen) met één hoofdactie per kaart, zoeken en filterchips, contextuele
detailpanelen (zijpaneel op breed scherm, volledig scherm op telefoon) en een eerlijke catalogus van toekomstige
providers. Nul wijzigingen in de beveiligingsmechanismen: dezelfde controllerlogica (`ToegangslaagWeergave`), dezelfde
API-routes, step-up, lockout-bescherming en versleuteling.

## Belangrijkste eigenschappen

- **De UI verzint nooit een status**: elke kaart komt uit `/api/owner/access/snapshot` of uit de live statusroute;
  "Gekoppeld" zonder serverbevestiging bestaat niet; er zijn geen beveiligingspercentages.
- **Bestaande stromen worden hergebruikt**: passkeys, herstelcodes, TOTP, wachtwoord, sleutelkluis, vertrouwde apparaten
  en sessies gebruiken dezelfde sectiecomponenten binnen de detailpanelen; het TOTP-geheim is alleen zichtbaar in het detailpaneel.
- **Het laatste werkende aanmeldpad is beschermd** tegen uitschakelen — met toelichting op de kaart (`beschermd`).
- **Echte ketens voor nieuwe aanbieders (backend zit al in de code, wordt geactiveerd met sleutels van de eigenaar)**:
  - Microsoft, Discord: OAuth2 code stroom + PKCE S256, eenmalige `state` (TTL 10 min, wordt verbrand VÓÓR de tokenuitwisseling),
    verificatie van `id_token`-handtekening via JWKS (`iss`/`aud`/`exp`/`nonce`) of `/users/@me`;
  - Telegram: Login Widget met server-side controle van HMAC-SHA256 en versheid van `auth_date` (≤10 min);
  - Apple: client geheim = ES256-JWT uit p8-sleutel (vereist een betaald Apple Developer-account);
  - koppeling UITSLUITEND aan het reeds ingelogde account (geen nieuwe accounts via deze paden), gemaskeerde etiketten,
    audit van elke stap en rate-limiting.
- **Weergaveregel (bestek §4) nageleefd**: de knop "Koppelen" verschijnt pas wanneer de server `klaarVoorKoppeling`
  teruggeeft (alle sleutels van de eigenaar zijn aanwezig ÉN de zelftest van de keten is geslaagd). Tot dat moment toont de kaart eerlijk
  de lijst met VEREISTE sleutels (alleen de namen, nooit de waarden) en de status van de zelftest.
- **Eerlijke grenzen**: inloggen VIA een nieuwe koppeling (sessie-uitgifte) is gepland (nu: koppeling als aanvullende
  methode); WhatsApp is onmogelijk (geen publieke consumer-login API; de kaart vermeldt dit direct, met een omweg);
  SMS is gepland (vereist een betaalde sms-provider). Geen namaak-monogrammen van merklogo's.
- **Responsiviteit**: 320–1920, gecontroleerd op 7 breedtes × licht/donker, zonder horizontale scroll;
  het detailpaneel opent op ≤599px schermvullend (portal in `body`, scroll-lock, focus-trap, Esc).

## Nieuwe routes (alles onder de eigenaarsessie, vaste lijst met diensten)

- `POST /api/owner/aanmeld/vnext/aanbieders` — live status van 6 aanbieders (sleutelnamen, zelftest, `gekoppeld`).
- `POST /api/owner/aanmeld/vnext/zelftest { id }` — alleen-lezen zelftest van de eigen keten + audit.
- `POST /api/owner/aanmeld/vnext/start { id }` — authorize-URL (of parameters voor de Telegram-widget); 409 zonder
  `klaarVoorKoppeling`.
- `GET /api/aanmeld/koppel/:aanbieder/terug` — callback: `state`+PKCE / HMAC / `id_token` → koppeling + gebeurtenis.
- `POST /api/owner/aanmeld/vnext/ontkoppel { id }` — ontkoppelen (met step-up, het laatste pad blijft onaangeroerd).

Collecties: `aanmeld_koppelingen_v1` (`ownerUserId`, `aanbieder`, `subject`, gemaskeerd etiket),
`aanmeld_states_v1` (eenmalige toestanden, TTL), `aanmeld_zelftest_v1`. Omgevingsvariabelen:
`AANMELD_MICROSOFT_CLIENT_ID`/`_CLIENT_SECRET`, `AANMELD_DISCORD_CLIENT_ID`/`_CLIENT_SECRET`,
`AANMELD_TELEGRAM_BOT_TOKEN`/`_BOT_NAAM`, `AANMELD_APPLE_CLIENT_ID`/`_TEAM_ID`/`_KEY_ID`/`_PRIVATE_KEY`
(+ `AANMELD_<ID>_BASIS` en `AANMELD_TERUG_BASIS` uitsluitend voor testomgevingen).

## Tests

- Unit: `aanmeld-koppel-20261030` (64) — volledige ketens tegen een nagebouwde aanbieder (PKCE, JWKS, ES256,
  HMAC, anti-replay van `state`, maskering); `aanmeld-ui-20261030` (105) — kaartmapper, contract, eerlijkheid van statussen.
- E2E `aanmeldmethoden-vnext` (37): vlag uit/aan; eerlijke kaarten; details met echte secties;
  TOTP `start→confirm→disable` via de ECHTE step-up-dialoog (RFC-6238 in de test, anti-replay van de server
  gerespecteerd); catalogus zonder knop vóór de zelftest; volledige Microsoft-koppelcyclus met PKCE-bewijs;
  zoeken/groepen; `nl`; 7 schermbreedtes × 2 thema's; nul onverwachte fouten.
- Regressie op deze basis: `afstemming` 44, `cloud` 50, `huis` 49, `notities` 39, `agenda` 101 — groen.

## Terugdraaien

Schakel de vlag uit (of pas migratie 0198 niet toe) → oude pagina. De nieuwe routes zijn zonder de vlag
onschadelijk: ze wijzigen de bestaande aanmeldstromen niet. Collecties zijn append/idempotent — verwijderen is veilig.
