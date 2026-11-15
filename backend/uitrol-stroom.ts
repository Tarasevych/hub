// Розумний потік розгортання: інтелектуальні нотатки, контекстні контрольні списки та автоматичні докази перевірок (міграція 0282).
// Slimme uitrolstroom: intelligente notities, contextafhankelijke controlelijsten en automatisch bewijs van controles (migratie 0282).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool, poolUrl } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import {
  SHA256_RE,
  SLEUTEL_RE,
  STROOM_LIMIETEN,
  VERSIE_RE,
  analyseerUitrolStroom,
  berekenGereedheid,
  bewijsInhoudVoorHash,
  bouwBewijsRapportMarkdown,
  bouwContextControlelijst,
  kanoniekJson,
  schoonObjectVoorBewijs,
  zonderGeheimenUitrol,
  type BewijsSoort,
  type BewijsStatus,
  type ControlelijstGroep,
  type ControlelijstItem,
  type ControlelijstStatus,
  type StroomAnalyseInvoer,
  type StroomBewijs,
  type StroomNotitie,
  type StroomNotitieSoort,
  type StroomOverzicht,
  type StroomRisico,
  type StroomTaal,
  type StroomVersieKeuze,
  type VoorcontroleSamenvatting,
} from '../shared/uitrol-stroom';
import type { Manifest } from '../shared/uitrol-manifest';
import { telVereisten, type MigratieProefUitslag, type VereistenAntwoord } from '../shared/uitrol-vereisten';
import { releaseInfo } from './uitgave-info';

const RUIMTE = 'technisch' as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const sys = () => getPool('systeem');

export class StroomFout extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const fout = (code: string, status = 400): never => { throw new StroomFout(code, status); };

const iso = (v: unknown): string => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
};

const isOntbrekendeTabel = (err: unknown): boolean => {
  const code = String((err as { code?: unknown })?.code || '');
  return code === '42P01' || code === '42703';
};

/** Чи налаштована БД (дозволяє безболісно пропускати фонові автохуки в без-БД юніт-тестах). */
const dbBeschikbaar = (): boolean => Boolean(poolUrl('systeem'));

/** Знайти ID власника системи, коли автохук працює без контексту HTTP-сесії (наприклад, при синхронізації запусків root). */
async function vindEigenaarId(hintId?: string): Promise<string> {
  if (hintId && hintId.trim()) {
    const r = await sys().query(
      `SELECT id FROM app.records WHERE tbl = 'users' AND id = $1 AND data->>'role' = 'owner' LIMIT 1`,
      [hintId.trim()],
    ).catch(() => ({ rows: [] as Array<{ id: string }> }));
    if (r.rows[0]?.id) return String(r.rows[0].id);
  }
  const { rows } = await sys().query(
    `SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY id ASC LIMIT 1`,
  );
  return rows[0]?.id ? String(rows[0].id) : String(hintId || '');
}

// ------------------------------------------------------------------------------------------------ криптографія доказів
export function berekenBewijsHash(invoer: {
  versie: string;
  soort: BewijsSoort;
  bron: string;
  status: BewijsStatus;
  pakketSha256: string;
  bewijsData: Record<string, unknown>;
  vorigeHash: string;
}): string {
  const inhoud = bewijsInhoudVoorHash(invoer);
  return createHash('sha256').update(inhoud, 'utf8').digest('hex');
}

export function verifieerBewijsKeten(bewijzen: readonly StroomBewijs[]): {
  ok: boolean;
  aantal: number;
  fouten: string[];
  gemerkt: StroomBewijs[];
} {
  const fouten: string[] = [];
  const gemerkt: StroomBewijs[] = [];
  let vorigHash = '';

  for (let i = 0; i < bewijzen.length; i++) {
    const b = bewijzen[i];
    const verwacht = berekenBewijsHash({
      versie: b.versie,
      soort: b.soort,
      bron: b.bron,
      status: b.status,
      pakketSha256: b.pakketSha256,
      bewijsData: b.bewijsData,
      vorigeHash: b.vorigeHash,
    });
    const hashOk = b.bewijsHash === verwacht;
    const ketenOk = i === 0 ? true : b.vorigeHash === vorigHash;
    if (!hashOk) fouten.push(`HASH_ONGELDIG:${b.soort}:${b.id.slice(0, 8)}`);
    if (!ketenOk) fouten.push(`KETEN_GEBROKEN:${b.soort}:${b.id.slice(0, 8)}`);
    gemerkt.push({ ...b, integriteitOk: hashOk && ketenOk });
    vorigHash = b.bewijsHash;
  }

  return { ok: fouten.length === 0, aantal: bewijzen.length, fouten, gemerkt };
}

// ------------------------------------------------------------------------------------------------ маппери БД
const notitieUit = (r: Record<string, unknown>): StroomNotitie => ({
  id: String(r.id),
  versie: String(r.versie),
  voorstelId: r.voorstel_id ? String(r.voorstel_id) : null,
  runId: String(r.run_id || ''),
  soort: (String(r.soort || 'eigenaar') as StroomNotitieSoort),
  risico: (String(r.risico || 'normaal') as StroomRisico),
  titelUk: String(r.titel_uk || ''),
  titelNl: String(r.titel_nl || ''),
  inhoudUk: String(r.inhoud_uk || ''),
  inhoudNl: String(r.inhoud_nl || ''),
  onderdelen: Array.isArray(r.onderdelen) ? r.onderdelen.map((x) => String(x)) : [],
  vastgepind: Boolean(r.vastgepind),
  geschoond: Boolean(r.geschoond ?? true),
  auteur: String(r.auteur || ''),
  sleutel: r.sleutel ? String(r.sleutel) : null,
  aangemaaktOp: iso(r.aangemaakt_op),
  bijgewerktOp: iso(r.bijgewerkt_op),
});

const controleUit = (r: Record<string, unknown>): ControlelijstItem => ({
  id: String(r.id),
  versie: String(r.versie),
  voorstelId: r.voorstel_id ? String(r.voorstel_id) : null,
  runId: String(r.run_id || ''),
  sleutel: String(r.sleutel),
  groep: String(r.groep) as ControlelijstGroep,
  herkomst: String(r.herkomst) as ControlelijstItem['herkomst'],
  verplicht: Boolean(r.verplicht),
  handmatigBevestigen: Boolean(r.handmatig_bevestigen),
  titelUk: String(r.titel_uk || ''),
  titelNl: String(r.titel_nl || ''),
  toelichtingUk: String(r.toelichting_uk || ''),
  toelichtingNl: String(r.toelichting_nl || ''),
  status: String(r.status) as ControlelijstStatus,
  reden: String(r.reden || ''),
  bewijsSoort: String(r.bewijs_soort || ''),
  volgorde: Number(r.volgorde || 100),
  bijgewerktDoor: String(r.bijgewerkt_door || ''),
  aangemaaktOp: iso(r.aangemaakt_op),
  bijgewerktOp: iso(r.bijgewerkt_op),
});

const bewijsUit = (r: Record<string, unknown>): StroomBewijs => ({
  id: String(r.id),
  versie: String(r.versie),
  voorstelId: r.voorstel_id ? String(r.voorstel_id) : null,
  runId: String(r.run_id || ''),
  soort: String(r.soort) as BewijsSoort,
  bron: String(r.bron || ''),
  status: String(r.status) as BewijsStatus,
  samenvattingUk: String(r.samenvatting_uk || ''),
  samenvattingNl: String(r.samenvatting_nl || ''),
  pakketSha256: String(r.pakket_sha256 || ''),
  bewijsData: (r.bewijs_data && typeof r.bewijs_data === 'object' ? r.bewijs_data : {}) as Record<string, unknown>,
  bewijsHash: String(r.bewijs_hash),
  vorigeHash: String(r.vorige_hash || ''),
  geschoond: Boolean(r.geschoond ?? true),
  aangemaaktOp: iso(r.aangemaakt_op),
});

