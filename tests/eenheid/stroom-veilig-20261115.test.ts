// STROOM-VEILIG (15.11.2026): перевірка аварійної зупинки ШІ, часткових збоїв огляду/діагностики, лічильника ШІ,
// живого фону, прибраного !important у mail-achtergrond.css, доступності налаштувань пошти на 360–390px і каталогу пошуку.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';
import { sluitAlleStroomenVoorNoodstop } from '../../backend/connector-v2-stroom';
import { bouwOverzicht, gebruikerHistorie, type Invoer } from '../../backend/beheer-overzicht-kern';
import { UI_ELEMENTEN } from '../../shared/zoek-ui-knoppen.generated';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

function basisInvoer(nu: number, extra: Partial<Invoer> = {}): Invoer {
  return {
    nu,
    gebruikers: [],
    telling: { totaal: 0, nieuw24: 0, nieuw7: 0, wachtGoedkeuring: 0 },
    sessies: [],
    uren: [],
    dagen: [],
    acties7: [],
    recent: [],
    diensten: [],
    runs: [],
    wachtUitrol: 0,
    wachtToegang: 0,
    magAudit: true,
    ...extra,
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('stroom-veilig-20261115');

  // ------------------------------------------------------------------ 1. Аварійна зупинка ШІ (noodstop)
  {
    const aiSrc = lees('backend/ai-toestemmingen.ts');
    const agentSrc = lees('deploy/agent/agent.mjs');
    const stroomSrc = lees('backend/connector-v2-stroom.ts');
    check(
      '1a sluitAlleStroomenVoorNoodstop експортується, надсилає event: noodstop і реєструється без циклу імпортів',
      typeof sluitAlleStroomenVoorNoodstop === 'function' &&
        sluitAlleStroomenVoorNoodstop('onbekende-gebruiker') === 0 &&
        stroomSrc.includes('event: noodstop') &&
        stroomSrc.includes('registreerStroomNoodstop(sluitAlleStroomenVoorNoodstop)') &&
        !aiSrc.includes("from './connector-v2-stroom'"),
    );
    check(
      '1b stopAll і blockUser відкликають uitrol_voorbereiders, фіксують browsers/streams, числове поле agents та чесний rapport',
      aiSrc.includes('UPDATE app.uitrol_voorbereiders SET ingetrokken_op = now()') &&
        aiSrc.includes('AND (browser_enabled = true OR armed_until IS NOT NULL) RETURNING id') &&
        aiSrc.includes('const agents = out.browsers + out.namens + streams;') &&
        aiSrc.includes('nietAutomatischTeStoppen:') &&
        aiSrc.includes('const streams = stroomNoodstop ? stroomNoodstop(userId) : 0;'),
    );
    check(
      '1c deploy/agent/agent.mjs відстежує дочірні процеси, зупиняє їх при stop/noodstop та виходить без перепідключення при коді 4410',
      agentSrc.includes('actieveProcessen.add(child)') &&
        agentSrc.includes("msg.t === 'stop' || msg.type === 'noodstop'") &&
        agentSrc.includes("stopActieveProcessen('noodstop')") &&
        agentSrc.includes('if (ev.code === 4410)'),
    );
    nepBrowser('https://mcp.tarasevych.com', 'uk');
    const { AiStopKnop } = await import('../../src/AiToestemmingen');
    const stopKnopHtml = renderToStaticMarkup(createElement(AiStopKnop, { tr: (uk) => uk }));
    check('1d AiStopKnop відмальовується без помилок і показує кнопку аварійної зупинки', stopKnopHtml.includes('data-ai-stop="rust"') && stopKnopHtml.includes('Стоп'));
  }

  // ------------------------------------------------------------------ 2. Сховище ключів та часткові збої БД
  {
    const kluisSrc = lees('backend/api-platform-kluis.ts');
    const ovSrc = lees('backend/beheer-overzicht.ts');
    const dgSrc = lees('backend/beheer-diagnostiek-gebruiker.ts');
    const dashSrc = lees('src/overzicht/Dashboard.tsx');
    const widSrc = lees('src/overzicht/widgets.tsx');
    const tabSrc = lees('src/diagnostiek/GebruikerTab.tsx');
    const nu = Date.now();

    check('2a ліміт записів у сховищі ключів збільшено до MAX_ITEMS=120', /\bMAX_ITEMS\s*=\s*120\b/.test(kluisSrc));

    const schoon = bouwOverzicht(basisInvoer(nu));
    const metFout = bouwOverzicht(
      basisInvoer(nu, {
        bronFouten: ['audit_uren', 'diensten'],
        actieveVersie: { versie: '20261115-120000', release: 'v1', commit: 'abc1234', staat: 'ok', bron: 'geinstalleerd' },
      }),
    );
    check(
      '2b bouwOverzicht передає bronFouten, gedeeltelijkeFout та actieveVersie у uitrol.stand',
      !schoon.gedeeltelijkeFout &&
        schoon.bronFouten.length === 0 &&
        schoon.uitrol.stand === null &&
        metFout.gedeeltelijkeFout &&
        metFout.bronFouten.join(',') === 'audit_uren,diensten' &&
        metFout.uitrol.stand?.versie === '20261115-120000',
    );

    const hist = gebruikerHistorie({ nu, gebruiker: undefined, id: 'u-proef-1', audit: [], sessies: [], bronFouten: ['gebruiker_audit'] });
    check('2c gebruikerHistorie зберігає bronFouten і gedeeltelijkeFout', hist.gedeeltelijkeFout && hist.bronFouten[0] === 'gebruiker_audit');

    check(
      '2d backend/beheer-overzicht.ts та backend/beheer-diagnostiek-gebruiker.ts передають назви джерел у probeer() та читають huidigeStand()',
      ovSrc.includes("probeer('gebruikers'") &&
        ovSrc.includes("probeer('uitrol_stand'") &&
        ovSrc.includes('huidigeStand({ nu })') &&
        dgSrc.includes("probeer('sessies'") &&
        dgSrc.includes("probeer('mail_queue'") &&
        dgSrc.includes('gedeeltelijkeFout: bronFouten.length > 0'),
    );
    check(
      '2e UI огляду й діагностики відображає попередження про частковий збій і поточну версію сайту',
      dashSrc.includes('data-testid="ov-gedeeltelijke-fout"') &&
        widSrc.includes('o.uitrol.stand?.versie') &&
        tabSrc.includes('detail.gedeeltelijkeFout'),
    );
  }

  // ------------------------------------------------------------------ 3. Лічильник aiTeller, живий фон і макет
  {
    nepBrowser('https://hub.tarasevych.com', 'uk');
    const { aiTeller } = await import('../../src/agenten/gegevens');
    const { default: LevendeAchtergrond } = await import('../../src/achtergrond/LevendeAchtergrond');
    const now = Date.now();
    const oauth = [{ clientName: 'Claude', status: 'active' }, { clientName: 'Grok', status: 'revoked' }];
    const tokens = [{ name: 'Cursor Pro', revokedAt: '', expiresAt: new Date(now + 864e5).toISOString() }];
    const v2 = [
      { slug: 'claude' as const, koppelingen: [{ id: 'k1' }], deur: [], voorkeur: null },
      { slug: 'gpt' as const, koppelingen: [], deur: [{ id: 'd1' }], voorkeur: null },
      { slug: 'gemini' as const, koppelingen: [], deur: [], voorkeur: null },
    ];
    const telZonderV2 = aiTeller(oauth, tokens, now);
    const telMetV2 = aiTeller(oauth, tokens, now, v2);

    const html = renderToStaticMarkup(createElement(LevendeAchtergrond, { lang: 'uk' }));
    const ssrOk = html.includes('<canvas') && html.includes('levende-achtergrond');

    check(
      '3a aiTeller об’єднує активні OAuth, токени та v2-підключення за брендом без дублів (Claude=1, Cursor=1, GPT через deur=1, порожній Gemini=0)',
      telZonderV2 === 2 && telMetV2 === 3,
      `zonder=${telZonderV2}, met=${telMetV2}`,
    );
    check('3b AgentenPagina передає v2.data?.agenten у aiTeller', lees('src/agenten/AgentenPagina.tsx').includes('aiTeller(overzicht?.oauth, tokens, nu, v2.data?.agenten)'));

    const werkerSrc = lees('src/achtergrond/levende-werker.ts');
    const levendSrc = lees('src/achtergrond/LevendeAchtergrond.tsx');
    const maquetteOml = lees('src/identiteit/maquette/maquette-omlijsting.css');
    check(
      '3c LevendeAchtergrond і levende-werker обмежують FPS ≤ 45, передають opMeting до hoofdMotor, стежать за document.hidden/resize і без !important на backdrop-filter',
      werkerSrc.includes('Math.min(plan.fps, 45)') &&
        levendSrc.includes('Math.min(plan.fps, 45)') &&
        levendSrc.includes('hoofdMotor(doek, plan, window.innerWidth, window.innerHeight, opMeting)') &&
        levendSrc.includes('document.hidden') &&
        levendSrc.includes('setIsAanraak(aanraak())') &&
        !/backdrop-filter:none\s*!important/.test(maquetteOml),
    );
    check('3d LevendeAchtergrond відмальовується на сервері без збою', ssrOk);
  }

  // ------------------------------------------------------------------ 4. z-index, вузький екран пошти (360–390px), каталог пошуку
  {
    const mailBgCss = lees('src/mail/mail-achtergrond.css');
    const mailMobCss = lees('src/mail-mobiel.css');
    const plaatsingJson = lees('scripts/plaatsing-vaste-elementen.json');
    const zoekGlobaalSrc = lees('src/zoek/ZoekGlobaal.tsx');

    const portaalRegel = mailBgCss.split('\n').find((l) => l.includes('mail-achtergrond-instellingen-portaal')) ?? '';
    check(
      '4a mail-achtergrond.css не має жодного !important, використовує z-index:960 і зареєстрований у plaatsing-vaste-elementen.json',
      portaalRegel.includes('z-index:960') &&
        !mailBgCss.includes('!important') &&
        plaatsingJson.includes('src/mail/mail-achtergrond.css :: body .mail-achtergrond-instellingen.mail-achtergrond-instellingen-portaal'),
    );

    check(
      '4b mail-mobiel.css не ховає кнопку швидких налаштувань пошти (.mail-top-settings) і адаптує шапку на ≤440px (360–390px)',
      !mailMobCss.includes('.mail-top-settings{display:none') &&
        mailMobCss.includes('@media (max-width:440px)') &&
        mailMobCss.includes('.mail-top-settings{flex:0 0 40px;aspect-ratio:1/1;border-radius:50%;width:40px;height:40px;min-width:40px;min-height:40px}') &&
        mailMobCss.includes('.mail-quick-settings{max-width:100vw;box-sizing:border-box}'),
    );

    const gen = await import(pathToFileURL(join(process.cwd(), 'scripts/zoek-ui-catalogus.mjs')).href);
    const vers = gen.naarTs(gen.genereer(process.cwd()));
    const opSchijf = lees('shared/zoek-ui-knoppen.generated.ts');
    const achtergrondEls = UI_ELEMENTEN.filter((e) => e.bestand.startsWith('src/achtergrond/'));
    const tgGebruikerEls = UI_ELEMENTEN.filter((e) => e.bestand === 'src/telegram-aanmelden/TelegramSectie.tsx' || e.bestand === 'src/telegram-aanmelden/AanmeldTelegram.tsx');
    const tgBeheerEls = UI_ELEMENTEN.filter((e) => e.bestand === 'src/telegram-aanmelden/TelegramBeheer.tsx' || e.bestand === 'src/telegram-aanmelden/PlaatsingBeheer.tsx');

    check(
      '4c каталог пошуку актуальний: achtergrond/ → identity/personalization (iedereen), telegram-aanmelden/ → identity/methods (iedereen), TelegramBeheer/PlaatsingBeheer → admin/access (technisch)',
      vers === opSchijf &&
        achtergrondEls.length > 0 &&
        achtergrondEls.every((e) => e.dienst === 'identity' && e.tab === 'personalization' && e.toegang === 'iedereen') &&
        tgGebruikerEls.length > 0 &&
        tgGebruikerEls.every((e) => e.dienst === 'identity' && e.tab === 'methods' && e.toegang === 'iedereen') &&
        tgBeheerEls.every((e) => e.dienst === 'admin' && e.tab === 'access' && e.toegang === 'technisch') &&
        zoekGlobaalSrc.includes('живий фон') &&
        zoekGlobaalSrc.includes('телеграм вхід'),
    );
  }

  return einde();
}
