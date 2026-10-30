-- 0028: «AI mag deze browser gebruiken» geldt voortaan zo lang als de EIGENAAR kiest (standaard: tot hij het zelf uitzet),
-- niet meer automatisch alleen zolang een zichtbare pagina van de site elke paar minuten bevestigt. De stand staat in
-- policy.activatie: 'vast' (vaste termijn of tot uitzetten; de hartslag raakt armed_until niet) of 'sessie' (oude stand).
-- Browsers die de eigenaar nu al heeft aangezet, krijgen «tot u uitzet» (dat was zijn bedoeling); uitgezette blijven uit.
UPDATE app.agents
   SET policy = jsonb_set(coalesce(policy, '{}'::jsonb), '{activatie}', '"vast"'::jsonb),
       armed_until = make_timestamptz(2999, 1, 1, 0, 0, 0, 'UTC')
 WHERE platform = 'browser' AND browser_enabled AND revoked_at IS NULL
   AND NOT (coalesce(policy, '{}'::jsonb) ? 'activatie');
