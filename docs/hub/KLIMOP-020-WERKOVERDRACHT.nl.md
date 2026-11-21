> 🌐 **Taal:** [Українська](ПЛЮЩ-ПЕРЕДАЧА-РОБОТИ-KLIMOP-020.uk.md) · **Nederlands** | [Herstel na onafhankelijke controle](KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md)

# Werkoverdracht KLIMOP-020: vertrouwensgrenzen (Golf 3)

**Status:** tussentijdse vastlegging `add014c5` is na het verstrijken van de limiet overgenomen en **volledig afgerond** door het model `Gemini 4 Carbon (High)` op het platform `Google Antigravity`.
**Datum van overdracht en afronding:** 21-11-2026 (overdracht omstreeks 15:27 UTC, afronding van Golf 3 dezelfde dag).
**Vertakking:** `fix/klimop-020-vertrouwensgrenzen-20261121-151312` (basis: vastlegging `4ec0c22c` van KLIMOP-019, samenvoegingsverzoek nr. 201).

## 1. Wie deed wat

| Rol | Agent en model | Platform | Wat precies |
|---|---|---|---|
| Opdrachtgever | Tarasevych Pavlo (eigenaar) | — | Herstel volgens het rapport van de onafhankelijke controle `AUDIT-002`, vier golven |
| Oorspronkelijke ontwikkeling KLIMOP-001…017 | Gemini 4 Carbon (High) | Google Antigravity | Fasen 0–16 van «Klimop» |
| Onafhankelijke controle `AUDIT-002` | GPT-6.2 Astra (Ultra) | platform niet bevestigd | 55 gebreken (20 hoog, 24 middel, 11 laag) |
| Golven 1–2 (KLIMOP-018, KLIMOP-019) en begin van Golf 3 (KLIMOP-020, vastlegging `add014c5`) | Claude Opus 5.5 (High) | Google Antigravity | Samenvoegingsverzoeken nr. 200, nr. 201 en de eerste tussentijdse vastlegging van Golf 3 |
| Afronding van KLIMOP-020 vanaf het stoppunt, daarna KLIMOP-021 | Gemini 4 Carbon (High) | Google Antigravity | Volledige uitvoering van punten 3.1–3.7 na het verstrijken van de limiet van vijf uur voor Claude Opus 5.5 (High) |

De bijdrage van Claude Opus 5.5 (High) aan KLIMOP-020 staat in `orchestratie/bijdragen/KLIMOP-020/20261121-152856-antigravity.json` (BIJDRAGE-001). Gemini 4 Carbon (High) heeft een **eigen afzonderlijke bijdrage** toegevoegd met `--bouwt-voort-op KLIMOP-020/20261121-152856-antigravity`; bestaande registraties worden niet gewijzigd.

## 2. Wat tot het overdrachtsmoment in KLIMOP-020 gedaan was (Claude Opus 5.5 (High), vastlegging `add014c5`)

### 2.1. Mandaten: wie mag een concrete handeling op een concreet object uitvoeren

- `shared/klimop/kern.ts`:
  - `KlimopMandaatInhoud` heeft optionele velden `toegestaneActies`, `objectIds`, `gemachtigdeAfzenders`;
  - `canoniekeJson` slaat sleutels met waarde `undefined` over (anders klopte de handtekening niet na netwerktransport);
  - `verifieerKlimopMandaat` aanvaardt `vertrouwdeUitgevers`, `actie`, `objectId`, `vereisActieBereik`, `sessieAfzenderKnooppuntId` en geeft de codes `UITGEVER_NIET_VERTROUWD`, `ONDERTEKENAAR_NIET_VERTROUWD:<id>`, `MANDAAT_ACTIE_NIET_TOEGESTAAN`, `MANDAAT_ZONDER_ACTIEBEREIK`, `MANDAAT_OBJECT_NIET_TOEGESTAAN`, `MANDAAT_AFZENDER_NIET_GEMACHTIGD`.
- `backend/klimop-knooppunt-agent.ts`:
  - knooppuntinstelling `vertrouwdeUitgevers?: string[]` schakelt de **strenge modus** (`streng`) in; zonder deze instelling geldt de uitdrukkelijke modus `open_proef`, uitsluitend voor kunstmatige proeven;
  - `controleerRolEnMandaat(rol, mandaat, sessie, opdracht)` op alle 9 plaatsen; het object van de handeling bepaalt `objectIdVanOpdracht` (`setId`, `blokSha256`, `persoonsId`, `dienstId`, `operatieId`);
  - methode `vertrouwensModus()` en veld `vertrouwensModus` in het antwoord `pong`.