// ------------------------------------------------------------------------------------------------ запис доказів (повторостійкий ланцюжок)
export async function bewijsToevoegen(
  userId: string,
  invoer: {
    versie: string;
    voorstelId?: string | null;
    runId?: string;
    soort: BewijsSoort;
    bron: string;
    status: BewijsStatus;
    samenvattingUk: string;
    samenvattingNl: string;
    pakketSha256?: string;
    bewijsData?: Record<string, unknown>;
  },
): Promise<StroomBewijs> {
  if (!VERSIE_RE.test(invoer.versie)) fout('STROOM_VERSIE_ONGELDIG', 400);
  const sha = SHA256_RE.test(String(invoer.pakketSha256 || '').toLowerCase()) ? String(invoer.pakketSha256).toLowerCase() : '';
  const bron = zonderGeheimenUitrol(invoer.bron, 80) || 'systeem';
  const sumUk = zonderGeheimenUitrol(invoer.samenvattingUk, 1000) || invoer.soort;
  const sumNl = zonderGeheimenUitrol(invoer.samenvattingNl, 1000) || invoer.soort;
  const geschoondeData = (schoonObjectVoorBewijs(invoer.bewijsData || {}) || {}) as Record<string, unknown>;
  const voorstelId = invoer.voorstelId && UUID_RE.test(invoer.voorstelId) ? invoer.voorstelId : null;
  const runId = zonderGeheimenUitrol(invoer.runId || '', 80);

  // Перевіряємо останній доказ того ж виду, щоб не плодити ідентичних записів при повторних опитуваннях
  const laatsteVanSoort = await sys().query(
    `SELECT * FROM app.uitrol_stroom_bewijzen
      WHERE user_id = $1 AND ruimte = $2 AND versie = $3 AND soort = $4
      ORDER BY aangemaakt_op DESC, id DESC LIMIT 1`,
    [userId, RUIMTE, invoer.versie, invoer.soort],
  );
  if (laatsteVanSoort.rows[0]) {
    const bestaand = bewijsUit(laatsteVanSoort.rows[0]);
    if (
      bestaand.status === invoer.status
      && bestaand.pakketSha256 === sha
      && bestaand.bron === bron
      && bestaand.samenvattingUk === sumUk
      && bestaand.samenvattingNl === sumNl
      && kanoniekJson(bestaand.bewijsData) === kanoniekJson(geschoondeData)
    ) {
      return bestaand;
    }
  }

  // Попередній доказ у загальному ланцюзі цієї версії
  const laatsteInKeten = await sys().query(
    `SELECT bewijs_hash FROM app.uitrol_stroom_bewijzen
      WHERE user_id = $1 AND ruimte = $2 AND versie = $3
      ORDER BY aangemaakt_op DESC, id DESC LIMIT 1`,
    [userId, RUIMTE, invoer.versie],
  );
  const vorigeHash = String(laatsteInKeten.rows[0]?.bewijs_hash || '');
  const bewijsHash = berekenBewijsHash({
    versie: invoer.versie,
    soort: invoer.soort,
    bron,
    status: invoer.status,
    pakketSha256: sha,
    bewijsData: geschoondeData,
    vorigeHash,
  });

  const ins = await sys().query(
    `INSERT INTO app.uitrol_stroom_bewijzen
       (user_id, ruimte, versie, voorstel_id, run_id, soort, bron, status, samenvatting_uk, samenvatting_nl, pakket_sha256, bewijs_data, bewijs_hash, vorige_hash, geschoond)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, true)
     ON CONFLICT (user_id, ruimte, versie, soort, bewijs_hash) DO NOTHING
     RETURNING *`,
    [userId, RUIMTE, invoer.versie, voorstelId, runId, invoer.soort, bron, invoer.status, sumUk, sumNl, sha, JSON.stringify(geschoondeData), bewijsHash, vorigeHash],
  );

  if (ins.rows[0]) return bewijsUit(ins.rows[0]);
  const opnieuw = await sys().query(
    `SELECT * FROM app.uitrol_stroom_bewijzen
      WHERE user_id = $1 AND ruimte = $2 AND versie = $3 AND soort = $4 AND bewijs_hash = $5
      LIMIT 1`,
    [userId, RUIMTE, invoer.versie, invoer.soort, bewijsHash],
  );
  return bewijsUit(opnieuw.rows[0]);
}

// ------------------------------------------------------------------------------------------------ збір фактів і синхронізація
async function leesLokaleDiagnose(): Promise<{
  gezond: boolean;
  problemenAantal: number;
  vrijMB: number | null;
  pathActief: boolean | null;
  tijd: string;
} | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(statusDir(), 'diagnose.json'), 'utf8')) as {
      tijd?: string;
      gezond?: boolean;
      problemen?: unknown[];
      eenheden?: Record<string, { actief?: string }>;
      schijf?: Record<string, { vrijMB?: number }>;
    };
    const vrij = raw.schijf ? Math.min(...Object.values(raw.schijf).map((s) => Number(s.vrijMB ?? 0)).filter(Number.isFinite)) : null;
    const pathActief = raw.eenheden?.['mijn-ruimte-goedkeuring.path']?.actief
      ? raw.eenheden['mijn-ruimte-goedkeuring.path'].actief === 'active'
      : null;
    return {
      gezond: Boolean(raw.gezond),
      problemenAantal: Array.isArray(raw.problemen) ? raw.problemen.length : 0,
      vrijMB: vrij !== null && Number.isFinite(vrij) ? vrij : null,
      pathActief,
      tijd: String(raw.tijd || ''),
    };
  } catch {
    return null;
  }
}

async function leesVoorstelVoorVersie(versie: string): Promise<Record<string, unknown> | null> {
  const { rows } = await sys().query(
    `SELECT * FROM app.uitrol_voorstellen WHERE versie = $1 ORDER BY aangemaakt_op DESC LIMIT 1`,
    [versie],
  );
  return rows[0] || null;
}

async function leesRunVoorVersie(versie: string): Promise<Record<string, unknown> | null> {
  const { rows } = await sys().query(
    `SELECT * FROM app.uitrol_runs WHERE versie = $1 ORDER BY gestart_op DESC LIMIT 1`,
    [versie],
  );
  return rows[0] || null;
}

