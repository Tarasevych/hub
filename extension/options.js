// Opties 0.6: kaarten per slot + «Відкликати» (reden 'opties', per slot), koppelingen per slot (ontkoppelen per slot), diagnose,
// lokale AI-agent (Native Messaging), zelftest. De technische regel bestaat alleen als zijn kaart bestaat (sloten.technisch niet null).
// 0.4.2: de opties draaien in een tabblad (options_ui.open_in_tab); background.js (ownPage) aanvaardt dat. Mislukt iets, dan zegt de
// pagina het (geen stil terugspringen). «Керування на сайті» → mcp.tarasevych.com/agents#toegang.
// 0.5: `debugger` en `nativeMessaging` zijn OPTIONELE rechten. Chrome geeft ze alleen binnen een gebruikersgebaar: daarom start
// chrome.permissions.request SYNCHROON in de klikhandler van de schakelaar, vóór elke await en vóór set-diag/set-native.
// Uit = eerst de achtergrond laten stoppen (set-diag/set-native false), daarna het recht inleveren (chrome.permissions.remove).
const UI = globalThis.MR_UI;
const manifest = chrome.runtime.getManifest();
document.getElementById('version').textContent = `v${manifest.version}`;
document.getElementById('open-site').addEventListener('click', () => UI.openTab('https://mcp.tarasevych.com/agents#toegang'));

function meld(el, uk, nl, cls = '') { if (!el) return; el.textContent = UI.t(uk, nl); el.className = cls; }
/**
 * 0.6.1 (punt 7): het verzoek start SYNCHROON in de klikhandler (anders geen gebruikersgebaar) en geeft nu de STAND terug in plaats
 * van alleen true/false: 'ja' | 'geweigerd' | 'nee' (geen gebaar) | 'niet-aanvraagbaar' (Chrome staat het recht niet als optioneel
 * recht toe — bij `debugger` is dat altijd zo). Zo kan de pagina zeggen wat er werkelijk aan de hand is.
 */
function vraagRecht(recht) {
  let poging;
  try { poging = Promise.resolve(chrome.permissions.request({ permissions: [recht] })); }
  catch (e) { poging = Promise.reject(e); }
  return poging.then((x) => ({ stand: x === true ? 'ja' : 'geweigerd' }), (e) => ({ stand: UI.standVanFout(e) }));
}
async function heeftRecht(recht) {
  try { return (await chrome.permissions.contains({ permissions: [recht] })) === true; } catch { return false; }
}
async function leverIn(recht) {
  try { await chrome.permissions.remove({ permissions: [recht] }); } catch { /* al weg of niet optioneel */ }
}

// ---------------------------------------------------------------- koppelingen (per slot)
function toonKoppeling(s, sl) {
  const regels = [['prive', sl.prive]];
  if (sl.technisch) regels.push(['technisch', sl.technisch]);
  document.getElementById('koppelingen').replaceChildren(...regels.map(([ruimte, slot]) => {
    const titel = UI.t(UI.TITEL[ruimte][0], UI.TITEL[ruimte][1]);
    const li = UI.maak('li', { 'data-ruimte': ruimte });
    if (!slot.gekoppeld) {
      li.append(UI.maak('span', { class: 'zacht' }, `${titel}: ${UI.t('не підключено', 'niet gekoppeld')}`));
      return li;
    }
    const naam = slot.naam ? String(slot.naam).slice(0, 60) : 'Chrome';
    li.append(UI.maak('span', { class: 'zacht' }, `${titel}: ${UI.t('підключено як', 'gekoppeld als')} «${naam}»${slot.verbonden ? '' : ` · ${UI.t('немає з’єднання', 'geen verbinding')}`}`));
    const knop = UI.maak('button', { type: 'button', class: 'stil', id: `forget-${ruimte}` }, UI.t('Відключити', 'Ontkoppelen'));
    knop.addEventListener('click', async () => { knop.disabled = true; await UI.vraag({ op: 'forget', ruimte }); await UI.ververs(); });
    li.append(knop);
    return li;
  }));
}

