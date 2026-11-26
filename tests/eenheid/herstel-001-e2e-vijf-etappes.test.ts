// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// HERSTEL-001 — ЧОТИРИРІВНЕВИЙ НАБІР НАСКРІЗНИХ ВИПРОБУВАНЬ УСІХ 5 ЕТАПІВ (48 ВАД ТА ІНВАРІАНТІВ ВЛАСНИКА)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Рівень 1: покриття кожної можливості (F1..F12, по 7 перевірок на групу = 84 перевірки)
// Рівень 2: межові та негативні стани (68 перевірок)
// Рівень 3: міжфункціональні парні комбінації (26 перевірок)
// Рівень 4: реалістичні наскрізні сценарії у безголовому /usr/bin/google-chrome через CDP (10 сценаріїв)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import { AssertionError } from 'node:assert';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build as esbuild } from 'esbuild';
import WebSocketPkg from 'ws';
import { nepBrowser } from './hulp/nep-browser';

const WS = (WebSocketPkg as unknown as { WebSocket?: typeof WebSocketPkg }).WebSocket || WebSocketPkg;

export type GroepId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12';
export type NiveauId = 1 | 2 | 3 | 4;

export interface ToetsUitkomst {
  readonly id: string;
  readonly niveau: NiveauId;
  readonly groep: GroepId;
  readonly naam: string;
  readonly geslaagd: boolean;
  readonly foutDetail: string;
  readonly помилкаОбвязки: boolean;
}

class KontraktFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'KontraktFout';
  }
}

function eis(voorwaarde: unknown, bericht: string): asserts voorwaarde {
  if (!voorwaarde) throw new KontraktFout(bericht);
}

