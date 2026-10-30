-- 0087: het BESLUIT van de servereigenaar over een bevroren lade, met het verslag van wat er feitelijk gebeurde.
--
-- Migratie 0082 hield alleen de STAND bij (eigen / gedeeld / uit / bevroren). Wat de eigenaar daarna besloot — повернути,
-- передати собі, видалити — en wat dat besluit fysiek deed (welke tabellen, hoeveel rijen, door welke module) stond nergens.
-- Daardoor was «передати собі» in de praktijk alleen een stand die veranderde. Nu voert backend/ruimte-scheiding.ts het
-- besluit echt uit via het register van uitvoerders (registreerLadeUitvoerder: elke dienst meldt zijn eigen tabellen aan) en
-- bewaart het resultaat hier:
--
--   besluit       welk besluit het laatst is genomen ('' = nog nooit);
--   besluit_op    wanneer, besluit_door = de eigenaar die het nam;
--   verslag       {besluit, uitvoerders, regels:[{tabel, rijen, door, opmerking?}], rijen, volledig}. `volledig: false`
--                 betekent: er was (nog) geen uitvoerder voor die dienst aangemeld, dus er is NIETS verplaatst of gewist —
--                 eerlijk opgeschreven in plaats van stil gedaan alsof.
--
-- Waarom de rij ook na «verwijderen» BLIJFT staan (0082 verwijderde hem): zij is het bewijs van het besluit, en zij maakt een
-- tweede aanroep onschadelijk — de stand is dan niet meer 'bevroren', dus hetzelfde besluit wordt geweigerd (NIET_BEVROREN)
-- in plaats van de uitvoerders nog een keer te laten lopen.
--
-- Idempotent; RLS staat al aan op de tabel (0082).
ALTER TABLE app.ruimte_dienst_stand ADD COLUMN IF NOT EXISTS besluit      text        NOT NULL DEFAULT '' CHECK (besluit IN ('', 'teruggeven', 'overdragen', 'verwijderen'));
ALTER TABLE app.ruimte_dienst_stand ADD COLUMN IF NOT EXISTS besluit_op   timestamptz;
ALTER TABLE app.ruimte_dienst_stand ADD COLUMN IF NOT EXISTS besluit_door text        NOT NULL DEFAULT '' CHECK (length(besluit_door) <= 80);
ALTER TABLE app.ruimte_dienst_stand ADD COLUMN IF NOT EXISTS verslag      jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verslag) = 'object' AND pg_column_size(verslag) <= 8192);

COMMENT ON COLUMN app.ruimte_dienst_stand.verslag IS
  'Wat het besluit van de servereigenaar feitelijk deed: per uitvoerder de tabel en het aantal rijen. volledig=false betekent dat er nog geen uitvoerder voor die dienst was aangemeld en er dus niets is verplaatst of gewist.';