function voorstelBewijzenAfleiden(
  v: Record<string, unknown>,
  opties?: { ookGoedkeuring?: boolean },
): Array<Parameters<typeof bewijsToevoegen>[1]> {
  const uit: Array<Parameters<typeof bewijsToevoegen>[1]> = [];
  const versie = String(v.versie || '');
  if (!VERSIE_RE.test(versie)) return uit;
  const voorstelId = String(v.id);
  const sha = SHA256_RE.test(String(v.sha256 || '').toLowerCase()) ? String(v.sha256).toLowerCase() : '';
  const vc = (v.voorcontrole && typeof v.voorcontrole === 'object' ? v.voorcontrole : null) as VoorcontroleSamenvatting | null;
  const meta = (v.pakket_meta && typeof v.pakket_meta === 'object' ? v.pakket_meta : {}) as Record<string, unknown>;
  const tests = (v.tests && typeof v.tests === 'object' ? v.tests : null) as { geslaagd?: number | null; mislukt?: number | null; samenvatting?: string } | null;

  if (sha) {
    uit.push({
      versie,
      voorstelId,
      soort: 'pakket-integriteit',
      bron: 'uitrol-voorstellen',
      status: v.status === 'afgebroken' && String(v.uitkomst_code || '') === 'SHA256_VERSCHILT' ? 'mislukt' : 'geslaagd',
      samenvattingUk: `Пакет ${versie} (${Number(v.bytes || 0)} байт), SHA-256 ${sha.slice(0, 12)}…, фіксація змін ${String(v.bron_commit || meta.commit || '—').slice(0, 12)}.`,
      samenvattingNl: `Pakket ${versie} (${Number(v.bytes || 0)} bytes), SHA-256 ${sha.slice(0, 12)}…, commit ${String(v.bron_commit || meta.commit || '—').slice(0, 12)}.`,
      pakketSha256: sha,
      bewijsData: {
        bytes: Number(v.bytes || 0),
        commit: String(v.bron_commit || meta.commit || ''),
        voorbereider: String(v.voorbereider_label || ''),
        bestanden: Number(meta.bestanden || 0),
      },
    });
  }

  if (vc && Array.isArray(vc.controles)) {
    const vcStatus: BewijsStatus = !vc.ok || vc.fouten > 0 ? 'mislukt' : vc.waarschuwingen > 0 ? 'waarschuwing' : 'geslaagd';
    uit.push({
      versie,
      voorstelId,
      soort: 'voorcontrole',
      bron: 'uitrol-voorcontrole',
      status: vcStatus,
      samenvattingUk: `Попередня перевірка: ${vc.ok ? 'пройдено' : 'помилки'} (помилок: ${vc.fouten}, попереджень: ${vc.waarschuwingen}, пунктів: ${vc.controles.length}).`,
      samenvattingNl: `Voorcontrole: ${vc.ok ? 'geslaagd' : 'mislukt'} (fouten: ${vc.fouten}, waarschuwingen: ${vc.waarschuwingen}, controles: ${vc.controles.length}).`,
      pakketSha256: sha,
      bewijsData: {
        ok: vc.ok,
        fouten: vc.fouten,
        waarschuwingen: vc.waarschuwingen,
        controles: vc.controles.map((c) => ({ id: c.id, niveau: c.niveau })),
      },
    });

    const archC = vc.controles.find((c) => c.id === 'ontwikkelarchief' || c.id === 'github');
    if (archC) {
      uit.push({
        versie,
        voorstelId,
        soort: 'ontwikkelarchief',
        bron: 'uitrol-ontwikkelarchief',
        status: archC.niveau === 'ok' ? 'geslaagd' : archC.niveau === 'waarschuwing' ? 'waarschuwing' : 'mislukt',
        samenvattingUk: archC.uk,
        samenvattingNl: archC.nl,
        pakketSha256: sha,
        bewijsData: { controleId: archC.id, niveau: archC.niveau, details: archC.details || [] },
      });
    }

    const testC = vc.controles.find((c) => c.id === 'tests');
    if (testC || tests) {
      const tStatus: BewijsStatus = tests?.mislukt && tests.mislukt > 0
        ? 'waarschuwing'
        : testC?.niveau === 'ok'
          ? 'geslaagd'
          : testC?.niveau === 'fout'
            ? 'mislukt'
            : 'waarschuwing';
      uit.push({
        versie,
        voorstelId,
        soort: 'testresultaten',
        bron: 'uitrol-voorcontrole',
        status: tStatus,
        samenvattingUk: testC?.uk || `Тести: пройдено ${tests?.geslaagd ?? '—'}, не пройдено ${tests?.mislukt ?? '—'}.`,
        samenvattingNl: testC?.nl || `Tests: ${tests?.geslaagd ?? '—'} geslaagd, ${tests?.mislukt ?? '—'} mislukt.`,
        pakketSha256: sha,
        bewijsData: {
          geslaagd: tests?.geslaagd ?? null,
          mislukt: tests?.mislukt ?? null,
          samenvatting: tests?.samenvatting || '',
        },
      });
    }
  }

  if ((opties?.ookGoedkeuring || v.status === 'goedgekeurd' || v.status === 'geinstalleerd') && v.beslist_door) {
    uit.push({
      versie,
      voorstelId,
      soort: 'goedkeuring-passkey',
      bron: 'uitrol-goedkeuring',
      status: 'geslaagd',
      samenvattingUk: `Схвалено власником (${String(v.beslist_door)}) через passkey.`,
      samenvattingNl: `Goedgekeurd door de eigenaar (${String(v.beslist_door)}) met passkey.`,
      pakketSha256: sha,
      bewijsData: {
        beslistDoor: String(v.beslist_door),
        beslistOp: iso(v.beslist_op),
        voorstelStatus: String(v.status),
      },
    });
  }

  return uit;
}

function runBewijsAfleiden(r: Record<string, unknown>, voorstelId: string | null): Parameters<typeof bewijsToevoegen>[1] | null {
  const versie = String(r.versie || '');
  if (!VERSIE_RE.test(versie)) return null;
  const staat = String(r.staat || '');
  if (staat === 'bezig') return null; // фіксуємо доказ, коли запуск завершений або відмовлений
  const status: BewijsStatus = staat === 'klaar' ? 'geslaagd' : staat === 'afgebroken' ? 'waarschuwing' : 'mislukt';
  const pakketSha = SHA256_RE.test(String(r.pakket_sha256 || r.sha256 || '').toLowerCase())
    ? String(r.pakket_sha256 || r.sha256).toLowerCase()
    : '';
  return {
    versie,
    voorstelId,
    runId: String(r.id),
    soort: 'installatie-uitvoering',
    bron: 'uitrol-runs',
    status,
    samenvattingUk: String(r.uk || `Запуск ${String(r.id)} (${String(r.methode)}) завершився зі станом «${staat}», код: ${String(r.code || '—')}.`),
    samenvattingNl: String(r.nl || `Run ${String(r.id)} (${String(r.methode)}) eindigde met status «${staat}», code: ${String(r.code || '—')}.`),
    pakketSha256: pakketSha,
    bewijsData: {
      runId: String(r.id),
      methode: String(r.methode || ''),
      staat,
      stap: String(r.stap || ''),
      pct: Number(r.pct || 0),
      code: String(r.code || ''),
      pakketSha256: pakketSha,
      geleverdSha256: String(r.pakket_geleverd_sha256 || ''),
      gestartOp: iso(r.gestart_op),
      geeindigdOp: iso(r.geeindigd_op),
    },
  };
}

