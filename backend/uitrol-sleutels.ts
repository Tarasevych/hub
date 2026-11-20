// UPD-011: Персональні відкличні ключі адміністраторів і делегованих осіб та 3-чинникова довіра
// (GitHub ↔ MCP-з’єднувач ШІ ↔ Обліковий запис і права на сайті).
// Ніколи не зберігаємо сирий ключ у базі чи журналі — лише префікс і SHA-256 геш.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../server/platform/pg';
import { agentAudit } from './agent-audit';
import {
  drieFactorenToegangToegestaan,
  evalueerDrieFactoren,
  maakUitwisselPakket,
  type DrieFactorenOordeel,
  type SleutelRol,
  type SleutelToegang,
  type UitwisselPakket,
} from '../shared/uitrol-drie-factoren';

const sys = () => getPool('systeem');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLLEN: readonly SleutelRol[] = ['eigenaar', 'beheerder', 'gedelegeerde', 'agent'];
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class SleutelFout extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

type EigenaarRef = { id: string; email?: string };

export type BeheerSleutelUit = {
  id: string;
  userId: string;
  label: string;
  rol: SleutelRol;
  prefix: string;
  githubKoppeling: string;
  githubGeverifieerdOp: string;
  mcpKoppelingId: string;
  mcpAgentSlug: string;
  mcpGeverifieerdOp: string;
  siteGrantId: string;
  regelsVersie: string;
  regelsHash: string;
  toegangNiveau: SleutelToegang;
  aangemaaktOp: string;
  bijgewerktOp: string;
  laatstGebruiktOp: string;
  gesynchroniseerdOp: string;
  ingetrokkenOp: string;
  ingetrokkenReden: string;
  status: 'actief' | 'ingetrokken';
  drieFactoren: DrieFactorenOordeel;
  toegangOordeel: { toegestaan: boolean; code: string; redenUk: string; redenNl: string };
};

let lockCache: { tijd: number; versie: string; hash: string } | null = null;
async function huidigeRegelsLock(): Promise<{ versie: string; hash: string }> {
  if (lockCache && Date.now() - lockCache.tijd < 30_000) return { versie: lockCache.versie, hash: lockCache.hash };
  try {
    const raw = await readFile(path.join(process.cwd(), 'orchestratie', 'regels.lock.json'), 'utf8');
    const j = JSON.parse(raw) as { regelsVersie?: string; regelsHash?: string };
    const uit = { versie: String(j.regelsVersie || ''), hash: String(j.regelsHash || '') };
    lockCache = { tijd: Date.now(), ...uit };
    return uit;
  } catch {
    return { versie: '', hash: '' };
  }
}

function sleutelUit(r: any, huidigLock: { versie: string; hash: string }): BeheerSleutelUit {
  const actief = !r.ingetrokken_op;
  const toegangNiveau: SleutelToegang = r.toegang_niveau === 'installeren' ? 'installeren' : 'uploaden';
  const regelsVersie = String(r.regels_versie || '');
  const regelsHash = String(r.regels_hash || '');
  const regelsGeldig = !huidigLock.versie || !regelsVersie || regelsVersie === huidigLock.versie;

  const drieFactoren = evalueerDrieFactoren({
    githubKoppeling: String(r.github_koppeling || ''),
    githubGeverifieerd: Boolean(r.github_geverifieerd_op),
    githubGeverifieerdOp: iso(r.github_geverifieerd_op),
    mcpKoppelingId: String(r.mcp_koppeling_id || ''),
    mcpAgentSlug: String(r.mcp_agent_slug || ''),
    mcpGeverifieerd: Boolean(r.mcp_geverifieerd_op),
    mcpGeverifieerdOp: iso(r.mcp_geverifieerd_op),
    regelsGeldig,
    regelsVersie: regelsVersie || huidigLock.versie,
    siteAccountActief: true,
    siteGrantActief: actief && Boolean(r.site_grant_id || r.rol === 'eigenaar' || r.rol === 'beheerder'),
    siteSleutelActief: actief,
    siteHandtekeningOk: Boolean(r.gesynchroniseerd_op),
    siteToegangNiveau: toegangNiveau,
  });

  return {
    id: String(r.id),
    userId: String(r.user_id),
    label: String(r.label || ''),
    rol: (ROLLEN.includes(r.rol) ? r.rol : 'beheerder') as SleutelRol,
    prefix: String(r.sleutel_prefix || ''),
    githubKoppeling: String(r.github_koppeling || ''),
    githubGeverifieerdOp: iso(r.github_geverifieerd_op),
    mcpKoppelingId: String(r.mcp_koppeling_id || ''),
    mcpAgentSlug: String(r.mcp_agent_slug || ''),
    mcpGeverifieerdOp: iso(r.mcp_geverifieerd_op),
    siteGrantId: String(r.site_grant_id || ''),
    regelsVersie,
    regelsHash,
    toegangNiveau,
    aangemaaktOp: iso(r.aangemaakt_op),
    bijgewerktOp: iso(r.bijgewerkt_op),
    laatstGebruiktOp: iso(r.laatst_gebruikt_op),
    gesynchroniseerdOp: iso(r.gesynchroniseerd_op),
    ingetrokkenOp: iso(r.ingetrokken_op),
    ingetrokkenReden: String(r.ingetrokken_reden || ''),
    status: actief ? 'actief' : 'ingetrokken',
    drieFactoren,
    toegangOordeel: drieFactorenToegangToegestaan(drieFactoren, toegangNiveau),
  };
}

