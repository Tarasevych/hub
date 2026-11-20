// UPD-011: комплексна перевірка всіх 4 напрямів оновлення:
// 1) динамічна фірмова PNG-картка Telegram із круглим фото конкретного акаунта + 10 категорій дій + 1-екранне вікно;
// 2) персональні відкличні ключі та 3-чинникова довіра (GitHub ↔ MCP ШІ ↔ Сайт);
// 3) реєстр змін випусків і вибіркове відкликання конкретного оновлення без втрати пізніших випусків;
// 4) оновлені правила оркестрації 1.4.18 (B-023) і мовний закон.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BEVESTIG_CATEGORIEEN, categorieSvg, categorieVoorActie } from '../../shared/bevestig-categorie';
import { bouwActieKaartPng } from '../../backend/telegram-aanmelden/actie-kaart';
import { decodeBeeld } from '../../backend/telegram-aanmelden/beeld-decode';
import {
  drieFactorenToegangToegestaan,
  evalueerDrieFactoren,
  herkomstLabel,
  maakUitwisselPakket,
} from '../../shared/uitrol-drie-factoren';
import {
  bouwSelectiefAiOpdracht,
  planSelectiefTerugdraaien,
  vergelijkReleaseBestanden,
  type ReleaseWijzigingItem,
} from '../../shared/uitrol-selectief-terugdraaien';

const WORTEL = process.cwd();
const lees = (rel: string) => fs.readFileSync(path.join(WORTEL, rel), 'utf8');

