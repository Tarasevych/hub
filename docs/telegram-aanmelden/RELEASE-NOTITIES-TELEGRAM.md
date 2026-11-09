# Releasenotities — TELEGRAM-AANMELDEN v1 · Вхід через Telegram v1

**Basis:** 20261109-105221 (commit 22742811, Tarasevych/hub) — niets overschreven, alleen toegevoegd + kleine aansluitpunten.
**Vlag:** `telegram-aanmelden-v1` (migratie 0201), **standaard UIT** → met de vlag uit is de site exact 20261109-105221.
**Bot:** @MijnRuimte_Bot (standaard, aanpasbaar in beheer). **Botsleutel zit NIET in dit pakket** en wordt nergens gevraagd;
de eigenaar voert hem na installatie zelf in (Beheer → SSO → «Вхід через Telegram» → «Бот і ключ»).
**Niet uitgerold naar productie.** Talen: uk + nl.

## Nieuw voor gebruikers / Нове для користувачів
- **Aanmelden via Telegram** op id.tarasevych.com: deeplink `t.me/MijnRuimte_Bot?start=…` (zelfde of ander apparaat) of het
  officiële Login Widget (`data-telegram-login="MijnRuimte_Bot"`, redirect-modus). Officieel Telegram-embleem op de knop.
  Live status (polling 2 s), aftelling tot verloop, optionele geheime code, hervatten na herladen.
- **Eerlijke, voorspellende meldingen:** tijdelijk / lang (> 10 min) / blijvend; reden-specifiek (niet ik, passkey nodig,
  niet gekoppeld, gepauzeerd, apparaat geblokkeerd).
- **Rijke kaarten in Telegram** (afbeelding met apparaat, plaats, tijd; korte animatie na succes), **«Так, це я» pas na aftelling**
  (server-afgedwongen), eenmalige knoppen, **«Ні» wint altijd**.
- **Koppelen in 3 stappen** met uitleg «waarom»: naam → eigen nummer delen (verplicht) → volledige identiteit controleren
  (niets gemaskeerd) + vinkje + passkey. Tot 3 koppelingen per account (instelbaar), met naam en rechten (aanmelden / bevestigen / meldingen).
- **Wijzigingsdetectie:** nick/naam/foto/nummer gewijzigd → koppeling gepauzeerd + verschiltabel; ernstige wijzigingen met
  langere aftelling en vinkje; conflicten zichtbaar.
- **Bevestigingstabel:** per actie kiezen hoe te bevestigen (presets «Як радить адміністратор», «Найбезпечніше», «Telegram скрізь, де можна»);
  minima kunnen niet verlaagd worden.
- **Geheime code** met sterktemeter + optionele **alarmcode**.
- **Geblokkeerde apparaten** zien en deblokkeren (passkey).

## Nieuw voor beheer / Адміністрування (Beheer → SSO → «Вхід через Telegram»)
- Statustegels, 24-uursreeks van controles, **noodschakelaar** (uit zonder passkey).
- **«Налаштувати бота»**: getMe-controle tegen de verwachte gebruikersnaam (waarschuwing `ANDERE_BOT`), sleutel naar de kluis,
  webhook met geheim, opdrachten/naam/omschrijvingen per taal, menuknop — elke stap met uitkomst. «Перевірити зараз», proefbericht,
  sleutelwissel annuleren.
- Instellingen (botgebruikersnaam, wie mag, afbeeldingen/animatie, limieten, aftellingen, codebeleid, botteksten uk/nl) met ongedaan maken.
- Acties beheren, koppelingen zoeken (volledige identiteit), journaal.
- **Statusdienst** (elke minuut, alleen met vlag aan) + opruimen.

## Technisch
- Migraties: `0201_telegram_aanmelden_vlag.sql`, `0202_telegram_aanmelden_tabellen.sql` (app.tg_*). Terugdraaien:
  `deploy/telegram-aanmelden-terugdraaien.sql` (alleen met vlag uit, na back-up).
- Nieuwe code: `backend/telegram-aanmelden/*`, `shared/telegram-aanmelden/*`, `src/telegram-aanmelden/*` (CSS-prefix `tga-`).
- Aansluitpunten in bestaande bestanden: `backend/index.ts` (routes + vlagbeoordelaar via injectie), `server/start.ts` (statusronde),
  `server/platform/auth-poort.ts` (publieke routes), `backend/nieuw-apparaat.ts`, `shared/vlaggen.ts`, `shared/account-wissen.ts`,
  `src/CanoniekOmlijsting.tsx` (knop), `src/ToegangslaagWeergave.tsx` (sectie onder «Способи входу»), `src/BeheerConsoleWeergave.tsx`
  (beheer onder SSO), `scripts/plaatsing-vaste-elementen.json` (`.tga-scherm`).
- Aanmelden hergebruikt de bestaande eigenaar-redirecttransactie (`ownerCompletePrimaryRedirect`, authMethod `telegram`).
- Botsleutel/webhookgeheim/pepper in de eigenaarskluis; terugval `AANMELD_TELEGRAM_BOT_TOKEN` blijft werken.

## Tests
- Nieuw: `telegram-aanmelden-20261109` (59 OK) en `telegram-aanmelden-stroom-20261109` (28 OK, DB + nep-Bot-API).
- Volledige eenheidsreeks op een verse DB met alle migraties: zie «Testuitkomst» onderaan; geen nieuwe regressies t.o.v. de basis.
- `npm run build` (incl. vite) en beide tsc-controles: groen.

## Documentatie
- `docs/telegram-aanmelden/ІНСТРУКЦІЯ-TELEGRAM.md` — stap-voor-stap checklist (uk) voor de eigenaar.
- `docs/telegram-aanmelden/BEVEILIGING-TELEGRAM.md` — dreigingsmodel en maatregelen.
- Schermafbeeldingen (uk + nl): map `schermen/` naast het pakket (niet in de repository).
