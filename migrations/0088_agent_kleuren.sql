-- 0088: kleur per AI-agent, per gebruiker (opdracht eigenaar 20.10.2026).
--
-- Waarom: de markering in het browsertabblad zegt sinds extensie 0.6.2 WIE er nu leest, en de rand krijgt de kleur van die
-- agent. De standaardkleur komt uit het accentpalet van de site (shared/menu-model.ts → ACCENT_KLEUREN, al op contrast
-- gecontroleerd in licht en donker); hier staat alleen de AFWIJKING die de eigenaar zelf koos. Eén rij per gebruiker × agent:
-- de kleur hoort bij de PERSOON, niet bij een tabblad of een koppeling, en geldt dus overal tegelijk (rand in de pagina, badge
-- op het pictogram, agentenlijst op de site).
--
-- `accent` is een NAAM uit ACCENTEN, geen hexwaarde: zo kan er nooit een kleur in staan die in een van de twee thema's
-- onleesbaar is, en blijft het palet van de site de enige bron van echte kleurwaarden. Een naam die later uit het palet
-- verdwijnt wordt door de code genegeerd (dan geldt weer de standaard) — daarom geen harde CHECK op de lijst.
-- RLS zoals 0045: mijnruimte_app ziet alleen eigen rijen; de server werkt met de systeemrol.

CREATE TABLE IF NOT EXISTS app.agent_kleuren (
  user_id    text        NOT NULL,
  agent      text        NOT NULL CHECK (agent IN ('claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity')),
  accent     text        NOT NULL CHECK (accent ~ '^[a-z]{3,12}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent)
);

ALTER TABLE app.agent_kleuren ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_kleuren_eigen ON app.agent_kleuren;
CREATE POLICY agent_kleuren_eigen ON app.agent_kleuren
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