// ---------------------------------------------------------------- diagnose (diagOptIn + optioneel recht debugger)
const diag = document.getElementById('diag');
const native = document.getElementById('native');
let bezig = { diag: false, native: false };

// 0.8.0 (UI-011, P1): `debugger` staat VAST in het manifest — Chrome weigert het als optioneel recht («Permission 'debugger' cannot be
// listed as optional», bewezen in echte Chrome 156). De schakelaar vraagt dus GEEN Chrome-recht meer: hij legt alleen de toestemming van
// de gebruiker vast (diagOptIn). Ontbreekt het recht toch (oud pakket, uitgezet), dan blijft de schakelaar uit MET reden + herstelstap.
diag.addEventListener('click', () => {
  const want = diag.checked;
  void zetDiag(want, want ? UI.vraagDebuggerRecht() : null);
});
async function zetDiag(want, toestemming) {
  const status = document.getElementById('diag-status');
  bezig.diag = true; diag.disabled = true; diag.setAttribute('aria-busy', 'true');
  try {
    const uitkomst = want ? await toestemming : null;
    if (want && (!uitkomst || uitkomst.stand !== 'ja')) {
      diag.checked = false;
      const stand = uitkomst && uitkomst.stand ? uitkomst.stand : 'nee';
      await UI.vraag({ op: 'set-diag-stand', stand }); // zodat de pop-up, het zijpaneel en de site hetzelfde zeggen
      status.textContent = `${UI.diagStandTekst(stand)} — ${UI.t('діагностику не ввімкнено', 'diagnose blijft uit')}`;
      status.className = 'off';
      document.getElementById('diag-recht').textContent = UI.diagStandTekst(stand);
      const hulp = document.getElementById('diag-hulp');
      hulp.hidden = false; hulp.textContent = UI.diagHulpTekst(stand);
      document.getElementById('diag-pakket-rij').hidden = stand !== 'niet-aanvraagbaar';
      return;
    }
    const r = await UI.vraag({ op: 'set-diag', on: want });
    if (!r || !r.ok) {
      diag.checked = !want;
      meld(status, 'Не вдалося змінити — перезавантажте розширення (↻ у chrome://extensions) і спробуйте ще раз', 'Wijzigen mislukt — herlaad de extensie (↻ in chrome://extensions) en probeer opnieuw', 'off');
      return;
    }
    await UI.ververs();
    bezig.diag = false;
    toonDiagWerkelijk(UI.laatste());
  } finally { bezig.diag = false; diag.disabled = false; diag.removeAttribute('aria-busy'); }
}
function toonDiagWerkelijk(s) {
  if (bezig.diag) return;
  const w = UI.diagWerkelijk(s);
  const status = document.getElementById('diag-status');
  // 0.9.0 (oude fout): zonder technische kaart haalt toonOverig #diag-status uit de DOM → elke volgende statusverversing gooide
  // «Cannot read properties of null (reading 'setAttribute')». Geen element = niets te tonen.
  if (!status) return;
  status.setAttribute('data-werkelijk', w.code);
  status.textContent = `${UI.t(w.uk, w.nl)} — ${UI.t(w.reden[0], w.reden[1])}`;
  status.className = w.code === 'geblokkeerd' || w.code === 'fout' ? 'fout' : w.code === 'wacht' ? 'off' : w.code === 'uit' ? 'zacht' : 'ok';
}

