// Zijpaneel 0.6: dezelfde kaarten als de pop-up (groter), «Керування на сайті» (hub#toegang), een tijdlijn PER SLOT ({op:'log'}: tijd,
// soort, gelukt/fout, bron ws/lokaal — NOOIT parameters of inhoud), «Що бачить ШІ» voor het slot dat bij het actieve tabblad hoort,
// en de zelftest. De tijdlijn van het technische slot bestaat alleen als zijn kaart bestaat (ui.js: sloten.technisch niet null).
const UI = globalThis.MR_UI;
const $ = (id) => document.getElementById(id);

const BRON = { ws: ['ШІ через сервер', 'AI via de server'], lokaal: ['Локальний агент', 'Lokale agent'] };
let zichtbaar = ['prive'];

function regelsVan(r) {
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.regels)) return r.regels;
  if (r && Array.isArray(r.log)) return r.log;
  return [];
}

async function toonLog() {
  const r = await UI.vraag({ op: 'log' });
  // Alleen deze velden worden gelezen: at, type, ok, bron, ruimte, fout (code). Al het andere (ook eventuele params) blijft buiten beeld.
  const regels = regelsVan(r).filter((x) => x && typeof x === 'object')
    .map((x) => ({ at: Number(x.at) || 0, type: String(x.type || '?').slice(0, 60), ok: x.ok === true, bron: x.bron === 'lokaal' ? 'lokaal' : 'ws',
      ruimte: x.ruimte === 'technisch' ? 'technisch' : 'prive', fout: x.fout ? String(x.fout).slice(0, 80) : '' }))
    .sort((a, b) => b.at - a.at);
  const blokken = zichtbaar.map((ruimte) => {
    const eigen = regels.filter((x) => x.ruimte === ruimte).slice(0, 30);
    const ol = UI.maak('ol', { id: `tijdlijn-${ruimte}`, class: 'tijdlijn', 'aria-label': UI.t(UI.TITEL[ruimte][0], UI.TITEL[ruimte][1]) });
    ol.replaceChildren(...eigen.map((x) => {
      const li = UI.maak('li', { class: x.ok ? 'ok' : 'fout' },
        UI.maak('span', { class: 'tijd' }, x.at ? UI.tijd(x.at) : '—'),
        UI.maak('span', { class: 'type' }, x.type),
        UI.maak('span', null, x.ok ? `✓ ${UI.t('виконано', 'gelukt')}` : `✗ ${UI.t('помилка', 'fout')}`),
        UI.maak('span', { class: 'bron' }, `${UI.t(BRON[x.bron][0], BRON[x.bron][1])}${x.fout ? ` · ${x.fout}` : ''}`));
      return li;
    }));
    const leeg = UI.maak('p', { id: `tijdlijn-leeg-${ruimte}`, class: 'zacht', hidden: eigen.length > 0 }, UI.t('Ще жодної команди.', 'Nog geen opdrachten.'));
    return UI.maak('div', { class: 'tijdlijn-blok', 'data-ruimte': ruimte }, UI.maak('h3', null, UI.t(UI.TITEL[ruimte][0], UI.TITEL[ruimte][1])), ol, leeg);
  });
  $('tijdlijnen').replaceChildren(...blokken);
}

