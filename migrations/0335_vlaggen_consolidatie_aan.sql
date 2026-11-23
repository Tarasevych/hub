-- 0335 (CONSOL-001, Віха M5-Б, 23.11.2026): узгоджене ввімкнення перевірених прикладних прапорців можливостей «Для всіх».
-- П'ять безпекових прапорців способів входу та гостьових кодів залишаються у стані «Тільки для власника» за рішенням власника.
-- Архівні записи (gearchiveerd_op IS NOT NULL) не змінюються. Міграція є повторюваною та зворотно сумісною зі старішим кодом.
-- Geconsolideerde inschakeling van toepassingsvlaggen «Voor iedereen»; de vijf beveiligingsvlaggen voor aanmelding en gastcodes blijven ongewijzigd.

UPDATE app.feature_flags
SET aan = true,
    standaard = true
WHERE sleutel NOT IN (
  'gastcodes-iedereen',
  'aanmelden-passkey',
  'aanmelden-wachtwoord',
  'aanmelden-extern',
  'aanmelden-sms'
)
  AND gearchiveerd_op IS NULL;
