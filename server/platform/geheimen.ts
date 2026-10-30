// Compatibiliteitslaag voor de vroegere AppDeploy `secrets`-API.
// Secrets komen uitsluitend uit omgevingsvariabelen (systemd EnvironmentFile
// /etc/mijn-ruimte/geheimen.env). Alleen namen op de allow-list zijn leesbaar, zodat
// bijv. DATABASE_URL nooit via deze API naar app-code of de UI lekt.
// Ontbrekende of lege secret = functie uitgeschakeld (bijv. Microsoft Graph), geen crash.
export const SECRET_ALLOW_LIST = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_SUITE_CLIENT_ID',
  'GOOGLE_SUITE_CLIENT_SECRET',
  'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1',
  'OWNER_VAULT_ENCRYPTION_KEY_V1',
  'MAIL_TOKEN_ENCRYPTION_KEY_V1',
  'MICROSOFT_GRAPH_CLIENT_ID',
  'MICROSOFT_GRAPH_CLIENT_SECRET',
  'MICROSOFT_GRAPH_TENANT_ID',
  'MICROSOFT_GRAPH_WEBHOOK_URL',
  'MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE',
  'GOOGLE_GMAIL_PUBSUB_TOPIC',
  'GOOGLE_GMAIL_PUBSUB_AUDIENCE',
  'GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL',
  'SCIM_BEARER_TOKEN',
] as const;

const allowed = new Set<string>(SECRET_ALLOW_LIST);
const valueOf = (name: string) => (allowed.has(name) ? String(process.env[name] ?? '').trim() : '');

export const secrets = {
  /** Lees een secret. Gooit een fout als de naam niet toegestaan of niet gezet is (zoals AppDeploy). */
  async readSecret(name: string): Promise<string> {
    if (!allowed.has(name)) throw new Error(`SECRET_NIET_TOEGESTAAN:${name}`);
    const value = valueOf(name);
    if (!value) throw new Error(`SECRET_ONTBREEKT:${name}`);
    return value;
  },
  /** Namen van de geconfigureerde (niet-lege) secrets op de allow-list. */
  async listSecretNames(): Promise<string[]> {
    return SECRET_ALLOW_LIST.filter((name) => valueOf(name) !== '');
  },
};
