// 0.9.5 (EXTUI-001, рішення власника 16.11.2026): «Сайти ШІ» — опція, типово «Вимкнено».
// «Завжди» → chrome.permissions.request (лише з кліку, як вимагає Chrome); «Вимкнено» → chrome.permissions.remove (дозвіл одразу
// повертається Chrome). Стан читаємо в Chrome, а не в сховищі: єдине джерело правди. Запис у центр сповіщень робить background.js
// (permissions.onAdded/onRemoved). AI-sites: optie, standaard uit; het recht vraagt/geeft de extensie terug aan Chrome.
(() => {
  const UI = globalThis.MR_UI;
  const sel = document.getElementById('ai-sites');
  const stand = document.getElementById('ai-sites-stand');
  if (!UI || !sel || !stand) return;
  const t = UI.t;
  const origins = (chrome.runtime.getManifest().optional_host_permissions || []).slice();
  const toon = async () => {
    let aan = false;
    try { aan = await chrome.permissions.contains({ origins }); } catch { aan = false; }
    sel.value = aan ? 'altijd' : 'uit';
    stand.className = `diag-werkelijk ${aan ? 'fout' : 'ok'}`;
    stand.textContent = aan
      ? t('Завжди: ШІ може ЛИШЕ ЧИТАТИ ті сайти ШІ, які ви позначили під час відкриття доступу на сайті. Натискати чи вводити текст там він не може.', 'Altijd: de AI mag ALLEEN LEZEN op de AI-sites die u bij het openen van de toegang op de site aanvinkte. Klikken of typen daar kan hij niet.')
      : t('Вимкнено: на сайтах ШІ розширення нічого не читає й не виконує.', 'Uit: op AI-sites leest en doet de extensie niets.');
  };
  sel.addEventListener('change', () => {
    // Запит МАЄ йти синхронно з жесту користувача, тож без await перед ним. Het verzoek moet rechtstreeks uit de klik komen.
    const p = sel.value === 'altijd' ? chrome.permissions.request({ origins }) : chrome.permissions.remove({ origins });
    sel.setAttribute('aria-busy', 'true');
    Promise.resolve(p).catch(() => false).finally(() => { sel.removeAttribute('aria-busy'); void toon(); });
  });
  void toon();
})();
