-- 0107 (22.10.2026, zone C): DE SFEER VAN EEN MELDING — `prive` of `technisch` — als verplicht ETIKET op site_notifications en
-- notification_jobs. Hoort bij shared/meldingen-soorten.ts (het register), backend/meldingen-ruimte.ts (lezen per paneel) en 0091
-- (de lade `ruimte`). Klacht van de eigenaar: «звіти технічних сповіщень досі показуються в панелі сповіщень користувача … аудит,
-- збої діагностики, дії агентів, звірка — чомусь досі попадають у панель».
--
-- WAAROM EEN ETIKET EN GEEN VERHUIZING (de regel van de eigenaar: bestaande rijen migreren nooit tussen ruimtes)
--   0091 gaf elke NIEUWE melding haar lade (`ruimte`) en liet elke bestaande rij met opzet in de persoonlijke lade — ook de
--   «uitrol mislukt»-, «siem»- en «toegangsverzoek»-meldingen van vóór 20.10.2026. Daardoor bleven die in de bel van de gebruiker
--   staan: niet omdat ze persoonlijk zijn, maar omdat de lade nooit verplaatst wordt. De SFEER lost dat op zonder die regel te breken:
--   • de LADE blijft wat zij is (geen rij wisselt van `ruimte`, van ontvanger of van e-mailadres; bevriezen/overdragen/wissen van
--     0086/0091 werken ongewijzigd op `ruimte`);
--   • de SFEER zegt alleen in welk PANEEL de rij hoort: de bel van de gebruiker krijgt van de server uitsluitend 'prive', het paneel
--     «Технічні сповіщення» in de technische band uitsluitend 'technisch' (en alleen in een tabblad met actief technisch profiel).
--   Dat is een eigenschap van de BRON van de melding (haar soort), geen gegeven van de mens — precies zoals de kop van 0091 al zei dat
--   meldingen geen stand eigen/gedeeld/uit hebben. Daarom mag dit etiket wél op bestaande rijen: het verandert niets aan waar de
--   gegevens liggen of van wie ze zijn, alleen aan het scherm waarin de eigenaar ze te zien krijgt.
--
-- DE REGEL (app.melding_sfeer, exact dezelfde als sfeerVanSoort/sfeerBijAanmaak in shared/meldingen-soorten.ts; de test
-- tests/eenheid/meldingen-sferen-20261022.test.ts vergelijkt de lijsten en de voorvoegsels letterlijk en de uitkomst per soort):
--   1. lade 'technisch' → 'technisch' (een persoonlijke soort, aangemaakt in de technische ruimte, hoort daar);
--   2. soort in de persoonlijke lijst → 'prive'; soort in de technische lijst → 'technisch';
--   3. technisch voorvoegsel → 'technisch'; persoonlijk voorvoegsel → 'prive';
--   4. al het andere (onbekend) → 'technisch': de bel van de gebruiker krijgt nooit iets dat niet aantoonbaar van hemzelf is.
-- Nieuwe rijen krijgen `sfeer` bij het aanmaken (backend/index.ts notify(), access/request); deze UPDATE raakt alleen rijen ZONDER etiket.
-- Idempotent: tweede keer vindt niets zonder etiket. De functie blijft bestaan voor hulpscripts en de test.
-- Terugdraaien: UPDATE app.records SET data = data - 'sfeer' WHERE tbl IN ('site_notifications','notification_jobs');
--               DROP INDEX IF EXISTS app.records_meldingen_sfeer_idx; DROP FUNCTION IF EXISTS app.melding_sfeer(text, text);

