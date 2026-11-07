// Connector-functies: Nederlandse namen, echte uitvoering op de gegevens van de gebruiker, poorten.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { MAX_NAAM, NAAM_RE } from '../../shared/connector-v2/namen';
import { AFKORT_SCHEMA, FUNCTIE_DEFINITIES, FUNCTIE_OPTIES, bouwNaam, catalogusFouten, functieNaam, ontleedFunctie } from '../../shared/connector-functies';
import { voerConnectorFunctieUit, type FunctieAanroep } from '../../backend/connector-functies';
import { closePool, getPool } from '../../server/platform/pg';

const tekstVan = (r: { content: Array<{ text: string }>; isError?: boolean } | null) => r?.content[0]?.text ?? '';

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-functies');
  const fouten = catalogusFouten();
  check('namen: elke functienaam voor elke agent is a-z0-9_, hoogstens 64, uniek, en botst niet met v2', !fouten.length, fouten.slice(0, 8).join(' | '));
  check('afkortschema is provider-weg', AFKORT_SCHEMA === 'provider-weg');
  const lang = bouwNaam('heel_lang_woord_extra', 'copilot', 'github', 'github', 'gebruiker');
  check('afkorting: te lange essentie laat de dienst weg en houdt agent, subdomein, tarasevych_com en _gebruiker',
    lang.afgekort && lang.naam.length <= MAX_NAAM && NAAM_RE.test(lang.naam)
    && lang.naam.includes('_copilot_') && lang.naam.includes('_github_') && lang.naam.includes('_tarasevych_com_') && lang.naam.endsWith('_gebruiker')
    && !lang.naam.includes('_github_github_'), lang.naam);
  const bots = bouwNaam('wie', 'grok', 'ai', 'figma', 'gebruiker', new Set([functieNaam(FUNCTIE_DEFINITIES.find((d) => d.bron === 'whoami')!, 'grok')]));
  check('afkorting bij botsing houdt de verplichte delen', bots.afgekort && bots.naam.includes('_grok_') && bots.naam.includes('_tarasevych_com_gebruiker') && NAAM_RE.test(bots.naam), bots.naam);
  check('elke agent heeft evenveel namen als definities', V2_AGENTEN.every((a) => new Set(FUNCTIE_DEFINITIES.map((d) => functieNaam(d, a.slug))).size === FUNCTIE_DEFINITIES.length));
  const blob = JSON.stringify(FUNCTIE_OPTIES);
  check('geen staat «in ontwikkeling» in de functiecatalogus', FUNCTIE_OPTIES.every((o) => o.status === 'actief') && !/in-ontwikkeling|in ontwikkeling|у розробці|in development/i.test(blob));
  check('catalogus dekt de bronfamilies', ['figma', 'weave', 'notion', 'github', 'wix', 'stripe', 'deploy', 'legacy'].every((f) => FUNCTIE_DEFINITIES.some((d) => d.familie === f)));
  const wie = FUNCTIE_DEFINITIES.find((d) => d.bron === 'whoami')!;
  const ander = ontleedFunctie(functieNaam(wie, 'grok'), 'gpt');
  check('ontleed: naam van een andere agent is ANDERE_AGENT', !ander.ok && ander.reden === 'ANDERE_AGENT' && ander.agent === 'grok');

  const db = `cf_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const uploads = mkdtempSync(join(tmpdir(), 'cf-uploads-'));
  execFileSync('createdb', [db]);
  process.env.DATABASE_URL = `postgres:///${db}?host=/var/run/postgresql`;
  process.env.UPLOADS_DIR = uploads;
  delete process.env.DATABASE_URL_SYSTEM;
  delete process.env.DATABASE_URL_APP;
  const pool = getPool('systeem');
  const userId = `cf-${randomUUID()}`;
  const maak = FUNCTIE_DEFINITIES.find((d) => d.bron === 'drive_create')!;
  const lees = FUNCTIE_DEFINITIES.find((d) => d.bron === 'get_metadata')!;
  const geheim = FUNCTIE_DEFINITIES.find((d) => d.bron === 'get_secret_scanning_alert')!;
  const beheer = FUNCTIE_DEFINITIES.find((d) => d.bron === 'approve_release')!;
  const post = FUNCTIE_DEFINITIES.find((d) => d.bron === 'mail_send')!;
  const ctx = (extra: Partial<FunctieAanroep>): FunctieAanroep => ({
    userId, agent: 'grok', ruimte: 'prive', kanten: ['gebruiker'], sleutels: [], ...extra,
  });

  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS app');
    await pool.query(`CREATE TABLE app.records (
      tbl text NOT NULL, id text NOT NULL DEFAULT gen_random_uuid()::text, data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tbl, id))`);
    await pool.query(`CREATE TABLE app.storage_objects (
      path text PRIMARY KEY, content_type text NOT NULL, size_bytes bigint NOT NULL, sha256 text NOT NULL,
      encoding text NOT NULL DEFAULT 'utf8', created_at timestamptz NOT NULL DEFAULT now(), owner_id text)`);
    await pool.query(`CREATE TABLE app.mcp_console_items (
      id uuid PRIMARY KEY, user_id text NOT NULL, kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '',
      status text, tags text[] NOT NULL DEFAULT '{}', author text NOT NULL DEFAULT 'connector',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE app.mail_drafts (
      id uuid PRIMARY KEY, user_id text NOT NULL, local_id text NOT NULL, subject text NOT NULL DEFAULT '',
      plain_text text NOT NULL DEFAULT '', html text NOT NULL DEFAULT '', sync_status text NOT NULL DEFAULT 'local',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)", [userId, JSON.stringify({ email: 'pavlo@test.invalid', role: 'member' })]);

    const zonder = await voerConnectorFunctieUit(ctx({}), functieNaam(maak, 'grok'), { name: 'hallo', text: 'hallo-bestand' });
    const padenNaWeigering = await pool.query('SELECT path FROM app.storage_objects');
    check('ontbrekend recht weigert vóór het schrijven (PERMISSION_OFF)', !!zonder?.isError && /PERMISSION_OFF/.test(tekstVan(zonder)) && padenNaWeigering.rowCount === 0, tekstVan(zonder));

    const geschreven = await voerConnectorFunctieUit(ctx({ sleutels: [maak.key] }), functieNaam(maak, 'grok'), { name: 'hallo', text: 'hallo-bestand' });
    const pad = JSON.parse(tekstVan(geschreven)).pad as string;
    const terug = await voerConnectorFunctieUit(ctx({ sleutels: [lees.key] }), functieNaam(lees, 'grok'), { path: pad });
    const inhoud = JSON.parse(tekstVan(terug)).content as string;
    check('bestand aanmaken blijft staan en een tweede aanroep leest het terug', !geschreven?.isError && inhoud === 'hallo-bestand', `${tekstVan(geschreven)} :: ${tekstVan(terug)}`);

    const geheimTekst = 'super-secret-value';
    const geheimAntwoord = await voerConnectorFunctieUit(ctx({ sleutels: [geheim.key] }), functieNaam(geheim, 'grok'), { secret: geheimTekst, value: geheimTekst, query: geheimTekst });
    const audit = await pool.query("SELECT data::text AS t FROM app.records WHERE tbl = 'connector_audit'");
    const alles = `${tekstVan(geheimAntwoord)}\n${audit.rows.map((r) => r.t).join('\n')}`;
    check('geheimhulpmiddel geeft de waarde niet terug en bewaart die niet', !!geheimAntwoord?.isError && /GEHEIM_OP_DE_SITE/.test(tekstVan(geheimAntwoord)) && !alles.includes(geheimTekst), tekstVan(geheimAntwoord));

    const wieAntwoord = await voerConnectorFunctieUit(ctx({ sleutels: [wie.key] }), functieNaam(wie, 'grok'), {});
    const wieJson = JSON.parse(tekstVan(wieAntwoord)) as Record<string, unknown>;
    check('whoami geeft id, e-mail en ruimte, zonder token', wieJson.userId === userId && wieJson.email === 'pavlo@test.invalid' && wieJson.room === 'prive'
      && !('token' in wieJson) && !/token|access_token|refresh/i.test(tekstVan(wieAntwoord)));

    const voor = await pool.query('SELECT count(*)::int AS n FROM app.mcp_console_items');
    const beheerAntwoord = await voerConnectorFunctieUit(ctx({ kanten: ['gebruiker', 'beheer'], sleutels: [beheer.key] }), functieNaam(beheer, 'grok'), { title: 'niet' });
    const na = await pool.query('SELECT count(*)::int AS n FROM app.mcp_console_items');
    check('beheer vanuit de privéruimte is SPACE_SEPARATED en schrijft niets', !!beheerAntwoord?.isError && /^"?SPACE_SEPARATED: .*private/.test(JSON.parse(tekstVan(beheerAntwoord)).fout) && na.rows[0].n === voor.rows[0].n, tekstVan(beheerAntwoord));

    const tech = await voerConnectorFunctieUit(ctx({ ruimte: 'technisch', kanten: ['beheer'], sleutels: [post.key] }), functieNaam(post, 'grok'), { subject: 'hallo' });
    check('privépost vanuit de technische ruimte is SPACE_SEPARATED', !!tech?.isError && /SPACE_SEPARATED: .*technical/.test(JSON.parse(tekstVan(tech)).fout), tekstVan(tech));
    check('uitkomst noemt geen ontwikkelstaat', !/in-ontwikkeling|in ontwikkeling|у розробці|in development/i.test(`${tekstVan(geschreven)}${tekstVan(wieAntwoord)}${tekstVan(geheimAntwoord)}`));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await closePool();
    execFileSync('dropdb', ['--if-exists', db]);
  }
  return einde();
}
