-- 0338 — Очищення активної черги від накопичених хибних карток відновлення Telegram зі збереженням повної історії (HERSTEL-001, 23.11.2026).
-- 0338 — Opruimen van de actieve wachtrij van opgehoopte valse Telegram-herstelmeldingen met volledig behoud van de geschiedenis (HERSTEL-001, 23.11.2026).
-- Жоден запис не вилучається з бази даних: усі історичні записи переводяться у прочитаний / вирішений стан.

UPDATE app.records
   SET data = jsonb_set(
         jsonb_set(data, '{read}', 'true'::jsonb, true),
         '{readAt}',
         COALESCE(data->'readAt', to_jsonb((extract(epoch from now()) * 1000)::bigint)),
         true
       ),
       updated_at = now()
 WHERE tbl = 'site_notifications'
   AND COALESCE(
         CASE
           WHEN jsonb_typeof(data->'read') = 'boolean' THEN (data->>'read')::boolean
           WHEN lower(COALESCE(data->>'read', '')) IN ('true', 'false') THEN (data->>'read')::boolean
           ELSE false
         END,
         false
       ) = false
   AND (
     COALESCE(data->>'message', '') LIKE '%Вхід через Telegram знову працює%'
     OR COALESCE(data->>'message', '') LIKE '%Aanmelden met Telegram werkt weer%'
   );

UPDATE app.melding_ecosysteem_gebeurtenissen
   SET status = 'opgelost',
       bijgewerkt_op = now()
 WHERE status IN ('nieuw', 'uitgesteld')
   AND (
     bericht LIKE '%Вхід через Telegram знову працює%'
     OR bericht LIKE '%Aanmelden met Telegram werkt weer%'
   );