CREATE OR REPLACE FUNCTION app.melding_sfeer(p_kind text, p_ruimte text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog
  AS $$
    SELECT CASE
      WHEN p_ruimte = 'technisch' THEN 'technisch'
      WHEN lower(left(coalesce(p_kind, ''), 80)) IN ('access_decision', 'access_method_restored', 'access_method_unlinked', 'access_recovery_code_used', 'access_recovery_revoked', 'access_recovery_rotated', 'access_totp_enrolled', 'access_totp_replaced', 'account_email_conflict', 'ai_bevestiging', 'impersonatie', 'ondersteuning', 'owner_identity_mismatch', 'security', 'security_warning', 'workspace_share') THEN 'prive'
      WHEN lower(left(coalesce(p_kind, ''), 80)) IN ('access_request', 'beveiliging.zekering', 'deur', 'google_login_config', 'impersonatie.beheerder', 'mcp_app_secret', 'release', 'server', 'siem', 'uitrol', 'uitrol.mislukt', 'uitrol_voorstel', 'vault_key_expired', 'vault_key_expiring') THEN 'technisch'
      WHEN lower(left(coalesce(p_kind, ''), 80)) ~ '^(uitrol[._]|(server|deur)[._]|diag(nose)?[._]|(siem|audit)[._]|vault_|secret[._]|geheim|(integration|integratie)[._]|(beveiliging|bescherming)[._]|ssh[._-]|remote[._]|(agent[.]grant|grant)[._]|(tech|beheer|release)[._]|rook[._]|besluit[._])' THEN 'technisch'
      WHEN lower(left(coalesce(p_kind, ''), 80)) ~ '^(security|beveiliging_|passkey|login|session|sessie|herstel|recovery|access_(method|recovery|totp|decision)|toegang_|invite|uitnodig|mail|post|calendar|agenda|drive|cloud|photos|bestand|share|deel|workspace|ai_bevestiging|device|apparaat)' THEN 'prive'
      ELSE 'technisch'
    END
  $$;

-- Het etiket op bestaande rijen zonder etiket (alleen `sfeer` komt erbij; ontvanger, e-mail, ruimte, read, tekst: onaangeroerd).
UPDATE app.records
   SET data = data || jsonb_build_object('sfeer', app.melding_sfeer(data->>'kind', data->>'ruimte'))
 WHERE tbl IN ('site_notifications', 'notification_jobs')
   AND (data->>'sfeer') IS NULL;

-- Lezen gaat per (ontvanger, sfeer): de bel vraagt 'prive', de band 'technisch'.
CREATE INDEX IF NOT EXISTS records_meldingen_sfeer_idx
  ON app.records (tbl, (data->>'recipientUserId'), (data->>'sfeer'))
  WHERE tbl IN ('site_notifications', 'notification_jobs');

-- ------------------------------------------------------------------------------------------------ bewijs: niets verhuisde
DO $sfeer_bewijs$
DECLARE totaal bigint; technisch bigint; zonder bigint; verplaatst bigint;
BEGIN
  SELECT count(*) INTO totaal FROM app.records WHERE tbl IN ('site_notifications', 'notification_jobs');
  SELECT count(*) INTO technisch FROM app.records WHERE tbl IN ('site_notifications', 'notification_jobs') AND data->>'sfeer' = 'technisch';
  SELECT count(*) INTO zonder FROM app.records WHERE tbl IN ('site_notifications', 'notification_jobs') AND (data->>'sfeer') IS NULL;
  -- Een technische LADE mag nooit een persoonlijke sfeer dragen (regel 1); andersom wel (oude rij: lade prive, sfeer technisch).
  SELECT count(*) INTO verplaatst FROM app.records WHERE tbl IN ('site_notifications', 'notification_jobs') AND data->>'ruimte' = 'technisch' AND data->>'sfeer' <> 'technisch';
  IF zonder > 0 OR verplaatst > 0 THEN
    RAISE EXCEPTION 'MIGRATIE_0107_ONVOLLEDIG: % rijen zonder sfeer, % technische laden met persoonlijke sfeer', zonder, verplaatst;
  END IF;
  RAISE NOTICE '0107: sfeer-etiket klaar; meldingen en taken totaal: %, technische sfeer: % (geen rij verhuisde van lade, ontvanger of adres)', totaal, technisch;
END
$sfeer_bewijs$;