function genereerSleutel(): { ruw: string; prefix: string; hash: string; uitwisselCode: string; uitwisselHash: string; verlooptOp: string } {
  const secret = randomBytes(28).toString('base64url');
  const ruw = `mr3f_${secret}`;
  const prefix = ruw.slice(0, 12);
  const hash = sha256(ruw);
  const uitwisselCode = `mruw_${randomBytes(18).toString('base64url')}`;
  const uitwisselHash = sha256(uitwisselCode);
  const verlooptOp = new Date(Date.now() + 30 * 60_000).toISOString();
  return { ruw, prefix, hash, uitwisselCode, uitwisselHash, verlooptOp };
}

export async function sleutelsLijst(): Promise<{ sleutels: BeheerSleutelUit[]; regelsLock: { versie: string; hash: string } }> {
  const lock = await huidigeRegelsLock();
  try {
    const { rows } = await sys().query(`SELECT * FROM app.uitrol_beheer_sleutels ORDER BY ingetrokken_op IS NOT NULL ASC, aangemaakt_op DESC LIMIT 100`);
    return { sleutels: rows.map((r) => sleutelUit(r, lock)), regelsLock: lock };
  } catch {
    return { sleutels: [], regelsLock: lock };
  }
}

export async function sleutelAanmaken(
  door: EigenaarRef,
  invoer: Record<string, unknown>,
): Promise<{ sleutel: BeheerSleutelUit; eenmaligeSleutel: string; uitwisselCode: string; uitwisselPakket: UitwisselPakket }> {
  const userId = tekst(invoer.userId || door.id, 120);
  const label = tekst(invoer.label, 120);
  if (!userId || label.length < 3) throw new SleutelFout('BEHEERSLEUTEL_ONGELDIG', 400);
  const rolRuw = tekst(invoer.rol || 'beheerder', 32) as SleutelRol;
  const rol: SleutelRol = ROLLEN.includes(rolRuw) ? rolRuw : 'beheerder';
  const toegangNiveau: SleutelToegang = invoer.toegangNiveau === 'installeren' ? 'installeren' : 'uploaden';
  const githubKoppeling = tekst(invoer.githubKoppeling, 140);
  const mcpKoppelingId = tekst(invoer.mcpKoppelingId, 120);
  const mcpAgentSlug = tekst(invoer.mcpAgentSlug, 60);
  const siteGrantId = tekst(invoer.siteGrantId, 120);

  const lock = await huidigeRegelsLock();
  const gen = genereerSleutel();
  const nu = new Date().toISOString();
  const githubBevestigd = invoer.githubBevestigd === true && Boolean(githubKoppeling);
  const mcpBevestigd = invoer.mcpBevestigd === true && Boolean(mcpKoppelingId || mcpAgentSlug);

  const { rows } = await sys().query(
    `INSERT INTO app.uitrol_beheer_sleutels
       (user_id, label, rol, sleutel_prefix, sleutel_hash, github_koppeling, github_geverifieerd_op,
        mcp_koppeling_id, mcp_agent_slug, mcp_geverifieerd_op, site_grant_id, regels_versie, regels_hash,
        toegang_niveau, uitwissel_hash, uitwissel_verloopt_op, gesynchroniseerd_op)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      userId, label, rol, gen.prefix, gen.hash,
      githubKoppeling, githubBevestigd ? nu : null,
      mcpKoppelingId, mcpAgentSlug, mcpBevestigd ? nu : null,
      siteGrantId, lock.versie, lock.hash, toegangNiveau,
      gen.uitwisselHash, gen.verlooptOp,
      githubBevestigd && mcpBevestigd ? nu : null,
    ],
  );
  const sleutel = sleutelUit(rows[0], lock);
  await agentAudit({
    ownerId: door.id,
    actor: { id: door.id, email: door.email },
    action: 'uitrol.sleutel.aangemaakt',
    target: { type: 'beheersleutel', id: sleutel.id, label: sleutel.label },
    agent: mcpAgentSlug || null,
    after: { rol, toegangNiveau, githubKoppeling, mcpAgentSlug, drieFactoren: sleutel.drieFactoren.aantalOk },
  });

  const uitwisselPakket = maakUitwisselPakket({
    sleutelId: sleutel.id,
    prefix: sleutel.prefix,
    githubKoppeling: sleutel.githubKoppeling,
    mcpAgentSlug: sleutel.mcpAgentSlug,
    regelsVersie: lock.versie,
    verlooptOp: gen.verlooptOp,
  });

  return { sleutel, eenmaligeSleutel: gen.ruw, uitwisselCode: gen.uitwisselCode, uitwisselPakket };
}

export async function sleutelSynchroniseren(
  door: EigenaarRef,
  invoer: Record<string, unknown>,
): Promise<{ sleutel: BeheerSleutelUit }> {
  const id = String(invoer.id || '');
  if (!UUID.test(id)) throw new SleutelFout('NIET_GEVONDEN', 404);
  const bestaand = (await sys().query(`SELECT * FROM app.uitrol_beheer_sleutels WHERE id = $1`, [id])).rows[0];
  if (!bestaand) throw new SleutelFout('NIET_GEVONDEN', 404);
  if (bestaand.ingetrokken_op) throw new SleutelFout('SLEUTEL_INGETROKKEN', 409);

  const lock = await huidigeRegelsLock();
  const githubKoppeling = invoer.githubKoppeling !== undefined ? tekst(invoer.githubKoppeling, 140) : String(bestaand.github_koppeling || '');
  const mcpKoppelingId = invoer.mcpKoppelingId !== undefined ? tekst(invoer.mcpKoppelingId, 120) : String(bestaand.mcp_koppeling_id || '');
  const mcpAgentSlug = invoer.mcpAgentSlug !== undefined ? tekst(invoer.mcpAgentSlug, 60) : String(bestaand.mcp_agent_slug || '');
  const siteGrantId = invoer.siteGrantId !== undefined ? tekst(invoer.siteGrantId, 120) : String(bestaand.site_grant_id || '');
  const toegangNiveau: SleutelToegang = invoer.toegangNiveau === 'installeren'
    ? 'installeren'
    : invoer.toegangNiveau === 'uploaden'
      ? 'uploaden'
      : (bestaand.toegang_niveau === 'installeren' ? 'installeren' : 'uploaden');

  const nu = new Date().toISOString();
  const githubOp = invoer.githubBevestigd === false ? null : (invoer.githubBevestigd === true && githubKoppeling ? nu : bestaand.github_geverifieerd_op);
  const mcpOp = invoer.mcpBevestigd === false ? null : (invoer.mcpBevestigd === true && (mcpKoppelingId || mcpAgentSlug) ? nu : bestaand.mcp_geverifieerd_op);

  const { rows } = await sys().query(
    `UPDATE app.uitrol_beheer_sleutels
        SET github_koppeling = $2,
            github_geverifieerd_op = $3,
            mcp_koppeling_id = $4,
            mcp_agent_slug = $5,
            mcp_geverifieerd_op = $6,
            site_grant_id = $7,
            toegang_niveau = $8,
            regels_versie = $9,
            regels_hash = $10,
            gesynchroniseerd_op = now(),
            bijgewerkt_op = now()
      WHERE id = $1
      RETURNING *`,
    [id, githubKoppeling, githubOp, mcpKoppelingId, mcpAgentSlug, mcpOp, siteGrantId, toegangNiveau, lock.versie, lock.hash],
  );
  const sleutel = sleutelUit(rows[0], lock);
  await agentAudit({
    ownerId: door.id,
    actor: { id: door.id, email: door.email },
    action: 'uitrol.sleutel.gesynchroniseerd',
    target: { type: 'beheersleutel', id: sleutel.id, label: sleutel.label },
    agent: sleutel.mcpAgentSlug || null,
    after: { drieFactoren: sleutel.drieFactoren.aantalOk, toegangNiveau: sleutel.toegangNiveau, regelsVersie: lock.versie },
  });
  return { sleutel };
}

export async function sleutelRoteren(
  door: EigenaarRef,
  invoer: Record<string, unknown>,
): Promise<{ sleutel: BeheerSleutelUit; eenmaligeSleutel: string; uitwisselCode: string; uitwisselPakket: UitwisselPakket }> {
  const id = String(invoer.id || '');
  if (!UUID.test(id)) throw new SleutelFout('NIET_GEVONDEN', 404);
  const bestaand = (await sys().query(`SELECT * FROM app.uitrol_beheer_sleutels WHERE id = $1`, [id])).rows[0];
  if (!bestaand) throw new SleutelFout('NIET_GEVONDEN', 404);
  if (bestaand.ingetrokken_op) throw new SleutelFout('SLEUTEL_INGETROKKEN', 409);

  const lock = await huidigeRegelsLock();
  const gen = genereerSleutel();
  const { rows } = await sys().query(
    `UPDATE app.uitrol_beheer_sleutels
        SET sleutel_prefix = $2,
            sleutel_hash = $3,
            uitwissel_hash = $4,
            uitwissel_verloopt_op = $5,
            regels_versie = $6,
            regels_hash = $7,
            bijgewerkt_op = now()
      WHERE id = $1
      RETURNING *`,
    [id, gen.prefix, gen.hash, gen.uitwisselHash, gen.verlooptOp, lock.versie, lock.hash],
  );
  const sleutel = sleutelUit(rows[0], lock);
  await agentAudit({
    ownerId: door.id,
    actor: { id: door.id, email: door.email },
    action: 'uitrol.sleutel.geroteerd',
    target: { type: 'beheersleutel', id: sleutel.id, label: sleutel.label },
    agent: sleutel.mcpAgentSlug || null,
    before: { prefix: String(bestaand.sleutel_prefix || '') },
    after: { prefix: sleutel.prefix },
  });
  const uitwisselPakket = maakUitwisselPakket({
    sleutelId: sleutel.id,
    prefix: sleutel.prefix,
    githubKoppeling: sleutel.githubKoppeling,
    mcpAgentSlug: sleutel.mcpAgentSlug,
    regelsVersie: lock.versie,
    verlooptOp: gen.verlooptOp,
  });
  return { sleutel, eenmaligeSleutel: gen.ruw, uitwisselCode: gen.uitwisselCode, uitwisselPakket };
}

export async function sleutelIntrekken(
  door: EigenaarRef,
  invoer: Record<string, unknown>,
): Promise<{ sleutel: BeheerSleutelUit }> {
  const id = String(invoer.id || '');
  if (!UUID.test(id)) throw new SleutelFout('NIET_GEVONDEN', 404);
  const reden = tekst(invoer.reden, 300);
  if (reden.length < 4) throw new SleutelFout('REDEN_TE_KORT', 400);
  const lock = await huidigeRegelsLock();
  const { rows } = await sys().query(
    `UPDATE app.uitrol_beheer_sleutels
        SET ingetrokken_op = now(),
            ingetrokken_reden = $2,
            bijgewerkt_op = now()
      WHERE id = $1 AND ingetrokken_op IS NULL
      RETURNING *`,
    [id, reden],
  );
  if (!rows[0]) throw new SleutelFout('NIET_GEVONDEN', 404);
  const sleutel = sleutelUit(rows[0], lock);
  await agentAudit({
    ownerId: door.id,
    actor: { id: door.id, email: door.email },
    action: 'uitrol.sleutel.ingetrokken',
    target: { type: 'beheersleutel', id: sleutel.id, label: sleutel.label },
    agent: sleutel.mcpAgentSlug || null,
    reason: reden,
    after: { status: 'ingetrokken' },
  });
  return { sleutel };
}

/** Зведений стан активного персонального ключа та 3-чинникової довіри для певного облікового запису чи агента. */
export async function actieveSleutelStand(userId: string, agentSlug?: string): Promise<BeheerSleutelUit | null> {
  const lock = await huidigeRegelsLock();
  try {
    const { rows } = await sys().query(
      `SELECT * FROM app.uitrol_beheer_sleutels
        WHERE ingetrokken_op IS NULL
          AND (user_id = $1 OR ($2 <> '' AND mcp_agent_slug = $2))
        ORDER BY (gesynchroniseerd_op IS NOT NULL) DESC, bijgewerkt_op DESC
        LIMIT 1`,
      [userId, tekst(agentSlug, 60)],
    );
    return rows[0] ? sleutelUit(rows[0], lock) : null;
  } catch {
    return null;
  }
}
