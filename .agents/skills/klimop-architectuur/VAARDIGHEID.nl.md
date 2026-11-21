---
name: klimop-architectuur
description: Ontwerp en toets elke architectonische of programmatische wijziging van «Mijn Ruimte» aan het Hoofdarchitectuurmanifest van het levende digitale ecosysteem «Klimop» (15 controlevragen, 14 verboden vereenvoudigingen, Fasen 0–12 zonder eigenmachtige wijziging van de productieomgeving). Проєктуй і перевіряй зміни за маніфестом «Плющ».
---

> 🌐 **Taal / Мова:** [Українська](НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../../docs/INDEX.nl.md)

# Architectuurcontrole en ontwikkeling van het ecosysteem «Klimop» (`Плющ`)

## Wanneer deze vaardigheid te gebruiken

Kies deze vaardigheid vóór het ontwerpen van een nieuwe dienst, knooppunt, cryptografisch mechanisme, verdeelde opslag, herstelprocedure, toegangsregel, externe verbinder of AI-agentcoördinatie, en bij elke architectuuraudit (Fase 0) of uitgavecontrole.

Deze vaardigheid geldt voor **alle 14 AI-agentintegraties** (`claude`, `antigravity`, `autoclaw`, `chatgpt`, `codex`, `grok`, `copilot`, `gemini`, `cursor`, `windsurf`, `cline`, `devin`, `opencode`, `mscopilot`) en wordt aangeboden via `.agents/skills/` en de MCP-server (`mr://skills/klimop-architectuur`).

## Canonieke bronnen

