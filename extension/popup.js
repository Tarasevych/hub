const SITE = 'https://mcp.tarasevych.com';
const stateEl = document.getElementById('state');
const hintEl = document.getElementById('hint');
const primaryEl = document.getElementById('primary');
const forgetEl = document.getElementById('forget');

const open = (path) => chrome.tabs.create({ url: `${SITE}${path}` });

function show(kind, text, hint, button) {
  stateEl.textContent = text;
  stateEl.className = kind;
  hintEl.textContent = hint || '';
  primaryEl.hidden = !button;
  if (button) { primaryEl.textContent = button.label; primaryEl.onclick = button.run; }
}

async function refresh() {
  const s = await chrome.runtime.sendMessage({ op: 'status' }).catch(() => null);
  if (!s) { show('off', 'Не вдалося отримати стан', ''); forgetEl.hidden = true; return; }
  forgetEl.hidden = !s.paired;
  if (!s.paired) {
    show('off', 'Не підключено',
      s.error === 'revoked' ? 'Доступ було відкликано на сайті. Підключіть розширення знову.' : 'Щоб ШІ міг користуватися розширенням, увійдіть на сайті й підключіть його.',
      { label: 'Увійти й підключити на сайті', run: () => open('/agents?extension=welcome') });
  } else if (s.enabled === false) {
    show('wait', 'Підключено, але вимкнено для ШІ', 'ШІ нічого не бачить і не робить, доки ви самі не ввімкнете це на сайті.',
      { label: 'Увімкнути на сайті', run: () => open('/agents?extension=welcome') });
  } else if (s.enabled && !s.active) {
    show('wait', 'Очікує входу на сайті', 'Розширення працює лише поки ви ввійшли на сайті. Відкрийте сайт і увійдіть, щоб відновити роботу.',
      { label: 'Увійти на сайті', run: () => open('/agents') });
  } else if (s.active) {
    show('ok', 'ШІ активний', `Увімкнено можливостей: ${(s.capabilities || []).length}. Дії зі змінами завжди чекають вашого «Дозволити» на сайті.`,
      { label: 'Налаштувати доступи на сайті', run: () => open('/agents') });
  } else if (s.connected) {
    show('ok', 'Підключено', '');
  } else {
    show('wait', 'З’єднуємося…', s.error ? 'Остання помилка: ' + s.error : '');
  }
}

document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
forgetEl.addEventListener('click', async () => { await chrome.runtime.sendMessage({ op: 'forget' }); refresh(); });
refresh();
setInterval(refresh, 3000);
