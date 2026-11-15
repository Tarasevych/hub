// Комплексне модульне випробування інтерфейсу, стилів, інтеграції оболонки/смуг, сторінки /melding,
// серверних маршрутів, міграції RLS, ПК-агента та розширення оглядача для екосистеми сповіщень (GEMINI-002).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';
import {
  interneAiAnalyse,
  interpreteerGebeurtenis,
  standaardProfiel,
  type MeldingBijlage,
} from '../../shared/meldingen-ecosysteem';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-ecosysteem-ui');

  // Ініціалізуємо оточення оглядача ДО динамічного імпорту модулів із src/
  nepBrowser('https://hub.tarasevych.com', 'uk');

  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: MeldingBijlageSpeler } = await import('../../src/meldingen/ecosysteem/MeldingBijlageSpeler');
  const { default: MeldingAiPaneel } = await import('../../src/meldingen/ecosysteem/MeldingAiPaneel');
  const { default: MeldingVeegKaart } = await import('../../src/meldingen/ecosysteem/MeldingVeegKaart');
  const { default: MeldingenPortaal } = await import('../../src/meldingen/ecosysteem/MeldingenPortaal');

  const profielBreed = {
    ...standaardProfiel('prive'),
    geometrie: {
      x: 32,
      y: 64,
      breedte: 760,
      hoogte: 660,
      modus: 'breed' as const,
      vastgepind: false,
      minimalePil: false,
    },
  };

  const spelerBijlagen: MeldingBijlage[] = [
    { id: 'b-svg', naam: 'shema.svg', mime: 'image/svg+xml', grootteBytes: 420, tekstVoorbeeld: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
    { id: 'b-wav', naam: 'zvuk.wav', mime: 'audio/wav', grootteBytes: 2048 },
    { id: 'b-csv', naam: 'zvit.csv', mime: 'text/csv', grootteBytes: 310, tekstVoorbeeld: 'А,Б\n1,2' },
    { id: 'b-diff', naam: 'zmina.diff', mime: 'text/x-diff', grootteBytes: 180, tekstVoorbeeld: '+рядок\n-старий' },
    { id: 'b-ics', naam: 'podija.ics', mime: 'text/calendar', grootteBytes: 240, tekstVoorbeeld: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
    { id: 'b-vcf', naam: 'kontakt.vcf', mime: 'text/vcard', grootteBytes: 150, tekstVoorbeeld: 'BEGIN:VCARD\nFN:Pavlo\nEND:VCARD' },
    { id: 'b-json', naam: 'dani.json', mime: 'application/json', grootteBytes: 190, tekstVoorbeeld: '{"ok":true}' },
    { id: 'b-bin', naam: 'blok.bin', mime: 'application/octet-stream', grootteBytes: 64 },
  ];

  // 1. Вбудований переглядач/програвач вкладень для 8 форматів
  const spelerHtmls = spelerBijlagen.map((b, idx) => ({
    b,
    html: renderToStaticMarkup(
      createElement(MeldingBijlageSpeler, {
        lang: 'uk',
        bijlagen: spelerBijlagen,
        actieveIndex: idx,
        voorkeur: profielBreed.bijlageWeergave,
        onSelectIndex: () => undefined,
        onToggleModaal: () => undefined,
        onSluiten: () => undefined,
      }),
    ),
  }));
  const spelerBadges = ['SVG', 'AUD', 'XLS', 'DIFF', 'ICS', 'VCF', 'JSON', 'BIN'];
  const spelerAllesOk = spelerHtmls.every(({ b, html }, i) =>
    html.includes('data-testid="mel-bijlage-speler"') &&
    html.includes('data-weergave="') &&
    html.includes(spelerBadges[i]) &&
    html.includes(b.naam) &&
    html.includes(`${i + 1}/8`) &&
    html.includes('Попереднє вкладення') &&
    html.includes('Наступне вкладення') &&
    html.includes('mel-speler-leeg'),
  );
  check('1a MeldingBijlageSpeler відтворює розмітку всіх 8 форматів із навігацією та позначками', spelerAllesOk);

  // 2. Панель ШІ: звичайна подія та ізольована подія безпеки
  const gewoneGeb = {
    ...interpreteerGebeurtenis({
      id: 'geb-norm-1',
      bron: 'mail',
      kanaal: 'mail',
      subdomein: 'mail',
      soort: 'info',
      titel: 'Лист із вкладеннями надійшов',
      bericht: 'Опис листа та перелік файлів для швидкого перегляду.',
      uitleg: 'Розгорнута технічна підказка користувачу.',
      bijlagen: [spelerBijlagen[0], spelerBijlagen[2]],
    }, 'prive'),
    aiSamenvatting: null as ReturnType<typeof interneAiAnalyse> | null,
  };
  gewoneGeb.aiSamenvatting = interneAiAnalyse(gewoneGeb, 'uk');

  const bevGeb = interpreteerGebeurtenis({
    id: 'geb-bev-1',
    bron: 'sleutelkluis',
    kanaal: 'beveiliging',
    subdomein: 'id',
    soort: 'sleutel_dicht',
    ernst: 'kritiek',
    titel: 'Потрібне розшифрування ключа на місці',
    bericht: 'Критична перевірка безпеки облікового запису.',
  }, 'prive');

  const aiNormHtml = renderToStaticMarkup(
    createElement(MeldingAiPaneel, {
      lang: 'uk',
      gebeurtenis: gewoneGeb,
      aiInstelling: profielBreed.ai,
      onOntleden: async () => gewoneGeb.aiSamenvatting!,
    }),
  );
  const aiBevHtml = renderToStaticMarkup(
    createElement(MeldingAiPaneel, {
      lang: 'uk',
      gebeurtenis: bevGeb,
      aiInstelling: { ...profielBreed.ai, alleenLokaalVoorBeveiliging: true },
      onOntleden: async () => interneAiAnalyse(bevGeb, 'uk'),
    }),
  );
  check(
    '2a MeldingAiPaneel показує внутрішній і зовнішній ШІ для звичайних подій і блокує зовнішній для безпеки',
    aiNormHtml.includes('data-testid="mel-ai-paneel"') &&
      aiNormHtml.includes('data-ai-modus="intern"') &&
      aiNormHtml.includes('data-ai-modus="extern"') &&
      aiNormHtml.includes('Секрети приховано') &&
      aiBevHtml.includes('data-ai-modus="intern"') &&
      !aiBevHtml.includes('data-ai-modus="extern"') &&
      aiBevHtml.includes('mel-ai-veiligheid'),
  );

  // 3. Картка змаху: згорнута й розгорнута
  const kaartDichtHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: gewoneGeb,
      profiel: profielBreed,
      bijlageVoorkeur: profielBreed.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => gewoneGeb.aiSamenvatting!,
      onOpenBijlageModaal: () => undefined,
    }),
  );
  const kaartOpenHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: gewoneGeb,
      profiel: profielBreed,
      standaardOpen: true,
      bijlageVoorkeur: profielBreed.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => gewoneGeb.aiSamenvatting!,
      onOpenBijlageModaal: () => undefined,
    }),
  );
  check(
    '3a MeldingVeegKaart коректно відмальовує позначки вкладень, пояснення, дії та панель ШІ',
    kaartDichtHtml.includes('data-testid="mel-kaart-geb-norm-1"') &&
      kaartDichtHtml.includes('mel-bijlage-chip') &&
      kaartDichtHtml.includes('shema.svg') &&
      kaartOpenHtml.includes('mel-kaart-details') &&
      kaartOpenHtml.includes('mel-uitleg-blok') &&
      kaartOpenHtml.includes('mel-ai-paneel'),
  );

  // 4. Незалежний портал: згорнута пігулка + широке двоколонкове вікно з 8 краями змінення розмірів
  const pilProfiel = {
    ...profielBreed,
    geometrie: { ...profielBreed.geometrie, minimalePil: true },
  };
  const pilHtml = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'uk',
      open: false,
      ruimte: 'prive',
      subdomeinNu: 'hub',
      profiel: pilProfiel,
      stroom: [gewoneGeb, bevGeb],
      laden: false,
      sound: true,
      onSluiten: () => undefined,
      onOpenen: () => undefined,
      onToggleSound: () => undefined,
      onVervers: () => undefined,
      onSlaGeometrieOp: () => undefined,
      onStatusWijzigen: async () => undefined,
      onOntleden: async () => gewoneGeb.aiSamenvatting!,
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
    }),
  );
  const breedHtml = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'uk',
      open: true,
      ruimte: 'prive',
      subdomeinNu: 'mail',
      profiel: profielBreed,
      stroom: [gewoneGeb, bevGeb],
      laden: false,
      sound: true,
      onSluiten: () => undefined,
      onOpenen: () => undefined,
      onToggleSound: () => undefined,
      onVervers: () => undefined,
      onSlaGeometrieOp: () => undefined,
      onStatusWijzigen: async () => undefined,
      onOntleden: async () => gewoneGeb.aiSamenvatting!,
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
    }),
  );

  const randen = ['n', 'z', 'w', 'o', 'nw', 'no', 'zw', 'zo'] as const;
  const alleRandenAanwezig = randen.every((r) => breedHtml.includes(`mel-rand mel-rand-${r}`));
  check(
    '4a MeldingenPortaal відмальовує плавучу пігулку та широке 2-колонкове вікно з 8 ручками розміру',
    pilHtml.includes('data-testid="mel-minimale-pil"') &&
      pilHtml.includes('mel-pil-teller') &&
      breedHtml.includes('mel-ecosysteem-portaal') &&
      breedHtml.includes('is-modus-breed') &&
      breedHtml.includes('is-tweekolom') &&
      breedHtml.includes('data-qa-id="canonical-notification-panel"') &&
      breedHtml.includes('data-ruimte="prive"') &&
      breedHtml.includes('data-subdomein="mail"') &&
      alleRandenAanwezig &&
      breedHtml.includes('type="search"') &&
      breedHtml.includes('mel-tab') &&
      breedHtml.includes('mel-kanaal-chip') &&
      breedHtml.includes('mel-detail-kolom') &&
      breedHtml.includes('mel-bijlage-speler') &&
      breedHtml.includes('mel-ai-paneel'),
  );

  // 5. Стилі та реєстр фіксованих елементів
  const ecoCss = lees('src/meldingen/ecosysteem/meldingen-ecosysteem.css');
  const paginaCss = lees('src/identiteit/melding/melding-pagina.css');
  const vasteJson = lees('scripts/plaatsing-vaste-elementen.json');
  const omlijstingTsx = lees('src/CanoniekOmlijsting.tsx');
  check(
    '5a стилі екосистеми використовують канонічні змінні оформлення й зареєстровані в plaatsing-vaste-elementen',
    ecoCss.includes('.mel-ecosysteem-portaal') &&
      ecoCss.includes('.mel-bijlage-portaal') &&
      ecoCss.includes('.mel-minimale-pil') &&
      ecoCss.includes('z-index: 105000;') &&
      ecoCss.includes('@media (max-width: 640px)') &&
      paginaCss.includes('.mp-pagina') &&
      paginaCss.includes('.mp-ruimte-balk') &&
      vasteJson.includes('src/meldingen/ecosysteem/meldingen-ecosysteem.css :: .mel-ecosysteem-portaal') &&
      vasteJson.includes('src/meldingen/ecosysteem/meldingen-ecosysteem.css :: .mel-bijlage-portaal') &&
      vasteJson.includes('src/meldingen/ecosysteem/meldingen-ecosysteem.css :: .mel-minimale-pil') &&
      omlijstingTsx.includes('.mel-ecosysteem-portaal,.mel-bijlage-portaal,.mel-minimale-pil'),
  );

  // 6. Інтеграція в центрі сповіщень і 5 інформаційних смугах сайту
  const centrumTsx = lees('src/CanoniekMeldingencentrum.tsx');
  const verbBandTsx = lees('src/CanoniekVerbindingBand.tsx');
  const extBandTsx = lees('src/ExtensieUpdateBand.tsx');
  const ruimteStrookTsx = lees('src/RuimteStrook.tsx');
  const nieuweVersieTsx = lees('src/platform/NieuweVersieBand.tsx');
  const kluisPoortTsx = lees('src/platform/kluis-poort.tsx');
  check(
    '6a центр сповіщень і всі 5 інформаційних смуг підключені до єдиної шини екосистеми',
    centrumTsx.includes('useMeldingEcosysteem(') &&
      centrumTsx.includes('<MeldingenPortaal') &&
      centrumTsx.includes('wijzigEnSyncStatus') &&
      verbBandTsx.includes("id: 'band:verbinding'") &&
      extBandTsx.includes("id: 'band:extensie-update'") &&
      ruimteStrookTsx.includes('publiceerPaginaSignaal(') &&
      nieuweVersieTsx.includes("id: 'band:nieuwe-versie'") &&
      kluisPoortTsx.includes("id: 'band:sleutelkluis'"),
  );

  // 7. Сторінка /melding, маршрутизатор, вкладки та макет облікового запису (13 розділів)
  const paginaTsx = lees('src/identiteit/melding/MeldingEcosysteemPagina.tsx');
  const tabsTs = lees('src/identiteit/identiteit-tabs.ts');
  const serviceJs = lees('public/canonical-service.js');
  const accountTsx = lees('src/identiteit/IdentiteitAccountPagina.tsx');
  const klassiekTsx = lees('src/identiteit/IdentiteitKlassiekMaquette.tsx');
  const motorTs = lees('src/identiteit/maquette/maquette-motor.ts');
  check(
    '7a сторінка /melding містить усі 7 розділів, живий тренажер змахів, пісочницю та 13-ту вкладку в маршрутизаторі й макеті',
    paginaTsx.includes('id=\'melding-modus\'') &&
      paginaTsx.includes('id=\'melding-geometrie\'') &&
      paginaTsx.includes('id=\'melding-veeg\'') &&
      paginaTsx.includes('id=\'melding-kanalen\'') &&
      paginaTsx.includes('id=\'melding-bijlagen\'') &&
      paginaTsx.includes('id=\'melding-ai\'') &&
      paginaTsx.includes('id=\'melding-zandbak\'') &&
      paginaTsx.includes('data-ruimte-actief={ruimte}') &&
      paginaTsx.includes('data-mp-ruimte=') &&
      paginaTsx.includes('data-mp-modus=') &&
      paginaTsx.includes('data-qa-id=\'mp-open-portaal\'') &&
      paginaTsx.includes('data-qa-id=\'mp-zend-test\'') &&
      paginaTsx.includes('data-mp-veeg-trainer') &&
      paginaTsx.includes('const magTechnisch = Boolean(techTypen ?? tech.profiel);') &&
      tabsTs.includes("{ id: 'melding', uk: 'Сповіщення', nl: 'Meldingen' }") &&
      serviceJs.includes("melding:'melding'") &&
      (accountTsx.includes('тринадцяти') || accountTsx.includes('dertien')) &&
      klassiekTsx.includes('melding: Bell') &&
      motorTs.includes('case "melding":'),
  );

  // 8. Сервер, RLS-міграція БД, права ролі, WebSocket-шлюз, ПК-агент і розширення
  const backendEcoTs = lees('backend/meldingen-ecosysteem.ts');
  const backendIdxTs = lees('backend/index.ts');
  const gatewayTs = lees('backend/connectors-gateway.ts');
  const migrSql = lees('migrations/0278_meldingen_ecosysteem.sql');
  const rechtenSql = lees('migrations/rechten.sql');
  const agentMjs = lees('deploy/agent/agent.mjs');
  const extBgJs = lees('extension/background.js');

  check(
    '8a серверний модуль реєструє всі 6 маршрутів під alsGebruiker і просторовою ізоляцією',
    backendEcoTs.includes("'POST /api/owner/meldingen/ecosysteem/profiel'") &&
      backendEcoTs.includes("'POST /api/owner/meldingen/ecosysteem/profiel/opslaan'") &&
      backendEcoTs.includes("'POST /api/owner/meldingen/ecosysteem/stroom'") &&
      backendEcoTs.includes("'POST /api/owner/meldingen/ecosysteem/gebeurtenis'") &&
      backendEcoTs.includes("'POST /api/owner/meldingen/ecosysteem/actie'") &&
      backendEcoTs.includes("'POST /api/owner/meldingen/ecosysteem/ai-ontleden'") &&
      backendEcoTs.includes('alsGebruiker(') &&
      backendEcoTs.includes('WHERE user_id = $1 AND ruimte = $2') &&
      backendIdxTs.includes('meldingEcosysteemRoutes') &&
      backendIdxTs.includes('registreerMeldingHook(verwerkAgentMelding)') &&
      gatewayTs.includes("if (msg?.t === 'melding'"),
  );

  check(
    '8b міграція 0278 визначає 3 таблиці під FORCE ROW LEVEL SECURITY і дозволи mijnruimte_app, а агент і розширення шлють сигнали',
    migrSql.includes('app.melding_ecosysteem_profiel') &&
      migrSql.includes('app.melding_ecosysteem_gebeurtenissen') &&
      migrSql.includes('app.melding_ecosysteem_actie_log') &&
      migrSql.includes('FORCE ROW LEVEL SECURITY') &&
      migrSql.includes("ruimte IN ('prive', 'technisch')") &&
      rechtenSql.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON app.melding_ecosysteem_profiel, app.melding_ecosysteem_gebeurtenissen, app.melding_ecosysteem_actie_log TO mijnruimte_app;') &&
      agentMjs.includes('stuurMelding') &&
      agentMjs.includes("t: 'melding'") &&
      extBgJs.includes('stuurMeldingNaarServer') &&
      extBgJs.includes("t: 'melding'"),
  );

  return einde();
}
