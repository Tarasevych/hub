// Eenheidstest 21.10.2026 — recensie toegankelijkheid (WCAG 2.2 AA) van de mail: meldingenpaneel op de telefoon, FAB en bel,
// venster «Новий лист» (stapel, menu's, Cc/Bcc, concept-indicator), menu «⋮» van een rij, mailboxkiezer, «Поштові акаунти».
//
// STAND ДО (tests/e2e/hulp/stand-toegankelijk.ts, REV3-DO, 390 en 1280 px):
//   • paneel: focus bleef op de bel na het openen; «Згорнути панель» → focus op <body>; «⋯» (telefoon): Tab/↓ kwam niet in het
//     menu (het staat onderaan in de DOM); de teller «Непрочитаних» zat niet in een live-regio; bel: focusrand 2,0–2,2:1 (< 3:1).
//   • «Новий лист»: Tab verliet het venster 14–18× (achter de achtergrond); Cc/Bcc open/dicht → focus op <body>; «⋯» van de editor:
//     role=menu met knoppen/keuzelijsten erin (axe aria-required-children + aria-allowed-attr), ↓ deed niets; keuzelijst: focus
//     bleef op de knop, Home/End niets, ↑/↓ veranderden meteen de opmaak; «Видалити» → focus op <body>; Esc → focus niet op de FAB;
//     concept-indicator (role=status, atomair) las de hele regel 6× voor tijdens drie typpauzes.
//   • «⋮» van een rij: 25× «Інші дії» zonder onderwerp; axe aria-required-children/-parent (section-regio in het menu); na
//     «Позначити прочитаним» → focus op <body>.
//   • mailboxkiezer: Enter → focus bleef op de avatar, ↓ deed niets.
//   • «Поштові акаунти»: «Відключити»/«Перепідключити» zonder adres; vraag = role=group, focus bleef op «Відключити», Esc deed niets.
// Deze test legt de regels vast (zuivere functies, render, bron); de stand (REV3-PISLYA) bewijst ze in Chrome.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { FOCUSBAAR, focusTerug, houdTab, menuToets, volgendeIndex } from '../../src/platform/toegankelijk';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;

/** Minimale nagebootste browser (zoals meldingen-mobiel-20261021.test.ts): genoeg om de mailcomponenten in node te renderen. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, activeElement: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { name: '', innerWidth: 390, innerHeight: 844, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }), setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

/** Nep-element voor menuToets/houdTab: onthoudt wie de focus kreeg. */
const maakItems = (n: number) => { const log: number[] = []; const items = Array.from({ length: n }, (_, i) => ({ i, focus: () => { log.push(i); } })); return { items, log }; };
const toets = (key: string, extra: Partial<{ shiftKey: boolean; altKey: boolean }> = {}) => { const e = { key, ...extra, voorkomen: false, preventDefault: () => { e.voorkomen = true; } }; return e; };

