-- 0053: beheerlogboek (admin/audit). Alleen indexen voor de nieuwe filters; geen kolommen, geen wijziging aan app.audit_hash of de ketens.
--   audit_tijd_idx     datumbereik en «laatste dag/week» zonder volledige scan
--   audit_details_gin  details @> {"doel":{"id":…}} en andere inhoudsfilters (jsonb_path_ops: klein en snel voor @>)
CREATE INDEX IF NOT EXISTS audit_tijd_idx ON app.audit (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_details_gin ON app.audit USING gin (details jsonb_path_ops);
