// Stand (21.10.2026, агент C): змодельована пошта для знімків списку листів, меню «Інші дії» (⋮) і перемикача скриньок.
// Список листів у «Мій простір» приходить наживо з Gmail API (POST /api/owner/mail/google-suite/messages → api(token,'/messages')),
// тож самі рядки mail_items_v1/mail_accounts_v1 у базі списку не дають (потрібні principal + grant + Gmail). Тому — як у
// tests/e2e/mail-lijst-ux.e2e.ts — відповіді поштових маршрутів підставляються в браузері (page.route), лише для кроків «mail-agc-*».
// Нічого не йде назовні: фото акаунтів і мініатюри вкладень — data:/base64 PNG, згенеровані тут.
import { deflateSync } from 'node:zlib';

type Page = import('playwright-core').Page;

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
/** PNG w×h (RGB) з функції кольору. */
export function png(w: number, h: number, kleur: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = kleur(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Фото акаунта: НЕ квадратне (160×120) — коло в ньому видно як коло лише з object-fit:cover і рівними сторонами бокса.
const foto = (r: number, g: number, b: number) => `data:image/png;base64,${png(160, 120, (x, y) => { const d = Math.hypot(x - 80, y - 60); return d < 40 ? [255, 255, 255] : d < 46 ? [20, 20, 20] : [r, g - Math.floor(y / 2), b]; }).toString('base64')}`;
const FOTO_1 = foto(220, 120, 60), FOTO_2 = foto(60, 140, 210);
const MINI = png(240, 160, (x, y) => [Math.floor(x / 240 * 255), Math.floor(y / 160 * 255), 140]);

const ACCOUNTS = [
  { id: 'agc-acc-1', principalId: 'agc-acc-1', email: 'pavlo.tarasevych.stand@example.test', displayName: 'Eigenaar Test', picture: FOTO_1, accountRole: 'primary', status: 'connected' },
  { id: 'agc-acc-2', principalId: 'agc-acc-2', email: 'robota-dlya-dovgykh-adres@example.test', displayName: 'Робоча скринька з дуже довгою назвою', picture: FOTO_2, accountRole: 'additional', status: 'connected' },
];
const VIDPRAVNYKY = [
  'Anastasia Arkhypenko-Vasylenko <anastasia-arkhypenko@notifications.example.test>',
  'Нова пошта <noreply@novaposhta.example.test>',
  'GitHub <notifications@github.example.test>',
  'Олександра Костянтинівна Шевченко-Григоренко <oleksandra.shevchenko-hryhorenko@universiteit.example.test>',
  'Bank <no-reply@bank.example.test>',
  'Марія <maria@example.test>',
  'Belastingdienst Nederland — Automatische berichten <automatische-berichten@belastingdienst.example.test>',
  'Coursera <no-reply@t.mail.coursera.example.test>',
  'Іван Петренко <ivan.petrenko@example.test>',
  'Google <no-reply@accounts.google.example.test>',
  'LinkedIn <messages-noreply@linkedin.example.test>',
  'Укрзалізниця <tickets@uz.example.test>',
  'Dropbox <no-reply@dropbox.example.test>',
  'Тетяна <tetiana@example.test>',
  'Stripe <receipts+acct_1234567890@stripe.example.test>',
  'Prozorro <info@prozorro.example.test>',
  'Booking.com <customer.service@mailer.booking.example.test>',
  'Андрій Миколайович <a.mykolaiovych@example.test>',
];

export function mailBerichten() {
  const nu = Date.now();
  return VIDPRAVNYKY.map((from, i) => ({
    id: `agc-m${i}`, threadId: `agc-t${i}`, from, to: ACCOUNTS[0].email,
    subject: i % 4 === 1 ? `Тема листа ${i}: дуже довга назва, яка точно не вміститься в один рядок на телефоні шириною 390 пікселів` : `Лист ${i} — коротка тема`,
    snippet: `Короткий зміст листа ${i}. Тут кілька речень тексту, щоб рядок мав уривок. `.repeat(2),
    receivedAt: nu - i * 3_600_000 * (i > 8 ? 9 : 1), labelIds: ['INBOX', ...(i % 3 === 0 ? ['UNREAD'] : [])], unread: i % 3 === 0, starred: i === 2,
    sizeBytes: 4000 + i * 100, unsubscribe: i % 5 === 2 ? { available: true, mode: 'http', oneClick: true } : null, classificationSignals: {},
  }));
}
const bijlagenVan = (id: string) => {
  const i = Number(id.replace('agc-m', ''));
  if (i % 2 !== 0) return [];
  const rij = [{ providerAttachmentId: `${id}-a1`, filename: `foto-${i}.png`, contentType: 'image/png', mimeType: 'image/png', sizeBytes: MINI.length }];
  if (i % 4 === 0) rij.push({ providerAttachmentId: `${id}-a2`, filename: `rahunok-${i}-z-dovgoyu-nazvoyu.pdf`, contentType: 'application/pdf', mimeType: 'application/pdf', sizeBytes: 123456 });
  return rij;
};

let aanraak: import('playwright-core').CDPSession | null = null;
/** Телефон (≤ 500 px): дотик як на справжньому телефоні — (pointer:coarse)/(hover:none), тож «око» перегляду видно завжди (36 px). */
async function aanraking(page: Page, aan: boolean) {
  if (aan) { aanraak ??= await page.context().newCDPSession(page); await aanraak.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await aanraak.send('Emulation.setEmitTouchEventsForMouse', { enabled: false }); }
  else if (aanraak) { await aanraak.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => undefined); }
}
/** Знімає підстановки й емуляцію дотику після кроку. */
export async function mailNepUit(page: Page) { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await aanraking(page, false); }
/** Підставляє відповіді поштових маршрутів у цій вкладці (знімається mailNepUit після кроку). */
export async function mailNep(page: Page, opties: { dichtheid?: 'minimum' | 'normal' | 'detailed' | 'bulky'; eigenLabels?: Array<{ id: string; name: string; type: 'user'; messagesTotal: number; messagesUnread: number; color?: { textColor: string; backgroundColor: string } }> } = {}) {
  await aanraking(page, (page.viewportSize()?.width || 1280) <= 500);
  if (opties.dichtheid) { const d = opties.dichtheid; await page.route('**/api/owner/mail/view-preferences/load', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, preferences: { density: d, mobileOverrides: { density: d } } }) })); await page.route('**/api/owner/mail/view-preferences/save', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })); }
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const berichten = mailBerichten();
  const snapshot = { provider: 'google_gmail', connectEnabled: true, activeAccountId: ACCOUNTS[0].id, account: ACCOUNTS[0], accounts: ACCOUNTS };
  const labels = [
    { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: berichten.length, messagesUnread: berichten.filter((b) => b.unread).length },
    { id: 'STARRED', name: 'STARRED', type: 'system', messagesTotal: 1, messagesUnread: 0 },
    { id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 0, messagesUnread: 0 },
    { id: 'DRAFT', name: 'DRAFT', type: 'system', messagesTotal: 0, messagesUnread: 0 },
    { id: 'SPAM', name: 'SPAM', type: 'system', messagesTotal: 0, messagesUnread: 0 },
    { id: 'TRASH', name: 'TRASH', type: 'system', messagesTotal: 0, messagesUnread: 0 },
    ...(opties.eigenLabels || []), // pakket 2: eigen labels alleen voor de leesvenster-stand (onder het onderwerp)
  ];
  const body = (r: { request: () => { postData: () => string | null } }) => { try { return JSON.parse(r.request().postData() || '{}') as Record<string, unknown>; } catch { return {}; } };
  await page.route('**/api/owner/mail/google-suite/accounts', (r) => r.fulfill(json(snapshot)));
  await page.route('**/api/owner/mail/google-suite/account', (r) => r.fulfill(json({ ok: true, ...snapshot })));
  await page.route('**/api/owner/mail/google-suite/labels', (r) => r.fulfill(json({ source: 'live_on_demand', persisted: false, account: ACCOUNTS[0], labels, activity: {}, snapshot })));
  await page.route('**/api/owner/mail/google-suite/messages', (r) => { const b = body(r); const lbl = String(b.labelId || 'INBOX'); const lijst = lbl === 'INBOX' || lbl === '' ? berichten : lbl === 'STARRED' ? berichten.filter((x) => x.starred) : []; return r.fulfill(json({ source: 'live_on_demand', persisted: false, account: ACCOUNTS[0], labelId: lbl, query: '', maxResults: 25, messages: lijst, nextPageToken: '', resultSizeEstimate: lijst.length, observedAt: Date.now() })); });
  await page.route('**/api/owner/mail/google-suite/attachments/metadata', (r) => { const ids = (body(r).messageIds as string[]) || []; return r.fulfill(json({ source: 'live_on_demand', persisted: false, accountId: ACCOUNTS[0].id, attachmentsByMessage: Object.fromEntries(ids.map((id) => [id, bijlagenVan(id)])), metadataStatusByMessage: Object.fromEntries(ids.map((id) => [id, 'verified'])) })); });
  // Відправники: «не перевірено» (адреса + помаранчевий щит поруч з ім'ям — як на знімку власника), перевірений, підозрілий.
  await page.route('**/api/owner/mail/afzenders/status', (r) => { const items = ((body(r).items as Array<{ from: string }>) || []).map(({ from }, i) => { const m = /<([^>]+)>/.exec(from || ''); const adres = (m ? m[1] : from || '').toLowerCase(); const naam = (from || '').replace(/<[^>]+>/, '').trim(); const domein = adres.split('@')[1] || ''; const status = /github|google/.test(adres) ? 'geverifieerd' : /bank/.test(adres) ? 'verdacht' : (i % 4 === 3 ? 'geverifieerd' : 'onbekend'); return { adres, naam, domein, status, bron: status === 'geverifieerd' ? 'bekende-dienst' : null, reden: '', merk: '', opgeslagen: false }; }); return r.fulfill(json({ items, markeringen: true })); });
  await page.route('**/api/owner/mail/google-suite/attachment', (r) => { const b = body(r); const ct = String(b.contentType || 'image/png'); const data = ct.startsWith('image/') ? MINI : Buffer.from('%PDF-1.4\n% stand\n'); return r.fulfill(json({ source: 'live_on_demand_chunk', persisted: false, accountId: ACCOUNTS[0].id, messageId: b.messageId, attachmentId: b.attachmentId, filename: b.filename, contentType: ct, sizeBytes: data.length, totalBytes: data.length, offset: 0, nextOffset: data.length, done: true, data: data.toString('base64url') })); });
}

