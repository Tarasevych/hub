// MELDLINK-001 (16.11.2026) — СТОРОЖ ПОСИЛАНЬ У СПОВІЩЕННЯХ · bewaker van links in meldingen.
// Скарга Павла: «у деяких сповіщеннях посилання ведуть не на дійсну сторінку». Тест перевіряє СПРАВЖНЮ поведінку:
//   A. копія маршрутів у shared/melding-link.ts = public/canonical-service.js, а padBestaat() збігається зі справжнім маршрутизатором;
//   B. КОЖНЕ посилання, яке сервер пише в сповіщення (meld/notify/siteMelding/beheerAlarm у backend/), розібране з коду TypeScript,
//      абсолютне й веде на сторінку, яку справжній маршрутизатор НЕ показує як 404 — нове сповіщення на неіснуючий маршрут валить тест;
//   C. старі адреси (у базі та в історії браузера) читаються як дійсні: відносні, перейменовані, mcp.*/#extensie тощо;
//   D. реєстр пояснень (uitleg-register): усі deeplink і кнопки «Відкрити» ведуть на існуючі сторінки;
//   E. панель у браузері: відносна адреса на id.* веде на правильний піддомен, а локально лишається відносною;
//   F. якорі, на які ведуть сповіщення, справді є в розмітці.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { checker } from './hulp/nep-google';
import { LEGACY_ALIAS, LINK_DIENSTEN, TAB_SLUG, dienstVoorHost, padBestaat, routeerMeldingLink } from '../../shared/melding-link';
import { MENU_PAGINAS } from '../../shared/menu-model';
import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { normaliseerGebeurtenis } from '../../shared/meldingen-ecosysteem/model';
import { interpreteerGebeurtenis } from '../../shared/meldingen-ecosysteem/tolk';
import { REGISTER } from '../../shared/meldingen-v2/uitleg-register';
import type { V2Melding } from '../../shared/meldingen-v2/groepering';
import { leesHash } from '../../src/agenten/agenten-hash';

const lees = (p: string) => readFileSync(p, 'utf8');

/** Справжній маршрутизатор public/canonical-service.js у мінімальному «браузері» (без DOM). */
const ROUTER_BRON = lees('public/canonical-service.js');
function echteRoute(href: string): { service: string; tab: string; onbekend: boolean } {
  const u = new URL(href);
  const el = () => ({ style: {}, dataset: {}, setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {}, classList: { add() {}, remove() {} } });
  const loc = { href: u.href, hostname: u.hostname, host: u.host, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, protocol: u.protocol, replace() {}, assign() {} };
  const doc = { addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el,
    documentElement: { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, style: {}, lang: 'uk', setAttribute() {} }, head: { appendChild() {} }, body: { appendChild() {} }, cookie: '', title: '' };
  const opslag = { getItem: () => null, setItem() {}, removeItem() {} };
  const w: Record<string, unknown> = { location: loc, document: doc, history: { replaceState() {}, pushState() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, localStorage: opslag, sessionStorage: opslag, navigator: { language: 'uk' }, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  w.window = w; w.self = w;
  const namen = Object.keys(w);
  // Вміст файлу — наш власний код із репозиторію (без підстановок); виконується лише в тесті.
  new Function(...namen, ROUTER_BRON)(...namen.map((k) => w[k]));
  const r = (w.__TSV_CANONICAL_SERVICE__ as { resolve: () => { service: string; tab: string; onbekend?: boolean } }).resolve();
  return { service: r.service, tab: r.tab, onbekend: r.onbekend === true };
}
/** Чи відкриває адреса справжню сторінку (наш хост, https, маршрутизатор не каже «404»)? Гостьова сторінка /toegang обробляється до маршрутизатора (src/main.tsx). */
function dijsnaPagina(href: string): boolean {
  let u: URL; try { u = new URL(href); } catch { return false; }
  if (u.protocol !== 'https:' || !dienstVoorHost(u.hostname)) return false;
  if (u.hostname === SERVICE_HOSTS.identity && u.pathname === '/toegang') return true;
  return !echteRoute(u.href).onbekend;
}

/** Усі .ts-файли під теку. */
function bestanden(map: string): string[] {
  const uit: string[] = [];
  for (const n of readdirSync(map)) {
    const p = join(map, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') uit.push(...bestanden(p)); } else if (/\.ts$/.test(n) && !/\.d\.ts$/.test(n)) uit.push(p);
  }
  return uit;
}

/** Обчислює рядок/шаблон посилання з коду: SERVICE_HOSTS.x, SITE_BASIS(), сталі файлу; невідомі вирази → «x». */
function waarde(node: ts.Node, sf: ts.SourceFile, consts: Map<string, ts.Node>, diepte = 0): string | undefined {
  if (diepte > 4) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return waarde(node.expression, sf, consts, diepte + 1);
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) s += expr(span.expression, sf, consts, diepte) + span.literal.text;
    return s;
  }
  if (ts.isIdentifier(node) && consts.has(node.text)) return waarde(consts.get(node.text)!, sf, consts, diepte + 1);
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && consts.has(node.expression.text)) {
    const f = consts.get(node.expression.text)!;
    if (ts.isArrowFunction(f) && !ts.isBlock(f.body)) return waarde(f.body, sf, consts, diepte + 1);
  }
  return undefined;
}
function expr(e: ts.Expression, sf: ts.SourceFile, consts: Map<string, ts.Node>, diepte: number): string {
  const t = e.getText(sf);
  const host = /^SERVICE_HOSTS\.(\w+)$/.exec(t);
  if (host) return (SERVICE_HOSTS as Record<string, string>)[host[1]] ?? 'ONBEKENDE-HOST';
  if (t === 'SITE_BASIS()') return `https://${SERVICE_HOSTS.identity}`;
  if (t === 'SITE_MCP') return `https://${SERVICE_HOSTS.mcp}`;
  const v = waarde(e, sf, consts, diepte + 1);
  return v ?? 'x';
}

