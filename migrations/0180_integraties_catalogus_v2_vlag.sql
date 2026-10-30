-- UI-013 (29.10.2026): vlag voor de vernieuwde integratiecatalogus (admin → Інтеграції). Alleen een vlag, geen schema.
-- UIT = de huidige catalogus, ongewijzigd.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('integraties-catalogus-v2', 'Vernieuwde integratiecatalogus: per thema en per echte stand gegroepeerd, ingeklapte groepen bewaard, eerlijk plan in plaats van «Binnenkort». UIT = de huidige catalogus.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
