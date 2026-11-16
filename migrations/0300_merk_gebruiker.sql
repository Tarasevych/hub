-- 0300 — REESTR-LOGO-001 (16.11.2026, verzoek van de eigenaar): EIGEN LOGO VAN DE GEBRUIKER bovenop het systeemlogo.
-- Павло: «щоб користувач міг там призначити свій логотип навіть якщо системний є … діє той, який встановив користувач, доки не
-- буде видалено користувацький або не замінено». Eén rij per (mens, ruimte, merk). Wie een rij heeft, ziet OVERAL op de site zijn
-- eigen bestand voor dat merk (src/merk/merk-register.ts → laag 'gebruiker', vóór het bestand van de beheerder en het officiële).
-- Wissen = de systeemlaag staat meteen weer. Niemand anders ziet de rij: de server geeft alleen de eigen rijen van de eigen ruimte.
--
-- Bescherming zoals de foto's van afzenders (0097, app.afzender_beeld): staat de sleutelkluis van de mens aan, dan staat het bestand
-- ALLEEN onder zijn eigen gegevenssleutel ('dek1.…', AAD = mens + ruimte + merk) en is `data` NULL — ook de beheerder van de server
-- kan het dan niet lezen. Sleutel dicht = niets bewaard (geen onversleutelde terugval). Zonder kluis: het bestand zelf.
-- Het bestand is vooraf ontsmet (shared/merk-eigen.ts: SVG zonder script/verwijzingen, of een echte PNG), ≤ 200 KB.
-- Herhaalbaar (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS app.merk_gebruiker (
  user_id          text        NOT NULL CHECK (length(user_id) BETWEEN 1 AND 120),
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  -- Sleutel zoals het merkregister hem kent (kleine letters, cijfers, . + -), dezelfde vorm als een bestand van de beheerder.
  sleutel          text        NOT NULL CHECK (sleutel ~ '^[a-z0-9][a-z0-9.+-]{0,40}$'),
  soort            text        NOT NULL CHECK (soort IN ('svg', 'png')),
  data             bytea       CHECK (data IS NULL OR octet_length(data) <= 204800),
  data_versleuteld text        CHECK (data_versleuteld IS NULL OR (data_versleuteld ~ '^dek1\.' AND length(data_versleuteld) <= 400000)),
  sha256           text        NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bytes            integer     NOT NULL CHECK (bytes BETWEEN 1 AND 204800),
  gewijzigd_op     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, sleutel),
  CHECK (NOT (data IS NOT NULL AND data_versleuteld IS NOT NULL)),
  CHECK (data IS NOT NULL OR data_versleuteld IS NOT NULL)
);
COMMENT ON TABLE app.merk_gebruiker IS
  'Eigen logo van een gebruiker voor een merk, per (mens, ruimte). Gaat vóór het systeemlogo, alleen voor die mens. Onder de eigen gegevenssleutel als de sleutelkluis aanstaat.';