/** Синхронізує авто-нотатку, контекстний контрольний список та повертає актуальне зведення потоку для версії. */
async function synchroniseerEnBouwOverzicht(
  userId: string,
  versie: string,
  eigenaarNaam = '',
  opties?: { verzamelDiagnose?: boolean },
): Promise<StroomOverzicht> {
  if (!VERSIE_RE.test(versie)) fout('STROOM_VERSIE_ONGELDIG', 400);

  const [voorstel, run, diag] = await Promise.all([
    leesVoorstelVoorVersie(versie),
    leesRunVoorVersie(versie),
    leesLokaleDiagnose(),
  ]);

  const voorstelId = voorstel ? String(voorstel.id) : null;
  const runId = run ? String(run.id) : '';

  if (voorstel) {
    for (const b of voorstelBewijzenAfleiden(voorstel)) {
      await bewijsToevoegen(userId, b);
    }
  }
  if (run) {
    const rb = runBewijsAfleiden(run, voorstelId);
    if (rb) await bewijsToevoegen(userId, rb);
  }
  if (opties?.verzamelDiagnose && diag) {
    await bewijsToevoegen(userId, {
      versie,
      voorstelId,
      runId,
      soort: 'server-diagnose',
      bron: 'diagnose.json',
      status: diag.gezond && diag.problemenAantal === 0 && (diag.vrijMB ?? 1024) >= 800 ? 'geslaagd' : 'waarschuwing',
      samenvattingUk: `Сервер: ${diag.gezond ? 'справний' : 'є зауваження'}, проблем: ${diag.problemenAantal}, вільно на диску: ${diag.vrijMB ?? '—'} МБ.`,
      samenvattingNl: `Server: ${diag.gezond ? 'gezond' : 'opmerkingen'}, problemen: ${diag.problemenAantal}, vrij op schijf: ${diag.vrijMB ?? '—'} MB.`,
      pakketSha256: String(voorstel?.sha256 || run?.pakket_sha256 || ''),
      bewijsData: diag,
    });
  }

  // Читаємо поточні докази версії
  const bewRows = (await sys().query(
    `SELECT * FROM app.uitrol_stroom_bewijzen
      WHERE user_id = $1 AND ruimte = $2 AND versie = $3
      ORDER BY aangemaakt_op ASC, id ASC LIMIT $4`,
    [userId, RUIMTE, versie, STROOM_LIMIETEN.maxBewijzen],
  )).rows;
  const bewijzenRaw = bewRows.map(bewijsUit);
  const keten = verifieerBewijsKeten(bewijzenRaw);

  const meta = (voorstel?.pakket_meta && typeof voorstel.pakket_meta === 'object' ? voorstel.pakket_meta : {}) as Record<string, unknown>;
  const vc = (voorstel?.voorcontrole && typeof voorstel.voorcontrole === 'object' ? voorstel.voorcontrole : null) as VoorcontroleSamenvatting | null;
  const tests = (voorstel?.tests && typeof voorstel.tests === 'object' ? voorstel.tests : null) as StroomAnalyseInvoer['tests'];
  const actieveVersie = releaseInfo().versie || null;

  const analyseInvoer: StroomAnalyseInvoer = {
    versie,
    actieveVersie,
    commit: String(voorstel?.bron_commit || meta.commit || run?.bron_commit || ''),
    voorbereider: String(voorstel?.voorbereider_label || run?.voorbereider || ''),
    eigenaarNaam,
    wijzigingen: String(voorstel?.wijzigingen || run?.wijzigingen || ''),
    diffSamenvatting: String(voorstel?.diff_samenvatting || ''),
    manifest: (meta.manifest && typeof meta.manifest === 'object' ? meta.manifest : null) as Manifest | null,
    tests,
    voorstelStatus: voorstel ? String(voorstel.status) : null,
    voorstelSha256: voorstel ? String(voorstel.sha256) : null,
    voorstelBytes: voorstel ? Number(voorstel.bytes) : null,
    voorcontrole: vc,
    run: run
      ? {
          id: String(run.id),
          staat: String(run.staat),
          methode: String(run.methode),
          code: String(run.code || ''),
          uk: String(run.uk || ''),
          nl: String(run.nl || ''),
          pakketSha256: String(run.pakket_sha256 || ''),
          pakketGeleverdSha256: String(run.pakket_geleverd_sha256 || ''),
        }
      : null,
    diagnose: diag,
    bewijzen: keten.gemerkt,
  };

  const duiding = analyseerUitrolStroom(analyseInvoer);

  // Оновлюємо (або створюємо) автоматичну нотатку 'auto-duiding' для цієї версії — власні нотатки залишаються недоторканими
  await sys().query(
    `INSERT INTO app.uitrol_stroom_notities
       (user_id, ruimte, versie, voorstel_id, run_id, soort, risico, titel_uk, titel_nl, inhoud_uk, inhoud_nl, onderdelen, vastgepind, geschoond, auteur, sleutel)
     VALUES ($1, $2, $3, $4, $5, 'ai-duiding', $6, $7, $8, $9, $10, $11::jsonb, false, true, 'systeem', 'auto-duiding')
     ON CONFLICT (user_id, ruimte, versie, sleutel) WHERE sleutel IS NOT NULL DO UPDATE
       SET voorstel_id = COALESCE(EXCLUDED.voorstel_id, app.uitrol_stroom_notities.voorstel_id),
           run_id = CASE WHEN EXCLUDED.run_id <> '' THEN EXCLUDED.run_id ELSE app.uitrol_stroom_notities.run_id END,
           risico = EXCLUDED.risico,
           titel_uk = EXCLUDED.titel_uk,
           titel_nl = EXCLUDED.titel_nl,
           inhoud_uk = EXCLUDED.inhoud_uk,
           inhoud_nl = EXCLUDED.inhoud_nl,
           onderdelen = EXCLUDED.onderdelen,
           bijgewerkt_op = now()`,
    [
      userId,
      RUIMTE,
      versie,
      voorstelId,
      runId,
      duiding.risico,
      duiding.titelUk.slice(0, STROOM_LIMIETEN.maxTitel),
      duiding.titelNl.slice(0, STROOM_LIMIETEN.maxTitel),
      zonderGeheimenUitrol(`${duiding.samenvattingUk}\n\n${duiding.aanbevelingenUk.map((x) => `• ${x}`).join('\n')}`, STROOM_LIMIETEN.maxInhoud),
      zonderGeheimenUitrol(`${duiding.samenvattingNl}\n\n${duiding.aanbevelingenNl.map((x) => `• ${x}`).join('\n')}`, STROOM_LIMIETEN.maxInhoud),
      JSON.stringify(duiding.gebieden),
    ],
  );

  // Синхронізуємо контекстний контрольний список:
  // пункти з handmatigBevestigen=true чи herkomst='eigenaar' НІКОЛИ не перезаписують свій статус автоматично!
  const sjablonen = bouwContextControlelijst(analyseInvoer);
  for (const s of sjablonen) {
    await sys().query(
      `INSERT INTO app.uitrol_stroom_controlelijsten
         (user_id, ruimte, versie, voorstel_id, run_id, sleutel, groep, herkomst, verplicht, handmatig_bevestigen, titel_uk, titel_nl, toelichting_uk, toelichting_nl, status, bewijs_soort, volgorde)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (user_id, ruimte, versie, sleutel) DO UPDATE
         SET voorstel_id = COALESCE(EXCLUDED.voorstel_id, app.uitrol_stroom_controlelijsten.voorstel_id),
             run_id = CASE WHEN EXCLUDED.run_id <> '' THEN EXCLUDED.run_id ELSE app.uitrol_stroom_controlelijsten.run_id END,
             verplicht = EXCLUDED.verplicht,
             titel_uk = EXCLUDED.titel_uk,
             titel_nl = EXCLUDED.titel_nl,
             toelichting_uk = EXCLUDED.toelichting_uk,
             toelichting_nl = EXCLUDED.toelichting_nl,
             status = CASE
               WHEN app.uitrol_stroom_controlelijsten.handmatig_bevestigen = true THEN app.uitrol_stroom_controlelijsten.status
               WHEN app.uitrol_stroom_controlelijsten.status = 'overgeslagen' AND app.uitrol_stroom_controlelijsten.reden <> '' THEN app.uitrol_stroom_controlelijsten.status
               ELSE EXCLUDED.status
             END,
             volgorde = EXCLUDED.volgorde,
             bijgewerkt_op = CASE
               WHEN app.uitrol_stroom_controlelijsten.handmatig_bevestigen = true THEN app.uitrol_stroom_controlelijsten.bijgewerkt_op
               ELSE now()
             END`,
      [
        userId,
        RUIMTE,
        versie,
        voorstelId,
        runId,
        s.sleutel,
        s.groep,
        s.herkomst,
        s.verplicht,
        s.handmatigBevestigen,
        s.titelUk.slice(0, STROOM_LIMIETEN.maxTitel),
        s.titelNl.slice(0, STROOM_LIMIETEN.maxTitel),
        s.toelichtingUk.slice(0, STROOM_LIMIETEN.maxToelichting),
        s.toelichtingNl.slice(0, STROOM_LIMIETEN.maxToelichting),
        s.status,
        s.bewijsSoort,
        s.volgorde,
      ],
    );
  }

  const [notitieRows, controleRows, versies] = await Promise.all([
    sys().query(
      `SELECT * FROM app.uitrol_stroom_notities
        WHERE user_id = $1 AND ruimte = $2 AND versie = $3
        ORDER BY vastgepind DESC, (soort = 'eigenaar') DESC, bijgewerkt_op DESC LIMIT $4`,
      [userId, RUIMTE, versie, STROOM_LIMIETEN.maxNotities],
    ),
    sys().query(
      `SELECT * FROM app.uitrol_stroom_controlelijsten
        WHERE user_id = $1 AND ruimte = $2 AND versie = $3
        ORDER BY volgorde ASC, aangemaakt_op ASC LIMIT $4`,
      [userId, RUIMTE, versie, STROOM_LIMIETEN.maxControleItems],
    ),
    lijstBekendeVersies(userId, actieveVersie),
  ]);

  const notities = notitieRows.rows.map(notitieUit);
  const controlelijst = controleRows.rows.map(controleUit);
  const gereedheid = berekenGereedheid(controlelijst);

  return {
    versie,
    ruimte: RUIMTE,
    actieveVersie,
    voorstel: voorstel
      ? {
          id: String(voorstel.id),
          status: String(voorstel.status),
          sha256: String(voorstel.sha256 || ''),
          bytes: Number(voorstel.bytes || 0),
          voorbereider: String(voorstel.voorbereider_label || ''),
          commit: String(voorstel.bron_commit || ''),
          aangemaaktOp: iso(voorstel.aangemaakt_op),
          ...(voorstel.beslist_op ? { beslistOp: iso(voorstel.beslist_op) } : {}),
          ...(voorstel.beslist_door ? { beslistDoor: String(voorstel.beslist_door) } : {}),
        }
      : null,
    run: run
      ? {
          id: String(run.id),
          staat: String(run.staat),
          methode: String(run.methode),
          stap: String(run.stap || ''),
          pct: Number(run.pct || 0),
          code: String(run.code || ''),
          gestartOp: iso(run.gestart_op),
          ...(run.geeindigd_op ? { geeindigdOp: iso(run.geeindigd_op) } : {}),
          ...(run.pakket_sha256 ? { pakketSha256: String(run.pakket_sha256) } : {}),
        }
      : null,
    duiding,
    notities,
    controlelijst,
    gereedheid,
    bewijzen: keten.gemerkt,
    ketenIntegriteit: { ok: keten.ok, aantal: keten.aantal, fouten: keten.fouten },
    versies,
  };
}

