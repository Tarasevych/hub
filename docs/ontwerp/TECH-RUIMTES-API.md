# Technische ruimtes v2 — API-contract (T-BACKEND ↔ T-UI)

Status: geïmplementeerd in `backend/tech-ruimtes.ts` (routes), `backend/tech-ruimtes-kern.ts` (database, vlag, schaduw)
en `shared/ruimte-toegang.ts` (één beslisfunctie, puur). Migratie `0115_tech_ruimtes_v2.sql`.

Alle routes: `POST`, body met `hubAuthBody(...)` (dus `service`, `tabContext` (48 hex), `sourceOrigin`). Elke route vraagt een
geldige site-sessie (401 met de code van de sessie) en een goedgekeurd account (403 `ACCOUNT_NOT_APPROVED`, behalve de eigenaar).
Ongeldige tab → 400 `TAB_ONGELDIG`. Fout-JSON zoals overal: `{ "error": "<CODE>" }`.

**Vlag `tech-ruimtes-v2` UIT** (voor deze gebruiker): `status` geeft `{ aan:false, ... }` (velden zoals hieronder, `sessie:null`);
alle schrijfroutes geven **409 `TECH_RUIMTES_V2_UIT`**. De oude routes `/api/owner/tech/*` werken dan exact zoals vroeger.
**Vlag AAN**: `/api/owner/tech/activeren` geeft 409 `GEBRUIK_RUIMTES_V2` (UI moet `ruimtes/starten` gebruiken);
`/api/owner/tech/status` en `/api/owner/tech/beeindigen` blijven werken (status toont de v2-sessie als `activatie`).

## Begrippen
- **Technische sessie** = één rij per aanmeldsessie van de site (ankersessie). Alle tabbladen van die aanmelding delen haar.
- **actief** = `'prive' | 'technisch'` — de ruimte waarin die aanmelding NU werkt. `pauze = (actief === 'prive' && sessie loopt)`.
- **Modi**:
  - `tijd` — N minuten, eindigt om `eindTijd`. Eindigt ook bij `beeindigen`, bij uitloggen van de site, en bij uitloggen van het tabblad waarin ze liep (`logout-current`).
  - `tot-technisch-einde` — geen klok; eindigt bij `beeindigen`, bij uitloggen van de site (elke vorm) en bij uitloggen van één tabblad (`logout-current`) dat erbij hoort.
  - `tot-site-uitloggen` — geen klok; eindigt alleen bij `beeindigen` of bij uitloggen van de site-aanmelding zelf (browser, account, overal, sessie ingetrokken). Uitloggen van ÉÉN tabblad haalt dat tabblad eruit maar laat de sessie lopen.
  - «Zonder tijdsgrens» is NIET stil 366 dagen: de harde grens is het absolute einde van de site-sessie (`grensTijd` in `sessie`).
- Uitloggen van de site sluit ALTIJD ook de technische sessie. `beeindigen` logt NOOIT uit van de site.

## Routes
### `/api/owner/hub/tech/ruimtes/status` (lezen; registreert dit tabblad bij de sessie)
```ts
{ aan: boolean, actief: 'prive'|'technisch', technischToegestaan: boolean, pauze: boolean,
  sessie: null | { id: string, modus: 'tijd'|'tot-technisch-einde'|'tot-site-uitloggen', eindTijd: string|null /*ISO*/,
                   gestartOp: string /*ISO*/, grensTijd: string /*ISO, einde site-sessie*/, rollen: string[], mogelijkheden: string[], reden: string },
  termijnen: Array<{ modus, minuten?: number, label: {uk,nl}, beschikbaar: boolean, reden?: {uk,nl}, rollen: string[] /*rollen die bij deze termijn meekomen*/ }>,
  maxMinuten: number, rollen: Array<{ naam: string, maxMinuten: number }>,
  eigenaar: boolean, schaduw: boolean, nu: string }
```
Onbeschikbare termijnen worden met `reden` teruggegeven, nooit verborgen. Termijnen: tijd 15/30/60/120/240/480, `tot-technisch-einde`, `tot-site-uitloggen`.
**Rolplafond (fix van tech-rollen.ts:55-60):** een termijn is beschikbaar zodra minstens één rol hem toelaat; de sessie krijgt dan
ALLEEN de rollen waarvan het plafond de termijn toelaat (open modi: plafond ≥ 240). Voorbeeld: tester+beheerder, 480 min → alleen
tester-rechten; 60 min → beide. `termijnen[].rollen` toont dat. `maxMinuten = min(profielMax, hoogste rolplafond)`.