- Clients: mandaten bevatten een uitdrukkelijke lijst van handelingen (`klimop-drempel-client.ts` — vaste lijst `KLIMOP_DREMPEL_MANDAAT_ACTIES` en `objectIds: [setId]`; `klimop-opslag-client.ts` — blokhandelingen en `objectIds` alleen van de stroken die aan dit knooppunt zijn toegewezen; ook de clients audit, bestuur, diensten, hechtranken, identiteit, mensbescherming, zaden).
- De proefopstelling `scripts/klimop-etappe4-frost-proef.mjs` draait in de strenge modus en heeft een nieuwe regel «strenge vertrouwensmodus» (8 regels ok).

### 2.2. Herstel van een persoon en bevoegdheid van wortelsleutels

- `shared/klimop/identiteit.ts`:
  - nieuwe typen `KlimopHerstelBeleidVerankering`, `KlimopHerstelCertificaat`; veld `herstelBeleidVerankeringen` in de persoonsstaat; functies `verankerHerstelBeleid`, `berekenHerstelBeleidSha256`;
  - een herstelrotatie draagt een volledig overgangscertificaat (beleid, aanvraag met termijnen, stemmen van voogden) in de ondertekende inhoud; `verifieerPersoonsStaat` controleert het: verankering van het beleid door de wortel van het geldende tijdvak vóór het openen van de aanvraag, drempel, minimaal bezwaarvenster, voltooiing na de termijn, geldige stemmen;
  - de stem van een voogd (domein `klimop-herstel-voogd-stem-v2|`) omvat de herstelgrond, de termijnen en de vingerafdruk van het beleid;
  - een onbekende soort overgang wordt geweigerd (`PERSOON_ONBEKEND_ROTATIETYPE`);
  - alleen de wortel die op het moment van uitgifte gold, mag apparaten certificeren; na een wettig herstel verliezen eerdere wortels die bevoegdheid voor elk gebruik na het herstelmoment; een noodapparaat dat zelf is ingetrokken, kan anderen niet intrekken;
  - niet-normatieve datums in een apparaatcertificaat leiden tot een gesloten weigering (`APPARAAT_CERTIFICAAT_TIJD_ONGELDIG`).
- `backend/klimop-identiteit-client.ts`: de rotatiegeschiedenissen van alle antwoorden moeten elkaars voorvoegsel zijn (`TEGENSTRIJDIGE_IDENTITEITSGESCHIEDENIS_GEDETECTEERD`) en een kop wordt alleen gekozen als minstens `quorumDrempel` knooppunten hem bevatten.
- Proefopstellingen 5, 7, 9 en tests klimop-006, klimop-008, klimop-010 verankeren het herstelbeleid vóór de aanvraag.

### 2.3. Grondwet, begonnen in `add014c5`

- `shared/klimop/bestuur.ts`: nieuwe `maakGrondwetWijzigingInhoud` en `berekenGrondwetWijzigingSha256`; `verifieerBestuursBesluitLogboek` herhaalt nu de controles op tijdsbeleid, handtekening van de indiener, afwezigheid van een veto en samenstelling van het quorum.

## 3. Wat na de overdracht in KLIMOP-020 is afgerond (Gemini 4 Carbon (High))

