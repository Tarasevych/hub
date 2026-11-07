> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./RUIMTES-ISOLATIE.uk.md) · [🇳🇱 **Nederlandse versie**](./RUIMTES-ISOLATIE.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Ruimtes-isolatie — «prive» ↔ «technisch» (28.10.2026, migratie 0123, vlag `ruimtes-scheiding`)

**Коротко українською.** Сервер уже розділяв пошту, сповіщення, хмару, календар, робочий стіл, пошук і ШІ за «шухлядою»
(`ruimte`). Знайдені прогалини: (1) технічний простір визнавався за одним лише кодом вкладки, навіть з іншого входу на сайт;
(2) відповіді API не мали `no-store`/`Vary: Cookie`; (3) журнал MCP-консолі був спільним; (4) після виходу з сайту MCP казав
«немає технічного сеансу» замість «основний обліковий запис не активний». Усе виправлено за прапорцем `ruimtes-scheiding` (типово вимкнено = як раніше). Технічний сеанс тепер криптографічно (HMAC) прив'язаний до вашого входу на сайті: якщо
вхід завершено чи відкликано, технічні сторінки й API одразу відповідають 401/403. Ваші права власника/адміністратора не змінено.
Лист приватної пошти в технічній вкладці на знімку екрана — це стан інтерфейсу (браузер), сервер його технічній вкладці не віддає
(тому й тост «не вдалося оновити»); це виправляє Агент 2 за контрактом `shared/ruimte-sleutel.ts`.

## Naamgeving
De opdracht noemde `scope`/`owner_scope`/`tech_scope`; dat zijn Engelse woorden. De codebase heeft sinds 0082 al één Nederlands
veld voor precies dit: **`ruimte`** (`'prive' | 'technisch'`, NULL = `prive`). Daarom geen tweede kolom: de helper heet
`ruimteVanSessie()` en het sleutelcontract `ruimteSleutel()` in `shared/ruimte-sleutel.ts`.

## Eén vlag
`ruimtes-scheiding` (nieuw, naast `tech-ruimtes-v2`). Reden: v2 is al uitgerold en getest; de verharding moet apart terug te
draaien zijn zonder de ruimtes zelf uit te zetten. De binding werkt alleen samen met v2 (zonder v2 bestaat er geen v2-sessie).
Aanbeveling: eerst `tech-ruimtes-v2`, dan «Тест: так» op `ruimtes-scheiding`.

## Tabel: gegevenssoort → vandaag → gat → oplossing
| Soort | Hoe vandaag gescheiden | Gat | Oplossing (0123) |
|---|---|---|---|
| Post: lijst, berichten, inhoud, bijlagen, concepten, wachtrij, labels | poort `metMailRuimte` voor elke `/api/owner/mail/*`, lade in AsyncLocalStorage, `mail_ruimte_account`; Google-principals via `ladeOf` | ruimte van het tabblad werd geloofd via alleen een geregistreerde tabbladcode (ook vanuit een andere aanmelding) | ruimte alleen via de ankersessie van het verzoek + HMAC-binding (`besluit`) |
| Post-zoekindex, globaal zoeken, zoekgeschiedenis | `gegevensRuimteVeilig`, `zoek_*`.`ruimte` | idem | idem; RLS-hek op `zoek_geschiedenis` |
| Meldingen (bel 99+) | `meldingen-ruimte.ts`: lade + sfeer, lezen/tellen/gelezen per tabblad | idem | idem |
| Werkblad (v3, blokken, plekken), vensters | `werkbladLade` → `gegevensRuimteVeilig`; kolom `ruimte` | idem | idem; RLS-hek op werkblad_*, venster_stand |
| Hmara, agenda, bord, GitHub | `ruimte-cloud-agenda.ts`, `ruimte-projecties.ts` | idem | idem |
| Sleutelkluis | `gegevensRuimteVeilig` | idem | idem |
| AI/MCP-hulpmiddelen | `effectieveRuimte`, `tech_ruimte_ai`, `mcp_namens` | na sluiten wegens site-uitloggen code `GEEN_TECH_SESSIE` | code `SITE_SESSIE_WEG` blijft (reden bewaard) |
| MCP-consolelogboek | geen ruimte | technische aanroepen zichtbaar in privé | kolom `ruimte` (standaard prive), schrijven met ruimte van de verbinding, lezen gefilterd |
| connector_tool_calls | geen ruimte, bewust altijd technisch (connectors-routes.ts) | geen | ongewijzigd |
| UI-voorkeuren (menu, taal, zijbalk, thema) | per account | gedeeld tussen ruimtes | **besluit Pavlo** (zie onder); niet gewijzigd |
| HTTP-cache | alles POST, service worker slaat `/api/` over | geen `no-store`/`Vary` | `Cache-Control: no-store`, `Vary: Cookie`, `X-Ruimte` op elk ingelogd `/api/`-antwoord |
| Browsercache (localStorage, IndexedDB, geheugen) | sleutels zonder ruimte | leesvenster toont privélief in technisch tabblad | contract `ruimteSleutel(ruimte, sleutel)` voor Agent 2 |
| WebSocket/SSE (terminal, extensie, extern) | eigen tokens/ontgrendelingen per ruimte | ankercontrole per opdracht (Agent 5 §4.2) | niet in deze tak — zie «niet gedaan» |
| Exporten (privacy-export) | identity-sessie, per account | bevat beide ruimtes van dezelfde mens | bewust (eigen gegevens van de mens); geen wijziging |

## Binding (punt 3)
- `app.tech_ruimte_sessies.binding_hmac` = HMAC-SHA256(sleutel, `v1|ankersessie|technische sessie|generatie`); vergelijking met
  `timingSafeEqual`. Sleutel: `RUIMTE_BINDING_SLEUTEL_V1` (≥ 32 tekens) of afgeleid van het bestaande `TOTP_ENCRYPTION_KEY_V1`.
  Geen sleutel = geen technische ruimte (veilige kant). Geen geheim in repo of chat.
- Roteert bij `starten` en `verlengen` (beide met stap-op): generatie +1.
- Elk verzoek: de ankersessie wordt gezet door de sessiecontrole (`zetGebruiker(..., sessieId)`); de besluitfunctie vindt de rij
  via die sessie, controleert dat de site-sessie leeft (niet ingetrokken/verlopen) én de HMAC. Ingetrokken site-sessie → meteen
  privé (zonder op opruimen te wachten), directe link → 401; geldige sessie zonder technische toegang → 403 met `uitleg`.
- Rijen van vóór 0123 (zonder binding) worden gebonden bij het eerste verzoek van hun EIGEN aanmelding.

## Contract voor de andere agenten
- `POST /api/owner/hub/tech/ruimtes/controle` → 200 `{ruimte:'technisch', eindTijd}` | 401 (geen sessie) | 403 `{error, uitleg:{uk,nl}}`
  (codes: `SITE_SESSIE_WEG`, `BINDING_ONGELDIG`, `GEEN_TECH_SESSIE`, `PAUZE`, `VERLOPEN`, `GRENS_VOORBIJ`, `NIET_GEBONDEN`, `GEEN_ROLLEN`, `GEEN_TECH_PROFIEL`); 401 `ACCOUNT_NIET_ACTIEF`.
- Kop `X-Ruimte: prive|technisch` (vlag aan) — de client wist bij een andere waarde alle cache van de andere ruimte.
- `shared/ruimte-sleutel.ts`: `ruimteSleutel`, `sleutelVanRuimte`, `ruimteDatabank`, `RUIMTE_KOP`.
- `backend/ruimte-sessie.ts`: `ruimteVanSessie()`, `scheidingAan()`, `bindingWaarde/bindingKlopt`.

## Niet gedaan / open
- Extensie (Agent 5 §4.2): ankercontrole bij elke technische extensieopdracht met intrekken `site-sessie-weg` en WebSocket 4401 — niet in deze tak.
- RLS-hek werkt alleen voor de app-rol; de meeste diensten lezen via de systeemrol en filteren in code (`sqlLadeWaar`/`hoortBij`).
- UI-voorkeuren per ruimte: besluit van Pavlo.
