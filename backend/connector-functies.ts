// Uitvoering van shared/connector-functies.ts. Elke rij leest of schrijft gegevens van de ingelogde gebruiker,
// of een technische handeling die de site al kent. Geen HTTP naar Figma, Notion, Wix, Stripe of Weave.
// Geen «in ontwikkeling». Geheime waarden komen nooit terug. Goedkeuren, terugdraaien, back-up en beleid blijven op de site.
import { createHash, randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { storage, resolveStoragePath } from '../server/platform/storage';
import { auditToevoegen } from '../server/platform/audit';
import { RUIMTE_GESCHEIDEN, type AiRuimte } from '../shared/ai-ruimte';
import type { AgentSlug } from '../shared/connector-v2/agenten';
import type { Kant } from '../shared/connector-v2/catalogus';
import { ontleedFunctie, type FunctieDef, type Uitvoer } from '../shared/connector-functies';
import { beslissing, weigerTekst } from './ai-beleid';
import { ghActions, ghComment, ghCommits, ghCreateIssue, ghIssues, ghReadme, ghRepos, ghSearch, validRepo } from './github-platform';
import { siemStand } from './siem';
import { voorstelBegin, voorstelStatus } from './uitrol-goedkeuring';

export type FunctieAanroep = {
  userId: string;
  agent: AgentSlug;
  ruimte: AiRuimte;
  kanten: readonly Kant[];
  sleutels: readonly string[];
  clientName?: string;
};

type Inhoud = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const sys = () => getPool('systeem');
const tekst = (data: unknown, isError = false): Inhoud => ({ content: [{ type: 'text', text: JSON.stringify(data) }], ...(isError ? { isError: true } : {}) });
const fout = (bericht: string): Inhoud => tekst({ fout: bericht }, true);

const GEVAAR_SLEUTEL = /secret|token|password|wachtwoord|api[_-]?key|authorization|bearer|private[_-]?key|credential/i;
const GEVAAR_WAARDE = /ghp_|github_pat_|sk_live_|sk_test_|xox[baprs]-/;

function s(v: unknown, max: number): string {
  const t = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
  return t.replace(/\u0000/g, '').slice(0, max);
}

function hashVan(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 18);
}
const prefixVan = (userId: string) => `cloud/${hashVan(userId)}`;

function padVanGebruiker(userId: string, ruw: unknown): string | null {
  const p = s(ruw, 512);
  if (!p.startsWith(`${prefixVan(userId)}/`)) return null;
  if (/(\.env|\.pem|\.key|id_rsa|id_ed25519|\.token|\.secret|credentials)/i.test(p)) return null;
  try { resolveStoragePath(p); return p; } catch { return null; }
}

function nieuwPad(userId: string, naam: string, ext: string): string {
  const kern = naam.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 48);
  const stuk = (kern || 'bestand').replace(/^\.+/, 'f');
  return `${prefixVan(userId)}/connector/${stuk}${ext}`;
}

function xml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function auditRij(userId: string, bron: string, status: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  const data = { ownerUserId: userId, bron, status, ...extra, at: new Date().toISOString() };
  try {
    await auditToevoegen({ ownerId: userId, actorId: userId, action: 'owner.mcp.tool', result: status === 'geweigerd' ? 'denied' : 'success', details: { bron, status, ...extra } });
  } catch { /* de functie app.audit_toevoegen hoeft er in een test niet te zijn */ }
  await sys().query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', ['connector_audit', id, JSON.stringify(data)]);
  return id;
}

async function kaart(userId: string, kind: 'task' | 'note', title: string, body: string, tags: string[], status: string | null = kind === 'task' ? 'backlog' : null): Promise<string> {
  const id = randomUUID();
  const tagsOk = tags.filter((t) => /^[A-Za-z0-9:_-]{1,32}$/.test(t)).slice(0, 8);
  await sys().query(
    `INSERT INTO app.mcp_console_items (id, user_id, kind, title, body, status, tags, author)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'connector')`,
    [id, userId, kind, title.slice(0, 160) || 'connector', body.slice(0, 4000), status, tagsOk],
  );
  return id;
}

