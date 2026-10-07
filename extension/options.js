const stateEl = document.getElementById('dbgState');
const toggle = document.getElementById('dbgToggle');
const noteEl = document.getElementById('dbgNote');
const versionEl = document.getElementById('version');

const manifest = chrome.runtime.getManifest();
versionEl.textContent = `Версія розширення: ${manifest.version}`;
const declared = (manifest.optional_permissions || []).includes('debugger');

function say(kind, text) { noteEl.textContent = text; noteEl.className = kind; }

async function refresh() {
  if (!declared) {
    stateEl.textContent = 'Ця версія розширення не підтримує необов’язковий дозвіл «debugger».';
    stateEl.className = 'err';
    toggle.hidden = true;
    say('err', 'Оновіть розширення: відкрийте сторінку розширень браузера, натисніть «Оновити» (або видаліть і встановіть заново з кабінету), потім відкрийте цю сторінку знову.');
    return;
  }
  const on = await chrome.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
  stateEl.textContent = on ? 'Дозвіл надано: глибока діагностика доступна (якщо ввімкнена на сайті).' : 'Дозвіл не надано: глибока діагностика недоступна.';
  stateEl.className = on ? 'ok' : 'off';
  toggle.hidden = false;
  toggle.textContent = on ? 'Забрати дозвіл' : 'Надати дозвіл';
  toggle.dataset.on = on ? '1' : '0';
}

// Запит дозволу має виходити безпосередньо з кліку користувача на цій сторінці. Помилку або відмову показуємо текстом, а не мовчимо.
toggle.addEventListener('click', async () => {
  say('', 'Чекаємо на відповідь браузера…');
  toggle.disabled = true;
  try {
    if (toggle.dataset.on === '1') {
      await chrome.permissions.remove({ permissions: ['debugger'] });
      say('ok', 'Дозвіл забрано.');
    } else {
      const granted = await chrome.permissions.request({ permissions: ['debugger'] });
      say(granted ? 'ok' : 'err', granted ? 'Дозвіл надано.' : 'Браузер не надав дозвіл: ви його відхилили або вікно запиту закрилося. Натисніть кнопку ще раз і підтвердьте запит у верхній частині вікна браузера.');
    }
  } catch (error) {
    say('err', `Браузер відхилив запит: ${error && error.message ? error.message : error}`);
  }
  toggle.disabled = false;
  refresh();
});
refresh();
