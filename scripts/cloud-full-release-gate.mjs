/** Cloud Full Integration release acceptance gate. Never bypassed by a UI flag.
 * Must be called explicitly by an authorized release pipeline before the Cloud
 * feature flag can be enabled. The historical pipeline is NOT modified in M3.
 */
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const REQUIRED=[
 'oauth_google_drive_live','oauth_onedrive_personal_live','oauth_onedrive_business_live',
 'oauth_sharepoint_live','oauth_dropbox_live','oauth_nextcloud_live','oauth_box_live','credentials_s3_live',
 'provider_permissions_live','cloud_native_isolation_live',
 'cross_provider_copy_live_e2e','cross_provider_move_live_e2e',
 'transfer_crash_recovery_e2e','transfer_duplicate_prevention_e2e',
 'shares_invite_revoke_live','shares_lease_expiry_live','versions_history_live',
 'universal_viewer_live','account_switch_isolation_e2e','tech_space_isolation_e2e',
 'api_rate_limit_audit_e2e','desktop_mobile_browser_e2e',
 'production_build_node24','migration_rollback_test','provider_contract_tests',
 'oauth_multiaccount_live_e2e','oauth_account_selection_per_tab_e2e',
 'oauth_same_owner_private_technical_isolation_e2e','oauth_provider_revoke_live_e2e',
 'oauth_refresh_rotation_multiworker_e2e','oauth_scope_matrix_live_e2e',
 'cloud_cross_browser_sync_e2e','oauth_provider_token_key_rotation_e2e',
 'nextcloud_login_flow_v2_live','s3_iam_role_onboarding_live',
 'cloud_m4_workstation_connection_center_e2e',
 'm5_backblaze_b2_s3_auth_live','m5_pcloud_eu_and_us_oauth_live','m5_github_app_installation_live',
 'm5_all_first_wave_provider_list_read_write_live','m5_provider_permissions_truth_matrix_live',
 'm5_large_transfer_all_providers_live','m5_admin_governance_audit_live',
 'm5_provider_disconnect_cleanup_live','m5_provider_error_rate_limit_e2e',
 'm6_postgres_governance_audit_staging','m6_owner_technical_tab_access_e2e',
 'm6_signed_ci_attestations_verified','m6_oauth_callback_policy_recheck_e2e',
 'm6_operator_ui_multitab_e2e','m6_live_transfer_policy_enforcement_e2e',
 'm6_database_migration_rollback_staging','m6_provider_revocation_race_e2e',
 'm7_vault_crypto_independent_review','m7_client_code_integrity_supply_chain_review',
 'm7_webcrypto_browser_matrix_e2e','m7_passkey_prf_or_recovery_cross_device_live',
 'm7_root_key_recovery_and_rotation_live','m7_client_side_encryption_large_files_live',
 'm7_ciphertext_only_cross_provider_e2e','m7_no_provider_token_server_rest_exposure_audit',
 'm7_user_presence_delegation_review','m7_admin_insider_red_team_review',
 'm7_metadata_and_rollback_attack_review','m7_session_revoke_interrupts_copy_e2e',
 'm8_all_first_wave_folder_navigation_live','m8_directory_pagination_provider_contract_e2e',
 'm8_multiaccount_parallel_tabs_and_devices_e2e','m8_opaque_cursor_security_review',
 'm8_same_provider_cross_account_transfer_e2e','m8_native_format_export_and_import_e2e',
 'm8_connected_account_revocation_during_operation_e2e','m8_root_and_nested_folder_permissions_all_providers_live',
 'm9_nextcloud_dav_directory_live_e2e','m9_s3_listobjects_v2_iam_live_e2e',
 'm9_b2_s3_listing_live_e2e','m9_dav_xml_security_review',
 'm9_microsoft_graph_resumable_upload_live_e2e','m9_dropbox_resumable_upload_live_e2e',
 'm9_pg_checkpoint_migration_rollback_staging','m9_ambiguous_upload_reconciliation_live_e2e',
 'm9_uploaded_copy_readback_sha256_e2e','m9_factory_all_11_provider_scopes_live',
 'm9_complete_node24_build_and_browser_e2e'
];
const file=resolve(process.cwd(),process.argv[2]||'cloud-full-acceptance.json');
let report={};
try{if(existsSync(file))report=JSON.parse(readFileSync(file,'utf8'));}catch(e){console.error('CLOUD_GATE_INVALID_REPORT');process.exit(2);}
const missing=REQUIRED.filter(key=>report?.checks?.[key]?.status!=='passed'||
 typeof report.checks[key].evidence!=='string'||report.checks[key].evidence.length<8);
console.log(JSON.stringify({release:'Cloud Full Integration',decision:missing.length?'BLOCKED':'CANDIDATE_FOR_HUMAN_APPROVAL',
 checked:REQUIRED.length,unmet:missing.length,missing},null,2));
// This report is NOT a cryptographic attestation; CI must independently validate
// the evidence URLs and commit/branch SHA to prevent forged manual 'passed' values.
process.exit(missing.length?2:0);
