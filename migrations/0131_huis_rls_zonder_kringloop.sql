-- 0131 — Huis: RLS zonder kringloop (UI-005/BUG-001, 29.10.2026).
--
-- Oorzaak van «Не вдалося (Internal server error)» op huis.tarasevych.com: in 0128 verwijst de policy van app.huis_woningen naar
-- app.huis_leden en die van app.huis_leden terug naar app.huis_woningen. Onder de rol mijnruimte_app (NOBYPASSRLS, productie met
-- DATABASE_URL_APP) geeft Postgres dan bij ELKE lezing «infinite recursion detected in policy for relation huis_woningen»
-- (SQLSTATE 42P17) → HTTP 500 op /api/huis/woningen, dus ook op «Створити оселю». Lokale tests draaiden met één rol (RLS
-- omzeild) en zagen het niet.
-- Herstel: twee SECURITY DEFINER-hulpfuncties (eigenaar = migratierol, die RLS niet ondergaat) beantwoorden «ben ik lid / eigenaar»
-- zonder opnieuw een policy te openen. Dezelfde regels als 0128, alleen zonder lus. Idempotent.

CREATE OR REPLACE FUNCTION app.huis_is_lid(p_woning uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app AS
$f$ SELECT EXISTS (SELECT 1 FROM app.huis_leden l WHERE l.woning_id = p_woning AND l.user_id = app.huidige_gebruiker()) $f$;
CREATE OR REPLACE FUNCTION app.huis_is_eigenaar(p_woning uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app AS
$f$ SELECT EXISTS (SELECT 1 FROM app.huis_woningen w WHERE w.id = p_woning AND w.user_id = app.huidige_gebruiker()) $f$;
REVOKE ALL ON FUNCTION app.huis_is_lid(uuid), app.huis_is_eigenaar(uuid) FROM PUBLIC;

DO $huis_rls2$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT EXECUTE ON FUNCTION app.huis_is_lid(uuid), app.huis_is_eigenaar(uuid) TO mijnruimte_app;
  END IF;
  DROP POLICY IF EXISTS huis_woningen_lid ON app.huis_woningen;
  CREATE POLICY huis_woningen_lid ON app.huis_woningen
    USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker() OR app.huis_is_lid(id))
    WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
  DROP POLICY IF EXISTS huis_leden_lid ON app.huis_leden;
  CREATE POLICY huis_leden_lid ON app.huis_leden
    USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker() OR app.huis_is_eigenaar(woning_id))
    WITH CHECK (current_user::text <> 'mijnruimte_app' OR app.huis_is_eigenaar(woning_id));
  FOREACH t IN ARRAY ARRAY['huis_ruimtes', 'huis_integraties', 'huis_apparaten', 'huis_toestanden', 'huis_opdrachten', 'huis_scenes', 'huis_automatiseringen', 'huis_gebeurtenissen', 'huis_voorstellen'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON app.%I', t || '_lid', t);
    EXECUTE format($p$CREATE POLICY %I ON app.%I
      USING (current_user::text <> 'mijnruimte_app' OR app.huis_is_lid(woning_id))
      WITH CHECK (current_user::text <> 'mijnruimte_app' OR app.huis_is_lid(woning_id))$p$, t || '_lid', t);
  END LOOP;
END
$huis_rls2$;
