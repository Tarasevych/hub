// Комплексне модульне випробування ядра єдиної екосистеми сповіщень («застосунок у застосунку», GEMINI-002).
// Перевіряє чисту логіку моделей, нормалізації, інтерпретатора, геометрії вікна, змахів,
// класифікатора вкладень, очищення секретів ШІ, клієнтського сховища та зведення 5 джерел потоку (без БД).

import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';
import {
  AI_AANBIEDERS_KEUZE,
  AI_MODI,
  GEBEURTENIS_STATUSSEN,
  KANALEN,
  MIN_VENSTER_BREEDTE,
  MIN_VENSTER_HOOGTE,
  PRIORITEITEN,
  SUBDOMEINEN,
  VEEG_ACTIES,
  VENSTER_MODI,
  berekenPrioriteit,
  bouwAiPromptVoorGebeurtenis,
  bouwStandaardActies,
  classificeerBijlage,
  contextVoorSubdomein,
  evalueerVeeg,
  extensieVanBestand,
  formaatGrootte,
  herkenKanaal,
  herkenSubdomein,
  interneAiAnalyse,
  interpreteerGebeurtenis,
  isStilInEcosysteem,
  kanaalLabel,
  klemVenster,
  maatVanModus,
  normaliseerActies,
  normaliseerBijlagen,
  normaliseerGebeurtenis,
  normaliseerProfiel,
  pasVensterMaatAan,
  prioriteitLabel,
  standaardProfiel,
  zonderGeheimen,
  type MeldingEcosysteemGebeurtenis,
  type RandRichting,
  type SchermAfmeting,
} from '../../shared/meldingen-ecosysteem';
import type { CanonicalServerNotification, PaginaSignaal } from '../../src/canoniek-meldingen';
import type { ActivityEvent } from '../../src/connector-activiteit';
import type { BewaardeRij } from '../../src/meldingen/lokale-rijen';

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-ecosysteem-kern');

  // 1. Модель і нормалізація профілів, вкладень, дій та подій
  const priveStd = standaardProfiel('prive');
  const techStd = standaardProfiel('technisch');
  check(
    '1a стандартні профілі зберігають ізольований простір і базову геометрію',
    priveStd.ruimte === 'prive' &&
      techStd.ruimte === 'technisch' &&
      priveStd.geometrie.breedte === 460 &&
      priveStd.geometrie.hoogte === 600 &&
      priveStd.ai.alleenLokaalVoorBeveiliging === true &&
      SUBDOMEINEN.length === 11 &&
      KANALEN.length === 12 &&
      PRIORITEITEN.length === 4 &&
      GEBEURTENIS_STATUSSEN.length === 5 &&
      VENSTER_MODI.length === 4 &&
      VEEG_ACTIES.length === 5 &&
      AI_MODI.length === 4 &&
      AI_AANBIEDERS_KEUZE.length === 5,
  );

  const genorm = normaliseerProfiel(
    {
      ruimte: 'technisch',
      geometrie: { x: -50, y: 9999, breedte: 80, hoogte: 3000, modus: 'ongeldig', vastgepind: 1, minimalePil: true },
      veeg: { actief: true, drempelPx: 12, links: 'archief', rechts: 'uitstellen', trilling: false },
      toastSeconden: 99,
      bewaarDagen: 0,
      stilleUren: { actief: true, van: '99:99', tot: '06:45', kritiekStilOmzeilen: false },
      bijlageWeergave: { maxVoorbeeldMb: 400, hexFallback: false },
      ai: { modus: 'intern', aanbieder: 'claude', autoSamenvatting: true, alleenLokaalVoorBeveiliging: false },
      kanalen: { beveiliging: { actief: false, popUp: true, geluid: false, drempelPrioriteit: 'kritiek' } },
    },
    'prive',
  );
  check(
    '1b normaliseerProfiel затискає межі, перевіряє HH:MM і не дозволяє вимкнути канал безпеки',
    genorm.ruimte === 'prive' &&
      genorm.geometrie.x === 0 &&
      genorm.geometrie.y === 4000 &&
      genorm.geometrie.breedte === 310 &&
      genorm.geometrie.hoogte === 1400 &&
      genorm.geometrie.modus === 'normaal' &&
      genorm.geometrie.vastgepind === true &&
      genorm.geometrie.minimalePil === true &&
      genorm.veeg.drempelPx === 48 &&
      genorm.veeg.trilling === false &&
      genorm.toastSeconden === 30 &&
      genorm.bewaarDagen === 1 &&
      genorm.stilleUren.van === '23:00' &&
      genorm.stilleUren.tot === '06:45' &&
      genorm.stilleUren.kritiekStilOmzeilen === false &&
      genorm.bijlageWeergave.maxVoorbeeldMb === 100 &&
      genorm.bijlageWeergave.hexFallback === false &&
      genorm.ai.modus === 'intern' &&
      genorm.ai.aanbieder === 'claude' &&
      genorm.ai.alleenLokaalVoorBeveiliging === false &&
      genorm.kanalen.beveiliging.actief === true,
  );

  const bijlagenNorm = normaliseerBijlagen([
    { naam: ' ', mime: 'text/plain' },
    { id: 'b1', naam: 'document.pdf', mime: 'application/pdf', grootteBytes: -10, bronDienst: 'cloud', tekstVoorbeeld: 'вміст' },
    { naam: 'overschot.bin', grootteBytes: 900_000_000 },
  ]);
  const actiesNorm = normaliseerActies([
    { id: '', labelUk: 'Порожній' },
    { id: 'a1', labelUk: 'Перевірити', labelNl: 'Controleren', soort: 'navigeer', href: 'https://hub.tarasevych.com', uitstelMinuten: 45, bevestigingNodig: true },
  ]);
  const gebNorm = normaliseerGebeurtenis({
    id: 'geb-snake',
    ruimte: 'technisch',
    externe_sleutel: 'ext:snake',
    context_label: 'Сервер БД',
    uitgesteld_tot: '2026-11-15T12:00:00Z',
    aangemaakt_op: '2026-11-15T10:00:00Z',
    bijgewerkt_op: '2026-11-15T11:00:00Z',
    herhalingen: 4,
    ai_samenvatting: {
      bron: 'intern',
      samenvatting: 'Стисло',
      oorzaak: 'Перевірка',
      advies: 'Готово',
      aanbevolenActies: ['Крок 1'],
      risico: 'hoog',
      opgesteldOp: 1_763_200_000_000,
    },
  });
  check(
    '1c normaliseerBijlagen, normaliseerActies і normaliseerGebeurtenis коректно читають БД-поля',
    bijlagenNorm.length === 2 &&
      bijlagenNorm[0].grootteBytes === 0 &&
      bijlagenNorm[0].bronDienst === 'cloud' &&
      bijlagenNorm[1].grootteBytes === 500_000_000 &&
      actiesNorm.length === 1 &&
      actiesNorm[0].bevestigingNodig === true &&
      gebNorm.ruimte === 'technisch' &&
      gebNorm.externeSleutel === 'ext:snake' &&
      gebNorm.contextLabel === 'Сервер БД' &&
      gebNorm.herhalingen === 4 &&
      gebNorm.uitgesteldTot !== null &&
      gebNorm.aiSamenvatting?.aanbevolenActies[0] === 'Крок 1',
  );

  // 2. Інтерпретатор подій (tolk.ts)
  check(
    '2a herkenSubdomein розпізнає піддомен як за URL, так і за ключовими словами',
    herkenSubdomein('', 'https://mail.tarasevych.com/postvak-in') === 'mail' &&
      herkenSubdomein('', 'https://huis.tarasevych.com/kamers') === 'huis' &&
      herkenSubdomein('imap-sync') === 'mail' &&
      herkenSubdomein('passkey-verify') === 'id' &&
      herkenSubdomein('github workflow') === 'github' &&
      herkenSubdomein('pc-terminal-host') === 'mcp' &&
      herkenSubdomein('gemini-vertaling') === 'ai' &&
      herkenSubdomein('невідоме', '', 'cloud') === 'cloud',
  );

  check(
    '2b herkenKanaal і berekenPrioriteit правильно класифікують канали та важливість подій',
    herkenKanaal('passkey', 'sleutel_dicht', 'id') === 'beveiliging' &&
      herkenKanaal('pc-agent', 'cpu', 'mcp') === 'pc_agent' &&
      herkenKanaal('chrome-extensie', 'debugger', 'mcp') === 'extensie' &&
      herkenKanaal('verbinding-band', 'offline', 'systeem') === 'pagina' &&
      herkenKanaal('service', 'info', 'mail') === 'mail' &&
      herkenKanaal('service', 'info', 'cloud') === 'cloud' &&
      herkenKanaal('service', 'info', 'huis') === 'huis' &&
      berekenPrioriteit('sleutel_dicht', 'kritiek', 'beveiliging') === 'kritiek' &&
      berekenPrioriteit('warning', 'verouderd', 'extensie') === 'hoog' &&
      berekenPrioriteit('login', '', 'beveiliging') === 'hoog' &&
      berekenPrioriteit('info', 'samenvatting', 'app') === 'laag' &&
      berekenPrioriteit('taak', '', 'app') === 'normaal',
  );

  const actiesStandaard = bouwStandaardActies('mail', 'beveiliging', undefined, 2);
  const vertolkteGeb = interpreteerGebeurtenis(
    {
      id: 'tolk-1',
      bron: 'pc-agent:ready',
      link: 'https://mcp.tarasevych.com/#agent',
      soort: 'error',
      titel: 'Агент заблокував дію',
      bijlagen: [{ naam: 'log.txt', mime: 'text/plain', grootteBytes: 128 }],
    },
    'technisch',
  );
  check(
    '2c interpreteerGebeurtenis будує уніфіковану подію з діями, каналом і двомовними мітками',
    actiesStandaard.some((a) => a.soort === 'bijlage') &&
      actiesStandaard.some((a) => a.labelUk === 'Позначити перевіреним') &&
      vertolkteGeb.ruimte === 'technisch' &&
      vertolkteGeb.kanaal === 'pc_agent' &&
      vertolkteGeb.subdomein === 'mcp' &&
      vertolkteGeb.prioriteit === 'hoog' &&
      vertolkteGeb.bijlagen.length === 1 &&
      kanaalLabel('beveiliging', 'uk') === 'Безпека й доступ' &&
      kanaalLabel('pc_agent', 'nl') === 'Lokale pc-agent' &&
      prioriteitLabel('kritiek', 'uk') === 'Критичний' &&
      prioriteitLabel('hoog', 'nl') === 'Hoog',
  );

  // 3. Геометрія вікна (всі 8 напрямків), захист змахів, контекст піддоменів і тихі години
  const scherm: SchermAfmeting = { breedte: 1280, hoogte: 800, dokBoven: 48, dokOnder: 24, dokLinks: 64, dokRechts: 16 };
  const maatK = maatVanModus('kompakt', scherm);
  const maatB = maatVanModus('breed', scherm);
  const maatV = maatVanModus('volledig', scherm);
  check(
    '3a maatVanModus і klemVenster дотримуються меж робочого простору й док-смуг',
    maatK.breedte === 360 &&
      maatB.breedte === 760 &&
      maatV.breedte === 1280 - 64 - 16 - 16 &&
      maatV.hoogte === 800 - 48 - 24 - 16,
  );

  const startGeo = { x: 240, y: 180, breedte: 460, hoogte: 500, modus: 'normaal' as const, vastgepind: false, minimalePil: false };
  const richtingen: readonly RandRichting[] = ['n', 'z', 'w', 'o', 'nw', 'no', 'zw', 'zo'];
  const alle8Geklemd = richtingen.every((r) => {
    const res = pasVensterMaatAan(startGeo, r, r.includes('o') || r.includes('z') ? 260 : -110, r.includes('z') ? 140 : -90, scherm);
    return (
      res.x >= 64 + 8 &&
      res.y >= 48 + 8 &&
      res.breedte >= MIN_VENSTER_BREEDTE &&
      res.hoogte >= MIN_VENSTER_HOOGTE &&
      res.x + res.breedte <= scherm.breedte - 16 - 8 &&
      res.y + res.hoogte <= scherm.hoogte - 24 - 8
    );
  });
  const naarBreed = pasVensterMaatAan(startGeo, 'o', 260, 0, scherm);
  const naarKompakt = pasVensterMaatAan(startGeo, 'o', -120, 0, scherm);
  check(
    '3b pasVensterMaatAan коректно змінює розмір з усіх 8 боків і перемикає режим вікна',
    alle8Geklemd && naarBreed.modus === 'breed' && naarKompakt.modus === 'kompakt',
  );

  const veegRegels = priveStd.veeg;
  const gewoneGeb = { kanaal: 'mail' as const, prioriteit: 'normaal' as const, status: 'nieuw' as const };
  const kritiekeBeveiligingsGeb = { kanaal: 'beveiliging' as const, prioriteit: 'kritiek' as const, status: 'nieuw' as const };
  const veegGewone = evalueerVeeg('links', veegRegels, gewoneGeb);
  const veegBeschermd = evalueerVeeg('links', veegRegels, kritiekeBeveiligingsGeb);
  const veegUit = evalueerVeeg('links', { ...veegRegels, actief: false }, gewoneGeb);
  const veegGeen = evalueerVeeg('rechts', { ...veegRegels, rechts: 'geen' }, gewoneGeb);
  check(
    '3c evalueerVeeg блокує прибирання нової критичної безпеки в архів і поважає вимкнення',
    veegGewone.uitvoeren === true &&
      veegGewone.actie === 'archief' &&
      veegBeschermd.uitvoeren === false &&
      veegBeschermd.reden === 'kritiek_beschermd' &&
      veegUit.uitvoeren === false &&
      veegUit.reden === 'uit' &&
      veegGeen.uitvoeren === false &&
      veegGeen.reden === 'uit',
  );

  const alleContextenOk = SUBDOMEINEN.every((sub) => {
    const c = contextVoorSubdomein(sub, 'prive');
    return c.subdomein === sub && c.accent.startsWith('#') && c.snelFilters.length >= 3;
  });
  const techContext = contextVoorSubdomein('mail', 'technisch');
  const nachtProfiel = normaliseerProfiel({ stilleUren: { actief: true, van: '23:00', tot: '07:30' } }, 'prive');
  const dagProfiel = normaliseerProfiel({ stilleUren: { actief: true, van: '10:00', tot: '12:00' } }, 'prive');
  check(
    '3d контекст піддоменів і розклад тихих годин (зокрема через північ) працюють точно',
    alleContextenOk &&
      techContext.accent === '#f59e0b' &&
      techContext.naamUk === 'Технічний контур' &&
      isStilInEcosysteem(nachtProfiel, new Date('2026-11-15T23:30:00')) === true &&
      isStilInEcosysteem(nachtProfiel, new Date('2026-11-15T03:15:00')) === true &&
      isStilInEcosysteem(nachtProfiel, new Date('2026-11-15T12:00:00')) === false &&
      isStilInEcosysteem(dagProfiel, new Date('2026-11-15T11:15:00')) === true &&
      isStilInEcosysteem(dagProfiel, new Date('2026-11-15T14:00:00')) === false,
  );

  // 4. Класифікація вкладень та форматування розміру (formaten.ts)
  const testBestanden = [
    ['schema.svg', 'image/svg+xml', 'beeld'],
    ['foto.heic', 'application/octet-stream', 'beeld'],
    ['afbeelding.png', 'image/png', 'beeld'],
    ['opname.mkv', 'application/octet-stream', 'video'],
    ['clip.mp4', 'video/mp4', 'video'],
    ['klank.flac', 'application/octet-stream', 'audio'],
    ['melding.wav', 'audio/wav', 'audio'],
    ['rapport.pdf', 'application/pdf', 'pdf'],
    ['contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
    ['tabel.csv', 'text/csv', 'werkblad'],
    ['opslag.sqlite', 'application/octet-stream', 'database'],
    ['bundel.zip', 'application/zip', 'archief'],
    ['afspraak.ics', 'text/calendar', 'agenda'],
    ['kaartje.vcf', 'text/vcard', 'contact'],
    ['cert.p7s', 'application/pkcs7-signature', 'handtekening'],
    ['wijziging.diff', 'text/x-diff', 'code'],
    ['systeem.log', 'text/plain', 'tekst'],
    ['meta.json', 'application/json', 'code'],
    ['onbekend.bin', 'application/octet-stream', 'hex'],
  ] as const;

  const formatenOk = testBestanden.every(([naam, mime, verwacht]) => classificeerBijlage({ naam, mime }).weergave === verwacht);
  check(
    '4a classificeerBijlage, extensieVanBestand і formaatGrootte розпізнають усі 19 тестових форматів',
    formatenOk &&
      extensieVanBestand('ARHIEF.SQLITE3 ') === 'sqlite3' &&
      formaatGrootte(512) === '512 B' &&
      formaatGrootte(2048) === '2.0 KB' &&
      formaatGrootte(5 * 1024 * 1024) === '5.0 MB',
  );

  // 5. Очищення секретів і ШІ-інспектор (ai.ts)
  const ruwMetGeheimen = [
    '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANBgkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----',
    'jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    'Authorization: Bearer abcdef1234567890abcdef',
    'google=AIzaSyDummySecretValue1234567890abcd',
    'openai=sk-testsecretvalue1234567890abcdef',
    'gh=ghp_1234567890abcdef1234567890abcdef1234',
    'tsv=tsv_geheim_sleutel_9876543210',
    'https://hub.tarasevych.com/cb?token=secretToken999&password=mijnWachtwoord123',
    'sha1=0123456789abcdef0123456789abcdef01234567',
  ].join('\n');
  const geschoond = zonderGeheimen(ruwMetGeheimen);
  check(
    '5a zonderGeheimen видаляє приватні ключі, JWT, Bearer, API-ключі, параметри URL та 40+ hex-геші',
    !geschoond.includes('MIIBVgIBADANBgkqhkiG9w0BAQEF') &&
      !geschoond.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') &&
      !geschoond.includes('abcdef1234567890abcdef') &&
      !geschoond.includes('AIzaSyDummySecretValue1234567890abcd') &&
      !geschoond.includes('sk-testsecretvalue1234567890abcdef') &&
      !geschoond.includes('ghp_1234567890abcdef1234567890abcdef1234') &&
      !geschoond.includes('tsv_geheim_sleutel_9876543210') &&
      !geschoond.includes('secretToken999') &&
      !geschoond.includes('mijnWachtwoord123') &&
      !geschoond.includes('0123456789abcdef0123456789abcdef01234567'),
  );

  const bevGeb = interpreteerGebeurtenis(
    {
      id: 'ai-bev-1',
      bron: 'sleutelkluis',
      kanaal: 'beveiliging',
      subdomein: 'id',
      soort: 'fout',
      ernst: 'laag',
      titel: 'Помилка розшифрування ключа AIzaSyDummySecretValue1234567890abcd',
      bericht: 'Bearer mySecretToken1234567890 ?password=topsecret123',
      bijlagen: [{ id: 'f1', naam: 'debug.log', mime: 'text/plain', grootteBytes: 128, tekstVoorbeeld: 'token=tsv_secret_abcdefgh12345' }],
    },
    'prive',
  );
  const analyseUk = interneAiAnalyse(bevGeb, 'uk');
  const analyseNl = interneAiAnalyse(bevGeb, 'nl');
  const prompt = bouwAiPromptVoorGebeurtenis(bevGeb, 'uk');
  check(
    '5b interneAiAnalyse та bouwAiPromptVoorGebeurtenis формують двомовні поради без витоку таємниць',
    analyseUk.bron === 'intern' &&
      analyseUk.geschoond === true &&
      analyseUk.aanbevolenActies.length >= 2 &&
      analyseNl.oorzaak.includes('Beveiligings') &&
      !prompt.vraag.includes('AIzaSyDummySecretValue1234567890abcd') &&
      !prompt.vraag.includes('mySecretToken1234567890') &&
      !prompt.vraag.includes('topsecret123') &&
      !prompt.vraag.includes('tsv_secret_abcdefgh12345'),
  );

  // 6. Клієнтське сховище та зведення 5 джерел потоку (ecosysteem-opslag.ts після nepBrowser)
  nepBrowser('https://mail.tarasevych.com', 'uk');
  const { zetEcosysteemModusActief, leesEcosysteemModusActief, leesLokaalProfiel, bouwUniformeStroom } = await import(
    '../../src/meldingen/ecosysteem/ecosysteem-opslag'
  );

  const initActief = leesEcosysteemModusActief();
  zetEcosysteemModusActief(false);
  const naUit = leesEcosysteemModusActief();
  zetEcosysteemModusActief(true);
  const naAan = leesEcosysteemModusActief();
  const lokaalPrive = leesLokaalProfiel('eigenaar-1', 'prive');
  const lokaalTech = leesLokaalProfiel('eigenaar-1', 'technisch');
  check(
    '6a режим порталу та локальні профілі просторів prive/technisch коректно читаються і перемикаються',
    initActief === true && naUit === false && naAan === true && lokaalPrive.ruimte === 'prive' && lokaalTech.ruimte === 'technisch',
  );

  const nu = Date.now();
  const srvGeb: MeldingEcosysteemGebeurtenis[] = [
    interpreteerGebeurtenis({ id: 'srv-tech', ruimte: 'technisch', externeSleutel: 't:1', titel: 'Лише технічна', aangemaaktOp: nu - 1000 }, 'technisch'),
    {
      ...interpreteerGebeurtenis({ id: 'srv-oud', ruimte: 'prive', externeSleutel: 'dup:sleutel', titel: 'Старіша версія', aangemaaktOp: nu - 50_000 }, 'prive'),
      bijgewerktOp: nu - 50_000,
    },
    {
      ...interpreteerGebeurtenis({ id: 'srv-nieuw', ruimte: 'prive', externeSleutel: 'dup:sleutel', titel: 'Свіжіша версія', aangemaaktOp: nu - 5_000 }, 'prive'),
      bijgewerktOp: nu - 5_000,
    },
    {
      ...interpreteerGebeurtenis({ id: 'srv-uitgesteld', ruimte: 'prive', externeSleutel: 'wake:1', titel: 'Час пробудження', aangemaaktOp: nu - 20_000 }, 'prive'),
      status: 'uitgesteld',
      uitgesteldTot: nu - 1000,
      bijgewerktOp: nu - 20_000,
    },
  ];
  const paginaSignalen: PaginaSignaal[] = [
    { id: 'ps:uit', bron: 'band', soort: 'info', ernst: 'info', titelUk: 'Неактивний', titelNl: 'Inactief', bijgewerktOp: nu, actief: false },
    { id: 'ps:aan', bron: 'verbinding-band', kanaal: 'pagina', subdomein: 'mail', soort: 'waarschuwing', ernst: 'hoog', titelUk: 'Активна смуга', titelNl: 'Actieve balk', bijgewerktOp: nu - 100, actief: true },
  ];
  const serverItems: CanonicalServerNotification[] = [
    { id: 'sn-prive', kind: 'mail', title: 'Приватний лист', message: 'Деталі', createdAt: nu - 2000, ruimte: 'prive' },
    { id: 'sn-tech', kind: 'admin', title: 'Технічна подія', message: 'Ігнорувати в приватному', createdAt: nu - 1500, ruimte: 'technisch' },
  ];
  const localRows: BewaardeRij[] = [
    { id: 'loc-1', text: 'Локальне сповіщення', kind: 'warning', createdAt: nu - 3000, source: 'mail', read: false, count: 3 },
  ];
  const activityEvents: ActivityEvent[] = [
    { id: 'act-1', source: 'ai', kind: 'tool', type: 'owner.mcp.tool', subject: 'mail_search', status: 'failed', createdAt: nu - 4000, finishedAt: nu - 3500 },
  ];

  const priveStroom = bouwUniformeStroom({
    lang: 'uk',
    ruimte: 'prive',
    subdomeinNu: 'mail',
    serverGebeurtenissen: srvGeb,
    paginaSignalen,
    serverItems,
    techItems: [{ id: 'sn-only-tech', kind: 'deploy', title: 'Випуск', message: 'ОК', createdAt: nu, ruimte: 'technisch' }],
    localRows,
    activityEvents,
    activityRead: new Set(),
    overrides: { 's:sn-prive': { status: 'archief', op: nu } },
    aiCache: { 'l:loc-1': analyseUk },
  });

  const wokeItem = priveStroom.find((g) => g.externeSleutel === 'wake:1');
  const dupItem = priveStroom.find((g) => g.externeSleutel === 'dup:sleutel');
  const srvOverride = priveStroom.find((g) => g.id === 's:sn-prive');
  const locMetAi = priveStroom.find((g) => g.id === 'l:loc-1');
  const heeftArchiefLaatst = priveStroom[priveStroom.length - 1]?.status === 'archief';

  check(
    '6b bouwUniformeStroom зводить 5 джерел, ізолює простори, дедуплікує, будить відкладене та накладає ШІ',
    !priveStroom.some((g) => g.id === 'srv-tech' || g.id === 's:sn-tech' || g.id === 's:sn-only-tech' || g.id === 'ps:uit') &&
      priveStroom.some((g) => g.id === 'ps:aan') &&
      priveStroom.some((g) => g.id === 'a:act-1' && g.prioriteit === 'hoog') &&
      dupItem?.titel === 'Свіжіша версія' &&
      wokeItem?.status === 'nieuw' &&
      wokeItem?.uitgesteldTot === null &&
      srvOverride?.status === 'archief' &&
      locMetAi?.herhalingen === 3 &&
      locMetAi?.aiSamenvatting?.aanbieder === 'lokale-tolk' &&
      heeftArchiefLaatst,
  );

  return einde();
}
