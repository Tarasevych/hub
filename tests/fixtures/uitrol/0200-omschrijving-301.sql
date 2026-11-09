-- IDENTITEIT-007: вигляд «Макет» центру облікового запису (дизайн власника). Лише подання; дії, права й дані без змін.
-- Перемикач створюється під час встановлення, щоб власникові не доводилося вводити код вручну; типово вимкнений для всіх.
-- IDENTITEIT-007: de weergave «Ontwerp» van het accountcentrum. Alleen het uiterlijk; handelingen, rechten en gegevens blijven gelijk.
-- ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar bij een volgende installatie.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('identiteit-account-maquette',
  'Вигляд «Макет» у керуванні обліковим записом: дизайн власника як типовий вигляд; потребує ввімкненого «Нового оформлення». Вимкнення повертає «Студію». | Weergave «Ontwerp» in accountbeheer: het ontwerp van de eigenaar als standaard; vereist de vlag «Nieuwe vorm». Uitschakelen brengt de Studio terug.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
