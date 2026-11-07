> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RUIMTES-COMPATIBILITEIT.uk.md) · **🇳🇱 Nederlands** ([origineel](./RUIMTES-COMPATIBILITEIT.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Ruimtes: compatibiliteit van de browserextensie en de MCP-klanten

> **Samenvatting.** De extensie en MCP-klanten melden zich niet aan via de sitecookie, maar met hun eigen tokens (agenttoken van de
> extensie, OAuth-token van MCP). Daarom moet de server de koppeling van de technische ruimte aan de hoofdsessie van de site zelf controleren, bij
> ELKE aanroep. Als het hoofdaccount niet actief is, wordt een aanroep in de technische ruimte geweigerd (401/403) met de melding
> «Основний обліковий запис не активний» (Hoofdaccount niet actief). De privéruimte werkt zoals voorheen. Langlopende toestemmingen van de extensie («1 jaar», «Zonder beperking»)
> overleven het uitloggen in één tabblad en eindigen alleen bij uitloggen van de site of «Overal uitloggen» (uw besluit t330u).

Status: ontwerp + adapter (backend/ruimtes-compatibiliteit.ts, extension/ruimte-fouten.js). Datum 28.10.2026. Agent 5.

## 1. Hoe elke klant zich aanmeldt

| Klant | Bewijs | Sitesessie (cookie) mee? | Ruimte bepaald door |
|---|---|---|---|
| Extensie, slot `prive` | agenttoken (Bearer), WebSocket-ticket 60 s | nee (`credentials: 'omit'`) | rij `agents.ruimte` = `prive` |
| Extensie, slot `technisch` | eigen agenttoken + ondertekende ontgrendeling (HMAC, opdrachtsleutel van het slot) | nee; alleen `browser_sessie` (0111) en `activatie_id` | ontgrendeling `ruimte` + `tech_ruimte_sessies` (via `activatie_id`) |
| Extensie, koppelen (`guide.js`) | sitecookie (eenmalig, `/api/owner/agents/pairing-code`) | ja | gekozen slot |
| MCP-klant (connector, OAuth) | OAuth-toegangstoken | nee | live: `aiPoortNu(userId)` bij elke `tools/list` en `tools/call` |
| MCP beheerhulpmiddelen (`BEHEER_TOOL_NAMEN`) | idem | nee | `aiPoortNu(...).ruimte === 'technisch'` bij uitvoeren |

## 2. Verzoekpaden

Extensie (`extension/background.js`, `guide.js`):
`GET /api/owner/agents/self` · `POST /api/owner/agents/pair` · `GET /api/owner/agents/pairing-code` (cookie) ·
`GET /api/owner/agents/ws-ticket` · WebSocket `/agent/ws` (sluitcodes 4403 = ingetrokken, 4410 = noodstop) ·
`POST /api/owner/agents/ontgrendeling/intrekken-extensie` · `POST /api/owner/agents/extensie/chat` ·
`POST /api/owner/agents/diagnostics/archive` · site: `/api/owner/agents/ontgrendeling` (cookie, ontgrendelen).

MCP: `/mcp` (JSON-RPC `initialize`, `tools/list`, `tools/call`) via backend/mcp-connector-routes.ts → mcp-connector.ts,
connector v2 (backend/connector-v2*.ts) en de MCP-klant naar buiten (backend/mcp-klant-routes.ts). Elke vraag
«technisch?» loopt via `aiPoortNu` → `effectieveRuimte` → bij v2 `tech-ruimtes-kern.besluit(userId, {bron:'mcp'})`
→ `ruimteToegang` (shared/ruimte-toegang.ts).

## 3. Matrix: gedrag na scheiding per ruimte + binding aan de sitesessie

| Situatie | Extensie prive | Extensie technisch | MCP prive-hulpmiddel | MCP technisch hulpmiddel |
|---|---|---|---|---|
| Sitesessie leeft, technische ruimte actief | werkt | werkt | werkt, bereik `prive` | werkt, bereik `technisch` |
| Technische ruimte op pauze | werkt | geweigerd `PAUZE` (403) | werkt | verdwijnt uit `tools/list`; call → 403 `PAUZE` |
| Uitloggen in ÉÉN tabblad | werkt | ontgrendeling «1 рік/Без обмеження» blijft; «до кінця активації» eindigt met de sessie | werkt | volgt de technische sessie |
| Uitloggen van de site / «Вийти всюди» | agenttoken blijft (koppeling), maar `naUitloggen` trekt alle ontgrendelingen in | ingetrokken, 403 `SITE_SESSIE_WEG` | werkt (OAuth-grant is geen sitesessie) — zie besluit B | 403 `SITE_SESSIE_WEG` |
| Account niet actief (geblokkeerd/gewist) | 401 `ACCOUNT_NIET_ACTIEF` → ontkoppelen | 401 | 401 | 401 |
| Vlag `tech-ruimtes-v2` uit | als vóór v2 (pariteit) | als vóór v2 | als vóór v2 | als vóór v2 (`lopendeActivatie`) |

Belangrijk: de extensie en MCP sturen GEEN sitecookie mee. «Binding aan de sitesessie» kan voor hen dus alleen
server-side, via de ankersessie van de technische ruimte (`tech_ruimte_sessies` → `siteSessieLeeft`). Een technische
aanroep zonder levende ankersessie wordt geweigerd, ook als het token zelf nog geldig is.

## 4. Contract dat Agent 1 moet waarmaken

1. **Bereik in elke ontgrendelingsgrant.** `extensie_ontgrendelingen.ruimte` blijft verplicht (`prive`|`technisch`) en
   een technische grant MOET `activatie_id` = id van een `tech_ruimte_sessies`-rij hebben. `scopeVanSessie(req)` mag een
   grant nooit in een andere ruimte gebruiken dan de ruimte van het slot (WebSocket van slot X ⇒ alleen grant van X).
2. **Ankercontrole bij elke technische extensieopdracht** (niet alleen bij ontgrendelen): `siteSessieLeeft` false ⇒ grant
   intrekken met reden `site-sessie-weg` en WebSocket-bericht `{t:'vergrendeld', code:'SITE_SESSIE_WEG'}`.
3. **MCP-scopeverklaring.** Elk hulpmiddel heeft een vaste bereik: namen in `BEHEER_TOOL_NAMEN` en `BEHEER_ALLEEN_V2` = `technisch`,
   al het andere = `prive`. Gegevens (mail, meldingen, instellingen) van een `prive`-hulpmiddel komen ALTIJD uit bereik
   `prive`, ook als de technische ruimte actief is (geen menging). Lade bij `gedeeld` blijft zoals in `aiPoortNu`.
4. **Foutcodes** (JSON `{ error: <code>, uitleg: {uk, nl} }`), status:
   - 401 `ACCOUNT_NIET_ACTIEF` — hoofdaccount niet actief; de klant ontkoppelt.
   - 403 `SITE_SESSIE_WEG` — «Основний обліковий запис не активний: увійдіть на сайті знову.»
   - 403 `GEEN_TECH_SESSIE`, `VERLOPEN`, `GRENS_VOORBIJ`, `PAUZE`, `NIET_GEBONDEN`, `AI_NIET_TOEGESTAAN`, `GEEN_ROLLEN`,
     `GEEN_TECH_PROFIEL` — technische ruimte niet beschikbaar; de klant blijft gekoppeld in `prive`.
   - Bestaande `TECH_PROFILE_OFF` (403) blijft geldig als synoniem; nieuwe code mag erbij in het veld `reden`.
   - WebSocket: 4403 = token ingetrokken (ontkoppelen), NIEUW 4401 = sitesessie weg (niet ontkoppelen, alleen vergrendelen).
5. **Gevonden in de test (28.10.2026):** als de sitesessie wordt ingetrokken, krijgt een MCP-aanroep nu `GEEN_TECH_SESSIE`
   (de technische sessie is al gesloten) in plaats van `SITE_SESSIE_WEG`. Daardoor ziet de mens de algemene melding en niet
   «Основний обліковий запис не активний». Verzoek aan Agent 1: bij sluiten wegens sitesessie de reden bewaren en die code teruggeven.
6. **Uitloggen:** `naUitloggen(userId, tabContext)` blijft: met tabContext + v2 ⇒ 0 intrekkingen; zonder ⇒ alles.

De codes 1–4 zijn als pure functie vastgelegd in backend/ruimtes-compatibiliteit.ts; tests in
tests/eenheid/ruimtes-compatibiliteit-*.test.ts.

## 5. Open punten
- Extensie opnieuw ondertekenen en `updates.xml` bijwerken: bekend open punt, niet gedaan.
- Niet getest met de echte extensie in Chrome en met een echte MCP-klant (alleen gesimuleerd).