async function lijstBekendeVersies(userId: string, actieveVersie: string | null): Promise<StroomVersieKeuze[]> {
  const kaart = new Map<string, StroomVersieKeuze>();
  const [voorst, runs, eigen] = await Promise.all([
    sys().query(`SELECT id, versie, status, aangemaakt_op FROM app.uitrol_voorstellen WHERE versie ~ '^[0-9]{8}-[0-9]{6}$' ORDER BY aangemaakt_op DESC LIMIT 20`),
    sys().query(`SELECT id, versie, staat, gestart_op FROM app.uitrol_runs WHERE versie ~ '^[0-9]{8}-[0-9]{6}$' ORDER BY gestart_op DESC LIMIT 20`),
    sys().query(
      `SELECT versie, max(aangemaakt_op) AS tijd FROM app.uitrol_stroom_bewijzen
        WHERE user_id = $1 AND ruimte = $2
        GROUP BY versie ORDER BY tijd DESC LIMIT 15`,
      [userId, RUIMTE],
    ),
  ]);

  for (const r of voorst.rows) {
    const v = String(r.versie);
    if (!kaart.has(v)) {
      kaart.set(v, {
        versie: v,
        bron: 'voorstel',
        status: String(r.status),
        tijd: iso(r.aangemaakt_op),
        isActief: v === actieveVersie,
        voorstelId: String(r.id),
      });
    }
  }
  for (const r of runs.rows) {
    const v = String(r.versie);
    const ex = kaart.get(v);
    if (!ex) {
      kaart.set(v, {
        versie: v,
        bron: 'run',
        status: String(r.staat),
        tijd: iso(r.gestart_op),
        isActief: v === actieveVersie,
        runId: String(r.id),
      });
    } else if (!ex.runId) {
      ex.runId = String(r.id);
    }
  }
  for (const r of eigen.rows) {
    const v = String(r.versie);
    if (!kaart.has(v)) {
      kaart.set(v, { versie: v, bron: 'stroom', status: 'bewaard', tijd: iso(r.tijd), isActief: v === actieveVersie });
    }
  }
  if (actieveVersie && VERSIE_RE.test(actieveVersie) && !kaart.has(actieveVersie)) {
    kaart.set(actieveVersie, { versie: actieveVersie, bron: 'actief', status: 'actief', tijd: '', isActief: true });
  }
  return [...kaart.values()].sort((a, b) => b.versie.localeCompare(a.versie)).slice(0, 30);
}

async function bepaalStandaardVersie(userId: string, gevraagde?: unknown): Promise<string> {
  if (gevraagde !== undefined && gevraagde !== null && String(gevraagde).trim() !== '') {
    const v = String(gevraagde).trim();
    if (!VERSIE_RE.test(v)) fout('STROOM_VERSIE_ONGELDIG', 400);
    return v;
  }
  const wacht = await sys().query(
    `SELECT versie FROM app.uitrol_voorstellen
      WHERE status IN ('wacht-op-goedkeuring', 'goedgekeurd') AND versie ~ '^[0-9]{8}-[0-9]{6}$'
      ORDER BY aangemaakt_op DESC LIMIT 1`,
  );
  if (wacht.rows[0]?.versie) return String(wacht.rows[0].versie);

  const bezig = await sys().query(
    `SELECT versie FROM app.uitrol_runs WHERE staat = 'bezig' AND versie ~ '^[0-9]{8}-[0-9]{6}$' ORDER BY gestart_op DESC LIMIT 1`,
  );
  if (bezig.rows[0]?.versie) return String(bezig.rows[0].versie);

  const act = releaseInfo().versie;
  if (act && VERSIE_RE.test(act)) return act;

  const laatst = await sys().query(
    `SELECT versie FROM app.uitrol_runs WHERE versie ~ '^[0-9]{8}-[0-9]{6}$' ORDER BY gestart_op DESC LIMIT 1`,
  );
  if (laatst.rows[0]?.versie) return String(laatst.rows[0].versie);

  const vLaatst = await sys().query(
    `SELECT versie FROM app.uitrol_voorstellen WHERE versie ~ '^[0-9]{8}-[0-9]{6}$' ORDER BY aangemaakt_op DESC LIMIT 1`,
  );
  if (vLaatst.rows[0]?.versie) return String(vLaatst.rows[0].versie);

  const eigen = await sys().query(
    `SELECT versie FROM app.uitrol_stroom_notities WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 1`,
    [userId, RUIMTE],
  );
  if (eigen.rows[0]?.versie) return String(eigen.rows[0].versie);

  // Поточна мітка часу як безпечна запасна версія, якщо система абсолютно чиста
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
}

