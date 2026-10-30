-- UI-002 (29.10.2026): «Фото» als eigen dienst in «Мій простір» en verplaatsing van Календар/Фото uit het cloudmenu.
-- Alleen de twee functievlaggen (standaard UIT). De fotobibliotheek leeft in app.records-collecties (foto_media_v1,
-- foto_albums_v1, foto_import_v1) en in de bestaande bestandsopslag — géén nieuwe tabellen, géén datamigratie.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('foto-dienst', 'Nieuwe dienst «Фото» in Mijn ruimte: één fotoarchief uit eigen opslag, cloud en archieven (Google Takeout, Instagram, Facebook, VK, Telegram, ZIP, map). UIT = geen fotodienst.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('menu-kalender-foto-eigen', 'Календар en Фото verhuizen uit het menu «Хмарне сховище» naar «Мій простір»; oude adressen sturen door. UIT = menu zoals nu.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
