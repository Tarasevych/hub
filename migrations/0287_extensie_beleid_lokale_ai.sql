-- 0287 — LAI-CON-001 (16.11.2026): beleid «Локальний ШІ / Lokale AI» per gebruiker (app.extensie_beleid).
-- Політика «Локальний ШІ Chrome» для кожного користувача.
--
-- Waarom: de ingebouwde AI van Chrome rekent op het apparaat van de gebruiker zelf, nooit op de server. Daarom staat ze standaard
-- voor iedereen AAN. De beheerder (eigenaar of 'users.manage') mag haar voor een gebruiker uitzetten — alleen MET een reden: de gebruiker
-- ziet die reden, wie het deed (gewijzigd_door) en wat hij kan doen. Het beleid geldt voor aanvragen van de site en (later) van de
-- connector; wat iemand in zijn eigen browser doet, beslist hij zelf.
--   lokale_ai_aan    standaard true
--   lokale_ai_reden  verplicht (≥ 10 tekens) zolang lokale_ai_aan = false; leeg zodra weer aan
-- Oude code kent de kolommen niet en negeert ze (standaard aan): veilige richting bij terugdraaien, want rekenen gebeurt toch lokaal.
-- Idempotent: tweemaal draaien geeft hetzelfde resultaat.

ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_aan boolean NOT NULL DEFAULT true;
ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_reden text NOT NULL DEFAULT '';
-- Wie uitzette en wanneer: apart van gewijzigd_door, zodat een latere andere wijziging de naam bij de reden niet overschrijft.
ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_door text;
ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_op timestamptz;
ALTER TABLE app.extensie_beleid DROP CONSTRAINT IF EXISTS extensie_beleid_lokale_ai_reden;
ALTER TABLE app.extensie_beleid ADD CONSTRAINT extensie_beleid_lokale_ai_reden CHECK (
  length(lokale_ai_reden) <= 300 AND (lokale_ai_aan OR length(btrim(lokale_ai_reden)) >= 10));
