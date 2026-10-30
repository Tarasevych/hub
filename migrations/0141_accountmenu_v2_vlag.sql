-- 0141 — Vlag «accountmenu-v2» (29.10.2026, UI-008): het verfijnde accountmenu (compacte knoppen, gegroepeerd, ⓘ in plaats van
-- vaste uitleg, echte vlaggen 🇺🇦/🇳🇱, compacte ruimtewissel onderaan). Standaard UIT: zonder vlag precies het oude menu. Idempotent.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('accountmenu-v2',
  'Охайніше меню акаунта: компактні кнопки, групи, підказки ⓘ. Verfijnd accountmenu. Функції ті самі.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
