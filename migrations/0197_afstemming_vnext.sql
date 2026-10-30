-- Afstemming vNext / UI-014 (30.10.2026): alleen de functievlag. De kartotheek leeft in app.records-collecties
-- (afstemming_kaarten_v1, _revisies_v1, _gebeurtenissen_v1 (append-only), _koppelingen_v1, _besluiten_v1, _bewijs_v1,
-- _import_v1) — géén nieuwe tabellen, géén datamigratie. UIT = de huidige matrixpagina op /afstemming, ongewijzigd.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('afstemming-vnext', 'Slimme productkartotheek op api/afstemming: kaarten met levensloop en echte gezondheid, append-only geschiedenis, relaties en conflicten met eigenaarsbesluit, releasekoppeling, eerlijke controles. UIT = de huidige waarheidsmatrix, ongewijzigd.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
