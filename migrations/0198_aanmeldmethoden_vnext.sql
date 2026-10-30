-- Aanmeldmethoden vNext / UI-015 (30.10.2026): alleen de functievlag. De pagina «Способи входу» krijgt achter deze vlag de
-- nieuwe presentatie (hero, methodekaarten, detailpanelen); de CONTROLLER (src/ToegangslaagWeergave.tsx) en alle echte
-- beveiligingsstromen (Google-binding, passkeys, TOTP, herstelcodes, sleutelkluis, toegangscodes, step-up) blijven dezelfde.
-- UIT = de huidige formulierweergave, byte voor byte. Tabbladen «Безпека» en «Відновлення» blijven sowieso op het oude formulier.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('aanmeldmethoden-vnext', 'Vernieuwde pagina «Способи входу» (id/aanmeldmethoden): hero, overzichtelijke methodekaarten met één hoofdactie, detailpanelen met de bestaande beveiligingsstromen, eerlijke catalogus van toekomstige aanbieders. UIT = de huidige weergave, ongewijzigd.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