export async function main(): Promise<number> {
  const { check, einde } = checker('toegankelijk-mail-20261021');

  // ------------------------------------------------------------------ A. zuivere regels (src/platform/toegankelijk.ts)
  check('A volgendeIndex: ↓ rond (laatste → eerste), ↑ rond (eerste → laatste), Home/End, onbekende toets = null',
    volgendeIndex('ArrowDown', 2, 3) === 0 && volgendeIndex('ArrowDown', 0, 3) === 1 && volgendeIndex('ArrowUp', 0, 3) === 2 && volgendeIndex('Home', 2, 3) === 0 && volgendeIndex('End', 0, 3) === 2 && volgendeIndex('Enter', 0, 3) === null && volgendeIndex('ArrowDown', 0, 0) === null);
  check('A volgendeIndex: niets gefocust (−1) → ↓ = eerste, ↑ = laatste; horizontaal ←/→; zonder rond blijft het aan de rand',
    volgendeIndex('ArrowDown', -1, 4) === 0 && volgendeIndex('ArrowUp', -1, 4) === 3 && volgendeIndex('ArrowRight', 1, 4, { horizontaal: true }) === 2 && volgendeIndex('ArrowDown', 1, 4, { horizontaal: true }) === null && volgendeIndex('ArrowDown', 3, 4, { rond: false }) === 3);
  {
    const { items, log } = maakItems(4);
    const e = toets('End');
    const ok1 = menuToets(e, items, items[1]);
    const e2 = toets('ArrowDown');
    const ok2 = menuToets(e2, items, items[3]);
    const e3 = toets('a');
    const ok3 = menuToets(e3, items, items[0]);
    const e4 = toets('ArrowDown', { altKey: true });
    check('A menuToets: End → laatste, ↓ op het laatste → eerste (preventDefault), letters en Alt+↓ niet', ok1 && e.voorkomen && ok2 && e2.voorkomen && log.join() === '3,0' && !ok3 && !e3.voorkomen && !menuToets(e4, items, items[0]), log.join());
  }
  {
    const { items, log } = maakItems(3);
    const houder = { naam: 'venster' };
    const t1 = toets('Tab'), t2 = toets('Tab', { shiftKey: true }), t3 = toets('Tab'), t4 = toets('Tab'), t5 = toets('Tab', { shiftKey: true });
    const r1 = houdTab(t1, items, { actief: items[2] });           // laatste → eerste
    const r2 = houdTab(t2, items, { actief: items[0] });           // eerste ← laatste
    const r3 = houdTab(t3, items, { actief: items[1] });           // midden: browser doet het
    const r4 = houdTab(t4, items, { actief: { ergens: 'portaalmenu' } }); // focus elders (geportaald menu): NIET ingrijpen
    const r5 = houdTab(t5, items, { actief: houder, houder });     // focus op het venster zelf → Shift+Tab = laatste
    check('A houdTab: Tab op het laatste → eerste, Shift+Tab op het eerste → laatste, midden = browser', r1 && t1.voorkomen && r2 && t2.voorkomen && !r3 && !t3.voorkomen && log.slice(0, 2).join() === '0,2', log.join());
    check('A houdTab: focus in een geportaald menu (niet in de lijst, niet het venster) → niets; focus op het venster zelf → in de lus', !r4 && !t4.voorkomen && r5 && t5.voorkomen && log[2] === 2);
    check('A houdTab: andere toetsen of lege lijst → niets', !houdTab(toets('Enter'), items, { actief: items[0] }) && !houdTab(toets('Tab'), [], { actief: null }));
  }
  check('A focusTerug: geen doel of los element (isConnected=false) → false; geldig → focus', !focusTerug(null) && !focusTerug({ isConnected: false, focus: () => undefined } as unknown as HTMLElement) && (() => { let f = false; return focusTerug({ isConnected: true, focus: () => { f = true; } } as unknown as HTMLElement) && f; })());
  check('A FOCUSBAAR bevat ook contenteditable (de editor) en sluit tabindex=-1 uit', FOCUSBAAR.includes('[contenteditable="true"]') && FOCUSBAAR.includes('[tabindex]:not([tabindex="-1"])'));
  const hulp = lees('src/platform/toegankelijk.ts');
  check('A focusbaar() slaat tabindex=-1-knoppen (schuifpijlen) en links ín de bewerkbare tekst over', hulp.includes("!(e.tabIndex < 0 && e.getAttribute('contenteditable') !== 'true')") && hulp.includes("!e.parentElement?.closest('[contenteditable=\"true\"]')"));

  // ------------------------------------------------------------------ B. meldingenpaneel + bel (bron)
  const cnc = lees('src/CanoniekMeldingencentrum.tsx');
  // Vergelijking zonder witruimte: de bron is leesbare code (niet geminificeerd), de patronen mogen dus met spaties geschreven zijn.
  const has = (bron: string, patroon: string) => bron.replace(/\s+/g, '').includes(patroon.replace(/\s+/g, ''));
  check('B openen: focus IN het paneel (paneel zelf, tabIndex −1); sluiten zonder andere focus → terug naar de bel', has(cnc, 'if (paneel && !paneel.contains(document.activeElement)) paneel.focus({ preventScroll: true })') && has(cnc, 'if (focusVerloren()) bellRef.current?.focus({ preventScroll: true })') && has(cnc, "role='dialog' aria-modal={paneelModaal ? 'true' : undefined} tabIndex={-1}"));
  check('B telefoon (≤ 560 px = vol blad): aria-modal + Tab blijft in het paneel; computer: niet-modaal', has(cnc, "window.matchMedia('(max-width: 560px)').matches") && has(cnc, 'if (paneelModaal) houdTab(event, focusbaar(event.currentTarget), { houder: event.currentTarget })'));
  check('B «⋯»: open → eerste actie gefocust; ↑/↓/Home/End in het menu; Tab sluit en gaat verder vanaf «⋯»; Esc (bestaand) terug op «⋯»',
    has(cnc, "focusbaar(document.getElementById('cnc-acties'))[0]?.focus()") && has(cnc, "<footer id='cnc-acties' className={meer ? 'is-open' : undefined} role='group' onKeyDown={(event) => { if (!meer) return; if (menuToets(event, focusbaar(event.currentTarget))) return; if (event.key === 'Tab') { setMeer(false); meerKnopRef.current?.focus(); } }}") && has(cnc, 'if (meerRef.current) { setMeer(false); meerKnopRef.current?.focus(); return; }'));
  check('B teller «Непрочитаних» in een live-regio (role=status), «Історія» erbuiten (niet bij elke activiteit voorlezen)', has(cnc, "<small><span role='status'>{t(`Непрочитаних: ${unreadCount}`, `Ongelezen: ${unreadCount}`)}</span>{t(` · Історія: ${historyCount}`, ` · Geschiedenis: ${historyCount}`)}</small>"));
  check('B bel: naam met aantal ongelezen blijft (aria-label), FAB heet «Написати новий лист»/«Nieuw bericht schrijven»', has(cnc, 't(`Непрочитаних сповіщень: ${unreadCount}`, `Ongelezen meldingen: ${unreadCount}`)') && lees('src/MailOpstelZwevend.tsx').includes("aria-label={t('Написати новий лист', 'Nieuw bericht schrijven')}"));
  const tcss = lees('src/toegankelijk.css');
  check('B focusrand bel/FAB in twee tinten (ring in --panel + --focus), alleen tokens; panelen met focus: rand binnen het vlak',
    /html \.canonical-notification-bell:focus-visible,\s*html \.mail-compose-float:focus-visible \{\s*outline: 2px solid var\(--focus\);\s*outline-offset: 2px;\s*box-shadow: 0 0 0 2px var\(--panel\), 0 0 0 4px var\(--focus\);/.test(tcss) && tcss.includes('outline-offset: -2px') && !HEX.test(zc(tcss)) && !/prefers-color-scheme/.test(tcss));
  check('B prefers-reduced-motion: geen glijdende FAB/menu\'s/vensters (transition/animation 0s); TabsRij schuift zonder «smooth»',
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*html \.mail-compose-float,[\s\S]*transition-duration: 0s !important;[\s\S]*animation-duration: 0s !important;/.test(tcss) && lees('src/ontwerp/TabsRij.tsx').includes("behavior: minderBeweging() ? 'auto' : 'smooth'"));
  check('B toegankelijk.css geladen door de bel én de FAB (beide bundels)', has(cnc, "import './toegankelijk.css';") && lees('src/MailOpstelZwevend.tsx').includes("import './toegankelijk.css';"));
  const px = [...zc(tcss).matchAll(/(?:^|[;{\s])(?:min-|max-)?width:\s*(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 360);
  check('B toegankelijk.css: geen vaste breedte > 360 px, geen letter < 12 px', px.length === 0 && ![...zc(tcss).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12));

  // ------------------------------------------------------------------ C. NotificationPanelBody (render)
  const herstel = nepBrowser();
  try {
    const Body = (await import('../../src/MeldingenpaneelInhoud')).default;
    const nu = Date.now();
    const server = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, kind: i % 2 ? 'security_warning' : 'workspace_share', title: `Melding ${String.fromCharCode(1072 + i)}`, message: 'tekst', createdAt: nu - i * 60000, read: i % 3 === 0 }));
    const html = (lang: 'uk' | 'nl') => renderToStaticMarkup(createElement(Body, { lang, local: [], server, events: [], readEvents: new Set<string>(), onReadLocal: () => undefined, onRemoveLocal: () => undefined, onRunAction: () => undefined, onReadEvent: () => undefined, detailIcons: {} }));
    const uk = html('uk'), nl = html('nl');
    check('C statusfilters: één groep (role=group) van aria-pressed-knoppen — geen halve tablist', /class="cnc-chips" role="group" aria-label="Фільтр за станом"/.test(uk) && !uk.includes('role="tab"') && (uk.match(/class="cnc-chip" aria-pressed=/g) || []).length === 5);
    check('C chip met aantal heet «Непрочитані: 4» (niet «Непрочитані4»); nl «Ongelezen: 4»', uk.includes('aria-label="Непрочитані: 4"') && nl.includes('aria-label="Ongelezen: 4"'));
    check('C schuifpijlen van de chiprij niet in de Tab-volgorde (tabindex=-1)', (uk.match(/class="ut-tabs-pijl[^"]*" tabindex="-1"/g) || []).length === 2);
    const ids = [...uk.matchAll(/<strong id="(cnc-t-[^"]+)">/g)].map((m) => m[1]);
    check('C elke rij heet naar haar titel (article aria-labelledby → <strong id>), knoppen beschreven door die titel', ids.length === 6 && ids.every((id) => uk.includes(`aria-labelledby="${id}"`) && uk.includes(`aria-describedby="${id}"`)), ids.slice(0, 2).join());
    check('C «Прочитано» is een benoemd beeld (role=img + aria-label), niet alleen een title', /class="cnc-done" role="img" aria-label="Прочитано"/.test(uk) && /class="cnc-done" role="img" aria-label="Gelezen"/.test(nl));
    check('C «Фільтри» blijft één disclosure (aria-expanded/aria-controls=cnc-extra)', /class="cnc-filterknop"[^>]*aria-expanded="false"[^>]*aria-controls="cnc-extra"/.test(uk));
  } catch (e) { check('C NotificationPanelBody rendert in node', false, String((e as Error).stack || e).slice(0, 400)); }

  // ------------------------------------------------------------------ D. «Новий лист» (bron)
  const dlg = lees('src/MailNieuwBerichtDialoog.tsx');
  check('D stapel: bovenaan = aria-modal; onder een MODAAL venster = inert; Tab blijft in de brief (houdTab met het venster als houder)',
    dlg.includes("aria-modal={ikBoven && !bedekt ? 'true' : undefined}") && dlg.includes('inert={bedekt || undefined}') && dlg.includes('const bedekt = ikRang >= 0 && stapelNu.slice(ikRang + 1).some((v) => v.modaal && !v.klein);') && dlg.includes('houdTab(event, focusbaar(dialogRef.current), { houder: dialogRef.current })') && !dlg.includes('aria-modal="true"'));
  check('D naarVoren (klik, dok, Alt+Shift+W): focus terug in de brief op het laatst gebruikte veld, anders «Кому»/de tekst', dlg.includes('}, [open, ikBoven, bedekt]);') && dlg.includes('if (laatste && d.contains(laatste) && focusTerug(laatste)) return;') && dlg.includes("onFocusCapture={(event) => { laatsteFocusRef.current = event.target as HTMLElement; }}"));
  check('D dicht (_ × Esc verzonden): focus terug naar de opener (vastgelegd vóór autoFocus), anders de FAB', dlg.includes('openerRef.current = a && a !== document.body ? a : null;') && dlg.includes("if (focusVerloren() && !focusTerug(openerRef.current)) focusTerug(document.querySelector<HTMLElement>('[data-mail-compose-float]'));"));
  check('D Cc/Bcc open → focus in het Cc-veld; dicht → op «Cc/Bcc» (of de korte regel); bestaande aria-expanded blijven',
    dlg.includes("onClick={() => { ccFocusRef.current = 'veld'; setShowCc(true); }} data-nm-kopie aria-expanded={false}") && dlg.includes("onClick={() => { ccFocusRef.current = 'knop'; setShowCc(false); }} data-nm-kopie-dicht aria-expanded={true}") && dlg.includes("d.querySelector<HTMLElement>('[data-nm-cc-velden] input')"));
  check('D korte kopregel: Tab erin → «Кому», Shift+Tab erin (van onder) → «Тема»; ook met het schermtoetsenbord open', dlg.includes("setKopNaar(van && dialogRef.current?.contains(van) && (e.currentTarget.compareDocumentPosition(van) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'onderwerp' : 'aan')") && dlg.includes("(klavier && !kopNaar && !document.activeElement?.closest('[data-nm-kop]'))") && dlg.includes('data-nm-onderwerp'));
  check('D «Видалити чернетку?»: focus op «Скасувати» (veilige keuze), Esc annuleert de vraag (niet het venster), dicht → terug op «Видалити»',
    dlg.includes("if (wisVraag) d.querySelector<HTMLElement>('[data-nm-wis-annuleer]')?.focus();") && dlg.includes("onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setWisVraag(false); } }}") && dlg.includes('data-nm-wis-annuleer>') && dlg.includes("if (event.key !== 'Escape' || event.defaultPrevented) return;"));
  check('D concept-indicator: zichtbare regel zonder live-rol; aparte stille status meldt alleen «mislukt» en «weer bewaard» (uk + nl)',
    !/mail-new-message-sync sync-\$\{draftSync\}`\} role="status"/.test(dlg) && dlg.includes('<span role="status" style={SR_ALLEEN} data-nm-concept-melding>{conceptMelding}</span>') && dlg.includes("'Чернетку знову збережено на сервері.', 'Het concept is weer op de server bewaard.'"));
  check('D verzendfout wordt voorgelezen (role=alert); «Кому» ongeldig blijft aria-invalid + aria-describedby', dlg.includes('<p className="mail-new-message-error" role="alert">{failure}</p>') && dlg.includes('aria-describedby={aanVerlaten && to.trim() !== \'\' && !adressenGeldig(to) ? \'mail-nm-aan-fout\' : undefined}'));

  // ------------------------------------------------------------------ E. editor: keuzelijsten en «⋯» (bron + render)
  const ed = lees('src/MailOpstelBewerker.tsx');
  check('E «⋯» (gemengde inhoud) is GEEN role=menu meer maar een niet-modale popover: aria-haspopup=dialog + aria-controls, geen menuitem in de editor',
    ed.includes("aria-haspopup='dialog' aria-expanded={open} aria-controls={open?paneelId:undefined}") && ed.includes("data-compose-menu='meer' role='dialog' id={paneelId}") && !/role='menuitem'|role='menu'/.test(ed));
  check('E «⋯»: open → focus op het eerste element; ↑/↓/Home/End buiten keuzelijsten; Tab sluit aan de rand; Esc → focus op «⋯»',
    ed.includes('const r=requestAnimationFrame(()=>focusbaar(menu.current)[0]?.focus({preventScroll:true}))') && ed.includes("if(!doel.matches('select,input,textarea')&&menuToets(event,f))return;") && ed.includes("if(event.key==='Escape'){event.preventDefault();setOpen(false);knop.current?.focus();return}"));
  check('E knoppen die het «⋯»-paneel sluiten: data-menu-sluit (sjablonen, stijl, afbeelding, achtergrond); uitklappers met aria-expanded',
    (ed.match(/data-menu-sluit/g) || []).length >= 4 && /<Tegel label=\{t\('Зображення','Afbeelding'\)\} Icoon=\{ImagePlus\} sluit /.test(ed) && ed.includes("uitgeklapt={insertOpen}") && ed.includes('uitgeklapt={backgroundOpen}') && readFileSync('src/editor/MeerTabs.tsx', 'utf8').includes("aria-expanded={uitgeklapt} data-menu-sluit={sluit ? '' : undefined}") && ed.includes("className='mail-compose-color-menu' role='group'"));
  check('E keuzelijst: knop heet «Стиль блоку: Звичайний» (waarde in de naam), focus IN de lijst op de gekozen optie, opties niet tabbaar, ↑/↓/Home/End, Esc/Tab → knop',
    ed.includes("aria-label={`${ariaLabel}: ${label}`}") && ed.includes("(o[active]||o[0])?.focus({preventScroll:true})") && ed.includes("role='option' tabIndex={-1}") && ed.includes('if(menuToets(event,opties()))return;') && ed.includes("aria-controls={open?lijstId:undefined}") && !ed.includes('if(next)onChange(next.value)'));
  check('E tekstvak: rol/naam op het bewerkbare ProseMirror-element (attributes), niet op de niet-focusbare omhulling',
    ed.includes("attributes:()=>({role:'textbox','aria-multiline':'true','aria-label':editorNaamRef.current})") && !ed.includes("className='mail-compose-canvas' role='textbox'"));
  check('E alle zichtbare teksten uk + nl: zwevende balk, invoegblokken, achtergrondkleuren (geen hard Oekraïens label meer)',
    !/aria-label='[А-Яа-яІіЇїЄєҐґ]/.test(ed) && !/data-tooltip='[А-Яа-яІіЇїЄєҐґ]/.test(ed) && ed.includes("['divider','Роздільник','Scheidingslijn']") && ed.includes("t('Лавандовий','Lavendel')") && ed.includes("t('Швидке форматування','Snelle opmaak')"));
  check('E bestaande regels van agent B blijven (portaal, useBuitenSluit 2×, sjablonen 1×)', /createPortal\(<div ref=\{menu\} className='mail-compose-more-menu mail-compose-zwevend'/.test(ed) && /createPortal\(<div ref=\{menu\} className='mail-compose-dropdown-menu mail-compose-zwevend'/.test(ed) && (ed.match(/useBuitenSluit\(open,setOpen,\[root,menu\]\)/g) || []).length === 2 && (ed.match(/className='mail-sjabloon-item'/g) || []).length === 1);

  // ------------------------------------------------------------------ F. «⋮» van een rij, mailboxkiezer (bron + render)
  const qa = lees('src/MailRijSnelleActies.tsx');
  check('F «⋮», de actiegroep en het menu heten naar de rij («Інші дії: <тема>»); rijen geven het onderwerp mee',
    qa.includes("aria-label={p.rijNaam?`${t('Інші дії','Andere acties')}: ${p.rijNaam}`:t('Інші дії','Andere acties')}") && qa.includes("role='menu' aria-label={p.rijNaam?`${t('Дії з листом','Berichtacties')}: ${p.rijNaam}`") && qa.includes("role='group' aria-label={p.rijNaam?`${t('Швидкі дії','Snelle acties')}: ${p.rijNaam}`") && lees('src/MailBerichtRij.tsx').includes('rijNaam={message.subject||noSubject}') && lees('src/MailMinimumBerichtRij.tsx').includes('rijNaam={p.message.subject||p.noSubject}'));
  check('F menu-inhoud geldig voor role=menu: secties zijn role=group (geen regio), menuitems hebben een geldige ouder', qa.includes("<section className='mail-row-color-action' role='group'") && qa.includes("<section className='mail-row-action-context' role='group'"));
  check('F menu dicht → focus terug op «⋮» als ze weg was (wacht tot «⋮» niet meer disabled is, anders de knop die de brief opent); bestaande toetsen blijven',
    qa.includes('if(k&&k.isConnected&&!k.disabled&&focusTerug(k)&&!focusVerloren())return;if(++poging<60){window.setTimeout(terug,50);return}') && qa.includes("querySelector<HTMLElement>('.google-mail-open')") && qa.includes("else if(event.key==='Tab'){setOpen(false);moreRef.current?.focus()}") && qa.includes('focusFirst.current=event.detail===0'));
  const badge = lees('src/MailAccountBadge.tsx'), sw = lees('src/MailAccountWisselaar.tsx');
  check('F mailboxkiezer (telefoon + computer): open → focus op de gekozen mailbox (menuitemradio aria-checked), ↑/↓/Home/End, Esc/Tab → knop',
    badge.includes("m?.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true]')") && badge.includes('if (menuToets(e, items)) return;') && badge.includes("if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }") && sw.includes("m?.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true]')") && sw.includes("if(event.key==='Escape'){setOpen(false);knop.current?.focus()}"));
  check('F menu benoemd («Поштові скриньки»), kop/voet zonder landmark-rol (role=none); foto/initialen/logo decoratief (aria-hidden)',
    badge.includes("role=\"menu\" aria-label={t('Поштові скриньки', 'Mailboxen')}") && badge.includes('<header role="none">') && badge.includes('<footer role="none">') && (badge.match(/mail-account-badge-photo is-klein" aria-hidden="true"/g) || []).length === 2 && sw.includes("<header role='none'>") && sw.includes("className='mail-provider-mark google' aria-hidden='true'"));
  check('F regels van agent C blijven (is-klein 2×, initialen in eigen span, foto alt="")', (badge.match(/mail-account-badge-photo is-klein/g) || []).length === 2 && badge.includes('fallback={<span className="mail-account-badge-initial">{initialsOf(a)}</span>}') && (badge.match(/alt=""/g) || []).length >= 2);

  // ------------------------------------------------------------------ G. «Поштові акаунти» (render) + koppelvenster + logo's
  try {
    await (await import('../../src/merk/merk-register')).laadMerken();
    const MailAccountsHub = (await import('../../src/MailAccountsHub')).default;
    const html = renderToStaticMarkup(createElement(MailAccountsHub, { lang: 'uk', userName: 'Павло', accounts: [{ id: 'p1', email: 'eigenaar@example.test', provider: 'Google', status: 'connected', accountRole: 'primary' }] }));
    const nl = renderToStaticMarkup(createElement(MailAccountsHub, { lang: 'nl', accounts: [{ id: 'p1', email: 'eigenaar@example.test', provider: 'Google', status: 'connected', accountRole: 'primary' }] }));
    check('G «Відключити eigenaar@example.test» / «Перепідключити eigenaar@example.test» (naam begint met de zichtbare tekst)', html.includes('aria-label="Відключити eigenaar@example.test"') && html.includes('aria-label="Перепідключити eigenaar@example.test"') && nl.includes('aria-label="Loskoppelen eigenaar@example.test"') && nl.includes('aria-label="Opnieuw koppelen eigenaar@example.test"'));
    check('G live-regio\'s staan er altijd (role=status en role=alert, leeg) — niet pas mét de melding', /<div role="status" tabindex="-1" data-mail-melding-focus="true"><\/div><div role="alert"><\/div>/.test(html), html.slice(html.indexOf('data-mail-gekoppeld'), html.indexOf('data-mail-gekoppeld') + 500));
    check('G logo\'s in tegels en rijen decoratief (aria-hidden), de naam staat ernaast; «Чому недоступно?» blijft een native <details>', (html.match(/class="mail-provider-logo"><(?:svg|span) aria-hidden="true"/g) || []).length === (html.match(/class="mail-provider-logo"/g) || []).length && /class="mail-koppeling-kop"><(?:svg|span) aria-hidden="true"/.test(html) && html.includes('<summary>Чому недоступно?</summary>') && !/class="mail-provider-logo"><(?:svg|span) role="img"/.test(html), (html.match(/class="mail-provider-logo"><[^>]{0,60}/g) || []).slice(0, 3).join(' | '));
    check('G «Додати ще один Gmail» houdt de dienst in de zichtbare tekst (agent D)', html.includes('Додати ще один<!-- --> <!-- -->Gmail') || html.includes('Додати ще один Gmail'));
  } catch (e) { check('G MailAccountsHub rendert in node', false, String((e as Error).stack || e).slice(0, 400)); }
  const hub = lees('src/MailAccountsHub.tsx');
  check('G vraag «Відключити …?» = alertdialog met titel en uitleg; open → focus op «Скасувати»; Esc/«Скасувати» → terug op «Відключити»; rij weg → op de melding',
    hub.includes("role='alertdialog' aria-labelledby={`${vraagId}-titel`} aria-describedby={`${vraagId}-uitleg`}") && hub.includes("rijVan(nu)?.querySelector<HTMLElement>('[data-mail-ontkoppel-annuleer]')?.focus()") && hub.includes("rij.querySelector<HTMLElement>('[data-mail-ontkoppel]')?.focus()") && hub.includes("hub.querySelector<HTMLElement>('[data-mail-melding-focus]')?.focus()") && hub.includes("if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setVraag(null); }"));
  const kv = lees('src/mail/MailKoppelVenster.tsx');
  check('G koppelvenster: wachtwoordveld heet «Пароль застосунку» (aria-labelledby), uitleg = aria-describedby; na koppelen focus op het resultaat (role=status)',
    kv.includes('aria-labelledby={`${veldId}-naam`} aria-describedby={`${veldId}-uitleg`}') && kv.includes("ref={klaarRef} tabIndex={-1} role='status'") && kv.includes('useEffect(() => { if (klaar) klaarRef.current?.focus(); }, [klaar]);') && kv.includes("<p role='alert'"));
  try {
    const Merk = (await import('../../src/merk/Merk')).default;
    const plaat = renderToStaticMarkup(createElement(Merk, { merk: 'ukrnet', maat: 36 }));
    const benoemd = renderToStaticMarkup(createElement(Merk, { merk: 'ukrnet', maat: 36, titel: 'Ukr.net' }));
    const mono = renderToStaticMarkup(createElement(Merk, { merk: 'iets-onbekends-xyz', naam: 'Iets', maat: 36 }));
    check('G neutrale plaat: decoratief (aria-hidden, focusable=false) zonder titel; met titel role=img + naam; monogram ook aria-hidden', /^<svg aria-hidden="true"[^>]*focusable="false"[^>]*data-merk="neutraal"/.test(plaat) && /^<svg role="img" aria-label="Ukr.net"/.test(benoemd) && /^<span aria-hidden="true"[^>]*data-merk="onbekend"/.test(mono), `${plaat.slice(0, 90)} | ${mono.slice(0, 60)}`);
  } catch (e) { check('G Merk rendert in node', false, String((e as Error).stack || e).slice(0, 300)); }
  herstel();

  // ------------------------------------------------------------------ H. stand: de stappen bestaan en meten met de volledige WCAG-set
  const stand = lees('tests/e2e/hulp/stand-toegankelijk.ts'), knip = lees('tests/e2e/stand-knipsels-20261020.ts');
  check('H stand: zes stappen a11y-* met axe wcag2a/aa + 21a/aa + 22aa, één import + één regel in de stand',
    ['a11y-meldingen', 'a11y-fab-bel', 'a11y-opstellen', 'a11y-mail-rij', 'a11y-postvakken', 'a11y-accounts'].every((n) => stand.includes(`S('${n}'`)) && stand.includes("export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];") && (knip.match(/stand-toegankelijk/g) || []).length === 1 && knip.includes('...toegankelijkStappen({'));
  return einde();
}
