-- 0005: RLS-leespolicy aanvullen: leden lezen ook het ruimterecord zelf (tbl='workspaces', id = ruimte).
-- Het ruimterecord heeft geen data.workspaceId; zonder deze regel zag alleen de eigenaar het. Schrijven blijft
-- bij de eigenaar. Idempotent (DROP POLICY IF EXISTS + CREATE). Raakt geen data.
DROP POLICY IF EXISTS records_lezen ON app.records;
CREATE POLICY records_lezen ON app.records FOR SELECT USING (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.lezen))
  OR (data ? 'workspaceId' AND data->>'workspaceId' IN (SELECT unnest(app.mijn_werkruimtes())))
  OR (tbl = 'workspaces' AND id IN (SELECT unnest(app.mijn_werkruimtes())))
);
