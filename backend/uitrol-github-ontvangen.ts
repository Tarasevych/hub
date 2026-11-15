// Безпечне отримання релізів із GitHub (webhook HMAC-SHA256, ручне завантаження або MCP-інструмент).
// Veilige ontvangst van releases uit GitHub (webhook HMAC-SHA256, handmatig ophalen of MCP-hulpmiddel).
import { execFile } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { error, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import {
  apiPlatformVaultItems,
  ownerVaultBewarenIntern,
  readOwnerVaultPlaintext,
} from './api-platform-kluis';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { meld } from './melder';
import { gedelegeerdeSessie } from './site-aanroep';
import { releaseInfo } from './uitgave-info';
import { REPO, uitrolArchiefToken } from './uitrol-github';
import { UITROL_LIMIETEN } from './uitrol-goedkeuring';
import { proefVoorArchief } from './uitrol-vereisten';
import { pakketVoorcontrole } from './uitrol-voorcontrole';

const execFileAsync = promisify(execFile);

const API = 'https://api.github.com';
const VERSIE_RE = /^\d{8}-\d{6}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_REDIRECTS = 5;
const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;
const TOEGESTANE_DOWNLOAD_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'codeload.github.com',
]);

export const VAULT_WEBHOOK_GEHEIM_NAAM = 'GITHUB_UITROL_WEBHOOK_GEHEIM';

const sys = () => getPool('systeem');
const voorstelDir = () => process.env.UITROL_VOORSTEL_DIR || path.join(process.env.UPLOADS_DIR || '/srv/data/uploads', 'uitrol-voorstellen');
const pakketPad = (id: string) => path.join(voorstelDir(), `${id}.tar.gz`);
const isOntbrekendeTabel = (e: unknown) => String((e as { code?: string })?.code || '') === '42P01';
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

export class GithubOntvangstFout extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

type WebhookGeheimBron = (eigenaarId: string) => Promise<string | null>;
type GhTokenBron = (eigenaarId: string) => Promise<string | undefined>;
type ArchiefControleFn = NonNullable<NonNullable<Parameters<typeof pakketVoorcontrole>[1]>['archiefControle']>;

let doFetch: typeof fetch = (...a) => fetch(...a);
let geheimBronOverride: WebhookGeheimBron | null = null;
let ghTokenOverride: GhTokenBron | null = null;
let archiefControleOverride: ArchiefControleFn | null = null;

/** Лише для модульних тестів. */
export function setUitrolGithubOntvangenDeps(d: {
  fetch?: typeof fetch;
  webhookGeheim?: WebhookGeheimBron;
  ghToken?: GhTokenBron;
  archiefControle?: ArchiefControleFn;
} | null) {
  doFetch = d?.fetch ?? ((...a) => fetch(...a));
  geheimBronOverride = d?.webhookGeheim ?? null;
  ghTokenOverride = d?.ghToken ?? null;
  archiefControleOverride = d?.archiefControle ?? null;
}

async function leesWebhookGeheim(eigenaarId: string): Promise<string | null> {
  if (geheimBronOverride) return geheimBronOverride(eigenaarId);
  try {
    const items = await apiPlatformVaultItems(eigenaarId);
    const item = items.find((i) => i.keyName === VAULT_WEBHOOK_GEHEIM_NAAM);
    if (item) {
      const val = (await readOwnerVaultPlaintext(eigenaarId, item.keyName, item.purpose)).trim();
      if (val) return val;
    }
  } catch { /* спробуємо резервну змінну оточення */ }
  const envVal = String(process.env.UITROL_GITHUB_WEBHOOK_GEHEIM || '').trim();
  return envVal || null;
}

async function leesGhToken(eigenaarId: string): Promise<string | undefined> {
  if (ghTokenOverride) return ghTokenOverride(eigenaarId);
  return uitrolArchiefToken(eigenaarId);
}

// ------------------------------------------------------------------------------------------------ налаштування та стан
export type GithubOntvangstInstellingen = {
  repo: string;
  webhookAan: boolean;
  webhookAutoOphalen: boolean;
  toegestaneTagPrefix: string;
};

export async function githubOntvangstInstellingenVan(eigenaarId: string): Promise<GithubOntvangstInstellingen> {
  try {
    const { rows } = await sys().query(
      `SELECT repo, webhook_aan, webhook_auto_ophalen, toegestane_tag_prefix
         FROM app.uitrol_github_instellingen
        WHERE eigenaar_id = $1 LIMIT 1`,
      [eigenaarId],
    );
    const r = rows[0];
    return {
      repo: String(r?.repo || ''),
      webhookAan: Boolean(r?.webhook_aan),
      webhookAutoOphalen: r?.webhook_auto_ophalen === undefined ? true : Boolean(r.webhook_auto_ophalen),
      toegestaneTagPrefix: r?.toegestane_tag_prefix !== undefined ? String(r.toegestane_tag_prefix) : '',
    };
  } catch (e) {
    if (isOntbrekendeTabel(e)) {
      return { repo: '', webhookAan: false, webhookAutoOphalen: true, toegestaneTagPrefix: '' };
    }
    throw e;
  }
}

