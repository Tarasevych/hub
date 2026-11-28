-- 0339 — Адитивні стовпці квитанцій доставки в панель (✓), фактичного перегляду (✓✓) та автоматичного архівування за фільтром (HERSTEL-001, 24.11.2026).
-- 0339 — Additieve kolommen voor paneelaflevering (✓), daadwerkelijke weergave (✓✓) en automatische filterarchivering (HERSTEL-001, 24.11.2026).

ALTER TABLE app.melding_ecosysteem_gebeurtenissen
  ADD COLUMN IF NOT EXISTS afgeleverd_op timestamptz,
  ADD COLUMN IF NOT EXISTS gelezen_op timestamptz,
  ADD COLUMN IF NOT EXISTS auto_gearchiveerd boolean NOT NULL DEFAULT false;

-- Історичні записи, які вже були явно прочитані або вирішені людиною, отримують узгоджені мітки доставки й прочитання (без зміни нових чи непереглянутих архівних).
UPDATE app.melding_ecosysteem_gebeurtenissen
   SET afgeleverd_op = COALESCE(afgeleverd_op, aangemaakt_op),
       gelezen_op    = COALESCE(gelezen_op, bijgewerkt_op)
 WHERE status IN ('gelezen', 'opgelost')
   AND (afgeleverd_op IS NULL OR gelezen_op IS NULL);

CREATE INDEX IF NOT EXISTS idx_melding_ecosysteem_geb_aflevering
  ON app.melding_ecosysteem_gebeurtenissen (user_id, afgeleverd_op, gelezen_op, aangemaakt_op DESC);
