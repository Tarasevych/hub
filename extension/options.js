const manifest = chrome.runtime.getManifest();
document.getElementById('version').textContent = `Версія розширення: ${manifest.version}`;
const debugEdition = (manifest.permissions || []).includes('debugger');
const state = document.getElementById('edition');
const info = document.getElementById('edition-info');
if (debugEdition) {
  state.textContent = 'Встановлено видання «з режимом налагодження».';
  state.className = 'ok';
  info.textContent = 'Коли ви дозволите ШІ глибоку діагностику, Chrome на кілька секунд покаже жовту смугу «розпочав налагодження цього браузера». Це стандартне повідомлення Chrome, а не збій. Без вашого «Дозволити» на сайті налагоджувач не під’єднується.';
} else {
  state.textContent = 'Встановлено звичайне видання (без режиму налагодження).';
  state.className = 'off';
  info.textContent = 'Глибока діагностика працює спрощено (збирач помилок усередині сторінки), без банера Chrome. Режим налагодження доступний як окреме видання: оберіть його в майстрі встановлення на сайті (mcp.tarasevych.com → Агенти → Розширення браузера, прапорець «Режим налагодження»).';
}
