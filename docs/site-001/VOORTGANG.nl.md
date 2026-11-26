> 🌐 **Taal:** [Українська](ПЕРЕБІГ-РОБІТ.uk.md) · **Nederlands**

# SITE-001 — gereedheid van de site Mijn Ruimte: voortgang

- **Taak:** SITE-001 · agent `antigravity` · vertakking `feature/site-001-20261125-232500`
- **Basis:** `origin/integratie` `8890f85a1c34c9f12e945eb78bd2e8588cceb56a` · regels `1.8.0`
- **Toestemming van de eigenaar:** samenvoegen in `integratie` na groene controles (25.11.2026).
- **Schermafdrukken «voor» en «na»:** [`schermafdrukken/`](schermafdrukken/) — lokale bouw van de site, Chromium zonder venster.

## Hoe een andere agent het werk voortzet

1. `git fetch origin && git switch feature/site-001-20261125-232500`
2. Lees dit bestand: de tabel hieronder toont welk punt klaar is en welk het volgende is.
3. Neem het eerste punt met de status «wacht» of «bezig», maak een schermafdruk «voor», de verbetering, een schermafdruk «na», een vastlegging en een verzending.
4. Werk na elk punt de tabel en het logboek onderaan bij.

## Status per punt

| Nr. | Punt | Status | Samenvatting |
|---|---|---|---|
| 1 | Privacybeleid | wacht | Bestaande `/privacy` (`backend/juridisch.ts`) — volledigheid controleren |
| 2 | Gebruiksvoorwaarden | wacht | Bestaande `/terms` (`backend/juridisch.ts`) — volledigheid controleren |
| 3 | Openliggende sleutels en geheimen verwijderen | bezig | Scan met gitleaks |
| 4 | HTTPS | wacht | `Strict-Transport-Security` in `server/start.ts`, Cloudflare-tunnel |
| 5 | Toestemmingsbanner voor cookies | wacht | Geen banner; wel analysetoestemming in de instellingen (`backend/privacy.ts`) |
| 6 | Paginatitels en `meta description` | wacht | Dynamische titels in `index.html` aanwezig |
| 7 | Voorbeeldafbeelding voor sociale netwerken | wacht | Geen `og:image` |
| 8 | Sitepictogram (favicon) | wacht | Bestaande `public/favicon*` — controleren |
| 9 | `sitemap.xml` en `robots.txt` | wacht | `robots.txt` aanwezig, `sitemap.xml` ontbreekt |
| 10 | Alternatieve teksten bij afbeeldingen | wacht | — |
| 11 | Afbeeldingen comprimeren | wacht | — |
| 12 | Laadsnelheid | wacht | — |
| 13 | Kleurcontrast | wacht | Bewaker `scripts/kleur-contrast-controle.mjs` aanwezig |
| 14 | Geschiktheid voor mobiel | wacht | — |
| 15 | Eigen 404-pagina | wacht | Bestaande `src/NietGevonden.tsx` — controleren |
| 16 | Kapotte koppelingen | wacht | — |
| 17 | Validatie van alle formulieren | wacht | — |
| 18 | Bescherming tegen spam | wacht | — |
| 19 | Siteanalyse | wacht | Eigen analyse met toestemming (`backend/privacy.ts`) — controleren |
| 20 | Eén duidelijke oproep tot actie | wacht | — |
| 21 | Knoppen en interactieve elementen | wacht | — |
| 22 | Foutregistratie en bewaking | wacht | — |
| 23 | Reservekopieën van de database | wacht | `deploy/backup-maken.sh`, `mijn-ruimte-backup.timer` — controleren |
| 24 | Beveiligingskoppen en aanvraagbeperking | wacht | `server/start.ts`, `rateLimit` — controleren |
| 25 | Registratie, aanmelding en wachtwoordherstel | wacht | — |

## Logboek

- **25.11.2026 23:25** — vertakking gemaakt vanaf `integratie`, taak `SITE-001` geregistreerd, `orch controleer` groen. Eerste overzicht van bestaande onderdelen.
