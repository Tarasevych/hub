// 0.9.5 (EXTUI-001): блок «Де працює» у pop-up і бічній панелі — чесно, без нових дозволів.
//  1) ця вкладка: tarasevych.com → працює; інший сайт → тут розширення не діє (сайти ШІ поки вимкнено, потрібен окремий дозвіл);
//  2) у фоні: з'єднання з сервером живе в самому розширенні, тож сайт можна закрити;
//  3) сайти ШІ: «!» — вимкнено, рішення за власником (дозвіл Chrome на нові адреси ще не запитується).
// Blok «Waar ze werkt»: dit tabblad, op de achtergrond, AI-sites (uit; vraagt geen nieuwe rechten). Alleen weergave.
(() => {
  const UI = globalThis.MR_UI;
  const el = document.getElementById('waar');
  if (!UI || !el) return;
  const t = UI.t;
  const AI_SITES = ['claude.ai', 'chatgpt.com', 'gemini.google.com', 'grok.com', 'copilot.microsoft.com'];
  const rij = (stand, teken, kop, uitleg, data) => UI.maak('li', { 'data-stand': stand, 'data-waar': data },
    UI.maak('span', { class: 'waar-pict', 'aria-hidden': 'true' }, teken), UI.maak('b', {}, kop), UI.maak('small', {}, uitleg));
  const host = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
  const teken = async () => {
    let h = '';
    try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); h = host(tab?.url || ''); } catch { /* geen tabs-API */ }
    let aiAan = false;
    try { aiAan = await chrome.permissions.contains({ origins: chrome.runtime.getManifest().optional_host_permissions || [] }); } catch { aiAan = false; }
    const eigen = h === 'tarasevych.com' || h.endsWith('.tarasevych.com');
    const ai = AI_SITES.some((s) => h === s || h.endsWith(`.${s}`));
    const lijst = UI.maak('ul', {},
      eigen ? rij('ok', '✓', t(`Ця вкладка · ${h}`, `Dit tabblad · ${h}`), t('Працює: ШІ бачить лише те, що ви дозволили.', 'Werkt: de AI ziet alleen wat u toestaat.'), 'tab')
        : rij(ai ? 'let-op' : 'uit', ai ? '!' : '–', h ? t(`Ця вкладка · ${h}`, `Dit tabblad · ${h}`) : t('Ця вкладка', 'Dit tabblad'),
          ai ? t('Сайт ШІ: тут розширення поки не діє — потрібен ваш окремий дозвіл (типово вимкнено).', 'AI-site: hier werkt de extensie nog niet — uw aparte toestemming is nodig (standaard uit).')
            : t('Тут розширення не діє: воно працює лише на tarasevych.com.', 'Hier werkt de extensie niet: alleen op tarasevych.com.'), 'tab'),
      rij('ok', '↻', t('У фоні', 'Op de achtergrond'), t('Зв’язок із сервером тримає саме розширення — сайт можна закрити.', 'De extensie houdt zelf de verbinding met de server — de site mag dicht.'), 'achtergrond'),
      rij('let-op', '!', t('Сайти ШІ', 'AI-sites'), aiAan
        ? t('«Завжди»: Chrome дав доступ. Вимкнути — у налаштуваннях розширення → Браузер і вкладки.', '«Altijd»: Chrome gaf toegang. Uitzetten — instellingen van de extensie → Browser en tabbladen.')
        : t('Вимкнено (типово). Увімкнення дасть ШІ бачити текст цих сторінок — у налаштуваннях розширення → Браузер і вкладки.', 'Uit (standaard). Aanzetten laat de AI de tekst van die pagina’s zien — instellingen van de extensie → Browser en tabbladen.'), 'ai-sites'),
    );
    el.replaceChildren(UI.maak('h2', {}, t('Де працює', 'Waar ze werkt')), lijst);
    el.hidden = false;
  };
  void teken();
  try { chrome.tabs.onActivated.addListener(() => void teken()); chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url) void teken(); }); } catch { /* pop-up zonder tabs-API */ }
})();
