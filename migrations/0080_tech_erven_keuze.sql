-- 0080: nieuwe tabbladen zijn standaard GEBRUIKERSTABBLADEN (20.10.2026).
--
-- Waarom: sinds 0071 erft elk nieuw tabblad van dezelfde aanmeldsessie een OPEN technische activering («до виходу з акаунта/
-- профілю»). Dat loste «технічний профіль злітає в новій вкладці» op, maar maakte in de praktijk ELK tabblad technisch — en een
-- AI in de privéruimte van de gebruiker mag een technisch tabblad nooit lezen of bedienen (extensie 0.6, slot 'prive'). Resultaat:
-- de gebruikers-AI kreeg overal EXTENSIE_PROFIEL, ook op hub.tarasevych.com in een vers tabblad.
--
-- Vanaf nu kiest de gebruiker zelf (app.tech_profielen.erven_nieuwe_tabbladen):
--   false (STANDAARD) — een nieuw tabblad is een gewoon gebruikerstabblad; het technische profiel activeert u per tabblad, en een
--                       tabblad dat vanuit een technisch tabblad wordt geopend kan nog altijd een kopie krijgen (tp.delen, 0071);
--   true              — oud gedrag: elk nieuw tabblad van dezelfde aanmeldsessie erft een open activering zonder stap-op.
-- De keuze staat per gebruiker op zijn profiel, is alleen door hemzelf te zetten (POST /api/owner/tech/erven, zie
-- backend/tech-routes.ts) en komt in het logboek als owner.tech.erven_keuze. De logica van 0071 zelf blijft ongewijzigd: alleen
-- ervenOpen() vraagt eerst of de gebruiker het wil.
--
-- Idempotent (agents.test.ts draait alle migraties opnieuw).
ALTER TABLE app.tech_profielen ADD COLUMN IF NOT EXISTS erven_nieuwe_tabbladen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.tech_profielen.erven_nieuwe_tabbladen IS
  'Mag een NIEUW tabblad van dezelfde aanmeldsessie een open technische activering erven (0071)? Standaard false: nieuwe tabbladen zijn gebruikerstabbladen, zodat de AI in de privéruimte er mag werken.';