// ------------------------------------------------------------------------------------------------ асинхронні автоперехоплювачі для життєвого циклу
/** Автоматичний запис доказу попередньої перевірки вимог (з uitrol-vereisten.ts). */
export async function stroomVastleggenVanVereisten(
  userId: string,
  antwoord: VereistenAntwoord,
  archiefInfo: { versie: string; sha256?: string; commit?: string; voorbereider?: string },
): Promise<void> {
  if (!dbBeschikbaar() || !VERSIE_RE.test(archiefInfo.versie)) return;
  try {
    const t = telVereisten(antwoord.vereisten);
    const status: BewijsStatus = t.fout > 0 ? 'mislukt' : t.waarschuwing > 0 ? 'waarschuwing' : 'geslaagd';
    await bewijsToevoegen(userId, {
      versie: archiefInfo.versie,
      soort: 'vereisten-preflight',
      bron: 'uitrol-vereisten',
      status,
      samenvattingUk: `Передзавантажувальна перевірка вимог: пройдено ${t.ok}, попереджень ${t.waarschuwing}, помилок ${t.fout}.`,
      samenvattingNl: `Vereistencontrole vóór upload: ${t.ok} geslaagd, ${t.waarschuwing} waarschuwingen, ${t.fout} fouten.`,
      pakketSha256: archiefInfo.sha256 || '',
      bewijsData: {
        preflightId: antwoord.id,
        tellingen: t,
        nieuweMigraties: antwoord.nieuweMigraties,
        commit: archiefInfo.commit || '',
        vereisten: antwoord.vereisten.map((v) => ({ id: v.id, groep: v.groep, niveau: v.niveau })),
      },
    });
    if (SHA256_RE.test(String(archiefInfo.sha256 || '').toLowerCase())) {
      await bewijsToevoegen(userId, {
        versie: archiefInfo.versie,
        soort: 'pakket-integriteit',
        bron: 'uitrol-vereisten',
        status: antwoord.vereisten.some((v) => v.id === 'structuur' && v.niveau === 'fout') ? 'mislukt' : 'geslaagd',
        samenvattingUk: `Локально пораховано SHA-256 архіву ${archiefInfo.versie}: ${String(archiefInfo.sha256).slice(0, 12)}….`,
        samenvattingNl: `Lokale SHA-256 van archief ${archiefInfo.versie} berekend: ${String(archiefInfo.sha256).slice(0, 12)}….`,
        pakketSha256: archiefInfo.sha256 || '',
        bewijsData: { commit: archiefInfo.commit || '', voorbereider: archiefInfo.voorbereider || '' },
      });
    }
    await synchroniseerEnBouwOverzicht(userId, archiefInfo.versie);
  } catch (err) {
    if (!isOntbrekendeTabel(err)) console.error('[uitrol-stroom] vereisten-hook:', (err as Error).message);
  }
}

/** Автоматичний запис доказу проби SQL-міграцій на копії схеми (з uitrol-vereisten.ts). */
export async function stroomVastleggenVanProef(
  userId: string,
  versie: string,
  uitslag: MigratieProefUitslag,
  sha256: string,
  sqlVingerafdrukken?: Array<{ naam: string; sha256: string; bytes: number }>,
): Promise<void> {
  if (!dbBeschikbaar() || !VERSIE_RE.test(versie)) return;
  try {
    const status: BewijsStatus = uitslag.ok ? 'geslaagd' : uitslag.status === 'niet-beschikbaar' ? 'waarschuwing' : 'mislukt';
    await bewijsToevoegen(userId, {
      versie,
      soort: 'migratie-proef',
      bron: 'uitrol-vereisten-proef',
      status,
      samenvattingUk: uitslag.ok
        ? `Проба міграцій (${uitslag.migraties.length}) на копії схеми пройдена успішно.`
        : `Проба міграцій завершилася зі статусом «${uitslag.status}» (${uitslag.code || 'без коду'}).`,
      samenvattingNl: uitslag.ok
        ? `Migratieproef (${uitslag.migraties.length}) op een kopie van het schema geslaagd.`
        : `Migratieproef eindigde met status «${uitslag.status}» (${uitslag.code || 'geen code'}).`,
      pakketSha256: sha256,
      bewijsData: {
        proefId: uitslag.id,
        status: uitslag.status,
        code: uitslag.code || '',
        migraties: uitslag.migraties.map((m) => ({
          naam: m.naam,
          ok: m.ok,
          ms: m.ms,
          sqlSha256: sqlVingerafdrukken?.find((x) => x.naam === m.naam)?.sha256 || '',
        })),
      },
    });
    await synchroniseerEnBouwOverzicht(userId, versie);
  } catch (err) {
    if (!isOntbrekendeTabel(err)) console.error('[uitrol-stroom] proef-hook:', (err as Error).message);
  }
}

/** Автоматичний запис доказів при готовності / відхиленні / схваленні пропозиції (з uitrol-goedkeuring.ts). */
export async function stroomVastleggenVanVoorstel(
  voorstelId: string,
  gebeurtenis: 'klaar' | 'voorcontrole-mislukt' | 'goedgekeurd' | 'afgewezen',
  eigenaarIdHint?: string,
): Promise<void> {
  if (!dbBeschikbaar() || !UUID_RE.test(voorstelId)) return;
  try {
    const { rows } = await sys().query(`SELECT * FROM app.uitrol_voorstellen WHERE id = $1`, [voorstelId]);
    const v = rows[0];
    if (!v || !VERSIE_RE.test(String(v.versie || ''))) return;
    const eigenaarId = await vindEigenaarId(eigenaarIdHint || String(v.account_id || ''));
    if (!eigenaarId) return;
    for (const b of voorstelBewijzenAfleiden(v, { ookGoedkeuring: gebeurtenis === 'goedgekeurd' })) {
      await bewijsToevoegen(eigenaarId, b);
    }
    await synchroniseerEnBouwOverzicht(eigenaarId, String(v.versie));
  } catch (err) {
    if (!isOntbrekendeTabel(err)) console.error('[uitrol-stroom] voorstel-hook:', (err as Error).message);
  }
}

/** Автоматичний запис доказу запуску root (з uitrol-runs.ts). */
export async function stroomVastleggenVanRun(runId: string): Promise<void> {
  if (!dbBeschikbaar() || !runId) return;
  try {
    const { rows } = await sys().query(`SELECT * FROM app.uitrol_runs WHERE id = $1`, [runId]);
    const r = rows[0];
    if (!r || !VERSIE_RE.test(String(r.versie || ''))) return;
    const eigenaarId = await vindEigenaarId();
    if (!eigenaarId) return;
    const b = runBewijsAfleiden(r, r.voorstel_id ? String(r.voorstel_id) : null);
    if (!b) return;
    await bewijsToevoegen(eigenaarId, b);
    await synchroniseerEnBouwOverzicht(eigenaarId, String(r.versie));
  } catch (err) {
    if (!isOntbrekendeTabel(err)) console.error('[uitrol-stroom] run-hook:', (err as Error).message);
  }
}

/** Автоматичний запис доказів отримання випуску з GitHub або зашифрованого архівування в Telegram. */
export async function stroomVastleggenVanExternBewijs(
  eigenaarIdHint: string,
  invoer: {
    versie: string;
    voorstelId?: string | null;
    runId?: string;
    soort: 'telegram-archief' | 'github-ontvangst';
    bron: string;
    status: BewijsStatus;
    samenvattingUk: string;
    samenvattingNl: string;
    pakketSha256?: string;
    bewijsData?: Record<string, unknown>;
  },
): Promise<void> {
  if (!dbBeschikbaar() || !VERSIE_RE.test(invoer.versie)) return;
  try {
    const eigenaarId = await vindEigenaarId(eigenaarIdHint);
    if (!eigenaarId) return;
    await bewijsToevoegen(eigenaarId, invoer);
    await synchroniseerEnBouwOverzicht(eigenaarId, invoer.versie);
  } catch (err) {
    if (!isOntbrekendeTabel(err)) console.error('[uitrol-stroom] extern-hook:', (err as Error).message);
  }
}

// ------------------------------------------------------------------------------------------------ публічні методи API
export async function stroomOverzichtVoorEigenaar(
  eigenaarId: string,
  versieIn?: unknown,
  eigenaarNaam = '',
): Promise<StroomOverzicht> {
  const versie = await bepaalStandaardVersie(eigenaarId, versieIn);
  return synchroniseerEnBouwOverzicht(eigenaarId, versie, eigenaarNaam);
}

