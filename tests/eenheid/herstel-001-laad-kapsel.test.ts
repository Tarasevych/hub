// HERSTEL-001 (пункт 6): спливна капсула активного завантаження сторінки (#tsv-laad-kapsel) на додаток до верхньої смужки (#tsv-voortgang).
// Перевіряє двомовні підписи розділів (uk / nl), синхронність палітри й назв між index.html та src/navigatie-snel.ts,
// сумісність із зовнішнім винесенням скриптів/стилів для CSP (scripts/beveiliging-bouw.mjs), розпізнавання порожньої
// робочої області (paginaHeeftZichtbareInhoud), відсутність помилкового показу на фонових запитах відкритої сторінки
// та автоматичне приховування після появи вмісту чи завершення навігації.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ACCENT_KLEUREN, DIENST_ACCENT, DIENST_IDS } from '../../shared/menu-model';
// @ts-expect-error -- ESM-сценарій перевірки безпечного складання без окремого .d.ts
import { externalizeInline } from '../../scripts/beveiliging-bouw.mjs';

class NepElement {
  tagName: string;
  id = '';
  hidden = false;
  textContent = '';
  dataset: Record<string, string> = {};
  attributen = new Map<string, string>();
  children: NepElement[] = [];
  parentNode: NepElement | null = null;
  private klassen = new Set<string>();
  private eigenschappen = new Map<string, string>();

  classList = {
    add: (...namen: string[]) => namen.forEach((n) => { if (n) this.klassen.add(n); }),
    remove: (...namen: string[]) => namen.forEach((n) => this.klassen.delete(n)),
    contains: (naam: string) => this.klassen.has(naam),
  };

  style = {
    setProperty: (k: string, v: string) => { this.eigenschappen.set(k, String(v)); },
    removeProperty: (k: string) => { this.eigenschappen.delete(k); },
    getPropertyValue: (k: string) => this.eigenschappen.get(k) || '',
  };

  constructor(tagName: string, private eigenaar?: NepDocument) {
    this.tagName = tagName.toUpperCase();
  }

  set className(waarde: string) {
    this.klassen.clear();
    String(waarde || '').split(/\s+/).filter(Boolean).forEach((k) => this.klassen.add(k));
  }

  get className(): string {
    return [...this.klassen].join(' ');
  }

  get childElementCount(): number {
    return this.children.length;
  }

  get firstElementChild(): NepElement | null {
    return this.children[0] || null;
  }

  get isConnected(): boolean {
    if (!this.eigenaar) return false;
    let cur: NepElement | null = this;
    while (cur) {
      if (cur === this.eigenaar.documentElement || cur === this.eigenaar.body || cur === this.eigenaar.head) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  setAttribute(naam: string, waarde: string) {
    this.attributen.set(naam, String(waarde));
    if (naam === 'id') this.id = String(waarde);
  }

  getAttribute(naam: string): string | null {
    return this.attributen.get(naam) ?? null;
  }

  appendChild(kind: NepElement): NepElement {
    if (kind.parentNode) {
      kind.parentNode.children = kind.parentNode.children.filter((x) => x !== kind);
    }
    kind.parentNode = this;
    this.children.push(kind);
    return kind;
  }

  prepend(kind: NepElement): NepElement {
    if (kind.parentNode) {
      kind.parentNode.children = kind.parentNode.children.filter((x) => x !== kind);
    }
    kind.parentNode = this;
    this.children.unshift(kind);
    return kind;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
      this.parentNode = null;
    }
  }

  private pastOpEenvoudig(deel: string): boolean {
    let rest = deel.trim();
    if (!rest) return false;
    if (rest.endsWith(':empty')) {
      if (this.children.length > 0 || (this.textContent || '').trim().length > 0) return false;
      rest = rest.slice(0, -':empty'.length);
    }
    for (const attrMatch of rest.matchAll(/\[([a-zA-Z0-9_-]+)="([^"]*)"\]/g)) {
      const attrNaam = attrMatch[1];
      const verwacht = attrMatch[2];
      const werkelijk = attrNaam.startsWith('data-')
        ? this.dataset[attrNaam.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())]
        : (this.attributen.get(attrNaam) ?? undefined);
      if (werkelijk !== verwacht) return false;
    }
    rest = rest.replace(/\[[^\]]+\]/g, '');
    const klassen = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    for (const kl of klassen) {
      if (!this.klassen.has(kl)) return false;
    }
    const tag = rest.replace(/\.[a-zA-Z0-9_-]+/g, '').trim();
    if (tag && tag !== '*' && this.tagName !== tag.toUpperCase()) return false;
    return true;
  }

  querySelector(selectorGroep: string): NepElement | null {
    const delen = selectorGroep.split(',').map((s) => s.trim()).filter(Boolean);
    const alleAfstammelingen = (wortel: NepElement): NepElement[] => {
      const uit: NepElement[] = [];
      for (const k of wortel.children) {
        uit.push(k, ...alleAfstammelingen(k));
      }
      return uit;
    };
    for (const sel of delen) {
      if (sel.startsWith(':scope >')) {
        const doel = sel.slice(':scope >'.length).trim();
        const gevonden = this.children.find((k) => k.pastOpEenvoudig(doel));
        if (gevonden) return gevonden;
      } else if (sel.includes('>')) {
        const [ouderSel, kindSel] = sel.split('>').map((x) => x.trim());
        for (const el of alleAfstammelingen(this)) {
          if (el.pastOpEenvoudig(ouderSel)) {
            const k = el.children.find((c) => c.pastOpEenvoudig(kindSel));
            if (k) return k;
          }
        }
      } else {
        const gevonden = alleAfstammelingen(this).find((k) => k.pastOpEenvoudig(sel));
        if (gevonden) return gevonden;
      }
    }
    return null;
  }

  querySelectorAll(sel: string): NepElement[] {
    const eerste = this.querySelector(sel);
    return eerste ? [eerste] : [];
  }
}

