> 🌐 **Taal / Мова:** [Українська](ДОСЬЄ-ПАНЕЛІ-СПОВІЩЕНЬ.uk.md) · **Nederlands** | [Start](../../README.md)

# MELDPANEEL-001 — dossier van het meldingenpaneel (18.11.2026)

Eén plek met de hele geschiedenis van het meldingenpaneel. De volledige tekst (tabellen, tijdlijn, ontwerp) staat in het [Oekraïense dossier](ДОСЬЄ-ПАНЕЛІ-СПОВІЩЕНЬ.uk.md); hier de kern.

Basis: `feature/upd-004-uitgave-20261117-225600` (697c7374). Werktak: `feature/meldpaneel-001-20261118-082300`.

## Nu

- Drie weergaven van één paneel: «klassiek» (`MeldingenpaneelInhoud`, zonder vlag), **compact bij de bel** (`src/meldingen/v2`, vlag `meldingen-v2`) en **groot venster** (`src/meldingen/ecosysteem`, GEMINI-002).
- Drie plekken voor instellingen: regels v2 (`MeldingVoorkeurenPaneel`), pagina `/melding` (migratie 0278) en stille uren.

## Geschiedenis (agent · model)

- 09.10 Menu v2 · claude. 29.10 UI-007 compact paneel v2 · claude.
- 02.11 notif-b, 03.11 INTEG-001 (12 commits) · claude · Claude Haiku 5.5.
- 14.11 IDENTITEIT-013…015 · claude · Claude Opus 5.5.
- 15.11 GEMINI-002 groot venster, bijlageviewer, AI-duiding, `/melding` · gemini · Gemini 4 Hydrogen Extra.
- 15–16.11 MELDINGEN-UX-001 schakelaar «Venster ↔ Compact», één getal op de bel · claude · Claude Opus 5.5 en Claude Fable 5.2.
- 16.11 MELDLINK-001, ELDERS-001; 17.11 MELDCAT-001 register, X4-ontwerp · claude · Claude Opus 5.5.

Alle 227 takken zijn vergeleken: er staat **geen paneelcode alleen in een zijtak**. Er ging functionaliteit verloren doordat elk nieuw paneel naast het oude werd gebouwd: duur, begin en einde van een actie en «Wijziging bekijken» bestaan alleen in het klassieke paneel.

## Tegenstrijdigheden

1. Andere getallen op de bel (compact 2, venster 3 bij dezelfde gegevens).
2. Twee opslagplaatsen voor status; «uitgesteld» uit het venster komt niet in het compacte paneel.
3. Drie instellingenplekken met deels dezelfde schakelaars.
4. Andere woorden voor hetzelfde («Очистити» en «Перенести в архів», 30 min of 1 uur uitstellen).

## Ontwerp: één paneel, twee maten

Hetzelfde paneel bij de bel en uitgeklapt als venster: dezelfde kop, tabbladen «Нові · Відкладені · Прочитані · Архів», kanaalchips met logo's, gevaar bovenaan als X4-kaart, compacte rijen met «⋯»-menu, in het venster lijst links en details rechts (X4-strook, bijlagen, AI-duiding), op de telefoon een blad met vegen. Eén getal, één statusopslag, één regelspagina. Schermafdrukken: `/mnt/project-files/meldpaneel-001/ontwerp/`.
