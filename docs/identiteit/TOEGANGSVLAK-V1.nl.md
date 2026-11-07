> 🌐 **Taal / Мова:** [Українська](ПЛОЩИНА-ДОСТУПУ-В1.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Access Plane v1 — uniforme aanmeldingscontour

## Probleem
Identity-aanmelding las `GOOGLE_OAUTH_CLIENT_SECRET` uit, terwijl Google Suite afzonderlijke `GOOGLE_SUITE_CLIENT_ID` / `GOOGLE_SUITE_CLIENT_SECRET` / `GOOGLE_SUITE_REDIRECT_URI` gebruikte. Vier Geheim Entries in plaats van één Google Web OAuth Client.

## Contract
- Één Web OAuth Client (`google_suite_web_oauth_client`) voor identity + mail + Drive + calendar + photos.
- Canoniek geheim: `GOOGLE_OAUTH_CLIENT_SECRET`. `GOOGLE_SUITE_CLIENT_SECRET` blijft een alias.
- De redirect is altijd `https://id.tarasevych.com/`.
- De beheerder bewaart en roteert `CLIENT_SECRET` in het beheerpaneel (`/?service=admin&tab=contour`). De waarde wordt na het opslaan nooit meer teruggegeven in de UI.
- De Vault-override heeft voorrang op de platform-Secret Entry.
- Het is niet mogelijk om het laatste actieve geheim of de laatste aanmeldmethode te verwijderen.

## Methoden
De gebruiker kan Google, wachtwoord, Microsoft, Apple, Facebook en telefoonnummer koppelen, ontkoppelen en vervangen — ongeacht waarmee op dat moment is ingelogd. Meerdere Google-accounts per profiel blijven ondersteund via de bestaande principal-isolatie.

## MFA
- TOTP + herstelcodes zijn actief (live).
- SMS, push en WebAuthn tonen eerlijk «niet geconfigureerd», zonder gesimuleerde connected-status.
