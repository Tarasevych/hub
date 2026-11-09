# Uitgavenotities — APPARAAT-001 · Примітки до випуску — ПІДТВЕРДЖЕННЯ З ІНШОГО ПРИСТРОЮ

**Basis / Основа:** 20261109-150705 (vastlegging `8fe8b97f`, Tarasevych/hub) — niets overschreven, alleen toegevoegd + kleine aansluitpunten.
**Vlag / Прапорець:** `apparaat-bevestiging-v1` (migratie 0204), **standaard AAN / типово УВІМКНЕНО**; noodschakelaar in beheer.
**Niet uitgerold naar de productieserver / Не розгорнуто на робочий сервер.** Talen: uk + nl.

## Nieuw / Нове

- **Twee tabbladen in «Підтвердіть доступ» / «Toegang bevestigen»:** «Інший пристрій / Ander apparaat» en «У Telegram / In Telegram» — voor een
  apparaat zonder toegangssleutel. De volgorde zonder sleutel: authenticator-code → ander apparaat → Telegram → codewoord → Google.
- **Zwevend venster «Це ви? / Bent u het?»** op elk ander aangemeld apparaat (gezamenlijke vensterlaag: verplaatsen, grootte, minimaliseren, sluiten,
  niet modaal; op de telefoon onderaan): handeling, apparaat, regio, tijd, dezelfde symbolen, aftelling, «Це не я / Dit ben ik niet», «Пізніше / Later».
- **Symbolen:** 24 pictogrammen mét naam (browser: vectorpictogram; Telegram: emoji + dezelfde naam), cijfers 2–9, Latijnse letters zonder Cyrillische
  dubbelganger, of elke keer een andere soort. 3–5 kandidaten. Eén poging.
- **Telegram als methode voor de klassieke step-up** (handeling «stap-op» in de bevestigingstabel) en **symboolknoppen in de Telegram-kaart**
  (letter «s», aftelling, zelfde teller als het andere apparaat).
- **Vierde methode «apparaat» in de bevestigingstabel** van TELEGRAM-001 met keuzes «Інший пристрій», «Telegram або інший пристрій»,
  «Telegram, інший пристрій або ключ доступу», «Інший пристрій і таємний код»; voorinstelling «Найбезпечніше» kiest voor stap-op «apparaat-en-code».
- **Eén poort:** `POST /api/owner/access/stap-op/poort` beoordeelt «stap-op» met `beoordeel()` van TELEGRAM-001 en legt de step-up vast; «sterk» alleen
  met toegangssleutel op B en als de beheerder dat toestaat.
- **Snelle stroom** `GET /api/owner/stroom` (SSE, zelfde sessiecontrole, hartslag, limieten) met terugval op navraag om de 5 s (30 s verborgen).
- **Instellingen gebruiker** («Способи входу»): aan/uit, soort symbolen, venster of alleen melding, geluid, authenticator-code op B (als toegestaan),
  teller + herstel, levende apparaten, laatste verzoeken. **Beheer** («Єдиний вхід»): noodschakelaar, alle grenzen als data, ongedaan maken, cijfers.
- **Meldingen:** melding in het centrum bij «alleen melding», bij «Це не я» en bij «uit» na te veel fouten; rood alarm naar de beheerder; audit
  `apparaat.*` en `telegram.bevestigen.fout-symbool`.

## Technisch / Технічно

- Migratie `0204_apparaat_bevestiging.sql`; terugdraaien `deploy/apparaat-bevestiging-terugdraaien.sql`.
- Nieuw: `shared/apparaat-bevestiging/*`, `backend/apparaat-bevestiging/*` (kern, opslag, stroom, routes, kanalen), `src/apparaat-bevestiging/*`.
- Aansluitpunten: `backend/stap-op.ts` (`stapOpVoorSessieVastleggen`), `backend/toegangslaag.ts` (`/stap-op/methoden` → `telegram`, `apparaat`, `kanalen`),
  `backend/toegang-context.ts` (labels), `backend/index.ts` (routes), `server/start.ts` (stroom, opruimen), `shared/telegram-aanmelden/beleid.ts`
  (methode, keuzes, handeling), `backend/telegram-aanmelden/{beleid-poort,bevestigen,webhook,berichten,cryptografie,routes}.ts`,
  `shared/telegram-aanmelden/teksten.ts`, `shared/vlaggen.ts`, `src/platform/{stap-op.ts,bevestig-toegang.tsx}`, `src/telegram-aanmelden/{api.ts,Bevestigen.tsx}`,
  `src/{CanoniekOmlijsting,ToegangslaagWeergave,BeheerConsoleWeergave}.tsx`.
- Tests: `tests/eenheid/apparaat-bevestiging-20261109.test.ts`, `tests/eenheid/apparaat-bevestiging-stroom-20261109.test.ts`.

## Bewust niet in deze uitgave / Свідомо не в цьому випуску

Web Push bij gesloten site, tost via de PC-agent, aanmeldvariant zonder sessie (alleen getypte code, NIST 800-63B-4) — aparte beslissing van de eigenaar.

## Documentatie

- `docs/apparaat-bevestiging/ІНСТРУКЦІЯ-ІНШИЙ-ПРИСТРІЙ.md` — stap-voor-stap (uk) voor de eigenaar.
- `docs/apparaat-bevestiging/BEVEILIGING-APPARAAT.nl.md` — dreigingsmodel en maatregelen.