export async function githubOntvangstStand(eigenaarId: string) {
  const inst = await githubOntvangstInstellingenVan(eigenaarId);
  const items = await apiPlatformVaultItems(eigenaarId).catch(() => []);
  const webhookGeheimAanwezig = Boolean(
    items.find((i) => i.keyName === VAULT_WEBHOOK_GEHEIM_NAAM)
    || String(process.env.UITROL_GITHUB_WEBHOOK_GEHEIM || '').trim(),
  );
  let ontvangen: Array<Record<string, unknown>> = [];
  let leveringen: Array<Record<string, unknown>> = [];
  try {
    const r1 = await sys().query(
      `SELECT id, bron, repo, tag, versie, release_id, asset_naam, asset_sha256, asset_bytes,
              voorstel_id, status, fout_code, samenvatting_uk, samenvatting_nl, aangemaakt_op, bijgewerkt_op
         FROM app.uitrol_github_ontvangen
        WHERE user_id = $1
        ORDER BY aangemaakt_op DESC
        LIMIT 20`,
      [eigenaarId],
    );
    ontvangen = r1.rows.map((r) => ({
      id: String(r.id),
      bron: String(r.bron),
      repo: String(r.repo),
      tag: String(r.tag),
      versie: String(r.versie || ''),
      releaseId: Number(r.release_id || 0),
      assetNaam: String(r.asset_naam || ''),
      assetSha256: String(r.asset_sha256 || ''),
      assetBytes: Number(r.asset_bytes || 0),
      voorstelId: r.voorstel_id ? String(r.voorstel_id) : null,
      status: String(r.status),
      foutCode: String(r.fout_code || ''),
      samenvattingUk: String(r.samenvatting_uk || ''),
      samenvattingNl: String(r.samenvatting_nl || ''),
      aangemaaktOp: new Date(r.aangemaakt_op).toISOString(),
      bijgewerktOp: new Date(r.bijgewerkt_op).toISOString(),
    }));
    const r2 = await sys().query(
      `SELECT delivery_id, gebeurtenis, repo, tag, uitkomst, ontvangen_op
         FROM app.uitrol_github_webhook_leveringen
        WHERE user_id = $1
        ORDER BY ontvangen_op DESC
        LIMIT 15`,
      [eigenaarId],
    );
    leveringen = r2.rows.map((r) => ({
      deliveryId: String(r.delivery_id),
      gebeurtenis: String(r.gebeurtenis),
      repo: String(r.repo),
      tag: String(r.tag),
      uitkomst: String(r.uitkomst),
      ontvangenOp: new Date(r.ontvangen_op).toISOString(),
    }));
  } catch (e) {
    if (!isOntbrekendeTabel(e)) throw e;
  }

  return {
    ...inst,
    webhookGeheimAanwezig,
    webhookUrl: `https://${SERVICE_HOSTS.api || 'api.tarasevych.com'}/api/uitrol/github/webhook`,
    ontvangen,
    leveringen,
  };
}

export async function githubOntvangstInstellen(
  eigenaar: { id: string; email?: string },
  invoer: {
    repo?: unknown;
    webhookAan?: unknown;
    webhookAutoOphalen?: unknown;
    toegestaneTagPrefix?: unknown;
    webhookGeheim?: unknown;
    genereerGeheim?: unknown;
  },
) {
  const voor = await githubOntvangstInstellingenVan(eigenaar.id);
  const repo = invoer.repo !== undefined ? String(invoer.repo ?? '').trim() : voor.repo;
  if (repo && !REPO.test(repo)) throw new GithubOntvangstFout('REPO_ONGELDIG', 400);

  const webhookAan = invoer.webhookAan === undefined ? voor.webhookAan : invoer.webhookAan === true;
  const webhookAutoOphalen = invoer.webhookAutoOphalen === undefined ? voor.webhookAutoOphalen : invoer.webhookAutoOphalen === true;
  const prefixRaw = invoer.toegestaneTagPrefix !== undefined ? String(invoer.toegestaneTagPrefix ?? '').trim() : voor.toegestaneTagPrefix;
  if (prefixRaw && !/^[A-Za-z0-9._-]{1,40}$/.test(prefixRaw)) throw new GithubOntvangstFout('TAG_PREFIX_ONGELDIG', 400);

  let eenmaligWebhookGeheim = '';
  const geheimRaw = String(invoer.webhookGeheim ?? '').trim();
  if (invoer.genereerGeheim === true) {
    eenmaligWebhookGeheim = randomBytes(32).toString('hex');
    await ownerVaultBewarenIntern(eigenaar.id, VAULT_WEBHOOK_GEHEIM_NAAM, 'webhook', 'Uitrol-GitHub-webhook', eenmaligWebhookGeheim);
  } else if (geheimRaw) {
    if (geheimRaw.length < 16 || geheimRaw.length > 256) throw new GithubOntvangstFout('GITHUB_WEBHOOK_GEHEIM_ONTBREEKT', 400);
    await ownerVaultBewarenIntern(eigenaar.id, VAULT_WEBHOOK_GEHEIM_NAAM, 'webhook', 'Uitrol-GitHub-webhook', geheimRaw);
  }

  if (webhookAan && !(eenmaligWebhookGeheim || geheimRaw || (await leesWebhookGeheim(eigenaar.id)))) {
    throw new GithubOntvangstFout('GITHUB_WEBHOOK_GEHEIM_ONTBREEKT', 400);
  }

  await sys().query(
    `INSERT INTO app.uitrol_github_instellingen (eigenaar_id, repo, webhook_aan, webhook_auto_ophalen, toegestane_tag_prefix, bijgewerkt_op)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (eigenaar_id) DO UPDATE SET
       repo = EXCLUDED.repo,
       webhook_aan = EXCLUDED.webhook_aan,
       webhook_auto_ophalen = EXCLUDED.webhook_auto_ophalen,
       toegestane_tag_prefix = EXCLUDED.toegestane_tag_prefix,
       bijgewerkt_op = now()`,
    [eigenaar.id, repo, webhookAan, webhookAutoOphalen, prefixRaw],
  );

  await schrijfBeheerAudit({
    actor: eigenaar,
    actie: 'owner.uitrol.github.ontvangst.instellingen',
    doel: { soort: 'github', id: repo || '—' },
    voor: { webhookAan: voor.webhookAan, webhookAutoOphalen: voor.webhookAutoOphalen, prefix: voor.toegestaneTagPrefix },
    na: { webhookAan, webhookAutoOphalen, prefix: prefixRaw, geheimGewijzigd: Boolean(eenmaligWebhookGeheim || geheimRaw) },
    service: 'admin',
  });

  const stand = await githubOntvangstStand(eigenaar.id);
  return eenmaligWebhookGeheim ? { ...stand, eenmaligWebhookGeheim } : stand;
}

