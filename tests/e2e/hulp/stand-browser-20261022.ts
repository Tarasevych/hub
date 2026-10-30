// Стенд (22.10.2026, зона E) — «Браузер і агенти» (mcp.*/agents#browser). Кроки «browser-*»:
//   browser-agenten            — fase prive: обидва слоти (приватний відкрито на місяць, ШІ «Claude» працює зараз; технічний — «до
//                                відкликання» (рік), переживає активацію), матриця приватного слота (стовпчики «усі», Claude, ChatGPT…),
//                                «Що ще має бути дозволено» (режими сайту), «Останні відмови агентам» (EXTENSIE_CAP від Grok).
//   browser-agenten-waarschuwing — натиснуто «Дозволити все для розробки» → попередження з «Так, дозволити все» / «Скасувати».
//   browser-agenten-kolom      — телефон (≤ 560 px): матриця показує один стовпчик; у «Показати стовпчик» обрано Claude (на 1280 — уся таблиця).
//   browser-extensie-verwijzing — вкладка «Розширення браузера»: картка-перенаправлення на «Браузер і агенти».
//   browser-agenten-tech       — fase tech: технічний профіль активний → матриця технічного слота (глибока діагностика, скрипти).
// Усе в процесі стенду: браузерні агенти й розблокування — рядки в базі стенду, «з'єднання» розширення — пам'ять процесу
// (backend/extensie-ontgrendeling.ts bijVerbonden/bijStatus), як у юніт-тестах. Нічого з реального сервера не торкається.
type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech'; wachtOp?: string };
export type BrowserCtx = { mcpUrl: string; uid: () => string; zeg: (s: string) => void };

