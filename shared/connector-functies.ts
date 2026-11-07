// Connector-functies — echte hulpmiddelen voor de catalogi die de site al kan uitvoeren op de gegevens van de
// ingelogde gebruiker (mail, bestanden, agenda, bord, GitHub, uitrol). Geen «in ontwikkeling»: elke rij is aanroepbaar.
//
// Naam (Nederlands, alleen a-z 0-9 _, hoogstens 64 tekens), per agent:
//   {essentie}_{agent}_{subdomein}_{dienst}_tarasevych_com_{gebruiker|beheer}
// De dienst blijft staan, ook als die gelijk is aan het subdomein. Zo botst de naam niet met connector v2, dat de dienst
// weglaat wanneer die gelijk is (GitHub).
//
// Afkortingsschema `provider-weg` (alleen als de volle naam langer is dan 64, of bij een botsing):
//   1. laat het dienst-segment weg; agent, subdomein, tarasevych_com en _gebruiker/_beheer blijven;
//   2. laat essentie-woorden van rechts vallen tot de naam past, minstens één woord;
//   3. bij een botsing: een stabiel cijferachtervoegsel, nog steeds met agent, subdomein, tarasevych_com en de kant.
// De catalogus is zo gekozen dat stap 1–3 voor deze rijen niet nodig zijn. bouwNaam dekt het schema wel, en de test roept het aan.
// Puur (geen React, geen Node, geen netwerk).
import { V2_AGENTEN, type AgentSlug } from './connector-v2/agenten';
import type { Dienst, GroepId, Kant, Risico, Soort, Subdomein, Tekst, V2Optie } from './connector-v2/catalogus';
import { DOMEIN_DEEL, MAX_NAAM, NAAM_RE, alleNamen } from './connector-v2/namen';

export const AFKORT_SCHEMA = 'provider-weg' as const;

export type Uitvoer =
  | 'bestand_lees' | 'bestand_schrijf' | 'bestand_lijst' | 'voorbeeld' | 'diagram' | 'zoek'
  | 'bord_schrijf' | 'bord_lees' | 'bord_wis' | 'bord_herstel'
  | 'identiteit' | 'mail_concept' | 'agenda_lees'
  | 'github_lees' | 'github_schrijf'
  | 'stripe_lees' | 'stripe_schrijf'
  | 'uitrol_lees' | 'uitrol_voorstel' | 'site_verzoek' | 'site_weigering'
  | 'geheim' | 'deel_verzoek' | 'audit_lees' | 'siem';

export interface FunctieDef {
  familie: string;
  bron: string;
  essentie: string;
  uitvoer: Uitvoer;
  soort: Soort;
  risico: Risico;
  gevoelig: boolean;
  sub: Subdomein;
  dienst: Dienst;
  kant: Kant;
  groep: GroepId;
  vermogen: string;
  id: string;
  key: string;
}

type Rij = [string, string, string, Uitvoer, Soort, Risico, boolean, Subdomein, Dienst, Kant, GroepId, string];

