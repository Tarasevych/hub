-- 0091: DE RUIMTE-DIMENSIE VOOR MELDINGEN (klacht van de eigenaar, 20.10.2026: technische meldingen in de persoonlijke
-- ruimte). Hoort bij migratie 0082 (gescheiden gegevensruimtes), 0086 (records: ruimte als veld in `data`) en bij
-- shared/meldingen-ruimte.ts + backend/meldingen-ruimte.ts; de live ruimte komt uit backend/ruimte-scheiding.ts.
--
-- WAAR DE RUIMTE STAAT
--   Meldingen liggen als JSON in app.records (tbl = 'site_notifications'), dus `ruimte` is een VELD in `data`, precies zoals
--   het bureaublad en de werkruimtes van de hub (0086). Er is daarom GEEN kolom en GEEN DDL nodig; alleen een index.
--
-- ÉÉN REGEL, EN DIE IS NIET ONDERHANDELBAAR: een rij ZONDER `ruimte` (of met NULL) is PERSOONLIJK. Daarom:
--   • verplaatst deze migratie geen enkele melding en verwijdert zij er geen (geen UPDATE, geen DELETE);
--   • krijgen bestaande meldingen GEEN technische vlag — ook niet de meldingen van een technische SOORT van vóór vandaag:
--     die blijven in de persoonlijke lade van hun ontvanger en zijn daar te lezen en op gelezen te zetten;
--   • begint de technische lade van meldingen dus leeg en vult zij zich alleen met wat de server vanaf nu als 'technisch' schrijft.
--
-- DE INDEX: lezen gaat altijd per (ontvanger, lade), en overdragen/verwijderen van een bevroren lade per (ontvanger, 'technisch').
-- De GIN-index van 0001 dekt de `data @> {...}`-filters van db.list; deze partiële b-tree dekt de SQL van de uitvoerder
-- (backend/meldingen-ruimte.ts) zonder over alle meldingen te hoeven lopen. Alleen rijen die ECHT 'technisch' zeggen staan erin;
-- persoonlijke rijen (veld afwezig) blijven er met opzet buiten.
-- Idempotent: de testsuite draait alle migraties opnieuw.

CREATE INDEX IF NOT EXISTS records_meldingen_technisch_idx
  ON app.records (tbl, (data->>'recipientUserId'))
  WHERE tbl = 'site_notifications' AND data->>'ruimte' = 'technisch';

-- ------------------------------------------------------------------------------------------------ bewijs dat niets verhuisde
DO $meldingen_bewijs$
DECLARE techniek bigint; totaal bigint;
BEGIN
  SELECT count(*) INTO totaal FROM app.records WHERE tbl = 'site_notifications';
  SELECT count(*) INTO techniek FROM app.records WHERE tbl = 'site_notifications' AND data->>'ruimte' = 'technisch';
  RAISE NOTICE '0091: ruimte-dimensie voor meldingen klaar; meldingen totaal: %, technische: % (bij een eerste migratie altijd 0 — er is niets verplaatst; de rest blijft persoonlijk)', totaal, techniek;
END
$meldingen_bewijs$;
