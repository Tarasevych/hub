// Аудит пошти 18.10.2026 (виконавець M1): рядок листа.
//  1. «Громіздкий» — однакова сітка (колонки з порядку блоків), більший текст, аватар у межах.
//  2. Непрочитане — фон за темою помітно інший у КОЖНІЙ палітрі, лівий маркер лишився, крапка справа в обох видах рядка.
//  3. Контраст другорядного тексту ≥ 4.5:1 до фону прочитаних і непрочитаних у кожній палітрі (було: 3.9 у «Графіт» світлій).
//  4. :focus-visible — кожне правило, що прибирало outline без власного кільця, тепер компенсоване; кнопки дій рядка мають кільце.
//  5. Тач-зона кнопок шапки листа 44 px — лише перевірка, без змін.
// Спершу кожен блок відтворює старий стан (на старих формулах/правилах), потім перевіряє новий.
import { readFileSync, readdirSync } from 'node:fs';
import { contrast, kleurWaarden, meng, PUUR, SECTIES } from '../../src/thema/paletten';
import { defaultMailDensityProfiles, normalizeMailDensityProfiles, type MailDensityProfile } from '../../src/mail-dichtheid-profiel';
import { mailBulkyRaster, BULKY_MIN_TEKST } from '../../src/mail-ruim-raster';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
type W = { panel: string; surface2: string; text: string; muted: string; faint: string; accent: string };

