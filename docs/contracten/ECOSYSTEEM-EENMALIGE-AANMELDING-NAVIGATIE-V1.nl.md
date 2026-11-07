> 🌐 **Taal / Мова:** [Українська](НАВІГАЦІЯ-ЄДИНОГО-ВХОДУ-ЕКОСИСТЕМИ-В1.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Ecosysteem SSO-navigatie v1

## Doel
Alle productiesubdomeinen gedragen zich als onderdelen van één ecosysteem in plaats van als losstaande websites.

## Sessiemodel
- Hub behoudt zijn bestaande tabbladgebonden (`tab-scoped`) Hub-sessie.
- Elke service onderhoudt een `host-only` `HttpOnly`-sessie die wordt geselecteerd via een niet-geheime tabblad-ID (`tab ID`).
- Een eenmalige overdracht (`handoff`) met een geldigheid van twee minuten draagt het geselecteerde account over tussen services binnen hetzelfde browsertabblad.
- Navigatie van service naar service en van service naar Hub verstuurt nooit access-tokens, account-ID's of e-mailadressen in URL's.

## Stromen (Flows)
- Hub -> service: de Hub-sessie maakt een handoff aan voor de doelservice.
- Service -> service: de huidige servicesessie maakt een handoff aan via Hub.
- Service -> Hub: de huidige servicesessie maakt een Hub-handoff aan; Hub neemt deze op in de eigen tabbladsessie.
- Rechtstreeks bezoek aan een service zonder aanmelding: de service stuurt de gebruiker naar Hub met `continue=<service>`; na Google-aanmelding keert Hub terug via een handoff.

## Bron van waarheid
De Hub-backend blijft de bron van waarheid voor gebruikers, status, werkruimtes, meldingen, machtigingen en audit.

## UI-contract
Alle services gebruiken dezelfde volgorde in de globale zijbalk (rail), dezelfde thematokens, taalbediening, indicator van de huidige service, profielcontext en meldingsteller.
