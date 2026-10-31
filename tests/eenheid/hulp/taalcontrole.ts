// Testhulp (geen test zelf): taalcontrole van hulpmiddelteksten — Oekraïens zonder Engelse woorden, Nederlands zonder Engelse
// signaalwoorden. Uit hulpmiddelen-tweetalig-20261020.test.ts gehaald (ORCH-001 етап 3) zodat ook tests zonder database
// (orch-site-20261031) dezelfde regel toepassen op nieuwe hulpmiddelen. Puur.

/**
 * Latijnse woorden die in een Oekraïense tekst mogen staan: merken, protocollen, bestands- en productnamen, toetsen en termen die
 * de site zelf zo schrijft. Alles wat hier niet staat en ≥ 4 Latijnse letters heeft, is Engels (of een vergeten vertaling).
 */
export const TOEGESTAAN = new Set([
  // merken en diensten
  'Google', 'Drive', 'Gmail', 'GitHub', 'Docker', 'Dockerfile', 'Caddy', 'Podman', 'Guacamole', 'Microsoft', 'Outlook', 'Mijn', 'Ruimte',
  'Windows', 'PowerShell', 'Node', 'Python', 'nginx', 'Chrome', 'Apple', 'iCloud', 'Photos', 'Mermaid', 'Stripe', 'Loki', 'Grafana', 'Prometheus', 'Canva', 'Figma', 'Encrypt', 'Actions', 'Projects', 'Markdown', 'Calendar', 'tarasevych', 'claude', 'Claude',
  // protocollen, formaten en afkortingen
  'MCP', 'IMAP', 'SMTP', 'OAuth', 'CPU', 'URL', 'JSON', 'CSV', 'PDF', 'SSH', 'README', 'API', 'HTML', 'ICS', 'CalDAV', 'OPA', 'SIEM', 'HTTPS', 'https',
  'DNS', 'JavaScript', 'LCP', 'CLS', 'BYOS', 'UTF-8', 'UTF', 'SHA', 'true', 'false', 'base64', 'utf8', 'etag', 'SHA-256', 'sha256', 'ISO', 'REST', 'PaaS', 'INBOX', 'JSONB',
  // toetsen (browser_press_key) en bestanden/variabelen die de uitleg bij naam noemt
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'UITROL-VERSIE', 'BRON-COMMIT', 'GEEN_BRON_COMMIT',
  'NODE_ENV', 'production', 'PORT', 'OPENAI_API_KEY', 'package', 'json', 'deploy', 'REGELS-UITROLPAKKET', 'nextPageToken', 'rollout_history', 'calendar-draft',
  // termen die de site zelf in het Oekraïens zo schrijft (toestemmingsvenster, extensie)
  'passkey', 'cookie', 'admin', 'pull', 'request', 'issue', 'issues', 'repo', 'time_zone', 'all_day', 'default_reminders', 'title', 'description', 'location',
  'start', 'attendees', 'email', 'name', 'optional', 'recurrence', 'frequency', 'none', 'daily', 'weekly', 'monthly', 'yearly', 'interval', 'count', 'until',
  'days', 'reminders', 'method', 'popup', 'minutes', 'YYYY-MM-DDTHH', 'YYYY-MM-DD', 'YYYYMMDD-HHMMSS', 'zonder-git', 'octocat', 'hello-world', 'example',
  'notes', 'notes-app', 'server', 'status', 'short', 'per_page', 'user', 'repos', 'OWNER', 'REPO', 'git', 'node', 'primary', 'root', 'main', 'requirements',
  'index', 'html', 'externalOnly', 'needsAction', 'accepted', 'tentative', 'declined', 'open_service', 'actions', 'alles', 'prestaties', 'beveiliging',
  // ORCH-001 (координація агентів): назви файлів, команд, кодів і агентів, які текст називає буквально; «commit» — термін git, як у AGENTS.md
  'AGENTS', 'orchestratie', 'ORCH-OVERDRACHT', 'controleer', 'inleveren', 'scripts', 'regelsVersie', 'regelsHash', 'basisCommit', 'kritiekHash',
  'integratie', 'aanvaard', 'geweigerd', 'zaken', 'lock', 'orch', 'beleid', 'taak-start', 'Task', 'patch', 'zip', 'YYYYMMDD', 'HHMMSS', 'feature', 'ABC-001',
  'commit', 'RUNBOOK', 'orch-regels', 'mijn-ruimte-besluit', 'origin', 'push', 'codex', 'gemini', 'grok', 'copilot', 'cursor', 'antigravity', 'chatgpt',
]);
/** Wat vóór de controle uit een tekst verdwijnt: technische namen met «_», adressen en paden, en alles tussen rechte aanhalingstekens. */
export const schoon = (s: string) => s
  .replace(/"[^"]*"/g, ' ')                                   // "voorbeelden" en "waarden"
  .replace(/\{[^}]*\}/g, ' ')                                 // {"NODE_ENV":"production"}, [{email,name}]
  .replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, ' ')            // machine_list, browser_snapshot, OPENAI_API_KEY
  .replace(/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s)]*)?/g, ' ') // tarasevych.com, notes.example.com, deploy/x.md, package.json
  .replace(/[A-Za-z0-9.]+\/[A-Za-z0-9./-]+/g, ' ');           // src/server.js, /user/repos
export const latijnseWoorden = (s: string) => (schoon(s).match(/[A-Za-z][A-Za-z0-9-]{3,}/g) ?? []).filter((w) => !TOEGESTAAN.has(w) && !TOEGESTAAN.has(w.replace(/-$/, '')));
/** Engels in een Nederlandse tekst: woorden die het Nederlands niet kent (het Nederlands heeft geen «the», «and», «with», …). */
export const ENGELS = /\b(the|and|with|when|from|only|default|optional|optionally|file|files|folder|device|user|which|returns?|must|without|this|that|these|whether|used|using|into|each|every|cannot|never|always|otherwise|also|same|see|after|before|first|cut|read-only|untrusted|approve|approval|pending|retry|list|page|number|characters|seconds|message|messages|secret|secrets|address|allowed|refuses|does|not|are|for|example|omitted|omit|leave|empty|show|shows|listed|search|version|versions|current|previous|size|text|value|values|write|writes|program|command|commands|wait|waits|stays|keep|kept|changes?|change|delete|deletes|deleted|remove|removes|create|creates|creating|whose|your|you|yours|they|them|their|there|here|where|while|than|then|many|much|more|less|other|another|any|some|all|both|either|neither|within|between|across|about|above|below|under|out|off|through|during|until|since|again|back|away|down|just|very|too|also)\b/i;
/** Alle taalfouten in één uk/nl-paar: Engels (Latijn) in het Oekraïens, Engelse signaalwoorden in het Nederlands. */
export function taalFouten(waar: string, uk: string, nl: string): string[] {
  const uit: string[] = [];
  const lat = latijnseWoorden(uk); if (lat.length) uit.push(`${waar} uk: Latijn «${lat.join(', ')}»`);
  const m = schoon(nl).match(ENGELS); if (m) uit.push(`${waar} nl: Engels «${m[0]}»`);
  return uit;
}
