-- IDENTITEIT-003: alleen het uiterlijk van het accountcentrum. Standaard voor iedereen uit.
-- Bestaande formulierhandelingen, beveiligingsrechten en aanmeldmethoden blijven ongewijzigd.
-- ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar bij een volgende installatie.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('identiteit-account-atelier',
  'Новий вигляд керування обліковим записом: 12 розділів і зрозумілі піктограми. Вимкнення повертає старий вигляд. | Nieuw accountbeheer: 12 onderdelen en herkenbare pictogrammen. Uitschakelen herstelt de vorige weergave.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
