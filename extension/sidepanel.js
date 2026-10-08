// Zijpaneel 0.4: toont de stand, het account en wat de AI nu mag (zoals de server het laatst pushte), met een Стоп-knop en een test.
const SITE = 'https://mcp.tarasevych.com';
const NAMES = {
  'browser.read': ['Читати сторінки', 'Pagina\'s lezen'], 'browser.navigate': ['Відкривати сторінки', 'Pagina\'s openen'],
  'browser.interact': ['Натискати й вводити', 'Klikken en typen'], 'browser.screenshot': ['Знімки екрана', 'Schermafbeeldingen'],
  'browser.debug': ['Глибока діагностика', 'Diepe diagnose'],
};
const $ = (id) => document.getElementById(id);
const fmt = (iso) => { try { return new Date(iso).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

async function refresh() {
  const s = await chrome.runtime.sendMessage({ op: 'status' }).catch(() => null);
  if (!s) { $('state').textContent = 'Немає стану / Geen status'; return; }
  const [cls, uk, nl] = !s.paired ? ['off', 'Не підключено', 'Niet gekoppeld']
    : s.blocked ? ['warn', 'Доступ ШІ заблоковано', 'AI-toegang geblokkeerd']
    : s.error === 'stopped' ? ['warn', 'Зупинено («Стоп»)', 'Gestopt ("Stop")']
    : !s.connected ? ['off', 'Немає з’єднання', 'Geen verbinding']
    : s.debugging ? ['warn', 'Іде глибока діагностика', 'Diepe diagnose bezig']
    : ['ok', 'Підключено', 'Verbonden'];
  $('state').className = cls;
  $('state').textContent = `${uk} / ${nl}`;
  $('account').className = s.account === 'mismatch' ? 'warn' : 'hint';
  $('account').textContent = s.account === 'ok' ? 'Сторінка: ваш обліковий запис / Pagina: uw account'
    : s.account === 'mismatch' ? 'Увага: на сторінці інший обліковий запис — команди ШІ відхиляються / Let op: ander account op de pagina — AI-opdrachten worden geweigerd'
    : 'Обліковий запис на сторінці невідомий (увійдіть на сайті) / Account op de pagina onbekend (log in op de site)';
  const caps = Array.isArray(s.caps) ? s.caps : [];
  $('nocaps').hidden = caps.length > 0;
  $('caps').replaceChildren(...caps.map((c) => {
    const row = document.createElement('div'); row.className = 'cap';
    const [uk2, nl2] = NAMES[c.capability] || [c.capability, c.capability];
    const left = document.createElement('span'); left.textContent = `${uk2} / ${nl2}${c.always ? ' · завжди / altijd' : ''}`;
    const right = document.createElement('span'); right.className = 'nl';
    right.textContent = `до / tot ${fmt(c.expiresAt)}${c.domains && c.domains.length ? ` · ${c.domains.join(', ')}` : ''}`;
    row.append(left, right); return row;
  }));
  $('stop').disabled = !s.paired;
}
$('stop').addEventListener('click', async () => { await chrome.runtime.sendMessage({ op: 'local-stop' }); refresh(); });
$('site-stop').addEventListener('click', () => chrome.tabs.create({ url: `${SITE}/agents?stop=1#ai-toegang` }));
$('test').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ op: 'self-test' }).catch(() => null);
  $('checks').replaceChildren(...((r && r.checks) || []).map((c) => { const li = document.createElement('li'); li.textContent = `${c.ok ? '✓' : '✗'} ${c.id}${c.detail ? ` — ${c.detail}` : ''}`; return li; }));
});
refresh();
setInterval(refresh, 3000);
