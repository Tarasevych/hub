-- 0191 — UI-014 (30.10.2026): vlag voor de uitgebreide meldingskaart (wie/wat/wanneer/waarom/gevolg/wat te doen, snelle acties per
-- soort) en de instelbare weergavegrootte van het meldingenpaneel (tekst S/M/L/XL, dichtheid, paneel schaalt mee). Alleen een vlag,
-- geen schema: de grootte wordt bewaard in de bestaande meldingsregels per account (melding_regels_v1, veld `weergave`).
-- UIT = het meldingencentrum zoals het was (de bugfixes van UI-014 gelden altijd).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('meldingen-uitleg-v3', 'Meldingen: volledige uitleg per melding (wie, wat, wanneer, waarom, gevolg, wat te doen), snelle acties per soort en instelbare grootte van tekst en paneel. UIT = het huidige meldingencentrum.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
