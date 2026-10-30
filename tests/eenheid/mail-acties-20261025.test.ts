// Eenheidstest 25.10.2026 (blok 1 «швидкі виправлення», team «acties»): één bron voor de acties met een brief, de balk van de rij binnen
// de rij, en «Перегляд» niet meer onder de balk.
//
// WAT ER MIS WAS (oorzaak, gemeten in de stand — /home/claude/onderzoek/A-lijst-dok-bel-bijlagen.md 1.1, 1.2, 6.1):
//  1.1 De snelle acties (.mail-row-hover-actions) staken in «Мінімум» en «Детальний» 5–5,6 px boven de rij uit: de basis centreerde de
//      balk met translateY(-50%) rond --mail-row-actions-y, de minimale rij zette «top» als BOVENRAND (8 px) zonder de transform terug
//      te zetten (8 − 13 = −5). De minimale rij mat het anker niet eens.
//  1.2 Zeven kopieën van dezelfde acties (rij + ⋮, instellingen, selectiebalk + «›», leesvenster, onderbalk, veegknoppen, sneltoetsen)
//      met elk eigen namen en vijf manieren van kleuren — o.a. CSS op de tekst van aria-label (src/ui-golf-11.css) en #7c3aed. In de
//      balk van de rij was alles grijs, in de selectie was «До кошика» rood en archief blauw, in de veegknop archief --accent.
//  6.1 Het «око» (Попередній перегляд) lag in de datum ónder de balk: in «Громіздкий» raakte zijn midden «Архівувати», in
//      «Мінімум»/«Детальний» was het helemaal niet aan te klikken.
// Deze test houdt vast: het register (shared/mail-acties.ts) is volledig en consequent; elk oppervlak neemt naam, pictogram en toon
// daaruit; de enige plek die een toon kleurt is src/mail/mail-acties.css (alleen tokens); geen kleur op aria-label; de balk staat met
// één regel (top:clamp, zonder transform) binnen de rij; «Перегляд» staat vooraan in de balk en wat onder de balk ligt is verborgen.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { MAIL_ACTIES, MAIL_ACTIE_GROEPEN, MAIL_ACTIE_IDS, MAIL_ACTIE_TONEN, mailActieGroep, mailActieSneltoets, mailActieTekst, mailActieTeksten, mailActieToon, type MailActieId } from '../../shared/mail-acties';
import { sneltoets } from '../../src/mail/lees-modus';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const KYR = /[А-Яа-яІіЇїЄєҐґ]/;
// Zelfde nagebootste browser als lezer-context-20261024 (canonical-service leest window bij het laden van de modules).
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS', 'innerWidth', 'innerHeight'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(g, 'navigator', { value: { platform: 'Linux', userAgent: 'eenheid' }, configurable: true, writable: true });
  Object.defineProperty(g, 'innerWidth', { value: 1600, configurable: true, writable: true });
  Object.defineProperty(g, 'innerHeight', { value: 900, configurable: true, writable: true });
  g.CSS = { escape: (s: string) => s };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}
