> 🌐 **Taal / Мова:** [Українська](ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md) · [Hoofdarchitectuurmanifest «Klimop»](ARCHITECTUURMANIFEST-KLIMOP.nl.md) · [Fase 16 — Stap 4](KLIMOP-FASE-16-STAP-4-QUORUMATTEST-EN-DREMPELVRIJGAVE.nl.md)

# Klimop — herstel na de onafhankelijke controle (`KLIMOP-018`–`KLIMOP-021`)

> **Status:** alle vier de herstelgolven — de eerste (`KLIMOP-018`, verzoek nr. 200), de tweede (`KLIMOP-019`, verzoek nr. 201), de derde (`KLIMOP-020`, verzoek nr. 202) en de vierde (`KLIMOP-021`, verzoek nr. 203) — zijn volledig uitgevoerd, met proeven getoetst en wachten op het samenvoegbesluit van de eigenaar. Alle **55 van de 55** bevindingen uit de onafhankelijke controle `AUDIT-002` (20 hoog, 24 middel, 11 laag) zijn verholpen.
> **Bevoegdheidsgrens:** de productieomgeving, de draaiende databank `PostgreSQL 18.6` en de takken `voornaamst`, `integratie`, `release/*` worden niet gewijzigd. Tests met kunstmatige gegevens gelden niet als aanvaarding van de productieomgeving.

---

## 1. Wie deed wat

| Rol | Wie | Wat precies |
|---|---|---|
| Opdrachtgever en eigenaar | Tarasevych Pavlo | Gaf opdracht voor Fasen 0–16, de onafhankelijke controle en het herstel |
| Uitvoerder Fasen 0–16 (`KLIMOP-001`–`KLIMOP-017`, samenvoegingsverzoeken nr. 183–199) | Gemini 4 Carbon (High), Google Antigravity | Programmacode, tests, artikelen Fasen 0–16 |
| Onafhankelijke controle (`AUDIT-002`) | GPT-6.2 Astra (Ultra) *(platform niet nader opgegeven door de eigenaar)* | Controle op vastlegging `06312df6`: kritiek 0, hoog 20, middel 24, laag 11 |
| Herstel van golven 1–2 (`KLIMOP-018`, `KLIMOP-019`) en begin van golf 3 (`KLIMOP-020`, vastlegging `add014c5`) | Claude Opus 5.5 (High), Google Antigravity | Samenvoegingsverzoeken nr. 200, nr. 201 en eerste helft van de vertrouwensgrenzen tot het verstrijken van de platformlimiet van vijf uur |
| Afronding van golf 3 (`KLIMOP-020`, verzoek nr. 202) vanaf het stoppunt en volledige uitvoering van golf 4 (`KLIMOP-021`, verzoek nr. 203) | Gemini 4 Carbon (High), Google Antigravity | Voortzetting na het verstrijken van de limiet zonder verlies van tussenwerk (zie [Werkoverdracht KLIMOP-020](KLIMOP-020-WERKOVERDRACHT.nl.md)) en afhandeling van alle overige bevindingen |

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

## 3. Golf 2 — `KLIMOP-019`: FROST volgens RFC 9591, geadresseerde versleuteling, duurzame epochen, Merkle, CRDT