const RIJEN: readonly Rij[] = [
  ['figma','get_design_context','lezen_ontwerp','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_metadata','lezen_meta','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_screenshot','lezen_voorbeeld','voorbeeld','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','download_assets','ophalen_bestanden','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_variable_defs','lezen_variabele','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_motion_context','lezen_beweging','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_figjam','lezen_figjam','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','use_figma','gebruiken','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','generate_figma_design','maken_ontwerp','diagram','schrijven','laag',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','create_new_file','maken_bestand','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','upload_assets','plaatsen_bestanden','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','generate_diagram','maken_diagram','diagram','schrijven','laag',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','generate_image','maken_beeld','diagram','schrijven','laag',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','get_libraries','lezen_bibliotheken','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','search_design_system','zoeken_ontwerp','zoek','lezen','laag',false,'cloud','figma','gebruiker','media','site.read'],
  ['figma','get_code_connect_map','lezen_code','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','add_code_connect_map','toevoegen_code','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','get_code_connect_suggestions','lezen_code_2','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_context_for_code_connect','lezen_context_code','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','list_generative_plugins','tonen_generatief','bestand_lijst','lezen','laag',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_generative_plugin','lezen_generatief','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','create_generative_plugin','maken_generatief','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','update_generative_plugin','wijzigen_generatief','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','list_shaders','tonen_shaders','bestand_lijst','lezen','laag',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','get_shader','lezen_shader','bestand_lees','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','create_shader','maken_shader','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','update_shader','wijzigen_shader','bestand_schrijf','schrijven','midden',false,'cloud','figma','gebruiker','media','device.write'],
  ['figma','list_file_shaders','tonen_bestand','bestand_lijst','lezen','laag',false,'cloud','figma','gebruiker','media','drive.read'],
  ['figma','whoami','wie','identiteit','lezen','laag',false,'ai','figma','gebruiker','account','site.read'],
  ['weave','weave_list_tools','tonen_hulpmiddelen','bestand_lijst','lezen','laag',false,'cloud','weave','gebruiker','media','drive.read'],
  ['weave','weave_get_tool_inputs','lezen_hulpmiddel','bestand_lees','lezen','midden',false,'cloud','weave','gebruiker','media','drive.read'],
  ['weave','weave_upload_asset','plaatsen_bestand','bestand_schrijf','schrijven','midden',false,'cloud','weave','gebruiker','media','device.write'],
  ['weave','weave_run_tool','uitvoeren','bestand_schrijf','schrijven','midden',false,'cloud','weave','gebruiker','media','device.write'],
  ['weave','weave_get_tool_run_output','lezen_hulpmiddel_2','bestand_lees','lezen','midden',false,'cloud','weave','gebruiker','media','drive.read'],
  ['weave','weave_cancel_tool_run','annuleren','bestand_schrijf','schrijven','midden',false,'cloud','weave','gebruiker','media','device.write'],
  ['weave','create_design_system_rules','maken_ontwerp','diagram','schrijven','laag',false,'cloud','weave','gebruiker','media','device.write'],
  ['notion','notion-ai-search','zoeken_ai','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-convert-page-to-skill','omzetten_pagina','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-attachment','maken_bijlage','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-comment','maken_reactie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-database','maken_database','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-file-upload','maken_bestand','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-folder','maken_map','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-pages','maken_paginas','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-create-view','maken_weergave','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-delete-comment','wissen_reactie','bord_wis','wissen','hoog',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-delete-databases','wissen_databases','bord_wis','wissen','hoog',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-delete-pages','wissen_paginas','bord_wis','wissen','hoog',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-download-attachment','ophalen_bijlage','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-download-skill','ophalen_vaardigheid','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-duplicate-page','kopie_pagina','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-fetch','lezen','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-async-task','lezen_taak','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-comments','lezen_reacties','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-enabled-skills','lezen_aan','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-file-download-urls','lezen_bestand','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-groups','lezen_groepen','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-self','lezen_zelf','identiteit','lezen','laag',false,'ai','notion','gebruiker','account','site.read'],
  ['notion','notion-get-session-status','lezen_sessie_status','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-teams','lezen_teams','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-tool-access','lezen_hulpmiddel','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-get-users','lezen_gebruikers','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-list-favorite-pages','tonen_favoriet','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-list-page-backlinks','tonen_pagina','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-list-private-pages','tonen_privaat','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-list-recent-pages','tonen_recent_paginas','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-list-session-events','tonen_sessie','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-list-shared-pages','tonen_gedeeld','bord_lees','lezen','laag',false,'hub','notion','gebruiker','bord','board.read'],
  ['notion','notion-memory-search','zoeken_geheugen','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-move-pages','verplaatsen_paginas','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-query-data-sources','bevragen_gegevens','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-query-meeting-notes','bevragen_overleg','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-query-multiple-data-sources','bevragen_gegevens_2','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-query-sessions','bevragen_sessies','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-read-session-event','lezen_sessie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-restore-pages','herstellen_paginas','bord_herstel','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-search','zoeken','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-search-agents','zoeken_agenten','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-search-sessions','zoeken_sessies','zoek','lezen','laag',false,'hub','notion','gebruiker','bord','site.read'],
  ['notion','notion-send-message-to-session','opstellen_bericht','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-set-comment-reaction','zetten_reactie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-set-discussion-resolved','zetten_discussie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-spawn-session','starten_sessie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-stop-session','stoppen_sessie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-update-comment','wijzigen_reactie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-update-data-source','wijzigen_gegevens','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-update-enabled-skills','wijzigen_aan','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-update-folder','wijzigen_map','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-update-page','wijzigen_pagina','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-update-view','wijzigen_weergave','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-upload-skill','plaatsen_vaardigheid','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['notion','notion-wait-session','wachten_sessie','bord_schrijf','schrijven','midden',false,'hub','notion','gebruiker','bord','board.write'],
  ['github','actions_get','lezen_acties','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','actions_list','tonen_acties','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','actions_run_trigger','uitvoeren_acties','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_job_logs','lezen_taak','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_code_quality_finding','lezen_code','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_code_scanning_alert','lezen_code_scan','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_code_scanning_alerts','tonen_code_scan','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_me','lezen_mij','identiteit','lezen','laag',false,'ai','github','gebruiker','account','site.read'],
  ['github','get_team_members','lezen_team_leden','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_teams','lezen_teams','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','ui_get','lezen','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','assign_copilot_to_issue','toewijzen_copilot','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','request_copilot_review','vragen_copilot','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','assign_copilot_to_issue_with_intent','toewijzen_copil_2','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_dependabot_alert','lezen_dependabot','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_dependabot_alerts','tonen_dependabot','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','discussion_comment_write','schrijven','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_discussion','lezen_discussie','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_discussion_comments','lezen_discussie_2','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_discussion_categories','tonen_discussie','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_discussions','tonen_discussies','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','create_gist','maken_gist','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_gist','lezen_gist','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_gists','tonen_gists','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','update_gist','wijzigen_gist','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_repository_tree','lezen_repo_boom','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','create_repository_ruleset','maken_repo','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','custom_properties_read','lezen_eigen','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','custom_properties_write','schrijven_eigen','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','repository_ruleset_read','lezen_repo','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','add_issue_comment','toevoegen_issue','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_label','lezen_label','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','issue_read','lezen_issue','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','issue_write','schrijven_issue','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','list_issue_fields','tonen_issue','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_issue_types','tonen_issue_typen','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_issues','tonen_issues','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','search_issues','zoeken_issues','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','sub_issue_write','schrijven_sub','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','update_issue_comment','wijzigen_issue','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','label_write','schrijven_label','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','list_label','tonen_label','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','dismiss_notification','wegleggen_melding','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_notification_details','lezen_melding','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_notifications','tonen_meldingen','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','manage_notification_subscription','beheren_melding','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','manage_repository_notification_subscription','beheren_repo','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','mark_all_notifications_read','merken_meldingen','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','search_orgs','zoeken_orgs','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','projects_get','lezen_projecten','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','projects_list','tonen_projecten','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','projects_write','schrijven_2','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','add_comment_to_pending_review','toevoegen_reactie','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','add_reply_to_pull_request_comment','toevoegen','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','create_pull_request','maken_pr','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','list_pull_requests','tonen_pr','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','merge_pull_request','samenvoegen_pr','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','pull_request_read','vragen_pr','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','pull_request_review_write','vragen_pr_2','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','search_pull_requests','zoeken_pr','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','update_pull_request','wijzigen_pr','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','update_pull_request_branch','wijzigen_pr_tak','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','create_branch','maken_tak','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','create_or_update_file','maken_bestand','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','create_repository','maken_repo_2','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','delete_file','wissen_bestand','github_schrijf','wissen','hoog',false,'github','github','gebruiker','github','github.write'],
  ['github','delete_repository','wissen_repo','github_schrijf','wissen','hoog',false,'github','github','gebruiker','github','github.write'],
  ['github','fork_repository','afsplitsen_repo','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_commit','lezen_commit','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_file_contents','lezen_bestand','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_latest_release','lezen_laatste','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_release_by_tag','lezen_release_tag','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_tag','lezen_tag','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_branches','tonen_takken','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_commits','tonen_commits','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_releases','tonen_releases','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_repository_collaborators','tonen_repo','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_tags','tonen_tags','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','push_files','plaatsen','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','search_code','zoeken_code','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','search_commits','zoeken_commits','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','search_repositories','zoeken_repos','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','get_secret_scanning_alert','lezen_geheim_scan','geheim','lezen','hoog',true,'github','github','gebruiker','github','apps.secrets'],
  ['github','list_secret_scanning_alerts','tonen_geheim_scan','geheim','lezen','hoog',true,'github','github','gebruiker','github','apps.secrets'],
  ['github','get_global_security_advisory','lezen_globaal','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_global_security_advisories','tonen_globaal','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_org_repository_security_advisories','tonen_org_repo','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_repository_security_advisories','tonen_repo_2','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_starred_repositories','tonen_gesterd','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','star_repository','ster_repo','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','unstar_repository','ontster_repo','github_schrijf','wissen','hoog',false,'github','github','gebruiker','github','github.write'],
  ['github','search_users','zoeken_gebruikers','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','create_pull_request_with_copilot','maken_pr_copilot','github_schrijf','schrijven','midden',false,'github','github','gebruiker','github','github.write'],
  ['github','get_copilot_space','lezen_copilot','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','list_copilot_spaces','tonen_copilot','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['github','github_support_docs_search','zoeken_hulp','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['wix','WixREADME','tonen_leesmij','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','SearchWixWDSDocumentation','zoeken_wds','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','SearchWixRESTDocumentation','zoeken_rest','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','SearchWixSDKDocumentation','zoeken_sdk','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','SearchBuildAppsDocumentation','zoeken_bouw_apps','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','SearchWixHeadlessDocumentation','zoeken_headless','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','WixBusinessFlowsDocumentation','tonen_bedrijf_stromen','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','BrowseWixRESTDocsMenu','bladeren_rest_menu','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','ReadFullDocsArticle','lezen_artikel','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','ReadFullDocsMethodSchema','lezen_methode_schema','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','SearchWixAPISpec','zoeken_specificatie','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','ListWixSites','tonen_sites','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','GetSiteContext','lezen_site_context','zoek','lezen','laag',false,'hub','wix','gebruiker','ruimte','site.read'],
  ['wix','CallWixSiteAPI','aanroepen_site','bord_schrijf','schrijven','midden',false,'hub','wix','gebruiker','ruimte','board.write'],
  ['wix','ExecuteWixAPI','uitvoeren','bord_schrijf','schrijven','midden',false,'hub','wix','gebruiker','ruimte','board.write'],
  ['wix','ManageWixSite','beheren_site','bord_schrijf','schrijven','midden',false,'hub','wix','gebruiker','ruimte','board.write'],
  ['stripe','stripe_api_search','zoeken','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','stripe_api_details','tonen_details','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','stripe_api_read','lezen','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','stripe_api_write','schrijven','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','get_stripe_account_info','lezen_rekening_info','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','atlas_company_formation','tonen_atlas_bedrijf','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','stripe_analytics','tonen_cijfers','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','get_balance_summary','lezen_saldo','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','convert_currency','omzetten_munt','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','send_money','opstellen_geld','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','setup_recipient','instellen_ontvanger','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','transfer_money','overboeken_geld','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','search_stripe_documentation','zoeken_2','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','stripe_implementation_planner','tonen_plan_planner','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','send_stripe_feedback','opstellen','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','cancel_subscription','annuleren_abonnement','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_coupon','maken_coupon','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_customer','maken_klant','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_invoice','maken_factuur','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_invoice_item','maken_factuur_post','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_payment_link','maken_betaling_link','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_price','maken_prijs','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_product','maken_product','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','create_refund','maken_terugbetaling','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','finalize_invoice','afronden_factuur','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','list_coupons','tonen_coupons','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_customers','tonen_klanten','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_disputes','tonen_geschillen','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_invoices','tonen_facturen','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_payment_intents','tonen_betaling','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_prices','tonen_prijzen','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_products','tonen_producten','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','list_subscriptions','tonen_abonnementen','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','retrieve_balance','lezen_saldo_2','stripe_lees','lezen','laag',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['stripe','update_dispute','wijzigen_geschil','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['stripe','update_subscription','wijzigen_abonnement','stripe_schrijf','schrijven','midden',true,'hub','stripe','gebruiker','betalingen','board.write'],
  ['deploy','deploy_app','tonen_uitrol_app','uitrol_voorstel','schrijven','midden',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','apply_app_version','toepassen_app','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','upload_assets','plaatsen_bestanden','uitrol_voorstel','schrijven','midden',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','get_app_status','lezen_app_status','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','get_app_versions','lezen_app_versies','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','get_apps','lezen_apps','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','get_deploy_instructions','lezen_uitrol','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','get_app_template','lezen_app_sjabloon','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','get_appdeploy_sdk_reference','lezen_sdk','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','get_custom_domain_instructions','lezen_eigen_domein','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','src_glob','tonen_glob','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','src_grep','tonen_grep','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','src_read','lezen','uitrol_lees','lezen','laag',false,'admin','deploy','beheer','releases','deploy.status'],
  ['deploy','configure_custom_domain','instellen_eigen','site_verzoek','schrijven','midden',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','delete_app','wissen_app','site_verzoek','wissen','hoog',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','create_secret_entry','maken_geheim','geheim','schrijven','hoog',true,'admin','deploy','beheer','apps','apps.secrets'],
  ['deploy','get_secret_entry_status','lezen_geheim','geheim','lezen','hoog',true,'admin','deploy','beheer','apps','apps.secrets'],
  ['deploy','list_app_secrets','tonen_app_geheimen','geheim','lezen','hoog',true,'admin','deploy','beheer','apps','apps.secrets'],
  ['deploy','delete_app_secrets','wissen_app_2','geheim','wissen','hoog',true,'admin','deploy','beheer','apps','apps.secrets'],
  ['deploy','set_app_secrets','zetten_app','geheim','schrijven','hoog',true,'admin','deploy','beheer','apps','apps.secrets'],
  ['deploy','appdeploy_who_am_i','wie','identiteit','lezen','laag',false,'ai','deploy','beheer','account','site.read'],
  ['deploy','approve_release','goedkeuren_release','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','rollback_release','terugdraaien','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','create_backup','maken_kopie','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','releases','deploy.release'],
  ['deploy','set_ai_policy','zetten_ai_beleid','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','server','policy.change'],
  ['legacy','mail_send','opstellen_post','mail_concept','schrijven','hoog',true,'mail','gmail','gebruiker','mail','mail.modify'],
  ['legacy','icloud_events','tonen_icloud','agenda_lees','lezen','midden',false,'hub','icloud','gebruiker','agenda','calendar.read'],
  ['legacy','drive_create','maken_schijf','bestand_schrijf','schrijven','midden',false,'cloud','gdrive','gebruiker','bestanden','device.write'],
  ['legacy','drive_upload','plaatsen_schijf','bestand_schrijf','schrijven','midden',false,'cloud','gdrive','gebruiker','bestanden','device.write'],
  ['legacy','drive_share','delen_schijf','deel_verzoek','schrijven','hoog',false,'cloud','gdrive','gebruiker','bestanden','board.write'],
  ['legacy','photos_pick','kiezen_fotos','bestand_lijst','lezen','hoog',true,'cloud','gphotos','gebruiker','bestanden','drive.read'],
  ['legacy','github_pr','tonen_pr_2','github_schrijf','schrijven','hoog',false,'github','github','gebruiker','github','github.write'],
  ['legacy','github_ci_logs','tonen_ci_logboek','github_lees','lezen','laag',false,'github','github','gebruiker','github','github.read'],
  ['legacy','image_generate','maken_beeld_2','diagram','schrijven','laag',false,'cloud','figma','gebruiker','media','device.write'],
  ['legacy','diagram_generate','maken_diagram_2','diagram','schrijven','laag',false,'cloud','figma','gebruiker','media','device.write'],
  ['legacy','screenshot_design','tonen_voorbeeld','voorbeeld','lezen','midden',false,'cloud','figma','gebruiker','media','drive.read'],
  ['legacy','payments_list','tonen_betaallijst','stripe_lees','lezen','hoog',true,'hub','stripe','gebruiker','betalingen','site.read'],
  ['legacy','app_domain','tonen_app_domein','site_verzoek','schrijven','kritiek',false,'admin','deploy','beheer','apps','deploy.release'],
  ['legacy','audit_read','lezen_audit','audit_lees','lezen','midden',false,'admin','deploy','beheer','server','server.read'],
  ['legacy','users_manage','beheren_gebruikers','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','server','policy.change'],
  ['legacy','flags_manage','beheren_vlaggen','site_weigering','schrijven','kritiek',false,'admin','deploy','beheer','server','policy.change'],
  ['legacy','siem_status','tonen_siem_status','siem','lezen','laag',false,'admin','deploy','beheer','server','server.read'],
];

const FAM_UK: Record<string, string> = {
  figma: 'Figma', weave: 'Weave', notion: 'Notion', github: 'GitHub', wix: 'Wix', stripe: 'Stripe', deploy: 'Випуск', legacy: 'Мій простір',
};
const FAM_NL: Record<string, string> = {
  figma: 'Figma', weave: 'Weave', notion: 'Notion', github: 'GitHub', wix: 'Wix', stripe: 'Stripe', deploy: 'Uitrol', legacy: 'Mijn Ruimte',
};

type Zin = { wat: string; gevolg: string; let?: string };

function zin(d: FunctieDef, uk: boolean): Zin {
  const bron = d.bron;
  const waar = uk
    ? 'Це діє лише на ваші власні дані в Мій простір. Зовнішній сервіс не викликається.'
    : 'Dit raakt alleen uw eigen gegevens in Mijn Ruimte. De externe dienst wordt niet aangeroepen.';
  const tabel: Record<Uitvoer, Zin> = {
    bestand_lees: {
      wat: uk ? `Джерело «${bron}». Читає файл у вашому Диску.` : `Bron «${bron}». Leest een bestand in uw Drive.`,
      gevolg: uk ? 'ШІ бачить вміст файлу, який ви вказали, і шлях, який можна відкрити.' : 'De AI ziet de inhoud van het bestand dat u noemt, en het pad dat u kunt openen.',
    },
    bestand_schrijf: {
      wat: uk ? `Джерело «${bron}». Створює або оновлює файл у вашому Диску.` : `Bron «${bron}». Maakt of werkt een bestand in uw Drive bij.`,
      gevolg: uk ? 'У вашому хмарному сховищі з’являється файл. Нічого не надсилається назовні.' : 'In uw cloudopslag staat daarna een bestand. Er gaat niets naar buiten.',
    },
    bestand_lijst: {
      wat: uk ? `Джерело «${bron}». Показує список ваших файлів.` : `Bron «${bron}». Toont de lijst van uw bestanden.`,
      gevolg: uk ? 'Ви бачите шляхи своїх файлів. Вміст не змінюється.' : 'U ziet de paden van uw bestanden. De inhoud verandert niet.',
    },
    voorbeeld: {
      wat: uk ? `Джерело «${bron}». Повертає перегляд (SVG або текст) файлу, який уже є у вашому Диску.` : `Bron «${bron}». Geeft een voorbeeld (SVG of tekst) van een bestand dat al in uw Drive staat.`,
      gevolg: uk ? 'Новий файл не створюється: це читання.' : 'Er komt geen nieuw bestand bij: dit is lezen.',
    },
    diagram: {
      wat: uk ? `Джерело «${bron}». Зберігає справжню SVG-схему у ваш Диск. Окремого генератора зображень у продукті немає.` : `Bron «${bron}». Bewaart een echt SVG-diagram in uw Drive. Dit product heeft geen aparte beeldgenerator.`,
      gevolg: uk ? 'У вашому Диску з’являється файл .svg, який можна відкрити.' : 'In uw Drive staat daarna een .svg-bestand dat u kunt openen.',
    },
    zoek: {
      wat: uk ? `Джерело «${bron}». Шукає у ваших чернетках пошти, файлах, дошці й нотатках і повертає ідентифікатори.` : `Bron «${bron}». Zoekt in uw mailconcepten, bestanden, bord en notities en geeft identificaties terug.`,
      gevolg: uk ? 'Ви можете відкрити кожен збіг за id або шляхом. Нічого не змінюється.' : 'U kunt elke treffer openen via id of pad. Er verandert niets.',
    },
    bord_schrijf: {
      wat: uk ? `Джерело «${bron}». Створює або оновлює картку чи нотатку на вашій дошці.` : `Bron «${bron}». Maakt of werkt een kaart of notitie op uw bord bij.`,
      gevolg: uk ? 'Запис лишається у вашому обліковому записі, з id, який можна відкрити.' : 'De rij blijft in uw account, met een id dat u kunt openen.',
    },
    bord_lees: {
      wat: uk ? `Джерело «${bron}». Читає ваші картки й нотатки (без кошика).` : `Bron «${bron}». Leest uw kaarten en notities (zonder de prullenbak).`,
      gevolg: uk ? 'ШІ бачить заголовки, текст і id. Нічого не видаляється.' : 'De AI ziet titels, tekst en id. Er wordt niets verwijderd.',
    },
    bord_wis: {
      wat: uk ? `Джерело «${bron}». Ховає картку в кошик (мітка prullenbak). Якщо кошика в таблиці не було, це м’яке видалення.` : `Bron «${bron}». Legt een kaart in de prullenbak (label prullenbak). De tabel had geen prullenbak: dit is zacht verwijderen.`,
      gevolg: uk ? 'Картка зникає зі списку й лишається відновлюваною.' : 'De kaart verdwijnt uit de lijst en blijft terug te zetten.',
    },
    bord_herstel: {
      wat: uk ? `Джерело «${bron}». Повертає картку з кошика.` : `Bron «${bron}». Zet een kaart terug uit de prullenbak.`,
      gevolg: uk ? 'Картка знову видима у вашому списку.' : 'De kaart is weer zichtbaar in uw lijst.',
    },
    identiteit: {
      wat: uk ? `Джерело «${bron}». Повертає ваш id, адресу, простір і надані дозволи. Жодного токена.` : `Bron «${bron}». Geeft uw id, adres, ruimte en verleende rechten. Geen token.`,
      gevolg: uk ? 'ШІ знає, від чийого імені працює, і не бачить секретів входу.' : 'De AI weet namens wie zij werkt en ziet geen aanmeldgeheim.',
    },
    mail_concept: {
      wat: uk ? `Джерело «${bron}». Дія в оригіналі — надіслати лист. Тут зберігається чернетка у вашій пошті, без відправлення.` : `Bron «${bron}». De bronactie is verzenden. Hier wordt een concept in uw post bewaard, zonder verzending.`,
      gevolg: uk ? 'Чернетка з’являється у вашому ящику. Лист нікуди не йде.' : 'Het concept staat in uw postbus. De brief gaat nergens heen.',
      let: uk ? 'Надсилання пошти цим інструментом не виконується.' : 'Verzenden gebeurt met dit hulpmiddel niet.',
    },
    agenda_lees: {
      wat: uk ? `Джерело «${bron}». Читає ваші нотатки календаря на дошці. Окремої таблиці календаря немає.` : `Bron «${bron}». Leest uw agendanotities op het bord. Er is geen aparte agendatabel.`,
      gevolg: uk ? 'Ви бачите події, які самі зберегли як нотатки.' : 'U ziet afspraken die u zelf als notitie bewaarde.',
    },
    github_lees: {
      wat: uk ? `Джерело «${bron}». Читає GitHub через уже наявне підключення в цьому продукті. Якщо токена немає, шукає на вашій дошці й чесно каже, що GitHub не підключено.` : `Bron «${bron}». Leest GitHub via de verbinding die dit product al heeft. Zonder token zoekt het op uw bord en zegt het eerlijk dat GitHub niet verbonden is.`,
      gevolg: uk ? 'Токен не повертається. Збіги мають id або адресу, які можна відкрити.' : 'Het token komt niet terug. Treffers hebben een id of adres dat u kunt openen.',
    },
    github_schrijf: {
      wat: uk ? `Джерело «${bron}». Пише в GitHub лише через наявні виклики (задача або коментар). Якщо клієнта немає, зберігає задачу на вашій дошці й каже про це.` : `Bron «${bron}». Schrijft in GitHub alleen via de aanroepen die er al zijn (issue of commentaar). Zonder client bewaart het een taak op uw bord en zegt dat.`,
      gevolg: uk ? 'Або з’являється задача в GitHub, або картка на вашій дошці. Видалення й злиття на GitHub не викликаються.' : 'Of er komt een issue in GitHub, of een kaart op uw bord. Verwijderen en mergen op GitHub worden niet aangeroepen.',
    },
    stripe_lees: {
      wat: uk ? `Джерело «${bron}». Клієнта Stripe у продукті немає: читає ваші нотатки рахунків на дошці.` : `Bron «${bron}». Er is geen Stripe-client: leest uw factuurachtige notities op het bord.`,
      gevolg: uk ? 'Ви бачите власні записи, не платіжний кабінет Stripe.' : 'U ziet uw eigen notities, niet het betaalpaneel van Stripe.',
      let: uk ? 'Гроші не списуються і не повертаються.' : 'Er wordt geen geld afgeschreven of teruggestort.',
    },
    stripe_schrijf: {
      wat: uk ? `Джерело «${bron}». Клієнта Stripe немає: записує нотатку рахунку на вашу дошку.` : `Bron «${bron}». Geen Stripe-client: schrijft een factuurachtige notitie op uw bord.`,
      gevolg: uk ? 'З’являється ваша нотатка з id. Платіж у Stripe не створюється.' : 'Er komt een notitie van u met een id. Er ontstaat geen betaling bij Stripe.',
      let: uk ? 'Це запис у вашому просторі, не операція Stripe.' : 'Dit is een notitie in uw ruimte, geen Stripe-handeling.',
    },
    uitrol_lees: {
      wat: uk ? `Джерело «${bron}». Читає стан випусків, які вже готує цей сайт, або ваш власний файл. Код сервера й секрети не читаються.` : `Bron «${bron}». Leest de staat van uitgaven die deze site al voorbereidt, of uw eigen bestand. Servercode en geheimen worden niet gelezen.`,
      gevolg: uk ? 'Ви бачите статус або свій файл. Живий сайт не змінюється.' : 'U ziet de status of uw bestand. De live site verandert niet.',
    },
    uitrol_voorstel: {
      wat: uk ? `Джерело «${bron}». Готує пропозицію пакета наявним потоком випуску або записує її у ваші записи. Встановлення не відбувається.` : `Bron «${bron}». Bereidt een pakketvoorstel voor via de bestaande uitrolstroom, of bewaart het in uw records. Er wordt niets geïnstalleerd.`,
      gevolg: uk ? 'Пропозиція збережена. Схвалення лишається на сайті для власника.' : 'Het voorstel is bewaard. Goedkeuren blijft op de site voor de eigenaar.',
    },
    site_verzoek: {
      wat: uk ? `Джерело «${bron}». Записує технічний запит у ваші записи. Домен, DNS і живий додаток не змінюються.` : `Bron «${bron}». Bewaart een technisch verzoek in uw records. Domein, DNS en de live app veranderen niet.`,
      gevolg: uk ? 'Є рядок аудиту з id. Дія на сервері не виконана.' : 'Er is een auditrij met een id. De serverhandeling is niet uitgevoerd.',
    },
    site_weigering: {
      wat: uk ? `Джерело «${bron}». Схвалення випуску, відкат, резервна копія, політика ШІ й керування користувачами лишаються на сайті для власника.` : `Bron «${bron}». Een release goedkeuren, terugdraaien, een back-up, het AI-beleid en gebruikersbeheer blijven op de site voor de eigenaar.`,
      gevolg: uk ? 'Інструмент записує статус і не виконує дію. Це не успіх.' : 'Het hulpmiddel noteert de status en voert de actie niet uit. Dit is geen succes.',
      let: uk ? 'Власник робить це на вебсайті, не через інструмент.' : 'De eigenaar doet dit op de website, niet via het hulpmiddel.',
    },
    geheim: {
      wat: uk ? `Джерело «${bron}». Значення секретів не повертаються. Інструмент записує лише статус: секрети змінює власник на сайті.` : `Bron «${bron}». Geheimwaarden komen niet terug. Het hulpmiddel noteert alleen de status: geheimen wijzigt de eigenaar op de site.`,
      gevolg: uk ? 'У відповіді немає значення. Є лише відмітка, що секрет оброблено на сайті.' : 'Het antwoord bevat de waarde niet. Alleen de vastlegging dat het geheim op de site hoort.',
      let: uk ? 'Не надсилайте секрет у аргументах: його не буде ні збережено, ні показано.' : 'Stuur geen geheim mee: het wordt niet bewaard en niet getoond.',
    },
    deel_verzoek: {
      wat: uk ? `Джерело «${bron}». Спільний доступ назовні не відкривається: на дошці з’являється ваш запит поділитися.` : `Bron «${bron}». Delen naar buiten gaat niet open: op het bord komt uw verzoek om te delen.`,
      gevolg: uk ? 'Картка з id лишається у вас. Файл не стає публічним.' : 'De kaart met id blijft bij u. Het bestand wordt niet openbaar.',
    },
    audit_lees: {
      wat: uk ? `Джерело «${bron}». Читає ваші рядки аудиту інструментів (без значень секретів).` : `Bron «${bron}». Leest uw auditrijen van hulpmiddelen (zonder geheimwaarden).`,
      gevolg: uk ? 'Ви бачите, що було записано від вашого імені.' : 'U ziet wat er namens u is vastgelegd.',
    },
    siem: {
      wat: uk ? `Джерело «${bron}». Читає наявний стан SIEM цього сайту, без вмісту журналу.` : `Bron «${bron}». Leest de bestaande SIEM-stand van deze site, zonder journaalinhoud.`,
      gevolg: uk ? 'Лише стан (увімкнено чи ні). Секрети експорту не повертаються.' : 'Alleen de stand (aan of uit). Exportgeheimen komen niet terug.',
    },
  };
  const z = tabel[d.uitvoer];
  return { wat: `${z.wat} ${waar}`, gevolg: z.gevolg, let: z.let };
}

function teksten(d: FunctieDef): { uk: Tekst; nl: Tekst; weergave: string } {
  const u = zin(d, true);
  const n = zin(d, false);
  const uk: Tekst = u.let ? [`${FAM_UK[d.familie] ?? d.familie} · ${d.bron}`, u.wat, u.gevolg, u.let] : [`${FAM_UK[d.familie] ?? d.familie} · ${d.bron}`, u.wat, u.gevolg];
  const nl: Tekst = n.let ? [`${FAM_NL[d.familie] ?? d.familie} · ${d.bron}`, n.wat, n.gevolg, n.let] : [`${FAM_NL[d.familie] ?? d.familie} · ${d.bron}`, n.wat, n.gevolg];
  return { uk, nl, weergave: d.essentie.replace(/_/g, ' ') };
}

export const FUNCTIE_DEFINITIES: readonly FunctieDef[] = Object.freeze(RIJEN.map((r) => {
  const [familie, bron, essentie, uitvoer, soort, risico, gevoelig, sub, dienst, kant, groep, vermogen] = r;
  const id = `cf.${familie}_${bron.replace(/-/g, '_')}`;
  return Object.freeze({ familie, bron, essentie, uitvoer, soort, risico, gevoelig, sub, dienst, kant, groep, vermogen, id, key: `${id}:${kant}` });
}));

const DEF_PER_SLEUTEL = new Map(FUNCTIE_DEFINITIES.map((d) => [d.key, d]));

export function functieDef(key: string): FunctieDef | undefined {
  return DEF_PER_SLEUTEL.get(key);
}

/**
 * Bouwt de Nederlandse hulpmiddelnaam. `afgekort` is true als schema provider-weg is toegepast.
 * `bezet` is optioneel (tests): een naam die al bestaat krijgt een cijferachtervoegsel.
 */
export function bouwNaam(
  essentie: string,
  agent: AgentSlug,
  sub: string,
  dienst: string | null,
  kant: Kant,
  bezet?: ReadonlySet<string>,
): { naam: string; afgekort: boolean } {
  const vol = [essentie, agent, sub, ...(dienst ? [dienst] : []), DOMEIN_DEEL, kant].join('_');
  const vrij = (n: string) => !bezet?.has(n);
  if (vol.length <= MAX_NAAM && NAAM_RE.test(vol) && vrij(vol)) return { naam: vol, afgekort: false };

  let afgekort = vol.length > MAX_NAAM || !NAAM_RE.test(vol);
  let woorden = essentie.split('_').filter(Boolean);
  if (!woorden.length) woorden = ['deel'];
  const staartVol = [agent, sub, ...(dienst && !afgekort ? [dienst] : []), DOMEIN_DEEL, kant];
  const staartKort = [agent, sub, DOMEIN_DEEL, kant];
  const staart = afgekort ? staartKort : staartVol;
  const maak = (w: string[]) => [...w, ...staart].join('_');
  let naam = afgekort ? maak(woorden) : vol;
  if (afgekort) {
    while (naam.length > MAX_NAAM && woorden.length > 1) {
      woorden = woorden.slice(0, -1);
      naam = maak(woorden);
    }
    if (naam.length > MAX_NAAM) {
      const budget = MAX_NAAM - (staart.join('_').length + 1);
      woorden = [(woorden[0] || 'deel').slice(0, Math.max(1, budget))];
      naam = maak(woorden);
    }
  }
  if (!vrij(naam)) {
    afgekort = true;
    const kern = (afgekort ? woorden : essentie.split('_').filter(Boolean)).slice();
    const staartBots = [agent, sub, DOMEIN_DEEL, kant];
    const maakB = (w: string[]) => [...w, ...staartBots].join('_');
    let n = 2;
    let kand = naam;
    while (bezet?.has(kand) && n < 80) {
      let probe = [...kern, String(n)];
      while (maakB(probe).length > MAX_NAAM && probe.length > 1 && probe[0].length > 1) probe[0] = probe[0].slice(0, -1);
      kand = maakB(probe);
      n += 1;
    }
    naam = kand;
  }
  return { naam, afgekort };
}

export function functieNaam(d: Pick<FunctieDef, 'essentie' | 'sub' | 'dienst' | 'kant'>, agent: AgentSlug): string {
  return bouwNaam(d.essentie, agent, d.sub, d.dienst, d.kant).naam;
}

function naarOptie(d: FunctieDef): V2Optie {
  const t = teksten(d);
  return {
    key: d.key,
    id: d.id,
    intern: null,
    essentie: d.essentie,
    weergave: t.weergave,
    sub: d.sub,
    dienst: d.dienst,
    kant: d.kant,
    soort: d.soort,
    groep: d.groep,
    risico: d.risico,
    gevoelig: d.gevoelig,
    status: 'actief',
    uk: t.uk,
    nl: t.nl,
  };
}

export const FUNCTIE_OPTIES: readonly V2Optie[] = Object.freeze(FUNCTIE_DEFINITIES.map(naarOptie));
const OPTIE_PER_SLEUTEL = new Map(FUNCTIE_OPTIES.map((o) => [o.key, o]));
export const functieOptie = (key: string): V2Optie | undefined => OPTIE_PER_SLEUTEL.get(key);

const INDEX = new Map<AgentSlug, Map<string, FunctieDef>>();
function index(agent: AgentSlug): Map<string, FunctieDef> {
  let m = INDEX.get(agent);
  if (!m) {
    m = new Map();
    for (const d of FUNCTIE_DEFINITIES) m.set(functieNaam(d, agent), d);
    INDEX.set(agent, m);
  }
  return m;
}

export type OntleedFunctie =
  | { ok: true; def: FunctieDef; optie: V2Optie }
  | { ok: false; reden: 'ONBEKEND' | 'ANDERE_AGENT' | 'ANDERE_SITE'; agent?: AgentSlug; kant?: Kant };

export function ontleedFunctie(naam: string, agent: AgentSlug): OntleedFunctie {
  const n = String(naam || '');
  const eigen = index(agent).get(n);
  if (eigen) return { ok: true, def: eigen, optie: OPTIE_PER_SLEUTEL.get(eigen.key) as V2Optie };
  const kant: Kant | undefined = n.endsWith(`_${DOMEIN_DEEL}_gebruiker`) ? 'gebruiker' : n.endsWith(`_${DOMEIN_DEEL}_beheer`) ? 'beheer' : undefined;
  if (!kant) return { ok: false, reden: n.includes('_tarasevych_') || /_[a-z]+_com_(gebruiker|beheer)$/.test(n) ? 'ANDERE_SITE' : 'ONBEKEND' };
  for (const a of V2_AGENTEN) {
    if (a.slug !== agent && index(a.slug).has(n)) return { ok: false, reden: 'ANDERE_AGENT', agent: a.slug, kant };
  }
  return { ok: false, reden: 'ONBEKEND', kant };
}

const VERBODEN_STAAT = /in-ontwikkeling|in ontwikkeling|у розробці|in development/i;

/** Lege lijst = de catalogus klopt. De test eist dat. */
export function catalogusFouten(): string[] {
  const fouten: string[] = [];
  const namen = new Set<string>();
  const bezet = new Set<string>();
  for (const a of V2_AGENTEN) for (const n of alleNamen(a.slug)) bezet.add(n.naam);
  const keys = new Set<string>();
  for (const d of FUNCTIE_DEFINITIES) {
    if (keys.has(d.key)) fouten.push(`dubbele sleutel ${d.key}`);
    keys.add(d.key);
    if (d.essentie.split('_').filter(Boolean).length > 5 || !/^[a-z0-9_]+$/.test(d.essentie)) fouten.push(`essentie ${d.essentie}`);
    const opt = functieOptie(d.key);
    if (!opt || opt.status !== 'actief') fouten.push(`staat ${d.key}`);
    if (opt && VERBODEN_STAAT.test(JSON.stringify(opt))) fouten.push(`verboden tekst ${d.key}`);
    for (const a of V2_AGENTEN) {
      const b = bouwNaam(d.essentie, a.slug, d.sub, d.dienst, d.kant);
      if (b.afgekort) fouten.push(`onverwacht afgekort ${d.bron} ${b.naam}`);
      if (!NAAM_RE.test(b.naam) || b.naam.length > MAX_NAAM) fouten.push(b.naam);
      if (!b.naam.includes(`_${a.slug}_`) || !b.naam.includes(`_${d.sub}_`) || !b.naam.includes(`_${DOMEIN_DEEL}_`) || !b.naam.endsWith(`_${d.kant}`)) fouten.push(`delen ${b.naam}`);
      if (namen.has(b.naam)) fouten.push(`dubbel ${b.naam}`);
      if (bezet.has(b.naam)) fouten.push(`botst ${b.naam}`);
      namen.add(b.naam);
    }
  }
  return fouten;
}

export const FUNCTIE_INVOER = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    text: { type: 'string' },
    path: { type: 'string' },
    id: { type: 'string' },
    repo: { type: 'string' },
    name: { type: 'string' },
    subject: { type: 'string' },
  },
  additionalProperties: true,
} as const;
