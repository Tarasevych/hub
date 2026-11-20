// UPD-012: комплексний регресійний тест усіх 6 напрямів оновлення:
// 1) база 60 профілів екранів і адаптивне завантаження + фокус кліку + чесна верхня смуга;
// 2) збереження обраного архіву .tar.gz в IndexedDB після обриву + пошта (TTL-кеш, без білої смуги й наїзду кнопок, UX-аудит);
// 3) альтернативні методи у вікнах підтвердження без послаблення безпеки;
// 4) повний цикл подій і вбудованих кнопок Telegram-бота випусків + захищений обіг ключів;
// 5) безпечні інтеграції служб перекладу (Google Translate, DeepL, LibreTranslate, власний вузол) + 4 режими приватності + міграція 0305;
// 6) криптографічне ядро Шаміра k-з-n для розподіленого зберігання, досьє пам’яті проєкту та мовний закон.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bepaalSchermProfiel, SCHERM_PROFIELEN } from '../../shared/scherm-profielen';
import {
  akkoordSleutel,
  standaardPrivacyModus,
  VERTAAL_PRIVACY_MODI,
} from '../../shared/ai-dienst-motor';
import { zuiverTekstVoorExtern, vertaalGoogleTranslate } from '../../backend/vertaal-adapters';
import {
  controleerSpreiding,
  herstelGeheim,
  splitsGeheim,
  type OpslagKnoop,
} from '../../shared/verdeelde-opslag';
import { VERTAAL_REGISTER } from '../../shared/integraties-register';

const WORTEL = process.cwd();
const lees = (rel: string) => fs.readFileSync(path.join(WORTEL, rel), 'utf8');

