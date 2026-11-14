// KLASSIEK-002C (Хвиля 1 тем оформлення «Біла класика» та «Чорна класика»):
// перевірка спеціалізованих поштових панелей піддомену mail.tarasevych.com —
// вимкнення вітрин у MailFunctioneelWeergave, компактної ділової шапки у MailAccountsHub,
// зупинки полотна рухомих частинок у MailAchtergrond та класичного шару в mail-panelen-maquette.css.
// Eenheidstest voor de zakelijke klassieke weergave van postpanelen, zijbalknavigatie, accounts, contacten en instellingen.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-002c-panelen');

  const functioneel = readFileSync('src/MailFunctioneelWeergave.tsx', 'utf8');
  const accountsHub = readFileSync('src/MailAccountsHub.tsx', 'utf8');
  const achtergrond = readFileSync('src/mail/MailAchtergrond.tsx', 'utf8');
  const panelenCss = readFileSync('src/mail/mail-panelen-maquette.css', 'utf8');
  const zelf = readFileSync('tests/eenheid/klassiek-002c-panelen.test.ts', 'utf8');

  // 1. MailFunctioneelWeergave.tsx: збереження надкритичних рядків і вимкнення вітрин за isKlassiek.
  check(
    'MailFunctioneelWeergave зберігає обидва надкритичні рядки маршрутизації та імпортів таблиць стилів без жодних змін',
    functioneel.includes("import './mail-functioneel.css';import './mail-ux-beoordeling-20261021.css';") &&
      functioneel.includes("const standardMailSurface=tab!=='accounts'&&tab!=='local'&&tab!=='contacts';"),
  );

  check(
    'MailFunctioneelWeergave підключає useIsKlassiekMaquette і не відмальовує MaquetteHeld та MaquetteAnkerRail у Класиці',
    functioneel.includes('useIsKlassiekMaquette') &&
      functioneel.includes('const isKlassiek=useIsKlassiekMaquette();') &&
      functioneel.includes("const maquetteBoven=!maquetteSpeciaal||isKlassiek||modaalOpen?null:tab==='accounts'?("),
  );

  // 2. MailAccountsHub.tsx: компактна ділова шапка mail-accounts-hero у Класиці без кольорових частинок.
  check(
    'MailAccountsHub показує компактну ділову шапку mail-accounts-hero за (!isMaquette || isKlassiek) і вимикає MailAchtergrond у Класиці',
    accountsHub.includes('useIsKlassiekMaquette') &&
      accountsHub.includes("(!isMaquette || isKlassiek)") &&
      accountsHub.includes("<header className='mail-accounts-hero mail-accounts-welkom'") &&
      accountsHub.includes("{!isKlassiek ? <MailAchtergrond lang={lang} plaats='accounts' /> : null}"),
  );

  // 3. MailAchtergrond.tsx: миттєве повернення null і зупинка 1400 частинок у Класиці зі збереженням createPortal і document.body.
  check(
    'MailAchtergrond у режимі Класики зупиняє ефекти полотна й повертає null, зберігаючи createPortal та document.body для інших тем',
    achtergrond.includes('useIsKlassiekMaquette') &&
      achtergrond.includes('const isKlassiek = useIsKlassiekMaquette();') &&
      achtergrond.includes('if (isKlassiek) return;') &&
      achtergrond.includes('if (isKlassiek) return null;') &&
      achtergrond.includes('createPortal(') &&
      achtergrond.includes('document.body'),
  );

  // 4. mail-panelen-maquette.css: ізоляція світлого режиму, повнота класичного шару та сувора CSS-дисципліна.
  const eersteMaxMedia = panelenCss.search(/@media\s*\(\s*max-width/);
  const idxKlassiekBlok = panelenCss.indexOf('html.palet-maquette[data-maquette-stijl="klassiek"]');
  const idxNietKlassiekLicht = panelenCss.indexOf(':not([data-maquette-stijl="klassiek"])');
  const cssZonderCommentaar = panelenCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const eersteMaxZonderCommentaar = cssZonderCommentaar.search(/@media\s*\(\s*max-width/);
  const naMedia =
    eersteMaxZonderCommentaar >= 0
      ? cssZonderCommentaar
          .slice(eersteMaxZonderCommentaar)
          .replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
          .trim()
      : 'GEEN_MEDIA';

  check(
    'mail-panelen-maquette.css ізолює студійні правила світлого режиму через :not([data-maquette-stijl="klassiek"]) і оголошує блок Класики перед першим @media (max-width)',
    idxNietKlassiekLicht > 0 &&
      idxKlassiekBlok > 0 &&
      eersteMaxMedia > idxKlassiekBlok &&
      panelenCss.includes('html.palet-maquette.palet-klassiek-wit[data-maquette-stijl="klassiek"]') &&
      panelenCss.includes('html.palet-maquette.palet-klassiek-zwart[data-maquette-stijl="klassiek"]'),
  );

  const klassiekDeel = panelenCss.slice(idxKlassiekBlok, eersteMaxMedia);

  check(
    'класичний блок у mail-panelen-maquette.css охоплює бічну навігацію, мітки, accounts, вікно підключення, local, контакти, діалог відправника, підписки й налаштування',
    klassiekDeel.includes('.mail-sidebar-navigation') &&
      klassiekDeel.includes('.mail-compose-pill') &&
      klassiekDeel.includes('.mail-sidebar-unread-count') &&
      klassiekDeel.includes('.mail-label-editor') &&
      klassiekDeel.includes('.mail-navigation-editor') &&
      klassiekDeel.includes('.mail-accounts-hero') &&
      klassiekDeel.includes('.mail-accounts-kaart') &&
      klassiekDeel.includes('.mail-provider-tegel') &&
      klassiekDeel.includes('.mail-koppeling') &&
      klassiekDeel.includes('.mail-orbit-intro') &&
      klassiekDeel.includes('.venster.mail-koppel-mobile-sheet') &&
      klassiekDeel.includes('.mail-front') &&
      klassiekDeel.includes('.mail-focus-card') &&
      klassiekDeel.includes('.mail-import-dialog') &&
      klassiekDeel.includes('.mail-subscriptions-view') &&
      klassiekDeel.includes('.mail-settings-scaffold') &&
      klassiekDeel.includes('.mail-quick-settings') &&
      klassiekDeel.includes('.afz-dialoog') &&
      klassiekDeel.includes('.ctv-kop') &&
      klassiekDeel.includes('.ctv-detail'),
  );

  check(
    'класичний блок використовує чисті поверхні var(--mq-oppervlak)/var(--mq-oppervlak-2), радіуси 16px і 11px, монохромний акцент var(--mq-accent-op) та tabular-nums без #fff на кнопках',
    klassiekDeel.includes('var(--mq-oppervlak)') &&
      klassiekDeel.includes('var(--mq-oppervlak-2)') &&
      klassiekDeel.includes('background-image: none;') &&
      klassiekDeel.includes('backdrop-filter: none;') &&
      klassiekDeel.includes('border-radius: 16px;') &&
      klassiekDeel.includes('border-radius: 11px;') &&
      klassiekDeel.includes('background: var(--mq-accent);') &&
      klassiekDeel.includes('color: var(--mq-accent-op);') &&
      klassiekDeel.includes('box-shadow: none;') &&
      klassiekDeel.includes('font-variant-numeric: tabular-nums;') &&
      !/color\s*:\s*#fff(?:fff)?\b/i.test(klassiekDeel),
  );

  check(
    'mail-panelen-maquette.css не містить position:fixed, !important чи prefers-color-scheme, а всі @media (max-width) стоять суворо наприкінці файла',
    !/position\s*:\s*fixed/i.test(panelenCss) &&
      !/!important/i.test(panelenCss) &&
      !/prefers-color-scheme/i.test(panelenCss) &&
      eersteMaxZonderCommentaar > 0 &&
      naMedia === '',
  );

  // 5. Мовна чистота всіх файлів контуру KLASSIEK-002C.
  const koppelVenster = readFileSync('src/mail/MailKoppelVenster.tsx', 'utf8');
  const bestanden: readonly [string, string][] = [
    ['src/MailFunctioneelWeergave.tsx', functioneel],
    ['src/MailAccountsHub.tsx', accountsHub],
    ['src/mail/MailKoppelVenster.tsx', koppelVenster],
    ['src/mail/MailAchtergrond.tsx', achtergrond],
    ['src/mail/mail-panelen-maquette.css', panelenCss],
    ['tests/eenheid/klassiek-002c-panelen.test.ts', zelf],
  ];
  const overtredingen = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-002C не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