1. [`docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`](../../../docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md) en [`docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`](../../../docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md) — volledige canon van alle XVI delen en 46 hoofdstukken.
2. [`docs/hub/KLIMOP-FASE-0-AUDIT-FEITELIJKE-STAAT.nl.md`](../../../docs/hub/KLIMOP-FASE-0-AUDIT-FEITELIJKE-STAAT.nl.md) (`ПЛЮЩ-ЕТАП-0-АУДИТ-ДІЙСНОГО-СТАНУ.uk.md`) en het controlescript [`scripts/klimop-etappe0-audit.mjs`](../../../scripts/klimop-etappe0-audit.mjs) — uitgevoerde bewijsaudit van Fase 0.
3. [`docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md`](../../../docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md) (`ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md`) en de kernmodule [`shared/klimop/kern.ts`](../../../shared/klimop/kern.ts) — specificatie van Fase 1, technologiekeuze, gefaseerd uitgaveplan en programmatische toetser voor de 15 vragen en `Ed25519`-mandaten.
4. [`docs/hub/KLIMOP-FASE-2-BEPROEVINGSNETWERK-EN-STENGELS.nl.md`](../../../docs/hub/KLIMOP-FASE-2-BEPROEVINGSNETWERK-EN-STENGELS.nl.md) (`ПЛЮЩ-ЕТАП-2-ВИПРОБУВАЛЬНА-МЕРЕЖА-ТА-СТЕБЛА.uk.md`), protocol [`shared/klimop/stengels.ts`](../../../shared/klimop/stengels.ts), knooppunt [`backend/klimop-knooppunt-agent.ts`](../../../backend/klimop-knooppunt-agent.ts) en proefopstelling [`scripts/klimop-proefnetwerk.mjs`](../../../scripts/klimop-proefnetwerk.mjs) — uitgevoerd beproevingsnetwerk van Fase 2.
5. [`docs/hub/KLIMOP-FASE-3-VERSLEUTELING-EN-VERDEELDE-OPSLAG.nl.md`](../../../docs/hub/KLIMOP-FASE-3-VERSLEUTELING-EN-VERDEELDE-OPSLAG.nl.md) (`ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.uk.md`), module [`shared/klimop/opslag.ts`](../../../shared/klimop/opslag.ts), client [`backend/klimop-opslag-client.ts`](../../../backend/klimop-opslag-client.ts) en proefopstelling [`scripts/klimop-etappe3-opslag-proef.mjs`](../../../scripts/klimop-etappe3-opslag-proef.mjs) — gerealiseerde clientzijdige envelopversleuteling, Reed-Solomon-opslag en cryptografische wendbaarheid van Fase 3.
6. [`docs/hub/KLIMOP-FASE-4-GEDISTRIBUEERDE-SLEUTELS-EN-DREMPELHANDTEKENINGEN.nl.md`](../../../docs/hub/KLIMOP-FASE-4-GEDISTRIBUEERDE-SLEUTELS-EN-DREMPELHANDTEKENINGEN.nl.md) (`ПЛЮЩ-ЕТАП-4-РОЗПОДІЛЕНІ-КЛЮЧІ-ТА-ПОРОГОВІ-ПІДПИСИ.uk.md`), module [`shared/klimop/drempelsleutels.ts`](../../../shared/klimop/drempelsleutels.ts), client [`backend/klimop-drempel-client.ts`](../../../backend/klimop-drempel-client.ts) en proefopstelling [`scripts/klimop-etappe4-frost-proef.mjs`](../../../scripts/klimop-etappe4-frost-proef.mjs) — verifieerbare Feldman/Pedersen-deling, tweefasige proactieve epochen, dealerloze `DKG` en `FROST (RFC 9591)` drempelhandtekeningen van Fase 4.
7. [`docs/hub/KLIMOP-FASE-5-ONAFHANKELIJKE-IDENTITEIT-EN-GROEPSRUIMTES.nl.md`](../../../docs/hub/KLIMOP-FASE-5-ONAFHANKELIJKE-IDENTITEIT-EN-GROEPSRUIMTES.nl.md) (`ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.uk.md`), module [`shared/klimop/identiteit.ts`](../../../shared/klimop/identiteit.ts), client [`backend/klimop-identiteit-client.ts`](../../../backend/klimop-identiteit-client.ts) en proefopstelling [`scripts/klimop-etappe5-identiteit-proef.mjs`](../../../scripts/klimop-etappe5-identiteit-proef.mjs) — zelfsoevereine identiteit `klid1_…`, vertrouwde apparaten, wettig Pedersen-herstel en `MLS (RFC 9420)` groepsruimtes van Fase 5.
8. [`docs/hub/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md`](../../../docs/hub/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md) (`ПЛЮЩ-ЕТАП-6-РОЗПОДІЛЕНЕ-КЕРУВАННЯ-ТА-БЕЗПЕЧНІ-ВИПУСКИ.uk.md`), module [`shared/klimop/bestuur.ts`](../../../shared/klimop/bestuur.ts), client [`backend/klimop-bestuur-client.ts`](../../../backend/klimop-bestuur-client.ts) en proefopstelling [`scripts/klimop-etappe6-bestuur-proef.mjs`](../../../scripts/klimop-etappe6-bestuur-proef.mjs) — 7 bevoegdheidscategorieën, tijdsloten, rollenscheiding met webclienthandtekening en golfgewijze uitrol van Fase 6.
9. [`docs/hub/KLIMOP-FASE-7-IMMUUNSYSTEEM-EN-ZELFHERSTEL.nl.md`](../../../docs/hub/KLIMOP-FASE-7-IMMUUNSYSTEEM-EN-ZELFHERSTEL.nl.md) (`ПЛЮЩ-ЕТАП-7-ІМУННА-СИСТЕМА-ТА-САМОВІДНОВЛЕННЯ.uk.md`), module [`shared/klimop/immuunsysteem.ts`](../../../shared/klimop/immuunsysteem.ts), client [`backend/klimop-immuunsysteem-client.ts`](../../../backend/klimop-immuunsysteem-client.ts) en proefopstelling [`scripts/klimop-etappe7-immuunsysteem-proef.mjs`](../../../scripts/klimop-etappe7-immuunsysteem-proef.mjs) — blinde integriteitscontrole zonder inzage, quarantaine van aangetaste knooppunten, sleutelloze Reed-Solomon-herbouw binnen quota en toetsing van alle 10 overlevingsscenario's van Fase 7.
10. [`docs/hub/KLIMOP-FASE-8-DIENSTENOVERDRACHT-EN-GEISOLEERDE-VERBINDERS.nl.md`](../../../docs/hub/KLIMOP-FASE-8-DIENSTENOVERDRACHT-EN-GEISOLEERDE-VERBINDERS.nl.md) (`ПЛЮЩ-ЕТАП-8-ПЕРЕНЕСЕННЯ-СЛУЖБ-ТА-ІЗОЛЬОВАНІ-ЗЄДНУВАЧІ.uk.md`), module [`shared/klimop/diensten.ts`](../../../shared/klimop/diensten.ts), client [`backend/klimop-diensten-client.ts`](../../../backend/klimop-diensten-client.ts) en proefopstelling [`scripts/klimop-etappe8-diensten-proef.mjs`](../../../scripts/klimop-etappe8-diensten-proef.mjs) — isolatie van alle 11 diensten via `psid1_…` en `HKDF-SHA-256`, blinde `CRDT`-replicatie, geïsoleerde verbinders, lokaal zoeken en tweezijdige pariteitstoetsing van Fase 8.
11. [`docs/hub/KLIMOP-FASE-9-MENSBESCHERMING-EN-DWANGBESTENDIGHEID.nl.md`](../../../docs/hub/KLIMOP-FASE-9-MENSBESCHERMING-EN-DWANGBESTENDIGHEID.nl.md) (`ПЛЮЩ-ЕТАП-9-ЗАХИСТ-ЛЮДИНИ-ТА-ПРОТИДІЯ-ПРИМУСУ.uk.md`), module [`shared/klimop/mensbescherming.ts`](../../../shared/klimop/mensbescherming.ts), client [`backend/klimop-mensbescherming-client.ts`](../../../backend/klimop-mensbescherming-client.ts) en proefopstelling [`scripts/klimop-etappe9-mensbescherming-proef.mjs`](../../../scripts/klimop-etappe9-mensbescherming-proef.mjs) — beleid voor 9 noodomstandigheden, scheidbare kluizen zonder verlies van hoofdgegevens, 256-byte onopvallende noodsignalen, contextueel risico over 7 signalen, herroepbare 72-uurs tijdsloten en toetsing van de 8 scenario's van §39 van Fase 9.
12. [`docs/hub/KLIMOP-FASE-10-BEHEERSTE-UITBREIDING-EN-MIDDELENUITWISSELING.nl.md`](../../../docs/hub/KLIMOP-FASE-10-BEHEERSTE-UITBREIDING-EN-MIDDELENUITWISSELING.nl.md) (`ПЛЮЩ-ЕТАП-10-КЕРОВАНЕ-РОЗШИРЕННЯ-ТА-ОБМІН-РЕСУРСАМИ.uk.md`), module [`shared/klimop/hechtranken.ts`](../../../shared/klimop/hechtranken.ts), client [`backend/klimop-hechtranken-client.ts`](../../../backend/klimop-hechtranken-client.ts) en proefopstelling [`scripts/klimop-etappe10-hechtranken-proef.mjs`](../../../scripts/klimop-etappe10-hechtranken-proef.mjs) — beheerste toetreding van knooppunten zonder wormgedrag en zonder zelfstandige inschakeling van externe middelen, Sybil-afweer, balans van «Voeding» met onvoorwaardelijke toegang tot eigen gegevens en veilige uittreding van Fase 10.
13. [`docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md`](../../../docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md) (`ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md`), module [`shared/klimop/beveiligingsaudit.ts`](../../../shared/klimop/beveiligingsaudit.ts), client [`backend/klimop-audit-client.ts`](../../../backend/klimop-audit-client.ts) en proefopstelling [`scripts/klimop-etappe11-beveiligingsaudit-proef.mjs`](../../../scripts/klimop-etappe11-beveiligingsaudit-proef.mjs) — hybride postkwantumcryptografie `Ed25519 + ML-DSA-65` en `X25519 + ML-KEM-768` (`FIPS 203/204`), samengevat dreigingsmodel met eerlijke restrisico's (Document nr. 20), 10 cryptocontroles §38, 6 autonomiescenario's §40, 12 meetbare garanties §41 en quorumvrijgave voor Fase 12.
14. [`docs/hub/KLIMOP-FASE-12-ZADEN-OPVOLGING-EN-DUURZAME-ONTWIKKELING.nl.md`](../../../docs/hub/KLIMOP-FASE-12-ZADEN-OPVOLGING-EN-DUURZAME-ONTWIKKELING.nl.md) (`ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.uk.md`), module [`shared/klimop/zaden.ts`](../../../shared/klimop/zaden.ts), client [`backend/klimop-zaden-client.ts`](../../../backend/klimop-zaden-client.ts) en proefopstelling [`scripts/klimop-etappe12-zaden-proef.mjs`](../../../scripts/klimop-etappe12-zaden-proef.mjs) — zelfstandig reproductiepakket «Zaden» met Merkle-wortel onder `FROST` + `Ed25519 + ML-DSA-65` (Document nr. 19), tweezijdige drempeloverdracht van opvolging zonder de oorspronkelijke auteur (Document nr. 23), bewaking van 16 AI-richtingen en toetsing van de 12 pijlers van §46 van Fase 12.
15. [`docs/hub/KLIMOP-FASE-13-PLATFORMINTEGRATIE-EN-SPIEGELVERIFICATIE.nl.md`](../../../docs/hub/KLIMOP-FASE-13-PLATFORMINTEGRATIE-EN-SPIEGELVERIFICATIE.nl.md) (`ПЛЮЩ-ЕТАП-13-ПЛАТФОРМНА-ІНТЕГРАЦІЯ-ТА-ДЗЕРКАЛЬНА-ЗВІРКА.uk.md`), model [`shared/klimop-overzicht-model.ts`](../../../shared/klimop-overzicht-model.ts), brug [`backend/klimop-platform-brug.ts`](../../../backend/klimop-platform-brug.ts), paden [`backend/klimop-paden.ts`](../../../backend/klimop-paden.ts), MCP-hulpmiddelen [`backend/klimop-hulpmiddelen.ts`](../../../backend/klimop-hulpmiddelen.ts) (`klimop_overzicht`, `klimop_architectuur_toets`, `klimop_spiegel_controle` voor alle 14 AI-agenten) en webpaneel [`src/agenten/KlimopPaneel.tsx`](../../../src/agenten/KlimopPaneel.tsx) — in het platform ingebouwde brug en risicoloze Stap-1-spiegelverificatie voor alle 11 diensten (§35) zonder wijziging van `PostgreSQL 18.6`.
16. [`AGENTENREGELS.nl.md`](../../../AGENTENREGELS.nl.md) (§1, §3b, §10) en [`AGENTS.md`](../../../AGENTS.md) (§1, §3б, §10) — geldende coördinatieregels (versie `1.5.0`, besluit `B-024`).
17. [`orchestratie/onderwerpen/ecosysteem-klimop.json`](../../../orchestratie/onderwerpen/ecosysteem-klimop.json) — geheugendossier en actuele voortgang.

