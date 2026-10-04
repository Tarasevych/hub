-- 0007: RLS per tabel (audit-fix 9). Idempotent. Afdwingen blijft standaard UIT (audit-modus, zie 0004):
-- de policy's laten dan alles door; de app (server/platform/rls-audit.ts, zelfde regels) en de users-trigger
-- hieronder tellen wat geweigerd ZOU worden in app.rls_audit.
--
-- Wijzigingen ten opzichte van 0004/0005:
--  1) owner_id: account_identities hoort bij data.accountId (was NULL → identiteiten waren voor niemand
--     leesbaar onder RLS en ontbraken in de AVG-export).
--  2) workspace_members: schrijven alleen door eigenaar/beheerder (admin) van die ruimte; zelf vertrekken
--     (eigen lidmaatschap verwijderen) mag. Vroeger mocht elk lid (ook een kijker) lidmaatschappen toevoegen
--     of het eigen lidmaatschap ophogen (owner_id = eigen id).
--  3) Ruimte-inhoud (rijen met data.workspaceId): schrijven alleen met rol owner/admin/member; een kijker
--     (viewer) leest alleen. workspace_blocks in een ruimte: ook de maker kan als kijker niet meer schrijven.
--  4) users en workspaces: nooit schrijven via de ruimte-regel (alleen het eigen record / de eigen ruimte).
--  5) users: serverbeheerde velden (rol, status, verwijder-/herstelvelden, rechten, e-mail/sub) zijn voor
--     mijnruimte_app niet te wijzigen (trigger; in audit-modus alleen geteld). Statusovergangen die de server
--     beslist (toegang aanvragen, zelf verwijderen/herstellen) lopen bewust via de systeemrol.
-- Lezen blijft precies zoals in 0005.

-- 1) owner_id-expressie (PostgreSQL 17: SET EXPRESSION herschrijft de tabel één keer).
ALTER TABLE app.records ALTER COLUMN owner_id SET EXPRESSION AS (
  CASE WHEN tbl = 'users' THEN id
       WHEN tbl = 'account_identities' THEN COALESCE(NULLIF(data->>'accountId', ''), NULLIF(data->>'userId', ''))
       ELSE COALESCE(NULLIF(data->>'ownerUserId', ''), NULLIF(data->>'userId', ''), NULLIF(data->>'recipientUserId', ''))
  END
);

-- Ruimtes van het huidige account met (minstens) een van de gegeven rollen. Rolbepaling zoals
-- backend/werkruimte-delen.ts werkruimteRol(): eigenaar van het ruimterecord → owner; actief lid →
-- workspaceRole (admin/member/viewer), anders permission editor → member, anders viewer.
CREATE OR REPLACE FUNCTION app.mijn_werkruimtes(p_rollen text[]) RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
    SELECT COALESCE(array_agg(DISTINCT x.w), '{}'::text[]) FROM (
      SELECT r.id AS w, 'owner'::text AS rol FROM app.records r
       WHERE r.tbl = 'workspaces' AND r.owner_id = app.huidige_gebruiker()
      UNION ALL
      SELECT m.data->>'workspaceId',
             CASE WHEN m.data->>'permission' = 'owner' THEN 'owner'
                  WHEN m.data->>'workspaceRole' IN ('admin', 'member', 'viewer') THEN m.data->>'workspaceRole'
                  WHEN m.data->>'permission' = 'editor' THEN 'member'
                  ELSE 'viewer' END
        FROM app.records m
       WHERE m.tbl = 'workspace_members' AND m.owner_id = app.huidige_gebruiker() AND m.data->>'status' = 'active'
    ) x WHERE x.w IS NOT NULL AND x.rol = ANY (p_rollen) AND app.huidige_gebruiker() IS NOT NULL
  $$;

-- Tellen vanuit de database (users-trigger); alleen route/tabel/actie, geen inhoud.
CREATE OR REPLACE FUNCTION app.rls_audit_noteren(p_route text, p_tbl text, p_actie text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
    INSERT INTO app.rls_audit (route, tbl, actie, aantal) VALUES (left(COALESCE(NULLIF(p_route, ''), '?'), 200), left(p_tbl, 100), left(p_actie, 40), 1)
    ON CONFLICT (route, tbl, actie) DO UPDATE SET aantal = app.rls_audit.aantal + 1, laatst = now()
  $$;
REVOKE ALL ON FUNCTION app.rls_audit_noteren(text, text, text) FROM PUBLIC;

-- 5) Serverbeheerde velden in users. SECURITY INVOKER: current_user is de echte rol.
CREATE OR REPLACE FUNCTION app.users_servervelden_bewaken() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, app
  AS $$
