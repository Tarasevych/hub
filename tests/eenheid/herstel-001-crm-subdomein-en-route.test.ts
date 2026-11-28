// Модульне випробування HERSTEL-001 (пункт 5): усунення помилки «Geen app op dit adres» на https://crm.tarasevych.com/
// та перевірка двомовності служби клієнтських взаємин у меню, бічній панелі й розширенні.
// Eenheidstest HERSTEL-001 (punt 5): synchronisatie van crm.<domein> in Caddyfile en cloudflared/config.yml + tweetaligheid.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { hostNaam } from '../../src/extensie/HostSchakelaar';
import { MENU_CATALOG, herkenStandaardMenuNaam, menuLabel, normalizeMenuPreferences } from '../../src/menu-voorkeuren';
import { checker } from './hulp/nep-google';

const INSTALLEER = resolve('deploy/installeer-app.sh');
const CF_SJABLOON = resolve('deploy/cloudflared-config.yml');
const CANONICAL_JS = resolve('public/canonical-service.js');

function leesFunctie(bron: string, naam: string): string {
  const regels = bron.split('\n');
  const start = regels.findIndex((r) => r.startsWith(`${naam}() {`));
  if (start < 0) throw new Error(`Функцію ${naam} не знайдено у deploy/installeer-app.sh`);
  let heredocEind = '';
  for (let i = start + 1; i < regels.length; i++) {
    const r = regels[i];
    if (heredocEind) {
      if (r === heredocEind) heredocEind = '';
      continue;
    }
    const hm = /<<-?\s*['"]?([A-Za-z0-9_]+)['"]?/.exec(r);
    if (hm) {
      heredocEind = hm[1];
      continue;
    }
    if (r === '}') return regels.slice(start, i + 1).join('\n');
  }
  throw new Error(`Кінець функції ${naam} не знайдено`);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-crm-subdomein-en-route');
  const instBron = readFileSync(INSTALLEER, 'utf8');
  const cfSjabloon = readFileSync(CF_SJABLOON, 'utf8');
  const docMd = readFileSync(resolve('deploy/ОГЛЯД-РОЗГОРТАННЯ.md'), 'utf8');
  const docUk = readFileSync(resolve('deploy/ОГЛЯД-РОЗГОРТАННЯ.uk.md'), 'utf8');

  // 1. Синтаксис сценарію встановлення, закінчення рядків LF та виклик під час installeren() / apps_inrichten()
  const syntax = spawnSync('bash', ['-n', INSTALLEER], { encoding: 'utf8' });
  check('installeer-app.sh: bash -n без помилок та виключно закінчення рядків LF',
    syntax.status === 0 && !instBron.includes('\r'), syntax.stderr);
  const installerenFn = leesFunctie(instBron, 'installeren');
  const appsInrichtenFn = leesFunctie(instBron, 'apps_inrichten');
  check('installeren() викликає kern_domeinen_synchroniseren "$doel", а apps_inrichten() додає @mijnruimte_kern у Caddyfile',
    installerenFn.includes('kern_domeinen_synchroniseren "$doel"')
    && (appsInrichtenFn.match(/@mijnruimte_kern host \$kern_hosts/g) || []).length === 2);

  // 2. Шаблон тунелю та документація розгортання
  check('deploy/cloudflared-config.yml містить маршрут crm.tarasevych.com → http://127.0.0.1:8080 перед http_status:404',
    /-\s+hostname:\s+crm\.tarasevych\.com\s*\n\s+service:\s+http:\/\/127\.0\.0\.1:8080/.test(cfSjabloon)
    && cfSjabloon.indexOf('crm.tarasevych.com') < cfSjabloon.indexOf('http_status:404'));
  check('deploy/ОГЛЯД-РОЗГОРТАННЯ.md та .uk.md узгоджені та містять crm і mcp у маршрутизації DNS',
    docMd === docUk
    && docMd.includes('for h in hub id mail cloud ai github crm huis api admin dashboard mcp; do')
    && !docMd.includes('\r'));

  // 3. Поведінкова перевірка kern_domeinen_synchroniseren на штучному тимчасовому каталозі
  const basis = mkdtempSync(join(tmpdir(), 'herstel-001-kern-'));
  try {
    const bin = join(basis, 'bin');
    const rel = join(basis, 'release');
    const etcCaddy = join(basis, 'etc-caddy');
    const etcCf = join(basis, 'etc-cf');
    const logPad = join(basis, 'aanroepen.log');
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(rel, 'backend'), { recursive: true });
    mkdirSync(etcCaddy, { recursive: true });
    mkdirSync(etcCf, { recursive: true });

    writeFileSync(
      join(rel, 'backend', 'deployment-identiteit.ts'),
      "export const PUBLIC_DOMAIN = 'tarasevych.com';\n",
    );

    const maakHulp = (naam: string, inhoud: string) => {
      const p = join(bin, naam);
      writeFileSync(p, `#!/usr/bin/env bash\n${inhoud}\n`);
      chmodSync(p, 0o755);
    };
    maakHulp('caddy', `echo "caddy $*" >> "${logPad}"\n[ "\${CADDY_KEUR_AF:-0}" = 1 ] && exit 1\nexit 0`);
    maakHulp('cloudflared', `echo "cloudflared $*" >> "${logPad}"\n[ "\${CF_KEUR_AF:-0}" = 1 ] && exit 1\nexit 0`);
    maakHulp('systemctl', `echo "systemctl $*" >> "${logPad}"
if [ "$1" = "is-active" ] && [ "$3" = "cloudflared" ] && [ "\${CF_NIET_ACTIEF:-0}" = 1 ]; then
  if grep -q "systemctl restart cloudflared" "${logPad}" 2>/dev/null; then exit 1; fi
fi
exit 0`);

    const oudeCaddy = [
      '# Beheerd door mijn-ruimte-installeer apps-inrichten (modus tunnel): HTTP alleen op 127.0.0.1:8090; TLS doet de tunnel.',
      '{',
      '\tadmin unix//run/caddy/admin.sock',
      '\tauto_https off',
      '}',
      'http://:8090 {',
      '\tbind 127.0.0.1',
      '\trespond "Geen app op dit adres" 404',
      '}',
      '',
    ].join('\n');

    const oudeCf = [
      'tunnel: a176c08b-29e7-47b0-95d9-9ec9383572f2',
      'credentials-file: /etc/cloudflared/a176c08b-29e7-47b0-95d9-9ec9383572f2.json',
      'no-autoupdate: true',
      'ingress:',
      '  - hostname: hub.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: id.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: mail.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: cloud.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: ai.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: github.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: huis.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: api.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: admin.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: mcp.tarasevych.com',
      '    service: http://127.0.0.1:8080',
      '  - hostname: "*.tarasevych.com"',
      '    service: http://127.0.0.1:8090',
      '  - service: http_status:404',
      '',
    ].join('\n');

    const caddyPad = join(etcCaddy, 'Caddyfile');
    const cfPad = join(etcCf, 'config.yml');
    writeFileSync(caddyPad, oudeCaddy);
    writeFileSync(cfPad, oudeCf);

    const harnas = [
      'set -euo pipefail',
      'melding() { echo "[installeer] $*"; }',
      'waarschuwing() { echo "[installeer] LET OP: $*" >&2; }',
      `HUIDIG="${rel}"; PORT=8080; APPS_UNIT=mijn-ruimte-apps-agent.service`,
      `CADDY_CONFIG="${caddyPad}"; CF_CONFIG="${cfPad}"; MIJN_RUIMTE_KERN_SLAAP_SEC=0`,
      leesFunctie(instBron, 'lees_publiek_domein'),
      leesFunctie(instBron, 'caddy_kern_domeinen_toevoegen'),
      leesFunctie(instBron, 'cf_kern_domeinen_toevoegen'),
      leesFunctie(instBron, 'kern_domeinen_synchroniseren'),
      `kern_domeinen_synchroniseren "${rel}"`,
    ].join('\n');

    const r1 = spawnSync('bash', ['-c', harnas], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
    const naCaddy1 = readFileSync(caddyPad, 'utf8');
    const naCf1 = readFileSync(cfPad, 'utf8');
    const log1 = existsSync(logPad) ? readFileSync(logPad, 'utf8') : '';

    check('перший запуск kern_domeinen_synchroniseren завершується з кодом 0 і перевіряє конфігурації через caddy validate та cloudflared ingress validate',
      r1.status === 0
      && log1.includes('caddy validate --config')
      && log1.includes('cloudflared tunnel --config')
      && log1.includes('systemctl reload caddy')
      && log1.includes('systemctl restart cloudflared'),
      r1.stderr || log1);

    check('Пояс 1 (Caddyfile): додано @mijnruimte_kern із crm.tarasevych.com → 127.0.0.1:8080 перед запасним handle 404 та створено резервну копію',
      naCaddy1.includes('@mijnruimte_kern host hub.tarasevych.com id.tarasevych.com mail.tarasevych.com cloud.tarasevych.com ai.tarasevych.com github.tarasevych.com crm.tarasevych.com huis.tarasevych.com api.tarasevych.com admin.tarasevych.com dashboard.tarasevych.com mcp.tarasevych.com')
      && /handle @mijnruimte_kern \{\s*reverse_proxy 127\.0\.0\.1:8080\s*\}\s*handle \{\s*respond "Geen app op dit adres" 404\s*\}/.test(naCaddy1)
      && readdirSync(etcCaddy).some((f) => f.startsWith('Caddyfile.voor-kern-sync.')),
      naCaddy1);

    const idxGithub = naCf1.indexOf('hostname: github.tarasevych.com');
    const idxCrm = naCf1.indexOf('hostname: crm.tarasevych.com');
    const idxHuis = naCf1.indexOf('hostname: huis.tarasevych.com');
    const idxWildcard = naCf1.indexOf('"*.tarasevych.com"');
    check('Пояс 2 (cloudflared/config.yml): додано crm.tarasevych.com → http://127.0.0.1:8080 одразу після github.tarasevych.com (перед huis та шаблоном підстановки) зі збереженням резервної копії',
      idxGithub > 0 && idxCrm > idxGithub && idxHuis > idxCrm && idxWildcard > idxCrm
      && /-\s+hostname:\s+crm\.tarasevych\.com\n\s+service:\s+http:\/\/127\.0\.0\.1:8080/.test(naCf1)
      && readdirSync(etcCf).some((f) => f.startsWith('config.yml.voor-kern-sync.')),
      naCf1);

    // Повторний запуск: повна повторостійкість (ідемпотентність)
    rmSync(logPad, { force: true });
    const r2 = spawnSync('bash', ['-c', harnas], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
    const naCaddy2 = readFileSync(caddyPad, 'utf8');
    const naCf2 = readFileSync(cfPad, 'utf8');
    const log2 = existsSync(logPad) ? readFileSync(logPad, 'utf8') : '';
    check('повторний запуск kern_domeinen_synchroniseren нічого не дублює і не перезапускає служби без потреби',
      r2.status === 0
      && naCaddy2 === naCaddy1
      && naCf2 === naCf1
      && (naCf2.match(/crm\.tarasevych\.com/g) || []).length === 1
      && (naCaddy2.match(/@mijnruimte_kern/g) || []).length === 2
      && log2 === '',
      log2);

    // Режим publiek (:443) у Caddyfile також коректно оновлюється
    const caddyPubliek = '# Beheerd door mijn-ruimte-installeer apps-inrichten (modus publiek)\n{\n\tadmin unix//run/caddy/admin.sock\n}\n:443 {\n\trespond "Geen app op dit adres" 404\n}\n';
    writeFileSync(caddyPad, caddyPubliek);
    const rPub = spawnSync('bash', ['-c', harnas], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
    check('режим publiek (:443) у Caddyfile також отримує блок @mijnruimte_kern → 127.0.0.1:8080',
      rPub.status === 0 && readFileSync(caddyPad, 'utf8').includes('crm.tarasevych.com'));

    // Автоматичне повернення резервної копії config.yml, якщо cloudflared не став активним після перезапуску
    writeFileSync(cfPad, oudeCf);
    rmSync(logPad, { force: true });
    const rTerug = spawnSync('bash', ['-c', harnas], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, CF_NIET_ACTIEF: '1' },
    });
    check('при неактивному cloudflared після перезапуску автоматично повертається резервна копія config.yml, а встановлювач не падає',
      rTerug.status === 0 && readFileSync(cfPad, 'utf8') === oudeCf && rTerug.stderr.includes('oude configuratie teruggezet'),
      rTerug.stderr);

    // Шаблон із TUNNEL-ID-INVULLEN і середовище без caddy/cloudflared у PATH не змінюють шаблон і не падають
    const sjabloonMetPlaatshouder = cfSjabloon.replace(/<TUNNEL-ID>/g, 'TUNNEL-ID-INVULLEN').replace(/  - hostname: crm\.tarasevych\.com\n    service: http:\/\/127\.0\.0\.1:8080\n/, '');
    writeFileSync(cfPad, sjabloonMetPlaatshouder);
    const rZonderDiensten = spawnSync('bash', ['-c', harnas], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    check('шаблон config.yml із TUNNEL-ID-INVULLEN та стенд без cloudflared/caddy не падають і не псують заповнювач',
      rZonderDiensten.status === 0 && readFileSync(cfPad, 'utf8') === sjabloonMetPlaatshouder);
  } finally {
    rmSync(basis, { recursive: true, force: true });
  }

  // 4. Маршрутизація crm.tarasevych.com у public/canonical-service.js
  const opslag = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      clear: () => m.clear(),
    };
  };
  const g = globalThis as Record<string, unknown>;
  const nepDoc = {
    hidden: false,
    title: '',
    cookie: '',
    head: { appendChild: () => undefined },
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [{ href: '', type: '', dataset: {} }],
    getElementById: () => null,
    createElement: () => ({ rel: '', href: '', type: '', dataset: {}, width: 64, height: 64, getContext: () => null, setAttribute: () => undefined, getAttribute: () => null }),
    body: null,
  };
  g.location = { href: 'https://crm.tarasevych.com/', hostname: 'crm.tarasevych.com', host: 'crm.tarasevych.com', pathname: '/', search: '', hash: '', protocol: 'https:', origin: 'https://crm.tarasevych.com', assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.localStorage = opslag();
  g.sessionStorage = opslag();
  g.document = nepDoc;
  g.window = Object.assign(g, {
    name: '',
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  g.fetch = async (_url: unknown, init?: { body?: string }) => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>; } catch { /* порожній запит */ }
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => JSON.stringify({ ok: true, sidebar: body.sidebar ?? null }) } as unknown as Response;
  };
  vm.runInNewContext(readFileSync(CANONICAL_JS, 'utf8'), {
    window: g,
    location: g.location,
    document: nepDoc,
    sessionStorage: g.sessionStorage,
    addEventListener: () => undefined,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    URL,
    URLSearchParams,
  });
  const cs = g.__TSV_CANONICAL_SERVICE__ as {
    serviceIds: string[];
    publicServiceIds: string[];
    domains: Record<string, string>;
    resolve: (loc?: Partial<Location>) => { service: string; tab: string; production: boolean; onbekend: boolean };
    canonicalUrl: (target: string, tab?: string, lang?: string, opts?: { explicitTab?: boolean }) => string;
  };
  const opgelostCrm = cs.resolve({ hostname: 'crm.tarasevych.com', pathname: '/', search: '' });
  const opgelostKlanten = cs.resolve({ hostname: 'crm.tarasevych.com', pathname: '/klanten', search: '' });
  check('public/canonical-service.js розпізнає crm.tarasevych.com (service=crm, tab=overview/klanten, onbekend=false)',
    cs.serviceIds.includes('crm')
    && cs.publicServiceIds.includes('crm')
    && cs.domains.crm === 'crm.tarasevych.com'
    && opgelostCrm.service === 'crm' && opgelostCrm.tab === 'overview' && opgelostCrm.production && !opgelostCrm.onbekend
    && opgelostKlanten.service === 'crm' && opgelostKlanten.tab === 'klanten' && !opgelostKlanten.onbekend
    && cs.canonicalUrl('crm', 'overeenkomsten', 'uk', { explicitTab: true }) === 'https://crm.tarasevych.com/overeenkomsten');

  // 5. Двомовність служби crm у menu-voorkeuren.tsx, zijbalk-voorkeuren.ts та HostSchakelaar.tsx
  const crmCatalogus = MENU_CATALOG.find((e) => e.id === 'crm');
  check('MENU_CATALOG та menuLabel віддають «Клієнтські взаємини» (uk) і «Klantrelatiebeheer» (nl)',
    crmCatalogus?.uk === 'Клієнтські взаємини'
    && crmCatalogus?.nl === 'Klantrelatiebeheer'
    && menuLabel('crm', 'uk') === 'Клієнтські взаємини'
    && menuLabel('crm', 'nl') === 'Klantrelatiebeheer');

  check('menuLabel та normalizeMenuPreferences ігнорують застиглу стандартну іншомовну назву в eigenNaam, але зберігають власне перейменування',
    herkenStandaardMenuNaam('crm', 'Klantrelatiebeheer')
    && herkenStandaardMenuNaam('svc:crm', 'Клієнтські взаємини')
    && !herkenStandaardMenuNaam('crm', 'Мої замовники')
    && menuLabel('crm', 'uk', 'Klantrelatiebeheer') === 'Клієнтські взаємини'
    && menuLabel('crm', 'nl', 'Клієнтські взаємини') === 'Klantrelatiebeheer'
    && menuLabel('crm', 'uk', 'Мої замовники') === 'Мої замовники'
    && normalizeMenuPreferences([{ id: 'crm', visible: true, order: 5, icon: 'relaties', eigenNaam: 'Klantrelatiebeheer' }]).find((x) => x.id === 'crm')?.eigenNaam === undefined
    && normalizeMenuPreferences([{ id: 'crm', visible: true, order: 5, icon: 'relaties', eigenNaam: 'Мої замовники' }]).find((x) => x.id === 'crm')?.eigenNaam === 'Мої замовники');

  const { __zijbalkReset, schoonZijbalkEigenNaam, zetZijbalkEigenNaam, zijbalkItemNaam, zijbalkVanServer } = await import('../../src/zijbalk-voorkeuren');
  __zijbalkReset();
  zijbalkVanServer(
    { items: { 'svc:crm': { eigenNaam: 'Klantrelatiebeheer' }, 'svc:mail': { eigenNaam: 'Робоча скринька' } } },
    { service: 'hub', scope: 'proef-klant' },
  );
  check('zijbalk-voorkeuren: випадково збережена стандартна назва «Klantrelatiebeheer» при перемиканні на uk віддає «Клієнтські взаємини», а власне перейменування зберігається',
    schoonZijbalkEigenNaam('svc:crm', 'Klantrelatiebeheer') === undefined
    && schoonZijbalkEigenNaam('svc:crm', 'Клієнтські взаємини') === undefined
    && schoonZijbalkEigenNaam('svc:crm', 'Ключові замовники') === 'Ключові замовники'
    && zijbalkItemNaam('svc:crm', 'uk') === 'Клієнтські взаємини'
    && zijbalkItemNaam('svc:crm', 'nl') === 'Klantrelatiebeheer'
    && zijbalkItemNaam('svc:crm', 'uk', 'Klantrelatiebeheer') === 'Клієнтські взаємини'
    && zijbalkItemNaam('svc:mail', 'uk') === 'Робоча скринька'
    && zijbalkItemNaam('svc:mail', 'nl') === 'Робоча скринька');

  zetZijbalkEigenNaam('svc:crm', 'Мої партнери');
  const metEigen = zijbalkItemNaam('svc:crm', 'uk') === 'Мої партнери' && zijbalkItemNaam('svc:crm', 'nl') === 'Мої партнери';
  zetZijbalkEigenNaam('svc:crm', 'Klantrelatiebeheer');
  const naStandaardReset = zijbalkItemNaam('svc:crm', 'uk') === 'Клієнтські взаємини';
  __zijbalkReset();
  check('zetZijbalkEigenNaam зберігає власну назву та скидає її при поверненні до стандартної назви каталогу',
    metEigen && naStandaardReset);

  check('HostSchakelaar містить crm.tarasevych.com і віддає «Клієнтські взаємини» (uk) та «Klantrelatiebeheer» (nl)',
    hostNaam('crm.tarasevych.com', true) === 'Клієнтські взаємини'
    && hostNaam('crm.tarasevych.com', false) === 'Klantrelatiebeheer');

  return einde();
}
