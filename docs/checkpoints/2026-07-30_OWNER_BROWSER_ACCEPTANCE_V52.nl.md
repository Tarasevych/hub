> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.uk.md) · **🇳🇱 Nederlands** ([origineel](./2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Browseracceptatie door eigenaar v52 (Eigenaar Browser Acceptance v52)

## Reikwijdte

- B-003 Sessierotatie en verharding van tokenverversing (Sessie Rotation en Refresh Hardening)
- B-004 Doorgifte van intrekkingen (Revocation Propagation)
- B-005 Browseracceptatie door eigenaar (Eigenaar Browser Acceptance)
- L-002 Voortzetting van tweetalige verharding (Bilingual Hardening Continuation)

## Gecontroleerde uitrol

De canary-versie voor de eigenaar draait uitsluitend op de bestaande aangepaste domeinen wanneer `owner_test=1` aanwezig is. Standaard productieroutes, het productie-OAuth-geheim en de productie-autoriteit worden niet vervangen door dit controlepunt.

Terugdraaien (Rollback): AppDeploy-productieversie v51 (`1785379626280`).

## Eigenaars-URL's

- Hub: `https://hub.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- AI: `https://ai.tarasevych.com/?owner_test=1&tab=workspace&lang=uk`
- Mail: `https://mail.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- Cloud: `https://cloud.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- GitHub: `https://github.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- Identity-profiel: `https://id.tarasevych.com/?owner_test=1&tab=profile&lang=uk`
- Identity-sessies: `https://id.tarasevych.com/?owner_test=1&tab=sessions&lang=uk`
- Identity-herstel: `https://id.tarasevych.com/?owner_test=1&tab=recovery&lang=uk`
- API-beveiliging: `https://api.tarasevych.com/?owner_test=1&tab=testing&lang=uk`
- API tweetalige QA: `https://api.tarasevych.com/?owner_test=1&tab=bilingual&lang=uk`
- Systeemwaarheid (System truth): `https://api.tarasevych.com/?owner_test=1&tab=truth&lang=uk`

## Bewijsgrens

Geautomatiseerde QA bewijst deterministisch verversingsgedrag, cookierotatie op de technische host, intrekkingsregistraties, centrale epoch-controles, integriteit van de audit-hashketen en tweetalige kritieke routes. Externe Google OAuth, de levenscyclus van browserpop-ups, browserspecifiek tabbladherstel en cookie-inspectie op aangepaste domeinen blijven observaties in de browser van de eigenaar totdat de eigenaar de controlelijst heeft afgerond.
