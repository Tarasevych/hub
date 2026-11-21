> 🌐 **Мова / Taal:** [Українська](ПЛЮЩ-ЕТАП-13-ПЛАТФОРМНА-ІНТЕГРАЦІЯ-ТА-ДЗЕРКАЛЬНА-ЗВІРКА.uk.md) · **Nederlands** | [Startpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Klimop — Fase 13: Platformintegratie, hulpmiddelen voor 14 AI-agenten en Stap-1-spiegelverificatie (`KLIMOP-014`)

> **Status:** voltooid en geïntegreerd in de hoofdcodebasis van «Mijn Ruimte» in de veilige modus van parallelle spiegelverificatie (§35 van het manifest).
> **Bevoegdheidsgrens (§3.2, §35):** de actieve databank `PostgreSQL 18.6`, de `systemd`-diensten, het installatieprogramma `/usr/local/sbin/mijn-ruimte-installeer`, de versleutelde `age`-reservekopieën en alle 11 draaiende subdomeinen `*.tarasevych.com` blijven volledig onaangetast; kosten — `0` euro.

---

## 1. Doel van deze fase en aansluiting op Fasen 0–12 (`KLIMOP-001`..`KLIMOP-013`)

Na de afronding van alle twaalf basisfasen van het Hoofdarchitectuurmanifest «Klimop» ([`ARCHITECTUURMANIFEST-KLIMOP.nl.md`](./ARCHITECTUURMANIFEST-KLIMOP.nl.md)) en alle 25 verplichte tweetalige documenten (§44) functioneerden de twaalf cryptografische kernmodules `shared/klimop/*.ts` en de beproevingsnetwerken nog los van de hoofdrouter, de agentpoort en de webinterface van «Mijn Ruimte».

Volgens hoofdstuk 35 van het manifest (*«Geleidelijke ombouw zonder gegevensverlies»*) is de eerste praktische stap bij het inbouwen in het platform **Stap 1 — risicoloze spiegelverificatie en waarneembaarheid zonder uitschakeling van het bestaande systeem**.

Fase 13 (`KLIMOP-014`) verbindt alle twaalf kernmodules `shared/klimop/*.ts` met de drie lagen van het platform «Mijn Ruimte»:

1. **Serverlaag voor de eigenaar (`/api/owner/klimop/*`)** op `mcp.tarasevych.com` en `admin.tarasevych.com`;
2. **Hulpmiddelenlaag voor alle 14 AI-agenten (`klimop_*`)** via Connector v2 in de technische ruimte (`kant: 'beheer'`);
3. **Tweetalig webpaneel voor beheer en spiegelverificatie (`KlimopPaneel.tsx`)** binnen het onderdeel «Coördinatie» (`TabOrch.tsx`), inclusief vierlaagse contexthulp «?».

---

## 2. Architectuur en onderdelen in de code

| Onderdeel | Pad in de opslagplaats | Rol en verantwoordelijkheid |
|---|---|---|
| Gedeeld tweetalig model | [`shared/klimop-overzicht-model.ts`](../../shared/klimop-overzicht-model.ts) | Paden `KLIMOP_PADEN`, hulpmiddelnamen `KLIMOP_TOOL_NAMEN`, tweetalige dienstnamen `KLIMOP_DIENST_TEKST`, foutcodes `KLIMOP_CODES` en contexthulp `HELP_KLIMOP`. |
| Gemeenschappelijke serverbrug | [`backend/klimop-platform-brug.ts`](../../backend/klimop-platform-brug.ts) | Zuivere functies `klimopOverzicht`, `klimopArchitectuurToets` en `klimopSpiegelControle` zonder rechtstreekse afhankelijkheid van `PostgreSQL` — gedeelde kern voor webroutes én MCP. |
| Eigenaarsroutes | [`backend/klimop-paden.ts`](../../backend/klimop-paden.ts), [`backend/index.ts`](../../backend/index.ts) | Beveiligde poort `POST /api/owner/klimop/{overzicht,architectuur-toets,spiegel-controle}` (uitsluitend `mcp`/`admin`, uitsluitend de eigenaar, snelheidsbegrenzing en registratie in `app.audit`). |
| MCP-definities en uitvoering | [`backend/klimop-hulpmiddeldefinities.ts`](../../backend/klimop-hulpmiddeldefinities.ts), [`backend/klimop-hulpmiddelen.ts`](../../backend/klimop-hulpmiddelen.ts) | Drie technische hulpmiddelen `klimop_overzicht`, `klimop_architectuur_toets`, `klimop_spiegel_controle` voor alle 14 AI-agenten met afgeschermde serverpaden en uurlimiet. |
| Registers van Connector v2 | [`shared/connector-v2/catalogus.ts`](../../shared/connector-v2/catalogus.ts), [`shared/ai-ruimte.ts`](../../shared/ai-ruimte.ts), [`shared/ai-beleid/catalogus.ts`](../../shared/ai-beleid/catalogus.ts), [`shared/mcp-acties.ts`](../../shared/mcp-acties.ts) | Tweetalige omschrijvingen voor koppelrechten (alle namen `<= 63` tekens voor alle 14 agenten), isolatie in de technische ruimte, `deploy.status`-bevoegdheid en logboekzinnen. |
| Webpaneel en klantmodule | [`src/klimop/klimop-klant.ts`](../../src/klimop/klimop-klant.ts), [`src/agenten/KlimopPaneel.tsx`](../../src/agenten/KlimopPaneel.tsx), [`src/agenten/TabOrch.tsx`](../../src/agenten/TabOrch.tsx) | Actueel overzicht van de 12 kernmodules en de Merkle-wortel van het Zaadpakket, spiegelverificatie per dienst en de 15-punten-architectuurtoets in het Oekraïens en Nederlands. |

---

## 3. Wat Stap 1 (`klimopSpiegelControle`) toetst voor elk van de 11 diensten

Bij een controle van een willekeurige van de 11 diensten (`werkblad`, `postvak`, `identiteit`, `wolkopslag`, `agenda`, `ai_ruimte`, `mcp_poort`, `ontwikkelmiddelen`, `slimwoon`, `verbinders`, `beheer_en_diagnose`) voert de server uitsluitend in geïsoleerd werkgeheugen het volgende uit:

1. Maakt een eenmalige zelfsoevereine persoonsidentiteit `klid1_…` aan en leidt een paarsgewijs ongecorreleerd dienstpseudoniem `psid1_…` plus een aparte 32-byte `HKDF-SHA-256`-sleutel af (`leidGeisoleerdeDienstContextAf`);
2. Versleutelt een kunstmatig controle-item met envelopversleuteling `ChaCha20-Poly1305` en verdeelt het over `6` Reed-Solomon-stroken `(4 + 2)` (`versleutelEnVerdeelObject`), simuleert de uitval van `2` stroken, herstelt het object byte-identiek uit de overige `4` stroken (`herstelEnOntsleutelObject`) en vergelijkt de `SHA-256`;
3. Maakt een met `Ed25519` ondertekende en versleutelde `CRDT`-operatie aan, voert commutatieve samenvoeging uit (`voegCrdtStatenSamen`) en bewijst **cryptografische kruisdienstisolatie**: ontsleuteling met de sleutel van een andere dienst faalt gegarandeerd (`kruisDienstIsolatieAfgedwongen === true`);
4. Voert tweezijdige pariteitscontrole van inhouds- en rechtenafdrukken uit (`vergelijkErfenisEnKlimopStaat`), toetst het overdrachtsbesluit (`beslisOverDienstOverdrachtStap` van `alleen_erfenis_postgres` naar gereedheid voor `schaduw_dubbel_schrijven`) en overschrijft alle tijdelijke sleutels met nullen (`productieDatabankGewijzigd: false`).

---

## 4. Verplichte architectuurcontrole aan de 15 vragen (§42 van het manifest)

1. **Nieuw enkel storingspunt:** ontstaat niet — de brug steunt op dezelfde twaalf zelfstandige kernmodules zonder externe cloudmonopolies.
2. **Verborgen bevoegdheden:** afwezig — de paden `/api/owner/klimop/*` zijn uitsluitend toegankelijk voor de eigenaar op `mcp.*`/`admin.*`, en de `klimop_*`-hulpmiddelen zijn strikt beperkt tot de technische ruimte (`kant: 'beheer'`) als lees- en toetshulpmiddelen.
3. **Wettig herstel:** zowel de `age`-reservekopieën als de Merkle-controle van het Zaadpakket blijven volledig beschikbaar.
4. **Gegevensbescherming:** Stap-1-controles draaien enkel op kunstmatige geheugenelementen met directe nulstelling van tijdelijke sleutels.
5. **Onnodige metagegevens:** voor AI-agenten wordt het lokale bestandspad op de server gemaskeerd (`werkkopie-server`); er worden geen e-mailadressen of persoonsgegevens gedeeld.
6. **Intrekbaarheid van rechten:** elk van de drie `klimop_*`-hulpmiddelen is afzonderlijk intrekbaar in Connector v2.
7. **Compatibiliteit tussen knooppunten:** gebruikt ongewijzigd de canonieke datastructuren van Fasen 1–12.
8. **Isolatie bij storing:** bij ontbrekende bronkopie op de server geeft het overzicht eerlijk `KLIMOP_GEEN_BRON` terug zonder andere onderdelen van Coördinatie te verstoren.
9. **Bescherming van de mens:** transparante tweetalige weergave zonder verborgen automatische ingrepen.
10. **Verifieerbaarheid:** volledig afgedekt door de eenheidstests `tests/eenheid/klimop-014-platformintegratie-spiegel-20261121.test.ts` en het beveiligingslogboek.
11. **Veilig terugdraaien:** de productiedatabank `PostgreSQL 18.6` ondergaat geen enkele wijziging (`productieDatabankGewijzigd: false`).
12. **Onafhankelijkheid van de oorspronkelijke maker:** de Merkle-wortel van het Zaadpakket is met open standaarden controleerbaar.
13. **Zuinig middelengebruik:** snelheidsgrenzen gelden zowel op HTTP (`120/60` per minuut) als op MCP (`240` per uur).
14. **Rechten van gegevenseigenaren:** geen enkele rij uit gebruikerstabellen wordt gelezen of aangepast.
15. **Veiligheid van verbinders:** de `klimop_*`-hulpmiddelen verschijnen nooit in de privéruimte en kunnen nooit zelfstandig goedkeuren of uitrollen.