// ---------------------------------------------------------------- lokale AI-agent (Native Messaging)
native.addEventListener('click', () => {
  const want = native.checked;
  const toestemming = want ? vraagRecht('nativeMessaging') : null; // binnen het gebaar, vóór elke await
  void zetNative(want, toestemming);
});
async function zetNative(want, toestemming) {
  const status = document.getElementById('native-status');
  bezig.native = true; native.disabled = true;
  try {
    const uitkomst = want ? await toestemming : null;
    if (want && (!uitkomst || uitkomst.stand !== 'ja')) {
      native.checked = false;
      meld(status, 'Chrome не надав дозвіл Native Messaging — локальний агент вимкнено', 'Chrome gaf geen Native Messaging-recht — lokale agent blijft uit', 'off');
      return;
    }
    const r = await UI.vraag({ op: 'set-native', on: want });
    if (!want) await leverIn('nativeMessaging');
    if (!r || r.ok === false) {
      native.checked = false;
      if (want) await leverIn('nativeMessaging');
      meld(status, 'Не вдалося змінити — перезавантажте розширення й спробуйте ще раз', 'Wijzigen mislukt — herlaad de extensie en probeer opnieuw', 'off');
      return;
    }
    if (want) meld(status, 'Увімкнено. Агент працюватиме лише після відкриття доступу з позначкою «локальний агент» і лише для читання.', 'Aan. De agent werkt pas na het openen van de toegang met «lokale agent» en alleen lezend.', 'ok');
    else meld(status, 'Вимкнено, дозвіл повернуто', 'Uit, recht ingeleverd', '');
  } finally { nativeOpgeslagen = native.checked; bezig.native = false; native.disabled = false; }
}

let nativeOpgeslagen = null; // nativeOptIn uit de opslag, als de status het veld (nog) niet meegeeft
async function beginStand() {
  const [opslag, dbg] = await Promise.all([Promise.resolve(chrome.storage.local.get(['diagOptIn', 'nativeOptIn'])).catch(() => ({})), heeftRecht('debugger')]);
  nativeOpgeslagen = typeof opslag.nativeOptIn === 'boolean' ? opslag.nativeOptIn : null;
  void toonNative(UI.laatste());
  if (!bezig.diag) {
    diag.checked = opslag.diagOptIn === true && dbg;
    // 0.6.1: «відкликано» is iets anders dan «ніколи не було» — UI.toonDiag zet de uitleg erbij zodra de status binnen is.
    if (opslag.diagOptIn === true && !dbg) meld(document.getElementById('diag-status'), 'Дозвіл налагоджувача зараз не діє — глибока діагностика не працює. Перезавантажте розширення (↻ у chrome://extensions).', 'Het debuggerrecht werkt nu niet — diepe diagnose werkt niet. Herlaad de extensie (↻ in chrome://extensions).', 'off');
  }
}
async function toonNative(s) {
  if (bezig.native) return;
  const recht = await heeftRecht('nativeMessaging');
  // Keuze van de gebruiker (nativeOptIn), niet «nu actief»: lokaal.toegestaan is onwaar zolang er geen ontgrendeling met lokaal is.
  const keuze = s && typeof s.nativeOptIn === 'boolean' ? s.nativeOptIn : nativeOpgeslagen !== null ? nativeOpgeslagen : !!(s && s.lokaal && s.lokaal.toegestaan);
  if (!bezig.native) native.checked = keuze && recht;
}

