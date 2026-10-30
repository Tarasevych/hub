# Ruimtes: testen (agent 4)

> **Українською коротко.** Усі перевірки запускаються локально однією командою:
> `scripts/lokaal-e2e/ruimtes-alles.sh --bouw`. Нічого не звертається до справжнього сайту.

Alles ALLEEN LOKAAL: Chrome → `*.tarasevych.com` wordt via host-resolver naar 127.0.0.1 (ruimtes-proxy.mjs) gestuurd;
elk ander verzoek wordt geblokkeerd en geteld («0 verzoeken naar andere hosts»). Eigen database (`RU_DB`, standaard `ru4`).

## Hoe draaien (één opdracht per suite)

| Suite | Opdracht | Uitslag |
|---|---|---|
| Alles | `scripts/lokaal-e2e/ruimtes-alles.sh [--bouw]` | `/workspace/ru-uitslag/*.json` |
| Server+proxy | `eval "$(scripts/lokaal-e2e/ruimtes-start.sh [--bouw] \| tail -1)"` | log `/tmp/ru-server-ru4.log` |
| Geen lekken tussen ruimtes | `node scripts/lokaal-e2e/ruimtes-lekkage.mjs` | `ruimtes-lekkage.json`, `lekkage/` |
| Directe URL geblokkeerd | `node scripts/lokaal-e2e/ruimtes-directe-url.mjs` | `ruimtes-directe-url.json` |
| Visueel in de site (390/768/1440, donker) | `node scripts/lokaal-e2e/ruimtes-visueel-mail.mjs [--bijwerken] [--filter 05]` | `ruimtes-visueel-mail.json`, `visueel/` |
| Visueel zuiver (agent 3, licht+donker) | `scripts/lokaal-e2e/ruimtes-visueel-zuiver.sh [--bijwerken]` | `zuiver/uitslag.json` |
| Extensie/MCP (agent 5) | `node scripts/eenheidstests.mjs ruimtes-compatibiliteit` | console |

Corpus visueel: `tests/hulp/mails/` (agent 3) als die er is, anders `tests/hulp/mails-qa/`; `RU_CORPUS=<map>` kiest zelf.
Basislijn: eerste run legt vast (`visueel/basislijn/`), `--bijwerken` legt opnieuw vast; drempel `RU_DREMPEL` (standaard 0,5 %).

## Eis → test

| Eis (t338u) | Test |
|---|---|
| Geen menging van brieven, meldingen, instellingen tussen ruimtes | ruimtes-lekkage: lijsten, leesvenster na wissel, bel (99+), zoeken, opslag, cachekoppen, 20× wissel, twee tabbladen, 390 px |
| Directe URL zonder (geldige) hoofdsessie → 401/403 | ruimtes-directe-url: geen sessie, verlopen, ingetrokken, andere gebruiker, vlag uit/aan, technische sessie zonder hoofdsessie |
| Wissel in één klik zonder wachtwoord/TOTP | ruimtes-lekkage (wissel via menu, geen stap-op-vraag) |
| Donkere brieven: geen wit vlak, WCAG-contrast, opmaak gelijk | ruimtes-visueel-mail (site) + ruimtes-visueel-zuiver (omzetting) op 390/768/1440 |
| Extensie en MCP onder scope en sessiebinding | tests/eenheid/ruimtes-compatibiliteit-{puur,db} (agent 5) |

## Basislijn op master 1f0078c (vóór samenvoegen, 28.10.2026)

Verwacht ROOD: dit zijn precies de fouten die agenten 1–3 oplossen.

- **ruimtes-lekkage:** 2/3 bij de laatste volledige run — op 390 px na de wissel naar technisch nog persoonlijke inhoud en bel «99+».
- **ruimtes-directe-url:** 51/84. Faalt: admin-pagina's (`admin/`, `admin/updates`, `admin/gebruikers`, `api/`) geven HTML
  zonder sessie, met verlopen/ingetrokken hoofdsessie en voor een andere gebruiker; admin-API's (`admin/overview`,
  `uitrol/overzicht`, `diagnostiek/overzicht`, `hub/tech/ruimtes/toegang`) antwoorden zonder technische sessie.
- **ruimtes-visueel-mail:** basis heeft geen donkere omzetting en geen wissel «Оригінал / Темний вигляд»: wit vlak tot
  ~92 % van het leesvenster. BEKEND OPEN PUNT: het harnas opent na de eerste brief de volgende brieven niet betrouwbaar (ook niet met het
  omgebogen adres uit b098838; run 28.10 14:43: 2/60, «leesvenster met deze brief geopend» faalt, run > 15 min).
  Tot dat hersteld is: per brief draaien met `--filter <nr>` (de eerste brief opent wel) of ruimtes-visueel-zuiver.sh gebruiken.
- **ruimtes-visueel-zuiver:** niet te draaien op de basis (het script komt met agent 3).

Na samenvoegen (ru-int) alle suites opnieuw: groen verwacht behalve waar een eis bewust anders is besloten.