export async function main(): Promise<number> {
  const testen: Array<[string, () => Promise<void> | void]> = [
    ['UPD-012 (1): база профілів екранів (≥ 45), миттєве визначення класу та адаптивний планувальник', () => {
      assert.ok(SCHERM_PROFIELEN.length >= 45, `Очікувалось >= 45 профілів, отримано ${SCHERM_PROFIELEN.length}`);
      const iphone = bepaalSchermProfiel(390, 844, 3, true);
      assert.equal(iphone.klasse, 'telefoon');
      assert.equal(iphone.bron, 'exact');
      const desktop = bepaalSchermProfiel(1920, 1080, 1, false);
      assert.equal(desktop.klasse, 'breed');
      const onbekend = bepaalSchermProfiel(1111, 777, 1.25, false);
      assert.equal(onbekend.bron, 'dynamisch');

      const adaptief = lees('src/platform/adaptief-laden.ts');
      assert.ok(adaptief.includes('focusOpKlik'));
      assert.ok(adaptief.includes('registreerActiefVerzoek'));
      assert.ok(adaptief.includes('spaarzaam'));
      const nav = lees('src/navigatie-snel.ts');
      assert.ok(nav.includes('abonneerLaadStand'));
      assert.ok(nav.includes('data-achtergrond'));
    }],

    ['UPD-012 (2): IndexedDB-відновлення архіву, пошта (біла смуга, кнопки 44px, TTL-кеш) та UX-аудит', () => {
      const db = lees('src/uitrol/upload-herstel-db.ts');
      assert.ok(db.includes('tsv-uitrol-herstel-v1'));
      assert.ok(db.includes('bewaarUploadConcept'));
      assert.ok(db.includes('leesUploadConcept'));
      assert.ok(db.includes('wisUploadConcept'));

      const upload = lees('src/uitrol/Upload.tsx');
      assert.ok(upload.includes('bewaarUploadConcept'));
      assert.ok(upload.includes('data-ut-hersteld-archief'));

      const achtergrond = lees('src/platform/uitrol-achtergrond-beheer.ts');
      assert.ok(achtergrond.includes('tsv:uitrol-herstel-sessie:v1'));

      const mailMobiel = lees('src/mail-mobiel.css');
      assert.ok(!mailMobiel.includes('right: 6px !important'));
      const mailKop = lees('src/mail/mail-lezer-compact-kop.css');
      assert.ok(mailKop.includes('flex-wrap: wrap') || mailKop.includes('flex-wrap:wrap'));
      const canoniek = lees('src/canoniek-omlijsting.css');
      assert.ok(canoniek.includes('.tsv-skelet'));
      assert.ok(canoniek.includes('aria-busy="true"'));
    }],

    ['UPD-012 (3): альтернативи підтверджень без послаблення безпеки', () => {
      const laag = lees('backend/toegangslaag.ts');
      assert.ok(laag.includes('sterkBijPasskey'));
      const bev = lees('src/telegram-aanmelden/Bevestigen.tsx');
      assert.ok(bev.includes('uitvoerbareAlternatieven'));
      const dialoog = lees('src/platform/bevestig-toegang.tsx');
      assert.ok(dialoog.includes('geenAlternatievenUitleg'));
    }],

    ['UPD-012 (4): повний цикл Telegram-бота випусків (callback_query + 8 подій) та захищений обіг ключів', () => {
      const tg = lees('backend/uitrol-telegram.ts');
      assert.ok(tg.includes('stuurTelegramUitrolGebeurtenis'));
      assert.ok(tg.includes("'callback_query'"));
      assert.ok(tg.includes('ut:status'));
      assert.ok(tg.includes('ut:laatste'));

      const archief = lees('src/uitrol/TelegramArchief.tsx');
      assert.ok(archief.includes('data-ai-geen-actie'));
      assert.ok(archief.includes('data-ai-verborgen'));
      assert.ok(archief.includes('owner_vault_v1'));
    }],

    ['UPD-012 (5): безпечні інтеграції перекладу, режими приватності, очищення таємниць і міграція 0305', async () => {
      assert.equal(Object.keys(VERTAAL_PRIVACY_MODI).length, 4);
      assert.equal(standaardPrivacyModus('google-translate'), 'extern-gezuiverd');
      assert.equal(standaardPrivacyModus('deepl'), 'extern-gezuiverd');
      assert.equal(standaardPrivacyModus('libretranslate'), 'eigen-server');
      assert.ok(VERTAAL_REGISTER.length >= 4);

      const s1 = akkoordSleutel({ soort: 'deepl', aanbieder: null, url: 'https://api-free.deepl.com', model: '', privacyModus: 'extern-gezuiverd' });
      const s2 = akkoordSleutel({ soort: 'deepl', aanbieder: null, url: 'https://api-free.deepl.com', model: '', privacyModus: 'extern-volledig' });
      assert.notEqual(s1, s2, 'Зміна privacyModus має змінювати akkoordSleutel і скидати згоди');

      const vuil = 'Код tvh_secret1234567890123456 та ключ mr3f_abcDEF123456789012345 і рахунок NL91ABNA0417164300 https://example.com/?utm_source=x&token=SECRET999';
      const schoon = zuiverTekstVoorExtern(vuil);
      assert.ok(!schoon.includes('tvh_secret1234567890123456'));
      assert.ok(!schoon.includes('mr3f_abcDEF123456789012345'));
      assert.ok(!schoon.includes('NL91ABNA0417164300'));
      assert.ok(!schoon.includes('SECRET999'));

      await assert.rejects(
        () => vertaalGoogleTranslate({ tekst: 'Привіт', bronTaal: 'uk', doelTaal: 'nl', apiSleutel: 'test-key', privacyModus: 'lokaal-alleen' }),
        /PRIVACY_LOKAAL_ALLEEN/,
      );

      const mig = lees('migrations/0305_vertaal_integraties_privacy.sql');
      assert.ok(mig.includes('privacy_modus'));
      assert.ok(mig.includes('google-translate'));
      assert.ok(mig.includes('deepl'));
      assert.ok(!/_door\b/.test(mig.replace(/--.*$/gm, '')));
    }],

    ['UPD-012 (6): порогове розщеплення Шаміра k-з-n (GF256), політика країн/платформ, досьє пам’яті та мовний закон', () => {
      // Перевірка криптографічного розщеплення й точного відновлення 3-з-5 із різних підмножин часток
      const geheim = new Uint8Array(32);
      for (let i = 0; i < 32; i++) geheim[i] = (i * 19 + 7) & 0xff;
      const delen = splitsGeheim(geheim, 3, 5, 'set-upd012');
      assert.equal(delen.length, 5);

      const hersteldA = herstelGeheim([delen[0], delen[2], delen[4]]);
      const hersteldB = herstelGeheim([delen[1], delen[3], delen[4]]);
      assert.deepEqual(hersteldA, geheim);
      assert.deepEqual(hersteldB, geheim);
      assert.throws(() => herstelGeheim([delen[0], delen[1]]), /TE_WEINIG_DELEN/);

      // Перевірка політики рознесення по країнах і платформах
      const goed: OpslagKnoop[] = [
        { id: 'k1', label: 'R-диск', landCode: 'NL', platform: 'lokaal', aanbieder: 'eigen-pc', actief: true },
        { id: 'k2', label: 'S3 DE', landCode: 'DE', platform: 's3', aanbieder: 'hetzner', actief: true },
        { id: 'k3', label: 'WebDAV CH', landCode: 'CH', platform: 'webdav', aanbieder: 'nextcloud-ch', actief: true },
        { id: 'k4', label: 'Cloud FR', landCode: 'FR', platform: 'cloud', aanbieder: 'scaleway', actief: true },
        { id: 'k5', label: 'QR', landCode: 'OFFLINE', platform: 'offline-qr', aanbieder: 'papier-qr', actief: true },
      ];
      assert.equal(controleerSpreiding(goed, 3, 5).ok, true);

      const slechtLand: OpslagKnoop[] = goed.map((k, idx) => (idx < 3 ? { ...k, landCode: 'DE' } : k));
      assert.equal(controleerSpreiding(slechtLand, 3, 5).ok, false);

      // Досьє пам’яті проєкту і двомовна документація
      assert.ok(fs.existsSync(path.join(WORTEL, 'orchestratie/onderwerpen/verdeelde-versleutelde-opslag.json')));
      assert.ok(fs.existsSync(path.join(WORTEL, 'orchestratie/onderwerpen/vertaling-en-integraties.json')));
      assert.ok(fs.existsSync(path.join(WORTEL, 'orchestratie/onderwerpen/prestatie-en-gebruikservaring.json')));
      assert.ok(fs.existsSync(path.join(WORTEL, 'docs/beveiliging/РОЗПОДІЛЕНЕ-ЗАШИФРОВАНЕ-ЗБЕРІГАННЯ.uk.md')));
      assert.ok(fs.existsSync(path.join(WORTEL, 'docs/beveiliging/VERDEELDE-VERSLEUTELDE-OPSLAG.nl.md')));

      // АБСОЛЮТНИЙ МОВНИЙ ЗАКОН у всіх нових файлах UPD-012
      const verboden = new RegExp('[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]');
      const bestanden = [
        'shared/verdeelde-opslag.ts',
        'shared/scherm-profielen.ts',
        'src/platform/adaptief-laden.ts',
        'src/uitrol/upload-herstel-db.ts',
        'backend/vertaal-adapters.ts',
        'migrations/0305_vertaal_integraties_privacy.sql',
        'orchestratie/onderwerpen/verdeelde-versleutelde-opslag.json',
        'orchestratie/onderwerpen/vertaling-en-integraties.json',
        'orchestratie/onderwerpen/prestatie-en-gebruikservaring.json',
        'docs/beveiliging/РОЗПОДІЛЕНЕ-ЗАШИФРОВАНЕ-ЗБЕРІГАННЯ.uk.md',
        'docs/integraties/ІНТЕГРАЦІЯ-ПЕРЕКЛАДУ.uk.md',
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
      await fn();
      ok += 1;
      console.log(`  ok   ${naam}`);
    } catch (err) {
      fouten += 1;
      console.error(`  FOUT ${naam}:`, (err as Error).message);
    }
  }
  console.log(`${ok}/${testen.length} geslaagd (upd-012-prestatie-ux-tg-vertaal-20261120)`);
  return fouten > 0 ? 1 : 0;
}