// ---------------------------------------------------------------- zelftest
const LABELS = {
  paired: ['Підключено до облікового запису', 'Gekoppeld aan het account'],
  command_key: ['Ключ підпису команд', 'Sleutel voor ondertekende opdrachten'],
  connected: ['З’єднання з сервером', 'Verbinding met de server'],
  settings: ['Дозволи отримано від сервера', 'Toestemmingen ontvangen van de server'],
  unlocked: ['Доступ відкрито', 'Toegang open'],
  profiel: ['Профіль вкладки', 'Profiel van het tabblad'],
  debugger_permission: ['Дозвіл налагоджувача в Chrome', 'Debuggerrecht in Chrome'],
  markering: ['Хто зараз читає цю вкладку', 'Wie leest dit tabblad nu'],
  native_permission: ['Дозвіл Native Messaging у Chrome', 'Native Messaging-recht in Chrome'],
  native: ['Локальний агент', 'Lokale agent'],
  diag_opt_in: ['Діагностику дозволено', 'Diagnose toegestaan'],
  site_tab: ['Відкрита вкладка Mijn Ruimte', 'Open Mijn Ruimte-tabblad'],
  bridge: ['Розширення активне на сторінці', 'Extensie actief op de pagina'],
  account: ['Той самий обліковий запис на сторінці', 'Zelfde account op de pagina'],
};
// 0.8.0: diagnosecentrum — per controle «wat → resultaat → oorzaak → herstel», uit de echte zelftest van de achtergrond.
const HERSTEL = {
  paired: ['Цей браузер ще не підключено. Відкрийте «Керування на сайті» й підключіть розширення.', 'Deze browser is nog niet gekoppeld. Open «Beheer op de site» en koppel de extensie.'],
  command_key: ['Немає ключа підпису команд. Відключіть і підключіть браузер знову на сайті.', 'Geen sleutel voor opdrachten. Ontkoppel en koppel de browser opnieuw op de site.'],
  connected: ['Немає з’єднання з сервером. Перевірте інтернет; розширення повторить саме.', 'Geen verbinding met de server. Controleer internet; de extensie probeert het zelf opnieuw.'],
  settings: ['Сервер ще не надіслав дозволи. Зачекайте хвилину або відкрийте сайт.', 'De server stuurde nog geen rechten. Wacht een minuut of open de site.'],
  unlocked: ['Доступ закрито. Це нормально, доки ви не відкриєте його на сайті.', 'De toegang is dicht. Dat is normaal tot u hem op de site opent.'],
  profiel: ['Відкрийте сторінку tarasevych.com у потрібному режимі.', 'Open een tarasevych.com-pagina in de juiste modus.'],
  debugger_permission: ['Стандартний пакет навмисно без дозволу налагоджувача. Для глибокої діагностики встановіть пакет «діагностика» з сайту й натисніть ↻ у chrome://extensions.', 'Het standaardpakket heeft bewust geen debuggerrecht. Installeer voor diepe diagnose het pakket «diagnose» van de site en klik ↻ in chrome://extensions.'],
  diag_opt_in: ['Глибоку діагностику не дозволено. Увімкніть перемикач вище, якщо вона потрібна.', 'Diepe diagnose is niet toegestaan. Zet de schakelaar hierboven aan als u die nodig hebt.'],
  site_tab: ['Відкрийте будь-яку сторінку tarasevych.com в активній вкладці.', 'Open een tarasevych.com-pagina in het actieve tabblad.'],
  // 0.9.1: geen F5 meer — de extensie plaatst zich zelf op open tabbladen; dit verschijnt alleen als Chrome dat weigerde.
  bridge: ['Розширення під’єднується до відкритих сторінок tarasevych.com саме, без оновлення. Якщо цей рядок лишився — вкладка заснула або Chrome не дав доступу до неї: перейдіть на вкладку й натисніть «Перевірити» ще раз.', 'De extensie koppelt zich zelf aan open tarasevych.com-pagina’s, zonder vernieuwen. Blijft deze regel staan, dan sliep het tabblad of gaf Chrome geen toegang: ga naar het tabblad en klik nogmaals op «Controleren».'],
  account: ['На сторінці інший обліковий запис. Увійдіть тим самим, що й у розширенні.', 'Op de pagina staat een ander account. Meld u aan met hetzelfde als in de extensie.'],
  markering: ['Позначка вкладки не з’явилася. Натисніть «Перевірити» ще раз — розширення під’єднається до сторінки саме.', 'De markering van het tabblad verscheen niet. Klik nogmaals op «Controleren» — de extensie koppelt zich zelf aan de pagina.'],
  native_permission: ['Chrome не дав дозвіл Native Messaging. Увімкніть перемикач у «Додатково».', 'Chrome gaf geen Native Messaging-recht. Zet de schakelaar in «Extra» aan.'],
  native: ['Локальна програма не відповідає. Встановіть її за інструкцією на сайті.', 'Het lokale programma antwoordt niet. Installeer het volgens de instructies op de site.'],
};
document.getElementById('self-test').addEventListener('click', async () => {
  const knop = document.getElementById('self-test');
  const out = document.getElementById('self-test-result');
  const list = document.getElementById('checks');
  knop.disabled = true; knop.setAttribute('aria-busy', 'true');
  meld(out, 'Перевіряємо…', 'Bezig met controleren…', 'zacht');
  try {
    const r = await UI.vraag({ op: 'self-test' });
    if (!r || !Array.isArray(r.checks)) { meld(out, 'Не вдалося виконати перевірку: служба розширення не відповіла. Натисніть ↻ у chrome://extensions і повторіть.', 'Controle mislukt: de dienst van de extensie antwoordde niet. Klik ↻ in chrome://extensions en probeer opnieuw.', 'fout'); list.replaceChildren(); return; }
    const fout = r.checks.filter((c) => !c.ok).length;
    // Nooit «усе гаразд» als er een ✗ in de lijst staat: r.ok van de achtergrond negeert alleen informatieve controles.
    meld(out, fout === 0 ? `Усе гаразд (${r.checks.length} перевірок)` : r.ok ? `Основне працює. Не виконано умов: ${fout} з ${r.checks.length} — це не помилка, нижче що вони означають.` : `Перевірок: ${r.checks.length}, не пройшли: ${fout}. Нижче — причина й що зробити.`,
      fout === 0 ? `Alles in orde (${r.checks.length} controles)` : r.ok ? `De basis werkt. Niet vervulde voorwaarden: ${fout} van ${r.checks.length} — geen fout, hieronder wat ze betekenen.` : `Controles: ${r.checks.length}, niet gelukt: ${fout}. Hieronder oorzaak en wat te doen.`, fout === 0 ? 'ok' : 'off');
    list.replaceChildren(...r.checks.map((c) => {
      const [ruimte, id] = String(c.id).includes('.') ? String(c.id).split('.') : [null, String(c.id)];
      const [uk, nl] = LABELS[id] || [id, id];
      const voor = ruimte && UI.TITEL[ruimte] ? `${UI.t(UI.TITEL[ruimte][0], UI.TITEL[ruimte][1])}: ` : '';
      const li = UI.maak('li', { class: c.ok ? 'ok' : 'off', 'data-check': String(c.id) },
        UI.maak('span', { class: 'check-teken', 'aria-hidden': 'true' }, c.ok ? '✓' : '✗'),
        UI.maak('span', { class: 'check-wat' }, `${voor}${UI.t(uk, nl)}`),
        UI.maak('span', { class: 'vh' }, c.ok ? UI.t('гаразд', 'in orde') : UI.t('не пройшло', 'niet gelukt')));
      if (c.detail) li.append(UI.maak('span', { class: 'check-detail' }, String(c.detail)));
      if (!c.ok && HERSTEL[id]) li.append(UI.maak('span', { class: 'check-herstel' }, UI.t(HERSTEL[id][0], HERSTEL[id][1])));
      return li;
    }));
  } finally { knop.disabled = false; knop.removeAttribute('aria-busy'); }
});

