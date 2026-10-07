const stateEl = document.getElementById('state');
const hintEl = document.getElementById('hint');
const forgetEl = document.getElementById('forget');

async function refresh() {
  const s = await chrome.runtime.sendMessage({ op: 'status' }).catch(() => null);
  if (!s) { stateEl.textContent = 'Не вдалося отримати стан'; stateEl.className = 'off'; return; }
  forgetEl.hidden = !s.paired;
  if (!s.paired) {
    stateEl.textContent = 'Не підключено';
    stateEl.className = 'off';
    hintEl.textContent = s.error === 'revoked'
      ? 'Доступ було відкликано на сайті. Підключіть розширення знову.'
      : 'Відкрийте mcp.tarasevych.com → Агенти → «Розширення браузера» і натисніть «Підключити».';
  } else if (s.connected) {
    stateEl.textContent = 'Підключено';
    stateEl.className = 'ok';
    hintEl.textContent = 'Ваш ШІ-помічник бачить цю вкладку лише через ваш конектор. Дії зі змінами завжди чекають вашого «Дозволити» на сайті.';
  } else {
    stateEl.textContent = 'З’єднуємося…';
    stateEl.className = 'wait';
    hintEl.textContent = s.error ? 'Остання помилка: ' + s.error : '';
  }
}

forgetEl.addEventListener('click', async () => { await chrome.runtime.sendMessage({ op: 'forget' }); refresh(); });
refresh();
setInterval(refresh, 2000);
