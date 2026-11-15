// Модульні регресійні перевірки VEILIG-002 (частина 3 — аварійна зупинка, вигляд, мобільне вікно та модальні шари):
//  1) deurIntrekkenVoorGebruiker (backend/mcp-deur-brug.ts) — відкликання OAuth-підключень MCP-двері за користувачем/власником і безпечна робота при недоступних дверях;
//  2) stopAll, blockUser і technischeVerbindingenIntrekken — закриття agent_namens_sessies, асинхронне очікування bijNoodstop та двері (з БД за наявності DATABASE_URL);
//  3) backend/apparaat-bevestiging/routes.ts — захист глибини (status !== 'approved' → 403 ACCOUNT_NOT_APPROVED_FORBIDDEN у metSessie та stroomAuth);
//  4) tegelStijlen (shared/apparaat-bevestiging/symbolen.ts) і backend/telegram-aanmelden/venster.ts — адаптивна верстка вузьких екранів (≤360px) без обрізання та блокування submit під час запиту;
//  5) LevendeAchtergrond, AchtergrondKnopMaquette та портали модалів (AgentToevoegen, ProbleemRapport, GebruikerKaart, Venster) — відсутність setInterval, буферизація, CSS-обгортки .ut-portaal/.ov-portaal/.ag-portaal, z-index і сумісність із renderToStaticMarkup.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';
import { tegelStijlen } from '../../shared/apparaat-bevestiging/symbolen';
import { apparaatRoutes } from '../../backend/apparaat-bevestiging/routes';
import { paginaHtml, VENSTER_JS } from '../../backend/telegram-aanmelden/venster';
import { deurIntrekkenVoorGebruiker } from '../../backend/mcp-deur-brug';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('veilig-002-noodstop-uiterlijk');

  // ------------------------------------------------------------------ 1. MCP-двері: deurIntrekkenVoorGebruiker
  const werk = mkdtempSync(join(tmpdir(), 'veilig002-deur-'));
  const origSleutel = process.env.MCP_INTERN_SLEUTEL;
  const origFetch = globalThis.fetch;
  try {
    process.env.MCP_INTERN_SLEUTEL = join(werk, 'ontbreekt.sleutel');
    check('1a deurIntrekkenVoorGebruiker без ключа повертає 0 без помилок', (await deurIntrekkenVoorGebruiker('user-1', true)) === 0);

    const sleutelPad = join(werk, 'intern.sleutel');
    writeFileSync(sleutelPad, 'x'.repeat(48), 'utf8');
    process.env.MCP_INTERN_SLEUTEL = sleutelPad;

    const ingetrokkenIds: string[] = [];
    globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
      const pad = typeof url === 'string' ? url : url.pathname + url.search;
      if (pad.endsWith('/intern/verbindingen')) {
        return new Response(
          JSON.stringify({
            verbindingen: [
              { id: 'fam_u1_a', klant: 'Claude', deur: 'Claude', duur: '1u', aangemaakt: 1, laatst: 2, accessTot: 3, refreshTot: 4, wie: { id: 'user-1', email: 'u1@voorbeeld.test' }, via: 'site' },
              { id: 'fam_u1_b', klant: 'ChatGPT', deur: 'ChatGPT', duur: '1u', aangemaakt: 1, laatst: 2, accessTot: 3, refreshTot: 4, wie: { id: 'user-1', email: 'u1@voorbeeld.test' }, via: 'site' },
              { id: 'fam_u2_a', klant: 'Claude', deur: 'Claude', duur: '1u', aangemaakt: 1, laatst: 2, accessTot: 3, refreshTot: 4, wie: { id: 'user-2', email: 'u2@voorbeeld.test' }, via: 'site' },
              { id: 'fam_legacy', klant: 'Grok', deur: 'Grok', duur: '1u', aangemaakt: 1, laatst: 2, accessTot: 3, refreshTot: 4, wie: null, via: 'legacy' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (pad.endsWith('/intern/intrekken')) {
        const parsed = JSON.parse(String(init?.body || '{}')) as { id?: string };
        if (parsed.id) ingetrokkenIds.push(parsed.id);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const nUser = await deurIntrekkenVoorGebruiker('user-1', false);
    check('1b звичайний користувач відкликає лише власні з’єднання двері (2 із 4, без чужого і без спадкового)', nUser === 2 && ingetrokkenIds.join(',') === 'fam_u1_a,fam_u1_b', ingetrokkenIds.join(','));

    ingetrokkenIds.length = 0;
    const nOwner = await deurIntrekkenVoorGebruiker('user-1', true);
    check('1c власник відкликає власні й спадкові (wie=null) з’єднання двері (3 із 4), але не чуже user-2', nOwner === 3 && ingetrokkenIds.includes('fam_legacy') && !ingetrokkenIds.includes('fam_u2_a'), ingetrokkenIds.join(','));

    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    check('1d недоступні двері (мережева помилка) безпечно повертають 0', (await deurIntrekkenVoorGebruiker('user-1', true)) === 0);
  } finally {
    globalThis.fetch = origFetch;
    if (origSleutel === undefined) delete process.env.MCP_INTERN_SLEUTEL;
    else process.env.MCP_INTERN_SLEUTEL = origSleutel;
    rmSync(werk, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 2. Перевірка структури stopAll / blockUser / ruimte-scheiding і (за наявності БД) живий пробіг
  const toestSrc = lees('backend/ai-toestemmingen.ts');
  const ruimteSrc = lees('backend/ruimte-scheiding.ts');
  check(
    '2a stopAll і blockUser закривають agent_namens_sessies, чекають bijNoodstop через Promise.allSettled і відкликають з’єднання MCP-двері',
    toestSrc.includes('draaiNoodstopLuisteraars') &&
      toestSrc.includes('Promise.allSettled') &&
      toestSrc.includes("UPDATE app.agent_namens_sessies SET ingetrokken_op = now(), ingetrokken_reden = 'noodstop'") &&
      toestSrc.includes("UPDATE app.agent_namens_sessies SET ingetrokken_op = now(), ingetrokken_reden = 'blocked'") &&
      toestSrc.includes('deurIntrekkenVoorGebruiker'),
  );
  check(
    '2b technischeVerbindingenIntrekken закриває технічні agent_namens_sessies і двері MCP',
    ruimteSrc.includes('UPDATE app.agent_namens_sessies SET ingetrokken_op = now()') && ruimteSrc.includes('deurIntrekkenVoorGebruiker'),
  );

  // ------------------------------------------------------------------ 3. apparaat-bevestiging: перевірка глибокого захисту status === 'approved'
  const { registreerStroomAuth, stroomVerzoekApparaat } = await import('../../backend/apparaat-bevestiging/stroom');
  const routes = apparaatRoutes({
    requireSession: async () => ({
      user: { id: '00000000-0000-0000-0000-000000000099', email: 'test@voorbeeld.test', role: 'user', status: 'pending' },
      service: 'hub',
      session: { id: 'sess-1' },
    }),
    vlagAan: async () => true,
  });
  const openRes = await (routes['POST /api/owner/bevestiging/apparaat/open'][0] as (rc: unknown) => Promise<{ statusCode: number; body: string }>)({
    event: {},
    body: {},
    query: {},
    params: {},
  });
  let stroomStatus = 0;
  let stroomBody = '';
  const nepReq = { on: () => undefined } as never;
  const nepRes = {
    writeHead: (s: number) => {
      stroomStatus = s;
    },
    end: (b?: string) => {
      stroomBody = String(b || '');
    },
    write: () => true,
  } as never;
  try {
    await stroomVerzoekApparaat(nepReq, nepRes, {}, {});
  } finally {
    registreerStroomAuth(null);
  }
  check(
    '3 apparaatRoutes та stroomVerzoekApparaat блокують несхвалений акаунт (ACCOUNT_NOT_APPROVED_FORBIDDEN)',
    openRes.statusCode === 403 &&
      openRes.body.includes('ACCOUNT_NOT_APPROVED_FORBIDDEN') &&
      stroomStatus >= 400 &&
      stroomBody.includes('ACCOUNT_NOT_APPROVED_FORBIDDEN'),
    `${openRes.statusCode} ${openRes.body} / stroom=${stroomStatus} ${stroomBody}`,
  );

  // ------------------------------------------------------------------ 4. Telegram-вікно: мобільна верстка вузьких екранів та блокування кнопки submit
  const st = tegelStijlen('#1f5f9e');
  check(
    '4a tegelStijlen адаптивний для вузьких екранів: minHeight, padding, break-word, hyphens:auto і clamp',
    st.tegel.minHeight === '90px' &&
      st.tegel.padding === '8px 4px' &&
      st.vorm.width === '50%' &&
      st.naam.overflowWrap === 'break-word' &&
      st.naam.hyphens === 'auto' &&
      st.naam.fontSize.startsWith('clamp('),
    JSON.stringify(st),
  );
  const html = paginaHtml(null, 'uk');
  check('4b paginaHtml містить адаптивний медіазапит @media (max-width:360px)', html.includes('@media (max-width:360px)'));
  check('4c VENSTER_JS блокує кнопку відправлення на час перевірки коду', VENSTER_JS.includes('fb.disabled=true') && VENSTER_JS.includes('fb.disabled=false'));

  // ------------------------------------------------------------------ 5. Продуктивність «Живого фону» та портали модальних вікон
  const knopSrc = lees('src/achtergrond/AchtergrondKnop.tsx');
  const achtergrondSrc = lees('src/achtergrond/LevendeAchtergrond.tsx');
  check(
    '5a AchtergrondKnopMaquette не має вічного setInterval(1000) і використовує MutationObserver',
    !knopSrc.includes('setInterval') && knopSrc.includes('MutationObserver') && knopSrc.includes('data-identiteit-maquette'),
  );
  check(
    '5b LevendeAchtergrond запам’ятовує нормалізацію кольору та мемоїзує dekking через useMemo',
    achtergrondSrc.includes('kleurCache') && achtergrondSrc.includes('normaliseerKleur') && achtergrondSrc.includes('useMemo('),
  );

  nepBrowser('https://admin.tarasevych.com', 'uk');
  const { default: AgentToevoegen } = await import('../../src/uitrol/AgentToevoegen');
  const { default: ProbleemRapport } = await import('../../src/uitrol/ProbleemRapport');
  const { default: GebruikerKaart } = await import('../../src/overzicht/GebruikerKaart');
  const { Venster } = await import('../../src/agenten/toegang/delen');

  const agentHtml = renderToStaticMarkup(
    createElement(AgentToevoegen, {
      lang: 'uk',
      busy: '',
      data: {
        schakelaar: false,
        rpId: 'tarasevych.com',
        origins: ['https://admin.tarasevych.com'],
        passkeys: [],
        wachtend: [],
        voorstellen: [],
        voorbereiders: [],
        kandidaten: { accounts: [], agenttokens: [], koppelingen: [], agents: [{ id: 'claude', label: 'Claude' }] },
        rootStatus: null,
        limieten: { voorbereiderMaxDagen: 90 },
      },
      geven: () => undefined,
      onSluit: () => undefined,
    }),
  );
  const rapportHtml = renderToStaticMarkup(
    createElement(ProbleemRapport, {
      lang: 'uk',
      invoer: {
        antwoord: null,
        archief: null,
        omgeving: { actieveVersie: '20261115', site: 'https://admin.tarasevych.com', browser: 'Test', tijdzone: 'UTC' },
      },
      onSluiten: () => undefined,
    }),
  );
  const kaartHtml = renderToStaticMarkup(
    createElement(GebruikerKaart, {
      id: '00000000-0000-0000-0000-000000000001',
      ctx: { service: 'admin', tabContext: 'tc-1', sourceOrigin: 'https://admin.tarasevych.com' },
      lang: 'uk',
      nu: Date.now(),
      onSluit: () => undefined,
    }),
  );
  const vensterHtml = renderToStaticMarkup(
    createElement(Venster, {
      titel: 'Підтвердження',
      ja: 'Так',
      nee: 'Скасувати',
      onJa: () => undefined,
      onNee: () => undefined,
      children: 'Перевірка вмісту',
    }),
  );
  check(
    '5c SSR/renderToStaticMarkup усіх 4 модальних компонентів працює без збою createPortal',
    agentHtml.includes('ut-modal-schaduw') &&
      rapportHtml.includes('ut-vr-scrim') &&
      kaartHtml.includes('ov-modal-schaduw') &&
      vensterHtml.includes('tg-venster-achter'),
  );

  const uitrolCss = lees('src/uitrol/uitrol.css');
  const voorbCss = lees('src/uitrol/voorbereiders.css');
  const vrCss = lees('src/uitrol/vereisten.css');
  const ovCss = lees('src/overzicht/overzicht.css');
  const agCss = lees('src/agenten/agenten-pagina.css');
  const adminSrc = lees('src/BeheerConsoleWeergave.tsx');
  check(
    '5d модальні вікна порталяться у .canonical-chrome з прозорими обгортками display:contents, підвищеним z-index і реєстрацією в ADMIN_MODAAL_SELECTOR',
    uitrolCss.includes('.ut-portaal{display:contents}') &&
      ovCss.includes('.ov-portaal{display:contents}') &&
      agCss.includes('.ag-portaal{display:contents}') &&
      voorbCss.includes('.ut-modal-schaduw{position:fixed;inset:0;z-index:950') &&
      vrCss.includes('.ut-vr-scrim{position:fixed;inset:0;z-index:950') &&
      adminSrc.includes('.ut-modal-schaduw') &&
      adminSrc.includes('.ut-vr-scrim') &&
      ['src/uitrol/AgentToevoegen.tsx', 'src/uitrol/ProbleemRapport.tsx', 'src/overzicht/GebruikerKaart.tsx', 'src/agenten/toegang/delen.tsx'].every((f) => {
        const s = lees(f);
        return s.includes('createPortal') && s.includes('useLayoutEffect') && s.includes('.canonical-chrome');
      }),
  );

  // Живий БД-пробіг (коли передано DATABASE_URL): перевіряємо, що stopAll реально очікує bijNoodstop і закриває agent_namens_sessies.
  if (process.env.DATABASE_URL) {
    const { closePool, getPool } = await import('../../server/platform/pg');
    const { bijNoodstop, stopAll } = await import('../../backend/ai-toestemmingen');
    const sys = getPool('systeem');
    const testUserId = '00000000-0000-4000-8000-000000009901';
    let listenerKlaar = false;
    bijNoodstop(async (uid) => {
      if (uid !== testUserId) return;
      await new Promise((r) => setTimeout(r, 35));
      listenerKlaar = true;
    });
    try {
      await sys.query(
        `INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)
         ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data`,
        [testUserId, JSON.stringify({ email: 'noodstop-test@voorbeeld.test', role: 'user', status: 'approved' })],
      );
      await sys.query(
        `INSERT INTO app.agent_namens_sessies (user_id, agent, ruimte, omvang, verloopt_op, stap_op_methode)
         VALUES ($1, 'claude', 'prive', ARRAY['overzicht'], now() + interval '1 hour', 'passkey')`,
        [testUserId],
      );
      const res = await stopAll(testUserId, testUserId);
      const openNaStop = (await sys.query(`SELECT count(*)::int AS n FROM app.agent_namens_sessies WHERE user_id = $1 AND ingetrokken_op IS NULL`, [testUserId])).rows[0].n;
      check('2c живий БД-пробіг stopAll: очікує async-слухача bijNoodstop до повернення і закриває agent_namens_sessies', listenerKlaar && res.namens >= 1 && openNaStop === 0, JSON.stringify({ listenerKlaar, res, openNaStop }));
    } finally {
      await sys.query('DELETE FROM app.agent_namens_sessies WHERE user_id = $1', [testUserId]).catch(() => undefined);
      await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = $1', [testUserId]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [testUserId]).catch(() => undefined);
      await closePool().catch(() => undefined);
    }
  }

  return einde();
}
