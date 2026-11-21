> 🌐 **Taal / Мова:** [Українська](ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md) · [Hoofdarchitectuurmanifest «Klimop»](ARCHITECTUURMANIFEST-KLIMOP.nl.md) · [Fase 16 — Stap 4](KLIMOP-FASE-16-STAP-4-QUORUMATTEST-EN-DREMPELVRIJGAVE.nl.md)

# Klimop — herstel na de onafhankelijke controle (`KLIMOP-018`–`KLIMOP-021`)

> **Status:** de eerste golf (`KLIMOP-018`) is voltooid en wacht op het samenvoegbesluit van de eigenaar; golven 2–4 zijn in uitvoering.
> **Bevoegdheidsgrens:** de productieomgeving, de draaiende databank `PostgreSQL 18.6` en de takken `voornaamst`, `integratie`, `release/*` worden niet gewijzigd. Tests met kunstmatige gegevens gelden niet als aanvaarding van de productieomgeving.

---

## 1. Wie deed wat

| Rol | Wie | Wat precies |
|---|---|---|
| Opdrachtgever en eigenaar | Tarasevych Pavlo | Gaf opdracht voor Fasen 0–16, de onafhankelijke controle en het herstel |
| Uitvoerder Fasen 0–16 (`KLIMOP-001`–`KLIMOP-017`, samenvoegingsverzoeken nr. 183–199) | Gemini 4 Carbon (High), Google Antigravity | Programmacode, tests, artikelen Fasen 0–16 |
| Onafhankelijke controle (`AUDIT-002`) | GPT-6.2 Astra (Ultra) | Controle op vastlegging `06312df6`: kritiek 0, hoog 20, middel 24, laag 11 |
| Herstel (`KLIMOP-018`–`KLIMOP-021`) | Claude Opus 5.5 (High), Google Antigravity | Vier herstelgolven volgens het controleverslag |

De oorspronkelijke registraties `KLIMOP-001`–`KLIMOP-017` noemden ten onrechte het model «Gemini 3.1 Pro». Registraties worden niet bewerkt; daarom zijn 17 registraties van de soort `correctie` met het nieuwe veld `corrigeert` toegevoegd: de updatepagina en het uitgavepakket tonen Gemini 4 Carbon (High), en de oorspronkelijke registratie blijft zichtbaar als «was».

## 2. Golf 1 — `KLIMOP-018`: clientbouw, zoeken, taalvaardigheid, registratie

| Gebrek uit het verslag | Wat is gedaan | Bewijs |
|---|---|---|
| De browserclient bouwt niet: het Klimop-paneel trok via `shared/klimop/diensten.ts` `node:crypto` mee | De lijst van 11 diensten staat nu in `shared/klimop/diensten-catalogus.ts` zonder enige import; paneel en clientmodule gebruiken die lijst, de servermodule exporteert dezelfde lijst opnieuw | `npm run build` — code 0 |
| Niemand merkte de grensovertreding op | De nieuwe controle `scripts/klant-servergrens-controle.mjs` doorloopt de importgraaf vanaf `src/main.tsx` en stopt de bouw als een eigen browsermodule een ingebouwde `Node.js`-module importeert | Een negatief voorbeeld in test `klimop-018` wordt gevonden; het hulpmiddel geeft code 1 |
| Het Klimop-paneel ontbreekt in de zoekindex | Plaats- en sprongregels toegevoegd: toegang `technisch`, sprong `#orch`; index opnieuw gegenereerd | `zoek-ui-catalogus --controle` — code 0 |
| Een aparte vaardigheid `movnyi-zakon` ontbreekt in de opslagplaats | `.agents/skills/movnyi-zakon/` aangemaakt (Oekraïense en Nederlandse versie), catalogusregel voor alle 14 agenten, verwijzing in elke adapter; de vaardighedencontrole eist haar samen met `klimop-architectuur` en `bijdragen-vastleggen`; de bron `mr://skills/movnyi-zakon` levert de volledige tekst, in het Nederlands uit het paarbestand | `valideer.mjs` — 13 vaardigheden zonder fouten |
| Verkeerd model in de auteurschapsregistratie | Veld `corrigeert` voor registraties `correctie`, toegepast in tijdlijn, deelnemerslijst en uitgavemanifest (`eerderGeregistreerd`) | 17 correcties en registratie `AUDIT-002` doorstaan de controle |

Bewust niet gedaan in deze golf: cryptografische en vertrouwensgebreken volgen in golven 2–3; testopstellingen met vaste getallen en de platformbrug in golf 4.

## 3. Zo controleert u het

```
node scripts/klant-servergrens-controle.mjs
node scripts/zoek-ui-catalogus.mjs --controle
node scripts/vaardigheden/valideer.mjs
node scripts/eenheidstests.mjs klimop-018
npm run build
```
