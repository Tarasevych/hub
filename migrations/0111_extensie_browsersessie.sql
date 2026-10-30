-- 0111 (23.10.2026, zone E): «ДО ЗАКРИТТЯ БРАУЗЕРА» en de herstartregel van de termijnen (vervolg op 0110).
--
-- Waarom: de eigenaar vroeg naast «до виходу з акаунта» en «до відкликання» ook «поки не вийду з браузера». En de opdracht E2 zegt:
-- «Перезапуск браузера не скидає, якщо обрано ≥ «до виходу з акаунта». Вихід з акаунта завжди скидає.» Een herstart van de browser
-- kon de server tot nu toe niet onderscheiden van een gewone herverbinding (de server duwde elke lopende ontgrendeling opnieuw).
--
-- WAT ER VERANDERT
--   • app.extensie_ontgrendelingen.einde_soort kent ook 'browser' («до закриття браузера»; exp = achtervang van 366 dagen).
--   • app.extensie_ontgrendelingen.browser_sessie (nieuw, text): de browsersessie waaraan de rij hangt. De extensie ≥ 0.7.0 maakt per
--     browsersessie één willekeurige id (chrome.storage.session — leeg na het sluiten van de browser of een update van de extensie)
--     en stuurt die bij elke verbinding mee. NULL = niet gebonden (lange termijnen, en alles van een extensie < 0.7.0);
--     '?' = gebonden, maar de extensie was bij het openen niet verbonden: de eerste verbinding bindt. Verbindt de extensie met een
--     ANDERE id, dan trekt de server de rij in (reden_einde 'browser-gesloten'). Gebonden zijn: 'browser', 'tech-einde' en 'duur' tot
--     4 uur (shared/extensie-matrix.ts aanBrowserGebonden). De id is geen geheim en opent nooit iets: ze kan alleen iets BEËINDIGEN.
--   • Uitloggen sluit voortaan elke lopende ontgrendeling van dat account, ongeacht de soort (backend/extensie-ontgrendeling.ts
--     naUitloggen) — geen schemawijziging.
--
-- Idempotent (de testsuite draait alle migraties opnieuw). Terugdraaien: rijen met einde_soort 'browser' intrekken
-- (UPDATE … SET ingetrokken_op = now(), reden_einde = 'teruggedraaid' WHERE einde_soort = 'browser' AND ingetrokken_op IS NULL), daarna
-- UPDATE … SET einde_soort = 'duur' WHERE einde_soort = 'browser'; ALTER TABLE app.extensie_ontgrendelingen DROP COLUMN browser_sessie;
-- de CHECK extensie_ontgrendelingen_einde_soort terug naar de vier soorten van 0110.

ALTER TABLE app.extensie_ontgrendelingen ADD COLUMN IF NOT EXISTS browser_sessie text;
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_browser_sessie;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_browser_sessie
  CHECK (browser_sessie IS NULL OR browser_sessie = '?' OR browser_sessie ~ '^[A-Za-z0-9_-]{16,64}$');
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_einde_soort;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_einde_soort
  CHECK (einde_soort IN ('duur', 'tech-einde', 'uitloggen', 'handmatig', 'browser'));
-- 'browser' zonder binding bestaat niet: zo'n rij zou nooit eindigen bij het sluiten van de browser.
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_browser_gebonden;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_browser_gebonden
  CHECK (einde_soort <> 'browser' OR browser_sessie IS NOT NULL);
-- Opzoeken bij elke verbinding van een extensie (alleen lopende, gebonden rijen).
CREATE INDEX IF NOT EXISTS extensie_ontgrendelingen_browser_sessie_idx
  ON app.extensie_ontgrendelingen (agent_id, user_id) WHERE browser_sessie IS NOT NULL AND ingetrokken_op IS NULL;