async function kaarten(userId: string, q: string, ookPrullenbak = false, tag?: string): Promise<Array<{ id: string; kind: string; title: string; body: string }>> {
  const like = `%${q.replace(/[%_\\]/g, '')}%`;
  const { rows } = await sys().query(
    `SELECT id::text, kind, title, left(body, 400) AS body FROM app.mcp_console_items
     WHERE user_id = $1
       AND ($2::bool OR NOT ('prullenbak' = ANY(tags)))
       AND ($3::text = '' OR $3 = ANY(tags))
       AND ($4::text = '%%' OR title ILIKE $4 OR body ILIKE $4)
     ORDER BY updated_at DESC LIMIT 30`,
    [userId, ookPrullenbak, tag ?? '', like],
  );
  return rows;
}

async function zoekAlles(userId: string, q: string) {
  const query = s(q, 120);
  const kaartenHits = (await kaarten(userId, query)).map((r) => ({ soort: 'bord', id: r.id, titel: r.title }));
  let post: Array<{ soort: string; id: string; titel: string }> = [];
  try {
    const like = `%${query.replace(/[%_\\]/g, '')}%`;
    const { rows } = await sys().query(
      `SELECT id::text, subject FROM app.mail_drafts WHERE user_id = $1 AND ($2 = '%%' OR subject ILIKE $2 OR plain_text ILIKE $2) ORDER BY updated_at DESC LIMIT 20`,
      [userId, like],
    );
    post = rows.map((r) => ({ soort: 'post', id: r.id as string, titel: r.subject as string }));
  } catch { post = []; }
  const lijst = await storage.list({ prefix: prefixVan(userId), limit: 50 }).catch(() => ({ paths: [] as string[] }));
  const naald = query.toLowerCase();
  const bestanden = lijst.paths.filter((p) => !naald || p.toLowerCase().includes(naald)).slice(0, 20).map((p) => ({ soort: 'bestand', id: p, titel: p }));
  return { query, treffers: [...kaartenHits, ...post, ...bestanden] };
}

async function githubOfBord(userId: string, def: FunctieDef, args: Record<string, unknown>, schrijven: boolean) {
  const repo = validRepo(args.repo);
  const titel = s(args.title ?? args.name ?? def.bron, 160);
  const body = s(args.body ?? args.text ?? args.query ?? '', 4000);
  const issue = Number(args.issue ?? args.number);
  try {
    if (schrijven && repo && /comment/.test(def.bron) && Number.isInteger(issue)) {
      const r = await ghComment(userId, repo, issue, body || titel);
      if (r.ok) return { via: 'github', url: r.data.url, repo };
    }
    if (schrijven && repo && /issue|create/.test(def.bron) && !/comment|gist|discussion/.test(def.bron)) {
      const r = await ghCreateIssue(userId, repo, titel.length >= 3 ? titel : `taak ${def.bron}`, body);
      if (r.ok) return { via: 'github', number: r.data.number, url: r.data.url, repo };
    }
    if (!schrijven && repo && /commit/.test(def.bron)) {
      const r = await ghCommits(userId, repo);
      if (r.ok) return { via: 'github', commits: r.data.commits };
    }
    if (!schrijven && repo && /issue|pull/.test(def.bron)) {
      const r = await ghIssues(userId, repo, { kind: /pull/.test(def.bron) ? 'pr' : 'issue' });
      if (r.ok) return { via: 'github', items: r.data.items };
    }
    if (!schrijven && repo && /action|workflow|job|ci/.test(def.bron)) {
      const r = await ghActions(userId, repo);
      if (r.ok) return { via: 'github', runs: r.data.runs, summary: r.data.summary };
    }
    if (!schrijven && repo && /readme|file|content|dir/.test(def.bron)) {
      const r = await ghReadme(userId, repo);
      if (r.ok) return { via: 'github', name: r.data.name, text: r.data.text, url: r.data.url };
    }
    if (!schrijven && /search/.test(def.bron) && s(args.query ?? args.q, 200).length >= 2) {
      const r = await ghSearch(userId, { q: s(args.query ?? args.q, 200), type: s(args.type, 20) || 'repositories' });
      if (r.ok) return { via: 'github', type: r.data.type, total: r.data.total, items: r.data.items };
    }
    if (!schrijven && /repo|list/.test(def.bron)) {
      const r = await ghRepos(userId, { query: s(args.query, 80) });
      if (r.ok) return { via: 'github', repos: r.data.repos };
    }
  } catch { /* kluis of tabel ontbreekt: de bord-variant hieronder is het echte resultaat */ }
  if (!schrijven) {
    const treffers = await kaarten(userId, s(args.query ?? args.title ?? def.bron, 80));
    return { via: 'bord', github: 'niet-verbonden', uitleg: 'GitHub is niet verbonden. Dit zijn treffers op uw bord.', treffers };
  }
  const id = await kaart(userId, 'task', titel || def.bron, `${def.bron}\n${body}`.slice(0, 4000), ['github', 'connector']);
  return { via: 'bord', github: 'niet-verbonden', uitleg: 'GitHub is niet bereikbaar met de bestaande verbinding. De taak staat op uw bord.', id };
}

