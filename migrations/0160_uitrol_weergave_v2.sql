-- UI-010 / BUG-004 fase 2 (29.10.2026): vlag voor de vernieuwde weergave van «Оновлення» (admin.*/updates). Alleen een vlag, geen schema.
-- Deelnemers per release (UITROL-MANIFEST.json) worden bewaard in de bestaande kolom app.uitrol_voorstellen.pakket_meta (jsonb, 0049);
-- uploader (voorbereider), goedkeurder (beslist_door) en methode (uitrol_runs.methode) bestonden al. Er is dus geen nieuwe kolom nodig.
-- UIT = de huidige pagina, ongewijzigd.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('uitrol-weergave-v2', 'Vernieuwde weergave van Оновлення: terminal in uk, deelnemers per release, compact blok «Хто має доступ до підготовки», gegroepeerde geschiedenis met herstelacties, korte probleemsamenvatting op Огляд. UIT = de huidige pagina.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