| Gebrek uit het verslag | Wat is gedaan | Bewijs |
|---|---|---|
| FROST week af van RFC 9591: eigen hashscheidingstekens, indexen van 4 bytes, nonces zonder binding aan het aandeel | Context `FROST-ED25519-SHA512-v1`, hashes H1/H3/H4/H5, identificatoren van 32 bytes, codering van de toezeggingenlijst en invoer van de bindingsfactor volgens §4.4; de nonce wordt afgeleid uit willekeur en aandeel (§4.1) | De referentievector uit RFC 9591 bijlage E.1 komt bytegewijs overeen: nonces, D/E, bindingsfactoren, deelhandtekeningen, R en de eindhandtekening |
| De DKG-coördinator zag alle subdelen onversleuteld en kon het groepsgeheim herstellen | Nieuwe module `shared/klimop/drempel-vervoer.ts`: elk knooppunt maakt een X25519-ontvangstsleutel, ondertekend met zijn identiteitssleutel; elk subdeel wordt alleen voor de ontvanger versleuteld (X25519 → HKDF-SHA256 → ChaCha20-Poly1305), de afzender ondertekent het pakket en iedereen vergelijkt de vingerafdruk van de deelnemerssamenstelling | Test: het pakket bevat geen open subdelen, een vreemde sleutel of gewijzigde context wordt geweigerd, vervanging van de eigen regel van een knooppunt geeft `SAMENSTELLING_EIGEN_SLEUTEL_VERVALST` |
| Nulbijdragen voor epochewissels gingen onversleuteld | Dezelfde geadresseerde versleuteling en ondertekening voor nulbijdragen | Wissel naar een nieuwe epoche op drie knooppunten onder dezelfde groepssleutel |
| De epochewissel was niet duurzaam: de voorbereiding stond alleen in het geheugen en werd vóór het antwoord gewist; een herstart liet de groep uiteenlopen | Nieuwe module `backend/klimop-knooppunt-staat.ts`: de knooppuntstaat wordt versleuteld en atomair naar een bestand 0600 geschreven; het besluit heeft een vingerafdruk; bevestigen is herhaalbaar, een tegengesteld besluit wordt geweigerd; de coördinator herhaalt de bevestiging en trekt die na het eerste «ja» niet meer in | Fase 4-testopstelling en test: knooppunt CH wordt tussen de fasen gestopt, na herstart uit het bestand staan alle drie in de nieuwe epoche; een beschadigd of vreemd bestand geeft `KNOOPPUNT_STAAT_ONLEESBAAR` |
| De Merkle-boom van «Zaden» was dubbelzinnig: sortering op code-eenheden, verdubbeling van een oneven knoop, tekstscheidingstekens, dubbele paden | Schema `klimop-zaad-merkle-v2`: bytegewijze sortering, binaire bladeren en knopen met voorvoegsels 0x00/0x01 en expliciete lengtes, een oneven knoop schuift door, een dubbel pad geeft `ZAAD_DUBBEL_PAD` | Test: invoervolgorde maakt niet uit, oneven lijst ≠ lijst met duplicaat, padgrenzen zijn eenduidig |
| CRDT-samenvoeging bij gelijke HLC hing af van de volgorde | `vergelijkCrdtOperaties`: na de HLC volgen soort bewerking, epoche en bytegewijs handtekening en cijfertekst | Samenvoegen in beide volgordes en met zichzelf geeft hetzelfde resultaat |

Eerlijke beperkingen van deze golf:

- er is één ontvangstsleutel per sleutelset en die verandert niet tussen epochen — compromittering van deze sleutel onthult de subdelen van alle epochen van de set; vervanging per epoche is de volgende stap;
- compatibiliteit van FROST met andere programma's is alleen met de referentievector uit RFC 9591 aangetoond, zonder rechtstreekse uitwisseling met een onafhankelijke ondertekenaar;
- alle knooppunten van de testopstelling draaien op één machine — dit is lokale nabootsing, geen fysieke onafhankelijkheid.

## 4. Golf 3 — `KLIMOP-020`: vertrouwensgrenzen van mandaten, herstel, grondwet, «Zaden» en immuuncontrole

