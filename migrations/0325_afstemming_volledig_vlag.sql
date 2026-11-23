-- 0325 (CONSOL-001, 23.11.2026): прапорець повного оснащення картотеки розвитку «Звірка» (Afstemming vNext):
-- загальна стрічка подій усіх карток, розбір задуму за згодою людини, вкладення PDF і зображень, внутрішні проби маршрутів та зіставлення з координацією.
-- Functievlag voor de volledige uitrusting van Afstemming vNext (gebeurtenissenstroom, idee-ontleding, PDF-/beeldbijlagen, routecontroles en orchestratie).

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'afstemming-volledig-v1',
  'Картотека «Звірка»: повна стрічка подій, розбір задуму, вкладення PDF/зображень, проби маршрутів і зіставлення з координацією. | Afstemming: volledige stroom, idee-ontleding, PDF-/beeldbijlagen, routecontroles en orchestratie.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