// Функції сповіщень і позиція аргументу-посилання (від 0).
const MELDERS: Record<string, number> = { meld: 4, notify: 5, siteMelding: 3 };
type Gevonden = { plek: string; link: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('meldlink-001');

  // ---------------------------------------------------------------- A. маршрути
  const bron = ROUTER_BRON;
  const slugM = /const TAB_SLUG=(\{[^}]*\})/.exec(bron), aliasM = /const LEGACY_ALIAS=(\{[^}]*\})/.exec(bron);
  const slugs = slugM ? (new Function(`return ${slugM[1]}`)() as Record<string, string>) : {};
  const aliassen = aliasM ? (new Function(`return ${aliasM[1]}`)() as Record<string, string>) : {};
  check('A1 TAB_SLUG у shared/melding-link.ts = public/canonical-service.js', !!slugM && JSON.stringify(slugs) === JSON.stringify(TAB_SLUG));
  check('A2 LEGACY_ALIAS у shared/melding-link.ts = public/canonical-service.js', !!aliasM && JSON.stringify(aliassen) === JSON.stringify(LEGACY_ALIAS));
  check('A3 кожна служба з SERVICE_HOSTS має сторінки в MENU_PAGINAS', LINK_DIENSTEN.every((d) => (MENU_PAGINAS[d] || []).length > 0));
  const mis: string[] = [];
  const proefPaden = ['/', '/agenda', '/mail', '/cloud', '/diagnostiek', '/aanmeldmethoden-beheer', '/onzin', '/sessions', '/sessies', '/gedeeld/abc', '/toegang', '/agents', '/agenten', '/updates', '/connections', '/postvak-in', '/inbox'];
  for (const d of LINK_DIENSTEN) {
    const paden = [...proefPaden, ...(MENU_PAGINAS[d] || []).map((id) => `/${id}`), ...(MENU_PAGINAS[d] || []).map((id) => `/${TAB_SLUG[id] || id}`)];
    for (const p of paden) {
      const echt = !echteRoute(`https://${SERVICE_HOSTS[d]}${p}`).onbekend || (d === 'identity' && p === '/toegang');
      if (echt !== padBestaat(d, p)) mis.push(`${d}${p}: router=${echt} padBestaat=${padBestaat(d, p)}`);
    }
  }
  check('A4 padBestaat() збігається зі справжнім маршрутизатором для всіх сторінок і пробних шляхів', mis.length === 0, mis.slice(0, 6).join('; '));

  // ---------------------------------------------------------------- B. джерела сповіщень на сервері
  const gevonden: Gevonden[] = [];
  const onopgelost: string[] = [];
  for (const f of bestanden('backend')) {
    const src = lees(f);
    if (!/\b(meld|notify|siteMelding)\(/.test(src)) continue;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
    const eigenMelder = /type Melder = \(userId: string, email: string, kind: string, titel: string, tekst: string\)/.test(src);
    const consts = new Map<string, ts.Node>();
    const verzamel = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer); ts.forEachChild(n, verzamel); };
    verzamel(sf);
    // Типові значення параметра link у siteMelding(..., link = '/aanmeldmethoden') — це теж посилання сповіщення.
    const bezoek = (n: ts.Node) => {
      if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n)) && n.parameters) {
        for (const p of n.parameters) if (ts.isIdentifier(p.name) && p.name.text === 'link' && p.initializer) consts.set(`__standaard_${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line}`, p.initializer);
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text in MELDERS) {
        // impersonatie/ondersteuning: eigen Melder (userId, email, kind, titel, tekst) — посилання там немає взагалі.
        const i = n.expression.text === 'meld' && eigenMelder ? 5 : MELDERS[n.expression.text];
        const arg = n.arguments[i];
        const plek = `${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
        // impersonatie/ondersteuning gebruiken een eigen meld(id, email, …) zonder link-argument op deze plek: herkenbaar aan een e-mail als 2e argument.
        const tekst = arg ? arg.getText(sf) : '';
        // Тіло siteMelding(): `${BASIS}${link}` — перевіряється нижче разом зі значенням за замовчуванням і кожним переданим link.
        const doorgifte = /\$\{link\}`$/.test(tekst);
        if (arg && !doorgifte) {
          // Doorgeefluik (de aanroeper levert de link): link, l, pad … — die worden elders als literal gecontroleerd.
          if (!/^(link|l|pad|href)$/.test(tekst)) {
            const v = waarde(arg, sf, consts);
            if (v === undefined) onopgelost.push(`${plek}: ${tekst.slice(0, 80)}`); else gevonden.push({ plek, link: v });
          }
        }
        // siteMelding: ook het basis-sjabloon in de definitie (`https://…${link}`) met elke doorgegeven/standaard link combineren.
      }
      ts.forEachChild(n, bezoek);
    };
    bezoek(sf);
    // siteMelding-definities: basis + standaard + elke literal die aanroepers als 4e argument meegeven.
    const def = /async function siteMelding\([^)]*link = '([^']*)'\)[^{]*\{\s*await meld\([^;]*?, `([^`]*)\$\{link\}`\)/.exec(src);
    if (def) {
      const basis = def[2].replace('${SITE_BASIS()}', `https://${SERVICE_HOSTS.identity}`).replace(/\$\{SERVICE_HOSTS\.(\w+)\}/g, (_, k) => (SERVICE_HOSTS as Record<string, string>)[k]);
      gevonden.push({ plek: `${f}:siteMelding(standaard)`, link: `${basis}${def[1]}` });
      for (const g of gevonden.filter((x) => x.plek.startsWith(f) && x.link.startsWith('/'))) g.link = `${basis}${g.link}`;
    }
  }
  // siteMelding-aanroepen in andere bestanden (telegram-aanmelden/*.ts) krijgen dezelfde basis als hun definitie.
  const tgBasis = `https://${SERVICE_HOSTS.identity}`;
  for (const g of gevonden) if (g.link.startsWith('/') && /telegram-aanmelden|apparaat-bevestiging/.test(g.plek)) g.link = `${tgBasis}${g.link}`;

  check('B1 сторож справді бачить джерела (≥ 40 посилань у сповіщеннях сервера)', gevonden.length >= 40, `знайдено ${gevonden.length}`);
  check('B2 кожне посилання з коду вдалося обчислити (немає «невідомих» виразів)', onopgelost.length === 0, onopgelost.slice(0, 5).join(' | '));
  const relatief = gevonden.filter((g) => !/^https:\/\//.test(g.link));
  check('B3 сервер не пише ВІДНОСНИХ посилань (вони відкриваються на чужому піддомені)', relatief.length === 0, relatief.slice(0, 6).map((g) => `${g.plek} → ${g.link}`).join(' | '));
  const dood = gevonden.filter((g) => /^https:\/\//.test(g.link) && !dijsnaPagina(g.link));
  check('B4 кожне посилання сервера веде на сторінку, яку маршрутизатор не показує як 404', dood.length === 0, dood.slice(0, 6).map((g) => `${g.plek} → ${g.link}`).join(' | '));
  // Ті самі адреси після routeerMeldingLink не змінюються (джерела вже правильні — «перенаправлення» потрібне лише старим записам).
  const herschreven = gevonden.filter((g) => /^https:\/\//.test(g.link) && routeerMeldingLink(g.link) !== new URL(g.link).href);
  check('B5 нові посилання сервера вже канонічні (routeerMeldingLink їх не змінює)', herschreven.length === 0, herschreven.slice(0, 4).map((g) => `${g.plek}: ${g.link} → ${routeerMeldingLink(g.link)}`).join(' | '));
  const idx = lees('backend/index.ts');
  check('B6 notify() пише й siteNotificationOverview() віддає посилання через meldingLink(…, soort)',
    /\.\.\.\(meldingLink\(link, kind\) \? \{ link: meldingLink\(link, kind\) \} : \{\}\)/.test(idx) && /meldingLink\(item\.link,String\(item\.kind\|\|''\)\)\?\{link:meldingLink\(item\.link,String\(item\.kind\|\|''\)\)\}/.test(idx));

  // ---------------------------------------------------------------- C. старі адреси (база, історія браузера, розширення)
  const ID = `https://${SERVICE_HOSTS.identity}`, ADM = `https://${SERVICE_HOSTS.admin}`, MCP = `https://${SERVICE_HOSTS.mcp}`, HUB = `https://${SERVICE_HOSTS.hub}`;
  const oud: Array<[string, string, string | undefined]> = [
    // [opgeslagen link, verwacht, soort]
    ['/diagnostiek', `${ADM}/diagnostiek`, 'beveiliging.zekering'],
    ['/diagnostiek', `${ADM}/diagnostiek`, undefined],
    ['/agenda', `${HUB}/agenda`, 'agenda'],
    ['/mail', `https://${SERVICE_HOSTS.mail}/`, 'mail_ai_balk'],
    ['/cloud', `https://${SERVICE_HOSTS.cloud}/`, 'cloud_alleen_lezen'],
    ['/', `https://${SERVICE_HOSTS.mail}/`, 'mail_queue_refused'],
    ['/', `${HUB}/`, undefined],
    ['/gedeeld/abc', `https://${SERVICE_HOSTS.cloud}/gedeeld/abc`, 'workspace_share'],
    [`${ID}/aanmeldmethoden-beheer`, `${ADM}/sso`, 'security'],
    [`${MCP}/#extensie`, `${MCP}/agents#extensie`, undefined],
    [`${ID}/agenda`, `${HUB}/agenda`, undefined],
    [`${ID}/onzin-pagina?x=1`, `${ID}/`, undefined],
    [`${ID}/sessions?apparaat=1`, `${ID}/sessions?apparaat=1`, 'security'],
    [`${MCP}/agents#dostupy`, `${MCP}/agents#dostupy`, 'security'],
    ['/klimop', `${MCP}/agents#orch`, 'klimop.sleutel.rotatie'],
    ['/', `${MCP}/agents#orch`, 'klimop.quorum'],
    ['/afstemming', `https://${SERVICE_HOSTS.api}/afstemming`, 'afstemming.kaart'],
    ['/', `https://${SERVICE_HOSTS.api}/afstemming`, 'afstemming'],
    ['/geheugen', `https://${SERVICE_HOSTS.ai}/processen`, 'geheugen.knoop'],
    ['/', `https://${SERVICE_HOSTS.ai}/processen`, 'owner.ai.geheugen'],
    ['/huis', `https://${SERVICE_HOSTS.huis}/`, 'huis.uitnodiging'],
    ['/', `https://${SERVICE_HOSTS.huis}/`, 'huis'],
    ['/foto', `https://${SERVICE_HOSTS.cloud}/fotos`, 'foto.import'],
    ['/', `https://${SERVICE_HOSTS.cloud}/fotos`, 'foto'],
    ['/klant', `https://${SERVICE_HOSTS.crm}/`, 'klant.nieuw'],
    ['/klantrelatie', `https://${SERVICE_HOSTS.crm}/`, 'owner.klantrelatie.klant'],
    ['/', `https://${SERVICE_HOSTS.crm}/`, 'klantrelatie'],
    ['/social', `${ID}/netwerken`, 'social.bericht'],
    ['/', `${ID}/netwerken`, 'social'],
    ['https://example.org/pad', 'https://example.org/pad', undefined],
  ];
  const fout = oud.filter(([raw, verwacht, soort]) => routeerMeldingLink(raw, { soort }) !== verwacht);
  check('C1 старі/відносні адреси з бази читаються як дійсні сторінки', fout.length === 0, fout.map(([r, v, s]) => `${r} (${s}) → ${routeerMeldingLink(r, { soort: s })} ≠ ${v}`).join(' | '));
  check('C2 кожна виправлена стара адреса справді відкривається маршрутизатором', oud.filter(([, v]) => v.includes('tarasevych')).every(([raw, , soort]) => dijsnaPagina(routeerMeldingLink(raw, { soort }))));
  check('C3 javascript:/data:/// не стають посиланням', ['javascript:alert(1)', '//evil.example/x', 'data:text/html,x'].every((x) => !/^https:\/\/[a-z]+\.tarasevych\.com/.test(routeerMeldingLink(x)) && !/^javascript|^data/.test(routeerMeldingLink(x) || '') || routeerMeldingLink(x) === x && !/^https:/.test(x)));
  // Екосистема: збережений рядок (melding_ecosysteem_gebeurtenissen) зі старою адресою і новий запис від розширення 0.9.x.
  const rij = normaliseerGebeurtenis({ id: 'e1', bron: 'beveiliging.zekering', subdomein: 'admin', meta: { link: '/diagnostiek' }, acties: [{ id: 'a', label: 'Відкрити', soort: 'navigeer', href: '/diagnostiek' }, { id: 'b', label: 'API', soort: 'api', href: '/api/x' }] });
  check('C4 екосистема: збережений рядок із відносним meta.link і кнопкою «navigeer» → admin.*/diagnostiek; «api» не чіпаємо',
    rij.meta.link === `${ADM}/diagnostiek` && rij.acties[0]?.href === `${ADM}/diagnostiek` && rij.acties[1]?.href === '/api/x');
  const ext = interpreteerGebeurtenis({ bron: 'extensie', subdomein: 'mcp', titel: 't', link: `${MCP}/#extensie` });
  check('C5 сигнал розширення (link mcp.*/#extensie у background.js) відкриває сторінку «Підключення ШІ» з розділом «Розширення»', ext.meta.link === `${MCP}/agents#extensie` && leesHash('#extensie').tab === 'extensie');
  const spiegel = interpreteerGebeurtenis({ bron: 'agenda', soort: 'agenda', titel: 't', link: '/agenda' });
  check('C6 дзеркало site_notifications в екосистемі: /agenda → hub.*/agenda (а не піддомен, де відкрито панель)', spiegel.meta.link === `${HUB}/agenda`);
  const extBron = lees('extension/background.js');
  const extLinks = [...extBron.matchAll(/link: '([^']+)'/g)].map((m) => routeerMeldingLink(m[1]));
  check('C7 усі посилання сповіщень у розширенні після нормалізації ведуть на дійсні сторінки', extLinks.length > 0 && extLinks.every(dijsnaPagina), extLinks.join(' | '));

  // ---------------------------------------------------------------- D. реєстр пояснень
  const leeg = (soort: string, link?: string): V2Melding => ({ id: 'm', dienst: 'site', soort, categorie: soort, titel: 't', tijd: 0, link } as unknown as V2Melding);
  const regDood: string[] = [];
  for (const r of REGISTER) {
    const m = leeg(r.id);
    const doelen = [r.deeplink(m), ...r.acties.map((a) => a.href?.(m)).filter((x): x is string => !!x)];
    for (const d of doelen) if (!dijsnaPagina(d)) regDood.push(`${r.id}: ${d}`);
  }
  check('D1 реєстр пояснень: усі deeplink і кнопки ведуть на існуючі сторінки', regDood.length === 0, regDood.slice(0, 6).join(' | '));
  const zek = REGISTER.find((r) => r.id === 'beveiliging-zekering');
  check('D2 реєстр: відносне посилання джерела (/diagnostiek) стає admin.*/diagnostiek, а не шляхом на поточному піддомені', !!zek && zek.deeplink(leeg('beveiliging.zekering', '/diagnostiek')) === `${ADM}/diagnostiek`);

  // ---------------------------------------------------------------- E. панель у браузері (історія сповіщень спільна для піддоменів)
  const g = globalThis as Record<string, unknown>;
  const voor = Object.getOwnPropertyDescriptor(g, 'location');
  const zet = (href: string) => Object.defineProperty(g, 'location', { value: new URL(href), configurable: true, writable: true });
  try {
    const { normalizeLink } = await import('../../src/meldingen/lokale-rijen');
    zet(`${ID}/sessions`);
    const opId = normalizeLink({ href: '/diagnostiek', label: 'x' });
    const eigen = normalizeLink({ href: '/sessions', label: 'x' });
    const oudAbs = normalizeLink({ href: `${ID}/aanmeldmethoden-beheer`, label: 'x' });
    check('E1 на id.*: «/diagnostiek» з історії → admin.*/diagnostiek; «/sessions» лишається на id.*; стара абсолютна → admin.*/sso',
      opId?.href === `${ADM}/diagnostiek` && eigen?.href === `${ID}/sessions` && oudAbs?.href === `${ADM}/sso`, `${opId?.href} | ${eigen?.href} | ${oudAbs?.href}`);
    zet('http://localhost:5173/');
    check('E2 локальна розробка (localhost): відносна адреса не стає продакшн-адресою', normalizeLink({ href: '/updates', label: 'x' })?.href === '/updates');
  } finally {
    if (voor) Object.defineProperty(g, 'location', voor); else delete g.location;
  }

  // ---------------------------------------------------------------- F. якорі
  check('F1 admin.*/sso#telegram-beheer: блок має id і прокручується після лінивого завантаження', /id='telegram-beheer'/.test(lees('src/telegram-aanmelden/TelegramBeheer.tsx')) && /useAnkerScroll\('telegram-beheer'/.test(lees('src/telegram-aanmelden/TelegramBeheer.tsx')));
  check('F2 admin.*/sso#apparaat-beheer: блок має id і прокручується', /id='apparaat-beheer'/.test(lees('src/apparaat-bevestiging/BeheerSectie.tsx')) && /useAnkerScroll\('apparaat-beheer'/.test(lees('src/apparaat-bevestiging/BeheerSectie.tsx')));
  check('F3 admin.*/updates#toegang: блок «Хто має доступ до підготовки» має id і прокручується', /id='toegang'/.test(lees('src/uitrol/ToegangBlok.tsx')) && /useAnkerScroll\('toegang'\)/.test(lees('src/uitrol/ToegangBlok.tsx')));
  const ankers: Array<[string, string]> = [['#toegangscodes', 'src/Toegangscodes.tsx'], ['#aanmeldmethoden-herstel', 'src/HerstelcodesSectie.tsx'], ['#aanmeldmethoden-passkeys', 'src/ToegangssleutelsSectie.tsx']];
  check('F4 якорі id.* зі сповіщень існують у розмітці', ankers.every(([a, f]) => lees(f).includes(`id='${a.slice(1)}'`)));
  const mcpHashes = gevonden.map((x) => x.link).filter((l) => l.startsWith(`${MCP}/agents#`)).map((l) => new URL(l).hash);
  check('F5 якорі сторінки «Підключення ШІ» зі сповіщень розпізнаються (не падають на «Огляд» мовчки)', mcpHashes.length > 0 && mcpHashes.every((h) => { const p = leesHash(h); return p.tab !== 'overzicht' || /^#(overzicht|overview|pending)/.test(h); }), mcpHashes.join(' '));

  // ---------------------------------------------------------------- G. справжня база: старі записи й новий запис через notify()
  if (!process.env.DATABASE_URL) {
    console.log('ПРОПУЩЕНО G (немає DATABASE_URL): перевірка читання старих сповіщень із бази / overgeslagen zonder database');
  } else {
    const { randomUUID } = await import('node:crypto');
    const { getPool } = await import('../../server/platform/pg');
    const idxMod = await import('../../backend/index');
    const { meld } = await import('../../backend/melder');
    const pool = getPool('systeem');
    const stil = console.error; console.error = () => {};
    try {
      const uid = randomUUID(), email = `meldlink-${uid.slice(0, 8)}@eenheid.test`;
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email, role: 'member', status: 'approved', name: email }]);
      // Так їх записував старий код (до MELDLINK-001): відносні шляхи й неіснуюча сторінка.
      const oudeRijen: Array<[string, string, string]> = [
        // beveiliging.zekering is technisch (alleen met technisch profiel zichtbaar); dezelfde oude link onder een gewone soort (hint: id.*):
        ['toegang_alleen_lezen', '/diagnostiek', `${ADM}/diagnostiek`],
        ['mail_ai_balk', '/mail', `https://${SERVICE_HOSTS.mail}/`],
        ['cloud_alleen_lezen', '/cloud', `https://${SERVICE_HOSTS.cloud}/`],
        ['agenda', '/agenda', `${HUB}/agenda`],
        ['mail_queue_refused', '/', `https://${SERVICE_HOSTS.mail}/`],
        ['security', `${ID}/aanmeldmethoden-beheer`, `${ADM}/sso`],
      ];
      for (const [kind, link] of oudeRijen) {
        await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['site_notifications', randomUUID(), { recipientUserId: uid, recipientEmail: email, kind, title: `oud ${kind}`, message: 'm', link, read: false, createdAt: Date.now() }]);
      }
      const r = await idxMod.siteNotificationOverview({ id: uid, email, role: 'member', status: 'approved' } as never, {});
      const perSoort = new Map(r.notificationItems.map((m: { kind: string; link?: string }) => [m.kind, m.link]));
      const mis = oudeRijen.filter(([kind, , verwacht]) => perSoort.get(kind) !== verwacht);
      check('G1 старі сповіщення в базі (відносні/неіснуючі адреси) сервер віддає з дійсними адресами — без міграції', mis.length === 0 && oudeRijen.length === r.notificationItems.length,
        mis.map(([k]) => `${k}: ${perSoort.get(k)}`).join(' | ') + ` · бачимо: ${[...perSoort.keys()].join(',')}`);
      await meld(uid, 'agenda', 'nieuw', 'm', '/agenda');
      const nieuw = (await pool.query(`SELECT data FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 AND data->>'title'='nieuw'`, [uid])).rows[0]?.data as { link?: string } | undefined;
      check('G2 новий запис через meld()/notify(): у базу лягає абсолютна адреса потрібного піддомену', nieuw?.link === `${HUB}/agenda`, String(nieuw?.link));
      await pool.query(`DELETE FROM app.records WHERE (tbl='site_notifications' AND data->>'recipientUserId'=$1) OR (tbl='users' AND id=$1)`, [uid]);
    } finally { console.error = stil; }
  }

  return einde();
}
