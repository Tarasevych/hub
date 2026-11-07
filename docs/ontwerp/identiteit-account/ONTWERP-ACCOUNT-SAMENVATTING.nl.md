> 🌐 **Taal / Мова:** [Українська](ПІДСУМОК-ПРОЄКТУ-ОБЛІКОВОГО-ЗАПИСУ.uk.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../INDEX.nl.md)

# Accountpagina — ontwerpsamenvatting (`ontwerp-account-samenvatting.nl.md`)

## Ontwerprichting en tokensysteem

Alle onderdelen van de accountpagina (`src/identiteit/*`) gebruiken uitsluitend de canonieke ontwerptokens uit `src/ontwerp/tokens.css` (`--bg`, `--panel`, `--surface`, `--line`, `--text`, `--muted`, `--accent`, `--ruimte-1..6`, `--straal-s/m/l/xl`), waardoor alle 4 kleurpaletten (`Grifel`, `Puur`, `Violet`, `Kleur`), lichte en donkere thema's en hoog contrast direct werken.

## Architectuur en interactie

1. **Één pagina met 12 secties (`IdentiteitAccountPagina.tsx`):**
   - In plaats van 12 losse schermen staan alle onderdelen van de categorie `identity` op één doorlopende pagina met een inhoudsopgave bovenaan (`.ia-toc`), die vloeiend naar de gekozen sectie scrollt en tijdens het scrollen het actieve onderdeel markeert (`IntersectionObserver`).
2. **Avatar en fotodialoog (`Profielfoto.tsx`):**
   - De prullenbakknop (`.ia-avatar-prullenbak`) is `24×24 px` op de hoek van de avatar en het camera-icoon (`.ia-avatar-camera`, `22×22 px`) staat exact in het midden zonder overlap (`cbeb3d0`).
   - Klikken op de avatar opent het modale venster «Profielfoto» (`.ia-dialoog-achtergrond`, `z-index: 99500`) met drie tabbladen: **Apparaat**, **Dienst** en **Link** (`https://`).
3. **Bescherming tegen overlap door de vaste bovenbalk (`a318ba0`):**
   - De klevende inhoudsopgave `.ia-toc` heeft `top: 70px` (`62px` op schermen `≤ 700px`).
   - Elke sectie `.ia-sectie` heeft `scroll-margin-top: 170px` (`150px` op schermen `≤ 700px`).
4. **Containerresponsief (`@container ia-account`):**
   - In smalle containers (`≤ 640px`) nemen actieknoppen en bronknoppen de volledige breedte in zonder tekstafkapping.

## Geschiedenis van de ontwerpiteraties

1. **v1–v2:** overgang van een drukke zijbalk met losse pillen naar een rustige verticale opbouw.
2. **v3 (`@container`):** responsiviteit op basis van de containerbreedte in plaats van het browservenster (getest op 320 / 360 / 390 / 430 px).
3. **v4 (`lucide-react`):** vervanging van tekstsymbolen door `lucide-react`-iconen en officiële SVG-providerlogo's.
4. **v5–v6:** uitwerking van 6 staten (laden, foutmelding, lege lijst, step-up, export, eigenaarsbescherming `OWNER_NIET_WISSEN`) en mobiele marges.
5. **Integratie `IDENTITY-002` + audit `AUDIT-001` (05-11-2026):** integratie in `src/identity/*` (sinds ORCH-001 `src/identiteit/*`), gecentreerde camera, `z-index` van het modale venster en scroll-marges onder de vaste bovenbalk.
