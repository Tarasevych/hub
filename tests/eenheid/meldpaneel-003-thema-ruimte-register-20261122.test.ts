// MELDPANEEL-003 + MELDINGEN-REGISTER-001 (22.11.2026, B-026):
// Випробування повного успадкування палітри й теми сайту (.canonical-chrome), вивільнення >80% простору під картки сповіщень,
// гнучкого 8-стороннього розтягування в обох режимах, незмінної прив’язки до видимого дзвіночка, живої пігулки дзвіночка у «Макеті»
// на id.tarasevych.com/melding, живої Бази 506 типів і кодів дій сповіщень та нормалізації міток випусків GitHub.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACTIE_LABELS, categorieVan, isRuis } from '../../shared/beheer-journaal';
import { normaliseerGebeurtenis, standaardProfiel } from '../../shared/meldingen-ecosysteem';
import { bouwMeldingRegisterOverzicht } from '../../shared/meldingen-register-overzicht';
import { schoonGithubReleaseTag } from '../../backend/uitrol-github-ontvangen';
import { foutTekst } from '../../src/uitrol/fouten';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('meldpaneel-003-thema-ruimte-register-20261122');

  // 1. Палітра й тема сайту (.canonical-chrome) без примусових інлайнових жовтих кольорів
  const portaalTsx = lees('src/meldingen/ecosysteem/MeldingenPortaal.tsx');
  const spelerTsx = lees('src/meldingen/ecosysteem/MeldingBijlageSpeler.tsx');
  const ecoCss = lees('src/meldingen/ecosysteem/meldingen-ecosysteem.css');

  check(
    'thema-1: MeldingenPortaal та MeldingBijlageSpeler монтуються у .canonical-chrome для успадкування теми',
    portaalTsx.includes("document.querySelector<HTMLElement>('.canonical-chrome') || document.body") &&
      spelerTsx.includes("document.querySelector<HTMLElement>('.canonical-chrome') || document.body"),
  );
  check(
    'thema-2: прибрано інлайнове перебивання кольору ctx.accent / ctx.tintAchtergrond',
    !portaalTsx.includes('ctx.accent') && !portaalTsx.includes('ctx.tintAchtergrond'),
  );

  // 2. Звільнення >80% робочого простору під картки сповіщень (висувна шухлядка пошуку/каналів + компактний підвал)
  check(
    'ruimte-1: у шапці є кнопка розкриття пошуку й фільтрів каналів (puls-filter-knop), а шухлядка схована за замовчуванням',
    portaalTsx.includes("data-qa-id='puls-filter-knop'") &&
      portaalTsx.includes('hidden={!filterOpen && !zoek.trim()}') &&
      ecoCss.includes('.mel-filter-lade[hidden]'),
  );
  check(
    'ruimte-2: у підвалі є прямий перехід до живої Бази типів сповіщень (/melding#melding-register)',
    portaalTsx.includes("data-qa-id='puls-open-register'") && portaalTsx.includes('#melding-register'),
  );

  // 3. Гнучке 8-стороннє розтягування в обох режимах та незмінна прив’язка до видимого дзвіночка
  check(
    'formaat-1: startMaat дозволено в обох режимах і ручки .mel-rand більше не приховані для .is-compact-bij-bel',
    !/startMaat[\s\S]{0,120}if\s*\(\s*compactBijBel\s*\|\|/.test(portaalTsx) &&
      !ecoCss.includes('.mel-ecosysteem-portaal.is-compact-bij-bel .mel-rand {\n  display: none;\n}') &&
      ecoCss.includes('.mel-ecosysteem-portaal.is-modus-volledig .mel-rand'),
  );
  check(
    'positie-1: vindZichtbareBel шукає видимий дзвіночок (зокрема у Макеті), а перед volledig зберігається попереднє положення',
    portaalTsx.includes('export function vindZichtbareBel()') &&
      portaalTsx.includes('[data-bel-anker="maquette"]') &&
      portaalTsx.includes('vorigeVoorVolledigRef'),
  );

  // 4. Жива пігулка дзвіночка на https://id.tarasevych.com/melding у вигляді «Макет»
  const maquetteTsx = lees('src/identiteit/maquette/IdentiteitMaquette.tsx');
  const maquetteCss = lees('src/identiteit/maquette/maquette-omlijsting.css');
  check(
    'maquette-bel: у шапку вигляду «Макет» вмонтовано реактивний дзвіночок із лічильником та видимістю шарів сповіщень',
    maquetteTsx.includes('function MaquetteBelKnop') &&
      maquetteTsx.includes("data-bel-anker='maquette'") &&
      maquetteTsx.includes("data-qa-id='maquette-notification-bell'") &&
      maquetteCss.includes('.mel-ecosysteem-portaal,.mel-minimale-pil,.mel-bijlage-portaal'),
  );

  // 5. Єдина класифікована База типів і кодів дій сповіщень (MELDINGEN-REGISTER-001 / B-026)
  const overzicht = bouwMeldingRegisterOverzicht();
  check(
    'register-1: жива база містить >500 класифікованих записів, 20 схем доказів і 0 записів у "overig"',
    overzicht.statistiek.totaal >= 500 &&
      overzicht.statistiek.schemasAantal === 20 &&
      overzicht.statistiek.onbekendOverig === 0,
    JSON.stringify(overzicht.statistiek),
  );
  check(
    'register-2: кожен ключ ACTIE_LABELS належить до предметної категорії (жодного overig)',
    Object.keys(ACTIE_LABELS).every((code) => categorieVan(code) !== 'overig'),
  );
  check(
    'register-3: самодії панелі сповіщень (owner.meldingen.ecosysteem.actie / profiel) відсічені як технічний шум',
    isRuis('owner.meldingen.ecosysteem.actie') && isRuis('owner.meldingen.ecosysteem.profiel'),
  );

  const beleid = JSON.parse(lees('orchestratie/beleid.json')) as {
    regelsVersie: string;
    meldingenRegister?: { code: string; besluit: string; overigToegestaan: number };
  };
  const [bMaj, bMin] = String(beleid.regelsVersie || '0.0.0').split('.').map(Number);
  check(
    'register-4: правило MELDINGEN-REGISTER-001 (B-026, regelsVersie >= 1.7.0) закріплено в beleid.json, AGENTS.md і package.json',
    (bMaj > 1 || (bMaj === 1 && bMin >= 7)) &&
      beleid.meldingenRegister?.code === 'MELDINGEN-REGISTER-001' &&
      beleid.meldingenRegister?.besluit === 'B-026' &&
      beleid.meldingenRegister?.overigToegestaan === 0 &&
      lees('AGENTS.md').includes('MELDINGEN-REGISTER-001') &&
      lees('AGENTENREGELS.nl.md').includes('MELDINGEN-REGISTER-001') &&
      lees('package.json').includes('scripts/meldingen-register-controle.mjs'),
  );

  // 6. Відсутність сміттєвих підписів «hub · app» та механічних підказок клавіш у звичайних картках + відмальовування оглядача бази
  nepBrowser('https://id.tarasevych.com/melding', 'uk');
  const { default: MeldingVeegKaart } = await import('../../src/meldingen/ecosysteem/MeldingVeegKaart');
  const { default: MeldingRegisterVerkenner } = await import('../../src/identiteit/melding/MeldingRegisterVerkenner');

  const profiel = standaardProfiel('prive');
  const kaartGeb = normaliseerGebeurtenis({
    id: 'test-schoon-1',
    ruimte: 'technisch',
    externeSleutel: 'act:test-1',
    kanaal: 'app',
    subdomein: 'hub',
    bron: 'klimop.sleutel.rotatie',
    prioriteit: 'normaal',
    status: 'nieuw',
    titel: 'Планова ротація криптографічної частки вузла Плющ',
    bericht: 'Виконано у випробувальному контурі без збоїв.',
    contextLabel: 'hub · app',
    aangemaaktOp: 1_763_800_000_000,
    bijgewerktOp: 1_763_800_000_000,
  });

  const kaartHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: kaartGeb,
      profiel,
      bijlageVoorkeur: profiel.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        bron: 'intern',
        samenvatting: 'Коротко',
        oorzaak: 'Планово',
        advies: 'Нічого',
        aanbevolenActies: [],
        risico: 'laag',
        opgesteldOp: 1_763_800_000_000,
        geschoond: true,
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  check(
    'kaart-schoon: картка не виводить машинне «hub · app» чи зайву службову підказку про Пробіл',
    !kaartHtml.includes('hub · app') && !kaartHtml.includes('Пробіл відкриває всі поля доказів'),
  );

  const verkennerPriveUk = renderToStaticMarkup(
    createElement(MeldingRegisterVerkenner, { lang: 'uk', magTechnisch: false }),
  );
  const verkennerTechNl = renderToStaticMarkup(
    createElement(MeldingRegisterVerkenner, { lang: 'nl', magTechnisch: true }),
  );

  check(
    'verkenner-render: оглядач бази відмальовується uk/nl та суворо ізолює технічні коди без технічного профілю',
    verkennerPriveUk.includes('id="melding-register"') &&
      verkennerPriveUk.includes('Покриття 100%') &&
      !verkennerPriveUk.includes('Обидва простори') &&
      verkennerTechNl.includes('Dekking 100%') &&
      verkennerTechNl.includes('Beide ruimtes'),
  );

  // 7. Нормалізація введеної мітки випуску GitHub та пояснення REPO_ONGELDIG
  check(
    'github-tag-schoon: приймає дату з пробілом, назву архіву та повне посилання GitHub Release',
    schoonGithubReleaseTag('20261122 122237') === '20261122-122237' &&
      schoonGithubReleaseTag('mijn-ruimte-20261122-122237.tar.gz') === '20261122-122237' &&
      schoonGithubReleaseTag('https://github.com/Tarasevych/hub/releases/tag/20261122-122237') === '20261122-122237',
  );
  check(
    'fout-uitleg: REPO_ONGELDIG має зрозуміле пояснення замість повідомлення про відсутність пояснення',
    foutTekst('uk', 'REPO_ONGELDIG').includes('Tarasevych/hub') &&
      !foutTekst('uk', 'REPO_ONGELDIG').includes('без пояснення'),
  );

  // 8. Перевірка чистоти коду нових і змінених файлів
  const verbodenRe = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  for (const pad of [
    'shared/meldingen-register-overzicht.ts',
    'scripts/meldingen-register-controle.mjs',
    'src/identiteit/melding/MeldingRegisterVerkenner.tsx',
    'src/meldingen/ecosysteem/MeldingenPortaal.tsx',
    'src/identiteit/maquette/IdentiteitMaquette.tsx',
  ]) {
    const inhoud = lees(pad);
    check(`zuiverheid (${pad}): немає заборонених літер та саморобних <svg>`, !verbodenRe.test(inhoud) && !/<svg\b/i.test(inhoud));
  }

  return einde();
}