// ---------------------------------------------------------------- 0.7.0: chat «ШІ для вас» naast het actieve tabblad
// Het slot volgt het profiel van het actieve tabblad (technisch tabblad + technisch slot → technisch; anders privé). De berichten
// blijven alleen in dit paneel (geheugen van de pagina); de server krijgt per vraag de hele geschiedenis (tekst) en alleen de
// browserhulpmiddelen. Welke acties mogen, beslist de matrix «Браузер і агенти» op de site — hier staat geen tweede regel.
const chat = { ruimte: 'prive', open: false, berichten: [], bezig: false };
const CHAT_FOUT = {
  NIET_GEKOPPELD: ['Цей слот не підключено до сайту.', 'Dit slot is niet aan de site gekoppeld.'],
  VERGRENDELD: ['Слот заблоковано — відкрийте доступ на сайті («Браузер і агенти»).', 'Het slot is vergrendeld — open de toegang op de site («Browser en agenten»).'],
  EXTENSIE_VERGRENDELD: ['Слот заблоковано — відкрийте доступ на сайті («Браузер і агенти»).', 'Het slot is vergrendeld — open de toegang op de site («Browser en agenten»).'],
  API_RECHT_VEREIST: ['Для чату потрібне право «API-платформа» (його дає власник).', 'Voor de chat is het recht «API-platform» nodig (dat geeft de eigenaar).'],
  AI_WERKRUIMTE_GEEN_SLEUTEL: ['Ключа Anthropic немає у сховищі на сайті.', 'Geen Anthropic-sleutel in de kluis op de site.'],
  AI_WERKRUIMTE_GEEN_MODEL: ['Власник сервера не налаштував модель (CHAT_MODEL).', 'De eigenaar van de server stelde geen model in (CHAT_MODEL).'],
  AI_WERKRUIMTE_TE_VEEL: ['Забагато запитів за хвилину. Зачекайте.', 'Te veel verzoeken per minuut. Wacht even.'],
  TOKEN_INVALID: ['Підключення слота недійсне — підключіть розширення заново.', 'De koppeling van het slot is ongeldig — koppel de extensie opnieuw.'],
  TECH_PROFILE_OFF: ['Технічний профіль не активний — активуйте його у вкладці.', 'Het technische profiel is niet actief — activeer het in het tabblad.'],
  NETWERK: ['Немає зв’язку із сервером.', 'Geen verbinding met de server.'],
  LEEG: ['Напишіть питання.', 'Schrijf een vraag.'],
};
function toonChat() {
  const sectie = document.querySelector('section.chat');
  sectie.dataset.chatRuimte = chat.ruimte;
  $('chat-voor').textContent = `${UI.t('Слот', 'Slot')}: ${UI.t(UI.TITEL[chat.ruimte][0], UI.TITEL[chat.ruimte][1])} · ${chat.open ? UI.t('доступ відкрито — агент бачить цю вкладку і діє за матрицею на сайті', 'toegang open — de agent ziet dit tabblad en handelt volgens de matrix op de site') : UI.t('заблоковано — спершу відкрийте доступ на сайті', 'vergrendeld — open eerst de toegang op de site')}`;
  $('chat-verstuur').disabled = chat.bezig || !chat.open;
  $('chat-wissen').disabled = chat.bezig || chat.berichten.length === 0;
  $('chat-berichten').replaceChildren(...chat.berichten.map((m) => {
    const li = UI.maak('li', { 'data-rol': m.rol }, m.tekst);
    if (m.stappen && m.stappen.length) li.append(UI.maak('span', { class: 'stappen' }, `${UI.t('інструменти', 'hulpmiddelen')}: ${m.stappen.map((s) => `${s.tool}${s.isError ? ' ✗' : ''}`).join(', ')}`));
    if (m.onvolledig) li.append(UI.maak('span', { class: 'stappen' }, UI.t('(відповідь неповна — напишіть «продовжуй»)', '(antwoord onvolledig — schrijf «ga verder»)')));
    return li;
  }));
  const lijst = $('chat-berichten'); lijst.scrollTop = lijst.scrollHeight;
}
async function chatVersturen() {
  const veld = $('chat-invoer');
  const tekst = String(veld.value || '').trim();
  if (!tekst || chat.bezig || !chat.open) return;
  chat.berichten.push({ rol: 'user', tekst }); veld.value = ''; chat.bezig = true; $('chat-stand').textContent = UI.t('Думаю…', 'Even denken…'); toonChat();
  let tab = null;
  try { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (t && /^https:\/\/[^/]+\.tarasevych\.com\//.test(String(t.url || ''))) tab = { url: t.url, title: t.title }; } catch { /* geen tab */ }
  const r = await UI.vraag({ op: 'zijpaneel-chat', ruimte: chat.ruimte, messages: chat.berichten.map((m) => ({ role: m.rol, content: m.tekst })), ...(tab ? { tab } : {}) });
  chat.bezig = false;
  if (r && r.ok) { chat.berichten.push({ rol: 'assistant', tekst: r.reply || '', stappen: r.steps || [], onvolledig: r.truncated === true }); $('chat-stand').textContent = r.model ? `${UI.t('Модель', 'Model')}: ${r.model}` : ''; }
  else { const f = CHAT_FOUT[r && r.code] || null; $('chat-stand').textContent = `${UI.t('Не вдалося', 'Mislukt')}: ${f ? UI.t(f[0], f[1]) : String((r && r.code) || '?')}${r && r.detail ? ` (${r.detail})` : ''}`; }
  toonChat();
}
$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); void chatVersturen(); });
$('chat-wissen').addEventListener('click', () => { chat.berichten = []; $('chat-stand').textContent = ''; toonChat(); });
$('chat-invoer').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void chatVersturen(); } });

