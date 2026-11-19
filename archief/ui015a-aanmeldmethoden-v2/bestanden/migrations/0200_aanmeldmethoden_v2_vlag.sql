-- 0200 — UI-015 (30.10.2026): vlag voor de nieuwe pagina «Способи входу» / «Aanmeldmethoden» (kop met beeld, filters, zoeken,
-- kaarten met logo's, details in een zijpaneel). Alleen een vlag, geen schema. UIT = de huidige pagina, ongewijzigd.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('aanmeldmethoden-v2', 'Aanmeldmethoden: nieuwe weergave met kaarten, logo''s, filters en details in een zijpaneel. Dezelfde functies en bevestigingen. UIT = de huidige pagina.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
