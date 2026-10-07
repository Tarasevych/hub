const stateEl = document.getElementById('dbgState');
const toggle = document.getElementById('dbgToggle');

async function refresh() {
  const on = await chrome.permissions.contains({ permissions: ['debugger'] });
  stateEl.textContent = on ? 'Дозвіл надано: глибока діагностика доступна (якщо ввімкнена на сайті).' : 'Дозвіл не надано: глибока діагностика недоступна.';
  stateEl.className = on ? 'ok' : 'off';
  toggle.textContent = on ? 'Забрати дозвіл' : 'Надати дозвіл';
  toggle.onclick = async () => {
    // Запит дозволу має виходити з кліку користувача на сторінці розширення.
    if (on) await chrome.permissions.remove({ permissions: ['debugger'] });
    else await chrome.permissions.request({ permissions: ['debugger'] });
    refresh();
  };
}
refresh();
