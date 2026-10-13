-- 0034: telling van de beleidsdienst (OPA) in schaduwmodus (architectuur 13.10.2026, etap 6).
--   Per actie (bijv. admin:users.manage) en uitkomst:
--     gelijk         OPA «huidig» = besluit van de app;
--     verschil       OPA «huidig» ≠ app (fout in beleid of code — moet 0 zijn vóór afdwingen);
--     doel-weigert   app staat toe, maar het doelbeleid (alleen in een actief technisch profiel) zou weigeren;
--     onbereikbaar   OPA antwoordde niet (binnen 300 ms) — in schaduw zonder gevolg.
--   Alleen tellers en tijden, geen id's, e-mail of inhoud. Schrijven via de systeemrol; de app-rol niets.
CREATE TABLE IF NOT EXISTS app.beleid_schaduw (
  actie    text NOT NULL CHECK (actie ~ '^[a-z]+:[a-z.]{2,40}$'),
  uitkomst text NOT NULL CHECK (uitkomst IN ('gelijk', 'verschil', 'doel-weigert', 'onbereikbaar')),
  reden    text NOT NULL DEFAULT '' CHECK (char_length(reden) <= 60),
  aantal   bigint NOT NULL DEFAULT 0,
  eerst    timestamptz NOT NULL DEFAULT now(),
  laatst   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actie, uitkomst, reden)
);
ALTER TABLE app.beleid_schaduw ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beleid_schaduw_geen_app ON app.beleid_schaduw;
CREATE POLICY beleid_schaduw_geen_app ON app.beleid_schaduw USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
