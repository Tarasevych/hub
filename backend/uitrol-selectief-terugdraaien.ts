// UPD-011: Реєстр змін кожного випуску (файли, міграції, джерело, 3-чинникова довіра)
// та вибіркове відкликання конкретного оновлення без втрати пізніших оновлень.
import { getPool } from '../server/platform/pg';
import { agentAudit } from './agent-audit';
import { releaseInfo } from './uitgave-info';
import { normaliseerHerkomst, type DrieFactorenOordeel, type HerkomstKanaal } from '../shared/uitrol-drie-factoren';
import {
  bouwSelectiefAiOpdracht,
  normaliseerBestanden,
  planSelectiefTerugdraaien,
  vergelijkReleaseBestanden,
  type ReleaseBestand,
  type ReleaseVergelijking,
  type ReleaseWijzigingItem,
  type SelectiefTerugdraaiPlan,
} from '../shared/uitrol-selectief-terugdraaien';

const sys = () => getPool('systeem');
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

export class SelectiefFout extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function itemUit(r: any): ReleaseWijzigingItem {
  return {
    versie: String(r.versie || ''),
    voorstelId: String(r.voorstel_id || ''),
    commitSha: String(r.commit_sha || ''),
    basisVersie: String(r.basis_versie || ''),
    basisCommit: String(r.basis_commit || ''),
    herkomstKanaal: normaliseerHerkomst(r.herkomst_kanaal),
    herkomstSleutelId: String(r.herkomst_sleutel_id || ''),
    auteur: String(r.auteur || ''),
    agent: String(r.agent || ''),
    taakId: String(r.taak_id || ''),
    samenvattingUk: String(r.samenvatting_uk || ''),
    samenvattingNl: String(r.samenvatting_nl || ''),
    drieFactoren: r.drie_factoren && typeof r.drie_factoren === 'object' && Object.keys(r.drie_factoren).length ? (r.drie_factoren as DrieFactorenOordeel) : null,
    bestanden: normaliseerBestanden(r.bestanden),
    migraties: Array.isArray(r.migraties) ? r.migraties.map((x: unknown) => String(x)).filter(Boolean) : [],
    commits: Array.isArray(r.commits) ? r.commits.map((x: unknown) => String(x)).filter(Boolean) : [],
    status: (r.status || 'wacht') as ReleaseWijzigingItem['status'],
    aangemaaktOp: iso(r.aangemaakt_op),
    geinstalleerdOp: iso(r.geinstalleerd_op),
    ingetrokkenOp: iso(r.ingetrokken_op),
    ingetrokkenVersie: String(r.ingetrokken_versie || ''),
    ingetrokkenReden: String(r.ingetrokken_reden || ''),
  };
}

/**
 * Фіксує або оновлює запис випуску в реєстрі змін (викликається під час завершення завантаження,
 * приймання з GitHub чи завершення встановлення). Безпечна для старих схем БД (не ламає основний потік).
 */
