// HERSTEL-001 (пункт 4): стійке вікно сповіщень бічного меню (.menu-bellen / MeldingBellen) на смартфоні й комп’ютері.
// Перевіряє:
//  1. відсутність самовільного закриття під час сенсорного гортання (vastgezet, pointerType !== 'mouse', зупинка спливання дотиків,
//     виключення .menu-bellen із перехоплення вказівника та свайпу шухляди в CanoniekOmlijsting);
//  2. наявність кнопок довідки (ⓘ) і закриття (✕) у шапці та збереження [data-menu-bellen-uitleg='1'] у дереві документа;
//  3. просторі адаптивні розміри вікна, підтримку пальцевої прокрутки ul та розташування двох нижніх кнопок в один рядок.
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

  // ------------------------------------------------------------------ 1. Розмітка й атрибути MeldingBellen (uk + nl)
  {
    const { MeldingBellen, stipUitleg } = await import('../../src/MenuMeldingen');
    const nu = Date.now();
    const badge = {
      item: 'svc:admin',
      aantal: 78,
      categorieen: ['beveiliging'] as Array<'beveiliging'>,
      nieuwste: nu,
      meldingen: [
        { id: 'm1', bron: 'server' as const, item: 'svc:admin', categorie: 'beveiliging' as const, titel: 'Тривога безпеки', tekst: 'Вхід через Telegram знову працює.', op: nu - 60_000, link: 'https://admin.tarasevych.com/sso' },
        { id: 'm2', bron: 'server' as const, item: 'svc:admin', categorie: 'beveiliging' as const, titel: 'Перевірка доступу', tekst: 'Зафіксовано оновлення прав.', op: nu - 120_000 },
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
      '1b шапка містить кнопки довідки ⓘ (data-menu-bellen-info="1") і закриття ✕ (data-menu-bellen-sluit="1") двома мовами',
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
      '1d збережено всі контрактні атрибути карток і підвалу (openen, weg, alles, paneel)',
      (ukVast.match(/data-menu-bel-openen="1"/g) || []).length === 2
        && (ukVast.match(/data-menu-bel-weg="1"/g) || []).length === 2
        && ukVast.includes('data-menu-bellen-alles="1"')
        && ukVast.includes('>Очистити все тут<')
        && ukVast.includes('data-menu-bellen-paneel="1"')
        && nlLos.includes('>Alles hier opruimen<')
        && nlLos.includes('Alle meldingen'),
    );
  }

  // ------------------------------------------------------------------ 2. Захист від самовільного закриття при дотику і прокручуванні
  check(
    '2a MeldingBellen ігнорує pointerleave для сенсорного вказівника та у закріпленому стані, а також зупиняє спливання touch-подій',
    menuMeldingenBron.includes("onPointerLeave={e=>{if(vastgezet||e.pointerType!=='mouse')return;")
      && menuMeldingenBron.includes('onBlur={e=>{if(vastgezet)return;')
      && menuMeldingenBron.includes('onTouchStart={e=>e.stopPropagation()}')
      && menuMeldingenBron.includes('onTouchMove={e=>e.stopPropagation()}'),
  );
  check(
    '2b CanoniekOmlijsting не перехоплює setPointerCapture і не запускає свайп закриття шухляди зсередини .menu-bellen',
    omlijstingBron.includes("(event.target as Element|null)?.closest?.('.menu-bellen,.canonical-notification-panel,.am3-mobiel-laag,.canonical-account-portal'))return")
      && omlijstingBron.includes("target?.closest('.menu-bellen,.am3-mobiel-laag,.canonical-account-portal')")
      && omlijstingBron.includes('if(!direct&&belVastRef.current)return;')
      && omlijstingBron.includes('vastgezet={bel.vast}')
      && omlijstingBron.includes('onSluitVenster='),
  );

  // ------------------------------------------------------------------ 3. Геометрія, прокручуваний список ul та підвал в один рядок
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
    '3c дві нижні кнопки в .menu-bellen-voet стоять в один рядок без переносу (flex-wrap:nowrap) і мають висоту дотику на смартфоні',
    wint(regelsCentrum, '.menu-bellen .menu-bellen-voet', 'display', telefoon)?.waarde === 'flex'
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-voet', 'flex-wrap', telefoon)?.waarde === 'nowrap'
      && !/\.menu-bellen-alles\{[^}]*width:\s*100%/.test(menuCss)
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-voet .menu-bellen-alles', 'min-height', telefoon)?.waarde === 'var(--tik-hoogte)'
      && wint(regelsCentrum, '.menu-bellen .menu-bellen-paneel', 'min-height', telefoon)?.waarde === 'var(--tik-hoogte)',
  );
  check(
    '3d мовна чистота: жодних заборонених літер у змінених файлах',
    ![menuMeldingenBron, omlijstingBron, lees('src/menu-v2.css'), lees('src/canoniek-meldingencentrum.css')].some((s) => /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/.test(s)),
  );

  return einde();
}
