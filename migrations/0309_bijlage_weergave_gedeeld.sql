-- 0309 — СПІЛЬНИЙ ПЕРЕГЛЯД ВКЛАДЕНЬ, етап 1 (22.11.2026, Grok: hub.tarasevych.com): alleen één functievlag, standaard UIT.
-- Met de vlag uit gedraagt de site zich exact als vóór deze wijziging. Geen tabellen, rechten of gegevens gewijzigd.
--   bijlage-weergave-gedeeld-v1  nieuwe gedeelde omlijsting van de bijlageviewer (src/weergave/): snelle kaart, één
--                                vertrouwenslabel, hoofdactie per soort, «⋯», «Подробиці», strook met alle bijlagen,
--                                eerlijke laad- en foutstaat met «opnieuw», eigen stap voor «Назад»
-- 0309 — ПРАПОРЕЦЬ СПІЛЬНОГО ПЕРЕГЛЯДУ: лише рядок прапорця, типово вимкнений. Концепція: docs/concept/bijlage-weergave/CONCEPT.md
-- omschrijving ≤ 300 tekens (CHECK in 0038_feature_flags.sql). ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar.
-- Terugdraaien: niet nodig (alleen een rij in app.feature_flags; uitzetten volstaat).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('bijlage-weergave-gedeeld-v1',
  'Новий перегляд вкладень: що це за файл, позначка довіри, головна дія, усі вкладення листа внизу, чесна помилка. | Nieuwe bijlageviewer: wat het bestand is, vertrouwenslabel, hoofdactie, alle bijlagen onderaan, eerlijke fout.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