/** Чекає, поки рядки змодельованої пошти з'являться. */
export async function wachtOpLijst(page: Page) {
  await page.locator('.google-mail-row').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
}

/** Геометрія списку: ім'я vs адреса, маркер непрочитаного vs ⋮, кнопки швидких дій (текст у межах). */
export async function meetLijst(page: Page) {
  return page.evaluate(() => {
    const rijen = [...document.querySelectorAll('.google-mail-row')].slice(0, 8);
    const box = (e: Element | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width < 1 ? null : { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const over = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0;
    return rijen.map((rij) => {
      const naam = rij.querySelector('.mail-row-sender-copy > strong, .mail-minimum-sender > strong');
      const adres = rij.querySelector('.mail-row-sender-copy .afz-adres, .mail-row-sender-copy > small, .mail-minimum-sender .afz-adres, .mail-minimum-sender > small');
      const punt = rij.querySelector(':scope > .mail-row-unread-dot');
      const meer = rij.querySelector('.mail-row-actions-more');
      const knoppen = [...rij.querySelectorAll('.mail-row-hover-actions > button')].filter((k) => (k as HTMLElement).offsetWidth > 0).map((k) => ({ w: Math.round(k.getBoundingClientRect().width), sw: (k as HTMLElement).scrollWidth, cw: (k as HTMLElement).clientWidth }));
      const n = naam as HTMLElement | null, a = adres as HTMLElement | null;
      rij.classList.add('mail-row-swipe-open');
      const veeg = [...rij.querySelectorAll('.mail-row-swipe-actions button')].map((k) => { const sp = k.querySelector('span') as HTMLElement | null; const kr = k.getBoundingClientRect(); const sr = sp?.getBoundingClientRect(); return { tekst: sp?.textContent || '', knop: Math.round(kr.width), tekstBreed: sp ? sp.scrollWidth : 0, binnen: !!sr && sr.left >= kr.left - 0.5 && sr.right <= kr.right + 0.5 && sp!.scrollWidth <= Math.ceil(sr.width) + 1 }; });
      rij.classList.remove('mail-row-swipe-open');
      return {
        naam: n ? { tekst: n.textContent?.trim().slice(0, 40), zichtbaar: n.clientWidth, nodig: n.scrollWidth } : null,
        adres: a ? { tekst: a.textContent?.trim().slice(0, 40), zichtbaar: a.clientWidth, nodig: a.scrollWidth, zelfdeRegel: !!n && Math.abs(a.getBoundingClientRect().top - n.getBoundingClientRect().top) < 8 } : null,
        puntOverMeer: innerWidth <= 720 && over(box(punt), box(meer)), punt: box(punt), meer: box(meer), knoppen, veeg,
      };
    });
  });
}

/** Відкриває ⋮ першого листа й перевіряє: кожен пункт меню — верхній елемент у своєму центрі; меню в межах екрана; однакова висота пунктів; текст не обрізано. */
export async function meetMenu(page: Page) {
  const rij = page.locator('.google-mail-row').first();
  await rij.hover().catch(() => undefined);
  await page.waitForTimeout(250);
  await rij.locator('.mail-row-actions-more').first().click({ timeout: 5000 });
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const pop = document.querySelector('.mail-row-action-popover');
    if (!pop) return { fout: 'geen popover' };
    const pr = pop.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const items = [...pop.querySelectorAll('[role=menuitem]')] as HTMLElement[];
    const res = items.map((it) => {
      it.scrollIntoView({ block: 'nearest' });
      const r = it.getBoundingClientRect();
      const zichtbaarInPop = r.top >= pop.getBoundingClientRect().top - 1 && r.bottom <= pop.getBoundingClientRect().bottom + 1;
      // drie punten (links, midden, rechts — rechts ligt boven de «⋮» van de volgende rijen)
      const punten = [r.left + 12, r.left + r.width / 2, r.right - 12].map((x) => document.elementFromPoint(x, r.top + r.height / 2));
      const mis = punten.find((top) => !top || !(top === it || it.contains(top)));
      const tekst = it.querySelector('span:last-child') as HTMLElement | null;
      const ics = getComputedStyle(it);
      return { label: (it.textContent || '').trim().slice(0, 40), css: `minH=${ics.minHeight} h=${ics.height} fs=${ics.fontSize} pad=${ics.paddingTop}`, h: Math.round(r.height), w: Math.round(r.width), zichtbaarInPop, raak: !mis, boven: mis ? `${mis.tagName.toLowerCase()}.${String((mis as HTMLElement).className || '').split(' ').slice(0, 2).join('.')} ${mis.closest('.google-mail-row') && !pop.contains(mis) ? '(ІНШИЙ РЯДОК!)' : ''}` : '', tekstAf: tekst ? tekst.scrollWidth > tekst.clientWidth + 1 : false };
    });
    return { pop: { l: Math.round(pr.left), r: Math.round(pr.right), t: Math.round(pr.top), b: Math.round(pr.bottom), w: Math.round(pr.width) }, binnen: pr.left >= 0 && pr.right <= vw && pr.top >= 0 && pr.bottom <= vh, ouder: pop.parentElement === document.body ? 'body (portaal)' : pop.parentElement?.className, items: res };
  });
}