| Gebrek uit het verslag | Wat is gedaan | Bewijs |
|---|---|---|
| Een mandaat legde niet vast wie bevoegd is voor een concrete handeling op een concreet object, en een onderschept mandaat kon door een vreemde sessie worden doorgestuurd | `KlimopMandaatInhoud` uitgebreid met `toegestaneActies`, `objectIds`, `gemachtigdeAfzenders`; `verifieerKlimopMandaat` controleert vertrouwde uitgevers en elke quorumondertekenaar, eist een actielijst en bindt aan doelobject en sessieafzender; op het knooppunt is de strenge modus `streng` (`vertrouwdeUitgevers`) ingevoerd | Test `klimop-020` en Fase 4-proefopstelling: een vreemde sessie krijgt `MANDAAT_AFZENDER_NIET_GEMACHTIGD`, een vreemde quorumondertekenaar `ONDERTEKENAAR_NIET_VERTROUWD` |
| Een verbruiker van de persoonsstaat kon niet nagaan of voogden de nieuwe wortel machtigden, de oude wortel hield na herstel bevoegdheid en de client merkte uiteenlopende takken niet op | Het herstelbeleid wordt vóór het openen van de aanvraag verankerd door de wortel van het geldende tijdvak (`verankerHerstelBeleid`); een herstelrotatie draagt een ondertekend certificaat met beleid en voogdstemmen (`klimop-herstel-voogd-stem-v2|`); na wettig herstel verliezen eerdere wortels hun bevoegdheid en kan een ingetrokken noodapparaat geen anderen intrekken; de client eist een gemeenschappelijk voorvoegsel en quorum voor de kop (`TEGENSTRIJDIGE_IDENTITEITSGESCHIEDENIS_GEDETECTEERD`) | Test `klimop-020` en proefopstellingen Fasen 5, 7, 9 |
| Een grondwetswijziging op het knooppunt was niet gebonden aan de inhoud van het 72-uurs FROST-raadsbesluit en het besluit had geen herhalingsbescherming | Nieuwe functie `maakGrondwetWijzigingInhoud`: het knooppunt vergelijkt in `stel_bestuursgrondwet_in` de vingerafdruk van de nieuwe grondwet en rolsleutels met `inhoudSha256` van het besluit (`GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN`), controleert de vorm van de grondwet en de tijdvensters op zijn eigen klok en houdt reeds toegepaste besluiten bij (`GRONDWET_BESLUIT_REEDS_TOEGEPAST`) | Tests `klimop-007` en `klimop-020`: vervalsing van een rolsleutel en hergebruik van een besluit worden geweigerd |
| Een «Zaad»-pakket aanvaardde extra niet-ondertekende bijlagen, miste een extern beginanker op het knooppunt en het quorum vergeleek alleen de Merkle-wortel | `verifieerKlimopZaadPakket` eist exacte gelijkheid van de bijlagenverzameling en de ondertekende lijst (`ZAAD_ONGETEKEND_ONDERDEEL_AANWEZIG`), bytevolgorde en optioneel de sleutel van de pakketbewaarder; op het knooppunt is `beginAnker` toegevoegd (zonder anker stelt een pakket geen grondwet in en geeft `registreer_opvolgings_overdracht` `GEEN_VERTROUWD_BEGINANKER`); de quorumclient vergelijkt de `SHA-256` van het volledige ondertekende pakket (`QUORUM_ZAAD_PAKKET_TEGENSTRIJDIG`) | Tests `klimop-013`, `klimop-020` en Fase 12-proefopstelling |
| Blinde immuuncontrole gaf zonder referentie een positieve uitkomst op alleen de vingerafdruk uit het manifest | Zonder `verwachteCijfertekst` geeft `verifieerBlindeIntegriteitBewijs` `INTEGRITEIT_REFERENTIE_ONTBREEKT` (`nietGeverifieerd: true`) en controleert `verwachteGrootteBytes`; de client reconstrueert referentiestroken met Reed–Solomon zonder de `KEK`-sleutel, en geeft bij ontbrekende referentie `gezondeStrepen = 0` | Tests `klimop-008` en `klimop-020` |
| De vereenvoudigde groepsversleuteling werd gepresenteerd als compatibel met `MLS RFC 9420`, controleerde de welkomsthandtekening niet en liet berichtherhaling toe | In code en artikelen van Fase 5 staat nu eerlijk dat het om vereenvoudigde epochegebaseerde groepsversleuteling naar ideeën uit `RFC 9420` gaat (geen volledige implementatie van `MLS RFC 9420 / TreeKEM`); toegevoegd zijn verificatie van de welkomsthandtekening (`MLS_WELKOM_HANDTEKENING_ONGELDIG`), eenmalige berichtsleutels per afzender en herhalingsbescherming (`MLS_BERICHT_HERHALING_GEWEIGERD`), bladrotatie `verversEigenMlsBladSleutel` en wissen van tijdelijke geheimen in `finally` | Tests `klimop-006` en `klimop-020` |
| Het knooppunt vertrouwde lijsten van apparaten, borgen en auditorsleutels uit het netwerkverzoek en een quorum in één proces leek op gedistribueerde aanvaarding | In de strenge modus haalt het knooppunt de lijsten van synchronisatieapparaten, annuleersleutels, borgen, auditorsleutels en de klok uitsluitend uit zijn eigen lokale staat; de Sybil-beoordeling filtert verlopen toetredingen en meldt `fysiekeOnafhankelijkheidExternBewezen: false`; het quorumattest in `klimop-overdracht-opslag.ts` is gemarkeerd als `lokale_simulatie_een_proces` | Test `klimop-020` |

