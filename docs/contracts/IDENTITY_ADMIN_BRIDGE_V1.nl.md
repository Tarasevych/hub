> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./IDENTITY_ADMIN_BRIDGE_V1.uk.md) · **🇳🇱 Nederlands** ([origineel](./IDENTITY_ADMIN_BRIDGE_V1.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Identity Admin-brug v1 (Identity Admin Bridge v1)

## Bron van waarheid
De Hub-backend blijft de enige bron van waarheid voor gebruikers, toegangsverzoeken, rollen, werkruimtes, verwijdering, herstel en audit.

## Stroom (Stroom)
1. Een geauthenticeerd Hub-tabblad maakt een eenmalige overdrachtscode (`handoff code`) aan voor `identity`.
2. De code verloopt na twee minuten en kan slechts één keer worden gebruikt.
3. Identity wisselt de code server-naar-server in.
4. Hub maakt een servicegebonden sessie aan met `identity.profile.read` en, voor de eigenaar, `identity.admin`.
5. De Identity-applicatie slaat het servicetoken uitsluitend op in een `host-only` `HttpOnly`-cookie die wordt geselecteerd via een niet-geheime identificatie per tabblad.
6. Beheermutaties in Identity roepen de service-admin-endpoints van Hub aan, die dezelfde bedrijfsfuncties hergebruiken als de legacy Hub-admin-endpoints.

## Tabbladisolatie
Elk browsertabblad slaat alleen een niet-geheime tabblad-ID op in `sessionStorage`. Het geheime servicetoken wordt bewaard in een `HttpOnly`-cookie waarvan de naam die tabblad-ID bevat. Uitloggen in één Identity-tabblad trekt alleen die specifieke servicesessie in.

## Veiligheid
- eenmalige overdracht (`one-time handoff`);
- standaard weigeren (`deny by default`);
- eigenaarscontroles bij elk administratief verzoek;
- herstelbare verwijdering;
- alle Hub- en servicesessies worden ingetrokken wanneer een account wordt verwijderd;
- auditregels voor handoff en administratieve mutaties;
- geen servicetoken in URL's, `localStorage`, `sessionStorage` of frontendlogs.

## Terugdraaien (Rollback)
De legacy Hub-admin-backendroutes blijven beschikbaar. De normale Hub-UI stelt ze niet langer bloot. `?legacy-admin=1` is een noodingang voor rollback, uitsluitend voor de eigenaar.