class NepDocument {
  lang = 'uk';
  cookie = '';
  prerendering = false;
  visibilityState = 'visible';
  documentElement: NepElement & { lang: string };
  head: NepElement;
  body: NepElement;
  private luisteraars = new Map<string, Array<(ev: unknown) => void>>();

  constructor(taal: 'uk' | 'nl' = 'uk') {
    const html = new NepElement('html', this) as NepElement & { lang: string };
    html.lang = taal;
    this.documentElement = html;
    this.head = new NepElement('head', this);
    this.body = new NepElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): NepElement {
    return new NepElement(tag, this);
  }

  getElementById(id: string): NepElement | null {
    const zoek = (el: NepElement): NepElement | null => {
      if (el.id === id) return el;
      for (const k of el.children) {
        const r = zoek(k);
        if (r) return r;
      }
      return null;
    };
    return zoek(this.documentElement);
  }

  querySelector(sel: string): NepElement | null {
    return this.documentElement.querySelector(sel);
  }

  querySelectorAll(): NepElement[] {
    return [];
  }

  addEventListener(soort: string, fn: (ev: unknown) => void) {
    this.luisteraars.set(soort, [...(this.luisteraars.get(soort) || []), fn]);
  }
}

export async function main(): Promise<number> {
  const basisDoc = new NepDocument('uk');
  const basisLoc = new URL('https://id.tarasevych.com/sessies');
  const basisWindow: Record<string, unknown> = {
    location: basisLoc,
    document: basisDoc,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    matchMedia: () => ({ matches: false }),
    addEventListener: () => undefined,
    dispatchEvent: () => true,
  };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), {
    window: basisWindow,
    location: basisLoc,
    document: basisDoc,
    addEventListener: () => undefined,
    Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL, encodeURIComponent, decodeURIComponent,
  });
  const oudBasisWin = globalThis.window;
  const oudBasisDoc = globalThis.document;
  const oudBasisLoc = globalThis.location;
  (globalThis as Record<string, unknown>).window = basisWindow;
  (globalThis as Record<string, unknown>).document = basisDoc;
  (globalThis as Record<string, unknown>).location = basisLoc;

  const {
    DIENST_LAAD_NAAM,
    installeerNavigatieSnel,
    laadKapselStaat,
    laadKapselTekst,
    paginaHeeftZichtbareInhoud,
    voortgangKlaar,
    voortgangStart,
    voortgangStaat,
  } = await import('../../src/navigatie-snel');

  try {
  const testen: Array<[string, () => Promise<void> | void]> = [
    ['1. Двомовні підписи розділів (uk / nl) повні та відповідають усім DIENST_IDS', () => {
      for (const id of DIENST_IDS) {
        const item = DIENST_LAAD_NAAM[id];
        assert.ok(item && item.uk && item.nl, `Відсутній двомовний підпис для служби ${id}`);
        assert.equal(laadKapselTekst(id, 'uk'), `Завантаження: ${item.uk}…`);
        assert.equal(laadKapselTekst(id, 'nl'), `Laden: ${item.nl}…`);
      }
      assert.equal(laadKapselTekst('', 'uk'), 'Завантаження сторінки…');
      assert.equal(laadKapselTekst('', 'nl'), 'Pagina laden…');
      assert.equal(laadKapselTekst('onbekend', 'uk'), 'Завантаження сторінки…');
      assert.equal(laadKapselTekst('onbekend', 'nl'), 'Pagina laden…');
      assert.equal(laadKapselTekst('identity', 'uk'), 'Завантаження: Налаштування…');
      assert.equal(laadKapselTekst('identity', 'nl'), 'Laden: Instellingen…');
      assert.equal(laadKapselTekst('crm', 'uk'), 'Завантаження: Клієнтські взаємини…');
      assert.equal(laadKapselTekst('crm', 'nl'), 'Laden: Klantrelatiebeheer…');
    }],

    ['2. index.html проходить externalizeInline (CSP без unsafe-inline) і має тотожні палітри й назви з navigatie-snel.ts', () => {
      const indexHtml = readFileSync('index.html', 'utf8');
      const uit = externalizeInline(indexHtml) as { html: string; files: Array<{ fileName: string; source: string }> };
      assert.equal(uit.files.length, 3);
      const bootCss = uit.files.find((f) => f.fileName === 'canonical-boot.css')?.source || '';
      const bootJs = uit.files.find((f) => f.fileName === 'canonical-boot.js')?.source || '';

      assert.ok(bootCss.includes('#tsv-laad-kapsel{position:fixed;top:calc(18px + env(safe-area-inset-top,0px))'));
      assert.ok(bootCss.includes('border-radius:999px'));
      assert.ok(bootCss.includes('pointer-events:none'));
      assert.ok(bootCss.includes('font-size:11px'));
      assert.ok(bootCss.includes('@media(max-width:700px){#tsv-laad-kapsel{top:calc(16px + env(safe-area-inset-top,0px))}}'));
      assert.ok(bootCss.includes('@media print{#tsv-voortgang,#tsv-laad-kapsel{display:none!important}}'));

      // Перевірка синтаксичної коректності зовнішнього стартового скрипта
      assert.doesNotThrow(() => new Function(bootJs));

      // Перевірка повної синхронності словників KL та NM у canonical-boot.js із shared/menu-model.ts та DIENST_LAAD_NAAM
      const klMatch = /KL=(\{[^}]+\})/.exec(bootJs);
      const nmMatch = /NM=(\{[^}]+\})/.exec(bootJs);
      assert.ok(klMatch && nmMatch, 'Словники KL та NM повинні бути присутні в canonical-boot.js');
      const kl = new Function(`return ${klMatch[1]}`)() as Record<string, [string, string]>;
      const nm = new Function(`return ${nmMatch[1]}`)() as Record<string, [string, string]>;
      for (const id of DIENST_IDS) {
        const accent = ACCENT_KLEUREN[DIENST_ACCENT[id]];
        assert.deepEqual(kl[id], [accent.licht.hoofd, accent.donker.hoofd], `Розбіжність кольорів для ${id}`);
        assert.deepEqual(nm[id], [DIENST_LAAD_NAAM[id].uk, DIENST_LAAD_NAAM[id].nl], `Розбіжність назв для ${id}`);
      }
    }],

    ['3. Стартовий скрипт canonical-boot створює #tsv-laad-kapsel та #tsv-voortgang і автоматично гасить їх після появи вмісту', () => {
      const indexHtml = readFileSync('index.html', 'utf8');
      const uit = externalizeInline(indexHtml) as { files: Array<{ fileName: string; source: string }> };
      const bootJs = uit.files.find((f) => f.fileName === 'canonical-boot.js')!.source;

      const doc = new NepDocument('nl');
      doc.documentElement.classList.add('theme-dark', 'palet-maquette');
      const bootShell = doc.createElement('div');
      bootShell.id = 'boot-shell';
      const rootEl = doc.createElement('div');
      rootEl.id = 'root';
      doc.body.appendChild(bootShell);
      doc.body.appendChild(rootEl);

      let waarnemerCb: (() => void) | null = null;
      let geplandRaf: (() => void) | null = null;
      class NepWaarnemer {
        constructor(cb: () => void) { waarnemerCb = cb; }
        observe() {}
        disconnect() { waarnemerCb = null; }
      }

      const venster: Record<string, unknown> = {
        __TSV_PRESENTATION__: { session: 'known', theme: 'dark', route: { service: 'identity', lang: 'nl' } },
        opener: null,
      };
      runInNewContext(bootJs, {
        window: venster,
        document: doc,
        location: { hostname: 'id.tarasevych.com', pathname: '/sessies', search: '' },
        localStorage: { getItem: () => null },
        MutationObserver: NepWaarnemer,
        requestAnimationFrame: (cb: () => void) => { geplandRaf = cb; return 1; },
        cancelAnimationFrame: () => { geplandRaf = null; },
        setTimeout: () => 1,
        URLSearchParams,
        Date,
        Number,
        String,
        JSON,
        Array,
        decodeURIComponent,
      });

      const kapsel = doc.getElementById('tsv-laad-kapsel');
      const balk = doc.getElementById('tsv-voortgang');
      assert.ok(kapsel, 'Стартова капсула повинна бути створена');
      assert.ok(balk, 'Стартова смужка повинна бути створена');
      assert.equal(kapsel.dataset.staat, 'bezig');
      assert.equal(kapsel.querySelector('span')?.textContent, 'Laden…');
      assert.equal(kapsel.getAttribute('aria-label'), 'Laden: Instellingen…');
      assert.equal(balk.dataset.staat, 'opstart');

      // Доки в .canonical-content стоїть порожній очікувач .ia-wacht — капсула лишається активною
      const chromeContent = doc.createElement('div');
      chromeContent.className = 'canonical-content';
      const wacht = doc.createElement('div');
      wacht.className = 'ia-account ia-wacht';
      chromeContent.appendChild(wacht);
      rootEl.appendChild(chromeContent);
      waarnemerCb?.();
      geplandRaf?.();
      assert.equal(kapsel.dataset.staat, 'bezig');

      // Щойно з'явився справжній вміст сторінки — капсула і стартова смужка переходять у "uit"
      wacht.remove();
      const echt = doc.createElement('section');
      echt.className = 'ia-account';
      echt.textContent = 'Sessies en apparaten';
      chromeContent.appendChild(echt);
      waarnemerCb?.();
      geplandRaf?.();
      assert.equal(kapsel.dataset.staat, 'uit');
      assert.equal(balk.dataset.staat, 'uit');
    }],

    ['4. paginaHeeftZichtbareInhoud точно відрізняє порожні скелети від готової сторінки', () => {
      const doc = new NepDocument('uk');
      const root = doc.createElement('div');
      root.id = 'root';
      doc.body.appendChild(root);

      assert.equal(paginaHeeftZichtbareInhoud(doc as unknown as Document), false, 'Порожній #root');

      const content = doc.createElement('div');
      content.className = 'canonical-content';
      root.appendChild(content);
      const startBalk = doc.createElement('nav');
      startBalk.className = 'menu-start';
      content.appendChild(startBalk);
      assert.equal(paginaHeeftZichtbareInhoud(doc as unknown as Document), false, 'Лише смуга ярликів без вмісту');

      for (const klas of [
        'canonical-signed-out mr-sign-in checking',
        'session-bootstrap-silent',
        'service-lazy-loading',
        'ia-account ia-wacht',
      ]) {
        const skelet = doc.createElement('section');
        skelet.className = klas;
        content.appendChild(skelet);
        assert.equal(paginaHeeftZichtbareInhoud(doc as unknown as Document), false, `Скелет "${klas}" має вважатися порожнім станом завантаження`);
        skelet.remove();
      }

      const aanmeldKaart = doc.createElement('section');
      aanmeldKaart.className = 'canonical-signed-out mr-sign-in';
      content.appendChild(aanmeldKaart);
      assert.equal(paginaHeeftZichtbareInhoud(doc as unknown as Document), true, 'Готова картка входу є видимим вмістом');
    }],

    ['5. navigatie-snel показує капсулу при навігації чи порожній сторінці, але не турбує на фонових запитах відкритої сторінки', async () => {
      const doc = new NepDocument('uk');
      const root = doc.createElement('div');
      root.id = 'root';
      doc.body.appendChild(root);

      const vensterLuisteraars = new Map<string, Array<(ev: unknown) => void>>();
      const nepWindow = {
        __TSV_CANONICAL_SERVICE__: basisWindow.__TSV_CANONICAL_SERVICE__,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        matchMedia: () => ({ matches: false }),
        addEventListener: (s: string, fn: (ev: unknown) => void) => {
          vensterLuisteraars.set(s, [...(vensterLuisteraars.get(s) || []), fn]);
        },
        dispatchEvent: () => true,
      };

      const oudDoc = globalThis.document;
      const oudWin = globalThis.window;
      const oudLoc = globalThis.location;
      const oudHtmlDiv = globalThis.HTMLDivElement;
      (globalThis as Record<string, unknown>).document = doc;
      (globalThis as Record<string, unknown>).window = nepWindow;
      (globalThis as Record<string, unknown>).location = new URL('https://id.tarasevych.com/sessies');
      (globalThis as Record<string, unknown>).HTMLDivElement = NepElement;

      try {
        installeerNavigatieSnel();

        // Порожня сторінка + запит: вмикаються і смужка, і капсула
        voortgangStart('identity', { direct: true, verzoekGestart: true });
        assert.equal(voortgangStaat(), 'bezig');
        assert.equal(laadKapselStaat(), 'bezig');
        assert.equal(doc.getElementById('tsv-laad-kapsel')?.querySelector('span')?.textContent, 'Завантаження…');
        assert.equal(doc.getElementById('tsv-laad-kapsel')?.getAttribute('aria-label'), 'Завантаження: Налаштування…');

        // Звичайний перший pageshow (persisted=false) НЕ гасить капсулу на порожній сторінці
        for (const fn of vensterLuisteraars.get('pageshow') || []) fn({ persisted: false });
        assert.equal(laadKapselStaat(), 'bezig');

        // Тепер наповнюємо .canonical-content видимим вмістом і завершуємо поточний крок
        const content = doc.createElement('div');
        content.className = 'canonical-content';
        const pagina = doc.createElement('section');
        pagina.className = 'ia-account';
        pagina.textContent = 'Сесії';
        content.appendChild(pagina);
        root.appendChild(content);
        voortgangKlaar();
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(laadKapselStaat(), 'uit');

        // Тихий фоновий запит на вже відкритій непорожній сторінці: смужка працює, капсула залишається вимкненою
        voortgangStart('identity', { direct: true, achtergrond: true, verzoekGestart: true });
        assert.equal(voortgangStaat(), 'bezig');
        assert.equal(laadKapselStaat(), 'uit');
        voortgangKlaar();

        // Звичайний API-запит на вже відкритій непорожній сторінці: смужка працює, капсула залишається вимкненою
        voortgangStart('identity', { direct: true, achtergrond: false, verzoekGestart: true });
        assert.equal(voortgangStaat(), 'bezig');
        assert.equal(laadKapselStaat(), 'uit');
        voortgangKlaar();

        // Явний перехід на інший розділ (навігація користувача): вмикається капсула цільового розділу!
        voortgangStart('mail', { extern: true, direct: true });
        assert.equal(laadKapselStaat(), 'bezig');
        assert.equal(doc.getElementById('tsv-laad-kapsel')?.querySelector('span')?.textContent, 'Завантаження…');
        assert.equal(doc.getElementById('tsv-laad-kapsel')?.getAttribute('aria-label'), 'Завантаження: Пошта…');

        // Повернення з bfcache (persisted=true) миттєво скидає обидва індикатори в "uit"
        for (const fn of vensterLuisteraars.get('pageshow') || []) fn({ persisted: true });
        assert.equal(laadKapselStaat(), 'uit');
        assert.equal(voortgangStaat(), 'uit');
      } finally {
        (globalThis as Record<string, unknown>).document = oudDoc;
        (globalThis as Record<string, unknown>).window = oudWin;
        (globalThis as Record<string, unknown>).location = oudLoc;
        (globalThis as Record<string, unknown>).HTMLDivElement = oudHtmlDiv;
      }
    }],

    ['6. Абсолютний мовний закон: відсутність заборонених символів у змінених і нових файлах', () => {
      const verbodenCyr = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
      for (const pad of [
        'index.html',
        'src/navigatie-snel.ts',
        'tests/eenheid/herstel-001-laad-kapsel.test.ts',
      ]) {
        const tekst = readFileSync(pad, 'utf8');
        assert.equal(verbodenCyr.test(tekst), false, `Знайдено заборонені символи у ${pad}`);
      }
    }],
  ];

  let geslaagd = 0;
  for (const [naam, fn] of testen) {
    await fn();
    geslaagd++;
    console.log(`  ok   ${naam}`);
  }
  console.log(`${geslaagd}/${testen.length} geslaagd (herstel-001-laad-kapsel)`);
  return 0;
  } finally {
    (globalThis as Record<string, unknown>).window = oudBasisWin;
    (globalThis as Record<string, unknown>).document = oudBasisDoc;
    (globalThis as Record<string, unknown>).location = oudBasisLoc;
  }
}
