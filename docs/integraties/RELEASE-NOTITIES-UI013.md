# Release-notities UI-013 (fase 1) — integratiecatalogus als verbindingscentrum

Basis: hoofdarchief 20261029-193103 (branch `integratie`, commit ba499d9). Migratie: **0180** (alleen een vlag).

## Nieuw (achter vlag `integraties-catalogus-v2`, standaard UIT)
- Catalogus op Admin → Інтеграції per **thema**, binnen elk thema groepen uit de **echte stand**: Потребують уваги · Підключені · Можна підключити ·
  Потребують налаштування · У розробці. Thema’s en groepen in-/uitklapbaar; klaptoestand, weergave (raster/lijst), themavolgorde, thema- en
  wijzefilter per account in deze browser bewaard. «У розробці» standaard ingeklapt.
- Koppelfouten staan **altijd** bovenaan («Потребують уваги зараз»), los van filters en ingeklapte blokken.
- Kaart: logo, naam, thema + koppelwijze, wat Mijn Ruimte werkelijk kan, stand, account/aantal (vertaald via code), laatste controle of «stand gelezen; nog
  geen controle». Hoofdactie: Підключити / Керувати / Відновити / Налаштувати / **План** (in plaats van de uitgeschakelde «Скоро»).
  «План» toont: officiële wijze, wat nodig is, wat nog te doen is, beperking van de aanbieder.
- Favorieten («Обране») bovenaan zonder de echte categorie te wijzigen (de bestaande ster).
- Eén «?» per blok (hulpregister `integraties.v2-catalogus`). Zoeken op naam, thema, mogelijkheid, aanbieder/protocol.
- Open catalogustabbladen vernieuwen elkaar via `BroadcastChannel('mr-integraties-stand')`.

## Direct (zonder vlag)
- **BUG Google-melding**: nieuwe lichte route `POST /api/owner/admin/integraties/google-stand` (admin.read, alleen `googleSuiteOnboardingSnapshot`).
  De catalogus gebruikt die eerst; de zware diagnostiek alleen nog als terugval. De melding toont nu de foutcode. Oorzaak: zie ARCHITECTUUR-UI013.md.
- `POST /api/owner/admin/integraties/stand` bevat nu ook de **IMAP-koppelingen** van het eigen account (iCloud, Yahoo, Proton, Outlook, overige → IMAP),
  met de tijd van de laatste geslaagde serveraanmelding en de foutcode. Gevolg ook in de oude weergave: IMAP-kaarten krijgen de chip «Підключено»/«Помилка».

## Audit en plan
- `shared/integraties-register.ts`: machineleesbaar register van alle 160 posities (werkend 21, basis 12, geen 127) met bewijsbestanden (test controleert
  dat ze bestaan). `docs/integraties/INVENTARIS.md` (gegenereerd, `npx tsx scripts/integraties-inventaris.ts`). Plan in `docs/integraties/ARCHITECTUUR-UI013.md`.

## Gewijzigde bestanden
backend/beheer-integraties.ts · shared/integraties-detail.ts · shared/hulp-register.ts · shared/vlaggen.ts · shared/zoek-ui-knoppen.generated.ts (door build) ·
src/integraties/Integraties.tsx · src/integraties/Detail.tsx (alleen type) · src/integraties/integraties.css · nieuw: shared/integraties-register.ts,
src/integraties/CatalogusV2.tsx, src/integraties/catalogus-v2-logica.ts, src/integraties/catalogus-vlag.ts, scripts/integraties-inventaris.ts,
migrations/0180_integraties_catalogus_v2_vlag.sql, tests/eenheid/integraties-catalogus-v2-20261029.test.ts, docs/integraties/*.
UFW-bestanden en `integrations/` niet aangeraakt.

## Niet in deze fase
Wizard-stappen, gedeelde strook op themapagina’s, nieuwe adapters (Nextcloud/S3/MQTT), periodieke controles, cloud-vnext op het register. Zie plan.

---

## UI-013 fase 2 (achter vlag `integraties-catalogus-v2`, standaard UIT; geen nieuwe migratie nodig)

- **Koppelwizard (6 stappen)** `src/integraties/WizardV2.tsx` + `wizard-v2-logica.ts`: kiezen → wijze → autorisatie → controle → rechten → klaar. Hergebruikt de bestaande OAuth-pagina's (state/PKCE in de bestaande flows) en de bestaande IMAP-flow; geen nieuwe OAuth-implementatie. Geheimen gaan via GeheimInvoer, worden alleen voor de controle verstuurd, niet bewaard en daarna gewist. Stap «rechten» meldt dat AI-agenten geen automatische toegang krijgen.
- **Gedeelde strook** `src/integraties/IntegratieStrook.tsx` op Mail, Cloud, Foto, Agenda, AI (api/verbindingen), Huis en GitHub. Leest `doelDienst` uit `shared/integraties-register.ts`, toont gereedheid (geen accountstand) met één «?» (`integraties.strook`) en een link naar de catalogus.
- **Periodieke controles** `POST /api/owner/admin/integraties/controleer-alle` (admin.read): hoogstens 1× per 30 min per gebruiker, alleen leescontroles, schrijft `app.integratie_controles`. De catalogus roept het hoogstens 1× per uur aan. Controles ouder dan 24 u worden «verouderd» getoond.
- **Adapters (alleen lezen)** `backend/verbinding-adapters/`: WebDAV/Nextcloud (PROPFIND), S3 (SigV4, ListObjectsV2), MQTT (CONNECT/CONNACK, alleen TLS, geen privé-adressen via de route). Route `POST /api/owner/admin/integraties/adapter-controle` (apps.manage, 10/min, audit zonder geheimen, niets bewaard).
- **Register**: veld `adapter`; nextcloud/s3 met adapter; nieuwe basisrijen mqtt en zigbee2mqtt. Blijven «basis» (niet «Працює»): er wordt nog geen verbinding bewaard.
- **cloud-vnext** leest uit het register via `src/cloud-vnext/register-koppeling.ts` (extra badge «Catalogus: …», achter dezelfde vlag).
- **Outlook/Graph**: niet gebouwd. Een nagebootste server bewijst niets over de echte Graph-OAuth; blijft «потребує ключів власника».
- Tests: `tests/eenheid/integraties-fase2-20261029.test.ts` (15/15), lokaal `tests/lokaal/verbinding-adapters-lokaal.ts` (8/8 tegen webdav-server, moto_server, aedes), zie `ADAPTERS-LOKAAL-TESTEN.md`.
- Ongewijzigd: `integrations/`, UFW-bestanden, bestaande kaarten.
