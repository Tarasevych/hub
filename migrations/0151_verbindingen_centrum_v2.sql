-- UI-003 (29.10.2026): vlag voor het vernieuwde verbindingencentrum «Хмарне сховище → Акаунти». Alleen een vlag, geen schema.
-- UIT = de huidige accountspagina, ongewijzigd.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('verbindingen-centrum-v2', 'Vernieuwd verbindingencentrum op Хмарне сховище → Акаунти: statusoverzicht, Mijn verbindingen, Catalogus, Synchronisatie en Geschiedenis; technische details ingeklapt. UIT = de huidige pagina.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