1. **Grondwet op het knooppunt (`shared/klimop/bestuur.ts`, `backend/klimop-knooppunt-agent.ts`, `klimop-007`):** `verifieerBestuursGrondwetVorm` geëxporteerd en gesloten weigering op niet-eindige datums toegevoegd; het knooppunt vergelijkt in `stel_bestuursgrondwet_in` de vingerafdruk van de nieuwe grondwet en rolsleutels met de ondertekende inhoud van het laatste besluit (`GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN`), bewaakt eenmalige toepassing op `besluitSha256` (`GRONDWET_BESLUIT_REEDS_TOEGEPAST`) en controleert de geldigheidstermijn op zijn eigen klok; `klimop-007` bijgewerkt.
2. **«Zaad» (`shared/klimop/zaden.ts`, `backend/klimop-zaden-client.ts`, `backend/klimop-knooppunt-agent.ts`, proefopstelling 12, `klimop-013`):** exacte gelijkheid van de verzameling bijlagen en de ondertekende lijst (`ZAAD_ONGETEKEND_ONDERDEEL_AANWEZIG`), bytevolgorde in plaats van `localeCompare`, controle van de verwachte sleutel van de pakketbewaarder (`ZAAD_BEWAARDER_SLEUTEL_KOMT_NIET_OVEREEN`), instelling `beginAnker` op het knooppunt (zonder anker stelt het pakket geen grondwet in en geeft opvolging `GEEN_VERTROUWD_BEGINANKER`) en vergelijking van de `SHA-256` van het volledige ondertekende pakket in de quorumclient (`QUORUM_ZAAD_PAKKET_TEGENSTRIJDIG`).
3. **Immuuncontrole (`shared/klimop/immuunsysteem.ts`, `backend/klimop-immuunsysteem-client.ts`):** een positieve uitkomst alleen bij aanwezigheid van een onafhankelijke referentie en verwachte grootte (`INTEGRITEIT_REFERENTIE_ONTBREEKT`, `INTEGRITEIT_GROOTTE_KOMT_NIET_OVEREEN`); de client reconstrueert referentiestroken met Reed–Solomon zonder de `KEK`-sleutel, en geeft bij ontbrekende referentie `gezondeStrepen = 0`.
4. **Groepsversleuteling (`shared/klimop/identiteit.ts`, artikelen Fase 5):** eerlijk omschreven als vereenvoudigde epochegebaseerde groepsversleuteling naar ideeën uit `RFC 9420` (geen volledige implementatie van `MLS RFC 9420 / TreeKEM`); controle van de welkomsthandtekening (`MLS_WELKOM_HANDTEKENING_ONGELDIG`), eenmalige berichtsleutels per afzender en herhalingsbescherming (`MLS_BERICHT_HERHALING_GEWEIGERD`), functie `verversEigenMlsBladSleutel` en wissen van tijdelijke buffers in `finally` toegevoegd.
5. **Lokale wortels op het knooppunt en Sybil-beoordeling (`shared/klimop/diensten.ts`, `shared/klimop/hechtranken.ts`, `backend/klimop-knooppunt-agent.ts`):** lijsten van synchronisatieapparaten, annuleersleutels, borgen, auditorsleutels en de klok komen uit de lokale staat van het knooppunt; verlopen toetredingen worden weggefilterd en het ontbreken van extern bewijs van fysieke onafhankelijkheid wordt gemeld als `fysiekeOnafhankelijkheidExternBewezen: false`.
6. **Quorum in één proces (`shared/klimop-overzicht-model.ts`, `backend/klimop-overdracht-opslag.ts`):** uitdrukkelijk gemarkeerd als `lokale_simulatie_een_proces` / `lokale_simulatie`, met verificatie van een extern sleutelregister in `verifieerQuorumAttestKeten`.
7. **Tests en documentatie:** uitgebreide test `tests/eenheid/klimop-020-vertrouwensgrenzen-20261121.test.ts` aangemaakt, hoofdstuk «4. Golf 3 — KLIMOP-020» in de tweetalige herstelartikelen opgenomen, dossier `ecosysteem-klimop.json` bijgewerkt en afrondingsbijdrage geregistreerd in `BIJDRAGE-001`.
8. Volgende stap — **KLIMOP-021** (Golf 4: overdrachtsstappen, webpaneel, echte metingen in proefopstellingen, tweetalige pariteit en overige gebreken).

## 4. Stand van de controles bij overdracht

Zie het vastleggingsbericht: daarin staan de feitelijke uitkomsten van `tsc`, de eenheidstests `klimop-` en de proefopstellingen van fasen 4, 5, 6, 7, 9, 12, vlak vóór de vastlegging uitgevoerd.

## 5. Beperkingen

- Samenvoegen alleen door de eigenaar; de samenvoegingsverzoeken zijn gestapeld (nr. 200 → nr. 201 → KLIMOP-020).
- Kunstmatige proeven en proefopstellingen gelden niet als aanvaardingstest van de productieomgeving.
- De modus `open_proef` blijft bestaan voor oudere proefopstellingen die nog niet naar de strenge modus zijn omgezet.
- De uitvoeringsomgeving heeft Node.js 24, terwijl de regels 26.13.0 vereisen.
