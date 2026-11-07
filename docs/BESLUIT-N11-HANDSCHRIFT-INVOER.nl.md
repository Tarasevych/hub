> 🌐 **Taal / Мова:** [Українська](РІШЕННЯ-Н11-РУКОПИСНЕ-ВВЕДЕННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](INDEX.nl.md)

# ADR N-11 — Handschriftinvoer en IME

- Status: voorgesteld (`proposed`), afzonderlijk project
- Huidige N-11: uitsluitend lokale transliteratiehulpmiddelen, schermtoetsenbord en expliciete UA/NL-keuze.
- Besluit: geen handschriftherkenning inbouwen in deze uitrol en het handtekeningcanvas in de documenteditor niet aanduiden als een e-mail-IME.

Het afzonderlijke project moet vóór implementatie vastleggen: herkenning op het apparaat (`on-device`) of op de server (`server recognition`); ondersteunde talen en modellen; bewaartermijn (`retention`) van handschriftstreken; toestemming (`consent`) en privacyverklaring (`privacy notice`); terugval bij offline/fouten (`offline/error fallback`); toegankelijkheid (`accessibility`) zonder afhankelijkheid van gebaren; begrensde payload (`bounded payload`) en snelheidslimieten (`rate limits`); dreigingsmodel (`threat model`) voor onvertrouwde streken en modeluitvoer; nauwkeurigheidsmetrieken en acceptatie door de eigenaar (`owner acceptance`).

Totdat deze controlepoorten (`gates`) zijn doorlopen, behoudt het product het eigen toetsenbord en de IME van de browser, en vermeldt de gebruikersinterface expliciet dat handschriftherkenning niet is ingeschakeld.
