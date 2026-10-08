const SITE = 'https://mcp.tarasevych.com';
const stateEl = document.getElementById('state');
const hintEl = document.getElementById('hint');
const stepsEl = document.getElementById('steps');
const primaryEl = document.getElementById('primary');
const forgetEl = document.getElementById('forget');

const open = (path) => chrome.tabs.create({ url: `${SITE}${path}` });

function render(kind, text, hint, steps, button) {
  stateEl.textContent = text;
  stateEl.className = kind;
  hintEl.textContent = hint || '';
  stepsEl.replaceChildren(...steps.map((s) => {
    const li = document.createElement('li');
    li.className = s.state; // done | now | later
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = s.state === 'done' ? '✓' : s.state === 'now' ? '→' : '○';
    const label = document.createElement('span');
    label.textContent = s.label;
    li.append(mark, label);
    return li;
  }));
  primaryEl.hidden = !button;
  if (button) { primaryEl.textContent = button.label; primaryEl.onclick = button.run; }
}

async function refresh() {
  const s = await chrome.runtime.sendMessage({ op: 'status' }).catch(() => null);
  if (!s) {
    forgetEl.hidden = true;
    render('off', 'Не вдалося отримати стан', 'Спробуйте закрити й знову відкрити це вікно.', [], null);
    return;
  }
  forgetEl.hidden = !s.paired;
  const paired = !!s.paired;
  // 0.4: "увімкнено" = є чинні дозволи (grants) від сервера і браузер не вимкнено на сайті.
  const enabled = paired && !!s.enabled && Array.isArray(s.caps) && s.caps.length > 0;
  const active = !!s.active && !!s.connected;
  const first = !paired ? 'paired' : !enabled ? 'enabled' : !active ? 'active' : '';
  const mk = (id, label, done) => ({ label, state: done ? 'done' : id === first ? 'now' : 'later' });
  const steps = [
    { label: 'Розширення встановлено', state: 'done' },
    mk('paired', 'Підключено до вашого облікового запису', paired),
    mk('enabled', 'Увімкнено для ШІ на сайті', enabled),
    mk('active', 'Ви ввійшли на сайті (ШІ активний)', active),
  ];
  if (paired && s.account === 'mismatch') {
    render('wait', 'Інший обліковий запис на сторінці / Ander account op de pagina',
      'Розширення підключено до іншого облікового запису, ніж той, що зараз на сайті. Команди ШІ відхиляються, доки ви не ввійдете тим самим обліковим записом. / De pagina is van een ander account; AI-opdrachten worden geweigerd.',
      steps, { label: 'Відкрити сайт / Site openen', run: () => open('/agents') });
    return;
  }
  if (!paired) {
    render('off', 'Потрібне підключення',
      s.error === 'revoked' ? 'Доступ було відкликано на сайті. Підключіть розширення знову.' : 'Відкрийте сайт, увійдіть через Google і підключіть розширення: на сайті все підкаже.',
      steps, { label: 'Увійти й підключити', run: () => open('/agents?extension=welcome#extension') });
  } else if (!enabled) {
    render('wait', 'Підключено, але ШІ вимкнено', 'ШІ нічого не бачить і не робить, доки ви самі не ввімкнете це на сайті.',
      steps, { label: 'Увімкнути для ШІ', run: () => open('/agents?extension=welcome#extension') });
  } else if (!active) {
    render('wait', 'Очікує входу на сайті', 'Розширення працює лише поки ви ввійшли на сайті. Відкрийте сайт і увійдіть: ШІ відновиться за хвилину.',
      steps, { label: 'Увійти на сайті', run: () => open('/agents') });
  } else {
    render('ok', 'ШІ активний', `Дозволів: ${(s.caps || []).length} (епоха ${s.epoch}). Дії зі змінами чекають вашого «Дозволити», якщо ви не ввімкнули «завжди». / Toestemmingen: ${(s.caps || []).length}.`,
      steps, { label: 'Налаштувати доступи', run: () => open('/agents#extension') });
  }
}

document.getElementById('site').addEventListener('click', () => open('/agents'));
document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('panel').addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent().catch(() => null);
  try { if (win) await chrome.sidePanel.open({ windowId: win.id }); } catch { /* niet ondersteund */ }
  window.close();
});
forgetEl.addEventListener('click', async () => { await chrome.runtime.sendMessage({ op: 'forget' }); refresh(); });
refresh();
setInterval(refresh, 3000);
