// Twee ruimtes (shared/ai-ruimte.ts, shared/meldingen-ruimte.ts): een AI in de privéruimte raakt nooit de site of de server,
// een AI in de technische ruimte nooit de inhoud of apparaten van de gebruiker; de bel van de ene ruimte toont niet de meldingen van de andere.
import { checker } from './hulp/nep-google';
import { apparaatInRuimte, RUIMTE_GESCHEIDEN, RUIMTE_INSTRUCTIES, ruimteOf, toolInRuimte, toolRuimte } from '../../shared/ai-ruimte';
import { meldingenVoorRuimte, meldingRuimte, meldingScope, ruimteVanLink } from '../../shared/meldingen-ruimte';
import { BEHEER_PAGINAS } from '../../shared/beheer-paginas';

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-ruimte');

  check('ruimteOf: alleen "technisch" is technisch; leeg, onbekend of vreemd → prive (minste rechten)',
    ruimteOf('technisch') === 'technisch' && ruimteOf('prive') === 'prive' && ruimteOf(undefined) === 'prive' && ruimteOf('TECHNISCH') === 'prive' && ruimteOf({}) === 'prive');

  const technisch = ['uitrol_voorstel_begin', 'uitrol_voorstel_status', 'get_live_release', 'list_releases', 'read_release_file', 'get_system_health', 'site_health', 'release_info', 'read_file', 'list_dir', 'host_status', 'rollout_upload_begin', 'server_status', 'server_backup'];
  const prive = ['mail_search_messages', 'drive_read_file', 'calendar_list_events', 'search_board', 'create_task', 'list_services', 'get_service', 'get_hub_overview', 'github_get', 'take_snapshot', 'click', 'browser_open', 'draft_email_reply', 'get_connector_stats'];
  const apparaat = ['machine_list', 'machine_read_file', 'machine_exec', 'docker_list_containers', 'docker_manage_container', 'system_metrics', 'app_deploy', 'app_secret_request', 'app_list'];
  check('toolRuimte: site- en servertools zijn technisch', technisch.every((n) => toolRuimte(n) === 'technisch'), technisch.filter((n) => toolRuimte(n) !== 'technisch').join(','));
  check('toolRuimte: inhoud, diensten en browser van de gebruiker zijn prive', prive.every((n) => toolRuimte(n) === 'prive'), prive.filter((n) => toolRuimte(n) !== 'prive').join(','));
  check('toolRuimte: apparaattools volgen het apparaat (ruimte "apparaat")', apparaat.every((n) => toolRuimte(n) === 'apparaat'), apparaat.filter((n) => toolRuimte(n) !== 'apparaat').join(','));
  check('toolRuimte: onbekende namen en lege invoer zijn prive (geen technische toegang bij vergissing)', toolRuimte('iets_nieuws') === 'prive' && toolRuimte('') === 'prive' && toolRuimte('uitrol_ooit') === 'technisch');

  check('toolInRuimte: privéverbinding — nooit een servertool; wel apparaattools en eigen inhoud',
    !toolInRuimte('get_live_release', 'prive') && !toolInRuimte('uitrol_voorstel_begin', 'prive') && toolInRuimte('machine_list', 'prive') && toolInRuimte('mail_search_messages', 'prive'));
  check('toolInRuimte: technische verbinding — nooit mail, Drive, bord of browser; wel servertools en apparaattools',
    !toolInRuimte('mail_search_messages', 'technisch') && !toolInRuimte('drive_read_file', 'technisch') && !toolInRuimte('take_snapshot', 'technisch') && !toolInRuimte('search_board', 'technisch')
    && toolInRuimte('get_live_release', 'technisch') && toolInRuimte('uitrol_voorstel_status', 'technisch') && toolInRuimte('machine_list', 'technisch') && toolInRuimte('app_deploy', 'technisch'));

  check('apparaatInRuimte: een apparaat hoort bij precies één ruimte; zonder kolom (oud) bij prive',
    apparaatInRuimte({ ruimte: 'technisch' }, 'technisch') && !apparaatInRuimte({ ruimte: 'technisch' }, 'prive') && apparaatInRuimte({}, 'prive') && !apparaatInRuimte({}, 'technisch') && apparaatInRuimte(null, 'prive'));

  const wp = RUIMTE_GESCHEIDEN('prive', 'get_live_release'), wt = RUIMTE_GESCHEIDEN('technisch', 'mail_search_messages');
  check('weigering: begint met SPACE_SEPARATED, noemt de ruimte en het hulpmiddel, verwijst naar de juiste pagina en zegt «niet anders proberen»',
    /^SPACE_SEPARATED: /.test(wp) && /private/.test(wp) && /get_live_release/.test(wp) && /Technical connections/.test(wp) && /Do not try another way/.test(wp)
    && /^SPACE_SEPARATED: /.test(wt) && /technical/.test(wt) && /mail_search_messages/.test(wt) && /Agents/.test(wt) && /Do not try another way/.test(wt));
  check('instructies per ruimte: privé zegt «never manage the site», technisch zegt «never reaches the user\'s mail» en «cannot approve»',
    /can never manage the site or the server/.test(RUIMTE_INSTRUCTIES.prive) && /never reaches the user's mail/.test(RUIMTE_INSTRUCTIES.technisch) && /cannot approve a release/.test(RUIMTE_INSTRUCTIES.technisch) && !/approve a release/.test(RUIMTE_INSTRUCTIES.prive));

  // ---- meldingen ----
  check('meldingRuimte: beheer-soorten zijn technisch (toegangsverzoek, Google-contour, app-geheim, kluissleutel, uitrol, server)',
    ['access_request', 'google_login_config', 'mcp_app_secret', 'vault_key_expiring', 'vault_key_expired', 'uitrol', 'uitrol.voorstel', 'tech_toegekend', 'server.herstart', 'siem_export'].every((k) => meldingRuimte(k) === 'technisch'));
  check('meldingRuimte: account-soorten zijn prive (beveiliging, inlogmethoden, herstel, delen, ondersteuning, onbekend)',
    ['security', 'security_warning', 'access_decision', 'access_method_added', 'access_recovery_used', 'access_totp_enabled', 'workspace_share', 'account_email_conflict', 'ondersteuning', 'iets_nieuws', ''].every((k) => meldingRuimte(k) === 'prive'));
  check('ruimteVanLink: admin.* en api.* en beheerpagina\'s van mcp.* zijn technisch; hub, mail, id en mcp/agents zeggen niets',
    ruimteVanLink('https://admin.tarasevych.com/access') === 'technisch' && ruimteVanLink('https://api.tarasevych.com/vault') === 'technisch'
    && BEHEER_PAGINAS.mcp.every((p) => ruimteVanLink(`https://mcp.tarasevych.com/${p}`) === 'technisch')
    && ruimteVanLink('https://mcp.tarasevych.com/agents#ai') === undefined && ruimteVanLink('https://hub.tarasevych.com/') === undefined && ruimteVanLink('https://id.tarasevych.com/methods?x=1') === undefined && ruimteVanLink('/mail') === undefined && ruimteVanLink('') === undefined && ruimteVanLink(42) === undefined);
  check('meldingRuimte: een onbekende soort met een beheerlink is technisch; een beheersoort met een accountlink blijft technisch (soort wint)',
    meldingRuimte('info', 'https://admin.tarasevych.com/updates') === 'technisch' && meldingRuimte('access_request', 'https://hub.tarasevych.com/') === 'technisch' && meldingRuimte('info', 'https://mail.tarasevych.com/inbox') === 'prive');
  const items = [
    { id: '1', kind: 'access_request', link: 'https://admin.tarasevych.com/access' }, { id: '2', kind: 'security_warning', link: 'https://id.tarasevych.com/methods' },
    { id: '3', kind: 'mcp_app_secret', link: 'https://mcp.tarasevych.com/apps' }, { id: '4', kind: 'workspace_share' }, { id: '5', kind: 'info', link: 'https://api.tarasevych.com/vault' },
  ];
  check('meldingenVoorRuimte: elke melding in precies één bel; samen weer de hele lijst',
    meldingenVoorRuimte(items, 'technisch').map((m) => m.id).join() === '1,3,5' && meldingenVoorRuimte(items, 'prive').map((m) => m.id).join() === '2,4' && meldingenVoorRuimte(null, 'prive').length === 0);
  check('meldingScope: eigen opslag per ruimte, de accountruimte houdt de oude sleutel (bestaande «gezien»-stand blijft)',
    meldingScope('u1', 'prive') === 'u1' && meldingScope('u1', 'technisch') === 'u1:technisch' && meldingScope('anon', 'technisch') !== meldingScope('anon', 'prive'));

  return einde();
}
