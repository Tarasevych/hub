// Kaart met uitleg op mcp.tarasevych.com na het installeren: wat is gedaan, wat is de volgende stap en een knop die het in één klik doet.
// De kaart staat in een Shadow DOM met een "constructed stylesheet": de strenge CSP van de site (style-src 'self') blokkeert inline stijlen.
// Alles gebeurt met uw eigen sessie op deze pagina (zelfde herkomst); de extensie vraagt nooit om een wachtwoord.
const CSS = `
:host{all:initial}
.card{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border-radius:16px;background:#fff;color:#17212b;box-shadow:0 18px 48px rgba(0,0,0,.3),0 0 0 1px #d6dde4;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){.card{background:#1b2127;color:#f3f6f8;box-shadow:0 18px 48px rgba(0,0,0,.6),0 0 0 1px #3a444d}}
.head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.logo{width:28px;height:28px;border-radius:8px;background:#2f6f73;position:relative;flex:0 0 auto}
.logo::after{content:'';position:absolute;inset:8px;border-radius:50%;background:#fff}
h2{margin:0;font-size:15px;flex:1}
.x{border:0;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;border-radius:8px;width:30px;height:30px}
.x:hover{background:rgba(120,140,160,.2)}
ol{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px}
li{display:flex;gap:8px;align-items:center;padding:4px 8px;border-radius:8px}
li.done{color:#1a7f37}
li.now{background:rgba(47,111,115,.14);font-weight:700}
li.later{opacity:.6}
.m{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:11px;font-weight:800;background:rgba(120,140,160,.3)}
li.done .m{background:#1a7f37;color:#fff}li.now .m{background:#2f6f73;color:#fff}
p{margin:6px 0}
.note{color:#b45309}
.err{color:#b91c1c}
button.go{width:100%;min-height:42px;margin-top:6px;border:0;border-radius:10px;background:#2f6f73;color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer}
button.go:hover{filter:brightness(1.1)}
button.go[disabled]{opacity:.6;cursor:default}
button:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}
`;

const sessionBody = () => ({ service: 'mcp', tabContext: sessionStorage.getItem('tsv-canonical-tab-v1') || '', sourceOrigin: location.origin });
const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ...sessionBody(), ...body }) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

export function startGuide(chromeApi, version) {
  if (location.hostname !== 'mcp.tarasevych.com') return;
  if (document.getElementById('mr-ext-guide')) return;
  try { if (Date.now() - Number(sessionStorage.getItem('mr.ext.guide.dismissed') || 0) < 10 * 60_000) return; } catch { /* geen opslag */ }

  const host = document.createElement('div');
  host.id = 'mr-ext-guide';
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [sheet];
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Налаштування розширення Mijn Ruimte');
  root.append(card);

  let message = ''; let messageKind = ''; let busy = false;

  const status = () => chromeApi.runtime.sendMessage({ op: 'status' }).catch(() => null);
  const paint = async () => {
    const s = await status();
    if (!s) return;
    const paired = !!s.paired; const enabled = paired && !!s.enabled; const active = !!s.active;
    if (paired && enabled && active) { host.remove(); clearInterval(timer); return; }
    const first = !paired ? 0 : !enabled ? 1 : 2;
    const steps = ['Розширення встановлено', 'Підключити до вашого облікового запису', 'Увімкнути для ШІ', 'Увійти на сайті (ШІ стає активним)'];
    const states = [true, paired, enabled, active].map((done, i) => (done ? 'done' : i === first + 1 ? 'now' : 'later'));
    const goText = first === 0 ? 'Підключити зараз' : first === 1 ? 'Увімкнути для ШІ (лише читання)' : '';
    const help = first === 0
      ? 'Якщо ви ще не ввійшли на сайті, спершу увійдіть через Google (кнопка на сторінці), а потім натисніть «Підключити зараз».'
      : first === 1
        ? 'Розширення підключено. Увімкніть його для ШІ: за замовчуванням ШІ лише читає сторінки, а всі дії зі змінами чекають вашого «Дозволити». Детальні перемикачі: Агенти → Розширення браузера.'
        : 'Майже готово: залишайтеся на цій сторінці вхідним у кабінет. Через хвилину ШІ стане активним.';
    card.replaceChildren();
    const head = document.createElement('div'); head.className = 'head';
    const logo = document.createElement('span'); logo.className = 'logo';
    const h2 = document.createElement('h2'); h2.textContent = 'Завершіть налаштування Mijn Ruimte';
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Закрити підказку');
    x.onclick = () => { try { sessionStorage.setItem('mr.ext.guide.dismissed', String(Date.now())); } catch { /* geen opslag */ } host.remove(); clearInterval(timer); };
    head.append(logo, h2, x);
    const ol = document.createElement('ol');
    steps.forEach((label, i) => {
      const li = document.createElement('li'); li.className = states[i];
      const m = document.createElement('span'); m.className = 'm'; m.textContent = states[i] === 'done' ? '✓' : String(i + 1);
      li.append(m, document.createTextNode(label)); ol.append(li);
    });
    const p = document.createElement('p'); p.textContent = help;
    card.append(head, ol, p);
    if (goText) {
      const go = document.createElement('button'); go.className = 'go'; go.type = 'button'; go.textContent = busy ? 'Зачекайте…' : goText; go.disabled = busy;
      go.onclick = () => (first === 0 ? connect() : enable(s));
      card.append(go);
    }
    if (message) { const note = document.createElement('p'); note.className = messageKind; note.textContent = message; card.append(note); }
  };

  const connect = async () => {
    busy = true; message = ''; await paint();
    try {
      const code = await post('/api/owner/agents/pairing-code', {});
      if (!code.ok) { message = code.status === 401 || code.status === 403 ? 'Спершу увійдіть на сайті (кнопка входу на сторінці), потім натисніть ще раз.' : 'Не вдалося отримати код підключення. Спробуйте за хвилину.'; messageKind = 'note'; }
      else {
        const res = await fetch('/api/owner/agents/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: String(code.data.code || ''), name: browserName(), platform: 'browser', capabilities: { kind: 'browser', version } }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.token) { message = `Не вдалося підключити (${data.error || data.reasonCode || res.status}).`; messageKind = 'err'; }
        else {
          const ok = await chromeApi.runtime.sendMessage({ op: 'paired', token: data.token, agentId: data.agentId, server: location.origin, name: browserName() });
          message = ok && ok.ok ? 'Підключено! Тепер увімкніть для ШІ.' : 'Не вдалося зберегти підключення в браузері.'; messageKind = ok && ok.ok ? '' : 'err';
        }
      }
    } catch { message = 'Немає з’єднання із сайтом.'; messageKind = 'err'; }
    busy = false; await paint();
  };

  const enable = async (s) => {
    if (!s.agentId) { message = 'Оновіть сторінку й спробуйте ще раз.'; messageKind = 'note'; await paint(); return; }
    busy = true; message = ''; await paint();
    try {
      const r = await post(`/api/owner/agents/${s.agentId}/browser-enabled`, { enabled: true });
      message = r.ok ? 'Увімкнено. Залишилося, щоб сторінка була відкрита і ви були вхідним.' : 'Не вдалося увімкнути: увійдіть на сайті й спробуйте ще раз.'; messageKind = r.ok ? '' : 'note';
    } catch { message = 'Немає з’єднання із сайтом.'; messageKind = 'err'; }
    busy = false; await paint();
  };

  const timer = setInterval(paint, 4000);
  document.documentElement.append(host);
  paint();
}

function browserName() {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Vivaldi/.test(ua) ? 'Vivaldi' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  return `${name} (${navigator.platform || 'pc'})`;
}
