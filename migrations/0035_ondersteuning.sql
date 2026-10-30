-- 0035: «Підтримка від імені» — alleen met toestemming van de gebruiker (architectuur 13.10.2026, etap 7).
--   Een ondersteuner (technisch profiel met 'impersonatie.aanvragen') VRAAGT; de gebruiker zelf keurt goed (met verse aanmelding) of
--   weigert. Pas dan mag de ondersteuner, alleen in HET tabblad van de aanvraag en alleen tot eind_op (≤ 30 min), een overzicht van het
--   account LEZEN (metadata: status, instellingen, apparaten, AI-verbindingen, diagnoseverslagen, recente acties — geen mailinhoud,
--   geen sleutels). Noodtoegang zonder toestemming alleen voor de eigenaar van de server, ≤ 30 min, met directe melding aan de gebruiker.
--   Elk bekijken komt in het logboek VAN DE GEBRUIKER (wie, wanneer). Schrijven via de systeemrol; de app-rol leest eigen rijen.
CREATE TABLE IF NOT EXISTS app.ondersteuning_verzoeken (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aanvrager_id      text        NOT NULL,
  doel_id           text        NOT NULL CHECK (doel_id <> aanvrager_id),
  aanvrager_tab     text        NOT NULL CHECK (aanvrager_tab ~ '^[0-9a-f]{64}$'),
  reden             text        NOT NULL CHECK (char_length(reden) BETWEEN 3 AND 300),
  minuten           int         NOT NULL CHECK (minuten BETWEEN 5 AND 30),
  bereik            text        NOT NULL DEFAULT 'overzicht' CHECK (bereik IN ('overzicht')),
  nood              boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'goedgekeurd', 'geweigerd', 'beeindigd', 'verlopen', 'ingetrokken')),
  aangevraagd_op    timestamptz NOT NULL DEFAULT now(),
  besloten_op       timestamptz,
  eind_op           timestamptz,
  beeindigd_door    text,
  CHECK (eind_op IS NULL OR eind_op <= COALESCE(besloten_op, aangevraagd_op) + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS ondersteuning_doel_open ON app.ondersteuning_verzoeken (doel_id) WHERE status IN ('wacht', 'goedgekeurd');
CREATE INDEX IF NOT EXISTS ondersteuning_aanvrager ON app.ondersteuning_verzoeken (aanvrager_id, aangevraagd_op DESC);
ALTER TABLE app.ondersteuning_verzoeken ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ondersteuning_eigen ON app.ondersteuning_verzoeken;
CREATE POLICY ondersteuning_eigen ON app.ondersteuning_verzoeken
  USING (current_user::text <> 'mijnruimte_app' OR doel_id = app.huidige_gebruiker() OR aanvrager_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR doel_id = app.huidige_gebruiker() OR aanvrager_id = app.huidige_gebruiker());
