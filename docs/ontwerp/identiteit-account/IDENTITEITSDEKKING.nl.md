> 🌐 **Taal / Мова:** [Українська](ПОКРИТТЯ-ІДЕНТИЧНОСТІ.uk.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../INDEX.nl.md)

# Dekking van categorie `identity` — 12 secties (`IDENTITEITSDEKKING.nl.md`)

- **Bron van de lijst:** `shared/menu-model.ts → MENU_PAGINAS.identity` en `src/identiteit/identiteit-tabs.ts`.
- **Interactief prototype:** [`ПРОТОТИП-АКАУНТА.html`](./ПРОТОТИП-АКАУНТА.html).
- **Productie-UI in de applicatie:** `src/identiteit/IdentiteitAccountPagina.tsx`, `src/identiteit/Profielfoto.tsx`, `src/identiteit/identiteit-account.css` (`IDENTITY-002`).
- **Technische specificatie:** [`SPECIFICATIE-ACCOUNT-2026-11-04.nl.md`](./SPECIFICATIE-ACCOUNT-2026-11-04.nl.md).

| # | Sectie | Dekking in prototype en applicatie | Status |
|---|---|---|---|
| 1 | `account` | Profielfoto via klik op avatar (apparaat / service / HTTPS-link), gecentreerde camera 22px, prullenbak 24px op de hoek, naam, e-mail, rol, blokkering van eigenaar-verwijdering (`OWNER_NIET_WISSEN`) | ✅ |
| 2 | `identity` | Overzicht van gekoppelde identiteiten met providerlogo's, primaire identiteit, koppelen/ontkoppelen | ✅ |
| 3 | `methods` | Google, wachtwoord + TOTP, Microsoft, Apple, Passkey (eerlijke beschikbaarheidsstatus) | ✅ |
| 4 | `sessions` | Apparaten en browsersessies, huidige sessie herkenbaar, overal afmelden | ✅ |
| 5 | `security` | TOTP (instellen/vervangen), step-up bevestiging, beveiligingsmeldingen | ✅ |
| 6 | `recovery` | Herstelcodes, rotatie en downloaden als `.txt` | ✅ |
| 7 | `personalization` | Weergavedichtheid, animaties en knopuitleg | ✅ |
| 8 | `themes` | 4 paletten (`Grifel`, `Puur`, `Violet`, `Kleur`), modus licht/donker/auto | ✅ |
| 9 | `languages` | Interfacetaal (`uk`/`nl`) en datumnotatie | ✅ |
| 10 | `menu` | Volgorde en zichtbaarheid van diensten, zijbalk en dock | ✅ |
| 11 | `widgets` | Volgorde en zichtbaarheid van werkbladwidgets | ✅ |
| 12 | `sharing` | Gedeelde toegang, rechtenniveaus en gastsessies | ✅ |

**Totaal: 12/12 secties geïntegreerd op één pagina met inhoudsopgave (`.ia-toc`) en markering tijdens scrollen.**