export async function releaseWijzigingVastleggen(invoer: {
  versie: string;
  voorstelId?: string;
  commitSha?: string;
  basisVersie?: string;
  basisCommit?: string;
  herkomstKanaal?: HerkomstKanaal;
  herkomstSleutelId?: string;
  auteur?: string;
  agent?: string;
  taakId?: string;
  samenvattingUk?: string;
  samenvattingNl?: string;
  drieFactoren?: DrieFactorenOordeel | null;
  bestanden?: Array<string | ReleaseBestand>;
  migraties?: string[];
  commits?: string[];
  status?: ReleaseWijzigingItem['status'];
  geinstalleerdOp?: string;
}): Promise<void> {
  const versie = tekst(invoer.versie, 40);
  if (!versie) return;
  const bestanden = normaliseerBestanden(invoer.bestanden || []);
  const migraties = [...new Set((invoer.migraties || []).map((x) => tekst(x, 120)).filter(Boolean))].slice(0, 100);
  const commits = [...new Set((invoer.commits || []).map((x) => tekst(x, 64)).filter(Boolean))].slice(0, 100);
  try {
    await sys().query(
      `INSERT INTO app.uitrol_release_wijzigingen
         (versie, voorstel_id, commit_sha, basis_versie, basis_commit, herkomst_kanaal, herkomst_sleutel_id,
          auteur, agent, taak_id, samenvatting_uk, samenvatting_nl, drie_factoren, bestanden, migraties, commits,
          status, geinstalleerd_op)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18)
       ON CONFLICT (versie) DO UPDATE SET
         voorstel_id = COALESCE(NULLIF(EXCLUDED.voorstel_id, ''), app.uitrol_release_wijzigingen.voorstel_id),
         commit_sha = COALESCE(NULLIF(EXCLUDED.commit_sha, ''), app.uitrol_release_wijzigingen.commit_sha),
         basis_versie = COALESCE(NULLIF(EXCLUDED.basis_versie, ''), app.uitrol_release_wijzigingen.basis_versie),
         basis_commit = COALESCE(NULLIF(EXCLUDED.basis_commit, ''), app.uitrol_release_wijzigingen.basis_commit),
         herkomst_kanaal = CASE WHEN EXCLUDED.herkomst_kanaal <> 'onbekend' THEN EXCLUDED.herkomst_kanaal ELSE app.uitrol_release_wijzigingen.herkomst_kanaal END,
         herkomst_sleutel_id = COALESCE(NULLIF(EXCLUDED.herkomst_sleutel_id, ''), app.uitrol_release_wijzigingen.herkomst_sleutel_id),
         auteur = COALESCE(NULLIF(EXCLUDED.auteur, ''), app.uitrol_release_wijzigingen.auteur),
         agent = COALESCE(NULLIF(EXCLUDED.agent, ''), app.uitrol_release_wijzigingen.agent),
         taak_id = COALESCE(NULLIF(EXCLUDED.taak_id, ''), app.uitrol_release_wijzigingen.taak_id),
         samenvatting_uk = COALESCE(NULLIF(EXCLUDED.samenvatting_uk, ''), app.uitrol_release_wijzigingen.samenvatting_uk),
         samenvatting_nl = COALESCE(NULLIF(EXCLUDED.samenvatting_nl, ''), app.uitrol_release_wijzigingen.samenvatting_nl),
         drie_factoren = CASE WHEN EXCLUDED.drie_factoren <> '{}'::jsonb THEN EXCLUDED.drie_factoren ELSE app.uitrol_release_wijzigingen.drie_factoren END,
         bestanden = CASE WHEN jsonb_array_length(EXCLUDED.bestanden) > 0 THEN EXCLUDED.bestanden ELSE app.uitrol_release_wijzigingen.bestanden END,
         migraties = CASE WHEN jsonb_array_length(EXCLUDED.migraties) > 0 THEN EXCLUDED.migraties ELSE app.uitrol_release_wijzigingen.migraties END,
         commits = CASE WHEN jsonb_array_length(EXCLUDED.commits) > 0 THEN EXCLUDED.commits ELSE app.uitrol_release_wijzigingen.commits END,
         status = CASE WHEN app.uitrol_release_wijzigingen.status IN ('selectief_aangevraagd', 'selectief_ingetrokken') THEN app.uitrol_release_wijzigingen.status ELSE EXCLUDED.status END,
         geinstalleerd_op = COALESCE(EXCLUDED.geinstalleerd_op, app.uitrol_release_wijzigingen.geinstalleerd_op),
         bijgewerkt_op = now()`,
      [
        versie,
        tekst(invoer.voorstelId, 80),
        tekst(invoer.commitSha, 64),
        tekst(invoer.basisVersie, 40),
        tekst(invoer.basisCommit, 64),
        normaliseerHerkomst(invoer.herkomstKanaal || 'site'),
        tekst(invoer.herkomstSleutelId, 80),
        tekst(invoer.auteur, 120),
        tekst(invoer.agent, 60),
        tekst(invoer.taakId, 60),
        tekst(invoer.samenvattingUk, 600),
        tekst(invoer.samenvattingNl, 600),
        JSON.stringify(invoer.drieFactoren || {}),
        JSON.stringify(bestanden),
        JSON.stringify(migraties),
        JSON.stringify(commits),
        invoer.status || 'wacht',
        invoer.geinstalleerdOp || null,
      ],
    );
  } catch { /* міграція 0304 може ще не бути застосованою під час ранніх тестів */ }
}