// ------------------------------------------------------------------------------------------------ безпечне завантаження та розбір архіву
function downloadHostToegestaan(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol === 'https:') return TOEGESTANE_DOWNLOAD_HOSTS.has(u.hostname.toLowerCase());
    // Лише тестові запуски з локальним фейковим сервером через явно заданий тестовий прапор або override fetch
    if (process.env.UITROL_TEST_TOESTAAN_LOCAL_HTTP === '1' && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return true;
    return false;
  } catch {
    return false;
  }
}

async function ghApiJson(token: string | undefined, padUrl: string): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mijn-ruimte-uitrol-ontvanger',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await doFetch(padUrl, { method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function downloadAssetMetLimiet(
  urlIn: string,
  token: string | undefined,
  doelPad: string,
  acceptHeader = 'application/octet-stream',
): Promise<{ bytes: number; sha256: string }> {
  let huidigUrl = urlIn;
  let res: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!downloadHostToegestaan(huidigUrl)) throw new GithubOntvangstFout('GITHUB_DOWNLOAD_HOST_GEWEIGERD', 400);
    const u = new URL(huidigUrl);
    const headers: Record<string, string> = {
      Accept: acceptHeader,
      'User-Agent': 'mijn-ruimte-uitrol-ontvanger',
    };
    // Токен GitHub ніколи не передається на CDN або сторонні хости редиректу.
    if (token && u.hostname.toLowerCase() === 'api.github.com') {
      headers.Authorization = `Bearer ${token}`;
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }
    res = await doFetch(huidigUrl, { method: 'GET', redirect: 'manual', headers, signal: AbortSignal.timeout(120_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || '';
      if (!loc) throw new GithubOntvangstFout('GITHUB_REDIRECT_ONGELDIG', 502);
      huidigUrl = new URL(loc, huidigUrl).toString();
      res = null;
      continue;
    }
    break;
  }

  if (!res || !res.ok || !res.body) throw new GithubOntvangstFout(`GITHUB_HTTP_${res?.status || 502}`, 502);
  const cl = Number(res.headers.get('content-length') || 0);
  if (cl > UITROL_LIMIETEN.maxBytes) throw new GithubOntvangstFout('GITHUB_TE_GROOT', 413);

  await mkdir(path.dirname(doelPad), { recursive: true, mode: 0o750 });
  const hash = createHash('sha256');
  let bytes = 0;
  const ws = createWriteStream(doelPad, { mode: 0o600 });

  try {
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !value.byteLength) continue;
      bytes += value.byteLength;
      if (bytes > UITROL_LIMIETEN.maxBytes) throw new GithubOntvangstFout('GITHUB_TE_GROOT', 413);
      hash.update(value);
      if (!ws.write(value)) {
        await new Promise<void>((resolve, reject) => {
          ws.once('drain', resolve);
          ws.once('error', reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.once('error', reject);
    });
  } catch (e) {
    ws.destroy();
    await rm(doelPad, { force: true }).catch(() => undefined);
    throw e;
  }

  return { bytes, sha256: hash.digest('hex') };
}

async function haalExpectedSha256(
  release: Record<string, any>,
  assets: Array<Record<string, any>>,
  gekozenAssetNaam: string,
  token: string | undefined,
  expliciet?: string,
): Promise<string> {
  if (expliciet && SHA256_RE.test(expliciet.toLowerCase())) return expliciet.toLowerCase();

  const shaAsset = assets.find((a) => String(a.name || '') === `${gekozenAssetNaam}.sha256`)
    || assets.find((a) => /\.sha256$/i.test(String(a.name || '')));
  if (shaAsset?.url) {
    const tmp = path.join(voorstelDir(), `sha-${randomBytes(8).toString('hex')}.tmp`);
    try {
      await downloadAssetMetLimiet(String(shaAsset.url), token, tmp, 'application/octet-stream');
      const fh = await open(tmp, 'r');
      const buf = Buffer.alloc(512);
      const { bytesRead } = await fh.read(buf, 0, 512, 0);
      await fh.close();
      const txt = buf.subarray(0, bytesRead).toString('utf8');
      const m = /\b([0-9a-f]{64})\b/i.exec(txt);
      if (m) return m[1].toLowerCase();
    } catch { /* спробуємо з опису релізу */ }
    finally { await rm(tmp, { force: true }).catch(() => undefined); }
  }

  const body = String(release.body || '');
  const mBody = /sha256[:\s`*=]+([0-9a-f]{64})/i.exec(body);
  return mBody ? mBody[1].toLowerCase() : '';
}

async function leesVersieUitArchief(archiefPad: string, fallbackTag: string, assetNaam: string): Promise<string> {
  try {
    const { stdout: lijstOut } = await execFileAsync('tar', ['-tzf', archiefPad], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
    const regels = lijstOut.split(/\r?\n/).filter(Boolean);
    const hit = regels.find((p) => /^[^/]+\/UITROL-VERSIE$/.test(p) || p === 'UITROL-VERSIE');
    if (hit) {
      const { stdout: vOut } = await execFileAsync('tar', ['-xOzf', archiefPad, hit], { timeout: 5_000, maxBuffer: 4096 });
      const v = vOut.trim();
      if (VERSIE_RE.test(v)) return v;
    }
  } catch { /* запасний розбір із імені або тега */ }
  const mNaam = /(\d{8}-\d{6})/.exec(assetNaam) || /(\d{8}-\d{6})/.exec(fallbackTag);
  return mNaam ? mNaam[1] : '';
}

async function eigenaarVoorbereiderGrant(eigenaarId: string): Promise<{ id: string; label: string }> {
  const { rows } = await sys().query(
    `SELECT id, label FROM app.uitrol_voorbereiders
      WHERE soort = 'account' AND onderwerp = $1 AND account_id = $1 AND ingetrokken_op IS NULL AND verloopt_op > now()
      ORDER BY verloopt_op DESC LIMIT 1`,
    [eigenaarId],
  );
  if (rows[0]) return { id: String(rows[0].id), label: String(rows[0].label || 'GitHub') };

  const uRes = await sys().query(`SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = $1 LIMIT 1`, [eigenaarId]);
  const label = tekst(uRes.rows[0]?.email || 'eigenaar', 80);
  const ins = await sys().query(
    `INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op, onbepaald, bron)
     VALUES ('account', $1, $1, $2, 'github-ontvangst', now() + interval '7 days', false, 'handmatig')
     RETURNING id, label`,
    [eigenaarId, label],
  );
  return { id: String(ins.rows[0].id), label: String(ins.rows[0].label) };
}

// ------------------------------------------------------------------------------------------------ основний потік прийому релізу
export async function haalGithubReleaseOp(invoer: {
  eigenaarId: string;
  actor?: { id: string; email?: string } | null;
  bron: 'webhook' | 'handmatig' | 'mcp';
  repo?: string;
  tag?: string;
  expectedSha256?: string;
  releasePayload?: Record<string, any> | null;
}) {
  const inst = await githubOntvangstInstellingenVan(invoer.eigenaarId);
  const explicieteRepo = String(invoer.repo || '').trim();
  const ingesteldeRepo = String(inst.repo || '').trim();
  const repo = String(explicieteRepo || ingesteldeRepo).trim();
  if (!repo || !REPO.test(repo)) throw new GithubOntvangstFout('REPO_ONGELDIG', 400);
  if (explicieteRepo) {
    if (ingesteldeRepo && explicieteRepo.toLowerCase() !== ingesteldeRepo.toLowerCase()) {
      throw new GithubOntvangstFout('GITHUB_ONJUISTE_BRON', 403);
    }
    if (invoer.bron === 'mcp' && !ingesteldeRepo && explicieteRepo.toLowerCase() !== 'tarasevych/hub') {
      throw new GithubOntvangstFout('GITHUB_ONJUISTE_BRON', 403);
    }
  }

  const token = await leesGhToken(invoer.eigenaarId);
  let release = invoer.releasePayload || null;

  if (!release) {
    const tag = String(invoer.tag || '').trim();
    if (tag && !TAG_RE.test(tag)) throw new GithubOntvangstFout('TAG_ONGELDIG', 400);
    const pad = tag
      ? `${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
      : `${API}/repos/${repo}/releases/latest`;
    let res = await ghApiJson(token, pad);
    if (!tag && res.status === 404) {
      const lijst = await ghApiJson(token, `${API}/repos/${repo}/releases?per_page=10`);
      if (lijst.status >= 200 && lijst.status < 300 && Array.isArray(lijst.data)) {
        const eerste = lijst.data.find((x: any) => !x?.draft && !x?.prerelease) || lijst.data.find((x: any) => !x?.draft);
        if (eerste) res = { status: 200, data: eerste };
      }
    }
    if (res.status < 200 || res.status >= 300 || !res.data) {
      throw new GithubOntvangstFout(`GITHUB_HTTP_${res.status || 502}`, res.status === 404 ? 404 : 502);
    }
    release = res.data as Record<string, any>;
  }

  const tag = String(release.tag_name || invoer.tag || '').trim();
  const releaseId = Number(release.id || 0);
  if (!tag || !TAG_RE.test(tag)) throw new GithubOntvangstFout('TAG_ONGELDIG', 400);

  const assets = Array.isArray(release.assets) ? (release.assets as Array<Record<string, any>>) : [];
  const asset = assets.find((a) => /^mijn-ruimte-\d{8}-\d{6}\.tar\.gz$/.test(String(a.name || '')))
    || assets.find((a) => /\.tar\.gz$/i.test(String(a.name || '')));

  const ontvangstId = (await sys().query(
    `INSERT INTO app.uitrol_github_ontvangen (user_id, ruimte, bron, repo, tag, release_id, asset_id, asset_naam, status, samenvatting_uk, samenvatting_nl)
     VALUES ($1, 'technisch', $2, $3, $4, $5, $6, $7, 'ontvangen', $8, $9)
     RETURNING id`,
    [
      invoer.eigenaarId,
      invoer.bron,
      repo,
      tag,
      Number.isSafeInteger(releaseId) ? releaseId : 0,
      Number(asset?.id || 0),
      tekst(asset?.name || '', 200),
      `Отримано реліз ${tag} із ${repo}.`,
      `Release ${tag} uit ${repo} ontvangen.`,
    ],
  )).rows[0].id as string;

  const bijwerk = async (velden: {
    versie?: string;
    sha?: string;
    bytes?: number;
    voorstelId?: string | null;
    status: string;
    foutCode?: string;
    uk: string;
    nl: string;
  }) => {
    await sys().query(
      `UPDATE app.uitrol_github_ontvangen
          SET versie = COALESCE(NULLIF($2, ''), versie),
              asset_sha256 = COALESCE(NULLIF($3, ''), asset_sha256),
              asset_bytes = CASE WHEN $4 > 0 THEN $4 ELSE asset_bytes END,
              voorstel_id = COALESCE($5, voorstel_id),
              status = $6,
              fout_code = $7,
              samenvatting_uk = $8,
              samenvatting_nl = $9,
              bijgewerkt_op = now()
        WHERE id = $1`,
      [
        ontvangstId,
        velden.versie || '',
        velden.sha || '',
        velden.bytes || 0,
        velden.voorstelId || null,
        velden.status,
        tekst(velden.foutCode || '', 80),
        tekst(velden.uk, 800),
        tekst(velden.nl, 800),
      ],
    );
  };

  if (!asset || !asset.url) {
    await bijwerk({
      status: 'fout',
      foutCode: 'GITHUB_ASSET_ONTBREEKT',
      uk: `У релізі ${tag} немає архіву .tar.gz.`,
      nl: `Release ${tag} bevat geen .tar.gz-archief.`,
    });
    throw new GithubOntvangstFout('GITHUB_ASSET_ONTBREEKT', 404);
  }

  const assetNaam = String(asset.name || 'release.tar.gz');
  const tmpPad = path.join(voorstelDir(), `gh-${ontvangstId}.deel`);

  try {
    const dl = await downloadAssetMetLimiet(String(asset.url), token, tmpPad);
    // Перевірка магічних байтів gzip
    const kop = Buffer.alloc(2);
    const fh = await open(tmpPad, 'r');
    try { await fh.read(kop, 0, 2, 0); } finally { await fh.close(); }
    if (kop[0] !== 0x1f || kop[1] !== 0x8b) {
      await bijwerk({
        bytes: dl.bytes,
        sha: dl.sha256,
        status: 'geweigerd',
        foutCode: 'GEEN_GZIP',
        uk: `Файл ${assetNaam} із GitHub не є архівом gzip.`,
        nl: `Bestand ${assetNaam} uit GitHub is geen geldig gzip-archief.`,
      });
      throw new GithubOntvangstFout('GEEN_GZIP', 400);
    }

    const expectedSha = await haalExpectedSha256(release, assets, assetNaam, token, invoer.expectedSha256);
    if (expectedSha && expectedSha !== dl.sha256) {
      await bijwerk({
        bytes: dl.bytes,
        sha: dl.sha256,
        status: 'geweigerd',
        foutCode: 'GITHUB_SHA256_VERSCHILT',
        uk: `SHA-256 файлу ${assetNaam} не збігається з очікуваним у релізі.`,
        nl: `SHA-256 van ${assetNaam} komt niet overeen met de opgegeven controlesom.`,
      });
      throw new GithubOntvangstFout('GITHUB_SHA256_VERSCHILT', 422);
    }

    const versie = await leesVersieUitArchief(tmpPad, tag, assetNaam);
    if (!VERSIE_RE.test(versie)) {
      await bijwerk({
        bytes: dl.bytes,
        sha: dl.sha256,
        status: 'geweigerd',
        foutCode: 'VERSIE_ONGELDIG',
        uk: `У пакеті з GitHub не знайдено коректний UITROL-VERSIE (очікується YYYYMMDD-HHMMSS).`,
        nl: `Geen geldige UITROL-VERSIE (verwacht YYYYMMDD-HHMMSS) in het pakket uit GitHub gevonden.`,
      });
      throw new GithubOntvangstFout('VERSIE_ONGELDIG', 400);
    }

    let toegepast: Set<string> | null = null;
    try { toegepast = new Set((await sys().query('SELECT version FROM app.schema_migrations')).rows.map((r: { version: string }) => String(r.version))); } catch { toegepast = null; }
    const proef = proefVoorArchief(dl.sha256);
    const vc = await pakketVoorcontrole(tmpPad, {
      versie,
      actieveVersie: releaseInfo().versie || undefined,
      toegepasteMigraties: toegepast,
      archiefToken: token,
      ...(archiefControleOverride ? { archiefControle: archiefControleOverride } : {}),
      proef,
    });

    if (!vc.resultaat.ok) {
      const foutLijst = vc.resultaat.controles.filter((c) => c.niveau === 'fout').map((c) => c.id).join(', ').slice(0, 200);
      await bijwerk({
        versie,
        bytes: dl.bytes,
        sha: dl.sha256,
        status: 'voorcontrole_mislukt',
        foutCode: 'VOORCONTROLE_MISLUKT',
        uk: `Перевірка відхилила випуск ${versie} із GitHub: ${foutLijst}.`,
        nl: `Voorcontrole weigerde release ${versie} uit GitHub: ${foutLijst}.`,
      });
      await import('./uitrol-stroom').then((s) => s.stroomVastleggenVanExternBewijs(invoer.eigenaarId, {
        versie,
        soort: 'github-ontvangst',
        bron: `github:${invoer.bron}`,
        status: 'mislukt',
        samenvattingUk: `Отримано ${repo}@${tag}, але voorcontrole виявила помилки: ${foutLijst}.`,
        samenvattingNl: `${repo}@${tag} opgehaald, maar voorcontrole vond fouten: ${foutLijst}.`,
        pakketSha256: dl.sha256,
        bewijsData: { repo, tag, bron: invoer.bron, foutLijst, controles: vc.resultaat.controles.map((c) => ({ id: c.id, niveau: c.niveau })) },
      })).catch(() => undefined);
      await meld(
        invoer.eigenaarId,
        'uitrol.mislukt',
        `Випуск ${versie} з GitHub не пройшов перевірку / Release ${versie} uit GitHub geweigerd`,
        `Реліз ${repo}@${tag} завантажено, але попередня перевірка зупинила його (${foutLijst}). / Release ${repo}@${tag} is opgehaald, maar door de voorcontrole geweigerd (${foutLijst}).`,
        'https://admin.tarasevych.com/updates',
      ).catch(() => undefined);
      return {
        ok: false,
        ontvangstId,
        versie,
        status: 'voorcontrole_mislukt',
        code: 'VOORCONTROLE_MISLUKT',
        voorcontrole: vc.resultaat,
      };
    }

    // Попередня перевірка успішна -> створюємо пропозицію «wacht-op-goedkeuring» (установлення без passkey ніколи не запускається).
    const grant = await eigenaarVoorbereiderGrant(invoer.eigenaarId);
    const voorbereiderLabel = tekst(`GitHub (${invoer.bron}): ${repo}@${tag}`, 80);
    const beschrijving = (vc.meta.samenvatting || String(release.body || '')).slice(0, 8000);
    const commit = vc.meta.commit && /^[0-9a-f]{7,64}$/i.test(vc.meta.commit) ? vc.meta.commit.toLowerCase() : null;

    let voorstelId = '';
    try {
      const ins = await sys().query(
        `INSERT INTO app.uitrol_voorstellen
           (versie, status, bytes, sha256, ontvangen, voorbereider_id, voorbereider_label, account_id, bron_commit, wijzigingen, tests, diff_samenvatting, voorcontrole, pakket_meta)
         VALUES ($1, 'wacht-op-goedkeuring', $2, $3, $2, $4, $5, $6, $7, $8, '{}'::jsonb, '', $9::jsonb, $10::jsonb)
         RETURNING id`,
        [
          versie,
          dl.bytes,
          dl.sha256,
          grant.id,
          voorbereiderLabel,
          invoer.eigenaarId,
          commit,
          beschrijving,
          JSON.stringify(vc.resultaat),
          JSON.stringify(vc.meta),
        ],
      );
      voorstelId = String(ins.rows[0].id);
    } catch (err) {
      if (String((err as { code?: string }).code) === '23505') {
        await bijwerk({
          versie,
          bytes: dl.bytes,
          sha: dl.sha256,
          status: 'overgeslagen',
          foutCode: 'VERSIE_BESTAAT_AL',
          uk: `Версія ${versie} уже є у списку пропозицій на сервері.`,
          nl: `Versie ${versie} bestaat al in de lijst met voorstellen.`,
        });
        return { ok: true, overgeslagen: true, code: 'VERSIE_BESTAAT_AL', ontvangstId, versie };
      }
      throw err;
    }

    await rename(tmpPad, pakketPad(voorstelId));
    await bijwerk({
      versie,
      bytes: dl.bytes,
      sha: dl.sha256,
      voorstelId,
      status: 'voorcontrole_ok',
      uk: `Завантажено з GitHub (${repo}@${tag}), перевірку пройдено — чекає схвалення passkey.`,
      nl: `Uit GitHub opgehaald (${repo}@${tag}), voorcontrole geslaagd — wacht op passkey-goedkeuring.`,
    });

    await schrijfBeheerAudit({
      actor: invoer.actor || null,
      eigenaar: invoer.eigenaarId,
      actie: 'owner.uitrol.github.ontvangen',
      doel: { soort: 'release', id: versie, naam: repo },
      details: { bron: invoer.bron, tag, voorstelId, sha256: dl.sha256, bytes: dl.bytes },
      service: 'admin',
    });

    await import('./uitrol-stroom').then(async (s) => {
      await s.stroomVastleggenVanVoorstel(voorstelId, 'klaar', invoer.eigenaarId);
      await s.stroomVastleggenVanExternBewijs(invoer.eigenaarId, {
        versie,
        voorstelId,
        soort: 'github-ontvangst',
        bron: `github:${invoer.bron}`,
        status: 'geslaagd',
        samenvattingUk: `Випуск ${repo}@${tag} отримано й перевірено (SHA-256 ${dl.sha256.slice(0, 12)}…); передано на схвалення passkey.`,
        samenvattingNl: `Release ${repo}@${tag} opgehaald en gecontroleerd (SHA-256 ${dl.sha256.slice(0, 12)}…); klaar voor passkey-goedkeuring.`,
        pakketSha256: dl.sha256,
        bewijsData: { repo, tag, bron: invoer.bron, assetNaam, voorstelId, bytes: dl.bytes },
      });
    }).catch(() => undefined);

    await meld(
      invoer.eigenaarId,
      'uitrol',
      `Випуск ${versie} із GitHub готовий до схвалення / Release ${versie} uit GitHub klaar voor goedkeuring`,
      `Отримано ${repo}@${tag} (${invoer.bron}). Перевірку пройдено — відкрийте «Оновлення» й схваліть passkey. / ${repo}@${tag} ontvangen (${invoer.bron}). Voorcontrole geslaagd — open «Updates» en keur goed met uw passkey.`,
      'https://admin.tarasevych.com/updates',
    ).catch(() => undefined);

    return {
      ok: true,
      ontvangstId,
      voorstelId,
      versie,
      repo,
      tag,
      sha256: dl.sha256,
      bytes: dl.bytes,
      status: 'wacht-op-goedkeuring',
    };
  } finally {
    await rm(tmpPad, { force: true }).catch(() => undefined);
  }
}

// ------------------------------------------------------------------------------------------------ обробка вхідного GitHub Webhook
export async function verwerkGithubUitrolWebhook(invoer: {
  handtekening: string;
  gebeurtenis: string;
  leveringId: string;
  rauwLichaam: string;
}): Promise<{ ok: true; resultaat: Record<string, unknown> } | { ok: false; fout: string; status: number }> {
  const handtekening = String(invoer.handtekening || '').trim();
  const gebeurtenis = String(invoer.gebeurtenis || '').trim().slice(0, 60);
  const leveringId = String(invoer.leveringId || '').trim();
  if (!handtekening.startsWith('sha256=')) return { ok: false, fout: 'GITHUB_WEBHOOK_ONGELDIG', status: 401 };
  if (!/^[A-Za-z0-9_.:-]{4,120}$/.test(leveringId)) return { ok: false, fout: 'GITHUB_WEBHOOK_ONGELDIG', status: 400 };
  if (Buffer.byteLength(invoer.rauwLichaam, 'utf8') > MAX_WEBHOOK_BYTES) return { ok: false, fout: 'WEBHOOK_TE_GROOT', status: 413 };

  let payload: any;
  try { payload = JSON.parse(invoer.rauwLichaam); } catch { return { ok: false, fout: 'GITHUB_WEBHOOK_ONGELDIG', status: 400 }; }
  const repoFull = String(payload?.repository?.full_name || '').trim();

  // Шукаємо конфігурацію власника з увімкненим webhook (для вказаного репо або єдиного активного).
  const { rows: instRows } = await sys().query(
    `SELECT eigenaar_id, repo, webhook_aan, webhook_auto_ophalen, toegestane_tag_prefix
       FROM app.uitrol_github_instellingen
      WHERE webhook_aan = true AND ($1 = '' OR lower(repo) = lower($1))
      ORDER BY bijgewerkt_op DESC LIMIT 3`,
    [repoFull],
  );
  if (!instRows.length) return { ok: false, fout: 'GITHUB_WEBHOOK_ONGELDIG', status: 403 };

  let matchedInst: any = null;
  for (const r of instRows) {
    const geheim = await leesWebhookGeheim(String(r.eigenaar_id));
    if (!geheim) continue;
    const verwacht = `sha256=${createHmac('sha256', geheim).update(invoer.rauwLichaam, 'utf8').digest('hex')}`;
    const a = Buffer.from(handtekening, 'utf8');
    const b = Buffer.from(verwacht, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      matchedInst = r;
      break;
    }
  }
  if (!matchedInst) return { ok: false, fout: 'GITHUB_WEBHOOK_ONGELDIG', status: 401 };

  const eigenaarId = String(matchedInst.eigenaar_id);
  const tag = String(payload?.release?.tag_name || '').trim().slice(0, 120);

  // Захист від повторної доставки (X-GitHub-Delivery)
  const insLev = await sys().query(
    `INSERT INTO app.uitrol_github_webhook_leveringen (delivery_id, user_id, ruimte, gebeurtenis, repo, tag, uitkomst)
     VALUES ($1, $2, 'technisch', $3, $4, $5, 'ontvangen')
     ON CONFLICT (delivery_id) DO NOTHING RETURNING delivery_id`,
    [leveringId, eigenaarId, gebeurtenis || 'onbekend', repoFull || String(matchedInst.repo || ''), tag],
  );
  if (!insLev.rows[0]) {
    return { ok: true, resultaat: { ok: true, herhaling: true, code: 'GITHUB_WEBHOOK_HERHALING' } };
  }

  const updateLevering = async (uitkomst: string) => {
    await sys().query(
      `UPDATE app.uitrol_github_webhook_leveringen SET uitkomst = $2 WHERE delivery_id = $1`,
      [leveringId, uitkomst.slice(0, 60)],
    ).catch(() => undefined);
  };

  if (gebeurtenis === 'ping') {
    await updateLevering('ping-ok');
    return { ok: true, resultaat: { ok: true, ping: true } };
  }

  if (gebeurtenis !== 'release' || payload?.action !== 'published' || payload?.release?.draft === true) {
    await updateLevering(`genegeerd:${gebeurtenis}:${String(payload?.action || '')}`);
    return { ok: true, resultaat: { ok: true, overgeslagen: true, reden: 'GEBEURTENIS_GENEGEERD' } };
  }

  const prefix = String(matchedInst.toegestane_tag_prefix || '');
  if (prefix && !tag.startsWith(prefix)) {
    await updateLevering('tag-prefix-overgeslagen');
    return { ok: true, resultaat: { ok: true, overgeslagen: true, reden: 'TAG_PREFIX_VERSCHILT' } };
  }

  if (matchedInst.webhook_auto_ophalen !== true) {
    await sys().query(
      `INSERT INTO app.uitrol_github_ontvangen (user_id, ruimte, bron, repo, tag, release_id, status, samenvatting_uk, samenvatting_nl)
       VALUES ($1, 'technisch', 'webhook', $2, $3, $4, 'ontvangen', $5, $6)`,
      [
        eigenaarId,
        repoFull || String(matchedInst.repo),
        tag,
        Number(payload?.release?.id || 0),
        `Отримано сповіщення webhook про випуск ${tag} (автозавантаження вимкнено).`,
        `Webhook ontvangen voor release ${tag} (automatisch ophalen staat uit).`,
      ],
    );
    await updateLevering('aangemeld');
    return { ok: true, resultaat: { ok: true, aangemeld: true, tag } };
  }

  try {
    const out = await haalGithubReleaseOp({
      eigenaarId,
      actor: null,
      bron: 'webhook',
      repo: repoFull || String(matchedInst.repo),
      tag,
      releasePayload: payload.release,
    });
    await updateLevering(out.ok ? 'verwerkt' : 'voorcontrole-mislukt');
    return { ok: true, resultaat: out };
  } catch (e) {
    const code = e instanceof GithubOntvangstFout ? e.code : 'FOUT';
    await updateLevering(`fout:${code}`);
    return { ok: true, resultaat: { ok: false, code } };
  }
}

// ------------------------------------------------------------------------------------------------ маршрути HTTP
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type SessionOk = { user: { id: string; email: string; role?: string }; service?: string };
type Resp = Awaited<ReturnType<RouterMiddleware>>;
export type GithubOntvangstRouteDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
  isEigenaar: (u: SessionOk['user']) => boolean;
  sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
};
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const kopVan = (ev: Record<string, unknown>, naam: string): string => {
  const h = (ev?.headers || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === naam) return String(v ?? '');
  return '';
};