Eerlijke beperkingen van deze golf:

- de modus `open_proef` blijft uitsluitend bewaard voor lokale geïsoleerde proefopstellingen waar `vertrouwdeUitgevers` uitdrukkelijk niet is ingesteld;
- de vereenvoudigde groepsversleuteling implementeert geen volledige binaire boom `TreeKEM` uit `RFC 9420`;
- zelfverklaarde knooppuntpaspoorten zonder extern register van bevestigde exploitanten worden gemarkeerd als `zelfverklaarde_paspoorten`, en een quorum in één proces als `lokale_simulatie`.

## 5. Golf 4 — `KLIMOP-021`: transactionele overdrachtsstaat Stappen 1–4, geïsoleerde MCP-zandbak, paneeltoegankelijkheid, herleidbare metingen en tweetalige pariteit

| Gebrek uit het verslag | Wat is gedaan | Bewijs |
|---|---|---|
| Racecondities en ontbrekende transacties in de overdrachtsbestanden, lineair $O(N)$ herlezen van `.jsonl`, kwetsbaarheid van het Stap-4-attest na latere fouten en ontbrekende binding aan een actueel dienstbewijs | In `backend/klimop-overdracht-opslag.ts` zijn een procesoverstijgend slot `overdracht.lock`, een voorafgaand transactielogboek `overdracht-wal.json` met idempotent herstel `herstelOnderbrokenOverdrachtTransactie`, ondertekende controlepunten `*.checkpoint.json` in $O(1)$ en staartlezing voor grote `.jsonl` toegevoegd; `bevestig_quorum_gereedheid` is gebonden aan `bewijsVersie` van de dienst, een geldigheid van 24 uur en afwezigheid van recentere fouten (`KLIMOP_QUORUM_ATTEST_VEROUDERD_OF_ONGELDIG`), terwijl een geldig attest gescheiden blijft van latere afwijkingsregels | Tests `klimop-014`..`017` en `klimop-021` |
| `MCP`-hulpmiddelen muteerden de gedeelde eigenaarsstaat bij agentproeven, overzichtsoproepen werden niet gelogd en foutmeldingen onthulden het absolute serverpad | In `backend/klimop-hulpmiddelen.ts` draait elke agentoproep in een tijdelijke geïsoleerde zandbak `metGeisoleerdeMcpProefMap` met een expliciet veld `controleUitkomst`; `backend/klimop-paden.ts` en `backend/index.ts` leggen overzichtslezingen, `401`/`403`/`429`-weigeringen en fouten met de echte sessiedienst (`admin` / `mcp`) vast in `app.audit`; het absolute pad `wortel` is verwijderd | Tests `klimop-014` en `klimop-021` |
| Onduidelijke statusregels in `KlimopPaneel.tsx` bij 0 logregels, stilzwijgend invullen van 15 positieve antwoorden bij een leeg formulier, hulppictogrammen binnen `<label>`, ontbrekende live statusregio en afkappen van knoppen op `360px` | Eerlijke status `lege logboeken (0 regels) · basis onaangetast` en afzonderlijke uitkomst per dienst met volgnummerbewaking `laadVolgnummerRef`; vaste `id`/`htmlFor` zonder geneste knoppen, specifieke `label=` op elke `<HulpVraag>`, live statusregio `role='status'` + `aria-live='polite'`, fasekeuze `0..16`, volledige lijst van 15 vragen en geen standaardantwoorden bij een leeg bewijsveld (`0/15`); tekstterugloop op `[data-klimop-paneel] .ag-knop` | `npm run build`, `hulp-vraagtekens-controle.mjs`, `zoek-ui-catalogus --controle`, `klimop-021` |
| Postkwantumprofiel stond rang 20 zonder `ML-DSA-65`-sleutels toe, open `klareInhoudSha256` en `klareLengteBytes` in het objectmanifest, gedeeltelijke wissing gaf `ok: true`, onbegrensde kaderset in «Stengels» en ontbrekende annulering van FROST-ronde 1 | In `opslag.ts` eist rang 20 een echte hybride handtekening `Ed25519 + ML-DSA-65`, zijn lengte en afdruk versleuteld onder `DEK` in `versleuteldeEigenaarMeta` en segmenten opgevuld tot 256 bytes; `wisObjectVanKnooppunten` verifieert het manifest en telt gewiste, reeds afwezige en onbereikbare strepen apart; `stengels.ts` heeft een schuifvenster `2048`, sleutelwisselgrens `65_536`, sessieverloop en wissen in `finally`; `frost_annuleer_ronde1` + TTL en KEM-sleutelpaartoetsing in `beveiligingsaudit.ts` toegevoegd | Tests `klimop-003`..`005`, `klimop-012`, `klimop-021` |
| Vaste getallen in de proefopstellingen Fasen 11–12, uitrol en «Zaden» louter in het geheugen, teller van 25 documenten alleen als getal `25`, afwijkende subdomeinkaart in `diensten.ts` ten opzichte van `SERVICE_HOSTS` en achterblijvende woorden bij herindexering | Fasen 11 en 12 meten daadwerkelijk met `performance.now()` inclusief herkomstmetadata (`waardeSoort`, `eenheid`, `bronSha256`); het knooppunt schrijft en draait uitgaven fysiek terug op zijn tijdelijke schijf met `SHA-256`-controle, en `herbouwEcosysteemUitZaadOpSchoonMilieu` pakt de modules uit naar een schone map; `controleerVijfentwintigVerplichteDocumenten` controleert inhoudelijk alle 25 tweetalige paren van §44; `SERVICE_HOSTS`, opruiming van oude zoektermen en duplicaatdetectie zijn afgestemd | Proefopstellingen Fasen 10–12, tests `klimop-009`, `klimop-012`, `klimop-013`, `klimop-021` |
| Tweetalige afwijkingen in artikelen Fasen 1, 2, 6, 11, verouderde ankers en `deployment-identity.ts` in de hoofdoverzichten, financiële bedragen in samenvoegingsverzoeken nr. 193–196 en besluit `B-025` (`1.6.0`) | Tabel §3 van Fase 1 afgestemd op de oorspronkelijke nummers 1–25 van §44; artikelen Fasen 2, 6 (`onomkeerbareHerstelProcedureId`) en 11 gesynchroniseerd; ankers en `backend/deployment-identiteit.ts` hersteld in `README.md`, `LEESMIJ.md`, `ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md` en `INDEX.nl.md`; samenvoegingsverzoeken nr. 193–196 opgeschoond en besluit `B-025` (`regelsVersie` `1.6.0`) vastgelegd | `orch controleer`, `klimop-001`, `klimop-021` |