/** Відкриває «Поштові скриньки» (аватар у шапці на телефоні; перемикач у панелі на комп'ютері) і міряє всі аватари: ширина = висота. */
export async function meetPostvakken(page: Page) {
  const badge = page.locator('.mail-account-badge-trigger').first();
  if (await badge.isVisible().catch(() => false)) await badge.click({ timeout: 5000 });
  else { const sw = page.locator('.mail-account-switcher-trigger').first(); if (await sw.isVisible().catch(() => false)) await sw.click({ timeout: 5000 }); }
  await page.waitForTimeout(700);
  const delen = await page.evaluate(() => [...document.querySelectorAll('.mail-account-badge-menu, .mail-account-badge-menu > *, .mail-account-badge-menu footer button, .mail-account-badge-list > button')].map((e) => { const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className || '')} h=${Math.round(e.getBoundingClientRect().height)} minH=${cs.minHeight} fs=${cs.fontSize} pad=${cs.padding}`; }));
  console.log('   delen postvakken: ' + JSON.stringify(delen));
  return page.evaluate(() => [...document.querySelectorAll('.mail-account-badge img, .mail-account-switcher img, .canonical-avatar-trigger img, .mail-account-badge-photo, .mail-account-badge-initial')].map((e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    const pc = e.parentElement ? getComputedStyle(e.parentElement) : null;
    const regels: string[] = [];
    if (e.closest('[role=menu]') && (window as unknown as { __agcRegels?: boolean }).__agcRegels !== false) {
      const loop = (rules: CSSRuleList) => { for (const ru of [...rules]) { if (ru instanceof CSSStyleRule) { try { if (e.matches(ru.selectorText) && /min-height|max-width|width|display|flex/.test(ru.style.cssText)) regels.push(`${ru.selectorText.slice(0, 160)} {${ru.style.cssText.slice(0, 160)}}`); } catch { /* */ } } else if ('cssRules' in ru && (ru as CSSGroupingRule).cssRules) { const m = (ru as CSSMediaRule).media; if (!m || matchMedia(m.mediaText).matches) loop((ru as CSSGroupingRule).cssRules); } } };
      for (const sh of [...document.styleSheets]) { try { loop(sh.cssRules); } catch { /* */ } }
    }
    return { el: `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className || '').split(' ').join('.')} in ${e.closest('[role=menu]') ? 'menu' : 'kop'}`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, fit: cs.objectFit, rond: cs.borderRadius, css: `w=${cs.width} h=${cs.height} minW=${cs.minWidth} maxW=${cs.maxWidth} minH=${cs.minHeight} maxH=${cs.maxHeight} flex=${cs.flex} ar=${cs.aspectRatio} disp=${cs.display} ouder=${pc ? `${pc.display}/${pc.justifyItems}/${pc.alignItems}/${pc.gridTemplateColumns}` : ''}`, regels };
  }).filter((x) => x.w > 0));
}
