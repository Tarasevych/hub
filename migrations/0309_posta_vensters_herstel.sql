-- 0308 — POSTA-VENSTERS (21.11.2026, Grok: hub.tarasevych.com): alleen één functievlag, standaard UIT. Met de vlag uit gedraagt
-- de site zich exact als vóór deze wijziging. Geen tabellen, rechten of gegevens gewijzigd.
--   posta-vensters-herstel-v1  bijlageviewer schermvullend op de telefoon, leesbare naam, tekstbestand op volle hoogte,
--                              «Назад» sluit eerst alleen de viewer, focus terug naar de kaart, geen valse «JWK» voor zip of
--                              onbekende bestanden, taalstrook in het zwevende venster op een eigen regel
-- 0308 — ПРАПОРЕЦЬ ВІКОН ПОШТИ: лише рядок прапорця, типово вимкнений.
-- omschrijving ≤ 300 tekens (CHECK in 0038_feature_flags.sql). ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar.
-- Terugdraaien: niet nodig (alleen een rij in app.feature_flags; uitzetten volstaat).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('posta-vensters-herstel-v1',
  'Перегляд вкладень і вікно листа: повний екран на телефоні, видно назву, «Назад» закриває лише перегляд. | Bijlageviewer en leesvenster: volledig scherm op de telefoon, leesbare naam, «Terug» sluit alleen de viewer.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
