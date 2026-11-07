> 🌐 **Taal / Мова:** [Українська](ОГЛЯД-ОБЛІКОВОГО-ЗАПИСУ.uk.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../INDEX.nl.md)

# Account: één actueel ontwerp (`README-account.nl.md`)

## Actueel prototype en implementatie

**[`identity-live.html`](./identity-live.html)** — **één pagina**: alle 12 `identity`-onderdelen staan onder elkaar op één scherm; het menu wisselt geen losse pagina's meer maar **scrollt vloeiend naar de gekozen sectie** (met automatische `scroll-spy`-markering).
De productie-implementatie in de applicatie staat in `src/identiteit/IdentiteitAccountPagina.tsx`, `src/identiteit/Profielfoto.tsx`, `src/identiteit/identiteit-account.css` en `src/identiteit/identiteit-tabs.ts` (`IDENTITY-002`).

## Wat is verwerkt

- **Één pagina met 12 secties:** Personalisatie, Menu, Thema's, Talen, Widgets, Delen, Identiteiten, Account en gegevens, Sessies en apparaten, Aanmeldmethoden, Beveiliging, Toegangsherstel.
- **Inhoudsopgave (`.ia-toc`):** klikken op een onderdeel scrollt naar de sectie (`scroll-margin-top: 170px` / `150px` op mobiel); tijdens scrollen wordt het actieve item gemarkeerd en blijft de inhoudsopgave onder de bovenbalk plakken (`top: 70px` / `62px`).
- **Profielfoto (`Profielfoto.tsx`):** klikken op de avatar opent het modale dialoogvenster (`.ia-dialoog-achtergrond`, `z-index: 99500`) met drie bronnen (apparaat / servicefoto / HTTPS-link), voorbeeldweergave en toepassen-knop.
- **Camera en prullenbak:** het camera-icoon (`22×22 px`) staat exact in het midden van de avatar (`top: 50%; left: 50%; transform: translate(-50%, -50%)`), terwijl de prullenbakknop (`24×24 px`) rechtsboven op de hoek zit (`top: -6px; right: -6px`) zonder overlap.
- **Containerresponsief (`@container ia-account`):** tot `640 px` staan knoppen over de volledige breedte en blijven statusbadges compact.
- **Thema's:** volledige ondersteuning voor alle 4 paletten (`Grifel`, `Puur`, `Violet`, `Kleur`), licht/donker en hoog contrast via `src/ontwerp/tokens.css`.

## Gerelateerde documenten

- [`TZ-account-2026-11-04.nl.md`](./SPECIFICATIE-ACCOUNT-2026-11-04.nl.md) ([🇺🇦 UK](ТЕХНІЧНЕ-ЗАВДАННЯ-ОБЛІКОВОГО-ЗАПИСУ-2026-11-04.uk.md)) — technische specificatie (API-routes, staten, tests, acceptatiecriteria).
- [`identity-coverage.nl.md`](./IDENTITEITSDEKKING.nl.md) ([🇺🇦 UK](ПОКРИТТЯ-ІДЕНТИЧНОСТІ.uk.md)) — dekkingsmatrix 12/12 `identity`-secties.
- [`ontwerp-account-samenvatting.nl.md`](./ONTWERP-ACCOUNT-SAMENVATTING.nl.md) ([🇺🇦 UK](ПІДСУМОК-ПРОЄКТУ-ОБЛІКОВОГО-ЗАПИСУ.uk.md)) — ontwerpsamenvatting, tokens en iteratiegeschiedenis.
