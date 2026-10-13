-- 0033: RLS per GROEP van tabellen (architectuur 13.10.2026, etap 5 «fundament ізоляції», parallel aan de zichtbare stappen).
--
-- Tot nu toe: één schakelaar voor alles (app.rls_instellingen.afdwingen = 'uit' | 'aan'; zie 0004/0007). Alles tegelijk aanzetten is
-- riskant: één vergeten systeemstap in één route breekt dan een hele dienst. Nu kan het per groep, van laag naar hoog risico, telkens
-- pas als app.rls_audit voor die tabellen leeg blijft:
--   voorkeuren → meldingen → mail → werkruimtes → verbindingen → identiteit.
-- De globale schakelaar blijft werken zoals vroeger ('aan' = alles afgedwongen). Een groep op 'aan' dwingt alleen haar tabellen af.
-- Schakelen gebeurt NIET via de site: alleen als root met het vooraf geschreven script
--   deploy/db-rollen-instellen.sh rls-groep <groep> aan|uit     (en rls-groepen voor de stand)
-- De site (technisch profiel, alleen lezen) toont per groep de tabellen, de stand en wat de audit zou weigeren.
-- Alleen mijnruimte_app wordt beperkt (systeemrol: BYPASSRLS; eigenaar van de tabel: geen FORCE) — ongewijzigd t.o.v. 0004.
-- Idempotent.

CREATE TABLE IF NOT EXISTS app.rls_groepen (
  groep       text PRIMARY KEY CHECK (groep ~ '^[a-z]{3,20}$'),
  volgorde    int  NOT NULL,
  tabellen    text[] NOT NULL,
  afdwingen   text NOT NULL DEFAULT 'uit' CHECK (afdwingen IN ('uit', 'aan')),
  toelichting text NOT NULL DEFAULT '',
  bijgewerkt  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.rls_groepen (groep, volgorde, tabellen, toelichting) VALUES
  ('voorkeuren', 1, ARRAY['owner_ui_preferences_v1', 'mail_view_preferences_v1', 'mail_notification_preferences_v1', 'menu_tellers_v1', 'cognitive_resume_context_v1', 'mail_resume_v1'], 'Eigen instellingen: laagste risico, eerst aanzetten.'),
  ('meldingen', 2, ARRAY['site_notifications', 'notification_jobs'], 'Meldingen per account.'),
  ('mail', 3, ARRAY['mail_accounts_v1', 'mail_items_v1', 'mail_metrics_v1', 'mail_jobs_v2', 'mail_state_intents_v1', 'mail_state_intent_events_v1'], 'Gegevens van de e-maildienst per account.'),
  ('werkruimtes', 4, ARRAY['workspaces', 'workspace_members', 'workspace_blocks'], 'Ruimtes, leden en blokken (rollen owner/admin/member/viewer).'),
  ('verbindingen', 5, ARRAY['owner_connections_v1', 'owner_browser_grants_v1', 'owner_vault_v1', 'credential_contours_v1', 'api_machine_tokens_v1', 'browser_policies', 'browser_grants'], 'Koppelingen, kluis en tokens.'),
  ('identiteit', 6, ARRAY['users', 'account_identities', 'account_email_conflicts_v1'], 'Accounts: als laatste (de gids leest via de systeemrol).')
ON CONFLICT (groep) DO NOTHING;

-- Tabellen waarvan de groep 'aan' staat (leeg als niets). Alleen gelezen in de policy's van mijnruimte_app.
CREATE OR REPLACE FUNCTION app.rls_afgedwongen() RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$ SELECT COALESCE(array_agg(DISTINCT t), '{}'::text[]) FROM app.rls_groepen g, unnest(g.tabellen) t WHERE g.afdwingen = 'aan' $$;

-- Users-trigger (0007): ook afdwingen als de groep van 'users' aan staat.
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
    IF COALESCE((SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'), 'uit') = 'aan' OR 'users' = ANY (app.rls_afgedwongen()) THEN
      RAISE EXCEPTION 'USERS_SERVERVELD_GEWEIGERD' USING ERRCODE = '42501';
    END IF;
    PERFORM app.rls_audit_noteren(current_setting('app.route', true), 'users', 'serverveld');
  END IF;
  RETURN NEW;
END $$;
-- Policy's van app.records: zoals 0007, maar «vrij» geldt niet meer voor tabellen van een afgedwongen groep.
DROP POLICY IF EXISTS records_lezen ON app.records;
CREATE POLICY records_lezen ON app.records FOR SELECT USING (
  ((SELECT app.rls_vrij()) AND NOT (tbl = ANY ((SELECT app.rls_afgedwongen())::text[])))
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.lezen))
  OR (data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes())::text[]))
  OR (tbl = 'workspaces' AND id = ANY ((SELECT app.mijn_werkruimtes())::text[]))
);

-- Schrijven (toevoegen/wijzigen): zie kop, punten 2-4.
DROP POLICY IF EXISTS records_toevoegen ON app.records;
CREATE POLICY records_toevoegen ON app.records FOR INSERT WITH CHECK (
  ((SELECT app.rls_vrij()) AND NOT (tbl = ANY ((SELECT app.rls_afgedwongen())::text[])))
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
  ((SELECT app.rls_vrij()) AND NOT (tbl = ANY ((SELECT app.rls_afgedwongen())::text[])))
  OR (tbl = 'workspace_members' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin']))::text[]))
  OR (tbl <> 'workspace_members' AND (
        (owner_id = (SELECT app.huidige_gebruiker())
          AND NOT (tbl = 'workspace_blocks' AND data ? 'workspaceId' AND NOT (data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))))
     OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
     OR (tbl NOT IN ('users', 'workspaces') AND data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))
  ))
) WITH CHECK (
  ((SELECT app.rls_vrij()) AND NOT (tbl = ANY ((SELECT app.rls_afgedwongen())::text[])))
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
  ((SELECT app.rls_vrij()) AND NOT (tbl = ANY ((SELECT app.rls_afgedwongen())::text[])))
  OR (tbl = 'workspace_members' AND (owner_id = (SELECT app.huidige_gebruiker())
                                     OR data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin']))::text[])))
  OR (tbl <> 'workspace_members' AND (
        (owner_id = (SELECT app.huidige_gebruiker())
          AND NOT (tbl = 'workspace_blocks' AND data ? 'workspaceId' AND NOT (data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))))
     OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
     OR (tbl NOT IN ('users', 'workspaces') AND data ? 'workspaceId' AND data->>'workspaceId' = ANY ((SELECT app.mijn_werkruimtes(ARRAY['owner', 'admin', 'member']))::text[]))
  ))
);
