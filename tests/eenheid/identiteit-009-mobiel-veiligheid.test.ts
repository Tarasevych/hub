// IDENTITEIT-009: мобільна адаптація всіх трьох режимів id.tarasevych.com («Макет», «Студія», «Класичний») та екрана входу,
// безпека завантаження й скидання світлини профілю, об'єднання паралельних запитів читання та усунення дублювання панелей доступу.
// Mobiele aanpassing van alle drie de weergaven van id.tarasevych.com («Ontwerp», «Studio», «Klassiek») en het aanmeldscherm,
// veiligheid van profielfoto's, bundeling van gelijktijdige leesverzoeken en opheffen van dubbele toegangspanelen.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-009-mobiel-veiligheid');

  const backend = readFileSync('backend/index.ts', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const verenigd = readFileSync('src/VerenigdDienstApp.tsx', 'utf8');
  const instellingen = readFileSync('src/InstellingencentrumWeergave.tsx', 'utf8');
  const profielfoto = readFileSync('src/identiteit/Profielfoto.tsx', 'utf8');
  const leesCache = readFileSync('src/lees-cache.ts', 'utf8');
  const toegangslaag = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
  const sleutelkluis = readFileSync('src/SleutelkluisSectie.tsx', 'utf8');
  const herstelcodes = readFileSync('src/HerstelcodesSectie.tsx', 'utf8');
  const sessies = readFileSync('src/SessiesOverzicht.tsx', 'utf8');
  const aanmeldPanelen = readFileSync('src/aanmeld-vnext/AanmeldVnextPanelen.tsx', 'utf8');
  const am3Instellingen = readFileSync('src/accountmenu-v3/AccountMenuV3Instellingen.tsx', 'utf8');
  const canoniekCss = readFileSync('src/canoniek-omlijsting.css', 'utf8');
  const pagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const accountCss = readFileSync('src/identiteit/identiteit-account.css', 'utf8');
  const atelier = readFileSync('src/identiteit/IdentiteitAtelier.tsx', 'utf8');
  const atelierCss = readFileSync('src/identiteit/identiteit-atelier.css', 'utf8');
  const maquette = readFileSync('src/identiteit/maquette/IdentiteitMaquette.tsx', 'utf8');
  const maquetteCss = readFileSync('src/identiteit/maquette/maquette-omlijsting.css', 'utf8');
  const centrumCss = readFileSync('src/instellingencentrum.css', 'utf8');
  const themaCss = readFileSync('src/thema/thema-instellingen.css', 'utf8');
  const menuCss = readFileSync('src/menu-v2.css', 'utf8');
  const toegangCss = readFileSync('src/toegangslaag.css', 'utf8');
  const aanmeldVnextCss = readFileSync('src/aanmeld-vnext/aanmeld-vnext.css', 'utf8');
  const aanmeldHerontwerpCss = readFileSync('src/aanmeld-herontwerp.css', 'utf8');

  // 1. Безпека та повноцінне скидання власної світлини профілю.
  check(
    'сервер зберігає сервісну світлину providerPicture і скидає власну світлину за запитом reset: true із записом до журналу аудиту',
    backend.includes('providerPicture?: string') &&
      backend.includes('body.reset===true') &&
      backend.includes("'owner.profile.photo.reset'"),
  );
  check(
    'обидва кореневі застосунки й центр налаштувань підтримують скидання світлини (File | null → {reset:true}) та ознаку customPicture',
    app.includes('changeProfilePhoto=async(file:File|null)') &&
      app.includes('{reset:true}') &&
      verenigd.includes('changeProfilePhoto=async(file:File|null)') &&
      verenigd.includes('{reset:true}') &&
      instellingen.includes('eigenFoto={Boolean(p.user.customPicture)}') &&
      instellingen.includes('onFoto?:(file:File|null)=>Promise<unknown>'),
  );
  check(
    'Profielfoto обмежує час очікування (10 с), заголовок переходу (no-referrer), розмір за посиланням (8 МБ) та розмір файла (12 МБ) і викликає onFoto(null) при скиданні',
    profielfoto.includes('MAX_URL_FOTO_BYTES = 8 * 1024 * 1024') &&
      profielfoto.includes('MAX_APPARAAT_FOTO_BYTES = 12 * 1024 * 1024') &&
      profielfoto.includes('new AbortController()') &&
      profielfoto.includes("referrerPolicy: 'no-referrer'") &&
      profielfoto.includes('await onFoto(null)') &&
      profielfoto.includes("e.currentTarget.value = ''"),
  );

  // 2. Швидкодія: об'єднання одночасних запитів читання й усунення потрійного дублювання на одній сторінці.
  check(
    'lees-cache об’єднує паралельні запити swrPost за одним ключем і очищує чергу при зміні акаунта чи скиданні',
    leesCache.includes('const lopend = new Map<string, Promise<{ data: unknown }>>()') &&
      leesCache.includes('lopend.clear()') &&
      leesCache.includes('lopend.delete(k)'),
  );
  check(
    'панелі доступу, сховище ключів і коди відновлення використовують swrPost та скидають збережений стан через leesVergeten після змін',
    toegangslaag.includes("swrPost<Partial<Snapshot>>") &&
      toegangslaag.includes("leesVergeten('/api/owner/access/snapshot')") &&
      sleutelkluis.includes('swrPost<Overzicht>') &&
      sleutelkluis.includes('leesVergeten(`${P}/stand`)') &&
      herstelcodes.includes("swrPost<Overzicht>('/api/owner/access/recovery/overzicht'") &&
      herstelcodes.includes("leesVergeten('/api/owner/access/recovery/overzicht')"),
  );
  check(
    'класичний режим огортає сторінку в AtelierInhoud.Provider, щоб розділи methods, security і recovery не дублювалися тричі в одному документі',
    pagina.includes('<AtelierInhoud.Provider value={true}>') && pagina.includes('</AtelierInhoud.Provider>'),
  );
  check(
    'огляд сесій підвантажує активні сесії при першому показі на об’єднаній сторінці, а вбудовані панелі способів входу не перехоплюють прокрутку сторінки',
    sessies.includes('p.onRefresh()') && aanmeldPanelen.includes("!gEl.closest?.('.ia-inline')"),
  );

  // 3. Мобільна геометрія й зручність у трьох режимах («Макет», «Студія», «Класичний») та на екрані входу.
  check(
    'правило flat-content оболонки не зрізає заокруглення й рамки карток у режимах «Студія» (.mr-at) та «Класичний» (.ia-account)',
    canoniekCss.includes(':not(.mr-at):not(.mr-at *):not(.ia-account):not(.ia-account *):not(.auth-card):not(.mr-mq *)'),
  );
  check(
    'класичний вигляд має горизонтальну липку смугу розділів без роздутої сітки на мобільних екранах, автоцентрування активної вкладки й сенсорну зону 44×44 px для скидання світлини',
    pagina.includes("data-no-edge-swipe='1'") &&
      pagina.includes("querySelector<HTMLElement>('.ia-toc-knop.actief')") &&
      !accountCss.includes('grid-template-columns: 1fr 1fr;') &&
      accountCss.includes('.ia-avatar-prullenbak::after') &&
      accountCss.includes('overflow-x: auto;'),
  );
  check(
    'режим «Студія» має кнопку «Вигляд і навігація» у мобільній смузі, відступ під верхню смугу сайту та прокручуваний мобільний аркуш налаштувань',
    atelier.includes("aria-label={vertaal(lang, 'Вигляд і навігація', 'Weergave en navigatie')}") &&
      atelierCss.includes('--mr-boven:70px;') &&
      atelierCss.includes('top:calc(var(--mr-boven,62px) + 4px)') &&
      atelierCss.includes('@container mr-at (max-width:440px)') &&
      atelierCss.includes('max-height:min(86dvh,calc(100dvh - 24px));overflow-y:auto'),
  );
  check(
    'режим «Макет» на телефоні ховає фонову бічну шухляду під відкритим меню облікового запису й автоматично закриває її після виходу з меню',
    maquette.includes("Boolean(document.querySelector('.am3-mobiel-laag'))") &&
      maquette.includes("'.canonical-drawer-close, .canonical-sidebar-scrim.drawer'") &&
      maquetteCss.includes("html[data-identiteit-maquette='aan'] .canonical-chrome.sidebar-drawer:has(.am3-mobiel-laag)"),
  );
  check(
    'редактор видимості меню має узгоджену 4-колонкову сітку (і 3 колонки на телефоні), а вкладені налаштування тем, меню, доступу й екрана входу адаптовано до 320 px',
    centrumCss.includes('grid-template-columns:40px minmax(0,1fr) 44px minmax(140px,190px)') &&
      centrumCss.includes('grid-template-columns:36px minmax(0,1fr) 44px') &&
      am3Instellingen.includes('minmax(min(100%, 210px), 1fr)') &&
      themaCss.includes('@media (max-width:560px)') &&
      menuCss.includes('.menu-dock-transparantie{flex-wrap:wrap}') &&
      toegangCss.includes('.toegang-wijziging-details{grid-template-columns:1fr}') &&
      aanmeldVnextCss.includes('@media (max-width: 420px)') &&
      aanmeldHerontwerpCss.includes('width:min(370px,calc(100vw - 32px))'),
  );

  const passkeysSectie = readFileSync('src/ToegangssleutelsSectie.tsx', 'utf8');
  const toegangscodes = readFileSync('src/Toegangscodes.tsx', 'utf8');
  const catalogus = readFileSync('src/aanmeld-vnext/onderdelen/AanbiederCatalogus.tsx', 'utf8');
  const apbLuisteraar = readFileSync('src/apparaat-bevestiging/Luisteraar.tsx', 'utf8');
  const apbInstellingen = readFileSync('src/apparaat-bevestiging/InstellingenSectie.tsx', 'utf8');
  const apbCss = readFileSync('src/apparaat-bevestiging/apparaat.css', 'utf8');
  const telegramSectie = readFileSync('src/telegram-aanmelden/TelegramSectie.tsx', 'utf8');
  const telegramCss = readFileSync('src/telegram-aanmelden/telegram.css', 'utf8');
  check(
    'ключі доступу, підтвердження з іншого пристрою та секція Telegram захищені від несподіваних відповідей мережі, дубльованих id і горизонтального розпирання на 320 px',
    passkeysSectie.includes('data?.passkeys?.length||0') &&
      passkeysSectie.includes("leesVergeten('/api/owner/access/passkeys/lijst')") &&
      sleutelkluis.includes("const houders=Array.isArray(o?.houders)?o.houders:[];") &&
      herstelcodes.includes('const codeRegels=Array.isArray(o?.codes)?o.codes:[];') &&
      toegangscodes.includes('if(Array.isArray(d.codes))setData(') &&
      catalogus.includes('Array.isArray(live?.sleutels)') &&
      telegramSectie.includes('!Array.isArray(r.koppelingen) || !r.code || !r.status') &&
      apbLuisteraar.includes('if (!r || !Array.isArray(r.verzoeken)) return;') &&
      apbInstellingen.includes('const titelId = useId();') &&
      apbInstellingen.includes('if (!r || !r.beheer || !r.voorkeuren || !r.teller) return;') &&
      apbCss.includes('max-width:min(100%,320px)') &&
      apbCss.includes('.apb-tabel thead{display:none}') &&
      telegramCss.includes('.tga-sectie-kop{display:flex;flex-wrap:wrap;') &&
      telegramCss.includes('.tga-identiteit{flex-wrap:wrap}'),
  );

  // 4. Дотримання мовного закону у змінених файлах категорії ідентичності (відсутність заборонених літер).
  const verboden = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const bestanden = [
    profielfoto,
    leesCache,
    toegangslaag,
    sleutelkluis,
    herstelcodes,
    passkeysSectie,
    toegangscodes,
    catalogus,
    sessies,
    aanmeldPanelen,
    am3Instellingen,
    pagina,
    accountCss,
    atelier,
    atelierCss,
    maquette,
    maquetteCss,
    apbLuisteraar,
    apbInstellingen,
    apbCss,
    telegramSectie,
    telegramCss,
  ];
  check(
    'жоден змінений файл розділу ідентичності не містить заборонених літер російської абетки',
    bestanden.every((inhoud) => !verboden.test(inhoud)),
  );

  return einde();
}