function toonZiet(s, sl) {
  zichtbaar = sl.technisch ? (s && s.profielTab === 'technisch' ? ['technisch', 'prive'] : ['prive', 'technisch']) : ['prive'];
  const ruimte = sl.technisch && s && s.profielTab === 'technisch' ? 'technisch' : 'prive';
  // chat: zelfde slot als «Що бачить ШІ»; open = ontgrendeld of agent
  { const slotC = ruimte === 'technisch' ? sl.technisch : sl.prive; chat.ruimte = ruimte; chat.open = !!slotC && UI.isOpen(UI.staatVan(slotC)); if (!chat.bezig) toonChat(); }
  const slot = ruimte === 'technisch' ? sl.technisch : sl.prive;
  const o = slot && UI.isOpen(UI.staatVan(slot)) ? slot.ontgrendeling : null;
  const aan = new Set(o && Array.isArray(o.caps) ? o.caps.map(String) : []);
  $('ziet-voor').textContent = `${UI.t('Для', 'Voor')}: ${UI.t(UI.TITEL[ruimte][0], UI.TITEL[ruimte][1])}`;
  // 0.7.0: alleen de mogelijkheden die in DIT slot kunnen bestaan (diepe diagnose en scripts zijn technisch; shared/extensie-matrix.ts).
  const vanSlot = UI.BROWSER_CAPS.filter((c) => ruimte === 'technisch' || (c !== 'browser.debug' && c !== 'browser.script'));
  $('ziet').replaceChildren(...vanSlot.map((c) => {
    const li = UI.maak('li', { 'data-aan': aan.has(c) ? 'ja' : 'nee' },
      UI.maak('span', { class: 'naam' }, UI.maak('span', null, UI.capNaam(c)),
        UI.maak('span', { class: aan.has(c) ? 'ok' : 'zacht' }, aan.has(c) ? UI.t('дозволено зараз', 'nu toegestaan') : UI.t('не дозволено', 'niet toegestaan'))),
      UI.maak('span', { class: 'uitleg' }, UI.t(UI.CAP_UITLEG[c][0], UI.CAP_UITLEG[c][1])));
    return li;
  }));
  void toonLog();
}

const LABELS = {
  paired: ['підключено', 'gekoppeld'], command_key: ['ключ підпису', 'ondertekensleutel'], connected: ['з’єднання', 'verbinding'],
  settings: ['дозволи від сервера', 'toestemmingen van de server'], unlocked: ['доступ відкрито', 'toegang open'],
};
function checkTekst(c) {
  const [ruimte, id] = String(c.id).includes('.') ? String(c.id).split('.') : [null, String(c.id)];
  const naam = ruimte && UI.TITEL[ruimte] ? `${UI.t(UI.TITEL[ruimte][0], UI.TITEL[ruimte][1])}: ${LABELS[id] ? UI.t(LABELS[id][0], LABELS[id][1]) : id}` : id;
  return `${c.ok ? '✓' : '✗'} ${naam}${c.detail ? ` — ${String(c.detail)}` : ''}`;
}

$('opties').addEventListener('click', () => { void chrome.runtime.openOptionsPage(); });
$('test').addEventListener('click', async () => {
  const uit = $('test-uitkomst');
  uit.textContent = '…';
  const r = await UI.vraag({ op: 'self-test' });
  if (!r || !Array.isArray(r.checks)) { uit.textContent = UI.t('Не вдалося виконати тест', 'Test mislukt'); uit.className = 'off'; $('checks').replaceChildren(); return; }
  uit.textContent = r.ok ? UI.t('Усе гаразд', 'Alles in orde') : UI.t('Є проблеми, див. нижче', 'Er zijn problemen, zie hieronder');
  uit.className = r.ok ? 'ok' : 'off';
  $('checks').replaceChildren(...r.checks.map((c) => UI.maak('li', { class: c.ok ? 'ok' : 'off' }, checkTekst(c))));
});

UI.start({ reden: 'zijpaneel', groot: true, naStatus: toonZiet });
setInterval(() => { void toonLog(); }, 5000);
