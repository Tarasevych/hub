// 0.9.0: «Локальний ШІ / Lokale AI» in het zijpaneel + hulpknoppen in de chat. Alles draait in deze pagina met de ingebouwde
// AI van Chrome; er gaat niets naar een server. Instellingen komen uit de opties (chrome.storage.local → lokaleAi).
(() => {
  'use strict';
  const L = globalThis.MR_LOKALE_AI;
  const UI = globalThis.MR_UI;
  if (!L || !UI) return;
  const t = UI.t, maak = UI.maak;
  const $ = (id) => document.getElementById(id);

  let cfg = L.opschonen(null);
  let afbreker = null;
  let sessie = null;             // Prompt-sessie: blijft tot «Новий діалог» of een wijziging van de instellingen
  let laatsteUitvoer = '';
  let laatsteModus = '';
  const vertalingen = new Map(); // antwoordtekst → vertaling (chat), overleeft het opnieuw tekenen van de lijst

  const MODI = [
    ['prompt', 'Діалог (запит до моделі)', 'Gesprek (vraag aan het model)'],
    ['summarizer', 'Стислий виклад', 'Samenvatten'],
    ['writer', 'Написати текст за завданням', 'Tekst schrijven op opdracht'],
    ['rewriter', 'Переписати текст', 'Tekst herschrijven'],
    ['translator', 'Перекласти', 'Vertalen'],
    ['detector', 'Визначити мову', 'Taal herkennen'],
    ['proofreader', 'Коректура (правопис і граматика)', 'Proeflezen (spelling en grammatica)'],
  ];

  function vulModi() {
    const sel = $('lai-modus');
    const oud = sel.value;
    // EXT090-001: de lijst zelf bijhouden in plaats van sel.options (HTMLOptionsCollection ontbreekt in eenvoudige DOM's en tests).
    const opties = MODI.filter(([id]) => cfg.apis[id]).map(([id, uk, nl]) => {
      const o = maak('option', { value: id }, t(uk, nl));
      if (!globalThis[L.API[id].glob]) { o.disabled = true; o.textContent += ` — ${t('немає в цьому Chrome', 'ontbreekt in deze Chrome')}`; }
      return o;
    });
    sel.replaceChildren(...opties);
    if (oud && opties.some((o) => o.getAttribute('value') === oud && !o.disabled)) sel.value = oud;
    else { const eerste = opties.find((o) => !o.disabled); if (eerste) sel.value = eerste.getAttribute('value'); }
    toonKnoppen();
  }
  function toonKnoppen() {
    const m = $('lai-modus').value;
    $('lai-nieuw').hidden = m !== 'prompt';
    $('lai-afbeelding-rij').hidden = !(m === 'prompt' && cfg.multimodaal);
    $('lai-tab').disabled = !!afbreker;
    $('lai-tab').title = cfg.tabTekst ? '' : t('Увімкніть «!» читання вкладки в налаштуваннях', 'Zet «!» tabblad lezen aan in de instellingen');
  }
  function toonAlgemeen() {
    const blok = $('blok-lokale-ai');
    const ergens = L.API_IDS.some((id) => globalThis[L.API[id].glob]);
    if (!cfg.aan) { $('lai-stand').textContent = t('Вимкнено в налаштуваннях розширення.', 'Uitgeschakeld in de instellingen van de extensie.'); }
    else if (!ergens) { $('lai-stand').textContent = t('У цьому Chrome немає вбудованого ШІ (потрібен Chrome 138+ на комп’ютері). Деталі — у налаштуваннях.', 'Deze Chrome heeft geen ingebouwde AI (Chrome 138+ op een computer nodig). Details in de instellingen.'); }
    else $('lai-stand').textContent = t('Працює на цьому пристрої — текст нікуди не надсилається.', 'Werkt op dit apparaat — tekst gaat nergens heen.');
    $('lai-start').disabled = !cfg.aan || !ergens || !!afbreker;
    blok.dataset.aan = cfg.aan ? 'ja' : 'nee';
    // chat-hulp: alleen als aan én de API bestaat
    const proef = cfg.aan && cfg.chatHulp && cfg.apis.proofreader && !!globalThis.Proofreader;
    const herschr = cfg.aan && cfg.chatHulp && cfg.apis.rewriter && !!globalThis.Rewriter;
    $('chat-proeflees').hidden = !proef; $('chat-herschrijf').hidden = !herschr;
    $('chat-lokaal').hidden = !(proef || herschr);
    vulModi();
    markeerChat();
  }

  // ---------------------------------------------------------------- uitvoeren
  function zetBezig(b) {
    $('lai-start').disabled = b || !cfg.aan; $('lai-stop').disabled = !b; $('lai-modus').disabled = b; $('lai-tab').disabled = b;
    $('lai-start').setAttribute('aria-busy', b ? 'true' : 'false');
  }
  function toonUitvoer(tekst) { $('lai-uitvoer').textContent = tekst; }
  function toonFout(e, opnieuw) {
    $('lai-notities').replaceChildren(maak('span', { class: 'fout' }, `${t('Не вдалося', 'Mislukt')}: ${L.foutTekst(e)}`));
    if (e && e.code === 'MODEL_NIET_GELADEN' && opnieuw) {
      const k = maak('button', { type: 'button', class: 'primair', id: 'lai-download' }, t('Завантажити модель (кілька ГБ) і виконати', 'Model downloaden (enkele GB) en uitvoeren'));
      k.addEventListener('click', () => { k.remove(); void opnieuw(); });
      $('lai-notities').append(' ', k);
    }
  }
  async function uitvoeren(magDownloaden = false) {
    const modus = $('lai-modus').value;
    const invoer = $('lai-invoer').value;
    const bestand = $('lai-afbeelding').files && $('lai-afbeelding').files[0] ? $('lai-afbeelding').files[0] : null;
    afbreker = new AbortController();
    zetBezig(true);
    toonUitvoer(''); $('lai-notities').textContent = t('Працюю…', 'Bezig…');
    const balk = $('lai-voortgang');
    try {
      const r = await L.voer(modus, invoer, cfg, {
        signal: afbreker.signal, magDownloaden,
        sessie: modus === 'prompt' ? sessie : null,
        afbeelding: modus === 'prompt' && cfg.multimodaal ? bestand : null,
        opStuk: (s) => toonUitvoer(s),
        opVoortgang: (f) => { balk.hidden = f >= 1; balk.value = f; },
      });
      if (modus === 'prompt' && r.extra && r.extra.sessie) sessie = r.extra.sessie;
      laatsteUitvoer = String(r.tekst || ''); laatsteModus = modus;
      toonUitvoer(laatsteUitvoer + (r.extra && r.extra.correcties && r.extra.correcties.length ? `\n\n${r.extra.correcties.join('\n')}` : ''));
      const g = r.extra && r.extra.gebruik;
      $('lai-notities').textContent = [...r.notities, ...(g ? [t(`контекст: ${g.gebruikt}/${g.max} токенів`, `context: ${g.gebruikt}/${g.max} tokens`)] : [])].join(' · ');
      $('lai-kopieer').disabled = !laatsteUitvoer; $('lai-naar-chat').disabled = !laatsteUitvoer;
    } catch (e) {
      toonFout(e, () => uitvoeren(true));
    } finally {
      afbreker = null; balk.hidden = true; zetBezig(false); toonKnoppen();
    }
  }

  $('lai-start').addEventListener('click', () => void uitvoeren(false));
  $('lai-stop').addEventListener('click', () => { if (afbreker) afbreker.abort(); });
  $('lai-nieuw').addEventListener('click', () => {
    if (sessie && typeof sessie.destroy === 'function') { try { sessie.destroy(); } catch { /* al weg */ } }
    sessie = null; toonUitvoer(''); $('lai-notities').textContent = t('Новий діалог.', 'Nieuw gesprek.');
  });
  $('lai-modus').addEventListener('change', toonKnoppen);
  $('lai-invoer').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !afbreker) { e.preventDefault(); void uitvoeren(false); } });
  $('lai-tab').addEventListener('click', async () => {
    try {
      const r = await L.tabbladTekst(cfg);
      $('lai-invoer').value = r.tekst;
      $('lai-notities').textContent = r.selectie ? t('Вставлено виділений текст вкладки.', 'Geselecteerde tekst van het tabblad ingevoegd.') : t(`Вставлено текст сторінки «${r.titel}» (${r.tekst.length} символів).`, `Tekst van de pagina «${r.titel}» ingevoegd (${r.tekst.length} tekens).`);
    } catch (e) { toonFout(e); }
  });
  $('lai-kopieer').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(laatsteUitvoer); $('lai-notities').textContent = t('Скопійовано.', 'Gekopieerd.'); }
    catch { $('lai-notities').textContent = t('Не вдалося скопіювати.', 'Kopiëren mislukt.'); }
  });
  $('lai-naar-chat').addEventListener('click', () => {
    const veld = $('chat-invoer');
    if (!veld) return;
    veld.value = laatsteModus === 'prompt' || laatsteModus === 'detector' ? `${veld.value ? `${veld.value}\n` : ''}${laatsteUitvoer}` : laatsteUitvoer;
    veld.focus();
  });
  $('lai-opties').addEventListener('click', () => { try { chrome.tabs.create({ url: chrome.runtime.getURL('options.html#lokale-ai') }); } catch { void chrome.runtime.openOptionsPage(); } });

  // ---------------------------------------------------------------- chat-hulp
  async function chatBewerk(modus, knop) {
    const veld = $('chat-invoer');
    const tekst = String(veld.value || '').trim();
    if (!tekst) { $('chat-stand').textContent = t('Напишіть текст у полі чату.', 'Schrijf tekst in het chatveld.'); return; }
    knop.disabled = true; knop.setAttribute('aria-busy', 'true');
    $('chat-stand').textContent = t('Локальний ШІ працює…', 'Lokale AI bezig…');
    try {
      // Vertaling terug naar de interfacetaal is hier niet gewenst: de gebruiker wil zijn eigen tekst in zijn eigen taal houden.
      const c = { ...cfg, vertaalUitvoer: false, vertaalInvoer: false };
      const r = await L.voer(modus, tekst, c, {});
      veld.value = r.tekst;
      $('chat-stand').textContent = `${t('Готово (локально)', 'Klaar (lokaal)')}${r.notities.length ? ` · ${r.notities.join(' · ')}` : ''}`;
    } catch (e) { $('chat-stand').textContent = `${t('Не вдалося', 'Mislukt')}: ${L.foutTekst(e)}`; }
    finally { knop.disabled = false; knop.removeAttribute('aria-busy'); }
  }
  $('chat-proeflees').addEventListener('click', (e) => void chatBewerk('proofreader', e.currentTarget));
  $('chat-herschrijf').addEventListener('click', (e) => void chatBewerk('rewriter', e.currentTarget));

  /** «Перекласти» bij elk antwoord van de assistent (lijst wordt door sidepanel.js steeds opnieuw opgebouwd → MutationObserver). */
  function markeerChat() {
    const lijst = $('chat-berichten');
    if (!lijst) return;
    const kan = cfg.aan && cfg.chatHulp && cfg.apis.translator && !!globalThis.Translator;
    for (const li of lijst.querySelectorAll('li[data-rol="assistant"]')) {
      const oud = li.querySelector('.lai-vertaal'); if (oud) oud.remove();
      const oudV = li.querySelector('.lai-vertaling'); if (oudV) oudV.remove();
      if (!kan) continue;
      const bron = li.firstChild && li.firstChild.nodeType === 3 ? li.firstChild.nodeValue : '';
      if (!bron) continue;
      if (vertalingen.has(bron)) { li.append(maak('span', { class: 'lai-vertaling' }, vertalingen.get(bron))); continue; }
      const k = maak('button', { type: 'button', class: 'stil lai-vertaal' }, t('Перекласти (локально)', 'Vertalen (lokaal)'));
      k.addEventListener('click', async () => {
        k.disabled = true; k.textContent = '…';
        try {
          const c = { ...cfg, translator: { bron: 'auto', doel: cfg.translator.doel } };
          const r = await L.voer('translator', bron, c, {});
          vertalingen.set(bron, r.tekst);
          k.replaceWith(maak('span', { class: 'lai-vertaling' }, r.tekst));
        } catch (e) { k.disabled = false; k.textContent = `${t('Перекласти', 'Vertalen')} — ${L.foutTekst(e)}`; }
      });
      li.append(k);
    }
  }
  try {
    const lijst = $('chat-berichten');
    let bezigMarkeren = false;
    if (lijst) new MutationObserver(() => { if (bezigMarkeren) return; bezigMarkeren = true; try { markeerChat(); } finally { bezigMarkeren = false; } }).observe(lijst, { childList: true });
  } catch { /* geen observer */ }

  // ---------------------------------------------------------------- start
  L.laad().then((x) => { cfg = x; L.plaatsProefTokens(cfg); toonAlgemeen(); });
  L.bijWijziging((x) => {
    cfg = x; L.vergeetAlles();
    if (sessie && typeof sessie.destroy === 'function') { try { sessie.destroy(); } catch { /* al weg */ } }
    sessie = null; L.plaatsProefTokens(cfg); toonAlgemeen();
  });
})();