export async function notitieOpslaan(
  eigenaarId: string,
  auteur: string,
  invoer: Record<string, unknown>,
): Promise<StroomNotitie> {
  const versie = String(invoer.versie || '').trim();
  if (!VERSIE_RE.test(versie)) fout('STROOM_VERSIE_ONGELDIG', 400);

  const titelRawUk = zonderGeheimenUitrol(invoer.titelUk ?? invoer.titel, STROOM_LIMIETEN.maxTitel);
  const titelRawNl = zonderGeheimenUitrol(invoer.titelNl ?? invoer.titel, STROOM_LIMIETEN.maxTitel);
  const inhoudRawUk = zonderGeheimenUitrol(invoer.inhoudUk ?? invoer.inhoud, STROOM_LIMIETEN.maxInhoud);
  const inhoudRawNl = zonderGeheimenUitrol(invoer.inhoudNl ?? invoer.inhoud, STROOM_LIMIETEN.maxInhoud);

  const titelUk = titelRawUk || titelRawNl;
  const titelNl = titelRawNl || titelRawUk;
  const inhoudUk = inhoudRawUk || inhoudRawNl;
  const inhoudNl = inhoudRawNl || inhoudRawUk;
  if (!titelUk || !inhoudUk) fout('STROOM_NOTITIE_LEEG', 400);

  const risicoIn = String(invoer.risico || 'normaal');
  const risico: StroomRisico = ['laag', 'normaal', 'verhoogd', 'kritiek'].includes(risicoIn) ? (risicoIn as StroomRisico) : 'normaal';
  const vastgepind = Boolean(invoer.vastgepind);
  const onderdelen = Array.isArray(invoer.onderdelen)
    ? invoer.onderdelen.map((x) => zonderGeheimenUitrol(x, 40)).filter(Boolean).slice(0, 12)
    : [];

  const voorstel = await leesVoorstelVoorVersie(versie);
  const run = await leesRunVoorVersie(versie);

  if (invoer.id && UUID_RE.test(String(invoer.id))) {
    const { rows } = await sys().query(
      `UPDATE app.uitrol_stroom_notities
          SET titel_uk = $3, titel_nl = $4, inhoud_uk = $5, inhoud_nl = $6,
              risico = $7, onderdelen = $8::jsonb, vastgepind = $9, geschoond = true,
              auteur = $10, bijgewerkt_op = now()
        WHERE id = $1 AND user_id = $2 AND ruimte = $11 AND soort <> 'ai-duiding'
        RETURNING *`,
      [String(invoer.id), eigenaarId, titelUk, titelNl, inhoudUk, inhoudNl, risico, JSON.stringify(onderdelen), vastgepind, zonderGeheimenUitrol(auteur, 160), RUIMTE],
    );
    if (!rows[0]) fout('STROOM_NOTITIE_NIET_GEVONDEN', 404);
    await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_notitie_bijgewerkt', type: 'beveiliging', result: 'success', service: 'admin', details: { versie, id: String(invoer.id), risico, vastgepind } }).catch(() => undefined);
    return notitieUit(rows[0]);
  }

  const { rows } = await sys().query(
    `INSERT INTO app.uitrol_stroom_notities
       (user_id, ruimte, versie, voorstel_id, run_id, soort, risico, titel_uk, titel_nl, inhoud_uk, inhoud_nl, onderdelen, vastgepind, geschoond, auteur)
     VALUES ($1, $2, $3, $4, $5, 'eigenaar', $6, $7, $8, $9, $10, $11::jsonb, $12, true, $13)
     RETURNING *`,
    [
      eigenaarId,
      RUIMTE,
      versie,
      voorstel ? String(voorstel.id) : null,
      run ? String(run.id) : '',
      risico,
      titelUk,
      titelNl,
      inhoudUk,
      inhoudNl,
      JSON.stringify(onderdelen),
      vastgepind,
      zonderGeheimenUitrol(auteur, 160),
    ],
  );
  await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_notitie_aangemaakt', type: 'beveiliging', result: 'success', service: 'admin', details: { versie, id: String(rows[0].id), risico, vastgepind } }).catch(() => undefined);
  return notitieUit(rows[0]);
}

export async function notitieVerwijderen(eigenaarId: string, id: unknown): Promise<{ ok: true; id: string }> {
  if (!UUID_RE.test(String(id || ''))) fout('STROOM_NOTITIE_NIET_GEVONDEN', 404);
  const res = await sys().query(
    `DELETE FROM app.uitrol_stroom_notities WHERE id = $1 AND user_id = $2 AND ruimte = $3 AND soort <> 'ai-duiding' RETURNING id, versie`,
    [String(id), eigenaarId, RUIMTE],
  );
  if (!res.rows[0]) fout('STROOM_NOTITIE_NIET_GEVONDEN', 404);
  await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_notitie_verwijderd', type: 'beveiliging', result: 'success', service: 'admin', details: { id: String(id), versie: String(res.rows[0].versie) } }).catch(() => undefined);
  return { ok: true, id: String(id) };
}

