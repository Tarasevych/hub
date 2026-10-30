-- 0041: vlag ssh-certificaat (etap C, deel 2). Alleen de knop. aan=false: verborgen tot de eigenaar hem aanzet.
-- De vlag geeft geen recht. Ondertekenen blijft de root-schakelaar ssh-ca (standaard uit) plus terminal.servers.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'ssh-certificaat',
  'Кнопка «Сертифікат SSH» у технічному профілі. Прав не дає: підпис лишається за перемикачем ssh-ca і правом terminal.servers.',
  false,
  false
)
ON CONFLICT (sleutel) DO NOTHING;
