-- 0126 — Technische bundels ook voor de technische RUIMTE (vlag tech-ruimtes-v2), 28.10.2026.
-- Fout: met tech-ruimtes-v2 is de «activering» een rij in app.tech_ruimte_sessies, niet in app.tech_activaties. De sleutel voor
-- /assets/tech/* had een verwijzing naar tech_activaties: het opslaan mislukte stil, er kwam geen cookie, en elke technische pagina
-- toonde «Технічні модулі не завантажено». Nu: de sleutel hangt aan óf een activering óf een technische ruimtesessie. Idempotent.
ALTER TABLE app.tech_asset_toegang ALTER COLUMN activatie_id DROP NOT NULL;
ALTER TABLE app.tech_asset_toegang ADD COLUMN IF NOT EXISTS ruimte_sessie_id uuid REFERENCES app.tech_ruimte_sessies (id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_asset_toegang_een_bron') THEN
    ALTER TABLE app.tech_asset_toegang ADD CONSTRAINT tech_asset_toegang_een_bron CHECK ((activatie_id IS NULL) <> (ruimte_sessie_id IS NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS tech_asset_toegang_ruimte_idx ON app.tech_asset_toegang (ruimte_sessie_id);
