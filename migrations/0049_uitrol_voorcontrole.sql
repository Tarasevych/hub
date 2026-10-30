-- 0049: uitslag van de voorcontrole van een uitrolpakket (backend/uitrol-voorcontrole.ts), bewaard bij het voorstel.
--
-- De site pakt elk geüpload pakket vóór de goedkeuring uit in een tijdelijke map en controleert het statisch (structuur, metadata,
-- versie, shell-syntaxis van de installatiescripts, bouwbestanden, migraties, per ongeluk meegeleverde geheimen). Een fout houdt het
-- pakket buiten de goedkeuring; waarschuwingen (bv. een migratie met DROP TABLE) staan zichtbaar bij de goedkeuring.
ALTER TABLE app.uitrol_voorstellen ADD COLUMN IF NOT EXISTS voorcontrole jsonb;
ALTER TABLE app.uitrol_voorstellen ADD COLUMN IF NOT EXISTS pakket_meta jsonb;
