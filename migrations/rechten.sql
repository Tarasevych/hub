-- rechten.sql: rechten van de drie databaserollen (beveiliging fase 2). GEEN genummerde migratie: wordt na
-- elke migratierun opnieuw uitgevoerd (server/migrate.ts) en door deploy/db-rollen.sql. Idempotent; doet
-- niets zolang de rollen niet bestaan (dan werkt alles met de oude ene rol, zoals vroeger).
--   mijnruimte_app     alleen DML op app.records (onder RLS) + lezen van de RLS-instellingen;
--                      app.audit: geen tabelrechten, alleen EXECUTE op app.audit_toevoegen (audit-fix 4).
--   mijnruimte_system  DML op alle tabellen (BYPASSRLS), behalve: app.audit alleen lezen (toevoegen via
--                      app.audit_toevoegen, verwijderen via app.audit_verwijderen), app.audit_kop en
--                      app.audit_beheerders alleen lezen, schema_migrations, rls_instellingen en
--                      rls_gedeelde_tabellen alleen lezen.
DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT USAGE ON SCHEMA app TO mijnruimte_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.records TO mijnruimte_app;
    -- 0077 (GitHub-koppeling): github_koppeling_v1 en github_oauth_state_v1 zijn logische tabellen IN app.records, dus ze
    -- vallen onder dit ene recht en onder de policy's van 0007/0033 — er hoort hier geen aparte GRANT bij. Ze staan in de
    -- RLS-groep «verbindingen», zodat een versleutelde GitHub-token of een openstaande OAuth-state nooit bij een ander
    -- account te lezen is zodra die groep op 'aan' staat.
    -- 0009: Local Machine Connector. Onder RLS (policy op user_id); het WebSocket-kanaal en het koppelen van een
    -- agent lopen via de systeemrol, de eigenaar-UI via deze rol.
    IF to_regclass('app.agents') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.agents, app.agent_pairing_codes, app.agent_commands TO mijnruimte_app; END IF;
    -- 0017-0020 (veilig-agenten-0.4): toestemmingen, AI-instellingen, MCP-bord/tokens/log en diagnose-archief. Alleen via de app-rol
    -- met app.user_id (strikte RLS: altijd eigen rijen). Geen DELETE op grants: intrekken = revoked_at (spoor blijft).
    IF to_regclass('app.ai_grants') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON app.user_ai_settings, app.ai_grants TO mijnruimte_app;
      REVOKE DELETE ON app.ai_grants FROM mijnruimte_app;
    END IF;
    IF to_regclass('app.mcp_console_items') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.mcp_console_items TO mijnruimte_app;
      GRANT SELECT, INSERT, UPDATE ON app.mcp_console_tokens TO mijnruimte_app;
      GRANT SELECT, INSERT, DELETE ON app.mcp_console_log TO mijnruimte_app;
    END IF;
    IF to_regclass('app.browser_diag_archive') IS NOT NULL THEN GRANT SELECT, INSERT, DELETE ON app.browser_diag_archive TO mijnruimte_app; END IF;
    -- 0127: notities vNext (zelfde rechten als het bord: eigen rijen onder RLS).
    IF to_regclass('app.notities') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.notities, app.notities_mappen, app.notities_revisies TO mijnruimte_app;
      GRANT USAGE, SELECT ON SEQUENCE app.notities_revisies_id_seq TO mijnruimte_app;
    END IF;
    -- 0128/0131: huis vNext (lid van de woning onder RLS + SECURITY DEFINER helpers zonder kringloop).
    IF to_regclass('app.huis_woningen') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.huis_woningen, app.huis_leden, app.huis_ruimtes, app.huis_integraties, app.huis_apparaten, app.huis_toestanden, app.huis_opdrachten, app.huis_scenes, app.huis_automatiseringen, app.huis_gebeurtenissen, app.huis_voorstellen TO mijnruimte_app;
      GRANT USAGE, SELECT ON SEQUENCE app.huis_gebeurtenissen_id_seq TO mijnruimte_app;
    END IF;
    IF to_regprocedure('app.huis_is_lid(uuid)') IS NOT NULL THEN
      GRANT EXECUTE ON FUNCTION app.huis_is_lid(uuid), app.huis_is_eigenaar(uuid) TO mijnruimte_app;
    END IF;
    -- 0022: goedkeuren van updates (voorbereiders, voorstellen, WebAuthn-challenges): alleen de systeemrol, nooit de app-rol.
    IF to_regclass('app.uitrol_voorstellen') IS NOT NULL THEN REVOKE ALL ON app.uitrol_voorbereiders, app.uitrol_voorstellen, app.goedkeur_uitdagingen FROM mijnruimte_app; END IF;
    -- 0047: geschiedenis van uitrollen (runs en logregels): alleen de systeemrol.
    IF to_regclass('app.uitrol_runs') IS NOT NULL THEN REVOKE ALL ON app.uitrol_runs, app.uitrol_run_regels FROM mijnruimte_app; END IF;
    -- 0081: pogingen die niet tot een installatie kwamen (ook afbrekingen die de browser meldde): alleen de systeemrol.
    IF to_regclass('app.uitrol_pogingen') IS NOT NULL THEN REVOKE ALL ON app.uitrol_pogingen FROM mijnruimte_app; END IF;
    -- 0105: besluiten van de eigenaar met passkey (terugdraaien, externe MCP-hosts): lezen onder RLS (eigen rijen), schrijven alleen de systeemrol.
    IF to_regclass('app.eigenaar_besluiten') IS NOT NULL THEN
      GRANT SELECT ON app.eigenaar_besluiten TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.eigenaar_besluiten FROM mijnruimte_app;
    END IF;
    -- 0112 (zone F): werkblad per lade — de app-rol leest en schrijft eigen rijen onder RLS (zelfde vorm als 0103 zoek_geschiedenis).
    IF to_regclass('app.werkblad_indeling') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_indeling TO mijnruimte_app; END IF;
    -- 0114/0116 (Werkblad v3 + blokken): lade/laag/items/plekken, eigen rijen onder RLS (zelfde vorm als 0112).
    IF to_regclass('app.werkblad_items') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_v3_lade, app.werkblad_layout, app.werkblad_items TO mijnruimte_app; END IF;
    IF to_regclass('app.werkblad_plekken') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_plekken TO mijnruimte_app; END IF;
    -- 0115: technische ruimtes v2 (alleen lezen onder RLS voor app-rol).
    IF to_regclass('app.tech_ruimte_sessies') IS NOT NULL THEN
      GRANT SELECT ON app.tech_ruimte_sessies, app.tech_ruimte_tabs, app.tech_ruimte_ai TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.tech_ruimte_sessies, app.tech_ruimte_tabs, app.tech_ruimte_ai FROM mijnruimte_app;
    END IF;
    -- 0117-0119: cloud overdracht-jobs, move-proofs en share-receipts (alleen lezen onder RLS voor app-rol).
    IF to_regclass('app.cloud_overdracht_jobs') IS NOT NULL THEN GRANT SELECT ON app.cloud_overdracht_jobs TO mijnruimte_app; END IF;
    IF to_regclass('app.cloud_move_proofs') IS NOT NULL THEN GRANT SELECT ON app.cloud_move_proofs TO mijnruimte_app; END IF;
    IF to_regclass('app.cloud_share_receipts') IS NOT NULL THEN GRANT SELECT ON app.cloud_share_receipts TO mijnruimte_app; END IF;
    -- 0061: archieven van releases en GitHub-publicatie: alleen de systeemrol.
    IF to_regclass('app.uitrol_github_publicaties') IS NOT NULL THEN REVOKE ALL ON app.uitrol_github_instellingen, app.uitrol_github_publicaties FROM mijnruimte_app; END IF;
    -- 0023: passkeys per gebruiker (Aanmeldmethoden). Onder strikte RLS (altijd eigen rijen, app.user_id).
    IF to_regclass('app.passkeys') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.passkeys, app.passkey_uitdagingen TO mijnruimte_app; END IF;
    -- 0024: gebruikscontext en notities (eigen rijen, RLS); wijzigingen alleen lezen (schrijven doet de systeemrol).
    IF to_regclass('app.toegang_gebruik') IS NOT NULL THEN
      GRANT SELECT, INSERT, DELETE ON app.toegang_gebruik TO mijnruimte_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.toegang_notities TO mijnruimte_app;
      GRANT SELECT ON app.toegang_wijzigingen TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.toegang_wijzigingen FROM mijnruimte_app;
    END IF;
    -- 0025: toegangscodes voor anderen: de app-rol leest alleen (eigen rijen, RLS); schrijven doet de systeemrol.
    IF to_regclass('app.toegangscodes') IS NOT NULL THEN
      GRANT SELECT ON app.toegangscodes, app.gast_sessies, app.toegangscode_log TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.toegangscodes, app.gast_sessies, app.toegangscode_log FROM mijnruimte_app;
    END IF;
    -- 0030: technische profielen en activeringen: de app-rol leest alleen (eigen rijen, RLS); schrijven doet de systeemrol.
    IF to_regclass('app.tech_profielen') IS NOT NULL THEN
      GRANT SELECT ON app.tech_profielen, app.tech_activaties TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.tech_profielen, app.tech_activaties FROM mijnruimte_app;
    END IF;
    -- 0032: diagnoseverslagen: de app-rol leest alleen eigen rijen; schrijven doet de systeemrol.
    IF to_regclass('app.diagnose_meldingen') IS NOT NULL THEN
      GRANT SELECT ON app.diagnose_meldingen TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.diagnose_meldingen FROM mijnruimte_app;
    END IF;
    -- 0040: cursor van de SIEM-export: niets voor de app-rol.
    IF to_regclass('app.siem_export') IS NOT NULL THEN REVOKE ALL ON app.siem_export FROM mijnruimte_app; END IF;
    -- 0070: toegangssleutels voor /assets/tech/ en accountdiagnose: niets voor de app-rol (alleen de systeemrol).
    IF to_regclass('app.tech_asset_toegang') IS NOT NULL THEN REVOKE ALL ON app.tech_asset_toegang, app.diagnostiek_account_uitslagen FROM mijnruimte_app; END IF;
    -- 0038: feature flags en tests van testers: niets voor de app-rol (lezen en schrijven via de systeemrol, backend/flags.ts).
    IF to_regclass('app.feature_flags') IS NOT NULL THEN REVOKE ALL ON app.feature_flags, app.feature_flag_tests FROM mijnruimte_app; END IF;
    -- 0034: tellers van de beleidsdienst (schaduw): niets voor de app-rol.
    IF to_regclass('app.beleid_schaduw') IS NOT NULL THEN REVOKE ALL ON app.beleid_schaduw FROM mijnruimte_app; END IF;
    -- 0035: ondersteuning met toestemming: de app-rol leest alleen eigen rijen (als aanvrager of doel); schrijven doet de systeemrol.
    -- 0093/0100 (zoekkern): de index, de stand per bron en het woordenboek van de eigenaar — via de app-rol onder RLS
    -- (user_id = app.huidige_gebruiker()); de wachtrij en de OCR-cache (0096) blijven van de systeemrol (cron).
    IF to_regclass('app.zoek_objecten') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_objecten TO mijnruimte_app;
      GRANT USAGE, SELECT ON SEQUENCE app.zoek_objecten_id_seq TO mijnruimte_app;
    END IF;
    IF to_regclass('app.zoek_bron_stand') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_bron_stand TO mijnruimte_app; END IF;
    IF to_regclass('app.zoek_synoniemen_eigenaar') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_synoniemen_eigenaar TO mijnruimte_app; END IF;
    IF to_regclass('app.zoek_ocr_tekst') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_ocr_tekst TO mijnruimte_app; END IF;
    IF to_regclass('app.zoek_geschiedenis') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_geschiedenis TO mijnruimte_app; END IF;
    IF to_regclass('app.ondersteuning_verzoeken') IS NOT NULL THEN
      GRANT SELECT ON app.ondersteuning_verzoeken TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.ondersteuning_verzoeken FROM mijnruimte_app;
    END IF;
    -- 0068: «Подивитися як користувач»: de app-rol leest alleen eigen rijen; schrijven en controleren doet de systeemrol.
    IF to_regclass('app.impersonatie_sessies') IS NOT NULL THEN
      GRANT SELECT ON app.impersonatie_sessies TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.impersonatie_sessies FROM mijnruimte_app;
    END IF;
    -- 0069: uitgegeven SSH-certificaten: de app-rol leest alleen eigen rijen; uitgeven en intrekken schrijft de systeemrol.
    IF to_regclass('app.ssh_ca_certificaten') IS NOT NULL THEN
      GRANT SELECT ON app.ssh_ca_certificaten TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.ssh_ca_certificaten FROM mijnruimte_app;
    END IF;
    -- 0036: terminalsessies: de app-rol leest alleen eigen rijen (zonder opname-inhoud via routes); schrijven doet de systeemrol.
    IF to_regclass('app.terminal_sessies') IS NOT NULL THEN
      GRANT SELECT ON app.terminal_sessies TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.terminal_sessies FROM mijnruimte_app;
    END IF;
    -- 0113 (zone G): opdracht-terminal: eigen rijen lezen onder RLS; schrijven alleen de systeemrol.
    IF to_regclass('app.terminal_opdrachten') IS NOT NULL THEN
      GRANT SELECT ON app.terminal_opdrachten TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.terminal_opdrachten FROM mijnruimte_app;
    END IF;
    -- 0067: extern bureaublad (verbindingen, toegestane hosts, sessies): de app-rol leest alleen eigen rijen; schrijven doet de systeemrol.
    IF to_regclass('app.remote_verbindingen') IS NOT NULL THEN
      GRANT SELECT ON app.remote_verbindingen, app.remote_instellingen, app.remote_sessies TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.remote_verbindingen, app.remote_instellingen, app.remote_sessies FROM mijnruimte_app;
    END IF;
    -- 0072: ontgrendelingen van de browserextensie: de app-rol leest alleen eigen rijen; ontgrendelen en intrekken schrijft de systeemrol.
    IF to_regclass('app.extensie_ontgrendelingen') IS NOT NULL THEN
      GRANT SELECT ON app.extensie_ontgrendelingen TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.extensie_ontgrendelingen FROM mijnruimte_app;
    END IF;
    -- 0073: beleid van de browserextensie per gebruiker: de app-rol leest alleen de eigen rij; wijzigen (eigenaar/users.manage) doet de systeemrol.
    IF to_regclass('app.extensie_beleid') IS NOT NULL THEN
      GRANT SELECT ON app.extensie_beleid TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.extensie_beleid FROM mijnruimte_app;
    END IF;
    -- 0110 (zone E): matrix «Браузер і агенти» per gebruiker: de app-rol leest alleen eigen rijen; schrijven doet de systeemrol.
    IF to_regclass('app.extensie_matrix') IS NOT NULL THEN
      GRANT SELECT ON app.extensie_matrix TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.extensie_matrix FROM mijnruimte_app;
    END IF;
    -- 0031: weergave (простий/розширений): de app-rol leest alleen de eigen rij; schrijven doet de systeemrol.
    IF to_regclass('app.ui_weergave') IS NOT NULL THEN
      GRANT SELECT ON app.ui_weergave TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.ui_weergave FROM mijnruimte_app;
    END IF;
    -- 0064: afzenders per account (mail): eigen rijen lezen/schrijven onder RLS; de voortgang van de eerste controle schrijft de systeemrol.
    IF to_regclass('app.mail_afzenders') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.mail_afzenders TO mijnruimte_app;
      GRANT SELECT ON app.mail_afzender_audit TO mijnruimte_app;
      REVOKE INSERT, UPDATE, DELETE ON app.mail_afzender_audit FROM mijnruimte_app;
    END IF;
    -- 0074: contacten en afzenders: DNS-bewijs en de voortgang van de volledige controle per mailbox — eigen rijen onder RLS
    -- (de voortgang wordt in dezelfde transactie als de contactrijen geschreven, zodat hervatten nooit dubbel telt).
    IF to_regclass('app.mail_contacten_scan') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.mail_domein_dns, app.mail_contacten_scan TO mijnruimte_app;
    END IF;
    -- 0075: de bewaarde keuze «запам'ятати вибір» van de controle (automatisch / overslaan / vragen): eigen rij onder RLS.
    IF to_regclass('app.mail_contacten_scan_beleid') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON app.mail_contacten_scan_beleid TO mijnruimte_app;
    END IF;
    -- 0076: de tweerichtingsagenda. Eigen rijen onder RLS: de band lokaal <-> Google met de idempotentie-sleutels,
    -- de externe abonnementen (.ics / CalDAV; het CalDAV-wachtwoord staat versleuteld in de kolom `geheim`) en hun
    -- spiegel. DELETE hoort erbij: de gebruiker mag een abonnement en zijn afspraken werkelijk weghalen.
    IF to_regclass('app.agenda_koppeling') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.agenda_koppeling, app.agenda_abonnement, app.agenda_externe_gebeurtenis TO mijnruimte_app;
    END IF;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO mijnruimte_app;
    IF to_regclass('app.rls_instellingen') IS NOT NULL THEN GRANT SELECT ON app.rls_instellingen, app.rls_gedeelde_tabellen TO mijnruimte_app; END IF;
    -- 0033: RLS-groepen: de app leest, schakelen doet alleen root (db-rollen-instellen.sh rls-groep).
    IF to_regclass('app.rls_groepen') IS NOT NULL THEN GRANT SELECT ON app.rls_groepen TO mijnruimte_app; REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.rls_groepen FROM mijnruimte_app; END IF;
    -- 0066: schakelaars van de beschermingen en het zetten van de RLS-stand: nooit de app-rol.
    IF to_regclass('app.beveiliging_schakelaars') IS NOT NULL THEN REVOKE ALL ON app.beveiliging_schakelaars FROM mijnruimte_app; END IF;
    IF to_regprocedure('app.rls_afdwingen_zetten(text)') IS NOT NULL THEN REVOKE ALL ON FUNCTION app.rls_afdwingen_zetten(text) FROM PUBLIC, mijnruimte_app; END IF;
    -- Audit-fix 9: de users-trigger telt (audit-modus) via deze functie; de app kan rls_audit zelf niet schrijven.
    IF to_regprocedure('app.rls_audit_noteren(text, text, text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION app.rls_audit_noteren(text, text, text) TO mijnruimte_app; END IF;
    IF to_regclass('app.audit') IS NOT NULL THEN
      -- Audit-fix 4: geen directe INSERT meer (vervalste rijen met eigen seq/hash braken de keten). Alleen via
      -- app.audit_toevoegen (SECURITY DEFINER); niet lezen, wijzigen of verwijderen.
      REVOKE ALL ON app.audit FROM mijnruimte_app;
      IF to_regclass('app.audit_kop') IS NOT NULL THEN REVOKE ALL ON app.audit_kop FROM mijnruimte_app; END IF;
      IF to_regclass('app.audit_beheerders') IS NOT NULL THEN REVOKE ALL ON app.audit_beheerders FROM mijnruimte_app; END IF;
      GRANT EXECUTE ON FUNCTION app.audit_toevoegen(text, text, text, text, text, jsonb, text, text, text) TO mijnruimte_app;
      REVOKE EXECUTE ON FUNCTION app.audit_verwijderen(text, text, timestamptz, text) FROM PUBLIC, mijnruimte_app;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT USAGE ON SCHEMA app TO mijnruimte_system;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO mijnruimte_system;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO mijnruimte_system;
    REVOKE INSERT, UPDATE, DELETE ON app.schema_migrations FROM mijnruimte_system;
    -- De RLS-stand en de allowlist wijzigt alleen het rollenscript (postgres/migrator), nooit de app zelf.
    IF to_regclass('app.rls_instellingen') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.rls_instellingen, app.rls_gedeelde_tabellen FROM mijnruimte_system; END IF;
    -- 0033: ook de systeemrol (dus de site) kan RLS-groepen niet schakelen; alleen lezen voor het overzicht.
    IF to_regclass('app.rls_groepen') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.rls_groepen FROM mijnruimte_system; GRANT SELECT ON app.rls_groepen TO mijnruimte_system; END IF;
    -- 0066: de site zet de globale RLS-stand alleen via deze functie (eigenaar + techprofiel + passkey, backend/beveiliging-schakelaars.ts).
    -- Veilig: de systeemrol heeft BYPASSRLS; de stand beperkt alleen mijnruimte_app. rls_instellingen zelf blijft alleen-lezen.
    IF to_regprocedure('app.rls_afdwingen_zetten(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION app.rls_afdwingen_zetten(text) TO mijnruimte_system; END IF;
    IF to_regclass('app.audit') IS NOT NULL THEN
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.audit FROM mijnruimte_system;
      IF to_regclass('app.audit_kop') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.audit_kop FROM mijnruimte_system; END IF;
      -- Wie audit mag verwijderen, bepaalt alleen postgres/de migrator (db-rollen-instellen.sh audit-beheerder).
      IF to_regclass('app.audit_beheerders') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.audit_beheerders FROM mijnruimte_system; END IF;
      GRANT EXECUTE ON FUNCTION app.audit_toevoegen(text, text, text, text, text, jsonb, text, text, text) TO mijnruimte_system;
      GRANT EXECUTE ON FUNCTION app.audit_verwijderen(text, text, timestamptz, text) TO mijnruimte_system;
    END IF;
  END IF;
END
$rechten$;

-- Audit-fix 10: hoogstens één eigenaar-account (role 'owner') — ook bij twee gelijktijdige eerste aanmeldingen.
-- Staat hier (niet in een genummerde migratie) zodat hij alsnog wordt aangemaakt zodra een dubbele (verouderde)
-- eigenaar is opgeschoond: de app degradeert die bij het opstarten en bij aanmelden; de volgende migratierun
-- (of db-rollen-instellen.sh instellen) maakt de index dan aan.
DO $een_eigenaar$
BEGIN
  IF to_regclass('app.records_een_eigenaar') IS NULL AND to_regclass('app.records') IS NOT NULL THEN
    IF (SELECT count(*) FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner') <= 1 THEN
      CREATE UNIQUE INDEX records_een_eigenaar ON app.records ((tbl)) WHERE tbl = 'users' AND data->>'role' = 'owner';
    ELSE
      RAISE WARNING 'meer dan één eigenaar-account: unieke index records_een_eigenaar nog niet aangemaakt (zie deploy/RUNBOOK-AUDIT-FIXES.md)';
    END IF;
  END IF;
END
$een_eigenaar$;
