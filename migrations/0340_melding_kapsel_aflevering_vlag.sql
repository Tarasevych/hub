-- 0340 — Прапорець капсульного вигляду сповіщень, квитанцій доставки й перегляду (✓ / ✓✓) та адмінського контролю доставки (HERSTEL-001, 24.11.2026).
-- 0340 — Functievlag voor capsuleweergave van meldingen, aflever- en leesbewijzen (✓ / ✓✓) en beheercontrole van aflevering (HERSTEL-001, 24.11.2026).
-- Початковий стан вимкнено за правилом VLAG-001; опис <= 300 символів.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'melding-kapsel-aflevering-v1',
  'Компактні капсули сповіщень, квитанції доставки й прочитання (✓ / ✓✓), автоматичне прочитання при перегляді та контроль доставки для адміністратора. | Compacte meldingcapsules, aflever- en leesvinkjes (✓ / ✓✓), automatisch gelezen bij zicht en aflevercontrole voor beheer.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
