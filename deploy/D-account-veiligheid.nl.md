> 🌐 **Taal / Мова:** [Українська](Д-безпека-облікового-запису.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Rapport D: accountbeveiliging (4.1–4.4)

Branch `werk-20261024`. Eerste doorgang — `agent/rapport-dg`. Dit verslag sluit het beheerpad en de gaten uit 4.4 die daarna overbleven.
Verificatie — `node scripts/eenheidstests.mjs account-wissen-20261026` en `browser-extensie`.
Postgres is in deze omgeving niet aanwezig. «Geen enkele rij is achtergebleven» op een live database is **niet** bewezen.

## 4.1 Direct verwijderen, zonder zacht herstelvenster

**Gedeeltelijk** (het zachte venster is uit de nieuwe routes gehaald; geen live bewijs op Postgres).

Zelfverwijdering en verwijdering door een beheerder roepen `deleteRecoverably` niet meer aan.

- `POST /api/account/delete` en `POST /api/owner/identity/account/delete`: `kritiekStapOp(..., 'account-verwijderen')`, `codewoordEis`, `OWNER_NIET_WISSEN`, `accountMeteenWissen`.
- `deleteManagedUser` / `POST /api/owner/admin/users/:id/delete`: hetzelfde moment. De gebruiker krijgt `status: deleted`, `recoverableUntil: 0`, `retiredAt: now`, sessies worden ingetrokken, gevolgd door `accountMeteenWissen`. `recoverDeletedAccount` gooit `RECOVERY_WINDOW_EXPIRED` omdat `retiredAt` al is ingesteld. Logboek: `admin_user_deleted` met `{meteen:true}`. De eigenaar blijft zoals voorheen beschermd (`OWNER_PROTECTED` / `ADMIN_OWNER_ACCOUNT_PROTECTED` en `OWNER_NIET_WISSEN` bij zelfverwijdering).
- De functie `deleteRecoverably` is in het bestand gebleven voor oude zachte items en opruimtaken. Nieuwe routes roepen haar niet aan (in `index.ts` staat precies één `deleteRecoverably(` — de declaratie zelf).
- In het beheerpaneel meldt een rij met `retiredAt` «direct gewist, kan niet worden hersteld» in plaats van «onbeperkt in de tijd». Het oude zachte venster (wel `recoverableUntil`, geen `retiredAt`) blijft in de tekst bestaan zolang zo'n item nog aanwezig is.
- Het `DELETE`-register in `accountMeteenWissen` loopt binnen één `BEGIN` / `COMMIT` (`ROLLBACK` als een stap faalt). `wisRecordsVanAccount` (tombstone en bestanden) blijft de tweede stap na de commit: dit is niet uitsluitend SQL.
- `users`, `records`, `audit` zijn uitgesloten van het SQL-register. `app.audit` is append-only. Handtekeningen (`actor_id`, `gewijzigd_door`, …) en `app.uitrol_runs` zijn geen rij van dit account.

## 4.2 Kritieke acties via sterke step-up

**Gedeeltelijk.** De matrix is in dit verslag niet gewijzigd.

- Acties: `account-verwijderen`, `aanmeldmethode`, `herstelcodes`, `ai-hoog`. Methoden: `passkey`, `app-code`, `herstelcode`, `codewoord`. `googleAlleenVolstaat` is hiervoor `false`.
- Als het account geen passkey, TOTP en herstelcodes heeft, laat `sterkeStapOpFout` nog steeds een verse Google-aanmelding door (zonder «onthouden»). Het codewoord is een sessiepoort, geen herhaalde vraag bij elke methodewijziging.

## 4.3 Codewoord (argon2id of scrypt)

**Gedeeltelijk.** Argon2id is niet toegevoegd. Het blijft scrypt (`backend/codewoord.ts`, N=16384). Een lege `CODEWOORD_PEPER` wanneer de omgevingsvariabele ontbreekt, is een configuratiegat en valt buiten dit verslag.

## 4.4 GeheimInvoer en schermtoetsenbord

**Gedeeltelijk.**

- Geheimen, PEM en SSH lopen zoals voorheen via `GeheimInvoer`.
- In `extension/shared.js` geeft `isSensitiveField` nu ook `true` voor `data-geheim-invoer` en `data-scherm-toetsenbord`, zodat een meerregelig geheim door de extensie niet als gewone tekst wordt ingevuld.
- Alle negen toetsen van `SchermToetsenbord` breken af bij `if (!e.isTrusted) return` vóór `preventDefault`. Een synthetische `pointerdown` (waaronder via `dispatchEvent`) typt niets. Een echte aanraking of klik blijft werken.
- `browser.script` / `evaluate_script` kan nog steeds willekeurige JS buiten deze toetsen om uitvoeren. Dat is niet afgesloten.

## Conclusie

| Punt | Status |
| --- | --- |
| 4.1 | gedeeltelijk: nieuwe paden wissen direct, zonder live Postgres |
| 4.2 | gedeeltelijk (Google blijft toegestaan als er geen sterkere factor is) |
| 4.3 | gedeeltelijk (scrypt, argon2id niet toegevoegd) |
| 4.4 | gedeeltelijk (`browser.script` voert nog steeds willekeurige JS uit) |