export async function controleStatusZetten(
  eigenaarId: string,
  door: string,
  invoer: Record<string, unknown>,
): Promise<ControlelijstItem> {
  const actor = zonderGeheimenUitrol(door, 160);
  // Варіант А: додавання власного пункту контрольного списку
  if (invoer.nieuw) {
    const versie = String(invoer.versie || '').trim();
    if (!VERSIE_RE.test(versie)) fout('STROOM_VERSIE_ONGELDIG', 400);
    const titelUk = zonderGeheimenUitrol(invoer.titelUk ?? invoer.titel, STROOM_LIMIETEN.maxTitel);
    const titelNl = zonderGeheimenUitrol(invoer.titelNl ?? invoer.titel, STROOM_LIMIETEN.maxTitel);
    const toelUk = zonderGeheimenUitrol(invoer.toelichtingUk ?? invoer.toelichting ?? '', STROOM_LIMIETEN.maxToelichting);
    const toelNl = zonderGeheimenUitrol(invoer.toelichtingNl ?? invoer.toelichting ?? '', STROOM_LIMIETEN.maxToelichting);
    if (!titelUk && !titelNl) fout('STROOM_CONTROLE_LEEG', 400);
    const sleutel = `eigen.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (!SLEUTEL_RE.test(sleutel)) fout('STROOM_SLEUTEL_ONGELDIG', 400);
    const verplicht = Boolean(invoer.verplicht);
    const [voorstel, run] = await Promise.all([leesVoorstelVoorVersie(versie), leesRunVoorVersie(versie)]);
    const { rows } = await sys().query(
      `INSERT INTO app.uitrol_stroom_controlelijsten
         (user_id, ruimte, versie, voorstel_id, run_id, sleutel, groep, herkomst, verplicht, handmatig_bevestigen, titel_uk, titel_nl, toelichting_uk, toelichting_nl, status, volgorde, bijgewerkt_door)
       VALUES ($1, $2, $3, $4, $5, $6, 'eigen', 'eigenaar', $7, true, $8, $9, $10, $11, 'open', 500, $12)
       RETURNING *`,
      [
        eigenaarId,
        RUIMTE,
        versie,
        voorstel ? String(voorstel.id) : null,
        run ? String(run.id) : '',
        sleutel,
        verplicht,
        titelUk || titelNl,
        titelNl || titelUk,
        toelUk || toelNl,
        toelNl || toelUk,
        actor,
      ],
    );
    await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_controle_toegevoegd', type: 'beveiliging', result: 'success', service: 'admin', details: { versie, sleutel, verplicht } }).catch(() => undefined);
    return controleUit(rows[0]);
  }

  // Варіант Б: оновлення статусу наявного пункту
  const id = String(invoer.id || '');
  if (!UUID_RE.test(id)) fout('STROOM_CONTROLE_NIET_GEVONDEN', 404);
  const { rows: curRows } = await sys().query(
    `SELECT * FROM app.uitrol_stroom_controlelijsten WHERE id = $1 AND user_id = $2 AND ruimte = $3`,
    [id, eigenaarId, RUIMTE],
  );
  if (!curRows[0]) fout('STROOM_CONTROLE_NIET_GEVONDEN', 404);
  const cur = controleUit(curRows[0]);

  const gewenst = String(invoer.status || '');
  if (!['open', 'afgevinkt', 'overgeslagen'].includes(gewenst)) fout('STROOM_STATUS_ONGELDIG', 400);
  const reden = zonderGeheimenUitrol(invoer.reden || '', STROOM_LIMIETEN.maxReden);

  // Забороняємо вручну «відмітити пройденим» системний автоматично-провалений пункт без ручного прапорця
  if (gewenst === 'afgevinkt' && !cur.handmatigBevestigen && cur.status === 'mislukt') {
    fout('STROOM_VERPLICHT_HANDMATIG', 409);
  }
  // Пропуск обов'язкового пункту вимагає явної причини (≥ 10 символів)
  if (gewenst === 'overgeslagen' && cur.verplicht && reden.trim().length < 10) {
    fout('STROOM_REDEN_VEREIST', 400);
  }

  const { rows: upd } = await sys().query(
    `UPDATE app.uitrol_stroom_controlelijsten
        SET status = $4, reden = $5, bijgewerkt_door = $6, bijgewerkt_op = now()
      WHERE id = $1 AND user_id = $2 AND ruimte = $3
      RETURNING *`,
    [id, eigenaarId, RUIMTE, gewenst, reden, actor],
  );
  await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_controle_status', type: 'beveiliging', result: 'success', service: 'admin', details: { id, versie: cur.versie, sleutel: cur.sleutel, status: gewenst } }).catch(() => undefined);
  return controleUit(upd[0]);
}

export async function controleVerwijderen(eigenaarId: string, id: unknown): Promise<{ ok: true; id: string }> {
  if (!UUID_RE.test(String(id || ''))) fout('STROOM_CONTROLE_NIET_GEVONDEN', 404);
  const { rows } = await sys().query(
    `DELETE FROM app.uitrol_stroom_controlelijsten
      WHERE id = $1 AND user_id = $2 AND ruimte = $3 AND herkomst = 'eigenaar'
      RETURNING id, versie, sleutel`,
    [String(id), eigenaarId, RUIMTE],
  );
  if (!rows[0]) fout('STROOM_NIET_VERWIJDERBAAR', 409);
  await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_controle_verwijderd', type: 'beveiliging', result: 'success', service: 'admin', details: { id: String(id), versie: String(rows[0].versie) } }).catch(() => undefined);
  return { ok: true, id: String(id) };
}

export async function bewijsVerzamelen(eigenaarId: string, versieIn: unknown, eigenaarNaam = ''): Promise<StroomOverzicht> {
  const versie = await bepaalStandaardVersie(eigenaarId, versieIn);
  const overzicht = await synchroniseerEnBouwOverzicht(eigenaarId, versie, eigenaarNaam, { verzamelDiagnose: true });
  await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_bewijs_verzameld', type: 'beveiliging', result: 'success', service: 'admin', details: { versie, bewijzen: overzicht.bewijzen.length, ketenOk: overzicht.ketenIntegriteit.ok } }).catch(() => undefined);
  return overzicht;
}

export async function rapportExporteren(
  eigenaarId: string,
  versieIn: unknown,
  langIn: unknown,
  eigenaarNaam = '',
): Promise<{
  versie: string;
  lang: StroomTaal;
  gegenereerdOp: string;
  ketenIntegriteit: StroomOverzicht['ketenIntegriteit'];
  markdown: string;
  rapport: StroomOverzicht;
}> {
  const lang: StroomTaal = langIn === 'nl' ? 'nl' : 'uk';
  const versie = await bepaalStandaardVersie(eigenaarId, versieIn);
  const overzicht = await synchroniseerEnBouwOverzicht(eigenaarId, versie, eigenaarNaam, { verzamelDiagnose: true });
  const markdown = bouwBewijsRapportMarkdown(overzicht, lang);
  await auditToevoegen({ ownerId: eigenaarId, actorId: eigenaarId, action: 'uitrol_stroom_rapport_geexporteerd', type: 'beveiliging', result: 'success', service: 'admin', details: { versie, lang, bewijzen: overzicht.bewijzen.length } }).catch(() => undefined);
  return {
    versie,
    lang,
    gegenereerdOp: new Date().toISOString(),
    ketenIntegriteit: overzicht.ketenIntegriteit,
    markdown,
    rapport: overzicht,
  };
}

// ------------------------------------------------------------------------------------------------ маршрути HTTP API
type SessionOk = { user: { id: string; email?: string; role?: string; name?: string }; service: string };
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

export type StroomRouteDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
  isEigenaar: (u: SessionOk['user']) => boolean;
  stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
};

const bodyObj = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function uitrolStroomRoutes(deps: StroomRouteDeps): Record<string, RouterMiddleware[]> {
  const metFouten = async (run: () => Promise<unknown>): Promise<Resp> => {
    try {
      return json(await run());
    } catch (err) {
      if (err instanceof StroomFout) return error(err.code, err.status);
      console.error('[uitrol-stroom]', (err as Error).message);
      return error('UITROL_FOUT', 500);
    }
  };

  const eigenaar = (
    opts: { stepUp?: boolean; rate?: { key: string; max: number; windowSec: number } },
    run: (ctx: Ctx, auth: SessionOk) => Promise<unknown>,
  ): RouterMiddleware => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!deps.isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    if (opts.rate) {
      const lim = await rateLimit(`${opts.rate.key}:${auth.user.id}`, opts.rate.max, opts.rate.windowSec);
      if (!lim.ok) return error('RATE_LIMITED', 429);
    }
    if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    return metFouten(() => run(ctx, auth));
  }) as RouterMiddleware;

  const auteurVan = (u: SessionOk['user']) => String(u.email || u.name || u.id);

  return {
    'POST /api/owner/uitrol/stroom/stand': [eigenaar({}, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      return stroomOverzichtVoorEigenaar(auth.user.id, b.versie, auteurVan(auth.user));
    })],
    'POST /api/owner/uitrol/stroom/notitie-opslaan': [eigenaar({ rate: { key: 'uitrol-stroom-notitie', max: 60, windowSec: 300 } }, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      const notitie = await notitieOpslaan(auth.user.id, auteurVan(auth.user), b);
      const overzicht = await stroomOverzichtVoorEigenaar(auth.user.id, notitie.versie, auteurVan(auth.user));
      return { notitie, overzicht };
    })],
    'POST /api/owner/uitrol/stroom/notitie-verwijderen': [eigenaar({}, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      const res = await notitieVerwijderen(auth.user.id, b.id);
      const overzicht = b.versie ? await stroomOverzichtVoorEigenaar(auth.user.id, b.versie, auteurVan(auth.user)) : null;
      return { ...res, ...(overzicht ? { overzicht } : {}) };
    })],
    'POST /api/owner/uitrol/stroom/duiding-vernieuwen': [eigenaar({ rate: { key: 'uitrol-stroom-duiding', max: 30, windowSec: 300 } }, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      return stroomOverzichtVoorEigenaar(auth.user.id, b.versie, auteurVan(auth.user));
    })],
    'POST /api/owner/uitrol/stroom/controle-status': [eigenaar({ rate: { key: 'uitrol-stroom-controle', max: 80, windowSec: 300 } }, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      const item = await controleStatusZetten(auth.user.id, auteurVan(auth.user), b);
      const overzicht = await stroomOverzichtVoorEigenaar(auth.user.id, item.versie, auteurVan(auth.user));
      return { item, overzicht };
    })],
    'POST /api/owner/uitrol/stroom/controle-verwijderen': [eigenaar({}, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      const res = await controleVerwijderen(auth.user.id, b.id);
      const overzicht = b.versie ? await stroomOverzichtVoorEigenaar(auth.user.id, b.versie, auteurVan(auth.user)) : null;
      return { ...res, ...(overzicht ? { overzicht } : {}) };
    })],
    'POST /api/owner/uitrol/stroom/bewijs-verzamelen': [eigenaar({ rate: { key: 'uitrol-stroom-bewijs', max: 30, windowSec: 300 } }, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      return bewijsVerzamelen(auth.user.id, b.versie, auteurVan(auth.user));
    })],
    'POST /api/owner/uitrol/stroom/rapport': [eigenaar({}, async (ctx, auth) => {
      const b = bodyObj(ctx.body);
      return rapportExporteren(auth.user.id, b.versie, b.lang, auteurVan(auth.user));
    })],
  };
}