## Bevoegdheidsgrens (verplicht)

- Het manifest «Klimop» is een **doelarchitectuur** en **GEEN toestemming voor onmiddellijke wijziging van de productie-infrastructuur**.
- Schakel bestaande servers, de centrale PostgreSQL-database, versleutelde `age`-reservekopieën, de 11 subdomeinen of bestaande geïsoleerde gebruikersruimtes nooit uit vóórdat een onafhankelijk alternatief bewezen werkt en afzonderlijk door de eigenaar is goedgekeurd (§3.2, §35).
- De aanwezigheid van een bestand in de opslagplaats geldt **nooit** als bewijs dat een voorziening in productie actief is (§3.3).

## De zeven structuurelementen van de digitale klimop (§1)

1. **Wortels** — onafhankelijke vertrouwensgrondslagen zonder dat één element onbeperkte macht geeft.
2. **Stengels** — wederzijds geauthenticeerde, versleutelde verbindingen met alternatieve routes en directe isolatie van aangetaste trajecten.
3. **Bladeren** — functionele onderdelen met een duidelijke rol; uitval van één blad stopt het netwerk niet.
4. **Hechtranken** — beheerste, vrijwillige, transparante en intrekbare uitbreiding zonder verborgen installatie of wormgedrag.
5. **Voeding** — eerlijke, spaarzame en transparante uitwisseling van rekenkracht, opslag en verbindingen.
6. **Immuunsysteem** — controleerbare bewaking zonder inzage in privé-inhoud, quarantaine van defecte onderdelen, zelfherstel binnen regels en gefaseerde uitrol.
7. **Zaden** — overdraagbaarheid en heropbouw vanuit onafhankelijk bewaarde, geverifieerde onderdelen zonder permanente afhankelijkheid van de oorspronkelijke maker.