// ---------------------------------------------------------------- 0.8.0: navigatie tussen secties (hash), één sectie tegelijk
const SECTIES = [...document.querySelectorAll('.opties-nav a')].map((a) => a.getAttribute('data-sectie'));
function toonSectie() {
  const hash = typeof location !== 'undefined' && typeof location.hash === 'string' ? location.hash.slice(1) : '';
  const doel = SECTIES.includes(hash) ? hash : 'overzicht';
  for (const id of SECTIES) { const el = document.getElementById(id); if (el) el.hidden = id !== doel; }
  for (const a of document.querySelectorAll('.opties-nav a')) { if (a.getAttribute('data-sectie') === doel) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const checks = document.getElementById('checks');
  if (doel === 'diagnose' && checks && !checks.children.length) document.getElementById('self-test').click();
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('hashchange', toonSectie);
document.getElementById('naar-diagnose')?.addEventListener('click', () => { location.hash = 'diagnose'; });
document.getElementById('naar-agenten')?.addEventListener('click', () => UI.openTab('https://mcp.tarasevych.com/agents#extensie'));

// Browser en tabbladen, agenten, extra: alleen tonen wat de status echt zegt (niets verzonnen; model alleen als de server het meldt).
function toonOverig(s, sl) {
  // Zonder technische kaart bestaat diepe diagnose niet (zelfde regel als pop-up/zijpaneel): die elementen gaan uit de DOM.
  if (!sl.technisch) for (const el of document.querySelectorAll('[data-alleen-tech]')) { const ouder = el.parentNode; if (ouder) ouder.replaceChildren(...[...ouder.childNodes].filter((c) => c !== el)); }
  const regel = (stand, tekst) => UI.maak('li', { 'data-stand': stand }, UI.maak('span', { class: 'stip', 'aria-hidden': 'true' }), UI.maak('span', null, tekst));
  const p0 = s && (s.profielTab === 'technisch' || s.profielTab === 'gebruiker') ? s.profielTab : null;
  const p = p0 === 'technisch' && !sl.technisch ? 'gebruiker' : p0;
  const doms = new Set();
  for (const x of [sl.prive, sl.technisch]) if (x && x.ontgrendeling && Array.isArray(x.ontgrendeling.domeinen)) for (const d of x.ontgrendeling.domeinen) doms.add(String(d));
  document.getElementById('tab-info').replaceChildren(
    regel(p ? 'ja' : 'let-op', p ? UI.t(`Активна вкладка: tarasevych.com, профіль «${p === 'technisch' ? 'Технічний' : 'Користувач'}»`, `Actief tabblad: tarasevych.com, profiel «${p === 'technisch' ? 'Technisch' : 'Gebruiker'}»`) : UI.t('Активна вкладка не на tarasevych.com — ШІ її не бачить', 'Het actieve tabblad is niet op tarasevych.com — de AI ziet het niet')),
    regel(doms.size ? 'ja' : 'let-op', doms.size ? `${UI.t('Дозволені сайти', 'Toegestane sites')}: ${[...doms].join(', ')}` : UI.t('Дозволених сайтів зараз немає (доступ закрито)', 'Nu geen toegestane sites (toegang dicht)')));
  const agenten = [];
  for (const [r, x] of [['prive', sl.prive], ['technisch', sl.technisch]]) {
    if (!x) continue;
    const lijst = x.ai && Array.isArray(x.ai.agenten) ? x.ai.agenten : [];
    for (const a of lijst) agenten.push(regel('ja', `${String((a && a.naam) || '?').slice(0, 40)}${a && a.model ? ` · ${String(a.model).slice(0, 60)}` : ''} — ${UI.t(UI.TITEL[r][0], UI.TITEL[r][1])}`));
  }
  document.getElementById('agenten-lijst').replaceChildren(...(agenten.length ? agenten : [regel('let-op', UI.t('Зараз жоден ШІ-агент не підключений до цього браузера', 'Er is nu geen AI-agent met deze browser verbonden'))]));
  const m = chrome.runtime.getManifest();
  document.getElementById('extra-info').replaceChildren(
    regel('ja', `${UI.t('Версія', 'Versie')} ${m.version} · ID ${chrome.runtime.id}`),
    regel(m.update_url ? 'ja' : 'let-op', m.update_url ? UI.t('Встановлено з підписаного пакета (оновлюється сама)', 'Geïnstalleerd uit het ondertekende pakket (werkt zichzelf bij)') : UI.t('Завантажено з теки («розпаковане»). Тека має лишатися на місці: якщо її видалити чи перемістити, Chrome прибере розширення після перезапуску.', 'Geladen uit een map («uitgepakt»). De map moet blijven staan: wordt hij verwijderd of verplaatst, dan haalt Chrome de extensie na een herstart weg.')));
  const d = s && s.diagnostiek ? s.diagnostiek : {};
  document.getElementById('tech-details').textContent = JSON.stringify({ versie: m.version, id: chrome.runtime.id, rechten: m.permissions, optioneel: m.optional_permissions, diagnostiek: { recht: d.recht, optIn: d.optIn, stand: d.stand, actief: d.actief, laatsteFout: d.laatsteFout || null }, profielTab: p }, null, 2);
}

void beginStand();
toonSectie();
UI.start({ reden: 'opties', naStatus: (s, sl) => { toonKoppeling(s, sl); void toonNative(s); toonDiagWerkelijk(s); toonOverig(s, sl); } });