Eerlijke beperkingen na voltooiing van alle vier de golven:

- alle proeven draaien in de ontwikkelomgeving (`Node.js 24`) op lokale geïsoleerde knooppunten `127.0.0.1` zonder aanspreken van de actieve `PostgreSQL 18.6` of de productieserver (`Node.js 26.13.0 LTS`), en vervangen geen aanvaardingsproeven op fysiek gescheiden machines in meerdere rechtsgebieden;
- in `V8` zijn `BigInt`-getallen en `JavaScript`-tekenreeksen onveranderlijk op de beheerde heap: `Buffer`/`Uint8Array`-geheugen wordt wel met nullen overschreven, maar volledige hardwarematige wissing van scalairen vereist een systeembibliotheek of hardwarebeveiligingsmodule;
- kritieke beleidsregels in `orchestratie/regels.lock.json` blijven als voorstel gemarkeerd tot persoonlijke cryptografische bevestiging door de eigenaar.

## 6. Zo controleert u alle vier de golven

```bash
node scripts/orch.mjs controleer
node scripts/klant-servergrens-controle.mjs
node scripts/zoek-ui-catalogus.mjs --controle
node scripts/hulp-vraagtekens-controle.mjs
node scripts/vaardigheden/valideer.mjs
node scripts/eenheidstests.mjs klimop-018
node scripts/eenheidstests.mjs klimop-019
node scripts/eenheidstests.mjs klimop-020
node scripts/eenheidstests.mjs klimop-021
node scripts/klimop-etappe4-frost-proef.mjs
node scripts/klimop-etappe11-beveiligingsaudit-proef.mjs
node scripts/klimop-etappe12-zaden-proef.mjs
npm run build
```

