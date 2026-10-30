-- 0006: append-only beveiligingslog app.audit (beveiliging fase 3) met hashketen per account.
-- Vervangt de schrijfkant van owner_security_audit_v2 (records). Oude rijen blijven daar staan en worden
-- door de app nog getoond (alleen lezen). Idempotent; raakt geen bestaande data.
--   owner_id  account waarop de gebeurtenis betrekking heeft (keten per owner_id; NULL = systeemketen)
--   actor_id  wie het deed (gelijk aan owner_id bij eigen acties; beheerder bij beheeracties)
--   seq       volgnummer binnen de keten; prev_hash = hash van de vorige rij in de keten ('GENESIS' eerst)
--   hash      sha256 over prev_hash + alle velden (zie app.audit_hash)
-- Wijzigen/verwijderen kan niet (trigger), behalve via app.audit_verwijderen() voor super_admin/security_admin;
-- die schrijft zelf een gebeurtenis 'audit.verwijderd' in dezelfde keten.
CREATE TABLE IF NOT EXISTS app.audit (
  id         bigserial PRIMARY KEY,
  owner_id   text,
  actor_id   text,
  action     text NOT NULL,
  type       text NOT NULL DEFAULT 'beveiliging',
  result     text NOT NULL DEFAULT '',
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash    text,
  device     text,
  service    text,
  seq        bigint NOT NULL,
  prev_hash  text NOT NULL,
  hash       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_keten_idx ON app.audit (COALESCE(owner_id, ''), seq);
CREATE INDEX IF NOT EXISTS audit_owner_nieuw_idx ON app.audit (owner_id, id DESC);
CREATE INDEX IF NOT EXISTS audit_nieuw_idx ON app.audit (id DESC);
CREATE INDEX IF NOT EXISTS audit_actie_idx ON app.audit (action, id DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON app.audit (actor_id, id DESC);
CREATE INDEX IF NOT EXISTS audit_ip_idx ON app.audit (ip_hash, id DESC);

-- Kop van elke keten (laatste seq + hash). Blijft staan als oude rijen verwijderd worden, zodat de keten
-- doorloopt (seq en prev_hash) in plaats van opnieuw bij GENESIS te beginnen.
CREATE TABLE IF NOT EXISTS app.audit_kop (
  owner_key text PRIMARY KEY,
  seq       bigint NOT NULL,
  hash      text NOT NULL
);

CREATE OR REPLACE FUNCTION app.audit_hash(p_prev text, p_owner text, p_seq bigint, p_actor text, p_action text, p_type text,
                                          p_result text, p_details jsonb, p_ip text, p_device text, p_service text, p_tijd timestamptz)
  RETURNS text LANGUAGE sql IMMUTABLE
  AS $$ SELECT encode(sha256(convert_to(concat_ws(E'\x1f', p_prev, COALESCE(p_owner, ''), p_seq::text, COALESCE(p_actor, ''), p_action, p_type,
          p_result, p_details::text, COALESCE(p_ip, ''), COALESCE(p_device, ''), COALESCE(p_service, ''),
          (floor(extract(epoch FROM p_tijd) * 1000))::bigint::text), 'UTF8')), 'hex') $$;

-- Toevoegen: volgnummer en hash in de database (per keten geserialiseerd met een advisory lock).
CREATE OR REPLACE FUNCTION app.audit_toevoegen(p_owner text, p_actor text, p_action text, p_type text, p_result text,
                                               p_details jsonb, p_ip text, p_device text, p_service text)
  RETURNS TABLE (id bigint, seq bigint, hash text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
DECLARE v_seq bigint; v_prev text; v_tijd timestamptz := clock_timestamp(); v_hash text; v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('app.audit:' || COALESCE(p_owner, ''), 0));
  SELECT k.seq, k.hash INTO v_seq, v_prev FROM app.audit_kop k WHERE k.owner_key = COALESCE(p_owner, '');
  IF v_seq IS NULL THEN
    SELECT a.seq, a.hash INTO v_seq, v_prev FROM app.audit a WHERE COALESCE(a.owner_id, '') = COALESCE(p_owner, '') ORDER BY a.seq DESC LIMIT 1;
  END IF;
  v_seq := COALESCE(v_seq, 0) + 1; v_prev := COALESCE(v_prev, 'GENESIS');
  v_hash := app.audit_hash(v_prev, p_owner, v_seq, p_actor, p_action, COALESCE(p_type, 'beveiliging'), COALESCE(p_result, ''),
                           COALESCE(p_details, '{}'::jsonb), p_ip, p_device, p_service, v_tijd);
  INSERT INTO app.audit (owner_id, actor_id, action, type, result, details, ip_hash, device, service, seq, prev_hash, hash, created_at)
  VALUES (p_owner, p_actor, p_action, COALESCE(p_type, 'beveiliging'), COALESCE(p_result, ''), COALESCE(p_details, '{}'::jsonb),
          p_ip, p_device, p_service, v_seq, v_prev, v_hash, v_tijd)
  RETURNING app.audit.id INTO v_id;
  INSERT INTO app.audit_kop (owner_key, seq, hash) VALUES (COALESCE(p_owner, ''), v_seq, v_hash)
  ON CONFLICT (owner_key) DO UPDATE SET seq = EXCLUDED.seq, hash = EXCLUDED.hash;
  RETURN QUERY SELECT v_id, v_seq, v_hash;
END $$;

-- Append-only: UPDATE/DELETE/TRUNCATE geweigerd, tenzij binnen app.audit_verwijderen (transactie-GUC).
CREATE OR REPLACE FUNCTION app.audit_alleen_toevoegen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_verwijderen', true) = 'ja' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'app.audit is append-only (%)', TG_OP USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS audit_alleen_toevoegen ON app.audit;
CREATE TRIGGER audit_alleen_toevoegen BEFORE UPDATE OR DELETE ON app.audit FOR EACH ROW EXECUTE FUNCTION app.audit_alleen_toevoegen();
DROP TRIGGER IF EXISTS audit_geen_truncate ON app.audit;
CREATE TRIGGER audit_geen_truncate BEFORE TRUNCATE ON app.audit FOR EACH STATEMENT EXECUTE FUNCTION app.audit_alleen_toevoegen();

-- Verwijderen (bijv. AVG-verzoek of bewaartermijn): alleen super_admin/security_admin (eigenaar = super_admin).
-- Verwijdert rijen van p_owner van vóór p_voor en logt dat in dezelfde keten. Geeft het aantal terug.
CREATE OR REPLACE FUNCTION app.audit_verwijderen(p_actor text, p_owner text, p_voor timestamptz, p_reden text)
  RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
DECLARE v_aantal bigint; v_van bigint; v_tot bigint;
BEGIN
  IF p_actor IS NULL OR NOT (
       EXISTS (SELECT 1 FROM app.records u WHERE u.tbl = 'users' AND u.id = p_actor AND u.data->>'role' = 'owner' AND COALESCE(u.data->>'status', '') <> 'blocked')
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
  RETURN v_aantal;
END $$;

-- Controle van één keten: hashes opnieuw berekenen, schakels en gaten tellen. Gaten zijn alleen in orde als
-- een latere 'audit.verwijderd' ze dekt.
CREATE OR REPLACE FUNCTION app.audit_controleer(p_owner text)
  RETURNS TABLE (totaal bigint, hash_fout bigint, schakel_fout bigint, onverklaarde_gaten bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
  WITH k AS (
    SELECT a.*, lag(a.seq) OVER w AS vorige_seq, lag(a.hash) OVER w AS vorige_hash
      FROM app.audit a WHERE COALESCE(a.owner_id, '') = COALESCE(p_owner, '') WINDOW w AS (ORDER BY a.seq)
  ), weg AS (
    SELECT (details->>'seqVan')::bigint AS van, (details->>'seqTot')::bigint AS tot FROM k WHERE action = 'audit.verwijderd' AND details ? 'seqVan'
  )
  SELECT count(*),
         count(*) FILTER (WHERE hash <> app.audit_hash(prev_hash, owner_id, seq, actor_id, action, type, result, details, ip_hash, device, service, created_at)),
         count(*) FILTER (WHERE vorige_seq IS NOT NULL AND seq = vorige_seq + 1 AND prev_hash <> vorige_hash),
         count(*) FILTER (WHERE (vorige_seq IS NULL AND seq > 1 OR vorige_seq IS NOT NULL AND seq > vorige_seq + 1)
                            AND NOT EXISTS (SELECT 1 FROM weg WHERE weg.tot >= seq - 1 AND weg.van <= COALESCE(vorige_seq, 0) + 1))
    FROM k
  $$;