export async function main(): Promise<number> {
  const testen: Array<[string, () => void]> = [
    ['UPD-011 (1): категорії дій, фірмова PNG-картка 800×400 та кругле фото різних користувачів', () => {
      assert.equal(Object.keys(BEVESTIG_CATEGORIEEN).length, 10);
      assert.equal(categorieVoorActie('uitrol-goedkeuren').id, 'uitrol');
      assert.equal(categorieVoorActie('inloggen').id, 'aanmelden');
      assert.equal(categorieVoorActie('account-verwijderen').id, 'verwijderen');
      assert.equal(categorieVoorActie('sleutelkluis').id, 'kluis');
      assert.equal(categorieVoorActie('beheer', '/api/owner/uitrol/sleutels/aanmaken').id, 'rechten');
      assert.equal(categorieVoorActie('beheer', '/api/owner/uitrol/releases/selectief-aanvragen').id, 'uitrol');
      assert.ok(categorieSvg(BEVESTIG_CATEGORIEEN.uitrol, 24).includes('<svg'));

      const kaart1 = bouwActieKaartPng({
        categorie: 'uitrol',
        taal: 'uk',
        titel: 'Встановлення оновлення 20261120',
        accountNaam: 'Павло Тарасевич',
        accountEmail: 'tarasevych.pavlo@gmail.com',
        toestel: 'Chrome · Android',
        plaats: 'Амстердам, NL',
        tijd: '20.11.2026 08:15',
      });
      assert.equal(kaart1[0], 0x89);
      assert.equal(kaart1[1], 0x50);
      assert.equal(kaart1[2], 0x4e);
      assert.equal(kaart1[3], 0x47);
      const dec1 = decodeBeeld(kaart1);
      assert.ok(dec1);
      assert.equal(dec1.width, 800);
      assert.equal(dec1.height, 400);

      const kaart2 = bouwActieKaartPng({
        categorie: 'rechten',
        taal: 'nl',
        titel: 'Beheerrechten wijzigen',
        accountNaam: 'Olena Kovalenko',
        accountEmail: 'olena@tarasevych.com',
        accountFotoBytes: kaart1,
        toestel: 'Safari · iPhone',
        plaats: 'Utrecht, NL',
        tijd: '20.11.2026 08:20',
      });
      assert.notEqual(Buffer.compare(kaart1, kaart2), 0);
      const dec2 = decodeBeeld(kaart2);
      assert.ok(dec2);
      assert.equal(dec2.width, 800);
      assert.equal(dec2.height, 400);
    }],

    ['UPD-011 (1): захищене вікно Telegram, діалог доступу та надсилання динамічної картки', () => {
      const venster = lees('backend/telegram-aanmelden/venster.ts');
      assert.ok(venster.includes('categorieVoorActie'));
      assert.ok(venster.includes('data-categorie='));
      assert.ok(venster.includes('class="actie-badge"'));
      assert.ok(venster.includes('<details class="meer-details">'));

      const berichten = lees('backend/telegram-aanmelden/berichten.ts');
      assert.ok(berichten.includes('bouwActieKaartMetFoto'));
      assert.ok(berichten.includes('actieKaart'));

      const dialoog = lees('src/platform/bevestig-toegang.tsx');
      assert.ok(dialoog.includes('categorieVoorActie'));
      assert.ok(dialoog.includes('bevestig-toegang-extra'));
    }],

    ['UPD-011 (2): 3-чинникова довіра (GitHub ↔ MCP ШІ ↔ Сайт) і паспорт обміну ключем', () => {
      const volledig = evalueerDrieFactoren({
        githubKoppeling: 'Tarasevych/hub',
        githubGeverifieerd: true,
        traceOk: true,
        mcpAgentSlug: 'gemini',
        mcpGeverifieerd: true,
        regelsGeldig: true,
        regelsVersie: '1.4.18',
        siteAccountActief: true,
        siteGrantActief: true,
        siteSleutelActief: true,
        siteHandtekeningOk: true,
      });
      assert.equal(volledig.volledig, true);
      assert.equal(volledig.aantalOk, 3);
      assert.equal(drieFactorenToegangToegestaan(volledig, 'installeren').toegestaan, true);

      const zonderGithub = evalueerDrieFactoren({
        githubKoppeling: '',
        mcpAgentSlug: 'gemini',
        mcpGeverifieerd: true,
        regelsGeldig: true,
        siteAccountActief: true,
        siteGrantActief: true,
        siteSleutelActief: true,
      });
      assert.equal(zonderGithub.volledig, false);
      assert.equal(zonderGithub.aantalOk, 2);
      const inst = drieFactorenToegangToegestaan(zonderGithub, 'installeren');
      assert.equal(inst.toegestaan, false);
      assert.equal(inst.code, 'DRIE_FACTOREN_ONVOLLEDIG');
      assert.equal(drieFactorenToegangToegestaan(zonderGithub, 'uploaden').toegestaan, true);

      const ingetrokken = evalueerDrieFactoren({
        githubKoppeling: 'Tarasevych/hub',
        githubGeverifieerd: true,
        mcpAgentSlug: 'gemini',
        mcpGeverifieerd: true,
        siteAccountActief: true,
        siteGrantActief: true,
        siteSleutelActief: false,
      });
      assert.equal(drieFactorenToegangToegestaan(ingetrokken, 'uploaden').code, 'SLEUTEL_INGETROKKEN');

      const pakket = maakUitwisselPakket({
        sleutelId: 'id-1',
        prefix: 'mr3f_abcdef1',
        githubKoppeling: 'Tarasevych/hub',
        mcpAgentSlug: 'gemini',
        regelsVersie: '1.4.18',
        verlooptOp: '2026-11-20T09:00:00.000Z',
      });
      assert.ok(pakket.instructieUk.includes('mr3f_abcdef1'));
      assert.equal(herkomstLabel('github', 'uk'), 'GitHub (реліз)');
      assert.equal(herkomstLabel('mcp', 'nl'), 'MCP AI-koppeling');
    }],

    ['UPD-011 (3): пофайлове порівняння й вибіркове відкликання без втрати пізніших випусків', () => {
      const releases: ReleaseWijzigingItem[] = [
        {
          versie: '20261119-170438', voorstelId: 'v1', commitSha: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
          basisVersie: '', basisCommit: '', herkomstKanaal: 'github', herkomstSleutelId: '',
          auteur: 'Павло', agent: 'gemini', taakId: 'UPD-008', samenvattingUk: 'Меню пошти', samenvattingNl: 'Mailmenu',
          drieFactoren: null,
          bestanden: [
            { pad: 'src/mail/menu.tsx', actie: 'gewijzigd' },
            { pad: 'src/shared/sidebar.css', actie: 'gewijzigd' },
          ],
          migraties: [], commits: ['aaaa1111'], status: 'geinstalleerd',
          aangemaaktOp: '2026-11-19T17:00:00Z', geinstalleerdOp: '2026-11-19T17:10:00Z',
          ingetrokkenOp: '', ingetrokkenVersie: '', ingetrokkenReden: '',
        },
        {
          versie: '20261120-003537', voorstelId: 'v2', commitSha: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
          basisVersie: '20261119-170438', basisCommit: 'aaaa1111', herkomstKanaal: 'mcp', herkomstSleutelId: '',
          auteur: 'Павло', agent: 'gemini', taakId: 'UPD-010', samenvattingUk: 'Черга оновлень', samenvattingNl: 'Wachtrij',
          drieFactoren: null,
          bestanden: [
            { pad: 'src/shared/sidebar.css', actie: 'gewijzigd' },
            { pad: 'src/uitrol/Voorbereiders.tsx', actie: 'gewijzigd' },
          ],
          migraties: ['0303_uitrol_wachtrij_en_rechten.sql'], commits: ['bbbb2222'], status: 'geinstalleerd',
          aangemaaktOp: '2026-11-20T00:30:00Z', geinstalleerdOp: '2026-11-20T00:40:00Z',
          ingetrokkenOp: '', ingetrokkenVersie: '', ingetrokkenReden: '',
        },
      ];

      const verg = vergelijkReleaseBestanden(releases, '20261119-170438', '20261120-003537');
      assert.ok(verg);
      assert.deepEqual(verg.alleenInDoel, ['src/mail/menu.tsx']);
      assert.deepEqual(verg.overschrevenLater, [{ pad: 'src/shared/sidebar.css', doorVersies: ['20261120-003537'] }]);
      assert.deepEqual(verg.alleenInLatere, ['src/uitrol/Voorbereiders.tsx']);

      const plan = planSelectiefTerugdraaien(releases, '20261119-170438', '20261120-003537');
      assert.ok(plan);
      assert.equal(plan.behoeftHandmatigeSamenvoeging, true);
      assert.deepEqual(plan.veiligDirectTerugtezetten, ['src/mail/menu.tsx']);
      assert.deepEqual(plan.behoudenLatereVersies, ['20261120-003537']);

      const opdrachtUk = bouwSelectiefAiOpdracht(plan, 'Потрібно повернути стару поведінку меню', 'uk');
      assert.ok(opdrachtUk.includes('20261119-170438'));
      assert.ok(opdrachtUk.includes('20261120-003537'));
      assert.ok(opdrachtUk.includes('src/mail/menu.tsx'));
      assert.ok(opdrachtUk.includes('src/shared/sidebar.css'));
    }],

    ['UPD-011 (4): міграція 0304, правила 1.4.18 (B-023) і дотримання мовного закону', () => {
      const mig = lees('migrations/0304_uitrol_3f_sleutels_en_terugdraai.sql');
      assert.ok(mig.includes('uitrol_beheer_sleutels'));
      assert.ok(mig.includes('uitrol_release_wijzigingen'));
      assert.ok(mig.includes('sleutel_hash text NOT NULL UNIQUE'));
      assert.ok(!/_door\b/.test(mig), 'Міграція 0304 не повинна містити зайвих колонок *_door');

      const beleid = JSON.parse(lees('orchestratie/beleid.json'));
      assert.equal(beleid.regelsVersie, '1.4.18');
      assert.ok(beleid.drieFactoren);
      assert.ok(beleid.selectiefTerugdraaien);
      assert.ok(lees('orchestratie/BESLUITEN.md').includes('## B-023'));
      assert.ok(lees('AGENTS.md').includes('B-023'));
      assert.ok(lees('AGENTENREGELS.nl.md').includes('B-023'));

      const verboden = new RegExp('[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]');
      const bestanden = [
        'shared/bevestig-categorie.ts',
        'shared/uitrol-drie-factoren.ts',
        'shared/uitrol-selectief-terugdraaien.ts',
        'backend/telegram-aanmelden/beeld-decode.ts',
        'backend/telegram-aanmelden/actie-kaart.ts',
        'backend/uitrol-sleutels.ts',
        'backend/uitrol-selectief-terugdraaien.ts',
        'src/uitrol/SleutelsDrieFactoren.tsx',
        'src/uitrol/SelectiefTerugdraaien.tsx',
        'migrations/0304_uitrol_3f_sleutels_en_terugdraai.sql',
      ];
      for (const b of bestanden) {
        assert.equal(verboden.test(lees(b)), false, `Заборонений символ знайдено у ${b}`);
      }
    }],
  ];

  let ok = 0;
  let fouten = 0;
  for (const [naam, fn] of testen) {
    try {
      fn();
      ok += 1;
      console.log(`  ok   ${naam}`);
    } catch (err) {
      fouten += 1;
      console.error(`  FOUT ${naam}:`, (err as Error).message);
    }
  }
  console.log(`${ok}/${testen.length} geslaagd (upd-011-telegram-3f-terugdraai-20261120)`);
  return fouten > 0 ? 1 : 0;
}
