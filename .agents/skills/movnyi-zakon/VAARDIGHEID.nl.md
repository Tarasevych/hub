> 🌐 **Taal / Мова:** [Українська](SKILL.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../../docs/INDEX.nl.md)

# Absolute taalwet (zonder uitzonderingen en interpretaties)

Versie van de vaardigheid: `1.0.0` (KLIMOP-018, 21.11.2026). De canonieke tekst van de wet is door de eigenaar aangeleverd; deze vaardigheid is de enige gedeelde bron voor **alle 14 AI-agentkoppelingen** (`claude`, `antigravity`, `autoclaw`, `chatgpt`, `codex`, `grok`, `copilot`, `gemini`, `cursor`, `windsurf`, `cline`, `devin`, `opencode`, `mscopilot`). Zij wordt gepubliceerd via de map `.agents/skills/`, de vermelding in `scripts/vaardigheden/catalogus.json` en de bron `mr://skills/movnyi-zakon` van de modelcontextprotocolserver (`shared/mcp-protocol-2026-model.ts`). De agentadapters (punt 5) verwijzen hierheen.

## 1. Enige toegestane talen

Zuiver, authentiek **Oekraïens** (`uk`, met de letters Ґґ, Єє, Іі, Її) en zuiver **Nederlands** (`nl`).

## 2. Volledig verbod op Russisch, Engels, mengtaal en jargon

- Verboden zijn Russische woorden, letters buiten het Oekraïense alfabet (codeposities `U+0401`, `U+0451`, `U+042A`, `U+044A`, `U+042B`, `U+044B`, `U+042D`, `U+044D`), russismen, Sovjet- of imperiale leenvertalingen, mengtaal en actieve deelwoorden op «‑учий», «‑ючий», «‑ачий», «‑ячий» (gebruik in plaats daarvan een bijzin, een bijvoeglijk naamwoord of een zelfstandig naamwoord).
- Verboden zijn Engels proza, anglicismen, Latijnse transliteratie in Oekraïense tekst en technisch jargon. Gebruik uitsluitend de eigen Oekraïense en Nederlandse equivalenten uit de onderstaande tabel.

<!-- taalwet:verboden-voorbeelden:begin -->
| Verboden (Oekraïens jargon) | Zuiver Oekraïens (`uk`) | Zuiver Nederlands (`nl`) |
| --- | --- | --- |
| баг | вада, помилка | fout, gebrek |
| фікс | виправлення | herstel, verbetering |
| білд | складання | opbouw, samenstelling |
| деплой | розгортання | uitrol, plaatsing |
| коміт | фіксація змін | vastlegging |
| бренч | гілка | vertakking, tak |
| пул-реквест | запит на злиття | samenvoegingsverzoek |
| таска | завдання | taak, opdracht |
| фіча | можливість | mogelijkheid, voorziening |
| лог | журнал | logboek |
| кеш | проміжне сховище | tussenopslag |
| бекап | запасна копія | reservekopie |
| дефолтний | типовий | standaard |
| кастомний | власний | eigen, op maat gemaakt |
| апдейт | оновлення | bijwerking |
| рендер | відмальовування | weergave, opmaak |
| колбек | зворотний виклик | terugroepfunctie |
| токен (доступу) | маркер доступу | toegangsbewijs |
| бенчмарк | порівняльне випробування | prestatieproef |
| рефакторинг | впорядкування коду | herstructurering van code |
| бандл | пакунок | bundel, pakket |
<!-- taalwet:verboden-voorbeelden:einde -->

De tabel staat tussen de markeringen `taalwet:verboden-voorbeelden`, zodat de automatische vaardighedencontrole de voorbeelden niet als overtreding aanmerkt. Buiten deze tabel worden verboden termen nergens gebruikt.

## 3. Reikwijdte — alles zonder uitzondering

- communicatie met de eigenaar, redeneringen, rapporten en uitleg;
- alle GitHub-opslagplaatsen, namen en beschrijvingen, taknamen, vastleggingsberichten, samenvoegingsverzoeken en uitgaven;
- namen van mappen en artikelbestanden (`.md`, `.uk.md`, `.nl.md`) en hun volledige inhoud;
- broncode, commentaar, productinterface, zoekwoordenlijsten, foutmeldingen, beproevingen en uitgavemetadata (`UITROL-MANIFEST.json`, `ORCH-OVERDRACHT.json`, `BIJDRAGEN.json`).

Ongewijzigd blijven alleen identificaties van protocollen, standaarden, programmeerinterfaces en algoritmen (`RFC 9591`, `FROST`, `Ed25519`, `ML-DSA-65`, `HKDF-SHA-256`, `node:crypto`) en model- en productnamen in de velden voor auteurschap (`Claude Opus 5.5 (High)`, `Gemini 4 Carbon (High)`).

## 4. Zelfcontrole vóór elke handeling

Vóór elk antwoord, elke opslag en elke verzending naar GitHub controleert de agent tekst en code op de volledige afwezigheid van letters buiten het Oekraïense alfabet, russismen, mengtaal, technisch jargon en Engels proza. Elke overtreding maakt het werk ongeldig.

Machinale hulpmiddelen (dekken slechts een deel van de wet; redactionele controle van de inhoud blijft verplicht):

1. `node scripts/vaardigheden/valideer.mjs` — verboden letters en jargon in vaardigheden en catalogus.
2. `tests/eenheid/hulp/taalcontrole.ts` → `taalFouten()` — letters, jargon en actieve deelwoorden in artikelproza en interfaceteksten.
3. `shared/vaardigheden-ecosysteem.ts` → `taalwetOvertreding()` — snelle controle van afzonderlijke regels.
4. `git diff --cached | grep -nP '[\x{0401}\x{0451}\x{042A}\x{044A}\x{042B}\x{044B}\x{042D}\x{044D}]'` — laatste drempel vóór een vastlegging (lege uitvoer betekent: geen verboden letters).

## 5. Tweetaligheid

Elk artikel, elke interfacepagina en elke hulpmiddelbeschrijving heeft een gelijkwaardige Oekraïense en Nederlandse versie met dezelfde opbouw, dezelfde voorwaarden en dezelfde status. Een vertaling laat geen technische voorwaarden weg en voegt geen beloften toe die in de andere taal ontbreken.

## Geschiktheidscriterium

Elk van de 14 agenten die deze vaardigheid leest, schrijft tekst, code en metadata uitsluitend in zuiver Oekraïens en Nederlands, en machinale controles en redactionele toetsing vinden geen overtredingen.
