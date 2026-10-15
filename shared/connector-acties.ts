// Aanvullende connector-acties (complementair t.o.v. shared/connector-functies.ts van een zuster-PR): intern-namen
// die nog geen echt hulpmiddel waren. Die zuster-catalogus gebruikt intern: null (Figma/Notion/Wix/Stripe/Deploy en
// legacy-bronnen als lokale Drive/bord-vervangers, mail als concept zonder verzenden). Hier: echte Gmail-send,
// Drive/Calendar-write via Google, commentaar op het bord, zoeken inclusief bord, GitHub-bestand via de bestaande client.
// Puur (geen Node/DOM). Nederlandse namen: a-z0-9_, ≤64, essentie_agent_sub[_dienst]_tarasevych_com_kant.

export const ACTIE_INTERN = [
  'mail_send',
  'drive_create',
  'drive_upload',
  'calendar_create_event',
  'calendar_update_event',
  'comment_board_item',
  'github_read_file',
  'zoeken_mail_bord_schijf',
] as const;
export type ActieIntern = (typeof ACTIE_INTERN)[number];

/** Bestaande echte intern-namen: geen tweede catalogusregel, geen tweede SITE_TOOL. */
export const ACTIE_AL_ECHT = [
  'v2_whoami',
  'uitrol_voorstel_status',
  'create_task',
  'update_task_status',
  'update_board_item',
  'delete_board_item',
  'manage_hub_notes',
  'mcp_board_add',
  'search_board',
  'site_search',
  'github_list_issues',
  'github_get',
] as const;

export const ACTIE_NAAM_RE = /^[a-z0-9_]{1,64}$/;
export const ACTIE_MAX_NAAM = 64;
export const ACTIE_DOMEIN = 'tarasevych_com';
export const ACTIE_AGENTEN = ['claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor'] as const;
/** Langste slug in de catalogus: copilot (7). Elke nieuwe essentie moet hierbinnen blijven. */
export const ACTIE_LANGSTE_AGENT = 'copilot';

export function actiePubliekeNaam(
  essentie: string,
  agent: string,
  sub: string,
  kant: 'gebruiker' | 'beheer',
  dienst?: string | null,
): string {
  const dienstDeel = dienst && dienst !== sub ? dienst : null;
  return [essentie, agent, sub, ...(dienstDeel ? [dienstDeel] : []), ACTIE_DOMEIN, kant].join('_');
}

/** essentie → sub → optionele dienst (valt weg als gelijk aan sub). */
export const ACTIE_NAAM_DEEL: Readonly<Record<ActieIntern, { essentie: string; sub: string; dienst?: string }>> = {
  // essenties bewust anders dan cursor/connector-integraties-8d4d (versturen_bericht, uploaden_bestand).
  mail_send: { essentie: 'verzenden_brief', sub: 'mail', dienst: 'gmail' },
  drive_create: { essentie: 'creeren_bestand', sub: 'cloud', dienst: 'gdrive' },
  drive_upload: { essentie: 'opladen_bestand', sub: 'cloud', dienst: 'gdrive' },
  calendar_create_event: { essentie: 'zetten_afspraak', sub: 'hub', dienst: 'gcal' },
  calendar_update_event: { essentie: 'wijzigen_afspraak', sub: 'hub', dienst: 'gcal' },
  comment_board_item: { essentie: 'reageren_op_taak', sub: 'hub' },
  github_read_file: { essentie: 'lezen_repo_bestand', sub: 'github', dienst: 'github' },
  zoeken_mail_bord_schijf: { essentie: 'zoeken_mail_bord_schijf', sub: 'hub' },
};

export function actieNamenVoor(intern: ActieIntern, agent: string, kant: 'gebruiker' | 'beheer' = 'gebruiker'): string {
  const d = ACTIE_NAAM_DEEL[intern];
  return actiePubliekeNaam(d.essentie, agent, d.sub, kant, d.dienst);
}

export function actieNamenBinnenGrens(intern: ActieIntern): boolean {
  return ACTIE_AGENTEN.every((a) => {
    const n = actieNamenVoor(intern, a);
    return ACTIE_NAAM_RE.test(n) && n.length <= ACTIE_MAX_NAAM;
  });
}

/** Velden die een uitrolstatus-antwoord NOOIT mag teruggeven (geen geheimen, geen passkey, geen rollback). */
export const UITROL_STATUS_VERBODEN = ['sha256', 'voorbereiderId', 'passkey', 'secret', 'token', 'rollback'] as const;
