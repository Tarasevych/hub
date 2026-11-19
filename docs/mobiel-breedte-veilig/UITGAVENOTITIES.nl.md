# Uitgavenotities — MOBIEL-002 · 20261119-084347

**Basis:** `20261119-072255` (UPD-005, `34f83796`); pakket boven op de geïnstalleerde basis `20261117-190154` (`14dbcb3a`), dus inclusief UPD-005.
**Vlag:** `mobiel-breedte-veilig-v1`, standaard **uit** (migratie `0302_mobiel_breedte_veilig_vlag.sql`, alleen een rij in `app.feature_flags`).

## Wat verandert (alleen met de vlag aan)
- `src/ontwerp/mobiel.css`: de zware regel `max-width:100%` op elke div/section/… bij ≤ 700 px (regel 17) geldt alleen zonder het attribuut
  `data-mobiel-breedte-veilig` op `<html>`; met de vlag een smalle vervanging (directe kinderen, `pre`, `figure`, `fieldset`).
- `src/plaatsing/Plek.tsx`: zuiniger waarnemer van de onderbalken.
- `src/agenten/AgentenPagina.tsx`: de sectie in beeld verandert het adres pas na echt scrollen door de gebruiker; doel vasthouden blijft van ANKERS-002.
- `src/agenten/agenten.css`, `agenten-pagina.css`: raster in plaats van flexkolom, skeletglans via transform.

## Controles
Bouw zonder fouten; migraties tweemaal op een lege database (tweede keer «niets te doen»); eenheidstests 567 bestanden 19342 OK / 47 FOUT
tegen basis 566 / 19284 / 48 — geen nieuwe fouten; e2e `mobiel-breedte-veilig` 261/261 (64 schermafdrukken), `huis-start` 27/27;
meting 412 px zie `METING-412.md`; verliescontrole zie `VERLIESCONTROLE.md`.

## Terugdraaien
Vlag uit en pagina herladen. De migratie hoeft niet terug.
