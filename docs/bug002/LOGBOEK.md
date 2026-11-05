> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./LOGBOEK.uk.md) · [🇳🇱 **Nederlandse versie**](./LOGBOEK.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# BUG-002 — «Перевірка всіх адрес» springt zelf open en dicht

Reproductie: `node --experimental-strip-types tests/e2e/scan-melding.e2e.ts <uitmap>`. Dat is de echte component `ContactenScanMelding` tegen een
nepserver. Die bootst na: HTTP 502 op `scan/status` en `scan/start`, een time-out (afgebroken verzoek) en een run die de server na zijn eigen pogingen als «fout» opgeeft.
Daarnaast doet het script een tabwissel naar «Контакти», een nieuwe mount (sessiecontrole), het periodieke bijwerken en verversen. De volledige logboeken staan in `logboek-{voor,na}-{computer,telefoon}.json`.

## Voor de fix (computer 1440, uittreksel)
```
  1565  zicht venster:open → venster:klein     GEBRUIKER minimaliseert
 10572  GEBRUIKER wisselt naar «Контакти» en terug
 10575  zicht venster:klein → geen
 10784  net scan/start → 502                    (automatisch hervatten na «fout»)
 11384  zicht geen → venster:open               ← springt ZELF weer open
 14381  GEBRUIKER (sessie opnieuw gecontroleerd → hermount)
 14385  zicht venster:open → geen
 14594  zicht geen → venster:open               ← en weer
 14717  net scan/auto → 200                     ← elke mount opnieuw scan/auto
 22607  net scan/status → 502                   ← daarna GEEN statusvraag meer: de voortgang blijft hangen
 ── herladen ──
   137  zicht geen → venster:open               ← na verversen weer open, ondanks «Згорнути»
  2752  net scan/status → time-out              ← en weer stil
```
Samenvatting: het venster ging na de keuze «Згорнути» 3 keer vanzelf open. Er waren 4 aanroepen van `scan/auto` en 2 verzoeken tegelijk. Na een 502 of time-out werd de stand niet meer bijgewerkt.

## Na de fix (computer 1440, uittreksel)
```
  1563  zicht venster:open → venster:klein     GEBRUIKER minimaliseert
 10576  zicht venster:klein → geen              (tabblad «Контакти»: daar staat het paneel zelf)
 11382  zicht geen → venster:klein              ← terug, maar BLIJFT in het dok
 14588  zicht geen → venster:klein              (na hermount: blijft klein)
 20810  net scan/status → 502
 25937  net scan/status → 200                   ← bijhouden gaat verder na de pauze
 ── herladen ──
   143  zicht geen → venster:klein              ← keuze bewaard na verversen
  2759  net scan/status → 200
```
Samenvatting: het venster ging 0 keer vanzelf open en er was steeds 1 verzoek tegelijk. `scan/auto` werd 1 keer per paginabezoek aangeroepen (daarna pas weer na 15 min). De voortgang liep door na 502 en time-out.
Op de telefoon (390) hetzelfde: de strook blijft in de stand die de gebruiker koos.

## Oorzaak in gewone woorden
1. Het venster bestond alleen zolang de controle «iets te melden» had. Telkens als dat even niet zo was, werd het weggehaald en daarna nieuw neergezet. Dat gebeurde bij een tabwissel, een nieuwe mount, een run die als fout eindigde en opnieuw begon, het bijwerken en bij verversen.
   Het vensterbeheer onthoudt «geminimaliseerd» alleen zolang het venster bestaat, dus het nieuwe venster opende gewoon weer.
2. De controle zelf werd door meerdere mechanismen tegelijk aangestuurd:
   - elke mount riep `scan/auto` opnieuw aan;
   - elk paneel (melding en instellingen/«Контакти») hervatte apart;
   - na elke nieuwe «fout» kwam er weer een nieuwe hervatting, bovenop de 12 pogingen van de server. Daar zat geen grens op.
3. Eén mislukte statusvraag (502 of time-out) stopte het bijhouden van de voortgang zonder melding.

## Oplossing
- `src/afzenders/scan-weergave.ts` scheidt de controle van het venster:
  - de keuze open, klein of weg wordt per sessie bewaard en bij elke nieuwe mount teruggezet;
  - het venster blijft nog 6 s staan na een korte wissel, zodat het niet knippert;
  - het korte bijwerken opent het venster niet zelf;
  - `scan/auto` gaat hoogstens 1 keer per 15 min;
  - automatisch hervatten: steeds 1 tegelijk, hoogstens 3 keer per bezoek, minstens 30 s ertussen;
  - starten gebeurt steeds met 1 verzoek tegelijk.
- `src/afzenders/api.ts`: een mislukte statusvraag wordt opnieuw gesteld met een groeiende pauze (2,5 tot 30 s, hoogstens 12 keer).
- Pauze, stoppen, hervatten vanaf de bewaarde pagina (server) en de herhaalladder van de server blijven ongewijzigd.
