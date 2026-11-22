-- 0307 — POSTA-LEZER (21.11.2026): alleen drie functievlaggen, alle standaard UIT. Met de vlaggen uit gedraagt de site zich exact
-- als 20261120-141041 (ba289fa9). Geen tabellen, rechten of gegevens gewijzigd.
--   lezer-fout-blijft-open-v1          leesvenster blijft open bij een laadfout, met reden en «Спробувати ще раз»; zinvolle status van de route
--   mail-tekst-utf8-terugval-v1        UTF-8-bytes achter een opgegeven Latijn-1/ASCII-tekenset als UTF-8 lezen (algemene stand, elke minuut)
--   maquette-zwevend-rail-verbergen-v1 ankerrail van «Макет» verbergen bij een zwevend leesvenster
-- 0307 — ТРИ ПРАПОРЦІ ПОШТИ: лише рядки прапорців, усі типово вимкнені; з вимкненими прапорцями сайт поводиться як 20261120-141041.
-- omschrijving ≤ 300 tekens (CHECK in 0038_feature_flags.sql). ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar.
-- Terugdraaien: niet nodig (alleen rijen in app.feature_flags; uitzetten volstaat).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('lezer-fout-blijft-open-v1',
  'Лист, що не відкрився, лишає вікно відкритим: видно причину й кнопку «Спробувати ще раз». | Een bericht dat niet opent laat het venster open: met de reden en de knop «Opnieuw proberen».',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('mail-tekst-utf8-terugval-v1',
  'Лист у кодуванні UTF-8 із хибною позначкою кодування показується правильно, без спотворених літер. | Een bericht in UTF-8 met een verkeerd opgegeven tekenset wordt correct getoond, zonder rare tekens.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('maquette-zwevend-rail-verbergen-v1',
  'У «Макеті» бічна смуга розділів ховається, коли лист відкрито як «вікно у вікні», щоб не закривати кнопки. | In «Макет» verdwijnt de ankerrail bij een zwevend leesvenster, zodat de knoppen vrij blijven.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
