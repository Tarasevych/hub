// Випробування консолідації служби Пошти — Блок А Віхи М3 (CONSOL-001, 23.11.2026).
// Запуск: node scripts/eenheidstests.mjs consol-m3-mail-bruggen
// Перевіряє:
//   А. 3 взаємосумісні режими переглядача вкладень (`gedeeld` | `v2` | `klassiek`), збереження у `localStorage`,
//      канонічні модулі `Kop.tsx` та `BijlageV2Kop.tsx`, реактивність `mr:vlaggen-vernieuwd`, дію «Створити нотатку з вкладення» (uk + nl).
//   Б. Шаблон поштового постачальника `fastmail` (IMAP 993 TLS, SMTP 465 TLS, пароль застосунку, криптографічний поділ `mailImapAad`).
//   В. Живі перекладачі без застарілого `nog-niet`, перехідник `vertaalMicrosoftTranslateReeks` із примусовим режимом приватності
//      та очищенням таємниць і IBAN, чесну відмову без ключа та виконання з ключем у `executeAiVertalingRun`.
//   Г. Адитивні міграції `0313` та `0314` (`SQL_RISICO`, `FORCE RLS`, `VLAG-001`), двомовний SSR-відтиск `MailDienstBruggen` і `ContextPaneel`,
//      захисні бар’єри `createMailBruggenRoutes` (авторизація, чужий `ownerUserId`, роль `viewer`, відсутність витоку в `href`) та
//      перевірку ізоляції даних і повторостійкості у живій PostgreSQL (із гарантованим закриттям пулу у `finally`).
//   Д. Дотримання Абсолютного мовного закону в документації та інтерфейсних текстах Блоку А.

import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { nepGeheim } from './hulp/nep-geheim';
import {
  BIJLAGE_MODUS_GEBEURTENIS,
  BIJLAGE_MODUS_LABELS,
  BIJLAGE_MODUS_SLEUTEL,
  actieveBijlageWeergaveModus,
  beschikbareBijlageModi,
  bewaarBijlageWeergaveKeuze,
  leesBijlageWeergaveKeuze,
} from '../../src/bijlage-weergave/weergave-modus';
import {
  MAIL_AANBIEDERS,
  MAIL_IMAP_AANBIEDERS,
  mailAanbieder,
  mailAanbiederHeeftKnop,
  mailAanbiederVolledig,
} from '../../shared/mail-aanbieders';
import { openWithEnvKey, sealWithEnvKey } from '../../server/platform/beveiliging';
import { mailImapAad } from '../../backend/mail-imap';
import { merkDef } from '../../src/merk/merk-register';
import { LOGOS } from '../../src/merk/merk-logos';
import { OFFICIEEL_SLEUTELS } from '../../src/merk/officieel-sleutels';
import { VERTAAL_MOTOREN, aiBalkZichtbaar, motorenMetStand } from '../../shared/ai-vertaling';
import { UITGEBREIDE_DIENST_SOORTEN, dienstFuncties, dienstIsExtern, dienstKlaar, dienstVereistSleutel, normaliseerDienstInvoer } from '../../shared/ai-dienst-motor';
import {
  MICROSOFT_TRANSLATOR_V3_URL,
  VertaalAdapterFout,
  vertaalMicrosoftTranslate,
  vertaalMicrosoftTranslateReeks,
} from '../../backend/vertaal-adapters';
import { clearAiVertalingCache, executeAiVertalingRun, setAiVertalingDeps } from '../../backend/ai-vertaling-routes';
import { SQL_RISICO } from '../../backend/uitrol-voorcontrole';
import {
  afstemmingBrugHref,
  agendaBrugHref,
  createMailBruggenRoutes,
  deterministischeUuid,
  klantBrugHref,
  notitieBrugHref,
  sleutelkluisOntgrendelHref,
  taakBrugHref,
} from '../../backend/mail-bruggen';
import { metLade } from '../../backend/mail-ruimte';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const RUSSISCH_RE = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const DEELWOORD_RE = /[а-яіїєґ]*[аеєиіїоуюя][а-яіїєґ]*(?:(?:уч|юч)(?:ий|а|е|і|ого|ої|им|их|ому|ій)|(?:ач|яч)(?:ий|е|ого|ої|им|их|ому|ій))(?![а-яіїєґ])/iu;

