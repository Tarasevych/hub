// Minimale PostgreSQL-versie voor Mijn Ruimte (BYOS: elke eigenaar draait zijn eigen server).
// 16 = laagste versie waarop alle migraties aantoonbaar slagen (tests/eenheid/migraties-pg16-20261021.test.ts;
// Ubuntu 24.04 LTS levert PostgreSQL 16). 17 = aanbevolen (productie, deploy/LEESMIJ.md).
// Analyse 21.10.2026: de enige versie-specifieke opdracht was SET EXPRESSION (PG17) in 0007; die heeft nu een PG16-weg.
// Lager dan 16 is niet getest en wordt daarom geweigerd vóór er iets aan de database verandert.
import type pg from 'pg';

export const PG_MIN_VERSIE_NUM = 160000;
export const PG_MIN_VERSIE = 16;
export const PG_AANBEVOLEN_VERSIE = 17;

export type PgVersie = { num: number; tekst: string };

export async function pgVersie(pool: Pick<pg.Pool, 'query'>): Promise<PgVersie> {
  const r = await pool.query("SELECT current_setting('server_version_num')::int AS num, current_setting('server_version') AS tekst");
  return { num: Number(r.rows[0].num), tekst: String(r.rows[0].tekst) };
}

/** null = in orde; anders een eerlijke melding (nl + uk) zonder interne details. */
export function pgVersieMelding(v: PgVersie): string | null {
  if (Number.isFinite(v.num) && v.num >= PG_MIN_VERSIE_NUM) return null;
  const hoofd = Math.floor(v.num / 10000) || v.tekst;
  return `PG_VERSIE_TE_OUD:${v.tekst}: PostgreSQL ${hoofd} wordt niet ondersteund; minimaal PostgreSQL ${PG_MIN_VERSIE} (aanbevolen ${PG_AANBEVOLEN_VERSIE}). ` +
    `Er is niets aan de database gewijzigd. Upgrade PostgreSQL (bijv. pg_upgradecluster) en installeer opnieuw; zie deploy/LEESMIJ.md. / ` +
    `PostgreSQL ${hoofd} не підтримується; потрібна щонайменше PostgreSQL ${PG_MIN_VERSIE} (рекомендовано ${PG_AANBEVOLEN_VERSIE}). ` +
    `Базу даних не змінено. Оновіть PostgreSQL (напр. pg_upgradecluster) і повторіть встановлення; див. deploy/LEESMIJ.md.`;
}
