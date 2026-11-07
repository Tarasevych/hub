> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-ПОВЕРХНІ-МЕНЮ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Menu: account en sitebeheer

Beheer en API staan niet langer in hetzelfde menu als mail, ruimte en de AI-brug.

- Het accountmenu (Mijn Ruimte en de overige diensten) toont de gebruikersonderdelen. Accountinstellingen en "AI-brug → site" blijven daar staan. Beheer en API zijn uit dit menu verwijderd, samen met de kopieën van hun pagina's.
- Wanneer in dit tabblad het technische profiel is ingeschakeld, bevat de balk bovenaan "Beheer", "API" en "Account". Op de beheerpagina's bevat het zijmenu uitsluitend deze twee onderdelen.
- Een rechtstreeks adres naar Beheer of API zonder ingeschakeld technisch profiel opent de poortpagina: het profiel inschakelen of terugkeren naar het account. De console wordt daarvóór niet getoond.
- De schakelaar "alleen in een actief technisch profiel" voor de serveracties zelf wordt door deze release niet ingeschakeld.

## Na de inhoudsaudit (14-10)

Ook het sitebeheer dat binnen de gebruikersdiensten leefde, verhuist achter het technische profiel (details: `deploy/AUDIT-BEHEER-OPPERVLAK.nl.md`):

- Twee webruimtes. Accountruimte: menu en tabbladen zonder beheer, zelfs wanneer het profiel is ingeschakeld. Technische ruimte (`admin`, `api`, beheerpagina's van `mcp`): menu uitsluitend "Beheer", "API" en "Server en uitrol", tabbladen uitsluitend voor beheer, zonder de modus "eenvoudig/uitgebreid".
- AI-brug → site: "Uitrolpaneel", "Apps" (op de server) en "Archief op pc" staan alleen in de technische ruimte; een rechtstreeks adres (en `dashboard.tarasevych.com`) zonder profiel opent de poortpagina. De profielbalk heeft de knoppen "Uitrol" en "AI-toegang".
- Agenten: "AI-toegang op handtekening" is verwijderd (staat nu onder Beheer → AI-toegang; het oude `#beleid` stuurt door), evenals "Deze server" (staat op `mcp/apps`) en de tabel met poortschakelaars (staat nu op het uitrolpaneel).
- Instellingen → Aanmelden: het recht van een passkey om serverupdates goed te keuren wordt daar niet meer getoond; dit staat onder Beheer → Updates.
- Hub: het dode beheerpaneel met gebruikersbeheer is verwijderd.
