-- IDENTITEIT-003: alleen het uiterlijk van het accountcentrum. Standaard voor iedereen uit.
-- Bestaande formulierhandelingen, beveiligingsrechten en aanmeldmethoden blijven ongewijzigd.
-- ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar bij een volgende installatie.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('identiteit-account-atelier',
  'Нове оформлення сторінки «Керування обліковим записом»: дванадцять розділів, змістовні піктограми, ілюстрації, розгортні налаштування. Вимкнення повертає попередній вигляд. | Nieuwe vorm van accountbeheer: twaalf onderdelen, betekenisvolle pictogrammen en uitklapbare instellingen. Uitschakelen herstelt de vorige weergave.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
