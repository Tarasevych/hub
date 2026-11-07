> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./INVENTARIS-EN-OORZAKEN.uk.md) · [🇳🇱 **Nederlandse versie**](./INVENTARIS-EN-OORZAKEN.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# UI-007 — Meldingencentrum: inventaris, oorzaken en ontwerp (29.10.2026)

Basis: release 20261029-131639. Nieuw gedrag achter vlag `meldingen-v2` (standaard UIT, migratie 0142).

## 1. Inventaris van wat er al is (hergebruikt, niet gedupliceerd)

| Onderdeel | Bestand | Rol |
|---|---|---|
| Bel + paneel (CanonicalChrome) | `src/CanoniekMeldingencentrum.tsx` (+ `canoniek-meldingencentrum.css`) | Bel in een zone (`<Plek knop='bel'>`), paneel (popover op pc, schermvullend ≤560 px), kop, voettools (geluid, soorten, standaardplek, alles gelezen), toast, geluid (`playChime`), tellers (`unreadCount`). |
| Lijst | `src/MeldingenpaneelInhoud.tsx` (+ `meldingenpaneel.css`) | Voegt 3 bronnen samen, chips «Усі/Непрочитані/Очікують/Проблеми», groepeerknop, zoekveld, «Фільтри» met secties + volgorde, kaarten met dag-koppen. |
| Lokale meldingen | `src/canoniek-meldingen.ts` | `emitCanonicalNotice`, dedupe (90 s, localStorage), tweetalige teksten. |
| Servermeldingen | `site_notifications` (app.records), `backend/index.ts` (`notify`, `/api/notifications/read`), `backend/meldingen-ruimte.ts`, `shared/meldingen-ruimte.ts`, `shared/meldingen-soorten.ts` (sfeer prive/technisch, 0091/0107) | Lade per ruimte; technische meldingen alleen in de technische ruimte. |
| Activiteiten | `src/connector-activiteit.ts` | Opdrachten agenten/browser/site-tools (status, duur, oorzaak). |
| Instellingen | `shared/melding-typen.ts`, `shared/melding-soorten.ts`, `src/meldingen/MeldingVoorkeurenPaneel.tsx` | Per type geluid/opduiken/tonen; `kritiek` = niet te verbergen. Bewaard in zijbalkvoorkeuren (server). |
| Technische lade | `src/meldingen/TechMeldingen.tsx`, `tech-meldingen-opslag.ts` | Aparte technische meldingen (alleen met technisch profiel). |
| Stijl/bron | `src/melding-stijl.tsx` | Sectie → pictogram, aanbieder → logo. |

## 2. Oorzaken van de klachten (129 ongelezen, 163 regels, 39 problemen)

Vastgesteld uit de code; de live-aantallen zelf kon ik niet nameten (geen toegang tot de live site).

1. **Elke regel = één ongelezen.** `unreadCount = lokaal + server + activiteiten` telt per REGEL. Een proces dat start en eindigt (bv. adrescontrole, synchronisatie, agentopdracht) levert 2+ ongelezen; tientallen rondes → tientallen ongelezen.
2. **Geslaagd achtergrondwerk telt mee.** Succes-activiteiten en `success`-meldingen tellen in de bel; er is geen «stil» niveau.
3. **Groeperen alleen visueel en op tekst.** `groupKeyOf(bron, tekst zonder cijfers)` voegt «gestart» en «klaar» NIET samen (andere tekst) en is alleen weergave: tellers blijven per regel.
4. **«Проблеми» ≠ open problemen.** Elke `error`/`failed`-regel telt, ook als een latere ronde slaagde → 39 «problemen» die al lang voorbij zijn. Gelezen werd als «afgehandeld» behandeld; er bestond geen «вирішено».
5. **Technische ruis in de gewone lade.** Opdrachten met herhaalpogingen, «extensie ontgrendeld/geweigerd», interne codes (`MAIL_…_FAILED`) komen als activiteit in het gewone paneel; de sfeer-scheiding (0107) dekt servermeldingen, niet elke activiteit-tekst.
6. **Overladen bediening.** Kop (titel + 2 tellers + «…» + inklappen), chiprij (5 chips), zoekveld, «Фільтри», secties, volgorde-select, voet met 4 knoppen (die ook achter «…» zitten) → dubbele tools boven en onder.
7. **Grote gekleurde kaarten.** Elke regel is een kaart met rand + achtergrondtint per sectie + dag-kop → veel witruimte, weinig regels per scherm.
8. **Bron verzonnen.** `styleOf` gokt «Google» voor elke mail/cloud/agenda-melding zonder aanbieder; bij twee accounts van één aanbieder is niet te zien welk account.
9. **Instellingen alleen per type, niet per dienst/account**; geen tijdelijke «Не турбувати».

## 3. Ontwerp v2 (wat gebouwd is)

- **Kop:** titel + één teller «потребує уваги» + pictogrammen (zoeken, filters, Не турбувати, alles gelezen, regels, inklappen) met tooltip en `aria-label`.
- **Segment:** «Важливі / Усі / Непрочитані». Opent op «Важливі» als er iets aandacht vraagt.
- **Lijst:** compacte rij (bronpictogram + ernststip, titel, één metaregel bron · aanbieder · account · toestand · tijd, «×N» bij samengevoegd, «…»-menu). Kleur alleen op pictogram/stip.
- **Contextmenu:** Позначити прочитаним, Відкрити джерело, Позначити вирішеним, В архів, Зробити тихими події цього типу, Вимкнути повідомлення цього облікового запису, Налаштувати джерело. Beschermde meldingen: dempen niet aangeboden.
- **Zoeken:** pictogram klapt veld uit, filtert live, wissen, Esc sluit.
- **Filters:** één contextpaneel (bron, account, status, periode, volgorde).
- **Volledige geschiedenis:** apart scherm (paneel schermvullend), tot 500 items, met «записів X → об’єднано в Y».
- **Responsief:** popover (pc), uitschuifpaneel rechts (561–1024 px), schermvullend (≤560 px, bestaand gedrag). `prefers-reduced-motion`.
- **Groepering** (`shared/meldingen-v2/groepering.ts`): op proces-id (expliciet, of soort zonder fase-achtervoegsel, of activiteit bron+soort+onderwerp), anders dienst+account+soort+titel. Open fout blijft staan tot een latere geslaagde ronde. Toestanden open/actie/opgelost/archief los van gelezen.
- **Tellers:** bel = ongelezen ITEMS met modus prioriteit/normaal; aandacht apart.
- **Leveringsregels** (`shared/meldingen-v2/beleid.ts`, `backend/meldingen-regels.ts`): per dienst/account/categorie, 4 modi, Не турбувати (max. 7 dagen), server-side per gebruiker (`melding_regels_v1`, RLS-groep voorkeuren, 0143). Beschermd: beveiliging/inzage (kritieke types), bevestigingsverzoeken, verplicht.
- **Technisch:** ruis (herhaalpogingen, extensie-teksten, interne codes, agent-service) gaat niet in het gewone centrum; een fout met actie blijft, met technische details in uitklap. Teller verwijst naar de bestaande technische lade.
- **Bron:** aanbieder/account alleen als de bron ze opgeeft; adres gemaskeerd (p…@gmail.com) tenzij label of «Показувати повні адреси».

## 4. Grenzen (eerlijk)

- Bestaande producenten van meldingen geven nog geen `account`/`accountLabel`/`procesId`/`provider` mee; v2 leest ze als ze er zijn, anders heuristiek (soort-fase, activiteit). Producenten aanpassen = vervolgstap per dienst.
- «Вирішено» / «В архів» zijn in deze versie per sessie in de browser (geen servervelden toegevoegd aan `site_notifications`).
- Geluid volgt in v2: oude geluidsknop + Не турбувати. Per-melding geluid volgens modus is nog niet in `playChime` aangesloten.
- Regels gelden voor het gewone (persoonlijke) centrum; de technische lade is ongewijzigd.
