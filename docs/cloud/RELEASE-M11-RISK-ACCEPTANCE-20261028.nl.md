> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RELEASE-M11-RISK-ACCEPTANCE-20261028.uk.md) · **🇳🇱 Nederlands** ([origineel](./RELEASE-M11-RISK-ACCEPTANCE-20261028.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Volledige Cloud-integratie M11 — risicoacceptatie voor release (28-10-2026)

Basis: originele `mijn-ruimte-20261028-131829.tar.gz`, met behoud van alle bestanden en functionaliteit van de parallelle release «Werkblad Blokken», aangevuld met M1–M11 en M11 QA-fixes.

De eigenaar van de site heeft in het gesprek van 28-10-2026 expliciet aangegeven het archief gereed te maken voor productie zonder staging, met acceptatie van het risico en een zelfstandige rollback in geval van een storing. Dit is een **uitzondering op de interne preflight-regel**, en geen bewijs dat onvoltooide integraties volledig operationeel zijn geworden. Technische feature-flags blijven standaard gesloten; beveiligings- en toegangsregels worden niet uitgeschakeld.

Autonoom gecontroleerd: 252/252 cloud unit-tests, projectkaart, transpilatiesyntaxis van 56 TS/TSX-bestanden, interne audits van de zoekcatalogus, L002, Mail, contrast en `bash -n` voor scripts. Er is geen enkel bronbestand uit het basisarchief verwijderd; de controle-SHA-256 van het origineel en de wijzigingen zijn opgenomen in het externe rapport.

NIET GECONTROLEERD: Node.js 24+ volledige `npm ci`/typecheck/build, migraties op PostgreSQL, echte OAuth en refresh/revoke, echte end-to-end overdrachten tussen alle 11 providertypen, MOVE na het opnieuw inlezen van de kopie, herstel van grote bestanden, delen (sharing), onafhankelijke cryptografische audit en browser-E2E. Deze functies zijn **niet gecertificeerd**, zelfs niet als er code of knoppen aanwezig zijn. De bestaande `cloud-m10-uitgave-voorcontrole.mjs` blijft BLOCKED rapporteren zonder vervalsing van bewijsstukken.

**Kritieke beperking:** nieuwe Cloud-modules staan standaard in de testmodus (uitgeschakeld). Na installatie mogen deze aanbieders niet als beschikbaar voor alle gebruikers worden beschouwd. Bestaande Google Drive-, UFW v0.3- en andere functies van de huidige basis moeten ongewijzigd blijven totdat geverifieerde adapters afzonderlijk worden ingeschakeld.

Operationele waarborgen: uitvoeren via de standaardwizard, met passkey en eigen back-up, geïsoleerde geheimen en mogelijkheid tot rollback; deel nooit productie-inloggegevens in de chat.
