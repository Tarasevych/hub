# Uitgavenotities — TELEGRAM-AANMELDEN v1 · Вхід через Telegram v1

**Basis:** 20261109-105221 (vastlegging 22742811, Tarasevych/hub) — niets overschreven, alleen toegevoegd + kleine aansluitpunten.
**Vlag:** `telegram-aanmelden-v1` (migratie 0201), **standaard UIT** → met de vlag uit is de site exact 20261109-105221.
**Bot:** @MijnRuimte_Bot (standaard, aanpasbaar in beheer). **De botsleutel zit NIET in dit pakket** en wordt nergens gevraagd;
de eigenaar voert hem na installatie zelf in (Beheer → «Eenmalige aanmelding» / «Єдиний вхід» → «Вхід через Telegram» → «Бот і ключ»).
**Niet uitgerold naar de productieserver.** Talen: uk + nl.

## Nieuw in deze versie
- **Plaatsing van de aanmeldmethoden door de beheerder** (migratie 0203): per methode (Google, Telegram, GitHub, Apple, Microsoft,
  toegangssleutel) «Op het hoofdscherm» / «Onder «Andere aanmeldmethoden»» / «Verborgen», plus volgorde met pijlen; zoveel methoden
  op het hoofdscherm als gewenst, ook alle. Voorbeeld van het aanmeldscherm in beheer. Opslaan met toegangssleutel, in het journaal.
  Beveiliging tegen buitensluiten: alle werkende methoden verbergen kan niet; een methode die niet werkt komt nooit op het hoofdscherm;
  is er toch geen werkende methode zichtbaar, dan toont het aanmeldscherm Google. Lege «Andere aanmeldmethoden» → die knop verdwijnt.
  Standaard: zoals voorheen (Google en Telegram op het hoofdscherm, de rest onder «Andere aanmeldmethoden»).
- **Menunaam** «SSO» → uk «Єдиний вхід» / nl «Eenmalige aanmelding» (interne sleutels en adressen ongewijzigd).
- **Geen Engels** in zichtbare teksten: «toegangssleutel» / «ключ доступу», «terugroepadres» / «адреса зворотного виклику»,
  «aanmeldvenster van Telegram» / «офіційне вікно входу Telegram».
- **Taaknamen:** de pakket- en installatiecontroles aanvaarden nu ook Nederlandse takvoorvoegsels `functie/`, `herstel/`, `controle/`
  (de oude `feature/`, `fix/`, `audit/`, `release/` blijven geldig).

## Voor gebruikers / Для користувачів
- **Aanmelden via Telegram** op id.tarasevych.com: directe verwijzing `t.me/MijnRuimte_Bot?start=…` (zelfde of ander apparaat) of het
  officiële aanmeldvenster van Telegram (`data-telegram-login="MijnRuimte_Bot"`, omleidingsmodus). Officieel Telegram-embleem op de knop.
  Live stand (elke 2 s), aftelling tot verloop, optionele geheime code, verder na herladen.
- **Eerlijke, voorspellende meldingen:** tijdelijk / lang (> 10 min) / blijvend; met de reden (niet ik, toegangssleutel nodig,
  niet gekoppeld, gepauzeerd, apparaat geblokkeerd).
- **Kaarten in Telegram** (afbeelding met apparaat, plaats, tijd; korte animatie na succes), **«Так, це я» pas na aftelling**
  (door de server afgedwongen), eenmalige knoppen, **«Ні» wint altijd**.
- **Koppelen in 3 stappen** met uitleg «waarom»: naam → eigen nummer delen (verplicht) → volledige identiteit controleren
  (niets gemaskeerd) + vinkje + toegangssleutel. Tot 3 koppelingen per account (instelbaar), met naam en rechten.
- **Wijzigingen herkennen:** gebruikersnaam/naam/foto/nummer gewijzigd → koppeling gepauzeerd + verschiltabel.
- **Bevestigingstabel** per handeling met voorinstellingen («Як радить адміністратор», «Найбезпечніше», «Telegram скрізь, де можна»);
  minima kunnen niet verlaagd worden. **Geheime code** + optionele **alarmcode**. **Geblokkeerde apparaten** deblokkeren (toegangssleutel).

## Voor beheer (Beheer → «Eenmalige aanmelding» → «Вхід через Telegram»)
- Standtegels, 24-uursreeks van controles, **noodschakelaar** (uit zonder toegangssleutel).
- **«Налаштувати бота»**: controle bij Telegram dat de sleutel bij de verwachte gebruikersnaam hoort (waarschuwing bij een andere bot),
  sleutel naar de kluis, terugroepadres met geheime kop, opdrachten/naam/omschrijvingen per taal, menuknop — elke stap met uitkomst.
- Instellingen met ongedaan maken, handelingen, koppelingen zoeken (volledige identiteit), journaal, **plaatsing van de aanmeldmethoden**.

## Technisch
- Migraties: `0201_telegram_aanmelden_vlag.sql`, `0202_telegram_aanmelden_tabellen.sql` (app.tg_*), `0203_aanmeld_plaatsing.sql`
  (app.aanmeld_plaatsing, één rij). Terugdraaien: `deploy/telegram-aanmelden-terugdraaien.sql` (alleen met vlag uit, na reservekopie).
- Nieuwe code: `backend/telegram-aanmelden/*`, `shared/telegram-aanmelden/*`, `shared/aanmeld-plaatsing/*`, `src/telegram-aanmelden/*`.
- Aansluitpunten: `backend/index.ts`, `server/start.ts`, `server/platform/auth-poort.ts`, `backend/nieuw-apparaat.ts`, `shared/vlaggen.ts`,
  `shared/account-wissen.ts`, `src/CanoniekOmlijsting.tsx`, `src/AanmeldAndereOpties.tsx`, `src/ToegangslaagWeergave.tsx`,
  `src/BeheerConsoleWeergave.tsx`, `src/VerenigdDienstApp.tsx`, `src/dienst-tab-labels.ts`, `shared/beheer-journaal.ts`,
  `shared/ontwikkelarchief.ts`, `scripts/orch/pakket.mjs`, `orchestratie/beleid.json`, `deploy/uitrol/mijn-ruimte-uitrol.sh`.
- Aanmelden hergebruikt de bestaande eigenaartransactie (`ownerCompletePrimaryRedirect`, methode `telegram`).

## Documentatie
- `docs/telegram-aanmelden/ІНСТРУКЦІЯ-TELEGRAM.md` — stap-voor-stap lijst (uk) voor de eigenaar, inclusief plaatsing.
- `docs/telegram-aanmelden/BEVEILIGING-TELEGRAM.md` — dreigingsmodel en maatregelen.
