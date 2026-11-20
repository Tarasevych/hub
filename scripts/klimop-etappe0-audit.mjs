#!/usr/bin/env node
// KLIMOP-002 (20.11.2026): Відтворюваний доказовий інспектор Етапу 0 Головного архітектурного маніфесту «Плющ» / «Klimop».
// Працює суворо в режимі читання (без жодної зміни файлів, бази даних чи робочого середовища) і збирає перевірювані
// показники дійсного стану сховища Tarasevych/hub: міграції PostgreSQL, таблиці RLS, реєстр сховища ключів, піддомени,
// системні одиниці systemd, з'єднувачі 14 ШІ-агентів та поточні єдині точки відмови (SPOF).
// Herhaalbare bewijsaudit van Fase 0 van het Hoofdarchitectuurmanifest «Klimop» (uitsluitend lezen, geen bijwerkingen).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Виконує повний статичний аудит кодової бази для Етапу 0 «Плюща».
 * @param {string} [wortelPad]
 */
export function voerKlimopEtappe0AuditUit(wortelPad = process.cwd()) {
  const wortel = resolve(wortelPad);
  const lees = (rel) => readFileSync(join(wortel, rel), 'utf8');
  const bestaat = (rel) => existsSync(join(wortel, rel));

  // 1. Міграції PostgreSQL та політики ізоляції рядків (RLS)
  const migratieMap = join(wortel, 'migrations');
  const migratieBestanden = readdirSync(migratieMap)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let aantalEnableRls = 0;
  let aantalForceRls = 0;
  for (const naam of migratieBestanden) {
    const sql = readFileSync(join(migratieMap, naam), 'utf8');
    if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)) aantalEnableRls++;
    if (/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)) aantalForceRls++;
  }
  const genummerdeMigraties = migratieBestanden.filter((f) => /^\d{4}_/.test(f));

  // 2. Обсяг серверних, спільних і клієнтських модулів
  const backendBestanden = readdirSync(join(wortel, 'backend')).filter((f) => /\.(ts|mjs)$/.test(f));
  const serverBestanden = readdirSync(join(wortel, 'server'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts'));
  const sharedBestanden = readdirSync(join(wortel, 'shared'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts'));
  const srcDomeinen = readdirSync(join(wortel, 'src'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const systemdEenheden = readdirSync(join(wortel, 'deploy'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.service') || f.endsWith('.timer'))
    .sort();

  // 3. Піддомени з шаблону тунелю та канонічного маршрутизатора
  const tunnelTekst = bestaat('deploy/cloudflared-config.yml') ? lees('deploy/cloudflared-config.yml') : '';
  const tunnelSubdomeinen = [...new Set([...tunnelTekst.matchAll(/hostname:\s*([a-z0-9.-]+\.tarasevych\.com)/gi)].map((m) => m[1].toLowerCase()))].sort();

  const canoniekJs = bestaat('public/canonical-service.js') ? lees('public/canonical-service.js') : '';
  const appSubdomeinen = [...new Set([...canoniekJs.matchAll(/'([a-z0-9.-]+\.tarasevych\.com)'/gi)].map((m) => m[1].toLowerCase()))].sort();

  // 4. Реєстр сховища ключів (shared/sleutelkluis.ts)
  const kluisTekst = lees('shared/sleutelkluis.ts');
  const dekRijen = [...kluisTekst.matchAll(/stand:\s*'dek'/g)].length;
  const nogNietRijen = [...kluisTekst.matchAll(/stand:\s*'nog-niet'/g)].length;

  // 5. Дозволені серверні змінні секретів (лише назви, жодних значень!)
  const geheimenTekst = lees('server/platform/geheimen.ts');
  const geheimNamen = [...geheimenTekst.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);

  // 6. Політика координації та 14 ШІ-агентів
  const beleid = JSON.parse(lees('orchestratie/beleid.json'));
  const catalogus = JSON.parse(lees('scripts/vaardigheden/catalogus.json'));

  // 7. Одинадцять основних служб із §3 маніфесту та їхній поточний стан
  const diensten = [
    {
      id: 'hoofdwerkruimte',
      subdomein: 'hub.tarasevych.com',
      uk: 'Головний робочий простір (огляд, завдання, нотатки, пошук, фото)',
      nl: 'Hoofdwerkruimte (overzicht, taken, notities, zoeken, foto’s)',
      kernBestanden: ['server/start.ts', 'backend/zoek/bronnen.ts', 'src/overzicht', 'src/notities'],
      huidigeStaat: 'actief_centraal',
    },
    {
      id: 'elektronische_post',
      subdomein: 'mail.tarasevych.com',
      uk: 'Електронна пошта (Gmail, Microsoft 365, IMAP/SMTP, приймання зображень, переклад)',
      nl: 'E-mail (Gmail, Microsoft 365, IMAP/SMTP, externe afbeeldingen, vertaling)',
      kernBestanden: ['backend/mail-imap.ts', 'backend/vertaal-adapters.ts', 'src/mail'],
      huidigeStaat: 'actief_centraal',
    },
    {
      id: 'identiteit_en_accounts',
      subdomein: 'id.tarasevych.com',
      uk: 'Облікові записи та ідентичність (WebAuthn Passkey, TOTP, вхід через Telegram, сеанси, сховище ключів)',
      nl: 'Accounts en identiteit (WebAuthn Passkey, TOTP, Telegram-aanmelding, sessies, sleutelkluis)',
      kernBestanden: ['backend/toegangslaag.ts', 'backend/sleutelkluis.ts', 'src/identiteit'],
      huidigeStaat: 'actief_centraal_met_gebruikers_dek',
    },
    {
      id: 'cloudopslag',
      subdomein: 'cloud.tarasevych.com',
      uk: 'Хмарне сховище та зовнішні диски (локальні об’єкти, Google Drive, OneDrive, Dropbox, S3, WebDAV)',
      nl: 'Cloudopslag en externe schijven (lokale objecten, Google Drive, OneDrive, Dropbox, S3, WebDAV)',
      kernBestanden: ['server/platform/opslag.ts', 'backend/cloud-platform.ts', 'shared/verdeelde-opslag.ts'],
      huidigeStaat: 'actief_centraal_met_shamir_sleutelkernen',
    },
    {
      id: 'agenda_en_gebeurtenissen',
      subdomein: 'hub.tarasevych.com / cloud.tarasevych.com',
      uk: 'Календар і події (Google Calendar, CalDAV, планування)',
      nl: 'Agenda en gebeurtenissen (Google Calendar, CalDAV, planning)',
      kernBestanden: ['backend/agenda-caldav.ts', 'backend/google-suite-agenda-sync.ts', 'src/agenda'],
      huidigeStaat: 'actief_centraal',
    },
    {
      id: 'ai_ruimte',
      subdomein: 'ai.tarasevych.com',
      uk: 'ШІ-простір, довготривала пам’ять та естафета завдань між 14 агентами',
      nl: 'AI-ruimte, langetermijngeheugen en taakoverdracht tussen 14 agenten',
      kernBestanden: ['backend/geheugen-stroom.ts', 'backend/geheugen-taken.ts', 'src/ai-ecosysteem'],
      huidigeStaat: 'actief_centraal_met_gebruikers_dek',
    },
    {
      id: 'mcp_poort',
      subdomein: 'mcp.tarasevych.com',
      uk: 'Шлюз протоколу контексту моделі (14 індивідуальних адрес v2, оглядач 0.4+, клієнт ПК 0.3+)',
      nl: 'Model Context Protocol-poort (14 afzonderlijke v2-adressen, browserextensie 0.4+, pc-agent 0.3+)',
      kernBestanden: ['backend/connector-v2.ts', 'backend/mcp-protocol-2026.ts', 'shared/connector-v2/agenten.ts'],
      huidigeStaat: 'actief_centraal_met_levende_rolcontrole',
    },
    {
      id: 'ontwikkelhulpmiddelen',
      subdomein: 'github.tarasevych.com',
      uk: 'Засоби розробки, координація сховищ GitHub і перевірка походження випусків TRACE-001',
      nl: 'Ontwikkelhulpmiddelen, GitHub-opslagplaatsen en TRACE-001-herkomstcontrole',
      kernBestanden: ['backend/github-koppeling-opslag.ts', 'backend/uitrol-github-ontvangen.ts', 'src/github'],
      huidigeStaat: 'actief_centraal',
    },
    {
      id: 'slimme_woning',
      subdomein: 'huis.tarasevych.com',
      uk: 'Розумний дім (кімнати, пристрої, сценарії, енергія, Home Assistant, MQTT)',
      nl: 'Slimme woning (kamers, apparaten, scènes, energie, Home Assistant, MQTT)',
      kernBestanden: ['backend/huis-vnext.ts', 'backend/verbinding-adapters/mqtt.ts', 'src/huis'],
      huidigeStaat: 'actief_centraal',
    },
    {
      id: 'programmatische_verbinders',
      subdomein: 'api.tarasevych.com',
      uk: 'Програмні з’єднувачі, сейф платформи та звірка зовнішніх інтеграцій',
      nl: 'Programmatische verbinders, platformkluis en afstemming van externe integraties',
      kernBestanden: ['backend/api-platform-kluis.ts', 'shared/integraties-catalogus.ts', 'src/verbindingen'],
      huidigeStaat: 'actief_centraal',
    },
    {
      id: 'beheer_en_diagnostiek',
      subdomein: 'admin.tarasevych.com / dashboard.tarasevych.com',
      uk: 'Адміністрування, 3-чинникове встановлення оновлень, журнал безпеки та діагностика',
      nl: 'Beheer, 3-factoren-uitrol, beveiligingslogboek en diagnostiek',
      kernBestanden: ['deploy/uitrol/mijn-ruimte-uitrol.sh', 'backend/uitrol-sleutels.ts', 'src/uitrol'],
      huidigeStaat: 'actief_centraal_met_3f_en_passkey',
    },
  ];

  // 8. Виявлені єдині точки відмови (SPOF) дійсної архітектури, які усуватимуться на Етапах 1–12
  const enkelePuntenVanUitval = [
    {
      id: 'spof-enkele-vm-en-pg',
      element: 'wortels_en_bladeren',
      uk: 'Усі серверні служби та єдиний екземпляр PostgreSQL 18.6 працюють на одній віртуальній машині Ubuntu 26.04.1 LTS.',
      nl: 'Alle serverdiensten en de enige PostgreSQL 18.6-instantie draaien op één Ubuntu 26.04.1 LTS-virtuele machine.',
      doelFase: 2,
    },
    {
      id: 'spof-cloudflare-en-centraal-domein',
      element: 'stengels',
      uk: 'Усі 11 піддоменів залежать від єдиного тунелю Cloudflare (із завершенням зовнішнього TLS на краю) та єдиного домену tarasevych.com без прямих взаємно автентифікованих маршрутів між вузлами.',
      nl: 'Alle 11 subdomeinen hangen af van één Cloudflare-tunnel (met externe TLS-beëindiging aan de rand) en één domein tarasevych.com zonder directe onderling geauthenticeerde routes tussen knooppunten.',
      doelFase: 2,
    },
    {
      id: 'spof-dek-in-servergeheugen-en-18-tabellen',
      element: 'immuunsysteem_en_opslag',
      uk: '11 таблиць зашифровано власним DEK користувача, проте під час відкритого сеансу DEK перебуває в оперативній пам’яті сервера, а 18 таблиць (зокрема проєкції пошти, календаря та великі файли у /srv/data/uploads) ще очікують наскрізного клієнтського шифрування й кодів відновлення фрагментів.',
      nl: '11 tabellen zijn versleuteld met de eigen DEK van de gebruiker, maar tijdens een geopende sessie bevindt de DEK zich in het servergeheugen en 18 tabellen (waaronder mailprojecties en grote bestanden in /srv/data/uploads) wachten nog op eind-tot-eind clientversleuteling en herstelcodes.',
      doelFase: 3,
    },
    {
      id: 'spof-enkele-eigenaar-sleutels',
      element: 'wortels_en_bestuur',
      uk: 'Затвердження критичних правил (regels.lock.json) і випусків спирається на ключі одного власника без порогових підписів FROST t-з-n, без розподіленого журналу повноважень і без окремого протоколу передавання спадкоємності.',
      nl: 'Goedkeuring van kritieke regels (regels.lock.json) en uitgaven steunt op de sleutels van één eigenaar zonder FROST t-van-n drempelhandtekeningen, zonder gespreid bevoegdhedenlogboek en zonder overdrachtsprotocol voor voortbestaan.',
      doelFase: 4,
    },
    {
      id: 'spof-ontbrekende-dwangmodus',
      element: 'bescherming_van_de_mens',
      uk: 'Ще не реалізовано криптографічно відокремлений безпечний обмежений режим під час примусу та часові затримки з незалежним підтвердженням для небезпечних дій (§17 маніфесту).',
      nl: 'Een cryptografisch gescheiden veilige beperkte modus onder dwang en tijdsloten met onafhankelijke bevestiging voor gevaarlijke handelingen (§17 van het manifest) ontbreken nog.',
      doelFase: 9,
    },
  ];

  const alleKernBestandenAanwezig = diensten.every((d) => d.kernBestanden.every((p) => bestaat(p)));

  return {
    schema: 1,
    code: 'KLIMOP-ETAPPE-0-AUDIT',
    datum: '2026-11-20',
    regelsVersie: beleid.regelsVersie,
    opslagplaats: {
      backendBestanden: backendBestanden.length,
      serverBestanden: serverBestanden.length,
      sharedBestanden: sharedBestanden.length,
      srcDomeinen: srcDomeinen.length,
      systemdEenheden: systemdEenheden.length,
    },
    databank: {
      totaalMigratieBestanden: migratieBestanden.length,
      genummerdeMigraties: genummerdeMigraties.length,
      eersteMigratie: migratieBestanden[0] ?? null,
      laatsteGenummerdeMigratie: genummerdeMigraties[genummerdeMigraties.length - 1] ?? null,
      migratiesMetEnableRls: aantalEnableRls,
      migratiesMetForceRls: aantalForceRls,
    },
    netwerk: {
      tunnelSubdomeinen,
      appSubdomeinen,
      aantalTunnelSubdomeinen: tunnelSubdomeinen.length,
      aantalAppSubdomeinen: appSubdomeinen.length,
    },
    versleuteling: {
      sleutelkluisTotaal: dekRijen + nogNietRijen,
      sleutelkluisOnderDek: dekRijen,
      sleutelkluisNogNiet: nogNietRijen,
      toegestaneOmgevingsGeheimNamen: geheimNamen,
      shamirKernAanwezig: bestaat('shared/verdeelde-opslag.ts') && bestaat('migrations/0306_verdeelde_opslag_knopen.sql'),
    },
    agentenEnVaardigheden: {
      aantalAgentenInBeleid: Array.isArray(beleid.agenten) ? beleid.agenten.length : 0,
      aantalAdaptersInBeleid: Array.isArray(beleid.adapters?.bestanden) ? beleid.adapters.bestanden.length : 0,
      aantalGedeeldeVaardigheden: Array.isArray(catalogus.vaardigheden) ? catalogus.vaardigheden.length : 0,
    },
    diensten,
    alleKernBestandenAanwezig,
    enkelePuntenVanUitval,
  };
}

const isHoofdproces = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isHoofdproces) {
  const rapport = voerKlimopEtappe0AuditUit(process.cwd());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rapport, null, 2));
  } else {
    console.log(`KLIMOP Етап 0 · Доказовий аудит дійсного стану (${rapport.datum}) · правила ${rapport.regelsVersie}`);
    console.log(`  Модулі: server=${rapport.opslagplaats.serverBestanden}, backend=${rapport.opslagplaats.backendBestanden}, shared=${rapport.opslagplaats.sharedBestanden}, src=${rapport.opslagplaats.srcDomeinen}, systemd=${rapport.opslagplaats.systemdEenheden}`);
    console.log(`  PostgreSQL: міграцій=${rapport.databank.totaalMigratieBestanden} (остання номерна: ${rapport.databank.laatsteGenummerdeMigratie}), ENABLE RLS=${rapport.databank.migratiesMetEnableRls}, FORCE RLS=${rapport.databank.migratiesMetForceRls}`);
    console.log(`  Піддомени: тунель=${rapport.netwerk.aantalTunnelSubdomeinen} (${rapport.netwerk.tunnelSubdomeinen.join(', ')}), застосунок=${rapport.netwerk.aantalAppSubdomeinen}`);
    console.log(`  Сховище ключів: усього=${rapport.versleuteling.sleutelkluisTotaal}, під власним DEK=${rapport.versleuteling.sleutelkluisOnderDek}, очікують перенесення=${rapport.versleuteling.sleutelkluisNogNiet}`);
    console.log(`  Агенти та навички: агентів=${rapport.agentenEnVaardigheden.aantalAgentenInBeleid}, перехідників=${rapport.agentenEnVaardigheden.aantalAdaptersInBeleid}, навичок=${rapport.agentenEnVaardigheden.aantalGedeeldeVaardigheden}`);
    console.log(`  Служби (§3 маніфесту): ${rapport.diensten.length} перевірено, усі ключові файли наявні=${rapport.alleKernBestandenAanwezig}`);
    console.log(`  Виявлено єдиних точок відмови (SPOF) для усунення на Етапах 2–9: ${rapport.enkelePuntenVanUitval.length}`);
  }
}