// ---- kleurrekenen (sRGB ↔ OKLab/OKLCH, zoals de browser color-mix en oklch(from …) doet; buiten gamma: per kanaal afknippen)
const hex = (h: string) => { let v = h.replace('#', ''); if (v.length === 3) v = v.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255); };
const lin = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
const gam = (l: number) => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
const naarHex = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
function oklab(h: string) {
  const [r, g, b] = hex(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function vanOklab([L, a, bb]: number[]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return naarHex([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam));
}
const dE = (a: string, b: string) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
/** color-mix(in oklab, a t, b) */
const mengOk = (a: string, b: string, t: number) => { const x = oklab(a), y = oklab(b); return vanOklab(x.map((v, i) => v * t + y[i] * (1 - t))); };

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-rij-2026-10-18');
  const css = lees('src/mail-rij-2026-10-18.css');
  const chrome = lees('src/canoniek-omlijsting.css');
  const thread = lees('src/mail-gesprek-bewerker.css');
  const ws = lees('src/google-mail-werkruimte.css');

  // ---------------------------------------------------------------- paletten (alle keuzes van de site × licht/donker)
  const uitCss = (sel: string): W => {
    const m = new RegExp(`\\.canonical-chrome\\.${sel}\\{([^}]*)\\}`).exec(chrome);
    const zes = (h: string) => (h.length === 4 ? `#${h.slice(1).split('').map((c) => c + c).join('')}` : h).toLowerCase();
    const v = (k: string) => zes((new RegExp(`--${k}:(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\\b`).exec(m?.[1] || '') || [])[1] || '');
    return { panel: v('panel'), surface2: v('surface2'), text: v('text'), muted: v('muted'), faint: v('faint'), accent: v('accent') };
  };
  const paletten: Array<{ naam: string; w: W; donker: boolean; getint?: boolean }> = [
    { naam: 'grifel licht', w: uitCss('theme-light'), donker: false }, { naam: 'grifel donker', w: uitCss('theme-dark'), donker: true },
    { naam: 'violet licht', w: uitCss('theme-plum-light'), donker: false, getint: true }, { naam: 'violet donker', w: uitCss('theme-plum-dark'), donker: true },
    { naam: 'puur licht', w: PUUR.licht, donker: false }, { naam: 'puur donker', w: PUUR.donker, donker: true },
    ...SECTIES.flatMap((s) => [{ naam: `kleur ${s} licht`, w: kleurWaarden(s).licht, donker: false, getint: true }, { naam: `kleur ${s} donker`, w: kleurWaarden(s).donker, donker: true }]),
  ];
  check('paletten: 26 combinaties ingelezen (grifel, violet uit canoniek-omlijsting.css; puur en kleur uit paletten.ts)', paletten.length === 26 && paletten.every((p) => /^#/.test(p.w.panel) && /^#/.test(p.w.accent) && /^#/.test(p.w.muted)), paletten.filter((p) => !/^#/.test(p.w.panel)).map((p) => p.naam).join());

  // achtergrond van gelezen rijen (ongewijzigd): licht surface2 72 % op panel, donker panel 62 % op zwart
  check('fon прочитаних: formules in google-mail-werkruimte.css ongewijzigd', ws.includes('--mail-read-surface:color-mix(in srgb,var(--surface2) 72%,var(--panel) 28%)') && ws.includes('--mail-read-surface:color-mix(in srgb,var(--panel) 62%,#000 38%)'));
  const gelezen = (p: { w: W; donker: boolean }) => (p.donker ? meng(p.w.panel, '#000000', 0.62) : meng(p.w.surface2, p.w.panel, 0.72));

  // nieuwe waarden uit de CSS halen (de test rekent met wat er echt staat)
  const lichtM = /html\.palet-violet \.google-mail-workspace:not\(\[data-mail-unread-custom='true'\]\)\{--mail-unread-surface:color-mix\(in oklab,var\(--accent\) (\d+)%,var\(--panel\)\)\}/.exec(css);
  const donkerM = /theme-plum-dark \.google-mail-workspace:not\(\[data-mail-unread-custom='true'\]\)\{--mail-unread-surface:color-mix\(in srgb,var\(--accent\) (\d+)%,var\(--panel\)\)\}/.exec(css);
  const secM = /--mail-row-secondary:color-mix\(in srgb,var\(--muted\) (\d+)%,var\(--text\)\)/.exec(css);
  check('CSS: licht (kleur, violet) = color-mix(in oklab, accent …, panel), donker = color-mix(accent …, panel), tweede tekst = muted ↔ text', !!lichtM && !!donkerM && !!secM, JSON.stringify([lichtM?.[0], donkerM?.[1], secM?.[1]]));
  const tL = Number(lichtM?.[1] || 0) / 100, tD = Number(donkerM?.[1] || 0) / 100, tS = Number(secM?.[1] || 0) / 100;
  const ongelezen = (p: { w: W; donker: boolean; getint?: boolean }) => (p.donker ? meng(p.w.accent, p.w.panel, tD) : p.getint ? mengOk(p.w.accent, p.w.panel, tL) : p.w.panel);

  // ---------------------------------------------------------------- 3. contrast (eerst het oude gebrek)
  // 20.10.2026 (ontwerpfundament): --muted/--faint van grifel en violet licht zijn donkerder gemaakt (≥ 4,5:1 op alle oppervlakken);
  // de reproductie van het gebrek van 18.10 rekent daarom met de HISTORISCHE waarden van canoniek-omlijsting.css van toen.
  const OUD_CHROME: Record<string, { muted: string; faint: string }> = { 'grifel licht': { muted: '#6a7580', faint: '#8a949e' }, 'violet licht': { muted: '#746077', faint: '#917d94' } };
  const histor = (p: { naam: string; w: W }) => ({ ...p, w: { ...p.w, ...(OUD_CHROME[p.naam] || {}) } });
  const oud = paletten.map(histor).filter((p) => contrast(meng(p.w.muted, p.w.faint, 0.88), gelezen(p)) < 4.5).map((p) => p.naam);
  check('ВІДТВОРЕННЯ: стара суміш muted 88 % / faint у прочитаних нижче 4.5:1 у «Графіт» і «Фіолетова» світлих (історичні значення 18.10)', oud.includes('grifel licht') && oud.includes('violet licht'), oud.join(', '));
  const oudMuted = paletten.map(histor).filter((p) => contrast(p.w.muted, gelezen(p)) < 4.5).map((p) => p.naam);
  check('ВІДТВОРЕННЯ: навіть чистий --muted (18.10) у прочитаних «Графіт» світлої нижче 4.5:1 (уривок у рядку)', oudMuted.includes('grifel licht'), oudMuted.join(', '));
  const slecht: string[] = [];
  for (const p of paletten) {
    const sec = meng(p.w.muted, p.w.text, tS);
    const a = contrast(sec, gelezen(p)), b = contrast(sec, ongelezen(p)), c = contrast(p.w.text, ongelezen(p));
    if (a < 4.5 || b < 4.5 || c < 7) slecht.push(`${p.naam}: ${a.toFixed(2)}/${b.toFixed(2)}/${c.toFixed(2)}`);
  }
  check('другорядний текст ≥ 4.5:1 на прочитаному й непрочитаному фоні, основний ≥ 7:1 на непрочитаному — усі 26 палітр', slecht.length === 0, slecht.join(' | '));
  check('другорядний колір — той самий токен --muted, лише трохи темніший (не новий токен палітри)', tS >= 0.7 && tS < 0.9 && !/--muted\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('усі місця другорядного тексту в рядку (відправник-адреса, уривок, дата, мінімальний рядок) беруть --mail-row-secondary', ['.mail-row-snippet-block>small', '.mail-row-date-block time', '.mail-row-sender-copy>small', '.mail-minimum-snippet', '.mail-minimum-date'].every((s) => css.split('{color:var(--mail-row-secondary)}')[0].includes(s)));

  // ---------------------------------------------------------------- 2. ongelezen achtergrond
  const oudVerschil = paletten.filter((p) => p.donker).map((p) => ({ n: p.naam, d: dE(p.w.panel, gelezen(p)) }));
  check('ВІДТВОРЕННЯ: у темних темах непрочитаний (= панель) майже не відрізняється від прочитаного (ΔE OKLab < 0.08)', oudVerschil.every((x) => x.d < 0.08), oudVerschil.map((x) => `${x.n} ${x.d.toFixed(3)}`).join(', '));
  const zwak: string[] = [];
  for (const p of paletten) {
    const d = dE(ongelezen(p), gelezen(p)), min = p.donker ? 0.1 : 0.04;
    if (d < min) zwak.push(`${p.naam} ΔE ${d.toFixed(3)} < ${min}`);
  }
  check('фон непрочитаного помітно інший у КОЖНІЙ палітрі: світлі ΔE ≥ 0.04, темні ΔE ≥ 0.1 (удвічі більше, ніж було)', zwak.length === 0, zwak.join(' | '));
  const tint = paletten.filter((p) => !p.donker && p.getint).filter((p) => { const u = oklab(ongelezen(p)), q = oklab(p.w.panel); return Math.hypot(u[1] - q[1], u[2] - q[2]) < 0.002 && dE(ongelezen(p), p.w.panel) < 0.008; }).map((p) => p.naam);
  check('світлі кольорова й фіолетова: у непрочитаному справді є відтінок акценту (відрізняється від панелі)', tint.length === 0, tint.join(', '));
  const mono = paletten.filter((p) => !p.donker && !p.getint).map((p) => `${p.naam}: тінт ${dE(mengOk(p.w.accent, p.w.panel, 0.03), gelezen(p)).toFixed(3)} < білий ${dE(p.w.panel, gelezen(p)).toFixed(3)}`);
  check('«Графіт» і «Чиста» світлі лишаються білими: відтінок їхнього майже безбарвного акценту лише зменшив би різницю', paletten.filter((p) => !p.donker && !p.getint).every((p) => dE(mengOk(p.w.accent, p.w.panel, 0.03), gelezen(p)) < dE(p.w.panel, gelezen(p))), mono.join(' | '));
  const regelsU = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{--mail-unread-surface:[^}]*\}/g)].map((m) => m[1].split(',').map((x) => x.trim()));
  check('власний колір непрочитаних з налаштувань лишається пріоритетним (кожен селектор під :not([data-mail-unread-custom=true]))', regelsU.length === 3 && regelsU.flat().every((x) => x.endsWith(":not([data-mail-unread-custom='true'])")), JSON.stringify(regelsU));
  check('лівий маркер непрочитаних (3 px акценту) не прибрано', thread.includes(".google-mail-row.unread::before{content:'';position:absolute;z-index:1;inset:0 auto 0 0;width:3px;background:var(--accent)}"));
  const row = lees('src/MailBerichtRij.tsx'), min = lees('src/MailMinimumBerichtRij.tsx');
  check('крапка справа є в обох видах рядка (звичайний/громіздкий і мінімальний), лише для непрочитаних', row.includes("message.unread&&!skeleton&&<span className='mail-row-unread-dot' aria-hidden='true'/>") && min.includes("p.message.unread&&!p.skeleton&&<span className='mail-row-unread-dot' aria-hidden='true'/>"));
  check('крапка: absolute по центру висоти, під кнопками дій (z 3 < 9), не ловить курсор', /\.google-mail-row>\.mail-row-unread-dot\{[^}]*position:absolute;z-index:3;top:50%;[^}]*margin-top:-4px;[^}]*pointer-events:none/.test(css) && css.includes('.google-mail-row.unread .mail-row-hover-actions{z-index:9}'));
  check('місце для крапки однакове в усіх рядках (інакше колонки прочитаних/непрочитаних розійшлися б)', /\.google-mail-row\.mail-row-semantic-order \.mail-row-block-stream\{padding-right:/.test(css) && !/\.google-mail-row\.unread\.mail-row-semantic-order \.mail-row-block-stream\{padding-right/.test(css));

  check('телефон, мінімальний рядок: крапка ліворуч від завжди видимої «⋮» (не ховається під нею), місце однакове в усіх рядках', /@media \(max-width:720px\)\{\s*html body \.google-mail-workspace \.google-mail-row\.mail-row-minimum\{padding-right:60px!important\}\s*html body \.google-mail-workspace \.google-mail-row\.mail-row-minimum>\.mail-row-unread-dot\{right:44px\}/.test(css));

  // ---------------------------------------------------------------- 1. «Громіздкий»
  const n = defaultMailDensityProfiles.normal, b = defaultMailDensityProfiles.bulky;
  const OUD_BULKY = { senderNameSize: 14, subjectSize: 14, snippetSize: 12, dateSize: 12, avatarSize: 34 };
  check('ВІДТВОРЕННЯ: старі типові розміри «Громіздкого» не більші за «Звичайний» (14/14/12/12 проти 14/14.5/13/13)', OUD_BULKY.subjectSize < n.subjectSize && OUD_BULKY.snippetSize < n.snippetSize && OUD_BULKY.senderNameSize <= n.senderNameSize);
  check('нові типові: текст «Громіздкого» більший за «Звичайний» і «Мінімальний» у кожному полі', b.senderNameSize > n.senderNameSize && b.subjectSize > n.subjectSize && b.snippetSize > n.snippetSize && b.dateSize > n.dateSize && b.subjectSize > defaultMailDensityProfiles.minimum.subjectSize, JSON.stringify([b.senderNameSize, b.subjectSize, b.snippetSize, b.dateSize]));
  check('CSS-нижня межа тексту «Громіздкого» = BULKY_MIN_TEKST (навіть якщо профіль зменшили)', css.includes(`font-size:max(var(--mail-density-subject-size,16px),${BULKY_MIN_TEKST.subject}px)`) && css.includes(`font-size:max(var(--mail-density-snippet-size,14.5px),${BULKY_MIN_TEKST.snippet}px)`) && css.includes(`font-size:max(var(--mail-density-sender-name-size,15.5px),${BULKY_MIN_TEKST.sender}px)`));
  check('аватар «Громіздкого»: 36–44 px (помітний, не домінує), типово 40', b.avatarSize === 40 && css.includes('width:clamp(36px,var(--mail-density-avatar-size,40px),44px)'));
  const oudOpgeslagen = { ...b, ...OUD_BULKY, senderEmailSize: 11 } as MailDensityProfile;
  const migr = normalizeMailDensityProfiles({ bulky: oudOpgeslagen }).bulky;
  check('збережений профіль = старий типовий → нові типові розміри', migr.subjectSize === 16 && migr.avatarSize === 40, JSON.stringify([migr.subjectSize, migr.avatarSize]));
  const eigen = normalizeMailDensityProfiles({ bulky: { ...oudOpgeslagen, subjectSize: 19 } }).bulky;
  check('власні налаштування «Громіздкого» не перезаписуються', eigen.subjectSize === 19 && eigen.snippetSize === 12);

  const r0 = mailBulkyRaster(b);
  check('сітка (типово): аватар | відправник | тема+уривок в одній колонці | дата', r0.kolommen.join() === 'avatar,sender,copy,date' && r0.vars['--mail-bulky-c-subject'] === '3' && r0.vars['--mail-bulky-c-snippet'] === '3' && r0.vars['--mail-bulky-r-subject'] === '1' && r0.vars['--mail-bulky-r-snippet'] === '2', JSON.stringify(r0));
  check('сітка: колонки фіксовані (аватар, відправник-частка, fr, дата) — не залежать від вмісту рядка', r0.vars['--mail-bulky-cols'] === 'var(--mail-bulky-avatar,40px) minmax(0,var(--mail-bulky-sender,22%)) minmax(0,1fr) var(--mail-bulky-date,6.75rem)' && !/auto|max-content|min-content/.test(r0.vars['--mail-bulky-cols']));
  check('сітка: вкладення окремим рядком під текстом', r0.vars['--mail-bulky-c-attach'] === '3 / 4' && r0.vars['--mail-bulky-r-attach'] === '3');
  const r1 = mailBulkyRaster({ ...b, subjectSnippetLayout: 'inline' });
  check('в один рядок: тема і уривок — дві колонки (2fr/3fr), обидві в рядку 1', r1.kolommen.join() === 'avatar,sender,subject,snippet,date' && r1.vars['--mail-bulky-r-snippet'] === '1' && r1.vars['--mail-bulky-c-attach'] === '3 / 5');
  const r2 = mailBulkyRaster({ ...b, blockOrder: ['sender', 'avatar', 'date', 'subject', 'snippet', 'attachments'] });
  check('порядок блоків з редактора збережено (відправник, аватар, дата, текст)', r2.kolommen.join() === 'sender,avatar,date,copy' && r2.vars['--mail-bulky-c-date'] === '3');
  const r3 = mailBulkyRaster({ ...b, showAvatar: false, showSnippet: false });
  check('без аватара й уривка: відправник | тема | дата', r3.kolommen.join() === 'sender,subject,date' && !r3.vars['--mail-bulky-c-avatar']);
  const gw = lees('src/GoogleMailWerkruimte.tsx');
  check('сітка вмикається лише для «Громіздкого» (змінні лише при density==="bulky", CSS лише [data-density-mode=bulky] і > 720 px)', gw.includes("...(density==='bulky'?mailBulkyRaster(activeDensityProfile).vars:{})") && /@media \(min-width:721px\)\{\s*html body \.google-mail-workspace\[data-density-mode='bulky'\]/.test(css));

  // ---------------------------------------------------------------- 4. :focus-visible
  const scan = () => {
    const files = readdirSync('src').filter((f) => /^(mail-.*|google-mail-werkruimte)\.css$/.test(f) && f !== 'mail-rij-2026-10-18.css');
    const zonder = new Set<string>(), met = new Set<string>();
    for (const f of files) {
      const t = lees(`src/${f}`).replace(/\/\*[\s\S]*?\*\//g, '');
      const re = /([^{}@]+)\{([^{}]*)\}/g; let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        const sel = m[1].trim(), body = m[2];
        if (!/:focus-visible/.test(sel)) continue;
        const parts = sel.split(',').map((p) => p.trim().replace(/\s+/g, ' ')).filter((p) => /:focus-visible/.test(p));
        const ring = /outline\s*:\s*(?:\d+(?:\.\d+)?px\s+)?solid|box-shadow\s*:[^;]*\b0 0 0 [1-9]/.test(body), weg = /outline\s*:\s*(none|0)\b/.test(body);
        for (const p of parts) { if (ring) met.add(p); else if (weg) zonder.add(p); }
      }
    }
    return [...zonder].filter((p) => !met.has(p));
  };
  const open = scan();
  check('ВІДТВОРЕННЯ: у CSS пошти є правила :focus-visible{outline:none} без власного кільця', open.length > 20, String(open.length));
  const blok = (/html :is\(([\s\S]*?)\)\{outline:2px solid var\(--accent\);outline-offset:2px\}/.exec(css)?.[1] || '').split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const ontbreekt = open.filter((s) => !blok.includes(s));
  check('кожне таке правило компенсоване кільцем 2px акценту з відступом 2px', ontbreekt.length === 0, ontbreekt.join(' | '));
  for (const s of ['.mail-row-hover-actions>button:focus-visible', '.mail-row-actions-overflow>.mail-row-actions-more:focus-visible', '.mail-row-swipe-actions>button:focus-visible', '.mail-minimum-paperclip:focus-visible', '.mail-minimum-select:focus-visible', '.mail-minimum-star:focus-visible']) {
    check(`кнопка рядка має видимий фокус: ${s}`, css.includes(`html ${s}`));
  }
  check('поля з outline:none: кільце на контейнері (:focus-within) — пошук, поля нового листа, нова мітка', ['.mail-search-inline-input:focus-within', '.mail-new-message-field:focus-within', '.mail-reader-new-label:focus-within'].every((s) => css.includes(s)));
  check('без глобального переписування: немає правил на *, button чи :focus-visible без класу', !/(^|[\s,{}])(\*|button|:focus-visible)\s*[,{]/m.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));

  // ---------------------------------------------------------------- 5. тач-зона шапки листа (лише перевірка)
  check('тач-зона кнопок шапки листа вже 44×44 px (іконка 17 px) — без змін', ws.includes('.google-mail-reader>header .mail-reader-icon-action{position:relative;display:grid;place-items:center;flex:0 0 auto;width:44px;height:44px;') && lees('src/mail-mobiel.css').includes('html body .mail-reader-icon-action{min-width:44px;min-height:44px}') && !css.includes('mail-reader-icon-action{'));
  return einde();
}