export function uitrolGithubOntvangenRoutes(deps: GithubOntvangstRouteDeps): Record<string, RouterMiddleware[]> {
  const eigenaar = (opts: { sterk?: boolean; mcpToegestaan?: boolean }, run: (ctx: Ctx, auth: SessionOk, viaMcp: boolean) => Promise<Resp | unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const viaMcp = Boolean(opts.mcpToegestaan && gedelegeerdeSessie(ctx.event));
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!deps.isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    if (opts.sterk && !viaMcp) {
      if (!deps.sterkeStapOp) return error('STEP_UP_STRONG_REQUIRED', 403);
      const su = await deps.sterkeStapOp(ctx, auth);
      if (su) return su;
    }
    try {
      const uit = await run(ctx, auth, viaMcp);
      return uit && typeof uit === 'object' && 'statusCode' in (uit as object) ? uit as Resp : json(uit);
    } catch (e) {
      if (e instanceof GithubOntvangstFout) return error(e.code, e.status >= 400 && e.status < 500 ? e.status : 400);
      console.error('[uitrol-github-ontvangen] route:', (e as Error).message);
      return error('UITROL_GITHUB_FOUT', 500);
    }
  }) as RouterMiddleware;
  const wie = (a: SessionOk) => ({ id: a.user.id, email: a.user.email });

  return {
    'POST /api/owner/uitrol/github/ontvangst/stand': [eigenaar({}, async (_c, a) => githubOntvangstStand(a.user.id))],
    'POST /api/owner/uitrol/github/ontvangst/instellen': [eigenaar({ sterk: true }, async (c, a) => {
      const b = lichaam(c.body);
      return githubOntvangstInstellen(wie(a), {
        repo: b.repo,
        webhookAan: b.webhookAan,
        webhookAutoOphalen: b.webhookAutoOphalen,
        toegestaneTagPrefix: b.toegestaneTagPrefix,
        webhookGeheim: b.webhookGeheim,
        genereerGeheim: b.genereerGeheim,
      });
    })],
    'POST /api/owner/uitrol/github/ophalen': [eigenaar({ sterk: true, mcpToegestaan: true }, async (c, a, viaMcp) => {
      const limiet = await rateLimit(`uitrol-gh-ophalen:${a.user.id}`, 10, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const b = lichaam(c.body);
      const bron = viaMcp || b.bron === 'mcp' ? 'mcp' : 'handmatig';
      return haalGithubReleaseOp({
        eigenaarId: a.user.id,
        actor: wie(a),
        bron,
        repo: b.repo ? String(b.repo) : undefined,
        tag: b.tag ? String(b.tag) : undefined,
        expectedSha256: b.sha256 ? String(b.sha256) : undefined,
      });
    })],
    // Публічний вхідний GitHub Webhook (без cookie-сесії; автентифікація виключно через HMAC-SHA256 у X-Hub-Signature-256).
    'POST /api/uitrol/github/webhook': [async (raw) => {
      const ctx = raw as unknown as Ctx;
      if (!(await rateLimit('uitrol-gh-webhook', 120, 60, { failClosed: false })).ok) {
        return error('RATE_LIMITED', 429);
      }
      const rauw = typeof ctx.event?.body === 'string'
        ? ctx.event.body
        : typeof ctx.event?.rawBody === 'string'
          ? ctx.event.rawBody
          : typeof ctx.body === 'string'
            ? ctx.body
            : JSON.stringify(ctx.body ?? {});
      const uit = await verwerkGithubUitrolWebhook({
        handtekening: kopVan(ctx.event, 'x-hub-signature-256'),
        gebeurtenis: kopVan(ctx.event, 'x-github-event'),
        leveringId: kopVan(ctx.event, 'x-github-delivery'),
        rauwLichaam: rauw,
      });
      return uit.ok ? json(uit.resultaat) : error(uit.fout, uit.status);
    }],
  };
}
