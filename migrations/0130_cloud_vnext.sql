-- Cloud vNext (29.10.2026): alleen de functievlag. De gegevens van de vernieuwde cloudpagina leven in de BESTAANDE
-- app.records-collecties (cloud_items_v1 krijgt extra JSONB-velden; mappen komen in een nieuwe collectie cloud_mappen_v1) en in
-- de bestaande bestandsopslag — géén nieuwe tabellen, géén datamigratie, en de oude pagina blijft dezelfde records lezen.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('cloud-vnext', 'Vernieuwde cloudpagina: bestandsbeheer met mappen, labels, favorieten, prullenbak en versies, plus het eerlijke integratiecentrum. UIT = de huidige cloudpagina, ongewijzigd.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