### `/api/owner/hub/tech/ruimtes/starten` `{ modus, minuten?, reden }` — stap-op vereist
- 403 `STEP_UP_REQUIRED`/stap-op-antwoord (zoals `/api/owner/tech/activeren`), 403 `GEEN_TECH_PROFIEL`, 400 `MODUS_ONGELDIG`,
  400 `DUUR_ONGELDIG` (termijn niet beschikbaar; extra veld niet gegarandeerd), 400 `REDEN_ONGELDIG` (3..300 tekens),
  403 `SESSIE_VEREIST` (geen ankersessie), 409 `TECH_RUIMTES_V2_UIT`.
- Een lopende sessie van dezelfde aanmelding wordt vervangen. Antwoord: de status (zoals hierboven), `actief:'technisch'`.

### `/api/owner/hub/tech/ruimtes/wisselen` `{ naar: 'prive'|'technisch' }` — GEEN stap-op
- 400 `NAAR_ONGELDIG`, 409 `GEEN_TECH_SESSIE` (naar technisch zonder lopende sessie → UI toont «Почати»). Antwoord: status.

### `/api/owner/hub/tech/ruimtes/verlengen` `{ minuten, soort: 'bijtellen'|'vervangen' }` — stap-op vereist
- `bijtellen`: einde = huidig einde + minuten. `vervangen`: einde = nu + minuten. Resultaat ≤ hoogste plafond van de rollen van de sessie en ≤ 8 uur vanaf nu.
- 400 `SOORT_ONGELDIG`, 400 `DUUR_ONGELDIG`, 409 `GEEN_TECH_SESSIE`, 409 `NIET_OP_TIJD` (sessie zonder klok). Antwoord: status.

### `/api/owner/hub/tech/ruimtes/beeindigen` `{}`
- Beëindigt alleen de technische sessie van deze aanmelding (reden `zelf`). Site-sessie blijft. Idempotent. Antwoord: status.

### `/api/owner/hub/tech/ruimtes/toegang` (lezen)
```ts
{ magBeheren: boolean, // users.manage of roles.delegate in de lopende technische ruimte (eigenaar: altijd in technische ruimte)
  mensen: Array<{ userId, email, naam, rollen: string[], maxMinuten, eigenaar: boolean, actiefTot: string|null, ingetrokken: boolean }>, // leeg als !magBeheren
  sessies: Array<{ id, modus, eindTijd, grensTijd, gestartOp, actief, dezeSessie: boolean }>,   // eigen technische sessies
  ai: Array<{ verbindingId, naam, agent: string|null, ruimtes: string[], termijn: string|null, eindTijd: string|null, tokenTot: string|null, bron: 'mcp-oauth'|'instelling' }>,
  extensie: Array<{ id, agentId, ruimte, eindeSoort, eindTijd: string|null, overleeftTabUitloggen: boolean }>,
  codes: Array<{ id, naam, scopes: string[], verlooptOp: string|null }>,
  vlagTests: Array<{ sleutel, waarde: boolean, tot: string }>,
  fouten: string[] } // secties die niet gelezen konden worden (bv. migratie ontbreekt) — nooit stil leeg
```

### `/api/owner/hub/tech/ruimtes/ai-zetten` `{ verbindingId, ruimtes: ('prive'|'technisch')[], termijn: 'tijd'|'tot-technisch-einde'|'tot-site-uitloggen', minuten? }` — stap-op vereist
- Alleen in een lopende technische ruimte (niet gepauzeerd) → anders 403 `TECH_RUIMTE_VEREIST`. `verbindingId` = id van de verbinding of `*` (alle).
- 400 `VERBINDING_ONGELDIG`, 400 `RUIMTES_ONGELDIG`, 400 `TERMIJN_ONGELDIG`, 400 `DUUR_ONGELDIG` (tijd: 15..480).
- Regel voor AI/MCP (vlag aan): technisch ALLEEN als er een lopende, niet-gepauzeerde technische sessie is ÉN een geldige ai-instelling
  met `technisch` (bij `tot-technisch-einde`: gebonden aan de sessie waarin hij gezet werd). Geen instelling = privé. Antwoord: `toegang`.

## Eén beslisfunctie
`ruimteToegang(ctx, ruimte)` in `shared/ruimte-toegang.ts`. Site (via `actieveActivatie`), AI/MCP (via `lopendeActivatie`/`effectieveRuimte`),
vlaggen, terminal, impersonatie/ondersteuning, ssh-ca, beleid (adminContext-afdwinging) gaan onder de vlag allemaal hierdoor.
Eigenaar = één definitie: `role === 'owner' && OWNER_EMAIL`. De eigenaar is altijd `technischToegestaan` (profiel herstelt zichzelf).
