// HERSTEL-001 (пункт 4 та доопрацювання 7А): стійке й компактне вікно сповіщень бічного меню (.menu-bellen / MeldingBellen).
// Перевіряє:
//  1. відсутність самовільного закриття під час сенсорного гортання (vastgezet, pointerType !== 'mouse', зупинка спливання дотиків,
//     виключення .menu-bellen із перехоплення вказівника та жесту змахування шухляди в CanoniekOmlijsting);
//  2. компактні піктограмні кнопки (is-icoon, 30–32 px на ПК, 34×34 px із сенсорним полем ::after var(--tik-hoogte) на смартфоні)
//     зі збереженням усіх контрактних атрибутів і доступних підписів для зчитувачів екрана двома мовами;
//  3. спливні підказки назв (.menu-bellen-zweeftip): при наведенні мишею на комп’ютері та довгому утримуванні (420 мс) на смартфоні без блокування першого дотику;
//  4. офіційні логотипи брендів із єдиного реєстру src/merk/ (MerkLogo), очищення сирих емодзі, семантичні стани (--staat-goed/-let/-fout)
//     та адекватні людські типи сповіщень зі сформованої бази MELDING_SCHEMAS (shared/meldingen-catalogus.ts).
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-menu-bellen-mobiel');

  const menuMeldingenBron = lees('src/MenuMeldingen.tsx');
  const omlijstingBron = lees('src/CanoniekOmlijsting.tsx');
  const menuCss = zonderCommentaar(lees('src/menu-v2.css'));
  const centrumCss = zonderCommentaar(lees('src/canoniek-meldingencentrum.css'));

  // ------------------------------------------------------------------ 1. Розмітка, атрибути, логотипи й семантика MeldingBellen (uk + nl)
  {
    const { MeldingBellen, schoonMeldingTitel, stipUitleg, verrijkMenuMelding } = await import('../../src/MenuMeldingen');
    const nu = Date.now();
    const badge = {
      item: 'svc:admin',
      aantal: 78,
      categorieen: ['beveiliging'] as Array<'beveiliging'>,
      nieuwste: nu,
      meldingen: [
        { id: 'm1', bron: 'server' as const, item: 'svc:admin', categorie: 'beveiliging' as const, titel: '🚨 Telegram: тривога безпеки', tekst: 'Вхід через Telegram знову працює.', op: nu - 60_000, link: 'https://admin.tarasevych.com/sso' },
        { id: 'm2', bron: 'server' as const, item: 'svc:admin', categorie: 'beveiliging' as const, titel: 'Перевірка єдиного входу пройдена із зауваженням', tekst: 'Зафіксовано оновлення прав.', op: nu - 120_000, link: 'https://admin.tarasevych.com/sso' },
        { id: 'm3', bron: 'server' as const, item: 'svc:admin', categorie: 'beveiliging' as const, titel: '⛔ Спробу входу через Telegram заблоковано', tekst: 'Підозріла спроба доступу відхилена.', op: nu - 180_000 },
      ],
    };
    const anker = { left: 12, top: 80, right: 240, bottom: 124, width: 228, height: 44, x: 12, y: 80, toJSON: () => ({}) } as DOMRect;

    const ukVast = renderToStaticMarkup(createElement(MeldingBellen, {
      lang: 'uk',
      label: 'Адміністрування',
      badge,
      anker,
      vastgezet: true,
      onSluit: () => undefined,
      onOpen: () => undefined,
      onAllesWeg: () => undefined,
      onBinnen: () => undefined,
      onEsc: () => undefined,
      onSluitVenster: () => undefined,
      paneelRef: () => undefined,
    }));
    const nlLos = renderToStaticMarkup(createElement(MeldingBellen, {
      lang: 'nl',
      label: 'Beheer',
      badge,
      anker,
      vastgezet: false,
      onSluit: () => undefined,
      onOpen: () => undefined,
      onAllesWeg: () => undefined,
      onBinnen: () => undefined,
      onEsc: () => undefined,
      paneelRef: () => undefined,
    }));

    check(
      '1a закріплене вікно позначається data-vastgezet="ja", а режим наведення — без цієї позначки',
      ukVast.includes('data-vastgezet="ja"') && !nlLos.includes('data-vastgezet'),
    );
    check(
      '1b шапка містить компактні кнопки довідки ⓘ (data-menu-bellen-info="1") і закриття ✕ (data-menu-bellen-sluit="1") двома мовами',
      ukVast.includes('data-menu-bellen-info="1"')
        && ukVast.includes('data-menu-bellen-sluit="1"')
        && ukVast.includes('aria-label="Що означає позначка"')
        && ukVast.includes('aria-label="Закрити вікно сповіщень"')
        && nlLos.includes('aria-label="Wat betekent de stip"')
        && nlLos.includes('aria-label="Meldingenvenster sluiten"'),
    );
    const idMatch = /data-menu-bellen-info="1"[^>]*aria-controls="([^"]+)"/.exec(ukVast);
    const uitlegId = idMatch?.[1] || '';
    check(
      '1c елемент [data-menu-bellen-uitleg="1"] збережено в дереві документа й пов’язано через aria-controls та aria-describedby',
      Boolean(uitlegId)
        && ukVast.includes(`aria-describedby="${uitlegId}"`)
        && ukVast.includes(`id="${uitlegId}"`)
        && ukVast.includes('data-menu-bellen-uitleg="1"')
        && ukVast.includes(stipUitleg('uk', 'Адміністрування', badge)),
    );
    check(
      '1d збережено всі контрактні атрибути піктограмних кнопок карток і підвалу (openen, weg, alles, paneel) двома мовами',
      (ukVast.match(/data-menu-bel-openen="1"/g) || []).length === 3
        && (ukVast.match(/data-menu-bel-weg="1"[^>]*>Очистити</g) || []).length === 3
        && ukVast.includes('data-menu-bellen-alles="1"')
        && ukVast.includes('>Очистити все тут<')
        && ukVast.includes('data-menu-bellen-paneel="1"')
        && nlLos.includes('>Opruimen<')
        && nlLos.includes('>Alles hier opruimen<')
        && nlLos.includes('Alle meldingen'),
    );
    check(
      '1e заголовки очищено від початкових сирих емодзі, а в медальйоні картки відображається офіційний логотип Telegram із src/merk/',
      schoonMeldingTitel('🚨 Telegram: тривога безпеки') === 'Telegram: тривога безпеки'
        && schoonMeldingTitel('✅ Telegram прив’язано') === 'Telegram прив’язано'
        && !ukVast.includes('🚨')
        && !ukVast.includes('⛔')
        && ukVast.includes('data-merk="telegram"')
        && ukVast.includes('data-merk-officieel="telegram"')
        && ukVast.includes('data-merk="oauth"'),
    );

    const vGoed = verrijkMenuMelding(badge.meldingen[0], 'svc:admin', 'Адміністрування', 'uk');
    const vLet = verrijkMenuMelding(badge.meldingen[1], 'svc:admin', 'Адміністрування', 'uk');
    const vFout = verrijkMenuMelding(badge.meldingen[2], 'svc:admin', 'Адміністрування', 'uk');
    const vToegang = verrijkMenuMelding(
      { id: 'm4', bron: 'server', item: 'svc:admin', categorie: 'toegang', titel: 'Новий запит на доступ', tekst: 'Очікує підтвердження власника.', op: nu },
      'svc:admin',
      'Адміністрування',
      'uk',
    );
    const vAi = verrijkMenuMelding(
      { id: 'm5', bron: 'server', item: 'svc:ai', categorie: 'ai', titel: 'Claude просить дозвіл на дію', tekst: 'Читання документа.', op: nu },
      'svc:ai',
      'Штучний інтелект',
      'uk',
    );
    check(
      '1f семантичні стани (goed / let / fout) та людські типи зі схемами MELDING_SCHEMAS визначаються адекватно змісту',
      vGoed.staat === 'goed'
        && vGoed.schoonTitel === 'Telegram: зв’язок відновлено'
        && vGoed.merk === 'telegram'
        && vGoed.soortTekst === 'Telegram · Відновлення входу'
        && vLet.staat === 'let'
        && vLet.merk === 'oauth'
        && vLet.schemaId === 'S1'
        && vLet.soortTekst === 'Єдиний вхід · Вхід і пристрій'
        && vFout.staat === 'fout'
        && vFout.merk === 'telegram'
        && vFout.schemaId === 'S1'
        && vToegang.staat === 'let'
        && vToegang.merk === null
        && vToegang.schemaId === 'S5'
        && vToegang.soortTekst === 'Адміністрування · Запит на доступ'
        && vAi.merk === 'claude'
        && vAi.schemaId === 'S11'
        && vAi.soortTekst === 'Claude · ШІ просить',
    );
  }

  // ------------------------------------------------------------------ 2. Стійкість дотику та механізм спливних підказок назв кнопок
  check(
    '2a MeldingBellen ігнорує pointerleave для сенсорного вказівника та у закріпленому стані, а також зупиняє спливання touch-подій',
    menuMeldingenBron.includes("onPointerLeave={e=>{if(vastgezet||e.pointerType!=='mouse')return;")
      && menuMeldingenBron.includes('onBlur={e=>{if(vastgezet)return;')
      && menuMeldingenBron.includes('onTouchStart={e=>e.stopPropagation()}')
      && menuMeldingenBron.includes('onTouchMove={e=>e.stopPropagation()}'),
  );
  check(
    '2b CanoniekOmlijsting не перехоплює setPointerCapture і не запускає жест змахування закриття шухляди зсередини .menu-bellen',
    omlijstingBron.includes("(event.target as Element|null)?.closest?.('.menu-bellen,.canonical-notification-panel,.am3-mobiel-laag,.canonical-account-portal'))return")
      && omlijstingBron.includes("target?.closest('.menu-bellen,.am3-mobiel-laag,.canonical-account-portal')")
      && omlijstingBron.includes('if(!direct&&belVastRef.current)return;')
      && omlijstingBron.includes('vastgezet={bel.vast}')
      && omlijstingBron.includes('onSluitVenster='),
  );
  check(
    '2c піктограмні кнопки використовують єдиний реєстр MerkLogo без ручних <path>, виконують дію з першого дотику і показують спливну капсулу назви за наведенням миші або довгим утримуванням',
    menuMeldingenBron.includes("import MerkLogo from './merk/MerkLogo'")
      && !menuMeldingenBron.includes('<path')
      && menuMeldingenBron.includes("className='menu-bellen-zweeftip'")
      && menuMeldingenBron.includes("if(e.pointerType==='mouse')toonZweeftip(")
      && menuMeldingenBron.includes('AANRAAK_LANG_DRUK_MS=420')
      && menuMeldingenBron.includes('AANRAAK_TIP_MS=2800')
      && !menuMeldingenBron.includes('ще дотик')
      && !menuMeldingenBron.includes('tik nogmaals'),
  );

  // ------------------------------------------------------------------ 3. Геометрія, прокручуваний список ul та компактні піктограмні кнопки
  const telefoon = { breedte: 360, hoogte: 800, pointer: 'coarse' as const, hover: 'none' as const };
  const computer = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const regelsMenu = leesCss(lees('src/menu-v2.css'));
  const regelsCentrum = leesCss(lees('src/canoniek-meldingencentrum.css'));

  check(
    '3a розміри .menu-bellen: просторі на комп’ютері (380×560) та адаптивні на смартфоні (min(380px, 100vw - 20px), 74dvh)',
    wint(regelsMenu, '.menu-bellen', 'width', computer)?.waarde === 'min(380px,calc(100vw - 24px))'
      && wint(regelsMenu, '.menu-bellen', 'max-height', computer)?.waarde === 'min(560px,calc(100dvh - 32px))'
      && wint(regelsMenu, '.menu-bellen', 'width', telefoon)?.waarde === 'min(380px,calc(100vw - 20px))'
      && wint(regelsMenu, '.menu-bellen', 'max-height', telefoon)?.waarde === 'min(74dvh,calc(100dvh - 24px))',
  );
  check(
    '3b прокручуваний список .menu-bellen ul має overscroll-behavior:contain, touch-action:pan-y і тонкий повзунок',
    menuCss.includes('overscroll-behavior:contain')
      && menuCss.includes('touch-action:pan-y')
      && menuCss.includes('scrollbar-width:thin'),
  );
  check(
    '3c компактні піктограмні кнопки (30–32 px на ПК, 32×32 px на смартфоні з сенсорною зоною ::after var(--tik-hoogte)) і прив’язка станів до --staat-*',
    wint(regelsCentrum, '.menu-bellen .menu-bellen-voet', 'display', telefoon)?.waarde === 'flex'
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-voet', 'flex-wrap', telefoon)?.waarde === 'nowrap'
      && wint(regelsCentrum, '.menu-bellen .menu-bel-openen', 'width', computer)?.waarde === '30px'
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-paneel', 'width', computer)?.waarde === '32px'
      && wint(regelsCentrum, '.menu-bellen .menu-bel-openen', 'width', telefoon)?.waarde === '32px'
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-voet .menu-bellen-alles', 'width', telefoon)?.waarde === '32px'
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-paneel::after', 'height', telefoon)?.waarde === 'var(--tik-hoogte)'
      && menuCss.includes("--bel-kleur:var(--staat-goed)")
      && menuCss.includes("--bel-kleur:var(--staat-let)")
      && menuCss.includes("--bel-kleur:var(--staat-fout)"),
  );
  check(
    '3d мовна чистота: жодних заборонених літер у змінених файлах',
    ![menuMeldingenBron, omlijstingBron, lees('src/menu-v2.css'), lees('src/canoniek-meldingencentrum.css'), lees('tests/eenheid/herstel-001-menu-bellen-mobiel.test.ts')].some((s) => /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/.test(s)),
  );

  return einde();
}
