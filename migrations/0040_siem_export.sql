-- 0040: export van het journaal (app.audit) naar uw EIGEN SIEM (etap E): een NDJSON-bestand op de server (voor Wazuh-agent,
--   Promtail, Vector, Fluent Bit…) en/of Loki op dezelfde machine (alleen loopback). Uit tenzij /etc/mijn-ruimte/siem.env bestaat.
--   Per bestemming een eigen cursor: valt Loki even weg, dan krijgt het bestand geen dubbele regels (en omgekeerd).
--   Alleen de systeemrol; de app-rol ziet niets.
CREATE TABLE IF NOT EXISTS app.siem_export (
  bestemming      text        PRIMARY KEY CHECK (bestemming IN ('bestand', 'loki')),
  laatste_id      bigint      NOT NULL DEFAULT 0,
  geexporteerd    bigint      NOT NULL DEFAULT 0,
  fouten          int         NOT NULL DEFAULT 0,
  laatste_fout    text        CHECK (char_length(laatste_fout) <= 300),
  laatste_fout_op timestamptz,
  bijgewerkt      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.siem_export ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS siem_export_geen_app ON app.siem_export;
CREATE POLICY siem_export_geen_app ON app.siem_export USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
