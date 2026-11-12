# Beveiliging — Bevestigen vanaf een ander apparaat (APPARAAT-001)

Basis: uitgave 20261109-150705 (vastlegging `8fe8b97f`). Vlag `apparaat-bevestiging-v1` (migratie 0204), **standaard AAN**;
noodschakelaar van de beheerder («voor iedereen uit», zonder toegangssleutel). Talen: alleen **uk** en **nl**.

## 1. Model en bronnen

| Bron | Wat we overnamen |
|---|---|
| itsme | dezelfde set symbolen op beide schermen, één uitgelicht op het vragende scherm; een verkeerde keuze annuleert |
| Google Prompt / Microsoft Authenticator | één poging; context (apparaat, plaats, tijd, handeling) altijd zichtbaar; «number matching» tegen bombarderen met verzoeken |
| TELEGRAM-001 (eigen) | één poort voor alle methoden (`beoordeel`), aftelling door de server afgedwongen, «Ні» wint altijd, teller met pauze en «uit» |
| NIST SP 800-63B-4 (2025) | «kiezen uit een lijst» op een tweede apparaat is voor AANMELDEN niet meer aanvaardbaar → hier alleen voor step-up op een al geauthenticeerde sessie; de aanmeldvariant (getypte code) is bewust NIET gebouwd |

## 2. Dreigingsmodel en antwoord

| Dreiging | Maatregel |
|---|---|
| Iemand anders stuurt een verzoek en hoopt dat u «ja» tikt (bombarderen) | Geen «ja»-knop: u moet het **uitgelichte symbool** van het vragende scherm kiezen. Raadkans 1/3–1/5, **één poging**; 3 fouten → pauze 15 min, 5 → methode uit tot herstel met toegangssleutel. Snelheidslimiet 10 verzoeken per 10 min per account; een nieuw verzoek van hetzelfde tabblad vervangt het vorige (geen stapel). |
| Het juiste symbool lekt naar het andere apparaat | De juiste positie verlaat de server **alleen naar A** (dezelfde gebruiker én dezelfde sessie als het verzoek). Naar B en over de snelle stroom gaan uitsluitend de kandidaten. Getest. |
| Een tik op B zonder dat B écht van de gebruiker is | B moet bekrachtigen met een **verse toegangssleutel op B** (`passkeyStapOpGeldig`), of — alleen als beheerder én gebruiker dat aanzetten — met een authenticator-code (telt nooit als «sterk»). |
| Dezelfde browser als het verzoek doet alsof hij «een ander apparaat» is | Het anker (de browser) van A staat bij het verzoek; `bekrachtigen` vanaf hetzelfde anker → `ZELFDE_APPARAAT`. Een ander tabblad is geen ander apparaat. |
| Automatisch of per ongeluk tikken | Aftelling vóór de symbolen actief zijn (5 s, gevoelig 10 s), **door de server gecontroleerd** (`TE_SNEL`), niet alleen in de knop. |
| Gelijktijdige tikken | Eén atomische `UPDATE … WHERE stand = 'wacht'`: de eerste wint, de rest krijgt `AL_AFGEROND`. |
| Verzoek blijft hangen | Verloopt na `wachtSeconden` (60–300, standaard 120); de tabel zelf eist ≤ 6 minuten (CHECK). Opruimen elke 10 minuten; rijen weg na 30 dagen. |
| Bevestiging hergebruikt | Eén keer bruikbaar: na de poort wordt de rij `gebruikt` (`verbruik`), ook vanuit de poort van TELEGRAM-001. |
| Omzeilen van de bevestigingstabel | Geen tweede waarheid: het venster vraagt `/stap-op/methoden`, dat dezelfde eis leest; de step-up wordt pas vastgelegd door `POST /api/owner/access/stap-op/poort`, dat `poort()` van TELEGRAM-001 aanroept. Wat de tabel eist (bv. ook de geheime code), vraagt het venster. |
| Gevoelige handelingen via een ander apparaat | Blijven **altijd** lokale toegangssleutel (punt D van TELEGRAM-001): `passkeySessies` wordt door deze methode nooit gezet. «Sterk» (rechten intrekken, uitrol goedkeuren) alleen als B met toegangssleutel bekrachtigde én de beheerder `sterkBijPasskey` aan heeft. |
| Phishing-proxy die het symbool live doorgeeft | Niet volledig te neutraliseren (zoals bij Google/Microsoft, CISA). Verzachting: context op B (apparaat, regio, tijd, handeling), één poging, en de toegangssleutel op B is aan de oorsprong gebonden. Volledig phishingbestendig blijft alleen de toegangssleutel zelf; het venster biedt die altijd als eerste aan. |
| «Dit ben ik niet» | Werkt altijd meteen (geen aftelling, geen sleutel): verzoek geweigerd, melding met link naar de sessies, rood alarm naar de beheerder, auditregel `apparaat.niet-ik`. |
| Snelle stroom als aanvalsvlak | `GET /api/owner/stroom` vereist dezelfde sessiecontrole als elke route (via `backend/index.ts`), loopt in dezelfde verzoekcontext (`metVerzoek`), stuurt alleen kandidaten en standen, nooit het juiste symbool; limieten per gebruiker (8) en totaal (300); zonder sessie 401; zonder registratie 503. Valt hij weg, dan vraagt de browser zelf om de 5 s. |

## 3. Transparantie

B ziet: handeling (de echte, bv. «Додавання passkey»), apparaat («Chrome/Windows»), regio (uit de koppen van de tunnel; nooit het IP), tijd (Brussel),
de aftelling en «één poging». A ziet dezelfde symbolen met de uitgelichte, het aantal apparaten dat het verzoek zag en de resterende tijd.
De gebruiker ziet in «Aanmeldmethoden» zijn laatste 20 verzoeken met uitkomst en methode op B; de beheerder ziet alleen cijfers.

## 4. Gegevens (migratie 0204)

- `app.bevestigingen_apparaat`: geen geheimen — indexen in een symboolcatalogus, standen, apparaatlabels, regio. Systeemrol (zoals 0202): de
  stroom loopt buiten de router zonder RLS-context; de autorisatie zit in de code (eigen `user_id` + sessie op elke route).
- `app.apparaat_instellingen` ('actief' + 'vorige'), `app.apparaat_voorkeuren` (voorkeuren + teller).
- `app.tg_bevestigingen` + `soort`, `kandidaten`, `juist` voor de symboolknoppen in Telegram (`KNOP_ACTIES.s`, zelfde teller).
- Terugdraaien: `deploy/apparaat-bevestiging-terugdraaien.sql`.

## 5. Testbewijs

- `tests/eenheid/apparaat-bevestiging-20261109.test.ts` — puur: symbolen, model, bevestigingstabel, routes gemarkeerd, geen nieuwe openbare routes, bron (letter «s», aftelling, migratie, terugdraaien, stroom), teksten alleen uk/nl, CSS.
- `tests/eenheid/apparaat-bevestiging-stroom-20261109.test.ts` — tegen PostgreSQL: de hele stroom (zie kop van het bestand), inclusief Telegram-symboolknop en stroom zonder sessie.

## 6. Restrisico's (eerlijk)

- Wie zowel het ontgrendelde andere apparaat (met toegangssleutel) als het vragende apparaat in handen heeft, heeft alles — zoals bij elke tweede factor.
- Een live phishing-proxy kan het uitgelichte symbool doorgeven; daarom staat de toegangssleutel altijd eerst en toont B de context.
- Web Push bij een gesloten site is er niet: B moet de site open hebben (of de melding in het centrum later openen).
