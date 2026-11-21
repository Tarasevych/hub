> 🌐 **Taal:** [Українська](ПЛЮЩ-ПЕРЕДАЧА-РОБОТИ-KLIMOP-020.uk.md) · **Nederlands** | [Herstel na onafhankelijke controle](KLIMOP-HERSTEL-NA-ONAFHANKELIJKE-CONTROLE.nl.md)

# Werkoverdracht KLIMOP-020: vertrouwensgrenzen (Golf 3)

**Status:** tussentijdse vastlegging; de taak is **niet afgerond** en wordt door een ander model voortgezet.
**Datum van overdracht:** 21-11-2026, omstreeks 15:27 UTC.
**Vertakking:** `fix/klimop-020-vertrouwensgrenzen-20261121-151312` (basis: vastlegging `4ec0c22c` van KLIMOP-019, samenvoegingsverzoek nr. 201).

## 1. Wie deed wat

| Rol | Agent en model | Platform | Wat precies |
|---|---|---|---|
| Opdrachtgever | Tarasevych Pavlo (eigenaar) | — | Herstel volgens het rapport van de onafhankelijke controle `AUDIT-002`, vier golven |
| Oorspronkelijke ontwikkeling KLIMOP-001…017 | Gemini 4 Carbon (High) | Google Antigravity | Fasen 0–16 van «Klimop» |
| Onafhankelijke controle `AUDIT-002` | GPT-6.2 Astra (Ultra) | platform niet bevestigd | 55 gebreken (20 hoog, 24 middel, 11 laag) |
| Golven 1–2 (KLIMOP-018, KLIMOP-019) en begin van Golf 3 (KLIMOP-020) | Claude Opus 5.5 (High) | Google Antigravity | Samenvoegingsverzoeken nr. 200, nr. 201 en deze tussentijdse vastlegging |
| Voortzetting van KLIMOP-020 vanaf het stoppunt, daarna KLIMOP-021 | Gemini 4 Carbon (High) | Google Antigravity | Na het verstrijken van de limiet van vijf uur voor Claude Opus 5.5 (High) |

De bijdrage van Claude Opus 5.5 (High) aan KLIMOP-020 staat in `orchestratie/bijdragen/KLIMOP-020/` (BIJDRAGE-001). Gemini 4 Carbon (High) voegt een **eigen afzonderlijke bijdrage** toe met `--bouwt-voort-op` naar deze registratie; bestaande registraties worden niet gewijzigd.

## 2. Wat in KLIMOP-020 al gedaan is (Claude Opus 5.5 (High))

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

### 2.3. Grondwet, begonnen

- `shared/klimop/bestuur.ts`: nieuwe `maakGrondwetWijzigingInhoud` en `berekenGrondwetWijzigingSha256`; `verifieerBestuursBesluitLogboek` herhaalt nu de controles op tijdsbeleid, handtekening van de indiener, afwezigheid van een veto en samenstelling van het quorum.
- **Nog niet gedaan:** het knooppunt (`stel_bestuursgrondwet_in` in `backend/klimop-knooppunt-agent.ts`) vergelijkt `inhoudSha256` van het laatste besluit nog niet met `berekenGrondwetWijzigingSha256`, controleert eenmalige toepassing en geldigheidstermijn nog niet; test `klimop-007` geeft nog willekeurige inhoud `{ doelVersieVolgnummer: 2 }` mee.

## 3. Wat in KLIMOP-020 nog moet gebeuren

1. **Grondwet op het knooppunt:** vingerafdruk van de nieuwe grondwet en rolsleutels vergelijken met de ondertekende inhoud van het laatste besluit (`GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN`), eenmalige toepassing (verzameling toegepaste `besluitSha256`), geldigheidstermijn volgens de klok van het knooppunt, hercontrole van de vorm van de nieuwe grondwet; test klimop-007 bijwerken (grondwet v2 vóór het voorstel aanmaken en `maakGrondwetWijzigingInhoud(...)` als `inhoudPayload` meegeven; zo nodig `t0Ms` naar het verleden verplaatsen).
2. **«Zaad»:** in `verifieerKlimopZaadPakket` exacte gelijkheid van de verzameling bijlagen en de ondertekende lijst, optionele verwachte sleutel van de pakketbewaarder; in `stelKlimopZaadPakketSamen` bytevolgorde in plaats van `localeCompare`; in het knooppunt de instelling `beginAnker` (FROST-sleutel van de raad en sleutel van de bewaarder): zonder anker wordt het pakket bewaard maar stelt het geen grondwet in; `registreer_opvolgings_overdracht` zonder geldende grondwet of anker wordt geweigerd; de client vergelijkt de vingerafdruk van het volledige ondertekende pakket en niet alleen de Merkle-wortel; proefopstelling 12 en test klimop-013 bijwerken (`beginAnker` met `frostGen1.groepsPubHex`).
3. **Immuuncontrole:** een positieve uitkomst alleen met referentie (anders «niet gecontroleerd»), verwachte grootte (`shared/klimop/immuunsysteem.ts`, `backend/klimop-immuunsysteem-client.ts`).
4. **Groepsversleuteling:** de bewering over RFC 9420 eerlijk intrekken in code en artikelen («vereenvoudigde groepsversleuteling, geen MLS RFC 9420») of controle van de welkomsthandtekening en registratie van berichtnummers toevoegen.
5. **Vertrouwde bevoegdheden uit het verzoek:** lijsten van apparaten, borgen, auditorsleutels en de huidige tijd uit de lokale staat van het knooppunt halen; gebrek aan bewijs van onafhankelijkheid afzonderlijk tonen.
6. **Quorum in één proces** (`backend/klimop-overdracht-opslag.ts`): de uitkomst als «lokale nabootsing» markeren.
7. Nieuwe test `tests/eenheid/klimop-020-vertrouwensgrenzen-20261121.test.ts` (positieve en negatieve gevallen per punt, strenge modus over het netwerk, taalwet, toets met 15 vragen), hoofdstuk «4. Golf 3 — KLIMOP-020» in de herstelartikelen (uk, nl en kopie `.md`), dossier `ecosysteem-klimop`, bijdrage, `orch controleer`, `behoud --tegen 06312df6`, `versheid --fase overdracht`, vastlegging, samenvoegingsverzoek bovenop nr. 201.
8. Daarna **KLIMOP-021** (Golf 4, overige middelzware en lichte gebreken) volgens de lijst in het controlerapport.

## 4. Stand van de controles bij overdracht

Zie het vastleggingsbericht: daarin staan de feitelijke uitkomsten van `tsc`, de eenheidstests `klimop-` en de proefopstellingen van fasen 4, 5, 6, 7, 9, 12, vlak vóór de vastlegging uitgevoerd.

## 5. Beperkingen

- Samenvoegen alleen door de eigenaar; de samenvoegingsverzoeken zijn gestapeld (nr. 200 → nr. 201 → KLIMOP-020).
- Kunstmatige proeven en proefopstellingen gelden niet als aanvaardingstest van de productieomgeving.
- De modus `open_proef` blijft bestaan voor oudere proefopstellingen die nog niet naar de strenge modus zijn omgezet.
- De uitvoeringsomgeving heeft Node.js 24, terwijl de regels 26.13.0 vereisen.
