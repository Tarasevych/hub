-- 0302 — MOBIEL-BREEDTE-VEILIG v1 (10.11.2026): alleen de functievlag. Standaard UIT: met de vlag uit gedraagt de site zich
-- exact als 20261119-072255. Met de vlag aan: de brede regel in src/ontwerp/mobiel.css (max-width:100% op elke div/section/…
-- in het werkvlak bij ≤700 px) wijkt voor een smalle vervanging, en drie zuinigere waarnemers (Plek.tsx, AgentenPagina.tsx).
-- 0302 — БЕЗПЕЧНА ВУЗЬКА ВЕРСТКА v1: лише прапорець, типово вимкнений; з вимкненим прапорцем сайт поводиться як 20261119-072255.
-- omschrijving ≤ 300 tekens (CHECK in 0038_feature_flags.sql). ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar.
-- Terugdraaien: niet nodig (alleen een rij in app.feature_flags; uitzetten volstaat).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('mobiel-breedte-veilig-v1',
  'Безпечна вузька верстка: без важкого правила ширини на телефоні, ощадливіше стеження за сторінкою, адреса розділу не змінюється сама. | Veilige smalle opmaak: zonder de zware breedteregel op de telefoon, zuinigere waarnemers, het sectieadres verspringt niet vanzelf.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