const bestanden = (d: string, ext: string, uit: string[] = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) bestanden(p, ext, uit); else if (p.endsWith(ext)) uit.push(p.replace(/\\/g, '/')); } return uit.sort(); };

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-acties-20261025');

  // ------------------------------------------------------------------ A. het register
  const ids = MAIL_ACTIE_IDS;
  check(`A register: ${ids.length} acties, elk met groep, toon en lange tekst in uk (cyrillisch) én nl (latijn)`, ids.length >= 35 && ids.every((id) => {
    const d = MAIL_ACTIES[id] as { groep: string; toon: string; lang: { uk: string; nl: string } };
    return MAIL_ACTIE_GROEPEN.some((g) => g.id === d.groep) && MAIL_ACTIE_TONEN.includes(d.toon as never) && KYR.test(d.lang.uk) && !KYR.test(d.lang.nl) && d.lang.uk !== d.lang.nl;
  }));
  const alleTeksten = ids.flatMap((id) => mailActieTeksten(id).map((x) => ({ id, ...x })));
  check(`A elke tekst (${alleTeksten.length}: lang, kort, bulk, instelling, hulp, toestanden) heeft uk én nl, geen sjabloonresten`, alleTeksten.every((x) => KYR.test(x.uk) && x.nl.length > 1 && !KYR.test(x.nl) && !/\$\{|undefined/.test(x.uk + x.nl)));
  const dubbel = ids.filter((a, i) => ids.some((b, j) => j < i && mailActieTekst(a, 'uk') === mailActieTekst(b, 'uk') && a !== 'promoteSender'));
  check('A geen twee acties met dezelfde naam (uk)', dubbel.length === 0, dubbel.join(', '));
  const herstel = nepBrowser();
  try {
  const { mailRowQuickActionIds, mailReaderToolbarActionIds } = await import('../../src/MailSnelleInstellingen');
  const opgeslagen = [...mailRowQuickActionIds, ...mailReaderToolbarActionIds];
  check(`A alle opgeslagen ids (rij ${mailRowQuickActionIds.length}, leesvenster ${mailReaderToolbarActionIds.length}) staan in het register — niets hernoemd`, opgeslagen.every((id) => (ids as string[]).includes(id)), opgeslagen.filter((id) => !(ids as string[]).includes(id)).join(', '));
  check('A de compiler bewaakt dat ook (satisfies readonly MailActieId[] in MailSnelleInstellingen.tsx)', (lees('src/MailSnelleInstellingen.tsx').match(/as const satisfies readonly MailActieId\[\]/g) || []).length === 2);

  // tonen: wat de eigenaar vroeg — verwijderen rood zoals in het menu, archief blauw, overal
  const toon = (id: MailActieId, s?: string) => mailActieToon(id, s);
  check('A tonen: «До кошика», spam, phishing, illegaal = gevaar; archief, verplaatsen, naar Вхідні = info; labels = etiket; belang en blokkeren = let-op',
    toon('trash') === 'gevaar' && toon('spam') === 'gevaar' && toon('phishing') === 'gevaar' && toon('illegal') === 'gevaar' && toon('archive') === 'info' && toon('move') === 'info' && toon('inbox') === 'info'
    && toon('labels') === 'etiket' && toon('attention') === 'let-op' && toon('block') === 'let-op' && toon('read') === 'neutraal' && toon('snooze') === 'neutraal' && toon('preview') === 'neutraal');
  check('A toestand kiest de toon: «Це не спам» is neutraal, «Позначити як спам» gevaar', toon('spam', 'geen-spam') === 'neutraal' && toon('spam', 'spam') === 'gevaar');

  // namen: dezelfde als vroeger op elk oppervlak (tests, de stand en de zoekcatalogus vinden knoppen op naam)
  const n = (id: MailActieId, o: Parameters<typeof mailActieTekst>[2] = {}) => mailActieTekst(id, 'uk', o);
  check('A namen van de rij blijven: «Архівувати», «До кошика», «Позначити прочитаним/непрочитаним», «Відкласти / Змінити відкладання / Задати локальний час»',
    n('archive') === 'Архівувати' && n('trash') === 'До кошика' && n('read', { toestand: 'gelezen' }) === 'Позначити прочитаним' && n('read', { toestand: 'ongelezen' }) === 'Позначити непрочитаним'
    && n('snooze', { toestand: 'nieuw' }) === 'Відкласти' && n('snooze', { toestand: 'wijzig' }) === 'Змінити відкладання' && n('snooze', { toestand: 'lokaal' }) === 'Задати локальний час'
    && n('attention', { toestand: 'belangrijk' }) === 'Позначити відправника важливим' && n('attention', { toestand: 'gewoon' }) === 'Позначити відправника звичайним' && n('classifyPeople') === 'Запам’ятати відправника: Від людей');
  check('A namen van de selectie blijven (vorm «bulk»): «Перемістити до кошика» (de QA-stappen klikken die), «Позначити вибрані як «Від людей»», «Позначити відправників важливими»; menu «›»: «Від людей», «Позначити звичайними»',
    n('trash', { vorm: 'bulk' }) === 'Перемістити до кошика' && mailActieTekst('trash', 'nl', { vorm: 'bulk' }) === 'Naar prullenbak verplaatsen' && n('archive', { vorm: 'bulk' }) === 'Архівувати'
    && n('classifyPeople', { vorm: 'bulk' }) === 'Позначити вибрані як «Від людей»' && n('attention', { vorm: 'bulk', toestand: 'belangrijk' }) === 'Позначити відправників важливими'
    && n('classifyPeople', { vorm: 'bulkKort' }) === 'Від людей' && n('attention', { vorm: 'bulkKort', toestand: 'gewoon' }) === 'Позначити звичайними' && n('trash', { vorm: 'bulkKort' }) === 'Перемістити до кошика' && n('read', { vorm: 'bulkKort', toestand: 'ongelezen' }) === 'Позначити непрочитаним');
  check('A korte namen (onderbalk, veegknop): «Архів», «Відкласти» (ook als het al uitgesteld is), «Кошик», «Прочитано/Непрочитано» — de veegknop heette «Видалити» voor dezelfde actie',
    n('archive', { vorm: 'kort' }) === 'Архів' && n('snooze', { vorm: 'kort', toestand: 'wijzig' }) === 'Відкласти' && n('trash', { vorm: 'kort' }) === 'Кошик' && n('read', { vorm: 'kort', toestand: 'gelezen' }) === 'Прочитано' && n('read', { vorm: 'kort', toestand: 'ongelezen' }) === 'Непрочитано' && mailActieTekst('trash', 'nl', { vorm: 'kort' }) === 'Prullenbak');
  check('A instellingen noemen de actie zelf, niet één toestand: «Стан прочитаності», «Важливий / звичайний відправник»; de classificatie zoals de knop in de rij (was «Позначити як …»)',
    n('read', { vorm: 'instelling', toestand: 'ongelezen' }) === 'Стан прочитаності' && n('attention', { vorm: 'instelling', toestand: 'gewoon' }) === 'Важливий / звичайний відправник' && n('classifyPeople', { vorm: 'instelling' }) === n('classifyPeople'));
  check('A ster: overal «Додати зірочку» / «Прибрати зірочку» (het leesvenster zei «До обраного» / «Прибрати з обраного»)', n('star', { toestand: 'aan' }) === 'Додати зірочку' && n('star', { toestand: 'uit' }) === 'Прибрати зірочку' && mailActieTekst('star', 'nl', { toestand: 'uit' }) === 'Ster verwijderen');
  check('A «Перегляд»: lang = de naam van het «око» (Попередній перегляд: текст, зображення, вкладення), kort «Перегляд» / «Voorbeeld»', n('preview') === 'Попередній перегляд: текст, зображення, вкладення' && n('preview', { vorm: 'kort' }) === 'Перегляд' && mailActieTekst('preview', 'nl', { vorm: 'kort' }) === 'Voorbeeld');
  check('A groepen van «Додаткові дії» in menuvolgorde; «До кошика» als enige in «wissen»', MAIL_ACTIE_GROEPEN.map((g) => g.id).join() === 'antwoord,ordenen,bekijken,veilig,wissen' && ids.filter((id) => mailActieGroep(id) === 'wissen').join() === 'trash' && ['spam', 'block', 'phishing', 'illegal'].every((id) => mailActieGroep(id as MailActieId) === 'veilig'));

  // sneltoetsen: het overzicht en de toetsen zelf (lees-modus.ts) zeggen hetzelfde
  const VERWACHT: Record<string, string> = { reply: 'antwoord', 'reply-all': 'allen', 'forward-attachment': 'doorsturen', archive: 'archief', next: 'volgende', previous: 'vorige' };
  const metToets = ids.filter((id) => mailActieSneltoets(id));
  const mis = metToets.filter((id) => sneltoets({ key: mailActieSneltoets(id).toLowerCase() }, false) !== VERWACHT[id]);
  check(`A sneltoetsen van het register = die van lees-modus.ts (${metToets.map((id) => `${mailActieSneltoets(id)} ${id}`).join(', ')})`, metToets.length === 6 && mis.length === 0, mis.join(', '));

  // ------------------------------------------------------------------ B. de toon in kleur: één bestand, alleen tokens
  const tonen = lees('src/mail/mail-acties.css'), tonenZc = zc(tonen);
  check('B mail-acties.css: een regel per toon met data-mail-actie + data-toon', MAIL_ACTIE_TONEN.every((t) => tonenZc.includes(`[data-mail-actie][data-toon='${t}']{`)));
  check('B gevaar → --fout (tekst ook rood, vlak --fout-vlak), info → --info, let-op → --warn, etiket uit info + fout (geen eigen paars)',
    /\[data-toon='gevaar'\]\{--actie-kleur:var\(--fout\);--actie-tekst:var\(--fout\);[^}]*--actie-vlak:var\(--fout-vlak\);--actie-op-vlak:var\(--text-on-vlak\)\}/.test(tonenZc)
    && /\[data-toon='info'\]\{--actie-kleur:var\(--info\);[^}]*--actie-vlak:var\(--info-vlak\)/.test(tonenZc) && /\[data-toon='let-op'\]\{--actie-kleur:var\(--warn\);/.test(tonenZc)
    && /\[data-toon='etiket'\]\{--actie-kleur:color-mix\(in srgb,var\(--info\) 60%,var\(--fout\)\)/.test(tonenZc));
  check('B mail-acties.css: alleen tokens (geen hex, geen rgb), geen prefers-color-scheme (het donker volgt via de tokens)', !HEX.test(tonenZc) && !/rgba?\(/.test(tonenZc) && !/prefers-color-scheme/.test(tonenZc));
  const toonBronnen = bestanden('src', '.css').filter((f) => f !== 'src/mail/mail-acties.css' && /--actie-(kleur|tekst|vlak|op-vlak|zacht)\s*:/.test(zc(lees(f))));
  check('B --actie-* wordt NERGENS anders gezet dan in mail-acties.css (de enige bron van de toon)', toonBronnen.length === 0, toonBronnen.join(', '));
  // licht en donker: rekenen met de tokens zelf
  const tokens = lees('src/ontwerp/tokens.css');
  const tok = (blok: RegExp, k: string) => (new RegExp(`--${k}:(#[0-9a-fA-F]{6})`).exec(blok.exec(tokens)?.[1] || '') || [])[1] || '';
  const LICHT = /:root, \.theme-light, \.theme-plum-light \{([^}]*)\}/, DONKER = /\.theme-dark, \.theme-plum-dark \{([^}]*)\}/;
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h: string) => { const [r, g, b] = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a: string, b: string) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return x > y ? x / y : y / x; };
  const meng = (a: string, b: string, t: number) => `#${hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
  const uitChrome = (naam: string, k: string) => (new RegExp(`\\.canonical-chrome\\.${naam}\\{[^}]*--${k}:(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\\b`).exec(lees('src/canoniek-omlijsting.css')) || [])[1] || '';
  const zes = (h: string) => (h.length === 4 ? `#${h.slice(1).split('').map((c) => c + c).join('')}` : h);
  const paneel = { licht: zes(uitChrome('theme-light', 'panel')), donker: zes(uitChrome('theme-dark', 'panel')) };
  const kleuren = (b: RegExp) => ({ gevaar: tok(b, 'fout'), info: tok(b, 'info'), 'let-op': tok(b, 'warn'), etiket: meng(tok(b, 'info'), tok(b, 'fout'), 0.6) });
  const laag: string[] = [];
  for (const [modus, b] of [['licht', LICHT], ['donker', DONKER]] as const) for (const [t, k] of Object.entries(kleuren(b))) { const r = ratio(k, paneel[modus]); if (!(r >= 4.5)) laag.push(`${modus} ${t} ${k} ${r.toFixed(2)}`); }
  check(`B elke toon ≥ 4,5:1 op het paneel, licht (${paneel.licht}) en donker (${paneel.donker}) — pictogram én tekst van een menu-item`, laag.length === 0 && /^#/.test(paneel.licht) && /^#/.test(paneel.donker), laag.join(' | '));
  const vlakFout: string[] = [];
  for (const [modus, b] of [['licht', LICHT], ['donker', DONKER]] as const) for (const k of ['fout', 'info']) { const r = ratio(tok(b, `${k}-vlak`), tok(b, 'text-on-vlak')); if (r < 4.5) vlakFout.push(`${modus} ${k}-vlak ${r.toFixed(2)}`); }
  check('B veegknop: tekst op --fout-vlak / --info-vlak ≥ 4,5:1 in licht en donker (--text-on-vlak)', vlakFout.length === 0, vlakFout.join(' | '));

  // ------------------------------------------------------------------ C. geen andere kleurbronnen meer
  const metAriaKleur: string[] = [];
  for (const f of bestanden('src', '.css')) zc(lees(f)).replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel: string, body: string) => { if (/\[aria-label[\^*$|~]?=/.test(sel) && /(^|;|\s)color\s*:/.test(body)) metAriaKleur.push(`${f}: ${sel.trim().slice(0, 70)}`); return ''; });
  check('C geen enkele CSS-regel kleurt meer op de tekst van aria-label (was ui-golf-11.css 5.5, ook alleen-Oekraïens in het donker)', metAriaKleur.length === 0, metAriaKleur.slice(0, 4).join(' | '));
  const golf = zc(lees('src/ui-golf-11.css'));
  check('C ui-golf-11.css: geen #7c3aed/#c4b5fd, geen kleur per groep van ⋮ ([data-groep=…]), geen .danger', !/#7c3aed|#c4b5fd/i.test(golf) && !/data-groep="(veilig|wissen|ordenen)"\][^{]*\{[^}]*color/.test(golf) && !/\.danger/.test(golf));
  const lw = zc(lees('src/mail-lezer-werkbalk.css')), go = zc(lees('src/mail/gesprek-opmaak.css')), mob = zc(lees('src/mail-mobiel.css'));
  check('C leesvenster en onderbalk: geen .danger-kleur meer; veegknoppen zonder eigen kleur per klasse', !/\.danger\{color/.test(lw) && !/onderbalk-knop\.danger/.test(go) && !/\.mail-row-swipe-actions \.(archive|read|trash)\{/.test(mob));
  // elk oppervlak leest de variabele
  const gb = zc(lees('src/mail-gesprek-bewerker.css')), snel = zc(lees('src/mail-rij-snelle-acties.css'));
  check('C elk oppervlak leest color:var(--actie-kleur,var(--muted)): balk van de rij, ⋮-menu, selectiebalk, leesvenster, onderbalk; de veegknop --actie-vlak',
    gb.includes('border-radius:50%;background:var(--panel);color:var(--actie-kleur,var(--muted))}') && snel.includes('color:var(--actie-kleur,var(--muted))}.mail-row-action-icon svg') && snel.includes('color:var(--actie-tekst,inherit)')
    && golf.includes('html body .mail-selection-actions>button[data-mail-actie],html body .mail-selection-actions>details>summary[data-mail-actie]{color:var(--actie-kleur,var(--muted))}') && !golf.includes('>:is(button,details>summary)')
    && lw.includes('html body .google-mail-reader .mail-reader-action-button[data-mail-actie]{color:var(--actie-kleur,var(--muted))}') && lw.includes('.mail-reader-overflow-panel .mail-reader-action-button[data-mail-actie] svg{color:var(--actie-kleur,var(--muted))}')
    && go.includes('background:transparent;color:var(--actie-kleur,var(--muted));') && mob.includes('background:var(--actie-vlak,var(--accent));color:var(--actie-op-vlak,var(--text-on-accent));'));
  check('C geen hex in de oppervlak-CSS die hier veranderde (rij, menu, R8, leesvenster, onderbalk)', ![gb.split('.google-mail-row.mail-row-semantic-order:is(')[1] || '', snel, zc(lees('src/mail-ux-beoordeling-20261021.css')), go].some((c) => HEX.test(c)));

  // ------------------------------------------------------------------ D. de zeven kopieën zijn weg: elk oppervlak gebruikt het register
  const rij = lees('src/MailRijSnelleActies.tsx'), sel = lees('src/MailSelectieWerkbalk.tsx'), wb = lees('src/MailLezerWerkbalk.tsx'), ws = lees('src/GoogleMailWerkruimte.tsx');
  const bericht = lees('src/MailBerichtRij.tsx'), minimum = lees('src/MailMinimumBerichtRij.tsx'), inst = lees('src/MailRijSnelleActieInstellingen.tsx'), hulp = lees('src/mail/SneltoetsenHulp.tsx'), oog = lees('src/voorbeeld/VoorbeeldKnop.tsx');
  const eigenLabel = (src: string) => /t\('(Архівувати|До кошика|Перемістити до кошика|Позначити прочитаним|Позначити непрочитаним|Відкласти|Видалити|Архів|Кошик)'/.test(src);
  check('D 1 rij + ⋮: MailActieKnop, mailActieTekst/-Icoon/-Kenmerken; geen eigen namen of pictogrammen meer', rij.includes("import MailActieKnop,{mailActieIcoon,mailActieKenmerken}from'./mail/MailActieKnop'") && rij.includes("mailActieTekst(id,p.lang,{toestand:toestand(id)})") && !eigenLabel(rij) && !/<Archive\/>|<Trash2\/>/.test(rij) && (rij.match(/\{\.\.\.mailActieKenmerken\(/g) || []).length >= 6);
  check('D 2 instellingen: dezelfde namen als de knoppen (vorm «instelling»), met pictogram en toon', inst.includes("mailActieTekst(id,p.lang,{vorm:'instelling'})") && inst.includes('{...mailActieKenmerken(id)}') && !/read:t\('Стан прочитаності'/.test(inst));
  // (de keuzelijst «Варіанти вибору» noemt mappen — «Кошик» is daar een map, geen actie)
  const selZonderMappen = sel.replace(/category=\(id:MailSelectionCategory\)=>\(\{[^}]*\}\[id\]\)/, '');
  check('D 3 selectie + menu «›»: elke actie een MailActieKnop (bulk / bulkKort), ook «Перемістити» en «Мітки» dragen data-mail-actie', selZonderMappen.length < sel.length && !eigenLabel(selZonderMappen) && (sel.match(/<MailActieKnop /g) || []).length >= 20 && sel.includes("<MailActieKnop actie='trash' lang={lang} vorm='bulk'") && sel.includes("{...mailActieKenmerken('move')} title={mailActieTekst('move',lang)}") && sel.includes("{...mailActieKenmerken('labels')} title={mailActieTekst('labels',lang)}"));
  check('D 4 leesvenster: acties met naam/pictogram/toestand uit het register (lezerActie), geen «danger» meer', ws.includes("const lezerActie=(lang:'uk'|'nl',id:MailReaderToolbarActionId,toestand?:string)=>({id,toestand,label:mailActieTekst(id,lang,{toestand}),icon:mailActieIcoon(id,toestand)})") && (ws.match(/\{\.\.\.lezerActie\(lang,'/g) || []).length === 26 && !/danger:/.test(ws.slice(ws.indexOf("actions={[{...lezerActie"), ws.indexOf("}]}>", ws.indexOf("actions={[{...lezerActie")))));
  check('D 4 werkbalk: groepen uit het register (geen GROEPEN/GROEP_NAAM), data-mail-actie + data-toon op elke actieknop, ∧/∨ en «Відповісти» met naam en toets uit het register',
    !/const GROEPEN|GROEP_NAAM/.test(wb) && wb.includes('MAIL_ACTIE_GROEPEN.map(') && wb.includes('data-reader-action-surface={item.surface} {...kenmerken(item.id,action.toestand)}') && !/action\.danger/.test(wb)
    && wb.includes("aria-keyshortcuts={mailActieSneltoets('previous')}") && wb.includes("aria-keyshortcuts={mailActieSneltoets('reply')}"));
  check('D 5 onderbalk (telefoon): korte namen en toon uit het register', wb.includes("const kort=mailActieTekst(id,p.lang,{vorm:'kort',toestand:action.toestand});return <button key={id} type='button' className='mail-reader-onderbalk-knop' {...kenmerken(id,action.toestand)}") && wb.includes("(['archive','snooze','trash'] as const)"));
  check('D 6 veegknoppen: MailActieKnop met de korte naam (weergave tekst: de zichtbare tekst is de naam)', (bericht.match(/<MailActieKnop actie='(archive|read|trash)' lang=\{lang\}[^>]*vorm='kort' weergave='tekst'/g) || []).length === 3 && !eigenLabel(bericht));
  check('D 7 sneltoetsenoverzicht: naam en toets uit het register', hulp.includes("actie('reply')") && hulp.includes("mailActieTekst(id, 'uk', { vorm: 'hulp' })") && !hulp.includes("'Архівувати'"));
  check('D het «око» zelf: naam en pictogram uit het register (actie «preview»)', oog.includes("mailActieTekst('preview', lang)") && oog.includes("{...mailActieKenmerken('preview')}"));

  // ------------------------------------------------------------------ E. render: data-mail-actie / data-toon en «Перегляд» vooraan
  const { default: MailRowQuickActions } = await import('../../src/MailRijSnelleActies');
  const { default: MailSelectionToolbar } = await import('../../src/MailSelectieWerkbalk');
  const { defaultMailRowQuickActionsPreference } = await import('../../src/MailSnelleInstellingen');
  const noop = () => undefined;
  const balk = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(MailRowQuickActions, { lang: 'uk', rijNaam: 'Тема', busy: false, profile: defaultMailRowQuickActionsPreference.default, unread: true, classificationKind: 'people', classificationManual: '', classificationReason: '', classificationSender: 'a@b.c', unsubscribeAvailable: false, snoozedUntil: 0, providerSnoozed: false, attentionKind: 'ordinary', onAction: noop, onClassifySender: noop, onPromoteMessage: noop, onPromoteSender: noop, onSnooze: noop, onCancelSnooze: noop, onUnsubscribe: noop, onAttention: noop, onSelect: noop, onStar: noop, ...extra } as never));
  const met = balk({ onVoorbeeld: noop }), zonder = balk();
  const volgorde = [...met.matchAll(/<button[^>]*data-mail-actie="([a-zA-Z-]+)"/g)].map((m) => m[1]);
  check(`E balk van de rij: «Перегляд» is de eerste knop (${volgorde.join(' · ')}), dan Відкласти, archief, prullenbak, gelezen`, volgorde.slice(0, 5).join() === 'preview,snooze,archive,trash,read', volgorde.join());
  check('E balk: archief data-toon="info", «До кошика» data-toon="gevaar", namen ongewijzigd (aria-label)', /data-mail-actie="archive" data-toon="info" aria-label="Архівувати"/.test(met) && /data-mail-actie="trash" data-toon="gevaar" aria-label="До кошика"/.test(met) && /data-mail-actie="read" data-toon="neutraal" aria-label="Позначити прочитаним"/.test(met));
  check('E «Перегляд»: naam = het «око», korte tooltip «Перегляд», eigen klik (data-row-eigen) — zonder voorbeeld geen knop', /data-mail-actie="preview" data-toon="neutraal" aria-label="Попередній перегляд: текст, зображення, вкладення" data-row-eigen="true" data-tooltip="Перегляд"/.test(met) && !zonder.includes('data-mail-actie="preview"'));
  const selectie = renderToStaticMarkup(createElement(MailSelectionToolbar, { lang: 'uk', folder: 'inbox', canTrash: true, canArchive: true, restoreAction: '', readState: 'unread', visibleCount: 10, selectedCount: 2, truncated: false, allVisibleSelected: false, someVisibleSelected: true, allSelectedStarred: false, starColor: '#f59e0b', busy: false, userLabels: [{ id: 'L1', name: 'Werk' }], allowUserLabels: true, classificationEnabled: true, classificationState: 'people', classificationDisabledReason: '', attentionEnabled: true, attentionState: 'mixed', onToggleVisible: noop, onSelectCategory: noop, onClear: noop, onBulk: noop, onClassify: noop, onAttention: noop } as never));
  check('E selectiebalk: «Перемістити до кошика» gevaar, «Архівувати» info, «Мітки» etiket, «Перемістити» info, belang let-op (twee verschillende pictogrammen)',
    /data-mail-actie="trash" data-toon="gevaar" aria-label="Перемістити до кошика"/.test(selectie) && /data-mail-actie="archive" data-toon="info" aria-label="Архівувати"/.test(selectie)
    && /<summary data-mail-actie="labels" data-toon="etiket" title="Мітки" aria-label="Мітки">/.test(selectie) && /data-mail-actie="move" data-toon="info" title="Перемістити"/.test(selectie)
    && (selectie.match(/data-mail-actie="attention" data-toon="let-op"/g) || []).length >= 4 && selectie.includes('lucide-badge-alert') && selectie.includes('lucide-badge-minus'));
  const menuKnoppen = [...selectie.matchAll(/<button type="button" data-mail-actie="([a-zA-Z-]+)" data-toon="([a-z-]+)">(?:(?!<\/button>).)*<span>([^<]+)<\/span><\/button>/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);
  check(`E menu «›»: zichtbare tekst = naam (geen aria-label): ${menuKnoppen.slice(0, 4).join(' · ')} …`, menuKnoppen.includes('trash|gevaar|Перемістити до кошика') && menuKnoppen.includes('archive|info|Архівувати') && menuKnoppen.includes('attention|let-op|Позначити звичайними') && menuKnoppen.includes('read|neutraal|Позначити прочитаним'), menuKnoppen.join(' · '));

  // ------------------------------------------------------------------ F. 1.1 de balk binnen de rij: één plaatsing zonder transform
  const minCss = zc(lees('src/mail-minimum-rij.css')), rev = zc(lees('src/mail-ux-beoordeling-20261021.css'));
  const H = 'var(--mail-row-actions-h,calc(var(--mail-row-control,27px) + 2px))';
  check('F basis: top:clamp(0px, anker − hoogte/2, 100% − hoogte), transform:none — geen translateY(-50%) meer', gb.includes(`.mail-row-hover-actions{position:absolute;z-index:6;right:7px;top:clamp(0px,calc(var(--mail-row-actions-y,50%) - ${H}/2),calc(100% - ${H}));bottom:auto;transform:none;translate:none;`));
  const metTransform = bestanden('src', '.css').filter((f) => { const c = zc(lees(f)); return /\.mail-row-hover-actions[^{}]*\{[^}]*(transform:translateY|translate:0 -50%)/.test(c); });
  check('F nergens nog transform/translate op de balk (ook niet in de R8-regel voor de telefoon)', metTransform.length === 0, metTransform.join(', '));
  const eigenTop = [...minCss.matchAll(/\.mail-row-minimum \.mail-row-hover-actions\{([^}]*)\}/g)].filter((m) => /(^|;)top:/.test(m[1]));
  check('F minimale rij: geen eigen «top» meer (bovenrand 8 px naast translateY was de fout), ook niet op ≤ 720 px; de werkruimte evenmin', eigenTop.length === 0 && !/\.google-mail-workspace \.mail-row-hover-actions\{[^}]*top:/.test(gb));
  check('F R8 (telefoon, «Мінімум»): dezelfde clamp rond het anker met de «⋮» (44 px), translate:none', /top:clamp\(0px, calc\(var\(--mail-row-actions-y, 50%\) - var\(--mail-row-actions-h, 44px\) \/ 2\), calc\(100% - var\(--mail-row-actions-h, 44px\)\)\) !important; bottom:auto !important; translate:none;/.test(rev));
  check('F één meting voor beide rijen (useSnelleActiesPlek), geankerd op de datum/meta of de eerste regel — de minimale rij mat vroeger niets',
    rij.includes('export function useSnelleActiesPlek(rij:RefObject<HTMLElement|null>,ankers:string[],deps:unknown[])') && bericht.includes("useSnelleActiesPlek(rowActionsRef,[\"[data-mail-density-block='date']\",'.mail-row-block-stream>*']") && minimum.includes("useSnelleActiesPlek(root,['.mail-minimum-date','.mail-minimum-main']")
    && rij.includes("el.style.setProperty('--mail-row-actions-y'") && rij.includes("el.style.setProperty('--mail-row-actions-h'") && !bericht.includes('snippetMeasureRef'));
  check('F geen overflow:hidden op de rij (de tooltips staan boven de knoppen)', /\.google-mail-row\.mail-row-minimum\{position:relative;display:block;min-width:0;min-height:40px;overflow:visible;/.test(minCss) && !/\.google-mail-row\.mail-row-semantic-order\{[^}]*overflow:hidden/.test(gb));
  // nabootsing: oude en nieuwe formule voor de gemeten rijen (stand 25.10: minimum 41 px, balk 26 px, top 8, transform −13)
  const nieuw = (H: number, y: number, h: number) => Math.max(0, Math.min(y - h / 2, H - h)); // CSS: clamp(MIN, VAL, MAX) = max(MIN, min(VAL, MAX))
  const oudBoven = 8 - 26 / 2, oudDetail = 7.7 - 26.6 / 2;
  check(`F nabootsing ДО: minimum ${oudBoven} px en «Детальний» ${oudDetail.toFixed(1)} px boven de rij; ПІСЛЯ binnen de rij bij elke hoogte en elk anker`,
    oudBoven === -5 && Math.abs(oudDetail + 5.6) < 0.01 && [[41, 20.5, 26], [41, 20.5, 26.6], [44, 22, 44], [96, 23, 28.2], [171.6, 47.6, 28.2], [40, 0, 26], [40, 40, 26], [30, 15, 31]].every(([Hh, y, h]) => { const t = nieuw(Hh, y, h); return t >= 0 && (h > Hh || t + h <= Hh + 1e-9); }));

  // ------------------------------------------------------------------ G. 6.1 «Перегляд» niet meer bedekt
  const vb = zc(lees('src/voorbeeld/voorbeeld.css'));
  check('G rijen geven het voorbeeld door aan de balk (onVoorbeeld) — in elke dichtheid', bericht.includes('onAttention={kind=>onAttention?.(kind)} onVoorbeeld={onVoorbeeld}/>}') && minimum.includes('onAttention={kind=>p.onAttention?.(kind)} onVoorbeeld={p.onVoorbeeld}/>}'));
  check('G wat onder de zichtbare balk ligt (data-onder-balk) is verborgen; met de focus erop wijkt de balk (beide rijen)',
    gb.includes('.google-mail-row.mail-row-semantic-order:is(:hover,:focus-within):not(:has([data-onder-balk]:focus)) [data-onder-balk]{opacity:0;pointer-events:none}') && gb.includes('.google-mail-row.mail-row-semantic-order:has([data-onder-balk]:focus) .mail-row-hover-actions{opacity:0;pointer-events:none}')
    && minCss.includes('.google-mail-row.mail-row-minimum:has([data-onder-balk]:focus) .mail-row-hover-actions{opacity:0;pointer-events:none}') && minCss.includes(':not(:has([data-onder-balk]:focus)) [data-onder-balk],'));
  check('G minimale rij met bijlagen: de balk pas boven de datum (zoals bij «+N»), de datum aanwijsbaar en hij opent de brief', minimum.includes("${hasAttachments?' mail-row-acties-bij-datum':''}") && minimum.includes("data-mail-minimum-actions-trigger={hasAttachments?'date-time':'row'}") && minimum.includes("if(!hasAttachments)return;event.stopPropagation();resetAttachments(true);p.onOpen()") && minCss.includes('.mail-row-minimum.mail-row-acties-bij-datum:has(.mail-minimum-date:hover) .mail-row-hover-actions,'));
  check('G het «око» blijft (toetsenbord, aanraakscherm): geen dode selector .mail-minimum-row meer, pointer-events:auto (erfde «none» in de minimale rij)', !vb.includes('.mail-minimum-row') && /\.voorbeeld-knop\{[^}]*opacity:0;pointer-events:auto;/.test(vb) && bericht.includes('<VoorbeeldKnop') && minimum.includes('<VoorbeeldKnop'));
  check('G «око» in de datum: geen native title (wit systeemblad met de lange naam naast de blauwe stip); korte hint «Перегляд» via data-tooltip, aria-label blijft lang', !/title=/.test(oog) && oog.includes('data-tooltip={kort}') && oog.includes("data-tooltip-placement='left'") && oog.includes('aria-label={naam}') && oog.includes("vorm: 'kort'") && oog.includes('<span role=\'tooltip\'>{kort}</span>') && vb.includes(".mail-row-hover-actions [data-mail-actie='preview']") && vb.includes('.voorbeeld-knop{opacity:0!important;pointer-events:none!important}'));
  const verberg = vb.match(/@media \(hover:hover\) and \(pointer:fine\) and \(min-width:721px\)\{([^}]+)\}/);
  check('G verberg-selector dekt de echte ouders als afstammeling, niet alleen een direct kind `>`', !!verberg && verberg[1].includes('.mail-row-date-block') && verberg[1].includes('.mail-minimum-date') && verberg[1].includes("[data-mail-density-block='date']") && verberg[1].includes(' .voorbeeld-knop') && !verberg[1].includes('>.voorbeeld-knop'), verberg?.[1] || '');
  check('G het oog naast de stip (niet geometrisch onder de balk) krijgt toch data-onder-balk zodra de balk «preview» toont', rij.includes("k.classList.contains('voorbeeld-knop')") && rij.includes('"[data-mail-actie=\'preview\']"'));
  const { default: VoorbeeldKnop } = await import('../../src/voorbeeld/VoorbeeldKnop');
  const oogHtml = renderToStaticMarkup(createElement(VoorbeeldKnop, { lang: 'uk', onOpen: noop }));
  check('G DOM van het oog: geen title=, aria-label is de lange naam, zichtbare tooltip is «Перегляд»', !/\stitle=/.test(oogHtml) && oogHtml.includes('aria-label="Попередній перегляд: текст, зображення, вкладення"') && oogHtml.includes('data-tooltip="Перегляд"') && oogHtml.includes('data-tooltip-placement="left"') && oogHtml.includes('>Перегляд</span>') && !oogHtml.includes('title="Попередній') && !/>Попередній перегляд:/.test(oogHtml), oogHtml);

  } finally { herstel(); }

  // ------------------------------------------------------------------ H. stand
  const stand = lees('tests/e2e/hulp/stand-blok1-acties.ts');
  check('H stand: stappen blok1-acties-rij (elke dichtheid, elke zichtbare rij) en blok1-acties-kleuren (rij, selectie, leesvenster, onderbalk; licht en donker)', stand.includes("naam: 'blok1-acties-rij'") && stand.includes("naam: 'blok1-acties-kleuren'") && stand.includes('elementFromPoint') && stand.includes("emulateMedia({ colorScheme: thema === 'donker' ? 'dark' : 'light' })") && stand.includes("for (const d of DICHTHEDEN)") && stand.includes("kiesTwee(page, ['agc-m1', 'agc-m3'])"));

  return einde();
}