async function uitvoeren(ctx: FunctieAanroep, def: FunctieDef, args: Record<string, unknown>): Promise<Inhoud> {
  const { userId } = ctx;
  const q = s(args.query ?? args.q ?? args.text ?? '', 200);
  const titel = s(args.title ?? args.name ?? args.subject ?? def.bron, 160);
  const body = s(args.body ?? args.text ?? args.content ?? args.query ?? '', 4000);
  switch (def.uitvoer as Uitvoer) {
    case 'identiteit': {
      const { rows } = await sys().query("SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
      return tekst({ userId, email: rows[0]?.email ?? null, room: ctx.ruimte, scopes: ctx.sleutels, agent: ctx.agent });
    }
    case 'bestand_schrijf':
    case 'diagram': {
      const ext = def.uitvoer === 'diagram' ? '.svg' : '';
      const pad = padVanGebruiker(userId, args.path) ?? nieuwPad(userId, s(args.name ?? args.title ?? def.bron, 40), ext);
      const inhoud = def.uitvoer === 'diagram'
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="88"><rect width="360" height="88" fill="#f4f7fb"/><text x="16" y="36" font-family="sans-serif" font-size="16">${xml(def.bron)}</text><text x="16" y="62" font-family="sans-serif" font-size="13">${xml(body || q || 'diagram')}</text></svg>`
        : (body || q || def.bron);
      const type = def.uitvoer === 'diagram' ? 'image/svg+xml' : 'text/plain';
      const [ok] = await storage.write([{ path: pad, content: inhoud, contentType: type, ownerId: userId }]);
      if (!ok) return fout('BESTAND_NIET_GESCHREVEN');
      return tekst({ pad, id: pad, bytes: Buffer.byteLength(inhoud), contentType: type });
    }
    case 'bestand_lees':
    case 'voorbeeld': {
      const pad = padVanGebruiker(userId, args.path);
      if (!pad) return tekst({ pad: null, content: null, treffers: (await storage.list({ prefix: prefixVan(userId), limit: 20 }).catch(() => ({ paths: [] as string[] }))).paths });
      const [rij] = await storage.read([pad], { eigenaar: userId });
      return tekst({ pad, id: pad, content: rij?.content ?? null });
    }
    case 'bestand_lijst': {
      const lijst = await storage.list({ prefix: prefixVan(userId), limit: 50 });
      return tekst({ paden: lijst.paths, id: prefixVan(userId) });
    }
    case 'zoek':
      return tekst(await zoekAlles(userId, q));
    case 'agenda_lees':
      return tekst({ treffers: await kaarten(userId, q, false, 'agenda') });
    case 'bord_lees':
      return tekst({ treffers: await kaarten(userId, q) });
    case 'bord_schrijf':
    case 'stripe_schrijf':
    case 'deel_verzoek': {
      const tag = def.uitvoer === 'stripe_schrijf' ? 'stripe' : def.uitvoer === 'deel_verzoek' ? 'deel' : 'connector';
      const id = s(args.id, 80);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) {
        const { rowCount } = await sys().query(
          `UPDATE app.mcp_console_items SET title = $3, body = $4, updated_at = now() WHERE id = $1 AND user_id = $2 AND NOT ('prullenbak' = ANY(tags))`,
          [id, userId, titel, `${def.bron}\n${body}`.slice(0, 4000)],
        );
        if (rowCount) return tekst({ id, bijgewerkt: true });
      }
      const nieuw = await kaart(userId, 'note', titel, `${def.bron}\n${body}`, [tag, 'connector']);
      return tekst({ id: nieuw, titel });
    }
    case 'stripe_lees':
      return tekst({ treffers: await kaarten(userId, q, false, 'stripe'), uitleg: 'Geen Stripe-client: dit zijn uw eigen notities.' });
    case 'bord_wis': {
      const id = s(args.id, 80);
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        const { rowCount } = await sys().query(
          `UPDATE app.mcp_console_items SET tags = CASE WHEN 'prullenbak' = ANY(tags) THEN tags ELSE array_append(tags, 'prullenbak') END, updated_at = now()
           WHERE id = $1 AND user_id = $2`,
          [id, userId],
        );
        if (rowCount) return tekst({ id, prullenbak: true });
      }
      const nieuw = await kaart(userId, 'note', titel, `${def.bron}\n${body}`, ['prullenbak', 'connector']);
      return tekst({ id: nieuw, prullenbak: true });
    }
    case 'bord_herstel': {
      const id = s(args.id, 80);
      const { rowCount } = await sys().query(
        `UPDATE app.mcp_console_items SET tags = array_remove(tags, 'prullenbak'), updated_at = now() WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return tekst({ id, hersteld: !!rowCount });
    }
    case 'mail_concept': {
      const id = randomUUID();
      const local = `cf-${id}`;
      await sys().query(
        `INSERT INTO app.mail_drafts (id, user_id, local_id, subject, plain_text, html, sync_status)
         VALUES ($1, $2, $3, $4, $5, '', 'local')`,
        [id, userId, local, titel, body || def.bron],
      );
      return tekst({ id, localId: local, subject: titel, verzonden: false, uitleg: 'Concept bewaard. Niet verzonden.' });
    }
    case 'github_lees':
      return tekst({ bron: def.bron, ...(await githubOfBord(userId, def, args, false)) });
    case 'github_schrijf':
      return tekst({ bron: def.bron, ...(await githubOfBord(userId, def, args, true)) });
    case 'uitrol_lees': {
      const pad = padVanGebruiker(userId, args.path);
      if (pad) {
        const [rij] = await storage.read([pad], { eigenaar: userId });
        return tekst({ pad, content: rij?.content ?? null });
      }
      try {
        const stand = await voorstelStatus([{ soort: 'account', id: userId, accountId: userId }], {});
        return tekst({ via: 'uitrol', stand });
      } catch {
        const { rows } = await sys().query("SELECT id, data FROM app.records WHERE tbl = 'connector_uitrol' AND data->>'ownerUserId' = $1 ORDER BY created_at DESC LIMIT 20", [userId]);
        return tekst({ via: 'records', voorstellen: rows.map((r) => ({ id: r.id, ...(r.data as object) })) });
      }
    }
    case 'uitrol_voorstel': {
      let voorstel: unknown = null;
      const version = s(args.version, 20);
      const sha256 = s(args.sha256, 64);
      const bytes = Number(args.bytes);
      if (/^[0-9]{8}-[0-9]{6}$/.test(version) && /^[a-f0-9]{64}$/.test(sha256) && Number.isFinite(bytes)) {
        try { voorstel = await voorstelBegin([{ soort: 'account', id: userId, accountId: userId }], { version, bytes, sha256, changelog: s(args.changelog, 500) }); } catch { voorstel = null; }
      }
      const id = randomUUID();
      await sys().query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', ['connector_uitrol', id, JSON.stringify({ ownerUserId: userId, bron: def.bron, version: version || null, voorstel, geinstalleerd: false })]);
      return tekst({ id, geinstalleerd: false, voorstel, uitleg: 'Voorstel bewaard. Goedkeuren gebeurt op de site door de eigenaar.' });
    }
    case 'site_verzoek': {
      const id = await auditRij(userId, def.bron, 'verzoek', { titel });
      return tekst({ id, uitgevoerd: false, uitleg: 'Verzoek vastgelegd. Domein, DNS en de live app zijn niet gewijzigd.' });
    }
    case 'site_weigering': {
      const id = await auditRij(userId, def.bron, 'alleen-op-de-site', {});
      return tekst({ id, code: 'ALLEEN_OP_DE_SITE', uitgevoerd: false, bron: def.bron }, true);
    }
    case 'geheim': {
      const id = await auditRij(userId, def.bron, 'geheim-op-de-site', {});
      return tekst({ id, code: 'GEHEIM_OP_DE_SITE', waarde: null, bron: def.bron, uitleg: 'Geheimwaarden worden op de website door de eigenaar behandeld en komen niet terug.' }, true);
    }
    case 'audit_lees': {
      const { rows } = await sys().query("SELECT id, data FROM app.records WHERE tbl = 'connector_audit' AND data->>'ownerUserId' = $1 ORDER BY created_at DESC LIMIT 30", [userId]);
      return tekst({ rijen: rows.map((r) => ({ id: r.id, ...(r.data as object) })) });
    }
    case 'siem': {
      try {
        const stand = await siemStand();
        return tekst({ via: 'siem', aan: stand.aan, bestand: stand.bestand.ingesteld, loki: stand.loki.ingesteld, intervalS: stand.intervalS });
      } catch { return tekst({ via: 'siem', beschikbaar: false }); }
    }
    default:
      return fout('UITVOER_ONBEKEND');
  }
}

/** null = geen functienaam (de oude v2-weg gaat verder). Poorten vóór de uitvoering. */
export async function voerConnectorFunctieUit(ctx: FunctieAanroep, naam: string, args: Record<string, unknown>): Promise<Inhoud | null> {
  const p = ontleedFunctie(naam, ctx.agent);
  if (!p.ok) return null;
  const def = p.def;
  if ((def.kant === 'beheer' && ctx.ruimte !== 'technisch') || (def.kant === 'gebruiker' && ctx.ruimte === 'technisch')) {
    return fout(RUIMTE_GESCHEIDEN(ctx.ruimte, naam));
  }
  if (!ctx.kanten.includes(def.kant) || !ctx.sleutels.includes(def.key)) {
    return fout(`PERMISSION_OFF: the user did not grant "${naam.slice(0, 80)}" to this connection. They can change it on mcp.tarasevych.com → Agenten → Connectors and reconnect. Do not try another way.`);
  }
  const schoon: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (GEVAAR_SLEUTEL.test(k)) continue;
    if (typeof v === 'string' && GEVAAR_WAARDE.test(v)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') schoon[k] = v;
  }
  const beleid = await beslissing({ client: ctx.agent, ruimte: ctx.ruimte }, def.vermogen);
  if (beleid.mode !== 'always') return fout(weigerTekst(beleid));
  return uitvoeren(ctx, def, schoon);
}