## Verplichte architectuurcontrole van 15 vragen (§42)

Beantwoord vóór elke ontwerp- of codewijziging aantoonbaar deze 15 vragen:

1. Ontstaat er een nieuw enkel punt van falen?
2. Worden er verborgen bevoegdheden uitgebreid?
3. Blijft rechtmatig herstel beschikbaar?
4. Is informatie beschermd op het apparaat, tijdens overdracht en in opslag?
5. Worden er geen onnodige metagegevens blootgegeven?
6. Kunnen aangemaakte machtigingen worden ingetrokken?
7. Wordt de onderlinge verenigbaarheid tussen knooppunten niet verbroken?
8. Blijft het mogelijk om een defect onderdeel te isoleren?
9. Verslechtert de bescherming van de mens (ook bij ziekte, apparaatverlies of dwang) niet?
10. Blijft de wijziging controleerbaar?
11. Bestaat er een veilige weg om terug te draaien?
12. Neemt de afhankelijkheid van de oorspronkelijke auteur niet toe?
13. Worden middelen van gebruikers niet zonder hun toestemming verbruikt?
14. Worden de rechten van gegevenseigenaren niet geschonden?
15. Ontstaat er geen nieuw gevaar voor het hele netwerk via één enkele verbinder?

Bij schending van een kerngarantie moet het ontwerp vóór invoering worden herzien.

