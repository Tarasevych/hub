-- IDENTITEIT-008: nieuw uitvouwmenu voor het account (accountmenu-v3). Standaard voor iedereen uit.
-- Bestaande versies (v6 en accountmenu-v2), handelingen en beveiliging blijven ongewijzigd.
-- ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar bij een volgende installatie.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('accountmenu-v3',
  'Нове спадне меню облікового запису (v3): орбіта світлин, палітра кольорів, доступ і терміни та зміна масштабу. | Nieuw accountmenu (v3): profielfoto-orbita, kleurenpalet, toegang en termijnen en schaalbaar venster.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
