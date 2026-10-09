-- 0026: AI-beleid met handtekening van de eigenaar (§13.12).
-- Het beleid zelf staat NIET in de database: root houdt de ondertekende keten bij in /var/lib/mijn-ruimte/ai-beleid (de app leest
-- alleen). Hier alleen: de WebAuthn-challenge voor een nieuwe versie gebruikt dezelfde eenmalige challenges als het goedkeuren van
-- updates, met doel 'ai-beleid' en als onderwerp de sha256 van precies het ontwerp dat de eigenaar op het scherm zag.
ALTER TABLE app.goedkeur_uitdagingen DROP CONSTRAINT IF EXISTS goedkeur_uitdagingen_doel_check;
ALTER TABLE app.goedkeur_uitdagingen ADD CONSTRAINT goedkeur_uitdagingen_doel_check
  CHECK (doel IN ('registreren', 'goedkeuren', 'sleutel-toevoegen', 'sleutel-verwijderen', 'ai-beleid'));
