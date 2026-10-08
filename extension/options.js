// Opties 0.4: geen runtime-verzoek om extra rechten meer (debugger staat vast in het manifest); alleen de keuze diagOptIn en een zelftest.
const manifest = chrome.runtime.getManifest();
document.getElementById('version').textContent = `Версія / versie ${manifest.version}`;
document.getElementById('open-site').addEventListener('click', () => chrome.tabs.create({ url: 'https://mcp.tarasevych.com/agents#extension' }));

const diag = document.getElementById('diag');
chrome.storage.local.get('diagOptIn').then((v) => { diag.checked = v.diagOptIn === true; });
diag.addEventListener('change', async () => {
  diag.disabled = true;
  const r = await chrome.runtime.sendMessage({ op: 'set-diag', on: diag.checked }).catch(() => null);
  if (!r || !r.ok) diag.checked = !diag.checked;
  diag.disabled = false;
});

const LABELS = {
  paired: ['Підключено до облікового запису', 'Gekoppeld aan het account'],
  command_key: ['Ключ підпису команд', 'Sleutel voor ondertekende opdrachten'],
  connected: ['З’єднання з сервером', 'Verbinding met de server'],
  settings: ['Дозволи отримано від сервера', 'Toestemmingen ontvangen van de server'],
  debugger_permission: ['Дозвіл налагоджувача в Chrome', 'Debuggerrecht in Chrome'],
  diag_opt_in: ['Діагностику дозволено', 'Diagnose toegestaan'],
  site_tab: ['Відкрита вкладка Mijn Ruimte', 'Open Mijn Ruimte-tabblad'],
  bridge: ['Розширення активне на сторінці', 'Extensie actief op de pagina'],
  account: ['Той самий обліковий запис на сторінці', 'Zelfde account op de pagina'],
};
document.getElementById('self-test').addEventListener('click', async () => {
  const out = document.getElementById('self-test-result');
  const list = document.getElementById('checks');
  out.textContent = '…';
  const r = await chrome.runtime.sendMessage({ op: 'self-test' }).catch(() => null);
  if (!r) { out.textContent = 'Не вдалося виконати тест / Test mislukt'; out.className = 'off'; return; }
  out.textContent = r.ok ? 'Усе гаразд / Alles in orde' : 'Є проблеми, див. нижче / Er zijn problemen, zie hieronder';
  out.className = r.ok ? 'ok' : 'off';
  list.replaceChildren(...r.checks.map((c) => {
    const li = document.createElement('li');
    const [uk, nl] = LABELS[c.id] || [c.id, c.id];
    li.className = c.ok ? 'ok' : 'off';
    li.textContent = `${c.ok ? '✓' : '✗'} ${uk} / ${nl}${c.detail ? ` — ${c.detail}` : ''}`;
    return li;
  }));
});
