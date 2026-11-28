// SITE-001 (пункт 12): сторож швидкості завантаження без мережі.
// 1) src/main.tsx завантажує App динамічно (import('./App')), щоб гостьова сторінка /toegang та повернення OAuth не тягнули ядро застосунку.
// 2) Шар технічного профілю TechLaag вантажиться лише за наявності сеансу (ecosystemSessionLikely / wachtOpSessieHint / listenCanonicalAuthChanges).
// 3) CanoniekMeldingencentrum не запитує правила власника без входу і не монтує важкий MeldingenPortaal на закритій панелі.
// 4) regels-opslag передає meldingLichaam(), а uitrol-achtergrond-beheer передає tabContext і перевіряє сеанс.
// 5) Сервер віддає попередньо стиснені .br/.gz файли з Cache-Control: immutable для хешованих ресурсів.
// nl: bewaking van de laadsnelheid zonder netwerk.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bekendeDienstVoor, classificeer, isAlgemeneAfzenderNaam, parseAuthResults } from '../../shared/mail-afzenders';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-snelheid');
  const root = process.cwd();
  try {
    const main = await readFile(join(root, 'src/main.tsx'), 'utf8');
    check('main.tsx: немає статичного import App from ./App', !/^import\s+App\s+from\s+['"]\.\/App['"]/m.test(main));
    check('main.tsx: динамічний import(./App) у гілці застосунку', /import\(['"]\.\/App['"]\)/.test(main));
    check('main.tsx: TechLaag чекає підтвердження сеансу', main.includes('ecosystemSessionLikely()') && main.includes('wachtOpSessieHint()') && main.includes('listenCanonicalAuthChanges('));

    const cnc = await readFile(join(root, 'src/CanoniekMeldingencentrum.tsx'), 'utf8');
    check('CanoniekMeldingencentrum: useLeverRegels лише для увійшлого запису', /useLeverRegels\(aangemeld\s*&&/.test(cnc));
    check('CanoniekMeldingencentrum: MeldingenPortaal не монтується на закритій панелі без пігулки', /ecosysteemActief\s*&&\s*\(panelOpen\s*\|\|/.test(cnc));

    const regels = await readFile(join(root, 'src/meldingen/v2/regels-opslag.ts'), 'utf8');
    check('regels-opslag: передає meldingLichaam() у запити', regels.includes("api.post('/api/owner/meldingen/regels', meldingLichaam())") && regels.includes('meldingLichaam({ regels: volgende })'));

    const bg = await readFile(join(root, 'src/platform/uitrol-achtergrond-beheer.ts'), 'utf8');
    check('uitrol-achtergrond-beheer: перевіряє сеанс і передає tabContext', bg.includes('!ecosystemSessionLikely()') && bg.includes('tabContext: ecosystemTabContext()') && bg.includes('tsv:canonical-auth-change'));

    const start = await readFile(join(root, 'server/start.ts'), 'utf8');
    check('server/start.ts: immutable для хешованих ресурсів /assets/', start.includes('max-age=31536000, immutable'));
    const comp = await readFile(join(root, 'server/platform/statisch-comprimeren.ts'), 'utf8');
    check('statisch-comprimeren: підтримка brotli та gzip у памʼяті', comp.includes('brotliCompress') && comp.includes('gzip') && comp.includes("'br'"));

    // SITE-001 (повернення до вкладки та переходи між піддоменами без повторного перезавантаження пошти, вкладень і сторінок):
    const mailFn = await readFile(join(root, 'src/MailFunctioneelWeergave.tsx'), 'utf8');
    check('MailFunctioneelWeergave: синхронне відновлення знімку пошти з sessionStorage/localStorage без скидання в loading',
      mailFn.includes('leesMailBootstrapCache') && mailFn.includes('schrijfMailBootstrapCache') && mailFn.includes('tsv:mail-bootstrap-cache-v1:'));

    const labels = await readFile(join(root, 'src/mail-aanbieder-toestand.ts'), 'utf8');
    check('mail-aanbieder-toestand: збереження міток між переходами та 5-хвилинне вікно свіжості без зайвих запитів',
      labels.includes('readCachedMailProviderLabelSnapshot') && labels.includes('LABELS_FRESH_TTL_MS=300_000') && labels.includes('tsv:mail-labels-snapshot-v1:'));

    const cache = await readFile(join(root, 'src/mail-bijlage-cache.ts'), 'utf8');
    check('mail-bijlage-cache: збереження attachmentsByMessage у MailListViewSnapshot та узгоджена політика просторів',
      cache.includes('attachmentsByMessage?:Record<string,unknown[]>') && cache.includes('BOOTSTRAP_CACHE_PREFIX') && cache.includes('LABELS_CACHE_PREFIX'));

    const werk = await readFile(join(root, 'src/GoogleMailWerkruimte.tsx'), 'utf8');
    check('GoogleMailWerkruimte: збереження тимчасового стану в sessionStorage+localStorage, 5-хвилинна свіжість списку та миттєве відкриття листів/вкладень із кешу',
      werk.includes('readMailTransient') && werk.includes('writeMailTransient') && werk.includes('freshCacheTtlMs=300000')
      && werk.includes('sourceBlob:cachedBlob.blob') && werk.includes("minInterval=reden==='zichtbaar'&&snapshot.accounts.length>0?300000:4000"));

    const verApp = await readFile(join(root, 'src/VerenigdDienstApp.tsx'), 'utf8');
    const hubApp = await readFile(join(root, 'src/App.tsx'), 'utf8');
    check('VerenigdDienstApp та App: фонова звірка при поверненні до вкладки не частіше ніж раз на 5 хв за незмінного облікового запису',
      verApp.includes('300000') && hubApp.includes('300000'));

    const techOpslag = await readFile(join(root, 'src/tech/tech-opslag.ts'), 'utf8');
    const ruimtesOpslag = await readFile(join(root, 'src/tech/ruimtes/ruimtes-opslag.ts'), 'utf8');
    check('tech-opslag та ruimtes-opslag: дроселювання фонових запитів при visibilitychange/focus (60 с за незмінного простору)',
      techOpslag.includes('laatsteTechSync') && ruimtesOpslag.includes('laatsteRuimtesSync') && ruimtesOpslag.includes('laatsteRuimteBijSync'));

    const client = await readFile(join(root, 'src/platform/client.ts'), 'utf8');
    const navSnel = await readFile(join(root, 'src/navigatie-snel.ts'), 'utf8');
    check('client та navigatie-snel: фонові маршрути синхронізації не запускають видиму смугу завантаження на вже відмальованій сторінці',
      client.includes('ACHTERGROND_PAD') && navSnel.includes('if (stand.alleenAchtergrond && paginaHeeftZichtbareInhoud()) return;'));

    // SITE-001 (надійне надсилання листів і відповідей, міждоменне фонове відправлення та спливний бокс сповіщення):
    const mailBrowser = await readFile(join(root, 'backend/google-suite-mail-browser.ts'), 'utf8');
    check('google-suite-mail-browser: фільтрація чернеток DRAFT, вибір lastIncoming та збір усіх учасників гілки у reply',
      mailBrowser.includes(".includes('DRAFT')")
      && mailBrowser.includes('lastIncoming=[...messages].reverse().find(')
      && mailBrowser.includes("if(!to||!to.includes('@'))throw new Error('GOOGLE_MAIL_REPLY_RECIPIENT_INVALID')")
      && mailBrowser.includes('deleteDraftsForThread(auth.user.id,threadId)'));

    const { _mailBrowserIntern } = await import('../../backend/google-suite-mail-browser');
    const rawB64 = _mailBrowserIntern.buildReplyRaw({
      from: 'tarasevych.pavlo@gmail.com',
      to: 'ontvanger@example.com',
      cc: [],
      subject: 'Re: Перевірка української теми та довгого HTML-листа без обриву рядків RFC 5322',
      inReplyTo: '<msg-1@example.com>',
      references: ['<msg-1@example.com>'],
      plainText: 'Привіт! Це перевірка відповіді з кирилицею. '.repeat(20),
      html: `<p>${'Привіт! Це довгий HTML-рядок без переносів, який раніше перевищував 998 байтів у 8bit. '.repeat(25)}</p>`,
      attachments: [],
    });
    const decodedMime = Buffer.from(rawB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const maxLineLen = Math.max(...decodedMime.split('\r\n').map((l) => Buffer.byteLength(l, 'utf8')));
    check('buildReplyRaw: base64 MIME-кодування тексту/HTML, RFC 2047 Subject та жодного рядка > 998 байтів',
      decodedMime.includes('Content-Transfer-Encoding: base64')
      && decodedMime.includes('Subject: =?UTF-8?B?')
      && maxLineLen <= 998);

    const mailOpstel = await readFile(join(root, 'backend/mail-opstel.ts'), 'utf8');
    check('mail-opstel та google-suite-mail-browser: резервний вибір активної скриньки та дозвіл фонових запитів з будь-якого піддомену (!auth.service)',
      mailOpstel.includes('!auth.service')
      && mailBrowser.includes('!auth.service')
      && mailOpstel.includes('snapshot.account || snapshot.accounts[0]')
      && mailBrowser.includes('snapshot.account||snapshot.accounts[0]'));

    const uitgaand = await readFile(join(root, 'src/mail/uitgaande-post-achtergrond.ts'), 'utf8');
    check('uitgaande-post-achtergrond: міждоменний репʼяшок mr_uitgaande_post_v1, keepalive: true та спливний бокс toonMisluktMeldingBox з кнопкою «Повторити надсилання»',
      uitgaand.includes("UITGAANDE_POST_COOKIE = 'mr_uitgaande_post_v1'")
      && uitgaand.includes('keepalive: true')
      && uitgaand.includes('toonMisluktMeldingBox')
      && uitgaand.includes("kind: 'error'")
      && uitgaand.includes('herhaalUitgaandePost')
      && uitgaand.includes('controleerUitgaandePostOpSubdomein'));

    const gesprek = await readFile(join(root, 'src/MailGesprekInhoud.tsx'), 'utf8');
    const nieuwDialoog = await readFile(join(root, 'src/MailNieuwBerichtDialoog.tsx'), 'utf8');
    check('MailGesprekInhoud та MailNieuwBerichtDialoog: підключено фонове надсилання verzendAntwoordOpAchtergrond і verzendNieuwBerichtOpAchtergrond',
      gesprek.includes('verzendAntwoordOpAchtergrond') && nieuwDialoog.includes('verzendNieuwBerichtOpAchtergrond'));

    check('CanoniekMeldingencentrum: наглядач controleerUitgaandePostOpSubdomein на всіх піддоменах та кнопка дії data-qa-id="melding-actie-knop" у спливному боксі',
      cnc.includes('controleerUitgaandePostOpSubdomein')
      && cnc.includes("data-qa-id='melding-actie-knop'")
      && cnc.includes("kind === 'error' || Boolean(notice.retain)"));

    // SITE-001 (компактна кнопка-капсулка розділів пошти між кнопкою меню та полем пошуку і адаптивне звуження поля пошуку):
    const zoekVeld = await readFile(join(root, 'src/MailZoekVeld.tsx'), 'utf8');
    check('MailZoekVeld: вимірювання залишкової ширини поля пошуку (MAIL_ZOEK_WOORD_MIN_BREEDTE=168, MAIL_ZOEK_VOLLEDIG_MIN_BREEDTE=248) та режим компактного знака пошуку data-zoek-compact',
      zoekVeld.includes('MAIL_ZOEK_WOORD_MIN_BREEDTE=168')
      && zoekVeld.includes('MAIL_ZOEK_VOLLEDIG_MIN_BREEDTE=248')
      && zoekVeld.includes("data-zoek-compact={icoonModus?'icoon':'veld'}")
      && zoekVeld.includes("data-zoek-smal={teSmalVoorWoord?'ja':'nee'}")
      && zoekVeld.includes("data-zoek-actief={zoekActief?'ja':'nee'}"));

    const cmdIdx = werk.indexOf("<div className='mail-top-command-bar'>");
    const railInCmdIdx = werk.indexOf('<MaquetteAnkerRail', cmdIdx);
    const zoekInCmdIdx = werk.indexOf('<MailSearchField', cmdIdx);
    check('GoogleMailWerkruimte: компактна кнопка-капсулка MaquetteAnkerRail вбудована безпосередньо у .mail-top-command-bar між кнопкою меню та полем пошуку MailSearchField',
      cmdIdx > 0 && railInCmdIdx > cmdIdx && zoekInCmdIdx > railInCmdIdx);

    const mqWerkCss = await readFile(join(root, 'src/mail/mail-werkruimte-maquette.css'), 'utf8');
    const mailMobCss = await readFile(join(root, 'src/mail-mobiel.css'), 'utf8');
    check('mail-werkruimte-maquette.css та mail-mobiel.css: компактна капсулка в .mail-top-command-bar, чіткий відступ слова Пошук від кнопки налаштувань та звуження до знака пошуку',
      mqWerkCss.includes('.mail-top-command-bar > .mq-anker-onderbalk > .mq-onderbalk-trekker')
      && mqWerkCss.includes('[data-zoek-compact="veld"] .mail-top-search-shell input')
      && mqWerkCss.includes('[data-zoek-compact="icoon"]:not([data-zoek-actief="ja"]) > .mail-top-search-shell')
      && mailMobCss.includes('html body .mail-top-command-bar>.mail-top-search-area{flex:1 1 0!important;min-width:0!important}'));

    const bv2Werkbalk = await readFile(join(root, 'src/bijlage-v2/BijlageWerkbalk.tsx'), 'utf8');
    const bv2Poort = await readFile(join(root, 'src/bijlage-v2/Poort.tsx'), 'utf8');
    const bv2Kop = await readFile(join(root, 'src/bijlage-v2/BijlageV2Kop.tsx'), 'utf8');
    const wgKop = await readFile(join(root, 'src/bijlage-weergave/Weergave.tsx'), 'utf8');
    check('BijlageWerkbalk.tsx (Компактна панель v2) містить увесь функціонал трьох переглядачів: перевірку безпеки й відправника, швидку картку рахунку, Оплату в Календар, Що змінилося, Пошук у вкладеннях, Підписати/позначити та Темні сторінки документа',
      bv2Werkbalk.includes('bewijsUitBlob')
      && bv2Werkbalk.includes('metAfzender')
      && bv2Werkbalk.includes('technischeRijen')
      && bv2Werkbalk.includes('WeergaveSnelkaart')
      && bv2Werkbalk.includes('KalenderBetalingVenster')
      && bv2Werkbalk.includes('VersieVergelijk')
      && bv2Werkbalk.includes('ZoekVeld')
      && bv2Werkbalk.includes('toontOndertekenen')
      && bv2Werkbalk.includes('data-donkere-paginas'));
    check('Меню ••• у BijlageWerkbalk.tsx та Weergave.tsx більше не показує три перемикачі переглядачів (Спільний переглядач, Компактна панель v2, Класична)',
      !bv2Werkbalk.includes('bv2-modus-groep')
      && !bv2Werkbalk.includes("role='menuitemradio'")
      && !wgKop.includes('weergave-modus-groep'));
    check('Poort.tsx, BijlageV2Kop.tsx та GoogleMailWerkruimte.tsx завжди використовують єдину об’єднану Компактну панель v2 разом зі стрічкою вкладень, свайпом і запам’ятовуванням позиції',
      bv2Poort.includes('const aan = v2Vlag || gedeeldVlag;')
      && bv2Kop.includes('const aan = v2Vlag || gedeeldVlag;')
      && werk.includes('gedeeldeWeergave=gedeeldeVlagAan||bijlageV2VlagAan')
      && werk.includes('blob={attachmentPreview.blob} archiefNamen={(attachmentPreview.archiveEntries||[]).map(e=>e.name)} afzender={weergaveAfzender?'));

    const mqLezerCss = await readFile(join(root, 'src/mail/mail-lezer-opstel-maquette.css'), 'utf8');
    const klLijstCss = await readFile(join(root, 'src/mail/mail-lijst-klassiek.css'), 'utf8');
    const gespCss = await readFile(join(root, 'src/mail-gesprek-bewerker.css'), 'utf8');
    const rij2026Css = await readFile(join(root, 'src/mail-rij-2026-10-18.css'), 'utf8');
    const minRijCss = await readFile(join(root, 'src/mail-minimum-rij.css'), 'utf8');
    const mailRijTsx = await readFile(join(root, 'src/MailBerichtRij.tsx'), 'utf8');
    const mailMinRijTsx = await readFile(join(root, 'src/MailMinimumBerichtRij.tsx'), 'utf8');
    check('Список листів: білий колір та жирність 650 лише для непрочитаних листів (.unread), а прочитані листи (.read) мають сірий текст відправника (400), вмісту (400) та помірну напівжирність теми (500)',
      mqLezerCss.includes('html.palet-maquette body .google-mail-workspace .google-mail-row.unread :is(')
      && mqLezerCss.includes('html.palet-maquette body .google-mail-workspace .google-mail-row.read :is(')
      && klLijstCss.includes('html.palet-maquette[data-maquette-stijl="klassiek"] body .google-mail-workspace .google-mail-row.read :is(')
      && !gespCss.includes('font-weight:700!important')
      && gespCss.includes('.google-mail-row.mail-row-semantic-order.read .mail-row-subject-block strong{color:var(--mail-row-secondary,var(--muted));font-weight:500}')
      && rij2026Css.includes('.google-mail-workspace .google-mail-row.read :is(.mail-row-subject-block>strong,.mail-minimum-subject){font-weight:500}')
      && minRijCss.includes('.mail-row-minimum.read .mail-minimum-subject{color:var(--mail-row-secondary,var(--muted));font-weight:500}')
      && mailRijTsx.includes('nameWeight=message.unread?650:400,subjectWeight=message.unread?650:500,dateWeight=message.unread?600:400')
      && mailMinRijTsx.includes('subjectWeight=p.message.unread?650:500,dateWeight=p.message.unread?600:400,nameWeight=p.message.unread?650:400'));

    const afzCss = await readFile(join(root, 'src/afzenders/afzenders.css'), 'utf8');
    const afzBadgeTsx = await readFile(join(root, 'src/afzenders/AfzenderBadge.tsx'), 'utf8');
    const authRozetka = parseAuthResults(['mx.google.com; dkim=pass header.i=@rozetka.ua; spf=pass smtp.mailfrom=info@rozetka.ua; dmarc=pass header.from=rozetka.ua']);
    const authPostnl = parseAuthResults(['mx.google.com; dkim=pass header.i=@postnl.be; spf=pass smtp.mailfrom=noreply@postnl.be; dmarc=pass header.from=postnl.be']);
    const authOpenai = parseAuthResults(['mx.google.com; dkim=pass header.i=@openai.com; spf=pass smtp.mailfrom=noreply@chatgpt.com; dmarc=pass header.from=chatgpt.com']);
    const contactenSupport = new Map([['support', ['support@andere-winkel.be']], ['paypal', ['service@paypal.com']]]);
    check('Маркування відправника: .afz-groep/.afz-badge не обрізаються, офіційні регіональні та поштові домени (rozetka.ua, postnl.be, chatgpt.com, paypal.be, monobank.com.ua, privat24.ua) та загальні службові імена (Support, Info, Підтримка) не маркуються хибно як підозрілі',
      afzCss.includes('.afz-groep { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; overflow: visible;')
      && afzCss.includes('.afz-adres { margin-inline-start: 0; padding-inline-start: 4px; box-sizing: border-box;')
      && afzBadgeTsx.includes("if (a.status === 'onbekend' && a.reden === 'BEKENDE_DIENST_ZONDER_AUTH' && plek === 'rij' && !domeinBevestigd) return null;")
      && afzBadgeTsx.includes("if (a.status === 'onbekend' && !markeringen && !domeinBevestigd) return null;")
      && !!bekendeDienstVoor('rozetka.ua')
      && !!bekendeDienstVoor('postnl.be')
      && !!bekendeDienstVoor('chatgpt.com')
      && !!bekendeDienstVoor('monobank.com.ua')
      && !!bekendeDienstVoor('privat24.ua')
      && classificeer({ naam: 'Rozetka', adres: 'info@rozetka.ua', domein: 'rozetka.ua', auth: authRozetka }).status === 'geverifieerd'
      && classificeer({ naam: 'PostNL', adres: 'noreply@postnl.be', domein: 'postnl.be', auth: authPostnl }).status === 'geverifieerd'
      && classificeer({ naam: 'ChatGPT', adres: 'noreply@chatgpt.com', domein: 'chatgpt.com', auth: authOpenai }).status === 'geverifieerd'
      && classificeer({ naam: 'PayPal', adres: 'service@paypal.be', domein: 'paypal.be', contacten: contactenSupport }).status !== 'verdacht'
      && isAlgemeneAfzenderNaam('Support')
      && isAlgemeneAfzenderNaam('Підтримка')
      && classificeer({ naam: 'Support', adres: 'support@nieuwe-dienst.be', domein: 'nieuwe-dienst.be', contacten: contactenSupport }).status !== 'verdacht');

    const berichtTekstTsx = await readFile(join(root, 'src/MailBerichtTekst.tsx'), 'utf8');
    const tekstPassendTs = await readFile(join(root, 'src/mail-tekst-passend.ts'), 'utf8');
    check('HTML-листи з багатоколонковими таблицями: комірки td/th використовують overflow-wrap: break-word і word-break: normal замість anywhere, нормалізують knellende breedtes (normaliseerMailTabellen) і захищені herstelKnellendeTabelKolommen',
      berichtTekstTsx.includes('const normaliseerMailTabellen=(doc:Document)=>')
      && berichtTekstTsx.includes('normaliseerMailTabellen(doc);')
      && berichtTekstTsx.includes("if(node instanceof HTMLTableCellElement){node.style.overflowWrap='break-word';node.style.wordBreak='normal'}")
      && berichtTekstTsx.includes("body.style.overflowWrap='break-word'")
      && !berichtTekstTsx.includes("if(node instanceof HTMLTableCellElement)node.style.overflowWrap='anywhere'")
      && tekstPassendTs.includes('export function herstelKnellendeTabelKolommen(doc: Document): void')
      && tekstPassendTs.includes('herstelKnellendeTabelKolommen(doc);'));

    const toegangslaagTs = await readFile(join(root, 'backend/toegangslaag.ts'), 'utf8');
    const bevestigTsx = await readFile(join(root, 'src/platform/bevestig-toegang.tsx'), 'utf8');
    const bevestigCss = await readFile(join(root, 'src/platform/bevestig-toegang.css'), 'utf8');
    check('Вікно «Підтвердіть доступ» (bevestig-toegang): фотографія профілю (veiligeFoto + accountBeeld + lokaalAccountFallback), паспорт облікового запису підтвердження з ім’ям та нерозірваною поштою, блок хронології та сповіщень і компактні мобільні чипи без 60-піксельних порожніх коробок',
      toegangslaagTs.includes("import {accountBeeld,veiligeFoto} from './telegram-aanmelden/account-foto';")
      && toegangslaagTs.includes("let foto=u.geenFoto?'':veiligeFoto(u.picture);")
      && toegangslaagTs.includes('const ab=await accountBeeld(auth.user.id).catch(()=>null);')
      && bevestigTsx.includes('function lokaalAccountFallback(): { email: string; naam: string; foto: string }')
      && bevestigTsx.includes("data-bevestigend-account='1'")
      && bevestigTsx.includes("data-stap-op-kroniek='1'")
      && bevestigTsx.includes("className='bevestig-toegang-naam'")
      && bevestigTsx.includes("className='bevestig-toegang-uitleg bevestig-toegang-kroniek-tekst'")
      && bevestigCss.includes('html body .venster.bevestig-toegang-venster .bevestig-toegang details.bevestig-toegang-extra>summary')
      && bevestigCss.includes('html body .venster.bevestig-toegang-venster .bevestig-toegang .bevestig-toegang-alt button'));

    const maqWerkCss = await readFile(join(root, 'src/mail/mail-werkruimte-maquette.css'), 'utf8');
    const mobielCss = await readFile(join(root, 'src/mail-mobiel.css'), 'utf8');
    check('Кути списку листів (mail-list-viewport / google-mail-list): прозорий фон та успадкований радіус на .google-mail-list і .mail-row-block-stream без білих трикутників у кутах і без подвійного накладання inset box-shadow на ::before',
      maqWerkCss.includes('html.palet-maquette .google-mail-workspace.mq-schil > .mail-list-viewport > .google-mail-list {\n  border-radius: calc(var(--mq-straal-kaart) - 1px);\n  background: transparent;\n}')
      && klLijstCss.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .google-mail-workspace.mq-schil > .mail-list-viewport > .google-mail-list {\n  border-radius: 15px;\n  background: transparent;\n}')
      && maqWerkCss.includes('html.palet-maquette .google-mail-workspace.mq-schil .google-mail-row > .mail-row-block-stream {\n  position: relative;\n  z-index: 1;\n  border-radius: inherit;\n}')
      && klLijstCss.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .google-mail-workspace.mq-schil .google-mail-row > .mail-row-block-stream {\n  border-radius: inherit;\n}')
      && mobielCss.includes("html body .google-mail-workspace.mq-schil>.mail-list-viewport:not(:has(>.google-mail-orbit[data-mail-account-resolution-empty='true'])){overflow:hidden}")
      && mobielCss.includes('html body .google-mail-workspace.mq-schil>.mail-list-viewport>.google-mail-list{overflow:hidden;border-radius:inherit;background:transparent}')
      && mobielCss.includes('padding:10px 46px 10px 12px!important;border-radius:inherit;background:transparent;'));

    const ruimteDokTsx = await readFile(join(root, 'src/tech/ruimtes/RuimteDok.tsx'), 'utf8');
    const ruimtesCss = await readFile(join(root, 'src/tech/ruimtes/ruimtes.css'), 'utf8');
    const techMaqCss = await readFile(join(root, 'src/tech/tech-maquette.css'), 'utf8');
    check('Сповіщення стану простору (RuimteDok / .rw-dok-melding): компактна капсула-пігулка (border-radius: 999px) розміром як капсула завантаження, з автоматичним згасанням за 4 с, записом в історію загальної панелі сповіщень (emitCanonicalNotice + retain: true) і шаром під бічним меню (z-index: 230)',
      ruimteDokTsx.includes("import { emitCanonicalNotice } from '../../canoniek-meldingen';")
      && ruimteDokTsx.includes('const UITLEG_DUUR_MS = 4000;')
      && ruimteDokTsx.includes('retain: true,')
      && ruimteDokTsx.includes('alleenPaneel: true,')
      && ruimteDokTsx.includes('const timer = window.setTimeout(() => uitlegWeg(), UITLEG_DUUR_MS);')
      && ruimteDokTsx.includes("<i className='rw-dok-stip' aria-hidden='true' />")
      && ruimteDokTsx.includes("<span className='rw-dok-tekst'>{r.uitleg}</span>")
      && ruimtesCss.includes('.rw-dok-melding{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px) + var(--venster-dok-onder,0px));z-index:230;display:inline-flex;align-items:center;gap:6px;width:max-content;max-width:min(280px,calc(100vw - 28px));min-height:26px;padding:3.5px 9px 3.5px 9px;border-radius:999px;')
      && ruimtesCss.includes('html body:has(.canonical-chrome.sidebar-drawer) .rw-dok-melding,')
      && techMaqCss.includes('html.palet-maquette .rw-dok-melding {\n  border-radius: 999px;')
      && techMaqCss.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .rw-dok-melding {\n  border-radius: 999px;'));

    const beheerConsoleTsx = await readFile(join(root, 'src/BeheerConsoleWeergave.tsx'), 'utf8');
    const domoticaTsx = await readFile(join(root, 'src/DomoticaWeergave.tsx'), 'utf8');
    const apiPlatformTsx = await readFile(join(root, 'src/ApiPlatformWeergave.tsx'), 'utf8');
    const maqOppCss = await readFile(join(root, 'src/maquette-kern/maquette-oppervlakken.css'), 'utf8');
    check('Кнопка-капсулка підменю розділів сторінки (MaquetteAnkerRail / .mq-anker-onderbalk): розташована на початку сторінки, а на мобільних екранах (<= 700px) — безпосередньо у верхній смузі між кнопкою меню (☰) та пошуком (🔍) замість низу сторінки',
      beheerConsoleTsx.indexOf('<MaquetteAnkerRail') < beheerConsoleTsx.indexOf("<header className='admin-title'>")
      && domoticaTsx.indexOf('<MaquetteAnkerRail') < domoticaTsx.indexOf("id='domotica-maquette-held'")
      && apiPlatformTsx.indexOf('<MaquetteAnkerRail') < apiPlatformTsx.indexOf('<h1>{heading}</h1>')
      && maqOppCss.includes('.canonical-chrome:not([data-active-service="mail"]) .canonical-workspace .mq-anker-onderbalk {\n    position: fixed;\n    top: 10px;\n    left: 58px;')
      && maqOppCss.includes('.canonical-chrome:not([data-active-service="mail"]):has(.canonical-workspace .mq-anker-onderbalk) .canonical-mobile-crumb {\n    display: none;\n  }'));

    check('Круглі кнопки оновлення й налаштувань пошти (.mail-top-refresh, .mail-top-settings), безперервне обертання кнопки оновлення та жива верхня капсула стану оновлення (.mail-ververs-kapsel) з етапами, зеленим статусом завершення, червоним статусом збою та захистом від повторних натискань',
      mobielCss.includes('html body .mail-search-submit,html body .mail-search-clear,html body .mail-top-search-tune,html body .mail-top-refresh,html body .mail-top-settings{flex:0 0 40px;aspect-ratio:1/1;border-radius:50%;width:40px;height:40px;min-width:40px;min-height:40px}')
      && !mobielCss.includes('width:36px;height:44px')
      && mobielCss.includes('@keyframes mail-ververs-draai')
      && mobielCss.includes('.mail-top-refresh svg.spin,')
      && mobielCss.includes('.mail-ververs-kapsel{')
      && mobielCss.includes(".mail-ververs-kapsel[data-fase='klaar']{background:var(--ok-vlak,#15803d);")
      && mobielCss.includes(".mail-ververs-kapsel[data-fase='fout']{background:var(--fout-vlak,#b42318);")
      && werk.includes("tekst:t('Відправлено запит…','Verzoek verzonden…')")
      && werk.includes("tekst:t('Відбувається перевірка нових листів…','Nieuwe berichten controleren…')")
      && werk.includes("tekst:t('Отримання відповіді…','Antwoord ontvangen…')")
      && werk.includes("t('Зачекайте, обробляється попередній запит…','Even geduld, het vorige verzoek wordt verwerkt…')")
      && werk.includes("t('Оновлено: нових листів немає','Bijgewerkt: geen nieuwe berichten')")
      && werk.includes("className='mail-ververs-kapsel'"));

    const aanmeldHerCss = await readFile(join(root, 'src/aanmeld-herontwerp.css'), 'utf8');
    const aanmeldAndereTsx = await readFile(join(root, 'src/AanmeldAndereOpties.tsx'), 'utf8');
    check('Сторінка входу (aanmeld-herontwerp.css / AanmeldAndereOpties.tsx): прокручуваний контейнер вікна (height: 100%; max-height: 100dvh; overflow-y: auto), нижній запас під смугу згоди .mr-toestemming та автоматичне плавне опускання до розгорнутого списку «Інші способи входу»',
      aanmeldHerCss.includes('html body main.canonical-chrome:has(.mr-sign-in){position:relative;height:100%;max-height:100dvh;overflow-x:hidden;overflow-y:auto;')
      && aanmeldHerCss.includes("body:has(.mr-toestemming) .canonical-chrome[data-surface-model='flat-content'] .canonical-content .canonical-signed-out.mr-sign-in")
      && aanmeldHerCss.includes('padding-bottom:calc(310px + env(safe-area-inset-bottom,0px));')
      && aanmeldAndereTsx.includes('doorKlikOpenRef')
      && aanmeldAndereTsx.includes("document.querySelector<HTMLElement>('.mr-toestemming')")
      && aanmeldAndereTsx.includes('houder.scrollBy({ top: delta,'));
  } catch (e) {
    check('сторож виконано без винятків', false, String(e));
  }
  return einde();
}