## Veertien verboden vereenvoudigingen (§43)

Verboden bij ontwerp, code en verslaglegging:
1. Het systeem volledig onkwetsbaar noemen.
2. Meerdere kopieën op één server of bij één aanbieder als onafhankelijke knooppunten beschouwen.
3. Drempelgeheimdeling (Shamir / Feldman / Pedersen) verwarren met bestandsopdeling (waarvoor `AES-256-GCM` of `ChaCha20-Poly1305` + uitwiscode-herstel vereist is).
4. Gewone serverversleuteling gelijkstellen aan volledige geheimhouding.
5. Een drempelhandtekening (zoals FROST) als universele versleuteling beschouwen.
6. Knooppunten louter op basis van deelname of netwerknabijheid vertrouwen.
7. Kritieke rechten automatisch aan een toevallige meerderheid geven.
8. Hardwarematige afscherming als absolute bescherming beschouwen.
9. Toegang automatisch herstellen zonder geldige bevestigingen of persoonsgegevens automatisch vernietigen bij vermoeden van dwang (§17).
10. Gebruikersapparaten of hun middelen heimelijk inzetten.
11. Huidige servers en PostgreSQL uitschakelen vóór onafhankelijke vervanging bewezen gereed is.
12. Beproefde cryptografische standaarden vervangen door eigen ongeteste algoritmen.
13. Beproevingen als geslaagd aanmerken zonder feitelijk bewijs.
14. Kritieke bijwerkingen installeren zonder geldige goedkeuring.

## Werkvolgorde voor agenten (§36, §45)

1. **Fase 0 — Volledige audit:** feitelijke staat van diensten, afhankelijkheden, sleutels, PostgreSQL-migraties, ruimte-isolatie en het huidige installatieproces vaststellen.
2. **Fase 1 — Architectuurkern:** rollen van de 4 knooppunttypen, verbindingsprotocollen, bevoegdheidsmodellen en de 25 verplichte tweetalige documenten (§44) uitwerken.
3. **Vergelijking van beproefde technologieën:** standaarden afwegen (inclusief groepsbeveiliging standaard 9420 en voorbereiding op postkwantumcryptografie).
4. **Gefaseerd uitgaveplan (Fasen 2–12):** kleine achterwaarts verenigbare stappen met een geïsoleerd beproevingsnetwerk en bewezen terugdraaibaarheid.