/** Повертає єдиний реєстр змін випусків (таблиця 0304 + доповнення з пропозицій і запусків, якщо запису ще не було). */
export async function releasesRegisterLijst(limiet = 50): Promise<{ actieveVersie: string; releases: ReleaseWijzigingItem[] }> {
  const max = Math.max(5, Math.min(200, Number(limiet) || 50));
  const kaart = new Map<string, ReleaseWijzigingItem>();

  try {
    const { rows } = await sys().query(`SELECT * FROM app.uitrol_release_wijzigingen ORDER BY versie DESC LIMIT $1`, [max]);
    for (const r of rows) {
      const it = itemUit(r);
      if (it.versie) kaart.set(it.versie, it);
    }
  } catch { /* таблиця ще відсутня в ранньому тесті */ }

  // Доповнюємо історичні випуски з uitrol_voorstellen, щоб власник бачив усі випуски навіть до міграції 0304
  try {
    const { rows } = await sys().query(
      `SELECT id, versie, status, bron_commit, voorbereider_label, wijzigingen, pakket_meta, aangemaakt_op, beslist_op
         FROM app.uitrol_voorstellen
        WHERE status IN ('geinstalleerd', 'wacht-op-goedkeuring', 'goedgekeurd', 'mislukt', 'afgewezen')
        ORDER BY versie DESC LIMIT $1`,
      [max],
    );
    for (const r of rows) {
      const versie = String(r.versie || '');
      if (!versie || kaart.has(versie)) continue;
      const meta = (r.pakket_meta || {}) as Record<string, any>;
      const manifest = (meta.manifest || {}) as Record<string, any>;
      const label = String(r.voorbereider_label || '').toLowerCase();
      const kanaal: HerkomstKanaal = label.includes('github') ? 'github' : label.includes('mcp') || meta.agent ? 'mcp' : 'site';
      kaart.set(versie, {
        versie,
        voorstelId: String(r.id),
        commitSha: String(r.bron_commit || meta.commit || ''),
        basisVersie: '',
        basisCommit: '',
        herkomstKanaal: kanaal,
        herkomstSleutelId: '',
        auteur: String(meta.auteur || manifest.auteur || r.voorbereider_label || ''),
        agent: String(meta.agent || ''),
        taakId: String(manifest.taakId || ''),
        samenvattingUk: String(manifest.titel?.uk || manifest.samenvatting?.uk || r.wijzigingen || '').slice(0, 300),
        samenvattingNl: String(manifest.titel?.nl || manifest.samenvatting?.nl || r.wijzigingen || '').slice(0, 300),
        drieFactoren: null,
        bestanden: normaliseerBestanden(manifest.bestanden || []),
        migraties: Array.isArray(manifest.migraties) ? manifest.migraties.map(String) : [],
        commits: r.bron_commit ? [String(r.bron_commit)] : [],
        status: r.status === 'geinstalleerd' ? 'geinstalleerd' : r.status === 'mislukt' ? 'mislukt' : r.status === 'afgewezen' ? 'afgewezen' : 'wacht',
        aangemaaktOp: iso(r.aangemaakt_op),
        geinstalleerdOp: r.status === 'geinstalleerd' ? iso(r.beslist_op || r.aangemaakt_op) : '',
        ingetrokkenOp: '',
        ingetrokkenVersie: '',
        ingetrokkenReden: '',
      });
    }
  } catch { /* опційно */ }

  const releases = [...kaart.values()].sort((a, b) => b.versie.localeCompare(a.versie)).slice(0, max);
  return { actieveVersie: releaseInfo().versie || releases[0]?.versie || '', releases };
}

export async function releaseVergelijkEnPlan(
  doelVersie: string,
  huidigeVersie?: string,
): Promise<{ vergelijking: ReleaseVergelijking; plan: SelectiefTerugdraaiPlan; aiOpdrachtUk: string; aiOpdrachtNl: string }> {
  const doel = tekst(doelVersie, 40);
  if (!doel) throw new SelectiefFout('SELECTIEF_PLAN_NIET_GEVONDEN', 404);
  const { actieveVersie, releases } = await releasesRegisterLijst(150);
  const huidig = tekst(huidigeVersie, 40) || actieveVersie;
  const vergelijking = vergelijkReleaseBestanden(releases, doel, huidig);
  const plan = planSelectiefTerugdraaien(releases, doel, huidig);
  if (!vergelijking || !plan) throw new SelectiefFout('SELECTIEF_PLAN_NIET_GEVONDEN', 404);
  return {
    vergelijking,
    plan,
    aiOpdrachtUk: bouwSelectiefAiOpdracht(plan, '', 'uk'),
    aiOpdrachtNl: bouwSelectiefAiOpdracht(plan, '', 'nl'),
  };
}

/** Фіксує рішення власника на вибіркове відкликання конкретного випуску без втрати пізніших випусків. */
export async function releaseSelectiefAanvragen(
  door: { id: string; email?: string },
  invoer: Record<string, unknown>,
): Promise<{ plan: SelectiefTerugdraaiPlan; aiOpdrachtUk: string; aiOpdrachtNl: string }> {
  const doel = tekst(invoer.versie, 40);
  const reden = tekst(invoer.reden, 400);
  if (!doel) throw new SelectiefFout('SELECTIEF_PLAN_NIET_GEVONDEN', 404);
  if (reden.length < 4) throw new SelectiefFout('REDEN_TE_KORT', 400);

  const { plan } = await releaseVergelijkEnPlan(doel, tekst(invoer.huidigeVersie, 40) || undefined);
  const aiOpdrachtUk = bouwSelectiefAiOpdracht(plan, reden, 'uk');
  const aiOpdrachtNl = bouwSelectiefAiOpdracht(plan, reden, 'nl');

  await releaseWijzigingVastleggen({ versie: doel, status: 'selectief_aangevraagd' });
  try {
    await sys().query(
      `UPDATE app.uitrol_release_wijzigingen
          SET status = 'selectief_aangevraagd',
              ingetrokken_op = now(),
              ingetrokken_reden = $2,
              ingetrokken_plan = $3::jsonb,
              bijgewerkt_op = now()
        WHERE versie = $1`,
      [doel, reden, JSON.stringify(plan)],
    );
  } catch { /* опційно для ранніх тестів */ }

  await agentAudit({
    ownerId: door.id,
    actor: { id: door.id, email: door.email },
    action: 'uitrol.release.selectief_aangevraagd',
    target: { type: 'release', id: doel, label: doel },
    agent: null,
    reason: reden,
    after: {
      behoudenLatereVersies: plan.behoudenLatereVersies,
      veiligAantal: plan.veiligDirectTerugtezetten.length,
      overlappendAantal: plan.overlappendeBestanden.length,
    },
  });

  return { plan, aiOpdrachtUk, aiOpdrachtNl };
}