let gezaaid: Promise<void> | null = null;
function zaaien(uid: string, zeg: (s: string) => void): Promise<void> {
  gezaaid ??= (async () => {
    const { randomBytes } = await import('node:crypto');
    const store = await import('../../../backend/connectors-opslag');
    const cr = await import('../../../backend/connectors-crypto');
    const eo = await import('../../../backend/extensie-ontgrendeling');
    const matrix = await import('../../../backend/extensie-matrix');
    const { auditToevoegen } = await import('../../../server/platform/audit');
    const { getPool } = await import('../../../server/platform/pg');
    const { PRIVE_HOSTS } = await import('../../../shared/extensie-ontgrendeling');
    const sys = getPool('systeem');
    const pid = `standbrowser${Date.now()}`;
    const maak = async (ruimte: 'prive' | 'technisch') => {
      const tok = cr.randomToken(32);
      return store.createAgent(uid, 'Chrome · робочий ноутбук', 'browser', cr.sha256(tok), {}, undefined, { pairingId: pid, commandKeyEnc: cr.sealCommandKey(cr.newCommandKey(), uid, cr.sha256(tok)), version: '0.7.0', ruimte });
    };
    const P = await maak('prive'), T = await maak('technisch');
    const rij = async (agentId: string, ruimte: 'prive' | 'technisch', caps: string[], domeinen: readonly string[], interval: string, einde: string, overleeft: boolean) =>
      String((await sys.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, rollen, ruimte, einde_soort, overleeft_activatie, bevestigd_met)
        VALUES ($1, $2, $3, $4, $5, now() + $6::interval, $7, $8, $9, $10, $11) RETURNING id`,
        [agentId, uid, caps, [...domeinen], randomBytes(16).toString('base64url'), interval, ruimte === 'technisch' ? ['eigenaar'] : [], ruimte, einde, overleeft, ruimte === 'technisch' ? 'passkey' : 'passkey'])).rows[0].id);
    const gP = await rij(P.id, 'prive', ['browser.read', 'browser.navigate', 'browser.interact', 'browser.console'], PRIVE_HOSTS, '30 days', 'duur', false);
    const gT = await rij(T.id, 'technisch', ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'], ['admin.tarasevych.com', 'mcp.tarasevych.com'], '366 days', 'handmatig', true);
    // Як маршрут «Зберегти»: після запису матриці режими сайту йдуть за нею (modiVolgenMatrix) — тоді «Що ще має бути дозволено» чесне.
    await matrix.schrijfMatrix(uid, matrix.valideerInvoer({ ruimte: 'prive', rijen: [
      { agent: '*', caps: ['browser.read', 'browser.console'] },
      { agent: 'claude', caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.console'] },
      { agent: 'gpt', caps: ['browser.read'] },
    ] }), 'stand');
    await matrix.schrijfMatrix(uid, matrix.valideerInvoer({ ruimte: 'technisch', rijen: [
      { agent: '*', caps: ['browser.read', 'browser.console'] },
      { agent: 'claude', caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'] },
    ], instellingen: { devtoolsNamen: true } }), 'stand');
    zeg(`   browser-stand: режими сайту за матрицею — ${await matrix.modiVolgenMatrix(uid, await matrix.leesMatrix(uid))} змін`);
    // «з'єднання» розширення (пам'ять процесу): обидва слоти онлайн, приватний — ШІ «Claude» працює зараз
    eo.bijVerbonden(P.id, uid, 'browser', '0.7.0'); eo.bijVerbonden(T.id, uid, 'browser', '0.7.0');
    const nu = Date.now();
    eo.bijStatus(P.id, { staat: 'agent', gid: gP, exp: nu + 30 * 86_400_000, lokaal: false, lokaalVerbonden: false, version: '0.7.0', profielTab: 'gebruiker' });
    eo.bijStatus(T.id, { staat: 'ontgrendeld', gid: gT, exp: nu + 366 * 86_400_000, lokaal: false, lokaalVerbonden: false, version: '0.7.0', profielTab: 'technisch' });
    eo.aiActiviteit(P.id, uid, 'Claude');
    // дві відмови з журналу (так їх пише connector v2: details.fout = код)
    await auditToevoegen({ ownerId: uid, actorId: uid, action: 'owner.mcp.tool', type: 'ai', result: 'denied', details: { tool: 'browser_open', v2: 'openen_pagina_grok_mcp_tarasevych_com_gebruiker', agent: 'grok', client: 'Grok', fout: 'EXTENSIE_AGENT' } });
    await auditToevoegen({ ownerId: uid, actorId: uid, action: 'owner.mcp.tool', type: 'ai', result: 'failure', details: { tool: 'browser_open', v2: 'openen_pagina_gpt_mcp_tarasevych_com_gebruiker', agent: 'gpt', client: 'ChatGPT', fout: 'EXTENSIE_CAP' } });
    zeg(`   browser-stand: privé ${P.id.slice(0, 8)} (gid ${gP.slice(0, 8)}), technisch ${T.id.slice(0, 8)} (gid ${gT.slice(0, 8)})`);
  })();
  return gezaaid;
}

export function browserStappen(c: BrowserCtx): Stap[] {
  const url = `${c.mcpUrl}/agents#browser`;
  const voor = async () => zaaien(c.uid(), c.zeg);
  // Echte maten van alle bedieningselementen (zonder wegknippen door de scrollcontainer van de pagina): < 44 px = echt te klein.
  const maten = async (p: Page, naam: string) => {
    const m = await p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-tab-inhoud="browser"] :is(button, select, a[href], summary, input:not([type=checkbox]):not([type=radio]))')]
      .filter((e) => e.offsetParent !== null && !e.closest('details:not([open]) > :not(summary)'))
      .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), inline: e.matches('a') && getComputedStyle(e).display === 'inline' }; })
      .filter((x) => !x.inline && (x.h < 44 || x.w < 44)));
    const breed = await p.evaluate(() => { const w = document.querySelector('[data-tab-inhoud="browser"]'); return w ? [...w.querySelectorAll<HTMLElement>('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 2).map((e) => `${e.className} ${e.scrollWidth}>${e.clientWidth}`) : []; });
    c.zeg(`   ${naam} ${p.viewportSize()?.width}: bedieningselementen < 44 px: ${m.length ? JSON.stringify(m) : 'geen'}; horizontaal scrollend: ${breed.length ? breed.join(', ') : 'niets'}`);
  };
  const wacht = async (p: Page) => { await p.locator('[data-bea-matrix]').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(600); await maten(p, 'browser'); };
  return [
    { naam: 'browser-agenten', url, voor, na: wacht, fase: 'prive' },
    {
      naam: 'browser-agenten-waarschuwing', url, voor, fase: 'prive',
      na: async (p) => { await wacht(p); await p.locator('[data-bea-snel="alles"]').first().click({ timeout: 5000 }); await p.locator('[data-bea-waarschuwing="alles"]').first().waitFor({ timeout: 5000 }); await p.waitForTimeout(300); },
    },
    {
      naam: 'browser-agenten-kolom', url, voor, fase: 'prive',
      na: async (p) => {
        await wacht(p);
        if ((p.viewportSize()?.width || 1280) > 560) return;
        await p.locator('[data-bea-kolomkeuze]').first().selectOption('claude', { timeout: 5000 });
        await p.locator('[data-bea-tabel] th.is-gekozen[data-bea-agent="claude"]').first().waitFor({ timeout: 5000 });
        await p.locator('[data-bea-tabel]').first().scrollIntoViewIfNeeded().catch(() => undefined);
        await p.waitForTimeout(300); await maten(p, 'browser-kolom');
      },
    },
    { naam: 'browser-extensie-verwijzing', url: `${c.mcpUrl}/agents#extensie`, voor, fase: 'prive', na: async (p) => { await p.locator('[data-ext-naar-browser]').first().waitFor({ timeout: 20000 }); } },
    {
      naam: 'browser-agenten-tech', url, voor, fase: 'tech',
      na: async (p) => { await wacht(p); await p.locator('[data-bea-slotkeuze="technisch"]').first().click({ timeout: 5000 }); await p.locator('[data-bea-matrix="technisch"]').first().waitFor({ timeout: 5000 }); await p.waitForTimeout(500); },
    },
  ];
}