DECLARE v text; v_mis boolean := false;
BEGIN
  IF current_user::text <> 'mijnruimte_app' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.tbl <> 'users' THEN RETURN NEW; END IF;
    v_mis := COALESCE(NEW.data->>'role', 'member') <> 'member' OR COALESCE(NEW.data->>'status', 'new') NOT IN ('new', 'pending');
  ELSE
    IF OLD.tbl <> 'users' AND NEW.tbl <> 'users' THEN RETURN NEW; END IF;
    IF OLD.tbl IS DISTINCT FROM NEW.tbl OR OLD.id IS DISTINCT FROM NEW.id THEN
      v_mis := true;
    ELSE
      FOREACH v IN ARRAY ARRAY['role', 'status', 'statusVoorVerwijdering', 'deletionSource', 'deletedAt', 'recoverableUntil',
                               'retiredAt', 'gewistAt', 'entitlements', 'accessLevel', 'email', 'sub'] LOOP
        IF (OLD.data->v) IS DISTINCT FROM (NEW.data->v) THEN v_mis := true; EXIT; END IF;
      END LOOP;
    END IF;
  END IF;
  IF v_mis THEN
    IF COALESCE((SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'), 'uit') = 'aan' THEN
      RAISE EXCEPTION 'USERS_SERVERVELD_GEWEIGERD' USING ERRCODE = '42501';
    END IF;
    PERFORM app.rls_audit_noteren(current_setting('app.route', true), 'users', 'serverveld');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_servervelden ON app.records;
CREATE TRIGGER users_servervelden BEFORE INSERT OR UPDATE ON app.records
  FOR EACH ROW EXECUTE FUNCTION app.users_servervelden_bewaken();

-- Lezen: ongewijzigd t.o.v. 0005.
DROP POLICY IF EXISTS records_lezen ON app.records;
CREATE POLICY records_lezen ON app.records FOR SELECT USING (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.lezen))
  OR (data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes())::text[]))
  OR (tbl = 'workspaces' AND id = ANY ((SELECT app.mijn_werkruimtes())::text[]))
);

-- Schrijven (toevoegen/wijzigen): zie kop, punten 2-4.
DROP POLICY IF EXISTS records_toevoegen ON app.records;
CREATE POLICY records_toevoegen ON app.records FOR INSERT WITH CHECK (
  (SELECT app.rls_vrij())
  OR (tbl = 'workspace_members' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin']))::text[]))
  OR (tbl <> 'workspace_members' AND (
        (owner_id = (SELECT app.huidige_gebruiker())
          AND NOT (tbl = 'workspace_blocks' AND data ? 'workspaceId' AND NOT (data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))))
     OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
     OR (tbl NOT IN ('users', 'workspaces') AND data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))
  ))
);

DROP POLICY IF EXISTS records_wijzigen ON app.records;
CREATE POLICY records_wijzigen ON app.records FOR UPDATE USING (
  (SELECT app.rls_vrij())
  OR (tbl = 'workspace_members' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin']))::text[]))
  OR (tbl <> 'workspace_members' AND (
        (owner_id = (SELECT app.huidige_gebruiker())
          AND NOT (tbl = 'workspace_blocks' AND data ? 'workspaceId' AND NOT (data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))))
     OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
     OR (tbl NOT IN ('users', 'workspaces') AND data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))
  ))
) WITH CHECK (
  (SELECT app.rls_vrij())
  OR (tbl = 'workspace_members' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin']))::text[]))
  OR (tbl <> 'workspace_members' AND (
        (owner_id = (SELECT app.huidige_gebruiker())
          AND NOT (tbl = 'workspace_blocks' AND data ? 'workspaceId' AND NOT (data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))))
     OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
     OR (tbl NOT IN ('users', 'workspaces') AND data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))
  ))
);

-- Verwijderen: als wijzigen, plus het eigen lidmaatschap (zelf vertrekken).
DROP POLICY IF EXISTS records_verwijderen ON app.records;
CREATE POLICY records_verwijderen ON app.records FOR DELETE USING (
  (SELECT app.rls_vrij())
  OR (tbl = 'workspace_members' AND (owner_id = (SELECT app.huidige_gebruiker())
                                     OR data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin']))::text[])))
  OR (tbl <> 'workspace_members' AND (
        (owner_id = (SELECT app.huidige_gebruiker())
          AND NOT (tbl = 'workspace_blocks' AND data ? 'workspaceId' AND NOT (data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))))
     OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
     OR (tbl NOT IN ('users', 'workspaces') AND data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))
  ))
);
