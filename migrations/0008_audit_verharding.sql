-- 0008: verharding van app.audit (audit-fix 4). Idempotent.
--  1) Schrijven alleen via app.audit_toevoegen (SECURITY DEFINER, eigenaar = migrator). rechten.sql trekt de
--     directe INSERT op app.audit in bij mijnruimte_app én mijnruimte_system.
--  2) Volgnummer onder de advisory lock = max(kop, hoogste seq in de tabel) + 1, met herhaalpoging bij een
--     unique_violation. Een (oude) vervalste rij met een hoog seq blokkeert de keten dus niet meer.
--  3) Verwijderen alleen voor accounts in app.audit_beheerders: een tabel die de app (app- en systeemrol) niet
--     kan wijzigen. Vullen kan alleen postgres/de migrator: deploy/db-rollen-instellen.sh audit-beheerder <id>.
--     Daarnaast moet het account nog eigenaar of super/security_admin zijn en niet geblokkeerd.
CREATE TABLE IF NOT EXISTS app.audit_beheerders (
  user_id     text PRIMARY KEY,
  toegevoegd  timestamptz NOT NULL DEFAULT now(),
  notitie     text NOT NULL DEFAULT ''
);

CREATE OR REPLACE FUNCTION app.audit_toevoegen(p_owner text, p_actor text, p_action text, p_type text, p_result text,
                                               p_details jsonb, p_ip text, p_device text, p_service text)
  RETURNS TABLE (id bigint, seq bigint, hash text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
DECLARE v_seq bigint; v_prev text; v_k_seq bigint; v_k_hash text; v_m_seq bigint; v_m_hash text;
        v_tijd timestamptz := clock_timestamp(); v_hash text; v_id bigint; v_poging int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('app.audit:' || COALESCE(p_owner, ''), 0));
  LOOP
    v_poging := v_poging + 1;
    SELECT k.seq, k.hash INTO v_k_seq, v_k_hash FROM app.audit_kop k WHERE k.owner_key = COALESCE(p_owner, '');
    SELECT a.seq, a.hash INTO v_m_seq, v_m_hash FROM app.audit a WHERE COALESCE(a.owner_id, '') = COALESCE(p_owner, '') ORDER BY a.seq DESC LIMIT 1;
    IF COALESCE(v_m_seq, 0) >= COALESCE(v_k_seq, 0) THEN v_seq := v_m_seq; v_prev := v_m_hash; ELSE v_seq := v_k_seq; v_prev := v_k_hash; END IF;
    v_seq := COALESCE(v_seq, 0) + 1; v_prev := COALESCE(v_prev, 'GENESIS');
    v_hash := app.audit_hash(v_prev, p_owner, v_seq, p_actor, p_action, COALESCE(p_type, 'beveiliging'), COALESCE(p_result, ''),
                             COALESCE(p_details, '{}'::jsonb), p_ip, p_device, p_service, v_tijd);
    BEGIN
      INSERT INTO app.audit (owner_id, actor_id, action, type, result, details, ip_hash, device, service, seq, prev_hash, hash, created_at)
      VALUES (p_owner, p_actor, p_action, COALESCE(p_type, 'beveiliging'), COALESCE(p_result, ''), COALESCE(p_details, '{}'::jsonb),
              p_ip, p_device, p_service, v_seq, v_prev, v_hash, v_tijd)
      RETURNING app.audit.id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Iemand anders (zonder de lock) schreef hetzelfde seq: kop bijwerken en opnieuw.
      IF v_poging >= 5 THEN RAISE; END IF;
      INSERT INTO app.audit_kop (owner_key, seq, hash) VALUES (COALESCE(p_owner, ''), v_seq, v_prev)
      ON CONFLICT (owner_key) DO UPDATE SET seq = GREATEST(app.audit_kop.seq, EXCLUDED.seq), hash = app.audit_kop.hash;
    END;
  END LOOP;
  INSERT INTO app.audit_kop (owner_key, seq, hash) VALUES (COALESCE(p_owner, ''), v_seq, v_hash)
  ON CONFLICT (owner_key) DO UPDATE SET seq = EXCLUDED.seq, hash = EXCLUDED.hash;
  RETURN QUERY SELECT v_id, v_seq, v_hash;
END $$;

CREATE OR REPLACE FUNCTION app.audit_verwijderen(p_actor text, p_owner text, p_voor timestamptz, p_reden text)
  RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
DECLARE v_aantal bigint; v_van bigint; v_tot bigint;
BEGIN
  IF p_actor IS NULL
     OR NOT EXISTS (SELECT 1 FROM app.audit_beheerders b WHERE b.user_id = p_actor)
     OR EXISTS (SELECT 1 FROM app.records u WHERE u.tbl = 'users' AND u.id = p_actor AND COALESCE(u.data->>'status', '') IN ('blocked', 'deleted'))
     OR NOT (
          EXISTS (SELECT 1 FROM app.records u WHERE u.tbl = 'users' AND u.id = p_actor AND u.data->>'role' = 'owner')
       OR EXISTS (SELECT 1 FROM app.records r WHERE r.tbl = 'admin_role_assignments_v1' AND r.data->>'userId' = p_actor
                   AND r.data->>'role' IN ('super_admin', 'security_admin') AND COALESCE((r.data->>'active')::boolean, false))
     ) THEN
    RAISE EXCEPTION 'AUDIT_VERWIJDEREN_GEWEIGERD' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(p_reden), '') = '' THEN RAISE EXCEPTION 'AUDIT_VERWIJDEREN_REDEN_VERPLICHT' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app.audit:' || COALESCE(p_owner, ''), 0));
  PERFORM set_config('app.audit_verwijderen', 'ja', true);
  WITH weg AS (DELETE FROM app.audit a WHERE COALESCE(a.owner_id, '') = COALESCE(p_owner, '') AND a.created_at < p_voor RETURNING a.seq)
  SELECT count(*), min(seq), max(seq) INTO v_aantal, v_van, v_tot FROM weg;
  PERFORM set_config('app.audit_verwijderen', '', true);
  PERFORM app.audit_toevoegen(p_owner, p_actor, 'audit.verwijderd', 'beheer', 'success',
    jsonb_build_object('aantal', v_aantal, 'seqVan', v_van, 'seqTot', v_tot, 'voor', p_voor, 'reden', left(p_reden, 500)), NULL, NULL, 'admin');
  -- Ook in de systeemketen, zodat een verwijdering nooit alleen in de (deels gewiste) eigen keten staat.
  IF p_owner IS NOT NULL THEN
    PERFORM app.audit_toevoegen(NULL, p_actor, 'audit.verwijderd', 'beheer', 'success',
      jsonb_build_object('ownerId', p_owner, 'aantal', v_aantal, 'voor', p_voor), NULL, NULL, 'admin');
  END IF;
  RETURN v_aantal;
END $$;

-- Functies: alleen de app-rollen mogen toevoegen; PUBLIC niet (rechten.sql geeft EXECUTE gericht).
REVOKE ALL ON FUNCTION app.audit_toevoegen(text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_verwijderen(text, text, timestamptz, text) FROM PUBLIC;
