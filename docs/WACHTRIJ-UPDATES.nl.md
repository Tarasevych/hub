> 🌐 **Taal:** [Українська](ПОРЯДОК-ЧЕРГИ-ОНОВЛЕНЬ.uk.md) · **Nederlands** | [Startpagina](../README.md)

# Regeling voor de cumulatieve updatewachtrij en flexibele agentrechten (UPD-010)

## 1. Hoe de slimme cumulatieve updatewachtrij werkt

1. **Voorbereiden en uploaden naar de server:** agenten die van de eigenaar toestemming kregen onder «Updates → Instellingen → Wie bereidt updates voor», voeren de ontwikkeling uit, publiceren een geverifieerde release op GitHub volgens `TRACE-001` en zetten het pakket in de wachtrij op de server (via de voorbereidingshulpmiddelen of ophalen uit GitHub op de achtergrond).
2. **Cumulatieve versies:** elke volgende update in de wachtrij bouwt voort op de vorige en bevat alle eerdere wijzigingen.
3. **Installeren op keuze van de eigenaar:** staan er meerdere niet-geïnstalleerde updates klaar (bijvoorbeeld 5), dan hoeft de eigenaar ze niet één voor één te installeren. Het volstaat om de nieuwste versie (of elke gewenste tussenversie) te kiezen en met de eigen toegangssleutel goed te keuren.
4. **Automatisch afsluiten van eerdere versies:** pas na een werkelijk geslaagde installatie van de gekozen versie zet de server alle oudere wachtende voorstellen met een lager versienummer automatisch op status `ingehaald` («Opgenomen in nieuwere»), ruimt hun tijdelijke archieven op en sluit de bijbehorende meldingen. Bij een mislukte installatie of terugdraai blijven eerdere voorstellen ongewijzigd in de wachtrij staan.

## 2. Achtergrond-upload en voortgang op alle subdomeinen

- Wisselen van tabblad binnen «Updates» wist de wizard niet en breekt een lopende upload niet af.
- Ophalen van een GitHub-release op de achtergrond loopt op de server zelf door, ook wanneer u naar een ander tabblad of subdomein gaat of de browser sluit.
- Een zwevende voortgangsbalk rechtsonder toont de live stand van upload en installatie op alle subdomeinen (`hub`, `mail`, `admin`, `ai`, enz.), met een inklapbare compacte weergave en directe terugkeer naar «Updates».

## 3. Flexibele agentrechten (uitsluitend met bevestiging van de eigenaar)

Onder «Wie bereidt updates voor» kan de eigenaar per agent het volgende instellen of wijzigen:

- **Toegangsniveau:**
  - `Alleen uploaden naar wachtrij` (`uploaden`, veilige standaard) — de agent mag pakketten voorbereiden en uploaden, terwijl de eigenaar altijd beslist over de installatie;
  - `Uploaden + installeren` (`installeren`) — gedelegeerd niveau. Toekennen of wijzigen vereist sterke bevestiging van de eigenaar. Op root-niveau werkt installeren zonder handmatige toegangssleutel per keer uitsluitend nadat de eigenaar afzonderlijk het beleid `automatisch_beperkt` heeft ondertekend (de toegangssleutel van de eigenaar wordt nooit omzeild).
- **Beperking van de toestemming:**
  - `Voor periode` (`periode`) — tot 30 dagen of tot intrekking;
  - `Eenmalig` (`eenmalig`) — precies 1 keer, daarna automatisch verbruikt;
  - `Vast aantal keren` (`aantal`) — een limiet van 1 tot 1000 keer met zichtbare teller (`gebruikt / maximum`);
  - `Bevestiging per keer` (`bevestiging_per_keer`) — elke handeling vraagt afzonderlijke bevestiging.

Elke toekenning, uitbreiding, beperking of intrekking van rechten vereist bevestiging van de eigenaar, wordt vastgelegd in het auditlogboek en stuurt een melding.
