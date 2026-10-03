-- Beveiliging fase 2 (docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md): expliciete eigenaar per rij.
--
-- app.records.owner_id: gegenereerde kolom (STORED) uit de JSON-data, zodat RLS-policy's en indexen niet
-- op JSON hoeven te werken en de app niets hoeft te veranderen aan het schrijven:
--   users                → het id zelf (het account is zijn eigen eigenaar)
--   anders               → eerste niet-lege van data.ownerUserId, data.userId, data.recipientUserId
--   niets gevonden       → NULL (gedeelde/systeemrij)
-- app.storage_objects.owner_id: gewone kolom (bestanden hebben geen JSON); voortaan gezet door
-- storage.write, eenmalig aangevuld uit records (data.storagePath) en uit de padconventies
-- cloud/<sha256(eigenaar)[0:18]>/… en mail/sender-avatars/<sha256(eigenaar)[0:20]>/….
--
-- Veilig op de live database: alleen toevoegen (IF NOT EXISTS), niets hernoemen of verwijderen; oude
-- releases blijven werken (ze schrijven (tbl,id,data) en negeren de extra kolommen).
-- Let op: ADD COLUMN … STORED herschrijft app.records één keer (korte exclusieve lock; bij de huidige
-- omvang seconden).
ALTER TABLE app.records ADD COLUMN IF NOT EXISTS owner_id text GENERATED ALWAYS AS (
  CASE WHEN tbl = 'users' THEN id
       ELSE COALESCE(NULLIF(data->>'ownerUserId', ''), NULLIF(data->>'userId', ''), NULLIF(data->>'recipientUserId', ''))
  END
) STORED;
CREATE INDEX IF NOT EXISTS records_tbl_owner_idx ON app.records (tbl, owner_id);

ALTER TABLE app.storage_objects ADD COLUMN IF NOT EXISTS owner_id text;
CREATE INDEX IF NOT EXISTS storage_objects_owner_idx ON app.storage_objects (owner_id);

-- Aanvullen uit records die naar het bestand verwijzen (cloud-items e.d.).
UPDATE app.storage_objects s SET owner_id = r.owner_id
  FROM app.records r
 WHERE s.owner_id IS NULL AND r.owner_id IS NOT NULL AND r.data->>'storagePath' = s.path;
-- Aanvullen uit de padconventies (hash van het account-id).
UPDATE app.storage_objects s SET owner_id = u.id
  FROM app.records u
 WHERE s.owner_id IS NULL AND u.tbl = 'users'
   AND (s.path LIKE 'cloud/' || left(encode(sha256(convert_to(u.id, 'UTF8')), 'hex'), 18) || '/%'
     OR s.path LIKE 'mail/sender-avatars/' || left(encode(sha256(convert_to(u.id, 'UTF8')), 'hex'), 20) || '/%');
