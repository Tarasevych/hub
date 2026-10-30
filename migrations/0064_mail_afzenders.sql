-- 0064: eigen database van afzenders per account (mail.tarasevych.com; audit 18.10.2026, artefact-draad f252547a).
--   app.mail_afzenders       één rij per (gebruiker, afzenderadres): status geverifieerd | onbekend | verdacht, waarom (bron +
--                            reden), bewijs (laatste SPF/DKIM/DMARC van de vertrouwde ontvangende server, tellers pass/fail),
--                            eerst/laatst gezien, aantal berichten, notitie en een korte geschiedenis (laatste 50 wijzigingen).
--   app.mail_afzender_audit  voortgang van de eerste controle over de bestaande mail (hervatbaar: paginatoken na elke pagina).
-- Strikt per account: RLS (eigen rijen) voor de app-rol; nooit gedeeld tussen accounts. Geen berichtinhoud, alleen From en de
-- uitslag van de authenticatiecontrole. «geverifieerd» zet alleen de gebruiker zelf of de regel «bekende dienst + DMARC pass»
-- (shared/mail-afzenders.ts); «authenticatie» als bron is gereserveerd en wordt nooit automatisch gezet.
CREATE TABLE IF NOT EXISTS app.mail_afzenders (
  user_id          text        NOT NULL,
  adres            text        NOT NULL CHECK (length(adres) BETWEEN 3 AND 254 AND adres = lower(adres) AND adres ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  naam             text        NOT NULL DEFAULT '' CHECK (length(naam) <= 200),
  domein           text        NOT NULL CHECK (length(domein) BETWEEN 1 AND 253),
  status           text        NOT NULL DEFAULT 'onbekend' CHECK (status IN ('geverifieerd', 'onbekend', 'verdacht')),
  bron             text        CHECK (bron IS NULL OR bron IN ('handmatig', 'bekende-dienst', 'authenticatie')),
  reden            text        NOT NULL DEFAULT '' CHECK (reden ~ '^[A-Z_]{0,40}$'),
  merk             text        NOT NULL DEFAULT '' CHECK (length(merk) <= 80),
  bewijs           jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(bewijs) = 'object' AND pg_column_size(bewijs) <= 4096),
  eerste_op        timestamptz,
  laatste_op       timestamptz,
  aantal           integer     NOT NULL DEFAULT 0 CHECK (aantal >= 0),
  notitie          text        NOT NULL DEFAULT '' CHECK (length(notitie) <= 500),
  historie         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(historie) = 'array' AND jsonb_array_length(historie) <= 50),
  geverifieerd_op  timestamptz,
  geverifieerd_door text,
  bijgewerkt_op    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, adres),
  CHECK (status <> 'geverifieerd' OR bron IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS mail_afzenders_status_idx ON app.mail_afzenders (user_id, status, laatste_op DESC);
CREATE INDEX IF NOT EXISTS mail_afzenders_domein_idx ON app.mail_afzenders (user_id, domein);

CREATE TABLE IF NOT EXISTS app.mail_afzender_audit (
  user_id        text        PRIMARY KEY,
  account_id     text        NOT NULL DEFAULT '' CHECK (length(account_id) <= 300),
  staat          text        NOT NULL CHECK (staat IN ('bezig', 'gepauzeerd', 'klaar', 'fout')),
  page_token     text        NOT NULL DEFAULT '' CHECK (length(page_token) <= 500),
  verwerkt       integer     NOT NULL DEFAULT 0 CHECK (verwerkt >= 0),
  limiet         integer     NOT NULL DEFAULT 5000 CHECK (limiet BETWEEN 1 AND 50000),
  adressen       integer     NOT NULL DEFAULT 0,
  geverifieerd   integer     NOT NULL DEFAULT 0,
  verdacht       integer     NOT NULL DEFAULT 0,
  fout           text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,60}$'),
  gestart_op     timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  klaar_op       timestamptz
);

ALTER TABLE app.mail_afzenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mail_afzender_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_afzenders_eigen ON app.mail_afzenders;
CREATE POLICY mail_afzenders_eigen ON app.mail_afzenders
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS mail_afzender_audit_eigen ON app.mail_afzender_audit;
CREATE POLICY mail_afzender_audit_eigen ON app.mail_afzender_audit
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
