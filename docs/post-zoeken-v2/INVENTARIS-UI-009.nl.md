> 🌐 **Taal / Мова:** [Українська](РЕЄСТР-ПОШУКУ-ПОШТИ-УІ009.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# UI-009 — Inventaris geavanceerd zoeken in Mail (fase 1, basis 131639)

Bron: actuele code (geformatteerd gelezen), geen live site. Alles hieronder is uit code vastgesteld, tenzij «niet getest» staat.

## Betrokken bestanden
| Bestand | Rol |
|---|---|
| `src/MailZoekVeld.tsx` | Zoekbalk, live-suggesties (geschiedenis + berichten), knop `.mail-top-search-tune` (filterknop). |
| `src/MailZoekFilters.tsx` | Paneel «Фільтри пошуку»: snelfilters (Непрочитані/Прочитані/★/📎), pickers Період/Від/Тип вмісту/Тека, bereik, knop «Ще умови»; buiten het paneel de samenvattende chips-rij. |
| `src/MailGeavanceerdZoeken.tsx` | Paneel «Ще умови»: 10 kaarten (tekst, mensen, onderwerp, status, periode, map/label, bijlagen, grootte, bereik, opgeslagen) + editors. |
| `src/MailPeriodeKiezer.tsx`, `src/MailDatumKalender.tsx`, `src/mail-datum-periodes.ts` | Periode-editor (grenzen, snel, van–tot, maand, jaar, kwartaal, seizoen). |
| `src/MailZoekActiefChips.tsx` | Actieve criteria als chips, elk apart weg, «alles wissen». |
| `src/mail-zoek.ts` | Criteriamodel, normalisatie, Gmail-spec, lokale filtering. |
| `src/mail-zoek-cache.ts` | Opgeslagen (max 3) en recente (max 12) zoekopdrachten in localStorage. |
| `src/GoogleMailWerkruimte.tsx` | Staat, `executeSearch`, facetten, periodegrenzen, koppeling van de panelen. |
| `backend/mail-zoek*.ts` | Server: index-zoeken, duurzame cursor, relevantie. |

## Per voorwaarde (V1, zoals nu)
| Voorwaarde | Opent | Keuze | Bewaard | Toepassen |
|---|---|---|---|---|
| Tekst en woorden | kaart → editor | zoekopdracht (Gmail-operators), «alle woorden», «niet bevat», recente zoekopdrachten, onderwerp-suggesties | `searchInput`, `includeWords`, `excludeWords` | velden: alleen in concept (`onChange`), pas bij «Шукати»; klik op suggestie: alleen concept |
| Люди | kaart | handmatig 1 afzender; lijsten afzenders/ontvangers (max 60, multi) | `from`, `fromValues`, `toValues` | klik in lijst = **meteen zoeken** (`onApply` → `executeSearch`); handmatig veld pas bij «Шукати». Handmatig «Кому» ontbreekt in V1 (alleen lijst). |
| Тема | kaart | vrij veld + lijst (max 40, multi) | `subject`, `subjectValues` | lijst = meteen zoeken; veld = concept |
| Стан листа | kaart | 3 vinkjes: Непрочитані, Прочитані, ★ | `readStates`, `starred` | meteen zoeken |
| Період | kaart (+ grenzen laden) | grenzen, snel (14 presets), van–tot, maand, jaar, kwartaal, seizoen | `datePreset/dateFrom/dateTo/dateMonth/dateYear` | elke keuze meteen zoeken |
| Тека / мітка | kaart | zoeken + lijst (systeem + eigen, max 120, multi) | `locations` | meteen zoeken |
| Вкладення | kaart | «є вкладення», bestandsnaam, formaten (multi, tellers) | `hasAttachment`, `filename`, `attachmentTypes` | vinkje/formaat = meteen; naam = concept |
| Тип вмісту | alleen in filterpaneel | documenten/afbeeldingen/archieven/overig | `attachmentGroup` | meteen zoeken (en paneel sluit) |
| Розмір | kaart | select vergelijking, getal, eenheid | `sizeMode/sizeValue/sizeUnit` | concept, pas bij «Шукати» |
| Область пошуку | kaart | huidig/alles, Spam/Prullenbak uitsluiten | `locationKind`, `accountIds`, `excludeSystemLabels` | huidig/alles = meteen; uitsluiten = concept |
| Збережені пошуки | kaart | lijst (max 3), verwijderen | localStorage | klik = criteria in concept zetten (zoekt **niet**), elders (`applySavedSearch`) zoekt wel |

Voettekst: «Скинути» = `clearSearch` (alles leeg, ook resultaten, paneel dicht); «Зберегти» = huidige zoekopdracht+criteria opslaan (zelfde handtekening → bijwerken; naam = query/afzender/onderwerp, max 3); «Шукати» = `executeSearch(searchInput, searchCriteria)`. Sluiten (Esc/buiten/✕) zet het **concept terug** naar de laatst uitgevoerde criteria.

Bestaande bewerkingen opgeslagen zoekopdrachten: maken ✔, starten ✔, verwijderen ✔, **hernoemen: de opslagfunctie ondersteunt een naam, maar er is geen UI**.

## Leesstatus-combinatie (vastgesteld, niet gewijzigd)
Client (`mail-zoek.ts` r. 530/703) en server (`backend/mail-zoek.ts`): alleen als er precies één leesstatus is, wordt gefilterd (`is:unread` / `is:read`). Beide gekozen = geen leesfilter (= «alle»). V2 toont dit daarom als één exclusieve keuze «Усі / Непрочитані / Прочитані»; «beide» uit oude opgeslagen data wordt als «Усі» getoond — semantisch identiek.

## Bevestigde defecten / oorzaken (uit code)
1. **Gewone datumkeuze geblokkeerd zonder grenzen.** `MailPeriodeKiezer`: velden Van/Tot `disabled={!calendarReady}` en tonen «Межі не підтверджені»; maanden, kwartalen, seizoenen ook uit. `calendarReady` vereist cache-grenzen **en** `providerYearsComplete`. Bij time-out/serverfout/geen cache kan de gebruiker dus helemaal geen datum kiezen, terwijl de zoekmotor gewoon `dateFrom/dateTo` accepteert. Geen technische reden voor de blokkade.
2. **«Визначаємо межі пошти…»** = `providerYearsChecking` (verwachte laadtoestand: eerst servercache lezen, alleen zonder cache één achtergrondprobe, daarna polling). **«Межі не підтверджені»** = elke toestand zonder `calendarReady`: laden, fout (`providerRefreshError` + code, bv. `MAIL_PERIOD_BOUNDS_TIMEOUT`, rate-limit, herautorisatie), of cache gecontroleerd zonder data (`providerCheckedAt` zonder min/max). Dezelfde tekst voor vier verschillende oorzaken.
3. **Overbodige zoekverzoeken.** In «Ще умови» start elke klik in een lijst (afzender, onderwerp, etiket, formaat, status, periode) meteen `executeSearch`; vijf afzenders aanvinken = vijf volledige zoekopdrachten (elk tot 200 Gmail-pagina's per account), waarvan de vorige als `cancelled` wordt afgebroken. Facetten worden bij elk openen van beide panelen opnieuw geladen (`onLoadFacets`, `onTune`).
4. **Inconsistente toepassing.** Deels meteen, deels pas bij «Шукати» (zie tabel); bij sluiten gaat ingevuld concept (tekst, grootte, uitsluiten) verloren.
5. **Twee editorsystemen** voor periode/afzender/label/bestandstype (filterpaneel én «Ще умови») met verschillende code en gedrag.
6. **Geneste scrolls.** `.mail-search-list{max-height:360px;overflow:auto}` binnen `.mail-advanced-body{overflow:auto}`; chips-rij `max-height:76/92px;overflow-y:auto`; jaarlijst horizontaal scrollend (`.mail-date-year-track`).
7. **Herhaald etiket** «Системна тека» / «Мітка» per rij; «Знайдено у вкладеннях» en «Реальна тема з пошти» per rij.
8. **«Кому» handmatig** niet invoerbaar (alleen uit lijst), terwijl het model `to` heeft.
9. **Opgeslagen zoekopdracht starten** zoekt in «Ще умови» niet, elders wel.
10. **Grootte**: geen validatie (negatief/0/leeg wordt stil genegeerd; `sizeBytes = max(0, …)`).

## Diagnose (apart, uit code; niet live geverifieerd)
- **Gedeeltelijk afgerond zoeken** (`providerComplete=false`): (a) een account faalde (`failures`, errorCode in het rapport onder 🔔), (b) per account plafond van 200 Gmail-pagina's (`pages >= 200` → `complete=false`), (c) duurzame cursor gepauzeerd (rate-limit `GOOGLE_MAIL_MESSAGES_RATE_LIMITED`, `retryAt`), (d) afgebroken door een nieuwe zoekopdracht (`cancelled`) — wat door punt 3 vaak gebeurt.
- **Min/max archiefdatum**: servercache per account (`requestPeriodBounds('cache')`), anders één probe (`'probe'`) met polling; handmatig «синхронізувати» = `'refresh'`. Browser houdt een spiegel (`hydratePeriodCache`).
- **Tellers bijlageformaten/suggesties**: komen uit de facet-snapshot van de lokale/serverindex (`attachmentTypeCounts`, `senders`, `subjects`), dus = geïndexeerde berichten, niet heel Gmail. V2 benoemt dit in ⓘ («за проіндексованими листами»).
- **Paginering**: bij actieve zoekopdracht gaat `loadMoreMessages` niet door (`searchScope==='all' || searchPaging`); resultaten komen uit de zoekrun zelf.
- **Lege resultaten / netwerkfouten**: versoepeling (`mail-zoek-versoepeling.ts`) toont alternatieven met de versoepelde voorwaarde; fouten per account in rapport.

## Ontwerp V2 (vlag `mail-zoeken-v2`, standaard UIT)
Eén paneel (vervangt bij vlag AAN zowel het filterpaneel als «Ще умови»), verankerd onder de zoekbalk:
- kop (titel, terug, sluiten) · actieve chips (concept) · **één** scrollend werkgebied · voet «Скинути / Зберегти / Шукати» altijd zichtbaar;
- home: zoekveld, snelfilters (segment Усі/Непрочитані/Прочитані, ★, 📎) en gegroepeerde voorwaarden: *Текст і учасники* (Текст, Люди, Тема), *Стан і місце* (Стан, Тека/мітка, Область), *Час* (Період), *Файли* (Вкладення і тип, Розмір), *Додатково* (Збережені);
- **alle wijzigingen gaan in een concept**; één zoekopdracht bij «Шукати» (lost punt 3/4 op); concept blijft bewaard bij wisselen van categorie;
- periode: presets 7/30 dagen, пів року, рік, «будь-коли»; kalender altijd bruikbaar (grenzen beperken alleen als ze bevestigd zijn); maand/jaar/kwartaal/seizoen in uitklapgebied; grensstatus als één regel met ⓘ en vernieuwen;
- zoekmotor, API's, criteriamodel en CanonicalChrome ongewijzigd.