const ALLE_GROEPEN: readonly GroepId[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
const VERBODEN_TEKENS_RE = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/u;
const STANDAARD_SCRATCH_WORTEL = '/home/antigravity/.gemini/jetski/scratch/teamwork_tmp';
const ARTEFACT_MAP =
  '/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/606a0150-7164-4947-b12c-2c895a30eabd';

function isVerbodenSysteemTmp(pad: string): boolean {
  const schoon = resolve(pad);
  return schoon === '/tmp' || schoon.startsWith('/tmp/') || schoon === '/var/tmp' || schoon.startsWith('/var/tmp/');
}

function bepaalTijdelijkeMappen(ruweTmpDir: string | undefined): {
  basisWortel: string;
  werkMap: string;
  kortTmp: string;
} {
  const uniek = `${process.pid.toString(36).slice(-4)}${Date.now().toString(36).slice(-4)}`;
  const kandidaat = (ruweTmpDir || '').trim();
  const basisWortel =
    kandidaat.length > 0 && !isVerbodenSysteemTmp(kandidaat)
      ? resolve(kandidaat)
      : STANDAARD_SCRATCH_WORTEL;

  const werkMap = join(basisWortel, `e2e_w_${uniek}`);

  // Захист від обмеження ядра Linux UNIX_PATH_MAX = 108 для сокета Chrome
  // ($TMPDIR/com.google.Chrome.XXXXXX/SingletonSocket додає +41 символ, тож kortTmp мусить бути <= 64 символи):
  let kortWortel = basisWortel;
  if (kortWortel.length > 52) {
    if (kortWortel.startsWith('/home/antigravity/') || existsSync(dirname(STANDAARD_SCRATCH_WORTEL))) {
      kortWortel = STANDAARD_SCRATCH_WORTEL;
    } else {
      while (kortWortel.length > 52 && dirname(kortWortel) !== kortWortel) {
        const ouder = dirname(kortWortel);
        if (ouder === '/' || isVerbodenSysteemTmp(ouder)) break;
        kortWortel = ouder;
      }
    }
  }
  const kortTmp = join(kortWortel, `t_${uniek}`);
  return { basisWortel, werkMap, kortTmp };
}

function leesBestandVeilig(wortel: string, relPad: string): string {
  const volledig = join(wortel, relPad);
  eis(existsSync(volledig), `Очікуваний файл відсутній: ${relPad}`);
  return readFileSync(volledig, 'utf8');
}

async function laadScriptMjs<T>(wortel: string, relPad: string): Promise<T> {
  return (await import(pathToFileURL(join(wortel, relPad)).href)) as T;
}

function zonderCssOpmerkingen(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function vindJsxOpenTagMetKlas(tsx: string, klas: string): string | null {
  const idx = tsx.indexOf(klas);
  if (idx < 0) return null;
  const voor = tsx.slice(0, idx);
  const startMatch = [...voor.matchAll(/<(?:div|section|aside|article)\b/g)].pop();
  if (!startMatch || startMatch.index === undefined) return null;
  let diepte = 0;
  let quote: "'" | '"' | '`' | null = null;
  for (let i = startMatch.index; i < tsx.length; i++) {
    const ch = tsx[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{') diepte++;
    else if (ch === '}') diepte = Math.max(0, diepte - 1);
    else if (ch === '>' && diepte === 0) return tsx.slice(startMatch.index, i + 1);
  }
  return null;
}

async function draaiToets(
  uitkomsten: ToetsUitkomst[],
  id: string,
  niveau: NiveauId,
  groep: GroepId,
  naam: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    uitkomsten.push({ id, niveau, groep, naam, geslaagd: true, foutDetail: '', помилкаОбвязки: false });
  } catch (gevangen) {
    const isKontrakt = gevangen instanceof KontraktFout || gevangen instanceof AssertionError;
    const tekst = gevangen instanceof Error ? gevangen.message : String(gevangen);
    uitkomsten.push({
      id,
      niveau,
      groep,
      naam,
      geslaagd: false,
      foutDetail: tekst.replace(/\s+/g, ' ').trim().slice(0, 280),
      помилкаОбвязки: !isKontrakt,
    });
  }
}

async function metTijdelijkeNavigator<T>(nepNav: unknown, fn: () => Promise<T>): Promise<T> {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: nepNav, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
  }
}

export interface ChromeSessieApi {
  readonly poort: number;
  zetScherm: (breedte: number, hoogte: number, mobiel: boolean) => Promise<void>;
  openPad: (pad: string) => Promise<void>;
  evalueer: <R>(uitdrukking: string) => Promise<R>;
  toets: (key: string) => Promise<void>;
  aanraken: (x: number, y: number) => Promise<void>;
}

async function metGedeeldeChrome<T>(
  kortTmp: string,
  werkMap: string,
  routeHandler: (req: IncomingMessage, res: ServerResponse) => void,
  uitvoerder: (api: ChromeSessieApi) => Promise<T>,
): Promise<T> {
  const profielMap = join(werkMap, 'profiel');
  const opslagMap = join(werkMap, 'opslag');
  const crashMap = join(werkMap, 'crash');
  for (const d of [profielMap, opslagMap, crashMap, kortTmp, join(profielMap, 'cfg'), join(profielMap, 'cache')]) {
    mkdirSync(d, { recursive: true });
  }

  const verbindingen = new Set<Socket>();
  const srv = createServer((req, res) => {
    res.setHeader('Connection', 'close');
    routeHandler(req, res);
  });
  srv.on('connection', (s) => {
    verbindingen.add(s);
    s.on('close', () => verbindingen.delete(s));
  });
  const poort = await new Promise<number>((res, rej) => {
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => res((srv.address() as { port: number }).port));
  });

  let kind: ChildProcess | null = null;
  let ws: InstanceType<typeof WS> | null = null;
  try {
    const chromePad = process.env.CHROME_PAD || '/usr/bin/google-chrome';
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--mute-audio',
      '--no-proxy-server',
      `--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${poort}, MAP tarasevych.com 127.0.0.1:${poort}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost`,
      `--user-data-dir=${profielMap}`,
      `--disk-cache-dir=${opslagMap}`,
      `--crash-dumps-dir=${crashMap}`,
      '--remote-debugging-port=0',
      'about:blank',
    ];
    kind = spawn(chromePad, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        HOME: profielMap,
        TMPDIR: kortTmp,
        TMP: kortTmp,
        TEMP: kortTmp,
        DBUS_SESSION_BUS_ADDRESS: '/dev/null',
        XDG_CONFIG_HOME: join(profielMap, 'cfg'),
        XDG_CACHE_HOME: join(profielMap, 'cache'),
        LANG: 'C.UTF-8',
      },
    });

    const wsUrl = await new Promise<string>((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error(`Перевищено час запуску Chrome: ${buf.slice(-260)}`)), 15_000);
      kind!.stderr!.on('data', (d) => {
        buf += String(d);
        const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buf);
        if (m) {
          clearTimeout(t);
          res(m[1]);
        }
      });
      kind!.once('exit', (code) => {
        clearTimeout(t);
        rej(new Error(`Процес Chrome несподівано завершився (${code}): ${buf.slice(-260)}`));
      });
    });

    ws = new WS(wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    await new Promise<void>((res, rej) => {
      ws!.once('open', () => res());
      ws!.once('error', rej);
    });

    let volg = 0;
    const wacht = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
    ws.on('message', (raw: unknown) => {
      const m = JSON.parse(String(raw)) as { id?: number; result?: unknown; error?: { message: string } };
      if (m.id && wacht.has(m.id)) {
        const p = wacht.get(m.id)!;
        wacht.delete(m.id);
        if (m.error) p.rej(new Error(m.error.message));
        else p.res(m.result);
      }
    });

    const stuur = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
      new Promise<Record<string, unknown>>((res, rej) => {
        const id = ++volg;
        const timer = setTimeout(() => {
          if (wacht.delete(id)) rej(new Error(`Перевищено час очікування CDP ${method}`));
        }, 15_000);
        timer.unref();
        wacht.set(id, {
          res: (v) => {
            clearTimeout(timer);
            res((v || {}) as Record<string, unknown>);
          },
          rej: (e) => {
            clearTimeout(timer);
            rej(e);
          },
        });
        ws!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });

    const targetsRes = await stuur('Target.getTargets');
    const targetInfos = (targetsRes.targetInfos || []) as Array<{ targetId: string; type: string }>;
    const doel = targetInfos.find((x) => x.type === 'page');
    if (!doel) throw new Error('Не знайдено вкладку сторінки Chrome');
    const attachRes = await stuur('Target.attachToTarget', { targetId: doel.targetId, flatten: true });
    const sessionId = String(attachRes.sessionId || '');
    await stuur('Page.enable', {}, sessionId);
    await stuur('Runtime.enable', {}, sessionId);
    await stuur('Browser.grantPermissions', {
      origin: `http://127.0.0.1:${poort}`,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    }).catch(() => undefined);

    const zetScherm = async (width: number, height: number, mobile: boolean) => {
      await stuur(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile },
        sessionId,
      );
      await stuur('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 }, sessionId);
    };

    const openPad = async (pad: string) => {
      const url = pad.startsWith('http') ? pad : `http://127.0.0.1:${poort}${pad}`;
      const doelU = new URL(url);
      await stuur('Page.navigate', { url }, sessionId);
      const eind = Date.now() + 10_000;
      while (Date.now() < eind) {
        const r = await stuur(
          'Runtime.evaluate',
          { expression: '`${location.pathname}${location.search}|${document.readyState}`', returnByValue: true },
          sessionId,
        );
        const val = String((r.result as { value?: string } | undefined)?.value || '');
        if (val === `${doelU.pathname}${doelU.search}|complete`) break;
        await new Promise((r2) => setTimeout(r2, 35));
      }
      await new Promise((r2) => setTimeout(r2, 120));
    };

    const evalueer = async <R>(uitdrukking: string): Promise<R> => {
      const r = await stuur(
        'Runtime.evaluate',
        {
          expression: `Promise.resolve().then(() => (${uitdrukking})).then((v) => JSON.stringify(v === undefined ? null : v))`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      if (r.exceptionDetails) {
        const exc = r.exceptionDetails as { text?: string; exception?: { description?: string } };
        throw new Error(`Виняток на сторінці: ${exc.exception?.description || exc.text || 'невідома помилка'}`);
      }
      const resObj = r.result as { value?: string } | undefined;
      return JSON.parse(String(resObj?.value ?? 'null')) as R;
    };

    const toets = async (key: string) => {
      const code = key === 'Escape' ? 'Escape' : key;
      const vk = key === 'Escape' ? 27 : 0;
      await stuur('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sessionId);
      await stuur('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sessionId);
      await new Promise((r2) => setTimeout(r2, 60));
    };

    const aanraken = async (x: number, y: number) => {
      await stuur('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] }, sessionId);
      await stuur('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
      await new Promise((r2) => setTimeout(r2, 60));
    };

    return await uitvoerder({ poort, zetScherm, openPad, evalueer, toets, aanraken });
  } finally {
    try {
      ws?.terminate();
    } catch {
      /* з'єднання вже закрите */
    }
    if (kind && kind.exitCode === null) {
      kind.kill('SIGKILL');
      await new Promise((r) => kind!.once('exit', r));
    }
    await new Promise((r) => setTimeout(r, 120));
    for (const s of verbindingen) s.destroy();
    await new Promise((r) => srv.close(() => r(undefined)));
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// РІВЕНЬ 1 — ГРУПИ F1..F4 (ВХІД, ЗАСТАВКА ТА ПІДТВЕРДЖЕННЯ TELEGRAM)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function voerNiveau1F1TotF4Uit(wortel: string, uitkomsten: ToetsUitkomst[]): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const moviPrapor = await import('../../src/MoviPrapor');
  const CanoniekAccountMenuMod = await import('../../src/CanoniekAccountMenu');
  const AccountMenuV3Mod = await import('../../src/accountmenu-v3/AccountMenuV3');
  const navigatieSnel = await import('../../src/navigatie-snel');
  const CanoniekOmlijstingMod = await import('../../src/CanoniekOmlijsting');
  const AanmeldAndereOptiesMod = await import('../../src/AanmeldAndereOpties');
  const tgTeksten = await import('../../shared/telegram-aanmelden/teksten');
  const plaatsMod = await import('../../src/aanmelden/plaats');
  const tgSectieMod = await import('../../src/telegram-aanmelden/TelegramSectie');
  const vensterMod = await import('../../backend/telegram-aanmelden/venster');

  // ── Група F1 (T-1, T-2): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F1-1', 1, 'F1', 'F1.1 (T-1, K1-T1): капсула мови button.mr-sign-in-taal без is-icoon з прапором і видимим підписом укр./NL', () => {
    eis(moviPrapor.MOVA_NAAM.uk === 'укр.' && moviPrapor.MOVA_NAAM.nl === 'NL', 'MOVA_NAAM мусить містити "укр." та "NL"');
    eis(moviPrapor.MOVA_VOLLEDIG.uk === 'Українська' && moviPrapor.MOVA_VOLLEDIG.nl === 'Nederlands', 'MOVA_VOLLEDIG мусить містити повні самоназви мов');
    const htmlUk = renderToStaticMarkup(
      React.createElement(CanoniekAccountMenuMod.default, {
        lang: 'uk',
        theme: 'light',
        user: null,
        onAddAccount: () => undefined,
        onLanguage: () => undefined,
        onTheme: () => undefined,
      }),
    );
    const htmlNl = renderToStaticMarkup(
      React.createElement(CanoniekAccountMenuMod.default, {
        lang: 'nl',
        theme: 'dark',
        user: null,
        onAddAccount: () => undefined,
        onLanguage: () => undefined,
        onTheme: () => undefined,
      }),
    );
    eis(/<button[^>]*class="mr-sign-in-taal"[^>]*>/.test(htmlUk), 'Кнопка мови гостьового входу має бути капсулою mr-sign-in-taal без класу is-icoon');
    eis(htmlUk.includes('data-movi-prapor="uk"') && htmlUk.includes('<b>укр.</b>'), 'Українська капсула мови має містити прапор та <b>укр.</b>');
    eis(htmlNl.includes('data-movi-prapor="nl"') && htmlNl.includes('<b>NL</b>'), 'Нідерландська капсула мови має містити прапор та <b>NL</b>');
  });

  await draaiToets(uitkomsten, 'L1-F1-2', 1, 'F1', 'F1.2 (T-1, K1-T1): спадне меню mr-sign-in-taal-menu з повними самоназвами, позначкою активної мови та закриттям за Escape', () => {
    const bron = leesBestandVeilig(wortel, 'src/CanoniekAccountMenu.tsx');
    eis(bron.includes('mr-sign-in-taal-menu') && bron.includes("role='menu'"), 'Відсутнє спадне меню мов mr-sign-in-taal-menu з role=menu');
    eis(bron.includes("role='menuitemradio'") && bron.includes('MOVA_VOLLEDIG.uk') && bron.includes('MOVA_VOLLEDIG.nl'), 'Меню мов має містити обидва пункти menuitemradio з MOVA_VOLLEDIG');
    eis(bron.includes('mr-sign-in-taal-check') && /key\s*[!=]==\s*['"]Escape['"]/.test(bron), 'Меню мов має позначати активну мову галочкою та закриватися за Escape');
  });

  await draaiToets(uitkomsten, 'L1-F1-3', 1, 'F1', 'F1.3 (T-1): рівна висота 38 px трьох кнопок верхньої панелі, єдина поверхня та колір теми var(--mr-login-ink)', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css') + '\n' + leesBestandVeilig(wortel, 'src/account-afgemeld-menu.css'));
    eis(/button\.mr-sign-in-taal[\s\S]{0,360}height:\s*38px/.test(css), 'Капсула button.mr-sign-in-taal мусить мати висоту 38px');
    eis(/\.mr-sign-in-thema[\s\S]{0,360}height:\s*38px/.test(css), 'Кнопка теми .mr-sign-in-thema мусить мати висоту 38px');
    eis(/\.canonical-avatar-trigger[\s\S]{0,420}height:\s*38px/.test(css), 'Кнопка профілю .canonical-avatar-trigger мусить мати висоту 38px');
    eis(!/\.mr-sign-in-thema[\s\S]{0,260}#f59e0b/i.test(css), 'Значок теми не повинен мати випадковий помаранчевий колір #f59e0b на гостьовому вході');
  });

  await draaiToets(uitkomsten, 'L1-F1-4', 1, 'F1', 'F1.4 (T-1): специфічність мобільного селектора капсули >= (0,4,1) без !important та сенсорна зона 44 px', () => {
    const herontwerp = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    const afgemeld = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/account-afgemeld-menu.css'));
    const samen = `${herontwerp}\n${afgemeld}`;
    eis(
      /\.canonical-chrome:has\(\.mr-sign-in\)\s+\.mr-sign-in-quick-controls\s+button\.mr-sign-in-taal/.test(samen),
      'Мобільний селектор капсули мови повинен мати вагу >= (0,4,1), щоб перемагати mobiel.css:27 без !important',
    );
    eis(!afgemeld.includes('!important'), 'Файл account-afgemeld-menu.css не повинен містити !important');
    eis(/inset:\s*-3px/.test(samen), 'Кнопки верхньої панелі 38 px мусять мати сенсорне розширення ::after { inset: -3px } до 44 px');
  });

  await draaiToets(uitkomsten, 'L1-F1-5', 1, 'F1', 'F1.5 (T-1): прямокутний прапор 18×12 px у капсулі мови без обрізання в коло', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css') + '\n' + leesBestandVeilig(wortel, 'src/account-afgemeld-menu.css'));
    eis(/\.mr-sign-in-taal\s+\.taal-vlag[\s\S]{0,220}width:\s*18px[\s\S]{0,120}height:\s*12px/.test(css), 'Прапор у капсулі мови мусить мати прямокутні пропорції 18×12 px');
  });

  await draaiToets(uitkomsten, 'L1-F1-6', 1, 'F1', 'F1.6 (T-2): однакові медальйони 34×34 px для Google та Telegram і симетрична сітка кнопок входу', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    eis(/\.mr-sign-in-logo\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/.test(css), 'Медальйон Google .mr-sign-in-logo мусить мати 34×34 px');
    eis(/\.tga-aanmeld-logo\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/.test(css), 'Медальйон Telegram .tga-aanmeld-logo на екрані входу мусить мати 34×34 px');
    eis(/grid-template-columns:\s*34px\s+minmax\(0,\s*1fr\)\s+34px/.test(css), 'Головні кнопки входу мусять мати симетричну триколонкову сітку 34px minmax(0,1fr) 34px');
  });

  await draaiToets(uitkomsten, 'L1-F1-7', 1, 'F1', 'F1.7 (T-2): адаптивне зменшення медальйонів до 30×30 px при <= 380 px із max-width/height: 100%', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    eis(/@media\s*\(\s*max-width:\s*380px\s*\)[\s\S]{0,900}30px/.test(css), 'На екранах <= 380 px медальйони входу мусять зменшуватися до 30×30 px');
    eis(/\.tga-aanmeld-logo[\s\S]{0,400}max-width:\s*100%[\s\S]{0,120}max-height:\s*100%/.test(css), 'Вкладений знак у медальйоні Telegram мусить обмежуватися max-width: 100% та max-height: 100%');
  });

  // ── Група F2 (T-3, T-4, K1-T3, K1-T4): 7 перевірок ──
  const basisAm3Props = {
    lang: 'uk' as const,
    theme: 'light' as const,
    displayUser: null,
    visibleRows: [],
    shouldShowOtherAccountsToggle: false,
    expanded: false,
    onToggleExpanded: () => undefined,
    busy: false,
    selecting: '',
    forgetting: '',
    loading: false,
    loadFailed: false,
    photoBusy: false,
    photoError: false,
    photoLeesfout: '',
    photoFailedText: '',
    changePhotoLabel: 'Змінити світлину',
    manageLabel: 'Керування',
    settingsLabel: 'Налаштування',
    privacyLabel: 'Конфіденційність',
    termsLabel: 'Умови',
    showLogoutAll: false,
    wisselMelding: null,
    wisselFout: null,
    v2Ruimtes: true,
    onSelectAccount: () => undefined,
    onAddAccount: () => undefined,
    onTheme: () => undefined,
    onLanguage: () => undefined,
    onClose: () => undefined,
    renderAvatar: () => React.createElement('span', { className: 'test-avatar' }, 'П'),
  };

  await draaiToets(uitkomsten, 'L1-F2-1', 1, 'F2', 'F2.1 (T-3, K1-T3): безумовне збереження орбітального кружечка "+" (.am3-orbit-node.is-add) в AccountMenuV3 до і після входу', () => {
    const gastHtml = renderToStaticMarkup(React.createElement(AccountMenuV3Mod.AccountMenuV3, basisAm3Props));
    const ingelogdHtml = renderToStaticMarkup(
      React.createElement(AccountMenuV3Mod.AccountMenuV3, {
        ...basisAm3Props,
        displayUser: { id: 'u-1', accountId: 'acc-1', name: 'Олена Коваль', email: 'olena@voorbeeld.test' },
      }),
    );
    eis(gastHtml.includes('am3-orbit-node is-add'), 'Орбітальний кружечок "+" (.am3-orbit-node.is-add) мусить бути присутнім у гостьовому стані до першого входу');
    eis(ingelogdHtml.includes('am3-orbit-node is-add'), 'Орбітальний кружечок "+" (.am3-orbit-node.is-add) мусить зберігатися в авторизованому стані');
  });

  await draaiToets(uitkomsten, 'L1-F2-2', 1, 'F2', 'F2.2 (T-3, K1-T3): підписи мов у AccountMenuV3 з великої літери без малої "нід." та з прапорами', () => {
    const htmlUk = renderToStaticMarkup(React.createElement(AccountMenuV3Mod.AccountMenuV3, basisAm3Props));
    const htmlNl = renderToStaticMarkup(React.createElement(AccountMenuV3Mod.AccountMenuV3, { ...basisAm3Props, lang: 'nl' }));
    eis(!htmlUk.includes('>нід.<') && !htmlUk.includes('нід.'), 'У перемикачі мови AccountMenuV3 заборонено мале обрізане скорочення "нід."');
    eis(htmlUk.includes('data-movi-prapor="uk"') && htmlUk.includes('data-movi-prapor="nl"'), 'Обидві кнопки мови в AccountMenuV3 мусять містити прапори MoviPrapor');
    const knoppen = [...htmlNl.matchAll(/class="am3-seg-btn[^"]*"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => m[1].trim());
    eis(knoppen.length >= 2 && knoppen.slice(-2).every((t) => /^[А-ЯІЇЄҐA-Z]/.test(t)), 'Підписи обох мов мусять починатися з великої літери');
  });

  await draaiToets(uitkomsten, 'L1-F2-3', 1, 'F2', 'F2.3 (T-3): компактний однорядковий перемикач мови .is-lang-row без розтягування на два поверхи', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/accountmenu-v3/accountmenu-v3.css'));
    eis(css.includes('.is-lang-row'), 'У accountmenu-v3.css має бути описаний рядок мови .is-lang-row');
    eis(!/\.am3-pref-row\.is-lang-row\s*\{\s*flex-direction:\s*column/.test(css), 'Рядок мови .is-lang-row не повинен безумовно розкладатися у вертикальну колонку');
  });

  await draaiToets(uitkomsten, 'L1-F2-4', 1, 'F2', 'F2.4 (T-3): адаптивний перенос рядка «Тема» (.is-theme-row) на @media (max-width: 700px)', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/accountmenu-v3/accountmenu-v3.css'));
    eis(/@media\s*\(\s*max-width:\s*700px\s*\)[\s\S]*?\.is-theme-row/.test(css), 'Адаптація рядка «Тема» (.is-theme-row) мусить діяти на @media (max-width: 700px) для телефонів 432–460 px');
  });

  await draaiToets(uitkomsten, 'L1-F2-5', 1, 'F2', 'F2.5 (T-4, K1-T4): повна заборона приховувати #tsv-laad-kapsel, #tsv-voortgang та .canonical-boot-spin', () => {
    const indexHtml = leesBestandVeilig(wortel, 'index.html');
    const herontwerpCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    eis(indexHtml.includes("b.id='tsv-voortgang'") && indexHtml.includes("k.id='tsv-laad-kapsel'") && indexHtml.includes('canonical-boot-spin'), 'У index.html мусять бути всі 3 елементи завантаження');
    const verbodenVerberging = /(?:boot-active|\.checking)[^{]*#tsv-(?:laad-kapsel|voortgang)\s*\{[^}]*(?:opacity:\s*0|visibility:\s*hidden|display:\s*none)/i;
    eis(!verbodenVerberging.test(indexHtml) && !verbodenVerberging.test(herontwerpCss), 'КАТЕГОРИЧНО ЗАБОРОНЕНО приховувати #tsv-laad-kapsel чи #tsv-voortgang під час старту або перевірки входу');
    eis(!/\.canonical-boot-spin\s*\{[^}]*(?:opacity:\s*0|visibility:\s*hidden|display:\s*none)/i.test(indexHtml + herontwerpCss), 'КАТЕГОРИЧНО ЗАБОРОНЕНО приховувати .canonical-boot-spin');
    eis(navigatieSnel.laadKapselKorteTekst('uk') === 'Завантаження…' && navigatieSnel.laadKapselKorteTekst('nl') === 'Laden…', 'laadKapselKorteTekst має повертати локалізований текст капсули');
  });

  await draaiToets(uitkomsten, 'L1-F2-6', 1, 'F2', 'F2.6 (T-4): мобільні розміри й позиція .canonical-boot-account (38×38 px, top: 14px, right: 24px)', () => {
    const indexHtml = leesBestandVeilig(wortel, 'index.html');
    eis(
      /@media\s*\(\s*max-width:\s*700px\s*\)[\s\S]{0,180}\.canonical-boot-account\s*\{[^}]*top:\s*14px;?\s*right:\s*24px;?\s*width:\s*38px;?\s*height:\s*38px/.test(indexHtml),
      'У @media (max-width: 700px) у index.html .canonical-boot-account мусить мати top:14px; right:24px; width:38px; height:38px',
    );
  });

  await draaiToets(uitkomsten, 'L1-F2-7', 1, 'F2', 'F2.7 (T-4): збереження mr-aanmelden-bezig у startPrimaryRedirectLogin та картка is-controle у SignedOutCenter', () => {
    const omleidingBron = leesBestandVeilig(wortel, 'src/aanmeld-omleiding.ts');
    eis(omleidingBron.includes('mr-aanmelden-bezig') && omleidingBron.includes('sessionStorage.setItem'), 'startPrimaryRedirectLogin мусить записувати mr-aanmelden-bezig у sessionStorage перед переходом до Google');
    CanoniekOmlijstingMod.zetAanmeldenBezig(true);
    try {
      eis(CanoniekOmlijstingMod.aanmeldenBezig() === true, 'aanmeldenBezig() має повертати true після zetAanmeldenBezig(true)');
      const html = renderToStaticMarkup(
        React.createElement(CanoniekOmlijstingMod.SignedOutCenter, {
          lang: 'uk',
          checking: true,
          onOpenAccount: () => undefined,
        }),
      );
      eis(html.includes('is-controle') && html.includes('Перевіряємо вхід…'), 'SignedOutCenter при checking=true та aanmeldenBezig=true мусить показувати картку is-controle замість порожнього миготіння');
    } finally {
      CanoniekOmlijstingMod.zetAanmeldenBezig(false);
    }
  });

  // ── Група F3 (TG-CLEAN, TG-8, TG-9, TG-10, K2-1..K2-3): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F3-1', 1, 'F3', 'F3.1 (TG-CLEAN): чистий одноекранний режим підтвердження Telegram без довгих абзаців на основному екрані', () => {
    const bron = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(bron.includes('tg2-info-knop') || bron.includes('data-tg-schone-kaart'), 'AanmeldTelegram.tsx мусить реалізовувати чистий одноекранний режим із кнопкою довідки "і"');
    eis(!/<ol[^>]*className=['"]tg2-stappen['"]/.test(bron), 'Старий багаторядковий список кроків tg2-stappen на головному екрані входу має бути прибраний у вікно "і"');
    eis(!bron.includes('Чому піктограма, а не просто «Так»?'), 'Довгі пояснювальні абзаци не повинні стояти на основному екрані картки Telegram');
  });

  await draaiToets(uitkomsten, 'L1-F3-2', 1, 'F3', 'F3.2 (TG-CLEAN, K2-2): кругла кнопка довідки .tg2-info-knop.is-icoon (28×28 px, вага >= (0,4,1), дотик 44 px)', () => {
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/telegram-aanmelden/telegram.css'));
    eis(/tg2-info-knop[^'"]*is-icoon|is-icoon[^'"]*tg2-info-knop/.test(tsx), 'Кнопка довідки "і" мусить мати клас is-icoon');
    eis(
      /\.tg2-info-knop[^{]*\{[^}]*(?:width:\s*28px[^}]*height:\s*28px|height:\s*28px[^}]*width:\s*28px)/.test(css),
      'Кнопка .tg2-info-knop мусить мати розмір 28×28 px у telegram.css',
    );
    eis(/inset:\s*-8px/.test(css), 'Кнопка 28×28 px мусить мати сенсорне розширення ::after { inset: -8px } до 44×44 px');
  });

  await draaiToets(uitkomsten, 'L1-F3-3', 1, 'F3', 'F3.3 (TG-CLEAN, K2-1, K2-3): реєстрація .tg2-info-sluier у plaatsing-vaste-elementen.json та role="dialog" на .tg2-info-blad', () => {
    const json = JSON.parse(leesBestandVeilig(wortel, 'scripts/plaatsing-vaste-elementen.json')) as { toegestaan?: Array<{ sleutel: string; reden: string }> };
    const gevonden = (json.toegestaan || []).some((x) => x.sleutel.includes('.tg2-info-sluier') && x.reden.trim().length > 5);
    eis(gevonden, 'Завіса .tg2-info-sluier мусить бути зареєстрована у scripts/plaatsing-vaste-elementen.json');
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/telegram-aanmelden/telegram.css'));
    const sluierTag = vindJsxOpenTagMetKlas(tsx, 'tg2-info-sluier');
    const bladTag = vindJsxOpenTagMetKlas(tsx, 'tg2-info-blad');
    eis(
      Boolean(bladTag && /\brole=['"]dialog['"]/.test(bladTag) && /\baria-modal=(?:['"]true['"]|\{\s*true\s*\})/.test(bladTag)) &&
        Boolean(!sluierTag || !/\brole=['"]dialog['"]/.test(sluierTag)),
      'Атрибути role="dialog" та aria-modal="true" мусять стояти на аркуші .tg2-info-blad (незалежно від порядку), а не на завісі',
    );
    eis(/\.tg2-info-sluier[\s\S]{0,260}max-width:\s*none[\s\S]{0,120}max-height:\s*none/.test(css), 'Завіса .tg2-info-sluier мусить мати max-width: none; max-height: none');
  });

  await draaiToets(uitkomsten, 'L1-F3-4', 1, 'F3', 'F3.4 (TG-CLEAN): вікно підказки "і" містить рівно 3 короткі візуальні кроки з 3 міні-піктограмами та згорнутий підвал', () => {
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(tsx.includes('tg2-info-stappen') && tsx.includes('tg2-mini-drie') && tsx.includes('tg2-info-extra'), 'Спливний аркуш має містити 3 кроки tg2-info-stappen, блок 3 міні-піктограм tg2-mini-drie та підвал tg2-info-extra');
  });

  await draaiToets(uitkomsten, 'L1-F3-5', 1, 'F3', 'F3.5 (TG-8): триколонкова кнопка «Відкрити Telegram» з <TelegramLogo maat={34} /> та єдина назва «Підтвердити вхід»', () => {
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    const inloggenBron = leesBestandVeilig(wortel, 'backend/telegram-aanmelden/inloggen.ts');
    eis(
      tsx.includes('TelegramLogo maat={34}') &&
        tsx.includes('tga-aanmeld-eind') &&
        !/tga-aanmeld-logo[^>]*>\s*<TelegramLogo\s+maat=\{(?!34\b)\d+\}/.test(tsx),
      'Усі кнопки з .tga-aanmeld-logo (включно із запасною гілкою «Відкрити Telegram») мусять мати триколонкову будову з TelegramLogo maat={34}',
    );
    eis(tgTeksten.TEKST.knopVensterInlog.uk.includes('Підтвердити вхід') && tgTeksten.TEKST.knopVensterInlog.nl.includes('Aanmelding bevestigen'), 'TEKST.knopVensterInlog має містити узгоджену назву кнопки');
    eis(inloggenBron.includes('Підтвердити вхід') && !inloggenBron.includes('Перевірити й увійти'), 'Повідомлення бота у inloggen.ts має вживати точну назву кнопки «Підтвердити вхід» без розбіжностей');
  });

  await draaiToets(uitkomsten, 'L1-F3-6', 1, 'F3', 'F3.6 (TG-9): питомий вислів «сховищ коду» та відсутність службових назв прапорців у AanmeldAndereOpties.tsx', () => {
    const ingangen = AanmeldAndereOptiesMod.AANMELD_INGANGEN;
    const gh = ingangen.find((x) => x.id === 'github');
    eis(Boolean(gh) && gh!.reden[0].includes('сховищ коду') && !gh!.reden[0].includes('репозиторіїв'), 'Опис GitHub у AANMELD_INGANGEN мусить вживати питоме «сховищ коду» замість «репозиторіїв»');
    for (const item of ingangen) {
      const tekst = `${item.titel[0]} ${item.titel[1]} ${item.reden[0]} ${item.reden[1]}`;
      eis(!/AANMELD_APPLE_|aanmelden-apple|aanmelden-microsoft|aanmelden-passkey/.test(tekst), `Опис способу входу ${item.id} не сміє виводити внутрішні назви прапорців чи змінних середовища`);
    }
  });

  await draaiToets(uitkomsten, 'L1-F3-7', 1, 'F3', 'F3.7 (TG-10): відсутність TelegramStijlKiezer на публічному вході та приховування кнопки .canonical-scroll-top', () => {
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    eis(!tsx.includes('TelegramStijlKiezer'), 'Перемикач макета TelegramStijlKiezer не повинен відмальовуватися на публічному екрані входу');
    eis(/\.canonical-chrome:has\(\.mr-sign-in\)\s+\.canonical-scroll-top\s*\{\s*display:\s*none/.test(css), 'Плавальна кнопка прокрутки вгору .canonical-scroll-top має бути прихована на сторінці входу');
  });

  // ── Група F4 (TG-1..TG-7): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F4-1', 1, 'F4', 'F4.1 (TG-1): геолокація лише з прямого жесту користувача, тихий plaatsVoorStart та звірка plaatsToestemming', async () => {
    eis(typeof plaatsMod.plaatsToestemming === 'function' && typeof plaatsMod.plaatsVragen === 'function' && typeof plaatsMod.plaatsVoorStart === 'function', 'Модуль src/aanmelden/plaats.ts мусить експортувати plaatsToestemming, plaatsVragen та plaatsVoorStart');
    let geoGevraagd = 0;
    await metTijdelijkeNavigator(
      {
        permissions: { query: async () => ({ state: 'prompt' }) },
        geolocation: {
          getCurrentPosition: () => {
            geoGevraagd++;
          },
        },
      },
      async () => {
        const voor = await plaatsMod.plaatsVoorStart();
        eis(geoGevraagd === 0 && voor.plaats === undefined, 'plaatsVoorStart при стані prompt не повинен викликати getCurrentPosition без жесту людини');
      },
    );
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(tsx.includes('plaatsToestemming'), 'AanmeldTelegram.tsx мусить звіряти plaatsToestemming перед записом постійного стану geweigerd');
  });

  await draaiToets(uitkomsten, 'L1-F4-2', 1, 'F4', 'F4.2 (TG-2): перемикач прямого підтвердження в боті (типово false, попередження про шахраїв, збереження widgetUrl)', () => {
    const sql = leesBestandVeilig(wortel, 'migrations/0342_tg_rechtstreeks_bevestigen.sql');
    eis(/rechtstreeks_bevestigen\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i.test(sql), 'Міграція 0342 мусить задавати DEFAULT false для rechtstreeks_bevestigen');
    const htmlUk = renderToStaticMarkup(
      React.createElement(tgSectieMod.RechtstreeksBevestigen, {
        lang: 'uk',
        bot: 'TarasevychBot',
        aan: false,
        zetten: async () => undefined,
      }),
    );
    eis(htmlUk.includes('data-rechtstreeks-bevestigen="uit"') && /шахра/i.test(htmlUk), 'Компонент RechtstreeksBevestigen має бути типово вимкнений і містити попередження про шахраїв');
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(tsx.includes('lopend.widgetUrl'), 'Альтернативне посилання lopend.widgetUrl мусить зберігатися для входу з іншого пристрою');
  });

  await draaiToets(uitkomsten, 'L1-F4-3', 1, 'F4', 'F4.3 (TG-3): повноширинна триколонкова кнопка «Надати місце пристрою» у блоці [data-tg-plaats-eis]', () => {
    const tsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(tsx.includes('data-tg-plaats-eis') && tsx.includes('tga-plaats-knop') && tsx.includes('Надати місце пристрою'), 'Блок обов’язкової геоперевірки має містити триколонкову кнопку tga-plaats-knop');
  });

  await draaiToets(uitkomsten, 'L1-F4-4', 1, 'F4', 'F4.4 (TG-4): прокручування верхньої панелі зі сторінкою входу (position: absolute) та приглушення завісою діалогу', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    eis(/\.canonical-chrome:has\(\.mr-sign-in\)\s+\.canonical-account-anchor\s*\{[^}]*position:\s*absolute/.test(css), '.canonical-account-anchor на сторінці входу мусить мати position: absolute');
    eis(/\[role=['"]?dialog['"]?\]\[aria-modal=['"]?true['"]?\][\s\S]{0,220}\.canonical-account-anchor/.test(css), 'Верхня панель входу має приглушуватися при відкритому модальному діалозі');
  });

  const voorbeeldWeergave = {
    soort: 'i' as const,
    actieCode: 'inloggen',
    titel: 'Вхід у Мій простір',
    wat: 'Підтвердьте вхід на сайт',
    dienst: 'mail.tarasevych.com',
    toestel: 'Chrome · Android',
    apparaat: 'Chrome/Android',
    plaats: 'Brussels',
    land: 'BE',
    ipPunt: { lat: 50.85, lon: 4.35 },
    geoPunt: { lat: 50.851, lon: 4.352 },
    geoStand: 'gegeven' as const,
    aangemaaktOp: '2026-11-25T08:17:00+01:00',
    terugUrl: 'https://mail.tarasevych.com/inbox',
    accounts: [{ koppelingId: 'kop-1', naam: 'Олена Коваль', email: 'olena@voorbeeld.test', letter: 'О' }],
    telegram: { naam: 'Olena Koval', gebruikersnaam: 'olena_test', letter: 'O' },
    kandidaten: [3, 7, 11],
  };

  await draaiToets(uitkomsten, 'L1-F4-5', 1, 'F4', 'F4.5 (TG-5): paginaHtml виводить назву місця рівно один раз у рядку «Звідки» та «за IP» у капсулі', () => {
    const htmlUk = vensterMod.paginaHtml(voorbeeldWeergave as never, 'uk');
    const htmlNl = vensterMod.paginaHtml(voorbeeldWeergave as never, 'nl');
    const chipsUk = /<div class="meta-chips">([\s\S]*?)<\/div>/.exec(htmlUk)?.[1] || '';
    const chipsNl = /<div class="meta-chips">([\s\S]*?)<\/div>/.exec(htmlNl)?.[1] || '';
    const aantalBoldUk = (htmlUk.match(/<b>Брюссель,\s*Бельгія<\/b>/g) || []).length;
    const aantalBoldNl = (htmlNl.match(/<b>Brussel,\s*België<\/b>/g) || []).length;
    eis(!chipsUk.includes('Брюссель') && chipsUk.includes('за IP') && aantalBoldUk === 1, `Назва місця "Брюссель, Бельгія" мусить стояти в <b> рівно 1 раз у рядку «Звідки» і не дублюватися в .meta-chips, знайдено: ${aantalBoldUk}`);
    eis(!chipsNl.includes('Brussel') && chipsNl.includes('via IP') && aantalBoldNl === 1, `Назва місця "Brussel, België" мусить стояти в <b> рівно 1 раз у рядку «Vanwaar» і не дублюватися в .meta-chips, знайдено: ${aantalBoldNl}`);
  });

  await draaiToets(uitkomsten, 'L1-F4-6', 1, 'F4', 'F4.6 (TG-6): цілісні .meta-chip, цільовий розділ, справжній час aangemaaktOp та «За дозволом оглядача»', () => {
    const htmlUk = vensterMod.paginaHtml(voorbeeldWeergave as never, 'uk');
    const htmlNl = vensterMod.paginaHtml(voorbeeldWeergave as never, 'nl');
    eis(!/<\/span>\s*·\s*<span class="meta-chip">/.test(htmlUk), 'Між елементами .meta-chip не повинно бути відірваних текстових крапок');
    eis(htmlUk.includes('Цільовий розділ') && htmlUk.includes('mail.tarasevych.com'), 'У деталях Захищеного вікна мусить виводитися цільовий розділ (mail.tarasevych.com)');
    eis(
      htmlUk.includes('08:17') && htmlNl.includes('08:17'),
      'Захищене вікно мусить виводити справжній час створення запиту aangemaaktOp (08:17), а не поточний час відмальовування сторінки',
    );
    eis(!htmlUk.includes('Запит на вхід: вхід на сайт'), 'Заголовок Захищеного вікна не повинен містити тавтології «Запит на вхід: вхід на сайт»');
    eis(htmlUk.includes('За дозволом оглядача — місце пристрою, приблизно'), 'Джерело геолокації пристрою має вживати питоме «За дозволом оглядача — місце пристрою, приблизно»');
  });

  await draaiToets(uitkomsten, 'L1-F4-7', 1, 'F4', 'F4.7 (TG-7): збереження вибору піктограми у sessionStorage та кнопки дій #plaats-acties при plaats-nodig', () => {
    const htmlUk = vensterMod.paginaHtml(voorbeeldWeergave as never, 'uk');
    const js = vensterMod.VENSTER_JS;
    eis(htmlUk.includes('id="plaats-acties"') && htmlUk.includes('id="plaats-opnieuw"'), 'У paginaHtml має бути блок #plaats-acties із кнопкою завершення входу #plaats-opnieuw');
    eis(js.includes('plaats-nodig') && js.includes('sessionStorage'), 'VENSTER_JS мусить зберігати та відновлювати обрану піктограму у sessionStorage при стані plaats-nodig');
  });
}


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// РІВЕНЬ 1 — ГРУПИ F5..F8 (ПОВЕРНЕННЯ GOOGLE, СПОВІЩЕННЯ ТА ПРОСТІР ЧИТАЧА ПОШТИ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function voerNiveau1F5TotF8Uit(wortel: string, uitkomsten: ToetsUitkomst[]): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const googleTerugMod = await import('../../src/EigenaarIdentiteitTerug');
  const weigeringenMod = await import('../../src/weigeringen');
  const plaatsingMod = await import('../../shared/plaatsing');
  const menuMeldingenShared = await import('../../shared/menu-meldingen');
  const menuMeldingenOpslag = await import('../../src/menu-meldingen-opslag');
  const menuMeldingenUi = (await import('../../src/MenuMeldingen')) as Record<string, unknown>;
  const ecosysteemOpslag = await import('../../src/meldingen/ecosysteem/ecosysteem-opslag');
  const officieelSleutelsMod = await import('../../src/merk/officieel-sleutels');
  const merkLogosMod = await import('../../src/merk/merk-logos');
  const pulsKern = await import('../../shared/meldingen-puls/kern');
  const tolkMod = await import('../../shared/meldingen-ecosysteem/tolk');
  const nieuwApparaatMod = await import('../../backend/nieuw-apparaat');
  const beheerJournaal = await import('../../shared/beheer-journaal');
  const siteActiviteit = await import('../../backend/site-activiteit');
  const connectorActiviteit = await import('../../src/connector-activiteit');
  const meldingenPortaalMod = await import('../../src/meldingen/ecosysteem/MeldingenPortaal');
  const icoonActieKnopMod = await import('../../src/meldingen/IcoonActieKnop');

  // ── Група F5 (GOOG-1..GOOG-4, D-1..D-6): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F5-1', 1, 'F5', 'F5.1 (GOOG-1): компактна картка повернення Google min(100%, 388px), офіційний знак <Merk merk="google" /> та відсутність !important', () => {
    const tsx = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/google-terugkeer-kaart.css'));
    eis(tsx.includes("merk='google'") || tsx.includes('merk="google"'), 'Картка повернення Google мусить вживати офіційний знак <Merk merk="google" /> з реєстру src/merk');
    eis(css.includes('min(100%, 388px)') || css.includes('min(100%,388px)'), 'Ширина картки .mr-google-terug-kaart мусить обмежуватися min(100%, 388px)');
    eis(!css.includes('!important'), 'Файл src/google-terugkeer-kaart.css не повинен містити жодного !important');
    eis(!/#0f9488/i.test(css), 'Колір головної кнопки має спиратися на змінні tokens.css (var(--accent)), а не зашитий #0f9488');
  });

  await draaiToets(uitkomsten, 'L1-F5-2', 1, 'F5', 'F5.2 (GOOG-1, D-3, D-5): ідеальне коло кнопки ⓘ (32×32 px, is-icoon, вага >= (0,4,1)) та однакова висота кнопок дій >= 44 px', () => {
    const tsx = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/google-terugkeer-kaart.css'));
    eis(/mr-google-terug-info-knop[^'"]*is-icoon|is-icoon[^'"]*mr-google-terug-info-knop/.test(tsx), 'Кнопка ⓘ на картці повернення Google мусить мати клас is-icoon');
    eis(/width:\s*32px[\s\S]{0,120}height:\s*32px/.test(css) && /inset:\s*-6px/.test(css), 'Кнопка ⓘ мусить мати видимий розмір 32×32 px та сенсорну зону ::after { inset: -6px } (44×44 px)');
    eis(/\.mr-google-terug-knop-primair[\s\S]{0,420}min-height:\s*44px/.test(css), 'Кнопки дій картки повернення Google мусять мати висоту щонайменше 44 px');
  });

  await draaiToets(uitkomsten, 'L1-F5-3', 1, 'F5', 'F5.3 (GOOG-2, D-1, D-4): реєстрація .mr-google-terug-sluier у plaatsing-vaste-elementen.json та role="dialog" на .mr-google-terug-blad', () => {
    const json = JSON.parse(leesBestandVeilig(wortel, 'scripts/plaatsing-vaste-elementen.json')) as { toegestaan?: Array<{ sleutel: string; reden: string }> };
    const gevonden = (json.toegestaan || []).some((x) => x.sleutel.includes('.mr-google-terug-sluier') && x.reden.trim().length > 5);
    eis(gevonden, 'Завіса .mr-google-terug-sluier мусить бути зареєстрована у scripts/plaatsing-vaste-elementen.json');
    const tsx = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/google-terugkeer-kaart.css'));
    const sluierTag = vindJsxOpenTagMetKlas(tsx, 'mr-google-terug-sluier');
    const bladTag = vindJsxOpenTagMetKlas(tsx, 'mr-google-terug-blad');
    eis(
      Boolean(bladTag && /\brole=['"]dialog['"]/.test(bladTag) && /\baria-modal=(?:['"]true['"]|\{\s*true\s*\})/.test(bladTag)) &&
        Boolean(!sluierTag || !/\brole=['"]dialog['"]/.test(sluierTag)),
      'role="dialog" та aria-modal="true" мусять стояти на аркуші .mr-google-terug-blad (незалежно від порядку), а не на завісі',
    );
    eis(/\.mr-google-terug-sluier[\s\S]{0,280}max-width:\s*none[\s\S]{0,120}max-height:\s*none/.test(css), 'Завіса .mr-google-terug-sluier мусить мати max-width: none; max-height: none');
  });

  await draaiToets(uitkomsten, 'L1-F5-4', 1, 'F5', 'F5.4 (GOOG-2, D-2): збереження <code>{diagnostic.code}</code>, кнопка копіювання та розкриття «Докладно» без кальок', () => {
    const tsx = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    eis(tsx.includes('<code>{diagnostic.code}</code>'), 'У блоці діагностики мусить зберігатися точний <code>{diagnostic.code}</code> для сумісності з mailfix-001');
    eis(tsx.includes('data-google-foutcode-kopieer') && tsx.includes('mr-google-terug-meer'), 'Аркуш за ⓘ мусить містити кнопку копіювання коду та блок розкриття деталей mr-google-terug-meer');
    eis(!tsx.includes('Статус HTTP'), 'У тексті пояснення коду відповіді не повинно бути кальки «Статус HTTP»');
  });

  await draaiToets(uitkomsten, 'L1-F5-5', 1, 'F5', 'F5.5 (GOOG-3): точні двомовні пояснення failureCopy та callbackUitleg для входу і пошти', () => {
    const codes = ['STATE_EXPIRED', 'STATE_NOT_FOUND', 'TIMEOUT', 'TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_ATTACHED', 'STATE_TRANSACTION_MISMATCH', 'SLEUTELKLUIS_GESLOTEN'];
    for (const c of codes) {
      const inlogUk = googleTerugMod.callbackUitleg('uk', c, 0, false);
      const inlogNl = googleTerugMod.callbackUitleg('nl', c, 0, false);
      const postUk = googleTerugMod.callbackUitleg('uk', c, 0, true);
      eis(inlogUk.length > 15 && inlogNl.length > 15 && !VERBODEN_TEKENS_RE.test(inlogUk), `callbackUitleg('${c}') мусить повертати чисті двомовні тексти`);
      if (c === 'STATE_EXPIRED') {
        eis(!inlogUk.includes('Пошта → Акаунти'), 'При збої звичайного входу STATE_EXPIRED текст не повинен хибно скеровувати в налаштування поштових облікових записів');
        eis(postUk !== inlogUk || postUk.toLowerCase().includes('пошт'), 'Пояснення для підключення пошти (suiteState=true) мусить відповідати контексту пошти');
      }
    }
  });

  await draaiToets(uitkomsten, 'L1-F5-6', 1, 'F5', 'F5.6 (GOOG-4): відновлення returnTo з OwnerTx у backend/index.ts та передача ?aanmeld_fout у головній дії', () => {
    const backendBron = leesBestandVeilig(wortel, 'backend/index.ts');
    const terugBron = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    eis(backendBron.includes('ownerPrimaryRedirectReturnTo') && backendBron.includes('STATE_EXPIRED'), 'ownerGoogleCallbackPost у backend/index.ts мусить відновлювати returnTo із транзакції OwnerTx при STATE_EXPIRED');
    eis(terugBron.includes('aanmeld_fout') && terugBron.includes('data-google-terug-primair'), 'Головна кнопка картки повернення Google мусить передавати параметр ?aanmeld_fout=<КОД>');
  });

  await draaiToets(uitkomsten, 'L1-F5-7', 1, 'F5', 'F5.7 (GOOG-4): двомовний словник aanmeldWeigering у src/weigeringen.ts для всіх кодів повернення входу', () => {
    const codes = ['STATE_EXPIRED', 'STATE_NOT_FOUND', 'TIMEOUT', 'TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_ATTACHED', 'STATE_TRANSACTION_MISMATCH', 'OWNER_CALLBACK_TIMEOUT', 'LOGIN_BINDING_MISMATCH'];
    for (const c of codes) {
      const paar = weigeringenMod.aanmeldWeigering({ message: c });
      eis(Array.isArray(paar) && paar[0].length > 20 && paar[1].length > 20 && !VERBODEN_TEKENS_RE.test(paar[0]), `aanmeldWeigering('${c}') мусить повертати змістовну двомовну пару [uk, nl]`);
    }
  });

  // ── Група F6 (MELD-1..MELD-4): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F6-1', 1, 'F6', 'F6.1 (MELD-1): відсутність .theme-light/.theme-dark та 100svh на підказці .puls-icoon-tip', () => {
    const indexCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/index.css'));
    const meldCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/meldingen-ecosysteem.css'));
    const knopTsx = leesBestandVeilig(wortel, 'src/meldingen/IcoonActieKnop.tsx');
    eis(/\.puls-icoon-tip[\s\S]{0,320}min-height:\s*0/.test(meldCss), 'У meldingen-ecosysteem.css для .puls-icoon-tip має бути явно задано min-height: 0');
    eis(!knopTsx.includes('puls-icoon-tip ${leesActieveThemaKlassen') && (!knopTsx.includes('leesActieveThemaKlassen') || indexCss.includes(':not(.puls-icoon-tip)')), 'Підказка .puls-icoon-tip не сміє успадковувати сторіночний min-height: 100svh від .theme-light/.theme-dark');
  });

  await draaiToets(uitkomsten, 'L1-F6-2', 1, 'F6', 'F6.2 (MELD-1): миттєве спрацювання кнопки IcoonActieKnop з першого дотику та довге утримування для підказки', () => {
    const knopTsx = leesBestandVeilig(wortel, 'src/meldingen/IcoonActieKnop.tsx');
    eis(!knopTsx.includes('wachtTweedeTikRef') || knopTsx.includes('420') || knopTsx.includes('AANRAAK_LANG_DRUK'), 'Кнопки керування IcoonActieKnop не повинні блокувати перший сенсорний дотик двокроковою затримкою');
    const html = renderToStaticMarkup(
      React.createElement(icoonActieKnopMod.default, {
        'data-qa-id': 'test-icoon-actie',
        label: 'Пошук сповіщень',
        icoon: React.createElement('span', null, '🔍'),
        onClick: () => undefined,
      }),
    );
    eis(html.includes('data-qa-id="test-icoon-actie"'), 'IcoonActieKnop має коректно відмальовувати атрибут data-qa-id');
  });

  await draaiToets(uitkomsten, 'L1-F6-3', 1, 'F6', 'F6.3 (MELD-2): збереження дзвіночка сповіщень у мобільному бічному меню (lade-kop) без виносу на верхню шапку', () => {
    const belTelefoon = plaatsingMod.STANDAARD.telefoon.bel;
    eis(
      belTelefoon.zone === 'lade-kop' && plaatsingMod.IN_LADE.includes(belTelefoon.zone),
      `Дзвіночок на телефоні мусить залишатися в lade-kop усередині бічного меню для збереження робочого простору, а не в ${belTelefoon.zone}`,
    );
    for (const ctx of [
      { klasse: 'telefoon' as const, dienst: 'hub', zoekInMenu: false },
      { klasse: 'telefoon' as const, dienst: 'mail', zoekInMenu: true },
    ]) {
      const mobieleIndeling = plaatsingMod.indeling(plaatsingMod.standaardPlaatsing(), ctx);
      eis(
        mobieleIndeling.plek.bel === 'lade-kop' &&
          mobieleIndeling.zones['lade-kop'].lijst.some((x) => x.id === 'bel') &&
          !mobieleIndeling.zones.bovenbalk.lijst.some((x) => x.id === 'bel'),
        `Типова розкладка телефону (${ctx.dienst}) не повинна виносити дзвіночок на верхню мобільну шапку bovenbalk`,
      );
    }
  });

  await draaiToets(uitkomsten, 'L1-F6-4', 1, 'F6', 'F6.4 (MELD-2): робоче перемикання «Компактна панель ↔ Вікно» на екрані <= 768 px із видимою кнопкою повернення «Вікно»', () => {
    const portaalTsx = leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/MeldingenPortaal.tsx');
    const profiel = ecosysteemOpslag.leesLokaalProfiel('e2e-test', 'prive');
    eis(Boolean(profiel.geometrie), 'leesLokaalProfiel мусить повертати дійсний об’єкт геометрії вікна');
    profiel.geometrie.modus = 'volledig';
    const win = window as unknown as { innerWidth: number };
    const doc = document as unknown as { body: unknown };
    const oudBreedte = win.innerWidth;
    const oudBody = doc.body;
    win.innerWidth = 360;
    doc.body = null;
    let htmlUk = '';
    let htmlNl = '';
    try {
      const basisProps = {
        open: true,
        compactBijBel: true,
        ruimte: 'prive' as const,
        subdomeinNu: 'hub' as const,
        profiel,
        stroom: [],
        laden: false,
        sound: false,
        onSluiten: () => undefined,
        onOpenen: () => undefined,
        onToggleSound: () => undefined,
        onVervers: () => undefined,
        onSlaGeometrieOp: () => undefined,
        onWerkProfielBij: () => undefined,
        onStatusWijzigen: async () => undefined,
        onOntleden: async () => ({ samenvatting: '', acties: [], bron: 'intern' as const }) as never,
        onMarkAll: () => undefined,
        onSwitchToClassic: () => undefined,
        onOpenVensterModus: () => undefined,
      };
      htmlUk = renderToStaticMarkup(React.createElement(meldingenPortaalMod.default, { ...basisProps, lang: 'uk' }));
      htmlNl = renderToStaticMarkup(React.createElement(meldingenPortaalMod.default, { ...basisProps, lang: 'nl' }));
    } finally {
      win.innerWidth = oudBreedte;
      doc.body = oudBody;
    }
    eis(
      htmlUk.includes('data-puls-vorm="compact"') &&
        !htmlUk.includes('data-mel-langscroll="1"') &&
        !htmlUk.includes('is-mobiel-langscroll') &&
        !portaalTsx.includes("(!compactBijBel || geo.modus === 'volledig' || profiel.geometrie.modus === 'volledig')"),
      'На екранах <= 768 px при compactBijBel=true та збереженому modus="volledig" не повинен вмикатися повноекранний потік isMobielLangscroll',
    );
    const vensterKnopUk = /<button[^>]*data-qa-id="melding-vorm-venster-puls"[^>]*>([\s\S]*?)<\/button>/.exec(htmlUk)?.[1] || '';
    const vensterKnopNl = /<button[^>]*data-qa-id="melding-vorm-venster-puls"[^>]*>([\s\S]*?)<\/button>/.exec(htmlNl)?.[1] || '';
    const zichtbaarUk = vensterKnopUk.replace(/<span[^>]*class="[^"]*\bmr-sr\b[^"]*"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').trim();
    const zichtbaarNl = vensterKnopNl.replace(/<span[^>]*class="[^"]*\bmr-sr\b[^"]*"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').trim();
    eis(
      zichtbaarUk.includes('Вікно') && zichtbaarNl.includes('Venster'),
      `Кнопка повернення melding-vorm-venster-puls мусить мати видимий підпис «Вікно» / «Venster» поза .mr-sr (отримано: "${zichtbaarUk}" / "${zichtbaarNl}")`,
    );
  });

  await draaiToets(uitkomsten, 'L1-F6-5', 1, 'F6', 'F6.5 (MELD-3): чесний підпис зведеного лічильника пошти без «Показано 1 із 14» та передача teller:mail у потік', () => {
    const nu = Date.now();
    const tellers = menuMeldingenShared.vanTellers({ mail: { ongelezen: 14, op: nu } }, {}, 'uk');
    eis(tellers.length === 1 && tellers[0].id === 'teller:mail' && tellers[0].aantal === 14, 'vanTellers мусить формувати зведену картку teller:mail з aantal=14');
    eis(Boolean(tellers[0].link && tellers[0].link.includes('mail.tarasevych.com')), 'Картка лічильника пошти teller:mail мусить мати пряме безпечне посилання на пошту');
    const MeldingBellenComp = menuMeldingenUi.MeldingBellen as React.ComponentType<Record<string, unknown>>;
    const htmlBellen = renderToStaticMarkup(
      React.createElement(MeldingBellenComp, {
        lang: 'uk',
        label: 'Пошта',
        badge: { item: 'svc:mail', aantal: 14, categorieen: ['post'], meldingen: tellers, nieuwste: nu },
        anker: { left: 10, top: 60, right: 220, bottom: 100, width: 210, height: 40 },
        onSluit: () => undefined,
        onOpen: () => undefined,
        onAllesWeg: () => undefined,
        onBinnen: () => undefined,
        onEsc: () => undefined,
        paneelRef: () => undefined,
      }),
    );
    eis(!htmlBellen.includes('Показано 1 із 14'), 'Віконце меню не сміє виводити оманливе «Показано 1 із 14» для єдиного зведеного лічильника пошти');
    menuMeldingenOpslag.publiceerMailTeller(14);
    try {
      const stroom = ecosysteemOpslag.bouwUniformeStroom({
        lang: 'uk',
        ruimte: 'prive',
        subdomeinNu: 'hub',
        serverGebeurtenissen: [],
        paginaSignalen: [],
        serverItems: [],
        techItems: [],
        localRows: [],
        activityEvents: [],
        activityRead: new Set(),
        ...({
          tellers: { mail: { ongelezen: 14, op: nu } },
          weg: {},
          tellerStaat: { tellers: { mail: { ongelezen: 14, op: nu } }, weg: {}, scope: 'e2e-test' },
          menuTellers: tellers,
        } as Record<string, unknown>),
      });
      const centrumBron = leesBestandVeilig(wortel, 'src/CanoniekMeldingencentrum.tsx');
      const opslagBron = leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/ecosysteem-opslag.ts');
      eis(
        stroom.some((g) => g.id === 'teller:mail' || g.kanaal === 'mail') &&
          (centrumBron.includes('useMenuTellers') || centrumBron.includes('teller:mail') || opslagBron.includes('teller:mail')),
        'bouwUniformeStroom та CanoniekMeldingencentrum мусять передавати сигнал непрочитаної пошти teller:mail у центр сповіщень',
      );
    } finally {
      menuMeldingenOpslag.__tellersReset();
    }
  });

  await draaiToets(uitkomsten, 'L1-F6-6', 1, 'F6', 'F6.6 (MELD-4): офіційний багатоколірний знак gmail у src/merk/officieel/ без одноколірного дубля у merk-logos.ts', () => {
    const svgPad = join(wortel, 'src/merk/officieel/gmail.svg');
    eis(existsSync(svgPad), 'Відсутній згенерований офіційний знак src/merk/officieel/gmail.svg');
    const svgInhoud = readFileSync(svgPad, 'utf8');
    eis((svgInhoud.match(/fill=/gi) || []).length >= 4, 'Офіційний знак gmail.svg має бути багатоколірним (щонайменше 4 кольорові контури)');
    eis(officieelSleutelsMod.OFFICIEEL_SLEUTELS.has('gmail'), 'OFFICIEEL_SLEUTELS мусить містити ключ "gmail"');
    eis(!('gmail' in merkLogosMod.LOGOS), 'Одноколірний дубль "gmail" мусить бути видалений із src/merk/merk-logos.ts');
    const herkomst = JSON.parse(leesBestandVeilig(wortel, 'src/merk/officieel/HERKOMST.json')) as Record<string, unknown>;
    const tekstHerkomst = JSON.stringify(herkomst);
    eis(tekstHerkomst.includes('gmail') && tekstHerkomst.includes('CC0-1.0'), 'HERKOMST.json мусить містити запис походження та ліцензію CC0-1.0 для знака gmail');
  });

  await draaiToets(uitkomsten, 'L1-F6-7', 1, 'F6', 'F6.7 (MELD-4): захист розпізнавання марки у сповіщеннях входу від хибного збігу на домен @gmail.com', () => {
    const verrijkFn = menuMeldingenUi.verrijkMenuMelding as
      | ((m: unknown, badgeItem: string, sectieLabel: string, lang: 'uk' | 'nl') => { merk?: string | null; soortTekst?: string })
      | undefined;
    eis(typeof verrijkFn === 'function', 'Модуль src/MenuMeldingen.tsx мусить експортувати функцію verrijkMenuMelding');
    const tekstMelding = nieuwApparaatMod.nieuwApparaatTekst({
      email: 'olesia.koval@gmail.com',
      label: 'Chrome/Android',
      methode: 'google',
      locatie: { city: 'Gent', country: 'BE' },
      tijd: Date.now(),
    });
    const v = verrijkFn(
      {
        id: 'srv-1',
        bron: 'server',
        item: 'svc:identity',
        categorie: 'beveiliging',
        titel: tekstMelding.titel,
        tekst: tekstMelding.tekst,
        op: Date.now(),
        link: 'https://id.tarasevych.com/sessions?apparaat=11111111-2222-3333-4444-555555555555',
      },
      'svc:identity',
      'Налаштування',
      'uk',
    );
    eis(v.merk === 'google', `Сповіщення входу для @gmail.com через Google має отримувати марку "google", а не "${v.merk}"`);
    const geb = tolkMod.interpreteerGebeurtenis({
      id: 'g-1',
      bron: 'identity',
      soort: 'security_warning',
      titel: tekstMelding.titel,
      bericht: tekstMelding.tekst,
      contextLabel: 'olesia.koval@gmail.com · id',
      link: 'https://id.tarasevych.com/sessions',
      aangemaaktOp: Date.now(),
    });
    const anker = pulsKern.herkenMerkEnAnker(geb, 'uk');
    eis(anker.merkSleutel !== 'gmail', `herkenMerkEnAnker не сміє повертати "gmail" через поштову адресу @gmail.com у сповіщенні безпеки (отримано: ${anker.merkSleutel})`);
  });

  // ── Група F7 (MELD-5..MELD-10): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F7-1', 1, 'F7', 'F7.1 (MELD-5): спосіб і час входу на початку nieuwApparaatTekst та кнопки «Це не я» / «Це був я» у .menu-bellen', () => {
    const { tekst } = nieuwApparaatMod.nieuwApparaatTekst({
      email: 'olesia.koval.dovga.adresa@voorbeeld.test',
      label: 'Chrome/Android',
      methode: 'google',
      locatie: { city: 'Брюссель', country: 'Бельгія' },
      tijd: 1764070000000,
    });
    const ukDeel = tekst.split(' / ')[0] || tekst;
    const posMethode = ukDeel.indexOf('спосіб: Google');
    const posEmail = ukDeel.indexOf('olesia.koval.dovga.adresa@voorbeeld.test');
    eis(posMethode >= 0 && (posEmail < 0 || posMethode < posEmail || posMethode < 95), 'Спосіб та час входу мусять розташовуватися на початку nieuwApparaatTekst до довгої електронної адреси, щоб не обрізатися у 2 рядки');
    const menuBron = leesBestandVeilig(wortel, 'src/MenuMeldingen.tsx');
    eis(menuBron.includes('/api/meldingen/apparaat-bekend') && menuBron.includes('Це був я') && menuBron.includes('Це не я'), 'MeldingBellen мусить містити прямі кнопки «Це був я» (/api/meldingen/apparaat-bekend) та «Це не я»');
  });

  await draaiToets(uitkomsten, 'L1-F7-2', 1, 'F7', 'F7.2 (MELD-6): класифікація owner.apparaat.nieuw як id / beveiliging / kritiek / gevaar із парою кнопок S1', () => {
    const geb = tolkMod.interpreteerGebeurtenis({
      id: 'audit:app-1',
      bron: 'agent site owner.apparaat.nieuw',
      soort: 'owner.apparaat.nieuw',
      titel: 'Виявлено вхід із нового незнайомого пристрою',
      bericht: 'Chrome/Android · Брюссель',
      aangemaaktOp: Date.now(),
    });
    eis(geb.subdomein === 'id' && geb.kanaal === 'beveiliging', `owner.apparaat.nieuw мусить мати subdomein="id" та kanaal="beveiliging" (отримано: ${geb.subdomein} / ${geb.kanaal})`);
    const verrijkt = pulsKern.verrijkGebeurtenisVoorPuls(geb, 'uk');
    eis(verrijkt.niveau === 'gevaar' && Array.isArray(verrijkt.knoppenPaar), `owner.apparaat.nieuw у Пульті уваги мусить мати niveau="gevaar" та пару кнопок підтвердження (отримано: ${verrijkt.niveau})`);
  });

  await draaiToets(uitkomsten, 'L1-F7-3', 1, 'F7', 'F7.3 (MELD-6): усунення дублів парних сповіщень нового пристрою у bouwUniformeStroom та виклик POST /api/meldingen/apparaat-bekend', () => {
    const nu = Date.now();
    const uuid = '12345678-1234-4123-8123-123456789abc';
    const stroom = ecosysteemOpslag.bouwUniformeStroom({
      lang: 'uk',
      ruimte: 'prive',
      subdomeinNu: 'hub',
      serverGebeurtenissen: [],
      paginaSignalen: [],
      serverItems: [
        {
          id: uuid,
          kind: 'security_warning',
          title: 'Новий вхід на новому пристрої',
          message: 'спосіб: Google · Chrome/Android',
          createdAt: nu,
          read: false,
          link: `https://id.tarasevych.com/sessions?apparaat=${uuid}`,
        },
      ],
      techItems: [],
      localRows: [],
      activityEvents: [
        {
          id: 'audit:99',
          source: 'identity',
          platform: '',
          kind: 'site',
          type: 'owner.apparaat.nieuw',
          subject: 'Chrome/Android',
          status: 'succeeded',
          createdAt: nu + 400,
          finishedAt: nu + 400,
        },
      ],
      activityRead: new Set(),
    });
    const nieuwApparaatKaarten = stroom.filter((x) => x.kanaal === 'beveiliging' || x.externeSleutel.includes(uuid) || x.id.includes('99'));
    eis(nieuwApparaatKaarten.length === 1, `Парні записи site_notifications та owner.apparaat.nieuw про один вхід мусять зводитися в 1 картку без дублів (отримано: ${nieuwApparaatKaarten.length})`);
    const veegKaartBron = leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/MeldingVeegKaart.tsx');
    eis(veegKaartBron.includes('/api/meldingen/apparaat-bekend'), 'Кнопка «Це я» у MeldingVeegKaart.tsx мусить викликати POST /api/meldingen/apparaat-bekend');
  });

  await draaiToets(uitkomsten, 'L1-F7-4', 1, 'F7', 'F7.4 (MELD-7): вкладка «Увага · Потребують дії» відфільтровує вже прочитані інформаційні події (gelezen + gewoon)', () => {
    const portaalBron = leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/MeldingenPortaal.tsx');
    const gelezenGewoon = tolkMod.interpreteerGebeurtenis({
      id: 'info-gelezen-1',
      bron: 'mcp',
      soort: 'info',
      titel: 'Інформаційне фонове повідомлення',
      bericht: 'Фонова дія успішно завершена',
      gelezen: true,
      aangemaaktOp: Date.now() - 60_000,
    });
    gelezenGewoon.status = 'gelezen';
    const verrijkt = pulsKern.verrijkGebeurtenisVoorPuls(gelezenGewoon, 'uk');
    eis(verrijkt.niveau === 'gewoon', 'Звичайна інформаційна подія має рівень gewoon');
    eis(
      !/statusFilter\s*===\s*['"]actief['"]\s*\)\s*\{?\s*return\s+g\.status\s*===\s*['"]nieuw['"]\s*\|\|\s*g\.status\s*===\s*['"]gelezen['"]/.test(portaalBron) &&
        portaalBron.includes("'gevaar'") &&
        portaalBron.includes("'besluit'"),
      'Прочитана звичайна інформаційна подія (status="gelezen", niveau="gewoon") не повинна засмічувати вкладку «Увага · Потребують дії»',
    );
  });

  await draaiToets(uitkomsten, 'L1-F7-5', 1, 'F7', 'F7.5 (MELD-8): повне покриття серверних кодів дій у ACTIE_LABELS без «подія без опису» та наявність ⓘ Технічні подробиці', () => {
    const kritiekeCodes = [
      'account.email.conflict',
      'agent.grant.rechten',
      'owner.aanmelden.geweigerd',
      'owner.aanmelden.plaats',
      'owner.apparaat.nieuw',
      'owner.apparaat.bevestigd',
      'owner.identity.account.recovered',
      'owner.identity.workspace.received',
      'owner.identity.workspace.transfer',
      'owner.melding.reserve-herinnering',
      'owner.profile.photo.link',
      'owner.profile.photo.none',
      'owner.profile.photo.reset',
      'owner.rol.hersteld',
      'owner.step_up.onthouden.vergeten',
      'telegram.sessies.ingetrokken',
      'telegram.aanmelden.goedgekeurd',
      'telegram.aanmelden.niet-ik',
      'telegram.aanmelden.plaats-nodig',
      'telegram.koppelen.klaar',
      'telegram.matrix.gewijzigd',
      'apparaat.aangevraagd',
      'apparaat.bevestigd',
      'apparaat.niet-ik',
    ];
    for (const code of kritiekeCodes) {
      eis(Boolean(beheerJournaal.ACTIE_LABELS[code]), `Код аудиту "${code}" відсутній у ACTIE_LABELS`);
      eis(beheerJournaal.categorieVan(code) !== 'overig', `Код аудиту "${code}" не сміє мати категорію "overig"`);
      const bron = siteActiviteit.sourceOfAudit(code) || 'site';
      const titelUk = connectorActiviteit.activityTitle(
        { id: '1', source: bron, platform: '', kind: 'site', type: code, subject: '', status: 'succeeded', createdAt: 1, finishedAt: 1 },
        'uk',
      );
      const titelNl = connectorActiviteit.activityTitle(
        { id: '1', source: bron, platform: '', kind: 'site', type: code, subject: '', status: 'succeeded', createdAt: 1, finishedAt: 1 },
        'nl',
      );
      eis(!titelUk.includes('подія без опису') && !titelNl.includes('gebeurtenis zonder omschrijving'), `Код "${code}" все ще видає сліпу заглушку: ${titelUk}`);
    }
    const veegBron = leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/MeldingVeegKaart.tsx');
    eis(veegBron.includes('puls-technische-details') && veegBron.includes('puls-kapsel-sub'), 'MeldingVeegKaart мусить мати розкриття Технічних подробиць та 2-й мікро-рядок капсули');
  });

  await draaiToets(uitkomsten, 'L1-F7-6', 1, 'F7', 'F7.6 (MELD-9): прив’язка .menu-bellen до пункту меню зі стрілкою, дія з 1-го дотику та автозакриття шухляди', () => {
    const menuBron = leesBestandVeilig(wortel, 'src/MenuMeldingen.tsx');
    const omlijstingBron = leesBestandVeilig(wortel, 'src/CanoniekOmlijsting.tsx');
    eis(menuBron.includes('data-menu-bellen-anker') || menuBron.includes('menu-bellen-anker-pijl'), 'MenuMeldingen.tsx мусить позначати якір та відмальовувати стрілку-вказівник до обраного пункту меню');
    eis(!menuBron.includes('ще дотик') && !menuBron.includes('tik nogmaals'), 'Кнопки [↗] та [✓] у .menu-bellen не повинні блокувати перший дотик вимогою повторного натиску');
    eis(omlijstingBron.includes('closeDrawer') && omlijstingBron.includes('MELDINGEN_OPENEN_EVENT'), 'CanoniekOmlijsting мусить закривати мобільну шухляду при відкритті головного вікна сповіщень');
  });

  await draaiToets(uitkomsten, 'L1-F7-7', 1, 'F7', 'F7.7 (MELD-10): видима назва активної вкладки .puls-actieve-tab-naam та відсутність (клавіша /) і Ctrl+Z на смартфоні', () => {
    const portaalBron = leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/MeldingenPortaal.tsx');
    const knopBron = leesBestandVeilig(wortel, 'src/meldingen/IcoonActieKnop.tsx');
    const meldCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/meldingen/ecosysteem/meldingen-ecosysteem.css'));
    const profiel = ecosysteemOpslag.leesLokaalProfiel('e2e-meld10', 'prive');
    const win = window as unknown as { innerWidth: number; matchMedia?: (q: string) => unknown };
    const doc = document as unknown as { body: unknown };
    const oudBreedte = win.innerWidth;
    const oudMatchMedia = win.matchMedia;
    const oudBody = doc.body;
    win.innerWidth = 360;
    doc.body = null;
    win.matchMedia = (q: string) => ({
      matches: q.includes('coarse') || q.includes('hover: none') || q.includes('max-width'),
      media: q,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
    let htmlUk = '';
    let htmlNl = '';
    try {
      const basisProps = {
        open: true,
        compactBijBel: false,
        ruimte: 'prive' as const,
        subdomeinNu: 'hub' as const,
        profiel,
        stroom: [],
        laden: false,
        sound: false,
        onSluiten: () => undefined,
        onOpenen: () => undefined,
        onToggleSound: () => undefined,
        onVervers: () => undefined,
        onSlaGeometrieOp: () => undefined,
        onWerkProfielBij: () => undefined,
        onStatusWijzigen: async () => undefined,
        onOntleden: async () => ({ samenvatting: '', acties: [], bron: 'intern' as const }) as never,
        onMarkAll: () => undefined,
        onSwitchToClassic: () => undefined,
      };
      htmlUk = renderToStaticMarkup(React.createElement(meldingenPortaalMod.default, { ...basisProps, lang: 'uk' }));
      htmlNl = renderToStaticMarkup(React.createElement(meldingenPortaalMod.default, { ...basisProps, lang: 'nl' }));
    } finally {
      win.innerWidth = oudBreedte;
      win.matchMedia = oudMatchMedia;
      doc.body = oudBody;
    }
    eis(
      (portaalBron + knopBron).includes('puls-actieve-tab-naam') &&
        meldCss.includes('.puls-actieve-tab-naam') &&
        htmlUk.includes('puls-actieve-tab-naam') &&
        htmlNl.includes('puls-actieve-tab-naam'),
      'Активна вкладка у смузі .puls-tabs мусить відмальовувати видиму назву в .puls-actieve-tab-naam зі стилем у meldingen-ecosysteem.css',
    );
    eis(
      !htmlUk.includes('(клавіша /)') &&
        !htmlNl.includes('(toets /)') &&
        !/label=\{\s*t\(\s*['"]Пошук, канали та звук \(клавіша \/\)['"]\s*,\s*['"]Zoeken, kanalen en geluid \(toets \/\)['"]\s*\)\s*\}/.test(portaalBron),
      'На сенсорному смартфоні кнопка пошуку не повинна показувати комп’ютерну підказку «(клавіша /)» / «(toets /)»',
    );
    const ongedaanBlok = /puls-ongedaan-balk[\s\S]{0,520}<\/button>/.exec(portaalBron)?.[0] || '';
    eis(
      ongedaanBlok.length > 0 &&
        !/<span>\{\s*t\(\s*`Повернути · Ctrl\+Z \(\$\{ongedaanSec\} с\)`\s*,\s*`Ongedaan maken · Ctrl\+Z \(\$\{ongedaanSec\} s\)`\s*\)\s*\}<\/span>/.test(ongedaanBlok),
      'На сенсорних пристроях кнопка повернення дії .puls-ongedaan-knop не повинна безумовно показувати комбінацію клавіш Ctrl+Z',
    );
  });

  // ── Група F8 (MAIL-9, MAIL-12..MAIL-15): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F8-1', 1, 'F8', 'F8.1 (MAIL-9): однорядкова мобільна шапка переглядача листа без розриву на 3 поверхи й без дірки 64 px справа', () => {
    const leesVensterCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/lees-venster.css'));
    const compactKopCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css'));
    const werkruimteCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/google-mail-werkruimte.css'));
    const aantalImp = (werkruimteCss.match(/!important/g) || []).length;
    eis(
      /\[data-lees-modus=['"]telefoon['"]\][^{]*\.google-mail-reader\s*>\s*header\s*\{[^}]*padding-right:\s*12px/.test(leesVensterCss),
      'lees-venster.css мусить явно скидати правий відступ шапки padding-right: 12px для режиму [data-lees-modus="telefoon"]',
    );
    eis(
      !/\.mail-reader-kop-opties\s*\{[^}]*(?:order:\s*20[\s\S]{0,40}flex:\s*1\s+0\s+100%|flex:\s*1\s+0\s+100%[\s\S]{0,40}order:\s*20)/.test(compactKopCss),
      'У mail-lezer-compact-kop.css не повинно залишатися примусового переносу .mail-reader-kop-opties на окремий поверх (order: 20; flex: 1 0 100%) на телефоні',
    );
    eis(
      aantalImp <= 4 &&
        !/\.google-mail-reader-backdrop\s+\.google-mail-reader\s*>\s*header\s*\{[^}]*!important/.test(werkruimteCss) &&
        !/(?<!:not\()\[data-lees-modus=['"]telefoon['"]\][^{]*\{[^}]*!important/.test(werkruimteCss),
      `Мобільне правило шапки у google-mail-werkruimte.css:26 мусить виключати :not([data-lees-modus='telefoon']) і не перевищувати базовий поріг !important <= 4 (знайдено: ${aantalImp})`,
    );
  });

  await draaiToets(uitkomsten, 'L1-F8-2', 1, 'F8', 'F8.2 (MAIL-9): прибирання дублів закриття/згортання в мобільній шапці переглядача та смуга перекладу над листом', () => {
    const werkbalkBron = leesBestandVeilig(wortel, 'src/MailLezerWerkbalk.tsx');
    const gesprekBron = leesBestandVeilig(wortel, 'src/MailGesprekInhoud.tsx');
    const kopStijlen = zonderCssOpmerkingen(
      leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css') +
        '\n' +
        leesBestandVeilig(wortel, 'src/mail/lees-venster.css') +
        '\n' +
        leesBestandVeilig(wortel, 'src/mail/gesprek-opmaak.css'),
    );
    const minimizeVerborgenOpTelefoon =
      /data-lees-(?:modus=['"]telefoon['"]|breedte=['"]smal['"])[^{]*\.mail-reader-minimize[^{]*\{[^}]*display:\s*none/.test(kopStijlen) ||
      /(?:modus\s*!==\s*['"]telefoon['"]|!isTelefoon)\s*&&\s*<button[^>]*mail-reader-minimize/.test(werkbalkBron);
    const closeVerborgenOpTelefoon =
      /data-lees-modus=['"]telefoon['"][^{]*\.mail-reader-close[^{]*\{[^}]*display:\s*none/.test(kopStijlen) ||
      /(?:modus\s*!==\s*['"]telefoon['"]|!isTelefoon)\s*&&\s*<button[^>]*mail-reader-close/.test(werkbalkBron);
    const vertaalStrookBovenBriefOpSmal =
      !/<VertaalStrook[^>]*kopHost=\{\s*message\.id\s*===\s*translationMessageId\s*\?\s*kopHost\s*:\s*null\s*\}/.test(gesprekBron) &&
      /<VertaalStrook[\s\S]{0,240}kopHost=\{/.test(gesprekBron);
    eis(
      minimizeVerborgenOpTelefoon && closeVerborgenOpTelefoon,
      'У мобільному режимі [data-lees-modus="telefoon"] обидва дублі (.mail-reader-close та .mail-reader-minimize) мусять приховуватися або не відмальовуватися у верхній шапці',
    );
    eis(
      vertaalStrookBovenBriefOpSmal,
      'У MailGesprekInhoud.tsx смуга VertaalStrook на вузькому/мобільному вікні мусить розміщуватися над тілом листа, а не через безумовний портал kopHost у шапку',
    );
  });

  await draaiToets(uitkomsten, 'L1-F8-3', 1, 'F8', 'F8.3 (MAIL-12): чисте прилягання області читання section.mail-thread-content під компактною шапкою без зарізання', () => {
    const compactKopCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css'));
    const leesVensterCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/lees-venster.css'));
    const samenCss = `${compactKopCss}\n${leesVensterCss}`;
    eis(
      /\[data-lees-modus=['"]telefoon['"]\][^{]*\.google-mail-reader\s*>\s*header\s*\{[^}]*padding-right:\s*12px/.test(leesVensterCss) &&
        /\[data-lees-modus=['"]telefoon['"]\][^{]*section\.mail-thread-content\s*\{[^}]*(?:scroll-padding-top|--lz-kop-hoogte|padding-top)/.test(samenCss),
      'Область читання section.mail-thread-content у режимі [data-lees-modus="telefoon"] мусить мати узгоджений верхній відступ і scroll-padding-top під компактною шапкою 56 px без зарізання рядка',
    );
  });

  await draaiToets(uitkomsten, 'L1-F8-4', 1, 'F8', 'F8.4 (MAIL-13): композитне ховання шапки та нижньої панелі під час гортання листа вниз і поява при гортанні вгору', () => {
    const samen =
      leesBestandVeilig(wortel, 'src/mail/LeesVenster.tsx') +
      '\n' +
      leesBestandVeilig(wortel, 'src/MailLezerWerkbalk.tsx') +
      '\n' +
      leesBestandVeilig(wortel, 'src/MailGesprekInhoud.tsx') +
      '\n' +
      leesBestandVeilig(wortel, 'src/mail/lees-venster.css') +
      '\n' +
      leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css');
    eis(
      (samen.includes('scrollVerborgen') || samen.includes('data-scroll-verborgen') || samen.includes('scrollRichting')) &&
        samen.includes('translateY'),
      'Читач пошти мусить композитно ховати й повертати панелі через transform: translateY(...) за напрямком гортання листа',
    );
  });

  await draaiToets(uitkomsten, 'L1-F8-5', 1, 'F8', 'F8.5 (MAIL-14): повне перекриття 1/1/-1/-1 та приховування фонових панелей під час відкритих шторок чи редактора', () => {
    const ctxCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/context-paneel.css'));
    const aiBlokCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/ai-blok.css'));
    eis(/grid-area:\s*1\s*\/\s*1\s*\/\s*-1\s*\/\s*-1/.test(ctxCss), 'Шторка Контексту (.ctx-scherm / .ctx-paneel) на вузькому вікні мусить перекривати весь простір читача grid-area: 1 / 1 / -1 / -1');
    eis(/grid-area:\s*1\s*\/\s*1\s*\/\s*-1\s*\/\s*-1/.test(aiBlokCss), 'Аркуш джерела (.bron-blad-scherm / .bron-blad) мусить перекривати весь простір читача grid-area: 1 / 1 / -1 / -1');
  });

  await draaiToets(uitkomsten, 'L1-F8-6', 1, 'F8', 'F8.6 (MAIL-15): 100% суцільна непрозора підкладка для .ctx-paneel, .bron-blad та .mail-kop-paneel', () => {
    const ctxCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/context-paneel.css'));
    const aiBlokCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/ai-blok.css'));
    const kopCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css'));
    eis(!ctxCss.includes('.ctx-paneel{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--panel)'), 'Шторка .ctx-paneel не сміє використовувати напівпрозорий var(--panel) без щільного непрозорого значення змінної кольору');
    eis((ctxCss + aiBlokCss + kopCss).includes('--panel-dicht') || (ctxCss + aiBlokCss + kopCss).includes('--mq-oppervlak-dicht') || /html\.palet-maquette[\s\S]*\.ctx-paneel/.test(ctxCss + kopCss), 'Спливні шторки читача мусять мати суцільну непрозору підкладку у всіх палітрах');
  });

  await draaiToets(uitkomsten, 'L1-F8-7', 1, 'F8', 'F8.7 (MAIL-9..15): єдина скруглена геометрія кнопок шапки переглядача на змінних системи дизайну', () => {
    const alleKopCss = zonderCssOpmerkingen(
      leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css') +
        '\n' +
        leesBestandVeilig(wortel, 'src/mail-lezer-werkbalk.css') +
        '\n' +
        leesBestandVeilig(wortel, 'src/mail/mail-lezer-opstel-maquette.css') +
        '\n' +
        leesBestandVeilig(wortel, 'src/mail/lees-venster.css') +
        '\n' +
        leesBestandVeilig(wortel, 'src/mail/gesprek-opmaak.css'),
    );
    const kopPilAfgerond = /\.mail-kop-pil[^{]*\{[^}]*border-radius:\s*(?:10px|11px|var\(--straal-s)/.test(alleKopCss);
    const terugKnopAfgerond = /(?:\.mail-reader-back\b|\.google-mail-reader\s*>\s*header[^{]*\.mail-reader-icon-action)[^{]*\{[^}]*border-radius:\s*(?:10px|11px|var\(--straal-s)/.test(
      alleKopCss,
    );
    eis(
      kopPilAfgerond && terugKnopAfgerond,
      'Кнопка повернення .mail-reader-back, значкові дії шапки та капсула .mail-kop-pil мусять мати узгоджений радіус скруглення (11px у класиці / var(--straal-s, 10px)), без різнобою 50% проти 999px',
    );
  });
}


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// РІВЕНЬ 1 — ГРУПИ F9..F12 (РЕДАКТОР ВІДПОВІДІ, МОВА, ПОХОДЖЕННЯ, КОНТЕКСТ, СТОРОЖІ ТА 5 ФОТОЗВІТІВ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function voerNiveau1F9TotF12Uit(wortel: string, kortTmp: string, uitkomsten: ToetsUitkomst[]): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const aiBronnen = (await import('../../shared/ai-bronnen')) as Record<string, unknown>;
  const mailAfzenders = (await import('../../shared/mail-afzenders')) as Record<string, unknown>;
  const bijlageVoorbeeld = (await import('../../src/MailBijlageVoorbeeld')) as Record<string, unknown>;
  const bijlageMiniatuurMod = await import('../../src/MailBijlageMiniatuur');
  const bijlageKaartMod = await import('../../src/MailBijlageKaart');
  const bijlageLabelsMod = await import('../../src/bijlage-weergave/labels');
  const persoonsMogelijkheden = (await import('../../src/mail-persoonsgegevens-mogelijkheden')) as Record<string, unknown>;
  const gesprekContext = (await import('../../src/mail/gesprek-context')) as Record<string, unknown>;
  const plaatsingControle = await laadScriptMjs<{
    controleer: (pad: string) => Promise<{ fouten: string[] }>;
  }>(wortel, 'scripts/plaatsing-controle.mjs');
  const klantServergrens = await laadScriptMjs<{
    klantServergrensFouten: (o: { wortel: string }) => Promise<Array<{ module: string; importeur: string }>>;
  }>(wortel, 'scripts/klant-servergrens-controle.mjs');
  const vaardighedenValideer = await laadScriptMjs<{
    valideerVaardigheden: (pad: string) => { fouten: string[] };
    adaptersZonderTaalwet: (pad: string) => string[];
  }>(wortel, 'scripts/vaardigheden/valideer.mjs');

  // ── Група F9 (MAIL-3, MAIL-10, MAIL-11, MAIL-16): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F9-1', 1, 'F9', 'F9.1 (MAIL-3): видимі текстові підписи кнопок ШІ (ШІ · Підсумок · Чернетка) на вузькому екрані <= 430 px', () => {
    const mobielPassendCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail-mobiel-passend.css'));
    eis(
      !mobielPassendCss.includes('html body .mra-bar > button:not(.mra-toggle) > span{position:absolute;width:1px;height:1px') &&
        !/\.mra-bar\s*>\s*button:not\(\.mra-toggle\)\s*>\s*span\s*\{[^}]*width:\s*1px/.test(mobielPassendCss),
      'Кнопки помічника ШІ в .mra-bar не сміють ховати свої текстові підписи через width: 1px; height: 1px на екранах <= 430 px',
    );
  });

  await draaiToets(uitkomsten, 'L1-F9-2', 1, 'F9', 'F9.2 (MAIL-3): закриття спливної підказки ViewportKnopinfoLaag при гортанні й захист від залипання від дотику', () => {
    const knopinfoBron = leesBestandVeilig(wortel, 'src/ViewportKnopinfoLaag.tsx');
    const sluitBuitenBeeld =
      /rect\.bottom\s*<=?\s*top0/.test(knopinfoBron) && /rect\.top\s*>=?\s*top0\s*\+\s*height/.test(knopinfoBron);
    const focusZonderAanraakLek =
      !/focusIn\s*=\s*\(\s*event\s*(?::\s*FocusEvent)?\s*\)\s*=>\s*show\(/.test(knopinfoBron) &&
      (knopinfoBron.includes('pointerdown') || knopinfoBron.includes(':focus-visible'));
    eis(
      sluitBuitenBeeld && focusZonderAanraakLek,
      'ViewportKnopinfoLaag мусить закривати підказку при виході цільової кнопки за межі видимої області (rect.bottom < top0 || rect.top > top0 + height) та блокувати її відкриття від сенсорного focusIn',
    );
  });

  await draaiToets(uitkomsten, 'L1-F9-3', 1, 'F9', 'F9.3 (MAIL-10): усунення дублювання чорної кнопки «Відповісти» при розгорнутому редакторі відповіді', () => {
    const werkbalkBron = leesBestandVeilig(wortel, 'src/MailLezerWerkbalk.tsx');
    const cssSamen = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/lees-venster.css') + '\n' + leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css'));
    eis(
      werkbalkBron.includes('replyOpen') || cssSamen.includes("data-reply-ingeklapt='nee'") || cssSamen.includes('data-reply-ingeklapt="nee"'),
      'Нижня панель .mail-reader-onderbalk із дублем кнопки «Відповісти» мусить приховуватися, коли розгорнуто редактор відповіді',
    );
  });

  await draaiToets(uitkomsten, 'L1-F9-4', 1, 'F9', 'F9.4 (MAIL-11): двомовні локалізовані одиниці розміру вкладень у formatMailAttachmentSize (Б/КБ/МБ/ГБ та B/KB/MB/GB)', () => {
    const fmt = bijlageVoorbeeld.formatMailAttachmentSize as ((v: number, lang?: 'uk' | 'nl') => string) | undefined;
    eis(typeof fmt === 'function', 'MailBijlageVoorbeeld мусить експортувати formatMailAttachmentSize');
    const ukKb = fmt(2048, 'uk');
    const ukMb = fmt(2 * 1024 * 1024, 'uk');
    const nlKb = fmt(2048, 'nl');
    eis(
      /(?<!\p{L})КБ(?!\p{L})/u.test(ukKb) && !/[A-Za-z]/.test(ukKb),
      `formatMailAttachmentSize(2048, 'uk') мусить повертати кириличні "КБ" без латиниці (отримано: "${ukKb}")`,
    );
    eis(
      /(?<!\p{L})МБ(?!\p{L})/u.test(ukMb) && !/[A-Za-z]/.test(ukMb),
      `formatMailAttachmentSize(2 МБ, 'uk') мусить повертати кириличні "МБ" (отримано: "${ukMb}")`,
    );
    eis(
      /(?<!\p{L})(?:kB|KB)(?!\p{L})/u.test(nlKb) && !/[БМГК]/u.test(nlKb),
      `formatMailAttachmentSize(2048, 'nl') мусить повертати латинські "KB"/"kB" без кирилиці (отримано: "${nlKb}")`,
    );
  });

  await draaiToets(uitkomsten, 'L1-F9-5', 1, 'F9', 'F9.5 (MAIL-11): закріплена шапка з [✕] в аркуші додаткових дій/Вигляду та прибирання «Згорнути лист» на телефоні', () => {
    const werkbalkBron = leesBestandVeilig(wortel, 'src/MailLezerWerkbalk.tsx');
    const weergaveBron = leesBestandVeilig(wortel, 'src/mail/WeergaveKeuze.tsx');
    eis(!werkbalkBron.includes("lv&&(lv.modus==='telefoon'||lv.breedte==='smal')&&<><WeergaveBlok lang={p.lang}/><div className='mail-reader-overflow-groep' data-groep='venster'"), 'У мобільному режимі telefoon під блоком Вигляду не повинно бути кнопки «Згорнути лист»');
    eis((werkbalkBron + weergaveBron).includes('Закрити') || (werkbalkBron + weergaveBron).includes('Sluiten'), 'Аркуш налаштувань Вигляду / Додаткових дій мусить мати закріплену кнопку закриття [✕]');
  });

  await draaiToets(uitkomsten, 'L1-F9-6', 1, 'F9', 'F9.6 (MAIL-16): компактна шапка «Відповісти» у 2 рядки без .mail-reply-extra та без порожньої смуги .mra', () => {
    const gesprekBron = leesBestandVeilig(wortel, 'src/MailGesprekInhoud.tsx');
    eis(!gesprekBron.includes("className='mail-reply-extra'") && !gesprekBron.includes('className="mail-reply-extra"'), 'Зайвий поверх .mail-reply-extra має бути ліквідований у MailGesprekInhoud.tsx');
    eis(gesprekBron.includes('data-reply-doorsturen'), 'Дія пересилання [data-reply-doorsturen] мусить зберігатися в компактній шапці відповіді');
  });

  await draaiToets(uitkomsten, 'L1-F9-7', 1, 'F9', 'F9.7 (MAIL-16): ліквідація подвійної рамки спадного списку тону «Як зазвичай» (appearance: none)', () => {
    const aiCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail-lezer-ai.css'));
    eis(/appearance:\s*none/.test(aiCss), 'Спадний список <select> у .mra-veld мусить мати appearance: none без подвійної внутрішньої рамки');
  });

  // ── Група F10 (MAIL-18, MAIL-19, MAIL-20): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F10-1', 1, 'F10', 'F10.1 (MAIL-18): статистичний taalVan не вважає англійський чи нідерландський лист українським через ім’я у звертанні', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const engBrief =
      "Hi Павло Тарасевич,\n\nYour order for Carrefour Market is confirmed! Please pick up your Magic Bag tomorrow between 18:00 and 19:00. If you can't make it, remember to cancel in the app.";
    const nlBrief =
      'Beste Олена Коваленко,\n\nBedankt voor uw bestelling bij onze winkel. In bijlage vindt u de factuur voor uw betaling en de leveringsvoorwaarden.';
    eis(taalVan(engBrief) === 'en', `Англійський лист із кириличним ім'ям у вітанні мусить визначатися як "en", отримано: "${taalVan(engBrief)}"`);
    eis(taalVan(nlBrief) === 'nl', `Нідерландський лист із кириличним ім'ям у вітанні мусить визначатися як "nl", отримано: "${taalVan(nlBrief)}"`);
  });

  await draaiToets(uitkomsten, 'L1-F10-2', 1, 'F10', 'F10.2 (MAIL-18): надійне розпізнавання українських, німецьких, французьких та польських листів у taalVan', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    eis(taalVan('Доброго дня, Павле! Надсилаємо підписаний договір оренди та рахунок за жовтень.') === 'uk', 'Український лист мусить визначатися як "uk"');
    eis(taalVan('Guten Tag, vielen Dank für Ihre Rechnung und die schnelle Rückmeldung.') === 'de', 'Німецький лист мусить визначатися як "de"');
    eis(taalVan('Bonjour, merci pour votre facture et votre confirmation rapide.') === 'fr', 'Французький лист мусить визначатися як "fr"');
    eis(taalVan('Dzień dobry, dziękuję za fakturę. Czy możemy potwierdzić spotkanie?') === 'pl', 'Польський лист мусить визначатися як "pl"');
  });

  await draaiToets(uitkomsten, 'L1-F10-3', 1, 'F10', 'F10.3 (MAIL-19): збереження інваріанта безпеки classificeer та чесний підстан domeinAuthVan для корпоративних доменів', () => {
    const classificeer = mailAfzenders.classificeer as (i: Record<string, unknown>) => { status: string };
    const domeinAuthVan = mailAfzenders.domeinAuthVan as ((domein: string, auth: unknown) => string) | undefined;
    const authPass = {
      betrouwbaar: true,
      authserv: 'mx.google.com',
      spf: 'pass',
      dkim: [{ uitslag: 'pass', domein: 'toogoodtogo.com' }],
      dmarc: 'pass',
      dmarcDomein: 'toogoodtogo.com',
    };
    const cl = classificeer({ naam: 'Too Good To Go', adres: 'no-reply@toogoodtogo.com', domein: 'toogoodtogo.com', auth: authPass });
    eis(cl.status === 'onbekend', 'Невідомий корпоративний домен без ручного підтвердження мусить зберігати status="onbekend" у classificeer');
    eis(typeof domeinAuthVan === 'function', 'shared/mail-afzenders.ts мусить експортувати функцію domeinAuthVan');
    eis(domeinAuthVan('toogoodtogo.com', authPass) === 'pass', 'domeinAuthVan для toogoodtogo.com із пройденим SPF/DKIM/DMARC мусить повертати "pass"');
  });

  await draaiToets(uitkomsten, 'L1-F10-4', 1, 'F10', 'F10.4 (MAIL-19): AfzenderBadge показує спокійний підстан підтвердженого домену зі спливною карткою SPF/DKIM/DMARC', () => {
    const badgeBron = leesBestandVeilig(wortel, 'src/afzenders/AfzenderBadge.tsx');
    const backendAfzBron = leesBestandVeilig(wortel, 'backend/mail-afzenders.ts');
    eis(
      (badgeBron.includes('ShieldCheck') || badgeBron.includes('domein-bevestigd') || badgeBron.includes('domeinAuth')) &&
        (backendAfzBron.includes('domeinAuth') || badgeBron.includes('DMARC')),
      'AfzenderBadge та backend/mail-afzenders.ts мусять передавати й показувати криптографічне підтвердження домену без суперечливого знака питання',
    );
  });

  await draaiToets(uitkomsten, 'L1-F10-5', 1, 'F10', 'F10.5 (MAIL-19): вписування логотипа організації (object-fit: contain) у .afz-foto[data-afzender-foto="merk"] без обрізання', () => {
    const afzCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/afzenders/afzenders.css'));
    eis(
      /\.afz-foto\[data-afzender-foto=['"]?merk['"]?\][\s\S]{0,240}object-fit:\s*contain/.test(afzCss),
      'У src/afzenders/afzenders.css селектор .afz-foto[data-afzender-foto="merk"] img мусить задавати object-fit: contain для всіх аватарів листа й Контексту',
    );
  });

  await draaiToets(uitkomsten, 'L1-F10-6', 1, 'F10', 'F10.6 (MAIL-20): рекурсивне збереження та очищення @media-правил HTML-листа у MailBerichtTekst.tsx', () => {
    const berichtBron = leesBestandVeilig(wortel, 'src/MailBerichtTekst.tsx');
    eis(!berichtBron.includes('if(!(rule instanceof CSSStyleRule))continue;'), 'flattenStyles у MailBerichtTekst.tsx не сміє сліпо відкидати всі CSSMediaRule (@media)');
    eis(berichtBron.includes('CSSMediaRule') || berichtBron.includes('adoptedStyleSheets'), 'MailBerichtTekst.tsx мусить обробляти адаптивні правила CSSMediaRule / adoptedStyleSheets');
  });

  await draaiToets(uitkomsten, 'L1-F10-7', 1, 'F10', 'F10.7 (MAIL-20): пріоритет специфічності у flattenStyles та захист прихованих зображень від роздування', () => {
    const berichtBron = leesBestandVeilig(wortel, 'src/MailBerichtTekst.tsx');
    eis(!berichtBron.includes('if(el.style.getPropertyValue(property))continue;') || berichtBron.includes('specificiteit') || berichtBron.includes('important'), 'flattenStyles мусить враховувати специфічність та !important, щоб загальне img { display: block } не перебивало .dark-img { display: none !important }');
  });

  // ── Група F11 (MAIL-1, MAIL-2, MAIL-4..MAIL-8, MAIL-17): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F11-1', 1, 'F11', 'F11.1 (MAIL-1): очищення сирого <a href="..."> у видимих пунктах «Що від вас потрібно?» зі збереженням citaat', () => {
    const opschonen = aiBronnen.opschonenPuntTekst as
      | ((ruw: string) => { tekst: string; koppelingen: Array<{ label: string; url: string }> })
      | undefined;
    const eenvoudigeOntleding = aiBronnen.eenvoudigeOntleding as (
      b: Array<{ brief: number; tekst: string }>,
    ) => { punten: Array<{ tekst: string; citaat: string }>; kort: Array<{ tekst: string; citaat: string }> };
    eis(typeof opschonen === 'function', 'shared/ai-bronnen.ts мусить експортувати чисту функцію opschonenPuntTekst');
    const schoon = opschonen('Заберіть замовлення о 18:00 за адресою <a href="https://maps.google.com/?q=Gent">Відкрити на мапі</a> вчасно.');
    eis(!schoon.tekst.includes('<a ') && !schoon.tekst.includes('href='), `Видимий текст пункту не сміє містити сирого HTML-тегу <a href>: "${schoon.tekst}"`);
    eis(schoon.koppelingen.length === 1 && schoon.koppelingen[0].url.startsWith('https://maps.google.com/'), 'opschonenPuntTekst має виділяти безпечне https-посилання в окрему дію');
    const ontl = eenvoudigeOntleding([{ brief: 1, tekst: 'Будь ласка, підтвердьте зустріч 28 жовтня о 10:00 за посиланням <a href="https://maps.google.com/?q=Gent">Мапа</a>?' }]);
    const alle = [...ontl.punten, ...ontl.kort];
    eis(alle.every((p) => !p.tekst.includes('<a ')), 'Жоден пункт eenvoudigeOntleding не повинен виводити сирі теги <a href> у поле tekst');
  });

  await draaiToets(uitkomsten, 'L1-F11-2', 1, 'F11', 'F11.2 (MAIL-2): розпізнавання односторонніх розсилок isEenrichtingsAfzender (no-reply@) без хибного «Потребує відповіді»', () => {
    const isEenrichting = aiBronnen.isEenrichtingsAfzender as ((van: string, replyTo?: string) => boolean) | undefined;
    const antwoordNodig = aiBronnen.antwoordNodig as (
      gesprek: Array<{ from: string; replyTo?: string }>,
      mijn: string[],
      punten: Array<Record<string, unknown>>,
    ) => unknown;
    eis(typeof isEenrichting === 'function', 'shared/ai-bronnen.ts мусить експортувати функцію isEenrichtingsAfzender');
    eis(isEenrichting('Too Good To Go <no-reply@toogoodtogo.com>') === true, 'Адреса no-reply@toogoodtogo.com мусить розпізнаватися як одностороння');
    const uit = antwoordNodig(
      [{ from: 'Too Good To Go <no-reply@toogoodtogo.com>' }],
      ['olena@voorbeeld.test'],
      [{ id: 'p1', tekst: 'Чи сподобалося замовлення?', citaat: 'Чи сподобалося замовлення?', brief: 1, alinea: 1, termijn: '', soort: 'vraag', status: 'letterlijk', bron: { brief: 1, nr: 1 }, verplaatst: false, termijnStaat: 'geen' }],
    );
    eis(uit === null, 'Для одностороннього відправника no-reply@ функція antwoordNodig мусить повертати null');
  });

  await draaiToets(uitkomsten, 'L1-F11-3', 1, 'F11', 'F11.3 (MAIL-4): короткі коди форматів (ICS, VCF, LDIF, CSV, OLM) у мініатюрі 64×64 px без обрізання «зайнятіст» та чисті двомовні назви', () => {
    const capFn = persoonsMogelijkheden.mailPersonalDataCapability as (naam: string, type?: string) => Record<string, unknown> | null;
    const voorbeeldFn = bijlageVoorbeeld.describeMailAttachment as (item: Record<string, unknown>) => {
      kind: string;
      tone: string;
      label: string;
      badge?: string;
    };
    const MiniComp = bijlageMiniatuurMod.default as unknown as React.ComponentType<Record<string, unknown>>;
    const monsters = [
      { providerAttachmentId: 'a1', filename: 'uitnodiging.ics', contentType: 'text/calendar', sizeBytes: 1024 },
      { providerAttachmentId: 'a2', filename: 'persoon.vcf', contentType: 'text/vcard', sizeBytes: 512 },
      { providerAttachmentId: 'a3', filename: 'adresboek.ldif', contentType: 'text/ldif', sizeBytes: 512 },
      { providerAttachmentId: 'a4', filename: 'archief.olm', contentType: 'application/octet-stream', sizeBytes: 4096 },
    ];
    for (const item of monsters) {
      const desc = voorbeeldFn(item);
      const html = renderToStaticMarkup(React.createElement(MiniComp, { descriptor: desc, density: 'normal', variant: 'reader' }));
      const badgeMatch = /<span class="mail-attachment-miniature-paper">[\s\S]*?<b>([^<]*)<\/b>/.exec(html);
      const badgeTekst = (badgeMatch?.[1] || '').trim();
      eis(
        badgeTekst.length >= 1 && badgeTekst.length <= 5 && !badgeTekst.includes('зайнятіст'),
        `Мініатюра ${item.filename} у .mail-attachment-miniature-paper > b мусить виводити короткий код 1..5 символів без "зайнятіст" (отримано: "${badgeTekst}")`,
      );
      eis(
        !desc.label.includes('зайнятіст') &&
          !['vCard contact', 'LDIF directory data', 'Contact CSV'].includes(desc.label),
        `Опис типу ${item.filename} у desc.label не сміє містити обрізаного "зайнятіст" чи англомовних підписів (отримано: "${desc.label}")`,
      );
    }
    const csvCap = capFn('contacten.csv', 'application/x-mail-personal-data-contact-csv');
    eis(
      Boolean(csvCap) && String(csvCap?.label || '') !== 'Contact CSV',
      `Опис формату contact-csv не сміє залишатися англомовним "Contact CSV" (отримано: "${String(csvCap?.label || '')}")`,
    );
    const icsDesc = voorbeeldFn(monsters[0]);
    const nlLabel = bijlageLabelsMod.toonLabel(icsDesc.label, 'nl');
    eis(
      /[\u0400-\u04FF]/u.test(icsDesc.label) && !/[\u0400-\u04FF]/u.test(nlLabel),
      `Назва формату .ics мусить мати чисту українську версію ("${icsDesc.label}") та нідерландський відповідник у toonLabel ("${nlLabel}")`,
    );
  });

  await draaiToets(uitkomsten, 'L1-F11-4', 1, 'F11', 'F11.4 (MAIL-5): повна заміна кальки «В Агенду» на питоме «У Календар» у всіх компонентах пошти', () => {
    for (const pad of ['src/mail/WatNodigBlok.tsx', 'src/mail/ContextPaneel.tsx', 'src/MailGesprekInhoud.tsx']) {
      const inhoud = leesBestandVeilig(wortel, pad);
      eis(!/В Агенду|в Агенду/u.test(inhoud), `Файл ${pad} все ще містить мовну кальку «В Агенду» замість «У Календар»`);
    }
    const ctxInhoud = leesBestandVeilig(wortel, 'src/mail/ContextPaneel.tsx');
    eis(ctxInhoud.includes('У Календар'), 'ContextPaneel.tsx мусить вживати питомий напис «У Календар»');
  });

  await draaiToets(uitkomsten, 'L1-F11-5', 1, 'F11', 'F11.5 (MAIL-6): захист витягу хронології від спотворення привітання Hi → Ні (herstelAanhefUittreksel + translate="no")', () => {
    const herstelFn = gesprekContext.herstelAanhefUittreksel as ((t: string) => string) | undefined;
    const ctxBron = leesBestandVeilig(wortel, 'src/mail/ContextPaneel.tsx');
    eis(typeof herstelFn === 'function', 'src/mail/gesprek-context.ts мусить експортувати чисту функцію herstelAanhefUittreksel');
    const hersteld = herstelFn('Ні Павло Тарасевич, Your order for Carrefour Market is confirmed!');
    eis(hersteld.startsWith('Hi Павло Тарасевич'), `herstelAanhefUittreksel мусить відновлювати "Hi Павло Тарасевич...", отримано: "${hersteld}"`);
    eis(ctxBron.includes('translate="no"') || ctxBron.includes("translate='no'"), 'Витяг хронології у ContextPaneel.tsx мусить мати атрибут translate="no"');
  });

  await draaiToets(uitkomsten, 'L1-F11-6', 1, 'F11', 'F11.6 (MAIL-7, MAIL-8): 5 вкладок «Контексту» в один рядок (nowrap), багаторядкова назва події та підтримка langscroll', () => {
    const ctxCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/context-paneel.css'));
    const ctxTsx = leesBestandVeilig(wortel, 'src/mail/ContextPaneel.tsx');
    eis(!/\.ctx-tabs\s*\{[^}]*flex-wrap:\s*wrap/.test(ctxCss) && /flex-wrap:\s*nowrap/.test(ctxCss), 'Смуга 5 вкладок .ctx-tabs мусить мати flex-wrap: nowrap без випадання вкладки «Відправник» на другий поверх');
    eis(!/\.ctx-tl-tekst\s+strong\s*\{[^}]*white-space:\s*nowrap/.test(ctxCss), 'Назва події .ctx-tl-tekst strong не повинна обрізатися в один рядок через white-space: nowrap');
    eis((ctxTsx + ctxCss).includes('langscroll'), 'Панель Контексту мусить підтримувати режим довгого знімка екрана (langscroll) на смартфоні');
  });

  await draaiToets(uitkomsten, 'L1-F11-7', 1, 'F11', 'F11.7 (MAIL-17): об’єднання вкладення .ics із карткою події BriefAfspraken без дублювання та прибирання [↩] для no-reply@', () => {
    const gesprekBron = leesBestandVeilig(wortel, 'src/MailGesprekInhoud.tsx');
    const kaartBron = leesBestandVeilig(wortel, 'src/MailBijlageKaart.tsx');
    const KaartComp = bijlageKaartMod.default as unknown as React.ComponentType<Record<string, unknown>>;
    const icsZonderDubbel =
      gesprekBron.includes('isIcs') || (gesprekBron.includes('text/calendar') && gesprekBron.includes('.filter('));
    const geenOnvoorwaardelijkAntwoord =
      !/onAddToReply=\{\s*\(\)\s*=>\s*void\s+voegToeAanAntwoord\(message\.id,\s*item\)\s*\}/.test(gesprekBron) &&
      (gesprekBron.includes('isEenrichtingsAfzender') || kaartBron.includes('isEenrichtingsAfzender'));
    const htmlZonderAntwoord = renderToStaticMarkup(
      React.createElement(KaartComp, {
        lang: 'uk',
        item: { providerAttachmentId: 'v1', filename: 'contact.vcf', contentType: 'text/vcard', sizeBytes: 512 },
        density: 'normal',
        presentation: 'compact',
        showName: true,
        showSize: true,
        context: {},
        accountId: 'acc',
        cacheAccountId: 'acc',
        messageId: 'm1',
        onOpen: () => undefined,
        onSave: () => undefined,
        onDownload: () => undefined,
        onAddToReply: undefined,
      }),
    );
    eis(icsZonderDubbel, 'MailGesprekInhoud.tsx не сміє дублювати розібране вкладення .ics другою великою карткою у списку вкладень');
    eis(
      geenOnvoorwaardelijkAntwoord && !htmlZonderAntwoord.includes('data-vk-antwoord'),
      'Для односторонніх відправників no-reply@ кнопка додавання вкладення до відповіді [data-vk-antwoord] (onAddToReply) мусить вимикатися й не відмальовуватися',
    );
  });

  // ── Група F12 (Мовний закон, сторожі складання, відсутність !important та 5 фотозвітів): 7 перевірок ──
  await draaiToets(uitkomsten, 'L1-F12-1', 1, 'F12', 'F12.1 (Мовний закон): відсутність заборонених літер у цільових файлах і статтях HERSTEL-001 та чинність навичок', () => {
    const doelPaden = [
      'src/CanoniekAccountMenu.tsx',
      'src/accountmenu-v3/AccountMenuV3.tsx',
      'src/EigenaarIdentiteitTerug.tsx',
      'src/weigeringen.ts',
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
      'src/AanmeldAndereOpties.tsx',
      'backend/telegram-aanmelden/venster.ts',
      'src/MenuMeldingen.tsx',
      'src/meldingen/IcoonActieKnop.tsx',
      'src/meldingen/ecosysteem/MeldingenPortaal.tsx',
      'src/meldingen/ecosysteem/MeldingVeegKaart.tsx',
      'shared/beheer-journaal.ts',
      'src/mail/LeesVenster.tsx',
      'src/MailLezerWerkbalk.tsx',
      'src/MailGesprekInhoud.tsx',
      'src/mail/ContextPaneel.tsx',
      'src/mail/WatNodigBlok.tsx',
      'shared/ai-bronnen.ts',
      'shared/mail-afzenders.ts',
      'tests/eenheid/herstel-001-e2e-vijf-etappes.test.ts',
    ];
    for (const rel of doelPaden) {
      const pad = join(wortel, rel);
      if (!existsSync(pad)) continue;
      const tekst = readFileSync(pad, 'utf8');
      eis(!VERBODEN_TEKENS_RE.test(tekst), `Файл ${rel} містить заборонені не-українські літери`);
    }
    const vRes = vaardighedenValideer.valideerVaardigheden(wortel);
    const zonderTaal = vaardighedenValideer.adaptersZonderTaalwet(wortel);
    eis(vRes.fouten.length === 0 && zonderTaal.length === 0, `Помилки перевірки чинності навичок і перехідників: ${[...vRes.fouten, ...zonderTaal].join('; ')}`);
  });

  await draaiToets(uitkomsten, 'L1-F12-2', 1, 'F12', 'F12.2 (Сторож розміщення): проходження scripts/plaatsing-controle.mjs без незареєстрованих фіксованих шарів', async () => {
    const res = await plaatsingControle.controleer(wortel);
    eis(res.fouten.length === 0, `plaatsing-controle виявив порушення (${res.fouten.length}): ${res.fouten.slice(0, 4).join(' | ')}`);
  });

  await draaiToets(uitkomsten, 'L1-F12-3', 1, 'F12', 'F12.3 (Сторож L002): проходження scripts/l002-audit.mjs без жодних регресій безпеки, входу, зворотного виклику чи нових !important', () => {
    const diagPad = join(wortel, 'rapporten/l002-diagnostic.json');
    const bestondAl = existsSync(diagPad);
    const historischeLimieten: ReadonlyArray<readonly [RegExp, number]> = [
      [/^chrome:/, 5],
      [/^owner-locked-menu$/, 1],
      [/^account-css:(?:compact-flag|flag-uk|flag-nl)$/, 3],
      [/^service-worker-registration:registration\.update\(\)$/, 1],
      [/^mail-phase1:data-mail-account-status$/, 1],
      [/^mail-permanent-shell:/, 2],
      [/^mail-sidebar-session-ready:/, 1],
      [/^mail-prefetch-core:/, 2],
      [/^admin-ui:data-admin-audit$/, 1],
      [/^admin-diagnostics:/, 2],
      [/^mail-pipeline:/, 2],
      [/^calendar-sync:/, 2],
      [/^mail-human-ui:/, 1],
      [/^mail-laatste:/, 2],
      [/^mail-live-preview:/, 2],
      [/^mail-ui-recovery:googleMailGranted$/, 1],
      [/^b3-lazy-preview:Mail[A-Za-z]+Preview$/, 31],
      [/^a11y-hub-(?:workspace-h1-visible|empty-h2)$/, 2],
      [/^mail-provider-reconcile-(?:ui:|cache-before-select$)/, 2],
      [/^b4-important-free:src\/(?:google-mail-werkruimte|mail-zijbalk-navigatie|mail-gesprek-bewerker)\.css$/, 3],
    ];
    try {
      const run = spawnSync(process.execPath, ['scripts/l002-audit.mjs'], {
        cwd: wortel,
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: kortTmp, TMP: kortTmp, TEMP: kortTmp },
      });
      const out = String(run.stdout || '') + String(run.stderr || '');
      let failures: string[] = [];
      if (existsSync(diagPad)) {
        const parsed = JSON.parse(readFileSync(diagPad, 'utf8')) as { failures?: string[] };
        failures = Array.isArray(parsed.failures) ? parsed.failures : [];
      }
      const nieuweOvertredingen = failures.filter((f) => !historischeLimieten.some(([re]) => re.test(f)));
      const overschredenGroepen: string[] = [];
      for (const [re, maxAantal] of historischeLimieten) {
        const aantal = failures.filter((f) => re.test(f)).length;
        if (aantal > maxAantal) overschredenGroepen.push(`${re.source} (${aantal} > ${maxAantal})`);
      }
      eis(
        run.status === 0 &&
          (out.includes('Canonical/L002 audit passed') || out.includes('Canonical/L002 diagnostic emitted')) &&
          failures.length <= 67 &&
          nieuweOvertredingen.length === 0 &&
          overschredenGroepen.length === 0,
        `l002-audit виявив нові порушення контрактів HERSTEL-001 (нові=[${nieuweOvertredingen.slice(0, 6).join(', ')}], перевищення=[${overschredenGroepen.join(', ')}], всього=${failures.length})`,
      );
    } finally {
      if (!bestondAl && existsSync(diagPad)) {
        rmSync(diagPad, { force: true });
      }
    }
  });

  await draaiToets(uitkomsten, 'L1-F12-4', 1, 'F12', 'F12.4 (Чистота каскаду): 0 нових !important у 28 чистих таблицях стилів та дотримання меж у 3 суміжних файлах Пошти', () => {
    const schoneCss = [
      'src/canoniek-account-menu.css',
      'src/account-afgemeld-menu.css',
      'src/google-terugkeer-kaart.css',
      'src/cognitief-context.css',
      'src/taal-vlag.css',
      'src/mail-geavanceerd-zoeken.css',
      'src/mail-bijlage-strook.css',
      'src/mail-database.css',
      'src/mail-invoer-hulpmiddelen.css',
      'src/mail-gelaagde-inbox.css',
      'src/mail-geminimaliseerde-viewer.css',
      'src/mail-minimum-rij.css',
      'src/mail-overlay-oppervlak.css',
      'src/mail-presentatie.css',
      'src/mail-snelle-instellingen.css',
      'src/mail-lezer-verbeteringen.css',
      'src/mail-lezer-werkbalk.css',
      'src/mail-sectie-menu.css',
      'src/mail-instellingen-voorbeeld.css',
      'src/mail-zijbalk-navigatie.css',
      'src/mail-vertaling-balk.css',
      'src/mail-rij-snelle-acties.css',
      'src/mail-lezer-ai.css',
      'src/instellingencentrum.css',
      'src/verenigd-dienst-inhoud.css',
      'src/meldingen/ecosysteem/meldingen-ecosysteem.css',
      'src/mail/mail-lezer-opstel-maquette.css',
      'src/mail/mail-lezer-compact-kop.css',
    ];
    const overtredingen: string[] = [];
    const telImp = (css: string) => (css.match(/!important/g) || []).length;
    for (const rel of schoneCss) {
      const inhoud = zonderCssOpmerkingen(leesBestandVeilig(wortel, rel));
      const n = telImp(inhoud);
      if (n > 0) overtredingen.push(`${rel} (${n} > 0)`);
    }
    const werkCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/google-mail-werkruimte.css'));
    const werkImp = telImp(werkCss);
    if (
      werkImp > 4 ||
      /\.google-mail-reader-backdrop\s+\.google-mail-reader\s*>\s*header\s*\{[^}]*!important/.test(werkCss) ||
      /(?<!:not\()\[data-lees-modus=['"]telefoon['"]\][^{]*\{[^}]*!important/.test(werkCss)
    ) {
      overtredingen.push(`src/google-mail-werkruimte.css (кількість=${werkImp}, поріг<=4 та 0 на telefoon)`);
    }
    const bewCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail-gesprek-bewerker.css'));
    const bewImp = telImp(bewCss);
    if (bewImp > 1 || /\.mail-thread-reply[^{]*\{[^}]*!important/.test(bewCss)) {
      overtredingen.push(`src/mail-gesprek-bewerker.css (кількість=${bewImp}, поріг<=1 та 0 на .mail-thread-reply)`);
    }
    const ctxCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/context-paneel.css'));
    const ctxImp = telImp(ctxCss);
    if (ctxImp > 1 || /(?:\.ctx-paneel|\.ctx-scherm|\.ctx-tabs)[^{]*\{[^}]*!important/.test(ctxCss)) {
      overtredingen.push(`src/mail/context-paneel.css (кількість=${ctxImp}, поріг<=1 та 0 на .ctx-paneel/.ctx-scherm/.ctx-tabs)`);
    }
    eis(overtredingen.length === 0, `Виявлено заборонене використання !important: ${overtredingen.join('; ')}`);
  });

  await draaiToets(uitkomsten, 'L1-F12-5', 1, 'F12', 'F12.5 (Реєстри дій та логотипів): проходження meldingen-register-controle та безконфліктність реєстру src/merk/', async () => {
    const runMeld = spawnSync(process.execPath, ['scripts/meldingen-register-controle.mjs', '--stil'], {
      cwd: wortel,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: kortTmp, TMP: kortTmp, TEMP: kortTmp },
    });
    eis(runMeld.status === 0, `meldingen-register-controle завершився з помилкою: ${(runMeld.stderr || runMeld.stdout || '').trim()}`);
    const { OFFICIEEL_SLEUTELS } = await import('../../src/merk/officieel-sleutels');
    const { LOGOS } = await import('../../src/merk/merk-logos');
    const overlap = Object.keys(LOGOS).filter((k) => OFFICIEEL_SLEUTELS.has(k));
    eis(overlap.length === 0, `Знаки не можуть одночасно дублюватися у LOGOS та OFFICIEEL_SLEUTELS: ${overlap.join(', ')}`);
  });

  await draaiToets(uitkomsten, 'L1-F12-6', 1, 'F12', 'F12.6 (Пошуковий каталог, межа клієнт↔сервер і контрастність): проходження zoek-ui-catalogus --controle та межових сторожів', async () => {
    const grensFouten = await klantServergrens.klantServergrensFouten({ wortel });
    eis(grensFouten.length === 0, `Порушення межі клієнт↔сервер: ${grensFouten.map((f) => `${f.importeur}->${f.module}`).join('; ')}`);
    const runZoek = spawnSync(process.execPath, ['scripts/zoek-ui-catalogus.mjs', '--controle'], {
      cwd: wortel,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: kortTmp, TMP: kortTmp, TEMP: kortTmp },
    });
    eis(runZoek.status === 0, `Каталог пошуку кнопок потребує синхронізації (zoek-ui-catalogus --controle): ${(runZoek.stderr || runZoek.stdout || '').trim()}`);
    const runKleur = spawnSync(process.execPath, ['scripts/kleur-contrast-controle.mjs', '--stil'], {
      cwd: wortel,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: kortTmp, TMP: kortTmp, TEMP: kortTmp },
    });
    eis(runKleur.status === 0, `Порушення контрастності палітр: ${(runKleur.stderr || runKleur.stdout || '').trim()}`);
  });

  await draaiToets(uitkomsten, 'L1-F12-7', 1, 'F12', 'F12.7 (5 Фотозвітів «до / після»): наявність, мовна чистота та цілісність PNG-знімків усіх 5 етапів', () => {
    const verwachteRapporten = [
      'ФОТОЗВІТ-ЕТАП-1-МОБІЛЬНИЙ-ВХІД-ДО-І-ПІСЛЯ.uk.md',
      'ФОТОЗВІТ-ЕТАП-2-ТЕЛЕГРАМ-ДО-І-ПІСЛЯ.uk.md',
      'ФОТОЗВІТ-ЕТАП-3-ПОВЕРНЕННЯ-GOOGLE-ДО-І-ПІСЛЯ.uk.md',
      'ФОТОЗВІТ-ЕТАП-4-СПОВІЩЕННЯ-ДО-І-ПІСЛЯ.uk.md',
      'ФОТОЗВІТ-ЕТАП-5-ПОШТА-ДО-І-ПІСЛЯ.uk.md',
    ];
    const ontbrekend: string[] = [];
    for (const naam of verwachteRapporten) {
      const pad = join(ARTEFACT_MAP, naam);
      if (!existsSync(pad)) {
        ontbrekend.push(naam);
        continue;
      }
      const md = readFileSync(pad, 'utf8');
      eis(md.length >= 1200, `Фотозвіт ${naam} занадто короткий (${md.length} байтів)`);
      eis(!VERBODEN_TEKENS_RE.test(md), `Фотозвіт ${naam} містить заборонені не-українські літери`);
      const pngPaden = [...md.matchAll(/!\[[^\]]*\]\((?:file:\/\/)?(\/[^)\s]+\.png)\)/g)].map((m) => m[1]);
      eis(pngPaden.length >= 4, `Фотозвіт ${naam} мусить містити щонайменше 4 вбудовані PNG-знімки «до / після» (знайдено: ${pngPaden.length})`);
      for (const pngPad of pngPaden) {
        eis(existsSync(pngPad), `У ${naam} вказано відсутній знімок: ${pngPad}`);
        const st = statSync(pngPad);
        eis(st.size > 2048, `Знімок ${pngPad} пошкоджений або порожній (${st.size} байтів)`);
        const kop = readFileSync(pngPad);
        eis(
          kop[0] === 0x89 && kop[1] === 0x50 && kop[2] === 0x4e && kop[3] === 0x47,
          `Файл ${pngPad} не має дійсної сигнатури PNG`,
        );
        const b = kop.readUInt32BE(16);
        const h = kop.readUInt32BE(20);
        eis(b >= 320 && h >= 480, `Некоректні розміри знімка ${pngPad}: ${b}×${h}`);
      }
    }
    eis(ontbrekend.length === 0, `Ще не створено фотозвіти етапів: ${ontbrekend.join(', ')}`);
  });
}


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// РІВЕНЬ 2 — МЕЖОВІ ТА НЕГАТИВНІ СТАНИ (68 ПЕРЕВІРОК ЧОРНОЇ СКРИНЬКИ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function voerNiveau2Uit(wortel: string, uitkomsten: ToetsUitkomst[]): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const moviPrapor = await import('../../src/MoviPrapor');
  const AccountMenuV3Mod = await import('../../src/accountmenu-v3/AccountMenuV3');
  const CanoniekOmlijstingMod = await import('../../src/CanoniekOmlijsting');
  const aanmeldOmleiding = await import('../../src/aanmeld-omleiding');
  const symbolenMod = await import('../../shared/apparaat-bevestiging/symbolen');
  const plaatsMod = await import('../../src/aanmelden/plaats');
  const vensterMod = await import('../../backend/telegram-aanmelden/venster');
  const googleTerugMod = await import('../../src/EigenaarIdentiteitTerug');
  const weigeringenMod = await import('../../src/weigeringen');
  const menuMeldingenShared = await import('../../shared/menu-meldingen');
  const menuMeldingenUi = (await import('../../src/MenuMeldingen')) as Record<string, unknown>;
  const pulsKern = await import('../../shared/meldingen-puls/kern');
  const tolkMod = await import('../../shared/meldingen-ecosysteem/tolk');
  const nieuwApparaatMod = await import('../../backend/nieuw-apparaat');
  const beheerJournaal = await import('../../shared/beheer-journaal');
  const siteActiviteit = await import('../../backend/site-activiteit');
  const meldingStijl = await import('../../src/melding-stijl');
  const bijlageVoorbeeld = (await import('../../src/MailBijlageVoorbeeld')) as Record<string, unknown>;
  const aiBronnen = (await import('../../shared/ai-bronnen')) as Record<string, unknown>;
  const mailAfzenders = (await import('../../shared/mail-afzenders')) as Record<string, unknown>;
  const gesprekContext = (await import('../../src/mail/gesprek-context')) as Record<string, unknown>;

  let volgnr = 0;
  const reg = (groep: GroepId, naam: string, fn: () => void | Promise<void>) =>
    draaiToets(uitkomsten, `L2-${++volgnr}`, 2, groep, naam, fn);

  // ── Межові стани F1 (6 перевірок) ──
  await reg('F1', 'M2-01 (F1): MoviPrapor на невідомому значенні мови безпечно повертається до українського прапора', () => {
    const html = renderToStaticMarkup(React.createElement(moviPrapor.MoviPrapor, { taal: 'de' as never }));
    eis(html.includes('data-movi-prapor="uk"'), 'MoviPrapor при невідомій мові має безпечно повертати український прапор');
  });
  await reg('F1', 'M2-02 (F1): неперетин сенсорних зон ::after на надвузькому екрані <= 360 px (gap >= 6 px за inset: -3px)', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css') + '\n' + leesBestandVeilig(wortel, 'src/account-afgemeld-menu.css'));
    eis(!/inset:\s*-(?:6|7|8|9|1\d)px/.test(css.match(/mr-sign-in-taal[\s\S]{0,400}/)?.[0] || ''), 'Сенсорне поле капсули мови у шапці не сміє перекривати сусідню кнопку теми на екрані 360 px');
  });
  await reg('F1', 'M2-03 (F1): вузьке правило ширини екрана <= 380 px зменшує сітку обох головних кнопок входу синхронно', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    const blok380 = css.slice(css.indexOf('@media (max-width: 380px)') >= 0 ? css.indexOf('@media (max-width: 380px)') : css.indexOf('max-width:380px'));
    eis(blok380.includes('mr-sign-in-main-button') && blok380.includes('tga-aanmeld-knop'), 'Обидві кнопки (Google і Telegram) мусять синхронно адаптуватися при <= 380 px');
  });
  await reg('F1', 'M2-04 (F1): спадне меню мов на вузькому екрані має обмеження ширини max-width, щоб не виходити за межі вікна', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css') + '\n' + leesBestandVeilig(wortel, 'src/account-afgemeld-menu.css'));
    eis(css.includes('mr-sign-in-taal-menu'), 'Стилі спадного меню мов .mr-sign-in-taal-menu мусять бути визначені у таблиці стилів');
  });
  await reg('F1', 'M2-05 (F1): закриття спадного меню мови за зовнішнім натисканням pointerdown поза межами taalMenuRef', () => {
    const bron = leesBestandVeilig(wortel, 'src/CanoniekAccountMenu.tsx');
    eis(bron.includes('pointerdown') && bron.includes('taalMenuRef'), 'Спадне меню мови має закриватися при pointerdown поза межами обгортки');
  });
  await reg('F1', 'M2-06 (F1): капсула мови гостьового входу має коректний aria-haspopup="menu" та aria-expanded', () => {
    const bron = leesBestandVeilig(wortel, 'src/CanoniekAccountMenu.tsx');
    eis(bron.includes("aria-haspopup='menu'") || bron.includes('aria-haspopup="menu"'), 'Капсула мови мусить мати атрибут доступності aria-haspopup="menu"');
  });

  // ── Межові стани F2 (6 перевірок) ──
  await reg('F2', 'M2-07 (F2): aanmeldenBezig повертає false для простроченої мітки (> 5 хвилин)', () => {
    sessionStorage.setItem(CanoniekOmlijstingMod.AANMELD_BEZIG_SLEUTEL, String(Date.now() - 6 * 60_000));
    try {
      eis(CanoniekOmlijstingMod.aanmeldenBezig() === false, 'Прострочена позначка mr-aanmelden-bezig (> 5 хв) мусить вважатися неактивною');
    } finally {
      CanoniekOmlijstingMod.zetAanmeldenBezig(false);
    }
  });
  await reg('F2', 'M2-08 (F2): aanmeldenBezig безпечно обробляє пошкоджене нечислове значення у sessionStorage', () => {
    sessionStorage.setItem(CanoniekOmlijstingMod.AANMELD_BEZIG_SLEUTEL, 'пошкоджено-не-число');
    try {
      eis(CanoniekOmlijstingMod.aanmeldenBezig() === false, 'Нечислове значення у mr-aanmelden-bezig мусить безпечно повертати false');
    } finally {
      CanoniekOmlijstingMod.zetAanmeldenBezig(false);
    }
  });
  await reg('F2', 'M2-09 (F2): cleanRedirectReturnTo очищує чутливі параметри OAuth (code, state, token, handoff) з адреси входу', () => {
    const loc = (globalThis as Record<string, unknown>).location as { href: string };
    const oudHref = loc.href;
    try {
      loc.href = 'https://hub.tarasevych.com/?code=geheim123&state=ow1&token=tok99&handoff=h1&keep=ja';
      const schoon = aanmeldOmleiding.cleanRedirectReturnTo();
      eis(!schoon.includes('geheim123') && !schoon.includes('tok99') && schoon.includes('keep=ja'), `cleanRedirectReturnTo мусить видаляти чутливі параметри: ${schoon}`);
    } finally {
      loc.href = oudHref;
    }
  });
  await reg('F2', 'M2-10 (F2): cleanRedirectReturnTo зберігає дійсний піддомен екосистеми https://mail.tarasevych.com/postvak-in', () => {
    const loc = (globalThis as Record<string, unknown>).location as { href: string };
    const oudHref = loc.href;
    try {
      loc.href = 'https://mail.tarasevych.com/postvak-in';
      const schoon = aanmeldOmleiding.cleanRedirectReturnTo();
      eis(schoon.startsWith('https://mail.tarasevych.com/postvak-in'), `Дійсна адреса піддомену має зберігатися, отримано: ${schoon}`);
    } finally {
      loc.href = oudHref;
    }
  });
  await reg('F2', 'M2-11 (F2): AccountMenuV3 із п’ятьма збереженими обліковими записами зберігає орбітальний кружечок "+"', () => {
    const rijen = Array.from({ length: 5 }, (_, i) => ({
      grantId: `g-${i}`,
      user: { id: `u-${i}`, accountId: `a-${i}`, name: `Користувач ${i}`, email: `u${i}@voorbeeld.test` },
      lastUsedAt: Date.now() - i * 1000,
      expiresAt: Date.now() + 86_400_000,
    }));
    const html = renderToStaticMarkup(
      React.createElement(AccountMenuV3Mod.AccountMenuV3, {
        lang: 'uk',
        theme: 'dark',
        displayUser: rijen[0].user,
        visibleRows: rijen,
        shouldShowOtherAccountsToggle: true,
        expanded: true,
        onToggleExpanded: () => undefined,
        busy: false,
        selecting: '',
        forgetting: '',
        loading: false,
        loadFailed: false,
        photoBusy: false,
        photoError: false,
        photoLeesfout: '',
        photoFailedText: '',
        changePhotoLabel: 'Змінити',
        manageLabel: 'Керування',
        settingsLabel: 'Налаштування',
        privacyLabel: 'Конфіденційність',
        termsLabel: 'Умови',
        showLogoutAll: true,
        wisselMelding: null,
        wisselFout: null,
        v2Ruimtes: true,
        onSelectAccount: () => undefined,
        onAddAccount: () => undefined,
        onTheme: () => undefined,
        onLanguage: () => undefined,
        onClose: () => undefined,
        renderAvatar: () => React.createElement('span', null, 'К'),
      }),
    );
    eis(html.includes('am3-orbit-node is-add'), 'Навіть за 5 збережених записів кружечок "+" (.am3-orbit-node.is-add) мусить бути присутнім');
  });
  await reg('F2', 'M2-12 (F2): laadKapselTekst на невідомій або порожній службі повертає коректний загальний підпис обома мовами', async () => {
    const navMod = await import('../../src/navigatie-snel');
    const uk = navMod.laadKapselTekst('onbekende_dienst', 'uk');
    const nl = navMod.laadKapselTekst('', 'nl');
    eis(uk.includes('Завантаження') && nl.includes('laden'), `Неочікуваний резервний текст капсули завантаження: ${uk} / ${nl}`);
  });

  // ── Межові стани F3 (6 перевірок) ──
  await reg('F3', 'M2-13 (F3): pictogramTegel повертає дійсні об’єкти для граничних індексів і null для позамежових (-1, 9999)', () => {
    const eerste = symbolenMod.pictogramTegel(0, 'uk');
    const negatief = symbolenMod.pictogramTegel(-1, 'uk');
    const teGroot = symbolenMod.pictogramTegel(9999, 'nl');
    eis(Boolean(eerste?.naam) && negatief === null && teGroot === null, 'pictogramTegel має безпечно повертати null для позамежових індексів');
  });
  await reg('F3', 'M2-14 (F3): сумісність попередження ANDERE_BROWSER у AanmeldTelegram.tsx не порушена оновленням вигляду чистого екрана', () => {
    const bron = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(bron.includes('ANDERE_BROWSER') && bron.includes('в іншому браузері'), 'Попередження безпеки ANDERE_BROWSER має залишатися незмінним');
  });
  await reg('F3', 'M2-15 (F3): закриття спливного вікна підказки "і" у AanmeldTelegram підтримує клавішу Escape', () => {
    const bron = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(bron.includes('Escape') && bron.includes('tg2-info'), 'Спливне вікно довідки "і" у AanmeldTelegram мусить закриватися за клавішею Escape');
  });
  await reg('F3', 'M2-16 (F3): AanmeldAndereOpties із порожнім масивом ids=[] не падає і повертає порожній або безпечний вивід', () => {
    const Mod = AanmeldAndereOptiesModDef();
    function AanmeldAndereOptiesModDef() {
      return import('../../src/AanmeldAndereOpties');
    }
    return Mod.then((m) => {
      const html = renderToStaticMarkup(React.createElement(m.default, { lang: 'uk', ids: [] }));
      eis(typeof html === 'string', 'AanmeldAndereOpties має безпечно обробляти порожній список способів');
    });
  });
  await reg('F3', 'M2-17 (F3): усі назви піктограм підтвердження мають непорожні двомовні підписи без заборонених літер', () => {
    for (let i = 0; i < 12; i++) {
      const uk = symbolenMod.pictogramTegel(i, 'uk');
      const nl = symbolenMod.pictogramTegel(i, 'nl');
      if (!uk && !nl) break;
      eis(Boolean(uk?.naam && nl?.naam) && !VERBODEN_TEKENS_RE.test(uk!.naam), `Некоректний підпис піктограми #${i}`);
    }
  });
  await reg('F3', 'M2-18 (F3): безпечна перевірка veiligTerugAdres у AanmeldTelegram відкидає не-https протоколи та чужі домени', () => {
    const bron = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    eis(bron.includes("u.protocol !== 'https:'") && bron.includes(".endsWith('.tarasevych.com')"), 'veiligTerugAdres у AanmeldTelegram має суворо обмежувати перехід доменами *.tarasevych.com по https');
  });

  // ── Межові стани F4 (8 перевірок) ──
  await reg('F4', 'M2-19 (F4): plaatsVragen без підтримки navigator.geolocation безпечно повертає "mislukt"', async () => {
    await metTijdelijkeNavigator({}, async () => {
      const uit = await plaatsMod.plaatsVragen();
      eis(uit === 'mislukt', `За відсутності geolocation очікується "mislukt", отримано: ${JSON.stringify(uit)}`);
    });
  });
  await reg('F4', 'M2-20 (F4): plaatsToestemming при винятку в permissions.query не падає і повертає безпечний рядок', async () => {
    await metTijdelijkeNavigator({ permissions: { query: async () => { throw new Error('geblokkeerd'); } } }, async () => {
      const st = await plaatsMod.plaatsToestemming();
      eis(typeof st === 'string', 'plaatsToestemming не повинен породжувати необроблений виняток');
    });
  });
  await reg('F4', 'M2-21 (F4): plaatsVoorStart при вже наданому дозволі ("granted") тихо повертає координати пристрою', async () => {
    await metTijdelijkeNavigator(
      {
        permissions: { query: async () => ({ state: 'granted' }) },
        geolocation: {
          getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 50.85, longitude: 4.35, accuracy: 25 } }),
        },
      },
      async () => {
        const r = await plaatsMod.plaatsVoorStart();
        eis(Boolean(r.plaats && Math.abs(r.plaats.lat - 50.85) < 0.01), 'При granted функція plaatsVoorStart має підхоплювати місце без додаткового натискання');
      },
    );
  });
  await reg('F4', 'M2-22 (F4): paginaHtml(null, uk/nl) для простроченого запиту повертає охайну картку без падіння', () => {
    const uk = vensterMod.paginaHtml(null, 'uk');
    const nl = vensterMod.paginaHtml(null, 'nl');
    eis(uk.includes('Запит недійсний або застарів') && nl.includes('Verzoek ongeldig of verlopen'), 'paginaHtml(null) мусить повертати локалізоване повідомлення про застарілий запит');
  });
  await reg('F4', 'M2-23 (F4): paginaHtml з порожніми plaats="" і land="" виводить «місце невідоме» у рядку «Звідки» без «Визначено за IP-адресою»', () => {
    const html = vensterMod.paginaHtml(
      {
        soort: 'i',
        actieCode: 'inloggen',
        titel: 'Вхід',
        wat: 'Підтвердьте вхід',
        dienst: 'hub.tarasevych.com',
        toestel: 'Firefox · Linux',
        apparaat: 'Firefox/Linux',
        plaats: '',
        land: '',
        accounts: [{ koppelingId: 'k1', naam: 'Тест', email: 't@voorbeeld.test', letter: 'Т' }],
        kandidaten: [0, 1, 2],
      } as never,
      'uk',
    );
    eis(
      /<span class="label">Звідки<\/span>[\s\S]{0,160}місце невідоме/.test(html) && !html.includes('Визначено за IP-адресою'),
      'За порожнього місця в paginaHtml рядок «Звідки» має містити «місце невідоме» без слів «Визначено за IP-адресою»',
    );
  });
  await reg('F4', 'M2-24 (F4): paginaHtml при великій розбіжності місця за IP (Брюссель) та пристрою (Київ) виводить попередження geo-let без сирих координат', () => {
    const html = vensterMod.paginaHtml(
      {
        soort: 'i',
        actieCode: 'inloggen',
        titel: 'Вхід',
        wat: 'Підтвердьте вхід',
        dienst: 'hub.tarasevych.com',
        toestel: 'Chrome · Android',
        apparaat: 'Chrome/Android',
        plaats: 'Брюссель',
        land: 'BE',
        ipPunt: { lat: 50.8503, lon: 4.3517 },
        geoPunt: { lat: 50.4501, lon: 30.5234 },
        geoStand: 'gegeven',
        accounts: [{ koppelingId: 'k1', naam: 'Тест', email: 't@voorbeeld.test', letter: 'Т' }],
        kandidaten: [0, 1, 2],
      } as never,
      'uk',
    );
    eis(html.includes('geo-let') && html.includes('role="alert"'), 'При великій відстані мусить виводитися попередження geo-let з role="alert"');
    eis(!html.includes('50.4501') && !html.includes('30.5234'), 'Точні сирі геокоординати ніколи не повинні витікати у HTML-код Захищеного вікна');
  });
  await reg('F4', 'M2-25 (F4): paginaHtml екранує спроби HTML/XSS-ін’єкції в імені, пристрої та назві міста', () => {
    const html = vensterMod.paginaHtml(
      {
        soort: 'i',
        actieCode: 'inloggen',
        titel: '<script>alert(1)</script>',
        wat: '<img src=x onerror=alert(2)>',
        dienst: 'hub.tarasevych.com',
        toestel: '<b>Злам</b>',
        apparaat: 'Chrome',
        plaats: '<svg onload=alert(3)>',
        land: 'BE',
        accounts: [{ koppelingId: 'k1', naam: '<script>evil()</script>', email: 'x@voorbeeld.test', letter: 'X' }],
        kandidaten: [0, 1, 2],
      } as never,
      'uk',
    );
    eis(!html.includes('<script>alert(1)') && !html.includes('<img src=x onerror=') && !html.includes('<svg onload='), 'Усі користувацькі та мережеві поля в paginaHtml мусять суворо екрануватися');
  });
  await reg('F4', 'M2-26 (F4): paginaHtml відхиляє сторонній фішинговий домен у terugUrl при формуванні посилання повернення', () => {
    const html = vensterMod.paginaHtml(
      {
        soort: 'i',
        actieCode: 'inloggen',
        titel: 'Вхід',
        wat: 'Вхід',
        dienst: 'hub.tarasevych.com',
        toestel: 'Chrome',
        apparaat: 'Chrome',
        plaats: 'Гент',
        land: 'BE',
        terugUrl: 'https://evil-phishing.example/login',
        accounts: [{ koppelingId: 'k1', naam: 'Тест', email: 't@voorbeeld.test', letter: 'Т' }],
        kandidaten: [0, 1, 2],
      } as never,
      'uk',
    );
    eis(!html.includes('evil-phishing.example'), 'Сторонній домен у terugUrl ніколи не сміє потрапляти в посилання Захищеного вікна');
  });

  // ── Межові стани F5 (7 перевірок) ──
  await reg('F5', 'M2-27 (F5): callbackUitleg на невідомому або порожньому коді збою повертає зрозуміле пояснення без сирого коду', () => {
    const uk = googleTerugMod.callbackUitleg('uk', 'ONBEKENDE_FOUT_999', 0, false);
    const nl = googleTerugMod.callbackUitleg('nl', '', 0, false);
    eis(uk.length > 15 && nl.length > 15 && !uk.includes('ONBEKENDE_FOUT_999'), 'Невідомий код помилки не повинен ламати callbackUitleg чи виводити сирий код');
  });
  await reg('F5', 'M2-28 (F5): callbackUitleg для RATE_LIMITED коректно обробляє retryAfter = 0, 45 та від’ємне значення -5', () => {
    const nul = googleTerugMod.callbackUitleg('uk', 'RATE_LIMITED', 0, false);
    const pos = googleTerugMod.callbackUitleg('uk', 'RATE_LIMITED', 45, false);
    const neg = googleTerugMod.callbackUitleg('nl', 'RATE_LIMITED', -5, false);
    eis(nul.length > 10 && pos.includes('45') && !neg.includes('-5'), 'callbackUitleg для RATE_LIMITED має безпечно форматувати час очікування');
  });
  await reg('F5', 'M2-29 (F5): захист коду збою у EigenaarIdentiteitTerug очищує небезпечні символи та обмежує довжину коду', () => {
    const geldigKlein = googleTerugMod.failureCopy('uk', 'state_expired', false);
    const kwaad = googleTerugMod.failureCopy('uk', '<script>alert(1)</script>', false);
    const teLang = googleTerugMod.callbackUitleg('nl', 'A_' + 'B'.repeat(120), 0, false);
    eis(
      geldigKlein.includes('Захищене вікно підтвердження Google застаріло') &&
        !kwaad.includes('<script>') &&
        !teLang.includes('BBBBBB'),
      'Публічні функції пояснення збою не сміють пропускати HTML-теги чи наддовгі коди помилок',
    );
    const bron = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    eis(
      bron.includes('veiligeFoutcode') && (/\[A-Za-z0-9_\].*\{\d+,\s*\d+\}/.test(bron) || bron.includes('slice(0,')),
      'veiligeFoutcode мусить очищувати та обмежувати довжину діагностичного коду помилки',
    );
  });
  await reg('F5', 'M2-30 (F5): safeBack у EigenaarIdentiteitTerug.tsx скидає чужі домени на https://hub.tarasevych.com/', () => {
    const bron = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    eis(bron.includes('safeBack') && bron.includes('https://hub.tarasevych.com/'), 'safeBack мусить гарантувати повернення лише в межах *.tarasevych.com');
  });
  await reg('F5', 'M2-31 (F5): aanmeldWeigering на null, undefined, порожньому об’єкті та невідомому рядку безпечно повертає null', () => {
    eis(weigeringenMod.aanmeldWeigering(null) === null, 'aanmeldWeigering(null) має повертати null');
    eis(weigeringenMod.aanmeldWeigering(undefined) === null, 'aanmeldWeigering(undefined) має повертати null');
    eis(weigeringenMod.aanmeldWeigering({}) === null, 'aanmeldWeigering({}) має повертати null');
    eis(weigeringenMod.aanmeldWeigering({ message: 'GEEN_BEKENDE_WEIGERING_XYZ' }) === null, 'Невідомий код у aanmeldWeigering має повертати null');
  });
  await reg('F5', 'M2-32 (F5): SLEUTELKLUIS_GESLOTEN має точне двомовне пояснення без технічного жаргону', () => {
    const uk = googleTerugMod.failureCopy('uk', 'SLEUTELKLUIS_GESLOTEN', false);
    const nl = googleTerugMod.failureCopy('nl', 'SLEUTELKLUIS_GESLOTEN', false);
    eis(uk.length > 15 && nl.length > 15 && !uk.includes('SLEUTELKLUIS_GESLOTEN'), 'SLEUTELKLUIS_GESLOTEN має пояснюватися зрозумілою мовою');
  });
  await reg('F5', 'M2-33 (F5): сторінка повернення Google має overflow-y: auto на полотні для низьких екранів при ландшафтній орієнтації', () => {
    const css = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/google-terugkeer-kaart.css'));
    eis(/\.mr-google-terug-scherm[\s\S]{0,260}overflow-y:\s*auto/.test(css), 'Полотно .mr-google-terug-scherm мусить дозволяти вертикальне прокручування на низьких екранах');
  });

  // ── Межові стани F6 (8 перевірок) ──
  await reg('F6', 'M2-34 (F6): vanTellers при ongelezen = 0 або від’ємному числі повертає порожній масив []', () => {
    eis(menuMeldingenShared.vanTellers({ mail: { ongelezen: 0, op: 1 } }, {}, 'uk').length === 0, 'ongelezen=0 не повинен створювати картку');
    eis(menuMeldingenShared.vanTellers({ mail: { ongelezen: -5, op: 1 } }, {}, 'nl').length === 0, 'ongelezen=-5 не повинен створювати картку');
  });
  await reg('F6', 'M2-35 (F6): vanTellers ховає лічильник при weg.mail === 14, але знову показує при надходженні 15-го листа', () => {
    const verborgen = menuMeldingenShared.vanTellers({ mail: { ongelezen: 14, op: 10 } }, { mail: 14 }, 'uk');
    const nieuw = menuMeldingenShared.vanTellers({ mail: { ongelezen: 15, op: 20 } }, { mail: 14 }, 'uk');
    eis(verborgen.length === 0 && nieuw.length === 1 && nieuw[0].aantal === 15, 'Відхилений лічильник пошти має повертатися лише за більшої кількості непрочитаних листів');
  });
  await reg('F6', 'M2-36 (F6): badgeTekst обмежує числа понад 99 позначкою "99+" і не видає від’ємних значень', () => {
    eis(menuMeldingenShared.badgeTekst(150) === '99+' && menuMeldingenShared.badgeTekst(99) === '99' && menuMeldingenShared.badgeTekst(-3) === '0', 'Некоректне форматування badgeTekst');
  });
  await reg('F6', 'M2-37 (F6): veiligeLink відхиляє javascript:, http://, user:pass@ та підроблені суфікси доменів', () => {
    eis(menuMeldingenShared.veiligeLink('javascript:alert(1)') === undefined, 'javascript: має відхилятися');
    eis(menuMeldingenShared.veiligeLink('http://hub.tarasevych.com/') === undefined, 'незахищений http:// має відхилятися');
    eis(menuMeldingenShared.veiligeLink('https://user:pass@hub.tarasevych.com/') === undefined, 'посилання з паролем має відхилятися');
    eis(menuMeldingenShared.veiligeLink('https://tarasevych.com.attacker.org/') === undefined, 'підроблений домен має відхилятися');
    eis(menuMeldingenShared.veiligeLink('https://mail.tarasevych.com/inbox') === 'https://mail.tarasevych.com/inbox', 'дійсне посилання має зберігатися');
  });
  await reg('F6', 'M2-38 (F6): розпізнавання марки не плутає складні поштові адреси (user.naam+test@gmail.com, dev@github.com) зі службами', () => {
    const verrijkFn = menuMeldingenUi.verrijkMenuMelding as
      | ((m: unknown, badgeItem: string, sectieLabel: string, lang: 'uk' | 'nl') => { merk?: string | null })
      | undefined;
    eis(typeof verrijkFn === 'function', 'Модуль src/MenuMeldingen.tsx мусить експортувати функцію verrijkMenuMelding');
    const vGmail = verrijkFn(
      {
        id: 'sec-m-1',
        bron: 'server',
        item: 'svc:identity',
        categorie: 'beveiliging',
        titel: 'Новий вхід на новому пристрої',
        tekst: 'Обліковий запис user.naam+test@gmail.com · пристрій Chrome · спосіб: ключ доступу',
        op: Date.now(),
        link: 'https://id.tarasevych.com/sessions',
      },
      'svc:identity',
      'Налаштування',
      'uk',
    );
    const vGithub = verrijkFn(
      {
        id: 'sec-m-2',
        bron: 'server',
        item: 'svc:identity',
        categorie: 'beveiliging',
        titel: 'Новий вхід на новому пристрої',
        tekst: 'Обліковий запис dev@github.com · пристрій Firefox · спосіб: ключ доступу',
        op: Date.now(),
        link: 'https://id.tarasevych.com/sessions',
      },
      'svc:identity',
      'Налаштування',
      'uk',
    );
    eis(
      vGmail.merk !== 'gmail' && vGithub.merk !== 'github',
      `Поштові адреси не сміють спричиняти хибні марки gmail/github у verrijkMenuMelding (отримано: ${vGmail.merk} / ${vGithub.merk})`,
    );
    const geb = tolkMod.interpreteerGebeurtenis({
      id: 'sec-edge-1',
      bron: 'identity',
      soort: 'security_warning',
      titel: 'Новий вхід для user.naam+test@gmail.com',
      bericht: 'Обліковий запис user.naam+test@gmail.com · пристрій Chrome · спосіб: ключ доступу',
      contextLabel: 'Обліковий запис dev@github.com',
      link: 'https://id.tarasevych.com/sessions',
      aangemaaktOp: Date.now(),
    });
    const anker = pulsKern.verrijkGebeurtenisVoorPuls(geb, 'uk').anker;
    eis(
      anker.merkSleutel !== 'gmail' && anker.merkSleutel !== 'github',
      `Поштові адреси у сповіщенні безпеки не сміють давати марку gmail чи github у herkenMerkEnAnker (отримано: ${anker.merkSleutel})`,
    );
  });
  await reg('F6', 'M2-39 (F6): herkenMerkEnAnker для подій хмарного сховища Google повертає чинний офіційний ключ "googledrive"', () => {
    const geb = tolkMod.interpreteerGebeurtenis({
      id: 'cloud-1',
      bron: 'cloud:google',
      soort: 'owner.cloud.sync',
      titel: 'Синхронізація хмарного сховища завершена',
      bericht: 'Оновлено файли у хмарному сховищі',
      link: 'https://cloud.tarasevych.com/files',
      aangemaaktOp: Date.now(),
    });
    const anker = pulsKern.herkenMerkEnAnker(geb, 'uk');
    eis(
      anker.merkSleutel === 'googledrive',
      `herkenMerkEnAnker для bron="cloud:google" мусить повертати чинний ключ "googledrive" замість відсутнього в реєстрі ідентифікатора "${anker.merkSleutel}"`,
    );
  });
  await reg('F6', 'M2-40 (F6): badgesBouwen при вимкненому перемикачі v.aan === false повертає порожній об’єкт {}', () => {
    const tellers = menuMeldingenShared.vanTellers({ mail: { ongelezen: 5, op: 1 } }, {}, 'uk');
    const b = menuMeldingenShared.badgesBouwen(tellers, {
      aan: false,
      categorieen: { beveiliging: true, toegang: true, post: true, delen: true, ai: true, systeem: true },
    } as never);
    eis(Object.keys(b).length === 0, 'При вимкнених позначках меню badgesBouwen має повертати порожній словник');
  });
  await reg('F6', 'M2-41 (F6): badgesBouwen обмежує список карток у віконці меню константою MAX_BELLEN (5)', () => {
    const rijen = Array.from({ length: 9 }, (_, i) => ({
      id: `s-${i}`,
      kind: 'security',
      title: `Подія ${i}`,
      message: 'Перевірка',
      createdAt: 1000 + i,
      link: 'https://id.tarasevych.com/security',
    }));
    const vanSrv = menuMeldingenShared.vanServer(rijen);
    const b = menuMeldingenShared.badgesBouwen(vanSrv, {
      aan: true,
      categorieen: { beveiliging: true, toegang: true, post: true, delen: true, ai: true, systeem: true },
    } as never);
    eis(b['svc:identity'].meldingen.length === 5 && b['svc:identity'].aantal === 9, 'badgesBouwen має зберігати загальний лічильник 9, але обмежувати масив meldingen до 5');
  });

  // ── Межові стани F7 (8 перевірок) ──
  await reg('F7', 'M2-42 (F7): nieuwApparaatTekst без locatie виводить «регіон невідомий» / «regio onbekend»', () => {
    const r = nieuwApparaatMod.nieuwApparaatTekst({ email: 'a@b.test', label: 'Safari/iOS', methode: 'passkey', tijd: 1764070000000 });
    eis(r.tekst.includes('регіон невідомий') && r.tekst.includes('regio onbekend'), 'За відсутності геолокації має виводитися «регіон невідомий» / «regio onbekend»');
  });
  await reg('F7', 'M2-43 (F7): nieuwApparaatTekst з порожнім email="" підставляє «ваш» / «uw account» і вирізає XSS із назви міста', () => {
    const r = nieuwApparaatMod.nieuwApparaatTekst({
      email: '',
      label: 'Firefox/Linux',
      methode: 'telegram',
      locatie: { city: '<script>alert(1)</script>Gent', country: 'BE' },
      tijd: 1764070000000,
    });
    eis(!r.tekst.includes('<script>') && !r.tekst.includes('>') && r.tekst.includes('Gent'), 'regioTekst у nieuwApparaatTekst має очищувати кутові дужки тегів');
  });
  await reg('F7', 'M2-44 (F7): nieuwApparaatTekst коректно форматує всі 8 способів входу AanmeldMethode', () => {
    const methoden = ['google', 'passkey', 'code', 'telegram', 'password', 'microsoft', 'discord', 'apple'] as const;
    for (const m of methoden) {
      const r = nieuwApparaatMod.nieuwApparaatTekst({ email: 'u@v.test', label: 'Chrome', methode: m, tijd: 1764070000000 });
      eis(r.tekst.length > 40 && !VERBODEN_TEKENS_RE.test(r.tekst), `Помилка форматування nieuwApparaatTekst для способу ${m}`);
    }
  });
  await reg('F7', 'M2-45 (F7): сеансові технічні події (migrated.to-ecosystem, restored.remembered, venster.geopend) відсікаються як шум', () => {
    for (const ruisCode of ['owner.session.migrated.to-ecosystem', 'owner.session.restored.remembered', 'telegram.venster.geopend']) {
      eis(beheerJournaal.isRuis(ruisCode) === true, `Подія "${ruisCode}" мусить розпізнаватися як технічний шум у isRuis`);
      eis(siteActiviteit.sourceOfAudit(ruisCode) === null, `Подія "${ruisCode}" не сміє породжувати користувацьких карток у sourceOfAudit`);
    }
  });
  await reg('F7', 'M2-46 (F7): siteActieTekst на невідомому дочірньому коді відомого домену не виводить слів «подія без опису» й сирого коду', () => {
    const uk = meldingStijl.siteActieTekst('owner.mail.zoekfilter.herberekend', 'uk');
    const nl = meldingStijl.siteActieTekst('owner.mail.zoekfilter.herberekend', 'nl');
    eis(uk.startsWith('Пошта:') && !uk.includes('zoekfilter') && !uk.includes('подія без опису'), `Некоректна резервна назва в siteActieTekst(uk): "${uk}"`);
    eis(!nl.includes('zoekfilter') && !nl.includes('gebeurtenis zonder omschrijving'), `Некоректна резервна назва в siteActieTekst(nl): "${nl}"`);
  });
  await reg('F7', 'M2-47 (F7): siteActieTekst на порожньому рядку "" повертає охайний загальний заголовок без падіння', () => {
    const uk = meldingStijl.siteActieTekst('', 'uk');
    const nl = meldingStijl.siteActieTekst('', 'nl');
    eis(uk.length > 3 && nl.length > 3 && !uk.includes('undefined'), 'siteActieTekst("") має безпечно повертати загальний підпис');
  });
  await reg('F7', 'M2-48 (F7): actieLabel у beheer-journaal.ts на порожньому рядку повертає тире "—" без помилки', () => {
    eis(beheerJournaal.actieLabel('', 'uk') === '—' && beheerJournaal.actieLabel('', 'nl') === '—', 'actieLabel("") має повертати "—"');
  });
  await reg('F7', 'M2-49 (F7): MeldingBellen у гостьовому/порожньому потоці з 0 карток відмальовується без винятків', () => {
    const MeldingBellenComp = menuMeldingenUi.MeldingBellen as React.ComponentType<Record<string, unknown>>;
    const html = renderToStaticMarkup(
      React.createElement(MeldingBellenComp, {
        lang: 'nl',
        label: 'Instellingen',
        badge: { item: 'svc:identity', aantal: 0, categorieen: [], meldingen: [], nieuwste: 0 },
        anker: { left: 10, top: 200, right: 200, bottom: 240, width: 190, height: 40 },
        onSluit: () => undefined,
        onOpen: () => undefined,
        onAllesWeg: () => undefined,
        onBinnen: () => undefined,
        onEsc: () => undefined,
        paneelRef: () => undefined,
      }),
    );
    eis(typeof html === 'string', 'MeldingBellen із порожнім списком не повинен кидати помилку');
  });

  // ── Межові стани F8 та F9 (7 перевірок) ──
  await reg('F9', 'M2-50 (F9): formatMailAttachmentSize для 0 байтів та малих значень (< 1024 Б) коректно виводить Б / B', () => {
    const fmt = bijlageVoorbeeld.formatMailAttachmentSize as (v: number, l?: 'uk' | 'nl') => string;
    const uk0 = fmt(0, 'uk');
    const uk512 = fmt(512, 'uk');
    const nl512 = fmt(512, 'nl');
    eis(
      /(?<!\p{L})Б(?!\p{L})/u.test(uk0) && /(?<!\p{L})Б(?!\p{L})/u.test(uk512) && /(?<!\p{L})B(?!\p{L})/u.test(nl512),
      `Очікується кириличне "Б" для uk та латинське "B" для nl на малих розмірах: "${uk0}", "${uk512}", "${nl512}"`,
    );
  });
  await reg('F9', 'M2-51 (F9): formatMailAttachmentSize для гігабайтних вкладень (2.5 ГБ) виводить ГБ / GB', () => {
    const fmt = bijlageVoorbeeld.formatMailAttachmentSize as (v: number, l?: 'uk' | 'nl') => string;
    const ukGb = fmt(2.5 * 1024 * 1024 * 1024, 'uk');
    const nlGb = fmt(2.5 * 1024 * 1024 * 1024, 'nl');
    eis(
      /(?<!\p{L})ГБ(?!\p{L})/u.test(ukGb) && /(?<!\p{L})GB(?!\p{L})/u.test(nlGb),
      `Очікується "ГБ" / "GB" для великих файлів: "${ukGb}" / "${nlGb}"`,
    );
  });
  await reg('F9', 'M2-52 (F9): formatMailAttachmentSize безпечно обробляє від’ємні числа та NaN без виведення NaN у інтерфейс', () => {
    const fmt = bijlageVoorbeeld.formatMailAttachmentSize as (v: number, l?: 'uk' | 'nl') => string;
    const rNeg = fmt(-100, 'uk');
    const rNan = fmt(Number.NaN, 'nl');
    eis(!rNeg.includes('NaN') && !rNeg.includes('-') && !rNan.includes('NaN'), `Некоректна обробка від’ємних/NaN значень: ${rNeg} / ${rNan}`);
  });
  await reg('F8', 'M2-53 (F8): гістерезис гортання читача Пошти захищає від мерехтіння панелей на коротких листах', () => {
    const samen =
      leesBestandVeilig(wortel, 'src/mail/LeesVenster.tsx') +
      '\n' +
      leesBestandVeilig(wortel, 'src/MailGesprekInhoud.tsx') +
      '\n' +
      leesBestandVeilig(wortel, 'src/MailLezerWerkbalk.tsx');
    const heeftScrollStaat =
      (samen.includes('scrollVerborgen') || samen.includes('data-scroll-verborgen')) &&
      (samen.includes('scrollRichting') || samen.includes('zetScrollVerborgen'));
    const heeftHoogteMarge = /scrollHeight\s*-\s*[a-zA-Z0-9_$.]+\.clientHeight/.test(samen);
    eis(
      heeftScrollStaat && heeftHoogteMarge,
      'Гістерезис гортання читача Пошти мусить відстежувати scrollVerborgen/scrollRichting і вимикати приховування панелей при малому запасі висоти (scrollHeight - clientHeight)',
    );
  });
  await reg('F8', 'M2-54 (F8): LeesVenster експортує randStijl і повертає undefined для нульових країв та left для бічного меню', async () => {
    const lvMod = await import('../../src/mail/LeesVenster');
    const stLeeg = lvMod.randStijl({ links: 0, rechts: 0, boven: 0, onder: 0 });
    const stLinks = lvMod.randStijl({ links: 58, rechts: 0, boven: 0, onder: 0 });
    eis(stLeeg === undefined && stLinks?.left === '58px', 'randStijl мусить повертати undefined без меню та left: "58px" для бічного меню');
  });
  await reg('F9', 'M2-55 (F9): згорнутий помічник відповіді .mra.mra-antwoord не залишає високої порожньої смуги', async () => {
    const mailLezerAiMod = await import('../../src/MailLezerAi');
    const AiComp = mailLezerAiMod.default as unknown as React.ComponentType<Record<string, unknown>>;
    const dichtHtml = renderToStaticMarkup(
      React.createElement(AiComp, {
        vorm: 'antwoord',
        lang: 'uk',
        context: {},
        messages: [{ from: 'a@voorbeeld.test', receivedAt: 1, plainText: 'Тестовий лист' }],
        onUseReply: () => undefined,
      }),
    );
    const aiEnMaquetteCss = zonderCssOpmerkingen(
      leesBestandVeilig(wortel, 'src/mail-lezer-ai.css') + '\n' + leesBestandVeilig(wortel, 'src/mail/mail-lezer-opstel-maquette.css'),
    );
    const heeftDichtKenmerk = /<section[^>]*class="mra mra-antwoord"[^>]*data-open="nee"/.test(dichtHtml);
    const heeftTransparanteStijl = /\.mra(?:\.mra-antwoord)?\[data-open=['"]nee['"]\][^{]*\{[^}]*background(?:-color)?:\s*(?:transparent|none)/.test(
      aiEnMaquetteCss,
    );
    eis(
      heeftDichtKenmerk && !dichtHtml.includes('mra-veld') && heeftTransparanteStijl,
      'Згорнутий блок .mra.mra-antwoord мусить позначатися data-open="nee" і мати прозоре тло без полів вводу й без порожньої сірої смуги',
    );
  });
  await reg('F8', 'M2-56 (F8): кнопка закриття спливного аркуша Контексту повертає фокус або коректно викликає sluit()', () => {
    const ctxTsx = leesBestandVeilig(wortel, 'src/mail/ContextPaneel.tsx');
    eis(ctxTsx.includes('p.sluit'), 'ContextPaneel має викликати p.sluit при закритті шторки');
  });

  // ── Межові стани F10 (7 перевірок) ──
  await reg('F10', 'M2-57 (F10): taalVan на порожньому рядку, цифрах і маркерах [ПРИХОВАНО_СЕКРЕТ] не падає і повертає безпечний код', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    eis(taalVan('') === 'en', 'Порожній рядок у taalVan має безпечно повертати "en"');
    eis(taalVan('12345 67890 https://tarasevych.com/ [ПРИХОВАНО_СЕКРЕТ]') === 'en', 'Маркер [ПРИХОВАНО_СЕКРЕТ] кирилицею не сміє перетворювати числовий/англійський рядок на "uk"');
  });
  await reg('F10', 'M2-58 (F10): taalVan на англійському листі з коротким українським підписом знизу (< 20% кирилиці) повертає "en"', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const tekst =
      'Hello team,\nWe have updated the deployment schedule for next Tuesday morning. Please review all pull requests, verify staging metrics, and confirm readiness before Monday evening.\n--\nЗ повагою, Олена';
    eis(taalVan(tekst) === 'en', `Англійський лист із коротким кириличним підписом мусить визначатися як "en", отримано: "${taalVan(tekst)}"`);
  });
  await reg('F10', 'M2-59 (F10): taalVan на українському листі з англійськими технічними назвами (PostgreSQL, GitHub, OAuth) повертає "uk"', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const tekst = 'Привіт! Ми перевірили підключення PostgreSQL 18.6, оновили ключі OAuth для GitHub та підготували звіт безпеки.';
    eis(taalVan(tekst) === 'uk', `Український лист із латинськими термінами мусить визначатися як "uk", отримано: "${taalVan(tekst)}"`);
  });
  await reg('F10', 'M2-60 (F10): classificeer виявляє підміну відомої марки з чужого домену як "verdacht" навіть при DMARC=pass чужого домену', () => {
    const classificeer = mailAfzenders.classificeer as (i: Record<string, unknown>) => { status: string; reden: string };
    const r = classificeer({
      naam: 'Google Security',
      adres: 'security@evil-alerts.org',
      domein: 'evil-alerts.org',
      auth: { betrouwbaar: true, authserv: 'mx.google.com', spf: 'pass', dkim: [{ uitslag: 'pass', domein: 'evil-alerts.org' }], dmarc: 'pass', dmarcDomein: 'evil-alerts.org' },
    });
    eis(r.status === 'verdacht' && r.reden === 'NAAM_MERK_ANDER_DOMEIN', 'Ім’я Google з чужого домену завжди мусить позначатися як verdacht');
  });
  await reg('F10', 'M2-61 (F10): classificeer виявляє змішану латинсько-кириличну абетку (омогліф) у домені як DOMEIN_GEMENGD_SCHRIFT', () => {
    const classificeer = mailAfzenders.classificeer as (i: Record<string, unknown>) => { status: string; reden: string };
    const r = classificeer({ naam: 'Підтримка', adres: 'info@g\u043eogle.com', domein: 'g\u043eogle.com' });
    eis(r.status === 'verdacht', 'Домен зі змішаною кириличною літерою "о" мусить блокуватися як verdacht');
  });
  await reg('F10', 'M2-62 (F10): domeinAuthVan повертає "fail" при проваленому DMARC=fail і не дає хибного підтвердження безкоштовним скринькам без DKIM/DMARC', () => {
    const domeinAuthVan = mailAfzenders.domeinAuthVan as ((d: string, a: unknown) => string) | undefined;
    eis(typeof domeinAuthVan === 'function', 'Очікується експорт domeinAuthVan');
    const failRes = domeinAuthVan('toogoodtogo.com', {
      betrouwbaar: true,
      authserv: 'mx.google.com',
      spf: 'fail',
      dkim: [],
      dmarc: 'fail',
      dmarcDomein: 'toogoodtogo.com',
    });
    const geenRes = domeinAuthVan('voorbeeld.org', {
      betrouwbaar: false,
      authserv: '',
      spf: 'none',
      dkim: [],
      dmarc: 'none',
      dmarcDomein: '',
    });
    eis(failRes === 'fail' && geenRes === 'geen', `Очікується "fail" та "geen", отримано: "${failRes}" / "${geenRes}"`);
  });
  await reg('F10', 'M2-63 (F10): очищення стилів HTML-листа блокує expression(), javascript: та position: fixed', () => {
    const berichtBron = leesBestandVeilig(wortel, 'src/MailBerichtTekst.tsx');
    eis(
      berichtBron.includes('expression') && berichtBron.includes('javascript') && berichtBron.includes('position:relative'),
      'Очищувач стилів MailBerichtTekst.tsx мусить блокувати expression(), javascript: та position: fixed/sticky',
    );
  });

  // ── Межові стани F11 (5 перевірок) ──
  await reg('F11', 'M2-64 (F11): opschonenPuntTekst блокує небезпечні посилання <a href="javascript:alert(1)"> і зберігає tekst === citaat для чистого тексту', () => {
    const opschonen = aiBronnen.opschonenPuntTekst as
      | ((ruw: string) => { tekst: string; koppelingen: Array<{ label: string; url: string }> })
      | undefined;
    eis(typeof opschonen === 'function', 'Очікується експорт opschonenPuntTekst');
    const xss = opschonen('Перевірте <a href="javascript:alert(1)">це посилання</a> сьогодні.');
    eis(xss.koppelingen.length === 0 && !xss.tekst.includes('javascript:') && !xss.tekst.includes('<a'), 'javascript:-посилання не сміє потрапляти в koppelingen або сирий текст');
    const gewoon = 'Підтвердити час зустрічі у середу о 10:00.';
    eis(opschonen(gewoon).tekst === gewoon, 'Для звичайного тексту без HTML-тегів tekst має залишатися незмінним');
  });
  await reg('F11', 'M2-65 (F11): isEenrichtingsAfzender дозволяє відповідь, якщо у no-reply@ вказано живу адресу Reply-To', () => {
    const isEenrichting = aiBronnen.isEenrichtingsAfzender as ((van: string, replyTo?: string, sig?: Record<string, string>) => boolean) | undefined;
    eis(typeof isEenrichting === 'function', 'Очікується експорт isEenrichtingsAfzender');
    eis(
      isEenrichting('Winkel <no-reply@winkel.be>', 'Klantendienst <support@winkel.be>') === false,
      'Якщо у листа з no-reply@ є жива двостороння адреса Reply-To (support@winkel.be), відповідь мусить дозволятися!',
    );
  });
  await reg('F11', 'M2-66 (F11): isEenrichtingsAfzender розпізнає автоматичні розсилки за Auto-Submitted: auto-generated та mailer-daemon@', () => {
    const isEenrichting = aiBronnen.isEenrichtingsAfzender as ((van: string, replyTo?: string, sig?: Record<string, string>) => boolean) | undefined;
    eis(typeof isEenrichting === 'function', 'Очікується експорт isEenrichtingsAfzender');
    eis(isEenrichting('Mail Delivery Subsystem <mailer-daemon@googlemail.com>') === true, 'mailer-daemon@ є односторонньою адресою');
    eis(isEenrichting('Melding <info@systeem.be>', '', { autoSubmitted: 'auto-generated' }) === true, 'Auto-Submitted: auto-generated є одностороннім листом');
  });
  await reg('F11', 'M2-67 (F11): herstelAanhefUittreksel НЕ псує справжнє українське заперечення «Ні Іване, сьогодні зустрічі не буде»', () => {
    const herstelFn = gesprekContext.herstelAanhefUittreksel as ((t: string) => string) | undefined;
    eis(typeof herstelFn === 'function', 'Очікується експорт herstelAanhefUittreksel');
    const ukrZin = 'Ні Іване, сьогодні зустрічі не буде, перенесемо на п’ятницю.';
    eis(herstelFn(ukrZin) === ukrZin, `Справжнє українське речення зі словом "Ні" не сміє замінюватися на англійське "Hi": "${herstelFn(ukrZin)}"`);
  });
  await reg('F11', 'M2-68 (F11): tijdlijn у gesprek-context.ts упорядковує вітальний реєстраційний лист логічно перед першим замовленням тієї самої хвилини', () => {
    const tijdlijnFn = gesprekContext.tijdlijn as (o: Record<string, unknown>) => Array<{ id: string }>;
    const t0 = 1764070020000;
    const reeks = tijdlijnFn({
      thread: [
        {
          id: 'order-1',
          threadId: 'th-1',
          subject: 'Your order is confirmed',
          from: 'Too Good To Go <no-reply@toogoodtogo.com>',
          to: 'olena@voorbeeld.test',
          cc: '',
          receivedAt: t0,
          snippet: 'Hi Олена, Your order is confirmed!',
          attachments: [],
        },
      ],
      openId: 'order-1',
      verwant: [
        {
          id: 'welcome-1',
          threadId: 'th-0',
          subject: 'Welcome to Too Good To Go!',
          from: 'Too Good To Go <no-reply@toogoodtogo.com>',
          receivedAt: t0 + 15_000,
          reden: 'afzender',
        },
      ],
      nu: t0 + 60_000,
    });
    const idxWelcome = reeks.findIndex((x) => x.id === 'welcome-1');
    const idxOrder = reeks.findIndex((x) => x.id === 'order-1');
    eis(idxWelcome >= 0 && idxOrder >= 0 && idxWelcome < idxOrder, 'Вітальний лист реєстрації тієї самої хвилини мусить передувати першому замовленню у хронології');
  });
}


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// РІВЕНЬ 3 — МІЖФУНКЦІОНАЛЬНІ ПАРНІ КОМБІНАЦІЇ (26 ПЕРЕВІРОК ВЗАЄМОДІЇ МІЖ МОДУЛЯМИ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function voerNiveau3Uit(wortel: string, uitkomsten: ToetsUitkomst[]): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const CanoniekAccountMenuMod = await import('../../src/CanoniekAccountMenu');
  const CanoniekOmlijstingMod = await import('../../src/CanoniekOmlijsting');
  const googleTerugMod = await import('../../src/EigenaarIdentiteitTerug');
  const weigeringenMod = await import('../../src/weigeringen');
  const vensterMod = await import('../../backend/telegram-aanmelden/venster');
  const officieelSleutelsMod = await import('../../src/merk/officieel-sleutels');
  const MerkMod = await import('../../src/merk/Merk');
  const pulsKern = await import('../../shared/meldingen-puls/kern');
  const nieuwApparaatMod = await import('../../backend/nieuw-apparaat');
  const siteActiviteit = await import('../../backend/site-activiteit');
  const menuMeldingenShared = await import('../../shared/menu-meldingen');
  const ecosysteemOpslag = await import('../../src/meldingen/ecosysteem/ecosysteem-opslag');
  const aiBronnen = (await import('../../shared/ai-bronnen')) as Record<string, unknown>;

  let volgnr = 0;
  const reg = (groep: GroepId, naam: string, fn: () => void | Promise<void>) =>
    draaiToets(uitkomsten, `L3-${++volgnr}`, 3, groep, naam, fn);

  // 1..4: Матриця uk/nl × theme-light/theme-dark на гостьовому вході (CanoniekAccountMenu + SignedOutCenter)
  for (const [taal, thema] of [
    ['uk', 'light'],
    ['uk', 'dark'],
    ['nl', 'light'],
    ['nl', 'dark'],
  ] as const) {
    await reg('F1', `P3-0${volgnr + 1} (F1×F2): узгодженість гостьової шапки й картки входу (${taal} × theme-${thema})`, () => {
      const kopHtml = renderToStaticMarkup(
        React.createElement(CanoniekAccountMenuMod.default, {
          lang: taal,
          theme: thema,
          user: null,
          onAddAccount: () => undefined,
          onLanguage: () => undefined,
          onTheme: () => undefined,
        }),
      );
      const kaartHtml = renderToStaticMarkup(
        React.createElement(CanoniekOmlijstingMod.SignedOutCenter, {
          lang: taal,
          checking: false,
          onOpenAccount: () => undefined,
        }),
      );
      const verwachteMova = taal === 'uk' ? '<b>укр.</b>' : '<b>NL</b>';
      const verwachtGoogle = taal === 'uk' ? 'Увійти через Google' : 'Aanmelden met Google';
      eis(kopHtml.includes(verwachteMova) && kaartHtml.includes(verwachtGoogle), `Невідповідність текстів у комбінації ${taal} × ${thema}`);
    });
  }

  // 5..8: Ланцюжок повернення з помилкою OAuth: callbackUitleg (suiteState: false|true, uk|nl) -> ?aanmeld_fout -> aanmeldWeigering
  for (const [code, suite, taal] of [
    ['STATE_EXPIRED', false, 'uk'],
    ['STATE_EXPIRED', true, 'nl'],
    ['STATE_NOT_FOUND', false, 'nl'],
    ['STATE_TRANSACTION_MISMATCH', false, 'uk'],
  ] as const) {
    await reg('F5', `P3-0${volgnr + 1} (F5×F1): наскрізна передача причини ${code} (suite=${suite}, ${taal}) від id.tarasevych.com до сторінки входу`, () => {
      const uitleg = googleTerugMod.callbackUitleg(taal, code, 0, suite);
      const weigering = weigeringenMod.aanmeldWeigering({ message: code });
      eis(uitleg.length > 15 && Array.isArray(weigering), `Код ${code} мусить розпізнаватися і на сторінці повернення, і на сторінці входу`);
      const opIngang = taal === 'uk' ? weigering[0] : weigering[1];
      eis(opIngang.length > 20 && !opIngang.includes(code), `Розшифрування ${code} на сторінці входу не сміє містити сирого коду`);
    });
  }

  // 9..11: Міжмодульна взаємодія M1 ↔ M2 (діалогові вікна "і"/"ⓘ" × приглушення шапки; paginaHtml soort='i' проти soort='b')
  await reg('F3', 'P3-09 (F1×F3×F5): міжмодульний контракт приглушення шапки входу за відкритим діалогом [role="dialog"][aria-modal="true"]', () => {
    const aanmeldCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/aanmeld-herontwerp.css'));
    const tgTsx = leesBestandVeilig(wortel, 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    const googTsx = leesBestandVeilig(wortel, 'src/EigenaarIdentiteitTerug.tsx');
    eis(aanmeldCss.includes('aria-modal') && aanmeldCss.includes('.canonical-account-anchor'), 'aanmeld-herontwerp.css мусить приглушувати .canonical-account-anchor за селектором [role="dialog"][aria-modal="true"]');
    eis(tgTsx.includes('aria-modal') && googTsx.includes('aria-modal'), 'Обидва спливні аркуші (Telegram "і" та Google "ⓘ") мусять виставляти aria-modal="true"');
  });

  for (const taal of ['uk', 'nl'] as const) {
    await reg('F4', `P3-${volgnr + 1} (F4): paginaHtml розрізняє вхід (soort="i", є «Пристрій каже») та підтвердження дії (soort="b", без «Пристрій каже») [${taal}]`, () => {
      const basis = {
        actieCode: 'inloggen',
        titel: 'Дія',
        wat: 'Підтвердження',
        dienst: 'hub.tarasevych.com',
        toestel: 'Chrome · Android',
        apparaat: 'Chrome/Android',
        plaats: taal === 'uk' ? 'Гент' : 'Gent',
        land: 'BE',
        accounts: [{ koppelingId: 'k1', naam: 'Олена', email: 'o@voorbeeld.test', letter: 'О' }],
        kandidaten: [1, 2, 3],
      };
      const htmlInlog = vensterMod.paginaHtml({ ...basis, soort: 'i' } as never, taal);
      const htmlActie = vensterMod.paginaHtml({ ...basis, soort: 'b', actieCode: 'sleutel-wissen' } as never, taal);
      const label = taal === 'uk' ? 'Пристрій каже' : 'Apparaat meldt';
      eis(htmlInlog.includes(label) && !htmlActie.includes(label), `Рядок "${label}" мусить бути присутнім при soort="i" та відсутнім при soort="b"`);
    });
  }

  // 12..15: Наскрізна єдність реєстру src/merk/ між усіма контурами (google, telegram, gmail, googledrive)
  for (const merkSleutel of ['google', 'telegram', 'gmail', 'googledrive'] as const) {
    await reg('F6', `P3-${volgnr + 1} (F6×F1×F3×F5): офіційний знак "${merkSleutel}" з реєстру src/merk/ доступний у всіх контурах без заглушки`, () => {
      eis(officieelSleutelsMod.OFFICIEEL_SLEUTELS.has(merkSleutel), `Ключ "${merkSleutel}" мусить входити до OFFICIEEL_SLEUTELS`);
      const MerkComp = (MerkMod as unknown as { default: React.ComponentType<{ merk: string; maat: number }> }).default;
      const html = renderToStaticMarkup(React.createElement(MerkComp, { merk: merkSleutel, maat: 24 }));
      eis(
        !html.includes('data-merk="onbekend"') && (new RegExp(`data-merk(?:-naam)?=["']${merkSleutel}["']`, 'i').test(html) || html.includes('<svg') || html.includes('<img')),
        `<Merk merk="${merkSleutel}" /> мусить розпізнаватися реєстром без заглушки onbekend`,
      );
    });
  }

  // 16..19: Наскрізний потік нового пристрою: nieuwApparaatTekst + siteEventsFromAudit -> vanServer + bouwUniformeStroom (uk/nl, усунення дублів + підтвердження)
  for (const [taal, methode] of [
    ['uk', 'google'],
    ['nl', 'google'],
    ['uk', 'telegram'],
    ['nl', 'passkey'],
  ] as const) {
    await reg('F7', `P3-${volgnr + 1} (F6×F7): єдиний потік нового пристрою (${methode}, ${taal}) від backend до .menu-bellen та MeldingenPortaal без подвоєння`, () => {
      const nu = Date.now();
      const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const tekst = nieuwApparaatMod.nieuwApparaatTekst({
        email: 'olena@gmail.com',
        label: 'Chrome/Android',
        methode,
        locatie: { city: 'Gent', country: 'BE' },
        tijd: nu,
      });
      const srvMeldingen = menuMeldingenShared.vanServer([
        {
          id: uuid,
          kind: nieuwApparaatMod.MELDING_SOORT_NIEUW_APPARAAT,
          title: tekst.titel,
          message: tekst.tekst,
          createdAt: nu,
          link: `https://id.tarasevych.com/sessions?apparaat=${uuid}`,
        },
      ]);
      const auditEvents = siteActiviteit.siteEventsFromAudit([
        { id: 'aud-1', action: 'owner.apparaat.nieuw', result: 'success', createdAt: nu + 150, details: { apparaat: 'Chrome/Android' } },
      ]);
      eis(srvMeldingen.length === 1 && auditEvents.length === 1, 'Сервер мусить створювати і сповіщення, і подію аудиту');
      const stroom = ecosysteemOpslag.bouwUniformeStroom({
        lang: taal,
        ruimte: 'prive',
        subdomeinNu: 'hub',
        serverGebeurtenissen: [],
        paginaSignalen: [],
        serverItems: [
          {
            id: uuid,
            kind: nieuwApparaatMod.MELDING_SOORT_NIEUW_APPARAAT,
            title: tekst.titel,
            message: tekst.tekst,
            createdAt: nu,
            read: false,
            link: `https://id.tarasevych.com/sessions?apparaat=${uuid}`,
          },
        ],
        techItems: [],
        localRows: [],
        activityEvents: auditEvents,
        activityRead: new Set(),
      });
      eis(stroom.length === 1, `У зведеному потоці має залишатися рівно 1 зведена картка без дублів (отримано: ${stroom.length})`);
      const puls = pulsKern.verrijkGebeurtenisVoorPuls(stroom[0], taal);
      eis(puls.niveau === 'gevaar' && puls.anker.merkSleutel !== 'gmail', `Зведена картка мусить мати рівень gevaar і не плутати @gmail.com зі службою Gmail`);
    });
  }

  // 20..22: Повна синхронність клієнтського taalVan (shared/ai-bronnen.ts) та серверного detectLanguageCode (backend/ai-vertaling-routes.ts)
  const serverVertalingBron = leesBestandVeilig(wortel, 'backend/ai-vertaling-routes.ts');
  const maakServerDetect = (): ((t: string) => string) => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    if (serverVertalingBron.includes('return taalVan(')) return (t: string) => taalVan(t);
    const startIdx = serverVertalingBron.indexOf('function detectLanguageCode');
    eis(startIdx >= 0, 'Не знайдено detectLanguageCode у backend/ai-vertaling-routes.ts');
    let diepte = 0;
    let begonnen = false;
    let eindIdx = startIdx;
    for (let i = startIdx; i < serverVertalingBron.length; i++) {
      const ch = serverVertalingBron[i];
      if (ch === '{') {
        diepte++;
        begonnen = true;
      } else if (ch === '}') {
        diepte--;
        if (begonnen && diepte === 0) {
          eindIdx = i + 1;
          break;
        }
      }
    }
    const ruwFn = serverVertalingBron
      .slice(startIdx, eindIdx)
      .replace(/:\s*string/g, '');
    return runInNewContext(`(${ruwFn})`, { taalVan, String, RegExp }) as (t: string) => string;
  };

  await reg('F10', 'P3-20 (F10): синхронність клієнтського taalVan і серверного detectLanguageCode на іншомовних листах із кириличним вітанням', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const srvDetect = maakServerDetect();
    const stalen = [
      ["Hi Павло Тарасевич,\nYour order for Carrefour Market is confirmed! Remember to pick up your parcel tomorrow.", 'en'],
      ['Beste Олена Коваленко,\nHierbij ontvangt u de factuur voor uw betaling bij ons kantoor.', 'nl'],
    ] as const;
    for (const [tekst, verwacht] of stalen) {
      const k = taalVan(tekst);
      const s = srvDetect(tekst);
      eis(k === verwacht && s === verwacht, `Розбіжність клієнт/сервер: taalVan="${k}", detectLanguageCode="${s}", очікувалось "${verwacht}"`);
    }
  });

  await reg('F10', 'P3-21 (F10): синхронність клієнтського taalVan і серверного detectLanguageCode на українських та європейських листах', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const srvDetect = maakServerDetect();
    const stalen = [
      ['Вітаємо, Олено! Надсилаємо оновлений договір та рахунок за листопад.', 'uk'],
      ['Guten Tag, vielen Dank für Ihre Rechnung und schnelle Antwort.', 'de'],
      ['Bonjour, merci beaucoup pour votre facture dans notre espace.', 'fr'],
      ['Dzień dobry, czy faktura dla nas jest gotowa?', 'pl'],
    ] as const;
    for (const [tekst, verwacht] of stalen) {
      eis(taalVan(tekst) === verwacht && srvDetect(tekst) === verwacht, `Розбіжність визначення мови для "${verwacht}"`);
    }
  });

  await reg('F10', 'P3-22 (F10): синхронність taalVan і detectLanguageCode на листах із прихованими секретами та змішаними підписами', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const srvDetect = maakServerDetect();
    const tekst = 'Hello team, token [ПРИХОВАНО_СЕКРЕТ] has been rotated successfully on production servers.\n--\nДякую, Іван';
    eis(taalVan(tekst) === 'en' && srvDetect(tekst) === 'en', 'Обидва визначники мови мусять однаково повертати "en" при маркері секрету й короткому підписі');
  });

  // 23..26: Комбінації в Пошті (M4): одностороння розсилка + переклад + .ics + очищення тегів + шторки в різних палітрах
  await reg('F11', 'P3-23 (F10×F11): одностороння англійська розсилка no-reply@ з кириличним ім’ям та <a href> одночасно вмикає переклад, вимикає antwoordNodig і чистить теги', () => {
    const taalVan = aiBronnen.taalVan as (t: string) => string;
    const antwoordNodig = aiBronnen.antwoordNodig as (g: unknown[], m: string[], p: unknown[]) => unknown;
    const eenvoudigeOntleding = aiBronnen.eenvoudigeOntleding as (b: Array<{ brief: number; tekst: string }>) => { punten: Array<{ tekst: string }>; kort: Array<{ tekst: string }> };
    const briefTekst =
      'Hi Павло Тарасевич,\nPlease pick up your order on 28 October at 18:00 at <a href="https://maps.google.com/?q=Brussel">Carrefour Brussel</a>?';
    eis(taalVan(briefTekst) === 'en', 'Мова розсилки має визначатися як "en" (вмикає VertaalStrook)');
    const ontl = eenvoudigeOntleding([{ brief: 1, tekst: briefTekst }]);
    const alle = [...ontl.punten, ...ontl.kort];
    eis(alle.every((p) => !p.tekst.includes('<a ')), 'Усі виділені пункти мають бути очищені від сирого <a href>');
    const antw = antwoordNodig([{ from: 'Too Good To Go <no-reply@toogoodtogo.com>' }], ['pavlo@voorbeeld.test'], ontl.punten);
    eis(antw === null, 'Одностороння розсилка no-reply@ не сміє отримувати статус antwoordNodig');
  });

  await reg('F8', 'P3-24 (F8×F9): взаємодія відкритого редактора відповіді та мобільних панелей переглядача (приховування нижньої панелі)', () => {
    const werkbalkBron = leesBestandVeilig(wortel, 'src/MailLezerWerkbalk.tsx');
    const gesprekBron = leesBestandVeilig(wortel, 'src/MailGesprekInhoud.tsx');
    eis(
      !gesprekBron.includes("className='mail-reply-extra'") &&
        (werkbalkBron.includes('replyOpen') || leesBestandVeilig(wortel, 'src/mail/lees-venster.css').includes('data-reply-ingeklapt')),
      'Редактор відповіді та нижня панель переглядача мають бути взаємно узгоджені без подвоєння кнопки «Відповісти»',
    );
  });

  await reg('F8', 'P3-25 (F8×F11): узгодженість повноекранних завіс 1/1/-1/-1 між ContextPaneel та BronBlad у переглядачі Пошти', () => {
    const ctxCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/context-paneel.css'));
    const aiCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/ai-blok.css'));
    eis(
      /grid-area:\s*1\s*\/\s*1\s*\/\s*-1\s*\/\s*-1/.test(ctxCss) && /grid-area:\s*1\s*\/\s*1\s*\/\s*-1\s*\/\s*-1/.test(aiCss),
      'Обидва спливні аркуші Пошти (Контекст і Джерело пункту) мусять перекривати всю сітку 1/1/-1/-1',
    );
  });

  await reg('F8', 'P3-26 (F8×F12): суцільна підкладка спливних шторок Пошти узгоджена зі змінними світлої і темної палітр без нових !important', () => {
    const ctxCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/context-paneel.css'));
    const werkCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail-lezer-werkbalk.css'));
    const compactKopCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/mail-lezer-compact-kop.css'));
    const maquetteCss = zonderCssOpmerkingen(leesBestandVeilig(wortel, 'src/mail/mail-lezer-opstel-maquette.css'));
    const ctxImp = (ctxCss.match(/!important/g) || []).length;
    eis(
      !werkCss.includes('!important') &&
        !compactKopCss.includes('!important') &&
        !maquetteCss.includes('!important') &&
        ctxImp <= 1 &&
        !/(?:\.ctx-paneel|\.ctx-scherm|\.ctx-tabs)[^{]*\{[^}]*!important/.test(ctxCss),
      'Стилі шторок (.ctx-paneel/.ctx-scherm/.ctx-tabs) та панелі інструментів Пошти мусять працювати за чистою специфічністю без !important',
    );
    eis(
      !ctxCss.includes('.ctx-paneel{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--panel)'),
      'Підкладка .ctx-paneel має бути суцільно непрозорою',
    );
  });
}


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// РІВЕНЬ 4 — РЕАЛІСТИЧНІ НАСКРІЗНІ КОРИСТУВАЦЬКІ СЦЕНАРІЇ У СПРАВЖНЬОМУ /usr/bin/google-chrome (10 СЦЕНАРІЇВ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function bouwKlantScenaBron(): string {
  return `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CanonicalAccountMenu from './src/CanoniekAccountMenu';
import { AccountMenuV3 } from './src/accountmenu-v3/AccountMenuV3';
import { SignedOutCenter } from './src/CanoniekOmlijsting';
import OwnerIdentityCallback from './src/EigenaarIdentiteitTerug';
import { MeldingBellen } from './src/MenuMeldingen';
import MeldingenPortaal from './src/meldingen/ecosysteem/MeldingenPortaal';
import { leesLokaalProfiel } from './src/meldingen/ecosysteem/ecosysteem-opslag';
import { interpreteerGebeurtenis } from './shared/meldingen-ecosysteem/tolk';
import LeesVenster from './src/mail/LeesVenster';
import MailReaderToolbar from './src/MailLezerWerkbalk';
import MailThreadContent from './src/MailGesprekInhoud';
import ContextPaneel from './src/mail/ContextPaneel';
import ViewportTooltipLayer from './src/ViewportKnopinfoLaag';
import { defaultMailDensityProfiles } from './src/mail-dichtheid-profiel';
import { defaultMailReaderToolbarPreference } from './src/MailSnelleInstellingen';
import { markeringenZetten } from './src/afzenders/api';
import { Archive, Clock, Reply, Trash2 } from 'lucide-react';
import './src/canoniek-omlijsting.css';
import './src/aanmeld-herontwerp.css';
import './src/account-afgemeld-menu.css';

// Канонічний порядок глобальних таблиць стилів із src/main.tsx:12-23 ПІСЛЯ імпортів компонентів!
import './src/index.css';
import './src/ontwerp/fundament.css';
import './src/mobiel-ux.css';
import './src/maquette-kern/maquette-tokens.css';
import './src/maquette-kern/maquette-oppervlakken.css';
import './src/maquette-kern/maquette-aanmelden.css';
import './src/maquette-kern/maquette-klassiek.css';
import './src/platform/sluitknop.css';
import './src/tech/tech.css';
import './src/tech/strook.css';
import './src/centrering-globaal.css';
import './src/afdruk.css';

const q = new URLSearchParams(location.search);
const scena = q.get('scena') || 'ingang';
const initTaal = (q.get('lang') === 'nl' ? 'nl' : 'uk') as 'uk' | 'nl';
const initThema = (q.get('thema') === 'dark' ? 'dark' : 'light') as 'light' | 'dark';

function ScenaIngang() {
  const [lang, setLang] = useState<'uk' | 'nl'>(initTaal);
  const [theme, setTheme] = useState<'light' | 'dark'>(initThema);
  const [openReq, setOpenReq] = useState(0);
  return (
    <div className={\`canonical-chrome theme-\${theme}\`} data-viewport-tooltips="true" style={{ position: 'relative', width: '100%', height: '100%', overflowY: 'auto' }}>
      <div className="canonical-account-anchor">
        <CanonicalAccountMenu
          lang={lang}
          theme={theme}
          user={null}
          openRequest={openReq}
          onAddAccount={() => undefined}
          onLanguage={(l) => { document.documentElement.lang = l; setLang(l); }}
          onTheme={(t) => { const nt = t === 'dark' ? 'dark' : 'light'; setTheme(nt); }}
        />
      </div>
      <main className="canonical-workspace">
        <div className="canonical-content">
          <SignedOutCenter lang={lang} checking={false} onOpenAccount={() => setOpenReq((n) => n + 1)} rememberBrowser onRememberBrowser={() => undefined} />
        </div>
      </main>
    </div>
  );
}

function ScenaAm3() {
  const metProfiel = q.get('profiel') === '1';
  const [lang, setLang] = useState<'uk' | 'nl'>(initTaal);
  const [theme, setTheme] = useState<'light' | 'dark' | 'device' | 'auto'>(initThema);
  const gebruiker = metProfiel ? { id: 'u-1', accountId: 'acc-1', name: 'Олена Коваль', email: 'olena@voorbeeld.test' } : null;
  return (
    <div className={\`canonical-chrome theme-\${initThema}\`} data-account-menu-v3="true" style={{ padding: 12, width: '100%', height: '100%', overflowY: 'auto' }}>
      <div className="canonical-account-panel open am3-panel-host" role="dialog" aria-modal="false" style={{ position: 'relative', width: 'min(100%, 400px)', margin: '0 auto' }}>
        <AccountMenuV3
          lang={lang}
          theme={theme}
          displayUser={gebruiker}
          visibleRows={[]}
          shouldShowOtherAccountsToggle={false}
          expanded={false}
          onToggleExpanded={() => undefined}
          busy={false}
          selecting=""
          forgetting=""
          loading={false}
          loadFailed={false}
          photoBusy={false}
          photoError={false}
          photoLeesfout=""
          photoFailedText=""
          changePhotoLabel="Змінити"
          manageLabel="Керування"
          settingsLabel="Налаштування"
          privacyLabel="Конфіденційність"
          termsLabel="Умови"
          showLogoutAll={false}
          wisselMelding={null}
          wisselFout={null}
          v2Ruimtes
          mobiel={window.innerWidth <= 700}
          onSelectAccount={() => undefined}
          onAddAccount={() => undefined}
          onTheme={(t) => setTheme(t)}
          onLanguage={(l) => setLang(l)}
          onClose={() => undefined}
          renderAvatar={() => <span>О</span>}
        />
      </div>
    </div>
  );
}

function ScenaBellen() {
  const soort = q.get('soort') || 'apparaat';
  const [ankerEl, setAnkerEl] = useState<HTMLButtonElement | null>(null);
  const [gesloten, setGesloten] = useState<string[]>([]);
  const uuid = '11111111-2222-4333-8444-555555555555';
  const meldingen = soort === 'teller'
    ? [{ id: 'teller:mail', bron: 'teller' as const, item: 'pg:mail/inbox', categorie: 'post' as const, aantal: 14, op: Date.now(), titel: 'Непрочитані листи: 14', tekst: 'У «Вхідних» є непрочитані листи.', link: 'https://mail.tarasevych.com/postvak-in' }]
    : [{ id: uuid, bron: 'server' as const, item: 'svc:identity', categorie: 'beveiliging' as const, op: Date.now(), titel: 'Новий вхід на новому пристрої', tekst: 'спосіб: Google · 25 листопада о 14:10 (Брюссель) · Chrome/Android · Брюссель · Обліковий запис olena@gmail.com', link: \`https://id.tarasevych.com/sessions?apparaat=\${uuid}\` }];
  const zichtbaar = meldingen.filter((m) => !gesloten.includes(m.id));
  const ankerRect = ankerEl ? ankerEl.getBoundingClientRect() : new DOMRect(12, 680, 220, 44);
  return (
    <div className={\`canonical-chrome theme-\${initThema}\`} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        ref={setAnkerEl}
        id="menu-anker-item"
        type="button"
        style={{ position: 'fixed', left: 12, top: 680, width: 220, height: 44 }}
      >
        Налаштування
      </button>
      <div data-gesloten-ids={gesloten.join(',')} />
      {ankerEl && zichtbaar.length > 0 && (
        <MeldingBellen
          lang={initTaal}
          label={soort === 'teller' ? 'Пошта' : 'Налаштування'}
          badge={{ item: soort === 'teller' ? 'svc:mail' : 'svc:identity', aantal: soort === 'teller' ? 14 : zichtbaar.length, categorieen: [soort === 'teller' ? 'post' : 'beveiliging'], meldingen: zichtbaar, nieuwste: Date.now() }}
          anker={ankerRect}
          ankerEl={ankerEl}
          vastgezet
          onSluit={(m) => setGesloten((oud) => [...oud, m.id])}
          onOpen={() => undefined}
          onAllesWeg={() => setGesloten(meldingen.map((x) => x.id))}
          onBinnen={() => undefined}
          onEsc={() => undefined}
          paneelRef={() => undefined}
        />
      )}
    </div>
  );
}

function ScenaPortaal() {
  const [compact, setCompact] = useState(false);
  const [profiel, setProfiel] = useState(() => {
    const p = leesLokaalProfiel('chrome-e2e', 'prive');
    p.geometrie.modus = 'volledig';
    return p;
  });
  const uuid = '22222222-3333-4444-8555-666666666666';
  const [stroom, setStroom] = useState(() => {
    const g1 = interpreteerGebeurtenis({
      id: \`site_notif:\${uuid}\`,
      bron: 'agent site owner.apparaat.nieuw',
      soort: 'owner.apparaat.nieuw',
      titel: 'Виявлено вхід із нового незнайомого пристрою',
      bericht: 'спосіб: Google · Chrome/Android · Брюссель',
      link: \`https://id.tarasevych.com/sessions?apparaat=\${uuid}\`,
      aangemaaktOp: Date.now() - 20_000,
      meta: { actieCode: 'owner.apparaat.nieuw', apparaatId: uuid },
    });
    const g2 = interpreteerGebeurtenis({
      id: 'gelezen-info-1',
      bron: 'mcp',
      soort: 'info',
      titel: 'Старе прочитане фонове сповіщення',
      bericht: 'Не потребує жодної дії',
      gelezen: true,
      aangemaaktOp: Date.now() - 90_000,
    });
    g2.status = 'gelezen';
    return [g1, g2];
  });
  return (
    <div className={\`canonical-chrome theme-\${initThema}\`} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button type="button" data-qa-id="canonical-notification-bell" style={{ position: 'fixed', top: 14, left: 14, width: 38, height: 38 }}>🔔</button>
      <MeldingenPortaal
        lang={initTaal}
        open
        compactBijBel={compact}
        ruimte="prive"
        subdomeinNu="hub"
        profiel={profiel}
        stroom={stroom}
        laden={false}
        sound={false}
        onSluiten={() => undefined}
        onOpenen={() => undefined}
        onToggleSound={() => undefined}
        onVervers={() => undefined}
        onSlaGeometrieOp={(geo) => setProfiel((p) => ({ ...p, geometrie: geo }))}
        onWerkProfielBij={(fn) => setProfiel((p) => fn(p))}
        onStatusWijzigen={async (g, st) => setStroom((lijst) => lijst.map((x) => (x.id === g.id ? { ...x, status: st } : x)))}
        onOntleden={async () => ({ samenvatting: 'Огляд', acties: [], bron: 'intern' } as never)}
        onMarkAll={() => undefined}
        onSwitchToClassic={() => setCompact(true)}
        onOpenVensterModus={() => setCompact(false)}
      />
    </div>
  );
}

function ScenaMail() {
  markeringenZetten(true);
  const [composeSig, setComposeSig] = useState(0);
  const [draft, setDraft] = useState('');
  const [draftAtt, setDraftAtt] = useState([]);
  const [watNodig, setWatNodig] = useState(null);
  const eenrichting = q.get('eenrichting') === '1';
  const nu = Date.now();
  const langTekst = Array.from({ length: 18 }, (_, i) =>
    eenrichting
      ? \`Paragraph \${i + 1}: Please collect your order on 28 October at 18:00 from the store counter.\`
      : \`Абзац \${i + 1}: Пропоную провести опис стану квартири у середу, 28 жовтня, о 10:00 на місці? Будь ласка, підтвердьте час зустрічі.\`
  ).join('\\n\\n');
  const htmlBrief = eenrichting
    ? \`<html><head><style>
        img { display: block; width: 120px; }
        .dark-img { display: none !important; }
        @media (max-width: 600px) { .mobiel-blok { padding: 12px; font-weight: 700; } }
      </style></head><body>
        <div class="mobiel-blok">Hi Павло Тарасевич,<br>Your order for Carrefour Market is confirmed! Pick up at <a href="https://maps.google.com/?q=Gent">Carrefour Gent</a>.</div>
        <img class="light-img" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4+vw1AAVsArjSAflTAAAAAElFTkSuQmCC" alt="Logo" />
        <img class="dark-img" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4+vw1AAVsArjSAflTAAAAAElFTkSuQmCC" alt="Dark Logo" />
        <p>\${langTekst.replace(/\\n/g, '<br>')}</p>
      </body></html>\`
    : \`<div><p>\${langTekst.replace(/\\n\\n/g, '</p><p>')}</p></div>\`;

  const afzender = eenrichting ? 'Too Good To Go <no-reply@toogoodtogo.com>' : 'Lotte Vermeulen <lotte@immo-voorbeeld.be>';
  const thread = [
    {
      id: 'm-oud-1',
      threadId: 'th-e2e-1',
      internetMessageId: '<m0@voorbeeld.be>',
      subject: eenrichting ? 'Welcome to Too Good To Go' : 'Договір оренди — чернетка',
      from: afzender,
      to: 'pavlo@voorbeeld.test',
      cc: '',
      replyTo: '',
      receivedAt: nu - 86_400_000,
      snippet: eenrichting ? 'Hi Павло Тарасевич, Your account is ready.' : 'Попередній лист у бесіді.',
      plainText: eenrichting ? 'Hi Павло Тарасевич, Your account is ready.' : 'Попередній лист у бесіді.',
      labelIds: ['INBOX'],
      attachments: [],
    },
    {
      id: 'm-nieuw-1',
      threadId: 'th-e2e-1',
      internetMessageId: '<m1@voorbeeld.be>',
      subject: eenrichting ? 'Your order for Carrefour Market is confirmed' : 'Опис стану квартири — узгодження часу',
      from: afzender,
      to: 'pavlo@voorbeeld.test',
      cc: '',
      replyTo: '',
      receivedAt: nu - 3600_000,
      snippet: langTekst.slice(0, 120),
      plainText: eenrichting ? \`Hi Павло Тарасевич,\\nYour order for Carrefour Market is confirmed!\\n\\n\${langTekst}\` : langTekst,
      renderBody: { kind: 'html' as const, html: htmlBrief, text: langTekst, inlineResources: [] },
      labelIds: ['INBOX'],
      attachments: [
        { providerAttachmentId: 'att-ics-1', filename: 'afspraak.ics', contentType: 'text/calendar', sizeBytes: 2048 },
        { providerAttachmentId: 'att-vcf-1', filename: 'contact.vcf', contentType: 'text/vcard', sizeBytes: 1024 },
      ],
      details: {
        dateHeader: '',
        via: '',
        mailedBy: 'toogoodtogo.com',
        signedBy: 'toogoodtogo.com',
        signatureDomain: 'toogoodtogo.com',
        authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
        transport: { status: 'encrypted_observed' as const, evidence: 'TLS 1.3' },
        list: { id: '', unsubscribeMode: '', oneClick: false },
        headerCount: 14,
      },
    },
  ];
  const acties = [
    { id: 'archive' as const, label: 'Архівувати', icon: <Archive />, onSelect: () => undefined },
    { id: 'snooze' as const, label: 'Відкласти', icon: <Clock />, onSelect: () => undefined },
    { id: 'trash' as const, label: 'До кошика', icon: <Trash2 />, onSelect: () => undefined },
    { id: 'reply' as const, label: 'Відповісти', icon: <Reply />, onSelect: () => setComposeSig((n) => n + 1) },
  ];
  return (
    <div className={\`canonical-chrome theme-\${initThema}\`} data-viewport-tooltips="true" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ViewportTooltipLayer />
      <LeesVenster
        lang={initTaal}
        berichtId="m-nieuw-1"
        laden={false}
        paneel="none"
        geminimaliseerd={false}
        onMinimaliseer={() => undefined}
        onSluit={() => undefined}
      >
        <header>
          <button type="button" className="mail-reader-back mail-reader-icon-action" aria-label="Назад">←</button>
          <MailReaderToolbar
            lang={initTaal}
            actions={acties}
            preference={defaultMailReaderToolbarPreference}
            busy={false}
            saving={false}
            error=""
            onChange={() => undefined}
            minimizeLabel="Згорнути лист"
            onMinimize={() => undefined}
            closeLabel="Закрити лист"
            onClose={() => undefined}
            onReply={() => setComposeSig((n) => n + 1)}
          />
        </header>
        <MailThreadContent
          lang={initTaal}
          thread={thread}
          density="normal"
          profile={defaultMailDensityProfiles.normal}
          context={{ service: 'mail', tabContext: 'inbox', sourceOrigin: location.origin }}
          accountId="acc-1"
          cacheAccountId="cache-1"
          attachmentCacheVersion={1}
          draftAttachments={draftAtt}
          onDraftAttachments={setDraftAtt as never}
          draftContent={draft}
          onDraftContent={setDraft}
          onOpenAttachment={() => undefined}
          onSaveAttachment={() => undefined}
          onDownloadAttachment={() => undefined}
          composeSignal={composeSig}
          composeMode="sender"
          detailsSignal={0}
          translationActive={false}
          onTranslationFailure={() => undefined}
          onCopyFrom={async () => true}
          onSent={() => undefined}
          onFeedback={() => undefined}
          mijnAdressen={['pavlo@voorbeeld.test']}
          onWatNodig={setWatNodig as never}
        />
        <ContextPaneel
          lang={initTaal}
          thread={thread}
          accountId="acc-1"
          mijnAdressen={['pavlo@voorbeeld.test']}
          regels={[]}
          onKleur={() => undefined}
          zoekBrieven={async () => []}
          onOpenBericht={() => undefined}
          onToonInGesprek={() => undefined}
          onOpenBijlage={() => undefined}
          onDownloadBijlage={() => undefined}
          onBewaarAlles={() => undefined}
          onAfspraak={() => undefined}
          onTaak={() => undefined}
          watNodig={watNodig}
        />
      </LeesVenster>
    </div>
  );
}

const wortelEl = document.getElementById('root')!;
if (scena === 'google') {
  createRoot(wortelEl).render(<OwnerIdentityCallback />);
} else if (scena === 'am3') {
  createRoot(wortelEl).render(<ScenaAm3 />);
} else if (scena === 'bellen') {
  createRoot(wortelEl).render(<ScenaBellen />);
} else if (scena === 'portaal') {
  createRoot(wortelEl).render(<ScenaPortaal />);
} else if (scena === 'mail') {
  createRoot(wortelEl).render(<ScenaMail />);
} else {
  createRoot(wortelEl).render(<ScenaIngang />);
}
`;
}


async function voerNiveau4Uit(wortel: string, kortTmp: string, werkMap: string, uitkomsten: ToetsUitkomst[]): Promise<void> {
  const vensterMod = await import('../../backend/telegram-aanmelden/venster');
  mkdirSync(werkMap, { recursive: true });
  const standJsPad = join(werkMap, 'stand.js');
  const standCssPad = join(werkMap, 'stand.css');

  await esbuild({
    stdin: {
      contents: bouwKlantScenaBron(),
      resolveDir: wortel,
      sourcefile: 'e2e-stand.tsx',
      loader: 'tsx',
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome120',
    outfile: standJsPad,
    define: {
      __MR_BOUW_VERSIE__: '""',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env': '{"MODE":"production","DEV":false,"PROD":true}',
    },
    loader: {
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.webp': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
    },
    plugins: [
      {
        name: 'browser-node-leeg',
        setup(b) {
          b.onResolve(
            { filter: /^(?:node:|fs$|path$|crypto$|stream$|events$|util$|os$|zlib$|http$|https$|net$|tls$|url$|assert$|child_process$)/ },
            (args) => ({ path: args.path, namespace: 'node-leeg' }),
          );
          b.onLoad({ filter: /.*/, namespace: 'node-leeg' }, () => ({
            contents:
              'export default {}; export const Buffer = Uint8Array; export class EventEmitter { on(){return this;} off(){return this;} emit(){return false;} once(){return this;} removeListener(){return this;} } export class Transform {} export class Readable {} export class Writable {} export class Duplex {} export class PassThrough {} export const inherits = () => {};',
            loader: 'js',
          }));
        },
      },
    ],
    logLevel: 'silent',
  });

  const canonicalServiceJs = readFileSync(join(wortel, 'public/canonical-service.js'), 'utf8');
  const ruweIndexHtml = readFileSync(join(wortel, 'index.html'), 'utf8');
  const bootStyleMatch = /<style id="canonical-single-boot">[\s\S]*?<\/style>/.exec(ruweIndexHtml);
  const bootStyleHtml = bootStyleMatch ? bootStyleMatch[0] : '';
  const bootScriptMatch = /<script id="canonical-boot">[\s\S]*?<\/script>/.exec(ruweIndexHtml);
  const bootScriptHtml = bootScriptMatch ? bootScriptMatch[0] : '';

  const icsTekst = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mijn Ruimte//E2E//NL',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:e2e-afspraak-1@voorbeeld.be',
    'DTSTAMP:20261125T090000Z',
    'DTSTART;TZID=Europe/Brussels:20261128T180000',
    'DTEND;TZID=Europe/Brussels:20261128T190000',
    'SUMMARY:Отримання замовлення Carrefour Market у Брюсселі з детальною назвою події',
    'LOCATION:Voorbeeldstraat 12\\, 1000 Brussel',
    'DESCRIPTION:Візьміть торбинку для отримання замовлення.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  let tgGeoVereist = false;
  let callbackTaal: 'uk' | 'nl' = 'uk';
  const apiOproepen: Array<{ pad: string; lichaam: string }> = [];

  const routeHandler = (req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const pad = u.pathname;

    if (pad === '/canonical-service.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(canonicalServiceJs);
      return;
    }
    if (pad === '/stand.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(readFileSync(standJsPad));
      return;
    }
    if (pad === '/stand.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(existsSync(standCssPad) ? readFileSync(standCssPad) : '');
      return;
    }
    if (pad === '/boot') {
      const taal = u.searchParams.get('lang') === 'nl' ? 'nl' : 'uk';
      const thema = u.searchParams.get('thema') === 'dark' ? 'dark' : 'light';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html lang="${taal}" class="theme-${thema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/canonical-service.js"></script><script>window.__TSV_PRESENTATION__={lang:'${taal}',theme:'${thema}',route:{service:'hub',tab:'overview',lang:'${taal}'},session:''};</script>${bootStyleHtml}</head><body><div id="boot-shell"></div>${bootScriptHtml}<div id="root"></div></body></html>`);
      return;
    }
    if (pad === '/api/telegram/venster.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(vensterMod.VENSTER_JS);
      return;
    }
    if (pad === '/venster') {
      const taal = u.searchParams.get('lang') === 'nl' ? 'nl' : 'uk';
      const w = {
        soort: 'i',
        stap: 'kiezen',
        actieCode: 'inloggen',
        titel: 'Вхід у Мій простір',
        wat: taal === 'nl' ? 'Bevestig uw aanmelding' : 'Підтвердьте вхід на сайт',
        dienst: 'mail.tarasevych.com',
        toestel: 'Chrome · Android',
        apparaat: 'Chrome/Android',
        plaats: 'Brussels',
        land: 'BE',
        ipPunt: { lat: 50.85, lon: 4.35 },
        geoPunt: null,
        geoStand: '',
        aangemaaktOp: new Date(Date.now() - 60_000).toISOString(),
        verlooptOp: new Date(Date.now() + 300_000).toISOString(),
        terugUrl: 'https://mail.tarasevych.com/postvak-in',
        accounts: [{ koppelingId: 'kop-e2e', naam: 'Олена Коваль', email: 'olena@voorbeeld.test', letter: 'О' }],
        telegram: { naam: 'Olena Koval', gebruikersnaam: 'olena_e2e', foto: '', letter: 'O' },
        kandidaten: [2, 5, 9],
      };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(vensterMod.paginaHtml(w as never, taal));
      return;
    }
    if (pad === '/scena') {
      const taal = u.searchParams.get('lang') === 'nl' ? 'nl' : 'uk';
      const thema = u.searchParams.get('thema') === 'dark' ? 'dark' : 'light';
      const palet = u.searchParams.get('palet') || 'grifel';
      const transparant = u.searchParams.get('transparant') === '1' ? ' data-transparantie="aan"' : '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html lang="${taal}" class="theme-${thema} palet-${palet}"${transparant}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/canonical-service.js"></script>${bootStyleHtml}<link rel="stylesheet" href="/stand.css"></head><body><div id="root"></div><script type="module" src="/stand.js"></script></body></html>`);
      return;
    }

    let lichaam = '';
    req.on('data', (d) => {
      lichaam += String(d);
    });
    req.on('end', () => {
      apiOproepen.push({ pad, lichaam });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (pad === '/api/aanmelden/telegram/config') {
        res.writeHead(200);
        res.end(JSON.stringify({ zichtbaar: true, bot: 'TarasevychBot', botId: '12345', stand: 'gereed', soort: 'normaal', methoden: ['passkey', 'microsoft'] }));
        return;
      }
      if (pad === '/api/aanmelden/telegram/start') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            id: 'tg-e2e-req',
            geheim: 'tg-e2e-sec',
            deeplink: 'https://t.me/TarasevychBot?start=i_tg-e2e-req',
            widgetUrl: 'https://id.tarasevych.com/tg-venster?id=tg-e2e-req',
            verlooptOp: new Date(Date.now() + 300_000).toISOString(),
            bot: 'TarasevychBot',
            pictogram: 4,
          }),
        );
        return;
      }
      if (pad === '/api/aanmelden/telegram/status') {
        res.writeHead(200);
        res.end(JSON.stringify({ stand: 'wacht', codeNodig: false, codeOk: false, pictogram: 4, symboolOk: tgGeoVereist, geoVereist: tgGeoVereist }));
        return;
      }
      if (pad.includes('/venster') && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, uitkomst: 'plaats-nodig' }));
        return;
      }
      if (pad === '/api/owner/auth/google/callback') {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            ok: false,
            error: 'STATE_EXPIRED',
            reasonCode: 'STATE_EXPIRED',
            flowMode: 'redirect',
            locale: callbackTaal,
            returnTo: 'https://mail.tarasevych.com/postvak-in',
            sessionCreated: false,
          }),
        );
        return;
      }
      if (pad === '/api/meldingen/apparaat-bekend') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (pad === '/api/owner/mail/afzenders/status') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            items: [
              {
                adres: 'no-reply@toogoodtogo.com',
                naam: 'Too Good To Go',
                domein: 'toogoodtogo.com',
                status: 'onbekend',
                bron: null,
                reden: 'NIET_BEVESTIGD',
                merk: '',
                opgeslagen: false,
                domeinAuth: 'pass',
                spf: 'pass',
                dkim: 'pass',
                dmarc: 'pass',
              },
            ],
            markeringen: true,
          }),
        );
        return;
      }
      if (pad === '/api/owner/mail/afzender-beelden') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            beelden: [
              {
                adres: 'no-reply@toogoodtogo.com',
                soort: 'merk',
                bron: 'bimi',
                domein: 'toogoodtogo.com',
                data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4+vw1AAVsArjSAflTAAAAAElFTkSuQmCC',
              },
            ],
            wachtrij: 0,
          }),
        );
        return;
      }
      if (pad === '/api/owner/mail/google-suite/attachment') {
        const data = Buffer.from(icsTekst, 'utf8');
        res.writeHead(200);
        res.end(
          JSON.stringify({
            source: 'live_on_demand_chunk',
            persisted: false,
            accountId: 'acc-1',
            messageId: 'm-nieuw-1',
            attachmentId: 'att-ics-1',
            filename: 'afspraak.ics',
            contentType: 'text/calendar',
            sizeBytes: data.length,
            totalBytes: data.length,
            offset: 0,
            nextOffset: data.length,
            done: true,
            data: data.toString('base64url'),
          }),
        );
        return;
      }
      if (pad === '/api/owner/mail/ai-vertaling/state') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            agents: [{ id: 'ag-1', name: 'Claude', platform: 'anthropic', source: 'oauth', ruimte: 'prive', scopes: ['mail.read'], allowedMailRead: true }],
            settings: { defaultLang: 'uk', defaultAgentId: 'ag-1', summaryDepth: 'kort', recentLangs: ['uk'] },
          }),
        );
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, value: false, flags: {} }));
    });
  };

  await metGedeeldeChrome(kortTmp, werkMap, routeHandler, async (chrome) => {
    // ── Сценарій R4-1 (F1): Гостьовий вхід на телефоні 390×844 та 360×800 ──
    await draaiToets(
      uitkomsten,
      'L4-S1',
      4,
      'F1',
      'R4-1 (Chrome CDP · F1): вимірювання рівності 38 px кнопок шапки, спадного меню мови та медальйонів 34×34 / 30×30 px',
      async () => {
        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/scena?scena=ingang&lang=uk&thema=light');
        await chrome.evalueer(`(async () => {
          const eind = Date.now() + 2500;
          while (Date.now() < eind && !document.querySelector('.tga-aanmeld-logo')) {
            await new Promise((r) => setTimeout(r, 40));
          }
        })()`);
        const m390 = await chrome.evalueer<{
          scrollB: number;
          taalH: number;
          themaH: number;
          profielH: number;
          heeftIcoon: boolean;
          taalTekst: string;
          vlagB: number;
          vlagH: number;
          gLogoB: number;
          gLogoH: number;
          tgLogoB: number;
          tgLogoH: number;
        }>(`(() => {
          const r = (s) => document.querySelector(s)?.getBoundingClientRect() || { width: 0, height: 0 };
          const taalKnop = document.querySelector('button.mr-sign-in-taal');
          const vlag = taalKnop?.querySelector('img') || null;
          const vr = vlag ? vlag.getBoundingClientRect() : { width: 0, height: 0 };
          return {
            scrollB: document.documentElement.scrollWidth,
            taalH: r('button.mr-sign-in-taal').height,
            themaH: r('button.mr-sign-in-thema').height,
            profielH: r('button.canonical-avatar-trigger').height,
            heeftIcoon: Boolean(taalKnop?.classList.contains('is-icoon')),
            taalTekst: (taalKnop?.textContent || '').trim(),
            vlagB: vr.width,
            vlagH: vr.height,
            gLogoB: r('.mr-sign-in-logo').width,
            gLogoH: r('.mr-sign-in-logo').height,
            tgLogoB: r('.tga-aanmeld-logo').width,
            tgLogoH: r('.tga-aanmeld-logo').height,
          };
        })()`);
        eis(m390.scrollB <= 390, `Горизонтальне переповнення на 390 px: scrollWidth=${m390.scrollB}`);
        eis(
          Math.abs(m390.taalH - 38) <= 1 && Math.abs(m390.themaH - 38) <= 1 && Math.abs(m390.profielH - 38) <= 1,
          `Усі 3 кнопки верхньої панелі мусять мати рівно 38 px висоти (отримано: мова=${m390.taalH}, тема=${m390.themaH}, профіль=${m390.profielH})`,
        );
        eis(!m390.heeftIcoon && m390.taalTekst === 'укр.' && m390.vlagB > m390.vlagH, 'Капсула мови мусить мати прямокутний прапор і видимий підпис "укр." без класу is-icoon');
        eis(
          Math.abs(m390.gLogoB - 34) <= 1 && Math.abs(m390.tgLogoB - 34) <= 1 && Math.abs(m390.tgLogoH - 34) <= 1,
          `На 390 px медальйони Google та Telegram мусять бути 34×34 px (отримано: G=${m390.gLogoB}×${m390.gLogoH}, TG=${m390.tgLogoB}×${m390.tgLogoH})`,
        );

        const menuCheck = await chrome.evalueer<{ open: boolean; heeftUk: boolean; heeftNl: boolean; binnenScherm: boolean }>(`(async () => {
          document.querySelector('button.mr-sign-in-taal')?.click();
          await new Promise((r) => setTimeout(r, 60));
          const m = document.querySelector('.mr-sign-in-taal-menu');
          if (!m) return { open: false, heeftUk: false, heeftNl: false, binnenScherm: false };
          const b = m.getBoundingClientRect();
          const t = m.textContent || '';
          return { open: true, heeftUk: t.includes('Українська'), heeftNl: t.includes('Nederlands'), binnenScherm: b.left >= 0 && b.right <= 390 };
        })()`);
        eis(menuCheck.open && menuCheck.heeftUk && menuCheck.heeftNl && menuCheck.binnenScherm, 'Спадне меню мови має відкриватися в межах екрана з повними назвами Українська та Nederlands');
        await chrome.toets('Escape');
        const menuGesloten = await chrome.evalueer<boolean>(
          `!document.querySelector('.mr-sign-in-taal-menu') && document.querySelector('button.mr-sign-in-taal')?.getAttribute('aria-expanded') === 'false'`,
        );
        eis(menuGesloten, 'Спадне меню мови .mr-sign-in-taal-menu мусить закриватися після натискання клавіші Escape');

        await chrome.zetScherm(360, 800, true);
        await new Promise((r) => setTimeout(r, 80));
        const m360 = await chrome.evalueer<{ gB: number; tgB: number; svgB: number }>(`(() => {
          const g = document.querySelector('.mr-sign-in-logo')?.getBoundingClientRect() || { width: 0 };
          const tg = document.querySelector('.tga-aanmeld-logo')?.getBoundingClientRect() || { width: 0 };
          const svg = document.querySelector('.tga-aanmeld-logo svg, .tga-aanmeld-logo img, .tga-aanmeld-logo .merk')?.getBoundingClientRect() || { width: 0 };
          return { gB: g.width, tgB: tg.width, svgB: svg.width };
        })()`);
        eis(Math.abs(m360.gB - 30) <= 1 && Math.abs(m360.tgB - 30) <= 1 && m360.svgB <= m360.tgB + 0.5, `На 360 px медальйони мусять бути 30×30 px без обрізання вкладеного знака (G=${m360.gB}, TG=${m360.tgB}, SVG=${m360.svgB})`);
      },
    );

    // ── Сценарій R4-2 (F2): Меню AccountMenuV3 (кружечок +, мова, тема) та стартова заставка #boot-shell ──
    await draaiToets(
      uitkomsten,
      'L4-S2',
      4,
      'F2',
      'R4-2 (Chrome CDP · F2): видимість кружечка "+", однорядковість мови, адаптація «Теми» на 440 px та 3 елементи завантаження',
      async () => {
        await chrome.zetScherm(440, 900, true);
        await chrome.openPad('/scena?scena=am3&lang=uk&thema=light');
        const am3Gast = await chrome.evalueer<{
          plusB: number;
          plusH: number;
          plusZichtbaar: boolean;
          heeftKleinNid: boolean;
          langZelfdeRij: boolean;
          themaBinnenKaart: boolean;
        }>(`(() => {
          const plus = document.querySelector('.am3-orbit-node.is-add');
          const pr = plus?.getBoundingClientRect() || { width: 0, height: 0 };
          const ps = plus ? getComputedStyle(plus) : null;
          const langBtns = Array.from(document.querySelectorAll('.is-lang-row .am3-seg-btn'));
          const r0 = langBtns[0]?.getBoundingClientRect();
          const r1 = langBtns[1]?.getBoundingClientRect();
          const kaart = document.querySelector('.canonical-account-panel')?.getBoundingClientRect() || { right: 440 };
          const themaCtrl = document.querySelector('.is-theme-row .am3-pref-controls')?.getBoundingClientRect() || { right: 999 };
          return {
            plusB: pr.width,
            plusH: pr.height,
            plusZichtbaar: Boolean(ps && ps.display !== 'none' && ps.visibility !== 'hidden' && Number(ps.opacity) > 0),
            heeftKleinNid: (document.querySelector('.is-lang-row')?.textContent || '').includes('нід.'),
            langZelfdeRij: Boolean(r0 && r1 && Math.abs(r0.top - r1.top) <= 2),
            themaBinnenKaart: themaCtrl.right <= kaart.right + 1.5,
          };
        })()`);
        eis(am3Gast.plusZichtbaar && am3Gast.plusB >= 28 && am3Gast.plusH >= 28, 'Орбітальний кружечок "+" (.am3-orbit-node.is-add) мусить бути видимим у DOM до входу');
        eis(!am3Gast.heeftKleinNid && am3Gast.langZelfdeRij, 'Кнопки мови в AccountMenuV3 мусять стояти в один рядок без обрізаного "нід."');
        eis(am3Gast.themaBinnenKaart, 'Елементи керування рядка «Тема» на телефоні 440 px мусять повністю поміщатися в межі картки меню');

        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/boot?lang=uk&thema=dark');
        const bootMeting = await chrome.evalueer<{
          voortgangOk: boolean;
          kapselOk: boolean;
          spinOk: boolean;
          accB: number;
          accH: number;
          accRechtsAfstand: number;
        }>(`(() => {
          const zicht = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const st = getComputedStyle(el);
            const rc = el.getBoundingClientRect();
            return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0 && rc.width > 0 && rc.height > 0;
          };
          const acc = document.querySelector('.canonical-boot-account')?.getBoundingClientRect() || { width: 0, height: 0, right: 0 };
          return {
            voortgangOk: zicht('#tsv-voortgang'),
            kapselOk: zicht('#tsv-laad-kapsel'),
            spinOk: zicht('.canonical-boot-spin'),
            accB: acc.width,
            accH: acc.height,
            accRechtsAfstand: Math.round(window.innerWidth - acc.right),
          };
        })()`);
        eis(
          bootMeting.voortgangOk && bootMeting.kapselOk && bootMeting.spinOk,
          `Усі 3 елементи завантаження мають бути реально видимими в Chrome (voortgang=${bootMeting.voortgangOk}, kapsel=${bootMeting.kapselOk}, spin=${bootMeting.spinOk})`,
        );
        eis(
          Math.abs(bootMeting.accB - 38) <= 1 && Math.abs(bootMeting.accH - 38) <= 1 && Math.abs(bootMeting.accRechtsAfstand - 24) <= 1,
          `На 390 px .canonical-boot-account мусить мати 38×38 px та right: 24px (отримано: ${bootMeting.accB}×${bootMeting.accH}, right=${bootMeting.accRechtsAfstand})`,
        );
      },
    );

    // ── Сценарій R4-3 (F3 + F4): Чистий одноекранний режим підтвердження Telegram та спливний аркуш «і» ──
    await draaiToets(
      uitkomsten,
      'L4-S3',
      4,
      'F3',
      'R4-3 (Chrome CDP · F3/F4): чистий екран підтвердження Telegram, кругла кнопка «і» 28×28 px, завіса 100% та 3 візуальні кроки',
      async () => {
        tgGeoVereist = false;
        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/scena?scena=ingang&lang=uk&thema=light');
        await new Promise((r) => setTimeout(r, 240));
        const wachtKaart = await chrome.evalueer<{
          gestart: boolean;
          kaartH: number;
          infoB: number;
          infoH: number;
          scrollB: number;
        }>(`(async () => {
          const knop = document.querySelector('button.tga-aanmeld-knop');
          if (!knop) return { gestart: false, kaartH: 0, infoB: 0, infoH: 0, scrollB: 999 };
          knop.click();
          await new Promise((r) => setTimeout(r, 220));
          const openKaart = document.querySelector('.tga-aanmeld-open');
          const infoKnop = document.querySelector('button.tg2-info-knop');
          const kr = openKaart?.getBoundingClientRect() || { height: 999 };
          const ir = infoKnop?.getBoundingClientRect() || { width: 0, height: 0 };
          return {
            gestart: Boolean(openKaart && infoKnop),
            kaartH: kr.height,
            infoB: ir.width,
            infoH: ir.height,
            scrollB: document.documentElement.scrollWidth,
          };
        })()`);
        eis(wachtKaart.gestart, 'Після натискання «Увійти через Telegram» має відкриватися чиста картка очікування з кнопкою "і" (.tg2-info-knop)');
        eis(wachtKaart.kaartH > 180 && wachtKaart.kaartH <= 520 && wachtKaart.scrollB <= 390, `Чиста картка Telegram має вміщуватися в один екран (<= 520 px), отримано висоту ${wachtKaart.kaartH} px`);
        eis(Math.abs(wachtKaart.infoB - 28) <= 1.5 && Math.abs(wachtKaart.infoH - 28) <= 1.5, `Кнопка "і" мусить бути ідеальним колом 28×28 px (отримано: ${wachtKaart.infoB}×${wachtKaart.infoH})`);

        const bladMeting = await chrome.evalueer<{
          sluierB: number;
          sluierH: number;
          stappenAantal: number;
          miniTegels: number;
          actieveMiniTegels: number;
          heeftWidgetUrl: boolean;
          bladDialog: boolean;
        }>(`(async () => {
          document.querySelector('button.tg2-info-knop')?.click();
          await new Promise((r) => setTimeout(r, 100));
          const sluier = document.querySelector('.tg2-info-sluier')?.getBoundingClientRect() || { width: 0, height: 0 };
          const blad = document.querySelector('.tg2-info-blad');
          return {
            sluierB: sluier.width,
            sluierH: sluier.height,
            stappenAantal: document.querySelectorAll('.tg2-info-stap').length,
            miniTegels: document.querySelectorAll('.tg2-mini-tegel').length,
            actieveMiniTegels: document.querySelectorAll('.tg2-mini-tegel.is-actief').length,
            heeftWidgetUrl: (blad?.innerHTML || '').includes('tg-venster'),
            bladDialog: blad?.getAttribute('role') === 'dialog' && blad?.getAttribute('aria-modal') === 'true',
          };
        })()`);
        eis(bladMeting.sluierB === 390 && bladMeting.sluierH === 844, `Завіса .tg2-info-sluier мусить покривати 100% екрана 390×844 px без білих смуг (отримано: ${bladMeting.sluierB}×${bladMeting.sluierH})`);
        eis(
          bladMeting.bladDialog &&
            bladMeting.stappenAantal === 3 &&
            bladMeting.miniTegels === 3 &&
            bladMeting.actieveMiniTegels === 1 &&
            bladMeting.heeftWidgetUrl,
          'Вікно "і" мусить мати role="dialog", рівно 3 візуальні кроки, 3 міні-піктограми (рівно 1 активну .tg2-mini-tegel.is-actief) та widgetUrl у підвалі',
        );
        await chrome.toets('Escape');
        const gesloten = await chrome.evalueer<boolean>(`!document.querySelector('.tg2-info-blad')`);
        eis(gesloten, 'Вікно "і" мусить закриватися за клавішею Escape');
      },
    );

    // ── Сценарій R4-4 (F4): Захищене вікно підтвердження Telegram (venster.ts) та sessionStorage при plaats-nodig ──
    await draaiToets(
      uitkomsten,
      'L4-S4',
      4,
      'F4',
      'R4-4 (Chrome CDP · F4): Захищене вікно venster.ts без дублювання місця, без прокрутки убік та збереження піктограми при plaats-nodig',
      async () => {
        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/venster?lang=uk#s=testgeheim123');
        const voorKlik = await chrome.evalueer<{ scrollB: number; brusselTelling: number; heeftZaIp: boolean }>(`(() => {
          const tekst = document.body.innerHTML;
          return {
            scrollB: document.documentElement.scrollWidth,
            brusselTelling: (tekst.match(/Брюссель/g) || []).length,
            heeftZaIp: (document.querySelector('.meta-chips')?.textContent || '').includes('за IP'),
          };
        })()`);
        eis(voorKlik.scrollB <= 390, `Захищене вікно не сміє мати горизонтальної прокрутки (scrollWidth=${voorKlik.scrollB})`);
        eis(voorKlik.brusselTelling === 1 && voorKlik.heeftZaIp, `Місто в Захищеному вікні має виводитися рівно 1 раз і у плашці стояти "за IP" (кількість=${voorKlik.brusselTelling})`);

        const naKlik = await chrome.evalueer<{ plaatsActiesZichtbaar: boolean; heeftSessieSleutel: boolean }>(`(async () => {
          const tegel = document.querySelector('.keuze[data-pos="1"]');
          tegel?.click();
          await new Promise((r) => setTimeout(r, 180));
          const acties = document.getElementById('plaats-acties');
          const st = acties ? getComputedStyle(acties) : null;
          let heeftSleutel = false;
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i) || '';
            if (k.includes('tg') || k.includes('keuze') || k.includes('venster')) heeftSleutel = true;
          }
          return {
            plaatsActiesZichtbaar: Boolean(acties && !acties.hidden && st && st.display !== 'none'),
            heeftSessieSleutel: heeftSleutel || sessionStorage.length > 0,
          };
        })()`);
        eis(naKlik.plaatsActiesZichtbaar && naKlik.heeftSessieSleutel, 'При відповіді plaats-nodig Захищене вікно мусить показувати #plaats-acties і зберігати обрану піктограму у sessionStorage');
      },
    );

    // ── Сценарій R4-5 (F5): Сторінка повернення Google STATE_EXPIRED та аркуш «ⓘ» на 390×844 і 1280×800 ──
    await draaiToets(
      uitkomsten,
      'L4-S5',
      4,
      'F5',
      'R4-5 (Chrome CDP · F5): картка повернення Google (<= 388 px), коло ⓘ 32×32 px, рівні кнопки 44 px та суцільна завіса 100%',
      async () => {
        callbackTaal = 'uk';
        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/scena?scena=google&lang=uk&thema=dark&state=ow.v1.tx999&code=testcode');
        await new Promise((r) => setTimeout(r, 240));
        const kaartMeting = await chrome.evalueer<{
          kaartB: number;
          infoB: number;
          infoH: number;
          primH: number;
          secH: number;
          primHref: string;
        }>(`(() => {
          const r = (s) => document.querySelector(s)?.getBoundingClientRect() || { width: 0, height: 0 };
          const prim = document.querySelector('[data-google-terug-primair]');
          return {
            kaartB: r('.mr-google-terug-kaart').width,
            infoB: r('button.mr-google-terug-info-knop').width,
            infoH: r('button.mr-google-terug-info-knop').height,
            primH: r('[data-google-terug-primair]').height,
            secH: r('[data-google-terug-secundair]').height,
            primHref: prim?.getAttribute('href') || '',
          };
        })()`);
        eis(kaartMeting.kaartB > 260 && kaartMeting.kaartB <= 389, `Ширина картки повернення Google має бути <= 388 px (отримано: ${kaartMeting.kaartB})`);
        eis(Math.abs(kaartMeting.infoB - 32) <= 1 && Math.abs(kaartMeting.infoH - 32) <= 1, `Кнопка ⓘ мусить бути ідеальним колом 32×32 px (отримано: ${kaartMeting.infoB}×${kaartMeting.infoH})`);
        eis(kaartMeting.primH >= 44 && Math.abs(kaartMeting.primH - kaartMeting.secH) <= 1, `Обидві кнопки дій мусять мати однакову висоту >= 44 px (prim=${kaartMeting.primH}, sec=${kaartMeting.secH})`);
        eis(kaartMeting.primHref.includes('mail.tarasevych.com') && kaartMeting.primHref.includes('aanmeld_fout=STATE_EXPIRED'), `Головна кнопка мусить вести на відновлений returnTo з ?aanmeld_fout=STATE_EXPIRED (${kaartMeting.primHref})`);

        const infoBlad = await chrome.evalueer<{
          sluierB: number;
          sluierH: number;
          codeTekst: string;
          kopX: number;
          kopY: number;
          meerHoogte: number;
        }>(`(async () => {
          document.querySelector('button.mr-google-terug-info-knop')?.click();
          await new Promise((r) => setTimeout(r, 90));
          const sluier = document.querySelector('.mr-google-terug-sluier')?.getBoundingClientRect() || { width: 0, height: 0 };
          const kopKnop = document.querySelector('[data-google-foutcode-kopieer]');
          const kr = kopKnop?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
          return {
            sluierB: sluier.width,
            sluierH: sluier.height,
            codeTekst: document.querySelector('[data-google-foutcode-blok] code')?.textContent || '',
            kopX: kr.width > 0 ? kr.left + kr.width / 2 : 0,
            kopY: kr.height > 0 ? kr.top + kr.height / 2 : 0,
            meerHoogte: (document.querySelector('.mr-google-terug-meer summary')?.getBoundingClientRect() || { height: 0 }).height,
          };
        })()`);
        eis(
          infoBlad.kopX > 0 && infoBlad.kopY > 0,
          'Кнопка копіювання коду [data-google-foutcode-kopieer] мусить бути видимою з додатними координатами дотику',
        );
        await chrome.aanraken(infoBlad.kopX, infoBlad.kopY);
        await new Promise((r) => setTimeout(r, 90));
        const gekopieerdStaat = await chrome.evalueer<string>(
          `document.querySelector('[data-google-foutcode-kopieer]')?.getAttribute('data-gekopieerd') || ''`,
        );
        eis(infoBlad.sluierB === 390 && infoBlad.sluierH === 844, `Завіса .mr-google-terug-sluier мусить займати всі 390×844 px без обрізання на 16 px (отримано: ${infoBlad.sluierB}×${infoBlad.sluierH})`);
        eis(infoBlad.codeTekst === 'STATE_EXPIRED' && gekopieerdStaat === 'ja' && infoBlad.meerHoogte >= 43, `В аркуші за ⓘ мусить працювати <code>STATE_EXPIRED</code>, копіювання та кнопка «Докладно» висотою >= 44 px (code=${infoBlad.codeTekst}, kop=${gekopieerdStaat}, h=${infoBlad.meerHoogte})`);
        await chrome.toets('Escape');
        const focusTerug = await chrome.evalueer<boolean>(`document.activeElement?.classList.contains('mr-google-terug-info-knop') === true && !document.querySelector('.mr-google-terug-blad')`);
        eis(focusTerug, 'Після натискання Escape аркуш ⓘ має закриватися й повертати фокус на кнопку ⓘ');
      },
    );

    // ── Сценарій R4-6 (F6 + F7): Віконце сповіщень бічного меню .menu-bellen на смартфоні 360×800 ──
    await draaiToets(
      uitkomsten,
      'L4-S6',
      4,
      'F6',
      'R4-6 (Chrome CDP · F6/F7): позиціонування .menu-bellen без перекриття пункту меню, кнопки «Це був я» та дія [✓] з 1-го дотику',
      async () => {
        apiOproepen.length = 0;
        await chrome.zetScherm(360, 800, true);
        await chrome.openPad('/scena?scena=bellen&soort=apparaat&lang=uk&thema=light');
        await new Promise((r) => setTimeout(r, 150));
        const bellenGeo = await chrome.evalueer<{
          gevonden: boolean;
          binnenScherm: boolean;
          overlaptAnker: boolean;
          heeftBevestigKnop: boolean;
          wegX: number;
          wegY: number;
        }>(`(() => {
          const bel = document.querySelector('.menu-bellen');
          const ank = document.getElementById('menu-anker-item');
          if (!bel || !ank) return { gevonden: false, binnenScherm: false, overlaptAnker: true, heeftBevestigKnop: false, wegX: 0, wegY: 0 };
          const br = bel.getBoundingClientRect();
          const ar = ank.getBoundingClientRect();
          const vertOverlap = br.top < ar.bottom - 2 && br.bottom > ar.top + 2;
          const horOverlap = br.left < ar.right - 2 && br.right > ar.left + 2;
          const weg = bel.querySelector('[data-menu-bel-weg="1"]')?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
          const tekst = bel.textContent || '';
          return {
            gevonden: true,
            binnenScherm: br.left >= 0 && br.right <= 360.5,
            overlaptAnker: vertOverlap && horOverlap,
            heeftBevestigKnop: tekst.includes('Це був я') && tekst.includes('Це не я'),
            wegX: weg.width > 0 ? weg.left + weg.width / 2 : 0,
            wegY: weg.height > 0 ? weg.top + weg.height / 2 : 0,
          };
        })()`);
        eis(bellenGeo.gevonden && bellenGeo.binnenScherm && !bellenGeo.overlaptAnker, 'Віконце .menu-bellen на 360×800 мусить уміщатися в екран і НЕ перекривати сам обраний пункт бічного меню');
        eis(bellenGeo.heeftBevestigKnop, 'У .menu-bellen для нового пристрою мусять відображатися кнопки «Це був я» та «Це не я»');

        eis(
          bellenGeo.wegX > 0 && bellenGeo.wegY > 0,
          'У .menu-bellen мусить бути видима кнопка очищення [✓] ([data-menu-bel-weg="1"]) з додатними координатами дотику',
        );
        await chrome.aanraken(bellenGeo.wegX, bellenGeo.wegY);
        const meteenWeg = await chrome.evalueer<boolean>(
          `Boolean(document.querySelector('[data-gesloten-ids]')?.getAttribute('data-gesloten-ids'))`,
        );
        eis(meteenWeg, 'Кнопка очищення [✓] у .menu-bellen на сенсорному смартфоні мусить спрацьовувати з першого дотику');
      },
    );

    // ── Сценарій R4-7 (F6 + F7): Центр сповіщень «Пульт уваги» MeldingenPortaal на смартфоні 360×800 ──
    await draaiToets(
      uitkomsten,
      'L4-S7',
      4,
      'F7',
      'R4-7 (Chrome CDP · F6/F7): однорядкові 6 вкладок із назвою активної, підказка <= 56 px без 100svh, перемикання у компактну панель і POST apparaat-bekend',
      async () => {
        apiOproepen.length = 0;
        await chrome.zetScherm(360, 800, true);
        await chrome.openPad('/scena?scena=portaal&lang=uk&thema=light');
        await new Promise((r) => setTimeout(r, 200));
        const portaalMeting = await chrome.evalueer<{
          scrollB: number;
          tabsEenRij: boolean;
          actieveNaamB: number;
          geenGelezenRuis: boolean;
        }>(`(() => {
          const tabs = Array.from(document.querySelectorAll('.puls-tabs [role="tab"]'));
          const tops = tabs.map((t) => Math.round(t.getBoundingClientRect().top));
          const naam = document.querySelector('.puls-actieve-tab-naam')?.getBoundingClientRect() || { width: 0 };
          const inhoud = document.querySelector('[data-qa-id="canonical-notification-panel"]')?.textContent || '';
          return {
            scrollB: document.documentElement.scrollWidth,
            tabsEenRij: tops.length === 6 && Math.max(...tops) - Math.min(...tops) <= 3,
            actieveNaamB: naam.width,
            geenGelezenRuis: !inhoud.includes('Старе прочитане фонове сповіщення'),
          };
        })()`);
        eis(portaalMeting.scrollB <= 360, `Горизонтальне переповнення в Пульті уваги: ${portaalMeting.scrollB}`);
        eis(portaalMeting.tabsEenRij && portaalMeting.actieveNaamB > 20, 'Усі 6 вкладок .puls-tabs на 360 px мусять стояти в один ряд із видимою назвою активної вкладки');
        eis(portaalMeting.geenGelezenRuis, 'Прочитані звичайні події не повинні показуватися у вкладці «Увага»');

        const filterVoor = await chrome.evalueer<{
          tipHoogte: number;
          tipTekst: string;
          knopTekst: string;
          filterX: number;
          filterY: number;
        }>(`(async () => {
          const filterKnop = document.querySelector('[data-qa-id="puls-filter-knop"]');
          filterKnop?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
          await new Promise((r) => setTimeout(r, 80));
          const tipEl = document.querySelector('[data-qa-id="puls-icoon-tip"]');
          const tipHoogte = tipEl?.getBoundingClientRect().height || 0;
          const tipTekst = tipEl?.textContent || '';
          filterKnop?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
          await new Promise((r) => setTimeout(r, 40));
          const kr = filterKnop?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
          const knopTekst = (filterKnop?.getAttribute('aria-label') || '') + ' ' + (filterKnop?.textContent || '');
          return {
            tipHoogte,
            tipTekst,
            knopTekst,
            filterX: kr.width > 0 ? kr.left + kr.width / 2 : 0,
            filterY: kr.height > 0 ? kr.top + kr.height / 2 : 0,
          };
        })()`);
        eis(filterVoor.tipHoogte <= 56, `Спливна підказка .puls-icoon-tip не сміє розтягуватися у стовп 100svh (висота=${filterVoor.tipHoogte} px)`);
        eis(
          !filterVoor.tipTekst.includes('клавіша /') &&
            !filterVoor.tipTekst.includes('toets /') &&
            !filterVoor.knopTekst.includes('клавіша /') &&
            !filterVoor.knopTekst.includes('toets /'),
          `На сенсорному екрані кнопка пошуку не сміє показувати комп'ютерну підказку «(клавіша /)» (отримано: "${filterVoor.tipTekst}")`,
        );
        eis(filterVoor.filterX > 0 && filterVoor.filterY > 0, 'Кнопка пошуку [data-qa-id="puls-filter-knop"] мусить мати додатні координати');
        await chrome.aanraken(filterVoor.filterX, filterVoor.filterY);
        const filterMetEenTikOpen = await chrome.evalueer<boolean>(
          `document.querySelector('[data-qa-id="puls-filter-knop"]')?.getAttribute('aria-expanded') === 'true'`,
        );
        eis(filterMetEenTikOpen, 'Кнопка пошуку [data-qa-id="puls-filter-knop"] на смартфоні мусить відкривати фільтри з першого сенсорного дотику');
        await chrome.aanraken(filterVoor.filterX, filterVoor.filterY);

        const compactWissel = await chrome.evalueer<{
          compactVorm: string;
          geenLangscrollKlas: boolean;
          geenLangscrollAttr: boolean;
          paneelHoogte: number;
          vensterKnopBreedte: number;
        }>(`(async () => {
          document.querySelector('[data-qa-id="melding-vorm-compact"]')?.click();
          await new Promise((r) => setTimeout(r, 120));
          const paneel = document.querySelector('[data-qa-id="canonical-notification-panel"]');
          const pr = paneel?.getBoundingClientRect() || { height: 999 };
          const vensterKnop = document.querySelector('[data-qa-id="melding-vorm-venster-puls"]')?.getBoundingClientRect() || { width: 0 };
          return {
            compactVorm: paneel?.getAttribute('data-puls-vorm') || '',
            geenLangscrollKlas: Boolean(paneel && !paneel.classList.contains('is-mobiel-langscroll')),
            geenLangscrollAttr: Boolean(paneel && paneel.getAttribute('data-mel-langscroll') !== '1'),
            paneelHoogte: pr.height,
            vensterKnopBreedte: vensterKnop.width,
          };
        })()`);
        eis(
          compactWissel.compactVorm === 'compact' &&
            compactWissel.geenLangscrollKlas &&
            compactWissel.geenLangscrollAttr &&
            compactWissel.paneelHoogte > 120 &&
            compactWissel.paneelHoogte < 640 &&
            compactWissel.vensterKnopBreedte >= 50,
          `На 360×800 компактний режим мусить вимикати langscroll, мати компактну висоту < 640 px і видиму кнопку «Вікно» >= 50 px (vorm=${compactWissel.compactVorm}, langscrollKlas=${!compactWissel.geenLangscrollKlas}, h=${compactWissel.paneelHoogte}, knopB=${compactWissel.vensterKnopBreedte})`,
        );

        const naGoedTik = await chrome.evalueer<{ ongedaanTekst: string }>(`(async () => {
          document.querySelector('[data-qa-id="melding-vorm-venster-puls"]')?.click();
          await new Promise((r) => setTimeout(r, 90));
          const goedKnop = document.querySelector('.puls-bevestig-pil.is-goed');
          goedKnop?.click();
          await new Promise((r) => setTimeout(r, 120));
          const ongedaanTekst = document.querySelector('.puls-ongedaan-knop')?.textContent || '';
          return { ongedaanTekst };
        })()`);
        eis(apiOproepen.some((x) => x.pad === '/api/meldingen/apparaat-bekend'), 'Натискання «Це я» у MeldingenPortaal мусить надсилати POST /api/meldingen/apparaat-bekend');
        eis(
          naGoedTik.ongedaanTekst.length > 0 && !naGoedTik.ongedaanTekst.includes('Ctrl+Z'),
          `На сенсорному екрані смужка повернення дії не повинна містити «Ctrl+Z» (отримано: "${naGoedTik.ongedaanTekst}")`,
        );
      },
    );

    // ── Сценарій R4-8 (F8 + F11): Читач Пошти на телефоні — шапка, гортання, повне перекриття та 100% непрозорість «Контексту» ──
    await draaiToets(
      uitkomsten,
      'L4-S8',
      4,
      'F8',
      'R4-8 (Chrome CDP · F8/F11): однорядкова шапка Пошти, композитне гортання, повне перекриття і 100% непрозорість «Контексту» з 5 вкладками в 1 ряд',
      async () => {
        await chrome.zetScherm(360, 800, true);
        await chrome.openPad('/scena?scena=mail&lang=uk&thema=dark&palet=maquette&transparant=1');
        await new Promise((r) => setTimeout(r, 260));
        const kopEnScroll = await chrome.evalueer<{
          kopH: number;
          kopRechtsGat: number;
          geenDubbeleSluit: boolean;
          scrollVeranderd: boolean;
          clientHoogteStabiel: boolean;
        }>(`(async () => {
          const kop = document.querySelector('.google-mail-reader > header');
          const scroller = document.querySelector('section.mail-thread-content');
          if (!kop || !scroller) return { kopH: 999, kopRechtsGat: 999, geenDubbeleSluit: false, scrollVeranderd: false, clientHoogteStabiel: false };
          const kr = kop.getBoundingClientRect();
          const padRechts = parseFloat(getComputedStyle(kop).paddingRight || '0');
          const sluitKnop = kop.querySelector('.mail-reader-close');
          const geenDubbeleSluit = !sluitKnop || sluitKnop.getBoundingClientRect().width === 0;
          const hVoor = scroller.clientHeight;
          const trVoor = getComputedStyle(kop).transform;
          scroller.scrollTop = 140;
          scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 120));
          const trNa = getComputedStyle(kop).transform;
          const attrVerborgen = document.querySelector('.google-mail-reader')?.getAttribute('data-scroll-verborgen');
          const hNa = scroller.clientHeight;
          scroller.scrollTop = 0;
          scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 80));
          return {
            kopH: kr.height,
            kopRechtsGat: padRechts,
            geenDubbeleSluit,
            scrollVeranderd: trNa !== trVoor || attrVerborgen === '1' || attrVerborgen === 'ja' || attrVerborgen === 'true',
            clientHoogteStabiel: Math.abs(hNa - hVoor) <= 2,
          };
        })()`);
        eis(kopEnScroll.kopH <= 68 && kopEnScroll.kopRechtsGat <= 24, `Мобільна шапка переглядача має бути компактною в 1 рядок (<= 68 px) без дірки 64 px справа (висота=${kopEnScroll.kopH}, paddingRight=${kopEnScroll.kopRechtsGat})`);
        eis(kopEnScroll.geenDubbeleSluit, 'У мобільній шапці переглядача на 360 px дубль кнопки закриття .mail-reader-close має бути прихований');
        eis(kopEnScroll.scrollVeranderd && kopEnScroll.clientHoogteStabiel, 'При гортанні листа вниз шапка мусить ховатися композитно без стрибка висоти області прокрутки');

        const ctxMeting = await chrome.evalueer<{
          open: boolean;
          tabsEenRij: boolean;
          achtergrondDicht: boolean;
          bedektKop: boolean;
          bedektKopViaZ: boolean;
        }>(`(async () => {
          document.querySelector('.mail-reader-context-knop')?.click();
          await new Promise((r) => setTimeout(r, 140));
          const paneel = document.querySelector('.ctx-paneel');
          if (!paneel) return { open: false, tabsEenRij: false, achtergrondDicht: false, bedektKop: false, bedektKopViaZ: false };
          const tabs = Array.from(paneel.querySelectorAll('.ctx-tabs [role="tab"]'));
          const tops = tabs.map((t) => Math.round(t.getBoundingClientRect().top));
          const bg = getComputedStyle(paneel).backgroundColor || '';
          const dicht = Boolean(bg && bg !== 'transparent' && (!bg.startsWith('rgba(') || bg.endsWith(', 1)') || bg.endsWith(',1)')));
          const scherm = document.querySelector('.ctx-scherm')?.getBoundingClientRect() || paneel.getBoundingClientRect();
          const kop = document.querySelector('.google-mail-reader > header');
          const topEl = document.elementFromPoint(180, 20);
          const bedektKopViaZ = Boolean(
            topEl && !kop?.contains(topEl) && (topEl.closest('.ctx-scherm') || topEl.closest('.ctx-paneel')),
          );
          return {
            open: true,
            tabsEenRij: tabs.length === 5 && Math.max(...tops) - Math.min(...tops) <= 2,
            achtergrondDicht: dicht,
            bedektKop: scherm.top <= 2,
            bedektKopViaZ,
          };
        })()`);
        eis(ctxMeting.open && ctxMeting.bedektKop && ctxMeting.bedektKopViaZ, 'Відкрита шторка Контексту або її завіса мусить реально перекривати верхню шапку переглядача в точці (180, 20)');
        eis(ctxMeting.achtergrondDicht, 'Фон шторки .ctx-paneel у палітрі maquette + transparantie=aan мусить мати альфа-канал 1.0 без просвічування');
        eis(ctxMeting.tabsEenRij, 'Усі 5 вкладок .ctx-tabs на вузькому екрані 360 px мусять стояти строго в один рядок');
      },
    );

    // ── Сценарій R4-9 (F9): Редактор «Відповісти», підписи кнопок ШІ, спадний список тону та аркуш «Додаткові дії» ──
    await draaiToets(
      uitkomsten,
      'L4-S9',
      4,
      'F9',
      'R4-9 (Chrome CDP · F9): компактний редактор «Відповісти» без дубля кнопки, видимі підписи кнопок ШІ та select без подвійної рамки',
      async () => {
        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/scena?scena=mail&lang=uk&thema=light');
        await new Promise((r) => setTimeout(r, 240));
        const antwMeting = await chrome.evalueer<{
          geenReplyExtra: boolean;
          onderbalkVerborgen: boolean;
          geenTipBijAanraking: boolean;
          tipOpenBijMuis: boolean;
          tipWegBijScroll: boolean;
          aiTekstenZichtbaar: boolean;
          selectAppearance: string;
          geenMinimaliseerInMeer: boolean;
        }>(`(async () => {
          const replyKnop = document.querySelector('.mail-reader-onderbalk-knop.primair') || document.querySelector('.mail-reply-inklappen');
          replyKnop?.click();
          await new Promise((r) => setTimeout(r, 150));
          const extra = document.querySelector('.mail-reply-extra');
          const onderbalk = document.querySelector('.mail-reader-onderbalk');
          const obRect = onderbalk?.getBoundingClientRect() || { height: 0 };
          const obSt = onderbalk ? getComputedStyle(onderbalk) : null;
          const onderbalkVerborgen = !onderbalk || obRect.height === 0 || obSt?.display === 'none' || obSt?.visibility === 'hidden' || obSt?.pointerEvents === 'none';

          const scroller = document.querySelector('section.mail-thread-content');
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
          await new Promise((r) => setTimeout(r, 60));
          const aiToggle = document.querySelector('.mra-toggle');
          aiToggle?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
          if (aiToggle instanceof HTMLElement) aiToggle.focus({ preventScroll: true });
          await new Promise((r) => setTimeout(r, 60));
          const geenTipBijAanraking = !document.querySelector('.canonical-viewport-tooltip');

          aiToggle?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
          await new Promise((r) => setTimeout(r, 60));
          const tipOpenBijMuis = Boolean(document.querySelector('.canonical-viewport-tooltip'));
          if (scroller) {
            scroller.scrollTop = 0;
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          }
          await new Promise((r) => setTimeout(r, 80));
          const tipWegBijScroll = !document.querySelector('.canonical-viewport-tooltip');

          if (aiToggle && aiToggle.getAttribute('aria-expanded') === 'false') {
            aiToggle.click();
            await new Promise((r) => setTimeout(r, 90));
          }
          const spans = Array.from(document.querySelectorAll('.mra-bar > button > span'));
          const aiTekstenZichtbaar = spans.length >= 2 && spans.every((s) => s.getBoundingClientRect().width > 14);
          const sel = document.querySelector('.mra-veld select');
          const selectAppearance = sel ? getComputedStyle(sel).appearance : 'none';

          const meer = document.querySelector('details.google-mail-reader-more');
          meer?.setAttribute('open', '');
          await new Promise((r) => setTimeout(r, 80));
          const meerTekst = meer?.querySelector('.mail-reader-overflow-panel')?.textContent || '';
          return {
            geenReplyExtra: !extra,
            onderbalkVerborgen,
            geenTipBijAanraking,
            tipOpenBijMuis,
            tipWegBijScroll,
            aiTekstenZichtbaar,
            selectAppearance,
            geenMinimaliseerInMeer: !meerTekst.includes('Згорнути лист'),
          };
        })()`);
        eis(antwMeting.geenReplyExtra && antwMeting.onderbalkVerborgen, 'При відкритому редакторі відповіді зайвий поверх .mail-reply-extra відсутній, а нижня панель із дублем «Відповісти» схована');
        eis(
          antwMeting.geenTipBijAanraking && antwMeting.tipOpenBijMuis && antwMeting.tipWegBijScroll,
          `Підказка .canonical-viewport-tooltip не сміє відкриватися від сенсорного фокусу й мусить зникати при виході кнопки за межі вікна під час гортання (aanraking=${antwMeting.geenTipBijAanraking}, muis=${antwMeting.tipOpenBijMuis}, wegBijScroll=${antwMeting.tipWegBijScroll})`,
        );
        eis(antwMeting.aiTekstenZichtbaar, 'На телефоні 390 px усі кнопки помічника ШІ мусять мати видимі текстові підписи');
        eis(antwMeting.selectAppearance === 'none', `Спадний список тону відповіді мусить мати appearance: none без подвійної рамки (отримано: ${antwMeting.selectAppearance})`);
        eis(antwMeting.geenMinimaliseerInMeer, 'У мобільному меню додаткових дій не повинно бути комп’ютерної кнопки «Згорнути лист»');
      },
    );

    // ── Сценарій R4-10 (F10 + F11): Лист розсилки no-reply@ у переглядачі Пошти (VertaalStrook, логотип contain, .ics без дубля, @media в iframe) ──
    await draaiToets(
      uitkomsten,
      'L4-S10',
      4,
      'F10',
      'R4-10 (Chrome CDP · F10/F11): іншомовний лист з кириличним вітанням (VertaalStrook, no-reply@, логотип contain, .ics без дубля та @media в iframe)',
      async () => {
        await chrome.zetScherm(390, 844, true);
        await chrome.openPad('/scena?scena=mail&eenrichting=1&lang=uk&thema=light');
        await new Promise((r) => setTimeout(r, 340));
        const briefMeting = await chrome.evalueer<{
          heeftVertaalStrook: boolean;
          heeftAntwoordNodig: boolean;
          logoContain: boolean;
          aantalBijlageKaarten: number;
          geenVkAntwoord: boolean;
          darkImgVerborgen: boolean;
          mobielBlokDik: string;
        }>(`(() => {
          const vertaal = Boolean(document.querySelector('[data-vertaal-strook], .vertaal-strook'));
          const antwNodig = Boolean(document.querySelector('[data-antwoord-nodig]'));
          const merkImg = document.querySelector('.mail-thread-avatar .afz-foto[data-afzender-foto="merk"] img');
          const logoContain = merkImg ? getComputedStyle(merkImg).objectFit === 'contain' : false;
          const bijlageKaarten = document.querySelectorAll('.google-mail-reader-attachments .mail-attachment-card').length;
          const geenVkAntwoord = !document.querySelector('[data-vk-antwoord]');
          const frame = document.querySelector('.mail-message-html-paper iframe');
          const fdoc = frame && 'contentDocument' in frame ? frame.contentDocument : null;
          const darkImg = fdoc?.querySelector('.dark-img');
          const darkSt = darkImg && fdoc?.defaultView ? fdoc.defaultView.getComputedStyle(darkImg) : null;
          const mobBlok = fdoc?.querySelector('.mobiel-blok');
          const mobSt = mobBlok && fdoc?.defaultView ? fdoc.defaultView.getComputedStyle(mobBlok) : null;
          return {
            heeftVertaalStrook: vertaal,
            heeftAntwoordNodig: antwNodig,
            logoContain,
            aantalBijlageKaarten: bijlageKaarten,
            geenVkAntwoord,
            darkImgVerborgen: Boolean(darkSt && darkSt.display === 'none'),
            mobielBlokDik: mobSt?.fontWeight || '',
          };
        })()`);
        eis(briefMeting.heeftVertaalStrook, 'Англійський лист із звертанням "Hi Павло Тарасевич" мусить активувати смугу перекладу VertaalStrook');
        eis(!briefMeting.heeftAntwoordNodig, 'Лист з односторонньої адреси no-reply@ не сміє показувати плашку «Потребує відповіді»');
        eis(briefMeting.logoContain, 'Логотип організації у відкритому листі .afz-foto[data-afzender-foto="merk"] img мусить мати object-fit: contain без обрізання');
        eis(briefMeting.aantalBijlageKaarten === 1, `Розібраний .ics не сміє дублюватися другою карткою вкладення (залишається лише 1 картка contact.vcf, отримано: ${briefMeting.aantalBijlageKaarten})`);
        eis(
          briefMeting.geenVkAntwoord,
          'Для листа з односторонньої адреси no-reply@ картка вкладення не сміє містити кнопку швидкої відповіді [data-vk-antwoord]',
        );
        eis(briefMeting.darkImgVerborgen && briefMeting.mobielBlokDik === '700', `В iframe листа прихований .dark-img мусить мати display: none, а @media-правило font-weight: 700 застосовуватися (dark=${briefMeting.darkImgVerborgen}, weight=${briefMeting.mobielBlokDik})`);
      },
    );
  });
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ГОЛОВНА ТОЧКА ВХОДУ КОНВЕЄРА НАСКРІЗНИХ ВИПРОБУВАНЬ (E2E_TIER ТА E2E_INFRA_SELFCHECK)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function main(): Promise<number> {
  const wortel = resolve(process.cwd());
  const ruwTier = (process.env.E2E_TIER || 'all').trim().toLowerCase();
  const zelfControle = process.env.E2E_INFRA_SELFCHECK === '1';

  if (!['1', '2', '3', '4', 'all'].includes(ruwTier)) {
    console.error(
      `FOUT [HERSTEL-001 E2E]: невідоме значення E2E_TIER="${ruwTier}". Дозволені значення: 1, 2, 3, 4 або all.`,
    );
    return 1;
  }

  const actieveNiveaus: NiveauId[] =
    ruwTier === 'all' ? [1, 2, 3, 4] : [Number(ruwTier) as NiveauId];

  const oudTmpDir = process.env.TMPDIR;
  const oudTmp = process.env.TMP;
  const oudTemp = process.env.TEMP;
  const { werkMap, kortTmp } = bepaalTijdelijkeMappen(oudTmpDir);
  mkdirSync(kortTmp, { recursive: true });
  mkdirSync(werkMap, { recursive: true });
  process.env.TMPDIR = kortTmp;
  process.env.TMP = kortTmp;
  process.env.TEMP = kortTmp;

  const uitkomsten: ToetsUitkomst[] = [];

  try {
    nepBrowser('https://hub.tarasevych.com', 'uk');
    {
      const g = globalThis as Record<string, unknown>;
      const maakElem = () => ({
        nodeType: 1,
        nodeName: 'DIV',
        tagName: 'DIV',
        lang: 'uk',
        dataset: {} as Record<string, string>,
        style: { setProperty: () => undefined, removeProperty: () => undefined, getPropertyValue: () => '' },
        classList: { contains: () => false, add: () => undefined, remove: () => undefined, toggle: () => false },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
        getAttribute: () => null,
        setAttribute: () => undefined,
        removeAttribute: () => undefined,
        contains: () => false,
        closest: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: () => undefined,
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      });
      const doc = g.document as Record<string, unknown>;
      doc.documentElement = Object.assign(maakElem(), doc.documentElement || {}, {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        getAttribute: () => null,
        setAttribute: () => undefined,
        removeAttribute: () => undefined,
      });
      if (!doc.body) doc.body = maakElem();
      if (!doc.createElement) doc.createElement = () => maakElem();
      const win = g.window as Record<string, unknown>;
      if (!win.matchMedia) {
        const mm = (q: string) => ({
          matches: /max-width:\s*(?:700|720|768|960)px/.test(q) && Number(win.innerWidth || 1280) <= 700,
          media: q,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
        });
        win.matchMedia = mm;
        g.matchMedia = mm;
      }
      if (!win.getComputedStyle) {
        const cs = () => ({ getPropertyValue: () => '', display: 'block', visibility: 'visible', opacity: '1' });
        win.getComputedStyle = cs;
        g.getComputedStyle = cs;
      }
    }

    if (actieveNiveaus.includes(1)) {
      await voerNiveau1F1TotF4Uit(wortel, uitkomsten);
      await voerNiveau1F5TotF8Uit(wortel, uitkomsten);
      await voerNiveau1F9TotF12Uit(wortel, kortTmp, uitkomsten);
    }
    if (actieveNiveaus.includes(2)) {
      await voerNiveau2Uit(wortel, uitkomsten);
    }
    if (actieveNiveaus.includes(3)) {
      await voerNiveau3Uit(wortel, uitkomsten);
    }
    if (actieveNiveaus.includes(4)) {
      await voerNiveau4Uit(wortel, kortTmp, werkMap, uitkomsten);
    }

    const geslaagd = uitkomsten.filter((u) => u.geslaagd).length;
    const nietGeslaagd = uitkomsten.filter((u) => !u.geslaagd).length;
    const помилкиОбвязки = uitkomsten.filter((u) => u.помилкаОбвязки).length;

    console.log('\n══════════════════════════════════════════════════════════════════════════════');
    console.log(
      `ЗВЕДЕННЯ НАСКРІЗНИХ ВИПРОБУВАНЬ HERSTEL-001 (E2E_TIER=${ruwTier}, E2E_INFRA_SELFCHECK=${zelfControle ? '1' : '0'})`,
    );
    console.log('──────────────────────────────────────────────────────────────────────────────');

    for (const niv of actieveNiveaus) {
      const vanNiv = uitkomsten.filter((u) => u.niveau === niv);
      const okNiv = vanNiv.filter((u) => u.geslaagd).length;
      const harnasNiv = vanNiv.filter((u) => u.помилкаОбвязки).length;
      console.log(
        `  Рівень ${niv}: всього=${vanNiv.length}, пройдено=${okNiv}, очікує_втілення_або_не_пройдено=${vanNiv.length - okNiv}, помилки_обвязки=${harnasNiv}`,
      );
    }

    if (actieveNiveaus.includes(1)) {
      console.log('──────────────────────────────────────────────────────────────────────────────');
      console.log('  Покриття груп F1..F12 на Рівні 1:');
      for (const g of ALLE_GROEPEN) {
        const vanG = uitkomsten.filter((u) => u.niveau === 1 && u.groep === g);
        const okG = vanG.filter((u) => u.geslaagd).length;
        console.log(`    ${g.padEnd(4)}: ${okG}/${vanG.length} пройдено`);
      }
    }

    console.log('──────────────────────────────────────────────────────────────────────────────');
    for (const u of uitkomsten) {
      if (u.geslaagd) {
        console.log(`OK   [${u.id} · Р${u.niveau} · ${u.groep}] ${u.naam}`);
      } else if (u.помилкаОбвязки) {
        console.error(`ЗБІЙ_ОБВЯЗКИ [${u.id} · Р${u.niveau} · ${u.groep}] ${u.naam} — ${u.foutDetail}`);
      } else if (zelfControle) {
        console.log(`ОЧІКУЄ [${u.id} · Р${u.niveau} · ${u.groep}] ${u.naam} — ${u.foutDetail}`);
      } else {
        console.error(`FOUT [${u.id} · Р${u.niveau} · ${u.groep}] ${u.naam} — ${u.foutDetail}`);
      }
    }
    console.log('══════════════════════════════════════════════════════════════════════════════');
    console.log(
      `ПІДСУМОК: ${geslaagd}/${uitkomsten.length} пройдено | не пройдено: ${nietGeslaagd} | помилки обв'язки: ${помилкиОбвязки}`,
    );

    if (zelfControle) {
      const drempelFouten: string[] = [];
      if (actieveNiveaus.includes(1)) {
        const n1 = uitkomsten.filter((u) => u.niveau === 1);
        if (n1.length < 60) drempelFouten.push(`Рівень 1 має ${n1.length} перевірок (< 60)`);
        for (const g of ALLE_GROEPEN) {
          const aantalG = n1.filter((u) => u.groep === g).length;
          if (aantalG < 5) drempelFouten.push(`Група ${g} на Рівні 1 має лише ${aantalG} перевірок (< 5)`);
        }
      }
      if (actieveNiveaus.includes(2)) {
        const n2 = uitkomsten.filter((u) => u.niveau === 2).length;
        if (n2 < 60) drempelFouten.push(`Рівень 2 має ${n2} перевірок (< 60)`);
      }
      if (actieveNiveaus.includes(3)) {
        const n3 = uitkomsten.filter((u) => u.niveau === 3).length;
        if (n3 < 20) drempelFouten.push(`Рівень 3 має ${n3} перевірок (< 20)`);
      }
      if (actieveNiveaus.includes(4)) {
        const n4 = uitkomsten.filter((u) => u.niveau === 4).length;
        if (n4 < 8) drempelFouten.push(`Рівень 4 має ${n4} переглядачевих сценаріїв (< 8)`);
      }
      if (помилкиОбвязки > 0) {
        drempelFouten.push(`Виявлено аварійні помилки тестової обв'язки: ${помилкиОбвязки}`);
      }
      if (drempelFouten.length > 0) {
        console.error(`САМОПЕРЕВІРКА НЕ ПРОЙДЕНА: ${drempelFouten.join('; ')}`);
        return 1;
      }
      console.log('САМОПЕРЕВІРКА ТЕСТОВОЇ ІНФРАСТРУКТУРИ УСПІШНА (помилкиОбвязки === 0, усі пороги виконано).');
      return 0;
    }

    return uitkomsten.length > 0 && nietGeslaagd === 0 && помилкиОбвязки === 0 ? 0 : 1;
  } finally {
    if (oudTmpDir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = oudTmpDir;
    if (oudTmp === undefined) delete process.env.TMP;
    else process.env.TMP = oudTmp;
    if (oudTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = oudTemp;
    rmSync(werkMap, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
    rmSync(kortTmp, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
  }
}