function nepBrowser(taal: 'uk' | 'nl' = 'uk'): () => void {
  const g = globalThis as Record<string, unknown>;
  const sleutels = ['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS', 'innerWidth', 'innerHeight'];
  const bewaard = new Map(sleutels.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const maakOpslag = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      clear: () => m.clear(),
      key: () => null,
      get length() { return m.size; },
    };
  };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
  const luisteraars = new Map<string, Set<(ev: unknown) => void>>();
  const addEv = (soort: string, fn: (ev: unknown) => void) => {
    if (typeof fn !== 'function') return;
    if (!luisteraars.has(soort)) luisteraars.set(soort, new Set());
    luisteraars.get(soort)!.add(fn);
  };
  const remEv = (soort: string, fn: (ev: unknown) => void) => {
    luisteraars.get(soort)?.delete(fn);
  };
  const dispEv = (ev: { type?: string }) => {
    for (const fn of [...(luisteraars.get(String(ev?.type || '')) ?? [])]) fn(ev);
    return true;
  };
  const doc = {
    hidden: false,
    title: '',
    cookie: '',
    head: { appendChild: (el: unknown) => el },
    body: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ dataset: {}, style: {}, setAttribute: () => undefined, getAttribute: () => null, getContext: () => null }),
    documentElement: {
      lang: taal,
      dataset: {},
      style: { setProperty: () => undefined, removeProperty: () => undefined },
      classList: { contains: () => false, add: () => undefined, remove: () => undefined },
    },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = maakOpslag();
  g.localStorage = maakOpslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(g, 'navigator', { value: { platform: 'Linux', userAgent: 'eenheid' }, configurable: true, writable: true });
  Object.defineProperty(g, 'innerWidth', { value: 1600, configurable: true, writable: true });
  Object.defineProperty(g, 'innerHeight', { value: 900, configurable: true, writable: true });
  g.CSS = { escape: (s: string) => s };
  g.window = Object.assign(g, {
    name: '',
    addEventListener: addEv,
    removeEventListener: remEv,
    dispatchEvent: dispEv,
    postMessage: () => undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
  });
  runInNewContext(lees('public/canonical-service.js'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => {
    for (const [k, d] of bewaard) {
      if (d) Object.defineProperty(g, k, d);
      else delete g[k];
    }
    delete g.__TSV_CANONICAL_SERVICE__;
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m3-mail-bruggen');

  // ========================================================================= А. 3 режими переглядача вкладень
  check(
    'A режими переглядача: обидва вимкнені → лише klassiek; обидва увімкнені → типовий gedeeld та всі три варіанти в переліку',
    actieveBijlageWeergaveModus(false, false, null) === 'klassiek' &&
      actieveBijlageWeergaveModus(false, false, 'gedeeld') === 'klassiek' &&
      beschikbareBijlageModi(false, false).join(',') === 'klassiek' &&
      beschikbareBijlageModi(true, true).join(',') === 'gedeeld,v2,klassiek' &&
      actieveBijlageWeergaveModus(true, true, null) === 'gedeeld',
  );
  check(
    'A режими переглядача: явний вибір користувача v2 або klassiek працює при увімкнених обох прапорцях і безпечно відступає при вимкненні',
    actieveBijlageWeergaveModus(true, true, 'v2') === 'v2' &&
      actieveBijlageWeergaveModus(true, true, 'klassiek') === 'klassiek' &&
      actieveBijlageWeergaveModus(true, false, 'v2') === 'gedeeld' &&
      actieveBijlageWeergaveModus(false, true, 'gedeeld') === 'v2',
  );
  check(
    'A двомовні назви 3 режимів присутні українською та нідерландською',
    (['gedeeld', 'v2', 'klassiek'] as const).every(
      (m) => /[\u0400-\u04FF]/.test(BIJLAGE_MODUS_LABELS[m][0]) && /[A-Za-z]/.test(BIJLAGE_MODUS_LABELS[m][1]),
    ),
  );
  check(
    'A фізичні перехідники Kop.tsx та BijlageV2Kop.tsx існують, а vlag.ts слухають подію mr:vlaggen-vernieuwd',
    existsSync('src/bijlage-weergave/Kop.tsx') &&
      existsSync('src/bijlage-v2/BijlageV2Kop.tsx') &&
      lees('src/bijlage-v2/vlag.ts').includes('mr:vlaggen-vernieuwd') &&
      lees('src/mail-zoeken-v2/vlag.ts').includes('mr:vlaggen-vernieuwd'),
  );

  {
    const herstel = nepBrowser('uk');
    try {
      let ontvangenModus: unknown = null;
      (globalThis as unknown as { window: Window }).window.addEventListener(BIJLAGE_MODUS_GEBEURTENIS, ((ev: CustomEvent) => {
        ontvangenModus = ev.detail;
      }) as EventListener);
      bewaarBijlageWeergaveKeuze('v2');
      const gelezenV2 = leesBijlageWeergaveKeuze();
      const bewaardInOpslag = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(BIJLAGE_MODUS_SLEUTEL);
      bewaarBijlageWeergaveKeuze('klassiek');
      const gelezenKlassiek = leesBijlageWeergaveKeuze();
      bewaarBijlageWeergaveKeuze(null);
      const gelezenLeeg = leesBijlageWeergaveKeuze();
      check(
        'A збереження режиму у localStorage та сповіщення поточної вкладки працюють в обидва боки',
        gelezenV2 === 'v2' && bewaardInOpslag === 'v2' && gelezenKlassiek === 'klassiek' && gelezenLeeg === null && ontvangenModus === null,
      );

      const { WeergaveKop } = await import('../../src/bijlage-weergave/Kop');
      const { BijlageV2Kop } = await import('../../src/bijlage-v2/BijlageV2Kop');
      const { bouwBijlageNotitieInhoud } = await import('../../src/mail/MailDienstBruggen');
      const kopHtmlUk = renderToStaticMarkup(
        createElement(WeergaveKop, {
          afzender: null,
          taal: 'uk',
          naam: 'рахунок-листопад.pdf',
          contentType: 'application/pdf',
          grootte: 48_000,
          blob: null,
          nav: { index: 0, totaal: 2 },
          zoom: null,
          beschikbaar: { download: () => undefined },
          weergaveWissel: { huidig: 'gedeeld', opties: ['gedeeld', 'v2', 'klassiek'], onKies: () => undefined },
          onNotitieUitBijlage: () => undefined,
          onSluit: () => undefined,
        }),
      );
      const v2TerugvalHtml = renderToStaticMarkup(
        createElement(BijlageV2Kop, {
          oud: createElement('header', { 'data-klassiek-kop': 'ja' }, 'Класична шапка'),
          lang: 'nl',
          bestandsnaam: 'factuur.pdf',
          contentType: 'application/pdf',
          grootteBytes: 12_000,
          bewerkBadge: 'PDF',
          weergaveLabel: '100%',
          nav: null,
          onVorige: () => undefined,
          onVolgende: () => undefined,
          canvasZoom: false,
          zoom: 1,
          onZoom: () => undefined,
          downloadUrl: 'blob:test',
          onPrint: () => undefined,
          onOpslaan: () => undefined,
          onMinimaliseer: () => undefined,
          onSluit: () => undefined,
        }),
      );
      const notitieUk = bouwBijlageNotitieInhoud({
        taal: 'uk',
        bestandsnaam: 'договір.pdf',
        contentType: 'application/pdf',
        grootteTekst: '120 КБ',
        onderwerp: 'Оренда приміщення',
        afzender: 'Олена Коваль',
        uittreksel: 'Строк дії договору становить дванадцять місяців.',
      });
      const notitieNl = bouwBijlageNotitieInhoud({
        taal: 'nl',
        bestandsnaam: 'huurovereenkomst.pdf',
        contentType: 'application/pdf',
        grootteTekst: '120 kB',
        onderwerp: 'Huur kantoorruimte',
        afzender: 'Lotte Vermeulen',
        uittreksel: 'De overeenkomst loopt twaalf maanden.',
      });
      check(
        'A Kop.tsx, BijlageV2Kop.tsx та будова нотатки з вкладення відмальовуються двома мовами без помилок',
        kopHtmlUk.includes('рахунок-листопад.pdf') &&
          kopHtmlUk.includes('aria-label="Ще дії"') &&
          v2TerugvalHtml.includes('data-klassiek-kop="ja"') &&
          notitieUk.inhoud.includes('**Вкладення:** договір.pdf') &&
          notitieNl.inhoud.includes('**Bijlage:** huurovereenkomst.pdf'),
      );
    } finally {
      herstel();
    }
  }

  // ========================================================================= Б. Поштовий постачальник Fastmail
  const fm = mailAanbieder('fastmail');
  check(
    'Б Fastmail зареєстрований у MAIL_AANBIEDERS та MAIL_IMAP_AANBIEDERS із фіксованими хостами TLS 993/465 та двомовною довідкою',
    Boolean(fm) &&
      fm!.wijze === 'imap-app-wachtwoord' &&
      fm!.imap?.host === 'imap.fastmail.com' &&
      fm!.imap?.poort === 993 &&
      fm!.imap?.versleuteling === 'tls' &&
      fm!.smtp?.host === 'smtp.fastmail.com' &&
      fm!.smtp?.poort === 465 &&
      fm!.smtp?.versleuteling === 'tls' &&
      mailAanbiederHeeftKnop(fm!) &&
      mailAanbiederVolledig(fm!) &&
      MAIL_IMAP_AANBIEDERS.some((a) => a.id === 'fastmail') &&
      Boolean(merkDef(fm!.merk) || LOGOS[fm!.merk] || OFFICIEEL_SLEUTELS.has(fm!.merk)) &&
      MAIL_AANBIEDERS.every((a) => mailAanbiederVolledig(a)),
  );
  {
    const sleutelEnv = 'MAIL_APP_WACHTWOORD_SLEUTEL_V1';
    const vorig = process.env[sleutelEnv];
    process.env[sleutelEnv] = Buffer.alloc(32, 11).toString('base64');
    try {
      const appGeheim = nepGeheim('fm-app-', 'wachtwoord-', 'proef-2026');
      const zegel = sealWithEnvKey(sleutelEnv, appGeheim, mailImapAad('gebruiker-fm', 'koppeling-fm', 'prive'));
      let geweigerdTech = false;
      try {
        openWithEnvKey(sleutelEnv, zegel, mailImapAad('gebruiker-fm', 'koppeling-fm', 'technisch'));
      } catch {
        geweigerdTech = true;
      }
      check(
        'Б пароль застосунку Fastmail шифрується AES-256-GCM і криптографічно ізольований між prive та technisch',
        !zegel.includes(appGeheim) &&
          openWithEnvKey(sleutelEnv, zegel, mailImapAad('gebruiker-fm', 'koppeling-fm', 'prive')) === appGeheim &&
          geweigerdTech,
      );
    } finally {
      if (vorig === undefined) delete process.env[sleutelEnv];
      else process.env[sleutelEnv] = vorig;
    }
  }

  // ========================================================================= В. Живі перекладачі та Microsoft Translator v3
  check(
    'В VERTAAL_MOTOREN: жоден перекладач не має застарілого стану nog-niet чи напису про відсутній з’єднувач',
    ['libretranslate', 'google-vertaling', 'microsoft-vertaling', 'deepl'].every((id) => {
      const m = VERTAAL_MOTOREN.find((x) => x.id === id);
      return (
        Boolean(m) &&
        m!.staat === 'aansluiten' &&
        m!.aansluitenHref === '/ai' &&
        !m!.uitlegUk.includes('Конектора') &&
        !m!.uitlegNl.includes('De koppeling bestaat nog niet')
      );
    }),
  );
  check(
    'В motorenMetStand: без ключів і згоди всі перекладачі «aansluiten» (панель схована), зі схваленою згодою або ключем — «werkt»',
    !aiBalkZichtbaar({ geladen: true, balkTonen: true, motoren: motorenMetStand([], false, [{ soort: 'deepl', akkoord: false }]) }) &&
      motorenMetStand([], false, [{ soort: 'microsoft-translate', akkoord: false }]).find((x) => x.id === 'microsoft-vertaling')?.staat === 'aansluiten' &&
      motorenMetStand([], false, [{ soort: 'microsoft-translate', akkoord: true }]).find((x) => x.id === 'microsoft-vertaling')?.staat === 'werkt' &&
      motorenMetStand([], false, [], { deepl: true }).find((x) => x.id === 'deepl')?.staat === 'werkt',
  );
  check(
    'В ai-dienst-motor підтримує microsoft-translate як зовнішню службу перекладу з обов’язковим ключем',
    UITGEBREIDE_DIENST_SOORTEN.includes('microsoft-translate') &&
      dienstIsExtern('microsoft-translate') &&
      dienstVereistSleutel('microsoft-translate') &&
      dienstFuncties('microsoft-translate').join(',') === 'translate' &&
      normaliseerDienstInvoer({ id: 'ms-gedeeld', soort: 'microsoft-translate', naam: 'Azure Vertaaldienst', model: 'westeurope', limietPerDag: 40 }).ok &&
      dienstKlaar({ id: 'ms-gedeeld', soort: 'microsoft-translate', naam: 'Azure', aan: true, heeftSleutel: true, limietPerDag: 40, bijgewerktOp: 1 }) &&
      !dienstKlaar({ id: 'ms-gedeeld', soort: 'microsoft-translate', naam: 'Azure', aan: true, heeftSleutel: false, limietPerDag: 40, bijgewerktOp: 1 }),
  );

  {
    let netwerkAangeroepen = 0;
    const blokFetch = (async () => {
      netwerkAangeroepen += 1;
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    const nepAzSleutel = nepGeheim('westeurope:', 'az_nep_vertaal_sleutel_voor_test_123456');
    let blokLokaal = false;
    let blokEigenServer = false;
    try {
      await vertaalMicrosoftTranslate({ tekst: 'Hallo', bronTaal: 'nl', doelTaal: 'uk', apiSleutel: nepAzSleutel, privacyModus: 'lokaal-alleen', fetchFn: blokFetch });
    } catch (e) {
      blokLokaal = e instanceof VertaalAdapterFout && e.code === 'PRIVACY_LOKAAL_ALLEEN' && e.status === 403;
    }
    try {
      await vertaalMicrosoftTranslate({ tekst: 'Hallo', bronTaal: 'nl', doelTaal: 'uk', apiSleutel: nepAzSleutel, privacyModus: 'eigen-server', fetchFn: blokFetch });
    } catch (e) {
      blokEigenServer = e instanceof VertaalAdapterFout && e.code === 'PRIVACY_EIGEN_SERVER_ALLEEN' && e.status === 403;
    }
    check(
      'В vertaalMicrosoftTranslate блокує зовнішні запити у режимах lokaal-alleen та eigen-server до мережевого виклику',
      blokLokaal && blokEigenServer && netwerkAangeroepen === 0,
    );

    let gezieneUrl = '';
    let gezieneKoppen: Record<string, string> = {};
    let gezieneLichaam = '';
    const nepTokenInBrief = nepGeheim('ghp_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    const nepIban = 'NL91ABNA0417164300';
    const goedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      gezieneUrl = String(input);
      gezieneKoppen = (init?.headers || {}) as Record<string, string>;
      gezieneLichaam = String(init?.body || '');
      return new Response(
        JSON.stringify([
          {
            detectedLanguage: { language: 'nl', score: 0.99 },
            translations: [{ text: 'Добрий день, рахунок перевірено.', to: 'uk' }],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const msUit = await vertaalMicrosoftTranslateReeks({
      teksten: [`Goedemiddag, rekening ${nepIban} en sleutel ${nepTokenInBrief}.`],
      bronTaal: 'auto',
      doelTaal: 'uk',
      apiSleutel: nepAzSleutel,
      privacyModus: 'extern-gezuiverd',
      fetchFn: goedFetch,
    });
    check(
      'В vertaalMicrosoftTranslateReeks передає заголовки Azure, очищує IBAN і таємниці та повертає переклад',
      gezieneUrl.startsWith(MICROSOFT_TRANSLATOR_V3_URL) &&
        gezieneUrl.includes('api-version=3.0') &&
        gezieneUrl.includes('to=uk') &&
        gezieneKoppen['Ocp-Apim-Subscription-Region'] === 'westeurope' &&
        gezieneKoppen['Ocp-Apim-Subscription-Key'] === 'az_nep_vertaal_sleutel_voor_test_123456' &&
        !gezieneLichaam.includes(nepTokenInBrief) &&
        !gezieneLichaam.includes(nepIban) &&
        msUit.vertaald[0] === 'Добрий день, рахунок перевірено.' &&
        msUit.bronTaal === 'nl',
    );

    try {
      clearAiVertalingCache('consol-m3-u1');
      setAiVertalingDeps({
        loadAgents: async () => [],
        loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
        getVertaalSleutel: async () => null,
        fetch: goedFetch,
      });
      const zonderSleutel = await executeAiVertalingRun({
        userId: 'consol-m3-u1',
        mode: 'translate',
        targetLang: 'uk',
        agentId: 'microsoft-vertaling',
        messageId: 'msg-ms-1',
        bodyText: 'Welkom bij het overzicht.',
      });
      setAiVertalingDeps({
        loadAgents: async () => [],
        loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
        getVertaalSleutel: async (_u, motorId) =>
          motorId === 'microsoft-vertaling'
            ? { sleutel: nepGeheim('az_eigen_', 'sleutel_voor_run_test_9876543210'), regio: 'northeurope' }
            : null,
        fetch: goedFetch,
      });
      const metSleutel = await executeAiVertalingRun({
        userId: 'consol-m3-u1',
        mode: 'translate',
        targetLang: 'uk',
        agentId: 'microsoft-vertaling',
        messageId: 'msg-ms-2',
        segments: [{ id: 's1', text: 'Goedemiddag, uw overzicht staat klaar.' }],
      });
      check(
        'В executeAiVertalingRun: без ключа повертає чесний 409 VERTAAL_SLEUTEL_ONTBREEKT, з власним ключем перекладає через Microsoft Translator',
        zonderSleutel.status === 409 &&
          (zonderSleutel.body as { error?: string }).error === 'VERTAAL_SLEUTEL_ONTBREEKT' &&
          metSleutel.status === 200 &&
          (metSleutel.body as { motorId?: string; translations?: Record<string, string> }).motorId === 'microsoft-vertaling' &&
          (metSleutel.body as { translations?: Record<string, string> }).translations?.s1 === 'Добрий день, рахунок перевірено.',
      );
    } finally {
      setAiVertalingDeps(null);
      clearAiVertalingCache('consol-m3-u1');
    }
  }

  // ========================================================================= Г. Міграції 0313/0314 та міжслужбові мости Пошти
  const m0313 = lees('migrations/0313_mail_bruggen_vlag.sql');
  const m0314 = lees('migrations/0314_mail_vertaal_microsoft.sql');
  check(
    'Г міграції 0313 та 0314 не містять руйнівних SQL-команд і відповідають вимогам FORCE RLS та VLAG-001',
    !SQL_RISICO.some(([re]) => re.test(m0313)) &&
      !SQL_RISICO.some(([re]) => re.test(m0314)) &&
      m0313.includes('ENABLE ROW LEVEL SECURITY') &&
      m0313.includes('FORCE ROW LEVEL SECURITY') &&
      m0313.includes("'mail-dienstbruggen-v1'") &&
      m0313.includes('false, false') &&
      m0313.includes('ON CONFLICT (sleutel) DO NOTHING') &&
      m0314.includes("'microsoft-translate'"),
  );

  {
    const geheimWoord = 'ПриватнийТекстЛиста9911';
    const alleHrefs = [
      notitieBrugHref('00000000-0000-4000-8000-000000000001'),
      taakBrugHref('00000000-0000-4000-8000-000000000002'),
      afstemmingBrugHref(),
      agendaBrugHref('google:primary:ev123'),
      klantBrugHref('00000000-0000-4000-8000-000000000003'),
      sleutelkluisOntgrendelHref(),
    ].join(' | ');
    const uuidA = deterministischeUuid(`proef:${geheimWoord}`);
    const uuidB = deterministischeUuid(`proef:${geheimWoord}`);
    check(
      'Г посилання міжслужбових мостів містять лише непрозорі ідентифікатори без витоку вмісту, а deterministischeUuid стабільний',
      !alleHrefs.includes(geheimWoord) &&
        alleHrefs.includes('open_item_id=') &&
        alleHrefs.includes('open_event_id=') &&
        alleHrefs.includes('crm.tarasevych.com/klanten?klant=') &&
        uuidA === uuidB &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuidA),
    );
  }

  {
    const herstel = nepBrowser('uk');
    try {
      const { default: MailDienstBruggen } = await import('../../src/mail/MailDienstBruggen');
      const voorbeeldBrief = {
        id: 'm-brug-1',
        threadId: 'th-1',
        internetMessageId: '',
        subject: 'Узгодження кошторису робіт',
        from: 'Іван Мельник <ivan@klant-voorbeeld.example>',
        to: 'ik@voorbeeld.example',
        cc: '',
        replyTo: '',
        receivedAt: Date.UTC(2026, 10, 22, 10, 0, 0),
        snippet: 'Просимо погодити кошторис.',
        plainText: 'Просимо погодити кошторис до п’ятниці.',
        renderBody: { kind: 'text' as const, text: 'Просимо погодити кошторис до п’ятниці.', html: '', inlineResources: [] },
        labelIds: ['INBOX'],
        attachments: [],
        details: {
          dateHeader: '',
          via: '',
          mailedBy: '',
          signedBy: '',
          signatureDomain: '',
          authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
          transport: { status: 'encrypted_observed' as const, evidence: '' },
          list: { id: '', unsubscribeMode: '', oneClick: false },
          headerCount: 6,
        },
      };
      const htmlUk = renderToStaticMarkup(
        createElement(MailDienstBruggen, {
          lang: 'uk',
          variant: 'taken',
          bron: { context: {}, accountId: 'acc-1', cacheAccountId: 'acc-1' },
          bericht: voorbeeldBrief as never,
          klantVlagAan: true,
        }),
      );
      const htmlNl = renderToStaticMarkup(
        createElement(MailDienstBruggen, {
          lang: 'nl',
          variant: 'taken',
          bron: { context: {}, accountId: 'acc-1', cacheAccountId: 'acc-1' },
          bericht: voorbeeldBrief as never,
          klantVlagAan: true,
        }),
      );
      const htmlZonderCrm = renderToStaticMarkup(
        createElement(MailDienstBruggen, {
          lang: 'uk',
          variant: 'afzender',
          bron: { context: {}, accountId: 'acc-1', cacheAccountId: 'acc-1' },
          bericht: voorbeeldBrief as never,
          klantVlagAan: false,
        }),
      );
      check(
        'Г MailDienstBruggen відмальовує всі 4 міжслужбові дії українською та нідерландською і приховує Картку клієнта за вимкненого прапорця',
        htmlUk.includes('У Нотатки') &&
          htmlUk.includes('У Завдання / Звірку') &&
          htmlUk.includes('До Календаря') &&
          htmlUk.includes('Картка клієнта') &&
          htmlNl.includes('Naar Notities') &&
          htmlNl.includes('Naar Taken / Afstemming') &&
          htmlNl.includes('Naar Agenda') &&
          htmlNl.includes('Klantkaart') &&
          !RUSSISCH_RE.test(htmlUk) &&
          !/[\u0400-\u04FF]/.test(htmlNl) &&
          htmlZonderCrm === '',
      );
    } finally {
      herstel();
    }
  }

  {
    const routesGeenSessie = createMailBruggenRoutes(async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }));
    const rGeen = (await routesGeenSessie['POST /api/owner/mail/bruggen/notitie'][0]({
      event: {},
      body: { accountId: 'acc1', messageId: 'msg1', titel: 'Проба' },
      params: {},
    })) as { statusCode: number; body: string };

    const routesEigenaar = createMailBruggenRoutes(async () => ({
      service: 'mail',
      user: { id: 'user-echt', email: 'eigenaar@example.invalid', role: 'owner', status: 'approved' },
    }));
    const rVreemd = (await routesEigenaar['POST /api/owner/mail/bruggen/notitie'][0]({
      event: {},
      body: { ownerUserId: 'vreemde-gebruiker', accountId: 'acc1', messageId: 'msg1', titel: 'Проба' },
      params: {},
    })) as { statusCode: number; body: string };

    const routesKijker = createMailBruggenRoutes(async () => ({
      service: 'mail',
      user: { id: 'user-kijker', email: 'kijker@example.invalid', role: 'viewer', status: 'approved', accessLevel: 'limited' },
    }));
    const rKijker = (await routesKijker['POST /api/owner/mail/bruggen/taak'][0]({
      event: {},
      body: { accountId: 'acc1', messageId: 'msg1', titel: 'Проба' },
      params: {},
    })) as { statusCode: number; body: string };

    check(
      'Г маршрути мостів відхиляють запити без сеансу Пошти, із чужим ownerUserId та від користувача з роллю переглядача (viewer)',
      rGeen.statusCode === 403 &&
        rVreemd.statusCode === 403 &&
        rVreemd.body.includes('RBAC_FOREIGN_OWNER_REJECTED') &&
        rKijker.statusCode === 403 &&
        rKijker.body.includes('RBAC_FORBIDDEN'),
    );
  }

  // Наскрізна перевірка у живій PostgreSQL (якщо база доступна в середовищі випробувань) з обов’язковим closePool() у finally.
  if (process.env.DATABASE_URL || process.env.PGHOST) {
    const { closePool, getPool } = await import('../../server/platform/pg');
    const sleutelkluis = await import('../../backend/sleutelkluis');
    const gebruikerA = randomUUID();
    const gebruikerB = randomUUID();
    const sessieId = `m3-sessie-${randomBytes(4).toString('hex')}`;
    try {
      const sysPool = getPool('systeem');
      const migPool = getPool('migratie');
      await sysPool.query('SELECT 1');
      await migPool.query(m0313);
      await migPool.query(m0314);

      const rlsRij = (
        await sysPool.query(
          `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'app' AND c.relname = 'mail_dienstbruggen'`,
        )
      ).rows[0] as { rls?: boolean; force_rls?: boolean } | undefined;
      check(
        'Г PostgreSQL: таблиця app.mail_dienstbruggen має ENABLE + FORCE ROW LEVEL SECURITY',
        Boolean(rlsRij && rlsRij.rls === true && rlsRij.force_rls === true),
      );

      await sysPool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($1, $4, $5)', [
        'users',
        gebruikerA,
        { email: `m3-a-${gebruikerA.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved', name: 'Користувач А' },
        gebruikerB,
        { email: `m3-b-${gebruikerB.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved', name: 'Користувач Б' },
      ]);

      const routesA = createMailBruggenRoutes(async () => ({
        service: 'mail',
        user: { id: gebruikerA, email: `m3-a-${gebruikerA.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved' },
      }));

      const notitieAntw = await metLade({ userId: gebruikerA, ruimte: 'prive' }, 'mail', async () =>
        routesA['POST /api/owner/mail/bruggen/notitie'][0]({
          event: {},
          body: {
            accountId: 'acc-live-1',
            messageId: 'msg-live-1',
            bronSoort: 'bijlage',
            bijlageId: 'bijl-1',
            sleutel: 'proef-notitie-sleutel-01',
            titel: 'Рахунок за опалення / Verwarmingsfactuur',
            inhoud: 'Перевірено суму оплати.',
          },
          params: {},
        }),
      ) as { statusCode: number; body: string };
      const notitieData = JSON.parse(notitieAntw.body) as { ok?: boolean; id?: string; al?: boolean; href?: string };

      const notitieHerhaald = await metLade({ userId: gebruikerA, ruimte: 'prive' }, 'mail', async () =>
        routesA['POST /api/owner/mail/bruggen/notitie'][0]({
          event: {},
          body: {
            accountId: 'acc-live-1',
            messageId: 'msg-live-1',
            bronSoort: 'bijlage',
            bijlageId: 'bijl-1',
            sleutel: 'proef-notitie-sleutel-01',
            titel: 'Рахунок за опалення / Verwarmingsfactuur',
            inhoud: 'Перевірено суму оплати.',
          },
          params: {},
        }),
      ) as { statusCode: number; body: string };
      const herhaaldData = JSON.parse(notitieHerhaald.body) as { ok?: boolean; id?: string; al?: boolean };

      check(
        'Г PostgreSQL: створення нотатки через міст повторостійке за sleutel і не дублює запис',
        notitieAntw.statusCode === 200 &&
          notitieData.ok === true &&
          notitieData.al === false &&
          herhaaldData.ok === true &&
          herhaaldData.al === true &&
          herhaaldData.id === notitieData.id &&
          !String(notitieData.href || '').includes('Рахунок'),
      );

      const geslotenKlant = await metLade({ userId: gebruikerA, ruimte: 'prive' }, 'mail', async () =>
        routesA['POST /api/owner/mail/bruggen/klantkaart'][0]({
          event: {},
          body: { accountId: 'acc-live-1', messageId: 'msg-live-1', naam: 'Будівельна спілка', mail: 'info@gilde.example' },
          params: {},
        }),
      ) as { statusCode: number; body: string };
      check(
        'Г PostgreSQL: без відкритого сховища ключів міст Картки клієнта повертає 423 із посиланням на розблокування',
        geslotenKlant.statusCode === 423 && geslotenKlant.body.includes('methoden#sleutelkluis'),
      );

      sleutelkluis.zetHouderControle(async () => true);
      await sleutelkluis.inschakelen({ userId: gebruikerA, ruimte: 'prive' }, { soort: 'sessie', id: sessieId });

      const openKlant = await metLade({ userId: gebruikerA, ruimte: 'prive' }, 'mail', async () =>
        routesA['POST /api/owner/mail/bruggen/klantkaart'][0]({
          event: {},
          body: {
            accountId: 'acc-live-1',
            messageId: 'msg-live-1',
            sleutel: 'proef-klant-sleutel-01',
            naam: 'Будівельна спілка Північ',
            mail: 'info@gilde.example',
            onderwerp: 'Постачання деревини',
            notitieTekst: 'Погоджено графік відвантаження.',
          },
          params: {},
        }),
      ) as { statusCode: number; body: string };
      const openKlantData = JSON.parse(openKlant.body) as { ok?: boolean; id?: string; bestaand?: boolean; href?: string };

      const appPool = getPool('app');
      const clientB = await appPool.connect();
      let zichtbaarVoorB = -1;
      let zichtbaarVoorATech = -1;
      try {
        await clientB.query('BEGIN');
        await clientB.query("SELECT set_config('app.user_id', $1, true)", [gebruikerB]);
        await clientB.query("SELECT set_config('app.ruimte', 'prive', true)");
        zichtbaarVoorB = Number((await clientB.query('SELECT count(*)::int AS n FROM app.mail_dienstbruggen')).rows[0]?.n ?? -1);
        await clientB.query("SELECT set_config('app.user_id', $1, true)", [gebruikerA]);
        await clientB.query("SELECT set_config('app.ruimte', 'technisch', true)");
        zichtbaarVoorATech = Number((await clientB.query('SELECT count(*)::int AS n FROM app.mail_dienstbruggen')).rows[0]?.n ?? -1);
      } finally {
        await clientB.query('ROLLBACK').catch(() => undefined);
        clientB.release();
      }

      check(
        'Г PostgreSQL: картка клієнта створена у prive, а FORCE RLS на app.mail_dienstbruggen ізолює іншого користувача та простір technisch',
        openKlant.statusCode === 200 &&
          openKlantData.ok === true &&
          openKlantData.bestaand === false &&
          String(openKlantData.href || '').startsWith('https://crm.tarasevych.com/klanten?klant=') &&
          zichtbaarVoorB === 0 &&
          zichtbaarVoorATech === 0,
      );
    } finally {
      try {
        const sysPool = getPool('systeem');
        await sysPool.query('DELETE FROM app.mail_dienstbruggen WHERE gebruiker_id IN ($1, $2)', [gebruikerA, gebruikerB]).catch(() => undefined);
        await sysPool.query('DELETE FROM app.klantrelatieboek WHERE gebruiker IN ($1, $2)', [gebruikerA, gebruikerB]).catch(() => undefined);
        await sysPool.query('DELETE FROM app.notities WHERE user_id IN ($1, $2)', [gebruikerA, gebruikerB]).catch(() => undefined);
        await sysPool.query('DELETE FROM app.mcp_console_items WHERE user_id IN ($1, $2)', [gebruikerA, gebruikerB]).catch(() => undefined);
        await sysPool.query("DELETE FROM app.records WHERE tbl = 'users' AND id IN ($1, $2)", [gebruikerA, gebruikerB]).catch(() => undefined);
      } catch {
        /* очищення тестових записів */
      }
      await closePool().catch(() => undefined);
    }
  }

  // ========================================================================= Д. Абсолютний мовний закон та парність документації
  const docUk = lees('docs/mail/КОНСОЛІДАЦІЯ-ПОШТА.uk.md');
  const docNl = lees('docs/mail/CONSOLIDATIE-MAIL.nl.md');
  const koppenUk = docUk.match(/^#{1,3}\s+.+$/gm) || [];
  const koppenNl = docNl.match(/^#{1,3}\s+.+$/gm) || [];
  check(
    'Д парна документація Пошти (uk + nl) має однакову кількість заголовків, взаємні посилання та дотримується мовного закону',
    docUk.includes('CONSOLIDATIE-MAIL.nl.md') &&
      docNl.includes('КОНСОЛІДАЦІЯ-ПОШТА.uk.md') &&
      koppenUk.length === 5 &&
      koppenNl.length === 5 &&
      !RUSSISCH_RE.test(docUk) &&
      !DEELWOORD_RE.test(docUk) &&
      !taalwetOvertreding(docUk) &&
      !/[\u0400-\u04FF]/.test(docNl.replace(/\[Читати українською\]\([^)]+\)/g, '')),
  );

  const gecontroleerdeBronnen = [
    'migrations/0313_mail_bruggen_vlag.sql',
    'migrations/0314_mail_vertaal_microsoft.sql',
    'backend/mail-bruggen.ts',
    'src/bijlage-weergave/weergave-modus.ts',
    'src/bijlage-weergave/Kop.tsx',
    'src/bijlage-v2/BijlageV2Kop.tsx',
    'src/mail/MailDienstBruggen.tsx',
  ];
  check(
    'Д усі нові модулі та міграції Блоку А вільні від заборонених літер, активних дієприкметників і техно-сленгу',
    gecontroleerdeBronnen.every((pad) => {
      const inhoud = lees(pad);
      return !RUSSISCH_RE.test(inhoud) && !DEELWOORD_RE.test(inhoud) && !taalwetOvertreding(inhoud);
    }),
  );

  return einde();
}
