-- Віха M2 (CONSOL-001): прапорці карткового подання розділу «Способи входу» (UI-015A, №167) та наочного вікна входу через Telegram (№169).
-- Mijlpaal M2 (CONSOL-001): functievlaggen voor de kaartweergave van «Aanmeldmethoden» (UI-015A, #167) en het uitgebreide Telegram-aanmeldvenster (#169).
-- За правилом VLAG-001 (B-027) нові прапорці реєструються зі станом false, false і вмикаються окремою завершальною міграцією.

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'aanmeldmethoden-kaart-v2',
  'Картковий режим розділу «Способи входу»: згортані групи з лічильниками, плитки постачальників, двомовний пошук і бічна панель подробиць. | Kaartweergave van «Aanmeldmethoden»: inklapbare groepen met tellers, aanbiedertegels, zoeken en zijpaneel.',
  false,
  false
)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'telegram-aanmeld-maket-v1',
  'Наочний вигляд вікна входу через Telegram: шкала залишку часу, кроки перевірки, зразок картки бота й перемикач компактного або студійного подання. | Visuele weergave voor Telegram-aanmelden: tijdsbalk, stappen, voorbeeldkaart en compact/uitgebreid-keuze.',
  false,
  false
)
ON CONFLICT (sleutel) DO NOTHING;
