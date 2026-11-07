> 🌐 **Taal / Мова:** [Українська](ПРОЄКТ-ОБЛІКОВИХ-ЗАПИСІВ-І-БЕЗПЕКИ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Ontwerp: accounts, identiteiten en beveiliging

Status: vastgesteld door de eigenaar (2026-10-03). Fase 1 is gebouwd op branch `auth-fase-1`
(lokaal, niet uitgerold).

## 1. Basisbegrippen

**Account** — een willekeurige UUID (`users.id`). Het "kent" geen e-mailadres of telefoon; e-mail
is een eigenschap, geen sleutel.

**Login-identiteiten** — Google, Microsoft, Apple, e-maillink, telefoon (sms), passkey, wachtwoord.
Elke identiteit is een paar *(aanbieder, subject)*, bijvoorbeeld `(google, 1234567890)`. **Eén
identiteit hoort bij precies één account.** Eén account kan meerdere inlogmethoden hebben.

**Gekoppelde diensten** — geen inlogmethoden maar bronnen waarmee een account werkt: meerdere
mailboxen, drives, AI-agents, slim huis enz. Eenzelfde mailbox kan door meerdere accounts gedeeld
worden **alleen met bevestiging van de mailboxeigenaar** en met meldingen aan iedereen die toegang
heeft.

**Meerdere accounts per persoon** mag (bijv. werk en privé). Samenvoegen gebeurt **alleen
expliciet**: het systeem mag het voorstellen, maar beide kanten moeten bevestigen (aangemeld in
beide accounts). **Nooit stil samenvoegen op e-mailadres.**

## 2. Twee dataklassen

**Klasse 1 — persoonlijk, gesloten** (notities, privédocumenten, kluis).
- Versleuteld op het apparaat van de gebruiker met een persoonlijke datasleutel.
- Kopieën van die sleutel worden "ingepakt" (wrapped) bewaard onder: wachtwoord, apparaatsleutel,
  passkey, herstelcode.
- **De beheerder kan ze niet lezen** — de server ziet alleen versleutelde tekst.
- Minimaal **twee herstelmethoden** verplicht, anders kunnen de gegevens voorgoed verloren gaan.
- Optioneel (opt-in): "escrow" — een vertrouwd persoon krijgt een ingepakte kopie van de sleutel.

**Klasse 2 — dienstgegevens** (mail, bestanden, agenda, zoekindexen).
- Server-side versleuteld met per-gebruiker envelopsleutels, ingepakt door een hoofdsleutel.
- Toegang tot databaserijen begrensd door RLS (row-level beveiliging) op `owner_id`.
- Elke dienst-toegang (bijv. ondersteuning) wordt in het auditlog vastgelegd.

## 3. Bescherming tegen accountovername

- **Tweede factor op een nieuw apparaat** (TOTP, passkey, code).
- **Meldingen** bij aanmelden, nieuwe inlogmethoden, wachtwoordwijziging — via kanalen die de
  gebruiker kiest (site, e-mail, Telegram…). In de melding een knop **"Dit was ik niet"** die het
  account direct bevriest (alle sessies ingetrokken, gevoelige acties geblokkeerd tot controle).
- **Afkoelperiode van 24–72 uur** voor gevoelige acties vanaf een nieuw apparaat: inlogmethode
  verwijderen, herstel-e-mail wijzigen, kluis exporteren, account verwijderen.

## 4. Per ongeluk

- Een ontkoppelde inlogmethode wordt **niet direct verwijderd**: 7 dagen blijft ze uitgeschakeld
  bewaard en kan ze via de "ongedaan maken"-link in de melding terug.
- Hetzelfde voor ingetrokken deelrechten.

## 5. Verwijderen en slapende accounts

- Account verwijderen: **30 dagen zacht verwijderd** (herstelbaar), daarna **crypto-shred**
  (sleutels weg — gegevens onleesbaar). Back-ups verouderen en verdwijnen volgens hun eigen
  bewaartermijn.
- Slapende accounts: beleid *waarschuwen → bevriezen → verwijderen* met duidelijke termijnen en
  meldingen bij elke stap.

## 6. Flexibel delen

Toegang wordt **per object** gegeven: brief, foto, album, map, pagina, site, sectie. Elk deelrecht
(grant) heeft: ontvanger, recht (bekijken/reageren/bewerken/beheren), vervaldatum en intrekking.
De database dwingt dit af (RLS), niet alleen de code.

## 7. Twee logboeken

1. **Beveiligingsauditlog** — alleen toevoegen (append-only), regels met hashes aan elkaar
   geketend. Filters: type, actie, gebruiker, IP, apparaat, periode. Alleen een gemachtigde
   beheerder mag regels verwijderen, en dat verwijderen wordt zelf ook gelogd.
2. **Gebruiksanalyse** — standaard anoniem. Persoonlijke analyse alleen na uitdrukkelijke
   toestemming (AVG/GDPR: geen vooraf aangevinkte vakjes), met een schakelaar in de instellingen.
   Gebruikers kunnen een export van hun gegevens en verwijdering van hun account aanvragen.

## 8. Drie databaserollen (eenvoudig uitgelegd)

- **migrator** — de "bouwer": maakt en wijzigt tabellen; alleen gebruikt tijdens een update.
- **app** — de "werker": de applicatie; mag rijen lezen/schrijven, maar **niet** de tabelstructuur
  wijzigen en **niet** om RLS heen.
- **system** — de "schoonmaker": achtergrondtaken (opruimen, synchroniseren), eigen beperkte rechten.

## 9. RLS en `owner_id`

Elke rij met persoonlijke gegevens krijgt een kolom `owner_id`. Het RLS-beleid in Postgres laat
alleen rijen door waar `owner_id = current_setting('app.user_id')`. De code zet alleen
`app.user_id` aan het begin van een verzoek (uit de gecontroleerde sessie) — ook als er een fout in
de code zit, geeft de database geen rijen van anderen terug.

## 10. Stappenplan

| Fase | Inhoud | Stand |
|---|---|---|
| 1 | Google-login voor iedereen (nieuw = `member`/`new`, eigenaar via `OWNER_EMAIL`); geen stille e-mailsamenvoeging; login-CSRF dicht; verouderde aanmeldroutes weg; "overal afmelden" dekt alles; rate limiter faalt dicht bij DB-storing; `huis` in de loginlijst | **Gedaan** (branch `auth-fase-1`, niet uitgerold) |
| 2 | Kolom `owner_id` + drie databaserollen + RLS, tabel voor tabel | **Gedaan** (branch `beveiliging-fase-2-3`, RLS in audit-modus, niet uitgerold) |
| 3 | Step-up (opnieuw bevestigen) voor gevoelige acties; aparte append-only audittabel; toestemming voor analyse | **Gedaan** (zelfde branch; UI voor step-up volgt) |
| 4 | Per-gebruiker sleutels; kluis klasse 1 (versleuteling op het apparaat) | Gepland |
| 5 | Deelrechten per object; expliciet samenvoegen van accounts met bevestiging van beide kanten | Gepland |

### Fase 1 — wat er precies gedaan is
- `ensureUser` zoekt het account alleen op *(google, subject)* (`account_identities`, daarna het
  oude `users.sub`). Een nieuw Google-subject met een e-mailadres dat al bij een ander account hoort
  → **nieuw apart account** (`member`, `new`); het bestaande account krijgt een melding (alleen op
  id) en een rij in `account_email_conflicts_v1` als hint voor een latere expliciete samenvoeging
  (fase 5). Code: `backend/account-koppeling.ts`, `backend/index.ts` (`ensureUser`,
  `meldEmailConflict`).
- Uitzondering voor de eigenaar: heeft het account met `OWNER_EMAIL` nog geen gekoppelde
  Google-identiteit (gemigreerde database), dan mag de eerste koppeling eenmalig; daarna ligt die
  vast. Een tweede account met hetzelfde adres krijgt nooit de eigenaarsrol.
- `email_verified` wordt na userinfo opnieuw geëist.
- Login-CSRF: `transactions/create` zet **per transactie een eigen cookie**
  `__Secure-tsv_aanmeld_binding_<eerste 16 hex van de transactiehash>` (HttpOnly, Secure,
  SameSite=Lax, Max-Age 15 min). De transactie bewaart alleen SHA-256 van (transactiehash, tabhash,
  waarde), dus de cookie hoort bij precies deze transactie en dit tabblad (tab-id). De callback (POST
  en de oude GET) vergelijkt tijdconstant en wist **alleen die** cookie. Parallelle aanmeldingen in
  meerdere tabbladen overschrijven elkaar niet meer. Transacties met de oude binding (v1) slagen na
  de update niet (hooguit 10 min — gewoon opnieuw aanmelden). Code: `backend/aanmeld-binding.ts`.
- Zichtbaarheid op e-mail: meldingen (`recipientEmail`) en ruimte-uitnodigingen
  (`workspace_members` met status `invited`) ziet/activeert **alleen het oorspronkelijke account** met
  dat adres: het eerst aangemaakte `users`-record met dat e-mailadres, en nooit een account dat als
  "nieuw" in `account_email_conflicts_v1` staat. Een tweede account met hetzelfde adres (ander
  Google-subject) ziet ze niet; meldingen op id werken zoals voorheen. Code: `isEmailEigenaar` /
  `emailMeldingen` in `backend/index.ts`.
- Verouderde routes → `410 Gone` (`VEROUDERDE_ROUTE_WEG`); migratie
  `migrations/0002_verouderde_sessies_opruimen.sql` verwijdert rijen van de oude sessiemodellen.
- "Overal afmelden" / "alles intrekken": alle pagina's sessies, tabsessies en onthouden browsers,
  openstaande handoff-codes, afgeronde niet-ingewisselde aanmeldtransacties, oude tabellen
  (`ownerAllesIntrekken`). API-sleutels en gekoppelde diensten blijven bewust staan.
- Rate limiter voor aanmelden/MFA faalt dicht (429) bij een databasefout.
- TODO (volgende fasen): meldingen via e-mail/Telegram (nu alleen op de site); knop "Dit was ik
  niet"; afkoelperiode; 7-dagen-uitgeschakeld bij ontkoppelen.

### Meerdere accounts in één browser (tabbladen)
- De **rootcookie** `__Secure-tsv_ecosystem_<APP_ID>` bevat één *anker*-sessie voor de browser (de
  eerste aanmelding). Elk tabblad heeft een eigen tab-id van 48 hex (sessionStorage) en een eigen
  **overlay** in `owner_tab_sessions_v1` (anker + tabhash → account). Bootstrap van een tabblad neemt
  het account uit die overlay; de accountlijst van de browser bestaat uit aparte overlays per account.
- **Gevonden fout (opgelost):** begonnen twee tabbladen een aanmelding terwijl de browser nog niet
  was aangemeld (allebei intent `login`), dan maakte de tweede callback een NIEUWE root-sessie en
  overschreef de rootcookie → het eerste tabblad (overlay op het oude anker) schakelde om naar het
  account van het tweede. Hetzelfde gold voor elke `login`-transactie die na een ander tabblad afrondde.
- **Oplossing (minimaal):** bij het afronden (callback en de oude `redirect/finalize`) wordt, als de
  browser al een geldige root-sessie heeft, altijd het `replace-tab`-pad genomen: alleen de overlay
  van dit tabblad wordt gemaakt/bijgewerkt, de rootcookie blijft ongemoeid. Een nieuwe root-sessie
  komt er alleen als er nog geen is. Test `tests/eenheid/tabbladen.test.ts` (echte handler,
  nagebootste Google): twee parallelle transacties in één cookiejar ronden allebei af; tab A blijft A,
  tab B blijft B, en een derde aanmelding (C) schakelt ze niet om. Zonder de fix faalt de test
  (A wordt B).
- Resterende beperkingen (ongewijzigd): een nieuw tabblad zonder eigen overlay toont het
  root-account, of "afgemeld" als er levende tabbladen van een ander account zijn; afmelden van de
  root-sessie geldt voor alle tabbladen van de browser.

### Fase 2 — wat er precies gedaan is
- **`owner_id`** (migratie `0003`): gegenereerde kolom in `app.records` (voor `users` het id zelf,
  anders `ownerUserId` → `userId` → `recipientUserId`), ook in `storage_objects`. Opslag controleert de eigenaar.
- **Drie rollen** (`deploy/db-rollen.sql`, script `deploy/db-rollen-instellen.sh`): `mijnruimte_migrator`
  (eigenaar schema), `mijnruimte_app` (geen RLS-omzeiling, alleen rijen in `app.records`, alleen INSERT in
  `app.audit`), `mijnruimte_system` (omzeilt RLS: aanmelden/sessies, cron, beheer; mag audit en de
  RLS-schakelaar niet wijzigen). Zonder de nieuwe variabelen werkt alles zoals vroeger met één rol.
- **RLS** (`0004`, `0005`): policy's "rij hoort bij `app.user_id`" plus lidmaatschap van de werkruimte.
  Schakelaar in de DB zelf: `app.rls_instellingen.afdwingen` = `uit` (alleen registreren in `app.rls_audit`
  wat geweigerd *zou* worden) of `aan` (echt weigeren). De app kan hem niet zelf omzetten.
- **Centrale auth-poort** (`server/platform/auth-poort.ts`): `requireAuth()`, expliciete lijst publieke
  routes; vangrail in de router logt anonieme 2xx en geeft met `AUTH_POORT_AFDWINGEN=1` 401. Een test
  loopt alle routes zonder sessie af.

### Fase 3 — wat er precies gedaan is
- **Auditlog** `app.audit` (`0006`): alleen toevoegen, hashketen per account; wijzigen of verwijderen
  kan niet (trigger). Oude rijen (ouder dan 24 u) verwijderen alleen door super-/security-admin met reden en
  step-up, en dat wordt zelf ook gelogd. IP alleen als hash. Lijsten nieuwste eerst, met filters en paginering.
- **Step-up**: gevoelige acties (wachtwoord, ontkoppelen, telefoon, toegangsbeleid, kluis, beheerrollen
  en -beleid, audit verwijderen, gegevensexport, account verwijderen) vereisen een Google-aanmelding van
  hooguit 5 min geleden of een TOTP-code; anders `403 STEP_UP_REQUIRED`. Noodschakelaar `STAP_OP_UIT=1`.
- **TOTP**: dezelfde code kan niet twee keer gebruikt worden; TOTP uitzetten vereist een code.
- **Methode ontkoppelen** is 7 dagen terug te draaien, met melding. Telefoon telt pas na verificatie.
  Een geblokkeerde gebruiker krijgt geen sessie.
- **Eigenaar** overal op dezelfde manier (`isOwnerEmail`); een oude eigenaar met een ander adres wordt
  automatisch `member`.
- **API-platform en kluis** alleen voor de eigenaar of een gebruiker met recht `api-platform`; tokens
  stoppen zodra het recht is ingetrokken.
- **Delen**: alleen de rol *in deze werkruimte* telt; blokken voor beperkte toegang worden gecontroleerd;
  uitnodigingslinks eenmalig (desgewenst alleen voor één e-mailadres); e-mailuitnodigingen 7 dagen geldig;
  kijkers zien geen volledige e-mailadressen van andere leden.
- **Beheer**: nieuwste eerst, gebruikers per pagina, onderdelen alleen met de bijbehorende rechten.
- **Gegevensbescherming**: toestemming voor analyse staat **standaard uit**; met toestemming alleen anonieme
  dagtellers. Export van eigen gegevens (JSON, zonder geheimen). Account verwijderen: 30 dagen te herstellen;
  daarna wist de opruimjob definitief — alleen met `ACCOUNT_DEFINITIEF_WISSEN=1` (anders alleen een verslag).
- Nog niet gedaan: UI voor step-up en terugzetten van ontkoppelen (voorlopig: opnieuw met Google aanmelden
  en de actie herhalen); fase 4–5.
